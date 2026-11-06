// Offline shell for the installed app. API, MCP and WebSocket traffic always goes to the network.
const CACHE = 'tribecode-shell-v2';
const SHELL = ['./', 'index.html', 'join.html', 'tokens.css', 'fonts.css', 'styles.css', 'updater.css', 'live.css', 'docs.css', 'mobile.css', 'coedit.css', 'store.js', 'tribe.js', 'onboarding.js', 'tour.js',
  'updater.js', 'md.js', 'tasks.js', 'ot.js', 'coedit.js', 'docs.js', 'board.js', 'bugs.js', 'palette.js', 'huddle.js', 'qr.js', 'app.js', 'assets/icon-512.png', 'assets/wordmark.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || /^\/(api|mcp|ws)\b/.test(u.pathname)) return;
  // network first so updates show up immediately; fall back to the cached shell when offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
