// "@ai": the tribe's AI for anyone, including a friend on a phone with no Claude Code and no TribeCode at home.
// One question in chat goes to whatever AI the tribe has right now, in this order:
//   1. your own Claude Code, when it's online (no approval: it's yours)
//   2. a teammate's Claude Code that's online (the host's first). It spends their subscription, so their policy
//      decides: "ask" (default: one tap to approve, from the inbox or a phone notification), "always" or "never"
//   3. the host's local model (Ollama), answering in the chat
//   4. nobody: the question becomes a task on the board for the next Claude that connects
// The chosen Claude answers in the same channel (post_chat, starting with @name), so the friend sees it in chat.
// Routes: GET /api/ask (what @ai would use right now, for the phone's "Ask AI" row), POST /api/ask {text, channel},
//         GET/PUT /api/ask/policy {policy: ask|always|never} (who may use my Claude).
'use strict';

const POLICIES = ['ask', 'always', 'never'];

module.exports = function askai({ store, id, str, P, getMembers, presenceFor, postChat, coord, approvals, brain, askBrain, createTask, bus, nameOf }) {
  const FILE = '.tribe/askai.json';
  const db = Object.assign({ policy: {}, pending: [] }, store.readJSON(FILE, {}));
  // Agents in public chat (v0.20): "@maya's-claude add a jump sound" in a channel gives Maya's Claude a public command;
  // it answers, and posts what it makes and finishes, in that channel. The right panel stays the private way.
  // Admins decide: on/off, who may command (members | builders | admins), which channels ([] = every public one),
  // whether finished work is posted, and a per-person hourly limit. Each owner's own "Friends can ask my AI"
  // policy (ask | always | never) still decides whether someone else may command *their* agent.
  const PUB_DEFAULT = { on: true, who: 'members', channels: [], postDone: true, perHour: 20 };
  const pub = () => Object.assign({}, PUB_DEFAULT, db.pub || {});
  const save = () => { db.pending = db.pending.slice(-200); store.writeJSON(FILE, db); };
  const member = mid => getMembers().find(m => m.id === mid);
  const err = (status, message) => Object.assign(new Error(message), { status });
  const policyOf = owner => (POLICIES.includes(db.policy[owner]) ? db.policy[owner] : 'ask');
  const first = n => String(n || 'someone').split(/\s+/)[0];

  // Who would answer right now, for this person in this project.
  function pick(me) {
    const agents = presenceFor(me).filter(m => m.role === 'agent' && m.online && m.owner);
    const mine = agents.find(a => a.owner === me.id);
    if (mine) return { kind: 'mine', agent: mine, label: `your Claude (${mine.name})` };
    const hostIds = new Set(getMembers().filter(m => m.role === 'host').map(m => m.id));
    const theirs = agents.filter(a => a.owner !== me.id && policyOf(a.owner) !== 'never')
      .sort((a, b) => (hostIds.has(b.owner) - hostIds.has(a.owner)) || (policyOf(b.owner) === 'always') - (policyOf(a.owner) === 'always'));
    if (theirs.length) { const a = theirs[0]; return { kind: 'theirs', agent: a, owner: a.owner, needsOk: policyOf(a.owner) !== 'always', label: `${first(nameOf(a.owner))}'s Claude` }; }
    const st = brain && brain.status ? brain.status() : {};
    if (st.online) return { kind: 'brain', label: st.cloud ? `the tribe's AI (${st.model})` : 'the local model' };   // feat/any-llm
    return { kind: 'queue', label: 'the next Claude that connects' };
  }

  function deliver(p) {   // hand the question to the agent; it answers in the channel
    const asker = member(p.by) || { name: 'A teammate' };
    coord.tell(p.agent, 'ask', `${asker.name} asks${p.phoneOnly ? ' (from their phone; they have no Claude of their own)' : ''}: "${p.text}". ` +
      `Answer with post_chat (project "${p.project}"), starting with @${first(asker.name)}. Keep it short and plain. ` +   // the project id, so the answer lands where the question was asked even if the agent works in another project
      `If it's a piece of work rather than a question, make a task for it (create_task) and say so.`, p.by);
    p.status = 'sent'; p.sentAt = new Date().toISOString(); save();
  }

  async function ask(ch, me, text) {
    if (!me || me.role === 'agent' || me.role === 'spectator') return null;
    const q = str(String(text).replace(/(^|\s)@ai\b/ig, ' '), 2000).trim();
    if (!q) { postChat(ch, 'tribecode', `@${first(me.name)} put your question after @ai, like "@ai how do I add a jump sound?"`); return { kind: 'empty' }; }
    const r = pick(me), pid = P.current() || P.defaultId();
    const phoneOnly = !getMembers().some(m => m.role === 'agent' && m.owner === me.id);
    if (r.kind === 'brain') { await askBrain(ch, me, '@brain ' + q); return { kind: 'brain' }; }
    if (r.kind === 'queue') {
      const t = createTask({ title: `Question from ${first(me.name)}: ${q}`.slice(0, 200), body: `${me.name} asked @ai: ${q}\n\nAnswer in chat (post_chat, start with @${first(me.name)}), then close this task.`, by: me.id, source: 'ask' });
      postChat(ch, 'tribecode', `No AI is on right now, so ${first(me.name)}'s question is on the board for the next Claude that connects${t && t.id ? '' : ''}. Tip: the host can turn on the local model (Ollama) for instant answers.`);
      return { kind: 'queue', task: t && t.id };
    }
    const p = { id: 'ask-' + id(6).toLowerCase(), by: me.id, text: q, channel: ch, agent: r.agent.id, owner: r.agent.owner, project: pid, phoneOnly, status: 'new', created: new Date().toISOString() };
    db.pending.push(p); save();
    if (r.kind === 'mine' || !r.needsOk) {
      deliver(p);
      postChat(ch, 'tribecode', `🤖 ${r.kind === 'mine' ? `${first(me.name)}'s Claude` : `${first(nameOf(p.owner))}'s Claude`} is on ${first(me.name)}'s question.`);
      return { kind: r.kind, agent: r.agent.id };
    }
    const ap = approvals.create({ title: `Let your Claude answer ${first(me.name)}'s question?`, details: `"${q}"\n\nApprove and ${r.agent.name} answers in the chat. ` +
      `To skip this step next time: Settings › Friends can ask my Claude › Always.`, risk: 'low', kind: 'ask-claude', to: [p.owner] }, me);
    p.approval = ap.id; p.status = ap.status === 'approved' ? 'approved' : 'waiting'; save();
    if (p.status === 'approved') deliver(p);
    else postChat(ch, 'tribecode', `🤖 Asked ${first(nameOf(p.owner))} to let their Claude answer ${first(me.name)}. One tap on their phone.`);
    return { kind: 'theirs', agent: r.agent.id, approval: ap.id };
  }

  function sync() {   // approvals decided anywhere (inbox, phone notification) release or drop waiting questions
    let changed = false;
    for (const p of db.pending.filter(x => x.status === 'waiting')) {
      const ap = approvals.get ? approvals.get(p.approval) : null; if (!ap || ap.status === 'pending') continue;
      if (ap.status === 'approved') P.inProject(p.project, () => { (p.pub ? deliverPublic : deliver)(p); postChat(p.channel, 'tribecode', `🤖 ${first(nameOf(p.owner))} said yes: their Claude is on ${first(nameOf(p.by))}'s question.`); });
      else { p.status = 'denied'; changed = true; P.inProject(p.project, () => postChat(p.channel, 'tribecode', `@${first(nameOf(p.by))} ${first(nameOf(p.owner))}'s Claude can't take that one right now. Try again later, or ask in chat.`)); }
    }
    if (changed) save();
  }
  setInterval(sync, 3000).unref();

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    try {
      if (!b && m === 'GET') { const r = pick(me); return send(res, 200, { kind: r.kind, label: r.label, needsOk: !!r.needsOk, policy: policyOf(me.id) }); }
      if (!b && m === 'POST') {
        const body = await readBody(req); const ch = str(body.channel, 80) || 'general';
        return send(res, 200, await ask(ch, me, '@ai ' + str(body.text, 2000)));
      }
      if (b === 'policy' && m === 'GET') return send(res, 200, { policy: policyOf(me.id), options: POLICIES });
      if (b === 'public' && m === 'GET') return send(res, 200, { ...pub(), canEdit: me.role === 'host' || me.role === 'admin', canCommand: canCommand(me) });
      if (b === 'public' && m === 'PUT') {
        if (!(me.role === 'host' || me.role === 'admin')) return fail(res, 403, 'only the host or an admin changes this');
        return send(res, 200, setPub(await readBody(req)));
      }
      if (b === 'policy' && m === 'PUT') {
        if (me.role === 'agent') return fail(res, 403, 'agents cannot change this');
        const v = str((await readBody(req)).policy, 10); if (!POLICIES.includes(v)) return fail(res, 400, 'policy must be ask, always or never');
        db.policy[me.id] = v; save(); return send(res, 200, { policy: v });
      }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }

  // ---------- agents in public chat ----------
  const RANKS = { spectator: 0, builder: 1, mod: 2, admin: 3, host: 4 };
  const WHO_MIN = { members: 1, builders: 1, admins: 3 };
  const canCommand = me => me && me.role !== 'agent' && (RANKS[me.role] ?? 1) >= (WHO_MIN[pub().who] ?? 1) && !(pub().who === 'builders' && me.guest);
  const slugName = n => String(n || '').toLowerCase().replace(/\s+/g, '-');
  // only explicit agent mentions: @my-claude, @maya's-claude (or @mayas-claude, @maya-claude), or an agent's own name or id.
  // A plain @maya is a person, never her agent.
  function agentsIn(text, me) {
    const agents = getMembers().filter(m => m.role === 'agent' && m.owner);
    const online = new Set(presenceFor(me).filter(m => m.role === 'agent' && m.online).map(m => m.id));
    const found = [];
    for (const raw of String(text).match(/@[^\s,.:;!?()]+/g) || []) {
      const t = raw.slice(1).toLowerCase().replace(/[’]/g, "'");
      let hit = null;
      if (/^my[-_]?(claude|agent)$/.test(t)) hit = agents.find(a => a.owner === me.id && online.has(a.id)) || agents.find(a => a.owner === me.id);
      else {
        const own = t.match(/^(.+?)(?:'s|s)?[-_]?(claude|agent)$/);
        if (own) { const o = getMembers().find(m => m.role !== 'agent' && [slugName(m.name), slugName(String(m.name).split(/\s+/)[0])].includes(own[1])); if (o) hit = agents.find(a => a.owner === o.id && online.has(a.id)) || agents.find(a => a.owner === o.id); }
        if (!hit) hit = agents.find(a => a.id.toLowerCase() === t || slugName(a.name) === t);
      }
      if (hit && !found.some(f => f.id === hit.id)) found.push(hit);
    }
    return found.map(a => ({ agent: a, online: online.has(a.id) }));
  }
  function deliverPublic(p) {
    const asker = member(p.by) || { name: 'A teammate' };
    coord.tell(p.agent, 'ask', `${asker.name} gave you a public command in #${p.channel}: "${p.text}". This is public: everyone in the channel sees it. ` +
      `Answer in that channel with post_chat (channel "${p.channel}", project "${p.project}"), starting with @${first(asker.name)}. Say briefly what you'll do, then do it. ` +
      (pub().postDone ? `When you make something or finish a task, post it in #${p.channel} too (what changed, links, task ids). ` : '') +
      `Big or risky changes go through the project's ship rules (approvals) as usual. If you can't do it, say why in the channel.`, p.by);
    p.status = 'sent'; p.sentAt = new Date().toISOString(); save();
  }
  function command(ch, me, text) {
    if (!me || me.role === 'agent' || String(ch).startsWith('dm-') || ch === 'agents') return null;
    const hits = agentsIn(text, me); if (!hits.length) return null;
    const P0 = pub(), who = first(me.name);
    if (!P0.on) { postChat(ch, 'tribecode', `@${who} agents don't take commands in public chat in this tribe. Use the right panel to talk to your agent, or ask an admin (Settings › Agents in chat).`); return { kind: 'off' }; }
    if (P0.channels.length && !P0.channels.includes(ch)) { postChat(ch, 'tribecode', `@${who} agents take public commands in ${P0.channels.map(c => '#' + c).join(', ')}, not here.`); return { kind: 'channel' }; }
    if (!canCommand(me)) { postChat(ch, 'tribecode', `@${who} in this tribe only ${P0.who === 'admins' ? 'admins' : 'builders'} can give agents public commands.`); return { kind: 'role' }; }
    const hourAgo = Date.now() - 3600e3;
    if (db.pending.filter(x => x.pub && x.by === me.id && Date.parse(x.created) > hourAgo).length >= P0.perHour) { postChat(ch, 'tribecode', `@${who} that's a lot of agent commands this hour (limit ${P0.perHour}). Try again a bit later.`); return { kind: 'limit' }; }
    const pid = P.current() || P.defaultId(), out = [];
    for (const { agent, online } of hits.slice(0, 3)) {
      const mine = agent.owner === me.id, owner = first(nameOf(agent.owner)), label = mine ? `${who}'s ${agent.name.includes('Claude') ? 'Claude' : 'agent'}` : `${owner}'s Claude`;
      if (!mine && policyOf(agent.owner) === 'never') { postChat(ch, 'tribecode', `@${who} ${owner} keeps their Claude to themselves. Ask them, or try @ai.`); out.push({ agent: agent.id, kind: 'never' }); continue; }
      const p = { id: 'pub-' + id(6).toLowerCase(), pub: true, by: me.id, text: str(text, 2000), channel: ch, agent: agent.id, owner: agent.owner, project: pid, status: 'new', created: new Date().toISOString() };
      db.pending.push(p); save();
      if (mine || policyOf(agent.owner) === 'always') {
        deliverPublic(p);
        postChat(ch, 'tribecode', online ? `🤖 ${label} is on it.` : `🤖 ${label} is offline. It gets this as soon as it connects.`);
        out.push({ agent: agent.id, kind: mine ? 'mine' : 'theirs' }); continue;
      }
      const ap = approvals.create({ title: `Let your Claude do ${who}'s public request?`, details: `In #${ch}: "${p.text}"\n\nApprove and ${agent.name} answers and works in the channel. ` +
        `To skip this step next time: Settings › Friends can ask my AI › Always.`, risk: 'low', kind: 'ask-claude', to: [agent.owner] }, me);
      p.approval = ap.id; p.status = ap.status === 'approved' ? 'approved' : 'waiting'; save();
      if (p.status === 'approved') deliverPublic(p); else postChat(ch, 'tribecode', `🤖 Asked ${owner} to let their Claude take this. One tap for them.`);
      out.push({ agent: agent.id, kind: 'waiting', approval: ap.id });
    }
    return { kind: 'public', agents: out };
  }
  // finished tasks by agents land in the project's channel when the tribe wants that
  function taskDone(t, ch) {
    if (!pub().postDone || !t || !t.assignee) return;
    const a = member(t.assignee); if (!a || a.role !== 'agent') return;
    postChat(ch, 'tribecode', `✅ ${a.name} finished **${str(t.title, 160)}**${a.owner ? ` (${first(nameOf(a.owner))}'s agent)` : ''}.`);
  }
  function setPub(body) {
    const cur = pub(), next = { ...cur };
    if (typeof body.on === 'boolean') next.on = body.on;
    if (['members', 'builders', 'admins'].includes(body.who)) next.who = body.who;
    if (Array.isArray(body.channels)) next.channels = body.channels.map(c => str(c, 40).replace(/^#/, '')).filter(Boolean).slice(0, 20);
    if (typeof body.postDone === 'boolean') next.postDone = body.postDone;
    if (Number.isFinite(+body.perHour)) next.perHour = Math.max(1, Math.min(200, Math.round(+body.perHour)));
    db.pub = next; save(); return next;
  }

  return { ask, pick, route, sync, policyOf, err, command, taskDone, pub, setPub };
};
