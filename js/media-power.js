/* ─────────────────────────────────────────────────────────────────────────────
   MEDIA POWER — keeps the number of LIVE video decoders proportional to what is
   actually on screen. Nothing a viewer can see ever pauses; this is invisible.

   Why: a project page like Lightricks / Consumania / Bloom mounts EVERY
   localvideo + richvideo block at once as `autoplay muted loop`, so every clip
   below the fold spins up its own decoder and keeps decoding forever. Browsers
   cap simultaneous decoders and the surplus is pure GPU/compositing load — the
   single largest source of jank (and of Electron GPU-process crashes) on the
   heavier pages.

   TWO mechanisms:
   1. VIEWPORT GATING — a rect pass with a FULL viewport of slack pauses a clip
      only once it is more than a screen away, and resumes it a screen before it
      can be seen. Scrolling looks identical.
      Rect pass, NOT IntersectionObserver: IO delivery rides the rendering
      lifecycle, which is starved in offscreen / embedded preview contexts (the
      same reason the gallery keeps an interval watchdog and mobile-app.js gates
      its embeds on a rect pass) — there IO simply never fires and every clip
      stays live. The pass is timer-debounced, runs off scroll/resize only, and
      measures a dozen elements, so it is far cheaper than what it prevents.
   2. TAB SUSPEND — a hidden tab keeps decoding video. On `visibilitychange`
      everything pauses; on return it resumes exactly where it was.
      Deliberately NOT wired to window `blur`: an unfocused but still-VISIBLE
      window must keep playing (pausing there would be a real behaviour change).

   NOT managed here — owned elsewhere, excluded from the pass:
     .lp-gif-media          the toolbar hero pair. HeroLoop owns the frame-exact
                            seam (it parks the off copy at playbackRate 0, which
                            is NOT `paused`, so a generic pause would cold-start
                            its decode pipeline). Suspend calls HeroLoop.pause()
                            and resume calls HeroLoop.applyMode() instead.
     #gal-vpool / #pg-vpool the shared source videos the canvas tiles mirror;
                            the galleries own their build/destroy lifecycle.
                            Suspend still pauses them (and resume replays them).
     list / gallery thumbs  on screen by construction — never gated.

   Auto-pauses are stamped data-mp-auto so (a) a user's OWN pause is never
   undone, and (b) the richvideo control set doesn't flash its "paused" state
   (portfolio.js / mobile-app.js check the stamp in their `pause` listeners).

   API: window.MediaPower.{scan, suspend, resume}
   ──────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* videos owned by another controller — never tracked, never viewport-gated */
  var SKIP = '.lp-gif-media, #gal-vpool video, #pg-vpool video, #home-reel-alt video,' +
             '.list-thumb-media video, .gal-thumb video';

  var tracked = [], scanQ = 0, passQ = 0;
  var suspended = false, resumeList = [];

  function matches(v, sel) { try { return v.matches(sel); } catch (e) { return false; } }
  function isSkipped(v) { return matches(v, SKIP); }
  function isHero(v) { return matches(v, '.lp-gif-media'); }

  /* a real user pause (richvideo tap-to-pause, desktop + mobile) must survive */
  function userPaused(v) {
    return !!(v.closest && v.closest('.rv-stage.is-paused, .m-rv-stage.is-paused'));
  }
  function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  function autoPause(v) {
    if (v.paused) return;                 /* already paused → don't claim it */
    v.dataset.mpAuto = '1';
    try { v.pause(); } catch (e) {}
  }
  function autoResume(v) {
    if (!v.paused || v.dataset.mpAuto !== '1') return;
    if (userPaused(v)) return;
    delete v.dataset.mpAuto;
    play(v);
  }

  /* ── viewport gating ── */
  /* near = within ONE full viewport above or below the screen, so a clip is
     always running well before it can be seen */
  function near(v) {
    var b = v.getBoundingClientRect();
    if (!b.width && !b.height) return false;        /* detached / display:none */
    var vh = window.innerHeight || 0;
    return b.bottom > -vh && b.top < vh * 2;
  }
  function pass() {
    if (suspended) return;                          /* hidden tab: suspend owns it */
    for (var i = tracked.length - 1; i >= 0; i--) {
      var v = tracked[i];
      if (!document.contains(v)) { v.__mp = false; tracked.splice(i, 1); continue; }
      if (near(v)) autoResume(v); else autoPause(v);
    }
  }
  function queuePass() {
    if (passQ) return;
    passQ = setTimeout(function () { passQ = 0; pass(); }, 100);
  }

  function scan() {
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      if (v.__mp || isSkipped(v)) continue;
      v.__mp = true;
      tracked.push(v);
    }
    pass();
  }
  function queueScan() {
    /* setTimeout, NOT requestAnimationFrame: rAF is throttled to zero in
       offscreen / embedded preview contexts, and a scan that never runs leaves
       every clip on a freshly-routed page ungated. Timers tick everywhere. */
    if (scanQ) return;
    scanQ = setTimeout(function () { scanQ = 0; scan(); settle(); }, 60);
  }
  /* a fresh page measures before its images have loaded, so blocks below the
     fold shift down as they arrive — re-measure a few times while it settles
     (scroll/resize cover everything after that) */
  function settle() {
    setTimeout(pass, 500);
    setTimeout(pass, 1500);
    setTimeout(pass, 3200);
  }

  /* ── tab suspend ── */
  function suspend() {
    if (suspended) return;
    suspended = true;
    resumeList = [];
    try { if (window.HeroLoop && window.HeroLoop.pause) window.HeroLoop.pause(); } catch (e) {}
    var all = document.querySelectorAll('video');
    for (var i = 0; i < all.length; i++) {
      var v = all[i];
      if (isHero(v) || v.paused) continue;   /* hero handled by HeroLoop above */
      v.dataset.mpAuto = '1';
      try { v.pause(); } catch (e) {}
      resumeList.push(v);
    }
  }
  function resume() {
    if (!suspended) return;
    suspended = false;
    for (var i = 0; i < resumeList.length; i++) {
      var v = resumeList[i];
      if (!document.contains(v)) continue;
      autoResume(v);
    }
    resumeList = [];
    /* HeroLoop.applyMode() restores the right state for the freeze-idle tweak
       (running, or held on its current frame) — never a reset to frame 0 */
    try { if (window.HeroLoop && window.HeroLoop.applyMode) window.HeroLoop.applyMode(); } catch (e) {}
    queuePass();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) suspend(); else resume();
  });

  /* scroll is CAPTURED: project pages scroll the document, but galleries and
     the drawer scroll inner containers whose scroll events don't bubble */
  window.addEventListener('scroll', queuePass, true);
  window.addEventListener('resize', queuePass, { passive: true });
  window.addEventListener('wheel', queuePass, { passive: true });
  window.addEventListener('touchmove', queuePass, { passive: true });

  /* route changes / gallery rebuilds swap the whole content subtree — one
     debounced rescan covers every case without portfolio.js calling in */
  if (window.MutationObserver) {
    new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
  }

  scan();
  settle();
  window.MediaPower = { scan: queueScan, suspend: suspend, resume: resume };
})();
