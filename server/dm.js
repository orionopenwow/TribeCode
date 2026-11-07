// Direct messages + typing indicators.
// A DM channel is named dm-<idA>-<idB> with the two member ids sorted. Only those two members can read
// it (REST) or receive it (WebSocket). Mentions in #general and every DM are announced on the bus.
'use strict';

module.exports = function dm({ store, getMembers, sendTo, broadcast, bus }) {
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
  function onPost(ch, me, text) {
    const p = pair(ch);
    if (p) {
      const other = p.find(x => x !== me.id);
      bus.notify({ type: 'dm', to: [other], priority: 'high', title: `${me.name} sent you a message`, body: text.slice(0, 160), view: 'chat', ref: ch, from: me.id });
      return;
    }
    const low = text.toLowerCase();
    const named = getMembers().filter(m => m.id !== me.id && m.role !== 'agent' && low.includes('@' + m.name.toLowerCase()));
    if (named.length) bus.notify({ type: 'mention', to: named.map(m => m.id), priority: 'high', title: `${me.name} mentioned you in #${ch}`, body: text.slice(0, 160), view: 'chat', ref: ch, from: me.id });
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
    else if (/^[a-z0-9][a-z0-9-]{0,31}$/.test(ch)) broadcast(out, sock);
    return true;
  }

  function route(req, res, { m, me, send, fail }) {
    if (m !== 'GET') return fail(res, 405, 'method not allowed');
    return send(res, 200, { conversations: list(me) });
  }

  return { isDm, pair, canRead, deliver, onPost, handle, route, nameFor, member };
};
