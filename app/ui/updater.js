// Auto-update: check GitHub Releases, download in the background, show a
// "Restart to update" pill, and let the user save + hand off work before restarting.
//
// Desktop: uses tauri-plugin-updater (endpoint = latest.json on the GitHub release,
// produced by .github/workflows/release.yml) and tauri-plugin-process to relaunch.
// Browser/dev: checks the GitHub Releases API so the pill can be tested; ?simulateUpdate=0.2.0 forces one.
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore;
  const REPO = 'orionopenwow/TribeCode';
  const CHECK_EVERY_MS = 30 * 60 * 1000;
  const params = new URLSearchParams(location.search);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let current = '0.1.0';
  let pending = null;      // { version, notes, date, install: async (onProgress) => void, ready: bool, progress: 0..1 }
  let checking = false;

  const newer = (a, b) => {   // is a > b (semver-ish, ignores pre-release tags)
    const pa = a.replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
    const pb = b.replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
    for (let k = 0; k < 3; k++) { if ((pa[k] || 0) !== (pb[k] || 0)) return (pa[k] || 0) > (pb[k] || 0); }
    return false;
  };

  async function appVersion() {
    try { if (window.__TAURI__ && window.__TAURI__.app) return await window.__TAURI__.app.getVersion(); } catch {}
    return current;
  }

  // ---- update sources ----
  async function checkDesktop() {
    const up = window.__TAURI__ && window.__TAURI__.updater;
    if (!up) return null;
    const u = await up.check();
    if (!u) return null;
    return {
      version: u.version, notes: u.body || '', date: u.date,
      async download(onProgress) {
        let total = 0, got = 0;
        await u.download(ev => {
          if (ev.event === 'Started') total = ev.data.contentLength || 0;
          if (ev.event === 'Progress') { got += ev.data.chunkLength; if (total) onProgress(got / total); }
          if (ev.event === 'Finished') onProgress(1);
        });
      },
      async installAndRelaunch() {
        // Stop the bundled server first: on Windows a running tribecode-server.exe is locked and the installer can't replace it.
        const inv = window.__TAURI__.core;
        try { await inv.invoke('host_stop'); } catch {}
        try { await inv.invoke('host_kill_stale'); } catch {}
        await new Promise(r => setTimeout(r, 800));
        await u.install(); await window.__TAURI__.process.relaunch();
      },
    };
  }

  async function checkWeb() {
    const sim = params.get('simulateUpdate');
    if (sim) return fakeRelease(sim);
    if (location.protocol === 'file:') return null;   // opened as a local file: no origin for the API call
    if (navigator.webdriver) return null;             // automated test browsers: no network calls to GitHub
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) return null;
      const r = await res.json();
      return { version: r.tag_name.replace(/^v/, ''), notes: r.body || '', date: r.published_at,
        async download(p) { p(1); }, async installAndRelaunch() { location.reload(); } };
    } catch { return null; }
  }

  function fakeRelease(v) {
    return {
      version: v.replace(/^v/, ''), date: new Date().toISOString(),
      notes: '- Restart-to-update pill with save and hand-off\n- First-run setup and 60-second tour\n- Graphite theme with higher contrast\n- Faster local summaries',
      async download(p) { for (let k = 1; k <= 10; k++) { await new Promise(r => setTimeout(r, 120)); p(k / 10); } },
      async installAndRelaunch() { sessionStorage.setItem('tribecode.justUpdated', v); location.search = ''; },
    };
  }

  async function check({ manual = false } = {}) {
    if (checking || (pending && pending.ready)) return;
    checking = true;
    try {
      current = await appVersion();
      const found = (await checkDesktop()) || (await checkWeb());
      if (!found || !newer(found.version, current)) { if (manual) window.TribeApp.toast(`You're on the latest version (v${current}).`); return; }
      pending = { ...found, ready: false, progress: 0 };
      const st = S.get();
      if (st.startup.autoUpdate || manual) await download();
      else renderPill();
    } catch (e) { console.warn('update check failed', e); if (manual) window.TribeApp.toast('Could not check for updates right now.'); }
    finally { checking = false; }
  }

  async function download() {
    renderPill();
    await pending.download(p => { pending.progress = p; renderPill(); });
    pending.ready = true;
    renderPill();
    const st = S.get();
    if (st.startup.notifications && !snoozed()) notify(`TribeCode v${pending.version} is ready`, 'Restart when it suits you; your work is saved first.');
  }

  function snoozed() {
    const u = S.get().update;
    return pending && u.snoozedVersion === pending.version && Date.now() < u.snoozeUntil;
  }

  // ---- pill ----
  function renderPill() {
    const pill = $('#update-pill'), label = $('#update-pill-label');
    if (!pending) { pill.classList.add('hidden'); return; }
    pill.classList.remove('hidden');
    pill.classList.toggle('downloading', !pending.ready);
    pill.classList.toggle('quiet', pending.ready && snoozed());
    pill.style.setProperty('--p', Math.round(pending.progress * 100) + '%');
    label.textContent = pending.ready ? `Restart to update · v${pending.version}` : `Downloading v${pending.version} · ${Math.round(pending.progress * 100)}%`;
  }

  // ---- popover: save + hand off + restart ----
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
        <button class="btn primary" data-u="go" id="up-go">Save, hand off &amp; restart</button>
      </div>`;
    const pop = $('#update-pop'), r = $('#update-pill').getBoundingClientRect();
    pop.classList.remove('hidden');
    pop.style.top = (r.bottom + 10) + 'px';
    pop.style.left = Math.max(12, Math.min(innerWidth - pop.offsetWidth - 12, r.right - pop.offsetWidth)) + 'px';
    $('#update-pop').querySelectorAll('[data-u]').forEach(b => b.addEventListener('click', e => onPop(e, b)));
  }

  function closePop() { $('#update-pop').classList.add('hidden'); }

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
    if (a === 'go') return restart();
  }

  async function restart() {
    const go = $('#up-go'); go.disabled = true; go.textContent = 'Saving…';
    const mark = (el, state) => el && el.classList.add(state);
    // 1. save
    mark($('#us-save'), 'busy');
    await window.TribeApp.saveAll();
    $('#us-save').classList.remove('busy'); mark($('#us-save'), 'done');
    // 2. hand off
    go.textContent = 'Handing off…';
    for (const row of document.querySelectorAll('[data-h]')) {
      row.classList.add('busy');
      const to = row.querySelector('.handoff-to').value;
      await window.TribeApp.handOff(row.dataset.h, to);
      row.classList.remove('busy'); row.classList.add('done');
    }
    // 3. tell the room
    if ($('#us-tell') && $('#us-tell').checked) await window.TribeApp.announce(`restarting to update to v${pending.version}, back in a minute`);
    // 4. remember to restore after relaunch, then install
    sessionStorage.setItem('tribecode.justUpdated', pending.version);
    try { localStorage.setItem('tribecode.restoreAfterUpdate', JSON.stringify({ version: pending.version, at: Date.now() })); } catch {}
    go.textContent = 'Restarting…';
    await new Promise(r => setTimeout(r, 400));
    await pending.installAndRelaunch();
  }

  function notify(title, body) {
    try {
      const n = window.__TAURI__ && window.__TAURI__.notification;
      if (n) return n.sendNotification({ title, body });
      if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
    } catch {}
  }

  function welcomeBack() {
    let v = sessionStorage.getItem('tribecode.justUpdated');
    try { const r = JSON.parse(localStorage.getItem('tribecode.restoreAfterUpdate') || 'null'); if (r) { v = v || r.version; localStorage.removeItem('tribecode.restoreAfterUpdate'); } } catch {}
    if (v) { sessionStorage.removeItem('tribecode.justUpdated'); setTimeout(() => window.TribeApp.toast(`Updated to v${v}. Welcome back, your work was restored.`), 600); }
  }

  $('#update-pill').addEventListener('click', e => { e.stopPropagation(); $('#update-pop').classList.contains('hidden') ? openPop() : closePop(); });
  document.addEventListener('click', e => { if (!e.target.closest('#update-pop') && !e.target.closest('#update-pill')) closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  addEventListener('focus', () => check());

  window.TribeUpdater = {
    init() { welcomeBack(); check(); setInterval(check, CHECK_EVERY_MS); },
    check, openPop, current: () => current,
  };
})();
