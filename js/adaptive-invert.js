/* ======================================================================
   ADAPTIVE INVERT — per-portion text inversion over home thumbnails.

   Goal: only the part of the mini description / regular filter labels that
   OVERLAPS a thumbnail inverts (per-pixel, legible on any image); the part
   over the white page stays crisp normal-colour text.

   Method (per registered text element):
     • A duplicate ".ai-copy" overlay is positioned exactly over the original,
       with mix-blend-mode:difference and INVERSE text colour (--inv-text).
     • The ORIGINAL is masked to EXCLUDE the overlapping thumbnail region
       (so it shows only over the page → crisp subpixel text).
     • The COPY is masked to ONLY that region (so difference-blends per-pixel
       against the image behind it).
   Complementary masks → each glyph portion paints exactly once, no double
   blend. Over the white gaps inside the region, difference(inverse, white)
   reproduces the normal colour, so a single UNION rectangle of the overlapping
   thumbnails is a perfect approximation (no need to mask each tile precisely).

   Efficiency:
     • No permanent RAF. Work runs in short BURSTS pinged by wheel / hover /
       resize; the burst self-extends while the mask key keeps changing (i.e.
       while the list is actually moving) and stops ~400ms after it settles.
     • Per frame it reads a few getBoundingClientRect (only thumbs intersecting
       the text row) and writes styles ONLY when the mask key changed.
   Gated entirely by window.HOME_ADAPTIVE_INVERT.
   ====================================================================== */
