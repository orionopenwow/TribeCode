#!/usr/bin/env node
// npm run dev:reset — clean out dev and test leftovers. Dry run by default: it lists what it would do.
//
//   node scripts/dev/reset.js                 show what would be cleaned (nothing is touched)
//   node scripts/dev/reset.js --yes           clean it
//   node scripts/dev/reset.js --yes --min-age 0     also leftovers from the last 30 minutes
//   node scripts/dev/reset.js --yes --tribe ~/TribeCode-test   ALSO reset that tribe folder (moved aside, not deleted)
//
// What it cleans (and nothing else):
//   1. Temp tribes that tests and dev:loop/dev:seed leave in the temp folder: /tmp/tribe-* and /tmp/tmp* folders that
//      hold a .tribe/ folder, plus test logs and failure screenshots (/tmp/*-fail-*.png, /tmp/smoke-server-*.log,
//      /tmp/tribe-devtest-*). Skipped: anything changed in the last --min-age minutes (default 30) and anything
//      a running process still uses (so parallel test runs are safe).
//   2. docs/screenshots changes the tests made (restored from git; new untracked PNGs removed).
//   3. Git worktrees under .claude/worktrees whose branch is already merged into dev, with no uncommitted changes,
//      not locked and not touched for 2 hours (`git worktree remove`), then those merged branches (`git branch -d`,
//      never -D). Branch dev, main and the current branch are never deleted.
//   4. Node caches inside this checkout (node_modules/.cache folders).
// Your own tribe folder is only touched when you pass it with --tribe, and then it is renamed to
// <folder>.reset-<time> so nothing is lost.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const YES = argv.includes('--yes') || argv.includes('-y');
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const MIN_AGE_MS = parseFloat(opt('--min-age', '30')) * 60000;
const WT_AGE_MS = parseFloat(opt('--worktree-age', '120')) * 60000;
const TRIBE = opt('--tribe', null);
const TMP = os.tmpdir();
const now = Date.now();

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const plan = [];   // { what, size, run }
const skipped = [];
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';

