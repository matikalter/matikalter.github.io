/* ======================================================================
   PORTFOLIO — view management, left-panel rendering, hash routing, init.
   Loads after list-gallery.js and playground-gallery.js.

   Routes (hash-based, no reloads — instant nav, linkable URLs):
     #/                 home
     #/about            about
     #/project/<id>     project page (standard or playground layout)

   Reads from window globals: projects, filterDefs, LOGO, BIO_SHORT,
   BIO_SHORT_ALT, BIO_LONG. Exposes window.{goHome, openAbout, openProject}.
   ====================================================================== */
(function () {
  'use strict';

  /* On phones the mobile app (js/mobile-app.js) owns everything — skip the
     entire desktop portfolio so the two don't fight over routing/DOM. */
  if (window.__MOBILE__) return;

  /* ── filter state ── */
  window.activeFilters = { all: true };

  /* current active project id on home view (whichever thumb is centered) */
  var currentHomeActiveId = null;
  /* last-seen progress payload, used to re-render the title stack when tweaks
     change (row height / blur / etc.) without waiting for next scroll frame */
  var lastProgress = null;

  /* ── TITLE STACK ─────────────────────────────────────────────────────
     Renders one row per filtered project. Each frame, given the gallery's
     float-index progress, each row gets a Y transform + opacity + blur
     based on its signed distance (in row-heights) from the center slot.
     Items further than ~2.5 rows away are clipped by stack overflow.
     Cyclic wrapping mirrors the gallery's infinite loop. */

  function rebuildTitleStackRows() {
    var stack = document.getElementById('lp-title-stack');
    if (!stack) return;
    var items = (window.ListGallery && window.ListGallery.getItems) ?
                window.ListGallery.getItems() : [];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="lp-title-row" data-idx="' + i
           +  '" data-id="' + items[i].id + '"><span class="lp-title-inner">' + items[i].title + '</span></div>';
    }
    stack.innerHTML = html;

    /* click a title (delegated handler, bound once):
         ACTIVE (centred) title → open that project at once.
         INACTIVE title (only clickable when Inactive titles → Inactive
         selectable is on) → glide the list so it becomes the active one. It
         does NOT open — the user clicks it again once it's active. Nav is
         locked for the glide (every other title and thumbnail inert — see
         renderTitleStack + ListGallery.navLock) and unlocked once it lands, or
         if other input (wheel, drag, keys) cancels the glide. */
    if (!stack._clickBound) {
      stack._clickBound = true;
      stack.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('.lp-title-row') : null;
        if (!row || !row.dataset.id || window.__navLockId) return;
        var id = row.dataset.id, LG = window.ListGallery;
        if (row.classList.contains('is-centered') || !LG || !LG.goToProject) { window.openProject(id); return; }
        LG.navLock(id);
        if (!LG.goToProject(id, function () { LG.navUnlock(); })) LG.navUnlock();
      });
    }
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }

  function renderTitleStack(progress) {
    lastProgress = progress;
    var stack = document.getElementById('lp-title-stack');
    if (!stack) return;
    var items = (window.ListGallery && window.ListGallery.getItems) ?
                window.ListGallery.getItems() : [];
    var n = items.length;
    var rows = stack.children;
    /* rebuild rows if the count OR the order changed (filter / reorder) */
    var mismatch = rows.length !== n;
    if (!mismatch) {
      for (var c = 0; c < n; c++) {
        if (rows[c].dataset.id !== items[c].id) { mismatch = true; break; }
      }
    }
    if (mismatch) {
      rebuildTitleStackRows();
      rows = stack.children;
      if (rows.length !== n) return;
    }
    if (!n) return;

    var rowH = (window.TITLE_STACK_ROW_H != null ? window.TITLE_STACK_ROW_H : 44);
    var b1   = (window.TITLE_BLUR_1      != null ? window.TITLE_BLUR_1      : 3);
    var b2   = (window.TITLE_BLUR_2      != null ? window.TITLE_BLUR_2      : 7);
    var b3   = (window.TITLE_BLUR_3      != null ? window.TITLE_BLUR_3      : 11);
    var o1   = (window.TITLE_OPACITY_1   != null ? window.TITLE_OPACITY_1   : 0.75);
    var o2   = (window.TITLE_OPACITY_2   != null ? window.TITLE_OPACITY_2   : 0.5);
    var o3   = (window.TITLE_OPACITY_3   != null ? window.TITLE_OPACITY_3   : 0.28);
    var s1   = (window.TITLE_SIZE_1      != null ? window.TITLE_SIZE_1      : 1);
    var s2   = (window.TITLE_SIZE_2      != null ? window.TITLE_SIZE_2      : 1);
    var s3   = (window.TITLE_SIZE_3      != null ? window.TITLE_SIZE_3      : 1);
    /* per-side values (Inactive titles → 1st/2nd/3rd above / below), built in
       applyTweaks; the shared b/o/s above are only the fallback */
    var SIDES = window.TITLE_SIDES || null;

    var centerFloat = progress.idx + progress.frac;
    var stackLeft = null, panelEdge = 0, EDGE_GAP = 12;   /* hover edge guard (measured lazily, once per frame) */

    for (var i = 0; i < n; i++) {
      var raw = i - centerFloat;
      /* cyclic wrap: when scrolling past last, item[0] continues seamlessly.
         Skipped in finite mode (LIST_INFINITE === false) so the stack has a
         clear top and bottom that match the gallery's hard limits. */
      if (n > 1 && window.LIST_INFINITE !== false) {
        while (raw >  n / 2) raw -= n;
        while (raw < -n / 2) raw += n;
      }
      var absD = Math.abs(raw);
      var op, blur, sc;
      /* ABOVE the active slot (raw < 0 → drawn higher) or BELOW it. Both sides
         start from the active look at 0, so crossing the centre is seamless. */
      if (SIDES) {
        var sd = raw < 0 ? SIDES.up : SIDES.down;
        b1 = sd.b[0]; b2 = sd.b[1]; b3 = sd.b[2];
        o1 = sd.o[0]; o2 = sd.o[1]; o3 = sd.o[2];
        s1 = sd.s[0]; s2 = sd.s[1]; s3 = sd.s[2];
      }
      if (absD <= 1) {
        op   = _lerp(1,  o1, absD);
        blur = _lerp(0,  b1, absD);
        sc   = _lerp(1,  s1, absD);
      } else if (absD <= 2) {
        var t2 = absD - 1;
        op   = _lerp(o1, o2, t2);
        blur = _lerp(b1, b2, t2);
        sc   = _lerp(s1, s2, t2);
      } else if (absD <= 3) {
        var t3 = absD - 2;
        op   = _lerp(o2, o3, t3);
        blur = _lerp(b2, b3, t3);
        sc   = _lerp(s2, s3, t3);
      } else {
        var t4 = Math.min(1, (absD - 3) / 0.5);
        op   = _lerp(o3, 0, t4);
        blur = b3;
        sc   = s3;
      }
      var row = rows[i];
      /* alignment about the stack's x anchor is done with translateX so the
         row stays max-content (unlimited title width): left=0, center=-50%,
         right=-100%. The Y is the row's stacked offset, centered via -50%. */
      var ax = (window.TITLE_ALIGN === 'center') ? '-50%'
             : (window.TITLE_ALIGN === 'right')  ? '-100%' : '0px';
      /* + size by distance (1st/2nd/3rd size), about the alignment origin set
         in CSS (.lp-title-row transform-origin = --title-origin) */
      row.style.transform = 'translate(' + ax + ', calc(' + (raw * rowH) + 'px - 50%))'
                          + (Math.abs(sc - 1) > 0.0005 ? ' scale(' + sc.toFixed(4) + ')' : '');
      /* set values via CSS custom properties so the :hover override (which
         uses !important) can interrupt them cleanly. The default state has
         no CSS transition on opacity/filter — these vars get re-set every
         frame during scroll, and a transition would lag. The transition is
         applied ONLY in the :hover rule, so it fires on hover-in/out. */
      row.style.setProperty('--row-opacity', op.toFixed(3));
      row.style.setProperty('--row-filter', blur > 0.01 ? ('blur(' + blur.toFixed(2) + 'px)') : 'none');
      /* mark the centered (active) row so only IT enlarges on hover */
      var centered = absD < 0.5;
      /* HOVER-SCALE EDGE GUARD: the hover scale grows from the title's CENTRE,
         so a long title at a big scale pushes its left edge past the toolbar —
         and the toolbar (.left, its own fixed layer above #home-projects) paints
         over it, cutting the title off. Shift the hovered title right by exactly
         the overlap (--title-hover-shift, used by the hover rules) so it stays
         EDGE_GAP clear of the toolbar; centred growth is untouched otherwise. */
      if (centered && row.firstElementChild) {
        var inner = row.firstElementChild, iw = inner.offsetWidth;
        var hs = (window.TITLE_HOVER_SCALE != null ? window.TITLE_HOVER_SCALE : 1.08);
        var shift = 0;
        if (hs > 1 && iw) {
          if (stackLeft == null) {
            stackLeft = stack.getBoundingClientRect().left;
            var lw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-w'));
            panelEdge = isNaN(lw) ? 0 : lw;
          }
          var rowL = stackLeft + (ax === '-50%' ? -iw / 2 : (ax === '-100%' ? -iw : 0));
          var grownL = rowL + iw / 2 - (iw * hs) / 2;
          shift = Math.max(0, panelEdge + EDGE_GAP - grownL);
        }
        var sv = shift ? shift.toFixed(1) + 'px' : '0px';
        if (inner._hs !== sv) { inner._hs = sv; inner.style.setProperty('--title-hover-shift', sv); }
      }
      if (centered) { if (!row.classList.contains('is-centered')) row.classList.add('is-centered'); }
      else if (row.classList.contains('is-centered')) row.classList.remove('is-centered');
      /* Pointer-events: only rows within visible range (±3 slots) are
         hoverable / clickable. Beyond that, opacity is 0 but the row would
         still cover the buttons below the stack — disable pointer events
         entirely. When TITLE_INACTIVE_SELECTABLE is false, ONLY the centered
         (active) row is hoverable/clickable — inactive titles are inert. */
      var selectable = (window.TITLE_INACTIVE_SELECTABLE === false)
        ? (absD < 0.5)
        : (absD <= 3);
      /* NAV LOCK (a go-to-project trip from a clicked inactive title/thumb):
         every title but the destination is inert until the trip ends */
      if (window.__navLockId) selectable = (row.dataset.id === window.__navLockId);
      row.style.pointerEvents = selectable ? 'auto' : 'none';
    }
  }

  /* ── social SVGs ── */
  var svgIG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';
  var svgLI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="3"/><line x1="8" y1="11" x2="8" y2="16"/><line x1="8" y1="8" x2="8" y2="8.5" stroke-width="2"/><path d="M12 11v5M12 11a3 3 0 0 1 6 0v5"/></svg>';
  var svgEM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>';

  function socialRowHTML(bioHTML, bioClass, aboutOnclick, aboutLabel, bioStyle) {
    return '<div class="identity">'
      + '<div class="' + bioClass + '"' + (bioStyle ? ' style="' + bioStyle + '"' : '') + '>' + bioHTML + '</div>'
      + '<div class="social-row">'
      + '<a href="https://www.instagram.com/matikalter" target="_blank" class="social-icon">' + svgIG + '</a>'
      + '<a href="https://www.linkedin.com/in/matikalter/" target="_blank" class="social-icon">' + svgLI + '</a>'
      + '<a href="mailto:mkalterr@gmail.com" class="social-icon">' + svgEM + '</a>'
      + '<span class="about-link" onclick="' + aboutOnclick + '">' + aboutLabel + '</span>'
      + '</div></div>';
  }

  /* Home-view variant: just the social icons + about link + a divider, as one
     unit ("Social+About"). Absolutely positioned via .lp-social-about so it can
     be moved with its own Y tweak; the bio is a separate movable block below. */
  function socialAboutHTML(aboutOnclick, aboutLabel, aboutKind) {
    return '<div class="lp-social">'
      + '<div class="social-row">'
      + '<a href="https://www.instagram.com/matikalter" target="_blank" class="social-icon">' + svgIG + '</a>'
      + '<a href="https://www.linkedin.com/in/matikalter/" target="_blank" class="social-icon">' + svgLI + '</a>'
      + '<a href="mailto:mkalterr@gmail.com" class="social-icon">' + svgEM + '</a>'
      + '</div></div>'
      + (aboutOnclick
          ? '<div class="lp-about">'
            + '<span class="about-link" data-kind="' + (aboutKind || '') + '" onclick="' + aboutOnclick + '">' + aboutLabel + '</span>'
            + '</div>'
          : '');
  }
  /* Link label markup for the home ('+ about') / about-page ('× close') states.
     The WHOLE string is user-editable (glyph included); a short symbol first
     token keeps its slightly smaller, lighter treatment. */
  function linkLabelHTML(raw, glyphSize) {
    var s = String(raw == null ? '' : raw);
    var m = s.match(/^(\S{1,2})\s+([\s\S]*)$/);
    if (m && !/[0-9a-z]/i.test(m[1])) {
      return '<span style="font-size:' + glyphSize + 'px;font-weight:300;line-height:1">'
           + m[1] + '</span>&nbsp;' + m[2];
    }
    return s;
  }
  function aboutLinkHTML() {
    return linkLabelHTML(window.ABOUT_LABEL != null ? window.ABOUT_LABEL : '+ about', 15);
  }
  function closeLinkHTML() {
    return linkLabelHTML(window.CLOSE_LABEL != null ? window.CLOSE_LABEL : '\u00d7 close', 14);
  }

  /* Divider: its own absolutely-positioned block (home + about views) with an
     independent Y (--divider-y) and show/hide (--divider-display). */
  function dividerHTML() {
    return '<div class="lp-divider"></div>';
  }

  /* Toolbar gif: pinned to the bottom of the left panel on the home + about
     views (absent on project pages). Position/size/align/visibility all driven
     by CSS vars from the "Toolbar" tweaks. */
  function gifHTML() {
    /* single hero image (LTX_Shapes_Single_1080) with idle + hover states. The
       .lp-gif-stack + .lp-gif-media.is-current wrapper is kept so all Hero Image
       controls (size via --gif-size, blur/hue/mask/hover via ".lp-gif a") apply. */
    return '<div class="lp-gif"><a href="#/project/playground" aria-label="View Playground">'
         +   '<div class="lp-gif-stack">'
         +     '<video class="lp-gif-media is-current lp-gif-big" style="transition:none" src="assets/playground/LTX_Shapes_Single_1080.mp4" muted playsinline autoplay preload="auto"></video>'
         +     '<video class="lp-gif-media lp-gif-big" style="transition:none" src="assets/playground/LTX_Shapes_Single_1080.mp4" muted playsinline preload="auto"></video>'
         +   '</div>'
         +   '<span class="lp-gif-hot"></span>'
         + '</a></div>';
  }

  /* SEAMLESS HERO LOOP — native <video loop> stalls ~1 frame at the wrap while
     it re-decodes the keyframe at t=0 (a general browser behaviour, not clip-
     specific). The clip's last frame is authored to flow into its first, so the
     ONLY defect is that freeze. Two identical copies hand off at the seam.

     TWO things make the hand-off actually frame-exact:
       1. The reveal is SYNCHRONOUS. The previous build awaited incoming.play()'s
          promise before swapping the visible copy — and while it waited, the
          outgoing copy ran off its end and sat frozen on its last frame. THAT
          wait was the stall being reported.
       2. The parked copy is held with playbackRate = 0 rather than pause().
          A rate-0 element stays in the PLAYING state, so restoring rate 1 resumes
          on the very next frame, whereas play() after a real pause() spins the
          decode pipeline back up over several frames. (Feature-detected; falls
          back to pause/play where rate 0 is refused.)

     The swap fires from requestVideoFrameCallback on the copy that's on screen,
     the instant its FINAL frame has been presented — so the next frame the
     compositor shows is the other copy's frame 0: exactly the authored seam.

     The same controller owns the "Freeze when idle" mode: pause() holds the
     current frame, play() resumes from it (never a reset). */
  function initHeroLoop() {
    if (window.HeroLoop && window.HeroLoop.destroy) window.HeroLoop.destroy();
    window.HeroLoop = null;
    var stack = document.querySelector('.lp-gif-stack');
    if (!stack) return;
    var vids = stack.querySelectorAll('.lp-gif-media');
    if (vids.length < 2) return;
    var a = vids[0], b = vids[1];
    var cur = a, nxt = b;
    var running = false, dead = false, pollRAF = 0;
    var frameDur = 1 / 30, lastMT = -1;

    var RATE0 = (function () {
      try { a.playbackRate = 0; var ok = (a.playbackRate === 0); a.playbackRate = 1; return ok; }
      catch (e) { return false; }
    })();

    function hold(v) {          /* stop advancing, keep the pipeline warm */
      if (RATE0) {
        try { v.playbackRate = 0; } catch (e) {}
        if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      } else { try { v.pause(); } catch (e) {} }
    }
    function run(v) {           /* advance at normal speed — instant when rate-held */
      if (RATE0) { try { v.playbackRate = 1; } catch (e) {} }
      if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    }
    function park(v) {          /* hold at frame 0, decoded, ready to take over */
      try { v.currentTime = 0; } catch (e) {}
      hold(v);
    }
    function atEnd(v, t) {
      var d = v.duration || 0;
      return d > 0 && (d - t) <= frameDur * 1.35;
    }
    function swap() {
      var incoming = nxt, outgoing = cur;
      run(incoming);
      incoming.classList.add('is-current');    /* seam: last frame → first frame */
      outgoing.classList.remove('is-current');
      cur = incoming; nxt = outgoing;
      lastMT = -1;
      park(outgoing);                          /* reset while hidden */
      arm();
    }
    function arm() {
      if (dead || !running) return;
      var v = cur;
      if (v.requestVideoFrameCallback) {
        v.requestVideoFrameCallback(function (now, meta) {
          if (dead || !running || v !== cur) return;
          var mt = meta.mediaTime;
          if (lastMT >= 0) {
            var dt = mt - lastMT;               /* learn the real frame duration */
            if (dt > 0.004 && dt < 0.2) frameDur = frameDur * 0.6 + dt * 0.4;
          }
          lastMT = mt;
          if (atEnd(v, mt)) { swap(); return; }
          arm();
        });
        return;
      }
      if (pollRAF) return;                      /* no rVFC (Firefox) — rAF poll */
      pollRAF = requestAnimationFrame(function poll() {
        pollRAF = 0;
        if (dead || !running) return;
        if (atEnd(cur, cur.currentTime)) { swap(); return; }
        pollRAF = requestAnimationFrame(poll);
      });
    }
    function play() {
      if (dead || running) return;
      running = true;
      run(cur);
      arm();
    }
    function pause() {
      if (dead) return;
      running = false;
      if (pollRAF) { cancelAnimationFrame(pollRAF); pollRAF = 0; }
      hold(cur);
    }
    /* FREEZE WHEN IDLE: off → always running; on → running only while the hero
       hotspot is hovered, resuming from wherever it was held. */
    function applyMode() {
      if (dead) return;
      if (!window.GIF_FREEZE_IDLE) { play(); return; }
      var hot = document.querySelector('.lp-gif-hot');
      var hovered = false;
      try { hovered = !!(hot && hot.matches(':hover')); } catch (e) {}
      if (hovered) play(); else pause();
    }

    function onEnded(e) {                       /* safety net — never stall dead */
      if (dead) return;
      if (e.target === cur) { if (running) swap(); }
      else park(e.target);
    }
    a.addEventListener('ended', onEnded);
    b.addEventListener('ended', onEnded);

    var hot = document.querySelector('.lp-gif-hot');
    if (hot) {
      hot.addEventListener('mouseenter', function () { if (window.GIF_FREEZE_IDLE) play(); });
      hot.addEventListener('mouseleave', function () { if (window.GIF_FREEZE_IDLE) pause(); });
    }

    park(b);
    window.HeroLoop = {
      play: play, pause: pause, applyMode: applyMode,
      destroy: function () {
        dead = true; running = false;
        if (pollRAF) { cancelAnimationFrame(pollRAF); pollRAF = 0; }
        try { a.pause(); b.pause(); } catch (e) {}
      }
    };
    applyMode();
  }

  /* map a tag key → display label (tagDefs is the full vocabulary; fall
     back to filterDefs, then the raw key) */
  function labelFor(key) {
    var d = (typeof tagDefs !== 'undefined' ? tagDefs : []).filter(function (x) { return x.key === key; });
    if (d.length) return d[0].label;
    var f = filterDefs.filter(function (x) { return x.key === key; });
    return f.length ? f[0].label : key;
  }

  /* render a project's tags as .tag-pill chips */
  function tagPillsHTML(tags) {
    return (tags || []).filter(function (t) { return !(window.tagIsDeleted && window.tagIsDeleted(t)); }).map(function (t) {
      return '<span class="tag-pill" data-tag="' + String(t).replace(/"/g, '') + '">' + labelFor(t) + '</span>';
    }).join('');
  }

  /* Each pill sits in a .fp-item wrapper together with its SELECTION GLYPH
     (Filter buttons → Selection glyph; CSS in index.html, html.fsel-on). The
     wrapper carrying .fs-on shows the glyph (and pushes the pill when Push is
     on). `onKey` = which item renders in the shown state: fillFilterLists
     passes the PREVIOUS selection, then flips to the new one once styles
     resolve, so the glyph slides across the re-render (same trick as the
     project-page logo glyph). */
  function escGlyph(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function filterButtonsHTML(onKey) {
    var g = escGlyph(window.FSEL_GLYPH != null ? window.FSEL_GLYPH : '•');
    return filterDefs.map(function (f) {
      var isActive = activeFilters[f.key] ? ' active' : '';
      return '<span class="fp-item' + (f.key === onKey ? ' fs-on' : '') + '" data-fkey="' + f.key + '">'
           + '<span class="fp-glyph" aria-hidden="true">' + g + '</span>'
           + '<span class="filter-pill' + isActive + '" data-filter="' + f.key + '">' + f.label + '</span>'
           + '</span>';
    }).join('');
  }

  function buildLogoHTML() {
    function stateContent(cfg) {
      if (cfg.type === 'image' && cfg.image)
        return '<img src="' + cfg.image + '" alt="logo" draggable="false">';
      return (window.LOGO_TEXT != null && window.LOGO_TEXT !== '') ? window.LOGO_TEXT : (cfg.text || '');
    }
    var idleStyle = LOGO.idle.style ? ' style="' + LOGO.idle.style + '"' : '';
    /* rendered in the PREVIOUS glyph state; syncLogoGlyph (index.html) flips it
       to the route's state after insert so the slide plays across re-renders */
    /* the last measured glyph shift + left offset go INLINE so the new zone's
       very first style resolve already has the right start position */
    var lgVars = (window.__lgShift != null ? '--lg-shift:' + window.__lgShift + 'px;' : '')
               + (window.__logoOx != null ? '--logo-ox:' + window.__logoOx + 'px;' : '');
    var html = '<div class="logo-zone' + (window.__lgIn ? ' lg-in' : '') + '"'
             + (lgVars ? ' style="' + lgVars + '"' : '') + ' onclick="window.goHome()">'
             + '<span class="logo-glyph" aria-hidden="true">' + (window.LOGO_GLYPH || '\u2190') + '</span>'
             + '<span class="logo-idle"' + idleStyle + '>' + stateContent(LOGO.idle)  + '</span>'
             + '<span class="logo-hover">'                  + stateContent(LOGO.hover) + '</span>'
             + '</div>';
    if (LOGO.hover.style) {
      html = '<style>.logo-zone:hover .logo-hover{' + LOGO.hover.style + '}</style>' + html;
    }
    /* the logo auto-fits the toolbar width; run after this HTML is inserted */
    if (window.fitLogo) requestAnimationFrame(window.fitLogo);
    return html;
  }

  function getProjectById(id) {
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].id === id) return projects[i];
    }
    return null;
  }

  /* ── LEFT PANEL VARIANTS ────────────────────────────────────────────── */

  /* Home: bio + filters + title stack (active title in middle, 2 above + 2 below) */
  function setLeftHome() {
    var lp = document.getElementById('left-panel');
    lp.innerHTML =
        buildLogoHTML()
      + socialAboutHTML('window.openAbout()', aboutLinkHTML(), 'about')
      + dividerHTML()
      + '<div class="bio-short lp-home-bio">' + BIO_SHORT + '</div>'
      + gifHTML()
      /* TOOLBAR PLACEMENT copy of the filter buttons (Filter buttons → Position
         → Placement: Toolbar, html.filter-tb). It must live INSIDE the toolbar:
         the main-content block sits in #home-projects, a fixed layer painted
         BELOW the toolbar (z 5), so it could never show over it. CSS shows
         exactly one of the two sets (the main one again while the toolbar is
         collapsed); both are always rendered + kept in sync. */
      + '<div class="lp-filter-block lp-filter-tb"><div class="filter-row" id="filter-list-tb"></div></div>';
    initHeroLoop();
    /* The title stack + filter buttons live in the MAIN CONTENT area
       (#home-view, see index.html), NOT the toolbar DOM — so they don't slide
       off / hide when the toolbar collapses into its drawer. Populate the
       filter list (its static container is already in #home-view). */
    fillFilterLists();
    /* seed the title stack now — first onProgress will refresh it */
    rebuildTitleStackRows();
    renderTitleStack({ idx: 0, frac: 0, idxFloat: 0 });
    /* seed the mini-info from whatever is currently centered */
    renderMiniInfo(currentHomeActiveId ? getProjectById(currentHomeActiveId) : null);
  }

  /* About: left panel mirrors the HOME view exactly — logo at --logo-y and the
     Social+About unit (icons + divider) at --social-y — so they stay in sync
     across views. The only difference is the link reads "× close" (back to
     home) instead of "+ about". The long bio lives in the right zone. */
  function setLeftAbout() {
    var lp = document.getElementById('left-panel');
    lp.innerHTML =
        buildLogoHTML()
      /* no "× close" link — the logo (with its route glyph) returns home */
      + socialAboutHTML(null)
      + dividerHTML()
      + gifHTML();
    initHeroLoop();
  }

  /* SOFT-HYPHENATE long words: a single long title word (e.g. "Illustrations")
     can't fit a narrow toolbar, and CSS hyphens:auto only prints a hyphen when
     the DICTIONARY has a syllable break that fits — at large type in a narrow
     panel none does, so the browser fell back to overflow-wrap and broke the
     word with NO hyphen. Inserting a soft hyphen (U+00AD) between every
     character of long words gives a break opportunity at EVERY character, and
     the browser draws the hyphen at whichever one it uses. Invisible when the
     word isn't broken. */
  function softHyphenate(s) {
    return String(s == null ? '' : s).replace(/[A-Za-z\u00C0-\u024F]{8,}/g, function (w) {
      return w.split('').join('\u00AD');
    });
  }
  /* LAST-RESORT hyphenation for the project title: words wrap whole by default;
     only a word WIDER THAN THE TITLE BOX on its own gets the soft hyphens. Each
     word is measured unbroken (.tw-measure turns off every break mode), then the
     title is rewritten. A ResizeObserver re-fits on width / font-size change
     (keyed so its own rewrite can't loop). */
  function escTxt(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function fitTitleWords(el) {
    if (!el || !el.isConnected) return;
    var raw = el.getAttribute('data-raw') || '';
    var max = el.clientWidth; if (!max) return;
    var key = max + '|' + getComputedStyle(el).fontSize + '|' + raw;
    if (el.__twKey === key) return;
    el.__twKey = key;
    el.classList.add('tw-measure');
    el.innerHTML = raw.split(/(\s+)/).map(function (w) { return /\S/.test(w) ? '<span>' + escTxt(w) + '</span>' : w; }).join('');
    var out = Array.prototype.map.call(el.childNodes, function (n) {
      if (n.nodeType !== 1) return n.textContent;
      return n.getBoundingClientRect().width > max + 0.5 ? softHyphenate(escTxt(n.textContent)) : escTxt(n.textContent);
    }).join('');
    el.classList.remove('tw-measure');
    el.innerHTML = out;
  }
  var titleRO = window.ResizeObserver ? new ResizeObserver(function (es) { es.forEach(function (e) { fitTitleWords(e.target); }); }) : null;
  window.addEventListener('resize', function () { fitTitleWords(document.querySelector('.lp-proj-title')); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
    var el = document.querySelector('.lp-proj-title'); if (el) { el.__twKey = null; fitTitleWords(el); }
  });

  /* does this project embed the posters grid as a content block? (its hover
     descriptions reuse the #pg-desc overlay, so the panel must render it) */
  function hasPostersBlock(p) {
    return !!(p.content && p.content.some(function (b) { return b && b.type === 'posters'; }));
  }

  /* Project: title + year + tags + description */
  function setLeftProject(p) {
    var lp = document.getElementById('left-panel');
    lp.innerHTML =
        buildLogoHTML()
      + '<div class="lp-proj-info">'
      +   '<div class="lp-proj-title" data-raw="' + escTxt(p.title || '').replace(/"/g, '&quot;') + '">' + escTxt(p.title || '') + '</div>'
      +   (p.year ? '<div class="lp-proj-year">' + p.year + '</div>' : '')
      +   '<div class="lp-proj-tags tag-row">'
      +     tagPillsHTML(p.tags)
      +   '</div>'
      +   '<div class="lp-desc-wrap">'
      +     '<div class="lp-proj-desc">' + (p.desc || 'Project description coming soon.') + '</div>'
      +   '</div>'
      + '</div>'
      + (window.projButtonsHTML ? window.projButtonsHTML(p) : '')
      /* per-item hover description (playground / posters): the LAST in-flow item,
         so showing / hiding it never moves the description or buttons above */
      + (((p.playgroundImages && p.playgroundImages.length) || (p.postersImages && p.postersImages.length) || hasPostersBlock(p))
          ? '<div class="pg-desc" id="pg-desc" aria-hidden="true">'
            + '<div class="proj-text-title" id="pg-desc-title"></div>'
            + '<div class="proj-text-body" id="pg-desc-body"></div>'
            + '</div>'
          : '');
    var tEl = lp.querySelector('.lp-proj-title');
    fitTitleWords(tEl);
    if (titleRO && tEl) titleRO.observe(tEl);
    /* no Back button — the logo (with its route glyph) returns home */
  }

  /* ── Vid Description (playground) — surfaced in the TOOLBAR on tile hover /
     expand, IN PLACE of the project description (it sits in an in-flow overlay
     exactly over .lp-proj-desc, so it shares that location and scrolls with the
     panel). While a vid desc is visible the project description is hidden
     (.pg-hidden); it reappears when nothing is hovered/expanded or the effect
     is disabled. Uses the same text styles as project-page text blocks; y
     OFFSET + alignment driven by Toolbar tweaks (--pgdesc-y / --pgdesc-align +
     window.PG_DESC_SHOW). */
  window.pgDescShow = function (title, body) {
    var box = document.getElementById('pg-desc');
    if (!box) return;
    if (window.PG_DESC_SHOW === false) { box.classList.remove('is-visible'); return; }
    var tEl = document.getElementById('pg-desc-title');
    var bEl = document.getElementById('pg-desc-body');
    if (tEl) { tEl.innerHTML = title || ''; tEl.style.display = title ? '' : 'none'; }
    if (bEl) { bEl.innerHTML = body || '';  bEl.style.display = body ? '' : 'none'; }
    var has = !!(title || body);
    box.classList.toggle('is-visible', has);   /* sits BELOW the project description (no longer replaces it) */
  };
  window.pgDescHide = function () {
    var box = document.getElementById('pg-desc');
    if (box) box.classList.remove('is-visible');
  };

  function bindFilters() {
    document.querySelectorAll('.filter-pill').forEach(function (tag) {
      if (tag._fBound) return;
      tag._fBound = true;
      tag.addEventListener('click', function () {
        var key = tag.dataset.filter;
        /* SINGLE-SELECT (radio). Navigate to a hashed URL so the filtered view
           is linkable (#/filter/<key>, or #/ for All); applyRoute reads it back
           and rebuilds the pills + thumbnails. With the All button switched off
           (Filter buttons → Buttons), clicking the ACTIVE pill again clears the
           filter — otherwise there'd be no way back to everything. */
        var hasAll = filterDefs.some(function (f) { return f.key === 'all'; });
        if (!hasAll && window.activeFilters && window.activeFilters[key]) { setHash('#/'); return; }
        setHash(key === 'all' ? '#/' : '#/filter/' + encodeURIComponent(key));
      });
    });
  }
  /* render the filter buttons into BOTH containers (main content + the toolbar
     copy) from the current filterDefs + active filter */
  function fillFilterLists() {
    var cur = Object.keys(activeFilters || {})[0] || 'all';
    /* render with the PREVIOUS selection's glyph shown, flip below */
    var prev = window.__fselKey != null ? window.__fselKey : cur;
    var html = filterButtonsHTML(prev);
    ['filter-list', 'filter-list-tb'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = html;
    });
    bindFilters();
    syncFilterSelGlyph();
    if (prev !== cur) {
      var items = document.querySelectorAll('.fp-item');
      if (items.length) getComputedStyle(items[0]).transform;   /* resolve the start state */
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('fs-on', items[i].getAttribute('data-fkey') === cur);
    }
    window.__fselKey = cur;
    /* toolbar copy: place + clamp inside the toolbar margins (index.html) */
    if (window.layoutFilterTb) window.layoutFilterTb();
  }
  /* SELECTION GLYPH sync: refresh the glyph character in every item and
     measure the push distance (--fsel-shift = glyph width + gap) — run on each
     render and on every tweak change (applyTweaks). */
  function syncFilterSelGlyph() {
    var ch = window.FSEL_GLYPH != null ? String(window.FSEL_GLYPH) : '•';
    var gs = document.querySelectorAll('.fp-glyph');
    for (var i = 0; i < gs.length; i++) if (gs[i].textContent !== ch) gs[i].textContent = ch;
    var gap = window.FSEL_GAP != null ? Number(window.FSEL_GAP) || 0 : 8;
    var w = 0;
    for (var j = 0; j < gs.length && !w; j++) w = gs[j].offsetWidth;   /* hidden lists measure 0 */
    if (w) document.documentElement.style.setProperty('--fsel-shift', Math.round(w + gap) + 'px');
  }
  window.syncFilterSelGlyph = syncFilterSelGlyph;
  /* Filter buttons → Buttons changed which tags are filters (filterDefs is
     rebuilt in place by applyFilterList in index.html). If the active filter
     is no longer offered, drop back to everything; else re-render in place. */
  window.refreshFilterButtons = function () {
    var cur = Object.keys(window.activeFilters || {})[0];
    if (cur && cur !== 'all' && !filterDefs.some(function (f) { return f.key === cur; })) {
      if (document.documentElement.classList.contains('route-home')) { setHash('#/'); return; }
    }
    fillFilterLists();
    if (window.AdaptiveInvert) window.AdaptiveInvert.refresh();
  };

  /* ── VIEW SWITCHING ────────────────────────────────────────────────── */
  /* ── MINI INFO ── mini-description + tags of the centered project (home).
     Updates live as the centered project changes (via active callback). */
  function renderMiniInfo(p) {
    var wrap = document.getElementById('mini-info');
    var desc = document.getElementById('mini-desc');
    var tags = document.getElementById('mini-tags');
    if (!wrap || !desc || !tags) return;
    var hv0 = document.getElementById('home-view');
    if (hv0) hv0.classList.remove('mini-hover');
    var hit0 = document.getElementById('mini-hit');
    if (!p) {
      if (hit0) hit0.classList.remove('on');
      wrap.classList.add('hidden'); tags.classList.add('hidden'); applyAdaptiveText(); return;
    }
    wrap.classList.remove('hidden');
    tags.classList.remove('hidden');
    desc.textContent = p.mini || '';
    desc.style.display = p.mini ? '' : 'none';
    /* the mini description behaves like the centered title: click opens the
       project, hover puts the title into its hover state */
    desc.onclick = function () { if (window.openProject) window.openProject(p.id); };
    desc.onmouseenter = function () {
      var hv = document.getElementById('home-view');
      if (hv) hv.classList.add('mini-hover');
    };
    desc.onmouseleave = function () {
      var hv = document.getElementById('home-view');
      if (hv) hv.classList.remove('mini-hover');
    };
    tags.innerHTML = tagPillsHTML(p.tags);
    /* tags behave like the mini description: open the project, hover the title */
    tags.onclick = desc.onclick;
    tags.onmouseenter = desc.onmouseenter;
    tags.onmouseleave = desc.onmouseleave;
    var hit = document.getElementById('mini-hit');
    if (hit) {
      hit.onclick = desc.onclick;
      hit.onmouseenter = desc.onmouseenter;
      hit.onmouseleave = desc.onmouseleave;
    }
    positionMiniTags();
    if (window.AdaptiveInvert) window.AdaptiveInvert.refresh();
  }

  /* ── PER-PORTION INVERT (mini description + filters over images) ────────
     Driven by js/adaptive-invert.js. renderMiniInfo pings it when the shown
     text changes; the module re-reads geometry and re-masks. */
  function applyAdaptiveText() {
    if (window.AdaptiveInvert) window.AdaptiveInvert.refresh();
  }
  window.applyAdaptiveText = applyAdaptiveText;

  /* The tags live in their own fixed layer (kept OUT of the blended .mini-info
     so the invert-over-images effect never touches them). Position that layer
     just under the mini description. Runs after layout + on resize/tweak, since
     the description's on-screen box depends on --left-w, --mini-x/y and the
     viewport height. */
  function positionMiniTags() {
    var wrap = document.getElementById('mini-info');
    var desc = document.getElementById('mini-desc');
    var tags = document.getElementById('mini-tags');
    if (!wrap || !desc || !tags) return;
    if (wrap.classList.contains('hidden') || tags.classList.contains('hidden')) return;
    /* synchronous: reading getBoundingClientRect forces layout, so the box is
       up to date right after the description text/position changed (no rAF, so
       it also works when rAF is throttled). */
    var ref = (desc.style.display === 'none') ? wrap : desc;
    var box = ref.getBoundingClientRect();
    /* the tag layer + hit area live INSIDE #home-projects, which the reel intro
       translates; that transform is applied on top of what we write, so the
       measured viewport y needs the published lift taken back out. */
    var lift = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--home-lift'));
    if (isNaN(lift)) lift = 0;
    tags.style.left = box.left + 'px';
    tags.style.top  = (box.bottom + 12 - lift) + 'px';
    /* the shared hit area = union of the description + tag-row boxes, so the
       gaps between the lines and between the pills are hoverable too */
    var hit = document.getElementById('mini-hit');
    if (hit) {
      var tb = tags.getBoundingClientRect();
      var l = Math.min(box.left, tb.left), t = Math.min(box.top, tb.top);
      var rr = Math.max(box.right, tb.right), b = Math.max(box.bottom, tb.bottom);
      hit.style.left = l + 'px';
      hit.style.top = (t - lift) + 'px';
      hit.style.width = Math.max(0, rr - l) + 'px';
      hit.style.height = Math.max(0, b - t) + 'px';
      hit.classList.add('on');
    }
  }
  window.positionMiniTags = positionMiniTags;
  window.addEventListener('resize', positionMiniTags);

  /* ── DISPLAY MODE (List ⇄ Gallery) ─────────────────────────────────────
     The home page can show the vertical List display or the multi-column
     Gallery display. Mode persists in localStorage. The switch button (top-
     right) shows the glyph of the mode you'd switch TO. */
  function renderSingleTitle(p) {
    var stack = document.getElementById('lp-title-stack');
    if (!stack) return;
    if (!p) { stack.innerHTML = ''; return; }
    var ax = (window.TITLE_ALIGN === 'center') ? '-50%'
           : (window.TITLE_ALIGN === 'right')  ? '-100%' : '0px';
    stack.innerHTML =
      '<div class="lp-title-row is-centered" data-id="' + p.id
      + '" style="transform:translate(' + ax + ',-50%);--row-opacity:1;--row-filter:none">'
      + '<span class="lp-title-inner">' + p.title + '</span></div>';
  }

  /* gallery tile hover → surface that project's title + mini description;
     null → clear both (hidden until a tile is hovered). */
  window.galleryHoverInfo = function (id) {
    var p = id ? getProjectById(id) : null;
    renderSingleTitle(p);
    renderMiniInfo(p);
  };

  window.refreshDisplaySwitch = function () {
    var btn = document.getElementById('display-switch');
    if (!btn) return;
    var toGallery = (window.DISPLAY_MODE !== 'gallery');
    btn.textContent = toGallery
      ? (window.DISP_GALLERY_GLYPH || '\u25a6')
      : (window.DISP_LIST_GLYPH || '\u2630');
    /* each shown glyph carries its OWN corner radius; the border-radius CSS
       transition (enabled via .disp-animating during a toggle) eases between
       the two settings. On non-toggle calls (init / live slider drag) there's
       no animating class, so it applies instantly. */
    var rad = toGallery
      ? (window.DISP_GALLERY_RADIUS != null ? window.DISP_GALLERY_RADIUS : 0)
      : (window.DISP_LIST_RADIUS != null ? window.DISP_LIST_RADIUS : 0);
    btn.style.borderRadius = rad + 'px';
  };

  /* build whichever display is active; tear down the other. */
  function applyDisplayMode(opts) {
    var preserve = !opts || opts.preserveScroll !== false;
    var hv = document.getElementById('home-view');
    if (!hv) return;
    var gallery = (window.DISPLAY_MODE === 'gallery');
    hv.classList.toggle('mode-gallery', gallery);
    hv.classList.toggle('mode-list', !gallery);
    if (gallery) {
      if (window.ListGallery) window.ListGallery.destroy();
      if (window.GalleryDisplay) window.GalleryDisplay.build();
      /* title + mini stay hidden until a tile is hovered */
      renderSingleTitle(null);
      renderMiniInfo(null);
    } else {
      if (window.GalleryDisplay) window.GalleryDisplay.destroy();
      /* list seeds its own title stack + mini via the active/rebuilt callbacks */
      if (window.ListGallery) window.ListGallery.build({ preserveScroll: preserve });
    }
    window.refreshDisplaySwitch();
  }
  window.applyDisplayMode = applyDisplayMode;

  window.setDisplayMode = function (mode) {
    var prev = window.DISPLAY_MODE;
    window.DISPLAY_MODE = (mode === 'gallery') ? 'gallery' : 'list';
    try { localStorage.setItem('displayMode', window.DISPLAY_MODE); } catch (e) {}
    /* on an ACTUAL mode change, set the border-radius transition DURATION to the
       real value (it's 0s otherwise) so the switch button's corner radius glides
       between the list & gallery radii — reset to 0s after so live slider drags
       stay instant. Works BOTH ways because border-radius is always transitionable. */
    if (prev !== window.DISPLAY_MODE) {
      var btn = document.getElementById('display-switch');
      if (btn) {
        /* each MODE transition (Gallery → List, List → Gallery) has its own
           easing + speed (set in applyTweaks from the Tweaks sliders) —
           independent of which radius each mode happens to use. */
        var listToGallery = (window.DISPLAY_MODE === 'gallery');
        var ms = listToGallery
          ? (window.DISP_L2G_MS != null ? window.DISP_L2G_MS : 400)
          : (window.DISP_G2L_MS != null ? window.DISP_G2L_MS : 400);
        var ease = listToGallery
          ? (window.DISP_L2G_EASE || 'cubic-bezier(0,0,.1,1)')
          : (window.DISP_G2L_EASE || 'cubic-bezier(.3,0,.8,1)');
        btn.style.setProperty('--disp-rad-ease', ease);
        btn.style.setProperty('--disp-rad-dur', (ms / 1000) + 's');
        clearTimeout(btn._radT);
        btn._radT = setTimeout(function () { btn.style.setProperty('--disp-rad-dur', '0s'); }, ms + 80);
      }
    }
    var hv = document.getElementById('home-view');
    if (hv && hv.style.display !== 'none') applyDisplayMode();
    else window.refreshDisplaySwitch();
  };

  function setView(id) {
    var displayTypes = { 'home-view': 'block', 'project-view': 'block', 'about-view': 'grid' };
    ['home-view', 'project-view', 'about-view'].forEach(function (v) {
      var el = document.getElementById(v);
      if (el) { el.style.display = 'none'; el.classList.remove('visible'); }
    });
    var target = document.getElementById(id);
    if (target) {
      target.style.display = displayTypes[id] || 'block';
      target.classList.add('visible');
    }
    /* also hide the floating count when not on home */
    var cnt = document.getElementById('list-count');
    if (cnt) cnt.classList.toggle('hidden', id !== 'home-view');
    window.scrollTo(0, 0);
  }

  /* ── PROJECT PAGE RENDERING ──────────────────────────────────────────
     Content model — each project may define a `content` array of blocks that
     flow top-to-bottom in a 2-column grid. Block shapes:

       { type: 'video', src: '<embed url>' }          // always full-width, 16:9
       { type: 'image', src: 'file.jpg', full: true } // full:true → spans both cols
       { type: 'text',  title: '…', body: '<p>…</p>' } // title (H3) + body
       { type: 'text',  html: '<p>…</p>' }             // legacy raw-html text
       { type: 'divider' }                             // standalone full-width rule
       { type: 'row', images: ['a.gif','b.jpg',…] }    // N images, equal-height row
       { type: 'row', images: ['logo.png'], center:true, maxW:380 } // centered, capped

     `full` (boolean) makes a block span both columns; omit/false = one column.
     If a project has no `content`, we fall back to: hero from `p.video` (or first
     `p.images` entry) + remaining `p.images` as one-column blocks. ───────── */
  /* the iframe + enlarge button shared by the video block and row-video items */
  function videoInnerHTML(src, ratio) {
    /* Embeds (YouTube + Vimeo) keep their OWN native fullscreen control, so we
       no longer add a custom enlarge button here. (Self-hosted localvideo still
       gets its click-to-enlarge lightbox, handled separately.) */
    return '<iframe src="' + src + '" frameborder="0" '
         +   'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" '
         +   'allowfullscreen webkitallowfullscreen mozallowfullscreen></iframe>';
  }

  /* ── RICH VIDEO ──
     A self-hosted MP4 with a custom minimal control set (opt-in per block via
     `{ type:'richvideo' }`). Autoplays muted + loops with NO native chrome; on
     top we draw our own bottom-left volume (muted glyph → tap → volume glyph +
     a slider above it), a bottom-right enlarge toggle, and a click-anywhere
     play/pause with a centre glyph. The ENTIRE .rv-stage is moved into
     #rv-lightbox when enlarged (same <video> + listeners), so every control
     behaves identically inline and enlarged. */
  var RV_ICONS = {
    muted:   '<svg class="rv-ic-muted" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3z"></path><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
    vol:     '<svg class="rv-ic-vol" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3z"></path><path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a9 9 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
    expand:  '<svg class="rv-ic-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path></svg>',
    compress:'<svg class="rv-ic-compress" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"></path></svg>',
    pauseC:  '<svg class="rv-ic-pc" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>',
    playC:   '<svg class="rv-ic-plc" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>'
  };
  function richVideoInnerHTML(src) {
    return '<div class="rv-stage">'
         +   '<video class="rv-video" src="' + src + '" autoplay muted loop playsinline preload="metadata"></video>'
         +   '<div class="rv-center" data-s="" aria-hidden="true">' + RV_ICONS.pauseC + RV_ICONS.playC + '</div>'
         +   '<div class="rv-ctrl rv-ctrl-vol">'
         +     '<div class="rv-vol-slider"><input type="range" class="rv-vol-range" min="0" max="100" value="100" aria-label="Volume"></div>'
         +     '<button class="rv-btn rv-vol-btn" type="button" aria-label="Unmute">' + RV_ICONS.muted + RV_ICONS.vol + '</button>'
         +   '</div>'
         +   '<button class="rv-btn rv-ctrl rv-ctrl-enlarge rv-enlarge-btn" type="button" aria-label="Enlarge">' + RV_ICONS.expand + RV_ICONS.compress + '</button>'
         + '</div>';
  }

  /* SHARED-ASSET PATHS. A block `src` normally names a file inside that
     project's own folder (assets/<pid>/<src>). If it CONTAINS a slash it is
     instead read as a path relative to assets/ — e.g.
     'playground/LTX_Shapes_Single_1080.mp4'
     from the Lightricks page — so one clip can live in a single folder and be
     referenced from any number of pages (one file, one download, one cache
     entry). Each segment is encoded separately so the slashes survive. */
  function assetPath(pid, src) {
    src = String(src == null ? '' : src);
    var parts = (src.indexOf('/') !== -1 ? src : (pid + '/' + src)).split('/');
    return 'assets/' + parts.map(encodeURIComponent).join('/');
  }

  function blockHTML(b, pid) {
    var full = b.full ? ' full' : '';
    if (b.type === 'video') {
      /* full-width by default (back-compat); opt into a single grid column with
         full:false. Optional `ratio` (e.g. '1/1') overrides the 16:9 box. */
      var vfull = (b.full === false) ? '' : ' full';
      var vstyle = b.ratio ? ' style="aspect-ratio:' + b.ratio + '"' : '';
      return '<div class="proj-block' + vfull + ' proj-video"' + vstyle + '>'
           +   videoInnerHTML(b.src, b.ratio || '16/9')
           + '</div>';
    }
    /* localvideo: a self-hosted MP4 in a native <video>. Autoplays muted + loops
       like a GIF (but far smaller/sharper); native controls give scrub, volume
       and real fullscreen — no iframe-sandbox enlarge workaround needed. Renders
       at full width / natural height (no forced aspect box, so no letterboxing).
       Optional `ratio` locks the cell + contain-fits if you need a fixed box. */
    if (b.type === 'localvideo') {
      var lvfull = (b.full === false) ? '' : ' full';
      var lvst = [];
      if (b.ratio) lvst.push('aspect-ratio:' + b.ratio);
      if (b.alignSelf) lvst.push('align-self:' + b.alignSelf);
      if (b.mt != null) lvst.push('margin-top:' + b.mt + 'px');
      if (b.mb != null) lvst.push('margin-bottom:' + b.mb + 'px');
      var lvratio = (b.ratio ? ' proj-localvideo-ratio' : '') + '"'
                  + (lvst.length ? ' style="' + lvst.join(';') + '"' : '');
      return '<div class="proj-block' + lvfull + ' proj-localvideo' + lvratio + '>'
           +   '<video src="' + assetPath(pid, b.src) + '" '
           +   'autoplay muted loop playsinline preload="metadata" '
           +   'data-localzoom="1"></video>'
           +   '<button class="proj-localvideo-play" type="button" aria-label="Play video">'
           +     '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>'
           +   '</button>'
           + '</div>';
    }
    /* spacer: an empty single-column grid cell. Use it to occupy a slot so a
       following block lands in the OTHER column (and grid-auto-flow:dense can't
       backfill the hole with a later block). Renders nothing visible. */
    if (b.type === 'spacer') {
      var spfull = (b.full === true) ? ' full' : '';
      return '<div class="proj-block' + spfull + ' proj-spacer" aria-hidden="true"></div>';
    }
    /* rich video: self-hosted MP4 with the custom minimal control UI. Single
       column by default (full:true spans both). Optional `ratio` locks the cell
       to that aspect (contain-fit) so it can match a neighbour like a square
       embed; optional `col` forces its grid column (1 or 2) so it can sit
       directly under a specific neighbour. */
    if (b.type === 'richvideo') {
      var rvfull = (b.full === true) ? ' full' : '';
      var rvSt = [];
      if (b.ratio)      rvSt.push('aspect-ratio:' + b.ratio);
      if (b.col && !b.__gc) rvSt.push('grid-column:' + (String(b.col) === '2' ? '4 / span 3' : '1 / span 3'));
      if (b.mt != null) rvSt.push('margin-top:' + b.mt + 'px');
      if (b.mb != null) rvSt.push('margin-bottom:' + b.mb + 'px');
      var rvStyle = rvSt.length ? ' style="' + rvSt.join(';') + '"' : '';
      return '<div class="proj-block' + rvfull + ' rich-video-block' + (b.ratio ? ' rv-ratio' : '') + '"' + rvStyle + '>'
           +   richVideoInnerHTML(assetPath(pid, b.src))
           + '</div>';
    }
    if (b.type === 'text') {
      var txt = '';
      if (b.title) txt += '<div class="proj-text-title">' + b.title + '</div>';
      if (b.body)  txt += '<div class="proj-text-body">' + b.body + '</div>';
      if (!txt && b.html) txt = b.html;            /* legacy raw-html text blocks */
      var inner = (b.title || b.body)
        ? '<div class="proj-text-inner">' + txt + '</div>'
        : txt;
      /* optional rows: span N grid rows so neighbouring blocks stack beside it.
         Optional mt/mb (px) override the block's default top/bottom margin. */
      var tst = [];
      if (b.rows) tst.push('grid-row:span ' + b.rows);
      if (b.mt != null) tst.push('margin-top:' + b.mt + 'px');
      if (b.mb != null) tst.push('margin-bottom:' + b.mb + 'px');
      var tstyle = tst.length ? ' style="' + tst.join(';') + '"' : '';
      return '<div class="proj-block' + full + ' proj-text"' + tstyle + '>' + inner + '</div>';
    }
    /* divider: a standalone full-width rule with its own above/below spacing.
       Optional per-block mt/mb (px) override the global divider spacing. */
    if (b.type === 'divider') {
      var dst = [];
      if (b.mt != null) dst.push('margin-top:' + b.mt + 'px');
      if (b.mb != null) dst.push('margin-bottom:' + b.mb + 'px');
      var dstyle = dst.length ? ' style="' + dst.join(';') + '"' : '';
      return '<div class="proj-block full proj-divider"' + dstyle + '></div>';
    }
    /* row: N images side by side; widths auto-justified to equal height.
       An empty/falsy entry renders an invisible spacer that takes one equal
       slot — use it to center a single image into, e.g., the middle third. */
    if (b.type === 'slideshow') {
      var ssItems = (b.images || []).map(function (src) {
        src = String(src || ''); if (!src) return '';
        var u = assetPath(pid, src);
        return /\.(mp4|webm|mov)(\?|$)/i.test(src)
          ? '<video src="' + u + '" muted loop playsinline preload="auto"></video>'
          : '<img src="' + u + '" alt="" data-zoom="1" draggable="false">';
      }).join('');
      return '<div class="proj-block' + full + ' proj-slideshow pss-box" data-speed="' + (b.speed != null ? b.speed : 40) + '"'
           + (b.interactive ? ' data-interactive="1"' : '')
           + (window.pssBoxAttrs ? window.pssBoxAttrs(b) : '')
           + ' style="aspect-ratio:' + (b.ratio || '16/9') + ';' + (window.pssBoxVars ? window.pssBoxVars(b) : '') + '">'
           +   '<div class="pss-strip" style="gap:' + (b.gap || 0) + 'px">' + (window.pssDividerHTML ? window.pssDividerHTML(b) : '') + ssItems + '</div>'
           +   (window.pssArrowsHTML ? window.pssArrowsHTML(b) : '')
           + '</div>';
    }
    if (b.type === 'row') {
      var items = (b.images || []).map(function (im) {
        if (im && typeof im === 'object' && im.video) {
          /* a video entry inside a row: shares the row's height, width scaled to
             its aspect ratio (flex-grow = w/h, same rule as the row's images) */
          var vr = im.ratio || '16/9';
          var parts = vr.split('/');
          var grow = (parts.length === 2 && +parts[1]) ? (+parts[0] / +parts[1]) : 1.778;
          return '<div class="proj-row-item proj-row-video" style="flex-grow:' + grow.toFixed(4) + '">'
               +   '<div class="proj-video" style="aspect-ratio:' + vr + '">' + videoInnerHTML(im.video, vr) + '</div>'
               + '</div>';
        }
        if (im && typeof im === 'object' && im.localvideo) {
          /* a self-hosted video inside a row: behaves like a row image (width 100%,
             height auto, flex-grow = real aspect, corrected by measureProjRows on
             metadata load). No controls; click → enlarge lightbox; autoplay-fail
             affordance via initLocalVideos — same as the standalone localvideo block. */
          var lr = im.ratio || '16/9';
          var lp = lr.split('/');
          var lg = (lp.length === 2 && +lp[1]) ? (+lp[0] / +lp[1]) : 1.778;
          return '<div class="proj-row-item proj-row-localvideo" style="flex-grow:' + lg.toFixed(4) + '">'
               +   '<div class="proj-localvideo">'
               +     '<video src="' + assetPath(pid, im.localvideo) + '" '
               +     'autoplay muted loop playsinline preload="metadata" data-localzoom="1" data-rowvid="1"></video>'
               +     '<button class="proj-localvideo-play" type="button" aria-label="Play video">'
               +       '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>'
               +     '</button>'
               +   '</div>'
               + '</div>';
        }
        var src = (typeof im === 'string') ? im : im.src;
        if (!src) return '<div class="proj-row-item proj-row-spacer"></div>';
        /* optional per-item scale: shrinks the image to `scale`× its natural
           row height, centered in its slot (white space around it). Slot size
           is unchanged so the row layout/widths stay put. */
        var scl = (im && typeof im === 'object' && im.scale) ? im.scale : null;
        var aln = (im && typeof im === 'object' && im.align) ? (' align-' + im.align) : '';
        /* optional per-item `w`: FIXES the item's flex-grow to that value so its
           width is a fixed proportion of the row (e.g. w:40 vs w:60 → 40%/60%),
           regardless of aspect. Marked data-fixedw so measureProjRows leaves it. */
        var fw = (im && typeof im === 'object' && im.w) ? im.w : null;
        var valign = (im && typeof im === 'object' && im.valign) ? im.valign : null;
        /* optional per-item `maxW` (number=px, string e.g. '66%'=relative): caps the
           IMAGE inside its slot and centres it, keeping natural aspect (height
           shrinks with it — unlike `scale`, which only transforms). Use it to sit a
           narrower image centred under a wider one in the row above. */
        var imw = (im && typeof im === 'object' && im.maxW != null)
          ? ((typeof im.maxW === 'string') ? im.maxW : (im.maxW + 'px')) : null;
        var itCls = 'proj-row-item' + (scl ? (' proj-row-scaled' + aln) : '');
        var styleBits = [];
        if (scl) styleBits.push('--item-scale:' + scl);
        if (fw)  styleBits.push('flex-grow:' + fw);
        if (valign) styleBits.push('align-self:' + valign);   /* vertical align within the row */
        var itSt  = styleBits.length ? ' style="' + styleBits.join(';') + '"' : '';
        var fwAttr = fw ? ' data-fixedw="1"' : '';
        return '<div class="' + itCls + '"' + itSt + fwAttr + '>'
             +   '<img src="' + assetPath(pid, src) + '" '
             +   'alt="" loading="lazy" data-zoom="1" data-rowimg="1"'
             +   (imw ? ' style="max-width:' + imw + ';margin-inline:auto"' : '') + '>'
             + '</div>';
      }).join('');
      var rowCls = 'proj-block full proj-row' + (b.center ? ' proj-row-center' : '');
      var rowMaxW = (typeof b.maxW === 'string') ? b.maxW : (b.maxW + 'px');
      var rowSt  = b.maxW ? ' style="max-width:' + rowMaxW + ';margin-inline:auto"' : '';
      return '<div class="' + rowCls + '"' + rowSt + '>' + items + '</div>';
    }
    /* hscroll: full-width horizontal gallery. Images sit at a fixed height in a
       horizontally-scrolling track (mouse wheel scrolls L/R inside, releasing to
       the page at each edge — wired in initHscroll). Edge arrows indicate more. */
    if (b.type === 'hscroll') {
      var hitems = (b.images || []).map(function (im) {
        var src = (typeof im === 'string') ? im : im.src;
        return '<img src="' + assetPath(pid, src) + '" '
             +   'alt="" loading="lazy" data-zoom="1">';
      }).join('');
      return '<div class="proj-block full proj-hscroll">'
           +   '<div class="proj-hscroll-track">' + hitems + '</div>'
           +   '<button class="proj-hscroll-arrow prev" type="button" aria-label="Scroll left">\u2190</button>'
           +   '<button class="proj-hscroll-arrow next" type="button" aria-label="Scroll right">\u2192</button>'
           + '</div>';
    }
    /* posters: the static justified posters grid (js/posters-gallery.js) embedded
       INSIDE a content page's block flow. Only the mount is emitted here — it is
       filled by renderProjectStandard once the grid is in the DOM. Optional `pid`
       names the asset folder the images live in (defaults to this project). */
    if (b.type === 'posters') {
      return '<div class="proj-block full posters-gallery" data-posters-pid="'
           + String(b.pid || pid).replace(/"/g, '&quot;') + '"></div>';
    }
    /* default: image — data-full marks clickable content images for the lightbox.
       Optional `ratio` (e.g. '1/1') locks the cell to that aspect ratio and fits
       the image inside (object-fit:contain) — use it to match a neighbour's height.
       Optional `mt`/`mb` (px) add extra space above/below this image (on top of the
       grid row-gap). Optional `maxW` (number=px, string e.g. '60%'=relative) caps
       and centers the image within its column — use to shrink a logo. */
    var imgBlockSt = [];
    if (b.alignSelf) imgBlockSt.push('align-self:' + b.alignSelf);
    if (b.mt != null) imgBlockSt.push('margin-top:' + b.mt + 'px');
    if (b.mb != null) imgBlockSt.push('margin-bottom:' + b.mb + 'px');
    var imgSt = '';
    if (b.maxW != null) {
      var mw = (typeof b.maxW === 'string') ? b.maxW : (b.maxW + 'px');
      imgSt = ' style="max-width:' + mw + ';margin-inline:auto"';
    }
    if (b.ratio) {
      imgBlockSt.push('aspect-ratio:' + b.ratio);
      return '<div class="proj-block' + full + ' proj-img-ratio" style="' + imgBlockSt.join(';') + '">'
           +   '<img src="' + assetPath(pid, b.src) + '" alt="" loading="lazy" data-zoom="1"' + imgSt + '>'
           + '</div>';
    }
    var imgBlockStyle = imgBlockSt.length ? ' style="' + imgBlockSt.join(';') + '"' : '';
    return '<div class="proj-block' + full + '"' + imgBlockStyle + '>'
         +   '<img src="' + assetPath(pid, b.src) + '" alt="" loading="lazy" data-zoom="1"' + imgSt + '>'
         + '</div>';
  }

  /* ── IMAGE LIGHTBOX ──
     Delegated: any content image with data-zoom opens the lightbox. The backdrop
     captures all pointer events, so the page underneath is inert while open.
     Click anywhere outside the image (or Esc) closes it. */
  function openLightbox(src) {
    var lb  = document.getElementById('img-lightbox');
    var img = document.getElementById('img-lightbox-img');
    if (!lb || !img) return;
    img.src = src;
    lb.classList.add('is-active');
    document.body.classList.add('lightbox-open'); /* freeze page scroll */
  }
  function closeLightbox() {
    var lb = document.getElementById('img-lightbox');
    if (lb) lb.classList.remove('is-active');
    document.body.classList.remove('lightbox-open');
  }

  /* ── VIDEO LIGHTBOX ── shared overlay used only to enlarge self-hosted
     localvideo clips (embeds keep their own native fullscreen). */

  function closeVideoLightbox() {
    /* the shared video lightbox now serves only self-hosted localvideo clips
       (embeds keep their own native fullscreen); just stop playback + hide it. */
    var lb  = document.getElementById('video-lightbox');
    var vid = document.getElementById('video-lightbox-video');
    if (!lb) return;
    lb.classList.remove('is-active');
    if (vid) {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      vid.style.display = 'none';
    }
    document.body.classList.remove('lightbox-open');
  }
  /* enlarge a self-hosted <video> into the same centered overlay, with native
     controls. Mirrors the image lightbox: backdrop dims the page, click-out / Esc
     closes. Native fullscreen is also available from the enlarged controls. */
  function openLocalVideoLightbox(src, ratio) {
    var lb    = document.getElementById('video-lightbox');
    var frame = document.getElementById('video-lightbox-frame');
    var ifr   = document.getElementById('video-lightbox-iframe');
    var vid   = document.getElementById('video-lightbox-video');
    if (!lb || !vid) return;
    var lcb = lb.querySelector('.video-lightbox-close');
    if (lcb) lcb.style.display = 'none';         /* local video: no close button */
    /* shrink-wrap the frame to the video so the visible bounds === clickable
       frame: with aspect-ratio the frame stays a wide box (capped by max-height)
       and the transparent gap swallows clicks. is-local lets the video size
       itself (max-w/h) and the frame wrap it, so clicking any dim area closes. */
    frame.classList.add('is-local');
    frame.style.background = 'transparent';
    frame.style.aspectRatio = '';                /* video defines size, not a fixed ratio */
    if (ifr) { ifr.src = ''; ifr.style.display = 'none'; }
    vid.style.display = 'block';
    vid.src = src;
    lb.classList.add('is-active');
    document.body.classList.add('lightbox-open');
    vid.play().catch(function () {});
  }
  function initLightbox() {
    var lb  = document.getElementById('img-lightbox');
    var img = document.getElementById('img-lightbox-img');
    if (!lb) return;
    /* open on content-image click */
    document.addEventListener('click', function (e) {
      var z = e.target.closest && e.target.closest('.proj-block img[data-zoom], .posters-tile img[data-zoom]');
      if (z) { e.preventDefault(); openLightbox(z.src); }
      var lv = e.target.closest && e.target.closest('.proj-localvideo');
      if (lv) {
        var lvid = lv.querySelector('video');
        if (lvid) {
          e.preventDefault();
          var lvr = (lvid.videoWidth && lvid.videoHeight) ? (lvid.videoWidth + '/' + lvid.videoHeight) : '16/9';
          openLocalVideoLightbox(lvid.currentSrc || lvid.src, lvr);
        }
      }
    });
    /* click anywhere in the overlay closes — except on the image itself */
    lb.addEventListener('click', function (e) {
      if (e.target !== img) closeLightbox();
    });
    /* video lightbox: click backdrop / close button to dismiss */
    var vlb = document.getElementById('video-lightbox');
    if (vlb) {
      vlb.addEventListener('click', function (e) {
        if (!e.target.closest('#video-lightbox-frame') || e.target.closest('.video-lightbox-close')) {
          closeVideoLightbox();
        }
      });
    }
    /* swallow wheel/touch scroll while open (belt-and-braces with overflow:hidden) */
    lb.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
    lb.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeLightbox(); closeVideoLightbox(); closeRichEnlarge(); }
    });
    /* rich-video enlarge overlay: click the dim backdrop (anywhere outside the
       stage) to close; clicks on the video/controls are handled by the stage. */
    var rvlb = document.getElementById('rv-lightbox');
    if (rvlb) {
      rvlb.addEventListener('click', function (e) {
        if (!e.target.closest('.rv-stage')) closeRichEnlarge();
      });
    }
  }

  /* stamp the block's editor key (data-bk, for the hover outline) and any
     placement / text-layout override onto its root .proj-block */
  function decorateBlock(html, b) {
    if (!b || !b.__key) return html;
    var cls = (b.__place ? ' place-' + b.__place : '') + (b.__mode === 'beside' ? ' mode-beside' : '') + (b.__per === 3 ? ' pc-3' : '');
    var vars = '';
    if (b.__gc) vars += 'grid-column:' + b.__gc + ';';
    if (b.__geo) { cls += ' pc-sz-g'; vars += '--pc-gw:' + b.__geo.w + ';--pc-gm:' + b.__geo.m + ';'; }
    else if (b.__sz) {
      cls += ' pc-sz-' + b.__sz.kind;
      vars += '--pc-w:' + b.__sz.w.toFixed(3) + ';';
    }
    if (b.__sa || b.__sb) {
      cls += ' pc-space';
      if (b.__sa) vars += '--pc-sa:' + b.__sa + 'px;';
      if (b.__sb) vars += '--pc-sb:' + b.__sb + 'px;';
    }
    if (b.__newRow) html = '<div class="pc-break" aria-hidden="true"></div>' + html;
    if (vars) {
      /* merge into the root tag's existing style attr (a 2nd style attr would be ignored) */
      var end = html.indexOf('>'), head = html.slice(0, end);
      if (/ style="/.test(head)) html = head.replace(/ style="/, ' style="' + vars) + html.slice(end);
      else html = html.replace('class="proj-block', 'style="' + vars + '" class="proj-block');
    }
    return html.replace('class="proj-block', 'data-bk="' + String(b.__key).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" class="proj-block' + cls);
  }

  /* re-render the project toolbar (year / tags / description edits) */
  window.refreshProjectLeft = function () {
    var r = parseHash();
    if (r.view !== 'project') return;
    var p = getProjectById(r.projectId);
    if (!p) return;
    setLeftProject(p);
    if (window.fitLogo) window.fitLogo();
  };

  /* re-render the open project page in place (Page content edits). Keeps the
     scroll position; skips playground / standalone-posters pages. */
  window.rerenderProjectContent = function () {
    var r = parseHash();
    if (r.view !== 'project') return;
    var p = getProjectById(r.projectId);
    if (!p || (p.playgroundImages && p.playgroundImages.length) || (p.postersImages && p.postersImages.length)) return;
    var se = document.scrollingElement || document.documentElement;
    var pv = document.getElementById('project-view');
    var y1 = se.scrollTop, y2 = pv ? pv.scrollTop : 0;
    stopProjectEmbeds();
    if (window.PostersGallery) window.PostersGallery.unmount();
    renderProjectStandard(p);
    se.scrollTop = y1; if (pv) pv.scrollTop = y2;
  };

  function renderProjectStandard(p) {
    var body = document.getElementById('proj-body');
    var blocks = [];

    if (p.content && p.content.length) {
      /* authored content + any Page content overrides (order / hidden /
         placement / text) — identical to p.content when there are none */
      blocks = window.resolveProjectContent ? window.resolveProjectContent(p) : p.content.slice();
    } else {
      /* legacy fallback — hero + image grid from older project data */
      if (p.video) blocks.push({ type: 'video', src: p.video });
      var imgs = p.images || [];
      var start = (!p.video && imgs.length) ? 1 : 0;
      if (!p.video && imgs.length) blocks.push({ type: 'image', src: imgs[0], full: true });
      for (var i = start; i < imgs.length; i++) blocks.push({ type: 'image', src: imgs[i] });
    }

    var inner = blocks.length
      ? blocks.map(function (b) { return decorateBlock(blockHTML(b, p.id), b); }).join('')
      : '<div class="proj-block full proj-ph">' + p.title + ' — add content</div>';

    body.innerHTML =
        '<div class="proj-standard">'
      +   '<div class="proj-grid' + (window.projStrictFlow && window.projStrictFlow(p) ? ' pc-strict' : '') + '">' + inner + '</div>'
      + '</div>';
    measureProjRows(body);
    initHscroll(body);
    initLocalVideos(body);
    initRichVideos(body);
    initPostersBlock(body, blocks);
    if (window.ProjSlideshow) window.ProjSlideshow.init(body);
  }

  /* fill an embedded posters mount (block type 'posters') once it is in the DOM.
     One gallery per page — PostersGallery keeps a single mount. */
  function initPostersBlock(container, blocks) {
    var mount = container.querySelector('[data-posters-pid]');
    if (!mount || !window.PostersGallery) return;
    var blk = null;
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i] && blocks[i].type === 'posters') { blk = blocks[i]; break; }
    }
    if (!blk) return;
    window.PostersGallery.build(mount, blk.images || [], mount.getAttribute('data-posters-pid'));
  }

  /* ── RICH VIDEO wiring ──
     One setup per .rv-stage: click-to-toggle-play (centre glyph), a volume
     button that unmutes + reveals a vertical slider, and an enlarge toggle that
     moves the whole stage into #rv-lightbox and back. */
  var rvEnlarged = null;
  function initRichVideos(container) {
    var stages = container.querySelectorAll('.rv-stage');
    Array.prototype.forEach.call(stages, function (stage) { setupRichVideo(stage); });
  }
  function setupRichVideo(stage) {
    if (stage.__rv) return; stage.__rv = true;
    var video  = stage.querySelector('.rv-video');
    var center = stage.querySelector('.rv-center');
    var volBtn = stage.querySelector('.rv-vol-btn');
    var range  = stage.querySelector('.rv-vol-range');
    var enBtn  = stage.querySelector('.rv-enlarge-btn');
    var slider = stage.querySelector('.rv-vol-slider');
    var flashT = null;
    var hideT  = null;
    var soundMode = false;   /* sticky: has the user turned sound ON (drives the icon + slider),
                                independent of the actual volume value (0 volume stays in sound mode) */

    function applyVolState() {
      stage.classList.toggle('is-unmuted', soundMode);
      volBtn.setAttribute('aria-label', soundMode ? 'Mute' : 'Unmute');
    }

    /* idle-fade: controls (incl. the muted glyph) show, then fade after a few
       seconds of no interaction. They stay while paused; reappear on hover. */
    function scheduleHide(delay) {
      if (hideT) clearTimeout(hideT);
      hideT = setTimeout(function () { if (!video.paused) stage.classList.remove('rv-show'); }, delay);
    }
    function showCtrls(delay) {
      stage.classList.add('rv-show');
      scheduleHide(delay || 2800);
    }


    function togglePlay() {
      if (video.paused) {
        video.play().catch(function () {});
        stage.classList.remove('is-paused');
        center.dataset.s = 'flash-in';                     /* show play glyph, then fade */
        requestAnimationFrame(function () { center.dataset.s = 'flash-out'; });
        if (flashT) clearTimeout(flashT);
        flashT = setTimeout(function () { if (center.dataset.s === 'flash-out') center.dataset.s = ''; }, 700);
        showCtrls();
      } else {
        video.pause();
        stage.classList.add('is-paused');                  /* CSS keeps controls shown */
        center.dataset.s = 'paused';                       /* persistent pause glyph */
      }
    }

    /* click the video surface (not the controls) toggles play/pause */
    stage.addEventListener('click', function (e) {
      if (e.target.closest('.rv-ctrl')) return;
      togglePlay();
    });
    /* keep the state class in sync if playback changes by other means */
    video.addEventListener('pause', function () {
      /* auto-pauses from js/media-power.js (off-screen / hidden tab) must NOT
         surface the paused control state — only a real user pause does */
      if (video.dataset.mpAuto === '1') return;
      if (!video.ended) stage.classList.add('is-paused');
    });
    video.addEventListener('play',  function () { stage.classList.remove('is-paused'); });
    /* reveal on hover/move, fade shortly after the pointer leaves */
    stage.addEventListener('mouseenter', function () { showCtrls(); });
    stage.addEventListener('mousemove',  function () { showCtrls(); });
    stage.addEventListener('mouseleave', function () { scheduleHide(500); });

    volBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!soundMode) {
        /* turn sound ON */
        soundMode = true;
        video.muted = false;
        if (video.volume === 0) { video.volume = 1; }
        range.value = Math.round(video.volume * 100);
      } else {
        /* back to muted state */
        soundMode = false;
        video.muted = true;
      }
      applyVolState();
      showCtrls();
    });
    range.addEventListener('input', function (e) {
      e.stopPropagation();
      var v = (+range.value) / 100;
      video.volume = v;
      video.muted = false;          /* stay in sound mode even at 0 — 0 = silent, not muted state */
      showCtrls();
    });
    if (slider) slider.addEventListener('click', function (e) { e.stopPropagation(); });

    enBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (stage.classList.contains('is-enlarged')) closeRichEnlarge();
      else openRichEnlarge(stage);
    });

    /* start muted (required for autoplay); slider primed at full. The muted icon
       stays pinned (CSS keeps it visible while NOT in sound mode); other controls
       show then fade after the idle delay. */
    video.muted = true; range.value = 100;
    applyVolState();
    showCtrls();
  }
  function openRichEnlarge(stage) {
    var lb = document.getElementById('rv-lightbox');
    var frame = lb && lb.querySelector('.rv-lb-frame');
    if (!lb || !frame) return;
    var video = stage.querySelector('.rv-video');
    var wasPaused = video ? video.paused : true;
    stage.__home = stage.parentNode;
    frame.appendChild(stage);
    stage.classList.add('is-enlarged');
    lb.classList.add('is-active');
    document.body.classList.add('lightbox-open');
    rvEnlarged = stage;
    if (video && !wasPaused) video.play().catch(function () {});   /* reparenting can pause */
  }
  function closeRichEnlarge() {
    var lb = document.getElementById('rv-lightbox');
    if (rvEnlarged) {
      var stage = rvEnlarged, video = stage.querySelector('.rv-video');
      var wasPaused = video ? video.paused : true;
      stage.classList.remove('is-enlarged');
      if (stage.__home && stage.__home.isConnected) stage.__home.appendChild(stage);
      if (video && !wasPaused) video.play().catch(function () {});
    }
    if (lb) lb.classList.remove('is-active');
    document.body.classList.remove('lightbox-open');
    rvEnlarged = null;
  }
  /* on navigation the proj-body is rebuilt; if a stage is currently detached
     into the overlay, just stop + drop it so no audio leaks and no stale node. */
  function resetRichEnlarge() {
    var lb = document.getElementById('rv-lightbox');
    if (lb) {
      var frame = lb.querySelector('.rv-lb-frame');
      if (frame) { var v = frame.querySelector('video'); if (v) v.pause(); frame.innerHTML = ''; }
      lb.classList.remove('is-active');
    }
    rvEnlarged = null;
  }

  /* self-hosted videos autoplay muted; if the browser blocks autoplay (e.g. iOS
     Low Power Mode), reveal a play affordance so the frozen frame is obviously
     tappable. When it does play, hide it again. The tap itself routes through the
     delegated click handler → opens the enlarge lightbox (user-gesture play). */
  function initLocalVideos(container) {
    var vids = container.querySelectorAll('.proj-localvideo video');
    Array.prototype.forEach.call(vids, function (v) {
      var wrap = v.closest('.proj-localvideo');
      if (!wrap) return;
      v.addEventListener('play',  function () { wrap.classList.remove('show-play'); });
      v.addEventListener('pause', function () { if (v.currentTime > 0 && !v.ended) wrap.classList.add('show-play'); });
      var p = v.play();
      if (p && p.then) {
        p.then(function ()  { wrap.classList.remove('show-play'); })
         .catch(function () { wrap.classList.add('show-play'); });
      }
    });
  }

  /* horizontal-scroll galleries: wheel scrolls L/R inside the track, but releases
     to the page once an edge is reached; edge arrows fade in only when there is
     room to scroll that way. (left = scroll up/back, right = scroll down/forward) */
  function initHscroll(container) {
    var galleries = container.querySelectorAll('.proj-hscroll');
    Array.prototype.forEach.call(galleries, function (g) {
      var track = g.querySelector('.proj-hscroll-track');
      var la = g.querySelector('.proj-hscroll-arrow.prev');
      var ra = g.querySelector('.proj-hscroll-arrow.next');
      if (!track) return;
      var EDGE = 2;   /* px tolerance: sub-pixel rounding means scrollLeft never
                         lands exactly on 0 / maxScroll, so treat "within EDGE" as
                         the edge — otherwise arrows never hide & wheel never releases */
      function maxScroll() { return track.scrollWidth - track.clientWidth; }
      function clamp(v) { return Math.max(0, Math.min(maxScroll(), v)); }
      function update() {
        var ms = maxScroll();
        var atStart = track.scrollLeft <= EDGE;
        var atEnd   = ms <= 0 || track.scrollLeft >= ms - EDGE;
        if (la) la.classList.toggle('visible', ms > 0 && !atStart);
        if (ra) ra.classList.toggle('visible', !atEnd);
      }
      track.addEventListener('scroll', update, { passive: true });
      /* smooth wheel → horizontal: accumulate into a target and ease toward it
         (lerp) so motion is fluid. We preventDefault ONLY while there is room to
         scroll the gallery in the wheel's direction; at the edge we do nothing,
         letting the browser scroll the PAGE natively (same speed as elsewhere,
         no jitter). */
      var target = track.scrollLeft, animating = false;
      function animate() {
        var cur = track.scrollLeft;
        var diff = target - cur;
        if (Math.abs(diff) < 0.5) { track.scrollLeft = target; animating = false; update(); return; }
        track.scrollLeft = cur + diff * 0.16;
        update();
        requestAnimationFrame(animate);
      }
      function glideTo(v) {
        target = clamp(v);
        if (!animating) { animating = true; requestAnimationFrame(animate); }
      }
      track.addEventListener('wheel', function (e) {
        var dy = e.deltaY;
        if (!dy) return;
        var ms = maxScroll();
        /* the gallery takes over the wheel while it is ENGAGED: either the page is
           at the very top (a gallery pinned at the top of the page) or the gallery
           is vertically settled in the viewport — fully visible, or tall enough to
           cover the viewport's middle. Mid-page galleries therefore scroll L/R and
           only hand the wheel back to the page at an edge. */
        var pageTop = (window.pageYOffset || document.documentElement.scrollTop || 0) < 1;
        var r  = g.getBoundingClientRect();
        var vh = window.innerHeight || document.documentElement.clientHeight;
        var engaged = pageTop
          || (r.top >= -2 && r.bottom <= vh + 2)
          || (r.top <= vh * 0.5 && r.bottom >= vh * 0.5);
        var canH = ms > 0 && engaged &&
                   ((dy > 0 && track.scrollLeft < ms - EDGE) ||
                    (dy < 0 && track.scrollLeft > EDGE));
        if (canH) {
          e.preventDefault();
          if (!animating) target = track.scrollLeft;
          glideTo(target + dy * 0.55);
        }
        /* else: at an edge, or the gallery isn't settled yet — page scrolls */
      }, { passive: false });
      if (la) la.addEventListener('click', function () { glideTo((animating ? target : track.scrollLeft) - track.clientWidth * 0.7); });
      if (ra) ra.addEventListener('click', function () { glideTo((animating ? target : track.scrollLeft) + track.clientWidth * 0.7); });
      /* arrow positions/visibility depend on image widths — update as they load */
      Array.prototype.forEach.call(track.querySelectorAll('img'), function (img) {
        if (!img.complete) img.addEventListener('load', update, { once: true });
      });
      window.addEventListener('resize', update);
      update();
      setTimeout(update, 60);
    });
  }

  /* set each row image's flex-grow to its real aspect ratio so a row of mixed
     images all share one height and together fill the row width */
  function measureProjRows(container) {
    var imgs = container.querySelectorAll('.proj-row-item img[data-rowimg]');
    Array.prototype.forEach.call(imgs, function (img) {
      if (img.parentNode && img.parentNode.hasAttribute('data-fixedw')) return; /* fixed-width item: keep its flex-grow */
      function set() {
        if (img.naturalWidth && img.naturalHeight) {
          img.parentNode.style.flexGrow = (img.naturalWidth / img.naturalHeight).toFixed(4);
        }
      }
      if (img.complete) set();
      else img.addEventListener('load', set, { once: true });
    });
    /* row-embedded self-hosted videos: correct flex-grow to the real aspect once
       metadata is known (flex-grow lives on the .proj-row-item ancestor) */
    var vids = container.querySelectorAll('.proj-row-item video[data-rowvid]');
    Array.prototype.forEach.call(vids, function (v) {
      var item = v.closest('.proj-row-item');
      function setv() {
        if (item && v.videoWidth && v.videoHeight) {
          item.style.flexGrow = (v.videoWidth / v.videoHeight).toFixed(4);
        }
      }
      if (v.readyState >= 1) setv();
      else v.addEventListener('loadedmetadata', setv, { once: true });
    });
  }

  /* posters gallery: static multi-column justified grid (no drag/auto-scroll).
     Each tile scales on hover + surfaces its own image description in the left
     toolbar (like the playground clips); click enlarges via the image lightbox. */
  function renderProjectPosters(p) {
    var body = document.getElementById('proj-body');
    body.innerHTML = '<div class="proj-standard"><div id="posters-mount" class="posters-gallery"></div></div>';
    var mount = document.getElementById('posters-mount');
    if (window.PostersGallery) window.PostersGallery.build(mount, p.postersImages, p.id);
  }

  function renderProjectPlayground(p) {
    var body = document.getElementById('proj-body');
    /* viewport fills right side; the back-link is absolute-positioned above it */
    body.innerHTML = '<div id="proj-playground-mount" style="position:relative"></div>';
    var mount = document.getElementById('proj-playground-mount');
    window.Playground.mount(mount, p.playgroundImages, p.id);
  }

  /* ── ROUTING ────────────────────────────────────────────────────────── */

  /* parse hash into { view, projectId } */
  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h)              return { view: 'home' };
    if (h === 'about')   return { view: 'about' };
    var fm = h.match(/^filter\/(.+)$/);
    if (fm)              return { view: 'home', filter: decodeURIComponent(fm[1]) };
    var m = h.match(/^project\/(.+)$/);
    if (m)               return { view: 'project', projectId: m[1] };
    return { view: 'home' };
  }

  /* validate a filter key against filterDefs; unknown / missing → 'all' */
  function validFilter(key) {
    if (key && filterDefs.some(function (f) { return f.key === key; })) return key;
    return 'all';
  }
  function applyFilterState(key) {
    activeFilters = {};
    activeFilters[validFilter(key)] = true;
  }
  var lastAppliedFilter = 'all';

  /* ── PAGE-EXIT VIDEO TEARDOWN ──
     Hiding a view with display:none does NOT stop iframes inside it — audio
     kept playing after leaving the about/project pages. So: on every route
     change we blank the embeds of the views we're leaving, and rebuild them
     fresh when the view is re-entered (like a normal page load would). */
  var _aboutReelSrc = null;   /* original reel src, captured on first use */
  function rebuildAboutReel() {
    var ifr = document.getElementById('about-reel-iframe');
    if (!ifr) return;
    if (_aboutReelSrc == null) _aboutReelSrc = ifr.getAttribute('src') || '';
    var fresh = ifr.cloneNode(false);     /* same id/attrs, no listeners */
    fresh.src = _aboutReelSrc;            /* starts anew */
    ifr.replaceWith(fresh);
  }
  function stopAboutReel() {
    var ifr = document.getElementById('about-reel-iframe');
    if (!ifr || !ifr.getAttribute('src')) return;
    if (_aboutReelSrc == null) _aboutReelSrc = ifr.getAttribute('src') || '';
    var fresh = ifr.cloneNode(false);
    fresh.removeAttribute('src');         /* unloads the embed → audio stops */
    ifr.replaceWith(fresh);
  }
  function stopProjectEmbeds() {
    var body = document.getElementById('proj-body');
    if (body && body.innerHTML !== '') body.innerHTML = '';
  }

  function applyRoute() {
    var r = parseHash();

    /* close any open image lightbox on navigation */
    closeLightbox();
    closeVideoLightbox();
    resetRichEnlarge();

    /* collapse the responsive toolbar drawer on any navigation (clicking the
       logo / back / about while the drawer is expanded returns to the page AND
       slides the toolbar away). Harmless when not in collapsed/drawer mode. */
    var __site = document.querySelector('.site');
    if (__site) __site.classList.remove('tb-open');

    /* stop playback in views we're leaving (see teardown note above) */
    if (r.view !== 'about')   stopAboutReel();
    if (r.view !== 'project') stopProjectEmbeds();
    /* the home reel is owned by js/home-intro.js (same blank-on-exit rule) */
    if (r.view !== 'home' && window.HomeIntro) window.HomeIntro.leave();

    /* always tear down playground gallery if leaving a playground project */
    if (r.view !== 'project' && window.Playground) {
      window.Playground.unmount();
    }
    /* likewise tear down the posters gallery (removes its resize listener) */
    if (r.view !== 'project' && window.PostersGallery) {
      window.PostersGallery.unmount();
    }

    /* ROUTE CLASSES on <html> — the single source of truth for route-scoped
       CSS (the reel's full-page/invert modes, the bio-reveal hover) and for
       per-route control values (the about page's own minimize glyph). Set here
       rather than in each module so nothing can disagree about the route. */
    var rc = document.documentElement.classList;
    rc.toggle('route-home',    r.view === 'home');
    rc.toggle('route-about',   r.view === 'about');
    rc.toggle('route-project', r.view === 'project');
    if (window.updateTbGlyphs) window.updateTbGlyphs();

    if (r.view === 'home') {
      /* a filter can be encoded in the URL (#/filter/<key>) so a filtered view
         is linkable. Apply it BEFORE building so the pills + thumbnails reflect
         it; reset the list scroll only when the filter actually changed. */
      var fkey = validFilter(r.filter);
      var filterChanged = (fkey !== lastAppliedFilter);
      lastAppliedFilter = fkey;
      applyFilterState(fkey);
      setLeftHome();
      setView('home-view');
      /* build whichever thumbnail display is active. List PRESERVES scroll so
         returning from a project lands the user where they were browsing — but
         a filter change resets to the top of the newly filtered set. */
      applyDisplayMode({ preserveScroll: !filterChanged });
      if (window.HomeIntro) window.HomeIntro.enter();
      if (window.AdaptiveInvert) window.AdaptiveInvert.refresh();
    }
    else if (r.view === 'about') {
      setLeftAbout();
      setView('about-view');
      rebuildAboutReel();   /* embed begins anew, like a fresh page load */
      if (window.ListGallery) window.ListGallery.destroy();
      if (window.GalleryDisplay) window.GalleryDisplay.destroy();
    }
    else if (r.view === 'project') {
      var p = getProjectById(r.projectId);
      if (!p) {
        /* unknown id → fall back to home */
        location.hash = '#/';
        return;
      }
      setLeftProject(p);
      setView('project-view');
      if (window.ListGallery) window.ListGallery.destroy();
      if (window.GalleryDisplay) window.GalleryDisplay.destroy();
      if (window.PostersGallery) window.PostersGallery.unmount();  /* clear any prior posters mount */
      if (p.playgroundImages && p.playgroundImages.length) {
        renderProjectPlayground(p);
      } else if (p.postersImages && p.postersImages.length) {
        renderProjectPosters(p);
      } else {
        renderProjectStandard(p);
      }
    }
  }

  window.aboutLinkHTML = aboutLinkHTML;
  window.closeLinkHTML = closeLinkHTML;
  /* exposed navigation — just set the hash; hashchange triggers applyRoute */
  window.goHome = function ()   { setHash('#/'); };
  window.openAbout = function () { setHash('#/about'); };
  window.openProject = function (id) { setHash('#/project/' + id); };

  /* set hash without spamming history when re-navigating to current route */
  function setHash(h) {
    if (location.hash === h) {
      /* same hash — re-apply manually since no event will fire */
      applyRoute();
    } else {
      location.hash = h;
    }
  }

  window.addEventListener('hashchange', applyRoute);

  /* ── INIT ──────────────────────────────────────────────────────────── */
  document.title = (LOGO.idle.type === 'text' ? LOGO.idle.text : '') || 'Portfolio';

  /* about-page bio */
  document.getElementById('about-bio-text').innerHTML = BIO_LONG;

  /* hook the list gallery's active-change callback so the left panel
     always shows the centered project's title */
  if (window.ListGallery) {
    window.ListGallery.setActiveProjectCallback(function (p) {
      currentHomeActiveId = p ? p.id : null;
      renderMiniInfo(p);
    });
    window.ListGallery.setProgressCallback(function (progress) {
      renderTitleStack(progress);
    });
    /* after any gallery (re)build, ensure the title-stack rows match the final
       item set — fixes an init-order/async-measure race that could leave the
       stack short by one (centered title not matching the centered thumbnail). */
    window.ListGallery.setRebuiltCallback(function () {
      rebuildTitleStackRows();
      renderTitleStack(lastProgress || { idx: 0, frac: 0, idxFloat: 0 });
    });
  }

  /* tweak applied → re-render marker glyph + title stack so visual changes
     (e.g. row height, blur amounts, glyph character) take effect immediately */
  window.onTweaksApplied = function () {
    positionMiniTags();   /* mini-x/y/maxW may have moved the description */
    applyAdaptiveText();  /* toggle / dark-color may have changed */
    if (window.DISPLAY_MODE === 'gallery') return;  /* gallery manages its own title/mini on hover */
    if (window.ListGallery && window.ListGallery.repositionMarker) {
      window.ListGallery.repositionMarker();
    }
    /* force a re-render of title stack with current progress */
    if (lastProgress) renderTitleStack(lastProgress);
  };

  /* display mode: restore the persisted choice, wire the switch button */
  (function () {
    var saved = null;
    try { saved = localStorage.getItem('displayMode'); } catch (e) {}
    window.DISPLAY_MODE = (saved === 'gallery') ? 'gallery' : 'list';
    var btn = document.getElementById('display-switch');
    if (btn) {
      btn.addEventListener('click', function () {
        window.setDisplayMode(window.DISPLAY_MODE === 'gallery' ? 'list' : 'gallery');
      });
    }
    window.refreshDisplaySwitch();
  })();

  /* disable right-click / long-press context menu site-wide so images + videos
     can't be trivially saved (belt-and-braces with the CSS drag/callout guards) */
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* close whatever expanded media is open (project lightboxes + the playground's
     expanded clip) — used by the CLOSE CURSOR script when the toolbar background
     is clicked in main-content Expand-over mode */
  window.closeExpandedMedia = function () {
    var on = function (id) { var e = document.getElementById(id); return !!(e && e.classList.contains('is-active')); };
    if (on('img-lightbox')) closeLightbox();
    if (on('video-lightbox')) closeVideoLightbox();
    if (on('rv-lightbox')) closeRichEnlarge();
    if (on('pg-overlay') && window.Playground && window.Playground.closeOverlay) window.Playground.closeOverlay();
  };

  /* apply route from URL on first load (instant — no async) */
  initLightbox();
  applyRoute();
})();
