// Files kept on this device (feat/setup-local): every create and open tool in All files works with no tribe.
// Docs (rich text), sheets, whiteboards, designs, pictures, media, code and any upload live in IndexedDB on this
// device and open in the same editors a project uses, through a small local backend instead of the server:
//   doc         hub.js editText() (the note editor: richtext.js + doclayout.js)
//   sheet       sheet.js TribeSheet.mount() in a full-screen pane
//   whiteboard  whiteboard.js TribeWhiteboard.open(id, { backend })   (the backend answers /whiteboard like the server)
//   design      canvas/canvas.js TribeCanvas.open(id, { backend })    (the backend answers /canvas like the server)
//   file        hub.js openFile() (pictures, audio, video, PDFs, 3D models via viewers.js); code and text open in a
//               plain code editor here
// "Move to…" sends an item into a project of the tribe you are in (a real one or the local draft from setuplocal.js)
// with the project's own API, then removes the copy here once the project has it (never before).
// Edits are last writer wins per element, like the server (server/whiteboard.js, server/canvas.js), so a later move
// is a plain list of ops. Notes stay in hub.js's scratchpad (also local until you are in a tribe).
//   window.TribeLocalFiles = { ready, list(), get(id), create(kind, o), addFiles(files), save(id, patch), remove(id),
//     open(id), moveTo(id, pid), moveMenu(anchor, id), backend(kind), lww(container, ops), blob(id), KINDS }
(function () {
  'use strict';
  const DB = 'tribecode-local', VER = 1, MAX = 50 * 1048576;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const ico = (id, sz = 16) => `<svg class="i" style="width:${sz}px;height:${sz}px" aria-hidden="true"><use href="#${id}"/></svg>`;
  const rid = () => 'lf' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => (b % 36).toString(36)).join('');
  const iso = () => new Date().toISOString();
  const C = () => window.TribeClient;
  const KINDS = {
    doc: { label: 'Doc', icon: 'i-doc', title: 'Untitled doc' },
    sheet: { label: 'Sheet', icon: 'i-grid', title: 'Untitled sheet' },
    whiteboard: { label: 'Whiteboard', icon: 'i-whiteboard', title: 'Untitled board' },
    design: { label: 'Design', icon: 'i-canvas', title: 'Untitled design' },
    file: { label: 'File', icon: 'i-clip', title: 'File' },
  };
  // what kind of file a name is (the same groups as server/uploads.js)
  function fkind(name, type) {
    const x = String(name || '').toLowerCase().split('.').pop();
    if (/^image\//.test(type || '') || /^(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/.test(x)) return 'image';
    if (/^audio\//.test(type || '') || /^(mp3|wav|ogg|m4a|flac|aac)$/.test(x)) return 'audio';
    if (/^video\//.test(type || '') || /^(mp4|webm|mov|mkv)$/.test(x)) return 'video';
    if (x === 'pdf') return 'pdf';
    if (/^(glb|gltf|obj|fbx|stl)$/.test(x)) return 'model';
    if (/^(zip|tar|gz|tgz|7z|rar)$/.test(x)) return 'archive';
    if (/^(js|mjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|cc|cpp|h|hpp|cs|php|swift|lua|sh|ps1|bat|html|css|scss|json|ya?ml|toml|sql|gd|vue|svelte)$/.test(x)) return 'code';
    if (/^(md|txt|csv|tsv|log|ini|cfg)$/.test(x)) return 'text';
    return 'file';
  }
  const textish = k => k === 'code' || k === 'text';

  // ---------- IndexedDB (memory if the browser has none) ----------
  let dbp = null; const mem = { items: new Map(), blobs: new Map() };
  function idb() {
    if (!dbp) dbp = new Promise(res => {
      try { const r = indexedDB.open(DB, VER); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' }); if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); }; r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
      catch { res(null); }
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await idb(); if (!d) return fn(null);
    return new Promise(res => { let out; const t = d.transaction(store, mode); const os = t.objectStore(store); const r = fn(os); if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = t.onabort = () => res(undefined); });
  }
  const items = new Map();
  const ready = (async () => {
    const all = await tx('items', 'readonly', os => (os ? os.getAll() : null));
    for (const it of (all || [...mem.items.values()])) items.set(it.id, it);
  })();
  const emit = () => { try { dispatchEvent(new CustomEvent('tribe-local-files')); } catch {} };
  async function persist(it) { items.set(it.id, it); await tx('items', 'readwrite', os => (os ? os.put(it) : mem.items.set(it.id, it))); }
  async function blobPut(id, b) { await tx('blobs', 'readwrite', os => (os ? os.put(b, id) : mem.blobs.set(id, b))); }
  async function blob(id) { return tx('blobs', 'readonly', os => (os ? os.get(id) : null)).then(b => b || mem.blobs.get(id) || null); }

  const list = () => [...items.values()].sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const get = id => items.get(id) || null;
  async function create(kind, o = {}) {
    await ready;
    if (!KINDS[kind] || kind === 'file') throw new Error('unknown kind');
    const it = { id: rid(), kind, title: String(o.title || KINDS[kind].title).slice(0, 120), at: iso(), updated: iso() };
    if (kind === 'doc') it.body = String(o.body || '');
    if (kind === 'sheet') it.body = String(o.body || '| A | B | C |\n| --- | --- | --- |\n|  |  |  |\n'), it.version = 1;
    if (kind === 'whiteboard') it.elements = {};
    if (kind === 'design') it.nodes = {};
    await persist(it); emit(); return it;
  }
  async function addFiles(files) {
    await ready; const out = [];
    for (const f of files) {
      if (!f.size) { toast(`${f.name} is empty.`); continue; }
      if (f.size > MAX) { toast(`${f.name} is over ${MAX / 1048576} MB.`); continue; }
      const it = { id: rid(), kind: 'file', title: String(f.name).slice(0, 120), name: String(f.name).slice(0, 120), size: f.size, type: f.type || '', fkind: fkind(f.name, f.type), at: iso(), updated: iso() };
      await blobPut(it.id, f); await persist(it); out.push(it);
    }
    emit(); return out;
  }
  async function save(id, patch) { const it = get(id); if (!it) return null; Object.assign(it, patch, { updated: iso() }); await persist(it); emit(); return it; }
  async function remove(id) { items.delete(id); await tx('items', 'readwrite', os => (os ? os.delete(id) : mem.items.delete(id))); await tx('blobs', 'readwrite', os => (os ? os.delete(id) : mem.blobs.delete(id))); emit(); }

  // ---------- last writer wins, per element (the same rule as server/whiteboard.js and server/canvas.js) ----------
  function lww(box, ops) {
    const applied = [];
    for (const op of (Array.isArray(ops) ? ops : []).slice(0, 5000)) {
      if (!op || typeof op.id !== 'string') continue;
      const cur = box[op.id];
      if (op.del && !cur) continue;
      if (cur && (cur.v || 0) > (op.v || 0)) continue;   // equal versions: the newer write wins (as the demo canvas does)
      box[op.id] = op.del ? { id: op.id, del: true, v: op.v || 0, at: iso() } : { ...op, at: iso() };
      applied.push(box[op.id]);
    }
    return applied;
  }
  const live = box => Object.fromEntries(Object.entries(box || {}).filter(([, e]) => !e.del));

  // ---------- the local backend: answers what the whiteboard and the design canvas ask the server ----------
  const NOT_HERE = 'That needs a project. Use Move to… to bring this file into one.';
  function fail(status, msg) { const e = new Error(msg); e.status = status; throw e; }
  function backend(kind) {
    const st = () => (window.TribeStore && window.TribeStore.get()) || {};
    const meNow = () => ({ id: 'me', name: st().name || 'You', color: st().color || '#F26B1D', role: 'host' });
    const route = kind === 'whiteboard' ? 'whiteboard' : 'canvas', field = kind === 'whiteboard' ? 'elements' : 'nodes';
    const listKey = kind === 'whiteboard' ? 'boards' : 'files', oneKey = kind === 'whiteboard' ? 'board' : 'file';
    const shape = it => ({ id: it.id, name: it.title, created: it.at, updated: it.updated, [field]: live(it[field]) });
    return {
      local: true,
      connected: () => true, hasToken: () => true, project: () => 'local', sendActivity() {}, send: () => false,
      state: () => ({ me: meNow(), members: [meNow()], project: 'local', projects: [] }),
      // polish: pictures on a board kept here are blobs in IndexedDB ('blobs', key 'img-…'); elements carry src 'local:img-…'
      ...(kind === 'whiteboard' ? { async upload(b, name) { await ready; const k = 'img-' + rid().slice(2); await blobPut(k, b); return { id: 'local:' + k, name: name || 'picture' }; } } : {}),
      async api(path, o = {}) {
        await ready;
        const m = (o.method || 'GET').toUpperCase(), body = o.body || {};
        const [a, id, c] = String(path).split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
        if (a !== route) fail(404, NOT_HERE);
        const mine = () => list().filter(x => x.kind === kind);
        if (!id && m === 'GET') return { [listKey]: mine().map(it => ({ id: it.id, name: it.title, updated: it.updated, count: Object.keys(live(it[field])).length })), canEdit: true, canManage: true };
        if (!id && m === 'POST') { const it = await create(kind, { title: body.name }); return { [oneKey]: shape(it) }; }
        const it = get(id); if (!it || it.kind !== kind) fail(404, 'That file is gone from this device.');
        if (!c && m === 'GET') return { [oneKey]: shape(it), canEdit: true, canManage: true };
        if (!c && m === 'PATCH') { const name = String(body.name || '').trim().slice(0, 120); if (!name) fail(400, 'Give it a name.'); await save(id, { title: name }); return { [oneKey]: shape(it) }; }
        if (c === 'ops' && m === 'POST') { const box = it[field] = it[field] || {}; const ap = lww(box, body.ops); if (ap.length) await save(id, {}); return { ok: true, applied: ap.length, rejected: [] }; }
        if (c === 'clear' && m === 'POST') { const box = it[field] || {}; for (const [k, e] of Object.entries(box)) if (!e.del) box[k] = { id: k, del: true, v: (e.v || 0) + 1, at: iso() }; await save(id, {}); return { ok: true }; }
        if (!c && m === 'DELETE') { await remove(id); return { ok: true }; }
        fail(404, NOT_HERE);
      },
    };
  }
  const backends = { whiteboard: null, design: null };
  const be = k => (backends[k] = backends[k] || backend(k));

  // ---------- open ----------
  function open(id) {
    const it = get(id); if (!it) return toast('That file is gone from this device.');
    if (it.kind === 'doc') return window.TribeHub && window.TribeHub.editText({
      title: it.title, body: it.body || '', where: 'On this device', at: it.updated,
      save: (title, body) => save(id, { title: title || 'Untitled doc', body }), remove: () => remove(id), move: anchor => moveMenu(anchor, id),
    });
    if (it.kind === 'sheet') return openSheet(it);
    if (it.kind === 'whiteboard') { if (!window.TribeWhiteboard) return toast('The whiteboard did not load. Reload the app.'); window.TribeWhiteboard.open(it.id, { backend: be('whiteboard') }); return chrome(it); }
    if (it.kind === 'design') { if (!window.TribeCanvas) return toast('The design canvas did not load. Reload the app.'); window.TribeCanvas.open(it.id, { backend: be('design') }); return chrome(it); }
    if (it.kind === 'file') return textish(it.fkind) && it.size < 2 * 1048576 ? openCode(it) : window.TribeHub && window.TribeHub.openFile(asFile(it));
  }
  // the same shape hub.js uses for uploads, marked local (hub.js reads the bytes from here, not the server)
  const asFile = it => ({ id: it.id, name: it.title, size: it.size, type: it.type, kind: it.fkind, at: it.updated, byName: 'On this device', local: true });

  // A full-screen pane (sheet and code), with "On this device · Move to…" in its own bar.
  function pane(it, cls) {
    closePane();
    const w = document.createElement('div'); w.className = 'lf-wrap ' + cls; w.id = 'lf-pane';
    w.innerHTML = `<div class="lf-pane" role="dialog" aria-modal="true" aria-label="${esc(it.title)}"><div class="lf-where"><span class="lf-dot" aria-hidden="true"></span><span>On this device</span><span style="flex:1"></span><button class="btn sm" id="lf-move">${ico('i-folder', 14)}Move to…</button></div><div class="lf-body" id="lf-body"></div></div>`;
    document.body.appendChild(w);
    w.querySelector('#lf-move').onclick = e => moveMenu(e.currentTarget, it.id);
    return w;
  }
  function closePane() { const w = document.getElementById('lf-pane'); if (w) { if (w._destroy) try { w._destroy(); } catch {} w.remove(); } }
  function openSheet(it) {
    if (!window.TribeSheet) return toast('Sheets did not load. Reload the app.');
    const w = pane(it, 'lf-sheet'), body = w.querySelector('#lf-body');
    const h = window.TribeSheet.mount(body, {
      doc: { title: it.title, body: it.body, version: it.version || 1 },
      save: async ({ body: b, title }) => { const cur = get(it.id); if (!cur) return null; const v = (cur.version || 1) + 1; await save(it.id, { body: b, title, version: v }); return { doc: { title, body: b, version: v } }; },
      close: () => { closePane(); emit(); },
      del: async () => { if (!confirm(`Delete “${get(it.id) ? get(it.id).title : it.title}” from this device?`)) return; closePane(); await remove(it.id); toast('Deleted'); },
      nameOf: () => 'you',
    });
    w._destroy = async () => { try { if (h && h.flush) await h.flush(); } catch {} try { h && h.destroy && h.destroy(); } catch {} };
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape' && document.getElementById('lf-pane') === w && !w.contains(document.activeElement)) { document.removeEventListener('keydown', k); closePane(); } });
  }
  async function openCode(it) {
    const w = pane(it, 'lf-code'), body = w.querySelector('#lf-body');
    const b = await blob(it.id), text = b ? await b.text() : '';
    body.innerHTML = `<div class="lf-code-top"><span class="lf-ic">${ico('i-git', 16)}</span><input class="lf-name" id="lf-name" value="${esc(it.title)}" maxlength="120" aria-label="File name" spellcheck="false"><span class="faint lf-st" id="lf-st">Saved</span><button class="btn sm" id="lf-dl">Download</button><button class="btn sm" id="lf-del">Delete</button><button class="btn sm primary" id="lf-done">Done</button></div>
      <textarea class="lf-src" id="lf-src" spellcheck="false" aria-label="${esc(it.title)}">${esc(text)}</textarea>`;
    const src = body.querySelector('#lf-src'), nm = body.querySelector('#lf-name'), stl = body.querySelector('#lf-st');
    let t = null;
    const write = async () => { const name = nm.value.trim() || it.title; const nb = new Blob([src.value], { type: it.type || 'text/plain' }); await blobPut(it.id, nb); await save(it.id, { title: name, name, size: nb.size, fkind: fkind(name, '') === 'file' ? it.fkind : fkind(name, '') }); stl.textContent = 'Saved'; };
    const q = () => { stl.textContent = 'Editing…'; clearTimeout(t); t = setTimeout(write, 500); };
    src.oninput = q; nm.oninput = q;
    src.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); src.setRangeText('  ', src.selectionStart, src.selectionEnd, 'end'); q(); } });
    w._destroy = () => { if (t) { clearTimeout(t); return write(); } };
    body.querySelector('#lf-done').onclick = () => closePane();
    body.querySelector('#lf-dl').onclick = async () => { const u = URL.createObjectURL(await blob(it.id)); const a = document.createElement('a'); a.href = u; a.download = get(it.id).title; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
    body.querySelector('#lf-del').onclick = async () => { if (!confirm(`Delete ${it.title} from this device?`)) return; clearTimeout(t); t = null; closePane(); await remove(it.id); toast('Deleted'); };
    src.focus();
  }
  // whiteboard and design: a quiet bar over the editor while a local file is open (where it lives, Move to…, back to All files)
  function chrome(it) {
    const old = document.getElementById('lf-float'); if (old) old.remove();
    const view = document.body.dataset.view;
    const bar = document.createElement('div'); bar.id = 'lf-float'; bar.className = 'lf-float'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'This file');
    bar.innerHTML = `<span class="lf-dot" aria-hidden="true"></span><span class="lf-ft">On this device</span><button class="btn sm" id="lf-fmove">${ico('i-folder', 14)}Move to…</button><button class="btn sm" id="lf-fback">All files</button>`;
    document.body.appendChild(bar);
    bar.querySelector('#lf-fmove').onclick = e => moveMenu(e.currentTarget, it.id);
    bar.querySelector('#lf-fback').onclick = () => { bar.remove(); window.TribeHub && window.TribeHub.open('docs'); };
    const mo = new MutationObserver(() => { if (document.body.dataset.view !== view) { bar.remove(); mo.disconnect(); emit(); } });
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  }

  // ---------- Move to… a project ----------
  function projects() {
    const P = window.TribeProjects, c = C();
    if (!c || !c.connected()) return [];
    return ((P && P.list && P.list()) || (c.state().projects || [])).filter(p => p && p.id);
  }
  function closeMove() { const m = document.getElementById('lf-movemenu'); if (m) m.remove(); }
  function moveMenu(anchor, id, note) {
    closeMove();
    const it = id && get(id), list = projects();
    const m = document.createElement('div'); m.className = 'dc-menu lf-menu'; m.id = 'lf-movemenu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="lf-mh"><span class="eyebrow">Move to…</span></div>` + (list.length
      ? list.map(p => `<button role="menuitem" data-to="${esc(p.id)}"><span class="lf-pf" style="background:${esc(p.color || '#F26B1D')}">${esc(p.emoji || (p.name || '?')[0].toUpperCase())}</span><span><b>${esc(p.name)}</b><small>Everyone in the project</small></span></button>`).join('')
      : `<button role="menuitem" data-to="__setup">${ico('i-plus', 16)}<span><b>Start a project</b><small>Instant, on this device. Choose where it lives later.</small></span></button>`);
    document.body.appendChild(m);
    const r = (anchor && anchor.getBoundingClientRect && anchor.getBoundingClientRect()) || { left: innerWidth / 2 - 130, bottom: innerHeight / 3 };
    m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px';
    m.querySelectorAll('[data-to]').forEach(b => b.onclick = async () => {
      closeMove();
      if (b.dataset.to === '__setup') return window.TribeLocalSetup && window.TribeLocalSetup.start();
      if (note) return note(b.dataset.to);
      if (!it) return;
      try { await moveTo(id, b.dataset.to); } catch (e) { toast(`Couldn't move it: ${e.message}`); }
    });
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
    return m;
  }
  const auth = pid => { const t = ((window.TribeStore && window.TribeStore.get().server) || {}).token; return { ...(t ? { Authorization: 'Bearer ' + t } : {}), 'X-Project': pid }; };
  // Idempotent per item: each step remembers what the project already has (it.moved), so a retry after a network
  // drop doesn't make a second copy. The local copy is removed only once the project confirmed everything.
  async function moveTo(id, pid) {
    const it = get(id), c = C(); if (!it) throw new Error('that file is gone');
    if (!c || !c.connected()) throw new Error('join or start a tribe first');
    const api = (path, o = {}) => c.api(path, { ...o, project: pid });
    const mv = it.moved && it.moved.pid === pid ? it.moved : (it.moved = { pid });
    const p = (projects().find(x => x.id === pid) || {}).name || 'the project';
    if (it.kind === 'doc' || it.kind === 'sheet') {
      if (!mv.slug) { const r = await api('/docs', { method: 'POST', body: { title: it.title, body: it.body || '', ...(it.kind === 'sheet' ? { kind: 'sheet' } : {}) } }); mv.slug = r.doc.slug; await save(id, { moved: mv }); }
    } else if (it.kind === 'whiteboard' || it.kind === 'design') {
      const wb = it.kind === 'whiteboard', base = wb ? '/whiteboard' : '/canvas', field = wb ? 'elements' : 'nodes';
      if (!mv.rid) { const r = await api(base, { method: 'POST', body: { name: it.title } }); mv.rid = (wb ? r.board : r.file).id; await save(id, { moved: mv }); }
      const ops = Object.values(live(it[field]));
      if (wb) for (const e of ops) if (e && e.t === 'image' && /^local:/.test(e.src || '')) {   // pictures kept on this device go up with the board
        mv.imgs = mv.imgs || {};
        if (!mv.imgs[e.src]) {
          const b = await blob(e.src.slice(6)); if (!b) continue;
          const r = await fetch(`${c.base()}/api/uploads?name=${encodeURIComponent('whiteboard.' + ((b.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg'))}&scope=project`, { method: 'POST', headers: { ...auth(pid), 'Content-Type': b.type || 'application/octet-stream' }, body: b });
          const d = await r.json().catch(() => ({})); if (!r.ok || !(d.file || {}).id) throw new Error(d.error || 'a picture did not upload');
          mv.imgs[e.src] = d.file.id; await save(id, { moved: mv });
        }
        e.src = mv.imgs[e.src];
      }
      for (let i = 0; i < ops.length; i += 400) await api(`${base}/${encodeURIComponent(mv.rid)}/ops`, { method: 'POST', body: { ops: ops.slice(i, i + 400) } });
    } else if (it.kind === 'file') {
      if (!mv.fid) {
        const b = await blob(id); if (!b) throw new Error('the file is gone from this device');
        const r = await fetch(`${c.base()}/api/uploads?name=${encodeURIComponent(it.title)}&scope=project`, { method: 'POST', headers: { ...auth(pid), 'Content-Type': 'application/octet-stream' }, body: b });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'upload failed');
        mv.fid = (d.file || {}).id || 'done'; await save(id, { moved: mv });
      }
    }
    if (mv.imgs) for (const k of Object.keys(mv.imgs)) await tx('blobs', 'readwrite', os => (os ? os.delete(k.slice(6)) : mem.blobs.delete(k.slice(6))));
    await remove(id);
    toast(`Moved to ${p}.`);
    try { dispatchEvent(new CustomEvent('tribe-local-moved', { detail: { id, pid, kind: it.kind } })); } catch {}
    return mv;
  }

  const urls = new Map();   // 'local:img-…' -> object URL (a board's pictures kept on this device)
  async function imageUrl(src) { if (urls.has(src)) return urls.get(src); await ready; const b = await blob(String(src).replace(/^local:/, '')); if (!b) throw new Error('picture gone'); const u = URL.createObjectURL(b); urls.set(src, u); return u; }
  window.TribeLocalFiles = { ready, list, get, create, addFiles, save, remove, open, moveTo, moveMenu, backend: be, lww, blob, imageUrl, fkind, KINDS, closePane };
})();
