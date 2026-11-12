// Shared repo workspace for project rooms: start a project from a folder (local path, browser upload,
// or a git URL to clone), make a folder a git repo, give each member their own worktree + branch, and
// commit/push as that member. All git work runs on the host with execFile + argument arrays.
//
// Identity: commits made through TribeCode are authored by the member who asked (name + email from
// their profile; default <name>@users.noreply.tribecode). Pushes use the host's own git credentials,
// unless the member saved a personal GitHub token, which is then supplied through a credential
// helper that reads it from the environment of that one git process. Tokens live in
// .tribe/secrets/<member>.json (0600), are never sent to clients and never logged.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./gitutil');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.next', '.nuxt', '.cache', '.venv', 'venv', '__pycache__', '.gradle', '.idea', 'Pods', 'DerivedData', '.trees']);
const UPLOAD_CAP = 25 * 1024 * 1024;
const GITIGNORE = ['node_modules/', 'dist/', 'build/', 'out/', '.next/', '.cache/', '.venv/', 'venv/', '__pycache__/', 'target/', '.DS_Store', 'Thumbs.db', '*.log', '.env', '.env.*', '.trees/', ''].join('\n');
const fail = (status, msg) => Object.assign(new Error(msg), { status });

module.exports = function workspace({ store, slug }) {
  const NOPROMPT = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  const git = (args, cwd, opts = {}) => run('git', args, { cwd, timeout: opts.timeout || 60_000, env: { ...NOPROMPT, ...(opts.env || {}) } });
  async function must(args, cwd, opts) { const r = await git(args, cwd, opts); if (r.code) throw fail(422, (r.err || r.out || `git ${args[0]} failed`).split('\n').slice(0, 4).join('\n')); return r.out; }

  const isRepo = dir => { try { return fs.existsSync(path.join(dir, '.git')); } catch { return false; } };
  async function remoteOf(dir) { const r = await git(['remote', 'get-url', 'origin'], dir); return r.code ? null : r.out.replace(/\/\/[^/@]+@/, '//'); }
  async function describe(dir) {
    if (!dir) return { exists: false };
    let st; try { st = fs.statSync(dir); } catch { return { exists: false, path: dir }; }
    if (!st.isDirectory()) return { exists: false, path: dir, error: 'not a folder' };
    return { exists: true, path: dir, name: path.basename(dir), git: isRepo(dir), remote: isRepo(dir) ? await remoteOf(dir) : null };
  }

  // ---------- identity ----------
  const emailOf = m => (m.email && /^[^\s@<>]+@[^\s@<>]+$/.test(m.email) ? m.email : `${slug(m.name || m.id)}@users.noreply.tribecode`);
  const nameOf = m => String(m.name || m.id).replace(/[<>\n]/g, '').slice(0, 64) || 'TribeCode';
  const identity = m => ['-c', `user.name=${nameOf(m)}`, '-c', `user.email=${emailOf(m)}`];

  // ---------- secrets (per-member GitHub token) ----------
  const secretRel = mid => `.tribe/secrets/${String(mid).replace(/[^\w-]/g, '_')}.json`;
  function readSecret(mid) { return store.readJSON(secretRel(mid), {}) || {}; }
  function writeSecret(mid, data) {
    const dir = store.p('.tribe/secrets'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(dir, 0o700); } catch {}
    const file = store.p(secretRel(mid));
    if (!data || !Object.keys(data).length) { try { fs.unlinkSync(file); } catch {} return; }
    fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 }); try { fs.chmodSync(file, 0o600); } catch {}
  }
  const hasToken = mid => !!readSecret(mid).githubToken;
  // git reads the token from this process's environment; it is never on a command line or in a config file.
  function pushEnv(mid) {
    const t = readSecret(mid).githubToken; if (!t) return { args: [], env: {} };
    return { args: ['-c', 'credential.helper=', '-c', 'credential.helper=!f() { test "$1" = get && echo username=x-access-token && echo "password=$TRIBE_GIT_TOKEN"; }; f'], env: { TRIBE_GIT_TOKEN: t } };
  }

  // ---------- GitHub sign-in on the host (gh CLI, optional) ----------
  let ghCache = null, ghAt = 0;
  async function ghStatus(force) {
    if (!force && Date.now() - ghAt < 60_000 && ghCache) return ghCache;
    ghAt = Date.now();
    const r = await run('gh', ['auth', 'status', '--hostname', 'github.com'], { timeout: 8000, env: NOPROMPT });
    const text = `${r.out}\n${r.err}`;
    const m = text.match(/Logged in to github\.com (?:account|as) ([\w-]+)/i);
    ghCache = r.code === 127 || /ENOENT|not found/i.test(r.err) && !m ? { installed: false, signedIn: false } : { installed: true, signedIn: !!m, user: m ? m[1] : null };
    return ghCache;
  }

  // ---------- starting a project ----------
  async function makeRepo(dir, member) {
    if (isRepo(dir)) return { created: false };
    const gi = path.join(dir, '.gitignore');
    if (!fs.existsSync(gi)) fs.writeFileSync(gi, GITIGNORE);
    await must(['init', '-q', '-b', 'main'], dir);
    await must(['add', '-A'], dir);
    const has = (await git(['diff', '--cached', '--quiet'], dir)).code !== 0;
    await must([...identity(member), 'commit', '-q', '--allow-empty', '-m', has ? 'Initial commit (via TribeCode)' : 'Start project (via TribeCode)'], dir);
    return { created: true };
  }
  // Accept https/http/ssh/git@ URLs and local paths to a repo (file://, /abs/path.git). Never ext:: or options.
  function okUrl(u) {
    u = String(u || '').trim();
    if (!u || u.startsWith('-') || /^ext::|^fd::/i.test(u) || /\s/.test(u)) return null;
    if (/^(https|ssh):\/\/[^\s]+$/i.test(u) || /^[\w.-]+@[\w.-]+:[^\s]+$/.test(u) || path.isAbsolute(u)) return u;
    if (/^[\w.-]+\/[\w.-]+$/.test(u)) return `https://github.com/${u}`;   // owner/repo shorthand
    return null;
  }
  const repoNameFromUrl = u => path.basename(String(u).replace(/[/]+$/, '').replace(/\.git$/, '')).replace(/[^\w.-]/g, '') || 'project';
  async function clone(url, dest) {
    const u = okUrl(url); if (!u) throw fail(400, 'That does not look like a git URL (https://github.com/you/repo, git@github.com:you/repo.git, or a path)');
    if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw fail(409, 'workspace folder already exists');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const r = await git(['-c', 'protocol.ext.allow=never', 'clone', '--quiet', '--', u, dest], path.dirname(dest), { timeout: 10 * 60_000 });
    if (r.code) { try { fs.rmSync(dest, { recursive: true, force: true }); } catch {} throw fail(422, `git clone failed: ${(r.err || r.out).split('\n').filter(Boolean).slice(-2).join(' ')}`); }
    return dest;
  }
  // files: [{ path: 'src/a.js', data: base64 }]. Paths stay inside dest; ignored folders are skipped.
  function writeUpload(dest, files) {
    if (!Array.isArray(files) || !files.length) throw fail(400, 'no files');
    let total = 0, written = 0, skipped = 0; const root = path.resolve(dest);
    const plan = [];
    for (const f of files) {
      const rel = String(f && f.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
      const parts = rel.split('/').filter(Boolean);
      if (!parts.length || parts.some(p => p === '..' || p === '.' || p.includes('\0'))) { skipped++; continue; }
      if (parts.slice(0, -1).some(p => SKIP_DIRS.has(p))) { skipped++; continue; }
      const buf = Buffer.from(String(f.data || ''), 'base64'); total += buf.length;
      if (total > UPLOAD_CAP) throw fail(413, 'That folder is over 25 MB (after skipping node_modules, .git and build folders). Drop it in the desktop app, paste its path on the host, or push it to GitHub and paste the URL.');
      const full = path.resolve(root, ...parts);
      if (!full.startsWith(root + path.sep)) { skipped++; continue; }
      plan.push([full, buf]);
    }
    fs.mkdirSync(root, { recursive: true });
    for (const [full, buf] of plan) { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, buf); written++; }
    return { written, skipped, bytes: total };
  }

  // ---------- per-member worktrees ----------
  const branchOf = mid => `tribe/${String(mid).replace(/[^\w-]/g, '-')}`;
  const treeOf = (repo, mid) => path.join(repo, '.trees', String(mid).replace(/[^\w-]/g, '-'));
  function exclude(repo) {   // keep .trees/ out of `git status` without touching tracked files
    try { const f = path.join(repo, '.git', 'info', 'exclude'); fs.mkdirSync(path.dirname(f), { recursive: true }); const t = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; if (!t.split('\n').includes('/.trees/')) fs.appendFileSync(f, (t && !t.endsWith('\n') ? '\n' : '') + '/.trees/\n'); } catch {}
  }
  async function myBranch(repo, member) {
    const dir = treeOf(repo, member.id), branch = branchOf(member.id);
    if (!fs.existsSync(dir)) return { exists: false, branch, path: dir };
    const head = await git(['log', '-1', '--format=%h%x1f%an%x1f%s'], dir);
    const dirty = (await git(['status', '--porcelain'], dir)).out.split('\n').filter(Boolean).length;
    const [sha, author, subject] = head.out.split('\x1f');
    return { exists: true, branch, path: dir, head: sha ? { sha, author, subject } : null, dirty };
  }
  async function giveBranch(repo, member) {
    if (!isRepo(repo)) throw fail(400, 'this project has no git repo yet');
    exclude(repo);
    const dir = treeOf(repo, member.id), branch = branchOf(member.id);
    if (fs.existsSync(dir)) return myBranch(repo, member);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const exists = (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], repo)).code === 0;
    await must(['worktree', 'add', '--quiet', ...(exists ? [dir, branch] : ['-b', branch, dir, 'HEAD'])], repo);
    return myBranch(repo, member);
  }
  async function commitAs(repo, member, message) {
    const dir = treeOf(repo, member.id);
    if (!fs.existsSync(dir)) throw fail(400, 'get your branch first');
    await must(['add', '-A'], dir);
    if ((await git(['diff', '--cached', '--quiet'], dir)).code === 0) throw fail(409, 'nothing to commit');
    const before = (await git(['rev-parse', '--short', 'HEAD'], dir)).out || null;
    await must([...identity(member), 'commit', '-q', '-m', String(message || '').trim().slice(0, 2000) || `Work by ${nameOf(member)}`], dir);
    const after = (await git(['rev-parse', '--short', 'HEAD'], dir)).out;
    // Gists (server/flow.js): a commit becomes a short summary in chat instead of a raw diff.
    if (api.onCommit) { try { api.onCommit({ repo, dir, member, branch: branchOf(member.id), before, after }); } catch {} }
    return myBranch(repo, member);
  }
  async function pushAs(repo, member) {
    const dir = treeOf(repo, member.id), branch = branchOf(member.id);
    if (!fs.existsSync(dir)) throw fail(400, 'get your branch first');
    if (!(await remoteOf(dir))) throw fail(400, 'this repo has no origin remote; everything stays local (that works too)');
    const { args, env } = pushEnv(member.id);
    const r = await git([...args, 'push', '--quiet', '-u', 'origin', `${branch}:${branch}`], dir, { env, timeout: 120_000 });
    if (r.code) throw fail(422, `push failed: ${(r.err || r.out).replace(/x-access-token:[^@\s]+@/g, '').split('\n').filter(Boolean).slice(-2).join(' ')}`);
    return { pushed: true, branch, as: hasToken(member.id) ? 'your GitHub token' : 'the host\'s git credentials' };
  }

  const api = { isRepo, describe, remoteOf, makeRepo, clone, okUrl, repoNameFromUrl, writeUpload, giveBranch, myBranch, commitAs, pushAs, ghStatus, emailOf,
    readSecret, writeSecret, hasToken, identity, pushEnv, git, GITIGNORE, NOPROMPT, SKIP_DIRS: [...SKIP_DIRS], UPLOAD_CAP, onCommit: null };
  return api;
};
