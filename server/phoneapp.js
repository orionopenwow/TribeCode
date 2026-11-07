// Phone app mode (docs/PHONE-APP-MODE.md): a per-project switch for building an iPhone / Android app.
//   GET  /api/phoneapp                 -> { on, stack, folder, setUp, hasRepo, hasPackage, installed, canInstall, install, expo, stacks }
//   PUT  /api/phoneapp  { on?, stack? }  builders: turn the mode on/off, pick the stack (expo | capacitor | tauri)
//   POST /api/phoneapp/setup { stack? }  builders: write the starter (repo root when the repo is empty, else /mobile),
//                                        commit it ("TribeCode: phone app starter"), add the stack's shelf items to the Toolbox
//   POST /api/phoneapp/install { scripts? }  HOST ONLY, from the host computer (isLocal): `npm install` in that folder,
//                                        with --ignore-scripts unless `scripts` is true. The log streams over the WebSocket.
// Nothing here runs a command that came from chat or from a friend: the only command is the fixed npm install line.
// Tests replace npm with TRIBE_PHONEAPP_NPM (a command line; " install …" is appended).
// Expo Go: while `npx expo start` runs on the host (Metro on 127.0.0.1:8081, TRIBE_PHONEAPP_METRO_PORT), `expo` holds
// the exp:// links for the host's Wi-Fi addresses, so the Preview pane can show the QR code.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const gitutil = require('./gitutil');
const TEMPLATES = require('./phoneapp-templates');   // the starters, as code (the desktop app bundles server/*.js only)

const STACKS = {
  expo: { title: 'Expo (React Native)', why: 'The easy start: one JavaScript app for iPhone and Android, on your phone in seconds with Expo Go.', shelf: ['expo'], recommended: true },
  capacitor: { title: 'Capacitor', why: 'Already have a web app? It wraps it as real iPhone and Android apps.', shelf: ['capacitor'] },
  tauri: { title: 'Tauri mobile', why: 'For a Tauri desktop app or Rust: small and fast, but needs Rust, Xcode or Android Studio.', shelf: ['tauri'] },
};
const FILE = '.tribe/phoneapp.json';
const IGNORE_EMPTY = new Set(['.git', 'README.md', 'README', 'readme.md', 'LICENSE', 'LICENSE.md', '.gitignore', '.gitattributes', 'TRIBE_CONTEXT.md', 'TOOLBOX.md', 'VISION.md', 'PLAN.md', 'CLAUDE.md', '.claude', '.tribe', '.github']);
const WIN = process.platform === 'win32';

