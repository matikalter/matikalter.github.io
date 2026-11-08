/* ======================================================================
   GALLERY DISPLAY — alternate home-page thumbnail layout.

   ROW ORDER (the only order): a multi-row grid that scrolls HORIZONTALLY.
   Tiles flow LEFT→RIGHT across a row, then down to the next row
   (row = floor(k / perRow), perRow = ceil(n / rows)).

   Tiles are dimmed/blurred (the gallery's own "inactive" treatment) until
   hovered, where they snap sharp and scale. Hover surfaces the project's
   title / mini / tags CENTERED over the tile.

   Reads config from globals set in index.html applyTweaks():
     GALR_ROWS, GALR_THUMB_SIZE, GALR_CONFORMITY, GALR_COL_GAP, GALR_ROW_GAP,
     GALR_X, GALR_Y, GALR_ROW_OFFSET, GALR_COL_OFFSET,
     GAL_CONFORM, GAL_ASPECT, GAL_ASPECT_FLIP, GAL_HOVER_SCALE,
     GAL_SCROLL_SPEED, GAL_SCROLL_SMOOTHING,
     GAL_INFO_* , projects, activeFilters, PROJECT_ORDER, PROJECT_HIDDEN
   Exposes window.GalleryDisplay.{build, relayout, destroy, scaleFactor,
   refreshInfo}. Shares window.__thumbRatioCache with list-gallery.js.
   ====================================================================== */
