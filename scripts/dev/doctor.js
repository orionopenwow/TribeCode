#!/usr/bin/env node
// npm run dev:doctor — is this machine ready to develop and test TribeCode?
// Checks node, python + Playwright, Chrome, free ports, git identity, the four version files and sw.js,
// the Tauri config (scripts/check-tauri-config.py), and leftover test data. Exit code 1 if anything is red.
'use strict';
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const rows = [];
const add = (level, what, detail) => rows.push({ level, what, detail });
const ok = (w, d) => add('ok', w, d), warn = (w, d) => add('warn', w, d), bad = (w, d) => add('FAIL', w, d);
const run = (cmd, args, o = {}) => { const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 60000, ...o }); return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim(), err: r.error }; };
const portFree = port => new Promise(res => { const s = net.createServer(); s.once('error', () => res(false)); s.listen(port, '0.0.0.0', () => s.close(() => res(true))); });

(async () => {
  // node
  const major = parseInt(process.versions.node, 10);
  major >= 20 ? ok('node', process.version) : bad('node', `${process.version}: TribeCode needs Node 20 or newer`);

  // python + playwright
  const py = run('python3', ['-c', 'import playwright, sys; from importlib.metadata import version; print(sys.version.split()[0], version("playwright"))']);
  py.code === 0 ? ok('python3 + playwright', py.out) : bad('python3 + playwright', 'pip install playwright (the tests drive Chrome through it)');

  // chrome
  const chrome = ['/usr/bin/google-chrome', process.env.CHROME_PATH].filter(Boolean).find(p => fs.existsSync(p));
  if (chrome) { const v = run(chrome, ['--version']); ok('chrome', `${chrome} (${v.out})`); }
  else bad('chrome', 'the tests use /usr/bin/google-chrome; install Google Chrome there');

  // git
  const email = run('git', ['config', 'user.email']).out;
  email === 'noreply@anthropic.com' ? ok('git user.email', email) : warn('git user.email', `${email || '(unset)'}: commits from Claude sessions use noreply@anthropic.com`);
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out;
  const dirty = run('git', ['status', '--porcelain']).out.split('\n').filter(Boolean);
  ok('git branch', `${branch}${dirty.length ? `, ${dirty.length} uncommitted change(s)` : ', clean'}`);
  const shots = run('git', ['status', '--porcelain', '--', 'docs/screenshots']).out.split('\n').filter(Boolean);
  if (shots.length) warn('docs/screenshots', `${shots.length} file(s) changed by test runs: npm run dev:reset -- --yes restores them`);

  // versions
  try {
    const v = {
      'package.json': JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
      'app/package.json': JSON.parse(fs.readFileSync(path.join(ROOT, 'app/package.json'), 'utf8')).version,
      'tauri.conf.json': JSON.parse(fs.readFileSync(path.join(ROOT, 'app/src-tauri/tauri.conf.json'), 'utf8')).version,
      'Cargo.toml': (fs.readFileSync(path.join(ROOT, 'app/src-tauri/Cargo.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m) || [])[1],
    };
    const uniq = [...new Set(Object.values(v))];
    uniq.length === 1 ? ok('version files', `all four say ${uniq[0]}`) : bad('version files', Object.entries(v).map(([k, x]) => `${k}=${x}`).join(' '));
    const cl = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    cl.includes(`## v${v['package.json']}`) ? ok('CHANGELOG', `has v${v['package.json']}`) : warn('CHANGELOG', `no "## v${v['package.json']}" entry yet`);
    const cache = (fs.readFileSync(path.join(ROOT, 'app/ui/sw.js'), 'utf8').match(/const CACHE = '([^']+)'/) || [])[1];
    ok('sw.js cache', cache || '?');
  } catch (e) { bad('version files', e.message); }

  // tauri config
  const tc = run('python3', [path.join(ROOT, 'scripts', 'check-tauri-config.py')]);
  tc.code === 0 ? ok('tauri.conf.json', (tc.out.split('\n').pop() || 'valid').slice(0, 100)) : bad('tauri.conf.json', tc.out.split('\n').slice(-3).join(' | ').slice(0, 300));

  // ports
  const busy = [];
  for (const p of [4747, 4848, 4850, ...Array.from({ length: 9 }, (_, i) => 4951 + i)]) if (!(await portFree(p))) busy.push(p);
  if (!busy.length) ok('ports', '4747 (app), 4848 (desktop IPC), 4850 (Open Space), 4951-4959 (dev tools) are free');
  else warn('ports', `in use: ${busy.join(', ')}${busy.includes(4747) ? ' (4747: a TribeCode server is probably running; fine for npm start, tests use their own ports)' : ''}`);

  // leftovers
  let tribes = 0; try { tribes = fs.readdirSync(os.tmpdir()).filter(n => /^tribe-/.test(n)).length; } catch {}
  tribes > 200 ? warn('temp tribes', `${tribes} leftover /tmp/tribe-* folders: npm run dev:reset`) : ok('temp tribes', `${tribes} in ${os.tmpdir()}`);
  const free = run('df', ['-Pk', os.tmpdir()]).out.split('\n')[1];
  if (free) { const avail = +free.split(/\s+/)[3] / 1048576; avail < 2 ? warn('disk', `${avail.toFixed(1)} GB free in ${os.tmpdir()}`) : ok('disk', `${avail.toFixed(1)} GB free in ${os.tmpdir()}`); }

  // optional tools
  for (const [bin, why] of [['cloudflared', 'public links without Tailscale (downloaded on demand)'], ['tailscale', 'Tailscale Funnel public links'], ['gh', 'GitHub CLI login for the autopilot']]) {
    const r = run('sh', ['-c', `command -v ${bin}`]);
    r.code === 0 ? ok(bin, r.out) : add('info', bin, `not installed (optional: ${why})`);
  }

  const w = Math.max(...rows.map(r => r.what.length));
  console.log('dev:doctor\n');
  for (const r of rows) console.log(`  ${r.level.padEnd(4)}  ${r.what.padEnd(w)}  ${r.detail || ''}`);
  const fails = rows.filter(r => r.level === 'FAIL').length, warns = rows.filter(r => r.level === 'warn').length;
  console.log(`\n${fails ? fails + ' problem(s)' : 'Ready'}${warns ? `, ${warns} warning(s)` : ''}.`);
  process.exit(fails ? 1 : 0);
})();
