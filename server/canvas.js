// Design canvas (P1-A, docs/EDITOR-PARITY.md): a Figma-class design file per project. Frames, shapes, text, groups,
// components and instances, with auto layout that is plain CSS flex underneath (app/ui/canvas/*). The same sync pattern
// as the whiteboard (server/whiteboard.js): every node carries a version `v`, a change wins when its v is higher than
// the stored one, otherwise the sender gets the stored node back. Deletes are tombstones, dropped after a day.
//
// A file is { id, name, created, updated, nodes: { [id]: node } }, saved in the project's folder at
// .tribe/canvas/<id>.json (projects other than the first under projects/<pid>/.tribe/canvas/). 'main' is made on first open.
// A node: { id, t: frame|rect|ellipse|text|group|component|instance, v, p (parent id or ''), i (order), x, y, w, h,
//           rot, fill, stroke, sw, r (radius), op (opacity), name, lock, hide, clip,
//           tx { c, f, s, wt, lh, al, col }   text
//           lay { d: row|col, g, p: [t, r, b, l], ai, jc, wr }   auto layout (frames, components)
//           sz { h, v: fixed|hug|fill }   sizing inside auto layout / hugging contents
//           comp, ov { [sourceId|'self']: { c, fill, hide } }   instances }
//
//   GET    /api/canvas                -> { files: [{ id, name, updated, count }], canEdit }
//   POST   /api/canvas {name}         -> { file }
//   GET    /api/canvas/:id            -> { file, canEdit }
//   PATCH  /api/canvas/:id {name}     -> { file }
//   POST   /api/canvas/:id/ops {ops}  -> { ok, applied, rejected }    the same changes the socket carries (agents, tests)
//   DELETE /api/canvas/:id            -> { ok }                       host, admins and mods; 'main' stays
// WebSocket: { type: 'cnv-op', file, ops } -> others get { type: 'cnv', project, file, ops, by }
//            { type: 'cnv-cursor', file, x, y } / { type: 'cnv-leave', file } -> others get { type: 'cnv-cursor', ... }
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TYPES = new Set(['frame', 'rect', 'ellipse', 'text', 'group', 'component', 'instance']);
const CONTAINERS = new Set(['frame', 'group', 'component']);
const MAX_NODES = 5000;
const MAX_OPS = 1000;
const MAX_FILES = 20;
const TOMB_MS = 24 * 3600_000;
const COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const SIZING = new Set(['fixed', 'hug', 'fill']);
const ALIGN = new Set(['start', 'center', 'end', 'stretch']);
const JUSTIFY = new Set(['start', 'center', 'end', 'between']);
const TALIGN = new Set(['left', 'center', 'right']);
const FONTS = new Set(['Inter', 'Inter Display', 'JetBrains Mono', 'Georgia', 'system-ui']);
const num = (v, lo = -1e7, hi = 1e7) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 100) / 100)) : 0; };
const okNodeId = id => /^[A-Za-z0-9_-]{4,40}$/.test(String(id || ''));

