// Company mode (v0.27): a project becomes a company with seats (CEO, Build, Grow, Run, …), each held by a person
// and/or an AI helper, with a charter (this month's goal, what it owns, what it may do, what needs a human's yes, a
// weekly budget, a definition of done). Goals (OKR-light) link seats and tasks; a decision log; and rhythms: a daily
// standup per seat, a weekly review (ONE notification) and a monthly board update (a doc). No AI needed.
//
// Data: <tribe>/projects/<pid>/company.json (the shared data contract, docs in the company brief) and
//       <tribe>/projects/<pid>/company-log.json (standups by day, last rhythm runs, the last weekly report).
// Decisions are the project's existing decisions/*.md (votes and proposals already write there; CEO calls and decided
// approvals are added here).
//
//   GET    /api/projects/:id/company                         { company|null, canLead, mySeats, templates, today, decisions, people, agents, … }
//   PUT    /api/projects/:id/company        { name?, mission?, on?, rhythms?, template? }   lead (creates from a template when there is none)
//   POST   /api/projects/:id/company/template { template, name?, mission?, helpers?, replace? }   lead: make this project a company
//   POST   /api/projects/:id/company/seats  { kind, title? }                          lead
//   POST   /api/projects/:id/company/seats/reorder { order: [seatId] }                lead
//   PATCH  /api/projects/:id/company/seats/:seat { title?, color?, charter?, status?, last? }  lead; holders: status + last
//   DELETE /api/projects/:id/company/seats/:seat                                      lead (never the CEO seat)
//   POST   /api/projects/:id/company/seats/:seat/assign { person?, agent? }          lead (holders may put their own AI on their seat)
//   POST   /api/projects/:id/company/goals  { title, seat?, results? }               lead
//   PATCH  /api/projects/:id/company/goals/:gid { title?, seat?, results? }          lead; holders of the goal's seat: results' current
//   DELETE /api/projects/:id/company/goals/:gid                                      lead
//   GET    /api/projects/:id/company/decisions                                       members
//   POST   /api/projects/:id/company/decisions { title, why }                        people: the CEO seat's holder or a lead
//   POST   /api/projects/:id/company/standups { seat, done, next, blocked }         the seat's holder
//   GET    /api/projects/:id/company/check?action=&member=                           { allowed: yes|ask|no, why }
//   POST   /api/projects/:id/company/rhythms/run { kind: standup|weekly|board }     host or lead
// Broadcast: { type: 'company', project }. Exports: get(pid), seatOf(pid, memberId), seatsOf, list(), check(), mcpTools.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KINDS = { ceo: '#F26B1D', cto: '#38C6B1', design: '#E86A92', growth: '#FABD2F', sales: '#6C7CFF', support: '#3BD16F', ops: '#94A3B8', finance: '#2DD4BF', legal: '#A78BFA', custom: '#94A3B8' };
const KIND_TITLE = { ceo: 'CEO', cto: 'Build', design: 'Design', growth: 'Grow', sales: 'Sales', support: 'Support', ops: 'Run', finance: 'Money', legal: 'Legal', custom: 'New seat' };
// Starter charters for a seat added by hand (templates bring their own).
const KIND_CHARTER = {
  ceo: { goal: 'Pick one goal for this month', owns: ['vision', 'decisions'], mayDo: ['set goals', 'make calls', 'assign seats'], needsApproval: ['spend money', 'sign contracts'], done: 'Everyone knows the goal and who owns what.' },
  cto: { goal: 'Ship the next version', owns: ['code', 'tasks:build'], mayDo: ['write code', 'fix bugs', 'open pull requests'], needsApproval: ['deploy to production', 'add paid services'], done: 'It works for someone outside the team.' },
  design: { goal: 'Make the main screen clear and good-looking', owns: ['design', 'brand'], mayDo: ['design mockups', 'pick colors and fonts'], needsApproval: ['publish', 'spend money on assets'], done: 'A newcomer understands the main screen without help.' },
  growth: { goal: 'Find the next 10 people who want this', owns: ['website', 'tasks:growth'], mayDo: ['draft posts', 'write landing copy', 'research where users are'], needsApproval: ['publish', 'email customers', 'spend money'], done: '10 real people said yes.' },
  sales: { goal: 'Talk to 5 people who could pay', owns: ['leads', 'proposals'], mayDo: ['research leads', 'draft outreach'], needsApproval: ['email customers', 'send proposals', 'sign contracts'], done: '5 real conversations, notes written down.' },
  support: { goal: 'Answer every question within a day', owns: ['help docs', 'feedback'], mayDo: ['draft replies', 'write help pages'], needsApproval: ['email customers', 'give refunds'], done: 'No question older than a day.' },
  ops: { goal: 'Keep the week calm and planned', owns: ['tasks', 'calendar'], mayDo: ['tidy the task board', 'write weekly notes', 'chase blockers'], needsApproval: ['spend money', 'change who has access'], done: 'Every open task has an owner.' },
  finance: { goal: 'Know what we spend and earn each week', owns: ['budget'], mayDo: ['track costs', 'draft a budget'], needsApproval: ['spend money', 'change prices', 'connect payments'], done: 'A weekly line: spent, earned, left. (A starting point, not financial advice.)' },
  legal: { goal: 'Keep our terms and privacy page current', owns: ['terms', 'privacy page', 'contracts'], mayDo: ['draft terms from a template', 'list what to check with a professional'], needsApproval: ['sign contracts', 'publish legal pages'], done: 'Pages drafted and checked by someone qualified. (A starting point, not legal advice: check local law.)' },
  custom: { goal: '', owns: [], mayDo: [], needsApproval: ['spend money', 'publish'], done: '' },
};
const STATUSES = ['on-track', 'needs-you', 'blocked', 'idle'];
const RHYTHMS = ['standup', 'weekly', 'board'];
const OUTWARD = /\b(publish|post publicly|spend|pay|buy|order|email|send|contract|sign|deploy|production|release|refund|price|invoice|ads?)\b/i;
const MAX_SEATS = 16, MAX_GOALS = 12, MAX_RESULTS = 5, MAX_LIST = 12;
const TPL_FILE = require('./tpldir')('companies.json');   // v0.27: also works in the desktop app

