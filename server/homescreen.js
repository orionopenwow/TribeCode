// Put it on your phone (docs/HOMESCREEN-PATH.md): the server side of the guided path from a project to an icon on a
// phone's home screen. The words, steps and the installability check live in app/ui/homescreen-core.js (shared with the
// browser); publishing itself stays in the Publish sheet (server/publish.js, server/publishreal.js). This file:
//   GET  /api/homescreen?project=            -> { project, kind, canFix, check, links: [{ id, url }], cloud, problem }
//          check = the web folder as it is now (homescreen-core check()).
//   POST /api/homescreen/fix   { project, icons?: { 192, 512 } }   builders who may publish (perms 'site.publish')
//          Adds what is missing to the project's own web folder so every way of sharing it installs: a manifest (or the
//          missing fields of the one it has), 192/512 PNG icons and a maskable one (the Launch kit's icon when the
//          browser sends it, else one drawn from the name and color), an iPhone icon, the phone viewport and an offline
//          copy (service worker). Never overwrites a file except the manifest it patches and index.html (tags added).
//          Saved as a version (git commit) when the project has a code folder. -> { changed: [path], check }
//   POST /api/homescreen/undo  { project, undo }   puts back what one fix changed (the id the fix returned)
//   POST /api/homescreen/reach { project, url }   checks a live link from the server: does it answer, is it https, and
//          does the page it serves pass the check? Only the project's own play link or GitHub page (or the same site),
//          so it can't be used to probe other addresses. -> { ok, status, https, local, check }
// Nothing here calls an AI or keeps a token.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('../app/ui/homescreen-core.js');
const pub = require('../app/ui/pubcore.js');

