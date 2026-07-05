
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;top:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:top right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-x:disabled{opacity:.28;pointer-events:none}
  .twk-hd-actions{display:flex;align-items:center;gap:1px;cursor:default}
  .twk-hd-actions .twk-x{font-size:14px}
  /* edge drag strips — grab the panel from its left or bottom edge too */
  .twk-edge{position:absolute;z-index:3;cursor:move}
  .twk-edge-l{left:0;top:0;bottom:0;width:7px}
  .twk-edge-b{left:0;right:0;bottom:0;height:7px}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}
  .twk-valedit{display:inline-flex;align-items:baseline;gap:1px}
  .twk-numin{width:46px;text-align:right;border:0;background:transparent;
    color:rgba(41,38,27,.5);font:inherit;font-variant-numeric:tabular-nums;
    padding:1px 2px;border-radius:4px;-moz-appearance:textfield;cursor:text}
  .twk-numin::-webkit-outer-spin-button,.twk-numin::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
  .twk-numin:hover{background:rgba(0,0,0,.05);color:rgba(41,38,27,.78)}
  .twk-numin:focus{background:rgba(0,0,0,.08);color:#29261b;outline:none}
  .twk-unit{color:rgba(41,38,27,.4)}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-sect-top{border-top:1px solid rgba(41,38,27,.16);margin-top:12px;padding-top:14px}
  .twk-sect-top:first-child{border-top:0;margin-top:0;padding-top:0}
  /* master section titles read slightly larger; nested (sub) dropdown titles
     read smaller and non-uppercase. Each nesting LEVEL wraps its title+body in
     a .twk-subwrap rail (border-left + indent), so deeper dropdowns step
     progressively further right and the hierarchy is legible at a glance. */
  .twk-sect.twk-sect-top{font-size:11.5px;color:rgba(41,38,27,.5)}
  .twk-sect.twk-sect-sub{font-size:9px;text-transform:none;letter-spacing:.02em;
    font-weight:600;color:rgba(41,38,27,.5);padding:8px 0 0}
  .twk-subwrap{margin-left:4px;padding-left:9px;
    border-left:1.5px solid rgba(41,38,27,.13)}
  /* state caption inside a dropdown (Default / Selected / Hover) */
  .twk-substate{font-size:8.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
    color:rgba(41,38,27,.4);padding:9px 0 1px}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
// UNDO/REDO: every committed change (one per settle/release, NOT per slider
// tick) snapshots the full value set. Snapshots are flat primitives (~1-2 KB),
// so a deep history is cheap; capped at MAX_HISTORY. The third return value is
// a `history` handle ({ undo, redo, canUndo, canRedo }) the panel wires to its
// header buttons + ⌘Z / ⇧⌘Z.
const MAX_HISTORY = 50;

// keys of `to` whose value differs from `from` (so undo/redo only writes what
// actually changed). Arrays/objects compared by JSON.
function tweakDiff(from, to) {
  const out = {};
  for (const k in to) {
    const a = from ? from[k] : undefined, b = to[k];
    const same = a === b
      || (a && b && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));
    if (!same) out[k] = b;
  }
  return out;
}

