#!/usr/bin/env node
// One command: a ready-made demo tribe to test TribeCode with friends.
// Copies templates/lantern-run (a 2D platformer) and templates/tavern-3d (a 3D tavern with bot patrons) to
// ~/TribeCode-Projects/<name> as git repos, then asks the running TribeCode server (POST /api/host/demo-tribe,
// local only, the host's sign-in untouched) to turn them into projects: roles whose folders are the lanes,
// a first plan with tasks per lane, notes, a pinned living doc, a proposal vote, toolbox picks, repo autopilot,
// and a GitHub repo when the host has a token. Prints the invite link and the Claude Code command, opens the app.
// Usage: node scripts/start-demo-tribe.js [--port 4747] [--dir <folder>] [--no-share] [--cloudflare] [--no-open] [--no-start]
'use strict';
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const port = Number(opt('--port')) || 4747;
const base = `http://localhost:${port}`;
const projectsDir = path.resolve(opt('--dir') || path.join(os.homedir(), 'TribeCode-Projects'));
const noOpen = argv.includes('--no-open');
const share = !argv.includes('--no-share');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function request(method, p, body, timeout = 180_000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(base + p, { method, timeout, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, res => {
      let s = ''; res.on('data', c => (s += c)); res.on('end', () => { let j = {}; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timed out')));
    if (data) req.write(data); req.end();
  });
}
const healthy = async () => { try { return (await request('GET', '/api/health', null, 3000)).status === 200; } catch { return false; } };
function open(url) {
  if (noOpen) return;
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
}
function copy(text) {
  const tries = process.platform === 'win32' ? [['clip', []]] : process.platform === 'darwin' ? [['pbcopy', []]] : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']]];
  for (const [c, a] of tries) { try { execFileSync(c, a, { input: text, stdio: ['pipe', 'ignore', 'ignore'] }); return true; } catch {} }
  return false;
}
function startServer() {   // same as invite-friend.js: the live runner in its own window, so it keeps running
  const live = path.join(root, 'scripts', 'live.js');
  if (process.platform === 'win32') spawn('cmd', ['/c', `start "TribeCode" "${process.execPath}" "${live}" --no-open --port ${port}`], { cwd: root, stdio: 'ignore', detached: true, windowsVerbatimArguments: true }).unref();
  else { const log = fs.openSync(path.join(os.tmpdir(), 'tribecode-server.log'), 'a'); spawn(process.execPath, [live, '--no-open', '--port', String(port)], { cwd: root, stdio: ['ignore', log, log], detached: true }).unref(); }
}

// Copy a template into its own git repo (once; a second run reuses the folder and its history).
function makeRepo(spec) {
  const dest = path.join(projectsDir, spec.dir);
  const git = (...a) => execFileSync('git', a, { cwd: dest, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
  if (fs.existsSync(path.join(dest, '.git'))) { console.log(`  Using   ${dest}`); return dest; }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(path.join(root, 'templates', spec.template), dest, { recursive: true, force: false, errorOnExist: false });
  git('init', '-q');
  try { git('checkout', '-q', '-b', 'main'); } catch {}
  let ident = [];
  try { git('config', 'user.name'); } catch { ident = ['-c', `user.name=${os.userInfo().username || 'TribeCode'}`, '-c', 'user.email=host@users.noreply.tribecode']; }
  git('add', '-A');
  execFileSync('git', [...ident, 'commit', '-q', '-m', `${spec.name} starter from TribeCode's demo tribe`], { cwd: dest, stdio: 'ignore' });
  console.log(`  Created ${dest}`);
  return dest;
}

(async () => {
  console.log('\n  TribeCode · demo tribe\n');
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'templates', 'demo-tribe.json'), 'utf8'));
  let started = false;
  if (!(await healthy())) {
    if (argv.includes('--no-start')) { console.error(`  TribeCode is not running on port ${port}. Start it first.`); process.exit(1); }
    console.log('  Starting TribeCode...'); startServer(); started = true;
    for (let i = 0; i < 120 && !(await healthy()); i++) await sleep(250);
    if (!(await healthy())) { console.error('  TribeCode did not start. Run TribeCode-Live-Test once to see the error.'); process.exit(1); }
  }
  const projects = seed.projects.map(spec => { const { template, dir, ...rest } = spec; return { ...rest, path: makeRepo(spec) }; });
  if (share) console.log('  Getting a public https address (Tailscale or cloudflared)...');
  console.log('  Setting up the projects (roles, plan, tasks, docs, vote, toolbox, autopilot)...');
  const name = (os.userInfo().username || 'Host').slice(0, 32);
  const r = await request('POST', '/api/host/demo-tribe', { name, share, provider: argv.includes('--cloudflare') ? 'cloudflare' : '', projects });
  if (r.status === 404) { console.error('  This TribeCode is too old for the demo tribe: update it (Restart to update, or Try-New-Work).'); process.exit(1); }
  if (r.status !== 200) { console.error(`  Could not set up the demo tribe: ${r.body.error || r.status}`); process.exit(1); }
  const out = r.body;

  console.log('');
  for (const p of out.projects) {
    console.log(`  ${p.emoji} ${p.name}${p.existed ? ' (already set up)' : ''}`);
    console.log(`     repo   ${p.repo}`);
    console.log(`     lanes  ${p.roles.map(x => `${x.name} ${x.folders.join(' ')}`).join(' · ')}`);
    const g = p.githubStep || {};
    const where = p.github && p.github.url ? p.github.url : g.s === 'run' ? 'pushing in the background' : g.s === 'fail' ? `not pushed (${g.note || 'error'})` : 'stays on this computer until you connect GitHub (the project\'s flow card)';
    console.log(`     tasks  ${p.tasks}   GitHub: ${where}`);
  }
  const copied = copy(out.join);
  console.log(`\n  Invite link (both projects, ${out.public ? 'works from anywhere' : 'same Wi-Fi only'}): ${out.join}${copied ? '  (copied)' : ''}`);
  if (!out.public && out.shareMessage) console.log(`  Note: ${out.shareMessage}`);
  if (out.approveUrl && out.provider !== 'tailscale') { console.log('  One-time step: allow Tailscale Funnel in the page that opens (click "Enable"), then run this again for a fixed address.'); open(out.approveUrl); }
  console.log('\n  Connect your Claude Code (run once in a terminal):\n  ' + out.agentCommand);
  try { fs.writeFileSync(path.join(projectsDir, 'CONNECT-CLAUDE.txt'), `${out.agentCommand}\n\nInvite link: ${out.join}\n`); } catch {}
  console.log('\n  Try it: docs/DEMO-TRIBE.md has the checklist (lanes, live docs, votes, autopilot, phone join, @ai).\n');
  if (out.hostOpen) open(out.hostOpen); else open(out.open || base);
  if (started) console.log('  TribeCode keeps running in its own window.\n');
})().catch(e => { console.error('  ' + e.message); process.exit(1); });
