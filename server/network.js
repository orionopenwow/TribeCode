// "How we're connected" and invites from the friends list (p13, docs/ONLINE-MODES.md).
//
// 1. How each person reaches the tribe. Every signed-in request and socket says where it came from:
//      here      this computer (loopback, no proxy header)
//      wifi      a home-network address (10/8, 172.16/12, 192.168/16, link-local, fc00::/7)
//      tailscale a Tailscale address (100.64/10, fd7a:115c:a1e0::/48)
//      internet  through the internet link (a Cloudflare / Tailscale Funnel proxy header) or any public address
//    The last way and time are kept per member in .tribe/network-seen.json (no addresses are stored, only the kind).
//    Anyone who has connected once keeps a copy of the tribe on their device (app/ui/copies.js), so an offline member
//    who was seen is "Offline · has a copy"; one never seen is "Waiting to connect".
//    GET /api/network -> { tribe, reach, backup, canFix, people: [{ id, name, color, avatar, me, owner, online, via, hasCopy, at }], waiting: [...] }
//
// 2. Invites from the friends list: people you already know in this tribe (from your projects, or starred) who aren't
//    in this project (or, for the whole tribe, people who only see some projects). Nobody is added until they press Join.
//    GET  /api/friend-invites/people?project=<id|tribe>   who you can invite from your list
//    POST /api/friend-invites { to, project }              send one (shows in their Home and their inbox)
//    GET  /api/friend-invites                              invites waiting for me (and the ones I sent, still waiting)
//    POST /api/friend-invites/<id> { answer: 'join'|'later' }   join -> { project, by } ; later -> hidden for me
// Kept in .tribe/friend-invites.json. An invite runs out after 14 days.
'use strict';

const FILE_SEEN = '.tribe/network-seen.json', FILE_INV = '.tribe/friend-invites.json', DAYS14 = 14 * 86400_000;
const PROXY = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'tailscale-funnel-request', 'cf-connecting-ip', 'cf-ray'];

function classify(remote, headers) {
  headers = headers || {};
  if (process.env.TRIBE_TEST && /^(here|wifi|tailscale|internet)$/.test(String(headers['x-tribe-test-via'] || ''))) return headers['x-tribe-test-via'];   // tests only
  const a = String(remote || '').replace(/^::ffff:/, '').toLowerCase();
  if (PROXY.some(h => headers[h] !== undefined)) return 'internet';   // came through the internet link (or another proxy)
  if (a === '127.0.0.1' || a === '::1' || a === 'localhost') return 'here';
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a) || /^fd7a:115c:a1e0:/.test(a)) return 'tailscale';
  if (/^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^169\.254\./.test(a) || /^(fe80|fc|fd)/.test(a)) return 'wifi';
  return 'internet';
}

