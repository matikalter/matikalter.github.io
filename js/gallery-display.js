/* ======================================================================
   GALLERY DISPLAY — alternate home-page thumbnail layout.
   A multi-column, ROW-MAJOR grid (project 1 top-left, project 2 to its
   right, project 3 next row left, …). Tiles are dimmed/blurred (the
   gallery's own "inactive" treatment) until hovered, where they snap sharp
   and scale; hovering also surfaces that project's title + mini description
   (handled in portfolio.js via window.galleryHoverInfo).

   Reads config from globals set in index.html applyTweaks():
     GAL_COLUMNS, GAL_THUMB_SIZE, GAL_CONFORMITY, GAL_COL_GAP, GAL_ROW_GAP,
     GAL_X, GAL_Y, GAL_HOVER_SCALE, projects, activeFilters,
     PROJECT_ORDER, PROJECT_HIDDEN
   Exposes window.GalleryDisplay.{build, destroy}.
   Shares window.__thumbRatioCache with list-gallery.js (no double measuring).
   ====================================================================== */
(function () {
  'use strict';

  var ratioCache = window.__thumbRatioCache || (window.__thumbRatioCache = {});
  var built = false;

  function isVideoSrc(s) { return /\.(mp4|webm|mov|m4v)$/i.test(s || ''); }
  function thumbSrc(p) { return p.thumb ? ('assets/' + p.id + '/' + p.thumb) : ''; }
  function ratioFor(p) {
    var s = thumbSrc(p);
    if (s && ratioCache[s] != null) return ratioCache[s];
    return p.thumbRatio || 1.778;
  }

  /* measure any not-yet-cached thumbnails, then re-build once they load */
  function measureUncached(vis) {
    var srcs = [];
    vis.forEach(function (p) {
      var s = thumbSrc(p);
      if (s && ratioCache[s] == null && srcs.indexOf(s) === -1) srcs.push(s);
    });
    if (!srcs.length) return;
    var pending = srcs.length, changed = false;
    var finish = function () {
      if (--pending === 0 && changed && built) build();
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

  function tileHTML(p, h) {
    return '<div class="gal-item" data-id="' + p.id + '">'
      + '<div class="gal-thumb" style="height:' + h + 'px">'
      + '<div class="gal-thumb-media">'
      + (p.thumb
           ? (isVideoSrc(p.thumb)
                ? '<video src="' + thumbSrc(p) + '" autoplay muted loop playsinline preload="metadata" draggable="false"></video>'
                : '<img src="' + thumbSrc(p) + '" alt="' + p.title + '" draggable="false">')
           : '')
      + '</div>'
      + '</div>'
      + '</div>';
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
     section, exactly like the list display (which sizes columns as a fraction
     of the available content width). GAL_THUMB_SIZE / gaps / offsets are the
     values at the reference (full-size) window; we scale them by
     currentContentW / fullContentW so they shrink/grow as the window does
     while the column keeps its window-relative position (the grid is centered
     in the content area, so horizontal position tracks automatically). */
  function scaleFactor() {
    var cs   = getComputedStyle(document.documentElement);
    var ref  = (window.TB_REF_W_OVERRIDE && window.TB_REF_W_OVERRIDE > 0)
                 ? window.TB_REF_W_OVERRIDE : (window.TB_REF_W || 1440);
    var base = (window.LEFT_W_BASE != null ? Number(window.LEFT_W_BASE) : 340);
    /* proportional panel width (never 0) — matches the list's --panel-w usage
       so the content area is measured consistently even when collapsed */
    var panelW = parseFloat(cs.getPropertyValue('--panel-w'));
    if (isNaN(panelW)) {
      panelW = parseFloat(cs.getPropertyValue('--left-w'));
      if (isNaN(panelW)) panelW = base;
    }
    var fullContentW = Math.max(1, ref - base);
    var curContentW  = Math.max(1, (window.innerWidth || ref) - panelW);
    var s = curContentW / fullContentW;
    return (s > 1) ? 1 : s;   // never upscale past the reference layout
  }

  /* shared size metrics for the current window + tweaks */
  function computeMetrics() {
    var scale  = scaleFactor();
    var cols   = Math.max(1, Math.round(Number(window.GAL_COLUMNS) || 3));
    var colW   = Math.max(40, (Number(window.GAL_THUMB_SIZE) || 280) * scale);
    var colGap = (Number(window.GAL_COL_GAP) || 0) * scale;
    var rowGap = (Number(window.GAL_ROW_GAP) || 0) * scale;
    var conform = (window.GAL_CONFORM !== false);
    return {
      scale: scale, cols: cols, colW: colW, colGap: colGap, rowGap: rowGap,
      conform: conform, blockW: cols * colW + (cols - 1) * colGap
    };
  }

  function setOffsets(scale) {
    var r = document.documentElement.style;
    r.setProperty('--gal-x', ((Number(window.GAL_X) || 0) * scale) + 'px');
    r.setProperty('--gal-y', ((Number(window.GAL_Y) || 0) * scale) + 'px');
  }

  /* RELAYOUT — resize EXISTING tiles in place (no innerHTML rewrite) so the
     <video> tiles aren't torn down + recreated on every resize frame (which
     forces a re-fetch/decode and makes them flicker; cached <img>/GIF tiles
     repaint instantly so they never showed it). Falls back to a full build if
     the DOM doesn't match the current projects/mode. Returns true if it
     handled the relayout. */
  function relayout() {
    var grid = document.getElementById('gallery-grid');
    if (!grid || !grid.firstChild) return false;

    var m = computeMetrics();
    var vis = visibleProjects();
    setOffsets(m.scale);

    if (m.conform) {
      if (!grid.classList.contains('gal-conform')) return false;
      var items = grid.querySelectorAll(':scope > .gal-item');
      if (items.length !== vis.length) return false;
      grid.style.gridTemplateColumns = 'repeat(' + m.cols + ', ' + m.colW + 'px)';
      grid.style.columnGap = m.colGap + 'px';
      grid.style.rowGap = m.rowGap + 'px';
      grid.style.width = m.blockW + 'px';
      var h = Math.round(m.colW / conformRatio());
      for (var i = 0; i < items.length; i++) {
        var thumb = items[i].querySelector('.gal-thumb');
        if (thumb) thumb.style.height = h + 'px';
      }
      return true;
    }

    /* free mode */
    if (!grid.classList.contains('gal-free')) return false;
    var colEls = grid.querySelectorAll(':scope > .gal-col');
    if (colEls.length !== m.cols) return false;
    var ratioById = {};
    vis.forEach(function (p) { ratioById[p.id] = ratioFor(p); });
    grid.style.gap = m.colGap + 'px';
    grid.style.width = m.blockW + 'px';
    for (var c = 0; c < colEls.length; c++) {
      colEls[c].style.width = m.colW + 'px';
      colEls[c].style.rowGap = m.rowGap + 'px';
      var tiles = colEls[c].querySelectorAll('.gal-item');
      for (var j = 0; j < tiles.length; j++) {
        var rr = ratioById[tiles[j].dataset.id] || 1.778;
        var t2 = tiles[j].querySelector('.gal-thumb');
        if (t2) t2.style.height = Math.round(m.colW / rr) + 'px';
      }
    }
    return true;
  }

  /* ── build the grid ── */
  function build() {
    var grid = document.getElementById('gallery-grid');
    if (!grid) return;

    var m = computeMetrics();
    var cols = m.cols, colW = m.colW, colGap = m.colGap, rowGap = m.rowGap;
    var conform = m.conform;
    setOffsets(m.scale);

    var vis = visibleProjects();
    measureUncached(vis);

    var blockW = m.blockW;

    if (conform) {
      /* CONFORM — every thumbnail shares one selectable aspect ratio (cropped
         to fill via object-fit:cover). Row-major CSS grid → a neat uniform
         grid (project 1 top-left, 2 to its right, …). */
      var h = Math.round(colW / conformRatio());
      grid.className = 'gallery-grid gal-conform';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(' + cols + ', ' + colW + 'px)';
      grid.style.gap = '';
      grid.style.columnGap = colGap + 'px';
      grid.style.rowGap = rowGap + 'px';
      grid.style.gridAutoFlow = 'row';
      grid.style.width = blockW + 'px';
      var html = '';
      for (var i = 0; i < vis.length; i++) html += tileHTML(vis[i], h);
      grid.innerHTML = html;
    } else {
      /* FREE — thumbnails keep their NATIVE aspect (uncropped). All columns
         share one width (colW); heights vary, so rows don't align. Items are
         distributed ROUND-ROBIN across the columns (i % cols) so the row-major
         reading order is preserved (1 left, 2 middle, 3 right, 4 next row left
         …) with no extra spacing — column gap + per-column row gap only. */
      grid.className = 'gallery-grid gal-free';
      grid.style.display = 'flex';
      grid.style.gridTemplateColumns = '';
      grid.style.columnGap = '';
      grid.style.rowGap = '';
      grid.style.gap = colGap + 'px';
      grid.style.width = blockW + 'px';
      var colHtml = [];
      for (var c = 0; c < cols; c++) colHtml[c] = '';
      for (var k = 0; k < vis.length; k++) {
        var p = vis[k];
        var th = Math.round(colW / ratioFor(p));
        colHtml[k % cols] += tileHTML(p, th);
      }
      var out = '';
      for (var c2 = 0; c2 < cols; c2++) {
        out += '<div class="gal-col" style="width:' + colW + 'px;row-gap:' + rowGap + 'px">'
             + colHtml[c2] + '</div>';
      }
      grid.innerHTML = out;
    }

    bindEvents(grid);
    built = true;
    updateScrollMarkers();
  }

  var _bound = false;
  function bindEvents(grid) {
    /* click → open project */
    if (!grid._clickBound) {
      grid._clickBound = true;
      grid.addEventListener('click', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('.gal-item') : null;
        if (item && item.dataset.id) window.openProject(item.dataset.id);
      });
      /* hover → surface that project's title + mini description; leaving the
         grid clears them (title + mini hidden until hovering a tile). */
      grid.addEventListener('mouseover', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('.gal-item') : null;
        if (!item || !item.dataset.id) return;
        if (window.galleryHoverInfo) window.galleryHoverInfo(item.dataset.id);
      });
      grid.addEventListener('mouseleave', function () {
        if (window.galleryHoverInfo) window.galleryHoverInfo(null);
      });
    }
    /* scroll → update the affordance markers (top/bottom) */
    var stage = document.getElementById('gallery-stage');
    if (stage && !stage._smkBound) {
      stage._smkBound = true;
      stage.addEventListener('scroll', function () { updateScrollMarkers(); }, { passive: true });
    }
  }

  /* ── SCROLL-AFFORDANCE MARKERS (shared with the list display) ──
     The DOWN glyph fades in when the gallery is scrolled to the very top, the
     UP glyph when scrolled to the very bottom — same conditions as the list,
     but driven off the gallery-stage's native scroll. Cosmetics (glyph, size,
     yoyo anim) mirror the list's updateScrollMarkers; X is centered over the
     grid. */
  function updateScrollMarkers() {
    var down = document.getElementById('scroll-marker-down');
    var up   = document.getElementById('scroll-marker-up');
    var stage = document.getElementById('gallery-stage');
    var grid  = document.getElementById('gallery-grid');
    if (!down || !up || !stage || !grid) return;

    /* glyph text */
    var dg = (window.SCROLL_MARKER_DOWN_GLYPH != null ? window.SCROLL_MARKER_DOWN_GLYPH : '\u25bc');
    var ug = (window.SCROLL_MARKER_UP_GLYPH   != null ? window.SCROLL_MARKER_UP_GLYPH   : '\u25b2');
    var dInner = down.firstElementChild, uInner = up.firstElementChild;
    if (dInner && dInner.textContent !== dg) dInner.textContent = dg;
    if (uInner && uInner.textContent !== ug) uInner.textContent = ug;

    /* X: centered over the grid (viewport coords) + per-marker X offset */
    var gr = grid.getBoundingClientRect();
    var cx = (gr.left + gr.right) / 2;
    down.style.left   = (cx + (Number(window.SCROLL_MARKER_DOWN_X) || 0)) + 'px';
    down.style.bottom = (Number(window.SCROLL_MARKER_DOWN_Y) || 0) + 'px';
    down.style.top    = 'auto';
    up.style.left     = (cx + (Number(window.SCROLL_MARKER_UP_X) || 0)) + 'px';
    up.style.top      = (Number(window.SCROLL_MARKER_UP_Y) || 0) + 'px';
    up.style.bottom   = 'auto';

    /* size + animation */
    var size = (Number(window.SCROLL_MARKER_SIZE) || 14) + 'px';
    var amt  = (Number(window.SCROLL_MARKER_ANIM_SIZE) || 0) + 'px';
    var dur  = (Number(window.SCROLL_MARKER_ANIM_SPEED) || 1.4) + 's';
    down.style.fontSize = size; up.style.fontSize = size;
    down.style.setProperty('--smk-amt', amt); up.style.setProperty('--smk-amt', amt);
    down.style.setProperty('--smk-dur', dur); up.style.setProperty('--smk-dur', dur);
    var anim = (window.SCROLL_MARKER_ANIM !== false);
    down.classList.toggle('anim', anim);
    up.classList.toggle('anim', anim);

    /* visibility — only when the gallery can actually scroll */
    var maxScroll = stage.scrollHeight - stage.clientHeight;
    var canScroll = maxScroll > 1;
    if (!canScroll) {
      down.classList.remove('is-visible');
      up.classList.remove('is-visible');
      return;
    }
    var THRESH = 24;
    down.classList.toggle('is-visible', stage.scrollTop <= THRESH);
    up.classList.toggle('is-visible',   stage.scrollTop >= maxScroll - THRESH);
  }

  function destroy() {
    built = false;
    var grid = document.getElementById('gallery-grid');
    if (grid) grid.innerHTML = '';
    /* clear the shared scroll markers so they don't linger into list mode */
    var d = document.getElementById('scroll-marker-down');
    var u = document.getElementById('scroll-marker-up');
    if (d) d.classList.remove('is-visible');
    if (u) u.classList.remove('is-visible');
  }

  /* on resize, RESIZE the existing tiles in place (no DOM teardown) so video
     tiles don't flicker; only fall back to a full rebuild if relayout can't
     map onto the current DOM (mode/project-count changed). */
  var _rt = false;
  window.addEventListener('resize', function () {
    if (_rt) return;
    _rt = true;
    requestAnimationFrame(function () {
      _rt = false;
      var hv = document.getElementById('home-view');
      if (built && hv && hv.style.display !== 'none' && window.DISPLAY_MODE === 'gallery') {
        if (!relayout()) build();
        updateScrollMarkers();
      }
    });
  });

  window.GalleryDisplay = { build: build, relayout: relayout, destroy: destroy, scaleFactor: scaleFactor };
})();
