// fix/p15-updates: the scripts behind updates (docs/UPDATES.md).
//  1. scripts/dev/buildid.js (what release.js runs): a fresh build id lands in package.json, app/package.json and the app
//     page's <meta name="tribe-build">; --check fails when they differ; release.js and stamp-ui.js --check use it.
//  2. scripts/update-from-source.js (the .bat files): own edits are stashed, never lost; own commits refuse with a clear
//     message and change nothing; it moves to origin/<branch>; an older server on the port is asked to stop with the
//     shared secret; it prints the version it is on now.
// Usage: node app/test/update_scripts_test.js
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawnSync, spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tribe-upd-'));
const sh = (cwd, cmd, ...a) => { const r = spawnSync(cmd, a, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };

// ---------- 1. build id stamping ----------
{
  const B = require(path.join(ROOT, 'scripts/dev/buildid.js'));
  const root = path.join(tmp, 'stamp');
  fs.mkdirSync(path.join(root, 'app/ui'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{\n  "name": "x",\n  "version": "1.2.3",\n  "private": true\n}\n');
  fs.copyFileSync(path.join(ROOT, 'app/package.json'), path.join(root, 'app/package.json'));
  fs.writeFileSync(path.join(root, 'app/ui/index.html'), '<head>\n<meta name="tribe-version" content="">\n<script src="a.js?v=1"></script></head>');
  const id = B.makeBuildId({ root: ROOT, now: new Date('2026-11-27T10:15:00Z') });
  assert.match(id, /^20261127T101500Z(-[0-9a-f]{7})?$/, id);
  B.stampBuild(id, { root });
  const b = B.readBuilds({ root });
  assert.deepStrictEqual(Object.values(b), [id, id, id], JSON.stringify(b));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).tribeBuild, id, 'package.json stays valid JSON');
  B.stampBuild('second-1', { root });   // a second release replaces, never duplicates
  const html = fs.readFileSync(path.join(root, 'app/ui/index.html'), 'utf8');
  assert.strictEqual((html.match(/tribe-build/g) || []).length, 1); assert.ok(html.includes('content="second-1"'));
  assert.strictEqual((fs.readFileSync(path.join(root, 'app/package.json'), 'utf8').match(/tribeBuild/g) || []).length, 1);
  assert.throws(() => B.stampBuild('bad id"<', { root }));
  // the repo itself agrees, and release.js / stamp-ui.js use it
  assert.strictEqual(spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev/buildid.js'), '--check']).status, 0, 'the repo build ids agree');
  const rel = fs.readFileSync(path.join(ROOT, 'scripts/dev/release.js'), 'utf8');
  assert.ok(/stampBuild\(require\('\.\/buildid'\)\.makeBuildId\(\)\)/.test(rel), 'release.js stamps a fresh build id');
  assert.ok(fs.readFileSync(path.join(ROOT, 'scripts/dev/stamp-ui.js'), 'utf8').includes("require('./buildid')"), 'stamp-ui --check checks the build id');
  assert.ok(fs.readFileSync(path.join(ROOT, 'scripts/bundle-server.js'), 'utf8').includes('__TRIBE_BUILD'), 'the desktop server bundle carries the build id');
  console.log('ok  build id: stamped in package.json, app/package.json and the page; replaced, not duplicated; checked');
}

// ---------- 2. update-from-source ----------
(async () => {
  const origin = path.join(tmp, 'origin.git'), seed = path.join(tmp, 'seed'), copy = path.join(tmp, 'copy'), home = path.join(tmp, 'home');
  const id = ['-c', 'user.name=t', '-c', 'user.email=t@x'];
  fs.mkdirSync(path.join(seed, 'scripts'), { recursive: true }); fs.mkdirSync(path.join(seed, 'app'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts/update-from-source.js'), path.join(seed, 'scripts/update-from-source.js'));
  const pkg = v => JSON.stringify({ name: 'x', version: v, tribeBuild: 'b-' + v }, null, 2);
  fs.writeFileSync(path.join(seed, 'app/package.json'), pkg('1.0.0')); fs.writeFileSync(path.join(seed, 'notes.txt'), 'one\n');
  sh(tmp, 'git', 'init', '-q', '--bare', '-b', 'main', origin);
  sh(seed, 'git', 'init', '-q', '-b', 'main'); sh(seed, 'git', 'add', '-A'); sh(seed, 'git', ...id, 'commit', '-qm', 'one');
  sh(seed, 'git', 'remote', 'add', 'origin', origin); sh(seed, 'git', 'push', '-q', 'origin', 'main');
  sh(tmp, 'git', 'clone', '-q', origin, copy);
  // a new release lands on GitHub
  fs.writeFileSync(path.join(seed, 'app/package.json'), pkg('1.1.0')); sh(seed, 'git', ...id, 'commit', '-qam', 'two'); sh(seed, 'git', 'push', '-q', 'origin', 'main');
  // an old server holds the port and only stops for the right secret
  fs.mkdirSync(home, { recursive: true }); const secret = 'c'.repeat(64); fs.writeFileSync(path.join(home, 'admin-secret'), secret);
  const port = 5600 + Math.floor(Math.random() * 300); let asked = [];
  const old = http.createServer((q, r) => {
    if (q.url === '/api/health') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify({ ok: true, tribe: 't', version: '1.0.0', build: 'b-1.0.0' })); }
    if (q.url === '/api/admin/shutdown' && q.method === 'POST') { asked.push(q.headers['x-tribe-admin']); const good = q.headers['x-tribe-admin'] === secret; r.writeHead(good ? 200 : 403); r.end(); if (good) setTimeout(() => old.close(), 50); old.closeAllConnections && setTimeout(() => old.closeAllConnections(), 60); return; }
    r.writeHead(404); r.end();
  });
  await new Promise(r => old.listen(port, '127.0.0.1', r));
  // your own edit to a tracked file
  fs.writeFileSync(path.join(copy, 'notes.txt'), 'my own edit\n');
  const run = (...a) => new Promise(res => { const c = spawn(process.execPath, [path.join(copy, 'scripts/update-from-source.js'), ...a], { cwd: copy, env: { ...process.env, TRIBECODE_HOME: home } }); let o = ''; c.stdout.on('data', d => { o += d; }); c.stderr.on('data', d => { o += d; }); c.on('exit', code => res({ code, o })); });
  let r = await run('--port', String(port));
  assert.strictEqual(r.code, 0, r.o);
  assert.match(r.o, /set aside, not lost: "tribecode-update/, r.o);
  assert.match(r.o, /TribeCode is now v1\.1\.0 \(build b-1\.1\.0\), updated from/, r.o);
  assert.match(r.o, /older TribeCode server \(v1\.0\.0 build b-1\.0\.0\)/, r.o);
  assert.deepStrictEqual(asked, [secret], 'asked the old server to stop, with the secret');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(copy, 'app/package.json'), 'utf8')).version, '1.1.0');
  assert.match(sh(copy, 'git', 'stash', 'list'), /tribecode-update/, 'the edit is in the stash');
  sh(copy, 'git', 'stash', 'pop'); assert.strictEqual(fs.readFileSync(path.join(copy, 'notes.txt'), 'utf8'), 'my own edit\n', 'and comes back');
  sh(copy, 'git', 'checkout', '--', 'notes.txt');
  console.log('ok  update-from-source: own edit stashed (and back with git stash pop), moved to the new release, old server asked to stop, version printed');
  // a commit of your own that GitHub doesn't have: nothing changes
  fs.writeFileSync(path.join(seed, 'notes.txt'), 'three\n'); sh(seed, 'git', ...id, 'commit', '-qam', 'three'); sh(seed, 'git', 'push', '-q', 'origin', 'main');
  fs.writeFileSync(path.join(copy, 'mine.txt'), 'x'); sh(copy, 'git', 'add', 'mine.txt'); sh(copy, 'git', ...id, 'commit', '-qm', 'mine');
  const head = sh(copy, 'git', 'rev-parse', 'HEAD');
  r = await run('--port', String(port));
  assert.strictEqual(r.code, 2, r.o); assert.match(r.o, /1 commit\(s\) of your own on main that aren't on GitHub, so nothing was changed/, r.o);
  assert.strictEqual(sh(copy, 'git', 'rev-parse', 'HEAD'), head, 'HEAD untouched');
  console.log('ok  update-from-source: commits of your own refuse with a clear message and change nothing');
  // the .bat files use it (no silent git pull --quiet left)
  for (const f of ['Tools/Live-Test.bat', 'Tools/Start-Test-Project.bat', 'scripts/desktop/Tools/Start-Stable-From-Source.bat']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(t.includes('update-from-source.js') && !/git pull --ff-only --quiet/.test(t), f);
  }
  assert.ok(fs.readFileSync(path.join(ROOT, 'scripts/desktop/Tools/Start-Stable-From-Source.bat'), 'utf8').includes('--serve'), 'stable from source restarts when asked');
  console.log('ok  the .bat files update through update-from-source.js');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('update_scripts_test: all ok');
})().catch(e => { console.error(e); process.exit(1); });
