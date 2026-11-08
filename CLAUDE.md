# Portfolio site project context

A minimalist personal portfolio (Mati Kalter). Deployment target =
GitHub Pages (entry file is index.html). Inspired by jnackash.com,
ellayehudai.com, millermccormick.com, obys.agency. Clean, monochrome,
modern — imagery gets center stage, interface stays quiet.

## Cache busting
Every local script/style reference in index.html carries a `?v=<date>` stamp
(`js/*.js`, `css/mobile.css`, and the two JSX files in the `JSX` array of the
tweaks loader). Reason: a stale viewer can re-fetch index.html while serving
CACHED copies of the scripts — the page then renders with OLD behaviour and no
error, which looks like "my changes didn't save". BUMP THE DATE on all of them
together whenever a script change must be guaranteed to land for a viewer who
already loaded the page.

## Structure
- index.html — design tokens (the TWEAKS JSON block at top), project
  data (`projects` array), filter definitions, layout/CSS, and the
  applyTweaks() function mapping tokens → CSS variables + JS globals
- js/home-intro.js — HOME REEL INTRO choreography (desktop only; returns early
  when window.__MOBILE__). Owns the two stacked home layers and the scroll
  hand-off between them, the reel embed lifecycle, the reel's down-only scroll
  marker. (The full-page INVERT clone layer was removed.) Public API window.HomeIntro.
  {enter, leave, refresh, syncInvert (no-op), progress, lift, set(p)} — enter/leave
  are called from portfolio.js's applyRoute, refresh from applyTweaks. Also
  writes --intro-p + html.intro-live / intro-away (drives the toolbar slide-ins
  and the bio exit), and owns the reel iframe's resize-smooth scaling
  (syncReelScale).
  Relies on ListGallery.{atTop, stop} (list-gallery.js) for the hand-back. See
  "## Home reel intro".
- js/list-gallery.js — vertical project list (home view): snap-to-
  center scroll, center-marker glyph, hover scale + neighbour push,
  inactive opacity/saturation/blur. Auto-measures each thumb's real
  aspect ratio from the image on load (thumbRatio is only a hint).
  Each thumb is .list-item > .list-thumb > .list-thumb-media > img/video.
  INACTIVE BLUR is SEAMLESS (extends past the image edges with no hard
  seam): the inner img/video gets a shape-morphing SVG alpha mask
  (--list-inactive-mask, built in applyTweaks: an SVG rounded-rect with a
  gaussian-feathered edge — solid-centre fixed at 100%, Edge shape =
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
  On a preserveScroll rebuild build() clears
  state.activeId so the next updateActive() tick RE-FIRES onActiveChange,
  re-seeding the mini description + tags immediately (e.g. when switching
  back from the Gallery display) instead of waiting for a scroll. On resize the
  list RELAYOUTS IN PLACE (relayout(): updates each thumb's width/height + snaps,
  no innerHTML rewrite) so &lt;video&gt; thumbnails (e.g. Playground) aren't torn down
  + re-decoded (which flickered); it falls back to a full build() only when the
  item set or copy coverage changed. build() also applies the active state
  SYNCHRONOUSLY (updateActive() before the first paint, not just in the rAF tick)
  so the centered thumb never flashes the inactive dim/desaturate styling during
  a rebuild/resize.
  INFINITE by default (wrap-around loop); when LIST_INFINITE is false
  it renders ONE copy with hard top/bottom limits (item 0 centered at
  top, last item at bottom) and clamps scrollY to [snapMin,snapMax].
  Toggled live by the "Infinite scroll" Tweak. The center marker can sit
  on the LEFT (default) or RIGHT of the active thumb (MARKER_ALIGN; the
  gap shifts to the chosen side), and an OPTIONAL 1px connector line
  (MARKER_LINE_SHOW / MARKER_LINE_EDGE) runs from the marker's CENTER (+/-2px
  further in, so it tucks under the glyph with no gap) to the left/right edge
  of the active title in the title stack — drawn each frame on
  #list-marker-line (position:fixed) by updateMarkerLine() so it tracks both
  the marker glide and the title-stack position. Rendered as height:0 +
  border-top (not a filled height:1px box) with its Y rounded to the nearest
  whole CSS pixel before writing — matching the crisp always-1px rendering of
  the panel's static border-right instead of anti-aliasing thicker at
  non-integer zoom (windowed/Present mode). The "Touch toolbar edge" Tweak
  (markerLineToEdge → MARKER_LINE_TO_EDGE) pulls the line's LEFT end out to the
  toolbar's edge divider (x = --left-w, read per frame with an isNaN guard, NOT
  `|| 340`, so a collapsed 0 is respected), so it spans the gap between that
  divider and the title stack.
