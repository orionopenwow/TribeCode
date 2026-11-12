// Whiteboard (feat/whiteboard, #/whiteboard): a shared, persistent board for the crew. Draw, add shapes, text and
// sticky notes, paste pictures; everyone in the project sees changes and cursors live. Added from the sidebar's
// + Add gallery (built-in widget 'whiteboard', widgets.js); Flint opens it ("open the whiteboard").
//   Tools: select/move (V), pen (P), rectangle (R), ellipse (O), arrow (A), line (L), text (T), sticky note (S),
//          eraser (E), picture (I). Undo/redo are yours only (Ctrl Z / Ctrl Shift Z). Delete, Ctrl D duplicates.
//   Pan: space + drag, middle mouse, or scroll; zoom: Ctrl + scroll / pinch. Phones: one finger draws, two pan and zoom.
// Original, dependency-free canvas code (Excalidraw is MIT but React and a large bundle; tldraw's SDK license is not
// open for commercial use). Server: server/whiteboard.js (/api/whiteboard, WebSocket 'wbd-*').
//   window.TribeWhiteboard = { open(boardId?), close(), state() }
(function () {
  // feat/setup-local: a board kept on this device (localfiles.js) swaps in its own small backend (api/send/state) while open.
  const RC = window.TribeClient; let LB = null;
  const C = new Proxy(RC, { get: (t, k) => (LB && k in LB ? LB[k] : t[k]) });
  const NAME = 'whiteboard';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const token = () => ((window.TribeStore && window.TribeStore.get().server) || {}).token || '';
  const pid = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C.project && C.project()) || '';
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const me = () => (C.state && C.state().me) || {};

  // Campfire palette: ink colors for lines and text, flat fills for sticky notes (dark text on them).
  const COLORS = ['#F8FAFC', '#F26B1D', '#38C6B1', '#6C7CFF', '#3BD16F', '#FF6F8E', '#FFB86B', '#94A3B8'];
  const STICKY = ['#FFB86B', '#38C6B1', '#8F9BFF', '#FF8FA8', '#6EDC93', '#CBD5E1'];
  const WIDTHS = [2, 4, 8];
  const SHAPES = ['rect', 'ellipse', 'arrow', 'line'];
  const FONT = "'Inter', system-ui, sans-serif";
  const ICON = {   // 20px line icons, drawn here so the board needs nothing else
    select: '<path d="M5 3l12 7-5 1.5L9.5 17z"/>',
    pen: '<path d="M4 16c3-1 4-5 7-8s5-3 5-3-0 2-3 5-7 4-8 7"/><path d="M3 17l1-1"/>',
    rect: '<rect x="3.5" y="5" width="13" height="10" rx="1.5"/>',
    ellipse: '<ellipse cx="10" cy="10" rx="7" ry="5.5"/>',
    arrow: '<path d="M4 16L16 4M9 4h7v7"/>',
    line: '<path d="M4 16L16 4"/>',
    text: '<path d="M5 5h10M10 5v11M7.5 16h5"/>',
    sticky: '<path d="M4 4h12v8l-4 4H4z"/><path d="M12 16v-4h4"/>',
    eraser: '<path d="M8 16h8M4.5 12.5l6-6a1.5 1.5 0 012 0l3 3a1.5 1.5 0 010 2L11 16H8z"/>',
    image: '<rect x="3.5" y="4.5" width="13" height="11" rx="1.5"/><circle cx="8" cy="8.5" r="1.3"/><path d="M4 14l4-3.5 3 2.5 2-1.5 3 2.5"/>',
    undo: '<path d="M7 7H4V4"/><path d="M4.5 7A6 6 0 1110 16"/>',
    redo: '<path d="M13 7h3V4"/><path d="M15.5 7A6 6 0 1010 16"/>',
    trash: '<path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"/>',
    copy: '<rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M13 4.5H5.5A1 1 0 004.5 5.5V13"/>',
    more: '<circle cx="5" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="15" cy="10" r="1.2"/>',
    minus: '<path d="M5 10h10"/>', plus: '<path d="M5 10h10M10 5v10"/>', fit: '<path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4"/>',
    down: '<path d="M6 8l4 4 4-4"/>', x: '<path d="M5 5l10 10M15 5L5 15"/>',
  };
  const svg = (k, sz = 20) => `<svg class="wbd-i" width="${sz}" height="${sz}" viewBox="0 0 20 20" aria-hidden="true">${ICON[k]}</svg>`;
  const LABEL = { select: 'Select and move (V)', pen: 'Pen (P)', rect: 'Rectangle (R)', ellipse: 'Ellipse (O)', arrow: 'Arrow (A)', line: 'Line (L)', text: 'Text (T)', sticky: 'Sticky note (S)', eraser: 'Eraser (E)', image: 'Picture (I)' };
  const KEYS = { v: 'select', p: 'pen', r: 'rect', o: 'ellipse', a: 'arrow', l: 'line', t: 'text', s: 'sticky', e: 'eraser' };

  // ---------- state ----------
  let open = false, built = false;
  let boardId = 'main', boardName = 'Team board', boards = [], canEdit = false, canManage = false, loadedFor = '';
  let els = new Map();            // id -> element (tombstones kept with del: true, for versions)
  let view = { x: 0, y: 0, z: 1 }; // screen = world * z + (x, y)
  let tool = 'pen', shape = 'rect', color = COLORS[0], sw = 4, fill = STICKY[0];
  let sel = new Set();
  let undo = [], redo = [];
  const peers = new Map();        // member id -> { name, color, x, y, at }
  const imgs = new Map();         // upload id -> Image
  let cv = null, ctx = null, stage = null, dpr = 1, W = 0, H = 0;
  let editing = null;             // { el, ta, isNew, before }
  let gesture = null, marquee = null, spaceDown = false;
  const touches = new Map();      // pointerId -> { x, y } (screen)
  let pinch = null;

  const section = () => document.getElementById('view-' + NAME);
  const live = () => [...els.values()].filter(e => !e.del);
  const sorted = () => live().sort((a, b) => (a.z || 0) - (b.z || 0));
  const topZ = () => live().reduce((m, e) => Math.max(m, Number(e.z) || 0), 0) + 1;
  const toWorld = (sx, sy) => ({ x: (sx - view.x) / view.z, y: (sy - view.y) / view.z });
  const toScreen = (wx, wy) => ({ x: wx * view.z + view.x, y: wy * view.z + view.y });
  const clone = e => (e ? JSON.parse(JSON.stringify(e)) : null);
  const viewKey = () => `tribecode.wbd.view:${pid()}:${boardId}`;

  // ---------- mounting (beside app.js views, like the Secretary) ----------
  function ensureSection() {
    let sec = section(); if (sec) return sec;
    const main = $('#main') || $('.main'); if (!main) return null;
    sec = document.createElement('section'); sec.id = 'view-' + NAME; sec.className = 'hidden'; main.appendChild(sec);
    return sec;
  }
  function show(id, opts) {
    const sec = ensureSection(); if (!sec) return;
    const nb = (opts && opts.backend) || null; if (nb !== LB) { LB = nb; loadedFor = ''; if (!nb && !id) boardId = 'main'; }
    if (id && id !== boardId) { boardId = id; loadedFor = ''; }
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    document.querySelectorAll('[data-nav].on, [data-go].on').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('#nest-extra .nest-row.on').forEach(b => b.classList.remove('on'));
    const row = $('#wg-whiteboard'); if (row) row.classList.add('on');
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = 'Whiteboard';
    if (location.hash !== '#/' + NAME) history.replaceState(null, '', location.pathname + location.search + '#/' + NAME);
    try { C.sendActivity && C.sendActivity('Whiteboard'); } catch {}
    if (!built) build();
    resize(); load(); setTimeout(resize, 400);   // again once the phone panel has slid away
  }
  function hide() {
    const sec = section(); if (sec) sec.classList.add('hidden');
    if (open) { commitEdit(); C.send({ type: 'wbd-leave', board: boardId }); }
    open = false; closePop();
    const row = $('#wg-whiteboard'); if (row) row.classList.remove('on');
    if (location.hash === '#/' + NAME) history.replaceState(null, '', location.pathname + location.search);
  }
  addEventListener('resize', () => { if (open) resize(); });
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  const fromHash = () => { if (location.hash === '#/' + NAME && !open && C.hasToken && C.hasToken()) show(); };
  addEventListener('hashchange', fromHash);

  // ---------- the page ----------
  function toolBtn(k) { return `<button class="wbd-tool" data-tool="${k}" id="wbd-t-${k}" title="${esc(LABEL[k])}" aria-label="${esc(LABEL[k].replace(/ \(.\)$/, ''))}">${svg(k)}</button>`; }
  function build() {
    const sec = ensureSection(); built = true;
    sec.innerHTML = `<div class="wbd" id="wbd">
      <header class="wbd-head">
        <div class="wbd-title"><span class="eyebrow">Whiteboard</span>
          <button class="wbd-name" id="wbd-name" aria-haspopup="menu" title="Boards"><span id="wbd-name-t">Team board</span>${svg('down', 16)}</button></div>
        <div class="wbd-peers" id="wbd-peers" aria-label="Here now"></div>
        <span class="wbd-ro" id="wbd-ro" hidden>👀 View only</span>
        <div class="wbd-acts">
          <button class="btn wbd-btn" id="wbd-export" aria-haspopup="menu">Export</button>
        </div>
      </header>
      <div class="wbd-stage" id="wbd-stage">
        <canvas id="wbd-canvas" aria-label="Whiteboard canvas" tabindex="0"></canvas>
        <div class="wbd-cursors" id="wbd-cursors" aria-hidden="true"></div>
        <div class="wbd-empty" id="wbd-empty" hidden><b>🖍️ A blank board</b><span>Draw, add a sticky note, or paste a picture. Everyone here sees it live.</span></div>
        <nav class="wbd-tools" id="wbd-tools" aria-label="Tools">
          ${toolBtn('select')}${toolBtn('pen')}
          <button class="wbd-tool" data-tool="shape" id="wbd-t-shape" title="Shapes" aria-label="Shapes" aria-haspopup="menu">${svg('rect')}</button>
          ${toolBtn('text')}${toolBtn('sticky')}${toolBtn('eraser')}
          <button class="wbd-tool wbd-desk" data-act="image" id="wbd-t-image" title="${LABEL.image}" aria-label="Add a picture">${svg('image')}</button>
          <span class="wbd-sep"></span>
          <button class="wbd-tool" data-act="undo" id="wbd-undo" title="Undo (Ctrl Z)" aria-label="Undo">${svg('undo')}</button>
          <button class="wbd-tool wbd-desk" data-act="redo" id="wbd-redo" title="Redo (Ctrl Shift Z)" aria-label="Redo">${svg('redo')}</button>
          <button class="wbd-tool wbd-ph" data-act="more" id="wbd-more" title="More" aria-label="More" aria-haspopup="menu">${svg('more')}</button>
        </nav>
        <div class="wbd-style" id="wbd-style" role="toolbar" aria-label="Style"></div>
        <div class="wbd-zoom wbd-desk" id="wbd-zoom">
          <button data-act="zout" title="Zoom out" aria-label="Zoom out">${svg('minus', 16)}</button><button data-act="z100" id="wbd-zpct" title="Reset zoom">100%</button><button data-act="zin" title="Zoom in" aria-label="Zoom in">${svg('plus', 16)}</button><button data-act="fit" title="Fit everything" aria-label="Fit everything">${svg('fit', 16)}</button>
        </div>
        <input type="file" id="wbd-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
      </div></div>`;
    stage = $('#wbd-stage'); cv = $('#wbd-canvas'); ctx = cv.getContext('2d');
    new ResizeObserver(() => { if (open) resize(); }).observe(stage);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', () => { if (!gesture) C.send({ type: 'wbd-cursor', board: boardId, x: 1e6, y: 1e6 }); });
    cv.addEventListener('dblclick', onDbl);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    stage.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });   // the phone panel's swipe stays out of drawing
    stage.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault(); });
    stage.addEventListener('drop', e => { const f = [...(e.dataTransfer.files || [])].find(x => /^image\//.test(x.type)); if (!f) return; e.preventDefault(); const r = cv.getBoundingClientRect(); addImage(f, toWorld(e.clientX - r.left, e.clientY - r.top)); });
    $('#wbd-tools').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool === 'shape') return shapeMenu(b);
      if (b.dataset.tool) return setTool(b.dataset.tool);
      act(b.dataset.act, b);
    });
    $('#wbd-zoom').addEventListener('click', e => { const b = e.target.closest('button'); if (b) act(b.dataset.act, b); });
    $('#wbd-style').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.color) { color = b.dataset.color; restyle({ color }); }
      if (b.dataset.fill) { fill = b.dataset.fill; restyle({ fill }); }
      if (b.dataset.sw) { sw = Number(b.dataset.sw); restyle({ sw }); }
      if (b.dataset.act) act(b.dataset.act, b);
      drawStyle();
    });
    $('#wbd-name').onclick = e => boardMenu(e.currentTarget);
    $('#wbd-export').onclick = e => exportMenu(e.currentTarget);
    $('#wbd-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) addImage(f, center()); };
    tool = isPhone() ? 'pen' : 'select'; cv.dataset.tool = tool;   // set after load (drawTools), once we know you can draw
  }

  function resize() {
    if (!cv || !stage) return;
    // phones: the bottom rack floats over the page; keep the board (and its toolbar) above it
    const rack = $('#tabbar'), wb = $('#wbd'), rr = rack && getComputedStyle(rack).position === 'fixed' && getComputedStyle(rack).display !== 'none' ? rack.getBoundingClientRect() : null;
    const under = isPhone() && rr && rr.height && rr.top > innerHeight / 2 ? Math.max(0, Math.round(innerHeight - rr.top)) : 0;
    if (wb && wb.style.paddingBottom !== under + 'px') wb.style.paddingBottom = under + 'px';
    const r = stage.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    paint();
  }

  // ---------- data ----------
  async function load() {
    const key = pid() + '/' + boardId;
    if (loadedFor === key) return paint();
    try {
      const [l, b] = await Promise.all([C.api('/whiteboard'), C.api('/whiteboard/' + encodeURIComponent(boardId))]);
      boards = l.boards || []; canEdit = !!b.canEdit; canManage = !!b.canManage;
      els = new Map(Object.values(b.board.elements || {}).map(e => [e.id, e]));
      boardName = b.board.name || 'Team board'; loadedFor = key;
      undo = []; redo = []; sel.clear(); peers.clear();
      let v = null; try { v = JSON.parse(localStorage.getItem(viewKey()) || 'null'); } catch {}
      if (v && Number.isFinite(v.z)) view = v; else fit(true);
    } catch (e) {
      if (e.status === 404 && boardId !== 'main') { boardId = 'main'; loadedFor = ''; return load(); }
      toast(e.message); return;
    }
    $('#wbd-name-t').textContent = boardName;
    $('#wbd-ro').hidden = canEdit;
    $('#wbd').classList.toggle('ro', !canEdit);
    if (!canEdit) setTool('select');
    drawTools(); drawStyle(); drawPeers(); paint();
  }
  async function loadBoards() { try { boards = (await C.api('/whiteboard')).boards || []; } catch {} }
  let saveViewT = null;
  const saveView = () => { clearTimeout(saveViewT); saveViewT = setTimeout(() => { try { localStorage.setItem(viewKey(), JSON.stringify(view)); } catch {} }, 300); };

  // ---------- sending: element-level last writer wins (server/whiteboard.js) ----------
  const pending = new Map(); let sendT = null;
  function queue(el) {
    pending.set(el.id, el.del ? { id: el.id, del: true, v: el.v } : el);
    if (!sendT) sendT = setTimeout(flushOps, 40);
  }
  function flushOps() {
    sendT = null; if (!pending.size) return;
    const ops = [...pending.values()].map(clone); pending.clear();
    const b = boardId;
    if (!C.send({ type: 'wbd-op', board: b, ops })) C.api(`/whiteboard/${encodeURIComponent(b)}/ops`, { method: 'POST', body: { ops } }).then(r => { (r.rejected || []).forEach(x => els.set(x.id, x)); paint(); }).catch(e => toast(e.message));
  }
  // put an element (or a tombstone) locally with a higher version, and send it
  function put(el) { const cur = els.get(el.id); if (!el.del) el.by = me().id; el.v = Math.max(el.v || 0, cur ? cur.v || 0 : 0) + 1; els.set(el.id, el); queue(el); return el; }
  function kill(id) { const cur = els.get(id); if (!cur || cur.del) return; put({ id, del: true }); sel.delete(id); }
  function record(pairs) { pairs = pairs.filter(p => JSON.stringify(p.before) !== JSON.stringify(p.after)); if (!pairs.length) return; undo.push(pairs); if (undo.length > 200) undo.shift(); redo = []; drawTools(); }
  function travel(from, to) {
    const pairs = from.pop(); if (!pairs) return;
    commitEdit(true);
    for (const p of pairs) { if (p.before) put(clone(p.before)); else kill(p.id); }
    to.push(pairs.map(p => ({ id: p.id, before: p.after, after: p.before })));
    sel = new Set(pairs.filter(p => p.before).map(p => p.id).filter(id => els.get(id) && !els.get(id).del));
    drawTools(); drawStyle(); paint();
  }

  // ---------- incoming ----------
  function onWs(m) {
    if (!m || typeof m.type !== 'string' || !m.type.startsWith('wbd')) return;
    if (m.project && m.project !== pid()) return;
    if (m.type === 'wbd-boards') { loadBoards(); return; }
    if (m.board !== boardId) return;
    if (m.type === 'wbd' && Array.isArray(m.ops)) {
      for (const op of m.ops) {
        const cur = els.get(op.id);
        if (editing && editing.el.id === op.id && m.by !== 'server') continue;   // you're typing in it
        if (!cur || m.by === 'server' || (op.v || 0) >= (cur.v || 0)) els.set(op.id, op);
        if (op.del) sel.delete(op.id);
      }
      paint(); return;
    }
    if (m.type === 'wbd-reset') {
      if (m.gone) { boardId = 'main'; toast('That board was deleted. Back to the team board.'); }
      else if (m.by !== me().id) toast('The board was cleared');
      loadedFor = ''; if (open) load(); return;
    }
    if (m.type === 'wbd-cursor' && m.by) {
      if (m.gone || m.x > 9e5) peers.delete(m.by); else peers.set(m.by, { name: m.name, color: m.color, x: m.x, y: m.y, at: Date.now() });
      drawCursors(); drawPeers(); return;
    }
    if (m.type === 'wbd-error') { toast(m.error); loadedFor = ''; if (open) load(); }
  }
  setInterval(() => { let gone = false; for (const [k, p] of peers) if (Date.now() - p.at > 20000) { peers.delete(k); gone = true; } if (gone) { drawCursors(); drawPeers(); } }, 4000);

  // ---------- geometry ----------
  function box(e) {
    if (e.pts) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of e.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } const p = (e.sw || 2) / 2; return { x: x0 - p, y: y0 - p, w: x1 - x0 + 2 * p, h: y1 - y0 + 2 * p }; }
    if (e.t === 'text') { const m = measureText(e); return { x: e.x, y: e.y, w: m.w, h: m.h }; }
    return { x: Math.min(e.x, e.x + e.w), y: Math.min(e.y, e.y + e.h), w: Math.abs(e.w), h: Math.abs(e.h) };
  }
  const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); };
  function hit(e, p, tol) {
    const b = box(e);
    if (p.x < b.x - tol || p.y < b.y - tol || p.x > b.x + b.w + tol || p.y > b.y + b.h + tol) return false;
    if (e.pts) { const r = (e.sw || 2) / 2 + tol; if (e.pts.length === 1) return Math.hypot(p.x - e.pts[0][0], p.y - e.pts[0][1]) <= r; for (let i = 1; i < e.pts.length; i++) if (segDist(p.x, p.y, e.pts[i - 1][0], e.pts[i - 1][1], e.pts[i][0], e.pts[i][1]) <= r) return true; return false; }
    if (e.t === 'rect') { if (e.fill) return true; const inX = p.x > b.x + tol && p.x < b.x + b.w - tol, inY = p.y > b.y + tol && p.y < b.y + b.h - tol; return !(inX && inY) || (b.w < 30 || b.h < 30); }
    if (e.t === 'ellipse') { const rx = b.w / 2, ry = b.h / 2, cx = b.x + rx, cy = b.y + ry; const d = Math.hypot((p.x - cx) / Math.max(1, rx), (p.y - cy) / Math.max(1, ry)); return e.fill ? d <= 1 + tol / Math.max(rx, ry) : Math.abs(d - 1) * Math.min(rx, ry) <= tol + (e.sw || 2) || Math.min(rx, ry) < 15; }
    return true;   // text, sticky, image: the whole box
  }
  function hitTop(p) { const tol = 6 / view.z; const list = sorted(); for (let i = list.length - 1; i >= 0; i--) if (hit(list[i], p, tol)) return list[i]; return null; }
  function selBox() { const bs = [...sel].map(id => els.get(id)).filter(e => e && !e.del).map(box); if (!bs.length) return null; const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.w)), y1 = Math.max(...bs.map(b => b.y + b.h)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
  function handleAt(sp) {   // the resize corner of a single selected element (screen coords)
    if (sel.size !== 1 || !canEdit) return false;
    const b = selBox(); if (!b) return false;
    const c = toScreen(b.x + b.w, b.y + b.h); return Math.hypot(sp.x - c.x, sp.y - c.y) <= (isPhone() ? 18 : 9);
  }
  function translate(e, dx, dy) { if (e.pts) e.pts = e.pts.map(([x, y]) => [Math.round((x + dx) * 10) / 10, Math.round((y + dy) * 10) / 10]); else { e.x += dx; e.y += dy; } }
  function scaleTo(e, from, to) {   // map element e (a copy) from box `from` to box `to`
    const sx = from.w ? to.w / from.w : 1, sy = from.h ? to.h / from.h : 1;
    if (e.pts) e.pts = e.pts.map(([x, y]) => [Math.round((to.x + (x - from.x) * sx) * 10) / 10, Math.round((to.y + (y - from.y) * sy) * 10) / 10]);
    else if (e.t === 'text') { e.size = Math.max(8, Math.min(160, Math.round((e.size || 22) * Math.max(0.1, sy)))); }
    else { const b = box(e); e.x = to.x + (b.x - from.x) * sx; e.y = to.y + (b.y - from.y) * sy; e.w = Math.max(8, b.w * sx); e.h = Math.max(8, b.h * sy); }
  }
  function center() { return toWorld(W / 2, H / 2); }
  // Ramer-Douglas-Peucker: drop points that add nothing (keeps strokes light to sync)
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    let dmax = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]); if (d > dmax) { dmax = d; idx = i; } }
    if (dmax <= eps) return [a, b];
    return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
  }

  // ---------- drawing ----------
  const mctx = document.createElement('canvas').getContext('2d');
  function wrap(c, text, maxW) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      if (!maxW) { out.push(para); continue; }
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const tryL = line + word;
        if (c.measureText(tryL).width > maxW && line.trim()) { out.push(line.trimEnd()); line = word.trimStart(); }
        else line = tryL;
        while (c.measureText(line).width > maxW && line.length > 1) { let n = line.length - 1; while (n > 1 && c.measureText(line.slice(0, n)).width > maxW) n--; out.push(line.slice(0, n)); line = line.slice(n); }
      }
      out.push(line);
    }
    return out;
  }
  function measureText(e) {
    const s = e.size || 22; mctx.font = `500 ${s}px ${FONT}`;
    const lines = String(e.text || '').split('\n'); const w = Math.max(s * 0.6, ...lines.map(l => mctx.measureText(l).width));
    return { w: w + 4, h: lines.length * s * 1.3 + 4 };
  }
  function imgFor(src) {
    if (imgs.has(src)) return imgs.get(src);
    const im = new Image(); im.decoding = 'async';
    im.onload = () => paint(); im.onerror = () => { im.failed = true; paint(); };
    if (/^local:/.test(src)) {   // polish: a picture on a board kept on this device (localfiles.js, IndexedDB)
      const LF = window.TribeLocalFiles; if (LF && LF.imageUrl) LF.imageUrl(src).then(x => { im.src = x; }, () => { im.failed = true; paint(); }); else im.failed = true;
      imgs.set(src, im); return im;
    }
    const u = `${C.base()}/api/uploads/${encodeURIComponent(src)}/raw`;   // fix/security-2: signed link, not the sign-in key
    if (window.TribeMedia) window.TribeMedia.urlAsync(u).then(x => { im.src = x; }); else im.src = u;
    imgs.set(src, im); return im;
  }
  function arrowHead(c, a, b, size) {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = size;
    c.beginPath(); c.moveTo(b[0] - s * Math.cos(ang - 0.45), b[1] - s * Math.sin(ang - 0.45)); c.lineTo(b[0], b[1]); c.lineTo(b[0] - s * Math.cos(ang + 0.45), b[1] - s * Math.sin(ang + 0.45)); c.stroke();
  }
  function drawEl(c, e) {
    c.save();
    c.strokeStyle = e.color || '#F8FAFC'; c.fillStyle = e.color || '#F8FAFC'; c.lineWidth = e.sw || 2; c.lineCap = 'round'; c.lineJoin = 'round';
    if (e.t === 'stroke') {
      const p = e.pts;
      if (p.length === 1) { c.beginPath(); c.arc(p[0][0], p[0][1], (e.sw || 2) / 2, 0, Math.PI * 2); c.fill(); }
      else {   // smooth: quadratic curves through the midpoints
        c.beginPath(); c.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length - 1; i++) c.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
        c.lineTo(p[p.length - 1][0], p[p.length - 1][1]); c.stroke();
      }
    } else if (e.t === 'line' || e.t === 'arrow') {
      const [a, b] = e.pts; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      if (e.t === 'arrow') arrowHead(c, a, b, Math.max(10, (e.sw || 2) * 3.2));
    } else if (e.t === 'rect' || e.t === 'ellipse') {
      const b = box(e); c.beginPath();
      if (e.t === 'rect') { const r = Math.min(8, b.w / 4, b.h / 4); c.roundRect ? c.roundRect(b.x, b.y, b.w, b.h, r) : c.rect(b.x, b.y, b.w, b.h); }
      else c.ellipse(b.x + b.w / 2, b.y + b.h / 2, Math.max(0.5, b.w / 2), Math.max(0.5, b.h / 2), 0, 0, Math.PI * 2);
      if (e.fill) { c.fillStyle = e.fill; c.fill(); }
      c.stroke();
    } else if (e.t === 'text') {
      if (editing && editing.el.id === e.id) { c.restore(); return; }
      const s = e.size || 22; c.font = `500 ${s}px ${FONT}`; c.textBaseline = 'top';
      String(e.text || '').split('\n').forEach((l, i) => c.fillText(l, e.x + 2, e.y + 2 + i * s * 1.3));
    } else if (e.t === 'sticky') {
      const b = box(e); c.fillStyle = e.fill || STICKY[0];
      c.beginPath(); c.roundRect ? c.roundRect(b.x, b.y, b.w, b.h, 6) : c.rect(b.x, b.y, b.w, b.h); c.fill();
      c.fillStyle = 'rgba(18,21,26,0.10)'; c.fillRect(b.x, b.y, b.w, 6);   // a flat tab, a luminance step (no shadow)
      if (!(editing && editing.el.id === e.id)) {
        const s = e.size || 18; c.font = `500 ${s}px ${FONT}`; c.textBaseline = 'top'; c.fillStyle = '#12151A';
        c.save(); c.beginPath(); c.rect(b.x, b.y, b.w, b.h); c.clip();
        wrap(c, e.text, b.w - 28).forEach((l, i) => c.fillText(l, b.x + 14, b.y + 18 + i * s * 1.35));
        c.restore();
      }
      if (e.agent) { c.font = `600 11px ${FONT}`; c.fillStyle = 'rgba(18,21,26,0.55)'; c.textBaseline = 'bottom'; c.fillText('🤖 agent', b.x + 14, b.y + b.h - 8); }
    } else if (e.t === 'image') {
      const b = box(e), im = imgFor(e.src);
      if (im.complete && im.naturalWidth && !im.failed) c.drawImage(im, b.x, b.y, b.w, b.h);
      else { c.fillStyle = '#1E242D'; c.fillRect(b.x, b.y, b.w, b.h); c.strokeStyle = '#2A313C'; c.lineWidth = 1; c.strokeRect(b.x, b.y, b.w, b.h); }
    }
    c.restore();
  }
  const css = (n, f) => { try { return getComputedStyle(document.body).getPropertyValue(n).trim() || f; } catch { return f; } };
  let raf = 0;
  function paint() { if (!raf) raf = requestAnimationFrame(render); }
  function render() {
    raf = 0; if (!ctx || !open) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css('--canvas', '#12151A'); ctx.fillRect(0, 0, W, H);
    // dot grid: a quiet luminance step, every 24 units (48 when zoomed out)
    const step = view.z < 0.5 ? 96 : view.z < 1 ? 48 : 24, gs = step * view.z;
    if (gs >= 10) {
      ctx.fillStyle = css('--edge', '#2A313C');
      const ox = ((view.x % gs) + gs) % gs, oy = ((view.y % gs) + gs) % gs;
      for (let x = ox; x < W; x += gs) for (let y = oy; y < H; y += gs) ctx.fillRect(Math.round(x), Math.round(y), 1.5, 1.5);
    }
    ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
    const vw = { x: -view.x / view.z, y: -view.y / view.z, w: W / view.z, h: H / view.z };
    for (const e of sorted()) { const b = box(e); if (b.x > vw.x + vw.w || b.y > vw.y + vw.h || b.x + b.w < vw.x || b.y + b.h < vw.y) continue; drawEl(ctx, e); }
    // selection
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = '#38C6B1'; ctx.lineWidth = 1;
    for (const id of sel) { const e = els.get(id); if (!e || e.del) continue; const b = box(e), a = toScreen(b.x, b.y); ctx.strokeRect(Math.round(a.x - 4) + 0.5, Math.round(a.y - 4) + 0.5, Math.round(b.w * view.z + 8), Math.round(b.h * view.z + 8)); }
    if (sel.size === 1 && canEdit) { const b = selBox(); if (b) { const c = toScreen(b.x + b.w, b.y + b.h); ctx.fillStyle = css('--surface', '#1B2028'); const r = isPhone() ? 7 : 5; ctx.fillRect(c.x - r + 4, c.y - r + 4, r * 2, r * 2); ctx.strokeRect(c.x - r + 4.5, c.y - r + 4.5, r * 2 - 1, r * 2 - 1); } }
    if (marquee) { const a = toScreen(Math.min(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1)); ctx.fillStyle = 'rgba(56,198,177,0.08)'; const w = Math.abs(marquee.x1 - marquee.x0) * view.z, h = Math.abs(marquee.y1 - marquee.y0) * view.z; ctx.fillRect(a.x, a.y, w, h); ctx.strokeRect(a.x + 0.5, a.y + 0.5, w, h); }
    if (gesture && gesture.kind === 'erase' && gesture.at) { ctx.strokeStyle = css('--faint', '#A3AEBD'); ctx.beginPath(); ctx.arc(gesture.at.x, gesture.at.y, 10, 0, Math.PI * 2); ctx.stroke(); }
    const empty = $('#wbd-empty'); if (empty) empty.hidden = live().length > 0 || !!gesture;
    const z = $('#wbd-zpct'); if (z) z.textContent = Math.round(view.z * 100) + '%';
    drawCursors();
    if (editing) placeEditor();
  }
  function drawCursors() {
    const box_ = $('#wbd-cursors'); if (!box_) return;
    box_.innerHTML = [...peers.entries()].map(([id, p]) => { const s = toScreen(p.x, p.y); if (s.x < -20 || s.y < -20 || s.x > W + 20 || s.y > H + 20) return '';
      return `<div class="wbd-cur" data-peer="${esc(id)}" style="transform:translate(${Math.round(s.x)}px,${Math.round(s.y)}px);--c:${esc(p.color || '#6C7CFF')}"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 1l11 6-5 1.5L5.5 14z" fill="var(--c)" stroke="#12151A" stroke-width="1"/></svg><span>${esc(p.name || 'someone')}</span></div>`; }).join('');
  }
  function drawPeers() {
    const el = $('#wbd-peers'); if (!el) return;
    const list = [...peers.values()].slice(0, 5);
    el.innerHTML = list.map(p => `<span class="wbd-peer" style="--c:${esc(p.color || '#6C7CFF')}" title="${esc(p.name)} is here">${esc((p.name || '?').slice(0, 1).toUpperCase())}</span>`).join('');
  }

  // ---------- tools + style bar ----------
  function setTool(t) {
    if (!canEdit && t !== 'select') { toast('You can look, not draw: spectators view the board.'); t = 'select'; }
    commitEdit();
    if (SHAPES.includes(t)) { shape = t; t = 'shape'; }
    tool = t; if (t !== 'select') { sel.clear(); }
    if (cv) cv.dataset.tool = t;
    drawTools(); drawStyle(); paint();
  }
  const curTool = () => (tool === 'shape' ? shape : tool);
  function drawTools() {
    const bar = $('#wbd-tools'); if (!bar) return;
    bar.querySelectorAll('[data-tool]').forEach(b => { const on = b.dataset.tool === tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const sb = $('#wbd-t-shape'); if (sb) sb.innerHTML = svg(shape) + '<i class="wbd-caret"></i>';
    const u = $('#wbd-undo'), r = $('#wbd-redo'); if (u) u.disabled = !undo.length || !canEdit; if (r) r.disabled = !redo.length || !canEdit;
    bar.querySelectorAll('[data-tool]:not([data-tool="select"]), [data-act="image"]').forEach(b => { b.hidden = !canEdit; });
  }
  function drawStyle() {
    const bar = $('#wbd-style'); if (!bar) return;
    const selected = [...sel].map(id => els.get(id)).filter(e => e && !e.del);
    const t = curTool(), show = canEdit && (selected.length || ['pen', 'rect', 'ellipse', 'arrow', 'line', 'text', 'sticky'].includes(t));
    bar.hidden = !show; if (!show) { bar.innerHTML = ''; return; }
    const kinds = new Set(selected.length ? selected.map(e => e.t) : [t === 'pen' ? 'stroke' : t]);
    const stickyOnly = [...kinds].every(k => k === 'sticky'), imageOnly = [...kinds].every(k => k === 'image');
    const one = selected.length === 1 ? selected[0] : null;
    const cur = { color: one ? one.color : color, fill: one && one.t === 'sticky' ? one.fill : fill, sw: one ? one.sw : sw };
    const parts = [];
    if (stickyOnly) parts.push(STICKY.map(c => `<button class="wbd-sw ${c === cur.fill ? 'on' : ''}" data-fill="${c}" style="--c:${c}" title="Note color" aria-label="Note color ${c}"></button>`).join(''));
    else if (!imageOnly) parts.push(COLORS.map(c => `<button class="wbd-sw ${c === cur.color ? 'on' : ''}" data-color="${c}" style="--c:${c}" title="Color" aria-label="Color ${c}"></button>`).join(''));
    if ([...kinds].some(k => ['stroke', 'rect', 'ellipse', 'arrow', 'line'].includes(k))) parts.push('<span class="wbd-sep"></span>' + WIDTHS.map(w => `<button class="wbd-w ${w === cur.sw ? 'on' : ''}" data-sw="${w}" title="Width ${w}" aria-label="Width ${w}"><i style="height:${Math.max(2, w)}px"></i></button>`).join(''));
    if (selected.length) parts.push(`<span class="wbd-sep"></span><button class="wbd-mini" data-act="dup" id="wbd-dup" title="Duplicate (Ctrl D)" aria-label="Duplicate">${svg('copy', 18)}</button><button class="wbd-mini" data-act="del" id="wbd-del" title="Delete" aria-label="Delete">${svg('trash', 18)}</button>`);
    bar.innerHTML = parts.join('');
  }
  function restyle(patch) {   // change the selected things' color, fill or width
    const pairs = [];
    for (const id of sel) {
      const e = els.get(id); if (!e || e.del) continue;
      const n = clone(e);
      if (patch.color && e.t !== 'sticky' && e.t !== 'image') n.color = patch.color;
      if (patch.fill && e.t === 'sticky') n.fill = patch.fill;
      if (patch.sw && (e.pts || e.t === 'rect' || e.t === 'ellipse')) n.sw = patch.sw;
      if (JSON.stringify(n) === JSON.stringify(e)) continue;
      pairs.push({ id, before: clone(e), after: null }); put(n); pairs[pairs.length - 1].after = clone(n);
    }
    record(pairs); paint();
  }

  // ---------- actions ----------
  function act(a, anchor) {
    if (a === 'undo') return travel(undo, redo);
    if (a === 'redo') return travel(redo, undo);
    if (a === 'image') { if (canEdit) $('#wbd-file').click(); return; }
    if (a === 'more') return moreMenu(anchor);
    if (a === 'del') return removeSel();
    if (a === 'dup') return duplicate();
    if (a === 'zin' || a === 'zout') return zoomAt(W / 2, H / 2, a === 'zin' ? 1.25 : 0.8);
    if (a === 'z100') return zoomAt(W / 2, H / 2, 1 / view.z);
    if (a === 'fit') return fit();
  }
  function removeSel() {
    if (!canEdit || !sel.size) return;
    const pairs = [...sel].map(id => ({ id, before: clone(els.get(id)), after: null }));
    [...sel].forEach(kill); sel.clear(); record(pairs); drawStyle(); paint();
  }
  function duplicate() {
    if (!canEdit || !sel.size) return;
    const pairs = [], z = topZ(), fresh = new Set();
    [...sel].map(id => els.get(id)).filter(e => e && !e.del).sort((a, b) => a.z - b.z).forEach((e, i) => {
      const n = clone(e); n.id = rid(); n.v = 0; n.z = z + i; delete n.by; delete n.agent; translate(n, 24, 24);
      put(n); fresh.add(n.id); pairs.push({ id: n.id, before: null, after: clone(n) });
    });
    sel = fresh; record(pairs); drawStyle(); paint();
  }
  function zoomAt(sx, sy, f) {
    const z = Math.max(0.1, Math.min(6, view.z * f)); f = z / view.z;
    view.x = sx - (sx - view.x) * f; view.y = sy - (sy - view.y) * f; view.z = z; saveView(); paint();
  }
  function fit(quiet) {
    const all = live();
    if (!all.length) { view = { x: W / 2, y: H / 2, z: 1 }; if (!quiet) saveView(); return paint(); }
    const bs = all.map(box), x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.w)), y1 = Math.max(...bs.map(b => b.y + b.h));
    const pad = 60, z = Math.max(0.1, Math.min(1.5, Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0))));
    view = { z, x: W / 2 - ((x0 + x1) / 2) * z, y: H / 2 - ((y0 + y1) / 2) * z };
    if (!quiet) saveView(); paint();
  }

  // ---------- pointer input ----------
  const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  let lastCur = 0;
  function sendCursor(sp) { const now = Date.now(); if (now - lastCur < 50) return; lastCur = now; const w = toWorld(sp.x, sp.y); C.send({ type: 'wbd-cursor', board: boardId, x: w.x, y: w.y }); }
  function onDown(e) {
    if (editing) { commitEdit(); if (curTool() === 'text' || curTool() === 'sticky') return; }   // a tap outside finishes the note; it doesn't start another
    e.preventDefault();   // no mouse-compat focus change (a new note's textarea keeps the focus)
    cv.focus({ preventScroll: true });
    const sp = local(e);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, sp);
      if (touches.size === 2) {   // a second finger: pan and zoom, and the first finger's mark goes away
        cancelGesture();
        const [a, b] = [...touches.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        return;
      }
      if (touches.size > 2) return;
    }
    cv.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || spaceDown || tool === 'hand') { gesture = { kind: 'pan', sx: sp.x, sy: sp.y, vx: view.x, vy: view.y, id: e.pointerId }; cv.classList.add('panning'); return; }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = toWorld(sp.x, sp.y), t = curTool();
    if (!canEdit || t === 'select') {
      if (canEdit && handleAt(sp)) { const id = [...sel][0]; const b = selBox(); gesture = { kind: 'resize', id, from: b, before: clone(els.get(id)), ax: b.x, ay: b.y, id2: e.pointerId }; return; }
      const h = hitTop(p);
      if (h && canEdit) {
        if (e.shiftKey) { sel.has(h.id) ? sel.delete(h.id) : sel.add(h.id); }
        else if (!sel.has(h.id)) sel = new Set([h.id]);
        gesture = { kind: 'move', p0: p, before: new Map([...sel].map(id => [id, clone(els.get(id))])), moved: false };
      } else if (h && !canEdit) { sel = new Set([h.id]); }
      else if (e.pointerType === 'touch' && !canEdit) { gesture = { kind: 'pan', sx: sp.x, sy: sp.y, vx: view.x, vy: view.y }; }
      else { if (!e.shiftKey) sel.clear(); marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; gesture = { kind: 'marquee' }; }
      drawStyle(); paint(); return;
    }
    if (t === 'pen') { const el = { id: rid(), t: 'stroke', color, sw, pts: [[r1(p.x), r1(p.y)]], z: topZ() }; put(el); gesture = { kind: 'draw', id: el.id, pointer: e.pointerId }; paint(); return; }
    if (SHAPES.includes(t)) {
      const el = t === 'rect' || t === 'ellipse' ? { id: rid(), t, color, sw, x: r1(p.x), y: r1(p.y), w: 0, h: 0, fill: '', z: topZ() } : { id: rid(), t, color, sw, pts: [[r1(p.x), r1(p.y)], [r1(p.x), r1(p.y)]], z: topZ() };
      els.set(el.id, Object.assign(el, { v: 0 })); gesture = { kind: 'shape', id: el.id, p0: p, sp0: sp }; paint(); return;
    }
    if (t === 'text') { const h = hitTop(p); if (h && h.t === 'text') return startEdit(h); return newText(p); }
    if (t === 'sticky') { const h = hitTop(p); if (h && h.t === 'sticky') return startEdit(h); return newSticky(p); }
    if (t === 'eraser') { gesture = { kind: 'erase', pairs: [], at: sp }; eraseAt(p); paint(); return; }
  }
  const r1 = v => Math.round(v * 10) / 10;
  function onMove(e) {
    const sp = local(e);
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, sp);
      if (pinch && touches.size >= 2) {
        const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        view.x += cx - pinch.cx; view.y += cy - pinch.cy;
        if (pinch.d > 10 && d > 10) zoomAt(cx, cy, d / pinch.d);
        pinch = { d, cx, cy }; saveView(); paint(); return;
      }
    }
    if (open && e.pointerType !== 'touch') sendCursor(sp); else if (gesture) sendCursor(sp);
    if (!gesture) { cv.classList.toggle('grab', curTool() === 'select' && canEdit && (handleAt(sp) ? 'nwse' : !!hitTop(toWorld(sp.x, sp.y)))); cv.classList.toggle('nwse', curTool() === 'select' && handleAt(sp)); return; }
    const p = toWorld(sp.x, sp.y), g = gesture;
    if (g.kind === 'pan') { view.x = g.vx + sp.x - g.sx; view.y = g.vy + sp.y - g.sy; saveView(); paint(); return; }
    if (g.kind === 'draw') {
      const el = els.get(g.id); if (!el) return;
      const last = el.pts[el.pts.length - 1];
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) { const q = toWorld(local(ev).x, local(ev).y); if (Math.hypot(q.x - last[0], q.y - last[1]) * view.z >= 1.5 && el.pts.length < 3900) el.pts.push([r1(q.x), r1(q.y)]); }
      put(el); paint(); return;
    }
    if (g.kind === 'shape') {
      const el = els.get(g.id); if (!el) return;
      if (el.pts) { let q = p; if (e.shiftKey) { const dx = p.x - g.p0.x, dy = p.y - g.p0.y, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy); q = { x: g.p0.x + l * Math.cos(a), y: g.p0.y + l * Math.sin(a) }; } el.pts[1] = [r1(q.x), r1(q.y)]; }
      else { let w = p.x - g.p0.x, h = p.y - g.p0.y; if (e.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; } el.w = r1(w); el.h = r1(h); }
      g.big = g.big || Math.hypot(sp.x - g.sp0.x, sp.y - g.sp0.y) > 4;
      if (g.big) put(el); paint(); return;
    }
    if (g.kind === 'move') {
      const dx = p.x - g.p0.x, dy = p.y - g.p0.y; if (!g.moved && Math.hypot(dx, dy) * view.z < 3) return; g.moved = true;
      for (const [id, b] of g.before) { const n = clone(b); translate(n, dx, dy); n.v = (els.get(id) || b).v; put(n); }
      paint(); return;
    }
    if (g.kind === 'resize') {
      const f = g.from, to = { x: f.x, y: f.y, w: Math.max(8, p.x - f.x), h: Math.max(8, p.y - f.y) };
      if (g.before.t === 'text' || e.shiftKey || g.before.t === 'image') { const s = Math.max(to.w / Math.max(1, f.w), to.h / Math.max(1, f.h)); to.w = f.w * s; to.h = f.h * s; }
      const n = clone(g.before); scaleTo(n, f, to); n.v = (els.get(g.id) || g.before).v; put(n); paint(); return;
    }
    if (g.kind === 'marquee') { marquee.x1 = p.x; marquee.y1 = p.y; paint(); return; }
    if (g.kind === 'erase') { g.at = sp; eraseAt(p); paint(); }
  }
  function onUp(e) {
    if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (pinch) { if (touches.size < 2) pinch = null; return; } }
    const g = gesture; gesture = null; cv.classList.remove('panning');
    if (!g) return;
    if (g.kind === 'draw') {
      const el = els.get(g.id); if (el && el.pts.length > 2) { el.pts = simplify(el.pts, 0.4 / view.z); put(el); }
      if (el) record([{ id: el.id, before: null, after: clone(el) }]);
    }
    if (g.kind === 'shape') {
      const el = els.get(g.id); if (!el) return;
      if (!g.big) { els.delete(el.id); paint(); return; }   // a click, not a drag: nothing
      if (!el.pts) { const b = box(el); Object.assign(el, { x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h) }); }
      put(el); record([{ id: el.id, before: null, after: clone(el) }]);
    }
    if (g.kind === 'move' && g.moved) record([...g.before].map(([id, b]) => ({ id, before: b, after: clone(els.get(id)) })));
    if (g.kind === 'resize') record([{ id: g.id, before: g.before, after: clone(els.get(g.id)) }]);
    if (g.kind === 'marquee' && marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1), y0 = Math.min(marquee.y0, marquee.y1), x1 = Math.max(marquee.x0, marquee.x1), y1 = Math.max(marquee.y0, marquee.y1);
      if (x1 - x0 > 2 / view.z || y1 - y0 > 2 / view.z) for (const el of live()) { const b = box(el); if (b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0) sel.add(el.id); }
      marquee = null;
    }
    if (g.kind === 'erase' && g.pairs.length) record(g.pairs);
    drawStyle(); paint();
  }
  function cancelGesture() {
    const g = gesture; gesture = null; marquee = null; if (!g) return;
    if (g.kind === 'draw' || (g.kind === 'shape' && g.big)) kill(g.id); else if (g.kind === 'shape') els.delete(g.id);
    if (g.kind === 'move' && g.moved) for (const [, b] of g.before) put(clone(b));
    if (g.kind === 'erase') for (const p of g.pairs) put(clone(p.before));
    paint();
  }
  function eraseAt(p) {
    const tol = 10 / view.z;
    for (const el of sorted()) if (hit(el, p, tol)) { gesture.pairs.push({ id: el.id, before: clone(el), after: null }); kill(el.id); }
  }
  function onDbl(e) {
    if (!canEdit) return;
    const p = toWorld(local(e).x, local(e).y), h = hitTop(p);
    if (h && (h.t === 'text' || h.t === 'sticky')) return startEdit(h);
    if (!h && curTool() === 'select') newText(p);
  }
  function onWheel(e) {
    if (!open) return; e.preventDefault();
    const sp = local(e);
    if (e.ctrlKey || e.metaKey) zoomAt(sp.x, sp.y, Math.exp(-e.deltaY * 0.0025));
    else { view.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; view.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY; saveView(); paint(); }
  }

  // ---------- text + sticky notes ----------
  function newText(p) { const el = { id: rid(), t: 'text', color, x: r1(p.x), y: r1(p.y - 14), w: 0, h: 0, size: 22, text: '', z: topZ(), v: 0 }; els.set(el.id, el); startEdit(el, true); }
  function newSticky(p) { const el = { id: rid(), t: 'sticky', color: '#12151A', fill, x: r1(p.x - 90), y: r1(p.y - 90), w: 180, h: 180, size: 18, text: '', z: topZ(), v: 0 }; els.set(el.id, el); startEdit(el, true); }
  function startEdit(el, isNew) {
    if (!canEdit) return;
    commitEdit();
    const ta = document.createElement('textarea'); ta.className = 'wbd-edit ' + (el.t === 'sticky' ? 'sticky' : 'text'); ta.id = 'wbd-edit';
    ta.value = el.text || ''; ta.setAttribute('aria-label', el.t === 'sticky' ? 'Sticky note text' : 'Text'); ta.spellcheck = true; ta.maxLength = 4000;
    stage.appendChild(ta);
    editing = { el, ta, isNew: !!isNew, before: isNew ? null : clone(el) };
    sel = new Set([el.id]);
    ta.addEventListener('input', () => { el.text = ta.value; if (!editing.isNew || el.text.trim()) { if (el.t === 'sticky') grow(el); put(el); } placeEditor(); });
    ta.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); commitEdit(); setTool('select'); } });
    ta.addEventListener('blur', () => setTimeout(() => { if (editing && editing.ta === ta && document.activeElement !== ta) commitEdit(); }, 120));
    placeEditor(); paint();
    ta.focus({ preventScroll: true }); setTimeout(() => { if (editing && editing.ta === ta) ta.focus({ preventScroll: true }); }, 0);
  }
  function grow(el) {   // sticky notes get taller to fit their text
    const s = el.size || 18; mctx.font = `500 ${s}px ${FONT}`;
    const lines = wrap(mctx, el.text, el.w - 28).length, need = 18 + lines * s * 1.35 + 22;
    if (need > el.h) el.h = r1(need);
  }
  function placeEditor() {
    if (!editing) return; const { el, ta } = editing; const z = view.z, s = (el.size || (el.t === 'sticky' ? 18 : 22)) * z;
    const a = toScreen(el.x, el.y);
    ta.style.font = `500 ${s}px ${FONT}`; ta.style.left = Math.round(a.x) + 'px'; ta.style.top = Math.round(a.y) + 'px';
    if (el.t === 'sticky') { Object.assign(ta.style, { width: el.w * z + 'px', height: el.h * z + 'px', padding: `${18 * z}px ${14 * z}px`, lineHeight: '1.35', background: el.fill, color: '#12151A' }); }
    else { const m = measureText({ ...el, text: (el.text || '') + 'M' }); Object.assign(ta.style, { width: Math.max(80, m.w * z + 20) + 'px', height: m.h * z + 4 + 'px', padding: `${2 * z}px`, lineHeight: '1.3', color: el.color }); }
  }
  function commitEdit(silent) {
    if (!editing) return; const { el, ta, isNew, before } = editing; editing = null;
    ta.remove();
    el.text = String(el.text || '').replace(/\s+$/, '');
    if (!el.text.trim()) {
      if (isNew) { if (els.get(el.id) && els.get(el.id).v) kill(el.id); else els.delete(el.id); sel.delete(el.id); }
      else if (el.t === 'text') { kill(el.id); record([{ id: el.id, before, after: null }]); }
      else { put(el); record([{ id: el.id, before, after: clone(el) }]); }
    } else {
      if (el.t === 'sticky') grow(el);
      put(el); record([{ id: el.id, before, after: clone(el) }]);
    }
    if (!silent) { drawStyle(); paint(); }
  }

  // ---------- pictures ----------
  async function upload(blob, name) {
    if (LB && LB.upload) return LB.upload(blob, name);   // polish: a board kept on this device keeps its pictures there too
    const res = await fetch(`${C.base()}/api/uploads?scope=project&name=${encodeURIComponent(name)}`, { method: 'POST', body: blob, headers: { Authorization: 'Bearer ' + token(), 'X-Project': pid() } });
    const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || res.statusText); return d.file;
  }
  async function addImage(file, at) {
    if (!canEdit) return toast('Spectators can look, not add pictures.');
    if (file.size > 15 * 1024 * 1024) return toast('That picture is over 15 MB.');
    try {
      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const f = await upload(file, file.name && /\.\w+$/.test(file.name) ? file.name : `whiteboard-${Date.now().toString(36)}.${ext}`);
      const im = imgFor(f.id);
      await new Promise(r => { if (im.complete && im.naturalWidth) r(); else { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); } });
      const nw = im.naturalWidth || 320, nh = im.naturalHeight || 240, k = Math.min(1, 480 / Math.max(nw, nh));
      const el = { id: rid(), t: 'image', src: f.id, x: r1(at.x - nw * k / 2), y: r1(at.y - nh * k / 2), w: r1(nw * k), h: r1(nh * k), color: '#F8FAFC', sw: 1, z: topZ() };
      put(el); record([{ id: el.id, before: null, after: clone(el) }]); sel = new Set([el.id]); drawStyle(); paint();
    } catch (e) { toast('Could not add the picture: ' + e.message); }
  }
  document.addEventListener('paste', e => {
    if (!open || editing || (e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]'))) return;
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.kind === 'file' && /^image\//.test(i.type));
    if (item) { e.preventDefault(); const f = item.getAsFile(); if (f) addImage(f, center()); return; }
    const txt = e.clipboardData && e.clipboardData.getData('text/plain');
    if (txt && txt.trim() && canEdit) { e.preventDefault(); const p = center(); const el = { id: rid(), t: 'sticky', color: '#12151A', fill, x: r1(p.x - 90), y: r1(p.y - 90), w: 180, h: 180, size: 18, text: txt.trim().slice(0, 4000), z: topZ() }; grow(el); put(el); record([{ id: el.id, before: null, after: clone(el) }]); sel = new Set([el.id]); drawStyle(); paint(); }
  });

  // ---------- keys ----------
  document.addEventListener('keydown', e => {
    if (!open || editing) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], .modal:not(.hidden), .wgx-scrim')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ' && !spaceDown) { spaceDown = true; cv && cv.classList.add('grab-all'); e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); return act(e.shiftKey ? 'redo' : 'undo'); }
    if (mod && k === 'y') { e.preventDefault(); return act('redo'); }
    if (mod && k === 'd') { e.preventDefault(); return duplicate(); }
    if (mod && k === 'a') { e.preventDefault(); sel = new Set(live().map(x => x.id)); setTool('select'); sel = new Set(live().map(x => x.id)); drawStyle(); return paint(); }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return removeSel(); }
    if (e.key === 'Escape') { sel.clear(); closePop(); drawStyle(); return paint(); }
    if (e.key === 'Enter' && sel.size === 1) { const el = els.get([...sel][0]); if (el && (el.t === 'text' || el.t === 'sticky')) { e.preventDefault(); return startEdit(el); } }
    if (k === 'i' && canEdit) return act('image');
    if (k === '0' && e.shiftKey) return fit();
    if (k === '+' || k === '=') return zoomAt(W / 2, H / 2, 1.25);
    if (k === '-') return zoomAt(W / 2, H / 2, 0.8);
    if (KEYS[k]) setTool(KEYS[k]);
  });
  document.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; cv && cv.classList.remove('grab-all'); } });

  // ---------- popovers (flat, 1px border; a bottom sheet on phones) ----------
  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  function pop(anchor, html, id) {
    closePop();
    const el = document.createElement('div'); el.className = `sh-pop wbd-pop ${isPhone() ? 'sheet' : ''}`; el.id = id; el.setAttribute('role', 'menu');
    el.innerHTML = (isPhone() ? '<div class="pj-grab"></div>' : '') + html;
    document.body.appendChild(el); popEl = el;
    if (!isPhone()) {
      const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      const right = r.left + r.width / 2 < innerWidth / 2 ? r.right + 8 : r.left - w - 8;
      const below = r.bottom + 6 + h < innerHeight;
      if (anchor.closest('.wbd-head')) { el.style.left = Math.min(Math.max(8, r.left), innerWidth - w - 8) + 'px'; el.style.top = (r.bottom + 6) + 'px'; }
      else { el.style.left = Math.min(Math.max(8, right), innerWidth - w - 8) + 'px'; el.style.top = Math.min(Math.max(8, below ? r.top : r.bottom - h), innerHeight - h - 8) + 'px'; }
    }
    return el;
  }
  document.addEventListener('pointerdown', e => { if (popEl && !popEl.contains(e.target) && !e.target.closest('#wbd-name, #wbd-export, #wbd-t-shape, #wbd-more')) closePop(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && popEl) { closePop(); e.stopPropagation(); } }, true);
  const mi = (k, label, icon, extra = '') => `<button data-m="${k}" ${extra}>${icon ? svg(icon, 16) : ''}<span>${esc(label)}</span></button>`;
  function shapeMenu(anchor) {
    if (!canEdit) return;
    const el = pop(anchor, `<div class="sh-menu wbd-shapes">${SHAPES.map(s => mi(s, LABEL[s].replace(/ \(.\)$/, ''), s, s === shape ? 'class="on"' : '')).join('')}</div>`, 'wbd-shape-menu');
    el.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; closePop(); setTool(b.dataset.m); });
  }
  async function boardMenu(anchor) {
    await loadBoards();
    const el = pop(anchor, `<div class="sh-menu wbd-boards">
      ${boards.map(b => `<button data-board="${esc(b.id)}" class="${b.id === boardId ? 'on' : ''}"><span class="wbd-bn">${esc(b.name)}</span><small>${b.count}</small></button>`).join('')}
      ${canEdit ? '<hr>' + mi('new', 'New board', 'plus', 'id="wbd-new"') + mi('rename', 'Rename this board', 'text') : ''}
      ${canManage ? '<hr>' + mi('clear', 'Clear this board', 'eraser', 'id="wbd-clear"') + (boardId !== 'main' ? mi('delete', 'Delete this board', 'trash') : '') : ''}
    </div>`, 'wbd-board-menu');
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-board]'); if (b) { closePop(); if (b.dataset.board !== boardId) { commitEdit(); C.send({ type: 'wbd-leave', board: boardId }); boardId = b.dataset.board; loadedFor = ''; load(); } return; }
      const m = e.target.closest('[data-m]'); if (!m) return; closePop();
      try {
        if (m.dataset.m === 'new') { const name = prompt('Name the new board', 'Ideas'); if (name == null) return; const r = await C.api('/whiteboard', { method: 'POST', body: { name } }); C.send({ type: 'wbd-leave', board: boardId }); boardId = r.board.id; loadedFor = ''; load(); toast('🖍️ New board'); }
        if (m.dataset.m === 'rename') { const name = prompt('Rename the board', boardName); if (!name || !name.trim()) return; const r = await C.api('/whiteboard/' + encodeURIComponent(boardId), { method: 'PATCH', body: { name } }); boardName = r.board.name; $('#wbd-name-t').textContent = boardName; }
        if (m.dataset.m === 'clear') { if (!confirm(`Clear everything on “${boardName}” for everyone? This can't be undone.`)) return; await C.api(`/whiteboard/${encodeURIComponent(boardId)}/clear`, { method: 'POST', body: {} }); toast('Board cleared'); }
        if (m.dataset.m === 'delete') { if (!confirm(`Delete “${boardName}” for everyone?`)) return; await C.api('/whiteboard/' + encodeURIComponent(boardId), { method: 'DELETE' }); boardId = 'main'; loadedFor = ''; load(); }
      } catch (err) { toast(err.message); }
    });
  }
  function exportMenu(anchor) {
    const el = pop(anchor, `<div class="sh-menu">${mi('png', 'Download PNG', 'image', 'id="wbd-png"')}${mi('svg', 'Download SVG', 'pen', 'id="wbd-svg"')}${canEdit ? mi('files', 'Send to Files', 'copy', 'id="wbd-files"') : ''}</div>`, 'wbd-export-menu');
    el.addEventListener('click', async e => { const m = e.target.closest('[data-m]'); if (!m) return; closePop(); runExport(m.dataset.m); });
  }
  function moreMenu(anchor) {   // phones: the things that don't fit the bottom bar
    const el = pop(anchor, `<div class="sh-menu">
      ${canEdit ? mi('redo', 'Redo', 'redo', redo.length ? '' : 'disabled') + mi('image', 'Add a picture', 'image') : ''}
      ${mi('fit', 'Fit everything', 'fit')}${mi('png', 'Download PNG', 'image')}${canEdit ? mi('files', 'Send to Files', 'copy') : ''}</div>`, 'wbd-more-menu');
    el.addEventListener('click', e => { const m = e.target.closest('[data-m]'); if (!m || m.disabled) return; closePop(); if (['png', 'svg', 'files'].includes(m.dataset.m)) runExport(m.dataset.m); else act(m.dataset.m); });
  }

  // ---------- export ----------
  function bounds() { const all = live(); if (!all.length) return null; const bs = all.map(box); const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)); return { x: x0 - 40, y: y0 - 40, w: Math.max(...bs.map(b => b.x + b.w)) - x0 + 80, h: Math.max(...bs.map(b => b.y + b.h)) - y0 + 80 }; }
  function toPng() {
    const b = bounds(); if (!b) return Promise.resolve(null);
    const k = Math.min(2, 8000 / Math.max(b.w, b.h)), c = document.createElement('canvas'); c.width = Math.ceil(b.w * k); c.height = Math.ceil(b.h * k);
    const x = c.getContext('2d'); x.fillStyle = css('--canvas', '#12151A'); x.fillRect(0, 0, c.width, c.height);
    x.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
    const was = editing; editing = null; for (const e of sorted()) drawEl(x, e); editing = was;
    return new Promise(r => { try { c.toBlob(r, 'image/png'); } catch { r(null); } });
  }
  async function toSvg() {
    const b = bounds(); if (!b) return null;
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${Math.round(b.w)}" height="${Math.round(b.h)}" font-family="Inter, system-ui, sans-serif">`, `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${css('--canvas', '#12151A')}"/>`];
    const a = (s) => esc(String(s));
    for (const e of sorted()) {
      const st = `stroke="${a(e.color)}" stroke-width="${e.sw || 2}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
      if (e.t === 'stroke') { const p = e.pts; let d = `M${p[0][0]} ${p[0][1]}`; for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`; if (p.length > 1) d += ` L${p[p.length - 1][0]} ${p[p.length - 1][1]}`; else d += ' l0.01 0'; out.push(`<path d="${d}" ${st}/>`); }
      else if (e.t === 'line' || e.t === 'arrow') { const [p, q] = e.pts; out.push(`<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" ${st}/>`); if (e.t === 'arrow') { const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), s = Math.max(10, (e.sw || 2) * 3.2); out.push(`<path d="M${q[0] - s * Math.cos(ang - 0.45)} ${q[1] - s * Math.sin(ang - 0.45)} L${q[0]} ${q[1]} L${q[0] - s * Math.cos(ang + 0.45)} ${q[1] - s * Math.sin(ang + 0.45)}" ${st}/>`); } }
      else if (e.t === 'rect') { const r = box(e); out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${Math.min(8, r.w / 4, r.h / 4)}" ${st.replace('fill="none"', `fill="${e.fill ? a(e.fill) : 'none'}"`)}/>`); }
      else if (e.t === 'ellipse') { const r = box(e); out.push(`<ellipse cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" rx="${r.w / 2}" ry="${r.h / 2}" ${st.replace('fill="none"', `fill="${e.fill ? a(e.fill) : 'none'}"`)}/>`); }
      else if (e.t === 'text') { const s = e.size || 22; String(e.text || '').split('\n').forEach((l, i) => out.push(`<text x="${e.x + 2}" y="${e.y + 2 + i * s * 1.3 + s * 0.9}" font-size="${s}" font-weight="500" fill="${a(e.color)}">${esc(l)}</text>`)); }
      else if (e.t === 'sticky') { const r = box(e), s = e.size || 18; out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6" fill="${a(e.fill)}"/>`); mctx.font = `500 ${s}px ${FONT}`; wrap(mctx, e.text, r.w - 28).forEach((l, i) => { const y = r.y + 18 + i * s * 1.35 + s * 0.9; if (y < r.y + r.h) out.push(`<text x="${r.x + 14}" y="${y}" font-size="${s}" font-weight="500" fill="#12151A">${esc(l)}</text>`); }); }
      else if (e.t === 'image') { const r = box(e), im = imgFor(e.src); let href = ''; try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); href = c.toDataURL('image/png'); } catch {} if (href) out.push(`<image x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" href="${href}" preserveAspectRatio="none"/>`); }
    }
    out.push('</svg>');
    return new Blob([out.join('\n')], { type: 'image/svg+xml' });
  }
  const fileName = ext => `${(boardName || 'whiteboard').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'whiteboard'}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  function download(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  async function runExport(kind) {
    commitEdit();
    if (!live().length) return toast('The board is empty.');
    try {
      if (kind === 'svg') { const b = await toSvg(); if (b) download(b, fileName('svg')); return; }
      const png = await toPng(); if (!png) return toast('Could not draw the picture (a picture from elsewhere may block it).');
      if (kind === 'png') return download(png, fileName('png'));
      if (kind === 'files' && LB && window.TribeLocalFiles) { await window.TribeLocalFiles.addFiles([new File([png], fileName('png'), { type: 'image/png' })]); toast(`📁 Saved to Files on this device: ${fileName('png')}`); }
      else if (kind === 'files') { const f = await upload(png, fileName('png')); toast(`📁 Saved to Files: ${f.name}`); }
    } catch (e) { toast(e.message); }
  }

  // ---------- keep in step ----------
  C.on('ws', onWs);
  C.on('hello', () => { setTimeout(fromHash, 50); if (open) { loadedFor = ''; load(); } });
  C.on('project', () => { boardId = 'main'; loadedFor = ''; peers.clear(); if (open) load(); });
  setTimeout(fromHash, 0);

  window.TribeWhiteboard = {
    open: (id, opts) => show(id, opts), local: () => !!LB, close: () => { if (open && window.TribeApp) window.TribeApp.show('home'); },
    state: () => ({ open, board: boardId, name: boardName, canEdit, canManage, tool: curTool(), count: live().length, view: { ...view }, selected: [...sel], undo: undo.length, redo: redo.length, peers: [...peers.keys()],
      elements: live().map(clone) }),
  };
})();
