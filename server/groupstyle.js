// How this group decides (feat/group-styles). ONE setting per project (with a tribe default), layered on the SAME
// capability table as server/perms.js. It is not a fourth permission system: perms.can() asks this file last.
//
//   style    'lead'     one person decides (today's behaviour; nothing changes for existing tribes)
//            'council'  no single lead: the sensitive things pass when enough of the council agree
//            'open'     flat: any builder can do most things; destructive things need a second person
//            'custom'   the group names its own roles and picks the rule for each sensitive thing
//   rule     per capability: 'one' (one person who holds it) · 'second' (a holder plus one other person) ·
//            'council' (N of the council) · 'all' (everyone) · 'lead' (host or admin only)
//   roles    custom roles { id, name, color, purpose, caps, members }: a role ADDS capabilities for the people in it.
//            Never a host-only (locked) row, never for a spectator or a guest pass, and never for an AI helper
//            (helpers act for their owner and stay at builder).
//   words    the group's own words for Company / Lead / Role / Check-in (the app and Flint use them everywhere)
//   asks     "Ask them": a request for something you can't do alone. It is a vote in the project's chat
//            (server/votes.js) with a fixed list of deciders, so one person never counts twice. When it passes the
//            asker gets a pass for that one capability in that one project for a day, or the proposed change is made.
//
// State: .tribe/groupstyle.json { tribe, projects: { <pid>: style }, permits: [] }.
// HTTP: GET /api/groupstyle · PUT /api/groupstyle · POST|PUT|DELETE /api/groupstyle/roles[/:id]
//       POST /api/groupstyle/ask { cap, note, change } · POST /api/groupstyle/reset (the computer's owner)
'use strict';

const STYLES = ['lead', 'council', 'open', 'custom'];
const RULES = ['one', 'second', 'council', 'all', 'lead'];
const NEED = ['majority', 'two', 'all'];
const TIE = ['fails', 'more-yes'];
const PERMIT_MS = 24 * 60 * 60_000;
const WORDS = {
  group: ['Company', 'Club', 'Studio', 'Class', 'Team', 'Collective', 'Family', 'Crew', 'Band', 'Lab'],
  lead: ['Lead', 'Captain', 'Director', 'Organizer', 'Teacher', 'Coach', 'Chair', 'Founder', 'CEO'],
  role: ['Role', 'Seat', 'Job', 'Hat'],
  checkin: ['Check-in', 'Standup', 'Meeting', 'Huddle', 'Roll call'],
};
const DEF_WORDS = { group: 'Company', lead: 'Lead', role: 'Role', checkin: 'Check-in' };
// Plain words for every row of the capability table (the "Who can do what here" page).
const PLAIN = {
  'chat.moderate': 'Delete someone else’s chat message', 'members.mute': 'Mute someone for a while', 'members.remove': 'Remove someone from a project',
  'members.invite': 'Invite people', 'roles.assign': 'Change someone’s role', 'roles.manage_admins': 'Make or unmake an admin',
  'tasks.triage': 'Move, assign and close any task', 'board.manage': 'Close any proposal', 'approvals.approve_low': 'Say yes to small, safe requests from AI helpers',
  'approvals.approve': 'Say yes to any request, including spending', 'files.delete': 'Delete someone else’s files', 'project.create': 'Start a project',
  'project.delete': 'Delete a project', 'settings.edit': 'Change project settings and the plan', 'widgets.edit': 'Change the sidebar',
  'repo.merge': 'Send work to the main copy', 'github.use_host': 'Put projects on the owner’s GitHub', 'ai.use_host_brain': 'Use the owner’s AI',
  'site.publish': 'Publish the website or app for everyone', 'group.decide': 'Change how this group decides, its roles and its words',
  'tribe.hosting': 'Sharing links and where the tribe runs', 'tribe.secrets': 'AI keys and sign-in secrets', 'tribe.launch': 'Run programs on the computer', 'tribe.owner': 'Back up, move or delete the tribe',
};
// What a council decides together, and what needs a second person when the group is open.
const COUNCIL_CAPS = ['approvals.approve', 'repo.merge', 'site.publish', 'roles.assign', 'settings.edit', 'group.decide', 'project.delete', 'files.delete', 'members.remove'];
const SECOND_CAPS = ['files.delete', 'project.delete', 'members.remove', 'roles.assign', 'group.decide'];
const OPEN_KEEP = ['roles.manage_admins', 'github.use_host'];   // stay with the host and admins even when the group is open
const LOW_RISK = ['tasks.triage', 'board.manage', 'widgets.edit', 'approvals.approve_low', 'chat.moderate', 'members.invite', 'project.create'];
const STYLE_TEXT = {
  lead: { name: 'One lead', line: 'One person has the final say. You choose what to call them.' },
  council: { name: 'A council', line: 'No single lead. Big things pass when enough of the council agree.' },
  open: { name: 'Open', line: 'Anyone building can do most things. Deleting and removing need a second person.' },
  custom: { name: 'Our own roles', line: 'You name the roles and tick what each one looks after.' },
};
const RULE_TEXT = { one: 'One person who can', second: 'One person, and a second person agrees', council: 'The council agrees', all: 'Everyone agrees', lead: 'The lead only' };

