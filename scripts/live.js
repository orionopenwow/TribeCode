#!/usr/bin/env node
// Live test mode: runs the tribe server, pulls new commits from GitHub every 20 s, restarts the
// server when server code changes, and makes open browser tabs reload when the UI changes.
// Usage: node scripts/live.js [--port 4747] [--no-open] [--no-pull]
'use strict';
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const port = Number((argv[argv.indexOf('--port') + 1]) || 4747) || 4747;
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const stamp = () => new Date().toLocaleTimeString();
let child = null, opened = argv.includes('--no-open');

function startServer() {
  child = spawn(process.execPath, [path.join(root, 'server', 'index.js'), '--port', String(port), '--dev'], { cwd: root, stdio: 'inherit' });
  child.on('exit', (code, sig) => { if (sig !== 'SIGTERM' && code !== 0 && code !== null) console.log(`[${stamp()}] server stopped (code ${code}). Fix the error above, or wait for the next update.`); });
  if (!opened) waitAndOpen();
}
function restartServer() { if (child) { child.removeAllListeners('exit'); child.kill('SIGTERM'); } setTimeout(startServer, 400); }

function waitAndOpen(tries = 0) {
  http.get(`http://localhost:${port}/api/health`, res => { res.resume(); opened = true; openBrowser(`http://localhost:${port}`); })
    .on('error', () => { if (tries < 40) setTimeout(() => waitAndOpen(tries + 1), 250); });
}
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
  console.log(`\n  Opened ${url}\n  Tip: open the same address in a second browser (e.g. Edge + Chrome) to play a friend.\n`);
}

function pull() {
  try {
    const before = git('rev-parse', 'HEAD');
    git('pull', '--ff-only', '--quiet');
    const after = git('rev-parse', 'HEAD');
    if (before === after) return;
    const files = git('diff', '--name-only', before, after).split('\n');
    console.log(`\n[${stamp()}] Pulled: ${git('log', '-1', '--format=%s', after)}`);
    if (files.some(f => f.startsWith('server/') || f === 'app/package.json')) { console.log(`[${stamp()}] Server code changed, restarting…`); restartServer(); }
    else if (files.some(f => f.startsWith('app/ui/'))) console.log(`[${stamp()}] UI changed: open tabs reload automatically.`);
  } catch (e) { const msg = String(e.stderr || e.message).split('\n')[0]; if (!/no tracking information/.test(msg)) console.log(`[${stamp()}] Couldn't pull updates: ${msg}`); }
}

console.log(`\n  🔥 TribeCode live test  ·  checking GitHub for updates every 20 s  ·  Ctrl+C to stop\n`);
startServer();
if (!argv.includes('--no-pull')) setInterval(pull, 20_000);
process.on('SIGINT', () => { if (child) child.kill('SIGTERM'); process.exit(0); });
