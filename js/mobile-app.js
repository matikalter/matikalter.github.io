/* ============================================================================
   MOBILE APP — self-contained phone renderer.
   Runs ONLY when window.__MOBILE__ is true (set by the boot detector in
   index.html). Desktop portfolio.js + the React tweaks panel are gated off in
   this mode, so this file owns everything on phones: hash routing, the fixed
   logo, the home feed (two label modes), project pages, the about page, and a
   small vanilla Tweaks panel.

   Reads the SAME shared data globals as desktop (window.projects, tagDefs,
   filterDefs, BIO_LONG, LOGO) so content lives once. Design tokens are a
   SEPARATE namespace: mobile keys (m*) in the TWEAKS block, mapped to --m-*
   CSS vars here — desktop tweaks are never touched.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.__MOBILE__) return;

  var EMBEDDED = false;
  try { EMBEDDED = new URLSearchParams(location.search).get('embedded') === '1'; } catch (e) {}
  window.__M_EMBEDDED = EMBEDDED;

  var projects   = window.projects || [];
  var tagDefs    = window.tagDefs || [];
  var LOGO       = window.LOGO || { idle: { text: 'portfolio' } };
  var BIO_LONG   = window.BIO_LONG || '';

  /* ── shared social markup (mirrors portfolio.js) ── */
  var svgIG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';
  var svgLI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="3"/><line x1="8" y1="11" x2="8" y2="16"/><line x1="8" y1="8" x2="8" y2="8.5" stroke-width="2"/><path d="M12 11v5M12 11a3 3 0 0 1 6 0v5"/></svg>';
  var svgEM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>';
  var socialRowHTML =
      '<div class="social-row">'
    + '<a href="https://www.instagram.com/matikalter" target="_blank" class="social-icon">' + svgIG + '</a>'
    + '<a href="https://www.linkedin.com/in/matikalter/" target="_blank" class="social-icon">' + svgLI + '</a>'
    + '<a href="mailto:mkalterr@gmail.com" class="social-icon">' + svgEM + '</a>'
    + '</div>';

  /* ── helpers ── */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isVideoSrc(s) { return /\.(mp4|webm|mov|m4v)$/i.test(s || ''); }
  function assetURL(pid, f) { return 'assets/' + pid + '/' + f; }
  function logoText() { return (LOGO.idle && LOGO.idle.text) || 'portfolio'; }
  function tagLabel(key) {
    for (var i = 0; i < tagDefs.length; i++) if (tagDefs[i].key === key) return tagDefs[i].label;
    return key;
  }
  function visibleProjects() {
    var hidden = window.PROJECT_HIDDEN || {};
    var order  = window.PROJECT_ORDER;
    var list = projects.filter(function (p) { return !p.hidden && !hidden[p.id]; });
    if (order && order.length) {
      var byId = {}; list.forEach(function (p) { byId[p.id] = p; });
      var out = [];
      order.forEach(function (id) { if (byId[id]) { out.push(byId[id]); delete byId[id]; } });
      list.forEach(function (p) { if (byId[p.id]) out.push(p); });
      return out;
    }
    return list;
  }
  function getProjectById(id) {
    for (var i = 0; i < projects.length; i++) if (projects[i].id === id) return projects[i];
    return null;
  }

  /* ── tweaks: read merged window.TWEAKS (already LS-merged in index.html) ── */
  var T = window.TWEAKS || {};
  var MDEF = {
    mLogoSize: 22, mLogoAlign: 'center', mFeedMode: 'above', mFeedGap: 48,
    mTitleSize: 20, mProjTitleSize: 40, mMiniSize: 15, mTagsSize: 12,
    mHoldBlur: 6, mHoldOpacity: 0.5, mHoldSaturation: 0.4,
    mHoldTextY: 50, mHoldAlign: 'center', mLabelAlign: 'left',
    mFilterSize: 15, mFilterAlign: 'left', mFilterGap: 0.5,
    mLogoColor: '#111111', mLogoTapColor: '#8089ef',
    mDivShow: true, mDivSpace: 30
  };
  function tv(k) { return (T[k] != null) ? T[k] : MDEF[k]; }

  function applyMobileTweaks() {
    var app = document.getElementById('mobile-app');
    if (!app) return;
    var s = app.style;
    s.setProperty('--m-logo-size', tv('mLogoSize') + 'px');
    s.setProperty('--m-logo-align', ({ left: 'flex-start', center: 'center', right: 'flex-end' })[tv('mLogoAlign')] || 'center');
    s.setProperty('--m-logo-color', tv('mLogoColor'));
    s.setProperty('--m-logo-tap-color', tv('mLogoTapColor'));
    s.setProperty('--m-head-div-vis', tv('mDivShow') ? 'visible' : 'hidden');
    s.setProperty('--m-head-div-space', tv('mDivSpace') + 'px');
    s.setProperty('--m-feed-gap', tv('mFeedGap') + 'px');
    s.setProperty('--m-title-size', tv('mTitleSize') + 'px');
    s.setProperty('--m-proj-title-size', tv('mProjTitleSize') + 'px');
    s.setProperty('--m-mini-size', tv('mMiniSize') + 'px');
    s.setProperty('--m-tags-size', tv('mTagsSize') + 'px');
    s.setProperty('--m-hold-blur', tv('mHoldBlur') + 'px');
    s.setProperty('--m-hold-opacity', tv('mHoldOpacity'));
    s.setProperty('--m-hold-saturation', tv('mHoldSaturation'));
    s.setProperty('--m-hold-text-y', tv('mHoldTextY') + '%');
    var ta = tv('mHoldAlign');
    s.setProperty('--m-hold-align', ta);
    s.setProperty('--m-hold-items', ({ left: 'flex-start', center: 'center', right: 'flex-end' })[ta] || 'center');
    s.setProperty('--m-label-align', tv('mLabelAlign'));
    s.setProperty('--m-filter-size', tv('mFilterSize') + 'px');
    s.setProperty('--m-filter-justify', ({ left: 'flex-start', center: 'center', right: 'flex-end' })[tv('mFilterAlign')] || 'flex-start');
    /* clear the notch/status bar: real devices use the safe-area inset; the
       preview harness fakes a notch (top in portrait, side in landscape), so
       simulate a larger inset only in portrait when embedded. */
    var landscape = (window.innerWidth > window.innerHeight);
    s.setProperty('--m-safe-top', EMBEDDED ? (landscape ? '6px' : '30px') : '0px');
    positionView();
    layoutFilters();
  }

  /* ── undo / redo history (mirrors desktop) ──────────────────────────
     Snapshots the full mobile-tweak set; one step per gesture (rapid slider
     ticks on the same key within 500ms coalesce into one step). Cap 50. */
  var MKEYS = Object.keys(MDEF);
  var histUndo = [], histRedo = [], lastHistKey = null, lastHistTime = 0, applyingHistory = false;
  function snapshotTweaks() { var o = {}; MKEYS.forEach(function (k) { o[k] = tv(k); }); return o; }
  function pushHistory(k) {
    var now = Date.now();
    if (k !== lastHistKey || now - lastHistTime > 500) {
      histUndo.push(snapshotTweaks());
      if (histUndo.length > 50) histUndo.shift();
      histRedo = [];
    }
    lastHistKey = k; lastHistTime = now;
  }
  function applySnapshot(s) {
    applyingHistory = true;
    Object.keys(s).forEach(function (k) { setMobileTweak(k, s[k]); });
    applyingHistory = false;
    lastHistKey = null;
    if (typeof syncPanelControls === 'function') syncPanelControls(s);
  }
  function undoTweak() { if (!histUndo.length) return; histRedo.push(snapshotTweaks()); applySnapshot(histUndo.pop()); }
  function redoTweak() { if (!histRedo.length) return; histUndo.push(snapshotTweaks()); applySnapshot(histRedo.pop()); }

  /* persist a mobile tweak: LS mirror (sync) + host disk write + live vars */
  function setMobileTweak(k, v) {
    if (!applyingHistory) pushHistory(k);
    T[k] = v;
    window.TWEAKS = T;
    var edits = {}; edits[k] = v;
    try { if (typeof window.persistTweaks === 'function') window.persistTweaks(edits); } catch (e) {}
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: edits }, '*'); } catch (e) {}
    try { if (window.top !== window.parent) window.top.postMessage({ type: '__edit_mode_set_keys', edits: edits }, '*'); } catch (e) {}
    applyMobileTweaks();
    if (k === 'mFeedMode') applyRoute();  // A/B changes the feed structure
  }

  /* ── DOM scaffold ── */
  var app, viewEl;
  function buildScaffold() {
    app = document.getElementById('mobile-app');
    if (!app) { app = document.createElement('div'); app.id = 'mobile-app'; document.body.appendChild(app); }
    app.innerHTML =
        '<div class="m-logo" id="m-logo"><span class="m-logo-text">' + esc(logoText()) + '</span></div>'
      + '<div class="m-view" id="m-view"></div>';
    viewEl = document.getElementById('m-view');
    document.getElementById('m-logo').addEventListener('click', function () { navTo('#/'); });
    applyMobileTweaks();
  }

  /* ── video embeds ──────────────────────────────────────────────────
     iOS caps how many video decoders can run at once; loop-troupe renders
     5+ Vimeo players, so mounting them all at load makes most hang ("stuck
     on load"). So on mobile we LAZY-MOUNT each embed's iframe only when it
     nears the viewport and TEAR IT DOWN when it scrolls far away, keeping
     the live-decoder count to ~1-2. See initMobileEmbeds(). */
  function isYouTubeSrc(s) { return /youtube(-nocookie)?\.com|youtu\.be/i.test(s || ''); }

  /* YouTube's iframe embed has no "tap to unmute" pill like Vimeo. The most
     intuitive NATIVE affordance on iPhone is to NOT muted-autoplay: drop
     autoplay+mute so the player shows its poster + big play button, and a tap
     plays WITH sound (a real user gesture). Vimeo already shows an unmute
     button, so it's left autoplaying muted. */
  function mobileEmbedSrc(src) {
    if (isYouTubeSrc(src)) {
      return String(src)
        .replace(/([?&])autoplay=1/gi, '$1autoplay=0')
        .replace(/([?&])mute=1/gi, '$1mute=0');
    }
    return src;
  }

  /* a lazy embed placeholder: carries the src, no iframe yet. Sized with the
     bulletproof padding-bottom technique (height:0 + padding-bottom:%), NOT the
     CSS `aspect-ratio` property — in an iOS Safari flex column aspect-ratio can
     fail to give the box a height, letting the iframe's default 300×150 land-
     scape size win (which pillarboxes a portrait video with black side bars). */
  function ratioToPB(ratio) {
    if (!ratio) return 56.25;                 // 16/9 default
    var p = String(ratio).split('/');
    var wr = parseFloat(p[0]), hr = parseFloat(p[1]);
    if (!wr || !hr) return 56.25;
    return (hr / wr) * 100;
  }
  function embedBlock(src, ratio, extraCls) {
    var pb = ratioToPB(ratio).toFixed(4);
    return '<div class="m-block m-embed' + (extraCls || '') + '" data-embed-src="' + esc(mobileEmbedSrc(src)) + '" style="padding-bottom:' + pb + '%"></div>';
  }

  var embedBlocks = [];
  var embedScrollFn = null, embedRAF = 0, embedObserver = null;
  function mountEmbed(block) {
    if (block.querySelector('iframe')) return;
    var src = block.getAttribute('data-embed-src');
    if (!src) return;
    var ifr = document.createElement('iframe');
    ifr.setAttribute('frameborder', '0');
    ifr.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
    ifr.setAttribute('allowfullscreen', '');
    ifr.setAttribute('webkitallowfullscreen', '');
    ifr.setAttribute('mozallowfullscreen', '');
    ifr.src = src;
    block.appendChild(ifr);
  }
  function unmountEmbed(block) {
    var ifr = block.querySelector('iframe');
    if (ifr) { ifr.src = 'about:blank'; ifr.remove(); }
  }
  /* mount embeds within a viewport margin, tear down far ones. Scroll-driven
     (getBoundingClientRect) rather than IntersectionObserver, because IO is
     unreliable two iframes deep in the preview harness. */
  function updateMobileEmbeds() {
    var h = window.innerHeight || document.documentElement.clientHeight;
    var margin = 400;
    embedBlocks.forEach(function (b) {
      var r = b.getBoundingClientRect();
      var near = (r.top < h + margin) && (r.bottom > -margin);
      if (near) mountEmbed(b); else unmountEmbed(b);
    });
  }
  function initMobileEmbeds() {
    // clear any previous wiring
    if (embedScrollFn) {
      window.removeEventListener('scroll', embedScrollFn);
      document.removeEventListener('scroll', embedScrollFn, true);
      window.removeEventListener('resize', embedScrollFn);
      window.removeEventListener('touchmove', embedScrollFn);
      embedScrollFn = null;
    }
    if (embedObserver) { embedObserver.disconnect(); embedObserver = null; }
    embedBlocks = Array.prototype.slice.call(viewEl.querySelectorAll('.m-embed[data-embed-src]'));
    if (!embedBlocks.length) return;

    // primary: IntersectionObserver (fires on real-device scroll)
    if ('IntersectionObserver' in window) {
      embedObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) mountEmbed(e.target); else unmountEmbed(e.target);
        });
      }, { root: null, rootMargin: '400px 0px', threshold: 0 });
      embedBlocks.forEach(function (b) { embedObserver.observe(b); });
    }
    // backup: scroll/touch/resize → rect-based pass (covers contexts where IO
    // is flaky). Both paths mount/unmount idempotently by position, so agree.
    embedScrollFn = function () {
      if (embedRAF) return;
      embedRAF = requestAnimationFrame(function () { embedRAF = 0; updateMobileEmbeds(); });
    };
    window.addEventListener('scroll', embedScrollFn, { passive: true });
    document.addEventListener('scroll', embedScrollFn, true);
    window.addEventListener('resize', embedScrollFn);
    window.addEventListener('touchmove', embedScrollFn, { passive: true });
    updateMobileEmbeds();   // initial pass (top-of-page embeds)
  }

  /* ── content block → single-column HTML ── */
  function blockHTML(b, pid) {
    if (!b || !b.type) return '';
    if (b.type === 'video') {
      return embedBlock(b.src, b.ratio);
    }
    if (b.type === 'localvideo') {
      /* mobile is single-column, so ignore the desktop `ratio` (it exists to
         equalize heights in side-by-side rows) — render at natural aspect,
         no letterbox box, no black bg. */
      return '<div class="m-block m-video"><video src="' + assetURL(pid, encodeURIComponent(b.src)) + '" autoplay muted loop playsinline preload="metadata"></video></div>';
    }
    if (b.type === 'image') {
      var ist = '';
      if (b.maxW) ist = ' style="max-width:' + (typeof b.maxW === 'number' ? b.maxW + 'px' : b.maxW) + ';margin:0 auto"';
      var wrapSt = b.ratio ? ' style="aspect-ratio:' + b.ratio + '"' : '';
      var imgTag = '<img src="' + assetURL(pid, b.src) + '" alt="" loading="lazy"' + ist
        + (b.ratio ? ' style="object-fit:contain;height:100%;width:100%"' : '') + '>';
      return '<div class="m-block"' + wrapSt + '>' + imgTag + '</div>';
    }
    if (b.type === 'text') {
      var t = '';
      if (b.html) return '<div class="m-block m-block-text">' + b.html + '</div>';
      if (b.title) t += '<div class="m-bt-title">' + b.title + '</div>';
      if (b.body)  t += '<div class="m-bt-body">' + b.body + '</div>';
      return '<div class="m-block m-block-text">' + t + '</div>';
    }
    if (b.type === 'divider') return '<div class="m-divider"></div>';
    if (b.type === 'row') {
      var imgs = (b.images || []).map(function (im) {
        var src = (typeof im === 'string') ? im : (im.src || im.localvideo || im.video);
        if (!src) return '';
        if (typeof im === 'object' && im.video) return embedBlock(im.video, im.ratio);
        if (typeof im === 'object' && im.localvideo) return '<div class="m-block m-video"><video src="' + assetURL(pid, encodeURIComponent(im.localvideo)) + '" autoplay muted loop playsinline preload="metadata"></video></div>';
        return '<div class="m-block"><img src="' + assetURL(pid, encodeURIComponent(src)) + '" alt="" loading="lazy"></div>';
      }).join('');
      return imgs;
    }
    if (b.type === 'hscroll') {
      var h = (b.images || []).map(function (im) {
        var src = (typeof im === 'string') ? im : im.src;
        return '<img src="' + assetURL(pid, encodeURIComponent(src)) + '" alt="" loading="lazy">';
      }).join('');
      return '<div class="m-hscroll">' + h + '</div>';
    }
    return '';
  }

  /* ── VIEWS ─────────────────────────────────────────────────────────── */
  var mobileFilter = 'all';

  /* set the scroll view's top padding from the actual fixed-logo bar height so
     content sits right below it (adapts to logo size + the notch inset). */
  function positionView() {
    var logo = document.getElementById('m-logo');
    if (!logo || !viewEl) return;
    var h = logo.getBoundingClientRect().height;
    viewEl.style.setProperty('--m-view-top', (Math.round(h) + 12) + 'px');
  }

  /* filter spacing is a 0..1 SPREAD relative to the row's own width, so it
     adapts to portrait/landscape/device: 0 = filters bunched (positioned by
     align), 1 = spread evenly with the outer filters flush to the margins.
     gap = spread × leftover / (n-1), where leftover is the free horizontal
     space in the row — so at 1 the items exactly fill edge-to-edge. */
  function layoutFilters() {
    var wrap = document.getElementById('m-filters');
    if (!wrap) return;
    var items = wrap.querySelectorAll('.m-filter');
    var n = items.length;
    if (n < 2) { wrap.style.gap = '0px'; return; }
    var spread = Math.max(0, Math.min(1, tv('mFilterGap')));
    var sum = 0; items.forEach(function (it) { sum += it.getBoundingClientRect().width; });
    /* -1px safety so at spread=1 the row fills to just under the width and never
       wraps to a second line from sub-pixel rounding */
    var avail = wrap.clientWidth - sum - 1;
    var gap = (avail > 0) ? (spread * avail / (n - 1)) : 0;
    wrap.style.gap = gap.toFixed(2) + 'px';
  }

  function projectMatchesFilter(p, f) {
    if (!f || f === 'all') return true;
    return (p.tags || []).indexOf(f) !== -1;
  }

  function feedItemHTML(p, mode) {
    var mediaSrc = p.thumb ? assetURL(p.id, p.thumb) : '';
    var media = p.thumb
      ? (isVideoSrc(p.thumb)
          ? '<video src="' + mediaSrc + '" autoplay muted loop playsinline preload="metadata"></video>'
          : '<img src="' + mediaSrc + '" alt="' + esc(p.title) + '">')
      : '';
    var tags = (p.tags || []).map(function (k) { return '<span>' + esc(tagLabel(k)) + '</span>'; }).join('');
    var labelInner =
        '<div class="m-lbl-title">' + esc(p.title) + '</div>'
      + (p.mini ? '<div class="m-lbl-mini">' + p.mini + '</div>' : '')
      + (tags ? '<div class="m-lbl-tags">' + tags + '</div>' : '');
    if (mode === 'above') {
      return '<div class="m-item" data-id="' + esc(p.id) + '">'
        + '<div class="m-item-label">' + labelInner + '</div>'
        + '<div class="m-thumb"><div class="m-thumb-media">' + media + '</div></div>'
        + '</div>';
    }
    // hold mode
    return '<div class="m-item" data-id="' + esc(p.id) + '" data-hold="1">'
      + '<div class="m-thumb"><div class="m-thumb-media">' + media + '</div>'
      +   '<div class="m-hold-label">' + labelInner + '</div>'
      + '</div>'
      + '</div>';
  }

  function buildFeedHTML(mode) {
    return visibleProjects()
      .filter(function (p) { return projectMatchesFilter(p, mobileFilter); })
      .map(function (p) { return feedItemHTML(p, mode); }).join('');
  }

  function filtersHTML() {
    var defs = window.filterDefs || [{ key: 'all', label: 'All' }];
    return defs.map(function (f) {
      return '<span class="m-filter' + (f.key === mobileFilter ? ' active' : '') + '" data-filter="' + esc(f.key) + '">' + esc(f.label) + '</span>';
    }).join('');
  }

  function renderHome() {
    var mode = tv('mFeedMode'); // 'hold' | 'above'
    viewEl.className = 'm-view m-home';
    viewEl.innerHTML =
        '<div class="m-social-about">' + socialRowHTML
      +   '<span class="m-about-link" id="m-about-link">+&nbsp;about</span></div>'
      + '<div class="m-filters" id="m-filters">' + filtersHTML() + '</div>'
      + '<div class="m-feed" id="m-feed">' + buildFeedHTML(mode) + '</div>';
    document.getElementById('m-about-link').addEventListener('click', function () { navTo('#/about'); });
    wireFilters(mode);
    wireFeed(mode);
    positionView();
    layoutFilters();
    window.scrollTo(0, 0);
  }

  /* single-select category filter (radio), mirrors the desktop filter pills */
  function wireFilters(mode) {
    viewEl.querySelectorAll('.m-filter').forEach(function (el) {
      el.addEventListener('click', function () {
        var f = el.getAttribute('data-filter');
        if (f === mobileFilter) return;
        mobileFilter = f;
        viewEl.querySelectorAll('.m-filter').forEach(function (x) {
          x.classList.toggle('active', x.getAttribute('data-filter') === f);
        });
        var feedEl = document.getElementById('m-feed');
        if (feedEl) { feedEl.innerHTML = buildFeedHTML(mode); wireFeed(mode); }
      });
    });
  }

  function wireFeed(mode) {
    var items = viewEl.querySelectorAll('.m-item');
    items.forEach(function (it) {
      var id = it.getAttribute('data-id');
      if (mode === 'above') {
        it.addEventListener('click', function () { navTo('#/project/' + id); });
        return;
      }
      // HOLD mode: pointer-based tap vs press-and-hold
      var startX = 0, startY = 0, holdTimer = null, holding = false, moved = false;
      function clearHold() {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      }
      function release() {
        clearHold();
        it.classList.remove('is-holding');
      }
      it.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button !== 0) return;
        startX = e.clientX; startY = e.clientY; moved = false; holding = false;
        holdTimer = setTimeout(function () { holding = true; it.classList.add('is-holding'); }, 220);
      });
      it.addEventListener('pointermove', function (e) {
        if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
          moved = true; release();
        }
      });
      it.addEventListener('pointerup', function () {
        if (moved) { release(); return; }
        if (holding) { release(); return; }   // it was a preview hold → no nav
        release();
        navTo('#/project/' + id);
      });
      it.addEventListener('pointercancel', release);
      it.addEventListener('pointerleave', function () { if (holding || holdTimer) release(); });
    });
  }

  function renderProject(p) {
    var head =
        '<div class="m-proj-head">'
      +   '<div class="m-proj-title">' + esc(p.title) + '</div>'
      +   (p.year ? '<div class="m-proj-year">' + esc(p.year) + '</div>' : '')
      +   ((p.tags && p.tags.length) ? '<div class="m-proj-tags">' + p.tags.map(function (k) { return '<span>' + esc(tagLabel(k)) + '</span>'; }).join('') + '</div>' : '')
      +   (p.desc ? '<div class="m-proj-desc">' + p.desc + '</div>' : '')
      +   (p.play ? '<a class="m-play-btn" href="' + esc(p.play) + '" target="_blank" rel="noopener">' + esc(window.PLAY_LABEL || 'Play ↗') + '</a>' : '')
      + '</div>';

    var body = '';
    if (p.playgroundImages && p.playgroundImages.length) {
      body = simpleMediaStack(p.id, p.playgroundImages);
    } else if (p.postersImages && p.postersImages.length) {
      body = simpleMediaStack(p.id, p.postersImages);
    } else if (p.content && p.content.length) {
      body = p.content.map(function (b) { return blockHTML(b, p.id); }).join('');
    } else {
      // fallback: video + images
      if (p.video) body += embedBlock(p.video);
      (p.images || []).forEach(function (src) { body += '<div class="m-block"><img src="' + assetURL(p.id, src) + '" alt="" loading="lazy"></div>'; });
    }

    viewEl.className = 'm-view m-project';
    viewEl.innerHTML = head + '<div class="m-divider m-head-divider"></div><div class="m-proj-body">' + body + '</div>';
    positionView();
    initMobileEmbeds();
    window.scrollTo(0, 0);
  }

  /* simplified vertical scroll for playground/posters: full-width media stack */
  function simpleMediaStack(pid, imgs) {
    return imgs.map(function (im) {
      var src = (typeof im === 'string') ? im : im.src;
      if (!src) return '';
      if (isVideoSrc(src)) {
        return '<div class="m-block m-video"><video src="' + assetURL(pid, encodeURIComponent(src)) + '" autoplay muted loop playsinline preload="metadata"></video></div>';
      }
      return '<div class="m-block"><img src="' + assetURL(pid, encodeURIComponent(src)) + '" alt="" loading="lazy"></div>';
    }).join('');
  }

  function renderAbout() {
    var meta = document.querySelector('.about-meta');
    var metaHTML = '';
    if (meta) {
      // reuse the hardcoded about meta from the desktop DOM (still in the doc)
      meta.querySelectorAll('.about-section').forEach(function (sec) {
        var title = sec.querySelector('.about-section-title');
        metaHTML += '<div class="m-about-section"><div class="m-about-section-title">' + (title ? title.innerHTML : '') + '</div>';
        sec.querySelectorAll('.about-item').forEach(function (it) {
          metaHTML += '<div class="m-about-item">' + it.innerHTML + '</div>';
        });
        metaHTML += '</div>';
      });
    }
    var reel = '<div class="m-about-reel"><iframe id="m-about-reel-iframe" src="https://player.vimeo.com/video/1136277012?autoplay=1&muted=1&loop=1&byline=0&title=0&portrait=0&controls=1&dnt=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>';

    viewEl.className = 'm-view m-about';
    viewEl.innerHTML =
        '<div class="m-about-bio">' + BIO_LONG.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>') + '</div>'
      + metaHTML + reel;
    positionView();
    window.scrollTo(0, 0);
  }

  /* ── ROUTING ───────────────────────────────────────────────────────── */
  function parseHash() {
    var h = (location.hash || '#/').replace(/^#/, '');
    if (h === '/about') return { view: 'about' };
    var m = h.match(/^\/project\/(.+)$/);
    if (m) return { view: 'project', id: m[1] };
    return { view: 'home' };
  }
  function teardownEmbeds() {
    if (embedScrollFn) {
      window.removeEventListener('scroll', embedScrollFn);
      document.removeEventListener('scroll', embedScrollFn, true);
      window.removeEventListener('resize', embedScrollFn);
      window.removeEventListener('touchmove', embedScrollFn);
      embedScrollFn = null;
    }
    if (embedObserver) { embedObserver.disconnect(); embedObserver = null; }
    if (!viewEl) return;
    viewEl.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
  }
  function applyRoute() {
    teardownEmbeds();
    var r = parseHash();
    if (r.view === 'about') { renderAbout(); return; }
    if (r.view === 'project') {
      var p = getProjectById(r.id);
      if (!p) { location.hash = '#/'; return; }
      renderProject(p);
      return;
    }
    renderHome();
  }
  function navTo(h) {
    if (location.hash === h) applyRoute();
    else location.hash = h;
  }
  window.addEventListener('hashchange', applyRoute);
  // expose the same nav API desktop uses, so shared links work
  window.goHome = function () { navTo('#/'); };
  window.openAbout = function () { navTo('#/about'); };
  window.openProject = function (id) { navTo('#/project/' + id); };

  /* ── MOBILE TWEAKS PANEL (vanilla) ─────────────────────────────────── */
  function buildTweaksPanel() {
    var panel = document.createElement('div');
    panel.className = 'm-tweaks';
    panel.id = 'm-tweaks';

    function slider(k, label, min, max, step) {
      return '<div class="m-tw-ctrl"><label>' + label + '<span class="val" data-val="' + k + '">' + tv(k) + '</span></label>'
        + '<input type="range" data-key="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + tv(k) + '"></div>';
    }
    function seg(k, label, opts) {
      var btns = opts.map(function (o) {
        return '<button data-key="' + k + '" data-seg="' + o.v + '" class="' + (tv(k) === o.v ? 'on' : '') + '">' + o.l + '</button>';
      }).join('');
      return '<div class="m-tw-ctrl"><label>' + label + '</label><div class="m-tw-seg" data-seg-group="' + k + '">' + btns + '</div></div>';
    }
    function toggle(k, label) {
      var cur = !!tv(k);
      return '<div class="m-tw-ctrl"><label>' + label + '</label><div class="m-tw-seg" data-seg-group="' + k + '" data-bool="1">'
        + '<button data-key="' + k + '" data-seg="true" class="' + (cur ? 'on' : '') + '">On</button>'
        + '<button data-key="' + k + '" data-seg="false" class="' + (!cur ? 'on' : '') + '">Off</button></div></div>';
    }
    function sect(title, inner, open) {
      return '<div class="m-tw-sect' + (open ? ' open' : '') + '"><div class="m-tw-sect-head">' + title + '<span class="chev">▶</span></div><div class="m-tw-sect-body">' + inner + '</div></div>';
    }
    function color(k, label, opts) {
      var cur = tv(k);
      var sw = opts.map(function (c) {
        return '<button class="m-tw-sw' + (cur === c ? ' on' : '') + '" data-key="' + k + '" data-color="' + c + '" style="background:' + c + '"></button>';
      }).join('');
      return '<div class="m-tw-ctrl"><label>' + label + '</label><div class="m-tw-swatches" data-sw-group="' + k + '">' + sw + '</div></div>';
    }

    var logoSect = slider('mLogoSize', 'Size', 14, 72, 1)
      + seg('mLogoAlign', 'Align', [{ v: 'left', l: 'Left' }, { v: 'center', l: 'Center' }, { v: 'right', l: 'Right' }])
      + color('mLogoColor', 'Idle color', ['#111111', '#8089ef', '#888888', '#ffffff'])
      + color('mLogoTapColor', 'Tap color', ['#8089ef', '#111111', '#888888', '#ffffff']);

    var filterSect = slider('mFilterSize', 'Size', 11, 26, 1)
      + seg('mFilterAlign', 'Align', [{ v: 'left', l: 'Left' }, { v: 'center', l: 'Center' }, { v: 'right', l: 'Right' }])
      + slider('mFilterGap', 'Spacing', 0, 1, 0.05);

    var feedSect = seg('mFeedMode', 'Label mode', [{ v: 'hold', l: 'On hold (A)' }, { v: 'above', l: 'Above (B)' }])
      + slider('mFeedGap', 'Gap between', 16, 120, 2)
      + slider('mTitleSize', 'Title size', 14, 34, 1)
      + slider('mMiniSize', 'Mini size', 11, 24, 1)
      + slider('mTagsSize', 'Tags size', 9, 20, 1);

    var holdSect = slider('mHoldBlur', 'Blur', 0, 24, 1)
      + slider('mHoldOpacity', 'Opacity', 0, 1, 0.05)
      + slider('mHoldSaturation', 'Saturation', 0, 1, 0.05)
      + slider('mHoldTextY', 'Text Y (%)', 0, 100, 1)
      + seg('mHoldAlign', 'Text align', [{ v: 'left', l: 'Left' }, { v: 'center', l: 'Center' }, { v: 'right', l: 'Right' }]);

    var aboveSect = seg('mLabelAlign', 'Label align', [{ v: 'left', l: 'Left' }, { v: 'center', l: 'Center' }, { v: 'right', l: 'Right' }]);

    var projectSect = toggle('mDivShow', 'Divider')
      + slider('mDivSpace', 'Divider space', 0, 80, 1)
      + slider('mProjTitleSize', 'Title size', 20, 64, 1);

    panel.innerHTML =
        '<div class="m-tweaks-head"><h3>Mobile Tweaks</h3>'
      +   '<div class="m-tw-hist"><button class="m-tw-undo" id="m-tw-undo" title="Undo">↶</button>'
      +   '<button class="m-tw-redo" id="m-tw-redo" title="Redo">↷</button>'
      +   '<button class="m-tweaks-close" id="m-tw-close">×</button></div></div>'
      + '<div class="m-tweaks-body">'
      +   sect('Logo', logoSect, true)
      +   sect('Home feed', feedSect, true)
      +   sect('Filters', filterSect, false)
      +   sect('Hold labels (A)', holdSect, false)
      +   sect('Above labels (B)', aboveSect, false)
      +   sect('Project page', projectSect, false)
      + '</div>';
    document.body.appendChild(panel);

    // section toggles
    panel.querySelectorAll('.m-tw-sect-head').forEach(function (h) {
      h.addEventListener('click', function () { h.parentNode.classList.toggle('open'); });
    });
    // sliders
    panel.querySelectorAll('input[type=range]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var k = inp.getAttribute('data-key');
        var v = parseFloat(inp.value);
        var lbl = panel.querySelector('[data-val="' + k + '"]');
        if (lbl) lbl.textContent = v;
        setMobileTweak(k, v);
        if (k === 'mFeedGap' || k === 'mTitleSize' || k === 'mMiniSize' || k === 'mTagsSize') { /* live via vars */ }
      });
    });
    // segmented buttons
    panel.querySelectorAll('.m-tw-seg button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-key');
        var v = btn.getAttribute('data-seg');
        var group = btn.closest('.m-tw-seg');
        if (group.getAttribute('data-bool')) v = (v === 'true');   // boolean toggle
        group.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        setMobileTweak(k, v);
      });
    });
    // color swatches
    panel.querySelectorAll('.m-tw-sw').forEach(function (sw) {
      sw.addEventListener('click', function () {
        var k = sw.getAttribute('data-key');
        var c = sw.getAttribute('data-color');
        sw.closest('.m-tw-swatches').querySelectorAll('.m-tw-sw').forEach(function (b) { b.classList.remove('on'); });
        sw.classList.add('on');
        setMobileTweak(k, c);
      });
    });
    document.getElementById('m-tw-close').addEventListener('click', closePanel);
    document.getElementById('m-tw-undo').addEventListener('click', function () { undoTweak(); });
    document.getElementById('m-tw-redo').addEventListener('click', function () { redoTweak(); });

    return panel;
  }
  var panelEl = null, panelOpen = false;
  function openPanel() { if (!panelEl) panelEl = buildTweaksPanel(); panelEl.classList.add('open'); panelOpen = true; }
  function closePanel() {
    if (panelEl) panelEl.classList.remove('open');
    panelOpen = false;
    try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch (e) {}
  }
  function togglePanel() { panelOpen ? closePanel() : openPanel(); }

  /* apply edits that ORIGINATED elsewhere (e.g. the other phone frame in the
     preview harness relays them here) — update tokens live WITHOUT re-persisting
     (the origin already did) and reflect them in an open panel. */
  /* update the in-phone panel's controls to reflect current values */
  function syncPanelControls(obj) {
    if (!panelEl) return;
    Object.keys(obj || {}).forEach(function (k) {
      var inp = panelEl.querySelector('input[data-key="' + k + '"]');
      if (inp) { inp.value = obj[k]; var lbl = panelEl.querySelector('[data-val="' + k + '"]'); if (lbl) lbl.textContent = obj[k]; }
      var grp = panelEl.querySelector('[data-seg-group="' + k + '"]');
      if (grp) grp.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-seg') === String(obj[k])); });
      var sg = panelEl.querySelector('[data-sw-group="' + k + '"]');
      if (sg) sg.querySelectorAll('.m-tw-sw').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-color') === String(obj[k])); });
    });
  }

  function applyExternalEdits(edits) {
    if (!edits) return;
    var reroute = false;
    Object.keys(edits).forEach(function (k) {
      T[k] = edits[k];
      if (k === 'mFeedMode') reroute = true;
    });
    window.TWEAKS = T;
    applyMobileTweaks();
    syncPanelControls(edits);
    if (reroute) applyRoute();
  }

  // Tweaks protocol. When EMBEDDED in the preview harness (?embedded=1), the
  // harness owns the panel (in the gray margin) and drives us through
  // MobileApp.setTweak; here we only APPLY relayed edits. Standalone (direct
  // mobile view) we own the in-phone panel and speak the host protocol.
  window.addEventListener('message', function (e) {
    var m = e.data; if (!m || !m.type) return;
    if (m.type === '__edit_mode_set_keys' && m.__external) { applyExternalEdits(m.edits); return; }
    if (EMBEDDED) return;
    if (m.type === '__activate_edit_mode') openPanel();
    else if (m.type === '__deactivate_edit_mode') closePanel();
  });
  if (!EMBEDDED) {
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}
    // backtick toggle + optional FAB (FAB shown when ?tweaksfab=1)
    window.addEventListener('keydown', function (e) {
      if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); togglePanel(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); if (e.shiftKey) redoTweak(); else undoTweak();
      }
    });
    try {
      if (new URLSearchParams(location.search).get('tweaksfab') === '1') {
        document.documentElement.classList.add('show-tw-fab');
        var fab = document.createElement('button');
        fab.className = 'm-tweaks-fab'; fab.textContent = '⚙';
        fab.addEventListener('click', togglePanel);
        document.body.appendChild(fab);
      }
    } catch (e) {}
  }

  /* ── INIT ──────────────────────────────────────────────────────────── */
  document.title = logoText() || 'Portfolio';
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  buildScaffold();
  applyRoute();
  window.addEventListener('resize', function () { applyMobileTweaks(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { positionView(); layoutFilters(); });

  // expose for the preview harness / debugging. setTweak persists (LS mirror +
  // host disk) and updates this frame; getValue reads the current value.
  window.MobileApp = {
    applyRoute: applyRoute, openPanel: openPanel, closePanel: closePanel,
    setTweak: setMobileTweak, getValue: tv, defaults: MDEF,
    undo: undoTweak, redo: redoTweak,
    canUndo: function () { return histUndo.length > 0; }, canRedo: function () { return histRedo.length > 0; },
    updateEmbeds: function () { updateMobileEmbeds(); },
    refresh: function () { applyMobileTweaks(); applyRoute(); }
  };
})();
