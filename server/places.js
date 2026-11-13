// Where everyone is (feat/presence): each client reports the place it is in (a doc, the website designer, a chat
// channel, a task, the preview, a design canvas…) as one small frame when its route settles. The server keeps it in
// memory, fans it out to the people who can see that person, and drops it when they leave or go idle.
//   client -> { type:'place', p:{ k, id, l, pr } }   k = kind, id = what is open, l = a short label, pr = the project
//   server -> { type:'place', by, p|null, st?, seen? }  one person at a time (well under 512 bytes)
// Privacy: "Show where I am" (on by default) and "Appear away" (prefs, kept per member). Others only see a place they
// could open themselves (same project, a channel they can read); a DM is always just "in messages", never who with.
// GET  /api/places          -> { places: { mid: place }, seen: { mid: iso }, away: [mid], prefs }  (what you may see)
// PUT  /api/places/prefs    { show?, away? } -> { prefs }
'use strict';

const KINDS = new Set(['doc', 'site', 'chat', 'dm', 'task', 'preview', 'canvas', 'files', 'board', 'home', 'view', 'agent']);
const IDLE_MS = 20 * 60_000;   // a place nobody has touched for this long, with every tab idle, expires

module.exports = function makePlaces({ P, store, getMembers, online, idleAll, canSeeChannel, visible, agentPlace }) {
  const FILE = '.tribe/places.json';
  const db = store.readJSON(FILE, null) || {};
  db.prefs = db.prefs || {}; db.seen = db.seen || {};
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { store.writeJSON(FILE, db); } catch {} }, 1000); if (saveT.unref) saveT.unref(); };
  const places = new Map();   // mid -> { k, id, l, pr, at }
  const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');
  const prefs = mid => ({ show: (db.prefs[mid] || {}).show !== false, away: !!(db.prefs[mid] || {}).away });
  const member = mid => getMembers().find(m => m.id === mid);

  // what the client sent -> a clean place (or null). A DM never keeps who it is with.
  function clean(me, raw) {
    if (!raw || typeof raw !== 'object') return null;
    const k = str(raw.k, 12); if (!KINDS.has(k)) return null;
    if (k === 'dm') return { k: 'dm', id: '', l: 'messages', pr: '' };
    const pr = str(raw.pr, 64);
    if (pr && !P.canSee(me, pr)) return null;
    return { k, id: str(raw.id, 80), l: str(raw.l, 60) || k, pr };
  }
  // what one viewer may see of mid's place
  function viewOf(mid, viewer, pl) {
    if (!pl) return null;
    if (viewer && viewer.id === mid) return { k: pl.k, id: pl.id, l: pl.l, pr: pl.pr };
    const pf = prefs(mid); if (!pf.show || pf.away) return null;
    if (pl.k === 'dm') return { k: 'dm', id: '', l: 'messages', pr: '' };
    if (pl.pr && viewer && !P.canSee(viewer, pl.pr)) return null;
    if (pl.k === 'chat' && pl.id && viewer && !canSeeChannel(viewer, pl.id)) return { k: 'chat', id: '', l: 'chat', pr: pl.pr };
    return { k: pl.k, id: pl.id, l: pl.l, pr: pl.pr };
  }
  const placeOf = mid => { const m = member(mid); if (m && m.role === 'agent') return agentPlace(mid); return places.get(mid) || null; };
  function frame(mid, viewer, gone) {
    const f = { type: 'place', by: mid, p: viewOf(mid, viewer, placeOf(mid)) };
    if (prefs(mid).away && viewer && viewer.id !== mid) f.st = 'away';
    if (gone) f.seen = db.seen[mid] || null;
    return f;
  }
  // one small frame to everyone who can see mid (each viewer gets their own cut)
  function fan(mid, gone) {
    for (const [vid, o] of online) {
      const viewer = member(vid); if (!viewer || (vid !== mid && !visible(viewer, mid))) continue;
      const f = frame(mid, viewer, gone);
      for (const s of o.sockets) s.send(f);
    }
  }
  const sig = p => (p ? [p.k, p.id, p.l, p.pr].join('|') : '');

  // a socket reported where it is now
  function set(me, s, raw) {
    if (me.role === 'agent') return;
    const p = clean(me, raw), prev = places.get(me.id);
    s.place = p;
    if (!p) { if (prev) { places.delete(me.id); fan(me.id); } return; }
    if (prev && sig(prev) === sig(p)) { prev.at = Date.now(); return; }   // nothing new: no frame
    places.set(me.id, { ...p, at: Date.now() });
    fan(me.id);
  }
  // a socket closed: the last one takes the place with it and stamps "last seen"
  function closed(me, s) {
    if (me.role === 'agent') return;
    const o = online.get(me.id);
    if (o && o.sockets.size) {   // another tab is still open: it keeps its own place
      const other = [...o.sockets].reverse().find(x => x.place);
      const cur = places.get(me.id);
      if (other && sig(other.place) !== sig(cur)) { places.set(me.id, { ...other.place, at: Date.now() }); fan(me.id); }
      return;
    }
    places.delete(me.id); db.seen[me.id] = new Date().toISOString(); save();
    fan(me.id, true);
  }
  function setPrefs(me, body) {
    const cur = { ...(db.prefs[me.id] || {}) };
    if (typeof body.show === 'boolean') cur.show = body.show;
    if (typeof body.away === 'boolean') cur.away = body.away;
    db.prefs[me.id] = cur; save(); fan(me.id);
    return prefs(me.id);
  }
  function snapshot(viewer) {
    const out = { places: {}, seen: {}, away: [], prefs: prefs(viewer.id) };
    for (const m of getMembers()) {
      if (m.id !== viewer.id && !visible(viewer, m.id)) continue;
      const v = viewOf(m.id, viewer, placeOf(m.id)); if (v) out.places[m.id] = v;
      if (db.seen[m.id]) out.seen[m.id] = db.seen[m.id];
      if (m.id !== viewer.id && prefs(m.id).away && online.has(m.id)) out.away.push(m.id);
    }
    return out;
  }
  // the old free-text `where` follows the same privacy rules
  function scrub(list, viewer) {
    return list.map(e => {
      if (!viewer || e.id === viewer.id || e.role === 'agent') return e;
      const pf = prefs(e.id); if (pf.show && !pf.away) return e;
      return { ...e, where: null, ...(pf.away && e.online ? { state: 'idle' } : {}) };
    });
  }
  // idle tabs let go of their place after a while
  setInterval(() => {
    const now = Date.now();
    for (const [mid, p] of places) if (now - p.at > IDLE_MS && idleAll(mid)) { places.delete(mid); fan(mid); }
  }, 60_000).unref();

  async function route(req, res, { me, send, fail, readBody, b, m }) {
    if (!b && m === 'GET') return send(res, 200, snapshot(me));
    if (b === 'prefs' && m === 'PUT') { if (me.role === 'agent') return fail(res, 403, 'agents always show their task'); return send(res, 200, { prefs: setPrefs(me, (await readBody(req)) || {}) }); }
    return fail(res, 404, 'not found');
  }
  return { set, closed, snapshot, scrub, route, agentMoved: mid => fan(mid), prefs, KINDS };
};
