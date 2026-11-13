// Roles & privileges: the single source of truth for who may do what.
//
// Roles (tribe-wide on the member, with an optional per-project override in the project's members map):
//   host     the owner. Everything, always. Hosting, secrets, launching programs and the tribe itself stay host-only.
//   admin    everything in the app except the host-only rows below; can't touch the host, and can't promote or
//            demote other admins unless the host turns on "Promote or demote admins" for admins.
//   mod      community care: delete any chat message, mute, remove someone from a project, triage tasks and
//            the board, decide low-risk approvals. No settings, widgets, repo merges, AI brain or roles above mod.
//   builder  unchanged (builds, chats, invites).  spectator  read-only.  agent  acts for its owner, never above builder.
//   Guests (one-time passes) keep their builder/spectator role and can't be promoted.
//
// Capabilities map to default roles (CAPS). The host, and admins for rows they hold themselves and roles below
// admin, can switch a cell on or off; the changes live in .tribe/perms.json. Locked rows are host-only and can
// never be granted. Every change and every moderation action lands in .tribe/audit.jsonl.
//
// HTTP (/api/perms): GET (your role + caps; the matrix and members for host/admin), PUT /overrides {cap, role, on},
// POST /reset, POST /assign {member, role, project?}, POST /mute {member, minutes}, DELETE /mute/<id>,
// POST /remove {member, project}, GET /audit.
'use strict';

const RANK = { agent: 10, spectator: 20, builder: 40, mod: 60, admin: 80, host: 100 };
const ROLES = ['host', 'admin', 'mod', 'builder', 'spectator'];
const COLUMNS = ['host', 'admin', 'mod', 'builder'];          // the matrix (spectators stay read-only)
const ASSIGNABLE = ['admin', 'mod', 'builder', 'spectator'];  // never host: that is the owner
const LABEL = { host: 'Host', admin: 'Admin', mod: 'Mod', builder: 'Builder', spectator: 'Spectator', agent: 'Agent' };
const CAPS = [
  { id: 'chat.moderate', group: 'Community', label: 'Delete anyone\'s chat message', roles: ['admin', 'mod'] },
  { id: 'members.mute', group: 'Community', label: 'Mute or time out a member', roles: ['admin', 'mod'] },
  { id: 'members.remove', group: 'Community', label: 'Remove someone from a project', roles: ['admin', 'mod'] },
  { id: 'members.invite', group: 'Community', label: 'Invite people', roles: ['admin', 'mod', 'builder'] },
  { id: 'roles.assign', group: 'Community', label: 'Change roles below their own', roles: ['admin'] },
  { id: 'roles.manage_admins', group: 'Community', label: 'Promote or demote admins', roles: [], cols: ['admin'] },
  { id: 'tasks.triage', group: 'Work', label: 'Move, assign and close any task or bug', roles: ['admin', 'mod', 'builder'] },
  { id: 'board.manage', group: 'Work', label: 'Close any proposal', roles: ['admin', 'mod'] },
  { id: 'approvals.approve_low', group: 'Work', label: 'Decide any low-risk approval', roles: ['admin', 'mod'] },
  { id: 'approvals.approve', group: 'Work', label: 'Decide any approval', roles: ['admin'] },
  { id: 'files.delete', group: 'Work', label: 'Delete anyone\'s files', roles: ['admin'] },
  { id: 'project.create', group: 'Projects', label: 'Start a project', roles: ['admin', 'mod', 'builder'] },
  { id: 'project.delete', group: 'Projects', label: 'Delete a project', roles: ['admin'] },
  { id: 'settings.edit', group: 'Projects', label: 'Project settings and vision', roles: ['admin'] },
  { id: 'widgets.edit', group: 'Projects', label: 'Change the sidebar widgets', roles: ['admin', 'builder'] },
  { id: 'repo.merge', group: 'Projects', label: 'Merge into main', roles: ['admin'] },
  { id: 'github.use_host', group: 'Projects', label: 'Put projects on the host\'s GitHub', roles: ['admin'] },   // fix/security-2 (server/flow.js)
  { id: 'ai.use_host_brain', group: 'Projects', label: 'Use the host\'s AI brain', roles: ['admin', 'mod', 'builder'] },
  // Host only, hard-coded where they are checked, never overridable.
  { id: 'tribe.hosting', group: 'Host only', label: 'Hosting, sharing and tunnels', locked: true },
  { id: 'tribe.secrets', group: 'Host only', label: 'AI keys, GitHub and sign-in secrets', locked: true },
  { id: 'tribe.launch', group: 'Host only', label: 'Run programs on the host computer', locked: true },
  { id: 'tribe.owner', group: 'Host only', label: 'Backup, transfer or delete the tribe', locked: true },
];
const CAP = Object.fromEntries(CAPS.map(c => [c.id, c]));
const MAX_MUTE_MIN = 7 * 24 * 60;

