// A design as real files in the project's folder (pass 4, docs/WHERE-IT-LIVES.md).
//
// The website designer and App Creator keep one JSON design each (server/sitedesign.js, server/appcreator.js). This
// module writes that design out as files a person can open in a file manager and double-click, a moment after every
// save, with no button to press:
//   <project folder>/site/      index.html and its pages, pictures, fonts, site.json (the design itself)
//   <project folder>/app-web/   the phone web app (index.html, app.js, …) and app-design.json (the design itself)
// The project folder is the folder the project lives in (a chosen folder, else its code folder), else
// <tribe folder>/projects/<id>/ so a project with nothing set up still gets real files.
//
// Never silently over a person's own edits:
//   - a list of what was written (path -> hash) is kept in .tribe/designfiles/<pid>.json;
//   - before writing, a file on disk that is neither what we wrote last nor what we are about to write was changed
//     outside TribeCode. Nothing is written then; the editors ask: "Use the design" (their files are first copied to
//     <project folder>/.my-changes/<time>/…) or "Keep my files" (the designer stops writing that folder);
//   - a file is removed only when we wrote it and it is untouched.
// The folder is also the way back: with no saved design, <folder>/site/site.json or app-web/app-design.json is read.
//
// HTTP (members who can see the project):
//   GET  /api/projects/:id/design-files             { folder, canOpen, git, site:{…}, app:{…} }
//   POST /api/projects/:id/design-files/open        { kind? }  this computer only: shows the folder in the file manager
//   POST /api/projects/:id/design-files/resolve     { kind, use: 'design' | 'mine' }   people who can change that design
//   POST /api/projects/:id/design-files/write       { kind }   write now (the editors call it before publishing)
// Websocket: { type: 'design-files', project, kind, held } when a write was held back or went through after one.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const SUB = { site: 'site', app: 'app-web' };
const DESIGN = { site: 'site.json', app: 'app-design.json' };
const WAIT_MS = Number(process.env.TRIBE_DESIGNFILES_MS) || 700;
const sha = buf => crypto.createHash('sha1').update(buf).digest('hex');
const err = (status, m) => Object.assign(new Error(m), { status });

