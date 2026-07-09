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

  /* ── Hex-aware color row ──────────────────────────────────────────────
     Native color picker doesn't accept pasted hex values, so we pair it
     with a hex text field. Accepts #abc / #abcdef on blur or Enter. */
  function ColorHexRow({ label, value, onChange }) {
    const [text, setText] = React.useState(value);
    React.useEffect(() => { setText(value); }, [value]);
    const commit = (s) => {
      let h = (s || '').trim();
      if (h && h[0] !== '#') h = '#' + h;
      if (/^#[0-9a-f]{3}$/i.test(h))
        h = '#' + h.slice(1).split('').map(c => c + c).join('');
      if (/^#[0-9a-f]{6}$/i.test(h)) onChange(h.toLowerCase());
      else setText(value);
    };
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="text" className="twk-field" value={text}
                 style={{ width: 84, height: 22, fontVariantNumeric: 'tabular-nums' }}
                 onChange={(e) => setText(e.target.value)}
                 onBlur={(e) => commit(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') commit(e.target.value); }} />
          <input type="color" className="twk-swatch" value={value}
                 onChange={(e) => onChange(e.target.value)} />
        </div>
      </div>
    );
  }

  /* ── Alpha-aware color row ────────────────────────────────────────────
     Like ColorHexRow but supports transparency. Stores an 8-digit hex
     (#rrggbbaa) when not fully opaque, plain #rrggbb when opaque. A native
     swatch sets the RGB (preserving alpha) and a slim slider sets alpha. */
  function ColorAlphaRow({ label, value, onChange }) {
    const parse = (v) => {
      let h = String(v == null ? '' : v).trim().replace(/^#/, '').toLowerCase();
      if (h === 'transparent') return { rgb: '#000000', a: 0 };
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      if (/^[0-9a-f]{6}$/.test(h)) return { rgb: '#' + h, a: 255 };
      if (/^[0-9a-f]{8}$/.test(h)) return { rgb: '#' + h.slice(0, 6), a: parseInt(h.slice(6, 8), 16) };
      return { rgb: '#cccccc', a: 255 };
    };
    const { rgb, a } = parse(value);
    const [text, setText] = React.useState(value);
    React.useEffect(() => { setText(value); }, [value]);
    const toVal = (rgbHex, alpha) => {
      const aa = Math.max(0, Math.min(255, Math.round(alpha)));
      return aa >= 255 ? rgbHex : rgbHex + aa.toString(16).padStart(2, '0');
    };
    const commit = (s) => {
      let h = (s || '').trim();
      if (h && h[0] !== '#') h = '#' + h;
      if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) {
        const p = parse(h);
        onChange(toVal(p.rgb, p.a));
      } else setText(value);
    };
    const pct = Math.round((a / 255) * 100);
    return (
      <div className="twk-row">
        <div className="twk-lbl"><span>{label}</span><span className="twk-val">{pct}%</span></div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="text" className="twk-field" value={text}
                 style={{ flex: 1, minWidth: 0, height: 22, fontVariantNumeric: 'tabular-nums' }}
                 onChange={(e) => setText(e.target.value)}
                 onBlur={(e) => commit(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') commit(e.target.value); }} />
          <input type="color" className="twk-swatch" value={rgb}
                 style={{ width: 38, flexShrink: 0 }}
                 onChange={(e) => onChange(toVal(e.target.value, a))} />
          <input type="range" className="twk-slider" min={0} max={255} step={1} value={a}
                 style={{ width: 52, margin: 0, flexShrink: 0 }}
                 aria-label="Opacity"
                 onChange={(e) => onChange(toVal(rgb, Number(e.target.value)))} />
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

  function App() {
    const [t, setTweak, history] = useTweaks(window.TWEAKS);
    const [panelOpen, setPanelOpen] = React.useState(false);
    /* ref mirror of panelOpen so the key handler always sees the live value
       without re-registering (and works even if React state is mid-update) */
    const panelOpenRef = React.useRef(false);
    panelOpenRef.current = panelOpen;

    /* push every change into the page on the next paint */
    React.useEffect(() => { window.applyTweaks(t); }, [t]);

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
       catches the key regardless of focus target. */
    React.useEffect(() => {
      const onKey = (e) => {
        if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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
      <TweaksPanel title="Design tokens" history={history}>

        {/* ── TYPOGRAPHY (collapsed by default, open the one you need) ─ */}
        <TweakSection label="Typography" top collapsible defaultOpen={false}>
          <TweakSelect label="Font family" value={t.font}
                       options={[
                         { value: 'geist',     label: 'Geist' },
                         { value: 'system',    label: 'System sans' },
                         { value: 'helvetica', label: 'Helvetica Neue' },
                         { value: 'georgia',   label: 'Georgia (serif)' },
                         { value: 'mono',      label: 'Monospace' }
                       ]}
                       onChange={(v) => setTweak('font', v)} />
          <TypeBlock label="Title (logo)"      prefix="title"  t={t} setTweak={setTweak} />
          <TypeBlock label="Home Project Title" prefix="h1"    t={t} setTweak={setTweak} />
          <TypeBlock label="Mini Description"  prefix="mini"   t={t} setTweak={setTweak} />
          <TypeBlock label="Project Page Title" prefix="h2"     t={t} setTweak={setTweak} />
          <TypeBlock label="Accolades"         prefix="h3"     t={t} setTweak={setTweak} />
          <TypeBlock label="About"             prefix="h4"     t={t} setTweak={setTweak} />
          <TypeBlock label="Bio"               prefix="bio"    t={t} setTweak={setTweak} />
          <TypeBlock label="Text Title"        prefix="h5"     t={t} setTweak={setTweak} />
          <TypeBlock label="Text Body"         prefix="body"   t={t} setTweak={setTweak} />
          <TypeBlock label="Tags"              prefix="tags"   t={t} setTweak={setTweak} />
          <TypeBlock label="Filters"           prefix="filter" t={t} setTweak={setTweak} />
          <TypeBlock label="Labels"            prefix="labels" t={t} setTweak={setTweak} />
        </TweakSection>

        {/* ── COLORS ──────────────────────────────────────────────────── */}
        <TweakSection label="Colors" top collapsible defaultOpen={false}>
          <ColorHexRow label="Text"         value={t.colorText}      onChange={(v) => setTweak('colorText', v)} />
          <ColorHexRow label="Background"   value={t.colorBg}        onChange={(v) => setTweak('colorBg', v)} />
          <ColorHexRow label="Bg secondary" value={t.colorBgSec}     onChange={(v) => setTweak('colorBgSec', v)} />
          <ColorHexRow label="Bg tertiary"  value={t.colorBgTer}     onChange={(v) => setTweak('colorBgTer', v)} />
          <ColorHexRow label="Highlight"    value={t.colorHighlight} onChange={(v) => setTweak('colorHighlight', v)} />
          <ColorHexRow label="Border"       value={t.colorBorder}    onChange={(v) => setTweak('colorBorder', v)} />
          <ColorHexRow label="Muted"        value={t.colorMuted}     onChange={(v) => setTweak('colorMuted', v)} />
          <ColorHexRow label="Faint"        value={t.colorFaint}     onChange={(v) => setTweak('colorFaint', v)} />
        </TweakSection>

        {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
        <TweakSection label="Toolbar" top collapsible defaultOpen={false}>
          <TweakSlider label="Left panel width" value={t.leftW}
                       min={240} max={520} step={1} unit="px"
                       onChange={(v) => setTweak('leftW', v)} />
          <TweakSlider label="Margin X" value={t.marginX != null ? t.marginX : 28}
                       min={8} max={96} step={1} unit="px"
                       onChange={(v) => setTweak('marginX', v)} />

          <TweakSection label="Logo" sub collapsible defaultOpen={false}>
            <TweakSlider label="Logo Y" value={t.logoY != null ? t.logoY : 32}
                         min={0} max={500} step={1} unit="px"
                         onChange={(v) => setTweak('logoY', v)} />
          </TweakSection>

          <TweakSection label="Social+About" sub collapsible defaultOpen={false}>
            <TweakSlider label="Y position" value={t.socialY != null ? t.socialY : 236}
                         min={0} max={800} step={1} unit="px"
                         onChange={(v) => setTweak('socialY', v)} />
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
            <TweakSlider label="Cycle transition" value={t.gifCycleDur != null ? t.gifCycleDur : 600}
                         min={100} max={2000} step={50} unit="ms"
                         onChange={(v) => setTweak('gifCycleDur', v)} />

            <TweakSection label="Idle" sub collapsible defaultOpen={false}>
              <TweakSlider label="Blur" value={t.gifBlur != null ? t.gifBlur : 0}
                           min={0} max={40} step={0.5} unit="px"
                           onChange={(v) => setTweak('gifBlur', v)} />
              <TweakSlider label="Hue" value={t.gifHue != null ? t.gifHue : 0}
                           min={0} max={360} step={1} unit="°"
                           onChange={(v) => setTweak('gifHue', v)} />
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

          <TweakSection label="Collapse buttons" sub collapsible defaultOpen={false}>
            <TweakSlider label="Full-size width" value={t.tbRefW != null ? t.tbRefW : 0}
                         min={0} max={3000} step={10} unit="px"
                         onChange={(v) => setTweak('tbRefW', v)} />
            <TweakSlider label="Size" value={t.tbToggleSize != null ? t.tbToggleSize : 44}
                         min={24} max={96} step={1} unit="px"
                         onChange={(v) => setTweak('tbToggleSize', v)} />
            <TweakSlider label="Edge offset" value={t.tbToggleX != null ? t.tbToggleX : 16}
                         min={0} max={120} step={1} unit="px"
                         onChange={(v) => setTweak('tbToggleX', v)} />
            <TweakSlider label="Y from top" value={t.tbToggleY != null ? t.tbToggleY : 360}
                         min={0} max={1200} step={1} unit="px"
                         onChange={(v) => setTweak('tbToggleY', v)} />
            <TweakSlider label="Radius" value={t.tbToggleRadius != null ? t.tbToggleRadius : 0}
                         min={0} max={48} step={1} unit="px"
                         onChange={(v) => setTweak('tbToggleRadius', v)} />
            <TweakText   label="Expand glyph" value={t.tbExpandGlyph != null ? t.tbExpandGlyph : '☰'}
                         onChange={(v) => setTweak('tbExpandGlyph', v)} />
            <TweakText   label="Minimize glyph" value={t.tbMinimizeGlyph != null ? t.tbMinimizeGlyph : '✕'}
                         onChange={(v) => setTweak('tbMinimizeGlyph', v)} />
            <StateStack fam="tbtoggle" states={TWO_STATES} t={t} setTweak={setTweak} />
          </TweakSection>

          <TweakSection label="Vid Description" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show descriptions" value={t.pgDescShow !== false}
                         onChange={(v) => setTweak('pgDescShow', v)} />
            <TweakRadio  label="Align" value={t.pgDescAlign || 'left'}
                         options={['left', 'center', 'right']}
                         onChange={(v) => setTweak('pgDescAlign', v)} />
            <TweakSlider label="Y offset" value={t.pgDescY != null ? t.pgDescY : 0}
                         min={-300} max={500} step={1} unit="px"
                         onChange={(v) => setTweak('pgDescY', v)} />
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

          <TweakSection label="Border" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show border" value={!!t.listBorder}
                         onChange={(v) => setTweak('listBorder', v)} />
            <TweakSlider label="Border width" value={t.listBorderW != null ? t.listBorderW : 1}
                         min={1} max={12} step={1} unit="px"
                         onChange={(v) => setTweak('listBorderW', v)} />
            <ColorHexRow label="Border color" value={t.listBorderColor || '#111111'}
                         onChange={(v) => setTweak('listBorderColor', v)} />
          </TweakSection>

          <TweakSection label="Inactive" sub collapsible defaultOpen={false}>
            <TweakSlider label="Opacity" value={t.listInactiveOpacity}
                         min={0} max={1.0} step={0.05}
                         onChange={(v) => setTweak('listInactiveOpacity', v)} />
            <TweakSlider label="Saturation" value={t.listInactiveSaturation != null ? t.listInactiveSaturation : 1}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('listInactiveSaturation', v)} />
            <TweakSlider label="Blur" value={t.listInactiveBlur != null ? t.listInactiveBlur : 0}
                         min={0} max={20} step={0.5} unit="px"
                         onChange={(v) => setTweak('listInactiveBlur', v)} />
            <TweakSlider label="Sharp core" value={t.listInactiveCore != null ? t.listInactiveCore : 28}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('listInactiveCore', v)} />
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
            <TweakSlider label="Scroll distance" value={t.listScrollSpeed}
                         min={0.1} max={10} step={0.1}
                         onChange={(v) => setTweak('listScrollSpeed', v)} />
            <TweakSlider label="Scroll smoothing" value={t.listScrollSmoothing != null ? t.listScrollSmoothing : 0.9}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('listScrollSmoothing', v)} />
            <TweakToggle label="Infinite scroll" value={t.listInfinite !== false}
                         onChange={(v) => setTweak('listInfinite', v)} />
            <TweakToggle label="Snap to project" value={t.listSnapEnabled !== false}
                         onChange={(v) => setTweak('listSnapEnabled', v)} />
            <TweakSlider label="Snap speed"     value={t.listSnapSpeed != null ? t.listSnapSpeed : 0.18}
                         min={0.04} max={0.6} step={0.02}
                         onChange={(v) => setTweak('listSnapSpeed', v)} />
            <TweakSlider label="Snap time"      value={t.listSnapTime != null ? t.listSnapTime : 0.8}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('listSnapTime', v)} />
          </TweakSection>
        </TweakSection>{/* end List Display */}

        {/* ── GALLERY DISPLAY ─────────────────────────────────────────── */}
        <TweakSection label="Gallery Display" sub collapsible defaultOpen={false}>
          <TweakSlider label="Columns" value={t.galColumns != null ? t.galColumns : 3}
                       min={1} max={8} step={1}
                       onChange={(v) => setTweak('galColumns', v)} />
          <TweakSlider label="Thumbnail size" value={t.galThumbSize != null ? t.galThumbSize : 280}
                       min={80} max={600} step={2} unit="px"
                       onChange={(v) => setTweak('galThumbSize', v)} />
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
          <TweakSlider label="Column spacing" value={t.galColGap != null ? t.galColGap : 24}
                       min={0} max={200} step={1} unit="px"
                       onChange={(v) => setTweak('galColGap', v)} />
          <TweakSlider label="Row spacing" value={t.galRowGap != null ? t.galRowGap : 24}
                       min={0} max={200} step={1} unit="px"
                       onChange={(v) => setTweak('galRowGap', v)} />
          <TweakSlider label="Columns X" value={t.galX != null ? t.galX : 0}
                       min={-600} max={600} step={1} unit="px"
                       onChange={(v) => setTweak('galX', v)} />
          <TweakSlider label="Columns Y" value={t.galY != null ? t.galY : 150}
                       min={0} max={600} step={1} unit="px"
                       onChange={(v) => setTweak('galY', v)} />
          <TweakSlider label="Hover scale" value={t.galHoverScale != null ? t.galHoverScale : 1.05}
                       min={1.0} max={1.3} step={0.01}
                       onChange={(v) => setTweak('galHoverScale', v)} />

          <TweakSection label="Border" sub collapsible defaultOpen={false}>
            <TweakToggle label="Show border" value={!!t.galBorder}
                         onChange={(v) => setTweak('galBorder', v)} />
            <TweakSlider label="Border width" value={t.galBorderW != null ? t.galBorderW : 1}
                         min={1} max={12} step={1} unit="px"
                         onChange={(v) => setTweak('galBorderW', v)} />
            <ColorHexRow label="Border color" value={t.galBorderColor || '#111111'}
                         onChange={(v) => setTweak('galBorderColor', v)} />
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
            <TweakSlider label="Sharp core" value={t.galInactiveCore != null ? t.galInactiveCore : 100}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('galInactiveCore', v)} />
            <TweakSlider label="Edge shape" value={t.galInactiveShape != null ? t.galInactiveShape : 100}
                         min={0} max={100} step={1} unit="%"
                         onChange={(v) => setTweak('galInactiveShape', v)} />
            <ColorHexRow label="Tint" value={t.galInactiveTint || '#ffffff'}
                         onChange={(v) => setTweak('galInactiveTint', v)} />
            <TweakSlider label="Tint strength" value={t.galInactiveTintStrength != null ? t.galInactiveTintStrength : 0}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('galInactiveTintStrength', v)} />
          </TweakSection>
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
          <TweakSlider label="Radius" value={t.dispRadius != null ? t.dispRadius : 0}
                       min={0} max={48} step={1} unit="px"
                       onChange={(v) => setTweak('dispRadius', v)} />
          <TweakText   label="List glyph" value={t.dispListGlyph != null ? t.dispListGlyph : '☰'}
                       onChange={(v) => setTweak('dispListGlyph', v)} />
          <TweakText   label="Gallery glyph" value={t.dispGalleryGlyph != null ? t.dispGalleryGlyph : '▦'}
                       onChange={(v) => setTweak('dispGalleryGlyph', v)} />
          <StateStack fam="disp" states={TWO_STATES} t={t} setTweak={setTweak} />
        </TweakSection>

        </TweakSection>{/* end Project Thumbnail Display */}

        {/* ── PROJECT TITLES ──────────────────────────────────────────── */}
        <TweakSection label="Project titles" top collapsible defaultOpen={false}>
          <TweakRadio  label="Align" value={t.titleAlign || 'left'}
                       options={['left', 'center', 'right']}
                       onChange={(v) => setTweak('titleAlign', v)} />
          <TweakToggle label="Inactive selectable" value={t.titleInactiveSelectable !== false}
                       onChange={(v) => setTweak('titleInactiveSelectable', v)} />
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
            <TweakToggle label="Invert on hover"
                         value={t.titleHoverBlend !== false}
                         onChange={(v) => setTweak('titleHoverBlend', v)} />
          </TweakSection>

          <TweakSection label="Upper / lower titles" sub collapsible defaultOpen={false}>
            <TweakSlider label="1st blur"       value={t.titleBlur1 != null ? t.titleBlur1 : 3}
                         min={0} max={20} step={0.5} unit="px"
                         onChange={(v) => setTweak('titleBlur1', v)} />
            <TweakSlider label="2nd blur"       value={t.titleBlur2 != null ? t.titleBlur2 : 7}
                         min={0} max={30} step={0.5} unit="px"
                         onChange={(v) => setTweak('titleBlur2', v)} />
            <TweakSlider label="3rd blur"       value={t.titleBlur3 != null ? t.titleBlur3 : 11}
                         min={0} max={40} step={0.5} unit="px"
                         onChange={(v) => setTweak('titleBlur3', v)} />
            <TweakSlider label="1st opacity"    value={t.titleOpacity1 != null ? t.titleOpacity1 : 0.75}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('titleOpacity1', v)} />
            <TweakSlider label="2nd opacity"    value={t.titleOpacity2 != null ? t.titleOpacity2 : 0.5}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('titleOpacity2', v)} />
            <TweakSlider label="3rd opacity"    value={t.titleOpacity3 != null ? t.titleOpacity3 : 0.28}
                         min={0} max={1} step={0.05}
                         onChange={(v) => setTweak('titleOpacity3', v)} />
          </TweakSection>
        </TweakSection>

        {/* ── CENTER MARKER ───────────────────────────────────────────── */}
        <TweakSection label="Center marker" top collapsible defaultOpen={false}>
          {TweakText
            ? <TweakText label="Glyph" value={t.markerGlyph || '▶'}
                         onChange={(v) => setTweak('markerGlyph', v)} />
            : (
                <TweakRow label="Glyph">
                  <input type="text" value={t.markerGlyph || '▶'}
                         style={{ width: 100, height: 22, textAlign: 'center' }}
                         onChange={(e) => setTweak('markerGlyph', e.target.value)} />
                </TweakRow>
              )}
          <TweakSlider label="Size"  value={t.markerSize || 14}
                       min={4} max={40} step={1} unit="px"
                       onChange={(v) => setTweak('markerSize', v)} />
          <ColorHexRow label="Color" value={t.markerColor || '#111111'}
                       onChange={(v) => setTweak('markerColor', v)} />
          <TweakSlider label="Gap from thumb" value={t.markerGap != null ? t.markerGap : 16}
                       min={-200} max={300} step={1} unit="px"
                       onChange={(v) => setTweak('markerGap', v)} />
          <TweakRadio  label="Marker side" value={t.markerAlign || 'left'}
                       options={['left', 'right']}
                       onChange={(v) => setTweak('markerAlign', v)} />
          <TweakToggle label="Connector line" value={t.markerLine === true}
                       onChange={(v) => setTweak('markerLine', v)} />
          {t.markerLine && (
            <TweakRadio label="Line connects to" value={t.markerLineEdge || 'left'}
                        options={['left', 'right']}
                        onChange={(v) => setTweak('markerLineEdge', v)} />
          )}
        </TweakSection>

        {/* ── SCROLL MARKERS ──────────────────────────────────────────── */}
        <TweakSection label="Scroll markers" top collapsible defaultOpen={false}>
          <TweakSlider label="Size" value={t.scrollMarkerSize != null ? t.scrollMarkerSize : 14}
                       min={4} max={80} step={1} unit="px"
                       onChange={(v) => setTweak('scrollMarkerSize', v)} />
          <TweakToggle label="Animation" value={t.scrollMarkerAnim !== false}
                       onChange={(v) => setTweak('scrollMarkerAnim', v)} />
          <TweakSlider label="Animation size" value={t.scrollMarkerAnimSize != null ? t.scrollMarkerAnimSize : 3}
                       min={0} max={40} step={1} unit="px"
                       onChange={(v) => setTweak('scrollMarkerAnimSize', v)} />
          <TweakSlider label="Animation speed" value={t.scrollMarkerAnimSpeed != null ? t.scrollMarkerAnimSpeed : 1.4}
                       min={0.3} max={4} step={0.1} unit="s"
                       onChange={(v) => setTweak('scrollMarkerAnimSpeed', v)} />
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

        {/* ── FILTER BUTTONS ──────────────────────────────────────────── */}
        <TweakSection label="Filter buttons" top collapsible defaultOpen={false}>
          <TweakRadio  label="Direction" value={t.filterDir || 'vertical'}
                       options={['vertical', 'horizontal']}
                       onChange={(v) => setTweak('filterDir', v)} />
          <TweakRadio  label="Align" value={t.filterAlign || 'left'}
                       options={['left', 'center', 'right']}
                       onChange={(v) => setTweak('filterAlign', v)} />
          <TweakSlider label="Gap" value={t.filterGap != null ? t.filterGap : 6}
                       min={0} max={60} step={1} unit="px"
                       onChange={(v) => setTweak('filterGap', v)} />
          <TweakSlider label="Y from top" value={t.filterPosY != null ? t.filterPosY : 36}
                       min={0} max={800} step={1} unit="px"
                       onChange={(v) => setTweak('filterPosY', v)} />
          <TweakSlider label="X position" value={t.filterX != null ? t.filterX : 36}
                       min={0} max={600} step={1} unit="px"
                       onChange={(v) => setTweak('filterX', v)} />
          <TweakSlider label="Radius" value={t.filterRadius != null ? t.filterRadius : 20}
                       min={0} max={30} step={1} unit="px"
                       onChange={(v) => setTweak('filterRadius', v)} />
          <TweakSection label="States" sub collapsible defaultOpen={false}>
            <StateStack fam="filter" t={t} setTweak={setTweak} />
          </TweakSection>
          <TweakToggle label="Invert over images"
                       value={t.filterInvertOver === true}
                       onChange={(v) => setTweak('filterInvertOver', v)} />
          <TweakToggle label="Invert on hover"
                       value={t.filterInvertHover !== false}
                       onChange={(v) => setTweak('filterInvertHover', v)} />
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
          <TweakSlider label="Gap X" value={t.projGapX != null ? t.projGapX : 12}
                       min={0} max={120} step={1} unit="px"
                       onChange={(v) => setTweak('projGapX', v)} />
          <TweakSlider label="Gap Y" value={t.projGapY != null ? t.projGapY : 12}
                       min={0} max={120} step={1} unit="px"
                       onChange={(v) => setTweak('projGapY', v)} />
          <TweakRadio  label="Column align" value={t.projColAlign || 'top'}
                       options={['top', 'center', 'bottom']}
                       onChange={(v) => setTweak('projColAlign', v)} />
          <TweakSlider label="Expanded image size" value={t.lightboxSize != null ? t.lightboxSize : 0.75}
                       min={0.4} max={1.0} step={0.05}
                       onChange={(v) => setTweak('lightboxSize', v)} />

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
          </TweakSection>

          <TweakSection label="Dividers" sub collapsible defaultOpen={false}>
            <TweakSlider label="Divider space above" value={t.projDividerSpaceAbove != null ? t.projDividerSpaceAbove : 24}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('projDividerSpaceAbove', v)} />
            <TweakSlider label="Divider space below" value={t.projDividerSpaceBelow != null ? t.projDividerSpaceBelow : 24}
                         min={0} max={200} step={1} unit="px"
                         onChange={(v) => setTweak('projDividerSpaceBelow', v)} />
          </TweakSection>

          <TweakSection label="Buttons" sub collapsible defaultOpen={false}>
            <TweakSection label="Back button" sub collapsible defaultOpen={false}>
              <TweakText   label="Text" value={t.backLabel != null ? t.backLabel : 'All work'}
                           onChange={(v) => setTweak('backLabel', v)} />
              <TweakSlider label="Bottom" value={t.backBottom != null ? t.backBottom : 28}
                           min={0} max={400} step={1} unit="px"
                           onChange={(v) => setTweak('backBottom', v)} />
              <TweakRadio  label="Align" value={t.backAlign || 'left'}
                           options={['left', 'center', 'right']}
                           onChange={(v) => setTweak('backAlign', v)} />
              <StateStack fam="back" states={TWO_STATES} t={t} setTweak={setTweak} />
            </TweakSection>
            <TweakSection label="Play button" sub collapsible defaultOpen={false}>
              <TweakText   label="Text" value={t.playLabel != null ? t.playLabel : 'Play'}
                           onChange={(v) => setTweak('playLabel', v)} />
              <TweakSlider label="Bottom" value={t.playBottom != null ? t.playBottom : 80}
                           min={0} max={400} step={1} unit="px"
                           onChange={(v) => setTweak('playBottom', v)} />
              <TweakRadio  label="Align" value={t.playAlign || 'left'}
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
          <TweakSlider label="Bio max width" value={t.aboutTextMaxW != null ? t.aboutTextMaxW : 0}
                       min={0} max={900} step={1} unit="px"
                       onChange={(v) => setTweak('aboutTextMaxW', v)} />
          <TweakSlider label="Education max width" value={t.aboutMetaMaxW != null ? t.aboutMetaMaxW : 0}
                       min={0} max={900} step={1} unit="px"
                       onChange={(v) => setTweak('aboutMetaMaxW', v)} />
          <TweakText   label="Text" multiline
                       value={t.aboutText != null && t.aboutText !== '' ? t.aboutText
                              : (window.__bioLongDefault || window.BIO_LONG || '')}
                       onChange={(v) => setTweak('aboutText', v)} />
        </TweakSection>

        {/* ── PLAYGROUND GALLERY ──────────────────────────────────────── */}
        <TweakSection label="Playground gallery" top collapsible defaultOpen={false}>
          <TweakRadio  label="Scroll mode" value={t.pgScrollMode === 'horizontal' ? 'horizontal' : 'free'}
                       options={['free', 'horizontal']}
                       onChange={(v) => setTweak('pgScrollMode', v)} />
          <TweakSlider label="Speed"        value={t.pgSpeed}
                       min={-150} max={150} step={1} unit="px/s"
                       onChange={(v) => setTweak('pgSpeed', v)} />
          <TweakSlider label="Rows"         value={t.pgRows}
                       min={1} max={6} step={1}
                       onChange={(v) => setTweak('pgRows', v)} />
          <TweakSlider label="Conformity"   value={t.pgConformity != null ? t.pgConformity : 0.62}
                       min={0} max={1} step={0.05}
                       onChange={(v) => setTweak('pgConformity', v)} />
          <TweakSlider label="Hover scale"  value={t.pgHoverScale}
                       min={1.00} max={1.50} step={0.02}
                       onChange={(v) => setTweak('pgHoverScale', v)} />
          <TweakSlider label="H gap"        value={t.pgHGap}
                       min={0} max={200} step={1} unit="px"
                       onChange={(v) => setTweak('pgHGap', v)} />
          <TweakSlider label="V gap"        value={t.pgVGap}
                       min={0} max={200} step={1} unit="px"
                       onChange={(v) => setTweak('pgVGap', v)} />
          <TweakSlider label="Thumb height" value={t.pgThumbH}
                       min={80} max={1080} step={1} unit="px"
                       onChange={(v) => setTweak('pgThumbH', v)} />
          <TweakSection label="Clip order" sub collapsible defaultOpen={false}>
            <PlaygroundOrder t={t} setTweak={setTweak} />
          </TweakSection>
        </TweakSection>

        {/* ── POSTERS GALLERY ─────────────────────────────────────────── */}
        <TweakSection label="Posters gallery" top collapsible defaultOpen={false}>
          <TweakSlider label="Columns"           value={t.postersCols != null ? t.postersCols : 3}
                       min={1} max={6} step={1}
                       onChange={(v) => setTweak('postersCols', v)} />
          <TweakSlider label="Height conformity" value={t.postersHConf != null ? t.postersHConf : 1}
                       min={0} max={1} step={0.05}
                       onChange={(v) => setTweak('postersHConf', v)} />
          <TweakSlider label="Width conformity"  value={t.postersWConf != null ? t.postersWConf : 0}
                       min={0} max={1} step={0.05}
                       onChange={(v) => setTweak('postersWConf', v)} />
          <TweakSlider label="Hover scale"       value={t.postersHoverScale != null ? t.postersHoverScale : 1.04}
                       min={1.00} max={1.30} step={0.01}
                       onChange={(v) => setTweak('postersHoverScale', v)} />
          <TweakSlider label="Gap X"             value={t.postersHGap != null ? t.postersHGap : 24}
                       min={0} max={120} step={1} unit="px"
                       onChange={(v) => setTweak('postersHGap', v)} />
          <TweakSlider label="Gap Y"             value={t.postersVGap != null ? t.postersVGap : 24}
                       min={0} max={120} step={1} unit="px"
                       onChange={(v) => setTweak('postersVGap', v)} />
          <TweakSection label="Image order" sub collapsible defaultOpen={false}>
            <PostersOrder t={t} setTweak={setTweak} />
          </TweakSection>
        </TweakSection>

      </TweaksPanel>
    );
  }

  const root = document.getElementById('tweaks-root');
  if (root && !window.__MOBILE__ && window.ReactDOM && window.ReactDOM.createRoot) {
    ReactDOM.createRoot(root).render(<App />);
  }
})();
