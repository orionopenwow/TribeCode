#!/usr/bin/env node
// Clean-slate dev profile (docs/DEV-TOOLS.md, "Edit small things before a release"): TribeCode on its own port with a
// throwaway tribe folder, signed in as a local guest (the TEST "Guest" account, app/ui/accounts.js), no tribe yet,
// everything local (no GitHub, no tunnel downloads), with live reload: open tabs reload when app/ui changes, and the
// server restarts when server/ changes. Then it opens the browser.
//   node scripts/dev/clean-slate.js                 # wipes ~/TribeCode-Dev, port 4858, opens the browser
//   node scripts/dev/clean-slate.js --keep          # keeps the folder and this browser's guest storage from last time
//   node scripts/dev/clean-slate.js --port 4860 --dir /tmp/tc-dev --no-open
// Windows: Tools\Clean-Slate-Dev.bat · macOS: Tools/Clean-Slate-Dev.command. Ctrl+C stops it.
// Safety: it only wipes a folder it made itself (one with a .tribecode-dev marker), or an empty one; never ~/TribeCode.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const val = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = k => argv.includes(k);
if (has('--help') || has('-h')) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 11).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
const port = Number(val('--port', process.env.TRIBE_DEV_PORT || 4858)) || 4858;
const dir = path.resolve(val('--dir', process.env.TRIBE_DEV_DIR || path.join(os.homedir(), 'TribeCode-Dev')));
const keep = has('--keep'), open = !has('--no-open');
const MARK = path.join(dir, '.tribecode-dev');

// ---------- the folder: wipe it (only if it is ours), then mark it ----------
function wipe() {
  if (!fs.existsSync(dir)) return;
  const real = fs.realpathSync(dir), home = fs.realpathSync(os.homedir());
  const theirs = [home, path.join(home, 'TribeCode'), path.parse(real).root].map(p => { try { return fs.realpathSync(p); } catch { return p; } });
  if (theirs.includes(real)) { console.error(`  Refusing to wipe ${real}: that is not a throwaway folder.`); process.exit(2); }
  const empty = fs.readdirSync(real).length === 0;
  if (!empty && !fs.existsSync(MARK)) { console.error(`  ${real} exists and was not made by clean-slate (no .tribecode-dev marker). Pick another --dir, or delete it yourself.`); process.exit(2); }
  fs.rmSync(real, { recursive: true, force: true });
}
let run = '';
if (keep && fs.existsSync(MARK)) { try { run = JSON.parse(fs.readFileSync(MARK, 'utf8')).run || ''; } catch {} }
if (!keep || !run) { wipe(); run = crypto.randomBytes(6).toString('hex'); }
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(MARK, JSON.stringify({ run, made: new Date().toISOString(), by: 'scripts/dev/clean-slate.js', port }, null, 1));
const url = `http://localhost:${port}/?devslate=${run}`;

// ---------- the server, restarted when server/ changes ----------
let child = null, stopping = false, opened = !open;
const env = { ...process.env, TRIBE_NO_GH: '1', TRIBE_NO_DOWNLOAD: '1', TRIBE_DEV_SLATE: '1' };
function startServer() {
  child = spawn(process.execPath, [path.join(root, 'server', 'index.js'), '--port', String(port), '--dir', dir, '--name', 'Dev Tribe', '--host', '127.0.0.1', '--dev'], { cwd: root, env, stdio: has('--quiet') ? 'ignore' : 'inherit' });
  child.on('exit', (code, sig) => { if (!stopping && sig !== 'SIGTERM' && code) console.log(`  The server stopped (code ${code}). Fix the error above; saving a file in server/ restarts it.`); });
  waitUp();
}
function restart() { if (child) { child.removeAllListeners('exit'); child.kill('SIGTERM'); } setTimeout(startServer, 400); }
function waitUp(tries = 0) {
  http.get(`http://localhost:${port}/api/health`, res => { res.resume(); ready(); }).on('error', () => { if (tries < 80) setTimeout(() => waitUp(tries + 1), 250); });
}
let said = false;
function ready() {
  if (!said) {
    said = true;
    console.log(`\n  TribeCode clean slate · ${keep ? 'kept' : 'fresh'} · ${dir}\n  ${url}\n  Signed in as the local TEST Guest, no tribe yet, nothing leaves this computer.\n  UI edits reload the page; server edits restart the server. Ctrl+C stops it${keep ? '' : ' (the folder is wiped next run; --keep keeps it)'}.\n`);
    if (has('--print-url')) console.log(`URL ${url}`);
  }
  if (!opened) { opened = true; openBrowser(url); }
}
function openBrowser(u) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
}
let rt; try { fs.watch(path.join(root, 'server'), (ev, f) => { if (!f || !/\.js$/.test(f)) return; clearTimeout(rt); rt = setTimeout(() => { console.log(`  server/${f} changed: restarting…`); restart(); }, 300); }); } catch {}
const quit = () => { stopping = true; if (child) child.kill('SIGTERM'); setTimeout(() => process.exit(0), 300); };
process.on('SIGINT', quit); process.on('SIGTERM', quit);
startServer();
