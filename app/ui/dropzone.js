// feat/dropzone: one drop system for the whole app. Drag files or folders anywhere: a calm full-window overlay shows the
// drop targets that fit where you are. Dropping on a place does the obvious thing (chat → attach, the inspiration board →
// pins, the website designer → pictures / an HTML page or a config as a version, the design canvas → picture layers,
// Files → upload into the folder you are in, a doc → a picture or a link at the cursor, Flint → he reads it). Anywhere
// else you choose: add to the project's files, just let Flint read it (kept in this browser only), add to the
// inspiration board, make it the project's folder (when folder homes exist), or start a new project from it.
// Folders are walked recursively (webkitGetAsEntry, showDirectoryPicker, <input webkitdirectory>, the desktop app's
// paths through server/dropzone.js), node_modules / .git / build output skipped by default (a toggle brings them back),
// secrets (.env, keys, tokens in the code) and .git internals are flagged and stay out unless you tick the box, caps on
// count and size with a clear summary, per-file progress with Cancel, Retry and Resume, duplicates (rename, replace,
// skip), Undo, and the history in Recent activity. Paste (pictures, files, text) takes the same path. Phones and anyone
// who doesn't drag: the paperclip in Flint's bar, Ctrl Shift U, or "add files" to Flint. Dropped files are never run.
// Flint reads every folder first (app/ui/folderread.js): a summary card with one-click suggestions, and follow-up
// questions answered locally ("where is the API key used?"), or with a context pack for your AI or a free AI.
//   window.TribeDropZone = { pick(), take(set, zone), sheet(set), read(set), run(id), forget(), context(), state(),
//     history(), undo(batch), flint(text), fromFiles(files), fromItems(items, name), zoneAt(el) }
(function () {
  'use strict';
  const C = window.TribeClient, FR = () => window.TribeFolderRead;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : null);
  const connected = () => !!(C && C.connected && C.connected());
  const pid = () => (C && C.project && C.project()) || '';
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const fsize = n => (FR() ? FR().fsize(n) : `${n} B`);
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : ws || w + 's'}`;
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const token = () => (((window.TribeStore && window.TribeStore.get().server) || {}).token || '');
  const authH = p => ({ ...(token() ? { Authorization: 'Bearer ' + token() } : {}), ...((p || pid()) ? { 'X-Project': p || pid() } : {}) });
  const projName = id => (((C && C.state && C.state().projects) || []).find(p => p.id === (id || pid())) || {}).name || '';
  const me = () => (((C && C.state && C.state()) || {}).me || {});
  const isHost = () => me().role === 'host';
  const swap = fn => (window.TribeMotion ? window.TribeMotion.swap(fn) : fn());
  const ICO = {
    up: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  const ico = (k, sz = 18) => `<svg class="dz-i" viewBox="0 0 24 24" width="${sz}" height="${sz}" aria-hidden="true">${ICO[k]}</svg>`;

  // ---------- caps ----------
  const CAP = { files: 400, bytes: 200 * 1048576, file: 50 * 1048576, walk: 5000 };

  // ---------- collecting a set: { id, name, items, skipped, truncated, source, paths?, folder } ----------
  // item = { path ('folder/sub/a.js'), size, type, file?, get() -> Blob }
  const mkItem = (path, file) => ({ path, size: file.size, type: file.type || '', file, get: async () => file });
  // entries must be taken while the drop event is still running (DataTransfer empties after)
  function grab(dt) {
    const items = [...((dt && dt.items) || [])].filter(i => i.kind === 'file');
    const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
    return { entries: entries.every(Boolean) && entries.length ? entries : null, files: [...((dt && dt.files) || [])], text: dt && (dt.getData && (dt.getData('text/uri-list') || dt.getData('text/plain'))) || '' };
  }
  const readAll = dir => new Promise((res, rej) => { const r = dir.createReader(), all = []; const more = () => r.readEntries(ents => { if (!ents.length) return res(all); all.push(...ents); more(); }, rej); more(); });
  const entryFile = e => new Promise((res, rej) => e.file(res, rej));
  async function walkEntries(entries) {
    const set = newSet(entries.length === 1 && entries[0].isDirectory ? entries[0].name : '', 'drop'); set.folder = entries.some(e => e.isDirectory);
    let ignore = null;
    if (entries.length === 1 && entries[0].isDirectory) { try { const gi = await new Promise((res, rej) => entries[0].getFile('.gitignore', {}, res, rej)); ignore = FR().gitignore(await (await entryFile(gi)).text()); } catch {} }
    const rel = p => (set.name && p.startsWith(set.name + '/') ? p.slice(set.name.length + 1) : p);
    const visit = async (e, prefix) => {
      if (set.items.length >= CAP.walk) { set.truncated = true; return; }
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory) {
        const why = p === set.name ? '' : FR().skipReason(rel(p) + '/x', ignore);
        if (why) { set.skipped.push({ path: p, why, entry: e, dir: true }); return; }
        for (const c of await readAll(e)) await visit(c, p);
        return;
      }
      const why = FR().skipReason(rel(p), ignore);
      const f = await entryFile(e).catch(() => null); if (!f) return;
      if (why) set.skipped.push({ path: p, why, item: mkItem(p, f) }); else set.items.push(mkItem(p, f));
    };
    for (const e of entries) await visit(e, '');
    return set;
  }
  function fromFiles(files, name) {
    files = [...(files || [])];
    const rels = files.map(f => f.webkitRelativePath || f.name), root = rels.every(r => r.includes('/')) && new Set(rels.map(r => r.split('/')[0])).size === 1 ? rels[0].split('/')[0] : '';
    const set = newSet(name || root, 'pick'); set.folder = !!root;
    let ignore = null; const gi = files.find((f, i) => rels[i] === `${root}/.gitignore`);
    const go = () => { files.forEach((f, i) => { const p = rels[i], r = root ? p.slice(root.length + 1) : p; const why = FR().skipReason(r, ignore); (why ? set.skipped.push({ path: p, why, item: mkItem(p, f) }) : set.items.push(mkItem(p, f))); }); return set; };
    if (gi) return gi.text().then(t => { ignore = FR().gitignore(t); return go(); });
    return Promise.resolve(go());
  }
  async function fromHandle(h) {
    const set = newSet(h.name, 'pick'); set.folder = true; let ignore = null;
    try { ignore = FR().gitignore(await (await (await h.getFileHandle('.gitignore')).getFile()).text()); } catch {}
    const walk = async (d, prefix) => {
      for await (const [n, c] of d.entries()) {
        if (set.items.length >= CAP.walk) { set.truncated = true; return; }
        const p = `${prefix}/${n}`, r = p.slice(h.name.length + 1);
        if (c.kind === 'directory') { const why = FR().skipReason(r + '/x', ignore); if (why) { set.skipped.push({ path: p, why, handle: c, dir: true }); continue; } await walk(c, p); continue; }
        const f = await c.getFile(), why = FR().skipReason(r, ignore);
        (why ? set.skipped.push({ path: p, why, item: mkItem(p, f) }) : set.items.push(mkItem(p, f)));
      }
    };
    await walk(h, h.name);
    return set;
  }
  // the desktop app: real paths, read through the host (server/dropzone.js)
  async function fromPaths(paths) {
    const r = await C.api('/dropzone/scan', { method: 'POST', body: { paths } });
    const one = r.roots.length === 1 && r.roots[0].dir;
    const set = newSet(one ? r.roots[0].name : '', 'desktop'); set.folder = r.roots.some(x => x.dir); set.paths = paths; set.truncated = !!r.truncated;
    let ignore = null; const gi = one && r.files.find(f => f.path === `${set.name}/.gitignore`);
    const getter = f => async () => { const res = await fetch(`${C.base()}/api/dropzone/file?root=${encodeURIComponent(f.root)}&path=${encodeURIComponent(f.path)}`, { headers: authH() }); if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not read it'); return res.blob(); };
    if (gi) { try { ignore = FR().gitignore(await (await getter(gi)()).text()); } catch {} }
    for (const f of r.files) {
      const it = { path: f.path, size: f.size, type: '', get: getter(f) };
      it.file = { size: f.size, text: async () => (await it.get()).text(), arrayBuffer: async () => (await it.get()).arrayBuffer() };
      const rel = one ? f.path.slice(set.name.length + 1) : f.path, why = FR().skipReason(rel, ignore);
      (why ? set.skipped.push({ path: f.path, why, item: it }) : set.items.push(it));
    }
    return set;
  }
  function fromItems(items, name) {   // tests and other modules: [{ path, file }]
    const set = newSet(name || '', 'api'); set.folder = !!name;
    for (const x of items) { const p = name && !x.path.startsWith(name + '/') ? `${name}/${x.path}` : x.path, r = name ? p.slice(name.length + 1) : p, why = FR().skipReason(r); (why ? set.skipped.push({ path: p, why, item: mkItem(p, x.file) }) : set.items.push(mkItem(p, x.file))); }
    return set;
  }
  function newSet(name, source) { return { id: rid(), name: name || '', items: [], skipped: [], truncated: false, source, includeSkipped: false, includeSecrets: false, report: null }; }
  const label = set => set.name || (set.items.length === 1 ? set.items[0].path.split('/').pop() : plural(set.items.length, 'file'));
  // bring the skipped folders back (the toggle): walk what was skipped, except .git (that needs the secrets box)
  async function expandSkipped(set) {
    if (set.expanded) return; set.expanded = true; set.skippedOrig = set.skipped.slice();
    const keep = [];
    for (const s of set.skipped) {
      if (s.why === 'git') { keep.push(s); continue; }
      if (s.item) { set.items.push(Object.assign(s.item, { wasSkipped: true })); continue; }
      const add = (p, f) => { if (set.items.length < CAP.walk) set.items.push(Object.assign(mkItem(p, f), { wasSkipped: true })); else set.truncated = true; };
      if (s.entry) { const go = async (e, p) => { if (e.isDirectory) { for (const c of await readAll(e)) await go(c, `${p}/${c.name}`); } else add(p, await entryFile(e)); }; await go(s.entry, s.path); }
      else if (s.handle) { const go = async (d, p) => { for await (const [n, c] of d.entries()) { if (c.kind === 'directory') await go(c, `${p}/${n}`); else add(`${p}/${n}`, await c.getFile()); } }; await go(s.handle, s.path); }
    }
    set.skipped = keep;
  }

  // ---------- reading (Flint) ----------
  async function colorsOf(items) {
    const out = [];
    for (const it of items.slice(0, 8)) {
      try {
        const b = await it.get(), bmp = await createImageBitmap(b), cv = document.createElement('canvas'); cv.width = 24; cv.height = 24;
        const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0, 24, 24); const d = g.getImageData(0, 0, 24, 24).data, bins = new Map();
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5); const v = bins.get(k) || [0, 0, 0, 0]; v[0] += d[i]; v[1] += d[i + 1]; v[2] += d[i + 2]; v[3]++; bins.set(k, v); }
        const top = [...bins.values()].sort((a, b) => b[3] - a[3])[0]; if (top) out.push('#' + top.slice(0, 3).map(x => Math.round(x / top[3]).toString(16).padStart(2, '0')).join('').toUpperCase());
      } catch {}
    }
    return [...new Set(out)].slice(0, 6);
  }
  async function hashOf(it) { if (it.size > 8 * 1048576 || !crypto.subtle) return null; const b = await (await it.get()).arrayBuffer(); const h = await crypto.subtle.digest('SHA-1', b); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  async function analyze(set) {
    if (set.report && set.report.files === set.items.length) return set.report;
    set.report = await FR().analyze(set.items, { name: set.name || undefined, readText: async it => (await it.get()).text(), colorsOf, hashOf });
    if (!set.name) set.name = set.report.name === 'these files' ? label(set) : set.report.name;
    return set.report;
  }

  // ---------- where am I: the zone under a point ----------
  // places with their own drop handling (left alone): the new-project drop zones, the project rail, the AI bridge's box,
  // the old Home drop zone, flows, the whiteboard, the deck strip, the calendar, the task board, ledger and offload.
  const PASS = '#np-drop, #dropzone, #flow-drop, #pj-dropzone, #pj-rail, #pj-plus, #aib-drop, #ib-drop, .wb-stage, #wb, .dk-strip, #dk-strip, .plan-cell, .bug-col, .task-col, .col[data-status], [data-dz-pass]';
  const ZONES = [
    ['choice', '#dz-ov [data-dz-choice]'],
    ['pass', PASS],
    ['designer', '#wdz:not([hidden])'],
    ['flint', '#flint, .flint-mount, #hub-flint-slot, .fl-full, #dz-sheet .dz-flint'],
    ['canvas', '#cv'],
    ['board', '#pj-board, #ibd'],
    ['doc', '#doc-body, .rt-ed, .doc-editor'],
    ['files', '.fg, #hub-files'],
    ['chat', '#view-chat'],
  ];
  const ZLABEL = { designer: 'Drop on the website designer', flint: 'Drop on Flint: he reads it', canvas: 'Drop on the canvas: picture layers', board: 'Drop on the inspiration board: pins', doc: 'Drop in the doc: a picture or a link', files: 'Drop to upload into this folder', chat: 'Drop to attach in chat' };
  function zoneAt(el) {
    if (!el || !el.closest) return { k: 'any' };
    for (const [k, sel] of ZONES) { const hit = el.closest(sel); if (hit) return k === 'pass' ? null : { k, el: hit, v: k === 'choice' ? hit.dataset.dzChoice : '' }; }
    return { k: 'any' };
  }
  // the zone of what is on screen (paste, the picker): the designer or canvas when open, chat, Files, else the sheet
  function zoneNow() {
    const vis = s => { const e = $(s); return e && e.offsetParent !== null ? e : null; };
    if (vis('#wdz:not([hidden])')) return { k: 'designer' };
    if (vis('#cv')) return { k: 'canvas', el: $('#cv') };
    const v = document.body.dataset.view;
    if (v === 'chat' && vis('#view-chat')) return { k: 'chat', el: $('#view-chat') };
    if (vis('.fg')) return { k: 'files', el: $('.fg') };
    if (vis('#hub-files')) return { k: 'files', el: $('#hub-files') };
    return { k: 'any' };
  }

  // ---------- the overlay while dragging ----------
  let ov = null, depth = 0, hideT = null, dragKind = null;
  const isFiles = e => { const t = [...((e.dataTransfer && e.dataTransfer.types) || [])]; return t.includes('Files'); };
  function folderHomes() { const F = window.TribeFolderHome || window.TribeFolderHomes; return F && (F.use || F.set || F.setHome) ? F : null; }
  function choices() {
    const p = connected() && pid(), out = [];
    out.push({ k: 'files', i: 'up', t: p ? `Add to ${projName() || 'this project'}’s files` : connected() ? 'Add to my files' : 'Keep it on this device', s: 'Uploads, keeps the folders' });
    out.push({ k: 'read', i: 'eye', t: 'Just let Flint read it', s: 'Context only, not saved to the project' });
    out.push({ k: 'inspo', i: 'pin', t: 'Add to the inspiration board', s: 'The pictures become pins' });
    if (folderHomes()) out.push({ k: 'home', i: 'home', t: 'Make it the project’s folder', s: 'The project lives in it' });
    out.push({ k: 'newproj', i: 'plus', t: 'Start a new project from this folder', s: 'A fresh project, already read' });
    return out;
  }
  const choiceHtml = (c, tag = 'div') => `<${tag} class="dz-choice" data-dz-choice="${c.k}" ${tag === 'button' ? 'type="button"' : ''}>${ico(c.i, 20)}<span><b>${esc(c.t)}</b><small>${esc(c.s)}</small></span></${tag}>`;
  function showOverlay() {
    clearTimeout(hideT);
    if (!ov) { ov = document.createElement('div'); ov.id = 'dz-ov'; ov.className = 'dz-ov'; ov.setAttribute('aria-hidden', 'true'); document.body.appendChild(ov); }
    if (ov.classList.contains('on')) return;
    ov.innerHTML = `<div class="dz-frame"></div><div class="dz-hint" id="dz-hint">${ico('up', 16)}<span>Drop anywhere: here is what I can do with it</span></div>
      <div class="dz-choices" role="list">${choices().map(c => choiceHtml(c)).join('')}</div>`;
    ov.classList.add('on'); document.body.classList.add('dz-on');
  }
  function hideOverlay(now) { clearTimeout(hideT); const go = () => { depth = 0; dragKind = null; if (ov) ov.classList.remove('on'); document.body.classList.remove('dz-on'); }; if (now) go(); else hideT = setTimeout(go, 80); }
  function hint(z) {
    const h = ov && ov.querySelector('#dz-hint span'); if (!h) return;
    const k = z ? z.k : 'pass'; if (k === dragKind) return; dragKind = k;
    h.textContent = !z ? 'Drop here' : z.k === 'choice' ? 'Release to pick this' : ZLABEL[z.k] || 'Drop anywhere: here is what I can do with it';
    ov.querySelectorAll('.dz-choice').forEach(c => c.classList.toggle('hot', !!(z && z.k === 'choice' && c === z.el)));
    document.querySelectorAll('.dz-target').forEach(x => x.classList.remove('dz-target'));
    if (z && z.el && z.k !== 'choice') z.el.classList.add('dz-target');
  }
  addEventListener('dragenter', e => { if (!isFiles(e)) return; depth++; showOverlay(); }, true);
  addEventListener('dragleave', e => { if (!isFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth || !e.relatedTarget) hideOverlay(); }, true);
  addEventListener('dragover', e => { if (!isFiles(e)) return; clearTimeout(hideT); if (!ov || !ov.classList.contains('on')) showOverlay(); const z = zoneAt(e.target); hint(z); if (z) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  addEventListener('dragend', () => hideOverlay(true));
  // drops: the zones this file owns run first (capture); "anywhere else" runs last (bubble), if nobody took it
  addEventListener('drop', e => {
    document.querySelectorAll('.dz-target').forEach(x => x.classList.remove('dz-target'));
    if (!isFiles(e)) return;
    hideOverlay(true);
    const z = zoneAt(e.target); if (!z || z.k === 'any') return;
    const g = grab(e.dataTransfer);
    if (z.k === 'chat' && !(g.entries || []).some(x => x.isDirectory) && g.files.length && g.files.length <= 6 && g.files.every(f => /^image\//.test(f.type))) return;   // pictures in chat: chatrich.js sends them
    e.preventDefault(); e.stopPropagation();
    collect(g).then(set => take(set, z, { x: e.clientX, y: e.clientY })).catch(err => toast(err.message));
  }, true);
  addEventListener('drop', e => {
    if (!isFiles(e) || e.defaultPrevented) return;
    const z = zoneAt(e.target); if (!z) return;
    e.preventDefault(); const g = grab(e.dataTransfer);
    collect(g).then(set => take(set, { k: 'any' })).catch(err => toast(err.message));
  });
  async function collect(g) {
    if (g.entries) return walkEntries(g.entries);
    return fromFiles(g.files);
  }

  // ---------- the desktop app (Tauri v2): native drag events with real paths ----------
  (async () => {
    const ev = window.__TAURI__ && window.__TAURI__.event; if (!ev || !ev.listen) return;
    const at = p => { const d = devicePixelRatio || 1; return p ? document.elementFromPoint(p.x / d, p.y / d) : null; };
    try {
      await ev.listen('tauri://drag-enter', () => showOverlay());
      await ev.listen('tauri://drag-over', e => hint(zoneAt(at(e.payload && e.payload.position))));
      await ev.listen('tauri://drag-leave', () => hideOverlay(true));
      await ev.listen('tauri://drag-drop', async e => {
        hideOverlay(true); const paths = (e.payload && e.payload.paths) || []; if (!paths.length) return;
        const el = at(e.payload.position), z = zoneAt(el);
        if (!z) { if (el && el.closest('#pj-rail, #pj-plus') && window.TribeProjects && isHost()) window.TribeProjects.fromPath(paths[0]); return; }
        if (!connected() || !isHost()) return toast('Drops on the desktop app are read through the host. Connect to your tribe first.');
        try { const set = await fromPaths(paths); take(set, z); } catch (err) { toast(err.message); }
      });
    } catch {}
  })();

  // ---------- paste: pictures, files and text take the same path ----------
  const editable = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  addEventListener('paste', e => {
    if (e.defaultPrevented) return;
    const t = e.target, dt = e.clipboardData; if (!dt) return;
    const files = [...(dt.files || [])];
    if (editable(t) && !files.length) return;
    if (editable(t) && t.closest && t.closest('#chat-input, .chat-composer, .fl-bar')) return;
    if (files.length) { e.preventDefault(); fromFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${i + 1}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`, { type: f.type })))).then(set => { set.source = 'paste'; take(set, zoneNow()); }); return; }
    const text = dt.getData('text/plain'); if (!text || !text.trim() || editable(t)) return;
    e.preventDefault();
    const url = /^https?:\/\/\S+$/.test(text.trim()), f = new File([text], url ? 'pasted-link.txt' : 'pasted.txt', { type: 'text/plain' });
    fromFiles([f]).then(set => { set.source = 'paste'; set.pastedText = text; set.url = url ? text.trim() : ''; sheet(set); });
  });

  // ---------- one place to act on a set ----------
  async function take(set, z, at) {
    if (!set.items.length && !set.skipped.length) return toast('That was empty.');
    z = z || { k: 'any' };
    if (z.k === 'choice') return choose(set, z.v);
    if (z.k === 'flint') return read(set);
    if (z.k === 'designer') return toDesigner(set);
    if (z.k === 'canvas') return toCanvas(set, at);
    if (z.k === 'board') return pins(set, z.el && z.el.closest('#ibd') ? 'me' : 'project');
    if (z.k === 'doc') return toDoc(set, z.el);
    if (z.k === 'files') return planUpload(set, destFor(z.el));
    if (z.k === 'chat') return toChat(set);
    return sheet(set);
  }
  async function choose(set, k) {
    if (k === 'files') return planUpload(set, destFor(null));
    if (k === 'read') return read(set);
    if (k === 'inspo') return pins(set, pid() && connected() ? 'project' : 'me');
    if (k === 'home') { const F = folderHomes(); if (!F) return; closeSheet(); try { await (F.use || F.set || F.setHome).call(F, { name: set.name, paths: set.paths || null, items: set.items }); } catch (e) { toast(e.message); } return; }
    if (k === 'newproj') return newProject(set);
  }
  function destFor(el) {
    const fg = el && el.closest && el.closest('.fg');
    if (fg) { const pane = fg.parentElement; return { scope: 'project', pid: pid(), dir: (pane && pane.dataset.fgFolder) || '', label: `${projName() || 'the project'}’s files${pane && pane.dataset.fgFolder ? ' › ' + pane.dataset.fgFolder : ''}` }; }
    if (el && el.closest && el.closest('#hub-files')) return connected() ? { scope: 'me', pid: '', dir: '', label: 'your files (only you)' } : { scope: 'local', dir: '', label: 'this device' };
    if (!connected()) return { scope: 'local', dir: '', label: 'this device' };
    return pid() ? { scope: 'project', pid: pid(), dir: '', label: `${projName() || 'the project'}’s files` } : { scope: 'me', pid: '', dir: '', label: 'your files (only you)' };
  }

  // ---------- the sheet: what to do, the plan, the progress ----------
  let sh = null, cur = null;
  function openSheet(html, cls) {
    closeSheet(true);
    const w = document.createElement('div'); w.className = 'dz-wrap'; w.id = 'dz-wrap';
    w.innerHTML = `<div class="dz-sheet ${cls || ''}" id="dz-sheet" role="dialog" aria-modal="true" aria-labelledby="dz-title" tabindex="-1">${html}</div>`;
    swap(() => document.body.appendChild(w)); sh = w;
    w.addEventListener('mousedown', e => { if (e.target === w) closeSheet(); });
    w.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
      if (e.key === 'Tab') { const f = [...w.querySelectorAll('button:not([disabled]), input:not([disabled]), select, [tabindex="0"]')].filter(x => x.offsetParent !== null); if (!f.length) return; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    });
    setTimeout(() => { const f = w.querySelector('[data-autofocus]') || w.querySelector('.dz-sheet button'); if (f) f.focus({ preventScroll: true }); }, 30);
    return w.querySelector('.dz-sheet');
  }
  function closeSheet(quiet) { if (sh) { const s = sh; sh = null; if (quiet) s.remove(); else swap(() => s.remove()); } }
  const head = (eyebrow, title, meta) => `<header class="dz-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2 id="dz-title">${esc(title)}</h2>${meta ? `<p class="dz-meta">${meta}</p>` : ''}</div><button type="button" class="dz-x" data-dz="close" aria-label="Close">${ico('x', 16)}</button></header>`;
  const metaOf = set => `${plural(set.items.length, 'file')} · ${fsize(set.items.reduce((n, x) => n + (x.size || 0), 0))}${set.skipped.length ? ` · ${plural(set.skipped.length, 'item')} skipped` : ''}`;
  // "anywhere else": the choices, with Flint's read of it right there
  async function sheet(set) {
    cur = set;
    const el = openSheet(`${head(set.source === 'paste' ? 'Pasted' : 'Dropped', label(set), metaOf(set))}
      <div class="dz-flint" id="dz-read"><span class="dz-fl" aria-hidden="true"><img src="assets/flint.svg" alt="" width="18" height="18"></span><p class="dz-say">Reading it…</p></div>
      <div class="dz-list" role="list">${choices().filter(c => set.folder || c.k !== 'home').map(c => choiceHtml(c, 'button')).join('')}${set.url ? `<button type="button" class="dz-choice" data-dz-link>${ico('pin', 20)}<span><b>Pin the link on the board</b><small>${esc(set.url.slice(0, 60))}</small></span></button>` : ''}</div>`, 'dz-choose');
    wireSheet(el, set);
    el.querySelector('.dz-choice').setAttribute('data-autofocus', '');
    try { const R = await analyze(set); const p = el.querySelector('.dz-say'); if (p) p.textContent = R.summary; } catch (e) { const p = el.querySelector('.dz-say'); if (p) p.textContent = 'I could not read it: ' + e.message; }
  }
  function wireSheet(el, set) {
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.dz === 'close') return closeSheet();
      if (b.dataset.dzChoice) return choose(set, b.dataset.dzChoice);
      if (b.hasAttribute('data-dz-link')) { closeSheet(); if (window.TribeInspo && window.TribeInspo.addLink) window.TribeInspo.addLink(set.url); else toast('The inspiration board did not load.'); }
    });
  }

  // ---------- upload: plan, duplicates, progress, cancel / retry / resume, Undo ----------
  const SECRET = it => !!(it.secret);
  async function markSecrets(set) {
    const R = await analyze(set), flagged = new Set(R.flags.secrets.map(s => s.path)), base = set.name && set.items.every(x => x.path.startsWith(set.name + '/')) ? set.name + '/' : '';
    for (const it of set.items) { const r = base ? it.path.slice(base.length) : it.path; it.secret = flagged.has(r) || FR().isSecretName(it.path); it.why = it.secret ? (R.flags.secrets.find(s => s.path === r) || { why: 'a key or credentials file' }).why : ''; }
  }
  // which files go: no secrets / .git unless the box is ticked, nothing over 50 MB, and the caps
  function selection(set) {
    const gitItems = set.includeSecrets ? set.skipped.filter(s => s.why === 'git' && s.item).map(s => s.item) : [];
    let list = set.items.concat(gitItems).filter(it => set.includeSecrets || !SECRET(it));
    const tooBig = list.filter(it => it.size > CAP.file); list = list.filter(it => it.size <= CAP.file && it.size > 0);
    const out = []; let bytes = 0, capped = 0;
    for (const it of list) { if (out.length >= CAP.files || bytes + it.size > CAP.bytes) { capped++; continue; } out.push(it); bytes += it.size; }
    return { list: out, bytes, tooBig, capped, secrets: set.items.filter(SECRET), empty: set.items.filter(it => !it.size).length };
  }
  const relIn = (set, it) => (set.name && it.path.startsWith(set.name + '/') && !set.flat ? it.path : it.path);
  // the folder label a file gets: dest.dir + the dropped folder's own path
  const dirOf = (dest, set, it) => { const parts = relIn(set, it).split('/').slice(0, -1); return [dest.dir, ...parts].filter(Boolean).join('/').split('/').filter(x => x && !x.startsWith('.')).join('/'); };
  async function existing(dest) {
    if (dest.scope === 'local') return ((window.TribeLocalFiles && window.TribeLocalFiles.list()) || []).filter(x => x.kind === 'file').map(x => ({ id: x.id, name: x.name || x.title, dir: x.dir || '', local: true }));
    try { const r = await C.api('/uploads', { project: dest.pid || undefined }); return (dest.scope === 'project' ? r.project : r.mine) || []; } catch { return []; }
  }
  async function planUpload(set, dest) {
    cur = set; set.dest = dest;
    if (dest.scope !== 'local' && !connected()) dest = set.dest = { scope: 'local', dir: '', label: 'this device' };
    await markSecrets(set);
    const have = await existing(dest), key = (d, n) => `${d}/${n}`.toLowerCase();
    const haveMap = new Map(have.map(f => [key(f.dir || '', f.name), f]));
    const draw = () => {
      const s = selection(set);
      s.list.forEach(it => { it.dup = haveMap.get(key(dirOf(dest, set, it), it.path.split('/').pop())) || null; });
      const dups = s.list.filter(it => it.dup);
      const skipNames = [...new Set(set.skipped.map(x => x.why === '.gitignore' ? x.path.split('/').slice(-1)[0] : x.why))].slice(0, 6);
      const html = `${head('Upload', label(set), metaOf(set))}
        <p class="dz-to">To <b>${esc(dest.label)}</b></p>
        ${set.report ? `<div class="dz-flint"><span class="dz-fl" aria-hidden="true"><img src="assets/flint.svg" alt="" width="18" height="18"></span><p class="dz-say">${esc(set.report.summary)}</p></div>` : ''}
        <ul class="dz-facts">
          <li><b>${plural(s.list.length, 'file')}</b> go up · ${fsize(s.bytes)}</li>
          ${set.skipped.filter(x => x.why !== 'git').length || set.expanded ? `<li><label class="dz-check"><input type="checkbox" id="dz-incskip" ${set.expanded ? 'checked' : ''}> Include skipped folders ${skipNames.length ? `<small>(${esc(skipNames.join(', '))})</small>` : ''}</label></li>` : ''}
          ${s.capped ? `<li class="dz-warn">${plural(s.capped, 'file')} left out: at most ${CAP.files} files and ${fsize(CAP.bytes)} per drop.</li>` : ''}
          ${s.tooBig.length ? `<li class="dz-warn">${plural(s.tooBig.length, 'file')} over ${fsize(CAP.file)} left out: ${esc(s.tooBig.slice(0, 3).map(x => x.path.split('/').pop()).join(', '))}</li>` : ''}
          ${s.empty ? `<li class="dz-quiet">${plural(s.empty, 'empty file')} skipped.</li>` : ''}
          ${set.truncated ? `<li class="dz-warn">The folder is huge: I stopped reading after ${CAP.walk} files.</li>` : ''}
        </ul>
        ${(s.secrets.length || set.skipped.some(x => x.why === 'git')) ? `<div class="dz-secrets" role="alert"><b>${plural(s.secrets.length, 'secret')}${set.skipped.some(x => x.why === 'git') ? ' and .git internals' : ''} stay out</b>
          <ul>${s.secrets.slice(0, 5).map(x => `<li><code>${esc(x.path.split('/').slice(-2).join('/'))}</code> <small>${esc(x.why)}</small></li>`).join('')}</ul>
          <label class="dz-check"><input type="checkbox" id="dz-incsecret" ${set.includeSecrets ? 'checked' : ''}> Upload them anyway (I know what they are)</label></div>` : ''}
        ${dups.length ? `<div class="dz-dups"><b>${plural(dups.length, 'file')} already in ${esc(dest.label)}</b><div class="dz-seg" role="radiogroup" aria-label="Files that are already there">${[['rename', 'Keep both'], ['replace', 'Replace'], ['skip', 'Skip']].map(([k, l]) => `<button type="button" role="radio" data-dup="${k}" aria-checked="${(set.dupMode || 'rename') === k}">${l}</button>`).join('')}</div></div>` : ''}
        <footer class="dz-foot"><button type="button" class="btn" data-dz="close">Cancel</button><button type="button" class="btn primary" id="dz-go" data-autofocus ${s.list.length ? '' : 'disabled'}>${ico('up', 16)} Upload ${plural(s.list.length, 'file')}</button></footer>`;
      const prev = sh && sh.querySelector('.dz-sheet.dz-plan'), focusId = document.activeElement && document.activeElement.id;
      const el = prev || openSheet(html, 'dz-plan');
      if (prev) { prev.innerHTML = html; const f = focusId && prev.querySelector('#' + CSS.escape(focusId)); if (f) f.focus({ preventScroll: true }); }
      if (!prev) el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.dz === 'close') return closeSheet();
        if (b.dataset.dup) { set.dupMode = b.dataset.dup; el.querySelectorAll('[data-dup]').forEach(x => x.setAttribute('aria-checked', String(x === b))); return; }
        if (b.id === 'dz-go') return upload(set, dest, selection(set).list);
      });
      const inc = el.querySelector('#dz-incskip'); if (inc) inc.onchange = async () => { if (inc.checked) { inc.disabled = true; await expandSkipped(set); set.report = null; await markSecrets(set); } else { set.items = set.items.filter(x => !x.wasSkipped); set.skipped = set.skippedOrig || set.skipped; set.expanded = false; set.report = null; await markSecrets(set); } draw(); };
      const sec = el.querySelector('#dz-incsecret'); if (sec) sec.onchange = () => { set.includeSecrets = sec.checked; draw(); };
    };
    draw();
  }
  // the resume manifest: the same drop (name, count, size, place) picks up where it stopped, file by file
  const RESUME = 'tribecode.dz.resume';
  const sigOf = (set, dest, list) => [set.name, list.length, list.reduce((n, x) => n + x.size, 0), dest.scope, dest.pid || '', dest.dir].join('|');
  async function upload(set, dest, list) {
    const sig = sigOf(set, dest, list), saved = ls.get(RESUME, null);
    const resume = saved && saved.sig === sig ? saved : null;
    const job = { set, dest, batch: resume ? resume.batch : rid(), list: list.map(it => ({ it, st: 'wait', err: '' })), abort: null, cancelled: false, ids: [], replaced: [] };
    set.job = job;
    if (resume) for (const j of job.list) if (resume.done.includes(j.it.path)) { j.st = 'done'; j.earlier = true; }
    const el = openSheet(`${head('Uploading', label(set), `To ${esc(dest.label)}`)}
      <div class="dz-bar" role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="${list.length}" aria-valuenow="0"><i></i></div>
      <p class="dz-count" id="dz-count" aria-live="polite"></p>
      <ul class="dz-files" id="dz-files">${job.list.map((j, i) => `<li data-i="${i}" class="st-${j.st}"><span class="dz-fn">${esc(j.it.path.split('/').slice(-2).join('/'))}</span><span class="dz-st"></span><button type="button" class="dz-retry" data-retry="${i}" hidden>Retry</button></li>`).join('')}</ul>
      <footer class="dz-foot" id="dz-ufoot"><button type="button" class="btn" id="dz-cancel">Cancel</button></footer>`, 'dz-up');
    const paint = () => {
      const done = job.list.filter(j => j.st === 'done').length, failed = job.list.filter(j => j.st === 'fail').length, skipped = job.list.filter(j => j.st === 'skip').length, n = job.list.length;
      const bar = el.querySelector('.dz-bar'); bar.setAttribute('aria-valuenow', String(done + skipped)); bar.querySelector('i').style.transform = `scaleX(${n ? (done + skipped) / n : 1})`;
      el.querySelector('#dz-count').textContent = `${done} of ${n} uploaded${skipped ? ` · ${skipped} skipped` : ''}${failed ? ` · ${failed} failed` : ''}${job.cancelled ? ' · stopped' : ''}`;
      job.list.forEach((j, i) => { const li = el.querySelector(`[data-i="${i}"]`); if (!li) return; li.className = 'st-' + j.st; li.querySelector('.dz-st').textContent = { wait: 'Waiting', up: 'Uploading…', done: j.earlier ? 'Done earlier' : j.renamed ? `Done as ${j.renamed}` : 'Done', fail: j.err || 'Failed', skip: 'Already there, skipped', stop: 'Stopped' }[j.st]; li.querySelector('.dz-retry').hidden = j.st !== 'fail'; });
    };
    const finish = () => {
      const done = job.list.filter(j => j.st === 'done' && !j.earlier).length + job.list.filter(j => j.earlier).length, failed = job.list.filter(j => j.st === 'fail' || j.st === 'stop').length;
      const foot = el.querySelector('#dz-ufoot');
      foot.innerHTML = `${failed ? `<button type="button" class="btn" id="dz-retryall">${job.cancelled ? 'Resume' : `Retry ${failed}`}</button>` : ''}${done ? '<button type="button" class="btn" id="dz-undo">Undo</button>' : ''}<button type="button" class="btn primary" id="dz-done" data-autofocus>Done</button>`;
      if (!failed) ls.set(RESUME, null);
      if (done) record(job, done);
      afterUpload(job, done);
      foot.querySelector('#dz-done').focus();
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.dz === 'close' || b.id === 'dz-done') return closeSheet();
      if (b.id === 'dz-cancel') { job.cancelled = true; if (job.abort) job.abort.abort(); job.list.forEach(j => { if (j.st === 'wait') j.st = 'stop'; }); paint(); return; }
      if (b.id === 'dz-undo') { closeSheet(); return undo(job.batch); }
      if (b.dataset.retry != null) { const j = job.list[+b.dataset.retry]; j.st = 'wait'; j.err = ''; return run([j]); }
      if (b.id === 'dz-retryall') { job.cancelled = false; const again = job.list.filter(j => j.st === 'fail' || j.st === 'stop'); again.forEach(j => { j.st = 'wait'; j.err = ''; }); el.querySelector('#dz-ufoot').innerHTML = '<button type="button" class="btn" id="dz-cancel">Cancel</button>'; return run(again); }
    });
    const taken = new Set((await existing(dest)).map(f => `${f.dir || ''}/${f.name}`.toLowerCase()));
    async function one(j) {
      const it = j.it, dir = dirOf(dest, set, it); let name = it.path.split('/').pop();
      if (it.dup && (set.dupMode || 'rename') === 'skip') { j.st = 'skip'; return; }
      if (it.dup && (set.dupMode || 'rename') === 'rename') { const m = /^(.*?)(\.[^.]*)?$/.exec(name); let n = 2; while (taken.has(`${dir}/${m[1]} (${n})${m[2] || ''}`.toLowerCase())) n++; name = `${m[1]} (${n})${m[2] || ''}`; j.renamed = name; }
      j.st = 'up'; paint();
      const blob = await it.get();
      if (dest.scope === 'local') {
        const LF = window.TribeLocalFiles; if (!LF) throw new Error('Files on this device did not load');
        const made = await LF.addFiles([new File([blob], name, { type: it.type || blob.type || '' })]); if (!made.length) throw new Error('Not kept');
        if (dir) await LF.save(made[0].id, { dir }); job.ids.push(made[0].id);
        if (it.dup && set.dupMode === 'replace' && it.dup.local) { await LF.remove(it.dup.id); }
      } else {
        job.abort = new AbortController();
        const q = new URLSearchParams({ name, scope: dest.scope, batch: job.batch, ...(dir ? { dir } : {}) });
        const r = await fetch(`${C.base()}/api/uploads?${q}`, { method: 'POST', headers: { ...authH(dest.pid), 'Content-Type': 'application/octet-stream' }, body: blob, signal: job.abort.signal });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Upload failed');
        job.ids.push(d.file.id);
        if (it.dup && set.dupMode === 'replace') { try { await C.api('/uploads/' + encodeURIComponent(it.dup.id), { method: 'DELETE' }); job.replaced.push(it.dup); } catch {} }
      }
      taken.add(`${dir}/${name}`.toLowerCase());
      j.st = 'done';
      const m = ls.get(RESUME, null) || { sig, batch: job.batch, done: [] }; if (m.sig !== sig) { m.sig = sig; m.batch = job.batch; m.done = []; } m.done.push(it.path); ls.set(RESUME, m);
    }
    async function run(todo) {
      const queue = todo.filter(j => j.st === 'wait'); let k = 0;
      const worker = async () => { while (k < queue.length && !job.cancelled) { const j = queue[k++]; try { await one(j); } catch (e) { j.st = job.cancelled ? 'stop' : 'fail'; j.err = e.name === 'AbortError' ? 'Stopped' : e.message; } paint(); } };
      paint(); await Promise.all([worker(), worker(), worker()]);
      job.list.forEach(j => { if (j.st === 'wait' && job.cancelled) j.st = 'stop'; });
      paint(); finish();
    }
    run(job.list);
  }
  function afterUpload(job, done) {
    if (job.dest.scope === 'project' && window.TribeFileGrid) { const pane = document.querySelector('.fg') && document.querySelector('.fg').parentElement; if (pane && window.TribeDocs && window.TribeDocs.load) window.TribeDocs.load().catch(() => {}); }
    if (window.TribeHub && window.TribeHub.reloadFiles) window.TribeHub.reloadFiles().catch(() => {});
    if (done && job.set.onDone) try { job.set.onDone(job, done); } catch {}
    if (done && job.set.folder) keep(job.set, false).then(R => say(job.set, `Added ${plural(done, 'file')} to ${job.dest.label}. ${R.summary}`)).catch(() => {});
  }
  // ---------- history (Recent activity has the project's drops; this keeps Undo here) ----------
  const HIST = 'tribecode.dz.history';
  const history = () => ls.get(HIST, []);
  function record(job, n) {
    const h = history().filter(x => x.batch !== job.batch);
    h.unshift({ batch: job.batch, name: label(job.set), n, scope: job.dest.scope, pid: job.dest.pid || '', label: job.dest.label, ids: job.dest.scope === 'local' ? job.ids : [], at: new Date().toISOString() });
    ls.set(HIST, h.slice(0, 20));
    if (window.TribeNotify && window.TribeNotify.reload && job.dest.scope === 'project') try { window.TribeNotify.reload(); } catch {}
  }
  async function undo(batch) {
    const h = history(), x = h.find(y => y.batch === batch); if (!x) return toast('Nothing to undo.');
    try {
      if (x.scope === 'local') { for (const id of x.ids) await window.TribeLocalFiles.remove(id); }
      else { const q = new URLSearchParams({ batch, scope: x.scope }); const r = await fetch(`${C.base()}/api/uploads?${q}`, { method: 'DELETE', headers: authH(x.pid) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Undo failed'); }
      x.undone = true; ls.set(HIST, h); ls.set(RESUME, null);
      toast(`Undone: ${x.name} is gone from ${x.label}.`);
      if (window.TribeHub && window.TribeHub.reloadFiles) window.TribeHub.reloadFiles().catch(() => {});
      if (window.TribeFileGrid && window.TribeDocs && window.TribeDocs.load) window.TribeDocs.load().catch(() => {});
      return true;
    } catch (e) { toast(e.message); return false; }
  }

  // ---------- direct drops ----------
  const images = set => set.items.filter(it => /^image\//.test(it.type) || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(it.path));
  const asFile = async it => (it.file instanceof Blob ? it.file : new File([await it.get()], it.path.split('/').pop(), { type: it.type }));
  const toData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  async function shrink(blob, max, q) {
    if (/svg/.test(blob.type)) return { src: await toData(blob), w: 300, h: 300 };
    const bmp = await createImageBitmap(blob), k = Math.min(1, max / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k)); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return { src: cv.toDataURL(blob.type === 'image/png' ? 'image/png' : 'image/jpeg', q || 0.84), w: bmp.width, h: bmp.height, cv };
  }
  async function toChat(set) {
    const pics = images(set);
    if (pics.length === set.items.length && pics.length <= 6 && pics.every(x => x.size <= 6 * 1048576)) {
      const ch = (window.TribeChannels && window.TribeChannels.current && window.TribeChannels.current()) || 'general';
      const items = await Promise.all(pics.map(async it => { const d = await toData(await it.get()); return { data: d.split(',')[1], mime: it.type || 'image/png' }; }));
      try { if (items.length === 1) await C.api(`/chat/${ch}/image`, { method: 'POST', body: items[0] }); else await C.api(`/chat/${ch}/images`, { method: 'POST', body: { items } }); } catch (e) { toast(e.message); }
      return;
    }
    set.onDone = async (job, n) => { const ch = (window.TribeChannels && window.TribeChannels.current && window.TribeChannels.current()) || 'general'; try { await C.api(`/chat/${ch}/send`, { method: 'POST', body: { text: `📎 Added ${n === 1 ? job.list[0].it.path.split('/').pop() : `${plural(n, 'file')}${job.set.name ? ` from ${job.set.name}` : ''}`} to Files.` } }); } catch {} };
    return planUpload(set, destFor(null));
  }
  async function pins(set, where) {
    const pics = images(set).slice(0, 12);
    if (!pics.length) { toast('Only pictures go on the board. Nothing to pin in that.'); return 0; }
    if (!connected()) { toast('The inspiration board lives with a tribe. Connect first.'); return 0; }
    closeSheet(); let n = 0;
    const p = where === 'me' || !pid() ? null : pid();
    for (const it of pics) {
      try {
        const s = await shrink(await it.get(), 360, 0.8); let thumb = s.src;
        if (!/^data:image\/(jpeg|png|webp)/.test(thumb) || thumb.length > 200 * 1024) { const im = await createImageBitmap(await it.get()); const cv = document.createElement('canvas'); const k = Math.min(1, 360 / Math.max(im.width, im.height)); cv.width = Math.max(1, im.width * k); cv.height = Math.max(1, im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); thumb = cv.toDataURL('image/jpeg', 0.7); }
        let colors = []; if (window.TribeInspo && window.TribeInspo.paletteOf && s.cv) try { colors = window.TribeInspo.paletteOf(s.cv, 5) || []; } catch {}
        if (!colors.length) colors = await colorsOf([it]);
        await C.api('/inspo/image', { method: 'POST', body: { ...(p ? { project: p } : { board: 'me' }), name: it.path.split('/').pop().replace(/\.[^.]+$/, ''), thumb, colors } });
        n++;
      } catch (e) { toast(`${it.path.split('/').pop()}: ${e.message}`); }
    }
    if (n) {
      toast(`Pinned ${plural(n, 'picture')} on ${p ? 'the project’s' : 'your'} inspiration board.`);
      if (p && window.TribeInspo && window.TribeInspo.draw) try { window.TribeInspo.draw(p); } catch {}
      if (window.TribeInspoBoard && window.TribeInspoBoard.state && window.TribeInspoBoard.state().open && window.TribeInspoBoard.load) try { window.TribeInspoBoard.load(); } catch {}
    }
    return n;
  }
  async function toDesigner(set) {
    const D = window.TribeSiteDesigner; if (!D || !D.dropFiles) return toast('The website designer did not load.');
    const files = []; for (const it of set.items.slice(0, 12)) files.push(await asFile(it));
    return D.dropFiles(files);
  }
  async function toCanvas(set, at) {
    const CV = window.TribeCanvas, E = CV && CV._e, st = CV && CV.state && CV.state();
    if (!E || !st || !st.open) return sheet(set);
    if (!st.canEdit) return toast('This design is view only.');
    const pics = images(set).slice(0, 12); if (!pics.length) return toast('Drop pictures or SVGs on the canvas. Other files go to Files.');
    const stage = E.stage, r = stage ? stage.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight }, v = E.view || { x: 0, y: 0, z: 1 };
    const px = at ? at.x : r.left + r.width / 2, py = at ? at.y : r.top + r.height / 2;
    let x = Math.round((px - r.left - v.x) / v.z), y = Math.round((py - r.top - v.y) / v.z);
    const nid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
    const nodes = [];
    for (const it of pics) {
      const b = await it.get(); const s = await shrink(b, 1600, 0.86);
      const k = Math.min(1, 480 / Math.max(s.w, s.h)), w = Math.round(s.w * k), h = Math.round(s.h * k);
      nodes.push({ id: nid(), t: 'rect', p: '', i: Date.now() % 1e7 + nodes.length, v: 1, x, y, w, h, name: it.path.split('/').pop().slice(0, 60), img: s.src, fill: 'transparent', r: 0 });
      x += w + 24;
    }
    E.insert(nodes, nodes[0].id);
    toast(`Added ${plural(nodes.length, 'picture layer')}. Ctrl Z takes ${nodes.length === 1 ? 'it' : 'them'} back.`);
    return nodes.length;
  }
  async function toDoc(set, el) {
    const ta = (el && el.closest('#doc-body')) || $('#doc-body'); if (!ta) return sheet(set);
    const lines = [];
    for (const it of set.items.slice(0, 10)) {
      const name = it.path.split('/').pop(), pic = /^image\//.test(it.type) || /\.(png|jpe?g|gif|webp)$/i.test(name);
      let url = '';
      if (connected()) {
        const q = new URLSearchParams({ name, scope: pid() ? 'project' : 'me' });
        const r = await fetch(`${C.base()}/api/uploads?${q}`, { method: 'POST', headers: { ...authH(), 'Content-Type': 'application/octet-stream' }, body: await it.get() });
        const d = await r.json().catch(() => ({})); if (!r.ok) { toast(d.error || 'Upload failed'); continue; }
        url = `${C.base()}/api/uploads/${encodeURIComponent(d.file.id)}/raw`; if (window.TribeMedia) url = window.TribeMedia.url(url);
      } else if (pic && it.size < 1.5 * 1048576) url = (await shrink(await it.get(), 1200, 0.84)).src;
      else { toast(`${name}: connect to a tribe to link files in docs.`); continue; }
      lines.push(pic ? `![${name.replace(/[[\]]/g, '')}](${url})` : `[${name.replace(/[[\]]/g, '')}](${url})`);
    }
    if (!lines.length) return 0;
    const text = '\n' + lines.join('\n') + '\n';
    ta.focus();
    if (typeof ta.setRangeText === 'function' && ta.selectionStart != null) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); else ta.value = (ta.value || '') + text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    toast(lines.length === 1 ? 'Added to the doc.' : `Added ${lines.length} files to the doc.`);
    return lines.length;
  }
  async function newProject(set) {
    closeSheet();
    const P = window.TribeProjects; if (!P || !P.fromFolder) return toast('Projects did not load.');
    if (!connected()) return toast('Projects live in a tribe. Start one, then drop the folder again.');
    if (set.paths && set.paths.length === 1 && set.folder) return P.fromFolder(set.name, [], set.paths[0]);
    await markSecrets(set);
    const base = set.name && set.items.every(x => x.path.startsWith(set.name + '/')) ? set.name.length + 1 : 0;
    const items = []; for (const it of set.items.filter(x => !SECRET(x))) items.push({ path: it.path.slice(base), file: await asFile(it) });
    if (set.items.some(SECRET)) toast(`${plural(set.items.filter(SECRET).length, 'secret')} left out of the new project.`);
    return P.fromFolder(set.name || 'New project', items);
  }

  // ---------- Flint: the card, the context, follow-ups ----------
  const DB = 'tribecode-dropzone';
  const idb = () => new Promise((res, rej) => { if (!window.indexedDB) return rej(new Error('no IndexedDB')); const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('ctx'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function idbPut(v) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('ctx', 'readwrite'); v == null ? t.objectStore('ctx').delete('cur') : t.objectStore('ctx').put(v, 'cur'); t.oncomplete = res; t.onerror = () => rej(t.error); }); db.close(); } catch {} }
  async function idbGet() { try { const db = await idb(); const v = await new Promise((res, rej) => { const r = db.transaction('ctx').objectStore('ctx').get('cur'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); db.close(); return v || null; } catch { return null; } }
  let ctx = null;   // { name, report, set?, readOnly, at }
  const F = () => window.TribeFlint;
  const A = (label, arg, primary) => ({ label, act: 'dz', arg, ...(primary ? { primary: true } : {}) });
  function cardHtml(R) {
    const K = R.key, F2 = R.flags, chips = [`${plural(R.files, 'file')}`, fsize(R.bytes), ...(R.folders ? [plural(R.folders, 'folder')] : []), ...(K.todos ? [plural(K.todos, 'TODO')] : []), ...(K.tests ? [plural(K.testFiles, 'test file')] : [])];
    return `<div class="dz-card" data-dz-card="${esc(R.kind.id)}"><span class="eyebrow">${esc(R.kind.label)}</span>
      <div class="dz-chips">${chips.map(c => `<span>${esc(c)}</span>`).join('')}${(K.colors || []).slice(0, 5).map(c => `<i class="dz-sw" style="background:${esc(c)}" title="${esc(c)}"></i>`).join('')}</div>
      ${K.entries && K.entries.length ? `<p><small>Starts at</small> <code>${esc(K.entries.slice(0, 3).join(' · '))}</code></p>` : ''}
      ${K.csv && K.csv[0] ? `<p><small>${esc(K.csv[0].path.split('/').pop())}</small> ${esc(K.csv[0].columns.map(c => c.name).slice(0, 6).join(' · '))}</p>` : ''}
      ${F2.secrets.length ? `<p class="dz-flag">⚠ ${esc(plural(F2.secrets.length, 'secret'))}: ${esc(F2.secrets.slice(0, 3).map(s => s.path.split('/').pop()).join(', '))}</p>` : ''}
      ${F2.duplicates.length ? `<p class="dz-quiet">${plural(F2.duplicates.length, 'set')} of duplicates</p>` : ''}${F2.executables.length ? `<p class="dz-quiet">${plural(F2.executables.length, 'program')} inside: never run here</p>` : ''}</div>`;
  }
  function say(set, text) {
    const R = set.report; if (!F() || !F().say || !R) return;
    const acts = R.suggestions.map((s, i) => A(s.label, 's:' + s.id, i === 0)).concat([{ label: 'Ask about it', act: 'fill', arg: `In ${R.name}, ` }]);
    if (ctx && ctx.readOnly) acts.push(A('Forget it', 'forget'));
    F().say(text || R.summary, acts, { html: cardHtml(R) });
    if (F().focus && !phone()) try { F().focus(); } catch {}
  }
  async function keep(set, readOnly) {
    const R = await analyze(set);
    ctx = { name: R.name, report: R, set, readOnly: !!readOnly, at: Date.now() };
    const { text, list, key, kind, summary, flags, files, folders, bytes, exts, cats, tree, suggestions } = R;
    await idbPut({ name: R.name, readOnly: !!readOnly, at: ctx.at, report: { name: R.name, text, list, key, kind, summary, flags, files, folders, bytes, exts, cats, tree, suggestions } });
    chip();
    return R;
  }
  async function read(set) {
    closeSheet();
    try { await keep(set, true); } catch (e) { return toast('Flint could not read it: ' + e.message); }
    say(set);
    return ctx.report;
  }
  function forget() {
    const had = !!ctx; ctx = null; idbPut(null); chip();
    if (had) toast('Flint forgot it. Nothing was saved to the project.');
    return had;
  }
  function chip() {
    let c = $('#dz-chip');
    if (!ctx) { if (c) swap(() => c.remove()); return; }
    if (!c) { c = document.createElement('div'); c.id = 'dz-chip'; c.className = 'dz-chip'; c.setAttribute('role', 'status'); document.body.appendChild(c); }
    c.innerHTML = `<span class="dz-dot" aria-hidden="true"></span><span>Flint is reading: <b>${esc(ctx.name)}</b></span><button type="button" class="dz-chip-x" data-dz-forget>Forget</button>`;
  }
  idbGet().then(v => { if (v && v.report && !ctx) { ctx = { name: v.name, report: v.report, set: null, readOnly: v.readOnly, at: v.at }; chip(); } });
  const FOLDERISH = /\b(the|this|that) (folder|project|drop|files?|code|repo|readme|csv|data|pictures|photos|images)\b|\bin (it|there|here)\b|\b(these|those) (files|photos|pictures|images)\b/;
  async function flint(text) {
    const t = String(text || '').toLowerCase().trim();
    if (/^(add|upload|attach|drop|read|open) (some |a |my )?(files?|folder|pictures|photos)\b|^(read|let flint read) a folder\b/.test(t)) { pick(); return { text: 'Pick files or a whole folder. I read it before anything is saved.', acts: [] }; }
    if (!ctx) return null;
    if (/^(forget|drop|clear) (it|that|the folder|this folder|the files|what you read)\b/.test(t) || (ctx.name && t === `forget ${ctx.name.toLowerCase()}`)) { forget(); return { text: `Forgot ${ctx ? ctx.name : 'it'}.`, acts: [] }; }
    const R = ctx.report, mentions = FOLDERISH.test(t) || (R.name && t.includes(R.name.toLowerCase()));
    const a = FR().answer(R, text);
    if (a && (mentions || a.files.length || /^how many\b/.test(t) || /\b(readme|todos?|dependenc|columns?|entry|licen[cs]e)\b/.test(t))) {
      const acts = a.needsAI ? [A('Ask my AI', 'ai:' + text, true), A('Ask a free AI', 'free:' + text)] : [];
      return { text: a.text, acts };
    }
    if (mentions && /\?$|^(why|what|how|can|could|should|is|are|does|do|explain|fix|find)\b/.test(t)) return { text: `That needs real reasoning about ${R.name}. I can hand an AI the question with the files that matter (secrets removed).`, acts: [A('Ask my AI', 'ai:' + text, true), A('Ask a free AI', 'free:' + text)] };
    return null;
  }
  async function askAI(q, free) {
    if (!ctx) return toast('Drop the folder again first.');
    const p = FR().pack(ctx.report, q);
    if (!free && F() && F().think) { const ok = await F().think(`${p.text}\n\nAnswer the QUESTION above about these files. Be specific: name files and lines.`); if (ok) return; if (F().say) F().say('No AI is connected here, so I opened the free AI bridge with the question and the files.', []); }
    if (window.TribeAIBridge) window.TribeAIBridge.open({ fresh: true, tab: 'out', files: p.files, goal: q });
    else toast('The AI bridge did not load.');
  }

  // ---------- the suggestions (each one does the thing) ----------
  const setNow = () => (ctx && ctx.set) || cur;
  async function itemsText(set, test) { const out = []; for (const it of set.items.filter(x => test(x.path))) out.push({ path: it.path, text: await (await it.get()).text() }); return out; }
  async function newDoc(title, body, kind) {
    if (connected()) { const r = await C.api('/docs', { method: 'POST', body: { title, body, ...(kind ? { kind } : {}) } }); if (window.TribeApp) window.TribeApp.show('docs'); setTimeout(() => window.TribeDocs && window.TribeDocs.open && window.TribeDocs.open(r.doc.slug), 150); return { slug: r.doc.slug }; }
    const LF = window.TribeLocalFiles; if (!LF) throw new Error('Files did not load');
    const it = await LF.create(kind === 'deck' ? 'slides' : kind || 'doc', { title, body }); if (LF.open) try { LF.open(it.id); } catch {} return { id: it.id };
  }
  const RUN = {
    async preview(set, R) {
      const html = set.items.filter(x => /(^|\/)index\.html?$/i.test(x.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
      if (!html) return F() && F().say('There is no index.html to preview. Make it a project and the preview runs it.', [A('Make it a project', 's:project', true)]);
      const dir = html.path.split('/').slice(0, -1).join('/'), resolve = h => { if (/^(https?:|data:|\/\/|#|mailto:)/i.test(h)) return null; const parts = (dir ? dir + '/' + h.replace(/^\.\//, '') : h.replace(/^\.\//, '')).replace(/^\//, (set.name ? set.name + '/' : '')).split('/'), o = []; for (const p of parts) { if (p === '..') o.pop(); else if (p && p !== '.') o.push(p); } return o.join('/'); };
      const byPath = new Map(set.items.map(x => [x.path, x])); let doc = (await (await html.get()).text()).replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');   // never run: no scripts, no inline handlers (and the frame is sandboxed too)
      const urls = []; const blobUrl = async p => { const it = byPath.get(p); if (!it || it.size > 3 * 1048576) return null; return toData(await it.get()); };   // data URLs: the sandboxed frame has an opaque origin, so blob: links from this page would not load
      for (const m of [...doc.matchAll(/<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi)]) { const it = byPath.get(resolve(m[1])); if (it) doc = doc.replace(m[0], `<style>${(await (await it.get()).text()).replace(/<\/style/gi, '')}</style>`); }
      for (const m of [...doc.matchAll(/\b(src|href)=["']([^"']+\.(?:png|jpe?g|gif|webp|svg|avif|ico))["']/gi)]) { const u = await blobUrl(resolve(m[2])); if (u) doc = doc.split(m[0]).join(`${m[1]}="${u}"`); }
      const el = openSheet(`${head('Preview · scripts off', `${set.name || 'Dropped'} › ${html.path.split('/').pop()}`, 'Nothing from a dropped folder runs here: pages, styles and pictures only.')}<iframe class="dz-frame-pv" id="dz-pv" sandbox="" title="Preview of ${esc(html.path)}"></iframe>`, 'dz-pvsheet');
      el.querySelector('#dz-pv').srcdoc = doc;
      el.addEventListener('click', e => { if (e.target.closest('[data-dz="close"]')) { closeSheet(); urls.forEach(u => URL.revokeObjectURL(u)); } });
      return true;
    },
    async project(set) { return newProject(set); },
    async todos(set, R) {
      const list = R.key.todoList.slice(0, 25); if (!list.length) return say0('No TODOs to turn into tasks.');
      const title = x => `${(x.text || x.tag).replace(/^[:\s-]+/, '').slice(0, 100) || x.tag} (${x.path.split('/').pop()}:${x.line})`;
      if (connected()) { let n = 0; for (const x of list) { try { await C.api('/tasks', { method: 'POST', body: { title: title(x), notes: `From ${R.name}/${x.path}:${x.line} (${x.tag})` } }); n++; } catch {} } return say0(`Made ${plural(n, 'task')} from the TODOs in ${R.name}.`, [{ label: 'Open the Task Board', act: 'nav', arg: 'tasks' }]); }
      await newDoc(`TODOs in ${R.name}`, `# TODOs in ${R.name}\n\n${list.map(x => `- [ ] ${title(x)}`).join('\n')}\n`); return say0(`Wrote ${plural(list.length, 'TODO')} as a checklist in Files on this device.`);
    },
    async readme(set, R) {
      const K = R.key, body = `# ${R.name}\n\n${R.summary.replace(/ Careful:.*$/, '')}\n\n## What's inside\n\n${R.tree.slice(0, 15).map(l => `- \`${l}\``).join('\n')}\n${K.entries.length ? `\n## Where it starts\n\n${K.entries.map(e => `- \`${e}\``).join('\n')}\n` : ''}${K.scripts && Object.keys(K.scripts).length ? `\n## Scripts\n\n${Object.entries(K.scripts).map(([k, v]) => `- \`npm run ${k}\`: ${v}`).join('\n')}\n` : ''}${K.deps && K.deps.length ? `\n## Built with\n\n${K.deps.slice(0, 15).map(d => `- ${d}`).join('\n')}\n` : ''}${K.license ? `\n## License\n\n${K.license}\n` : ''}`;
      await newDoc(`README · ${R.name}`, body); return say0(`Drafted a README for ${R.name} from what is in it. Edit it in Files.`);
    },
    async gallery(set, R) {
      const SC = window.TribeSiteCfg, D = window.TribeSiteDesigner; if (!SC || !D || !D.importCfg) return say0('The website designer did not load.');
      const pics = images(set).slice(0, 24), items = [];
      for (const it of pics) { try { const s = await shrink(await it.get(), 1000, 0.8); items.push({ img: s.src, alt: it.path.split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), caption: '' }); } catch {} }
      if (!items.length) return say0('I could not read those pictures.');
      const cfg = SC.blank(R.name), hero = cfg.pages[0].blocks.find(b => b.type === 'hero'), foot = cfg.pages[0].blocks.find(b => b.type === 'footer');
      if (hero) { hero.props.img = items[0].img; hero.props.alt = items[0].alt; hero.variant = 'split'; }
      cfg.pages[0].blocks = [hero, { type: 'gallery', variant: 'masonry', props: { title: 'Gallery', items } }, foot].filter(Boolean);
      await D.importCfg(SC.normalize(cfg), `Gallery from ${R.name}`);
      return say0(`Made a gallery website from ${plural(items.length, 'photo')}: it's open in the website designer, one Undo away.`);
    },
    async moodboard(set) { const n = await pins(set, pid() && connected() ? 'project' : 'me'); if (n && window.TribeInspoBoard && window.TribeInspoBoard.open) try { window.TribeInspoBoard.open({ board: pid() ? undefined : 'me' }); } catch {} return n; },
    async sheet(set, R) {
      const c = R.key.csv[0]; if (!c) return say0('There is no CSV here.');
      const it = set.items.find(x => x.path.endsWith(c.path)); const txt = await (await it.get()).text();
      const rows = txt.replace(/\r/g, '').split('\n').filter(l => l.trim()).slice(0, 500).map(l => { const out = []; let cur2 = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur2 += '"'; i++; } else q = !q; } else if (ch === c.sep && !q) { out.push(cur2); cur2 = ''; } else cur2 += ch; } out.push(cur2); return out.map(x => x.trim().replace(/\|/g, '/')); });
      const col = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
      const n = rows.length, total = c.columns.map((x, i) => (i === 0 ? 'Total' : x.type === 'number' ? `=SUM(${col(i)}2:${col(i)}${n})` : ''));
      const md = [rows[0], rows[0].map(() => '---'), ...rows.slice(1), total].map(r => `| ${r.join(' | ')} |`).join('\n') + '\n';
      await newDoc(c.path.split('/').pop().replace(/\.(csv|tsv)$/i, ''), md, 'sheet');
      return say0(`Opened ${c.path.split('/').pop()} as a sheet: ${plural(n - 1, 'row')}, with totals for the number columns.`);
    },
    async deck(set, R) {
      const docs = await itemsText(set, p => /\.(md|markdown|txt)$/i.test(p));
      if (!docs.length) return say0('Only Markdown and text documents become slides here (PDF and Word need their app).');
      const slides = docs.slice(0, 12).map(d => { const r = FR().readme(d.text), heads = (d.text.match(/^#{2,3}\s+.+$/gm) || []).map(h => h.replace(/^#+\s+/, '')).slice(0, 5), bullets = heads.length ? heads : (d.text.match(/^\s*[-*]\s+.+$/gm) || []).map(b => b.replace(/^\s*[-*]\s+/, '')).slice(0, 5);
        return `## ${r.title || d.path.split('/').pop().replace(/\.[^.]+$/, '')}\n\n${r.summary ? r.summary + '\n\n' : ''}${bullets.map(b => `- ${b}`).join('\n')}`; });
      await newDoc(`${R.name} · slides`, `<!-- theme: campfire -->\n\n# ${R.name}\n\nFrom ${plural(docs.length, 'document')}\n\n---\n\n${slides.join('\n\n---\n\n')}\n`, 'deck');
      return say0(`Started a deck: ${plural(slides.length + 1, 'slide')} from ${plural(docs.length, 'doc')}.`);
    },
    async bug(set, R) { ctx = ctx || { name: R.name, report: R, set }; const p = FR().pack(R, 'find the bug'); if (!window.TribeAIBridge) return say0('The AI bridge did not load.'); window.TribeAIBridge.open({ fresh: true, tab: 'out', files: p.files, goal: `Find the bug in ${R.name}. Say which file and line, why it breaks, and the smallest fix.` }); return true; },
    async files(set) { return planUpload(set, destFor(null)); },
  };
  function say0(text, acts) { if (F() && F().say) F().say(text, acts || []); else toast(text); return text; }
  async function run(arg) {
    arg = String(arg || '');
    if (arg === 'forget') return forget();
    if (arg.startsWith('ai:')) return askAI(arg.slice(3), false);
    if (arg.startsWith('free:')) return askAI(arg.slice(5), true);
    const id = arg.replace(/^s:/, ''), set = setNow();
    if (!set || !set.items.length) return say0('Drop the folder again and I will do that.');
    const R = await analyze(set);
    if (!RUN[id]) return null;
    try { return await RUN[id](set, R); } catch (e) { say0(`That did not work: ${e.message}`); return null; }
  }

  // ---------- the picker (phones, keyboards, anyone who doesn't drag) ----------
  function inputs() {
    let a = $('#dz-in-files'), b = $('#dz-in-folder');
    if (!a) { a = document.createElement('input'); a.type = 'file'; a.multiple = true; a.id = 'dz-in-files'; a.hidden = true; a.tabIndex = -1; document.body.appendChild(a); a.onchange = () => { const f = [...a.files]; a.value = ''; if (f.length) fromFiles(f).then(s => afterPick(s)); }; }
    if (!b) { b = document.createElement('input'); b.type = 'file'; b.multiple = true; b.webkitdirectory = true; b.id = 'dz-in-folder'; b.hidden = true; b.tabIndex = -1; document.body.appendChild(b); b.onchange = () => { const f = [...b.files]; b.value = ''; if (f.length) fromFiles(f).then(s => afterPick(s)); }; }
    return { a, b };
  }
  let pickZone = null;
  function afterPick(set) { const z = pickZone; pickZone = null; if (z && z.k === 'read') return read(set); return take(set, z && z.k !== 'any' ? z : { k: 'any' }); }
  function pick(o = {}) {
    pickZone = o.zone || null; inputs();
    const el = openSheet(`${head('Add', 'Files or a folder', 'Flint reads it first. Nothing is saved until you say where.')}
      <div class="dz-list">
        <button type="button" class="dz-choice" id="dz-pick-files" data-autofocus>${ico('file', 20)}<span><b>Choose files</b><small>Pictures, docs, code, anything</small></span></button>
        <button type="button" class="dz-choice" id="dz-pick-folder">${ico('folder', 20)}<span><b>Choose a folder</b><small>Skips node_modules, .git and build output</small></span></button>
      </div>
      ${history().length ? `<section class="dz-hist" aria-label="Recent drops"><span class="eyebrow">Recent drops</span><ul>${history().slice(0, 4).map(h => `<li><span>${esc(h.name)} <small>· ${plural(h.n, 'file')} · ${esc(h.label)}</small></span>${h.undone ? '<small>Undone</small>' : `<button type="button" class="linkish" data-undo="${esc(h.batch)}">Undo</button>`}</li>`).join('')}</ul></section>` : ''}`, 'dz-pick');
    el.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.dz === 'close') return closeSheet();
      if (b.dataset.undo) { if (await undo(b.dataset.undo)) { b.replaceWith(Object.assign(document.createElement('small'), { textContent: 'Undone' })); } return; }
      if (b.id === 'dz-pick-files') { closeSheet(); return inputs().a.click(); }
      if (b.id === 'dz-pick-folder') {
        closeSheet();
        if (window.showDirectoryPicker && !phone()) { try { const h = await window.showDirectoryPicker(); return afterPick(await fromHandle(h)); } catch (err) { if (err.name === 'AbortError') return; } }
        return inputs().b.click();
      }
    });
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-dzpick]')) { e.preventDefault(); return pick({ zone: e.target.closest('.flint-mount, #flint, .fl-full') ? { k: 'read' } : null }); }
    if (e.target.closest('[data-dz-forget]')) return forget();
  });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'U' || e.key === 'u')) { e.preventDefault(); pick({ zone: zoneNow() }); } });

  // ---------- drag files out of TribeCode to the desktop (Chrome, Edge: DownloadURL) ----------
  document.addEventListener('dragstart', e => {
    const c = e.target.closest && e.target.closest('[data-up][data-upname]'); if (!c || !e.dataTransfer) return;
    let u = `${C.base()}/api/uploads/${encodeURIComponent(c.dataset.up)}/raw?dl=1`; if (window.TribeMedia) u = window.TribeMedia.url(u);
    try { e.dataTransfer.setData('DownloadURL', `${c.dataset.uptype || 'application/octet-stream'}:${c.dataset.upname}:${u}`); e.dataTransfer.setData('text/uri-list', u); e.dataTransfer.effectAllowed = 'copy'; } catch {}
  });

  window.TribeDropZone = {
    pick, take, sheet, read, run, forget, flint, undo, history, fromFiles, fromItems, fromPaths, zoneAt, analyze,
    context: () => ctx && { name: ctx.name, readOnly: ctx.readOnly, kind: ctx.report.kind.id, summary: ctx.report.summary, suggestions: ctx.report.suggestions.map(s => s.id) },
    state: () => ({ overlay: !!(ov && ov.classList.contains('on')), sheet: !!sh, set: cur && { name: cur.name, items: cur.items.length, skipped: cur.skipped.length, job: cur.job ? cur.job.list.map(j => ({ path: j.it.path, st: j.st, renamed: j.renamed || '' })) : null, batch: cur.job ? cur.job.batch : '' } }),
    CAP,
  };
})();
