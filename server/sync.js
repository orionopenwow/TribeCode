// GitHub as an optional synced copy of any home (feat/folder-sync). The project's home (a folder on this computer,
// the tribe's own workspace, a cloud tribe) is its living repo; GitHub is where it ships to.
//
//   Manual (default)  a Ship button: what changed, a message, a target. Nothing leaves this computer until it is pressed.
//   Auto-ship         ships by itself on a trigger: on approve (Work/approvals), on task Done, every N minutes when
//                     there are changes, or on every save. "Require approval" turns an auto-ship into an approval first.
//   Settings          repo + branch · push to the branch or a pull request per ship (title template) · commit message
//                     (auto-summary, Flint-written, my own) · extra excludes (.gitignore is respected, .tribe/ never
//                     ships) · pull before ship with conflicts: stop and show (default), prefer mine, prefer theirs ·
//                     auto-pull every N minutes · tag releases on milestones · sign as each member or as the tribe bot ·
//                     pause · a ship log with Undo last ship (a revert commit, pushed) where possible.
//
// Git runs with execFile and argument arrays only. The token reaches git through a credential helper reading it from
// that one process's environment (workspace.js pushEnv): never on a command line, in a URL, a log or a response.
//
// HTTP (project :id):
//   GET    /api/projects/:id/sync            { settings, status, log, can }
//   PUT    /api/projects/:id/sync            connect / change settings (host or project lead)
//   DELETE /api/projects/:id/sync            disconnect (lead)
//   GET    /api/projects/:id/sync/changes    what would ship
//   POST   /api/projects/:id/sync/ship       { message, target }  anyone with write access (manual) — "Ship"
//   POST   /api/projects/:id/sync/pull       anyone with write access
//   POST   /api/projects/:id/sync/resolve    { use: 'mine'|'theirs'|'dismiss' } (lead)
//   POST   /api/projects/:id/sync/undo       revert the last ship (lead)
// MCP: ship_status (adds the sync), ship_now.
// Test hooks: TRIBE_GITHUB_GIT (owner/name -> <dir>/owner/name.git), TRIBE_GITHUB_API, TRIBE_SYNC_TICK_MS,
// TRIBE_SYNC_MINUTE_MS (how long "a minute" is), TRIBE_SYNC_SAVE_MS (the on-save debounce).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./gitutil');

const TICK_MS = Number(process.env.TRIBE_SYNC_TICK_MS) || 30_000;
const MINUTE = Number(process.env.TRIBE_SYNC_MINUTE_MS) || 60_000;
const SAVE_MS = Number(process.env.TRIBE_SYNC_SAVE_MS) || 4000;
const TRIGGERS = ['approve', 'done', 'interval', 'save'];
const BOT = { name: 'TribeCode bot', email: 'bot@users.noreply.tribecode' };
const RETRY_MS = Number(process.env.TRIBE_SYNC_RETRY_MS) || 2000;
const DEFAULTS = () => ({ kind: 'github', shared: '', sharedName: '', repo: '', branch: 'main', mode: 'manual', trigger: 'done', intervalMin: 15, target: 'push', prTitle: '{project}: {summary}',
  message: 'auto', ownMessage: '', exclude: [], pullFirst: true, conflict: 'stop', autoPullMin: 0, tagMilestones: false, signAs: 'member',
  requireApproval: false, paused: false });
const fail = (status, msg) => Object.assign(new Error(msg), { status });
// Anything that looks like a credential is cut out of every message that leaves this module.
const scrub = s => String(s || '').replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[token]').replace(/\/\/[^/@\s]+@/g, '//').replace(/password=\S+/gi, 'password=[token]');

