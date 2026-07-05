/* ======================================================================
   PORTFOLIO — view management, left-panel rendering, hash routing, init.
   Loads after list-gallery.js and playground-gallery.js.

   Routes (hash-based, no reloads — instant nav, linkable URLs):
     #/                 home
     #/about            about
     #/project/<id>     project page (standard or playground layout)

   Reads from window globals: projects, filterDefs, LOGO, BIO_SHORT,
   BIO_SHORT_ALT, BIO_LONG. Exposes window.{goHome, openAbout, openProject}.
   ====================================================================== */
(function () {
  'use strict';

  /* ── filter state ── */
  window.activeFilters = { all: true };

  /* current active project id on home view (whichever thumb is centered) */
  var currentHomeActiveId = null;
  /* last-seen progress payload, used to re-render the title stack when tweaks
     change (row height / blur / etc.) without waiting for next scroll frame */
  var lastProgress = null;

  /* ── TITLE STACK ─────────────────────────────────────────────────────
     Renders one row per filtered project. Each frame, given the gallery's
     float-index progress, each row gets a Y transform + opacity + blur
     based on its signed distance (in row-heights) from the center slot.
     Items further than ~2.5 rows away are clipped by stack overflow.
     Cyclic wrapping mirrors the gallery's infinite loop. */

  function rebuildTitleStackRows() {
    var stack = document.getElementById('lp-title-stack');
    if (!stack) return;
    var items = (window.ListGallery && window.ListGallery.getItems) ?
                window.ListGallery.getItems() : [];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="lp-title-row" data-idx="' + i
           +  '" data-id="' + items[i].id + '"><span class="lp-title-inner">' + items[i].title + '</span></div>';
    }
    stack.innerHTML = html;

    /* click a title → open that project (delegated handler, bound once) */
    if (!stack._clickBound) {
      stack._clickBound = true;
      stack.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('.lp-title-row') : null;
        if (!row || !row.dataset.id) return;
        window.openProject(row.dataset.id);
      });
    }
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }

  function renderTitleStack(progress) {
    lastProgress = progress;
    var stack = document.getElementById('lp-title-stack');
    if (!stack) return;
    var items = (window.ListGallery && window.ListGallery.getItems) ?
                window.ListGallery.getItems() : [];
    var n = items.length;
    var rows = stack.children;
    /* rebuild rows if the count OR the order changed (filter / reorder) */
    var mismatch = rows.length !== n;
    if (!mismatch) {
      for (var c = 0; c < n; c++) {
        if (rows[c].dataset.id !== items[c].id) { mismatch = true; break; }
      }
    }
    if (mismatch) {
      rebuildTitleStackRows();
      rows = stack.children;
      if (rows.length !== n) return;
    }
    if (!n) return;

    var rowH = (window.TITLE_STACK_ROW_H != null ? window.TITLE_STACK_ROW_H : 44);
    var b1   = (window.TITLE_BLUR_1      != null ? window.TITLE_BLUR_1      : 3);
    var b2   = (window.TITLE_BLUR_2      != null ? window.TITLE_BLUR_2      : 7);
    var b3   = (window.TITLE_BLUR_3      != null ? window.TITLE_BLUR_3      : 11);
    var o1   = (window.TITLE_OPACITY_1   != null ? window.TITLE_OPACITY_1   : 0.75);
    var o2   = (window.TITLE_OPACITY_2   != null ? window.TITLE_OPACITY_2   : 0.5);
    var o3   = (window.TITLE_OPACITY_3   != null ? window.TITLE_OPACITY_3   : 0.28);

    var centerFloat = progress.idx + progress.frac;

    for (var i = 0; i < n; i++) {
      var raw = i - centerFloat;
      /* cyclic wrap: when scrolling past last, item[0] continues seamlessly.
         Skipped in finite mode (LIST_INFINITE === false) so the stack has a
         clear top and bottom that match the gallery's hard limits. */
      if (n > 1 && window.LIST_INFINITE !== false) {
        while (raw >  n / 2) raw -= n;
        while (raw < -n / 2) raw += n;
      }
      var absD = Math.abs(raw);
      var op, blur;
      if (absD <= 1) {
        op   = _lerp(1,  o1, absD);
        blur = _lerp(0,  b1, absD);
      } else if (absD <= 2) {
        var t2 = absD - 1;
        op   = _lerp(o1, o2, t2);
        blur = _lerp(b1, b2, t2);
      } else if (absD <= 3) {
        var t3 = absD - 2;
        op   = _lerp(o2, o3, t3);
        blur = _lerp(b2, b3, t3);
      } else {
        var t4 = Math.min(1, (absD - 3) / 0.5);
        op   = _lerp(o3, 0, t4);
        blur = b3;
      }
      var row = rows[i];
      /* alignment about the stack's x anchor is done with translateX so the
         row stays max-content (unlimited title width): left=0, center=-50%,
         right=-100%. The Y is the row's stacked offset, centered via -50%. */
      var ax = (window.TITLE_ALIGN === 'center') ? '-50%'
             : (window.TITLE_ALIGN === 'right')  ? '-100%' : '0px';
      row.style.transform = 'translate(' + ax + ', calc(' + (raw * rowH) + 'px - 50%))';
      /* set values via CSS custom properties so the :hover override (which
         uses !important) can interrupt them cleanly. The default state has
         no CSS transition on opacity/filter — these vars get re-set every
         frame during scroll, and a transition would lag. The transition is
         applied ONLY in the :hover rule, so it fires on hover-in/out. */
      row.style.setProperty('--row-opacity', op.toFixed(3));
      row.style.setProperty('--row-filter', blur > 0.01 ? ('blur(' + blur.toFixed(2) + 'px)') : 'none');
      /* mark the centered (active) row so only IT enlarges on hover */
      var centered = absD < 0.5;
      if (centered) { if (!row.classList.contains('is-centered')) row.classList.add('is-centered'); }
      else if (row.classList.contains('is-centered')) row.classList.remove('is-centered');
      /* Pointer-events: only rows within visible range (±3 slots) are
         hoverable / clickable. Beyond that, opacity is 0 but the row would
         still cover the buttons below the stack — disable pointer events
         entirely. When TITLE_INACTIVE_SELECTABLE is false, ONLY the centered
         (active) row is hoverable/clickable — inactive titles are inert. */
      var selectable = (window.TITLE_INACTIVE_SELECTABLE === false)
        ? (absD < 0.5)
        : (absD <= 3);
      row.style.pointerEvents = selectable ? 'auto' : 'none';
    }
  }

  /* ── social SVGs ── */
  var svgIG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';
  var svgLI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="3"/><line x1="8" y1="11" x2="8" y2="16"/><line x1="8" y1="8" x2="8" y2="8.5" stroke-width="2"/><path d="M12 11v5M12 11a3 3 0 0 1 6 0v5"/></svg>';
  var svgEM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>';

  function socialRowHTML(bioHTML, bioClass, aboutOnclick, aboutLabel, bioStyle) {
    return '<div class="identity">'
      + '<div class="' + bioClass + '"' + (bioStyle ? ' style="' + bioStyle + '"' : '') + '>' + bioHTML + '</div>'
      + '<div class="social-row">'
      + '<a href="https://www.instagram.com/matikalter" target="_blank" class="social-icon">' + svgIG + '</a>'
      + '<a href="https://www.linkedin.com/in/matikalter/" target="_blank" class="social-icon">' + svgLI + '</a>'
      + '<a href="mailto:mkalterr@gmail.com" class="social-icon">' + svgEM + '</a>'
      + '<span class="about-link" onclick="' + aboutOnclick + '">' + aboutLabel + '</span>'
      + '</div></div>';
  }

  /* Home-view variant: just the social icons + about link + a divider, as one
     unit ("Social+About"). Absolutely positioned via .lp-social-about so it can
     be moved with its own Y tweak; the bio is a separate movable block below. */
  function socialAboutHTML(aboutOnclick, aboutLabel) {
    return '<div class="lp-social-about">'
      + '<div class="social-row">'
      + '<a href="https://www.instagram.com/matikalter" target="_blank" class="social-icon">' + svgIG + '</a>'
      + '<a href="https://www.linkedin.com/in/matikalter/" target="_blank" class="social-icon">' + svgLI + '</a>'
      + '<a href="mailto:mkalterr@gmail.com" class="social-icon">' + svgEM + '</a>'
      + '<span class="about-link" onclick="' + aboutOnclick + '">' + aboutLabel + '</span>'
      + '</div>'
      + '</div>';
  }

  /* Divider: its own absolutely-positioned block (home + about views) with an
     independent Y (--divider-y) and show/hide (--divider-display). */
  function dividerHTML() {
    return '<div class="lp-divider"></div>';
  }

  /* Toolbar gif: pinned to the bottom of the left panel on the home + about
     views (absent on project pages). Position/size/align/visibility all driven
     by CSS vars from the "Toolbar" tweaks. */
  function gifHTML() {
    return '<div class="lp-gif"><a href="#/project/playground" aria-label="View Playground"><img src="assets/playground/Jumpdude-b.gif" alt="" draggable="false"><span class="lp-gif-hot"></span></a></div>';
  }

  /* map a tag key → display label (tagDefs is the full vocabulary; fall
     back to filterDefs, then the raw key) */
  function labelFor(key) {
    var d = (typeof tagDefs !== 'undefined' ? tagDefs : []).filter(function (x) { return x.key === key; });
    if (d.length) return d[0].label;
    var f = filterDefs.filter(function (x) { return x.key === key; });
    return f.length ? f[0].label : key;
  }

  /* render a project's tags as .tag-pill chips */
  function tagPillsHTML(tags) {
    return (tags || []).map(function (t) {
      return '<span class="tag-pill">' + labelFor(t) + '</span>';
    }).join('');
  }

  function filterButtonsHTML() {
    return filterDefs.map(function (f) {
      var isActive = activeFilters[f.key] ? ' active' : '';
      return '<span class="filter-pill' + isActive + '" data-filter="' + f.key + '">' + f.label + '</span>';
    }).join('');
  }

  function buildLogoHTML() {
    function stateContent(cfg) {
      if (cfg.type === 'image' && cfg.image)
        return '<img src="' + cfg.image + '" alt="logo" draggable="false">';
      return cfg.text || '';
    }
    var idleStyle = LOGO.idle.style ? ' style="' + LOGO.idle.style + '"' : '';
    var html = '<div class="logo-zone" onclick="window.goHome()">'
             + '<span class="logo-idle"' + idleStyle + '>' + stateContent(LOGO.idle)  + '</span>'
             + '<span class="logo-hover">'                  + stateContent(LOGO.hover) + '</span>'
             + '</div>';
    if (LOGO.hover.style) {
      html = '<style>.logo-zone:hover .logo-hover{' + LOGO.hover.style + '}</style>' + html;
    }
    /* the logo auto-fits the toolbar width; run after this HTML is inserted */
    if (window.fitLogo) requestAnimationFrame(window.fitLogo);
    return html;
  }

  function getProjectById(id) {
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].id === id) return projects[i];
    }
    return null;
  }

  /* ── LEFT PANEL VARIANTS ────────────────────────────────────────────── */

  /* Home: bio + filters + title stack (active title in middle, 2 above + 2 below) */
  function setLeftHome() {
    var lp = document.getElementById('left-panel');
    lp.innerHTML =
        buildLogoHTML()
      + socialAboutHTML('window.openAbout()',
                      '<span style="font-size:15px;font-weight:300;line-height:1">+</span>&nbsp;about')
      + dividerHTML()
      + '<div class="bio-short lp-home-bio">' + BIO_SHORT + '</div>'
      + gifHTML();
    /* The title stack + filter buttons live in the MAIN CONTENT area
       (#home-view, see index.html), NOT the toolbar DOM — so they don't slide
       off / hide when the toolbar collapses into its drawer. Populate the
       filter list (its static container is already in #home-view). */
    var fl = document.getElementById('filter-list');
    if (fl) fl.innerHTML = filterButtonsHTML();
    bindFilters();
    /* seed the title stack now — first onProgress will refresh it */
    rebuildTitleStackRows();
    renderTitleStack({ idx: 0, frac: 0, idxFloat: 0 });
    /* seed the mini-info from whatever is currently centered */
    renderMiniInfo(currentHomeActiveId ? getProjectById(currentHomeActiveId) : null);
  }

  /* About: left panel mirrors the HOME view exactly — logo at --logo-y and the
     Social+About unit (icons + divider) at --social-y — so they stay in sync
     across views. The only difference is the link reads "× close" (back to
     home) instead of "+ about". The long bio lives in the right zone. */
  function setLeftAbout() {
    var lp = document.getElementById('left-panel');
    lp.innerHTML =
        buildLogoHTML()
      + socialAboutHTML('window.goHome()',
                      '<span style="font-size:14px;font-weight:300;line-height:1">&#215;</span>&nbsp;close')
      + dividerHTML()
      + gifHTML();
  }

  /* Project: title + year + tags + description */
  function setLeftProject(p) {
    var lp = document.getElementById('left-panel');
    var align = window.BACK_ALIGN || 'left';
    var playAlign = window.PLAY_ALIGN || 'left';
    lp.innerHTML =
        buildLogoHTML()
      + '<div style="margin-top:4px">'
      +   '<div class="lp-proj-title">' + p.title + '</div>'
      +   (p.year ? '<div class="lp-proj-year">' + p.year + '</div>' : '')
      +   '<div class="lp-proj-tags tag-row">'
      +     tagPillsHTML(p.tags)
      +   '</div>'
      +   '<div class="lp-desc-wrap">'
      +     '<div class="lp-proj-desc">' + (p.desc || 'Project description coming soon.') + '</div>'
      +     (p.playgroundImages && p.playgroundImages.length
            ? '<div class="pg-desc" id="pg-desc" aria-hidden="true">'
              + '<div class="proj-text-title" id="pg-desc-title"></div>'
              + '<div class="proj-text-body" id="pg-desc-body"></div>'
              + '</div>'
            : '')
      +   '</div>'
      + '</div>'
      + (p.play
          ? '<a class="lp-play al-' + playAlign + '" href="' + p.play + '" target="_blank" rel="noopener">' + (window.PLAY_LABEL != null ? window.PLAY_LABEL : 'Play') + '</a>'
          : '')
      + '<div class="lp-back al-' + align + '" onclick="window.goHome()">'
      +   (window.BACK_LABEL != null ? window.BACK_LABEL : 'Back') + '</div>';
  }

  /* ── Vid Description (playground) — surfaced in the TOOLBAR on tile hover /
     expand, IN PLACE of the project description (it sits in an in-flow overlay
     exactly over .lp-proj-desc, so it shares that location and scrolls with the
     panel). While a vid desc is visible the project description is hidden
     (.pg-hidden); it reappears when nothing is hovered/expanded or the effect
     is disabled. Uses the same text styles as project-page text blocks; y
     OFFSET + alignment driven by Toolbar tweaks (--pgdesc-y / --pgdesc-align +
     window.PG_DESC_SHOW). */
  window.pgDescShow = function (title, body) {
    var box = document.getElementById('pg-desc');
    if (!box) return;
    var pd = document.querySelector('.lp-proj-desc');
    if (window.PG_DESC_SHOW === false) {
      box.classList.remove('is-visible');
      if (pd) pd.classList.remove('pg-hidden');
      return;
    }
    var tEl = document.getElementById('pg-desc-title');
    var bEl = document.getElementById('pg-desc-body');
    if (tEl) { tEl.innerHTML = title || ''; tEl.style.display = title ? '' : 'none'; }
    if (bEl) { bEl.innerHTML = body || '';  bEl.style.display = body ? '' : 'none'; }
    var has = !!(title || body);
    box.classList.toggle('is-visible', has);
    if (pd) pd.classList.toggle('pg-hidden', has);   /* replace proj desc while a vid desc shows */
  };
  window.pgDescHide = function () {
    var box = document.getElementById('pg-desc');
    if (box) box.classList.remove('is-visible');
    var pd = document.querySelector('.lp-proj-desc');
    if (pd) pd.classList.remove('pg-hidden');
  };

  function bindFilters() {
    document.querySelectorAll('.filter-pill').forEach(function (tag) {
      tag.addEventListener('click', function () {
        var key = tag.dataset.filter;
        /* SINGLE-SELECT: only one filter active at a time (radio behavior).
           Clicking any pill makes it the sole active filter. */
        activeFilters = {};
        activeFilters[key] = true;
        document.querySelectorAll('.filter-pill').forEach(function (t) {
          t.classList.toggle('active', !!activeFilters[t.dataset.filter]);
        });
        /* rebuild list (filtering REMOVES items entirely — list always loops) */
        if (window.DISPLAY_MODE === 'gallery') {
          /* gallery: re-layout filtered tiles; titles stay hidden until hover */
          if (window.GalleryDisplay) window.GalleryDisplay.build();
          renderSingleTitle(null);
          renderMiniInfo(null);
        } else {
          if (window.ListGallery) window.ListGallery.build();
          rebuildTitleStackRows();
        }
        /* active pill changed → re-evaluate which labels invert */
        if (window.AdaptiveInvert) window.AdaptiveInvert.refresh();
      });
    });
  }

  /* ── VIEW SWITCHING ────────────────────────────────────────────────── */
  /* ── MINI INFO ── mini-description + tags of the centered project (home).
     Updates live as the centered project changes (via active callback). */
  function renderMiniInfo(p) {
    var wrap = document.getElementById('mini-info');
    var desc = document.getElementById('mini-desc');
    var tags = document.getElementById('mini-tags');
    if (!wrap || !desc || !tags) return;
    if (!p) { wrap.classList.add('hidden'); tags.classList.add('hidden'); applyAdaptiveText(); return; }
    wrap.classList.remove('hidden');
    tags.classList.remove('hidden');
    desc.textContent = p.mini || '';
    desc.style.display = p.mini ? '' : 'none';
    tags.innerHTML = tagPillsHTML(p.tags);
    positionMiniTags();
    if (window.AdaptiveInvert) window.AdaptiveInvert.refresh();
  }

  /* ── PER-PORTION INVERT (mini description + filters over images) ────────
     Driven by js/adaptive-invert.js. renderMiniInfo pings it when the shown
     text changes; the module re-reads geometry and re-masks. */
  function applyAdaptiveText() {
    if (window.AdaptiveInvert) window.AdaptiveInvert.refresh();
  }
  window.applyAdaptiveText = applyAdaptiveText;

  /* The tags live in their own fixed layer (kept OUT of the blended .mini-info
     so the invert-over-images effect never touches them). Position that layer
     just under the mini description. Runs after layout + on resize/tweak, since
     the description's on-screen box depends on --left-w, --mini-x/y and the
     viewport height. */
  function positionMiniTags() {
    var wrap = document.getElementById('mini-info');
    var desc = document.getElementById('mini-desc');
    var tags = document.getElementById('mini-tags');
    if (!wrap || !desc || !tags) return;
    if (wrap.classList.contains('hidden') || tags.classList.contains('hidden')) return;
    /* synchronous: reading getBoundingClientRect forces layout, so the box is
       up to date right after the description text/position changed (no rAF, so
       it also works when rAF is throttled). */
    var ref = (desc.style.display === 'none') ? wrap : desc;
    var box = ref.getBoundingClientRect();
    tags.style.left = box.left + 'px';
    tags.style.top  = (box.bottom + 12) + 'px';
  }
  window.positionMiniTags = positionMiniTags;
  window.addEventListener('resize', positionMiniTags);

  /* ── DISPLAY MODE (List ⇄ Gallery) ─────────────────────────────────────
     The home page can show the vertical List display or the multi-column
     Gallery display. Mode persists in localStorage. The switch button (top-
     right) shows the glyph of the mode you'd switch TO. */
  function renderSingleTitle(p) {
    var stack = document.getElementById('lp-title-stack');
    if (!stack) return;
    if (!p) { stack.innerHTML = ''; return; }
    var ax = (window.TITLE_ALIGN === 'center') ? '-50%'
           : (window.TITLE_ALIGN === 'right')  ? '-100%' : '0px';
    stack.innerHTML =
      '<div class="lp-title-row is-centered" data-id="' + p.id
      + '" style="transform:translate(' + ax + ',-50%);--row-opacity:1;--row-filter:none">'
      + '<span class="lp-title-inner">' + p.title + '</span></div>';
  }

  /* gallery tile hover → surface that project's title + mini description;
     null → clear both (hidden until a tile is hovered). */
  window.galleryHoverInfo = function (id) {
    var p = id ? getProjectById(id) : null;
    renderSingleTitle(p);
    renderMiniInfo(p);
  };

  window.refreshDisplaySwitch = function () {
    var btn = document.getElementById('display-switch');
    if (!btn) return;
    var toGallery = (window.DISPLAY_MODE !== 'gallery');
    btn.textContent = toGallery
      ? (window.DISP_GALLERY_GLYPH || '\u25a6')
      : (window.DISP_LIST_GLYPH || '\u2630');
  };

  /* build whichever display is active; tear down the other. */
  function applyDisplayMode() {
    var hv = document.getElementById('home-view');
    if (!hv) return;
    var gallery = (window.DISPLAY_MODE === 'gallery');
    hv.classList.toggle('mode-gallery', gallery);
    hv.classList.toggle('mode-list', !gallery);
    if (gallery) {
      if (window.ListGallery) window.ListGallery.destroy();
      if (window.GalleryDisplay) window.GalleryDisplay.build();
      /* title + mini stay hidden until a tile is hovered */
      renderSingleTitle(null);
      renderMiniInfo(null);
    } else {
      if (window.GalleryDisplay) window.GalleryDisplay.destroy();
      /* list seeds its own title stack + mini via the active/rebuilt callbacks */
      if (window.ListGallery) window.ListGallery.build({ preserveScroll: true });
    }
    window.refreshDisplaySwitch();
  }
  window.applyDisplayMode = applyDisplayMode;

  window.setDisplayMode = function (mode) {
    window.DISPLAY_MODE = (mode === 'gallery') ? 'gallery' : 'list';
    try { localStorage.setItem('displayMode', window.DISPLAY_MODE); } catch (e) {}
    var hv = document.getElementById('home-view');
    if (hv && hv.style.display !== 'none') applyDisplayMode();
    else window.refreshDisplaySwitch();
  };

  function setView(id) {
    var displayTypes = { 'home-view': 'block', 'project-view': 'block', 'about-view': 'grid' };
    ['home-view', 'project-view', 'about-view'].forEach(function (v) {
      var el = document.getElementById(v);
      if (el) { el.style.display = 'none'; el.classList.remove('visible'); }
    });
    var target = document.getElementById(id);
    if (target) {
      target.style.display = displayTypes[id] || 'block';
      target.classList.add('visible');
    }
    /* also hide the floating count when not on home */
    var cnt = document.getElementById('list-count');
    if (cnt) cnt.classList.toggle('hidden', id !== 'home-view');
    window.scrollTo(0, 0);
  }

  /* ── PROJECT PAGE RENDERING ──────────────────────────────────────────
     Content model — each project may define a `content` array of blocks that
     flow top-to-bottom in a 2-column grid. Block shapes:

       { type: 'video', src: '<embed url>' }          // always full-width, 16:9
       { type: 'image', src: 'file.jpg', full: true } // full:true → spans both cols
       { type: 'text',  title: '…', body: '<p>…</p>' } // title (H3) + body
       { type: 'text',  html: '<p>…</p>' }             // legacy raw-html text
       { type: 'divider' }                             // standalone full-width rule
       { type: 'row', images: ['a.gif','b.jpg',…] }    // N images, equal-height row
       { type: 'row', images: ['logo.png'], center:true, maxW:380 } // centered, capped

     `full` (boolean) makes a block span both columns; omit/false = one column.
     If a project has no `content`, we fall back to: hero from `p.video` (or first
     `p.images` entry) + remaining `p.images` as one-column blocks. ───────── */
  /* the iframe + enlarge button shared by the video block and row-video items */
  function videoInnerHTML(src, ratio) {
    /* YouTube embeds need enablejsapi=1 so the enlarge flow can read/sync
       time + mute + volume via the widget postMessage protocol */
    if (isYouTubeSrc(src)) src = setUrlParam(src, 'enablejsapi', 1);
    return '<iframe src="' + src + '" frameborder="0" '
         +   'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" '
         +   'allowfullscreen webkitallowfullscreen mozallowfullscreen></iframe>'
         +   '<button class="proj-video-zoom" type="button" aria-label="Enlarge video" '
         +   'data-vsrc="' + src.replace(/"/g, '&quot;') + '" '
         +   'data-vratio="' + (ratio || '16/9') + '">'
         +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
         +     'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         +       '<path d="M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5"></path>'
         +     '</svg>'
         +   '</button>';
  }

  function blockHTML(b, pid) {
    var full = b.full ? ' full' : '';
    if (b.type === 'video') {
      /* full-width by default (back-compat); opt into a single grid column with
         full:false. Optional `ratio` (e.g. '1/1') overrides the 16:9 box. */
      var vfull = (b.full === false) ? '' : ' full';
      var vstyle = b.ratio ? ' style="aspect-ratio:' + b.ratio + '"' : '';
      return '<div class="proj-block' + vfull + ' proj-video"' + vstyle + '>'
           +   videoInnerHTML(b.src, b.ratio || '16/9')
           + '</div>';
    }
    /* localvideo: a self-hosted MP4 in a native <video>. Autoplays muted + loops
       like a GIF (but far smaller/sharper); native controls give scrub, volume
       and real fullscreen — no iframe-sandbox enlarge workaround needed. Renders
       at full width / natural height (no forced aspect box, so no letterboxing).
       Optional `ratio` locks the cell + contain-fits if you need a fixed box. */
    if (b.type === 'localvideo') {
      var lvfull = (b.full === false) ? '' : ' full';
      var lvratio = b.ratio ? ' proj-localvideo-ratio" style="aspect-ratio:' + b.ratio + '"' : '"';
      return '<div class="proj-block' + lvfull + ' proj-localvideo' + lvratio + '>'
           +   '<video src="assets/' + pid + '/' + encodeURIComponent(b.src) + '" '
           +   'autoplay muted loop playsinline preload="metadata" '
           +   'data-localzoom="1"></video>'
           +   '<button class="proj-localvideo-play" type="button" aria-label="Play video">'
           +     '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>'
           +   '</button>'
           + '</div>';
    }
    if (b.type === 'text') {
      var txt = '';
      if (b.title) txt += '<div class="proj-text-title">' + b.title + '</div>';
      if (b.body)  txt += '<div class="proj-text-body">' + b.body + '</div>';
      if (!txt && b.html) txt = b.html;            /* legacy raw-html text blocks */
      var inner = (b.title || b.body)
        ? '<div class="proj-text-inner">' + txt + '</div>'
        : txt;
      /* optional rows: span N grid rows so neighbouring blocks stack beside it.
         Optional mt/mb (px) override the block's default top/bottom margin. */
      var tst = [];
      if (b.rows) tst.push('grid-row:span ' + b.rows);
      if (b.mt != null) tst.push('margin-top:' + b.mt + 'px');
      if (b.mb != null) tst.push('margin-bottom:' + b.mb + 'px');
      var tstyle = tst.length ? ' style="' + tst.join(';') + '"' : '';
      return '<div class="proj-block' + full + ' proj-text"' + tstyle + '>' + inner + '</div>';
    }
    /* divider: a standalone full-width rule with its own above/below spacing.
       Optional per-block mt/mb (px) override the global divider spacing. */
    if (b.type === 'divider') {
      var dst = [];
      if (b.mt != null) dst.push('margin-top:' + b.mt + 'px');
      if (b.mb != null) dst.push('margin-bottom:' + b.mb + 'px');
      var dstyle = dst.length ? ' style="' + dst.join(';') + '"' : '';
      return '<div class="proj-block full proj-divider"' + dstyle + '></div>';
    }
    /* row: N images side by side; widths auto-justified to equal height.
       An empty/falsy entry renders an invisible spacer that takes one equal
       slot — use it to center a single image into, e.g., the middle third. */
    if (b.type === 'row') {
      var items = (b.images || []).map(function (im) {
        if (im && typeof im === 'object' && im.video) {
          /* a video entry inside a row: shares the row's height, width scaled to
             its aspect ratio (flex-grow = w/h, same rule as the row's images) */
          var vr = im.ratio || '16/9';
          var parts = vr.split('/');
          var grow = (parts.length === 2 && +parts[1]) ? (+parts[0] / +parts[1]) : 1.778;
          return '<div class="proj-row-item proj-row-video" style="flex-grow:' + grow.toFixed(4) + '">'
               +   '<div class="proj-video" style="aspect-ratio:' + vr + '">' + videoInnerHTML(im.video, vr) + '</div>'
               + '</div>';
        }
        if (im && typeof im === 'object' && im.localvideo) {
          /* a self-hosted video inside a row: behaves like a row image (width 100%,
             height auto, flex-grow = real aspect, corrected by measureProjRows on
             metadata load). No controls; click → enlarge lightbox; autoplay-fail
             affordance via initLocalVideos — same as the standalone localvideo block. */
          var lr = im.ratio || '16/9';
          var lp = lr.split('/');
          var lg = (lp.length === 2 && +lp[1]) ? (+lp[0] / +lp[1]) : 1.778;
          return '<div class="proj-row-item proj-row-localvideo" style="flex-grow:' + lg.toFixed(4) + '">'
               +   '<div class="proj-localvideo">'
               +     '<video src="assets/' + pid + '/' + encodeURIComponent(im.localvideo) + '" '
               +     'autoplay muted loop playsinline preload="metadata" data-localzoom="1" data-rowvid="1"></video>'
               +     '<button class="proj-localvideo-play" type="button" aria-label="Play video">'
               +       '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>'
               +     '</button>'
               +   '</div>'
               + '</div>';
        }
        var src = (typeof im === 'string') ? im : im.src;
        if (!src) return '<div class="proj-row-item proj-row-spacer"></div>';
        /* optional per-item scale: shrinks the image to `scale`× its natural
           row height, centered in its slot (white space around it). Slot size
           is unchanged so the row layout/widths stay put. */
        var scl = (im && typeof im === 'object' && im.scale) ? im.scale : null;
        var aln = (im && typeof im === 'object' && im.align) ? (' align-' + im.align) : '';
        var itCls = 'proj-row-item' + (scl ? (' proj-row-scaled' + aln) : '');
        var itSt  = scl ? ' style="--item-scale:' + scl + '"' : '';
        return '<div class="' + itCls + '"' + itSt + '>'
             +   '<img src="assets/' + pid + '/' + encodeURIComponent(src) + '" '
             +   'alt="" loading="lazy" data-zoom="1" data-rowimg="1">'
             + '</div>';
      }).join('');
      var rowCls = 'proj-block full proj-row' + (b.center ? ' proj-row-center' : '');
      var rowMaxW = (typeof b.maxW === 'string') ? b.maxW : (b.maxW + 'px');
      var rowSt  = b.maxW ? ' style="max-width:' + rowMaxW + ';margin-inline:auto"' : '';
      return '<div class="' + rowCls + '"' + rowSt + '>' + items + '</div>';
    }
    /* hscroll: full-width horizontal gallery. Images sit at a fixed height in a
       horizontally-scrolling track (mouse wheel scrolls L/R inside, releasing to
       the page at each edge — wired in initHscroll). Edge arrows indicate more. */
    if (b.type === 'hscroll') {
      var hitems = (b.images || []).map(function (im) {
        var src = (typeof im === 'string') ? im : im.src;
        return '<img src="assets/' + pid + '/' + encodeURIComponent(src) + '" '
             +   'alt="" loading="lazy" data-zoom="1">';
      }).join('');
      return '<div class="proj-block full proj-hscroll">'
           +   '<div class="proj-hscroll-track">' + hitems + '</div>'
           +   '<button class="proj-hscroll-arrow prev" type="button" aria-label="Scroll left">\u2190</button>'
           +   '<button class="proj-hscroll-arrow next" type="button" aria-label="Scroll right">\u2192</button>'
           + '</div>';
    }
    /* default: image — data-full marks clickable content images for the lightbox.
       Optional `ratio` (e.g. '1/1') locks the cell to that aspect ratio and fits
       the image inside (object-fit:contain) — use it to match a neighbour's height.
       Optional `mt`/`mb` (px) add extra space above/below this image (on top of the
       grid row-gap). Optional `maxW` (number=px, string e.g. '60%'=relative) caps
       and centers the image within its column — use to shrink a logo. */
    var imgBlockSt = [];
    if (b.alignSelf) imgBlockSt.push('align-self:' + b.alignSelf);
    if (b.mt != null) imgBlockSt.push('margin-top:' + b.mt + 'px');
    if (b.mb != null) imgBlockSt.push('margin-bottom:' + b.mb + 'px');
    var imgSt = '';
    if (b.maxW != null) {
      var mw = (typeof b.maxW === 'string') ? b.maxW : (b.maxW + 'px');
      imgSt = ' style="max-width:' + mw + ';margin-inline:auto"';
    }
    if (b.ratio) {
      imgBlockSt.push('aspect-ratio:' + b.ratio);
      return '<div class="proj-block' + full + ' proj-img-ratio" style="' + imgBlockSt.join(';') + '">'
           +   '<img src="assets/' + pid + '/' + b.src + '" alt="" loading="lazy" data-zoom="1"' + imgSt + '>'
           + '</div>';
    }
    var imgBlockStyle = imgBlockSt.length ? ' style="' + imgBlockSt.join(';') + '"' : '';
    return '<div class="proj-block' + full + '"' + imgBlockStyle + '>'
         +   '<img src="assets/' + pid + '/' + b.src + '" alt="" loading="lazy" data-zoom="1"' + imgSt + '>'
         + '</div>';
  }

  /* ── IMAGE LIGHTBOX ──
     Delegated: any content image with data-zoom opens the lightbox. The backdrop
     captures all pointer events, so the page underneath is inert while open.
     Click anywhere outside the image (or Esc) closes it. */
  function openLightbox(src) {
    var lb  = document.getElementById('img-lightbox');
    var img = document.getElementById('img-lightbox-img');
    if (!lb || !img) return;
    img.src = src;
    lb.classList.add('is-active');
    document.body.classList.add('lightbox-open'); /* freeze page scroll */
  }
  function closeLightbox() {
    var lb = document.getElementById('img-lightbox');
    if (lb) lb.classList.remove('is-active');
    document.body.classList.remove('lightbox-open');
  }

  /* ── VIDEO LIGHTBOX ── enlarge an embed into a large centered overlay. Works
     regardless of native Fullscreen API support (sandboxed iframes block it). */

  /* Vimeo + YouTube state plumbing (vimeoPlayerFor, ytListen/ytCmd/ytInfo,
     setUrlParam, isVimeoSrc, isYouTubeSrc) lives in js/video-sync.js. */
  /* state carried between open → close */
  var _lbInlineIframe = null;   /* the inline embed we enlarged from */
  var _lbBigPlayer    = null;   /* Vimeo.Player bound to the lightbox iframe */
  var _lbBigIframe    = null;   /* the lightbox iframe element itself */
  var _lbIsYT         = false;  /* current lightbox embed is YouTube */
  var _lbInlineState  = null;   /* {t, muted, volume, paused} read on open */

  /* Swap a brand-new <iframe id="video-lightbox-iframe"> into the frame each
     open/close. Reusing one element + swapping its src leaves the previous
     Vimeo.Player's postMessage listeners bound to it, which made the SECOND
     enlarge ignore setCurrentTime (it replayed from 0:00). A fresh element =
     a clean player every time. */
  function replaceLightboxIframe(src) {
    var frame = document.getElementById('video-lightbox-frame');
    var old   = document.getElementById('video-lightbox-iframe');
    var fresh = document.createElement('iframe');
    fresh.id = 'video-lightbox-iframe';
    fresh.setAttribute('frameborder', '0');
    fresh.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
    fresh.setAttribute('allowfullscreen', '');
    fresh.setAttribute('webkitallowfullscreen', '');
    fresh.setAttribute('mozallowfullscreen', '');
    fresh.src = src || '';
    if (old) old.replaceWith(fresh);
    else if (frame) {
      var vid = document.getElementById('video-lightbox-video');
      if (vid) frame.insertBefore(fresh, vid); else frame.appendChild(fresh);
    }
    return fresh;
  }

  function openVideoLightbox(src, ratio, inlineIframe) {
    var lb    = document.getElementById('video-lightbox');
    var frame = document.getElementById('video-lightbox-frame');
    if (!lb || !frame) return;
    var ecb = lb.querySelector('.video-lightbox-close');
    if (ecb) ecb.style.display = '';            /* embeds keep the close button */
    frame.classList.remove('is-local');         /* embeds use the fixed-ratio frame */
    frame.style.background = '';                 /* restore black letterbox for embeds */
    frame.style.aspectRatio = ratio || '16/9';
    lb.classList.add('is-active');
    document.body.classList.add('lightbox-open');

    _lbInlineIframe = inlineIframe || null;
    _lbBigPlayer    = null;
    _lbBigIframe    = null;
    _lbIsYT         = isYouTubeSrc(src);
    _lbInlineState  = null;

    /* ── YouTube: state comes from the infoDelivery cache (synchronous) ── */
    if (_lbIsYT && _lbInlineIframe) {
      var yi = ytInfo(_lbInlineIframe);
      var yst = {
        t:      yi.t || 0,
        muted:  yi.muted  != null ? yi.muted  : true,
        volume: yi.volume != null ? yi.volume : 100,
        paused: yi.state === 2
      };
      _lbInlineState = yst;
      ytCmd(_lbInlineIframe, 'pauseVideo');      /* no double-audio */
      /* bake the state into the URL: mute + start can't lose an API race */
      var ysrc = src;
      ysrc = setUrlParam(ysrc, 'enablejsapi', 1);
      ysrc = setUrlParam(ysrc, 'autoplay', 1);
      ysrc = setUrlParam(ysrc, 'mute', yst.muted ? 1 : 0);
      if (yst.t > 0.5) ysrc = setUrlParam(ysrc, 'start', Math.floor(yst.t));
      var yifr = replaceLightboxIframe(ysrc);
      _lbBigIframe = yifr;
      ytListen(yifr);
      /* volume can't ride the URL — push it once the widget has booted */
      yifr.addEventListener('load', function () {
        setTimeout(function () {
          ytCmd(yifr, 'setVolume', [yst.volume]);
          ytCmd(yifr, yst.muted ? 'mute' : 'unMute');
        }, 600);
      });
      return;
    }

    /* ── Vimeo: read the inline state FIRST, then build the lightbox URL with
       that state baked in (muted param + #t start fragment). Encoding it in
       the URL wins over any race with the embed's own boot parameters — the
       old approach (post-ready setMuted) lost to the muted=1 in the src. ── */
    if (isVimeoSrc(src) && _lbInlineIframe && window.Vimeo && window.Vimeo.Player) {
      var inlineP = vimeoPlayerFor(_lbInlineIframe);
      if (inlineP) {
        var loaded = false;
        var loadBig = function (st) {
          if (loaded) return;
          loaded = true;
          var bsrc = src.split('#')[0];
          bsrc = setUrlParam(bsrc, 'autoplay', 1);
          bsrc = setUrlParam(bsrc, 'muted', st && st.muted ? 1 : 0);
          if (st && st.t > 0.3) bsrc += '#t=' + st.t.toFixed(2) + 's';
          var ifr = replaceLightboxIframe(bsrc);
          _lbBigIframe = ifr;
          var bigP = null;
          try { bigP = new window.Vimeo.Player(ifr); } catch (e) {}
          _lbBigPlayer = bigP;
          if (bigP) {
            bigP.ready().then(function () {
              if (st && st.volume != null) bigP.setVolume(st.volume).catch(function () {});
              bigP.play().catch(function () {
                /* unmuted autoplay blocked by the browser → mute & play so the
                   enlarged video isn't left frozen */
                bigP.setMuted(true).then(function () { return bigP.play(); }).catch(function () {});
              });
            }).catch(function () {});
          }
        };
        /* if the inline player hangs, open plain after 900ms */
        var lbFallback = setTimeout(function () { loadBig(null); }, 900);
        Promise.all([
          inlineP.getCurrentTime().catch(function () { return 0; }),
          inlineP.getMuted().catch(function () { return true; }),
          inlineP.getVolume().catch(function () { return null; }),
          inlineP.getPaused().catch(function () { return false; })
        ]).then(function (res) {
          clearTimeout(lbFallback);
          var st = { t: res[0] || 0, muted: !!res[1], volume: res[2], paused: !!res[3] };
          _lbInlineState = st;
          inlineP.pause().catch(function () {});  /* no double-audio */
          loadBig(st);
        }, function () { clearTimeout(lbFallback); loadBig(null); });
        return;
      }
    }

    /* anything else: plain open (fresh instance) */
    _lbBigIframe = replaceLightboxIframe(src);
  }
  function closeVideoLightbox() {
    var lb  = document.getElementById('video-lightbox');
    var vid = document.getElementById('video-lightbox-video');
    if (!lb) return;
    lb.classList.remove('is-active');

    var inlineIframe = _lbInlineIframe;
    var bigP         = _lbBigPlayer;
    var bigIfr       = _lbBigIframe;
    var wasYT        = _lbIsYT;
    var inlineSt     = _lbInlineState;
    _lbInlineIframe = null; _lbBigPlayer = null; _lbBigIframe = null;
    _lbIsYT = false; _lbInlineState = null;

    function teardown() {
      /* destroy the enlarged player AND swap in a fresh empty iframe so the next
         enlarge starts from a clean element (no leftover listeners or audio). */
      if (bigP) { try { bigP.destroy(); } catch (e) {} }
      replaceLightboxIframe('');
    }

    if (wasYT && inlineIframe && bigIfr) {
      /* ── YouTube: cached state is synchronous — read, teardown, hand back ── */
      var yi = ytInfo(bigIfr);
      var yt      = yi.t      != null ? yi.t      : (inlineSt ? inlineSt.t      : 0);
      var ymuted  = yi.muted  != null ? yi.muted  : (inlineSt ? inlineSt.muted  : true);
      var yvolume = yi.volume != null ? yi.volume : (inlineSt ? inlineSt.volume : 100);
      /* 1=playing, 3=buffering → treat as playing; unknown → keep playing */
      var yplaying = yi.state == null ? true : (yi.state === 1 || yi.state === 3);
      teardown();
      ytCmd(inlineIframe, 'seekTo', [yt, true]);
      ytCmd(inlineIframe, 'setVolume', [yvolume]);
      ytCmd(inlineIframe, ymuted ? 'mute' : 'unMute');
      ytCmd(inlineIframe, yplaying ? 'playVideo' : 'pauseVideo');
    }
    else if (bigP && inlineIframe) {
      /* ── Vimeo: read the enlarged time + mute + volume + play-state, hand all
         of it back to the inline embed, then tear down. Race the reads against
         a timeout so a hung handshake can't leave audio playing. ── */
      var inlineP = vimeoPlayerFor(inlineIframe);
      var doneCl = false;
      var finish = function () { if (doneCl) return; doneCl = true; teardown(); };
      var safety = setTimeout(finish, 800);
      var withTimeout = function (promise, fb) {
        return Promise.race([
          promise,
          new Promise(function (res) { setTimeout(function () { res(fb); }, 550); })
        ]);
      };
      var fbMuted  = inlineSt ? inlineSt.muted  : true;
      var fbVolume = inlineSt ? inlineSt.volume : null;
      Promise.all([
        withTimeout(bigP.getCurrentTime().catch(function () { return null; }), null),
        withTimeout(bigP.getMuted().catch(function () { return fbMuted; }), fbMuted),
        withTimeout(bigP.getVolume().catch(function () { return fbVolume; }), fbVolume),
        withTimeout(bigP.getPaused().catch(function () { return false; }), false)
      ]).then(function (res) {
        var t = res[0], muted = res[1], volume = res[2], paused = res[3];
        if (inlineP) {
          if (t != null) inlineP.setCurrentTime(t).catch(function () {});
          inlineP.setMuted(!!muted).catch(function () {});
          if (volume != null) inlineP.setVolume(volume).catch(function () {});
          if (paused) inlineP.pause().catch(function () {});
          else        inlineP.play().catch(function () {});
        }
        clearTimeout(safety); finish();
      }, function () { clearTimeout(safety); finish(); });
    } else {
      teardown();
    }

    if (vid) {                                           /* stop local playback */
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      vid.style.display = 'none';
    }
    document.body.classList.remove('lightbox-open');
  }
  /* enlarge a self-hosted <video> into the same centered overlay, with native
     controls. Mirrors the image lightbox: backdrop dims the page, click-out / Esc
     closes. Native fullscreen is also available from the enlarged controls. */
  function openLocalVideoLightbox(src, ratio) {
    var lb    = document.getElementById('video-lightbox');
    var frame = document.getElementById('video-lightbox-frame');
    var ifr   = document.getElementById('video-lightbox-iframe');
    var vid   = document.getElementById('video-lightbox-video');
    if (!lb || !vid) return;
    var lcb = lb.querySelector('.video-lightbox-close');
    if (lcb) lcb.style.display = 'none';         /* local video: no close button */
    /* shrink-wrap the frame to the video so the visible bounds === clickable
       frame: with aspect-ratio the frame stays a wide box (capped by max-height)
       and the transparent gap swallows clicks. is-local lets the video size
       itself (max-w/h) and the frame wrap it, so clicking any dim area closes. */
    frame.classList.add('is-local');
    frame.style.background = 'transparent';
    frame.style.aspectRatio = '';                /* video defines size, not a fixed ratio */
    if (ifr) { ifr.src = ''; ifr.style.display = 'none'; }
    vid.style.display = 'block';
    vid.src = src;
    lb.classList.add('is-active');
    document.body.classList.add('lightbox-open');
    vid.play().catch(function () {});
  }
  function initLightbox() {
    var lb  = document.getElementById('img-lightbox');
    var img = document.getElementById('img-lightbox-img');
    if (!lb) return;
    /* open on content-image click */
    document.addEventListener('click', function (e) {
      var z = e.target.closest && e.target.closest('.proj-block img[data-zoom]');
      if (z) { e.preventDefault(); openLightbox(z.src); }
      var vz = e.target.closest && e.target.closest('.proj-video-zoom');
      if (vz) {
        e.preventDefault();
        var vzWrap = vz.closest('.proj-video');
        var vzInline = vzWrap ? vzWrap.querySelector('iframe') : null;
        openVideoLightbox(vz.getAttribute('data-vsrc'), vz.getAttribute('data-vratio'), vzInline);
      }
      var lv = e.target.closest && e.target.closest('.proj-localvideo');
      if (lv) {
        var lvid = lv.querySelector('video');
        if (lvid) {
          e.preventDefault();
          var lvr = (lvid.videoWidth && lvid.videoHeight) ? (lvid.videoWidth + '/' + lvid.videoHeight) : '16/9';
          openLocalVideoLightbox(lvid.currentSrc || lvid.src, lvr);
        }
      }
    });
    /* click anywhere in the overlay closes — except on the image itself */
    lb.addEventListener('click', function (e) {
      if (e.target !== img) closeLightbox();
    });
    /* video lightbox: click backdrop / close button to dismiss */
    var vlb = document.getElementById('video-lightbox');
    if (vlb) {
      vlb.addEventListener('click', function (e) {
        if (!e.target.closest('#video-lightbox-frame') || e.target.closest('.video-lightbox-close')) {
          closeVideoLightbox();
        }
      });
    }
    /* swallow wheel/touch scroll while open (belt-and-braces with overflow:hidden) */
    lb.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
    lb.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeLightbox(); closeVideoLightbox(); }
    });
  }

  function renderProjectStandard(p) {
    var body = document.getElementById('proj-body');
    var blocks = [];

    if (p.content && p.content.length) {
      blocks = p.content.slice();
    } else {
      /* legacy fallback — hero + image grid from older project data */
      if (p.video) blocks.push({ type: 'video', src: p.video });
      var imgs = p.images || [];
      var start = (!p.video && imgs.length) ? 1 : 0;
      if (!p.video && imgs.length) blocks.push({ type: 'image', src: imgs[0], full: true });
      for (var i = start; i < imgs.length; i++) blocks.push({ type: 'image', src: imgs[i] });
    }

    var inner = blocks.length
      ? blocks.map(function (b) { return blockHTML(b, p.id); }).join('')
      : '<div class="proj-block full proj-ph">' + p.title + ' — add content</div>';

    body.innerHTML =
        '<div class="proj-standard">'
      +   '<div class="proj-grid">' + inner + '</div>'
      + '</div>';
    measureProjRows(body);
    initHscroll(body);
    initLocalVideos(body);
    /* start the YouTube state stream for any inline YT embeds so enlarge can
       read their time/mute/volume (Vimeo players are created lazily on click) */
    body.querySelectorAll('iframe').forEach(function (f) {
      if (isYouTubeSrc(f.src)) ytListen(f);
    });
  }

  /* self-hosted videos autoplay muted; if the browser blocks autoplay (e.g. iOS
     Low Power Mode), reveal a play affordance so the frozen frame is obviously
     tappable. When it does play, hide it again. The tap itself routes through the
     delegated click handler → opens the enlarge lightbox (user-gesture play). */
  function initLocalVideos(container) {
    var vids = container.querySelectorAll('.proj-localvideo video');
    Array.prototype.forEach.call(vids, function (v) {
      var wrap = v.closest('.proj-localvideo');
      if (!wrap) return;
      v.addEventListener('play',  function () { wrap.classList.remove('show-play'); });
      v.addEventListener('pause', function () { if (v.currentTime > 0 && !v.ended) wrap.classList.add('show-play'); });
      var p = v.play();
      if (p && p.then) {
        p.then(function ()  { wrap.classList.remove('show-play'); })
         .catch(function () { wrap.classList.add('show-play'); });
      }
    });
  }

  /* horizontal-scroll galleries: wheel scrolls L/R inside the track, but releases
     to the page once an edge is reached; edge arrows fade in only when there is
     room to scroll that way. (left = scroll up/back, right = scroll down/forward) */
  function initHscroll(container) {
    var galleries = container.querySelectorAll('.proj-hscroll');
    Array.prototype.forEach.call(galleries, function (g) {
      var track = g.querySelector('.proj-hscroll-track');
      var la = g.querySelector('.proj-hscroll-arrow.prev');
      var ra = g.querySelector('.proj-hscroll-arrow.next');
      if (!track) return;
      var EDGE = 2;   /* px tolerance: sub-pixel rounding means scrollLeft never
                         lands exactly on 0 / maxScroll, so treat "within EDGE" as
                         the edge — otherwise arrows never hide & wheel never releases */
      function maxScroll() { return track.scrollWidth - track.clientWidth; }
      function clamp(v) { return Math.max(0, Math.min(maxScroll(), v)); }
      function update() {
        var ms = maxScroll();
        var atStart = track.scrollLeft <= EDGE;
        var atEnd   = ms <= 0 || track.scrollLeft >= ms - EDGE;
        if (la) la.classList.toggle('visible', ms > 0 && !atStart);
        if (ra) ra.classList.toggle('visible', !atEnd);
      }
      track.addEventListener('scroll', update, { passive: true });
      /* smooth wheel → horizontal: accumulate into a target and ease toward it
         (lerp) so motion is fluid. We preventDefault ONLY while there is room to
         scroll the gallery in the wheel's direction; at the edge we do nothing,
         letting the browser scroll the PAGE natively (same speed as elsewhere,
         no jitter). */
      var target = track.scrollLeft, animating = false;
      function animate() {
        var cur = track.scrollLeft;
        var diff = target - cur;
        if (Math.abs(diff) < 0.5) { track.scrollLeft = target; animating = false; update(); return; }
        track.scrollLeft = cur + diff * 0.16;
        update();
        requestAnimationFrame(animate);
      }
      function glideTo(v) {
        target = clamp(v);
        if (!animating) { animating = true; requestAnimationFrame(animate); }
      }
      track.addEventListener('wheel', function (e) {
        var dy = e.deltaY;
        if (!dy) return;
        var ms = maxScroll();
        /* the gallery only scrolls horizontally when the PAGE is fully scrolled to
           the top — otherwise let the wheel scroll the page vertically first */
        var pageTop = (window.pageYOffset || document.documentElement.scrollTop || 0) < 1;
        var canH = ms > 0 && pageTop &&
                   ((dy > 0 && track.scrollLeft < ms - EDGE) ||
                    (dy < 0 && track.scrollLeft > EDGE));
        if (canH) {
          e.preventDefault();
          if (!animating) target = track.scrollLeft;
          glideTo(target + dy * 0.55);
        }
        /* else: at an edge, or page not at top — let the page scroll normally */
      }, { passive: false });
      if (la) la.addEventListener('click', function () { glideTo((animating ? target : track.scrollLeft) - track.clientWidth * 0.7); });
      if (ra) ra.addEventListener('click', function () { glideTo((animating ? target : track.scrollLeft) + track.clientWidth * 0.7); });
      /* arrow positions/visibility depend on image widths — update as they load */
      Array.prototype.forEach.call(track.querySelectorAll('img'), function (img) {
        if (!img.complete) img.addEventListener('load', update, { once: true });
      });
      window.addEventListener('resize', update);
      update();
      setTimeout(update, 60);
    });
  }

  /* set each row image's flex-grow to its real aspect ratio so a row of mixed
     images all share one height and together fill the row width */
  function measureProjRows(container) {
    var imgs = container.querySelectorAll('.proj-row-item img[data-rowimg]');
    Array.prototype.forEach.call(imgs, function (img) {
      function set() {
        if (img.naturalWidth && img.naturalHeight) {
          img.parentNode.style.flexGrow = (img.naturalWidth / img.naturalHeight).toFixed(4);
        }
      }
      if (img.complete) set();
      else img.addEventListener('load', set, { once: true });
    });
    /* row-embedded self-hosted videos: correct flex-grow to the real aspect once
       metadata is known (flex-grow lives on the .proj-row-item ancestor) */
    var vids = container.querySelectorAll('.proj-row-item video[data-rowvid]');
    Array.prototype.forEach.call(vids, function (v) {
      var item = v.closest('.proj-row-item');
      function setv() {
        if (item && v.videoWidth && v.videoHeight) {
          item.style.flexGrow = (v.videoWidth / v.videoHeight).toFixed(4);
        }
      }
      if (v.readyState >= 1) setv();
      else v.addEventListener('loadedmetadata', setv, { once: true });
    });
  }

  function renderProjectPlayground(p) {
    var body = document.getElementById('proj-body');
    /* viewport fills right side; the back-link is absolute-positioned above it */
    body.innerHTML = '<div id="proj-playground-mount" style="position:relative"></div>';
    var mount = document.getElementById('proj-playground-mount');
    window.Playground.mount(mount, p.playgroundImages, p.id);
  }

  /* ── ROUTING ────────────────────────────────────────────────────────── */

  /* parse hash into { view, projectId } */
  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h)              return { view: 'home' };
    if (h === 'about')   return { view: 'about' };
    var m = h.match(/^project\/(.+)$/);
    if (m)               return { view: 'project', projectId: m[1] };
    return { view: 'home' };
  }

  /* ── PAGE-EXIT VIDEO TEARDOWN ──
     Hiding a view with display:none does NOT stop iframes inside it — audio
     kept playing after leaving the about/project pages. So: on every route
     change we blank the embeds of the views we're leaving, and rebuild them
     fresh when the view is re-entered (like a normal page load would). */
  var _aboutReelSrc = null;   /* original reel src, captured on first use */
  function rebuildAboutReel() {
    var ifr = document.getElementById('about-reel-iframe');
    if (!ifr) return;
    if (_aboutReelSrc == null) _aboutReelSrc = ifr.getAttribute('src') || '';
    var fresh = ifr.cloneNode(false);     /* same id/attrs, no listeners */
    fresh.src = _aboutReelSrc;            /* starts anew */
    ifr.replaceWith(fresh);
  }
  function stopAboutReel() {
    var ifr = document.getElementById('about-reel-iframe');
    if (!ifr || !ifr.getAttribute('src')) return;
    if (_aboutReelSrc == null) _aboutReelSrc = ifr.getAttribute('src') || '';
    var fresh = ifr.cloneNode(false);
    fresh.removeAttribute('src');         /* unloads the embed → audio stops */
    ifr.replaceWith(fresh);
  }
  function stopProjectEmbeds() {
    var body = document.getElementById('proj-body');
    if (body && body.innerHTML !== '') body.innerHTML = '';
  }

  function applyRoute() {
    var r = parseHash();

    /* close any open image lightbox on navigation */
    closeLightbox();
    closeVideoLightbox();

    /* collapse the responsive toolbar drawer on any navigation (clicking the
       logo / back / about while the drawer is expanded returns to the page AND
       slides the toolbar away). Harmless when not in collapsed/drawer mode. */
    var __site = document.querySelector('.site');
    if (__site) __site.classList.remove('tb-open');

    /* stop playback in views we're leaving (see teardown note above) */
    if (r.view !== 'about')   stopAboutReel();
    if (r.view !== 'project') stopProjectEmbeds();

    /* always tear down playground gallery if leaving a playground project */
    if (r.view !== 'project' && window.Playground) {
      window.Playground.unmount();
    }

    if (r.view === 'home') {
      setLeftHome();
      setView('home-view');
      /* build whichever thumbnail display is active. List PRESERVES scroll so
         returning from a project lands the user where they were browsing. */
      applyDisplayMode();
    }
    else if (r.view === 'about') {
      setLeftAbout();
      setView('about-view');
      rebuildAboutReel();   /* embed begins anew, like a fresh page load */
      if (window.ListGallery) window.ListGallery.destroy();
      if (window.GalleryDisplay) window.GalleryDisplay.destroy();
    }
    else if (r.view === 'project') {
      var p = getProjectById(r.projectId);
      if (!p) {
        /* unknown id → fall back to home */
        location.hash = '#/';
        return;
      }
      setLeftProject(p);
      setView('project-view');
      if (window.ListGallery) window.ListGallery.destroy();
      if (window.GalleryDisplay) window.GalleryDisplay.destroy();
      if (p.playgroundImages && p.playgroundImages.length) {
        renderProjectPlayground(p);
      } else {
        renderProjectStandard(p);
      }
    }
  }

  /* exposed navigation — just set the hash; hashchange triggers applyRoute */
  window.goHome = function ()   { setHash('#/'); };
  window.openAbout = function () { setHash('#/about'); };
  window.openProject = function (id) { setHash('#/project/' + id); };

  /* set hash without spamming history when re-navigating to current route */
  function setHash(h) {
    if (location.hash === h) {
      /* same hash — re-apply manually since no event will fire */
      applyRoute();
    } else {
      location.hash = h;
    }
  }

  window.addEventListener('hashchange', applyRoute);

  /* ── INIT ──────────────────────────────────────────────────────────── */
  document.title = (LOGO.idle.type === 'text' ? LOGO.idle.text : '') || 'Portfolio';

  /* about-page bio */
  document.getElementById('about-bio-text').innerHTML = BIO_LONG;

  /* hook the list gallery's active-change callback so the left panel
     always shows the centered project's title */
  if (window.ListGallery) {
    window.ListGallery.setActiveProjectCallback(function (p) {
      currentHomeActiveId = p ? p.id : null;
      renderMiniInfo(p);
    });
    window.ListGallery.setProgressCallback(function (progress) {
      renderTitleStack(progress);
    });
    /* after any gallery (re)build, ensure the title-stack rows match the final
       item set — fixes an init-order/async-measure race that could leave the
       stack short by one (centered title not matching the centered thumbnail). */
    window.ListGallery.setRebuiltCallback(function () {
      rebuildTitleStackRows();
      renderTitleStack(lastProgress || { idx: 0, frac: 0, idxFloat: 0 });
    });
  }

  /* tweak applied → re-render marker glyph + title stack so visual changes
     (e.g. row height, blur amounts, glyph character) take effect immediately */
  window.onTweaksApplied = function () {
    positionMiniTags();   /* mini-x/y/maxW may have moved the description */
    applyAdaptiveText();  /* toggle / dark-color may have changed */
    if (window.DISPLAY_MODE === 'gallery') return;  /* gallery manages its own title/mini on hover */
    if (window.ListGallery && window.ListGallery.repositionMarker) {
      window.ListGallery.repositionMarker();
    }
    /* force a re-render of title stack with current progress */
    if (lastProgress) renderTitleStack(lastProgress);
  };

  /* display mode: restore the persisted choice, wire the switch button */
  (function () {
    var saved = null;
    try { saved = localStorage.getItem('displayMode'); } catch (e) {}
    window.DISPLAY_MODE = (saved === 'gallery') ? 'gallery' : 'list';
    var btn = document.getElementById('display-switch');
    if (btn) {
      btn.addEventListener('click', function () {
        window.setDisplayMode(window.DISPLAY_MODE === 'gallery' ? 'list' : 'gallery');
      });
    }
    window.refreshDisplaySwitch();
  })();

  /* apply route from URL on first load (instant — no async) */
  initLightbox();
  applyRoute();
})();
