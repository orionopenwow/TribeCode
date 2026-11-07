// Repo autopilot: live status of the project repo (--repo), an opt-in autopilot that keeps it in
// sync, "needs a desktop" change requests from phones, and the wiring for the living context file
// (server/context.js) and the master integrator (server/integrator.js).
//
// Safety rules: never force-push, never merge code branches without a human-approved proposal,
// and do risky work (applying patches, merging, running checks) in temporary worktrees only.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bus = require('./bus');
const gitutil = require('./gitutil');
const makeContext = require('./context');
const makeIntegrator = require('./integrator');

const DEFAULTS = {
  autopilot: { enabled: false, autoPull: true, commitContext: false, reportTags: true },
  checkCommand: '',          // empty: `npm test` when package.json has a real test script
  checkTimeoutSec: 600,
  allowNoChecks: false,      // integrate even when no check command exists
  contextInRepo: true,       // also write TRIBE_CONTEXT.md at the repo root
  keepContextLocal: false,   // add TRIBE_CONTEXT.md to the repo's .gitignore
  integrator: true,          // the host's Claude Code agent is the master integrator
};
const CONTEXT_FILE = 'TRIBE_CONTEXT.md';
const POLL_MS = Number(process.env.TRIBE_REPO_POLL_MS) || 20_000;
const FETCH_MS = Number(process.env.TRIBE_REPO_FETCH_MS) || 120_000;
const COMMIT_EVERY_MS = Number(process.env.TRIBE_CONTEXT_COMMIT_MS) || 15 * 60_000;