function du(p) {
  let n = 0;
  try {
    const st = fs.lstatSync(p);
    if (!st.isDirectory()) return st.size;
    for (const e of fs.readdirSync(p)) n += du(path.join(p, e));
  } catch {}
  return n;
}
function newestMtime(p, depth = 3) {
  let t = 0;
  try {
    const st = fs.lstatSync(p); t = st.mtimeMs;
    if (st.isDirectory() && depth > 0) for (const e of fs.readdirSync(p)) { if (e === 'node_modules' || e === '.git') continue; t = Math.max(t, newestMtime(path.join(p, e), depth - 1)); }
  } catch {}
  return t;
}
// Paths a running process mentions on its command line or has as its working directory.
function pathsInUse() {
  const used = [];
  for (const pid of fs.readdirSync('/proc').filter(d => /^\d+$/.test(d))) {
    try { used.push(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ')); } catch {}
    try { used.push(fs.readlinkSync(`/proc/${pid}/cwd`)); } catch {}
  }
  return used.join('\n');
}

// ---- 1. temp tribes, logs and failure screenshots ----
const inUse = process.platform === 'linux' ? pathsInUse() : '';
for (const name of fs.readdirSync(TMP)) {
  const p = path.join(TMP, name);
  let st; try { st = fs.lstatSync(p); } catch { continue; }
  const isTribe = st.isDirectory() && (/^tribe-/.test(name) || (/^tmp/.test(name) && fs.existsSync(path.join(p, '.tribe'))));
  const isLog = st.isFile() && (/-fail-.*\.png$/.test(name) || /^smoke-server-\d+\.log$/.test(name) || /^tribe-.*\.(log|txt)$/.test(name));
  if (!isTribe && !isLog) continue;
  if (now - (st.isDirectory() ? newestMtime(p, 2) : st.mtimeMs) < MIN_AGE_MS) { skipped.push(`${p} (changed in the last ${MIN_AGE_MS / 60000} min)`); continue; }
  if (inUse.includes(p)) { skipped.push(`${p} (a running process uses it)`); continue; }
  plan.push({ what: `temp ${isTribe ? 'tribe' : 'file'}  ${p}`, size: du(p), run: () => fs.rmSync(p, { recursive: true, force: true }) });
}

// ---- 2. docs/screenshots the tests rewrote ----
const shotsChanged = (tryGit('status', '--porcelain', '--', 'docs/screenshots') || '').split('\n').filter(Boolean);
if (shotsChanged.length) {
  plan.push({ what: `restore docs/screenshots (${shotsChanged.length} changed or new file(s) from test runs)`, size: 0, run: () => { tryGit('checkout', '--', 'docs/screenshots'); tryGit('clean', '-fq', '--', 'docs/screenshots'); } });
}

// ---- 3. merged worktrees and branches ----
const current = tryGit('rev-parse', '--abbrev-ref', 'HEAD');
const merged = new Set((tryGit('branch', '--merged', 'dev', '--format=%(refname:short)') || '').split('\n').filter(Boolean));
const keep = new Set(['dev', 'main', current]);
const wts = []; let cur = null;
for (const line of (tryGit('worktree', 'list', '--porcelain') || '').split('\n')) {
  if (line.startsWith('worktree ')) wts.push(cur = { path: line.slice(9) });
  else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
  else if (cur && line.startsWith('locked')) cur.locked = true;
  else if (cur && line === 'prunable') cur.prunable = true;
}
const removedBranches = new Set();
for (const w of wts) {
  if (!w.path.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`)) continue;
  if (path.resolve(w.path) === ROOT) continue;
  const why = !w.branch ? 'detached' : !merged.has(w.branch) ? 'not merged into dev' : w.locked ? 'locked (an agent may be using it)' : null;
  if (why) { skipped.push(`worktree ${w.path} [${w.branch || '-'}] (${why})`); continue; }
  let dirty = ''; try { dirty = execFileSync('git', ['-C', w.path, 'status', '--porcelain'], { encoding: 'utf8' }).trim(); } catch { dirty = w.prunable ? '' : 'unknown'; }
  if (dirty) { skipped.push(`worktree ${w.path} [${w.branch}] (uncommitted changes)`); continue; }
  if (now - newestMtime(w.path, 2) < WT_AGE_MS) { skipped.push(`worktree ${w.path} [${w.branch}] (used in the last ${WT_AGE_MS / 60000} min)`); continue; }
  plan.push({ what: `worktree ${w.path} [${w.branch}] (merged into dev)`, size: 0, run: () => git('worktree', 'remove', w.path) });
  if (!keep.has(w.branch)) { removedBranches.add(w.branch); plan.push({ what: `branch ${w.branch} (merged into dev)`, size: 0, run: () => git('branch', '-d', w.branch) }); }
}
// Merged branches with no worktree at all.
const checkedOut = new Set(wts.map(w => w.branch).filter(Boolean));
for (const b of merged) {
  if (keep.has(b) || checkedOut.has(b) || removedBranches.has(b)) continue;
  plan.push({ what: `branch ${b} (merged into dev, no worktree)`, size: 0, run: () => git('branch', '-d', b) });
}
plan.push({ what: 'git worktree prune (forget worktrees whose folder is gone)', size: 0, quiet: true, run: () => git('worktree', 'prune') });

// ---- 4. node caches in this checkout ----
(function findCaches(d, depth) {
  if (depth < 0) return;
  let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === '.git' || e.name === '.claude' || e.name === 'target') continue;
    const p = path.join(d, e.name);
    if (e.name === 'node_modules') { const c = path.join(p, '.cache'); if (fs.existsSync(c)) plan.push({ what: `node cache ${path.relative(ROOT, c)}`, size: du(c), run: () => fs.rmSync(c, { recursive: true, force: true }) }); continue; }
    findCaches(p, depth - 1);
  }
})(ROOT, 4);

// ---- 5. your own tribe folder, only when asked for ----
if (TRIBE) {
  const t = path.resolve(TRIBE.replace(/^~(?=$|[\\/])/, os.homedir()));
  if (!fs.existsSync(path.join(t, '.tribe'))) { console.error(`${t} is not a tribe folder (no .tribe inside); not touching it.`); process.exit(2); }
  const dest = `${t}.reset-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
  plan.push({ what: `tribe folder ${t} -> ${dest} (moved aside; stop its server first)`, size: du(t), run: () => fs.renameSync(t, dest) });
}

// ---- report / run ----
const total = plan.reduce((n, x) => n + x.size, 0);
console.log(`dev:reset — ${YES ? 'cleaning' : 'dry run (add --yes to clean)'}\n`);
if (!plan.filter(x => !x.quiet).length) console.log('  Nothing to clean.');
for (const x of plan) {
  if (x.quiet && !YES) continue;
  if (!YES) { console.log(`  would remove  ${x.what}${x.size ? '  (' + kb(x.size) + ')' : ''}`); continue; }
  try { x.run(); console.log(`  removed  ${x.what}`); } catch (e) { console.log(`  FAILED   ${x.what}: ${(e.stderr || e.message || '').toString().trim().split('\n')[0]}`); }
}
if (skipped.length) { console.log(`\nKept ${skipped.length}:`); skipped.slice(0, 40).forEach(s => console.log('  ' + s)); if (skipped.length > 40) console.log(`  … and ${skipped.length - 40} more`); }
console.log(`\n${plan.filter(x => !x.quiet).length} item(s), ${kb(total)}${YES ? ' freed' : ' would be freed'}.`);
