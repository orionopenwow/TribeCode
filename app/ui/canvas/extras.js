// Design canvas polish (docs/POLISH-AUDIT.md): the things people expect from a design tool that the core editor left out.
//   - Right-click menu on layers and the empty canvas (copy, paste, duplicate, group, component, auto layout, order,
//     hide/lock, rename, select parent, zoom to selection, frame presets).
//   - Align and distribute for two or more layers (left, centre, right, top, middle, bottom, spread evenly).
//   - Selection colors: every color used inside what's selected, and changing one changes it everywhere in the selection.
//   - Frame presets (phone, tablet, desktop, social, slide) on the empty right panel and the blank-canvas card.
// It only uses the editor API (TribeCanvas._e) and adds sections to the right panel after it renders.
//   window.TribeCanvasExtras = { mount(E), context(x, y), presets, align(kind), replaceColor(from, to) }
(function () {
  'use strict';
  let E = null;
  const T = k => (E ? E.T(k) : k);
  const esc = s => (E ? E.esc(s) : String(s));
  const PRESETS = [
    ['Phone', 393, 852], ['Android', 412, 915], ['Tablet', 820, 1180], ['Laptop', 1280, 832], ['Desktop', 1440, 1024],
    ['Square post', 1080, 1080], ['Story', 1080, 1920], ['Slide', 1920, 1080],
  ];
  const ICON = {
    l: '<path d="M4 3v14M7 6h9M7 12h5" />', ch: '<path d="M10 3v14M5 6h10M7 12h6" />', r: '<path d="M16 3v14M4 6h9M8 12h5" />',
    t: '<path d="M3 4h14M6 7v9M12 7v5" />', cv: '<path d="M3 10h14M6 5v10M12 7v6" />', b: '<path d="M3 16h14M6 4v9M12 8v5" />',
    dh: '<path d="M3 4v12M17 4v12M8 7h4v6H8z" />', dv: '<path d="M4 3h12M4 17h12M7 8v4h6V8z" />',
  };
  const svg = k => `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">${ICON[k]}</svg>`;
  const hex = v => { const m = /^#([0-9a-f]{6})$/i.exec(String(v || '').trim()); return m ? '#' + m[1].toUpperCase() : ''; };

  // ---------- right-click menu ----------
  function context(x, y) {
    if (!E) return;
    const S = E.S, sel = E.sel.map(id => S.get(id)).filter(Boolean), one = sel.length === 1 ? sel[0] : null, ed = E.canEdit;
    const items = [];
    if (sel.length) {
      if (ed) items.push({ label: T('Copy'), key: 'Ctrl C', run: () => E.copy() }, { label: T('Paste'), key: 'Ctrl V', run: () => E.paste() }, { label: T('Duplicate'), key: 'Ctrl D', run: () => E.duplicate() }, { label: T('Delete'), key: 'Del', run: () => E.removeSel() }, '-');
      if (one && one.p) items.push({ label: T('Select parent'), key: 'Esc', run: () => E.select([one.p]) });
      items.push({ label: T('Zoom to selection'), key: 'Shift 2', run: () => E.fit(true) });
      if (ed) {
        items.push('-', { label: T('Group'), key: 'Ctrl G', run: () => E.group() });
        if (one && one.t === 'group') items.push({ label: T('Ungroup'), key: 'Ctrl Shift G', run: () => E.ungroup() });
        if (one && one.t !== 'component' && one.t !== 'instance') items.push({ label: T('Create component'), key: 'Ctrl Alt K', run: () => E.makeComponent() });
        if (one && one.t === 'instance') items.push({ label: T('Go to main component'), run: () => E.goToMain(one.id) }, { label: T('Detach instance'), key: 'Ctrl Alt B', run: () => E.detach(one.id) });
        items.push({ label: T('Add auto layout'), key: 'Shift A', run: () => E.autoLayout() });
        items.push('-', { label: T('Bring to front'), key: 'Ctrl Shift ]', run: () => E.order('front') }, { label: T('Send to back'), key: 'Ctrl Shift [', run: () => E.order('back') });
        items.push('-', { label: one && one.hide ? T('Show') : T('Hide'), key: 'Ctrl Shift H', run: () => E.toggleSel('hide') }, { label: one && one.lock ? T('Unlock') : T('Lock'), key: 'Ctrl Shift L', run: () => E.toggleSel('lock') });
        if (one) items.push({ label: T('Rename'), key: 'Ctrl R', run: () => { const P = window.TribeCanvasPanels; P && P.layers && P.layers.rename(one.id); } });
        if (sel.length > 1) items.push('-', ...ALIGN.map(([k, l, key]) => ({ label: T(l), key, run: () => align(k) })));
      }
      if (one && window.TribeCanvasCode && ['frame', 'component'].includes(one.t) && !one.p) items.push('-', { label: T('Copy as HTML and CSS'), run: () => copyCode(one.id) });
    } else {
      if (ed && E.clip) items.push({ label: T('Paste here'), key: 'Ctrl V', run: () => E.paste() }, '-');
      items.push({ label: T('Zoom to fit'), key: 'Shift 1', run: () => E.fit() }, { label: T('Zoom to 100%'), key: 'Shift 0', run: () => E.zoomTo(1) });
      if (ed) items.push('-', ...PRESETS.slice(0, 5).map(([l, w, h]) => ({ label: `${T('New frame')}: ${T(l)} ${w}×${h}`, run: () => addPreset(l, w, h, x, y) })));
    }
    if (!items.length) return;
    const a = { getBoundingClientRect: () => ({ left: x, bottom: y, top: y, right: x, width: 0, height: 0 }) };
    E.menu(a, items);
    const m = document.getElementById('cv-menu'); if (m) { m.classList.add('cv-ctx'); const cr = document.getElementById('cv').getBoundingClientRect(); const mr = m.getBoundingClientRect(); if (mr.bottom > innerHeight - 8) m.style.top = Math.max(8, y - cr.top - mr.height) + 'px'; }
  }
  async function copyCode(id) {
    const out = E.toHTML(id); if (!out) return;
    try { await navigator.clipboard.writeText(`<style>\n${out.css}\n</style>\n${out.html}`); E.toast(T('Copied the HTML and CSS')); } catch { E.toast(T("Couldn't copy here")); }
  }

  // ---------- frame presets ----------
  function freeSpot(w) {
    const S = E.S; let x = 0, y = 0;
    for (const n of S.roots()) { const b = E.wbox(n.id); if (b) { x = Math.max(x, b.x + b.w + 80); y = Math.min(y, b.y); } }
    return { x: Math.round(x), y: Math.round(y) };
  }
  function addPreset(label, w, h, cx, cy) {
    if (!E || !E.canEdit) return;
    let at = freeSpot(w);
    if (cx != null && E.stage) { const r = E.stage.getBoundingClientRect(), v = E.view; at = { x: Math.round((cx - r.left - v.x) / v.z), y: Math.round((cy - r.top - v.y) / v.z) }; }
    const id = 'f' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
    const names = new Set(E.S.live().map(n => n.name));
    let name = T(label), k = 2; while (names.has(name)) name = `${T(label)} ${k++}`;
    E.insert([{ id, t: 'frame', p: '', i: Date.now(), x: at.x, y: at.y, w, h, fill: '#FFFFFF', name, clip: true }], id);
    E.toast(`${name} · ${w}×${h}`);
  }
  const presetHTML = () => `<section class="cvx-presets"><span class="eyebrow">${esc(T('New frame'))}</span>
    <div class="cvx-plist">${PRESETS.map(([l, w, h]) => `<button class="cvx-preset" data-preset="${esc(l)}" data-w="${w}" data-h="${h}"${E.canEdit ? '' : ' disabled'}><i class="cvx-pico" style="--ar:${w / h}"></i><span><b>${esc(T(l))}</b><small>${w} × ${h}</small></span></button>`).join('')}</div></section>`;

  // ---------- align + distribute ----------
  const ALIGN = [['l', 'Align left', 'Alt A'], ['ch', 'Align horizontal centers', 'Alt H'], ['r', 'Align right', 'Alt D'], ['t', 'Align top', 'Alt W'], ['cv', 'Align vertical centers', 'Alt V'], ['b', 'Align bottom', 'Alt S'], ['dh', 'Distribute horizontal spacing', 'Alt Shift H'], ['dv', 'Distribute vertical spacing', 'Alt Shift V']];
  function movable() {
    const S = E.S;
    return E.sel.map(id => S.get(id)).filter(n => n && !n.lock && !S.inFlow(n));
  }
  function align(kind) {
    if (!E || !E.canEdit) return;
    const ns = movable(); if (ns.length < 2) { E.toast(T('Select two or more layers that are not inside auto layout')); return; }
    const bx = new Map(ns.map(n => [n.id, E.wbox(n.id)]));
    const all = [...bx.values()].filter(Boolean); if (all.length < 2) return;
    const L = Math.min(...all.map(b => b.x)), R = Math.max(...all.map(b => b.x + b.w)), Tp = Math.min(...all.map(b => b.y)), B = Math.max(...all.map(b => b.y + b.h));
    const d = new Map();   // id -> [dx, dy] in world space (same for local, since parents don't scale)
    if (kind === 'dh' || kind === 'dv') {
      const h = kind === 'dh'; const order = [...ns].sort((a, b) => h ? bx.get(a.id).x - bx.get(b.id).x : bx.get(a.id).y - bx.get(b.id).y);
      if (order.length < 3) { E.toast(T('Select three or more layers to spread them evenly')); return; }
      const total = order.reduce((s, n) => s + (h ? bx.get(n.id).w : bx.get(n.id).h), 0);
      const gap = ((h ? R - L : B - Tp) - total) / (order.length - 1);
      let at = h ? L : Tp;
      for (const n of order) { const b = bx.get(n.id); d.set(n.id, h ? [at - b.x, 0] : [0, at - b.y]); at += (h ? b.w : b.h) + gap; }
    } else {
      for (const n of ns) {
        const b = bx.get(n.id); if (!b) continue;
        const dx = kind === 'l' ? L - b.x : kind === 'r' ? R - (b.x + b.w) : kind === 'ch' ? (L + R) / 2 - (b.x + b.w / 2) : 0;
        const dy = kind === 't' ? Tp - b.y : kind === 'b' ? B - (b.y + b.h) : kind === 'cv' ? (Tp + B) / 2 - (b.y + b.h / 2) : 0;
        d.set(n.id, [dx, dy]);
      }
    }
    E.patchMany([...d.keys()], c => { const [dx, dy] = d.get(c.id); c.x = Math.round((c.x || 0) + dx); c.y = Math.round((c.y || 0) + dy); });
  }
  const alignHTML = n => `<section class="cv-ps cvx-align"><header><h4>${esc(T('Align'))}</h4><small class="faint">${esc(T('{n} layers').replace('{n}', n))}</small></header>
    <div class="cvx-abar" role="group" aria-label="${esc(T('Align'))}">${ALIGN.map(([k, l, key]) => `<button class="cvx-ab" data-align="${k}" title="${esc(T(l))} (${key})" aria-label="${esc(T(l))}"${E.canEdit ? '' : ' disabled'}>${svg(k)}</button>`).join('')}</div></section>`;

  // ---------- selection colors ----------
  function colorsIn(ids) {
    const S = E.S, out = new Map();
    const add = (c, id, key) => { const h = hex(c); if (!h) return; if (!out.has(h)) out.set(h, []); out.get(h).push([id, key]); };
    const seen = new Set();
    for (const id of ids) for (const n of [S.get(id), ...S.descendants(id)]) {
      if (!n || seen.has(n.id) || n.t === 'instance') continue; seen.add(n.id);
      add(n.fill, n.id, 'fill'); add(n.stroke, n.id, 'stroke'); if (n.tx) add(n.tx.col, n.id, 'tcol');
    }
    return out;
  }
  function replaceColor(from, to) {
    if (!E || !E.canEdit) return 0;
    from = hex(from); to = hex(to); if (!from || !to || from === to) return 0;
    const uses = colorsIn(E.sel).get(from) || []; if (!uses.length) return 0;
    const ids = [...new Set(uses.map(u => u[0]))];
    E.patchMany(ids, c => { if (hex(c.fill) === from) c.fill = to; if (hex(c.stroke) === from) c.stroke = to; if (c.tx && hex(c.tx.col) === from) c.tx = Object.assign({}, c.tx, { col: to }); });
    return uses.length;
  }
  const colorsHTML = cols => `<section class="cv-ps cvx-colors"><header><h4>${esc(T('Selection colors'))}</h4><small class="faint">${esc(T('Change one to change it everywhere'))}</small></header>
    <div class="cvx-clist">${[...cols.entries()].slice(0, 12).map(([c, uses]) => `<label class="cvx-c" title="${esc(c)} · ${uses.length}"><input type="color" value="${c}" data-from="${c}" aria-label="${esc(c)}"${E.canEdit ? '' : ' disabled'}><i style="--c:${c}"></i><code>${c}</code><small>${uses.length}</small></label>`).join('')}</div></section>`;

  // ---------- add our sections after the right panel renders ----------
  let busy = false;
  function decorate() {
    const root = document.getElementById('cv-props'); if (!root || busy || !E) return;
    busy = true;
    try {
      root.querySelectorAll('.cvx-presets, .cvx-align, .cvx-colors').forEach(x => x.remove());
      if (E.inner) return;
      const S = E.S, sel = E.sel.map(id => S.get(id)).filter(Boolean);
      if (!sel.length) { const host = root.querySelector('.cv-pempty'); if (host) host.insertAdjacentHTML('beforeend', presetHTML()); return; }
      const head = root.querySelector('.cv-ps');
      if (sel.length > 1) { if (head) head.insertAdjacentHTML('beforebegin', alignHTML(sel.length)); else root.insertAdjacentHTML('afterbegin', alignHTML(sel.length)); }
      const cols = colorsIn(E.sel);
      if (cols.size > 1 && (sel.length > 1 || S.kids(sel[0].id).length)) root.insertAdjacentHTML('beforeend', colorsHTML(cols));
    } finally { busy = false; }
  }
  function onClick(e) {
    const p = e.target.closest('[data-preset]'); if (p) { addPreset(p.dataset.preset, +p.dataset.w, +p.dataset.h); return; }
    const a = e.target.closest('[data-align]'); if (a) { align(a.dataset.align); }
  }
  function onChange(e) {
    const i = e.target.closest('.cvx-c input[type=color]'); if (!i) return;
    const n = replaceColor(i.dataset.from, i.value); if (n) E.toast(T('Changed {n} uses').replace('{n}', n));
  }

  function mount(editor) {
    E = editor;
    const root = document.getElementById('cv-props');
    if (root) {
      // re-add our sections when the panel re-renders, but not for our own insertions (that would loop forever)
      const ours = n => n.nodeType !== 1 || (n.classList && [...n.classList].some(c => c.startsWith('cvx-')));
      new MutationObserver(list => { if (busy) return; if (list.every(m => [...m.addedNodes, ...m.removedNodes].every(ours))) return; decorate(); }).observe(root, { childList: true });
      root.addEventListener('click', onClick); root.addEventListener('change', onChange);
      decorate();
    }
    // right-click a row in the layers panel: same menu
    const left = document.getElementById('cv-left');
    if (left) left.addEventListener('contextmenu', e => {
      const r = e.target.closest('[data-row]'); if (!r) return; e.preventDefault();
      if (!E.sel.includes(r.dataset.row)) E.select([r.dataset.row]);
      context(e.clientX, e.clientY);
    });
    // blank-canvas card: presets as one row of quick starts
    const empty = document.getElementById('cv-empty');
    if (empty && !empty.querySelector('.cvx-quick')) {
      const card = empty.querySelector('div') || empty;
      card.insertAdjacentHTML('beforeend', `<div class="cvx-quick" role="group" aria-label="${esc(T('New frame'))}">${[PRESETS[0], PRESETS[2], PRESETS[4]].map(([l, w, h]) => `<button class="cvx-qb" data-preset="${esc(l)}" data-w="${w}" data-h="${h}">${esc(T(l))}</button>`).join('')}</div>`);
      empty.addEventListener('click', e => { const p = e.target.closest('[data-preset]'); if (p) { e.stopPropagation(); addPreset(p.dataset.preset, +p.dataset.w, +p.dataset.h); } });
    }
  }
  // Alt shortcuts for aligning, like other design tools: Alt A / D left, right; Alt W / S top, bottom; Alt H / V centres;
  // Alt Shift H / V spread evenly.
  const AKEY = { a: 'l', d: 'r', w: 't', s: 'b', h: 'ch', v: 'cv' };
  addEventListener('keydown', e => {
    if (!E || !e.altKey || e.ctrlKey || e.metaKey) return;
    if (!window.TribeCanvas || !window.TribeCanvas.state || !window.TribeCanvas.state().open) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (E.sel.length < 2) return;
    const k = (e.code || '').replace(/^Key/, '').toLowerCase();
    const kind = e.shiftKey ? (k === 'h' ? 'dh' : k === 'v' ? 'dv' : null) : AKEY[k];
    if (!kind) return;
    e.preventDefault(); e.stopPropagation(); align(kind);
  }, true);

  window.TribeCanvasExtras = { mount, context, align, replaceColor, presets: PRESETS, addPreset };
})();
