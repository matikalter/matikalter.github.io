# Portfolio site project context

A minimalist personal portfolio (Mati Kalter). Deployment target =
GitHub Pages (entry file is index.html). Inspired by jnackash.com,
ellayehudai.com, millermccormick.com, obys.agency. Clean, monochrome,
modern — imagery gets center stage, interface stays quiet.

## Structure
- index.html — design tokens (the TWEAKS JSON block at top), project
  data (`projects` array), filter definitions, layout/CSS, and the
  applyTweaks() function mapping tokens → CSS variables + JS globals
- js/list-gallery.js — vertical project list (home view): snap-to-
  center scroll, center-marker glyph, hover scale + neighbour push,
  inactive opacity/saturation/blur. Auto-measures each thumb's real
  aspect ratio from the image on load (thumbRatio is only a hint).
  Each thumb is .list-item > .list-thumb > .list-thumb-media > img/video.
  INACTIVE BLUR is SEAMLESS (extends past the image edges with no hard
  seam): the inner img/video gets a shape-morphing SVG alpha mask
  (--list-inactive-mask, built in applyTweaks: an SVG rounded-rect with a
  gaussian-feathered edge — Sharp core = solid-centre %, Edge shape =
  ellipse↔rectangle corner radius), and the WRAPPER .list-thumb-media gets
  the blur + saturate + opacity. Order matters: masking the media then
  blurring its PARENT runs the blur over already-soft edges so there's no
  alpha step to expose (a filter on the media directly, or a filter on the
  thumb, leaves/clips a hard edge). The thumb keeps background:transparent
  and overflow:visible when blurred so the halo bleeds out. The
  filter/opacity TRANSITION lives on the base .list-thumb-media rule (not
  :not(.is-active)) so the effect eases in BOTH directions as a thumb
  scrolls into/out of centre. Geometry uses --panel-w (proportional left-
  panel width, never 0) NOT --left-w, so the column keeps its window-
  relative position when the toolbar collapses. positionMarker() reads
  --left-w with an isNaN guard (NOT `|| 340`) so a real 0 (collapsed) is
  respected and the marker keeps its gap from the thumb.
  Each .list-thumb has an OPTIONAL border (--list-thumb-border-w /
  --list-thumb-border-color, box-sizing:border-box so the laid-out size is
  unchanged; width 0 when the Border toggle is off) that conforms to the
  thumb's size/aspect. On a preserveScroll rebuild build() clears
  state.activeId so the next updateActive() tick RE-FIRES onActiveChange,
  re-seeding the mini description + tags immediately (e.g. when switching
  back from the Gallery display) instead of waiting for a scroll.
  INFINITE by default (wrap-around loop); when LIST_INFINITE is false
  it renders ONE copy with hard top/bottom limits (item 0 centered at
  top, last item at bottom) and clamps scrollY to [snapMin,snapMax].
  Toggled live by the "Infinite scroll" Tweak. The center marker can sit
  on the LEFT (default) or RIGHT of the active thumb (MARKER_ALIGN; the
  gap shifts to the chosen side), and an OPTIONAL 1px connector line
  (MARKER_LINE_SHOW / MARKER_LINE_EDGE) runs from the marker to the
  left/right edge of the active title in the title stack — drawn each
  frame on #list-marker-line (position:fixed) by updateMarkerLine() so
  it tracks both the marker glide and the title-stack position.
- js/gallery-display.js — ALTERNATE home thumbnail layout (List ⇄ Gallery,
  toggled by the top-right display-switch button; mode persists in
  localStorage as `displayMode`). A multi-column ROW-MAJOR grid: project 1
  top-left, 2 to its right, 3 next row left, … GalleryDisplay.{build,
  relayout, destroy, scaleFactor}. Two layout modes (Tweak galConform):
  CONFORM = every tile one selectable aspect ratio (galAspect 16:9/4:3/3:2/
  1:1 + galAspectFlip), object-fit:cover → neat CSS grid; FREE = native
  uncropped aspect, tiles distributed ROUND-ROBIN across equal-width flex
  .gal-col columns (so reading order is preserved) with no filler spacing,
  rows don't align. RESPONSIVE like the list: GAL_THUMB_SIZE / gaps / X-Y
  offsets are values at the reference width, scaled by scaleFactor() =
  currentContentW / fullContentW (reads --panel-w, never upscales past 1)
  so thumbnails keep their size RELATIVE to the main content section as the
  window scales. The gallery-stage anchors left to --panel-w (NOT --left-w)
  so the grid doesn't jump when the toolbar collapses. On resize it RELAYOUTS
  in place (updates sizes via CSS, no innerHTML rewrite) so <video> tiles
  aren't torn down + recreated (which would flicker as each re-fetches/
  re-decodes; cached <img>/GIF tiles repaint instantly so never showed it);
  falls back to a full build only if the DOM can't map (mode/project-count
  changed). Tiles share the list's seamless inactive mask-then-blur
  (--gal-inactive-*) and the same optional thumb border (--gal-thumb-
  border-*). Hovering a tile surfaces ONLY that project's title + mini
  (window.galleryHoverInfo); title/mini stay hidden until hover (the centered
  overlays are pointer-events:none in gallery mode so hovers reach the tiles).
  Shares window.__thumbRatioCache with list-gallery.js. Also owns its own
  updateScrollMarkers() (down at scrollTop 0, up at bottom).
- js/playground-gallery.js — draggable multi-row image gallery with
  click-to-expand fullscreen viewer; used for ANY project with a
  `playgroundImages` array. Both the list AND playground galleries guard
  their `mousedown` handler to `e.button === 0` (LEFT-click only) so a
  right-click no longer opens a project / expands a clip (pairs with the
  site-wide contextmenu block in portfolio.js). Tiles scale with the window HEIGHT (thumbH / gaps /
  pad × innerHeight / PG_REF_H) so they keep their relative height + vertical
  position as the window scales vertically; scaling the WIDTH only reveals more/
  fewer tiles (it does NOT change tile size). The expanded overlay is
  HEIGHT-DRIVEN too (sized by available height, shrunk only if it would overflow
  the content width) and stays centered in the content window; recenterOverlay()
  re-fits + re-centers it on resize while open (like project-page image
  lightboxes). The expanded media (.pg-overlay-img img/video) is OVERSCANNED 1px
  on every edge inside an overflow:hidden wrap (object-fit:cover) — a transform-
  scaled <video> leaves a 1px dark GPU compositing seam on its bottom/right, so
  pushing the media past the box hides it. All width math + the
  expand overlay read --left-w via the leftWNow() helper (isNaN-guarded, NOT
  `|| 340`) so a collapsed toolbar's --left-w:0 is respected (otherwise the
  gallery + the expand overlay jump/shrink by a phantom 340px). SCROLL MODE (Tweak pgScrollMode →
  PG_SCROLL_MODE): "free" = wheel scrolls vertically + grab-drag in all
  directions + two stacked .pg-set copies for a seamless vertical loop;
  "horizontal" = wheel + drag are X-only (vertical locked), so it renders a
  SINGLE set with vMult=1 (no vertical-loop duplicate, ~half the tiles/draws
  — pick a thumb height that shows exactly your chosen Rows). CONFORMITY
  (Tweak pgConformity → PG_CONFORMITY, 0..1; spread = 1 - conformity in
  computeDims) controls row-height uniformity (widths always follow native
  aspect): max (1) = every tile exactly thumbH tall (equal-height row); min
  (0) = equal widths, heights vary by aspect. Auto-scroll Speed (Tweak pgSpeed
  → PG_SPEED) is SIGNED: 0 = paused, negative/positive scroll opposite
  directions (the active axis follows the scroll mode). Video entries (mp4/webm/mov) DON'T render as
  per-tile &lt;video&gt; — the infinite scroll duplicates the ~14 clips into
  ~200 tiles, and ~200 independent video decoders stalls the page (each
  &lt;video&gt; is its own decoder + network fetch; unlike GIFs, which share ONE
  decoded bitmap across all duplicate &lt;img&gt; tiles). Instead: ONE hidden,
  muted, looping shared source &lt;video&gt; per UNIQUE clip lives in a tiny
  near-invisible #pg-vpool pool (the only real decoders; NOT display:none,
  which would stop decoding) — ensureSources(); every tile is a &lt;canvas&gt;
  that copies the current frame of its source video via drawImage, run each
  frame by drawTiles() but ONLY for on-screen canvases (geometry test, ±100px)
  so work scales with what's visible (~40–60 draws), not the ~200 total. Net:
  14 decoders + 14 parallel downloads (like the GIFs that loaded instantly),
  not 59–95. The fullscreen overlay uses a real &lt;video&gt; (reads canvas
  data-src/data-ratio). Real aspect ratios auto-measured (pgRatioCache).
