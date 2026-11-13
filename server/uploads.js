// Files (the Files center, app/ui/hub.js): upload any kind of file, either to your own shelf (only you) or to the
// current project (everyone in it). Stored under <tribe>/.tribe/uploads/<owner>/<id>/<name>, with an index per owner.
//   GET    /api/uploads[?project=|?all=1]        -> { mine: [file], project: [file], max } (all=1: every project you're in)
//   POST   /api/uploads?name=&scope=me|project   raw bytes in the body (any type, up to 50 MB) -> { file }
//   GET    /api/uploads/<id>/raw[?token=&dl=1]   -> the bytes. Pictures, audio, video, PDF and plain text open inline
//                                                 (nosniff + a sandbox CSP, so nothing runs as a page); the rest download.
//   DELETE /api/uploads/<id>                     -> the uploader or the host
//   feat/dropzone (app/ui/dropzone.js): POST also takes &dir=a/b (the folder it came from, cleaned: no "..", no hidden or
//   empty parts; it is only a label, the bytes still live under <id>/) and &batch=<id> (one drop). DELETE
//   /api/uploads?batch=<id>&scope=me|project removes your files of that drop (Undo) -> { removed }.
//   file = { id, name, size, type, kind, by, byName, at, scope, project?, dir?, batch? }
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 500;   // per owner
const TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', csv: 'text/plain; charset=utf-8', json: 'text/plain; charset=utf-8',
  js: 'text/plain; charset=utf-8', ts: 'text/plain; charset=utf-8', py: 'text/plain; charset=utf-8', rs: 'text/plain; charset=utf-8', html: 'text/plain; charset=utf-8',
  css: 'text/plain; charset=utf-8', log: 'text/plain; charset=utf-8', yml: 'text/plain; charset=utf-8', yaml: 'text/plain; charset=utf-8', toml: 'text/plain; charset=utf-8',
  gd: 'text/plain; charset=utf-8', lua: 'text/plain; charset=utf-8', go: 'text/plain; charset=utf-8', c: 'text/plain; charset=utf-8', cpp: 'text/plain; charset=utf-8',
  h: 'text/plain; charset=utf-8', cs: 'text/plain; charset=utf-8', java: 'text/plain; charset=utf-8', rb: 'text/plain; charset=utf-8', sh: 'text/plain; charset=utf-8',
  xml: 'text/plain; charset=utf-8', tmx: 'text/plain; charset=utf-8', tscn: 'text/plain; charset=utf-8', ini: 'text/plain; charset=utf-8', mjs: 'text/plain; charset=utf-8',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', zip: 'application/zip',
};
// svg can carry script: never inline it (the CSP sandbox would stop it, but a download is simpler and safer)
const INLINE = /^(image\/(png|jpeg|gif|webp|avif|bmp)|audio\/|video\/|application\/pdf|text\/plain)/;
const KIND = ext => /^(png|jpe?g|gif|webp|avif|bmp|svg)$/.test(ext) ? 'image' : /^(mp3|wav|ogg|m4a|flac)$/.test(ext) ? 'audio' : /^(webm|mp4|mov)$/.test(ext) ? 'video'
  : ext === 'pdf' ? 'pdf' : /^(glb|gltf|fbx|obj|blend)$/.test(ext) ? 'model' : /^(zip|7z|rar|tar|gz)$/.test(ext) ? 'archive'
  : /^(js|mjs|ts|py|rs|go|c|cpp|h|cs|java|rb|lua|gd|tscn|html|css|json|sh|yml|yaml|toml|xml|tmx|ini)$/.test(ext) ? 'code' : /^(md|txt|csv|log|rtf|docx?|odt)$/.test(ext) ? 'text' : 'file';

