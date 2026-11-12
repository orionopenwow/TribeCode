// The Global Hub: what you see when no project is selected (app/ui/hub.js). Grew out of the tribe dashboard.
//   GET  /api/hub                member-scoped: ONLY projects the member can see (P.visibleTo / P.canSee)
//        { hero, more, feed, notes, suggestions, status, fleet, projects, people, prefs, rev, at }
//   GET  /api/hub/fleet          your agents (status, task/focus, context %, tokens), local models, background loops
//   GET  /api/hub/repos          every visible project's repo: name, branch, ahead/behind, dirty, remote, last commit
//   GET  /api/hub/docs?q=        docs across visible projects (title/body search)
//   PUT  /api/hub/prefs          { pins: [projectId] }  pinned projects in the workspace switcher (per member)
//   POST /api/hub/dismiss        { id }            "not now" on a suggestion, remembered
//   POST /api/hub/note           { project, text } quick note filed into a project (a doc in that project)
//   POST /api/hub/seen           { project }       "I was just there" (rolling "N new since" suggestions)
//   POST /api/hub/ask            { prompt, kind? } Home's Ask box and "Refine with AI" on Get started, answered by the
//        local brain (brain.generate). kind: 'ask' (default) | 'start' (suggest a first project from your scratchpad
//        and docs). People only, at most ASK_MAX per minute and one at a time per member -> { answer, model, kind }.
//        (With your own Claude Code connected, Home sends the prompt to its private chat instead; that is a DM.)
// /api/dashboard/... stays as an alias.
//
// Rolling, not polling: project snapshots (the feed of what changed) are cached per project and rebuilt only
// after an event in that project (index.js calls onEvent from broadcast, and bus 'notify' marks recipients).
// Member views are cached per member and recomputed at most every THROTTLE ms; when the result's signature
// changes, the member's sockets get a tiny { type: 'hub', rev } and the page fetches the new view.
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { run } = require('./gitutil');

const THROTTLE = Number(process.env.TRIBE_DASH_THROTTLE_MS) || 4000;   // at most one recompute per member per N ms
const DEBOUNCE = 700;
const STALE_MS = 60_000;          // a GET recomputes when the cached view is older than this, even without events
const FEED_DAYS = 14, FEED_MAX = 60, PER_PROJECT = 24;
const WATCH = new Set(['coord', 'repo', 'people', 'chat', 'chat-update', 'task', 'task-removed', 'gist', 'approval', 'doc', 'doc-removed', 'flow', 'secretary', 'proposal', 'projects', 'presence', 'milestones']);