- js/posters-gallery.js — STATIC multi-column justified grid (no drag / no
  auto-scroll; the page scrolls normally). Used for ANY project with a
  `postersImages` array (the Posters project). Row-major: images chunk into
  rows of POSTERS_COLS columns; each tile is a box the image fits into
  (object-fit:contain — whitespace invisible on white). Two conformity axes
  (both 0..1): WIDTH conformity blends each tile's width between aspect-
  proportional (0 = justified, widths ∝ ratio) and equal columns (1); HEIGHT
  conformity blends each tile's height between its natural height (0) and the
  row's tallest (1). Defaults hc=1/wc=0 reproduce the classic equal-height
  justified rows. GAPS (POSTERS_HGAP/VGAP) shrink the space for images, so
  bigger gaps → proportionally smaller images (no separate size control); the
  images always fill the content width. A partial last row lays out at the
  previous full row's height, natural widths, left-aligned (never stretched).
  Tiles scale on hover (--posters-hover-scale) and open the shared image
  lightbox on click (img[data-zoom]). Each image can have a `title` + `body`
  shown in the LEFT TOOLBAR on hover, IN PLACE of the project description —
  reusing the SAME #pg-desc overlay the playground uses (adds .pg-hidden to
  .lp-proj-desc). Order + per-image descriptions come from Tweaks (see
  Posters gallery), keyed by src; Tweak values are AUTHORITATIVE even when
  empty, else fall back to inline title/body in postersImages. Real aspect
  ratios auto-measured (window.__postersRatioCache). Relayout is cheap (no DOM
  rewrite) so it runs live on tweak drags; a ResizeObserver on the mount +
  a post-build double-rAF re-fit catch the width change when the vertical
  scrollbar appears on cached loads (plain window 'resize' doesn't fire for
  that). PostersGallery.{build, relayout, unmount, rebuild}.
- js/portfolio.js — hash routing, left-panel rendering, title stack,
  project-page content rendering (block grid), image lightbox, and page-exit
  video teardown. Also disables the site-wide right-click/context menu
  (contextmenu preventDefault) so imagery can't be trivially saved (paired
  with CSS -webkit-user-drag/-webkit-touch-callout guards on img/video).
  Also owns the RICHVIDEO block (self-hosted MP4 with a custom minimal control
  set — see the `richvideo` block type): richVideoInnerHTML() builds the markup,
  setupRichVideo() wires each .rv-stage (tap-to-pause with a centre glyph;
  sticky sound-mode mute toggle + a hover-reveal vertical volume slider;
  bottom-right enlarge that MOVES the whole stage into #rv-lightbox and back so
  its controls work identically inline + enlarged). Controls idle-fade after a
  few seconds; the muted glyph stays PINNED until sound is turned on. resetRichEnlarge()
  drops a detached stage on navigation so no audio leaks.
- js/adaptive-invert.js — PER-PORTION invert-over-images for the home
  overlay text that isn't the title (mini description + regular filter
  labels). Only the part of the text overlapping a DARK thumbnail inverts
  (legible over the image); the rest stays crisp normal-colour text. For
  each registered target it clones a ".ai-copy" overlay appended to
  #home-view (viewport-fixed, mix-blend-mode:difference, INVERSE colour
  --inv-mini / --inv-filter): the BASE is MASKED to hide the dark-overlap
  region and the COPY is masked to SHOW only it — complementary, so each
  glyph paints once. Uses `mask` NOT clip-path (clip-path clips pointer
  events, which broke pill hover + made :hover oscillate); base bands cover
  everything-except-the-hole, or hideMask() fully hides the base when the
  overlap covers the whole element. overlapRect() unions only tiles whose
  OWN project has `dark:true` (reads closest [data-id]) so light tiles get
  no copy/seam — correct in gallery mode where the text may sit over a
  different tile than the hovered one. FILTERS are registered PER PILL (each
  pill its own target: independent dark-overlap + hover-suppression; the
  .active pill is never inverted). Efficiency: no permanent RAF — short
  bursts pinged by wheel/hover/resize/toolbar-collapse that self-extend
  while the mask key keeps changing and stop ~450ms after settle; per frame
  it only writes styles when the key changed. Gated per target by
  window.MINI_INVERT_OVER / FILTER_INVERT_OVER. "Invert on hover" toggles
  (window.TITLE... handled in CSS; FILTER_INVERT_HOVER here): when a filter's
  is OFF, hovering that pill suppresses its invert SYNCHRONOUSLY in the
  mouseover handler (+ sets the pill transition:none) so the reveal snaps to
  the hover colour with no dark-fade flash. Exposes window.AdaptiveInvert
  .{refresh, ping, update}; refresh() reconciles the per-pill targets and is
  called from renderMiniInfo + the filter click handler.
- js/tweaks-app.jsx — in-page Tweaks panel UI (+ js/tweaks-panel.jsx
  is the reusable shell/control library). tweaks-panel.jsx also holds
  the SYNC PERSISTENCE safety net (window.persistTweaks mirror) wiring
  and depth-aware <TweakSection>: nested sections auto-indent via a
  SectionDepth React context (each level wraps in a .twk-subwrap rail);
  master titles render larger (.twk-sect-top), sub-dropdowns smaller
  (.twk-sect-sub). All sections default collapsed. useTweaks() also keeps
  an UNDO/REDO history (full-state snapshots, one per settle/release, capped
  at 50) exposed as a `history` handle the panel header wires to ↶/↷ buttons
  + ⌘Z / ⇧⌘Z (Ctrl on Windows); undo/redo writes flow through both the LS
  mirror and the host disk write so an undone value won't resurrect on refresh.
