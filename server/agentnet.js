// Agents talking to agents, per project:
//   #agents         a shared channel every connected agent reads/posts over MCP (agents_read, agents_post);
//                   humans see it and can @mention into it (GET/POST /api/agents/channel). It is broadcast
//                   as an ordinary `chat` message on channel `agents`, so it renders like any channel.
//   message_agent   direct agent-to-agent notes; they land in the recipient's check_messages (coord inbox)
//                   and are mirrored into #agents so both owners can see them.
//   delegate        create/assign a task for another agent (or the best one: lanes, load, owner online);
//                   the target answers accept_delegation / decline_delegation. Cross-owner delegation of
//                   medium or high risk waits for the receiving owner's one-tap approval (approvals.js).
//   recommend       an agent suggests work to humans; it lands in their Updates inbox.
// Safety: posts are rate-limited per agent, agents never decide approvals, and a thread stops after
// MAX_HOPS agent messages without a human message in between (loop protection).
'use strict';

const MAX_HOPS = Number(process.env.TRIBE_AGENT_HOPS) || 6;
const RATE = { n: Number(process.env.TRIBE_AGENT_RATE) || 10, ms: 60_000 };

module.exports = function agentnet({ P, store, id, str, broadcast, bus, getMembers, presenceFor, loadTasks, saveTask, createTask, approvals, coord, nameOf }) {
  const FILE = '.tribe/agentnet.json';
  const db = Object.assign({ delegations: [], recommendations: [], hops: {}, read: {} }, store.readJSON(FILE, {}));
  const save = () => { db.delegations = db.delegations.slice(-300); db.recommendations = db.recommendations.slice(-300); store.writeJSON(FILE, db); };
  const pid = () => P.current() || P.defaultId();
  const file = p => `chat/agents-${p}.jsonl`;
  const now = () => new Date().toISOString();
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const isAgent = m => !!m && m.role === 'agent';
  const agentsHere = () => getMembers().filter(m => isAgent(m) && P.canSee(member(m.owner) || m, pid()));
  const recent = new Map();   // agent id -> timestamps of posts

  function limit(me) {
    const t = (recent.get(me.id) || []).filter(x => Date.now() - x < RATE.ms);
    if (t.length >= RATE.n) throw err(429, `Slow down: at most ${RATE.n} agent messages a minute. Batch your thoughts into one message.`);
    t.push(Date.now()); recent.set(me.id, t);
  }
  // Loop protection: count agent messages per thread since the last human message.
  function hop(thread, me) {
    const k = `${pid()}:${thread}`;
    const n = (db.hops[k] || 0) + 1;
    if (n > MAX_HOPS) throw err(429, `Loop protection: ${MAX_HOPS} agent messages on thread ${thread} without a human. Ask your owner with reply before continuing.`);
    db.hops[k] = n;
  }
  function humanSpoke(thread) { const pre = `${pid()}:`; for (const k of Object.keys(db.hops)) if (k.startsWith(pre) && (!thread || k === pre + thread)) delete db.hops[k]; save(); }

  // "Claude · Maya", "maya", "@maya's-claude", "maya's claude", or an id.
  function resolve(to, me) {
    const q = String(to || '').trim().replace(/^@/, '').toLowerCase(); if (!q) return null;
    const list = agentsHere().filter(a => !me || a.id !== me.id);
    const owned = q.match(/^(.+?)['’]s[\s-]*claude$/);
    if (owned) { const o = getMembers().find(m => !isAgent(m) && m.name.toLowerCase() === owned[1].trim()); return o ? list.find(a => a.owner === o.id) || null : null; }
    return list.find(a => a.id.toLowerCase() === q) || list.find(a => a.name.toLowerCase() === q)
      || list.find(a => a.name.toLowerCase().replace(/^claude\s*·\s*/, '') === q)
      || list.find(a => (member(a.owner) || {}).name && member(a.owner).name.toLowerCase() === q) || null;
  }

  // ---------- the #agents channel ----------
  function post(by, text, extra = {}) {
    const msg = { id: id(12), at: now(), by, text: str(text, 4000), thread: extra.thread || null, ...extra };
    store.appendJSONL(file(pid()), msg);
    broadcast({ type: 'chat', channel: 'agents', project: pid(), message: msg });
    return msg;
  }
  const read = (n = 30) => store.readJSONL(file(pid()), Math.min(Number(n) || 30, 200));
  const fmt = x => `[${x.at.slice(11, 16)}] ${nameOf(x.by)}${x.to ? ' → ' + nameOf(x.to) : ''}${x.thread ? ` (thread ${x.thread})` : ''}: ${x.text}`;

  // ---------- delegation ----------
  function recommendAgent(me, files = []) {
    const own = coord.ownership(me), people = presenceFor(me), tasks = loadTasks();
    const covers = (area, f) => f === area || f.startsWith(area.endsWith('/') ? area : area + '/');
    const scored = agentsHere().filter(a => a.id !== me.id).map(a => {
      const lanes = own.lanes.filter(l => l.owner === a.id || l.owner === a.owner).map(l => l.area);
      const match = files.filter(f => lanes.some(l => covers(l, f))).length;
      const load = tasks.filter(t => t.assignee === a.id && t.status !== 'done').length;
      const ownerOn = !!(people.find(p => p.id === a.owner) || {}).online, on = !!(people.find(p => p.id === a.id) || {}).online;
      return { a, score: match * 3 - load + (ownerOn ? 1 : 0) + (on ? 1 : 0), why: [match ? `owns ${match} of the files` : null, `${load} open task${load === 1 ? '' : 's'}`, ownerOn ? 'owner online' : null].filter(Boolean).join(', ') };
    }).sort((x, y) => y.score - x.score);
    return scored[0] || null;
  }
  const dview = d => ({ ...d, fromName: nameOf(d.from), toName: nameOf(d.to), taskTitle: (loadTasks().find(t => t.id === d.task) || {}).title || '' });
  function deliver(d) {
    d.status = 'pending'; d.delivered = now();
    coord.tell(d.to, 'delegation', `${nameOf(d.from)} delegates "${dview(d).taskTitle}" (task ${d.task}) to you. Why: ${d.why || '-'}${d.files.length ? `. Files: ${d.files.join(', ')}` : ''}. Answer with accept_delegation id=${d.id} or decline_delegation id=${d.id} reason=…`, d.from);
  }
  function delegate({ to, task_id, title, why, files, risk }, me) {
    if (!isAgent(me)) throw err(403, 'only agents delegate this way; humans assign tasks on the board');
    limit(me);
    files = (Array.isArray(files) ? files : String(files || '').split(/[,\n]/)).map(f => str(f, 200)).filter(Boolean).slice(0, 30);
    let target = to ? resolve(to, me) : null, why2 = '';
    if (to && !target) throw err(404, `No agent called "${to}" in this project (agents_read shows who is around).`);
    if (!target) { const r = recommendAgent(me, files); if (!r) throw err(404, 'No other agent in this project to delegate to.'); target = r.a; why2 = r.why; }
    let t = task_id ? loadTasks().find(x => x.id === task_id) : null;
    if (task_id && !t) throw err(404, `No task ${task_id}`);
    if (!t) { if (!str(title, 200)) throw err(400, 'give a task_id or a title'); t = createTask({ title, by: me.id, source: 'delegation', body: str(why, 2000) }); }
    risk = ['low', 'medium', 'high'].includes(risk) ? risk : 'low';
    const crossOwner = target.owner !== me.owner;
    const thread = 'd-' + id(6).toLowerCase();
    hop(thread, me);
    const d = { id: thread, from: me.id, to: target.id, task: t.id, why: str(why, 2000), files, risk, crossOwner, status: 'new', created: now(), project: pid(), picked: why2 || null };
    if (crossOwner && risk !== 'low') {
      const ap = approvals.create({ title: `${me.name} wants to delegate "${t.title}" to ${target.name}`, details: `${d.why}${files.length ? `\n\nFiles: ${files.join(', ')}` : ''}`, risk, kind: 'delegation', to: [target.owner] }, me);
      d.approval = ap.id; d.status = 'awaiting-approval';
    } else deliver(d);
    db.delegations.push(d); save();
    post(me.id, `📋 Delegating "${t.title}" to ${target.name}${why2 ? ` (picked: ${why2})` : ''}${d.why ? ` · ${d.why}` : ''}${d.status === 'awaiting-approval' ? ` · waiting for ${nameOf(target.owner)} to approve` : ''}`, { thread, to: target.id, kind: 'delegation' });
    const owners = [...new Set([me.owner, target.owner])].filter(Boolean);
    bus.notify({ type: 'delegation', to: owners, from: me.id, title: `${me.name} → ${target.name}: ${t.title}`.slice(0, 160), body: d.status === 'awaiting-approval' ? 'Needs your approval' : (d.why || '').slice(0, 200), view: d.status === 'awaiting-approval' ? 'inbox' : 'coord', ref: d.id });
    return dview(d);
  }
  function sync() {   // approvals decided anywhere (inbox, phone) release or cancel waiting delegations
    let changed = false;
    for (const d of db.delegations.filter(x => x.status === 'awaiting-approval')) {
      const ap = approvals.get(d.approval); if (!ap || ap.status === 'pending') continue;
      P.inProject(d.project || P.defaultId(), () => {
        if (ap.status === 'approved') { deliver(d); post(ap.decidedBy, `✅ ${nameOf(ap.decidedBy)} approved the delegation to ${nameOf(d.to)}.`, { thread: d.id, kind: 'delegation' }); humanSpoke(d.id); }
        else { d.status = 'blocked'; coord.tell(d.from, 'delegation', `${nameOf(ap.decidedBy)} did not approve delegating task ${d.task} to ${nameOf(d.to)}${ap.note ? ': ' + ap.note : '.'}`, ap.decidedBy); }
      });
      changed = true;
    }
    if (changed) save();
  }
  setInterval(sync, 3000).unref();
  function answer(did, accept, reason, me) {
    sync();
    const d = db.delegations.find(x => x.id === did && (x.project || P.defaultId()) === pid());
    if (!d) throw err(404, `No delegation ${did}`);
    if (d.to !== me.id) throw err(403, 'this delegation is not addressed to you');
    if (d.status === 'awaiting-approval') throw err(409, `waiting for ${nameOf(member(d.to).owner)} to approve it first`);
    if (d.status !== 'pending') throw err(409, `already ${d.status}`);
    hop(d.id, me);
    d.status = accept ? 'accepted' : 'declined'; d.answered = now(); d.reason = str(reason, 500);
    if (accept) { const t = loadTasks().find(x => x.id === d.task); if (t) { t.assignee = me.id; if (t.status === 'backlog') t.status = 'doing'; t.updated = now(); t.updatedBy = me.id; saveTask(t); } }
    coord.tell(d.from, 'delegation', `${me.name} ${accept ? 'accepted' : 'declined'} task ${d.task}${d.reason ? ': ' + d.reason : '.'}`, me.id);
    post(me.id, `${accept ? '👍 Accepted' : '↩️ Declined'} "${dview(d).taskTitle}"${d.reason ? ` · ${d.reason}` : ''}`, { thread: d.id, to: d.from, kind: 'delegation' });
    save();
    return dview(d);
  }

  // ---------- recommendations to humans ----------
  function recommend({ to_human, text, task_id }, me) {
    if (!isAgent(me)) throw err(403, 'agents only');
    limit(me);
    const tx = str(text, 1000); if (!tx) throw err(400, 'say what you recommend');
    const human = to_human ? getMembers().find(m => !isAgent(m) && (m.id === to_human || m.name.toLowerCase() === String(to_human).toLowerCase().replace(/^@/, ''))) : member(me.owner);
    if (to_human && !human) throw err(404, `No person called "${to_human}"`);
    const r = { id: 'rc-' + id(6).toLowerCase(), by: me.id, to: human ? human.id : null, text: tx, task: task_id || null, at: now(), project: pid() };
    db.recommendations.push(r); save();
    bus.notify({ type: 'recommendation', to: human ? [human.id] : getMembers().filter(m => !isAgent(m) && m.role !== 'spectator' && P.canSee(m, pid())).map(m => m.id), from: me.id, title: `${me.name} suggests`, body: tx.slice(0, 280), view: task_id ? 'tasks' : 'coord', ref: task_id || r.id });
    return r;
  }

  // ---------- MCP ----------
  function mcpTools({ text, err: mErr, S, str: d }) {
    const wrap = fn => async (a, me) => { try { return await fn(a, me); } catch (e) { return mErr(e.message); } };
    return {
      agents_read: {
        description: 'Read the #agents channel of this project: what the other agents (and humans @mentioning agents) said, delegations and their answers. Check it when you start and between steps.',
        inputSchema: S({ limit: { type: 'number', description: 'How many (default 30)' } }),
        run: wrap(({ limit: n }, me) => { const list = read(n); db.read[me.id] = now(); save(); return text(list.length ? list.map(fmt).join('\n') : '#agents is quiet. Introduce what you are working on with agents_post.'); }),
      },
      agents_post: {
        description: 'Post to the #agents channel (all agents in the project and their humans see it). Use it to announce what you are on, ask who owns something, or coordinate. Pass thread to continue a conversation.',
        inputSchema: S({ text: d('Message'), thread: d('Thread id to continue (optional)') }, ['text']),
        run: wrap(({ text: t, thread }, me) => { limit(me); const th = str(thread, 40) || 't-' + id(6).toLowerCase(); hop(th, me); post(me.id, t, { thread: th }); save(); return text(`Posted to #agents (thread ${th}).`); }),
      },
      message_agent: {
        description: 'Send a direct note to another agent. `to` is an agent name (e.g. "Claude · Maya") or "@maya\'s-claude". It shows up in their check_messages; both owners can see it in #agents. Reply by messaging back with the same thread.',
        inputSchema: S({ to: d('Agent name, or @owner\'s-claude'), text: d('Message'), thread: d('Thread id to continue (optional)') }, ['to', 'text']),
        run: wrap(({ to, text: t, thread }, me) => {
          limit(me);
          const target = resolve(to, me); if (!target) throw err(404, `No agent "${to}" here. agents_read shows who is around.`);
          const th = str(thread, 40) || 't-' + id(6).toLowerCase(); hop(th, me);
          coord.tell(target.id, 'agent', `${str(t, 2000)}  (thread ${th}; answer with message_agent to="${me.name}" thread="${th}")`, me.id);
          post(me.id, t, { thread: th, to: target.id, kind: 'dm' }); save();
          return text(`Sent to ${target.name} (thread ${th}).`);
        }),
      },
      delegate: {
        description: 'Hand a task to another agent: pass task_id (or a title to create one), why, and optionally files. Leave `to` empty and TribeCode picks the best agent (owns the files, lightest load, owner online). Cross-owner delegations of medium/high risk wait for the other owner\'s approval. The target answers with accept_delegation/decline_delegation.',
        inputSchema: S({ to: d('Agent name or @owner\'s-claude (optional)'), task_id: d('Existing task id (optional)'), title: d('New task title if no task_id'), why: d('Why them, what done looks like'), files: d('Comma-separated paths (optional)'), risk: { type: 'string', enum: ['low', 'medium', 'high'] } }, ['why']),
        run: wrap((a, me) => { const r = delegate(a, me); return text({ delegation: r.id, to: r.toName, task: r.task, status: r.status, picked: r.picked || undefined, next: r.status === 'awaiting-approval' ? `Waiting for ${nameOf(member(r.to).owner)} to approve. You will hear back in check_messages.` : 'They will accept or decline; check_messages tells you.' }); }),
      },
      accept_delegation: { description: 'Accept a delegation addressed to you (the task becomes yours, in doing).', inputSchema: S({ id: d('Delegation id') }, ['id']), run: wrap(({ id: did }, me) => { const r = answer(did, true, '', me); return text(`Accepted. Task ${r.task} is yours: claim files, then work.`); }) },
      decline_delegation: { description: 'Decline a delegation addressed to you, with a reason (busy, wrong lane, blocked…).', inputSchema: S({ id: d('Delegation id'), reason: d('Why') }, ['id', 'reason']), run: wrap(({ id: did, reason }, me) => { answer(did, false, reason, me); return text('Declined. The delegating agent has been told.'); }) },
      recommend: {
        description: 'Suggest work or an improvement to a human (your owner by default). It lands in their Updates inbox. Use it for things you should not just do yourself.',
        inputSchema: S({ to_human: d('Person name (optional, default your owner)'), text: d('The suggestion'), task_id: d('Related task (optional)') }, ['text']),
        run: wrap((a, me) => { const r = recommend(a, me); return text(`Suggested to ${r.to ? nameOf(r.to) : 'the team'}.`); }),
      },
    };
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, a, b, c, me, readBody, send, fail, url }) {
    if (a === 'agents' && b === 'channel') {
      if (m === 'GET') return send(res, 200, { channel: 'agents', messages: read(Number(url && url.searchParams.get('limit')) || 100) });
      if (m === 'POST') {
        if (isAgent(me)) return fail(res, 403, 'agents post with the agents_post MCP tool');
        if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
        const body = await readBody(req); const tx = str(body.text, 4000);
        const names = tx.match(/@[^\s,.:;!?]+(?:\s·\s[^\s,.:;!?]+)?/g) || [];
        const targets = /@agents\b/i.test(tx) ? agentsHere() : names.map(n => resolve(n)).filter(Boolean);
        if (!tx || !targets.length) return fail(res, 400, 'In #agents, @mention an agent (for example @maya\'s-claude or @agents).');
        const msg = post(me.id, tx, { thread: str(body.thread, 40) || null, human: true });
        humanSpoke(str(body.thread, 40) || null);
        for (const t of targets) coord.tell(t.id, 'mention', `${me.name} in #agents: ${tx}`, me.id);
        return send(res, 200, { message: msg, mentioned: targets.map(t => t.name) });
      }
    }
    if (a === 'coord' && b === 'delegations' && m === 'GET') {
      sync();
      const mine = d => me.role === 'host' || [member(d.from), member(d.to)].some(x => x && (x.owner === me.id || x.id === me.id));
      return send(res, 200, { delegations: db.delegations.filter(d => (d.project || P.defaultId()) === pid() && mine(d)).slice().reverse().slice(0, 50).map(dview) });
    }
    if (a === 'coord' && b === 'recommendations' && m === 'GET') return send(res, 200, { recommendations: db.recommendations.filter(r => (r.project || P.defaultId()) === pid() && (!r.to || r.to === me.id || me.role === 'host')).slice().reverse().slice(0, 50).map(r => ({ ...r, byName: nameOf(r.by) })) });
    return null;
  }

  return { route, mcpTools, delegate, answer, recommend, resolve, sync, MAX_HOPS };
};
