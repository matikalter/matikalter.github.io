/* ======================================================================
   HERO CYCLE — the toolbar hero image quietly rotates through 4 fixed
   Playground clips, one step per unhover.
   ----------------------------------------------------------------------
   Fixed sequence (Jumpdude is always what's shown on a fresh page load):
     0. Jumpdude-b.gif           (default)
     1. Main-Color-Blob-A-web.mp4
     2. Blow_01_web.mp4
     3. LTX_Shapes.mp4
   Every time the mouse leaves the hero hotspot, the CURRENT clip crossfades
   into the NEXT one in the list (wrapping around) — the swap happens while
   the hero is blurred back to its idle state, so it reads as seamless; the
   opacity crossfade (duration = the "Cycle transition" tweak) adds an extra
   layer of smoothing on top of that blur.

   Markup: gifHTML() renders <div class="lp-gif"><a>...<div class="lp-gif-stack">
   <img/video class="lp-gif-media is-current">...</div><span class="lp-gif-hot">
   </a></div> — identical wrapper structure to the old single-image markup, so
   all existing Hero Image controls (size/align/blur/hue/mask/hover) still
   apply to the whole stack via the same "--gif-*" vars and ".lp-gif a" rules.

   init() re-binds the mouseleave listener each time setLeftHome/setLeftAbout
   rebuild the left panel's innerHTML (a fresh .lp-gif-hot element each time,
   so no stale-listener bookkeeping is needed).
   ====================================================================== */
(function () {
  var CYCLE = [
    'Jumpdude-b.gif',
    'Main-Color-Blob-A-web.mp4',
    'Blow_01_web.mp4',
    'LTX_Shapes.mp4'
  ];
  var VID_RE = /\.(mp4|webm|mov)$/i;
  var idx = 0;              /* resets to Jumpdude on every fresh page load */
  var swapping = false;     /* guard against overlapping advances */
  var preload = null;       /* { src, el } — the NEXT clip, warming up ahead of time */
  var BIG = 'LTX_Shapes.mp4';  /* base size boosted to 115% via .lp-gif-big (CSS) — the
                                  shared --gif-size control still scales it like the rest */

  function bigClass(src) { return src === BIG ? ' lp-gif-big' : ''; }

  function dur() { var v = window.HERO_CYCLE_DUR; return (v != null ? v : 600); }

  function makeMediaEl(src) {
    var el = document.createElement(VID_RE.test(src) ? 'video' : 'img');
    el.className = 'lp-gif-media' + bigClass(src);
    if (el.tagName === 'VIDEO') {
      el.muted = true; el.loop = true; el.playsInline = true; el.preload = 'auto';
      el.setAttribute('muted', ''); el.setAttribute('playsinline', ''); el.setAttribute('loop', '');
    } else {
      el.alt = ''; el.draggable = false;
    }
    el.src = 'assets/playground/' + src;
    return el;
  }

  /* Warm up the clip AFTER the one currently showing, off-screen, well before
     it's ever needed — a mouse-leave elsewhere in the cycle can trigger the
     swap seconds before the visitor comes back to hover again, so there's
     ample time to fully buffer. This removes the load-time lottery that made
     some pairs (whichever clip is slow to buffer) look like a sudden jump-cut
     while others looked instant: every reveal now finds its frame ready. */
  function startPreload(afterIdx) {
    var src = CYCLE[(afterIdx + 1) % CYCLE.length];
    if (preload && preload.src === src) return;
    if (preload && preload.el) { try { preload.el.pause && preload.el.pause(); } catch (e) {} }
    var el = makeMediaEl(src);
    el.style.position = 'absolute';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.overflow = 'hidden';
    document.body.appendChild(el);
    if (el.tagName === 'VIDEO') { var pr = el.play(); if (pr && pr.catch) pr.catch(function () {}); }
    preload = { src: src, el: el };
  }

  function mediaMarkup(src, cls) {
    if (VID_RE.test(src)) {
      return '<video class="lp-gif-media ' + cls + bigClass(src) + '" src="assets/playground/' + src + '" ' +
             'muted loop playsinline autoplay></video>';
    }
    return '<img class="lp-gif-media ' + cls + bigClass(src) + '" src="assets/playground/' + src + '" alt="" draggable="false">';
  }

  function gifHTML() {
    startPreload(idx);
    return '<div class="lp-gif"><a href="#/project/playground" aria-label="View Playground">' +
             '<div class="lp-gif-stack" id="lp-gif-stack">' + mediaMarkup(CYCLE[idx], 'is-current') + '</div>' +
             '<span class="lp-gif-hot"></span>' +
           '</a></div>';
  }

  function advance() {
    var stack = document.getElementById('lp-gif-stack');
    if (!stack || swapping) return;
    swapping = true;
    var next = (idx + 1) % CYCLE.length;
    var src = CYCLE[next];
    var incoming;
    if (preload && preload.src === src && preload.el) {
      incoming = preload.el;
      incoming.style.position = ''; incoming.style.width = ''; incoming.style.height = '';
      incoming.style.overflow = ''; incoming.style.pointerEvents = ''; incoming.style.opacity = '';
      preload = null;
    } else {
      incoming = makeMediaEl(src);           /* fallback: not warmed up yet (rapid cycling) */
    }
    stack.appendChild(incoming);
    /* Start the crossfade only once the incoming clip actually has a frame to
       show — starting on a blank/black decoded-nothing-yet frame fades in
       emptiness and then jump-cuts to real content once it arrives, reading
       as a sudden cut rather than a smooth dissolve. Pre-warmed clips (the
       normal case) already satisfy this instantly; a fresh fallback element
       waits for loadeddata with a short timeout guard. */
    var d = dur();
    function cleanup() {
      Array.prototype.forEach.call(stack.querySelectorAll('.lp-gif-media'), function (el) {
        if (el === incoming) return;
        if (el.tagName === 'VIDEO') {
          try { el.pause(); } catch (e) {}
          el.removeAttribute('src');
          try { el.load(); } catch (e) {}
        }
        el.remove();
      });
      swapping = false;
      startPreload(next);                    /* warm up the FOLLOWING clip right away */
    }
    function reveal() { incoming.classList.add('is-current'); setTimeout(cleanup, d + 60); }
    if (incoming.tagName === 'VIDEO') {
      var pr = incoming.play(); if (pr && pr.catch) pr.catch(function () {});
      var revealed = false;
      function revealOnce() { if (revealed) return; revealed = true; reveal(); }
      if (incoming.readyState >= 2) {
        setTimeout(revealOnce, 20);
      } else {
        incoming.addEventListener('loadeddata', revealOnce, { once: true });
        setTimeout(revealOnce, 500);   /* fallback if loading stalls */
      }
    } else {
      void incoming.offsetWidth;      /* force layout so the opacity transition runs */
      setTimeout(reveal, 20);
    }
    idx = next;
  }

  function init() {
    var hot = document.querySelector('.lp-gif .lp-gif-hot');
    if (!hot) return;
    hot.addEventListener('mouseleave', advance);
  }

  window.HeroCycle = { gifHTML: gifHTML, init: init };
})();
