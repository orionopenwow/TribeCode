// Approvals: anyone (especially Claude agents over MCP) asks a human before doing something.
// Low/medium risk goes to the agent's owner; high risk (or a human asking) goes to every human.
// Humans decide in the in-app inbox, from an ntfy button, or from a web push action; the last two
// use a signed one-time link minted per recipient by the notification hub.
// Extras: decision comments, questions back to the requester, bulk "approve all low-risk",
// re-notify then escalate to the host when nobody answers, and "always allow" rules for low-risk kinds.
'use strict';

const RISKS = ['low', 'medium', 'high'];
const REMIND_H = Number(process.env.TRIBE_APPROVAL_REMIND_HOURS) || 4;   // re-notify once after this; escalate to the host after twice this

module.exports = function approvals({ store, id, str, bus, getMembers, postChat, broadcast, hub, project = () => undefined, canSee = () => true, now = () => Date.now(), remindHours = REMIND_H, tick = true }) {
  let list = store.readJSON('.tribe/approvals.json', []);
  let rules = store.readJSON('.tribe/approval-rules.json', []);   // { id, owner, agent, kind, created }
  const save = () => { list = list.slice(-500); store.writeJSON('.tribe/approvals.json', list); };
  const saveRules = () => store.writeJSON('.tribe/approval-rules.json', rules);
  const member = mid => getMembers().find(m => m.id === mid);
  const nameOf = mid => (member(mid) || {}).name || 'someone';
  const humans = () => getMembers().filter(m => m.role !== 'agent' && m.role !== 'spectator');
  const hosts = () => getMembers().filter(m => m.role === 'host').map(m => m.id);
  const get = aid => list.find(a => a.id === aid) || null;
  const kindOf = (kind, title) => (str(kind, 60) || String(title).split(/\s+/).slice(0, 2).join(' ')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'general';
  const view = a => a && ({ ...a, questions: a.questions || [], byName: nameOf(a.by), toNames: a.to.map(nameOf), decidedByName: a.decidedBy ? nameOf(a.decidedBy) : null });
  const fail = (status, msg) => { throw Object.assign(new Error(msg), { status }); };
  const notifyAsk = (a, to, title) => bus.notify({ type: 'approval', priority: 'high', to, from: a.by, title: title.slice(0, 160),
    body: `${a.risk[0].toUpperCase() + a.risk.slice(1)} risk${a.details ? ' · ' + a.details.slice(0, 280) : ''}`, view: 'inbox', ref: a.id, approval: a.id,
    actions: [{ id: 'approve', label: 'Approve' }, { id: 'deny', label: 'Deny' }] });

  function create({ title, details, risk, kind, to: askTo }, me) {
    title = str(title, 160) || 'Untitled request';
    risk = RISKS.includes(risk) ? risk : 'medium';
    const owner = me.role === 'agent' && me.owner && member(me.owner) ? me.owner : null;
    let to = risk === 'high' || !owner ? humans().filter(m => canSee(m, project())).map(m => m.id).filter(x => x !== me.id) : [owner];   // only people in the project
    if (Array.isArray(askTo)) { const ok = askTo.filter(x => humans().some(m => m.id === x) && x !== me.id); if (ok.length) to = ok; }   // e.g. the receiving owner of a cross-owner delegation
    if (!to.length) to = hosts();
    const a = { id: `ap-${now().toString(36)}-${id(4).toLowerCase()}`, title, details: str(details, 4000), risk, kind: kindOf(kind, title), by: me.id, to, status: 'pending', created: new Date(now()).toISOString(), questions: [], project: project() || undefined };
    // "Always allow this for my agent": low risk only, never high or medium.
    const rule = owner && risk === 'low' && rules.find(r => r.agent === me.id && r.owner === owner && r.kind === a.kind);
    if (rule) {
      Object.assign(a, { status: 'approved', decidedBy: owner, decidedAt: a.created, note: 'Always allowed', auto: rule.id });
      list.push(a); save(); broadcast({ type: 'approval', approval: view(a) });
      postChat('general', 'tribecode', `✅ Auto-approved **${a.title}** for ${me.name} (always allowed by ${nameOf(owner)})`);
      return view(a);
    }
    list.push(a); save();
    broadcast({ type: 'approval', approval: view(a) });
    notifyAsk(a, to, `${me.name} asks: ${title}`);
    return view(a);
  }

  function decide(aid, decision, who, note, { always = false } = {}) {
    const a = get(aid);
    if (!a) fail(404, 'approval not found');
    if (who.role === 'agent') fail(403, 'agents never decide approvals, not even each other\'s');
    if (!['approve', 'deny'].includes(decision)) fail(400, 'decision must be approve or deny');
    if (!a.to.includes(who.id) && who.role !== 'host') fail(403, 'this request was not addressed to you');
    if (a.status !== 'pending') fail(409, `already ${a.status}`);
    a.status = decision === 'approve' ? 'approved' : 'denied';
    a.decidedBy = who.id; a.decidedAt = new Date(now()).toISOString(); a.note = str(note, 500);
    const req = member(a.by);
    if (always && a.status === 'approved' && a.risk === 'low' && req && req.role === 'agent' && req.owner === who.id && !rules.some(r => r.agent === a.by && r.kind === a.kind)) {
      rules.push({ id: 'r-' + id(6).toLowerCase(), owner: who.id, agent: a.by, kind: a.kind, example: a.title, created: a.decidedAt }); saveRules(); a.ruleAdded = true;
    }
    save();
    postChat('general', 'tribecode', `${a.status === 'approved' ? '✅' : '⛔'} ${who.name} ${a.status} **${a.title}** for ${nameOf(a.by)}${a.note ? `: "${a.note}"` : ''}`);
    broadcast({ type: 'approval', approval: view(a) });
    if (req && req.role !== 'agent' && req.id !== who.id) bus.notify({ type: 'approval-result', priority: 'normal', to: [req.id], from: who.id, title: `${who.name} ${a.status} your request`, body: a.title + (a.note ? ` · "${a.note}"` : ''), view: 'inbox', ref: a.id });
    return view(a);
  }

  // "Ask a question": goes back to the requester. Agents read it from check_approval.
  function question(aid, who, text) {
    const a = get(aid); if (!a) fail(404, 'approval not found');
    text = str(text, 500); if (!text) fail(400, 'question text required');
    if (!a.to.includes(who.id) && who.role !== 'host' && who.id !== a.by) fail(403, 'not your request');
    a.questions = [...(a.questions || []), { by: who.id, name: who.name, at: new Date(now()).toISOString(), text }];
    save(); broadcast({ type: 'approval', approval: view(a) });
    const req = member(a.by);
    if (req && req.role !== 'agent' && req.id !== who.id) bus.notify({ type: 'approval-question', priority: 'high', to: [req.id], from: who.id, title: `${who.name} has a question about your request`, body: `${a.title}: ${text}`, view: 'inbox', ref: a.id });
    return view(a);
  }

  // One tap: approve every pending LOW-risk request addressed to you. Never touches medium/high.
  function bulk(who, note) {
    const out = [];
    for (const a of list.filter(x => x.status === 'pending' && x.risk === 'low' && x.to.includes(who.id))) out.push(decide(a.id, 'approve', who, note || 'Bulk approved (low risk)'));
    return out;
  }

  // Re-notify once after N hours, then escalate to the host after 2N.
  function sweep() {
    const t = now(), h = remindHours * 3600_000;
    for (const a of list.filter(x => x.status === 'pending')) {
      const age = t - Date.parse(a.created);
      if (age >= h && !a.reminded) { a.reminded = new Date(t).toISOString(); save(); notifyAsk(a, a.to, `Still waiting: ${nameOf(a.by)} asks: ${a.title}`); }
      else if (age >= 2 * h && a.reminded && !a.escalated) {
        const hs = hosts().filter(x => x !== a.by);
        a.escalated = new Date(t).toISOString(); a.to = [...new Set([...a.to, ...hs])]; save();
        broadcast({ type: 'approval', approval: view(a) });
        if (hs.length) notifyAsk(a, hs, `Escalated: ${nameOf(a.by)} has waited ${Math.round(age / 3600_000)}h for: ${a.title}`);
      }
    }
  }
  if (tick) setInterval(sweep, 60_000).unref();

  const forMember = me => list.filter(a => a.to.includes(me.id) || a.by === me.id || me.role === 'host').slice(-80).reverse().map(view);

  // /api/approvals[...]. Runs before the bearer-token check: decisions may carry a signed link instead.
  async function route(req, res, { m, b, c, me, url, readBody, send, fail: f }) {
    if (m === 'POST' && b && (c === 'approve' || c === 'deny')) {
      let who = me, signed = false;
      if (!who) { who = hub.verifyAction(b, c, url.searchParams); signed = true; }
      if (!who) return f(res, 401, 'link expired or already used');
      if (who.role === 'agent' || who.role === 'spectator') return f(res, 403, 'only teammates can decide');
      let body = {}; try { body = await readBody(req, 8 * 1024); } catch {}
      const a = decide(b, c, who, body.note, { always: !!body.always });
      return signed ? send(res, 200, `${a.status === 'approved' ? 'Approved' : 'Denied'}: ${a.title}`) : send(res, 200, { approval: a });
    }
    if (!me) return f(res, 401, 'not a member of this tribe');
    if (m === 'GET' && !b) { const all = forMember(me); return send(res, 200, { approvals: all, pending: all.filter(a => a.status === 'pending' && a.to.includes(me.id)).length }); }
    if (b === 'rules') {
      if (m === 'GET' && !c) return send(res, 200, { rules: rules.filter(r => r.owner === me.id).map(r => ({ ...r, agentName: nameOf(r.agent) })) });
      if (m === 'DELETE' && c) { const n = rules.length; rules = rules.filter(r => !(r.id === c && (r.owner === me.id || me.role === 'host'))); saveRules(); return n === rules.length ? f(res, 404, 'rule not found') : send(res, 200, { ok: true }); }
    }
    if (m === 'POST' && b === 'bulk') {
      if (me.role === 'agent' || me.role === 'spectator') return f(res, 403, 'only teammates can decide');
      const body = await readBody(req); return send(res, 200, { approved: bulk(me, body.note) });
    }
    if (m === 'POST' && b && c === 'question') { const body = await readBody(req); return send(res, 200, { approval: question(b, me, body.text) }); }
    if (m === 'GET' && b) { const a = get(b); return a ? send(res, 200, { approval: view(a) }) : f(res, 404, 'approval not found'); }
    if (m === 'POST' && !b) {
      if (me.role === 'spectator') return f(res, 403, 'spectators are read-only');
      const body = await readBody(req); return send(res, 200, { approval: create(body, me) });
    }
    return null;
  }

  return { create, list: () => list.map(view), decide, question, bulk, sweep, get: aid => view(get(aid)), rules: () => rules, route, RISKS };
};