module.exports = function canvas({ P, base, broadcast, perms, nameOf, memberColor = () => '#F26B1D' }) {
  const cache = new Map();   // `${pid}/${id}` -> file
  const dirty = new Set();
  let timer = null;
  const err = (status, m) => Object.assign(new Error(m), { status });
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);

  // ---------- who may do what (the same as the whiteboard) ----------
  const projRole = (me, pid) => ((P.get(pid) || {}).members || {})[me.id];
  const canEdit = (me, pid) => !!me && me.role !== 'spectator' && projRole(me, pid) !== 'spectator' && (perms ? perms.atLeast(me, 'builder', pid) : me.role !== 'agent');
  const canManage = (me, pid) => !!me && me.role !== 'agent' && (me.role === 'host' || (perms ? perms.can(me, 'board.manage', pid) : false));

  // ---------- storage ----------
  const relOf = (pid, id) => (pid === P.defaultId() ? '' : `projects/${pid}/`) + `.tribe/canvas/${id}.json`;
  const dirOf = pid => path.dirname(base.p(relOf(pid, 'x')));
  const okId = id => /^[a-z0-9][a-z0-9-]{0,39}$/.test(String(id || ''));
  function load(pid, id, make = false) {
    if (!okId(id)) return null;
    const k = `${pid}/${id}`;
    if (cache.has(k)) return cache.get(k);
    let f = base.readJSON(relOf(pid, id), null);
    if (!f || typeof f !== 'object' || !f.nodes || typeof f.nodes !== 'object') {
      if (!make) return null;
      f = { id, name: id === 'main' ? 'Design' : id, created: new Date().toISOString(), updated: new Date().toISOString(), nodes: {} };
      cache.set(k, f); persist(pid, f, true);
      return f;
    }
    f.id = id; cache.set(k, f); return f;
  }
  function persist(pid, f, now) {
    dirty.add(`${pid}/${f.id}`);
    if (now) return flush();
    clearTimeout(timer); timer = setTimeout(flush, 500); if (timer.unref) timer.unref();
  }
  function flush() {
    clearTimeout(timer); timer = null;
    for (const k of [...dirty]) {
      dirty.delete(k);
      const f = cache.get(k); if (!f) continue;
      const pid = k.slice(0, k.lastIndexOf('/'));
      try {
        fs.mkdirSync(dirOf(pid), { recursive: true });
        const cut = Date.now() - TOMB_MS;
        for (const [nid, n] of Object.entries(f.nodes)) if (n.del && Date.parse(n.at || 0) < cut) delete f.nodes[nid];
        base.writeJSON(relOf(pid, f.id), f);
      } catch (e) { console.error('  canvas: could not save ' + k + ': ' + e.message); }
    }
  }
  process.on('exit', () => { try { flush(); } catch {} });
  function list(pid) {
    const out = [];
    const main = load(pid, 'main', true);
    let files = []; try { files = fs.readdirSync(dirOf(pid)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(okId); } catch {}
    for (const id of new Set(['main', ...files])) {
      const f = id === 'main' ? main : load(pid, id); if (!f) continue;
      out.push({ id: f.id, name: f.name, updated: f.updated, count: Object.values(f.nodes).filter(n => !n.del).length });
    }
    return out.sort((a, b) => (a.id === 'main' ? -1 : b.id === 'main' ? 1 : String(a.name).localeCompare(String(b.name))));
  }

  // ---------- nodes ----------
  function clean(e, me) {
    if (!e || typeof e !== 'object') return null;
    const id = String(e.id || ''); if (!okNodeId(id)) return null;
    const v = Math.floor(Number(e.v)); if (!Number.isFinite(v) || v < 1 || v > 1e9) return null;
    const at = new Date().toISOString();
    if (e.del) return { id, del: true, v, by: me.id, at };
    if (!TYPES.has(e.t)) return null;
    const n = { id, t: e.t, v, by: me.id, at };
    n.p = okNodeId(e.p) && e.p !== id ? String(e.p) : '';
    n.i = num(e.i, -1e12, 1e12);
    n.x = num(e.x); n.y = num(e.y); n.w = Math.max(0, num(e.w, 0, 1e6)); n.h = Math.max(0, num(e.h, 0, 1e6));
    if (e.rot) n.rot = num(e.rot, -360, 360);
    n.name = str(e.name, 80);
    if (COLOR.test(e.fill)) n.fill = e.fill;
    if (COLOR.test(e.stroke)) { n.stroke = e.stroke; n.sw = Math.max(0, Math.min(64, num(e.sw, 0, 64))); }
    if (e.r) n.r = Math.max(0, Math.min(9999, num(e.r, 0, 9999)));
    if (e.op != null && e.op !== 1) n.op = Math.max(0, Math.min(1, num(e.op, 0, 1)));
    if (e.lock) n.lock = true;
    if (e.hide) n.hide = true;
    if (CONTAINERS.has(e.t) || e.t === 'instance') { if (e.clip) n.clip = true; }
    if (e.t === 'text' && e.tx && typeof e.tx === 'object') {
      const t = e.tx;
      n.tx = { c: str(t.c, 5000), f: FONTS.has(t.f) ? t.f : 'Inter', s: Math.max(4, Math.min(400, num(t.s, 4, 400) || 16)),
        wt: Math.max(100, Math.min(900, Math.round(num(t.wt, 100, 900) / 100) * 100 || 400)), lh: Math.max(0.5, Math.min(4, num(t.lh, 0.5, 4) || 1.3)),
        al: TALIGN.has(t.al) ? t.al : 'left', col: COLOR.test(t.col) ? t.col : '#12151A' };
    } else if (e.t === 'text') n.tx = { c: '', f: 'Inter', s: 16, wt: 400, lh: 1.3, al: 'left', col: '#12151A' };
    if ((e.t === 'frame' || e.t === 'component') && e.lay && typeof e.lay === 'object') {
      const l = e.lay, pad = Array.isArray(l.p) ? l.p : [l.p, l.p, l.p, l.p];
      n.lay = { d: l.d === 'row' ? 'row' : 'col', g: Math.max(-999, Math.min(999, num(l.g, -999, 999))), p: [0, 1, 2, 3].map(k => Math.max(0, Math.min(999, num(pad[k], 0, 999)))),
        ai: ALIGN.has(l.ai) ? l.ai : 'start', jc: JUSTIFY.has(l.jc) ? l.jc : 'start' };
      if (l.wr) n.lay.wr = true;
    }
    if (e.sz && typeof e.sz === 'object') {
      const h = SIZING.has(e.sz.h) ? e.sz.h : 'fixed', vv = SIZING.has(e.sz.v) ? e.sz.v : 'fixed';
      if (h !== 'fixed' || vv !== 'fixed') n.sz = { h, v: vv };
    }
    if (e.t === 'instance') {
      if (!okNodeId(e.comp)) return null;
      n.comp = String(e.comp);
      if (e.ov && typeof e.ov === 'object') {
        const ov = {};
        for (const [k, o] of Object.entries(e.ov).slice(0, 300)) {
          if ((k !== 'self' && !okNodeId(k)) || !o || typeof o !== 'object') continue;
          const c = {};
          if (o.c != null) c.c = str(o.c, 5000);
          if (COLOR.test(o.fill)) c.fill = o.fill;
          if (o.hide != null) c.hide = !!o.hide;
          if (Object.keys(c).length) ov[k] = c;
        }
        if (Object.keys(ov).length) n.ov = ov;
      }
    }
    return n;
  }
  function apply(pid, f, ops, me) {
    if (!Array.isArray(ops)) throw err(400, 'ops must be a list');
    if (ops.length > MAX_OPS) throw err(413, `at most ${MAX_OPS} changes at once`);
    const applied = [], rejected = [];
    let live = Object.values(f.nodes).filter(x => !x.del).length;
    for (const raw of ops) {
      const n = clean(raw, me); if (!n) continue;
      const cur = f.nodes[n.id];
      if (cur && cur.v >= n.v) { rejected.push(cur); continue; }
      if (!n.del && (!cur || cur.del)) { if (live >= MAX_NODES) throw err(409, `This design is full (${MAX_NODES} layers). Start another file.`); live++; }
      if (n.del && cur && !cur.del) live--;
      if (n.del && !cur) continue;
      f.nodes[n.id] = n; applied.push(n);
    }
    if (applied.length) { f.updated = new Date().toISOString(); persist(pid, f); }
    return { applied, rejected };
  }
  const rid = () => crypto.randomBytes(6).toString('hex');

  // ---------- HTTP ----------
  async function route(req, res, { m, b: id, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current();
    if (!pid || !P.canSee(me, pid)) return fail(res, 404, 'project not found');
    try {
      if (!id && m === 'GET') return send(res, 200, { files: list(pid), canEdit: canEdit(me, pid), canManage: canManage(me, pid) });
      if (!id && m === 'POST') {
        if (!canEdit(me, pid)) return fail(res, 403, 'spectators can look but not add files');
        if (list(pid).length >= MAX_FILES) return fail(res, 409, `at most ${MAX_FILES} design files per project`);
        const body = await readBody(req, 8 * 1024);
        const nf = { id: 'c-' + rid(), name: str(body.name, 60).trim() || 'Untitled', created: new Date().toISOString(), updated: new Date().toISOString(), nodes: {} };
        cache.set(`${pid}/${nf.id}`, nf); persist(pid, nf, true);
        broadcast({ type: 'cnv-files', project: pid });
        return send(res, 200, { file: nf });
      }
      const file = load(pid, id, id === 'main');
      if (!file) return fail(res, 404, 'no such design file');
      if (!c && m === 'GET') return send(res, 200, { file, canEdit: canEdit(me, pid), canManage: canManage(me, pid) });
      if (!c && m === 'PATCH') {
        if (!canEdit(me, pid)) return fail(res, 403, 'spectators can look but not rename');
        const body = await readBody(req, 8 * 1024);
        const name = str(body.name, 60).trim(); if (!name) return fail(res, 400, 'give the file a name');
        file.name = name; file.updated = new Date().toISOString(); persist(pid, file, true);
        broadcast({ type: 'cnv-files', project: pid });
        return send(res, 200, { file });
      }
      if (c === 'ops' && m === 'POST') {
        if (!canEdit(me, pid)) return fail(res, 403, 'spectators can look but not edit');
        const body = await readBody(req, 4 * 1024 * 1024);
        const r = apply(pid, file, body.ops, me);
        if (r.applied.length) broadcast({ type: 'cnv', project: pid, file: file.id, ops: r.applied, by: me.id });
        return send(res, 200, { ok: true, applied: r.applied.length, rejected: r.rejected });
      }
      if (!c && m === 'DELETE') {
        if (!canManage(me, pid)) return fail(res, 403, 'only the host, admins and mods can delete a design file');
        if (file.id === 'main') return fail(res, 400, 'the main design file stays');
        cache.delete(`${pid}/${file.id}`); dirty.delete(`${pid}/${file.id}`);
        try { fs.rmSync(base.p(relOf(pid, file.id)), { force: true }); } catch {}
        broadcast({ type: 'cnv-files', project: pid });
        return send(res, 200, { ok: true });
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 405, 'not allowed');
  }

  // ---------- WebSocket ----------
  const lastCursor = new WeakMap();
  function handle(s, me, msg) {
    const pid = s.project; if (!pid || !P.canSee(me, pid)) return;
    const id = String(msg.file || '');
    if (msg.type === 'cnv-cursor' || msg.type === 'cnv-leave') {
      if (!okId(id) || me.role === 'agent') return;
      const now = Date.now(); if (msg.type === 'cnv-cursor' && now - (lastCursor.get(s) || 0) < 30) return; lastCursor.set(s, now);
      broadcast({ type: 'cnv-cursor', project: pid, file: id, by: me.id, name: nameOf(me.id), color: memberColor(me.id), x: num(msg.x), y: num(msg.y), ...(msg.type === 'cnv-leave' ? { gone: true } : {}) }, s);
      return;
    }
    if (msg.type === 'cnv-op') {
      if (!canEdit(me, pid)) return s.send({ type: 'cnv-error', file: id, error: 'Spectators can look but not edit.' });
      const file = load(pid, id, id === 'main'); if (!file) return s.send({ type: 'cnv-error', file: id, error: 'That design file is gone.' });
      try {
        const r = apply(pid, file, msg.ops, me);
        if (r.applied.length) broadcast({ type: 'cnv', project: pid, file: file.id, ops: r.applied, by: me.id }, s);
        if (r.rejected.length) s.send({ type: 'cnv', project: pid, file: file.id, ops: r.rejected, by: 'server' });
      } catch (e) { s.send({ type: 'cnv-error', file: id, error: e.message }); }
    }
  }

  return { route, handle, flush, list, load, canEdit, canManage };
};
