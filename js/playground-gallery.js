/* ======================================================================
   PLAYGROUND GALLERY — draggable, multi-track, infinite, auto-scrolling
   gallery of clips / images. Used for project pages that declare
   `playgroundImages`.

   SCROLL MODES (PG_SCROLL_MODE): 'horizontal' (rows loop on X, Y locked),
   'free' (rows loop on X + two stacked sets loop on Y), 'vertical' (the grid
   is TRANSPOSED: PG_ROWS columns, each looping on Y; X locked). One axis model
   drives all three: a TRACK is a row (main axis X) or a column (main axis Y).

   PERFORMANCE MODEL (see CLAUDE.md "## Playground gallery engine"):
     · ONE hidden muted <video> per unique clip (#pg-vpool) is the only decoder;
       tiles are <canvas> copies. Sources with no on-screen tile are PAUSED
       (decoders proportional to what is visible).
     · Visibility is pure ARITHMETIC from the known track geometry — no
       getBoundingClientRect / getComputedStyle per frame (those forced a style
       recalc of ~200 tiles every frame).
     · A canvas is redrawn only when its source has presented a NEW frame
       (requestVideoFrameCallback stamp; falls back to every tick while playing),
       so 24–30fps clips no longer cost a drawImage on every 60–120Hz frame.
     · Track transforms are written only when they change.
   HOVER: JS-managed .is-hover (not :hover) so pushes + description + hover-play
   stay in sync while content moves under a still cursor. Neighbours "make
   room": same-track tiles slide along the main axis, other tracks slide on the
   cross axis (classes + two CSS vars, transitions do the motion).
   HOVER-PLAY (PG_HOVER_PLAY): all sources paused; the hovered tile's clip eases
   its playbackRate up / down (smooth start + stop) and only THAT canvas updates.

   Reads globals: PG_SPEED (H), PG_VSPEED, PG_ROWS, PG_HGAP, PG_VGAP, PG_THUMB_H,
   PG_CONFORMITY, PG_SCROLL_MODE, PG_ORDER, PG_ROW_OFFSET, PG_PUSH,
   PG_HOVER_SCALE, PG_HOVER_PAUSE, PG_HOVER_PLAY + constants PG_PAD, PG_REF_H,
   PG_HEIGHT_SPREAD, PG_ROW_OFFSETS, PG_OVERLAY_PAD.
   Exposes window.Playground.{mount, unmount, closeOverlay, rebuild}
   ====================================================================== */