- js/mobile-app.js — MOBILE renderer (phones only; see "## Mobile
  version"). Self-contained: own hash routing, fixed logo, home feed (two
  label modes), project pages, about, simplified playground/posters, and a
  vanilla mobile Tweaks panel. Reads the SAME shared data globals as desktop
  (projects / tagDefs / filterDefs / BIO_LONG / LOGO). Runs ONLY when
  window.__MOBILE__ is true; desktop portfolio.js + the React tweaks panel
  gate OFF in that mode. Ports the RICHVIDEO block to touch
  (richVideoBlockHTML / setupMobileRichVideo / initMobileRichVideos): tap-to-
  pause centre glyph, a bottom-left MUTE TOGGLE (no volume slider — iOS ignores
  JS `video.volume`, so only muted flips; hardware buttons set the level), and
  a bottom-right ENLARGE that moves the stage into a fullscreen #m-rv-lightbox
  overlay (so a landscape clip can be rotated to view full-size). Same idle-fade
  + pinned-muted-glyph behaviour as desktop; resetMobileRichEnlarge() clears the
  overlay on nav.
- css/mobile.css — mobile stylesheet (activated by <html>.is-mobile). All
  --m-* vars are set by mobile-app.js from the m* tweak keys; colours / box /
  leading / tracking reuse the shared desktop CSS vars.
- Mobile Preview.html — preview HARNESS (review only; NOT deployed). Shows
  index.html?device=mobile&embedded=1 inside portrait + landscape phone
  frames on a gray backdrop; owns the mobile Tweaks panel (in the gray
  margin) and relays the host Tweaks protocol + live edits down to the
  phone frames.
- assets/<project-id>/<filename> — project images

## Mobile version (phones only)
Phones get a SEPARATE, more minimal experience; iPad / tablets + desktop keep
the existing responsive desktop site. Still ONE deployable index.html.

DETECTION — inline <head> script in index.html, runs before any body script:
sets window.__MOBILE__ + <html>.is-mobile from UA + pointer:coarse + width,
treating iPad / Android-tablet as DESKTOP. Override per-load with
?device=mobile|desktop (NO localStorage write, so it can't bleed from the
preview iframe into a real desktop tab). On mobile, css/mobile.css hides
.site and shows #mobile-app; portfolio.js's IIFE early-returns and
tweaks-app.jsx skips mounting — mobile-app.js owns everything.

MOBILE-APP (js/mobile-app.js) — independent layer, shares DATA not code:
- Fixed LOGO overlay on all pages (TRANSPARENT — just the text, overlays
  content on scroll), tap → home. Tweaks: size (14–72), align, idle colour,
  tap colour (curated swatches). Clears the notch: padding-top =
  max(--m-safe-top, env(safe-area-inset-top)); --m-safe-top is 30px portrait
  / 6px landscape when EMBEDDED in the harness (fakes the inset), 0 on a real
  device (uses env()). positionView() sets the scroll view's top padding =
  the live logo-bar height so content sits just under it (re-runs on resize).
- HOME: single vertical thumbnail feed (no list/gallery toggle). Social icons
  + about row at the top (scrolls away; NO hero image, NO bio). FILTER row
  below it (window.filterDefs), single-select, black default / --highlight on
  active+hover. Filter SPACING is a 0..1 SPREAD computed against the row's OWN
  width (layoutFilters): 0 = bunched (positioned by align), 1 = spread edge-
  to-edge flush to the margins; adapts to portrait/landscape/device, re-lays
  out on resize + font-size change. Two LABEL modes (Tweak mFeedMode, default
  'above'/B):
    A 'hold' — title/mini/tags reveal on press-and-hold over the thumb
      (pointer tap-vs-hold: hold shows labels + dims/blurs the image, tap
      opens). Hold tweaks: blur / opacity / saturation + text Y + align.
    B 'above' — labels stacked ABOVE each thumbnail; tap opens.
  Feed thumbnails load EAGERLY (no loading=lazy — the lazy IntersectionObserver
  never fires two iframes deep in the harness, leaving thumbs 0-height).
