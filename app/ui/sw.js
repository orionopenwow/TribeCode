// Offline shell for the installed app. API, MCP and WebSocket traffic always goes to the network.
const CACHE = 'tribecode-shell-v181';
const SHELL = ['./', 'canvas/extras.js', 'canvas/extras.css', 'phonehost.js', 'phonehost.css', 'motion.css', 'motion.js', 'tasks.css', 'flintfly.js', 'flintfly.css', 'index.html', 'join.html', 'tokens.css', 'fonts.css', 'styles.css', 'readability.css', 'keyboard.js', 'modes.js', 'mentions.js', 'exporter.js', 'helpersetup.js', 'healthpill.js', 'updater.css', 'live.css', 'docs.css', 'mobile.css', 'coedit.css', 'web.css', 'repo.css', 'notify.css', 'userbar.js', 'cropper.js', 'cropper.css', 'chatlist.css', 'guide.js', 'guide.css', 'help.js', 'help.css', 'hostpill.js', 'hostpill.css', 'livingrepo.js', 'livingrepo.css', 'versions.js', 'versions.css', 'panes.js', 'panes.css', 'logo.js', 'logo.css', 'flintguide.js', 'flintguide.css', 'palette.css', 'assets/flint.svg', 'widgets.js', 'widgets.css', 'sense.js', 'sense.css', 'assets/icon-animated.svg', 'assets/icon-mark-animated.svg', 'assets/icon-mark.svg', 'assets/icon-mark-once.svg', 'richtext.js', 'richtext.css', 'flint.js', 'flintmem.js', 'flint.css', 'connectai.js', 'connectai.css', 'mcpdir.js', 'mcpdir.css', 'brainpick.js', 'brainpick.css', 'askagent.js', 'doclayout.js', 'doclayout.css', 'oauth.css', 'oauth.js', 'signin.html', 'go.html', 'demo.html', 'demo.webmanifest', 'voice.css', 'plan.css', 'projects.css', 'shell.css', 'coord.css', 'selfheal.js', 'store.js', 'tribe.js', 'media.js', 'settings.js', 'storage.js', 'i18n.js', 'flinttour.js', 'updater.js', 'md.js', 'tasks.js', 'tasknews.js', 'ot.js', 'coedit.js', 'docs.js', 'board.js', 'bugs.js', 'palette.js', 'huddle.js', 'qr.js', 'web.js', 'repo.js', 'notify.js', 'speech.js', 'captions.js', 'capture.js', 'dm.js', 'chatx.js', 'float.js', 'plan.js', 'docsx.js', 'visuals.js', 'app.js', 'projects.js', 'stage.js', 'roles.js', 'roles.css', 'codefiles.js', 'codefiles.css', 'profiles.js', 'profiles.css', 'look.js', 'look.css', 'channels.js', 'chatrich.js', 'emojipick.js', 'chat2.css', 'shell.js', 'coord.js', 'assets/icon-512.png', 'assets/icon.svg', 'assets/wordmark.svg', 'manifest.webmanifest', 'assets/illustrations/cooperative.svg', 'assets/illustrations/campfire.svg', 'assets/illustrations/brain.svg', 'assets/illustrations/chat.svg', 'assist.js', 'assist.css', 'assets/apple-touch-icon.png', 'people.css', 'votes.css', 'gists.css', 'flow.css', 'repohero.css', 'mobile2.css', 'workshop.css', 'offline.css', 'agentshub.css', 'secretary.css', 'bubbles.css', 'plusmenu.css', 'preview.css', 'hub.css', 'folders.css', 'website.css', 'themes.css', 'viewers.css', 'phoneapp.css', 'offline.js', 'themes.js', 'votes.js', 'people.js', 'gists.js', 'flow.js', 'repohero.js', 'mobile2.js', 'workshop.js', 'agentshub.js', 'secretary.js', 'profilemenu.js', 'plusmenu.js', 'preview.js', 'github.js', 'folders.js', 'hub.js', 'website.js', 'viewers.js', 'phoneapp.js', 'assets/fonts/Inter-Bold.otf', 'assets/fonts/Inter-Medium.otf', 'assets/fonts/Inter-Regular.otf', 'assets/fonts/Inter-SemiBold.otf', 'assets/fonts/InterDisplay-ExtraBold.otf', 'assets/wordmark-light.svg', 'showcase.css', 'showcase.js', 'agentsdash.js', 'agentsdash.css', 'fleet.js', 'fleet.css', 'whiteboard.js', 'whiteboard.css', 'director.js', 'director.css', 'demo-game.html', 'setup.js', 'setup.css', 'captures.js', 'captures.css', 'welcome.js', 'welcome.css', 'filegrid.js', 'filegrid.css', 'assets.js', 'assets.css', 'inspo.js', 'reco.js', 'companylinks.js', 'inspo.css', 'cursors.js', 'cursors.css', 'sheet.js', 'deck.js', 'crafts.css', 'feedback.js', 'feedback.css', 'focus.js', 'assets/camp.svg', 'ship.js', 'ship.css', 'company.js', 'company.css', 'ledger.js', 'ledger.css', 'talent.js', 'talent.css', 'market.js', 'market.css', 'academy.js', 'academy.css', 'legal.js', 'legal.css', 'offload.js', 'offload.css', 'studios.js', 'studios.css', 'publish.js', 'publish.css', 'jam.js', 'jam.css', 'firstrun.js', 'firstrun.css', 'previewflint.css', 'previewflint.js', 'personalize.js', 'personalize.css', 'pins.js', 'pins.css', 'canvas/scene.js', 'canvas/layers.js', 'canvas/props.js', 'canvas/canvas.js', 'canvas/canvas.css', 'canvas/code.js', 'canvas/code.css', 'sitelib.js', 'sitelib.css', 'canvas/flint.js', 'canvas/flint.css', 'flintnlu.js', 'flintlocal.js', 'canvas/flintpane.js', 'canvas/flintpane.css', 'offline.html', 'pwa.js', 'pwa.css', 'moderation.js', 'moderation.css', 'assets/icon-192.png', 'assets/icon-512-maskable.png', 'assets/icon-monochrome.png', 'privacy.html', 'terms.html', 'setuplocal.js', 'setuplocal.css', 'tribenew.js', 'tribenew.css', 'localfiles.js', 'localfiles.css', 'aibasics-core.js', 'aibasics.js', 'aibasics.css', 'flintgrow.js', 'inspoboard.js', 'inspoboard.css', 'router.js', 'accounts.js', 'accounts.css', 'siteedit-core.js', 'siteshelf.js', 'siteshelf.css', 'workcore.js', 'workloop.js', 'workloop.css', 'doctpl-data.js', 'doctpl.js', 'doctpl.css', 'premium.js', 'premium.css', 'localdoc.js', 'flintrun.js', 'flintrun.css', 'devslate.js', 'aiconsent.js', 'aiconsent.css', 'signup.js', 'signup.css', 'sitecfg.js', 'sitedesigner.js', 'sitedesigner.css', 'sitedesigner-frame.js', 'framerun.js', 'aiboost.js', 'aiboost.css', 'flintlessons.js', 'flintlessons.css', 'demowatch.js', 'demowatch.css', 'makelink.js', 'filesview.js', 'filesview.css', 'icons.js', 'icons.css', 'rail.css', 'plans.js', 'plans.css', 'homegit.js', 'homegit.css', 'sidefoot.js', 'sidefoot.css', 'reorder.js', 'reorder.css', 'market-catalog.json', 'abilities.js', 'abilities.css', 'siteimport.js', 'sitetpl/catalog.json', 'sitetpl/linkbio.json', 'sitetpl/tt-profile-card.json', 'sitetpl/h5-identity.json', 'sitetpl/service.json', 'sitetpl/sb-agency.json', 'sitetpl/sb-business-frontpage.json', 'sitetpl/sb-creative.json', 'sitetpl/sb-modern-business.json', 'sitetpl/sb-small-business.json', 'sitetpl/saas.json', 'sitetpl/sb-grayscale.json', 'sitetpl/sb-landing-page.json', 'sitetpl/sb-new-age.json', 'sitetpl/sb-one-page-wonder.json', 'sitetpl/tt-landing-page.json', 'sitetpl/tt-app-landing.json', 'sitetpl/h5-photon.json', 'sitetpl/h5-stellar.json', 'sitetpl/h5-landed.json', 'sitetpl/portfolio.json', 'sitetpl/photography.json', 'sitetpl/sb-freelancer.json', 'sitetpl/sb-stylish-portfolio.json', 'sitetpl/h5-forty.json', 'sitetpl/h5-miniport.json', 'sitetpl/resume.json', 'sitetpl/sb-personal.json', 'sitetpl/sb-resume.json', 'sitetpl/h5-dimension.json', 'sitetpl/h5-read-only.json', 'sitetpl/blog.json', 'sitetpl/sb-clean-blog.json', 'sitetpl/tt-ghostwind.json', 'sitetpl/tt-minimal-blog.json', 'sitetpl/h5-massively.json', 'sitetpl/merch.json', 'sitetpl/tt-nordic-store.json', 'sitetpl/cafe.json', 'sitetpl/sb-business-casual.json', 'sitetpl/band.json', 'sitetpl/creator.json', 'sitetpl/podcast.json', 'sitetpl/wedding.json', 'sitetpl/nonprofit.json', 'sitetpl/gamepage.json', 'sitetpl/comingsoon.json', 'sitetpl/sb-coming-soon.json', 'sitetpl/h5-eventually.json', 'presence.js', 'presence.css', 'peoplepanel.js', 'peoplepanel.css', 'starterkit.js', 'designflow-data.js', 'designflow.js', 'designflow.css', 'starters/catalog.json', 'demointro.js', 'demointro.css', 'signupnudge.js', 'signupnudge.css', 'flintcmds.js'];
if (/(^|\.)tauri\.localhost$/.test(self.location.hostname) || self.location.protocol === 'tauri:') {   // never inside the desktop app
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => self.registration.unregister())));
}

