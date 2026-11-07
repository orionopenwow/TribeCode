#!/usr/bin/env node
// npm run dev:seed — a realistic tribe to click around in, on a throwaway folder.
//
//   node scripts/dev/seed.js                       port 4952, a fresh /tmp/tribe-seed-* folder
//   node scripts/dev/seed.js --port 4953 --dir /tmp/tribe-seed-mine   reuse a folder (seeds only once)
//   node scripts/dev/seed.js --no-serve            seed, print the logins, stop the server
//
// It starts the server from this checkout, seeds the demo tribe (templates/demo-tribe.json: Lantern Run and
// The Crooked Kettle, with lanes, a plan, tasks, notes, a living doc, a vote, toolbox picks and an agent),
// adds two friends (Vega on a laptop, Lyra on a phone) with chat, a DM, reactions and tasks, and prints one
// sign-in link per person plus the Claude Code command. GitHub is off (TRIBE_NO_GH) so nothing leaves the machine.
// Ctrl+C stops the server; the folder stays for next time (npm run dev:reset cleans old ones).
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = parseInt(opt('--port', '4952'), 10);
const BASE = `http://localhost:${PORT}`;
const DIR = path.resolve(opt('--dir', '') || fs.mkdtempSync(path.join(os.tmpdir(), 'tribe-seed-')));
const PROJECTS = DIR + '-projects';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(p, { method = 'GET', body, token, project } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  if (project) h['X-Project'] = project;
  const r = await fetch(BASE + '/api' + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  if (r.status >= 400) throw new Error(`${method} ${p}: ${r.status} ${j.error || ''}`);
  return j;
}

function makeRepo(spec) {
  const dest = path.join(PROJECTS, spec.dir);
  if (fs.existsSync(path.join(dest, '.git'))) return dest;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(path.join(ROOT, 'templates', spec.template), dest, { recursive: true });
  const g = (...a) => execFileSync('git', ['-c', 'user.name=Orion', '-c', 'user.email=orion@users.noreply.tribecode', ...a], { cwd: dest, stdio: 'ignore' });
  g('init', '-q', '-b', 'main'); g('add', '-A'); g('commit', '-q', '-m', `${spec.name} starter`);
  return dest;
}

(async () => {
  const fresh = !fs.existsSync(path.join(DIR, '.tribe', 'members.json'));
  const log = fs.openSync(DIR + '.server.log', 'a');
  const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), '--port', String(PORT), '--dir', DIR, '--name', 'Campfire Crew', '--ollama', 'http://localhost:9'],
    { cwd: ROOT, stdio: ['ignore', log, log], env: { ...process.env, TRIBE_NO_GH: '1', TRIBE_NO_DOWNLOAD: '1' } });
  const stop = () => { try { srv.kill('SIGTERM'); } catch {} };
  process.on('SIGINT', () => { stop(); console.log('\n  Stopped. The tribe stays in ' + DIR); process.exit(0); });
  srv.on('exit', code => { if (code) { console.error(`  The server stopped (code ${code}). See ${DIR}.server.log`); process.exit(1); } });
  for (let i = 0; i < 100; i++) { try { await api('/health'); break; } catch { await sleep(150); } }

  const out = { people: [] };
  const linkFile = path.join(DIR, '.dev-seed.json');
  if (fresh) {
    console.log('  Seeding the demo tribe…');
    const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', 'demo-tribe.json'), 'utf8'));
    const projects = seed.projects.map(({ template, dir, ...rest }) => ({ ...rest, path: makeRepo({ template, dir, name: rest.name }) }));
    const demo = await api('/host/demo-tribe', { method: 'POST', body: { name: 'Orion', share: false, projects } });
    const code = demo.join.split(/[#&?/]c=|\/join\//).pop().split(/[&#]/)[0];
    const pid = demo.projects[0].id, pid2 = (demo.projects[1] || demo.projects[0]).id;
    out.people.push({ name: 'Orion', role: 'host', link: demo.hostOpen });
    out.agentCommand = demo.agentCommand; out.join = demo.join;
    const friends = [];
    for (const [name, device] of [['Vega', 'laptop'], ['Lyra', 'phone']]) {
      const j = await api('/join', { method: 'POST', body: { code, name } });
      const dl = await api('/device-link', { method: 'POST', token: j.token, body: { label: `dev:seed ${device}` } });
      friends.push({ ...j, device });
      out.people.push({ name, role: `friend (${device})`, link: BASE + dl.path });
    }
    const [vega, lyra] = friends;
    const say = (tok, text, project = pid) => api('/chat/general', { method: 'POST', token: tok, project, body: { text } });
    await say(vega.token, 'Hey! I pushed the first pass of the lantern sprites to art/.');
    const m = await say(lyra.token, 'On my phone on the bus: the jump feels floaty, can we shorten the hang time?');
    await api('/chat/general/react', { method: 'POST', token: vega.token, project: pid, body: { id: m.message.id, emoji: '👍', on: true } });
    await say(vega.token, 'Who wants to own the tavern patrons? I can take the bartender bot.', pid2);
    const dm = 'dm-' + [vega.member.id, lyra.member.id].sort().join('-');
    await api(`/chat/${dm}`, { method: 'POST', token: vega.token, body: { text: 'Want to pair on level 2 tonight?' } });
    await api('/tasks', { method: 'POST', token: lyra.token, project: pid, body: { title: 'Shorten jump hang time', status: 'doing' } });
    await api('/tasks', { method: 'POST', token: vega.token, project: pid, body: { title: 'Lantern glow sprite sheet', status: 'review' } });
    fs.writeFileSync(linkFile, JSON.stringify(out, null, 2));
  } else {
    try { Object.assign(out, JSON.parse(fs.readFileSync(linkFile, 'utf8'))); } catch {}
    console.log('  Reusing the tribe in ' + DIR);
  }

  console.log(`\n  TribeCode dev tribe  ${BASE}/?skipIntro=1\n  folder  ${DIR}\n`);
  for (const p of out.people) console.log(`  ${p.name.padEnd(6)} ${p.role.padEnd(16)} ${p.link || '(sign in from this computer)'}`);
  console.log('\n  Each link signs that person in (open it in a separate browser profile or a private window).');
  console.log('  Phone view: Chrome devtools device mode at 390px, or open Lyra\'s link on a phone on the same Wi-Fi.');
  if (out.join) console.log(`  Invite link for one more friend: ${out.join}`);
  if (out.agentCommand) console.log(`\n  Connect a Claude Code session as "Claude (demo)":\n  ${out.agentCommand}`);
  if (argv.includes('--no-serve')) { stop(); return; }
  console.log('\n  Running. Ctrl+C stops it.');
})().catch(e => { console.error('  dev:seed: ' + e.message); process.exit(1); });
