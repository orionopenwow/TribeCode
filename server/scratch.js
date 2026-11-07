// The global scratchpad: quick notes and snippets that belong to no project yet (app/ui/hub.js, right panel).
// Private to each member: nobody else (not the host, not agents) can read or change them.
//   GET    /api/scratch                    { notes: [{ id, text, at, updated }] }   (newest first)
//   PUT    /api/scratch                    { notes: [{ id?, text }] }  replaces the list (autosave), ≤ 200 notes
//   POST   /api/scratch/<id>/move          { project }  files the note as a doc in that project, removes it here
//   POST   /api/scratch/<id>/task          { project }  makes a task in that project from the note, removes it here
//   DELETE /api/scratch/<id>
// Stored in .tribe/scratch/<memberId>.json (the tribe folder; never sent to anyone but its owner).
'use strict';
const fs = require('node:fs');

const MAX_NOTES = 200, MAX_TEXT = 20000;

module.exports = function scratch({ P, base, docs, createTask, id, str }) {
  const file = mid => `.tribe/scratch/${String(mid).replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
  const load = mid => { const d = base.readJSON(file(mid), null); return Array.isArray(d && d.notes) ? d.notes : []; };
  const save = (mid, notes) => { fs.mkdirSync(base.p('.tribe/scratch'), { recursive: true }); base.writeJSON(file(mid), { notes }); };
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const nid = () => 'n-' + id(8).toLowerCase();

  function put(mid, list) {
    if (!Array.isArray(list)) throw err(400, 'notes must be a list');
    const prev = new Map(load(mid).map(n => [n.id, n])), now = new Date().toISOString(), seen = new Set();
    const notes = [];
    for (const raw of list.slice(0, MAX_NOTES)) {
      const text = typeof (raw && raw.text) === 'string' ? raw.text.slice(0, MAX_TEXT) : '';
      let key = raw && typeof raw.id === 'string' && /^n-[a-z0-9_-]{4,16}$/.test(raw.id) ? raw.id : nid();
      if (seen.has(key)) key = nid(); seen.add(key);
      const old = prev.get(key);
      if (!text.trim() && !old) continue;   // an empty new note is not worth keeping
      notes.push({ id: key, text, at: old ? old.at : now, updated: old && old.text === text ? old.updated : now });
    }
    save(mid, notes);
    return notes;
  }
  function take(mid, nidv) {
    const notes = load(mid), n = notes.find(x => x.id === nidv);
    if (!n) throw err(404, 'no such note');
    return { n, rest: notes.filter(x => x.id !== nidv) };
  }
  const titleOf = text => {
    const first = String(text).split('\n').map(l => l.replace(/^#+\s*|^[-*]\s+|`+/g, '').trim()).find(Boolean) || '';
    return first.length > 60 ? first.slice(0, 59).trimEnd() + '…' : first;
  };
  function target(me, body) {
    const pid = str(body.project, 60);
    if (!pid || !P.get(pid)) throw err(400, 'pick a project');
    if (!P.canSee(me, pid)) throw err(403, 'you are not in that project');
    return pid;
  }
  function move(me, nidv, body) {
    const pid = target(me, body), { n, rest } = take(me.id, nidv);
    if (!n.text.trim()) throw err(400, 'that note is empty');
    const title = titleOf(n.text) || `Note ${new Date().toISOString().slice(0, 10)}`;
    const doc = P.inProject(pid, () => {
      const name = docs.find(title) ? `${title} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` : title;
      const r = docs.upsert({ name, body: n.text, by: me.id });
      return r.doc || null;
    });
    if (!doc) throw err(409, 'could not file that note');
    save(me.id, rest);
    return { project: pid, doc: { slug: doc.slug, title: doc.title }, notes: rest };
  }
  function task(me, nidv, body) {
    const pid = target(me, body), { n, rest } = take(me.id, nidv);
    if (!n.text.trim()) throw err(400, 'that note is empty');
    const lines = n.text.split('\n'), title = titleOf(n.text) || 'Untitled task';
    const t = P.inProject(pid, () => createTask({ title, body: lines.slice(1).join('\n').trim(), by: me.id, source: 'scratchpad' }));
    save(me.id, rest);
    return { project: pid, task: { id: t.id, title: t.title }, notes: rest };
  }

  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role === 'agent') return fail(res, 403, 'the scratchpad is for people');
    try {
      if (!b && m === 'GET') return send(res, 200, { notes: load(me.id) });
      if (!b && (m === 'PUT' || m === 'POST')) { const body = await readBody(req, 1024 * 1024); return send(res, 200, { notes: put(me.id, body.notes) }); }
      if (b && !c && m === 'DELETE') { const { rest } = take(me.id, b); save(me.id, rest); return send(res, 200, { notes: rest }); }
      if (b && (c === 'move' || c === 'task') && m === 'POST') {
        if (me.role === 'spectator') return fail(res, 403, 'spectators can keep notes but not file them');
        const body = await readBody(req, 4096);
        return send(res, 200, c === 'move' ? move(me, b, body) : task(me, b, body));
      }
    } catch (e) { return fail(res, e.status || 500, e.status ? e.message : 'scratchpad error'); }
    return null;
  }
  return { route, load };
};
