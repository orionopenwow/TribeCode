// Real build results (feat/build-feeds): a small runner on the host. When a project's home folder or repo has a check
// to run, it runs after each ship and on demand ("Run checks" on the Build status card, Flint's "run the checks",
// MCP checks_run), and the result goes to the same signal agents report builds with (server/dashband.js), so the Build
// status card and Needs attention show facts.
//
// What runs, first match:
//   1. tribe.json  { "check": ["node", "test.js"] }   an argument array (or one line, split on spaces and quotes; never a shell)
//                  optional "checkTimeout": seconds (5–600)
//   2. package.json scripts test / build / lint, each that exists, in that order, through npm
//   3. plain HTML: every local file a top-level page refers to exists, and every .js file parses (nothing is executed)
//
// Safety. Running a project's scripts runs its members' code on the host computer. So:
//   · Off by default for a project whose code other members can write; a lead turns it on (the setting says so plainly).
//     On by default only when the host is the only writer. The static HTML check runs nothing and is always allowed.
//   · A child process with an argument array (no shell line built from input), cwd = the project folder (resolved, must
//     be a real directory), a time limit that kills the whole process group, an output cap, and a clean environment:
//     PATH and a few harmless basics only. The server's environment (tokens, keys, TRIBE_*) is never passed on, and HOME
//     is an empty scratch folder. This is NOT a sandbox: the process still runs as the host's user.
//   · One run per project at a time, queued; one run at a time on the whole host.
//
// Saved in .tribe/checks/<pid>.json: { on: true|false|null, runs: [last 20, newest first, each with a capped log] }.
//
// HTTP (the request's project, X-Project):
//   GET  /api/checks            { settings, what, runs, running, queued, can, github? }
//   PUT  /api/checks { on }     a lead turns the runner on or off for this project
//   POST /api/checks/run        queue a run (writers)
//   GET  /api/checks/runs/<id>  one run with its log
// MCP: checks_status, checks_run.
// Test hooks: TRIBE_CHECK_TIMEOUT_MS, TRIBE_CHECK_MAX_OUTPUT, TRIBE_GITHUB_API.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const KEEP = 20, LOG_CAP = 48 * 1024;
const DEF_TIMEOUT = () => Number(process.env.TRIBE_CHECK_TIMEOUT_MS) || 120_000;
const MAX_OUT = () => Number(process.env.TRIBE_CHECK_MAX_OUTPUT) || 200 * 1024;
const SCRIPTS = ['test', 'build', 'lint'];
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, n);
// Anything that looks like a credential is cut out of a log before it is kept.
const scrub = s => String(s || '').replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]{8,}/g, '[token]').replace(/\b(sk-[A-Za-z0-9_-]{16,})/g, '[key]').replace(/\/\/[^/@\s]+@/g, '//');