module.exports = function uploads({ store, P, nameOf, broadcast, can = (me) => me.role === 'host' }) {   // can(me, cap): feat/roles
  const dirOf = owner => path.join(store.root, '.tribe', 'uploads', owner);
  const idxOf = owner => `.tribe/uploads/${owner}/index.json`;
  const read = owner => { const v = store.readJSON(idxOf(owner), []); return Array.isArray(v) ? v : []; };
  const write = (owner, list) => { fs.mkdirSync(dirOf(owner), { recursive: true }); store.writeJSON(idxOf(owner), list); };
  const pjOwner = pid => 'pj-' + String(pid).replace(/[^\w-]/g, '');
  const safeName = n => (String(n || 'file').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').trim() || 'file').slice(0, 120);
  // a folder label: plain names only, at most 8 deep (never "..", ".git" or any hidden part)
  const cleanDir = d => String(d || '').split(/[\\/]+/).map(x => x.normalize('NFC').replace(/[:*?"<>|\x00-\x1f]/g, '_').trim()).filter(x => x && !x.startsWith('.')).slice(0, 8).map(x => x.slice(0, 60)).join('/').slice(0, 240);
  const cleanBatch = b => (/^[\w-]{4,40}$/.test(String(b || '')) ? String(b) : '');
  const find = (me, id) => { for (const o of [me.id, ...P.visibleTo(me).map(p => pjOwner(p.id))]) { const f = read(o).find(x => x.id === id); if (f) return { o, f }; } return null; };

  async function receive(req, file) {
    return new Promise((resolve, reject) => {
      let size = 0; const out = fs.createWriteStream(file);
      req.on('data', c => { size += c.length; if (size > MAX_BYTES) { req.destroy(); out.destroy(); fs.rmSync(file, { force: true }); reject(Object.assign(new Error('That file is over 50 MB.'), { status: 413 })); } });
      req.pipe(out); out.on('finish', () => resolve(size)); out.on('error', reject); req.on('error', reject);
    });
  }

  async function route(req, res, { m, b, c, me, url, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current();
    if (!b && m === 'GET') {
      const mine = read(me.id);
      // ?all=1 (the Files center): every project you're in; otherwise the current one
      const pids = url.searchParams.get('all') === '1' ? P.visibleTo(me).map(p => p.id) : (pid && P.canSee(me, pid) ? [pid] : []);
      const project = pids.flatMap(id => read(pjOwner(id)).map(f => ({ ...f, project: id }))).sort((x, y) => String(x.at).localeCompare(String(y.at)));
      return send(res, 200, { mine: mine.slice().reverse(), project: project.slice().reverse(), max: MAX_BYTES });
    }
    if (!b && m === 'POST') {
      if (me.role === 'spectator') return fail(res, 403, 'spectators cannot upload');
      const scope = url.searchParams.get('scope') === 'project' && pid && P.canSee(me, pid) ? 'project' : 'me';
      const owner = scope === 'project' ? pjOwner(pid) : me.id, list = read(owner);
      if (list.length >= MAX_FILES) return fail(res, 409, 'This shelf is full (500 files). Delete a few first.');
      const len = Number(req.headers['content-length'] || 0); if (len > MAX_BYTES) return fail(res, 413, 'That file is over 50 MB.');
      const name = safeName(url.searchParams.get('name')), ext = (path.extname(name).slice(1) || '').toLowerCase();
      const id = crypto.randomBytes(8).toString('hex'), dir = path.join(dirOf(owner), id);
      fs.mkdirSync(dir, { recursive: true });
      let size; try { size = await receive(req, path.join(dir, name)); } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); return fail(res, e.status || 500, e.message); }
      if (!size) { fs.rmSync(dir, { recursive: true, force: true }); return fail(res, 400, 'That file is empty.'); }
      const dirL = cleanDir(url.searchParams.get('dir')), batch = cleanBatch(url.searchParams.get('batch'));
      const f = { id, name, size, type: TYPES[ext] || 'application/octet-stream', kind: KIND(ext), by: me.id, byName: nameOf(me.id), at: new Date().toISOString(), scope, ...(scope === 'project' ? { project: pid } : {}), ...(dirL ? { dir: dirL } : {}), ...(batch ? { batch } : {}) };
      const now = read(owner); now.push(f); write(owner, now);   // feat/dropzone: re-read after the bytes arrived, so uploads in parallel don't drop each other
      if (scope === 'project' && broadcast) broadcast({ type: 'uploads', project: pid });
      return send(res, 200, { file: f });
    }
    if (!b && m === 'DELETE') {   // feat/dropzone: Undo a drop (only your own files of that batch)
      const batch = cleanBatch(url.searchParams.get('batch')); if (!batch) return fail(res, 400, 'which drop?');
      const scope = url.searchParams.get('scope') === 'project' && pid && P.canSee(me, pid) ? 'project' : 'me';
      const owner = scope === 'project' ? pjOwner(pid) : me.id, list = read(owner);
      const gone = list.filter(x => x.batch === batch && x.by === me.id);
      if (!gone.length) return send(res, 200, { removed: 0 });
      write(owner, list.filter(x => !gone.includes(x)));
      for (const x of gone) fs.rmSync(path.join(dirOf(owner), x.id), { recursive: true, force: true });
      if (scope === 'project' && broadcast) broadcast({ type: 'uploads', project: pid });
      return send(res, 200, { removed: gone.length });
    }
    if (b && c === 'raw' && m === 'GET') {
      const hit = find(me, b); if (!hit) return fail(res, 404, 'not found');
      const file = path.join(dirOf(hit.o), hit.f.id, hit.f.name);
      let st; try { st = fs.statSync(file); } catch { return fail(res, 404, 'not found'); }
      const inline = INLINE.test(hit.f.type) && url.searchParams.get('dl') !== '1';
      res.writeHead(200, { 'Content-Type': inline ? hit.f.type : 'application/octet-stream', 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox", 'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(hit.f.name)}` });
      return fs.createReadStream(file).pipe(res);
    }
    if (b && !c && m === 'DELETE') {
      const hit = find(me, b); if (!hit) return fail(res, 404, 'not found');
      if (hit.f.by !== me.id && !can(me, 'files.delete')) return fail(res, 403, 'only the uploader, an admin or the host can delete this');
      write(hit.o, read(hit.o).filter(x => x.id !== b)); fs.rmSync(path.join(dirOf(hit.o), hit.f.id), { recursive: true, force: true });
      if (hit.f.scope === 'project' && broadcast) broadcast({ type: 'uploads', project: hit.f.project });
      return send(res, 200, { ok: true });
    }
    return fail(res, 405, 'not allowed');
  }
  // feat/mcp-directory (server/connections.js): copy a file from the host's disk into a project's Files. The caller
  // has already checked the source (inside a host-picked folder, a plain file, not a symlink).
  function addLocal(pid, src, name, by, byName) {
    const owner = pjOwner(pid), list = read(owner);
    if (list.length >= MAX_FILES) return null;
    let size; try { size = fs.statSync(src).size; } catch { return null; }
    if (!size || size > MAX_BYTES) return null;
    const nm = safeName(name), ext = (path.extname(nm).slice(1) || '').toLowerCase();
    const id = crypto.randomBytes(8).toString('hex'), dir = path.join(dirOf(owner), id);
    fs.mkdirSync(dir, { recursive: true });
    try { fs.copyFileSync(src, path.join(dir, nm)); } catch { fs.rmSync(dir, { recursive: true, force: true }); return null; }
    const f = { id, name: nm, size, type: TYPES[ext] || 'application/octet-stream', kind: KIND(ext), by, byName, at: new Date().toISOString(), scope: 'project', project: pid };
    list.push(f); write(owner, list);
    if (broadcast) broadcast({ type: 'uploads', project: pid });
    return f;
  }
  return { route, MAX_BYTES, addLocal };
};
