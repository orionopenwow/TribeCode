// v0.27 Company mode, the work side (Agent C "talent"): find vibecoding work, hire people into a tribe, trade time,
// share compute. TribeCode has no central server: every tribe keeps its own gigs, profiles and time bank here, and the
// only public part is opt-in: a gig the poster chooses to share goes to the community GitHub repository the Workshop
// already uses (server/workshop.js: same repo, same jsDelivr read path, same fork -> pull request flow). There is no
// global marketplace; the "Public" tab reads whatever the community repository holds, and says so when it's empty.
//
// Storage (tribe-wide, under .tribe/talent/):
//   profiles.json  { <memberId>: { skills, roles, hours, rate: { type, text }, tz, links: [{label,url}], projects, open } }
//   gigs.json      [ { id, title, kind: seat|task|bounty, seat?, seatKind?, project?, description, skills, hours,
//                      pay: { type: free|time|paid, text }, status: draft|open|filled|closed, applicants: [...], by, at } ]
//   timebank.json  [ { id, from, to, hours, note, task?, at, by, ok: { from, to }, status: proposed|confirmed|declined } ]
//   compute.json   { offers: [ { id, member, what, hoursPerWeek, rules, on, at } ], requests: [ { id, offer, by, hours, note, status, approval, used, at } ] }
//   public/<id>.json  ready-to-upload public gig bundles (opt-in; the poster picks a public contact)
// Money: none. "paid" is a text the poster writes; TribeCode processes no payments. The time bank counts hours only.
// Compute: each person's AI subscription is their own. An offer is a promise to help, a request becomes an approval to
// the person who offered; nothing ever routes someone's work through another person's Claude login automatically.
//
// HTTP (all under /api/talent)
//   GET  /                                   { me: profile, gigs, people, seatKinds, ... } summary for the Work view
//   GET  /profile[/<memberId>]   PUT /profile { skills, roles, hours, rate, tz, links, projects, open }
//   GET  /people[?skills=&seat=]             members open to work
//   GET  /gigs   POST /gigs   PATCH|DELETE /gigs/:id   POST /gigs/:id/apply { note } | { name, contact, note }
//   POST /gigs/:id/hire { applicant }        member -> seat + DM; outside person -> project invite, seat on join
//   POST /gigs/:id/share { contact, pr? }    public bundle + GitHub links (+ PR with the poster's saved token)
//   GET  /public[?refresh=1]                 community gigs (read-only, jsDelivr)
//   GET  /timebank  POST /timebank { from, to, hours, note, task? }  POST /timebank/:id/confirm | /decline
//   GET  /compute   PUT /compute/offers { id?, what, hoursPerWeek, rules, on }  DELETE /compute/offers/:id
//   POST /compute/request { offer, hours, note }   POST /compute/requests/:id/used { hours }
'use strict';
const fs = require('node:fs');

const SEAT_COLORS = { ceo: '#F26B1D', cto: '#38C6B1', design: '#E86A92', growth: '#FABD2F', sales: '#6C7CFF', support: '#3BD16F', ops: '#94A3B8', finance: '#2DD4BF', legal: '#A78BFA', custom: '#9AA7B8' };
const SEAT_TITLES = { ceo: 'CEO', cto: 'Build', design: 'Design', growth: 'Grow', sales: 'Sales', support: 'Support', ops: 'Run', finance: 'Finance', legal: 'Legal', custom: 'Custom' };
const SEAT_KINDS = Object.keys(SEAT_COLORS);
const KINDS = ['seat', 'task', 'bounty'];
const PAY = ['free', 'time', 'paid'];
const WHAT = ['claude-code', 'local-model', 'gpu', 'other'];
const STATUSES = ['draft', 'open', 'filled', 'closed'];
const GID = /^g-[a-z0-9]{4,24}$/;
const err = (status, msg) => Object.assign(new Error(msg), { status });

function clean(v, max, lines = 1) {
  if (typeof v !== 'string') return '';
  let s = v.replace(/\r/g, '').replace(/[\u0000-\u0008\u000B-\u001F\u007F‪-‮⁦-⁩]/g, '');
  s = lines > 1 ? s.split('\n').slice(0, lines).join('\n') : s.replace(/\n/g, ' ');
  return s.trim().slice(0, max);
}
function url(u) { const s = clean(u, 300); if (!s) return null; try { const x = new URL(s); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null; } catch { return null; } }
function tzOk(tz) { if (typeof tz !== 'string' || !tz || tz.length > 64) return false; try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }
const skillList = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map(x => clean(String(x), 24).toLowerCase()).filter(Boolean))].slice(0, 12);
const hoursOf = (v, max = 168) => { const n = Math.round(Number(v) * 4) / 4; return isFinite(n) && n > 0 ? Math.min(max, n) : 0; };
function payOf(p) { const type = PAY.includes(p && p.type) ? p.type : 'free'; return { type, text: clean((p && p.text) || '', 80) }; }
// A public contact: a web or mailto link, or a short handle ("@sam on Discord"). Never filled in for the poster.
function contactOf(v) {
  const s = clean(v, 120); if (!s) return '';
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(s) || /^https?:\/\//i.test(s)) return url(s) || (/^mailto:/i.test(s) ? s : '');
  return s;
}

