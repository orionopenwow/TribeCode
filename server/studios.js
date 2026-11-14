// Studios (v0.27): free, open-source creative apps people use beside TribeCode (templates/studios.json) — ArtCraft,
// Blender, Krita, Pixelorama, Godot, LMMS, Audacity, Kdenlive, Penpot and more. TribeCode only links to each tool's
// official download page; nothing is downloaded or bundled. Each project also keeps a small "We use" list so the tribe
// (and its AI helpers, through tribe_api) can see which tools the team picked.
//
//   GET /api/projects/:id/studios        { kind, helps, recommended: [ids], studios: [...], pinned: [ids], kit }
//                                        kit: the project's open-source build stack (server/buildkit.js) for the chips
//   PUT /api/projects/:id/studios        { pinned: [ids] }   host and builders (not spectators or agents)
//
// The project kind comes from server/sense.js (game, 3d, site, app, …); "recommended" picks 3–4 studios for it,
// with ArtCraft first. Pins live in .tribe/studios.json ({ [projectId]: { pinned, by, at } }).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

module.exports = function studios({ P, base, root, sense, broadcast = () => {}, buildKit = null }) {
  const cat = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'templates', 'studios.json'), 'utf8')); } catch { return { studios: [], helps: {}, recommend: {} }; } })();
  // real screenshots with their credit, only for tools whose terms allow it (templates/studio-shots.json)
  const shots = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'templates', 'studio-shots.json'), 'utf8')).shots || {}; } catch { return {}; } })();
  const shotOf = id => { const r = shots[id]; return r && r.file && /^https:\/\//.test(r.source || '') && /^https:\/\//.test(r.licenseUrl || '') ? { file: String(r.file).replace(/[^a-z0-9-]/g, ''), w: +r.w || 0, h: +r.h || 0, alt: r.alt, by: r.by, license: r.license, licenseUrl: r.licenseUrl, source: r.source } : null; };
  const list = (cat.studios || []).filter(s => /^https:\/\//.test(s.url || '')).map(s => { const shot = shotOf(s.id); return shot ? Object.assign({}, s, { shot }) : s; });
  const ids = new Set(list.map(s => s.id));
  const FILE = '.tribe/studios.json';
  let pins = base.readJSON(FILE, {}); if (!pins || typeof pins !== 'object' || Array.isArray(pins)) pins = {};
  const save = () => base.writeJSON(FILE, pins);
  const roleIn = (me, pid) => ((P.get(pid) || {}).members || {})[me.id] || me.role;
  const canEdit = (me, pid) => !!me && me.role !== 'agent' && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator';

  function kindOf(pid) {
    try { const k = sense && sense.kindFor ? sense.kindFor(pid) : ''; const kind = typeof k === 'string' ? k : (k && k.kind) || ''; if (kind) return kind; } catch {}
    try { const v = sense && sense.get ? sense.get(pid) : null; if (v && v.kind) return v.kind; } catch {}
    return 'other';
  }
  function view(pid) {
    const kind = kindOf(pid);
    const rec = (cat.recommend[kind] || cat.recommend.other || []).filter(id => ids.has(id)).slice(0, 4);
    return { kind, helps: cat.helps[kind] || cat.helps.other || '', recommended: rec, studios: list, pinned: ((pins[pid] || {}).pinned || []).filter(id => ids.has(id)), kit: buildKit ? buildKit.brief(pid) : null };
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!P.get(b) || (P.canSee && !P.canSee(me, b))) return fail(res, 404, 'project not found');
    try {
      if (m === 'GET') return send(res, 200, view(b));
      if (m === 'PUT' || m === 'POST') {
        if (!canEdit(me, b)) return fail(res, 403, 'only the host and builders can choose the tribe\'s tools');
        const body = await readBody(req, 4 * 1024);
        const want = [...new Set((Array.isArray(body.pinned) ? body.pinned : []).map(x => String(x).slice(0, 40)).filter(id => ids.has(id)))].slice(0, 24);
        pins[b] = { pinned: want, by: me.id, at: new Date().toISOString() }; save();
        broadcast({ type: 'studios', project: b });
        return send(res, 200, view(b));
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 405, 'GET or PUT');
  }
  return { route, view, list: () => list };
};
