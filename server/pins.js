// Comment pins (P1-E, docs/EDITOR-PARITY.md): drop a comment on a spot of the live preview (later the design canvas and
// docs too), talk it through in a thread, @mention people, resolve it. Like comments in Figma, inside the friends' app.
//
// A pin is { id, surface, target, by, at, resolved, resolvedBy, resolvedAt, thread: [{ id, by, at, text }] }.
//   surface  'preview' | 'canvas' | 'doc'
//   target   where it sits. preview: { href, sel, ox, oy, fx, fy, tag, text } — a CSS path to the element, the offset inside
//            it as fractions (so it follows the element when the layout moves), and page fractions as the fallback when
//            the element is gone. canvas/doc: whatever that surface's anchor provider gives (kept as plain small JSON).
// Stored per project in .tribe/pins.json (projects/<pid>/.tribe/pins.json for the others).
//
//   GET    /api/pins?surface=&href=&state=open|resolved|all  -> { pins, canEdit, me }
//   POST   /api/pins            { surface, target, text }   -> { pin }       a new pin with its first comment
//   POST   /api/pins/:id/reply  { text }                    -> { pin }
//   POST   /api/pins/:id/resolve { resolved: true|false }   -> { pin }
//   DELETE /api/pins/:id                                    -> { ok }        the author, the host, admins and mods
// Live: every change goes out as { type: 'pins', project, pin } or { type: 'pins', project, removed }.
// Presence for the preview (who's looking, follow a friend): the socket message
//   { type: 'pin-view', open, href, fy }  -> others in the project get { type: 'pin-view', by, name, color, open, href, fy }
// Notifications: @mentions -> 'mention'; a reply -> 'comment-reply' to everyone else in the thread. Both open the pin.
'use strict';
const crypto = require('node:crypto');
const { mentionsIn } = require('./notify');

const SURFACES = new Set(['preview', 'canvas', 'doc']);
const MAX_PINS = 1000;
const MAX_THREAD = 200;

