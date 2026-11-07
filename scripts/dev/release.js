#!/usr/bin/env node
// npm run dev:release — get a release ready, without pushing anything.
//
//   node scripts/dev/release.js              next patch version (0.8.3 -> 0.8.4)
//   node scripts/dev/release.js 0.9.0        that version
//   node scripts/dev/release.js --check      only the checklist, change nothing
//   node scripts/dev/release.js --skip-tests bump and check, no smoke tests
//
// 1. Checks CHANGELOG.md has "## v<new>" with a **Phones** line (write the entry first: every release says
//    what changed on phones, even "unchanged").
// 2. Bumps the four version files (package.json, app/package.json, app/src-tauri/tauri.conf.json,
//    app/src-tauri/Cargo.toml) and the service worker's cache name in app/ui/sw.js, so phones pick up the new shell.
// 3. Runs bundle_test (the desktop sidecar bundle parses), the Tauri config check and a quick smoke subset.
// 4. Prints the git commands to commit, merge and push. A release is published by CI when the version in
//    tauri.conf.json changes on main; nothing here pushes or tags.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const f = p => path.join(ROOT, p);
const read = p => fs.readFileSync(f(p), 'utf8');
const cur = JSON.parse(read('package.json')).version;
const bumpPatch = v => v.split('.').map((x, i) => (i === 2 ? String(+x + 1) : x)).join('.');
const next = argv.find(a => /^\d+\.\d+\.\d+$/.test(a)) || (CHECK ? cur : bumpPatch(cur));
const problems = [];
const step = (ok, what) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) problems.push(what); return ok; };

console.log(`dev:release — ${CHECK ? 'checking' : `${cur} -> ${next}`}\n`);

// ---- 1. changelog ----
const cl = read('CHANGELOG.md');
const sec = (cl.split(/^## /m).find(s => s.startsWith(`v${next}\n`) || s.startsWith(`v${next} `)) || '');
step(!!sec, `CHANGELOG.md has a "## v${next}" section`);
if (sec) step(/\*\*Phones\*\*/.test(sec), `the v${next} entry has a **Phones** line`);
if (problems.length && !CHECK) { console.log(`\nWrite the CHANGELOG entry first (top of the file):\n\n## v${next}\n\n- What changed, in plain words\n- **Phones**: what changed at 390px (or "unchanged")\n`); process.exit(1); }

// ---- 2. bump ----
const files = {
  'package.json': s => s.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`),
  'app/package.json': s => s.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`),
  'app/src-tauri/tauri.conf.json': s => s.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`),
  'app/src-tauri/Cargo.toml': s => s.replace(/^(version\s*=\s*")[^"]+(")/m, `$1${next}$2`),
};
let swFrom = null, swTo = null;
if (!CHECK && next !== cur) {
  for (const [p, fn] of Object.entries(files)) fs.writeFileSync(f(p), fn(read(p)));
  const sw = read('app/ui/sw.js');
  const m = sw.match(/const CACHE = 'tribecode-shell-v(\d+)'/);
  if (m) { swFrom = +m[1]; swTo = swFrom + 1; fs.writeFileSync(f('app/ui/sw.js'), sw.replace(m[0], `const CACHE = 'tribecode-shell-v${swTo}'`)); }
}
const versions = {
  'package.json': JSON.parse(read('package.json')).version,
  'app/package.json': JSON.parse(read('app/package.json')).version,
  'app/src-tauri/tauri.conf.json': JSON.parse(read('app/src-tauri/tauri.conf.json')).version,
  'app/src-tauri/Cargo.toml': (read('app/src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m) || [])[1],
};
step(Object.values(versions).every(v => v === next), `all four version files say ${next}` + (Object.values(versions).every(v => v === next) ? '' : ` (${JSON.stringify(versions)})`));
if (swTo) step(true, `app/ui/sw.js cache tribecode-shell-v${swFrom} -> v${swTo}`);
else if (!CHECK) step(next === cur, 'app/ui/sw.js cache name bumped');

// ---- 3. checks ----
const run = (label, cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, TRIBE_NO_DOWNLOAD: '1', ...env }, timeout: 30 * 60000 });
  const ok = r.status === 0;
  step(ok, label);
  if (!ok) console.log(((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-12).map(l => '        ' + l).join('\n'));
  return ok;
};
run('bundle_test (the desktop sidecar bundle builds and parses)', process.execPath, ['app/test/bundle_test.js']);
run('Tauri config (scripts/check-tauri-config.py)', 'python3', ['scripts/check-tauri-config.py']);
if (!argv.includes('--skip-tests')) {
  run('smoke subset (ot, security, ui_smoke, smoke_live, guide, updater)', process.execPath,
    ['scripts/dev/test.js', '--jobs', '3', '--only', 'ot_test,security_test,ui_smoke,e2e_smoke_live,e2e_guide,e2e_updater', '--no-report']);
}

// ---- 4. next steps ----
console.log(problems.length ? `\n${problems.length} problem(s): fix them before releasing.` : '\nReady. Nothing was pushed. To ship it:');
if (!problems.length) console.log(`
  git add -A package.json app/package.json app/src-tauri/tauri.conf.json app/src-tauri/Cargo.toml app/ui/sw.js CHANGELOG.md
  git commit -m "v${next}: <one line>"          # with the Co-Authored-By / Claude-Session trailers
  git checkout dev && git merge --no-ff <your-branch> && git push origin dev
  git checkout main && git merge --no-ff dev -m "Release v${next}" && git push origin main
  # CI publishes the release (installers + latest.json) because tauri.conf.json changed on main.
  # Then update HANDOFF.md / docs/CONTEXT.md and check the Release workflow log.`);
process.exit(problems.length ? 1 : 0);
