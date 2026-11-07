// Open Space (github.com/Fantomiald/open-space, MIT): a pixel-art office where several Claude Code sessions work
// side by side, run from the browser. It is optional and lives in the Agents hub under "Office". TribeCode installs
// it only when the host presses Install, then runs it on this computer next to the tribe:
//   - install: git clone (pinned to a reviewed commit) into ~/TribeCode-Tools/open-space, npm ci --ignore-scripts,
//     vite build. Needs git, npm and Node 22.18 or newer on the host.
//   - start: node server/index.ts with PORT=4850 (TribeCode's Working server already uses 4848), OFFICE_ROOTS set to
//     the tribe's project repos, so every Claude session in the office can open them.
//   - open: Open Space only answers 127.0.0.1 and refuses to be framed, so TribeCode opens its pairing link
//     (/pair?secret=…, the secret Open Space keeps in OFFICE_DIR) in the host's own browser.
// Everything here is host-only and local-only: it runs programs on the host's computer.
// Routes: GET /api/openspace, POST /api/openspace/install | start | stop | open.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn, execFile } = require('child_process');

const REPO = process.env.TRIBE_OPENSPACE_REPO || 'https://github.com/Fantomiald/open-space.git';
const REF = process.env.TRIBE_OPENSPACE_REF || '7b661d6';   // the commit we read through; bump after checking a newer one
const NEED = [22, 18];
const WIN = process.platform === 'win32';