- js/gallery-display.js — ALTERNATE home thumbnail layout (List ⇄ Gallery,
  toggled by the top-right display-switch button; mode persists in
  localStorage as `displayMode`). GalleryDisplay.{build, relayout, destroy,
  scaleFactor, refreshInfo}. ONE ORDER — ROW ORDER (the old Column order was
  removed): a flex COLUMN of .gal-row rows that scrolls HORIZONTALLY, tiles
  flowing LEFT→RIGHT then down to the next row (row = floor(k/perRow),
  perRow = ceil(n/rows)). The stage gets .stage-row (overflow-x:auto).
  Tweaks: GALR_ROWS/GALR_THUMB_SIZE/GALR_COL_GAP/GALR_ROW_GAP/GALR_X/GALR_Y/
  GALR_ROW_OFFSET/GALR_COL_OFFSET/GALR_CONFORMITY + a row-align
  (top/center/bottom, --gal-row-align) + the shared GAL_HOVER_SCALE. Aspect
  (galConform + galAspect 16:9/4:3/3:2/1:1 + galAspectFlip): CONFORM = every
  tile the chosen ratio (object-fit:cover); FREE = native aspect, and the
  CONFORMITY slider blends 0..1 on HEIGHT (0 = shared width / relative heights,
  1 = fill row height). Per-tile spacing is a margin (margin-right --gal-cgap),
  NOT flex gap. EVERY-OTHER OFFSETS: alternating rows/columns get a stamped
  .off-row/.off-col class offset via position:relative top/left (NOT transform —
  a transform, even 0px, creates a stacking context on half the tiles that traps
  their .gal-info text and lets neighbouring thumbnails paint over it; relative
  offsets are visually identical with no layout shift and no stacking context)
  by --galr-row-offset/--galr-col-offset (±200px); the offset amounts are SCALED
  by scaleFactor() so offset tiles keep their relative position as the window
  scales.
  RESPONSIVE like the list: thumb sizes / gaps / X offset / info X+Y are
  reference-width values scaled by scaleFactor() = currentContentW /
  fullContentW (reads the ACTUAL panel width --left-w, never upscales past 1) so
  tiles keep size RELATIVE to the content section — and, since --left-w drops to
  0 when the toolbar collapses, they ENLARGE to fill the freed space; the
  gallery-stage's `left` anchors to --left-w (transitioned 0.42s) so the stage
  expands as the panel slides away. The Y offset (--galr-y) is NOT scaled —
  FIXED px from the window top (like --filter-y). On resize it RELAYOUTS in
  place (CSS size updates, no innerHTML rewrite) so <video> tiles aren't torn
  down/re-decoded; falls back to a full build only if the DOM can't map (row
  count / project set changed).
  SCROLL — ONE rAF engine (state object S with pos/target/vel/mode) drives the
  stage's scrollLeft for BOTH the wheel and the click-drag, so nothing snaps per
  event. THREE modes:
    · 'chase' (wheel) — a near-critically-damped SPRING pulls pos toward an
      accumulating target: vel += (target−pos)·k; vel ·= d, with
      k = 0.26·0.03^smoothing and d = 1 − 1.55·√k. Velocity RAMPS UP while the
      wheel feeds it and keeps rolling AFTER the input stops, coasting to a soft
      stop — the organic feel a plain exponential lerp can't give (that only ever
      decelerates). window.GAL_SCROLL_SMOOTHING 0 = snappy, 1 = ~1.2s glide.
    · 'drag' — exponential chase (vel = (target−pos)·0.3), no overshoot, tracks
      the cursor.
    · 'coast' — entered on drag RELEASE: no target, just friction
      (vel ·= 0.88 + 0.08·smoothing), so a flick throws the grid and it drifts
      to rest.
  Drag details: mousedown preventDefault + body user-select:none (so it can't
  highlight the toolbar bio, matching the list), LEFT-button only, cursor stays a
  normal pointer, a >4px move suppresses the click (capture-phase swallow) so a
  drag doesn't open a project; every mousemove checks e.buttons&1 and a window
  'blur' ends the drag. The grid carries trailing whitespace past the last tiles
  (padding-right 80px).
  HOVER INFO (centered overlay, NOT sliding): hovering a tile appends a .gal-info
  panel (title + mini + tags) absolutely-positioned to fill that tile and fades
  it in CENTERED OVER the thumbnail (no reflow). Info text paints above ALL
  thumbnails: .gal-info is z-index:20 and NOTHING between it and the root is a
  stacking context (no z-index on .gal-item.has-info — has-info is a bare
  marker; offsets are relative top/left) so text beats every z:auto image even
  in always-show mode. Moving off any tile / leaving the grid hides it (hideInfo).
  The info block is full-tile-WIDTH so text-align governs every line
  deterministically; a single title word WIDER than the tile is fixed by
  fitGalInfoText() — CSS text-align is ignored once an unbreakable word overflows
  (always spills right), so it pins text-align:left + a negative text-indent
  (right → shift fully left, center → half) to align the correct edge without
  changing the element box. Info Tweaks: galInfoAlign (left/center/right — title
  text-align, mini text-align, AND tag-row justify-content), galInfoX/galInfoY
  (--gal-info-x/y translate relative to tile center, scaled), galTitleSize/
  galTitleLeading (--gal-title-size/--gal-title-leading)/galMiniSize/galTagSize,
  per-part visibility toggles galInfoTitle/galInfoMini/galInfoTags (gate
  infoInnerHTML), and galInfoAlways (persistent .gal-info-always over EVERY tile,
  not just on hover — refreshInfo() reconciles them). PER-PROJECT nudge:
  galInfoPos is a {id:{x,y}} map applied as --gi-px/--gi-py (scaled), composed on
  top of the global Position X/Y. (The old "Invert over thumbnails" option is
  GONE — the gallery no longer registers targets with js/adaptive-invert.js.)
  THREE STATES via CSS :has(): nothing hovered → EVERY tile INACTIVE
  (--gal-inactive-*); a tile hovered → that one HOVERED (--gal-hover-*), all
  OTHERS UNSELECTED (--gal-unsel-*). Each state has Opacity / Saturation / Blur /
  Edge shape / Tint / Tint strength.
  ANTI-FLICKER (why random thumbnails used to blink): the per-state look is
  delivered as CHEAP properties only.
    · filter — applyTweaks' galFilter() emits the literal `none` whenever the
      state is a no-op (saturation 1 + no blur). A live filter isolates every
      tile into its own paint group and those get re-rasterised as tiles cross
      the scroller edge.
    · edge shape — a plain border-radius PERCENTAGE (galRadius(): shape 100 →
      0%, shape 0 → 50%) instead of the old SVG mask-image. That mask was a
      gaussian-filtered SVG Chrome had to raster once per tile SIZE and re-raster
      whenever it evicted the cache — the tile paints blank for that frame.
      With the solid centre fixed at 100% the mask never actually feathered, so
      border-radius (which img/video/canvas all clip to) is pixel-identical.
    · tint — the .gal-thumb::after multiply layer forces a blended compositing
      pass on every tile, so --gal-tint-display switches it to display:none when
      all three tint strengths are 0.
  Shares window.__thumbRatioCache with list-gallery.js.
  VIDEO THUMBS (Playground's mp4 — the only one) render as a <canvas>, NOT a
  <video>: a GPU-composited <video> shows a flickery 1px dark edge seam; a canvas
  paints like an <img>. ONE hidden muted looping <video> per unique clip lives in
  #gal-vpool (near-invisible, NOT display:none which would stop decoding);
  drawVideoTiles() copies the current frame to each gal-vthumb canvas per rAF
  (the source element + 2d context are cached on the canvas node, not re-queried
  per frame; startVideoTiles seeds the pool at build; destroy stops the loop +
  pauses the pool; a 500ms watchdog interval keeps frames coming in rAF-throttled
  embedded contexts — but it is armed ONLY where rAF has proven starved:
  probeRAF() samples the tick count over a second at build (and again on
  visibilitychange), arms the interval if fewer than 5 frames landed and disarms
  it once rAF is healthy, so a normal tab carries no second timer). The canvas tile's WRAPPER gets translateZ(0) — its own
  compositing layer — so per-frame drawImage invalidations don't force every
  other thumbnail on the shared page layer to re-rasterise. Same technique as
  playground-gallery.js.
  The two vertical scroll-affordance glyphs are always hidden in gallery mode
  (hideScrollMarkers()) since the gallery scrolls horizontally.
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
  `postersImages` array, or an embedded `posters` content block (the
  Illustrations page — the standalone Posters project was removed). Row-major: images chunk into
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
  shown in the LEFT TOOLBAR on hover, BELOW the project description (+ buttons) —
  reusing the SAME #pg-desc slot the playground uses (see "## Playground /
  posters hover description"). Order + per-image descriptions come from Tweaks (see
  Posters gallery), keyed by src; Tweak values are AUTHORITATIVE even when
  empty, else fall back to inline title/body in postersImages. Real aspect
  ratios auto-measured (window.__postersRatioCache). Relayout is cheap (no DOM
  rewrite) so it runs live on tweak drags; a ResizeObserver on the mount +
  a post-build double-rAF re-fit catch the width change when the vertical
  scrollbar appears on cached loads (plain window 'resize' doesn't fire for
  that). RUNAWAY GUARD (needed once the grid could be EMBEDDED in a content
  page): relayout() changes the gallery's HEIGHT, which the observer also
  reports, and px tile widths summing to the available width can round a hair
  wider than the mount — enough to grow a content-sized mount, re-fire the
  observer, and peg the main thread (which also ate keypresses, e.g. the ` panel
  shortcut). So the callback acts only on a real WIDTH change (>1px, roPing()),
  coalesces to one rAF, and never re-enters while a relayout is in flight
  (state.laying); the embedded mount is also clamped in CSS
  (.proj-block.posters-gallery { min-width:0; max-width:100%; overflow:hidden })
  so content can't grow it. PostersGallery.{build, relayout, unmount, rebuild}.
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
  glyph paints once. Defaults to `mask` rather than clip-path (clip-path clips
  pointer events, which broke pill hover + made :hover oscillate) and only
  switches to clip-path for pointer-events:none targets whose ink overflows
  their box — see OVERFLOWING TEXT below; base bands cover
  everything-except-the-hole, or hideMask() fully hides the base when the
  overlap covers the whole element. overlapRects() returns ONE rect PER dark
  tile the text crosses (NOT a union — a union hole would hand the white page
  gap between two dark tiles to the inverted copy, painting white-on-white and
  swallowing that chunk of a long title); the base shows the complement via
  iterative rect subtraction (complementRects/subtractRect), so text between
  dark tiles stays crisp normal-colour text. Only tiles whose OWN project has
  `dark:true` count (reads closest [data-id]) so light tiles get
  no copy/seam — correct in gallery mode where the text may sit over a
  different tile than the hovered one. reconcileGalInfo excludes `.ai-copy`
  when querying targets — the difference-blend clones keep the original's
  class, so a bare query would re-register the CLONES as targets each refresh
  (copies-of-copies, masks overwriting each other → visible churn/flicker). FILTERS are registered PER PILL (each
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
  .{refresh, ping, update, dropGalInfo}; refresh() reconciles the per-pill
  targets. (The gallery hover-info invert was REMOVED — gallery-display.js no
  longer registers .gal-info-title/.gal-info-desc targets; reconcileGalInfo and
  dropGalInfo remain for teardown safety. If it is ever brought back, note that
  reconcileGalInfo must keep excluding `.ai-copy` when querying.) OVERFLOWING
  TEXT: Chrome bounds ALL mask painting to the element's border box
  (mask-clip:no-clip parses but is NOT honoured), so any mask cuts off a title
  word wider than its tile the moment invert applies. applyTarget therefore
  measures the text's real ink rect (inkRectFor unions the box with a Range over
  the contents) and, when ink overflows the box, switches BOTH base + copy from
  masks to clip-path: path() rect layers — clip-path shapes may extend beyond
  the border box and reveal overflowing ink. Safe because gal-info/mini targets
  are pointer-events:none; the interactive filter pills never overflow so they
  always stay on masks (clip-path would clip their hit-testing — the original
  reason masks were chosen). setMask/setClip each clear the other mode's
  properties. Called from
  renderMiniInfo, the filter click handler, and gallery-display.js's showInfo/
  refreshInfo; dropGalInfo() tears down the gallery-info targets + copies on
  unhover / rebuild.
- js/media-power.js — MEDIA POWER MANAGEMENT (desktop + mobile). Keeps the
  number of LIVE video decoders proportional to what is on screen; nothing a
  viewer can see ever pauses. (1) VIEWPORT GATING: a timer-debounced RECT PASS
  (scroll [captured, so inner scrollers count] / resize / wheel / touchmove,
  plus a few settle passes after each scan for late-loading images) with a FULL
  viewport of slack pauses a project-page video once it's more than a screen
  away and resumes it a screen before it can be seen — without this, a page like
  lightricks/consumania/bloom mounts EVERY localvideo
  + richvideo at once as autoplay-muted-loop and every below-the-fold clip
  decodes forever. (2) TAB SUSPEND: on `visibilitychange` everything pauses and
  resumes where it was. NOT wired to window `blur` on purpose — an unfocused but
  VISIBLE window must keep playing. The gating is a rect pass and NOT an
  IntersectionObserver on purpose: IO delivery rides the rendering lifecycle,
  which is starved in offscreen / embedded preview contexts (same reason the
  gallery keeps a watchdog and mobile-app.js gates its embeds on a rect pass) —
  IO simply never fires there and every clip stays live. For the same reason the
  debounces are setTimeout, never requestAnimationFrame. EXCLUDED (owned
  elsewhere): .lp-gif-media (HeroLoop parks the off copy at playbackRate 0,
  which is not `paused` — suspend calls HeroLoop.pause() / resume calls
  HeroLoop.applyMode() instead), #gal-vpool + #pg-vpool source videos (the
  galleries own their lifecycle; suspend still pauses them), and list/gallery
  thumbs (on screen by construction). Auto-pauses are stamped data-mp-auto so a
  USER pause is never undone and the richvideo control set doesn't flash its
  paused state — portfolio.js + mobile-app.js check that stamp in their `pause`
  listeners. Rescans on a debounced MutationObserver (route changes,
  gallery rebuilds) and drops detached nodes from its tracked list.
  window.MediaPower.{scan, suspend, resume}.
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
  phone frames. Runs two ways: STANDALONE (opened directly — tweaks reach only
  the LS mirror, and an "Enable saving" button arms nested mode), or NESTED
  inside index.html via ?nested=1 ("Saving ✓" — see MOBILE HARNESS MODE below).
- assets/<project-id>/<filename> — project images

## Mobile version (phones only)
Phones get a SEPARATE, more minimal experience; iPad / tablets + desktop keep
the existing responsive desktop site. Still ONE deployable index.html.

DETECTION — inline <head> script in index.html, runs before any body script:
sets window.__MOBILE__ + <html>.is-mobile from UA + pointer:coarse + width,
treating iPad / Android-tablet as DESKTOP. Override per-load with
?device=mobile|desktop (NO localStorage write, so it can't bleed from the
preview iframe into a real desktop tab). PERSISTENT OVERRIDE: localStorage
`mk.previewDevice` + `mk.previewDeviceAt` — honoured ONLY when the document is
FRAMED (a visitor loads it top-level) AND less than 12h old, so an editor-only
convenience can never become a state a visitor is stuck in; the on-screen badge
clears it in one click. Values:
  'mobile'  — index.html renders the mobile app directly.
  'harness' — MOBILE HARNESS MODE: index.html hides the site and hosts
              `Mobile Preview.html?nested=1` in a full-bleed iframe instead.
WHY harness mode exists — THE SAVE PATH: the host writes tweak values into the
EDITMODE block of whichever file is OPEN. A panel running in Mobile Preview.html
as its own open file therefore can never write m* keys into index.html; they only
reach the localStorage mirror. Nested inside index.html, the chain is:
phone frame's MobileApp.setTweak → posts __edit_mode_set_keys to its parent (the
harness) → the harness, when NESTED, ALSO forwards it to ITS parent →
index.html's relay forwards anything that didn't come from the host UP to the
host → the host writes THIS file. Host messages (__activate/__deactivate) are
relayed DOWN into the harness. So mobile tweaks auto-save exactly like desktop
ones, with no switching between files — the app's edit mode must be ON, same as
desktop. The harness's "Enable saving" button arms the flag when it is running
standalone, and shows "Saving ✓" (disabled) when it is nested. The phone frames
load ?device=mobile, and a ?device= param always beats the stored flag, so they
render the app and never recurse. On mobile, css/mobile.css hides
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
  LOGO SHAPE: an optional blank shape (.m-logo-shape-blur + .m-logo-shape-fill)
  pinned BEHIND the logo text on the same fixed overlay, auto-sized to the
  text's own box + extra Width/Height px (centered), default a white sharp-
  cornered rectangle slightly larger than the logo. Two SIBLING layers (not
  nested) so a `filter`/`transform` ancestor can't open a backdrop root that
  cuts the blur off from the page: .m-logo-shape-blur is a bare backdrop-filter
  (blurs the CONTENT underneath like an adjustment layer, independent of the
  fill's Opacity), .m-logo-shape-fill is the coloured tint with its own
  Opacity. Roundness = border-radius % (0 = rect → 50% = oval per-axis); Edge
  blur = a `filter` on each layer (feathers a flat-fill rect's edge, no mask).
  Tweaks (Logo shape section): mShapeShow/mShapeW/mShapeH/mShapeRadius (mapped
  ÷2 → %)/mShapeColor/mShapeOpacity/mShapeBlur (content behind)/mShapeEdgeBlur.
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
mLabelAlign, mFilterSize/Align/Gap, mDivShow, mDivSpace, mShapeShow,
mShapeW/H/Radius/Color/Opacity/Blur/EdgeBlur). applyMobileTweaks()
maps them to
--m-* vars; desktop keys are untouched; content (projects/bio/labels) lives
once. Two PARALLEL panels, same keys + persistence:
  - IN-PHONE panel (mobile-app.js) — shown when viewing index.html?device=
    mobile directly; owns the host protocol + backtick toggle.
  - HARNESS panel (Mobile Preview.html) — shown when reviewing via the
    harness; lives in the gray MARGIN (phones shift right), drives the PRIMARY
    phone via MobileApp.setTweak and relays edits to the sibling frame — and,
    when NESTED, up to index.html so they reach disk.
Both have UNDO/REDO (↶/↷ + ⌘Z / ⇧⌘Z, one snapshot per gesture, cap 50) and
persist via window.persistTweaks (LS mirror) + the host __edit_mode_set_keys
disk write. NOTE: new m* keys must be written into the TWEAKS block to reach
disk; the LS mirror keeps standalone-harness edits alive across refresh. To save
mobile tweaks to the FILE / GitHub, run the harness NESTED — set
mk.previewDevice='harness' (the harness's "Enable saving" button) and open
index.html, which then hosts the same phone-frame preview and IS the host's edit
target. Opened standalone, Mobile Preview.html is its own edit target and m*
keys never reach index.html.

## Layout
Left panel = fixed identity bar. From top: LOGO, then the SOCIAL ICONS
(.lp-social — Instagram/LinkedIn/email) and the ABOUT LINK (.lp-about) as TWO
SEPARATE absolutely-positioned blocks, each with its own Y (socialY / aboutY →
--social-y / --about-y) and horizontal align (socialAlign / aboutAlign →
--social-align / --about-align, justify-content values; defaults left / right),
an optional
horizontal divider, then the SHORT bio, and an optional HERO-IMAGE gif
pinned to the panel bottom. The SOCIAL block's Y is measured from the WINDOW
BOTTOM by default (socialAnchor 'bottom' → html.social-bottom swaps `top` for
`bottom`, so it holds its distance from the window edge as the window resizes);
Anchor = 'top' restores the old panel-top offset. The social icons lay out as a horizontal ROW or a
vertical STACK (Tweak socialVertical → html.social-vertical flips .social-row to
flex-direction:column, with align-items following --social-align so the stack
lines up with the other blocks); --social-gap sets the spacing either way. These blocks are ABSOLUTELY positioned on the
home/about view, each with its OWN independently controllable Y position
(Logo Y, Social Y, About Y, Divider Y, Bio Y, and Gif Y-from-bottom — all in
Tweaks → Toolbar). The divider has its own show/hide toggle + Y. The
panel's inner inset is controlled by Margin X (horizontal padding, also
feeds --left-pad so every absolute block + Back/Play tracks it); there is
no toolbar Margin Y.

EDITABLE LABEL TEXT (Tweaks → Toolbar): Logo → "Text" (logoText → window.
LOGO_TEXT; empty = the authored LOGO.idle/hover text — applyTweaks writes the
idle + hover strings SEPARATELY, so clearing the field reverts and also resets
document.title; skipped for an image logo). About link → "Text" (aboutLabel,
default "+ about"; the "× close" link and its closeLabel control were REMOVED —
the about page has no close link) — the WHOLE string including the glyph is editable; linkLabelHTML() (portfolio.js) renders a
short non-alphanumeric FIRST token in the smaller/lighter glyph treatment and
otherwise prints the string as-is. aboutLinkHTML()/closeLinkHTML() are exposed on
window so applyTweaks can re-render the live link (matched via
.about-link[data-kind="about"|"close"]).

BIO — "Reveal on logo hover" (bioLogoReveal / html.bio-logo-reveal) was REMOVED
(Oct 2026); the bio's visibility is governed by "Show only on reel" instead.

LOGO HOVER COLOUR: the hover wordmark (.logo-hover) takes
var(--logo-hover-color, var(--highlight)) — Toolbar → Logo → Hover color (see
"## Toolbar colours + slide-in entry"). Do NOT put a `color:` in
LOGO.hover.style — it renders as an inline style, beats the stylesheet, and
pinned the hover to a hard-coded #8089ef no matter what Highlight was set to.

LOGO — SIZE MODE (Tweak logoFit → window.LOGO_FIT; Toolbar → Logo → "Size
mode": fit | font). In FONT mode the logo uses the Title type style's own
--title-size (and plain --logo-y) — but fitLogo() still CLAMPS it: if that size
would overflow the toolbar's inner width it shrinks to fit, so the logo never
escapes the margins. In FIT mode (default) the behaviour below applies.
LOGO — FIT-TO-WIDTH: the title logo always fills the toolbar's inner width
on ONE line. fitLogo() (in index.html) measures the text's natural width at
the Title-size reference and sets the actual font-size so it spans the
available width; weight/family/leading/tracking stay editable, only size is
derived. It is BOTTOM-ANCHORED (shrinking pushes it DOWN so the gap to the
Social+About block is constant; the top still tracks --logo-y from the panel
top) and SIZE-CAPPED at the full-size value (so the wide expanded drawer
doesn't grow it past the window top). Horizontal placement comes from the Align
tweak (logoAlign → --logo-align, left/center/right, default center — visible in
font mode or whenever the logo is narrower than the margins). Re-fits on resize,
toolbar collapse/expand, tweak change, and webfont load. A fit pass that can't
MEASURE yet (panel not laid out, or a logo IMAGE still decoding → scrollWidth 0)
RETRIES on the next frame (capped ~60 frames) and keeps the size already applied
instead of clearing it — clearing was what left the logo unfitted on a cold load;
there are also re-fits on window `load` and on any .logo-zone <img> load.

RESPONSIVE TOOLBAR: the left panel + main content scale together with window
width. updateResponsiveLayout() (index.html) computes the panel width as a
constant FRACTION of the window relative to a reference width (the screen
width, or the manual "Full-size width" tweak tbRefW). It sets TWO vars:
--panel-w = the proportional width (NEVER 0; galleries + the column lay out
against this so positions stay window-relative), and --left-w = the panel's
ACTUAL on-screen width (drops to 0 when collapsed so main content fills the
window). BOTH are rounded to WHOLE PIXELS: a fractional panel width puts the
panel's border-right and #panel-edge-line on a half pixel, which antialiases
into a 2px smear that flickered and changed thickness as the window scaled.
The 1px edge divider is toggled by Toolbar → "Edge divider" (tbEdgeShow →
--panel-edge, transparent when off — the border box is kept so nothing shifts).
Below the COLLAPSE THRESHOLD — a percent of the reference width (Tweak
tbCollapseAt → window.TB_COLLAPSE_AT, Toolbar → Collapse → "Collapse
below", default 50%) — the toolbar COLLAPSES: .site gets
.tb-collapsed, the panel becomes a drawer that slides off-screen
(translateX(-100%)) at its real width, and two fixed buttons appear at the
vertical center — #tb-expand (left, slides the 100vw drawer in via .tb-open)and #tb-minimize (right, slides it out). The drawer is z-index 300 + toggles
310 (ABOVE the lightbox at 200) so it expands over expanded images/videos.
The toggles' EDGE OFFSET is per-context: --tbtoggle-x (tbToggleX) covers the
home/about view in BOTH states, while a PROJECT page gets its own value per
state — --tbtoggle-x-proj (tbToggleXProj, collapsed) and --tbtoggle-x-proj-open
(tbToggleXProjOpen, expanded drawer) — each falling back to --tbtoggle-x.
Scoped in CSS with `.site:has(#project-view.visible)`, so no extra route class.
A live RESIZE that EXPANDS the toolbar does NOT animate the slide:
`.site.tb-noslide .left { transition: none }`, added by
updateResponsiveLayout() for ~150ms whenever the resize clears .tb-collapsed.
Reason: translateX(-100%) re-resolves against the panel's own width every
frame, and during a resize that width is itself being dragged, so the
transition interpolates against a moving target — the panel and the blocks
inside it (logo, social, about) visibly stutter and hang mid-flight before
snapping into place. COLLAPSING keeps its slide-away, and button-driven
open/close still animates through animateDrawer().
Clicking the logo/Back/About (any navigation, via applyRoute) removes
.tb-open so the drawer closes on nav. On the ABOUT page the expand button
instead routes home (goHome) and leaves the toolbar collapsed. Back/Play
buttons use --btn-track-w (=100vw in the expanded drawer, else --left-w) for
center/right alignment so they don't fly off-screen when --left-w is 0 — the
PLAY button only. (The BACK button and everything below about its position /
style was REMOVED in Oct 2026 — kept here only as history for the inert CSS.) It is positioned by
an X FROM THE TOOLBAR'S RIGHT EDGE (bigger = further left), with its own value
for the expanded drawer: --back-x (backX) and --back-x-open (backXOpen, falling
back to --back-x). Anchoring right keeps it a fixed distance from the content
divider as the panel scales. NOT via the `right` property — .lp-back is
position:fixed, so `right` resolves against the VIEWPORT, not the toolbar;
instead the box's right edge is placed at (track − X) with translateX(-100%),
the track written LITERALLY in each rule (--left-w docked, 100vw in the
expanded drawer) rather than read from the shared --btn-track-w — that var is
defined on .lp-back only in the expanded-drawer rule, so any cascade change
that stops it applying silently falls back to --left-w (0 while collapsed) and
throws the button off-screen to the left. The old left/center/right keywords
couldn't express "just
past the margin", and center/right made the button jump when the drawer changed
width. The Back button also gets its OWN
Top offset in the expanded drawer (Tweak backTopOpen → --back-top-open, falling
back to --back-top) since the full-width overlay often wants a different
vertical spot than the narrow docked panel.

BACK BUTTON STYLE — TWO INDEPENDENT SETS, one per context: docked toolbar
(--back-* vars, keys back*) and expanded drawer (--backo-*, keys backOpen*).
Each set carries ONE regular/boxed switch shared by BOTH states (backStyle /
backOpenStyle — Default and Hover are always the same kind of thing, and
picking Boxed is what reveals Fill / Outline / corner radius / box shape for
both states at once), its own Default + Hover colours, corner radius
(backRadius / backOpenRadius) and box shape. The expanded set FALLS BACK to the
docked value key by key, so it tracks the docked look until deliberately
changed. Panel: Project page → Buttons → Back button → Style → Normal toolbar /
Toolbar expanded (BackStyleSet in tweaks-app.jsx); Position has the same two
sub-dropdowns. The back button no longer goes through setPill(), and the old
per-state backDefStyle/backHovStyle keys are migrated (backDefStyle seeds the
shared switch).
  HOW THE TWO SETS SHARE ONE PAINT RULE: duplicating every rule per context
would double the :hover / square / conform logic, so .lp-back re-exposes its
inputs as local --bk-* vars — the base rule points them at --back-*, the
`.site.tb-collapsed.tb-open .lp-back` rule re-points the same names at
--backo-*, and the paint rules read only --bk-*. Square-vs-conform is likewise
a var pair (--bk-w/h plus the per-state padding, both resolved in applyTweaks)
rather than a class, which would have needed a :not() on the drawer state and an
!important to beat the padding.
BOX SHAPE (Boxed style only) — both the Back button and the collapse toggles
carry the same square/conform choice, each defaulting to how it already looked:
  · Back button: per STYLE SET (see below) — backBoxShape / backOpenBoxShape,
    default 'conform' = shrink-wrap the label via the boxed padding; 'square' =
    a fixed --back-w/h box (backBoxSize / backOpenBoxSize) with padding forced
    to 0 so it can't stretch. Resolved in applyTweaks, NOT via a class, and only
    while the set is Boxed — square sizing on a Regular (text-only) button would
    force it into a 44×44 box.
  · Collapse toggles: tbToggleBoxShape (default 'square' = the fixed
    --tbtoggle-box box, Tweak tbToggleBoxSize) / 'conform' → html.tbtoggle-conform
    sets width/height back to auto and applies the state's padding instead.
    tbToggleSize (--tbtoggle-size) is the GLYPH size in BOTH modes, independent
    of the box: they used to be one control (box = the value, glyph = 42% of
    it), so growing the glyph also grew the box. The stored tbToggleSize was
    migrated 44 → 18 when they split, preserving the old rendering.

The optional HERO-IMAGE gif (assets/playground/
Jumpdude-b.gif) sits BENEATH the other blocks (z-index:0; logo/links/bio/
divider are z-index:1) so they always render above it. The gif is a LINK to
the Playground (#/project/playground) with a hover scale-up (Tweak gifHoverScale
→ --gif-hover-scale) whose hoverable/clickable area is limited to a centered
inner 50%×50% hotspot (.lp-gif-hot; the <a> itself is pointer-events:none).
The gif has independent IDLE and HOVER visual states (Tweaks → Toolbar →
Hero Image → Idle / Hover sub-dropdowns), each with Blur, Hue (hue-rotate —
shifts colourful shapes' hues while leaving white/black untouched, since
white has no saturation), Opacity, Saturation, Edge fade + Corner roundness (an
SVG rounded-rect
blurred alpha mask, --gif-mask / --gif-mask-hover, that feathers the blur so
it dissolves seamlessly past the image box instead of hard-clipping). The
blur + mask + opacity live on the <a> WRAPPER (not the <img>): replaced elements
clip their own filter bleed to the content box, leaving a hard edge. Hover adds
Scale and an "Invert hue" toggle (hue-rotate 180°, composes with the hover
Hue). Idle vars: --gif-blur/--gif-hue/--gif-opacity/--gif-sat; hover vars:
--gif-blur-hover/--gif-hue-hover/--gif-opacity-hover/--gif-sat-hover/
--gif-invert-hover.

HERO IMAGE — the toolbar hero is a SINGLE clip (assets/playground/
LTX_Shapes_Single_1080.mp4 — the SAME file the Playground grid and the
Lightricks page reference; it lives in ONE folder only), a muted <video> with
independent idle + hover states
(no cycling). gifHTML() (portfolio.js) builds <div class="lp-gif"><a>
<div class="lp-gif-stack"> with TWO identical stacked <video class="lp-gif-media
... lp-gif-big"> copies, so all Hero Image controls (size via --gif-size,
blur/hue/mask/opacity/sat/hover via the ".lp-gif a" rules) apply. SEAMLESS LOOP
(initHeroLoop(), called after setLeftHome/setLeftAbout render): native <video
loop> stalls ~1 frame at the wrap while it re-decodes the t=0 keyframe (a
GENERAL browser behaviour, not clip-specific). The clip's last frame is authored
to flow into its first, so the two copies HAND OFF at the seam. TWO things make
the hand-off frame-exact:
  1. The reveal is SYNCHRONOUS. The earlier build awaited incoming.play()'s
     PROMISE before swapping is-current — and while it waited the outgoing copy
     ran off its end and sat frozen on its last frame. THAT wait was the
     one-frame freeze; nothing else was wrong.
  2. The parked copy is held with playbackRate = 0, not pause(). A rate-0
     element stays in the PLAYING state, so restoring rate 1 resumes on the very
     next frame, whereas play() after a real pause() spins the decode pipeline
     back up over several frames. Feature-detected (RATE0); falls back to
     pause/play where rate 0 is refused.
The swap fires from requestVideoFrameCallback on the copy that's ON SCREEN, the
instant its final frame has been presented (frame duration is LEARNED from
consecutive mediaTime deltas, so it adapts to the clip's real fps) — so the next
frame the compositor shows is the other copy's frame 0: exactly the authored
seam. The outgoing copy is reset to 0 WHILE HIDDEN. There's an rAF-poll fallback
where rVFC is missing (Firefox) and an 'ended' safety net; neither copy uses
native loop.
FREEZE WHEN IDLE (Tweak gifFreezeIdle → window.GIF_FREEZE_IDLE, a toggle at the
top of Tweaks → Toolbar → Hero Image): OFF = the clip plays continuously in both
states. ON = the idle state HOLDS its current frame and hovering .lp-gif-hot
resumes playback FROM THAT FRAME (never a reset); unhovering holds again. Same
controller — pause()/play() on the loop, exposed as window.HeroLoop.{play, pause,
applyMode, destroy}; applyTweaks calls HeroLoop.applyMode() so the toggle takes
effect live, and initHeroLoop() destroys the previous controller before building
a new one on each toolbar re-render.
Tweak keys: gifShow/gifY/gifSize/gifAlign (LABELLED
"Show image / Image Y / Image size / Image align") + gifFreezeIdle. The
logo/Social/About positions are kept IN SYNC
between the home view and the about page. On a project page the left
panel shows title / year / tag chips / desc, then the BUTTON ROW (.lp-btns — see
"## Project buttons") IN FLOW below the description, then (gallery pages only) the
#pg-desc hover description, (no Back button — the logo + its route glyph go home; divider + gif are
absent there). The project TITLE (.lp-proj-title) is
HYPHENATED so a single long word — "Illustrations" in a narrow window — breaks
across lines inside the toolbar margins instead of overflowing the panel, WITH
A VISIBLE HYPHEN: CSS hyphens:auto alone prints no hyphen at big type in a
narrow panel (no dictionary syllable break fits, so the browser falls back to
overflow-wrap and breaks mid-word silently), so softHyphenate() (portfolio.js,
mirrored in mobile-app.js for .m-proj-title) inserts a SOFT HYPHEN (U+00AD)
between every character of words 8+ letters long — a break opportunity at every
character, and the browser draws the hyphen wherever it breaks. Invisible when
the word isn't broken. An empty
`year` ('') is skipped (no empty line). Right panel = home view
(centered vertical infinite thumbnail list OR the multi-ROW horizontal Gallery
display — see Display modes) OR a project page OR the about page.

DISPLAY MODES (home view): the right panel's thumbnails render as EITHER
the List display (js/list-gallery.js) or the Gallery display
(js/gallery-display.js). A fixed top-right display-switch button (#display-
switch; Tweaks → Project Thumbnail Display → Switch button: X-from-right /
Y-from-top / Size + a "List glyph" dropdown (glyph
text + its own Radius), a "Gallery glyph" dropdown (glyph text + its own
Radius), a per-direction "Gallery → List" and "List → Gallery" dropdown (each
with Ease in / Ease out 0–100% + its own Transition speed [ms]), and a
"Style" dropdown (Default/Hover
styling like Back/Play) toggles between them, showing the glyph of the mode
you'd switch TO (with THAT mode's own corner Radius). window.DISPLAY_MODE ('list'|'gallery') persists in
localStorage; applyDisplayMode() (portfolio.js) builds the active display
and destroys the other. On an actual toggle setDisplayMode() picks the ease +
speed for THAT mode transition (Gallery→List vs List→Gallery; the Ease in/out %
map to cubic-bezier control points via applyTweaks) and sets --disp-rad-dur /
--disp-rad-ease so the corner radius EASES between the two glyphs' radii
(border-radius is ALWAYS transitionable, duration 0s except during a toggle, so
it animates BOTH ways + live slider drags stay instant); refreshDisplaySwitch()
sets the shown glyph + its radius. In gallery mode the list's center marker +
connector line are hidden, and the title/mini/tags info shows CENTERED OVER a
tile on hover (or over EVERY tile when galInfoAlways is on); in list mode they
track the centered thumb as before. The two
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

MINI DESCRIPTION + TAGS are a LINK to the centered project (list display only —
gallery mode makes the whole layer inert). Clicking either opens the project, and
hovering either puts the centered title into its HOVER state (#home-view
.mini-hover, which also covers the no-blend-on-hover mode). To avoid a patchwork
of hot glyphs, a single #mini-hit box (position:fixed, below the text layers) is
sized each layout pass to the UNION of the description + tag-row rects, so the
gaps between the lines and between the pills hover/click as one area;
positionMiniTags() maintains it and renderMiniInfo clears it when nothing is
centered.

Back/Play buttons (left panel, project page): style-driven (Regular |
Boxed). Play is per state via setPill(); Back has ONE switch per context (see
"BACK BUTTON STYLE" above). POSITIONING: Back is position:fixed from the TOP (backTop →
--back-top; Tweaks → Project page → Buttons → Back button → Position) with its own
Size control (backSize → --back-size, the label's font-size incl. any glyph);
Text buttons (.lp-play) live in the .lp-btns row IN FLOW below the project
description; Align moves the whole row (justify-content), spaced by --play-gap /
--play-gap-bot / --btn-gap (Tweaks → Project page → Toolbar spacing → Buttons).
In REGULAR style there is NO box — transparent
background, no padding, and the button TEXT aligns flush with the panel
content margin (like the title/tags). In BOXED style the box gets an
opaque page-bg base + Fill color (so a translucent fill never exposes
the scrolling panel text beneath) + outline + padding, and the BOX edge
aligns with the margin. Both have Default + Hover states (no Selected).
Labels are pure text from Tweaks — NO hardcoded ← or 🕹️ glyphs (add
your own in the text field if wanted).

PROJECT-PAGE TOOLBAR SPACING: title / year / tags / description / Play each have
Space above + Space below tweaks (projTitleGapTop|Bot, projYearGapTop|Bot,
projTagsGapTop|Bot, projDescGapTop|Bot, playGap/playGapBelow → --ptitle-*,
--pyear-*, --ptags-*, --pdesc-*, --play-gap*) under Tweaks → Project page →
Toolbar spacing. TWO things make them behave predictably: the blocks live in
.lp-proj-info, a FLEX COLUMN, so adjacent margins DON'T collapse (with
collapsing, the larger of two neighbouring gaps won and small values looked
dead); and the logo's fixed 20px margin-bottom is zeroed on project pages
(.logo-zone:has(+ .lp-proj-info)) with no hardcoded wrapper margin-top, so the
title's "space above" is the ONLY gap under the logo and 0 really means 0.
Project-page IMAGE controls (Gap X / Gap Y) live in an "Images" sub-dropdown under
Column align; EXPANDED MEDIA (next sub-dropdown) holds Expanded size (lightboxSize,
moved out of Images), Background blur (lbBlur → --lb-blur, default 20px) and
Background fade (lbFade → --lb-fade, default 60% = page colour laid over the blurred
page) — shared by ALL THREE project lightboxes (image / local video / rich video,
which had hard-coded 20 / 14 / 6px blur) — plus Close cursor.
PLAYGROUND EXPANDED CLIP (Playground gallery → Expanded clip): the .pg-overlay
backdrop now blurs the gallery like the lightboxes — pgOvBlur → --pg-ov-blur (20px),
pgOvFade → --pg-ov-fade (60%); was a solid --bg at 0.92 opacity, no blur. Note the
gallery keeps animating under it, so a big blur costs GPU while a clip is open.
EXPAND OVER (Expanded media → lbOver, default 'window' → html.lb-main when 'main';
Expanded clip → pgOvOver, default 'main' → html.pgov-window when 'window'; radio =
ExpandOverRadio in tweaks-app.jsx). WHOLE WINDOW: overlay spans the viewport (lightboxes
inset:0; .pg-overlay left:0) — backdrop blurs/fades + blocks everything incl. the toolbar
(overlays are z 100/200 in .right, which has no stacking context, so they sit above .left
z 5). MAIN CONTENT: overlay starts at --left-w; html.lb-main sets --lb-left = --left-w and
all lightbox max widths are size × (100vw − --lb-left). playground-gallery.js ovLeft() =
0 or leftWNow() fits/centres/places the clip (openOverlay, recenterOverlay; the close
animation's off-left clamp still uses the real toolbar edge). While something is open in
main mode, html.xm-main (synced by a MutationObserver on the 4 overlays' class in the
CLOSE CURSOR script): .left gets cursor:var(--close-cursor) (interactive descendants
forced to pointer / text), the drawn X shows wherever the toolbar's computed cursor is
'none', and ANY click in .left calls window.closeExpandedMedia() (portfolio.js — closes
whichever lightbox / the playground overlay is active) without stopping the click, so
toolbar buttons still work.
CLOSE CURSOR (closeCursor → --close-cursor, set in applyTweaks; one setting shown in
BOTH sections via CloseCursorRadio in tweaks-app.jsx): the cursor on every lightbox /
overlay BACKDROP (= the click-to-close area). Neither macOS nor Windows has a built-in
X cursor (CSS keywords only go as far as zoom-out / not-allowed), so 'x' = a DRAWN X:
--close-cursor: none on the backdrops + html.cc-x, and #close-cursor (24px SVG, black
1.8px stroke over a white 5px halo, centred on the pointer; the CLOSE CURSOR script at
the end of <body>) follows pointermove while the pointer is over a backdrop, mouse only,
re-checked via elementFromPoint after clicks / keydowns (+380ms) and on tweak change
(window.__closeCursorSync). It was a CSS url() cursor first, but Chrome swaps any
custom cursor > 32 DIP for its fallback when it would extend outside the viewport
(anti-spoofing) — at >100% zoom or in a scaled preview the 24px X crossed that, so it
became zoom-out along the page edges. DON'T go back to url(). 'zoom-out' = built-in
magnifier-minus (pairs with the zoom-in cursor on project images); 'arrow' = default
(old behaviour). Default 'x'.
PLAYGROUND SCROLL controls (Scroll mode, H/V speed, Scroll speed, Scroll direction
(free), Diagonal angle, Reverse scroll) live in Playground gallery → Scroll.

## Home reel intro
The home view lands on the REEL (the same Vimeo film as the about page) and
scrolls INTO the project section. #home-view now holds exactly two stacked
layers, both `position:fixed; inset:0; pointer-events:none`:
  · #home-reel      — .home-reel-box (the FULL main content window: top/bottom/
                      right 0, left --left-w, `container-type:size`) >
                      .home-reel-frame (the largest 16:9 box that fits, times
                      --reel-size, in 100cqw/100cqh so it tracks the box with
                      no JS) > the iframe + .home-reel-shield; plus
                      #reel-scroll-marker.
  · #home-projects  — EVERYTHING else that was a direct child of #home-view
                      (display switch, list + gallery stages, list scroll
                      markers, title stack, filter block, mini description,
                      tags layer, hit area, #panel-edge-line).
js/home-intro.js drives ONE progress value p: 0 = reel at rest with the
project layer parked one viewport BELOW, 1 = project layer in its authored
positions with the reel one viewport ABOVE. Both layers translate the SAME
amount in opposite directions, so they read as one continuous column. The
tween is an exponential ease (~0.6s) driven by rAF AND a 16ms interval, so it
still completes where rAF is starved (offscreen tab, nested harness).

WHY WRAPPERS AND NOT PER-ELEMENT OFFSETS: one transform moves the whole
section. Both wrappers are inset:0 so the position:fixed children inside
resolve their offsets exactly as they did before (a transformed ancestor
becomes their containing block); that also means the wrappers would swallow
hit-testing across the whole viewport (left panel included), hence
pointer-events:none on both, with the previously-hittable children restored
explicitly (.display-switch, .list-stage, .gallery-stage, .lp-filter-block,
.mini-hit — NOT the title stack / mini-info / tags layer, which are
deliberately inert with their rows/pills opting back in). No z-index and no
background on either layer, so the adaptive-invert copies (appended to
#home-view after them) still paint on top and the difference-blended title
stack keeps its backdrop. At rest (p = 1) the transform is REMOVED, so
painting/stacking is bit-identical to the pre-intro page.

--home-lift (on <html>) publishes the project layer's CURRENT pixel offset.
Anything that writes a VIEWPORT-measured y-coordinate INTO an element inside
#home-projects must subtract it, since the wrapper's transform is applied on
top: positionMiniTags() (portfolio.js — tag row + hit area) and
updateMarkerLine() (list-gallery.js — the connector line). apply() re-runs
positionMiniTags every frame of the slide for that reason.

SCROLL OWNERSHIP: home-intro.js listens for `wheel` in the CAPTURE phase on
window and stopPropagation()s what it consumes, so list-gallery.js and
gallery-display.js (both bubble-phase window listeners) never see those
events. It consumes (a) every downward wheel while p < 1, (b) everything
while 0 < p < 1, (c) upward wheels at p = 1 only when the active display is
at its own top — ListGallery.atTop() (finite: scrollY at snapMin; infinite:
item 0 centered) or gallery scrollLeft 0 — which is the hand-back that slides
the reel down again. Everything else passes straight through, so normal
project scrolling is untouched. Because the swallowed events would also have
pinged adaptive-invert.js's own (bubble) wheel listener, it is pinged
manually; ListGallery.stop() kills list momentum on every consumed event.
Once input settles (150ms) the transition always COMMITS to an end state, so
it can never rest mid-slide; a small flick therefore plays the whole move.
Touch is wired the same way (iPad counts as desktop here), and the reel's
scroll marker is also CLICKABLE as a reveal button.

The reel URL lives in `data-src`, not `src` — the iframe is only created when
the desktop home route is entered (ensureReel), so the mobile app never loads
a hidden player. Leaving home blanks it (audio/decoder teardown, same rule as
the about reel); returning at p = 1 leaves it blank and it is rebuilt lazily
the moment a retreat starts. Fully hidden (p = 1) it is also paused through
Vimeo's postMessage API. The DESKTOP about page no longer carries a reel — it
was replaced by the about hero image (see "## About page"); portfolio.js's
rebuildAboutReel/stopAboutReel are now harmless no-ops (they guard on the
missing #about-reel-iframe). Mobile's about page keeps its own reel.
NOTE: do NOT put `transition: left` on .home-reel-box — a transitioned
calc(var(--left-w) + …) got stuck at its pre-change value in Chrome, leaving
the reel offset by a phantom 340px panel after the toolbar collapsed.

NO FLICKERING EDGES — four rules, all of them load-bearing (the symptom was a
shimmer along the video's top/bottom edge for a second or two after the reel
settled back into place):
  1. #home-reel keeps a PERMANENT compositing layer (will-change:transform,
     and apply() always writes an explicit translate3d, never `none`). A layer
     promoted at the start of a slide and demoted on settle is re-rasterised
     at both ends, and that re-raster flashes the edges.
  2. WHOLE-PIXEL SIZE: width and height are each round()ed to 1px (aspect-ratio
     is deliberately NOT used — it re-introduces a fractional height like
     519.75px). The step is 1px and NOT a multiple of 16: a coarser step left a
     several-pixel WHITE BAND down each side at 100%. Rounding the two axes
     independently costs ≤0.1% of aspect, which is imperceptible.
  3. WHOLE-PIXEL POSITION: the frame is absolutely positioned with round(…, 1px)
     offsets instead of flex-centered — centering an even box in an odd
     container lands on a half pixel, which is antialiased.
  4. Both translate offsets in apply() are Math.round()ed, so the layer never
     rests at a sub-pixel offset.
  Plus: the frame has NO background fill and NO overflow clip, and the iframe
  overscans it by 1px on every edge — unclipped, so it just overlaps the white
  page and rounding can never leave a white sliver at the content-window edge.
  (The player fills a 16:9 iframe with a 16:9 film, so the overscanned pixels
  are video, not letterbox.) The ORIGINAL build overscanned INSIDE an
  overflow:hidden frame with a black fill: that clip was one more antialiased
  boundary and the fill was what could flash dark at the edges — don't
  reinstate either.
  Every `round(down, …)` declaration is preceded by an unrounded fallback of
  the same property, so an engine without CSS round() still lays the reel out.

WHEEL OVER THE VIDEO: a cross-origin iframe SWALLOWS wheel/touch (the events
are delivered inside the player document and never reach this page), so
hovering the hero used to freeze the scroll choreography. .home-reel-shield is
a transparent sibling stacked ABOVE the iframe that takes the hit-test, with
the iframe itself pointer-events:none. Consequence: the Vimeo control bar is
unreachable, so the hero URL uses controls=0 (autoplay muted loop).

COLOUR OVERLAY: .home-reel-tint is a pointer-events:none wash filling the
frame, above the iframe and the shield (--reel-tint / --reel-tint-op). The
OPACITY is the control, so no value can ever eat the hit-test or the scroll.

FULL-PAGE MODE (html.reel-full + html.route-home, Tweak reelFull):
ROUTE-SCOPED — both mode classes only take effect where the reel actually is:
the HOME view (html.route-home, added/removed by HomeIntro.enter/leave), and
for MOST rules also only with the toolbar EXPANDED
(`.site:not(.tb-collapsed)`). That expanded guard is load-bearing, not
tidiness: unscoped, these rules stripped the panel's background and border on
PROJECT and ABOUT pages too (no edge divider anywhere, and the expanded
drawer's text floating over project content with no white background) and left
the real ink transparent with no clone layer to replace it (invisible logo /
about link). The COLLAPSED drawer is excluded because it is a full-width opaque
overlay — the reel is not behind it, so it keeps its own background, border and
real ink.
  BUT the reel's own SIZING (.home-reel-box's left/overflow and the frame's
--reel-fit) is scoped to html.reel-full.route-home ONLY, with no
:not(.tb-collapsed) — the drawer-is-an-overlay reasoning has nothing to do with
how big the video is, and scoping it there made the collapsed state fall back
to the fitted min(), re-introducing the white bands above and below.
  .home-reel-box's `left` drops from --left-w to 0 and the area clips
(overflow:hidden). The video's fit (Fit/Fill) is no longer tied to Full page —
it is the reelFit tweak (see BOUNDING BOX below); all the whole-pixel rounding
still applies. The
reel then sits BEHIND the interface. Nothing needed a z-index for that:
.home-reel has none, so it already paints below .left (z-index 5) and below
every project-section child; the panel just stops painting its opaque
background. The toolbar's logo / social icons / about link / bio therefore stay
fully hoverable and clickable over the video, above the tint too (verified by
hit-testing, not just by eye).
  · THE EDGE DIVIDER cannot be the panel's border-right in this mode — it would
    stand over the full-bleed reel from the first frame. So the panel's
    border-right-color goes transparent (geometry preserved) and #panel-edge-line
    — a 1px fixed line at calc(var(--left-w) - 1px), INSIDE #home-projects —
    takes over: being in the sliding layer, it rises into place with the project
    section for free. It reads --panel-edge, so the "Edge divider" toggle still
    governs it, and it is display:none in the collapsed drawer.
  · INVERT-OVER-REEL WAS REMOVED (Oct 2026): the reelInvert tweak, the
    html.reel-invert / .reel-at-top classes, #reel-invert-layer and the clone /
    .ri-live machinery in home-intro.js are all gone. HomeIntro.syncInvert() is
    kept as a no-op so old callers don't break. Don't reinstate piecemeal.

BOUNDING BOX (Tweaks → Reel → Bounding box / Video). Three nested layers:
  · .home-reel-box   — the AREA (content window, or the whole page in Full
                       page mode). Size container; draws nothing.
  · .home-reel-bound — the BOUNDING BOX inside the area. Sized in the area's cq
                       units and itself a size container. Scaling mode
                       (reelBoxMode → html classes):
        stretch (default, no class) — fixed px MARGINS reelBoxMX / reelBoxMY
                 (--reel-mx / --reel-my) from the area's edges; the box fills
                 the rest and is always centred (Position X/Y hidden);
        uniform (html.reel-box-uniform) — LOCKED aspect (reelBoxAspect, e.g.
                 16:9 → --reel-bar) scaled as the largest box of that ratio
                 that fits the area × reelBoxSize %. Box + video keep their
                 proportions and relative position at any window size;
        fixed   (html.reel-box-fixed) — reelBoxWpx / reelBoxHpx, clamped to the
                 area.
                       reelBoxX / reelBoxY (0–100 %, 50 = centred) place it in
                       the area's free space (uniform / fixed only). Stretch
                       instead has reelBoxOX / reelBoxOY px offsets from centred
                       (--reel-ox/--reel-oy, 0 in other modes): size stays
                       from the margins, edge gaps become MX±OX / MY±OY. The bound is
                       NOT a size container: the frame's cq units resolve
                       against the AREA and it reads the box size via the
                       inherited --rb-w / --rb-h tokens. Whole-pixel rounded like the frame.
                       BORDER (reelBorderShow / reelBorderColor /
                       reelBorderWidth) = a ::after drawn INSIDE the box
                       (inset:0, pointer-events:none) so geometry never changes.
  · .home-reel-frame — the 16:9 VIDEO inside the box. reelFit 'contain' (Fit,
                       min()) or 'cover' (Fill, max() + html.reel-cover); size =
                       reelSize % ("Video size") of the BOX, or of the whole AREA
                       when reelVideoBasis = 'window' (html.reel-vid-window →
                       --rv-w/--rv-h = 100cqw/100cqh) — independent of the box; reelVideoX / reelVideoY position it in the
                       box's free / overflowing space. A missing reelFit falls
                       back to cover in Full page, contain otherwise.
  The box CLIPS (overflow:hidden) only in Fill mode or when the border is on —
  Fit with no border keeps the old unclipped-overscan rule.
  RESIZE SMOOTHNESS: the iframe has a FIXED layout size (IFR_W×IFR_H, ≥1920
  wide, inline styles) and is fitted to the frame by syncReelScale() with
  transform: scale(sx, sy) from a ResizeObserver on the frame. Never let the
  iframe's layout size track the window again — resizing a cross-origin
  player makes the browser wait on its process every resize tick, which
  stalled the WHOLE page's frames (top-edge window drags hiccupped the box and
  the social icons). Likewise index.html's resize listener skips
  updateResponsiveLayout()/fitLogo() when only the HEIGHT changed. refreshMarker()
  measures the VISIBLE video (frame ∩ box) for the scroll marker.

  html.route-home / route-about / route-project are set in ONE place —
  applyRoute() in js/portfolio.js — and are the source of truth for every
  route-scoped rule (the reel's full-page + invert modes, the bio-reveal hover)
  and for per-route control values (the about page's own expand + minimize
  glyphs, via window.updateTbGlyphs() in index.html, called from applyTweaks
  AND applyRoute).

- Filter buttons: … X position (filterX → --filter-x) + Y from top
  (filterPosY → --filter-y), plus a "Toolbar hidden" sub-dropdown with its OWN
  X + Y (filterXCol / filterYCol → --filter-x-col / --filter-y-col, used by
  `.site.tb-collapsed .lp-filter-block`) — the collapsed toolbar frees the whole
  window, which usually wants the filters elsewhere. applyTweaks resolves the
  fallback: an unset collapsed value writes the docked one.
- Toolbar → Collapse (master sub-dropdown): Full-size width (tbRefW) and
  Collapse below (tbCollapseAt) — the collapse BEHAVIOUR — with "Collapse
  buttons" NESTED inside it for everything per-button: Size (tbToggleSize, the
  GLYPH size), edge offsets, Y, radius, the four glyphs incl. the about-page
  overrides, the Default/Hover state stack, Box shape and Box size (square
  only). The split is deliberate:
  collapse BEHAVIOUR outside, per-button styling inside.

## Toolbar colours + slide-in entry
- Per-state colours (Toolbar → Logo / Social icons / About link): logoColor /
  logoHoverColor → --logo-color / --logo-hover-color (.logo-idle / .logo-hover;
  an IMAGE logo is unaffected), socialColor / socialHoverColor →
  --social-color / --social-hover-color, aboutColor / aboutHoverColor and
  closeColor / closeHoverColor → --about-* / --close-* on
  .about-link[data-kind="about"|"close"]. Defaults reference @colorText /
  @colorHighlight.
- SLIDE-IN ENTRY — per element, each in its own Toolbar dropdown: Logo
  (tbSlideLogo + logoSlideFrom), Social icons (tbSlideSocial → html.tb-slide-
  social, bottom only), About link (tbSlideAbout → html.tb-slide-about +
  aboutSlideFrom). The old shared tbSlideIn is only a fallback for the two new
  keys. ALL bottom-edge sliders share ONE distance --tb-slide-dy (syncSlideDist:
  panel height − topmost bottom-slider's offsetTop + 2, on every resize + fit)
  so they move as a block and keep their relative offsets; left-edge sliders
  use own width + left offset. Original description: on the home reel .lp-social sits below the window bottom and
  .lp-about past the left edge; they slide in as the list scrolls up and back
  out toward the reel. No CSS transition — home-intro.js apply() writes
  --intro-p (= S.p, the same eased progress that moves reel + list) each frame,
  and CSS maps it to a transform. Scoped to html.route-home.intro-live
  (intro-live added in HomeIntro.enter, removed in leave) and
  .site:not(.tb-collapsed). Travel distance clears the edge for any Y/align:
  social = social-y + own height (bottom anchor) or 100vh − social-y (top);
  about = own width + --left-pad.
  LOGO slide-in: tbSlideLogo (default ON → html.tb-slide-logo), logoSlideFrom
  'left'|'bottom' (html.logo-from-bottom); about link aboutSlideFrom
  (html.about-from-bottom). The logo is in flow, so its travel uses
  --logo-ox (offset BEYOND --left-pad; the CSS adds --left-pad itself, so a
stale/zero value still clears the edge) / --logo-oy, written by
syncLogoGlyph() only when the zone has real layout; also re-run on window load.
- COLLAPSED #tb-expand BUTTON — role per route (click handler + updateTbGlyphs):
  HOME = "Open about" (openAbout(), no drawer; glyph tbOpenAboutGlyph, empty →
  Expand glyph); ABOUT = "Close about" (goHome(); glyph tbExpandGlyphAbout —
  key kept, labelled "Close about glyph"; sits at the RIGHT edge, offset
  tbCloseAboutX → --tbclose-about-x via html.route-about .tb-expand);
  PROJECT = expands the drawer (glyph tbExpandGlyph).
- BACK BUTTON + "× close" LINK REMOVED (Oct 2026): the logo + its route glyph
  is the only way home from a project or the about page. setLeftProject renders
  no .lp-back; setLeftAbout calls socialAboutHTML(null) (social icons, no
  .lp-about). Their tweak controls are gone; leftover CSS/vars are inert.
- ROUTE LOGO GLYPH — shown on project pages AND the about page (syncLogoGlyph
  wants .lg-in on route-project || route-about). (Toolbar → Logo → Project glyph; logoGlyphOn
  default ON → html.logo-glyph-on, logoGlyph, logoGlyphSize % → --lg-size,
  logoGlyphGap → LOGO_GLYPH_GAP, logoGlyphY → --lg-y, logoGlyphDur → --lg-dur).
  .logo-glyph lives INSIDE .logo-zone (clickable, shares --logo-color /
  --logo-hover-color), absolute at the zone's left edge; .logo-zone.lg-in =
  glyph in + .logo-idle/.logo-hover shifted by --lg-shift (glyph width + gap).
  The panel re-renders per route, so buildLogoHTML renders the zone with the
  PREVIOUS state (window.__lgIn) and syncLogoGlyph() (index.html, run from the
  fitLogo wrapper on every fit + from applyTweaks) flips .lg-in to the route's
  state after a forced style read — that's what makes the slide play across
  the re-render, both entering a project and exiting back home.

## Colour token references
EVERY colour control (desktop ColorHexRow / ColorAlphaRow, which also back the
pill/button state groups, plus both mobile panels) has a SOURCE dropdown:
Custom, or one of the 8 Colors palette tokens (colorText, colorBg, colorBgSec,
colorBgTer, colorHighlight, colorBorder, colorMuted, colorFaint). Picking a
token stores a REFERENCE string in the same key: "@colorText", or with alpha
"@colorText/80" (2-hex alpha suffix; alpha rows keep their slider). Typing a hex
or using the picker = manual override (source flips to Custom); an untouched
blur keeps the reference. applyTweaks() first runs resolveColorRefs(t) on a
COPY, so all downstream code still sees plain hex and editing a palette token
re-colours every control that references it. mobile-app.js resolves with its
own rc() (self-contained) for the m* colour keys; Mobile Preview.html with
twResolve(). The palette rows themselves are noRef (always literal hex — a
token can't reference a token). New colour tweaks: just use ColorHexRow /
ColorAlphaRow and read the value in applyTweaks as usual.

## Tweaks persistence & the pending mirror
Tweak values live in the TWEAKS JSON block in index.html (disk truth). Every
panel change ALSO writes a `matikalter:tweaks:pending` localStorage mirror of
`{key: {base, v}}` (persistTweaks), because the host's disk write is async and a
refresh mid-edit would otherwise lose it.

mergePendingTweaks() (index.html, runs on load) resolves each entry:
  · disk == entry.v    → the host write landed; prune the entry.
  · disk == entry.base → the edit hasn't persisted; RE-APPLY entry.v over disk
                         and re-post it to the host.
  · anything else       → disk was hand-edited to a third value; trust disk.

CONSEQUENCE, and it is counter-intuitive: writing the AUTHORED value back into
the TWEAKS block does NOT clear a stale mirror entry — disk == base is precisely
the branch that re-applies the override, and the re-post then writes the stale
value back into the block on every load. To make an authored value win, purge
the mirror entry. purgeStaleTweakCache() (just above the merge) does that: list
the keys with a new PURGE_ID, and it deletes those entries once, remembering the
id in `matikalter:tweaks:purged` so later legitimate edits to the same keys are
untouched. Bump the id + list for each new purge; it is safe to leave in place.

3-WAY MERGE (Nov 2026): for plain-object keys (projLayout above all — ONE key
holding every project's layout) the "disk moved to a third value" branch no
longer drops the pending edit: merge3(base, mine, disk) applies the panel's
change path-by-path on top of the new disk value (both-changed leaves → the
panel's value; arrays/primitives are leaves), re-bases the mirror entry on disk
and re-posts. This is what lost the user's Bloom text edits: an agent edit to
projLayout (adding slideshow keys to the order) moved disk off the entry's
base, so the pending text edits were discarded on refresh.
AGENT RULE: don't edit projLayout in index.html unless unavoidable — a new
content block absent from a saved order already renders in its AUTHORED slot
(projOrderedBlocks), so adding blocks needs no order edit. If you must, the
panel's in-memory projLayout is stale until the page reloads; tell the user to
refresh before editing more Page content, or their next change overwrites
yours.

## Routing
Hash-based: #/, #/about, #/project/<id>, and #/filter/<key> (a filtered
home view — e.g. #/filter/games — so a category filter is directly linkable).
Single file — instant nav, no reloads, linkable URLs. The filter click handler
just sets the hash (#/ for All, #/filter/<key> otherwise); applyRoute parses it
(validFilter guards unknown keys → 'all'), applyFilterState seeds activeFilters +
the pill active state, then builds. A filter CHANGE resets the list to the top
(applyDisplayMode({preserveScroll:false})); returning to home from a project
otherwise preserves the list scroll position
(applyRoute calls ListGallery.build({preserveScroll:true}); destroy()
leaves state.scrollY intact across a project/about visit), so the user lands
back where they left off.

## Project data (`projects` array)
Each project: id, title, year, tags[], mini (short descriptor shown in
home-view mini-info block), desc (left-panel project description; may
contain <br> and <em>/<a> — links get the highlight color), thumb,
thumbRatio (OPTIONAL first-paint hint — real ratio auto-measured),
play (OPTIONAL URL → the DEFAULT single text button when
projLayout[pid].buttons is unset; label from Tweaks; omit = no button — buttons are
now normally managed in Page content → Toolbar → Buttons), hidden.
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
  out in a 6-TRACK grid (2-per-row blocks span 3, 3-per-row blocks span 2 —
  see "## Per row (2 / 3)"; per:3 / place:'middle' may be authored on a block).
  PREFER single image / localvideo blocks over 'row' blocks: rows can't be
  ordered / sized per item (every multi-item row has been split, Nov 2026). Blocks render top-to-
  bottom; the `content` array IS the ordering (no per-page layout flag):
    { type:'video', src:'<embed url>' }           // full-width 16:9
    { type:'video', src:'…', full:false, ratio:'1/1' } // one column, custom ratio
    { type:'richvideo', src:'clip.mp4' }          // self-hosted MP4 + custom controls
    { type:'richvideo', src:'clip.mp4', ratio:'16/9' } // lock cell ratio (contain)
    { type:'localvideo', src:'clip.mp4', full:true } // self-hosted MP4, full-width
    { type:'localvideo', src:'pid/clip.mp4' }      // slash = shared path (see below)
    { type:'localvideo', src:'clip.mp4', ratio:'1/1' } // lock cell ratio (contain)
    { type:'spacer' }                             // empty 1-col cell (layout filler)
    { type:'image', src:'file.jpg' }              // one grid column
    { type:'image', src:'shared/pid/file.jpg' }    // a src WITH a slash = path
                                                   // relative to assets/, so one
                                                   // file can serve many pages
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
    { type:'posters', pid:'posters', images:[{src:'a.jpg'},…] } // embedded posters grid
  Notes:
  - SHARED ASSETS (one file, many pages): a `src`/`localvideo` value normally
    names a file inside THAT project's own folder (assets/<pid>/<src>). If the
    value CONTAINS A SLASH it is instead read as a path relative to assets/, so
    one file can serve any number of pages — e.g. the Lightricks page references
    'playground/LTX_Shapes_Single_1080.mp4', the Playground's own copy, and there
    is NO duplicate in assets/lightricks/. Resolved by assetPath(pid, src) in
    portfolio.js (each path segment encoded separately so slashes survive) and by
    the mirrored assetURL(pid, f) in mobile-app.js. Prefer this over copying a
    clip into a second folder: one download, one cache entry, one file to replace.
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
    spacing Tweaks; per-block `mt`/`mb` (px) override that one divider. The
    "Full length" Tweak (projDividerFull → html.proj-divider-full) makes every
    project-page divider bleed past the content margins (negative inline margins
    of --proj-margin-x) so the rule runs the WHOLE main section — from the
    toolbar's edge divider to the page's right edge.
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
    white space around it) with `align` positioning it; `maxW` (number=px,
    string e.g. '92%') caps the IMAGE inside its slot and centres it, keeping
    natural aspect so the HEIGHT shrinks with it (unlike `scale`, a transform).
    `w` + `maxW` together are how the Illustrations page sits the three narrow
    Blood-Hair-Limbs shirt photos centred directly under the three wider
    illustrations in the row above, at matching height. A row entry can also be a video
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
    gallery takes the wheel while it is ENGAGED — the page is at the very top
    (a gallery pinned to the top of the page) OR the gallery is settled in the
    viewport (fully visible, or tall enough to cover the viewport's middle) — so
    a MID-PAGE hscroll scrolls L/R and only hands the wheel back to the page
    at an edge. (No page uses hscroll now — the Illustrations page's Swissa
    section became an INTERACTIVE slideshow, Nov 2026.)
  - posters: the STATIC justified posters grid (js/posters-gallery.js) embedded
    INSIDE a content page's block flow, so a page can mix it with text/rows/
    dividers. blockHTML emits just the mount (.posters-gallery[data-posters-pid])
    and initPostersBlock() (called from renderProjectStandard) fills it via
    PostersGallery.build. `pid` names the asset folder the images live in
    (defaults to this project — set it to borrow another page's folder);
    `images` is the same [{src,title?,body?,ratio?}] shape as `postersImages`.
    ONE per page (PostersGallery keeps a single mount) and it shares the Tweaks →
    Posters gallery controls + order/descriptions with the standalone page. Hover
    descriptions need the #pg-desc overlay, which setLeftProject renders when
    hasPostersBlock(p) is true. Mobile renders it as a plain media stack.
  No `content` → falls back to video + images. Image files live in
  assets/<id>/.
- Posters-style page: add `postersImages` [{src, title?, body?, ratio?}] to
  render the STATIC justified grid (js/posters-gallery.js) instead of the
  content-block grid. Order + per-image Title/Body descriptions are edited in
  Tweaks → Posters gallery → Image order (stored as `postersOrder` filename
  array + `postersDescData` keyed by src; both AUTHORITATIVE over inline
  title/body, same rule as playground). Image files live in assets/<id>/.
  Layout/behaviour controls live in the Posters gallery tweaks section. To put
  this grid INSIDE a normal content page instead, use the `posters` content
  BLOCK (above) — that's how the Illustrations page opens.
- ILLUSTRATIONS page (id 'illustrations') holds ALL the former Posters /
  Swissa / Blood, Hair, Limbs / Avira material. Those four project entries and
  their asset folders were REMOVED (Nov 2026); every file now lives flat in
  assets/illustrations/ (incl. the old thumbnails + unused extras like
  22-web.jpg, Swissamock-web.jpg), referenced by bare filename. postersOrder /
  postersDescData stay keyed by bare filename, so they still apply to the
  embedded posters block. A src/thumb containing a SLASH is still read relative
  to assets/; a bare filename means assets/<id>/<file>.
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
  TOOLBAR on tile hover / expand, BELOW the project description + buttons (the
  last in-flow toolbar item; fades in/out without moving anything — see
  "## Playground / posters hover description"). Descriptions are edited per clip in Tweaks → Playground gallery →
  Clip order (✎ toggle → Title + Body fields), stored in the `pgDescData`
  tweak keyed by clip src (window.PG_DESC_DATA); a field defined there is
  AUTHORITATIVE even when empty (clearing it hides that line — does NOT fall
  back to any inline title/body in the project data). Uses the Text Title (h5)
  + Text Body styles. Toolbar tweaks (Vid Description sub-dropdown): Show
  descriptions toggle (pgDescShow / PG_DESC_SHOW), Align (pgDescAlign), Space
  above / below (pgDescGapTop / pgDescGapBot → --pgdesc-gap-top / -bot).

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
above the ABOUT HERO IMAGE, pinned to the BOTTOM of its column. Tweakable
(About page section): Margin X / Margin Y (outer padding), Column split (the
movable left|right divider = left zone width %), Bio max width and Education
max width (0 = no cap), plus:

HERO IMAGE (About page → Hero image): the Jumpdude gif, which REPLACED the
Vimeo showreel that used to sit here (the reel is now the home page's scroll
hero — see "## Home reel intro"; portfolio.js's rebuildAboutReel/stopAboutReel
survive as no-ops). Tweaks: aboutHeroShow, aboutHeroSize (% of its column →
--about-hero-size) and aboutHeroAlign (→ --about-hero-align, a justify-content
value). When it is the LAST block in its column it also gets margin-top:auto
(pinned to the column bottom); mid-stack it sits in the flow, since auto there
would eat the gap.

LAYOUT (About page → Layout): all THREE blocks — bio (#about-bio-text),
accolades (#about-meta) and hero (#about-hero) — can live in EITHER column in
ANY order. One tweak key holds it: `aboutLayout` = {left:[ids], right:[ids]},
ids being 'bio' | 'accolades' | 'hero'. applyTweaks appends the real nodes in
that order (appendChild also moves them across columns); a malformed value can
never drop a block — anything missing is pushed onto `right`. Because the
arrangement is free, NO block owns its spacing any more: both columns are plain
flex stacks and `> * + *` gets --about-stack-gap (aboutStackGap, "Gap between
blocks", default 40px; falls back to the old aboutHeroGap), so the two columns
look identical whatever the arrangement. The panel side is AboutLayoutEditor in
tweaks-app.jsx: the two columns drawn side by side, each row with ↑ / ↓ to
reorder within the column and → / ← to send it to the other one — one control
answering both "which column" and "which is above which", which separate radios
could not.
  Panel grouping: About page → Bio (max width + text), Accolades (max width +
the three section editors), Hero image (show / size / align), Layout (the
editor + the gap), with margins and column split at the top level.

META CONTENT (About page → one dropdown per section): Education / Awards /
Conferences & Exhibitions are NO LONGER hardcoded HTML — #about-meta is
rendered by applyTweaks from ONE tweak key, `aboutMeta`, an array of
{title, items:[[main, detail]]}. `main` is the body-colour text, `detail` the
faint grey <span> that follows it — i.e. the two visual parts of an .about-item,
so the two fields in the panel map 1:1 to what's on screen. Strings are HTML-
ESCAPED (plain text, not markup — unlike the bio, which allows raw anchors).
window.ABOUT_META in index.html is the authored fallback used until the key
exists. The panel side is AboutMetaSection in tweaks-app.jsx: a Title field
plus per-item Main/Detail inputs with move-up / move-down / remove and
"+ Add item"; every edit writes the FULL array (readMeta clones the current
value or the default) so untouched sections still round-trip.

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
The ` handlers (the index.html boot stub, the desktop panel, mobile-app.js, and
Mobile Preview.html) all match the PHYSICAL key `e.code === 'Backquote'` as well
as the `` ` `` character — on a non-US layout (e.g. Hebrew) that key emits ';',
so an e.key-only test silently never fired. They also skip INPUT/TEXTAREA/SELECT
and contenteditable targets. Note the shortcut only reaches the page once the
preview has FOCUS (click the design first).
LAZY-LOADED: React + ReactDOM (dev builds) + @babel/standalone + the two JSX
sources are ~1.5 MB of JS plus an in-browser transpile and are used ONLY by the
panel, so index.html no longer ships them. A small stub at the bottom of
index.html posts __edit_mode_available (so the host's edit toggle still
appears), owns the ` key + the __activate_edit_mode message until then, and on
first use loads the three CDN libs IN ORDER, appends the two text/babel script
tags and calls Babel.transformScriptTags() (Babel only auto-transforms tags
that exist when IT loads), waits for window.__TWEAKS_READY (set by
tweaks-app.jsx after ReactDOM render), then detaches its own ` handler and
replays __activate_edit_mode so the real panel opens. Its message guard keys on
"has boot started" (bootP), NOT on a ready flag, so the replayed activate can't
re-enter and loop. Cost: a short warm-up the first time the panel opens in a
session; zero cost for every visitor.
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
FONT FAMILY options: Geist (Google), Satoshi + General Sans (Fontshare), Plus
Jakarta Sans (Google), plus system/helvetica/etc — fontMap in applyTweaks maps
the key to the stack, each falling back to Geist then the system stack.
NOTO SANS option (key notosans): Google Fonts, variable wght 100..900 (added to the one Google
<link>). Default font stays geist.
FONTSHARE IN THE claude.ai CANVAS: since the move from Claude Design, api.fontshare.com is a
BLOCKED external address in the canvas (Move report: external_blocked), so Satoshi / General Sans
silently fall back to Geist there. Google Fonts is allowed. Fix = self-host their woff2 files
(Fontshare download zips, ITF Free Font License) with @font-face, like the Noto symbols font.
BACKUP SYMBOL FONT: 'Noto Sans Symbols 2' sits in EVERY stack (fontMap + the :root --font default)
right after the main font, before the system fonts. Self-hosted, trimmed: fonts/noto-sans-symbols-2-
symbols.woff2 (74 KB, 845 glyphs, SIL OFL → fonts/OFL-NotoSansSymbols2.txt), cut with fontTools
pyftsubset from @fontsource/noto-sans-symbols-2@5.1.0's "symbols" subset, keeping only Arrows
(the few in the font: 21AF, 21E6–21F3), Misc Technical, Geometric Shapes, Misc Symbols,
Dingbats, Misc Symbols & Arrows, Geometric Shapes Ext (🞢) and Supplemental Arrows-C (🢑 🢓). It
has NO letters and NO emoji: every Emoji_Presentation=Yes code point and all pictograph blocks were
left out, so 🔊 🕹️ etc. stay colour (the Google-hosted font would have made them monochrome). The
@font-face unicode-range = the file's exact coverage, so it only downloads when a page shows one of
those symbols. Basic arrows ↑ ↓ ← → are NOT in Noto Sans Symbols 2 (system fonts have them). To
cover a new symbol block: re-run the subset with that block added + update the unicode-range.
Panel: a note under Typography → Font family names it as the backup font.
Fontshare needs ONE <link> PER FAMILY: its API serves only the FIRST f[] param
of a request and silently drops the rest, so a combined satoshi+general-sans URL
returned Satoshi only and General Sans fell back to Geist with no error. All the
webfonts come from third-party CDNs, so they need a network connection.
Sections
(top-level and nested) ALL start collapsed; nested dropdowns indent
progressively via a SectionDepth context (master titles larger, sub
titles smaller). Notable groupings:
- Toolbar: Left panel width (full-size base; scales responsively), Margin X
  (horizontal inset, feeds --left-pad), a "Logo" sub-dropdown (Logo Y only —
  logo is fit-to-width + always centered), a
  "Social icons" and "About link" sub-dropdowns (About link: Y position + Align;
  Social icons: Anchor [top/bottom, default bottom — 'bottom' measures Y from the
  WINDOW bottom], Y position, Align, "Vertical icons" toggle [socialVertical —
  row ⇄ stack], Icon gap [socialGap → --social-gap]), a "Divider" sub-dropdown (Show
  divider + Divider Y), a "Bio" sub-dropdown (Show bio + Y position + Align
  left/center/right via text-align + an editable multiline Text field
  [bioShort; newlines → <br>; empty = hardcoded BIO_SHORT default]), a
  "Hero Image" sub-dropdown (Show gif + Gif Y-from-bottom + Gif size + Gif
  align + "Freeze when idle" [gifFreezeIdle — idle holds a still frame, hover
  resumes from it], then "Idle" and "Hover" sub-dropdowns each holding Blur / Hue /
  Opacity / Saturation / Edge fade / Corner roundness; Hover also has Scale +
  Invert hue toggle),
  an "Edge divider" toggle (tbEdgeShow — the 1px toolbar/content line),
  and a "Collapse" sub-dropdown (Full-size width [tbRefW, 0 = auto/screen
  width = the responsive reference] + Collapse below [tbCollapseAt]) with a
  NESTED "Expand/Collapse buttons" sub-dropdown (Size [tbToggleSize = glyph
  size], Y from top, Radius, then one dropdown per button, each holding just
  "Edge offset" + "Glyph": Open about [tbToggleX + tbOpenAboutGlyph], Close
  about [tbCloseAboutX, from the RIGHT edge + tbExpandGlyphAbout], Expand
  toolbar (project pages) [tbToggleXProj + tbExpandGlyph], Collapse toolbar
  (project pages) [tbToggleXProjOpen + tbMinimizeGlyph]; then Default/Hover
  state styling, Box shape [square/conform] + Box size [tbToggleBoxSize, square
  only]), and a "Vid
  Description" sub-dropdown
  (playground only: Show descriptions [pgDescShow], Align [pgDescAlign], Space
  above / below [pgDescGapTop / pgDescGapBot]; the per-clip Title/Body text is edited under Playground
  gallery → Clip order, not here).
- Project Mini Description: X position, Vertical offset (±400px, relative to
  vertical screen-center — same anchoring as the title stack), Max width,
  Color (--mini-color), and "Invert over images" (miniInvertOver → per-portion
  invert over dark tiles via js/adaptive-invert.js).
- Center marker — two dropdowns:
  GLYPH: Glyph, Size (4–80px), Rotation (markerRotate 0/90/180/270 →
  --marker-rot; spins about the glyph's centre, so the line still meets it;
  positionMarker() uses the ROTATED width — a quarter turn swaps width for
  height — and shifts `left` by half the difference so Gap from thumb is
  measured from the visible edge), Glyph X offset / Glyph Y offset
  (markerGlyphX / markerGlyphY → --marker-glyph-x / -y, ±40px: move ONLY the
  glyph — updateMarkerLine subtracts both from the marker rect, so the line
  stays on the active row's centre and the glyph's ink is nudged onto it;
  glyphs like › / 🢑 aren't centred in their own box), Color (markerColor),
  Gap from thumb, Marker side (left/right).
  CONNECTOR LINE: show/hide, Line connects to (left/right edge), "Touch
  toolbar edge" (markerLineToEdge → the line's LEFT end extends out to the
  toolbar's edge divider at x = --left-w), Thickness (markerLineW 0.5–12px →
  --marker-line-w; top = round(y − (w−1)/2) so a 1px line keeps its exact old
  placement), Color (markerLineColor → --marker-line-color, falls back to the
  glyph colour).
- Scroll markers: two sub-dropdowns — "Project list" (below; its Animation
  controls in their own dropdown) and "Home page top" (the reel's down marker:
  Glyph, Size, an "Animation" dropdown and a "Placement" dropdown — see
  "## Home page top scroll marker").
  PROJECT LIST markers: two glyph affordances SHARED by both home displays. They
  live as direct children of #home-projects (position:fixed — the wrapper's
  transform makes it their containing block, which is inset:0 so nothing
  moves) so they survive the
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
- Reel (home hero): "Full page" (reelFull), a "Bounding box" sub-dropdown
  (Scaling stretch/uniform/fixed + that mode's size controls, Position X/Y, and
  a nested "Border" dropdown: Show / Color / Width), a "Video" sub-dropdown
  (Fit in box [reelFit], Size [reelSize, 20–150 %], Position X/Y), a "Colour
  overlay" sub-dropdown (reelTintColor → --reel-tint; reelTintOpacity →
  --reel-tint-op). The reel's down marker moved to Scroll markers → Home page
  top. See "## Home reel intro" → BOUNDING BOX.
- Project titles (formerly "Title stack"): Align, Color (--title-color), X position, Vertical offset, Row
  height, an "Invert over images" toggle (homeInvertText → the title stack
  gets mix-blend-mode:difference so it inverts per-pixel over thumbnails; the
  blend lives on the STACK, rows are set to --inv-text so difference vs the
  white page reproduces the chosen colour), a "Hover" sub-dropdown (Hover
  scale [only the .is-centered row, via an inner .lp-title-inner span so scale
  is independent of the per-frame translate; --title-hover-scale], Hover color
  [--title-hover-color; counter-inverted when invert is on so it reads true],
  and NO "Invert on hover" toggle any more [REMOVED Nov 2026 — hard-wired to its
  old OFF state: applyTweaks sets __titleHoverBlend = false, so .title-noblend-
  hover is always on and drops the blend on the hovered centered row via :has()
  so it shows its true colour; the titleHoverBlend key is ignored. The mix-blend
  switch is INSTANT so the row's colour must SNAP in lock-step — .lp-title-inner
  transitions transform ONLY (no colour cross-fade) to avoid a white flicker
  passing through the near-white inverse value on hover in/out; the scale still
  eases]). The hover scale's transform-origin is ALWAYS center center (it used
  to follow the alignment, so a left-aligned title grew to the right only).
  HOVER EDGE GUARD: #home-projects is position:fixed → its own stacking context,
  and .left (z 5, opaque bg) paints ABOVE that whole layer, so any part of the
  title stack (z 6, but only inside #home-projects) that grows left past --left-w
  is covered = "cut off". renderTitleStack therefore computes, for the centred row,
  shift = max(0, --left-w + 12 − (rowLeft + w/2 − w·hoverScale/2)) and writes it
  as --title-hover-shift on .lp-title-inner; both hover rules use
  translateX(var(--title-hover-shift)) scale(...). Needs window.TITLE_HOVER_SCALE
  (applyTweaks). Raising #home-projects above .left was rejected: the title would
  then draw over the bio / links instead.
  The upper/lower titles dropdown is now named "Inactive titles" and opens with
  "Inactive selectable" (titleInactiveSelectable → TITLE_INACTIVE_SELECTABLE;
  off = only the centred title is hoverable/clickable, inactive rows get
  pointer-events:none in renderTitleStack).
  CLICK-INACTIVE → GLIDE TO ACTIVE (titles AND List Display thumbnails): an
  inactive click glides that project into the active slot with the step spring
  (either scroll method — ListGallery.goToProject(id, cb) / clickItem in
  list-gallery.js) and does NOT open it — the user clicks it again once it's
  active (active title / active thumb open at once, as always). For the glide
  NAV LOCK is on (ListGallery.navLock(id) → window.__navLockId + html.nav-locked):
  renderTitleStack makes every title but the destination inert, clickItem and the
  title click handler ignore clicks, thumbs show cursor:default. Unlocked in the
  glide's cb (on arrival or cancel) or by a 4s safety timeout. Any other input
  re-aims the spring → springTo sees g ≠ go.g → cancelGo() → cb(false); also
  classic wheel, a real drag (a press that stays < CLICK_DIST is ignored and the
  glide continues), destroy(). List Display's "Inactive" dropdown is now named
  "Inactive thumbnails" and opens with "Inactive selectable"
  (listInactiveSelectable → LIST_INACTIVE_SELECTABLE, html.list-inactive-inert):
  off = inactive thumbnails ignore clicks. (Gallery Display has no active slot —
  its "inactive" = not hovered — so it's unchanged.)
  PER-SIDE (Nov 2026): Inactive titles now holds six sub-dropdowns — 1st / 2nd / 3rd
  above, 1st / 2nd / 3rd below (TitleSlotSection in tweaks-app.jsx), each with Blur,
  Opacity, Size. Keys titleBlur|titleOpacity|titleSize + U(above)|D(below) + 1..3
  (e.g. titleOpacityU2). applyTweaks builds window.TITLE_SIDES = {up, down} with
  {b,o,s}[3] arrays; every per-side key falls back to the OLD shared key (titleBlur2
  etc.) then the default, so nothing changed when the controls were split.
  renderTitleStack picks SIDES.up for raw < 0 (rows drawn above the active slot) and
  SIDES.down otherwise; both lerp from the active look at 0, so crossing is seamless.
  The shared keys / TITLE_BLUR_n globals remain only as that fallback. The paragraph
  below describes the older shared SIZE (titleSize1-3 →
  TITLE_SIZE_1-3, scale vs the active title, default 1×): renderTitleStack lerps
  it by distance like blur/opacity and appends scale() to the row's per-frame
  transform; the ROW's transform-origin = --title-origin (alignment) so smaller
  titles shrink toward their aligned edge. Row spacing is unchanged.
  and an "Upper / lower titles" sub-dropdown (three blur tiers + three opacity
  tiers for the ±3 rows).
- Filter buttons (panel order, Nov 2026): "Buttons" (which tags are filters +
  their order), "Position" (Placement, Direction [+ Max width when horizontal],
  then per placement Align → Horizontal gap / Vertical gap → X / Y, then the
  "Toolbar hidden" sub-dropdown with its OWN Direction [+ Max width] and X / Y),
  "States" (Radius moved in here, then Default /
  Selected / Hover, each Regular/Boxed + colors), "Invert over images"
  (filterInvertOver → per-pill per-portion invert over dark tiles via
  js/adaptive-invert.js; the .active pill is never inverted). "Invert on hover"
  was REMOVED — FILTER_INVERT_HOVER is hard-wired false (its saved state): a
  hovered pill suppresses ITS invert only, synchronously, and shows the true
  hover colour; the filterInvertHover key is ignored.
  POSITION: Placement (filterPlace 'main' | 'toolbar' → html.filter-tb).
  Main = the original fixed .lp-filter-block in #home-view: Align, Y from top,
  X position. Toolbar = a SECOND set rendered INSIDE the toolbar by setLeftHome
  (.lp-filter-block.lp-filter-tb > #filter-list-tb) — it has to be in the
  toolbar DOM because #home-projects is a fixed layer painted below .left (z 5).
  Absolute in .left, width max-content capped at margin → margin (max-width) so
  long rows wrap. Toolbar Align (filterTbAlign left|center|right, default
  center; independent of the main-mode filterAlign) anchors the box at the left
  margin / centre / right margin and aligns wrapped lines (--filter-tb-justify
  / --filter-tb-items, swapped for vertical Direction). X offset (filterTbX)
  and Y from centre (filterTbY) shift it; index.html layoutFilterTb() (IIFE
  above applyTweaks, cfg in window.__filterTbCfg) then CLAMPS left/top so the
  box never crosses the toolbar margins: --tb-margin-x sides, --logo-y top,
  .left padding-bottom below. Re-runs on applyTweaks, fillFilterLists, resize,
  fonts.ready and a ResizeObserver on the box + panel (box is re-observed after
  setLeftHome rebuilds it). CSS
  hides the main set in toolbar mode except while .site.tb-collapsed (then the
  main set shows at its "Toolbar hidden" X / Y, kept in the Position dropdown).
  fillFilterLists() renders + binds BOTH lists (pills carry _fBound so rebinding
  is safe); window.refreshFilterButtons() re-renders them after a Buttons change
  and drops to #/ if the active filter is no longer offered.
  DIRECTION / GAPS / MAX WIDTH: filterDir + filterMaxW (px, 0 = none; only
  applied when horizontal) drive both placements; "Toolbar hidden" has
  filterDirCol + filterMaxWCol (fall back to the docked pair) applied via
  .site.tb-collapsed .lp-filter-block:not(.lp-filter-tb) .filter-row and the
  --filter-*-col vars. .filter-row always flex-wraps; row-gap = filterGapY,
  column-gap = filterGapX (both fall back to the old single filterGap). In a
  row Align → justify-content (aligns wrapped lines), align-items centre; in a
  column Align → align-items. Toolbar placement keeps its own Align vars.
  BUTTONS (FilterButtonsPicker): shown buttons first, numbered, each with ↑ / ↓
  + a switch; the rest under "Not shown". Keys filterTags (tag keys IN BUTTON
  ORDER; 'all' marks the All slot, kept while All is off; no 'all' → All first)
  + filterShowAll. ↑ / ↓ swap with the neighbouring SHOWN button; switching a
  tag on appends it. index.html applyFilterList(t) (after applyTagList; same
  in-place pattern) rebuilds window.filterDefs in filterTags order,
  labels from the tag list, deleted tags skipped. Filter keys ARE tag keys, so
  filtering (list-gallery visibleProjects, mobile-app) needs no change. With All
  off, clicking the active pill again clears the filter (bindFilters).
- Filter buttons → SELECTION GLYPH (Nov 2026; keys filterSelGlyphOn [default
  false], filterSelGlyph, filterSelGlyphSide left|right, filterSelGlyphPush,
  filterSelGlyphSize %, filterSelGlyphGap, filterSelGlyphY, filterSelGlyphTravel,
  filterSelGlyphDur). Every pill is wrapped: .fp-item[data-fkey] > .fp-glyph +
  .filter-pill (portfolio.js filterButtonsHTML(onKey)). The item with .fs-on
  (= the active filter) shows its glyph, sliding in from its side over
  --fsel-travel with a fade. The row RE-RENDERS on every selection (hash
  route), so fillFilterLists renders the PREVIOUS selection (window.__fselKey)
  as .fs-on, forces a style read, then flips to the new one — the logo-glyph
  trick, so both the exit and entry animate. syncFilterSelGlyph() refreshes the
  character + measures --fsel-shift (glyph width + gap); called per render and
  from applyTweaks. PUSH (html.fsel-push): glyph at the pill's own edge, pill
  nudged by --fsel-shift a beat after the glyph sets off — in a COLUMN via
  transform (left side → right, right side → left), in a ROW via padding on the
  glyph side of the item so neighbours shift along instead of overlapping.
  --fs-row (0/1) on .lp-filter-block from --fs-row-main (filterDir) or, for the
  main set while .tb-collapsed, --fs-row-col (filterDirCol). Glyph colour =
  --filter-sel-text; pointer-events none; visibility INHERITS so a hidden set
  (toolbar set on the reel) hides it too. layoutFilterTb measures .fp-item
  offset boxes (transform-free) so a push never makes the toolbar box jitter.
  adaptive-invert.js's hover snap now overrides only transition-PROPERTY
  ('x-snap ×3, transform') so the push transform keeps animating while hovered.
- Filter buttons, TOOLBAR set on the HOME REEL: it rides up WITH the project
  section (transform translate3d(0, var(--home-lift)) under
  html.filter-tb.route-home.intro-live .site:not(.tb-collapsed)) and is
  visibility:hidden + pointer-events:none until html.intro-away (progress >
  0.02), so it never catches hovers / clicks over the reel. Safe for the
  panel's scroll area because every wheel / swipe on the reel belongs to
  home-intro.js.
- Tags: Style (Regular/Boxed) + Text/Fill/Outline colors (alpha), radius,
  spacing.
- Project page: columns are fixed 1:1 (NO column-ratio control); Column
  align (top/center/bottom), Gap X/Y; a "Texts" sub-dropdown (text space
  above/below, text max width, a "Colors" dropdown [projTitleColor →
  --proj-title-color, projBodyColor → --proj-body-color; mobile .m-bt-* use the
  same vars] and a "Title glyph" dropdown [projGlyphShow → html.proj-glyph-off,
  projGlyph (preset list or Custom… text) → --proj-glyph as a CSS string,
  projGlyphColor → --proj-glyph-color, projGlyphGap → --proj-glyph-gap — the
  .proj-text-title::before lead glyph, default →]), a "Dividers" sub-dropdown (Full length toggle +
  divider space above/below), and a "Buttons" sub-dropdown holding the Play
  button (text-field label, Default + Hover states and Align). The Back button
  and its controls were removed.
- About page: Margin X, Margin Y, Column split, then four sub-dropdowns —
  Layout (which column / which order for bio, accolades and hero + Gap between
  blocks), Bio (Max width + Text), Accolades (Max width + one editor per
  section, each with a Title and a per-item Main/Detail list) and Hero image
  (Show / Size / Align in column). See "## About page".
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
  radial → 100 = rectangular], Tint, Tint strength) and a "Scroll" sub-dropdown (Scroll speed 0.1–10 =
  wheel impulse per nudge [window.LIST_SCROLL_SPEED], Scroll smoothing 0–1 =
  momentum friction [window.LIST_SCROLL_SMOOTHING; 0 = immediate/linear, 1 =
  max glide; decoupled from distance — the wheel impulse is normalized by
  (1-friction) so distance stays constant as smoothing changes],
  Infinite scroll toggle [off = finite list with hard top/bottom limits;
  listInfinite is in listLayoutKeys so the gallery rebuilds], Snap to project,
  Snap speed, and Snap time [0–2s literal idle DELAY after scrolling stops
  before the snap fires: 0 = immediate, higher = longer pause; maps directly to
  ms in list-gallery.js]).
  SCROLL METHOD (List Display → Scroll → Method; listScrollMode → LIST_SCROLL_MODE,
  'step' default | 'classic'). The sliders above are CLASSIC only (momentum glide →
  idle Snap time → lerp to nearest). STEP (see "STEP SCROLL" in list-gallery.js):
  every gesture resolves to a project at once and a critically damped spring
  (analytic closed form — frame-rate independent, keeps velocity on retarget) glides
  there in Glide time (listStepDuration → LIST_STEP_DURATION s, ≈99% settled).
  Mouse wheel (isMouseWheel: wheelDelta ±120 multiples, not the trackpad 3×deltaY
  ratio; Firefox deltaMode 1) = one project per notch, ≥70ms apart. Trackpad = one
  project once a swipe has travelled Swipe distance (listStepSens → LIST_STEP_SENS
  px); after that step the gesture's momentum tail (smoothed deltas falling) is
  ignored, and only a clear RISE out of the tail (a fresh flick) re-arms; a 160ms
  gap ends the gesture. Drag = 1:1, release velocity picks the project and seeds the
  spring. The target may lead what's on screen by ≤3 projects. ↑/↓ keys step in BOTH
  methods (ignored while typing / in Tweaks / mid reel-intro; held keys ≤1 per
  110ms). Reel hand-off: in step mode ListGallery.atTop() is false while a step is
  gliding or its swipe is still streaming, and ListGallery.stop() (reel intro
  consuming a wheel) marks the gesture as used — so momentum never slides the reel
  back or steps a project after the reveal; a NEW flick does. Perf (both methods):
  .is-active is re-applied only when the active project changes (was every frame
  on every copy), and the track transform (translate3d) is written only on change.
  - Gallery Display: a shared Aspect (free|conform, + when conform: Aspect ratio
    16:9/4:3/3:2/1:1 + Flip ratio), an "Info text" sub-dropdown, a "Row settings"
    sub-dropdown, a "Scroll" sub-dropdown, and a "States" sub-dropdown holding
    the "Hovered" / "Unselected" / "Inactive" state sub-dropdowns. (The Column
    order and its ORDER toggle are
    GONE — the gallery is row order only.)
    · Info text: Show all (galInfoAlways — persistent info over every tile),
      then the per-part visibility toggles (Show title / Show mini description /
      Show tags), a "Sizes" nested dropdown (Title size, Title leading, Mini
      description size, Tags size) and a "Position" nested dropdown (Align
      left/center/right, Position X, Position Y, and a "Per project" dropdown
      nested INSIDE it with per-project X/Y sliders — the galInfoPos map).
      ("Invert over thumbnails" was removed.) SIZES + positions are
      SCALED by the gallery's scaleFactor() (content-section width) so the text
      keeps its size + position RELATIVE to the thumbnails as the window scales
      — the composition is maintained; leading is a ratio, so it's unscaled.
    · Row settings: Rows, Thumbnail size, Thumbnail conformity = HEIGHT conformity
      (FREE only), Row spacing, Column spacing, Row offset (±200), Column offset
      (±200), Rows X, Rows Y, Align (top/center/bottom).
    · Scroll: Scroll speed [window.GAL_SCROLL_SPEED, wheel/drag multiplier] +
      Scroll smoothing [window.GAL_SCROLL_SMOOTHING, 0 = snappy, 1 = a ~1.2s
      spring glide that keeps rolling after the wheel stops — see the SCROLL
      notes on js/gallery-display.js].
    · Inactive / Hovered / Unselected: each has Opacity/Saturation/Blur/Edge
      shape/Tint/Tint strength. :has()
      picks the state — nothing hovered → all Inactive; a tile hovered → it
      Hovered, others Unselected. HOVERED additionally leads with "Show hover
      scale" (galShowHoverScale — a preview toggle that scales EVERY thumb to
      its hovered size while inactive, for quick composition testing; stamped as
      .preview-hover-scale on #gallery-stage, a stable ancestor a grid rebuild
      can't wipe) and "Hover scale" (galHoverScale, 1–3 → --gal-hover-scale).
    All sizes/gaps/offsets scale responsively with the window.
  - Switch button: X (from right), Y (from top), Size,
    a List glyph dropdown (glyph + radius), a Gallery glyph dropdown (glyph +
    radius), Gallery → List and List → Gallery dropdowns (Ease in / Ease out % +
    Transition speed ms each), and a Style dropdown (Default/Hover state styling
    like Back/Play).
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


## Home page top scroll marker (Tweaks → Scroll markers → Home page top)
Moved out of Reel; the list markers live in Scroll markers → Project list.
No longer measured off the video (reelMarkerX/Y are dead). Placement
reelMarkerPlace → REEL_MARKER_PLACE:
- 'content' (default): inside .home-reel (rides up with the reel); bottom =
  reelMarkerContentY px from the window bottom, left = centre of the main
  content section (--left-w → right edge; 0 when collapsed / full page) +
  reelMarkerContentX.
- 'toolbar': reparented to <body> (.in-toolbar, fixed, z 250 — .home-reel paints
  under the panel); top = .lp-home-bio rect bottom + reelMarkerTbY, so it
  follows the bio as it reflows; reelMarkerTbAlign left/center/right within the
  panel's --left-pad margins. Falls back to 'content' when .tb-collapsed.
Recomputed in refreshMarker() (every apply() frame + resize + HomeIntro.refresh).
HIT-TESTING: .scroll-marker.reel-marker is pointer-events:none and only
.is-visible turns it on. It fades to opacity 0 once the reel is scrolled past
but used to stay clickable — in its toolbar placement (fixed, z 250 over the
panel) it silently ate hovers / clicks on whatever sat beneath (it blocked the
toolbar filter buttons, e.g. All, at some window heights).

## Toolbar bio (Toolbar → Bio)
Controls: Show bio, Show only on reel (+ Exit / enter Fade|Slide), Y, Align,
Text (bioShort, multiline; \n → <br>), and a "Links" dropdown (see "## Bio
links"). Current copy: "works across art direction, tech art, animation and
illustration to shape how games look, move and feel." with the four
disciplines linked (art direction → bloom, tech art → consumania, animation →
loop-troupe, illustration → illustrations). Link phrases should NOT include
trailing punctuation (it gets coloured/underlined too).

## Bio only on the reel (Toolbar → Bio → "Show only on reel")
bioScrollHide (default ON → html.bio-intro), bioScrollAnim 'fade'|'slide'
(html.bio-fade | html.bio-stagger — slide is ALWAYS staggered per line; the
old whole-block "All" mode / bioSlideMode was removed). applyTweaks only
rewrites the bio's innerHTML when the text changed (bio.__src) — rewriting it
every call wiped the .bw spans while __split stayed true, which is what made
the stagger do nothing; prepBioLines also re-splits whenever .bw is missing,
and home-intro.js calls it on enter + before the first slide frame. Driven by
--intro-p like the other toolbar slides, scoped to route-home.intro-live and
not .tb-collapsed. Stagger: prepBioLines() (index.html; run from
syncLogoGlyph, resize and applyTweaks) wraps the bio's words in .bw
inline-blocks once per rendered element (text nodes only), groups them into
lines by offsetTop and stamps --r (exit rank, last line = 0) + --ld (line's
right edge + 2px); the bio gets --bd / --bspan (0.45 of the scroll is the
stagger spread).

## Bio links (Toolbar → Bio → Links)
bioLinks = [{phrase, target, color, hoverColor, video, mode, filter}].
CLICKS ARE HANDLED IN CODE (delegated document click, index.html after
linkifyBio): preventDefault, then location.hash = href for internal targets,
window.open for http(s), top-level location for mailto. NEVER rely on the
browser following an in-page <a href="#/…">: the site's viewer resolves it
against a different base address, so it reads as leaving the page and is
blocked (reproduced with a <base href> test page). Everything else in the
site navigates via location.hash / setHash for the same reason.
LINK TYPE (mode): 'page' (default — target: project id / 'about' / URL) or
'filter' → href '#/filter/<key>' ('#/' for All) + data-filter; the click sets
that route (= clicking the filter button) and calls HomeIntro.reveal() (new:
plays the reel → list slide, same as the down marker) so the page scrolls down
to the filtered list. Editor offers the CURRENTLY ENABLED filters
(window.filterDefs) and warns if the saved one has been switched off (it then
falls back to All via validFilter).
PINNED HOVER MEDIA on a filter-link click: the click calls BioHover.pin()
(index.html hover IIFE) BEFORE changing the address, so the clicked link's
clip / still / slideshow stays on through the reel → list slide (mouseover,
mouseleave and the home-route hashchange are ignored while pinned; its video
pauses once the reel is fully off-screen). HomeIntro.apply() reports
(p, target) every frame via BioHover.onProgress: the pin ARMS once target hits
1 (the route re-render reports target 0 before the slide starts, so it must not
release then) and RELEASES on the first move back up (target < 1) — hover is
normal again from there. A non-home route also releases it. applyTweaks builds
window.BIO_SHORT via linkifyBio(): first case-insensitive match of each phrase
(whole word at letter edges, outside tags / existing <a>) → <a class="bio-link"
data-bl data-v="<video path>" style="--bl-c;--bl-h">. target = project id
('#/project/<id>'), 'about', or an http(s)/mailto URL (http opens a new tab).
Colours accept palette refs (resolved inside linkifyBio — resolveColorRefs only
walks top-level keys). Underline is set on .bw too (text-decoration doesn't reach
inline-blocks). HOVER VIDEO: a delegated mouseover handler (index.html IIFE)
lazily creates one muted looping <video> per clip in #home-reel-alt — a
sibling AFTER .home-reel-frame inside .home-reel-bound, so it covers the BOX
itself (object-fit:cover, object-position from --reel-vx/vy, overflow hidden;
NOT inside the 16:9 frame, which in Fill mode is bigger than the box and
over-scaled the media; the reel tint does not cover it) and
toggles .on — an instant cut, only once the clip has a frame; all clips in the
bio are created (preloaded) when the pointer first enters the bio. Paused on
leave / hashchange; desktop + route-home only. #home-reel-alt video is in
media-power's SKIP list. The panel's video dropdown lists every mp4/webm/mov in
the projects data (bioVideoOptions in tweaks-app.jsx, same path rule as
assetPath) — AND every image (jpg/png/gif/webp/avif; ▶ marks videos, grouped
per project). A still gets an <img> in #home-reel-alt instead of a <video>
(shown on load / when complete); the "Hover media" key is still L.video. The reel itself keeps playing underneath.

## Page content editor (Project page → Page content)
projLayout = { <pid>: { order: [key…], flow 'strict'|'fill', info {year, desc,
tags}, blocks: { <key>: { place 'auto'|'left'|'center'|'right'|'both', hidden,
mode 'beside', title, body, newRow, size, spaceAbove, spaceBelow, and for
slideshows slides / ssSpeed / ssGap / ssRatio } } } } — full per-field notes in
the SIZE / SPACE / SLIDESHOW sections below.
KEY = projBlockKeys(): type|(src || title || first image)#occurrence, read from
the AUTHORED data (so text overrides don't change it). A block may PIN its key
with `key: '…'` — use this when swapping a block's file, so saved layouts
(disk + LS mirror) keep pointing at it (e.g. loop-troupe's
Sam_Lineup_Horiz_Apha.png keeps 'image|Sam_Lineup_Horiz.jpg#0'). Globals in index.html:
projOrderedBlocks(p, L) (effective order incl. hidden; keys not in L.order keep
their authored slot) and resolveProjectContent(p) (filters hidden, merges
title/body, sets __place / __mode / __key, deletes col when placed). Desktop
renderProjectStandard uses it + decorateBlock() (stamps data-bk + place-* /
mode-beside on the root .proj-block); mobile renderProject uses it for order /
hidden / text only. applyTweaks re-renders the open page via
window.rerenderProjectContent() (keeps scroll) when the JSON changes. No entry =
authored content, byte-identical except the data-bk attribute.
CSS: .proj-grid > .proj-block.place-left|right|both|center (beats .full /
.proj-row; center = spans the row, one column wide, justify-self:center; no
title-beside-body for center/right);
.mode-beside → .proj-text-inner becomes a copy of the page grid (title col 1,
body col 2), block spans both; only offered when not placed Right. Editor
(ProjectContentEditor, tweaks-app.jsx) lists every block of the chosen project
(follows the open route), hover row → .bk-hl outline on the page. Placement
locked full for divider / hscroll / posters (special systems untouched); a Row
(N side-by-side items, e.g. the 3-up Illustrations rows) is one block and can
be placed. Playground + standalone-posters projects are excluded.
Also: Dividers → Show dividers (projDividersShow → html.proj-dividers-off →
visibility:hidden, so the divider's space above/below stays; also mobile
.m-proj-body .m-divider); Texts → Title to body spacing
(projTextTitleGap → --proj-title-gap, default 12 = old margin), Title underline
(projTitleRule → html.proj-title-rule; rule at gap/2, colour projTitleRuleColor
→ --proj-title-rule-c; stack mode only; mobile gets the rule too).

EMPTY SPACE / FLOW: .proj-grid is grid-auto-flow:dense by default (later 1-col
blocks backfill holes — which reordered content visually vs the list).
L.flow 'strict' (DEFAULT for any page with a projLayout entry) | 'fill' →
window.projStrictFlow(p) adds .pc-strict (grid-auto-flow:row): exact list
order, empty cells allowed. Per block o.newRow → __newRow → decorateBlock
prepends <div class="pc-break"> (full-width, height 0, margin-top −gap-y so
spacing is unchanged) to force the block onto a fresh row.

PROJECT INFO (Page content → Toolbar, above Empty space): projLayout[pid].info
= {year, desc (HTML ok), tags [keys, ordered]}. applyProjInfo() (index.html,
run whenever projLayout changes, incl. first apply) MUTATES each project's
year/desc/tags from p.__orig + info, so the project toolbar, home list mini
info, gallery hover, filters and mobile all read the overrides with no other
code changes. On change it calls window.refreshProjectLeft() (portfolio.js:
setLeftProject + fitLogo). Info-only entries do NOT flip the page to strict flow (projStrictFlow: explicit
L.flow wins, else strict only when order / blocks edits exist).

SIZE (Page content → Size, media + rows only): o.size (40–200 %, 100 =
default, stored only when ≠ 100) → b.__size. In STRICT flow
projAssignRows(list) (index.html) replays sparse grid auto-placement
(projEffPlace = override or projDefaultPlace, mirrors the editor's
pcDefaultPlace) to group blocks into rows and stamps b.__row, b.__gc (explicit
grid-column) and b.__geo / b.__sz — SUPERSEDED pair/lone math: see "## Per row
(2 / 3)" (6 tracks, .pc-sz-g with --pc-gw / --pc-gm in 100cqw + N·gap units).
Both only narrows; Center up to the row (.pc-sz-both / .pc-sz-center + --pc-w).
In fill-gaps flow only lone Both / Center blocks size. --proj-cols is
repeat(6, minmax(0,1fr)) so overflowing content can't widen a track. The weight lives on the block, so it travels with
it when reordered; its new neighbour's weight decides the new split.

SPACE (Page content → Space above / Space below, every block type): o.spaceAbove
/ o.spaceBelow px (0–400, stored only when > 0) → b.__sa / b.__sb →
.pc-space + --pc-sa / --pc-sb margins on the grid item (added on top of the
row gap). In a shared row only that block moves and the row grows (the editor
note says so). Mobile applies the SAME px as spacer divs around the block in
the single column. Travels with the block on reorder, like size.

PROJECT DESCRIPTION TYPE: the toolbar .lp-proj-desc has its own style, prefix
"pdesc" (pdescSize/Weight/Leading/Tracking → --pdesc-*; Typography → Project
Description), seeded from the Text Body values. Falls back to --body-* if unset.

## Tags — commas + editable tag list (Tweaks → Tags)
- Commas (tagCommas, regular style only → html.tag-commas): ::after ',' on
  every .tag-row .tag-pill but the last (also mobile .m-proj-tags /
  .m-lbl-tags spans).
- Tag list (tagList = [{key, label, text?, fill?, outline?}]; absent = the
  authored tagDefs, snapshotted as window.__tagDefsAuthored). applyTagList(t)
  (index.html, after tagDefs; also called from applyTweaks) rebuilds tagDefs IN
  PLACE (mobile-app / portfolio hold the same array), sets window.__tagDeleted
  for authored keys missing from the list (window.tagIsDeleted(k) — portfolio
  tagPillsHTML, gallery-display, mobile tagSpans skip them), and writes per-tag
  colours into <style id="tag-colors"> as html body [data-tag="k"] rules
  (fill/outline only when boxed; palette refs resolved). Every tag render
  carries data-tag. Keys are fixed at creation (new = tag, tag-2…), so renaming
  keeps projects linked. The project-page tag picker reads window.tagDefs live.

LINK UNDERLINE: every text link's hover underline (project desc, text-box body,
about bio, toolbar bio links incl. their .bw spans) uses --link-ul-w /
--link-ul-off (Typography → Link underline: linkUlWidth px, linkUlOffset em).

BIO LINK SLIDESHOW: a link with slideshow:true + slides:[paths] renders
data-ss='[JSON]' instead of data-v. Hover builds (once, cached by the JSON) a
.bl-ss flex strip in #home-reel-alt: every item height:100% of the BOUNDING
BOX (never upscaled past it), width by native aspect, gap --bl-ss-gap
(bioSsGap). A rAF loop (only while hovered) moves it RIGHT at BIO_SS_SPEED
px/s (bioSsSpeed) with translate3d(off − setW), setW = offsetLeft of the 2nd
copy's first item; copies are appended until they cover box + 2 sets (cap
40). Videos in the strip play only while shown. Editor: Hover media = Single
| Slideshow, per-slide pickers (↑ / × / + Add slide) + a shared "Slideshow"
dropdown (Speed / Gap) under Links.

SLIDESHOW block (type 'slideshow' — first use: Bloom, under the embed, pinned
key 'slideshow|bloom#0'): { images:[...], ratio:'16/9', speed px/s, gap px,
full }. Page content → block → "Slideshow" dropdown edits o.slides (paths
relative to assets/, e.g. 'bloom/Banner_054.jpg' — assetPath treats a slash as
assets-relative), o.ssSpeed, o.ssGap; "Box ratio" (o.ssRatio) sits at the
block's TOP level (not inside the Slideshow dropdown): 21:9, 16:9, 3:2, 4:3,
5:4, 1:1, 4:5, 3:4, 2:3, 9:16 (stored only when ≠ the authored ratio).
Resolver maps them onto the block. Renders .proj-slideshow.pss-box (desktop) / .m-slideshow.pss-box
(mobile): fixed-ratio box, .pss-strip flex of items at 100% box height,
native-aspect widths. window.ProjSlideshow.init(root) (index.html) runs ONE rAF
loop for every box: drifts at data-speed — SIGNED (Speed −300…300 px/s:
+ right, − left, 0 holds still; parsed with isNaN, so only a missing value
falls back to 40) — appends copies until box + 2
sets are covered, idles + pauses its videos when off-screen, drops detached
boxes. Placement / Size / Space / Show work like any other block.
INTERACTIVE slideshow (block `interactive: true` + `arrow` glyph; Page content →
block → Slideshow → Interactive (o.ssInteractive) / Arrow glyph (o.ssArrow),
resolver maps them onto b.interactive / b.arrow). Renders box[data-interactive]
+ two .pss-arrow buttons (window.pssArrowsHTML, shared by portfolio.js +
mobile-app.js; ONE glyph, drawn pointing right — prev mirrors it with
scaleX(-1); no button chrome, see "Glyph" below). ProjSlideshow
bindInteractive(): arrows step so the image after / before the CURRENT one
(= left edge nearest the box's left edge) meets the left edge, wrapping across
the set; pointer drag moves the strip 1:1 then flings (a vertical swipe is left
to the page; touch-action pan-y); a drag swallows the next click so it never
opens the lightbox; SIDEWAYS wheel / shift+wheel scrolls the strip while
vertical wheel always goes to the PAGE (an endless strip must not trap page
scrolling). User motion goes through S.pend (eased in); any input zeroes the
drift (S.driftK) and holds it HOLD = 1.2s, then eases it back. First use:
'slideshow|illustrations-swissa#0' (Illustrations page, replaced the Swissa
hscroll; 16:9, gap 12, speed 40, arrow →; images 1-web / Double2-web /
Double3-web / 6-web).
  Arrows are JUST the glyph now (no button chrome; padded hit area). Page
  content → block → Slideshow → "Glyph" dropdown (interactive only): Glyph
  (o.ssArrow), Size (ssArrowSize), Color (ssArrowColor), Hover color
  (ssArrowHover) → b.arrow / arrowSize / arrowColor / arrowHover → inline
  --pss-arrow-size / -color / -hover on the box (window.pssBoxVars; colour rows
  may hold a '@colorX' palette ref — pssCol resolves it). Also Rotation
  (ssArrowRot 0/90/180/270 → b.arrowRot → --pss-arrow-rot: next = rotate(r),
  prev = scaleX(-1) rotate(r), i.e. the rotated glyph MIRRORED — an up-pointing
  🢑 at 90° gives → / ←) and X offset (ssArrowX 0–300 → b.arrowX →
  --pss-arrow-x = each button's distance from its slideshow edge; the button's
  8px padding sits inside it; default 4px; the box clips, so no negatives).
  CURSORS (interactive boxes): over a SLIDE a custom 32×32 SVG "grab + zoom"
  cursor (inline data: URL in the .pss-strip > img rule, hotspot 13 21,
  fallback zoom-in) — a white open hand (ONE traced outline path: slender
  rounded fingers with short separation lines, thumb angled out left, palm
  rounding in to the wrist; compressed to 75% height in its COORDINATES, not a
  transform, so the outline weight stays even) drawn in three layers (white
  outer edge 4.2 → black outline 1.3 → white fill), modelled on the standard
  grab hand the playground uses; a + magnifier at its top right in the same
  three-layer style. Must stay ≤ 32px (Chrome swaps larger cursor images near
  the window edges) and the data URL must %-encode '#' (a raw '#' ends the URL
  — the first attempt failed to decode). Gaps between slides: plain grab.
  PRESS = closed hand at once: pointerdown adds .pss-grabbing (cursor:
  grabbing) before any movement; cleared by a window-level pointerup /
  pointercancel listener, which also ENDS the press — a press that left the
  box before a drag began is never captured, so without it the stale press
  turned into a drag when the mouse came back.
  DIVIDER ("Divider" dropdown, any slideshow): ssDiv toggle, ssDivGlyph
  (default ✦), ssDivSize, ssDivColor, ssDivSpace (default 160) → b.divider /
  divGlyph / divSize / divColor / divSpace. window.pssDividerHTML puts ONE
  .pss-div at the START of each set (so every loop boundary gets one): width =
  Spacing, margin 0 −gap on both sides, so last→first slide is EXACTLY Spacing
  with the glyph centred. Arrow stepping skips .pss-div (slides-only P list).
  The divider holds THREE glyph slots (.pss-dg top / mid / bot at 25% / 50% /
  75% of the box height — top + bottom sit midway between the centre and the
  upper / lower edge); toggles ssDivTop / ssDivMid / ssDivBot (default on,
  stored only as false) → b.divTop / divMid / divBot; all share Glyph / Size /
  Color.
  START FROM END (ssFromEnd → b.fromEnd → box[data-from-end], pssBoxAttrs):
  ProjSlideshow waits until every slide of the first set has its real width,
  then sets off so the LAST slide's right edge meets the box's right edge
  (off = mod(w + boxW − lastR, w)); the drift holds still until then.
  START WHEN IN VIEW (ssWaitView → b.waitView → box[data-wait-view]): no drift
  until 75% of the box (or of the window, if taller) is on screen; any
  interaction starts it too. Authored on for Swissa + Avira.
  EDITOR ORDER for a slideshow block: … Space above / below, Size, then the
  "Slideshow" dropdown (slides, speed, start from end, start when in view, gap,
  interactive, Glyph [glyph, size, rotation, X offset, colours], Divider).
- ROW blocks → Page content "Images" dropdown (o.rowImages: paths relative to
  assets/, like slides; ↑ / × / + Add image). The resolver maps each entry back
  onto its AUTHORED item when the file matches (so w / maxW / scale survive),
  new files render plain.
- ILLUSTRATIONS posters (Nov 2026): the 'posters' block (posters-gallery.js) was
  REPLACED by normal content — first as five row blocks, then (same day) as 15
  INDIVIDUAL image blocks (per: 3) in the old postersOrder, so every poster has
  its own Page content controls. Each has an AUTHORED `size` ∝ its aspect ratio
  (mean 100 per line of three): the strict flow splits a shared line by size, so
  the three keep one height — the old equal-height rows. The Blood, Hair, Limbs
  rows were split the same way (6 image blocks, per: 3; equal aspects → equal
  thirds, no sizes needed; the photos' old maxW 92% inset was removed — normal
  grid spacing).
  AUTHORED `size` (any sizable block): resolveProjectContent uses o.size, else
  b.size; the editor's Size slider shows / resets to it. projStrictFlow(p) is
  TRUE when a page authors any block size (sizes only split lines in the strict
  flow), even with no Page content edits. The
  Tweaks → Posters gallery section was removed (postersCols / gaps / hover scale
  / postersOrder / postersDescData no longer drive anything; the per-poster
  hover descriptions + hover zoom went with it). posters-gallery.js and the
  'posters' block type remain in code but no page uses them.
- Scroll markers: Color + Hover color for Project list (scrollMarkerColor /
  scrollMarkerHover → --smk-list-*) and Home page top (reelMarkerColor /
  reelMarkerHover → --smk-reel-*); unset falls back to the center marker
  colour. The list pair is now hit-testable while shown and a click steps one
  project (list-gallery.js, same stepBy as the ↑/↓ keys).

## Content changes log (Nov 2026)
- ILLUSTRATIONS (Nov 9): new image block 'Avira-fruits.png' (transparent PNG,
  2000×1822, full: true) inserted after the Avira text, before the lettering.
  The two Avira 2-up rows (Chimney-1 / Inhaler-1, Mask-2 / Oxygen-1 — all
  1:1) became ONE slideshow, pinned key 'slideshow|illustrations-avira#0',
  authored to MATCH Swissa's tuned Page content settings: 16:9, speed 30, gap
  0, interactive, arrow 🢒 (U+1F892) size 43, hover @colorHighlight, X 10,
  divider ✦ middle-only, fromEnd + waitView. Page order now: … 29 Avira text,
  30 fruits, 31 lettering, 32 Avira slideshow, 33 All-1-web.
- CONSUMANIA: its six 2-up 'row' blocks were split into individual image /
  localvideo blocks (localvideo gets full:false + its ratio so it can sit in one
  column); Image-Sequence_002_0000.jpg + Image-Sequence_075_0000.jpg were then
  removed from the page AND deleted from assets/consumania/.
- BLOOM: Banner_091.jpg + Banner_103.jpg removed + deleted from assets/bloom/.
  Slideshows (all pinned keys): 'slideshow|bloom#0' under the embed (banners
  054/074/079 — those image blocks are hidden via Page content),
  'slideshow|bloom-concepts#0' under Flower-Stages-ConceptArt-02 (SketchesCombo-
  02, Tech-Art-Blockout-3-b, IdeaSketch-01c — their image blocks were removed),
  'slideshow|bloom-sketches#0' (the former 4-up row: IMG_2474 / IMG_2462 /
  IMG_2427 / GXYL1315). Text blocks 'text|bloom-sketches#0' (before that
  slideshow) and 'text|bloom-references#0' (before All-References-02.jpg, which
  is a full-width image after the slideshow). Sole-Moodboard.jpg is in
  assets/bloom/ but not placed yet.
- Converting a block's TYPE changes its key; give the new block a pinned
  `key` and (only if the saved order lists the old key) swap the key in
  projLayout.order — see the AGENT RULE under Tweaks persistence first.

## Project buttons (toolbar, under the description)
projLayout[pid].buttons = [{type:'text'|'image', href, label?, src?, size?, tint?, color?, hoverColor?}]
(edited in Tweaks → Project page → Page content → Toolbar → Buttons). UNSET = the
authored `p.play` as one text button, so pre-existing Play buttons survive.
window.projButtonsHTML(p, {wrap,text,img}) (index.html) renders the row for BOTH
desktop (.lp-btns/.lp-play/.lp-ibtn) and mobile (.m-btns/.m-play-btn/.m-ibtn).
TEXT buttons share one global look (Project page → Buttons → "Text button", formerly
"Play button": playLabel/playAlign/play* state vars); a per-button label overrides the
text only. IMAGE buttons = a white png/svg recoloured with a CSS mask (--ib-c / --ib-hc,
palette @refs resolved via window.__palette), height = Size; image list = BUTTON_IMAGES
(assets/general/) + every project image. Align moves the whole ROW (justify-content);
Space between = --btn-gap (btnGap); Space above/below (playGap/playGapBelow) sit on the row.
applyTweaks re-renders the project toolbar when buttons or the palette change (__btnSig).

## Per row (2 / 3) — project page grid
.proj-grid is SIX tracks (--proj-cols = repeat(6, minmax(0,1fr))): a 2-per-row block
spans 3, a 3-per-row block (.pc-3) spans 2, full spans 1/-1. Per row is set per block
(projLayout[pid].blocks[key].per = 3) or as the page default (projLayout[pid].per = 3);
Columns gains "Middle" for 3-per-row blocks. projAssignRows (index.html) models rows in
track units (cell = {t start, k span}) and stamps every non-full block with an explicit
b.__gc grid-column. SIZE in strict flow = b.__geo {w, m} → .pc-sz-g (--pc-gw width,
--pc-gm margin-left), lengths in 100cqw + N·gap (.proj-grid is container-type:inline-size):
a shared row splits by k·size weights and fills its span exactly; a lone cell grows from
its anchored side (middle = centred), capped at the full row. Both/Center keep the
.pc-sz-both / .pc-sz-center classes. Lightricks' old row blocks were split into single
localvideo blocks (3-per-row via overrides; LightricksReview size 178 matches the
square neighbour's height).
Per row precedence: block override (projLayout…blocks[key].per) > AUTHORED `per: 3` on the content block > page default. The Last Question's 3-up sets are authored `per: 3` in the data (survives a stale tweaks LS mirror that masks agent-side projLayout edits).
Authored `place` on a content block (e.g. Noodle's terrainsquare.gif: per:3, place:'middle') is the block's default placement (projDefaultPlace / pcDefaultPlace); an override still wins.

## Playground / posters hover description + gallery toolbar editing
#pg-desc (vid / poster title + body) is no longer an overlay that REPLACES the project
description: setLeftProject renders it as the LAST in-flow toolbar item (after the
description AND the button row), so show/hide (opacity) never moves anything above it.
.lp-proj-desc is never hidden (.pg-hidden removed from portfolio.js + posters-gallery.js).
Title→body gap = .proj-text-title's --proj-title-gap (the old 6px override is gone).
Spacing: Playground gallery → Vid Description → Space above / below (pgDescGapTop /
pgDescGapBot → --pgdesc-gap-top / -bot); the old Y offset (pgDescY) was removed.
Page content's project picker now includes gallery projects (Playground; any
postersImages project): they get ONLY the toolbar editors (year / tags / description /
buttons) — the block/flow/per-row controls are hidden for them.

## Content changes log (Nov 2026, cont.)
- ILLUSTRATIONS thumbnail = illustrations/Escape_Alpha_Thumbnail.png (posters-thumbnail.jpg deleted).
- LIGHTRICKS, THE LAST QUESTION, NOODLE: every 'row' block split into single blocks
  (3-up sets → per:3; Noodle's lone terrainsquare.gif → place:'middle').
- IMPRINT: Image Sequence 010/018/076/071 + CharactersMesh_Alpha.png / CharacterLineup.jpg
  are single blocks; the two 4-up storyboard rows became ONE full-width slideshow
  (pinned key 'slideshow|imprint-storyboards#0', 21:9). Swaps: EV-Diagram-2 → EV-Diagram-1,
  Sprites-3 → Sprites-3-PO.jpg, CharactersMeshWhite → CharactersMesh_Alpha.png;
  CharacterLineupAndSprites.jpg (full) added after Sprites-3-PO.
- BUTTONS: Being, Combotics, Consumania, Tryst, Trial and Error use itch image buttons;
  Bloom has Steam + itch image buttons (projLayout[pid].buttons).
- PLAYGROUND gallery currently: horizontal scroll, 3 rows, speed 30, gaps 80 / 70,
  thumb height 217, conformity 1, hover scale 1.4.

## Playground gallery engine (rebuilt Nov 2026 — js/playground-gallery.js)
SCROLL MODES (pgScrollMode → PG_SCROLL_MODE): free | horizontal | vertical. ONE axis model:
a TRACK is a row (main axis X; horizontal + free) or a COLUMN (main axis Y; vertical — the
grid is transposed, Rows slider = columns, Thumb height = column width, conformity mirrors:
1 = equal widths). Vertical columns shrink-to-fit the content width and centre. Free keeps
two stacked .pg-set copies for the Y loop; horizontal/vertical render one set.
SPEED: H speed (pgSpeed → PG_SPEED) drives free+horizontal, V speed (pgVSpeed → PG_VSPEED)
drives free+vertical. ROW OFFSET (pgRowOffset → PG_ROW_OFFSET, px, live — no rebuild): even
tracks shift −½·value, odd +½·value along the main axis (on top of PG_ROW_OFFSETS base phase).
HOVER is JS-managed (.is-hover via mousemove target + an elementFromPoint re-test every 4th
frame while the pointer is inside), NOT CSS :hover, so push / description / hover-play stay in
sync while content scrolls under a still cursor. MAKE ROOM (pgPush → PG_PUSH, 0..1.5): on
hover the tile's track-mates get .pp-a/.pp-b (slide ∓--pp-m = (scale−1)·mainLen/2·push) and
the other tracks' .pg-row-wrap get .pp-u/.pp-d (slide ∓--pp-c = max(0, scale·crossLen/2 −
band/2)·push); CSS transitions (--pg-hover-duration) do the motion; classes only change on
hover change. pgHoverPause (default off) eases auto-scroll to 0 while a tile is hovered.
PERFORMANCE: (1) visibility is ARITHMETIC from track geometry (canvas data-ri/mp/ml/x +
track.cur) — no per-frame getBoundingClientRect / getComputedStyle (those forced a style
recalc of ~200 tiles every frame); --left-w is read once per build. (2) Each source <video>
carries a frame STAMP bumped by requestVideoFrameCallback (fallback: every tick while playing
if rVFC never fires); a canvas redraws only when its stamp is stale. (3) manageSources (every
250ms) PAUSES a source with no on-screen tile for >600ms and resumes it when one returns —
also re-asserts the state after MediaPower's tab resume. (4) Track transforms are written only
when they change. (5) Document listeners bind ONCE (they used to stack on every mount).
HOVER-PLAY (pgHoverPlay → PG_HOVER_PLAY): every source paused; the hovered clip's
playbackRate eases 0.0625→1 (and back, then pause()) — Chrome rejects rates in (0, 0.0625);
only the hovered canvas (S.live) receives new frames, other tiles of that clip stay frozen.
OVERLAY: a capture-phase document click inside .left / #tb-expand / #tb-minimize closes an
expanded clip (the click still performs its own action).
Biggest remaining cost = decoding full-res sources (e.g. 1600×2000) for ~200px tiles —
encoding ~480px thumbnail proxies (overlay keeps the full file) would cut decode load most.
WHEEL: Scroll speed (pgWheelSpeed → PG_WHEEL_SPEED, 0.2–3×) scales wheel sensitivity + the
velocity cap; Reverse scroll (pgWheelInvert) flips it; Scroll direction (free) (pgFreeWheelDir
→ PG_FREE_WHEEL_DIR vertical|horizontal|diagonal) picks which axis the wheel drives in FREE mode
(the trackpad's sideways delta drives the perpendicular). DIAGONAL drives both at Diagonal angle
(pgFreeWheelAngle → PG_FREE_WHEEL_ANGLE, −90..90°, default 45): deltaY along (−cos θ, +sin θ) in
(velX, velY) — θ 0 = the horizontal mode, 90 = the vertical mode, negative = the other diagonal;
deltaX along the true perpendicular, sign chosen so its X part is ≤ 0 (sin θ ≥ 0 → (−sin, −cos),
else (sin, cos)). Drag is unaffected.
PUSH (revised): RADIAL FALLOFF replaces the whole-row / whole-track push. On hover change
applyPush() computes every tile's centre arithmetically (gal.items cache: ri/mp/m/c/x per
tile + trk[ri].cur), ring distance rn = √((dMain/(m+gapM))² + (dCross/(band+gapC))²), and
pushes each tile straight AWAY from the hovered centre by growth × Push strength (pgPush) ×
(1 − t)², t = (rn − 1)/Push area (pgPushArea, rings; 0 = touching neighbours only). Only
tiles with a push get an inline transform (cleared on unhover); .pg-item's transform
transition animates. Relative tile positions are scroll-invariant, so nothing runs per frame.
The .pp-a/-b/-u/-d classes + --pp-m/--pp-c vars are gone; .pp-on lifts the hovered track.
PUSH (revised again — supersedes RADIAL FALLOFF): applyPush() runs once per hover change on
tiles near the viewport (rects in main/cross units, arithmetic; tracks centre tiles on the
cross axis). Rings come from ADJACENCY BFS (rects facing across ≈ one gap), not centre
distance — so wide neighbours are ring 1 too. Desired push for ring k = hovered growth toward
it × Strength (pgPush) × q^(k−1), q = Reach/(Reach+1) (pgPushArea; 0 = ring 1 only). Then a
COLLISION GUARD, ring by ring outward: each tile is slid (least-movement axis; same-track →
main axis) until it keeps ≥ Min spacing (pgPushMin, fraction of the original gap, default .4)
from every already-placed tile — only outer tiles move, so pushes propagate outward and no
clip ever touches / slides under another. Labels: Push strength / Push reach / Min spacing.
PUSH guard (fixed): an OUTWARD SWEEP over ALL candidates (ordered ring, then distance) — no
early stop. Per pair the separating axis + sign are FIXED from the base layout (same track →
main; else the axis needing the smaller move at rest; sign from base centres), up to 6 passes
per tile, only the outer tile moves. This fixed big Hover scales (tiles flip-flopping axes /
3-pass limit left overlaps).
PUSH ON/OFF: pgPushOn → PG_PUSH_ON (false = no push; the grown clip overlays — .pp-on still
lifts its track). UNSELECTED CLIPS (Playground gallery → Unselected clips): while a clip is
hovered the viewport has .pg-has-hover; every other .pg-cell gets --pg-unsel-filter
(saturate pgUnselSat / blur pgUnselBlur px; literal none when neutral) and a ::after overlay
(--pg-unsel-tint from pgUnselTint palette ref, default @colorBg; --pg-unsel-tint-op =
pgUnselTintOp; display:none at 0). pgUnselPause → PG_UNSEL_PAUSE: on hover every source but the
hovered clip's is paused (manageSources, run immediately on hover change) and only the hovered
canvas redraws; unhover resumes the visible ones.
UNSELECTED overlay colour/strength REPLACED by Opacity (pgUnselOpacity → --pg-unsel-opacity on
the unselected .pg-cell; the ::after tint + pgUnselTint/pgUnselTintOp are gone). Blur stays
PER CLIP — a single backdrop-filter overlay was evaluated and NOT built: with Pause unselected
on, blurred tiles are static and cached in their track's composited layer (blur runs once per
hover), whereas a backdrop-filter re-blurs the whole viewport on every frame anything beneath
it changes (push transition, scrolling, the hovered clip's track) — no gain, often worse.
FAST-SWEEP FLICKER fix (Unselected clips → Release delay / Fade back): crossing the gap between
clips used to call setHover(null) at once, dropping .pg-has-hover so EVERY tile un-blurred and
re-blurred at each gap (strobe). Now setHover(null) is SOFT: held pgUnselRelease ms
(PG_UNSEL_RELEASE, default 200; 0 = immediate) with the old clip still hovered; entering another
clip within it swaps only the two clips. setHover(null, true) = HARD (drag start). On a
clip-to-clip swap the clip just left gets .pg-left for pgUnselFadeBack s (PG_UNSEL_FADEBACK →
--pg-unsel-fadeback, default 0.45; 0 = off), whose filter/opacity transition uses that duration
(ease-out) — ONLY that clip, so the first hover still dims the gallery at --pg-hover-duration.
Option NOT built yet: hover intent (switch only once the cursor slows / rests ~50–80ms).
HOLD-AND-DRAG KEEPS THE HOVER: onDown on a clip does NOT unhover — the grabbed clip (.is-held)
stays gal.hoverEl for the whole drag, so unselected look, push, description and Pause unselected
all hold. Hover is frozen while dragging (mousemove + tick re-hit skip during drag); it follows the
held clip only when the loop swaps it for another copy (tick held-swap → setHover(curr)). onUp →
setHover(itemAt(...)): same clip = no-op, other clip = swap, gap/outside = normal soft unhover
(Release delay). A drag from a gap unhovers at once (setHover(null, true)). The unselected rule
also excludes .is-held: `.pg-has-hover .pg-item:not(.is-hover):not(.is-held)`.
PUSH ACROSS TRACK WRAPS: each track loops independently (applyTransforms: pos = mod(phase,
period)), so after a wrap a DIFFERENT copy sits beside the hovered tile. applyTransforms bumps
gal.wrapGen when any track's loop count (floor(phase/period)) changes; applyPush stamps
gal.pushGen. tick: hoverEl && wrapGen !== pushGen → clearPush + applyPush(hoverEl), with a
one-frame .pg-snap on the viewport (no .pg-item transition) when not dragging — the result is
visually identical, so it must not animate. Matters mostly mid-drag (big moves → many wraps).
DRAG ARROWS (Playground gallery → Drag arrows): .pg-arrows (4 spans .pg-arrow-t/r/b/l) built in
mount() inside .pg-viewport, z-index 3, pointer-events none; glyph via ::before content =
--pg-arrow-glyph (quoted CSS string built in applyTweaks), drawn pointing UP and rotated per side
(r 90°, b 180°, l −90°; 1em square boxes so rotation keeps the inset). html[data-pg-arrows] =
off (pgArrowsOn false) | all | horizontal (L+R) | vertical (T+B) from pgArrowsMode. pgArrowSize →
--pg-arrow-size, pgArrowDist → --pg-arrow-dist; colour = --marker-color (same as scroll markers).
Arrow colour: pgArrowColor → --pg-arrow-color (ColorHexRow, palette refs OK; falls back to
markerColor).
Only while holding (pgArrowsDragOnly → html.pg-arrows-drag): .pg-arrows opacity 0, fading to 1
on .pg-viewport.is-dragging — i.e. from mousedown / touchstart until release, moving or not.
Panel (Playground gallery): "Hover" (Hover scale, Pause scroll on hover, Play only on hover, and
the sub-dropdowns "Clip pushing" + "Unselected clips"), "Gaps & thumb size", "Drag arrows",
"Clip order".
BLUR METHOD decided: PER CLIP (CSS filter on each unselected .pg-cell). The Overlay
(backdrop-filter) and In-canvas (low-res canvas) test methods + the FPS readout were removed.
HOVER RESOLUTION: hiRes() grows the hovered tile's canvas backing store to layout × Hover scale ×
devicePixelRatio (capped at the clip's native videoWidth) and redraws it immediately; unhover
restores w0×h0. Canvases carry an inline CSS height so the swap never shifts layout; each
canvas element holds its entry as el._cv. Non-hovered tiles still draw at 1× layout size.
