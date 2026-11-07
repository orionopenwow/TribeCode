#!/usr/bin/env node
// npm run dev:loop — reset/restart soak test for the tribe server.
//
//   node scripts/dev/loop.js                  10 loops, 3 restarts each, port 4951
//   node scripts/dev/loop.js --loops 3 --restarts 5 --port 4955 --keep
//
// Every loop starts a server on a FRESH temp tribe folder (/tmp/tribe-loop-*) and then:
//   bootstrap a host -> create two projects -> invite and join a friend (and a one-time guest) -> chat, a DM,
//   a reaction, a task, a doc -> restart the server on the same folder (alternating a clean stop, SIGTERM, and
//   a crash, SIGKILL) -> check that everything is still there, that the host signs back in (reclaim), that
//   the friend's key still works, that nobody and nothing is duplicated, that the port is free after each stop,
//   and that the folder and the server's memory stay bounded. Each restart adds more data on top.
// Then a "reset" phase: stop, wipe the folder, start again: a brand-new tribe, old keys refused.
// Exit code 0 when every check passed. Zero dependencies (plain Node 20+).
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LOOPS = parseInt(opt('--loops', '10'), 10);
const RESTARTS = parseInt(opt('--restarts', '3'), 10);
const PORT = parseInt(opt('--port', String(4951 + parseInt(process.env.TRIBE_PORT_OFFSET || '0', 10))), 10);
const KEEP = argv.includes('--keep');
const VERBOSE = argv.includes('--verbose');
const BASE = `http://127.0.0.1:${PORT}`;
const MAX_RSS_MB = parseInt(opt('--max-rss', '350'), 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const failures = [];
let checks = 0;
function check(cond, what) { checks++; if (!cond) { failures.push(what); console.log(`    FAIL ${what}`); } else if (VERBOSE) console.log(`    ok   ${what}`); return !!cond; }

async function api(p, { method = 'GET', body, token, project, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  if (project) h['X-Project'] = project;
  const r = await fetch(BASE + '/api' + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}

function portFree(port) {
  return new Promise(res => { const s = net.createServer(); s.once('error', () => res(false)); s.listen(port, '0.0.0.0', () => s.close(() => res(true))); });
}
function rssMB(pid) { try { const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/); return m ? Math.round(+m[1] / 1024) : 0; } catch { return 0; } }
function dirStats(dir) {
  let files = 0, bytes = 0;
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '.git') walk(f); } else { files++; try { bytes += fs.statSync(f).size; } catch {} } } })(dir);
  return { files, bytes };
}
function brokenJsonl(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '.git' && e.name !== 'node_modules') walk(f); continue; }
      try {
        if (e.name.endsWith('.jsonl')) fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).forEach((l, i) => { try { JSON.parse(l); } catch { out.push(`${path.relative(dir, f)}:${i + 1}`); } });
        else if (e.name.endsWith('.json')) JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch { if (e.name.endsWith('.json')) out.push(path.relative(dir, f)); }
    }
  })(dir);
  return out;
}
function tmpLeftovers(dir) { const out = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '.git') walk(f); } else if (/\.\d+\.tmp$/.test(e.name)) out.push(f); } })(dir); return out; }

let srv = null;
async function start(dir) {
  check(await portFree(PORT), `port ${PORT} is free before start`);
  const log = fs.openSync(path.join(path.dirname(dir), path.basename(dir) + '.server.log'), 'a');
  srv = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), '--port', String(PORT), '--dir', dir, '--ollama', 'http://localhost:9'],
    { cwd: ROOT, stdio: ['ignore', log, log], env: { ...process.env, TRIBE_TEST: '1', TRIBE_NO_DOWNLOAD: '1', TRIBE_NO_GH: '1', NO_PROXY: '127.0.0.1,localhost' } });
  srv.exited = new Promise(r => srv.once('exit', r));
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    try { if ((await api('/health')).status === 200) return Date.now() - t0; } catch {}
    await sleep(100);
  }
  throw new Error('server did not start (see ' + dir + '.server.log)');
}
async function stop(how) {
  if (!srv) return;
  const pid = srv.pid;
  srv.kill(how === 'crash' ? 'SIGKILL' : 'SIGTERM');
  const done = await Promise.race([srv.exited.then(() => true), sleep(8000).then(() => false)]);
  if (!check(done, `server (pid ${pid}) exits on ${how === 'crash' ? 'SIGKILL' : 'SIGTERM'} within 8s`)) { try { process.kill(pid, 'SIGKILL'); } catch {} await srv.exited; }
  srv = null;
  let free = false; for (let i = 0; i < 30 && !(free = await portFree(PORT)); i++) await sleep(100);
  check(free, `port ${PORT} is released after stop`);
}