module.exports = function company({ P, base, store, broadcast, postChat = () => {}, nameOf = () => 'someone', perms, getMembers, approvals, bus, coord, createTask, saveTask, loadTasks = () => [], docs, tick = !process.env.TRIBE_TEST || !!process.env.TRIBE_COMPANY_TICK }) {
  const err = (status, m) => Object.assign(new Error(m), { status });
  const s = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const ml = (v, n) => (typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, n) : '');
  const now = () => new Date().toISOString();
  const safe = pid => String(pid || '').replace(/[^A-Za-z0-9_-]/g, '');
  const dir = pid => base.p('projects', safe(pid));
  const fileOf = pid => path.join(dir(pid), 'company.json');
  const logOf = pid => path.join(dir(pid), 'company-log.json');
  const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  const writeJ = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, f); };
  const member = mid => (getMembers().find(m => m.id === mid) || null);
  const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'decision';
  const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const weekKey = (d = new Date()) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / 864e5 + 1) / 7)).padStart(2, '0')}`; };
  let ledgerHook = null;   // Agent B (ledger) plugs in: fn(pid) -> { spentWeek, currency } | null. Never invented here.

  // ---------- templates ----------
  let TPLS = null;
  const templates = () => { if (!TPLS) { const j = readJ(TPL_FILE, { templates: [] }); TPLS = Array.isArray(j.templates) ? j.templates : []; } return TPLS; };
  const tplList = () => templates().map(t => ({ id: t.id, name: t.name, emoji: t.emoji, blurb: t.blurb, seats: (t.seats || []).map(x => x.title) }));

  // ---------- shape ----------
  const list12 = (v, n = 60) => (Array.isArray(v) ? v.map(x => s(x, n)).filter(Boolean).slice(0, MAX_LIST) : []);
  function cleanCharter(c, prev = {}) {
    c = c && typeof c === 'object' ? c : {};
    const pick = (k, fn) => (c[k] !== undefined ? fn(c[k]) : prev[k] !== undefined ? prev[k] : fn(undefined));
    const budget = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, 10_000_000) : 0; };
    return { goal: pick('goal', v => s(v, 200)), owns: pick('owns', v => list12(v)), mayDo: pick('mayDo', v => list12(v)), needsApproval: pick('needsApproval', v => list12(v)),
      budgetWeekly: pick('budgetWeekly', budget), done: pick('done', v => s(v, 300)) };
  }
  const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : d);
  function cleanSeat(x) {
    const kind = KINDS[x.kind] ? x.kind : 'custom';
    return { id: /^[a-z0-9-]{1,32}$/.test(x.id || '') ? x.id : kind, kind, title: s(x.title, 40) || KIND_TITLE[kind], color: hex(x.color, KINDS[kind]),
      holder: { person: (x.holder && typeof x.holder.person === 'string' && x.holder.person) || null, agent: (x.holder && typeof x.holder.agent === 'string' && x.holder.agent) || null },
      charter: cleanCharter(x.charter), status: STATUSES.includes(x.status) ? x.status : 'idle', last: x.last && x.last.text ? { text: s(x.last.text, 200), at: x.last.at || now() } : null };
  }
  function cleanResults(v, prev = []) {
    if (!Array.isArray(v)) return prev;
    return v.slice(0, MAX_RESULTS).map((r, i) => {
      const target = Number(r && r.target), current = Number(r && r.current);
      return { text: s(r && r.text, 80) || (prev[i] || {}).text || 'Result', target: Number.isFinite(target) && target > 0 ? Math.min(target, 1e9) : 1, current: Number.isFinite(current) && current > 0 ? Math.min(current, 1e9) : 0, unit: s(r && r.unit, 20) };
    });
  }
  function normalize(c) {
    if (!c || typeof c !== 'object') return null;
    const seats = (Array.isArray(c.seats) ? c.seats : []).slice(0, MAX_SEATS).map(cleanSeat);
    const seen = new Set(); for (const x of seats) { let id = x.id, i = 2; while (seen.has(id)) id = `${x.id}-${i++}`; x.id = id; seen.add(id); }
    const goals = (Array.isArray(c.goals) ? c.goals : []).slice(0, MAX_GOALS).map((g, i) => ({ id: /^[a-z0-9-]{1,24}$/.test(g.id || '') ? g.id : `g${i + 1}`, title: s(g.title, 160) || 'Goal',
      results: cleanResults(g.results), seat: seen.has(g.seat) ? g.seat : null, ...(Array.isArray(g.tasks) ? { tasks: g.tasks.filter(t => typeof t === 'string').slice(0, 30) } : {}) }));
    const r = c.rhythms && typeof c.rhythms === 'object' ? c.rhythms : {};
    return { on: c.on !== false, name: s(c.name, 60) || 'Our company', mission: s(c.mission, 400), template: s(c.template, 20) || 'blank', seats, goals,
      rhythms: { standup: r.standup !== false, weekly: r.weekly !== false, board: r.board !== false }, created: c.created || now(), updated: c.updated || now() };
  }
  const raw = pid => normalize(readJ(fileOf(pid), null));
  function save(pid, c) { c.updated = now(); writeJ(fileOf(pid), c); broadcast({ type: 'company', project: pid }); return c; }
  const loadLog = pid => { const l = readJ(logOf(pid), {}) || {}; l.standups = l.standups && typeof l.standups === 'object' ? l.standups : {}; l.runs = l.runs || {}; return l; };
  function saveLog(pid, l) { const days = Object.keys(l.standups).sort(); for (const d of days.slice(0, Math.max(0, days.length - 21))) delete l.standups[d]; writeJ(logOf(pid), l); }

  // ---------- who may do what ----------
  const projRole = (me, pid) => ((P.get(pid) || {}).members || {})[me.id];
  const isLead = (me, pid) => !!me && me.role !== 'agent' && !me.guestUntil && (me.role === 'host' || projRole(me, pid) === 'host' || (perms && perms.can(me, 'settings.edit', pid)));
  const isPerson = me => !!me && me.role !== 'agent' && me.role !== 'spectator';
  const seeOk = (m, pid) => !!m && (P.canSee(m, pid) || (m.role === 'agent' && !!member(m.owner) && P.canSee(member(m.owner), pid)));
  const holds = (seat, mid) => !!seat && !!mid && (seat.holder.person === mid || seat.holder.agent === mid);
  function seatsOf(pid, mid) { const c = raw(pid); return c && c.on ? c.seats.filter(x => holds(x, mid)) : []; }
  const seatOf = (pid, mid) => seatsOf(pid, mid)[0] || null;
  const get = pid => raw(pid);
  const list = () => P.all().map(p => { const c = raw(p.id); return c ? { project: p.id, name: c.name, on: c.on, seats: c.seats.length } : null; }).filter(Boolean);

  // A seat narrows what its holder may do, or turns it into a request; it never grants more than the holder's role.
  const BASE = [[/\b(merge|main branch)\b/i, 'repo.merge'], [/\b(invite|access|add (people|members))\b/i, 'members.invite'], [/\b(close|triage|assign) (any )?(tasks?|bugs?)\b/i, 'tasks.triage'], [/\b(settings|vision)\b/i, 'settings.edit']];
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const stem = w => w.replace(/(ing|es|ed|s)$/, '');
  // loose (needsApproval): the same leading verb is enough ("publish" ~ "publish the launch post"); strict (mayDo): every
  // word of the charter line must be in the action, so a seat's list can't be stretched to cover more than it says.
  function matches(item, action, loose) {
    const i = norm(item), a = norm(action); if (!i || !a) return false;
    if (i === a || a.includes(i)) return true;
    const a0 = stem(a.split(' ')[0]), i0 = stem(i.split(' ')[0]);
    if (loose && a0.length > 3 && a0 === i0) return true;
    const iw = i.split(' ').map(stem).filter(w => w.length > 2), aw = new Set(a.split(' ').map(stem));
    return iw.length > 0 && iw.every(w => aw.has(w));
  }
  function check(pid, who, action) {
    action = s(action, 80); if (!action) return { allowed: 'no', why: 'Say what you want to do.' };
    if (!who || who.role === 'spectator' || (perms && perms.mutedUntil && perms.mutedUntil(who.id))) return { allowed: 'no', why: 'Spectators and muted members can only read.' };
    const base = BASE.find(([re]) => re.test(action));
    const roleOk = !base || (perms ? perms.can(who, base[1], pid) : who.role === 'host');
    const seats = seatsOf(pid, who.id);
    const outward = OUTWARD.test(action);
    if (!roleOk) return { allowed: 'ask', why: `Your role can't do that on its own, so it goes to someone who can (a seat never adds rights).`, seat: seats[0] ? seats[0].id : null };
    if (!seats.length) return who.role === 'agent' && outward ? { allowed: 'ask', why: 'AI helpers ask a human before anything outward or costly.' } : { allowed: 'yes', why: 'No seat: your role decides.' };
    for (const st of seats) {
      const ch = st.charter;
      if (ch.needsApproval.some(x => matches(x, action, true))) return { allowed: 'ask', why: `${st.title}'s charter says this needs a human's yes.`, seat: st.id };
      if (who.role === 'agent' && outward) return { allowed: 'ask', why: 'AI helpers ask a human before anything outward or costly.', seat: st.id };
      if (!ch.mayDo.length || ch.mayDo.some(x => matches(x, action))) return { allowed: 'yes', why: ch.mayDo.length ? `In ${st.title}'s charter.` : 'Allowed by your role.', seat: st.id };
    }
    return { allowed: 'ask', why: `Outside ${seats.map(x => x.title).join(' / ')}'s charter, so it needs a yes first.`, seat: seats[0].id };
  }

  // ---------- goals ----------
  function progress(g, tasks) {
    const rs = (g.results || []).filter(r => r.target > 0);
    if (rs.length) return Math.round(rs.reduce((a, r) => a + Math.min(1, r.current / r.target), 0) / rs.length * 100);
    const ts = (g.tasks || []).map(id => tasks.find(t => t.id === id)).filter(Boolean);
    return ts.length ? Math.round(ts.filter(t => t.status === 'done').length / ts.length * 100) : 0;
  }
  const projTasks = pid => { try { return P.inProject(pid, () => loadTasks()); } catch { return []; } };

  // ---------- decisions (decisions/*.md, shared with votes, proposals and /decide) ----------
  function decisions(pid, n = 30) {
    return P.inProject(pid, () => store.listMd('decisions').map(f => {
      const r = store.readMd(f); if (!r) return null; const m = r.meta || {};
      const title = (r.body.match(/^#\s+(.+)$/m) || [])[1] || path.basename(f, '.md');
      const why = m.why || (r.body.replace(/^#.*$/m, '').trim().split(/\n\n/)[0] || '').slice(0, 300);
      const kind = m.kind || (m.vote ? 'vote' : m.proposal ? 'proposal' : 'decision');
      let at = m.at; if (!at) { try { at = fs.statSync(store.p(f)).mtime.toISOString(); } catch { at = String(m.date || ''); } }
      return { id: path.basename(f, '.md'), title: s(title, 200), why, kind, by: m.by || null, byName: m.by ? nameOf(m.by) : '', at, ref: m.ref || m.vote || m.proposal || null };
    }).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, n));
  }
  function writeDecision(pid, { title, why, kind, by, ref, file }) {
    const d = new Date(), name = file || `${day(d)}-${slug(title)}`;
    return P.inProject(pid, () => {
      const rel = `decisions/${name}.md`;
      if (file && store.readMd(rel)) return null;   // already logged (approvals broadcast more than once)
      store.writeMd(rel, { date: day(d), at: d.toISOString(), by: by || null, kind, why: s(why, 600), ...(ref ? { ref } : {}) }, `# ${s(title, 200)}\n\n${ml(why, 2000) || ''}`.trim() + '\n');
      broadcast({ type: 'company', project: pid });
      return name;
    });
  }
  function ceoCall(pid, me, body) {
    const c = raw(pid); if (!c || !c.on) throw err(404, 'this project is not a company yet');
    const title = s(body.title, 160), why = ml(body.why, 1200); if (!title) throw err(400, 'what did you decide?');
    const ceo = c.seats.find(x => x.kind === 'ceo');
    if (!isLead(me, pid) && !holds(ceo, me.id)) throw err(403, 'only the CEO seat or a project lead makes a CEO call');
    const id = writeDecision(pid, { title, why, kind: 'ceo-call', by: me.id });
    P.inProject(pid, () => postChat('general', 'tribecode', `📌 CEO call by ${me.name}: **${title}**${why ? ` · ${why.slice(0, 200)}` : ''}`));
    return { id, title, why, kind: 'ceo-call' };
  }
  // Decided approvals in a company project land in the log; an AI's proposed CEO call becomes a CEO call when approved.
  function onApproval(a) {
    if (!a || !a.project || !['approved', 'denied'].includes(a.status)) return;
    const c = raw(a.project); if (!c || !c.on) return;
    const call = a.kind === 'ceo-call', ok = a.status === 'approved';
    const title = call ? (ok ? '' : 'Not approved: ') + String(a.title).replace(/^CEO call:\s*/i, '') : `${ok ? 'Approved' : 'Denied'}: ${a.title}`;
    const why = `${a.details ? a.details.slice(0, 400) + ' · ' : ''}${call ? 'Proposed by' : 'Asked by'} ${a.byName || nameOf(a.by)}, ${a.status} by ${a.decidedByName || nameOf(a.decidedBy)}${a.note ? `: "${a.note}"` : ''}.`;
    try { writeDecision(a.project, { title, why, kind: call && ok ? 'ceo-call' : 'approval', by: a.decidedBy, ref: a.id, file: `${String(a.decidedAt || now()).slice(0, 10)}-approval-${String(a.id).replace(/[^a-z0-9-]/gi, '')}` }); } catch (e) { /* the log is best effort */ }
  }

  // ---------- standups ----------
  function standup(pid, who, body) {
    const c = raw(pid); if (!c || !c.on) throw err(404, 'this project is not a company yet');
    const seat = body.seat ? c.seats.find(x => x.id === body.seat) : c.seats.find(x => holds(x, who.id));
    if (!seat) throw err(400, 'which seat? You don\'t hold one here');
    if (!holds(seat, who.id)) throw err(403, `only ${seat.title}'s holder posts its standup`);
    const done = ml(body.done, 600), next = ml(body.next, 600), blocked = ml(body.blocked, 600);
    if (!done && !next && !blocked) throw err(400, 'say what got done or what\'s next');
    const l = loadLog(pid), d = day(); l.standups[d] = l.standups[d] || {};
    l.standups[d][seat.id] = { by: who.id, byName: who.name, agent: who.role === 'agent', done, next, blocked, at: now() };
    saveLog(pid, l);
    seat.last = { text: s(done || next || blocked, 200), at: now() };
    seat.status = blocked ? 'blocked' : seat.status === 'blocked' || seat.status === 'idle' ? 'on-track' : seat.status;
    if (blocked) bus && bus.notify({ type: 'company-blocked', priority: 'normal', to: leads(pid).filter(x => x !== who.id), from: who.id, title: `${seat.title} is blocked`, body: blocked.slice(0, 200), view: 'company', project: pid });
    save(pid, c);
    return { seat: seat.id, day: d, ...l.standups[d][seat.id] };
  }
  function today(pid, c) {
    const l = loadLog(pid), d = day(), got = l.standups[d] || {};
    return { day: d, standups: got, missing: (c ? c.seats : []).filter(x => (x.holder.person || x.holder.agent) && !got[x.id]).map(x => x.id), weekly: l.weekly || null, board: l.board || null, runs: l.runs };
  }
  const leads = pid => getMembers().filter(m => isLead(m, pid) && P.canSee(m, pid)).map(m => m.id);

  // ---------- rhythms ----------
  function spendLine(pid, c) {
    const budget = c.seats.reduce((a, x) => a + (x.charter.budgetWeekly || 0), 0);
    let sp = null; try { sp = ledgerHook ? ledgerHook(pid) : null; } catch {}
    if (sp && Number.isFinite(Number(sp.spentWeek))) return { budget, spent: Number(sp.spentWeek), text: `Spent ${sp.spentWeek}${budget ? ` of ${budget} budgeted` : ''} this week.` };
    return { budget, spent: null, text: budget ? `Budget ${budget} a week across seats; spending isn't tracked yet.` : 'No budgets set; spending isn\'t tracked yet.' };
  }
  function weeklyReport(pid) {
    const c = raw(pid); if (!c) throw err(404, 'not a company');
    const tasks = projTasks(pid), weekAgo = Date.now() - 7 * 864e5;
    const goals = c.goals.map(g => ({ title: g.title, pct: progress(g, tasks), results: g.results.map(r => `${r.text} ${r.current}/${r.target}${r.unit ? ' ' + r.unit : ''}`) }));
    const waiting = (approvals ? approvals.list() : []).filter(a => a.project === pid && a.status === 'pending');
    const doneWeek = tasks.filter(t => t.status === 'done' && Date.parse(t.updated) > weekAgo);
    const spend = spendLine(pid, c);
    const stuck = c.seats.filter(x => x.status === 'blocked' || x.status === 'needs-you');
    const lines = [
      goals.length ? `Goals: ${goals.map(g => `${g.title} ${g.pct}%`).join(' · ')}` : 'No goals set yet.',
      `Done this week: ${doneWeek.length} task${doneWeek.length === 1 ? '' : 's'}${doneWeek.length ? ` (${doneWeek.slice(0, 3).map(t => t.title).join(', ')}${doneWeek.length > 3 ? '…' : ''})` : ''}.`,
      waiting.length ? `Waiting on a decision: ${waiting.length} (${waiting.slice(0, 3).map(a => a.title).join(', ')}).` : 'Nothing waiting on a decision.',
      stuck.length ? `Needs you: ${stuck.map(x => `${x.title} (${x.status === 'blocked' ? 'blocked' : 'needs you'})`).join(', ')}.` : 'No seat is blocked.',
      ...(c.seats.some(x => !x.holder.person && !x.holder.agent) ? [`Nobody holds: ${c.seats.filter(x => !x.holder.person && !x.holder.agent).map(x => x.title).join(', ')}.`] : []),
      spend.text,
    ];
    return { at: now(), week: weekKey(), goals, waiting: waiting.length, done: doneWeek.length, spend, text: lines.join('\n') };
  }
  function boardDoc(pid, me) {
    const c = raw(pid); if (!c) throw err(404, 'not a company');
    const tasks = projTasks(pid), monthAgo = Date.now() - 30 * 864e5, d = new Date();
    const month = d.toLocaleString('en', { month: 'long', year: 'numeric' });
    const doneM = tasks.filter(t => t.status === 'done' && Date.parse(t.updated) > monthAgo), open = tasks.filter(t => t.status !== 'done');
    const decs = decisions(pid, 50).filter(x => Date.parse(x.at) > monthAgo);
    const waiting = (approvals ? approvals.list() : []).filter(a => a.project === pid && a.status === 'pending');
    const spend = spendLine(pid, c);
    const behind = c.goals.filter(g => progress(g, tasks) < 50);
    const md = [
      `# Board update · ${month}`, '', `**${c.name}**${c.mission ? ` · ${c.mission}` : ''}`, '',
      '## Metrics', '', ...c.goals.map(g => `- **${g.title}**: ${progress(g, tasks)}%${g.results.length ? ` (${g.results.map(r => `${r.text} ${r.current}/${r.target}${r.unit ? ' ' + r.unit : ''}`).join(', ')})` : ''}`),
      `- Tasks done in the last 30 days: ${doneM.length} · open: ${open.length}`, `- Decisions logged: ${decs.length}`, `- ${spend.text}`, '',
      '## Wins', '', ...(doneM.length || decs.length ? [...doneM.slice(0, 8).map(t => `- ${t.title}`), ...decs.slice(0, 4).map(x => `- Decided: ${x.title}`)] : ['- Nothing finished yet this month.']), '',
      '## Risks', '', ...([...c.seats.filter(x => x.status === 'blocked').map(x => `- ${x.title} is blocked${x.last ? `: ${x.last.text}` : ''}`), ...behind.map(g => `- Behind on: ${g.title}`), ...c.seats.filter(x => !x.holder.person && !x.holder.agent).map(x => `- Nobody holds ${x.title}`)].slice(0, 10)), ...(c.seats.some(x => x.status === 'blocked') || behind.length || c.seats.some(x => !x.holder.person && !x.holder.agent) ? [] : ['- None spotted.']), '',
      '## Asks', '', ...([...c.seats.filter(x => x.status === 'needs-you').map(x => `- ${x.title} needs a decision or help`), ...waiting.slice(0, 6).map(a => `- Decide: ${a.title}`)]), ...(c.seats.some(x => x.status === 'needs-you') || waiting.length ? [] : ['- Nothing right now.']), '',
      `_Made by TribeCode from the company's own goals, tasks and decisions on ${day(d)}. Numbers are only what the tribe recorded._`,
    ].join('\n');
    const doc = P.inProject(pid, () => docs.create({ title: `Board update · ${month}`, body: md, by: me ? me.id : 'tribecode' }));
    return { slug: doc.slug, title: doc.title };
  }
  function runRhythm(pid, kind, me) {
    const c = raw(pid); if (!c || !c.on) throw err(404, 'this project is not a company yet');
    if (!RHYTHMS.includes(kind)) throw err(400, 'kind is standup, weekly or board');
    const l = loadLog(pid), at = new Date();
    let out;
    if (kind === 'standup') {
      const got = l.standups[day(at)] || {}, people = [], agentsAsked = [];
      for (const x of c.seats) {
        if (got[x.id]) continue;
        if (x.holder.person && !people.includes(x.holder.person) && member(x.holder.person)) people.push(x.holder.person);
        if (x.holder.agent && coord && coord.tell) { try { coord.tell(x.holder.agent, 'standup', `Daily standup for ${x.title}: call seat_standup with done / next / blocked.`, 'tribecode'); agentsAsked.push(x.holder.agent); } catch {} }
      }
      if (people.length && bus) bus.notify({ type: 'company-standup', priority: 'normal', to: people, from: 'tribecode', title: `Standup for ${c.name}`, body: 'One tap: what got done, what\'s next, anything blocking?', view: 'company', project: pid });
      out = { asked: people.length, agents: agentsAsked.length };
      l.runs.standup = day(at);
    } else if (kind === 'weekly') {
      const rep = weeklyReport(pid);
      const to = [...new Set([...leads(pid), ...c.seats.map(x => x.holder.person).filter(Boolean)])].filter(x => member(x) && member(x).role !== 'agent');
      if (to.length && bus) bus.notify({ type: 'company-weekly', priority: 'normal', to, from: 'tribecode', title: `Weekly review · ${c.name}`, body: rep.text.slice(0, 900), view: 'company', project: pid });
      l.weekly = rep; l.runs.weekly = rep.week; out = { report: rep, to: to.length };
    } else {
      const doc = boardDoc(pid, me);
      const to = leads(pid);
      if (to.length && bus) bus.notify({ type: 'company-board', priority: 'low', to, from: 'tribecode', title: `Board update ready · ${c.name}`, body: doc.title, view: 'docs', ref: doc.slug, project: pid });
      l.board = { at: now(), slug: doc.slug, title: doc.title }; l.runs.board = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`; out = { doc };
    }
    saveLog(pid, l); broadcast({ type: 'company', project: pid });
    return { kind, ...out };
  }
  // The schedule: a plain interval, no cron. Standup after 9:00, weekly on Monday, board on the 1st (server's clock).
  function sweep() {
    const d = new Date(), m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    for (const p of P.all()) {
      const c = raw(p.id); if (!c || !c.on) continue;
      const runs = loadLog(p.id).runs;
      try {
        if (c.rhythms.standup && d.getHours() >= 9 && d.getDay() !== 0 && d.getDay() !== 6 && runs.standup !== day(d)) runRhythm(p.id, 'standup');
        if (c.rhythms.weekly && d.getDay() === 1 && d.getHours() >= 9 && runs.weekly !== weekKey(d)) runRhythm(p.id, 'weekly');
        if (c.rhythms.board && d.getDate() === 1 && d.getHours() >= 9 && runs.board !== m) runRhythm(p.id, 'board');
      } catch (e) { console.error('  company rhythm:', e.message); }
    }
  }
  if (tick) setInterval(sweep, 10 * 60_000).unref();

  // ---------- making one ----------
  function seatFrom(kind, title, charter, taken) {
    let id = kind, i = 2; while (taken.has(id)) id = `${kind}-${i++}`; taken.add(id);
    return cleanSeat({ id, kind, title, charter: charter || KIND_CHARTER[kind] || KIND_CHARTER.custom, status: 'idle' });
  }
  const myAgent = me => getMembers().find(m => m.role === 'agent' && m.owner === me.id && m.tokenHash && !m.label) || getMembers().find(m => m.role === 'agent' && m.owner === me.id && m.tokenHash) || null;
  function createFrom(pid, me, body = {}) {
    if (!isLead(me, pid)) throw err(403, 'only the host or a project lead makes the project a company');
    const prev = raw(pid);
    if (prev && prev.on && !body.replace) throw err(409, 'this project is already a company');
    const tpl = templates().find(t => t.id === (body.template || 'blank')); if (!tpl) throw err(400, 'unknown template');
    const p = P.get(pid), taken = new Set();
    const seats = (tpl.seats || []).slice(0, MAX_SEATS).map(x => seatFrom(KINDS[x.kind] ? x.kind : 'custom', x.title, x.charter, taken));
    const ceo = seats.find(x => x.kind === 'ceo'); if (ceo && isPerson(me)) { ceo.holder.person = me.id; ceo.status = 'on-track'; }
    let helper = null;
    if (body.helpers) { helper = myAgent(me); if (helper) for (const x of seats) if (x.kind !== 'ceo' && !x.holder.person && !x.holder.agent) { x.holder.agent = helper.id; x.status = 'on-track'; } }
    const bySeatKind = k => (seats.find(x => x.kind === k) || {}).id || null;
    const goals = (tpl.goals || []).slice(0, 3).map((g, i) => ({ id: `g${i + 1}`, title: s(g.title, 160), seat: bySeatKind(g.seat), results: cleanResults((g.results || []).map(r => ({ ...r, current: 0 }))), tasks: [] }));
    const c = normalize({ on: true, name: s(body.name, 60) || (p && p.name) || tpl.name, mission: body.mission !== undefined ? s(body.mission, 400) : tpl.mission, template: tpl.id, seats, goals, rhythms: tpl.rhythms, created: now() });
    // starter tasks, tagged with their seat and linked to that seat's goal
    const made = [];
    P.inProject(pid, () => { for (const t of (tpl.tasks || []).slice(0, 8)) {
      const sid = bySeatKind(t.seat), seat = seats.find(x => x.id === sid);
      const task = createTask({ title: t.title, by: me.id, type: t.type, source: 'company', body: seat ? `For the **${seat.title}** seat.${seat.charter.goal ? ` Seat goal: ${seat.charter.goal}` : ''}\n\n_From the ${tpl.name} company template._` : '' });
      if (sid && saveTask) { task.seat = sid; saveTask(task); }
      made.push(task.id); const g = c.goals.find(x => x.seat === sid); if (g) (g.tasks = g.tasks || []).push(task.id);
    } });
    save(pid, c);
    P.inProject(pid, () => postChat('general', 'tribecode', `🏢 ${c.name} is now a company: ${c.seats.map(x => x.title).join(', ')}.${helper ? ` ${helper.name} holds the open seats.` : ''} Open Company from the sidebar.`));
    return { company: c, tasks: made, helper: helper ? { id: helper.id, name: helper.name } : null };
  }

  // ---------- view ----------
  function who(mid) { const m = mid && member(mid); return m ? { id: m.id, name: m.name, color: m.color, role: m.role, ...(m.avatar ? { avatar: m.avatar } : {}) } : null; }
  function view(pid, me) {
    const c = raw(pid), tasks = c ? projTasks(pid) : [];
    const lead = isLead(me, pid);
    const members = getMembers().filter(m => seeOk(m, pid) && !(m.guestUntil && Date.parse(m.guestUntil) < Date.now()));
    const out = {
      company: c ? { ...c, seats: c.seats.map(x => ({ ...x, who: { person: who(x.holder.person), agent: who(x.holder.agent) } })), goals: c.goals.map(g => ({ ...g, progress: progress(g, tasks) })) } : null,
      canLead: lead, canEdit: lead, mySeats: c ? c.seats.filter(x => holds(x, me.id)).map(x => x.id) : [],
      templates: tplList(), kinds: Object.keys(KINDS).map(k => ({ id: k, title: KIND_TITLE[k], color: KINDS[k] })),
      people: lead ? members.filter(m => m.role !== 'agent' && m.role !== 'spectator').map(m => who(m.id)) : [],
      agents: members.filter(m => m.role === 'agent' && (lead || m.owner === me.id)).map(m => ({ ...who(m.id), owner: m.owner, ownerName: nameOf(m.owner) })),
      myAgent: isPerson(me) && myAgent(me) ? who(myAgent(me).id) : null,
    };
    if (c) {
      out.today = today(pid, c);
      out.decisions = decisions(pid, 12);
      out.waiting = (approvals ? approvals.list() : []).filter(a => a.project === pid && a.status === 'pending').length;
      out.spend = spendLine(pid, c);
    }
    return out;
  }

  // ---------- edits ----------
  function patchSeat(pid, me, sid, body) {
    const c = raw(pid); if (!c) throw err(404, 'not a company');
    const seat = c.seats.find(x => x.id === sid); if (!seat) throw err(404, 'no such seat');
    const lead = isLead(me, pid), mine = holds(seat, me.id);
    if (!lead && !mine) throw err(403, 'only a lead or the seat\'s holder changes it');
    if (!lead && (body.title !== undefined || body.color !== undefined || body.charter !== undefined)) throw err(403, 'only a lead changes the seat\'s name or charter');
    if (body.title !== undefined) seat.title = s(body.title, 40) || seat.title;
    if (body.color !== undefined) seat.color = hex(body.color, seat.color);
    if (body.charter !== undefined) seat.charter = cleanCharter(body.charter, seat.charter);
    if (body.status !== undefined) { if (!STATUSES.includes(body.status)) throw err(400, 'status is on-track, needs-you, blocked or idle'); seat.status = body.status; }
    if (body.last !== undefined) { const t = s(typeof body.last === 'string' ? body.last : body.last && body.last.text, 200); seat.last = t ? { text: t, at: now() } : null; }
    save(pid, c); return seat;
  }
  function assign(pid, me, sid, body) {
    const c = raw(pid); if (!c) throw err(404, 'not a company');
    const seat = c.seats.find(x => x.id === sid); if (!seat) throw err(404, 'no such seat');
    const lead = isLead(me, pid);
    if ('person' in body) {
      if (!lead) throw err(403, 'only a lead picks who holds a seat');
      const pm = body.person ? member(body.person) : null;
      if (body.person && (!pm || pm.role === 'agent' || pm.role === 'spectator' || !P.canSee(pm, pid))) throw err(400, 'pick a person in this project (not a spectator)');
      seat.holder.person = pm ? pm.id : null;
    }
    if ('agent' in body) {
      const am = body.agent ? member(body.agent) : null;
      if (body.agent && (!am || am.role !== 'agent' || !seeOk(am, pid))) throw err(400, 'pick an AI helper that is a member of this project');
      const ownAgentOnOwnSeat = !lead && seat.holder.person === me.id && (!am || am.owner === me.id);
      if (!lead && !ownAgentOnOwnSeat) throw err(403, 'only a lead (or the seat\'s holder, with their own AI) picks the AI helper');
      seat.holder.agent = am ? am.id : null;
    }
    if ((seat.holder.person || seat.holder.agent) && seat.status === 'idle') seat.status = 'on-track';
    if (!seat.holder.person && !seat.holder.agent) seat.status = 'idle';
    save(pid, c);
    const to = [seat.holder.person].filter(x => x && x !== me.id);
    if (to.length && bus) bus.notify({ type: 'company-seat', priority: 'normal', to, from: me.id, title: `${me.name} gave you the ${seat.title} seat`, body: seat.charter.goal || c.name, view: 'company', project: pid });
    if (seat.holder.agent && coord && coord.tell && 'agent' in body && body.agent) { try { coord.tell(seat.holder.agent, 'seat', `You now hold the ${seat.title} seat in ${c.name}. Call my_seat for your charter.`, me.id); } catch {} }
    return seat;
  }
  function addSeat(pid, me, body) {
    const c = raw(pid); if (!c) throw err(404, 'not a company'); if (!isLead(me, pid)) throw err(403, 'only a lead adds seats');
    if (c.seats.length >= MAX_SEATS) throw err(400, `up to ${MAX_SEATS} seats`);
    const kind = KINDS[body.kind] ? body.kind : 'custom';
    if (kind === 'ceo' && c.seats.some(x => x.kind === 'ceo')) throw err(400, 'there is already a CEO seat');
    const seat = seatFrom(kind, s(body.title, 40) || KIND_TITLE[kind], body.charter ? cleanCharter(body.charter) : null, new Set(c.seats.map(x => x.id)));
    c.seats.push(seat); save(pid, c); return seat;
  }
  function goalEdit(pid, me, gid, body, del) {
    const c = raw(pid); if (!c) throw err(404, 'not a company');
    const lead = isLead(me, pid);
    if (!gid) {
      if (!lead) throw err(403, 'only a lead adds goals'); if (c.goals.length >= MAX_GOALS) throw err(400, `up to ${MAX_GOALS} goals`);
      const title = s(body.title, 160); if (!title) throw err(400, 'name the goal');
      let n = c.goals.length + 1; while (c.goals.some(g => g.id === `g${n}`)) n++;
      const g = { id: `g${n}`, title, seat: c.seats.some(x => x.id === body.seat) ? body.seat : null, results: cleanResults(body.results || []), tasks: [] };
      c.goals.push(g); save(pid, c); return g;
    }
    const g = c.goals.find(x => x.id === gid); if (!g) throw err(404, 'no such goal');
    const holder = g.seat && holds(c.seats.find(x => x.id === g.seat), me.id);
    if (del) { if (!lead) throw err(403, 'only a lead removes goals'); c.goals = c.goals.filter(x => x !== g); save(pid, c); return { ok: true }; }
    if (!lead && !holder) throw err(403, 'only a lead or the goal\'s seat updates it');
    if (lead && body.title !== undefined) g.title = s(body.title, 160) || g.title;
    if (lead && body.seat !== undefined) g.seat = c.seats.some(x => x.id === body.seat) ? body.seat : null;
    if (body.results !== undefined) {
      if (lead) g.results = cleanResults(body.results, g.results);
      else if (Array.isArray(body.results)) body.results.slice(0, g.results.length).forEach((r, i) => { const v = Number(r && r.current); if (Number.isFinite(v) && v >= 0) g.results[i].current = Math.min(v, 1e9); });   // holders move the numbers, not the targets
    }
    save(pid, c); return g;
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, parts, me, url, readBody, send, fail }) {
    const pid = parts[1], sub = parts[3] || '', id2 = parts[4] || '', act = parts[5] || '';
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!P.get(pid) || !seeOk(me, pid)) return fail(res, 404, 'project not found');
    try {
      const body = m === 'GET' || m === 'DELETE' ? {} : await readBody(req, 64 * 1024);
      if (!sub && m === 'GET') return send(res, 200, view(pid, me));
      if (!sub && m === 'PUT') {
        if (!isLead(me, pid)) return fail(res, 403, 'only the host or a project lead edits the company');
        let c = raw(pid);
        if (!c || (body.template && !c.on)) { createFrom(pid, me, { template: body.template || 'blank', name: body.name, mission: body.mission, helpers: body.helpers, replace: true }); c = raw(pid); }
        if (body.name !== undefined) c.name = s(body.name, 60) || c.name;
        if (body.mission !== undefined) c.mission = s(body.mission, 400);
        if (body.on !== undefined) c.on = !!body.on;
        if (body.rhythms && typeof body.rhythms === 'object') for (const k of RHYTHMS) if (typeof body.rhythms[k] === 'boolean') c.rhythms[k] = body.rhythms[k];
        save(pid, c); return send(res, 200, view(pid, me));
      }
      if (sub === 'template' && m === 'POST') { const r = createFrom(pid, me, body); return send(res, 200, { ...view(pid, me), tasks: r.tasks, helper: r.helper }); }
      if (sub === 'seats') {
        if (!id2 && m === 'POST') return send(res, 200, { seat: addSeat(pid, me, body) });
        if (id2 === 'reorder' && m === 'POST') {
          if (!isLead(me, pid)) return fail(res, 403, 'only a lead reorders seats');
          const c = raw(pid); if (!c) return fail(res, 404, 'not a company');
          const order = Array.isArray(body.order) ? body.order.map(String) : [];
          const ceo = c.seats.filter(x => x.kind === 'ceo'), rest = c.seats.filter(x => x.kind !== 'ceo');
          rest.sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
          c.seats = [...ceo, ...rest]; save(pid, c); return send(res, 200, { seats: c.seats.map(x => x.id) });
        }
        if (id2 && act === 'assign' && m === 'POST') return send(res, 200, { seat: assign(pid, me, id2, body) });
        if (id2 && !act && m === 'PATCH') return send(res, 200, { seat: patchSeat(pid, me, id2, body) });
        if (id2 && !act && m === 'DELETE') {
          if (!isLead(me, pid)) return fail(res, 403, 'only a lead removes seats');
          const c = raw(pid); const seat = c && c.seats.find(x => x.id === id2); if (!seat) return fail(res, 404, 'no such seat');
          if (seat.kind === 'ceo') return fail(res, 400, 'the CEO seat stays (rename it if you like)');
          c.seats = c.seats.filter(x => x !== seat); c.goals.forEach(g => { if (g.seat === seat.id) g.seat = null; }); save(pid, c); return send(res, 200, { ok: true });
        }
      }
      if (sub === 'goals') {
        if (!id2 && m === 'POST') return send(res, 200, { goal: goalEdit(pid, me, null, body) });
        if (id2 && m === 'PATCH') return send(res, 200, { goal: goalEdit(pid, me, id2, body) });
        if (id2 && m === 'DELETE') return send(res, 200, goalEdit(pid, me, id2, body, true));
      }
      if (sub === 'decisions') {
        if (m === 'GET') return send(res, 200, { decisions: decisions(pid, Math.min(Number(url.searchParams.get('limit')) || 30, 100)) });
        if (m === 'POST') { if (!isPerson(me)) return fail(res, 403, 'AI helpers propose a CEO call with ceo_call; a person decides'); return send(res, 200, { decision: ceoCall(pid, me, body) }); }
      }
      if (sub === 'standups' && m === 'POST') return send(res, 200, { standup: standup(pid, me, body) });
      if (sub === 'check' && m === 'GET') {
        const wid = url.searchParams.get('member'), whom = wid && wid !== me.id ? member(wid) : me;
        if (wid && wid !== me.id && !isLead(me, pid) && !(whom && whom.owner === me.id)) return fail(res, 403, 'leads check other people');
        if (!whom || !seeOk(whom, pid)) return fail(res, 404, 'no such member here');
        return send(res, 200, check(pid, whom, url.searchParams.get('action')));
      }
      if (sub === 'rhythms' && id2 === 'run' && m === 'POST') {
        if (!isLead(me, pid)) return fail(res, 403, 'only the host or a project lead runs rhythms');
        return send(res, 200, runRhythm(pid, String(body.kind || ''), me));
      }
    } catch (e) { return fail(res, e.status || 500, e.status ? e.message : 'company error'); }
    return fail(res, 404, 'no such company route');
  }

  // ---------- MCP (Claude Code) ----------
  const text = (t, isError) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }], ...(isError ? { isError: true } : {}) });
  const S = (props, req = []) => ({ type: 'object', properties: props, required: req, additionalProperties: false });
  const STR = d => ({ type: 'string', description: d });
  const here = () => P.current() || P.defaultId();
  const need = () => { const c = raw(here()); if (!c || !c.on) throw err(404, 'This project is not a company. A lead can make it one from the Company page.'); return c; };
  const wrap = fn => async (a, me) => { try { return text(await fn(a || {}, me)); } catch (e) { return text(e.message, true); } };
  const mcpTools = {
    my_seat: { description: 'Your seat in this company project: its charter (this month\'s goal, what it owns, what you may do, what needs a human\'s yes), the goals linked to it, budget left this week, status and last action. Call it at the start of a session.', inputSchema: S({}),
      run: wrap((a, me) => {
        const c = need(), pid = here(), mine = c.seats.filter(x => holds(x, me.id)), tasks = projTasks(pid), sp = spendLine(pid, c);
        if (!mine.length) return `You hold no seat in ${c.name}. Open seats: ${c.seats.filter(x => !x.holder.agent).map(x => x.title).join(', ') || 'none'}. Ask a human lead to give you one.`;
        return mine.map(x => ({ seat: x.id, title: x.title, company: c.name, mission: c.mission || undefined, charter: x.charter, status: x.status, last: x.last,
          goals: c.goals.filter(g => g.seat === x.id).map(g => ({ id: g.id, title: g.title, progress: progress(g, tasks) + '%', results: g.results })),
          budgetLeftThisWeek: x.charter.budgetWeekly ? (sp.spent === null ? `${x.charter.budgetWeekly} (spending isn't tracked yet)` : Math.max(0, x.charter.budgetWeekly - sp.spent)) : 'no budget: ask before spending anything',
          rules: 'Anything in needsApproval, and anything outward or costly, goes through request_approval first. Post a daily seat_standup.' }));
      }) },
    company_brief: { description: 'The company at a glance: name, mission, goals with progress, every seat (holder, status, last action) and recent decisions.', inputSchema: S({}),
      run: wrap(() => { const c = need(), pid = here(), tasks = projTasks(pid);
        return { name: c.name, mission: c.mission, goals: c.goals.map(g => ({ title: g.title, seat: g.seat, progress: progress(g, tasks) + '%', results: g.results.map(r => `${r.text} ${r.current}/${r.target}${r.unit ? ' ' + r.unit : ''}`) })),
          seats: c.seats.map(x => ({ id: x.id, title: x.title, person: x.holder.person ? nameOf(x.holder.person) : null, agent: x.holder.agent ? nameOf(x.holder.agent) : null, status: x.status, goal: x.charter.goal, last: x.last ? x.last.text : null })),
          recentDecisions: decisions(pid, 5).map(d => `${String(d.at).slice(0, 10)} ${d.kind}: ${d.title}`) }; }) },
    seat_standup: { description: 'Post today\'s standup for your seat: what got done, what\'s next, anything blocking (blocked tells the leads). It also becomes the seat\'s last action.', inputSchema: S({ done: STR('What got done since the last standup'), next: STR('What you do next'), blocked: STR('Anything blocking you (empty if nothing)'), seat: STR('Seat id when you hold more than one') }),
      run: wrap((a, me) => { need(); const r = standup(here(), me, a); return `Standup posted for ${r.seat} (${r.day}).`; }) },
    seat_status: { description: 'Set your seat\'s status (on-track, needs-you, blocked, idle) with a short line about what you just did.', inputSchema: S({ status: { type: 'string', enum: STATUSES }, text: STR('One line: what you did or need'), seat: STR('Seat id when you hold more than one') }, ['status']),
      run: wrap((a, me) => { const c = need(), seat = a.seat ? c.seats.find(x => x.id === a.seat) : c.seats.find(x => holds(x, me.id)); if (!seat) throw err(400, 'You hold no seat here.');
        const x = patchSeat(here(), me, seat.id, { status: a.status, ...(a.text ? { last: a.text } : {}) }); return `${x.title}: ${x.status}${x.last ? ` · ${x.last.text}` : ''}`; }) },
    seat_check: { description: 'Before acting: may your seat do this? Answers yes, ask (use request_approval first) or no, and why. A seat narrows your rights; it never adds any.', inputSchema: S({ action: STR('What you want to do, e.g. "publish the launch post" or "draft posts"') }, ['action']),
      run: wrap((a, me) => { need(); const r = check(here(), me, a.action); return `${r.allowed.toUpperCase()}: ${r.why}`; }) },
    decisions_read: { description: 'Read the company\'s decision log: CEO calls, decided approvals, closed votes and approved proposals, newest first.', inputSchema: S({ limit: { type: 'number', description: 'How many (default 10, max 50)' } }),
      run: wrap(a => { need(); const l = decisions(here(), Math.min(Number(a.limit) || 10, 50)); return l.length ? l.map(d => `${String(d.at).slice(0, 10)} [${d.kind}] ${d.title}${d.why ? ` · ${d.why.slice(0, 160)}` : ''}`).join('\n') : 'No decisions logged yet.'; }) },
    ceo_call: { description: 'Record a CEO call (a decision that stands). People in the CEO seat record it at once; an AI helper PROPOSES it: it becomes an approval request to the CEO (or the leads) and lands in the decision log only if approved.', inputSchema: S({ title: STR('The decision, in one line'), why: STR('Why, in a sentence or two') }, ['title']),
      run: wrap((a, me) => {
        const c = need(), pid = here();
        if (me.role !== 'agent') { const d = ceoCall(pid, me, a); return `Logged CEO call: ${d.title}`; }
        if (!approvals) throw err(503, 'approvals are off');
        const title = s(a.title, 140); if (!title) throw err(400, 'what should be decided?');
        const ceo = c.seats.find(x => x.kind === 'ceo'), to = ceo && ceo.holder.person ? [ceo.holder.person] : leads(pid);
        const ap = approvals.create({ title: `CEO call: ${title}`, details: ml(a.why, 1200), risk: 'medium', kind: 'ceo-call', to }, me);
        return `Proposed to ${to.map(nameOf).join(', ') || 'the leads'} as approval ${ap.id}. If they approve it, it lands in the decision log (check_approval reads the answer).`;
      }) },
  };

  return { route, get, seatOf, seatsOf, list, check, createFrom, onApproval, runRhythm, weeklyReport, decisions, mcpTools, templates: tplList, KINDS, useLedger: fn => { ledgerHook = typeof fn === 'function' ? fn : null; }, sweep };
};
module.exports.KINDS = KINDS;
