// Phone app mode (docs/PHONE-APP-MODE.md): build an iPhone / Android app in a project. Server side: server/phoneapp.js.
//  - Project settings: the "Phone app mode (iOS / Android)" switch (shell.js calls settingsRow).
//  - Project overview: the "Phone app" card: pick a stack, Set it up (starter + commit + Toolbox), Install dependencies
//    (host computer only, `npm install --ignore-scripts` unless "allow install scripts" is ticked), its log.
//  - Preview pane: how to open it on a device (Expo Go QR while `npx expo start` runs on the host). preview.js calls preview().
// Public: window.TribePhoneApp = { settingsRow(body, project), preview(pane, { empty }), state(), refresh() }.
(function () {
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const ico = (d, sz = 16) => `<svg class="pa-i" viewBox="0 0 24 24" style="width:${sz}px;height:${sz}px" aria-hidden="true">${d}</svg>`;
  const PHONE = '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>';
  const CHECK = '<path d="m5 12 5 5 9-10"/>';
  let st = null, stPid = null, inflight = null, again = null, chosen = null;

  async function load(force) {
    if (!C.connected()) return null;
    const pid = C.project && C.project();
    if (!force && st && stPid === pid) return st;
    if (inflight) return !force ? inflight : again || (again = inflight.then(() => { again = null; return load(true); }));   // a forced load never returns an answer started before it
    inflight = C.api('/phoneapp').then(r => { st = r; stPid = pid; return r; }).catch(() => null).finally(() => { inflight = null; });
    return inflight;
  }

  // ---------- project settings: the switch ----------
  function settingsRow(body, p) {
    const foot = body.querySelector('.modal-foot'); if (!foot || body.querySelector('#ps-phone')) return;
    foot.insertAdjacentHTML('beforebegin', `<label class="pa-switch" id="ps-phone-row" for="ps-phone">
      <span class="pa-sw-t"><b>Phone app mode (iOS / Android)</b><small>A Phone app card on the overview: pick a stack, set up a starter, install its dependencies, open it on your phone.</small></span>
      <input type="checkbox" id="ps-phone" role="switch" disabled><span class="pa-knob" aria-hidden="true"></span></label>`);
    const cb = body.querySelector('#ps-phone');
    let tries = 0;
    (function fill() { load(true).then(s => {
      if (!cb.isConnected) return;
      if (!s) { if (++tries < 4) setTimeout(fill, 1200); return; }   // a slow or failed answer used to leave the switch greyed out for good
      cb.checked = !!s.on; cb.disabled = !s.canEdit;
      cb.onchange = async () => {
        cb.disabled = true;
        try { st = await C.api('/phoneapp', { method: 'PUT', body: { on: cb.checked } }); stPid = C.project(); toast(cb.checked ? 'Phone app mode is on: see the project overview' : 'Phone app mode is off'); paintCard(); }
        catch (e) { cb.checked = !cb.checked; toast(e.message); }
        cb.disabled = false;
      };
    }); })();
    void p;
  }

  // ---------- the overview card ----------
  function slot() {
    const ov = $('#pj-overview'); if (!ov) return null;
    let el = $('#pj-phone-slot');
    if (!el) { const tools = $('#pj-tools-slot'); if (!tools) return null; el = document.createElement('div'); el.id = 'pj-phone-slot'; tools.after(el); }
    return el;
  }
  // The overview redraws often (new slot each time): paint from the cached state at once so the card doesn't blink
  // out and back (it used to vanish for a round trip on every redraw), then again only if the answer changed.
  async function paintCard() {
    const el = slot(); if (!el) return;
    const cached = st && stPid === (C.project && C.project()) ? st : null;
    if (cached) render(el, cached);
    const s = await load(); if (!el.isConnected) return;
    if (s !== cached || !el.dataset.painted) render(el, s);
  }
  function render(el, s) {
    el.dataset.painted = '1';
    if (!s || !s.on) { el.innerHTML = ''; return; }
    const stacks = s.stacks || {}, cur = chosen || s.stack || 'expo', S = stacks[s.stack] || {};
    const where = s.folder ? `${s.folder}/` : 'the top folder of the code';
    let inner;
    if (!s.hasRepo) {
      inner = `<h2>Give the project a code repository first</h2><p class="pa-lead">The phone app’s code lives in the project’s code repository, next to everything else.</p>
        <div class="hero-acts"><button class="btn" data-pa="repo">Set up the code repository</button></div>`;
    } else if (!s.setUp) {
      inner = `<h2>Pick how to build it</h2>
        <div class="pa-stacks" role="radiogroup" aria-label="Phone app stack">${Object.entries(stacks).map(([k, v]) => `<button class="pa-stack" role="radio" aria-checked="${k === cur}" data-stack="${k}" ${s.canEdit ? '' : 'disabled'}>
          <span class="pa-st-h"><b>${esc(v.title)}</b>${v.recommended ? '<span class="pa-rec">Recommended</span>' : ''}</span><small>${esc(v.why)}</small></button>`).join('')}</div>
        <div class="hero-acts">${s.canEdit ? `<button class="btn primary" data-pa="setup">Set it up</button>` : ''}<span class="pa-note">Writes a starter into ${'the code repository (a <code>mobile/</code> folder when it already has code)'} and saves it to the code repository.</span></div>`;
    } else {
      const job = s.install, lines = job && job.log && job.log.length ? job.log : null;
      inner = `<h2>${esc(S.title || s.stack)} app ${s.folder ? `in <code>${esc(where)}</code>` : 'at the top folder of the code'}</h2>
        <div class="pa-steps">
          <div class="pa-step ${s.installed ? 'done' : ''}"><span class="pa-dot">${s.installed ? ico(CHECK, 13) : '1'}</span><span class="pa-st"><b>Install dependencies</b><small>${s.installed ? 'Installed on the host computer.' : s.canInstall ? 'Downloads the packages into node_modules on this computer.' : 'Runs on the host computer: open TribeCode there.'}</small></span>
            ${s.canInstall ? `<span class="pa-act"><label class="pa-chk"><input type="checkbox" id="pa-scripts"> allow install scripts</label><button class="btn sm" data-pa="install" ${job && job.running ? 'disabled' : ''}>${job && job.running ? 'Installing…' : s.installed ? 'Install again' : 'Install dependencies'}</button></span>` : ''}</div>
          <div class="pa-step"><span class="pa-dot">2</span><span class="pa-st"><b>Open it on your phone</b><small>${s.stack === 'expo' ? `On the host, in ${esc(where)}: <code>npx expo start</code>. Then scan the QR code in Preview with Expo Go.` : 'See the README in that folder: it needs Xcode or Android Studio.'}</small></span>
            <span class="pa-act"><button class="btn sm" data-pa="preview">${s.expo && s.expo.running ? 'Show the QR code' : 'Open Preview'}</button></span></div>
        </div>
        ${lines ? `<pre class="pa-log ${job.error ? 'bad' : job.ok ? 'ok' : ''}" id="pa-log" aria-live="polite">${esc(lines.join('\n'))}</pre>` : ''}`;
    }
    el.innerHTML = `<section class="card pa-card" id="pa-card"><div class="pa-head"><span class="pa-ic">${ico(PHONE, 18)}</span><span class="eyebrow">Phone app · iOS / Android</span>${s.expo && s.expo.running ? '<span class="pa-live">Expo running</span>' : ''}</div>${inner}</section>`;
    el.querySelectorAll('[data-stack]').forEach(b => b.onclick = () => { chosen = b.dataset.stack; el.querySelectorAll('[data-stack]').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
    el.querySelectorAll('[data-pa]').forEach(b => b.onclick = () => act(b.dataset.pa, b));
  }
  async function act(k, b) {
    if (k === 'repo') return window.TribeApp && window.TribeApp.show('repo');
    if (k === 'preview') return window.TribePreview && window.TribePreview.open();
    b.disabled = true;
    try {
      if (k === 'setup') {
        b.textContent = 'Setting up…';
        const r = await C.api('/phoneapp/setup', { method: 'POST', body: { stack: chosen || (st && st.stack) || 'expo' } });
        toast(`Phone app starter in ${r.folder ? r.folder + '/' : 'the code repository'}${r.committed ? ', committed' : ''}${r.toolbox.length ? ' · added to the Toolbox' : ''}`);
        chosen = null;
        if (window.TribeProjects && window.TribeProjects.overview) window.TribeProjects.overview();
      }
      if (k === 'install') {
        const scripts = !!($('#pa-scripts') && $('#pa-scripts').checked);
        st = await C.api('/phoneapp/install', { method: 'POST', body: { scripts } }); stPid = C.project();
      }
    } catch (e) { toast(e.message); }
    await load(true); paintCard(); paintPreview();
  }

  // ---------- the Preview pane: open it on a device ----------
  let pv = null, poll = null;
  function preview(pane, { empty } = {}) { pv = pane; load().then(() => paintPreview(empty)); }
  function paintPreview(empty) {
    if (!pv || !pv.isConnected) { pv = null; clearInterval(poll); poll = null; return; }
    let box = pv.querySelector('#pa-dev');
    const s = st && stPid === (C.project && C.project()) ? st : null;
    if (!s || !s.on || !s.setUp) { if (box) box.remove(); pv.classList.remove('pa-phone'); clearInterval(poll); poll = null; return; }
    if (!box) { box = document.createElement('div'); box.id = 'pa-dev'; box.className = 'pa-dev'; const stage = pv.querySelector('#pvw-stage'); stage ? stage.before(box) : pv.appendChild(box); }
    if (empty !== undefined) pv.classList.toggle('pa-phone', !!empty);   // no web page to show: the device block is the whole pane
    const where = s.folder ? `${s.folder}/` : 'the top folder of the code', e = s.expo || {};
    if (s.stack === 'expo' && e.running) {
      const qr = window.TribeQR ? window.TribeQR.svg(e.url) : '';
      box.innerHTML = `<div class="pa-qr" aria-label="QR code for Expo Go">${qr}</div>
        <div class="pa-dev-t"><span class="eyebrow">Open on your phone</span><h3>Scan with Expo Go</h3>
          <p>iPhone: the Camera app. Android: the Expo Go app. The phone must be on the same Wi-Fi as the host computer; elsewhere, run <code>npx expo start --tunnel</code> and scan the code it prints.</p>
          <code class="pa-url" id="pa-url">${esc(e.url)}</code>${(e.links || []).length > 1 ? `<small class="pa-more">Also: ${e.links.slice(1).map(l => esc(l.url)).join(' · ')}</small>` : ''}</div>`;
    } else if (s.stack === 'expo') {
      box.innerHTML = `<div class="pa-dev-t"><span class="eyebrow">Open on your phone</span><h3>Start Expo on the host computer</h3>
          <p>In ${esc(where)}, run <code>npx expo start</code>${s.installed ? '' : ' (install the dependencies first, on the Phone app card)'}. The QR code for Expo Go shows up here by itself.</p>
          <p class="pa-small">Phones need the same Wi-Fi as the host. On cellular or another network, use <code>npx expo start --tunnel</code> and scan the code it prints.</p>
          <button class="btn sm" data-pa-check>Check again</button></div>`;
      if (!poll) poll = setInterval(() => { if (!pv || !pv.isConnected) { clearInterval(poll); poll = null; return; } load(true).then(() => paintPreview()); }, 5000);
    } else {
      box.innerHTML = `<div class="pa-dev-t"><span class="eyebrow">Open on your phone</span><h3>${s.stack === 'capacitor' ? 'Run it from Android Studio or Xcode' : 'Run it with the Tauri CLI'}</h3>
          <p>${s.stack === 'capacitor' ? `In ${esc(where)}: <code>npx cap sync</code>, then <code>npx cap open android</code> or <code>npx cap open ios</code>.` : `In ${esc(where)}: <code>npm run android</code> or <code>npm run ios</code> (after <code>npx tauri android init</code>).`} A real phone needs a USB cable or the same Wi-Fi. The README there has the details.</p></div>`;
    }
    if (e.running && poll) { clearInterval(poll); poll = null; }
    const chk = box.querySelector('[data-pa-check]'); if (chk) chk.onclick = () => load(true).then(() => paintPreview());
  }

  // ---------- wiring ----------
  setTimeout(() => {
    const ov = $('#pj-overview');
    if (ov) new MutationObserver(() => { if ($('#pj-tools-slot') && !$('#pj-phone-slot')) paintCard(); }).observe(ov, { childList: true });
  }, 0);
  C.on('project', () => { st = null; chosen = null; });
  C.on('ws', m => {
    if (!m || m.type !== 'phoneapp' || (m.project && C.project && m.project !== C.project())) return;
    load(true).then(() => { paintCard(); paintPreview(); });
  });
  window.TribePhoneApp = { settingsRow, preview, state: () => st, refresh: () => load(true).then(() => { paintCard(); paintPreview(); }) };
})();