// One line -> argv, with "double" and 'single' quotes. No shell: $VARS, pipes, && and globs are just text.
function argv(line) {
  const out = []; let cur = '', q = '', any = false;
  for (const ch of String(line || '')) {
    if (q) { if (ch === q) q = ''; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; any = true; continue; }
    if (/\s/.test(ch)) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
    cur += ch;
  }
  if (cur || any) out.push(cur);
  return out;
}
// The only environment a check gets.
function cleanEnv(home) {
  const keep = process.platform === 'win32' ? ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'PATHEXT', 'windir', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'] : ['PATH', 'LANG', 'LC_ALL', 'TZ'];
  const env = {}; for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  return { ...env, HOME: home, USERPROFILE: home, TMPDIR: home, TEMP: home, TMP: home, npm_config_cache: path.join(home, '.npm'), npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false', CI: '1', NODE_ENV: 'test', TRIBE_CHECK: '1', NO_COLOR: '1', FORCE_COLOR: '0' };
}
function npmCmd() {   // npm without a shell: node + npm-cli.js when it sits next to node, else npm on the PATH
  for (const rel of ['node_modules/npm/bin/npm-cli.js', '../lib/node_modules/npm/bin/npm-cli.js']) { const f = path.join(path.dirname(process.execPath), rel); if (fs.existsSync(f)) return [process.execPath, f]; }
  return ['npm'];
}
// Run one command. Resolves { code, output, timedOut, capped, ms, error? }; never rejects.
function runOne(cmd, args, { cwd, env, timeoutMs, maxOut }) {
  return new Promise(res => {
    const t0 = Date.now(), win = process.platform === 'win32'; let head = '', tail = '', total = 0, timedOut = false, done = false, child;
    const half = Math.floor(maxOut / 2);
    const add = d => { const s = d.toString('utf8'); total += s.length; if (head.length < half) { const room = half - head.length; head += s.slice(0, room); if (s.length > room) tail = (tail + s.slice(room)).slice(-half); } else tail = (tail + s).slice(-half); };
    const finish = (code, error) => { if (done) return; done = true; clearTimeout(timer); const capped = total > maxOut; res({ code, output: capped ? `${head}\n… ${total - head.length - tail.length} characters cut …\n${tail}` : head + tail, timedOut, capped, ms: Date.now() - t0, error }); };
    try { child = spawn(cmd, args, { cwd, env, shell: false, detached: !win, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return res({ code: 127, output: '', timedOut: false, capped: false, ms: 0, error: e.message }); }
    const kill = () => { try { if (win) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} } };
    const timer = setTimeout(() => { timedOut = true; kill(); setTimeout(() => finish(124), 1500).unref(); }, timeoutMs);
    child.stdout.on('data', add); child.stderr.on('data', add);
    child.on('error', e => finish(127, e.code === 'ENOENT' ? `${path.basename(cmd)} is not installed on the host` : e.message));
    child.on('close', code => finish(timedOut ? 124 : code == null ? 1 : code));
  });
}
// The lines a person needs from a failing log: the ones that say what failed, else the last few.
function failingLines(output, n = 5) {
  const lines = String(output || '').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  const hit = lines.filter(l => /\b(error|fail(ed|ing|ure)?|not ok|assert\w*|expected|exception|cannot find|is not defined|unexpected|missing)\b|✗|✖|×/i.test(l) && !/^\s*npm (ERR!|error) (A complete log|code|errno|Lifecycle)|^\s*at\s/.test(l));
  return (hit.length ? hit.slice(0, n) : lines.slice(-n)).map(l => clip(l.trim(), 200));
}

// ---------- the static check for plain HTML projects: nothing is executed ----------
function staticCheck(dir) {
  const problems = [], seenJs = new Set(); let pages = 0, files = 0;
  const inside = f => { const r = path.relative(dir, f); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
  const parse = (rel, src, isModule) => {
    let code = String(src).replace(/^#!.*\n/, '\n');
    if (isModule || /^\s*(import\s[\s\S]*?from\s|import\s*['"]|export\s)/m.test(code)) {   // a module: check it as a function body after blanking import/export lines
      code = code.replace(/^\s*import\s[^;\n]*;?\s*$/gm, '').replace(/^\s*import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]*['"];?/gm, '').replace(/^(\s*)export\s+default\s+/gm, '$1void ').replace(/^(\s*)export\s+(?=(async\s+)?function|class|const|let|var)/gm, '$1').replace(/^\s*export\s*\{[^}]*\}[^;\n]*;?\s*$/gm, '').replace(/\bimport\.meta\b/g, '({})');
      try { new vm.Script(`(async()=>{${code}\n})`, { filename: rel }); } catch (e) { problems.push(`${rel}: ${e.message}`); }
      return;
    }
    try { new vm.Script(code, { filename: rel }); } catch (e) { const ln = /:(\d+)\n/.exec(String(e.stack || '')); problems.push(`${rel}${ln ? `:${ln[1]}` : ''}: ${e.message}`); }
  };
  const js = (abs, isModule) => { if (seenJs.has(abs)) return; seenJs.add(abs); let st; try { st = fs.statSync(abs); } catch { return; } if (!st.isFile() || st.size > 2 << 20) return; files++; parse(path.relative(dir, abs).replace(/\\/g, '/'), fs.readFileSync(abs, 'utf8'), isModule); };
  let top = []; try { top = fs.readdirSync(dir).filter(f => /\.html?$/i.test(f)).slice(0, 40); } catch {}
  for (const f of top) {
    let html = ''; try { const st = fs.statSync(path.join(dir, f)); if (!st.isFile() || st.size > 2 << 20) continue; html = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    pages++;
    const body = html.replace(/<!--[\s\S]*?-->/g, '');
    const re = /<(script|link|img|source|audio|video|iframe)\b[^>]*?\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi; let m;
    while ((m = re.exec(body))) {
      const tag = m[1].toLowerCase(), ref = (m[2] ?? m[3] ?? m[4] ?? '').trim();
      if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{\{)/i.test(ref) || ref.includes('${')) continue;   // outside links, data:, templates
      const clean = decodeURI(ref.split(/[?#]/)[0]); if (!clean) continue;
      const abs = path.resolve(dir, clean.startsWith('/') ? '.' + clean : clean);
      if (!inside(abs)) { problems.push(`${f}: ${ref} points outside the project folder`); continue; }
      if (!fs.existsSync(abs)) { problems.push(`${f}: ${ref} is missing`); continue; }
      if (tag === 'script' && /\.m?js$/i.test(clean)) js(abs, /type\s*=\s*["']?module/i.test(m[0]) || /\.mjs$/i.test(clean));
    }
    const inl = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let k = 0;
    while ((m = inl.exec(body))) { if (/\bsrc\s*=/.test(m[1]) || !m[2].trim()) continue; const type = (/type\s*=\s*["']?([^"'\s>]+)/i.exec(m[1]) || [])[1] || ''; if (type && !/javascript|module|ecmascript/i.test(type)) continue; k++; files++; parse(`${f} (inline script ${k})`, m[2], /module/i.test(type)); }
  }
  for (const f of (() => { try { return fs.readdirSync(dir).filter(x => /\.m?js$/i.test(x)).slice(0, 60); } catch { return []; } })()) js(path.join(dir, f), /\.mjs$/i.test(f));
  const out = problems.length ? problems.slice(0, 60).join('\n') : `Checked ${pages} page${pages === 1 ? '' : 's'} and ${files} script${files === 1 ? '' : 's'}: every file is there and every script parses.`;
  return { code: problems.length ? 1 : 0, output: out, pages, files };
}

module.exports = function checks({ P, base, getMembers, signal, broadcast = () => {}, bus = null, nameOf = id => id, perms = null, pushAuth = null, syncLoad = null, log = () => {} }) {
  const file = pid => `.tribe/checks/${String(pid).replace(/[^\w-]/g, '_')}.json`;
  const load = pid => { const d = base.readJSON(file(pid), null) || {}; return { on: d.on === true || d.on === false ? d.on : null, runs: Array.isArray(d.runs) ? d.runs : [], setBy: d.setBy || null, setAt: d.setAt || null }; };
  const save = (pid, d) => { fs.mkdirSync(base.p('.tribe/checks'), { recursive: true }); d.runs = (d.runs || []).slice(0, KEEP); base.writeJSON(file(pid), d); };
  const projRole = (me, pid) => ((P.get(pid) || {}).members || {})[me.id];
  const lead = (me, pid) => !!me && me.role !== 'agent' && !me.guestUntil && (me.role === 'host' || projRole(me, pid) === 'host' || !!(perms && perms.can && perms.can(me, 'settings.edit', pid)));
  const writer = (me, pid) => !!me && !['spectator', 'guest'].includes(me.role) && !me.guestUntil && P.canSee(me, pid) && projRole(me, pid) !== 'spectator';

  // Can anyone but the host change this project's code? (A person, or someone else's agent.)
  function othersCanWrite(pid) {
    const host = getMembers().find(m => m.role === 'host');
    return getMembers().some(m => m !== host && !m.removed && !(m.role === 'agent' && host && m.owner === host.id) && writer(m, pid));
  }
  function dirOf(pid) {
    const p = P.get(pid); if (!p || !p.repo) return null;
    try { const real = fs.realpathSync(p.repo); return fs.statSync(real).isDirectory() ? real : null; } catch { return null; }
  }
  // What this project's check is: { kind: 'tribe'|'npm'|'static'|'none', label, steps: [{ name, cmd, args }], timeoutMs }
  function detect(pid) {
    const dir = dirOf(pid); if (!dir) return { kind: 'none', label: '', steps: [], why: 'This project has no folder on the host yet.' };
    const json = f => { try { const full = path.join(dir, f); const st = fs.lstatSync(full); if (!st.isFile() || st.size > 512 * 1024) return null; return JSON.parse(fs.readFileSync(full, 'utf8')); } catch { return null; } };
    const tj = json('tribe.json');
    if (tj && tj.check) {
      const a = (Array.isArray(tj.check) ? tj.check.map(x => String(x)) : argv(tj.check)).slice(0, 40).map(x => x.slice(0, 500));
      if (a.length && a[0] && !a.some(x => x.includes('\0'))) {
        const secs = Math.max(5, Math.min(600, Number(tj.checkTimeout) || 0));
        return { kind: 'tribe', label: a.join(' ').slice(0, 120), steps: [{ name: a.join(' ').slice(0, 120), cmd: a[0], args: a.slice(1) }], timeoutMs: tj.checkTimeout ? secs * 1000 : DEF_TIMEOUT() };
      }
    }
    const pj = json('package.json'), sc = (pj && pj.scripts && typeof pj.scripts === 'object') ? pj.scripts : {};
    const have = SCRIPTS.filter(k => typeof sc[k] === 'string' && sc[k].trim() && !/no test specified/i.test(sc[k]));
    if (have.length) { const [cmd, ...pre] = npmCmd(); return { kind: 'npm', label: have.map(k => `npm run ${k}`).join(', '), steps: have.map(k => ({ name: `npm run ${k}`, cmd, args: [...pre, 'run', '--silent', k] })), timeoutMs: DEF_TIMEOUT() }; }
    let html = false; try { html = fs.readdirSync(dir).some(f => /\.html?$/i.test(f)); } catch {}
    if (html) return { kind: 'static', label: 'Files exist and scripts parse', steps: [{ name: 'static check' }], timeoutMs: DEF_TIMEOUT() };
    return { kind: 'none', label: '', steps: [], why: 'Nothing to check yet: add a test script to package.json, a "check" to tribe.json, or an HTML page.' };
  }
  // May it run? The static check executes nothing, so it always may. Scripts need the switch (or a host-only project).
  function allowed(pid, what = detect(pid)) {
    const s = load(pid), shared = othersCanWrite(pid);
    if (what.kind === 'none') return { ok: false, shared, reason: what.why };
    if (what.kind === 'static') return { ok: true, shared, runsCode: false };
    if (s.on === false) return { ok: false, shared, runsCode: true, off: true, reason: 'Checks are turned off for this project.' };
    if (s.on === null && shared) return { ok: false, shared, runsCode: true, off: true, needsLead: true, reason: 'Checks are off: other members can change this project’s code, and running its scripts runs that code on the host computer. A lead can turn them on.' };
    return { ok: true, shared, runsCode: true };
  }

  // ---------- the queue: one run per project, one at a time on the host ----------
  const queue = [], running = new Map();   // queue: [{ pid, by, why, sha, id }]
  let busy = false;
  const pubRun = r => { const { log: _l, ...rest } = r; return rest; };
  const tell = pid => broadcast({ type: 'checks', project: pid });
  function enqueue(pid, me, { why = 'manual', sha = null } = {}) {
    const what = detect(pid), ok = allowed(pid, what);
    if (!ok.ok) throw fail(what.kind === 'none' ? 404 : 409, ok.reason);
    const waiting = queue.find(q => q.pid === pid);
    if (waiting) return { queued: true, already: true, id: waiting.id, position: queue.indexOf(waiting) + 1 };   // one waiting run per project is enough: it will see the newest files
    const job = { pid, by: me ? me.id : null, byName: me ? me.name : 'TribeCode', why, sha, id: 'ck-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date().toISOString() };
    queue.push(job); tell(pid); setImmediate(pump);
    return { queued: true, id: job.id, position: queue.length + (busy ? 1 : 0), running: running.has(pid) };
  }
  async function pump() {
    if (busy) return; const job = queue.shift(); if (!job) return;
    busy = true; running.set(job.pid, job); tell(job.pid);
    let run;
    try { run = await execute(job); } catch (e) { run = { id: job.id, at: job.at, ok: false, state: 'error', kind: 'none', label: '', ms: 0, lines: [clip(e.message, 200)], log: clip(e.message, 2000), by: job.by, byName: job.byName, why: job.why }; }
    finally { busy = false; running.delete(job.pid); }
    try { record(job, run); } catch (e) { log('checks: ' + e.message); }
    tell(job.pid); setImmediate(pump);
  }
  async function execute(job) {
    const pid = job.pid, what = detect(pid), ok = allowed(pid, what), dir = dirOf(pid);
    const head = { id: job.id, at: job.at, by: job.by, byName: job.byName, why: job.why, sha: job.sha || undefined, kind: what.kind, label: what.label };
    if (!ok.ok || !dir) return { ...head, ok: false, state: 'skipped', ms: 0, lines: [ok.reason || 'no folder'], log: ok.reason || '' };
    if (what.kind === 'static') { const t0 = Date.now(), r = staticCheck(dir); return { ...head, ok: r.code === 0, state: r.code === 0 ? 'pass' : 'fail', ms: Date.now() - t0, steps: [{ name: 'static check', ok: r.code === 0, ms: Date.now() - t0 }], lines: r.code === 0 ? [] : failingLines(r.output), log: clip(r.output, LOG_CAP) }; }
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tribe-check-')), env = cleanEnv(home), t0 = Date.now(), steps = []; let logText = '', state = 'pass', lines = [], capped = false;
    try {
      for (const st of what.steps) {
        const left = what.timeoutMs - (Date.now() - t0); if (left <= 0) { state = 'timeout'; break; }
        const r = await runOne(st.cmd, st.args, { cwd: dir, env, timeoutMs: left, maxOut: MAX_OUT() });
        const out = scrub(r.output); capped = capped || r.capped;
        logText += `$ ${st.name}\n${out}${out.endsWith('\n') || !out ? '' : '\n'}${r.error ? r.error + '\n' : ''}`;
        steps.push({ name: st.name, ok: r.code === 0, code: r.code, ms: r.ms });
        if (r.timedOut) { state = 'timeout'; lines = [`${st.name} was stopped after ${Math.round(what.timeoutMs / 1000)} s (the time limit).`, ...failingLines(out, 3)]; break; }
        if (r.error) { state = 'error'; lines = [`${st.name}: ${r.error}`]; break; }
        if (r.code !== 0) { state = 'fail'; lines = [`${st.name} failed (exit ${r.code})`, ...failingLines(out, 4)]; break; }
      }
    } finally { try { fs.rmSync(home, { recursive: true, force: true }); } catch {} }
    const keep = logText.length > LOG_CAP ? `${logText.slice(0, LOG_CAP / 4)}\n… cut …\n${logText.slice(-LOG_CAP * 3 / 4)}` : logText;
    return { ...head, ok: state === 'pass', state, ms: Date.now() - t0, steps, lines, capped: capped || logText.length > LOG_CAP || undefined, log: keep };
  }
  const secs = ms => (ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${Math.round(ms / 100) / 10} s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);
  function record(job, run) {
    const d = load(job.pid); d.runs.unshift(run); save(job.pid, d);
    if (run.state === 'skipped') return;
    const text = run.ok ? `${run.label || 'Checks'} passed in ${secs(run.ms)}` : `${run.lines.slice(0, 3).join(' · ') || 'Checks failed'} (${secs(run.ms)})`;
    try { signal(job.pid, { kind: 'build', ok: run.ok, text, by: job.by || 'tribecode', run: run.id, ms: run.ms, lines: run.lines.slice(0, 5), state: run.state, source: 'checks' }); } catch (e) { log('checks signal: ' + e.message); }
    // tell the person who shipped (or pressed Run) when it fails, and quietly when a ship's checks pass
    const who = job.by && getMembers().find(m => m.id === job.by), person = who && (who.role === 'agent' ? who.owner : who.id);
    if (bus && person && (!run.ok || job.why === 'ship')) try { P.inProject(job.pid, () => bus.notify({ type: 'build', priority: run.ok ? 'low' : 'high', to: [person], from: 'tribecode', title: run.ok ? `Checks passed on ${(P.get(job.pid) || {}).name || 'your project'}` : `Checks failed on ${(P.get(job.pid) || {}).name || 'your project'}`, body: clip(run.ok ? `${run.label} · ${secs(run.ms)}` : run.lines.slice(0, 3).join('\n'), 280), view: 'home', ref: run.id, project: job.pid })); } catch {}
  }
  // after a ship (server/sync.js): run when allowed, silently skip when not
  function onShipped(pid, me, entry) { try { enqueue(pid, me, { why: 'ship', sha: entry && entry.short }); } catch { /* off or nothing to check */ } }

  // ---------- GitHub check runs for a connected repo (optional; needs a token on the host) ----------
  const ghCache = new Map();
  async function github(pid) {
    try {
      const st = syncLoad && syncLoad(pid).settings; if (!st || st.kind !== 'github' || !st.repo) return null;
      const a = pushAuth ? pushAuth() : null, tok = a && a.env && a.env.TRIBE_GIT_TOKEN; if (!tok) return null;
      const hit = ghCache.get(pid); if (hit && Date.now() - hit.at < 60_000) return hit.v;
      const api = String(process.env.TRIBE_GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
      const r = await fetch(`${api}/repos/${st.repo}/commits/${encodeURIComponent(st.branch)}/check-runs?per_page=30`, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'User-Agent': 'TribeCode' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) { ghCache.set(pid, { at: Date.now(), v: null }); return null; }
      const d = await r.json(), list = (d.check_runs || []).map(c => ({ name: clip(c.name, 60), status: c.status, conclusion: c.conclusion, url: /^https:\/\//.test(String(c.html_url || '')) ? c.html_url : null }));
      const bad = list.filter(c => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(c.conclusion)), going = list.filter(c => c.status !== 'completed');
      const v = list.length ? { repo: st.repo, branch: st.branch, total: list.length, failing: bad.length, running: going.length, state: bad.length ? 'fail' : going.length ? 'running' : 'pass', runs: list.slice(0, 10) } : null;
      ghCache.set(pid, { at: Date.now(), v }); return v;
    } catch { return null; }
  }

  function view(pid, me) {
    const s = load(pid), what = detect(pid), ok = allowed(pid, what);
    return { settings: { on: s.on, setBy: s.setBy ? nameOf(s.setBy) : null, setAt: s.setAt },
      what: { kind: what.kind, label: what.label, why: what.why || null, runsCode: what.kind === 'tribe' || what.kind === 'npm' },
      allowed: ok.ok, shared: !!ok.shared, off: !!ok.off, needsLead: !!ok.needsLead, reason: ok.ok ? null : ok.reason,
      runs: s.runs.map(pubRun), last: s.runs.find(r => r.state !== 'skipped') ? pubRun(s.runs.find(r => r.state !== 'skipped')) : null,
      running: running.has(pid), queued: queue.filter(q => q.pid === pid).length,
      can: { run: writer(me, pid) && ok.ok, set: lead(me, pid) } };
  }
  function set(pid, me, on) {
    if (!lead(me, pid)) throw fail(403, 'Only the host or the project lead turns checks on or off.');
    const d = load(pid); d.on = on === null ? null : !!on; d.setBy = me.id; d.setAt = new Date().toISOString(); save(pid, d); tell(pid);
    return view(pid, me);
  }

  async function route(req, res, { m, b, c, me, readBody, send, fail: f }) {
    if (!me) return f(res, 401, 'not a member of this tribe');
    const pid = P.current() || P.defaultId();
    try {
      if (!b && m === 'GET') { const v = view(pid, me), gh = await github(pid); return send(res, 200, gh ? { ...v, github: gh } : v); }
      if (!b && (m === 'PUT' || m === 'PATCH')) { const body = await readBody(req); return send(res, 200, set(pid, me, body.on === null ? null : body.on)); }
      if (b === 'run' && !c && m === 'POST') { if (!writer(me, pid)) return f(res, 403, 'read-only'); return send(res, 200, enqueue(pid, me)); }
      if (b === 'runs' && c && m === 'GET') { const r = load(pid).runs.find(x => x.id === c); if (!r) return f(res, 404, 'no such run'); return send(res, 200, { run: r }); }
      return f(res, 404, 'not found');
    } catch (e) { return f(res, e.status || 500, e.message); }
  }
  const mcpTools = ({ text, err, S }) => ({
    checks_status: {
      description: 'The project’s real build results: what the host runs as its check (a tribe.json "check", package.json test/build/lint, or a static check of an HTML project), whether it may run, and the last runs with pass/fail, duration and the failing lines.',
      inputSchema: S({}),
      run: async (a, me) => { const pid = P.current() || P.defaultId(), v = view(pid, me), gh = await github(pid); return text({ check: v.what.label || null, kind: v.what.kind, allowed: v.allowed, reason: v.reason, running: v.running, queued: v.queued, last: v.last, runs: v.runs.slice(0, 5).map(r => ({ id: r.id, at: r.at, state: r.state, seconds: Math.round(r.ms / 100) / 10, lines: r.lines })), ...(gh ? { github: gh } : {}) }); },
    },
    checks_run: {
      description: 'Run the project’s checks on the host now (queued; one run per project at a time). The result lands in checks_status, the Build status card and Needs attention. Off by default on projects other members can write until a lead turns it on.',
      inputSchema: S({}),
      run: async (a, me) => { const pid = P.current() || P.defaultId(); if (!writer(me, pid)) return err('You can only read this project.'); try { const r = enqueue(pid, me, { why: 'agent' }); return text(r.already ? 'A run is already waiting. Check checks_status in a moment.' : `Queued (${r.id}). Check checks_status in a moment.`); } catch (e) { return err(e.message); } },
    },
  });
  return { route, view, detect, allowed, enqueue, set, onShipped, mcpTools, load, idle: () => !busy && !queue.length };
};
module.exports.argv = argv;
module.exports.cleanEnv = cleanEnv;
module.exports.staticCheck = staticCheck;
module.exports.failingLines = failingLines;
module.exports.runOne = runOne;
