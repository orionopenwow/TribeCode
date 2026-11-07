#!/usr/bin/env node
// One click: get a friend (iPhone, Android or another computer) into your tribe.
// Starts TribeCode if it isn't running, turns on the public https address (Tailscale Funnel or
// cloudflared) when one is available, makes a fresh invite, copies it, and opens a page with a QR code.
// Usage: node scripts/invite-friend.js [--port 4747] [--no-share] [--no-open]
'use strict';
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf('--port') + 1]) || 4747;
const noOpen = argv.includes('--no-open');
const opt = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
// --project-path <folder> [--project-name <name>] [--emoji <e>] [--tasks a|b|c] [--agent]: start (or reuse) a project
// from that folder, scope the invite to it, and (with --agent) print the Claude Code command for it.
const projectPath = opt('--project-path');
// Usage note: --cloudflare skips Tailscale and uses a Cloudflare quick tunnel (address changes each start).
const base = `http://localhost:${port}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function request(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(base + p, { method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}, timeout: 60_000 }, res => {
      let s = ''; res.on('data', c => (s += c)); res.on('end', () => { let j = {}; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timed out')));
    if (data) req.write(data); req.end();
  });
}
const healthy = async () => { try { return (await request('GET', '/api/health')).status === 200; } catch { return false; } };

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
function startServer() {
  const live = path.join(root, 'scripts', 'live.js');
  if (process.platform === 'win32') {
    // Its own window, so the server keeps running (and auto-updating) after this one closes.
    spawn('cmd', ['/c', `start "TribeCode" "${process.execPath}" "${live}" --no-open --port ${port}`], { cwd: root, stdio: 'ignore', detached: true, windowsVerbatimArguments: true }).unref();
  } else {
    const log = fs.openSync(path.join(os.tmpdir(), 'tribecode-server.log'), 'a');
    spawn(process.execPath, [live, '--no-open', '--port', String(port)], { cwd: root, stdio: ['ignore', log, log], detached: true }).unref();
  }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function page(r) {
  const qr = require(path.join(root, 'app', 'ui', 'qr.js')).svg(r.join, { fg: '#12151A', bg: '#F8FAFC', border: 3 });
  const reach = r.public
    ? `<p class="ok"><span class="dot"></span>Works from anywhere: cell data, any Wi-Fi.</p>`
    : `<p class="warn"><span class="dot"></span>Same Wi-Fi only. ${esc(r.shareMessage || 'Turn on Tailscale or cloudflared to share beyond your Wi-Fi.')}</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invite a friend · TribeCode</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#12151A;color:#94A3B8;font:15px/1.5 Inter,system-ui,Segoe UI,sans-serif}
