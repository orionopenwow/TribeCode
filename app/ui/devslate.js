// Clean-slate dev profile (feat/flint-runthrough, scripts/dev/clean-slate.js, docs/DEV-TOOLS.md). Loaded before store.js.
// Opened as /?devslate=<run id>: a new run id wipes this browser's TribeCode storage for this address (local and session
// storage, the shell cache and the service worker), then signs in as the local TEST "Guest" account (accounts.js, no
// tribe, nothing sent anywhere) and skips the intro. The same run id (clean-slate.js --keep) keeps what you had.
// While it's a dev session, the page also live-reloads when app/ui changes (GET /api/dev/stamp, the server's --dev),
// even with no tribe and so no socket.
//   window.TribeDevSlate = { run: '<run id>' | '' }
(function () {
  'use strict';
  let run = '';
  try {
    const q = new URLSearchParams(location.search), id = q.get('devslate');
    if (id) {
      if (localStorage.getItem('tribecode.devslate') !== id) {
        for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^tribecode/i.test(k)) localStorage.removeItem(k); }
        try { sessionStorage.clear(); } catch {}
        try { if (window.caches) caches.keys().then(ks => ks.filter(k => k.startsWith('tribecode-')).forEach(k => caches.delete(k))); } catch {}
        try { if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())); } catch {}
        localStorage.setItem('tribecode.devslate', id);
        localStorage.setItem('tribecode.settings.v1', JSON.stringify({ name: 'Guest', onboarded: true, server: { url: '', token: '' } }));
        localStorage.setItem('tribecode.accounts.v1', JSON.stringify({ test: false, mode: 'test', current: 'test:guest', accounts: [] }));   // accounts.js mounts the TEST accounts (?accounts=test below)
        localStorage.setItem('tribecode.intro.v1', 'seen');
        localStorage.setItem('tribecode.personalized', '1');
      }
      q.delete('devslate'); q.set('accounts', 'test'); q.set('skipIntro', '1');
      history.replaceState(null, '', location.pathname + '?' + q.toString() + location.hash);
    }
    run = localStorage.getItem('tribecode.devslate') || '';
  } catch {}
  // live reload for a dev session (the socket's dev-reload covers signed-in tabs; this covers a guest with no tribe)
  if (run) {
    let seen = 0;
    const tick = () => fetch('/api/dev/stamp', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (!j) return; if (seen && j.stamp !== seen) location.reload(); seen = j.stamp; }).catch(() => {});
    setInterval(() => { if (document.visibilityState === 'visible') tick(); }, 1500); tick();
  }
  window.TribeDevSlate = { run };
})();
