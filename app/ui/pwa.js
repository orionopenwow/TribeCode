// The browser app, as far as browsers go (docs/BROWSER-APP.md). Everything here is progressive: each piece checks for its
// API and does nothing where a browser lacks it.
//   * Shortcuts (manifest "shortcuts"): ?shortcut=note|flint|tasks|chat opens that place once the app is up.
//   * Share target: text, links, pictures and files shared into TribeCode (sw.js keeps them, ?share-target=1 shows them).
//   * File handlers: .md / .json / .glb / .png opened with TribeCode (launchQueue), and web+tribecode: links (?protocol=).
//     They land in one calm "incoming" sheet: send to chat, save as a note, view, or upload to your files.
//   * Badging: the app icon shows unread notifications + direct messages (navigator.setAppBadge).
//   * Wake lock: the screen stays on during a huddle, released when you leave or switch away.
//   * Storage: asks the browser to keep this device's data (navigator.storage.persist) and shows the quota in
//     Settings › Storage & sync ("This device").
//   * Background sync: unsent chat messages are mirrored for sw.js, which sends them even after the app is closed.
//   * Updates: when the service worker brings a new shell, the existing updater pill says "Restart to update".
// Public: window.TribePWA = { share(data), incoming(items), webRelease(), badge(n), storage(), mountStorage(el),
//   wake(), state(), menuItems(m) }.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const C = () => window.TribeClient, App = () => window.TribeApp;
  const params = new URLSearchParams(location.search);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, k) => (App() && App().toast ? App().toast(m, k) : console.log(m));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const st = { swUpdated: null, badge: null, wake: null, persisted: null, shortcut: null, synced: 0, strategy: null };
  const kb = n => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  async function ready(needTribe, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (App() && App().show && (!needTribe || (C() && C().connected()))) return true;
      await sleep(150);
    }
    return !!(App() && App().show && (!needTribe || (C() && C().connected())));
  }
  const cleanUrl = keys => { try { const u = new URL(location.href); keys.forEach(k => u.searchParams.delete(k)); history.replaceState(history.state, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash); } catch {} };

  // ---------------- shortcuts + web+tribecode: ----------------
  async function go(where) {
    st.shortcut = where;
    if (!(await ready(false))) return;
    if (where === 'chat') App().show('chat');
    else if (where === 'tasks') App().show('tasks');
    else if (where === 'flint') { if (window.TribeFlint) (window.TribeFlint.openFull || window.TribeFlint.focus)(); }
    else if (where === 'note') {
      const H = window.TribeHub;
      if (H && H.scratch && H.scratch.create) { const id = await H.scratch.create('New note'); H.openNote(id); }
      else if (window.TribeDocs) window.TribeDocs.create('New note');
    }
  }
  function protocol(raw) {
    // web+tribecode://join?s=<host>&c=<code> · web+tribecode://open/chat · web+tribecode://<an invite link>
    let s = String(raw || ''); try { s = decodeURIComponent(s); } catch {}
    const m = /^web\+tribecode:(?:\/\/)?(.*)$/i.exec(s); if (!m) return;
    const rest = m[1];
    const op = /^open\/(chat|tasks|note|flint)\b/i.exec(rest); if (op) return go(op[1].toLowerCase());
    const j = /^join\/?\?(.*)$/i.exec(rest);
    if (j) { const q = new URLSearchParams(j[1]), host = q.get('s'), code = q.get('c'); if (host && code) return ready(false).then(() => App().joinLink && App().joinLink(`${/^https?:/.test(host) ? host : 'https://' + host}/join/${code}`)); }
    if (/^https?:\/\//i.test(rest)) return ready(false).then(() => App().joinLink && App().joinLink(rest));
    toast('That TribeCode link isn\'t one this version understands.');
  }

  // ---------------- the incoming sheet (share target, file handlers) ----------------
  const isText = f => /^text\/|json$/.test(f.type || '') || /\.(md|markdown|json|txt)$/i.test(f.name || '');
  const isView = f => /\.(glb|gltf|png|gif|jpe?g|webp)$/i.test(f.name || '') || /^image\/(png|gif|jpeg|webp)$/.test(f.type || '');
  let sheet = null;
  function closeSheet() { if (!sheet) return; sheet.remove(); sheet = null; }
  async function upload(f) {
    const S = window.TribeStore, tok = S && S.get().server && S.get().server.token;
    const r = await fetch(C().base() + '/api/uploads?scope=me&name=' + encodeURIComponent(f.name || 'shared'), { method: 'POST', headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), 'Content-Type': f.type || 'application/octet-stream' }, body: f });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.statusText); return d.file;
  }
  async function asNote(text) {
    const H = window.TribeHub;
    if (H && H.scratch && H.scratch.create) { const id = await H.scratch.create(text); closeSheet(); H.openNote(id); return; }
    if (window.TribeDocs) { closeSheet(); await window.TribeDocs.create(String(text).split('\n')[0].slice(0, 60) || 'Shared', text); }
  }
  // items: { kind: 'share'|'file', title, text, url, files: [File], dropped }
  function incoming(it) {
    closeSheet();
    const files = it.files || [], words = [it.title, it.text, it.url].filter(Boolean);
    const msg = [it.text || it.title || '', it.url && !(it.text || '').includes(it.url) ? it.url : ''].filter(Boolean).join(' ').trim();
    const tribe = !!(C() && C().connected());
    sheet = document.createElement('div'); sheet.id = 'pwa-in'; sheet.className = 'pwa-in';
    sheet.innerHTML = `<div class="pwa-in-scrim" data-pin="close"></div>
      <section class="pwa-in-card" role="dialog" aria-modal="true" aria-labelledby="pwa-in-t">
        <span class="eyebrow">${it.kind === 'file' ? 'Opened with TribeCode' : 'Shared to TribeCode'}</span>
        <h2 id="pwa-in-t">${files.length && !msg ? esc(files.length === 1 ? files[0].name : `${files.length} files`) : esc((it.title || msg || 'Something to keep').slice(0, 90))}</h2>
        ${words.length ? `<blockquote class="pwa-in-text">${esc(msg || it.title).slice(0, 600)}</blockquote>` : ''}
        ${files.length ? `<ul class="pwa-in-files">${files.map((f, i) => `<li><span class="pwa-in-name"><b>${esc(f.name)}</b><small>${esc(kb(f.size || 0))}</small></span>
          ${isView(f) && window.TribeViewers ? `<button class="btn sm" data-pin="view" data-i="${i}">View</button>` : ''}${isText(f) ? `<button class="btn sm" data-pin="fnote" data-i="${i}">Open as a note</button>` : ''}</li>`).join('')}</ul>` : ''}
        ${it.dropped ? `<p class="pwa-in-hint">${it.dropped === 1 ? 'A file' : `${it.dropped} files`} couldn't come through this time. Open TribeCode once, then share again.</p>` : ''}
        ${!tribe && (msg || files.length) ? '<p class="pwa-in-hint">Join or start a tribe to send this to chat or your files. Notes work right away.</p>' : ''}
        <div class="pwa-in-acts">
          ${msg ? `<button class="btn primary" data-pin="chat" ${tribe ? '' : 'disabled'}>Send to chat</button><button class="btn" data-pin="note">Save as a note</button>` : ''}
          ${files.length ? `<button class="btn ${msg ? '' : 'primary'}" data-pin="upload" ${tribe ? '' : 'disabled'}>Upload to my files</button>` : ''}
          <button class="btn ghost" data-pin="close">Not now</button>
        </div>
      </section>`;
    document.body.appendChild(sheet);
    const first = sheet.querySelector('.pwa-in-acts .btn:not([disabled])'); if (first) first.focus();
    sheet.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
    sheet.addEventListener('click', async e => {
      const b = e.target.closest('[data-pin]'); if (!b) return;
      const k = b.dataset.pin, f = files[Number(b.dataset.i)];
      try {
        if (k === 'close') return closeSheet();
        if (k === 'chat') { App().sendQueued('general', '/chat/general/send', { text: msg.slice(0, 4000) }); closeSheet(); App().show('chat'); toast('Sent to chat'); }
        if (k === 'note') await asNote([it.title && it.title !== msg ? it.title : '', msg].filter(Boolean).join('\n'));
        if (k === 'fnote') await asNote(`${f.name}\n${(await f.text()).slice(0, 200000)}`);
        if (k === 'view') window.TribeViewers.open({ name: f.name, src: URL.createObjectURL(f), size: f.size });
        if (k === 'upload') { b.disabled = true; b.textContent = 'Uploading…'; for (const x of files) await upload(x); closeSheet(); toast(files.length === 1 ? `${files[0].name} is in your files` : `${files.length} files are in your files`); }
      } catch (err) { toast(err.message || String(err), 'err'); if (k === 'upload') { b.disabled = false; b.textContent = 'Upload to my files'; } }
    });
    return sheet;
  }
  async function takeShare() {
    const q = { title: params.get('title') || '', text: params.get('text') || '', url: params.get('url') || '', dropped: Number(params.get('dropped')) || 0, files: [], kind: 'share' };
    try {   // the service worker kept the POST (sw.js shareIn): read it once, then forget it
      if (window.caches) {
        const rt = await caches.open('tribecode-runtime'), meta = await rt.match('__share/meta');
        if (meta) {
          const m = await meta.json();
          Object.assign(q, { title: m.title || q.title, text: m.text || q.text, url: m.url || q.url });
          for (const f of m.files || []) { const r = await rt.match(`__share/file/${f.i}`); if (r) q.files.push(new File([await r.blob()], f.name, { type: f.type })); await rt.delete(`__share/file/${f.i}`); }
          await rt.delete('__share/meta');
        }
      }
    } catch {}
    cleanUrl(['share-target', 'title', 'text', 'url', 'dropped']);
    await ready(false);
    if (q.title || q.text || q.url || q.files.length || q.dropped) incoming(q);
  }

  // ---------------- badging ----------------
  function unread() {
    const N = window.TribeNotify, D = window.TribeDM;
    let n = 0; try { n += (N && N.state ? N.state().unread || 0 : 0); } catch {}
    try { if (D && D.unread) for (const v of Object.values(D.unread() || {})) n += Number(v) || 0; } catch {}
    return n;
  }
  function badge(n = unread()) {
    if (n === st.badge) return n; st.badge = n;
    try { if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n).catch(() => {}); else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {}); } catch {}
    return n;
  }

  // ---------------- wake lock during huddles ----------------
  async function wake() {
    const inCall = !!(window.TribeHuddle && window.TribeHuddle.inCall && window.TribeHuddle.inCall());
    if (!('wakeLock' in navigator)) return false;
    if (inCall && !st.wake && document.visibilityState === 'visible') {
      try { st.wake = await navigator.wakeLock.request('screen'); st.wake.addEventListener('release', () => { st.wake = null; }); } catch { st.wake = null; }
    } else if (!inCall && st.wake) { try { await st.wake.release(); } catch {} st.wake = null; }
    return !!st.wake;
  }

  // ---------------- storage: persist + quota (Settings › Storage & sync) ----------------
  async function storage() {
    const s = navigator.storage; if (!s || !s.estimate) return null;
    const e = await s.estimate().catch(() => null), persisted = s.persisted ? await s.persisted().catch(() => false) : false;
    st.persisted = persisted;
    return e ? { usage: e.usage || 0, quota: e.quota || 0, persisted, canPersist: !!s.persist } : null;
  }
  async function mountStorage(el) {
    if (!el) return;
    const s = await storage();
    if (!s) { el.innerHTML = '<span class="faint">This browser doesn\'t say how much it keeps.</span>'; return; }
    const pct = s.quota ? Math.min(100, (s.usage / s.quota) * 100) : 0;
    el.innerHTML = `<div class="pwa-store"><div class="pwa-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(1)}" aria-label="Storage used on this device"><i style="width:${Math.max(pct, 0.6).toFixed(1)}%"></i></div>
      <span class="pwa-store-t"><b>${esc(kb(s.usage))}</b> of ${esc(kb(s.quota))} used on this device</span>
      <span class="pwa-store-p" data-on="${s.persisted}">${s.persisted ? 'Kept: the browser won\'t clear it to save space.' : 'The browser may clear it when space runs low.'}</span>
      ${!s.persisted && s.canPersist ? '<button class="btn sm" id="pwa-persist">Keep it on this device</button>' : ''}</div>`;
    const b = el.querySelector('#pwa-persist');
    if (b) b.onclick = async () => { const ok = await navigator.storage.persist().catch(() => false); toast(ok ? 'This device keeps TribeCode\'s data now.' : 'The browser said not yet. Installing the app usually lets it keep the data.'); mountStorage(el); };
  }
  // Settings is drawn by settings.js; this adds one row under "Storage & sync" whenever it appears (no edit there).
  function settingsHook() {
    const body = $('#settings-body'); if (!body || body.querySelector('#set-device')) return;
    const anchor = body.querySelector('#set-storage') ? body.querySelector('#set-storage').closest('.set-row') : body.querySelector('.set-more');
    if (!anchor || !navigator.storage || !navigator.storage.estimate) return;
    anchor.insertAdjacentHTML(anchor.classList.contains('set-more') ? 'beforebegin' : 'afterend', '<div class="set-row" id="set-device-row"><div class="set-l"><b>This device</b><small>Space the app uses here for drafts, the offline copy and shared files.</small></div><div class="set-c" id="set-device"></div></div>');
    mountStorage($('#set-device'));
  }

  // ---------------- background sync: mirror the outbox for sw.js ----------------
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('tribecode-pwa', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const kv = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', v === undefined ? 'readonly' : 'readwrite'), s = t.objectStore('kv'); const r = v === undefined ? s.get(k) : (v === null ? s.delete(k) : s.put(v, k)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
  async function mirror(items) {
    if (!window.indexedDB) return;
    const S = window.TribeStore, tok = S && S.get().server && S.get().server.token;
    const chats = (items || []).filter(it => it.kind === 'chat' && it.body && it.body.cid && it.method === 'POST');
    try {
      await kv('outbox', { base: C().base(), token: tok || '', items: chats.map(it => ({ id: it.id, path: it.path, body: it.body, project: it.project || null })) });
      if (chats.length && 'serviceWorker' in navigator) { const reg = await navigator.serviceWorker.ready; if (reg.sync) { await reg.sync.register('tribe-outbox'); st.synced++; } }
    } catch {}
  }
  async function reconcile() {   // messages sw.js sent while the app was closed: drop them from this page's outbox
    try {
      const sent = await kv('sent'); if (!sent || !sent.length || !C().outbox) return;
      const ob = C().outbox(), left = ob.filter(it => !sent.includes(it.id));
      if (left.length !== ob.length) { localStorage.setItem('tribecode.outbox:' + C().base(), JSON.stringify(left)); document.querySelectorAll('.msg.pending[data-cid]').forEach(el => { if (sent.includes(el.dataset.cid)) el.remove(); }); }
      await kv('sent', null);
    } catch {}
  }

  // ---------------- updates (the existing updater shows the pill) ----------------
  function webRelease() {
    if (!st.swUpdated) return null;
    const meta = document.querySelector('meta[name="tribe-version"]'), v = st.swUpdated.version || (meta && meta.content) || '0.1.1';
    return { version: v, date: new Date().toISOString(), notes: '- A new version of the app is ready on this device',
      async download(p) { p(1); }, async installAndRelaunch() { location.reload(); } };
  }

  // ---------------- Web Share ----------------
  async function share(d) {
    try {
      if (navigator.share && (!d.files || (navigator.canShare && navigator.canShare(d)))) { await navigator.share(d); return 'shared'; }
    } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    const text = [d.title, d.text, d.url].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(text); toast('Copied. Paste it anywhere.'); return 'copied'; } catch { return 'failed'; }
  }
  // the chat message menu (chatx.js) asks for extra items
  const SHARE_I = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
  function menuItems(m) {
    if (!m || m.deleted || !navigator.share || !m.text) return '';
    return `<button role="menuitem" data-pwa-share="${esc(String(m.text).slice(0, 2000))}">${SHARE_I}Share…</button>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-pwa-share]'); if (!b) return;
    const menu = $('#msg-menu'); if (menu) menu.remove();
    share({ title: 'From TribeCode', text: b.dataset.pwaShare });
  });

  // ---------------- wiring ----------------
  function start() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', e => {
        const d = e.data || {};
        if (d.type === 'tribe-sw-updated') { st.swUpdated = d; if (window.TribeUpdater) window.TribeUpdater.check(); }
        if (d.type === 'tribe-flush-outbox' && C() && C().flush) C().flush();
        if (d.type === 'tribe-strategy') st.strategy = d.strategy;
      });
      navigator.serviceWorker.ready.then(r => { if (r.active) r.active.postMessage({ type: 'tribe-strategy' }); }).catch(() => {});
    }
    if (params.has('shortcut')) { const w = params.get('shortcut'); cleanUrl(['shortcut', 'source']); go(w); }
    if (params.has('protocol')) { const p = params.get('protocol'); cleanUrl(['protocol']); protocol(p); }
    if (params.has('share-target')) takeShare();
    if ('launchQueue' in window) window.launchQueue.setConsumer(async lp => {
      if (!lp.files || !lp.files.length) return;
      const files = []; for (const h of lp.files) { try { files.push(await h.getFile()); } catch {} }
      cleanUrl(['open-file']);
      if (files.length) { await ready(false); incoming({ kind: 'file', files }); }
    });
    const hook = (n = 0) => {
      const c = C(); if (!c || !c.on) { if (n < 100) setTimeout(() => hook(n + 1), 150); return; }
      c.on('outbox', mirror);
      c.on('status', s => { if (s && s.status === 'online') reconcile(); });
    };
    hook();
    setInterval(() => { badge(); wake(); }, 4000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { st.wake = null; wake(); badge(); } });
    new MutationObserver(() => { const s = $('#settings-modal'); if (s && !s.classList.contains('hidden')) settingsHook(); }).observe(document.body, { childList: true, subtree: true });
    if (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)').matches) document.documentElement.classList.add('pwa-installed');
  }
  window.TribePWA = { share, incoming, webRelease, badge, unread, storage, mountStorage, wake, menuItems, protocol, go, mirror,
    state: () => ({ ...st, wake: !!st.wake, badgeApi: !!navigator.setAppBadge, launchQueue: 'launchQueue' in window }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
