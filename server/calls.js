// Calls around the huddle (server/index.js keeps the roster and relays WebRTC signaling): everything else a
// call needs that isn't audio/video itself. All of it is small JSON over the tribe WebSocket.
//   call-react   { emoji }                  floating reactions, to everyone in the call
//   call-pointer { x, y, kind, to?, pts? }  laser / pen strokes on someone's shared screen (0..1 coordinates)
//   call-chat    { text }                   in-call chat (kept with the call, shown in history)
//   call-poll    { q, options } | { poll, vote }   a quick poll inside the call
//   call-rec     { on }                     someone started/stopped recording: everyone is told, chat gets a line
//   call-present { on }                     "follow me": present TribeCode itself (no screen capture needed)
//   call-ring    { to }                     ring a teammate; unanswered after 30 s = a missed-huddle notification
//   call-lock    { on }  call-admit { id }  a lobby: when locked, newcomers knock and someone in the call lets them in
// HTTP:
//   GET  /api/calls/ice        -> { iceServers, lanOnly }  what peers use to connect (TURN for phones on cellular)
//   GET  /api/calls/config     PUT (host): { lanOnly, stun: [url], turn: [{ urls, username, credential }] }
//   GET  /api/calls/history    -> { calls: [{ id, project, started, ended, people, chat, recordings, polls }] }
'use strict';

const DEFAULT_STUN = ['stun:stun.l.google.com:19302'];
const EMOJI = new Set(['👍', '👏', '🎉', '😂', '❤️', '🔥', '🙌', '🤔', '✋', '👀', '🚀', '✅']);