function perms({ P, store, getMembers, saveMembers, bus, broadcast, pushPresence, pushProjects = () => {}, postChat = () => {}, str, now = () => Date.now() }) {
  const FILE = '.tribe/perms.json';
  let db = store.readJSON(FILE, null) || {};
  db.overrides = db.overrides && typeof db.overrides === 'object' ? db.overrides : {};
  db.mutes = db.mutes && typeof db.mutes === 'object' ? db.mutes : {};
  const save = () => store.writeJSON(FILE, db);
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const expired = m => !!m.guestUntil && Date.parse(m.guestUntil) < now();

  // ---------- roles ----------
  // Effective role in a project: the tribe role, raised (never lowered) by a project override of mod or admin.
  function roleIn(m, pid) {
    if (!m) return null;
    if (m.role === 'host' || m.role === 'agent') return m.role;
    let r = RANK[m.role] ? m.role : 'builder';
    const pr = pid && P.get(pid) && (P.get(pid).members || {})[m.id];
    if ((pr === 'admin' || pr === 'mod') && RANK[pr] > RANK[r] && !m.guestUntil) r = pr;
    return r;
  }
  // Agents act at their owner's level, capped at builder.
  function actingRole(m, pid) {
    const r = roleIn(m, pid);
    if (r !== 'agent') return r;
    const o = member(m.owner); if (!o || o.role === 'agent') return 'spectator';
    const or = roleIn(o, pid);
    if (m.invited && m.adminAsMe && (or === 'admin' || or === 'host')) return 'admin';   // "Let it act as me for admin" (server/inviteclaude.js); host-only rows stay locked
    return RANK[or] >= RANK.builder ? 'builder' : or;
  }
  const rank = (m, pid) => RANK[actingRole(m, pid)] || 0;
  const atLeast = (m, role, pid) => rank(m, pid) >= RANK[role];

  function allowed(cap, role) {
    const c = CAP[cap]; if (!c) return false;
    if (role === 'host') return true;
    if (c.locked || !COLUMNS.includes(role)) return false;
    const o = db.overrides[cap]; if (o && typeof o[role] === 'boolean') return o[role];
    return c.roles.includes(role);
  }
  function can(m, cap, pid = P.current()) {
    if (!m || !CAP[cap] || expired(m)) return false;
    return allowed(cap, actingRole(m, pid));
  }
  const capsOf = (m, pid) => Object.fromEntries(CAPS.filter(c => can(m, c.id, pid)).map(c => [c.id, true]));

  // ---------- mutes ----------
  function mutedUntil(mid) {
    const m = member(mid); if (!m) return null;
    const ids = [m.id, ...(m.role === 'agent' && m.owner ? [m.owner] : [])];   // a muted person's agents wait too
    let until = 0;
    for (const x of ids) { const u = db.mutes[x] && Date.parse(db.mutes[x].until); if (u && u > now()) until = Math.max(until, u); }
    return until ? new Date(until).toISOString() : null;
  }
  const muteBlock = m => { const u = m && mutedUntil(m.id); return u ? `You're muted until ${new Date(u).toISOString().slice(11, 16)} UTC. You can read along; posting opens again then.` : ''; };
  function sweep() { let n = 0; for (const [k, v] of Object.entries(db.mutes)) if (!v || Date.parse(v.until) <= now()) { delete db.mutes[k]; n++; } if (n) { save(); pushPresence(); } }
  setInterval(sweep, 30_000).unref();

  // ---------- audit ----------
  function audit(by, action, target, detail = {}) {
    const e = { at: new Date(now()).toISOString(), by: by ? by.id : null, byName: by ? by.name : null, action, target: target ? target.id || target : null,
      targetName: target && target.name ? target.name : null, project: P.current() || null, ...detail };
    store.appendJSONL('.tribe/audit.jsonl', e);
    return e;
  }
  const notify = (to, from, title, body) => { if (to && to.role !== 'agent' && bus) bus.notify({ type: 'roles', priority: 'normal', to: [to.id], from: from.id, title, body: body || '', view: 'chat' }); };

  // ---------- rules for acting on another person ----------
  // You act on someone only if you outrank them (the host outranks everyone; nobody acts on the host).
  function outranks(me, target, pid) {
    if (!me || !target || target.role === 'host') return false;
    if (me.role === 'host') return true;
    return rank(me, pid) > rank(target, pid);
  }

  function assign(me, targetId, role, pid) {
    const t = member(targetId);
    if (!t) throw err(404, 'unknown member');
    if (me.role === 'agent') throw err(403, 'agents never change roles');
    if (t.id === me.id) throw err(403, 'you can\'t change your own role');
    if (t.role === 'agent') throw err(403, 'agents follow their owner and never go above builder');
    if (t.role === 'host') throw err(403, 'nobody changes the host\'s role');
    if (!ASSIGNABLE.includes(role) && !(pid && role === null)) throw err(400, 'role must be admin, mod, builder or spectator');
    if (pid && role === 'spectator') throw err(400, 'a project role raises someone to mod or admin; make them a spectator tribe-wide instead');
    if (pid && !P.get(pid)) throw err(404, 'project not found');
    if (pid && !P.canSee(t, pid)) throw err(400, `${t.name} isn't in that project`);
    if (!can(me, 'roles.assign', pid)) throw err(403, 'your role can\'t change roles');
    if (t.guestUntil && role && RANK[role] > RANK.builder) throw err(403, 'guest passes stay builder or spectator');
    const myRank = me.role === 'host' ? RANK.host : rank(me, pid);
    const manageAdmins = me.role === 'host' || can(me, 'roles.manage_admins', pid);
    const cur = roleIn(t, pid);
    if (me.role !== 'host') {
      if (cur === 'admin' && !manageAdmins) throw err(403, 'only the host changes an admin (unless the host lets admins do it)');
      if (cur !== 'admin' && RANK[cur] >= myRank) throw err(403, `you can't change someone at or above your own role`);
      if (role === 'admin' ? !manageAdmins : role && RANK[role] >= myRank) throw err(403, 'you can only give roles below your own');
    }
    const mem = getMembers().find(x => x.id === t.id);
    let before;
    if (pid) {
      const p = P.get(pid); before = (p.members || {})[t.id] || null;
      p.members[t.id] = role === 'admin' || role === 'mod' ? role : 'builder';   // a project role only raises someone; null/builder clears it
      P.update(pid, {});
      pushProjects();
    } else {
      before = mem.role; mem.role = role; saveMembers();
    }
    const after = pid ? (P.get(pid).members || {})[t.id] : role;
    audit(me, 'role', t, { from: before, to: after, scope: pid ? 'project' : 'tribe', ...(pid ? { project: pid } : {}) });
    pushPresence(); broadcast({ type: 'perms', member: t.id });
    const where = pid ? ` in ${P.get(pid).name}` : '';
    if (before !== after) {
      notify(t, me, `${me.name} made you ${/^[aeiou]/i.test(LABEL[after] || '') ? 'an' : 'a'} ${LABEL[after] || after}${where}`, after === 'mod' ? '🛡️ You can now delete messages, mute and triage.' : '');
      const chatPid = pid || P.defaultId();
      P.inProject(chatPid, () => postChat('general', 'tribecode', `${me.name} made ${t.name} ${/^[aeiou]/i.test(LABEL[after] || '') ? 'an' : 'a'} ${LABEL[after] || after}${where}${after === 'mod' ? ' 🛡️' : ''}`));
    }
    return { member: t.id, role: mem.role, projectRole: pid ? after : undefined };
  }

  function mute(me, targetId, minutes, reason) {
    const t = member(targetId); if (!t) throw err(404, 'unknown member');
    if (t.id === me.id) throw err(400, 'you can\'t mute yourself');
    if (!can(me, 'members.mute')) throw err(403, 'your role can\'t mute people');
    if (!outranks(me, t)) throw err(403, 'you can only mute someone below your own role');
    const min = Math.round(Number(minutes) || 0);
    if (min < 1 || min > MAX_MUTE_MIN) throw err(400, 'minutes must be between 1 and 10080 (a week)');
    const until = new Date(now() + min * 60_000).toISOString();
    db.mutes[t.id] = { until, by: me.id, at: new Date(now()).toISOString(), reason: str(reason, 200) }; save();
    audit(me, 'mute', t, { minutes: min, until, reason: str(reason, 200) || undefined });
    notify(t, me, `${me.name} muted you for ${min >= 60 ? Math.round(min / 60) + 'h' : min + 'm'}`, 'You can read along; posting opens again when it ends.');
    pushPresence();
    return { member: t.id, mutedUntil: until };
  }
  function unmute(me, targetId) {
    const t = member(targetId); if (!t) throw err(404, 'unknown member');
    if (!can(me, 'members.mute')) throw err(403, 'your role can\'t unmute people');
    if (!outranks(me, t)) throw err(403, 'you can only unmute someone below your own role');
    if (db.mutes[t.id]) { delete db.mutes[t.id]; save(); audit(me, 'unmute', t); pushPresence(); }
    return { member: t.id, mutedUntil: null };
  }

  // Remove from a project: a project-only friend loses it; a tribe-wide member keeps every other project.
  function removeFromProject(me, targetId, pid) {
    const t = member(targetId), p = P.get(pid);
    if (!t) throw err(404, 'unknown member');
    if (!p) throw err(404, 'project not found');
    if (t.id === me.id) throw err(400, 'leave the project instead');
    if (!can(me, 'members.remove', pid)) throw err(403, 'your role can\'t remove people');
    if (!P.canSee(me, pid)) throw err(403, 'you are not in that project');
    if (!outranks(me, t, pid)) throw err(403, 'you can only remove someone below your own role');
    if (!P.canSee(t, pid)) return { member: t.id, removed: false };
    const others = P.all().map(x => x.id).filter(x => x !== pid);
    const mems = getMembers();
    for (const x of [t, ...mems.filter(a => a.role === 'agent' && a.owner === t.id)]) {
      x.projects = (Array.isArray(x.projects) ? x.projects : others).filter(y => y !== pid);
      if (x.project === pid) x.project = x.projects[0] || null;
    }
    delete p.members[t.id]; P.update(pid, {}); saveMembers();
    audit(me, 'remove', t, { project: pid, projectName: p.name });
    notify(t, me, `${me.name} removed you from ${p.name}`, '');
    pushPresence(); pushProjects(); broadcast({ type: 'perms', member: t.id });
    return { member: t.id, removed: true };
  }

  // ---------- the matrix ----------
  function editableCell(me, cap, role) {
    const c = CAP[cap];
    if (!c || c.locked || role === 'host' || !COLUMNS.includes(role)) return false;
    if (c.cols && !c.cols.includes(role)) return false;
    if (me.role === 'host') return true;
    if (!atLeast(me, 'admin')) return false;
    return RANK[role] < rank(me) && can(me, cap) && cap !== 'roles.manage_admins';   // never more than you have yourself
  }
  function setOverride(me, cap, role, on) {
    if (!CAP[cap]) throw err(400, 'unknown capability');
    if (CAP[cap].locked) throw err(403, 'host only: this can never be shared');
    if (!editableCell(me, cap, role)) throw err(403, me.role === 'host' || atLeast(me, 'admin') ? 'you can only change rows you hold, for roles below yours' : 'only the host and admins change privileges');
    const def = CAP[cap].roles.includes(role), o = db.overrides[cap] || {};
    const before = allowed(cap, role);
    if (!!on === def) delete o[role]; else o[role] = !!on;
    if (Object.keys(o).length) db.overrides[cap] = o; else delete db.overrides[cap];
    save();
    if (before !== !!on) audit(me, 'privilege', null, { cap, role, on: !!on });
    broadcast({ type: 'perms' });
    return matrix(me);
  }
  function reset(me) {
    if (me.role !== 'host' && !atLeast(me, 'admin')) throw err(403, 'only the host and admins change privileges');
    for (const cap of Object.keys(db.overrides)) for (const role of Object.keys(db.overrides[cap])) if (editableCell(me, cap, role) || (me.role === 'host')) delete db.overrides[cap][role];
    for (const cap of Object.keys(db.overrides)) if (!Object.keys(db.overrides[cap]).length) delete db.overrides[cap];
    save(); audit(me, 'privileges-reset', null); broadcast({ type: 'perms' });
    return matrix(me);
  }
  function matrix(me) {
    return CAPS.map(c => ({ id: c.id, group: c.group, label: c.label, locked: !!c.locked,
      cells: Object.fromEntries(COLUMNS.map(r => [r, { on: allowed(c.id, r), edit: editableCell(me, c.id, r), changed: !!(db.overrides[c.id] && typeof db.overrides[c.id][r] === 'boolean') }])) }));
  }
  function membersView(me, pid) {
    return getMembers().filter(m => m.role !== 'agent' && !expired(m)).map(m => {
      const role = m.role, pr = pid && P.get(pid) ? (P.get(pid).members || {})[m.id] || null : null;
      const opts = m.id === me.id || m.role === 'host' ? [] : ASSIGNABLE.filter(r => { try { checkOnly(me, m, r); return true; } catch { return false; } });
      return { id: m.id, name: m.name, color: m.color, role, label: LABEL[role] || role, projectRole: pr === 'admin' || pr === 'mod' ? pr : null, guest: !!m.guestUntil,
        mutedUntil: mutedUntil(m.id), options: opts, canMute: m.id !== me.id && can(me, 'members.mute') && outranks(me, m) };
    });
  }
  // Same rules as assign(), without changing anything (for the role picker's options).
  function checkOnly(me, t, role) {
    if (t.guestUntil && RANK[role] > RANK.builder) throw err(403, 'guest');
    if (!can(me, 'roles.assign')) throw err(403, 'no');
    if (me.role === 'host') return true;
    const myRank = rank(me), manage = can(me, 'roles.manage_admins'), cur = roleIn(t);
    if (cur === 'admin' && !manage) throw err(403, 'no');
    if (cur !== 'admin' && RANK[cur] >= myRank) throw err(403, 'no');
    if (role === 'admin' ? !manage : RANK[role] >= myRank) throw err(403, 'no');
    return true;
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, b, c, me, url, readBody, send, fail }) {
    const pid = P.current();
    const wrap = fn => { try { return send(res, 200, fn()); } catch (e) { return fail(res, e.status || 400, e.message); } };
    if (m === 'GET' && !b) {
      const manager = me.role === 'host' || atLeast(me, 'admin') || can(me, 'roles.assign');
      return send(res, 200, { me: { id: me.id, role: actingRole(me, pid), tribeRole: me.role, caps: capsOf(me, pid), mutedUntil: mutedUntil(me.id) },
        labels: LABEL, roles: ROLES, columns: COLUMNS, ranks: RANK,
        ...(manager ? { matrix: matrix(me), members: membersView(me, pid), canReset: me.role === 'host' || atLeast(me, 'admin') } : {}) });
    }
    if (me.role === 'agent' && !(me.invited && me.adminAsMe && ['mute', 'remove'].includes(b))) return fail(res, 403, 'agents don\'t manage roles');   // an invited Claude acting as its admin may moderate, never change roles
    const body = m === 'GET' || m === 'DELETE' ? {} : await readBody(req).catch(() => ({}));
    if (m === 'PUT' && b === 'overrides') return wrap(() => ({ matrix: setOverride(me, str(body.cap, 60), str(body.role, 20), !!body.on) }));
    if (m === 'POST' && b === 'reset') return wrap(() => ({ matrix: reset(me) }));
    if (m === 'POST' && b === 'assign') return wrap(() => assign(me, str(body.member, 64), body.role === null ? null : str(body.role, 20), body.project ? str(body.project, 40) : null));
    if (m === 'POST' && b === 'mute') return wrap(() => mute(me, str(body.member, 64), body.minutes, body.reason));
    if (m === 'DELETE' && b === 'mute' && c) return wrap(() => unmute(me, c));
    if (m === 'POST' && b === 'remove') return wrap(() => removeFromProject(me, str(body.member, 64), str(body.project, 40) || pid));
    if (m === 'GET' && b === 'audit') {
      if (me.role !== 'host' && !atLeast(me, 'admin')) return fail(res, 403, 'only the host and admins read the audit log');
      const n = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
      return send(res, 200, { entries: store.readJSONL('.tribe/audit.jsonl', n).reverse() });
    }
    return fail(res, 404, 'not found');
  }

  return { can, capsOf, roleIn, actingRole, rank, atLeast, outranks, allowed, mutedUntil, muteBlock, audit, assign, mute, unmute, removeFromProject, setOverride, reset, matrix, route, LABEL, CAPS, RANK };
}
perms.CAPS = CAPS; perms.RANK = RANK; perms.ROLES = ROLES; perms.LABEL = LABEL;
module.exports = perms;
