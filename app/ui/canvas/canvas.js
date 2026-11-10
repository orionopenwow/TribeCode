// Design canvas (P1-A, #/canvas): a Figma-class editor for the project. Layers are real DOM elements inside a
// transformed stage, so text stays text and every layer renders with the exact CSS it exports (scene.js styleOf).
// Live for everyone in the project (server/canvas.js, WebSocket 'cnv-*'); undo is per person.
//   Tools: Move (V), Frame (F), Rectangle (R), Ellipse (O), Text (T), Scale (K).
//   Keys: Ctrl G group · Ctrl Shift G ungroup · Ctrl Alt K component · Shift A auto layout · Ctrl D duplicate ·
//         arrows nudge (Shift = 10) · Ctrl Z / Ctrl Shift Z undo/redo · Ctrl ] [ order · Ctrl Shift H hide ·
//         Ctrl Shift L lock · Shift 1 fit · Shift 2 selection · Ctrl 0 100% · Enter children / edit text · Esc parent.
//   Pan: Space + drag, middle mouse, scroll. Zoom: Ctrl + scroll, pinch.
// Panels: app/ui/canvas/layers.js (layers + assets) and app/ui/canvas/props.js (properties, auto layout, components).
//   window.TribeCanvas = { open(fileId?), close(), state(), exportFrame(id), insertSample() }
(function () {
  'use strict';
  const C = window.TribeClient;
  const SC = window.TribeCanvasScene;
  const NAME = 'canvas';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const T = (k, f) => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(k, f || k) : (f || k));
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const pid = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C.project && C.project()) || '';
  const me = () => (C.state && C.state().me) || {};
  const clone = SC.clone;
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  const ICON = {
    move: '<path d="M5 3l11 6.5-4.8 1.3L9 16z"/>',
    frame: '<path d="M6 3v14M14 3v14M3 6h14M3 14h14"/>',
    rect: '<rect x="3.5" y="4.5" width="13" height="11" rx="1"/>',
    ellipse: '<circle cx="10" cy="10" r="6.5"/>',
    text: '<path d="M4.5 5h11M10 5v11M7.5 16h5"/>',
    scale: '<path d="M4 16L16 4M10 4h6v6M4 10v6h6"/>',
    undo: '<path d="M7 7H4V4"/><path d="M4.5 7A6 6 0 1110 16"/>',
    redo: '<path d="M13 7h3V4"/><path d="M15.5 7A6 6 0 1010 16"/>',
    down: '<path d="M6 8l4 4 4-4"/>', layers: '<path d="M10 3l7 4-7 4-7-4z"/><path d="M3 11l7 4 7-4"/>', sliders: '<path d="M4 6h12M4 14h12"/><circle cx="8" cy="6" r="1.8"/><circle cx="13" cy="14" r="1.8"/>',
    plus: '<path d="M5 10h10M10 5v10"/>', minus: '<path d="M5 10h10"/>',
    comment: '<path d="M4 4.5h12v8.5H9l-3.5 3v-3H4z"/>', export: '<path d="M10 3v9M6.5 6.5L10 3l3.5 3.5"/><path d="M4 12v4h12v-4"/>',
  };
  const svg = (k, sz = 20) => `<svg class="cv-i" width="${sz}" height="${sz}" viewBox="0 0 20 20" aria-hidden="true">${ICON[k]}</svg>`;
  const TOOLS = [['move', 'Move', 'V'], ['frame', 'Frame', 'F'], ['rect', 'Rectangle', 'R'], ['ellipse', 'Ellipse', 'O'], ['text', 'Text', 'T'], ['scale', 'Scale', 'K']];
  const KEYTOOL = { v: 'move', f: 'frame', a: 'frame', r: 'rect', o: 'ellipse', t: 'text', k: 'scale' };

  // ---------- state ----------
  const S = SC.create();
  let open = false, built = false, fileId = 'main', fileName = 'Design', files = [], canEdit = false, loadedFor = '';
  let view = { x: 80, y: 60, z: 1 };
  let tool = 'move';
  let sel = [];                  // selected node ids
  let inner = null;              // { inst, src } a layer inside an instance (for overrides)
  let undo = [], redo = [];
  let gesture = null, spaceDown = false, editing = null, hoverId = null;
  let clip = null;               // in-app clipboard: [nodes]
  const peers = new Map();
  const touches = new Map(); let pinch = null;
  let stage = null, world = null, ov = null;

  const section = () => document.getElementById('view-' + NAME);
  const viewKey = () => `tribecode.canvas.view:${pid()}:${fileId}`;
  // element and box caches: rebuilt after every render, so panning and zooming never touch the DOM tree
  const elMap = new Map(), boxCache = new Map();
  function reindex() { elMap.clear(); boxCache.clear(); if (world) world.querySelectorAll('[data-id]').forEach(el => elMap.set(el.dataset.id, el)); }
  const elOf = id => { let el = elMap.get(id); if (!el || !el.isConnected) { el = world && world.querySelector(`[data-id="${CSS.escape(id)}"]`); if (el) elMap.set(id, el); } return el; };
  let srCache = null, srAt = 0;
  const stageRect = () => { const now = performance.now(); if (!srCache || now - srAt > 250) { srCache = stage.getBoundingClientRect(); srAt = now; } return srCache; };
  addEventListener('resize', () => { srCache = null; boxCache.clear(); });
  const toWorld = (cx, cy) => { const r = stageRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; };
  // a node's box in world units, from the DOM (so auto layout positions are exact)
  function wbox(id) {
    const c = boxCache.get(id); if (c) return { ...c };
    const el = elOf(id); if (!el) return null;
    const r = el.getBoundingClientRect(), s = stageRect();
    const b = { x: (r.left - s.left - view.x) / view.z, y: (r.top - s.top - view.y) / view.z, w: r.width / view.z, h: r.height / view.z };
    boxCache.set(id, b); return { ...b };
  }
  // where a container's absolutely placed children start (inside its border), in world units
  function origin(pidv) {
    if (!pidv) return { x: 0, y: 0 };
    const b = wbox(pidv), n = S.get(pidv); if (!b) return { x: 0, y: 0 };
    const bw = n && n.stroke && n.sw ? n.sw : 0;
    return { x: b.x + bw, y: b.y + bw };
  }

  // ---------- mounting ----------
  function ensureSection() {
    let sec = section(); if (sec) return sec;
    const main = $('#main') || $('.main'); if (!main) return null;
    sec = document.createElement('section'); sec.id = 'view-' + NAME; sec.className = 'hidden'; main.appendChild(sec);
    return sec;
  }
  function show(id) {
    const sec = ensureSection(); if (!sec) return;
    if (id && id !== fileId) { fileId = id; loadedFor = ''; }
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = T('Design');
    if (location.hash !== '#/' + NAME) history.replaceState(null, '', location.pathname + location.search + '#/' + NAME);
    try { C.sendActivity && C.sendActivity('Design'); } catch {}
    if (!built) build();
    fitRack(); setTimeout(fitRack, 400);
    srCache = null;
    load();
  }
  function hide() {
    const sec = section(); if (sec) sec.classList.add('hidden');
    if (open) { commitEdit(); C.send({ type: 'cnv-leave', file: fileId }); }
    open = false;
    if (location.hash === '#/' + NAME) history.replaceState(null, '', location.pathname + location.search);
  }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  const fromHash = () => { if (location.hash === '#/' + NAME && !open && C.hasToken && C.hasToken()) show(); };
  addEventListener('hashchange', fromHash);
  addEventListener('resize', () => { if (open) { fitRack(); paintOv(); } });
  // phones: the bottom rack floats over the page; keep the stage (and its toolbar) above it
  function fitRack() {
    const cv = $('#cv'); if (!cv) return;
    let under = 0;
    if (isPhone()) for (const rack of document.querySelectorAll('#tabbar, .m2-homebar, .m2-rack')) {
      const cs = getComputedStyle(rack); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rr = rack.getBoundingClientRect(); if (rr.height && rr.top > innerHeight / 2) under = Math.max(under, Math.round(innerHeight - rr.top));
    }
    if (cv.style.paddingBottom !== under + 'px') { cv.style.paddingBottom = under + 'px'; srCache = null; boxCache.clear(); }
  }

  function build() {
    const sec = ensureSection(); built = true;
    sec.innerHTML = `<div class="cv" id="cv">
      <header class="cv-head">
        <div class="cv-title"><span class="eyebrow">${esc(T('Design'))}</span>
          <button class="cv-file" id="cv-file" aria-haspopup="menu" title="${esc(T('Design files'))}"><span id="cv-file-t">Design</span>${svg('down', 16)}</button></div>
        <div class="cv-peers" id="cv-peers" aria-label="${esc(T('Here now'))}"></div>
        <span class="cv-ro" id="cv-ro" hidden>${esc(T('View only'))}</span>
        <div class="cv-head-acts">
          <button class="cv-hbtn cv-phone" id="cv-show-layers" aria-label="${esc(T('Layers'))}">${svg('layers', 18)}</button>
          <button class="cv-hbtn cv-phone" id="cv-show-props" aria-label="${esc(T('Design'))}">${svg('sliders', 18)}</button>
          <button class="cv-hbtn" id="cv-comment" aria-pressed="false" title="${esc(T('Comment'))} (C)" aria-label="${esc(T('Comment'))}">${svg('comment', 18)}</button>
          <button class="cv-hbtn" id="cv-export" aria-haspopup="menu" title="${esc(T('Export'))}" aria-label="${esc(T('Export'))}">${svg('export', 18)}</button>
          <button class="btn primary cv-send" id="cv-send" disabled title="${esc(T('Send the selected frame to the app as HTML and CSS'))}">${esc(T('Send to app'))}</button>
          <button class="cv-zoom" id="cv-zoom" aria-haspopup="menu" title="${esc(T('Zoom'))}"><span id="cv-zoom-t">100%</span>${svg('down', 14)}</button>
        </div>
      </header>
      <div class="cv-body">
        <aside class="cv-left" id="cv-left" aria-label="${esc(T('Layers'))}"></aside>
        <div class="cv-stage" id="cv-stage" tabindex="0" aria-label="${esc(T('Design canvas'))}">
          <div class="cv-world" id="cv-world"></div>
          <div class="cv-ov" id="cv-ov" aria-hidden="true"></div>
          <div class="cv-empty" id="cv-empty" hidden>
            <span class="eyebrow">${esc(T('A blank canvas'))}</span>
            <b>${esc(T('Draw a frame to start'))}</b>
            <span>${esc(T('Press F and drag, or start from a sample screen with components and auto layout.'))}</span>
            <button class="btn primary" id="cv-sample">${esc(T('Start from a sample'))}</button>
          </div>
          <nav class="cv-tools" id="cv-tools" aria-label="${esc(T('Tools'))}">
            ${TOOLS.map(([k, l, key]) => `<button class="cv-tool" data-tool="${k}" id="cv-t-${k}" title="${esc(T(l))} (${key})" aria-label="${esc(T(l))}">${svg(k)}</button>`).join('')}
            <span class="cv-sep"></span>
            <button class="cv-tool" id="cv-undo" title="${esc(T('Undo'))} (Ctrl Z)" aria-label="${esc(T('Undo'))}">${svg('undo')}</button>
            <button class="cv-tool" id="cv-redo" title="${esc(T('Redo'))} (Ctrl Shift Z)" aria-label="${esc(T('Redo'))}">${svg('redo')}</button>
          </nav>
        </div>
        <aside class="cv-right" id="cv-right" aria-label="${esc(T('Design'))}">
          <div class="cv-rtabs" role="tablist"><button role="tab" class="on" aria-selected="true" data-rtab="design">${esc(T('Design'))}</button><button role="tab" aria-selected="false" data-rtab="inspect">${esc(T('Inspect'))}</button></div>
          <div class="cv-rpane" id="cv-props"></div>
          <div class="cv-rpane" id="cv-inspect" hidden></div>
        </aside>
      </div>
      <div class="cv-menu" id="cv-menu" role="menu" hidden></div>
    </div>`;
    stage = $('#cv-stage'); world = $('#cv-world'); ov = $('#cv-ov');
    const P = window.TribeCanvasPanels || {};
    if (P.layers) P.layers.mount($('#cv-left'), E);
    if (P.props) P.props.mount($('#cv-props'), E);
    if (window.TribeCanvasCode) window.TribeCanvasCode.mount(E);
    if (window.TribeCanvasFlint) window.TribeCanvasFlint.mount(E);   // P1-F: Flint's prompt bar (app/ui/canvas/flint.js)
    $('#cv-tools').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) setTool(b.dataset.tool);
      else if (b.id === 'cv-undo') travel(undo, redo);
      else if (b.id === 'cv-redo') travel(redo, undo);
    });
    $('#cv-sample').onclick = () => insertSample();
    $('#cv-file').onclick = e => fileMenu(e.currentTarget);
    $('#cv-zoom').onclick = e => zoomMenu(e.currentTarget);
    $('#cv-show-layers').onclick = () => sheet('left');
    $('#cv-show-props').onclick = () => sheet('right');
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('pointerleave', () => { hoverId = null; paintOv(); C.send({ type: 'cnv-cursor', file: fileId, x: 1e6, y: 1e6 }); });
    stage.addEventListener('dblclick', onDbl);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerdown', e => { const m = $('#cv-menu'); if (m && !m.hidden && !m.contains(e.target) && !e.target.closest('#cv-file,#cv-zoom')) m.hidden = true; });
  }
  function sheet(side) {
    srCache = null;
    const cv = $('#cv'); const cls = side === 'left' ? 'sheet-left' : 'sheet-right';
    const on = !cv.classList.contains(cls);
    cv.classList.remove('sheet-left', 'sheet-right'); if (on) cv.classList.add(cls);
  }

  // ---------- loading ----------
  async function load() {
    const key = pid() + '/' + fileId; if (loadedFor === key) { renderAll(); return; }
    loadedFor = key;
    try {
      const r = await C.api('/canvas/' + encodeURIComponent(fileId));
      S.reset();
      for (const n of Object.values(r.file.nodes || {})) S.nodes.set(n.id, n);
      fileName = r.file.name; canEdit = !!r.canEdit;
      undo = []; redo = []; sel = []; inner = null; peers.clear();
      let v = null; try { v = JSON.parse(ls.get(viewKey()) || 'null'); } catch {}
      if (v && Number.isFinite(v.z)) view = v; else view = { x: 80, y: 60, z: 1 };
    } catch (e) {
      if (e.status === 404 && fileId !== 'main') { fileId = 'main'; loadedFor = ''; return load(); }
      toast(e.message); return;
    }
    $('#cv-file-t').textContent = fileName;
    $('#cv-ro').hidden = canEdit;
    $('#cv').classList.toggle('ro', !canEdit);
    if (!canEdit) setTool('move');
    renderAll();
    if (!localStorageView()) requestAnimationFrame(() => fit());
    loadFiles();
  }
  const localStorageView = () => !!ls.get(viewKey());
  async function loadFiles() { try { files = (await C.api('/canvas')).files || []; } catch {} }
  let saveViewT = null;
  const saveView = () => { clearTimeout(saveViewT); saveViewT = setTimeout(() => ls.set(viewKey(), JSON.stringify(view)), 300); };

  // ---------- rendering: every layer is a div with its export CSS ----------
  function nodeHTML(n, parentLook, inst, depth) {
    const look = n.t === 'instance' ? S.instanceLook(n) : (inst ? S.resolved(n, inst) : n);
    if (!look) return '';
    const st = SC.styleOf(look, parentLook);
    const kind = look.t;
    const attrs = inst ? `data-inst="${esc(inst.id)}" data-src="${esc(n.id)}"` : `data-id="${esc(n.id)}"`;
    const cls = `cv-n cv-${kind}${n.t === 'instance' ? ' cv-instance' : ''}${look.lock ? ' locked' : ''}`;
    if (kind === 'text') return `<div class="${cls}" ${attrs} style="${esc(SC.cssText(st))}">${esc(look.tx ? look.tx.c : '')}</div>`;
    const kids = n.t === 'instance' ? S.kids(n.comp) : S.kids(n.id);
    const nextInst = n.t === 'instance' ? n : inst;
    if (depth > 40) return '';
    return `<div class="${cls}" ${attrs} style="${esc(SC.cssText(st))}">${kids.map(k => nodeHTML(k, look, nextInst, depth + 1)).join('')}</div>`;
  }
  let renderQ = false;
  function renderAll() {
    if (!world) return;
    if (editing) { renderQ = true; return; }   // wait until the text you're typing is saved
    renderQ = false;
    world.innerHTML = S.roots().map(n => nodeHTML(n, null, null, 0)).join('');
    reindex();
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    sel = sel.filter(id => S.get(id));
    if (inner && !S.get(inner.inst)) inner = null;
    $('#cv-empty').hidden = S.live().length > 0;
    paintOv(); panels();
  }
  let panelsQ = 0;
  function panels() {
    if (panelsQ) return;
    panelsQ = requestAnimationFrame(() => {
      panelsQ = 0;
      const P = window.TribeCanvasPanels || {};
      try { P.layers && P.layers.render(); } catch (e) { console.error(e); }
      try { P.props && P.props.render(); } catch (e) { console.error(e); }
      try { window.TribeCanvasCode && window.TribeCanvasCode.render(); } catch (e) { console.error(e); }
      const u = $('#cv-undo'), r = $('#cv-redo'); if (u) u.disabled = !undo.length; if (r) r.disabled = !redo.length;
    });
  }
  // Panning and zooming only move two layers (the world and the overlay); the overlay is redrawn once the view rests,
  // so a file with thousands of layers still pans at full frame rate.
  let ovView = null, ovT = null;
  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    const zt = $('#cv-zoom-t'), zs = Math.round(view.z * 100) + '%'; if (zt && zt.textContent !== zs) zt.textContent = zs;
    if (ovView && (!gesture || gesture.kind === 'pan')) {
      const f = view.z / ovView.z;
      ov.style.transform = `translate(${view.x - ovView.x * f}px, ${view.y - ovView.y * f}px) scale(${f})`;
      clearTimeout(ovT); ovT = setTimeout(() => paintOv(), 90);
    } else paintOv();
    saveView();
  }

  // ---------- the overlay: selection, handles, guides, frame names, cursors ----------
  let guides = [], distances = [], marquee = null, dropLine = null;
  function paintOv() {
    if (!ov) return;
    clearTimeout(ovT); ovView = { ...view }; ov.style.transform = '';
    const zt = $('#cv-zoom-t'), zs = Math.round(view.z * 100) + '%'; if (zt && zt.textContent !== zs) zt.textContent = zs;
    const s = stageRect(), out = [];
    const scr = b => ({ x: b.x * view.z + view.x, y: b.y * view.z + view.y, w: b.w * view.z, h: b.h * view.z });
    // frame names above top-level frames
    for (const n of S.roots()) {
      if (!['frame', 'component', 'instance'].includes(n.t) || n.hide) continue;
      const b = wbox(n.id); if (!b) continue; const q = scr(b);
      if (q.x > s.width || q.y > s.height || q.x + q.w < 0 || q.y < -20) continue;
      const comp = n.t === 'component' ? ' comp' : n.t === 'instance' ? ' inst' : '';
      out.push(`<div class="cv-fname${comp}${sel.includes(n.id) ? ' on' : ''}" data-fname="${esc(n.id)}" style="left:${q.x}px;top:${q.y - 20}px;max-width:${Math.max(40, q.w)}px">${n.t === 'component' ? '◇ ' : n.t === 'instance' ? '◆ ' : ''}${esc(n.name || 'Frame')}</div>`);
    }
    // hover
    if (hoverId && !sel.includes(hoverId) && !gesture) { const b = wbox(hoverId); if (b) { const q = scr(b); out.push(`<div class="cv-hover" style="left:${q.x}px;top:${q.y}px;width:${q.w}px;height:${q.h}px"></div>`); } }
    // inner selection (inside an instance)
    if (inner) {
      const el = world.querySelector(`[data-inst="${CSS.escape(inner.inst)}"][data-src="${CSS.escape(inner.src)}"]`);
      if (el) { const r = el.getBoundingClientRect(); out.push(`<div class="cv-sel inner" style="left:${r.left - s.left}px;top:${r.top - s.top}px;width:${r.width}px;height:${r.height}px"></div>`); }
    }
    // selection
    if (sel.length) {
      const boxes = sel.map(wbox).filter(Boolean);
      boxes.forEach(b => { const q = scr(b); out.push(`<div class="cv-sel${sel.length > 1 ? ' multi' : ''}" style="left:${q.x}px;top:${q.y}px;width:${q.w}px;height:${q.h}px"></div>`); });
      const u = union(boxes);
      if (u && !inner) {
        const q = scr(u);
        if (sel.length > 1) out.push(`<div class="cv-sel" style="left:${q.x}px;top:${q.y}px;width:${q.w}px;height:${q.h}px"></div>`);
        const locked = sel.some(id => (S.get(id) || {}).lock);
        if (canEdit && !locked && !editing) for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
          const hx = h.includes('w') ? q.x : h.includes('e') ? q.x + q.w : q.x + q.w / 2;
          const hy = h.includes('n') ? q.y : h.includes('s') ? q.y + q.h : q.y + q.h / 2;
          out.push(`<div class="cv-h cv-h-${h}" data-h="${h}" style="left:${hx}px;top:${hy}px"></div>`);
        }
        const n0 = S.get(sel[0]);
        const label = `${Math.round(u.w)} × ${Math.round(u.h)}${sel.length === 1 && n0 && n0.sz && (n0.sz.h === 'hug' || n0.sz.v === 'hug') ? ' Hug' : ''}`;
        out.push(`<div class="cv-size" style="left:${q.x + q.w / 2}px;top:${q.y + q.h + 8}px">${esc(label)}</div>`);
      }
    }
    // smart guides + distances while dragging
    for (const g of guides) {
      if (g.axis === 'x') { const x = g.v * view.z + view.x, y1 = g.a * view.z + view.y, y2 = g.b * view.z + view.y; out.push(`<div class="cv-guide v" style="left:${x}px;top:${y1}px;height:${y2 - y1}px"></div>`); }
      else { const y = g.v * view.z + view.y, x1 = g.a * view.z + view.x, x2 = g.b * view.z + view.x; out.push(`<div class="cv-guide h" style="top:${y}px;left:${x1}px;width:${x2 - x1}px"></div>`); }
    }
    for (const d of distances) {
      const x1 = d.x1 * view.z + view.x, y1 = d.y1 * view.z + view.y, x2 = d.x2 * view.z + view.x, y2 = d.y2 * view.z + view.y;
      if (d.axis === 'x') out.push(`<div class="cv-dist h" style="left:${x1}px;top:${y1}px;width:${x2 - x1}px"></div><div class="cv-dlab" style="left:${(x1 + x2) / 2}px;top:${y1 + 6}px">${Math.round(d.n)}</div>`);
      else out.push(`<div class="cv-dist v" style="left:${x1}px;top:${y1}px;height:${y2 - y1}px"></div><div class="cv-dlab" style="left:${x1 + 6}px;top:${(y1 + y2) / 2}px">${Math.round(d.n)}</div>`);
    }
    if (dropLine) out.push(`<div class="cv-drop ${dropLine.dir}" style="left:${dropLine.x}px;top:${dropLine.y}px;${dropLine.dir === 'row' ? `height:${dropLine.len}px` : `width:${dropLine.len}px`}"></div>`);
    if (marquee) { const a = marquee; out.push(`<div class="cv-marquee" style="left:${Math.min(a.x0, a.x1)}px;top:${Math.min(a.y0, a.y1)}px;width:${Math.abs(a.x1 - a.x0)}px;height:${Math.abs(a.y1 - a.y0)}px"></div>`); }
    if (gesture && gesture.kind === 'draw' && gesture.box) { const q = scr(gesture.box); out.push(`<div class="cv-sel" style="left:${q.x}px;top:${q.y}px;width:${q.w}px;height:${q.h}px"></div><div class="cv-size" style="left:${q.x + q.w / 2}px;top:${q.y + q.h + 8}px">${Math.round(gesture.box.w)} × ${Math.round(gesture.box.h)}</div>`); }
    // friends' cursors
    for (const [, p] of peers) { const x = p.x * view.z + view.x, y = p.y * view.z + view.y; if (x < -20 || y < -20 || x > s.width || y > s.height) continue; out.push(`<div class="cv-cur" style="left:${x}px;top:${y}px;--pc:${esc(p.color)}"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 1l11 6-5 1.5L6 14z"/></svg><span>${esc(p.name)}</span></div>`); }
    ov.innerHTML = out.join('');
  }
  const union = bs => { if (!bs.length) return null; const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y)); return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y }; };

  // ---------- changes: one transaction per action, undo per person, sent to everyone ----------
  let tx = null;
  const pending = new Map(); let sendT = null;
  function begin() { if (!tx) tx = new Map(); }
  function put(n) {
    begin();
    const cur = S.nodes.get(n.id);
    if (!tx.has(n.id)) tx.set(n.id, cur && !cur.del ? clone(cur) : null);
    n.v = Math.max(n.v || 0, cur ? cur.v || 0 : 0) + 1;
    S.nodes.set(n.id, n); queue(n);
    return n;
  }
  function patch(id, p) { const n = S.get(id); if (!n) return null; return put(Object.assign(clone(n), p)); }
  function kill(id) {
    const cur = S.get(id); if (!cur) return;
    for (const d of S.descendants(id)) kill(d.id);
    for (const inst of S.instancesOf(id)) detach(inst.id);   // deleting a main component keeps its copies as frames
    begin(); if (!tx.has(id)) tx.set(id, clone(cur));
    const t = { id, del: true, v: (cur.v || 0) + 1 }; S.nodes.set(id, t); queue(t);
    sel = sel.filter(x => x !== id);
  }
  function end(keepSel) {
    if (!tx) return;
    fixGroups();
    const pairs = [...tx.entries()].map(([id, before]) => ({ id, before, after: S.get(id) ? clone(S.get(id)) : null })).filter(p => JSON.stringify(p.before) !== JSON.stringify(p.after));
    tx = null;
    if (pairs.length) { undo.push(pairs); if (undo.length > 300) undo.shift(); redo = []; }
    if (!keepSel) sel = sel.filter(id => S.get(id));
    renderAll();
  }
  function queue(n) { pending.set(n.id, n.del ? { id: n.id, del: true, v: n.v } : n); if (!sendT) sendT = setTimeout(flushOps, 30); }
  function flushOps() {
    sendT = null; if (!pending.size) return;
    const ops = [...pending.values()].map(clone); pending.clear();
    const f = fileId;
    if (!C.send({ type: 'cnv-op', file: f, ops })) C.api(`/canvas/${encodeURIComponent(f)}/ops`, { method: 'POST', body: { ops } }).then(r => { (r.rejected || []).forEach(x => S.nodes.set(x.id, x)); renderAll(); }).catch(e => toast(e.message));
  }
  function travel(from, to) {
    const pairs = from.pop(); if (!pairs) return;
    commitEdit(true);
    for (const p of pairs) {
      const cur = S.nodes.get(p.id), v = (cur ? cur.v || 0 : 0) + 1;
      const n = p.before ? Object.assign(clone(p.before), { v }) : { id: p.id, del: true, v };
      S.nodes.set(p.id, n); queue(n);
    }
    to.push(pairs.map(p => ({ id: p.id, before: p.after, after: p.before })));
    sel = pairs.filter(p => p.before).map(p => p.id).filter(id => S.get(id) && !S.parentOf(S.get(id)) || sel.includes(id)).filter(id => S.get(id));
    if (!sel.length) sel = pairs.filter(p => p.before && S.get(p.id)).map(p => p.id).slice(0, 1);
    inner = null;
    renderAll();
  }
  // groups hug their children (like Figma): after a change, re-fit every touched group
  function fixGroups() {
    if (!tx) return;
    const groups = new Set();
    for (const id of tx.keys()) { const n = S.nodes.get(id); const p = n && !n.del ? S.parentOf(n) : null; if (p && p.t === 'group') groups.add(p.id); const b = tx.get(id); if (b && b.p && S.get(b.p) && S.get(b.p).t === 'group') groups.add(b.p); }
    for (const gid of groups) {
      const g = S.get(gid); if (!g) continue;
      const kids = S.kids(gid);
      if (!kids.length) { kill(gid); continue; }
      const x0 = Math.min(...kids.map(k => k.x)), y0 = Math.min(...kids.map(k => k.y));
      const x1 = Math.max(...kids.map(k => k.x + boxW(k))), y1 = Math.max(...kids.map(k => k.y + boxH(k)));
      if (Math.abs(x0) > 0.01 || Math.abs(y0) > 0.01) kids.forEach(k => { const c = clone(k); c.x -= x0; c.y -= y0; put(c); });
      if (Math.abs(x0) > 0.01 || Math.abs(y0) > 0.01 || Math.abs(g.w - (x1 - x0)) > 0.01 || Math.abs(g.h - (y1 - y0)) > 0.01) put(Object.assign(clone(g), { x: g.x + x0, y: g.y + y0, w: x1 - x0, h: y1 - y0 }));
    }
  }
  const boxW = n => { if (n.sz && n.sz.h === 'hug') { const b = wbox(n.id); if (b) return b.w; } return n.w; };
  const boxH = n => { if (n.sz && n.sz.v === 'hug') { const b = wbox(n.id); if (b) return b.h; } return n.h; };

  // ---------- making layers ----------
  function makeNode(t, extra) {
    const d = clone(SC.DEFAULTS[t] || {});
    return Object.assign({ id: S.rid(), t, p: '', i: 0, x: 0, y: 0, w: 100, h: 100, v: 0 }, d, extra || {});
  }
  // the deepest frame or component at a screen point (never inside an instance), skipping some ids
  function containerAt(cx, cy, skip = new Set()) {
    const els = document.elementsFromPoint(cx, cy).filter(el => world.contains(el) && el.dataset && el.dataset.id);
    for (const el of els) {
      const n = S.get(el.dataset.id); if (!n || n.hide) continue;
      if (skip.has(n.id) || [...skip].some(s => S.isAncestor(s, n.id))) continue;
      if (n.t === 'frame' || n.t === 'component') return n;
    }
    return null;
  }
  // toLocal: a world box -> coordinates inside parent pidv
  function toLocal(b, pidv) { const o = origin(pidv); return { x: b.x - o.x, y: b.y - o.y }; }
  function uniqueName(base) {
    const names = new Set(S.live().map(n => n.name));
    if (!names.has(base)) return base;
    let k = 2; while (names.has(`${base} ${k}`)) k++; return `${base} ${k}`;
  }

  // ---------- pointer ----------
  function hitAt(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    if (!el || !world.contains(el)) return null;
    const instEl = el.closest('[data-inst]');
    const real = el.closest('[data-id]');
    return { id: real ? real.dataset.id : null, src: instEl ? instEl.dataset.src : null, inst: instEl ? instEl.dataset.inst : null };
  }
  function chainOf(id) { const out = []; let n = S.get(id), k = 0; while (n && k++ < 200) { out.unshift(n.id); n = S.parentOf(n); } return out; }
  // Figma-style pick: the top frame's direct child, or the same depth as what's selected now, or deepest with Ctrl
  function pick(id, deep) {
    const ch = chainOf(id); if (!ch.length) return null;
    if (deep) return ch[ch.length - 1];
    for (const s of sel) { const p = (S.get(s) || {}).p; const k = ch.indexOf(p); if (k >= 0 && k + 1 < ch.length) return ch[k + 1]; if (ch.includes(s) && (S.get(s).p || ch.length === 1)) return s; }
    const root = S.get(ch[0]);
    if (ch.length > 1 && (root.t === 'frame' || root.t === 'component') ) return ch[1];
    return ch[0];
  }
  function onDown(e) {
    if (e.target.closest('.cv-tools, .cv-empty, .cvf')) return;
    stage.focus({ preventScroll: true });
    if (editing && e.target.closest('[contenteditable="true"]')) return;
    commitEdit();
    if (e.pointerType === 'touch') { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) { gesture = null; startPinch(); return; } }
    stage.setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || spaceDown || (e.button === 0 && e.pointerType === 'touch' && tool === 'move' && !hitAt(e.clientX, e.clientY) && !e.target.closest('[data-h]'))) {
      gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; stage.classList.add('panning'); return;
    }
    if (e.button !== 0) return;
    const fname = e.target.closest('[data-fname]');
    if (fname) { const id = fname.dataset.fname; inner = null; if (!sel.includes(id)) sel = e.shiftKey ? [...sel, id] : [id]; startMove(e, w); paintOv(); panels(); return; }
    if (!canEdit && tool !== 'move') setTool('move');
    if (['frame', 'rect', 'ellipse', 'text'].includes(tool) && canEdit) {
      const parent = containerAt(e.clientX, e.clientY);
      gesture = { kind: 'draw', t: tool, w0: w, box: null, parent: parent ? parent.id : '' }; return;
    }
    const h = e.target.closest('[data-h]');
    if (h && canEdit) { startResize(e, h.dataset.h, w); return; }
    const hit = hitAt(e.clientX, e.clientY);
    if (hit && hit.id) {
      let id = pick(hit.id, e.ctrlKey || e.metaKey);
      // a click inside an instance you've already drilled into keeps that inner layer
      if (hit.inst && inner && inner.inst === hit.inst) { inner = { inst: hit.inst, src: hit.src }; sel = [hit.inst]; paintOv(); panels(); return; }
      inner = null;
      if (e.shiftKey) { sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]; paintOv(); panels(); return; }
      if (!sel.includes(id)) sel = [id];
      paintOv(); panels();
      startMove(e, w);
      return;
    }
    // empty canvas: marquee
    if (!e.shiftKey) { sel = []; inner = null; }
    const s = stageRect();
    gesture = { kind: 'marquee', base: [...sel], scope: '', w0: w };
    marquee = { x0: e.clientX - s.left, y0: e.clientY - s.top, x1: e.clientX - s.left, y1: e.clientY - s.top };
    paintOv(); panels();
  }
  function startMove(e, w) {
    if (!canEdit) return;
    let ids = sel.filter(id => { const n = S.get(id); return n && !n.lock; });
    ids = ids.filter(id => !ids.some(o => o !== id && S.isAncestor(o, id)));
    if (!ids.length) return;
    const first = S.get(ids[0]);
    const flow = ids.length === 1 && S.inFlow(first);
    gesture = { kind: 'move', ids, w0: w, cx: e.clientX, cy: e.clientY, moved: false, alt: e.altKey, flow,
      start: ids.map(id => ({ id, x: S.get(id).x, y: S.get(id).y, b: wbox(id) })) };
  }
  function startResize(e, h, w) {
    let ids = sel.filter(id => S.get(id) && !S.get(id).lock); if (!ids.length) return;
    const boxes = ids.map(wbox).filter(Boolean); const u = union(boxes); if (!u) return;
    gesture = { kind: 'resize', h, ids, w0: w, u, shift: e.shiftKey, scale: tool === 'scale',
      start: ids.map(id => { const n = clone(S.get(id)); return { id, n, b: wbox(id), subs: (tool === 'scale' || n.t === 'group') ? S.descendants(id).map(clone) : [] }; }) };
  }
  function onMove(e) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch && touches.size >= 2) { movePinch(); return; } }
    const w = toWorld(e.clientX, e.clientY);
    sendCursor(w);
    if (!gesture) {
      const hit = hitAt(e.clientX, e.clientY);
      const id = hit && hit.id ? pick(hit.id, e.ctrlKey || e.metaKey) : null;
      if (id !== hoverId) { hoverId = id; paintOv(); }
      return;
    }
    const g = gesture;
    if (g.kind === 'pan') { view.x = g.vx + (e.clientX - g.sx); view.y = g.vy + (e.clientY - g.sy); applyView(); return; }
    if (g.kind === 'draw') {
      let x0 = g.w0.x, y0 = g.w0.y, x1 = w.x, y1 = w.y;
      if (e.shiftKey) { const d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * d; y1 = y0 + Math.sign(y1 - y0 || 1) * d; }
      g.box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      paintOv(); return;
    }
    if (g.kind === 'marquee') {
      const s = stageRect(); marquee.x1 = e.clientX - s.left; marquee.y1 = e.clientY - s.top;
      const a = { x: Math.min(g.w0.x, w.x), y: Math.min(g.w0.y, w.y), w: Math.abs(w.x - g.w0.x), h: Math.abs(w.y - g.w0.y) };
      // inside a top frame? pick its children; otherwise top-level layers
      const rootHit = S.roots().find(n => { const b = wbox(n.id); return b && (n.t === 'frame' || n.t === 'component') && g.w0.x > b.x && g.w0.x < b.x + b.w && g.w0.y > b.y && g.w0.y < b.y + b.h; });
      const pool = rootHit ? S.kids(rootHit.id) : S.roots();
      const hits = pool.filter(n => { if (n.hide || n.lock) return false; const b = wbox(n.id); return b && b.x < a.x + a.w && b.x + b.w > a.x && b.y < a.y + a.h && b.y + b.h > a.y; }).map(n => n.id);
      sel = [...new Set([...g.base, ...hits])];
      paintOv(); panels(); return;
    }
    if (g.kind === 'move') {
      if (!g.moved && Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 3) return;
      if (!g.moved) {
        g.moved = true; begin();
        if (g.alt) {   // Alt-drag duplicates; a main component makes an instance
          const copies = g.ids.map(id => { const n = S.get(id); return n.t === 'component' ? instanceOf(n, n.p, n.x, n.y) : duplicateTree(id, 0, 0); });
          g.ids = copies.map(c => c.id); sel = [...g.ids];
          g.start = g.ids.map((id, k) => ({ id, x: S.get(id).x, y: S.get(id).y, b: g.start[k].b }));
          renderAll();
        }
      }
      let dx = w.x - g.w0.x, dy = w.y - g.w0.y;
      if (g.flow) { flowDrag(g, e); return; }
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      // snap the moving box to siblings and the parent
      const u0 = union(g.start.map(s => s.b).filter(Boolean));
      if (u0) { const snap = snapBox({ x: u0.x + dx, y: u0.y + dy, w: u0.w, h: u0.h }, g.ids, true); dx += snap.dx; dy += snap.dy; }
      for (const s of g.start) {
        const n = S.get(s.id); if (!n) continue;
        n.x = Math.round(s.x + dx); n.y = Math.round(s.y + dy);
        const el = elOf(s.id); if (el && !S.inFlow(n)) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
      }
      boxCache.clear();
      paintOv(); return;
    }
    if (g.kind === 'resize') { resizeMove(g, w, e.shiftKey || g.shift, e.altKey); return; }
  }
  function onUp(e) {
    touches.delete(e.pointerId); if (touches.size < 2) pinch = null;
    const g = gesture; gesture = null; stage.classList.remove('panning');
    if (!g) return;
    if (g.kind === 'draw') return finishDraw(g, e);
    if (g.kind === 'marquee') { marquee = null; paintOv(); panels(); return; }
    if (g.kind === 'move') {
      guides = []; distances = []; dropLine = null;
      if (!g.moved) {
        // a plain click on something already selected inside a group of many narrows to it
        if (sel.length > 1 && !e.shiftKey) { const hit = hitAt(e.clientX, e.clientY); if (hit && hit.id) { sel = [pick(hit.id)]; } }
        paintOv(); panels(); return;
      }
      if (g.flow) { finishFlow(g, e); return; }
      // the moved layers keep their new place; put() records them
      for (const s of g.start) { const n = S.get(s.id); if (!n) continue; const nx = n.x, ny = n.y; n.x = s.x; n.y = s.y; put(Object.assign(clone(n), { x: nx, y: ny })); }
      reparentDrop(g.ids, e.clientX, e.clientY);
      end(); return;
    }
    if (g.kind === 'resize') { guides = []; distances = []; end(); return; }
  }
  function onDbl(e) {
    if (!canEdit) return;
    const hit = hitAt(e.clientX, e.clientY); if (!hit) return;
    if (hit.inst) {   // drill into an instance: select (and edit) the layer under the pointer
      sel = [hit.inst]; inner = { inst: hit.inst, src: hit.src };
      const src = S.get(hit.src); if (src && src.t === 'text') editText(null, inner);
      paintOv(); panels(); return;
    }
    if (!hit.id) return;
    const ch = chainOf(hit.id);
    const cur = sel.length === 1 ? ch.indexOf(sel[0]) : -1;
    const id = cur >= 0 && cur + 1 < ch.length ? ch[cur + 1] : (cur >= 0 ? ch[cur] : pick(hit.id));
    sel = [id]; inner = null;
    const n = S.get(id); if (n && n.t === 'text' && !n.lock) editText(id);
    paintOv(); panels();
  }
  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const s = stageRect(), mx = e.clientX - s.left, my = e.clientY - s.top;
      const z = Math.max(0.02, Math.min(64, view.z * Math.exp(-e.deltaY * 0.0022)));
      view.x = mx - (mx - view.x) * (z / view.z); view.y = my - (my - view.y) * (z / view.z); view.z = z;
    } else { view.x -= e.shiftKey ? e.deltaY : e.deltaX; view.y -= e.shiftKey ? 0 : e.deltaY; }
    applyView();
  }
  function startPinch() { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: { ...view } }; }
  function movePinch() {
    const [a, b] = [...touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const s = stageRect(), z = Math.max(0.05, Math.min(32, pinch.view.z * d / (pinch.d || 1)));
    const mx = pinch.cx - s.left, my = pinch.cy - s.top;
    view.z = z; view.x = mx - (mx - pinch.view.x) * (z / pinch.view.z) + (cx - pinch.cx); view.y = my - (my - pinch.view.y) * (z / pinch.view.z) + (cy - pinch.cy);
    applyView();
  }
  let lastCur = 0;
  function sendCursor(w) { const now = Date.now(); if (now - lastCur < 50) return; lastCur = now; C.send({ type: 'cnv-cursor', file: fileId, x: w.x, y: w.y }); }

  // ---------- snapping + smart guides ----------
  function snapBox(b, moving, showDist) {
    const T = 5 / view.z;
    const first = S.get(moving[0]); const parent = first ? first.p : '';
    const cands = [];
    const pool = (parent ? S.kids(parent) : S.roots()).filter(n => !moving.includes(n.id) && !n.hide);
    for (const n of pool) { const q = wbox(n.id); if (q) cands.push(q); }
    if (parent) { const q = wbox(parent); if (q) cands.push(q); }
    const xs = [b.x, b.x + b.w / 2, b.x + b.w], ys = [b.y, b.y + b.h / 2, b.y + b.h];
    let best = { dx: 0, dy: 0, gx: null, gy: null, ex: T + 1, ey: T + 1 };
    for (const q of cands) {
      for (const cx of [q.x, q.x + q.w / 2, q.x + q.w]) for (const mx of xs) { const d = cx - mx; if (Math.abs(d) < best.ex) { best.ex = Math.abs(d); best.dx = d; best.gx = { v: cx, q }; } }
      for (const cy of [q.y, q.y + q.h / 2, q.y + q.h]) for (const my of ys) { const d = cy - my; if (Math.abs(d) < best.ey) { best.ey = Math.abs(d); best.dy = d; best.gy = { v: cy, q }; } }
    }
    guides = []; distances = [];
    const nb = { x: b.x + (best.ex <= T ? best.dx : 0), y: b.y + (best.ey <= T ? best.dy : 0), w: b.w, h: b.h };
    if (best.ex <= T && best.gx) { const q = best.gx.q; guides.push({ axis: 'x', v: best.gx.v, a: Math.min(q.y, nb.y), b: Math.max(q.y + q.h, nb.y + nb.h) }); }
    if (best.ey <= T && best.gy) { const q = best.gy.q; guides.push({ axis: 'y', v: best.gy.v, a: Math.min(q.x, nb.x), b: Math.max(q.x + q.w, nb.x + nb.w) }); }
    if (showDist) {   // the gap to the nearest neighbour on each side (red labels, like Figma)
      const sibs = pool.map(n => wbox(n.id)).filter(Boolean);
      const overlapY = q => q.y < nb.y + nb.h && q.y + q.h > nb.y, overlapX = q => q.x < nb.x + nb.w && q.x + q.w > nb.x;
      const left = sibs.filter(q => overlapY(q) && q.x + q.w <= nb.x).sort((a, c) => (c.x + c.w) - (a.x + a.w))[0];
      const right = sibs.filter(q => overlapY(q) && q.x >= nb.x + nb.w).sort((a, c) => a.x - c.x)[0];
      const up = sibs.filter(q => overlapX(q) && q.y + q.h <= nb.y).sort((a, c) => (c.y + c.h) - (a.y + a.h))[0];
      const down = sibs.filter(q => overlapX(q) && q.y >= nb.y + nb.h).sort((a, c) => a.y - c.y)[0];
      const my = nb.y + nb.h / 2, mx = nb.x + nb.w / 2;
      if (left) distances.push({ axis: 'x', x1: left.x + left.w, x2: nb.x, y1: my, y2: my, n: nb.x - left.x - left.w });
      if (right) distances.push({ axis: 'x', x1: nb.x + nb.w, x2: right.x, y1: my, y2: my, n: right.x - nb.x - nb.w });
      if (up) distances.push({ axis: 'y', y1: up.y + up.h, y2: nb.y, x1: mx, x2: mx, n: nb.y - up.y - up.h });
      if (down) distances.push({ axis: 'y', y1: nb.y + nb.h, y2: down.y, x1: mx, x2: mx, n: down.y - nb.y - nb.h });
      if (parent && !distances.length) { const q = wbox(parent); if (q) { distances.push({ axis: 'x', x1: q.x, x2: nb.x, y1: my, y2: my, n: nb.x - q.x }); distances.push({ axis: 'y', y1: q.y, y2: nb.y, x1: mx, x2: mx, n: nb.y - q.y }); } }
    }
    return { dx: best.ex <= T ? best.dx : 0, dy: best.ey <= T ? best.dy : 0 };
  }

  // ---------- auto layout drag: reorder inside the parent, or pull out ----------
  function flowDrag(g, e) {
    const n = S.get(g.ids[0]); const p = S.get(n.p); const pb = wbox(p.id); if (!pb) return;
    const w = toWorld(e.clientX, e.clientY);
    const outside = w.x < pb.x - 8 || w.x > pb.x + pb.w + 8 || w.y < pb.y - 8 || w.y > pb.y + pb.h + 8;
    const el = elOf(n.id); if (el) el.style.opacity = outside ? '0.35' : '0.5';
    g.outside = outside; dropLine = null;
    if (outside) { paintOv(); return; }
    const sibs = S.kids(p.id).filter(k => k.id !== n.id && !k.hide);
    const row = p.lay.d === 'row';
    let idx = sibs.length;
    for (let k = 0; k < sibs.length; k++) { const b = wbox(sibs[k].id); if (!b) continue; const mid = row ? b.x + b.w / 2 : b.y + b.h / 2; if ((row ? w.x : w.y) < mid) { idx = k; break; } }
    g.idx = idx; g.sibs = sibs;
    const s = stageRect(), pr = elOf(p.id).getBoundingClientRect();
    let at;
    if (idx < sibs.length) { const r = elOf(sibs[idx].id).getBoundingClientRect(); at = row ? r.left - 3 : r.top - 3; }
    else if (sibs.length) { const r = elOf(sibs[sibs.length - 1].id).getBoundingClientRect(); at = row ? r.right + 1 : r.bottom + 1; }
    else at = row ? pr.left + 4 : pr.top + 4;
    dropLine = row ? { dir: 'row', x: at - s.left, y: pr.top - s.top + 4, len: pr.height - 8 } : { dir: 'col', x: pr.left - s.left + 4, y: at - s.top, len: pr.width - 8 };
    paintOv();
  }
  function finishFlow(g, e) {
    const n = S.get(g.ids[0]); const el = elOf(n.id); if (el) el.style.opacity = '';
    if (g.outside) {
      const b = wbox(n.id), w = toWorld(e.clientX, e.clientY);
      const target = containerAt(e.clientX, e.clientY, new Set([n.id]));
      const dropP = target && target.id !== n.p ? target.id : (target ? target.id : '');
      const nb = { x: w.x - (b ? b.w / 2 : 0), y: w.y - (b ? b.h / 2 : 0) };
      const loc = toLocal(nb, dropP);
      const wv = b ? b.w : n.w, hv = b ? b.h : n.h;
      put(Object.assign(clone(n), { p: dropP, x: Math.round(loc.x), y: Math.round(loc.y), w: Math.round(wv), h: Math.round(hv), i: S.nextI(dropP) }, n.t === 'text' ? {} : { sz: undefined }));
      end(); return;
    }
    if (g.idx == null) { renderAll(); return; }
    const sibs = g.sibs; const prev = sibs[g.idx - 1], next = sibs[g.idx];
    const i = prev && next ? ((prev.i || 0) + (next.i || 0)) / 2 : prev ? (prev.i || 0) + 1 : next ? (next.i || 0) - 1 : 1;
    put(Object.assign(clone(n), { i }));
    end();
  }
  // dropping absolute layers onto another frame moves them inside it (or out to the canvas)
  function reparentDrop(ids, cx, cy) {
    const skip = new Set(ids);
    const target = containerAt(cx, cy, skip);
    const tid = target ? target.id : '';
    for (const id of ids) {
      const n = S.get(id); if (!n || n.p === tid) continue;
      const cur = S.parentOf(n); if (cur && cur.t === 'group' && !target) continue;   // leaving a group needs Ctrl Shift G
      if (target && target.lay) {   // into an auto layout frame: append to the flow
        put(Object.assign(clone(n), { p: tid, i: S.nextI(tid) }));
        continue;
      }
      const b = wbox(id); if (!b) continue;
      const loc = toLocal(b, tid);
      put(Object.assign(clone(n), { p: tid, x: Math.round(loc.x), y: Math.round(loc.y), i: S.nextI(tid) }));
    }
  }

  // ---------- resize (and K: scale) ----------
  function resizeMove(g, w, keep, fromCenter) {
    const u = g.u; let dx = w.x - g.w0.x, dy = w.y - g.w0.y;
    let x0 = u.x, y0 = u.y, x1 = u.x + u.w, y1 = u.y + u.h;
    if (g.h.includes('w')) x0 += dx; if (g.h.includes('e')) x1 += dx;
    if (g.h.includes('n')) y0 += dy; if (g.h.includes('s')) y1 += dy;
    if (fromCenter) { if (g.h.includes('w')) x1 -= dx; if (g.h.includes('e')) x0 -= dx; if (g.h.includes('n')) y1 -= dy; if (g.h.includes('s')) y0 -= dy; }
    // snap the dragged edges
    const sn = snapBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, g.ids, false);
    if (g.h.includes('w')) x0 += sn.dx; else if (g.h.includes('e')) x1 += sn.dx;
    if (g.h.includes('n')) y0 += sn.dy; else if (g.h.includes('s')) y1 += sn.dy;
    let nw = Math.max(1, x1 - x0), nh = Math.max(1, y1 - y0);
    if (keep || g.scale) {
      const r = u.w / u.h;
      if (g.h === 'n' || g.h === 's') nw = nh * r; else if (g.h === 'e' || g.h === 'w') nh = nw / r; else if (nw / nh > r) nh = nw / r; else nw = nh * r;
      if (g.h.includes('w')) x0 = x1 - nw; if (g.h.includes('n')) y0 = y1 - nh;
    }
    const fx = nw / u.w, fy = nh / u.h;
    begin();
    for (const s of g.start) {
      const n0 = s.n, b = s.b; if (!b) continue;
      const nbx = x0 + (b.x - u.x) * fx, nby = y0 + (b.y - u.y) * fy;
      const nwv = Math.max(1, Math.round(b.w * fx)), nhv = Math.max(1, Math.round(b.h * fy));
      const n = clone(n0); const flow = S.inFlow(n0);
      if (!flow) { n.x = Math.round(n0.x + (nbx - b.x)); n.y = Math.round(n0.y + (nby - b.y)); }
      n.w = nwv; n.h = nhv;
      const sz = Object.assign({ h: 'fixed', v: 'fixed' }, n0.sz || {});
      if (Math.abs(fx - 1) > 0.001 && sz.h !== 'fill') sz.h = 'fixed';
      if (Math.abs(fy - 1) > 0.001 && sz.v !== 'fill') sz.v = 'fixed';
      if (n.t === 'text' && !g.scale) { if (Math.abs(fy - 1) < 0.001) sz.v = 'hug'; }
      n.sz = sz.h === 'fixed' && sz.v === 'fixed' ? undefined : sz;
      if (g.scale && n.tx) n.tx = Object.assign({}, n0.tx, { s: Math.max(1, Math.round(n0.tx.s * Math.min(fx, fy) * 10) / 10) });
      if (g.scale && n.lay) n.lay = Object.assign({}, n0.lay, { g: Math.round(n0.lay.g * Math.min(fx, fy)), p: n0.lay.p.map(v => Math.round(v * Math.min(fx, fy))) });
      if (g.scale && n.r) n.r = Math.round(n0.r * Math.min(fx, fy));
      setLive(n);
      // groups (and K) scale what's inside
      for (const d of s.subs) {
        const c = clone(d);
        c.x = Math.round(d.x * fx); c.y = Math.round(d.y * fy); c.w = Math.max(1, Math.round(d.w * fx)); c.h = Math.max(1, Math.round(d.h * fy));
        if (g.scale && c.tx) c.tx = Object.assign({}, d.tx, { s: Math.max(1, Math.round(d.tx.s * Math.min(fx, fy) * 10) / 10) });
        if (g.scale && c.r) c.r = Math.round(d.r * Math.min(fx, fy));
        setLive(c);
      }
    }
    renderLive(); paintOv();
  }
  // during a drag: change the node in place (put() runs once per node per transaction for undo)
  function setLive(n) { const cur = S.nodes.get(n.id); if (!tx.has(n.id)) tx.set(n.id, cur ? clone(cur) : null); n.v = (cur ? cur.v || 0 : 0); S.nodes.set(n.id, n); dirtyLive.add(n.id); }
  const dirtyLive = new Set();
  function renderLive() {
    for (const id of dirtyLive) { const n = S.nodes.get(id); if (n) { n.v = (n.v || 0) + 1; queue(n); } }
    dirtyLive.clear();
    world.innerHTML = S.roots().map(n => nodeHTML(n, null, null, 0)).join('');
    reindex();
  }

  // ---------- drawing ----------
  function finishDraw(g, e) {
    const tiny = !g.box || (g.box.w < 3 && g.box.h < 3);
    const t = g.t;
    let b = g.box;
    if (tiny) b = t === 'text' ? { x: g.w0.x, y: g.w0.y, w: 40, h: 21 } : { x: g.w0.x - 50, y: g.w0.y - 50, w: 100, h: 100 };
    if (tiny && t === 'frame' && !g.parent) b = { x: g.w0.x, y: g.w0.y, w: 390, h: 844 };   // a click with F makes a phone-sized frame
    const parent = S.get(g.parent);
    const extra = { name: uniqueName((SC.DEFAULTS[t] || {}).name || t), w: Math.round(b.w), h: Math.round(b.h) };
    if (parent && parent.lay) { Object.assign(extra, { p: parent.id, i: S.nextI(parent.id), x: 0, y: 0 }); }
    else { const loc = toLocal(b, g.parent); Object.assign(extra, { p: g.parent, x: Math.round(loc.x), y: Math.round(loc.y), i: S.nextI(g.parent) }); }
    if (t === 'text' && !tiny) { extra.sz = { h: 'fixed', v: 'hug' }; }
    const n = put(makeNode(t, extra));
    // a new top-level frame takes in the top-level layers drawn inside it
    if (t === 'frame' && !g.parent && !tiny) {
      for (const r of S.roots()) {
        if (r.id === n.id) continue; const q = wbox(r.id);
        if (q && q.x >= b.x && q.y >= b.y && q.x + q.w <= b.x + b.w && q.y + q.h <= b.y + b.h) put(Object.assign(clone(r), { p: n.id, x: Math.round(q.x - b.x), y: Math.round(q.y - b.y), i: S.nextI(n.id) }));
      }
    }
    sel = [n.id]; inner = null;
    end();
    setTool('move');
    if (t === 'text') editText(n.id, null, true);
  }

  // ---------- text editing (in place, real text) ----------
  function editText(id, inn, selectAll) {
    let el;
    if (inn) el = world.querySelector(`[data-inst="${CSS.escape(inn.inst)}"][data-src="${CSS.escape(inn.src)}"]`);
    else el = elOf(id);
    if (!el) return;
    editing = { id, inner: inn ? { ...inn } : null, el, before: el.textContent };
    el.setAttribute('contenteditable', 'true'); el.spellcheck = false;
    el.classList.add('editing');
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); if (!selectAll) r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); commitEdit(); }
      ev.stopPropagation();
    });
    el.addEventListener('input', () => { boxCache.clear(); paintOv(); });
    el.addEventListener('blur', () => setTimeout(() => commitEdit(), 0), { once: true });
    paintOv();
  }
  function commitEdit(silent) {
    if (!editing) return;
    const ed = editing; editing = null;
    const txt = ed.el.innerText.replace(/\n$/, '');
    ed.el.removeAttribute('contenteditable'); ed.el.classList.remove('editing');
    if (txt !== ed.before) {
      if (ed.inner) { const inst = S.get(ed.inner.inst); if (inst) { const ov = clone(inst.ov || {}); ov[ed.inner.src] = Object.assign({}, ov[ed.inner.src], { c: txt }); put(Object.assign(clone(inst), { ov })); } }
      else { const n = S.get(ed.id); if (n) put(Object.assign(clone(n), { tx: Object.assign({}, n.tx, { c: txt }) })); }
      end(true);
    } else if (!silent) { if (renderQ) renderAll(); else paintOv(); }
    else if (renderQ) renderAll();
  }

  // ---------- structure: group, component, auto layout, duplicate, order ----------
  function selected() { return sel.map(id => S.get(id)).filter(Boolean); }
  function sameParent(ns) { return ns.length && ns.every(n => (n.p || '') === (ns[0].p || '')); }
  function wrap(t, extra) {
    let ns = selected(); if (!ns.length) return null;
    if (!sameParent(ns)) ns = ns.filter(n => (n.p || '') === (ns[0].p || ''));
    const parent = ns[0].p || '';
    const pnode = S.get(parent);
    const boxes = ns.map(n => wbox(n.id)).filter(Boolean); const u = union(boxes); if (!u) return null;
    const loc = toLocal(u, parent);
    const minI = Math.min(...ns.map(n => n.i || 0));
    const g = makeNode(t, Object.assign({ p: parent, i: minI, x: Math.round(loc.x), y: Math.round(loc.y), w: Math.round(u.w), h: Math.round(u.h), name: uniqueName((SC.DEFAULTS[t] || {}).name || t) }, extra || {}));
    if (pnode && pnode.lay) { g.x = 0; g.y = 0; }
    put(g);
    ns.sort((a, b) => (a.i || 0) - (b.i || 0)).forEach((n, k) => { const b = wbox(n.id); put(Object.assign(clone(n), { p: g.id, i: k + 1, x: Math.round(b.x - u.x), y: Math.round(b.y - u.y) })); });
    return g;
  }
  function group() { if (!canEdit || !sel.length) return; const g = wrap('group', { fill: undefined }); if (g) { delete g.fill; sel = [g.id]; end(); } }
  function ungroup() {
    if (!canEdit) return;
    const out = [];
    for (const n of selected()) {
      if (n.t !== 'group' && !(n.t === 'frame' && !n.lay)) continue;
      const p = n.p || ''; const kids = S.kids(n.id);
      const pn = S.get(p);
      kids.forEach((k, j) => { const b = wbox(k.id); const loc = b ? toLocal(b, p) : { x: n.x + k.x, y: n.y + k.y }; put(Object.assign(clone(k), { p, i: (n.i || 0) + (j + 1) / (kids.length + 1), x: Math.round(pn && pn.lay ? 0 : loc.x), y: Math.round(pn && pn.lay ? 0 : loc.y) })); out.push(k.id); });
      kill(n.id);
    }
    if (out.length) { sel = out; end(); }
  }
  function makeComponent() {
    if (!canEdit || !sel.length) return;
    const ns = selected();
    if (ns.length === 1 && (ns[0].t === 'frame' || ns[0].t === 'group')) {
      const n = ns[0]; const c = Object.assign(clone(n), { t: 'component', name: n.name && !/^(Frame|Group)( \d+)?$/.test(n.name) ? n.name : uniqueName('Component') });
      if (n.t === 'group') delete c.fill;
      put(c); sel = [n.id]; end(); toast(T('Made a component. Alt-drag it or use Assets to place copies.')); return;
    }
    const g = wrap('component', {}); if (g) { const n = S.get(g.id); delete n.fill; n.clip = false; sel = [g.id]; end(); toast(T('Made a component. Alt-drag it or use Assets to place copies.')); }
  }
  // Shift A: give a frame auto layout, or wrap the selection in a new auto layout frame
  function autoLayout() {
    if (!canEdit || !sel.length) return;
    const ns = selected();
    let target = ns.length === 1 && (ns[0].t === 'frame' || ns[0].t === 'component') ? ns[0] : null;
    if (target && target.lay) { const n = clone(target); delete n.lay; n.sz = undefined; S.kids(n.id).forEach(k => { const b = wbox(k.id), o = origin(n.id); put(Object.assign(clone(k), { x: Math.round(b.x - o.x), y: Math.round(b.y - o.y) })); }); put(n); end(); return; }
    if (!target) { const w = wrap('frame', { fill: undefined }); if (!w) return; target = S.get(w.id); delete target.fill; target.name = uniqueName('Auto layout'); }
    const kids = S.kids(target.id);
    const boxes = kids.map(k => ({ k, b: wbox(k.id) || { x: k.x, y: k.y, w: k.w, h: k.h } }));
    const spanX = union(boxes.map(o => o.b)); const tb = wbox(target.id) || { x: target.x, y: target.y, w: target.w, h: target.h };
    const xs = boxes.map(o => o.b.x), ys = boxes.map(o => o.b.y);
    const row = kids.length > 1 && (Math.max(...xs) - Math.min(...xs)) > (Math.max(...ys) - Math.min(...ys));
    const order = boxes.sort((a, b) => row ? a.b.x - b.b.x : a.b.y - b.b.y);
    let gap = 10;
    if (order.length > 1) { const gs = []; for (let k = 1; k < order.length; k++) gs.push(row ? order[k].b.x - (order[k - 1].b.x + order[k - 1].b.w) : order[k].b.y - (order[k - 1].b.y + order[k - 1].b.h)); gap = Math.max(0, Math.round(gs.reduce((a, b) => a + b, 0) / gs.length)); }
    const pad = spanX && ns.length === 1 ? [Math.max(0, Math.round(spanX.y - tb.y)), Math.max(0, Math.round(tb.x + tb.w - spanX.x - spanX.w)), Math.max(0, Math.round(tb.y + tb.h - spanX.y - spanX.h)), Math.max(0, Math.round(spanX.x - tb.x))] : [0, 0, 0, 0];
    order.forEach((o, k) => put(Object.assign(clone(o.k), { i: k + 1 })));
    put(Object.assign(clone(S.get(target.id)), { lay: { d: row ? 'row' : 'col', g: gap, p: pad, ai: 'start', jc: 'start' }, sz: { h: 'hug', v: 'hug' } }));
    sel = [target.id]; end();
  }
  function duplicateTree(id, dx, dy, parent) {
    const n = S.get(id); if (!n) return null;
    const c = Object.assign(clone(n), { id: S.rid(), v: 0, x: n.x + dx, y: n.y + dy });
    if (parent !== undefined) c.p = parent;
    else { const sibs = S.kids(n.p || ''); const k = sibs.findIndex(s => s.id === id); const next = sibs[k + 1]; c.i = next ? ((n.i || 0) + (next.i || 0)) / 2 : (n.i || 0) + 1; }
    put(c);
    for (const k of S.kids(id)) duplicateTree(k.id, 0, 0, c.id);
    return c;
  }
  function duplicate() {
    if (!canEdit || !sel.length) return;
    const ns = selected().filter(n => !sel.some(o => o !== n.id && S.isAncestor(o, n.id)));
    const out = ns.map(n => { const flow = S.inFlow(n); const off = flow ? 0 : (!n.p && ['frame', 'component', 'instance'].includes(n.t) ? (wbox(n.id) || { w: n.w }).w + 40 : 10); return duplicateTree(n.id, off, flow || (!n.p && ['frame', 'component', 'instance'].includes(n.t)) ? 0 : 10); });
    sel = out.filter(Boolean).map(c => c.id); end();
  }
  function instanceOf(comp, parent, x, y) {
    const b = wbox(comp.id);
    return put(makeNode('instance', { comp: comp.id, p: parent || '', i: S.nextI(parent || ''), x: Math.round(x), y: Math.round(y), w: Math.round(b ? b.w : comp.w), h: Math.round(b ? b.h : comp.h), name: comp.name, sz: comp.sz ? clone(comp.sz) : undefined }));
  }
  function insertInstance(cid) {
    const comp = S.get(cid); if (!comp || !canEdit) return;
    const s = stageRect(); const c = toWorld(s.left + s.width / 2, s.top + s.height / 2);
    const b = wbox(cid) || { w: comp.w, h: comp.h };
    const target = sel.length === 1 && S.get(sel[0]) && ['frame', 'component'].includes(S.get(sel[0]).t) && sel[0] !== cid && !S.isAncestor(cid, sel[0]) ? S.get(sel[0]) : null;
    let inst;
    if (target) { const loc = target.lay ? { x: 0, y: 0 } : { x: 20, y: 20 }; inst = instanceOf(comp, target.id, loc.x, loc.y); }
    else inst = instanceOf(comp, '', c.x - b.w / 2, c.y - b.h / 2);
    sel = [inst.id]; inner = null; end();
  }
  function detach(id) {
    const inst = S.get(id); if (!inst || inst.t !== 'instance') return null;
    const look = S.instanceLook(inst); if (!look) { kill(id); return null; }
    const f = Object.assign(clone(look), { t: 'frame', id: inst.id, v: inst.v });
    delete f.comp; delete f.ov; delete f.by; delete f.at;
    put(f);
    const copy = (src, parent) => {
      const r = S.resolved(src, inst);
      const c = Object.assign(clone(r), { id: S.rid(), v: 0, p: parent }); delete c.by; delete c.at;
      put(c); for (const k of S.kids(src.id)) copy(k, c.id);
    };
    for (const k of S.kids(inst.comp)) copy(k, inst.id);
    return f;
  }
  function order(dir) {
    if (!canEdit) return;
    for (const n of selected()) {
      const sibs = S.kids(n.p || ''); const k = sibs.findIndex(s => s.id === n.id);
      let i = n.i || 0;
      if (dir === 'front') i = (sibs[sibs.length - 1].i || 0) + 1;
      else if (dir === 'back') i = (sibs[0].i || 0) - 1;
      else if (dir === 'up' && k < sibs.length - 1) { const a = sibs[k + 1], b = sibs[k + 2]; i = b ? ((a.i || 0) + (b.i || 0)) / 2 : (a.i || 0) + 1; }
      else if (dir === 'down' && k > 0) { const a = sibs[k - 1], b = sibs[k - 2]; i = b ? ((a.i || 0) + (b.i || 0)) / 2 : (a.i || 0) - 1; }
      put(Object.assign(clone(n), { i }));
    }
    end();
  }
  function nudge(dx, dy) {
    if (!canEdit || !sel.length) return;
    for (const n of selected()) {
      if (n.lock) continue;
      if (S.inFlow(n)) {   // in auto layout, arrows move it along the flow
        const p = S.parentOf(n); const along = p.lay.d === 'row' ? dx : dy; if (!along) continue;
        const sibs = S.kids(n.p); const k = sibs.findIndex(s => s.id === n.id); const j = k + Math.sign(along); if (j < 0 || j >= sibs.length) continue;
        const o = sibs[j]; put(Object.assign(clone(n), { i: o.i })); put(Object.assign(clone(o), { i: n.i }));
      } else put(Object.assign(clone(n), { x: n.x + dx, y: n.y + dy }));
    }
    end();
  }
  function removeSel() {
    if (!canEdit) return;
    if (inner) { const inst = S.get(inner.inst); if (inst) { const ov = clone(inst.ov || {}); ov[inner.src] = Object.assign({}, ov[inner.src], { hide: true }); put(Object.assign(clone(inst), { ov })); inner = null; end(); } return; }
    if (!sel.length) return;
    [...sel].forEach(kill); sel = []; end();
  }
  function toggle(key) {
    if (!canEdit || !sel.length) return;
    const on = !selected().every(n => n[key]);
    selected().forEach(n => { const c = clone(n); if (on) c[key] = true; else delete c[key]; put(c); });
    end();
  }
  function copySel() { const ns = selected(); if (!ns.length) return; clip = ns.map(n => [n, ...S.descendants(n.id)].map(clone)); }
  function paste() {
    if (!clip || !canEdit) return;
    const out = [];
    const target = sel.length === 1 && S.get(sel[0]) && ['frame', 'component'].includes(S.get(sel[0]).t) ? S.get(sel[0]) : null;
    for (const set of clip) {
      const ids = new Map(set.map(n => [n.id, S.rid()]));
      set.forEach((n, k) => {
        const c = Object.assign(clone(n), { id: ids.get(n.id), v: 0 });
        if (k === 0) { c.p = target ? target.id : (S.get(n.p) ? n.p : ''); c.i = S.nextI(c.p); if (!target) { c.x += 20; c.y += 20; } else if (!target.lay) { c.x = 20; c.y = 20; } out.push(c.id); }
        else c.p = ids.get(n.p) || c.p;
        if (c.t === 'instance' && !S.get(c.comp)) return;
        put(c);
      });
    }
    sel = out; end();
  }

  // ---------- keys ----------
  addEventListener('keydown', e => {
    if (!open || document.body.dataset.view !== NAME) return;
    const tg = e.target;
    if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    if ([...document.querySelectorAll('.modal:not(.hidden), dialog[open]')].some(m => m.offsetParent !== null)) return;
    const done = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ' && !spaceDown) { spaceDown = true; stage.classList.add('space'); done(); return; }
    if (mod && k === 'z') { done(); e.shiftKey ? travel(redo, undo) : travel(undo, redo); return; }
    if (mod && k === 'y') { done(); travel(redo, undo); return; }
    if (mod && e.altKey && k === 'k') { done(); makeComponent(); return; }
    if (mod && e.altKey && k === 'b') { done(); if (sel.length === 1 && S.get(sel[0]) && S.get(sel[0]).t === 'instance') { detach(sel[0]); end(); } return; }
    if (mod && k === 'g') { done(); e.shiftKey ? ungroup() : group(); return; }
    if (mod && k === 'd') { done(); duplicate(); return; }
    if (mod && k === 'c') { done(); copySel(); return; }
    if (mod && k === 'v') { done(); paste(); return; }
    if (mod && k === 'x') { done(); copySel(); removeSel(); return; }
    if (mod && k === 'a') { done(); const n = S.get(sel[0]); sel = (n ? S.kids(n.p || '') : S.roots()).filter(x => !x.hide && !x.lock).map(x => x.id); inner = null; paintOv(); panels(); return; }
    if (mod && e.shiftKey && k === 'h') { done(); toggle('hide'); return; }
    if (mod && e.shiftKey && k === 'l') { done(); toggle('lock'); return; }
    if (mod && (e.key === ']' || e.key === '}')) { done(); order(e.shiftKey ? 'front' : 'up'); return; }
    if (mod && (e.key === '[' || e.key === '{')) { done(); order(e.shiftKey ? 'back' : 'down'); return; }
    if (mod && k === 'r') { done(); const P = window.TribeCanvasPanels; if (P && P.layers && sel[0]) P.layers.rename(sel[0]); return; }
    if (mod && (k === '0')) { done(); zoomTo(1); return; }
    if (mod && (k === '=' || k === '+')) { done(); zoomTo(view.z * 1.25); return; }
    if (mod && k === '-') { done(); zoomTo(view.z / 1.25); return; }
    if (mod) return;
    if (e.shiftKey && e.code === 'Digit1') { done(); fit(); return; }
    if (e.shiftKey && e.code === 'Digit2') { done(); fit(true); return; }
    if (e.shiftKey && e.code === 'Digit0') { done(); zoomTo(1); return; }
    if (e.shiftKey && k === 'a') { done(); autoLayout(); return; }
    if (k === 'delete' || k === 'backspace') { done(); removeSel(); return; }
    if (k === 'c' && !e.altKey && !e.shiftKey && window.TribeCanvasCode) { done(); window.TribeCanvasCode.comment(); return; }
    if (k === 'escape') {
      if (window.TribeCanvasCode && window.TribeCanvasCode.commenting()) { done(); window.TribeCanvasCode.comment(false); return; }
      if (inner) { inner = null; } else if (sel.length === 1 && S.get(sel[0]) && S.get(sel[0]).p) sel = [S.get(sel[0]).p]; else sel = [];
      if (tool !== 'move') setTool('move');
      paintOv(); panels(); return;
    }
    if (k === 'enter') {
      done();
      if (sel.length === 1) { const n = S.get(sel[0]); if (n && n.t === 'text') { editText(n.id); return; } const kids = n ? S.kids(n.id) : []; if (kids.length) { sel = kids.map(x => x.id); paintOv(); panels(); } }
      return;
    }
    if (e.key.startsWith('Arrow')) { done(); const d = e.shiftKey ? 10 : 1; nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0); return; }
    if (KEYTOOL[k] && !e.altKey) { done(); setTool(KEYTOOL[k]); return; }
  }, true);
  addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; stage && stage.classList.remove('space'); } });

  function setTool(t) {
    tool = t;
    document.querySelectorAll('#cv-tools [data-tool]').forEach(b => { const on = b.dataset.tool === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (stage) stage.dataset.tool = t;
  }

  // ---------- zoom ----------
  function zoomTo(z, cx, cy) {
    const s = stageRect(); const mx = cx == null ? s.width / 2 : cx, my = cy == null ? s.height / 2 : cy;
    z = Math.max(0.02, Math.min(64, z));
    view.x = mx - (mx - view.x) * (z / view.z); view.y = my - (my - view.y) * (z / view.z); view.z = z; applyView();
  }
  function fit(selection) {
    if (!stage) return;
    const ids = selection && sel.length ? sel : S.roots().filter(n => !n.hide).map(n => n.id);
    const u = union(ids.map(wbox).filter(Boolean));
    const s = stageRect(); if (!u || !s.width) { view = { x: 80, y: 60, z: 1 }; applyView(); return; }
    const padX = isPhone() ? 24 : 80, padY = isPhone() ? 40 : 80;
    const z = Math.max(0.02, Math.min(selection ? 8 : 1, Math.min((s.width - padX * 2) / u.w, (s.height - padY * 2) / u.h)));
    view.z = z; view.x = (s.width - u.w * z) / 2 - u.x * z; view.y = (s.height - u.h * z) / 2 - u.y * z;
    applyView();
  }
  function menu(anchor, items) {
    const m = $('#cv-menu'); const r = anchor.getBoundingClientRect(), cr = $('#cv').getBoundingClientRect();
    m.innerHTML = items.map((it, k) => it === '-' ? '<hr>' : `<button role="menuitem" data-k="${k}"${it.on ? ' class="on"' : ''}><span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`).join('');
    m.style.left = Math.max(8, Math.min(r.left - cr.left, cr.width - 240)) + 'px'; m.style.top = (r.bottom - cr.top + 6) + 'px';
    m.hidden = false;
    m.onclick = ev => { const b = ev.target.closest('[data-k]'); if (!b) return; m.hidden = true; const it = items[+b.dataset.k]; it.run && it.run(); };
  }
  function zoomMenu(a) {
    menu(a, [
      { label: T('Zoom in'), key: 'Ctrl +', run: () => zoomTo(view.z * 1.25) }, { label: T('Zoom out'), key: 'Ctrl −', run: () => zoomTo(view.z / 1.25) },
      { label: T('Zoom to fit'), key: 'Shift 1', run: () => fit() }, { label: T('Zoom to selection'), key: 'Shift 2', run: () => fit(true) },
      { label: '100%', key: 'Ctrl 0', run: () => zoomTo(1) },
    ]);
  }
  async function fileMenu(a) {
    await loadFiles();
    menu(a, [
      ...files.map(f => ({ label: f.name, on: f.id === fileId, run: () => { if (f.id !== fileId) { commitEdit(); C.send({ type: 'cnv-leave', file: fileId }); fileId = f.id; loadedFor = ''; load(); } } })),
      '-',
      { label: T('New design file'), run: async () => { const name = prompt(T('Name the new design file'), T('Untitled')); if (name == null) return; try { const r = await C.api('/canvas', { method: 'POST', body: { name } }); C.send({ type: 'cnv-leave', file: fileId }); fileId = r.file.id; loadedFor = ''; load(); } catch (e) { toast(e.message); } } },
      ...(canEdit ? [{ label: T('Rename this file'), run: async () => { const name = prompt(T('Rename the design file'), fileName); if (!name) return; try { await C.api('/canvas/' + encodeURIComponent(fileId), { method: 'PATCH', body: { name } }); fileName = name; $('#cv-file-t').textContent = name; } catch (e) { toast(e.message); } } }] : []),
      ...(S.live().length && canEdit ? [{ label: T('Add the sample screen'), run: () => insertSample() }] : []),
    ]);
  }

  // ---------- incoming ----------
  function onWs(m) {
    if (!m || typeof m.type !== 'string' || !m.type.startsWith('cnv')) return;
    if (m.project && m.project !== pid()) return;
    if (m.type === 'cnv-files') { loadFiles(); return; }
    if (m.file !== fileId) return;
    if (m.type === 'cnv' && Array.isArray(m.ops)) {
      let changed = false;
      for (const op of m.ops) {
        const cur = S.nodes.get(op.id);
        if (!cur || m.by === 'server' || (op.v || 0) > (cur.v || 0)) { S.nodes.set(op.id, op); changed = true; }
      }
      if (changed && !gesture) renderAll();
      return;
    }
    if (m.type === 'cnv-cursor' && m.by) {
      if (m.gone || m.x > 9e5) peers.delete(m.by); else peers.set(m.by, { name: m.name, color: m.color, x: m.x, y: m.y, at: Date.now() });
      drawPeers(); paintOv(); return;
    }
    if (m.type === 'cnv-error') { toast(m.error); loadedFor = ''; if (open) load(); }
  }
  function drawPeers() {
    const box = $('#cv-peers'); if (!box) return;
    box.innerHTML = [...peers.values()].slice(0, 6).map(p => `<span class="cv-peer" style="--pc:${esc(p.color)}" title="${esc(p.name)}">${esc((p.name || '?').slice(0, 1).toUpperCase())}</span>`).join('');
  }
  setInterval(() => { let gone = false; for (const [k, p] of peers) if (Date.now() - p.at > 20000) { peers.delete(k); gone = true; } if (gone && open) { drawPeers(); paintOv(); } }, 4000);

  // ---------- a sample to start from: a café app home screen with components and auto layout ----------
  function insertSample() {
    if (!canEdit) return toast(T('View only'));
    const id = () => S.rid();
    const ox = (() => { const rs = S.roots().map(n => wbox(n.id)).filter(Boolean); return rs.length ? Math.round(Math.max(...rs.map(b => b.x + b.w)) + 160) : 0; })();
    const N = (t, o) => put(makeNode(t, o));
    const text = (p, i, c, s, wt, col, extra) => N('text', Object.assign({ p, i, name: c.slice(0, 24), tx: { c, f: 'Inter', s, wt, lh: 1.3, al: 'left', col } }, extra || {}));
    // components first (to the right of the screen)
    const card = N('component', { id: id(), name: 'Drink card', x: ox + 470, y: 120, w: 342, h: 88, fill: '#FFFFFF', r: 16, stroke: '#EFE6DC', sw: 1, clip: true, lay: { d: 'row', g: 14, p: [12, 16, 12, 12], ai: 'center', jc: 'start' }, sz: { h: 'fixed', v: 'hug' } });
    N('rect', { p: card.id, i: 1, name: 'Photo', w: 64, h: 64, fill: '#E9D8C4', r: 12 });
    const info = N('frame', { p: card.id, i: 2, name: 'Info', fill: undefined, clip: false, lay: { d: 'col', g: 4, p: [0, 0, 0, 0], ai: 'start', jc: 'start' }, sz: { h: 'fill', v: 'hug' } });
    delete S.get(info.id).fill;
    const nameT = text(info.id, 1, 'Flat white', 16, 600, '#2B1D14');
    const subT = text(info.id, 2, 'Double shot · oat milk', 13, 400, '#8A7563');
    const price = text(card.id, 3, '$4.50', 16, 700, '#2B1D14');
    const btn = N('component', { id: id(), name: 'Button', x: ox + 470, y: 260, w: 342, h: 52, fill: '#F26B1D', r: 14, clip: true, lay: { d: 'row', g: 8, p: [16, 24, 16, 24], ai: 'center', jc: 'center' }, sz: { h: 'fixed', v: 'hug' } });
    const btnT = text(btn.id, 1, 'Order ahead', 16, 600, '#FFFFFF');
    // the screen
    const scr = N('frame', { id: id(), name: 'Café · Home', x: ox, y: 0, w: 390, h: 844, fill: '#FBF7F2', clip: true, lay: { d: 'col', g: 20, p: [56, 24, 32, 24], ai: 'stretch', jc: 'start' } });
    const top = N('frame', { p: scr.id, i: 1, name: 'Top bar', clip: false, lay: { d: 'row', g: 12, p: [0, 0, 0, 0], ai: 'center', jc: 'between' }, sz: { h: 'fill', v: 'hug' } }); delete S.get(top.id).fill;
    const greet = N('frame', { p: top.id, i: 1, name: 'Greeting', clip: false, lay: { d: 'col', g: 2, p: [0, 0, 0, 0], ai: 'start', jc: 'start' }, sz: { h: 'hug', v: 'hug' } }); delete S.get(greet.id).fill;
    text(greet.id, 1, 'Good morning', 14, 500, '#8A7563');
    text(greet.id, 2, 'Sam', 28, 700, '#2B1D14');
    N('ellipse', { p: top.id, i: 2, name: 'Avatar', w: 44, h: 44, fill: '#38C6B1' });
    const search = N('frame', { p: scr.id, i: 2, name: 'Search', fill: '#FFFFFF', r: 14, stroke: '#EFE6DC', sw: 1, clip: true, lay: { d: 'row', g: 10, p: [14, 16, 14, 16], ai: 'center', jc: 'start' }, sz: { h: 'fill', v: 'hug' } });
    N('ellipse', { p: search.id, i: 1, name: 'Search icon', w: 16, h: 16, stroke: '#8A7563', sw: 2 }); delete S.get(S.kids(search.id)[0].id).fill;
    text(search.id, 2, 'Search drinks and treats', 15, 400, '#A8968A');
    const promo = N('frame', { p: scr.id, i: 3, name: 'Promo', fill: '#2B1D14', r: 20, clip: true, lay: { d: 'col', g: 6, p: [20, 20, 20, 20], ai: 'start', jc: 'start' }, sz: { h: 'fill', v: 'hug' } });
    text(promo.id, 1, 'THIS WEEK', 11, 700, '#F2B38A');
    text(promo.id, 2, 'Maple cold brew is back', 22, 700, '#FFFFFF');
    text(promo.id, 3, 'Free upgrade with any pastry before 10am.', 14, 400, '#D9C8BA', { sz: { h: 'fill', v: 'hug' } });
    text(scr.id, 4, 'Popular near you', 18, 700, '#2B1D14');
    const list = N('frame', { p: scr.id, i: 5, name: 'Popular', clip: false, lay: { d: 'col', g: 12, p: [0, 0, 0, 0], ai: 'stretch', jc: 'start' }, sz: { h: 'fill', v: 'hug' } }); delete S.get(list.id).fill;
    const drinks = [['Flat white', 'Double shot · oat milk', '$4.50', null], ['Maple cold brew', 'Slow steeped · 16 oz', '$5.25', '#D9B48F'], ['Matcha latte', 'Ceremonial grade · iced', '$5.75', '#B9D3A0']];
    drinks.forEach(([n, s, p, photo], k) => {
      const inst = put(makeNode('instance', { comp: card.id, p: list.id, i: k + 1, name: 'Drink card', w: 342, h: 88, sz: { h: 'fill', v: 'hug' } }));
      const ov = {}; if (k) { ov[nameT.id] = { c: n }; ov[subT.id] = { c: s }; ov[price.id] = { c: p }; if (photo) ov[S.kids(card.id)[0].id] = { fill: photo }; }
      if (Object.keys(ov).length) S.get(inst.id).ov = ov;
    });
    const spacer = N('frame', { p: scr.id, i: 6, name: 'Spacer', clip: false, h: 1, sz: { h: 'fill', v: 'fill' } }); delete S.get(spacer.id).fill;
    const cta = put(makeNode('instance', { comp: btn.id, p: scr.id, i: 7, name: 'Button', w: 342, h: 52, sz: { h: 'fill', v: 'hug' } }));
    void btnT; void cta;
    sel = [scr.id]; inner = null;
    end();
    requestAnimationFrame(() => fit());
  }

  // ---------- the editor API the panels use ----------
  const E = {
    S, T, esc, svg,
    get sel() { return sel; }, get inner() { return inner; }, get canEdit() { return canEdit; }, get tool() { return tool; },
    select(ids, opts = {}) { inner = null; sel = opts.add ? [...new Set([...sel, ...ids])] : [...ids]; paintOv(); panels(); },
    selectInner(inst, src) { sel = [inst]; inner = { inst, src }; paintOv(); panels(); },
    patch(id, p) { if (!canEdit) return; patch(id, p); end(true); },
    patchMany(ids, fn) { if (!canEdit) return; for (const id of ids) { const n = S.get(id); if (n) { const c = clone(n); fn(c); put(c); } } end(true); },
    override(inst, src, o) { if (!canEdit) return; const n = S.get(inst); if (!n) return; const ov = clone(n.ov || {}); const k = src || 'self'; ov[k] = Object.assign({}, ov[k], o); for (const key of Object.keys(ov[k])) if (ov[k][key] === undefined) delete ov[k][key]; if (!Object.keys(ov[k]).length) delete ov[k]; put(Object.assign(clone(n), { ov })); end(true); },
    resetOverrides(inst) { if (!canEdit) return; const n = S.get(inst); if (!n) return; const c = clone(n); delete c.ov; put(c); end(true); },
    move(id, parent, before) {   // layers panel drag: put id inside parent, before sibling `before` (or last)
      if (!canEdit) return; const n = S.get(id); if (!n || id === parent || S.isAncestor(id, parent)) return;
      const sibs = S.kids(parent || '').filter(s => s.id !== id); const k = before ? sibs.findIndex(s => s.id === before) : sibs.length;
      const prev = sibs[k - 1], next = sibs[k];
      const i = prev && next ? ((prev.i || 0) + (next.i || 0)) / 2 : prev ? (prev.i || 0) + 1 : next ? (next.i || 0) - 1 : 1;
      const c = Object.assign(clone(n), { i });
      if ((n.p || '') !== (parent || '')) { const b = wbox(id); const pn = S.get(parent); if (b && !(pn && pn.lay)) { const loc = toLocal(b, parent); c.x = Math.round(loc.x); c.y = Math.round(loc.y); } c.p = parent || ''; }
      put(c); end();
    },
    rename(id, name) { if (!canEdit) return; patch(id, { name: String(name).slice(0, 80) }); end(true); },
    toggle(id, key) { if (!canEdit) return; const n = S.get(id); if (!n) return; const c = clone(n); if (c[key]) delete c[key]; else c[key] = true; put(c); end(true); },
    insertInstance, makeComponent, autoLayout, group, ungroup, duplicate, removeSel,
    detach(id) { if (!canEdit) return; const f = detach(id); if (f) { sel = [f.id]; inner = null; end(); } },
    goToMain(id) { const n = S.get(id); if (!n) return; const cid = n.t === 'instance' ? n.comp : id; sel = [cid]; inner = null; fit(true); paintOv(); panels(); },
    wbox, fit, zoomTo, toHTML: id => SC.toHTML(S, id),
    get view() { return view; }, get stage() { return stage; }, get world() { return world; }, get file() { return fileId; }, get fileName() { return fileName; }, menu, toast,
    elOf: id => elMap.get(id) || null,
    // P1-C: drop a set of new nodes in (first one is the top), one undo step, select and show it
    addNodes(list) { if (!canEdit || !list || !list.length) return null; for (const n of list) put(Object.assign({ v: 0 }, n)); sel = [list[0].id]; inner = null; end(); requestAnimationFrame(() => fit(true)); return list[0].id; },
    focus: () => stage && stage.focus({ preventScroll: true }),
    // P1-F hooks (app/ui/canvas/flint.js): Flint's free moves land as this person's own change, so Ctrl Z undoes them
    get file() { return fileId; },
    elOf: id => elOf(id),
    insert(nodes, focus) { if (!canEdit || !Array.isArray(nodes) || !nodes.length) return; for (const n of nodes) { const c = clone(n); delete c.v; put(c); } sel = focus && S.get(focus) ? [focus] : []; inner = null; end(); if (focus) requestAnimationFrame(() => { fit(true); if (view.z > 1) zoomTo(1); }); },
    apply(nodes) { if (!canEdit || !Array.isArray(nodes) || !nodes.length) return; for (const n of nodes) { if (!S.nodes.get(n.id)) continue; const c = clone(n); delete c.v; put(c); } end(true); },
  };

  // ---------- keep in step ----------
  C.on('ws', onWs);
  C.on('hello', () => { setTimeout(fromHash, 50); if (open) { loadedFor = ''; load(); } });
  C.on('project', () => { fileId = 'main'; loadedFor = ''; peers.clear(); if (open) load(); });
  setTimeout(fromHash, 0);

  window.TribeCanvas = {
    open: id => show(id), close: () => { if (open && window.TribeApp) window.TribeApp.show('home'); },
    state: () => ({ open, file: fileId, name: fileName, canEdit, tool, view: { ...view }, selected: [...sel], inner: inner ? { ...inner } : null, undo: undo.length, redo: redo.length, peers: [...peers.keys()],
      nodes: S.live().map(clone) }),
    exportFrame: id => SC.toHTML(S, id),   // P1-C: { html, css, name } for a frame, written to the project by server/canvascode.js
    insertSample: () => insertSample(),
    box: id => wbox(id),
    _e: E,
  };
})();
