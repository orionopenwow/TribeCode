// Motion Studio's files (feat/motion, app/ui/motionstudio.js): one motion graphic per JSON file in the project, at
// motion/<key>.motion.json (projects other than the first under projects/<pid>/motion/), so they travel with the project
// like its other files. The doc is checked with the same engine the browser uses (app/ui/motionkit.js normalize).
//   GET    /api/projects/:pid/motion              -> { items: [{ key, name, template, aspect, bars, bpm, updated, by }] } newest first
//   GET    /api/projects/:pid/motion/:key         -> { doc, key, updated, by }
//   PUT    /api/projects/:pid/motion/:key { doc } -> { key, updated }       builders (not spectators)
//   DELETE /api/projects/:pid/motion/:key         -> { ok }
// MCP ("have my AI do it"): motion_list, motion_read { key }, motion_write { key, doc } with the same checks, so a member's
// own agent edits a motion graphic the way the app does (docs/MOTION-STUDIO.md has the doc's shape).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Kit = require('../app/ui/motionsocial.js');   // motionkit.js plus the social posts and share clips

const okKey = k => /^[a-z0-9][a-z0-9-]{0,63}$/.test(String(k || ''));
const MAX = 6 * 1024 * 1024;   // pictures from the Launch kit can ride along as data URLs