module.exports = function designFiles({ P, base, isLocal = () => false, broadcast = () => {}, canChange = () => true, log = () => {} }) {
  const makers = {};                       // kind -> pid => [[rel, Buffer|string], …] | null
  const safe = pid => String(pid).replace(/[^\w-]/g, '');
  const mfile = pid => `.tribe/designfiles/${safe(pid)}.json`;
  const man = pid => base.readJSON(mfile(pid), {}) || {};
  const saveMan = (pid, m) => { fs.mkdirSync(path.dirname(base.p(mfile(pid))), { recursive: true }); base.writeJSON(mfile(pid), m); };
  const real = p => { try { return fs.realpathSync(p); } catch { return null; } };

  // the project's folder: a chosen folder, else the code folder, else a plain one in the tribe folder
  function home(pid) {
    const p = P.get(pid); if (!p) throw err(404, 'project not found');
    for (const c of [p.folder, p.repo]) { const r = c && real(c); if (r) return { dir: r, kind: p.folder && real(p.folder) === r ? 'folder' : 'code' }; }
    const dir = base.p('projects', safe(pid)); fs.mkdirSync(dir, { recursive: true });
    return { dir: real(dir) || dir, kind: 'plain' };
  }
  const dirOf = (pid, kind) => path.join(home(pid).dir, SUB[kind]);
  const display = p => { const h = real(process.env.HOME || process.env.USERPROFILE || os.homedir()) || ''; return h && (p === h || p.startsWith(h + path.sep)) ? '~' + p.slice(h.length).replace(/\\/g, '/') : p; };
  const hashOf = full => { try { const st = fs.lstatSync(full); if (!st.isFile()) return st.isSymbolicLink() ? 'link' : 'other'; return sha(fs.readFileSync(full)); } catch { return null; } };
  // a path inside dir, never through a shortcut (symlink), never out
  function inDir(dir, rel) {
    const parts = String(rel).replace(/\\/g, '/').split('/').filter(Boolean);
    if (!parts.length || parts.some(x => x === '..' || x === '.' || x === '.git')) return null;
    let cur = dir;
    for (let i = 0; i < parts.length - 1; i++) { cur = path.join(cur, parts[i]); try { if (fs.lstatSync(cur).isSymbolicLink()) return null; } catch { break; } }
    return path.join(dir, ...parts);
  }
  function prune(dir, stop) { let d = dir; while (d !== stop && d.startsWith(stop + path.sep)) { try { fs.rmdirSync(d); } catch { return; } d = path.dirname(d); } }
  // remove what we wrote and nobody touched; anything else stays
  function clearOurs(dir, files) {
    for (const [rel, h] of Object.entries(files || {})) { const full = inDir(dir, rel); if (full && hashOf(full) === h) { try { fs.unlinkSync(full); prune(path.dirname(full), path.dirname(dir)); } catch {} } }
  }

  function write(pid, kind, { force = false, by = '' } = {}) {
    if (!SUB[kind] || !makers[kind]) return { ok: false, none: true };
    let list; try { list = makers[kind](pid); } catch (e) { log(`design files: ${kind} of ${pid}: ${e.message}`); return { ok: false, error: e.message }; }
    if (!list) return { ok: false, none: true };
    const m = man(pid), rec = m[kind] || { files: {} };
    if (rec.hands && !force) return { ok: false, hands: true };
    const h = home(pid), dir = path.join(h.dir, SUB[kind]);
    try { if (fs.lstatSync(dir).isSymbolicLink()) return { ok: false, error: 'the folder is a shortcut' }; } catch {}
    const moved = rec.dir && rec.dir !== dir, ours = moved ? {} : (rec.files || {});
    const adopted = !rec.dir && fs.existsSync(path.join(dir, DESIGN[kind]));   // files an earlier Publish or Export made, before this list existed
    const next = {}, todo = [], changed = [];
    for (const [rel, data] of list) {
      if (data == null) continue;
      const full = inDir(dir, rel); if (!full) continue;
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data instanceof Uint8Array ? data : String(data), 'utf8'), hh = sha(buf), cur = hashOf(full);
      next[rel] = hh;
      if (cur === hh) continue;
      if (cur != null && ours[rel] !== cur && !adopted) changed.push(rel);
      todo.push([rel, full, buf]);
    }
    for (const [rel, was] of Object.entries(ours)) { if (next[rel]) continue; const full = inDir(dir, rel), cur = full && hashOf(full); if (cur != null && cur !== was) changed.push(rel); }
    if (changed.length && !force) {
      const same = JSON.stringify(rec.held || []) === JSON.stringify(changed.slice(0, 40));
      m[kind] = { ...rec, held: changed.slice(0, 40), heldAt: rec.heldAt && same ? rec.heldAt : new Date().toISOString() }; saveMan(pid, m);
      if (!same) { try { broadcast({ type: 'design-files', project: pid, kind, held: changed.length }); } catch {} }
      return { ok: false, held: changed };
    }
    let kept = '';
    if (changed.length) {   // "Use the design": their files are copied aside first, nothing of theirs is thrown away
      kept = path.join('.my-changes', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), SUB[kind]);
      for (const rel of changed) { const full = inDir(dir, rel); try { if (full && fs.lstatSync(full).isFile()) { const to = path.join(h.dir, kept, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(full, to); } } catch {} }
    }
    for (const [, full, buf] of todo) {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      try { if (fs.lstatSync(full).isSymbolicLink()) fs.unlinkSync(full); } catch {}
      fs.writeFileSync(full, buf);
    }
    for (const [rel, was] of Object.entries(ours)) { if (next[rel]) continue; const full = inDir(dir, rel); if (full && (hashOf(full) === was || force)) { try { fs.unlinkSync(full); prune(path.dirname(full), dir); } catch {} } }
    if (moved) clearOurs(rec.dir, rec.files);   // the project got a new folder: our untouched files leave the old place
    const hadHold = !!(rec.held || rec.hands);
    m[kind] = { dir, files: next, at: new Date().toISOString(), by: by || rec.by || '' }; saveMan(pid, m);
    if (hadHold) { try { broadcast({ type: 'design-files', project: pid, kind, held: 0 }); } catch {} }
    return { ok: true, dir, files: Object.keys(next), wrote: todo.length, kept: kept ? kept.replace(/\\/g, '/') : '' };
  }

  // a moment after each save, one write per design
  const timers = new Map();
  function queue(pid, kind, by) {
    const k = `${pid}|${kind}`; clearTimeout(timers.get(k));
    const t = setTimeout(() => { timers.delete(k); try { write(pid, kind, { by }); } catch (e) { log(`design files: ${e.message}`); } }, WAIT_MS);
    if (t.unref) t.unref(); timers.set(k, t);
  }
  function flush(pid, kind) { const k = `${pid}|${kind}`; if (timers.has(k)) { clearTimeout(timers.get(k)); timers.delete(k); } return write(pid, kind); }
  const settle = pid => { for (const k of [...timers.keys()]) { const [id, kind] = k.split('|'); if (id === pid) flush(id, kind); } };
  const flushAll = () => { for (const k of [...timers.keys()]) { const [pid, kind] = k.split('|'); clearTimeout(timers.get(k)); timers.delete(k); try { write(pid, kind); } catch {} } };

  // the way back: the design file in the folder, when nothing is saved in the tribe's own data
  function adopt(pid, kind) {
    try {
      const f = path.join(dirOf(pid, kind), DESIGN[kind]); const st = fs.lstatSync(f);
      if (!st.isFile() || st.size > 8 * 1024 * 1024) return null;
      const d = JSON.parse(fs.readFileSync(f, 'utf8')); return d && typeof d === 'object' ? d : null;
    } catch { return null; }
  }
  function has(pid, kind) { try { return fs.statSync(path.join(dirOf(pid, kind), 'index.html')).isFile(); } catch { return false; } }
  function reveal(dir) {
    if (process.env.TRIBE_NO_REVEAL) return false;
    const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    try { const c = spawn(cmd, [dir], { detached: true, stdio: 'ignore', windowsHide: false }); c.on('error', () => {}); c.unref(); return true; } catch { return false; }
  }
  function status(pid, req) {
    const h = home(pid), m = man(pid);
    const one = kind => { const r = m[kind] || {}; return { has: has(pid, kind), folder: SUB[kind], files: Object.keys(r.files || {}).length, at: r.at || '', held: r.held || [], hands: !!r.hands }; };
    return { folder: display(h.dir), kind: h.kind, canOpen: !!(req && isLocal(req)), git: fs.existsSync(path.join(h.dir, '.git')), site: one('site'), app: one('app') };
  }
  function resolve(pid, kind, use, me) {
    if (!SUB[kind]) throw err(400, 'kind is site or app');
    const m = man(pid), rec = m[kind] || { files: {} };
    if (use === 'mine') { m[kind] = { ...rec, held: null, hands: true }; saveMan(pid, m); try { broadcast({ type: 'design-files', project: pid, kind, held: 0, hands: true }); } catch {} return { ok: true, hands: true }; }
    if (use === 'design') { if (rec.hands) { m[kind] = { ...rec, hands: false }; saveMan(pid, m); } return write(pid, kind, { force: true, by: me && me.id }); }
    throw err(400, 'use is design or mine');
  }

  async function route(req, res, { m, b, d, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    const p = P.get(b); if (!p || (P.canSee && !P.canSee(me, p.id))) return fail(res, 404, 'project not found');
    try {
      if (!d && m === 'GET') return send(res, 200, status(p.id, req));
      const body = m === 'POST' ? ((await readBody(req)) || {}) : {};
      const kind = SUB[body.kind] ? body.kind : '';
      if (d === 'open' && m === 'POST') {
        if (!isLocal(req)) return fail(res, 403, 'The folder is on the computer that keeps this tribe. Open it there.');
        const h = home(p.id); let dir = kind ? path.join(h.dir, SUB[kind]) : h.dir; if (!fs.existsSync(dir)) dir = h.dir;
        return send(res, 200, { path: display(dir), revealed: reveal(dir) });
      }
      if (d === 'resolve' && m === 'POST') {
        if (!kind || !canChange(me, p.id, kind)) return fail(res, 403, 'someone who can change this design answers that');
        return send(res, 200, { ...resolve(p.id, kind, body.use, me), status: status(p.id, req) });
      }
      if (d === 'write' && m === 'POST') {
        if (!kind || !canChange(me, p.id, kind)) return fail(res, 403, 'someone who can change this design does that');
        return send(res, 200, { ...flush(p.id, kind), status: status(p.id, req) });
      }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { use: (kind, fn) => { makers[kind] = fn; }, settle, home, dirOf, write, queue, flush, flushAll, adopt, has, status, resolve, route, SUB, DESIGN };
};
