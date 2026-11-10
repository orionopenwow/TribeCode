// Flint's conversation on a design file (app/ui/canvas/flintpane.js): the Make-style chat beside the Design canvas.
// Everyone looking at the same design file sees the same thread: what people asked, what Flint did, and who asked.
// Stored per project and file in .tribe/canvas/<file>.chat.json (projects/<pid>/... for the other projects), last 200.
//
//   GET  /api/canvaschat/<file>                -> { items, canEdit }
//   POST /api/canvaschat/<file>  { role, text, kind?, focus?, ref? }   -> { item }   role 'me' (a person) | 'flint'
//   POST /api/canvaschat/<file>/undo  { id }   -> { item }   marks a Flint step as undone (the undo itself is a canvas edit)
// Live: { type: 'cnv-chat', project, file, item } to everyone.
'use strict';
const crypto = require('node:crypto');

const MAX = 200;

module.exports = function canvasChat({ P, base, broadcast, canvas, nameOf = () => 'someone', memberColor = () => '#F26B1D' }) {
  const cache = new Map();
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
  const okId = id => /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(id || ''));
  const relOf = (pid, id) => (pid === P.defaultId() ? '' : `projects/${pid}/`) + `.tribe/canvas/${id}.chat.json`;
  function db(pid, id) {
    const k = `${pid}/${id}`;
    if (cache.has(k)) return cache.get(k);
    const d = base.readJSON(relOf(pid, id), { items: [] });
    if (!Array.isArray(d.items)) d.items = [];
    cache.set(k, d); return d;
  }
  const save = (pid, id) => base.writeJSON(relOf(pid, id), db(pid, id));

  async function route(req, res, { m, b: file, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current(); if (!pid || !P.canSee(me, pid)) return fail(res, 404, 'project not found');
    if (!okId(file)) return fail(res, 400, 'bad design file');
    const d = db(pid, file);
    if (m === 'GET' && !c) return send(res, 200, { items: d.items, canEdit: canvas.canEdit(me, pid) });
    if (m !== 'POST') return fail(res, 405, 'not allowed');
    if (!canvas.canEdit(me, pid)) return fail(res, 403, 'spectators can look but not edit');
    const body = await readBody(req, 16 * 1024);
    if (c === 'undo') {
      const it = d.items.find(x => x.id === str(body.id, 20));
      if (!it) return fail(res, 404, 'no such step');
      it.undone = true; it.undoneBy = me.id; save(pid, file);
      broadcast({ type: 'cnv-chat', project: pid, file, item: it });
      return send(res, 200, { item: it });
    }
    if (c) return fail(res, 404, 'not found');
    const text = str(body.text, 1200).trim(); if (!text) return fail(res, 400, 'say something');
    const role = body.role === 'flint' ? 'flint' : 'me';
    const item = { id: crypto.randomBytes(5).toString('base64url'), role, text, by: me.id, name: me.name || nameOf(me.id), color: memberColor(me.owner || me.id), at: new Date().toISOString() };
    if (role === 'flint') { item.kind = str(body.kind, 20); if (body.focus) item.focus = str(body.focus, 40); if (Array.isArray(body.ids)) item.ids = body.ids.map(x => str(x, 40)).slice(0, 400); if (body.ref) item.ref = str(body.ref, 600); }
    d.items.push(item); if (d.items.length > MAX) d.items.splice(0, d.items.length - MAX);
    save(pid, file);
    broadcast({ type: 'cnv-chat', project: pid, file, item });
    return send(res, 200, { item });
  }
  return { route };
};
