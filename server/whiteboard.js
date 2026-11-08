// Whiteboard (feat/whiteboard): a persistent, shared board per project that anyone in the crew can draw on, write on
// and stick notes to. Added from the sidebar's + Add gallery (built-in widget key 'whiteboard', server/widgets.js).
//
// A board is { id, name, created, updated, elements: { [id]: element } }, saved in the project's folder at
// .tribe/boards/<id>.json (projects other than the first live under projects/<pid>/.tribe/boards/). One board per
// project to start ('main', made on first open); more can be added.
//
// Sync is element-level last-writer-wins: every element carries a version `v`; a change is accepted when its v is
// higher than the stored one, otherwise the sender gets the stored element back (and shows that). Deletes are
// tombstones ({ id, del: true, v }) so an old edit can't bring an element back; tombstones are dropped after a day.
//
//   GET    /api/whiteboard                -> { boards: [{ id, name, updated, count }], canEdit, canManage }
//   POST   /api/whiteboard {name}         -> { board }                    host, admins, mods and builders
//   GET    /api/whiteboard/:id            -> { board, canEdit, canManage }
//   PATCH  /api/whiteboard/:id {name}     -> { board }                    rename (editors)
//   POST   /api/whiteboard/:id/ops {ops}  -> { ok, applied, rejected }    the same changes the socket carries (agents, tests)
//   POST   /api/whiteboard/:id/clear      -> { ok }                       host, admins and mods (perms 'board.manage')
//   DELETE /api/whiteboard/:id            -> { ok }                       host, admins and mods; 'main' can be cleared, not deleted
// WebSocket (from a client in the project):
//   { type: 'wbd-op', board, ops: [element] }   -> others get { type: 'wbd', project, board, ops, by }
//   { type: 'wbd-cursor', board, x, y }         -> others get { type: 'wbd-cursor', project, board, by, name, color, x, y }
//   { type: 'wbd-leave', board }                -> others get { type: 'wbd-cursor', ..., gone: true }
// Errors go back to the sender as { type: 'wbd-error', board, error, rejected? }.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TYPES = new Set(['stroke', 'rect', 'ellipse', 'line', 'arrow', 'text', 'sticky', 'image']);
const MAX_ELEMENTS = 5000;
const MAX_POINTS = 4000;
const MAX_OPS = 400;
const MAX_BOARDS = 20;
const TOMB_MS = 24 * 3600_000;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const num = (v, lo = -1e7, hi = 1e7) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 10) / 10)) : 0; };