module.exports = function talent({ P, base, id, getMembers, nameOf, postChat, broadcast, bus, dms, approvals, askai, workshop, perms, makeInvite, linkFor, joinProject, tribeName = () => 'tribe', now = () => Date.now() }) {
  const F = { profiles: '.tribe/talent/profiles.json', gigs: '.tribe/talent/gigs.json', bank: '.tribe/talent/timebank.json', compute: '.tribe/talent/compute.json' };
  fs.mkdirSync(base.p('.tribe', 'talent', 'public'), { recursive: true });
  const read = (k, d) => { const v = base.readJSON(F[k], d); return v && typeof v === 'object' ? v : d; };
  const write = (k, v) => base.writeJSON(F[k], v);
  const iso = () => new Date(now()).toISOString();
  const nid = p => `${p}-${now().toString(36)}${id(4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
  const member = mid => getMembers().find(m => m.id === mid);
  const human = m => !!m && m.role !== 'agent' && m.role !== 'spectator';
  const ownerOf = me => (me && me.role === 'agent' && me.owner ? member(me.owner) : me);
  const isBoss = me => !!me && (me.role === 'host' || (perms && perms.atLeast && perms.atLeast(me, 'admin')));
  const projHost = (me, pid) => !!me && !!pid && ((P.get(pid) || {}).members || {})[me.id] === 'host';
  const canManageGig = (me, g) => !!me && me.role !== 'agent' && (g.by === me.id || isBoss(me) || projHost(me, g.project));
  const seesGig = (me, g) => !g.project || P.canSee(me, g.project);
  const changed = what => broadcast({ type: 'talent', what });
  const first = n => String(n || 'someone').split(/\s+/)[0];
  const notify = (to, from, title, body, extra) => { try { bus.notify({ type: 'talent', to: [to], from, title: clean(title, 160), body: clean(body || '', 280), view: 'work', ...(extra || {}) }); } catch {} };
  function dm(from, to, text) {
    if (!dms || !member(from) || !member(to) || from === to) return;
    try { postChat(dms.nameFor(from, to), from, text); } catch {}
  }

  // ---------- company.json (Agent A owns it; a tiny local helper until server/company.js merges) ----------
  const companyRel = pid => `projects/${String(pid).replace(/[^a-z0-9-]/gi, '')}/company.json`;
  const readCompany = pid => (P.get(pid) ? base.readJSON(companyRel(pid), null) : null);
  function assignSeat(pid, seatId, seatKind, mid) {
    const co = readCompany(pid); if (!co || !Array.isArray(co.seats)) return null;
    let seat = seatId && co.seats.find(s => s && s.id === seatId);
    if (!seat && seatKind) seat = co.seats.find(s => s && s.kind === seatKind && !(s.holder && s.holder.person));
    if (!seat && seatKind && SEAT_KINDS.includes(seatKind)) {
      let sid = seatKind, n = 2; while (co.seats.some(s => s.id === sid)) sid = `${seatKind}-${n++}`;
      seat = { id: sid, kind: seatKind, title: SEAT_TITLES[seatKind], color: SEAT_COLORS[seatKind], holder: { person: null, agent: null }, charter: { goal: '', owns: [], mayDo: [], needsApproval: ['publish', 'spend', 'email customers'], budgetWeekly: 0, done: '' }, status: 'idle', last: null };
      co.seats.push(seat);
    }
    if (!seat) return null;
    seat.holder = { ...(seat.holder || {}), person: mid, agent: (seat.holder && seat.holder.agent) || null };
    seat.last = { text: `${nameOf(mid)} took this seat`, at: iso() };
    co.updated = iso();
    base.writeJSON(companyRel(pid), co);
    broadcast({ type: 'company', project: pid });
    return { id: seat.id, kind: seat.kind, title: seat.title, color: seat.color };
  }
  function seatInfo(pid, seatId) {
    const co = pid && readCompany(pid); const s = co && Array.isArray(co.seats) && co.seats.find(x => x && x.id === seatId);
    return s ? { id: s.id, kind: s.kind, title: s.title, color: s.color || SEAT_COLORS[s.kind] || SEAT_COLORS.custom, taken: !!(s.holder && s.holder.person) } : null;
  }

  // ---------- profiles ----------
  function profileOf(mid) {
    const p = (read('profiles', {})[mid]) || {};
    return { skills: p.skills || [], roles: p.roles || [], hours: p.hours || 0, rate: p.rate || { type: 'free', text: '' }, tz: p.tz || null, links: p.links || [], projects: (p.projects || []).filter(x => P.get(x)), open: !!p.open, updated: p.updated || null };
  }
  function setProfile(mid, b) {
    const all = read('profiles', {}), p = { ...(all[mid] || {}) };
    if ('skills' in b) p.skills = skillList(b.skills);
    if ('roles' in b) p.roles = (Array.isArray(b.roles) ? b.roles : []).filter(r => SEAT_KINDS.includes(r)).slice(0, SEAT_KINDS.length);
    if ('hours' in b) p.hours = hoursOf(b.hours, 80);
    if ('rate' in b) p.rate = payOf(b.rate);
    if ('tz' in b) { if (!b.tz) delete p.tz; else if (tzOk(b.tz)) p.tz = b.tz; else throw err(400, 'unknown time zone'); }
    if ('links' in b) p.links = (Array.isArray(b.links) ? b.links : []).map(l => ({ label: clean((l && l.label) || '', 40), url: url(l && (l.url || l)) })).filter(l => l.url).slice(0, 5);
    if ('projects' in b) p.projects = (Array.isArray(b.projects) ? b.projects : []).filter(x => typeof x === 'string' && P.get(x) && P.canSee(member(mid), x)).slice(0, 8);
    if ('open' in b) p.open = !!b.open;
    p.updated = iso(); all[mid] = p; write('profiles', all); changed('people');
    return profileOf(mid);
  }
  function personView(m, viewer) {
    const p = profileOf(m.id), b = bankBalances()[m.id] || { given: 0, received: 0 };
    return { id: m.id, name: m.name, color: m.color, ...p, projects: p.projects.filter(x => P.canSee(viewer, x)).map(x => ({ id: x, name: (P.get(x) || {}).name })), balance: Math.round((b.given - b.received) * 100) / 100 };
  }
  function people(viewer, { skills, seat } = {}) {
    const want = skillList(skills || []);
    const visible = new Set(getMembers().filter(m => human(m) && (!P.scoped(viewer) || !P.scoped(m) || m.projects.some(x => P.canSee(viewer, x)))).map(m => m.id));
    return getMembers().filter(m => visible.has(m.id) && profileOf(m.id).open)
      .map(m => personView(m, viewer))
      .filter(p => (!seat || p.roles.includes(seat)) && (!want.length || want.some(s => p.skills.includes(s))))
      .sort((a, b) => (want.length ? want.filter(s => b.skills.includes(s)).length - want.filter(s => a.skills.includes(s)).length : 0) || String(b.updated).localeCompare(String(a.updated)));
  }

  // ---------- gigs ----------
  const gigs = () => { const g = read('gigs', []); return Array.isArray(g) ? g : []; };
  const saveGigs = l => write('gigs', l.slice(-500));
  function syncDrafts(list) {   // drafts by agents become open once a person approves them
    let dirty = false;
    for (const g of list) {
      if (g.status !== 'draft' || !g.approval || !approvals) continue;
      const a = approvals.get(g.approval); if (!a || a.status === 'pending') continue;
      g.status = a.status === 'approved' ? 'open' : 'closed'; dirty = true;
    }
    if (dirty) saveGigs(list);
    return list;
  }
  function gigView(g, me) {
    const mgr = canManageGig(me, g);
    const apps = (g.applicants || []).map(a => (mgr || a.member === me.id ? { ...a, name: a.member ? nameOf(a.member) : a.name } : null)).filter(Boolean);
    return { ...g, applicants: apps, applicantCount: (g.applicants || []).length, applied: (g.applicants || []).some(a => a.member === me.id), canManage: mgr,
      byName: nameOf(g.by), projectName: g.project ? (P.get(g.project) || {}).name || null : null,
      seatInfo: g.seat ? seatInfo(g.project, g.seat) : null, color: (g.seat && (seatInfo(g.project, g.seat) || {}).color) || SEAT_COLORS[g.seatKind] || null };
  }
  function listGigs(me) { return syncDrafts(gigs()).filter(g => seesGig(me, g) && (g.status !== 'draft' || canManageGig(me, g) || g.by === me.id || (member(g.by) || {}).owner === me.id)).map(g => gigView(g, me)); }
  function cleanGig(b, me, prev) {
    const g = { ...(prev || {}) };
    if (!prev || 'title' in b) { g.title = clean(b.title, 100); if (!g.title) throw err(400, 'give the gig a title'); }
    if (!prev || 'kind' in b) g.kind = KINDS.includes(b.kind) ? b.kind : 'task';
    if (!prev || 'project' in b) { const pid = b.project ? String(b.project) : null; if (pid && (!P.get(pid) || !P.canSee(me, pid))) throw err(400, 'not a project you can see'); g.project = pid || null; }
    if (!prev || 'seat' in b || 'seatKind' in b) {
      g.seat = typeof b.seat === 'string' && /^[a-z0-9-]{1,40}$/.test(b.seat) ? b.seat : null;
      g.seatKind = SEAT_KINDS.includes(b.seatKind) ? b.seatKind : (g.seat && (seatInfo(g.project, g.seat) || {}).kind) || null;
      if (g.kind !== 'seat') { g.seat = null; }
    }
    if (g.kind === 'seat' && !g.project) throw err(400, 'a seat belongs to a company project: pick the project');
    if (!prev || 'description' in b) g.description = clean(b.description || '', 2000, 40);
    if (!prev || 'skills' in b) g.skills = skillList(b.skills || []);
    if (!prev || 'hours' in b) g.hours = hoursOf(b.hours, 168);
    if (!prev || 'pay' in b) g.pay = payOf(b.pay);
    if (prev && 'status' in b) { if (!STATUSES.includes(b.status) || b.status === 'draft') throw err(400, 'status must be open, filled or closed'); g.status = b.status; }
    return g;
  }
  function postGig(b, me) {
    if (!me || me.role === 'spectator') throw err(403, 'spectators can\'t post gigs');
    const g = cleanGig(b, me, null);
    if (g.kind === 'seat' && me.role !== 'agent' && !(isBoss(me) || projHost(me, g.project) || (perms && perms.can(me, 'members.invite', g.project)))) throw err(403, 'only people who can invite to this project post seats');
    Object.assign(g, { id: nid('g'), status: 'open', applicants: [], by: me.id, at: iso() });
    if (me.role === 'agent') {   // agents draft; a person approves before anyone sees it
      g.status = 'draft';
      if (approvals) { try { const a = approvals.create({ title: `Post the gig "${g.title}"?`, details: `${g.description || ''}\n\nKind: ${g.kind}${g.seatKind ? ` (${g.seatKind})` : ''} · pay: ${g.pay.type}${g.pay.text ? ` (${g.pay.text})` : ''} · ${g.hours || '?'} h`, risk: 'medium', kind: 'gig-post' }, me); g.approval = a.id; if (a.status === 'approved') g.status = 'open'; } catch {} }
    }
    const list = gigs(); list.push(g); saveGigs(list); changed('gigs');
    if (g.status === 'open') try { P.inProject(g.project || P.defaultId(), () => postChat('general', 'tribecode', `🧰 New ${g.kind === 'seat' ? 'seat' : g.kind} on Work: **${g.title}**${g.pay.type === 'paid' ? ' · paid' : g.pay.type === 'time' ? ' · time exchange' : ''}`)); } catch {}
    return gigView(g, me);
  }
  const findGig = (gid, me) => { if (!GID.test(String(gid))) throw err(404, 'no such gig'); const list = syncDrafts(gigs()); const g = list.find(x => x.id === gid); if (!g || !seesGig(me, g)) throw err(404, 'no such gig'); return { list, g }; };
  function apply(gid, b, me) {
    const { list, g } = findGig(gid, me);
    if (g.status !== 'open') throw err(409, 'this gig is not open');
    const note = clean(b.note || '', 600, 10);
    let a;
    if (b.name) {   // someone outside the tribe: the poster (or a manager) adds them, e.g. after a public post
      const who = ownerOf(me);
      if (!canManageGig(who, g)) throw err(403, 'only the poster adds people from outside');
      const name = clean(b.name, 40), contact = clean(b.contact || '', 120); if (!name) throw err(400, 'name required');
      a = { id: nid('a'), name, contact, note, at: iso(), status: 'applied', addedBy: me.id };
    } else {
      if (!human(me)) throw err(403, 'only people apply (your agent can point you here)');
      if (g.by === me.id) throw err(400, 'that\'s your own gig');
      if ((g.applicants || []).some(x => x.member === me.id)) throw err(409, 'you already applied');
      a = { id: nid('a'), member: me.id, note, at: iso(), status: 'applied' };
      notify(g.by, me.id, `${me.name} applied to "${g.title}"`, note || 'Open Work to see their profile.', { ref: g.id });
      dm(me.id, g.by, `🙋 I'd like to help with **${g.title}**${note ? `: ${note}` : ''}`);
    }
    g.applicants = [...(g.applicants || []), a].slice(-100); saveGigs(list); changed('gigs');
    return gigView(g, me);
  }
  function hire(gid, b, me) {
    const { list, g } = findGig(gid, me);
    if (!canManageGig(me, g)) throw err(403, 'only the poster or a project host hires');
    if (g.status !== 'open') throw err(409, 'this gig is not open');
    const a = (g.applicants || []).find(x => x.id === b.applicant || (b.member && x.member === b.member));
    let target = a;
    if (!target && b.member && member(b.member) && human(member(b.member))) { target = { id: nid('a'), member: b.member, note: '', at: iso(), status: 'applied', direct: true }; g.applicants = [...(g.applicants || []), target]; }
    if (!target) throw err(404, 'pick someone who applied');
    const out = { gig: null };
    if (target.member) {
      if (g.project) joinProject(target.member, g.project);
      out.seat = g.kind === 'seat' && g.project ? assignSeat(g.project, g.seat, g.seatKind, target.member) : null;
      target.status = 'hired'; target.hiredAt = iso(); g.status = 'filled'; g.filledBy = target.member;
      const where = out.seat ? `the ${out.seat.title} seat in ${(P.get(g.project) || {}).name}` : `"${g.title}"`;
      dm(me.id, target.member, `🎉 You're in: ${where}. Welcome aboard!`);
      notify(target.member, me.id, `${me.name} hired you`, `For ${where}.`, { ref: g.id });
    } else {
      if (!g.project) throw err(400, 'pick the project this person joins first (edit the gig)');
      if (!(isBoss(me) || projHost(me, g.project) || (perms && perms.can(me, 'members.invite', g.project)))) throw err(403, 'your role can\'t invite people');
      const inv = makeInvite({ by: me.id, project: g.project, hours: 24 * 14, maxUses: 1 });
      inv.talent = { gig: g.id, applicant: target.id, seat: g.seat || null, seatKind: g.seatKind || null };
      const l = linkFor(inv.code);
      target.status = 'invited'; target.invite = inv.code; target.invitedAt = iso();
      out.invite = { code: inv.code, link: l.link, kind: l.kind, expires: inv.expires };
    }
    saveGigs(list); changed('gigs');
    out.gig = gigView(g, me);
    return out;
  }
  // An outside hire opened their invite: they're a member now, so give them the seat and say hello.
  function onJoin(inv, mem) {
    if (!inv || !inv.talent || !mem) return;
    const list = gigs(), g = list.find(x => x.id === inv.talent.gig); if (!g) return;
    const a = (g.applicants || []).find(x => x.id === inv.talent.applicant);
    if (a) { a.status = 'hired'; a.member = mem.id; a.hiredAt = iso(); }
    const seat = g.kind === 'seat' && g.project ? assignSeat(g.project, inv.talent.seat, inv.talent.seatKind, mem.id) : null;
    g.status = 'filled'; g.filledBy = mem.id; saveGigs(list); changed('gigs');
    const where = seat ? `the ${seat.title} seat` : `"${g.title}"`;
    dm(g.by, mem.id, `👋 Welcome, ${first(mem.name)}! You're hired for ${where}. Say hi in the project chat when you're ready.`);
    notify(g.by, mem.id, `${mem.name} joined for ${where}`, g.title, { ref: g.id });
  }
  function patchGig(gid, b, me) {
    const { list, g } = findGig(gid, me);
    if (!canManageGig(me, g)) throw err(403, 'only the poster or a project host changes this gig');
    Object.assign(g, cleanGig(b, me, g), { updated: iso() });
    saveGigs(list); changed('gigs'); return gigView(g, me);
  }
  function removeGig(gid, me) {
    const { list, g } = findGig(gid, me);
    if (!canManageGig(me, g)) throw err(403, 'only the poster or a project host removes this gig');
    saveGigs(list.filter(x => x !== g)); changed('gigs'); return { ok: true };
  }

  // ---------- public board (opt-in, the Workshop's community repository) ----------
  const publicId = g => `${String(tribeName() || 'tribe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'tribe'}-${g.id.slice(2)}`;
  async function share(gid, b, me) {
    const { g } = findGig(gid, me);
    if (!canManageGig(me, g) || !human(me)) throw err(403, 'only the poster shares a gig publicly');
    if (g.status !== 'open') throw err(409, 'only open gigs can be shared');
    const contact = contactOf(b.contact);
    if (!contact) throw err(400, 'pick a public way to reach you (a link, an email or a handle). Nothing personal is added for you.');
    if (!workshop || !workshop.repo) throw err(503, 'the community shelf is not available');
    const pub = { schema: 1, id: publicId(g), title: g.title, kind: g.kind, seatKind: g.seatKind || undefined, description: g.description, skills: g.skills, hours: g.hours || undefined,
      pay: g.pay, contact, tribe: clean(String(tribeName() || ''), 40) || undefined, posted: iso().slice(0, 10) };
    const r = workshop.repo(), rel = `gigs/${pub.id}.json`, text = JSON.stringify(pub, null, 2) + '\n';
    base.writeJSON(`.tribe/talent/public/${pub.id}.json`, pub);
    const links = { repo: `https://github.com/${r}`, file: `https://github.com/${r}/new/main?filename=${encodeURIComponent(rel)}&value=${encodeURIComponent(text)}` };
    const out = { bundle: pub, path: rel, repo: r, links,
      instructions: [`Share "${g.title}" on the community board (${r}):`, `1. Open ${links.file}`, '   GitHub offers to fork the repository for you if you can\'t push to it.', '2. Choose "Create a new branch and start a pull request", then Propose changes.', 'Once merged, it shows in every tribe\'s Work › Public tab. Remove it any time with another pull request.'].join('\n') };
    if (b.pr) out.pr = await workshop.prFiles({ r, me, branch: `gigs/${pub.id}`, message: `Gig: ${g.title}`, title: `Gig: ${g.title}`, body: `${g.description || ''}\n\n- kind: ${g.kind}\n- pay: ${g.pay.type}\n\nShared from a TribeCode tribe's Work board.`, files: [{ rel, buf: Buffer.from(text) }] });
    const list = gigs(), gg = list.find(x => x.id === g.id); if (gg) { gg.shared = { id: pub.id, at: iso() }; saveGigs(list); }
    return out;
  }
  let pubCache = null;
  async function publicGigs(refresh) {
    if (!workshop || !workshop.repo) return { available: false, gigs: [], reason: 'missing' };
    const r = workshop.repo();
    if (!refresh && pubCache && pubCache.repo === r && now() - pubCache.at < 5 * 60_000) return pubCache.data;
    let data;
    try {
      const raw = await workshop.fetchCapped(workshop.cdnUrl(r, 'gigs/index.json'), 2 * 1024 * 1024, { timeout: 12000 });
      let idx; try { idx = JSON.parse(raw.toString('utf8')); } catch { throw err(502, 'gigs/index.json is not valid JSON'); }
      const out = [];
      for (const e of (Array.isArray(idx.gigs) ? idx.gigs : []).slice(0, 500)) {
        if (!e || typeof e !== 'object') continue;
        const title = clean(e.title, 100), pid = clean(String(e.id || ''), 64);
        if (!title || !/^[a-z0-9-]{3,64}$/.test(pid)) continue;
        out.push({ id: pid, title, kind: KINDS.includes(e.kind) ? e.kind : 'task', seatKind: SEAT_KINDS.includes(e.seatKind) ? e.seatKind : null, description: clean(e.description || '', 2000, 40),
          skills: skillList(e.skills || []), hours: hoursOf(e.hours), pay: payOf(e.pay), contact: contactOf(e.contact), tribe: clean(e.tribe || '', 40), posted: clean(String(e.posted || ''), 10) });
      }
      data = { repo: r, available: true, gigs: out, updated: typeof idx.updated === 'string' ? idx.updated.slice(0, 40) : null };
    } catch (e) {
      data = { repo: r, available: false, gigs: [], reason: e.http === 404 || e.status === 404 ? 'missing' : e.offline ? 'offline' : 'invalid', message: e.message };
    }
    pubCache = { repo: r, at: now(), data };
    return data;
  }

  // ---------- time bank ----------
  const bank = () => { const l = read('bank', []); return Array.isArray(l) ? l : []; };
  const saveBank = l => write('bank', l.slice(-2000));
  function bankBalances() {
    const out = {};
    for (const e of bank()) {
      if (e.status !== 'confirmed') continue;
      (out[e.from] = out[e.from] || { given: 0, received: 0 }).given += e.hours;
      (out[e.to] = out[e.to] || { given: 0, received: 0 }).received += e.hours;
    }
    return out;
  }
  const entryView = e => ({ ...e, fromName: nameOf(e.from), toName: nameOf(e.to), byName: nameOf(e.by) });
  function bankView(me) {
    const who = ownerOf(me), bal = bankBalances()[who.id] || { given: 0, received: 0 };
    const mine = bank().filter(e => e.from === who.id || e.to === who.id).reverse().slice(0, 200).map(entryView);
    return { balance: { given: bal.given, received: bal.received, net: Math.round((bal.given - bal.received) * 100) / 100 }, entries: mine,
      waiting: mine.filter(e => e.status === 'proposed' && !e.ok[e.from === who.id ? 'from' : 'to']).length };
  }
  function logHours(b, me) {
    if (!me || me.role === 'spectator') throw err(403, 'spectators can\'t log hours');
    const who = ownerOf(me); if (!human(who)) throw err(403, 'only people log hours');
    const from = String(b.from || ''), to = String(b.to || '');
    if (!member(from) || !member(to) || from === to || !human(member(from)) || !human(member(to))) throw err(400, 'pick two different people');
    if (from !== who.id && to !== who.id) throw err(403, 'you can only log hours you gave or received');
    const hours = hoursOf(b.hours, 80); if (!hours) throw err(400, 'how many hours?');
    const e = { id: nid('t'), from, to, hours, note: clean(b.note || '', 200), task: b.task ? clean(String(b.task), 40) : undefined, at: iso(), by: me.id, ok: { from: false, to: false }, status: 'proposed' };
    if (me.role !== 'agent') e.ok[from === me.id ? 'from' : 'to'] = true;   // an agent proposes; its owner still confirms
    const other = from === who.id ? to : from;
    const list = bank(); list.push(e); saveBank(list); changed('timebank');
    notify(other, who.id, `${who.name} logged ${hours} h with you`, `${from === who.id ? `${first(who.name)} gave you` : `You gave ${first(who.name)}`} ${hours} h${e.note ? ` · ${e.note}` : ''}. Confirm it in Work › Time bank.`, { ref: e.id });
    if (me.role === 'agent') notify(who.id, me.id, `${me.name} logged ${hours} h for you`, 'Confirm it in Work › Time bank.', { ref: e.id });
    return entryView(e);
  }
  function confirmHours(tid, yes, me) {
    if (!human(me)) throw err(403, 'only people confirm hours');
    const list = bank(), e = list.find(x => x.id === tid); if (!e) throw err(404, 'no such entry');
    if (e.from !== me.id && e.to !== me.id) throw err(403, 'this entry is not yours');
    if (e.status !== 'proposed') throw err(409, `already ${e.status}`);
    if (!yes) { e.status = 'declined'; e.declinedBy = me.id; }
    else { e.ok[e.from === me.id ? 'from' : 'to'] = true; if (e.ok.from && e.ok.to) { e.status = 'confirmed'; e.confirmedAt = iso(); } }
    saveBank(list); changed('timebank');
    const other = e.from === me.id ? e.to : e.from;
    if (e.status !== 'proposed') notify(other, me.id, `${me.name} ${e.status} ${e.hours} h`, e.note || '', { ref: e.id });
    return entryView(e);
  }

  // ---------- compute sharing ----------
  const comp = () => { const c = read('compute', {}); return { offers: Array.isArray(c.offers) ? c.offers : [], requests: Array.isArray(c.requests) ? c.requests : [] }; };
  const saveComp = c => write('compute', { offers: c.offers.slice(-200), requests: c.requests.slice(-1000) });
  function syncRequests(c) {
    let dirty = false;
    for (const r of c.requests) {
      if (r.status !== 'pending' || !r.approval || !approvals) continue;
      const a = approvals.get(r.approval); if (!a || a.status === 'pending') continue;
      r.status = a.status === 'approved' ? 'approved' : 'denied'; r.decidedAt = a.decidedAt; r.answer = a.note || ''; dirty = true;
      notify(r.by, r.offerer, `${nameOf(r.offerer)} ${r.status === 'approved' ? 'said yes to' : 'declined'} your compute request`, r.answer || r.note || '', { ref: r.id });
    }
    if (dirty) saveComp(c);
    return c;
  }
  const weekUsed = (c, oid) => c.requests.filter(r => r.offer === oid && r.usedAt && now() - Date.parse(r.usedAt) < 7 * 86400_000).reduce((n, r) => n + (r.used || 0), 0);
  function computeView(me) {
    const c = syncRequests(comp()), who = ownerOf(me);
    const offers = c.offers.filter(o => member(o.member) && (!P.scoped(me) || o.member === who.id || (member(o.member).projects || []).some(x => P.canSee(me, x)) || !P.scoped(member(o.member))))
      .map(o => ({ ...o, name: nameOf(o.member), color: (member(o.member) || {}).color, usedThisWeek: weekUsed(c, o.id), mine: o.member === who.id, askPolicy: askai && askai.policyOf ? askai.policyOf(o.member) : 'ask' }));
    const reqs = c.requests.filter(r => r.by === who.id || r.offerer === who.id).reverse().slice(0, 100).map(r => ({ ...r, byName: nameOf(r.by), offererName: nameOf(r.offerer) }));
    return { offers, requests: reqs, note: 'Each person\'s AI subscription is their own, and they decide. A request asks them; TribeCode never runs your work through someone else\'s Claude login on its own.' };
  }
  function setOffer(b, me) {
    if (!human(me)) throw err(403, 'only people offer their AI or computer');
    const c = comp(); let o = b.id ? c.offers.find(x => x.id === b.id) : null;
    if (b.id && (!o || o.member !== me.id)) throw err(404, 'no such offer of yours');
    if (!o) { if (c.offers.filter(x => x.member === me.id).length >= 4) throw err(400, 'up to 4 offers each'); o = { id: nid('c'), member: me.id, at: iso() }; c.offers.push(o); }
    if (!b.id || 'what' in b) o.what = WHAT.includes(b.what) ? b.what : 'claude-code';
    if (!b.id || 'hoursPerWeek' in b) o.hoursPerWeek = hoursOf(b.hoursPerWeek, 80) || 1;
    if (!b.id || 'rules' in b) o.rules = clean(b.rules || '', 400, 8);
    if (!b.id || 'on' in b) o.on = b.on !== false;
    o.updated = iso(); saveComp(c); changed('compute');
    return o;
  }
  function removeOffer(oid, me) {
    const c = comp(), o = c.offers.find(x => x.id === oid);
    if (!o || (o.member !== me.id && !isBoss(me))) throw err(404, 'no such offer of yours');
    c.offers = c.offers.filter(x => x !== o); saveComp(c); changed('compute'); return { ok: true };
  }
  function requestCompute(b, me) {
    if (!human(me)) throw err(403, 'only people ask for time (your agent can suggest it)');
    const c = comp(), o = c.offers.find(x => x.id === b.offer);
    if (!o || !o.on || !member(o.member)) throw err(404, 'that offer is not available');
    if (o.member === me.id) throw err(400, 'that\'s your own offer');
    if (askai && askai.policyOf && askai.policyOf(o.member) === 'never' && o.what === 'claude-code') throw err(409, `${first(nameOf(o.member))} keeps their Claude to themselves right now`);
    const hours = hoursOf(b.hours, 40) || 1, note = clean(b.note || '', 600, 10);
    if (c.requests.filter(r => r.by === me.id && r.status === 'pending').length >= 10) throw err(429, 'you have 10 requests waiting already');
    const r = { id: nid('r'), offer: o.id, offerer: o.member, what: o.what, by: me.id, hours, note, status: 'pending', used: 0, at: iso() };
    const label = { 'claude-code': 'Claude Code', 'local-model': 'local model', gpu: 'GPU', other: 'computer' }[o.what];
    if (approvals) { try { const a = approvals.create({ title: `${me.name} asks for ${hours} h of your ${label}`, details: `${note || '(no note)'}\n\nYour offer: ${o.hoursPerWeek} h/week${o.rules ? ` · ${o.rules}` : ''}. Approve only if you want to; it's your subscription.`, risk: 'low', kind: 'compute-request', to: [o.member] }, me); r.approval = a.id; } catch {} }
    c.requests.push(r); saveComp(c); changed('compute');
    dm(me.id, o.member, `🤝 Could I borrow ${hours} h of your ${label}?${note ? ` ${note}` : ''} (It's in your inbox to approve or decline. Totally your call.)`);
    return r;
  }
  function useHours(rid, b, me) {
    const c = syncRequests(comp()), r = c.requests.find(x => x.id === rid);
    if (!r || r.offerer !== me.id) throw err(404, 'no such request on your offer');
    if (r.status !== 'approved' && r.status !== 'done') throw err(409, 'approve it first');
    const h = hoursOf(b.hours, 40); if (!h) throw err(400, 'how many hours?');
    r.used = Math.round(((r.used || 0) + h) * 100) / 100; r.usedAt = iso(); if (b.done || r.used >= r.hours) r.status = 'done';
    saveComp(c); changed('compute');
    return r;
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, b, c, parts, me, url: u, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    const d = parts[3];   // /api/talent/<b>/<c>/<d>  (parts start after /api)
    try {
      if (!b && m === 'GET') return send(res, 200, { me: profileOf(ownerOf(me).id), gigs: listGigs(me), people: people(me), seatKinds: SEAT_KINDS.map(k => ({ kind: k, title: SEAT_TITLES[k], color: SEAT_COLORS[k] })), balance: bankView(me).balance, canPost: me.role !== 'spectator' });
      if (b === 'profile') {
        if (m === 'GET') { const mid = c || ownerOf(me).id, x = member(mid); if (!x || !human(x)) return fail(res, 404, 'no such person'); return send(res, 200, { profile: personView(x, me) }); }
        if (m === 'PUT' && !c) { if (!human(me)) return fail(res, 403, 'only people have work profiles'); return send(res, 200, { profile: setProfile(me.id, await readBody(req) || {}) }); }
      }
      if (b === 'people' && m === 'GET') return send(res, 200, { people: people(me, { skills: (u.searchParams.get('skills') || '').split(','), seat: u.searchParams.get('seat') || '' }) });
      if (b === 'gigs') {
        if (!c && m === 'GET') return send(res, 200, { gigs: listGigs(me) });
        if (!c && m === 'POST') return send(res, 200, { gig: postGig(await readBody(req) || {}, me) });
        if (c && !d && m === 'PATCH') return send(res, 200, { gig: patchGig(c, await readBody(req) || {}, me) });
        if (c && !d && m === 'DELETE') return send(res, 200, removeGig(c, me));
        if (c && d === 'apply' && m === 'POST') return send(res, 200, { gig: apply(c, await readBody(req) || {}, me) });
        if (c && d === 'hire' && m === 'POST') return send(res, 200, hire(c, await readBody(req) || {}, me));
        if (c && d === 'share' && m === 'POST') return send(res, 200, await share(c, await readBody(req) || {}, me));
      }
      if (b === 'public' && m === 'GET') return send(res, 200, await publicGigs(u.searchParams.get('refresh') === '1'));
      if (b === 'timebank') {
        if (!c && m === 'GET') return send(res, 200, bankView(me));
        if (!c && m === 'POST') return send(res, 200, { entry: logHours(await readBody(req) || {}, me) });
        if (c && (d === 'confirm' || d === 'decline') && m === 'POST') return send(res, 200, { entry: confirmHours(c, d === 'confirm', me) });
      }
      if (b === 'compute') {
        if (!c && m === 'GET') return send(res, 200, computeView(me));
        if (c === 'offers' && !d && m === 'PUT') return send(res, 200, { offer: setOffer(await readBody(req) || {}, me) });
        if (c === 'offers' && d && m === 'DELETE') return send(res, 200, removeOffer(d, me));
        if (c === 'request' && m === 'POST') return send(res, 200, { request: requestCompute(await readBody(req) || {}, me) });
        if (c === 'requests' && d && parts[4] === 'used' && m === 'POST') return send(res, 200, { request: useHours(d, await readBody(req) || {}, me) });
      }
      return fail(res, 404, 'no such talent route');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }

  // ---------- MCP tools for Claude Code ----------
  const reply = (t, isErr) => ({ content: [{ type: 'text', text: t }], ...(isErr ? { isError: true } : {}) });
  const mcpTools = {
    talent_find: {
      description: 'Find people in this tribe who are open to work, by skills and/or the company seat they can fill (ceo, cto, design, growth, sales, support, ops, finance, legal). Returns names, skills, hours per week, rate type and time zone. Only people who switched on "open to work" show up.',
      inputSchema: { type: 'object', properties: { skills: { type: 'array', items: { type: 'string' }, description: 'Skills to match, e.g. ["pixel art", "javascript"]' }, seatKind: { type: 'string', enum: SEAT_KINDS } }, additionalProperties: false },
      run: ({ skills, seatKind } = {}, me) => {
        const list = people(ownerOf(me) || me, { skills: skills || [], seat: SEAT_KINDS.includes(seatKind) ? seatKind : '' });
        if (!list.length) return reply('Nobody open to work matches that yet. You can draft a gig with gig_post so a person can approve and post it.');
        return reply(list.slice(0, 20).map(p => `- ${p.name} (${p.id}): ${p.skills.join(', ') || 'no skills listed'} · seats: ${p.roles.join(', ') || 'any'} · ${p.hours || '?'} h/week · ${p.rate.type}${p.rate.text ? ` (${p.rate.text})` : ''}${p.tz ? ` · ${p.tz}` : ''}`).join('\n'));
      },
    },
    gig_post: {
      description: 'Draft a gig (a company seat, a task or a bounty) on the tribe\'s Work board. Agents only draft: your owner (a person) approves before anyone sees it. Pay is "free", "time" (time exchange) or "paid" with a text; TribeCode processes no money.',
      inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, kind: { type: 'string', enum: KINDS }, seatKind: { type: 'string', enum: SEAT_KINDS }, project: { type: 'string', description: 'Project id (needed for a seat)' }, description: { type: 'string' }, skills: { type: 'array', items: { type: 'string' } }, hours: { type: 'number' }, pay: { type: 'object', properties: { type: { type: 'string', enum: PAY }, text: { type: 'string' } } } }, additionalProperties: false },
      run: (a = {}, me) => {
        try {
          const g = postGig({ ...a, project: a.project || (a.kind === 'seat' ? P.current() : a.project) }, me);
          return reply(g.status === 'draft' ? `Drafted "${g.title}" (${g.id}). It waits for your owner's approval${g.approval ? ` (approval ${g.approval})` : ''} before it shows on the Work board.` : `Posted "${g.title}" (${g.id}) on the Work board.`);
        } catch (e) { return reply(e.message, true); }
      },
    },
    timebank_log: {
      description: 'Propose hours for the tribe\'s time bank (no money: hours given and received between people). Give `from` (who gave the time) and `to` (who received it) as member ids; one of them must be you or your owner. Both people confirm in the app before it counts.',
      inputSchema: { type: 'object', required: ['from', 'to', 'hours'], properties: { from: { type: 'string' }, to: { type: 'string' }, hours: { type: 'number' }, note: { type: 'string' }, task: { type: 'string' } }, additionalProperties: false },
      run: (a = {}, me) => { try { const e = logHours(a, me); return reply(`Proposed ${e.hours} h from ${e.fromName} to ${e.toName} (${e.id}). It counts once both of them confirm in Work › Time bank.`); } catch (e) { return reply(e.message, true); } },
    },
  };

  return { route, mcpTools, onJoin, people, profileOf, listGigs, assignSeat, SEAT_KINDS, SEAT_COLORS };
};
