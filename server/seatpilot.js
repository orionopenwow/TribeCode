// Seat autopilot (v0.27 company mode, phase 4): each seat of a company can run on a schedule. A run never acts on its
// own: it posts the seat's job into #agents for the seat's agent (and its check_messages), and anything the charter says
// needs approval, or that touches health, money advice or the law, becomes a one-tap approval for a human instead.
// Guardrails: a weekly AI budget cap per seat (from the ledger's reported spend), a pause-all switch per project, outreach
// always as the business (a footer), a do-not-contact list, and an audit trail. Sunday-night digest: one notification.
//   GET   /api/projects/:id/seatpilot                    { paused, seats: { [seat]: schedule + next + spend }, dnc, runs, audit }
//   PUT   /api/projects/:id/seatpilot/seats/:seat        { on, every: daily|weekly|weekdays, at: 'HH:MM', day?, tasks: [text] }
//   POST  /api/projects/:id/seatpilot/pause              { paused: true|false }
//   PUT   /api/projects/:id/seatpilot/dnc                { list: ['name@x.com', '@domain.com', 'Some Name'] }
//   POST  /api/projects/:id/seatpilot/run                { seat }   run a seat's job now (the same thing the schedule does)
//   POST  /api/projects/:id/seatpilot/digest             send "what my agents did this week" now (host/admin)
// Stored in <tribe>/projects/<pid>/seatpilot.json. MCP: seat_job (what's my next scheduled job).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { weekStart } = require('./ledger');