function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Persistence is DEBOUNCED: visual state updates immediately (so the UI is
  // live while dragging a slider), but the host postMessage that rewrites the
  // on-disk EDITMODE block — the slow part — only fires after edits settle.
  const pendingRef = React.useRef({});
  const timerRef = React.useRef(null);
  // valuesRef mirrors `values` synchronously so flush/undo/redo can read the
  // authoritative current set without waiting on a React render.
  const valuesRef = React.useRef(defaults);
  // history: undoRef holds prior committed snapshots (oldest→newest), redoRef
  // holds undone ones. baselineRef = the last COMMITTED snapshot (the point a
  // new gesture diverges from). bump() re-renders so the buttons enable/disable.
  const undoRef = React.useRef([]);
  const redoRef = React.useRef([]);
  const baselineRef = React.useRef({ ...defaults });
  const [, bump] = React.useReducer((x) => x + 1, 0);

  // push a full state to React + the synchronous LS mirror + the host disk
  // write. `changed` limits the persisted/broadcast keys to what differs.
  const applyState = React.useCallback((state, changed) => {
    valuesRef.current = state;
    setValues(state);
    pendingRef.current = {};
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (changed && Object.keys(changed).length) {
      if (typeof window.persistTweaks === 'function') {
        try { window.persistTweaks(changed); } catch (e) {}
      }
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: changed }, '*');
      window.dispatchEvent(new CustomEvent('tweakchange', { detail: changed }));
    }
  }, []);

  const flush = React.useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const edits = pendingRef.current;
    if (!edits || Object.keys(edits).length === 0) return;
    pendingRef.current = {};
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    // COMMIT a history step: the gesture that just settled becomes one undo
    // step. Push the pre-gesture baseline; current values become the new one.
    undoRef.current = [...undoRef.current, baselineRef.current].slice(-MAX_HISTORY);
    redoRef.current = [];
    baselineRef.current = { ...valuesRef.current };
    bump();
  }, []);

  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    const next = { ...valuesRef.current, ...edits };
    valuesRef.current = next;
    setValues(next);
    // SYNCHRONOUS safety net: mirror to localStorage immediately so the edit
    // survives a refresh even if the (async) host disk-write hasn't landed yet.
    // See window.persistTweaks in index.html — it self-heals and never masks a
    // real on-disk edit.
    if (typeof window.persistTweaks === 'function') {
      try { window.persistTweaks(edits); } catch (e) {}
    }
    // accumulate edits; release (pointer/key up) commits them. This timer is
    // only a safety net for edits with no release event — long enough that a
    // momentary pause mid-drag never triggers it.
    Object.assign(pendingRef.current, edits);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 1200);
    // Same-window signal so in-page listeners can react immediately.
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, [flush]);

  const undo = React.useCallback(() => {
    flush(); // commit any in-flight gesture first so it isn't lost
    if (!undoRef.current.length) return;
    const prev = undoRef.current[undoRef.current.length - 1];
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, baselineRef.current].slice(-MAX_HISTORY);
    const changed = tweakDiff(baselineRef.current, prev);
    baselineRef.current = prev;
    applyState(prev, changed);
    bump();
  }, [flush, applyState]);

  const redo = React.useCallback(() => {
    if (!redoRef.current.length) return;
    const next = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, baselineRef.current].slice(-MAX_HISTORY);
    const changed = tweakDiff(baselineRef.current, next);
    baselineRef.current = next;
    applyState(next, changed);
    bump();
  }, [applyState]);

  const history = {
    undo, redo,
    canUndo: undoRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
  };

  // never lose the last edit: flush on unmount and before the page goes away
  React.useEffect(() => {
    const onHide = () => flush();
    // Commit on RELEASE — pointer/mouse up or key up — so dragging a slider
    // around stays cheap (visual state is live) and the disk write happens
    // only once you let go, never mid-drag.
    const onRelease = () => flush();
    window.addEventListener('pointerup', onRelease, true);
    window.addEventListener('mouseup', onRelease, true);
    window.addEventListener('keyup', onRelease, true);
    window.addEventListener('beforeunload', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pointerup', onRelease, true);
      window.removeEventListener('mouseup', onRelease, true);
      window.removeEventListener('keyup', onRelease, true);
      window.removeEventListener('beforeunload', onHide);
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  return [values, setTweak, history];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({ title = 'Tweaks', history, children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;
  // ref so the keydown handler always sees the live history without re-binding
  const histRef = React.useRef(history);
  histRef.current = history;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxTop = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxTop, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.top = offsetRef.current.y + 'px';
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    /* observe BOTH the viewport and the panel itself — so when a collapsible
       section expands and the panel grows, we re-clamp to keep it on-screen */
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    if (dragRef.current) ro.observe(dragRef.current);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      /* also close on __edit_mode_dismissed: in expanded / new-tab mode there
         is no host to echo __deactivate_edit_mode back after the × button, so
         without this the panel's open-state desyncs from the app's tracker and
         the ` toggle starts posting the wrong direction. */
      else if (t === '__deactivate_edit_mode' || t === '__edit_mode_dismissed') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    /* post to BOTH self and parent. The parent post syncs the host toolbar;
       the SELF post is what keeps the app-side open-tracker (tweaks-app's
       panelOpenRef) in sync in expanded / new-tab mode, where there is no host
       to echo __deactivate_edit_mode back — without it the ` toggle's first
       press after a × close is wasted (posts the wrong direction). */
    window.postMessage({ type: '__edit_mode_dismissed' }, '*');
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  // ⌘Z / ⇧⌘Z (or Ctrl) undo+redo while the panel is open.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
        const h = histRef.current;
        if (!h) return;
        e.preventDefault();
        if (e.shiftKey) h.redo(); else h.undo();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startTop = r.top;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startTop + (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel" data-omelette-chrome=""
           style={{ right: offsetRef.current.x, top: offsetRef.current.y }}>
        <div className="twk-edge twk-edge-l" onMouseDown={onDragStart}></div>
        <div className="twk-edge twk-edge-b" onMouseDown={onDragStart}></div>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <div className="twk-hd-actions" onMouseDown={(e) => e.stopPropagation()}>
            {history && (
              <>
                <button className="twk-x" aria-label="Undo" title="Undo (⌘Z)"
                        disabled={!history.canUndo} onClick={history.undo}>↶</button>
                <button className="twk-x" aria-label="Redo" title="Redo (⇧⌘Z)"
                        disabled={!history.canRedo} onClick={history.redo}>↷</button>
              </>
            )}
            <button className="twk-x" aria-label="Close tweaks" onClick={dismiss}>✕</button>
          </div>
        </div>
        <div className="twk-body">
          {children}
        </div>
      </div>
    </>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

const SectionDepth = React.createContext(0);

function TweakSection({ label, children, collapsible = false, defaultOpen = true, top = false, sub = false }) {
  const depth = React.useContext(SectionDepth);
  const [open, setOpen] = React.useState(defaultOpen);
  /* depth drives the hierarchy: 0 = master section, ≥1 = nested dropdown.
     Each nested level wraps title+body in a .twk-subwrap rail so it steps
     further right than its parent. */
  const isSub = depth > 0;
  const base = 'twk-sect' + (isSub ? ' twk-sect-sub' : (top ? ' twk-sect-top' : ''));

  const body = (
    <SectionDepth.Provider value={depth + 1}>
      {children}
    </SectionDepth.Provider>
  );

  let out;
  if (!collapsible) {
    out = (
      <>
        <div className={base}>{label}</div>
        {body}
      </>
    );
  } else {
    out = (
      <>
        <div className={base + ' twk-sect-toggle'}
             onClick={() => setOpen(!open)}
             style={{ cursor: 'pointer', userSelect: 'none', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{label}</span>
          <span style={{ fontSize: isSub ? 9 : 10, opacity: 0.6, marginLeft: 6 }}>
            {open ? '\u25BE' : '\u25B8'}
          </span>
        </div>
        {open && body}
      </>
    );
  }

  /* nested levels get an indent rail; top-level sections render flush */
  return isSub ? <div className="twk-subwrap">{out}</div> : out;
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  // The readout is an editable number field: drag (or arrow-key the track) for
  // coarse moves, or TYPE an exact value + Enter/blur for precision the drag
  // grid can't hit. `editing` guards the value→text sync so mid-typing (incl.
  // decimals) isn't clobbered by an incoming render.
  const [text, setText] = React.useState(String(value));
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => { if (!editing) setText(String(value)); }, [value, editing]);
  const commit = (raw) => {
    let n = parseFloat(raw);
    if (!isFinite(n)) { setText(String(value)); return; }
    n = Math.min(max, Math.max(min, n));
    setText(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <div className="twk-row">
      <div className="twk-lbl">
        <span>{label}</span>
        <span className="twk-val twk-valedit">
          <input type="number" className="twk-numin" value={text}
                 min={min} max={max} step={step} inputMode="decimal"
                 onFocus={(e) => { setEditing(true); e.target.select(); }}
                 onChange={(e) => setText(e.target.value)}
                 onBlur={(e) => { setEditing(false); commit(e.target.value); }}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') { commit(e.currentTarget.value); e.currentTarget.blur(); }
                   else if (e.key === 'Escape') { setText(String(value)); e.currentTarget.blur(); }
                 }} />
          {unit ? <span className="twk-unit">{unit}</span> : null}
        </span>
      </div>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = (o) => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = (s) => {
      const m = options.find((o) => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return <TweakSelect label={label} value={value} options={options}
                        onChange={(s) => onChange(resolve(s))} />;
  }
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakText({ label, value, placeholder, multiline, onChange }) {
  return (
    <TweakRow label={label}>
      {multiline
        ? <textarea className="twk-field" rows={3} value={value} placeholder={placeholder}
                    style={{ resize: 'vertical', lineHeight: 1.4, fontFamily: 'inherit' }}
                    onChange={(e) => onChange(e.target.value)} />
        : <input className="twk-field" type="text" value={value} placeholder={placeholder}
                 onChange={(e) => onChange(e.target.value)} />}
    </TweakRow>
  );
}

function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
             onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          stroke={light ? 'rgba(0,0,0,.78)' : '#fff'} />
  </svg>
);

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({ label, value, options, onChange }) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <input type="color" className="twk-swatch" value={value}
               onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button key={i} type="button" className="twk-chip" role="radio"
                    aria-checked={on} data-on={on ? '1' : '0'}
                    aria-label={colors.join(', ')} title={colors.join(' · ')}
                    style={{ background: hero }}
                    onClick={() => onChange(o)}>
              {sup.length > 0 && (
                <span>
                  {sup.map((c, j) => <i key={j} style={{ background: c }} />)}
                </span>
              )}
              {on && <__TwkCheck light={__twkIsLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button type="button" className={secondary ? 'twk-btn secondary' : 'twk-btn'}
            onClick={onClick}>{label}</button>
  );
}

Object.assign(window, {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
});