module.exports = function repoHub({ repo, store, str, broadcast, postChat, createTask, loadTasks, saveTask, getMembers, nameOf, drift, board, presence, readVision, tribe, claims, onHead = null, contextExtra = null }) {
  let lastHead = null;   // onHead (server/flow.js): new commits on the checked-out branch become a gist
  const enabled = () => !!repo && fs.existsSync(path.join(repo, '.git'));
  const G = gitutil(repo);
  fs.mkdirSync(store.p('changes'), { recursive: true });
  fs.mkdirSync(store.p('repo'), { recursive: true });

  // ---------- settings ----------
  let settings = merge(DEFAULTS, store.readJSON('repo/settings.json', {}));
  function merge(base, over) {
    const out = { ...base, ...over, autopilot: { ...base.autopilot, ...((over || {}).autopilot || {}) } };
    return out;
  }
  const saveSettings = () => { store.writeJSON('repo/settings.json', settings); broadcast({ type: 'repo-settings', settings: publicSettings() }); };
  const publicSettings = () => { const { reportedTags, lastPush, lastContextCommit, ...s } = settings; return s; };
  function updateSettings(body) {
    const s = settings, b = body || {};
    if (b.autopilot && typeof b.autopilot === 'object') for (const k of Object.keys(DEFAULTS.autopilot)) if (typeof b.autopilot[k] === 'boolean') s.autopilot[k] = b.autopilot[k];
    if (typeof b.checkCommand === 'string') s.checkCommand = b.checkCommand.trim().slice(0, 500);
    if (Number.isFinite(Number(b.checkTimeoutSec)) && b.checkTimeoutSec !== undefined) s.checkTimeoutSec = Math.min(Math.max(Number(b.checkTimeoutSec), 5), 3600);
    for (const k of ['allowNoChecks', 'contextInRepo', 'integrator']) if (typeof b[k] === 'boolean') s[k] = b[k];
    if (typeof b.keepContextLocal === 'boolean' && b.keepContextLocal !== s.keepContextLocal) { s.keepContextLocal = b.keepContextLocal; syncGitignore(); }
    saveSettings(); context.touch('settings'); poll().catch(() => {});
    return publicSettings();
  }
  // "Keep it local": TRIBE_CONTEXT.md goes in the repo's .gitignore (and comes out again when turned off).
  function syncGitignore() {
    if (!enabled()) return;
    const f = path.join(repo, '.gitignore'); let text = ''; try { text = fs.readFileSync(f, 'utf8'); } catch {}
    const lines = text.split('\n'); const has = lines.some(l => l.trim() === CONTEXT_FILE || l.trim() === '/' + CONTEXT_FILE);
    if (settings.keepContextLocal && !has) fs.writeFileSync(f, (text && !text.endsWith('\n') ? text + '\n' : text) + `/${CONTEXT_FILE}\n`);
    if (!settings.keepContextLocal && has) fs.writeFileSync(f, lines.filter(l => l.trim() !== '/' + CONTEXT_FILE && l.trim() !== CONTEXT_FILE).join('\n'));
  }

  // ---------- activity log ----------
  function log(kind, text, { notify = 'repo', priority = 'low', to = 'all', extra = {} } = {}) {
    const entry = { at: new Date().toISOString(), kind, text, ...extra };
    store.appendJSONL('repo/activity.jsonl', entry);
    broadcast({ type: 'repo-activity', entry });
    if (notify) bus.notify({ type: notify, priority, to, title: text, body: extra.detail || '', view: 'repo', ref: extra.ref });
    return entry;
  }
  const activity = (n = 60) => store.readJSONL('repo/activity.jsonl', n).reverse();

  // ---------- live status ----------
  let status = enabled() ? { enabled: true, loading: true } : { enabled: false, reason: 'Start the server with --repo <path to your project> to see the repo here.' };
  let lastFetch = 0, ci = null, ciAt = 0, polling = false;
  const cleanUrl = u => String(u || '').replace(/\/\/[^/@]+@/, '//');

  async function computeStatus() {
    if (!enabled()) return { enabled: false, reason: 'Start the server with --repo <path to your project> to see the repo here.' };
    const branch = (await G.gitTry(['rev-parse', '--abbrev-ref', 'HEAD'])).out || '(no commits)';
    const main = await G.mainBranch();
    let upstream = null;
    const u = await G.gitTry(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    if (u.code === 0 && u.out) upstream = u.out;
    else if ((await G.gitTry(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`])).code === 0) upstream = `origin/${branch}`;
    let ahead = 0, behind = 0;
    if (upstream) { const c = await G.gitTry(['rev-list', '--left-right', '--count', `${upstream}...HEAD`]); if (c.code === 0) [behind, ahead] = c.out.split(/\s+/).map(Number); }
    const porcelain = (await G.gitTry(['--no-optional-locks', 'status', '--porcelain=v1'])).out.split('\n').filter(Boolean)
      .map(l => ({ code: l.slice(0, 2), path: l.slice(3).replace(/^"|"$/g, '') }));
    const managed = p => p === CONTEXT_FILE || (tribeRel() && (p + '/').startsWith(tribeRel() + '/'));
    const dirty = porcelain.filter(f => f.code !== '??' && !managed(f.path));
    const untracked = porcelain.filter(f => f.code === '??' && !managed(f.path));
    const commits = (await G.gitTry(['log', '-n', '8', '--format=%h%x1f%an%x1f%s%x1f%cI'])).out.split('\n').filter(Boolean)
      .map(l => { const [sha, author, subject, at] = l.split('\x1f'); return { sha, author, subject, at }; });
    const remoteUrl = cleanUrl((await G.gitTry(['remote', 'get-url', 'origin'])).out);
    const gh = remoteUrl.match(/github\.com[:/]+([^/]+\/[^/.]+?)(?:\.git)?\/?$/);
    let radar = { branches: [] }; try { radar = await drift.radar(); } catch {}
    const branches = (radar.branches || []).map(b => ({ branch: b.branch, author: b.author, ahead: b.ahead, behind: b.behind, files: b.files, level: b.level, days: b.days, task: b.task, lastCommit: b.lastCommit }));
    const originHead = upstream ? (await G.gitTry(['log', '-1', '--format=%cI', upstream])).out : '';
    return { enabled: true, name: path.basename(repo), branch, main, upstream, ahead, behind,
      dirty: dirty.slice(0, 40), dirtyCount: dirty.length, untrackedCount: untracked.length,
      commits, branches, remote: remoteUrl ? { url: remoteUrl, github: gh ? gh[1] : null } : null,
      ci: await ciStatus(gh && gh[1], main), lastPush: settings.lastPush || null, originUpdated: originHead || null,
      lastFetch: lastFetch ? new Date(lastFetch).toISOString() : null, tribeInRepo: !!tribeRel() };
  }
  // Optional: GitHub Actions status for main via the gh CLI. Skipped quietly when unavailable.
  async function ciStatus(slug, main) {
    if (!slug) return null;
    if (Date.now() - ciAt < 120_000) return ci;
    ciAt = Date.now();
    const r = await G.run('gh', ['run', 'list', '--branch', main, '--limit', '1', '--json', 'status,conclusion,workflowName,url,createdAt'], { cwd: repo, timeout: 15_000 });
    try { const [x] = r.code === 0 ? JSON.parse(r.out) : []; ci = x ? { status: x.status, conclusion: x.conclusion, workflow: x.workflowName, url: x.url, at: x.createdAt } : null; } catch { ci = null; }
    return ci;
  }
  function tribeRel() {
    if (!repo) return null;
    const rel = path.relative(path.resolve(repo), store.root);
    return !rel || rel.startsWith('..') || path.isAbsolute(rel) ? null : rel.split(path.sep).join('/');
  }

  const strip = s => JSON.stringify({ ...s, lastFetch: undefined, checked: undefined });
  async function poll({ force = false } = {}) {
    if (!enabled() || (polling && !force)) return status;
    polling = true;
    try {
      if (Date.now() - lastFetch > FETCH_MS && await G.hasRemote()) { lastFetch = Date.now(); await G.locked(() => G.gitTry(['fetch', '--all', '--prune', '--quiet'], repo, { timeout: 60_000 })); }
      let next = await computeStatus();
      if (settings.autopilot.enabled && await autopilot(next)) next = await computeStatus();
      next.checked = new Date().toISOString();
      const head = next.commits && next.commits[0] ? next.commits[0].sha : null;
      if (onHead && head && lastHead && head !== lastHead) { const from = lastHead; try { onHead({ from, to: head, branch: next.branch, repo }); } catch (e) { console.error('repo onHead:', e.message); } }
      if (head) lastHead = head;
      if (strip(next) !== strip(status)) { status = next; broadcast({ type: 'repo', status }); context.touch('repo'); }
      else status = next;
    } catch (e) { console.error('repo poll:', e.message); }
    finally { polling = false; }
    return status;
  }

  // ---------- autopilot ----------
  async function autopilot(st) {
    const o = settings.autopilot; let changed = false;
    // 1. Fast-forward main from origin when the working tree is clean (never merges, never rebases).
    if (o.autoPull && st.branch === st.main && st.upstream && st.behind > 0 && st.ahead === 0 && st.dirtyCount === 0) {
      const r = await G.locked(() => G.gitTry(['merge', '--ff-only', '--quiet', st.upstream]));
      if (r.code === 0) { log('pull', `Autopilot pulled ${st.behind} commit${st.behind > 1 ? 's' : ''} into ${st.main}`); changed = true; }
      else log('pull-failed', `Autopilot could not fast-forward ${st.main}: ${(r.err || r.out).split('\n')[0]}`);
    }
    // 2. Commit + push TRIBE_CONTEXT.md and the tribe folder docs (only when on main and in sync).
    if (o.commitContext && st.branch === st.main && st.behind === 0 && Date.now() - (settings.lastContextCommit || 0) > COMMIT_EVERY_MS) {
      const paths = [...(settings.contextInRepo && !settings.keepContextLocal ? [CONTEXT_FILE] : []), ...(tribeRel() ? [tribeRel()] : [])];
      if (paths.length && (await G.gitTry(['status', '--porcelain', '--', ...paths])).out) {
        settings.lastContextCommit = Date.now(); saveSettings();
        const r = await G.locked(async () => {
          await G.git(['add', '--', ...paths]);
          if (!(await G.gitTry(['diff', '--cached', '--quiet', '--', ...paths])).code) return { skipped: true };
          await G.git([...(await G.identity()), 'commit', '--quiet', '-m', 'TribeCode: update tribe context', '--', ...paths]);
          if (!st.upstream) return { pushed: false };
          const p = await G.gitTry(['push', '--quiet', 'origin', st.main], repo, { timeout: 60_000 });
          return { pushed: p.code === 0, err: p.err };
        }).catch(e => ({ error: e.message }));
        if (r.error) log('commit-failed', `Autopilot could not commit the tribe context: ${r.error.split('\n')[0]}`);
        else if (!r.skipped) {
          if (r.pushed) settings.lastPush = new Date().toISOString(), saveSettings();
          log('commit', `Autopilot committed the tribe context${r.pushed ? ' and pushed it' : r.err ? ` (push failed: ${r.err.split('\n')[0]})` : ''}`);
          changed = true;
        }
      }
    }
    // 3. Report milestone tags (board.js tags and pushes them on release).
    if (o.reportTags) {
      const seen = new Set(settings.reportedTags || []); let any = false;
      for (const m of store.readJSON('milestones.json', [])) {
        if (m.status !== 'released' || seen.has(m.version)) continue;
        seen.add(m.version); any = true;
        const g = m.git || {};
        log('tag', `Milestone ${m.version} released: ${g.pushed ? 'tag pushed to origin' : g.tagged ? 'tagged locally, not pushed' : 'recorded without a git tag'}`, { extra: { detail: g.note || m.title } });
      }
      if (any) { settings.reportedTags = [...seen]; saveSettings(); }
    }
    return changed;
  }

  // ---------- change requests ("needs a desktop") ----------
  const crRel = cid => `changes/${cid}.md`, patchRel = cid => `changes/${cid}.patch`;
  const okId = cid => /^cr-[a-z0-9]{4,16}$/.test(String(cid));
  function loadChange(cid) {
    if (!okId(cid)) return null;
    const r = store.readMd(crRel(cid)); if (!r) return null;
    let patch = ''; try { patch = fs.readFileSync(store.p(patchRel(cid)), 'utf8'); } catch {}
    return { ...r.meta, description: r.body, patch, hasPatch: !!patch };
  }
  const view = c => c && ({ ...c, byName: nameOf(c.by), claimedByName: c.claimedBy ? nameOf(c.claimedBy) : null });
  function listChanges() {
    return store.listMd('changes').map(f => loadChange(path.basename(f, '.md'))).filter(Boolean)
      .sort((a, b) => String(b.created).localeCompare(String(a.created))).map(c => { const { patch, ...rest } = view(c); return { ...rest, patchLines: patch ? patch.split('\n').length : 0 }; });
  }
  function saveChange(c) {
    const { description = '', patch, hasPatch, byName, claimedByName, patchLines, ...meta } = c;
    store.writeMd(crRel(c.id), meta, description);
    const fresh = loadChange(c.id) || c;
    const { patch: p, ...pub } = view(fresh);
    broadcast({ type: 'change', change: { ...pub, patchLines: p ? p.split('\n').length : 0 } });
    context.touch('change');
    return c;
  }
  function createChange(body, me) {
    const title = str(body.title, 160); if (!title) throw Object.assign(new Error('title required'), { status: 400 });
    const patch = typeof body.patch === 'string' ? body.patch.replace(/\r\n/g, '\n').slice(0, 512 * 1024) : '';
    const files = (Array.isArray(body.files) ? body.files : typeof body.files === 'string' ? body.files.split(/[\s,]+/) : []).map(f => str(f, 300)).filter(Boolean).slice(0, 50);
    const cid = 'cr-' + Date.now().toString(36).slice(-5) + crypto.randomBytes(2).toString('hex');
    if (patch.trim()) fs.writeFileSync(store.p(patchRel(cid)), patch.endsWith('\n') ? patch : patch + '\n');
    const c = saveChange({ id: cid, title, status: 'open', by: me.id, created: new Date().toISOString(), files, hasPatch: !!patch.trim(), description: str(body.description, 20000) });
    postChat('general', 'tribecode', `📱 ${me.name} needs a desktop: **${title}**${c.hasPatch ? ' (patch attached)' : ''}. Take it in Repo.`);
    bus.notify({ type: 'change-request', priority: 'normal', title: `${me.name} needs a desktop`, body: title, view: 'repo', ref: cid });
    return loadChange(cid);
  }
  function claimChange(cid, me) {
    const c = loadChange(cid); if (!c) throw Object.assign(new Error('change request not found'), { status: 404 });
    if (c.status === 'done') throw Object.assign(new Error('already done'), { status: 409 });
    if (c.claimedBy && c.claimedBy !== me.id) throw Object.assign(new Error(`already taken by ${nameOf(c.claimedBy)}`), { status: 409 });
    if (c.claimedBy === me.id) return c;
    const task = createTask({ title: `Change: ${c.title}`, by: me.id, assignee: me.id, status: 'doing', source: 'change',
      body: `From change request **${c.id}** by ${nameOf(c.by)}.${c.hasPatch ? ` A patch is attached: apply it from Repo → Change requests (branch \`change/${c.id}\`).` : ''}\n\n${c.description || ''}` });
    Object.assign(c, { status: 'claimed', claimedBy: me.id, claimedAt: new Date().toISOString(), task: task.id });
    saveChange(c);
    postChat('general', 'tribecode', `${me.name} took **${c.title}** from ${nameOf(c.by)}.`);
    bus.notify({ type: 'change-claimed', to: [c.by], priority: 'normal', title: `${me.name} took your change`, body: c.title, view: 'repo', ref: c.id });
    return loadChange(cid);
  }
  async function applyChange(cid, me) {
    const c = loadChange(cid); if (!c) throw Object.assign(new Error('change request not found'), { status: 404 });
    if (me.role !== 'host' && c.claimedBy !== me.id) throw Object.assign(new Error('only the host or whoever took it can apply the patch'), { status: 403 });
    if (!c.patch) throw Object.assign(new Error('no patch attached'), { status: 400 });
    if (!enabled()) throw Object.assign(new Error('no project repo: start the server with --repo'), { status: 400 });
    const branch = `change/${cid}`;
    if (await G.branchExists(branch)) throw Object.assign(new Error(`${branch} already exists`), { status: 409 });
    const main = await G.mainBranch();
    const pf = store.p(patchRel(cid));
    let result;
    try {
      result = await G.locked(() => G.withWorktree(main, async dir => {
        const r = await G.gitTry(['apply', '--3way', '--whitespace=nowarn', pf], dir);
        if (r.code !== 0) throw Object.assign(new Error(`git apply --3way failed:\n${(r.err || r.out).split('\n').slice(0, 12).join('\n')}`), { status: 422 });
        await G.git(['add', '-A'], dir);
        const author = nameOf(c.by).replace(/[<>]/g, '');
        await G.git([...(await G.identity()), 'commit', '--quiet', '-m', `${c.title}\n\nChange request ${cid} from ${author}, applied by ${me.name} via TribeCode.`, `--author=${author} <${c.by}@tribecode.local>`], dir);
        return { sha: await G.git(['rev-parse', '--short', 'HEAD'], dir), files: (await G.git(['diff', '--name-only', 'HEAD~1', 'HEAD'], dir)).split('\n').filter(Boolean) };
      }, { branch }));
    } catch (e) {
      await G.gitTry(['branch', '-D', branch]);
      c.applyError = e.message.slice(0, 2000); saveChange(c);
      log('apply-failed', `Patch for "${c.title}" did not apply`, { notify: 'repo', priority: 'normal', to: [me.id], extra: { ref: cid, detail: e.message.split('\n')[0] } });
      throw Object.assign(new Error(e.message), { status: e.status || 422 });
    }
    Object.assign(c, { branch, appliedBy: me.id, appliedAt: new Date().toISOString(), commit: result.sha, applyError: undefined });
    saveChange(c);
    log('apply', `Applied "${c.title}" into ${branch} (${result.sha})`, { notify: 'repo', priority: 'low', extra: { ref: cid, detail: result.files.join(', ') } });
    poll({ force: true }).catch(() => {});
    return { change: loadChange(cid), branch, commit: result.sha, files: result.files };
  }
  function finishChange(cid, me) {
    const c = loadChange(cid); if (!c) throw Object.assign(new Error('change request not found'), { status: 404 });
    if (![c.by, c.claimedBy].includes(me.id) && me.role !== 'host') throw Object.assign(new Error('only the requester, whoever took it, or the host can close it'), { status: 403 });
    c.status = 'done'; c.done = new Date().toISOString(); c.doneBy = me.id; saveChange(c);
    if (c.task) { const t = loadTasks().find(x => x.id === c.task); if (t && t.status !== 'done') { t.status = 'done'; t.updated = c.done; t.updatedBy = me.id; saveTask(t); } }
    if (c.by !== me.id) bus.notify({ type: 'change-done', to: [c.by], priority: 'normal', title: `${me.name} finished your change`, body: c.title, view: 'repo', ref: c.id });
    return loadChange(cid);
  }

  // ---------- context file + integrator ----------
  const context = makeContext({ store, repo: () => (enabled() ? repo : null), settings: () => settings, tribe, readVision, presence, loadTasks, nameOf, board, claims,
    changes: () => listChanges(), repoStatus: () => status, broadcast, file: CONTEXT_FILE, extra: contextExtra });
  const integrator = makeIntegrator({ repo, enabled, G, store, settings: () => settings, board, nameOf, getMembers, listChanges, loadTasks, drift, log, postChat, poll,
    markPush: () => { settings.lastPush = new Date().toISOString(); saveSettings(); } });

  // ---------- HTTP ----------
  async function route(req, res, { m, a, b, c, me, readBody, send, fail }) {
    const ro = me.role === 'spectator';
    if (a === 'context' && m === 'GET') {
      const md = await context.now();
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
      return res.end(md);
    }
    if (a === 'repo') {
      if (m === 'GET' && !b) return send(res, 200, { status, settings: publicSettings(), activity: activity(40), master: integrator.masterAgent(), gitVersion: (await G.gitVersion()).join('.') });
      if (m === 'GET' && b === 'activity') return send(res, 200, { activity: activity(200) });
      if (m === 'GET' && b === 'branches') return send(res, 200, enabled() ? await integrator.collect() : { enabled: false, branches: [], pairs: [] });
      if (m === 'POST' && b === 'refresh') { lastFetch = 0; return send(res, 200, { status: await poll({ force: true }) }); }
      if (b === 'settings' && (m === 'PUT' || m === 'PATCH')) {
        if (me.role !== 'host') return fail(res, 403, 'only the host changes repo settings');
        const s = updateSettings(await readBody(req));
        log('settings', `${me.name} updated repo settings (autopilot ${s.autopilot.enabled ? 'on' : 'off'})`, { notify: 'repo', priority: 'low' });
        return send(res, 200, { settings: s });
      }
      if (m === 'POST' && b === 'checks') {
        if (me.role !== 'host') return fail(res, 403, 'only the host runs checks from the app');
        const body = await readBody(req); return send(res, 200, await integrator.runChecks(str(body.branch, 200)));
      }
    }
    if (a === 'changes') {
      if (m === 'GET' && !b) return send(res, 200, { changes: listChanges() });
      if (m === 'GET' && b) { const x = loadChange(b); return x ? send(res, 200, { change: view(x) }) : fail(res, 404, 'change request not found'); }
      if (ro) return fail(res, 403, 'spectators are read-only');
      if (m === 'POST' && !b) return send(res, 200, { change: view(createChange(await readBody(req, 1024 * 1024), me)) });
      if (m === 'POST' && c === 'claim') return send(res, 200, { change: view(claimChange(b, me)) });
      if (m === 'POST' && c === 'apply') return send(res, 200, await applyChange(b, me));
      if (m === 'POST' && c === 'done') return send(res, 200, { change: view(finishChange(b, me)) });
    }
    if (a === 'integrations') {
      if (m === 'GET' && !b) return send(res, 200, { integrations: integrator.list() });
      if (m === 'POST' && c === 'integrate') {
        if (me.role !== 'host') return fail(res, 403, 'only the host or the integrator agent can integrate');
        return send(res, 200, await integrator.integrate(b, me));
      }
    }
    return null;
  }

  // ---------- MCP (merged into server/mcp.js TOOLS) ----------
  function mcpTools({ text, err, S, str: s }) {
    const T = integrator.mcpTools({ text, err, S, str: s });
    return {
      ...T,
      get_context: { description: 'Read TRIBE_CONTEXT.md: a compact, always-current brief of the tribe (who is on what, tasks, proposals, decisions, change requests, claims, repo state, recent chat, what changed). Read it at the start of a session.', inputSchema: S({}), run: async () => text(await context.now()) },
      list_changes: { description: 'List change requests ("needs a desktop") that phone users sent: title, status, who took it, and whether a patch is attached.', inputSchema: S({ status: { type: 'string', enum: ['open', 'claimed', 'done'] } }),
        run: ({ status: st }) => text(listChanges().filter(x => !st || x.status === st).map(x => ({ id: x.id, title: x.title, status: x.status, by: x.byName, takenBy: x.claimedByName, patch: x.hasPatch, files: x.files, branch: x.branch, description: (x.description || '').slice(0, 600) }))) },
      claim_change: { description: 'Take a change request: it is assigned to you, a linked task is created, and the requester is told. Then implement it (or apply its patch) on a branch.', inputSchema: S({ id: s('Change request id, e.g. cr-abc12') }, ['id']),
        run: ({ id }, me) => { const x = claimChange(id, me); return text(`You took ${x.id}: ${x.title}. Task ${x.task} is in Doing.${x.hasPatch ? '\nPatch:\n' + x.patch.slice(0, 20000) : ''}`); } },
    };
  }
  const mcp = { tools: mcpTools, instructions: me => integrator.instructions(me) };

  // ---------- boot ----------
  if (enabled()) {
    syncGitignore();
    setTimeout(() => poll().catch(() => {}), 300).unref();
    setInterval(() => poll().catch(() => {}), POLL_MS).unref();
  }
  context.start();

  return { route, mcp, status: () => status, poll, context, integrator, listChanges, createChange, claimChange, applyChange, finishChange, settings: () => publicSettings(), log };
};