module.exports = function groupstyle({ P, store, perms, getMembers, votes, bus, postChat, broadcast, str, id, now = () => Date.now() }) {
  const FILE = '.tribe/groupstyle.json';
  const CAPS = perms.CAPS, CAP = Object.fromEntries(CAPS.map(c => [c.id, c])), RANK = perms.RANK;
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  let db = store.readJSON(FILE, null) || {};
  db.projects = db.projects && typeof db.projects === 'object' ? db.projects : {};
  db.permits = Array.isArray(db.permits) ? db.permits : [];
  const save = () => store.writeJSON(FILE, db);
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const word = (v, n = 24) => String(v == null ? '' : v).replace(/[<>&"'`\\\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : d);
  const isPerson = m => !!m && m.role !== 'agent' && m.role !== 'spectator' && !m.guestUntil && !m.guest;
  const humans = pid => getMembers().filter(m => isPerson(m) && (!pid || P.canSee(m, pid)) && perms.actingRole(m, pid) !== 'spectator');
  const openCap = c => !!CAP[c] && !CAP[c].locked;

  // ---------- the stored style, always clean ----------
  function clean(x) {
    x = x && typeof x === 'object' ? x : {};
    const style = STYLES.includes(x.style) ? x.style : 'lead';
    const w = x.words && typeof x.words === 'object' ? x.words : {};
    const words = Object.fromEntries(Object.keys(DEF_WORDS).map(k => [k, word(w[k]) || DEF_WORDS[k]]));
    const c = x.council && typeof x.council === 'object' ? x.council : {};
    const council = { members: [...new Set((Array.isArray(c.members) ? c.members : []).map(String))].slice(0, 50), need: NEED.includes(c.need) ? c.need : 'majority',
      hours: Math.min(24 * 14, Math.max(1, Math.round(Number(c.hours) || 48))), tie: TIE.includes(c.tie) ? c.tie : 'fails' };
    const rules = {};
    if (x.rules && typeof x.rules === 'object') for (const [k, v] of Object.entries(x.rules)) if (openCap(k) && RULES.includes(v)) rules[k] = v;
    const seen = new Set();
    const roles = (Array.isArray(x.roles) ? x.roles : []).slice(0, 24).map(r => {
      r = r && typeof r === 'object' ? r : {};
      let rid = /^[a-z0-9-]{1,24}$/.test(r.id || '') ? r.id : 'r' + id(5).toLowerCase(); while (seen.has(rid)) rid = 'r' + id(5).toLowerCase(); seen.add(rid);
      return { id: rid, name: word(r.name, 40) || 'New role', color: hex(r.color, '#6C7CFF'), purpose: word(r.purpose, 160),
        caps: [...new Set((Array.isArray(r.caps) ? r.caps : []).filter(openCap))],   // a host-only row can never be ticked
        members: [...new Set((Array.isArray(r.members) ? r.members : []).map(String))].slice(0, 100) };
    });
    return { style, words, council, aiVotes: x.aiVotes === true, rules, roles };
  }
  const stored = pid => (pid && db.projects[pid]) || db.tribe || null;
  const get = pid => clean(stored(pid));
  const untouched = pid => !stored(pid);

  // ---------- rules ----------
  function ruleFor(g, cap) {
    if (!openCap(cap)) return 'lead';
    if (g.style === 'council') return COUNCIL_CAPS.includes(cap) ? 'council' : 'one';
    if (g.style === 'open') return SECOND_CAPS.includes(cap) ? 'second' : 'one';
    if (g.style === 'custom') return g.rules[cap] || 'one';
    return 'one';
  }
  const councilOf = (g, pid) => { const all = humans(pid), pick = all.filter(m => g.council.members.includes(m.id)); return pick.length ? pick : all; };
  const inRole = (g, mid, cap) => g.roles.some(r => r.members.includes(mid) && r.caps.includes(cap));
  // Does this person HOLD the capability here (before any "needs agreement" rule)?
  function holds(g, m, cap, pid, base) {
    if (base) return true;
    if (!isPerson(m) || !openCap(cap)) return false;
    const r = perms.actingRole(m, pid); if (!r || r === 'spectator' || (pid && !P.canSee(m, pid))) return false;
    if (inRole(g, m.id, cap)) return true;
    if (g.style === 'open' && RANK[r] >= RANK.builder && !OPEN_KEEP.includes(cap)) return true;
    if (g.style === 'council' && cap !== 'roles.manage_admins' && councilOf(g, pid).some(x => x.id === m.id)) return true;
    return false;
  }
  const livePermits = () => { const t = now(), keep = db.permits.filter(p => p.until > t); if (keep.length !== db.permits.length) { db.permits = keep; save(); } return keep; };
  const hasPermit = (mid, cap, pid) => livePermits().some(p => p.member === mid && p.cap === cap && p.project === (pid || null));
  // perms.can() ends here. `base` is what the plain table says.
  function hook(m, cap, pid, base) {
    if (untouched(pid) && !db.permits.length) return base;   // existing tribes: exactly as before
    const g = get(pid), rule = ruleFor(g, cap);
    if (m.role === 'agent') return rule === 'one' ? base : false;   // a helper never decides what the group decides together
    if (rule === 'lead') return base && RANK[perms.actingRole(m, pid)] >= RANK.admin;
    if (rule === 'one') return holds(g, m, cap, pid, base) || hasPermit(m.id, cap, pid);
    if (!isPerson(m)) return false;
    return hasPermit(m.id, cap, pid);
  }
  const styleOf = pid => { const g = get(pid); return { style: g.style, words: g.words, need: g.council.need }; };

  // ---------- who can do what here ----------
  function who(pid, me) {
    const g = get(pid), ppl = humans(pid);
    const rows = CAPS.map(c => {
      const rule = c.locked ? 'owner' : ruleFor(g, c.id);
      const holders = c.locked ? getMembers().filter(m => m.role === 'host') : ppl.filter(m => holds(g, m, c.id, pid, perms.allowed(c.id, perms.actingRole(m, pid))) && (rule !== 'lead' || RANK[perms.actingRole(m, pid)] >= RANK.admin));
      const deciders = rule === 'council' ? councilOf(g, pid) : rule === 'all' ? ppl : holders;
      return { id: c.id, group: c.group, label: PLAIN[c.id] || c.label, locked: !!c.locked, rule, ruleText: c.locked ? 'Only the computer’s owner' : RULE_TEXT[rule],
        people: deciders.map(m => ({ id: m.id, name: m.name, color: m.color })), me: !!me && perms.can(me, c.id, pid), alone: rule === 'one' || rule === 'lead' || rule === 'owner' };
    });
    // Things the capability table doesn't gate today (see docs/ROLES-AND-PERMISSIONS.md).
    const every = ['Edit the website and its design', 'Write code and files in the project folder', 'Vote on proposals and chat votes', 'Ask for something to be decided'];
    return { rows, everyone: every.map(label => ({ label, ruleText: 'Anyone building here (not people who only watch)' })) };
  }
  function view(pid, me) {
    const g = get(pid);
    const mine = me ? livePermits().filter(p => p.member === me.id && p.project === (pid || null)).map(p => ({ cap: p.cap, label: PLAIN[p.cap] || p.cap, until: new Date(p.until).toISOString() })) : [];
    return { ...g, project: pid || null, isDefault: untouched(pid), council: { ...g.council, people: councilOf(g, pid).map(m => ({ id: m.id, name: m.name, color: m.color })) },
      styles: STYLES.map(s => ({ id: s, ...STYLE_TEXT[s] })), wordChoices: WORDS, defaults: DEF_WORDS, ruleChoices: RULES.map(r => ({ id: r, text: RULE_TEXT[r] })),
      caps: CAPS.filter(c => !c.locked).map(c => ({ id: c.id, label: PLAIN[c.id] || c.label, rule: ruleFor(g, c.id), low: LOW_RISK.includes(c.id) })),
      people: humans(pid).map(m => ({ id: m.id, name: m.name, color: m.color })),
      who: who(pid, me), permits: mine, can: { decide: !!me && perms.can(me, 'group.decide', pid), reset: !!me && me.role === 'host' } };
  }

  // ---------- changing it ----------
  // Only fields that are present change. Returns the cleaned style (not yet saved).
  function merged(pid, body) {
    const cur = get(pid), b = body && typeof body === 'object' ? body : {}, next = { ...cur };
    if (b.style !== undefined) { if (!STYLES.includes(b.style)) throw err(400, 'pick one lead, a council, open or your own roles'); next.style = b.style; }
    if (b.words && typeof b.words === 'object') next.words = { ...cur.words, ...b.words };
    if (b.council && typeof b.council === 'object') next.council = { ...cur.council, ...b.council };
    if (typeof b.aiVotes === 'boolean') next.aiVotes = b.aiVotes;
    if (b.rules && typeof b.rules === 'object') next.rules = { ...cur.rules, ...b.rules };
    if (Array.isArray(b.roles)) next.roles = b.roles;
    const out = clean(next), ok = new Set(humans(pid).map(m => m.id)), anyone = new Set(getMembers().map(m => m.id));
    out.council.members = out.council.members.filter(x => ok.has(x));          // people only, in this project
    out.roles.forEach(r => { r.members = r.members.filter(x => anyone.has(x)); });
    return out;
  }
  function apply(pid, g, by, how) {
    if (pid) db.projects[pid] = g; else db.tribe = g;
    save();
    perms.audit(by, 'group.style', null, { style: g.style, how: how || 'changed', project: pid || null });
    broadcast({ type: 'groupstyle', project: pid || null });
    return g;
  }
  function set(pid, me, body) {
    if (!me || me.role === 'agent') throw err(403, 'a person changes how the group decides');
    if (!perms.can(me, 'group.decide', pid)) throw err(403, 'changing how this group decides needs agreement here');
    return apply(pid, merged(pid, body), me);
  }
  function reset(pid, me) {
    if (!me || me.role !== 'host') throw err(403, 'only the computer’s owner can reset how the group decides');
    if (pid) delete db.projects[pid]; else delete db.tribe;
    db.permits = db.permits.filter(p => p.project !== (pid || null)); save();
    perms.audit(me, 'group.style', null, { style: 'lead', how: 'reset', project: pid || null });
    broadcast({ type: 'groupstyle', project: pid || null });
    return get(pid);
  }

  // ---------- Ask them ----------
  function deciders(g, me, cap, pid) {
    const rule = ruleFor(g, cap), ppl = humans(pid);
    if (rule === 'council') return { rule, list: councilOf(g, pid), need: g.council.need };
    if (rule === 'all') return { rule, list: ppl, need: 'all' };
    const holders = ppl.filter(m => m.id !== me.id && holds(g, m, cap, pid, perms.allowed(cap, perms.actingRole(m, pid))) && (rule !== 'lead' || RANK[perms.actingRole(m, pid)] >= RANK.admin));
    if (rule === 'second' && holds(g, me, cap, pid, perms.allowed(cap, perms.actingRole(me, pid)))) return { rule, list: ppl.filter(m => m.id !== me.id), need: 'one' };
    return { rule, list: holders, need: 'one' };
  }
  function ask(pid, me, body) {
    const b = body && typeof body === 'object' ? body : {};
    if (!me || me.role === 'agent') throw err(403, 'AI helpers ask through approvals; a person asks here');
    if (!isPerson(me) || (pid && !P.canSee(me, pid)) || perms.actingRole(me, pid) === 'spectator') throw err(403, 'people who only watch can’t ask for this');
    const cap = b.change ? 'group.decide' : String(b.cap || '');
    if (!CAP[cap]) throw err(400, 'unknown thing to ask for');
    if (CAP[cap].locked) throw err(403, 'only the computer’s owner can do that; it can’t be handed out');
    const g = get(pid);
    const change = b.change ? merged(pid, b.change) : null;   // checked now, so a passed vote can't carry anything unclean
    if (!change && perms.can(me, cap, pid)) throw err(409, 'you can already do this');
    const d = deciders(g, me, cap, pid);
    if (!d.list.length) throw err(409, 'Nobody else here can decide this yet. Invite someone, or ask the computer’s owner.');
    const ch = P.channelOf(pid || P.defaultId());
    const dup = P.inProject(pid || P.defaultId(), () => votes.list(ch, 80)).find(v => v.status === 'open' && v.council && v.council.ask && v.council.ask.by === me.id && v.council.ask.cap === cap);
    if (dup) throw err(409, 'you already asked; it is waiting for an answer');
    const what = change ? `change how this group decides to “${STYLE_TEXT[change.style].name}”` : (PLAIN[cap] || cap).replace(/^./, c => c.toLowerCase());
    const note = str(b.note, 300);
    const q = `${me.name} asks to ${what}${note ? `: ${note}` : ''}`.slice(0, 200);
    const ai = g.aiVotes && !change && LOW_RISK.includes(cap);
    const msg = P.inProject(pid || P.defaultId(), () => votes.create(ch, me, { question: q, minutes: g.council.hours * 60 }, {
      electorate: d.list.map(m => m.id), need: d.need, tie: d.rule === 'council' ? g.council.tie : 'fails', ai, rule: d.rule, ask: { by: me.id, cap, project: pid || null, change } }));
    if (bus) bus.notify({ type: 'ask', priority: 'normal', to: d.list.map(m => m.id).filter(x => x !== me.id), from: me.id, title: `${me.name} is asking`, body: q, view: 'chat', ref: msg.id, project: pid || undefined });
    return { message: msg, deciders: d.list.map(m => m.name), need: d.need, rule: d.rule };
  }
  // votes.js calls this when a vote with a fixed list of deciders closes.
  function decided(m) {
    const c = m && m.vote && m.vote.council, a = c && c.ask; if (!a || m.vote.status !== 'passed') return;
    const who2 = member(a.by); if (!who2 || !isPerson(who2)) return;
    const pid = a.project || null;
    if (a.change) { apply(pid, merged(pid, a.change), who2, 'vote ' + m.id); return; }
    if (!openCap(a.cap)) return;
    db.permits = livePermits().filter(p => !(p.member === a.by && p.cap === a.cap && p.project === pid));
    db.permits.push({ id: 'pm' + id(6), member: a.by, cap: a.cap, project: pid, until: now() + PERMIT_MS, vote: m.id }); save();
    perms.audit(who2, 'group.permit', who2, { cap: a.cap, vote: m.id, project: pid });
    if (bus) bus.notify({ type: 'ask', priority: 'normal', to: [a.by], from: 'tribecode', title: 'They said yes', body: `You can ${(PLAIN[a.cap] || a.cap).replace(/^./, x => x.toLowerCase())} for the next day.`, view: 'chat', ref: m.id, project: pid || undefined });
    broadcast({ type: 'groupstyle', project: pid });
  }
  // For a refusal: who could do it, so the app can offer "Ask them".
  function need(me, cap, pid) {
    if (!me || !CAP[cap]) return null;
    if (CAP[cap].locked) return { cap, label: PLAIN[cap] || cap, locked: true, who: getMembers().filter(m => m.role === 'host').map(m => m.name), rule: 'owner', ask: false };
    const g = get(pid), d = me.role === 'agent' ? { rule: ruleFor(g, cap), list: [] } : deciders(g, me, cap, pid);
    return { cap, label: PLAIN[cap] || cap, rule: d.rule, ruleText: RULE_TEXT[d.rule], who: d.list.map(m => m.name).slice(0, 8), ask: me.role !== 'agent' && isPerson(me) && d.list.length > 0 };
  }

  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    const pid = P.current() || null;
    try {
      if (!b && m === 'GET') return send(res, 200, view(pid, me));
      if (me.role === 'agent') return fail(res, 403, 'a person changes how the group decides');
      if (!b && m === 'PUT') { const body = await readBody(req, 64 * 1024); set(pid, me, body); return send(res, 200, view(pid, me)); }
      if (b === 'reset' && m === 'POST') { reset(pid, me); return send(res, 200, view(pid, me)); }
      if (b === 'ask' && m === 'POST') { const out = ask(pid, me, await readBody(req, 64 * 1024)); return send(res, 200, { ok: true, vote: out.message.id, channel: P.channelOf(pid || P.defaultId()), deciders: out.deciders, need: out.need, rule: out.rule }); }
      if (b === 'roles') {
        if (!perms.can(me, 'group.decide', pid)) return fail(res, 403, 'changing roles needs agreement here');
        const g = get(pid), body = m === 'DELETE' ? {} : await readBody(req, 16 * 1024);
        if (m === 'POST' && !c) { if (g.roles.length >= 24) return fail(res, 400, 'up to 24 roles'); if (!word(body.name, 40)) return fail(res, 400, 'give the role a name'); set(pid, me, { roles: [...g.roles, { ...body, id: undefined }] }); return send(res, 200, view(pid, me)); }
        const i = g.roles.findIndex(r => r.id === c); if (i < 0) return fail(res, 404, 'role not found');
        if (m === 'PUT') { g.roles[i] = { ...g.roles[i], ...body, id: g.roles[i].id }; set(pid, me, { roles: g.roles }); return send(res, 200, view(pid, me)); }
        if (m === 'DELETE') { g.roles.splice(i, 1); set(pid, me, { roles: g.roles }); return send(res, 200, view(pid, me)); }
      }
    } catch (e) { if (e.status) return fail(res, e.status, e.message); throw e; }
    return null;
  }

  return { get, view, who, hook, styleOf, set, reset, ask, decided, need, route, ruleFor: (pid, cap) => ruleFor(get(pid), cap), PLAIN, STYLES, WORDS, DEF_WORDS };
};
