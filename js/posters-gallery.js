/* ======================================================================
   POSTERS GALLERY — static, multi-column justified grid (no drag / no
   auto-scroll; the page scrolls normally). Used for any project with a
   `postersImages` array. Mirrors the "look" of the old row-based Posters
   page but is fully controllable from Tweaks → Posters Gallery.

   Layout model (crop-free, always fills the content width):
     • Images are laid out ROW-MAJOR into rows of POSTERS_COLS columns.
     • Per row, each tile is a BOX (width × height); the image sits inside
       with object-fit:contain (whitespace, if any, is invisible on white).
     • WIDTH CONFORMITY (0..1) blends each tile's box width between
       aspect-proportional (0 = justified, widths ∝ aspect ratio) and
       equal columns (1 = every column the same width).
     • HEIGHT CONFORMITY (0..1) blends each tile's box height between its
       natural height at that width (0 = heights vary) and the row's tallest
       natural height (1 = every tile in the row the same height).
     At the defaults (hc=1, wc=0) this reproduces the classic equal-height
     justified rows — i.e. the page looks like it did before.
     GAPS (POSTERS_HGAP / POSTERS_VGAP) shrink the space available to the
     images, so bigger gaps → proportionally smaller images (no separate
     size control needed). Everything recomputes on resize + tweak change.

   Per-image DESCRIPTION (title + body) surfaces in the LEFT TOOLBAR on hover,
   in place of the project description — reusing the #pg-desc overlay that the
   playground gallery uses. Independent of the playground Show-descriptions
   toggle. Click a tile → the shared image lightbox enlarges it (data-zoom).

   Reads window globals (set by applyTweaks): POSTERS_COLS, POSTERS_HGAP,
   POSTERS_VGAP, POSTERS_HCONF, POSTERS_WCONF, POSTERS_ORDER, POSTERS_DESC_DATA.
   Exposes window.PostersGallery.{build, relayout, unmount, rebuild}.
   ====================================================================== */