module.exports = function network({ base, P, getMembers, memberById, nameOf, publicMember, presenceFor, isOnline, perms, bus, sendTo, postChat, saveMembers, pushPresence, pushProjects,
  tribe, share, lanUrls, cloud = false, backupOn = () => false, id }) {
  let seen = null, saveT = null;
  const loadSeen = () => (seen = seen || (base.readJSON(FILE_SEEN, {}) || {}));
  const saveSeen = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { base.writeJSON(FILE_SEEN, loadSeen()); } catch {} }, 1500); if (saveT.unref) saveT.unref(); };
  const live = new Map();   // member id -> via of their newest request (this run only)

  // called for every signed-in request and socket
  function touch(me, req) {
    if (!me || me.role === 'agent' || !req) return;
    const via = classify(req.socket && req.socket.remoteAddress, req.headers), s = loadSeen(), now = Date.now(), prev = s[me.id];
    live.set(me.id, via);
    if (!prev || prev.via !== via || now - prev.at > 60_000) { s[me.id] = { via, at: now }; saveSeen(); }
  }

  let invs = null;
  const loadInv = () => (invs = invs || (() => { const l = base.readJSON(FILE_INV, []); return Array.isArray(l) ? l : []; })());
  const saveInv = () => { const now = Date.now(); invs = loadInv().filter(i => now - Date.parse(i.at) < DAYS14 * 2).slice(-500); base.writeJSON(FILE_INV, invs); };
  const pendingOf = i => i.state === 'waiting' && Date.now() - Date.parse(i.at) < DAYS14;
  const humans = () => getMembers().filter(m => m.role !== 'agent' && !m.removed && !(m.guestUntil) && m.tokenHash);
  const projOk = pid => pid === 'tribe' || !!P.get(pid);
  const inProject = (m, pid) => pid === 'tribe' ? !P.scoped(m) : (P.canSee(m, pid) && !!((P.get(pid) || { members: {} }).members[m.id]));
  const whereName = pid => pid === 'tribe' ? tribe.name : ((P.get(pid) || {}).name || 'a project');

  // the people you know: everyone you can see in the tribe (the same list People shows you), starred friends first
  function people(me, pid) {
    const visible = new Set(presenceFor(me).map(x => x.id));
    const friends = new Set(((base.readJSON('.tribe/friends.json', {}) || {})[me.id]) || []);
    const waiting = new Set(loadInv().filter(i => pendingOf(i) && i.project === pid).map(i => i.to));
    return humans().filter(m => m.id !== me.id && visible.has(m.id) && m.role !== 'spectator' && !inProject(m, pid))
      .map(m => ({ ...publicMember(m), friend: friends.has(m.id), invited: waiting.has(m.id), online: isOnline(m.id) }))
      .sort((a, b) => (b.friend - a.friend) || (b.online - a.online) || String(a.name).localeCompare(String(b.name)));
  }
  function mayInvite(me, pid) {
    if (!me || me.role === 'agent' || me.role === 'spectator') return 'spectators and agents cannot invite people';
    if (pid === 'tribe') { if (P.scoped(me)) return 'you can invite people to your project only'; if (!perms.can(me, 'members.invite', null)) return 'your role cannot invite people'; return ''; }
    if (!P.canSee(me, pid)) return 'you are not in that project';
    if (!perms.can(me, 'members.invite', pid)) return 'your role cannot invite people';
    return '';
  }
  const viewInv = i => ({ id: i.id, by: i.by, byName: nameOf(i.by), to: i.to, toName: nameOf(i.to), project: i.project, where: whereName(i.project), at: i.at, state: i.state });

  function overview(me) {
    const s = loadSeen(), mine = new Set(presenceFor(me).map(x => x.id));
    const owner = humans().find(m => m.role === 'host');
    const lan = (lanUrls() || []), pub = share.publicUrl();
    const ppl = humans().filter(m => mine.has(m.id) || m.id === me.id).map(m => {
      const on = isOnline(m.id), seenAt = s[m.id], via = on ? (live.get(m.id) || (seenAt && seenAt.via) || 'here') : null;
      return { ...publicMember(m), me: m.id === me.id, owner: m.role === 'host', online: on, via, hasCopy: !!seenAt, at: seenAt ? new Date(seenAt.at).toISOString() : null };
    });
    const waiting = loadInv().filter(i => pendingOf(i) && (i.by === me.id || i.project === 'tribe' || P.canSee(me, i.project))).slice(-12).map(viewInv);
    return {
      tribe: { name: tribe.name, place: cloud ? 'server' : 'computer', ownerName: owner ? owner.name : '' },
      reach: { wifi: lan.some(l => l.kind === 'lan'), tailscale: lan.some(l => l.kind === 'tailscale'), internet: !!pub || cloud },
      backup: !!backupOn(me),
      canFix: { internet: me.role === 'host' && !cloud },
      people: ppl, waiting,
    };
  }

  async function route(req, res, { m, b, c, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'sign in first');
    if (b === undefined || b === 'overview') { if (m !== 'GET') return fail(res, 405, 'GET only'); return send(res, 200, overview(me)); }
    return null;
  }

  async function routeInvites(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'sign in first');
    if (b === 'people' && m === 'GET') {
      const pid = String(url.searchParams.get('project') || 'tribe');
      if (!projOk(pid)) return fail(res, 404, 'no such project');
      const why = mayInvite(me, pid); if (why) return send(res, 200, { people: [], why, project: pid, where: whereName(pid) });
      return send(res, 200, { people: people(me, pid), project: pid, where: whereName(pid) });
    }
    if (!b && m === 'GET') {
      const l = loadInv();
      return send(res, 200, { forMe: l.filter(i => i.to === me.id && pendingOf(i)).map(viewInv), sent: l.filter(i => i.by === me.id && pendingOf(i)).map(viewInv) });
    }
    if (!b && m === 'POST') {
      const body = await readBody(req), pid = String(body.project || 'tribe').slice(0, 64), to = memberById(String(body.to || '').slice(0, 64));
      if (!projOk(pid)) return fail(res, 404, 'no such project');
      const why = mayInvite(me, pid); if (why) return fail(res, 403, why);
      if (!to || !people(me, pid).some(p => p.id === to.id)) return fail(res, 400, 'not someone you can invite here');
      const l = loadInv();
      let inv = l.find(i => i.to === to.id && i.project === pid && pendingOf(i));
      if (!inv) { inv = { id: 'fi-' + id(8), by: me.id, to: to.id, project: pid, at: new Date().toISOString(), state: 'waiting' }; l.push(inv); saveInv(); }
      const v = viewInv(inv);
      sendTo(to.id, { type: 'friend-invite', invite: v });
      if (bus && bus.notify) bus.notify({ type: 'invite', to: [to.id], from: me.id, title: `${me.name} invited you to ${v.where}`, body: 'Join or Not now, from your Home.', view: 'home', ref: inv.id });
      return send(res, 200, { invite: v });
    }
    if (b && m === 'POST') {
      const l = loadInv(), inv = l.find(i => i.id === b);
      if (!inv || inv.to !== me.id) return fail(res, 404, 'no such invite');
      if (!pendingOf(inv)) return fail(res, 410, 'this invite has run out. Ask for a new one');
      const body = await readBody(req);
      if (body.answer === 'later') { inv.state = 'later'; saveInv(); return send(res, 200, { ok: true }); }
      if (body.answer !== 'join') return fail(res, 400, "answer: 'join' or 'later'");
      const mem = memberById(me.id); if (!mem) return fail(res, 404, 'not a member');
      if (inv.project === 'tribe') delete mem.projects;   // they asked to join the whole tribe
      else {
        if (!P.get(inv.project)) return fail(res, 410, 'that project is gone');
        if (Array.isArray(mem.projects) && !mem.projects.includes(inv.project)) mem.projects.push(inv.project);
        P.addMember(inv.project, mem.id, P.scoped(mem) ? 'builder' : mem.role);
        mem.project = inv.project;
      }
      inv.state = 'joined'; inv.joinedAt = new Date().toISOString(); saveInv(); saveMembers();
      const pid = inv.project === 'tribe' ? P.defaultId() : inv.project;
      try { P.inProject(pid, () => postChat('general', 'tribecode', `${mem.name} joined ${whereName(inv.project)} 👋 (invited by ${nameOf(inv.by)})`)); } catch {}
      pushPresence(); pushProjects();
      sendTo(inv.by, { type: 'friend-invite-joined', invite: viewInv(inv) });
      return send(res, 200, { project: inv.project === 'tribe' ? null : inv.project, by: nameOf(inv.by), where: whereName(inv.project) });
    }
    return fail(res, 405, 'not here');
  }

  return { touch, classify, route, routeInvites, overview };
};
module.exports.classify = classify;
