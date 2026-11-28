// Self-heal: the first script on the page (index.html loads it before anything else).
//  1. Start-up watchdog. If the shell hasn't built within ~6 s (no nest rows, no view) or one of our own scripts
//     threw while the page was starting, clear stale caches (service workers + CacheStorage, the usual cause:
//     an old cached page with new scripts, or the reverse) and reload once. If it still fails, show a calm
//     "Something went wrong" card (Reload / Send report) instead of a half-built page. The code repositoryrt goes to the
//     bug inbox with the recent logs; Settings → "Send crash reports" turns automatic reports off.
//  2. Version check. index.html carries the server version it was served with (<meta name="tribe-version">,
//     stamped by server/index.js). When the running server says another version (it was updated while this tab
//     was open, or a service worker served an old page), offer a soft reload. In the desktop app, a server
//     whose version differs from the app's re-runs the stale-server check (app.js hostHere).
//  3. Error budget. Identical errors are de-duplicated and rate-limited before anything is filed
//     (TribeSelfHeal.shouldFile, used by bugs.js for automatic crash reports).
//  4. Build check (fix/p15-updates, docs/UPDATES.md): the page build (<meta name="tribe-build">) vs the server build; Repair install.
// Public: window.TribeSelfHeal = { clearCache (= repair), repair, about, buildCheck, restartServer, check, shouldFile, report, reportsOn, versionCheck, logs, state }.
// Docs: docs/EXPLORER.md ("Self-heal").
(function () {
  'use strict';
  const HEAL = 'tribecode.heal';          // sessionStorage: the one automatic clear-and-reload already happened
  const BUDGET = 'tribecode.errbudget';   // localStorage: { sig: lastFiledAt } + recent filing times
  const params = new URLSearchParams(location.search);
  const WAIT = Math.max(500, Number(params.get('healWait')) || 6000);
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} }, del: k => { try { sessionStorage.removeItem(k); } catch {} } };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const settings = () => { try { return JSON.parse(ls.get('tribecode.settings.v1') || '{}') || {}; } catch { return {}; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const logs = [], bootErrors = [];
  let settled = false, reported = false, card = null, booting = true;   // booting: until the page has loaded and run its start-up code
  const t0 = Date.now();
  const log = line => { logs.push(`${new Date().toISOString().slice(11, 19)} ${String(line).slice(0, 400)}`); if (logs.length > 40) logs.shift(); };

  // ---------- one-time clean-up of old UI state (fix/desk-demo, docs/UI-CLEANUP.md) ----------
  // Keys only old layouts read: left behind, they brought an old view back (the old Docs/Files sort, view and kind, the old
  // nav, the old site builder's level and step). Run once per clean-up version, before any other script reads them.
  const CLEANUP = '0.30.1-ui1', DEAD = ['tribecode.docs.sort', 'tribecode.docs.view', 'tribecode.files.kind', 'tribecode.nav', 'tribecode.sitegen.mode', 'tribecode.sitegen.step'];
  const DEAD_PREFIX = ['tribecode.sitegen.'];
  try {
    if (ls.get('tribecode.uiCleanup') !== CLEANUP) {
      DEAD.forEach(k => { try { localStorage.removeItem(k); } catch {} });
      for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && DEAD_PREFIX.some(p => k.startsWith(p))) localStorage.removeItem(k); }
      ls.set('tribecode.uiCleanup', CLEANUP);
    }
  } catch {}

  // ---------- what counts as ours, and what counts as fatal ----------
  const own = f => !f || f.startsWith(location.origin) || /^(tauri:|https?:\/\/tauri\.localhost)/.test(f);
  const noise = m => /ResizeObserver|^Script error\.?$|chrome-extension:|moz-extension:/.test(String(m || ''));
  addEventListener('error', e => {
    const t = e.target;
    if (t && t !== window && t.tagName === 'SCRIPT') {   // one of our scripts failed to load at all
      log(`script failed to load: ${t.src}`);
      if (booting && own(t.src)) bootErrors.push({ message: `Could not load ${String(t.src).split('/').pop()}`, file: t.src });
      return;
    }
    if (!e.message || noise(e.message)) return;
    log(`${e.message} @ ${String(e.filename || '').split('/').pop()}:${e.lineno || 0}`);
    if (booting && own(e.filename)) bootErrors.push({ message: e.message, file: e.filename, line: e.lineno, stack: e.error && e.error.stack });
  }, true);
  addEventListener('unhandledrejection', e => { const r = e.reason || {}; log(`unhandled: ${r.message || r}`); });
  const origErr = console.error.bind(console);
  console.error = (...a) => { try { log(a.map(x => (x && x.stack) || String(x)).join(' ')); } catch {} origErr(...a); };

  // ---------- health ----------
  function healthy() {
    const b = document.body;
    return !!(window.TribeApp && window.TribeShell && window.TribeClient && b && b.dataset.view &&
      document.querySelector('#pj-nav > *, #nest-groups .nest-row, .nest-row'));
  }
  async function clearCaches() {
    try { if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } } catch {}
    try { if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k))); } catch {}
  }

  async function check(why) {
    if (settled) return;
    const ok = healthy(), fatal = bootErrors.length > 0;
    if (ok && !fatal) {
      settled = true;
      setTimeout(() => ss.del(HEAL), 10000);   // a later failure in this tab may heal once again
      return;
    }
    settled = true;
    const reason = fatal ? `a script failed while starting: ${bootErrors[0].message}` : 'the app did not finish starting';
    log(`self-heal: ${reason} (${why}, ${Date.now() - t0} ms)`);
    if (!ss.get(HEAL)) {   // first time in this tab: clear what may be stale and try once more
      ss.set(HEAL, JSON.stringify({ at: Date.now(), reason }));
      await clearCaches();
      location.reload();
      return;
    }
    showCard(ok ? 'banner' : 'blocking', reason);
    if (reportsOn()) report(reason, true);
  }

  // ---------- the card ----------
  const CSS = `
  #sh-card{position:fixed;z-index:2147483000;font:14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#F8FAFC}
  #sh-card.blocking{inset:0;background:#12151A;display:grid;place-items:center;padding:16px}
  #sh-card.banner{right:16px;bottom:16px;max-width:420px}
  #sh-card .sh-box{background:#1B2028;border:1px solid #2A313C;border-radius:16px;padding:22px 22px 18px;max-width:440px;width:100%}
  #sh-card .sh-eyebrow{font:500 11px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#F26B1D}
  #sh-card h2{font-size:19px;line-height:1.3;margin:8px 0 6px;font-weight:650;color:#F8FAFC}
  #sh-card p{margin:0 0 14px;color:#D4DBE5}
  #sh-card details{margin:0 0 14px;color:#D4DBE5;font-size:12.5px}
  #sh-card summary{cursor:pointer;color:#F8FAFC}
  #sh-card pre{white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto;background:#12151A;border:1px solid #2A313C;border-radius:8px;padding:8px 10px;margin:8px 0 0;font:11.5px/1.5 "JetBrains Mono",ui-monospace,monospace;color:#D4DBE5}
  #sh-card .sh-acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
  #sh-card button{height:36px;padding:0 14px;border-radius:8px;border:1px solid #2A313C;background:#1E242D;color:#F8FAFC;font:600 13.5px/1 inherit;cursor:pointer}
  #sh-card button:hover{border-color:#3A4352}
  #sh-card button.sh-primary{background:#F26B1D;border-color:#F26B1D;color:#12151A}
  #sh-card button:focus-visible{outline:2px solid #38C6B1;outline-offset:2px}
  #sh-ver{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:2147482000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);background:#1B2028;border:1px solid #2A313C;border-radius:12px;padding:10px 10px 10px 14px;font:13.5px/1.4 Inter,system-ui,sans-serif;color:#F8FAFC}
  #sh-ver span,#sh-build span{color:#F8FAFC}
  #sh-build{position:fixed;left:50%;transform:translateX(-50%);top:76px;z-index:2147482001;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);background:#1B2028;border:1px solid #2A313C;border-radius:12px;padding:10px 10px 10px 14px;font:13.5px/1.4 Inter,system-ui,sans-serif;color:#F8FAFC}
  #sh-build button{height:32px;padding:0 12px;border-radius:8px;border:1px solid #2A313C;background:#1E242D;color:#F8FAFC;font:600 13px/1 inherit;cursor:pointer;white-space:nowrap}
  #sh-build button.sh-primary{background:#F26B1D;border-color:#F26B1D;color:#12151A}
  #sh-build button:focus-visible{outline:2px solid #38C6B1;outline-offset:2px}
  @media (max-width:600px){#sh-build{top:auto;bottom:calc(84px + env(safe-area-inset-bottom));flex-wrap:wrap;width:calc(100vw - 32px)}#sh-build span{flex:1 1 100%}}
  #sh-ver button{height:32px;padding:0 12px;border-radius:8px;border:1px solid #2A313C;background:#1E242D;color:#F8FAFC;font:600 13px/1 inherit;cursor:pointer;white-space:nowrap}
  #sh-ver button.sh-primary{background:#F26B1D;border-color:#F26B1D;color:#12151A}
  @media (max-width:820px){#sh-ver{bottom:calc(84px + env(safe-area-inset-bottom))}}`;
  function style() { if (document.getElementById('sh-style')) return; const s = document.createElement('style'); s.id = 'sh-style'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
  function showCard(mode, reason) {
    style();
    if (card) card.remove();
    card = document.createElement('div'); card.id = 'sh-card'; card.className = mode;
    card.setAttribute('role', mode === 'blocking' ? 'alertdialog' : 'alert'); card.setAttribute('aria-labelledby', 'sh-title');
    const first = bootErrors[0];
    card.innerHTML = `<div class="sh-box"><div class="sh-eyebrow">Self-heal</div>
      <h2 id="sh-title">Something went wrong</h2>
      <p>${mode === 'blocking' ? "TribeCode didn't finish starting. We cleared old cached files and tried once more." : 'Part of TribeCode failed to load. The rest still works.'} Your tribe's files are safe on the host.</p>
      <details><summary>Details</summary><pre>${esc([reason, first && first.stack ? first.stack : '', ...logs.slice(-8)].filter(Boolean).join('\n'))}</pre></details>
      <div class="sh-acts">${mode === 'banner' ? '<button id="sh-dismiss">Dismiss</button>' : ''}<button id="sh-report">${reported ? 'Report sent' : 'Send report'}</button><button class="sh-primary" id="sh-reload">Reload</button></div></div>`;
    (document.body || document.documentElement).appendChild(card);
    card.querySelector('#sh-reload').onclick = () => location.reload();
    const rep = card.querySelector('#sh-report');
    rep.disabled = reported;
    rep.onclick = async () => { rep.disabled = true; rep.textContent = 'Sending…'; const ok = await report(reason, false); rep.textContent = ok ? 'Report sent' : 'Copied the details'; };
    const d = card.querySelector('#sh-dismiss'); if (d) d.onclick = () => card.remove();
    if (mode === 'blocking') card.querySelector('#sh-reload').focus();
  }

  // ---------- reports: the bug inbox, through the error budget ----------
  const reportsOn = () => settings().crashReports !== false;
  function sigOf(msg) { return String(msg || '').toLowerCase().replace(/https?:\/\/\S+/g, 'url').replace(/[0-9a-f]{6,}/g, 'id').replace(/\d+/g, 'n').replace(/\s+/g, ' ').trim().slice(0, 160); }
  // true when this error may be filed now: one per identical error per 30 min, at most 5 per hour from this device.
  function shouldFile(msg, { now = Date.now() } = {}) {
    let b = {}; try { b = JSON.parse(ls.get(BUDGET) || '{}') || {}; } catch {}
    b.sigs = b.sigs || {}; b.times = (b.times || []).filter(t => now - t < 3600_000);
    const sig = sigOf(msg);
    for (const [k, t] of Object.entries(b.sigs)) if (now - t > 24 * 3600_000) delete b.sigs[k];
    let ok = true;
    if (b.sigs[sig] && now - b.sigs[sig] < 30 * 60_000) ok = false;
    else if (b.times.length >= 5) ok = false;
    if (ok) { b.sigs[sig] = now; b.times.push(now); } else b.suppressed = (b.suppressed || 0) + 1;
    ls.set(BUDGET, JSON.stringify(b));
    return ok;
  }
  function server() {
    const st = settings(), served = /^https?:$/.test(location.protocol) && !/(^|\.)tauri\.localhost$/.test(location.hostname);
    const base = served ? location.origin : ((st.server && st.server.url) || '');
    return { base, token: (st.server && st.server.token) || '' };
  }
  async function report(reason, auto) {
    const { base, token } = server();
    const text = [reason, '', ...logs.slice(-15)].join('\n');
    if (auto && !shouldFile('selfheal ' + reason)) return false;
    const demo = !!(window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active());   // fix/desk-demo: a demo never reports into your own tribe
    if (!base || !token || demo) { try { await navigator.clipboard.writeText(text); } catch {} return false; }
    let project = ''; try { project = localStorage.getItem('tribecode.project:' + base) || ''; } catch {}
    try {
      const r = await fetch(base + '/api/bugs', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(project ? { 'X-Project': project } : {}) },
        body: JSON.stringify({ title: `Start-up failed: ${String(reason).slice(0, 110)}`, details: `Reported by the self-heal watchdog${auto ? ' automatically' : ''}. ${navigator.userAgent}`, logs: text, view: 'boot', version: pageVersion() || '', auto: true }) });
      reported = reported || r.ok;
      const b = card && card.querySelector('#sh-report'); if (b && r.ok) { b.textContent = 'Report sent'; b.disabled = true; }
      return r.ok;
    } catch { try { await navigator.clipboard.writeText(text); } catch {} return false; }
  }

  // ---------- version mismatch ----------
  const pageVersion = () => { const m = document.querySelector('meta[name="tribe-version"]'); return (m && m.content) || ''; };
  let prompted = '';
  async function versionCheck(serverVersion) {
    if (!serverVersion) return null;
    const tauri = window.__TAURI__, served = /^https?:$/.test(location.protocol) && !/(^|\.)tauri\.localhost$/.test(location.hostname);
    if (tauri && !served) {   // desktop app with its own bundled page: the server should be this app's version
      let mine = ''; try { mine = tauri.app ? await tauri.app.getVersion() : ''; } catch {}
      if (!mine || mine === serverVersion || ss.get('tribecode.staleRecheck') || !settings().hosting || settings().hostOff) return null;
      ss.set('tribecode.staleRecheck', serverVersion);
      log(`server v${serverVersion} differs from the app v${mine}: re-running the stale-server check`);
      if (window.TribeApp && window.TribeApp.hostHere) window.TribeApp.hostHere({ quiet: true });
      return 'recheck';
    }
    const page = pageVersion();
    if (!page || page === serverVersion || prompted === serverVersion) return null;
    prompted = serverVersion;
    // The server is newer than this page (an update landed): reload into it by itself, once per version, unless
    // someone is mid-sentence. Then the page and the server always match, with nothing to click.
    if (newer(serverVersion, page) && ss.get('tribecode.autoReloaded') !== serverVersion) {
      const busy = () => { const a = document.activeElement; return !!(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'button') || a.isContentEditable) && String(a.value || a.textContent || '').trim()); };
      const go = async () => { ss.set('tribecode.autoReloaded', serverVersion); log(`server v${serverVersion} is newer than this page v${page}: reloading`); try { if (window.TribeApp && window.TribeApp.saveAll) await Promise.race([window.TribeApp.saveAll(), new Promise(r => setTimeout(r, 1500))]); } catch {} await clearCaches(); location.reload(); };
      if (!busy()) { go(); return 'reload'; }
      const t = setInterval(() => { if (!busy()) { clearInterval(t); go(); } }, 2000);
      return 'reload-soon';
    }
    style();
    let bar = document.getElementById('sh-ver'); if (bar) bar.remove();
    bar = document.createElement('div'); bar.id = 'sh-ver'; bar.setAttribute('role', 'status');
    bar.innerHTML = `<span>TribeCode ${newer(serverVersion, page) ? 'was updated to' : 'is running'} v${esc(serverVersion)}. Reload to use it.</span><button id="sh-ver-later">Later</button><button class="sh-primary" id="sh-ver-reload">Reload</button>`;
    document.body.appendChild(bar);
    bar.querySelector('#sh-ver-later').onclick = () => bar.remove();
    bar.querySelector('#sh-ver-reload').onclick = async () => { await clearCaches(); location.reload(); };
    return 'prompt';
  }
  function newer(a, b) { const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0), pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); return false; }

  // ---------- wiring ----------
  function start() {
    // a fatal error during boot: decide soon after load instead of waiting the whole watchdog
    // Only errors thrown while the scripts first run count as fatal (until load + 0.8 s); later errors are bugs.js's.
    const early = () => setTimeout(() => { booting = false; if (bootErrors.length) check('error during start'); }, 800);
    if (document.readyState === 'complete') early(); else addEventListener('load', early);
    // Settle as soon as the shell is up; give up waiting at WAIT (~6 s).
    const poll = () => { if (settled) return; if (!booting && healthy()) return check('healthy'); if (Date.now() - t0 >= WAIT) return check('watchdog'); setTimeout(poll, 400); };
    setTimeout(poll, 400);
    // the server's version: on every hello (connect and reconnect), and once for pages with no tribe yet
    const hook = (n = 0) => { if (window.TribeClient && window.TribeClient.on) window.TribeClient.on('hello', m => versionCheck(m && m.version)); else if (n < 50) setTimeout(() => hook(n + 1), 200); };
    hook();
    if (pageVersion() && /^https?:$/.test(location.protocol)) setTimeout(() => {
      if (window.TribeClient && window.TribeClient.connected && window.TribeClient.connected()) return;
      // setting up on this device (docs/LIGHT-HOSTING.md): nothing goes to a server before a home is chosen
      if ((window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo()) || document.querySelector('#tn, #su-where')) return;
      fetch('/api/health', { cache: 'no-store' }).then(r => r.json()).then(h => versionCheck(h.version)).catch(() => {});
    }, 2500);
  }
  start();
  // Refresh TribeCode (Settings › Fix problems): drop the stored app files (service worker + caches) and reload, keeping
  // what matters: sign-in and settings, unsent messages (outbox), the cloud-save copy, drafts and the view you were on.
  // Those live in localStorage/sessionStorage, which this never touches; the reload lands on the same view.
  async function refresh() {
    try { const v = document.body && document.body.dataset.view; if (v) sessionStorage.setItem('tribecode.view', v); } catch {}
    await clearCaches();
    const u = new URL(location.href); u.searchParams.set('fresh', Date.now().toString(36)); location.replace(u.toString());
  }
  // ---------- fix/p7-cache: never keep showing an old version's screens ----------
  // Drop every service-worker cache and worker (the app's own shell copies; saved settings live elsewhere and stay).
  async function dropCaches() {
    try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch {}
    try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch {}
  }
  // The desktop app: the first start of a new version drops the old shell copies and reloads once into fresh files.
  (async () => {
    const T = window.__TAURI__; if (!T || !T.app) return;
    let mine = ''; try { mine = await T.app.getVersion(); } catch { return; }
    let last = ''; try { last = localStorage.getItem('tribecode.uiVersion') || ''; } catch {}
    if (!mine || last === mine) return;
    try { localStorage.setItem('tribecode.uiVersion', mine); } catch {}
    if (!last || ss.get('tribecode.uiReloaded') === mine) return;   // a first install has nothing old to drop
    ss.set('tribecode.uiReloaded', mine); log(`app updated from v${last} to v${mine}: dropping old cached files`);
    await dropCaches(); location.reload();
  })();

  // ---------- fix/p15-updates: the build check (docs/UPDATES.md) ----------
  // The page carries the build it was made from (<meta name="tribe-build">, stamped at release, never rewritten by the
  // server); the server says its own (/api/health and the websocket hello). They differ when:
  //   - a stored copy of the page is older than the server (service worker, an open tab): reload with fresh files;
  //   - the files were updated but the server process is still the old one (a desktop sidecar or `npm start` left running):
  //     only a restart of the server fixes it.
  // So: the first mismatch for a server build drops the stored app files and reloads once (on start), or shows
  // "TribeCode was updated · Reload" and reloads by itself when idle (mid-session, from the hello). If the page still
  // doesn't match after that reload, "Finish updating · Restart TribeCode". sessionStorage counts, so it never loops.
  const BUILDHEAL = 'tribecode.buildHeal';
  const pageBuild = () => { const m = document.querySelector('meta[name="tribe-build"]'); return (m && m.content) || ''; };
  const servedHere = () => /^https?:$/.test(location.protocol) && !/(^|\.)tauri\.localhost$/.test(location.hostname);
  const localHost = u => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(String(u || ''));
  const tr = s => { try { return window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s) : s; } catch { return s; } };
  const healState = () => { try { return JSON.parse(ss.get(BUILDHEAL) || '{}') || {}; } catch { return {}; } };
  let lastServer = { build: '', version: '' }, idleTimer = null, lastInput = Date.now();
  ['keydown', 'pointerdown', 'input', 'wheel'].forEach(ev => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
  const typing = () => { const a = document.activeElement; return !!(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range)$/.test(a.type)) || a.isContentEditable) && String(a.value || a.textContent || '').trim()); };
  const IDLE = Math.max(500, Number(params.get('updateIdle')) || 15000), EARLY = Math.max(0, Number(params.get('updateEarly')) || 15000);   // ?updateIdle= / ?updateEarly= (tests)
  function hideBuildBar() { const b = document.getElementById('sh-build'); if (b) b.remove(); if (idleTimer) { clearInterval(idleTimer); idleTimer = null; } }
  function buildBar(kind) {
    style(); hideBuildBar();
    const text = kind === 'reload' ? tr('TribeCode was updated. Reload to use the new version.')
      : kind === 'manual' ? tr('Finish updating: close TribeCode on the computer that keeps your tribe, then open it again.')
      : tr('Finish updating: restart TribeCode once to use the new version.');
    const go = kind === 'finish' ? tr('Restart TribeCode') : tr('Reload');
    const bar = document.createElement('div'); bar.id = 'sh-build'; bar.className = 'sh-ver-bar'; bar.dataset.kind = kind; bar.setAttribute('role', 'status');
    bar.innerHTML = `<span>${esc(text)}</span>${kind === 'reload' ? `<button id="sh-build-later">${esc(tr('Later'))}</button>` : ''}<button class="sh-primary" id="sh-build-go">${esc(go)}</button>`;
    (document.body || document.documentElement).appendChild(bar);
    const later = bar.querySelector('#sh-build-later'); if (later) later.onclick = hideBuildBar;
    bar.querySelector('#sh-build-go').onclick = async e => {
      e.currentTarget.disabled = true; e.currentTarget.textContent = kind === 'finish' ? tr('Restarting…') : tr('Reloading…');
      if (kind === 'finish') return repair({ why: 'finish updating' });
      return freshReload(lastServer.build);
    };
    return bar;
  }
  let reloading = false;
  async function freshReload(serverBuild) {
    if (reloading) return; reloading = true;
    ss.set(BUILDHEAL, JSON.stringify({ build: serverBuild || '', n: (healState().build === serverBuild ? (healState().n || 0) : 0) + 1, at: Date.now() }));
    try { if (window.TribeApp && window.TribeApp.saveAll) await Promise.race([window.TribeApp.saveAll(), new Promise(r => setTimeout(r, 1500))]); } catch {}
    await dropCaches();
    const u = new URL(location.href); u.searchParams.set('fresh', Date.now().toString(36)); location.replace(u.href);
  }
  async function buildCheck(serverBuild, opts) {
    const o = opts || {}, page = pageBuild();
    if (serverBuild) lastServer = { build: serverBuild, version: o.version || lastServer.version };
    if (!serverBuild || !page || reloading) return null;   // a development copy without build ids: nothing to compare
    const T = window.__TAURI__, st = settings(), h = healState();
    if (T && !servedHere()) {   // the desktop app's own page: only this computer's own server must match it
      const url = (st.server && st.server.url) || '';
      if (!st.hosting || st.hostOff || !localHost(url)) return null;   // a friend's tribe may run another version: fine
      if (serverBuild === page) { ss.del(BUILDHEAL); hideBuildBar(); return 'ok'; }
      if (h.build !== serverBuild) {
        ss.set(BUILDHEAL, JSON.stringify({ build: serverBuild, n: 1, at: Date.now() }));
        log(`this computer's server is build ${serverBuild}, the app is ${page}: restarting it`);
        if (window.TribeApp && window.TribeApp.hostHere) window.TribeApp.hostHere({ quiet: true });
        return 'recheck';
      }
      buildBar('finish'); return 'finish';
    }
    if (!servedHere()) return null;
    if (serverBuild === page) { ss.del(BUILDHEAL); hideBuildBar(); return 'ok'; }
    if (h.build === serverBuild && (h.n || 0) >= 1) {   // reloaded once already: the page on the server's disk is newer than the server
      const me = server();
      buildBar(localHost(location.href) && me.token ? 'finish' : 'manual'); log(`still build ${page} vs server ${serverBuild} after a fresh reload: finish updating`);
      return 'finish';
    }
    const early = o.from !== 'hello' || Date.now() - t0 < EARLY;
    if (early) { log(`page build ${page} vs server ${serverBuild}: dropping stored app files and reloading once`); await freshReload(serverBuild); return 'reload'; }
    buildBar('reload');   // mid-session (the server was updated): ask, and reload by itself once nobody is typing
    idleTimer = setInterval(() => { if (!typing() && Date.now() - lastInput >= IDLE && document.getElementById('sh-build')) { clearInterval(idleTimer); idleTimer = null; freshReload(serverBuild); } }, 1000);
    return 'reload-soon';
  }
  // Ask this computer's server to restart (it can when started by the update script or the .bat loop: TRIBE_SUPERVISED).
  async function restartServer() {
    const me = server(); if (!me.base || !localHost(me.base)) return false;
    let pid = 0; try { pid = (await (await fetch(me.base + '/api/health', { cache: 'no-store' })).json()).pid || 0; } catch {}
    let r; try { r = await fetch(me.base + '/api/admin/restart', { method: 'POST', headers: me.token ? { Authorization: 'Bearer ' + me.token } : {} }); } catch { return false; }
    if (!r.ok) return false;
    for (const until = Date.now() + 30000; Date.now() < until;) {
      await new Promise(res => setTimeout(res, 500));
      try { const hh = await (await fetch(me.base + '/api/health', { cache: 'no-store' })).json(); if (hh.pid && hh.pid !== pid) return true; } catch {}
    }
    return false;
  }
  // Settings › About › Repair install, and the Finish updating button: drop the stored app files and the service worker,
  // restart this computer's TribeCode server, reload. Sign-in, settings, drafts and unsent messages stay (localStorage).
  async function repair(opts) {
    log(`repair install${opts && opts.why ? ' (' + opts.why + ')' : ''}`);
    try { const v = document.body && document.body.dataset.view; if (v) sessionStorage.setItem('tribecode.view', v); } catch {}
    await dropCaches();
    ['tribecode.autoReloaded', 'tribecode.staleRecheck', 'tribecode.uiReloaded', HEAL, BUILDHEAL].forEach(ss.del);
    const inv = window.__TAURI__ && window.__TAURI__.core;
    if (inv) {   // the desktop app restarts itself with its web cache emptied; its server stops with it and starts fresh
      try { await inv.invoke('host_stop'); } catch {}
      try { await inv.invoke('clear_web_cache_and_restart'); return 'restart'; } catch {}
    }
    if (servedHere() && localHost(location.href)) await restartServer();
    const u = new URL(location.href); u.searchParams.set('fresh', Date.now().toString(36)); location.replace(u.href);
    return 'reload';
  }
  // What Settings › About shows: app, server, builds, and whether they match.
  async function about() {
    let app = ''; try { if (window.__TAURI__ && window.__TAURI__.app) app = await window.__TAURI__.app.getVersion(); } catch {}
    const me = server(); let h = {};
    if (me.base || servedHere()) try { h = await (await fetch((me.base || '') + '/api/health', { cache: 'no-store' })).json(); } catch {}
    const page = pageBuild(), mine = servedHere() || (settings().hosting && localHost(me.base));
    const match = !h.build || !page ? null : (mine ? h.build === page && (!h.uiBuild || h.uiBuild === h.build) : true);
    return { app, server: h.version || '', build: h.build || '', uiBuild: page, diskBuild: h.uiBuild || '', page: pageVersion(), mine: !!mine, match };
  }
  (function hookBuild(n = 0) {
    if (window.TribeClient && window.TribeClient.on) window.TribeClient.on('hello', m => { if (m && m.build) buildCheck(m.build, { from: 'hello', version: m.version }); });
    else if (n < 50) setTimeout(() => hookBuild(n + 1), 200);
  })();
  if (pageBuild() && servedHere()) setTimeout(() => {   // a page with no tribe yet still checks once, on start
    if ((window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo())) return;
    fetch('/api/health', { cache: 'no-store' }).then(r => r.json()).then(hh => buildCheck(hh.build, { from: 'health', version: hh.version })).catch(() => {});
  }, 300);

  window.TribeSelfHeal = { clearCache: repair, repair, about, buildCheck, restartServer, check, refresh, shouldFile, report, reportsOn, versionCheck, healthy, logs: () => logs.slice(), state: () => ({ settled, bootErrors: bootErrors.slice(), healed: ss.get(HEAL), page: pageVersion() }) };
})();
