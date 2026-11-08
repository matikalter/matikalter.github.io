/* ======================================================================
   LIST GALLERY — vertical, centered, infinite-loop project navigation.
   Reads config from globals declared in Portfolio.html:
     LIST_COL_W_FRAC, LIST_COL_POS, LIST_ALIGN_IN_COL, LIST_SPACING,
     LIST_MAX_THUMB_H_VH, LIST_HOVER_SCALE, LIST_HOVER_DURATION,
     LIST_INACTIVE_OPACITY, projects, activeFilters
   Exposes on window: ListGallery.{build, destroy, setActiveProjectCallback}
   ====================================================================== */
(function () {
  'use strict';

  /* ── state ─────────────────────────────────────────────────────────── */
  var state = {
    on:           false,
    raf:          null,
    ft:           0,
    items:        [],     /* [{p, w, h}] one entry per filtered project */
    unitH:        0,      /* total height of one set of items + spacings */
    copies:       0,
    centeredCopyIdx: 0,   /* which copy is the "starting" centered one */
    scrollY:      0,
    velY:         0,
    initialOffset: 0,
    vpH:          0,
    columnW:      0,
    activeId:     null,
    onActiveChange: function (p) {}, /* callback set by portfolio.js */
    onProgress:     function (i) {}, /* fired on every frame the scroll moves */
    onRebuilt:      function () {},  /* fired at the end of every build() */
    boundEvents:  false,
    columnX:      0,

    /* snap state — snapsMod[i] is the modded scrollY that places item i at
       screen center; snapStartMod[i] is item i's top within one set. Both
       are recomputed in build(). */
    snapsMod:     [],
    snapStartMod: [],
    snapTarget:   null,  /* full-space scrollY target while snapping, or null */
    lastInputT:   0,     /* timestamp of last user wheel/drag input */
    progressFrac: 0,     /* signed sub-item offset (±0.5) */
    progressIdx:  0,     /* int index of currently-centered item */

    /* marker position smoothing — target is set by positionMarker() each
       frame; current lerps toward it. This gives a smooth glide between
       thumbnails of different widths during snap, while still letting the
       per-frame measurement track hover scale and live transforms. */
    markerXCur:    null,
    markerXTarget: null,

    /* hover-shift state — which .list-item is currently hovered, and how
       much vertical translate to apply to non-hovered neighbours so the
       hovered thumb's scaled bulge doesn't overlap them. */
    hoveredItem:   null,
    hoveredShift:  0
  };

  /* ── physics ── */
  var FRICTION    = 0.86;   /* fallback only; live value derived from smoothing */
  var WHEEL_GAIN  = 0.45;
  var DRAG_GAIN   = 1.0;
  var CLICK_DIST  = 5;

  /* Scroll Smoothing (0..1) → momentum friction. 0 = immediate/linear (a
     wheel nudge resolves in ~1 frame, no glide); 1 = heavily smoothed long
     glide. Decoupled from Scroll Distance: the wheel impulse is normalized by
     (1 - friction) so total distance per nudge stays constant as smoothing
     changes (total inertial travel ∝ impulse / (1 - friction)). */
  function scrollFriction() {
    var s = window.LIST_SCROLL_SMOOTHING;
    if (s == null) s = 0.9;
    s = Math.max(0, Math.min(1, s));
    return 0.95 * s;
  }

  /* ══ STEP SCROLL (Scroll → Method: Step; LIST_SCROLL_MODE === 'step') ══
     The CLASSIC method above is momentum + idle-delay + lerp-to-nearest: every
     scroll pays a glide, then a wait, then a slow-start ease. STEP instead
     resolves each gesture to a PROJECT the moment intent is clear and animates
     there with a critically damped spring:
       · mouse wheel — every notch = one project (rate-limited)
       · trackpad   — a swipe switches once it has travelled LIST_STEP_SENS px;
                      the momentum tail that follows is ignored (deltas decay),
                      while a fresh flick on top of it (deltas rise again)
                      re-arms — so one flick = one project, quick repeated
                      flicks = several
       · drag       — 1:1 while held; on release the release velocity picks
                      the project and the spring starts FROM that velocity
       · keys       — ↑ / ↓ (both methods)
     The spring is integrated ANALYTICALLY (exact closed form for a critically
     damped oscillator), so it is frame-rate independent and stable at any dt,
     and retargeting mid-flight keeps the current velocity — no jolt when a
     second step lands while the first is still moving. Duration = time to
     ~99% settled (LIST_STEP_DURATION s). */
  function stepMode() { return window.LIST_SCROLL_MODE === 'step'; }
  var stp = { on: false, g: 0, target: 0, v: 0 };   /* g = target global index, v = px/ms */
  var MAX_LEAD = 3;   /* steps the target may run ahead of what's on screen */
  var wg = {          /* trackpad gesture tracker */
    lastT: 0, dir: 0, acc: 0, stepped: false, lastStepT: 0,
    s1: 0, s2: 0, peak: 0, trough: Infinity, falling: false
  };
  var GESTURE_GAP_MS = 160;   /* no wheel event for this long = the gesture ended */
  var MOUSE_STEP_MS  = 70;    /* fastest a spun mouse wheel may step */
  var keyT = 0;

  /* global index g (any integer; infinite mode wraps) ↔ full-space scrollY */
  function snapYForGlobal(g) {
    var n = state.items.length;
    if (!n) return 0;
    if (!isInfinite()) { g = Math.max(0, Math.min(n - 1, g)); return state.snapsMod[g]; }
    var cyc = Math.floor(g / n), i = g - cyc * n;
    return cyc * state.unitH + state.snapsMod[i];
  }
  function globalNear(y) {
    var n = state.items.length;
    if (!n || !state.unitH) return 0;
    var t = nearestSnapTarget(y);
    if (!isInfinite()) {
      for (var j = 0; j < n; j++) if (Math.abs(state.snapsMod[j] - t) < 0.5) return j;
      return 0;
    }
    var cyc = Math.floor((t + 0.5) / state.unitH), w = t - cyc * state.unitH, bi = 0, bd = Infinity;
    for (var i = 0; i < n; i++) { var d = Math.abs(state.snapsMod[i] - w); if (d < bd) { bd = d; bi = i; } }
    return cyc * n + bi;
  }
  /* ── GO TO PROJECT (click an INACTIVE title or thumbnail) ──
     Glide the clicked project to the active (centre) slot with the step spring
     — either scroll method — then call cb(true) once it has SETTLED there (the
     caller opens the project). Any other input meanwhile (wheel, drag, keys, a
     rebuild) re-aims the spring, which cancels the trip: cb(false). While a
     trip runs, NAV LOCK is on (window.__navLockId = the target id, html
     .nav-locked): every other title and thumbnail ignores clicks, so nothing
     can interfere with the scroll + page switch. Callers clear the lock in cb. */
  var go = null;   /* { g, cb } */
  function cancelGo() { if (go) { var cb = go.cb; go = null; cb(false); } }
  function goToGlobal(g, cb) {
    var n = state.items.length;
    if (!n) { cb(false); return; }
    if (!isInfinite()) g = Math.max(0, Math.min(n - 1, g));
    cancelGo();
    go = { g: g, cb: cb };
    springTo(g);
    state.lastInputT = performance.now();
  }
  /* the copy of project idx i nearest the current position (infinite wraps) */
  function globalForIdx(i) {
    var n = state.items.length;
    if (!isInfinite()) return i;
    var near = globalNear(state.scrollY), base = near - (((near % n) + n) % n);
    var best = base + i, bd = Math.abs(best - near);
    [base + i - n, base + i + n].forEach(function (g) { var d = Math.abs(g - near); if (d < bd) { bd = d; best = g; } });
    return best;
  }
  /* the global index of a clicked .list-item, from where it sits on screen */
  function globalForEl(el) {
    var th = el.querySelector('.list-thumb') || el, r = th.getBoundingClientRect();
    var mid = state.vpH / 2 + (Number(window.LIST_COLUMN_Y) || 0) + homeLift();
    return globalNear(state.scrollY + (r.top + r.height / 2 - mid));
  }
  function navLock(id) {
    window.__navLockId = id;
    document.documentElement.classList.add('nav-locked');
    clearTimeout(navLock.t);   /* safety net: never leave the page locked */
    navLock.t = setTimeout(navUnlock, 4000);
  }
  function navUnlock() {
    clearTimeout(navLock.t);
    window.__navLockId = null;
    document.documentElement.classList.remove('nav-locked');
  }

  function springTo(g, v) {
    var n = state.items.length;
    if (!n) return;
    if (!isInfinite()) g = Math.max(0, Math.min(n - 1, g));
    if (go && g !== go.g) cancelGo();   /* re-aimed by other input → trip cancelled */
    stp.g = g;
    stp.target = snapYForGlobal(g);
    if (v != null) stp.v = v;
    if (!stp.on) { stp.on = true; if (v == null) stp.v = 0; }
    state.velY = 0;
    state.snapTarget = null;
  }
  /* one project up (-1) / down (+1) from the current target (or from what's
     centred, when idle) — capped so a burst can't run far ahead of the view */
  function stepBy(d) {
    if (!state.items.length) return;
    var near = globalNear(state.scrollY);
    var from = stp.on ? stp.g : near;
    var g = from + d;
    if (g - near > MAX_LEAD) g = near + MAX_LEAD;
    if (near - g > MAX_LEAD) g = near - MAX_LEAD;
    springTo(g);
    state.lastInputT = performance.now();
  }
  function stepSpring(dt) {
    var D = Number(window.LIST_STEP_DURATION);
    if (!(D > 0)) D = 0.5;
    D = Math.max(0.12, D);
    var w = 7 / (D * 1000);                 /* (1 + wD)·e^(−wD) ≈ 0.7% left at D */
    var x0 = state.scrollY - stp.target, v0 = stp.v, e = Math.exp(-w * dt);
    var x = (x0 + (v0 + w * x0) * dt) * e;
    var v = (v0 - w * (v0 + w * x0) * dt) * e;
    if (Math.abs(x) < 0.25 && Math.abs(v) < 0.005) { x = 0; v = 0; stp.on = false; }
    state.scrollY = stp.target + x;
    stp.v = v;
  }
  /* mouse wheel vs trackpad. Mouse notches report wheelDelta in ±120 steps;
     Chrome/Safari/Firefox trackpads report wheelDelta = 3 × deltaY (pixels),
     which can also land on 120 — so that exact ratio is excluded. Firefox
     line-mode (deltaMode 1) is always a wheel. */
  function isMouseWheel(e) {
    if (e.deltaMode === 1) return true;
    var wd = Math.abs(e.wheelDeltaY || 0), dy = Math.abs(e.deltaY || 0);
    if (!wd || wd % 120 !== 0) return false;
    return Math.abs(wd - 3 * dy) > 1;
  }
  function onStepWheel(e) {
    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 40; else if (e.deltaMode === 2) d *= (state.vpH || 800);
    if (!d) return;
    var now = performance.now(), dir = d > 0 ? 1 : -1, a = Math.abs(d);
    state.lastInputT = now;

    if (isMouseWheel(e)) {
      if (now - wg.lastStepT >= MOUSE_STEP_MS) { stepBy(dir); wg.lastStepT = now; }
      wg.lastT = now; wg.dir = dir; wg.stepped = true; wg.acc = 0;
      return;
    }

    if (now - wg.lastT > GESTURE_GAP_MS || dir !== wg.dir) {
      wg.acc = 0; wg.stepped = false; wg.s1 = wg.s2 = 0;
      wg.peak = 0; wg.trough = Infinity; wg.falling = false;
    }
    wg.lastT = now; wg.dir = dir;
    /* 3-event smoothed magnitude — trackpad deltas are noisy (±20%) */
    var s = (a + wg.s1 + wg.s2) / (wg.s2 ? 3 : (wg.s1 ? 2 : 1));
    wg.s2 = wg.s1; wg.s1 = a;

    if (wg.stepped) {
      /* after a step: still the same swipe (rising), or its momentum tail
         (falling)? Only a clear RISE out of a falling tail is a new flick. */
      if (!wg.falling) {
        if (s > wg.peak) wg.peak = s;
        else if (s < wg.peak * 0.8) { wg.falling = true; wg.trough = s; }
        return;
      }
      if (s < wg.trough) { wg.trough = s; return; }
      if (!(s > wg.trough * 1.8 + 4 && now - wg.lastStepT > 120)) return;
      wg.stepped = false; wg.acc = 0;   /* re-armed: fresh flick on top of momentum */
    }
    wg.acc += a;
    var sens = Number(window.LIST_STEP_SENS);
    if (!(sens > 0)) sens = 30;
    if (wg.acc >= sens) {
      stepBy(dir);
      wg.stepped = true; wg.lastStepT = now; wg.acc = 0;
      wg.peak = s; wg.trough = Infinity; wg.falling = false;
    }
  }
  /* drag release (step mode): project the release velocity, pick the project,
     spring there starting from the hand's own speed */
  function releaseStep() {
    if (!state.items.length) return;
    var v = state.velY;                        /* px/ms, scroll direction */
    if (performance.now() - drag.lt > 80) v = 0;   /* held still before letting go */
    v = Math.max(-4, Math.min(4, v));
    var start = drag.startG != null ? drag.startG : globalNear(state.scrollY);
    var g = globalNear(state.scrollY + v * 160);
    if (g === start && Math.abs(v) > 0.35) g = start + (v > 0 ? 1 : -1);   /* short quick flick */
    if (g - start > MAX_LEAD) g = start + MAX_LEAD;
    if (start - g > MAX_LEAD) g = start - MAX_LEAD;
    state.velY = 0;
    springTo(g, v);
  }

  /* ── DOM refs ── */
  var stage, column, track;

  /* current offset of the #home-projects layer (reel intro), published by
     js/home-intro.js. Anything we write as a viewport y INTO an element inside
     that layer must subtract it. */
  function homeLift() {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--home-lift'));
    return isNaN(v) ? 0 : v;
  }

  /* ── computed display dims for one thumbnail ──
     `conformity` (0..1) controls how much thumbnails enforce a uniform width:
       - at 1.0 → all thumbs use the full column width (height varies by ratio)
       - at 0.0 → thumbs use a natural sizing where width = referenceH * ratio
     We linearly blend between these two end states. `maxThumbHvh` then caps
     the height as a % of viewport height; when capped, BOTH width and height
     scale down together so the image is never stretched. */
  function computeDims(ratio, columnW, vpH) {
    var c = (window.LIST_CONFORMITY != null ? window.LIST_CONFORMITY : 1);
    if (c < 0) c = 0; else if (c > 1) c = 1;

    /* reference "natural" height — picked so a 16:9 thumb at conformity=0
       has roughly the same on-screen size as at conformity=1 */
    var refH = columnW / 1.6;

    /* uniform mode dims */
    var wU = columnW, hU = columnW / ratio;
    /* natural mode dims */
    var wN = refH * ratio, hN = refH;

    var w = wU * c + wN * (1 - c);
    var h = hU * c + hN * (1 - c);

    /* height cap: scale both axes equally so we never stretch */
    var maxH = (LIST_MAX_THUMB_H_VH / 100) * vpH;
    if (h > maxH) {
      var k = maxH / h;
      w = w * k;
      h = maxH;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  /* ── automatic aspect ratio ──
     thumbRatio in the project data is now only an OPTIONAL hint (used for the
     very first paint to minimise layout shift). The real ratio is measured
     from each image's natural dimensions on load and cached; once measured we
     re-layout with the true ratio. So you can swap a thumbnail without ever
     touching thumbRatio — it self-corrects. */
  var ratioCache = window.__thumbRatioCache || (window.__thumbRatioCache = {});
  function isVideoSrc(s) { return /\.(mp4|webm|mov|m4v)$/i.test(s || ''); }
  /* a thumb naming a path with a SLASH is read relative to assets/ (shared asset,
     one file referenced by several pages); a bare filename lives in the project's
     own folder. Mirrors assetPath() in portfolio.js. */
  function thumbSrc(p) {
    if (!p.thumb) return '';
    return 'assets/' + (String(p.thumb).indexOf('/') !== -1 ? p.thumb : (p.id + '/' + p.thumb));
  }
  function ratioFor(p) {
    var s = thumbSrc(p);
    if (s && ratioCache[s] != null) return ratioCache[s];
    return p.thumbRatio || 1.778;
  }
  function measureUncached(vis) {
    var srcs = [];
    vis.forEach(function (p) {
      var s = thumbSrc(p);
      if (s && ratioCache[s] == null && srcs.indexOf(s) === -1) srcs.push(s);
    });
    if (!srcs.length) return;
    var pending = srcs.length, changed = false;
    var finish = function () {
      if (--pending === 0 && changed && state.on) build({ preserveScroll: true });
    };
    srcs.forEach(function (s) {
      if (isVideoSrc(s)) {
        var vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.muted = true;
        vid.onloadedmetadata = function () {
          if (vid.videoWidth && vid.videoHeight) {
            ratioCache[s] = vid.videoWidth / vid.videoHeight;
            changed = true;
          }
          finish();
        };
        vid.onerror = finish;
        vid.src = s;
        return;
      }
      var img = new Image();
      img.onload = function () {
        if (img.naturalWidth && img.naturalHeight) {
          ratioCache[s] = img.naturalWidth / img.naturalHeight;
          changed = true;
        }
        finish();
      };
      img.onerror = finish;
      img.src = s;
    });
  }

  /* ── currently visible/filtered projects ──
     OR logic: a project shows if it belongs to ANY selected category
     (filter keys are category keys present in each project's `tags`).
     Respects a custom PROJECT_ORDER (array of ids) when set. */
  function orderedProjects() {
    var order = window.PROJECT_ORDER;
    if (!order || !order.length) return projects.slice();
    var byId = {};
    projects.forEach(function (p) { byId[p.id] = p; });
    var out = [];
    order.forEach(function (id) { if (byId[id]) { out.push(byId[id]); delete byId[id]; } });
    projects.forEach(function (p) { if (byId[p.id]) out.push(p); }); /* append any not listed */
    return out;
  }
  function visibleProjects() {
    var af = window.activeFilters || { all: true };
    var keys = Object.keys(af).filter(function (k) { return k !== 'all'; });
    var hidden = window.PROJECT_HIDDEN || {};
    return orderedProjects().filter(function (p) {
      if (p.hidden) return false;
      if (hidden[p.id]) return false;   /* per-project hide from Tweaks */
      if (af.all || keys.length === 0) return true;
      return keys.some(function (k) { return p.tags.indexOf(k) !== -1; });
    });
  }

  /* ── infinite vs finite scroll ──
     LIST_INFINITE (default true) is the classic wrap-around loop. When false,
     the list has a hard top (item 0 centered) and bottom (last item centered):
     one copy is rendered and scrollY is clamped to [snapMin, snapMax]. */
  function isInfinite() { return window.LIST_INFINITE !== false; }
  function scrollMin() { return state.snapsMod.length ? state.snapsMod[0] : 0; }
  function scrollMax() { return state.snapsMod.length ? state.snapsMod[state.snapsMod.length - 1] : 0; }
  function clampScroll(y) { return Math.max(scrollMin(), Math.min(scrollMax(), y)); }
  /* position used by the transform: wrapped (infinite) or clamped (finite) */
  function moddedScroll(y) {
    if (isInfinite()) return ((y % state.unitH) + state.unitH) % state.unitH;
    return clampScroll(y);
  }

  /* ── public: rebuild list (call on filter change, resize, first render) ── */
  function build(opts) {
    /* never (re)build the list while the GALLERY display is active — the list
       shares #lp-title-stack with the gallery's single-title-on-hover, and a
       stray rebuild (resize, tweak) would repopulate the stack + restart the
       raf, re-centering the first project and hijacking the gallery. */
    if (window.DISPLAY_MODE === 'gallery') return;
    opts = opts || {};
    var preserveScroll = !!opts.preserveScroll;
    var prevScrollY    = state.scrollY || 0;
    destroy();
    stage  = document.getElementById('list-stage');
    column = document.getElementById('list-column');
    track  = document.getElementById('list-track');
    if (!stage || !column || !track) return;

    /* The left panel is RESPONSIVE: --left-w is the panel's ACTUAL on-screen
       width (0 while collapsed into the drawer); --panel-w is its PROPORTIONAL
       width (never 0). We lay the column out against the proportional content
       area (innerWidth - panelW) so the column keeps the SAME window-relative
       position at every scale — including when collapsed — instead of jumping
       left when the toolbar slides away. The column's `left` is relative to the
       stage (which starts at --left-w), so we add back (panelW - stageLeft). */
    var stageLeft = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-w'));
    if (isNaN(stageLeft)) stageLeft = 340;
    var panelW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-w'));
    if (isNaN(panelW)) panelW = stageLeft || 340;
    var leftW = panelW;
    var vpW   = window.innerWidth - leftW;
    var vpH   = window.innerHeight;
    var columnW = Math.round(vpW * LIST_COL_W_FRAC);

    state.vpH     = vpH;
    state.columnW = columnW;

    /* position the column horizontally inside the right-side stage area.
       LIST_COL_POS is a 0..1 slider: 0 = flush left, 1 = flush right,
       0.5 = centered. Replaces the old left/center/right align option. */
    var pos = (window.LIST_COL_POS != null ? Number(window.LIST_COL_POS) : 0.5);
    if (pos < 0) pos = 0; else if (pos > 1) pos = 1;
    var columnX = (panelW - stageLeft) + (vpW - columnW) * pos;
    state.columnX = columnX;
    column.style.left  = columnX + 'px';
    column.style.width = columnW + 'px';

    /* thumbnail alignment within the column */
    var justify = 'center';
    if (LIST_ALIGN_IN_COL === 'left')  justify = 'flex-start';
    if (LIST_ALIGN_IN_COL === 'right') justify = 'flex-end';

    /* compute display dims per filtered project (auto-measured ratio) */
    var vis = visibleProjects();
    var items = vis.map(function (p) {
      var d = computeDims(ratioFor(p), columnW, vpH);
      return { p: p, w: d.w, h: d.h };
    });
    state.items = items;
    /* measure any not-yet-measured thumbnails; re-layouts once they load */
    measureUncached(vis);

    /* update count */
    var cnt = document.getElementById('list-count');
    if (cnt) cnt.textContent = items.length + ' project' + (items.length !== 1 ? 's' : '');

    /* empty state */
    if (!items.length) {
      track.innerHTML = '';
      track.style.transform = 'translateY(0)';
      state.unitH = 0;
      if (state.onActiveChange) state.onActiveChange(null);
      return;
    }

    /* total height of ONE set: sum of item heights + spacing between every item.
       Spacing also added AFTER the last item so the wrap is seamless (last → first). */
    var unitH = 0;
    var snapsMod = [];
    var snapStartMod = [];
    var topInCopy = 0;
    for (var si = 0; si < items.length; si++) {
      snapStartMod.push(topInCopy);
      /* snap point for item i = topInCopy_i + (h_i - h_0)/2 — derived so
         that when scrollY mod unitH equals this, item i lands at vpH/2. */
      snapsMod.push(topInCopy + (items[si].h - items[0].h) / 2);
      topInCopy += items[si].h + LIST_SPACING;
      unitH = topInCopy;
    }
    state.unitH        = unitH;
    state.snapsMod     = snapsMod;
    state.snapStartMod = snapStartMod;

    /* how many copies of the set do we render? enough so that with at minimum
       one full set above and one full set below the visible viewport, scroll
       wraps without ever seeing empty space. */
    var copies = isInfinite() ? Math.max(3, Math.ceil(vpH / unitH) + 2) : 1;
    state.copies = copies;
    state.centeredCopyIdx = isInfinite() ? Math.floor(copies / 2) : 0;

    /* initial offset — places item 0 of the centered copy at viewport center */
    /* initial offset — places item 0 of the centered copy at viewport center,
       shifted by the Column Y tweak (±px from the central resting position). */
    state.initialOffset = vpH / 2 - items[0].h / 2 + (Number(window.LIST_COLUMN_Y) || 0);

    /* reset scroll on rebuild (e.g. after filter change) so first item is centered,
       OR preserve the user's scroll position when this is a tweaks-driven rebuild */
    if (preserveScroll) {
      state.scrollY = prevScrollY;
      state.velY    = 0;
      /* clear activeId so the next updateActive() tick treats the centered
         project as a fresh change and re-fires onActiveChange — this re-seeds
         the mini description + tags immediately on a rebuild (e.g. switching
         back from the gallery display), instead of waiting for the user to
         scroll. The title stack is re-seeded by the rebuilt callback. */
      state.activeId = null;
    } else {
      state.scrollY = 0;
      state.velY    = 0;
      state.activeId = items[0].p.id;
      if (state.onActiveChange) state.onActiveChange(items[0].p);
    }
    state.snapTarget = null;
    state.lastInputT = performance.now();
    stp.on = false; stp.v = 0;   /* geometry changed — any in-flight step target is stale */

    /* render */
    var html = '';
    for (var c = 0; c < copies; c++) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        html +=
          '<div class="list-item" data-id="' + it.p.id + '" data-copy="' + c + '" data-idx="' + i + '"'
          +    ' style="justify-content:' + justify
          +              ';margin-bottom:' + LIST_SPACING + 'px"'
          +    '>'
          +    '<div class="list-thumb" style="width:' + it.w + 'px;height:' + it.h + 'px">'
          +    '<div class="list-thumb-media">'
          +    (it.p.thumb
                 ? (isVideoSrc(it.p.thumb)
                      ? '<video src="' + thumbSrc(it.p) + '" autoplay muted loop playsinline preload="metadata" draggable="false"></video>'
                      : '<img src="' + thumbSrc(it.p) + '" alt="' + it.p.title + '" draggable="false">')
                 : '')
          +    '</div>'
          +    '</div>'
          +  '</div>';
      }
    }
    track.innerHTML = html;
    state.appliedId = undefined;   /* fresh nodes: re-apply .is-active */
    state.lastTY = null;

    applyTransform();
    bindEvents();
    /* set the active thumb SYNCHRONOUSLY (before the first paint) so the
       centered thumbnail is never briefly styled as inactive (dimmed/
       desaturated) in the frame gap before the rAF tick runs updateActive.
       On a preserveScroll rebuild activeId was cleared, so this both fixes the
       flicker AND re-fires onActiveChange to re-seed the mini/tags. */
    updateActive();
    positionMarker();
    updateScrollMarkers();

    state.on = true;
    state.ft = performance.now();
    state.raf = requestAnimationFrame(tick);

    /* notify listeners that a (re)build finished with the FINAL item set —
       portfolio.js rebuilds the title-stack rows here so they can never be
       left stale by an async image-measure relayout or an init-order race. */
    if (state.onRebuilt) state.onRebuilt();
  }

  /* ── RESIZE-in-place: update thumb sizes + snaps WITHOUT rewriting innerHTML,
     so <video> thumbnails (e.g. Playground) aren't torn down + recreated (which
     re-fetches/re-decodes and flickers). Returns false when the existing DOM
     can't be reused (item set / copy coverage changed) → caller falls back to a
     full build(). Only used on resize; tweaks/filter changes still go through
     build() (they may change align, order, spacing, etc.). */
  function relayout() {
    if (window.DISPLAY_MODE === 'gallery') return false;
    if (!state.on) return false;
    stage  = document.getElementById('list-stage');
    column = document.getElementById('list-column');
    track  = document.getElementById('list-track');
    if (!stage || !column || !track) return false;

    /* same content set as currently rendered? */
    var vis = visibleProjects();
    if (!vis.length) return false;
    if (vis.length !== state.items.length) return false;
    for (var vi = 0; vi < vis.length; vi++) {
      if (!state.items[vi] || state.items[vi].p.id !== vis[vi].id) return false;
    }

    /* column geometry (same math as build) */
    var stageLeft = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-w'));
    if (isNaN(stageLeft)) stageLeft = 340;
    var panelW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-w'));
    if (isNaN(panelW)) panelW = stageLeft || 340;
    var vpW = window.innerWidth - panelW;
    var vpH = window.innerHeight;
    var columnW = Math.round(vpW * LIST_COL_W_FRAC);
    var pos = (window.LIST_COL_POS != null ? Number(window.LIST_COL_POS) : 0.5);
    if (pos < 0) pos = 0; else if (pos > 1) pos = 1;
    var columnX = (panelW - stageLeft) + (vpW - columnW) * pos;

    /* recompute per-item dims + snaps */
    var items = vis.map(function (p) {
      var d = computeDims(ratioFor(p), columnW, vpH);
      return { p: p, w: d.w, h: d.h };
    });
    var unitH = 0, snapsMod = [], snapStartMod = [], topInCopy = 0;
    for (var si = 0; si < items.length; si++) {
      snapStartMod.push(topInCopy);
      snapsMod.push(topInCopy + (items[si].h - items[0].h) / 2);
      topInCopy += items[si].h + LIST_SPACING;
      unitH = topInCopy;
    }

    /* the DOM must already hold exactly copies × items nodes AND still provide
       enough vertical coverage at the new (smaller) unitH — else fall back. */
    var copies = state.copies || 1;
    var neededCopies = isInfinite() ? Math.max(3, Math.ceil(vpH / unitH) + 2) : 1;
    if (copies < neededCopies) return false;
    var nodes = track.children;
    if (nodes.length !== copies * items.length) return false;

    /* commit new geometry */
    state.vpH = vpH;
    state.columnW = columnW;
    state.columnX = columnX;
    state.items = items;
    state.unitH = unitH;
    state.snapsMod = snapsMod;
    state.snapStartMod = snapStartMod;
    state.initialOffset = vpH / 2 - items[0].h / 2 + (Number(window.LIST_COLUMN_Y) || 0);
    column.style.left  = columnX + 'px';
    column.style.width = columnW + 'px';

    /* resize each existing thumb in place (data-idx maps node → item) */
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      var idx  = Number(node.getAttribute('data-idx')) || 0;
      var it   = items[idx];
      if (!it) return false;
      var thumb = node.querySelector('.list-thumb');
      if (thumb) { thumb.style.width = it.w + 'px'; thumb.style.height = it.h + 'px'; }
    }

    /* an in-flight step keeps its project, re-aimed at the new geometry */
    if (stp.on) stp.target = snapYForGlobal(stp.g);
    measureUncached(vis);
    applyTransform();
    updateActive();
    positionMarker();
    updateScrollMarkers();
    return true;
  }

  /* ── apply current scroll position to the track transform ── */
  function applyTransform() {
    if (!track || !state.unitH) return;

    /* track total height = copies * unitH.
       Place such that copy `centeredCopyIdx` start sits at initialOffset
       when scrollY = 0, with wrap-around modulo unitH. */
    var modded = moddedScroll(state.scrollY);
    var baseY  = state.initialOffset - state.centeredCopyIdx * state.unitH;
    var y      = baseY - modded;
    /* write only on change (the loop runs every frame, mostly at rest) */
    if (y !== state.lastTY) { state.lastTY = y; track.style.transform = 'translate3d(0,' + y + 'px,0)'; }

    updateActive();
  }

  /* ── determine which item is closest to viewport center, update left panel ── */
  function updateActive() {
    if (!state.items.length) return;

    var vh = state.vpH;
    var target = vh / 2 + (Number(window.LIST_COLUMN_Y) || 0);

    /* compute, in track-relative space, where center-screen falls.
       trackY = baseY - modded. Screen Y of item: trackY + itemTopInTrack + h/2.
       set: screenY = target  →  itemTopInTrack + h/2 = target - trackY = modded - baseY + target
       But simpler — iterate visible items in the centered copy (and neighbors) and pick closest. */
    var bestId = null;
    var bestDist = Infinity;

    var modded = moddedScroll(state.scrollY);
    var baseY  = state.initialOffset - state.centeredCopyIdx * state.unitH;
    var trackY = baseY - modded;

    /* only check the 3 copies around the centered one — enough to find center */
    var c0 = Math.max(0, state.centeredCopyIdx - 1);
    var c1 = Math.min(state.copies - 1, state.centeredCopyIdx + 1);

    for (var c = c0; c <= c1; c++) {
      var topInCopy = 0;
      for (var i = 0; i < state.items.length; i++) {
        var it = state.items[i];
        var itemTopInTrack = c * state.unitH + topInCopy;
        var centerScreen   = trackY + itemTopInTrack + it.h / 2;
        var d              = Math.abs(centerScreen - target);
        if (d < bestDist) {
          bestDist = d;
          bestId   = it.p.id;
        }
        topInCopy += it.h + LIST_SPACING;
      }
    }

    if (bestId && bestId !== state.activeId) {
      state.activeId = bestId;
      var p = state.items.find(function (it) { return it.p.id === bestId; });
      if (p && state.onActiveChange) state.onActiveChange(p.p);
      positionMarker();
    }

    /* visual active marker — toggle class only when changed. Inactive
       styling (opacity / saturation / tint) is now PURE CSS via the
       :not(.is-active) selector, so we don't need to set inline opacity. */
    /* only when the active project actually changed — this ran (remove + re-add
       on every copy) EVERY frame, invalidating style on the whole list */
    if (track && state.appliedId !== state.activeId) {
      state.appliedId = state.activeId;
      var prev = track.querySelectorAll('.list-item.is-active');
      for (var k = 0; k < prev.length; k++) prev[k].classList.remove('is-active');
      var actives = track.querySelectorAll('.list-item[data-id="' + state.activeId + '"]');
      for (var m = 0; m < actives.length; m++) {
        actives[m].classList.add('is-active');
      }
    }
  }

  /* ── SNAP HELPERS ──
     Given any scrollY, find the nearest item-center snap target. Returns
     a value in full scrollY space (not modded). */
  function nearestSnapTarget(y) {
    var n = state.items.length;
    if (!n || !state.unitH) return y;
    if (!isInfinite()) {
      /* finite: snap to the nearest item-center within the clamped range */
      var yc = clampScroll(y);
      var bestI = 0, bd = Infinity;
      for (var j = 0; j < n; j++) {
        var dd = Math.abs(yc - state.snapsMod[j]);
        if (dd < bd) { bd = dd; bestI = j; }
      }
      return state.snapsMod[bestI];
    }
    var modded = ((y % state.unitH) + state.unitH) % state.unitH;
    var cycles = Math.floor(y / state.unitH);
    /* find segment [snapsMod[i], snapsMod[i+1]) containing modded; the
       "next" snap after the last item wraps to snapsMod[0] + unitH. */
    var bestI = 0;
    for (var i = 0; i < n; i++) {
      var lo = state.snapsMod[i];
      var hi = (i === n - 1) ? state.snapsMod[0] + state.unitH : state.snapsMod[i + 1];
      if (modded >= lo && modded < hi) {
        var mid = (lo + hi) / 2;
        if (modded < mid) bestI = i;
        else if (i === n - 1) { bestI = 0; cycles += 1; }
        else bestI = i + 1;
        break;
      }
    }
    return cycles * state.unitH + state.snapsMod[bestI];
  }

  /* Compute the float index of the currently-centered item.
     Returns { idx (int), frac (signed -0.5..0.5), idxFloat } */
  function computeProgress() {
    var n = state.items.length;
    if (!n || !state.unitH) return { idx: 0, frac: 0, idxFloat: 0 };
    if (!isInfinite()) {
      /* finite: no wrap. Clamp ends to first/last item. */
      var yc = clampScroll(state.scrollY);
      if (yc <= state.snapsMod[0])     return { idx: 0,     frac: 0, idxFloat: 0 };
      if (yc >= state.snapsMod[n - 1]) return { idx: n - 1, frac: 0, idxFloat: n - 1 };
      for (var fi = 0; fi < n - 1; fi++) {
        var flo = state.snapsMod[fi], fhi = state.snapsMod[fi + 1];
        if (yc >= flo && yc < fhi) {
          var fmid = (flo + fhi) / 2;
          if (yc <= fmid) {
            var fd = fmid - flo;
            var ff = fd > 0 ? (yc - flo) / (2 * fd) : 0;
            return { idx: fi, frac: ff, idxFloat: fi + ff };
          } else {
            var fd2 = fhi - fmid;
            var ff2 = fd2 > 0 ? (yc - fmid) / (2 * fd2) : 0;
            return { idx: fi + 1, frac: -0.5 + ff2, idxFloat: (fi + 1) + (-0.5 + ff2) };
          }
        }
      }
      return { idx: 0, frac: 0, idxFloat: 0 };
    }
    var modded = ((state.scrollY % state.unitH) + state.unitH) % state.unitH;
    /* find which snap segment we're in */
    for (var i = 0; i < n; i++) {
      var lo = state.snapsMod[i];
      var hi = (i === n - 1) ? state.snapsMod[0] + state.unitH : state.snapsMod[i + 1];
      if (modded >= lo && modded < hi) {
        var mid = (lo + hi) / 2;
        if (modded <= mid) {
          /* closer to i — frac ∈ [0, 0.5] */
          var d = mid - lo;
          return { idx: i, frac: d > 0 ? (modded - lo) / (2 * d) : 0, idxFloat: i + (d > 0 ? (modded - lo) / (2 * d) : 0) };
        } else {
          /* closer to i+1 — frac negative when expressed relative to i+1 */
          var nextI = (i + 1) % n;
          var d2 = hi - mid;
          var f2 = d2 > 0 ? (modded - mid) / (2 * d2) : 0; /* 0..0.5 */
          /* express as offset from nextI: f ∈ [-0.5, 0] */
          return { idx: nextI, frac: -0.5 + f2, idxFloat: nextI + (-0.5 + f2) };
        }
      }
    }
    return { idx: 0, frac: 0, idxFloat: 0 };
  }

  /* Reposition the marker glyph so it sits to the immediate left of the
     currently-centered thumbnail. Glyph X depends on (a) column position,
     (b) thumb width, (c) within-column alignment. */
  /* Reposition the marker glyph so it sits to the immediate left of the
     currently-centered thumbnail. We MEASURE the active thumb's live
     bounding rect each call — this way the marker tracks any transform
     in effect, including the hover scale (so it follows the thumb in/out
     of hover smoothly). Called every animation frame. */
  function positionMarker() {
    var marker = document.getElementById('list-marker');
    if (!marker || !stage || !track) return;
    var glyph = (window.MARKER_GLYPH != null ? window.MARKER_GLYPH : '▶');
    if (marker.textContent !== glyph) marker.textContent = glyph;

    if (!state.activeId) { marker.classList.remove('is-visible'); return; }

    /* Pick the copy of the active item closest to viewport center — the
       infinite list has several, we want the physically-visible one. */
    var matches = track.querySelectorAll('.list-item[data-id="' + state.activeId + '"]');
    if (!matches.length) { marker.classList.remove('is-visible'); return; }

    var vpMid  = state.vpH / 2 + (Number(window.LIST_COLUMN_Y) || 0);
    var bestEl = null, bestD = Infinity, bestRect = null;
    for (var i = 0; i < matches.length; i++) {
      var thumb = matches[i].querySelector('.list-thumb');
      if (!thumb) continue;
      var r  = thumb.getBoundingClientRect();
      var cy = r.top + r.height / 2;
      var d  = Math.abs(cy - vpMid);
      if (d < bestD) { bestD = d; bestEl = thumb; bestRect = r; }
    }
    if (!bestEl) { marker.classList.remove('is-visible'); return; }

    /* stage's viewport-left == --left-w (0 while the toolbar is collapsed).
       Must NOT use `|| 340`: parseFloat('0px') is 0 (falsy) and would wrongly
       fall back to 340, shoving the marker 340px left on collapse. */
    var leftW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-w'));
    if (isNaN(leftW)) leftW = 340;
    var thumbLeftInStage  = bestRect.left  - leftW;
    var thumbRightInStage = bestRect.right - leftW;

    var markerBoxW = marker.offsetWidth || 14;
    /* Glyph → Rotation: a quarter-turned glyph is as WIDE as its box is tall.
       It spins about its centre, so shift `left` by half the difference to
       keep the gap measured from its visible edge. */
    var quarter = Math.abs(Math.round((Number(window.MARKER_ROTATE) || 0) / 90)) % 2 === 1;
    var markerW = quarter ? (marker.offsetHeight || markerBoxW) : markerBoxW;
    var rotAdj  = (markerBoxW - markerW) / 2;
    var gap = (window.MARKER_GAP != null ? Number(window.MARKER_GAP) : 16);
    /* marker sits to the LEFT of the thumb by default, or to the RIGHT when
       MARKER_ALIGN === 'right'. The gap is always measured from the thumb on
       the chosen side. */
    var targetX = (window.MARKER_ALIGN === 'right')
      ? (thumbRightInStage + gap - rotAdj)
      : (thumbLeftInStage - gap - markerW - rotAdj);

    /* set target; tick loop's adaptive-lerp moves markerXCur → targetX */
    state.markerXTarget = targetX;
    if (state.markerXCur == null) state.markerXCur = targetX;
    marker.classList.add('is-visible');
  }

  /* Optional connector line: a 1px rule from the marker to the chosen edge of
     the active title in the title stack. Measured in viewport coords each
     frame (so it tracks the marker glide AND the title-stack position) and
     drawn on a position:fixed element. Hidden unless MARKER_LINE_SHOW. */
  function updateMarkerLine() {
    var line = document.getElementById('list-marker-line');
    if (!line) return;
    if (!window.MARKER_LINE_SHOW || !state.activeId) {
      line.classList.remove('is-visible');
      return;
    }
    var marker = document.getElementById('list-marker');
    var row = document.querySelector('.lp-title-row[data-id="' + state.activeId + '"]');
    if (!marker || !row || !marker.classList.contains('is-visible')) {
      line.classList.remove('is-visible');
      return;
    }
    var mR = marker.getBoundingClientRect();
    var rR = row.getBoundingClientRect();
    /* which edge of the title to anchor to */
    var titleX = (window.MARKER_LINE_EDGE === 'right') ? rR.right : rR.left;
    /* connect to the marker's CENTER (not its edge) so the line runs underneath
       the glyph with no visible gap — glyphs like ▶ don't fill their own box
       edge-to-edge, so stopping at mR.left/right left a sliver showing. */
    /* Glyph X offset nudges the glyph only (like Y below): the line keeps
       ending at the UN-nudged centre, so the glyph's ink can be moved onto it */
    var markerX = mR.left + mR.width / 2 - (Number(window.MARKER_GLYPH_X) || 0) + (titleX <= mR.left ? 2 : -2);
    var x1 = Math.min(titleX, markerX);
    var x2 = Math.max(titleX, markerX);
    /* "Touch toolbar edge": pull the line's LEFT end out to the toolbar's edge
       divider (the panel's right border sits at --left-w; 0 when the toolbar is
       collapsed) so it spans the gap between that divider and the title stack.
       isNaN-guarded, NOT `|| 340`, so a real 0 (collapsed) is respected. */
    if (window.MARKER_LINE_TO_EDGE) {
      var lw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-w'));
      if (!isNaN(lw)) x1 = Math.min(x1, lw);
    }
    /* the line element lives INSIDE #home-projects, whose transform (the reel
       intro slide) is applied on top of whatever we write here — so subtract
       the published lift to keep the measured viewport y correct. */
    var y  = mR.top + mR.height / 2 - homeLift();
    /* the marker box is nudged by Center marker → Glyph Y offset; undo it
       here so the line stays on the row centre and only the glyph moves */
    y -= (Number(window.MARKER_GLYPH_Y) || 0);
    /* Round to the nearest whole CSS pixel before writing it. A fractional
       top (from getBoundingClientRect at a non-integer effective zoom, e.g.
       windowed/Present mode) otherwise anti-aliases the hairline across two
       rows, reading as thicker/blurrier than the panel's static border-right
       (which the browser always hints crisply). Pairing this with border-top
       (see CSS) instead of a filled height:1px box gives the same crisp,
       always-minimum-thickness rendering as that divider. */
    /* Line → Thickness: centre a thicker rule on the row (a 1px line keeps
       its exact old placement) */
    var lwPx = Number(window.MARKER_LINE_W) || 1;
    y = Math.round(y - (lwPx - 1) / 2);
    line.style.left  = x1 + 'px';
    line.style.width = Math.max(0, x2 - x1) + 'px';
    line.style.top   = y + 'px';
    line.classList.add('is-visible');
  }

  /* Scroll-affordance markers: the DOWN glyph fades in only when the list is
     scrolled fully to the TOP, the UP glyph only when fully at the BOTTOM
     (finite mode only — the infinite loop has no extremes). Both sit centered
     over the thumbnail column at the bottom of the stage, each with its own
     X/Y offset and glyph from Tweaks. */
  function updateScrollMarkers() {
    var down = document.getElementById('scroll-marker-down');
    var up   = document.getElementById('scroll-marker-up');
    if (!down || !up) return;

    /* glyph text (live) */
    var dg = (window.SCROLL_MARKER_DOWN_GLYPH != null ? window.SCROLL_MARKER_DOWN_GLYPH : '\u25bc');
    var ug = (window.SCROLL_MARKER_UP_GLYPH   != null ? window.SCROLL_MARKER_UP_GLYPH   : '\u25b2');
    var dInner = down.firstElementChild, uInner = up.firstElementChild;
    if (dInner && dInner.textContent !== dg) dInner.textContent = dg;
    if (uInner && uInner.textContent !== ug) uInner.textContent = ug;

    /* position: horizontally centered on the thumb column + X offset; Y from
       the bottom of the viewport. Markers are now position:fixed (shared with
       the gallery display), so X must be VIEWPORT-relative — add the stage's
       left inset (--left-w) back onto the stage-relative column center. */
    var stageLeftPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-w'));
    if (isNaN(stageLeftPx)) stageLeftPx = 0;
    var baseX = stageLeftPx + state.columnX + state.columnW / 2;
    down.style.left   = (baseX + (Number(window.SCROLL_MARKER_DOWN_X) || 0)) + 'px';
    down.style.bottom = (Number(window.SCROLL_MARKER_DOWN_Y) || 0) + 'px';
    /* UP marker is anchored from the TOP */
    up.style.left     = (baseX + (Number(window.SCROLL_MARKER_UP_X) || 0)) + 'px';
    up.style.top      = (Number(window.SCROLL_MARKER_UP_Y) || 0) + 'px';
    up.style.bottom   = 'auto';

    /* size + animation amount/speed (live) */
    var size = (Number(window.SCROLL_MARKER_SIZE) || 14) + 'px';
    var amt  = (Number(window.SCROLL_MARKER_ANIM_SIZE) || 0) + 'px';
    var dur  = (Number(window.SCROLL_MARKER_ANIM_SPEED) || 1.4) + 's';
    down.style.fontSize = size; up.style.fontSize = size;
    down.style.setProperty('--smk-amt', amt);  up.style.setProperty('--smk-amt', amt);
    down.style.setProperty('--smk-dur', dur);  up.style.setProperty('--smk-dur', dur);

    /* yoyo animation toggle */
    var anim = (window.SCROLL_MARKER_ANIM !== false);
    down.classList.toggle('anim', anim);
    up.classList.toggle('anim', anim);

    /* visibility — only when the list can actually scroll, and only in finite
       mode (the infinite loop has no top/bottom). */
    var canScroll = !isInfinite() && (scrollMax() - scrollMin() > 1);
    if (!state.items.length || !canScroll) {
      down.classList.remove('is-visible');
      up.classList.remove('is-visible');
      return;
    }
    var THRESH = 24;
    down.classList.toggle('is-visible', state.scrollY <= scrollMin() + THRESH);
    up.classList.toggle('is-visible',   state.scrollY >= scrollMax() - THRESH);
  }

  /* Set the per-item --list-thumb-shift CSS variable so non-hovered
     neighbours visually shift up/down to preserve the gap relative to the
     hovered (scaled) thumb. Layout is NOT affected (we use transform), so
     snap math and gallery flow stay correct. Items before the hovered one
     shift UP by hoveredH*(scale-1)/2; items after shift DOWN by the same. */
  function applyHoverShift(item) {
    if (!track) return;
    var items = track.querySelectorAll('.list-item');
    if (!item) {
      for (var i = 0; i < items.length; i++) {
        items[i].style.removeProperty('--list-thumb-shift');
      }
      state.hoveredItem  = null;
      state.hoveredShift = 0;
      return;
    }
    var thumb = item.querySelector('.list-thumb');
    if (!thumb) return;
    var hScale = (window.LIST_HOVER_SCALE != null ? Number(window.LIST_HOVER_SCALE) : 1.05);
    var shift  = thumb.offsetHeight * (hScale - 1) / 2;
    state.hoveredItem  = item;
    state.hoveredShift = shift;

    for (var j = 0; j < items.length; j++) {
      var other = items[j];
      if (other === item) {
        other.style.removeProperty('--list-thumb-shift');
        continue;
      }
      var rel = item.compareDocumentPosition(other);
      var isAfter = !!(rel & Node.DOCUMENT_POSITION_FOLLOWING);
      other.style.setProperty('--list-thumb-shift', (isAfter ? shift : -shift) + 'px');
    }
  }

  /* ── animation loop ── */
  function tick(now) {
    if (!state.on) return;
    var dt = Math.min(now - state.ft, 50);
    state.ft = now;

    var snapEnabled = (window.LIST_SNAP_ENABLED !== false);
    /* "Snap time" = the idle DELAY (in seconds) after the user stops scrolling
       before the list snaps to the nearest project. Now it reads as a literal
       time: 0 = snap immediately, higher = longer pause first. Range 0..2s, so
       one end is an instant snap trigger and the other a slow, deliberate one. */
    var snapTime = (window.LIST_SNAP_TIME != null ? window.LIST_SNAP_TIME : 0.15);
    var SNAP_IDLE_MS = Math.round(Math.max(0, Math.min(2, snapTime)) * 1000);
    var VEL_THRESH   = 0.02;  /* if speed below this, treat as idle */

    if (drag.on) {
      /* dragging — nothing else moves */
      state.snapTarget = null;
    } else if (stp.on) {
      /* STEP spring (step method; also arrow keys + go-to-project in either method) */
      stepSpring(dt);
      /* a go-to-project trip has settled on its project → hand back (the
         caller opens it). Fired after this frame's transform is applied below. */
      if (!stp.on && go && go.g === stp.g) {
        var goCb = go.cb; go = null;
        setTimeout(function () { goCb(true); }, 0);
      }
    } else if (Math.abs(state.velY) > VEL_THRESH) {
      /* user just gave input; let inertia play out, no snap yet */
      state.scrollY += state.velY * dt;
      var decay = Math.pow(scrollFriction(), dt / (1000 / 60));
      state.velY *= decay;
      state.snapTarget = null;
    } else {
      state.velY = 0;
      if (snapEnabled && (now - state.lastInputT) > SNAP_IDLE_MS) {
        /* idle long enough — set or maintain a snap target, then lerp */
        if (state.snapTarget == null) {
          state.snapTarget = nearestSnapTarget(state.scrollY);
        }
        var k = (window.LIST_SNAP_SPEED != null ? window.LIST_SNAP_SPEED : 0.18);
        /* frame-rate-independent lerp: stronger steps for longer dt */
        var stepK = 1 - Math.pow(1 - k, dt / (1000 / 60));
        var diff  = state.snapTarget - state.scrollY;
        state.scrollY += diff * stepK;
        if (Math.abs(diff) < 0.5) {
          state.scrollY = state.snapTarget;
          state.snapTarget = null;
        }
      }
    }

    /* finite mode: hard-clamp the scroll so the list can't run past its top
       (item 0 centered) or bottom (last item centered). */
    if (!isInfinite()) {
      var flo2 = scrollMin(), fhi2 = scrollMax();
      if (state.scrollY < flo2) { state.scrollY = flo2; state.velY = 0; stp.v = 0; if (state.snapTarget != null && state.snapTarget < flo2) state.snapTarget = flo2; }
      else if (state.scrollY > fhi2) { state.scrollY = fhi2; state.velY = 0; stp.v = 0; if (state.snapTarget != null && state.snapTarget > fhi2) state.snapTarget = fhi2; }
    }

    applyTransform();

    /* every frame, compute marker target from active thumb's live rect.
       SMOOTHING STRATEGY (adaptive lerp):
         - small diffs (≤3px, e.g. during a thumb's hover scale tween) → SNAP
           markerXCur to target directly, so it stays glued to the thumb edge
           with zero lag.
         - large diffs (when activeId switches mid-snap to a thumb of
           different width) → LERP smoothly so the marker glides across.
       This gives both "locked to current thumb during hover" AND "smooth
       glide between thumbnails" behaviour. */
    positionMarker();
    if (state.markerXTarget != null) {
      if (state.markerXCur == null) state.markerXCur = state.markerXTarget;
      var mDiff = state.markerXTarget - state.markerXCur;
      var mAbs  = Math.abs(mDiff);
      var SNAP_THRESHOLD = 3;
      if (mAbs <= SNAP_THRESHOLD) {
        state.markerXCur = state.markerXTarget;
      } else {
        var mLerpK = 0.18;
        var mStep  = 1 - Math.pow(1 - mLerpK, dt / (1000 / 60));
        state.markerXCur += mDiff * mStep;
      }
      var markerEl = document.getElementById('list-marker');
      if (markerEl) markerEl.style.left = state.markerXCur + 'px';
    }

    updateMarkerLine();
    updateScrollMarkers();

    /* report progress to listeners (e.g. title stack) */
    if (state.onProgress) {
      var pr = computeProgress();
      state.progressIdx  = pr.idx;
      state.progressFrac = pr.frac;
      state.onProgress(pr);
    }

    state.raf = requestAnimationFrame(tick);
  }

  /* ── events ── */
  var drag = { on: false, sy: 0, ly: 0, lt: 0, d: 0, downTarget: null, startG: null };

  function bindEvents() {
    if (state.boundEvents) return;
    state.boundEvents = true;

    /* wheel — attached to window so scrolling anywhere on the page
       (including the left panel + over the title stack) drives the list.
       Events that originate inside the Tweaks panel or other scroll regions
       are ignored so their internal scrolling still works. */
    window.addEventListener('wheel', function (e) {
      /* only when home view is the currently-active route */
      var homeView = document.getElementById('home-view');
      if (!homeView || homeView.style.display === 'none') return;

      /* in GALLERY display mode the list isn't running — let the gallery stage
         scroll natively (don't preventDefault) and don't touch list velocity,
         so scrolling never switches the active project (only hover does). */
      if (window.DISPLAY_MODE === 'gallery') return;

      /* ignore wheels inside the Tweaks panel (it scrolls internally) and
         inside any other element marked as a wheel-capture region (none yet) */
      var t = e.target;
      if (t && t.closest && t.closest('#tweaks-root')) return;

      e.preventDefault();
      if (stepMode()) { onStepWheel(e); return; }
      cancelGo();
      stp.on = false;   /* classic wheel takes over from a key-driven step */
      var spd = (window.LIST_SCROLL_SPEED != null ? window.LIST_SCROLL_SPEED : 4);
      var fr  = scrollFriction();
      /* normalized by (1 - fr) so Scroll Distance is independent of Smoothing */
      state.velY += e.deltaY * 0.0087 * spd * (1 - fr);
      state.velY  = Math.max(-12, Math.min(12, state.velY));
      state.lastInputT = performance.now();
      state.snapTarget = null;
    }, { passive: false });

    /* mouse drag */
    stage.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;   /* left-click only — ignore right/middle */
      e.preventDefault();
      onDown(e.clientY, e.target);
    });
    document.addEventListener('mousemove', function (e) {
      /* SAFETY: cancel the drag if the button was released outside the window
         (a missed mouseup) so moving a free mouse no longer scrolls the list. */
      if (drag.on && !(e.buttons & 1)) { onUp(e.clientX, e.clientY); return; }
      if (drag.on) onMove(e.clientY);
    });
    document.addEventListener('mouseup', function (e) {
      if (drag.on) onUp(e.clientX, e.clientY);
    });
    window.addEventListener('blur', function () {
      if (drag.on) onUp(-1, -1);
    });

    /* touch */
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) onDown(e.touches[0].clientY, e.target);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (drag.on && e.touches.length === 1) {
        e.preventDefault();
        onMove(e.touches[0].clientY);
      }
    }, { passive: false });
    document.addEventListener('touchend', function (e) {
      if (drag.on && e.changedTouches.length) {
        onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    });

    /* hover-driven neighbour shift — delegated mouseover/leave so we don't
       need a listener per item (the list rebuilds on filter/resize). */
    stage.addEventListener('mouseover', function (e) {
      if (drag.on) return;
      var item = e.target && e.target.closest ? e.target.closest('.list-item') : null;
      if (item !== state.hoveredItem) applyHoverShift(item);
    });
    stage.addEventListener('mouseleave', function () {
      applyHoverShift(null);
    });

    /* scroll markers are clickable while shown: down = next project, up =
       previous (same step as the arrow keys) */
    document.addEventListener('click', function (e) {
      var m = e.target && e.target.closest ? e.target.closest('#scroll-marker-down, #scroll-marker-up') : null;
      if (!m || !m.classList.contains('is-visible')) return;
      if (!state.on || !state.items.length || window.DISPLAY_MODE === 'gallery' || drag.on) return;
      stepBy(m.id === 'scroll-marker-down' ? 1 : -1);
    });

    /* ↑ / ↓ — previous / next project, in BOTH methods (always the eased step
       spring). Ignored while typing, inside the Tweaks panel, off the home
       list, mid reel-intro, or with a modifier held. Held keys auto-repeat at
       most every 110ms (the lead cap keeps it from running ahead). */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!state.on || !state.items.length || window.DISPLAY_MODE === 'gallery') return;
      var hv = document.getElementById('home-view');
      if (!hv || hv.style.display === 'none') return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') ||
                (t.closest && t.closest('#tweaks-root')))) return;
      if (window.HomeIntro && window.HomeIntro.progress && window.HomeIntro.progress() < 0.999) return;
      e.preventDefault();
      var now = performance.now();
      if (e.repeat && now - keyT < 110) return;
      keyT = now;
      if (drag.on) return;
      stepBy(e.key === 'ArrowDown' ? 1 : -1);
    });
  }

  function onDown(y, target) {
    drag.on = true;
    drag.sy = drag.ly = y;
    drag.lt = performance.now();
    drag.d  = 0;
    drag.downTarget = target;
    /* step method: the project the drag starts from (an in-flight step's
       target counts — grabbing mid-glide means "from where it was going") */
    drag.startG = stp.on ? stp.g : globalNear(state.scrollY);
    /* grabbing the list mid go-to-project trip: let the trip finish if this
       turns out to be a click (onUp), cancel it only once it becomes a drag */
    drag.goHeld = !!go;
    if (!go) { stp.on = false; stp.v = 0; }
    state.velY = 0;
    state.lastInputT = performance.now();
    state.snapTarget = null;
    /* clear any hover shift while dragging so the column doesn't visually
       jitter as the cursor crosses items */
    applyHoverShift(null);
  }

  function onMove(y) {
    if (drag.goHeld) {
      if (Math.abs(y - drag.sy) < CLICK_DIST) return;   /* still a click */
      drag.goHeld = false; cancelGo(); stp.on = false; stp.v = 0;
      drag.ly = y;
    }
    var dy  = y - drag.ly;
    var now = performance.now();
    var dt  = now - drag.lt || 1;

    /* scroll opposite to drag direction so content tracks the cursor */
    state.scrollY -= dy * DRAG_GAIN;
    drag.d        += Math.abs(dy);
    state.velY     = -dy / dt * DRAG_GAIN;
    drag.ly = y;
    drag.lt = now;
    state.lastInputT = now;
  }

  function onUp(x, y) {
    drag.on = false;
    /* a click while a go-to-project trip runs: nav is locked — ignore it and
       let the trip carry on */
    if (drag.goHeld) { drag.goHeld = false; return; }
    if (stepMode()) {
      if (drag.d < CLICK_DIST) { state.velY = 0; springTo(drag.startG != null ? drag.startG : globalNear(state.scrollY)); }
      else releaseStep();
    }
    if (drag.d < CLICK_DIST) {
      /* treat as click — the project under the cursor */
      var el = document.elementFromPoint(x, y);
      var item = el && el.closest ? el.closest('.list-item') : null;
      if (item && item.dataset.id) clickItem(item);
    }
  }
  /* ACTIVE thumbnail → open at once. INACTIVE thumbnail → (if List Display →
     Inactive thumbnails → Inactive selectable is on) glide it to the active
     slot, nav locked for the trip — it does NOT open; the user clicks it again
     once it's active. Off → inactive thumbs ignore the click. */
  function clickItem(item) {
    if (window.__navLockId) return;
    var id = item.dataset.id;
    var g = globalForEl(item), cur = stp.on ? stp.g : globalNear(state.scrollY);
    if (g === cur) { window.openProject(id); return; }
    if (window.LIST_INACTIVE_SELECTABLE === false) return;
    navLock(id);
    goToGlobal(g, function () { navUnlock(); });
  }

  /* ── destroy ── */
  function destroy() {
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
    state.on = false;
    cancelGo();   /* a trip in flight can't finish now — its cb unlocks nav */
  }

  /* ── resize: rebuild (positions are normalized so this is safe) ── */
  var _resizeT = false;
  window.addEventListener('resize', function () {
    if (_resizeT) return;
    _resizeT = true;
    requestAnimationFrame(function () {
      _resizeT = false;
      if (document.getElementById('home-view') &&
          !document.getElementById('home-view').classList.contains('hidden') &&
          window.DISPLAY_MODE !== 'gallery') {
        /* resize thumbs IN PLACE when possible (no innerHTML rewrite) so <video>
           tiles don't flicker; fall back to a full rebuild only when the DOM
           can't be reused (item set / copy coverage changed). */
        if (!relayout()) build({ preserveScroll: true });
      }
    });
  });

  /* ── expose ── */
  window.ListGallery = {
    build: build,
    destroy: destroy,
    setActiveProjectCallback: function (fn) { state.onActiveChange = fn; },
    setProgressCallback: function (fn) { state.onProgress = fn; },
    setRebuiltCallback: function (fn) { state.onRebuilt = fn; },
    repositionMarker: function () { positionMarker(); },
    /* is the list parked at its very top? (used by the reel intro to decide
       when an upward scroll should slide the reel back down) */
    atTop: function () {
      if (!state.items.length) return true;
      /* step method: not "at top" while a step is gliding there, or while the
         swipe that stepped is still streaming (its momentum tail must not
         slide the reel back down — that takes a NEW upward gesture) */
      if (stepMode() && (stp.on || (wg.stepped && performance.now() - wg.lastT < GESTURE_GAP_MS))) return false;
      if (!isInfinite()) return state.scrollY <= scrollMin() + 1.5;
      var pr = computeProgress();
      return pr.idx === 0 && Math.abs(pr.frac) < 0.02;
    },
    /* kill momentum + any pending snap (the reel intro took the wheel over) */
    stop: function () {
      state.velY = 0;
      state.snapTarget = null;
      state.lastInputT = performance.now();
      /* step method: the reel intro is consuming this gesture — mark it as
         already used, so its momentum tail reaching the list after the reveal
         lands doesn't also step a project (a new flick still does) */
      var now = performance.now();
      wg.stepped = true; wg.lastT = now; wg.lastStepT = now; wg.acc = 0;
      wg.peak = Infinity; wg.falling = false; wg.trough = Infinity;
    },
    getItems: function () { return state.items.map(function (it) { return it.p; }); },
    /* glide project `id` to the active slot, then cb(true) once settled —
       cb(false) if other input cancels it. Returns false if it can't start. */
    goToProject: function (id, cb) {
      if (!state.on) return false;
      for (var k = 0; k < state.items.length; k++) {
        if (state.items[k].p.id === id) { goToGlobal(globalForIdx(k), cb || function () {}); return true; }
      }
      return false;
    },
    navLock: navLock,
    navUnlock: navUnlock
  };
})();
