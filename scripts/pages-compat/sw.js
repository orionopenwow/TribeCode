// The web app used to live at the site root with its own service worker. It moved to /app/ (with its own worker),
// and the root is the website now. This replaces the old root worker once: it lets go, so the front page is the site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  await self.registration.unregister();
  const cs = await self.clients.matchAll({ type: 'window' });
  cs.forEach(c => { try { c.navigate(c.url); } catch (_) {} });
})()));
