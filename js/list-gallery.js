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

  /* ── DOM refs ── */
  var stage, column, track;

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
  function thumbSrc(p) { return p.thumb ? ('assets/' + p.id + '/' + p.thumb) : ''; }
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
                      ? '<video src="assets/' + it.p.id + '/' + it.p.thumb + '" autoplay muted loop playsinline preload="metadata" draggable="false"></video>'
                      : '<img src="assets/' + it.p.id + '/' + it.p.thumb + '" alt="' + it.p.title + '" draggable="false">')
                 : '')
          +    '</div>'
          +    '</div>'
          +  '</div>';
      }
    }
    track.innerHTML = html;

    applyTransform();
    bindEvents();
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

  /* ── apply current scroll position to the track transform ── */
  function applyTransform() {
    if (!track || !state.unitH) return;

    /* track total height = copies * unitH.
       Place such that copy `centeredCopyIdx` start sits at initialOffset
       when scrollY = 0, with wrap-around modulo unitH. */
    var modded = moddedScroll(state.scrollY);
    var baseY  = state.initialOffset - state.centeredCopyIdx * state.unitH;
    var y      = baseY - modded;
    track.style.transform = 'translateY(' + y + 'px)';

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
    if (track) {
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

    var markerW = marker.offsetWidth || 14;
    var gap = (window.MARKER_GAP != null ? Number(window.MARKER_GAP) : 16);
    /* marker sits to the LEFT of the thumb by default, or to the RIGHT when
       MARKER_ALIGN === 'right'. The gap is always measured from the thumb on
       the chosen side. */
    var targetX = (window.MARKER_ALIGN === 'right')
      ? (thumbRightInStage + gap)
      : (thumbLeftInStage - gap - markerW);

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
    var markerX = mR.left + mR.width / 2 + (titleX <= mR.left ? 2 : -2);
    var x1 = Math.min(titleX, markerX);
    var x2 = Math.max(titleX, markerX);
    var y  = mR.top + mR.height / 2;
    /* Round to the nearest whole CSS pixel before writing it. A fractional
       top (from getBoundingClientRect at a non-integer effective zoom, e.g.
       windowed/Present mode) otherwise anti-aliases the hairline across two
       rows, reading as thicker/blurrier than the panel's static border-right
       (which the browser always hints crisply). Pairing this with border-top
       (see CSS) instead of a filled height:1px box gives the same crisp,
       always-minimum-thickness rendering as that divider. */
    y = Math.round(y);
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
    /* "Snap time" responsiveness (0..1): high = snaps almost immediately after
       the user stops, low = long pause first. Maps to an idle-debounce window
       of up to 600ms (value 1 → ~0ms, value 0 → 600ms). */
    var snapTime = (window.LIST_SNAP_TIME != null ? window.LIST_SNAP_TIME : 0.8);
    var SNAP_IDLE_MS = Math.round((1 - Math.max(0, Math.min(1, snapTime))) * 600);
    var VEL_THRESH   = 0.02;  /* if speed below this, treat as idle */

    if (drag.on) {
      /* dragging — nothing else moves */
      state.snapTarget = null;
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
      if (state.scrollY < flo2) { state.scrollY = flo2; state.velY = 0; if (state.snapTarget != null && state.snapTarget < flo2) state.snapTarget = flo2; }
      else if (state.scrollY > fhi2) { state.scrollY = fhi2; state.velY = 0; if (state.snapTarget != null && state.snapTarget > fhi2) state.snapTarget = fhi2; }
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
  var drag = { on: false, sy: 0, ly: 0, lt: 0, d: 0, downTarget: null };

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
      if (drag.on) onMove(e.clientY);
    });
    document.addEventListener('mouseup', function (e) {
      if (drag.on) onUp(e.clientX, e.clientY);
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
  }

  function onDown(y, target) {
    drag.on = true;
    drag.sy = drag.ly = y;
    drag.lt = performance.now();
    drag.d  = 0;
    drag.downTarget = target;
    state.velY = 0;
    state.lastInputT = performance.now();
    state.snapTarget = null;
    /* clear any hover shift while dragging so the column doesn't visually
       jitter as the cursor crosses items */
    applyHoverShift(null);
  }

  function onMove(y) {
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
    if (drag.d < CLICK_DIST) {
      /* treat as click — open project under cursor */
      var el = document.elementFromPoint(x, y);
      var item = el && el.closest ? el.closest('.list-item') : null;
      if (item && item.dataset.id) {
        window.openProject(item.dataset.id);
      }
    }
  }

  /* ── destroy ── */
  function destroy() {
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
    state.on = false;
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
        build({ preserveScroll: true });
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
    getItems: function () { return state.items.map(function (it) { return it.p; }); }
  };
})();
