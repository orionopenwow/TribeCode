#!/usr/bin/env node
// fix/p15-updates: update a TribeCode copy that runs from source (git clone), safely, and make sure the NEW code runs.
// The .bat files in Tools/ and scripts/desktop/ call this instead of a bare `git pull --ff-only --quiet`, which failed
// silently on any local edit (you kept the old code and never knew) and left an already-running old server serving the
// old screens (docs/UPDATES.md).
//
//   node scripts/update-from-source.js                 update the current branch (main when detached)
//   node scripts/update-from-source.js --branch main   update that branch
//   node scripts/update-from-source.js --check         only say what would happen; change nothing
//   node scripts/update-from-source.js --serve -- --port 4747 [server args]
//                                                     then run the server, restarting it when it asks (exit code 75)
//   node scripts/update-from-source.js --serve --no-update -- --port 4747   only run it that way
// Steps:
//   1. Your own edits to tracked files are set aside with `git stash push -m "tribecode-update <time>"` (never thrown away;
//      `git stash pop` brings them back). Commits of your own that aren't on GitHub: nothing is changed, it says so.
//   2. git fetch, then move to exactly origin/<branch> (git reset --hard, safe after step 1).
//   3. A TribeCode server still running older code on the port (~/.tribecode/servers/<port>.json, or what answers there)
//      is asked to stop (POST /api/admin/shutdown with ~/.tribecode/admin-secret); one this checkout started is stopped
//      by its process id if it doesn't answer.
//   4. Prints the version and build it is on now.
'use strict';
const { spawnSync, spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd >= 0 ? argv.slice(0, dd) : argv, serverArgs = dd >= 0 ? argv.slice(dd + 1) : [];
const opt = k => { const i = own.indexOf(k); return i >= 0 && own[i + 1] && !own[i + 1].startsWith('--') ? own[i + 1] : null; };
const CHECK = own.includes('--check'), SERVE = own.includes('--serve');
const PORT = Number(opt('--port') || (serverArgs.includes('--port') ? serverArgs[serverArgs.indexOf('--port') + 1] : '') || process.env.TRIBE_PORT || 4747);
const HOME = process.env.TRIBECODE_HOME || path.join(os.homedir(), '.tribecode');
const say = m => console.log('  ' + m);
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
const ok = r => r.status === 0;
const out = r => String(r.stdout || '').trim();

function diskBuild() {
  let version = '', build = '';
  try { const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/package.json'), 'utf8')); version = p.version || ''; build = p.tribeBuild || ''; } catch {}
  return { version, build };
}
function request(method, p, headers = {}) {
  return new Promise(res => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: { Host: `localhost:${PORT}`, ...headers }, timeout: 2000 }, x => {
      let b = ''; x.on('data', c => { b += c; }); x.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} res({ status: x.statusCode, json: j }); });
    });
    r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); }); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

async function updateCode() {
  if (!ok(git('rev-parse', '--is-inside-work-tree'))) { say('This folder is not a git copy of TribeCode; nothing to update.'); return { changed: false }; }
  let branch = opt('--branch') || out(git('rev-parse', '--abbrev-ref', 'HEAD'));
  if (!branch || branch === 'HEAD') branch = 'main';
  const before = out(git('rev-parse', 'HEAD'));
  say(`Getting the latest ${branch} from GitHub...`);
  const f = git('fetch', '--quiet', 'origin', branch);
  if (!ok(f)) { say(`Couldn't reach GitHub (${(f.stderr || '').trim().split('\n').pop() || 'no answer'}). Nothing changed.`); return { changed: false, offline: true }; }
  const target = `origin/${branch}`;
  // commits of your own that GitHub doesn't have: never move past them
  const cur = out(git('rev-parse', '--abbrev-ref', 'HEAD'));
  const mine = cur === branch ? Number(out(git('rev-list', '--count', `${target}..HEAD`)) || 0) : 0;
  if (mine > 0) {
    say(`You have ${mine} commit(s) of your own on ${branch} that aren't on GitHub, so nothing was changed.`);
    say(`Push them (git push) or move them to another branch, then run this again.`);
    return { changed: false, refused: true };
  }
  const dirty = out(git('status', '--porcelain', '--untracked-files=no'));
  if (CHECK) { say(dirty ? 'Would set your own edits aside (git stash) first.' : 'No edits of your own.'); say(`Would move to ${out(git('rev-parse', '--short', target))}.`); return { changed: false }; }
  if (dirty) {
    const tag = `tribecode-update ${new Date().toISOString().replace(/\..+/, '')}`;
    const s = git('stash', 'push', '-m', tag);
    if (!ok(s)) { say('You have edits that could not be set aside, so nothing was changed:'); say((s.stderr || s.stdout || '').trim()); return { changed: false, refused: true }; }
    say(`Your own edits were set aside, not lost: "${tag}". Bring them back with: git stash pop`);
  }
  if (cur !== branch) { const c = git('checkout', '--quiet', branch); if (!ok(c)) { const c2 = git('checkout', '--quiet', '-b', branch, target); if (!ok(c2)) { say(`Could not switch to ${branch}: ${(c.stderr || '').trim()}`); return { changed: false, refused: true }; } } }
  const r = git('reset', '--hard', '--quiet', target);
  if (!ok(r)) { say(`Could not move to ${target}: ${(r.stderr || '').trim()}`); return { changed: false, refused: true }; }
  const after = out(git('rev-parse', 'HEAD'));
  return { changed: before !== after, before, after };
}