module.exports = function whiteboard({ P, base, broadcast, perms, nameOf, memberColor = () => '#F26B1D' }) {
  const cache = new Map();   // `${pid}/${id}` -> board
  const dirty = new Set();
  let timer = null;
  const err = (status, m) => Object.assign(new Error(m), { status });
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);

  // ---------- who may do what ----------
  const projRole = (me, pid) => ((P.get(pid) || {}).members || {})[me.id];
  const canEdit = (me, pid) => !!me && me.role !== 'spectator' && projRole(me, pid) !== 'spectator' && (perms ? perms.atLeast(me, 'builder', pid) : me.role !== 'agent');
  const canManage = (me, pid) => !!me && me.role !== 'agent' && (me.role === 'host' || (perms ? perms.can(me, 'board.manage', pid) : false));

  // ---------- storage ----------
  const relOf = (pid, id) => (pid === P.defaultId() ? '' : `projects/${pid}/`) + `.tribe/boards/${id}.json`;
  const dirOf = pid => path.dirname(base.p(relOf(pid, 'x')));
  const okId = id => /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(id || ''));
  function load(pid, id, make = false) {
    if (!okId(id)) return null;
    const k = `${pid}/${id}`;
    if (cache.has(k)) return cache.get(k);
    let b = base.readJSON(relOf(pid, id), null);
    if (!b || typeof b !== 'object' || !b.elements || typeof b.elements !== 'object') {
      if (!make) return null;
      b = { id, name: id === 'main' ? 'Team board' : id, created: new Date().toISOString(), updated: new Date().toISOString(), elements: {} };
      cache.set(k, b); persist(pid, b, true);
      return b;
    }
    b.id = id; cache.set(k, b); return b;
  }
  function persist(pid, b, now) {
    dirty.add(`${pid}/${b.id}`);
    if (now) return flush();
    clearTimeout(timer); timer = setTimeout(flush, 600); if (timer.unref) timer.unref();
  }
  function flush() {
    clearTimeout(timer); timer = null;
    for (const k of [...dirty]) {
      dirty.delete(k);
      const b = cache.get(k); if (!b) continue;
      const pid = k.slice(0, k.lastIndexOf('/'));
      try {
        fs.mkdirSync(dirOf(pid), { recursive: true });
        const cut = Date.now() - TOMB_MS;   // forget old tombstones
        for (const [eid, el] of Object.entries(b.elements)) if (el.del && Date.parse(el.at || 0) < cut) delete b.elements[eid];
        base.writeJSON(relOf(pid, b.id), b);
      } catch (e) { console.error('  whiteboard: could not save ' + k + ': ' + e.message); }
    }
  }
  process.on('exit', () => { try { flush(); } catch {} });
  function list(pid) {
    const out = [];
    const main = load(pid, 'main', true);
    let files = []; try { files = fs.readdirSync(dirOf(pid)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(okId); } catch {}
    for (const id of new Set(['main', ...files])) {
      const b = id === 'main' ? main : load(pid, id); if (!b) continue;
      out.push({ id: b.id, name: b.name, updated: b.updated, count: Object.values(b.elements).filter(e => !e.del).length });
    }
    return out.sort((a, b) => (a.id === 'main' ? -1 : b.id === 'main' ? 1 : String(a.name).localeCompare(String(b.name))));
  }

  // ---------- elements ----------
  // Clean one incoming element. Returns null for anything that isn't a whiteboard element.
  function clean(e, me) {
    if (!e || typeof e !== 'object') return null;
    const id = String(e.id || ''); if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) return null;
    const v = Math.floor(Number(e.v)); if (!Number.isFinite(v) || v < 1 || v > 1e9) return null;
    const at = new Date().toISOString();
    if (e.del) return { id, del: true, v, by: me.id, at };
    if (!TYPES.has(e.t)) return null;
    const el = { id, t: e.t, v, by: me.id, at, z: num(e.z, -1e9, 1e12) };
    el.color = COLOR.test(e.color) ? e.color : '#F8FAFC';
    el.sw = Math.max(1, Math.min(32, num(e.sw, 1, 32) || 2));
    if (e.t === 'stroke' || e.t === 'line' || e.t === 'arrow') {
      if (!Array.isArray(e.pts) || !e.pts.length) return null;
      el.pts = e.pts.slice(0, e.t === 'stroke' ? MAX_POINTS : 2).filter(p => Array.isArray(p)).map(p => [num(p[0]), num(p[1])]);
      if (!el.pts.length || (e.t !== 'stroke' && el.pts.length < 2)) return null;
    } else {
      el.x = num(e.x); el.y = num(e.y); el.w = num(e.w, -1e6, 1e6); el.h = num(e.h, -1e6, 1e6);
    }
    if (e.t === 'rect' || e.t === 'ellipse') el.fill = COLOR.test(e.fill) ? e.fill : '';
    if (e.t === 'text' || e.t === 'sticky') { el.text = str(e.text, 4000); el.size = Math.max(8, Math.min(160, num(e.size, 8, 160) || (e.t === 'sticky' ? 18 : 22))); }
    if (e.t === 'sticky') { el.fill = COLOR.test(e.fill) ? e.fill : '#FFB86B'; if (e.agent) el.agent = true; }
    if (e.t === 'image') { el.src = /^[a-f0-9]{8,40}$/.test(String(e.src || '')) ? String(e.src) : ''; if (!el.src) return null; }
    if (e.lock) el.lock = true;
    return el;
  }
  // Apply a batch: last writer wins by version. Returns { applied, rejected } (rejected: the stored elements).
  function apply(pid, b, ops, me) {
    if (!Array.isArray(ops)) throw err(400, 'ops must be a list');
    if (ops.length > MAX_OPS) throw err(413, `at most ${MAX_OPS} changes at once`);
    const applied = [], rejected = [];
    let live = Object.values(b.elements).filter(x => !x.del).length;
    for (const raw of ops) {
      const el = clean(raw, me); if (!el) continue;
      const cur = b.elements[el.id];
      if (cur && cur.v >= el.v) { rejected.push(cur); continue; }
      if (!el.del && (!cur || cur.del)) { if (live >= MAX_ELEMENTS) throw err(409, `This board is full (${MAX_ELEMENTS} things). Start another board.`); live++; }
      if (el.del && cur && !cur.del) live--;
      if (el.del && !cur) continue;
      b.elements[el.id] = el; applied.push(el);
    }
    if (applied.length) { b.updated = new Date().toISOString(); persist(pid, b); }
    return { applied, rejected };
  }
  const nextZ = b => Math.max(0, ...Object.values(b.elements).filter(e => !e.del).map(e => Number(e.z) || 0)) + 1;
  const rid = () => crypto.randomBytes(6).toString('hex');

  // ---------- HTTP ----------
  async function route(req, res, { m, b: id, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current();
    if (!pid || !P.canSee(me, pid)) return fail(res, 404, 'project not found');
    try {
      if (!id && m === 'GET') return send(res, 200, { boards: list(pid), canEdit: canEdit(me, pid), canManage: canManage(me, pid) });
      if (!id && m === 'POST') {
        if (!canEdit(me, pid)) return fail(res, 403, 'spectators can look but not add boards');
        if (list(pid).length >= MAX_BOARDS) return fail(res, 409, `at most ${MAX_BOARDS} boards per project`);
        const body = await readBody(req, 8 * 1024);
        const nb = { id: 'b-' + rid(), name: str(body.name, 60).trim() || 'New board', created: new Date().toISOString(), updated: new Date().toISOString(), elements: {} };
        cache.set(`${pid}/${nb.id}`, nb); persist(pid, nb, true);
        broadcast({ type: 'wbd-boards', project: pid });
        return send(res, 200, { board: nb });
      }
      const brd = load(pid, id, id === 'main');
      if (!brd) return fail(res, 404, 'no such board');
      if (!c && m === 'GET') return send(res, 200, { board: brd, canEdit: canEdit(me, pid), canManage: canManage(me, pid) });
      if (!c && m === 'PATCH') {
        if (!canEdit(me, pid)) return fail(res, 403, 'spectators can look but not rename');
        const body = await readBody(req, 8 * 1024);
        const name = str(body.name, 60).trim(); if (!name) return fail(res, 400, 'give the board a name');
        brd.name = name; brd.updated = new Date().toISOString(); persist(pid, brd, true);
        broadcast({ type: 'wbd-boards', project: pid });
        return send(res, 200, { board: brd });
      }
      if (c === 'ops' && m === 'POST') {
        if (!canEdit(me, pid)) return fail(res, 403, 'spectators can look but not draw');
        const body = await readBody(req, 4 * 1024 * 1024);
        const r = apply(pid, brd, body.ops, me);
        if (r.applied.length) broadcast({ type: 'wbd', project: pid, board: brd.id, ops: r.applied, by: me.id });
        return send(res, 200, { ok: true, applied: r.applied.length, rejected: r.rejected });
      }
      if (c === 'clear' && m === 'POST') {
        if (!canManage(me, pid)) return fail(res, 403, 'only the host, admins and mods can clear the board');
        const at = new Date().toISOString();
        for (const [eid, el] of Object.entries(brd.elements)) if (!el.del) brd.elements[eid] = { id: eid, del: true, v: (el.v || 0) + 1, by: me.id, at };
        brd.updated = at; persist(pid, brd, true);
        if (perms && perms.audit) try { perms.audit(me, 'board-clear', null, { board: brd.id }); } catch {}
        broadcast({ type: 'wbd-reset', project: pid, board: brd.id, by: me.id });
        return send(res, 200, { ok: true });
      }
      if (!c && m === 'DELETE') {
        if (!canManage(me, pid)) return fail(res, 403, 'only the host, admins and mods can delete a board');
        if (brd.id === 'main') return fail(res, 400, 'the team board stays; clear it instead');
        cache.delete(`${pid}/${brd.id}`); dirty.delete(`${pid}/${brd.id}`);
        try { fs.rmSync(base.p(relOf(pid, brd.id)), { force: true }); } catch {}
        broadcast({ type: 'wbd-boards', project: pid });
        broadcast({ type: 'wbd-reset', project: pid, board: brd.id, gone: true, by: me.id });
        return send(res, 200, { ok: true });
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 405, 'not allowed');
  }

  // ---------- WebSocket ----------
  const lastCursor = new WeakMap();
  function handle(s, me, msg) {
    const pid = s.project; if (!pid || !P.canSee(me, pid)) return;
    const id = String(msg.board || '');
    if (msg.type === 'wbd-cursor' || msg.type === 'wbd-leave') {
      if (!okId(id) || me.role === 'agent') return;
      const now = Date.now(); if (msg.type === 'wbd-cursor' && now - (lastCursor.get(s) || 0) < 30) return; lastCursor.set(s, now);
      broadcast({ type: 'wbd-cursor', project: pid, board: id, by: me.id, name: nameOf(me.id), color: memberColor(me.id), x: num(msg.x), y: num(msg.y), ...(msg.type === 'wbd-leave' ? { gone: true } : {}) }, s);
      return;
    }
    if (msg.type === 'wbd-op') {
      if (!canEdit(me, pid)) return s.send({ type: 'wbd-error', board: id, error: 'Spectators can look but not draw.' });
      const brd = load(pid, id, id === 'main'); if (!brd) return s.send({ type: 'wbd-error', board: id, error: 'That board is gone.' });
      try {
        const r = apply(pid, brd, msg.ops, me);
        if (r.applied.length) broadcast({ type: 'wbd', project: pid, board: brd.id, ops: r.applied, by: me.id }, s);
        if (r.rejected.length) s.send({ type: 'wbd', project: pid, board: brd.id, ops: r.rejected, by: 'server' });
      } catch (e) { s.send({ type: 'wbd-error', board: id, error: e.message }); }
    }
  }

  // ---------- agents (MCP) ----------
  const reply = (t, isErr) => ({ content: [{ type: 'text', text: t }], ...(isErr ? { isError: true } : {}) });
  const STICKY = { amber: '#FFB86B', teal: '#38C6B1', indigo: '#8F9BFF', rose: '#FF8FA8', green: '#6EDC93', slate: '#CBD5E1' };
  function boardText(pid, b) {
    const els = Object.values(b.elements).filter(e => !e.del);
    const words = els.filter(e => (e.t === 'sticky' || e.t === 'text') && String(e.text || '').trim())
      .sort((a, c) => (Math.round(a.y / 120) - Math.round(c.y / 120)) || (a.x - c.x));
    const counts = {}; for (const e of els) counts[e.t] = (counts[e.t] || 0) + 1;
    const lines = [`Whiteboard "${b.name}" (${(P.get(pid) || {}).name || pid}), ${els.length} thing${els.length === 1 ? '' : 's'}: ${Object.entries(counts).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ') || 'empty'}.`];
    if (!words.length) lines.push('No sticky notes or text yet.');
    for (const e of words) lines.push(`- [${e.t === 'sticky' ? 'sticky' : 'text'} by ${e.agent ? nameOf(e.by) + ' (agent)' : nameOf(e.by)} at ${Math.round(e.x)},${Math.round(e.y)}] ${String(e.text).replace(/\s+/g, ' ').trim()}`);
    return lines.join('\n');
  }
  function addSticky(pid, b, text, color, me) {
    const els = Object.values(b.elements).filter(e => !e.del && e.t === 'sticky' && e.agent);
    const all = Object.values(b.elements).filter(e => !e.del);
    // agents' notes line up in a column to the right of everything else, so they never cover the humans' work
    let x0 = 0, y0 = 0;
    if (all.length) {
      const xs = all.map(e => e.pts ? Math.max(...e.pts.map(p => p[0])) : Math.max(e.x, e.x + (e.w || 0)));
      const ys = all.map(e => e.pts ? Math.min(...e.pts.map(p => p[1])) : Math.min(e.y, e.y + (e.h || 0)));
      const agentX = els.length ? Math.min(...els.map(e => e.x)) : null;
      x0 = agentX != null ? agentX : Math.max(...xs) + 60; y0 = Math.min(...ys);
    }
    const n = els.length, col = Math.floor(n / 6), row = n % 6;
    const el = { id: 'a' + rid(), t: 'sticky', v: 1, x: x0 + col * 200, y: y0 + row * 200, w: 180, h: 180, text, fill: STICKY[color] || (COLOR.test(color) ? color : STICKY.teal), color: '#12151A', size: 18, z: nextZ(b), agent: true };
    const r = apply(pid, b, [el], me);
    if (r.applied.length) broadcast({ type: 'wbd', project: pid, board: b.id, ops: r.applied, by: me.id });
    return r.applied[0];
  }
  const mcpTools = {
    whiteboard_read: {
      description: 'Read the project\'s whiteboard as text: every sticky note and text item (who wrote it, where), plus a count of drawings and shapes. Use it to join a brainstorm or pick up ideas the crew sketched. Optional `board` (default: the team board; boards lists the others).',
      inputSchema: { type: 'object', properties: { board: { type: 'string', description: 'Board id (default "main")' } }, additionalProperties: false },
      run: ({ board } = {}, me) => {
        const pid = P.current() || P.defaultId();
        const b = load(pid, String(board || 'main'), !board || board === 'main');
        if (!b) return reply(`No board "${board}". Boards: ${list(pid).map(x => `${x.id} (${x.name})`).join(', ')}`, true);
        const others = list(pid).filter(x => x.id !== b.id);
        return reply(boardText(pid, b) + (others.length ? `\nOther boards: ${others.map(x => `${x.id} (${x.name})`).join(', ')}` : ''));
      },
    },
    whiteboard_add_sticky: {
      description: 'Add a sticky note to the project\'s whiteboard, so you can join a brainstorm next to the humans. Keep it short (one idea per note). Your notes line up in a column beside the crew\'s work. Optional `color`: amber, teal, indigo, rose, green or slate.',
      inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'The note, one short idea' }, color: { type: 'string', enum: Object.keys(STICKY) }, board: { type: 'string', description: 'Board id (default "main")' } }, required: ['text'], additionalProperties: false },
      run: ({ text, color, board } = {}, me) => {
        const pid = P.current() || P.defaultId();
        if (!canEdit(me, pid)) return reply('Your owner is a spectator here, so you can read the board but not add to it.', true);
        const t = str(text, 600).trim(); if (!t) return reply('Give the note some text.', true);
        const b = load(pid, String(board || 'main'), !board || board === 'main'); if (!b) return reply(`No board "${board}".`, true);
        try { const el = addSticky(pid, b, t, color, me); return reply(el ? `Added a sticky note to "${b.name}" at ${Math.round(el.x)},${Math.round(el.y)}.` : 'Nothing added.'); }
        catch (e) { return reply(e.message, true); }
      },
    },
  };

  return { route, handle, mcpTools, flush, list, load, canEdit, canManage };
};
