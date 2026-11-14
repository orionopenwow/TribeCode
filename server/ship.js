// Ship it: review what changed before it goes to GitHub, decide together, or let Turbo send it at a calm moment.
//
//   Ready to ship   what changed since the last push: saved changes, files, who (people and AI helpers), linked tasks,
//                   branches still waiting to merge, and anything that blocks a push (GitHub is ahead, no GitHub yet).
//   Decide          a project setting: host (the host or an admin decides, default), majority (more than half of the
//                   people), everyone (all people). Agents can ask to ship but never vote. Each voter also gets a
//                   one-tap approval on their phone (server/approvals.js); deciding there counts as their vote.
//   Ship            pushes exactly the reviewed saved change (`git push origin <sha>:<branch>`), never forced. Branches
//                   still merge through the integrator (server/integrator.js); Ship it covers what is already on main.
//   Turbo           optional: approved work on main goes out on its own, batched into one push, only when it is calm
//                   (no unsaved edits, no fresh saved changes for a while, no claims touched since the last save), never
//                   during a vote, after the checks pass when the project has them, and at most N pushes an hour.
//   Share           a plain-text progress summary (done / in progress / to do, latest saved changes, what's next, the
//                   GitHub link) for chat or a text message; the app adds an invite link.
//   Pulse           one line per AI helper or person: who is working on what, who is waiting on whom.
//   Split           POST /api/tasks/:id/split: a task becomes 2–5 smaller ones (the local model when it is on, else rules).
//
// HTTP (current project): GET /api/ship · POST /api/ship/request {note} · POST /api/ship/:id/vote {vote, comment}
//   POST /api/ship/:id/comment {text} · POST /api/ship/:id/cancel · PUT /api/ship/settings {mode, turbo}
//   POST /api/ship/turbo/run (host; runs one Turbo check now) · GET /api/ship/share · GET /api/ship/pulse
// State: ship.json in the project's tribe folder. Timers for tests: TRIBE_TURBO_TICK_MS, TRIBE_TURBO_QUIET_MS.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const gitutil = require('./gitutil');

const MODES = ['host', 'majority', 'everyone'];
const TICK_MS = Number(process.env.TRIBE_TURBO_TICK_MS) || 60_000;
const QUIET_MS = Number(process.env.TRIBE_TURBO_QUIET_MS) || 0;   // overrides the per-project quiet minutes (tests)
const DEFAULTS = () => ({ mode: 'host', turbo: { on: false, quietMin: 10, maxPerHour: 4 }, current: null, history: [], log: [], lastShip: null });