module.exports = function pins({ P, base, broadcast, bus, getMembers, perms, nameOf, memberColor = () => '#F26B1D' }) {
  const cache = new Map();   // pid -> { pins: [] }
  const err = (status, m) => Object.assign(new Error(m), { status });
  const rid = () => crypto.randomBytes(6).toString('base64url');
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
  const frac = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(-0.5, Math.min(1.5, Math.round(n * 10000) / 10000)) : 0; };
  const relOf = pid => (pid === P.defaultId() ? '' : `projects/${pid}/`) + '.tribe/pins.json';
  function db(pid) {
    if (cache.has(pid)) return cache.get(pid);
    const d = base.readJSON(relOf(pid), { pins: [] });
    if (!Array.isArray(d.pins)) d.pins = [];
    cache.set(pid, d); return d;
  }
  const save = pid => base.writeJSON(relOf(pid), db(pid));

  // ---------- who may do what ----------
  const projRole = (me, pid) => ((P.get(pid) || {}).members || {})[me.id];
  const canEdit = (me, pid) => !!me && me.role !== 'spectator' && projRole(me, pid) !== 'spectator';   // agents comment for their owner
  const canModerate = (me, pid) => !!me && (me.role === 'host' || me.role === 'admin' || (perms && perms.can ? perms.can(me, 'board.manage', pid) : false));

  function cleanTarget(surface, t) {
    t = t && typeof t === 'object' ? t : {};
    if (surface === 'preview') {
      return { href: str(t.href, 300), sel: str(t.sel, 600), ox: frac(t.ox), oy: frac(t.oy), fx: frac(t.fx), fy: frac(t.fy), tag: str(t.tag, 20), text: str(t.text, 80) };
    }
    const s = JSON.stringify(t);   // canvas/doc anchors: small plain JSON from the surface's own provider
    if (s.length > 1200) throw err(400, 'that anchor is too big');
    return JSON.parse(s);
  }
  const view = (p) => ({ ...p, byName: nameOf(p.by), color: memberColor(p.by), thread: p.thread.map(c => ({ ...c, byName: nameOf(c.by), color: memberColor(c.by) })) });
  const push = (pid, p) => broadcast({ type: 'pins', project: pid, pin: view(p) });
  const find = (pid, id) => { const p = db(pid).pins.find(x => x.id === id); if (!p) throw err(404, 'that comment is gone'); return p; };

  function notifyFor(pid, p, c, me, isNew) {
    if (!bus || !bus.notify) return;
    const who = nameOf(me.id), proj = (P.get(pid) || {}).name || 'the project';
    const where = p.surface === 'preview' ? 'the preview' : p.surface === 'canvas' ? 'the canvas' : 'a doc';
    const ref = `${pid}:${p.id}`;
    const mentioned = mentionsIn(c.text, getMembers(), me.id);
    if (mentioned.length) bus.notify({ type: 'mention', priority: 'high', to: mentioned, from: me.id, title: `${who} mentioned you in a comment on ${where}`, body: c.text.slice(0, 300), view: 'pins', ref });
    if (isNew) return;
    const others = [...new Set(p.thread.map(x => x.by).concat(p.by))].filter(id => id !== me.id && !mentioned.includes(id));
    if (others.length) bus.notify({ type: 'comment-reply', priority: 'normal', to: others, from: me.id, title: `${who} replied to a comment in ${proj}`, body: c.text.slice(0, 300), view: 'pins', ref });
  }

  // ---------- actions (REST, MCP and tests share these) ----------
  function list(pid, { surface, href, state } = {}) {
    let out = db(pid).pins;
    if (surface) out = out.filter(p => p.surface === surface);
    if (href) out = out.filter(p => !p.target || !p.target.href || p.target.href === href);
    if (state === 'open') out = out.filter(p => !p.resolved);
    if (state === 'resolved') out = out.filter(p => p.resolved);
    return out.map(view);
  }
  function add(pid, me, body) {
    if (!canEdit(me, pid)) throw err(403, 'spectators can look but not comment');
    const surface = SURFACES.has(body.surface) ? body.surface : 'preview';
    const text = str(body.text, 2000).trim(); if (!text) throw err(400, 'write a comment first');
    const d = db(pid);
    if (d.pins.length >= MAX_PINS) d.pins = d.pins.filter(p => !p.resolved).slice(-(MAX_PINS - 1));
    const at = new Date().toISOString();
    const c = { id: 'c-' + rid(), by: me.id, at, text };
    const p = { id: 'p-' + rid(), surface, target: cleanTarget(surface, body.target), by: me.id, at, resolved: false, thread: [c] };
    d.pins.push(p); save(pid); push(pid, p);
    notifyFor(pid, p, c, me, true);
    return view(p);
  }
  function reply(pid, me, id, body) {
    if (!canEdit(me, pid)) throw err(403, 'spectators can look but not comment');
    const p = find(pid, id);
    const text = str(body.text, 2000).trim(); if (!text) throw err(400, 'write a reply first');
    if (p.thread.length >= MAX_THREAD) throw err(409, 'this thread is full; start a new comment');
    const c = { id: 'c-' + rid(), by: me.id, at: new Date().toISOString(), text };
    p.thread.push(c);
    if (p.resolved && body.reopen !== false) { p.resolved = false; delete p.resolvedBy; delete p.resolvedAt; }
    save(pid); push(pid, p);
    notifyFor(pid, p, c, me, false);
    return view(p);
  }
  function resolve(pid, me, id, on = true) {
    if (!canEdit(me, pid)) throw err(403, 'spectators can look but not resolve');
    const p = find(pid, id);
    p.resolved = !!on;
    if (on) { p.resolvedBy = me.id; p.resolvedAt = new Date().toISOString(); } else { delete p.resolvedBy; delete p.resolvedAt; }
    save(pid); push(pid, p);
    return view(p);
  }
  function remove(pid, me, id) {
    const p = find(pid, id);
    if (p.by !== me.id && !canModerate(me, pid)) throw err(403, 'only the person who made it (or the host) can delete a comment');
    const d = db(pid); d.pins = d.pins.filter(x => x.id !== id); save(pid);
    broadcast({ type: 'pins', project: pid, removed: id });
    return { ok: true };
  }

  async function route(req, res, { m, b: id, c, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current();
    if (!pid || !P.canSee(me, pid)) return fail(res, 404, 'project not found');
    try {
      if (!id && m === 'GET') {
        const q = url ? url.searchParams : new URLSearchParams();
        return send(res, 200, { pins: list(pid, { surface: q.get('surface') || '', href: q.get('href') || '', state: q.get('state') || 'all' }), canEdit: canEdit(me, pid), me: me.id });
      }
      if (!id && m === 'POST') return send(res, 200, { pin: add(pid, me, await readBody(req, 16 * 1024)) });
      if (id && c === 'reply' && m === 'POST') return send(res, 200, { pin: reply(pid, me, id, await readBody(req, 16 * 1024)) });
      if (id && c === 'resolve' && m === 'POST') { const body = await readBody(req, 1024).catch(() => ({})); return send(res, 200, { pin: resolve(pid, me, id, body.resolved !== false) }); }
      if (id && !c && m === 'DELETE') return send(res, 200, remove(pid, me, id));
      if (id && !c && m === 'GET') return send(res, 200, { pin: view(find(pid, id)) });
      return fail(res, 404, 'no such pins route');
    } catch (e) { return fail(res, e.status || 400, e.message); }
  }

  // ---------- presence on the preview: who's looking, and where (follow a friend) ----------
  const lastView = new WeakMap();
  function handle(s, me, msg) {
    if (msg.type !== 'pin-view' || !me || me.role === 'agent') return;
    const pid = s.project; if (!pid || !P.canSee(me, pid)) return;
    const now = Date.now(); if (msg.open && now - (lastView.get(s) || 0) < 100) return; lastView.set(s, now);
    broadcast({ type: 'pin-view', project: pid, by: me.id, name: nameOf(me.id), color: memberColor(me.id), open: !!msg.open, href: str(msg.href, 300), fy: frac(msg.fy) }, s);
  }

  // ---------- MCP: members' Claude Code reads and answers feedback ----------
  const say = (t, isErr) => ({ content: [{ type: 'text', text: t }], ...(isErr ? { isError: true } : {}) });
  const cur = () => P.current() || P.defaultId();
  const line = p => {
    const t = p.target || {};
    const where = p.surface === 'preview' ? `preview ${t.href ? t.href.replace(/^\/preview\/[^/]+\/[^/]+\//, '/') : '/'}${t.tag ? ` on <${t.tag}>${t.text ? ` "${t.text}"` : ''}` : ''}${t.sel ? ` (${t.sel})` : ''}` : p.surface;
    return `${p.id} [${p.resolved ? 'resolved' : 'open'}] ${where}\n` + p.thread.map(c => `  - ${nameOf(c.by)}: ${c.text}`).join('\n');
  };
  const mcpTools = {
    list_pins: {
      description: 'List the comment pins people dropped on the live preview (and canvas/docs) of the current project: where each one sits (page, element, CSS path) and its thread. Use it to pick up design feedback and fix it. Optional `state`: open (default), resolved or all.',
      inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['open', 'resolved', 'all'] } }, additionalProperties: false },
      run: ({ state } = {}) => { const ps = list(cur(), { state: state || 'open' }); return say(ps.length ? ps.map(line).join('\n\n') : `No ${state || 'open'} comments.`); },
    },
    add_pin_reply: {
      description: 'Reply in a comment pin\'s thread (for example "Fixed: the button is orange now"). Everyone in the thread is notified. Needs `id` from list_pins and `text`.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'], additionalProperties: false },
      run: ({ id, text } = {}, me) => { try { const p = reply(cur(), me, String(id || ''), { text, reopen: false }); return say(`Replied on ${p.id}.`); } catch (e) { return say(e.message, true); } },
    },
    resolve_pin: {
      description: 'Mark a comment pin resolved once the feedback is handled (or `resolved: false` to reopen it). Needs `id` from list_pins.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, resolved: { type: 'boolean' } }, required: ['id'], additionalProperties: false },
      run: ({ id, resolved } = {}, me) => { try { const p = resolve(cur(), me, String(id || ''), resolved !== false); return say(`${p.id} is ${p.resolved ? 'resolved' : 'open again'}.`); } catch (e) { return say(e.message, true); } },
    },
  };

  return { route, handle, mcpTools, list, add, reply, resolve, remove };
};