(function () {
  'use strict';

  var targets = [];               // [{ sel, el, copy, key, srcHTML }]
  var looping = false;
  var burstUntil = 0;

  function homeVisible() {
    var hv = document.getElementById('home-view');
    return hv && hv.style.display !== 'none' ? hv : null;
  }
  /* per-target enable flag (each target has its own toggle) */
  function targetOn(t) {
    if (!(homeVisible() && t.flag && window[t.flag] === true)) return false;
    if (t.kind === 'pill') {
      /* the active (selected) filter pill has its own solid fill — never invert it */
      if (t.el.classList.contains('active')) return false;
    }
    /* optional: suppress the invert while THIS element is hovered (e.g. a
       filter pill with "invert on hover" off) — per-pill, so hovering one pill
       never affects another. */
    if (t.noHoverFlag && window[t.noHoverFlag] === false) {
      try { if (t.el.matches(':hover')) return false; } catch (e) {}
    }
    return true;
  }
  function anyOn() {
    return targets.some(targetOn);
  }

  function ensureCopy(t) {
    if (t.copy && t.copy.isConnected) return;
    var hv = document.getElementById('home-view');
    if (!hv) return;
    var copy = t.el.cloneNode(true);
    copy.classList.add('ai-copy');
    copy.setAttribute('aria-hidden', 'true');
    copy.removeAttribute('id');
    /* append to #home-view (NOT next to the original): the copy is
       position:fixed and must be viewport-relative. .mini-info has a
       transform (translateY) which would make a fixed child positioned
       relative to IT, landing the copy in the wrong place. #home-view has no
       transform, so fixed = viewport. */
    hv.appendChild(copy);
    t.copy = copy;
    t.srcHTML = null;               // force a content sync
  }

  function syncContent(t) {
    if (t.el.innerHTML !== t.srcHTML) {
      t.srcHTML = t.el.innerHTML;
      t.copy.innerHTML = t.el.innerHTML;
    }
  }

  /* union rectangle of DARK thumbnails intersecting the text's box (viewport
     coords). Only tiles whose OWN project is flagged `dark` are included, so
     the copy never covers a light tile (no ugly seam over white) — and this is
     correct in gallery mode too, where the text may sit over a different tile
     than the one hovered. */
  function darkIdSet() {
    var set = {};
    var list = window.projects || [];
    for (var i = 0; i < list.length; i++) if (list[i].dark) set[list[i].id] = true;
    return set;
  }
  function overlapRect(er) {
    var dark = darkIdSet();
    var thumbs = document.querySelectorAll('#home-view .list-thumb, #home-view .gal-thumb');
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, found = false;
    for (var i = 0; i < thumbs.length; i++) {
      var owner = thumbs[i].closest('[data-id]');
      if (!owner || !dark[owner.getAttribute('data-id')]) continue;   // only dark tiles
      var r = thumbs[i].getBoundingClientRect();
      var ix0 = Math.max(r.left, er.left), iy0 = Math.max(r.top, er.top);
      var ix1 = Math.min(r.right, er.right), iy1 = Math.min(r.bottom, er.bottom);
      if (ix1 <= ix0 || iy1 <= iy0) continue;
      found = true;
      if (ix0 < x0) x0 = ix0; if (iy0 < y0) y0 = iy0;
      if (ix1 > x1) x1 = ix1; if (iy1 > y1) y1 = iy1;
    }
    return found ? { left: x0, top: y0, right: x1, bottom: y1 } : null;
  }

  function clearTarget(t) {
    if (t.copy) t.copy.style.display = 'none';
    clearMask(t.el);
    t.key = 'off';
  }

  /* ── mask helpers ──
     We hide/show rectangular regions with `mask` (NOT clip-path): masks do
     NOT clip pointer events, so the base text keeps its full hit region even
     where a region is masked out — essential for the interactive filter pills
     (clip-path made the thumbnail-overlap portion unhoverable, which also made
     :hover oscillate → flicker). Each layer is an opaque box; the default
     mask-composite (add) unions them. */
  function setMask(el, layers) {
    if (!layers.length) { clearMask(el); return; }
    var img = [], pos = [], size = [], rep = [];
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      img.push('linear-gradient(#000,#000)');
      pos.push(L.x + 'px ' + L.y + 'px');
      size.push(L.w + 'px ' + L.h + 'px');
      rep.push('no-repeat');
    }
    var im = img.join(','), p = pos.join(','), s = size.join(','), r = rep.join(',');
    el.style.webkitMaskImage = im; el.style.maskImage = im;
    el.style.webkitMaskPosition = p; el.style.maskPosition = p;
    el.style.webkitMaskSize = s; el.style.maskSize = s;
    el.style.webkitMaskRepeat = r; el.style.maskRepeat = r;
  }
  function clearMask(el) {
    el.style.webkitMaskImage = ''; el.style.maskImage = '';
    el.style.webkitMaskPosition = ''; el.style.maskPosition = '';
    el.style.webkitMaskSize = ''; el.style.maskSize = '';
    el.style.webkitMaskRepeat = ''; el.style.maskRepeat = '';
  }
  /* fully hide an element via a transparent mask (used when the overlap covers
     the WHOLE element — bandLayers would return zero bands, which as an empty
     mask means "no mask = fully visible", the opposite of what we want). */
  function hideMask(el) {
    var g = 'linear-gradient(rgba(0,0,0,0),rgba(0,0,0,0))';
    el.style.webkitMaskImage = g; el.style.maskImage = g;
    el.style.webkitMaskPosition = '0 0'; el.style.maskPosition = '0 0';
    el.style.webkitMaskSize = '100% 100%'; el.style.maskSize = '100% 100%';
    el.style.webkitMaskRepeat = 'no-repeat'; el.style.maskRepeat = 'no-repeat';
  }
  /* four bands covering the WxH box EXCEPT the hole (L,T,R,B) — for the base
     (shows everything but the overlap) */
  function bandLayers(W, H, L, T, R, B) {
    var a = [];
    if (T > 0)                 a.push({ x: 0, y: 0, w: W, h: T });
    if (H - B > 0)             a.push({ x: 0, y: B, w: W, h: H - B });
    if (B - T > 0 && L > 0)    a.push({ x: 0, y: T, w: L, h: B - T });
    if (B - T > 0 && W - R > 0) a.push({ x: R, y: T, w: W - R, h: B - T });
    return a;
  }

  function positionCopy(t, er) {
    var c = t.copy;
    c.style.display = '';
    c.style.position = 'fixed';
    c.style.boxSizing = 'border-box';
    c.style.left = er.left + 'px';
    c.style.top = er.top + 'px';
    c.style.width = er.width + 'px';
    c.style.height = er.height + 'px';
  }

  function applyTarget(t, er, o) {
    var key = o
      ? Math.round(er.left) + ',' + Math.round(er.top) + ',' + Math.round(er.width) + ',' + Math.round(er.height)
        + '|' + Math.round(o.left) + ',' + Math.round(o.top) + ',' + Math.round(o.right) + ',' + Math.round(o.bottom)
      : 'none';
    var changed = t.key !== key;
    t.key = key;

    if (!o) {                       // no overlap → crisp original, hide copy
      if (changed) { clearMask(t.el); if (t.copy) t.copy.style.display = 'none'; }
      return changed;
    }

    positionCopy(t, er);            // copy tracks position every applicable frame
    syncContent(t);
    if (!changed) return false;

    var W = er.width, H = er.height;
    var L = Math.max(0, o.left - er.left), T = Math.max(0, o.top - er.top);
    var R = Math.min(W, o.right - er.left), B = Math.min(H, o.bottom - er.top);

    // COPY: show ONLY the overlap box (single positive mask layer)
    setMask(t.copy, [{ x: L, y: T, w: R - L, h: B - T }]);
    // BASE: show everything EXCEPT the overlap box. Four bands normally; but if
    // the overlap covers the WHOLE element (zero bands) hide the base entirely,
    // otherwise the copy + base would both paint (double text).
    var bands = bandLayers(W, H, L, T, R, B);
    if (bands.length === 0) hideMask(t.el);
    else setMask(t.el, bands);
    return true;
  }

  function update() {
    if (!anyOn()) { for (var k = 0; k < targets.length; k++) clearTarget(targets[k]); return false; }
    var anyChange = false;
    var jobs = [];
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t.el || !t.el.isConnected) continue;
      if (!targetOn(t)) { clearTarget(t); continue; }
      var er = t.el.getBoundingClientRect();
      if (er.width === 0 || er.height === 0) { clearTarget(t); continue; }
      ensureCopy(t);
      jobs.push({ t: t, er: er, o: overlapRect(er) });
    }
    for (var j = 0; j < jobs.length; j++) {
      if (applyTarget(jobs[j].t, jobs[j].er, jobs[j].o)) anyChange = true;
    }
    return anyChange;
  }

  function loop(now) {
    var changed = update();
    if (changed) burstUntil = Math.max(burstUntil, now + 450);  // keep alive while moving
    if (now < burstUntil) { requestAnimationFrame(loop); }
    else { looping = false; }
  }

  function ping(ms) {
    burstUntil = Math.max(burstUntil, performance.now() + (ms || 450));
    if (!looping) { looping = true; requestAnimationFrame(loop); }
  }

  /* ── public: (re)register the text elements + kick an update ──
     Mini description is a single element target; the filter labels are
     registered PER PILL (so hover-suppression and dark-overlap are computed
     independently for each pill — hovering one never affects another). */
  function ensureElTarget(sel, flag) {
    var el = document.querySelector(sel);
    if (!el) return;
    var ex = targets.filter(function (t) { return t.kind === 'el' && t.sel === sel; })[0];
    if (!ex) targets.push({ kind: 'el', sel: sel, flag: flag, el: el, copy: null, key: '', srcHTML: null });
    else if (ex.el !== el) { ex.el = el; ex.copy = null; ex.key = ''; }
  }
  function refresh() {
    ensureElTarget('#mini-desc', 'MINI_INVERT_OVER');

    /* reconcile per-pill filter targets against the current pills */
    var pills = [].slice.call(document.querySelectorAll('.lp-filter-block .filter-pill'));
    targets = targets.filter(function (t) {
      if (t.kind !== 'pill') return true;
      if (pills.indexOf(t.el) === -1) {           // pill gone → drop its copy
        if (t.copy && t.copy.parentNode) t.copy.parentNode.removeChild(t.copy);
        return false;
      }
      return true;
    });
    pills.forEach(function (p) {
      if (!targets.some(function (t) { return t.kind === 'pill' && t.el === p; })) {
        targets.push({ kind: 'pill', el: p, flag: 'FILTER_INVERT_OVER',
                       noHoverFlag: 'FILTER_INVERT_HOVER', copy: null, key: '', srcHTML: null });
      }
    });

    if (!anyOn()) { targets.forEach(clearTarget); return; }
    ping(150);
  }

  // event pings — cover scroll momentum, hover-scale, responsive resize/collapse
  window.addEventListener('wheel', function () { if (anyOn()) ping(650); }, { passive: true });
  window.addEventListener('resize', function () { if (anyOn()) ping(650); });
  document.addEventListener('mouseover', function (e) {
    if (anyOn() && e.target.closest && e.target.closest('#home-view .gal-item, #home-view .list-item')) ping(500);
  }, { passive: true });
  /* filter-pill enter/leave → when "invert on hover" is OFF, toggle THIS pill's
     invert SYNCHRONOUSLY (not on the next rAF) so it lands on the same frame as
     the :hover recolour — otherwise there's a one-frame lag where the copy is
     still shown / the base still masked, seen as a dark flash. */
  function pillTargetFor(el) {
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].kind === 'pill' && targets[i].el === el) return targets[i];
    }
    return null;
  }
  document.addEventListener('mouseover', function (e) {
    if (!anyOn()) return;
    var pill = e.target.closest && e.target.closest('.lp-filter-block .filter-pill');
    if (!pill) return;
    if (window.FILTER_INVERT_HOVER === false) {
      /* kill the colour transition for this pill so revealing the base on hover
         SNAPS straight to the hover colour — otherwise the just-unmasked overlap
         text animates from its default (dark) colour and reads as a dark flash
         over the thumbnail before the hover colour arrives. */
      pill.style.transition = 'none';
      var t = pillTargetFor(pill);
      if (t) clearTarget(t);          // instant: crisp base, hidden copy
    }
    ping(250);
  }, { passive: true });
  document.addEventListener('mouseout', function (e) {
    if (!anyOn()) return;
    var pill = e.target.closest && e.target.closest('.lp-filter-block .filter-pill');
    if (!pill) return;
    pill.style.transition = '';        // restore the normal hover transition
    ping(250);                         // re-apply invert once the pointer leaves
  }, { passive: true });
  // toolbar collapse/expand slide finishes → re-measure
  document.addEventListener('transitionend', function (e) {
    if (anyOn() && e.target && e.target.classList && e.target.classList.contains('left')) ping(200);
  });

  window.AdaptiveInvert = { refresh: refresh, ping: ping, update: update };
})();
