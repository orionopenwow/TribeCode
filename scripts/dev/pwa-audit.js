#!/usr/bin/env node
// A Lighthouse-style self-check for the installable web app (docs/BROWSER-APP.md). No browser and no dependencies:
//   1. the manifest: identity, display, colors, icons (any + maskable + monochrome, real PNG sizes on disk), screenshots
//      (wide + narrow, sizes match the files), shortcuts, share_target, file_handlers, protocol_handlers, launch_handler;
//   2. the service worker: every SHELL file exists, and sw.js run in a simulated service worker (node:vm, fake caches and
//      fetch) installs, then answers navigations with the network down: the app page from cache, an uncached page with
//      offline.html, a shared POST with a redirect; files stale-while-revalidate on a real address;
//   3. pages: offline.html, privacy.html, terms.html, the .well-known/assetlinks.json template.
// Prints each check and a score out of 100. Exits 1 when a required check fails or the score is under --min (default 90).
//   node scripts/dev/pwa-audit.js [--json] [--min 90] [--url http://localhost:4747]   (--url also checks a live server)
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..', '..'), UI = path.join(ROOT, 'app', 'ui');
const argv = process.argv.slice(2), flag = k => argv.includes(k), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const checks = [];
const check = (group, name, weight, ok, detail = '', required = false) => checks.push({ group, name, weight, ok: !!ok, detail, required });