- PROJECT PAGE: title (Project Page Title / h2 — NOT h1) + year + tags + desc
  (+ optional play button, which reuses the desktop --play-* pill vars so its
  Regular/Boxed style carries over) at the top, then a DIVIDER (Tweak mDivShow
  toggles it via VISIBILITY so the SPACE stays either way; even space above +
  below from the single mDivSpace slider), then content blocks in ONE column.
  Blocks reuse the desktop block types (video embed / richvideo / localvideo /
  image / text / divider / row→stacked / hscroll); playground & posters projects
  render as a simple full-width vertical media stack.
  VIDEO HANDLING (mobile-specific, differs from desktop):
    * iframe EMBEDS (YouTube/Vimeo) are LAZY-MOUNTED — iOS caps simultaneous
      video decoders, so mounting all of loop-troupe's 5 Vimeos at once made
      most hang on load. initMobileEmbeds() renders each embed as an empty
      .m-embed[data-embed-src] placeholder and only creates the <iframe> when
      it nears the viewport (IntersectionObserver + a scroll/touch/resize
      rect-pass fallback, since IO is flaky two iframes deep in the harness),
      tearing it down when far off-screen so ~1-2 decoders are live at a time.
      Embed boxes are sized by the PADDING-BOTTOM technique (JS ratioToPB →
      height:0 + padding-bottom:%), NOT css aspect-ratio: in an iOS flex column
      aspect-ratio can fail to give the box a height, letting the iframe's
      default 300×150 landscape win (which pillarboxed the-last-question's 4/5
      portrait Vimeo with black side bars). Embeds keep a black fill + 1px
      iframe overscan (clips the letterbox hairline).
    * YOUTUBE on mobile drops autoplay+mute (mobileEmbedSrc → autoplay=0&mute=0)
      so the native player shows its poster + big play button and plays WITH
      sound on tap — YouTube's iframe has no Vimeo-style "tap to unmute" pill
      and no param for one, so tap-to-play-with-sound is the intuitive native
      affordance. Vimeo is left autoplaying muted (it shows its own unmute
      button).
    * localvideo (incl. playground/posters clips) renders at NATURAL aspect
      with a TRANSPARENT container (.m-block.m-video) + line-height:0 — the old
      forced 16/9 + black box caused (a) a black bar under non-16/9 clips like
      Date Night and (b) a 1px black hairline leaking around videos during iOS
      scroll compositing. No black bg = any sub-pixel seam shows the white page
      (invisible). Mobile IGNORES the desktop `ratio` on localvideo (it exists
      to equalize heights in side-by-side desktop rows; single-column mobile
      wants native aspect, no letterbox).
    * richvideo renders the custom touch control set (tap-to-pause centre glyph,
      bottom-left mute toggle — NO slider, bottom-right enlarge → fullscreen
      #m-rv-lightbox). Like localvideo it's a native muted-loop <video>; unlike
      the desktop build it has no volume slider (iOS ignores JS `video.volume`).
- ABOUT: single column — long bio (h4), meta sections (titles h3, items in
  Labels style with trailing detail in --text-faint), Vimeo reel at the
  bottom (extra top margin for even spacing).
- Nav reuses the SAME hashes (#/, #/about, #/project/<id>) so links work;
  mobile-app defines window.{goHome, openAbout, openProject}. Embeds are torn
  down (src=about:blank) on nav.

TYPE LINKING: feed / label / about text inherit the desktop type styles'
WEIGHT + LEADING + TRACKING + COLOUR (tags reuse the .tag-pill box/outline
vars incl. tagStyle + --tag-gap; mini uses --mini-color; filters use
--highlight). Only SIZE is mobile-specific where the desktop size is tuned for
a wide panel: the home-feed TITLE (desktop h1 = 71px, too big) uses a mobile
--m-title-size, and the project-page TITLE uses --m-proj-title-size (it maps
to the desktop h2 WEIGHT/LEADING/TRACKING but a mobile size); mini/tags have
their own mobile sizes. The rest of the about page uses desktop sizes directly.

MOBILE TWEAKS: a SEPARATE namespace — m* keys in the TWEAKS block (mLogoSize,
mLogoAlign, mLogoColor, mLogoTapColor, mFeedMode, mFeedGap, mTitleSize,
mProjTitleSize, mMiniSize, mTagsSize, mHoldBlur/Opacity/Saturation/TextY/Align,
mLabelAlign, mFilterSize/Align/Gap, mDivShow, mDivSpace). applyMobileTweaks()
maps them to
--m-* vars; desktop keys are untouched; content (projects/bio/labels) lives
once. Two PARALLEL panels, same keys + persistence:
  - IN-PHONE panel (mobile-app.js) — shown when viewing index.html?device=
    mobile directly; owns the host protocol + backtick toggle.
  - HARNESS panel (Mobile Preview.html) — shown when reviewing via the
    harness; lives in the gray MARGIN (phones shift right), drives the PRIMARY
    phone via MobileApp.setTweak and relays edits to the sibling frame.
Both have UNDO/REDO (↶/↷ + ⌘Z / ⇧⌘Z, one snapshot per gesture, cap 50) and
persist via window.persistTweaks (LS mirror) + the host __edit_mode_set_keys
disk write. NOTE: new m* keys must be written into the TWEAKS block to reach
disk; the LS mirror keeps harness edits alive across refresh, but to save
mobile tweaks to the FILE / GitHub, tweak in the DIRECT mobile view (the
harness's "open mobile ↗" link) — from inside the harness the host's edit
target is Mobile Preview.html, not index.html.

## Layout
Left panel = fixed identity bar. From top: LOGO, then the Social+About
unit (Instagram/LinkedIn/email icons + "about" link), an optional
horizontal divider, then the SHORT bio, and an optional HERO-IMAGE gif
pinned to the panel bottom. These blocks are ABSOLUTELY positioned on the
home/about view, each with its OWN independently controllable Y position
(Logo Y, Social+About Y, Divider Y, Bio Y, and Gif Y-from-bottom — all in
Tweaks → Toolbar). The divider has its own show/hide toggle + Y. The
panel's inner inset is controlled by Margin X (horizontal padding, also
feeds --left-pad so every absolute block + Back/Play tracks it); there is
no toolbar Margin Y.

LOGO — FIT-TO-WIDTH: the title logo always fills the toolbar's inner width
on ONE line. fitLogo() (in index.html) measures the text's natural width at
the Title-size reference and sets the actual font-size so it spans the
available width; weight/family/leading/tracking stay editable, only size is
derived. It is BOTTOM-ANCHORED (shrinking pushes it DOWN so the gap to the
Social+About block is constant; the top still tracks --logo-y from the panel
top) and SIZE-CAPPED at the full-size value (so the wide expanded drawer
doesn't grow it past the window top). It is ALWAYS horizontally centered
(the old logo Align control is removed). Re-fits on resize, toolbar collapse/
expand, tweak change, and webfont load.

RESPONSIVE TOOLBAR: the left panel + main content scale together with window
width. updateResponsiveLayout() (index.html) computes the panel width as a
constant FRACTION of the window relative to a reference width (the screen
width, or the manual "Full-size width" tweak tbRefW). It sets TWO vars:
--panel-w = the proportional width (NEVER 0; galleries + the column lay out
against this so positions stay window-relative), and --left-w = the panel's
ACTUAL on-screen width (drops to 0 when collapsed so main content fills the
window). Below 50% of the reference width the toolbar COLLAPSES: .site gets
.tb-collapsed, the panel becomes a drawer that slides off-screen
(translateX(-100%)) at its real width, and two fixed buttons appear at the
vertical center — #tb-expand (left, slides the 100vw drawer in via .tb-open)
and #tb-minimize (right, slides it out). The drawer is z-index 300 + toggles
310 (ABOVE the lightbox at 200) so it expands over expanded images/videos.
Clicking the logo/Back/About (any navigation, via applyRoute) removes
.tb-open so the drawer closes on nav. On the ABOUT page the expand button
instead routes home (goHome) and leaves the toolbar collapsed. Back/Play
buttons use --btn-track-w (=100vw in the expanded drawer, else --left-w) for
center/right alignment so they don't fly off-screen when --left-w is 0.

The optional HERO-IMAGE gif (assets/playground/
Jumpdude-b.gif) sits BENEATH the other blocks (z-index:0; logo/links/bio/
divider are z-index:1) so they always render above it. The gif is a LINK to
the Playground (#/project/playground) with a hover scale-up (Tweak gifHoverScale
→ --gif-hover-scale) whose hoverable/clickable area is limited to a centered
inner 50%×50% hotspot (.lp-gif-hot; the <a> itself is pointer-events:none).
The gif has independent IDLE and HOVER visual states (Tweaks → Toolbar →
Hero Image → Idle / Hover sub-dropdowns), each with Blur, Hue (hue-rotate —
shifts colourful shapes' hues while leaving white/black untouched, since
white has no saturation), Edge fade + Corner roundness (an SVG rounded-rect
blurred alpha mask, --gif-mask / --gif-mask-hover, that feathers the blur so
it dissolves seamlessly past the image box instead of hard-clipping). The
blur + mask live on the <a> WRAPPER (not the <img>): replaced elements clip
their own filter bleed to the content box, leaving a hard edge. Hover adds
Scale and an "Invert hue" toggle (hue-rotate 180°, composes with the hover
Hue). The logo/Social+About positions are kept IN SYNC
between the home view and the about page. On a project page the left
panel shows title / year / tag chips / desc + Back (and optional Play)
button pinned near the bottom (divider + gif are absent there). An empty
`year` ('') is skipped (no empty line). Right panel = home view
(centered vertical infinite thumbnail list OR the multi-column Gallery
display — see Display modes) OR a project page OR the about page.

DISPLAY MODES (home view): the right panel's thumbnails render as EITHER
the List display (js/list-gallery.js) or the Gallery display
(js/gallery-display.js). A fixed top-right display-switch button (#display-
switch; Tweaks → Project Thumbnail Display → Switch button: X-from-right /
Y-from-top / Size / Radius / List glyph / Gallery glyph + Default/Hover
styling like Back/Play) toggles between them, showing the glyph of the mode
you'd switch TO. window.DISPLAY_MODE ('list'|'gallery') persists in
localStorage; applyDisplayMode() (portfolio.js) builds the active display
and destroys the other. In gallery mode the list's center marker +
connector line are hidden, and the title/mini overlays show ONLY on tile
hover; in list mode they track the centered thumb as before. The two
scroll-affordance markers are SHARED by both displays (see Scroll markers).

The TITLE STACK and FILTER buttons live in the MAIN CONTENT area (right
of the left panel), NOT the left panel:
- Title stack: vertically centered in the viewport (aligns with the
  center-selected thumb), horizontally aligned with the mini description
  by default. Tweaks: Align (left/center/right, applied via translateX
  so rows are max-content = UNLIMITED title width, independent of the
  mini-description max width), X position, Vertical offset, Row height.
  Shows the center title + 3 above + 3 below (7 rows); three blur +
  three opacity tiers fade the outer rows; rows beyond ±3 are
  pointer-events:none.
- Filter buttons: anchored from the TOP, aligned with the mini
  description by default. Tweaks: Align (relative to themselves), X
  position, Y from top, Direction (vertical = stacked, or horizontal =
  in a row right of "All"), and gap between buttons (the "All" button
  stays put; the others move relative to it).

Back/Play buttons (left panel, project page): style-driven (Regular |
Boxed) per state. In REGULAR style there is NO box — transparent
background, no padding, and the button TEXT aligns flush with the panel
content margin (like the title/tags). In BOXED style the box gets an
opaque page-bg base + Fill color (so a translucent fill never exposes
the scrolling panel text beneath) + outline + padding, and the BOX edge
aligns with the margin. Both have Default + Hover states (no Selected).
Labels are pure text from Tweaks — NO hardcoded ← or 🕹️ glyphs (add
your own in the text field if wanted).

## Routing
Hash-based: #/, #/about, #/project/<id>. Single file — instant nav,
no reloads, linkable URLs. Returning to home preserves the list scroll
position (applyRoute calls ListGallery.build({preserveScroll:true}); destroy()
leaves state.scrollY intact across a project/about visit), so the user lands
back where they left off.

## Project data (`projects` array)
Each project: id, title, year, tags[], mini (short descriptor shown in
home-view mini-info block), desc (left-panel project description; may
contain <br> and <em>/<a> — links get the highlight color), thumb,
thumbRatio (OPTIONAL first-paint hint — real ratio auto-measured),
play (OPTIONAL download/play URL → renders a Play button in the
left panel below the desc, above Back; label is pure text from Tweaks;
omit = no button), hidden.
- `dark` (OPTIONAL bool): marks a project whose THUMBNAIL is dark. Used by
  the per-portion invert-over-images effect (js/adaptive-invert.js): the mini
  description + regular filter labels only invert the portion overlapping a
  DARK tile (so light/white thumbnails don't get an ugly mask seam). It reads
  each overlapped tile's OWN `dark` flag (not the hovered project's), so it's
  correct in gallery mode too. NOT auto-measured — set `dark: true` by hand on
  new dark thumbnails (brightness can't be sampled from a cross-origin/video
  thumb reliably). Current dark projects: loop-troupe, imprint, tryst, noodle,
  the-last-question, matilena, trial-and-error, playground.
- Standard project page: add a `content` array of ordered blocks laid
  out in a 2-column grid (grid-auto-flow dense; columns are ALWAYS 1:1 /
  `1fr 1fr` — there is no column-ratio control). Blocks render top-to-
  bottom; the `content` array IS the ordering (no per-page layout flag):
    { type:'video', src:'<embed url>' }           // full-width 16:9
    { type:'video', src:'…', full:false, ratio:'1/1' } // one column, custom ratio
    { type:'richvideo', src:'clip.mp4' }          // self-hosted MP4 + custom controls
    { type:'richvideo', src:'clip.mp4', ratio:'16/9' } // lock cell ratio (contain)
    { type:'localvideo', src:'clip.mp4', full:true } // self-hosted MP4, full-width
    { type:'localvideo', src:'clip.mp4', ratio:'1/1' } // lock cell ratio (contain)
    { type:'spacer' }                             // empty 1-col cell (layout filler)
    { type:'image', src:'file.jpg' }              // one grid column
    { type:'image', src:'file.jpg', full:true }   // spans both columns
    { type:'image', src:'file.jpg', ratio:'1/1' } // lock cell ratio, contain-fit
    { type:'image', src:'logo.png', maxW:'60%' }  // cap + center within column
    { type:'image', src:'x.jpg', mt:10, mb:10 }   // extra px space above/below
    { type:'image', src:'x.jpg', alignSelf:'end' } // align within its grid row (start/center/end)
    { type:'text', title:'…', body:'…' }          // title (H5) + body
    { type:'text', html:'<p>…</p>' }              // legacy raw-html text
    { type:'divider' }                            // standalone full-width rule
    { type:'row', images:['a.gif','b.jpg',…] }    // N imgs, one equal-height line
    { type:'row', images:['logo.png'], center:true, maxW:285 } // centered, capped
    { type:'row', images:['', 'mid.gif', ''] }    // empty slot = invisible spacer
    { type:'hscroll', images:['a.jpg','b.jpg',…] } // horizontal-scroll gallery
  Notes:
  - video block: full-width by default (back-compat). `full:false` puts it
    in one grid column; optional `ratio` (e.g. '1/1') overrides 16:9. All
    embeds have an "enlarge" button (bottom-right on hover) opening a video
    lightbox — needed because sandboxed iframes block native fullscreen.
  - richvideo block: the SAME self-hosted MP4 as localvideo (`assets/<id>/<src>`,
    autoplay+muted+loop, H.264/yuv420p/faststart) but with a CUSTOM MINIMAL
    CONTROL SET — the "video WITH sound + controls" method (localvideo is the
    "silent, no-controls" method). On top of the <video> we draw our own:
    tap-anywhere play/pause (centre glyph), a bottom-left VOLUME control (a muted
    glyph that STAYS pinned on load → tap unmutes + swaps to a sound glyph;
    hovering the icon reveals a vertical volume slider that stays present even at
    0 volume and fades on unhover), and a bottom-right ENLARGE toggle. Sound-mode
    is STICKY (a click-set flag, independent of the volume value) so sliding to 0
    doesn't collapse the slider/icon. `full:true` spans both cols; `ratio` (e.g.
    '1/1', '16/9') locks a contain-fit box to match a neighbour; `col:1|2` forces
    the grid column; `mt`/`mb` (px) add space. Enlarge MOVES the whole .rv-stage
    into #rv-lightbox (a blurred-backdrop overlay) so every control keeps working
    enlarged; click the backdrop or Esc to close and it returns to its grid cell.
    Wired by initRichVideos()/setupRichVideo(); NOT ported cosmetically — mobile
    has its own touch build (see Mobile version). On iOS the volume SLIDER is
    absent (JS volume is ignored there) — mobile gets a mute toggle instead.
  - spacer block: an empty single-column cell that renders nothing. Use it to
    occupy a grid slot so the FOLLOWING block lands in the other column (and
    grid-auto-flow:dense can't backfill the hole with a later block) — e.g. to
    force a richvideo directly under a specific neighbour without unpairing the
    blocks below. `full:true` makes it a full-width spacer.
  - localvideo block: a SELF-HOSTED MP4 (`assets/<id>/<src>`) in a native
    <video> — autoplay+muted+loop like a GIF but far smaller/sharper, with
    NO native controls. `full:true` spans both cols at natural height (no
    letterbox); optional `ratio` locks a contain-fit box. The `.proj-localvideo`
    container background is TRANSPARENT (not #000) so sub-pixel rounding can't
    leak a 1px black hairline under/around the clip — any letterbox shows the
    white page instead. Renders a zoom-in
    cursor; click → enlarges into the image-style lightbox (the lightbox
    frame shrink-wraps the clip so clicking any dim area outside it closes;
    NO × button — embeds keep theirs). If the browser blocks autoplay (iOS
    Low Power Mode etc.) a ▶ play affordance fades in over the frozen frame
    (detected via the play() promise; initLocalVideos()). Encode H.264 +
    yuv420p + faststart so it plays everywhere and streams while loading.
  - text block: `title` renders in Heading-5 type with a "→ " prefix;
    `body` in body type (muted); both optional. `full:true` spans both
    cols. `rows:N` makes it span N grid rows (so neighbours stack beside
    it). `mt`/`mb` (px) override the block's default top/bottom margin (e.g.
    `mb:0` so a neighbour bottom-aligned to it lands exactly on the last
    text line, not below its margin). Links inside title/body get the
    highlight color.
  - image block: `ratio` locks the cell to that aspect and fits the image
    inside (object-fit:contain) — use it to match a neighbour's height.
    `maxW` (number=px, string e.g. '60%'=relative) caps & centers the image
    within its column — use to shrink a logo (pair with `full:true` to
    centre it across the whole page). `mt`/`mb` (px) add extra space above/
    below this image on top of the grid row-gap. `alignSelf` (start/center/
    end) overrides the grid's global Column-align for THIS cell — e.g. two
    portraits of unequal height side by side both get `alignSelf:'start'`
    so their tops line up regardless of the Column-align tweak; or an image
    beside a tall text block gets `alignSelf:'end'` to bottom-align them.
  - divider: its own block (NOT a flag on text). Uses the global Divider
    spacing Tweaks; per-block `mt`/`mb` (px) override that one divider.
  - row: full-width flex line, ignores the grid columns. Each image's
    flex-grow is set to its REAL aspect ratio (measured on load) so all
    items share one height and fill the width — this is how you get 3+
    images on a line. An empty-string entry is an invisible equal-width
    spacer (e.g. ['', 'x.gif', ''] centers one image in the middle third).
    `center:true` + `maxW:<px>` caps & centers a single logo. `gap`
    between row images = the Gap X Tweak. A row entry can be an object with
    per-item overrides: `{src, w, valign, scale, align}` — `w` FIXES that
    item's flex-grow to a constant (so `[{src:a,w:47},{src:b,w:53}]` locks a
    47%/53% split regardless of aspect; such items are marked data-fixedw so
    measureProjRows leaves their grow alone); `valign` (start/center/end) sets
    align-self so a shorter item can center against a taller neighbour;
    `scale` (0..1) shrinks the image within its slot (slot size unchanged,
    white space around it) with `align` positioning it. A row entry can also be a video
    object `{video:'<embed url>', ratio:'4/5'}` — it shares the row's
    height (flex-grow = its w/h), so a portrait embed sits beside an image
    at equal height. Video markup is shared via videoInnerHTML(). A row
    entry can ALSO be a self-hosted video `{localvideo:'clip.mp4',
    ratio:'1/1'}` — same equal-height rule (flex-grow corrected to the
    real aspect on metadata load), behaves like the standalone localvideo
    block (no controls, click-to-enlarge, autoplay-fail ▶).
  - hscroll: full-width horizontal gallery at a fixed height. Wheel inside
    scrolls L/R (smooth lerp), releasing to the page at each edge; edge
    arrows (prev/next — NOT .left/.right, which collide with panel CSS)
    fade in only when there's room to scroll that way. Logic in
    initHscroll(); a 2px EDGE tolerance handles sub-pixel rounding. The
    gallery only scrolls L/R while the PAGE is fully scrolled to the top
    (scrollY < 1) — otherwise the wheel scrolls the page vertically first.
  No `content` → falls back to video + images. Image files live in
  assets/<id>/.
- Posters-style page: add `postersImages` [{src, title?, body?, ratio?}] to
  render the STATIC justified grid (js/posters-gallery.js) instead of the
  content-block grid. Order + per-image Title/Body descriptions are edited in
  Tweaks → Posters gallery → Image order (stored as `postersOrder` filename
  array + `postersDescData` keyed by src; both AUTHORITATIVE over inline
  title/body, same rule as playground). Image files live in assets/<id>/.
  Layout/behaviour controls live in the Posters gallery tweaks section.
- Playground-style page: add `playgroundImages` [{src,ratio}] to swap
  in the draggable gallery layout instead. Clip ORDER is controlled from
  Tweaks → Playground gallery → Clip order (up/down + thumbnail per clip),
  stored as the `pgOrder` filename array (window.PG_ORDER); the gallery lays
  clips out in that order then splits them sequentially into rows. Clips not
  in pgOrder keep data order and are appended (never dropped). Each `src` can
  be an image OR
  a video (mp4/webm/mov) — videos autoplay muted+looped, no controls,
  click-to-expand full-size. `ratio` is a first-paint hint; real aspect
  is auto-measured (pgRatioCache). The home-view `thumb` can also be a
  video (rendered as an autoplay/muted/loop &lt;video&gt;; ratio auto-measured).
  VID DESCRIPTION: each clip can have a `title` + `body` shown in the LEFT
  TOOLBAR on tile hover / expand, IN PLACE of the project description (an
  in-flow overlay .pg-desc inside .lp-desc-wrap sits exactly over
  .lp-proj-desc and scrolls with the panel; showing it adds .pg-hidden to the
  project desc, which reappears on mouse-leave / when descriptions are
  disabled). Descriptions are edited per clip in Tweaks → Playground gallery →
  Clip order (✎ toggle → Title + Body fields), stored in the `pgDescData`
  tweak keyed by clip src (window.PG_DESC_DATA); a field defined there is
  AUTHORITATIVE even when empty (clearing it hides that line — does NOT fall
  back to any inline title/body in the project data). Uses the Text Title (h5)
  + Text Body styles. Toolbar tweaks (Vid Description sub-dropdown): Show
  descriptions toggle (pgDescShow / PG_DESC_SHOW), Align (pgDescAlign), and Y
  offset (pgDescY \u2192 --pgdesc-y; 0 = same location as the project description).

## Filters vs Tags (two separate systems)
- Filters = category buttons in the main content area (All, Games,
  Animation, Illustration). SINGLE-SELECT (radio): exactly one filter is
  active at a time — clicking any pill makes it the sole active filter
  (clicking "All" clears category filters and shows everything). Interactive:
  Default / Selected / Hover states
  (grouped under a "States" sub-dropdown in Tweaks), each state styled
  independently (see pill styling below).
- Tags = display-only chips on project pages + home mini-info. Single
  visual state. Category keys (games/animation/illustration) double as
  tags so they stay in sync. Other tagDefs keys include art-direction,
  visual-design, level-design, game-design, concept-art, character-design,
  comics, tech-art, development, motion, motion-design, brand-design,
  2d/3d, illustration, solo-dev — add a new `{ key, label }` to tagDefs
  before referencing it in a project's tags[].
- PILL STYLING (shared by tags, filter states, and Back/Play states):
  a Style switch — REGULAR (no box: no padding, no fill/outline, just a
  Text color; so left-aligned text lines up with the mini description /
  title stack) vs BOXED (padded box: Text + Fill + Outline colors).
  All color options have an ALPHA channel (so Fill/Outline can be
  translucent). Boxed paints an opaque page-bg base UNDER the Fill so a
  translucent fill never lets the underlying scrolling text show through.
  The shared logic is the `setPill(family, stateKeySuffix, cssState)`
  helper in applyTweaks() — it sets `--<fam>-<state>-{text,bg,border,bw,
  pad,base}` CSS vars from the Style + color tweaks.

## About page (#/about)
Right zone of the about view is a CSS grid: left column = bio (BIO_LONG,
rendered as Heading 4 type; may contain <a> links — e.g. "Say hi!" →
mailto), right column = the meta block (Education / Awards / Conferences,
pinned TOP and aligned with the bio, section titles in Heading 3 type)
above a Vimeo showreel (#about-reel-iframe) pinned to the BOTTOM. The reel uses the project-page .proj-video markup (NO enlarge button — removed; it keeps Vimeo's native fullscreen) and is overscanned 1px to avoid a
black hairline. Tweakable (About page section): Margin X / Margin Y
(outer padding), Column split (the movable left|right divider = left zone
width %), Bio max width and Education max width (0 = no cap). The meta
text + reel are hardcoded HTML in index.html (safe to hand-edit).

## Image / video lightbox (project pages)
Click any content image → expands centered, blurred backdrop
(backdrop-filter), page underneath inert, page scroll frozen
(body.lightbox-open). Click outside / Esc closes. Size = Tweaks
"Expanded image size". Images & video render with sharp corners. Embeds
(YouTube + Vimeo) keep their OWN native fullscreen control — there is NO
custom enlarge button on embeds anywhere (removed from videoInnerHTML AND
the hardcoded about-page reel). Self-hosted
localvideo clips reuse that overlay but the frame shrink-wraps the clip
(.is-local — no fixed-ratio box, no × button) so the visible video bounds
equal the clickable bounds; the enlarged clip autoplays muted+looping
with no controls. (Embeds no longer enlarge — they use native fullscreen —
so the old embed playback-sync plumbing and js/video-sync.js + the Vimeo
Player API script have been REMOVED. closeVideoLightbox() now only serves
localvideo; openVideoLightbox/replaceLightboxIframe are gone.) RICHVIDEO blocks
use their OWN enlarge overlay (#rv-lightbox desktop / #m-rv-lightbox mobile):
instead of cloning media, the whole .rv-stage is MOVED into the overlay and back
so the same <video> element + control listeners work identically inline and
enlarged; click the blurred backdrop or Esc to close.

## Page-exit video teardown
Hiding a view with display:none does NOT stop its iframes (audio kept
playing after leaving a page). applyRoute() blanks the embeds of any
view being LEFT — stopAboutReel() unloads #about-reel-iframe's src,
stopProjectEmbeds() clears #proj-body — and rebuilds them fresh on
re-entry (rebuildAboutReel() / renderProjectStandard) so the video
begins anew like a normal page load.

## Tweaks panel
Toggle from toolbar or backtick (`). All design tokens are editable live.
EVERY TweakSlider's readout is an editable number field: drag the track for
coarse moves (step 1px) or TYPE an exact value + Enter/blur for precision the
drag grid can't reach (clamped to min/max; decimals fine for fraction sliders).
Type scale is named: Home Project Title (h1) / Project Page Title (h2) /
Accolades (h3) / About (h4) / Text Title (h5) / Bio / Mini Description /
Text Body (each with the same size/weight/leading/tracking controls; panel
order: Title, Home Project Title, Mini Description, Project Page Title,
Accolades, About, Bio, Text Title, Text Body). Assignments: Home Project
Title (h1) = title-stack project titles; Project Page Title (h2) =
project-page left-panel title; Accolades (h3) = about-page meta section titles
(Education/Awards/Conferences); About (h4) = about-page long bio; Text Title
(h5) = project-page text-block titles; Bio = the left-toolbar home bio; Mini
Description = project mini descriptions; Text Body = project-page body text.
Sections
(top-level and nested) ALL start collapsed; nested dropdowns indent
progressively via a SectionDepth context (master titles larger, sub
titles smaller). Notable groupings:
- Toolbar: Left panel width (full-size base; scales responsively), Margin X
  (horizontal inset, feeds --left-pad), a "Logo" sub-dropdown (Logo Y only —
  logo is fit-to-width + always centered), a
  "Social+About" sub-dropdown (Y position), a "Divider" sub-dropdown (Show
  divider + Divider Y), a "Bio" sub-dropdown (Show bio + Y position + Align
  left/center/right via text-align + an editable multiline Text field
  [bioShort; newlines → <br>; empty = hardcoded BIO_SHORT default]), a
  "Hero Image" sub-dropdown (Show gif + Gif Y-from-bottom + Gif size + Gif
  align, then "Idle" and "Hover" sub-dropdowns each holding Blur / Hue /
  Edge fade / Corner roundness; Hover also has Scale + Invert hue toggle),
  and a "Collapse buttons" sub-dropdown (Full-size width [tbRefW, 0 = auto/
  screen width = the responsive reference + collapse threshold], Size, Edge
  offset, Y from top, Radius, Expand glyph, Minimize glyph, + Default/Hover
  state styling like Back/Play), and a "Vid Description" sub-dropdown
  (playground only: Show descriptions [pgDescShow], Align [pgDescAlign], Y
  offset [pgDescY]; the per-clip Title/Body text is edited under Playground
  gallery → Clip order, not here).
- Project Mini Description: X position, Vertical offset (±400px, relative to
  vertical screen-center — same anchoring as the title stack), Max width,
  Color (--mini-color), and "Invert over images" (miniInvertOver → per-portion
  invert over dark tiles via js/adaptive-invert.js).
- Center marker: glyph, size, color, Gap from thumb, Marker side
  (left/right), Connector line (show/hide) + Line connects to
  (left/right edge).
- Scroll markers: two glyph affordances SHARED by both home displays. They
  live as direct children of #home-view (position:fixed) so they survive the
  list-stage being display:none in gallery mode. DOWN (default ▼) fades in
  when scrolled fully to the TOP; UP (default ▲) when fully at the BOTTOM.
  In LIST mode updateScrollMarkers() (list-gallery.js) positions them over
  the thumb column (X = --left-w + column center, since they're now viewport-
  fixed) and only in finite mode (no extremes when infinite). In GALLERY mode
  gallery-display.js's own updateScrollMarkers() centers them over the grid
  and toggles visibility from the gallery-stage's scrollTop. Each has its own
  Glyph + X + Y-from-bottom(down)/top(up); a shared Animation toggle drives a
  gentle yoyo (scrollMarkerYoyo keyframes). Globals SCROLL_MARKER_{ANIM,
  DOWN_*,UP_*}. Not layout keys (no rebuild).
- Project titles (formerly "Title stack"): Align, an "Inactive selectable"
  toggle (off = only the centered title is hoverable/clickable; inactive
  titles get pointer-events:none via TITLE_INACTIVE_SELECTABLE in
  renderTitleStack), Color (--title-color), X position, Vertical offset, Row
  height, an "Invert over images" toggle (homeInvertText → the title stack
  gets mix-blend-mode:difference so it inverts per-pixel over thumbnails; the
  blend lives on the STACK, rows are set to --inv-text so difference vs the
  white page reproduces the chosen colour), a "Hover" sub-dropdown (Hover
  scale [only the .is-centered row, via an inner .lp-title-inner span so scale
  is independent of the per-frame translate; --title-hover-scale], Hover color
  [--title-hover-color; counter-inverted when invert is on so it reads true],
  and "Invert on hover" [titleHoverBlend; off → .title-noblend-hover drops the
  blend on the hovered centered row via :has() so it shows its true colour;
  in that mode the mix-blend switch is INSTANT so the row's colour must SNAP
  in lock-step — .lp-title-inner transitions transform ONLY (no colour cross-
  fade) to avoid a white flicker passing through the near-white inverse value
  on hover in/out; the scale still eases]),
  and an "Upper / lower titles" sub-dropdown (three blur tiers + three opacity
  tiers for the ±3 rows).
- Filter buttons: Align (self), X position, Y from top, Direction
  (vertical/horizontal), gap, show-box, radius, a "States" sub-dropdown
  with Default / Selected / Hover (each Regular/Boxed + colors), "Invert over
  images" (filterInvertOver → per-pill per-portion invert over dark tiles via
  js/adaptive-invert.js; the .active pill is never inverted), and "Invert on
  hover" (filterInvertHover; off → hovering a pill suppresses ITS invert only,
  synchronously, so it shows the true hover colour with no flash).
- Tags: Style (Regular/Boxed) + Text/Fill/Outline colors (alpha), radius,
  spacing.
- Project page: columns are fixed 1:1 (NO column-ratio control); Column
  align (top/center/bottom), Gap X/Y; a "Texts" sub-dropdown (text space
  above/below, text max width), a "Dividers" sub-dropdown (divider space
  above/below), and a "Buttons" sub-dropdown holding Back button and
  Play button (Play has a text-field label) — each with Default + Hover
  states (Regular/Boxed + colors) and align/position controls.
- About page: Margin X, Margin Y, Column split, Bio max width, Education
  max width.
- Project List (formerly "Projects"/"Project order"): per-row up/down reorder
  (projectOrder) + a per-row eye toggle to show/hide each project
  (projectHidden map { id:true }; in listLayoutKeys so the gallery rebuilds).
  A hidden project disappears from BOTH the thumbnail list/gallery and the
  title stack (window.PROJECT_HIDDEN checked in visibleProjects()).
- Project Thumbnail Display (parent dropdown) holds three sub-dropdowns:
  - List Display (formerly "Project thumbnails"/"Project list"): Column
    width/position, Thumb
  align, Conformity, Spacing,
  Max thumb h, Column Y (\u00b1400px vertical offset of the whole column from the
  central resting position — shifts the resting thumbs, the active-detection
  center, AND the center marker/connector line together via --list-column-y +
  LIST_COLUMN_Y; in listLayoutKeys so it rebuilds), Hover scale, an "Inactive" sub-dropdown (Opacity, Saturation,
  Blur [SEAMLESS, extends past the image edges — see list-gallery.js], Sharp
  core [0–100% solid-centre of the feather mask], Edge shape [0 = elliptical/
  radial → 100 = rectangular], Tint, Tint strength) and a "Scroll" sub-dropdown (Scroll distance 0.1–10 =
  distance per wheel nudge [window.LIST_SCROLL_SPEED], Scroll smoothing 0–1 =
  momentum friction [window.LIST_SCROLL_SMOOTHING; 0 = immediate/linear, 1 =
  max glide; decoupled from distance — the wheel impulse is normalized by
  (1-friction) so distance stays constant as smoothing changes],
  Infinite scroll toggle [off = finite list with hard top/bottom limits;
  listInfinite is in listLayoutKeys so the gallery rebuilds], Snap to project,
  Snap speed, and Snap time [0–1 responsiveness: high = snaps almost
  immediately after scroll stops, low = long pause first; maps to a 0–600ms
  idle-debounce window in list-gallery.js]), and a "Border" sub-dropdown
  (Show border toggle + Border width px [default 1] + Border color).
  - Gallery Display: Columns, Thumbnail size, Aspect (free|conform), and when
    conform: Aspect ratio (16:9/4:3/3:2/1:1) + Flip ratio; Column spacing,
    Row spacing, Columns X, Columns Y, Hover scale, an "Inactive" sub-dropdown
    (Opacity/Saturation/Blur/Sharp core/Edge shape/Tint/Tint strength, same
    seamless treatment as the list) and a "Border" sub-dropdown (Show border +
    width + color). All sizes/gaps/offsets scale responsively with the window.
  - Switch button: X (from right), Y (from top), Size, Radius, List glyph,
    Gallery glyph, + Default/Hover state styling like Back/Play.
  Tweaks-panel section order: Project List, Project Thumbnail Display
  (List Display → Gallery Display → Switch button), Project titles,
  Center marker, Filter buttons.
- Posters gallery (top-level section; controls the Posters-style static grid,
  js/posters-gallery.js): Columns (default 3), Height conformity (0..1),
  Width conformity (0..1), Hover scale, Gap X, Gap Y, and an "Image order"
  sub-dropdown — per-image up/down reorder (postersOrder) + a ✎ toggle per
  image opening Title + Body fields (postersDescData, keyed by src; shown in
  the left toolbar on hover). Mirrors the playground Clip order UI. Layout
  keys postersCols/postersOrder trigger a preserveScroll rebuild
  (postersLayoutKeys); gaps/conformity/hover relayout live (no rebuild).

Changes persist to the TWEAKS JSON block in index.html via the host
(ASYNC disk write). A SYNC SAFETY NET also mirrors every change to
localStorage immediately (window.persistTweaks), so an edit survives a
refresh even if the disk write hasn't landed yet. On load,
mergePendingTweaks() re-applies any not-yet-persisted edit and self-
heals: each cache entry records the disk value it diverged FROM, so once
the disk catches up (or the block is hand-edited to a third value) the
stale entry is pruned and disk wins. Never breaks hand-edits to the JSON
block.

## Conventions
- Read the relevant files before making changes
- Use surgical str_replace_edit, not full rewrites
- New tweakable value: add key to TWEAKS JSON → handle in
  applyTweaks() → add a control to tweaks-app.jsx
- If a tweak changes layout, add its key to listLayoutKeys, galLayoutKeys,
  or pgLayoutKeys in applyTweaks() so that display rebuilds (preserveScroll)
- Use CSS variables for anything live-tweakable
- Don't add filler content; don't introduce colors outside the palette
- The site is minimalist — keep it minimalist

## Safe-to-hand-edit (download / re-upload)
Text inside the `projects` array (title, year, desc, tags, mini, thumb,
video, content blocks, postersImages [src/title/body], id), the bio strings (BIO_SHORT, BIO_SHORT_ALT,
BIO_LONG), LOGO text, filterDefs labels, tagDefs labels, about-page
text, a project's `play` URL. thumbRatio is optional (auto-measured).
Edit the TWEAKS JSON carefully (valid JSON only). NOTE: newly-added tweak
keys must be written into the TWEAKS JSON block to persist to disk/GitHub — the panel's on-disk save updates EXISTING keys; a key absent from the block lives only in the localStorage mirror (shows in Claude Design, not on GitHub). The Posters order/descriptions were baked into the block for this reason. Don't touch the &lt;style&gt; CSS, script tags, or view structure.