const EVERY = ['daily', 'weekdays', 'weekly'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// Compliance: these topics always get a human's eyes (risk high), whatever the charter says.
const COMPLIANCE = [
  ['health', /\b(health|medical|medicine|diagnos\w*|treat(ment|s|ing)?|cure[sd]?|symptom\w*|therap\w*|supplement\w*|prescri\w*|drugs?|clinical|patients?|disease\w*)\b/i],
  ['finance', /\b(invest\w*|stocks?|shares|crypto\w*|bitcoin|returns?|financial advice|loans?|credit|trading|securities|portfolio|dividends?|tax advice)\b/i],
  ['legal', /\b(legal|lawsuit\w*|sue|contracts?|liabilit\w*|attorneys?|lawyers?|terms of (service|use)|privacy policy|gdpr|copyright\w*|trademark\w*|compliance)\b/i],
];
const OUTREACH = /\b(email|e-mail|newsletter|outreach|dm|direct message|message (customers|users|leads)|cold|reach out|contact|post on|tweet|reply to|follow[- ]up)\b/i;

module.exports = function seatpilot({ P, base, broadcast, nameOf, perms, getMembers, approvals, coord, bus, ledger, now = () => Date.now(), tick = true }) {
  const err = (status, m) => Object.assign(new Error(m), { status });
  const str = (v, n) => (typeof v === 'string' ? v.trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : '');
  const company = ledger.company;
  const file = pid => base.p('projects', pid, 'seatpilot.json');
  const load = pid => { let d; try { d = JSON.parse(fs.readFileSync(file(pid), 'utf8')); } catch { d = null; } d = d && typeof d === 'object' ? d : {}; d.seats = d.seats || {}; d.dnc = Array.isArray(d.dnc) ? d.dnc : []; d.runs = Array.isArray(d.runs) ? d.runs : []; d.audit = Array.isArray(d.audit) ? d.audit : []; d.digest = d.digest || {}; return d; };
  const save = (pid, d) => { fs.mkdirSync(path.dirname(file(pid)), { recursive: true }); d.runs = d.runs.slice(-200); d.audit = d.audit.slice(-500); const tmp = file(pid) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, file(pid)); broadcast && broadcast({ type: 'seatpilot', project: pid }); };
  const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const iso = () => new Date(now()).toISOString();
  const audit = (d, by, seat, action, detail) => d.audit.push({ id: rid('a'), at: iso(), by: by || 'tribecode', byName: by && by !== 'tribecode' ? nameOf(by) : 'TribeCode', seat: seat || null, action, detail: String(detail || '').slice(0, 400) });
  const seatOf = (pid, sid) => ((company(pid) || {}).seats || []).find(s => s.id === sid) || null;
  const ceoHolds = (pid, me) => ((company(pid) || {}).seats || []).some(s => s.kind === 'ceo' && s.holder && s.holder.person === me.id);
  const boss = (me, pid) => ledger.isBoss(me, pid);
  const canSteer = (me, pid, seat) => !!me && me.role !== 'agent' && (boss(me, pid) || ceoHolds(pid, me) || (seat && seat.holder && seat.holder.person === me.id));

  // ---------- schedules ----------
  function schedule(d, seat) {
    const s = d.seats[seat.id] || {};
    const ch = seat.charter || {};
    const fromCharter = [ch.goal ? `Move this month's goal forward: ${ch.goal}` : null, ...(Array.isArray(ch.mayDo) ? ch.mayDo : []).slice(0, 4).map(x => String(x))].filter(Boolean);
    return { on: !!s.on, every: EVERY.includes(s.every) ? s.every : 'weekdays', at: /^\d{2}:\d{2}$/.test(s.at || '') ? s.at : '09:00', day: DAYS.includes(s.day) ? s.day : 'mon',
      tasks: Array.isArray(s.tasks) && s.tasks.length ? s.tasks : fromCharter, custom: Array.isArray(s.tasks) && s.tasks.length > 0, lastRun: s.lastRun || null, enabledAt: s.enabledAt || null };
  }
  // The next time this schedule fires, in the host computer's local time.
  function nextAt(sch, from = new Date(now())) {
    if (!sch.on) return null;
    const [h, mi] = sch.at.split(':').map(Number);
    for (let i = 0; i < 9; i++) {
      const t = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, h, mi, 0, 0);
      if (t <= from) continue;
      const wd = t.getDay();
      if (sch.every === 'weekdays' && (wd === 0 || wd === 6)) continue;
      if (sch.every === 'weekly' && DAYS[wd] !== sch.day) continue;
      return t.toISOString();
    }
    return null;
  }
  const budgetOf = seat => Number((seat.charter || {}).budgetWeekly) || 0;

  // ---------- a run ----------
  const risky = text => COMPLIANCE.filter(([, re]) => re.test(text)).map(([k]) => k);
  function needsOk(text, list) {
    const t = String(text).toLowerCase();
    return (Array.isArray(list) ? list : []).map(x => String(x).toLowerCase().trim()).filter(Boolean).find(item => {
      if (t.includes(item)) return true;
      const words = item.split(/\s+/).filter(w => w.length > 2);
      return words.length && words.every(w => new RegExp('\\b' + w.replace(/[^a-z0-9]/g, '').slice(0, Math.max(4, w.length - 2)), 'i').test(t));
    }) || null;
  }
  function footer(co) { return `— Sent by ${co.name || 'our team'}. You're getting this because you asked to hear from us; reply "stop" and we won't contact you again.`; }

  function run(pid, seatId, me, trigger = 'manual') {
    const co = company(pid); if (!co) throw err(404, 'this project isn\'t a company yet');
    const seat = seatOf(pid, seatId); if (!seat) throw err(404, `no seat "${String(seatId).slice(0, 40)}"`);
    const d = load(pid), sch = schedule(d, seat), by = me ? me.id : 'tribecode';
    const block = (reason) => { const r = { id: rid('r'), seat: seat.id, at: iso(), by, trigger, status: 'blocked', reason }; d.runs.push(r); audit(d, by, seat.id, 'run-blocked', reason); save(pid, d); return r; };
    if (d.paused) { const r = block('Autopilot is paused for this project.'); throw Object.assign(err(409, r.reason), { run: r }); }
    const budget = budgetOf(seat), spent = ledger.spentThisWeek(pid, seat.id);
    if (budget > 0 && spent >= budget) { const r = block(`Weekly AI budget used (${spent} of ${budget}).`); throw Object.assign(err(409, r.reason), { run: r }); }
    if (!sch.tasks.length) { const r = block('No tasks: add some to the schedule or the seat\'s charter.'); throw Object.assign(err(400, r.reason), { run: r }); }
    const agent = seat.holder && seat.holder.agent ? member(seat.holder.agent) : null;
    const person = seat.holder && seat.holder.person ? member(seat.holder.person) : null;
    const asker = agent && agent.role === 'agent' ? agent : { id: 'tribecode', name: `${seat.title || seat.id} autopilot`, role: 'system' };
    const ch = seat.charter || {};
    const items = [], aps = [];
    P.inProject(pid, () => {
      for (const task of sch.tasks.slice(0, 12)) {
        const text = str(task, 400); if (!text) continue;
        const topics = risky(text), gate = needsOk(text, ch.needsApproval), outreach = OUTREACH.test(text);
        const it = { text, topics, gate, outreach, risk: topics.length ? 'high' : gate ? 'medium' : 'low' };
        if (topics.length || gate) {
          const why = [gate ? `the ${seat.title || seat.id} charter says "${gate}" needs approval` : null, topics.length ? `it touches ${topics.join(', ')} topics, which always get a human review` : null].filter(Boolean).join(' and ');
          const ap = approvals.create({ title: `${seat.title || seat.id}: ${text}`.slice(0, 160), risk: it.risk, kind: `seat-${seat.kind || 'custom'}`,
            details: `Seat autopilot (${trigger}) wants to do this, and waits because ${why}.${outreach ? `\n\nOutreach goes out as ${co.name || 'the business'}, with this footer:\n${footer(co)}` : ''}${d.dnc.length ? `\n\nNever contact: ${d.dnc.join(', ')}` : ''}\n\nThis is a starting point, not legal or financial advice.` }, asker);
          it.approval = ap.id; aps.push(ap.id);
        }
        items.push(it);
      }
    });
    const lines = items.map((it, i) => `${i + 1}. ${it.text}${it.approval ? ` — WAIT for approval ${it.approval} (check_approval) before doing this${it.topics.length ? ` [${it.topics.join(', ')}: human review]` : ''}` : ''}`);
    const guard = [items.some(i => i.outreach) ? `Outreach: always as ${co.name || 'the business'}, never as a person, and end with: "${footer(co)}"` : null,
      d.dnc.length ? `Do not contact: ${d.dnc.join(', ')}` : null,
      budget ? `Budget: ${spent} of ${budget} used this week; report_spend after you work and stop if you go over.` : 'Report your AI spend with report_spend.',
      'Anything outward or costly (money, publishing, customer emails, contracts, deploys) needs a human approval first.'].filter(Boolean);
    const who = agent ? agent.name : person ? `${person.name} (no agent on this seat yet)` : 'whoever takes this seat';
    const text = `🗓 Seat job · ${seat.title || seat.id} → ${who}\n${lines.join('\n')}\nGuardrails: ${guard.join(' · ')}`;
    const msg = { id: rid('m'), at: iso(), by: 'tribecode', text: text.slice(0, 4000), thread: 'seat-' + seat.id, kind: 'seat-job', seat: seat.id, to: agent ? agent.id : null };
    base.appendJSONL(`chat/agents-${pid}.jsonl`, msg);
    broadcast && broadcast({ type: 'chat', channel: 'agents', project: pid, message: msg });
    if (agent && coord && coord.tell) try { P.inProject(pid, () => coord.tell(agent.id, 'seat-job', text.slice(0, 1800), 'tribecode')); } catch {}
    if (!agent && person && bus) bus.notify({ type: 'seat-job', to: [person.id], from: 'tribecode', title: `Your ${seat.title || seat.id} seat has a job`, body: items.map(i => i.text).join(' · ').slice(0, 280), view: 'coord', ref: seat.id });
    const r = { id: rid('r'), seat: seat.id, at: iso(), by, trigger, status: 'posted', jobs: items.length, approvals: aps, high: items.filter(i => i.risk === 'high').length, message: msg.id, to: agent ? agent.id : null, tasks: items.map(i => ({ text: i.text, risk: i.risk, approval: i.approval || null, topics: i.topics })) };
    d.runs.push(r); d.seats[seat.id] = { ...(d.seats[seat.id] || {}), lastRun: r.at };
    audit(d, by, seat.id, 'run', `${items.length} job${items.length === 1 ? '' : 's'}${aps.length ? `, ${aps.length} waiting for approval` : ''} (${trigger})`);
    save(pid, d);
    return r;
  }

  // ---------- weekly digest ----------
  function digest(pid, send = false) {
    const co = company(pid); if (!co) return null;
    const d = load(pid), since = weekStart(new Date(now())).toISOString();
    const runs = d.runs.filter(r => r.at >= since), w = ledger.aiWeek(pid);
    const per = co.seats.map(s => { const rs = runs.filter(r => r.seat === s.id); const sp = w.seats.find(x => x.seat === s.id) || {}; return { seat: s.id, title: s.title || s.id, runs: rs.filter(r => r.status === 'posted').length, jobs: rs.reduce((n, r) => n + (r.jobs || 0), 0), approvals: rs.reduce((n, r) => n + (r.approvals || []).length, 0), blocked: rs.filter(r => r.status === 'blocked').length, spent: sp.spent || 0, budget: sp.budget || 0 }; }).filter(x => x.runs || x.blocked || x.spent);
    const body = per.length ? per.map(x => `${x.title}: ${x.jobs} job${x.jobs === 1 ? '' : 's'}${x.approvals ? `, ${x.approvals} asked you first` : ''}${x.blocked ? `, ${x.blocked} blocked` : ''}${x.spent ? `, ${w.currency} ${x.spent}${x.budget ? ' of ' + x.budget : ''} AI` : ''}`).join(' · ') : 'Your agents had no scheduled jobs this week.';
    const out = { week: since.slice(0, 10), title: `What your agents did this week · ${co.name || 'your company'}`, body, seats: per };
    if (send && bus) {
      const to = [...new Set([...getMembers().filter(m => m.role === 'host' && P.canSee(m, pid)).map(m => m.id), ...co.seats.map(s => s.holder && s.holder.person).filter(x => x && member(x))])];
      if (to.length) bus.notify({ type: 'digest', priority: 'normal', to, from: 'tribecode', title: out.title.slice(0, 160), body: body.slice(0, 600), view: 'home', ref: 'seatpilot-' + pid });
      d.digest = { last: iso(), to: to.length }; audit(d, 'tribecode', null, 'digest', body); save(pid, d); out.sent = to.length;
    }
    return out;
  }

  // ---------- the clock ----------
  function sweep() {
    const t = new Date(now());
    for (const p of P.all()) {
      const pid = p.id; if (!fs.existsSync(file(pid))) continue;
      const co = company(pid); if (!co) continue;
      const d = load(pid);
      if (!d.paused) for (const seat of co.seats) {
        const sch = schedule(d, seat); if (!sch.on) continue;
        const from = new Date(Math.max(Date.parse(sch.lastRun || 0) || 0, Date.parse(sch.enabledAt || 0) || 0) || (t.getTime() - 26 * 3600e3)); const due = nextAt(sch, from);
        if (due && Date.parse(due) <= t.getTime() && t.getTime() - Date.parse(due) < 6 * 3600e3) { try { run(pid, seat.id, null, 'schedule'); } catch (e) { if (!e.run) console.error('seatpilot:', e.message); } }
      }
      // the digest: once a week, Sunday evening or later
      const ws = weekStart(t).getTime(), sundayEve = ws + 6 * 864e5 + 18 * 3600e3;
      if (t.getTime() >= sundayEve && !(d.digest.last && Date.parse(d.digest.last) >= sundayEve) && d.runs.some(r => Date.parse(r.at) >= ws)) { try { digest(pid, true); } catch (e) { console.error('seatpilot digest:', e.message); } }
    }
  }
  if (tick) setInterval(() => { try { sweep(); } catch (e) { console.error('seatpilot:', e.message); } }, 60_000).unref();

  function state(pid, me) {
    const co = company(pid), d = load(pid), w = ledger.aiWeek(pid);
    const seats = {};
    for (const s of (co ? co.seats : [])) { const sch = schedule(d, s), sp = w.seats.find(x => x.seat === s.id) || {}; seats[s.id] = { ...sch, next: d.paused ? null : nextAt(sch), title: s.title || s.id, kind: s.kind, color: s.color || null, holder: s.holder || {}, holderNames: { person: s.holder && s.holder.person && member(s.holder.person) ? nameOf(s.holder.person) : null, agent: s.holder && s.holder.agent && member(s.holder.agent) ? nameOf(s.holder.agent) : null }, budget: budgetOf(s), spent: sp.spent || 0, needsApproval: (s.charter || {}).needsApproval || [], canSteer: canSteer(me, pid, s) }; }
    return { company: co ? { name: co.name || '' } : null, paused: !!d.paused, pausedBy: d.pausedBy ? nameOf(d.pausedBy) : null, pausedAt: d.pausedAt || null, seats, dnc: d.dnc, currency: w.currency,
      runs: d.runs.slice(-30).reverse(), audit: d.audit.slice(-40).reverse(), digest: d.digest, canSteer: canSteer(me, pid, null) };
  }

  async function route(req, res, { m, b: pid, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'sign in first');
    if (!P.get(pid) || !ledger.canRead(me, pid)) return fail(res, 404, 'project not found');
    const sub = parts[3] || '', sub2 = parts[4] || '';
    if (!sub && m === 'GET') return send(res, 200, state(pid, me));
    if (sub === 'seats' && sub2 && m === 'PUT') {
      const seat = seatOf(pid, sub2); if (!seat) throw err(404, 'no such seat');
      if (!canSteer(me, pid, seat)) throw err(403, 'only the host, an admin, the CEO or this seat\'s holder changes its autopilot');
      const body = await readBody(req, 16 * 1024), d = load(pid), cur = d.seats[seat.id] || {};
      const next = { ...cur };
      if (body.on !== undefined) { if (body.on && !cur.on) next.enabledAt = iso(); next.on = !!body.on; }
      if (body.every !== undefined) { if (!EVERY.includes(body.every)) throw err(400, 'every is daily, weekdays or weekly'); next.every = body.every; }
      if (body.at !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.at)) throw err(400, 'at is a time like 09:00'); next.at = body.at; }
      if (body.day !== undefined) { if (!DAYS.includes(body.day)) throw err(400, 'day is mon … sun'); next.day = body.day; }
      if (body.tasks !== undefined) { if (!Array.isArray(body.tasks)) throw err(400, 'tasks is a list'); next.tasks = body.tasks.map(t => str(t, 400)).filter(Boolean).slice(0, 12); }
      d.seats[seat.id] = next; audit(d, me.id, seat.id, 'schedule', `${next.on ? 'on' : 'off'} · ${next.every || 'weekdays'} at ${next.at || '09:00'} · ${(next.tasks || []).length} tasks`); save(pid, d);
      return send(res, 200, state(pid, me));
    }
    if (sub === 'pause' && m === 'POST') {
      if (!canSteer(me, pid, null)) throw err(403, 'only the host, an admin or the CEO pauses the autopilot');
      const body = await readBody(req, 1024), d = load(pid);
      d.paused = !!body.paused; d.pausedBy = d.paused ? me.id : null; d.pausedAt = d.paused ? iso() : null;
      audit(d, me.id, null, d.paused ? 'pause-all' : 'resume-all', ''); save(pid, d);
      return send(res, 200, state(pid, me));
    }
    if (sub === 'dnc' && m === 'PUT') {
      if (!canSteer(me, pid, null)) throw err(403, 'only the host, an admin or the CEO edits the do-not-contact list');
      const body = await readBody(req, 64 * 1024), d = load(pid);
      if (!Array.isArray(body.list)) throw err(400, 'list is a list');
      d.dnc = [...new Set(body.list.map(x => str(x, 120)).filter(Boolean))].slice(0, 500);
      audit(d, me.id, null, 'do-not-contact', `${d.dnc.length} entries`); save(pid, d);
      return send(res, 200, state(pid, me));
    }
    if (sub === 'run' && m === 'POST') {
      const body = await readBody(req, 2048), seat = seatOf(pid, str(body.seat, 40));
      if (!seat) throw err(404, 'no such seat');
      if (!canSteer(me, pid, seat)) throw err(403, 'only the host, an admin, the CEO or this seat\'s holder runs its autopilot');
      try { return send(res, 200, { run: run(pid, seat.id, me, 'manual') }); }
      catch (e) { if (e.run) return send(res, e.status || 409, { error: e.message, run: e.run }); throw e; }
    }
    if (sub === 'digest' && m === 'POST') {
      if (!boss(me, pid)) throw err(403, 'only the host or an admin sends the digest');
      return send(res, 200, { digest: digest(pid, true) });
    }
    if (sub === 'digest' && m === 'GET') return send(res, 200, { digest: digest(pid, false) });
    return fail(res, 404, 'not found');
  }

  const reply = (t, e) => ({ content: [{ type: 'text', text: t }], ...(e ? { isError: true } : {}) });
  const mcpTools = {
    seat_job: {
      description: 'Your company seat\'s autopilot: which seat you hold, the next scheduled job (time + tasks), the guardrails (what needs approval, do-not-contact list, budget used this week) and the last run. Call it when you start, then do the tasks posted to you in #agents.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: (_a, me) => {
        const pid = P.current() || P.defaultId(), co = company(pid);
        if (!co) return reply('This project is not a company (no seats), so there is no scheduled job.');
        const mine = co.seats.filter(s => s.holder && (s.holder.agent === me.id || (me.owner && s.holder.person === me.owner && !s.holder.agent)));
        if (!mine.length) return reply('You don\'t hold a seat in this company. Ask the host to assign you one (Company › seats).');
        const d = load(pid);
        return reply(mine.map(s => {
          const sch = schedule(d, s), last = d.runs.filter(r => r.seat === s.id).slice(-1)[0], ch = s.charter || {};
          return [`Seat: ${s.title || s.id} (${s.kind})${ch.goal ? ` · goal: ${ch.goal}` : ''}`,
            d.paused ? 'Autopilot is PAUSED for this project: do not start scheduled work.' : sch.on ? `Next job: ${nextAt(sch) || 'not scheduled'} (${sch.every} at ${sch.at})` : 'Autopilot is off for this seat (jobs come only when a human runs it).',
            `Tasks:\n${sch.tasks.map((t, i) => `  ${i + 1}. ${t}`).join('\n') || '  (none yet)'}`,
            `Needs a human's approval first: ${(ch.needsApproval || []).join(', ') || 'anything outward or costly'}`,
            `Budget this week: ${ledger.spentThisWeek(pid, s.id)} of ${budgetOf(s) || 'no cap'} (report_spend after you work)`,
            d.dnc.length ? `Do not contact: ${d.dnc.join(', ')}` : null,
            last ? `Last run: ${last.at.slice(0, 16).replace('T', ' ')} · ${last.status}${last.reason ? ' · ' + last.reason : ''}` : 'No runs yet.'].filter(Boolean).join('\n');
        }).join('\n\n'));
      },
    },
  };

  return { route, mcpTools, run, digest, sweep, state, nextAt, risky };
};