(function () {
  'use strict';

  var state = { mount: null, pid: null, images: [], bound: false, ro: null };
  window.__postersRatioCache = window.__postersRatioCache || {};

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function ratioForSrc(src, hint) {
    var c = window.__postersRatioCache[src];
    if (c) return c;
    if (hint) return hint;
    return 1;
  }

  /* apply the Tweaks image order: listed srcs first (in order), then any
     remaining images in their natural data order (never dropped). */
  function ordered(images) {
    var order = Array.isArray(window.POSTERS_ORDER) ? window.POSTERS_ORDER : [];
    var bySrc = {};
    images.forEach(function (im) { bySrc[im.src] = im; });
    var out = [], used = {};
    order.forEach(function (s) { if (bySrc[s] && !used[s]) { out.push(bySrc[s]); used[s] = true; } });
    images.forEach(function (im) { if (!used[im.src]) { out.push(im); used[im.src] = true; } });
    return out;
  }

  /* resolve a tile's title/body: Tweaks override (POSTERS_DESC_DATA, keyed by
     src) is authoritative when present, else fall back to inline project data */
  function descFor(src) {
    var d = (window.POSTERS_DESC_DATA && window.POSTERS_DESC_DATA[src]) || {};
    var im = null;
    for (var i = 0; i < state.images.length; i++) {
      if (state.images[i].src === src) { im = state.images[i]; break; }
    }
    im = im || {};
    return {
      title: (d.title != null) ? d.title : (im.title || ''),
      body:  (d.body  != null) ? d.body  : (im.body  || '')
    };
  }

  /* show / hide the image description in the left toolbar (reuses #pg-desc) */
  function showDesc(src) {
    var box = document.getElementById('pg-desc');
    if (!box) return;
    var info = descFor(src);
    var pd  = document.querySelector('.lp-proj-desc');
    var tEl = document.getElementById('pg-desc-title');
    var bEl = document.getElementById('pg-desc-body');
    if (tEl) { tEl.innerHTML = info.title || ''; tEl.style.display = info.title ? '' : 'none'; }
    if (bEl) { bEl.innerHTML = info.body  || ''; bEl.style.display = info.body  ? '' : 'none'; }
    var has = !!(info.title || info.body);
    box.classList.toggle('is-visible', has);
    if (pd) pd.classList.toggle('pg-hidden', has);
  }
  function hideDesc() {
    var box = document.getElementById('pg-desc');
    if (box) box.classList.remove('is-visible');
    var pd = document.querySelector('.lp-proj-desc');
    if (pd) pd.classList.remove('pg-hidden');
  }

  function currentCols() {
    var n = (window.POSTERS_COLS != null) ? Math.round(window.POSTERS_COLS) : 3;
    return Math.max(1, n);
  }

  /* (re)build the DOM: chunk images into rows of POSTERS_COLS, then size. */
  function render() {
    var mount = state.mount;
    if (!mount) return;
    var imgs = ordered(state.images);
    var pid  = state.pid;
    var N    = currentCols();
    var html = '';
    for (var start = 0; start < imgs.length; start += N) {
      html += '<div class="posters-row">';
      for (var j = start; j < Math.min(start + N, imgs.length); j++) {
        var im  = imgs[j];
        var url = 'assets/' + pid + '/' + encodeURIComponent(im.src);
        html += '<div class="posters-tile" data-src="' + String(im.src).replace(/"/g, '&quot;') + '"'
             +  ' data-hint="' + (im.ratio || '') + '">'
             +    '<img src="' + url + '" alt="" loading="lazy" draggable="false" data-zoom="1">'
             +  '</div>';
      }
      html += '</div>';
    }
    mount.innerHTML = html;

    /* measure real aspect ratios → relayout when each lands */
    Array.prototype.forEach.call(mount.querySelectorAll('.posters-tile img'), function (img) {
      var tile = img.closest('.posters-tile');
      var src  = tile.getAttribute('data-src');
      function set() {
        if (img.naturalWidth && img.naturalHeight) {
          window.__postersRatioCache[src] = img.naturalWidth / img.naturalHeight;
          relayout();
        }
      }
      if (img.complete && img.naturalWidth) set();
      else img.addEventListener('load', set, { once: true });
    });

    /* hover → surface that tile's description in the toolbar */
    Array.prototype.forEach.call(mount.querySelectorAll('.posters-tile'), function (tile) {
      tile.addEventListener('mouseenter', function () { showDesc(tile.getAttribute('data-src')); });
      tile.addEventListener('mouseleave', hideDesc);
    });

    relayout();
    /* Cached images make every relayout() above run synchronously BEFORE the
       tall gallery forces the vertical scrollbar in, so the width used is the
       pre-scrollbar one (~15px too wide → right column overflows). Re-run once
       layout has settled. The ResizeObserver (attached in build) then keeps it
       correct for the scrollbar appearing, toolbar collapse, and window resize. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { if (state.mount === mount) relayout(); });
    });
  }

  /* size every tile from the current width + gaps + conformity values. Cheap
     (no innerHTML rewrite) so it runs live on resize and tweak drags. */
  function relayout() {
    var mount = state.mount;
    if (!mount) return;
    var W = mount.clientWidth || Math.round(mount.getBoundingClientRect().width);
    if (!W) return;
    var N    = currentCols();
    var hgap = (window.POSTERS_HGAP != null) ? window.POSTERS_HGAP : 24;
    var vgap = (window.POSTERS_VGAP != null) ? window.POSTERS_VGAP : 24;
    var hc   = clamp01((window.POSTERS_HCONF != null) ? window.POSTERS_HCONF : 1);
    var wc   = clamp01((window.POSTERS_WCONF != null) ? window.POSTERS_WCONF : 0);

    var rows = mount.querySelectorAll('.posters-row');
    var refH = null;   /* height of the last FULL row — reused for a partial last row */

    Array.prototype.forEach.call(rows, function (row) {
      var tiles = row.querySelectorAll('.posters-tile');
      var k = tiles.length;
      if (!k) return;
      row.style.display = 'flex';
      row.style.alignItems = 'flex-start';
      row.style.gap = hgap + 'px';
      row.style.marginBottom = vgap + 'px';

      var ratios = [];
      Array.prototype.forEach.call(tiles, function (tile) {
        ratios.push(ratioForSrc(tile.getAttribute('data-src'), parseRatio(tile.getAttribute('data-hint'))));
      });

      var full = (k === N);
      if (!full && refH != null) {
        /* partial last row: don't stretch to full width — lay tiles out at the
           previous full row's height, natural widths, left-aligned. */
        row.style.justifyContent = 'flex-start';
        for (var p = 0; p < k; p++) {
          tiles[p].style.width  = (refH * ratios[p]).toFixed(2) + 'px';
          tiles[p].style.height = refH.toFixed(2) + 'px';
        }
        return;
      }

      row.style.justifyContent = 'flex-start';
      var avail = W - (k - 1) * hgap;
      if (avail < 1) avail = 1;
      var sumA = 0; ratios.forEach(function (a) { sumA += a; });
      if (!sumA) sumA = 1;

      var widths = [], natH = [];
      for (var i = 0; i < k; i++) {
        var wAspect = avail * ratios[i] / sumA;      /* justified target */
        var wEqual  = avail / k;                     /* equal-columns target */
        var w = wAspect * (1 - wc) + wEqual * wc;    /* (both sum to avail) */
        widths.push(w);
        natH.push(w / ratios[i]);
      }
      var Hmax = Math.max.apply(null, natH);
      var appliedMax = 0;
      for (var j = 0; j < k; j++) {
        var h = natH[j] * (1 - hc) + Hmax * hc;
        tiles[j].style.width  = widths[j].toFixed(2) + 'px';
        tiles[j].style.height = h.toFixed(2) + 'px';
        if (h > appliedMax) appliedMax = h;
      }
      if (full) refH = appliedMax;
    });
  }

  function parseRatio(s) {
    if (!s) return 0;
    if (s.indexOf('/') !== -1) {
      var p = s.split('/');
      var a = +p[0], b = +p[1];
      return (a && b) ? a / b : 0;
    }
    var n = +s;
    return n || 0;
  }

  function build(mount, images, pid) {
    unmount();
    state.mount  = mount;
    state.pid    = pid;
    state.images = images || [];
    render();
    /* Track the mount's width directly: a plain window 'resize' does NOT fire
       when the width changes because a vertical scrollbar appears/disappears or
       the left toolbar collapses — a ResizeObserver on the mount catches all of
       these. Guard against the observe callback firing during our own relayout. */
    if (typeof ResizeObserver !== 'undefined') {
      if (!state.ro) state.ro = new ResizeObserver(function () { if (state.mount) relayout(); });
      state.ro.observe(mount);
    } else if (!state.bound) {
      state.bound = true;
      window.addEventListener('resize', function () { if (state.mount) relayout(); });
    }
  }

  function unmount() {
    if (state.ro) { try { state.ro.disconnect(); } catch (e) {} }
    if (state.mount) state.mount.innerHTML = '';
    hideDesc();
    state.mount = null;
    state.images = [];
    state.pid = null;
  }

  window.PostersGallery = {
    build: build,
    relayout: relayout,
    unmount: unmount,
    rebuild: function () { if (state.mount) render(); }
  };
})();