module.exports = function ship({ P, store, hubFor, approvals, getMembers, loadTasks, createTask, postChat, broadcast, bus, str, nameOf, can, pushAuth, coord, claims, id, brain }) {
  const fail = (status, msg) => Object.assign(new Error(msg), { status });
  const load = () => { const s = { ...DEFAULTS(), ...(store.readJSON('ship.json', {}) || {}) }; s.turbo = { ...DEFAULTS().turbo, ...(s.turbo || {}) }; return s; };
  const save = s => { s.history = (s.history || []).slice(-30); s.log = (s.log || []).slice(0, 60); store.writeJSON('ship.json', s); };
  const pid = () => P.current() || P.defaultId();
  const push = () => broadcast({ type: 'ship', project: pid() });
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const isAgent = m => !!m && m.role === 'agent';
  const people = () => getMembers().filter(m => m.role !== 'agent' && m.role !== 'spectator' && P.canSee(m, pid()));
  const deciders = mode => (mode === 'host' ? people().filter(m => can(m, 'repo.merge')) : people());
  const plural = (n, a, b = a + 's') => `${n} ${n === 1 ? a : b}`;
  const repoOf = () => { const p = P.get(pid()); return p && p.repo && fs.existsSync(path.join(p.repo, '.git')) ? p.repo : null; };
  const MODE_TEXT = { host: 'The host decides', majority: 'More than half of the people decide', everyone: 'Everyone has to say yes' };

  // ---------- what changed since the last push ----------
  async function overview() {
    const s = load(), repo = repoOf();
    const base = { mode: s.mode, modeText: MODE_TEXT[s.mode], turbo: s.turbo, log: s.log.slice(0, 12), lastShip: s.lastShip, request: view(s.current) };
    if (!repo) return { ...base, enabled: false, canShip: false, blocker: 'No code repository yet. Create one from the dashboard’s Getting started steps.' };
    const G = gitutil(repo);
    const branch = (await G.gitTry(['rev-parse', '--abbrev-ref', 'HEAD'])).out || '';
    const headSha = (await G.gitTry(['rev-parse', 'HEAD'])).out || '';
    if (!headSha) return { ...base, enabled: true, branch, canShip: false, blocker: 'No saved changes yet.', commits: [], files: [], people: [], tasks: [], waiting: [] };
    let upstream = null;
    const u = await G.gitTry(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    if (u.code === 0 && u.out) upstream = u.out;
    else if ((await G.gitTry(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`])).code === 0) upstream = `origin/${branch}`;
    const remoteUrl = String((await G.gitTry(['remote', 'get-url', 'origin'])).out || '').replace(/\/\/[^/@]+@/, '//');
    const gh = remoteUrl.match(/github\.com[:/]+([^/]+\/[^/.]+?)(?:\.git)?\/?$/);
    let from = upstream;
    if (!from && s.lastShip && s.lastShip.sha && (await G.gitTry(['merge-base', '--is-ancestor', s.lastShip.sha, 'HEAD'])).code === 0) from = s.lastShip.sha;
    const range = from ? [`${from}..HEAD`] : ['-n', '30', 'HEAD'];
    const commits = (await G.gitTry(['log', '-n', '50', '--format=%H%x1f%h%x1f%an%x1f%s%x1f%cI', ...range])).out.split('\n').filter(Boolean)
      .map(l => { const [sha, short, author, subject, at] = l.split('\x1f'); return { sha, short, author, subject, at }; });
    const files = [...new Set((await G.gitTry(['log', '--name-only', '--format=', ...range])).out.split('\n').map(x => x.trim()).filter(Boolean))];
    const stat = from ? (await G.gitTry(['diff', '--shortstat', from, 'HEAD'])).out : '';
    const behind = upstream ? Number((await G.gitTry(['rev-list', '--count', `HEAD..${upstream}`])).out) || 0 : 0;
    const dirty = (await G.gitTry(['--no-optional-locks', 'status', '--porcelain=v1'])).out.split('\n').filter(l => l && !l.startsWith('??') && !/TRIBE_CONTEXT\.md$/.test(l)).length;
    const hasRemote = await G.hasRemote();
    // who: people and AI helpers, matched by the saved change's author name
    const byName = new Map(getMembers().map(m => [String(m.name || '').toLowerCase(), m]));
    const who = new Map();
    for (const c of commits) {
      const m = byName.get(String(c.author).toLowerCase());
      c.kind = isAgent(m) ? 'agent' : 'person'; c.owner = m && isAgent(m) ? nameOf(m.owner) : null;
      const k = c.author; const w = who.get(k) || { name: k, kind: c.kind, owner: c.owner, count: 0 }; w.count++; who.set(k, w);
    }
    // linked tasks: finished or in review since the base, plus any task named in a saved change
    const since = from ? Date.parse((await G.gitTry(['log', '-1', '--format=%cI', from])).out) || 0 : 0;
    const subj = commits.map(c => c.subject.toLowerCase()).join('\n');
    const tasks = loadTasks().filter(t => (['done', 'review'].includes(t.status) && Date.parse(t.updated || t.created || 0) >= since) || (t.id && subj.includes(String(t.id).toLowerCase())))
      .slice(-12).reverse().map(t => { const a = member(t.assignee); return { id: t.id, title: t.title, status: t.status, who: a ? a.name : null, agent: isAgent(a) }; });
    let waiting = [];
    try { const st = hubFor(pid()).status() || {}; waiting = (st.branches || []).filter(b => b.ahead && b.branch !== branch).slice(0, 8).map(b => ({ branch: b.branch, author: b.author, ahead: b.ahead })); } catch {}
    let blocker = '';
    if (!commits.length) blocker = s.lastShip ? 'Everything is on GitHub. Nothing new to ship.' : 'Nothing new to ship yet.';
    else if (!hasRemote) blocker = 'No GitHub yet. Connect GitHub from the dashboard to put the code online.';
    else if (behind) blocker = `GitHub has ${plural(behind, 'newer saved change')}. Bring them in first (Refresh, or turn on Autopilot), then ship.`;
    return { ...base, enabled: true, branch, upstream, headSha, behind, dirty, hasRemote,
      remote: remoteUrl ? { url: remoteUrl, github: gh ? gh[1] : null, link: gh ? `https://github.com/${gh[1]}` : null } : null,
      commits: commits.slice(0, 20), count: commits.length, files: files.slice(0, 40), fileCount: files.length, stat, people: [...who.values()], tasks, waiting,
      canShip: !blocker, blocker };
  }

  // ---------- votes ----------
  function tally(rq) {
    const voters = deciders(rq.mode).map(m => m.id);
    const yes = voters.filter(v => rq.votes[v] && rq.votes[v].v === 'yes').length, no = voters.filter(v => rq.votes[v] && rq.votes[v].v === 'no').length;
    const n = voters.length || 1, needed = rq.mode === 'host' ? 1 : rq.mode === 'majority' ? Math.floor(n / 2) + 1 : n;
    return { voters: voters.length, yes, no, needed, waitingOn: voters.filter(v => !rq.votes[v]).map(nameOf) };
  }
  function view(rq) {
    if (!rq) return null;
    return { ...rq, byName: nameOf(rq.by), tally: tally(rq), modeText: MODE_TEXT[rq.mode],
      votes: Object.entries(rq.votes || {}).map(([mid, x]) => ({ id: mid, name: nameOf(mid), ...x })), comments: (rq.comments || []).map(c => ({ ...c, byName: nameOf(c.by) })), approvals: undefined };
  }
  async function request(note, me) {
    if (!me || me.role === 'spectator') throw fail(403, 'spectators can watch but not ship');
    const s = load();
    if (s.current && ['pending', 'shipping'].includes(s.current.status)) throw fail(409, 'A ship request is already waiting. Vote on it, or cancel it first.');
    const ov = await overview();
    if (!ov.canShip) throw fail(400, ov.blocker);
    const rq = { id: 'sh-' + Date.now().toString(36).slice(-5) + id(3).toLowerCase(), project: pid(), by: me.id, at: new Date().toISOString(), note: str(note, 600),
      head: ov.headSha, short: ov.headSha.slice(0, 7), branch: ov.branch, upstream: ov.upstream, count: ov.count, fileCount: ov.fileCount, mode: s.mode,
      status: 'pending', votes: {}, comments: note ? [{ by: me.id, at: new Date().toISOString(), text: str(note, 600) }] : [], approvals: {} };
    const voters = deciders(rq.mode);
    if (!isAgent(me) && voters.some(v => v.id === me.id)) rq.votes[me.id] = { v: 'yes', at: rq.at, comment: '' };   // asking counts as your yes
    s.current = rq; save(s);
    const title = `Ship ${plural(rq.count, 'saved change')} to GitHub?`;
    const details = `${me.name} asked. ${MODE_TEXT[rq.mode]}.${rq.note ? ` Note: ${rq.note}` : ''}\n${ov.commits.slice(0, 6).map(c => `• ${c.subject} (${c.author})`).join('\n')}`;
    for (const v of voters) {
      if (v.id === me.id || rq.votes[v.id]) continue;
      try { const ap = approvals.create({ title, details, risk: 'high', kind: 'ship', to: [v.id] }, me); rq.approvals[v.id] = ap.id; } catch {}
    }
    save(s);
    postChat('general', 'tribecode', `🚀 ${me.name} wants to ship ${plural(rq.count, 'saved change')} to GitHub (${rq.short}). ${MODE_TEXT[rq.mode]}: open the code repository to look and vote.`);
    await evaluate(s);
    push();
    return view(load().current);
  }
  async function vote(rid, v, comment, me) {
    if (isAgent(me)) throw fail(403, 'AI helpers can ask to ship, but only people vote.');
    if (!me || me.role === 'spectator') throw fail(403, 'spectators can watch but not vote');
    const s = load(), rq = s.current;
    if (!rq || rq.id !== rid) throw fail(404, 'That ship request is gone.');
    if (rq.status !== 'pending') throw fail(409, `This ship request is already ${rq.status}.`);
    if (!['yes', 'no'].includes(v)) throw fail(400, 'vote yes or no');
    if (!deciders(rq.mode).some(m => m.id === me.id)) throw fail(403, rq.mode === 'host' ? 'In this project the host decides. You can leave a comment.' : 'You are not a voter in this project.');
    rq.votes[me.id] = { v, at: new Date().toISOString(), comment: str(comment, 500) };
    if (comment) rq.comments.push({ by: me.id, at: new Date().toISOString(), text: str(comment, 500) });
    const apId = rq.approvals && rq.approvals[me.id];
    save(s);
    if (apId) { try { const ap = approvals.get(apId); if (ap && ap.status === 'pending') approvals.decide(apId, v === 'yes' ? 'approve' : 'deny', me, comment || (v === 'yes' ? 'Voted yes to ship' : 'Voted no')); } catch {} }
    await evaluate(load());
    push();
    return view(load().current);
  }
  // a one-tap approval from a phone (or the inbox) counts as that person's vote
  function onApproval(a) {
    if (!a || a.kind !== 'ship' || a.status === 'pending') return;
    P.inProject(a.project || pid(), async () => {
      const s = load(), rq = s.current; if (!rq || rq.status !== 'pending') return;
      const voter = Object.keys(rq.approvals || {}).find(k => rq.approvals[k] === a.id); if (!voter) return;
      const who = a.decidedBy && deciders(rq.mode).some(m => m.id === a.decidedBy) ? a.decidedBy : voter;
      if (rq.votes[who]) return;
      rq.votes[who] = { v: a.status === 'approved' ? 'yes' : 'no', at: a.decidedAt || new Date().toISOString(), comment: a.note || '', from: 'phone' };
      save(s); await evaluate(load()); push();
    });
  }
  // once a ship request is decided, the other voters' phone prompts close
  function closeAsks(rq, why) { for (const aid of Object.values(rq.approvals || {})) { try { approvals.close && approvals.close(aid, why); } catch {} } }
  async function evaluate(s) {
    const rq = s.current; if (!rq || rq.status !== 'pending') return;
    const t = tally(rq);
    const approved = t.yes >= t.needed, denied = rq.mode === 'host' ? t.no >= 1 && !approved : rq.mode === 'majority' ? t.no > t.voters - t.needed : t.no >= 1;
    if (denied) {
      rq.status = 'denied'; rq.decidedAt = new Date().toISOString(); s.history.push(rq); save(s); closeAsks(rq, 'Decided: not shipping');
      const nos = Object.entries(rq.votes).filter(([, x]) => x.v === 'no').map(([mid, x]) => `${nameOf(mid)}${x.comment ? ` ("${x.comment}")` : ''}`);
      postChat('general', 'tribecode', `⛔ Not shipping ${rq.short} yet: ${nos.join(', ')} said no.`);
      return;
    }
    if (!approved) return;
    rq.status = 'shipping'; save(s); push(); closeAsks(rq, 'Decided: shipping');
    const r = await doShip(rq.head, { kind: 'ship', label: `${MODE_TEXT[rq.mode].toLowerCase()} said yes` });
    const s2 = load(); const cur = s2.current && s2.current.id === rq.id ? s2.current : rq;
    cur.status = r.ok ? 'shipped' : 'failed'; cur.result = r; cur.decidedAt = new Date().toISOString(); s2.history.push(cur); s2.current = cur; save(s2);
  }
  function cancel(rid, me) {
    const s = load(), rq = s.current;
    if (!rq || rq.id !== rid || rq.status !== 'pending') throw fail(404, 'No waiting ship request with that id.');
    if (rq.by !== me.id && !can(me, 'repo.merge')) throw fail(403, 'Only the person who asked, the host or an admin can cancel it.');
    rq.status = 'cancelled'; rq.decidedAt = new Date().toISOString(); s.history.push(rq); save(s); push(); closeAsks(rq, 'Cancelled');
    return view(rq);
  }
  function comment(rid, text, me) {
    if (!me || me.role === 'spectator') throw fail(403, 'spectators are read-only');
    const s = load(), rq = s.current; if (!rq || rq.id !== rid) throw fail(404, 'That ship request is gone.');
    text = str(text, 500); if (!text) throw fail(400, 'write a comment');
    rq.comments.push({ by: me.id, at: new Date().toISOString(), text }); save(s); push();
    return view(rq);
  }

  // ---------- the push itself (never forced) ----------
  async function doShip(sha, { kind, label }) {
    const repo = repoOf(); if (!repo) return { ok: false, error: 'no code repository' };
    const G = gitutil(repo);
    const r = await G.locked(async () => {
      const branch = (await G.gitTry(['rev-parse', '--abbrev-ref', 'HEAD'])).out;
      const u = await G.gitTry(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
      const target = u.code === 0 && u.out ? u.out.replace(/^origin\//, '') : branch;
      const count = Number((await G.gitTry(['rev-list', '--count', ...(u.code === 0 && u.out ? [`${u.out}..${sha}`] : [sha])])).out) || 0;
      let pa = { args: [], env: {} }; try { pa = pushAuth() || pa; } catch {}
      const p = await G.gitTry([...(pa.args || []), 'push', '--quiet', 'origin', `${sha}:refs/heads/${target}`], repo, { timeout: 120_000, env: pa.env });
      if (p.code !== 0) return { ok: false, error: (p.err || p.out || 'push failed').split('\n')[0] };
      await G.gitTry(['fetch', '--quiet', 'origin', target], repo, { timeout: 60_000 });
      return { ok: true, sha: sha.slice(0, 7), target, count };
    }).catch(e => ({ ok: false, error: e.message }));
    const s = load();
    if (r.ok) {
      s.lastShip = { sha, at: new Date().toISOString(), kind, count: r.count };
      s.log.unshift({ at: s.lastShip.at, kind, text: `${kind === 'turbo' ? '⚡ Turbo shipped' : '🚀 Shipped'} ${plural(r.count, 'saved change')} to GitHub (${r.sha})`, sha: r.sha, count: r.count });
      save(s);
      postChat('general', 'tribecode', `${kind === 'turbo' ? '⚡ Turbo shipped' : '🚀 Shipped'} ${plural(r.count, 'saved change')} to GitHub (${r.sha}${label ? `, ${label}` : ''}).`);
      bus.notify({ type: 'repo', priority: 'low', title: `${plural(r.count, 'saved change')} on GitHub now`, body: label || '', view: 'repo' });
    } else {
      s.log.unshift({ at: new Date().toISOString(), kind: `${kind}-failed`, text: `Could not ship: ${r.error}` }); save(s);
      postChat('general', 'tribecode', `⚠️ Could not ship to GitHub: ${r.error}. Nothing was forced.`, { card: 'failed' });
    }
    try { hubFor(pid()).poll({ force: true }).catch(() => {}); } catch {}
    push();
    return r;
  }

  // ---------- Turbo: ship on its own at a calm moment ----------
  async function turboCheck({ force = false } = {}) {
    const s = load();
    if (!s.turbo.on && !force) return { shipped: false, reason: 'Turbo is off.' };
    const note = reason => { const s2 = load(); if (s2.turbo.state !== reason) { s2.turbo.state = reason; s2.turbo.stateAt = new Date().toISOString(); save(s2); push(); } return { shipped: false, reason }; };
    if (s.current && ['pending', 'shipping'].includes(s.current.status)) return note('Waiting: a ship vote is open.');
    const ov = await overview();
    if (!ov.canShip) return note(ov.blocker);
    if (ov.dirty) return note('Waiting: someone has unsaved edits.');
    const quiet = QUIET_MS || Math.max(1, Number(s.turbo.quietMin) || 10) * 60_000;
    const last = Date.parse(ov.commits[0].at) || 0;
    if (Date.now() - last < quiet) return note(`Waiting for a quiet moment (no new saved changes for ${Math.round(quiet / 60_000) || 1} min).`);
    const busy = (claims.list() || []).filter(c => (!c.project || c.project === pid()) && Date.parse(c.at) > last && ov.files.some(f => f === c.path || (c.path.endsWith('/') && f.startsWith(c.path))));
    if (busy.length) return note(`Waiting: ${busy[0].name} is still working on ${busy[0].path}.`);
    const hour = s.log.filter(x => x.kind === 'turbo' && Date.now() - Date.parse(x.at) < 3600_000).length;
    if (hour >= (Number(s.turbo.maxPerHour) || 4)) return note(`Waiting: already shipped ${plural(hour, 'time')} this hour.`);
    try {
      const ch = await hubFor(pid()).integrator.runChecks(ov.branch);
      if (!ch.skipped && !ch.ok) return note(`Held: the checks failed on ${ov.headSha.slice(0, 7)}. Fix them and Turbo tries again.`);
    } catch (e) { return note(`Held: could not run the checks (${e.message}).`); }
    const r = await doShip(ov.headSha, { kind: 'turbo', label: 'a quiet moment, checks passed' });
    note(r.ok ? 'Shipped. Watching for the next calm moment.' : `Held: ${r.error}`);
    return { shipped: r.ok, reason: r.ok ? 'shipped' : r.error, result: r };
  }
  let ticking = false;
  async function tick() {
    if (ticking) return; ticking = true;
    try { for (const p of P.all()) { if (!p.repo) continue; await P.inProject(p.id, () => (load().turbo.on ? turboCheck() : null)).catch(() => {}); } }
    finally { ticking = false; }
  }
  const timer = setInterval(() => { tick(); }, TICK_MS); if (timer.unref) timer.unref();

  function settings(body, me) {
    if (!me || isAgent(me) || !can(me, 'settings.edit')) throw fail(403, 'Only the host or an admin changes how shipping works.');
    const s = load(), b = body || {};
    if (MODES.includes(b.mode)) s.mode = b.mode;
    if (b.turbo && typeof b.turbo === 'object') {
      if (typeof b.turbo.on === 'boolean') { s.turbo.on = b.turbo.on; s.turbo.state = b.turbo.on ? 'Watching for a calm moment.' : ''; }
      if (Number.isFinite(Number(b.turbo.quietMin)) && b.turbo.quietMin !== undefined) s.turbo.quietMin = Math.min(Math.max(Number(b.turbo.quietMin), 1), 240);
      if (Number.isFinite(Number(b.turbo.maxPerHour)) && b.turbo.maxPerHour !== undefined) s.turbo.maxPerHour = Math.min(Math.max(Number(b.turbo.maxPerHour), 1), 12);
    }
    save(s); push();
    if (b.turbo && typeof b.turbo.on === 'boolean') postChat('general', 'tribecode', b.turbo.on ? `⚡ ${me.name} turned on Turbo: approved work on main goes to GitHub on its own at calm moments.` : `${me.name} turned off Turbo.`);
    return { mode: s.mode, modeText: MODE_TEXT[s.mode], turbo: s.turbo };
  }

  // ---------- share + pulse ----------
  async function share() {
    const p = P.get(pid()) || {}, t = loadTasks();
    const done = t.filter(x => x.status === 'done').length, doing = t.filter(x => x.status === 'doing' || x.status === 'review').length, todo = t.filter(x => x.status === 'backlog' || x.status === 'todo').length;
    let ov = null; try { ov = await overview(); } catch {}
    let latest = [];
    const repo = repoOf();
    if (repo) latest = (await gitutil(repo).gitTry(['log', '-n', '3', '--format=%s%x1f%an'])).out.split('\n').filter(Boolean).map(l => { const [s, a] = l.split('\x1f'); return `• ${s} (${a})`; });
    const next = t.filter(x => x.status !== 'done').slice(0, 3).map(x => `• ${x.title}`);
    const link = ov && ov.remote && (ov.remote.link || ov.remote.url) || null;
    const text = [`${p.emoji || '🔥'} ${p.name || 'Our project'} on TribeCode`, `✅ ${done} done · 🛠️ ${doing} in progress · 📋 ${todo} to do`,
      ...(latest.length ? ['', 'Latest saved changes:', ...latest] : []), ...(next.length ? ['', 'Up next:', ...next] : []), ...(link ? ['', `Code: ${link}`] : [])].join('\n');
    return { text, repoUrl: link, counts: { done, doing, todo } };
  }
  function pulse() {
    const t = loadTasks(), lines = [];
    for (const x of t.filter(y => y.status === 'doing' && y.assignee)) { const m = member(x.assignee); if (m) lines.push({ kind: isAgent(m) ? 'agent' : 'person', text: `${isAgent(m) ? '🤖' : '🧑'} ${m.name} is working on “${x.title}”` }); }
    let work = { handoffs: [], reviews: [] }; try { work = coord.openWork(); } catch {}
    for (const h of work.handoffs) lines.push({ kind: 'wait', text: `⏳ ${nameOf(h.from)} is waiting on ${h.to ? nameOf(h.to) : 'anyone'} to take “${h.title}”` });
    for (const r of work.reviews) lines.push({ kind: 'wait', text: `👀 ${nameOf(r.by)} is waiting for a review of ${r.branch || r.title}` });
    for (const x of t.filter(y => y.status === 'review' && !work.reviews.some(r => r.task === y.id))) lines.push({ kind: 'wait', text: `👀 “${x.title}” is waiting for a review${x.assignee ? ` (${nameOf(x.assignee)})` : ''}` });
    const rq = load().current;
    if (rq && rq.status === 'pending') { const tl = tally(rq); lines.push({ kind: 'ship', text: `🚀 ${plural(rq.count, 'saved change')} waiting to ship: ${tl.yes} of ${tl.needed} yes${tl.waitingOn.length ? `, waiting on ${tl.waitingOn.slice(0, 3).join(', ')}` : ''}` }); }
    return { lines: lines.slice(0, 12) };
  }

  // ---------- split a task into smaller ones ----------
  function ruleSplit(title) {
    const t = String(title).replace(/^\[[^\]]*\]\s*/, '').trim();
    const parts = t.split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b|\+)\s*/i).map(x => x.trim()).filter(x => x.length > 2);
    if (parts.length >= 2) { const verb = (t.match(/^(add|make|build|write|create|fix|design|draw|set up|show)\b/i) || [])[0]; return parts.slice(0, 5).map((x, i) => (i && verb && !/^(add|make|build|write|create|fix|design|draw|set up|show)\b/i.test(x) ? `${verb[0].toUpperCase() + verb.slice(1)} ${x}` : x[0].toUpperCase() + x.slice(1))); }
    return [`Sketch how “${t}” should work`, `Build a first small version of “${t}”`, `Try “${t}” and fix what feels off`];
  }
  async function split(taskId, me) {
    if (!me || me.role === 'spectator') throw fail(403, 'spectators are read-only');
    const t = loadTasks().find(x => x.id === taskId); if (!t) throw fail(404, 'task not found');
    let parts = null, by = 'rules';
    try {
      if (brain && brain.status && brain.status().online) {
        const out = await brain.generate(`Split this task into 2 to 5 smaller tasks a friend could each finish in under an hour. Task: "${t.title}"${t.body ? `\nDetails: ${String(t.body).slice(0, 600)}` : ''}\nReply with a JSON array of short titles only.`,
          { system: 'You break tasks into small, concrete steps for friends building software. JSON only.', maxTokens: 160, timeoutMs: 20000 });
        const j = JSON.parse((String(out || '').match(/\[[\s\S]*\]/) || ['[]'])[0]);
        const ok = (Array.isArray(j) ? j : []).map(x => str(x, 120)).filter(Boolean).slice(0, 5);
        if (ok.length >= 2) { parts = ok; by = 'model'; }
      }
    } catch {}
    if (!parts) parts = ruleSplit(t.title);
    const made = parts.map(title => createTask({ title, by: me.id, body: `Part of: ${t.title} (${t.id})`, source: 'split' }));
    postChat('general', 'tribecode', `✂️ ${me.name} split “${t.title}” into ${plural(made.length, 'smaller task')}.`);
    return { tasks: made.map(x => ({ id: x.id, title: x.title })), by };
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, a, b, c, me, readBody, send, fail: f }) {
    if (!me) return f(res, 401, 'not a member of this tribe');
    try {
      if (a === 'tasks' && b && c === 'split' && m === 'POST') return send(res, 200, await split(b, me));
      if (a !== 'ship') return null;
      if (m === 'GET' && !b) return send(res, 200, await overview());
      if (m === 'GET' && b === 'share') return send(res, 200, await share());
      if (m === 'GET' && b === 'pulse') return send(res, 200, pulse());
      if (b === 'settings' && (m === 'PUT' || m === 'PATCH')) return send(res, 200, settings(await readBody(req), me));
      if (m === 'POST' && b === 'request') { const body = await readBody(req); return send(res, 200, { request: await request(body.note, me) }); }
      if (m === 'POST' && b === 'turbo' && c === 'run') {
        if (!can(me, 'settings.edit') || isAgent(me)) return f(res, 403, 'only the host or an admin runs Turbo by hand');
        return send(res, 200, await turboCheck({ force: true }));
      }
      if (m === 'POST' && b && c === 'vote') { const body = await readBody(req); return send(res, 200, { request: await vote(b, body.vote, body.comment, me) }); }
      if (m === 'POST' && b && c === 'comment') { const body = await readBody(req); return send(res, 200, { request: comment(b, body.text, me) }); }
      if (m === 'POST' && b && c === 'cancel') return send(res, 200, { request: cancel(b, me) });
    } catch (e) { return f(res, e.status || 500, e.message); }
    return null;
  }

  // ---------- MCP: a Claude can ask, look and request, never approve ----------
  function mcpTools({ text, err, S, str: s }) {
    return {
      ship_status: {
        description: 'Is it OK to ship? What changed since the last push to GitHub (saved changes, files, who), what blocks a push, the open ship request with its votes, and whether Turbo is on.',
        inputSchema: S({}),
        run: async () => { const o = await overview(); return text({ canShip: o.canShip, blocker: o.blocker || null, savedChanges: o.count || 0, files: o.fileCount || 0, people: o.people, decide: o.modeText, turbo: o.turbo && o.turbo.on ? `on · ${o.turbo.state || 'watching'}` : 'off', request: o.request ? { id: o.request.id, status: o.request.status, yes: o.request.tally.yes, needed: o.request.tally.needed, waitingOn: o.request.tally.waitingOn } : null, lastShip: o.lastShip }); },
      },
      request_ship: {
        description: 'Ask the people to ship what is on main to GitHub. They review the changes and vote (or the host decides). You can ask but never approve; check ship_status for the result.',
        inputSchema: S({ note: s('One line: what is in it and why it is ready (tests run, tasks done)') }),
        run: async ({ note }, me) => { try { const r = await request(note, me); return text({ id: r.id, status: r.status, decide: r.modeText, waitingOn: r.tally.waitingOn, next: 'Wait for the people to vote. Do not push yourself.' }); } catch (e) { return err(e.message); } },
      },
    };
  }

  return { route, overview, request, vote, onApproval, cancel, comment, settings, turboCheck, tick, share, pulse, split, mcpTools };
};
