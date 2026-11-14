// Publish for real (feat/publish-real, docs/PUBLISH.md): the play link's siblings. Same Publish sheet, same safety
// check, but the result outlives the tribe being online:
//   a zip to put on any web host · a live page on the person's own GitHub (GitHub Pages) · an itch.io-ready zip for
//   games · an installable app (manifest + offline file + icons) · app wrappers built by GitHub in the person's account
//   (Android now; iPhone prepared, needs their Apple account).
// The logic that decides and builds lives in app/ui/pubcore.js (shared with the browser). This file reads the web
// folder, runs it through that core, and talks to GitHub with the member's own saved sign-in (workspace.js secrets).
// Tokens are never sent to a browser, never logged, and never used for another member.
//
// API (members of the project; spectators and AI helpers can look, not send):
//   GET  /api/publish/real?project=            -> { kind, sensed, checks, findings, blocked, name, slug, dest, github:{signedIn,login}, files, bytes, itch }
//   PUT  /api/publish/real                     { project, kind?, pwa?, color? }           -> { dest }
//   GET  /api/publish/real/zip?project=&for=web|itch                                      -> the zip
//   POST /api/publish/real/pages               { project, title, desc, name?, icons? }    -> { url, repo, pagesEnabled, settingsUrl, version }
//   POST /api/publish/real/wrapper             { project, kind:'android'|'ios', on }      -> { dest }   (sent with the next Publish; done right away when a page is live)
//   GET  /api/publish/real/build?project=      -> { state:'none'|'queued'|'building'|'ready'|'failed', download?, page? }   the Android build on GitHub
// Test hook: TRIBE_GITHUB_API.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const core = require('../app/ui/pubcore.js');

const TEXT = /\.(html?|m?js|cjs|css|json|txt|md|xml|svg|webmanifest|map|csv|ya?ml|toml)$/i;
const MAX_PAGES_FILES = 600, MAX_PAGES_BYTES = 90 * 1024 * 1024;
const HEX = /^#[0-9a-fA-F]{6}$/;

// ---------- a small ZIP writer (deflate, no dependencies) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { if (zlib.crc32) return zlib.crc32(buf) >>> 0; let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(entries) {   // [{ path, data: Buffer }]
  const parts = [], central = []; let off = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    const name = Buffer.from(e.path, 'utf8'), raw = e.data, crc = crc32(raw);
    const stored = /\.(png|jpe?g|gif|webp|avif|mp3|ogg|m4a|mp4|webm|woff2?|zip|glb|wasm)$/i.test(e.path) || raw.length < 64;
    const body = stored ? raw : zlib.deflateRawSync(raw, { level: 6 }), method = stored ? 0 : 8;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8); h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, name, body);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10); c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(0, 30); c.writeUInt32LE(0, 34); c.writeUInt32LE(0, 38); c.writeUInt32LE(off, 42);
    central.push(c, name); off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
