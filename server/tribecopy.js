// A copy of the tribe in one file (fix/p12-copies): "Save on this computer", "Send a copy" and "Move to the cloud".
//   GET  /api/tribe/folder               -> { path, canOpen } where this tribe is kept (canOpen: asked on that computer)
//   POST /api/tribe/folder/open          host, on that computer: opens the folder in Explorer / Finder
//   PUT  /api/tribe/moved {url}          host: this tribe moved to url (https); everyone who opens it here sees a banner
//   GET /api/tribe/copy[?one=<project id>]  -> a .tribe file (JSON): the projects this person can see, with their tasks, docs,
//                                          vision, project chat and designs (website, phone app, motion graphics)
// It never carries keys, tokens, passwords or direct messages: DMs live in their own store and are not read here, design
// fields named like a secret are dropped and secret-looking strings (ghp_…, sk-…, Bearer …) are blanked in every text.
// Opening a file goes through POST /api/import/solo (server/soloimport.js), which re-validates everything: a file is data.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const FORMAT = 'tribecode-tribe';
const SECRET_KEY = /token|secret|password|passwd|api[-_]?key|private[-_]?key|cookie|session|auth/i;
const SECRET_TEXT = /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{16,})\b/g;
const scrubText = s => String(s == null ? '' : s).replace(SECRET_TEXT, '[removed]');
function scrub(v, depth = 0) {
  if (depth > 40) return null;
  if (typeof v === 'string') return scrubText(v);
  if (Array.isArray(v)) return v.map(x => scrub(x, depth + 1));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) if (!SECRET_KEY.test(k)) o[k] = scrub(x, depth + 1); return o; }
  return v;
}

module.exports = function tribeCopy({ P, store, docs, loadTasks, siteDesign, appCreator, motionStudio, tribe, nameOf, slug, root = '', isLocal = () => false, saveTribe = () => {}, broadcast = () => {} }) {
  const display = d => { const h = os.homedir(); return h && d.startsWith(h) ? '~' + d.slice(h.length) : d; };
  function reveal(dir) {
    if (process.env.TRIBE_NO_REVEAL) return false;
    const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    try { const c = spawn(cmd, [dir], { detached: true, stdio: 'ignore' }); c.on('error', () => {}); c.unref(); return true; } catch { return false; }
  }
  const readVision = () => { try { return fs.readFileSync(store.p('VISION.md'), 'utf8'); } catch { return ''; } };
  function build(me, only) {
    const list = P.visibleTo(me).filter(p => !only || p.id === only);
    const projects = list.map(p => {
      const out = { key: p.id, name: p.name, emoji: p.emoji || '', color: p.color, bio: scrubText(p.bio || '') };
      P.inProject(p.id, () => {
        out.vision = scrubText(readVision());
        out.tasks = loadTasks().slice(0, 300).map(t => ({ title: scrubText(t.title), status: t.status, body: scrubText(t.body || ''), due: t.due || null, type: t.type, subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => ({ t: scrubText(s && s.t), done: !!(s && s.done) })) : undefined }));
        out.docs = docs.list().slice(0, 60).map(d => { const r = docs.read(d.slug); return { title: scrubText(d.title), body: scrubText((r && r.body) || ''), ...(d.kind ? { kind: d.kind } : {}) }; });
        out.chat = store.readJSONL(`chat/${P.channelOf(p.id)}.jsonl`, 1500).filter(m => m && m.text && !m.deleted)
          .map(m => ({ by: m.by === me.id ? 'me' : m.by === 'tribecode' ? 'tribecode' : 'friend', name: m.by === me.id ? '' : nameOf(m.by), at: m.at, text: scrubText(m.text) }));
      });
      const designs = {};
      try { const s = siteDesign.load(p.id); const c = s && (s.config || s); if (c && typeof c === 'object' && Object.keys(c).length) designs.site = scrub(c); } catch {}
      try { const a = appCreator.load(p.id); if (a) designs.app = scrub(a); } catch {}
      try { const ms = motionStudio.list(p.id); if (ms.length) designs.motion = Object.fromEntries(ms.slice(0, 20).map(x => [x.key, scrub((motionStudio.read(p.id, x.key) || {}).doc)]).filter(([, d]) => d)); } catch {}
      if (Object.keys(designs).length) out.designs = designs;
      return out;
    });
    return { format: FORMAT, version: 1, saved: new Date().toISOString(), tribe: { name: tribe().name }, projects };
  }
  async function route(req, res, { m, me, url, send, fail, c, readBody }) {
    if (c === 'folder' || c === 'folder/open') {
      if (!me || me.role === 'guest') return fail(res, 403, 'join the tribe first');
      const local = !!(req && isLocal(req));
      if (m === 'GET') return send(res, 200, { path: display(root), canOpen: local && me.role === 'host', name: tribe().name, movedTo: tribe().movedTo || '' });
      if (m === 'POST' && c === 'folder/open') { if (!local || me.role !== 'host') return fail(res, 403, 'open the folder on the computer that keeps the tribe'); return send(res, 200, { path: display(root), revealed: reveal(root) }); }
      return fail(res, 405, 'not here');
    }
    if (c === 'moved') {
      if (m !== 'PUT') return fail(res, 405, 'PUT only');
      if (!me || me.role !== 'host') return fail(res, 403, 'only the host can say where the tribe moved');
      const b = await readBody(req, 4096), u = String((b && b.url) || '').trim().slice(0, 300);
      if (u && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(u)) return fail(res, 400, 'the new address starts with https://');
      const t = tribe(); if (u) t.movedTo = u; else delete t.movedTo; saveTribe(t); broadcast({ type: 'tribe', tribe: t });
      return send(res, 200, { ok: true, movedTo: u });
    }
    if (m !== 'GET') return fail(res, 405, 'GET only');
    if (!me || me.role === 'guest') return fail(res, 403, 'join the tribe to save a copy');
    const only = url && url.searchParams.get('one');
    if (only && !P.canSee(me, only)) return fail(res, 404, 'project not found');
    const copy = build(me, only || '');
    const name = `${slug(only ? (P.get(only) || {}).name || 'project' : tribe().name) || 'tribe'}.tribe`;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(copy));
  }
  return { route, build };
};
module.exports.scrub = scrub;
module.exports.FORMAT = FORMAT;
