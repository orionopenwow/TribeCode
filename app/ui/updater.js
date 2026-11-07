// Auto-update (docs/UPDATES.md): check GitHub Releases, download in the background, then one click restarts
// straight into the new version.
//
//  * "Download updates in the background" (Settings, store: startup.autoUpdate, default on): the app checks,
//    downloads silently (no progress in the header) and shows a small "Restart to update" pill only once the
//    update is fully downloaded and its signature verified. With it off you see "Update available" and the
//    download starts when you click it.
//  * Restart to update: saves your work, remembers the view you were on, stops the tribe server and installs
//    (Windows: the NSIS installer runs quietly, no window, and reopens the app; macOS/Linux: swap + relaunch).
//    The bytes already downloaded are installed: nothing downloads twice.
//  * Closing the window with an update ready installs it on the way out (beforeClose, called by app.js).
//  * Right-click the pill (or the profile menu's "What's new") for the details: notes, hand-off, Later.
//
// Desktop: tauri-plugin-updater (endpoint = latest.json on the GitHub release, made by .github/workflows/release.yml)
// and tauri-plugin-process to relaunch. Browser/dev: ?simulateUpdate=0.2.0 fakes one so the flow can be tested.
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore;
  const CHECK_EVERY_MS = 30 * 60 * 1000;
  const params = new URLSearchParams(location.search);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const capped = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), wait(ms)]);   // never let a slow step block the restart

  let current = '0.1.0';
  // { version, notes, date, download(onProgress), installAndRelaunch(), installOnClose?(),
  //   ready, progress 0..1, downloading, loud (the user asked for this download, so show its progress) }
  let pending = null;
  let checking = false, restarting = false;

  const newer = (a, b) => {   // is a > b (semver-ish, ignores pre-release tags)
    const pa = a.replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
    const pb = b.replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
    for (let k = 0; k < 3; k++) { if ((pa[k] || 0) !== (pb[k] || 0)) return (pa[k] || 0) > (pb[k] || 0); }
    return false;
  };
  const background = () => S.get().startup.autoUpdate !== false;
  const desktopUpdater = () => window.__TAURI__ && window.__TAURI__.updater;

  async function appVersion() {
    try { if (window.__TAURI__ && window.__TAURI__.app) return await window.__TAURI__.app.getVersion(); } catch {}
    return current;
  }

  // Stop this computer's tribe server: on Windows a running tribecode-server.exe is locked and the installer
  // can't replace it.
  async function stopServer() {
    const inv = window.__TAURI__ && window.__TAURI__.core; if (!inv) return;
    try { await inv.invoke('host_stop'); } catch {}
    try { await inv.invoke('host_kill_stale'); } catch {}
  }

  // ---- update sources ----
  async function checkDesktop() {
    const up = desktopUpdater();
    if (!up) return null;
    const u = await up.check();
    if (!u) return null;
    return {
      version: u.version, notes: u.body || '', date: u.date,
      // Downloads into the plugin (kept in memory on the Rust side) and verifies the signature; install() then
      // uses those bytes, so the update is never fetched twice.
      async download(onProgress) {
        let total = 0, got = 0;
        await u.download(ev => {
          if (ev.event === 'Started') total = ev.data.contentLength || 0;
          if (ev.event === 'Progress') { got += ev.data.chunkLength; if (total) onProgress(Math.min(0.99, got / total)); }
          if (ev.event === 'Finished') onProgress(1);
        });
      },
      // Windows: install() starts the installer quietly (installMode "quiet" in tauri.conf.json) and exits; the
      // installer reopens TribeCode when it's done. macOS/Linux: install() swaps the app, relaunch() opens it.
      async installAndRelaunch() {
        await stopServer();
        await wait(250);
        await u.install();
        await window.__TAURI__.process.relaunch();
      },
      async installOnClose() {
        await stopServer();
        await wait(250);
        await u.install();
      },
    };
  }

  function checkWeb() {
    const sim = params.get('simulateUpdate');
    if (sim) return fakeRelease(sim);
    return null;   // a browser page already runs the server's current code; only the desktop app installs updates
  }

  function fakeRelease(v) {
    return {
      version: v.replace(/^v/, ''), date: new Date().toISOString(),
      notes: '- Restart to update opens the new version in seconds\n- Editor themes in Settings\n- A calmer installer',
      async download(p) { for (let k = 1; k <= 10; k++) { await wait(120); p(k / 10); } },
      async installAndRelaunch() { sessionStorage.setItem('tribecode.justUpdated', v); location.search = ''; },
    };
  }

  async function check({ manual = false } = {}) {
    if (checking || restarting) return;
    if (pending && (pending.ready || pending.downloading)) { if (manual) openOrToast(); return; }
    checking = true;
    try {
      current = await appVersion();
      const found = (await checkDesktop()) || checkWeb();
      if (!found || !newer(found.version, current)) { if (manual) window.TribeApp.toast(`You're on the latest version (v${current}).`); return; }
      if (pending && pending.version === found.version) { if (manual) download({ loud: true }); return; }   // keep the one we have
      pending = { ...found, ready: false, progress: 0, downloading: false, loud: false };
      if (background()) { if (manual) window.TribeApp.toast(`Downloading v${pending.version} in the background…`); download({ loud: false }); }
      else if (manual) download({ loud: true });
      else renderPill();
    } catch (e) { console.warn('update check failed', e); if (manual) window.TribeApp.toast('Could not check for updates right now.'); }
    finally { checking = false; }
  }
  function openOrToast() {
    if (pending.ready) window.TribeApp.toast(`v${pending.version} is ready: Restart to update.`);
    else window.TribeApp.toast(`Downloading v${pending.version}… ${Math.round(pending.progress * 100)}%`);
  }

  // One download per update, however many times it's asked for.
  function download({ loud = false } = {}) {
    if (!pending) return Promise.resolve();
    if (loud) pending.loud = true;
    if (pending.dl) { renderPill(); return pending.dl; }
    const p = pending;
    p.downloading = true; renderPill();
    p.dl = (async () => {
      try {
        await p.download(x => { p.progress = x; if (p.loud) renderPill(); });
        p.ready = true; p.progress = 1;
      } catch (e) {
        console.warn('update download failed', e);
        p.dl = null;   // try again on the next check / click
        if (p.loud) window.TribeApp.toast('The update could not download. Try again in a minute.');
      } finally { p.downloading = false; }
      if (pending !== p) return;
      renderPill();
      if (p.ready && S.get().startup.notifications && !snoozed()) notify(`TribeCode v${p.version} is ready`, 'Restart to update when it suits you. It takes a few seconds and your work is saved first.');
    })();
    return p.dl;
  }

  function snoozed() {
    const u = S.get().update;
    return pending && u.snoozedVersion === pending.version && Date.now() < u.snoozeUntil;
  }

  // ---- the header pill: hidden while a background download runs, "Restart to update" once it's ready ----
  function state() {
    if (!pending) return 'none';
    if (pending.ready) return 'ready';
    if (pending.downloading) return pending.loud ? 'downloading' : 'none';   // background: stay quiet until verified
    return 'available';
  }
  function renderPill() {
    const btn = $('#update-btn'), label = $('#update-btn-label'); if (!btn) return;
    const s = restarting ? 'restarting' : state();
    btn.classList.toggle('hidden', s === 'none');
    for (const c of ['downloading', 'ready', 'available', 'restarting']) btn.classList.toggle(c, s === c);
    btn.classList.toggle('pill', s === 'ready' || s === 'available' || s === 'restarting');
    btn.classList.toggle('quiet', s === 'ready' && !!snoozed());
    btn.style.setProperty('--pf', String(pending ? Math.round(pending.progress * 100) / 100 : 0));
    const v = pending ? pending.version : '';
    const text = { ready: 'Restart to update', available: 'Update available', downloading: `Downloading v${v} · ${Math.round((pending ? pending.progress : 0) * 100)}%`, restarting: 'Restarting…' }[s] || '';
    const long = { ready: `Restart to update to v${v}. Your work is saved first.`, available: `TribeCode v${v} is available. Click to download.`, restarting: `Installing v${v}…` }[s] || text;
    label.textContent = text; btn.title = long; btn.setAttribute('aria-label', long);
    btn.removeAttribute('aria-haspopup');
    document.body.classList.toggle('update-ready', s === 'ready');
    if (window.TribeProfileMenu && window.TribeProfileMenu.paint) window.TribeProfileMenu.paint();
  }

  // ---- Restart to update: save, remember the view, stop the server, install, relaunch. No dialogs. ----
  function rememberView() {
    let view = ''; try { view = window.TribeApp.view ? window.TribeApp.view() : ''; } catch {}
    const r = { version: pending.version, at: Date.now(), view, hash: location.hash || '' };
    try { localStorage.setItem('tribecode.restoreAfterUpdate', JSON.stringify(r)); } catch {}
    try { sessionStorage.setItem('tribecode.justUpdated', pending.version); } catch {}
  }
  async function restartNow() {
    if (!pending || restarting) return;
    if (!pending.ready) { await download({ loud: true }); if (!pending.ready) return; }
    restarting = true; closePop(); renderPill();
    try {
      await capped(window.TribeApp.saveAll(), 2500);
      const peers = (window.TribeApp.session && window.TribeApp.session().peers) || [];
      if (peers.length && window.TribeClient && window.TribeClient.connected && window.TribeClient.connected()) await capped(window.TribeApp.announce(`restarting to update to v${pending.version}, back in a few seconds`), 800);
      rememberView();
      await pending.installAndRelaunch();
    } catch (e) {
      console.warn('restart to update failed', e);
      restarting = false; renderPill();
      window.TribeApp.toast('The update could not install. Close TribeCode and open it again to finish.');
    }
  }

  // ---- details popover (right-click the pill): what's new, hand-off, Later ----
  function openPop() {
    if (!pending || !pending.ready) return;
    const sess = window.TribeApp.session();
    const notes = pending.notes.split('\n').filter(l => l.trim()).slice(0, 6)
      .map(l => `<li>${esc(l.replace(/^[-*]\s*/, ''))}</li>`).join('');
    const peers = sess.peers;
    const handoffRows = [
      ...sess.agentRuns.map(a => ({ kind: 'agent', label: `Claude agent on <b>${esc(a.task)}</b>`, id: a.id })),
      ...sess.claims.map(c => ({ kind: 'claim', label: `file claim on <code>${esc(c.path)}</code>`, id: c.id })),
    ];
    const peerSelect = id => peers.length
      ? `<select class="handoff-to" data-id="${id}">${peers.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}<option value="pause">Pause until I'm back</option></select>`
      : `<select class="handoff-to" data-id="${id}"><option value="pause">Pause until I'm back</option></select>`;

    $('#update-pop').innerHTML = `
      <div class="up-head"><div class="up-badge"><svg class="i"><use href="#i-refresh"/></svg></div>
        <div><b>TribeCode v${esc(pending.version)} is ready</b><div class="faint">You're on v${esc(current)} · downloaded in the background</div></div>
        <button class="btn ghost up-x" data-u="close" aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div>
      ${notes ? `<div class="up-sec"><h6>What's new</h6><ul class="up-notes">${notes}</ul></div>` : ''}
      <div class="up-sec"><h6>Before restarting</h6>
        <div class="up-step" id="us-save"><span class="up-ic"></span><div>Save your work<small>${sess.unsaved} unsaved change${sess.unsaved === 1 ? '' : 's'} in ${sess.openDocs} open doc${sess.openDocs === 1 ? '' : 's'}</small></div></div>
        ${handoffRows.length ? handoffRows.map(r => `<div class="up-step" data-h="${r.id}"><span class="up-ic"></span><div>Hand off ${r.label}<small>to ${peerSelect(r.id)}</small></div></div>`).join('')
          : `<div class="up-step done"><span class="up-ic"></span><div>Nothing to hand off<small>No running agents or file claims</small></div></div>`}
        <label class="up-step up-tell"><input type="checkbox" id="us-tell" ${peers.length ? 'checked' : ''}><div>Tell the room "back in a minute"<small>${peers.length ? `${peers.length} friend${peers.length === 1 ? '' : 's'} online` : 'Nobody else online right now'}</small></div></label>
      </div>
      <div class="up-foot">
        <div class="up-later"><button class="btn" data-u="later-menu">Later ▾</button>
          <div class="up-menu hidden" id="up-menu">
            <button data-u="snooze" data-ms="3600000">In 1 hour</button>
            <button data-u="snooze" data-ms="tonight">Tonight at 10 pm</button>
            <button data-u="snooze" data-ms="next">Next time I open TribeCode</button>
          </div></div>
        <div class="spacer"></div>
        <button class="btn primary" data-u="go" id="up-go">${handoffRows.length ? 'Save, hand off &amp; restart' : 'Restart to update'}</button>
      </div>`;
    const pop = $('#update-pop'), btn = $('#update-btn'), anchor = btn && !btn.classList.contains('hidden') && btn.offsetParent ? btn : ($('#pf-btn') && $('#pf-btn').offsetParent ? $('#pf-btn') : btn), r = anchor.getBoundingClientRect();
    pop.classList.remove('hidden');
    pop.style.top = (r.bottom + 10) + 'px';
    pop.style.left = Math.max(12, Math.min(innerWidth - pop.offsetWidth - 12, r.right - pop.offsetWidth)) + 'px';
    pop.style.setProperty('--arrow', Math.max(16, Math.min(pop.offsetWidth - 28, r.left + r.width / 2 - parseFloat(pop.style.left) - 6)) + 'px');
    $('#update-pop').querySelectorAll('[data-u]').forEach(b => b.addEventListener('click', e => onPop(e, b)));
  }

  function closePop() { const p = $('#update-pop'); if (p) p.classList.add('hidden'); }

  async function onPop(e, b) {
    const a = b.dataset.u;
    if (a === 'close') return closePop();
    if (a === 'later-menu') return $('#up-menu').classList.toggle('hidden');
    if (a === 'snooze') {
      let until;
      if (b.dataset.ms === 'tonight') { const d = new Date(); d.setHours(22, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); until = d.getTime(); }
      else if (b.dataset.ms === 'next') until = Number.MAX_SAFE_INTEGER;
      else until = Date.now() + Number(b.dataset.ms);
      S.set({ update: { snoozedVersion: pending.version, snoozeUntil: until } });
      closePop(); renderPill();
      window.TribeApp.toast(b.dataset.ms === 'next' ? `v${pending.version} will install the next time you open TribeCode.` : `Okay, I'll remind you ${b.textContent.toLowerCase()}.`);
      return;
    }
    if (a === 'go') return restartFromPop();
  }

  // The popover's button: the same restart, after the hand-offs you chose there.
  async function restartFromPop() {
    const go = $('#up-go'); go.disabled = true; go.textContent = 'Saving…';
    $('#us-save').classList.add('busy');
    await capped(window.TribeApp.saveAll(), 2500);
    $('#us-save').classList.remove('busy'); $('#us-save').classList.add('done');
    go.textContent = 'Handing off…';
    for (const row of document.querySelectorAll('[data-h]')) {
      row.classList.add('busy');
      await capped(window.TribeApp.handOff(row.dataset.h, row.querySelector('.handoff-to').value), 3000);
      row.classList.remove('busy'); row.classList.add('done');
    }
    if ($('#us-tell') && $('#us-tell').checked) await capped(window.TribeApp.announce(`restarting to update to v${pending.version}, back in a minute`), 800);
    go.textContent = 'Restarting…';
    restarting = true; renderPill();
    rememberView();
    try { await pending.installAndRelaunch(); }
    catch (e) { console.warn('restart to update failed', e); restarting = false; renderPill(); window.TribeApp.toast('The update could not install. Close TribeCode and open it again to finish.'); }
  }

  function notify(title, body) {
    try {
      const n = window.__TAURI__ && window.__TAURI__.notification;
      if (n) return n.sendNotification({ title, body });
      if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
    } catch {}
  }

  // After the relaunch: say hello and put you back on the view you were on.
  function welcomeBack() {
    let v = sessionStorage.getItem('tribecode.justUpdated'), r = null;
    try { r = JSON.parse(localStorage.getItem('tribecode.restoreAfterUpdate') || 'null'); if (r) localStorage.removeItem('tribecode.restoreAfterUpdate'); } catch {}
    if (r && Date.now() - (r.at || 0) < 30 * 60 * 1000) {
      v = v || r.version;
      try { if (r.view) sessionStorage.setItem('tribecode.view', r.view); } catch {}
      if (r.hash && !location.hash) history.replaceState(null, '', location.pathname + location.search + r.hash);
      window.__tribeRestoredView = !!(r.view || r.hash);   // app.js: don't jump to the Home hub on this launch
    }
    if (v) { sessionStorage.removeItem('tribecode.justUpdated'); setTimeout(() => window.TribeApp.toast(`Updated to v${v}. You're right where you left off.`), 600); }
  }

  const ub = $('#update-btn');
  if (ub) {
    ub.addEventListener('click', e => {
      e.stopPropagation();
      const s = state();
      if (s === 'ready') restartNow();
      else if (s === 'available') download({ loud: true });
    });
    ub.addEventListener('contextmenu', e => { if (state() === 'ready') { e.preventDefault(); e.stopPropagation(); $('#update-pop').classList.contains('hidden') ? openPop() : closePop(); } });
  }
  document.addEventListener('click', e => { if (!e.target.closest('#update-pop') && !e.target.closest('#update-btn') && !e.target.closest('[data-act="restart"]') && !e.target.closest('[data-act="whatsnew"]')) closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  addEventListener('focus', () => check());

  window.TribeUpdater = {
    init() { welcomeBack(); check(); setInterval(check, CHECK_EVERY_MS); },
    check, openPop, restartNow, download: () => download({ loud: true }), current: () => current,
    supported: () => !!(desktopUpdater() || params.get('simulateUpdate')),
    pending: () => (pending ? { version: pending.version, ready: !!pending.ready, progress: pending.progress, downloading: !!pending.downloading, snoozed: !!snoozed() } : null),
    // app.js asks this before closing the desktop window: a downloaded update installs quietly on the way out.
    async beforeClose() {
      if (!pending || !pending.ready || !pending.installOnClose) return false;
      window.TribeApp.toast(`Installing v${pending.version} while TribeCode closes…`);
      try {
        await capped(window.TribeApp.saveAll(), 2500);
        try { localStorage.setItem('tribecode.restoreAfterUpdate', JSON.stringify({ version: pending.version, at: Date.now() })); } catch {}
        await pending.installOnClose(); return true;
      } catch (e) { console.warn('install on close failed', e); return false; }
    },
  };
})();
