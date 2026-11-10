// Design canvas <-> code (P1-C, docs/EDITOR-PARITY.md). Four things that turn a design into the app and back:
//   - Send to app: the selected frame becomes HTML + CSS in the project (server/canvascode.js writes it between markers,
//     commits it, and the live preview reloads). Sending again updates the same file.
//   - Open in canvas: the element picked in the live preview (its DOM and computed styles, read by the preview helper in
//     server/preview.js) becomes canvas layers. Flex containers become auto layout frames, text stays text.
//   - Inspect: the CSS of the selected layer, its colors (named after the TribeCode design tokens when they match),
//     spacing, and Alt-hover measuring to other layers. Copy buttons for CSS and HTML.
//   - Export: the selection as PNG (1x, 2x) or SVG, drawn from the same CSS the app gets.
// Plus comment pins on layers (TribePins.mount with a canvas anchor provider: a pin sticks to a layer and a spot in it).
//   window.TribeCanvasCode = { mount(E), render(), send(id, path?), exportData(id, fmt, scale), openFromPreview(), fromTree(tree), comment(on), commenting() }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const SC = window.TribeCanvasScene;
  const T = (k, f) => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(k, f || k) : (f || k));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const $ = (s, el = document) => el.querySelector(s);
  const CONT = new Set(['frame', 'component', 'instance']);
  let E = null, tab = 'design', links = {}, pages = [], target = {}, pinsH = null, commenting = false, pickRes = null, measureEl = null, pinLayer = null;

  // ---------- tokens: hex -> --name, read from the app's own :root rules ----------
  let tokenMap = null;
  const hexOf = v => { const m = /^#([0-9a-f]{6})/i.exec(String(v || '').trim()); if (m) return '#' + m[1].toUpperCase(); const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(v || ''); if (!r) return ''; if (r[4] != null && +r[4] === 0) return ''; return '#' + [r[1], r[2], r[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  function tokens() {
    if (tokenMap) return tokenMap;
    tokenMap = new Map();
    const cs = getComputedStyle(document.documentElement), names = new Set();
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; } for (const r of rules || []) if (r.selectorText && /(^|,)\s*:root\b/.test(r.selectorText)) for (const p of r.style) if (p.startsWith('--')) names.add(p); }
    for (const n of names) { const h = hexOf(cs.getPropertyValue(n)); if (h && !tokenMap.has(h)) tokenMap.set(h, n); }
    return tokenMap;
  }
  const tokenFor = hex => tokens().get(String(hex || '').slice(0, 7).toUpperCase()) || '';

  // ---------- mount ----------
  function mount(editor) {
    E = editor; tokenMap = null;
    const cv = $('#cv');
    $('#cv-send').onclick = () => { const f = frameOf(); if (f) send(f.id); };
    $('#cv-export').onclick = e => exportMenu(e.currentTarget);
    $('#cv-comment').onclick = () => comment();
    cv.querySelector('.cv-rtabs').addEventListener('click', e => { const b = e.target.closest('[data-rtab]'); if (b) setTab(b.dataset.rtab); });
    const ins = $('#cv-inspect');
    ins.addEventListener('click', onInspectClick);
    ins.addEventListener('change', e => { if (e.target.matches('[data-target]')) { const f = frameOf(); if (f) target[f.id] = e.target.value; } });
    ins.addEventListener('keydown', e => e.stopPropagation());
    // Alt-hover measuring
    measureEl = document.createElement('div'); measureEl.className = 'cv-measure'; measureEl.setAttribute('aria-hidden', 'true'); E.stage.appendChild(measureEl);
    E.stage.addEventListener('pointermove', e => { if (e.altKey && !commenting) measure(e.clientX, e.clientY); else if (measureEl.childElementCount) measureEl.innerHTML = ''; });
    E.stage.addEventListener('pointerleave', () => { measureEl.innerHTML = ''; });
    addEventListener('keyup', e => { if (e.key === 'Alt' && measureEl) measureEl.innerHTML = ''; });
    // comment pins on layers
    pinLayer = document.createElement('div'); pinLayer.className = 'pin-layer cv-pinlayer'; E.stage.appendChild(pinLayer);
    E.stage.addEventListener('pointerdown', onPinDown, true);
    if (window.TribePins && window.TribePins.mount) pinsH = window.TribePins.mount(E.stage, provider);
    new MutationObserver(() => schedulePins()).observe(E.world, { attributes: true, attributeFilter: ['style'] });
    loadLinks();
  }
  function setTab(t) {
    tab = t;
    document.querySelectorAll('#cv .cv-rtabs [data-rtab]').forEach(b => { const on = b.dataset.rtab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    $('#cv-props').hidden = t !== 'design'; $('#cv-inspect').hidden = t !== 'inspect';
    render();
  }
  async function loadLinks() { try { const r = await C.api('/canvascode'); links = r.links || {}; pages = r.pages || []; render(); } catch {} }
  const linkOf = id => links[`${String(E.file || 'main').replace(/[^\w-]/g, '')}:${id}`] || null;

  // the frame "Send to app" works on: the nearest frame, component or instance around the selection
  function frameOf() {
    if (!E) return null;
    let n = E.S.get(E.sel[0]), k = 0;
    while (n && !CONT.has(n.t) && k++ < 200) n = E.S.parentOf(n);
    return n || null;
  }

  // ---------- render (called with the other panels) ----------
  function render() {
    if (!E) return;
    const fr = frameOf(), sb = $('#cv-send');
    if (sb) { sb.disabled = !fr || !E.canEdit; sb.title = fr ? T('Send “{name}” to the app as HTML and CSS').replace('{name}', fr.name || T('Frame')) : T('Select a frame to send it to the app'); }
    schedulePins();
    if (tab !== 'inspect') return;
    const el = $('#cv-inspect'); if (!el) return;
    const S = E.S, n = S.get(E.sel[0]);
    if (!n) { el.innerHTML = `<div class="cv-pempty"><span class="eyebrow">${esc(T('Inspect'))}</span><b>${esc(T('Select a layer to see its code'))}</b><span class="cv-ins-hint">${esc(T('Hold Alt and point at another layer to measure the distance.'))}</span></div>`; return; }
    const look = n.t === 'instance' ? (S.instanceLook(n) || n) : n;
    const par = S.parentOf(n), parLook = par ? (par.t === 'instance' ? S.instanceLook(par) : par) : null;
    const st = SC.styleOf(look, parLook);
    if (!par) { delete st.left; delete st.top; st.position = 'relative'; }
    const box = E.wbox(n.id) || { x: n.x, y: n.y, w: n.w, h: n.h };
    const cssLines = Object.entries(st).map(([k, v]) => { const h = /#[0-9a-f]{6}/i.exec(v); const tk = h ? tokenFor(h[0]) : ''; return `  ${k}: ${v};${tk ? ` /* ${tk} */` : ''}`; });
    const cssText = `.${cls(look.name || look.t)} {\n${cssLines.join('\n')}\n}`;
    const colors = [...new Set([look.fill, look.stroke, look.tx && look.tx.col].filter(Boolean).map(c => String(c).toUpperCase()))];
    const lay = look.lay;
    const pb = par ? E.wbox(par.id) : null;
    const dist = pb && !S.inFlow(n) ? [['Left', box.x - pb.x], ['Top', box.y - pb.y], ['Right', pb.x + pb.w - box.x - box.w], ['Bottom', pb.y + pb.h - box.y - box.h]] : null;
    const r = v => Math.round((Number(v) || 0) * 10) / 10;
    const f = frameOf(), link = f ? linkOf(f.id) : null;
    el.innerHTML = `
      <section class="cv-ps"><header><h4 class="cv-ins-name">${esc(look.name || look.t)}</h4><span class="cv-ins-kind">${esc(T(kindLabel(n)))}</span></header>
        <dl class="cv-ins-dl"><div><dt>W</dt><dd>${r(box.w)}</dd></div><div><dt>H</dt><dd>${r(box.h)}</dd></div><div><dt>X</dt><dd>${r(par ? box.x - (pb ? pb.x : 0) : box.x)}</dd></div><div><dt>Y</dt><dd>${r(par ? box.y - (pb ? pb.y : 0) : box.y)}</dd></div></dl>
      </section>
      ${lay ? `<section class="cv-ps"><header><h4>${esc(T('Auto layout'))}</h4><span class="cv-ins-kind">flex · ${lay.d === 'row' ? 'row' : 'column'}</span></header>
        <dl class="cv-ins-dl"><div><dt>${esc(T('Gap'))}</dt><dd>${r(lay.g)}</dd></div><div class="wide"><dt>${esc(T('Padding'))}</dt><dd>${(lay.p || [0, 0, 0, 0]).map(r).join(' ')}</dd></div></dl></section>` : ''}
      ${dist ? `<section class="cv-ps"><header><h4>${esc(T('Spacing to parent'))}</h4></header><dl class="cv-ins-dl">${dist.map(([k, v]) => `<div><dt>${esc(T(k))}</dt><dd>${r(v)}</dd></div>`).join('')}</dl></section>` : ''}
      ${colors.length ? `<section class="cv-ps"><header><h4>${esc(T('Colors'))}</h4></header><ul class="cv-ins-colors">${colors.map(c => { const tk = tokenFor(c); return `<li><i style="--c:${esc(c)}"></i><code>${esc(c)}</code>${tk ? `<span class="cv-ins-tok">${esc(tk)}</span>` : ''}</li>`; }).join('')}</ul></section>` : ''}
      ${look.t === 'text' && look.tx ? `<section class="cv-ps"><header><h4>${esc(T('Text'))}</h4></header><dl class="cv-ins-dl"><div class="wide"><dt>${esc(T('Font'))}</dt><dd>${esc(look.tx.f || 'Inter')} · ${esc(look.tx.wt || 400)}</dd></div><div><dt>${esc(T('Size'))}</dt><dd>${r(look.tx.s || 16)}</dd></div><div><dt>${esc(T('Line height'))}</dt><dd>${r(look.tx.lh || 1.3)}</dd></div></dl></section>` : ''}
      <section class="cv-ps"><header><h4>CSS</h4><button class="cv-pbtn" data-copy="css">${esc(T('Copy'))}</button></header><pre class="cv-code" id="cv-ins-css">${esc(cssText)}</pre>
        <div class="cv-ins-row"><button class="cv-pbtn" data-copy="html">${esc(T('Copy as HTML/CSS'))}</button></div>
        <span class="cv-ins-hint">${esc(T('Hold Alt and point at another layer to measure the distance.'))}</span></section>
      <section class="cv-ps"><header><h4>${esc(T('Export'))}</h4></header>
        <div class="cv-ins-row"><button class="cv-pbtn" data-export="png" data-scale="1">PNG</button><button class="cv-pbtn" data-export="png" data-scale="2">PNG 2x</button><button class="cv-pbtn" data-export="svg">SVG</button></div></section>
      ${f ? `<section class="cv-ps"><header><h4>${esc(T('In the app'))}</h4></header>
        <label class="cv-ins-target"><span>${esc(T('Send “{name}” to').replace('{name}', f.name || T('Frame')))}</span>
          <select class="input" data-target>${[`<option value="">${esc(link ? link.path : T('A new page in design/'))}</option>`, ...pages.filter(p => !link || p !== link.path).map(p => `<option value="${esc(p)}"${target[f.id] === p ? ' selected' : ''}>${esc(p)}</option>`)].join('')}</select></label>
        <div class="cv-ins-row"><button class="cv-pbtn primary" data-send ${E.canEdit ? '' : 'disabled'}>${esc(link ? T('Update in the app') : T('Send to app'))}</button>${link ? `<button class="cv-pbtn" data-preview="${esc(link.path)}">${esc(T('Open in preview'))}</button>` : ''}</div>
        ${link ? `<span class="cv-ins-hint">${esc(T('Lives in {path}. Sending again replaces only the marked parts of that file.').replace('{path}', link.path))}</span>` : ''}</section>` : ''}`;
  }
  const kindLabel = n => ({ frame: 'Frame', component: 'Component', instance: 'Instance', rect: 'Rectangle', ellipse: 'Ellipse', text: 'Text', group: 'Group' }[n.t] || n.t);
  const cls = name => (String(name || 'layer').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layer').replace(/^([0-9])/, 'l-$1');

  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); toast(T('Copied {what}').replace('{what}', what)); }
    catch { window.__tcLastCopy = text; toast(T('Copied {what}').replace('{what}', what)); }
    window.__tcLastCopy = text;
  }
  function onInspectClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    const id = E.sel[0];
    if (b.dataset.copy === 'css') return copy($('#cv-ins-css').textContent, 'CSS');
    if (b.dataset.copy === 'html') { const o = E.toHTML(id); if (o) return copy(`<style>\n${o.css}\n</style>\n${o.html}`, 'HTML/CSS'); return; }
    if (b.dataset.export) return download(id, b.dataset.export, +b.dataset.scale || 1);
    if (b.hasAttribute('data-send')) { const f = frameOf(); if (f) send(f.id, target[f.id] || ''); return; }
    if (b.dataset.preview) return openPreview(b.dataset.preview);
  }

  // ---------- send to app ----------
  async function send(id, path) {
    if (!E || !E.canEdit) return null;
    const o = E.toHTML(id); if (!o) return null;
    const btn = $('#cv-send'); if (btn) btn.disabled = true;
    try {
      const r = await C.api('/canvascode/send', { method: 'POST', body: { file: E.file, frame: id, name: o.name, html: o.html, css: o.css, ...(path ? { path } : {}) } });
      links[`${String(E.file || 'main').replace(/[^\w-]/g, '')}:${id}`] = { path: r.path, at: new Date().toISOString(), name: o.name };
      delete target[id];
      toast(r.changed === false ? T('Already up to date in {path}').replace('{path}', r.path) : (r.created ? T('Sent to the app: {path}') : T('Updated in the app: {path}')).replace('{path}', r.path));
      loadLinks();
      return r;
    } catch (e) { toast(e.message); return null; }
    finally { render(); }
  }
  function openPreview(path) {
    const P = window.TribePreview; if (!P) return;
    if (P.show) P.show(path); else if (P.open) P.open();
  }

  // ---------- export ----------
  function svgOf(id) {
    const o = E.toHTML(id), b = E.wbox(id); if (!o || !b) return null;
    const w = Math.max(1, Math.ceil(b.w)), h = Math.max(1, Math.ceil(b.h));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden"><style>${o.css}</style>${o.html}</div></foreignObject></svg>`;
    return { svg, w, h, name: o.name };
  }
  async function exportData(id, fmt = 'png', scale = 1) {
    const s = svgOf(id); if (!s) throw new Error(T('Select a layer to export'));
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg);
    if (fmt === 'svg') return { url, name: s.name, w: s.w, h: s.h };
    const img = new Image(); img.decoding = 'sync';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error(T('Couldn’t draw that layer as a picture'))); img.src = url; });
    const k = Math.max(1, Math.min(4, scale)), cv = document.createElement('canvas');
    cv.width = Math.round(s.w * k); cv.height = Math.round(s.h * k);
    const g = cv.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0, s.w, s.h);
    return { url: cv.toDataURL('image/png'), name: s.name, w: cv.width, h: cv.height };
  }
  async function download(id, fmt, scale) {
    if (!id) return toast(T('Select a layer to export'));
    try {
      const r = await exportData(id, fmt, scale);
      const a = document.createElement('a'); a.href = r.url; a.download = `${cls(r.name)}${fmt === 'png' && scale > 1 ? `@${scale}x` : ''}.${fmt}`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast(e.message); }
  }
  function exportMenu(anchor) {
    const id = E.sel[0];
    if (!id) return toast(T('Select a layer to export'));
    E.menu(anchor, [
      { label: T('Export as PNG'), run: () => download(id, 'png', 1) }, { label: T('Export as PNG 2x'), run: () => download(id, 'png', 2) },
      { label: T('Export as SVG'), run: () => download(id, 'svg', 1) }, '-',
      { label: T('Copy as HTML/CSS'), run: () => { const o = E.toHTML(id); if (o) copy(`<style>\n${o.css}\n</style>\n${o.html}`, 'HTML/CSS'); } },
    ]);
  }

  // ---------- Alt-hover measuring ----------
  function measure(cx, cy) {
    const sel = E.sel[0], a = sel && E.elOf(sel);
    const hit = document.elementFromPoint(cx, cy), hEl = hit && hit.closest && hit.closest('.cv-world [data-id]');
    if (!a || !hEl || hEl === a) { measureEl.innerHTML = ''; return; }
    const sr = E.stage.getBoundingClientRect(), z = E.view.z;
    const A = a.getBoundingClientRect(), B = hEl.getBoundingClientRect();
    const rel = r => ({ l: r.left - sr.left, t: r.top - sr.top, r: r.right - sr.left, b: r.bottom - sr.top });
    const p = rel(A), q = rel(B), out = [];
    const line = (x1, y1, x2, y2) => { const d = Math.round(Math.hypot(x2 - x1, y2 - y1) / z); if (d <= 0) return; const hz = y1 === y2; out.push(`<i class="cv-ml ${hz ? 'h' : 'v'}" style="left:${Math.min(x1, x2)}px;top:${Math.min(y1, y2)}px;${hz ? `width:${Math.abs(x2 - x1)}px` : `height:${Math.abs(y2 - y1)}px`}"></i><b class="cv-mlabel" style="left:${(x1 + x2) / 2}px;top:${(y1 + y2) / 2}px">${d}</b>`); };
    const inside = (o, i) => i.l >= o.l && i.r <= o.r && i.t >= o.t && i.b <= o.b;
    const cyA = (p.t + p.b) / 2, cxA = (p.l + p.r) / 2;
    if (inside(q, p) || inside(p, q)) {
      const [o, i] = inside(q, p) ? [q, p] : [p, q];
      const my = (i.t + i.b) / 2, mx = (i.l + i.r) / 2;
      line(o.l, my, i.l, my); line(i.r, my, o.r, my); line(mx, o.t, mx, i.t); line(mx, i.b, mx, o.b);
    } else {
      const y = Math.max(p.t, q.t) < Math.min(p.b, q.b) ? (Math.max(p.t, q.t) + Math.min(p.b, q.b)) / 2 : cyA;
      const x = Math.max(p.l, q.l) < Math.min(p.r, q.r) ? (Math.max(p.l, q.l) + Math.min(p.r, q.r)) / 2 : cxA;
      if (q.l >= p.r) line(p.r, y, q.l, y); else if (q.r <= p.l) line(q.r, y, p.l, y);
      if (q.t >= p.b) line(x, p.b, x, q.t); else if (q.b <= p.t) line(x, q.b, x, p.t);
    }
    out.push(`<span class="cv-mbox" style="left:${q.l}px;top:${q.t}px;width:${q.r - q.l}px;height:${q.b - q.t}px"></span>`);
    measureEl.innerHTML = out.join('');
  }

  // ---------- comment pins on layers ----------
  const provider = {
    surface: 'canvas',
    key: () => (E ? E.file : ''),
    layer: () => pinLayer,
    place: list => Promise.resolve(list.map(p => {
      const t = p.target || {}, v = E.view, b = t.node ? E.wbox(t.node) : null;
      const wx = b ? b.x + b.w * (+t.ox || 0) : +t.wx || 0, wy = b ? b.y + b.h * (+t.oy || 0) : +t.wy || 0;
      return { id: p.id, x: v.x + wx * v.z, y: v.y + wy * v.z, found: !!b };
    })),
    pick: () => new Promise(res => { if (pickRes) pickRes(null); pickRes = res; }),
    commenting: on => {
      commenting = !!on;
      const cv = $('#cv'); if (cv) cv.classList.toggle('cv-commenting', commenting);
      const b = $('#cv-comment'); if (b) b.setAttribute('aria-pressed', String(commenting));
      if (!commenting && pickRes) { const r = pickRes; pickRes = null; r(null); }
    },
  };
  function onPinDown(e) {
    if (!commenting || !pickRes || e.button > 0) return;
    if (e.target.closest('.pin-mk')) return;
    e.preventDefault(); e.stopPropagation();
    const sr = E.stage.getBoundingClientRect(), v = E.view;
    const wx = (e.clientX - sr.left - v.x) / v.z, wy = (e.clientY - sr.top - v.y) / v.z;
    const hit = document.elementFromPoint(e.clientX, e.clientY), el = hit && hit.closest && hit.closest('.cv-world [data-id], .cv-world [data-inst]');
    const id = el ? (el.dataset.id || el.dataset.inst) : '';
    const b = id ? E.wbox(id) : null, n = id ? E.S.get(id) : null;
    const r = pickRes; pickRes = null;
    r({ key: E.file, node: b ? id : '', ox: b && b.w ? (wx - b.x) / b.w : 0, oy: b && b.h ? (wy - b.y) / b.h : 0, wx: Math.round(wx), wy: Math.round(wy), tag: n ? n.name || n.t : '', _x: e.clientX, _y: e.clientY });
  }
  function comment(on) { if (!pinsH) return toast(T('Comments aren’t available here')); pinsH.comment(on); }
  let pinT = 0;
  function schedulePins() { if (!pinsH || pinT) return; pinT = requestAnimationFrame(() => { pinT = 0; pinsH.refresh(); }); }

  // ---------- preview element -> canvas layers ----------
  const FONTS = [[/georgia|times|(?:^|,)\s*serif\s*(?:,|$)/i, 'Georgia'], [/mono|courier|consolas/i, 'JetBrains Mono'], [/inter display/i, 'Inter Display']];
  const pxv = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const AI = { 'flex-start': 'start', start: 'start', normal: 'stretch', stretch: 'stretch', center: 'center', 'flex-end': 'end', end: 'end', baseline: 'start' };
  const JC = { 'flex-start': 'start', start: 'start', normal: 'start', center: 'center', 'flex-end': 'end', end: 'end', 'space-between': 'between', 'space-around': 'between', 'space-evenly': 'between' };
  function colorOf(v) {
    const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(v || ''); if (!r) return hexOf(v);
    const a = r[4] == null ? 1 : +r[4]; if (a === 0) return '';
    const h = '#' + [r[1], r[2], r[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase();
    return a < 1 ? h + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase() : h;
  }
  const nameOf = o => o.text ? o.text.slice(0, 32) : (o.cls ? o.cls.replace(/[-_]+/g, ' ') : o.tag).replace(/^\w/, c => c.toUpperCase());
  function textNode(o, cs, id, p, i, x, y) {
    const fs = pxv(cs.fs) || 16, lh = /px$/.test(cs.lh) ? Math.round((pxv(cs.lh) / fs) * 100) / 100 : 1.3;
    const ff = String(cs.ff || ''), font = (FONTS.find(([rx]) => rx.test(ff)) || [0, 'Inter'])[1];
    const al = { start: 'left', left: 'left', center: 'center', right: 'right', end: 'right', justify: 'left' }[cs.ta] || 'left';
    return { id, t: 'text', p, i, x: Math.round(x), y: Math.round(y), w: Math.ceil(o.w) + 1, h: Math.ceil(o.h), name: nameOf(o), sz: { h: 'fixed', v: 'hug' },
      tx: { c: o.text, f: font, s: Math.round(fs), wt: Math.round(pxv(cs.fwt) / 100) * 100 || 400, lh: Math.max(0.8, Math.min(3, lh)), al, col: colorOf(cs.c).slice(0, 7) || '#12151A' } };
  }
  // tree: from the preview helper ({ tag, cls, x, y, w, h, cs, text?, kids }) -> canvas nodes (first is the top frame)
  function fromTree(tree, at = { x: 0, y: 0 }) {
    const out = [], rid = E ? E.S.rid : SC.rid;
    function walk(o, p, i, px, py, parentFlex) {
      if (out.length > 400) return;
      const id = rid(), cs = o.cs || {}, x = (o.x - px), y = (o.y - py);
      const fill = colorOf(cs.bg), bw = pxv(cs.bw), stroke = bw && cs.bs !== 'none' ? colorOf(cs.bc) : '';
      const boxy = fill || stroke || pxv(cs.pt) + pxv(cs.pr) + pxv(cs.pb) + pxv(cs.pl) > 0;
      const isText = o.tag === '#text' || (o.text && !o.kids.length);
      if (isText && !boxy) { out.push(textNode(o, cs, id, p, i, parentFlex ? 0 : x, parentFlex ? 0 : y)); return; }
      const flex = /flex$/.test(cs.d || '');
      const n = { id, t: 'frame', p, i, x: Math.round(parentFlex ? 0 : x), y: Math.round(parentFlex ? 0 : y), w: Math.ceil(o.w), h: Math.ceil(o.h), name: nameOf(o), sz: { h: 'fixed', v: 'fixed' } };
      if (fill) n.fill = fill.slice(0, 9);
      if (stroke) { n.stroke = stroke.slice(0, 7); n.sw = Math.min(64, bw); }
      const rad = pxv(cs.br); if (rad) n.r = Math.round(Math.min(rad, 999));
      const op = parseFloat(cs.op); if (op < 1) n.op = Math.round(op * 100) / 100;
      const pad = [pxv(cs.pt), pxv(cs.pr), pxv(cs.pb), pxv(cs.pl)].map(Math.round);
      if (flex || isText) {
        n.lay = { d: isText || String(cs.fd).startsWith('row') ? 'row' : 'col', g: isText ? 0 : Math.round(pxv(cs.g)), p: pad, ai: isText ? 'center' : (AI[cs.ai] || 'stretch'), jc: isText ? (JC[cs.jc] || 'center') : (JC[cs.jc] || 'start'), ...(cs.fw === 'wrap' ? { wr: true } : {}) };
        if (n.lay.ai === 'stretch' && isText) n.lay.ai = 'center';
      }
      out.push(n);
      if (isText) { out.push(textNode(o, cs, rid(), id, 1, 0, 0)); return; }
      (o.kids || []).forEach((k, j) => walk(k, id, j + 1, o.x, o.y, !!n.lay));
    }
    walk(tree, '', 0, tree.x - at.x, tree.y - at.y, false);
    if (out[0]) { out[0].x = Math.round(at.x); out[0].y = Math.round(at.y); out[0].clip = true; if (!out[0].fill) out[0].fill = '#FFFFFF'; }
    return out;
  }
  function serialize() {
    return new Promise(res => {
      const f = document.getElementById('pvw-iframe'); if (!f || !f.contentWindow) return res(null);
      const id = Math.random().toString(36).slice(2);
      const done = v => { removeEventListener('message', on); clearTimeout(tm); res(v); };
      const on = e => { if (e.source === f.contentWindow && e.data && e.data.tc === 'serial' && e.data.id === id) done(e.data.tree || null); };
      const tm = setTimeout(() => done(null), 2500);
      addEventListener('message', on);
      f.contentWindow.postMessage({ tc: 'serialize', id }, '*');
    });
  }
  async function openFromPreview() {
    const tree = await serialize();
    if (!tree) { toast(T('Pick something in the preview first')); return null; }
    if (!window.TribeCanvas) return null;
    if (window.TribePreview && window.TribePreview.close) { try { window.TribePreview.close(); } catch {} }   // the editor takes the whole width
    window.TribeCanvas.open();
    for (let k = 0; k < 60 && !(E && E.canEdit && window.TribeCanvas.state().open); k++) await new Promise(r => setTimeout(r, 100));
    if (!E || !E.canEdit) { toast(T('Only builders can add layers')); return null; }
    await new Promise(r => setTimeout(r, 150));
    const roots = E.S.roots().map(n => E.wbox(n.id)).filter(Boolean);
    const x = roots.length ? Math.max(...roots.map(b => b.x + b.w)) + 120 : 0, y = roots.length ? Math.min(...roots.map(b => b.y)) : 0;
    const nodes = fromTree(tree, { x, y });
    const top = E.addNodes(nodes);
    if (top) toast(T('Added to the canvas. Change it, then Send to app'));
    return top;
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-open-canvas]'); if (b) { e.preventDefault(); openFromPreview(); } });

  window.TribeCanvasCode = { mount, render, send, exportData, openFromPreview, fromTree, comment, commenting: () => commenting, links: () => ({ ...links }), setTab };
})();
