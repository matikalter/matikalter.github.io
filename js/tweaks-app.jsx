/* ======================================================================
   TWEAKS APP — renders the floating control panel for the portfolio's
   design system. Reads `window.TWEAKS` (the EDITMODE config block defined
   inline in index.html) and applies each change via `window.applyTweaks`
   which updates CSS variables, JS globals, and rebuilds any visible gallery.

   Sections are COLLAPSIBLE — click a section header to fold it. Defaults
   are tuned so heavy stuff (every type style) is collapsed at first; layout
   knobs stay open since they're what you reach for most.
   ====================================================================== */
(function () {
  'use strict';

  const { useTweaks, TweaksPanel,
          TweakSection, TweakSlider, TweakSelect, TweakRadio, TweakToggle,
          TweakColor, TweakRow, TweakText } = window;

  /* ── Colour SOURCE: palette token or custom ───────────────────────────
     Every colour row (except the palette rows themselves) leads with a source
     dropdown: Custom, or one of the Colors palette tokens. Picking a token
     stores a REFERENCE ("@colorText", or "@colorText/80" with alpha) that
     applyTweaks resolves (window.resolveColorRef), so re-tuning a palette
     token re-colours everything that points at it. Typing a hex or using the
     picker is a manual override and flips the source back to Custom. */
  const COLOR_TOKENS = [
    ['colorText', 'Text'], ['colorBg', 'Background'], ['colorBgSec', 'Bg secondary'],
    ['colorBgTer', 'Bg tertiary'], ['colorHighlight', 'Highlight'], ['colorBorder', 'Border'],
    ['colorMuted', 'Muted'], ['colorFaint', 'Faint']
  ];
  const ColorTokensCtx = React.createContext({});
  const parseColorRef = (v) => {
    const m = /^@(color[A-Za-z]+)(?:\/([0-9a-fA-F]{2}))?$/.exec(String(v == null ? '' : v));
    return m ? { token: m[1], a: m[2] ? parseInt(m[2], 16) : 255 } : null;
  };
  const tokenHex = (tokens, k) => {
    let h = String((tokens && tokens[k]) || '#000000').trim().replace(/^#/, '').toLowerCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    h = h.slice(0, 6);
    return /^[0-9a-f]{6}$/.test(h) ? '#' + h : '#000000';
  };
  const alphaHex = (a) => Math.max(0, Math.min(255, Math.round(a))).toString(16).padStart(2, '0');
  const refVal = (k, a) => '@' + k + (a >= 255 ? '' : '/' + alphaHex(a));
  function ColorSourceSelect({ token, onPick }) {
    return (
      <select className="twk-field" value={token || ''} aria-label="Colour source"
              style={{ width: 116, height: 22, fontSize: 11, flexShrink: 0 }}
              onChange={(e) => onPick(e.target.value)}>
        <option value="">Custom</option>
        {COLOR_TOKENS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    );
  }

  /* ── Hex-aware color row ──────────────────────────────────────────────
     Native color picker doesn't accept pasted hex values, so we pair it
     with a hex text field. Accepts #abc / #abcdef on blur or Enter.
     noRef = a palette row itself (always literal hex, no source dropdown). */
  /* ── Close cursor (shared) ── the cursor shown OUTSIDE expanded media, where a
     click closes it. One setting (closeCursor) used by both the project-page
     lightboxes and the playground's expanded clip — shown in both sections. */
  function CloseCursorRadio({ t, setTweak }) {
    const v = t.closeCursor === 'zoom-out' || t.closeCursor === 'arrow' ? t.closeCursor : 'x';
    return (
      <>
        <TweakRadio label="Close cursor" value={v}
                    options={[{ value: 'x', label: 'X' }, { value: 'zoom-out', label: 'Zoom out' }, { value: 'arrow', label: 'Arrow' }]}
                    onChange={(nv) => setTweak('closeCursor', nv)} />
        <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Cursor outside the expanded content, where a click closes it. Shared by project pages and the playground.</div>
      </>
    );
  }

  /* ── Filter buttons: Direction + (horizontal only) Max width ──
     Used for the docked buttons (filterDir / filterMaxW) and for "Toolbar
     hidden" (filterDirCol / filterMaxWCol, falling back to the docked pair).
     Max width 0 = no limit; past it the buttons wrap down onto new lines.
     The docked Position panel renders the two parts separately (Direction
     under Placement, Max width under Align) — FilterMaxW alone, noMax on
     FilterDirection; "Toolbar hidden" (no Align) keeps them together. */
  function FilterMaxW({ dir, maxW, maxWKey, setTweak }) {
    if (dir !== 'horizontal') return null;
    return (
      <>
        <TweakSlider label="Max width" value={maxW != null ? +maxW || 0 : 0}
                     min={0} max={1200} step={1} unit="px"
                     onChange={(v) => setTweak(maxWKey, v)} />
        <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Buttons past this width wrap down onto a new line. 0 = no limit.</div>
      </>
    );
  }
  function FilterDirection({ label, dir, dirKey, maxW, maxWKey, setTweak, noMax }) {
    return (
      <>
        <TweakRadio label={label} value={dir === 'horizontal' ? 'horizontal' : 'vertical'}
                    options={['vertical', 'horizontal']}
                    onChange={(v) => setTweak(dirKey, v)} />
        {noMax ? null : <FilterMaxW dir={dir} maxW={maxW} maxWKey={maxWKey} setTweak={setTweak} />}
      </>
    );
  }
  /* ── Filter buttons: Horizontal gap / Vertical gap (both fall back to the
     old single filterGap) ── */
  function FilterGaps({ t, setTweak }) {
    const g = t.filterGap != null ? t.filterGap : 6;
    return (
      <>
        <TweakSlider label="Horizontal gap" value={t.filterGapX != null ? t.filterGapX : g}
                     min={0} max={60} step={1} unit="px"
                     onChange={(v) => setTweak('filterGapX', v)} />
        <TweakSlider label="Vertical gap" value={t.filterGapY != null ? t.filterGapY : g}
                     min={0} max={60} step={1} unit="px"
                     onChange={(v) => setTweak('filterGapY', v)} />
      </>
    );
  }

  /* ── Which tags are filter buttons + their order (Filter buttons → Buttons) ──
     Lists EVERY tag from the tag list (Tags → Tag list, or the authored
     vocabulary when it hasn't been edited). filterTags = the shown tag keys IN
     BUTTON ORDER, with 'all' marking the All button's slot (kept while All is
     off so it returns in place; missing → All first). Shown buttons are listed
     first with ↑ / ↓ (swap with the neighbouring shown button); the rest sit
     below under "Not shown". Switching a tag on adds it at the end. index.html
     applyFilterList turns this into filterDefs. */
  const FILTER_TAGS_DEFAULT = ['games', 'animation', 'illustration'];
  function FilterButtonsPicker({ t, setTweak }) {
    const tags = (Array.isArray(t.tagList) ? t.tagList : (window.__tagDefsAuthored || []))
      .filter((d) => d && d.key && !(window.tagIsDeleted && window.tagIsDeleted(d.key)));
    const tagLabel = {};
    tags.forEach((d) => { tagLabel[d.key] = d.label != null && d.label !== '' ? d.label : d.key; });
    const showAll = t.filterShowAll !== false;
    const raw = Array.isArray(t.filterTags) ? t.filterTags
      : ((window.__filterDefsAuthored || []).map((d) => d.key).concat(window.__filterDefsAuthored ? [] : FILTER_TAGS_DEFAULT));
    /* normalised order: unique, known keys only, always holding an 'all' slot */
    let order = raw.filter((k, i) => raw.indexOf(k) === i && (k === 'all' || tagLabel[k] != null));
    if (order.indexOf('all') === -1) order = ['all'].concat(order);
    const shown = order.filter((k) => k !== 'all' || showAll);
    const hidden = (showAll ? [] : ['all']).concat(tags.map((d) => d.key).filter((k) => order.indexOf(k) === -1));
    const labelOf = (k) => (k === 'all' ? 'All' : tagLabel[k]);
    const move = (k, dir) => {
      const i = shown.indexOf(k), j = i + dir;
      if (i < 0 || j < 0 || j >= shown.length) return;
      const a = order.indexOf(k), b = order.indexOf(shown[j]);
      const next = order.slice(); next[a] = shown[j]; next[b] = k;
      setTweak('filterTags', next);
    };
    const toggle = (k, v) => {
      if (k === 'all') { setTweak('filterShowAll', v); return; }
      const next = order.filter((x) => x !== k);
      if (v) next.push(k);
      setTweak('filterTags', next);
    };
    const btn = {
      width: 20, height: 20, lineHeight: '18px', padding: 0, borderRadius: 5,
      border: '0.5px solid rgba(0,0,0,.15)', background: 'rgba(255,255,255,.7)',
      cursor: 'pointer', fontSize: 11, color: '#29261b'
    };
    const row = (k, i, isShown) => (
      <div key={k} className="twk-row twk-row-h" style={{ padding: '1px 0', gap: 6 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                       color: isShown ? 'rgba(41,38,27,.72)' : 'rgba(41,38,27,.4)' }}>
          {isShown ? (i + 1) + '. ' : ''}{labelOf(k)}
        </span>
        <span style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
          {isShown ? (
            <>
              <button type="button" style={{ ...btn, opacity: i === 0 ? 0.35 : 1 }}
                      onClick={() => move(k, -1)} aria-label="Move up" title="Move up">↑</button>
              <button type="button" style={{ ...btn, opacity: i === shown.length - 1 ? 0.35 : 1 }}
                      onClick={() => move(k, 1)} aria-label="Move down" title="Move down">↓</button>
            </>
          ) : null}
          <button type="button" className="twk-toggle" data-on={isShown ? '1' : '0'}
                  role="switch" aria-checked={isShown} aria-label={(isShown ? 'Hide ' : 'Show ') + labelOf(k)}
                  onClick={() => toggle(k, !isShown)}><i /></button>
        </span>
      </div>
    );
    return (
      <>
        <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' }}>Which buttons show, and their order (↑ / ↓). Every tag from Tags → Tag list can be a filter; switching one on adds it at the end.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {shown.map((k, i) => row(k, i, true))}
        </div>
        {!showAll ? (
          <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' }}>No All button: clicking the active filter again shows everything.</div>
        ) : null}
        {hidden.length ? (
          <>
            <div className="twk-lbl" style={{ fontSize: 10.5, color: 'rgba(41,38,27,.5)', marginTop: 4 }}><span>Not shown</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {hidden.map((k, i) => row(k, i, false))}
            </div>
          </>
        ) : null}
      </>
    );
  }

  /* ── One inactive-title position (Project titles → Inactive titles) ──
     n = 1..3 (distance from the active title), side 'U' = above, 'D' = below.
     Keys titleBlur{side}{n} / titleOpacity{side}{n} / titleSize{side}{n}; each
     shows (and falls back to) the old shared titleBlur{n} etc. until edited. */
  const TITLE_SLOT_DEF = { b: [3, 7, 11], o: [0.75, 0.5, 0.28], s: [1, 1, 1], bMax: [20, 30, 40] };
  function TitleSlotSection({ t, setTweak, n, side, label }) {
    const pick = (base) => {
      const k = base + side + n, sh = base + n;
      const d = base === 'titleBlur' ? TITLE_SLOT_DEF.b[n - 1] : base === 'titleOpacity' ? TITLE_SLOT_DEF.o[n - 1] : TITLE_SLOT_DEF.s[n - 1];
      return { k, v: t[k] != null ? t[k] : (t[sh] != null ? t[sh] : d) };
    };
    const B = pick('titleBlur'), O = pick('titleOpacity'), S = pick('titleSize');
    return (
      <TweakSection label={label} sub collapsible defaultOpen={false}>
        <TweakSlider label="Blur" value={B.v} min={0} max={TITLE_SLOT_DEF.bMax[n - 1]} step={0.5} unit="px"
                     onChange={(v) => setTweak(B.k, v)} />
        <TweakSlider label="Opacity" value={O.v} min={0} max={1} step={0.05}
                     onChange={(v) => setTweak(O.k, v)} />
        <TweakSlider label="Size" value={S.v} min={0.3} max={1.5} step={0.01} unit="×"
                     onChange={(v) => setTweak(S.k, v)} />
      </TweakSection>
    );
  }

  /* ── Expand over (whole window | main content) ── for expanded media */
  function ExpandOverRadio({ value, onChange }) {
    return (
      <>
        <TweakRadio label="Expand over" value={value}
                    options={[{ value: 'window', label: 'Whole window' }, { value: 'main', label: 'Main content' }]}
                    onChange={onChange} />
        <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Whole window = everything behind is blurred and blocked, toolbar included. Main content = the toolbar stays sharp and usable; clicking its background still closes.</div>
      </>
    );
  }

  function ColorHexRow({ label, value, onChange, noRef }) {
    const tokens = React.useContext(ColorTokensCtx);
    const ref = noRef ? null : parseColorRef(value);
    const hex = ref ? tokenHex(tokens, ref.token) : (value || '#000000');
    const [text, setText] = React.useState(hex);
    React.useEffect(() => { setText(hex); }, [hex]);
    const commit = (s) => {
      let h = (s || '').trim();
      if (h && h[0] !== '#') h = '#' + h;
      if (/^#[0-9a-f]{3}$/i.test(h))
        h = '#' + h.slice(1).split('').map(c => c + c).join('');
      h = h.toLowerCase();
      if (ref && h === hex) { setText(hex); return; }   /* untouched — keep the reference */
      if (/^#[0-9a-f]{6}$/.test(h)) onChange(h);
      else setText(hex);
    };
    const field = (
      <input type="text" className="twk-field" value={text}
             style={noRef ? { width: 84, height: 22, fontVariantNumeric: 'tabular-nums' }
                          : { flex: 1, minWidth: 0, height: 22, fontVariantNumeric: 'tabular-nums', opacity: ref ? 0.55 : 1 }}
             onChange={(e) => setText(e.target.value)}
             onBlur={(e) => commit(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter') commit(e.target.value); }} />
    );
    const swatch = (
      <input type="color" className="twk-swatch" value={hex}
             style={noRef ? undefined : { width: 38 }}
             onChange={(e) => onChange(e.target.value)} />
    );
    if (noRef) {
      return (
        <div className="twk-row twk-row-h">
          <div className="twk-lbl"><span>{label}</span></div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{field}{swatch}</div>
        </div>
      );
    }
    return (
      <div className="twk-row">
        <div className="twk-lbl" style={{ alignItems: 'center' }}>
          <span>{label}</span>
          <ColorSourceSelect token={ref && ref.token} onPick={(k) => onChange(k ? '@' + k : hex)} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{field}{swatch}</div>
      </div>
    );
  }

  /* ── Alpha-aware color row ────────────────────────────────────────────
     Like ColorHexRow but supports transparency. Stores an 8-digit hex
     (#rrggbbaa) when not fully opaque, plain #rrggbb when opaque — or a token
     reference with an alpha suffix ("@colorText/80"). A native swatch sets the
     RGB (preserving alpha) and a slim slider sets alpha. */
  function ColorAlphaRow({ label, value, onChange }) {
    const tokens = React.useContext(ColorTokensCtx);
    const parse = (v) => {
      let h = String(v == null ? '' : v).trim().replace(/^#/, '').toLowerCase();
      if (h === 'transparent') return { rgb: '#000000', a: 0 };
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      if (/^[0-9a-f]{6}$/.test(h)) return { rgb: '#' + h, a: 255 };
      if (/^[0-9a-f]{8}$/.test(h)) return { rgb: '#' + h.slice(0, 6), a: parseInt(h.slice(6, 8), 16) };
      return { rgb: '#cccccc', a: 255 };
    };
    const ref = parseColorRef(value);
    const { rgb, a } = ref ? { rgb: tokenHex(tokens, ref.token), a: ref.a } : parse(value);
    const toVal = (rgbHex, alpha) => {
      const aa = Math.max(0, Math.min(255, Math.round(alpha)));
      return aa >= 255 ? rgbHex : rgbHex + alphaHex(aa);
    };
    const shown = toVal(rgb, a);
    const [text, setText] = React.useState(shown);
    React.useEffect(() => { setText(shown); }, [shown]);
    const commit = (s) => {
      let h = (s || '').trim();
      if (h && h[0] !== '#') h = '#' + h;
      if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) {
        const p = parse(h);
        const nv = toVal(p.rgb, p.a);
        if (ref && nv === shown) { setText(shown); return; }   /* untouched — keep the reference */
        onChange(nv);
      } else setText(shown);
    };
    const pct = Math.round((a / 255) * 100);
    return (
      <div className="twk-row">
        <div className="twk-lbl" style={{ alignItems: 'center' }}>
          <span>{label} <span className="twk-val" style={{ fontWeight: 400 }}>{pct}%</span></span>
          <ColorSourceSelect token={ref && ref.token} onPick={(k) => onChange(k ? refVal(k, a) : shown)} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="text" className="twk-field" value={text}
                 style={{ flex: 1, minWidth: 0, height: 22, fontVariantNumeric: 'tabular-nums', opacity: ref ? 0.55 : 1 }}
                 onChange={(e) => setText(e.target.value)}
                 onBlur={(e) => commit(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') commit(e.target.value); }} />
          <input type="color" className="twk-swatch" value={rgb}
                 style={{ width: 38, flexShrink: 0 }}
                 onChange={(e) => onChange(toVal(e.target.value, a))} />
          <input type="range" className="twk-slider" min={0} max={255} step={1} value={a}
                 style={{ width: 52, margin: 0, flexShrink: 0 }}
                 aria-label="Opacity"
                 onChange={(e) => onChange(ref ? refVal(ref.token, Number(e.target.value)) : toVal(rgb, Number(e.target.value)))} />
        </div>
      </div>
    );
  }

  /* ── Pill / button state group ────────────────────────────────────────
     One state's controls: a Style switch (Regular | Boxed) + a Text color,
     and — only when Boxed — Fill + Outline colors (all alpha-capable). `fam`
     is the family ('filter' | 'tag' | 'back' | 'play'); `st` is the key suffix
     ('' for single-state tags, else 'Def' | 'Sel' | 'Hov'). When `caption` is
     given it heads the group with a small state label. */
  function PillStateGroup({ caption, fam, st, t, setTweak }) {
    const k = (suf) => fam + st + suf;
    const style = t[k('Style')] || 'regular';
    return (
      <>
        {caption && <div className="twk-substate">{caption}</div>}
        <TweakRadio label="Style" value={style} options={['regular', 'boxed']}
                    onChange={(v) => setTweak(k('Style'), v)} />
        <ColorAlphaRow label="Text" value={t[k('Text')] || '#111111'}
                       onChange={(v) => setTweak(k('Text'), v)} />
        {style === 'boxed' && (
          <>
            <ColorAlphaRow label="Fill" value={t[k('Fill')] || '#00000000'}
                           onChange={(v) => setTweak(k('Fill'), v)} />
            <ColorAlphaRow label="Outline" value={t[k('Outline')] || '#cccccc'}
                           onChange={(v) => setTweak(k('Outline'), v)} />
          </>
        )}
      </>
    );
  }

  /* The interactive states stacked. By default Default / Selected / Hover;
     pass `states` to limit them (back/play use Default + Hover only). */
  function StateStack({ fam, t, setTweak, states }) {
    const list = states || [['Default', 'Def'], ['Selected', 'Sel'], ['Hover', 'Hov']];
    return (
      <>
        {list.map(([caption, st]) => (
          <PillStateGroup key={st} caption={caption} fam={fam} st={st} t={t} setTweak={setTweak} />
        ))}
      </>
    );
  }

  const TWO_STATES = [['Default', 'Def'], ['Hover', 'Hov']];

  /* ── BACK-BUTTON STYLE SET ──
     One complete look for ONE context: pfx '' = docked toolbar, 'Open' =
     expanded drawer (keys backOpen*). Unlike StateStack there is a SINGLE
     regular/boxed switch for the whole set — both Default and Hover are always
     the same kind of thing — and picking Boxed is what reveals the Fill /
     Outline / radius / box-shape controls for both states at once.
     The expanded set's colours FALL BACK to the docked ones (index.html does
     the same resolution), so it tracks the docked look until edited. */
  function BackStyleSet({ pfx, t, setTweak }) {
    const dockStyle = t.backStyle || t.backDefStyle || 'regular';
    const k = (st, suf) => 'back' + pfx + st + suf;
    /* the docked value is the fallback for the expanded set */
    const val = (st, suf, dflt) => {
      const v = t[k(st, suf)];
      if (v != null && v !== '') return v;
      const d = pfx ? t['back' + st + suf] : null;
      return (d != null && d !== '') ? d : dflt;
    };
    const styleKey = pfx ? 'backOpenStyle' : 'backStyle';
    const style = t[styleKey] || dockStyle;
    const boxed = (style === 'boxed');
    const shapeKey = pfx ? 'backOpenBoxShape' : 'backBoxShape';
    const shape = t[shapeKey] || t.backBoxShape || 'conform';
    const sizeKey = pfx ? 'backOpenBoxSize' : 'backBoxSize';
    const size = t[sizeKey] != null ? t[sizeKey] : (t.backBoxSize != null ? t.backBoxSize : 44);
    const radKey = pfx ? 'backOpenRadius' : 'backRadius';
    const rad = t[radKey] != null ? t[radKey] : (t.backRadius != null ? t.backRadius : 0);
    return (
      <>
        <TweakRadio label="Style" value={style} options={['regular', 'boxed']}
                    onChange={(v) => setTweak(styleKey, v)} />
        {TWO_STATES.map(([caption, st]) => (
          <React.Fragment key={st}>
            <div className="twk-substate">{caption}</div>
            <ColorAlphaRow label="Text"
                           value={val(st, 'Text', st === 'Hov' ? '#8089ef' : '#111111')}
                           onChange={(v) => setTweak(k(st, 'Text'), v)} />
            {boxed && (
              <>
                <ColorAlphaRow label="Fill" value={val(st, 'Fill', '#00000000')}
                               onChange={(v) => setTweak(k(st, 'Fill'), v)} />
                <ColorAlphaRow label="Outline" value={val(st, 'Outline', '#cccccc')}
                               onChange={(v) => setTweak(k(st, 'Outline'), v)} />
              </>
            )}
          </React.Fragment>
        ))}
        {boxed && (
          <>
            <div className="twk-substate">Box</div>
            <TweakRadio  label="Shape" value={shape} options={['conform', 'square']}
                         onChange={(v) => setTweak(shapeKey, v)} />
            {shape === 'square' && (
              <TweakSlider label="Box size" value={size}
                           min={24} max={160} step={1} unit="px"
                           onChange={(v) => setTweak(sizeKey, v)} />
            )}
            <TweakSlider label="Corner radius" value={rad}
                         min={0} max={60} step={1} unit="px"
                         onChange={(v) => setTweak(radKey, v)} />
          </>
        )}
      </>
    );
  }

  /* ── ABOUT-PAGE META LIST EDITOR ──
     One collapsible dropdown per section (Education / Awards / Conferences),
     holding the section TITLE plus a row per item. Each item has two fields:
     "Main" (body colour) and "Detail" (the faint grey <span> that follows it) —
     the two visual parts of an .about-item, so what you type maps 1:1 to what
     you see. Rows can be added, removed and reordered.

     The whole thing is ONE tweak key (aboutMeta), an array of
     {title, items:[[main, detail]]} — index.html's applyTweaks renders it and
     falls back to the authored window.ABOUT_META when the key is absent. Every
     edit writes the FULL array (readMeta clones the current value or the
     default), so a section that has never been touched still round-trips. */
  function readMeta(t) {
    const src = (Array.isArray(t.aboutMeta) && t.aboutMeta.length)
      ? t.aboutMeta
      : (window.__aboutMetaDefault || window.ABOUT_META || []);
    return src.map((s) => ({
      title: (s && s.title) || '',
      items: ((s && s.items) || []).map((it) => [(it && it[0]) || '', (it && it[1]) || ''])
    }));
  }

  function AboutMetaSection({ idx, t, setTweak }) {
    const meta = readMeta(t);
    const sec = meta[idx] || { title: '', items: [] };
    const write = (mutate) => {
      const next = readMeta(t);
      while (next.length <= idx) next.push({ title: '', items: [] });
      mutate(next[idx]);
      setTweak('aboutMeta', next);
    };
    const move = (i, d) => write((s) => {
      const j = i + d;
      if (j < 0 || j >= s.items.length) return;
      const row = s.items[i];
      s.items[i] = s.items[j];
      s.items[j] = row;
    });
    return (
      <TweakSection label={sec.title || 'Section ' + (idx + 1)} sub collapsible defaultOpen={false}>
        <TweakText label="Title" value={sec.title}
                   onChange={(v) => write((s) => { s.title = v; })} />
        {sec.items.map((it, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4,
                                paddingTop: 8, marginTop: 4,
                                borderTop: '1px solid rgba(41,38,27,.12)' }}>
            <div className="twk-lbl" style={{ fontSize: 11 }}>
              <span>Item {i + 1}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" title="Move up" onClick={() => move(i, -1)}
                        style={metaMiniBtn}>↑</button>
                <button type="button" title="Move down" onClick={() => move(i, 1)}
                        style={metaMiniBtn}>↓</button>
                <button type="button" title="Remove item"
                        onClick={() => write((s) => { s.items.splice(i, 1); })}
                        style={metaMiniBtn}>✕</button>
              </span>
            </div>
            <input className="twk-field" type="text" value={it[0]} placeholder="Main text"
                   onChange={(e) => write((s) => { s.items[i] = [e.target.value, s.items[i][1]]; })} />
            <input className="twk-field" type="text" value={it[1]} placeholder="Detail (grey)"
                   style={{ opacity: 0.75 }}
                   onChange={(e) => write((s) => { s.items[i] = [s.items[i][0], e.target.value]; })} />
          </div>
        ))}
        <TweakButton label="+ Add item" secondary
                     onClick={() => write((s) => { s.items.push(['', '']); })} />
      </TweakSection>
    );
  }

  const metaMiniBtn = {
    background: 'none', border: 0, cursor: 'pointer', padding: '0 2px',
    fontSize: 12, lineHeight: 1, color: 'rgba(41,38,27,.6)'
  };

  /* ── ABOUT LAYOUT EDITOR ──
     The two about-page columns drawn as they actually are, side by side, each
     listing its blocks TOP-TO-BOTTOM. Per row: ↑ / ↓ to reorder inside the
     column, and → / ← to send it to the other column (appended at the end).
     One control answers both "which column" and "which is above which" — a pair
     of separate radios can express the first but not the second.
     Value: aboutLayout = {left:[ids], right:[ids]}; index.html appends the real
     nodes in that order. */
  const ABOUT_BLOCK_LABEL = { bio: 'Bio', accolades: 'Accolades', hero: 'Hero image' };
  const ABOUT_LAYOUT_DEFAULT = { left: ['bio'], right: ['accolades', 'hero'] };

  function readAboutLayout(t) {
    const L = t.aboutLayout;
    const out = {
      left:  (L && Array.isArray(L.left))  ? L.left.slice()  : ABOUT_LAYOUT_DEFAULT.left.slice(),
      right: (L && Array.isArray(L.right)) ? L.right.slice() : ABOUT_LAYOUT_DEFAULT.right.slice()
    };
    /* a malformed value must never drop a block off the page */
    const seen = out.left.concat(out.right);
    Object.keys(ABOUT_BLOCK_LABEL).forEach((id) => {
      if (seen.indexOf(id) === -1) out.right.push(id);
    });
    return out;
  }

  function AboutLayoutEditor({ t, setTweak }) {
    const L = readAboutLayout(t);
    const write = (mutate) => {
      const next = readAboutLayout(t);
      mutate(next);
      setTweak('aboutLayout', next);
    };
    const column = (side, label) => (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="twk-lbl" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {L[side].length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.45, padding: '4px 0' }}>empty</div>
          ) : L[side].map((id, i) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 2,
                                   border: '1px solid rgba(41,38,27,.18)', borderRadius: 4,
                                   padding: '3px 4px', fontSize: 11 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden',
                             textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ABOUT_BLOCK_LABEL[id] || id}
              </span>
              <button type="button" title="Move up" style={metaMiniBtn}
                      onClick={() => write((n) => {
                        if (i === 0) return;
                        const a = n[side]; const p = a[i - 1]; a[i - 1] = a[i]; a[i] = p;
                      })}>↑</button>
              <button type="button" title="Move down" style={metaMiniBtn}
                      onClick={() => write((n) => {
                        const a = n[side];
                        if (i >= a.length - 1) return;
                        const p = a[i + 1]; a[i + 1] = a[i]; a[i] = p;
                      })}>↓</button>
              <button type="button" style={metaMiniBtn}
                      title={side === 'left' ? 'Move to right column' : 'Move to left column'}
                      onClick={() => write((n) => {
                        const other = side === 'left' ? 'right' : 'left';
                        n[side].splice(n[side].indexOf(id), 1);
                        n[other].push(id);
                      })}>{side === 'left' ? '→' : '←'}</button>
            </div>
          ))}
        </div>
      </div>
    );
    return (
      <div className="twk-row">
        <div style={{ display: 'flex', gap: 8 }}>
          {column('left', 'Left column')}
          {column('right', 'Right column')}
        </div>
      </div>
    );
  }

  /* ── Project order ────────────────────────────────────────────────────
     Reorder the home-list projects with up/down buttons. Stores an array of
     project ids in the `projectOrder` tweak; the gallery reads it to order
     the list. Any project missing from the stored order is appended. */
  function ProjectOrder({ t, setTweak }) {
    const all = window.projects || [];
    let order = (t.projectOrder && t.projectOrder.length)
      ? t.projectOrder.filter((id) => all.some((p) => p.id === id))
      : all.map((p) => p.id);
    all.forEach((p) => { if (order.indexOf(p.id) === -1) order.push(p.id); });
    const titleOf = (id) => { const p = all.find((x) => x.id === id); return p ? p.title : id; };
    const hidden = (t.projectHidden && typeof t.projectHidden === 'object') ? t.projectHidden : {};
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= order.length) return;
      const next = order.slice();
      const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
      setTweak('projectOrder', next);
    };
    const toggleHide = (id) => {
      const next = Object.assign({}, hidden);
      if (next[id]) delete next[id]; else next[id] = true;
      setTweak('projectHidden', next);
    };
    const btn = {
      width: 20, height: 20, lineHeight: '18px', padding: 0, borderRadius: 5,
      border: '0.5px solid rgba(0,0,0,.15)', background: 'rgba(255,255,255,.7)',
      cursor: 'pointer', fontSize: 11, color: '#29261b'
    };
    /* open-eye / slashed-eye SVGs for the per-project show/hide toggle */
    const eye = (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
      </svg>
    );
    const eyeOff = (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13 13 0 0 1-2.3 3.1M6.6 6.6A13 13 0 0 0 2 12s3.5 7 10 7a9 9 0 0 0 3.5-.7" />
        <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" /><line x1="2" y1="2" x2="22" y2="22" />
      </svg>
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {order.map((id, i) => {
          const isHidden = !!hidden[id];
          return (
          <div key={id} className="twk-row twk-row-h" style={{ padding: '1px 0', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                           color: isHidden ? 'rgba(41,38,27,.34)' : 'rgba(41,38,27,.72)',
                           textDecoration: isHidden ? 'line-through' : 'none' }}>{i + 1}. {titleOf(id)}</span>
            <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              <button style={{ ...btn, opacity: i === 0 ? 0.35 : 1 }}
                      onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button style={{ ...btn, opacity: i === order.length - 1 ? 0.35 : 1 }}
                      onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'center',
                               color: isHidden ? 'rgba(41,38,27,.4)' : '#29261b' }}
                      onClick={() => toggleHide(id)}
                      aria-label={isHidden ? 'Show project' : 'Hide project'}
                      title={isHidden ? 'Show project' : 'Hide project'}>{isHidden ? eyeOff : eye}</button>
            </span>
          </div>
          );
        })}
      </div>
    );
  }

  /* ── Playground clip order ─────────────────────────────────────────────
     Reorder the playground gallery clips with up/down buttons + a small
     thumbnail of each clip. Stores an array of filenames in the `pgOrder`
     tweak; the gallery reads it (window.PG_ORDER) to order clips before
     splitting them into rows. Any clip missing from the stored order keeps
     its data order and is appended. */
  function PlaygroundOrder({ t, setTweak }) {
    const [openDesc, setOpenDesc] = React.useState({});
    const proj = (window.projects || []).find((p) => p.playgroundImages && p.playgroundImages.length);
    if (!proj) return <div style={{ color: 'rgba(41,38,27,.5)', fontSize: 11 }}>No playground project found.</div>;
    const all = proj.playgroundImages.map((im) => im.src);
    let order = (Array.isArray(t.pgOrder) && t.pgOrder.length)
      ? t.pgOrder.filter((s) => all.indexOf(s) !== -1)
      : all.slice();
    all.forEach((s) => { if (order.indexOf(s) === -1) order.push(s); });

    const isVid = (s) => /\.(mp4|webm|mov|m4v)$/i.test(s);
    const niceName = (s) => s.replace(/\.[^.]+$/, '');
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= order.length) return;
      const next = order.slice();
      const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
      setTweak('pgOrder', next);
    };
    const btn = {
      width: 20, height: 20, lineHeight: '18px', padding: 0, borderRadius: 5,
      border: '0.5px solid rgba(0,0,0,.15)', background: 'rgba(255,255,255,.7)',
      cursor: 'pointer', fontSize: 11, color: '#29261b'
    };
    const thumbBox = {
      width: 30, height: 22, flexShrink: 0, borderRadius: 3, overflow: 'hidden',
      background: 'rgba(0,0,0,.07)', objectFit: 'cover', display: 'block'
    };
    const field = {
      width: '100%', boxSizing: 'border-box', margin: '2px 0',
      padding: '3px 6px', borderRadius: 4, fontSize: 11,
      border: '0.5px solid rgba(0,0,0,.18)', background: 'rgba(255,255,255,.75)',
      color: '#29261b', fontFamily: 'inherit', resize: 'vertical'
    };
    /* per-clip description overrides (Tweaks) fall back to inline project data */
    const dataMap = (t.pgDescData && typeof t.pgDescData === 'object') ? t.pgDescData : {};
    const imgBySrc = {}; proj.playgroundImages.forEach((im) => { imgBySrc[im.src] = im; });
    const titleFor = (s) => (dataMap[s] && dataMap[s].title != null) ? dataMap[s].title : ((imgBySrc[s] || {}).title || '');
    const bodyFor  = (s) => (dataMap[s] && dataMap[s].body  != null) ? dataMap[s].body  : ((imgBySrc[s] || {}).body  || '');
    const setDesc = (s, fld, val) => {
      const next = Object.assign({}, dataMap);
      next[s] = Object.assign({ title: titleFor(s), body: bodyFor(s) }, next[s]);
      next[s][fld] = val;
      setTweak('pgDescData', next);
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {order.map((src, i) => {
          const url = 'assets/' + proj.id + '/' + src;
          const isOpen = !!openDesc[src];
          const hasDesc = !!(titleFor(src) || bodyFor(src));
          return (
          <div key={src} style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="twk-row twk-row-h" style={{ padding: '1px 0', gap: 6 }}>
            {isVid(src)
              ? <video style={thumbBox} src={url + '#t=0.1'} muted preload="metadata" playsInline />
              : <img style={thumbBox} src={url} alt="" />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                           color: 'rgba(41,38,27,.72)', flex: 1 }}>{i + 1}. {niceName(src)}</span>
            <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              <button style={{ ...btn, color: hasDesc ? '#2a6fdb' : '#29261b' }}
                      onClick={() => setOpenDesc((o) => Object.assign({}, o, { [src]: !o[src] }))}
                      aria-label="Edit description" title="Edit description">✎</button>
              <button style={{ ...btn, opacity: i === 0 ? 0.35 : 1 }}
                      onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button style={{ ...btn, opacity: i === order.length - 1 ? 0.35 : 1 }}
                      onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            </span>
          </div>
          {isOpen && (
            <div style={{ paddingLeft: 36, paddingBottom: 4 }}>
              <input style={field} type="text" placeholder="Title"
                     value={titleFor(src)}
                     onChange={(e) => setDesc(src, 'title', e.target.value)} />
              <textarea style={{ ...field, minHeight: 44 }} placeholder="Body"
                     value={bodyFor(src)}
                     onChange={(e) => setDesc(src, 'body', e.target.value)} />
            </div>
          )}
          </div>
          );
        })}
      </div>
    );
  }

  /* ── Posters image order ───────────────────────────────────────────────
     Reorder the posters gallery images + edit each image's description
     (title/body shown in the toolbar on hover). Mirrors PlaygroundOrder but
     reads the posters project's `postersImages`, storing order in `postersOrder`
     and per-image descriptions in `postersDescData` (keyed by src). */
  function PostersOrder({ t, setTweak }) {
    const [openDesc, setOpenDesc] = React.useState({});
    const proj = (window.projects || []).find((p) => p.postersImages && p.postersImages.length);
    if (!proj) return <div style={{ color: 'rgba(41,38,27,.5)', fontSize: 11 }}>No posters project found.</div>;
    const all = proj.postersImages.map((im) => im.src);
    let order = (Array.isArray(t.postersOrder) && t.postersOrder.length)
      ? t.postersOrder.filter((s) => all.indexOf(s) !== -1)
      : all.slice();
    all.forEach((s) => { if (order.indexOf(s) === -1) order.push(s); });

    const niceName = (s) => s.replace(/\.[^.]+$/, '');
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= order.length) return;
      const next = order.slice();
      const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
      setTweak('postersOrder', next);
    };
    const btn = {
      width: 20, height: 20, lineHeight: '18px', padding: 0, borderRadius: 5,
      border: '0.5px solid rgba(0,0,0,.15)', background: 'rgba(255,255,255,.7)',
      cursor: 'pointer', fontSize: 11, color: '#29261b'
    };
    const thumbBox = {
      width: 30, height: 22, flexShrink: 0, borderRadius: 3, overflow: 'hidden',
      background: 'rgba(0,0,0,.07)', objectFit: 'cover', display: 'block'
    };
    const field = {
      width: '100%', boxSizing: 'border-box', margin: '2px 0',
      padding: '3px 6px', borderRadius: 4, fontSize: 11,
      border: '0.5px solid rgba(0,0,0,.18)', background: 'rgba(255,255,255,.75)',
      color: '#29261b', fontFamily: 'inherit', resize: 'vertical'
    };
    /* per-image description overrides (Tweaks) fall back to inline project data */
    const dataMap = (t.postersDescData && typeof t.postersDescData === 'object') ? t.postersDescData : {};
    const imgBySrc = {}; proj.postersImages.forEach((im) => { imgBySrc[im.src] = im; });
    const titleFor = (s) => (dataMap[s] && dataMap[s].title != null) ? dataMap[s].title : ((imgBySrc[s] || {}).title || '');
    const bodyFor  = (s) => (dataMap[s] && dataMap[s].body  != null) ? dataMap[s].body  : ((imgBySrc[s] || {}).body  || '');
    const setDesc = (s, fld, val) => {
      const next = Object.assign({}, dataMap);
      next[s] = Object.assign({ title: titleFor(s), body: bodyFor(s) }, next[s]);
      next[s][fld] = val;
      setTweak('postersDescData', next);
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {order.map((src, i) => {
          const url = 'assets/' + proj.id + '/' + src;
          const isOpen = !!openDesc[src];
          const hasDesc = !!(titleFor(src) || bodyFor(src));
          return (
          <div key={src} style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="twk-row twk-row-h" style={{ padding: '1px 0', gap: 6 }}>
            <img style={thumbBox} src={url} alt="" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                           color: 'rgba(41,38,27,.72)', flex: 1 }}>{i + 1}. {niceName(src)}</span>
            <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              <button style={{ ...btn, color: hasDesc ? '#2a6fdb' : '#29261b' }}
                      onClick={() => setOpenDesc((o) => Object.assign({}, o, { [src]: !o[src] }))}
                      aria-label="Edit description" title="Edit description">✎</button>
              <button style={{ ...btn, opacity: i === 0 ? 0.35 : 1 }}
                      onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button style={{ ...btn, opacity: i === order.length - 1 ? 0.35 : 1 }}
                      onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            </span>
          </div>
          {isOpen && (
            <div style={{ paddingLeft: 36, paddingBottom: 4 }}>
              <input style={field} type="text" placeholder="Title"
                     value={titleFor(src)}
                     onChange={(e) => setDesc(src, 'title', e.target.value)} />
              <textarea style={{ ...field, minHeight: 44 }} placeholder="Body"
                     value={bodyFor(src)}
                     onChange={(e) => setDesc(src, 'body', e.target.value)} />
            </div>
          )}
          </div>
          );
        })}
      </div>
    );
  }

  /* ── Single typography section (size/weight/leading/tracking) ───────── */
  function TypeBlock({ label, prefix, t, setTweak, defaultOpen = false }) {
    return (
      <TweakSection label={label} sub collapsible defaultOpen={defaultOpen}>
        <TweakSlider label="Size"     value={t[prefix + 'Size']}
                     min={8} max={140} step={1} unit="px"
                     onChange={(v) => setTweak(prefix + 'Size', v)} />
        <TweakSlider label="Weight"   value={t[prefix + 'Weight']}
                     min={100} max={900} step={100}
                     onChange={(v) => setTweak(prefix + 'Weight', v)} />
        <TweakSlider label="Leading"  value={t[prefix + 'Leading']}
                     min={0.8} max={2.4} step={0.05}
                     onChange={(v) => setTweak(prefix + 'Leading', v)} />
        <TweakSlider label="Tracking" value={t[prefix + 'Tracking']}
                     min={-0.1} max={0.3} step={0.01} unit="em"
                     onChange={(v) => setTweak(prefix + 'Tracking', v)} />
      </TweakSection>
    );
  }

  /* ── BIO LINKS editor (Toolbar → Bio → Links) ───────────────────────────
     A list of {phrase, target, color, hoverColor, video}. The phrase is matched
     in the bio text (first occurrence, case-insensitive), so editing the bio
     never breaks a link as long as the phrase is still in it. */
  function bioVideoOptions() {
    const out = [], seen = {};
    const path = (pid, src) => {
      src = String(src || '');
      const parts = (src.indexOf('/') !== -1 ? src : pid + '/' + src).split('/');
      return 'assets/' + parts.map(encodeURIComponent).join('/');
    };
    const isVid = (s) => /\.(mp4|webm|mov)(\?|$)/i.test(String(s || ''));
    const isImg = (s) => /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(String(s || ''));
    /* every video AND image in the projects data, grouped per project
       (videos first) so the list reads like the site */
    /* dir = the asset FOLDER: a block can borrow another project's folder via
       `pid` (a posters/row block whose images live in another project's folder) —
       ignoring it produced paths to files that don't exist */
    const add = (p, src, dir) => {
      if (!isVid(src) && !isImg(src)) return;
      const v = path(dir || p.id, src);
      if (seen[v]) return; seen[v] = 1;
      out.push({ value: v, vid: isVid(src), pid: p.id,
                 label: (p.title || p.id) + ' — ' + (isVid(src) ? '▶ ' : '') + String(src).split('/').pop() });
    };
    (window.projects || []).forEach((p) => {
      (p.content || []).forEach((b) => {
        if (!b) return;
        const dir = b.pid || p.id;
        if (b.type === 'localvideo' || b.type === 'richvideo') add(p, b.src, dir);
        if (b.type === 'image') add(p, b.src, dir);
        (b.images || []).forEach((im) => { if (im && typeof im === 'object') add(p, im.localvideo || im.richvideo || im.src, im.pid || dir); else add(p, im, dir); });
      });
      (p.playgroundImages || []).forEach((im) => add(p, typeof im === 'object' ? im.src : im));
      (p.postersImages || []).forEach((im) => add(p, typeof im === 'object' ? im.src : im));
      if (p.thumb) add(p, p.thumb);
      if (p.hero) add(p, p.hero);
    });
    const order = [];
    out.forEach((o) => { if (order.indexOf(o.pid) < 0) order.push(o.pid); });
    return out.sort((a, b) => (order.indexOf(a.pid) - order.indexOf(b.pid)) || (b.vid - a.vid))
              .map(({ value, label }) => ({ value, label }));
  }
  function BioLinksEditor({ t, setTweak }) {
    const links = Array.isArray(t.bioLinks) ? t.bioLinks : [];
    const vidOpts = React.useMemo(bioVideoOptions, []);
    const targets = [{ value: '', label: 'No link' }, { value: 'about', label: 'About page' },
      ...(window.projects || []).filter((p) => !p.hidden).map((p) => ({ value: p.id, label: p.title || p.id }))];
    const upd = (i, patch) => setTweak('bioLinks', links.map((L, k) => (k === i ? { ...L, ...patch } : L)));
    const del = (i) => setTweak('bioLinks', links.filter((_, k) => k !== i));
    const move = (i, d) => {
      const j = i + d; if (j < 0 || j >= links.length) return;
      const n = links.slice(); const tmp = n[i]; n[i] = n[j]; n[j] = tmp; setTweak('bioLinks', n);
    };
    /* repair links saved with a path from before the folder fix: if the stored
       path isn't in the list, re-point it at the option with the same file name */
    React.useEffect(() => {
      let changed = false;
      const fixed = links.map((L) => {
        if (!L || !L.video || vidOpts.some((o) => o.value === L.video)) return L;
        const fname = '/' + String(L.video).split('/').pop();
        const hit = vidOpts.find((o) => o.value.endsWith(fname));
        if (!hit) return L;
        changed = true;
        return { ...L, video: hit.value };
      });
      if (changed) setTweak('bioLinks', fixed);
    }, [JSON.stringify(links.map((L) => L && L.video))]);
    const add = () => setTweak('bioLinks', [...links, { phrase: '', target: '', color: '@colorHighlight', hoverColor: '@colorHighlight', video: '' }]);
    const bioText = String((t.bioShort != null && t.bioShort !== '') ? t.bioShort : (window.__bioShortDefault || '')).toLowerCase();
    const btn = { height: 24, padding: '0 10px', fontSize: 11, border: '1px solid rgba(41,38,27,.25)', background: '#fff', borderRadius: 5, cursor: 'pointer' };
    const isUrl = (v) => /^(https?:|mailto:)/i.test(String(v || ''));
    return (
      <TweakSection label={'Links' + (links.length ? ' (' + links.length + ')' : '')} sub collapsible defaultOpen={false}>
        <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' }}>
          Type a word or phrase from the bio — its first match becomes a link. Hovering it swaps the home reel for its video or image (▶ = video).
        </div>
        {links.map((L, i) => {
          const ph = String(L.phrase || '').trim();
          const missing = ph && bioText.indexOf(ph.toLowerCase()) < 0;
          const tgtSel = isUrl(L.target) ? '__url' : (L.target || '');
          return (
            <TweakSection key={i} label={ph ? '“' + ph + '”' : 'New link'} sub collapsible defaultOpen={!ph}>
              <TweakText label="Word / phrase" value={L.phrase || ''} placeholder="e.g. games"
                         onChange={(v) => upd(i, { phrase: v })} />
              {missing ? <div style={{ fontSize: 10.5, color: '#b5482f', marginTop: -4 }}>Not found in the bio text.</div> : null}
              <TweakRadio label="Link type" value={L.mode === 'filter' ? 'filter' : 'page'}
                          options={[{ value: 'page', label: 'Page' }, { value: 'filter', label: 'Filter' }]}
                          onChange={(v) => upd(i, v === 'filter'
                            ? { mode: 'filter', filter: L.filter || (((window.filterDefs || [])[0] || {}).key) || 'all' }
                            : { mode: null })} />
              {L.mode === 'filter' ? (() => {
                const fdefs = (window.filterDefs || []).map((f) => ({ value: f.key, label: f.label || f.key }));
                const fk = L.filter || (fdefs[0] && fdefs[0].value) || 'all';
                const on = fdefs.some((f) => f.value === fk);
                return (
                  <>
                    <TweakSelect label="Filter" value={on ? fk : ''}
                                 options={[...(on ? [] : [{ value: '', label: 'Choose…' }]), ...fdefs]}
                                 onChange={(v) => upd(i, { filter: v })} />
                    <div style={{ fontSize: 10.5, lineHeight: 1.35, color: on ? 'rgba(41,38,27,.5)' : '#b5482f', marginTop: -4 }}>
                      {on
                        ? 'Clicking scrolls down to the project list and selects this filter. Choices = the filter buttons currently on (Filter buttons → Buttons).'
                        : 'That filter button is switched off (Filter buttons → Buttons) — pick one that is on, or the link will show all projects.'}
                    </div>
                  </>
                );
              })() : (
                <>
                  <TweakSelect label="Link to" value={tgtSel}
                               options={[...targets, { value: '__url', label: 'Web address…' }]}
                               onChange={(v) => upd(i, { target: v === '__url' ? 'https://' : v })} />
                  {tgtSel === '__url' ? (
                    <TweakText label="Address" value={L.target || ''} placeholder="https://… or mailto:…"
                               onChange={(v) => upd(i, { target: v })} />
                  ) : null}
                </>
              )}
              <ColorHexRow label="Idle color" value={L.color || '@colorHighlight'}
                           onChange={(v) => upd(i, { color: v })} />
              <ColorHexRow label="Hover color" value={L.hoverColor || '@colorHighlight'}
                           onChange={(v) => upd(i, { hoverColor: v })} />
              <TweakRadio label="Hover media" value={L.slideshow ? 'slideshow' : 'single'}
                          options={[{ value: 'single', label: 'Single' }, { value: 'slideshow', label: 'Slideshow' }]}
                          onChange={(v) => upd(i, v === 'slideshow'
                            ? { slideshow: true, slides: (L.slides && L.slides.length) ? L.slides : (L.video ? [L.video] : ['']) }
                            : { slideshow: false })} />
              {!L.slideshow ? (
                <TweakSelect label="Media" value={L.video || ''}
                             options={[{ value: '', label: 'None (keep reel)' }, ...vidOpts]}
                             onChange={(v) => upd(i, { video: v })} />
              ) : (
                <>
                  {(L.slides || []).map((src, j) => (
                    <div key={j} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <TweakSelect label={'Slide ' + (j + 1)} value={src || ''}
                                     options={[{ value: '', label: 'Choose…' }, ...vidOpts]}
                                     onChange={(v) => upd(i, { slides: L.slides.map((x2, k2) => (k2 === j ? v : x2)) })} />
                      </div>
                      <button type="button" style={{ ...btn, padding: '0 7px' }} disabled={j === 0}
                              onClick={() => { const n = L.slides.slice(); [n[j - 1], n[j]] = [n[j], n[j - 1]]; upd(i, { slides: n }); }}>↑</button>
                      <button type="button" style={{ ...btn, padding: '0 7px', color: '#b5482f' }}
                              onClick={() => upd(i, { slides: L.slides.filter((_, k2) => k2 !== j) })}>×</button>
                    </div>
                  ))}
                  <button type="button" style={{ ...btn, alignSelf: 'flex-start' }}
                          onClick={() => upd(i, { slides: [...(L.slides || []), ''] })}>+ Add slide</button>
                </>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={btn} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" style={btn} onClick={() => move(i, 1)} disabled={i === links.length - 1}>↓</button>
                <button type="button" style={{ ...btn, marginLeft: 'auto', color: '#b5482f' }} onClick={() => del(i)}>Remove</button>
              </div>
            </TweakSection>
          );
        })}
        <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={add}>+ Add link</button>
        <TweakSection label="Slideshow" sub collapsible defaultOpen={false}>
          <TweakSlider label="Speed" value={t.bioSsSpeed != null ? t.bioSsSpeed : 40}
                       min={5} max={300} step={1} unit="px/s"
                       onChange={(v) => setTweak('bioSsSpeed', v)} />
          <TweakSlider label="Gap" value={t.bioSsGap != null ? t.bioSsGap : 0}
                       min={0} max={80} step={1} unit="px"
                       onChange={(v) => setTweak('bioSsGap', v)} />
        </TweakSection>
      </TweakSection>
    );
  }

  /* ── PAGE CONTENT editor (Project page → Page content) ──────────────────
     Per project: order (↑/↓), show/hide, column placement and — for text
     boxes — layout (title over / beside body) + title/body text. Writes
     projLayout (see resolveProjectContent in index.html). Untouched blocks
     store nothing, so the authored layout is the default. Special blocks
     (dividers, side-scroll, posters grid) keep their full width; a Row is one
     block holding N side-by-side items (e.g. the 3-up rows). Playground and
     standalone-posters projects use their own galleries and are not listed. */
  const PC_FULL_ONLY = { divider: 1, hscroll: 1, posters: 1 };
  const PC_SIZABLE = { image: 1, localvideo: 1, richvideo: 1, video: 1, row: 1, slideshow: 1 };
  const pcColPlace = (b) => (String(b.col) === '2' ? 'right' : b.col ? 'left' : 'auto');
  function pcDefaultPlace(b) {
    if (b.place) return b.place;
    if (PC_FULL_ONLY[b.type] || b.type === 'row') return 'both';
    if (b.type === 'video' || b.type === 'localvideo') return b.full === false ? pcColPlace(b) : 'both';
    if (b.type === 'richvideo' || b.type === 'spacer') return b.full === true ? 'both' : pcColPlace(b);
    return b.full ? 'both' : 'auto';
  }
  function pcLabel(b) {
    const strip = (v) => String(v || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const fname = (v) => String(v || '').split('/').pop();
    const cut = (v, n) => (v.length > n ? v.slice(0, n) + '…' : v);
    switch (b.type) {
      case 'text': return 'Text — ' + cut(strip(b.title) || strip(b.body) || strip(b.html), 26);
      case 'image': return 'Image — ' + cut(fname(b.src), 26);
      case 'localvideo': case 'richvideo': return 'Video — ' + cut(fname(b.src), 26);
      case 'video': return 'Embedded video';
      case 'row': return 'Row — ' + (b.images || []).length + ' side by side';
      case 'slideshow': return 'Slideshow — ' + (b.images || []).length + ' items';
      case 'hscroll': return 'Side-scroll gallery';
      case 'posters': return 'Posters gallery';
      case 'divider': return 'Divider';
      case 'spacer': return 'Spacer';
      default: return b.type || 'Block';
    }
  }
  /* Page content → Toolbar: the project's year, tags and description (the
     left-panel info on its project page; tags + description also feed the home
     list / gallery). Stored in projLayout[pid].info; originals on p.__orig. */
  function ProjectInfoEditor({ p, L, save, btn, note, children }) {
    const orig = p.__orig || { year: p.year, desc: p.desc, tags: p.tags || [] };
    const info = L.info || {};
    const setInfo = (patch) => {
      const n = { ...info, ...patch };
      Object.keys(n).forEach((k) => { if (n[k] == null) delete n[k]; });
      const nl = { ...L };
      if (Object.keys(n).length) nl.info = n; else delete nl.info;
      save(nl);
    };
    const year = info.year != null ? info.year : (orig.year || '');
    const desc = info.desc != null ? info.desc : (orig.desc || '');
    const tags = Array.isArray(info.tags) ? info.tags : (orig.tags || []);
    const sameTags = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const setTags = (n) => setInfo({ tags: sameTags(n, orig.tags || []) ? null : n });
    const defs = window.tagDefs || [];
    const label = (k) => { const d = defs.find((x) => x.key === k); return d ? d.label : k; };
    const unused = defs.filter((d) => tags.indexOf(d.key) < 0);
    const chip = { display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 6px 0 9px', fontSize: 11,
                   border: '1px solid rgba(41,38,27,.25)', borderRadius: 11, background: '#fff' };
    const x = { border: 0, background: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 12, lineHeight: 1, color: 'rgba(41,38,27,.6)' };
    const mv = (i, d) => { const j = i + d; if (j < 0 || j >= tags.length) return; const n = tags.slice(); [n[i], n[j]] = [n[j], n[i]]; setTags(n); };
    return (
      <TweakSection label="Toolbar" sub collapsible defaultOpen={false}>
        <TweakText label="Year" value={year}
                   onChange={(v) => setInfo({ year: v === (orig.year || '') ? null : v })} />
        <TweakText label="Description" multiline value={desc}
                   onChange={(v) => setInfo({ desc: v === (orig.desc || '') ? null : v })} />
        <div className="twk-row">
          <div className="twk-lbl"><span>Tags</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {tags.map((k, i) => (
              <span key={k} style={chip}>
                {i > 0 ? <button type="button" style={x} title="Move left" onClick={() => mv(i, -1)}>‹</button> : null}
                {label(k)}
                {i < tags.length - 1 ? <button type="button" style={x} title="Move right" onClick={() => mv(i, 1)}>›</button> : null}
                <button type="button" style={x} title="Remove" onClick={() => setTags(tags.filter((t2) => t2 !== k))}>×</button>
              </span>
            ))}
            {!tags.length ? <span style={note}>No tags</span> : null}
          </div>
          {unused.length ? (
            <select className="twk-field" value="" style={{ height: 24, fontSize: 11 }}
                    onChange={(e) => { if (e.target.value) setTags([...tags, e.target.value]); }}>
              <option value="">+ Add tag…</option>
              {unused.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          ) : null}
        </div>
        <div style={note}>Tags also drive the home filters and the list / gallery info.</div>
        {children}
        {Object.keys(info).length ? (
          <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => setInfo({ year: null, desc: null, tags: null })}>Restore original info</button>
        ) : null}
      </TweakSection>
    );
  }

  /* Page content → Toolbar → Buttons: per-project button list (projLayout[pid]
     .buttons). Unset = the authored p.play as one text button. Text buttons take
     the shared look (Project page → Buttons → Text button) + an optional own
     label; image buttons carry their own image / size / colours. */
  function ProjectButtonsEditor({ p, L, save, btn, note, defLabel }) {
    const has = Array.isArray(L.buttons);
    const list = has ? L.buttons : (p.play ? [{ type: 'text', href: p.play }] : []);
    const set = (n) => save({ ...L, buttons: n });
    const upd = (i, patch) => set(list.map((b, k) => {
      if (k !== i) return b;
      const nb = { ...b, ...patch };
      Object.keys(nb).forEach((kk) => { if (nb[kk] == null || nb[kk] === '') delete nb[kk]; });
      return nb;
    }));
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = list.slice(); [n[i], n[j]] = [n[j], n[i]]; set(n); };
    const imgOpts = React.useMemo(() => {
      const out = (window.BUTTON_IMAGES || []).map((s) => ({ value: s, label: 'General — ' + s.split('/').pop() }));
      bioVideoOptions().forEach((op) => {
        const v = decodeURIComponent(op.value.replace(/^assets\//, ''));
        if (!/\.(mp4|webm|mov)$/i.test(v) && !out.some((o) => o.value === v)) out.push({ value: v, label: op.label });
      });
      return out;
    }, []);
    const fname = (s) => String(s || '').split('/').pop();
    return (
      <TweakSection label={'Buttons' + (list.length ? ' (' + list.length + ')' : '')} sub collapsible defaultOpen={false}>
        <div style={note}>Sit under the description, side by side in this order. Text buttons share the look in Project page → Buttons → Text button; spacing is in Toolbar spacing → Buttons.</div>
        {list.map((b, i) => {
          const isImg = b.type === 'image';
          return (
            <TweakSection key={i} label={(i + 1) + '. ' + (isImg ? 'Image — ' + (b.src ? fname(b.src) : 'none') : 'Text — ' + (b.label || defLabel))} sub collapsible defaultOpen={false}>
              <TweakRadio label="Type" value={isImg ? 'image' : 'text'}
                          options={[{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image' }]}
                          onChange={(v) => upd(i, { type: v === 'image' ? 'image' : null })} />
              <TweakText label="Link" value={b.href || ''} placeholder="https://…"
                         onChange={(v) => upd(i, { href: v })} />
              {!isImg ? (
                <TweakText label="Text" value={b.label || ''} placeholder={defLabel + ' (shared)'}
                           onChange={(v) => upd(i, { label: v })} />
              ) : (
                <>
                  <TweakSelect label="Image" value={b.src || ''}
                               options={[{ value: '', label: 'Choose…' }, ...imgOpts]}
                               onChange={(v) => upd(i, { src: v })} />
                  <TweakSlider label="Size" value={b.size || 32} min={8} max={160} step={1} unit="px"
                               onChange={(v) => upd(i, { size: v === 32 ? null : v })} />
                  <TweakToggle label="Colour the image" value={b.tint !== false}
                               onChange={(v) => upd(i, { tint: v ? null : false })} />
                  {b.tint !== false ? (
                    <>
                      <ColorHexRow label="Default color" value={b.color || '@colorText'}
                                   onChange={(v) => upd(i, { color: v === '@colorText' ? null : v })} />
                      <ColorHexRow label="Hover color" value={b.hoverColor || '@colorHighlight'}
                                   onChange={(v) => upd(i, { hoverColor: v === '@colorHighlight' ? null : v })} />
                    </>
                  ) : null}
                </>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={btn} disabled={i === 0} onClick={() => move(i, -1)}>← Earlier</button>
                <button type="button" style={btn} disabled={i === list.length - 1} onClick={() => move(i, 1)}>Later →</button>
                <button type="button" style={{ ...btn, marginLeft: 'auto', color: '#b5482f' }} onClick={() => set(list.filter((_, k) => k !== i))}>Remove</button>
              </div>
            </TweakSection>
          );
        })}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={() => set([...list, { href: '' }])}>+ Text button</button>
          <button type="button" style={btn} onClick={() => set([...list, { type: 'image', href: '', src: (window.BUTTON_IMAGES || [])[0] }])}>+ Image button</button>
        </div>
        {has ? (
          <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => { const nl = { ...L }; delete nl.buttons; save(nl); }}>Restore original buttons</button>
        ) : null}
      </TweakSection>
    );
  }

  function ProjectContentEditor({ t, setTweak }) {
    /* gallery pages (Playground / posters) get the toolbar editors only — their
       media is laid out by the gallery, not by content blocks */
    const isGal = (p) => !!((p.playgroundImages && p.playgroundImages.length) || (p.postersImages && p.postersImages.length));
    const projs = (window.projects || []).filter((p) => (p.content && p.content.length) || isGal(p));
    const routePid = () => {
      const m = /#\/project\/([^/?]+)/.exec(location.hash || '');
      return m && projs.some((p) => p.id === m[1]) ? m[1] : null;
    };
    const [pid, setPid] = React.useState(() => routePid() || (projs[0] && projs[0].id));
    React.useEffect(() => {
      const on = () => { const r = routePid(); if (r) setPid(r); };
      window.addEventListener('hashchange', on);
      return () => window.removeEventListener('hashchange', on);
    }, []);
    const p = projs.find((x) => x.id === pid);
    const layout = (t.projLayout && typeof t.projLayout === 'object') ? t.projLayout : {};
    const L = (p && layout[p.id]) || {};
    const ov = L.blocks || {};
    const gal = !!(p && isGal(p));
    const items = (p && !gal && window.projOrderedBlocks) ? window.projOrderedBlocks(p, L) : [];
    /* who shares a row with whom (strict flow) — for the Size note */
    const rowInfo = React.useMemo(() => {
      const m = {};
      if (!p || !window.resolveProjectContent) return m;
      const res = window.resolveProjectContent(p);
      const byRow = {};
      res.forEach((b) => { if (b.__row != null) (byRow[b.__row] = byRow[b.__row] || []).push(b); });
      Object.values(byRow).forEach((cs) => cs.forEach((b) => { m[b.__key] = cs.filter((o2) => o2 !== b); }));
      return m;
    }, [p && p.id, JSON.stringify(L)]);
    const save = (next) => setTweak('projLayout', { ...layout, [p.id]: next });
    const setBlock = (key, patch) => {
      const cur = { ...(ov[key] || {}), ...patch };
      Object.keys(cur).forEach((k) => { if (cur[k] == null) delete cur[k]; });
      const nb = { ...ov };
      if (Object.keys(cur).length) nb[key] = cur; else delete nb[key];
      save({ ...L, blocks: nb });
    };
    const move = (i, d) => {
      const j = i + d; if (j < 0 || j >= items.length) return;
      const keys = items.map((it) => it.key);
      const tmp = keys[i]; keys[i] = keys[j]; keys[j] = tmp;
      save({ ...L, order: keys });
    };
    const hl = (key) => {
      document.querySelectorAll('.proj-block.bk-hl').forEach((e) => e.classList.remove('bk-hl'));
      if (!key) return;
      const e = document.querySelector('.proj-block[data-bk="' + CSS.escape(key) + '"]');
      if (e) e.classList.add('bk-hl');
    };
    React.useEffect(() => () => hl(null), []);
    const note = { fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' };
    const btn = { height: 24, padding: '0 10px', fontSize: 11, border: '1px solid rgba(41,38,27,.25)', background: '#fff', borderRadius: 5, cursor: 'pointer' };
    const touched = !!(L.order || Object.keys(ov).length || L.info);
    const strict = L.flow ? L.flow !== 'fill' : !!(L.order || Object.keys(ov).length);
    return (
      <TweakSection label="Page content" sub collapsible defaultOpen={false}>
        <TweakSelect label="Project" value={pid || ''}
                     options={projs.map((x) => ({ value: x.id, label: (x.title || x.id) + (layout[x.id] ? '  •' : '') }))}
                     onChange={(v) => setPid(v)} />
        <div style={note}>Follows the project page you open. Hover a block below to outline it on the page. • = has edits.</div>
        {p ? (
          <ProjectInfoEditor p={p} L={L} save={save} btn={btn} note={note}>
            <ProjectButtonsEditor p={p} L={L} save={save} btn={btn} note={note}
                                  defLabel={t.playLabel != null && t.playLabel !== '' ? t.playLabel : 'Play'} />
          </ProjectInfoEditor>
        ) : null}
        {gal ? (
          <div style={note}>Gallery page — its media layout lives in the Playground gallery / Posters sections; only the toolbar is edited here.</div>
        ) : null}
        {p && !gal ? (
          <TweakRadio label="Empty space" value={strict ? 'strict' : 'fill'}
                      options={[{ value: 'strict', label: 'Allow (exact order)' }, { value: 'fill', label: 'Fill gaps' }]}
                      onChange={(v) => save({ ...L, flow: v })} />
        ) : null}
        {p && !gal ? (
          <div style={{ ...note, marginTop: -4 }}>
            {strict
              ? 'Blocks follow the list exactly. A Left block followed by a Both block leaves the right side empty; use "Start on a new row" to leave a gap anywhere.'
              : 'Later single-column blocks move up to fill any empty cell (the original behaviour).'}
          </div>
        ) : null}
        {p && !gal ? (
          <TweakRadio label="Per row (page default)" value={L.per === 3 ? 3 : 2}
                      options={[{ value: 2, label: '2' }, { value: 3, label: '3' }]}
                      onChange={(v) => { const n = { ...L }; if (v === 3) n.per = 3; else delete n.per; save(n); }} />
        ) : null}
        {p && !gal ? (
          <div style={{ ...note, marginTop: -4 }}>How many side-by-side blocks fit in a row. Any block can override it (its own Per row).</div>
        ) : null}
        {items.map((it, i) => {
          const b = it.b, o = ov[it.key] || {};
          const defP = pcDefaultPlace(b);
          const perDef = (b.per || L.per) === 3 ? 3 : 2;
          const per = o.per ? (o.per === 3 ? 3 : 2) : perDef;
          const place = (o.place === 'middle' && per !== 3) ? defP : (o.place || defP);
          const isText = b.type === 'text' && !b.html;
          const mode = (isText && o.mode === 'beside' && place !== 'right' && place !== 'center') ? 'beside' : 'stack';
          const opts = (defP === 'auto' ? [{ value: 'auto', label: 'Auto' }] : [])
            .concat(per === 3
              ? [{ value: 'left', label: 'Left' }, { value: 'middle', label: 'Middle' }, { value: 'right', label: 'Right' }, { value: 'center', label: 'Center' }, { value: 'both', label: 'Full' }]
              : [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }]);
          return (
            <div key={it.key} onMouseEnter={() => hl(it.key)} onMouseLeave={() => hl(null)}>
              <TweakSection label={(i + 1) + '. ' + pcLabel(b) + (o.hidden ? '  (hidden)' : '')} sub collapsible defaultOpen={false}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button type="button" style={btn} disabled={i === 0} onClick={() => move(i, -1)}>↑ Up</button>
                  <button type="button" style={btn} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓ Down</button>
                </div>
                <TweakToggle label="Show" value={!o.hidden}
                             onChange={(v) => setBlock(it.key, { hidden: v ? null : true })} />
                {i > 0 ? (
                  <TweakToggle label="Start on a new row" value={!!o.newRow}
                               onChange={(v) => setBlock(it.key, { newRow: v ? true : null })} />
                ) : null}
                {PC_FULL_ONLY[b.type] ? (
                  <div style={note}>Always spans the full width.</div>
                ) : (
                  <>
                    <TweakRadio label="Per row" value={per}
                                options={[{ value: 2, label: '2' }, { value: 3, label: '3' }]}
                                onChange={(v) => setBlock(it.key, { per: v === perDef ? null : v, place: (v !== 3 && o.place === 'middle') ? null : o.place })} />
                    <TweakRadio label="Columns" value={mode === 'beside' ? 'both' : place} options={opts}
                                onChange={(v) => setBlock(it.key, { place: v === defP ? null : v, mode: (v === 'right' || v === 'center' || v === 'middle') ? null : o.mode })} />
                  </>
                )}
                {b.type === 'row' ? <div style={note}>Its {(b.images || []).length} items always sit side by side inside the chosen columns.</div> : null}
                {b.type === 'slideshow' ? (
                  <TweakSelect label="Box ratio" value={o.ssRatio || b.ratio || '16/9'}
                               options={[
                                 { value: '21/9', label: '21:9 — wide' }, { value: '16/9', label: '16:9 — landscape' },
                                 { value: '3/2', label: '3:2 — landscape' }, { value: '4/3', label: '4:3 — landscape' },
                                 { value: '5/4', label: '5:4 — landscape' }, { value: '1/1', label: '1:1 — square' },
                                 { value: '4/5', label: '4:5 — portrait' }, { value: '3/4', label: '3:4 — portrait' },
                                 { value: '2/3', label: '2:3 — portrait' }, { value: '9/16', label: '9:16 — tall' }
                               ]}
                               onChange={(v) => setBlock(it.key, { ssRatio: v === (b.ratio || '16/9') ? null : v })} />
                ) : null}
                <TweakSlider label="Space above" value={o.spaceAbove || 0} min={0} max={400} step={2} unit="px"
                             onChange={(v) => setBlock(it.key, { spaceAbove: v || null })} />
                <TweakSlider label="Space below" value={o.spaceBelow || 0} min={0} max={400} step={2} unit="px"
                             onChange={(v) => setBlock(it.key, { spaceBelow: v || null })} />
                {(o.spaceAbove || o.spaceBelow) && rowInfo[it.key] && rowInfo[it.key].length ? (
                  <div style={{ ...note, marginTop: -4 }}>Shares its row — only this block moves. Set the same on {rowInfo[it.key].map(pcLabel).join(', ')} to move the whole row.</div>
                ) : null}
                {PC_SIZABLE[b.type] ? (() => {
                  const mates = rowInfo[it.key];
                  const strict = window.projStrictFlow ? window.projStrictFlow(p) : (L.flow ? L.flow !== 'fill' : !!(L.order || Object.keys(ov).length));
                  const lone = !mates || !mates.length;
                  const canSize = strict || place === 'both' || place === 'center';
                  return canSize ? (
                    <>
                      <TweakSlider label="Size" value={o.size != null ? o.size : (b.size != null ? b.size : 100)} min={40} max={200} step={5} unit="%"
                                   onChange={(v) => setBlock(it.key, { size: v === (b.size != null ? b.size : 100) ? null : v })} />
                      <div style={{ ...note, marginTop: -4 }}>
                        {!lone
                          ? 'Shares its row with ' + mates.map(pcLabel).join(', ') + ' — the row splits by their sizes.'
                          : place === 'both' ? 'Alone on its row — below 100% narrows it (centred).'
                          : place === 'middle' ? 'Alone on its row — size grows it from the centre (up to the full row).'
                          : 'Alone on its row — size sets its width (up to the full row).'}
                      </div>
                    </>
                  ) : <div style={note}>Size needs "Empty space: Allow" (or a Both / Center placement).</div>;
                })() : null}
                {b.type === 'slideshow' ? (() => {
                  /* slides stored relative to assets/ ("bloom/Banner_054.jpg") */
                  const opts = bioVideoOptions().map((op) => ({ value: decodeURIComponent(op.value.replace(/^assets\//, '')), label: op.label }));
                  const toRel = (src) => (String(src).indexOf('/') !== -1 ? src : p.id + '/' + src);
                  const cur = (Array.isArray(o.slides) ? o.slides : (b.images || []).map(toRel));
                  const setS = (n) => setBlock(it.key, { slides: n });
                  return (
                    <TweakSection label="Slideshow" sub collapsible defaultOpen={false}>
                      {cur.map((src, j) => (
                        <div key={j} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <TweakSelect label={'Slide ' + (j + 1)} value={src || ''}
                                         options={[{ value: '', label: 'Choose…' }, ...opts]}
                                         onChange={(v) => setS(cur.map((x2, k2) => (k2 === j ? v : x2)))} />
                          </div>
                          <button type="button" style={{ ...btn, padding: '0 7px' }} disabled={j === 0}
                                  onClick={() => { const n = cur.slice(); [n[j - 1], n[j]] = [n[j], n[j - 1]]; setS(n); }}>↑</button>
                          <button type="button" style={{ ...btn, padding: '0 7px', color: '#b5482f' }}
                                  onClick={() => setS(cur.filter((_, k2) => k2 !== j))}>×</button>
                        </div>
                      ))}
                      <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => setS([...cur, ''])}>+ Add slide</button>
                      <TweakSlider label="Speed" value={o.ssSpeed != null ? o.ssSpeed : (b.speed != null ? b.speed : 40)}
                                   min={-300} max={300} step={1} unit="px/s"
                                   onChange={(v) => setBlock(it.key, { ssSpeed: v })} />
                      <div style={{ ...note, marginTop: -4 }}>Positive drifts right, negative drifts left, 0 holds still.</div>
                      <TweakToggle label="Start from end" value={o.ssFromEnd != null ? o.ssFromEnd === true : b.fromEnd === true}
                                   onChange={(v) => setBlock(it.key, { ssFromEnd: v === (b.fromEnd === true) ? null : v })} />
                      <div style={{ ...note, marginTop: -4 }}>On page load the slideshow starts at its end, with the last image at the right edge.</div>
                      <TweakToggle label="Start when in view" value={o.ssWaitView != null ? o.ssWaitView === true : b.waitView === true}
                                   onChange={(v) => setBlock(it.key, { ssWaitView: v === (b.waitView === true) ? null : v })} />
                      <div style={{ ...note, marginTop: -4 }}>Holds still until the page is scrolled to the slideshow, then starts drifting.</div>
                      <TweakSlider label="Gap" value={o.ssGap != null ? o.ssGap : (b.gap || 0)}
                                   min={0} max={80} step={1} unit="px"
                                   onChange={(v) => setBlock(it.key, { ssGap: v })} />
                      <TweakToggle label="Interactive" value={o.ssInteractive != null ? o.ssInteractive === true : b.interactive === true}
                                   onChange={(v) => setBlock(it.key, { ssInteractive: v === (b.interactive === true) ? null : v })} />
                      <div style={note}>Keeps drifting, and the viewer can also move through the images: arrows, dragging, or a sideways trackpad swipe. The drift pauses briefly after each move.</div>
                      {(o.ssInteractive != null ? o.ssInteractive === true : b.interactive === true) ? (
                        <TweakSection label="Glyph" sub collapsible defaultOpen={false}>
                          <TweakText label="Glyph" value={o.ssArrow != null && o.ssArrow !== '' ? o.ssArrow : (b.arrow || '\u2192')}
                                     placeholder="→"
                                     onChange={(v) => setBlock(it.key, { ssArrow: v ? v : null })} />
                          <div style={{ ...note, marginTop: -4 }}>It should point right (use Rotation if it doesn't); the left one is the same glyph, flipped.</div>
                          <TweakSlider label="Size" value={o.ssArrowSize != null ? o.ssArrowSize : (b.arrowSize || 28)}
                                       min={8} max={120} step={1} unit="px"
                                       onChange={(v) => setBlock(it.key, { ssArrowSize: v })} />
                          <TweakRadio  label="Rotation" value={String((((Math.round(((o.ssArrowRot != null ? o.ssArrowRot : b.arrowRot) || 0) / 90)) % 4) + 4) % 4 * 90)}
                                       options={[{ value: '0', label: '0°' }, { value: '90', label: '90°' }, { value: '180', label: '180°' }, { value: '270', label: '270°' }]}
                                       onChange={(v) => setBlock(it.key, { ssArrowRot: Number(v) || null })} />
                          <TweakSlider label="X offset" value={o.ssArrowX != null ? o.ssArrowX : (b.arrowX != null ? b.arrowX : 4)}
                                       min={0} max={300} step={1} unit="px"
                                       onChange={(v) => setBlock(it.key, { ssArrowX: v })} />
                          <div style={{ ...note, marginTop: -4 }}>Distance of each glyph from its edge of the slideshow.</div>
                          <ColorHexRow label="Color" value={o.ssArrowColor || b.arrowColor || '#111111'}
                                       onChange={(v) => setBlock(it.key, { ssArrowColor: v })} />
                          <ColorHexRow label="Hover color" value={o.ssArrowHover || b.arrowHover || o.ssArrowColor || b.arrowColor || '#111111'}
                                       onChange={(v) => setBlock(it.key, { ssArrowHover: v })} />
                        </TweakSection>
                      ) : null}
                      <TweakSection label="Divider" sub collapsible defaultOpen={false}>
                        <TweakToggle label="Divider" value={o.ssDiv != null ? o.ssDiv === true : b.divider === true}
                                     onChange={(v) => setBlock(it.key, { ssDiv: v === (b.divider === true) ? null : v })} />
                        <div style={{ ...note, marginTop: -4 }}>A glyph between the last slide and the first, so it's clear where the slideshow starts and ends.</div>
                        {(o.ssDiv != null ? o.ssDiv === true : b.divider === true) ? (
                          <>
                            <TweakToggle label="Top glyph" value={o.ssDivTop != null ? o.ssDivTop !== false : b.divTop !== false}
                                         onChange={(v) => setBlock(it.key, { ssDivTop: v ? null : false })} />
                            <TweakToggle label="Middle glyph" value={o.ssDivMid != null ? o.ssDivMid !== false : b.divMid !== false}
                                         onChange={(v) => setBlock(it.key, { ssDivMid: v ? null : false })} />
                            <TweakToggle label="Bottom glyph" value={o.ssDivBot != null ? o.ssDivBot !== false : b.divBot !== false}
                                         onChange={(v) => setBlock(it.key, { ssDivBot: v ? null : false })} />
                            <div style={{ ...note, marginTop: -4 }}>Top and bottom sit midway between the middle glyph and the slideshow's upper / lower edge.</div>
                            <TweakText label="Glyph" value={o.ssDivGlyph != null && o.ssDivGlyph !== '' ? o.ssDivGlyph : (b.divGlyph || '\u2726')}
                                       placeholder="✦"
                                       onChange={(v) => setBlock(it.key, { ssDivGlyph: v ? v : null })} />
                            <TweakSlider label="Size" value={o.ssDivSize != null ? o.ssDivSize : (b.divSize || 28)}
                                         min={8} max={200} step={1} unit="px"
                                         onChange={(v) => setBlock(it.key, { ssDivSize: v })} />
                            <ColorHexRow label="Color" value={o.ssDivColor || b.divColor || '#111111'}
                                         onChange={(v) => setBlock(it.key, { ssDivColor: v })} />
                            <TweakSlider label="Spacing" value={o.ssDivSpace != null ? o.ssDivSpace : (b.divSpace != null ? b.divSpace : 160)}
                                         min={0} max={800} step={2} unit="px"
                                         onChange={(v) => setBlock(it.key, { ssDivSpace: v })} />
                            <div style={{ ...note, marginTop: -4 }}>The space between the last and first slide; the glyph sits in its centre.</div>
                          </>
                        ) : null}
                      </TweakSection>
                    </TweakSection>
                  );
                })() : null}
                {b.type === 'row' ? (() => {
                  /* the row's images, stored relative to assets/ like slideshow
                     slides; the resolver maps each back onto its authored entry
                     (keeping per-item w / maxW / scale) when the file matches */
                  const opts = bioVideoOptions().map((op) => ({ value: decodeURIComponent(op.value.replace(/^assets\//, '')), label: op.label }));
                  const toRel = (src) => (!src ? '' : String(src).indexOf('/') !== -1 ? src : p.id + '/' + src);
                  const cur = (Array.isArray(o.rowImages) ? o.rowImages : (b.images || []).map((im) => toRel(typeof im === 'string' ? im : (im && im.src))));
                  const setR = (n) => setBlock(it.key, { rowImages: n });
                  return (
                    <TweakSection label="Images" sub collapsible defaultOpen={false}>
                      {cur.map((src, j) => (
                        <div key={j} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <TweakSelect label={'Image ' + (j + 1)} value={src || ''}
                                         options={[{ value: '', label: 'Choose…' }, ...opts]}
                                         onChange={(v) => setR(cur.map((x2, k2) => (k2 === j ? v : x2)))} />
                          </div>
                          <button type="button" style={{ ...btn, padding: '0 7px' }} disabled={j === 0}
                                  onClick={() => { const n = cur.slice(); [n[j - 1], n[j]] = [n[j], n[j - 1]]; setR(n); }}>↑</button>
                          <button type="button" style={{ ...btn, padding: '0 7px', color: '#b5482f' }}
                                  onClick={() => setR(cur.filter((_, k2) => k2 !== j))}>×</button>
                        </div>
                      ))}
                      <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={() => setR([...cur, ''])}>+ Add image</button>
                      <div style={note}>Images sit side by side at one shared height, widths by their proportions.</div>
                    </TweakSection>
                  );
                })() : null}
                {isText ? (
                  <>
                    {place !== 'right' && place !== 'center' ? (
                      <TweakRadio label="Layout" value={mode}
                                  options={[{ value: 'stack', label: 'Title over body' }, { value: 'beside', label: 'Title beside body' }]}
                                  onChange={(v) => setBlock(it.key, { mode: v === 'beside' ? 'beside' : null })} />
                    ) : null}
                    {mode === 'beside' ? <div style={note}>Title in the left column, body in the right — spans both columns.</div> : null}
                    <TweakText label="Title" value={o.title != null ? o.title : (b.title || '')}
                               onChange={(v) => setBlock(it.key, { title: v === (b.title || '') ? null : v })} />
                    <TweakText label="Body" multiline value={o.body != null ? o.body : (b.body || '')}
                               onChange={(v) => setBlock(it.key, { body: v === (b.body || '') ? null : v })} />
                    {(o.title != null || o.body != null) ? (
                      <button type="button" style={{ ...btn, alignSelf: 'flex-start' }}
                              onClick={() => setBlock(it.key, { title: null, body: null })}>Restore original text</button>
                    ) : null}
                  </>
                ) : null}
              </TweakSection>
            </div>
          );
        })}
        {p && touched ? (
          <button type="button" style={{ ...btn, alignSelf: 'flex-start', color: '#b5482f' }}
                  onClick={() => { const n = { ...layout }; delete n[p.id]; setTweak('projLayout', n); }}>Reset this page to original</button>
        ) : null}
      </TweakSection>
    );
  }

  /* ── TAG LIST editor (Tags → Tag list) ──────────────────────────────────
     The vocabulary the project-page tag pickers choose from. Editing a label
     renames the tag everywhere (keys never change); per-tag colours override
     the global tag colours (fill / outline only in the boxed style). */
  function TagListEditor({ t, setTweak }) {
    const list = Array.isArray(t.tagList) ? t.tagList
      : (window.__tagDefsAuthored || []).map((d) => ({ key: d.key, label: d.label }));
    const boxed = t.tagStyle === 'boxed';
    const save = (n) => setTweak('tagList', n);
    const upd = (i, patch) => save(list.map((d, k) => {
      if (k !== i) return d;
      const nd = { ...d, ...patch };
      Object.keys(patch).forEach((kk) => { if (patch[kk] == null || patch[kk] === '') delete nd[kk]; });
      if (nd.label == null) nd.label = d.label;
      return nd;
    }));
    const move = (i, dd) => { const j = i + dd; if (j < 0 || j >= list.length) return; const n = list.slice(); [n[i], n[j]] = [n[j], n[i]]; save(n); };
    const used = (k) => (window.projects || []).filter((p) => (p.tags || []).indexOf(k) >= 0).length;
    const add = () => {
      let base = 'tag', key = base, n = 2;
      const has = (kk) => list.some((d) => d.key === kk);
      while (has(key)) key = base + '-' + (n++);
      save([...list, { key, label: 'New tag' }]);
    };
    const btn = { height: 24, padding: '0 10px', fontSize: 11, border: '1px solid rgba(41,38,27,.25)', background: '#fff', borderRadius: 5, cursor: 'pointer' };
    const note = { fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' };
    /* a plain render helper, NOT a component: an inner component is a new
       type every render, so React remounted the colour input on each change
       and the native picker closed after a single click */
    const colorOpt = (label, d, i, k, fallback) => (
      <React.Fragment key={k}>
        <ColorAlphaRow label={label + (d[k] ? '' : ' (default)')} value={d[k] || fallback}
                       onChange={(v) => upd(i, { [k]: v })} />
        {d[k] ? <button type="button" style={{ ...btn, alignSelf: 'flex-start', marginTop: -4 }} onClick={() => upd(i, { [k]: null })}>Use default</button> : null}
      </React.Fragment>
    );
    return (
      <TweakSection label={'Tag list (' + list.length + ')'} sub collapsible defaultOpen={false}>
        <div style={note}>The tags the project pages pick from. Renaming a tag updates every project using it.</div>
        {list.map((d, i) => (
          <TweakSection key={d.key} label={d.label || d.key} sub collapsible defaultOpen={false}>
            <TweakText label="Text" value={d.label || ''} onChange={(v) => upd(i, { label: v })} />
            {colorOpt('Text color', d, i, 'text', t.tagText || '#111111')}
            {boxed ? (
              <>
                {colorOpt('Fill', d, i, 'fill', t.tagFill || '#00000000')}
                {colorOpt('Outline', d, i, 'outline', t.tagOutline || '#cccccc')}
              </>
            ) : null}
            <div style={note}>Used by {used(d.key)} project{used(d.key) === 1 ? '' : 's'}.</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={btn} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" style={btn} onClick={() => move(i, 1)} disabled={i === list.length - 1}>↓</button>
              <button type="button" style={{ ...btn, marginLeft: 'auto', color: '#b5482f' }}
                      onClick={() => save(list.filter((_, k) => k !== i))}>Remove</button>
            </div>
          </TweakSection>
        ))}
        <button type="button" style={{ ...btn, alignSelf: 'flex-start' }} onClick={add}>+ Add tag</button>
      </TweakSection>
    );
  }

  function App() {
    const [t, setTweak, history] = useTweaks(window.TWEAKS);
    const [panelOpen, setPanelOpen] = React.useState(false);
    /* ref mirror of panelOpen so the key handler always sees the live value
       without re-registering (and works even if React state is mid-update) */
    const panelOpenRef = React.useRef(false);
    panelOpenRef.current = panelOpen;

    /* push every change into the page on the next paint */
    React.useEffect(() => { window.applyTweaks(t); }, [t]);

    /* Signal the lazy loader in index.html that the panel is MOUNTED and its
       message listeners are live. Must be an effect, not a line after
       ReactDOM.render — a React 18 concurrent root renders asynchronously, so a
       flag set at call time fires before any listener exists and the loader's
       replayed __activate_edit_mode is missed. Child effects (TweaksPanel's own
       listener) have already run by the time this parent effect does. */
    React.useEffect(() => { window.__TWEAKS_READY = true; }, []);

    /* mirror panel open state from host / panel messages */
    React.useEffect(() => {
      const onMsg = (e) => {
        const ty = e && e.data && e.data.type;
        if (ty === '__activate_edit_mode') setPanelOpen(true);
        else if (ty === '__deactivate_edit_mode' || ty === '__edit_mode_dismissed')
          setPanelOpen(false);
      };
      window.addEventListener('message', onMsg);
      return () => window.removeEventListener('message', onMsg);
    }, []);

    /* ` toggles the panel — works in present / fullscreen / new-tab modes.
       Registered once (capture phase, on both document and window) so it
       catches the key regardless of focus target. Matches the PHYSICAL key
       (e.code) as well as the character: on a non-US layout (e.g. Hebrew) that
       key produces ';' rather than '`', so an e.key-only test never fires. */
    React.useEffect(() => {
      const onKey = (e) => {
        if (!(e.code === 'Backquote' || e.key === '`')) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.target && e.target.isContentEditable) return;
        e.preventDefault();
        window.postMessage({
          type: panelOpenRef.current ? '__deactivate_edit_mode' : '__activate_edit_mode'
        }, '*');
      };
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('keydown', onKey, true);
      return () => {
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('keydown', onKey, true);
      };
    }, []);

    return (
      <ColorTokensCtx.Provider value={t}>
      <TweaksPanel title="Design tokens" history={history}>

        {/* ── TYPOGRAPHY (collapsed by default, open the one you need) ─ */}
        <TweakSection label="Typography" top collapsible defaultOpen={false}>
          <TweakSelect label="Font family" value={t.font}
                       options={[
                         { value: 'geist',     label: 'Geist' },
                         { value: 'satoshi',   label: 'Satoshi' },
                         { value: 'generalsans', label: 'General Sans' },
                         { value: 'jakarta',   label: 'Plus Jakarta Sans' },
                         { value: 'notosans',  label: 'Noto Sans' },
                         { value: 'system',    label: 'System sans' },
                         { value: 'helvetica', label: 'Helvetica Neue' },
                         { value: 'georgia',   label: 'Georgia (serif)' },
                         { value: 'mono',      label: 'Monospace' }
                       ]}
                       onChange={(v) => setTweak('font', v)} />
          <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Backup font: Noto Sans Symbols 2. It draws any arrow or symbol the chosen font lacks (e.g. 🢓 🢑 🞢 ▲ ✳), so these glyphs look the same on Mac and Windows. Letters and emoji are unaffected.</div>
          <TypeBlock label="Title (logo)"      prefix="title"  t={t} setTweak={setTweak} />
          <TypeBlock label="Home Project Title" prefix="h1"    t={t} setTweak={setTweak} />
          <TypeBlock label="Mini Description"  prefix="mini"   t={t} setTweak={setTweak} />
          <TypeBlock label="Project Page Title" prefix="h2"     t={t} setTweak={setTweak} />
          <TypeBlock label="Accolades"         prefix="h3"     t={t} setTweak={setTweak} />
          <TypeBlock label="About"             prefix="h4"     t={t} setTweak={setTweak} />
          <TypeBlock label="Bio"               prefix="bio"    t={t} setTweak={setTweak} />
          <TypeBlock label="Text Title"        prefix="h5"     t={t} setTweak={setTweak} />
          <TypeBlock label="Text Body"         prefix="body"   t={t} setTweak={setTweak} />
          <TypeBlock label="Project Description" prefix="pdesc" t={t} setTweak={setTweak} />
          <TypeBlock label="Tags"              prefix="tags"   t={t} setTweak={setTweak} />
          <TypeBlock label="Filters"           prefix="filter" t={t} setTweak={setTweak} />
          <TypeBlock label="Labels"            prefix="labels" t={t} setTweak={setTweak} />
          <TweakSection label="Link underline" sub collapsible defaultOpen={false}>
            <TweakSlider label="Thickness" value={t.linkUlWidth != null ? t.linkUlWidth : 1}
                         min={0.5} max={6} step={0.5} unit="px"
                         onChange={(v) => setTweak('linkUlWidth', v)} />
            <TweakSlider label="Offset" value={t.linkUlOffset != null ? t.linkUlOffset : 0.16}
                         min={0} max={0.5} step={0.01} unit="em"
                         onChange={(v) => setTweak('linkUlOffset', v)} />
          </TweakSection>
        </TweakSection>

        {/* ── COLORS ──────────────────────────────────────────────────── */}
        <TweakSection label="Colors" top collapsible defaultOpen={false}>
          <ColorHexRow noRef label="Text"         value={t.colorText}      onChange={(v) => setTweak('colorText', v)} />
          <ColorHexRow noRef label="Background"   value={t.colorBg}        onChange={(v) => setTweak('colorBg', v)} />
          <ColorHexRow noRef label="Bg secondary" value={t.colorBgSec}     onChange={(v) => setTweak('colorBgSec', v)} />
          <ColorHexRow noRef label="Bg tertiary"  value={t.colorBgTer}     onChange={(v) => setTweak('colorBgTer', v)} />
          <ColorHexRow noRef label="Highlight"    value={t.colorHighlight} onChange={(v) => setTweak('colorHighlight', v)} />
          <ColorHexRow noRef label="Border"       value={t.colorBorder}    onChange={(v) => setTweak('colorBorder', v)} />
          <ColorHexRow noRef label="Muted"        value={t.colorMuted}     onChange={(v) => setTweak('colorMuted', v)} />
          <ColorHexRow noRef label="Faint"        value={t.colorFaint}     onChange={(v) => setTweak('colorFaint', v)} />
        </TweakSection>

        {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
        <TweakSection label="Toolbar" top collapsible defaultOpen={false}>
          <TweakSlider label="Left panel width" value={t.leftW}
                       min={240} max={520} step={1} unit="px"
                       onChange={(v) => setTweak('leftW', v)} />
          <TweakSlider label="Margin X" value={t.marginX != null ? t.marginX : 28}
                       min={8} max={96} step={1} unit="px"
                       onChange={(v) => setTweak('marginX', v)} />
          <TweakToggle label="Edge divider" value={t.tbEdgeShow !== false}
                       onChange={(v) => setTweak('tbEdgeShow', v)} />

          <TweakSection label="Logo" sub collapsible defaultOpen={false}>
            <TweakText   label="Text"
                         value={t.logoText != null && t.logoText !== '' ? t.logoText
                                : ((window.LOGO && window.LOGO.idle && window.LOGO.idle.text) || '')}
                         onChange={(v) => setTweak('logoText', v)} />
            <TweakRadio  label="Size mode" value={t.logoFit === 'font' ? 'font' : 'fit'}
                         options={['fit', 'font']}
                         onChange={(v) => setTweak('logoFit', v)} />
            <TweakSlider label="Logo Y" value={t.logoY != null ? t.logoY : 32}
                         min={0} max={500} step={1} unit="px"
                         onChange={(v) => setTweak('logoY', v)} />
            <TweakRadio  label="Align" value={t.logoAlign || 'center'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('logoAlign', v)} />
            <ColorHexRow label="Idle color" value={t.logoColor || '@colorText'}
                         onChange={(v) => setTweak('logoColor', v)} />
            <ColorHexRow label="Hover color" value={t.logoHoverColor || '@colorHighlight'}
                         onChange={(v) => setTweak('logoHoverColor', v)} />
            <TweakToggle label="Slide in on scroll" value={t.tbSlideLogo !== false}
                         onChange={(v) => setTweak('tbSlideLogo', v)} />
            {t.tbSlideLogo !== false ? (
              <TweakRadio label="Slide from" value={t.logoSlideFrom || 'left'}
                          options={[{ value: 'left', label: 'Left edge' }, { value: 'bottom', label: 'Bottom edge' }]}
                          onChange={(v) => setTweak('logoSlideFrom', v)} />
            ) : null}
            <TweakSection label="Project glyph" sub collapsible defaultOpen={false}>
              <TweakToggle label="Glyph on project + about pages" value={t.logoGlyphOn !== false}
                           onChange={(v) => setTweak('logoGlyphOn', v)} />
              <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>
                On project pages and the about page a glyph slides in from the left edge and nudges the logo right; it slides back out on exit. Uses the logo's idle / hover colours.
              </div>
              {t.logoGlyphOn !== false ? (
                <>
                  <TweakSelect label="Glyph" value={["←","↖","‹","«","→","↳","•","—","+","×","*","✳","■","●"].indexOf(t.logoGlyph || '←') >= 0 ? (t.logoGlyph || '←') : '__custom'}
                               options={[...["←","↖","‹","«","→","↳","•","—","+","×","*","✳","■","●"].map((g) => ({ value: g, label: g })), { value: '__custom', label: 'Custom…' }]}
                               onChange={(v) => setTweak('logoGlyph', v === '__custom' ? ' ' : v)} />
                  {["←","↖","‹","«","→","↳","•","—","+","×","*","✳","■","●"].indexOf(t.logoGlyph || '←') < 0 ? (
                    <TweakText label="Custom glyph" value={(t.logoGlyph || '').trim()} placeholder="Type any character"
                               onChange={(v) => setTweak('logoGlyph', v || ' ')} />
                  ) : null}
                  <TweakSlider label="Size" value={t.logoGlyphSize != null ? t.logoGlyphSize : 100}
                               min={20} max={200} step={1} unit="%"
                               onChange={(v) => setTweak('logoGlyphSize', v)} />
                  <TweakSlider label="Gap to logo" value={t.logoGlyphGap != null ? t.logoGlyphGap : 12}
                               min={0} max={80} step={1} unit="px"
                               onChange={(v) => setTweak('logoGlyphGap', v)} />
                  <TweakSlider label="Y offset" value={t.logoGlyphY != null ? t.logoGlyphY : 0}
                               min={-40} max={40} step={1} unit="px"
                               onChange={(v) => setTweak('logoGlyphY', v)} />
                  <TweakSlider label="Duration" value={t.logoGlyphDur != null ? t.logoGlyphDur : 700}
                               min={200} max={2000} step={10} unit="ms"
                               onChange={(v) => setTweak('logoGlyphDur', v)} />
                </>
              ) : null}
            </TweakSection>
          </TweakSection>

          <TweakSection label="Social icons" sub collapsible defaultOpen={false}>
            <TweakRadio  label="Anchor" value={t.socialAnchor || 'bottom'}
                         options={['top', 'bottom']}
                         onChange={(v) => setTweak('socialAnchor', v)} />
            <TweakSlider label={(t.socialAnchor || 'bottom') === 'bottom' ? 'Y from bottom' : 'Y position'}
                         value={t.socialY != null ? t.socialY : 236}
                         min={0} max={800} step={1} unit="px"
                         onChange={(v) => setTweak('socialY', v)} />
            <TweakRadio  label="Align" value={t.socialAlign || 'left'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('socialAlign', v)} />
            <TweakToggle label="Vertical icons" value={t.socialVertical === true}
                         onChange={(v) => setTweak('socialVertical', v)} />
            <TweakSlider label="Icon gap" value={t.socialGap != null ? t.socialGap : 14}
                         min={0} max={48} step={1} unit="px"
                         onChange={(v) => setTweak('socialGap', v)} />
            <TweakToggle label="Slide in on scroll" value={(t.tbSlideSocial != null ? t.tbSlideSocial : t.tbSlideIn) !== false}
                         onChange={(v) => setTweak('tbSlideSocial', v)} />
            {(t.tbSlideSocial != null ? t.tbSlideSocial : t.tbSlideIn) !== false ? (
              <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Hidden below the bottom edge over the reel; slides up with the projects list.</div>
            ) : null}
            <ColorHexRow label="Idle color" value={t.socialColor || '@colorText'}
                         onChange={(v) => setTweak('socialColor', v)} />
            <ColorHexRow label="Hover color" value={t.socialHoverColor || '@colorHighlight'}
                         onChange={(v) => setTweak('socialHoverColor', v)} />
          </TweakSection>

          <TweakSection label="About link" sub collapsible defaultOpen={false}>
            <TweakText   label="Text" value={t.aboutLabel != null ? t.aboutLabel : '+ about'}
                         onChange={(v) => setTweak('aboutLabel', v)} />
            <TweakSlider label="Y position"
                         value={t.aboutY != null ? t.aboutY : (t.socialY != null ? t.socialY : 236)}
                         min={0} max={800} step={1} unit="px"
                         onChange={(v) => setTweak('aboutY', v)} />
            <TweakRadio  label="Align" value={t.aboutAlign || 'right'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('aboutAlign', v)} />
            <TweakToggle label="Slide in on scroll" value={(t.tbSlideAbout != null ? t.tbSlideAbout : t.tbSlideIn) !== false}
                         onChange={(v) => setTweak('tbSlideAbout', v)} />
            {(t.tbSlideAbout != null ? t.tbSlideAbout : t.tbSlideIn) !== false ? (
              <TweakRadio label="Slide from" value={t.aboutSlideFrom || 'left'}
                          options={[{ value: 'left', label: 'Left edge' }, { value: 'bottom', label: 'Bottom edge' }]}
                          onChange={(v) => setTweak('aboutSlideFrom', v)} />
            ) : null}
            <ColorHexRow label="About idle color" value={t.aboutColor || '@colorText'}
                         onChange={(v) => setTweak('aboutColor', v)} />
            <ColorHexRow label="About hover color" value={t.aboutHoverColor || '@colorHighlight'}
                         onChange={(v) => setTweak('aboutHoverColor', v)} />
          </TweakSection>

          <TweakSection label="Divider" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show divider" value={t.socialDivider !== false}
                         onChange={(v) => setTweak('socialDivider', v)} />
            <TweakSlider label="Divider Y" value={t.dividerY != null ? t.dividerY : 190}
                         min={0} max={800} step={1} unit="px"
                         onChange={(v) => setTweak('dividerY', v)} />
          </TweakSection>

          <TweakSection label="Bio" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show bio" value={t.bioShow !== false}
                         onChange={(v) => setTweak('bioShow', v)} />
            <TweakToggle label="Show only on reel" value={t.bioScrollHide !== false}
                         onChange={(v) => setTweak('bioScrollHide', v)} />
            {t.bioScrollHide !== false ? (
              <>
                <TweakRadio label="Exit / enter" value={t.bioScrollAnim === 'fade' ? 'fade' : 'slide'}
                            options={[{ value: 'fade', label: 'Fade' }, { value: 'slide', label: 'Slide' }]}
                            onChange={(v) => setTweak('bioScrollAnim', v)} />
              </>
            ) : null}
            <TweakSlider label="Y position" value={t.bioY != null ? t.bioY : 286}
                         min={0} max={800} step={1} unit="px"
                         onChange={(v) => setTweak('bioY', v)} />
            <TweakRadio  label="Align" value={t.bioAlign || 'left'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('bioAlign', v)} />
            <TweakText   label="Text" multiline
                         value={t.bioShort != null && t.bioShort !== '' ? t.bioShort
                                : (window.__bioShortDefault || window.BIO_SHORT || '')}
                         onChange={(v) => setTweak('bioShort', v)} />
            <BioLinksEditor t={t} setTweak={setTweak} />
          </TweakSection>

          <TweakSection label="Hero Image" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show image" value={t.gifShow !== false}
                         onChange={(v) => setTweak('gifShow', v)} />
            <TweakSlider label="Image Y" value={t.gifY != null ? t.gifY : 32}
                         min={0} max={600} step={1} unit="px"
                         onChange={(v) => setTweak('gifY', v)} />
            <TweakSlider label="Image size" value={t.gifSize != null ? t.gifSize : 130}
                         min={40} max={1000} step={1} unit="px"
                         onChange={(v) => setTweak('gifSize', v)} />
            <TweakRadio  label="Image align" value={t.gifAlign || 'left'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('gifAlign', v)} />
            {/* off: idle + hover both play. on: idle holds a still frame and
                hovering resumes playback from where it stopped. */}
            <TweakToggle label="Freeze when idle" value={!!t.gifFreezeIdle}
                         onChange={(v) => setTweak('gifFreezeIdle', v)} />

            <TweakSection label="Idle" sub collapsible defaultOpen={false}>
              <TweakSlider label="Blur" value={t.gifBlur != null ? t.gifBlur : 0}
                           min={0} max={40} step={0.5} unit="px"
                           onChange={(v) => setTweak('gifBlur', v)} />
              <TweakSlider label="Hue" value={t.gifHue != null ? t.gifHue : 0}
                           min={0} max={360} step={1} unit="°"
                           onChange={(v) => setTweak('gifHue', v)} />
              <TweakSlider label="Opacity" value={t.gifOpacity != null ? t.gifOpacity : 1}
                           min={0} max={1} step={0.02}
                           onChange={(v) => setTweak('gifOpacity', v)} />
              <TweakSlider label="Saturation" value={t.gifSat != null ? t.gifSat : 1}
                           min={0} max={2} step={0.02}
                           onChange={(v) => setTweak('gifSat', v)} />
              <TweakSlider label="Edge fade" value={t.gifFade != null ? t.gifFade : 40}
                           min={0} max={90} step={1} unit="%"
                           onChange={(v) => setTweak('gifFade', v)} />
              <TweakSlider label="Corner roundness" value={t.gifRound != null ? t.gifRound : 100}
                           min={0} max={100} step={1} unit="%"
                           onChange={(v) => setTweak('gifRound', v)} />
            </TweakSection>

            <TweakSection label="Hover" sub collapsible defaultOpen={false}>
              <TweakSlider label="Scale" value={t.gifHoverScale != null ? t.gifHoverScale : 1.06}
                           min={1} max={1.5} step={0.01}
                           onChange={(v) => setTweak('gifHoverScale', v)} />
              <TweakSlider label="Blur" value={t.gifBlurHover != null ? t.gifBlurHover : 0}
                           min={0} max={40} step={0.5} unit="px"
                           onChange={(v) => setTweak('gifBlurHover', v)} />
              <TweakSlider label="Hue" value={t.gifHueHover != null ? t.gifHueHover : 0}
                           min={0} max={360} step={1} unit="°"
                           onChange={(v) => setTweak('gifHueHover', v)} />
              <TweakSlider label="Opacity" value={t.gifOpacityHover != null ? t.gifOpacityHover : 1}
                           min={0} max={1} step={0.02}
                           onChange={(v) => setTweak('gifOpacityHover', v)} />
              <TweakSlider label="Saturation" value={t.gifSatHover != null ? t.gifSatHover : 1}
                           min={0} max={2} step={0.02}
                           onChange={(v) => setTweak('gifSatHover', v)} />
              <TweakToggle label="Invert hue" value={!!t.gifInvertHover}
                           onChange={(v) => setTweak('gifInvertHover', v)} />
              <TweakSlider label="Edge fade" value={t.gifFadeHover != null ? t.gifFadeHover : 40}
                           min={0} max={90} step={1} unit="%"
                           onChange={(v) => setTweak('gifFadeHover', v)} />
              <TweakSlider label="Corner roundness" value={t.gifRoundHover != null ? t.gifRoundHover : 100}
                           min={0} max={100} step={1} unit="%"
                           onChange={(v) => setTweak('gifRoundHover', v)} />
            </TweakSection>
          </TweakSection>

          {/* TOOLBAR COLLAPSE — the collapse behaviour itself, with the two
              fixed toggle buttons as a nested dropdown. */}
          <TweakSection label="Collapse" sub collapsible defaultOpen={false}>
            <TweakSlider label="Full-size width" value={t.tbRefW != null ? t.tbRefW : 0}
                         min={0} max={3000} step={10} unit="px"
                         onChange={(v) => setTweak('tbRefW', v)} />
            <TweakSlider label="Collapse below" value={t.tbCollapseAt != null ? t.tbCollapseAt : 50}
                         min={10} max={95} step={1} unit="%"
                         onChange={(v) => setTweak('tbCollapseAt', v)} />

          <TweakSection label="Expand/Collapse buttons" sub collapsible defaultOpen={false}>
            <TweakSlider label="Size" value={t.tbToggleSize != null ? t.tbToggleSize : 44}
                         min={8} max={96} step={1} unit="px"
                         onChange={(v) => setTweak('tbToggleSize', v)} />
            <TweakSlider label="Y from top" value={t.tbToggleY != null ? t.tbToggleY : 360}
                         min={0} max={1200} step={1} unit="px"
                         onChange={(v) => setTweak('tbToggleY', v)} />
            <TweakSlider label="Radius" value={t.tbToggleRadius != null ? t.tbToggleRadius : 0}
                         min={0} max={48} step={1} unit="px"
                         onChange={(v) => setTweak('tbToggleRadius', v)} />
            <TweakSection label="Open about" sub collapsible defaultOpen={false}>
              <TweakSlider label="Edge offset" value={(t.tbToggleX != null ? t.tbToggleX : 16)}
                           min={0} max={120} step={1} unit="px"
                           onChange={(v) => setTweak('tbToggleX', v)} />
              <TweakText   label="Glyph" value={t.tbOpenAboutGlyph || ''}
                           onChange={(v) => setTweak('tbOpenAboutGlyph', v)} />
            </TweakSection>
            <TweakSection label="Close about" sub collapsible defaultOpen={false}>
              <TweakSlider label="Edge offset"
                           value={t.tbCloseAboutX != null ? t.tbCloseAboutX : (t.tbToggleX != null ? t.tbToggleX : 16)}
                           min={0} max={200} step={1} unit="px"
                           onChange={(v) => setTweak('tbCloseAboutX', v)} />
              <TweakText   label="Glyph" value={t.tbExpandGlyphAbout || ''}
                           onChange={(v) => setTweak('tbExpandGlyphAbout', v)} />
            </TweakSection>
            <TweakSection label="Expand toolbar (project pages)" sub collapsible defaultOpen={false}>
              <TweakSlider label="Edge offset"
                           value={t.tbToggleXProj != null ? t.tbToggleXProj : (t.tbToggleX != null ? t.tbToggleX : 16)}
                           min={0} max={120} step={1} unit="px"
                           onChange={(v) => setTweak('tbToggleXProj', v)} />
              <TweakText   label="Glyph" value={t.tbExpandGlyph != null ? t.tbExpandGlyph : '☰'}
                           onChange={(v) => setTweak('tbExpandGlyph', v)} />
            </TweakSection>
            <TweakSection label="Collapse toolbar (project pages)" sub collapsible defaultOpen={false}>
              <TweakSlider label="Edge offset"
                           value={t.tbToggleXProjOpen != null ? t.tbToggleXProjOpen : (t.tbToggleX != null ? t.tbToggleX : 16)}
                           min={0} max={120} step={1} unit="px"
                           onChange={(v) => setTweak('tbToggleXProjOpen', v)} />
              <TweakText   label="Glyph" value={t.tbMinimizeGlyph != null ? t.tbMinimizeGlyph : '✕'}
                           onChange={(v) => setTweak('tbMinimizeGlyph', v)} />
            </TweakSection>
            <StateStack fam="tbtoggle" states={TWO_STATES} t={t} setTweak={setTweak} />
            <TweakRadio  label="Box shape" value={t.tbToggleBoxShape || 'square'}
                         options={['square', 'conform']}
                         onChange={(v) => setTweak('tbToggleBoxShape', v)} />
            {(t.tbToggleBoxShape || 'square') === 'square' ? (
              <TweakSlider label="Box size" value={t.tbToggleBoxSize != null ? t.tbToggleBoxSize : 44}
                           min={16} max={140} step={1} unit="px"
                           onChange={(v) => setTweak('tbToggleBoxSize', v)} />
            ) : null}
          </TweakSection>
          </TweakSection>

          <TweakSection label="Vid Description" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show descriptions" value={t.pgDescShow !== false}
                         onChange={(v) => setTweak('pgDescShow', v)} />
            <TweakRadio  label="Align" value={t.pgDescAlign || 'left'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('pgDescAlign', v)} />
            <TweakSlider label="Space above" value={t.pgDescGapTop != null ? t.pgDescGapTop : 24}
                         min={0} max={300} step={1} unit="px"
                         onChange={(v) => setTweak('pgDescGapTop', v)} />
            <TweakSlider label="Space below" value={t.pgDescGapBot != null ? t.pgDescGapBot : 0}
                         min={0} max={300} step={1} unit="px"
                         onChange={(v) => setTweak('pgDescGapBot', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Shown below the project description (and buttons). Title-to-body gap follows Project page → Texts. Also used by the Illustrations poster hover text.</div>
          </TweakSection>
        </TweakSection>

        {/* ── PROJECT LIST (order + per-project show/hide) ───────────── */}
        <TweakSection label="Project List" top collapsible defaultOpen={false}>
          <ProjectOrder t={t} setTweak={setTweak} />
        </TweakSection>

        {/* ── PROJECT THUMBNAIL DISPLAY (List ⇄ Gallery) ──────────────── */}
        <TweakSection label="Project Thumbnail Display" top collapsible defaultOpen={false}>

        <TweakSection label="List Display" sub collapsible defaultOpen={false}>
          <TweakSlider label="Column width"   value={t.listColFrac}
                       min={0.30} max={1.00} step={0.02}
                       onChange={(v) => setTweak('listColFrac', v)} />
          <TweakSlider label="Column position" value={t.listColPos != null ? t.listColPos : 0.5}
                       min={0} max={1} step={0.02}
                       onChange={(v) => setTweak('listColPos', v)} />
          <TweakRadio  label="Thumb align"    value={t.listAlignIn}
                       options={['left', 'center', 'right']}
                       onChange={(v) => setTweak('listAlignIn', v)} />
          <TweakSlider label="Conformity"     value={t.listConformity != null ? t.listConformity : 1}
                       min={0} max={1} step={0.05}
                       onChange={(v) => setTweak('listConformity', v)} />
          <TweakSlider label="Spacing"        value={t.listSpacing}
                       min={0} max={300} step={1} unit="px"
                       onChange={(v) => setTweak('listSpacing', v)} />
          <TweakSlider label="Max thumb h"    value={t.listMaxThumbH}
                       min={30} max={100} step={1} unit="%"
                       onChange={(v) => setTweak('listMaxThumbH', v)} />
          <TweakSlider label="Column Y"       value={t.listColumnY != null ? t.listColumnY : 0}
                       min={-400} max={400} step={1} unit="px"
                       onChange={(v) => setTweak('listColumnY', v)} />
          <TweakSlider label="Hover scale"    value={t.listHoverScale}
                       min={1.00} max={1.30} step={0.01}
                       onChange={(v) => setTweak('listHoverScale', v)} />

          <TweakSection label="Inactive thumbnails" sub collapsible defaultOpen={false}>
            <TweakToggle label="Inactive selectable" value={t.listInactiveSelectable !== false}
                         onChange={(v) => setTweak('listInactiveSelectable', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>On = clicking an inactive thumbnail glides it into the active spot (it doesn't open — click it again once active to open). Off = only the active thumbnail is clickable.</div>
            <TweakSlider label="Opacity" value={t.listInactiveOpacity}
                         min={0} max={1.0} step={0.05}
                         onChange={(v) => setTweak('listInactiveOpacity', v)} />
            <TweakSlider label="Saturation" value={t.listInactiveSaturation != null ? t.listInactiveSaturation : 1}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('listInactiveSaturation', v)} />
            <TweakSlider label="Blur" value={t.listInactiveBlur != null ? t.listInactiveBlur : 0}
                         min={0} max={20} step={0.5} unit="px"
                         onChange={(v) => setTweak('listInactiveBlur', v)} />
            <TweakSlider label="Edge shape" value={t.listInactiveShape != null ? t.listInactiveShape : 0}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('listInactiveShape', v)} />
            <ColorHexRow label="Tint"   value={t.listInactiveTint || '#ffffff'}
                         onChange={(v) => setTweak('listInactiveTint', v)} />
            <TweakSlider label="Tint strength" value={t.listInactiveTintStrength != null ? t.listInactiveTintStrength : 0}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('listInactiveTintStrength', v)} />
          </TweakSection>

          <TweakSection label="Scroll" sub collapsible defaultOpen={false}>
            <TweakRadio  label="Method" value={t.listScrollMode === 'classic' ? 'classic' : 'step'}
                         options={[{ value: 'step', label: 'Step (new)' }, { value: 'classic', label: 'Classic' }]}
                         onChange={(v) => setTweak('listScrollMode', v)} />
            {t.listScrollMode === 'classic' ? (
              <>
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Classic: scrolling glides with momentum, then snaps to the nearest project once you stop.</div>
            <TweakSlider label="Scroll speed" value={t.listScrollSpeed}
                         min={0.1} max={10} step={0.1}
                         onChange={(v) => setTweak('listScrollSpeed', v)} />
            <TweakSlider label="Scroll smoothing" value={t.listScrollSmoothing != null ? t.listScrollSmoothing : 0.9}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('listScrollSmoothing', v)} />
            <TweakToggle label="Snap to project" value={t.listSnapEnabled !== false}
                         onChange={(v) => setTweak('listSnapEnabled', v)} />
            <TweakSlider label="Snap speed"     value={t.listSnapSpeed != null ? t.listSnapSpeed : 0.18}
                         min={0.04} max={0.6} step={0.02}
                         onChange={(v) => setTweak('listSnapSpeed', v)} />
            <TweakSlider label="Snap time"      value={t.listSnapTime != null ? t.listSnapTime : 0.15}
                         min={0} max={2} step={0.05} unit="s"
                         onChange={(v) => setTweak('listSnapTime', v)} />
              </>
            ) : (
              <>
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Step: each swipe or wheel notch moves straight to the next project with an eased glide. A trackpad's momentum after a flick is ignored, so one flick = one project; flick again for more.</div>
            <TweakSlider label="Glide time" value={t.listStepDuration != null ? t.listStepDuration : 0.5}
                         min={0.15} max={1.5} step={0.05} unit="s"
                         onChange={(v) => setTweak('listStepDuration', v)} />
            <TweakSlider label="Swipe distance" value={t.listStepSens != null ? t.listStepSens : 30}
                         min={5} max={150} step={1} unit="px"
                         onChange={(v) => setTweak('listStepSens', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Glide time = how long the move to the next project takes. Swipe distance = how far a trackpad swipe travels before it switches (lower = more sensitive). A mouse wheel switches on every notch.</div>
              </>
            )}
            <TweakToggle label="Infinite scroll" value={t.listInfinite !== false}
                         onChange={(v) => setTweak('listInfinite', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>↑ / ↓ arrow keys switch projects with either method.</div>
          </TweakSection>
        </TweakSection>{/* end List Display */}

        {/* ── GALLERY DISPLAY — multi-row grid, scrolls horizontally ───── */}
        <TweakSection label="Gallery Display" sub collapsible defaultOpen={false}>
          {/* aspect */}
          <TweakRadio  label="Aspect" value={t.galConform !== false ? 'conform' : 'free'}
                       options={['free', 'conform']}
                       onChange={(v) => setTweak('galConform', v === 'conform')} />
          {t.galConform !== false && (
            <>
              <TweakRadio label="Aspect ratio" value={t.galAspect || '1:1'}
                          options={['16:9', '4:3', '3:2', '1:1']}
                          onChange={(v) => setTweak('galAspect', v)} />
              <TweakToggle label="Flip ratio" value={!!t.galAspectFlip}
                           onChange={(v) => setTweak('galAspectFlip', v)} />
            </>
          )}

          {/* gallery-specific hover-info type sizes (independent of the list
              display's title/mini/tag sizes) */}
          <TweakSection label="Info text" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show all (even unhovered)" value={!!t.galInfoAlways}
                         onChange={(v) => setTweak('galInfoAlways', v)} />
            {/* per-part visibility — grouped at the top beneath Show all */}
            <TweakToggle label="Show title" value={t.galInfoTitle !== false}
                         onChange={(v) => setTweak('galInfoTitle', v)} />
            <TweakToggle label="Show mini description" value={t.galInfoMini !== false}
                         onChange={(v) => setTweak('galInfoMini', v)} />
            <TweakToggle label="Show tags" value={t.galInfoTags !== false}
                         onChange={(v) => setTweak('galInfoTags', v)} />

            {/* SIZES — sizes + leading (scale with the content-section width) */}
            <TweakSection label="Sizes" sub collapsible defaultOpen={false}>
              <TweakSlider label="Title size" value={t.galTitleSize != null ? t.galTitleSize : 34}
                           min={12} max={96} step={1} unit="px"
                           onChange={(v) => setTweak('galTitleSize', v)} />
              <TweakSlider label="Title leading" value={t.galTitleLeading != null ? t.galTitleLeading : 1.4}
                           min={0.8} max={2} step={0.02}
                           onChange={(v) => setTweak('galTitleLeading', v)} />
              <TweakSlider label="Mini description size" value={t.galMiniSize != null ? t.galMiniSize : 18}
                           min={8} max={48} step={1} unit="px"
                           onChange={(v) => setTweak('galMiniSize', v)} />
              <TweakSlider label="Tags size" value={t.galTagSize != null ? t.galTagSize : 12}
                           min={6} max={32} step={1} unit="px"
                           onChange={(v) => setTweak('galTagSize', v)} />
            </TweakSection>

            {/* POSITION — align + global X/Y + the per-project nudges */}
            <TweakSection label="Position" sub collapsible defaultOpen={false}>
              <TweakRadio  label="Align" value={t.galInfoAlign || 'center'}
                           options={['left', 'center', 'right']}
                           onChange={(v) => setTweak('galInfoAlign', v)} />
              <TweakSlider label="Position X" value={t.galInfoX != null ? t.galInfoX : 0}
                           min={-300} max={300} step={1} unit="px"
                           onChange={(v) => setTweak('galInfoX', v)} />
              <TweakSlider label="Position Y" value={t.galInfoY != null ? t.galInfoY : 0}
                           min={-300} max={300} step={1} unit="px"
                           onChange={(v) => setTweak('galInfoY', v)} />

              {/* per-project X/Y nudge of each info block (on top of the global
                  Position X/Y). Each project gets its own pair of sliders. */}
              <TweakSection label="Per project" sub collapsible defaultOpen={false}>
                {(window.projects || []).filter((p) => !p.hidden).map((p) => {
                  var pos = (t.galInfoPos && t.galInfoPos[p.id]) || {};
                  var setPos = (axis, v) => setTweak('galInfoPos', Object.assign({}, t.galInfoPos, {
                    [p.id]: Object.assign({ x: 0, y: 0 }, pos, { [axis]: v })
                  }));
                  return (
                    <TweakSection key={p.id} label={p.title} sub collapsible defaultOpen={false}>
                      <TweakSlider label="X" value={pos.x != null ? pos.x : 0}
                                   min={-300} max={300} step={1} unit="px"
                                   onChange={(v) => setPos('x', v)} />
                      <TweakSlider label="Y" value={pos.y != null ? pos.y : 0}
                                   min={-300} max={300} step={1} unit="px"
                                   onChange={(v) => setPos('y', v)} />
                    </TweakSection>
                  );
                })}
              </TweakSection>
            </TweakSection>
          </TweakSection>

          {/* ── LAYOUT — multi-row grid, scrolls horizontally; tiles flow
              left→right across a row, then down to the next row. Conformity
              here is HEIGHT conformity within rows. ── */}
          <TweakSection label="Row settings" sub collapsible defaultOpen={false}>
            <TweakSlider label="Rows" value={t.galRows != null ? t.galRows : 3}
                         min={1} max={8} step={1}
                         onChange={(v) => setTweak('galRows', v)} />
            <TweakSlider label="Thumbnail size" value={t.galRowThumbSize != null ? t.galRowThumbSize : 200}
                         min={80} max={600} step={2} unit="px"
                         onChange={(v) => setTweak('galRowThumbSize', v)} />
            {t.galConform === false && (
              <TweakSlider label="Thumbnail conformity" value={t.galRowConformity != null ? t.galRowConformity : 1}
                           min={0} max={1} step={0.02}
                           onChange={(v) => setTweak('galRowConformity', v)} />
            )}
            <TweakSlider label="Row spacing" value={t.galRowRowGap != null ? t.galRowRowGap : 24}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('galRowRowGap', v)} />
            <TweakSlider label="Column spacing" value={t.galRowColGap != null ? t.galRowColGap : 24}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('galRowColGap', v)} />
            <TweakSlider label="Row offset" value={t.galRowRowOffset != null ? t.galRowRowOffset : 0}
                         min={-200} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('galRowRowOffset', v)} />
            <TweakSlider label="Column offset" value={t.galRowColOffset != null ? t.galRowColOffset : 0}
                         min={-200} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('galRowColOffset', v)} />
            <TweakSlider label="Rows X" value={t.galRowX != null ? t.galRowX : 40}
                         min={0} max={600} step={1} unit="px"
                         onChange={(v) => setTweak('galRowX', v)} />
            <TweakSlider label="Rows Y" value={t.galRowY != null ? t.galRowY : 120}
                         min={0} max={600} step={1} unit="px"
                         onChange={(v) => setTweak('galRowY', v)} />
            <TweakRadio  label="Align" value={t.galRowAlign || 'top'}
                         options={['top', 'center', 'bottom']}
                         onChange={(v) => setTweak('galRowAlign', v)} />
          </TweakSection>

          <TweakSection label="Scroll" sub collapsible defaultOpen={false}>
            <TweakSlider label="Scroll speed" value={t.galScrollSpeed != null ? t.galScrollSpeed : 1}
                         min={0.2} max={4} step={0.1}
                         onChange={(v) => setTweak('galScrollSpeed', v)} />
            <TweakSlider label="Scroll smoothing" value={t.galScrollSmoothing != null ? t.galScrollSmoothing : 0.8}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('galScrollSmoothing', v)} />
          </TweakSection>

          {/* STATES — the three mutually-exclusive looks a tile can have.
              Grouped so the state trio reads as one thing, separate from the
              layout controls above. */}
          <TweakSection label="States" sub collapsible defaultOpen={false}>

          <TweakSection label="Hovered" sub collapsible defaultOpen={false}>
            {/* preview toggle — scale ALL thumbs to hovered size for composition testing */}
            <TweakToggle label="Show hover scale" value={!!t.galShowHoverScale}
                         onChange={(v) => setTweak('galShowHoverScale', v)} />
            {/* unified hover scale — applies to BOTH column + row order */}
            <TweakSlider label="Hover scale" value={t.galHoverScale != null ? t.galHoverScale : 1.05}
                         min={1.0} max={3} step={0.01}
                         onChange={(v) => setTweak('galHoverScale', v)} />
            <TweakSlider label="Opacity" value={t.galHoverOpacity != null ? t.galHoverOpacity : 1}
                         min={0} max={1.0} step={0.05}
                         onChange={(v) => setTweak('galHoverOpacity', v)} />
            <TweakSlider label="Saturation" value={t.galHoverSaturation != null ? t.galHoverSaturation : 1}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('galHoverSaturation', v)} />
            <TweakSlider label="Blur" value={t.galHoverBlur != null ? t.galHoverBlur : 0}
                         min={0} max={20} step={0.5} unit="px"
                         onChange={(v) => setTweak('galHoverBlur', v)} />
            <TweakSlider label="Edge shape" value={t.galHoverShape != null ? t.galHoverShape : 100}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('galHoverShape', v)} />
            <ColorHexRow label="Tint" value={t.galHoverTint || '#000000'}
                         onChange={(v) => setTweak('galHoverTint', v)} />
            <TweakSlider label="Tint strength" value={t.galHoverTintStrength != null ? t.galHoverTintStrength : 0}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('galHoverTintStrength', v)} />
          </TweakSection>

          {/* UNSELECTED — the non-hovered tiles WHILE another tile is hovered
              (distinct from Inactive, which applies when nothing is hovered). */}
          <TweakSection label="Unselected" sub collapsible defaultOpen={false}>
            <TweakSlider label="Opacity" value={t.galUnselOpacity != null ? t.galUnselOpacity : 1}
                         min={0} max={1.0} step={0.05}
                         onChange={(v) => setTweak('galUnselOpacity', v)} />
            <TweakSlider label="Saturation" value={t.galUnselSaturation != null ? t.galUnselSaturation : 1}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('galUnselSaturation', v)} />
            <TweakSlider label="Blur" value={t.galUnselBlur != null ? t.galUnselBlur : 0}
                         min={0} max={20} step={0.5} unit="px"
                         onChange={(v) => setTweak('galUnselBlur', v)} />
            <TweakSlider label="Edge shape" value={t.galUnselShape != null ? t.galUnselShape : 100}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('galUnselShape', v)} />
            <ColorHexRow label="Tint" value={t.galUnselTint || '#000000'}
                         onChange={(v) => setTweak('galUnselTint', v)} />
            <TweakSlider label="Tint strength" value={t.galUnselTintStrength != null ? t.galUnselTintStrength : 0}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('galUnselTintStrength', v)} />
          </TweakSection>

          <TweakSection label="Inactive" sub collapsible defaultOpen={false}>
            <TweakSlider label="Opacity" value={t.galInactiveOpacity != null ? t.galInactiveOpacity : 1}
                         min={0} max={1.0} step={0.05}
                         onChange={(v) => setTweak('galInactiveOpacity', v)} />
            <TweakSlider label="Saturation" value={t.galInactiveSaturation != null ? t.galInactiveSaturation : 1}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('galInactiveSaturation', v)} />
            <TweakSlider label="Blur" value={t.galInactiveBlur != null ? t.galInactiveBlur : 0}
                         min={0} max={20} step={0.5} unit="px"
                         onChange={(v) => setTweak('galInactiveBlur', v)} />
            <TweakSlider label="Edge shape" value={t.galInactiveShape != null ? t.galInactiveShape : 100}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('galInactiveShape', v)} />
            <ColorHexRow label="Tint" value={t.galInactiveTint || '#ffffff'}
                         onChange={(v) => setTweak('galInactiveTint', v)} />
            <TweakSlider label="Tint strength" value={t.galInactiveTintStrength != null ? t.galInactiveTintStrength : 0}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('galInactiveTintStrength', v)} />
          </TweakSection>

          </TweakSection>{/* end States */}
        </TweakSection>{/* end Gallery Display */}

        {/* ── SWITCH BUTTON (List ⇄ Gallery toggle) ───────────────────── */}
        <TweakSection label="Switch button" sub collapsible defaultOpen={false}>
          <TweakSlider label="X (from right)" value={t.dispX != null ? t.dispX : 28}
                       min={0} max={400} step={1} unit="px"
                       onChange={(v) => setTweak('dispX', v)} />
          <TweakSlider label="Y (from top)" value={t.dispY != null ? t.dispY : 28}
                       min={0} max={1000} step={1} unit="px"
                       onChange={(v) => setTweak('dispY', v)} />
          <TweakSlider label="Size" value={t.dispSize != null ? t.dispSize : 44}
                       min={24} max={96} step={1} unit="px"
                       onChange={(v) => setTweak('dispSize', v)} />
          <TweakSection label="Gallery → List" sub collapsible defaultOpen={false}>
            <TweakSlider label="Ease in" value={t.dispG2LEaseIn != null ? t.dispG2LEaseIn : 30}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('dispG2LEaseIn', v)} />
            <TweakSlider label="Ease out" value={t.dispG2LEaseOut != null ? t.dispG2LEaseOut : 20}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('dispG2LEaseOut', v)} />
            <TweakSlider label="Transition speed" value={t.dispG2LMs != null ? t.dispG2LMs : 500}
                         min={0} max={1500} step={50} unit="ms"
                         onChange={(v) => setTweak('dispG2LMs', v)} />
          </TweakSection>

          <TweakSection label="List → Gallery" sub collapsible defaultOpen={false}>
            <TweakSlider label="Ease in" value={t.dispL2GEaseIn != null ? t.dispL2GEaseIn : 0}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('dispL2GEaseIn', v)} />
            <TweakSlider label="Ease out" value={t.dispL2GEaseOut != null ? t.dispL2GEaseOut : 90}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('dispL2GEaseOut', v)} />
            <TweakSlider label="Transition speed" value={t.dispL2GMs != null ? t.dispL2GMs : 500}
                         min={0} max={1500} step={50} unit="ms"
                         onChange={(v) => setTweak('dispL2GMs', v)} />
          </TweakSection>

          <TweakSection label="Gallery glyph" sub collapsible defaultOpen={false}>
            <TweakText   label="Glyph" value={t.dispListGlyph != null ? t.dispListGlyph : '☰'}
                         onChange={(v) => setTweak('dispListGlyph', v)} />
            <TweakSlider label="Radius" value={t.dispListRadius != null ? t.dispListRadius : (t.dispRadius != null ? t.dispRadius : 0)}
                         min={0} max={48} step={1} unit="px"
                         onChange={(v) => setTweak('dispListRadius', v)} />
          </TweakSection>

          <TweakSection label="List glyph" sub collapsible defaultOpen={false}>
            <TweakText   label="Glyph" value={t.dispGalleryGlyph != null ? t.dispGalleryGlyph : '▦'}
                         onChange={(v) => setTweak('dispGalleryGlyph', v)} />
            <TweakSlider label="Radius" value={t.dispGalleryRadius != null ? t.dispGalleryRadius : (t.dispRadius != null ? t.dispRadius : 0)}
                         min={0} max={48} step={1} unit="px"
                         onChange={(v) => setTweak('dispGalleryRadius', v)} />
          </TweakSection>

          <TweakSection label="Style" sub collapsible defaultOpen={false}>
            <StateStack fam="disp" states={TWO_STATES} t={t} setTweak={setTweak} />
          </TweakSection>
        </TweakSection>

        </TweakSection>{/* end Project Thumbnail Display */}

        {/* ── PROJECT TITLES ──────────────────────────────────────────── */}
        <TweakSection label="Project titles" top collapsible defaultOpen={false}>
          <TweakRadio  label="Align" value={t.titleAlign || 'left'}
                       options={['left', 'center', 'right']}
                       onChange={(v) => setTweak('titleAlign', v)} />
          <ColorHexRow label="Color" value={t.titleColor || '#111111'}
                       onChange={(v) => setTweak('titleColor', v)} />
          <TweakSlider label="X position" value={t.titleStackX != null ? t.titleStackX : 36}
                       min={0} max={600} step={1} unit="px"
                       onChange={(v) => setTweak('titleStackX', v)} />
          <TweakSlider label="Vertical offset" value={t.titleStackOffset != null ? t.titleStackOffset : 0}
                       min={-400} max={400} step={1} unit="px"
                       onChange={(v) => setTweak('titleStackOffset', v)} />
          <TweakSlider label="Row height"     value={t.titleStackRowH != null ? t.titleStackRowH : 44}
                       min={20} max={120} step={1} unit="px"
                       onChange={(v) => setTweak('titleStackRowH', v)} />
          <TweakToggle label="Invert over images"
                       value={t.homeInvertText !== false}
                       onChange={(v) => setTweak('homeInvertText', v)} />

          <TweakSection label="Hover" sub collapsible defaultOpen={false}>
            <TweakSlider label="Hover scale" value={t.titleHoverScale != null ? t.titleHoverScale : 1.08}
                         min={1.0} max={1.5} step={0.01}
                         onChange={(v) => setTweak('titleHoverScale', v)} />
            <ColorHexRow label="Hover color" value={t.titleHoverColor || '#8089ef'}
                         onChange={(v) => setTweak('titleHoverColor', v)} />
          </TweakSection>

          <TweakSection label="Inactive titles" sub collapsible defaultOpen={false}>
            <TweakToggle label="Inactive selectable" value={t.titleInactiveSelectable !== false}
                         onChange={(v) => setTweak('titleInactiveSelectable', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>On = clicking an inactive title glides it into the active spot (it doesn't open — click it again once active to open). Off = only the active title is clickable.</div>
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' }}>Each title position above and below the active one has its own look. Size = scale relative to the active title (1× = same size). Values ease smoothly as titles scroll between positions.</div>
            <TitleSlotSection t={t} setTweak={setTweak} n={1} side="U" label="1st above" />
            <TitleSlotSection t={t} setTweak={setTweak} n={2} side="U" label="2nd above" />
            <TitleSlotSection t={t} setTweak={setTweak} n={3} side="U" label="3rd above" />
            <TitleSlotSection t={t} setTweak={setTweak} n={1} side="D" label="1st below" />
            <TitleSlotSection t={t} setTweak={setTweak} n={2} side="D" label="2nd below" />
            <TitleSlotSection t={t} setTweak={setTweak} n={3} side="D" label="3rd below" />
          </TweakSection>
        </TweakSection>

        {/* ── CENTER MARKER ───────────────────────────────────────────── */}
        <TweakSection label="Center marker" top collapsible defaultOpen={false}>
          <TweakSection label="Glyph" sub collapsible defaultOpen={false}>
            <TweakText label="Glyph" value={t.markerGlyph || '▶'}
                       onChange={(v) => setTweak('markerGlyph', v)} />
            <TweakSlider label="Size"  value={t.markerSize || 14}
                         min={4} max={80} step={1} unit="px"
                         onChange={(v) => setTweak('markerSize', v)} />
            <TweakRadio  label="Rotation" value={String(((Math.round((t.markerRotate || 0) / 90) % 4) + 4) % 4 * 90)}
                         options={[{ value: '0', label: '0°' }, { value: '90', label: '90°' }, { value: '180', label: '180°' }, { value: '270', label: '270°' }]}
                         onChange={(v) => setTweak('markerRotate', Number(v))} />
            <TweakSlider label="Glyph X offset" value={t.markerGlyphX != null ? t.markerGlyphX : 0}
                         min={-40} max={40} step={0.5} unit="px"
                         onChange={(v) => setTweak('markerGlyphX', v)} />
            <TweakSlider label="Glyph Y offset" value={t.markerGlyphY != null ? t.markerGlyphY : 0}
                         min={-40} max={40} step={0.5} unit="px"
                         onChange={(v) => setTweak('markerGlyphY', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Move only the glyph, so it can be lined up with the connector line (many glyphs aren't centred in their own box, which rotating turns sideways). The line stays where it is.</div>
            <ColorHexRow label="Color" value={t.markerColor || '#111111'}
                         onChange={(v) => setTweak('markerColor', v)} />
            <TweakSlider label="Gap from thumb" value={t.markerGap != null ? t.markerGap : 16}
                         min={-200} max={300} step={1} unit="px"
                         onChange={(v) => setTweak('markerGap', v)} />
            <TweakRadio  label="Marker side" value={t.markerAlign || 'left'}
                         options={['left', 'right']}
                         onChange={(v) => setTweak('markerAlign', v)} />
          </TweakSection>
          <TweakSection label="Connector line" sub collapsible defaultOpen={false}>
            <TweakToggle label="Connector line" value={t.markerLine === true}
                         onChange={(v) => setTweak('markerLine', v)} />
            {t.markerLine && (
              <>
                <TweakRadio label="Line connects to" value={t.markerLineEdge || 'left'}
                            options={['left', 'right']}
                            onChange={(v) => setTweak('markerLineEdge', v)} />
                <TweakToggle label="Touch toolbar edge" value={t.markerLineToEdge === true}
                             onChange={(v) => setTweak('markerLineToEdge', v)} />
                <TweakSlider label="Thickness" value={t.markerLineW != null ? t.markerLineW : 1}
                             min={0.5} max={12} step={0.5} unit="px"
                             onChange={(v) => setTweak('markerLineW', v)} />
                <ColorHexRow label="Color" value={t.markerLineColor || t.markerColor || '#111111'}
                             onChange={(v) => setTweak('markerLineColor', v)} />
              </>
            )}
          </TweakSection>
        </TweakSection>

        {/* ── SCROLL MARKERS ──────────────────────────────────────────── */}
        <TweakSection label="Scroll markers" top collapsible defaultOpen={false}>
          <TweakSection label="Project list" sub collapsible defaultOpen={false}>
            <TweakSlider label="Size" value={t.scrollMarkerSize != null ? t.scrollMarkerSize : 14}
                         min={4} max={80} step={1} unit="px"
                         onChange={(v) => setTweak('scrollMarkerSize', v)} />
            <ColorHexRow label="Color" value={t.scrollMarkerColor || t.markerColor || '#111111'}
                         onChange={(v) => setTweak('scrollMarkerColor', v)} />
            <ColorHexRow label="Hover color" value={t.scrollMarkerHover || t.scrollMarkerColor || t.markerColor || '#111111'}
                         onChange={(v) => setTweak('scrollMarkerHover', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Clicking a marker steps one project (down = next, up = previous).</div>
            <TweakSection label="Animation" sub collapsible defaultOpen={false}>
              <TweakToggle label="Animation" value={t.scrollMarkerAnim !== false}
                           onChange={(v) => setTweak('scrollMarkerAnim', v)} />
              <TweakSlider label="Animation size" value={t.scrollMarkerAnimSize != null ? t.scrollMarkerAnimSize : 3}
                           min={0} max={40} step={1} unit="px"
                           onChange={(v) => setTweak('scrollMarkerAnimSize', v)} />
              <TweakSlider label="Animation speed" value={t.scrollMarkerAnimSpeed != null ? t.scrollMarkerAnimSpeed : 1.4}
                           min={0.3} max={4} step={0.1} unit="s"
                           onChange={(v) => setTweak('scrollMarkerAnimSpeed', v)} />
            </TweakSection>
            <TweakSection label="Down (more below)" sub collapsible defaultOpen={false}>
              <TweakText   label="Glyph" value={t.scrollMarkerDownGlyph != null ? t.scrollMarkerDownGlyph : '▼'}
                           onChange={(v) => setTweak('scrollMarkerDownGlyph', v)} />
              <TweakSlider label="X position" value={t.scrollMarkerDownX != null ? t.scrollMarkerDownX : 0}
                           min={-400} max={400} step={1} unit="px"
                           onChange={(v) => setTweak('scrollMarkerDownX', v)} />
              <TweakSlider label="Y from bottom" value={t.scrollMarkerDownY != null ? t.scrollMarkerDownY : 30}
                           min={0} max={900} step={1} unit="px"
                           onChange={(v) => setTweak('scrollMarkerDownY', v)} />
            </TweakSection>
            <TweakSection label="Up (more above)" sub collapsible defaultOpen={false}>
              <TweakText   label="Glyph" value={t.scrollMarkerUpGlyph != null ? t.scrollMarkerUpGlyph : '▲'}
                           onChange={(v) => setTweak('scrollMarkerUpGlyph', v)} />
              <TweakSlider label="X position" value={t.scrollMarkerUpX != null ? t.scrollMarkerUpX : 0}
                           min={-400} max={400} step={1} unit="px"
                           onChange={(v) => setTweak('scrollMarkerUpX', v)} />
              <TweakSlider label="Y from top" value={t.scrollMarkerUpY != null ? t.scrollMarkerUpY : 30}
                           min={0} max={900} step={1} unit="px"
                           onChange={(v) => setTweak('scrollMarkerUpY', v)} />
            </TweakSection>
          </TweakSection>
          <TweakSection label="Home page top" sub collapsible defaultOpen={false}>
            <TweakText   label="Glyph" value={t.reelMarkerGlyph != null ? t.reelMarkerGlyph : '↓'}
                         onChange={(v) => setTweak('reelMarkerGlyph', v)} />
            <TweakSlider label="Size" value={t.reelMarkerSize != null ? t.reelMarkerSize : 24}
                         min={4} max={80} step={1} unit="px"
                         onChange={(v) => setTweak('reelMarkerSize', v)} />
            <ColorHexRow label="Color" value={t.reelMarkerColor || t.markerColor || '#111111'}
                         onChange={(v) => setTweak('reelMarkerColor', v)} />
            <ColorHexRow label="Hover color" value={t.reelMarkerHover || t.reelMarkerColor || t.markerColor || '#111111'}
                         onChange={(v) => setTweak('reelMarkerHover', v)} />
            <TweakSection label="Animation" sub collapsible defaultOpen={false}>
              <TweakToggle label="Animation" value={t.reelMarkerAnim !== false}
                           onChange={(v) => setTweak('reelMarkerAnim', v)} />
              <TweakSlider label="Animation size" value={t.reelMarkerAnimSize != null ? t.reelMarkerAnimSize : 17}
                           min={0} max={40} step={1} unit="px"
                           onChange={(v) => setTweak('reelMarkerAnimSize', v)} />
              <TweakSlider label="Animation speed" value={t.reelMarkerAnimSpeed != null ? t.reelMarkerAnimSpeed : 1.4}
                           min={0.3} max={4} step={0.1} unit="s"
                           onChange={(v) => setTweak('reelMarkerAnimSpeed', v)} />
            </TweakSection>
            <TweakSection label="Placement" sub collapsible defaultOpen={false}>
              <TweakRadio  label="Placement" value={t.reelMarkerPlace === 'toolbar' ? 'toolbar' : 'content'}
                           options={[{ value: 'content', label: 'Main content' }, { value: 'toolbar', label: 'Toolbar' }]}
                           onChange={(v) => setTweak('reelMarkerPlace', v)} />
              {t.reelMarkerPlace === 'toolbar' ? (
                <>
                  <TweakRadio  label="Align" value={t.reelMarkerTbAlign || 'left'}
                               options={['left', 'center', 'right']}
                               onChange={(v) => setTweak('reelMarkerTbAlign', v)} />
                  <TweakSlider label="Y below bio" value={t.reelMarkerTbY != null ? t.reelMarkerTbY : 24}
                               min={-200} max={600} step={1} unit="px"
                               onChange={(v) => setTweak('reelMarkerTbY', v)} />
                </>
              ) : (
                <>
                  <TweakSlider label="X from centre" value={t.reelMarkerContentX != null ? t.reelMarkerContentX : 0}
                               min={-800} max={800} step={1} unit="px"
                               onChange={(v) => setTweak('reelMarkerContentX', v)} />
                  <TweakSlider label="Y from bottom" value={t.reelMarkerContentY != null ? t.reelMarkerContentY : 30}
                               min={0} max={900} step={1} unit="px"
                               onChange={(v) => setTweak('reelMarkerContentY', v)} />
                </>
              )}
            </TweakSection>
          </TweakSection>
        </TweakSection>

        {/* ── HOME REEL (hero) ────────────────────────────────────────── */}
        <TweakSection label="Reel (home hero)" top collapsible defaultOpen={false}>
          <TweakToggle label="Full page" value={!!t.reelFull}
                       onChange={(v) => setTweak('reelFull', v)} />
          <TweakSection label="Bounding box" sub collapsible defaultOpen={false}>
            <TweakRadio  label="Scaling" value={(t.reelBoxMode || 'stretch')}
                         options={[{ value: 'stretch', label: 'Stretch' }, { value: 'uniform', label: 'Uniform' }, { value: 'fixed', label: 'Fixed' }]}
                         onChange={(v) => setTweak('reelBoxMode', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>
              {(t.reelBoxMode || 'stretch') === 'stretch' ? 'Fixed distance from the window edges — the box fills whatever is left and changes shape with the window.'
                : (t.reelBoxMode || 'stretch') === 'uniform' ? 'Locked aspect ratio — box and video keep their proportions and relative position at any window size.'
                : 'Fixed pixel size — does not scale with the window.'}
            </div>
            {(t.reelBoxMode || 'stretch') === 'stretch' ? (
              <>
                <TweakSlider label="Margin X (left + right)" value={t.reelBoxMX != null ? t.reelBoxMX : 0}
                             min={0} max={600} step={1} unit="px"
                             onChange={(v) => setTweak('reelBoxMX', v)} />
                <TweakSlider label="Margin Y (top + bottom)" value={t.reelBoxMY != null ? t.reelBoxMY : 0}
                             min={0} max={400} step={1} unit="px"
                             onChange={(v) => setTweak('reelBoxMY', v)} />
                <TweakSlider label="Offset X" value={t.reelBoxOX || 0}
                             min={-600} max={600} step={1} unit="px"
                             onChange={(v) => setTweak('reelBoxOX', v)} />
                <TweakSlider label="Offset Y" value={t.reelBoxOY || 0}
                             min={-400} max={400} step={1} unit="px"
                             onChange={(v) => setTweak('reelBoxOY', v)} />
                <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Moves the box without resizing it — left/right gaps become Margin X ± Offset X (top/bottom likewise) and stay fixed as the window resizes. The video moves with the box.</div>
              </>
            ) : (t.reelBoxMode || 'stretch') === 'uniform' ? (
              <>
                <TweakSelect label="Aspect ratio" value={t.reelBoxAspect || '16:9'}
                             options={['16:9', '21:9', '2.39:1', '3:2', '4:3', '1:1', '4:5', '9:16']}
                             onChange={(v) => setTweak('reelBoxAspect', v)} />
                <TweakSlider label="Size" value={t.reelBoxSize != null ? t.reelBoxSize : 100}
                             min={10} max={100} step={1} unit="%"
                             onChange={(v) => setTweak('reelBoxSize', v)} />
              </>
            ) : (
              <>
                <TweakSlider label="Width" value={t.reelBoxWpx != null ? t.reelBoxWpx : 1280}
                             min={100} max={3000} step={1} unit="px"
                             onChange={(v) => setTweak('reelBoxWpx', v)} />
                <TweakSlider label="Height" value={t.reelBoxHpx != null ? t.reelBoxHpx : 720}
                             min={100} max={2000} step={1} unit="px"
                             onChange={(v) => setTweak('reelBoxHpx', v)} />
              </>
            )}
            {(t.reelBoxMode || 'stretch') !== 'stretch' ? (
              <>
                <TweakSlider label="Position X" value={t.reelBoxX != null ? t.reelBoxX : 50}
                             min={0} max={100} step={1} unit="%"
                             onChange={(v) => setTweak('reelBoxX', v)} />
                <TweakSlider label="Position Y" value={t.reelBoxY != null ? t.reelBoxY : 50}
                             min={0} max={100} step={1} unit="%"
                             onChange={(v) => setTweak('reelBoxY', v)} />
              </>
            ) : null}
            <TweakSection label="Border" sub collapsible defaultOpen={false}>
              <TweakToggle label="Show border" value={!!t.reelBorderShow}
                           onChange={(v) => setTweak('reelBorderShow', v)} />
              {t.reelBorderShow ? (
                <>
                  <ColorHexRow label="Color" value={t.reelBorderColor || '@colorBorder'}
                               onChange={(v) => setTweak('reelBorderColor', v)} />
                  <TweakSlider label="Width" value={t.reelBorderWidth != null ? t.reelBorderWidth : 1}
                               min={1} max={20} step={1} unit="px"
                               onChange={(v) => setTweak('reelBorderWidth', v)} />
                </>
              ) : null}
            </TweakSection>
          </TweakSection>
          <TweakSection label="Video" sub collapsible defaultOpen={false}>
            <TweakRadio  label="Fit in box" value={t.reelFit || (t.reelFull ? 'cover' : 'contain')}
                         options={[{ value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Fill (crop)' }]}
                         onChange={(v) => setTweak('reelFit', v)} />
            <TweakSlider label="Video size" value={t.reelSize != null ? t.reelSize : 100}
                         min={10} max={200} step={1} unit="%"
                         onChange={(v) => setTweak('reelSize', v)} />
            <TweakRadio  label="Size relative to" value={t.reelVideoBasis || 'box'}
                         options={[{ value: 'box', label: 'Box' }, { value: 'window', label: 'Window' }]}
                         onChange={(v) => setTweak('reelVideoBasis', v)} />
            <TweakSlider label="Position X" value={t.reelVideoX != null ? t.reelVideoX : 50}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('reelVideoX', v)} />
            <TweakSlider label="Position Y" value={t.reelVideoY != null ? t.reelVideoY : 50}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('reelVideoY', v)} />
          </TweakSection>
          <TweakSection label="Colour overlay" sub collapsible defaultOpen={false}>
            <ColorHexRow label="Colour" value={t.reelTintColor || '#000000'}
                         onChange={(v) => setTweak('reelTintColor', v)} />
            <TweakSlider label="Visibility" value={t.reelTintOpacity != null ? t.reelTintOpacity : 0}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('reelTintOpacity', v)} />
          </TweakSection>
        </TweakSection>

        {/* ── FILTER BUTTONS ──────────────────────────────────────────── */}
        <TweakSection label="Filter buttons" top collapsible defaultOpen={false}>
          <TweakSection label="Buttons" sub collapsible defaultOpen={false}>
            <FilterButtonsPicker t={t} setTweak={setTweak} />
          </TweakSection>
          <TweakSection label="Position" sub collapsible defaultOpen={false}>
            <TweakRadio  label="Placement" value={t.filterPlace === 'toolbar' ? 'toolbar' : 'main'}
                         options={[{ value: 'main', label: 'Main content' }, { value: 'toolbar', label: 'Toolbar' }]}
                         onChange={(v) => setTweak('filterPlace', v)} />
            <FilterDirection label="Direction" dir={t.filterDir || 'vertical'} dirKey="filterDir"
                             setTweak={setTweak} noMax />
            {t.filterPlace === 'toolbar' ? (
              <>
            <TweakRadio  label="Align" value={t.filterTbAlign === 'left' || t.filterTbAlign === 'right' ? t.filterTbAlign : 'center'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('filterTbAlign', v)} />
            <FilterMaxW dir={t.filterDir || 'vertical'} maxW={t.filterMaxW} maxWKey="filterMaxW" setTweak={setTweak} />
            <FilterGaps t={t} setTweak={setTweak} />
            <TweakSlider label="X offset" value={t.filterTbX != null ? t.filterTbX : 0}
                         min={-300} max={300} step={1} unit="px"
                         onChange={(v) => setTweak('filterTbX', v)} />
            <TweakSlider label="Y from centre" value={t.filterTbY != null ? t.filterTbY : 0}
                         min={-600} max={600} step={1} unit="px"
                         onChange={(v) => setTweak('filterTbY', v)} />
              </>
            ) : (
              <>
            <TweakRadio  label="Align" value={t.filterAlign || 'left'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('filterAlign', v)} />
            <FilterMaxW dir={t.filterDir || 'vertical'} maxW={t.filterMaxW} maxWKey="filterMaxW" setTweak={setTweak} />
            <FilterGaps t={t} setTweak={setTweak} />
            <TweakSlider label="Y from top" value={t.filterPosY != null ? t.filterPosY : 36}
                         min={0} max={800} step={1} unit="px"
                         onChange={(v) => setTweak('filterPosY', v)} />
            <TweakSlider label="X position" value={t.filterX != null ? t.filterX : 36}
                         min={0} max={600} step={1} unit="px"
                         onChange={(v) => setTweak('filterX', v)} />
              </>
            )}
            <TweakSection label="Toolbar hidden" sub collapsible defaultOpen={false}>
              <FilterDirection label="Direction"
                               dir={t.filterDirCol === 'horizontal' || t.filterDirCol === 'vertical' ? t.filterDirCol : (t.filterDir || 'vertical')}
                               dirKey="filterDirCol"
                               maxW={t.filterMaxWCol != null ? t.filterMaxWCol : t.filterMaxW} maxWKey="filterMaxWCol"
                               setTweak={setTweak} />
              <TweakSlider label="X position" value={t.filterXCol != null ? t.filterXCol : (t.filterX != null ? t.filterX : 36)}
                           min={0} max={600} step={1} unit="px"
                           onChange={(v) => setTweak('filterXCol', v)} />
              <TweakSlider label="Y from top" value={t.filterYCol != null ? t.filterYCol : (t.filterPosY != null ? t.filterPosY : 36)}
                           min={0} max={800} step={1} unit="px"
                           onChange={(v) => setTweak('filterYCol', v)} />
            </TweakSection>
          </TweakSection>
          <TweakSection label="States" sub collapsible defaultOpen={false}>
            <TweakSlider label="Radius" value={t.filterRadius != null ? t.filterRadius : 20}
                         min={0} max={30} step={1} unit="px"
                         onChange={(v) => setTweak('filterRadius', v)} />
            <StateStack fam="filter" t={t} setTweak={setTweak} />
          </TweakSection>
          <TweakSection label="Selection glyph" sub collapsible defaultOpen={false}>
            <TweakToggle label="Selection glyph" value={t.filterSelGlyphOn === true}
                         onChange={(v) => setTweak('filterSelGlyphOn', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>
              A glyph beside the selected filter. It slides in from its side when a filter is picked and back out when the selection moves on. Uses the selected text colour.
            </div>
            {t.filterSelGlyphOn === true ? (() => {
              const G = ["•","←","→","‹","›","«","»","↳","—","+","×","*","✳","■","●"];
              const cur = t.filterSelGlyph || '•';
              return (
                <>
                  <TweakSelect label="Glyph" value={G.indexOf(cur) >= 0 ? cur : '__custom'}
                               options={[...G.map((g) => ({ value: g, label: g })), { value: '__custom', label: 'Custom…' }]}
                               onChange={(v) => setTweak('filterSelGlyph', v === '__custom' ? ' ' : v)} />
                  {G.indexOf(cur) < 0 ? (
                    <TweakText label="Custom glyph" value={(t.filterSelGlyph || '').trim()} placeholder="Type any character"
                               onChange={(v) => setTweak('filterSelGlyph', v || ' ')} />
                  ) : null}
                  <TweakRadio label="Side" value={t.filterSelGlyphSide === 'right' ? 'right' : 'left'}
                              options={['left', 'right']}
                              onChange={(v) => setTweak('filterSelGlyphSide', v)} />
                  <TweakToggle label="Push button" value={t.filterSelGlyphPush !== false}
                               onChange={(v) => setTweak('filterSelGlyphPush', v)} />
                  <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>
                    {t.filterSelGlyphPush !== false
                      ? (t.filterSelGlyphSide === 'right'
                          ? 'The glyph comes in from the right and nudges the button left to make room. In a horizontal row the buttons after it shift along instead.'
                          : 'The glyph comes in from the left and nudges the button right to make room. In a horizontal row the buttons after it shift along too.')
                      : 'The glyph sits outside the button, Gap away; nothing moves.'}
                  </div>
                  <TweakSlider label="Size" value={t.filterSelGlyphSize != null ? t.filterSelGlyphSize : 100}
                               min={20} max={200} step={1} unit="%"
                               onChange={(v) => setTweak('filterSelGlyphSize', v)} />
                  <TweakSlider label="Gap" value={t.filterSelGlyphGap != null ? t.filterSelGlyphGap : 8}
                               min={0} max={60} step={1} unit="px"
                               onChange={(v) => setTweak('filterSelGlyphGap', v)} />
                  <TweakSlider label="Y offset" value={t.filterSelGlyphY != null ? t.filterSelGlyphY : 0}
                               min={-30} max={30} step={1} unit="px"
                               onChange={(v) => setTweak('filterSelGlyphY', v)} />
                  <TweakSlider label="Slide distance" value={t.filterSelGlyphTravel != null ? t.filterSelGlyphTravel : 24}
                               min={0} max={120} step={1} unit="px"
                               onChange={(v) => setTweak('filterSelGlyphTravel', v)} />
                  <TweakSlider label="Duration" value={t.filterSelGlyphDur != null ? t.filterSelGlyphDur : 600}
                               min={150} max={2000} step={10} unit="ms"
                               onChange={(v) => setTweak('filterSelGlyphDur', v)} />
                </>
              );
            })() : null}
          </TweakSection>
          <TweakToggle label="Invert over images"
                       value={t.filterInvertOver === true}
                       onChange={(v) => setTweak('filterInvertOver', v)} />
        </TweakSection>

        {/* ── TAGS (display-only → a single state) ─────────────────────── */}
        <TweakSection label="Tags" top collapsible defaultOpen={false}>
          <TweakSlider label="Radius" value={t.tagRadius != null ? t.tagRadius : 20}
                       min={0} max={30} step={1} unit="px"
                       onChange={(v) => setTweak('tagRadius', v)} />
          <TweakSlider label="Spacing" value={t.tagGap != null ? t.tagGap : 6}
                       min={0} max={32} step={1} unit="px"
                       onChange={(v) => setTweak('tagGap', v)} />
          <PillStateGroup fam="tag" st="" t={t} setTweak={setTweak} />
          {(t.tagStyle || 'regular') !== 'boxed' ? (
            <TweakToggle label="Commas" value={t.tagCommas === true}
                         onChange={(v) => setTweak('tagCommas', v)} />
          ) : null}
          <TagListEditor t={t} setTweak={setTweak} />
        </TweakSection>

        {/* ── MINI DESCRIPTION ────────────────────────────────────────── */}
        <TweakSection label="Project Mini Description" top collapsible defaultOpen={false}>
          <TweakSlider label="X position" value={t.miniX != null ? t.miniX : 36}
                       min={0} max={600} step={1} unit="px"
                       onChange={(v) => setTweak('miniX', v)} />
          <TweakSlider label="Vertical offset" value={t.miniY != null ? t.miniY : 0}
                       min={-400} max={400} step={1} unit="px"
                       onChange={(v) => setTweak('miniY', v)} />
          <TweakSlider label="Max width" value={t.miniMaxW != null ? t.miniMaxW : 480}
                       min={120} max={1000} step={1} unit="px"
                       onChange={(v) => setTweak('miniMaxW', v)} />
          <ColorHexRow label="Color" value={t.miniColor || '#111111'}
                       onChange={(v) => setTweak('miniColor', v)} />
          <TweakToggle label="Invert over images"
                       value={t.miniInvertOver === true}
                       onChange={(v) => setTweak('miniInvertOver', v)} />
        </TweakSection>

        {/* ── PROJECT PAGE ────────────────────────────────────────────── */}
        <TweakSection label="Project page" top collapsible defaultOpen={false}>
          <TweakSlider label="Margin X" value={t.projMarginX != null ? t.projMarginX : 24}
                       min={0} max={160} step={1} unit="px"
                       onChange={(v) => setTweak('projMarginX', v)} />
          <TweakSlider label="Margin Y" value={t.projMarginY != null ? t.projMarginY : 24}
                       min={0} max={160} step={1} unit="px"
                       onChange={(v) => setTweak('projMarginY', v)} />
          <TweakRadio  label="Column align" value={t.projColAlign || 'top'}
                       options={['top', 'center', 'bottom']}
                       onChange={(v) => setTweak('projColAlign', v)} />
          <ProjectContentEditor t={t} setTweak={setTweak} />
          <TweakSection label="Images" sub collapsible defaultOpen={false}>
            <TweakSlider label="Gap X" value={t.projGapX != null ? t.projGapX : 12}
                         min={0} max={120} step={1} unit="px"
                         onChange={(v) => setTweak('projGapX', v)} />
            <TweakSlider label="Gap Y" value={t.projGapY != null ? t.projGapY : 12}
                         min={0} max={120} step={1} unit="px"
                         onChange={(v) => setTweak('projGapY', v)} />
          </TweakSection>

          <TweakSection label="Expanded media" sub collapsible defaultOpen={false}>
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' }}>Images and videos opened by clicking them on a project page.</div>
            <ExpandOverRadio value={t.lbOver === 'main' ? 'main' : 'window'}
                             onChange={(v) => setTweak('lbOver', v)} />
            <TweakSlider label="Expanded size" value={t.lightboxSize != null ? t.lightboxSize : 0.75}
                         min={0.4} max={1.0} step={0.05}
                         onChange={(v) => setTweak('lightboxSize', v)} />
            <TweakSlider label="Background blur" value={t.lbBlur != null ? t.lbBlur : 20}
                         min={0} max={60} step={1} unit="px"
                         onChange={(v) => setTweak('lbBlur', v)} />
            <TweakSlider label="Background fade" value={t.lbFade != null ? t.lbFade : 60}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('lbFade', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Fade = how much of the page colour covers the blurred page behind (0% = none, 100% = solid).</div>
            <CloseCursorRadio t={t} setTweak={setTweak} />
          </TweakSection>

          <TweakSection label="Texts" sub collapsible defaultOpen={false}>
            <TweakSlider label="Text space above" value={t.projTextMarginTop != null ? t.projTextMarginTop : 24}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('projTextMarginTop', v)} />
            <TweakSlider label="Text space below" value={t.projTextMarginBottom != null ? t.projTextMarginBottom : 24}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('projTextMarginBottom', v)} />
            <TweakSlider label="Text max width" value={t.projTextMaxW != null ? t.projTextMaxW : 560}
                         min={240} max={1000} step={1} unit="px"
                         onChange={(v) => setTweak('projTextMaxW', v)} />
            <TweakSlider label="Title to body spacing" value={t.projTextTitleGap != null ? t.projTextTitleGap : 12}
                         min={0} max={80} step={1} unit="px"
                         onChange={(v) => setTweak('projTextTitleGap', v)} />
            <TweakToggle label="Title underline" value={t.projTitleRule === true}
                         onChange={(v) => setTweak('projTitleRule', v)} />
            {t.projTitleRule === true ? (
              <ColorHexRow label="Underline color" value={t.projTitleRuleColor || '@colorBorder'}
                           onChange={(v) => setTweak('projTitleRuleColor', v)} />
            ) : null}
            <TweakSection label="Colors" sub collapsible defaultOpen={false}>
              <ColorHexRow label="Text title" value={t.projTitleColor || '@colorText'}
                           onChange={(v) => setTweak('projTitleColor', v)} />
              <ColorHexRow label="Text body" value={t.projBodyColor || '@colorMuted'}
                           onChange={(v) => setTweak('projBodyColor', v)} />
            </TweakSection>
            <TweakSection label="Title glyph" sub collapsible defaultOpen={false}>
              <TweakToggle label="Show glyph" value={t.projGlyphShow !== false}
                           onChange={(v) => setTweak('projGlyphShow', v)} />
              {t.projGlyphShow !== false ? (
                <>
                  <TweakSelect label="Glyph" value={['→', '↳', '↘', '›', '»', '•', '—', '+', '*', '■', '●', '◆', '▸', '✳'].indexOf(t.projGlyph != null ? t.projGlyph : '→') >= 0 ? (t.projGlyph != null ? t.projGlyph : '→') : '__custom'}
                               options={[
                                 { value: '→', label: '→  Arrow' }, { value: '↳', label: '↳  Return arrow' },
                                 { value: '↘', label: '↘  Diagonal arrow' }, { value: '›', label: '›  Chevron' },
                                 { value: '»', label: '»  Double chevron' }, { value: '•', label: '•  Bullet' },
                                 { value: '—', label: '—  Dash' }, { value: '+', label: '+  Plus' },
                                 { value: '*', label: '*  Asterisk' }, { value: '■', label: '■  Square' },
                                 { value: '●', label: '●  Circle' }, { value: '◆', label: '◆  Diamond' },
                                 { value: '▸', label: '▸  Triangle' }, { value: '✳', label: '✳  Star' },
                                 { value: '__custom', label: 'Custom…' }
                               ]}
                               onChange={(v) => setTweak('projGlyph', v === '__custom' ? '' : v)} />
                  {['→', '↳', '↘', '›', '»', '•', '—', '+', '*', '■', '●', '◆', '▸', '✳'].indexOf(t.projGlyph != null ? t.projGlyph : '→') < 0 ? (
                    <TweakText label="Custom glyph" value={t.projGlyph || ''} placeholder="Type any character"
                               onChange={(v) => setTweak('projGlyph', v)} />
                  ) : null}
                  <ColorHexRow label="Color" value={t.projGlyphColor || '@colorMuted'}
                               onChange={(v) => setTweak('projGlyphColor', v)} />
                  <TweakSlider label="Gap after" value={t.projGlyphGap != null ? t.projGlyphGap : 10}
                               min={0} max={60} step={1} unit="px"
                               onChange={(v) => setTweak('projGlyphGap', v)} />
                </>
              ) : null}
            </TweakSection>
          </TweakSection>

          <TweakSection label="Dividers" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show dividers" value={t.projDividersShow !== false}
                         onChange={(v) => setTweak('projDividersShow', v)} />
            <TweakToggle label="Full length" value={t.projDividerFull === true}
                         onChange={(v) => setTweak('projDividerFull', v)} />
            <TweakSlider label="Divider space above" value={t.projDividerSpaceAbove != null ? t.projDividerSpaceAbove : 24}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('projDividerSpaceAbove', v)} />
            <TweakSlider label="Divider space below" value={t.projDividerSpaceBelow != null ? t.projDividerSpaceBelow : 24}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('projDividerSpaceBelow', v)} />
          </TweakSection>

          <TweakSection label="Toolbar spacing" sub collapsible defaultOpen={false}>
            {[['Title', 'projTitleGapTop', 0, 'projTitleGapBot', 4],
              ['Year', 'projYearGapTop', 0, 'projYearGapBot', 16],
              ['Tags', 'projTagsGapTop', 0, 'projTagsGapBot', 16],
              ['Description', 'projDescGapTop', 0, 'projDescGapBot', 0],
              ['Buttons', 'playGap', 24, 'playGapBelow', 0]].map(([lbl, kT, dT, kB, dB]) => (
              <TweakSection key={kT} label={lbl} sub collapsible defaultOpen={false}>
                <TweakSlider label="Space above" value={t[kT] != null ? t[kT] : dT}
                             min={0} max={300} step={1} unit="px"
                             onChange={(v) => setTweak(kT, v)} />
                <TweakSlider label="Space below" value={t[kB] != null ? t[kB] : dB}
                             min={0} max={300} step={1} unit="px"
                             onChange={(v) => setTweak(kB, v)} />
                {kT === 'playGap' ? (
                  <TweakSlider label="Space between" value={t.btnGap != null ? t.btnGap : 12}
                               min={0} max={120} step={1} unit="px"
                               onChange={(v) => setTweak('btnGap', v)} />
                ) : null}
              </TweakSection>
            ))}
          </TweakSection>

          <TweakSection label="Buttons" sub collapsible defaultOpen={false}>
            <TweakSection label="Text button" sub collapsible defaultOpen={false}>
              <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' }}>
                Shared look for every text button. Add / remove buttons, links, own labels and image buttons per project in Page content → Toolbar → Buttons.
              </div>
              <TweakText   label="Text" value={t.playLabel != null ? t.playLabel : 'Play'}
                           onChange={(v) => setTweak('playLabel', v)} />
              <TweakRadio  label="Align (button row)" value={t.playAlign || 'left'}
                           options={['left', 'center', 'right']}
                           onChange={(v) => setTweak('playAlign', v)} />
              <StateStack fam="play" states={TWO_STATES} t={t} setTweak={setTweak} />
            </TweakSection>
          </TweakSection>
        </TweakSection>

        {/* ── ABOUT PAGE ──────────────────────────────────────────────── */}
        <TweakSection label="About page" top collapsible defaultOpen={false}>
          <TweakSlider label="Margin X" value={t.aboutMarginX != null ? t.aboutMarginX : 48}
                       min={0} max={200} step={1} unit="px"
                       onChange={(v) => setTweak('aboutMarginX', v)} />
          <TweakSlider label="Margin Y" value={t.aboutMarginY != null ? t.aboutMarginY : 40}
                       min={0} max={200} step={1} unit="px"
                       onChange={(v) => setTweak('aboutMarginY', v)} />
          <TweakSlider label="Column split" value={t.aboutSplit != null ? t.aboutSplit : 40}
                       min={25} max={70} step={1} unit="%"
                       onChange={(v) => setTweak('aboutSplit', v)} />

          {/* WHICH BLOCK GOES WHERE — the two columns shown as they are, each
              listing its blocks top-to-bottom with move up/down and a
              send-to-other-column arrow. One control answers both "which
              column" and "which order", which separate radios could not. */}
          <TweakSection label="Layout" sub collapsible defaultOpen={false}>
            <AboutLayoutEditor t={t} setTweak={setTweak} />
            <TweakSlider label="Gap between blocks"
                         value={t.aboutStackGap != null ? t.aboutStackGap
                                : (t.aboutHeroGap != null ? t.aboutHeroGap : 40)}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('aboutStackGap', v)} />
          </TweakSection>

          <TweakSection label="Bio" sub collapsible defaultOpen={false}>
            <TweakSlider label="Max width" value={t.aboutTextMaxW != null ? t.aboutTextMaxW : 0}
                         min={0} max={900} step={1} unit="px"
                         onChange={(v) => setTweak('aboutTextMaxW', v)} />
            <TweakText   label="Text" multiline
                         value={t.aboutText != null && t.aboutText !== '' ? t.aboutText
                                : (window.__bioLongDefault || window.BIO_LONG || '')}
                         onChange={(v) => setTweak('aboutText', v)} />
          </TweakSection>

          <TweakSection label="Accolades" sub collapsible defaultOpen={false}>
            <TweakSlider label="Max width" value={t.aboutMetaMaxW != null ? t.aboutMetaMaxW : 0}
                         min={0} max={900} step={1} unit="px"
                         onChange={(v) => setTweak('aboutMetaMaxW', v)} />
            {/* Education / Awards / Conferences — one dropdown per section,
                each with its own title + a list editor for the items. */}
            {[0, 1, 2].map((i) => (
              <AboutMetaSection key={i} idx={i} t={t} setTweak={setTweak} />
            ))}
          </TweakSection>

          <TweakSection label="Hero image" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show" value={t.aboutHeroShow !== false}
                         onChange={(v) => setTweak('aboutHeroShow', v)} />
            <TweakSlider label="Size" value={t.aboutHeroSize != null ? t.aboutHeroSize : 100}
                         min={10} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('aboutHeroSize', v)} />
            <TweakRadio  label="Align in column" value={t.aboutHeroAlign || 'left'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('aboutHeroAlign', v)} />
          </TweakSection>
        </TweakSection>

        {/* ── PLAYGROUND GALLERY ──────────────────────────────────────── */}
        <TweakSection label="Playground gallery" top collapsible defaultOpen={false}>
          <TweakSection label="Scroll" sub collapsible defaultOpen={false}>
          <TweakRadio  label="Scroll mode" value={t.pgScrollMode === 'horizontal' || t.pgScrollMode === 'vertical' ? t.pgScrollMode : 'free'}
                       options={['free', 'horizontal', 'vertical']}
                       onChange={(v) => setTweak('pgScrollMode', v)} />
          <TweakSlider label="H speed"      value={t.pgSpeed}
                       min={-150} max={150} step={1} unit="px/s"
                       onChange={(v) => setTweak('pgSpeed', v)} />
          <TweakSlider label="V speed"      value={t.pgVSpeed != null ? t.pgVSpeed : 0}
                       min={-150} max={150} step={1} unit="px/s"
                       onChange={(v) => setTweak('pgVSpeed', v)} />
          <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>H speed drives Free + Horizontal, V speed drives Free + Vertical (auto-scroll). Vertical mode turns the rows into columns.</div>
          <TweakSlider label="Scroll speed" value={t.pgWheelSpeed != null ? t.pgWheelSpeed : 1}
                       min={0.2} max={3} step={0.05} unit="×"
                       onChange={(v) => setTweak('pgWheelSpeed', v)} />
          {(t.pgScrollMode !== 'horizontal' && t.pgScrollMode !== 'vertical') ? (
            <TweakRadio label="Scroll direction (free)" value={t.pgFreeWheelDir === 'horizontal' || t.pgFreeWheelDir === 'diagonal' ? t.pgFreeWheelDir : 'vertical'}
                        options={['vertical', 'horizontal', 'diagonal']}
                        onChange={(v) => setTweak('pgFreeWheelDir', v)} />
          ) : null}
          {(t.pgScrollMode !== 'horizontal' && t.pgScrollMode !== 'vertical' && t.pgFreeWheelDir === 'diagonal') ? (
            <>
            <TweakSlider label="Diagonal angle" value={t.pgFreeWheelAngle != null ? t.pgFreeWheelAngle : 45}
                         min={-90} max={90} step={1} unit="°"
                         onChange={(v) => setTweak('pgFreeWheelAngle', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>0° = horizontal, 90° = vertical, 45° = equal parts across and down. Negative angles tilt the other way.</div>
            </>
          ) : null}
          <TweakToggle label="Reverse scroll" value={t.pgWheelInvert === true}
                       onChange={(v) => setTweak('pgWheelInvert', v)} />
          </TweakSection>{/* end Playground → Scroll */}
          <TweakSlider label={t.pgScrollMode === 'vertical' ? 'Columns' : 'Rows'} value={t.pgRows}
                       min={1} max={6} step={1}
                       onChange={(v) => setTweak('pgRows', v)} />
          <TweakSlider label="Conformity"   value={t.pgConformity != null ? t.pgConformity : 0.62}
                       min={0} max={1} step={0.05}
                       onChange={(v) => setTweak('pgConformity', v)} />
          <TweakSlider label={t.pgScrollMode === 'vertical' ? 'Column offset' : 'Row offset'} value={t.pgRowOffset != null ? t.pgRowOffset : 0}
                       min={-400} max={400} step={1} unit="px"
                       onChange={(v) => setTweak('pgRowOffset', v)} />
          <TweakSection label="Hover" sub collapsible defaultOpen={false}>
          <TweakSlider label="Hover scale"  value={t.pgHoverScale}
                       min={0} max={5} step={0.05}
                       onChange={(v) => setTweak('pgHoverScale', v)} />
          <TweakToggle label="Pause scroll on hover" value={t.pgHoverPause === true}
                       onChange={(v) => setTweak('pgHoverPause', v)} />
          <TweakToggle label="Play only on hover" value={t.pgHoverPlay === true}
                       onChange={(v) => setTweak('pgHoverPlay', v)} />
          <TweakSection label="Clip pushing" sub collapsible defaultOpen={false}>
            <TweakToggle label="Push neighbours" value={t.pgPushOn !== false}
                         onChange={(v) => setTweak('pgPushOn', v)} />
            {t.pgPushOn !== false ? (
              <>
            <TweakSlider label="Push strength" value={t.pgPush != null ? t.pgPush : 1}
                         min={0} max={1.5} step={0.05}
                         onChange={(v) => setTweak('pgPush', v)} />
            <TweakSlider label="Push reach" value={t.pgPushArea != null ? t.pgPushArea : 1.5}
                         min={0} max={5} step={0.1}
                         onChange={(v) => setTweak('pgPushArea', v)} />
            <TweakSlider label="Min spacing" value={Math.round((t.pgPushMin != null ? t.pgPushMin : 0.4) * 100)}
                         min={0} max={100} step={5} unit="%"
                         onChange={(v) => setTweak('pgPushMin', v / 100)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Strength = how far the clips touching the hovered one move (1 = they keep their full gap). Reach = how far the push carries outward, each ring weaker by the same proportion (0 = touching clips only). Min spacing = the smallest gap any two clips may close to (% of the normal gap) — clips that would get closer push their neighbour instead, so nothing ever touches or slides under another.</div>
              </>
            ) : (
              <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Off: the hovered clip grows over its neighbours.</div>
            )}
          </TweakSection>
          <TweakSection label="Unselected clips" sub collapsible defaultOpen={false}>
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' }}>The look of every other clip while one is hovered.</div>
            <TweakSlider label="Saturation" value={t.pgUnselSat != null ? t.pgUnselSat : 1}
                         min={0} max={2} step={0.05}
                         onChange={(v) => setTweak('pgUnselSat', v)} />
            <TweakSlider label="Blur" value={t.pgUnselBlur != null ? t.pgUnselBlur : 0}
                         min={0} max={20} step={0.5} unit="px"
                         onChange={(v) => setTweak('pgUnselBlur', v)} />
            <TweakSlider label="Opacity" value={t.pgUnselOpacity != null ? t.pgUnselOpacity : 1}
                         min={0} max={1} step={0.02}
                         onChange={(v) => setTweak('pgUnselOpacity', v)} />
            <TweakSlider label="Release delay" value={t.pgUnselRelease != null ? t.pgUnselRelease : 200}
                         min={0} max={600} step={10} unit="ms"
                         onChange={(v) => setTweak('pgUnselRelease', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>How long the look holds when the cursor crosses a gap. Entering another clip in that time swaps just the two clips. 0 = release at once.</div>
            <TweakSlider label="Fade back" value={t.pgUnselFadeBack != null ? t.pgUnselFadeBack : 0.45}
                         min={0} max={1.5} step={0.05} unit="s"
                         onChange={(v) => setTweak('pgUnselFadeBack', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>How slowly the clip you just left returns to the unselected look. 0 = same speed as the hover.</div>
            <TweakToggle label="Pause unselected" value={t.pgUnselPause === true}
                         onChange={(v) => setTweak('pgUnselPause', v)} />
          </TweakSection>
          </TweakSection>
          <TweakSection label="Gaps & thumb size" sub collapsible defaultOpen={false}>
            <TweakSlider label="H gap"        value={t.pgHGap}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('pgHGap', v)} />
            <TweakSlider label="V gap"        value={t.pgVGap}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('pgVGap', v)} />
            <TweakSlider label={t.pgScrollMode === 'vertical' ? 'Thumb width' : 'Thumb height'} value={t.pgThumbH}
                         min={80} max={1080} step={1} unit="px"
                         onChange={(v) => setTweak('pgThumbH', v)} />
          </TweakSection>
          <TweakSection label="Drag arrows" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show arrows" value={t.pgArrowsOn !== false}
                         onChange={(v) => setTweak('pgArrowsOn', v)} />
            <TweakToggle label="Only while holding" value={t.pgArrowsDragOnly === true}
                         onChange={(v) => setTweak('pgArrowsDragOnly', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>On = the arrows stay hidden and fade in only while the mouse is held down on the playground (moving or not).</div>
            <TweakRadio  label="Arrows" value={t.pgArrowsMode === 'horizontal' || t.pgArrowsMode === 'vertical' ? t.pgArrowsMode : 'all'}
                         options={[{ value: 'all', label: 'All 4' }, { value: 'horizontal', label: 'Left/Right' }, { value: 'vertical', label: 'Top/Bottom' }]}
                         onChange={(v) => setTweak('pgArrowsMode', v)} />
            <TweakText   label="Glyph" value={t.pgArrowGlyph != null ? t.pgArrowGlyph : '↑'}
                         onChange={(v) => setTweak('pgArrowGlyph', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Enter a glyph that points UP. Each side turns it to face outward. Any arrow or symbol works on Mac and Windows (the backup font fills gaps), e.g. ↑ ▲ △ ⌃ 🢑</div>
            <ColorHexRow label="Color" value={t.pgArrowColor || t.markerColor || '#111111'}
                         onChange={(v) => setTweak('pgArrowColor', v)} />
            <TweakSlider label="Size" value={t.pgArrowSize != null ? t.pgArrowSize : 20}
                         min={6} max={80} step={1} unit="px"
                         onChange={(v) => setTweak('pgArrowSize', v)} />
            <TweakSlider label="Distance from edge" value={t.pgArrowDist != null ? t.pgArrowDist : 24}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('pgArrowDist', v)} />
          </TweakSection>
          <TweakSection label="Expanded clip" sub collapsible defaultOpen={false}>
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)' }}>A clip opened by clicking it in the playground.</div>
            <ExpandOverRadio value={t.pgOvOver === 'window' ? 'window' : 'main'}
                             onChange={(v) => setTweak('pgOvOver', v)} />
            <TweakSlider label="Background blur" value={t.pgOvBlur != null ? t.pgOvBlur : 20}
                         min={0} max={60} step={1} unit="px"
                         onChange={(v) => setTweak('pgOvBlur', v)} />
            <TweakSlider label="Background fade" value={t.pgOvFade != null ? t.pgOvFade : 60}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('pgOvFade', v)} />
            <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(41,38,27,.5)', marginTop: -4 }}>Fade = how much of the page colour covers the blurred gallery behind (0% = none, 100% = solid).</div>
            <CloseCursorRadio t={t} setTweak={setTweak} />
          </TweakSection>
          <TweakSection label="Clip order" sub collapsible defaultOpen={false}>
            <PlaygroundOrder t={t} setTweak={setTweak} />
          </TweakSection>
        </TweakSection>

      </TweaksPanel>
      </ColorTokensCtx.Provider>
    );
  }

  const root = document.getElementById('tweaks-root');
  if (root && !window.__MOBILE__ && window.ReactDOM && window.ReactDOM.createRoot) {
    ReactDOM.createRoot(root).render(<App />);
  }
})();