(function () {
  'use strict';

  var ratioCache = window.__thumbRatioCache || (window.__thumbRatioCache = {});
  var built = false;

  function num(v, d) { return (v != null && !isNaN(Number(v))) ? Number(v) : d; }
  function isVideoSrc(s) { return /\.(mp4|webm|mov|m4v)$/i.test(s || ''); }
  /* a thumb naming a path with a SLASH is read relative to assets/ (shared asset,
     one file referenced by several pages); a bare filename lives in the project's
     own folder. Mirrors assetPath() in portfolio.js. */
  function thumbSrc(p) {
    if (!p.thumb) return '';
    return 'assets/' + (String(p.thumb).indexOf('/') !== -1 ? p.thumb : (p.id + '/' + p.thumb));
  }
  function ratioFor(p) {
    var s = thumbSrc(p);
    if (s && ratioCache[s] != null) return ratioCache[s];
    return p.thumbRatio || 1.778;
  }
  function stageEl() { return document.getElementById('gallery-stage'); }

  /* ── SMOOTH SCROLL — SPRING + INERTIA ──────────────────────────────────
     One rAF engine drives the stage's horizontal scroll for BOTH the wheel and
     the click-drag, so motion glides instead of snapping per event.

       mode 'chase' (wheel) — a critically-damped SPRING pulls the position
         toward an accumulating target. Velocity RAMPS UP while the wheel feeds
         it and, crucially, keeps rolling after the input stops, coasting to a
         soft stop instead of braking the instant the events end. Smoothing
         picks the spring constant: 0 = near-instant, 1 = long organic glide.
       mode 'drag' — a much stiffer spring so the grid tracks the cursor.
       mode 'coast' — after a drag release: no target, just friction, so a flick
         throws the grid and it drifts to rest.
     ── */
  var S = { pos: null, target: 0, vel: 0, raf: 0, mode: 'idle' };

  function axisMax(s) { return Math.max(0, s.scrollWidth - s.clientWidth); }
  function smoothing() {
    var v = Number(window.GAL_SCROLL_SMOOTHING != null ? window.GAL_SCROLL_SMOOTHING : 0.8);
    if (isNaN(v)) v = 0.8;
    return Math.max(0, Math.min(1, v));
  }
  function ensurePos(s) {
    if (S.pos == null || S.mode === 'idle') { S.pos = s.scrollLeft; S.target = S.pos; S.vel = 0; }
  }
  function startLoop() { if (!S.raf) S.raf = requestAnimationFrame(step); }

  function step() {
    S.raf = 0;
    var s = stageEl();
    if (!s || S.pos == null || S.mode === 'idle') { S.mode = 'idle'; return; }
    var max = axisMax(s), sm = smoothing(), k, d;

    if (S.mode === 'drag') {
      /* exponential chase — tracks the cursor closely with no overshoot; the
         velocity it leaves behind is what the release throws. */
      S.vel = (S.target - S.pos) * 0.3;
    } else if (S.mode === 'coast') {
      S.vel *= (0.88 + 0.08 * sm);           /* 0.88 → 0.96 friction per frame */
      S.target = S.pos;
    } else {                                  /* 'chase' — the wheel spring */
      k = 0.26 * Math.pow(0.03, sm);          /* 0.26 (snappy) → 0.008 (long glide) */
      d = Math.max(0.15, Math.min(0.985, 1 - 1.55 * Math.sqrt(k)));
      S.vel += (S.target - S.pos) * k;
      S.vel *= d;
    }

    S.pos += S.vel;
    if (S.pos < 0)   { S.pos = 0;   S.vel = 0; if (S.target < 0) S.target = 0; }
    if (S.pos > max) { S.pos = max; S.vel = 0; if (S.target > max) S.target = max; }
    s.scrollLeft = S.pos;

    var settled = Math.abs(S.vel) < 0.06 &&
                  (S.mode !== 'chase' || Math.abs(S.target - S.pos) < 0.4);
    if (settled && S.mode !== 'drag') {
      S.pos = Math.round(S.pos); s.scrollLeft = S.pos;
      S.target = S.pos; S.vel = 0; S.mode = 'idle';
      return;
    }
    startLoop();
  }

  function galScrollBy(delta) {
    var s = stageEl(); if (!s) return;
    ensurePos(s);
    if (S.mode !== 'chase') { S.target = S.pos; S.mode = 'chase'; }
    S.target += delta;
    var max = axisMax(s);
    if (S.target < 0) S.target = 0;
    if (S.target > max) S.target = max;
    startLoop();
  }
  function galDragStart() {
    var s = stageEl(); if (!s) return;
    S.pos = s.scrollLeft; S.target = S.pos; S.vel = 0; S.mode = 'drag';
  }
  function galDragTo(v) {
    if (S.mode !== 'drag') return;
    S.target = v;
    startLoop();
  }
  function galDragEnd() {
    if (S.mode !== 'drag') return;
    S.mode = 'coast';                          /* keep the velocity — flick throw */
    startLoop();
  }
  function galScrollReset() { S.pos = null; S.target = 0; S.vel = 0; S.mode = 'idle'; }

  /* measure any not-yet-cached thumbnails, then re-fit once they load */
  function measureUncached(vis) {
    var srcs = [];
    vis.forEach(function (p) {
      var s = thumbSrc(p);
      if (s && ratioCache[s] == null && srcs.indexOf(s) === -1) srcs.push(s);
    });
    if (!srcs.length) return;
    var pending = srcs.length, changed = false;
    var finish = function () {
      /* resize in place when we can — a full rebuild would tear down + re-decode
         the video tiles (visible as a flash) */
      if (--pending === 0 && changed && built && !relayout()) build();
    };
    srcs.forEach(function (s) {
      if (isVideoSrc(s)) {
        var vid = document.createElement('video');
        vid.preload = 'metadata'; vid.muted = true;
        vid.onloadedmetadata = function () {
          if (vid.videoWidth && vid.videoHeight) { ratioCache[s] = vid.videoWidth / vid.videoHeight; changed = true; }
          finish();
        };
        vid.onerror = finish; vid.src = s;
        return;
      }
      var img = new Image();
      img.onload = function () {
        if (img.naturalWidth && img.naturalHeight) { ratioCache[s] = img.naturalWidth / img.naturalHeight; changed = true; }
        finish();
      };
      img.onerror = finish; img.src = s;
    });
  }

  /* ── ordered + filtered project list (mirrors list-gallery.js) ── */
  function orderedProjects() {
    var order = window.PROJECT_ORDER;
    if (!order || !order.length) return projects.slice();
    var byId = {}; projects.forEach(function (p) { byId[p.id] = p; });
    var out = [];
    order.forEach(function (id) { if (byId[id]) { out.push(byId[id]); delete byId[id]; } });
    projects.forEach(function (p) { if (byId[p.id]) out.push(p); });
    return out;
  }
  function visibleProjects() {
    var af = window.activeFilters || { all: true };
    var keys = Object.keys(af).filter(function (k) { return k !== 'all'; });
    var hidden = window.PROJECT_HIDDEN || {};
    return orderedProjects().filter(function (p) {
      if (p.hidden) return false;
      if (hidden[p.id]) return false;
      if (af.all || keys.length === 0) return true;
      return keys.some(function (k) { return p.tags.indexOf(k) !== -1; });
    });
  }

  function tileHTML(p, w, h, cls) {
    return '<div class="gal-item' + (cls ? (' ' + cls) : '') + '" data-id="' + p.id + '" style="width:' + w + 'px">'
      + '<div class="gal-thumb" style="height:' + h + 'px">'
      + '<div class="gal-thumb-media">'
      + (p.thumb
           ? (isVideoSrc(p.thumb)
                /* VIDEO thumbs render as a CANVAS mirroring a hidden pooled
                   <video> (same technique as playground-gallery.js). A composited
                   <video> shows a flickery 1px dark seam at its rounded edges; a
                   canvas paints like an <img>, so the edge shape behaves the same
                   for mp4/gif/jpg. */
                ? '<canvas class="gal-vthumb" data-src="' + thumbSrc(p) + '"></canvas>'
                : '<img src="' + thumbSrc(p) + '" alt="' + p.title + '" draggable="false">')
           : '')
      + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ── VIDEO-THUMB CANVAS MIRRORING ──
     ONE hidden, muted, looping <video> per unique clip lives in #gal-vpool
     (near-invisible, NOT display:none — that would stop decoding); every
     gal-vthumb canvas copies its source's current frame each rAF. Only
     Playground has a video thumb today, so this is 1 decoder + 1 draw/frame. */
  function poolVideo(src) {
    var pool = document.getElementById('gal-vpool');
    if (!pool) {
      pool = document.createElement('div');
      pool.id = 'gal-vpool';
      pool.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;';
      document.body.appendChild(pool);
    }
    var v = pool.querySelector('video[data-src="' + src + '"]');
    if (!v) {
      v = document.createElement('video');
      v.setAttribute('data-src', src);
      v.muted = true; v.loop = true; v.autoplay = true;
      v.playsInline = true; v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.style.cssText = 'width:2px;height:2px;';
      v.src = src;
      pool.appendChild(v);
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    }
    return v;
  }
  var _vRAF = 0, _vWatch = 0, _lastDraw = 0, _rafTicks = 0, _probe = 0;
  function drawFrame() {
    var grid = document.getElementById('gallery-grid');
    if (!built || !grid) return false;
    var canvases = grid.querySelectorAll('canvas.gal-vthumb');
    if (!canvases.length) return false;
    if (document.hidden) { _lastDraw = Date.now(); return true; }   // keep loop alive, skip work
    for (var i = 0; i < canvases.length; i++) {
      var c = canvases[i];
      /* cache the source element + 2d context on the node — re-querying the
         pool and re-fetching the context every frame is pure churn */
      var v = c._srcVid || (c._srcVid = poolVideo(c.dataset.src));
      if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
      if (v.readyState >= 2 && v.videoWidth) {
        if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
        (c._ctx || (c._ctx = c.getContext('2d'))).drawImage(v, 0, 0);
      }
    }
    _lastDraw = Date.now();
    return true;
  }
  function drawVideoTiles() {
    _vRAF = 0;
    _rafTicks++;
    if (!drawFrame()) return;
    _vRAF = requestAnimationFrame(drawVideoTiles);
  }
  function startVideoTiles(grid) {
    var canvases = grid.querySelectorAll('canvas.gal-vthumb');
    if (canvases.length) {
      /* seed the pool eagerly so decode starts now, not on the first rAF tick */
      for (var i = 0; i < canvases.length; i++) poolVideo(canvases[i].dataset.src);
      if (!_vRAF) _vRAF = requestAnimationFrame(drawVideoTiles);
      probeRAF();
    } else stopVideoTiles();
  }
  /* WATCHDOG: rAF never fires in throttled/offscreen contexts (embedded
     previews, background tabs) — without a fallback the canvas would stay BLANK
     there. Intervals keep ticking (clamped, but ticking), so one is armed as a
     backstop — but ONLY where rAF has actually proven unreliable. probeRAF()
     samples the tick count over a second: starved → arm; healthy → disarm. A
     permanent second timer on a healthy page is pure overhead. */
  function armWatch() {
    if (_vWatch) return;
    _vWatch = setInterval(function () {
      if (Date.now() - _lastDraw > 400) {
        drawFrame();
        if (!_vRAF) _vRAF = requestAnimationFrame(drawVideoTiles);
      }
    }, 500);
  }
  function probeRAF() {
    clearTimeout(_probe);
    var start = _rafTicks;
    _probe = setTimeout(function () {
      _probe = 0;
      if (!built) return;
      if (_rafTicks - start < 5) armWatch();
      else if (_vWatch) { clearInterval(_vWatch); _vWatch = 0; }
    }, 1000);
  }
  /* re-probe when the page comes back: rAF health changes with visibility */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && built && _vRAF) probeRAF();
  });
  function stopVideoTiles() {
    if (_vRAF) { cancelAnimationFrame(_vRAF); _vRAF = 0; }
    if (_vWatch) { clearInterval(_vWatch); _vWatch = 0; }
    if (_probe) { clearTimeout(_probe); _probe = 0; }
    var pool = document.getElementById('gal-vpool');
    if (pool) pool.querySelectorAll('video').forEach(function (v) { v.pause(); });
  }

  /* ── INLINE HOVER INFO (title + mini + tags) ── */
  function getById(id) {
    for (var i = 0; i < projects.length; i++) if (projects[i].id === id) return projects[i];
    return null;
  }
  function labelForTag(key) {
    var defs = (typeof tagDefs !== 'undefined' && tagDefs) ? tagDefs : (window.tagDefs || []);
    for (var i = 0; i < defs.length; i++) if (defs[i].key === key) return defs[i].label;
    return key;
  }
  function infoInnerHTML(p) {
    var esc = function (s) { return s == null ? '' : s; };
    var showTitle = (window.GAL_INFO_TITLE !== false);
    var showMini  = (window.GAL_INFO_MINI  !== false);
    var showTags  = (window.GAL_INFO_TAGS  !== false);
    var tags = (showTags && p.tags && p.tags.length)
      ? '<div class="gal-info-tags tag-row">'
          + p.tags.filter(function (t) { return !(window.tagIsDeleted && window.tagIsDeleted(t)); })
              .map(function (t) { return '<span class="tag-pill" data-tag="' + String(t).replace(/"/g, '') + '">' + labelForTag(t) + '</span>'; }).join('')
          + '</div>'
      : '';
    return '<div class="gal-info-inner">'
      + (showTitle ? '<div class="gal-info-title">' + esc(p.title) + '</div>' : '')
      + (showMini && p.mini ? '<div class="gal-info-desc">' + p.mini + '</div>' : '')
      + tags
      + '</div>';
  }

  var openInfo = null;   /* the .gal-info element currently open */
  var openId   = null;

  /* Align an overflowing single line (a title/word WIDER than the tile) to the
     chosen edge. CSS text-align is ignored by browsers once a single unbreakable
     word overflows its box — it always spills off the END (right, in LTR) no
     matter the alignment. So for the overflow case we pin text-align:left and
     push the line with a negative text-indent so its correct edge meets the box
     edge (right → shift fully left; centre → half). text-indent (not transform)
     keeps the element BOX unchanged. */
  function fitGalInfoText(info) {
    if (!info) return;
    var a = window.GAL_INFO_ALIGN || 'center';
    var sels = ['.gal-info-title', '.gal-info-desc'];
    for (var i = 0; i < sels.length; i++) {
      var el = info.querySelector(sels[i]);
      if (!el) continue;
      el.style.textIndent = '';
      el.style.textAlign = '';
      var over = el.scrollWidth - el.clientWidth;   /* ink beyond the content box */
      if (over > 1) {
        el.style.textAlign = 'left';
        el.style.textIndent = (a === 'right' ? -over : (a === 'center' ? -over / 2 : 0)) + 'px';
      }
    }
  }

  /* per-project X/Y nudge of the info block (on top of the global --gal-info-x/y),
     scaled with the responsive factor so it tracks the shrinking tile */
  function applyInfoPos(info, id) {
    var pos = (window.GAL_INFO_POS || {})[id] || {};
    var sc = scaleFactor();
    info.style.setProperty('--gi-px', ((Number(pos.x) || 0) * sc) + 'px');
    info.style.setProperty('--gi-py', ((Number(pos.y) || 0) * sc) + 'px');
  }
  function makeInfo(p) {
    var info = document.createElement('div');
    info.className = 'gal-info';
    info.setAttribute('data-info-for', p.id);
    info.innerHTML = infoInnerHTML(p);
    return info;
  }

  /* Show the project title + mini + tags CENTERED OVER the hovered thumbnail
     (fades in; no sliding / reflow). Appended INTO the .gal-item so it overlays
     exactly that tile. In always-show mode the info is already present, so
     hover is a no-op. */
  function showInfo(item) {
    if (window.GAL_INFO_ALWAYS) return;
    var id = item.dataset.id;
    if (openId === id && openInfo) return;
    hideInfo(true);
    var p = getById(id);
    if (!p) return;
    var info = makeInfo(p);
    item.appendChild(info);
    item.classList.add('has-info');
    void info.offsetHeight;          /* reflow so the fade transition runs */
    info.classList.add('show');
    openInfo = info; openId = id;
    applyInfoPos(info, id);          /* per-project offset */
    fitGalInfoText(info);
  }

  function hideInfo(instant) {
    if (window.GAL_INFO_ALWAYS) return;   /* persistent info — never hover-hide */
    var info = openInfo;
    openInfo = null; openId = null;
    if (!info) return;
    var item = info.parentNode;
    if (item && item.classList) item.classList.remove('has-info');
    if (instant) { info.remove(); return; }
    info.classList.remove('show');
    info.addEventListener('transitionend', function te(e) {
      if (e.propertyName !== 'opacity') return;
      info.removeEventListener('transitionend', te);
      info.remove();
    });
  }

  /* ALWAYS-SHOW + per-project offsets. Rebuilds/reconciles the persistent info
     blocks (or removes them when the toggle is off) and re-applies offsets to
     whatever info is currently on screen. */
  function refreshInfo() {
    var grid = document.getElementById('gallery-grid');
    if (!grid) return;
    if (window.GAL_INFO_ALWAYS) {
      /* drop any transient hover info first */
      openInfo = null; openId = null;
      grid.querySelectorAll('.gal-info:not(.gal-info-always)').forEach(function (el) {
        var it = el.parentNode; el.remove(); if (it) it.classList.remove('has-info');
      });
      grid.querySelectorAll('.gal-item').forEach(function (item) {
        var p = getById(item.dataset.id); if (!p) return;
        var info = item.querySelector(':scope > .gal-info.gal-info-always');
        if (!info) { info = makeInfo(p); info.classList.add('gal-info-always', 'show'); item.appendChild(info); item.classList.add('has-info'); }
        else { info.innerHTML = infoInnerHTML(p); }
        applyInfoPos(info, p.id);
        fitGalInfoText(info);
      });
    } else {
      grid.querySelectorAll('.gal-info.gal-info-always').forEach(function (el) {
        var it = el.parentNode; el.remove(); if (it) it.classList.remove('has-info');
      });
      /* re-apply offset to a live hover info */
      if (openInfo && openId) { applyInfoPos(openInfo, openId); fitGalInfoText(openInfo); }
    }
  }

  /* selected conform aspect ratio (w/h), flippable */
  function conformRatio() {
    var a = (window.GAL_ASPECT || '1:1').split(':');
    var w = parseFloat(a[0]) || 1, h = parseFloat(a[1]) || 1;
    var r = w / h;
    if (window.GAL_ASPECT_FLIP) r = 1 / r;
    return r;
  }

  /* RESPONSIVE SCALE — thumbnails keep their size RELATIVE to the main content
     section (mirrors the list display). Values are at the reference (full-size)
     window; scaled by currentContentW / fullContentW. Measured against the
     ACTUAL panel width (--left-w, drops to 0 when the toolbar collapses so the
     tiles enlarge to fill the freed space). */
  function scaleFactor() {
    var cs   = getComputedStyle(document.documentElement);
    var ref  = (window.TB_REF_W_OVERRIDE && window.TB_REF_W_OVERRIDE > 0)
                 ? window.TB_REF_W_OVERRIDE : (window.TB_REF_W || 1440);
    var base = (window.LEFT_W_BASE != null ? Number(window.LEFT_W_BASE) : 340);
    var leftW = parseFloat(cs.getPropertyValue('--left-w'));
    if (isNaN(leftW)) {
      leftW = parseFloat(cs.getPropertyValue('--panel-w'));
      if (isNaN(leftW)) leftW = base;
    }
    var fullContentW = Math.max(1, ref - base);
    var curContentW  = Math.max(1, (window.innerWidth || ref) - leftW);
    var s = curContentW / fullContentW;
    return (s > 1) ? 1 : s;   // never upscale past the reference layout
  }

  function computeRowMetrics() {
    var scale   = scaleFactor();
    var rows    = Math.max(1, Math.round(num(window.GALR_ROWS, 3)));
    var rowH    = Math.max(40, num(window.GALR_THUMB_SIZE, 200) * scale);
    var colGap  = num(window.GALR_COL_GAP, 24) * scale;   /* horizontal, between tiles */
    var rowGap  = num(window.GALR_ROW_GAP, 24) * scale;   /* vertical, between rows */
    var conform = (window.GAL_CONFORM !== false);
    var conformity = Math.max(0, Math.min(1, num(window.GALR_CONFORMITY, 1)));
    return {
      scale: scale, rows: rows, rowH: rowH, colGap: colGap, rowGap: rowGap,
      conform: conform, conformity: conformity
    };
  }
  function minRatioOf(vis) { var m = Infinity; vis.forEach(function (p) { var r = ratioFor(p); if (r < m) m = r; }); return isFinite(m) ? m : 1; }

  /* Tile dims — HEIGHT conformity: conformity 1 = every tile fills the row
     height (widths vary by aspect); conformity 0 = every tile shares one WIDTH
     (the tallest touches the row height), so heights keep their relative
     proportions. Guaranteed height ≤ rowH at every setting. */
  function rowDims(r, m, minR) {
    if (m.conform) { var rr = conformRatio(); return { w: Math.round(m.rowH * rr), h: Math.round(m.rowH) }; }
    var w0 = m.rowH * minR;                        /* equal-width reference */
    var w = w0 + (m.rowH * r - w0) * m.conformity; /* lerp(w0, rowH*r, c) */
    return { w: Math.round(w), h: Math.round(w / r) };
  }

  /* offset + position CSS vars (live) */
  function setSharedVars(scale) {
    if (scale == null) scale = scaleFactor();
    var r = document.documentElement.style;
    /* offsets SCALE with the responsive factor so offset thumbnails keep their
       relative position when the window width scales (matches applyTweaks). */
    r.setProperty('--galr-row-offset', (num(window.GALR_ROW_OFFSET, 0) * scale) + 'px');
    r.setProperty('--galr-col-offset', (num(window.GALR_COL_OFFSET, 0) * scale) + 'px');
  }
  function setPositionVars(scale) {
    var r = document.documentElement.style;
    /* X scales with the thumbnail size (relative horizontal position); Y is a
       FIXED px distance from the window top (like --filter-y). */
    r.setProperty('--galr-x', (num(window.GALR_X, 40) * scale) + 'px');
    r.setProperty('--galr-y', num(window.GALR_Y, 120) + 'px');
    r.setProperty('--gal-info-x', (num(window.GAL_INFO_X, 0) * scale) + 'px');
    r.setProperty('--gal-info-y', (num(window.GAL_INFO_Y, 0) * scale) + 'px');
    /* info-text sizes scale with the content-section width too (like the tiles)
       so the text keeps its size RELATIVE to the thumbnails as the window scales
       — the composition is maintained. Leading is a ratio, so it's left alone. */
    r.setProperty('--gal-title-size', (num(window.GAL_TITLE_SIZE, 34) * scale) + 'px');
    r.setProperty('--gal-mini-size',  (num(window.GAL_MINI_SIZE, 18) * scale) + 'px');
    r.setProperty('--gal-tag-size',   (num(window.GAL_TAG_SIZE, 12) * scale) + 'px');
  }

  /* ── build ── */
  function build() {
    var grid = document.getElementById('gallery-grid');
    if (!grid) return;
    hideInfo(true);
    var stage = stageEl();
    if (stage) stage.classList.add('stage-row');
    var vis = visibleProjects();
    measureUncached(vis);
    buildRows(grid, vis);
    bindEvents(grid);
    built = true;
    startVideoTiles(grid);
    hideScrollMarkers();
    refreshInfo();
  }

  function buildRows(grid, vis) {
    var m = computeRowMetrics();
    setPositionVars(m.scale); setSharedVars(m.scale);
    var minR = minRatioOf(vis);
    grid.className = 'gallery-grid order-row';
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.gap = m.rowGap + 'px';
    grid.style.width = '';   /* content-driven (extends horizontally) */
    grid.style.setProperty('--gal-cgap', m.colGap + 'px');
    var rows = m.rows;
    var perRow = Math.max(1, Math.ceil(vis.length / rows));
    var rowHtml = []; for (var rr = 0; rr < rows; rr++) rowHtml[rr] = '';
    for (var k = 0; k < vis.length; k++) {
      var p = vis[k], d = rowDims(ratioFor(p), m, minR);
      var rowIdx = Math.floor(k / perRow);   /* fill L→R across a row, then down */
      var colIdx = k % perRow;
      rowHtml[rowIdx] += tileHTML(p, d.w, d.h, (colIdx % 2 === 1) ? 'off-col' : '');
    }
    var out = '';
    for (var r2 = 0; r2 < rows; r2++) {
      out += '<div class="gal-row' + ((r2 % 2 === 1) ? ' off-row' : '') + '">' + rowHtml[r2] + '</div>';
    }
    grid.innerHTML = out;
  }

  /* ── relayout (resize existing tiles in place — no innerHTML rewrite so video
     tiles aren't torn down + re-decoded). Falls back to build() when the DOM
     can't map onto the current row count / project set. ── */
  function relayout() {
    var grid = document.getElementById('gallery-grid');
    if (!grid || !grid.firstChild) return false;
    if (!grid.classList.contains('order-row')) return false;
    var vis = visibleProjects();
    var m = computeRowMetrics();
    setPositionVars(m.scale); setSharedVars(m.scale);
    var rowEls = grid.querySelectorAll(':scope > .gal-row');
    if (rowEls.length !== m.rows) return false;
    if (grid.querySelectorAll(':scope > .gal-row > .gal-item').length !== vis.length) return false;
    var minR = minRatioOf(vis);
    grid.style.gap = m.rowGap + 'px';
    grid.style.setProperty('--gal-cgap', m.colGap + 'px');
    var ratioById = {}; vis.forEach(function (p) { ratioById[p.id] = ratioFor(p); });
    for (var rr = 0; rr < rowEls.length; rr++) {
      var tiles = rowEls[rr].querySelectorAll('.gal-item');
      for (var j = 0; j < tiles.length; j++) {
        var d = rowDims(ratioById[tiles[j].dataset.id] || 1.778, m, minR);
        tiles[j].style.width = d.w + 'px';
        var th = tiles[j].querySelector('.gal-thumb'); if (th) th.style.height = d.h + 'px';
      }
    }
    return true;
  }

  function bindEvents(grid) {
    if (!grid._clickBound) {
      grid._clickBound = true;
      grid.addEventListener('click', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('.gal-item') : null;
        if (item && item.dataset.id) window.openProject(item.dataset.id);
      });
      /* hover → surface that project's title + mini + tags CENTERED over the
         hovered tile. Moving onto a gap / the grid itself (no tile) hides it,
         so the info disappears on unhover, not only when hovering a new tile. */
      grid.addEventListener('mouseover', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('.gal-item') : null;
        if (item && item.dataset.id) showInfo(item);
        else hideInfo(false);
      });
      grid.addEventListener('mouseleave', function () {
        hideInfo(false);
      });
    }
    var stage = stageEl();
    /* CLICK-AND-DRAG scroll (like the list display): hold + drag anywhere in the
       content area to scroll horizontally. Cursor stays a normal pointer. A drag
       past a small threshold suppresses the click so it doesn't open a project;
       releasing mid-drag THROWS the grid (coast mode). */
    if (stage && !stage._dragBound) {
      stage._dragBound = true;
      var dragging = false, moved = false, sx = 0, startL = 0;
      function endDrag() {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        galDragEnd();
        setTimeout(function () { moved = false; }, 0);
      }
      stage.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest('#tweaks-root')) return;
        e.preventDefault();               /* no text selection / focus while dragging */
        document.body.style.userSelect = 'none';
        dragging = true; moved = false;
        sx = e.clientX;
        startL = stage.scrollLeft;
        galDragStart();
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        if (!(e.buttons & 1)) { endDrag(); return; }
        var dx = e.clientX - sx;
        if (Math.abs(dx) > 4) moved = true;
        var maxV = stage.scrollWidth - stage.clientWidth;
        galDragTo(Math.max(0, Math.min(maxV, startL - dx)));
      });
      window.addEventListener('mouseup', endDrag);
      window.addEventListener('blur', endDrag);
      /* capture-phase: swallow the click that follows a drag before it reaches
         the grid's open-project handler */
      stage.addEventListener('click', function (e) {
        if (moved) { e.stopPropagation(); e.preventDefault(); }
      }, true);
    }
  }

  /* The two scroll-affordance glyphs are a VERTICAL affordance shared with the
     list display. The gallery scrolls horizontally, so they're always hidden. */
  function hideScrollMarkers() {
    var d = document.getElementById('scroll-marker-down');
    var u = document.getElementById('scroll-marker-up');
    if (d) d.classList.remove('is-visible');
    if (u) u.classList.remove('is-visible');
  }

  function destroy() {
    built = false;
    stopVideoTiles();
    hideInfo(true);
    galScrollReset();
    var grid = document.getElementById('gallery-grid');
    if (grid) grid.innerHTML = '';
    var stage = stageEl();
    if (stage) stage.classList.remove('stage-row');
    hideScrollMarkers();
  }

  /* on resize, RESIZE the existing tiles in place (no DOM teardown) so video
     tiles don't flicker; fall back to a full rebuild if relayout can't map. */
  var _rt = false;
  window.addEventListener('resize', function () {
    if (_rt) return;
    _rt = true;
    requestAnimationFrame(function () {
      _rt = false;
      var hv = document.getElementById('home-view');
      if (built && hv && hv.style.display !== 'none' && window.DISPLAY_MODE === 'gallery') {
        hideInfo(true);
        if (!relayout()) build();
      }
    });
  });

  window.GalleryDisplay = { build: build, relayout: relayout, destroy: destroy, scaleFactor: scaleFactor, refreshInfo: refreshInfo };

  /* WHEEL — wheeling ANYWHERE on the home view scrolls the gallery horizontally
     (not the toolbar's own overflow). The delta feeds the spring target.
     Tweaks-panel wheels are left alone. Bound once. */
  if (!window.__galWheelBound) {
    window.__galWheelBound = true;
    window.addEventListener('wheel', function (e) {
      if (window.DISPLAY_MODE !== 'gallery') return;
      var hv = document.getElementById('home-view');
      if (!hv || hv.classList.contains('hidden') || hv.style.display === 'none') return;
      var t = e.target;
      if (t && t.closest && t.closest('#tweaks-root')) return;
      if (!stageEl()) return;
      e.preventDefault();
      var speed = (window.GAL_SCROLL_SPEED != null ? Number(window.GAL_SCROLL_SPEED) : 1);
      /* trackpads send horizontal delta on deltaX; use whichever is larger so a
         vertical wheel still drives the horizontal gallery */
      var delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY)) ? e.deltaX : e.deltaY;
      galScrollBy(delta * speed);
    }, { passive: false });
  }
})();
