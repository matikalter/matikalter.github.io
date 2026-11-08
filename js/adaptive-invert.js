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
   reproduces the normal colour — but text spanning TWO dark tiles with a page
   gap between them gets PER-TILE holes (not one union rect), so the gap stays
   crisp base text instead of an invisible white-on-white difference chunk.

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

  /* ids of projects whose thumbnail is flagged `dark` */
  function darkIdSet() {
    var set = {};
    var list = window.projects || [];
    for (var i = 0; i < list.length; i++) if (list[i].dark) set[list[i].id] = true;
    return set;
  }
  /* PER-TILE dark-thumbnail intersections with the text's ink rect (viewport
     coords) — an ARRAY of rects, one per dark tile the text crosses. A single
     union rect is WRONG when a long title clips TWO dark tiles with a page gap
     between them: the union hole would hand the gap to the inverted copy
     (white-on-white → invisible chunk). Per-tile holes keep text between dark
     tiles as crisp normal base text. Only tiles whose OWN project is flagged
     `dark` are included, so the copy never covers a light tile — correct in
     gallery mode too, where the text may sit over a different tile than the
     one hovered. */
  function overlapRects(er) {
    var dark = darkIdSet();
    var thumbs = document.querySelectorAll('#home-view .list-thumb, #home-view .gal-thumb');
    var out = [];
    for (var i = 0; i < thumbs.length; i++) {
      var owner = thumbs[i].closest('[data-id]');
      if (!owner || !dark[owner.getAttribute('data-id')]) continue;   // only dark tiles
      var r = thumbs[i].getBoundingClientRect();
      var ix0 = Math.max(r.left, er.left), iy0 = Math.max(r.top, er.top);
      var ix1 = Math.min(r.right, er.right), iy1 = Math.min(r.bottom, er.bottom);
      if (ix1 <= ix0 || iy1 <= iy0) continue;
      out.push({ left: ix0, top: iy0, right: ix1, bottom: iy1 });
    }
    return out.length ? out : null;
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
    el.style.webkitClipPath = ''; el.style.clipPath = '';   // mask mode clears clip mode
  }
  /* CLIP-PATH variant of setMask — used when the text's ink OVERFLOWS its box
     (a title word wider than its tile). ANY mask hard-clips painted ink to the
     element's border box in Chrome (mask-clip:no-clip parses but is not
     honoured), which is what cut long words off — and only with invert on,
     because that's when masks apply. clip-path shapes MAY extend beyond the
     border box and reveal overflowing ink. Only used on pointer-events:none
     targets (gal-info / mini) — clip-path clips hit-testing, which is why the
     interactive filter pills keep masks (they never overflow their box). */
  function setClip(el, rects) {
    var d = '';
    for (var i = 0; i < rects.length; i++) {
      var rc = rects[i];
      d += 'M' + rc.x.toFixed(2) + ' ' + rc.y.toFixed(2)
         + 'H' + (rc.x + rc.w).toFixed(2)
         + 'V' + (rc.y + rc.h).toFixed(2)
         + 'H' + rc.x.toFixed(2) + 'Z';
    }
    var v = rects.length ? 'path("' + d + '")' : 'inset(100%)';   // empty = fully hidden
    el.style.webkitClipPath = v; el.style.clipPath = v;
    // clip mode clears mask mode
    el.style.webkitMaskImage = ''; el.style.maskImage = '';
    el.style.webkitMaskPosition = ''; el.style.maskPosition = '';
    el.style.webkitMaskSize = ''; el.style.maskSize = '';
    el.style.webkitMaskRepeat = ''; el.style.maskRepeat = '';
  }
  function clearMask(el) {
    el.style.webkitMaskImage = ''; el.style.maskImage = '';
    el.style.webkitMaskPosition = ''; el.style.maskPosition = '';
    el.style.webkitMaskSize = ''; el.style.maskSize = '';
    el.style.webkitMaskRepeat = ''; el.style.maskRepeat = '';
    el.style.webkitClipPath = ''; el.style.clipPath = '';
  }
  /* fully hide an element via a transparent mask (used when the holes cover
     the WHOLE element — complementRects would return zero bands, which as an
     empty mask means "no mask = fully visible", the opposite of what we want). */
  function hideMask(el) {
    var g = 'linear-gradient(rgba(0,0,0,0),rgba(0,0,0,0))';
    el.style.webkitMaskImage = g; el.style.maskImage = g;
    el.style.webkitMaskPosition = '0 0'; el.style.maskPosition = '0 0';
    el.style.webkitMaskSize = '100% 100%'; el.style.maskSize = '100% 100%';
    el.style.webkitMaskRepeat = 'no-repeat'; el.style.maskRepeat = 'no-repeat';
  }
  /* Generalised rect subtraction — rc minus hole → up to 4 bands. Coords are
     box-relative {x0,y0,x1,y1} and MAY be negative or exceed the box (the
     outer rect is the union of the element box and its text ink, so
     overflowing glyphs are covered and never masked away). */
  function subtractRect(rc, h) {
    var hx0 = Math.max(rc.x0, h.x0), hy0 = Math.max(rc.y0, h.y0);
    var hx1 = Math.min(rc.x1, h.x1), hy1 = Math.min(rc.y1, h.y1);
    if (hx1 <= hx0 || hy1 <= hy0) return [rc];      // no intersection → unchanged
    var a = [];
    if (hy0 > rc.y0) a.push({ x0: rc.x0, y0: rc.y0, x1: rc.x1, y1: hy0 });  // top
    if (rc.y1 > hy1) a.push({ x0: rc.x0, y0: hy1, x1: rc.x1, y1: rc.y1 });  // bottom
    if (hx0 > rc.x0) a.push({ x0: rc.x0, y0: hy0, x1: hx0, y1: hy1 });      // left
    if (rc.x1 > hx1) a.push({ x0: hx1, y0: hy0, x1: rc.x1, y1: hy1 });      // right
    return a;
  }
  /* complement of N holes within an outer rect — iterative subtraction */
  function complementRects(outer, holes) {
    var list = [outer];
    for (var i = 0; i < holes.length; i++) {
      var next = [];
      for (var j = 0; j < list.length; j++) next = next.concat(subtractRect(list[j], holes[i]));
      list = next;
    }
    return list;
  }
  /* the element's TEXT INK rect (viewport coords), unioned with its box. A long
     word wider than the element paints OUTSIDE the box; getBoundingClientRect on
     the element misses that ink, but a Range over its contents captures it. */
  function inkRectFor(el, er) {
    try {
      var rng = document.createRange();
      rng.selectNodeContents(el);
      var ir = rng.getBoundingClientRect();
      if (ir && (ir.width || ir.height)) {
        return {
          left: Math.min(er.left, ir.left), top: Math.min(er.top, ir.top),
          right: Math.max(er.right, ir.right), bottom: Math.max(er.bottom, ir.bottom)
        };
      }
    } catch (e) {}
    return { left: er.left, top: er.top, right: er.right, bottom: er.bottom };
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

  function applyTarget(t, er, ink, o) {
    var key = 'none';
    if (o) {
      key = Math.round(er.left) + ',' + Math.round(er.top) + ',' + Math.round(er.width) + ',' + Math.round(er.height)
        + '|' + Math.round(ink.left) + ',' + Math.round(ink.top) + ',' + Math.round(ink.right) + ',' + Math.round(ink.bottom);
      for (var ki = 0; ki < o.length; ki++) {
        var kh = o[ki];
        key += '|' + Math.round(kh.left) + ',' + Math.round(kh.top) + ',' + Math.round(kh.right) + ',' + Math.round(kh.bottom);
      }
    }
    var changed = t.key !== key;
    t.key = key;

    if (!o) {                       // no overlap → crisp original, hide copy
      if (changed) { clearMask(t.el); if (t.copy) t.copy.style.display = 'none'; }
      return changed;
    }

    positionCopy(t, er);            // copy sits on the element BOX (not the ink
                                    // rect) so its glyphs — including any that
                                    // overflow the box — register 1:1 with the
                                    // base; re-sizing the clone would re-lay-out
                                    // its text and misregister the difference blend.
    syncContent(t);
    if (!changed) return false;

    var W = er.width, H = er.height;
    /* OUTER paint rect (box ∪ ink) in box-relative coords — includes glyphs that
       overflow the element box (e.g. a title word wider than the tile) so the
       mask never cuts them off. */
    var outer = {
      x0: Math.min(0, ink.left - er.left),  y0: Math.min(0, ink.top - er.top),
      x1: Math.max(W, ink.right - er.left), y1: Math.max(H, ink.bottom - er.top)
    };
    /* HOLES = ONE rect per dark-tile ∩ ink intersection, box-relative,
       UNCLAMPED — the copy (inverted) paints each of them; text BETWEEN dark
       tiles (over the white page) stays crisp base text instead of an
       invisible white-on-white chunk of the union. */
    var holes = [], copyLayers = [];
    for (var i = 0; i < o.length; i++) {
      var h = {
        x0: o[i].left - er.left,  y0: o[i].top - er.top,
        x1: o[i].right - er.left, y1: o[i].bottom - er.top
      };
      holes.push(h);
      copyLayers.push({ x: h.x0, y: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0 });
    }

    // Does the ink overflow the border box? Chrome bounds mask painting to the
    // border box (no-clip is parsed but not honoured), so overflowing targets
    // switch to clip-path (safe: these targets are pointer-events:none).
    var overflows = outer.x0 < -0.5 || outer.y0 < -0.5 || outer.x1 > W + 0.5 || outer.y1 > H + 0.5;

    // COPY: show ONLY the holes (one layer each; both modes union them)
    if (overflows) setClip(t.copy, copyLayers);
    else setMask(t.copy, copyLayers);
    // BASE: show the whole paint rect EXCEPT the holes. If the holes cover it
    // all (zero bands) hide the base entirely, else base + copy would
    // double-paint (a dark fringe at the glyph edges).
    var bands = complementRects(outer, holes)
      .map(function (rc) { return { x: rc.x0, y: rc.y0, w: rc.x1 - rc.x0, h: rc.y1 - rc.y0 }; })
      .filter(function (b) { return b.w > 0.5 && b.h > 0.5; });
    if (overflows) setClip(t.el, bands);         // empty bands → inset(100%) hides
    else if (bands.length === 0) hideMask(t.el);
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
      var ink = inkRectFor(t.el, er);
      jobs.push({ t: t, er: er, ink: ink, o: overlapRects(ink) });
    }
    for (var j = 0; j < jobs.length; j++) {
      if (applyTarget(jobs[j].t, jobs[j].er, jobs[j].ink, jobs[j].o)) anyChange = true;
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
  /* gallery hover-info targets are transient: (re)bind to the live element(s)
     for `sel`. In hover mode there is one open info; in always-show mode there
     are many. Register one target per live element and drop stale ones (+ their
     copies). Targets are matched by their .el so re-registration is idempotent. */
  function reconcileGalInfo(sel, flag) {
    /* :not(.ai-copy) — the difference-blend clones keep the original's class
       and live in #home-view, so a bare query matches THEM too: each copy
       would register as its own target, get the base's complement bands
       written over its hole mask/clip (breaking the invert), and spawn
       copies-of-copies on every refresh. */
    var els = [].slice.call(document.querySelectorAll('#home-view ' + sel + ':not(.ai-copy)'));
    targets = targets.filter(function (t) {
      if (t.kind !== 'galinfo' || t.sel !== sel) return true;
      if (t.el && t.el.isConnected && els.indexOf(t.el) !== -1) return true;  /* keep */
      if (t.copy && t.copy.parentNode) t.copy.parentNode.removeChild(t.copy);
      if (t.el) clearMask(t.el);
      return false;
    });
    els.forEach(function (el) {
      if (!targets.some(function (t) { return t.kind === 'galinfo' && t.sel === sel && t.el === el; })) {
        targets.push({ kind: 'galinfo', sel: sel, flag: flag, el: el,
                       copy: null, key: '', srcHTML: null });
      }
    });
  }
  /* drop ALL gallery-info targets + their copies (called on unhover) */
  function dropGalInfo() {
    targets = targets.filter(function (t) {
      if (t.kind !== 'galinfo') return true;
      if (t.copy && t.copy.parentNode) t.copy.parentNode.removeChild(t.copy);
      if (t.el) clearMask(t.el);
      return false;
    });
  }
  function refresh() {
    ensureElTarget('#mini-desc', 'MINI_INVERT_OVER');

    /* (the gallery hover-info invert was removed — the gallery no longer
       registers targets here; dropGalInfo() stays for teardown safety) */

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
      /* colours only: the 4th slot is the selection-glyph PUSH transform
         (index.html .fp-item CSS), which must keep animating — unknown names
         hold the index positions so durations / delays still line up */
      pill.style.transitionProperty = 'x-snap, x-snap, x-snap, transform';
      var t = pillTargetFor(pill);
      if (t) clearTarget(t);          // instant: crisp base, hidden copy
    }
    ping(250);
  }, { passive: true });
  document.addEventListener('mouseout', function (e) {
    if (!anyOn()) return;
    var pill = e.target.closest && e.target.closest('.lp-filter-block .filter-pill');
    if (!pill) return;
    pill.style.transitionProperty = '';   // restore the normal hover transition
    ping(250);                         // re-apply invert once the pointer leaves
  }, { passive: true });
  // toolbar collapse/expand slide finishes → re-measure
  document.addEventListener('transitionend', function (e) {
    if (anyOn() && e.target && e.target.classList && e.target.classList.contains('left')) ping(200);
  });

  window.AdaptiveInvert = { refresh: refresh, ping: ping, update: update, dropGalInfo: dropGalInfo };
})();