module.exports = function phoneapp({ P, store, shelf, broadcast, isLocal, lanUrls = () => [], nameOf = id => id, log = () => {} }) {
  const metroPort = () => Number(process.env.TRIBE_PHONEAPP_METRO_PORT) || 8081;
  const all = () => store.readJSON(FILE, {}) || {};
  const get = pid => ({ on: false, stack: 'expo', folder: null, setUp: false, ...(all()[pid] || {}) });
  const put = (pid, patch) => { const a = all(); a[pid] = { ...get(pid), ...patch }; store.writeJSON(FILE, a); return a[pid]; };
  const jobs = new Map();   // pid -> { running, ok, error, log[], at, scripts }
  const err = (status, m) => Object.assign(new Error(m), { status });
  const repoOf = p => { if (!p || !p.repo) return null; try { return fs.realpathSync(p.repo); } catch { return null; } };
  const canBuild = (me, p) => me && me.role !== 'spectator' && me.role !== 'agent' && (p.members || {})[me.id] !== 'spectator';
  const dirOf = (repo, folder) => (folder ? path.join(repo, folder) : repo);
  const push = pid => broadcast({ type: 'phoneapp', project: pid });

  // Is Expo's dev server (Metro) running on the host? It answers /status with "packager-status:running".
  const metro = () => new Promise(r => {
    const q = http.get({ host: '127.0.0.1', port: metroPort(), path: '/status', timeout: 800 }, res => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => r(/packager-status:running/.test(b))); });
    q.on('error', () => r(false)); q.on('timeout', () => { q.destroy(); r(false); });
  });
  async function expo(s) {
    if (s.stack !== 'expo' || !s.setUp) return { running: false };
    const running = await metro();
    if (!running) return { running: false, port: metroPort() };
    const ips = lanUrls().map(u => { try { return { host: new URL(u.url).hostname, kind: u.kind }; } catch { return null; } }).filter(Boolean);
    const links = ips.map(x => ({ url: `exp://${x.host}:${metroPort()}`, kind: x.kind }));
    return { running: true, port: metroPort(), links, url: (links[0] || {}).url || `exp://127.0.0.1:${metroPort()}` };
  }

  async function view(p, me, req) {
    const s = get(p.id), repo = repoOf(p), dir = repo && s.setUp ? dirOf(repo, s.folder) : null, job = jobs.get(p.id);
    return {
      ...s, hasRepo: !!repo, stacks: STACKS,
      hasPackage: !!(dir && fs.existsSync(path.join(dir, 'package.json'))),
      installed: !!(dir && fs.existsSync(path.join(dir, 'node_modules'))),
      canEdit: canBuild(me, p), canInstall: me.role === 'host' && isLocal(req),
      install: job ? { running: job.running, ok: job.ok, error: job.error, log: job.log.slice(-14), at: job.at, scripts: job.scripts } : null,
      expo: s.on ? await expo(s) : { running: false },
    };
  }

  // ---------- the starter ----------
  const isEmpty = repo => { try { return fs.readdirSync(repo).every(n => IGNORE_EMPTY.has(n)); } catch { return false; } };
  const slugOf = s => String(s || 'app').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app';
  function fill(text, file, vars) {
    const json = s => JSON.stringify(s).slice(1, -1), html = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const name = /\.json$/.test(file) ? json(vars.NAME) : /\.html$/.test(file) ? html(vars.NAME) : vars.NAME.replace(/[`$\\]/g, '');
    return text.replace(/\{\{NAME_JS\}\}/g, `{${JSON.stringify(vars.NAME)}}`).replace(/\{\{NAME\}\}/g, name).replace(/\{\{SLUG\}\}/g, vars.SLUG).replace(/\{\{ID\}\}/g, vars.ID);
  }
  async function setup(p, me, stack) {
    if (!STACKS[stack]) throw err(400, 'pick expo, capacitor or tauri');
    const repo = repoOf(p); if (!repo) throw err(400, 'give the project a repo first (Repo → set up)');
    const s = get(p.id);
    if (s.setUp) throw err(409, `already set up in ${s.folder ? s.folder + '/' : 'the repo root'}`);
    const folder = isEmpty(repo) && !fs.existsSync(path.join(repo, 'package.json')) ? '' : 'mobile';
    const dir = dirOf(repo, folder);
    if (folder && fs.existsSync(dir) && fs.readdirSync(dir).length) throw err(409, 'the repo already has a mobile/ folder: move it, or set the app up by hand');
    const base = slugOf(p.name), vars = { NAME: String(p.name || 'My app').slice(0, 48), SLUG: folder ? `${base}-mobile` : base, ID: base.replace(/-/g, '') || 'app' };
    const written = [];
    for (const [f, text] of Object.entries(TEMPLATES[stack])) {
      const outRel = f === 'gitignore' ? '.gitignore' : f;
      const out = path.join(dir, ...outRel.split('/'));
      if (fs.existsSync(out)) {   // never overwrite: an empty repo's own README / .gitignore get the starter's lines added
        if (!folder && (outRel === 'README.md' || outRel === '.gitignore')) {
          const cur = fs.readFileSync(out, 'utf8'), extra = fill(text, f, vars);
          const more = outRel === '.gitignore' ? extra.split('\n').filter(l => l && !cur.split(/\r?\n/).includes(l)).join('\n') : extra;
          if (more.trim()) { fs.writeFileSync(out, cur.replace(/\s*$/, '\n\n') + more.replace(/\s*$/, '\n')); written.push(outRel); }
        }
        continue;
      }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, fill(text, f, vars));
      written.push((folder ? `${folder}/` : '') + outRel);
    }
    put(p.id, { on: true, stack, folder, setUp: true, at: new Date().toISOString(), by: me.id });
    // the stack's tools go in the Toolbox (TOOLBOX.md in the repo + the Toolbox doc), committed with the starter
    const added = [];
    for (const id of STACKS[stack].shelf) { try { await shelf.add(id, p.id, me); added.push(id); } catch (e) { log(`phone app: shelf ${id}: ${e.message}`); } }
    const paths = [...written, ...(fs.existsSync(path.join(repo, 'TOOLBOX.md')) && !written.includes('TOOLBOX.md') ? ['TOOLBOX.md'] : [])];
    // commit only these files, as the person who pressed the button
    let committed = false, commitError = null;
    if (fs.existsSync(path.join(repo, '.git')) && written.length) {
      const G = gitutil(repo);
      const add = await G.gitTry(['add', '--', ...paths]);
      const who = String(nameOf(me.id) || 'TribeCode').replace(/[<>\n]/g, '').slice(0, 40) || 'TribeCode';
      const c = add.code === 0 ? await G.gitTry([...(await G.identity()), 'commit', '--quiet', '-m', 'TribeCode: phone app starter', `--author=${who} <${me.id}@tribecode.local>`, '--', ...paths]) : add;
      committed = c.code === 0; if (!committed) commitError = (c.err || c.out || 'git commit failed').split('\n')[0];
    }
    push(p.id);
    return { ok: true, folder, written, committed, commitError, toolbox: added };
  }

  // ---------- npm install (host only) ----------
  function install(p, scripts) {
    const s = get(p.id), repo = repoOf(p);
    if (!s.setUp || !repo) throw err(400, 'set the phone app up first');
    const dir = dirOf(repo, s.folder);
    if (!fs.existsSync(path.join(dir, 'package.json'))) throw err(400, `no package.json in ${s.folder || 'the repo root'}`);
    const cur = jobs.get(p.id); if (cur && cur.running) throw err(409, 'already installing');
    const job = { running: true, ok: false, error: null, log: [], at: new Date().toISOString(), scripts: !!scripts };
    jobs.set(p.id, job);
    const npm = process.env.TRIBE_PHONEAPP_NPM || 'npm';
    const line = `${npm} install --no-audit --no-fund${scripts ? '' : ' --ignore-scripts'}`;   // a fixed line: nothing from the request goes in
    const say = t => { for (const l of String(t).split(/\r?\n/)) { const x = l.replace(/\x1b\[[0-9;]*m/g, '').trim(); if (x) job.log.push(x.slice(0, 200)); } if (job.log.length > 80) job.log = job.log.slice(-80); };
    say(`$ ${line.replace(npm, 'npm')}  (in ${s.folder || 'the repo root'})`);
    let t = null; const soon = () => { if (!t) t = setTimeout(() => { t = null; push(p.id); }, 300); };
    let child;
    try { child = spawn(line, { cwd: dir, shell: true, windowsHide: true, env: { ...process.env, npm_config_update_notifier: 'false' } }); }
    catch (e) { job.running = false; job.error = e.message; say(e.message); push(p.id); return job; }
    const out = b => { say(b); soon(); };
    child.stdout.on('data', out); child.stderr.on('data', out);
    child.on('error', e => { job.error = e.message; say(e.message); });
    child.on('close', code => { job.running = false; job.ok = code === 0; if (code !== 0 && !job.error) job.error = `npm install stopped (code ${code})`; say(job.ok ? 'Done: dependencies installed.' : job.error); push(p.id); });
    push(p.id);
    return job;
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    const p = P.get(P.current() || P.defaultId()); if (!p || !P.canSee(me, p.id)) return fail(res, 404, 'project not found');
    try {
      if (!b && m === 'GET') return send(res, 200, await view(p, me, req));
      if (!b && m === 'PUT') {
        if (!canBuild(me, p)) return fail(res, 403, 'read-only');
        const body = await readBody(req), patch = {};
        if (typeof body.on === 'boolean') patch.on = body.on;
        if (body.stack !== undefined) { if (!STACKS[body.stack]) return fail(res, 400, 'pick expo, capacitor or tauri'); if (get(p.id).setUp && body.stack !== get(p.id).stack) return fail(res, 409, 'the starter is already set up'); patch.stack = body.stack; }
        put(p.id, patch); push(p.id);
        return send(res, 200, await view(p, me, req));
      }
      if (b === 'setup' && m === 'POST') {
        if (!canBuild(me, p)) return fail(res, 403, 'read-only');
        const body = await readBody(req);
        return send(res, 200, await setup(p, me, body.stack || get(p.id).stack));
      }
      if (b === 'install' && m === 'POST') {
        if (me.role !== 'host' || !isLocal(req)) return fail(res, 403, 'installing runs programs on the host computer: open TribeCode there');
        const body = await readBody(req);
        install(p, body.scripts === true);
        return send(res, 202, await view(p, me, req));
      }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, get };
};
