// Coordination for many humans running many agents on one app (all per project):
//   Agents panel     every agent with owner, task/branch, claimed files, last activity, tokens/budget,
//                    and pause/stop requests (agents read them through check_messages and my_lane)
//   Ownership map    who (human or agent) owns which files, areas and lanes; overlap warnings + hand-off
//   Conflict radar   branches touching the same files (drift.js) with one-click "ask both to sync"
//   Hand-off queue   work parked for someone else, with context
//   Review queue     branches waiting for a human, approve/deny in one tap (reuses approvals)
//   Daily plan       who should do what today, from tasks + availability (local brain adds a focus line)
// Everything lives in .tribe/coord.json; records carry a `project` field.
'use strict';

const LIMIT = 300;
const today = () => new Date().toISOString().slice(0, 10);

module.exports = function coord({ P, store, id, str, broadcast, postChat, bus, getMembers, presenceFor, loadTasks, saveTask, claims, hubFor, approvals, brain, nameOf }) {
  const FILE = '.tribe/coord.json';
  const db = Object.assign({ control: {}, usage: {}, inbox: [], lanes: [], handoffs: [], reviews: [], availability: {}, plans: {} }, store.readJSON(FILE, {}));
  const save = () => {
    for (const k of ['inbox', 'handoffs', 'reviews', 'lanes']) db[k] = db[k].slice(-LIMIT);
    store.writeJSON(FILE, db);
  };
  const pid = () => P.current() || P.defaultId();
  const inPid = r => (r.project || P.defaultId()) === pid();
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const isAgent = m => !!m && m.role === 'agent';
  const humans = () => getMembers().filter(m => m.role !== 'agent' && m.role !== 'spectator' && P.canSee(m, pid()));
  const agentsOf = () => getMembers().filter(m => m.role === 'agent' && P.canSee(member(m.owner) || m, pid()));
  const now = () => new Date().toISOString();
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const push = kind => broadcast({ type: 'coord', kind, project: pid() });
  // Who may steer an agent: its owner or the host.
  const canSteer = (me, ag) => !!ag && (ag.owner === me.id || me.role === 'host');
  const norm = p => String(p || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const covers = (area, file) => { area = norm(area); file = norm(file); return !!area && (area === file || (area.endsWith('/') ? file.startsWith(area) : file.startsWith(area + '/'))); };
  const overlap = (a, b) => covers(a, b) || covers(b, a) || norm(a) === norm(b);
  const tasksNow = () => loadTasks();

  // ---------- messages for agents (shown by check_messages and my_lane) ----------
  function tell(agentId, kind, text, by) {
    db.inbox.push({ id: 'm-' + id(6).toLowerCase(), to: agentId, kind, text: str(text, 2000), by: by || null, at: now(), project: pid(), seen: false });
    save();
  }
  function inboxFor(me, { mark = true } = {}) {
    const mine = db.inbox.filter(x => x.to === me.id && !x.seen);
    if (mark && mine.length) { mine.forEach(x => { x.seen = true; x.seenAt = now(); }); save(); push('agents'); }
    const ctl = db.control[me.id];
    const lines = mine.map(x => `[${x.kind.toUpperCase()}] ${x.by ? nameOf(x.by) + ': ' : ''}${x.text}`);
    if (ctl && ctl.action !== 'resume' && !mine.some(x => x.kind === ctl.action)) lines.unshift(`[${ctl.action.toUpperCase()} REQUESTED] by ${nameOf(ctl.by)}${ctl.note ? ': ' + ctl.note : ''}. ${ctl.action === 'stop' ? 'Stop now: commit or stash, release your claims and reply to your owner.' : 'Pause after your current step and wait until your owner resumes you (check_messages again later).'}`);
    return lines;
  }

  // ---------- agents panel ----------
  function agents(me) {
    const people = presenceFor(me), tasks = tasksNow(), cl = claims.list();
    return people.filter(m => m.role === 'agent').map(a => {
      const ag = member(a.id) || {}, owner = member(ag.owner) || {};
      const task = tasks.find(t => t.assignee === a.id && t.status === 'doing') || tasks.find(t => t.assignee === a.id && t.status !== 'done') || null;
      const u = db.usage[a.id] || null, ctl = db.control[a.id] || null;
      return { id: a.id, name: a.name, owner: ag.owner || null, ownerName: owner.name || 'someone', online: !!a.online, where: a.where || null, project: a.project || null,
        lastActive: a.since || null, task: task ? { id: task.id, title: task.title, status: task.status } : null, branch: task ? (task.branch || `task/${task.id}`) : (ag.owner ? `tribe/${ag.owner}` : null),
        files: cl.filter(c => c.by === a.id).map(c => c.path), tokens: u ? u.tokens : null, budget: u ? u.budget : null,
        control: ctl && ctl.action !== 'resume' ? { action: ctl.action, by: nameOf(ctl.by), at: ctl.at, note: ctl.note || '', seen: !!ctl.seen } : null,
        unread: db.inbox.filter(x => x.to === a.id && !x.seen).length, yours: ag.owner === me.id };
    }).sort((x, y) => y.online - x.online || y.yours - x.yours || x.name.localeCompare(y.name));
  }
  function control(agentId, action, note, me) {
    const ag = member(agentId);
    if (!isAgent(ag)) throw err(404, 'no such agent');
    if (!canSteer(me, ag)) throw err(403, 'only the agent\'s owner or the host can pause or stop it');
    if (!['pause', 'stop', 'resume'].includes(action)) throw err(400, 'action must be pause, stop or resume');
    db.control[agentId] = { action, note: str(note, 300), by: me.id, at: now(), seen: false };
    tell(agentId, action, action === 'resume' ? `You can continue${note ? ': ' + note : '.'}` : (str(note, 300) || (action === 'stop' ? 'Please stop.' : 'Please pause.')), me.id);
    push('agents');
    return db.control[agentId];
  }
  function usage(me, tokens, budget) {
    if (!isAgent(me)) return;
    const u = db.usage[me.id] || {};
    if (Number.isFinite(Number(tokens)) && tokens !== undefined && tokens !== null) u.tokens = Math.max(0, Math.round(Number(tokens)));
    if (Number.isFinite(Number(budget)) && budget !== undefined && budget !== null) u.budget = Math.max(0, Math.round(Number(budget)));
    u.at = now(); db.usage[me.id] = u; save();
  }

  // ---------- ownership map ----------
  function ownership(me) {
    const cl = claims.list().filter(c => !c.project || c.project === pid());
    const lanes = db.lanes.filter(inPid);
    const owners = new Map();
    const row = mid => { if (!owners.has(mid)) { const m = member(mid) || { id: mid, name: nameOf(mid) }; owners.set(mid, { id: mid, name: m.name, kind: isAgent(m) ? 'agent' : 'person', owner: m.owner || null, color: m.color || '#6C7CFF', claims: [], lanes: [], tasks: [] }); } return owners.get(mid); };
    cl.forEach(c => row(c.by).claims.push({ id: c.id, path: c.path, note: c.note, at: c.at }));
    lanes.forEach(l => row(l.owner).lanes.push({ id: l.id, area: l.area, note: l.note }));
    tasksNow().filter(t => t.assignee && t.status !== 'done').forEach(t => row(t.assignee).tasks.push({ id: t.id, title: t.title, status: t.status }));
    // Overlaps: a claim inside someone else's lane, or two lanes covering the same area.
    const warnings = [];
    for (const c of cl) for (const l of lanes) if (l.owner !== c.by && overlap(l.area, c.path)) warnings.push({ kind: 'claim-in-lane', path: c.path, area: l.area, a: { id: c.by, name: nameOf(c.by) }, b: { id: l.owner, name: nameOf(l.owner) }, claim: c.id });
    for (let i = 0; i < lanes.length; i++) for (let j = i + 1; j < lanes.length; j++) if (lanes[i].owner !== lanes[j].owner && overlap(lanes[i].area, lanes[j].area)) warnings.push({ kind: 'lane-overlap', area: lanes[i].area, path: lanes[j].area, a: { id: lanes[i].owner, name: nameOf(lanes[i].owner) }, b: { id: lanes[j].owner, name: nameOf(lanes[j].owner) }, lane: lanes[j].id });
    return { owners: [...owners.values()].sort((a, b) => (b.claims.length + b.lanes.length) - (a.claims.length + a.lanes.length)), lanes, warnings };
  }
  function addLane({ area, owner, note }, me) {
    area = norm(str(area, 200)); if (!area) throw err(400, 'name an area: a folder like src/ui/ or a file');
    const who = owner && member(owner) ? owner : me.id;
    const prev = db.lanes.find(l => inPid(l) && l.area === area && l.owner === who);
    if (prev) return prev;
    const l = { id: 'l-' + id(6).toLowerCase(), area, owner: who, note: str(note, 140), by: me.id, at: now(), project: pid() };
    db.lanes.push(l); save(); push('ownership');
    return l;
  }
  function dropLane(lid, me) {
    const l = db.lanes.find(x => x.id === lid); if (!l) throw err(404, 'no such lane');
    const ag = member(l.owner);
    if (l.owner !== me.id && l.by !== me.id && me.role !== 'host' && !(ag && ag.owner === me.id)) throw err(403, 'not your lane');
    db.lanes = db.lanes.filter(x => x !== l); save(); push('ownership');
  }
  // Hand a claim to someone else (its holder, the holder's owner, or the host).
  function handClaim(cid, to, me) {
    const c = claims.list().find(x => x.id === cid); if (!c) throw err(404, 'claim not found');
    if (!member(to)) throw err(400, 'unknown member');
    const holder = member(c.by);
    if (c.by !== me.id && me.role !== 'host' && !(holder && holder.owner === me.id)) throw err(403, 'only the holder, its owner or the host can hand this off');
    const out = claims.handOff(cid, to, { ...me, id: c.by, name: me.name });
    if (isAgent(member(to))) tell(to, 'handoff', `${me.name} handed you ${c.path}${c.note ? ' (' + c.note + ')' : ''}.`, me.id);
    push('ownership');
    return out;
  }

  // ---------- conflict radar ----------
  async function conflicts() {
    const hub = hubFor(pid()); if (!hub || !hub.drift) return { enabled: false, pairs: [] };
    let r; try { r = await hub.drift.radar(); } catch (e) { return { enabled: false, reason: e.message, pairs: [] }; }
    if (!r.enabled) return { enabled: false, reason: r.reason, pairs: [] };
    const owner = b => { const m = /^tribe\/([^/]+)$/.exec(b.branch); if (m && member(m[1])) return m[1]; if (b.task) { const t = tasksNow().find(x => x.id === b.task.id); if (t && t.assignee) return t.assignee; } return b.member || null; };
    const rows = r.branches.filter(b => b.ahead > 0 && (b.allFiles || []).length);
    const pairs = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const A = new Set(rows[i].allFiles), shared = rows[j].allFiles.filter(f => A.has(f));
      if (!shared.length) continue;
      const oa = owner(rows[i]), ob = owner(rows[j]);
      const key = [rows[i].branch, rows[j].branch].sort().join('|');
      const asked = db.inbox.find(x => x.kind === 'sync' && x.key === key && Date.now() - Date.parse(x.at) < 6 * 3600_000);
      pairs.push({ a: { branch: rows[i].branch, owner: oa, ownerName: oa ? nameOf(oa) : rows[i].author, behind: rows[i].behind }, b: { branch: rows[j].branch, owner: ob, ownerName: ob ? nameOf(ob) : rows[j].author, behind: rows[j].behind },
        files: shared.slice(0, 20), count: shared.length, asked: asked ? asked.at : null, key });
    }
    pairs.sort((x, y) => y.count - x.count);
    return { enabled: true, main: r.main, pairs, branches: r.branches.length, checked: r.checked };
  }
  async function askSync(a, b, me) {
    const c = await conflicts();
    const key = [a, b].sort().join('|');
    const pair = c.pairs.find(p => p.key === key);
    if (!pair) throw err(404, 'those branches no longer overlap');
    const who = [pair.a.owner, pair.b.owner].filter(Boolean);
    const files = pair.files.slice(0, 6).join(', ') + (pair.count > 6 ? ` and ${pair.count - 6} more` : '');
    const text = `🔀 ${me.name} asks ${pair.a.ownerName} (${pair.a.branch}) and ${pair.b.ownerName} (${pair.b.branch}) to sync: both touch ${files}. Merge main into your branch, talk it over, or hand one side off.`;
    postChat('general', 'tribecode', text);
    const humansTo = new Set();
    for (const w of who) { const m = member(w); if (isAgent(m)) { tell(w, 'sync', text, me.id); if (m.owner) humansTo.add(m.owner); } else if (m) humansTo.add(w); }
    db.inbox.push({ id: 'm-' + id(6).toLowerCase(), to: null, kind: 'sync', key, text, by: me.id, at: now(), project: pid(), seen: true }); save();
    const to = [...humansTo].filter(x => x !== me.id);
    if (to.length) bus.notify({ type: 'sync-request', to, from: me.id, title: `${me.name}: please sync ${pair.a.branch} and ${pair.b.branch}`, body: `Both touch ${files}`, view: 'coord', ref: key });
    push('conflicts');
    return { asked: who.map(nameOf), files: pair.files };
  }

  // ---------- hand-off queue ----------
  const hview = h => ({ ...h, fromName: nameOf(h.from), toName: h.to ? nameOf(h.to) : 'anyone', takenByName: h.takenBy ? nameOf(h.takenBy) : null });
  function handoff({ title, context, to, task, branch, files }, me) {
    title = str(title, 160); if (!title) throw err(400, 'say what is being handed off');
    const target = to && member(to) ? to : (to ? (getMembers().find(m => m.name.toLowerCase() === String(to).toLowerCase()) || {}).id || null : null);
    const h = { id: 'h-' + id(6).toLowerCase(), title, context: str(context, 6000), from: me.id, to: target, task: task && tasksNow().some(t => t.id === task) ? task : null,
      branch: str(branch, 120) || null, files: (Array.isArray(files) ? files : String(files || '').split(/[,\n]/)).map(f => norm(str(f, 200))).filter(Boolean).slice(0, 30),
      status: 'open', created: now(), project: pid() };
    db.handoffs.push(h);
    // The handing side lets go of the files so the taker can claim them.
    for (const c of claims.list().filter(c => c.by === me.id && h.files.some(f => overlap(f, c.path)))) claims.releaseId(c.id, me);
    if (h.task) { const t = tasksNow().find(x => x.id === h.task); if (t && t.assignee === me.id) { t.assignee = h.to || null; t.updated = now(); t.updatedBy = me.id; saveTask(t); } }
    save(); push('handoffs');
    postChat('general', 'tribecode', `📦 ${me.name} handed off **${title}** to ${h.to ? nameOf(h.to) : 'anyone who can take it'}.`);
    if (h.to) { const m = member(h.to); if (isAgent(m)) tell(h.to, 'handoff', `${me.name} handed you "${title}". ${h.context}`.trim(), me.id); else bus.notify({ type: 'handoff', to: [h.to], from: me.id, title: `${me.name} handed you: ${title}`, body: h.context.slice(0, 200), view: 'coord', ref: h.id }); }
    return hview(h);
  }
  // "Ask an agent" (feat/any-llm): someone without an AI of their own asks the tribe's agents. It is an open hand-off
  // to anyone (ask: true) that the next connected agent takes with take_handoff (MCP) and answers in chat.
  function ask({ text, task }, me) {
    text = str(text, 4000); if (!text) throw err(400, 'say what you need');
    if (me.role === 'agent') throw err(403, 'agents use handoff or delegate');
    const t = task && tasksNow().find(x => x.id === task);
    const h = { id: 'h-' + id(6).toLowerCase(), ask: true, title: str(t ? `${t.title}` : text.split('\n')[0], 160), context: t ? `${text}\n\nTask ${t.id}: ${t.title}${t.body ? '\n' + str(t.body, 1500) : ''}` : text,
      from: me.id, to: null, task: t ? t.id : null, branch: null, files: [], status: 'open', created: now(), project: pid() };
    db.handoffs.push(h); save(); push('handoffs');
    postChat('general', 'tribecode', `🙋 ${me.name} asked the tribe's agents: **${h.title}**. The next agent that connects picks it up.`);
    const live = presenceFor({ role: 'host' }).filter(m => m.role === 'agent' && m.online);
    for (const a of live) tell(a.id, 'ask', `${me.name} asks the tribe's agents (request ${h.id}): "${str(text, 400)}". If you can do it, call take_handoff with id ${h.id}, then answer in chat (post_chat).`, me.id);
    return hview(h);
  }
  function take(hid, me) {
    const h = db.handoffs.find(x => x.id === hid && inPid(x)); if (!h) throw err(404, 'hand-off not found');
    if (h.status !== 'open') throw err(409, `already ${h.status}`);
    if (h.to && h.to !== me.id && me.role !== 'host' && !(isAgent(member(h.to)) && member(h.to).owner === me.id)) throw err(403, `this was handed to ${nameOf(h.to)}`);
    h.status = 'taken'; h.takenBy = me.id; h.takenAt = now();
    if (h.task) { const t = tasksNow().find(x => x.id === h.task); if (t) { t.assignee = me.id; if (t.status === 'backlog') t.status = 'doing'; t.updated = now(); t.updatedBy = me.id; saveTask(t); } }
    save(); push('handoffs');
    return hview(h);
  }
  function finishHandoff(hid, me) {
    const h = db.handoffs.find(x => x.id === hid && inPid(x)); if (!h) throw err(404, 'hand-off not found');
    if (h.from !== me.id && h.takenBy !== me.id && me.role !== 'host') throw err(403, 'not yours');
    h.status = 'done'; h.doneAt = now(); save(); push('handoffs');
    return hview(h);
  }

  // ---------- review queue ----------
  function requestReview({ branch, title, summary, task }, me) {
    branch = str(branch, 120); title = str(title, 140) || branch || 'Changes';
    if (!branch && !task) throw err(400, 'name the branch (or task) to review');
    const t = task ? tasksNow().find(x => x.id === task) : tasksNow().find(x => branch && (branch.includes(x.id) || x.branch === branch));
    const ap = approvals.create({ title: `Review ${branch || 'task'}: ${title}`, details: str(summary, 3000), risk: 'medium', kind: 'review' }, me);
    const r = { id: 'r-' + id(6).toLowerCase(), approval: ap.id, branch: branch || (t ? `task/${t.id}` : ''), title, summary: str(summary, 3000), task: t ? t.id : null, by: me.id, created: now(), project: pid(), status: 'pending' };
    db.reviews.push(r);
    if (t && t.status !== 'review' && t.status !== 'done') { t.status = 'review'; t.updated = now(); t.updatedBy = me.id; saveTask(t); }
    save(); push('reviews');
    return { ...r, askedOf: ap.toNames };
  }
  function syncReview(r) {   // pick up decisions made anywhere (inbox, phone, ntfy)
    const ap = approvals.get(r.approval); if (!ap || ap.status === 'pending' || r.status === ap.status) return ap;
    r.status = ap.status; r.decidedBy = ap.decidedBy; r.decidedAt = ap.decidedAt;
    const t = r.task && tasksNow().find(x => x.id === r.task);
    if (t) { t.status = ap.status === 'approved' ? 'done' : 'doing'; t.updated = now(); t.updatedBy = ap.decidedBy; if (ap.status === 'denied' && ap.note) t.body = `${t.body ? t.body + '\n\n' : ''}**Review: changes requested** · ${ap.note}`; saveTask(t); }
    const by = member(r.by); if (isAgent(by)) tell(by.id, 'review', `${nameOf(ap.decidedBy)} ${ap.status} your review of ${r.branch}${ap.note ? ': ' + ap.note : '.'}`, ap.decidedBy);
    save();
    return ap;
  }
  function reviews(me) {
    const out = db.reviews.filter(inPid).slice().reverse().slice(0, 40).map(r => {
      const ap = syncReview(r) || {};
      return { ...r, byName: nameOf(r.by), askedOf: ap.toNames || [], canDecide: ap.status === 'pending' && ((ap.to || []).includes(me.id) || me.role === 'host'), note: ap.note || '', decidedByName: ap.decidedByName || null, questions: (ap.questions || []).length };
    });
    const linked = new Set(db.reviews.filter(inPid).map(r => r.task).filter(Boolean));
    const waiting = tasksNow().filter(t => t.status === 'review' && !linked.has(t.id)).map(t => ({ id: 'task:' + t.id, task: t.id, title: t.title, branch: t.branch || `task/${t.id}`, by: t.assignee || t.by, byName: nameOf(t.assignee || t.by), status: 'pending', fromBoard: true, canDecide: me.role !== 'spectator' && me.role !== 'agent', created: t.updated }));
    return [...out.filter(r => r.status === 'pending'), ...waiting, ...out.filter(r => r.status !== 'pending')];
  }
  function decideReview(rid, decision, note, me) {
    try { rid = decodeURIComponent(rid); } catch {}   // "task:t-…" comes URL-encoded from the path
    if (rid.startsWith('task:')) {   // a task someone moved to Review on the board
      const t = tasksNow().find(x => x.id === rid.slice(5)); if (!t) throw err(404, 'task not found');
      t.status = decision === 'approve' ? 'done' : 'doing'; t.updated = now(); t.updatedBy = me.id;
      if (decision !== 'approve' && note) t.body = `${t.body ? t.body + '\n\n' : ''}**Review: changes requested by ${me.name}** · ${str(note, 500)}`;
      saveTask(t); push('reviews'); return { task: t };
    }
    const r = db.reviews.find(x => x.id === rid && inPid(x)); if (!r) throw err(404, 'review not found');
    approvals.decide(r.approval, decision, me, note);
    syncReview(r); push('reviews');
    return { review: r };
  }

  // ---------- daily plan ----------
  function availability(me, status, note) {
    if (!['in', 'part', 'away'].includes(status)) throw err(400, 'status is in, part or away');
    db.availability[me.id] = { status, note: str(note, 140), date: today() }; save(); push('plan');
    return db.availability[me.id];
  }
  const availOf = (m, people) => {
    const a = db.availability[m.id];
    if (a && a.date === today()) return a.status;
    if (isAgent(m)) { const owner = db.availability[m.owner]; return owner && owner.date === today() && owner.status === 'away' ? 'away' : 'in'; }
    const p = people.find(x => x.id === m.id); return p && p.online ? 'in' : 'part';
  };
  function suggest(me) {
    const people = presenceFor(me);
    const crew = [...humans(), ...agentsOf()].map(m => ({ id: m.id, name: m.name, kind: isAgent(m) ? 'agent' : 'person', owner: m.owner || null, avail: availOf(m, people) })).filter(c => c.avail !== 'away');
    const cap = c => (c.avail === 'part' ? 1 : c.kind === 'agent' ? 2 : 3);
    const bugs = store.listMd('bugs').map(f => (store.readMd(f) || {}).meta).filter(Boolean);
    const sevOf = t => { const b = bugs.find(x => x.task === t.id); return b ? b.severity : null; };
    const day = today(), soon = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
    const score = t => (t.status === 'doing' ? 0 : 10) + (t.due && t.due < day ? 0 : t.due && t.due <= soon ? 2 : 6) + ({ critical: 0, high: 1, normal: 4, low: 6 }[sevOf(t)] ?? 5);
    const open = tasksNow().filter(t => t.status === 'backlog' || t.status === 'doing').sort((a, b) => score(a) - score(b) || (a.order ?? 0) - (b.order ?? 0));
    const load = new Map(crew.map(c => [c.id, 0]));
    const items = [];
    const why = (t, c, keep) => [keep ? 'continues their work' : null, t.due && t.due < day ? 'overdue' : t.due && t.due <= soon ? `due ${t.due}` : null, sevOf(t) && ['critical', 'high'].includes(sevOf(t)) ? `${sevOf(t)} bug` : null,
      !keep && c.kind === 'agent' ? 'an agent can run with it' : null, !keep && c.kind === 'person' ? (c.avail === 'in' ? 'has room today' : 'light day') : null].filter(Boolean).join(' · ');
    for (const t of open) {   // keep current owners first
      const c = t.assignee && crew.find(x => x.id === t.assignee);
      if (c && load.get(c.id) < cap(c)) { load.set(c.id, load.get(c.id) + 1); items.push({ task: t.id, title: t.title, member: c.id, name: c.name, kind: c.kind, why: why(t, c, true), keep: true }); }
    }
    for (const t of open) {
      if (items.some(i => i.task === t.id) || (t.assignee && crew.some(x => x.id === t.assignee))) continue;
      const agentish = /^(fix|test|refactor|rename|lint|docs?|write tests|bump)\b/i.test(t.title);
      const free = crew.filter(c => load.get(c.id) < cap(c)).sort((a, b) => (agentish ? (a.kind === 'agent' ? -1 : 0) - (b.kind === 'agent' ? -1 : 0) : 0) || load.get(a.id) / cap(a) - load.get(b.id) / cap(b));
      const c = free[0]; if (!c) break;
      load.set(c.id, load.get(c.id) + 1);
      items.push({ task: t.id, title: t.title, member: c.id, name: c.name, kind: c.kind, why: why(t, c, false), keep: false });
    }
    return { crew: crew.map(c => ({ ...c, load: load.get(c.id), cap: cap(c) })), items };
  }
  async function plan(me, { fresh = false } = {}) {
    const key = pid(), prev = db.plans[key];
    if (prev && prev.date === today() && !fresh) {
      const s = suggest(me);   // refresh people/load; keep accepted marks and the focus line
      return { ...prev, crew: s.crew, items: prev.items.filter(i => tasksNow().some(t => t.id === i.task && t.status !== 'done')) };
    }
    const s = suggest(me);
    let focus = '', by = 'rules';
    if (brain && s.items.length) {
      try {
        const st = brain.status ? brain.status() : {};
        if (st.online) {
          const r = await Promise.race([brain.generate(`Today's plan for a small team building an app together:\n${s.items.slice(0, 12).map(i => `- ${i.name}: ${i.title}`).join('\n')}\n\nWrite ONE short sentence (max 25 words) naming the day's focus. No preamble.`, { maxTokens: 60 }), new Promise(r2 => setTimeout(() => r2(''), 8000))]);
          if (r) { focus = String(r).trim().split('\n')[0].slice(0, 200); by = 'brain'; }
        }
      } catch {}
    }
    if (!focus && s.items.length) focus = s.items.length > 1 ? `${s.items[0].title}, then ${s.items[1].title}` : s.items[0].title;
    db.plans[key] = { date: today(), focus, by, items: s.items.map(i => ({ ...i, accepted: !!i.keep })), made: now(), madeBy: me.id };
    save(); push('plan');
    return { ...db.plans[key], crew: s.crew };
  }
  function accept(me, { task, member: mid, all }) {
    const p = db.plans[pid()]; if (!p || p.date !== today()) throw err(409, 'make today\'s plan first');
    const picks = all ? p.items.filter(i => !i.accepted && (me.role === 'host' || i.member === me.id || (member(i.member) || {}).owner === me.id)) : p.items.filter(i => i.task === task && (!mid || i.member === mid));
    if (!picks.length) throw err(404, all ? 'nothing to accept for you' : 'not in today\'s plan');
    for (const i of picks) {
      const t = tasksNow().find(x => x.id === i.task); if (!t) continue;
      if (t.assignee !== i.member) { t.assignee = i.member; t.updated = now(); t.updatedBy = me.id; saveTask(t); }
      if (i.member !== me.id) { const m = member(i.member); if (isAgent(m)) tell(i.member, 'plan', `Today's plan gives you "${t.title}" (${t.id}). Take it with update_task when you start.`, me.id); else if (m) bus.notify({ type: 'task-assigned', to: [m.id], from: me.id, title: `Today's plan: ${t.title}`, body: i.why, view: 'tasks', ref: t.id }); }
      i.accepted = true;
    }
    save(); push('plan');
    return p;
  }

  // ---------- a quick count for badges ----------
  function summary(me) {
    const rv = db.reviews.filter(x => inPid(x) && x.status === 'pending').filter(r => { const ap = approvals.get(r.approval); return ap && ap.status === 'pending' && ((ap.to || []).includes(me.id) || me.role === 'host'); }).length
      + tasksNow().filter(t => t.status === 'review').length - db.reviews.filter(x => inPid(x) && x.status === 'pending' && x.task).length;
    return { reviews: Math.max(0, rv), handoffs: db.handoffs.filter(h => inPid(h) && h.status === 'open' && (!h.to || h.to === me.id)).length,
      agents: presenceFor(me).filter(m => m.role === 'agent' && m.online).length };
  }

  // ---------- MCP tools ----------
  function mcpTools({ text, err: mErr, S, str: sDesc }) {
    const wrap = fn => (a, me) => { try { return fn(a, me); } catch (e) { return mErr(e.message); } };
    return {
      my_lane: {
        description: 'Your lane in this project: tasks assigned to you, files you claimed, areas you own, hand-offs waiting for you, branches that overlap yours, and any pause/stop request from your owner. Call it at the start and between steps. Optionally report tokens_used/budget so humans see them.',
        inputSchema: S({ tokens_used: { type: 'number', description: 'Tokens you have used so far (optional)' }, budget: { type: 'number', description: 'Your token budget (optional)' } }),
        run: wrap(async (a, me) => {
          usage(me, a.tokens_used, a.budget);
          const t = tasksNow().filter(x => x.assignee === me.id && x.status !== 'done');
          const own = ownership(me).owners.find(o => o.id === me.id) || { claims: [], lanes: [] };
          const hs = db.handoffs.filter(h => inPid(h) && h.status === 'open' && (h.to === me.id || (!h.to && h.from !== me.id)));
          const c = await conflicts().catch(() => ({ pairs: [] }));
          const mine = (c.pairs || []).filter(p => p.a.owner === me.id || p.b.owner === me.id);
          const ctl = db.control[me.id];
          return text({ project: pid(), status: ctl && ctl.action !== 'resume' ? `${ctl.action.toUpperCase()} requested by ${nameOf(ctl.by)}${ctl.note ? ': ' + ctl.note : ''}` : 'go',
            messages: inboxFor(me), tasks: t.map(x => `${x.id} [${x.status}] ${x.title}`), claimedFiles: own.claims.map(x => x.path), lanes: own.lanes.map(x => x.area),
            handoffsForYou: hs.map(h => `${h.id}: ${h.title} (from ${nameOf(h.from)})${h.context ? ' · ' + h.context.slice(0, 200) : ''}`),
            overlaps: mine.map(p => `${p.a.branch} and ${p.b.branch} both touch ${p.files.slice(0, 5).join(', ')}`),
            next: t.length ? 'Keep going on your doing task. When done, call request_review.' : 'Nothing assigned: call suggest_task.' });
        }),
      },
      suggest_task: {
        description: 'Suggest the best next task for you from today\'s plan and the board. Returns one task id with why; take it with update_task (take: true, status: doing).',
        inputSchema: S({}),
        run: wrap(async (_, me) => {
          const p = await plan(me);
          const it = p.items.find(i => i.member === me.id && i.task) || suggest(me).items.find(i => i.member === me.id);
          if (it) return text({ task: it.task, title: it.title, why: it.why || 'free capacity', next: `update_task id=${it.task} take=true status=doing, then claim_file before editing.` });
          const free = tasksNow().find(t => t.status === 'backlog' && !t.assignee);
          return free ? text({ task: free.id, title: free.title, why: 'oldest unassigned backlog task' }) : text('No open tasks. Ask your owner in reply, or propose one.');
        }),
      },
      handoff: {
        description: 'Park work for someone else with context (what is done, what is left, gotchas). Releases your claims on the listed files and reassigns the task. `to` is a member name or id; leave it empty for anyone.',
        inputSchema: S({ title: sDesc('What is being handed off'), context: sDesc('What is done, what is left, how to continue'), to: sDesc('Member name or id (optional)'), task: sDesc('Task id (optional)'), branch: sDesc('Branch with the work (optional)'), files: sDesc('Comma-separated paths (optional)') }, ['title', 'context']),
        run: wrap((a, me) => { const h = handoff(a, me); return text(`Handed off ${h.id} to ${h.toName}.`); }),
      },
      take_handoff: {
        description: 'Take an open hand-off or an "Ask an agent" request (my_lane lists them under handoffsForYou). It becomes yours: do it, answer the person in chat (post_chat), then call take_handoff again with done: true.',
        inputSchema: S({ id: sDesc('Hand-off or request id, e.g. h-abc123'), done: { type: 'boolean', description: 'Mark it done (after you answered or finished)' } }, ['id']),
        run: wrap((a, me) => {
          if (a.done) { const h = finishHandoff(a.id, me); return text(`Done: ${h.title}.`); }
          const h = take(a.id, me);
          if (h.ask) postChat('general', 'tribecode', `🤖 ${me.name} picked up ${h.fromName}'s request: **${h.title}**`);
          return text({ took: h.id, title: h.title, from: h.fromName, context: h.context, next: h.ask ? `Do what ${h.fromName} asked, answer in chat with post_chat, then take_handoff id=${h.id} done=true.` : 'Continue the work, then request_review.' });
        }),
      },
      request_review: {
        description: 'Ask a human to review a branch before it merges. It shows in the Review queue with one-tap approve/deny; poll check_approval with the returned approval id. Moves the linked task to Review.',
        inputSchema: S({ branch: sDesc('Branch name, e.g. task/t-abc or tribe/you'), title: sDesc('One line: what changed'), summary: sDesc('Markdown: what, why, how to test'), task: sDesc('Task id (optional)') }, ['title']),
        run: wrap((a, me) => { const r = requestReview(a, me); return text({ review: r.id, approval: r.approval, askedOf: r.askedOf, next: `Call check_approval with id ${r.approval}. Do not merge until it says approved.` }); }),
      },
    };
  }

  // ---------- HTTP: /api/coord/... ----------
  async function route(req, res, { m, b, c, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    const ro = me.role === 'spectator';
    const body = () => readBody(req);
    try {
      if (b === 'summary' && m === 'GET') return send(res, 200, summary(me));
      if (b === 'agents' && m === 'GET' && !c) return send(res, 200, { agents: agents(me) });
      if (b === 'agents' && c && parts[3] === 'control' && m === 'POST') { const x = await body(); return send(res, 200, { control: control(c, x.action, x.note, me) }); }
      if (b === 'ownership' && m === 'GET') return send(res, 200, ownership(me));
      if (b === 'lanes' && m === 'POST' && !ro) return send(res, 200, { lane: addLane(await body(), me) });
      if (b === 'lanes' && c && m === 'DELETE' && !ro) { dropLane(c, me); return send(res, 200, { ok: true }); }
      if (b === 'claims' && c && parts[3] === 'handoff' && m === 'POST' && !ro) { const x = await body(); return send(res, 200, { claim: handClaim(c, x.to, me) }); }
      if (b === 'conflicts' && m === 'GET' && !c) return send(res, 200, await conflicts());
      if (b === 'conflicts' && c === 'sync' && m === 'POST' && !ro) { const x = await body(); return send(res, 200, await askSync(str(x.a, 200), str(x.b, 200), me)); }
      if (b === 'handoffs' && m === 'GET' && !c) return send(res, 200, { handoffs: db.handoffs.filter(inPid).slice().reverse().map(hview) });
      if (b === 'handoffs' && m === 'POST' && !c && !ro) return send(res, 200, { handoff: handoff(await body(), me) });
      if (b === 'asks' && m === 'POST' && !c && !ro) return send(res, 200, { ask: ask(await body(), me) });   // feat/any-llm: Ask an agent
      if (b === 'asks' && m === 'GET' && !c) return send(res, 200, { asks: db.handoffs.filter(h => inPid(h) && h.ask).slice().reverse().slice(0, 40).map(hview) });
      if (b === 'handoffs' && c && m === 'POST' && !ro) return send(res, 200, { handoff: parts[3] === 'take' ? take(c, me) : finishHandoff(c, me) });
      if (b === 'reviews' && m === 'GET' && !c) return send(res, 200, { reviews: reviews(me) });
      if (b === 'reviews' && m === 'POST' && !c && !ro) return send(res, 200, { review: requestReview(await body(), me) });
      if (b === 'reviews' && c && ['approve', 'deny'].includes(parts[3]) && m === 'POST' && !ro && me.role !== 'agent') { const x = await body(); return send(res, 200, decideReview(c, parts[3], x.note, me)); }
      if (b === 'plan' && m === 'GET' && !c) return send(res, 200, { plan: await plan(me), availability: db.availability[me.id] && db.availability[me.id].date === today() ? db.availability[me.id] : null });
      if (b === 'plan' && m === 'POST' && !c && !ro) return send(res, 200, { plan: await plan(me, { fresh: true }) });
      if (b === 'plan' && c === 'accept' && m === 'POST' && !ro && me.role !== 'agent') return send(res, 200, { plan: accept(me, await body()) });
      if (b === 'availability' && m === 'PUT' && !ro) { const x = await body(); return send(res, 200, { availability: availability(me, x.status, x.note) }); }
      if (ro && m !== 'GET') return fail(res, 403, 'spectators are read-only');
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }

  // feat/ship-flow: open hand-offs and pending reviews for the "who's waiting on whom" line (server/ship.js pulse)
  function openWork() {
    for (const r of db.reviews.filter(x => inPid(x) && x.status === 'pending')) { try { syncReview(r); } catch {} }
    return { handoffs: db.handoffs.filter(h => inPid(h) && h.status === 'open').slice(-8).map(h => ({ id: h.id, title: h.title, from: h.from, to: h.to || null })),
      reviews: db.reviews.filter(r => inPid(r) && r.status === 'pending').slice(-8).map(r => ({ id: r.id, title: r.title, by: r.by, branch: r.branch, task: r.task })) };
  }
  return { route, mcpTools, inboxFor, tell, control, agents, ownership, addLane, dropLane, conflicts, handoff, requestReview, reviews, plan, accept, summary, usage, openWork };
};
