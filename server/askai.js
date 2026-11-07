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
    if (st.online) return { kind: 'brain', label: 'the local model' };
    return { kind: 'queue', label: 'the next Claude that connects' };
  }

  function deliver(p) {   // hand the question to the agent; it answers in the channel
    const asker = member(p.by) || { name: 'A teammate' };
    coord.tell(p.agent, 'ask', `${asker.name} asks${p.phoneOnly ? ' (from their phone; they have no Claude of their own)' : ''}: "${p.text}". ` +
      `Answer in #${p.channel === 'general' ? 'general' : p.channel} with post_chat, starting with @${first(asker.name)}. Keep it short and plain. ` +
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
      if (ap.status === 'approved') P.inProject(p.project, () => { deliver(p); postChat(p.channel, 'tribecode', `🤖 ${first(nameOf(p.owner))} said yes: their Claude is on ${first(nameOf(p.by))}'s question.`); });
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
      if (b === 'policy' && m === 'PUT') {
        if (me.role === 'agent') return fail(res, 403, 'agents cannot change this');
        const v = str((await readBody(req)).policy, 10); if (!POLICIES.includes(v)) return fail(res, 400, 'policy must be ask, always or never');
        db.policy[me.id] = v; save(); return send(res, 200, { policy: v });
      }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }

  return { ask, pick, route, sync, policyOf, err };
};
