// Publish for real from a phone alone (feat/publish-real, docs/PUBLISH.md).
// A tribe that lives only on this device (offline.js solo mode) has no computer to answer /api/publish/real, so the same
// paths are answered here, with the same shared core (pubcore.js): the check list, the zip, the itch.io zip, and the
// GitHub page, sent straight from this phone to GitHub with the person's own token (ghphone.js; it stays on this
// phone and goes only to api.github.com). The Publish sheet (publish.js, publishreal.js) does not know the difference.
// What is published: the project's files on this phone (Files > Code; brought in from GitHub or made here), text only.
// A play link still needs the tribe on a computer; the sheet says so.
// Installed as an offline.js route hook, like phonelocal.js. Public: window.TribePublishPhone = { route, bundle }.
(function () {
  'use strict';
  const OFF = () => window.TribeOffline, K = () => OFF() && OFF()._k, core = () => window.TribePubCore, GP = () => window.TribeGhPhone, PL = () => window.TribePhoneLocal;
  const solo = () => !!(OFF() && OFF().solo && OFF().solo());
  const HEX = /^#[0-9a-fA-F]{6}$/, HIDE = /(^|\/)(\.git|node_modules|dist)(\/|$)|(^|\/)\.|\.(pem|key)$|(^|\/)id_(rsa|ed25519|ecdsa)$/i;
  const MAX_FILES = 400, MAX_BYTES = 20 * 1024 * 1024;
  const ok = d => [200, d], no = (code, error, extra) => [code, { error, ...(extra || {}) }];
  const err = (status, message, extra) => Object.assign(new Error(message), { status }, extra || {});
  const realFetch = (u, o) => (OFF() && OFF().realFetch ? OFF().realFetch(u, o) : fetch(u, o));
  const API = () => 'https://api.github.com';

  const destOf = pid => { const db = K().db(); db.local = db.local || {}; db.local.publishReal = db.local.publishReal || {}; return db.local.publishReal[pid] || (db.local.publishReal[pid] = {}); };
  const save = () => K().save();
  const proj = pid => (K().proj(pid) || {});
  async function token() { const g = GP(); if (!g) return ''; if (typeof g.authProvider === 'function') { try { const t = await g.authProvider(); if (t) return t; } catch {} } return g.getToken() || ''; }
  const login = () => (GP() && GP().login && GP().login()) || '';

  // The files on this phone that make the page. index.html at the top, or inside site/.
  function bundle(pid) {
    const c = PL() && PL().code ? PL().code(pid) : null, files = (c && c.files) || {};
    let paths = Object.keys(files).filter(p => !HIDE.test(p) && !files[p].binary);
    if (!paths.includes('index.html') && paths.includes('site/index.html')) paths = paths.filter(p => p.startsWith('site/'));
    const strip = paths.includes('index.html') ? '' : 'site/';
    if (!paths.includes(strip + 'index.html')) throw err(409, 'There is no first page yet. Build a first version, then publish.');
    return paths.sort().map(p => { const text = String(files[p].text || ''); return { path: p.slice(strip.length), text, size: new Blob([text]).size }; });
  }
  function icons(title, color) { const R = window.TribePublishReal; try { return R && R.drawIcon ? { 192: R.drawIcon(192, title, color), 512: R.drawIcon(512, title, color) } : null; } catch { return null; } }
  function metaOf(pid, body = {}) {
    const p = proj(pid), d = destOf(pid), color = HEX.test(body.color || '') ? body.color : HEX.test(d.color || '') ? d.color : HEX.test(p.color || '') ? p.color : '#F26B1D';
    const title = String(body.title || d.title || p.name || 'My project').trim().slice(0, 80);
    const m = { title, desc: String(body.desc != null ? body.desc : (d.desc || p.bio || '')).replace(/\s+/g, ' ').trim().slice(0, 240), color, kind: d.kind || null, pwa: d.pwa !== false, version: (d.version || 0) + 1 };
    const given = body.icons && typeof body.icons === 'object' && body.icons['192'] && body.icons['512'] ? body.icons : null;
    m.icons = given || icons(title, color) || undefined;
    return m;
  }
  function finished(pid, body) {
    const raw = bundle(pid), meta = metaOf(pid, body); meta.kind = meta.kind || core().kindOf(raw);
    return { files: core().finish(raw, { ...meta, pwa: meta.pwa && meta.kind !== 'site' }), meta, raw };
  }
  function view(pid) {
    const d = destOf(pid), w = k => (d[k] ? { on: !!d[k].on, sent: !!d[k].sent } : { on: false });
    return { kind: d.kind || null, pwa: d.pwa !== false, color: d.color || null, version: d.version || 0,
      pages: d.pages ? { url: d.pages.url, repo: d.pages.repo, web: d.pages.web, at: d.pages.at, by: 'me', byName: '', pagesEnabled: d.pages.pagesEnabled, settingsUrl: d.pages.settingsUrl, version: d.pages.version } : null,
      android: { ...w('android'), pkg: (d.android && d.android.pkg) || null }, ios: w('ios'), desktop: w('desktop') };
  }
  function status(pid) {
    const p = proj(pid), d = destOf(pid); let raw = null, problem = null;
    try { raw = bundle(pid); } catch (e) { problem = e.message; }
    const sensed = raw ? core().kindOf(raw) : 'site', kind = d.kind || sensed, ch = raw ? core().secrets(raw) : { findings: [], blocked: false }, dest = view(pid), meta = raw ? metaOf(pid) : {};
    const next = !raw ? 'build' : ch.blocked ? 'fix' : !dest.pages ? 'pages' : kind !== 'site' && !dest.android.on ? 'app' : 'share';
    return { project: pid, name: p.name || '', slug: core().slug((d.pages && d.pages.repo && d.pages.repo.split('/')[1]) || p.name), kind, sensed, problem, phone: true,
      checks: raw ? core().preflight(raw, { kind }) : [], findings: ch.findings, blocked: ch.blocked, files: raw ? raw.length : 0, bytes: raw ? raw.reduce((n, x) => n + x.size, 0) : 0,
      itch: raw ? core().itch(core().finish(raw, { ...meta, pwa: false })) : null, dest, play: null, next, github: { signedIn: !!(GP() && GP().getToken && GP().getToken()), login: login() || null }, canSend: true };
  }
  const bytesOf = x => { if (x.b64 != null) { const bin = atob(x.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; } return new TextEncoder().encode(x.text || ''); };
  const b64Of = text => { const u = new TextEncoder().encode(text || ''); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  function guard(pid) { const ch = core().secrets(bundle(pid)); if (ch.blocked) throw err(409, 'Something in the files must be fixed before this goes public.', { findings: ch.findings }); }

  function zip(pid, what, body) {
    guard(pid);
    const { files, meta } = finished(pid, body); let list = files;
    if (what === 'itch') { list = core().finish(bundle(pid), { ...meta, pwa: false }); const it = core().itch(list); if (!it.ok) throw err(409, it.problems[0]); }
    if (!window.TribeExport || !window.TribeExport.zip) throw err(500, 'The zip maker is not loaded.');
    const blob = window.TribeExport.zip(list.map(x => [x.path, bytesOf(x)]), 'application/zip');
    const name = `${core().slug(meta.title)}${what === 'itch' ? '-itch' : ''}.zip`;
    return new Response(blob, { status: 200, headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"` } });
  }

  async function pages(pid, body) {
    const tk = await token(); if (!tk) throw err(401, 'Connect GitHub on this phone first. It takes a minute and is free.', { needGithub: true });
    guard(pid);
    const d = destOf(pid), { files, meta } = finished(pid, body);
    if (files.length > MAX_FILES) throw err(413, `${files.length} files is more than a phone can send (${MAX_FILES}). Download the zip instead.`);
    if (files.reduce((n, x) => n + (x.size || 0), 0) > MAX_BYTES) throw err(413, 'Too big to send from a phone. Download the zip instead.');
    const name = core().slug(body.name || (d.pages && d.pages.repo && d.pages.repo.split('/')[1]) || meta.title);
    const out = files.map(x => ({ path: x.path, b64: x.b64 != null ? x.b64 : b64Of(x.text) }));
    const lg = login() || (d.pages && d.pages.login) || 'me', url0 = (d.pages && d.pages.url) || `https://${String(lg).toLowerCase()}.github.io/${name}/`;
    const wm = { ...meta, url: url0, pkg: (d.android && d.android.pkg) || core().pkgId(lg, name) };
    const wrap = []; for (const k of ['android', 'ios', 'desktop']) if (d[k] && d[k].on) wrap.push(...core().wrapperFiles(k, wm));
    for (const w of wrap) out.push({ path: w.path, b64: w.b64 != null ? w.b64 : b64Of(w.text) });
    let r;
    try { r = await core().pagesPublish({ fetch: realFetch, api: API(), token: tk, name, title: meta.title, desc: meta.desc, files: out, project: pid, message: `Publish ${meta.title} (version ${meta.version}) with TribeCode` }); }
    catch (e) {
      if (e.status === 401) throw err(401, 'GitHub didn\'t accept the token on this phone. Connect GitHub again.', { needGithub: true });
      if (e.status === 403 || e.status === 404) throw err(403, 'GitHub refused. The token on this phone can only change the projects you picked for it. To publish, make a token for all your projects with Administration, Contents, Pages and Workflows set to Read and write.', { needGithub: true });
      if (e.taken) throw err(409, e.message, { taken: true });
      throw err(502, 'GitHub: ' + String(e.message || 'did not answer').slice(0, 200));
    }
    d.version = meta.version; d.title = meta.title; d.desc = meta.desc; if (HEX.test(body.color || '')) d.color = body.color;
    d.pages = { url: r.url, repo: r.repo, web: r.web, login: r.login, at: new Date().toISOString(), pagesEnabled: r.pagesEnabled, settingsUrl: r.settingsUrl, version: meta.version, commit: r.commit };
    for (const k of ['android', 'ios', 'desktop']) if (d[k] && d[k].on) d[k].sent = true;
    if (d.android && d.android.on) d.android.pkg = wm.pkg;
    save();
    return { url: r.url, repo: r.repo, web: r.web, pagesEnabled: r.pagesEnabled, settingsUrl: r.settingsUrl, version: meta.version, created: r.created, dest: view(pid) };
  }
  async function build(pid, what) {
    const desk = what === 'desktop', k = desk ? 'desktop' : 'android', d = destOf(pid);
    if (!d.pages || !d[k] || !d[k].on || !d[k].sent) return { state: 'none' };
    const repo = d.pages.repo, page = `https://github.com/${repo}/actions`, releases = desk ? `https://github.com/${repo}/releases` : `https://github.com/${repo}/releases/latest`;
    const base = desk ? { page, releases } : { page, releases, download: `https://github.com/${repo}/releases/latest/download/app.apk` };
    const tk = await token(); if (!tk) return { state: 'unknown', ...base };
    try {
      const r = await realFetch(`${API()}/repos/${repo}/actions/workflows/tribecode-${k}.yml/runs?per_page=1`, { headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' } });
      const j = await r.json().catch(() => ({})), run = (j.workflow_runs || [])[0];
      if (!r.ok || !run) return { state: r.ok ? 'queued' : 'unknown', ...base };
      return { state: run.status !== 'completed' ? (run.status === 'queued' ? 'queued' : 'building') : run.conclusion === 'success' ? 'ready' : 'failed', ...base, page: run.html_url || page };
    } catch { return { state: 'unknown', ...base }; }
  }

  // offline.js route hook. Returns null for anything that isn't ours (so the usual answers apply).
  function route(method, parts, q, body) {
    if (!solo() || parts[0] !== 'publish' || !core()) return null;
    const pid = (q && q.get && q.get('project')) || (body && body.project) || K().cur(), B = body || {}, [, b, c] = parts;
    if (!b && method === 'GET') return ok({ published: [], canPublish: true, phone: true });
    if (b === 'check' && method === 'POST') { try { return ok(core().secrets(bundle(pid))); } catch { return ok({ findings: [], blocked: false, files: 0 }); } }
    if (b !== 'real') return null;
    const run = async () => {
      try {
        if (!c && method === 'GET') return ok(status(pid));
        if (!c && method === 'PUT') { const d = destOf(pid); if (['site', 'game', 'app'].includes(B.kind)) d.kind = B.kind; if (typeof B.pwa === 'boolean') d.pwa = B.pwa; if (HEX.test(B.color || '')) d.color = B.color; save(); return ok(status(pid)); }
        if (c === 'zip' && method === 'GET') return zip(pid, q.get('for') === 'itch' ? 'itch' : 'web', { title: q.get('title') || undefined, desc: q.get('desc') == null ? undefined : q.get('desc') });
        if (c === 'pages' && method === 'POST') return ok(await pages(pid, B));
        if (c === 'wrapper' && method === 'POST') {
          if (!['android', 'ios', 'desktop'].includes(B.kind)) return no(400, 'kind is android, ios or desktop');
          const d = destOf(pid); d[B.kind] = { ...(d[B.kind] || {}), on: B.on !== false }; if (!d[B.kind].on) d[B.kind].sent = false; save();
          if (d.pages && d[B.kind].on) return ok({ ...(await pages(pid, {})), sent: true });
          return ok({ dest: view(pid), sent: false });
        }
        if (c === 'build' && method === 'GET') return ok(await build(pid, q.get('what')));
        return no(404, 'no such publish route');
      } catch (e) { return [e.status || 500, { error: e.message, needGithub: !!e.needGithub, taken: !!e.taken, findings: e.findings }]; }
    };
    return run();
  }
  function hook() { const k = K(); if (!k || !k.hooks) return setTimeout(hook, 200); if (!k.hooks.route.includes(route)) k.hooks.route.unshift(route); }
  hook();
  window.TribePublishPhone = { route, bundle };
})();