(function () {
  'use strict';

  var FRICTION   = 0.88;
  var CLICK_DIST = 5;
  var MARGIN     = 100;   /* draw tiles this far past the viewport edge */

  /* isNaN guard, NOT `|| 340`: a collapsed toolbar's --left-w is a real 0 */
  function leftWNow() {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-w'));
    return isNaN(v) ? 340 : v;
  }
  function mod(a, n) { return ((a % n) + n) % n; }
  /* left edge of the EXPANDED-CLIP overlay: the toolbar edge (main-content mode,
     default) or 0 (Expanded clip → Expand over: whole window, html.pgov-window).
     Used to fit + centre the clip and to place it inside the overlay. */
  function ovLeft() {
    return document.documentElement.classList.contains('pgov-window') ? 0 : leftWNow();
  }

  var gal = {
    on: false, raf: null, ft: 0, frame: 0, lastMgmt: 0,
    mode: 'horizontal', ay: false,
    trk: [], tracks: [], wrapEls: [],
    ch: 0, pad: 0, gM: 0, gC: 0, crossStart: 0, scale: 1,
    setH: 0, vMult: 1, vpW: 0, vpH: 0, vMod: 0,
    hOff: 0, vOff: 0, velX: 0, velY: 0,
    drag: false, dsx: 0, dsy: 0, dlx: 0, dly: 0, dlt: 0, dd: 0,
    autoMul: 1,
    outer: null, viewport: null, container: null, pool: null,
    images: [], projectId: null,
    heldItem: null, heldItemKey: null,
    curX: -1, curY: -1, ptrIn: false,
    src: {}, canvases: [], visSrc: {},
    descByKey: {}, hoverKey: null, hoverEl: null, pushed: [], playSrc: null
  };

  function showDesc(key) {
    var d = gal.descByKey[key] || {};
    var over = (window.PG_DESC_DATA && d.src && window.PG_DESC_DATA[d.src]) || {};
    var title = (over.title != null) ? over.title : d.title;
    var body  = (over.body  != null) ? over.body  : d.body;
    if (window.pgDescShow) window.pgDescShow(title || '', body || '');
  }
  function hideDesc() { if (window.pgDescHide) window.pgDescHide(); }

  /* Conformity 1 = uniform cross size (row height / column width); 0 = uniform
     MAIN size (equal widths in rows, equal heights in columns). */
  function computeDims(ratio, T, col) {
    var conf = (window.PG_CONFORMITY != null ? window.PG_CONFORMITY : (1 - PG_HEIGHT_SPREAD));
    if (conf < 0) conf = 0; else if (conf > 1) conf = 1;
    var spread = 1 - conf;
    if (col) { var w = Math.round(T * Math.pow(ratio, spread)); return { dW: w, dH: Math.round(w / ratio) }; }
    var dH = Math.round(T * Math.pow(1 / ratio, spread));
    return { dW: Math.round(dH * ratio), dH: dH };
  }

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
    var finish = function () { if (--pending === 0 && changed && gal.on) build(); };
    srcs.forEach(function (s) {
      if (isVideoSrc(s)) {
        var vid = document.createElement('video');
        vid.preload = 'metadata'; vid.muted = true;
        vid.onloadedmetadata = function () {
          if (vid.videoWidth && vid.videoHeight) { pgRatioCache[s] = vid.videoWidth / vid.videoHeight; changed = true; }
          vid.removeAttribute('src'); finish();
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
    return pgRatioCache[s] != null ? pgRatioCache[s] : (img.ratio || 1.778);
  }

  function orderedImages() {
    var order = window.PG_ORDER;
    if (!order || !order.length) return gal.images.slice();
    var bySrc = {};
    gal.images.forEach(function (im) { bySrc[im.src] = im; });
    var out = [];
    order.forEach(function (src) { if (bySrc[src]) { out.push(bySrc[src]); delete bySrc[src]; } });
    gal.images.forEach(function (im) { if (bySrc[im.src]) out.push(im); });
    return out;
  }

  function mount(container, images, projectId) {
    unmount();
    if (!container || !images || !images.length) return;
    gal.container = container;
    gal.images    = images.slice();
    gal.projectId = projectId;
    container.innerHTML =
      '<div class="pg-viewport" id="pg-viewport">' +
        '<div class="pg-vpool" id="pg-vpool" aria-hidden="true"></div>' +
        '<div class="pg-outer" id="pg-outer"></div>' +
        /* DRAG ARROWS (Playground gallery → Drag arrows): one glyph centred on
           each edge; which show + glyph / size / inset are pure CSS
           (html[data-pg-arrows], --pg-arrow-*), set by applyTweaks. */
        '<div class="pg-arrows" aria-hidden="true">' +
          '<span class="pg-arrow pg-arrow-t"></span><span class="pg-arrow pg-arrow-r"></span>' +
          '<span class="pg-arrow pg-arrow-b"></span><span class="pg-arrow pg-arrow-l"></span>' +
        '</div>' +
      '</div>';
    gal.viewport = container.querySelector('#pg-viewport');
    gal.outer    = container.querySelector('#pg-outer');
    gal.pool     = container.querySelector('#pg-vpool');
    bindViewport();
    build();
  }

  function unmount() {
    if (gal.raf) { cancelAnimationFrame(gal.raf); gal.raf = null; }
    Object.keys(gal.src).forEach(function (k) {
      var v = gal.src[k].v;
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
      if (v.parentNode) v.parentNode.removeChild(v);
    });
    gal.src = {}; gal.canvases = []; gal.visSrc = {};
    gal.on = false;
    cancelRelease();
    gal.hoverKey = null; gal.hoverEl = null; gal.pushed = []; gal.playSrc = null; gal.ptrIn = false;
    hideDesc();
    if (gal.container) gal.container.innerHTML = '';
    gal.container = gal.viewport = gal.outer = gal.pool = null;
    gal.tracks = []; gal.trk = []; gal.wrapEls = [];
    closeOverlay(true);
  }

  /* lay the tracks out for a given scale; returns the total cross extent */
  function layoutTracks(scale, ordered, vpMain) {
    var N = Math.max(1, PG_ROWS | 0);
    gal.scale = scale;
    gal.pad = Math.round(PG_PAD * scale);
    var hGap = Math.round(PG_HGAP * scale), vGap = Math.round(PG_VGAP * scale);
    gal.gM = gal.ay ? vGap : hGap;
    gal.gC = gal.ay ? hGap : vGap;
    var T = Math.max(8, Math.round(PG_THUMB_H * scale));
    var arrs = [], i;
    for (i = 0; i < N; i++) arrs.push([]);
    var base = Math.floor(ordered.length / N), rem = ordered.length % N, idx = 0;
    for (i = 0; i < N; i++) { var n = base + (i < rem ? 1 : 0); while (n--) arrs[i].push(ordered[idx++]); }
    gal.descByKey = {};
    var maxC = T;
    gal.trk = arrs.map(function (items, ri) {
      var pos = 0;
      var data = items.map(function (img, ii) {
        var d = computeDims(ratioFor(img), T, gal.ay);
        var key = ri + '-' + ii;
        gal.descByKey[key] = { src: img.src, title: img.title || '', body: img.body || '' };
        var m = gal.ay ? d.dH : d.dW, c = gal.ay ? d.dW : d.dH;
        if (c > maxC) maxC = c;
        var o = { img: img, key: key, dW: d.dW, dH: d.dH, m: m, c: c, pos: pos };
        pos += m + gal.gM;
        return o;
      });
      var period = pos || gal.gM || 1;
      return {
        items: data, period: period,
        copies: data.length ? Math.max(3, Math.ceil((vpMain + period) / period) + 1) : 0,
        baseOff: (PG_ROW_OFFSETS[ri] || 0) * vpMain,
        cur: 0, last: null
      };
    });
    gal.ch = maxC;
    return N * maxC + (N - 1) * gal.gC;
  }

  function build() {
    if (!gal.viewport || !gal.outer) return;
    var mode = window.PG_SCROLL_MODE;
    gal.mode = (mode === 'free' || mode === 'vertical') ? mode : 'horizontal';
    gal.ay = gal.mode === 'vertical';
    gal.leftW = leftWNow();
    gal.vpW = gal.viewport.clientWidth  || (window.innerWidth - gal.leftW);
    gal.vpH = gal.viewport.clientHeight || window.innerHeight;
    gal.hOff = 0; gal.vOff = 0; gal.velX = 0; gal.velY = 0; gal.autoMul = 1;
    gal.hoverEl = null; gal.pushed = []; gal.hoverKey = null;

    var ordered = orderedImages();
    var vpMain = gal.ay ? gal.vpH : gal.vpW;
    /* tiles scale with the window HEIGHT (PG_REF_H). Columns (vertical mode)
       additionally shrink to fit the content width so every column shows. */
    var s0 = gal.vpH / PG_REF_H;
    var tot = layoutTracks(s0, ordered, vpMain);
    if (gal.ay && tot + 2 * gal.pad > gal.vpW && tot > 0) {
      tot = layoutTracks(s0 * Math.max(0.2, gal.vpW / (tot + 2 * gal.pad)), ordered, vpMain);
    }
    gal.crossStart = gal.ay ? Math.max(gal.pad, Math.round((gal.vpW - tot) / 2)) : gal.pad;
    var rawSetH = (PG_ROWS | 0) * (gal.ch + gal.gC);
    gal.vMult = gal.mode === 'free' ? Math.max(1, Math.ceil(gal.vpH / rawSetH)) : 1;
    gal.setH  = gal.vMult * rawSetH;

    gal.viewport.classList.toggle('pg-ax-y', gal.ay);
    gal.viewport.classList.toggle('pg-ax-x', !gal.ay);
    render();
    gal.on = true;
    gal.ft = performance.now();
    if (!gal.raf) gal.raf = requestAnimationFrame(tick);
    measureRatios();
  }

  function itemHTML(d, ri, mp, cross) {
    var src = 'assets/' + gal.projectId + '/' + d.img.src;
    var media = isVideoSrc(d.img.src)
      ? '<canvas class="pg-canvas" width="' + d.dW + '" height="' + d.dH + '" style="height:' + d.dH + 'px" data-src="' + src + '" data-ratio="' + (d.dW / d.dH)
        + '" data-ri="' + ri + '" data-mp="' + mp + '" data-ml="' + d.m + '" data-x="' + cross + '"></canvas>'
      : '<img src="' + src + '" alt="" draggable="false">';
    return '<div class="pg-item" data-key="' + d.key + '" data-ri="' + ri + '" data-mp="' + mp + '" data-x="' + cross + '" data-m="' + d.m + '" data-c="' + d.c + '" style="width:' + d.dW + 'px">'
         +   '<div class="pg-cell" style="width:' + d.dW + 'px">' + media + '</div>'
         + '</div>';
  }

  function makeSetHTML(setIdx) {
    var html = '', cp = gal.crossStart, N = PG_ROWS | 0;
    for (var vi = 0; vi < gal.vMult; vi++) {
      for (var ri = 0; ri < N; ri++) {
        var tr = gal.trk[ri], content = '', cross = cp + setIdx * gal.setH;
        for (var c = 0; c < tr.copies; c++)
          for (var k = 0; k < tr.items.length; k++)
            content += itemHTML(tr.items[k], ri, c * tr.period + tr.items[k].pos, cross);
        var wrapSt = gal.ay ? 'left:' + cp + 'px;top:0;bottom:0;width:' + gal.ch + 'px'
                            : 'top:' + cp + 'px;left:0;right:0;height:' + gal.ch + 'px';
        var trkSt  = gal.ay ? 'width:' + gal.ch + 'px;flex-direction:column;gap:' + gal.gM + 'px'
                            : 'height:' + gal.ch + 'px;gap:' + gal.gM + 'px';
        html += '<div class="pg-row-wrap" style="position:absolute;' + wrapSt + '">'
              +   '<div class="pg-track" data-ri="' + ri + '" style="' + trkSt + '">' + content + '</div></div>';
        cp += gal.ch + gal.gC;
      }
    }
    return html;
  }

  function render() {
    if (!gal.outer) return;
    var setSt = function (top) { return 'position:absolute;top:' + top + 'px;left:0;width:100%;height:' + (gal.ay ? '100%' : gal.setH + 'px'); };
    gal.outer.style.height = gal.ay ? '100%' : '';
    gal.outer.innerHTML = '<div class="pg-set" style="' + setSt(0) + '">' + makeSetHTML(0) + '</div>'
      + (gal.mode === 'free' ? '<div class="pg-set" style="' + setSt(gal.setH) + '">' + makeSetHTML(1) + '</div>' : '');
    gal.outer.style.transform = 'none';
    gal.outerLast = null;
    gal.tracks = [];
    for (var ri = 0; ri < (PG_ROWS | 0); ri++) gal.tracks[ri] = gal.outer.querySelectorAll('.pg-track[data-ri="' + ri + '"]');
    gal.wrapEls = [].slice.call(gal.outer.querySelectorAll('.pg-row-wrap'));
    /* numeric geometry per tile, cached once per render — the push reads this,
       never the DOM */
    gal.items = [].slice.call(gal.outer.querySelectorAll('.pg-item')).map(function (el, i) {
      el._pi = i;
      return { el: el, ri: +el.dataset.ri, mp: +el.dataset.mp, m: +el.dataset.m, c: +el.dataset.c, x: +el.dataset.x };
    });
    gal.canvases = [].slice.call(gal.outer.querySelectorAll('canvas.pg-canvas')).map(function (c) {
      return c._cv = { el: c, ctx: c.getContext('2d'), src: c.dataset.src, ri: +c.dataset.ri, mp: +c.dataset.mp,
               ml: +c.dataset.ml, cross: +c.dataset.x, stamp: -1, w0: c.width, h0: c.height };
    });
    ensureSources();
    applyTransforms();
    drawTiles();
  }

  /* ── shared source-video pool ── */
  function ensureSources() {
    var seen = {};
    gal.canvases.forEach(function (c) { seen[c.src] = true; });
    var now = performance.now();
    Object.keys(seen).forEach(function (src) {
      if (gal.src[src]) return;
      var v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.src = src;
      var S = { v: v, stamp: 0, rvfc: false, lastSeen: now, rate: 0, target: 0, ramp: false, live: null };
      gal.src[src] = S;
      var bump = function () { S.stamp++; };
      v.addEventListener('loadeddata', bump);
      v.addEventListener('seeked', bump);
      if (v.requestVideoFrameCallback) {
        var onFrame = function () { S.stamp++; S.rvfc = true; if (gal.src[src] === S) v.requestVideoFrameCallback(onFrame); };
        v.requestVideoFrameCallback(onFrame);
      }
      if (gal.pool) gal.pool.appendChild(v);
      if (!window.PG_HOVER_PLAY) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    });
  }

  /* ── per-frame paint: arithmetic visibility, redraw only on a new frame ── */
  function drawTiles() {
    var cs = gal.canvases; if (!cs.length) return;
    var vw = gal.vpW, vh = gal.vpH, m = MARGIN, ay = gal.ay, vMod = gal.vMod, ch = gal.ch;
    var hp = !!window.PG_HOVER_PLAY, vis = {};
    var up = !!(window.PG_UNSEL_PAUSE && gal.hoverEl), hcv = gal.hoverCanvas;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], tr = gal.trk[c.ri]; if (!tr) continue;
      var a0 = tr.cur + c.mp, a1 = a0 + c.ml, b0 = c.cross - (ay ? 0 : vMod), b1 = b0 + ch;
      var x0 = ay ? b0 : a0, x1 = ay ? b1 : a1, y0 = ay ? a0 : b0, y1 = ay ? a1 : b1;
      if (x1 < -m || x0 > vw + m || y1 < -m || y0 > vh + m) continue;
      vis[c.src] = true;
      var S = gal.src[c.src];
      if (!S || S.v.readyState < 2 || c.stamp === S.stamp) continue;
      if (hp && c.stamp !== -1 && c.el !== S.live) continue;   /* frozen until hovered */
      if (up && c.stamp !== -1 && c.el !== hcv) continue;       /* unselected clips paused */
      try { c.ctx.drawImage(S.v, 0, 0, c.el.width, c.el.height); c.stamp = S.stamp; } catch (e) {}
    }
    gal.visSrc = vis;
  }

  /* decoders proportional to what is visible: pause clips with no on-screen
     tile (normal mode) / everything but the hovered clip (hover-play mode) */
  function manageSources(now) {
    var hp = !!window.PG_HOVER_PLAY;
    Object.keys(gal.src).forEach(function (k) {
      var S = gal.src[k], v = S.v;
      if (hp) {
        if (!S.ramp && !v.paused) v.pause();
        return;
      }
      if (S.ramp) { S.ramp = false; S.live = null; S.rate = 0; S.target = 0; try { v.playbackRate = 1; } catch (e) {} }
      if (window.PG_UNSEL_PAUSE && gal.hoverEl && k !== gal.hoverSrc) { if (!v.paused) v.pause(); return; }
      if (gal.visSrc[k]) {
        S.lastSeen = now;
        if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      } else if (!v.paused && now - S.lastSeen > 600) v.pause();
    });
  }

  /* hover-play: ease playbackRate toward the target (smooth start / stop) */
  function stepRamps(dt) {
    if (!window.PG_HOVER_PLAY) return;
    var k = 1 - Math.exp(-dt / 120);
    Object.keys(gal.src).forEach(function (key) {
      var S = gal.src[key]; if (!S.ramp) return;
      S.rate += (S.target - S.rate) * k;
      if (S.target === 0 && S.rate < 0.07) {
        try { S.v.pause(); S.v.playbackRate = 1; } catch (e) {}
        S.ramp = false; S.live = null; S.rate = 0;
        return;
      }
      if (S.target === 1 && S.rate > 0.995) S.rate = 1;
      var r = Math.max(0.0625, Math.min(1, S.rate));
      if (Math.abs(r - S.v.playbackRate) > 0.01) { try { S.v.playbackRate = r; } catch (e) {} }
    });
  }
  function setPlayTarget(cv) {
    var src = cv ? cv.dataset.src : null;
    if (gal.playSrc && gal.playSrc !== src && gal.src[gal.playSrc]) gal.src[gal.playSrc].target = 0;
    gal.playSrc = src;
    if (!src || !window.PG_HOVER_PLAY) return;
    var S = gal.src[src]; if (!S) return;
    S.target = 1; S.live = cv;
    if (!S.ramp || S.v.paused) {
      S.ramp = true;
      S.rate = Math.max(S.rate, 0.0625);
      try { S.v.playbackRate = S.rate; } catch (e) {}
      var p = S.v.play(); if (p && p.catch) p.catch(function () {});
    }
  }

  function rowShift(ri) {
    var o = window.PG_ROW_OFFSET || 0;
    return o ? (ri % 2 ? 0.5 : -0.5) * o * gal.scale : 0;
  }
  function applyTransforms() {
    if (!gal.outer) return;
    gal.vMod = gal.mode === 'free' ? mod(gal.vOff, gal.setH) : 0;
    if (gal.mode === 'free' && gal.vMod !== gal.outerLast) {
      gal.outerLast = gal.vMod;
      gal.outer.style.transform = 'translateY(' + (-gal.vMod) + 'px)';
    }
    var fn = gal.ay ? 'translateY(' : 'translateX(';
    for (var ri = 0; ri < gal.trk.length; ri++) {
      var tr = gal.trk[ri], els = gal.tracks[ri];
      if (!tr.items.length || !els || !els.length) continue;
      var off = tr.baseOff + rowShift(ri);
      var phase = gal.ay ? (-gal.vOff + off) : (gal.hOff + off);
      var pos = gal.pad - tr.period + mod(phase, tr.period);
      var wrap = Math.floor(phase / tr.period);   /* loop count — a change = a wrap (see tick's re-push) */
      if (wrap !== tr.wrap) { tr.wrap = wrap; gal.wrapGen = (gal.wrapGen || 0) + 1; }
      tr.cur = pos;
      if (pos === tr.last) continue;
      tr.last = pos;
      var s = fn + pos + 'px)';
      for (var t = 0; t < els.length; t++) els[t].style.transform = s;
    }
  }

  /* ── hover + make-room push (NEIGHBOUR GRAPH + COLLISION GUARD) ──
     Runs ONCE per hover change; nothing per frame (relative tile positions are
     scroll-invariant, the CSS transform transition does the motion).
     1. Candidates: tiles near the viewport, as rects in (main, cross) units
        computed ARITHMETICALLY (track phase + cached offsets; tracks centre
        their tiles on the cross axis). The hovered rect is grown by Hover scale.
     2. Rings by ADJACENCY (BFS over "faces another tile across one gap"), not by
        centre distance — so a wide neighbour counts as ring 1 just like a
        narrow one.
     3. Desired push for ring k = the hovered tile's growth toward it × Strength
        × q^(k−1), q = Reach/(Reach+1) (Reach 0 = ring 1 only; geometric, so
        every ring weakens by the same proportion).
     4. Collision guard, ring by ring outward: each tile is checked against every
        already-placed tile (hovered + inner rings) and slid out along the axis
        needing the least movement until it keeps at least Min spacing × the
        original gap. Only OUTER tiles move, so pushes propagate outward and
        nothing can touch or slide under another. Stops at the first ring that
        neither wants nor needs to move. */
  function clearPush() {
    for (var i = 0; i < gal.pushed.length; i++) gal.pushed[i].style.transform = '';
    if (gal.pushWrap) { gal.pushWrap.classList.remove('pp-on'); gal.pushWrap = null; }
    gal.pushed = [];
  }
  function applyPush(item) {
    gal.pushGen = gal.wrapGen;   /* push computed for the current track loops */
    var s = window.PG_HOVER_SCALE || 1.15;
    var str = window.PG_PUSH != null ? Math.max(0, +window.PG_PUSH) : 1;
    var reach = window.PG_PUSH_AREA != null ? Math.max(0, +window.PG_PUSH_AREA) : 1.5;
    var minF = window.PG_PUSH_MIN != null ? Math.max(0, Math.min(1, +window.PG_PUSH_MIN)) : 0.4;
    var wrap = item.parentNode && item.parentNode.parentNode;
    if (wrap) { wrap.classList.add('pp-on'); gal.pushWrap = wrap; }   /* hovered track paints above the others */
    if (window.PG_PUSH_ON === false) return;    /* push off: the grown clip simply overlays its neighbours */
    if (s <= 1 || !gal.items) return;
    var H = gal.items[item._pi]; if (!H || !gal.trk[H.ri]) return;
    var ay = gal.ay, ch = gal.ch, gM = gal.gM, gC = gal.gC;
    var vMain = ay ? gal.vpH : gal.vpW, vCross = ay ? gal.vpW : gal.vpH, cOff = ay ? 0 : gal.vMod;
    var minM = gM * minF, minC = gC * minF;

    /* 1. candidate rects (main a0..a1, cross b0..b1) */
    var R = [], hi = -1;
    for (var i = 0; i < gal.items.length; i++) {
      var T = gal.items[i], tr = gal.trk[T.ri]; if (!tr) continue;
      var a0 = tr.cur + T.mp, b0 = T.x + (ch - T.c) / 2 - cOff;
      if (T !== H && (a0 + T.m < -vMain * 0.5 || a0 > vMain * 1.5 || b0 + T.c < -vCross * 0.5 || b0 > vCross * 1.5)) continue;
      var r = { el: T.el, ri: T.ri, a0: a0, a1: a0 + T.m, b0: b0, b1: b0 + T.c, dm: 0, dc: 0, ring: -1 };
      if (T === H) {
        hi = R.length;
        var gm = (s - 1) * T.m / 2, gc = (s - 1) * T.c / 2;
        r.a0 -= gm; r.a1 += gm; r.b0 -= gc; r.b1 += gc; r.gm = gm; r.gc = gc;
        r.ring = 0;
      }
      R.push(r);
    }
    var Hr = R[hi]; if (!Hr) return;

    /* 2. adjacency rings (BFS). Uses UNGROWN rects so "touching" = one gap. */
    var tM = gM * 1.05 + 1, tC = gC * 1.05 + ch * 0.25 + 1;
    var sepM = function (A, B) { return Math.max(B.a0 - A.a1, A.a0 - B.a1); };
    var sepC = function (A, B) { return Math.max(B.b0 - A.b1, A.b0 - B.b1); };
    var Hg = { a0: Hr.a0 + Hr.gm, a1: Hr.a1 - Hr.gm, b0: Hr.b0 + Hr.gc, b1: Hr.b1 - Hr.gc };
    var rings = [[Hr]], placed = [Hr], frontier = [Hg], MAXR = 10;
    for (var k = 1; k <= MAXR; k++) {
      var ring = [];
      for (var q = 0; q < R.length; q++) {
        var C = R[q]; if (C.ring >= 0) continue;
        for (var f = 0; f < frontier.length; f++) {
          if (sepM(frontier[f], C) <= tM && sepC(frontier[f], C) <= tC) { C.ring = k; ring.push(C); break; }
        }
      }
      if (!ring.length) break;
      rings.push(ring);
      frontier = ring;
    }

    /* 3 + 4. desired push, then an OUTWARD collision sweep.
       Order = ring, then distance from the hovered centre. Each tile starts at
       its desired (falloff) offset and is then slid clear of EVERY tile already
       placed. Per pair the separating AXIS + SIGN are fixed from the BASE layout
       (same track → main axis; otherwise the axis needing the smaller move at
       rest, sign from base centres), so a tile can't flip direction between
       passes or get shoved sideways into a gap it doesn't belong in. Only the
       outer tile moves, so every pair ends at ≥ Min spacing. */
    var hcM = (Hr.a0 + Hr.a1) / 2, hcC = (Hr.b0 + Hr.b1) / 2;
    var uM = (Hg.a1 - Hg.a0) + gM, uC = ch + gC;
    var qf = reach > 0 ? reach / (reach + 1) : 0;
    R.forEach(function (C) {
      var nM = ((C.a0 + C.a1) / 2 - hcM) / uM, nC = ((C.b0 + C.b1) / 2 - hcC) / uC;
      C.dist = Math.sqrt(nM * nM + nC * nC); C.nM = nM; C.nC = nC;
    });
    var order = R.filter(function (C) { return C !== Hr; }).sort(function (A, B) {
      var ra = A.ring < 0 ? 99 : A.ring, rb = B.ring < 0 ? 99 : B.ring;
      return ra !== rb ? ra - rb : A.dist - B.dist;
    });
    var pairAxis = function (P, C) {
      var dcM = (C.a0 + C.a1) - (P.a0 + P.a1), dcC = (C.b0 + C.b1) - (P.b0 + P.b1);
      if (C.ri === P.ri && P !== Hr) return { m: true, s: dcM >= 0 ? 1 : -1 };
      var sm = sepM(P, C), sc = sepC(P, C);
      var useM = (minM - sm) <= (minC - sc);
      if (C.ri === P.ri) useM = true;
      return useM ? { m: true, s: dcM >= 0 ? 1 : -1 } : { m: false, s: dcC >= 0 ? 1 : -1 };
    };
    placed = [Hr];
    order.forEach(function (C) {
      var fall = C.ring > 0 ? str * (C.ring === 1 ? 1 : Math.pow(qf, C.ring - 1)) : 0;
      var rn = C.dist || 1;
      C.dm = C.nM / rn * Hr.gm * fall;
      C.dc = C.nC / rn * Hr.gc * fall;
      var ax = C.ax = [];
      for (var p = 0; p < placed.length; p++) ax.push(pairAxis(placed[p], C));
      for (var pass = 0; pass < 6; pass++) {
        var hit = false;
        for (var p2 = 0; p2 < placed.length; p2++) {
          var P = placed[p2];
          var sm = Math.max((C.a0 + C.dm) - (P.a1 + P.dm), (P.a0 + P.dm) - (C.a1 + C.dm));
          var sc = Math.max((C.b0 + C.dc) - (P.b1 + P.dc), (P.b0 + P.dc) - (C.b1 + C.dc));
          if (sm >= minM - 0.01 || sc >= minC - 0.01) continue;
          hit = true;
          var A = ax[p2];
          if (A.m) {
            var gapM = A.s > 0 ? (C.a0 + C.dm) - (P.a1 + P.dm) : (P.a0 + P.dm) - (C.a1 + C.dm);
            C.dm += A.s * (minM - gapM);
          } else {
            var gapC = A.s > 0 ? (C.b0 + C.dc) - (P.b1 + P.dc) : (P.b0 + P.dc) - (C.b1 + C.dc);
            C.dc += A.s * (minC - gapC);
          }
        }
        if (!hit) break;
      }
      placed.push(C);
    });

    for (var z = 0; z < R.length; z++) {
      var Z = R[z]; if (Z === Hr || (Math.abs(Z.dm) < 0.3 && Math.abs(Z.dc) < 0.3)) continue;
      var px = ay ? Z.dc : Z.dm, py = ay ? Z.dm : Z.dc;
      Z.el.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px)';
      gal.pushed.push(Z.el);
    }
  }
  /* HOVER RESOLUTION: tiles draw at their 1× layout size, so a scaled-up hovered
     tile would be an upscaled low-res frame. While hovered, its canvas backing
     store grows to layout × Hover scale × devicePixelRatio (capped at the clip's
     native resolution) and is redrawn at once; unhover restores it. Only ONE
     canvas is ever large, so the cost is a single bigger draw per frame. The
     inline CSS height locks the box so the swap never shifts layout. */
  function hiRes(cv, on) {
    var c = cv && cv._cv; if (!c) return;
    var w = c.w0, hh = c.h0;
    if (on) {
      var S = gal.src[c.src], nat = S && S.v.videoWidth ? S.v.videoWidth / c.w0 : Infinity;
      var k = Math.max(1, Math.min((window.PG_HOVER_SCALE || 1) * (window.devicePixelRatio || 1), nat));
      w = Math.round(c.w0 * k); hh = Math.round(c.h0 * k);
    }
    if (cv.width === w && cv.height === hh) return;
    cv.width = w; cv.height = hh;
    c.ctx.imageSmoothingQuality = 'high';
    c.stamp = -1;
    var S2 = gal.src[c.src];
    if (S2 && S2.v.readyState >= 2) { try { c.ctx.drawImage(S2.v, 0, 0, w, hh); c.stamp = S2.stamp; } catch (e) {} }
  }
  /* RELEASE DELAY (Unselected clips → Release delay, PG_UNSEL_RELEASE ms): a
     SOFT unhover (cursor crossing a gap, leaving the gallery, content moving
     out from under it) is HELD that long — the old clip stays hovered. If
     another clip is entered meanwhile, only the two clips swap and the rest of
     the gallery never leaves its unselected look, so a fast sweep no longer
     strobes every tile through unselected → normal → unselected at each gap.
     HARD unhovers (drag start) apply at once.
     FADE BACK (Unselected clips → Fade back, PG_UNSEL_FADEBACK s): on a
     clip-to-clip swap the clip just LEFT carries .pg-left for that long; its
     CSS transition re-blurs / dims it more slowly than the hover duration, so
     a sweep leaves a soft trail. Only that clip — the first hover's dimming of
     the whole gallery keeps the normal (quick) duration. */
  function cancelRelease() { if (gal.relT) { clearTimeout(gal.relT); gal.relT = null; } }
  function markLeft(el) {
    var fb = +window.PG_UNSEL_FADEBACK || 0;
    if (fb <= 0) return;
    el.classList.add('pg-left');
    clearTimeout(el._pgLeftT);
    el._pgLeftT = setTimeout(function () { el.classList.remove('pg-left'); }, fb * 1000 + 60);
  }
  function setHover(item, hard) {
    if (item || hard) cancelRelease();
    if (item === gal.hoverEl) { if (!item) cancelRelease(); return; }
    if (!item && !hard) {
      var hold = +window.PG_UNSEL_RELEASE || 0;
      if (hold > 0) {
        if (!gal.relT) gal.relT = setTimeout(function () { gal.relT = null; setHover(null, true); }, hold);
        return;
      }
    }
    cancelRelease();
    clearPush();
    if (gal.hoverEl) {
      gal.hoverEl.classList.remove('is-hover');
      if (item) markLeft(gal.hoverEl);
    }
    gal.hoverEl = item || null;
    var hc = item ? item.querySelector('canvas') : null;
    hiRes(gal.hoverCanvas, false);
    gal.hoverCanvas = hc; gal.hoverSrc = hc ? hc.dataset.src : null;
    hiRes(hc, true);
    if (gal.viewport) gal.viewport.classList.toggle('pg-has-hover', !!item);   /* drives the Unselected-clips look */
    setPlayTarget(hc);
    if (window.PG_UNSEL_PAUSE && !window.PG_HOVER_PLAY) manageSources(performance.now());
    if (!item) {
      gal.hoverKey = null;
      if (!overlay.open) hideDesc();
      return;
    }
    clearTimeout(item._pgLeftT); item.classList.remove('pg-left');   /* re-entered: sharpen at normal speed */
    item.classList.add('is-hover');
    gal.hoverKey = item.dataset.key;
    if (!overlay.open) showDesc(gal.hoverKey);
    applyPush(item);
  }
  function itemAt(x, y) {
    var el = document.elementFromPoint(x, y);
    var it = el && el.closest ? el.closest('.pg-item') : null;
    return it && gal.outer && gal.outer.contains(it) ? it : null;
  }

  function tick(now) {
    if (!gal.on) { gal.raf = null; return; }
    var dt = Math.min(now - gal.ft, 50);
    gal.ft = now;
    gal.frame++;

    if (!gal.drag) {
      gal.hOff += gal.velX * dt;
      gal.vOff += gal.velY * dt;
      var decay = Math.pow(FRICTION, dt / (1000 / 60));
      gal.velX *= decay; gal.velY *= decay;
      if (Math.abs(gal.velX) < 0.0004) gal.velX = 0;
      if (Math.abs(gal.velY) < 0.0004) gal.velY = 0;
      var want = (window.PG_HOVER_PAUSE && gal.hoverEl) ? 0 : 1;
      gal.autoMul += (want - gal.autoMul) * (1 - Math.pow(0.94, dt / (1000 / 60)));
      if (gal.mode !== 'vertical')   gal.hOff += ((window.PG_SPEED  || 0) / 1000) * dt * gal.autoMul;
      if (gal.mode !== 'horizontal') gal.vOff += ((window.PG_VSPEED || 0) / 1000) * dt * gal.autoMul;
    }
    if (gal.mode === 'free') gal.vOff = mod(gal.vOff, gal.setH);
    applyTransforms();

    /* content moves under a still cursor → re-hit-test a few times a second */
    if (gal.ptrIn && !gal.drag && !overlay.open && gal.frame % 4 === 0) setHover(itemAt(gal.curX, gal.curY));

    stepRamps(dt);
    /* fallback frame stamp where requestVideoFrameCallback never fired */
    for (var k in gal.src) { var S = gal.src[k]; if (!S.rvfc && !S.v.paused) S.stamp++; }
    drawTiles();
    if (now - gal.lastMgmt > 250) { gal.lastMgmt = now; manageSources(now); }

    if (gal.drag && gal.heldItemKey && gal.outer) {
      var curr = itemAt(gal.curX, gal.curY);
      if (curr && curr.dataset.key === gal.heldItemKey && curr !== gal.heldItem) {
        curr.classList.add('is-held');
        if (gal.heldItem) gal.heldItem.classList.remove('is-held');
        gal.heldItem = curr;
        if (gal.hoverEl) setHover(curr);   /* hover (+ push) follows the visible copy */
      }
    }
    /* PUSH ACROSS TRACK WRAPS: each track loops on its own (applyTransforms),
       so when one wraps a DIFFERENT copy of its clips sits beside the hovered
       one and the old push targets jump a period away. Re-run the push on the
       copies now in place — visually identical, so it's applied without a
       transition (.pg-snap; drag already has none). */
    if (gal.hoverEl && gal.wrapGen !== gal.pushGen) {
      var vp = gal.viewport, snap = vp && !gal.drag;
      if (snap) vp.classList.add('pg-snap');
      clearPush(); applyPush(gal.hoverEl);
      if (snap) requestAnimationFrame(function () { vp.classList.remove('pg-snap'); });
    }
    gal.raf = requestAnimationFrame(tick);
  }

  /* ── input ── viewport listeners bind per mount; document listeners ONCE */
  function onDown(cx, cy, target) {
    gal.drag = true; gal.autoMul = 0; gal.velX = 0; gal.velY = 0;
    gal.dsx = gal.dlx = cx; gal.dsy = gal.dly = cy;
    gal.dlt = performance.now(); gal.dd = 0;
    /* HOLD-AND-DRAG KEEPS THE HOVER: a drag that starts ON a clip does NOT
       unhover — the grabbed clip stays the hovered one for the whole drag
       (unselected look, push, description, Pause unselected all intact). While
       dragging, hover is frozen (mousemove + the tick re-hit skip during drag);
       it only follows the held clip when the track loop swaps it for another
       copy (tick). Normal hover resumes on release (onUp). A drag from a gap
       unhovers at once, as before. */
    var item = target && target.closest ? target.closest('.pg-item') : null;
    gal.heldItem = item; gal.heldItemKey = item ? item.dataset.key : null;
    if (gal.viewport) gal.viewport.classList.add('is-dragging');
    if (item) {
      item.classList.add('is-held');
      if (item !== gal.hoverEl) setHover(item);   /* e.g. touch, or pressed during a release hold */
      else cancelRelease();
    } else setHover(null, true);
  }
  function onMove(cx, cy) {
    gal.curX = cx; gal.curY = cy;
    if (!gal.drag) return;
    var dx = cx - gal.dlx, dy = cy - gal.dly, now = performance.now(), dt = now - gal.dlt || 1;
    if (gal.mode !== 'vertical')   { gal.hOff += dx; gal.velX = dx / dt; } else gal.velX = 0;
    if (gal.mode !== 'horizontal') { gal.vOff -= dy; gal.velY = -dy / dt; } else gal.velY = 0;
    gal.dd += Math.sqrt(dx * dx + dy * dy);    gal.dlx = cx; gal.dly = cy; gal.dlt = now;
  }
  function onUp(cx, cy, target) {
    if (!gal.drag) return;
    gal.drag = false;
    if (gal.viewport) gal.viewport.classList.remove('is-dragging');
    if (gal.heldItem && gal.outer) {
      var key = gal.heldItem.dataset.key;
      gal.outer.querySelectorAll('.pg-item[data-key="' + key + '"]').forEach(function (el) { el.classList.remove('is-held'); });
      gal.heldItem = null; gal.heldItemKey = null;
    }
    if (gal.dd < CLICK_DIST) {
      var item = target && target.closest ? target.closest('.pg-item') : null;
      if (item) openOverlay(item);
    }
    /* released on the held clip → hover simply continues; on another clip →
       normal swap; on a gap / outside → normal (Release delay) unhover */
    setHover(gal.ptrIn ? itemAt(cx, cy) : null);
  }

  function bindViewport() {
    var vp = gal.viewport;
    if (!vp || vp._bound) return;
    vp._bound = true;
    vp.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      onDown(e.clientX, e.clientY, e.target);
    });
    vp.addEventListener('mouseenter', function () { gal.ptrIn = true; });
    vp.addEventListener('mouseleave', function () { gal.ptrIn = false; if (!gal.drag) setHover(null); });
    vp.addEventListener('mousemove', function (e) {
      gal.ptrIn = true;
      if (gal.drag || overlay.open) return;
      var it = e.target.closest ? e.target.closest('.pg-item') : null;
      setHover(it);
    });
    vp.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });
    vp.addEventListener('wheel', function (e) {
      e.preventDefault();
      /* Scroll speed (PG_WHEEL_SPEED) scales wheel sensitivity + the velocity cap;
         Reverse (PG_WHEEL_INVERT) flips it; in FREE mode the wheel's main axis is
         PG_FREE_WHEEL_DIR (vertical = wheel scrolls Y, horizontal = wheel scrolls X,
         diagonal = both at PG_FREE_WHEEL_ANGLE degrees: 0 = horizontal, 90 =
         vertical, 45 = equal parts, negative = the other diagonal; a trackpad's
         sideways delta always drives the perpendicular direction). */
      var sp = window.PG_WHEEL_SPEED != null ? +window.PG_WHEEL_SPEED : 1;
      var K = 0.0018 * sp * (window.PG_WHEEL_INVERT ? -1 : 1), cap = 3.5 * Math.max(1, sp);
      var dom = (Math.abs(e.deltaX) > Math.abs(e.deltaY)) ? e.deltaX : e.deltaY;
      if (gal.mode === 'horizontal') gal.velX -= dom * K;
      else if (gal.mode === 'vertical') gal.velY += dom * K;
      else if (window.PG_FREE_WHEEL_DIR === 'diagonal') {
        var ang = (window.PG_FREE_WHEEL_ANGLE != null ? +window.PG_FREE_WHEEL_ANGLE : 45) * Math.PI / 180;
        var ca = Math.cos(ang), sa = Math.sin(ang);
        /* main (deltaY) along (−cos, +sin) — the blend of the two straight modes;
           sideways (deltaX) along the true PERPENDICULAR, oriented so its X part
           is always ≤ 0 (a rightward swipe keeps the vertical mode's sense) */
        var px = sa >= 0 ? -sa : sa, py = sa >= 0 ? -ca : ca;
        gal.velX += (-e.deltaY * ca + e.deltaX * px) * K;
        gal.velY += ( e.deltaY * sa + e.deltaX * py) * K;
      }
      else if (window.PG_FREE_WHEEL_DIR === 'horizontal') { gal.velX -= e.deltaY * K; gal.velY += e.deltaX * K; }
      else { gal.velY += e.deltaY * K; gal.velX -= e.deltaX * K; }
      gal.velX = Math.max(-cap, Math.min(cap, gal.velX));
      gal.velY = Math.max(-cap, Math.min(cap, gal.velY));
    }, { passive: false });
  }

  document.addEventListener('mousemove', function (e) { if (gal.on) onMove(e.clientX, e.clientY); });
  document.addEventListener('mouseup', function (e) { if (gal.on) onUp(e.clientX, e.clientY, e.target); });
  document.addEventListener('touchmove', function (e) {
    if (gal.on && gal.drag && e.touches.length === 1) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }
  }, { passive: false });
  document.addEventListener('touchend', function (e) {
    if (gal.on && e.changedTouches.length) onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY, e.target);
  });
  window.addEventListener('blur', function () { if (gal.drag) onUp(gal.dlx, gal.dly, null); });
  /* clicking anywhere in the TOOLBAR closes an expanded clip too (the overlay
     only covers the content window). The click still does its normal job. */
  document.addEventListener('click', function (e) {
    if (overlay.open && e.target && e.target.closest && e.target.closest('.left, #tb-expand, #tb-minimize')) closeOverlay();
  }, true);

  var _resizeT = false;
  window.addEventListener('resize', function () {
    if (_resizeT || !gal.on) return;
    _resizeT = true;
    requestAnimationFrame(function () {
      _resizeT = false;
      if (gal.on) build();
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
    var leftW = ovLeft();   /* overlay origin: toolbar edge, or 0 over the whole window */
    var availW = window.innerWidth  - leftW - PG_OVERLAY_PAD * 2;
    var availH = window.innerHeight - PG_OVERLAY_PAD * 2;
    var natW = rect.width, natH = rect.height;
    /* prefer natural media dims when available */
    if (isVid) {
      var sv = gal.src[mediaSrc] && gal.src[mediaSrc].v;
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
    var leftW  = ovLeft();
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

  window.Playground = {
    mount: mount,
    unmount: unmount,
    closeOverlay: closeOverlay,
    rebuild: function () { if (gal.on) build(); }
  };
})();