// ---- strategy (feat/appstore) ----
// Pages (navigations): network first, using navigation preload so the service worker never delays the request; offline,
//   the cached app page, else offline.html. Each fresh app page says its version (<meta name="tribe-version">); when it
//   changes, the cached files of the old version are dropped first, so an old script never runs with a new page.
// Files: the app's own code (scripts, styles, pages, JSON) is network first everywhere, so a new version shows at once and an
//   old script never runs beside a new page (fix/desk-demo: stale-while-revalidate kept old UI one load behind on phones and
//   on Pages, whose page carries no version). Pictures and fonts are stale-while-revalidate on a real address. Offline,
//   everything comes from the cache. ?strategy=swr|network on sw.js overrides it for pictures and fonts.
// Activate deletes EVERY cache but this version's shell and the runtime cache (old names like tribecode-v*, tribecode-cache,
//   tribecode-shell-v*), takes the open pages (clients.claim) and tells them; pwa.js reloads a page once when a new worker
//   takes it (controllerchange), so nobody keeps running the old UI.
const OFFLINE = 'offline.html';
const RUNTIME = 'tribecode-runtime';   // share-target payloads and the version marker; survives shell upgrades
const SCOPE = () => new URL(self.registration.scope);
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname);
const STRATEGY = new URL(self.location.href).searchParams.get('strategy') || (LOCAL ? 'network' : 'swr');
const NETWORK_ONLY = /^\/(api|mcp|ws|play|preview)(\/|$)/;   // play links and previews are sandboxed pages: never through the shell cache
const at = rel => new URL(rel, self.registration.scope).href;