module.exports = function homescreen({ P, W, publishReal, publish, preview, getMembers = () => [], perms = null, broadcast = () => {}, log = () => {}, fetchImpl }) {
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const f = (...a) => (fetchImpl || fetch)(...a);
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const canFix = (me, pid) => !!me && me.role !== 'agent' && me.role !== 'spectator' && publish.canPublish(me, pid) && (!perms || perms.can(me, 'site.publish', pid));

  // the web folder's text files, as homescreen-core reads them
  function filesOf(pid) {
    const out = {}; let list = [];
    try { list = publishReal.bundle(pid); } catch (e) { return { files: null, problem: e.message, list: [] }; }
    for (const x of list) if (x.text != null) out[x.path] = x.text;
    return { files: out, list, problem: null };
  }
  function rootOf(pid) {
    try { const r = preview.rootOf(pid); if (r && r.root) return r.root; } catch {}
    const p = P.get(pid), dir = p && p.repo && path.join(p.repo, 'site');
    return dir && fs.existsSync(path.join(dir, 'index.html')) ? dir : null;
  }
  function links(pid) {
    const out = [];
    try { const e = (publish.entriesOf(pid) || [])[0]; if (e && e.url) out.push({ id: 'play', url: e.url, version: e.version || 0 }); } catch {}
    try { const v = publishReal.view(pid); if (v && v.pages && v.pages.url) out.push({ id: 'pages', url: v.pages.url, version: v.pages.version || 0 }); } catch {}
    return out;
  }
  function view(pid, me) {
    const p = P.get(pid) || {}, r = filesOf(pid);
    const kind = r.list.length ? pub.kindOf(r.list) : 'site';
    return { project: pid, name: p.name || '', kind, canFix: canFix(me, pid), check: r.files ? core.check(r.files) : null, problem: r.problem,
      links: links(pid), cloud: !!process.env.TRIBE_CLOUD, read: core.READ };
  }

  // ---------- the fix ----------
  const okPng = s => typeof s === 'string' && s.length < 1.5 * 1024 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s.slice(0, 60) + s.slice(-10)) ;
  const pngBytes = (dataUrl, size, color) => okPng(dataUrl) ? Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64') : require('./publishreal').pngIcon(size, color);
  const escA = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function inside(root, rel) { const abs = path.resolve(root, rel); if (abs !== root && !abs.startsWith(root + path.sep)) throw err(400, 'that file is outside the web folder'); return abs; }

  async function fix(pid, me, body = {}) {
    if (!canFix(me, pid)) throw err(403, 'you can\'t change how this project is published');
    const root = rootOf(pid); if (!root) throw err(400, 'There is no first page (index.html) yet. Build a first version first.');
    const r = filesOf(pid); if (!r.files || r.files['index.html'] == null) throw err(400, 'There is no first page (index.html) yet. Build a first version first.');
    const p = P.get(pid) || {}, files = r.files, before = core.check(files), changed = [];
    const color = HEX.test(body.color || '') ? body.color : HEX.test(p.color || '') ? p.color : '#F26B1D';
    const name = String(body.name || p.name || 'My app').trim().slice(0, 60) || 'My app';
    const prev = new Map();   // what each file was before, for Undo
    const write = (rel, data) => { const abs = inside(root, rel); if (!prev.has(rel)) { let b = null; try { b = fs.readFileSync(abs); } catch {} prev.set(rel, b); } fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, data); changed.push(rel); };
    const exists = rel => { try { return fs.existsSync(inside(root, rel)); } catch { return false; } };
    let html = files['index.html'];

    // icons: the 192 and 512 pictures (kept when they are already there)
    const ic = body.icons && typeof body.icons === 'object' ? body.icons : {};
    for (const n of [192, 512]) if (!exists(`icons/icon-${n}.png`)) write(`icons/icon-${n}.png`, pngBytes(ic[n] || ic[String(n)], n, color));

    // the manifest: patch the one the page links, or add one
    const mf = core.manifestOf(files);
    let mpath = mf && mf.path && mf.error !== 'outside' ? mf.path : 'manifest.webmanifest';
    if (mf && mf.error === 'outside') mpath = exists('manifest.webmanifest') ? 'app.webmanifest' : 'manifest.webmanifest';
    const j = (mf && mf.json) ? { ...mf.json } : {};
    const rel = to => { const from = path.posix.dirname(mpath); return path.posix.relative(from === '.' ? '' : from, to) || to; };
    if (!String(j.name || '').trim()) j.name = String(j.short_name || '').trim() || name;
    if (!String(j.short_name || '').trim()) j.short_name = String(j.name).slice(0, 12);
    if (!String(j.start_url || '').trim()) j.start_url = rel('index.html') === 'index.html' ? './' : rel('index.html');
    if (!['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].includes(String(j.display || '').toLowerCase())) j.display = 'standalone';
    if (j.prefer_related_applications === true) delete j.prefer_related_applications;
    if (!HEX.test(j.theme_color || '')) j.theme_color = color;
    if (!j.background_color) j.background_color = '#ffffff';
    const icons = Array.isArray(j.icons) ? j.icons.filter(x => x && x.src) : [];
    const has = (n, purpose) => icons.some(x => String(x.sizes || '').split(/\s+/).includes(`${n}x${n}`) && String(x.purpose || 'any').split(/\s+/).includes(purpose) && !/svg/i.test(String(x.type || x.src)));
    if (!has(192, 'any')) icons.push({ src: rel('icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' });
    if (!has(512, 'any')) icons.push({ src: rel('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' });
    if (!icons.some(x => String(x.purpose || '').split(/\s+/).includes('maskable'))) icons.push({ src: rel('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' });
    j.icons = icons;
    const mtext = JSON.stringify(j, null, 2) + '\n';
    if (!mf || !mf.json || mtext !== JSON.stringify(mf.json, null, 2) + '\n') write(mpath, mtext);

    // index.html: the tags a phone reads
    const head = [];
    if (!mf || mf.error === 'outside') {
      if (mf && mf.error === 'outside') html = html.replace(/<link\b[^>]*\brel\s*=\s*["']?manifest\b[^>]*>/i, '');
      head.push(`<link rel="manifest" href="${escA(mpath)}">`);
    }
    if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(html)) head.push('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
    if (!/<meta[^>]+name\s*=\s*["']theme-color["']/i.test(html)) head.push(`<meta name="theme-color" content="${escA(color)}">`);
    const appleTag = (html.match(/<link\b[^>]*>/gi) || []).find(t => /\brel\s*=\s*["']?apple-touch-icon/i.test(t));
    if (!appleTag) head.push('<link rel="apple-touch-icon" href="icons/icon-192.png">');
    else if (/\.svg(?:[?#"' >]|$)/i.test(appleTag)) html = html.replace(appleTag, '<link rel="apple-touch-icon" href="icons/icon-192.png">');
    if (!/<meta[^>]+name\s*=\s*["']apple-mobile-web-app-title["']/i.test(html)) head.push(`<meta name="apple-mobile-web-app-title" content="${escA(String(j.short_name || name).slice(0, 30))}">`);
    if (!before.items.find(x => x.id === 'sw').ok) {
      const swName = exists('sw.js') ? 'tribe-sw.js' : 'sw.js';
      const pw = pub.pwaFiles({ title: name, color, version: Date.now(), kind: pub.kindOf(r.list) }, r.list.concat([{ path: mpath, size: mtext.length }, { path: 'icons/icon-192.png', size: 1 }, { path: 'icons/icon-512.png', size: 1 }]));
      const sw = (pw.find(x => x.path === 'sw.js') || {}).text;
      if (sw) {
        write(swName, sw);
        const reg = `<script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('${swName}').catch(function(){})})}</script>`;
        html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, reg + '</body>') : html + reg;
      }
    }
    if (head.length) html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + head.join('')) : (/<html[^>]*>/i.test(html) ? html.replace(/<html[^>]*>/i, m => m + '<head>' + head.join('') + '</head>') : '<head>' + head.join('') + '</head>' + html);
    if (html !== files['index.html']) write('index.html', html);

    // a version the tribe can go back to, and one Undo
    if (changed.length) await commit(pid, me, root, 'Make it installable on phones (TribeCode)');
    let undo = null;
    if (changed.length) { undo = Math.random().toString(36).slice(2, 10); undos.set(undo, { pid, root, prev, by: me.id }); while (undos.size > 20) undos.delete(undos.keys().next().value); broadcast({ type: 'homescreen', project: pid }); }
    const after = filesOf(pid);
    return { changed: [...new Set(changed)], check: after.files ? core.check(after.files) : null, before, undo };
  }
  const undos = new Map();
  async function commit(pid, me, root, msg) {
    const repo = (P.get(pid) || {}).repo;
    if (!repo || !W || !W.git || !fs.existsSync(path.join(repo, '.git'))) return;
    try {
      const mem = getMembers().find(m => m.id === me.id) || me;
      await W.git(['add', '-A', '--', path.relative(repo, root) || '.'], repo);
      const g = await W.git([...(W.identity ? W.identity(mem) : []), 'commit', '-q', '-m', msg], repo);
      if (g && g.code && !/nothing to commit/i.test((g.out || '') + (g.err || ''))) log(`homescreen commit: ${(g.err || g.out || '').slice(0, 160)}`);
    } catch (e) { log(`homescreen commit: ${e.message}`); }
  }
  async function undoFix(pid, me, body = {}) {
    const u = undos.get(String(body.undo || ''));
    if (!u || u.pid !== pid) throw err(404, 'nothing to undo');
    if (!canFix(me, pid)) throw err(403, 'you can\'t change how this project is published');
    for (const [rel, b] of u.prev) { const abs = inside(u.root, rel); if (b == null) { try { fs.unlinkSync(abs); } catch {} } else fs.writeFileSync(abs, b); }
    undos.delete(String(body.undo));
    await commit(pid, me, u.root, 'Undo: make it installable on phones (TribeCode)');
    broadcast({ type: 'homescreen', project: pid });
    const after = filesOf(pid);
    return { ok: true, check: after.files ? core.check(after.files) : null };
  }

  // ---------- is the live link installable? ----------
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
  async function get(url, ms = 6000) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try { const r = await f(url, { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': 'TribeCode install check' } }); const text = (await r.text()).slice(0, 2 * 1024 * 1024); return { status: r.status, ok: r.ok, text, url: r.url || url }; }
    finally { clearTimeout(t); }
  }
  async function reach(pid, me, body = {}) {
    let u; try { u = new URL(String(body.url || '')); } catch { throw err(400, 'that is not a link'); }
    if (!/^https?:$/.test(u.protocol)) throw err(400, 'only http and https links');
    const known = links(pid).map(x => { try { return new URL(x.url); } catch { return null; } }).filter(Boolean);
    const allowed = known.some(k => k.host === u.host) || (process.env.TRIBE_TEST && LOCAL.test(u.hostname));
    if (!allowed) throw err(400, 'I only check this project’s own play link or GitHub page.');
    const https = u.protocol === 'https:' || LOCAL.test(u.hostname), local = LOCAL.test(u.hostname) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
    let page; try { page = await get(u.href); } catch (e) { return { ok: false, status: 0, https, local, error: e.name === 'AbortError' ? 'The link did not answer in 6 seconds.' : 'The link did not answer.', check: null }; }
    if (!page.ok) return { ok: false, status: page.status, https, local, error: `The link answered ${page.status}.`, check: null };
    const files = { 'index.html': page.text };
    const mtag = (page.text.match(/<link\b[^>]*>/gi) || []).find(t => /\brel\s*=\s*["']?manifest\b/i.test(t));
    const href = mtag && (/\bhref\s*=\s*["']([^"']+)["']/i.exec(mtag) || [])[1];
    if (href) {
      try {
        const mu = new URL(href, page.url);
        if (mu.host === new URL(page.url).host) { const m = await get(mu.href); if (m.ok) { files['live.webmanifest'] = m.text; files['index.html'] = page.text.replace(mtag, '<link rel="manifest" href="live.webmanifest">'); } }
      } catch {}
    }
    // the offline copy is often registered from a script file: read the page's own scripts (a few, same site)
    const srcs = [...page.text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(x => x[1]).slice(0, 5);
    for (let i = 0; i < srcs.length; i++) {
      try { const su = new URL(srcs[i], page.url); if (su.host !== new URL(page.url).host) continue; const s = await get(su.href, 4000); if (s.ok) files[`live-${i}.js`] = s.text.slice(0, 600 * 1024); } catch {}
    }
    return { ok: true, status: page.status, https, local, check: core.check(files, { live: true, https }) };
  }

  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pidOf = v => { const pid = String(v || P.current() || ''); if (!P.get(pid) || !P.canSee(me, pid)) throw err(404, 'project not found'); return pid; };
    try {
      if (m === 'GET' && !b) return send(res, 200, view(pidOf(url.searchParams.get('project')), me));
      if (m === 'POST' && b === 'fix') { const body = await readBody(req, 4 * 1024 * 1024).catch(() => ({})); return send(res, 200, await fix(pidOf(body.project), me, body || {})); }
      if (m === 'POST' && b === 'undo') { const body = await readBody(req, 4096).catch(() => ({})); return send(res, 200, await undoFix(pidOf(body.project), me, body || {})); }
      if (m === 'POST' && b === 'reach') { const body = await readBody(req, 8192).catch(() => ({})); return send(res, 200, await reach(pidOf(body.project), me, body || {})); }
    } catch (e) { return send(res, e.status || 500, { error: e.message }); }
    return fail(res, 404, 'no such route');
  }
  return { route, view, fix, reach };
};