module.exports = function motionStudio({ P, base, broadcast = () => {}, perms = null, requests = () => null }) {
  const err = (status, m) => Object.assign(new Error(m), { status });
  const rel = (pid, key) => (pid === P.defaultId() ? '' : `projects/${pid}/`) + `motion/${key}.motion.json`;
  const projRole = (me, pid) => ((P.get(pid) || {}).members || {})[me.id];
  const mayRole = (me, pid) => !!me && me.role !== 'spectator' && projRole(me, pid) !== 'spectator' && (perms ? perms.atLeast(me, 'builder', pid) : true);
  const canEdit = (me, pid) => mayRole(me, pid) && (!perms || perms.can(me, 'motion.edit', pid));   // feat/cowork-editors: a row in the table (motion.edit)
  const canSee = (me, pid) => !!me && !!P.get(pid) && (!P.canSee || P.canSee(me, pid));
  function read(pid, key) { try { return JSON.parse(fs.readFileSync(base.p(rel(pid, key)), 'utf8')); } catch { return null; } }
  function list(pid) {
    const dir = path.dirname(base.p(rel(pid, 'x')));
    let names = []; try { names = fs.readdirSync(dir).filter(f => f.endsWith('.motion.json')); } catch {}
    return names.map(f => { const key = f.slice(0, -12), r = read(pid, key); if (!r || !r.doc) return null; const d = r.doc;
      return { key, name: d.name, template: d.template, aspect: d.aspect, bars: d.bars, bpm: d.bpm, updated: r.updated, by: r.by }; })
      .filter(Boolean).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  }
  function write(pid, key, raw, me) {
    if (!okKey(key)) throw err(400, 'bad motion key');
    if (!raw || typeof raw !== 'object') throw err(400, 'send a doc');
    if (JSON.stringify(raw).length > MAX) throw err(413, 'that motion graphic is too big (pictures over 6 MB in total)');
    const doc = Kit.normalize(raw);
    const rec = { doc, key, updated: new Date().toISOString(), by: String(me.name || me.id || '').slice(0, 60) };
    fs.mkdirSync(path.dirname(base.p(rel(pid, key))), { recursive: true });
    fs.writeFileSync(base.p(rel(pid, key)), JSON.stringify(rec));
    broadcast({ type: 'motion', project: pid, key });
    return rec;
  }
  async function route(req, res, { m, b: pid, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!canSee(me, pid)) return fail(res, 404, 'project not found');
    const key = parts[3];
    try {
      if (!key && m === 'GET') return send(res, 200, { items: list(pid) });
      if (!okKey(key)) return fail(res, 400, 'bad motion key');
      if (m === 'GET') { const r = read(pid, key); return r ? send(res, 200, { ...r, canEdit: canEdit(me, pid), canSuggest: mayRole(me, pid) && !canEdit(me, pid) }) : fail(res, 404, 'no such motion graphic'); }
      if (!canEdit(me, pid) && m === 'PUT' && mayRole(me, pid) && requests()) {
        const body = await readBody(req, MAX + 1024).catch(() => null); if (!body) return fail(res, 413, 'that motion graphic is too big');
        if (me.role === 'agent' || body.asRequest) return send(res, 202, requests().fromRefusal(pid, me, 'motion', body.doc, { key, title: body.title, why: body.why, summary: body.summary, before: body.before, after: body.after }));
        perms.can(me, 'motion.edit', pid);
        return fail(res, 403, 'changing motion graphics needs someone’s OK here: suggest the change instead');
      }
      if (!canEdit(me, pid)) return fail(res, 403, mayRole(me, pid) ? 'changing motion graphics needs someone’s OK here' : 'spectators can watch but not change motion graphics');
      if (m === 'DELETE') { try { fs.unlinkSync(base.p(rel(pid, key))); } catch {} broadcast({ type: 'motion', project: pid, key }); return send(res, 200, { ok: true }); }
      if (m !== 'PUT') return fail(res, 405, 'method not allowed');
      const body = await readBody(req, MAX + 1024).catch(() => null);
      if (!body) return fail(res, 413, 'that motion graphic is too big');
      const r = write(pid, key, body.doc, me);
      return send(res, 200, { key, updated: r.updated });
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  const text = t => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
  const pidOf = ctx => (ctx && ctx.project && P.get(ctx.project)) ? ctx.project : (P.current() || P.defaultId());
  const mcpTools = {
    motion_list: {
      description: 'List the motion graphics in this project (Motion Studio): key, name, template, aspect, bars and tempo.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async (_, me, ctx) => { const pid = pidOf(ctx); if (!canSee(me, pid)) return text('Not in this project.'); return text({ items: list(pid), templates: Kit.LIST, feels: Kit.FEEL_LIST, kinds: Object.keys(Kit.KINDS) }); },
    },
    motion_read: {
      description: 'Read one motion graphic as JSON (see docs/MOTION-STUDIO.md for the shape: states on a beat grid, each a kind with size, radius, fill and acts the cursor performs).',
      inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'The motion graphic key from motion_list' } }, required: ['key'], additionalProperties: false },
      run: async ({ key }, me, ctx) => { const pid = pidOf(ctx); if (!canSee(me, pid)) return text('Not in this project.'); const r = okKey(key) && read(pid, key); return text(r ? r.doc : `No motion graphic called ${key}.`); },
    },
    motion_write: {
      description: 'Save a motion graphic (the whole doc). It is checked like the app checks it: unknown kinds are dropped, numbers are clamped. Make a new one with a new key, or start from a template: { "template": "ui-reel" } fills in the rest. People see the change in Motion Studio at once.',
      inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'lowercase-words-with-dashes' }, doc: { type: 'object', description: 'The motion doc, or { template, name, accent, aspect } to start from a template' } }, required: ['key', 'doc'], additionalProperties: false },
      run: async ({ key, doc }, me, ctx) => {
        const pid = pidOf(ctx);
        if (!canEdit(me, pid) && mayRole(me, pid) && requests()) {   // feat/cowork-editors: a refused helper's change waits for a person
          try { const d0 = doc && doc.template && !doc.states && Kit.TEMPLATES[doc.template] ? Kit.make(doc.template, { name: doc.name, accent: doc.accent, aspect: doc.aspect }) : doc; const r = requests().fromRefusal(pid, me, 'motion', d0, { key }); return text(r.applied ? `Saved ${key}.` : `Sent as a change request (${r.request.to.join(', ')} can approve it). Nothing changes until a person says yes.`); } catch (e) { return text(e.message); }
        }
        if (!canEdit(me, pid)) return text('You can look but not change motion graphics in this project.');
        try {
          const d = doc && doc.template && !doc.states && Kit.TEMPLATES[doc.template] ? Kit.make(doc.template, { name: doc.name, accent: doc.accent, aspect: doc.aspect }) : doc;
          const r = write(pid, key, d, me); return text(`Saved ${key} (${r.doc.states.length} states, ${r.doc.bars} bars at ${r.doc.bpm} BPM).`);
        } catch (e) { return text(e.message); }
      },
    },
  };
  return { route, list, read, write, mcpTools };
};