module.exports = function calls({ store, id, str, huddle, sendTo, broadcast, postChat, bus, nameOf, getProject, canSee }) {
  const CFG = '.tribe/calls.json';
  const HIST = 'calls/history.jsonl';
  try { require('node:fs').mkdirSync(store.p('calls'), { recursive: true }); } catch {}
  let cfg = { lanOnly: false, stun: DEFAULT_STUN, turn: [], ...store.readJSON(CFG, {}) };
  let cur = null;               // the call in progress: { id, project, started, people:Set, chat:[], polls:[], recordings:[], locked, admitted:Set, presenting }
  const rings = new Map();      // to -> { by, at, timer }
  const members = () => [...huddle.keys()];
  const toCall = msg => { for (const mid of members()) sendTo(mid, msg); };

  function ice() {
    if (cfg.lanOnly) return { iceServers: [], lanOnly: true };
    const s = [];
    if (cfg.stun && cfg.stun.length) s.push({ urls: cfg.stun.slice(0, 4) });
    for (const t of cfg.turn || []) if (t && t.urls) s.push({ urls: t.urls, username: t.username || undefined, credential: t.credential || undefined });
    return { iceServers: s, lanOnly: false };
  }
  function setConfig(b = {}) {
    if (typeof b.lanOnly === 'boolean') cfg.lanOnly = b.lanOnly;
    if (Array.isArray(b.stun)) cfg.stun = b.stun.map(u => str(u, 200)).filter(u => /^stuns?:/.test(u)).slice(0, 4);
    if (Array.isArray(b.turn)) cfg.turn = b.turn.filter(t => t && typeof t === 'object').map(t => ({ urls: [].concat(t.urls || []).map(u => str(u, 200)).filter(u => /^turns?:/.test(u)).slice(0, 4), username: str(t.username || '', 120), credential: str(t.credential || '', 200) })).filter(t => t.urls.length).slice(0, 3);
    store.writeJSON(CFG, cfg);
    return publicCfg(true);
  }
  const publicCfg = host => ({ lanOnly: cfg.lanOnly, stun: cfg.stun, turn: (cfg.turn || []).map(t => ({ urls: t.urls, username: t.username, credential: host ? t.credential : (t.credential ? '••••' : '') })) });

  // ---------- the call's lifetime (index.js tells us when the roster changes) ----------
  function changed() {
    const ids = members();
    if (ids.length && !cur) {
      cur = { id: `c-${new Date().toISOString().slice(0, 10)}-${id(5).replace(/[^A-Za-z0-9]/g, 'x')}`, project: getProject(), started: new Date().toISOString(), people: new Set(), chat: [], polls: [], recordings: [], locked: false, admitted: new Set(), presenting: null };
    }
    if (cur) for (const m of ids) { cur.people.add(m); const r = rings.get(m); if (r) { clearTimeout(r.timer); rings.delete(m); } }
    if (cur && cur.presenting && !ids.includes(cur.presenting)) { cur.presenting = null; toCall({ type: 'call-present', by: null, on: false }); }
    if (!ids.length && cur) {
      const rec = { id: cur.id, project: cur.project, started: cur.started, ended: new Date().toISOString(), people: [...cur.people], chat: cur.chat.slice(-200), polls: cur.polls, recordings: cur.recordings };
      if (rec.people.length) store.appendJSONL(HIST, rec);
      cur = null;
    }
  }
  const state = () => cur ? { type: 'call-state', id: cur.id, locked: cur.locked, presenting: cur.presenting, polls: cur.polls, chat: cur.chat.slice(-50), recording: cur.recordings.filter(r => !r.ended).map(r => r.by) } : { type: 'call-state', id: null };
  const push = () => toCall(state());

  // A locked call: only people already in, or let in, can join (index.js asks before adding someone).
  function canJoin(me) {
    if (!cur || !cur.locked || !huddle.size) return true;
    if (cur.admitted.has(me.id)) return true;
    toCall({ type: 'call-knock', id: me.id, name: me.name });
    return false;
  }

  function handle(s, me, msg) {
    const t = msg && msg.type; if (typeof t !== 'string' || !t.startsWith('call-')) return false;
    const inCall = huddle.has(me.id);
    if (t === 'call-sync') { s.send(inCall || !cur ? state() : { type: 'call-state', id: cur.id, locked: cur.locked }); return true; }
    if (t === 'call-ring') {
      const to = str(msg.to, 60); if (!to || to === me.id || huddle.has(to) || !canSee(to)) return true;
      const prev = rings.get(to); if (prev) clearTimeout(prev.timer);
      sendTo(to, { type: 'call-ring', by: me.id, name: me.name });
      bus.notify({ type: 'huddle', to: [to], priority: 'high', from: me.id, title: `${me.name} is calling you`, body: 'Tap to join the huddle.', view: 'call' });
      const timer = setTimeout(() => {
        rings.delete(to); if (huddle.has(to)) return;
        sendTo(to, { type: 'call-missed', by: me.id, name: me.name });
        bus.notify({ type: 'huddle', to: [to], priority: 'normal', from: me.id, title: `Missed huddle from ${me.name}`, body: 'Call back from the sidebar.', view: 'call' });
      }, Number(process.env.TRIBE_RING_MS) || 30_000);
      if (timer.unref) timer.unref();
      rings.set(to, { by: me.id, at: Date.now(), timer });
      return true;
    }
    if (!inCall || !cur) return true;
    if (t === 'call-react') { const e = String(msg.emoji || ''); if (EMOJI.has(e)) toCall({ type: 'call-react', by: me.id, emoji: e }); return true; }
    if (t === 'call-pointer') {
      const n = v => Math.max(0, Math.min(1, Number(v) || 0));
      const out = { type: 'call-pointer', by: me.id, to: str(msg.to || '', 60), kind: ['laser', 'pen', 'clear'].includes(msg.kind) ? msg.kind : 'laser', x: n(msg.x), y: n(msg.y) };
      if (Array.isArray(msg.pts)) out.pts = msg.pts.slice(0, 200).map(p => [n(p && p[0]), n(p && p[1])]);
      for (const mid of members()) if (mid !== me.id) sendTo(mid, out);
      return true;
    }
    if (t === 'call-chat') {
      const text = str(msg.text, 600); if (!text) return true;
      const line = { id: id(6), by: me.id, name: me.name, text, at: new Date().toISOString() };
      cur.chat.push(line); if (cur.chat.length > 400) cur.chat.shift();
      toCall({ type: 'call-chat', ...line });
      return true;
    }
    if (t === 'call-poll') {
      if (msg.q) {
        const opts = (Array.isArray(msg.options) ? msg.options : []).map(o => str(o, 60)).filter(Boolean).slice(0, 6);
        if (opts.length < 2) return true;
        cur.polls.push({ id: 'p' + id(5).replace(/[^A-Za-z0-9]/g, 'x'), q: str(msg.q, 160), by: me.id, options: opts, votes: {}, closed: false });
      } else if (msg.poll) {
        const p = cur.polls.find(x => x.id === msg.poll); if (!p || p.closed) return true;
        if (msg.close && p.by === me.id) p.closed = true;
        else { const k = Number(msg.vote); if (Number.isInteger(k) && k >= 0 && k < p.options.length) p.votes[me.id] = k; }
      }
      push(); return true;
    }
    if (t === 'call-rec') {
      if (msg.on) {
        if (!cur.recordings.some(r => r.by === me.id && !r.ended)) cur.recordings.push({ by: me.id, started: new Date().toISOString(), ended: null, file: null });
        postChat('general', 'tribecode', `🔴 ${me.name} started recording the huddle. Everyone in it can see the red dot.`);
      } else {
        const r = cur.recordings.find(x => x.by === me.id && !x.ended);
        if (r) { r.ended = new Date().toISOString(); r.file = str(msg.file || '', 120) || null; }
        postChat('general', 'tribecode', `⏹ ${me.name} stopped recording${msg.file ? '. The recording is in Files.' : '.'}`);
      }
      push(); return true;
    }
    if (t === 'call-present') { cur.presenting = msg.on ? me.id : (cur.presenting === me.id ? null : cur.presenting); toCall({ type: 'call-present', by: cur.presenting, name: cur.presenting ? me.name : '', on: !!cur.presenting, view: str(msg.view || '', 40) }); return true; }
    if (t === 'call-lock') { cur.locked = !!msg.on; if (cur.locked) for (const m of members()) cur.admitted.add(m); push(); return true; }
    if (t === 'call-admit') { const who = str(msg.id, 60); if (who) { cur.admitted.add(who); sendTo(who, { type: 'call-admitted', by: me.id }); } return true; }
    return true;
  }

  function route(req, res, { m, a, b, me, readBody, send, fail }) {
    if (a !== 'calls') return null;
    if (m === 'GET' && b === 'ice') return send(res, 200, ice());
    if (b === 'config') {
      if (m === 'GET') return send(res, 200, publicCfg(me.role === 'host'));
      if (m === 'PUT') { if (me.role !== 'host') return fail(res, 403, 'only the host sets up call relays'); return readBody(req).then(body => send(res, 200, setConfig(body))); }
    }
    if (m === 'GET' && b === 'history') {
      const list = store.readJSONL(HIST, 200).filter(c => !c.project || canSee(me.id, c.project)).filter(c => c.people.includes(me.id) || me.role === 'host').reverse().slice(0, 50)
        .map(c => ({ ...c, names: c.people.map(nameOf) }));
      return send(res, 200, { calls: list, live: cur ? { id: cur.id, started: cur.started, people: members(), names: members().map(nameOf) } : null });
    }
    return null;
  }

  return { handle, route, changed, canJoin, ice, state };
};
