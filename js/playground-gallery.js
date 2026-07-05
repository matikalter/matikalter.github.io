/* ======================================================================
   PLAYGROUND GALLERY — draggable, multi-row, infinite, auto-scrolling
   gallery of IMAGES (not projects). Used for project pages that declare
   `playgroundImages` instead of the standard hero+grid layout.

   Click an image → fullscreen overlay with FLIP-style scale-up animation.
   Click outside the expanded image → shrink back to origin tile.

   Reads from window globals:
     PG_SPEED, PG_HOVER_SCALE, PG_HOVER_DUR, PG_ROWS, PG_PAD, PG_HGAP,
     PG_VGAP, PG_REF_W, PG_THUMB_H, PG_HEIGHT_SPREAD, PG_ROW_OFFSETS,
     PG_OVERLAY_PAD

   Exposes on window: Playground.{mount(container, images, projectId), unmount}
   ====================================================================== */
(function () {
  'use strict';

  var FRICTION   = 0.88;
  var CLICK_DIST = 5;

  /* current left-panel width. MUST use an isNaN check, not `|| 340`:
     parseFloat('0px') is 0 (falsy) and would wrongly fall back to 340 while the
     toolbar is collapsed (--left-w: 0), offsetting/shrinking the gallery and the
     expand overlay by a phantom 340px. */
  function leftWNow() {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-w'));
    return isNaN(v) ? 340 : v;
  }

  var gal = {
    on: false, raf: null, ft: 0,
    rows: [],
    ch: 0, pad: 0, hGap: 0, vGap: 0,
    setH: 0, vMult: 1,
    vpW: 0,
    hOff: 0, vOff: 0,
    velX: 0, velY: 0,
    drag: false,
    dsx: 0, dsy: 0, dlx: 0, dly: 0, dlt: 0, dd: 0,
    autoMul: 1,
    tracks: [],
    outer: null,
    viewport: null,
    container: null,
    images: [],
    projectId: null,
    heldItem: null,
    heldItemKey: null,
    curX: 0, curY: 0,
    vids: [], lastCull: 0,
    srcVideos: {}, canvases: [], pool: null,
    descByKey: {}, hoverKey: null
  };

  /* ── Vid Description bridge ──
     Surface a tile's description (title + body) in the toolbar via the
     portfolio.js handler, which owns the left-panel DOM. Per-clip overrides
     from the Tweaks panel (window.PG_DESC_DATA, keyed by clip src) take
     precedence over the inline title/body in the project data. No-ops if the
     handler isn't present. */
  function showDesc(key) {
    var d = gal.descByKey[key] || {};
    var over = (window.PG_DESC_DATA && d.src && window.PG_DESC_DATA[d.src]) || {};
    /* per-field: if the Tweaks override defines a field (even an EMPTY string,
       i.e. the user deliberately cleared it) it is authoritative; only fall
       back to the inline project data when the override has no such key. */
    var title = (over.title != null) ? over.title : d.title;
    var body  = (over.body  != null) ? over.body  : d.body;
    if (window.pgDescShow) window.pgDescShow(title || '', body || '');
  }
  function hideDesc() {
    if (window.pgDescHide) window.pgDescHide();
  }

  /* ── compute display dims for one image ──
     Conformity (0..1) controls how uniform the row heights are (height-relative,
     widths always follow the native aspect ratio):
       - max conformity (1) → spread 0 → every tile is exactly thumbH tall
         (a clean equal-height row; widths vary by aspect)
       - min conformity (0) → spread 1 → equal WIDTHS, heights vary by aspect
         (each tile keeps its native ratio at varied heights). */
  function computeDims(ratio, thumbH) {
    var conf = (window.PG_CONFORMITY != null ? window.PG_CONFORMITY : (1 - PG_HEIGHT_SPREAD));
    if (conf < 0) conf = 0; else if (conf > 1) conf = 1;
    var spread = 1 - conf;
    var dH = Math.round(thumbH * Math.pow(1 / ratio, spread));
    return { dW: Math.round(dH * ratio), dH: dH };
  }

  /* ── auto-measure real aspect ratios (images + videos) and rebuild once ──
     `ratio` on each entry is only a first-paint hint; the true ratio is read
     from the loaded media so mixed portrait/landscape clips lay out cleanly. */
  var pgRatioCache = {};
  function isVideoSrc(s) { return /\.(mp4|webm|mov|m4v)$/i.test(s || ''); }
  function measureRatios() {
    var srcs = [];
    gal.images.forEach(function (img) {
      var s = 'assets/' + gal.projectId + '/' + img.src;
      if (pgRatioCache[s] == null && srcs.indexOf(s) === -1) srcs.push(s);
    });
    if (!srcs.length) return;
    var pending = srcs.length, changed = false;
    var finish = function () {
      if (--pending === 0 && changed && gal.on) build();
    };
    srcs.forEach(function (s) {
      if (isVideoSrc(s)) {
        var vid = document.createElement('video');
        vid.preload = 'metadata'; vid.muted = true;
        vid.onloadedmetadata = function () {
          if (vid.videoWidth && vid.videoHeight) { pgRatioCache[s] = vid.videoWidth / vid.videoHeight; changed = true; }
          finish();
        };
        vid.onerror = finish; vid.src = s;
        return;
      }
      var im = new Image();
      im.onload = function () {
        if (im.naturalWidth && im.naturalHeight) { pgRatioCache[s] = im.naturalWidth / im.naturalHeight; changed = true; }
        finish();
      };
      im.onerror = finish; im.src = s;
    });
  }
  function ratioFor(img) {
    var s = 'assets/' + gal.projectId + '/' + img.src;
    if (pgRatioCache[s] != null) return pgRatioCache[s];
    return img.ratio || 1.778;
  }

  /* ── apply the user's clip order (Tweaks → PG_ORDER, an array of filenames) ──
     Clips are laid out in this order, then split sequentially into rows. Any
     clip not present in PG_ORDER (e.g. newly added) keeps its data order and is
     appended, so the gallery never drops a clip. */
  function orderedImages() {
    var order = window.PG_ORDER;
    if (!order || !order.length) return gal.images.slice();
    var bySrc = {};
    gal.images.forEach(function (im) { bySrc[im.src] = im; });
    var out = [];
    order.forEach(function (src) {
      if (bySrc[src]) { out.push(bySrc[src]); delete bySrc[src]; }
    });
    gal.images.forEach(function (im) { if (bySrc[im.src]) out.push(im); });
    return out;
  }

  /* ── mount the gallery inside `container` for given image list ── */
  function mount(container, images, projectId) {
    unmount(); /* clean prior */

    if (!container || !images || !images.length) return;
    gal.container = container;
    gal.images    = images.slice();
    gal.projectId = projectId;

    /* build DOM scaffolding inside container */
    container.innerHTML =
      '<div class="pg-viewport" id="pg-viewport">' +
        '<div class="pg-vpool" id="pg-vpool" aria-hidden="true"></div>' +
        '<div class="pg-outer" id="pg-outer"></div>' +
      '</div>';

    gal.viewport = container.querySelector('#pg-viewport');
    gal.outer    = container.querySelector('#pg-outer');
    gal.pool     = container.querySelector('#pg-vpool');

    build();
  }

  /* ── unmount and clean up ── */
  function unmount() {
    if (gal.raf) { cancelAnimationFrame(gal.raf); gal.raf = null; }
    /* tear down the shared source-video pool (the only real decoders) */
    Object.keys(gal.srcVideos).forEach(function (k) {
      var v = gal.srcVideos[k];
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
      if (v.parentNode) v.parentNode.removeChild(v);
    });
    gal.srcVideos = {};
    gal.canvases  = [];
    gal.vids = [];
    gal.on = false;
    gal.hoverKey = null;
    hideDesc();   /* no description once we leave the playground */
    if (gal.container) gal.container.innerHTML = '';
    gal.container = null;
    gal.viewport  = null;
    gal.outer     = null;
    gal.pool      = null;
    gal.tracks    = [];
    gal.rows      = [];
    closeOverlay(true);
  }

  function build() {
    if (!gal.viewport || !gal.outer) return;

    var leftW = leftWNow();
    var vpW = window.innerWidth - leftW;
    var vpH = window.innerHeight;
    /* Tiles scale with the window HEIGHT (relative to PG_REF_H), NOT the width:
       thumbnail height / padding / gaps keep their size RELATIVE to the window
       height, so the rows hold their proportions + vertical position as the
       window is scaled vertically. Scaling the WIDTH only reveals more/fewer
       tiles (the content window widens), it does NOT change tile size. */
    var scale = vpH / PG_REF_H;

    gal.vpW  = vpW;
    gal.pad  = Math.round(PG_PAD  * scale);
    gal.hGap = Math.round(PG_HGAP * scale);
    gal.vGap = Math.round(PG_VGAP * scale);
    var thumbH = Math.round(PG_THUMB_H * scale);

    gal.hOff = 0; gal.vOff = 0;
    gal.velX = 0; gal.velY = 0;
    gal.autoMul = 1;
    gal.descByKey = {};

    /* distribute evenly across rows, preserving (user-controlled) order */
    var ordered = orderedImages();
    var rowArrs = [];
    var i;
    for (i = 0; i < PG_ROWS; i++) rowArrs.push([]);
    var base = Math.floor(ordered.length / PG_ROWS);
    var rem  = ordered.length % PG_ROWS;
    var idx  = 0;
    for (i = 0; i < PG_ROWS; i++) {
      var n = base + (i < rem ? 1 : 0);
      while (n--) rowArrs[i].push(ordered[idx++]);
    }

    gal.rows = rowArrs.map(function (items, ri) {
      if (!items.length) return { items: [], period: gal.hGap, copies: 0, offset: 0 };
      var itemData = items.map(function (img, ii) {
        var dims = computeDims(ratioFor(img), thumbH);
        var key = ri + '-' + ii;
        gal.descByKey[key] = { src: img.src, title: img.title || '', body: img.body || '' };
        return { img: img, key: key, dW: dims.dW, dH: dims.dH };
      });
      var period = itemData.reduce(function (s, d) { return s + d.dW + gal.hGap; }, 0);
      var copies = Math.max(3, Math.ceil((vpW + period) / period) + 1);
      var offset = (PG_ROW_OFFSETS[ri] || 0) * vpW;
      return { items: itemData, period: period, copies: copies, offset: offset };
    });

    var maxItemH = thumbH;
    gal.rows.forEach(function (row) {
      row.items.forEach(function (d) { if (d.dH > maxItemH) maxItemH = d.dH; });
    });
    gal.ch = maxItemH;
    var rawSetH = PG_ROWS * (maxItemH + gal.vGap);
    /* In HORIZONTAL mode vertical scroll is locked, so we never need the
       viewport-filling vertical repetition NOR the second stacked set (the
       vertical infinite-loop copy). Render exactly one set of PG_ROWS — this
       roughly halves the tile count + per-frame canvas draws. */
    gal.horizontal = (window.PG_SCROLL_MODE === 'horizontal');
    gal.vMult = gal.horizontal ? 1 : Math.max(1, Math.ceil(vpH / rawSetH));
    gal.setH  = gal.vMult * rawSetH;

    render();

    gal.on = true;
    gal.ft = performance.now();
    gal.raf = requestAnimationFrame(tick);
    measureRatios();
  }

  function itemHTML(d) {
    var src = 'assets/' + gal.projectId + '/' + d.img.src;
    /* Videos render as a <canvas> tile, NOT a <video>. The actual decoding is
       done by ONE shared hidden <video> per unique clip (the pool); every tile
       that shows that clip copies frames from the single shared decoder via
       drawImage. This mirrors how GIFs shared one decoded bitmap across all
       duplicate tiles — 14 decoders instead of ~200 independent <video>s. */
    var media = isVideoSrc(d.img.src)
      ? '<canvas class="pg-canvas" width="' + d.dW + '" height="' + d.dH + '"'
        + ' data-src="' + src + '" data-ratio="' + (d.dW / d.dH) + '"></canvas>'
      : '<img src="' + src + '" alt="" draggable="false">';
    return '<div class="pg-item" data-key="' + d.key + '" style="width:' + d.dW + 'px">'
         +   '<div class="pg-cell" style="width:' + d.dW + 'px">'
         +     media
         +   '</div>'
         + '</div>';
  }

  function makeSetHTML() {
    var html = '', y = gal.pad;
    for (var vi = 0; vi < gal.vMult; vi++) {
      for (var ri = 0; ri < PG_ROWS; ri++) {
        var row = gal.rows[ri], content = '';
        for (var c = 0; c < row.copies; c++)
          for (var k = 0; k < row.items.length; k++)
            content += itemHTML(row.items[k]);
        html += '<div class="pg-row-wrap" style="position:absolute;top:' + y + 'px;left:0;right:0;height:' + gal.ch + 'px">'
              +   '<div class="pg-track" data-ri="' + ri + '" style="height:' + gal.ch + 'px;gap:' + gal.hGap + 'px">' + content + '</div>'
              + '</div>';
        y += gal.ch + gal.vGap;
      }
    }
    return html;
  }

  function render() {
    if (!gal.outer) return;
    /* HORIZONTAL mode: a single set (no vertical loop duplicate). FREE mode:
       two stacked sets so vertical scroll loops seamlessly. */
    if (gal.horizontal) {
      gal.outer.innerHTML =
        '<div class="pg-set" style="position:absolute;top:0;left:0;width:100%;height:' + gal.setH + 'px">' + makeSetHTML() + '</div>';
    } else {
      gal.outer.innerHTML =
        '<div class="pg-set" style="position:absolute;top:0;left:0;width:100%;height:' + gal.setH + 'px">' + makeSetHTML() + '</div>' +
        '<div class="pg-set" style="position:absolute;top:' + gal.setH + 'px;left:0;width:100%;height:' + gal.setH + 'px">' + makeSetHTML() + '</div>';
    }

    gal.tracks = [];
    for (var ri = 0; ri < PG_ROWS; ri++) {
      gal.tracks[ri] = gal.outer.querySelectorAll('.pg-track[data-ri="' + ri + '"]');
    }

    applyTransforms();
    bindEvents();
    /* collect canvas tiles + spin up the shared source-video pool, then draw */
    gal.canvases = [].slice.call(gal.outer.querySelectorAll('canvas.pg-canvas')).map(function (c) {
      return { el: c, ctx: c.getContext('2d'), src: c.dataset.src };
    });
    gal.vids = [];
    ensureSources();
    drawTiles();
  }

  /* ── shared source-video pool ──
     One hidden, muted, looping <video> per UNIQUE clip — the only real video
     decoders on the page. Kept tiny + near-invisible (not display:none, which
     would stop decoding) so they keep producing frames for canvas drawImage. */
  function ensureSources() {
    var seen = {};
    gal.canvases.forEach(function (c) { seen[c.src] = true; });
    Object.keys(seen).forEach(function (src) {
      if (gal.srcVideos[src]) return;
      var v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.src = src;
      gal.srcVideos[src] = v;
      if (gal.pool) gal.pool.appendChild(v);
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    });
  }

  /* ── per-frame tile paint ──
     Copy the current frame of each shared source video into every ON-SCREEN
     canvas that shows it. Off-screen tiles are skipped, so the work scales with
     what's visible (~40–60 small drawImage calls), not the ~200 total tiles. */
  function drawTiles() {
    if (!gal.canvases.length) return;
    var vpW = window.innerWidth, vpH = window.innerHeight;
    var leftW = leftWNow();
    var m = 100;
    for (var i = 0; i < gal.canvases.length; i++) {
      var c = gal.canvases[i];
      var r = c.el.getBoundingClientRect();
      if (!(r.bottom > -m && r.top < vpH + m && r.right > leftW - m && r.left < vpW + m)) continue;
      var v = gal.srcVideos[c.src];
      if (v && v.readyState >= 2) {
        try { c.ctx.drawImage(v, 0, 0, c.el.width, c.el.height); } catch (e) {}
      }
    }
  }

  function applyTransforms() {
    if (!gal.outer) return;

    var vMod = ((gal.vOff % gal.setH) + gal.setH) % gal.setH;
    gal.outer.style.transform = 'translateY(' + (-vMod) + 'px)';

    for (var ri = 0; ri < gal.rows.length; ri++) {
      var row = gal.rows[ri];
      if (!row.items.length || !gal.tracks[ri] || !gal.tracks[ri].length) continue;
      var hMod = (((gal.hOff + row.offset) % row.period) + row.period) % row.period;
      var tx   = gal.pad - row.period + hMod;
      for (var t = 0; t < gal.tracks[ri].length; t++) {
        gal.tracks[ri][t].style.transform = 'translateX(' + tx + 'px)';
      }
    }
  }

  function tick(now) {
    if (!gal.on) return;
    var dt = Math.min(now - gal.ft, 50);
    gal.ft = now;

    if (!gal.drag) {
      gal.hOff += gal.velX * dt;
      gal.vOff += gal.velY * dt;
      var decay = Math.pow(FRICTION, dt / (1000 / 60));
      gal.velX *= decay;
      gal.velY *= decay;
      if (Math.abs(gal.velX) < 0.0004) gal.velX = 0;
      if (Math.abs(gal.velY) < 0.0004) gal.velY = 0;
      var ramp = 1 - Math.pow(0.96, dt / (1000 / 60));
      gal.autoMul += (1 - gal.autoMul) * ramp;
      gal.hOff += (PG_SPEED / 1000) * dt * gal.autoMul;
    }

    gal.vOff = ((gal.vOff % gal.setH) + gal.setH) % gal.setH;
    applyTransforms();

    /* paint visible canvas tiles from the shared source videos every frame */
    drawTiles();

    if (gal.drag && gal.heldItemKey && gal.outer) {
      var el   = document.elementFromPoint(gal.curX, gal.curY);
      var curr = el && el.closest ? el.closest('.pg-item') : null;
      if (curr && curr.dataset.key === gal.heldItemKey && curr !== gal.heldItem) {
        curr.classList.add('is-held');
        if (gal.heldItem) gal.heldItem.classList.remove('is-held');
        gal.heldItem = curr;
      }
    }

    gal.raf = requestAnimationFrame(tick);
  }

  function bindEvents() {
    var vp = gal.viewport;
    if (!vp || vp._bound) return;
    vp._bound = true;

    function onDown(cx, cy, target) {
      gal.drag = true;
      gal.autoMul = 0;
      gal.velX = 0; gal.velY = 0;
      gal.dsx = gal.dlx = cx;
      gal.dsy = gal.dly = cy;
      gal.dlt = performance.now();
      gal.dd  = 0;
      vp.classList.add('is-dragging');
      var item = target && target.closest ? target.closest('.pg-item') : null;
      gal.heldItem    = item;
      gal.heldItemKey = item ? item.dataset.key : null;
      if (item) item.classList.add('is-held');
    }

    function onMove(cx, cy) {
      if (!gal.drag) return;
      var horiz = (window.PG_SCROLL_MODE === 'horizontal');
      var dx = cx - gal.dlx;
      var dy = cy - gal.dly;
      var now = performance.now();
      var dt  = now - gal.dlt || 1;
      gal.hOff += dx;
      gal.velX  =  dx / dt;
      if (horiz) {
        /* vertical locked: ignore dy entirely */
        gal.velY = 0;
      } else {
        gal.vOff -= dy;
        gal.velY  = -dy / dt;
      }
      gal.dd   += Math.sqrt(dx * dx + dy * dy);
      gal.dlx = cx; gal.dly = cy; gal.dlt = now;
      gal.curX = cx; gal.curY = cy;
    }

    function onUp(cx, cy, target) {
      if (!gal.drag) return;
      gal.drag = false;
      vp.classList.remove('is-dragging');
      if (gal.heldItem && gal.outer) {
        var key = gal.heldItem.dataset.key;
        gal.outer.querySelectorAll('.pg-item[data-key="' + key + '"]').forEach(function (el) {
          el.classList.remove('is-held');
        });
        gal.heldItem = null;
        gal.heldItemKey = null;
      }
      if (gal.dd < CLICK_DIST) {
        var item = target && target.closest ? target.closest('.pg-item') : null;
        if (item) openOverlay(item);
      }
    }

    vp.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;   /* left-click only — ignore right/middle */
      e.preventDefault();
      onDown(e.clientX, e.clientY, e.target);
    });

    /* ── hover → Vid Description ──
       Hovering a tile surfaces its description in the toolbar (title + body).
       Suppressed while dragging; the expanded overlay takes precedence (it
       shows its own item's description and restores the hovered one on close). */
    vp.addEventListener('mouseover', function (e) {
      if (gal.drag || overlay.open) return;
      var item = e.target.closest ? e.target.closest('.pg-item') : null;
      if (!item) return;
      gal.hoverKey = item.dataset.key;
      showDesc(item.dataset.key);
    });
    vp.addEventListener('mouseout', function (e) {
      if (overlay.open) return;
      var item = e.target.closest ? e.target.closest('.pg-item') : null;
      if (!item) return;
      /* only clear if the pointer actually left the tile (not moving to a child) */
      var to = e.relatedTarget;
      if (to && item.contains(to)) return;
      gal.hoverKey = null;
      hideDesc();
    });
    document.addEventListener('mousemove', function (e) {
      if (gal.on) onMove(e.clientX, e.clientY);
    });
    document.addEventListener('mouseup', function (e) {
      if (gal.on) onUp(e.clientX, e.clientY, e.target);
    });

    vp.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (gal.drag && e.touches.length === 1) {
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    document.addEventListener('touchend', function (e) {
      if (gal.on && e.changedTouches.length) {
        onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY, e.target);
      }
    });

    vp.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (window.PG_SCROLL_MODE === 'horizontal') {
        /* wheel scrolls the gallery HORIZONTALLY (down/right = advance). Uses
           whichever axis the device reports more of. */
        var d = (Math.abs(e.deltaX) > Math.abs(e.deltaY)) ? e.deltaX : e.deltaY;
        gal.velX -= d * 0.0018;
        gal.velX  = Math.max(-3.5, Math.min(3.5, gal.velX));
      } else {
        gal.velY += e.deltaY * 0.0018;
        gal.velY  = Math.max(-3.5, Math.min(3.5, gal.velY));
      }
    }, { passive: false });
  }

  /* ── resize ── */
  var _resizeT = false;
  window.addEventListener('resize', function () {
    if (_resizeT || !gal.on) return;
    _resizeT = true;
    requestAnimationFrame(function () {
      _resizeT = false;
      if (gal.on) build();
      /* an OPEN expanded overlay must re-fit + re-center to the new window
         (build() only rebuilds the tile field beneath it) */
      recenterOverlay();
    });
  });

  /* ===================================================================
     FULLSCREEN OVERLAY — click an image to expand, click backdrop to close.
     Uses FLIP technique: grab origin rect, render image at origin size,
     then animate transform to the target (centered, fitted) size.
     =================================================================== */
  var overlay = {
    el:        null,
    backdrop:  null,
    imgWrap:   null,
    open:      false,
    originRect: null,
    targetRect: null
  };

  function ensureOverlayRefs() {
    if (overlay.el) return;
    overlay.el       = document.getElementById('pg-overlay');
    overlay.backdrop = document.getElementById('pg-overlay-backdrop');
    if (overlay.backdrop) {
      overlay.backdrop.addEventListener('click', function () { closeOverlay(); });
    }
  }

  function openOverlay(itemEl) {
    ensureOverlayRefs();
    if (!overlay.el) return;

    var cellEl = itemEl.querySelector('.pg-cell');
    var imgEl  = itemEl.querySelector('img, canvas');
    if (!cellEl || !imgEl) return;
    /* show THIS item's description while expanded (overrides hover) */
    showDesc(itemEl.dataset.key);
    var isVid = imgEl.tagName === 'CANVAS';
    var mediaSrc = isVid ? imgEl.dataset.src : imgEl.src;

    /* origin rect — measure the cell (which is the visible scaled element).
       Use getBoundingClientRect on the IMG to also account for any letterboxing
       inside the cell. For our markup the img fills the cell, so same as cell. */
    var rect = imgEl.getBoundingClientRect();
    overlay.originRect = {
      left: rect.left, top: rect.top,
      width: rect.width, height: rect.height
    };
    /* remember the originating tile element so close() can animate back to its
       LIVE position (the gallery keeps scrolling while the overlay is open). */
    overlay.originEl = imgEl;

    /* target rect — fit inside the right-panel area with PG_OVERLAY_PAD margin */
    var leftW = leftWNow();
    var availW = window.innerWidth  - leftW - PG_OVERLAY_PAD * 2;
    var availH = window.innerHeight - PG_OVERLAY_PAD * 2;
    var natW = rect.width, natH = rect.height;
    /* prefer natural media dims when available */
    if (isVid) {
      var sv = gal.srcVideos[mediaSrc];
      if (sv && sv.videoWidth && sv.videoHeight) { natW = sv.videoWidth; natH = sv.videoHeight; }
      else { var rr = parseFloat(imgEl.dataset.ratio) || (rect.width / rect.height); natW = rr; natH = 1; }
    } else if (imgEl.naturalWidth && imgEl.naturalHeight) {
      natW = imgEl.naturalWidth;
      natH = imgEl.naturalHeight;
    }
    var ratio = natW / natH;
    overlay.ratio = ratio;   /* remembered so resize can re-fit while open */
    /* HEIGHT-DRIVEN fit: size the expanded media by the available HEIGHT
       (so it keeps its size relative to the window height, and scaling the
       window WIDTH doesn't change it), only shrinking if it would overflow the
       content-window width. Centered in the content window (right of toolbar). */
    var th = availH, tw = th * ratio;
    if (tw > availW) { tw = availW; th = tw / ratio; }
    var tx = leftW + (window.innerWidth - leftW - tw) / 2;
    var ty = (window.innerHeight - th) / 2;
    overlay.targetRect = { left: tx, top: ty, width: tw, height: th };

    /* build/replace the floating image inside the overlay */
    var prev = overlay.el.querySelector('.pg-overlay-img');
    if (prev) prev.remove();

    var wrap = document.createElement('div');
    wrap.className = 'pg-overlay-img';
    /* place at origin coords WITHOUT transform — coords are page-space, overlay
       itself is positioned starting at left=var(--left-w). Subtract leftW. */
    wrap.style.left   = (overlay.originRect.left - leftW) + 'px';
    wrap.style.top    = overlay.originRect.top + 'px';
    wrap.style.width  = overlay.originRect.width + 'px';
    wrap.style.height = overlay.originRect.height + 'px';
    /* identity transform initially */
    wrap.style.transform = 'translate(0,0) scale(1)';
    if (isVid) {
      wrap.innerHTML = '<video src="' + mediaSrc + '" autoplay muted loop playsinline draggable="false"></video>';
    } else {
      wrap.innerHTML = '<img src="' + imgEl.src + '" alt="" draggable="false">';
    }
    overlay.el.appendChild(wrap);
    overlay.imgWrap = wrap;

    /* force a paint, then animate to target via transform */
    /* eslint-disable-next-line no-unused-expressions */
    wrap.offsetWidth;

    overlay.el.classList.add('is-active');

    var dx = overlay.targetRect.left - overlay.originRect.left;
    var dy = overlay.targetRect.top  - overlay.originRect.top;
    var sx = overlay.targetRect.width  / overlay.originRect.width;
    var sy = overlay.targetRect.height / overlay.originRect.height;
    /* use single uniform scale (sx = sy by construction since both target & origin
       come from same aspect ratio). but be safe and use the smaller. */
    wrap.style.transformOrigin = 'top left';
    wrap.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';

    overlay.open = true;
  }

  function closeOverlay(immediate) {
    if (!overlay.el || !overlay.open) {
      if (overlay.el) overlay.el.classList.remove('is-active');
      return;
    }
    overlay.el.classList.remove('is-active');

    if (overlay.imgWrap) {
      if (immediate) {
        overlay.imgWrap.remove();
        overlay.imgWrap = null;
      } else {
        /* Animate back to the thumbnail's LIVE position, re-tracking it every
           frame: the gallery keeps scrolling during the ~0.42s close, so a
           one-shot snapshot lands slightly off. We drive the close with rAF,
           re-measuring the originating tile each frame and easing toward
           wherever it currently is, so it lands dead-on. */
        var wrap = overlay.imgWrap;
        var base = overlay.originRect;
        var startBox = overlay.targetRect;   /* the expanded, fitted rect */
        var leftW = leftWNow();
        wrap.style.transition = 'none';      /* rAF owns the transform now */
        wrap.style.transformOrigin = 'top left';

        function liveDest() {
          var dest = { left: base.left, top: base.top, width: base.width, height: base.height };
          if (overlay.originEl && overlay.originEl.isConnected) {
            var r = overlay.originEl.getBoundingClientRect();
            if (r.width && r.height) {
              dest = { left: r.left, top: r.top, width: r.width, height: r.height };
              var vpR = window.innerWidth, vpB = window.innerHeight;
              if (dest.left + dest.width < leftW) dest.left = leftW - dest.width;   /* off left */
              else if (dest.left > vpR)           dest.left = vpR;                  /* off right */
              if (dest.top + dest.height < 0)     dest.top  = -dest.height;         /* off top */
              else if (dest.top > vpB)            dest.top  = vpB;                  /* off bottom */
            }
          }
          return dest;
        }
        function applyBox(b) {
          wrap.style.transform =
            'translate(' + (b.left - base.left) + 'px,' + (b.top - base.top) + 'px) ' +
            'scale(' + (b.width / base.width) + ',' + (b.height / base.height) + ')';
        }

        var DUR = 420, t0 = performance.now(), raf = 0;
        var ease = function (x) { return 1 - Math.pow(1 - x, 3); }; /* easeOutCubic */
        var removeWrap = function () {
          if (raf) cancelAnimationFrame(raf);
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
          if (overlay.imgWrap === wrap) overlay.imgWrap = null;
        };
        function step(now) {
          var t = Math.min(1, (now - t0) / DUR);
          var e = ease(t);
          var d = liveDest();   /* re-measured every frame — tracks the motion */
          applyBox({
            left:   startBox.left   + (d.left   - startBox.left)   * e,
            top:    startBox.top    + (d.top    - startBox.top)    * e,
            width:  startBox.width  + (d.width  - startBox.width)  * e,
            height: startBox.height + (d.height - startBox.height) * e
          });
          if (t < 1) { raf = requestAnimationFrame(step); }
          else { removeWrap(); }
        }
        raf = requestAnimationFrame(step);
      }
    }
    overlay.open = false;
    /* after closing, restore the hovered tile's description (if the pointer is
       still over one) or hide it */
    if (gal.hoverKey != null) showDesc(gal.hoverKey);
    else hideDesc();
  }

  /* esc closes */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.open) closeOverlay();
  });

  /* ── keep an OPEN overlay centered + relatively-sized on window resize ──
     Matches how project-page image lightboxes behave: the expanded media stays
     centered in the content window and keeps its size relative to the window as
     it scales. Recomputes the fitted/centered box and snaps the wrap to it (no
     animation); both the display box and the close-animation reference
     (originRect) are updated so closing still lands on the live tile. */
  function recenterOverlay() {
    if (!overlay.open || !overlay.imgWrap) return;
    var leftW  = leftWNow();
    var availW = window.innerWidth  - leftW - PG_OVERLAY_PAD * 2;
    var availH = window.innerHeight - PG_OVERLAY_PAD * 2;
    var ratio  = overlay.ratio || 1;
    var th = availH, tw = th * ratio;
    if (tw > availW) { tw = availW; th = tw / ratio; }
    var tx = leftW + (window.innerWidth - leftW - tw) / 2;
    var ty = (window.innerHeight - th) / 2;
    var box = { left: tx, top: ty, width: tw, height: th };
    overlay.targetRect = box;
    overlay.originRect = box;   /* keep close-animation base consistent */
    var w = overlay.imgWrap;
    w.style.transition = 'none';
    w.style.transformOrigin = 'top left';
    w.style.transform = 'none';
    w.style.left   = (tx - leftW) + 'px';
    w.style.top    = ty + 'px';
    w.style.width  = tw + 'px';
    w.style.height = th + 'px';
  }
  window.__pgRecenterOverlay = recenterOverlay;

  /* ── expose ── */
  window.Playground = {
    mount: mount,
    unmount: unmount,
    closeOverlay: closeOverlay,
    /* rebuild — called by applyTweaks() when gallery-related design tokens change */
    rebuild: function () { if (gal.on) build(); }
  };
})();
