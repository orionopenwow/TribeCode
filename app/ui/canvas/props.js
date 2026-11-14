// Design canvas: the right panel (P1-B/P1-D). Properties for what's selected: position and size, sizing inside auto
// layout (fixed / hug / fill), auto layout itself (direction, gap, padding, alignment, wrap), appearance, fill,
// stroke, text, and component actions (place a copy, go to main, detach, overrides). Every change is one undo step
// and reaches everyone live. Swatches come from the TribeCode design tokens (CSS variables in styles.css).
//   window.TribeCanvasPanels.props = { mount(el, E), render() }
(function () {
  'use strict';
  const P = window.TribeCanvasPanels = window.TribeCanvasPanels || {};
  let root = null, E = null, padMode = 'two';
  const TOKENS = ['--accent', '--accent-2', '--peer', '--ember', '--amber', '--online'];
  const NEUTRALS = ['#FFFFFF', '#F4F5F7', '#D9D9D9', '#8A94A6', '#2A313C', '#12151A'];
  const FONTS = ['Inter', 'Inter Display', 'JetBrains Mono', 'Georgia', 'system-ui'];
  const WEIGHTS = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold']];
  const POS = ['start', 'center', 'end'];
  const hex = v => { const m = /^#([0-9a-f]{6})/i.exec(String(v || '').trim()); if (m) return '#' + m[1].toUpperCase(); const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v || ''); return r ? '#' + [r[1], r[2], r[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase() : ''; };
  // feat/design-site2: the brand kit (app/ui/brandkit.js) is shared with the website designer. Its colours come first.
  const BK = () => window.TribeBrandKit, bkPid = () => { try { return (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || ''; } catch { return ''; } };
  let bkAsked = null, bkHook = false;
  const brandColors = () => { const B = BK(); if (!B) return []; const pid = bkPid(); if (!bkHook) { bkHook = true; B.onChange(() => { try { render(); } catch {} }); } if (bkAsked !== pid) { bkAsked = pid; B.get(pid).then(k => { if (B.colors(k).length) { try { render(); } catch {} } }).catch(() => {}); } return B.colors(B.cached(pid)).map(c => c.toUpperCase()).slice(0, 6); };
  const brandKit = () => { const B = BK(); return B ? B.cached(bkPid()) : null; };
  // the kit's fonts join the font list; a bundled family (app/ui/assets/site-fonts) is loaded once so it shows on the canvas
  const fontsNow = () => { const k = brandKit(), out = []; if (k && k.fonts) for (const f of [k.fonts.display, k.fonts.body]) { if (f && !/^System/.test(f) && !out.includes(f) && !FONTS.includes(f)) out.push(f); } out.forEach(loadFace); return [...out, ...FONTS]; };
  const faces = new Set();
  function loadFace(name) { if (faces.has(name)) return; faces.add(name); try { const F = window.TribeSiteCfg && window.TribeSiteCfg.FONT && window.TribeSiteCfg.FONT[name]; if (!F || !window.FontFace) return; const ff = new FontFace(name, `url(assets/site-fonts/${F[0]}.woff2) format("woff2")`, { weight: String(F[1]) }); ff.load().then(x => { document.fonts.add(x); try { E.draw && E.draw(); } catch {} }).catch(() => {}); } catch {} }
  const tokenColors = () => { const cs = getComputedStyle(document.documentElement); return TOKENS.map(t => hex(cs.getPropertyValue(t))).filter(Boolean); };
  const r1 = v => Math.round((Number(v) || 0) * 100) / 100;

  function mount(el, editor) {
    root = el; E = editor;
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && e.target.matches('input:not([type=color]):not([type=checkbox]), textarea[data-k="ovtext"]') && !(e.target.tagName === 'TEXTAREA' && e.shiftKey)) { e.preventDefault(); e.target.blur(); }
      if (e.key === 'Escape') { e.target.blur(); E.focus(); }
    });
  }
  const T = k => E.esc(E.T(k));
  const num = (k, v, label, opts = {}) => `<label class="cv-f${opts.wide ? ' wide' : ''}" title="${E.esc(E.T(opts.title || label))}"><span>${E.esc(label)}</span><input type="number" data-k="${k}" value="${v === '' || v == null ? '' : r1(v)}" step="${opts.step || 1}"${opts.min != null ? ` min="${opts.min}"` : ''}${opts.max != null ? ` max="${opts.max}"` : ''}${opts.dis ? ' disabled' : ''} placeholder="${opts.ph || ''}"></label>`;
  const sec = (title, body, extra = '') => `<section class="cv-ps"><header><h4>${T(title)}</h4>${extra}</header>${body}</section>`;
  function colorRow(k, v, opts = {}) {
    const val = hex(v) || '#FFFFFF';
    return `<div class="cv-color">
      <label class="cv-swatch" style="--sw:${E.esc(v || 'transparent')}"><input type="color" data-k="${k}" value="${val}" aria-label="${T(opts.label || 'Color')}"${opts.dis ? ' disabled' : ''}></label>
      <input class="cv-hex" data-k="${k}" data-hex="1" value="${E.esc(hex(v) || '')}" maxlength="9" aria-label="${T('Hex color')}" spellcheck="false"${opts.dis ? ' disabled' : ''}>
      ${opts.remove ? `<button class="cv-pbtn icon" data-act="${opts.remove}" title="${T('Remove')}" aria-label="${T('Remove')}">−</button>` : ''}
    </div>
    <div class="cv-tokens" role="group" aria-label="${T('Design tokens')}">${(() => { const bc = brandColors(); return [...bc.map(c => [c, 1]), ...[...tokenColors(), ...NEUTRALS].filter(c => !bc.includes(String(c).toUpperCase())).map(c => [c, 0])]; })().map(([c, br]) => `<button class="cv-tok${br ? ' brand' : ''}" data-tok="${k}" data-c="${c}" style="--c:${c}" title="${br ? T('Brand kit') + ' ' : ''}${c}" aria-label="${br ? T('Brand kit') + ' ' : ''}${c}"${opts.dis ? ' disabled' : ''}></button>`).join('')}</div>`;
  }

  // ---------- render ----------
  function render() {
    if (!root) return;
    const S = E.S, sel = E.sel.map(id => S.get(id)).filter(Boolean);
    if (E.inner) return renderInner();
    if (!sel.length) {
      root.innerHTML = `<div class="cv-pempty"><span class="eyebrow">${T('Design')}</span><b>${T('Select a layer to edit it')}</b>
        <ul class="cv-keys">
          <li><kbd>F</kbd><span>${T('Frame')}</span></li><li><kbd>R</kbd><span>${T('Rectangle')}</span></li><li><kbd>T</kbd><span>${T('Text')}</span></li>
          <li><kbd>Shift A</kbd><span>${T('Auto layout')}</span></li><li><kbd>Ctrl Alt K</kbd><span>${T('Component')}</span></li><li><kbd>Ctrl G</kbd><span>${T('Group')}</span></li>
          <li><kbd>Space</kbd><span>${T('Drag to pan')}</span></li><li><kbd>Shift 1</kbd><span>${T('Zoom to fit')}</span></li>
        </ul></div>`;
      return;
    }
    const n = sel[0], multi = sel.length > 1, dis = !E.canEdit;
    const look = n.t === 'instance' ? (S.instanceLook(n) || n) : n;
    const box = E.wbox(n.id) || { w: n.w, h: n.h };
    const flow = S.inFlow(n);
    const parent = S.parentOf(n);
    const same = k => sel.every(x => JSON.stringify(x[k]) === JSON.stringify(n[k]));
    const out = [];
    // header
    const kind = { frame: n.lay ? 'Auto layout frame' : 'Frame', component: 'Main component', instance: 'Instance', rect: 'Rectangle', ellipse: 'Ellipse', text: 'Text', group: 'Group' }[n.t] || n.t;
    out.push(`<div class="cv-phead"><span class="eyebrow">${multi ? `${sel.length} ${T('layers')}` : T(kind)}</span><b>${E.esc(multi ? E.T('Mixed') : (n.name || kind))}</b></div>`);
    // component / instance actions
    if (!multi && n.t === 'component') {
      const k = S.instancesOf(n.id).length;
      out.push(sec('Component', `<p class="cv-pnote">${k === 1 ? T('1 copy') : `${k} ${T('copies')}`} · ${T('Edits here update every copy.')}</p>
        <div class="cv-prow"><button class="cv-pbtn primary" data-act="instance"${dis ? ' disabled' : ''}>${T('Place a copy')}</button></div>`));
    }
    if (!multi && n.t === 'instance') {
      const comp = S.get(n.comp); const ovs = Object.keys(n.ov || {}).length;
      out.push(sec('Instance', `<p class="cv-pnote">${T('Copy of')} <b>${E.esc(comp ? comp.name : '?')}</b>${ovs ? ` · ${ovs} ${T('overrides')}` : ''}</p>
        <div class="cv-prow"><button class="cv-pbtn" data-act="main">${T('Go to main component')}</button></div>
        <div class="cv-prow"><button class="cv-pbtn" data-act="detach"${dis ? ' disabled' : ''}>${T('Detach')}</button>${ovs ? `<button class="cv-pbtn" data-act="reset"${dis ? ' disabled' : ''}>${T('Reset overrides')}</button>` : ''}</div>
        <p class="cv-pnote faint">${T('Double-click a layer inside to change its text, fill or visibility.')}</p>`));
    }
    // position and size
    const posDis = dis || flow;
    out.push(sec('Position and size', `<div class="cv-grid">
        ${num('x', multi && !same('x') ? '' : n.x, 'X', { dis: posDis, ph: flow ? 'auto' : '' })}${num('y', multi && !same('y') ? '' : n.y, 'Y', { dis: posDis, ph: flow ? 'auto' : '' })}
        ${num('w', box.w, 'W', { min: 1, dis: dis || n.t === 'group' })}${num('h', box.h, 'H', { min: 1, dis: dis || n.t === 'group' })}
        ${num('rot', n.rot || 0, '°', { title: 'Rotation', dis: dis || n.t === 'group', min: -360, max: 360 })}
      </div>${flow ? `<p class="cv-pnote faint">${T('Auto layout places this layer. Drag it to reorder.')}</p>` : ''}`));
    // sizing: fixed / hug / fill
    const canHug = !!(look.lay || n.t === 'text'), canFill = flow;
    if (canHug || canFill) {
      const sz = n.sz || { h: 'fixed', v: 'fixed' };
      const opt = (axis, v) => ['fixed', ...(canHug ? ['hug'] : []), ...(canFill ? ['fill'] : [])].map(o => `<option value="${o}"${v === o ? ' selected' : ''}>${T({ fixed: 'Fixed', hug: 'Hug', fill: 'Fill' }[o])}</option>`).join('');
      out.push(sec('Resizing', `<div class="cv-grid two">
        <label class="cv-f wide"><span>W</span><select data-k="szh"${dis ? ' disabled' : ''}>${opt('h', sz.h)}</select></label>
        <label class="cv-f wide"><span>H</span><select data-k="szv"${dis ? ' disabled' : ''}>${opt('v', sz.v)}</select></label></div>`));
    }
    // auto layout
    if (!multi && (n.t === 'frame' || n.t === 'component')) {
      if (!n.lay) out.push(sec('Auto layout', `<p class="cv-pnote faint">${T('Stack children in a row or column with even gaps. Exports as CSS flex.')}</p>`, `<button class="cv-pbtn icon" data-act="addlayout" title="${T('Add auto layout')} (Shift A)" aria-label="${T('Add auto layout')}"${dis ? ' disabled' : ''}>+</button>`));
      else {
        const l = n.lay, p = l.p || [0, 0, 0, 0], row = l.d === 'row';
        const grid = POS.map(vr => POS.map(hc => {
          const ai = row ? vr : hc, jc = row ? hc : vr;
          const on = l.ai === ai && (l.jc === jc || (l.jc === 'between' && (row ? hc : vr) === 'center'));
          return `<button class="cv-al${on ? ' on' : ''}" data-align="${ai}|${jc}" aria-label="${E.esc(`${vr} ${hc}`)}"${dis ? ' disabled' : ''}><i></i></button>`;
        }).join('')).join('');
        out.push(sec('Auto layout', `
          <div class="cv-seg" role="group" aria-label="${T('Direction')}">
            <button data-dir="col" class="${!row ? 'on' : ''}" title="${T('Vertical')}"${dis ? ' disabled' : ''}>↓ ${T('Vertical')}</button>
            <button data-dir="row" class="${row && !l.wr ? 'on' : ''}" title="${T('Horizontal')}"${dis ? ' disabled' : ''}>→ ${T('Horizontal')}</button>
            <button data-dir="wrap" class="${row && l.wr ? 'on' : ''}" title="${T('Wrap')}"${dis ? ' disabled' : ''}>↵ ${T('Wrap')}</button>
          </div>
          <div class="cv-alrow">
            <div class="cv-algrid" role="group" aria-label="${T('Alignment')}">${grid}</div>
            <div class="cv-alside">
              ${num('gap', l.g, T('Gap'), { title: 'Gap between items', dis: dis || l.jc === 'between' })}
              <label class="cv-check"><input type="checkbox" data-k="between"${l.jc === 'between' ? ' checked' : ''}${dis ? ' disabled' : ''}> <span>${T('Space between')}</span></label>
              <label class="cv-check"><input type="checkbox" data-k="stretch"${l.ai === 'stretch' ? ' checked' : ''}${dis ? ' disabled' : ''}> <span>${T('Stretch children')}</span></label>
            </div>
          </div>
          <div class="cv-padhead"><span>${T('Padding')}</span><button class="cv-pbtn icon small" data-act="padmode" title="${T('Each side')}" aria-label="${T('Each side')}">${padMode === 'two' ? '⊞' : '⊟'}</button></div>
          <div class="cv-grid">${padMode === 'two'
            ? num('padx', p[1] === p[3] ? p[1] : '', '↔', { title: 'Horizontal padding', min: 0, dis, ph: E.T('Mixed') }) + num('pady', p[0] === p[2] ? p[0] : '', '↕', { title: 'Vertical padding', min: 0, dis, ph: E.T('Mixed') })
            : num('pt', p[0], '↑', { title: 'Top', min: 0, dis }) + num('pr', p[1], '→', { title: 'Right', min: 0, dis }) + num('pb', p[2], '↓', { title: 'Bottom', min: 0, dis }) + num('pl', p[3], '←', { title: 'Left', min: 0, dis })}</div>`,
          `<button class="cv-pbtn icon" data-act="rmlayout" title="${T('Remove auto layout')}" aria-label="${T('Remove auto layout')}"${dis ? ' disabled' : ''}>−</button>`));
      }
    }
    // appearance
    if (n.t !== 'group') {
      out.push(sec('Appearance', `<div class="cv-grid">
        ${num('op', Math.round((n.op == null ? 1 : n.op) * 100), '%', { title: 'Opacity', min: 0, max: 100, dis })}
        ${n.t !== 'text' && n.t !== 'ellipse' ? num('r', look.r || 0, '◜', { title: 'Corner radius', min: 0, dis: dis || n.t === 'instance' }) : ''}
      </div>${(n.t === 'frame' || n.t === 'component') ? `<label class="cv-check"><input type="checkbox" data-k="clip"${n.clip ? ' checked' : ''}${dis ? ' disabled' : ''}> <span>${T('Clip content')}</span></label>` : ''}`));
    }
    // fill
    if (n.t !== 'group' && n.t !== 'text') {
      const fill = n.t === 'instance' ? ((n.ov && n.ov.self && n.ov.self.fill) || look.fill) : n.fill;
      out.push(sec('Fill', fill ? colorRow('fill', fill, { remove: n.t === 'instance' ? '' : 'nofill', dis, label: 'Fill' }) : `<p class="cv-pnote faint">${T('No fill')}</p>`,
        fill ? '' : `<button class="cv-pbtn icon" data-act="addfill" title="${T('Add fill')}" aria-label="${T('Add fill')}"${dis || n.t === 'instance' ? ' disabled' : ''}>+</button>`));
    }
    { const k = brandKit(); if (k && k.logo && (n.t === 'rect' || n.t === 'frame' || n.t === 'ellipse') && !dis) out.push(sec('Brand kit', `<div class="cv-prow"><img class="cv-brandlogo" src="${E.esc(k.logo)}" alt=""><button class="cv-pbtn" data-act="brandlogo">${T('Use the logo here')}</button></div>`)); }
    // stroke
    if (n.t !== 'group' && n.t !== 'text' && n.t !== 'instance') {
      out.push(sec('Stroke', n.stroke ? colorRow('stroke', n.stroke, { remove: 'nostroke', dis, label: 'Stroke' }) + `<div class="cv-grid">${num('sw', n.sw || 1, T('Weight'), { min: 0, max: 64, dis })}</div>` : `<p class="cv-pnote faint">${T('No stroke')}</p>`,
        n.stroke ? '' : `<button class="cv-pbtn icon" data-act="addstroke" title="${T('Add stroke')}" aria-label="${T('Add stroke')}"${dis ? ' disabled' : ''}>+</button>`));
    }
    // text
    if (n.t === 'text') {
      const t = n.tx || {};
      out.push(sec('Text', `
        <label class="cv-f wide"><span>${T('Font')}</span><select data-k="font"${dis ? ' disabled' : ''}>${fontsNow().map(f => `<option${t.f === f ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
        <div class="cv-grid">
          ${num('fs', t.s, T('Size'), { min: 1, max: 400, dis })}
          <label class="cv-f"><span>${T('Weight')}</span><select data-k="fw"${dis ? ' disabled' : ''}>${WEIGHTS.map(([w, l]) => `<option value="${w}"${+t.wt === w ? ' selected' : ''}>${T(l)}</option>`).join('')}</select></label>
          ${num('lh', t.lh, T('Line'), { title: 'Line height', step: 0.05, min: 0.5, max: 4, dis })}
        </div>
        <div class="cv-seg" role="group" aria-label="${T('Align')}">${['left', 'center', 'right'].map(a => `<button data-talign="${a}" class="${(t.al || 'left') === a ? 'on' : ''}"${dis ? ' disabled' : ''}>${T(a[0].toUpperCase() + a.slice(1))}</button>`).join('')}</div>
        ${colorRow('tcol', t.col, { dis, label: 'Text color' })}`));
    }
    // structure shortcuts
    if (E.canEdit) out.push(sec('Arrange', `<div class="cv-prow wrap">
      <button class="cv-pbtn" data-act="group">${T('Group')} <kbd>Ctrl G</kbd></button>
      ${n.t === 'group' ? `<button class="cv-pbtn" data-act="ungroup">${T('Ungroup')}</button>` : ''}
      ${n.t !== 'component' && n.t !== 'instance' ? `<button class="cv-pbtn" data-act="component">${T('Make component')} <kbd>Ctrl Alt K</kbd></button>` : ''}
      <button class="cv-pbtn" data-act="duplicate">${T('Duplicate')} <kbd>Ctrl D</kbd></button>
      <button class="cv-pbtn danger" data-act="delete">${T('Delete')}</button></div>`));
    void parent;
    root.innerHTML = out.join('');
  }
  function renderInner() {
    const S = E.S, inst = S.get(E.inner.inst), src = S.get(E.inner.src);
    if (!inst || !src) { root.innerHTML = ''; return; }
    const r = S.resolved(src, inst), o = (inst.ov || {})[src.id] || {}, dis = !E.canEdit;
    const out = [`<div class="cv-phead"><span class="eyebrow">${T('Inside')} ${E.esc(inst.name || 'Instance')}</span><b>${E.esc(src.name || src.t)}</b></div>`];
    out.push(sec('Override', `<p class="cv-pnote faint">${T('Changes here apply to this copy only. The main component keeps its design.')}</p>
      <label class="cv-check"><input type="checkbox" data-k="ovhide"${r.hide ? '' : ' checked'}${dis ? ' disabled' : ''}> <span>${T('Visible')}</span></label>`));
    if (src.t === 'text') out.push(sec('Text', `<textarea class="cv-ta" data-k="ovtext" rows="3"${dis ? ' disabled' : ''}>${E.esc(r.tx ? r.tx.c : '')}</textarea>`));
    if (src.t !== 'text' && src.t !== 'group') out.push(sec('Fill', colorRow('ovfill', r.fill || '#FFFFFF', { dis, label: 'Fill' })));
    if (Object.keys(o).length) out.push(`<div class="cv-prow pad"><button class="cv-pbtn" data-act="resetone"${dis ? ' disabled' : ''}>${T('Reset this override')}</button></div>`);
    out.push(`<div class="cv-prow pad"><button class="cv-pbtn" data-act="main">${T('Go to main component')}</button></div>`);
    root.innerHTML = out.join('');
  }

  // ---------- edits ----------
  function onChange(e) {
    const t = e.target, k = t.dataset.k; if (!k || !E.canEdit) return;
    const S = E.S, ids = [...E.sel];
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.hex) { const h = /^#?([0-9a-f]{6}([0-9a-f]{2})?)$/i.exec(String(v).trim()); if (!h) { render(); return; } v = '#' + h[1].toUpperCase(); }
    if (t.type === 'color') v = v.toUpperCase();
    const n = Number(v);
    // inside an instance
    if (E.inner) {
      const { inst, src } = E.inner;
      if (k === 'ovtext') return E.override(inst, src, { c: v });
      if (k === 'ovhide') return E.override(inst, src, { hide: !v });
      if (k === 'ovfill') return E.override(inst, src, { fill: v });
      return;
    }
    if (!ids.length) return;
    const one = S.get(ids[0]);
    if ((k === 'x' || k === 'y' || k === 'w' || k === 'h' || k === 'rot' || k === 'sw' || k === 'r' || k === 'gap' || k === 'fs' || k === 'lh' || k === 'op' || /^p[adtrbl]/.test(k)) && (v === '' || !Number.isFinite(n))) { render(); return; }
    E.patchMany(ids, c => {
      if (k === 'x' || k === 'y') c[k] = Math.round(n);
      else if (k === 'w' || k === 'h') {
        const val = Math.max(1, Math.round(n));
        c[k] = val; const sz = Object.assign({ h: 'fixed', v: 'fixed' }, c.sz); if (k === 'w') sz.h = 'fixed'; else sz.v = 'fixed'; c.sz = sz.h === 'fixed' && sz.v === 'fixed' ? undefined : sz;
      }
      else if (k === 'rot') { if (n) c.rot = n; else delete c.rot; }
      else if (k === 'op') { const o = Math.max(0, Math.min(100, n)) / 100; if (o === 1) delete c.op; else c.op = o; }
      else if (k === 'r') { if (n > 0) c.r = n; else delete c.r; }
      else if (k === 'clip') { if (v) c.clip = true; else delete c.clip; }
      else if (k === 'fill') { if (c.t === 'instance') { c.ov = Object.assign({}, c.ov); c.ov.self = Object.assign({}, c.ov.self, { fill: v }); } else c.fill = v; }
      else if (k === 'stroke') c.stroke = v;
      else if (k === 'sw') c.sw = Math.max(0, n);
      else if (k === 'szh' || k === 'szv') {
        const sz = Object.assign({ h: 'fixed', v: 'fixed' }, c.sz); sz[k === 'szh' ? 'h' : 'v'] = v;
        if (v === 'fixed') { const b = E.wbox(c.id); if (b) { if (k === 'szh') c.w = Math.round(b.w); else c.h = Math.round(b.h); } }
        c.sz = sz.h === 'fixed' && sz.v === 'fixed' ? undefined : sz;
      }
      else if (c.lay && (k === 'gap' || /^p[adtrbl]/.test(k) || k === 'between' || k === 'stretch')) {
        const l = c.lay = Object.assign({}, c.lay); const p = l.p = [...(l.p || [0, 0, 0, 0])];
        if (k === 'gap') l.g = Math.round(n);
        if (k === 'padx') { p[1] = p[3] = Math.max(0, Math.round(n)); } if (k === 'pady') { p[0] = p[2] = Math.max(0, Math.round(n)); }
        if (k === 'pt') p[0] = Math.max(0, Math.round(n)); if (k === 'pr') p[1] = Math.max(0, Math.round(n)); if (k === 'pb') p[2] = Math.max(0, Math.round(n)); if (k === 'pl') p[3] = Math.max(0, Math.round(n));
        if (k === 'between') l.jc = v ? 'between' : 'start';
        if (k === 'stretch') l.ai = v ? 'stretch' : 'start';
      }
      else if (c.t === 'text' && ['font', 'fs', 'fw', 'lh', 'tcol'].includes(k)) {
        const tx = c.tx = Object.assign({}, c.tx);
        if (k === 'font') tx.f = v; if (k === 'fs') tx.s = Math.max(1, n); if (k === 'fw') tx.wt = +v; if (k === 'lh') tx.lh = Math.max(0.5, n); if (k === 'tcol') tx.col = v;
      }
    });
    void one;
  }
  function onClick(e) {
    const S = E.S, ids = [...E.sel];
    const tok = e.target.closest('[data-tok]');
    if (tok && E.canEdit) {
      const k = tok.dataset.tok, c = tok.dataset.c;
      if (E.inner) { if (k === 'ovfill') E.override(E.inner.inst, E.inner.src, { fill: c }); return; }
      E.patchMany(ids, n => { if (k === 'fill') { if (n.t === 'instance') { n.ov = Object.assign({}, n.ov); n.ov.self = Object.assign({}, n.ov.self, { fill: c }); } else n.fill = c; } else if (k === 'stroke') n.stroke = c; else if (k === 'tcol' && n.tx) n.tx = Object.assign({}, n.tx, { col: c }); });
      return;
    }
    const dir = e.target.closest('[data-dir]');
    if (dir && E.canEdit) { const d = dir.dataset.dir; E.patchMany(ids, n => { if (!n.lay) return; n.lay = Object.assign({}, n.lay, { d: d === 'col' ? 'col' : 'row' }); if (d === 'wrap') n.lay.wr = true; else delete n.lay.wr; }); return; }
    const al = e.target.closest('[data-align]');
    if (al && E.canEdit) { const [ai, jc] = al.dataset.align.split('|'); E.patchMany(ids, n => { if (!n.lay) return; n.lay = Object.assign({}, n.lay, { ai, jc: n.lay.jc === 'between' ? 'between' : jc }); }); return; }
    const ta = e.target.closest('[data-talign]');
    if (ta && E.canEdit) { E.patchMany(ids, n => { if (n.tx) n.tx = Object.assign({}, n.tx, { al: ta.dataset.talign }); }); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act, id = ids[0];
    if (act === 'padmode') { padMode = padMode === 'two' ? 'four' : 'two'; render(); return; }
    if (act === 'main') { E.goToMain(E.inner ? E.inner.inst : id); return; }
    if (!E.canEdit) return;
    if (act === 'instance') E.insertInstance(id);
    else if (act === 'detach') E.detach(id);
    else if (act === 'reset') E.resetOverrides(id);
    else if (act === 'resetone' && E.inner) { const inst = S.get(E.inner.inst); if (inst) { const ov = Object.assign({}, inst.ov); delete ov[E.inner.src]; E.patch(inst.id, { ov: Object.keys(ov).length ? ov : undefined }); } }
    else if (act === 'addlayout') E.autoLayout();
    else if (act === 'rmlayout') E.autoLayout();   // Shift A on a frame that has it removes it
    else if (act === 'brandlogo') { const k = brandKit(); if (k && k.logo) E.patchMany(ids, n => { n.img = k.logo; }); }
    else if (act === 'addfill') E.patchMany(ids, n => { n.fill = n.t === 'frame' || n.t === 'component' ? '#FFFFFF' : '#D9D9D9'; });
    else if (act === 'nofill') E.patchMany(ids, n => { delete n.fill; });
    else if (act === 'addstroke') E.patchMany(ids, n => { n.stroke = '#12151A'; n.sw = 1; });
    else if (act === 'nostroke') E.patchMany(ids, n => { delete n.stroke; delete n.sw; });
    else if (act === 'group') E.group();
    else if (act === 'ungroup') E.ungroup();
    else if (act === 'component') E.makeComponent();
    else if (act === 'duplicate') E.duplicate();
    else if (act === 'delete') E.removeSel();
  }

  P.props = { mount, render };
})();
