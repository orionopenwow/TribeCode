// Offline shell for the installed app. API, MCP and WebSocket traffic always goes to the network.
const CACHE = 'tribecode-shell-v137';
const SHELL = ['./', 'canvas/extras.js', 'canvas/extras.css', 'phonehost.js', 'phonehost.css', 'motion.css', 'motion.js', 'tasks.css', 'flintfly.js', 'flintfly.css', 'index.html', 'join.html', 'tokens.css', 'fonts.css', 'styles.css', 'readability.css', 'keyboard.js', 'modes.js', 'mentions.js', 'exporter.js', 'helpersetup.js', 'healthpill.js', 'updater.css', 'live.css', 'docs.css', 'mobile.css', 'coedit.css', 'web.css', 'repo.css', 'notify.css', 'friends.css', 'friends.js', 'userbar.js', 'cropper.js', 'cropper.css', 'chatlist.css', 'guide.js', 'guide.css', 'help.js', 'help.css', 'hostpill.js', 'hostpill.css', 'panes.js', 'panes.css', 'logo.js', 'logo.css', 'flintguide.js', 'flintguide.css', 'palette.css', 'assets/flint.svg', 'widgets.js', 'widgets.css', 'sense.js', 'sense.css', 'assets/icon-animated.svg', 'assets/icon-mark-animated.svg', 'assets/icon-mark.svg', 'assets/icon-mark-once.svg', 'richtext.js', 'richtext.css', 'flint.js', 'flintmem.js', 'flint.css', 'connectai.js', 'connectai.css', 'mcpdir.js', 'mcpdir.css', 'brainpick.js', 'brainpick.css', 'askagent.js', 'doclayout.js', 'doclayout.css', 'oauth.css', 'oauth.js', 'signin.html', 'go.html', 'demo.html', 'demo.webmanifest', 'voice.css', 'plan.css', 'projects.css', 'shell.css', 'coord.css', 'selfheal.js', 'store.js', 'tribe.js', 'media.js', 'settings.js', 'storage.js', 'i18n.js', 'flinttour.js', 'updater.js', 'md.js', 'tasks.js', 'tasknews.js', 'ot.js', 'coedit.js', 'docs.js', 'board.js', 'bugs.js', 'palette.js', 'huddle.js', 'qr.js', 'web.js', 'repo.js', 'notify.js', 'speech.js', 'captions.js', 'capture.js', 'dm.js', 'chatx.js', 'float.js', 'plan.js', 'docsx.js', 'visuals.js', 'app.js', 'projects.js', 'stage.js', 'roles.js', 'roles.css', 'codefiles.js', 'codefiles.css', 'profiles.js', 'profiles.css', 'look.js', 'look.css', 'channels.js', 'chatrich.js', 'emojipick.js', 'chat2.css', 'sitegen.js', 'sitegen.css', 'shell.js', 'coord.js', 'assets/icon-512.png', 'assets/icon.svg', 'assets/wordmark.svg', 'manifest.webmanifest', 'assets/illustrations/cooperative.svg', 'assets/illustrations/campfire.svg', 'assets/illustrations/brain.svg', 'assets/illustrations/chat.svg', 'assist.js', 'assist.css', 'assets/apple-touch-icon.png', 'people.css', 'votes.css', 'gists.css', 'flow.css', 'repohero.css', 'mobile2.css', 'workshop.css', 'offline.css', 'agentshub.css', 'secretary.css', 'bubbles.css', 'plusmenu.css', 'preview.css', 'hub.css', 'folders.css', 'website.css', 'themes.css', 'viewers.css', 'phoneapp.css', 'offline.js', 'themes.js', 'votes.js', 'people.js', 'gists.js', 'flow.js', 'repohero.js', 'mobile2.js', 'workshop.js', 'agentshub.js', 'secretary.js', 'profilemenu.js', 'plusmenu.js', 'preview.js', 'github.js', 'folders.js', 'hub.js', 'website.js', 'viewers.js', 'phoneapp.js', 'assets/fonts/Inter-Bold.otf', 'assets/fonts/Inter-Medium.otf', 'assets/fonts/Inter-Regular.otf', 'assets/fonts/Inter-SemiBold.otf', 'assets/fonts/InterDisplay-ExtraBold.otf', 'assets/wordmark-light.svg', 'showcase.css', 'showcase.js', 'agentsdash.js', 'agentsdash.css', 'whiteboard.js', 'whiteboard.css', 'director.js', 'director.css', 'demo-game.html', 'setup.js', 'setup.css', 'captures.js', 'captures.css', 'welcome.js', 'welcome.css', 'filegrid.js', 'filegrid.css', 'assets.js', 'assets.css', 'inspo.js', 'reco.js', 'companylinks.js', 'inspo.css', 'cursors.js', 'cursors.css', 'sheet.js', 'deck.js', 'crafts.css', 'feedback.js', 'feedback.css', 'focus.js', 'assets/camp.svg', 'ship.js', 'ship.css', 'company.js', 'company.css', 'ledger.js', 'ledger.css', 'talent.js', 'talent.css', 'market.js', 'market.css', 'academy.js', 'academy.css', 'legal.js', 'legal.css', 'offload.js', 'offload.css', 'studios.js', 'studios.css', 'publish.js', 'publish.css', 'jam.js', 'jam.css', 'firstrun.js', 'firstrun.css', 'previewflint.css', 'previewflint.js', 'personalize.js', 'personalize.css', 'pins.js', 'pins.css', 'canvas/scene.js', 'canvas/layers.js', 'canvas/props.js', 'canvas/canvas.js', 'canvas/canvas.css', 'canvas/code.js', 'canvas/code.css', 'sitelib.js', 'sitelib.css', 'canvas/flint.js', 'canvas/flint.css', 'flintnlu.js', 'flintlocal.js', 'canvas/flintpane.js', 'canvas/flintpane.css', 'aibasics-core.js', 'aibasics.js', 'aibasics.css', 'flintgrow.js', 'inspoboard.js', 'inspoboard.css'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
if (/(^|\.)tauri\.localhost$/.test(self.location.hostname) || self.location.protocol === 'tauri:') {   // never inside the desktop app
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => self.registration.unregister())));
}
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || /^\/(api|mcp|ws|play|preview)(\/|$)/.test(u.pathname)) return;   // play links and previews are sandboxed pages: never through the shell cache
  // network first so updates show up immediately; fall back to the cached shell when offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

// ---- Web Push (server/notify.js encrypts with RFC 8291; the browser decrypts before this runs) ----
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'TribeCode', body: e.data ? e.data.text() : '' }; }
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