// A server still running older code than what is on disk now: ask it to stop (then by pid, if this checkout started it).
async function stopOldServer() {
  const disk = diskBuild();
  const h = await request('GET', '/api/health');
  if (!h || !h.json || !h.json.version) return false;
  const same = h.json.version === disk.version && (!disk.build || h.json.build === disk.build);
  if (same) { say(`TribeCode v${h.json.version} is already running on port ${PORT} with this code.`); return false; }
  say(`An older TribeCode server (v${h.json.version}${h.json.build ? ' build ' + h.json.build : ''}) is running on port ${PORT}. Stopping it...`);
  if (CHECK) return false;
  let secret = ''; try { secret = fs.readFileSync(path.join(HOME, 'admin-secret'), 'utf8').trim(); } catch {}
  if (secret) await request('POST', '/api/admin/shutdown', { 'X-Tribe-Admin': secret, 'Content-Length': '0' });
  for (let i = 0; i < 25; i++) { if (!(await request('GET', '/api/health'))) return true; await sleep(200); }
  let info = null; try { info = JSON.parse(fs.readFileSync(path.join(HOME, 'servers', `${PORT}.json`), 'utf8')); } catch {}
  const fromHere = info && info.pid && info.ui && path.resolve(info.ui).startsWith(ROOT + path.sep);
  if (fromHere && alive(info.pid)) {
    try { process.kill(info.pid); } catch {}
    for (let i = 0; i < 25; i++) { if (!(await request('GET', '/api/health'))) return true; await sleep(200); }
  }
  say(`It would not stop. Close the window running it (for example a terminal running npm start), then run this again.`);
  return false;
}

function serve() {
  const run = () => {
    const disk = diskBuild();
    say(`Starting TribeCode v${disk.version}${disk.build ? ' (build ' + disk.build + ')' : ''}...`);
    const c = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), ...serverArgs], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, TRIBE_SUPERVISED: '1' } });
    const fwd = sig => () => { try { c.kill(sig); } catch {} };
    const onInt = fwd('SIGINT'), onTerm = fwd('SIGTERM');
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
    c.on('exit', code => {
      process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
      if (code === 75) { say('Restarting TribeCode to finish the update...'); return setTimeout(run, 300); }
      process.exit(code == null ? 0 : code);
    });
  };
  run();
}

module.exports = { diskBuild };
if (require.main === module) (async () => {
  if (own.includes('--no-update')) return serve();   // only run (the .bat already updated a moment ago)
  const u = await updateCode();
  await stopOldServer();
  const d = diskBuild();
  say(`TribeCode is now v${d.version}${d.build ? ' (build ' + d.build + ')' : ''}${u.changed ? `, updated from ${String(u.before).slice(0, 7)} to ${String(u.after).slice(0, 7)}` : ''}.`);
  if (SERVE) return serve();
  process.exit(u.refused ? 2 : 0);
})();