function pngSize(file) {
  try { const b = fs.readFileSync(file); if (b.readUInt32BE(0) !== 0x89504e47) return null; return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; } catch { return null; }
}
const rel = (base, src) => path.join(base, String(src).replace(/^\.?\//, '').split('?')[0]);

// ---------------- 1. manifest ----------------
let man = null;
try { man = JSON.parse(fs.readFileSync(path.join(UI, 'manifest.webmanifest'), 'utf8')); } catch (e) { check('manifest', 'parses as JSON', 10, false, e.message, true); }
if (man) {
  check('manifest', 'parses as JSON', 2, true);
  check('manifest', 'id, start_url and scope', 6, man.id && man.start_url && man.scope, `${man.id} · ${man.start_url} · ${man.scope}`, true);
  check('manifest', 'name and short_name (≤ 12 chars)', 3, man.name && man.short_name && man.short_name.length <= 12, man.short_name);
  check('manifest', 'display standalone + display_override', 4, man.display === 'standalone' && Array.isArray(man.display_override) && man.display_override.includes('window-controls-overlay') && man.display_override.includes('standalone'), (man.display_override || []).join(', '), true);
  check('manifest', 'theme_color and background_color', 2, /^#[0-9a-f]{6}$/i.test(man.theme_color || '') && /^#[0-9a-f]{6}$/i.test(man.background_color || ''));
  const icons = man.icons || [];
  const purpose = p => icons.filter(i => String(i.purpose || 'any').split(/\s+/).includes(p));
  const real = i => { if (i.type === 'image/svg+xml') return fs.existsSync(rel(UI, i.src)); const s = pngSize(rel(UI, i.src)); return s && `${s.w}x${s.h}` === i.sizes; };
  const bad = icons.filter(i => !real(i)).map(i => i.src);
  check('manifest', 'every icon exists at its stated size', 6, !bad.length, bad.join(', ') || `${icons.length} icons`, true);
  check('manifest', 'any icons 192 + 512', 5, purpose('any').some(i => i.sizes === '192x192') && purpose('any').some(i => i.sizes === '512x512'), '', true);
  check('manifest', 'maskable icon', 4, purpose('maskable').length > 0);
  check('manifest', 'monochrome icon', 3, purpose('monochrome').length > 0);
  const shots = man.screenshots || [];
  const badShots = shots.filter(s => { const z = pngSize(rel(UI, s.src)); return !z || `${z.w}x${z.h}` !== s.sizes || !s.label; }).map(s => s.src);
  check('manifest', 'screenshots: wide + narrow, sizes match, labelled', 5, shots.some(s => s.form_factor === 'wide') && shots.some(s => s.form_factor === 'narrow') && !badShots.length, badShots.join(', ') || `${shots.length} screenshots`);
  const sc = man.shortcuts || [];
  const want = ['New note', 'Ask Flint', 'Tasks', 'Chat'];
  check('manifest', 'shortcuts: New note, Ask Flint, Tasks, Chat (with 96px icons)', 5, want.every(n => sc.some(s => s.name === n)) && sc.every(s => s.url && (s.icons || []).every(i => (pngSize(rel(UI, i.src)) || {}).w === 96)), sc.map(s => s.name).join(', '));
  const stg = man.share_target || {};
  check('manifest', 'share_target: POST multipart with text, url and files', 6, stg.action && stg.method === 'POST' && stg.enctype === 'multipart/form-data' && stg.params && stg.params.text && stg.params.url && Array.isArray(stg.params.files) && stg.params.files.length, stg.action);
  const fh = (man.file_handlers || [])[0] || {}, exts = Object.values(fh.accept || {}).flat();
  check('manifest', 'file_handlers: .md .json .glb .png', 4, ['.md', '.json', '.glb', '.png'].every(x => exts.includes(x)), exts.join(' '));
  check('manifest', 'protocol_handlers: web+tribecode with %s', 3, (man.protocol_handlers || []).some(p => p.protocol === 'web+tribecode' && /%s/.test(p.url)));
  const lh = man.launch_handler || {}, cm = [].concat(lh.client_mode || []);
  check('manifest', 'launch_handler: focus-existing', 2, cm[0] === 'focus-existing', cm.join(', '));
  const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
  check('manifest', 'index.html links the manifest, theme-color and apple-touch-icon', 3, /rel="manifest" href="manifest\.webmanifest"/.test(html) && /name="theme-color"/.test(html) && /rel="apple-touch-icon"/.test(html));
}

// ---------------- 2. service worker ----------------
const swSrc = fs.readFileSync(path.join(UI, 'sw.js'), 'utf8');
const shell = (() => { try { return vm.runInNewContext(swSrc.match(/const SHELL = (\[[\s\S]*?\]);/)[1]); } catch { return []; } })();
const missing = shell.filter(f => f !== './' && !fs.existsSync(rel(UI, f)));
check('service worker', 'every SHELL file exists', 5, shell.length && !missing.length, missing.slice(0, 6).join(', ') || `${shell.length} files`, true);
check('service worker', 'offline.html is precached', 3, swSrc.includes("const OFFLINE = 'offline.html'") && fs.existsSync(path.join(UI, 'offline.html')), '', true);
check('service worker', 'navigation preload', 2, /navigationPreload\.enable\(\)/.test(swSrc) && /preloadResponse/.test(swSrc));
check('service worker', 'background sync for queued messages', 2, /addEventListener\('sync'/.test(swSrc));

// The simulated service worker. host decides the strategy (localhost = network first, elsewhere stale-while-revalidate).
async function simulate(host) {
  const stores = new Map(), handlers = {};
  const keyOf = r => (typeof r === 'string' ? new URL(r, `https://${host}/`).href : r.url);
  const mkCache = () => { const m = new Map(); return {
    async match(r, o = {}) { const k = keyOf(r); for (const [kk, v] of m) if (kk === k || (o.ignoreSearch && kk.split('?')[0] === k.split('?')[0])) return v.clone(); return undefined; },
    async put(r, res) { m.set(keyOf(r), res.clone()); }, async add(r) { const res = await self.fetch(new Request(keyOf(r))); if (!res.ok) throw new Error('bad'); m.set(keyOf(r), res); },
    async delete(r) { return m.delete(keyOf(r)); }, async keys() { return [...m.keys()].map(k => new Request(k)); }, _m: m } };
  const caches = { async open(n) { if (!stores.has(n)) stores.set(n, mkCache()); return stores.get(n); }, async keys() { return [...stores.keys()]; }, async delete(n) { return stores.delete(n); },
    async match(r) { for (const c of stores.values()) { const x = await c.match(r); if (x) return x; } return undefined; } };
  let online = true, served = [];
  const disk = url => { const u = new URL(url); let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html'; const f = path.join(UI, p); return fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f) : null; };
  const self = { location: new URL(`https://${host}/sw.js`), registration: { scope: `https://${host}/`, navigationPreload: { enable: async () => {} }, showNotification: async () => {} },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} }, navigator: {}, skipWaiting: () => {},
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
    fetch: async req => { const url = typeof req === 'string' ? req : req.url; if (!online) throw new TypeError('Failed to fetch'); served.push(url); const b = disk(url);
      let body = b; if (b && (url.split('?')[0].endsWith('/') || /index\.html/.test(url))) body = Buffer.from(String(b).replace('<meta name="tribe-version" content="">', '<meta name="tribe-version" content="9.9.9">'));
      return b ? new Response(body, { status: 200, headers: { 'Content-Type': /\.html|\/$/.test(url) ? 'text/html' : 'text/plain' } }) : new Response('not found', { status: 404 }); } };
  const ctx = vm.createContext({ self, caches, fetch: (...a) => self.fetch(...a), location: self.location, URL, Request, Response, Headers, FormData, Blob, File, TextEncoder, console, setTimeout, Promise, indexedDB: undefined });
  vm.runInContext(swSrc, ctx);
  const fire = async (type, extra = {}) => { const waits = []; let resp = null; const ev = { waitUntil: p => waits.push(p), respondWith: p => { resp = p; }, ...extra }; for (const h of handlers[type] || []) h(ev); await Promise.allSettled(waits); return resp ? await resp : null; };
  // basicify: responses built here are type "default"; the service worker caches type "basic" only, so patch the check
  Object.defineProperty(Response.prototype, 'type', { configurable: true, get() { return 'basic'; } });
  await fire('install'); await fire('activate');
  const nav = (url, method = 'GET', body) => { const request = new Request(`https://${host}${url}`, { method, body }); Object.defineProperty(request, 'mode', { value: 'navigate' }); return fire('fetch', { request, preloadResponse: Promise.resolve(undefined) }); };
  const get = url => fire('fetch', { request: new Request(`https://${host}${url}`), preloadResponse: Promise.resolve(undefined) });
  const out = {};
  out.onlinePage = await nav('/?skipIntro=1');
  online = false;
  out.offlineApp = await nav('/?shortcut=chat');
  out.offlineOther = await nav('/about/nothing-cached.html');
  online = true; served = [];
  const fd = new FormData(); fd.append('text', 'hello'); fd.append('files', new File(['# hi'], 'a.md', { type: 'text/markdown' }));
  out.share = await fire('fetch', { request: new Request(`https://${host}/share-target`, { method: 'POST', body: fd }) });
  const rt = stores.get('tribecode-runtime'); out.shareMeta = rt ? await rt.match('__share/meta') : null;
  served = []; out.asset = await get('/pwa.js'); out.assetFromNetworkFirst = served.includes(`https://${host}/pwa.js`);
  return out;
}

async function main() {
  try {
    const live = await simulate('tribe.example.org'), local = await simulate('localhost');
    const text = async r => (r ? await r.clone().text() : '');
    check('service worker', 'online navigation answers from the network', 3, live.onlinePage && live.onlinePage.status === 200);
    check('service worker', 'offline: the app page opens from cache', 8, (await text(live.offlineApp)).includes('<title>TribeCode</title>'), '', true);
    check('service worker', 'offline: an uncached page shows offline.html', 8, (await text(live.offlineOther)).includes("You're offline"), '', true);
    check('service worker', 'share target: POST kept on the device and redirected', 5, live.share && live.share.status === 303 && /share-target=1/.test(live.share.headers.get('location') || '') && !!live.shareMeta);
    check('service worker', 'files: stale-while-revalidate on a real address', 3, live.asset && live.asset.status === 200);
    check('service worker', 'files: network first on localhost (dev live reload)', 2, local.asset && local.asset.status === 200 && local.assetFromNetworkFirst);
  } catch (e) { check('service worker', 'simulated service worker runs', 10, false, e.stack.split('\n').slice(0, 2).join(' '), true); }

  // ---------------- 3. pages ----------------
  const page = f => { try { return fs.readFileSync(path.join(UI, f), 'utf8'); } catch { return ''; } };
  check('pages', 'offline.html retries when back online', 2, /addEventListener\('online'/.test(page('offline.html')));
  check('pages', 'privacy.html and terms.html (drafts)', 3, /privacy/i.test(page('privacy.html')) && /terms/i.test(page('terms.html')) && /not legal advice/i.test(page('privacy.html') + page('terms.html')));
  let al = null; try { al = JSON.parse(page('.well-known/assetlinks.json')); } catch {}
  check('pages', '.well-known/assetlinks.json template (TWA)', 2, Array.isArray(al) && al[0] && al[0].target && al[0].target.namespace === 'android_app');

  // ---------------- live server (optional) ----------------
  const url = opt('--url');
  if (url) {
    const r = await fetch(url.replace(/\/$/, '') + '/manifest.webmanifest').catch(() => null);
    check('live', 'manifest served as application/manifest+json', 2, r && r.ok && /manifest\+json/.test(r.headers.get('content-type') || ''));
    const s = await fetch(url.replace(/\/$/, '') + '/sw.js').catch(() => null);
    check('live', 'sw.js served as JavaScript', 2, s && s.ok && /javascript/.test(s.headers.get('content-type') || ''));
  }

  const total = checks.reduce((a, c) => a + c.weight, 0), got = checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0);
  const score = Math.round((got / total) * 100), min = Number(opt('--min', 90)), reqFail = checks.filter(c => c.required && !c.ok);
  if (flag('--json')) console.log(JSON.stringify({ score, checks }, null, 2));
  else {
    let g = '';
    for (const c of checks) { if (c.group !== g) { g = c.group; console.log(`\n  ${g}`); } console.log(`    ${c.ok ? 'PASS' : c.required ? 'FAIL' : 'miss'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`); }
    console.log(`\n  PWA score: ${score}/100${reqFail.length ? `, ${reqFail.length} required check(s) failed` : ''}\n`);
  }
  process.exit(score >= min && !reqFail.length ? 0 : 1);
}
main();
