// Design canvas: the left panel (P1-B/P1-D). Layers: the tree, top layer first, with drag to reorder or nest,
// double-click to rename, and lock / hide. Assets: the file's components, to place copies (instances).
//   window.TribeCanvasPanels.layers = { mount(el, E), render(), rename(id) }
(function () {
  'use strict';
  const P = window.TribeCanvasPanels = window.TribeCanvasPanels || {};
  let root = null, E = null, tab = 'layers', open = new Set(), renaming = null, drag = null, q = '';
  const ICON = {
    frame: '<path d="M6 3v14M14 3v14M3 6h14M3 14h14"/>', component: '<path d="M10 2.5l3 3-3 3-3-3zM10 11.5l3 3-3 3-3-3zM5.5 7l3 3-3 3-3-3zM14.5 7l3 3-3 3-3-3z"/>',
    instance: '<path d="M10 3l7 7-7 7-7-7z"/>', rect: '<rect x="4" y="5" width="12" height="10" rx="1"/>', ellipse: '<circle cx="10" cy="10" r="6"/>',
    text: '<path d="M5 5h10M10 5v10"/>', group: '<rect x="3.5" y="3.5" width="13" height="13" rx="1" stroke-dasharray="2 2"/>',
    row: '<path d="M4 6v8M10 6v8M16 6v8"/>', col: '<path d="M6 4h8M6 10h8M6 16h8"/>',
    eye: '<path d="M2.5 10s3-5.5 7.5-5.5S17.5 10 17.5 10s-3 5.5-7.5 5.5S2.5 10 2.5 10z"/><circle cx="10" cy="10" r="2.2"/>',
    eyeoff: '<path d="M3 3l14 14M8 5a8 8 0 012-.5c4.5 0 7.5 5.5 7.5 5.5a14 14 0 01-2.2 2.8M5.3 7.3A13 13 0 002.5 10s3 5.5 7.5 5.5a7.6 7.6 0 003-.6"/>',
    lock: '<rect x="5" y="9" width="10" height="7.5" rx="1.5"/><path d="M7 9V7a3 3 0 016 0v2"/>', unlock: '<rect x="5" y="9" width="10" height="7.5" rx="1.5"/><path d="M7 9V7a3 3 0 015.6-1.5"/>',
    caret: '<path d="M7 5l6 5-6 5z"/>', plus: '<path d="M5 10h10M10 5v10"/>',
  };
  const ico = (k, cls = '') => `<svg class="cv-li ${cls}" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">${ICON[k]}</svg>`;
  const kindIcon = n => n.t === 'frame' && n.lay ? (n.lay.d === 'row' ? 'row' : 'col') : (ICON[n.t] ? n.t : 'rect');

  function mount(el, editor) {
    root = el; E = editor;
    root.innerHTML = `<div class="cv-ltabs" role="tablist">
        <button role="tab" data-tab="layers" class="on">${E.esc(E.T('Layers'))}</button>
        <button role="tab" data-tab="assets">${E.esc(E.T('Assets'))}</button>
      </div>
      <div class="cv-lbody" id="cv-lbody"></div>`;
    root.querySelector('.cv-ltabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; root.querySelectorAll('.cv-ltabs button').forEach(x => x.classList.toggle('on', x === b)); render(); };
    const body = root.querySelector('#cv-lbody');
    body.addEventListener('click', onClick);
    body.addEventListener('dblclick', e => { const r = e.target.closest('[data-row]'); if (r && !e.target.closest('button')) rename(r.dataset.row); });
    body.addEventListener('dragstart', e => { const r = e.target.closest('[data-row]'); if (!r || !E.canEdit) return; drag = r.dataset.row; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag); } catch {} });
    body.addEventListener('dragover', onOver);
    body.addEventListener('dragleave', () => clearMarks());
    body.addEventListener('drop', onDrop);
    body.addEventListener('dragend', () => { drag = null; clearMarks(); });
    body.addEventListener('input', e => { if (e.target.id === 'cv-asearch') { q = e.target.value.toLowerCase(); drawAssets(true); } });
  }

  // ---------- layers ----------
  function rowHTML(n, depth, inst) {
    const S = E.S, sel = E.sel.includes(n.id) && !inst, kids = inst ? S.kids(n.id) : (n.t === 'instance' ? S.kids(n.comp) : S.kids(n.id));
    const isOpen = open.has(inst ? inst + '/' + n.id : n.id);
    const look = inst ? S.resolved(n, S.get(inst)) : n;
    const innerSel = inst && E.inner && E.inner.inst === inst && E.inner.src === n.id;
    const name = renaming === n.id ? `<input class="cv-rename" id="cv-rename" value="${E.esc(n.name || '')}" maxlength="80" aria-label="${E.esc(E.T('Layer name'))}">` : `<span class="cv-lname">${E.esc(n.name || n.t)}</span>`;
    const cls = ['cv-row', sel ? 'on' : '', innerSel ? 'on inner' : '', look.hide ? 'hidden-l' : '', n.lock ? 'locked' : '', inst ? 'cv-sub' : '', `t-${n.t}`].filter(Boolean).join(' ');
    const attrs = inst ? `data-inst="${E.esc(inst)}" data-src="${E.esc(n.id)}"` : `data-row="${E.esc(n.id)}" draggable="${E.canEdit ? 'true' : 'false'}"`;
    const out = [`<div class="${cls}" ${attrs} style="--d:${depth}" role="treeitem" aria-selected="${sel ? 'true' : 'false'}"${kids.length ? ` aria-expanded="${isOpen}"` : ''}>
      <button class="cv-caret${kids.length ? '' : ' none'}${isOpen ? ' open' : ''}" data-caret="${E.esc(inst ? inst + '/' + n.id : n.id)}" tabindex="-1" aria-label="${E.esc(E.T('Show inside'))}">${kids.length ? ico('caret') : ''}</button>
      ${ico(kindIcon(look), 'k')}${name}
      ${inst ? '' : `<span class="cv-lacts">
        <button class="cv-lbtn${n.lock ? ' set' : ''}" data-lock="${E.esc(n.id)}" title="${E.esc(n.lock ? E.T('Unlock') : E.T('Lock'))}" aria-label="${E.esc(n.lock ? E.T('Unlock') : E.T('Lock'))}">${ico(n.lock ? 'lock' : 'unlock')}</button>
        <button class="cv-lbtn${n.hide ? ' set' : ''}" data-eye="${E.esc(n.id)}" title="${E.esc(n.hide ? E.T('Show') : E.T('Hide'))}" aria-label="${E.esc(n.hide ? E.T('Show') : E.T('Hide'))}">${ico(n.hide ? 'eyeoff' : 'eye')}</button>
      </span>`}
    </div>`];
    if (kids.length && isOpen) { const sub = inst || (n.t === 'instance' ? n.id : null); [...kids].reverse().forEach(k => out.push(rowHTML(k, depth + 1, sub))); }
    return out.join('');
  }
  function drawLayers() {
    const body = root.querySelector('#cv-lbody'); const S = E.S;
    // open the path to whatever is selected
    for (const id of E.sel) { let n = S.get(id), k = 0; while (n && n.p && k++ < 100) { open.add(n.p); n = S.get(n.p); } }
    if (E.inner) {   // open the path inside the instance too
      open.add(E.inner.inst);
      const inst = S.get(E.inner.inst); let n = S.get(E.inner.src), k = 0;
      while (n && inst && n.p && n.p !== inst.comp && k++ < 100) { open.add(E.inner.inst + '/' + n.p); n = S.get(n.p); }
    }
    const roots = [...S.roots()].reverse();
    body.innerHTML = roots.length ? `<div class="cv-tree" role="tree" aria-label="${E.esc(E.T('Layers'))}">${roots.map(n => rowHTML(n, 0, null)).join('')}</div>`
      : `<p class="cv-lempty">${E.esc(E.T('Layers you draw show up here.'))}</p>`;
    const inp = body.querySelector('#cv-rename');
    if (inp) {
      inp.focus(); inp.select();
      const done = ok => { const id = renaming; renaming = null; if (ok && inp.value.trim()) E.rename(id, inp.value.trim()); else render(); E.focus(); };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
      inp.onblur = () => { if (renaming) done(true); };
    }
    const on = body.querySelector('.cv-row.on'); if (on && !inp) { const r = on.getBoundingClientRect(), b = body.getBoundingClientRect(); if (r.top < b.top || r.bottom > b.bottom) on.scrollIntoView({ block: 'nearest' }); }
  }
  function onClick(e) {
    const S = E.S;
    const c = e.target.closest('[data-caret]'); if (c) { const k = c.dataset.caret; if (open.has(k)) open.delete(k); else open.add(k); render(); return; }
    const l = e.target.closest('[data-lock]'); if (l) { E.toggle(l.dataset.lock, 'lock'); return; }
    const v = e.target.closest('[data-eye]'); if (v) { E.toggle(v.dataset.eye, 'hide'); return; }
    const ins = e.target.closest('[data-insert]'); if (ins) { E.insertInstance(ins.dataset.insert); return; }
    const gm = e.target.closest('[data-main]'); if (gm) { E.goToMain(gm.dataset.main); return; }
    const sub = e.target.closest('[data-inst]'); if (sub) { E.selectInner(sub.dataset.inst, sub.dataset.src); return; }
    const r = e.target.closest('[data-row]'); if (!r || renaming) return;
    const id = r.dataset.row;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { const cur = E.sel; E.select(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]); }
    else E.select([id]);
    void S;
  }
  function clearMarks() { root.querySelectorAll('.cv-row.drop-before,.cv-row.drop-after,.cv-row.drop-in').forEach(r => r.classList.remove('drop-before', 'drop-after', 'drop-in')); }
  function where(e) {
    const r = e.target.closest('[data-row]'); if (!r || !drag || r.dataset.row === drag) return null;
    const n = E.S.get(r.dataset.row); if (!n || E.S.isAncestor(drag, n.id)) return null;
    const b = r.getBoundingClientRect(), y = (e.clientY - b.top) / b.height;
    const container = n.t === 'frame' || n.t === 'component' || n.t === 'group';
    const pos = container && y > 0.28 && y < 0.72 ? 'in' : y < 0.5 ? 'before' : 'after';
    return { r, n, pos };
  }
  function onOver(e) { const w = where(e); clearMarks(); if (!w) return; e.preventDefault(); w.r.classList.add('drop-' + w.pos); }
  function onDrop(e) {
    const w = where(e); clearMarks(); if (!w) return; e.preventDefault();
    const S = E.S, n = w.n;
    if (w.pos === 'in') { E.move(drag, n.id, null); open.add(n.id); }
    else {
      // the list shows the top layer first: "above" a row means after it in paint order
      const sibs = S.kids(n.p || '').filter(s => s.id !== drag); const k = sibs.findIndex(s => s.id === n.id);
      const before = w.pos === 'before' ? (sibs[k + 1] ? sibs[k + 1].id : null) : n.id;
      E.move(drag, n.p || '', before);
    }
    drag = null;
  }
  function rename(id) { if (!E.canEdit || !E.S.get(id)) return; tab = 'layers'; root.querySelectorAll('.cv-ltabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === 'layers')); renaming = id; render(); }

  // ---------- assets: components ----------
  function drawAssets(keepSearch) {
    const body = root.querySelector('#cv-lbody'); const S = E.S;
    const comps = S.components().filter(c => !q || String(c.name).toLowerCase().includes(q));
    const list = comps.map(c => {
      const n = S.instancesOf(c.id).length;
      return `<div class="cv-asset">
        <span class="cv-aico">${ico('component')}</span>
        <span class="cv-aname"><b>${E.esc(c.name || 'Component')}</b><small>${n === 1 ? E.esc(E.T('1 copy')) : `${n} ${E.esc(E.T('copies'))}`}</small></span>
        <button class="cv-abtn" data-main="${E.esc(c.id)}" title="${E.esc(E.T('Go to main component'))}" aria-label="${E.esc(E.T('Go to main component'))}">${ico('component')}</button>
        <button class="cv-abtn primary" data-insert="${E.esc(c.id)}" ${E.canEdit ? '' : 'disabled'} title="${E.esc(E.T('Place a copy'))}" aria-label="${E.esc(E.T('Place a copy'))}">${ico('plus')}</button>
      </div>`;
    }).join('');
    const listHTML = list || `<p class="cv-lempty">${E.esc(q ? E.T('No components match.') : E.T('No components yet. Select a frame and press Ctrl Alt K.'))}</p>`;
    if (keepSearch && body.querySelector('#cv-alist')) { body.querySelector('#cv-alist').innerHTML = listHTML; return; }
    body.innerHTML = `<div class="cv-asearch"><input id="cv-asearch" type="search" placeholder="${E.esc(E.T('Search components'))}" value="${E.esc(q)}" aria-label="${E.esc(E.T('Search components'))}"></div>
      <p class="cv-lhead">${E.esc(E.T('Components in this file'))}</p><div id="cv-alist">${listHTML}</div>`;
  }

  function render() { if (!root) return; if (tab === 'assets') drawAssets(); else drawLayers(); }
  P.layers = { mount, render, rename };
})();