.card{width:min(860px,94vw);display:grid;grid-template-columns:300px 1fr;gap:28px;background:#1B2028;border:1px solid #2A313C;border-radius:16px;padding:28px}
.qr{background:#F8FAFC;border-radius:12px;padding:10px}.qr svg{display:block;width:100%;height:auto}
h1{margin:0 0 4px;color:#F8FAFC;font-size:26px;letter-spacing:-.01em}.k{font:12px/1.4 ui-monospace,Consolas,monospace;text-transform:uppercase;letter-spacing:.08em;color:#F26B1D}
.link{display:flex;gap:8px;margin:18px 0 10px}.link input{flex:1;min-width:0;background:#12151A;border:1px solid #2A313C;color:#F8FAFC;border-radius:10px;padding:10px 12px;font:13px ui-monospace,Consolas,monospace}
button{background:#F26B1D;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-weight:600;cursor:pointer}button.sec{background:#1B2028;color:#F8FAFC;border:1px solid #2A313C}
ol{margin:16px 0 0;padding-left:20px;color:#F8FAFC}ol li{margin:6px 0}ol small{color:#94A3B8}.ok,.warn{display:flex;gap:8px;align-items:center;margin:0}.dot{width:8px;height:8px;border-radius:50%;background:#38C6B1;flex:none}.warn .dot{background:#F26B1D}
.foot{margin-top:16px;font-size:13px}@media(max-width:700px){.card{grid-template-columns:1fr}}
</style></head><body><main class="card">
<div class="qr">${qr}</div>
<div><div class="k">${esc(r.tribe)} · invite from ${esc(r.host)}</div><h1>Scan this with your friend's iPhone camera</h1>${reach}
<div class="link"><input id="l" readonly value="${esc(r.join)}"><button id="c">Copy</button></div>
<button class="sec" id="s">Share…</button>
<ol><li>Camera → tap the TribeCode link</li><li>Type a name → <b>Join</b></li><li>Tap <b>Share → Add to Home Screen</b> <small>(signed in, opens like an app)</small></li></ol>
<p class="foot">Link is already on your clipboard. Good for 3 people, expires in 48 hours.${r.project ? ` Joins <b>${esc(r.project.name)}</b> only.` : ''}</p>
${r.agentCommand ? `<div class="k" style="margin-top:18px">Connect your Claude Code (run once in a terminal)</div><div class="link"><input id="cc" readonly value="${esc(r.agentCommand)}"><button id="ccb">Copy</button></div>` : ''}</div></main>
<script>const l=document.getElementById('l');document.getElementById('c').onclick=async e=>{try{await navigator.clipboard.writeText(l.value)}catch{l.select();document.execCommand('copy')}e.target.textContent='Copied'};
const cc=document.getElementById('ccb');if(cc)cc.onclick=async e=>{const v=document.getElementById('cc').value;try{await navigator.clipboard.writeText(v)}catch{document.getElementById('cc').select();document.execCommand('copy')}e.target.textContent='Copied'};
const s=document.getElementById('s');if(navigator.share)s.onclick=()=>navigator.share({title:'Join my TribeCode',url:l.value}).catch(()=>{});else s.remove();</script></body></html>`;
}

(async () => {
  console.log('\n  TribeCode · invite a friend\n');
  let started = false;
  if (!(await healthy())) {
    console.log('  Starting TribeCode...'); startServer(); started = true;
    for (let i = 0; i < 80 && !(await healthy()); i++) await sleep(250);
    if (!(await healthy())) { console.error('  TribeCode did not start. Run TribeCode-Live-Test once to see the error.'); process.exit(1); }
  }
  const share = !argv.includes('--no-share');
  if (share) console.log('  Getting a public https address (Tailscale or cloudflared)...');
  const name = (os.userInfo().username || 'Host').slice(0, 32);
  const invite = async provider => {
    const project = projectPath ? { path: projectPath, name: opt('--project-name') || undefined, emoji: opt('--emoji') || undefined, tasks: (opt('--tasks') || '').split('|').filter(Boolean) } : undefined;
    const r = await request('POST', '/api/host/quick-invite', { name, share, provider, project, agent: argv.includes('--agent') });
    if (r.status !== 200) { console.error(`  Could not make an invite: ${r.body.error || r.status}`); process.exit(1); }
    return r.body;
  };
  let out = await invite(process.argv.includes('--cloudflare') ? 'cloudflare' : '');
  // Tailscale Funnel gives an address that never changes (best for a friend's Home Screen app), but each
  // tailnet has to allow it once. Open that page and wait for the click.
  if (share && out.approveUrl && out.provider !== 'tailscale') {
    console.log('\n  One-time step: allow Tailscale Funnel in the page that just opened (click "Enable").');
    open(out.approveUrl);
    for (let i = 0; i < 36; i++) {
      await sleep(5000);
      const again = await invite('tailscale');
      if (again.provider === 'tailscale') { out = again; console.log('  Funnel allowed.'); break; }
    }
    if (out.provider !== 'tailscale') console.log('  Still waiting on Funnel, so this link uses a temporary Cloudflare address for now.');
  }
  if (share && !out.public) {
    console.error(`\n  Could not get a public address. ${out.shareMessage || ''}`);
    console.error('  Check your internet connection and run this again. (Same-Wi-Fi link, for now: ' + out.join + ')\n');
    process.exit(1);
  }
  const copied = copy(out.join);
  const file = path.join(os.tmpdir(), 'tribecode-invite.html');
  fs.writeFileSync(file, page(out));
  console.log(`  ${out.public ? 'Public' : 'Same Wi-Fi'} link: ${out.join}${copied ? '  (copied)' : ''}`);
  if (!out.public && out.shareMessage) console.log(`  Note: ${out.shareMessage}`);
  open(file);
  if (out.hostOpen) open(out.hostOpen);              // first run: opens your own signed-in window too
  else if (started) open(base);
  if (out.project) console.log(`  Project:  ${out.project.name}  (${out.project.repo})`);
  if (out.agentCommand) {
    console.log('\n  Connect your Claude Code to it (run once in a terminal):\n  ' + out.agentCommand);
    try { fs.writeFileSync(path.join(out.project.repo, 'CONNECT-CLAUDE.txt'), out.agentCommand + '\n'); } catch {}
  }
  console.log('\n  Text the link (or show the QR). Your friend taps it, types a name, and they\'re in.\n');
})().catch(e => { console.error('  ' + e.message); process.exit(1); });
