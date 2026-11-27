// Direct messages + typing indicators.
// A DM channel is named dm-<idA>-<idB> with the two member ids sorted. Only those two members can read
// it (REST) or receive it (WebSocket). Mentions in #general and every DM are announced on the bus.
'use strict';

module.exports = function dm({ store, getMembers, sendTo, broadcast, bus, canSeeChannel = () => true }) {
  const isDm = ch => typeof ch === 'string' && ch.startsWith('dm-');
  const nameFor = (a, b) => 'dm-' + [a, b].sort().join('-');
  const member = mid => getMembers().find(m => m.id === mid);

  // Member ids can contain '-', so match the channel against real member pairs instead of splitting it.
  function pair(ch) {
    if (!isDm(ch) || ch.length > 120) return null;
    const ids = getMembers().map(m => m.id);
    for (const a of ids) {
      if (!ch.startsWith(`dm-${a}-`)) continue;
      const b = ch.slice(4 + a.length);
      if (b !== a && ids.includes(b) && nameFor(a, b) === ch) return [a, b];
    }
    return null;
  }
  // A DM with an agent is its owner's private line to it: nobody else can read or post there.
  function canRead(ch, me) {
    if (!isDm(ch)) return true;
    const p = pair(ch); if (!me || !p || !p.includes(me.id)) return false;
    const [x, y] = p.map(member);
    return !(x.role === 'agent' && x.owner !== y.id) && !(y.role === 'agent' && y.owner !== x.id);
  }

  // Chat delivery: DMs go only to the two members' sockets; everything else to the whole tribe.
  function deliver(ch, message) {
    const p = pair(ch); if (!p) return false;
    for (const mid of p) sendTo(mid, { type: 'chat', channel: ch, message });
    return true;
  }

  // After a member posts: DMs notify the other person, @mentions notify whoever was named.
  // A private (end-to-end encrypted) message never puts its words in a notification: only "New message".
  function onPost(ch, me, text, msg) {
    const p = pair(ch);
    if (p) {
      const other = p.find(x => x !== me.id);
      if (msg && msg.enc) bus.notify({ type: 'dm', to: [other], priority: 'high', title: `New message from ${me.name}`, body: '', view: 'chat', ref: ch, from: me.id, enc: true });
      else bus.notify({ type: 'dm', to: [other], priority: 'high', title: `${me.name} sent you a message`, body: text.slice(0, 160), view: 'chat', ref: ch, from: me.id });
      return;
    }
    // @mentions in shared channels are handled by the notification hub (server/notify.js -> pocket.chat).
  }

  // Conversations this member is part of, with the last message and recent timestamps from the other side
  // (the client compares those with what it has read to show unread badges).
  function list(me) {
    const out = [];
    for (const m of getMembers()) {
      if (m.id === me.id) continue;
      const ch = nameFor(me.id, m.id);
      const msgs = store.readJSONL(`chat/${ch}.jsonl`, 100);
      if (!msgs.length) continue;
      out.push({ channel: ch, with: m.id, last: msgs[msgs.length - 1], incoming: msgs.filter(x => x.by !== me.id).map(x => x.at) });
    }
    return out.sort((a, b) => String(b.last.at).localeCompare(String(a.last.at)));
  }

  // WebSocket: { type:'typing', channel } is relayed to the people who can read that channel.
  function handle(sock, me, msg) {
    if (msg.type !== 'typing' || typeof msg.channel !== 'string') return false;
    if (me.role === 'spectator' || me.role === 'agent') return true;
    const ch = msg.channel.slice(0, 120), out = { type: 'typing', channel: ch, by: me.id, name: me.name, stop: !!msg.stop };
    if (isDm(ch)) { const p = pair(ch); if (p && p.includes(me.id)) sendTo(p.find(x => x !== me.id), out); }
    else if (/^[a-z0-9][a-z0-9-]{0,31}$/.test(ch) && canSeeChannel(me, ch)) broadcast(out, sock);   // fix/security-2: not into another project's channel
    return true;
  }

  // ---------- private messages: device keys (feat/p12-e2ee) ----------
  // Each device makes its own P-256 key pair in the browser (app/ui/e2ee.js). Only the PUBLIC half comes here, so the
  // tribe can encrypt to it. Private keys never leave the device: this file, backups and exports hold no private key.
  const KEYS = '.tribe/device-keys.json', DEV_RE = /^[A-Za-z0-9_-]{8,40}$/, B64 = /^[A-Za-z0-9+/]+={0,2}$/, MAX_DEV = 8;
  const allKeys = () => { const k = store.readJSON(KEYS, {}); return k && typeof k === 'object' ? k : {}; };
  const devicesOf = mid => (allKeys()[mid] || []).filter(d => d && DEV_RE.test(d.d) && typeof d.pub === 'string');
  const okPub = pub => typeof pub === 'string' && pub.length === 88 && B64.test(pub) && (() => { const b = Buffer.from(pub, 'base64'); return b.length === 65 && b[0] === 4; })();
  function addKey(me, d, pub) {
    if (!DEV_RE.test(String(d || '')) || !okPub(pub)) return null;
    const all = allKeys(), list = (all[me.id] || []).filter(x => x && x.d !== d);
    list.push({ d, pub, at: new Date().toISOString() });
    all[me.id] = list.slice(-32); store.writeJSON(KEYS, all);   // older devices stay listed so their old messages still open
    return all[me.id];
  }
  // New messages are sealed only to a person's latest devices.
  const activeOf = mid => devicesOf(mid).slice(-MAX_DEV);
  function removeKey(me, d) { const all = allKeys(); all[me.id] = (all[me.id] || []).filter(x => x && x.d !== d); store.writeJSON(KEYS, all); }
  // Both people must be real people (an AI helper reads its DMs, so those stay plain and say so).
  const humans = ch => { const p = pair(ch); return p && p.every(id => { const x = member(id); return x && x.role !== 'agent'; }) ? p : null; };
  // Shape check for a private message. The server can't read it; it only makes sure the sealed copies are for the two
  // people's registered devices, so nobody can slip a copy to a stranger's key.
  function cleanEnc(ch, me, enc) {
    const p = humans(ch); if (!p || !p.includes(me.id) || !enc || typeof enc !== 'object') return null;
    const s = (v, max) => typeof v === 'string' && v.length <= max && B64.test(v) ? v : null;
    if (enc.v !== 1 || !DEV_RE.test(String(enc.from || '')) || !activeOf(me.id).some(x => x.d === enc.from)) return null;
    const iv = s(enc.iv, 24), ct = s(enc.ct, 16000); if (!iv || !ct || !Array.isArray(enc.to) || !enc.to.length || enc.to.length > 2 * MAX_DEV) return null;
    const to = [];
    for (const t of enc.to) {
      if (!t || !p.includes(t.m) || !activeOf(t.m).some(x => x.d === t.d)) return null;
      const w = s(t.w, 120); if (!w) return null;
      to.push({ m: t.m, d: t.d, w });
    }
    return { v: 1, from: enc.from, iv, ct, to };
  }
  // GET /api/keys?ids=a,b -> { keys: { a: [{ d, pub, at }] } }   POST /api/keys { d, pub }   DELETE /api/keys/<d>
  async function keysRoute(req, res, { m, me, b, url, readBody, send, fail }) {
    if (m === 'GET') {
      const ids = String(url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 20), out = {};
      for (const i of ids) if (member(i)) { const all = devicesOf(i), act = new Set(activeOf(i).map(x => x.d)); out[i] = all.map(({ d, pub, at }) => ({ d, pub, at, active: act.has(d) })); }
      return send(res, 200, { keys: out });
    }
    if (me.role === 'agent') return fail(res, 403, 'AI helpers do not hold private-message keys');
    if (m === 'POST') { const body = await readBody(req), list = addKey(me, body.d, body.pub); return list ? send(res, 200, { ok: true, devices: list.length }) : fail(res, 400, 'bad key'); }
    if (m === 'DELETE' && b) { removeKey(me, String(b)); return send(res, 200, { ok: true }); }
    return fail(res, 405, 'method not allowed');
  }

  function route(req, res, { m, me, send, fail }) {
    if (m !== 'GET') return fail(res, 405, 'method not allowed');
    return send(res, 200, { conversations: list(me) });
  }

  return { isDm, pair, canRead, deliver, onPost, handle, route, nameFor, member, list, keysRoute, cleanEnc, humans, devicesOf };   // list: feat/p10-home (Home's Messages)
};