const clip = (s, n = 140) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const plain = s => String(s || '').replace(/\*\*|__|`|^>\s?/gm, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
const t = v => { const x = Date.parse(v); return Number.isFinite(x) ? x : 0; };
const iso = v => new Date(v).toISOString();
const DAY = 86400_000;
const INSIGHTS = fs.existsSync(require('node:path').join(__dirname, 'insights.js'));
const ASK_MAX = Number(process.env.TRIBE_ASK_MAX) || 6, ASK_WINDOW = 60_000;

module.exports = function hub({ P, base, getMembers, presenceFor, loadTasks, docs, approvals, flow: flowIn, secretary, workshop, pocket, sendTo, isOnline, nameOf, str, slug,
    brain = null, coord = null, people = null, hubFor = null, preview = null, agentSeen = null, idleMs = 180_000 }) {
  let flow = flowIn || null;   // server/flow.js is made after the hub (setFlow)
  const FILE = '.tribe/dashboard.json';
  const db = base.readJSON(FILE, null) || {};
  db.dismissed = db.dismissed || {};   // memberId -> { id: iso }
  db.seen = db.seen || {};             // memberId -> { projectId: iso } (last time they were in the project)
  db.prefs = db.prefs || {};           // memberId -> { pins: [projectId] }
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => base.writeJSON(FILE, db), 300); };
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const human = m => !!m && m.role !== 'agent' && m.role !== 'spectator';
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  let notesHook = null;   // server/notes.js may land later: dashboard.useNotes((pid, me) => [{ id, title, at, ref }])
  let scratchOf = null;   // server/scratch.js: dashboard.useScratch(mid => notes) (Ask and "Refine with AI" read your own notes)

  // ---------- project snapshots: the feed of what changed (shared by every member who can see the project) ----------
  const snaps = new Map();      // pid -> { at, items, building }
  const dirtyProjects = new Set();
  const gitCache = new Map();   // repo -> { at, list }
  async function commits(p) {
    if (!p.repo || !fs.existsSync(p.repo)) return [];
    const c = gitCache.get(p.repo); if (c && Date.now() - c.at < 30_000) return c.list;
    const r = await run('git', ['log', '-n', '12', '--no-merges', '--format=%h%x1f%an%x1f%cI%x1f%s'], { cwd: p.repo, timeout: 8000 });
    const list = r.code ? [] : r.out.split('\n').filter(Boolean).map(l => { const [sha, author, at, subject] = l.split('\x1f'); return { sha, author, at, subject }; });
    gitCache.set(p.repo, { at: Date.now(), list });
    return list;
  }
  async function buildSnap(p) {
    const since = Date.now() - FEED_DAYS * DAY, out = [];
    const add = it => { if (t(it.at) >= since) out.push({ project: p.id, ...it }); };
    const st = flow && flow.load ? flow.load(p.id) : null;
    // agent gists (and commit gists in flow projects)
    if (flow) try { for (const g of flow.gists.list(p.id, 40)) add({ id: `gist:${g.id}`, kind: 'gist', gist: g.kind, at: g.at, title: g.title, by: g.by, byName: g.byName, agent: !!g.agent, sub: (g.bullets || [])[0] || '', ref: { type: 'chat', id: g.msg || null } }); } catch {}
    // plan changes (the living plan's history)
    if (st && st.log) for (const [i, x] of st.log.entries()) add({ id: `plan:${p.id}:${t(x.at)}:${i}`, kind: 'plan', at: x.at, title: x.text, by: 'tribecode', byName: 'Plan', ref: { type: 'plan' } });
    // commits, gist-style (projects without the flow; flow projects already turn commits into gists)
    if (!st) for (const c of await commits(p)) add({ id: `commit:${c.sha}`, kind: 'commit', at: c.at, title: clip(c.subject, 120), byName: c.author, sub: c.sha, ref: { type: 'commit', id: c.sha } });
    const pstore = P.scopedStore(() => p.id);
    P.inProject(p.id, () => {
      // decisions (closed votes, /decide)
      for (const f of pstore.listMd('decisions')) {
        const r = pstore.readMd(f); if (!r) continue;
        let at; try { at = fs.statSync(pstore.p(f)).mtime.toISOString(); } catch { at = r.meta.date; }
        const title = (r.body.match(/^#\s+(.+)$/m) || [])[1] || f.replace(/^.*[\\/]/, '').replace(/\.md$/, '');
        add({ id: `decision:${f.replace(/^.*[\\/]/, '')}`, kind: 'decision', at, title: clip(plain(title), 140), by: r.meta.by || null, byName: r.meta.by ? nameOf(r.meta.by) : '', ref: { type: r.meta.vote ? 'chat' : 'decision', id: r.meta.vote || null } });
      }
      // proposals (the Board): new ones and how they ended
      for (const f of pstore.listMd('proposals')) {
        const r = pstore.readMd(f); if (!r || !r.meta || !r.meta.id) continue; const x = r.meta;
        add({ id: `proposal:${x.id}`, kind: 'proposal', at: x.closed || x.created, title: clip(plain(x.title), 140), by: x.by || null, byName: x.by ? nameOf(x.by) : '',
          sub: x.status === 'approved' ? 'Approved' : x.status === 'parked' ? 'Parked' : 'Proposed', ref: { type: 'proposal', id: x.id } });
      }
      // new docs (created) and edits (updated by someone)
      try {
        for (const d of docs.list().slice(0, 30)) {
          if (d.created && t(d.created) >= since) add({ id: `doc:${d.slug}`, kind: 'doc', at: d.created, title: d.title, by: d.by, byName: nameOf(d.by), sub: 'New doc', ref: { type: 'doc', id: d.slug } });
          if (d.updated && d.version > 1 && t(d.updated) - t(d.created) > 60_000) add({ id: `docv:${d.slug}:${d.version}`, kind: 'doc', at: d.updated, title: d.title, by: d.updatedBy, byName: nameOf(d.updatedBy), sub: 'Edited', ref: { type: 'doc', id: d.slug } });
        }
      } catch {}
      // finished tasks
      try { for (const k of loadTasks()) if (k.status === 'done' && k.updated) add({ id: `done:${k.id}:${t(k.updated)}`, kind: 'task', at: k.updated, title: k.title, by: k.updatedBy || k.assignee, byName: nameOf(k.updatedBy || k.assignee), sub: 'Done', ref: { type: 'task', id: k.id } }); } catch {}
    });
    // people joining the project, and the latest human chat lines
    for (const mid of Object.keys(p.members || {})) { const m = member(mid); if (m && m.role !== 'agent' && m.joined) add({ id: `join:${p.id}:${mid}`, kind: 'join', at: m.joined, title: `${m.name} joined`, by: mid, byName: m.name, ref: { type: 'chat' } }); }
    const chat = base.readJSONL(`chat/${p.channel}.jsonl`, 300);
    let lines = 0;
    for (let i = chat.length - 1; i >= 0 && lines < 3; i--) {
      const m = chat[i]; if (!m || m.deleted) continue;
      if (m.vote && m.vote.q && t(m.at) >= since && !out.some(x => x.id === `vote:${m.id}`)) { add({ id: `vote:${m.id}`, kind: 'vote', at: m.at, title: clip(plain(m.vote.q), 140), by: m.by, byName: nameOf(m.by), sub: m.vote.status === 'open' ? 'Vote open' : 'Vote closed', ref: { type: 'chat', id: m.id } }); continue; }
      if (m.by === 'tribecode' || m.gist || m.vote || m.voteResult || !m.text) continue;
      const who = member(m.by); if (!who || who.role === 'agent') continue;
      add({ id: `chat:${m.id}`, kind: 'chat', at: m.at, title: clip(plain(m.text), 140), by: m.by, byName: who.name, ref: { type: 'chat', id: m.id } }); lines++;
    }
    out.sort((a, b) => t(b.at) - t(a.at));
    return out.slice(0, PER_PROJECT);
  }
  async function snap(p) {
    const s = snaps.get(p.id);
    if (s && !dirtyProjects.has(p.id) && Date.now() - s.at < STALE_MS) return s.items;
    if (s && s.building) return s.building;
    dirtyProjects.delete(p.id);
    const building = buildSnap(p).catch(e => { console.error('hub snapshot:', e.message); return []; });
    snaps.set(p.id, { ...(s || { items: [] }), building });
    const items = await building;
    snaps.set(p.id, { at: Date.now(), items });
    return items;
  }

  // ---------- what needs YOU (hero) ----------
  const openVotes = () => base.readJSON('.tribe/votes-open.json', []);
  function heroFor(me, visible) {
    const out = [], vis = new Set(visible.map(p => p.id)), now = Date.now();
    const myAgents = getMembers().filter(m => m.role === 'agent' && m.owner === me.id).map(m => m.id);
    // approvals waiting on you
    for (const a of approvals.list()) {
      const pid = a.project || P.defaultId();
      if (a.status !== 'pending' || !vis.has(pid) || !(a.to || []).includes(me.id)) continue;
      out.push({ id: `ap:${a.id}`, kind: 'approval', project: pid, at: a.created, score: a.risk === 'high' ? 100 : 90, title: a.title, sub: `${a.byName} asks · ${a.risk} risk`, approval: a.id });
    }
    // votes you have not cast
    if (human(me)) for (const e of openVotes()) {
      if (!vis.has(e.project)) continue;
      const m = base.readJSONL(`chat/${e.ch}.jsonl`, 2000).find(x => x.id === e.id);
      if (!m || !m.vote || m.deleted || m.vote.status !== 'open' || (m.vote.ballots || {})[me.id]) continue;
      const soon = m.vote.deadline && t(m.vote.deadline) - now < 6 * 3600_000;
      out.push({ id: `vote:${m.id}`, kind: 'vote', project: e.project, at: m.at, score: soon ? 85 : 80, title: m.vote.q, sub: `${m.vote.suggested ? `${nameOf(m.vote.suggested.agent)} suggests` : `${nameOf(m.by)} asks`}${m.vote.deadline ? ` · closes ${m.vote.deadline}` : ''}`,
        vote: { id: m.id, channel: e.ch, options: m.vote.options } });
    }
    // tasks assigned to you (or your agents): overdue and due soon first
    const day = iso(now).slice(0, 10), soon = iso(now + 3 * DAY).slice(0, 10);
    for (const p of visible) P.inProject(p.id, () => {
      let tasks = []; try { tasks = loadTasks(); } catch {}
      for (const k of tasks) {
        if (k.status === 'done' || !(k.assignee === me.id || myAgents.includes(k.assignee))) continue;
        const overdue = k.due && k.due < day, dueSoon = k.due && k.due <= soon;
        if (!overdue && !dueSoon && now - t(k.updated) > 2 * DAY) continue;
        out.push({ id: `task:${k.id}`, kind: 'task', project: p.id, at: k.updated, score: overdue ? 75 : dueSoon ? 60 : 40, title: k.title,
          sub: `${overdue ? `Overdue · ${k.due}` : dueSoon ? `Due ${k.due}` : 'Assigned to you'}${k.assignee !== me.id ? ' · your Claude' : ''}`, task: k.id, status: k.status, done: true });
      }
    });
    // blockers that mention you (living plan)
    const names = [me.name.toLowerCase(), me.name.toLowerCase().split(/\s+/)[0], me.id.toLowerCase()];
    for (const p of visible) {
      const st = flow && flow.load ? flow.load(p.id) : null; if (!st || !st.plan) continue;
      for (const b of st.plan.blockers.filter(x => x.open)) {
        const text = String(b.text || '').toLowerCase();
        if (!(myAgents.includes(b.by) || names.some(n => n.length > 1 && new RegExp(`(^|[^a-z0-9])@?${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text)))) continue;
        out.push({ id: `blocker:${b.id}`, kind: 'blocker', project: p.id, at: b.at, score: 65, title: b.text, sub: `Blocker · ${b.byName}`, blocker: b.id, done: true });
      }
    }
    // @mentions (last 48 h) you have not answered in that channel
    try {
      for (const n of pocket.inbox(me.id)) {
        if (n.type !== 'mention' || now - t(n.at) > 2 * DAY) continue;
        const p = P.byChannel(n.ref); if (!p || !vis.has(p.id)) continue;
        const chat = base.readJSONL(`chat/${p.channel}.jsonl`, 200);
        if (chat.some(x => x.by === me.id && t(x.at) > t(n.at))) continue;   // you already spoke there since
        out.push({ id: `mention:${n.id}`, kind: 'mention', project: p.id, at: n.at, score: 70, title: clip(plain(n.body), 140), sub: n.title.replace(/ in #\S+$/, ''), done: true });
      }
    } catch {}
    const gone = db.dismissed[me.id] || {};
    return out.filter(x => !gone[x.id]).sort((a, b) => b.score - a.score || t(b.at) - t(a.at));
  }

  // ---------- your notes ----------
  function notesFor(me, visible) {
    const out = [];
    for (const p of visible) P.inProject(p.id, () => {
      try { for (const d of docs.list()) if (d.by === me.id || d.updatedBy === me.id) out.push({ id: `doc:${p.id}:${d.slug}`, project: p.id, kind: 'doc', title: d.title, at: d.updated || d.created, words: d.words, ref: { type: 'doc', id: d.slug }, note: d.source === 'dashboard' }); } catch {}
      if (notesHook) try { for (const n of notesHook(p.id, me) || []) out.push({ project: p.id, kind: 'note', ...n }); } catch {}
    });
    return out.sort((a, b) => t(b.at) - t(a.at)).slice(0, 8);
  }

  // ---------- suggestions (rolling, from signals) ----------
  function suggestionsFor(me, visible, feed) {
    const out = [], now = Date.now(), seen = db.seen[me.id] || {};
    const push = s => { if (!out.some(x => x.id === s.id)) out.push(s); };
    const agents = getMembers().filter(m => m.role === 'agent' && m.owner === me.id && m.tokenHash);
    const pres = new Map(presenceFor(me).map(m => [m.id, m]));
    for (const p of visible) P.inProject(p.id, () => {
      let tasks = []; try { tasks = loadTasks(); } catch {}
      // unclaimed tasks in your role's folders (else any open unassigned task, if you have a role there)
      const role = flow && flow.roleOf ? flow.roleOf(p.id, me.id) : null;
      const st = flow && flow.load ? flow.load(p.id) : null;
      if (human(me)) {
        const roleTasks = role && st && st.plan ? st.plan.milestones.flatMap(m => m.items).filter(i => i.role === role.id && !i.done && i.task).map(i => i.task) : [];
        const free = tasks.filter(k => k.status === 'backlog' && !k.assignee);
        const pick = free.find(k => roleTasks.includes(k.id)) || (role ? null : free.sort((a, b) => t(b.created) - t(a.created))[0]);
        if (pick) push({ id: `take:${pick.id}`, kind: 'take', project: p.id, title: pick.title, why: role && roleTasks.includes(pick.id) ? `Open in ${role.name}, your role` : 'Nobody has it yet', action: { label: 'Take it', do: 'take', task: pick.id } });
      }
      // stale docs you started (no edits for a week)
      try { for (const d of docs.list()) if (d.by === me.id && now - t(d.updated) > 7 * DAY) { push({ id: `stale:${p.id}:${d.slug}:${d.version}`, kind: 'stale', project: p.id, title: d.title, why: `Untouched for ${Math.round((now - t(d.updated)) / DAY)} days`, action: { label: 'Review', do: 'open', ref: { type: 'doc', id: d.slug } } }); break; } } catch {}
      // idle agents you own: give your Claude a task
      for (const a of agents) {
        const busy = tasks.some(k => k.assignee === a.id && k.status === 'doing');
        const on = (pres.get(a.id) || {}).online;
        if (busy || (a.project && a.project !== p.id)) continue;
        const next = tasks.find(k => k.status === 'backlog' && !k.assignee);
        if (next) push({ id: `agent:${a.id}:${next.id}`, kind: 'agent', project: p.id, title: `Give ${a.name} a task`, why: `${on ? 'Online and idle' : 'Idle'} · next up: ${clip(next.title, 60)}`, action: { label: 'Hand it over', do: 'assign', task: next.id, member: a.id } });
      }
    });
    // projects with activity since you last looked
    for (const p of visible) {
      const last = t(seen[p.id]);
      const fresh = feed.filter(x => x.project === p.id && x.by !== me.id && t(x.at) > last && (x.kind !== 'join' || x.by !== me.id));
      if (!last || fresh.length < 1) continue;
      push({ id: `since:${p.id}:${t(fresh[0].at)}`, kind: 'since', project: p.id, title: `${fresh.length} new in ${p.name}`, why: `Since you were there ${agoText(now - last)}`, action: { label: 'Catch up', do: 'open', ref: { type: 'project' } } });
    }
    // secretary inspirations that build on your work
    if (secretary) for (const p of visible) {
      try {
        const ideas = (secretary.view(p.id, me).ideas || []).filter(i => i.status === 'new' && (i.sources || []).some(s => s.who === me.name));
        if (ideas[0]) push({ id: `idea:${ideas[0].id}`, kind: 'idea', project: p.id, title: ideas[0].title, why: 'The secretary connected it to your work', action: { label: 'Look', do: 'open', ref: { type: 'secretary', id: ideas[0].id } } });
      } catch {}
    }
    // Workshop items new this week that none of your projects use yet
    if (workshop) try {
      const words = new Set(visible.flatMap(p => String(p.name).toLowerCase().split(/[^a-z0-9]+/)).filter(w => w.length > 3));
      const fresh = workshop.list(me, '', '').filter(it => now - t(it.updated || it.created) < 7 * DAY && !(it.usedIn || []).length);
      const rel = fresh.find(it => [it.title, it.summary, ...(it.tags || [])].join(' ').toLowerCase().split(/[^a-z0-9]+/).some(w => words.has(w))) || fresh[0];
      if (rel) push({ id: `ws:${rel.id}:${rel.version || ''}`, kind: 'workshop', project: null, title: rel.title, why: `New in the Workshop${rel.byName ? ` from ${rel.byName}` : ''}`, action: { label: 'Open', do: 'workshop', id: rel.id } });
    } catch {}
    const gone = db.dismissed[me.id] || {};
    return out.filter(s => !gone[s.id]).slice(0, 6);
  }
  const agoText = ms => (ms < 3600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m ago` : ms < DAY ? `${Math.round(ms / 3600_000)}h ago` : `${Math.round(ms / DAY)}d ago`);

  // ---------- the Secretary's newest inspirations across your projects (Home's AI Insights fall back to these) ----------
  function ideasFor(me, visible) {
    if (!secretary || !secretary.view) return [];
    const out = [];
    for (const p of visible.slice(0, 12)) {
      try { for (const i of (secretary.view(p.id, me).ideas || []).filter(x => x.status === 'new').slice(0, 2)) out.push({ id: `idea:${i.id}`, project: p.id, title: clip(i.title, 120), body: clip(plain(i.body || ''), 220), at: i.at || i.created || null }); } catch {}
    }
    return out.sort((a, b) => t(b.at) - t(a.at)).slice(0, 4);
  }

  // ---------- Ask (Home's prompt box) and Refine with AI (Get started): the local brain ----------
  const asks = new Map();   // mid -> { at: [ms], busy }
  function askGate(mid) {
    const now = Date.now(), a = asks.get(mid) || { at: [], busy: false };
    a.at = a.at.filter(x => now - x < ASK_WINDOW);
    if (a.busy) throw err(429, 'Still answering your last question.');
    if (a.at.length >= ASK_MAX) throw err(429, `Slow down: at most ${ASK_MAX} questions a minute.`);
    a.at.push(now); a.busy = true; asks.set(mid, a);
    return () => { a.busy = false; };
  }
  async function ask(me, body) {
    const kind = body.kind === 'start' ? 'start' : 'ask';
    const prompt = str(body.prompt, 2000);
    if (kind === 'ask' && !prompt) throw err(400, 'ask something first');
    if (!brain) throw err(503, 'There is no local model on this host.');
    const done = askGate(me.id);
    try {
      const visible = P.visibleTo(me), v = views.get(me.id);
      const feed = ((v && v.data && v.data.feed) || []).slice(0, 8).map(x => `- ${x.title}${x.byName ? ` (${x.byName})` : ''}`).join('\n');
      let notes = []; try { notes = (scratchOf ? scratchOf(me.id) : []).filter(n => n.text && n.text.trim()).slice(0, 8); } catch {}
      const noteText = notes.map(n => `- ${clip(n.text, 300)}`).join('\n');
      const projects = visible.map(p => p.name).slice(0, 20).join(', ') || '(none yet)';
      let docTitles = [];
      for (const p of visible.slice(0, 8)) P.inProject(p.id, () => { try { docTitles.push(...docs.list().filter(d => d.by === me.id).slice(0, 4).map(d => d.title)); } catch {} });
      const ctx = `Projects: ${projects}\nRecent activity:\n${feed || '(quiet)'}\nTheir scratchpad notes:\n${noteText || '(empty)'}`;
      const answer = kind === 'start'
        ? await brain.generate(`${ctx}\nTheir docs: ${docTitles.slice(0, 12).join(', ') || '(none)'}\n\nSuggest a first project for ${me.name} to build with friends, based on their notes. Reply with a short project name on the first line, then 3 bullets (each under 90 characters) for the first steps. Plain text, no preamble.`,
          { system: 'You help a small group of friends pick a first software project. Ground it in their own notes; if the notes are empty, suggest something small and fun. Be concrete and brief.', maxTokens: 220, timeoutMs: 45_000 })
        : await brain.generate(`${ctx}\n\nQuestion from ${me.name}: ${prompt}\n\nAnswer in at most 4 short sentences. Plain text.`,
          { system: `You are the local assistant on ${me.name}'s TribeCode home: a self-hosted app where friends and their Claude Code agents build apps together. Use the context when it helps; never invent facts about their projects.`, maxTokens: 320, timeoutMs: 45_000 });
      if (!answer) throw err(503, (brain.status().error ? `The local model is off: ${brain.status().error}.` : 'The local model is off.') + ' Start Ollama or pick a brain in Settings › Flint’s brain, or connect your AI (Claude Code, Codex, Gemini CLI…) and ask it instead.');
      return { answer: String(answer).slice(0, 4000), model: brain.status().model || '', kind };
    } catch (e) {
      if (e.status) throw e;
      throw err(503, `The local model did not answer (${clip(e.message, 80)}).`);
    } finally { done(); }
  }

  // ---------- agents & models: your agents, local models, background loops ----------
  const human2 = m => !!m && m.role !== 'agent';
  function fleet(me) {
    const visible = P.visibleTo(me), vis = new Set(visible.map(p => p.id));
    const pres = new Map(presenceFor(me).map(m => [m.id, m]));
    const mineAll = getMembers().filter(m => m.role === 'agent' && m.tokenHash && (m.owner === me.id));
    const agents = mineAll.map(a => {
      const pr = pres.get(a.id) || {}, seen = agentSeen ? agentSeen.get(a.id) : null;
      const online = !!pr.online || (!!seen && Date.now() - seen.at < idleMs);
      const pid = [pr.project, seen && seen.project, a.project].find(x => x && vis.has(x)) || null;
      let task = null, tokens = null, budget = null, ctx = null;
      const look = p => P.inProject(p, () => {
        try { const row = coord ? coord.agents(me).find(x => x.id === a.id) : null; if (row) { task = task || row.task; tokens = tokens ?? row.tokens; budget = budget ?? row.budget; } } catch {}
        try { const c = people && people.contextOf ? people.contextOf(a.id) : null; if (c && (!ctx || String(c.at) > String(ctx.at))) ctx = c; } catch {}
      });
      if (pid) look(pid); else for (const p of visible.slice(0, 12)) look(p.id);
      const proj = pid ? P.get(pid) : null;
      return { id: a.id, name: a.name, kind: a.kind || 'claude-code', online, project: pid, projectName: proj ? proj.name : '', color: proj ? proj.color : null,
        doing: (ctx && ctx.focus) || (task && task.title) || (online ? (pr.where || (seen && seen.where) || '') : ''),
        task: task ? { id: task.id, title: task.title, status: task.status } : null,
        context: ctx && Number.isFinite(ctx.usedPct) ? ctx.usedPct : null, tokens: Number.isFinite(tokens) ? tokens : null, budget: Number.isFinite(budget) ? budget : null,
        since: pr.since || (seen ? new Date(seen.at).toISOString() : null) };
    }).sort((x, y) => (y.online - x.online) || x.name.localeCompare(y.name));
    const st = brain ? brain.status() : { online: false };
    const models = { online: !!st.online, model: st.model || '', list: brain ? brain.models().slice(0, 8) : [], error: st.online ? '' : (st.error || 'Ollama is off') };
    const sec = secretary && secretary.brief ? secretary.brief() : null;
    const loops = [];
    if (sec) loops.push({ id: 'secretary', name: 'Secretary', on: !!sec.enabled, state: !sec.enabled ? 'off' : sec.running ? 'thinking' : sec.quiet ? 'quiet hours' : 'on', last: sec.lastRun, model: sec.model || '' });
    if (hubFor) {
      const auto = visible.filter(p => p.repo).map(p => { try { const s2 = hubFor(p.id).settings(); return s2 && s2.autopilot && s2.autopilot.enabled ? p : null; } catch { return null; } }).filter(Boolean);
      loops.push({ id: 'autopilot', name: 'Repo autopilot', on: auto.length > 0, state: auto.length ? `on in ${auto.length === 1 ? auto[0].name : auto.length + ' projects'}` : 'off', projects: auto.map(p => p.id) });
    }
    if (preview) {
      const live = visible.filter(p => { try { const s3 = preview.status(p.id, me); return s3 && s3.hasRepo && s3.hasIndex; } catch { return false; } });
      loops.push({ id: 'preview', name: 'Preview watcher', on: live.length > 0, state: live.length ? `ready in ${live.length === 1 ? live[0].name : live.length + ' projects'}` : 'nothing to preview', projects: live.map(p => p.id) });
    }
    return { agents, models, loops, secretary: sec };
  }
  async function repos(me) {
    const out = [];
    for (const p of P.visibleTo(me)) {
      const row = { project: p.id, name: p.name, emoji: p.emoji || '', color: p.color, image: p.image || null, repo: null };
      if (p.repo && hubFor) {
        let st = null; try { st = hubFor(p.id).status(); } catch {}
        if (st && st.enabled && !st.loading) row.repo = { name: st.name, branch: st.branch, main: st.main, ahead: st.ahead || 0, behind: st.behind || 0, dirty: st.dirtyCount || 0,
          remote: st.remote ? (st.remote.github || st.remote.url.replace(/^https?:\/\//, '')) : null, last: (st.commits || [])[0] || null };
        else if (st && st.loading) row.repo = { name: require('node:path').basename(p.repo), loading: true };
        else { const c = (await commits(p))[0] || null; row.repo = { name: require('node:path').basename(p.repo), last: c ? { sha: c.sha, author: c.author, subject: c.subject, at: c.at } : null }; }
      }
      out.push(row);
    }
    return out;
  }
  function allDocs(me, q) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6), out = [];
    for (const p of P.visibleTo(me)) P.inProject(p.id, () => {
      let list = []; try { list = docs.list(); } catch {}
      for (const d of list) {
        let hit = !words.length, snippet = '';
        if (words.length) {
          const title = String(d.title || '').toLowerCase();
          hit = words.every(w => title.includes(w));
          if (!hit) { try { const full = docs.read(d.slug); const body = String((full && full.body) || ''); const low = body.toLowerCase(); hit = words.every(w => low.includes(w) || title.includes(w)); if (hit) { const i = Math.max(0, low.indexOf(words[0]) - 40); snippet = clip(plain(body.slice(i, i + 160)), 120); } } catch {} }
        }
        let preview = '';   // the first lines, for the docs center's card thumbnails
        if (hit) { try { const full = docs.read(d.slug); preview = clip(plain(String((full && full.body) || '').slice(0, 600)), 260); } catch {} }
        if (hit) out.push({ project: p.id, projectName: p.name, color: p.color, slug: d.slug, title: d.title, at: d.updated || d.created, by: d.updatedBy || d.by, byName: nameOf(d.updatedBy || d.by), owner: d.by, kind: d.kind || undefined, excerpt: String(d.excerpt || '').slice(0, 600), img: d.img || undefined, snippet, preview });   // feat/files-dash: kind, owner and the raw start for real previews
      }
    });
    return out.sort((a, b) => t(b.at) - t(a.at)).slice(0, 60);
  }
  function prefsOf(me) {
    const pr = db.prefs[me.id] || {};
    return { pins: (pr.pins || []).filter(pid => P.canSee(me, pid)) };
  }

  // ---------- the member view ----------
  const views = new Map();   // mid -> { at, data, sig, dirty, timer, last }
  async function compute(me) {
    const visible = P.visibleTo(me);
    const feed = (await Promise.all(visible.map(p => snap(p)))).flat().filter(x => !(x.kind === 'join' && x.by === me.id)).sort((a, b) => t(b.at) - t(a.at)).slice(0, FEED_MAX);   // your own joins are not news
    const heroAll = heroFor(me, visible);
    const pres = presenceFor(me);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const myAgents = pres.filter(m => m.role === 'agent' && m.owner === me.id).map(m => ({ id: m.id, name: m.name, online: !!m.online, where: m.online ? m.where || '' : '' }));
    const data = {
      me: { id: me.id, name: me.name, role: me.role },
      hero: heroAll.slice(0, 3), more: heroAll.slice(3, 8), waiting: heroAll.length,
      feed,
      notes: notesFor(me, visible),
      suggestions: suggestionsFor(me, visible, feed),
      status: { activeToday: new Set(feed.filter(x => t(x.at) >= today.getTime()).map(x => x.project)).size, projects: visible.length, agents: myAgents },
      projects: visible.map(p => ({ id: p.id, name: p.name, emoji: p.emoji || '', color: p.color, image: p.image || null, last: (feed.find(x => x.project === p.id) || {}).at || null, here: pres.filter(m => m.online && m.project === p.id && m.role !== 'agent').length })),
      people: pres.filter(m => m.role !== 'agent' && m.id !== me.id).map(m => ({ id: m.id, name: m.name, color: m.color, online: !!m.online, project: m.project || null })),
      lastProject: me.project && P.canSee(me, me.project) ? me.project : (visible[0] || {}).id || null,
      fleet: fleet(me),
      ideas: ideasFor(me, visible),
      prefs: prefsOf(me),
      notesApi: !!notesHook,
      insightsApi: INSIGHTS,   // server/insights.js is on this host: Home asks GET /api/insights (else it falls back, without a 404)
    };
    const sig = crypto.createHash('sha1').update(JSON.stringify([data.hero.map(x => x.id + x.sub), data.waiting, data.feed.map(x => x.id), data.notes.map(x => x.id + x.at), data.suggestions.map(x => x.id), data.status, data.projects.map(p => p.here + p.name + p.color), data.people.map(p => p.id + p.online), data.fleet.agents.map(a => a.id + a.online + a.doing + a.context + a.tokens), data.fleet.models.online + data.fleet.models.model, data.fleet.loops.map(l => l.id + l.state + l.last), data.ideas.map(i => i.id)])).digest('base64url').slice(0, 12);
    return { ...data, rev: sig, at: new Date().toISOString() };
  }
  async function viewFor(me, { fresh = false } = {}) {
    const v = views.get(me.id) || {};
    if (!fresh && v.data && !v.dirty && Date.now() - v.at < STALE_MS) return v.data;
    const data = await compute(me);
    Object.assign(v, { at: Date.now(), data, sig: data.rev, dirty: false, last: Date.now() }); views.set(me.id, v);   // in place: a pending timer keeps its handle
    return data;
  }

  // ---------- events -> dirty -> throttled recompute -> push { type: 'dashboard', rev } ----------
  function schedule(mid) {
    const v = views.get(mid) || {}; v.dirty = true; views.set(mid, v);
    if (!isOnline(mid) || v.timer) return;
    const wait = Math.max(DEBOUNCE, THROTTLE - (Date.now() - (v.last || 0)));
    v.timer = setTimeout(async () => {
      v.timer = null;
      const m = member(mid); if (!m || !isOnline(mid)) return;
      const prev = v.sig;
      try {
        const data = await compute(m);
        Object.assign(v, { at: Date.now(), data, sig: data.rev, dirty: false, last: Date.now() });
        if (data.rev !== prev) sendTo(mid, { type: 'hub', rev: data.rev });
      } catch (e) { console.error('hub:', e.message); }
    }, wait);
    if (v.timer.unref) v.timer.unref();
  }
  function onEvent(type, pid) {
    if (!WATCH.has(type)) return;
    if (pid && type !== 'presence') dirtyProjects.add(pid);
    if (type === 'projects') snaps.clear();
    for (const m of getMembers()) if (m.role !== 'agent' && isOnline(m.id) && (!pid || P.canSee(m, pid))) schedule(m.id);
  }
  function onNotify(n) {
    const to = n.to === 'all' || !n.to ? getMembers().map(m => m.id) : [].concat(n.to);
    for (const mid of to) { const m = member(mid); if (m && m.role !== 'agent') schedule(mid); }
  }
  function seenProject(mid, pid) {
    if (!mid || !pid) return;
    db.seen[mid] = { ...(db.seen[mid] || {}), [pid]: new Date().toISOString() }; save();
  }

  // ---------- quick note ----------
  function fileNote(me, body) {
    if (!human(me)) throw err(403, 'only people file notes');
    const text = str(body.text, 20000); if (!text) throw err(400, 'write something first');
    const pid = body.project ? String(body.project) : (me.project || P.defaultId());
    if (!P.canSee(me, pid)) throw err(403, 'you are not in that project');
    const first = plain(text.split('\n')[0]).replace(/^#+\s*/, '');
    const title = clip(first, 60) || `Note ${new Date().toISOString().slice(0, 10)}`;
    const now = new Date().toISOString();
    const doc = P.inProject(pid, () => {
      const exists = docs.find(title);
      const name = exists ? `${title} · ${now.slice(0, 16).replace('T', ' ')}` : title;
      const r = docs.upsert({ name, body: text, by: me.id });
      if (r.doc && !r.doc.source) { try { docs.save({ ...docs.read(r.doc.slug), source: 'dashboard' }); } catch {} }
      return r.doc;
    });
    if (!doc) throw err(409, 'could not file that note');
    dirtyProjects.add(pid); schedule(me.id);
    return { project: pid, doc: { slug: doc.slug, title: doc.title } };
  }

  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    if (me.role === 'agent') return fail(res, 403, 'the hub is for people');
    try {
      if (!b && m === 'GET') return send(res, 200, await viewFor(me));
      if (b === 'dismiss' && m === 'POST') {
        const body = await readBody(req, 4096); const id = str(body.id, 200);
        if (!id) return fail(res, 400, 'id required');
        const d = db.dismissed[me.id] = db.dismissed[me.id] || {};
        d[id] = new Date().toISOString();
        const keys = Object.keys(d); if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete d[k];
        save(); const v = views.get(me.id); if (v) v.dirty = true;
        return send(res, 200, { ok: true, dismissed: id });
      }
      if (b === 'fleet' && m === 'GET') return send(res, 200, fleet(me));
      if (b === 'repos' && m === 'GET') return send(res, 200, { repos: await repos(me) });
      if (b === 'docs' && m === 'GET') return send(res, 200, { docs: allDocs(me, str(url.searchParams.get('q') || '', 200)) });
      if (b === 'prefs' && m === 'GET') return send(res, 200, prefsOf(me));
      if (b === 'prefs' && (m === 'PUT' || m === 'PATCH')) {
        const body = await readBody(req, 8192), pr = db.prefs[me.id] = db.prefs[me.id] || {};
        if (Array.isArray(body.pins)) pr.pins = [...new Set(body.pins.map(x => String(x).slice(0, 60)))].filter(pid => P.canSee(me, pid)).slice(0, 24);
        save(); const v = views.get(me.id); if (v) v.dirty = true;
        return send(res, 200, prefsOf(me));
      }
      if (b === 'ask' && m === 'POST') return send(res, 200, await ask(me, await readBody(req, 16 * 1024)));
      if (b === 'note' && m === 'POST') return send(res, 200, fileNote(me, await readBody(req, 64 * 1024)));
      if (b === 'seen' && m === 'POST') { const body = await readBody(req, 4096); const pid = str(body.project, 60); if (!P.canSee(me, pid)) return fail(res, 403, 'you are not in that project'); seenProject(me.id, pid); return send(res, 200, { ok: true }); }
    } catch (e) { return fail(res, e.status || 500, e.status ? e.message : 'hub error'); }
    return null;
  }

  return { route, onEvent, onNotify, seen: seenProject, viewFor, fleet, repos, allDocs, touch: mid => schedule(mid), setFlow: f => { flow = f; }, useNotes: fn => { notesHook = typeof fn === 'function' ? fn : null; }, useScratch: fn => { scratchOf = typeof fn === 'function' ? fn : null; }, ask };
};
