#!/usr/bin/env node
// npm run dev:test — the whole `npm test` suite, in parallel.
//
//   node scripts/dev/test.js                 all suites, 4 at a time
//   node scripts/dev/test.js --jobs 3        fewer workers (2-core machines: 3 is the sweet spot)
//   node scripts/dev/test.js --only e2e_chat,e2e_nav   a subset (substring match on the command)
//   node scripts/dev/test.js --no-report     do not write docs/TEST-REPORT.md
//   node scripts/dev/test.js --list          print the suites and exit
//
// Each worker gets its own TRIBE_PORT_OFFSET (base + 200 * worker), so suites never share a port, even
// with other runs on the same machine (pick a different --offset for each concurrent run). A suite that
// fails is re-run once alone, so the summary separates flaky suites from real failures. Logs go to
// /tmp/tribe-devtest-<time>/<suite>.log. Screenshots the suites rewrite under docs/screenshots are
// restored afterwards unless you pass --keep-shots.
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const JOBS = Math.max(1, parseInt(opt('--jobs', process.env.DEV_TEST_JOBS || '4'), 10));
const BASE_OFF = parseInt(opt('--offset', process.env.DEV_TEST_OFFSET || '6000'), 10);
const ONLY = (opt('--only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const TIMEOUT_MIN = parseFloat(opt('--timeout', '15'));

function suites() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return pkg.scripts.test.split('&&').map(s => s.trim()).filter(s => s && !s.startsWith('export '))
    .filter(c => !ONLY.length || ONLY.some(o => c.includes(o)));
}
const nameOf = (cmd) => { const m = cmd.match(/([\w.-]+)\.(py|js)/); return m ? m[1] + (cmd.includes('--quick') ? ' --quick' : '') : cmd; };

if (flag('--list')) { suites().forEach(s => console.log(s)); process.exit(0); }

const LOGDIR = path.join(os.tmpdir(), 'tribe-devtest-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(LOGDIR, { recursive: true });

function run(cmd, offset, tag) {
  return new Promise((resolve) => {
    const started = Date.now();
    const logFile = path.join(LOGDIR, nameOf(cmd).replace(/[^\w.-]+/g, '_') + (tag ? '.' + tag : '') + '.log');
    const out = fs.openSync(logFile, 'w');
    const env = { ...process.env, TRIBE_NO_DOWNLOAD: '1', TRIBE_TEST: '1', TRIBE_PORT_OFFSET: String(offset), NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', PYTHONUNBUFFERED: '1' };
    const child = spawn('bash', ['-c', cmd], { cwd: ROOT, env, stdio: ['ignore', out, out], detached: true });
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, TIMEOUT_MIN * 60000);
    child.on('exit', (code, sig) => {
      clearTimeout(timer); fs.closeSync(out);
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}   // leftover servers/browsers of that suite
      const tail = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-6).join('\n');
      resolve({ cmd, ok: code === 0, code: sig || code, secs: Math.round((Date.now() - started) / 1000), log: logFile, tail });
    });
  });
}

async function pool(list) {
  const results = new Array(list.length); let next = 0;
  async function worker(w) {
    while (next < list.length) {
      const i = next++; const cmd = list[i];
      process.stdout.write(`  [w${w}] ${nameOf(cmd)} …\n`);
      const r = await run(cmd, BASE_OFF + 200 * w);
      results[i] = r;
      process.stdout.write(`  [w${w}] ${r.ok ? 'pass' : 'FAIL'} ${nameOf(cmd)} (${r.secs}s)\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(JOBS, list.length) }, (_, w) => worker(w)));
  return results;
}

function gitDirty() {
  try { return execFileSync('git', ['diff', '--name-only'], { cwd: ROOT }).toString().split('\n').filter(Boolean); } catch { return []; }
}
const dirtyBefore = gitDirty();

(async () => {
  const list = suites();
  const t0 = Date.now();
  console.log(`dev:test — ${list.length} suites, ${JOBS} at a time, logs in ${LOGDIR}`);
  const first = await pool(list);
  const failed = first.filter(r => !r.ok);
  const retry = {};
  if (failed.length) {
    console.log(`\nRe-running ${failed.length} failed suite(s) alone…`);
    for (const r of failed) {
      const rr = await run(r.cmd, BASE_OFF + 200 * JOBS, 'retry');
      retry[r.cmd] = rr;
      console.log(`  ${rr.ok ? 'pass (flaky)' : 'FAIL again'} ${nameOf(r.cmd)} (${rr.secs}s)`);
    }
  }
  const rows = first.map(r => {
    const rr = retry[r.cmd];
    const status = r.ok ? 'pass' : rr && rr.ok ? 'flaky' : 'FAIL';
    return { suite: nameOf(r.cmd), status, secs: r.secs + (rr ? rr.secs : 0), log: (rr || r).log, tail: (rr || r).tail };
  });
  const n = (s) => rows.filter(r => r.status === s).length;
  const total = Math.round((Date.now() - t0) / 1000);
  const w = Math.max(...rows.map(r => r.suite.length), 5);
  console.log('\n' + 'suite'.padEnd(w) + '  status  secs');
  console.log('-'.repeat(w + 14));
  for (const r of rows) console.log(r.suite.padEnd(w) + '  ' + r.status.padEnd(6) + '  ' + String(r.secs).padStart(4));
  console.log('-'.repeat(w + 14));
  console.log(`${n('pass')} pass · ${n('flaky')} flaky · ${n('FAIL')} fail · ${Math.floor(total / 60)}m${total % 60}s`);
  for (const r of rows.filter(r => r.status === 'FAIL')) console.log(`\n--- ${r.suite} (${r.log})\n${r.tail}`);

  if (!flag('--keep-shots')) {   // suites rewrite screenshots and reports under docs/: put back what was clean before the run
    const dirtyNow = gitDirty().filter(p => p.startsWith('docs/') && !dirtyBefore.includes(p));
    if (dirtyNow.length) try { execFileSync('git', ['checkout', '--', ...dirtyNow], { cwd: ROOT, stdio: 'ignore' }); } catch {}
  }
  if (!flag('--no-report') && !ONLY.length) {
    let commit = '?'; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch {}
    const md = [
      '# Test report', '',
      `Generated by \`npm run dev:test\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC at commit \`${commit}\`.`,
      `${list.length} suites, ${JOBS} in parallel, ${Math.floor(total / 60)}m${total % 60}s. A failed suite is re-run once alone: "flaky" means it passed alone.`, '',
      `**${n('pass')} pass · ${n('flaky')} flaky · ${n('FAIL')} fail**`, '',
      '| Suite | Status | Seconds |', '|---|---|---:|',
      ...rows.map(r => `| ${r.suite} | ${r.status === 'pass' ? 'pass' : r.status === 'flaky' ? 'flaky (passed alone)' : '**FAIL**'} | ${r.secs} |`),
      '',
      ...rows.filter(r => r.status === 'FAIL').flatMap(r => [`## ${r.suite}`, '', '```', r.tail, '```', '']),
    ].join('\n');
    fs.writeFileSync(path.join(ROOT, 'docs', 'TEST-REPORT.md'), md + '\n');
    console.log('\nWrote docs/TEST-REPORT.md');
  }
  process.exit(n('FAIL') ? 1 : 0);
})();