module.exports = function openspace({ P, broadcast, isLocal, log = () => {} }) {
  const dir = path.resolve(process.env.TRIBE_OPENSPACE_DIR || path.join(os.homedir(), 'TribeCode-Tools', 'open-space'));
  const data = path.resolve(process.env.TRIBE_OPENSPACE_DATA || path.join(os.homedir(), '.open-space'));
  const port = Number(process.env.TRIBE_OPENSPACE_PORT) || 4850;
  const base = `http://127.0.0.1:${port}`;
  let child = null, busy = null, lines = [], error = null, tools = null;
  const say = t => { lines.push(String(t).trim()); if (lines.length > 40) lines = lines.slice(-40); };
  const push = () => broadcast({ type: 'openspace' });

  const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd || dir, env: { ...process.env, ...(opts.env || {}) }, windowsHide: true, shell: WIN && /^(npm|npx)$/.test(cmd) });
    const out = b => String(b).split(/\r?\n/).filter(Boolean).slice(-3).forEach(say);
    p.stdout.on('data', out); p.stderr.on('data', out);
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0] || ''} stopped (code ${code})`)));
  });
  const version = (cmd, args = ['--version']) => new Promise(r => execFile(cmd, args, { windowsHide: true, timeout: 8000, shell: WIN && cmd === 'npm' }, (e, out) => r(e ? null : String(out).trim().split('\n')[0])));
  async function check() {
    if (tools && Date.now() - tools.at < 60000) return tools;
    const [node, npm, git, claude] = await Promise.all([version('node'), version('npm'), version('git'), version('claude')]);
    const v = (node || '').replace(/^v/, '').split('.').map(Number);
    const nodeOk = !!node && (v[0] > NEED[0] || (v[0] === NEED[0] && v[1] >= NEED[1]));
    return (tools = { at: Date.now(), node, nodeOk, npm: !!npm, git: !!git, claude });
  }
  const MARK = () => path.join(dir, '.tribecode-installed');   // written after a full install (npm ci + build)
  const installed = () => fs.existsSync(path.join(dir, 'server', 'index.ts')) && fs.existsSync(MARK());
  const built = () => fs.existsSync(path.join(dir, 'dist'));
  const roots = () => [...new Set(P.all().map(p => p.repo).filter(r => r && fs.existsSync(r)).map(r => path.resolve(r)))];
  const secret = () => { try { return fs.readFileSync(path.join(data, 'secret'), 'utf8').trim(); } catch { return null; } };
  // Is something answering as Open Space on the port? (/pair alone answers 204 or 401 there.)
  const probe = () => new Promise(r => {
    const q = http.get(`${base}/pair`, { timeout: 1500 }, res => { res.resume(); r(res.statusCode === 204 || res.statusCode === 401); });
    q.on('error', () => r(false)); q.on('timeout', () => { q.destroy(); r(false); });
  });

  async function status() {
    const t = await check(), up = await probe();
    return { installed: installed(), running: up, ours: !!child, busy, error, log: lines.slice(-8), port, url: base,
      roots: roots().length, dir, need: NEED.join('.'),
      tools: { node: t.node, nodeOk: t.nodeOk, npm: t.npm, git: t.git, claude: t.claude } };
  }

  async function install() {
    const t = await check();
    if (!t.git) throw Object.assign(new Error('Git is needed first (git-scm.com).'), { code: 400 });
    if (!t.nodeOk) throw Object.assign(new Error(`Open Space needs Node ${NEED.join('.')} or newer (nodejs.org). This computer has ${t.node || 'no Node'}.`), { code: 400 });
    if (!t.npm) throw Object.assign(new Error('npm is needed (it comes with Node).'), { code: 400 });
    busy = 'installing'; error = null; lines = []; push();
    try {
      if (!fs.existsSync(path.join(dir, '.git'))) {
        fs.mkdirSync(path.dirname(dir), { recursive: true });
        say('Downloading Open Space…');
        await run('git', ['clone', '--filter=blob:none', '--no-checkout', REPO, dir], { cwd: path.dirname(dir) });
      } else { say('Updating Open Space…'); await run('git', ['fetch', '--quiet', 'origin']).catch(() => {}); }
      await run('git', ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', REF]);
      say('Installing its packages (no install scripts run)…');
      await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
      say('Building the office…');
      await run('npm', ['run', 'build', '--', '--logLevel', 'warn']);
      fs.writeFileSync(MARK(), REF + '\n');
      say('Ready.');
    } catch (e) { error = e.message; say(e.message); throw Object.assign(e, { code: 500 }); }
    finally { busy = null; tools = null; push(); }
  }

  async function start() {
    if (await probe()) return;
    if (!installed()) throw Object.assign(new Error('Install Open Space first.'), { code: 400 });
    if (!built()) { busy = 'building'; push(); try { await run('npm', ['run', 'build', '--', '--logLevel', 'warn']); } finally { busy = null; } }
    error = null; busy = 'starting'; push();
    const env = { ...process.env, PORT: String(port), OFFICE_DIR: data, OFFICE_ROOTS: roots().join(path.delimiter) };
    child = spawn(process.env.TRIBE_OPENSPACE_NODE || 'node', ['server/index.ts'], { cwd: dir, env, windowsHide: true });
    const out = b => String(b).split(/\r?\n/).filter(Boolean).forEach(say);
    child.stdout.on('data', out); child.stderr.on('data', out);
    child.on('error', e => { error = e.message; child = null; push(); });
    child.on('exit', code => { if (code && !error) error = `Open Space stopped (code ${code}).`; child = null; busy = null; push(); });
    for (let i = 0; i < 40 && child; i++) { if (await probe()) break; await new Promise(r => setTimeout(r, 250)); }
    busy = null; push();
    if (!(await probe())) throw Object.assign(new Error(error || 'Open Space did not start. See its log below.'), { code: 500 });
    log(`Open Space is running at ${base}`);
  }
  function stop() { if (child) { try { child.kill(); } catch {} child = null; } push(); }
  process.on('exit', () => { if (child) try { child.kill(); } catch {} });

  // Open the office in the host's own browser (the pairing link signs that browser in once).
  function open() {
    const s = secret(), url = s ? `${base}/pair?secret=${encodeURIComponent(s)}` : base;
    if (process.env.TRIBE_TEST === '1' || process.env.TRIBE_NO_BROWSER === '1') return url;
    const [cmd, args] = WIN ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch {}
    return url;
  }

  async function route(req, res, { m, b, me, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    if (m === 'GET' && !b) {
      const st = await status();
      if (me.role !== 'host' || !isLocal(req)) return send(res, 200, { installed: st.installed, running: st.running, port, hostOnly: true });
      return send(res, 200, st);
    }
    if (me.role !== 'host' || !isLocal(req)) return fail(res, 403, 'Open Space runs on the host computer: open TribeCode there');
    if (m !== 'POST') return fail(res, 405, 'POST');
    try {
      if (b === 'install') { if (busy) return fail(res, 409, 'already ' + busy); install().catch(() => {}); return send(res, 202, await status()); }
      if (b === 'start') { await start(); return send(res, 200, await status()); }
      if (b === 'stop') { stop(); return send(res, 200, await status()); }
      if (b === 'open') { if (!(await probe())) await start(); const url = open(); return send(res, 200, { ...(await status()), opened: true, pair: process.env.TRIBE_TEST === '1' ? url : undefined }); }
    } catch (e) { return fail(res, e.code || 500, e.message); }
    return fail(res, 404, 'install, start, stop or open');
  }
  return { route, status, stop };
};