self.addEventListener('install', e => {
  // one file that fails (a moved asset) must not leave the whole shell uncached
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled([OFFLINE, ...SHELL].map(f => c.add(f)))).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch {} }
    const keys = await caches.keys(), old = keys.filter(k => k !== CACHE && k !== RUNTIME);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    if (old.length) for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'tribe-sw-updated', cache: CACHE });
  })());
});
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'tribe-strategy' && e.source) e.source.postMessage({ type: 'tribe-strategy', strategy: STRATEGY, cache: CACHE });
});

const isAppPage = u => { const s = SCOPE().pathname; return u.pathname === s || u.pathname === s + 'index.html'; };
async function put(req, res) { if (res && res.ok && res.type === 'basic') { const c = await caches.open(CACHE); await c.put(req, res); } }
async function versionOf(res) { try { const m = /<meta name="tribe-version" content="([^"]*)">/.exec(await res.text()); return m ? m[1] : ''; } catch { return ''; } }
async function noteVersion(res) {
  const v = await versionOf(res); if (!v) return;
  const rt = await caches.open(RUNTIME), was = await rt.match('__version').then(r => (r ? r.text() : '')).catch(() => '');
  if (was === v) return;
  await rt.put('__version', new Response(v));
  if (!was) return;
  const c = await caches.open(CACHE);   // a new version: drop the old version's files (they come back fresh, on demand)
  await Promise.all((await c.keys()).filter(r => !r.url.endsWith('/' + OFFLINE)).map(r => c.delete(r)));
  for (const w of await self.clients.matchAll({ type: 'window' })) w.postMessage({ type: 'tribe-sw-updated', version: v, was });
}
// offline.html answers any address, so its styles and icon resolve from the app's scope (<base>), from the cache
async function offlinePage(c) {
  const r = await c.match(at(OFFLINE)); if (!r) return null;
  const html = (await r.text()).replace('<head>', `<head><base href="${self.registration.scope}">`);
  return new Response(html, { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function page(e, u) {
  try {
    const r = (await e.preloadResponse) || await fetch(e.request);
    if (r.ok && isAppPage(u)) { await noteVersion(r.clone()); await put(at('./'), r.clone()); }
    return r;
  } catch {
    const c = await caches.open(CACHE);
    return (await c.match(e.request, { ignoreSearch: true })) || (isAppPage(u) ? (await c.match(at('./'))) || (await c.match(at('index.html'))) : null)
      || (await offlinePage(c)) || new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><p>You are offline.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
const CODE = /\.(js|mjs|css|html?|json|webmanifest)$/i;
async function file(e) {
  const req = e.request;
  if (STRATEGY !== 'swr' || CODE.test(new URL(req.url).pathname)) {
    return fetch(req).then(r => { e.waitUntil(put(req, r.clone())); return r; }).catch(async () => (await caches.match(req)) || Response.error());
  }
  const cached = await caches.match(req);
  const fresh = fetch(req).then(async r => { await put(req, r.clone()); return r; }).catch(() => null);
  e.waitUntil(fresh);
  return cached || (await fresh) || Response.error();
}
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  if (e.request.method === 'POST' && u.pathname === SCOPE().pathname + 'share-target') return e.respondWith(shareIn(e.request));
  if (e.request.method !== 'GET' || NETWORK_ONLY.test(u.pathname) || e.request.headers.has('range')) return;
  e.respondWith(e.request.mode === 'navigate' ? page(e, u) : file(e));
});

// ---- share target: text, links, pictures and files shared into TribeCode (pwa.js picks them up) ----
async function shareIn(req) {
  try {
    const f = await req.formData(), rt = await caches.open(RUNTIME);
    const files = f.getAll('files').filter(x => x && typeof x === 'object' && x.size >= 0).slice(0, 10);
    const meta = { at: Date.now(), title: String(f.get('title') || ''), text: String(f.get('text') || ''), url: String(f.get('url') || ''), files: files.map((x, i) => ({ i, name: x.name || `shared-${i}`, type: x.type || '', size: x.size })) };
    await Promise.all(files.map((x, i) => rt.put(`__share/file/${i}`, new Response(x, { headers: { 'Content-Type': x.type || 'application/octet-stream' } }))));
    await rt.put('__share/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch {}
  return Response.redirect(at('./?share-target=1'), 303);
}

// ---- background sync: chat messages waiting in the outbox send even after the app is closed ----
// pwa.js mirrors the outbox's chat items (with their client ids) into IndexedDB and registers 'tribe-outbox'. With a window
// open, that window flushes its own outbox; with none, this sends them. The server drops repeats by client id.
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('tribecode-pwa', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kv = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', v === undefined ? 'readonly' : 'readwrite'), s = t.objectStore('kv'); const r = v === undefined ? s.get(k) : s.put(v, k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
async function syncOutbox() {
  const wins = await self.clients.matchAll({ type: 'window' });
  if (wins.length) { wins.forEach(w => w.postMessage({ type: 'tribe-flush-outbox' })); return; }
  const box = await kv('outbox'); if (!box || !box.token || !Array.isArray(box.items) || !box.items.length) return;
  const sent = (await kv('sent')) || [];
  while (box.items.length) {
    const it = box.items[0];
    let r; try {
      r = await fetch(box.base + '/api' + it.path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + box.token, ...(it.project ? { 'X-Project': it.project } : {}) }, body: JSON.stringify(it.body) });
    } catch (err) { await kv('outbox', box); throw err; }   // still offline: the browser retries the sync later
    if (r.status >= 500 || r.status === 429) { await kv('outbox', box); throw new Error('server busy'); }
    box.items.shift(); sent.push(it.id);
  }
  await kv('outbox', box); await kv('sent', sent.slice(-200));
}
self.addEventListener('sync', e => { if (e.tag === 'tribe-outbox') e.waitUntil(syncOutbox()); });

// ---- Web Push (server/notify.js encrypts with RFC 8291; the browser decrypts before this runs) ----
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'TribeCode', body: e.data ? e.data.text() : '' }; }
  if (typeof d.badge === 'number' && self.navigator.setAppBadge) { try { d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge(); } catch {} }   // unread count on the app icon
  e.waitUntil(self.registration.showNotification(d.title || 'TribeCode', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: 'assets/icon-512.png', badge: 'assets/icon-512.png',
    requireInteraction: d.priority === 'high', data: d, actions: (d.actions || []).slice(0, 2).map(a => ({ action: a.action, title: a.title })),
  }));
});
self.addEventListener('notificationclick', e => {
  const d = e.notification.data || {};
  e.notification.close();
  const act = (d.actions || []).find(a => a.action === e.action);
  if (act && act.url) {   // Approve / Deny straight from the lock screen via the signed one-time link
    e.waitUntil(fetch(act.url, { method: 'POST' }).then(r => r.text()).then(t => self.registration.showNotification(t.slice(0, 80) || 'Done', { tag: d.tag, body: '' })).catch(() => {}));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => new URL(w.url).origin === location.origin);
    if (c) { c.postMessage({ type: 'tribe-open', view: d.view || 'inbox', ref: d.ref || null }); return c.focus(); }
    return self.clients.openWindow(d.url || './?open=inbox');
  }));
});