async function oneLoop(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tribe-loop-'));
  console.log(`loop ${n}/${LOOPS}  ${dir}`);
  const st = { chats: [], dms: 0, tasks: [], docs: [], projects: [], reacted: [] };
  await start(dir);

  // ---- a brand-new tribe ----
  const boot = await api('/bootstrap', { method: 'POST', body: { name: 'Orion', tribe: 'Loop Crew' } });
  check(boot.status === 200 && boot.body.token, 'bootstrap makes the host');
  let hostTok = boot.body.token;
  const hostId = boot.body.member && boot.body.member.id;
  check((await api('/bootstrap', { method: 'POST', body: { name: 'Mallory' } })).status === 409, 'a second bootstrap is refused');
  for (const name of ['Lantern Run', 'Crooked Kettle']) {
    const r = await api('/projects', { method: 'POST', token: hostTok, body: { name } });
    check(r.status === 200 && r.body.project, `create project ${name}`);
    if (r.body.project) st.projects.push(r.body.project.id);
  }
  const pid = st.projects[0];
  const inv = await api('/invites', { method: 'POST', token: hostTok, body: { project: pid } });
  check(inv.status === 200, 'host makes a project invite');
  const join = await api('/join', { method: 'POST', body: { code: inv.body.invite.code, name: 'Vega' } });
  check(join.status === 200 && join.body.token, 'friend joins with the invite');
  const friendTok = join.body.token, friendId = join.body.member.id;
  const gp = await api('/invites', { method: 'POST', token: hostTok, body: { project: pid, guest: true, hours: 2 } });
  const guest = await api('/join', { method: 'POST', body: { code: gp.body.invite.code, name: 'Guest' } });
  check(guest.status === 200 && guest.body.member.guest, 'a one-time guest pass joins once');
  check((await api('/join', { method: 'POST', body: { code: gp.body.invite.code, name: 'Guest 2' } })).status === 410, 'the guest pass is used up');
  const dmCh = 'dm-' + [hostId, friendId].sort().join('-');

  async function addData(round) {
    for (const [who, tok] of [['host', hostTok], ['friend', friendTok]]) {
      const text = `loop ${n} round ${round} from ${who} ${Math.random().toString(36).slice(2, 8)}`;
      const r = await api('/chat/general', { method: 'POST', token: tok, project: pid, body: { text } });
      if (check(r.status === 200, `${who} posts in chat (round ${round})`)) st.chats.push({ id: r.body.message.id, text });
    }
    const d = await api(`/chat/${dmCh}`, { method: 'POST', token: friendTok, body: { text: `dm ${round}` } });
    if (check(d.status === 200, `friend sends a DM (round ${round})`)) st.dms++;
    const last = st.chats[st.chats.length - 1];
    const re = await api('/chat/general/react', { method: 'POST', token: hostTok, project: pid, body: { id: last.id, emoji: '👍', on: true } });
    if (check(re.status === 200, `host reacts 👍 (round ${round})`)) st.reacted.push(last.id);
    const t = await api('/tasks', { method: 'POST', token: friendTok, project: pid, body: { title: `Task ${n}.${round}` } });
    if (check(t.status === 200, `friend adds a task (round ${round})`)) st.tasks.push(t.body.task.id);
    const doc = await api('/docs', { method: 'POST', token: hostTok, project: pid, body: { title: `Notes ${n}.${round}`, body: `# Round ${round}\n\nkept across restarts` } });
    if (check(doc.status === 200, `host writes a doc (round ${round})`)) st.docs.push(doc.body.doc.slug);
  }

  async function verify(label) {
    const h = await api('/health');
    check(h.status === 200 && h.body.members === 3, `${label}: 3 members (host, friend, guest), got ${h.body.members}`);
    const me = await api('/me', { token: friendTok });
    check(me.status === 200 && me.body.member.id === friendId, `${label}: the friend's key still works`);
    const projs = (await api('/projects', { token: hostTok })).body.projects || [];
    const ids = projs.map(p => p.id);
    check(st.projects.every(p => ids.includes(p)), `${label}: both projects are there`);
    check(new Set(ids).size === ids.length && new Set(projs.map(p => p.name)).size === projs.length, `${label}: no duplicate projects`);
    const fp = (await api('/projects', { token: friendTok })).body.projects || [];
    check(fp.length === 1 && fp[0].id === pid, `${label}: the friend only sees the project they were invited to`);
    const mem = (await api('/members', { token: hostTok, project: pid })).body.members || [];
    const humans = mem.filter(m => m.role !== 'agent');
    check(new Set(humans.map(m => m.id)).size === humans.length, `${label}: no duplicate members`);
    const msgs = (await api('/chat/general?limit=500', { token: hostTok, project: pid })).body.messages || [];
    const got = new Set(msgs.map(m => m.id));
    const missing = st.chats.filter(c => !got.has(c.id));
    check(!missing.length, `${label}: all ${st.chats.length} chat messages kept (missing ${missing.length})`);
    check(new Set(msgs.map(m => m.id)).size === msgs.length, `${label}: no duplicate chat lines`);
    const byId = new Map(msgs.map(m => [m.id, m]));
    check(st.reacted.every(id => ((byId.get(id) || {}).reactions || {})['👍']?.includes(hostId)), `${label}: all ${st.reacted.length} reactions kept`);
    const dm = (await api(`/chat/${dmCh}?limit=500`, { token: hostTok })).body.messages || [];
    check(dm.filter(m => /^dm \d+$/.test(m.text || '')).length === st.dms, `${label}: ${st.dms} DMs kept`);
    check((await api(`/chat/${dmCh}`, { token: guest.body.token })).status === 403, `${label}: the guest cannot read someone else's DM`);
    const tasks = ((await api('/tasks', { token: hostTok, project: pid })).body.tasks || []).map(t => t.id);
    check(st.tasks.every(t => tasks.includes(t)) && new Set(tasks).size === tasks.length, `${label}: ${st.tasks.length} tasks kept, none duplicated`);
    const docs = ((await api('/docs', { token: hostTok, project: pid })).body.docs || []).map(d => d.slug);
    check(st.docs.every(d => docs.includes(d)), `${label}: ${st.docs.length} docs kept`);
    check(!tmpLeftovers(dir).length, `${label}: no half-written .tmp files left in the tribe folder`);
  }

  await addData(0);
  await verify('fresh');
  for (let r = 1; r <= RESTARTS; r++) {
    const how = r % 2 ? 'term' : 'crash';
    if (how === 'crash') {
      // A burst of messages; everything the server acknowledged must survive the crash. Then more messages that are
      // still in flight when the server is killed: those may be lost, but must never leave a broken line behind.
      const burst = await Promise.all(Array.from({ length: 25 }, (_, i) => api('/chat/general', { method: 'POST', token: friendTok, project: pid, body: { text: `burst ${r}.${i}` } }).catch(() => null)));
      const acked = burst.filter(x => x && x.status === 200);
      check(acked.length === 25, `restart ${r}: 25 concurrent messages acknowledged (${acked.length})`);
      acked.forEach(x => st.chats.push({ id: x.body.message.id, text: x.body.message.text }));
      for (let i = 0; i < 10; i++) api('/chat/general', { method: 'POST', token: friendTok, project: pid, body: { text: `inflight ${r}.${i}` } }).catch(() => {});
      await sleep(5);
    }
    const before = dirStats(dir);
    await stop(how);
    const broken = brokenJsonl(dir);
    check(!broken.length, `restart ${r}: every JSONL line and JSON file in the folder still parses after ${how === 'crash' ? 'a crash' : 'a stop'}${broken.length ? ' (' + broken.slice(0, 3).join(', ') + ')' : ''}`);
    const ms = await start(dir);
    const after = dirStats(dir);
    if (VERBOSE) console.log(`    restart ${r} (${how}) back in ${ms}ms; ${after.files} files ${Math.round(after.bytes / 1024)} KB`);
    // A restart alone must not grow the folder much (no duplicated seed files, no runaway logs).
    check(after.files - before.files <= 2, `restart ${r}: a restart adds at most 2 files (added ${after.files - before.files})`);
    check(after.bytes - before.bytes < 64 * 1024, `restart ${r}: a restart adds under 64 KB (added ${after.bytes - before.bytes} B)`);
    // The host's own computer signs back in (the desktop app lost its key) and the old key stops working.
    const rc = await api('/host/reclaim', { method: 'POST', headers: { Origin: 'http://tauri.localhost' } });
    if (check(rc.status === 200 && rc.body.member.id === hostId, `restart ${r}: host signs back in from this computer (reclaim)`)) {
      check((await api('/me', { token: hostTok })).status === 401, `restart ${r}: the host's lost key is refused`);
      hostTok = rc.body.token;
    }
    check((await api('/host/reclaim', { method: 'POST', headers: { Origin: 'http://evil.example' } })).status === 403, `restart ${r}: reclaim from another site is refused`);
    await verify(`after restart ${r}`);
    await addData(r);
    const rss = rssMB(srv.pid);
    check(rss < MAX_RSS_MB, `restart ${r}: server memory ${rss} MB < ${MAX_RSS_MB} MB`);
  }
  const fin = dirStats(dir);
  check(fin.bytes < 5 * 1024 * 1024, `the tribe folder stays small (${Math.round(fin.bytes / 1024)} KB)`);

  // ---- reset: wipe the folder and start again ----
  await stop('term');
  // A members file broken by hand: the server starts anyway and keeps a copy of it to put back.
  const mf = path.join(dir, '.tribe', 'members.json');
  fs.writeFileSync(mf, fs.readFileSync(mf, 'utf8').slice(0, 40));
  await start(dir);
  check(fs.readdirSync(path.join(dir, '.tribe')).some(f => f.startsWith('members.json.broken-')), 'a broken members.json is kept aside (members.json.broken-*) before anything overwrites it');
  await stop('term');
  fs.rmSync(dir, { recursive: true, force: true });
  await start(dir);
  const h = await api('/health');
  check(h.status === 200 && h.body.members === 0, 'reset: a wiped folder is a brand-new tribe');
  check((await api('/me', { token: friendTok })).status === 401, 'reset: old keys are refused');
  check((await api('/bootstrap', { method: 'POST', body: { name: 'Orion' } })).status === 200, 'reset: the new tribe can be bootstrapped');
  await stop('term');
  if (!KEEP) { fs.rmSync(dir, { recursive: true, force: true }); try { fs.rmSync(dir + '.server.log', { force: true }); } catch {} }
  return { dir, files: fin.files, kb: Math.round(fin.bytes / 1024) };
}

(async () => {
  const t0 = Date.now();
  console.log(`dev:loop — ${LOOPS} loops × ${RESTARTS} restarts on port ${PORT}`);
  const rows = [];
  try {
    for (let n = 1; n <= LOOPS; n++) {
      const f0 = failures.length;
      const r = await oneLoop(n);
      rows.push({ ...r, ok: failures.length === f0 });
      console.log(`  ${failures.length === f0 ? 'ok' : 'FAILED'}  ${r.files} files, ${r.kb} KB at the end`);
    }
  } catch (e) {
    failures.push('crashed: ' + (e && e.stack || e));
    console.error(e);
  } finally {
    if (srv) { try { srv.kill('SIGKILL'); } catch {} }
  }
  check(await portFree(PORT), `port ${PORT} is free at the end (no leaked server)`);
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\n${rows.filter(r => r.ok).length}/${LOOPS} loops clean · ${checks} checks · ${failures.length} failed · ${secs}s`);
  if (failures.length) { console.log('\nFailures:'); [...new Set(failures)].forEach(f => console.log('  - ' + f)); }
  process.exit(failures.length ? 1 : 0);
})();
