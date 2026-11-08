/* ======================================================================
   HOME INTRO — reel hero ⇄ project section scroll choreography.

   The home view is now TWO stacked layers, both position:fixed inset:0:
     #home-reel      — the reel embed (full content window, within margins)
                       + its own DOWN-only scroll marker beneath the video
     #home-projects   — the whole project section (list/gallery stage,
                       filters, title stack, mini description + tags,
                       display switch, list scroll markers)

   ONE progress value p drives both:
     p = 0 → reel at rest, project section parked one viewport BELOW
     p = 1 → project section locked in its authored positions, reel one
             viewport ABOVE (off-screen)
   Both layers translate by the SAME amount in opposite directions, so the
   two read as one continuous column being scrolled.

   WHEEL OWNERSHIP: this module listens in the CAPTURE phase on window and
   stopPropagation()s the events it consumes, so list-gallery.js /
   gallery-display.js (both bubble-phase window listeners) never see them.
   It consumes:
     · every downward wheel while p < 1 (the reveal)
     · every wheel while 0 < p < 1 (mid-transition, either direction)
     · upward wheels at p = 1 only when the active display is at its TOP
       (ListGallery.atTop() / gallery scrollLeft 0) — that's the hand-back
       that slides the reel down again.
   Everything else passes straight through, so normal project scrolling is
   untouched. adaptive-invert.js is pinged manually here since its own
   wheel listener is bubble-phase (i.e. swallowed by us).

   --home-lift: the CURRENT pixel offset of #home-projects, published on
   <html>. Anything that writes a VIEWPORT-measured y-coordinate INTO an
   element that lives inside #home-projects must subtract it (the wrapper's
   transform is applied on top) — see positionMiniTags() in portfolio.js and
   updateMarkerLine() in list-gallery.js.

   Touch is supported (iPad counts as desktop here) with the same rules.
   ====================================================================== */