module.exports = function sync({ P, W, base, getMembers, approvals, broadcast, postChat, nameOf, perms, pushAuth, brain = null, resetHub, checkShared = null, display = p => p, tribeName = () => 'tribe', log = () => {} }) {
  const file = pid => `.tribe/sync/${String(pid).replace(/[^\w-]/g, '_')}.json`;
  const load = pid => { const d = base.readJSON(file(pid), null) || {}; return { settings: { ...DEFAULTS(), ...(d.settings || {}) }, log: d.log || [], conflict: d.conflict || null, lastShip: d.lastShip || null, lastPull: d.lastPull || null, lastAuto: d.lastAuto || 0, pending: d.pending || null, remote: d.remote || null }; };
  const save = (pid, s) => { fs.mkdirSync(base.p('.tribe/sync'), { recursive: true }); s.log = (s.log || []).slice(0, 50); base.writeJSON(file(pid), s); };
  const push = pid => broadcast({ type: 'sync', project: pid });
  const member = id => getMembers().find(m => m.id === id) || null;
  const busy = new Map();   // pid -> a running ship/pull (one at a time per project)

  const lead = (me, pid) => !!me && me.role !== 'agent' && (me.role === 'host' || ((P.get(pid) || {}).members || {})[me.id] === 'host' || (perms && perms.can(me, 'settings.edit', pid)));
  const writer = (me, pid) => !!me && !['spectator', 'guest'].includes(me.role) && P.canSee(me, pid);

  const repoDir = pid => { const p = P.get(pid); return p && p.repo && fs.existsSync(p.repo) ? p.repo : null; };
  const parseRepo = v => { const m = String(v || '').trim().replace(/\.git$/, '').match(/^(?:https:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+)\/?$/); return m ? `${m[1]}/${m[2]}` : ''; };
  const remoteUrl = gh => (process.env.TRIBE_GITHUB_GIT ? path.join(process.env.TRIBE_GITHUB_GIT, gh + '.git') : `https://github.com/${gh}.git`);
  // A shared folder as the remote (Dropbox, OneDrive, Google Drive, iCloud, a NAS/SMB share, Syncthing): a bare repo
  // <shared>/<name>.tribecode.git, pushed and pulled like GitHub with no account and no network service.
  const bareOf = st => path.join(st.shared, st.sharedName);
  const remoteOf = st => (st.kind === 'folder' ? bareOf(st) : remoteUrl(st.repo));
  const slugify = v => String(v || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tribe';
  const defaultName = pid => `${slugify(tribeName())}${pid === P.defaultId() ? '' : '-' + slugify(pid)}.tribecode.git`;
  // A cloud-synced folder can be caught half-way: lock files left by a sync in flight, a missing HEAD or objects dir,
  // "conflicted copy" files. Look first; wait and look again; never write into a repo that looks mid-sync.
  function bareProblems(bare) {
    const out = [];
    try { if (!fs.statSync(bare).isDirectory()) return ['not a folder']; } catch { return ['missing']; }
    for (const need of ['HEAD', 'objects', 'refs']) if (!fs.existsSync(path.join(bare, need))) out.push(`no ${need}`);
    const walk = (d, depth) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) { const full = path.join(d, e.name);
        if (/\.lock$/.test(e.name)) out.push(`lock ${path.relative(bare, full)}`);
        else if (/conflicted copy|\(conflict|\.sync-conflict-|\.icloud$|~\$|\.tmp\.drivedownload/i.test(e.name)) out.push(`sync leftover ${path.relative(bare, full)}`);
        else if (e.isDirectory() && depth < 4 && e.name !== 'objects') walk(full, depth + 1); } };
    walk(bare, 0);
    return out.slice(0, 8);
  }
  async function healthy(st, dir) {
    if (st.kind !== 'folder') return;
    for (let i = 0; i < 3; i++) {
      let probs = bareProblems(bareOf(st));
      if (!probs.length && dir) { const r = await git(dir, ['ls-remote', '--heads', REMOTE]); if (r.code) probs = ['unreadable: ' + (r.err.split('\n')[0] || 'git could not read it')]; }
      if (!probs.length) return;
      if (i === 2) throw fail(503, `The shared folder looks like it’s still syncing (${probs.slice(0, 2).join(', ')}). Nothing was written; try again in a moment.`);
      await new Promise(r => setTimeout(r, RETRY_MS));
    }
  }
  const ident = who => ['-c', `user.name=${String(who.name).replace(/[<>\n]/g, '').slice(0, 64)}`, '-c', `user.email=${who.email}`];
  const whoFor = (s, me) => (s.settings.signAs === 'bot' || !me || me.role === 'agent' ? BOT : { name: me.name || me.id, email: W.emailOf(member(me.id) || me) });
  // the credential: the shipping member's own token when they saved one, else the host's (github-auth pushAuth)
  const auth = me => { const own = me && me.role !== 'agent' && W.hasToken(me.id) ? W.pushEnv(me.id) : null; return own && own.args.length ? own : (pushAuth ? pushAuth() : { args: [], env: {} }); };
  async function git(dir, args, { env = {}, pre = [], timeout = 120_000 } = {}) {
    const r = await run('git', [...pre, ...args], { cwd: dir, timeout, env: { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', ...env } });
    return { ...r, out: scrub(r.out), err: scrub(r.err) };
  }
  async function must(dir, args, o) { const r = await git(dir, args, o); if (r.code) throw fail(422, (r.err || r.out || `git ${args[0]} failed`).split('\n').slice(0, 3).join(' ')); return r.out; }
  const REMOTE = 'tribe-sync';
  function protect(dir) {   // .tribe/ never ships: keep it out of git without touching tracked files
    try { const f = path.join(dir, '.git', 'info', 'exclude'); fs.mkdirSync(path.dirname(f), { recursive: true }); const t = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; const add = ['/.tribe/', '/.trees/'].filter(x => !t.split('\n').includes(x)); if (add.length) fs.appendFileSync(f, (t && !t.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n'); } catch {}
  }
  const pathspec = (s, add) => ['--', '.', ...(add ? [] : [':(exclude).tribe', ':(exclude).tribe/**']), ...(s.settings.exclude || []).filter(Boolean).map(x => `:(exclude,glob)${String(x).replace(/^\/+/, '')}`)];

  // ---------- what's waiting ----------
  async function remoteRef(dir, s) { const r = await git(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/${REMOTE}/${s.settings.branch}`]); return r.code ? null : r.out; }
  async function changes(pid) {
    const dir = repoDir(pid), s = load(pid);
    if (!dir || !W.isRepo(dir)) return { files: [], ahead: 0, count: 0 };
    const st = await git(dir, ['status', '--porcelain', '--untracked-files=all', ...pathspec(s)]);
    const files = st.out.split('\n').filter(Boolean).map(l => ({ state: l.slice(0, 2).trim() || 'M', path: l.slice(3).replace(/^"|"$/g, '') })).filter(f => !/^\.tribe(\/|$)/.test(f.path));
    const ref = await remoteRef(dir, s);
    const head = await git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    let ahead = 0; if (!head.code) { const c = await git(dir, ['rev-list', '--count', ref ? `${ref}..HEAD` : 'HEAD']); ahead = Number(c.out) || 0; }
    return { files: files.slice(0, 300), ahead, count: files.length + ahead };
  }
  async function status(pid) {
    const s = load(pid), dir = repoDir(pid), connected = !!s.settings.repo;
    const ch = connected ? await changes(pid).catch(() => ({ count: 0 })) : { count: 0 };
    const state = !connected ? 'off' : s.conflict ? 'conflict' : s.settings.paused ? 'paused' : ch.count ? 'pending' : s.lastShip ? 'synced' : 'ready';
    return { connected, kind: s.settings.kind, repo: s.settings.repo || null, url: connected && s.settings.kind === 'github' ? `https://github.com/${s.settings.repo}` : null, branch: s.settings.branch, mode: s.settings.mode, trigger: s.settings.trigger,
      target: s.settings.target, paused: !!s.settings.paused, state, pending: ch.count || 0, conflict: s.conflict, lastShip: s.lastShip, lastPull: s.lastPull, hasFolder: !!dir, git: !!(dir && W.isRepo(dir)), busy: busy.has(pid),
      awaiting: s.pending ? { approval: s.pending.approval, at: s.pending.at } : null };
  }

  // ---------- connect ----------
  let pid0 = null;
  function clean(body, prev) {
    const s = { ...prev };
    if (body.kind !== undefined) { if (!['github', 'folder'].includes(body.kind)) throw fail(400, 'kind: github or folder'); s.kind = body.kind; }
    if (s.kind === 'folder') {
      if (body.shared !== undefined) { if (!checkShared) throw fail(400, 'Shared folders need the host computer.'); s.shared = body.shared ? checkShared(String(body.shared), pid0) : ''; }
      if (body.sharedName !== undefined) { const n = String(body.sharedName || '').trim(); if (n && !/^[\w.-]{1,80}\.tribecode\.git$/.test(n)) throw fail(400, 'The shared repo is named like my-tribe.tribecode.git.'); s.sharedName = n; }
      if (s.shared && !s.sharedName) s.sharedName = defaultName(pid0);
      s.repo = s.shared ? display(bareOf(s)) : ''; s.target = 'push';
    } else if (body.repo !== undefined) { const r = parseRepo(body.repo); if (body.repo && !r) throw fail(400, 'Type the repository as owner/name.'); s.repo = r; }
    if (body.branch !== undefined) { const b = String(body.branch || '').trim(); if (!/^[\w./-]{1,100}$/.test(b) || b.startsWith('-') || b.includes('..')) throw fail(400, 'That branch name won’t work.'); s.branch = b; }
    if (body.mode !== undefined) { if (!['manual', 'auto'].includes(body.mode)) throw fail(400, 'mode: manual or auto'); s.mode = body.mode; }
    if (body.trigger !== undefined) { if (!TRIGGERS.includes(body.trigger)) throw fail(400, `trigger: ${TRIGGERS.join(', ')}`); s.trigger = body.trigger; }
    if (body.intervalMin !== undefined) s.intervalMin = Math.max(1, Math.min(1440, Math.round(Number(body.intervalMin) || 15)));
    if (body.autoPullMin !== undefined) s.autoPullMin = Math.max(0, Math.min(1440, Math.round(Number(body.autoPullMin) || 0)));
    if (body.target !== undefined) { if (!['push', 'pr'].includes(body.target)) throw fail(400, 'target: push or pr'); s.target = s.kind === 'folder' ? 'push' : body.target; }
    if (body.prTitle !== undefined) s.prTitle = String(body.prTitle || '').slice(0, 200) || DEFAULTS().prTitle;
    if (body.message !== undefined) { if (!['auto', 'flint', 'own'].includes(body.message)) throw fail(400, 'message: auto, flint or own'); s.message = body.message; }
    if (body.ownMessage !== undefined) s.ownMessage = String(body.ownMessage || '').slice(0, 500);
    if (body.exclude !== undefined) s.exclude = (Array.isArray(body.exclude) ? body.exclude : String(body.exclude || '').split(/[\n,]/)).map(x => String(x).trim()).filter(x => x && !x.includes('\0') && !x.startsWith('-') && !x.includes('..')).slice(0, 50).map(x => x.slice(0, 200));
    if (body.pullFirst !== undefined) s.pullFirst = !!body.pullFirst;
    if (body.conflict !== undefined) { if (!['stop', 'mine', 'theirs'].includes(body.conflict)) throw fail(400, 'conflict: stop, mine or theirs'); s.conflict = body.conflict; }
    for (const k of ['tagMilestones', 'requireApproval', 'paused']) if (body[k] !== undefined) s[k] = !!body[k];
    if (body.signAs !== undefined) { if (!['member', 'bot'].includes(body.signAs)) throw fail(400, 'signAs: member or bot'); s.signAs = body.signAs; }
    return s;
  }
  async function ensureRepo(pid, me) {
    let dir = repoDir(pid);
    if (!dir) {   // no home folder (this device's server, a cloud tribe): the tribe's own workspace is the living repo
      dir = base.p('workspaces', pid); fs.mkdirSync(dir, { recursive: true });
      P.update(pid, { repo: dir, workspace: true }); resetHub && resetHub(pid);
    }
    if (!W.isRepo(dir)) await must(dir, ['init', '-q', '-b', 'main']);   // nothing committed: what's here waits as changes not shipped
    protect(dir);
    return dir;
  }
  async function connect(pid, body, me) {
    const s = load(pid), was = s.settings.repo;
    pid0 = pid; s.settings = clean(body, s.settings);
    if (s.settings.repo) {
      const dir = await ensureRepo(pid, me);
      if (s.settings.kind === 'folder') {   // the shared repo: made once, then everyone with the folder pushes and pulls it
        const bare = bareOf(s.settings);
        if (!fs.existsSync(bare)) { if (body.join) throw fail(404, 'There is no shared repo with that name in this folder (yet). It may still be syncing.'); await must(path.dirname(bare), ['init', '-q', '--bare', '-b', s.settings.branch, bare]); }
        else await healthy(s.settings, null);
      }
      const url = remoteOf(s.settings);
      const has = await git(dir, ['remote', 'get-url', REMOTE]);
      await must(dir, has.code ? ['remote', 'add', REMOTE, url] : ['remote', 'set-url', REMOTE, url]);
      s.remote = REMOTE;
      if (was !== s.settings.repo) { s.conflict = null; s.lastShip = null; }
    }
    save(pid, s); push(pid);
    if (s.settings.repo && was !== s.settings.repo) try { P.inProject(pid, () => postChat('general', 'tribecode', `${me.name} connected **${s.settings.repo}** ${s.settings.kind === 'folder' ? 'as a shared folder' : 'on GitHub'}. ${s.settings.mode === 'auto' ? `It ships by itself (${triggerText(s.settings)}).` : 'Nothing ships until someone presses Ship.'}`)); } catch {}
    return view(pid, me);
  }
  const triggerText = st => ({ approve: 'on approve', done: 'when a task is done', interval: `every ${st.intervalMin} min with changes`, save: 'on every save' }[st.trigger]);
  function disconnect(pid) {
    const s = load(pid), dir = repoDir(pid);
    if (dir && W.isRepo(dir)) run('git', ['remote', 'remove', REMOTE], { cwd: dir }).catch(() => {});
    s.settings = { ...DEFAULTS() }; s.conflict = null; s.pending = null; save(pid, s); push(pid);
    return { ok: true };
  }

  // ---------- pull ----------
  async function fetchRemote(dir, s, a) {
    await healthy(s.settings, dir);
    const r = await git(dir, ['fetch', '--quiet', REMOTE, `+refs/heads/${s.settings.branch}:refs/remotes/${REMOTE}/${s.settings.branch}`], { pre: a.args, env: a.env });
    if (r.code && !/couldn't find remote ref|not found|does not appear/i.test(r.err)) throw fail(502, `GitHub didn’t answer: ${r.err.split('\n')[0]}`);
  }
  // merge GitHub's branch in. Conflicts: stop (abort, record, show), mine (-X ours), theirs (-X theirs).
  async function pullIn(pid, me, how) {
    const s = load(pid), dir = repoDir(pid); if (!dir) throw fail(400, 'no folder');
    const a = auth(me); await fetchRemote(dir, s, a);
    const ref = await remoteRef(dir, s); if (!ref) return { pulled: false, note: 'GitHub’s branch is empty' };
    const strat = how || s.settings.conflict;
    const who = whoFor(s, me);
    // uncommitted work stays safe: commit it first (same message rules as a ship) so a merge never touches loose files
    const r = await git(dir, [...ident(who), 'merge', '--no-edit', '--allow-unrelated-histories', ...(strat === 'mine' ? ['-X', 'ours'] : strat === 'theirs' ? ['-X', 'theirs'] : []), ref]);
    if (r.code) {
      const un = await git(dir, ['diff', '--name-only', '--diff-filter=U']);
      const files = un.out.split('\n').filter(Boolean);
      await git(dir, ['merge', '--abort']);
      const ss = load(pid); ss.conflict = { files: files.slice(0, 50), at: new Date().toISOString(), detail: (r.out + ' ' + r.err).split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300) };
      save(pid, ss); push(pid);
      try { P.inProject(pid, () => postChat('general', 'tribecode', `GitHub and **${(P.get(pid) || {}).name}** changed the same lines (${files.slice(0, 3).join(', ') || 'some files'}). Sync stopped so nothing is lost: pick Keep mine or Take GitHub’s in the sync panel.`)); } catch {}
      throw Object.assign(fail(409, 'GitHub has changes to the same lines. Sync stopped: nothing was lost. Pick Keep mine or Take GitHub’s.'), { conflict: ss.conflict });
    }
    const ss = load(pid); ss.lastPull = new Date().toISOString(); ss.conflict = null; save(pid, ss); push(pid);
    return { pulled: true };
  }
  async function pull(pid, me, how) {
    const s = load(pid);
    if (!s.settings.repo) throw fail(400, 'Connect a GitHub repo first.');
    if (s.settings.paused) throw fail(409, 'Sync is paused.');
    return once(pid, async () => { const dir = repoDir(pid); await commitLocal(pid, dir, s, me, null); return pullIn(pid, me, how); });
  }
  const once = async (pid, fn) => { if (busy.has(pid)) throw fail(409, 'A ship or pull is already running.'); busy.set(pid, 1); push(pid); try { return await fn(); } finally { busy.delete(pid); push(pid); } };

  // ---------- ship ----------
  function summaryOf(files) {
    if (!files.length) return 'No file changes';
    const names = files.map(f => path.basename(f.path)), more = names.length - 3;
    return `Update ${files.length} file${files.length === 1 ? '' : 's'}: ${names.slice(0, 3).join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
  }
  async function messageFor(pid, s, files, asked) {
    if (asked && String(asked).trim()) return String(asked).trim().slice(0, 2000);
    if (s.settings.message === 'own' && s.settings.ownMessage.trim()) return s.settings.ownMessage.trim();
    const auto = summaryOf(files);
    if (s.settings.message === 'flint' && brain && brain.status && brain.status().online) {
      try { const t = await brain.generate(`Changed files:\n${files.slice(0, 40).map(f => `${f.state} ${f.path}`).join('\n')}\n\nWrite ONE short git commit subject (max 70 chars, imperative). Plain text.`, { system: 'You write git commit subjects.', maxTokens: 40, timeoutMs: 15000 });
        if (t && t.trim()) return t.replace(/\s+/g, ' ').trim().slice(0, 100); } catch {}
    }
    return auto;
  }
  async function commitLocal(pid, dir, s, me, asked) {
    if (!dir || !W.isRepo(dir)) return null;
    protect(dir);
    await must(dir, ['add', '-A', ...pathspec(s, true)]);   // .tribe/ is in info/exclude, and unstaged below whatever happens
    // belt and braces: nothing under .tribe/ is ever staged, whatever a .gitignore says
    const staged = (await git(dir, ['diff', '--cached', '--name-only'])).out.split('\n').filter(Boolean);
    const bad = staged.filter(f => /^\.tribe(\/|$)/.test(f)); if (bad.length) await git(dir, ['rm', '-r', '--cached', '--quiet', '--', ...bad]);
    if ((await git(dir, ['diff', '--cached', '--quiet'])).code === 0) return null;
    const files = staged.filter(f => !bad.includes(f)).map(p => ({ state: 'M', path: p }));
    const msg = await messageFor(pid, s, files, asked);
    await must(dir, [...ident(whoFor(s, me)), 'commit', '-q', '-m', msg]);
    return { message: msg, files: files.length };
  }
  async function openPr(s, head, title, body, a) {
    const tok = a.env && a.env.TRIBE_GIT_TOKEN; if (!tok) throw fail(401, 'A pull request needs a GitHub sign-in (Settings › GitHub) on the host.');
    const api = String(process.env.TRIBE_GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
    const r = await fetch(`${api}/repos/${s.settings.repo}/pulls`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'TribeCode' }, body: JSON.stringify({ title, head, base: s.settings.branch, body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(502, `GitHub didn’t open the pull request: ${scrub(d.message || r.status)}`);
    return { number: d.number, url: d.html_url };
  }
  async function ship(pid, me, { message, target, why = 'manual' } = {}) {
    const s = load(pid);
    if (!s.settings.repo) throw fail(400, 'Connect a GitHub repo first.');
    if (s.settings.paused) throw fail(409, 'Sync is paused. Resume it to ship.');
    if (s.conflict) throw fail(409, 'There is a conflict to sort out first (Keep mine or Take GitHub’s).');
    return once(pid, async () => {
      const dir = repoDir(pid); if (!dir || !W.isRepo(dir)) throw fail(400, 'This project has no git repo yet.');
      const a = auth(me), pre = await changes(pid);
      const made = await commitLocal(pid, dir, s, me, message);
      if (s.settings.pullFirst) await pullIn(pid, me);   // throws 409 on a conflict (stop) and records it
      else await fetchRemote(dir, s, a);
      const head = await must(dir, ['rev-parse', 'HEAD']);
      const ref = await remoteRef(dir, s);
      if (ref === head) return { shipped: false, note: 'Nothing new to ship.', status: await status(pid) };
      const tgt = target === 'pr' || target === 'push' ? target : s.settings.target;
      const msg = made ? made.message : (await git(dir, ['log', '-1', '--format=%s'])).out;
      const entry = { id: 'sh-' + Date.now().toString(36), at: new Date().toISOString(), by: me ? me.id : null, byName: me ? me.name : 'TribeCode', why, sha: head.slice(0, 40), short: head.slice(0, 7), before: ref, message: msg, files: pre.files.length, target: tgt, branch: s.settings.branch };
      if (tgt === 'pr') {
        const br = `tribe/ship-${entry.id.slice(3)}`;
        const r = await git(dir, ['push', '--quiet', REMOTE, `HEAD:refs/heads/${br}`], { pre: a.args, env: a.env });
        if (r.code) throw fail(502, `Push failed: ${r.err.split('\n')[0]}`);
        const title = s.settings.prTitle.replace(/\{project\}/g, (P.get(pid) || {}).name || pid).replace(/\{summary\}/g, msg).replace(/\{date\}/g, entry.at.slice(0, 10)).slice(0, 200);
        entry.pr = await openPr(s, br, title, `Shipped from TribeCode by ${entry.byName}.\n\n${pre.files.slice(0, 30).map(f => `- ${f.path}`).join('\n')}`, a);
        entry.headBranch = br;
      } else {
        await healthy(s.settings, dir);
        const r = await git(dir, ['push', '--quiet', REMOTE, `HEAD:refs/heads/${s.settings.branch}`], { pre: a.args, env: a.env });
        if (r.code) throw fail(502, /rejected|non-fast-forward|fetch first/i.test(r.err) ? `${s.settings.kind === 'folder' ? 'The shared folder' : 'GitHub'} has newer changes. Turn on “Pull before ship” or press Pull first.` : `Push failed: ${r.err.split('\n')[0]}`);
        if (s.settings.kind === 'folder') {   // verify: the shared repo really holds what was pushed
          const v = await git(dir, ['ls-remote', REMOTE, `refs/heads/${s.settings.branch}`]);
          if (v.code || !v.out.startsWith(head)) throw fail(502, 'The shared folder didn’t keep the push (it may be mid-sync). Nothing is lost here; try again in a moment.');
        }
        await git(dir, ['update-ref', `refs/remotes/${REMOTE}/${s.settings.branch}`, head]);
      }
      const ss = load(pid); ss.lastShip = { at: entry.at, sha: entry.short, by: entry.byName, pr: entry.pr || null }; ss.log.unshift(entry); ss.lastAuto = why === 'manual' ? ss.lastAuto : Date.now(); ss.pending = null; save(pid, ss);
      try { P.inProject(pid, () => postChat('general', 'tribecode', entry.pr ? `🚀 ${entry.byName} shipped to a pull request on **${s.settings.repo}**: ${entry.pr.url}` : `🚀 ${why === 'manual' ? entry.byName : 'Auto-ship'} shipped **${msg}** to ${s.settings.repo} (${s.settings.branch}).`)); } catch {}
      return { shipped: true, entry, status: await status(pid) };
    });
  }
  async function undo(pid, me) {
    const s = load(pid), last = s.log.find(e => !e.undone && !e.revert);
    if (!last) throw fail(404, 'Nothing to undo.');
    if (last.pr) throw fail(409, `That ship is a pull request: close it on GitHub instead (${last.pr.url}).`);
    if (s.settings.paused) throw fail(409, 'Sync is paused.');
    return once(pid, async () => {
      const dir = repoDir(pid), a = auth(me);
      const parents = (await git(dir, ['rev-list', '--parents', '-n', '1', last.sha])).out.split(' ').length - 1;
      await must(dir, [...ident(whoFor(s, me)), 'revert', '--no-edit', ...(parents > 1 ? ['-m', '1'] : []), last.sha]);
      const head = await must(dir, ['rev-parse', 'HEAD']);
      await healthy(s.settings, dir).catch(async e => { await git(dir, ['reset', '--hard', 'HEAD~1']); throw e; });
      const r = await git(dir, ['push', '--quiet', REMOTE, `HEAD:refs/heads/${s.settings.branch}`], { pre: a.args, env: a.env });
      if (r.code) { await git(dir, ['reset', '--hard', 'HEAD~1']); throw fail(502, `Couldn’t push the undo: ${r.err.split('\n')[0]}`); }
      await git(dir, ['update-ref', `refs/remotes/${REMOTE}/${s.settings.branch}`, head]);
      const ss = load(pid); const e = ss.log.find(x => x.id === last.id); if (e) e.undone = new Date().toISOString();
      ss.log.unshift({ id: 'sh-' + Date.now().toString(36), at: new Date().toISOString(), by: me.id, byName: me.name, why: 'undo', sha: head, short: head.slice(0, 7), message: `Undo “${last.message}”`, revert: last.id, target: 'push', branch: s.settings.branch });
      ss.lastShip = { at: new Date().toISOString(), sha: head.slice(0, 7), by: me.name }; save(pid, ss);
      try { P.inProject(pid, () => postChat('general', 'tribecode', `↩️ ${me.name} undid the last ship (“${last.message}”) with a revert commit.`)); } catch {}
      return { undone: last.id, status: await status(pid) };
    });
  }
  async function resolve(pid, me, use) {
    const s = load(pid); if (!s.conflict) return { ok: true };
    if (use === 'dismiss') { s.conflict = null; save(pid, s); push(pid); return { ok: true }; }
    if (!['mine', 'theirs'].includes(use)) throw fail(400, 'use: mine, theirs or dismiss');
    s.conflict = null; save(pid, s);
    await once(pid, () => pullIn(pid, me, use));
    return { ok: true, status: await status(pid) };
  }

  // ---------- auto-ship ----------
  const SYS = { id: 'tribecode', name: 'TribeCode', role: 'system' };
  const ask = (pid, title, details, who) => P.inProject(pid, () => approvals.create({ kind: 'sync-ship', risk: 'low', title, details }, who));
  async function auto(pid, why) {
    const s = load(pid), st = s.settings;
    if (!st.repo || st.mode !== 'auto' || st.paused || s.conflict || busy.has(pid)) return null;
    const ch = await changes(pid).catch(() => ({ count: 0 })); if (!ch.count) return null;
    const lead0 = getMembers().find(m => m.role === 'host') || null;
    if (st.requireApproval) {
      if (s.pending) return null;   // one waiting approval at a time
      const ap = ask(pid, `Auto-ship ${ch.count} change${ch.count === 1 ? '' : 's'} to ${st.repo}?`, summaryOf(ch.files), SYS);
      s.pending = { approval: ap && ap.id, at: new Date().toISOString(), why }; save(pid, s); push(pid);
      return { waiting: ap && ap.id };
    }
    try { return await ship(pid, st.signAs === 'bot' ? null : lead0, { why }); } catch (e) { log(`auto-ship ${pid}: ${e.message}`); return { error: e.message }; }
  }
  function onApproval(a) {
    if (!a || a.status !== 'approved') return;
    const pid = a.project || P.defaultId();
    if (a.kind === 'sync-ship') {
      const s = load(pid); if (!s.pending || s.pending.approval !== a.id) return;
      s.pending = null; save(pid, s);
      const st = s.settings; if (st.paused || !st.repo) return;
      ship(pid, st.signAs === 'bot' ? null : member(a.decidedBy) || null, { why: 'approved' }).catch(e => log(`auto-ship ${pid}: ${e.message}`));
      return;
    }
    if (load(pid).settings.trigger === 'approve') auto(pid, 'approve').catch(() => {});
  }
  function onTaskDone(t) { const pid = (t && t.project) || P.defaultId(); if (load(pid).settings.trigger === 'done') setTimeout(() => auto(pid, 'done').catch(() => {}), 50); }
  const saveTimers = new Map();
  function onSave(pid) {
    if (load(pid).settings.trigger !== 'save') return;
    clearTimeout(saveTimers.get(pid)); saveTimers.set(pid, setTimeout(() => { saveTimers.delete(pid); auto(pid, 'save').catch(() => {}); }, SAVE_MS));
  }
  async function onRelease(pid, version) {
    const s = load(pid); if (!s.settings.repo || !s.settings.tagMilestones || s.settings.paused) return;
    const dir = repoDir(pid); if (!dir || !/^[\w.-]{1,40}$/.test(String(version || ''))) return;
    const a = auth(null);
    await git(dir, ['tag', '-a', version, '-m', `Release ${version}`], { pre: ident(BOT) });   // board.js may have tagged it already: fine
    const r = await git(dir, ['push', '--quiet', REMOTE, `refs/tags/${version}`], { pre: a.args, env: a.env });
    if (r.code) log(`tag ${version}: ${r.err.split('\n')[0]}`);
  }
  async function tick() {
    for (const p of P.all()) {
      const s = load(p.id), st = s.settings; if (!st.repo || st.paused || s.conflict || busy.has(p.id)) continue;
      if (st.mode === 'auto' && st.trigger === 'interval' && Date.now() - (s.lastAuto || 0) >= st.intervalMin * MINUTE) {
        const ss = load(p.id); ss.lastAuto = Date.now(); save(p.id, ss);
        await auto(p.id, 'interval').catch(() => {});
      }
      if (st.autoPullMin > 0 && Date.now() - Date.parse(s.lastPull || 0) >= st.autoPullMin * MINUTE) {
        await pull(p.id, getMembers().find(m => m.role === 'host') || null).catch(e => { if (e.status !== 409) log(`auto-pull ${p.id}: ${e.message}`); const ss = load(p.id); ss.lastPull = new Date().toISOString(); save(p.id, ss); });
      }
    }
  }
  const timer = setInterval(() => tick().catch(e => log('sync tick: ' + e.message)), TICK_MS); timer.unref && timer.unref();

  // ---------- HTTP ----------
  async function view(pid, me) {
    const s = load(pid);
    return { settings: s.settings, status: await status(pid), log: s.log.slice(0, 20).map(e => ({ ...e, before: undefined })), can: { edit: lead(me, pid), ship: writer(me, pid), undo: lead(me, pid) } };
  }
  async function route(req, res, { m, b, c, parts, me, readBody, send, fail: f }) {
    if (c !== 'sync') return null;
    if (!me) return f(res, 401, 'not a member of this tribe');
    const p = P.get(b); if (!p || !P.canSee(me, b)) return f(res, 404, 'project not found');
    const sub = parts[3];
    try {
      if (!sub && m === 'GET') return send(res, 200, await view(b, me));
      if (!sub && (m === 'PUT' || m === 'PATCH')) { if (!lead(me, b)) return f(res, 403, 'Only the host or the project lead changes sync settings.'); return send(res, 200, await connect(b, await readBody(req), me)); }
      if (!sub && m === 'DELETE') { if (!lead(me, b)) return f(res, 403, 'Only the host or the project lead changes sync settings.'); return send(res, 200, disconnect(b)); }
      if (sub === 'changes' && m === 'GET') { const ch = await changes(b); return send(res, 200, { ...ch, summary: summaryOf(ch.files) }); }
      if (sub === 'ship' && m === 'POST') { if (!writer(me, b)) return f(res, 403, 'read-only'); const body = await readBody(req); return send(res, 200, await ship(b, me, { message: body.message, target: body.target })); }
      if (sub === 'join' && m === 'POST') {   // a friend with the same shared folder: connect to the shared repo and pull it in
        if (!lead(me, b)) return f(res, 403, 'Only the host or the project lead joins a shared folder.');
        const body = await readBody(req);
        await connect(b, { ...body, kind: 'folder', join: true }, me);
        await pull(b, me);
        return send(res, 200, await view(b, me));
      }
      if (sub === 'pull' && m === 'POST') { if (!writer(me, b)) return f(res, 403, 'read-only'); return send(res, 200, { ...(await pull(b, me)), status: await status(b) }); }
      if (sub === 'resolve' && m === 'POST') { if (!lead(me, b)) return f(res, 403, 'Only the host or the project lead sorts out a conflict.'); return send(res, 200, await resolve(b, me, (await readBody(req)).use)); }
      if (sub === 'undo' && m === 'POST') { if (!lead(me, b)) return f(res, 403, 'Only the host or the project lead can undo a ship.'); return send(res, 200, await undo(b, me)); }
      return f(res, 404, 'not found');
    } catch (e) { return send(res, e.status || 500, { error: scrub(e.message), ...(e.conflict ? { conflict: e.conflict } : {}) }); }
  }

  // ---------- MCP ----------
  function mcpTools({ text, err, S, str }, prev = {}) {
    return {
      ship_status: {
        description: (prev.ship_status ? prev.ship_status.description + ' ' : '') + 'Also: the GitHub sync of this project (repo, branch, manual or auto-ship, changes not shipped, paused, a conflict that needs a person).',
        inputSchema: S({}),
        run: async (a, me) => {
          const pid = P.current() || P.defaultId(), st = await status(pid);
          let old = null; if (prev.ship_status) try { const r = await prev.ship_status.run(a, me); old = r && r.content && r.content[0] ? JSON.parse(r.content[0].text) : null; } catch {}
          return text({ ...(old || {}), sync: { connected: st.connected, repo: st.repo, branch: st.branch, mode: st.mode, trigger: st.mode === 'auto' ? st.trigger : null, state: st.state, notShipped: st.pending, paused: st.paused, conflict: st.conflict ? st.conflict.files : null, lastShip: st.lastShip } });
        },
      },
      ship_now: {
        description: 'Ship this project to its connected GitHub repo now (commit what changed, pull first if set, push or open a pull request). With "require approval" on, it asks the people first. Optional message.',
        inputSchema: S({ message: str('Commit message (optional; else the project\'s message style)') }),
        run: async (a, me) => {
          const pid = P.current() || P.defaultId(), s = load(pid);
          if (!s.settings.repo) return err('This project has no GitHub repo connected. A person connects one in the project’s home pill.');
          if (s.settings.requireApproval) {
            const ap = ask(pid, `${me.name} asks to ship to ${s.settings.repo}`, String(a.message || ''), me);
            s.pending = { approval: ap && ap.id, at: new Date().toISOString(), why: 'agent' }; save(pid, s); push(pid);
            return text('Asked the people to approve the ship. Check ship_status.');
          }
          try { const r = await ship(pid, me, { message: a.message, why: 'agent' }); return text(r.shipped ? `Shipped ${r.entry.short} to ${s.settings.repo}${r.entry.pr ? ` as ${r.entry.pr.url}` : ''}.` : r.note); }
          catch (e) { return err(scrub(e.message)); }
        },
      },
    };
  }

  return { route, status, changes, connect, disconnect, ship, pull, undo, resolve, auto, onApproval, onTaskDone, onSave, onRelease, tick, mcpTools, load, scrub };
};
