// Small git/shell helpers shared by the repo autopilot, change requests and the integrator.
// Everything that touches the working tree in a risky way happens in a temporary worktree under
// the OS temp folder, which is always removed afterwards.
'use strict';
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Run a command; never rejects. Resolves { code, out, err }.
function run(cmd, args, { cwd, timeout = 60_000, env, input } = {}) {
  return new Promise(res => {
    const p = execFile(cmd, args, { cwd, timeout, maxBuffer: 16 << 20, env: env ? { ...process.env, ...env } : process.env, windowsHide: true },
      (e, out, err) => res({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: String(out || '').trim(), err: String(err || (e && !e.code ? e.message : '') || '').trim(), killed: !!(e && e.killed) }));
    if (input !== undefined) { p.stdin.end(input); }
  });
}

// Run a shell command line with a hard timeout (kills the whole process group). Resolves { code, output, timedOut, ms }.
function runShell(line, { cwd, timeoutMs = 600_000, env } = {}) {
  return new Promise(res => {
    const win = process.platform === 'win32';
    const t0 = Date.now(); let output = ''; let timedOut = false;
    const child = spawn(win ? 'cmd.exe' : 'sh', win ? ['/d', '/s', '/c', line] : ['-c', line],
      { cwd, env: { ...process.env, CI: '1', ...(env || {}) }, detached: !win, windowsHide: true });
    const add = d => { output += d; if (output.length > 400_000) output = output.slice(-200_000); };
    child.stdout.on('data', add); child.stderr.on('data', add);
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (win) child.kill(); else process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
    }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); res({ code: 127, output: output + '\n' + e.message, timedOut, ms: Date.now() - t0 }); });
    child.on('close', code => { clearTimeout(timer); res({ code: timedOut ? 124 : code ?? 1, output, timedOut, ms: Date.now() - t0 }); });
  });
}

const tail = (s, lines = 40, chars = 4000) => { const t = String(s || '').split('\n').slice(-lines).join('\n'); return t.length > chars ? t.slice(-chars) : t; };

module.exports = function gitutil(repo) {
  const gitTry = (args, cwd = repo, opts = {}) => run('git', args, { cwd, ...opts });
  async function git(args, cwd = repo, opts = {}) {
    const r = await gitTry(args, cwd, opts);
    if (r.code !== 0) throw Object.assign(new Error((r.err || r.out || `git ${args[0]} failed`).split('\n').slice(0, 6).join('\n')), { git: r });
    return r.out;
  }

  // One write operation at a time (worktrees, merges, commits, pushes).
  let chain = Promise.resolve();
  function locked(fn) { const p = chain.then(() => fn()); chain = p.catch(() => {}); return p; }

  let version = null;
  async function gitVersion() {
    if (version) return version;
    const m = (await gitTry(['--version'])).out.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    version = m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : [0, 0, 0];
    return version;
  }
  const hasMergeTree = async () => { const [a, b] = await gitVersion(); return a > 2 || (a === 2 && b >= 38); };

  let ident = null;
  // Commit identity flags: keep the repo's own identity if it has one, otherwise commit as TribeCode.
  async function identity() {
    if (ident) return ident;
    const email = (await gitTry(['config', 'user.email'])).out, name = (await gitTry(['config', 'user.name'])).out;
    ident = [...(name ? [] : ['-c', 'user.name=TribeCode']), ...(email ? [] : ['-c', 'user.email=tribecode@localhost'])];
    return ident;
  }

  async function mainBranch() {
    for (const b of ['main', 'master', 'trunk']) if ((await gitTry(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`])).code === 0) return b;
    return (await gitTry(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'main';
  }
  // Branch name -> a ref git can use (local branch first, then origin/<name>).
  async function resolveRef(name) {
    name = String(name || '').trim();
    if (!/^[\w./@-]{1,200}$/.test(name) || name.includes('..') || name.startsWith('-')) return null;
    for (const r of [`refs/heads/${name}`, `refs/remotes/origin/${name}`, `refs/remotes/${name}`])
      if ((await gitTry(['rev-parse', '--verify', '--quiet', r])).code === 0) return r.replace(/^refs\/(heads|remotes)\//, '');
    return null;
  }
  const branchExists = async b => (await gitTry(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`])).code === 0;
  async function hasRemote(name = 'origin') { return (await gitTry(['remote'])).out.split('\n').includes(name); }

  // Run fn(dir) inside a temporary worktree checked out at `ref` (optionally on a new branch). Always cleaned up.
  async function withWorktree(ref, fn, { branch } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tribe-wt-'));
    let added = false;
    try {
      await git(['worktree', 'add', '--quiet', ...(branch ? ['-b', branch] : ['--detach']), dir, ref]);
      added = true;
      return await fn(dir);
    } finally {
      if (added) await gitTry(['worktree', 'remove', '--force', dir]);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      await gitTry(['worktree', 'prune']);
    }
  }

  return { git, gitTry, locked, gitVersion, hasMergeTree, identity, mainBranch, resolveRef, branchExists, hasRemote, withWorktree, run, runShell, tail };
};
module.exports.run = run;
module.exports.runShell = runShell;
module.exports.tail = tail;