(function () {
  'use strict';
  if (window.__MOBILE__) return;

  var S = {
    p:        0,     /* rendered progress 0..1 */
    target:   0,     /* where p is heading */
    dir:      1,     /* last input direction */
    raf:      null,
    timer:    null,  /* rAF-starvation fallback for the tween */
    ft:       0,
    on:       false, /* home route active */
    paused:   false, /* reel paused via the Vimeo message API */
    commitT:  null,
    touchY:   null,
    touching: false
  };

  var LERP      = 0.12;  /* per 60fps frame — settles in ~0.6s */
  var COMMIT_MS = 150;   /* input idle before the transition commits to an end */

  function el(id) { return document.getElementById(id); }
  function vh()   { return window.innerHeight || 800; }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function dist() {
    var d = Number(window.REEL_REVEAL_DIST);
    return (d > 0 ? d : 620);
  }
  function active() {
    if (window.REEL_SHOW === false) return false;
    var hv = el('home-view');
    return !!(el('home-reel') && hv && hv.style.display !== 'none');
  }

  /* ── the reel embed: its URL lives in data-src, so the iframe is only
     created on the desktop home route (mobile renders its own app and must not
     load a hidden player). Blanked when we leave home, rebuilt fresh on the
     way back — same technique as the about-page reel in portfolio.js. */
  var reelSrc = null;
  function ensureReel() {
    var f = el('home-reel-iframe');
    if (!f) return;
    if (reelSrc == null) reelSrc = f.getAttribute('src') || f.getAttribute('data-src') || '';
    if (f.getAttribute('src')) return;
    var fresh = f.cloneNode(false);
    fresh.src = reelSrc;
    f.replaceWith(fresh);
    S.paused = false;
    syncReelScale();
  }
  function blankReel() {
    var f = el('home-reel-iframe');
    if (!f || !f.getAttribute('src')) return;
    if (reelSrc == null) reelSrc = f.getAttribute('src') || '';
    var fresh = f.cloneNode(false);
    fresh.removeAttribute('src');
    f.replaceWith(fresh);
  }
  /* Vimeo's iframe message API — pause the reel once it's fully off-screen so
     it isn't decoding behind the project section, resume when it returns. */
  function reelPlayback(play) {
    if (S.paused === !play) return;
    S.paused = !play;
    var f = el('home-reel-iframe');
    if (!f || !f.contentWindow || !f.getAttribute('src')) return;
    try {
      f.contentWindow.postMessage(JSON.stringify({ method: play ? 'play' : 'pause' }), '*');
    } catch (e) {}
  }

  /* ── RESIZE-SMOOTH IFRAME SCALING ──
     The iframe keeps ONE fixed layout size (big enough for the screen, 16:9)
     and is fitted to the frame with scale(), so resizing the window never
     changes the cross-origin player's own size. Changing it made the browser
     wait on the player process every resize tick, stalling the whole page's
     frames (most visible dragging the window's top edge). The 1px overscan is
     kept: the scaled box spans frame + 2px from (-1,-1). Driven by a
     ResizeObserver on the frame — its callback runs after layout, before
     paint, so the scale lands in the same frame as the new geometry. */
  var IFR_W = Math.max(1920, (window.screen && screen.width) || 0, Math.round(((window.screen && screen.height) || 0) * 16 / 9));
  IFR_W = Math.round(IFR_W / 16) * 16;
  var IFR_H = IFR_W * 9 / 16;
  var lastScale = '';
  function syncReelScale() {
    var frame = el('home-reel-frame'), f = el('home-reel-iframe');
    if (!frame || !f) return;
    var fw = frame.offsetWidth, fh = frame.offsetHeight;
    if (!fw || !fh) return;
    if (f.style.width !== IFR_W + 'px') { f.style.width = IFR_W + 'px'; f.style.height = IFR_H + 'px'; }
    var tr = 'scale(' + ((fw + 2) / IFR_W).toFixed(6) + ',' + ((fh + 2) / IFR_H).toFixed(6) + ')';
    if (tr !== lastScale || f.style.transform !== tr) { lastScale = tr; f.style.transform = tr; }
  }
  (function () {
    var frame = el('home-reel-frame');
    if (frame && typeof ResizeObserver !== 'undefined') new ResizeObserver(syncReelScale).observe(frame);
  })();

  /* ── the home-page-top scroll marker (DOWN only) ──
     No longer tied to the video — see PLACEMENT below. Styling mirrors the
     list scroll markers. */
  function refreshMarker() {
    var m = el('reel-scroll-marker');
    if (!m) return;
    var inner = m.firstElementChild;
    var g = (window.REEL_MARKER_GLYPH != null ? window.REEL_MARKER_GLYPH : '\u2193');
    if (inner && inner.textContent !== g) inner.textContent = g;
    m.style.fontSize = (Number(window.REEL_MARKER_SIZE) || 24) + 'px';
    m.style.setProperty('--smk-amt', (Number(window.REEL_MARKER_ANIM_SIZE) || 0) + 'px');
    m.style.setProperty('--smk-dur', (Number(window.REEL_MARKER_ANIM_SPEED) || 1.4) + 's');
    m.classList.toggle('anim', window.REEL_MARKER_ANIM !== false);

    /* PLACEMENT (Tweaks → Scroll markers → Home page top; REEL_MARKER_PLACE):
       'content' — in the main content section: Y px above the window bottom,
                   X px from the section's centre. Lives inside .home-reel so
                   it rides up with the reel on scroll.
       'toolbar' — under the short bio: Y px below the bio's bottom (so it
                   follows the bio as it reflows with the panel width), aligned
                   left / center / right within the panel's margins. Moved to
                   <body> (position:fixed, above the panel) since .home-reel
                   paints beneath the toolbar. Falls back to 'content' when the
                   toolbar is collapsed (no visible bio). */
    var site = document.querySelector('.site');
    var bio = document.querySelector('#left-panel .lp-home-bio');
    var lp = el('left-panel');
    var inTb = window.REEL_MARKER_PLACE === 'toolbar' && bio && lp && bio.offsetParent
               && !(site && site.classList.contains('tb-collapsed'));
    var home = el('home-reel');
    if (inTb && m.parentNode !== document.body) document.body.appendChild(m);
    if (!inTb && home && m.parentNode !== home) home.appendChild(m);
    m.classList.toggle('in-toolbar', !!inTb);
    if (inTb) {
      var br = bio.getBoundingClientRect(), pr = lp.getBoundingClientRect();
      var pad = parseFloat(getComputedStyle(lp).getPropertyValue('--left-pad'));
      if (isNaN(pad)) pad = 28;
      var al = window.REEL_MARKER_TB_ALIGN || 'left';
      var x = al === 'right' ? pr.right - pad : al === 'center' ? (pr.left + pr.right) / 2 : pr.left + pad;
      m.style.bottom = 'auto';
      m.style.top  = Math.round(br.bottom + (Number(window.REEL_MARKER_TB_Y) || 0)) + 'px';
      m.style.left = Math.round(x) + 'px';
      m.style.transform = al === 'right' ? 'translateX(-100%)' : al === 'center' ? 'translateX(-50%)' : 'none';
    } else {
      var lw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-w'));
      if (isNaN(lw)) lw = 0;
      if (site && site.classList.contains('tb-collapsed')) lw = 0;
      if (document.documentElement.classList.contains('reel-full')) lw = 0;
      var cx = lw + (window.innerWidth - lw) / 2;
      m.style.top = 'auto';
      m.style.bottom = Math.round(Number(window.REEL_MARKER_CONTENT_Y) || 0) + 'px';
      m.style.left = Math.round(cx + (Number(window.REEL_MARKER_CONTENT_X) || 0)) + 'px';
      m.style.transform = '';
    }
    m.classList.toggle('is-visible', S.on && S.p < 0.02);
  }

  /* ── paint the current progress ──
     Both offsets are rounded to WHOLE PIXELS. A layer parked at a fractional
     translate is painted with antialiased edges, and the coverage of that
     partial row shifts frame to frame — which read as a shimmer along the
     reel's top/bottom edges while the slide eased to a stop. At this speed the
     rounding is invisible. */
  function apply() {
    var reel = el('home-reel'), proj = el('home-projects');
    var H    = vh();
    var lift = Math.round((1 - S.p) * H);   /* project section, below the fold */
    var up   = Math.round(S.p * H);         /* reel, above the fold */

    if (proj) proj.style.transform = lift ? ('translateY(' + lift + 'px)') : 'none';
    if (reel) {
      /* keep an explicit translate3d at rest too: dropping to `none` demotes
         the compositing layer and the re-raster flashes the edges */
      reel.style.transform  = 'translate3d(0,' + (-up) + 'px,0)';
      reel.style.visibility = (S.p > 0.999) ? 'hidden' : '';
    }
    document.documentElement.style.setProperty('--home-lift', lift + 'px');
    /* toolbar slide-in (html.tb-slide) rides the same progress */
    document.documentElement.style.setProperty('--intro-p', S.p.toFixed(4));
    document.documentElement.classList.toggle('intro-away', S.p > 0.02);
    /* staggered bio: make sure the line spans exist before the slide starts
       (a freshly rendered home toolbar has none until prepBioLines runs) */
    if (S.p > 0 && window.prepBioLines && document.documentElement.classList.contains('bio-stagger')) {
      var hb = document.querySelector('#left-panel .lp-home-bio');
      if (hb && !hb.querySelector('.bw')) window.prepBioLines();
    }

    /* the tag row + hit area are positioned from measured viewport rects, so
       they need re-solving against the new lift every frame it changes */
    if (window.positionMiniTags) window.positionMiniTags();
    refreshMarker();

    if (S.p < 0.999) ensureReel();
    reelPlayback(S.p < 0.999);
    /* a bio link's hover media held through a filter-link slide (index.html) */
    if (window.BioHover && window.BioHover.onProgress) window.BioHover.onProgress(S.p, S.target);
  }

  /* The tween runs off BOTH requestAnimationFrame and a 16ms interval, and
     step() uses the real elapsed time — so it is smooth where rAF is healthy
     and still completes in rAF-starved contexts (offscreen tabs, the nested
     preview harness), where an rAF-only loop would freeze mid-slide. Whichever
     source fires first just makes the next step smaller. */
  function start() {
    if (S.timer == null) {
      S.ft = performance.now();
      S.timer = setInterval(function () { step(performance.now()); }, 16);
    }
    scheduleRaf();
  }
  function scheduleRaf() {
    if (S.raf != null) return;
    S.raf = requestAnimationFrame(function (t) { S.raf = null; step(t); });
  }
  function stopLoop() {
    if (S.timer != null) { clearInterval(S.timer); S.timer = null; }
  }
  function step(now) {
    var dt = Math.min(Math.max(now - S.ft, 0), 50);
    S.ft = now;
    var k = 1 - Math.pow(1 - LERP, dt / (1000 / 60));
    /* snap threshold in PROGRESS units, sized so the residual can never be a
       visible pixel: 0.002 · viewport ≈ 1px. A looser tail would let a starved
       rAF context rest a pixel off its locked position. */
    var diff = S.target - S.p;
    if (Math.abs(diff) * vh() < 0.6) S.p = S.target;
    else S.p += diff * k;
    apply();
    if (S.p !== S.target) scheduleRaf();
    else stopLoop();
  }

  function nudge(d) {
    S.dir    = d > 0 ? 1 : -1;
    S.target = clamp01(S.target + d / dist());
    if (S.commitT) clearTimeout(S.commitT);
    S.commitT = setTimeout(commit, COMMIT_MS);
    start();
  }
  /* once the input settles, always LOCK to an end state (never mid-slide) */
  function commit() {
    S.commitT = null;
    if (S.touching) return;
    S.target = (S.dir > 0) ? 1 : 0;
    start();
  }

  /* is the active display scrolled to its own top / left edge? */
  function displayAtTop() {
    if (window.DISPLAY_MODE === 'gallery') {
      var st = el('gallery-stage');
      return !st || st.scrollLeft <= 2;
    }
    if (window.ListGallery && window.ListGallery.atTop) return window.ListGallery.atTop();
    return true;
  }

  /* which way, if at all, does this delta belong to us? */
  function owns(d) {
    if (!d) return false;
    if (S.p > 0.001 && S.p < 0.999) return true;   /* mid-transition */
    if (d > 0) return S.p < 0.999;                 /* reveal */
    return displayAtTop();                          /* hand back to the reel */
  }

  function consume(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (window.ListGallery && window.ListGallery.stop) window.ListGallery.stop();
    if (window.AdaptiveInvert && window.AdaptiveInvert.ping) window.AdaptiveInvert.ping(700);
  }
  function inPanel(t) { return !!(t && t.closest && t.closest('#tweaks-root')); }

  window.addEventListener('wheel', function (e) {
    if (!S.on || !active() || inPanel(e.target)) return;
    var d = e.deltaY;
    if (!owns(d)) return;
    consume(e);
    nudge(d);
  }, { capture: true, passive: false });

  /* touch (iPad): swiping up reveals, swiping down at the top hands back */
  window.addEventListener('touchstart', function (e) {
    if (!S.on || !active() || inPanel(e.target)) return;
    if (e.touches.length !== 1) return;
    S.touchY = e.touches[0].clientY;
  }, { capture: true, passive: true });
  window.addEventListener('touchmove', function (e) {
    if (!S.on || !active() || S.touchY == null || e.touches.length !== 1) return;
    var y = e.touches[0].clientY;
    var d = (S.touchY - y) * 1.4;    /* finger up = scrolling down */
    if (Math.abs(d) < 1) return;
    if (!owns(d)) { S.touchY = y; return; }
    S.touching = true;
    S.touchY = y;
    consume(e);
    nudge(d);
  }, { capture: true, passive: false });
  window.addEventListener('touchend', function () {
    S.touchY = null;
    if (!S.touching) return;
    S.touching = false;
    commit();
  }, { capture: true, passive: true });

  window.addEventListener('resize', function () { syncReelScale(); if (S.on) apply(); });

  /* the marker doubles as a button — clicking it plays the same reveal */
  document.addEventListener('click', function (e) {
    var m = e.target && e.target.closest ? e.target.closest('#reel-scroll-marker') : null;
    if (!m || !S.on || !active()) return;
    S.dir = 1;
    S.target = 1;
    if (window.ListGallery && window.ListGallery.stop) window.ListGallery.stop();
    start();
  });

  window.HomeIntro = {
    /* entering the home route */
    enter: function () {
      S.on = true;
      document.documentElement.classList.add('intro-live');
      if (window.prepBioLines) requestAnimationFrame(window.prepBioLines);
      if (S.p < 0.999) ensureReel();
      apply();
    },
    /* leaving it — unload the embed so nothing plays behind the page */
    leave: function () {
      S.on = false;
      document.documentElement.classList.remove('intro-live', 'intro-away');
      if (S.commitT) { clearTimeout(S.commitT); S.commitT = null; }
      stopLoop();
      blankReel();
      var m = el('reel-scroll-marker');
      if (m) m.classList.remove('is-visible');
    },
    refresh: function () { if (S.on) apply(); else refreshMarker(); },
    /* play the reel → project-list slide (the down marker's click, and bio
       links in filter mode); no-op once the list is already showing */
    reveal: function () {
      if (!S.on || !active()) return;
      S.dir = 1;
      S.target = 1;
      if (window.ListGallery && window.ListGallery.stop) window.ListGallery.stop();
      start();
    },
    /* kept as a no-op: the invert-over-reel feature was removed */
    syncInvert: function () {},
    progress: function () { return S.p; },
    lift: function () { return (1 - S.p) * vh(); },
    /* jump straight to an end state (no animation) */
    set: function (p) {
      S.p = S.target = clamp01(Number(p) || 0);
      stopLoop();
      apply();
    }
  };
})();
