// How work is shared on the Task Board (feat/tasks-company).
//   Lead assigns (default): a lead (host, admin, mod, project host, or anyone with settings.edit) assigns a task to
//     someone; it stays "Assigned to you · Accept / Decline" for that person until they answer. Only an accepted task
//     counts as theirs, and accepting starts it (In progress). Declining hands it back to whoever assigned it, with
//     the reason. Agents: their owner answers for them, or they accept on their own when the project says so.
//   Council (open claim): unassigned tasks are posted openly ("Open to claim"); anyone claims one, which assigns and
//     accepts it in one step. Claims show in chat and in the inbox. An optional limit caps open claims per person.
// Task fields: accept 'pending' | 'accepted', assignedBy, assignedAt, claimed { by, at }, declined { by, reason, at }.
// Settings (per project, <project>/work.json): { mode: 'lead' | 'council', claimLimit: 0..20, agentAutoAccept }.
// HTTP: GET/PUT /api/tasks/settings · POST /api/tasks/<id>/accept · /decline { reason } · /claim
// MCP: accept_task, decline_task, claim_task.
'use strict';

module.exports = function makeTaskFlow({ P, store, getMembers, perms, bus, postChat, saveTask, loadTasks, str, nameOf }) {
  const FILE = 'work.json';
  const DEF = { mode: 'lead', claimLimit: 0, agentAutoAccept: false };
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const pid = () => P.current() || P.defaultId();
  const mem = id => getMembers().find(m => m.id === id) || null;
  const now = () => new Date().toISOString();

  function settings() { const s = store.readJSON(FILE, null) || {}; return { ...DEF, ...s, mode: s.mode === 'council' ? 'council' : 'lead' }; }
  function setSettings(body, me) {
    if (!isLead(me)) throw err(403, 'only the host or a project lead changes how work is shared');
    const s = settings();
    if (body.mode === 'lead' || body.mode === 'council') s.mode = body.mode;
    if (body.claimLimit !== undefined) { const n = Math.floor(Number(body.claimLimit)); s.claimLimit = Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 0; }
    if (typeof body.agentAutoAccept === 'boolean') s.agentAutoAccept = body.agentAutoAccept;
    store.writeJSON(FILE, s);
    return s;
  }
  const projRole = me => ((P.get(pid()) || {}).members || {})[me.id];
  function isLead(me) {
    if (!me || me.role === 'agent' || me.role === 'spectator' || me.guestUntil) return false;
    if (['host', 'admin', 'mod'].includes(me.role) || projRole(me) === 'host' || projRole(me) === 'admin') return true;
    try { return !!(perms && perms.can(me, 'settings.edit', pid())); } catch { return false; }
  }
  // You answer for a task offered to you, or to an agent you own.
  const answersFor = (me, t) => !!t.assignee && (t.assignee === me.id || ((mem(t.assignee) || {}).role === 'agent' && (mem(t.assignee) || {}).owner === me.id));
  const pending = t => t.accept === 'pending';

  // Called by PATCH /tasks/:id after the fields are applied. Returns an error message or null.
  function canAssign(me, to, t) {
    if (!to || to === me.id || to === (t && t.assignee)) return null;   // yourself, or nobody: always fine
    if (me.role === 'agent' && to === me.owner) return null;
    if (isLead(me)) return null;
    const m = mem(to); if (m && m.role === 'agent' && m.owner === me.id) return null;   // your own agent
    return settings().mode === 'council'
      ? 'In Council mode people claim tasks themselves. Leave it open to claim, or ask a lead to assign it.'
      : 'Only a lead assigns tasks to other people here. Take it yourself, or ask a lead.';
  }
  function assigned(t, prev, me) {
    if ((t.assignee || null) === (prev || null)) return t;
    delete t.declined; delete t.claimed;
    if (!t.assignee) { delete t.accept; delete t.assignedBy; delete t.assignedAt; return t; }
    t.assignedBy = me.id; t.assignedAt = now();
    const to = mem(t.assignee), agent = to && to.role === 'agent';
    const self = t.assignee === me.id || (agent && to.owner === me.id) || (me.role === 'agent' && t.assignee === me.owner);
    if (self || t.status !== 'backlog' || (agent && settings().agentAutoAccept)) { t.accept = 'accepted'; return t; }
    t.accept = 'pending';
    const ask = agent ? [to.owner].filter(Boolean) : [t.assignee];
    if (ask.length) bus.notify({ type: 'task-assigned', priority: 'high', to: ask, from: me.id, title: agent ? `${me.name} assigned ${to.name} a task · accept for it?` : `${me.name} assigned you a task · Accept or decline`, body: t.title, view: 'tasks', ref: t.id, project: pid() });
    return t;
  }
  function accept(t, me) {
    if (!answersFor(me, t)) throw err(403, 'only the person it was assigned to (or the agent\'s owner) can accept it');
    if (!pending(t)) throw err(409, t.accept === 'accepted' ? 'already accepted' : 'this task is not waiting for an answer');
    t.accept = 'accepted'; t.acceptedAt = now(); if (t.status === 'backlog') t.status = 'doing';
    t.updated = now(); t.updatedBy = me.id;
    const who = nameOf(t.assignee);
    if (t.assignedBy && t.assignedBy !== me.id) bus.notify({ type: 'task-accepted', priority: 'low', to: [t.assignedBy], from: me.id, title: `${who} accepted a task`, body: t.title, view: 'tasks', ref: t.id, project: pid() });
    return saveTask(t);
  }
  function decline(t, me, reason) {
    if (!answersFor(me, t)) throw err(403, 'only the person it was assigned to (or the agent\'s owner) can decline it');
    if (!pending(t)) throw err(409, 'this task is not waiting for an answer');
    const why = str(reason, 300) || 'No reason given';
    const who = nameOf(t.assignee), back = t.assignedBy;
    t.declined = { by: t.assignee, byName: who, reason: why, at: now() };
    t.assignee = null; delete t.accept; delete t.doer; delete t.assignedAt; t.status = 'backlog';
    t.updated = now(); t.updatedBy = me.id;
    if (back && back !== me.id) bus.notify({ type: 'task-declined', priority: 'normal', to: [back], from: me.id, title: `${who} declined a task`, body: `${t.title} · “${why}”`, view: 'tasks', ref: t.id, project: pid() });
    delete t.assignedBy;
    return saveTask(t);
  }
  function claim(t, me) {
    const s = settings();
    if (s.mode !== 'council') throw err(409, 'Claiming is for Council mode. In Lead mode a lead assigns tasks; you can still take one yourself with Start.');
    if (me.role === 'spectator') throw err(403, 'spectators can read but not claim');
    if (t.status === 'done') throw err(409, 'this task is already done');
    if (t.assignee && !pending(t) && t.assignee !== me.id) throw err(409, `${nameOf(t.assignee)} already has this task`);
    if (t.assignee === me.id && !pending(t)) throw err(409, 'you already have this task');
    if (s.claimLimit) {
      const open = loadTasks().filter(x => x.assignee === me.id && x.claimed && x.status !== 'done').length;
      if (open >= s.claimLimit) throw err(409, `You already have ${open} claimed task${open === 1 ? '' : 's'} open (the limit is ${s.claimLimit}). Finish one first.`);
    }
    t.assignee = me.id; t.accept = 'accepted'; t.claimed = { by: me.id, at: now() }; t.doer = me.role === 'agent' ? 'agent' : 'me';
    delete t.declined; delete t.assignedBy; t.assignedAt = now();
    if (t.status === 'backlog') t.status = 'doing';
    t.updated = now(); t.updatedBy = me.id;
    saveTask(t);
    try { postChat((P.channelOf && P.channelOf(pid())) || 'general', 'tribecode', `🙋 **${me.name}** claimed **${t.title}**`); } catch {}
    const to = [...new Set([t.by, ...getMembers().filter(m => isLead(m) && P.canSee(m, pid())).map(m => m.id)])].filter(x => x && x !== me.id && mem(x));
    if (to.length) bus.notify({ type: 'task-claimed', priority: 'low', to, from: me.id, title: `${me.name} claimed a task`, body: t.title, view: 'tasks', ref: t.id, project: pid() });
    return t;
  }

  // ---------- HTTP (called from index.js inside /api/tasks) ----------
  function find(id) { const t = loadTasks().find(x => x.id === id); if (!t) throw err(404, 'task not found'); return t; }
  async function route(m, b, c, me, readBody) {
    if (b === 'settings') {
      if (m === 'GET') return { settings: settings(), canEdit: isLead(me), lead: isLead(me) };
      if (m === 'PUT') return { settings: setSettings(await readBody(), me), canEdit: true, lead: true };
      throw err(405, 'GET or PUT');
    }
    if (m !== 'POST' || !['accept', 'decline', 'claim'].includes(c)) return null;
    if (me.role === 'spectator') throw err(403, 'spectators are read-only');
    const t = find(b);
    if (c === 'accept') return { task: accept(t, me) };
    if (c === 'decline') { const body = await readBody(); return { task: decline(t, me, body.reason) }; }
    return { task: claim(t, me) };
  }

  // ---------- MCP ----------
  const text = (t, isError) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
  const S = (props, req = []) => ({ type: 'object', properties: props, required: req, additionalProperties: false });
  const wrap = fn => async (a, me) => { try { return text(await fn(a || {}, me)); } catch (e) { return text(e.message, true); } };
  const ID = { type: 'string', description: 'The task id (list_tasks shows them)' };
  const mcpTools = {
    accept_task: { description: 'Accept a task a lead assigned to you (it shows as "Assigned to you" until you answer). Accepting makes it yours and moves it to In progress.', inputSchema: S({ id: ID }, ['id']),
      run: wrap((a, me) => { const t = accept(find(String(a.id)), me); return `Accepted "${t.title}". It is yours and in progress.`; }) },
    decline_task: { description: 'Decline a task assigned to you, with a short reason. It goes back to whoever assigned it.', inputSchema: S({ id: ID, reason: { type: 'string', description: 'Why, in a sentence' } }, ['id', 'reason']),
      run: wrap((a, me) => { const t = decline(find(String(a.id)), me, a.reason); return `Declined "${t.title}". ${t.declined.reason ? 'Reason sent: ' + t.declined.reason : ''}`.trim(); }) },
    claim_task: { description: 'Claim an open task (Council mode: tasks are posted openly and anyone claims one). Claiming assigns it to you and starts it; the team sees it in chat.', inputSchema: S({ id: ID }, ['id']),
      run: wrap((a, me) => { const t = claim(find(String(a.id)), me); return `Claimed "${t.title}". It is yours and in progress.`; }) },
  };

  return { settings, setSettings, isLead, canAssign, assigned, accept, decline, claim, route, mcpTools };
};