// ---------- a plain PNG icon (flat color, a lighter disc), for when no browser drew a better one ----------
function pngIcon(size, color) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt((HEX.test(color || '') ? color : '#F26B1D').slice(i, i + 2), 16));
  const row = 1 + size * 4, raw = Buffer.alloc(row * size), cx = size / 2, rad = size * 0.28;
  for (let y = 0; y < size; y++) { raw[y * row] = 0; for (let x = 0; x < size; x++) { const o = y * row + 1 + x * 4, in_ = (x - cx) ** 2 + (y - cx) ** 2 < rad * rad; raw[o] = in_ ? 255 : r; raw[o + 1] = in_ ? 255 : g; raw[o + 2] = in_ ? 255 : b; raw[o + 3] = 255; } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = function publishReal({ P, W, base, publish, getMembers, broadcast = () => {}, nameOf = id => id, fetchImpl, log = () => {} }) {
  const FILE = '.tribe/publish-real.json';
  let db = base.readJSON(FILE, { projects: {} }); db.projects = db.projects || {};
  const save = () => base.writeJSON(FILE, db);
  const err = (status, msg, extra) => Object.assign(new Error(msg), { status }, extra || {});
  const API = () => String(process.env.TRIBE_GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
  const f = (...a) => (fetchImpl || fetch)(...a);
  const destOf = pid => (db.projects[pid] = db.projects[pid] || {});
  const tokenOf = me => { try { return (W.readSecret(me.id) || {}).githubToken || ''; } catch { return ''; } };
  const loginOf = me => { try { return (W.readSecret(me.id) || {}).githubLogin || ''; } catch { return ''; } };
  const canSend = (me, pid) => publish.canPublish(me, pid) && me.role !== 'agent';

  // The web folder as a bundle. The preview's web root first; a designed website (site/) when there is no app yet.
  function bundle(pid) {
    let src;
    try { src = publish.files(pid); }
    catch (e) {
      const p = P.get(pid), dir = p && p.repo && path.join(p.repo, 'site');
      if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) throw e;
      const list = []; (function walk(d, rel) { for (const x of fs.readdirSync(d, { withFileTypes: true })) { if (x.name.startsWith('.') || x.isSymbolicLink()) continue; const abs = path.join(d, x.name), r = rel ? `${rel}/${x.name}` : x.name; if (x.isDirectory()) walk(abs, r); else if (x.isFile()) list.push({ rel: r, abs, size: fs.statSync(abs).size }); } })(dir, '');
      src = { root: dir, list, total: list.reduce((n, x) => n + x.size, 0) };
    }
    const out = [];
    for (const x of src.list) {
      if (x.dirSecret || x.skip || /^\.env/i.test(path.basename(x.rel))) continue;
      const o = { path: x.rel, size: x.size, abs: x.abs };
      if (TEXT.test(x.rel) && x.size <= 2 * 1024 * 1024) { try { o.text = fs.readFileSync(x.abs, 'utf8'); } catch {} }
      out.push(o);
    }
    return out;
  }
  const bytesOf = x => (x.text != null && !x.abs ? Buffer.from(x.text, 'utf8') : x.b64 != null ? Buffer.from(x.b64, 'base64') : x.text != null && x.dirty ? Buffer.from(x.text, 'utf8') : x.abs ? fs.readFileSync(x.abs) : Buffer.alloc(0));
  function metaOf(pid, body = {}) {
    const p = P.get(pid) || {}, d = destOf(pid), cur = (publish.entriesOf(pid) || [])[0] || {};
    const color = HEX.test(body.color || '') ? body.color : HEX.test(d.color || '') ? d.color : '#F26B1D';
    const m = { title: String(body.title || d.title || cur.title || p.name || 'My project').trim().slice(0, 80), desc: String(body.desc != null ? body.desc : (d.desc || cur.desc || p.bio || '')).replace(/\s+/g, ' ').trim().slice(0, 240),
      color, kind: d.kind || null, pwa: d.pwa !== false, version: (d.version || 0) + 1 };
    const ic = body.icons && typeof body.icons === 'object' ? body.icons : null;
    const okPng = s => typeof s === 'string' && s.length < 1.5 * 1024 * 1024 && /^(data:image\/png;base64,)?[A-Za-z0-9+/=]+$/.test(s.slice(0, 80) + s.slice(-20));
    m.icons = { 192: ic && okPng(ic['192']) ? ic['192'] : pngIcon(192, color).toString('base64'), 512: ic && okPng(ic['512']) ? ic['512'] : pngIcon(512, color).toString('base64') };
    return m;
  }
  // The finished bundle: the web folder, completed (name, description, phone setting, icon, install files).
  function finished(pid, body) {
    const raw = bundle(pid), meta = metaOf(pid, body); meta.kind = meta.kind || core.kindOf(raw);
    const fin = core.finish(raw, { ...meta, pwa: meta.pwa && meta.kind !== 'site' ? true : !!destOf(pid).pwaSite });
    const byPath = new Map(raw.map(x => [x.path, x]));
    for (const x of fin) { const o = byPath.get(x.path); if (o && o.abs && x.text === o.text) x.abs = o.abs; else if (x.text != null) x.dirty = true; }
    return { files: fin, meta, raw };
  }
  function view(pid, me) {
    const d = destOf(pid);
    return { kind: d.kind || null, pwa: d.pwa !== false, color: d.color || null, version: d.version || 0,
      pages: d.pages ? { url: d.pages.url, repo: d.pages.repo, web: d.pages.web, at: d.pages.at, by: d.pages.by, byName: nameOf(d.pages.by), pagesEnabled: d.pages.pagesEnabled, settingsUrl: d.pages.settingsUrl, version: d.pages.version } : null,
      android: d.android ? { on: !!d.android.on, pkg: d.android.pkg || null, sent: !!d.android.sent } : { on: false }, ios: d.ios ? { on: !!d.ios.on, sent: !!d.ios.sent } : { on: false } };
  }
  function status(pid, me) {
    const p = P.get(pid) || {}; let raw = null, problem = null;
    try { raw = bundle(pid); } catch (e) { problem = e.message; }
    const d = destOf(pid), sensed = raw ? core.kindOf(raw) : 'site', kind = d.kind || sensed;
    let ch = { findings: [], blocked: false }; if (raw) { try { ch = publish.check(pid); } catch {} }
    const meta = raw ? metaOf(pid) : {};
    const play = (publish.entriesOf(pid) || [])[0] || null;
    const dest = view(pid, me);
    const next = !raw ? 'build' : ch.blocked ? 'fix' : !play && !dest.pages ? 'publish' : !dest.pages ? 'pages' : kind !== 'site' && !dest.android.on ? 'app' : 'share';
    return { project: pid, name: p.name || '', slug: core.slug((d.pages && d.pages.repo && d.pages.repo.split('/')[1]) || p.name), kind, sensed, problem,
      checks: raw ? core.preflight(raw, { kind }) : [], findings: ch.findings || [], blocked: !!ch.blocked, files: raw ? raw.length : 0, bytes: raw ? raw.reduce((n, x) => n + x.size, 0) : 0,
      itch: raw ? core.itch(core.finish(raw, { ...meta, pwa: false })) : null, dest, play: play ? { url: play.url, version: play.version } : null, next,
      github: { signedIn: !!tokenOf(me), login: loginOf(me) || null }, canSend: canSend(me, pid) };
  }

  function zipFor(pid, what) {
    const ch = publish.check(pid); if (ch.blocked) throw err(409, 'The safety check found something that must be fixed first.', { findings: ch.findings });
    const { files, meta } = finished(pid, {}); let list = files;
    if (what === 'itch') { list = core.finish(bundle(pid), { ...meta, pwa: false }).map(x => ({ ...x, dirty: x.text != null })); const it = core.itch(list); if (!it.ok) throw err(409, it.problems[0]); }
    const src = new Map(bundle(pid).map(x => [x.path, x]));
    const entries = list.map(x => { const o = src.get(x.path); return { path: x.path, data: x.b64 != null ? Buffer.from(x.b64, 'base64') : (o && o.text === x.text && o.abs) ? fs.readFileSync(o.abs) : x.text != null ? Buffer.from(x.text, 'utf8') : o && o.abs ? fs.readFileSync(o.abs) : Buffer.alloc(0) }; });
    return { name: `${core.slug(meta.title)}${what === 'itch' ? '-itch' : ''}.zip`, data: zip(entries) };
  }

  async function pages(pid, me, body) {
    if (!canSend(me, pid)) throw err(403, me.role === 'agent' ? 'AI helpers can\'t publish outside the tribe. Ask your owner to press Publish.' : 'you can\'t publish this project');
    const token = tokenOf(me); if (!token) throw err(401, 'Sign in to GitHub first (Settings › GitHub). It takes a minute and is free.', { needGithub: true });
    const ch = publish.check(pid); if (ch.blocked) throw err(409, 'The safety check found something that must be fixed before this goes public.', { findings: ch.findings });
    const d = destOf(pid), { files, meta } = finished(pid, body);
    const total = files.reduce((n, x) => n + (x.size || 0), 0);
    if (files.length > MAX_PAGES_FILES) throw err(413, `${files.length} files is more than a GitHub page can take from here (${MAX_PAGES_FILES}). Download the zip instead.`);
    if (total > MAX_PAGES_BYTES) throw err(413, 'Over 90 MB. Download the zip instead, or make the pictures and sound smaller.');
    const name = core.slug(body.name || (d.pages && d.pages.repo && d.pages.repo.split('/')[1]) || meta.title);
    const src = new Map(bundle(pid).map(x => [x.path, x]));
    const out = files.map(x => { const o = src.get(x.path); const buf = x.b64 != null ? null : (o && o.text === x.text && o.abs) ? fs.readFileSync(o.abs) : x.text != null ? Buffer.from(x.text, 'utf8') : o && o.abs ? fs.readFileSync(o.abs) : Buffer.alloc(0); return { path: x.path, b64: x.b64 != null ? x.b64 : buf.toString('base64') }; });
    // app wrappers ride along, beside the page (GitHub builds them in the person's account)
    const login = loginOf(me) || (d.pages && d.pages.login) || 'me';
    const guess = `https://${String(login).toLowerCase()}.github.io/${name}/`, url0 = (d.pages && d.pages.url) || guess;
    const wm = { ...meta, url: url0, pkg: (d.android && d.android.pkg) || core.pkgId(login, name), version: meta.version };
    const wrap = [];
    if (d.android && d.android.on) wrap.push(...core.wrapperFiles('android', wm));
    if (d.ios && d.ios.on) wrap.push(...core.wrapperFiles('ios', wm));
    for (const w of wrap) out.push({ path: w.path, b64: Buffer.from(w.text, 'utf8').toString('base64') });
    let r;
    try { r = await core.pagesPublish({ fetch: f, api: API(), token, name, title: meta.title, desc: meta.desc, files: out, project: pid, message: `Publish ${meta.title} (version ${meta.version}) with TribeCode`, wait: process.env.TRIBE_TEST ? 5 : undefined }); }
    catch (e) {
      if (e.status === 401) throw err(401, 'GitHub didn\'t accept the sign-in. Sign in again in Settings › GitHub.', { needGithub: true });
      if (e.status === 403 || e.status === 404) throw err(403, wrap.length ? 'GitHub refused. Your sign-in may not be allowed to add app builds (it needs the "workflow" permission). Sign in again in Settings › GitHub.' : 'GitHub refused. Your sign-in may not be allowed to make new projects.', { needGithub: true });
      if (e.taken) throw err(409, e.message, { taken: true });
      throw err(e.status && e.status < 600 ? 502 : 500, 'GitHub: ' + String(e.message || 'did not answer').slice(0, 200));
    }
    // the page's real address is only known now; if it differs from the guess the wrapper config is re-sent next time
    d.version = meta.version; d.title = meta.title; d.desc = meta.desc; if (HEX.test(body.color || '')) d.color = body.color;
    d.pages = { url: r.url, repo: r.repo, web: r.web, login: r.login, at: new Date().toISOString(), by: me.id, pagesEnabled: r.pagesEnabled, settingsUrl: r.settingsUrl, version: meta.version, commit: r.commit };
    if (d.android && d.android.on) { d.android.pkg = wm.pkg; d.android.sent = true; d.android.url = url0; }
    if (d.ios && d.ios.on) d.ios.sent = true;
    save(); broadcast({ type: 'publish', project: pid, real: true });
    log(`published ${pid} to GitHub Pages ${r.repo} (${out.length} files)`);
    return { url: r.url, repo: r.repo, web: r.web, pagesEnabled: r.pagesEnabled, settingsUrl: r.settingsUrl, version: meta.version, created: r.created, dest: view(pid, me) };
  }
  async function build(pid, me) {
    const d = destOf(pid); if (!d.pages || !d.android || !d.android.on || !d.android.sent) return { state: 'none' };
    const token = tokenOf(me), repo = d.pages.repo, page = `https://github.com/${repo}/actions`;
    const download = `https://github.com/${repo}/releases/latest/download/app.apk`, releases = `https://github.com/${repo}/releases/latest`;
    if (!token) return { state: 'unknown', page, download, releases };
    try {
      const r = await f(`${API()}/repos/${repo}/actions/workflows/tribecode-android.yml/runs?per_page=1`, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'TribeCode' } });
      const j = await r.json().catch(() => ({})), run = (j.workflow_runs || [])[0];
      if (!r.ok || !run) return { state: r.ok ? 'queued' : 'unknown', page, download, releases };
      const state = run.status !== 'completed' ? (run.status === 'queued' ? 'queued' : 'building') : run.conclusion === 'success' ? 'ready' : 'failed';
      return { state, page: run.html_url || page, download, releases };
    } catch { return { state: 'unknown', page, download, releases }; }
  }

  async function route(req, res, { m, c, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pidOf = v => { const pid = String(v || P.current() || ''); if (!P.get(pid) || !P.canSee(me, pid)) throw err(404, 'project not found'); return pid; };
    try {
      if (m === 'GET' && !c) return send(res, 200, status(pidOf(url.searchParams.get('project')), me));
      if (m === 'PUT' && !c) {
        const body = await readBody(req, 4096).catch(() => ({})); const pid = pidOf(body.project);
        if (!canSend(me, pid)) return fail(res, 403, 'you can\'t change how this project is published');
        const d = destOf(pid);
        if (body.kind === '' || body.kind === null) delete d.kind; else if (['site', 'game', 'app'].includes(body.kind)) d.kind = body.kind;
        if (typeof body.pwa === 'boolean') d.pwa = body.pwa;
        if (HEX.test(body.color || '')) d.color = body.color;
        save(); return send(res, 200, status(pid, me));
      }
      if (m === 'GET' && c === 'zip') {
        const pid = pidOf(url.searchParams.get('project')); if (!publish.canPublish(me, pid)) return fail(res, 403, 'you can\'t download this project');
        const z = zipFor(pid, url.searchParams.get('for') === 'itch' ? 'itch' : 'web');
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': z.data.length, 'Content-Disposition': `attachment; filename="${z.name.replace(/[^\w.-]/g, '')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
        res.end(z.data); return true;
      }
      if (m === 'POST' && c === 'pages') { const body = await readBody(req, 4 * 1024 * 1024).catch(() => ({})); return send(res, 200, await pages(pidOf(body.project), me, body || {})); }
      if (m === 'POST' && c === 'wrapper') {
        const body = await readBody(req, 4096).catch(() => ({})); const pid = pidOf(body.project);
        if (!canSend(me, pid)) return fail(res, 403, 'you can\'t change how this project is published');
        if (!['android', 'ios'].includes(body.kind)) return fail(res, 400, 'kind is android or ios');
        const d = destOf(pid); d[body.kind] = { ...(d[body.kind] || {}), on: body.on !== false }; if (!d[body.kind].on) d[body.kind].sent = false;
        save();
        if (d.pages && d[body.kind].on) { const r = await pages(pid, me, {}); return send(res, 200, { ...r, sent: true }); }
        return send(res, 200, { dest: view(pid, me), sent: false });
      }
      if (m === 'GET' && c === 'build') return send(res, 200, await build(pidOf(url.searchParams.get('project')), me));
    } catch (e) {
      if (e.findings) return send(res, e.status || 409, { error: e.message, findings: e.findings });
      return send(res, e.status || 500, { error: e.message, needGithub: !!e.needGithub, taken: !!e.taken });
    }
    return fail(res, 404, 'no such publish route');
  }
  return { route, status, zipFor, pages, view };
};
module.exports.zip = zip;
module.exports.pngIcon = pngIcon;
