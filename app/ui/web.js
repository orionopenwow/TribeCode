// "The website IS the app": first-visit intro, device links (/m/<key>/) that keep an iPhone Home Screen
// app signed in, the guided "Add to Home Screen" sheet, Settings → Devices & app, the "Share beyond my
// Wi-Fi" toggle in the invite modal, and friendly solo-mode empty states. Loaded before app.js.
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore, C = window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const RELEASES = 'https://github.com/orionopenwow/TribeCode/releases/latest';
  const INTRO_KEY = 'tribecode.intro.v1';
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  // ---------- platform ----------
  const ua = navigator.userAgent, plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const isIPad = /iPad/.test(ua) || (plat === 'MacIntel' && navigator.maxTouchPoints > 1);
  const OS = isIPad || /iPhone|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : /Win/.test(plat) || /Windows/.test(ua) ? 'windows'
    : /Mac/.test(plat) || /Mac OS X/.test(ua) ? 'macos' : /Linux|X11|CrOS/.test(plat + ua) ? 'linux' : 'other';
  const OS_NAME = { windows: 'Windows', macos: 'macOS', linux: 'Linux', ios: isIPad ? 'iPad' : 'iPhone', android: 'Android', other: 'your computer' }[OS];
  const mobile = OS === 'ios' || OS === 'android';
  const desktopApp = !!window.__TAURI__;
  const standalone = () => !!navigator.standalone || matchMedia('(display-mode: standalone)').matches;

  // ---------- device link: /m/<key>/ ----------
  const dl = location.pathname.match(/\/m\/([A-Za-z0-9_-]{32,64})(\/|$)/);
  const deviceKey = dl ? dl[1] : null;
  if (deviceKey) {
    // A device link is an account: phones skip desktop setup (folder, startup) and the intro.
    if (!S.get().onboarded) S.set({ onboarded: true, checklist: { setup: true } });
    lsSet(INTRO_KEY, 'seen'); lsSet('tribecode.iosHint', '1');
  }

  async function deviceBoot() {
    const st = S.get(), sv = st.server || {};
    if (sv.token && sv.url === C.base()) {
      try { await C.api('/me'); return afterDeviceSignIn(); }
      catch (e) { if (e.status !== 401) return; }   // offline: keep the token and let tribe.js retry
    }
    try {
      const r = await C.api('/device-link/redeem', { method: 'POST', body: { key: deviceKey } });
      S.set({ name: r.member.name, color: r.member.color, onboarded: true, server: { url: C.base(), token: r.token } });
      C.connect(); window.TribeApp.refresh();
      afterDeviceSignIn();
    } catch (e) {
      if (e.status === 404) { S.set({ server: { url: '', token: '' } }); C.connect(); showRevoked(); }
      else window.TribeApp.toast("Couldn't reach your tribe. It will reconnect when the host is back.");
    }
  }
  function afterDeviceSignIn() {
    if (mobile && !standalone() && !sessionStorage.getItem('tribecode.installSheet')) setTimeout(showInstallSheet, 400);
    if (standalone()) setTimeout(offerPush, 1200);
  }
  // First open of the installed Home Screen app: one tap turns on notifications (iOS only asks from a tap).
  function offerPush() {
    const N = window.TribeNotify;
    if (!N || !N.pushOk || !N.pushOk() || !('Notification' in window) || Notification.permission !== 'default' || lsGet('tribecode.pushAsked') || $('#push-offer')) return;
    const el = document.createElement('div'); el.id = 'push-offer'; el.className = 'push-offer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Turn on notifications');
    el.innerHTML = `<div><b>Get pinged when your tribe needs you</b><span>Mentions, messages and approvals. Quiet hours and everything else live in Settings.</span></div>
      <div class="push-offer-btns"><button class="btn ghost" id="po-later">Not now</button><button class="btn primary" id="po-on">Turn on</button></div>`;
    document.body.appendChild(el);
    const close = () => { lsSet('tribecode.pushAsked', '1'); el.remove(); };
    $('#po-later').onclick = close;
    $('#po-on').onclick = async () => { close(); await N.enableWebPush(); };
  }
  function showRevoked() {
    const el = document.createElement('div'); el.className = 'web-cover'; el.id = 'device-revoked';
    el.innerHTML = `<div class="web-cover-card"><img src="assets/icon-512.png" alt="" class="web-cover-icon">
      <h1>This sign-in link was turned off</h1>
      <p>Someone signed this device out of the tribe. Ask a friend for a fresh invite link and open it here.</p>
      <div class="web-join"><input class="input" id="rv-link" placeholder="Paste an invite link" autocomplete="off"><button class="btn primary" id="rv-go">Join</button></div>
      <button class="btn ghost" id="rv-solo">Use TribeCode on its own</button></div>`;
    document.body.appendChild(el);
    $('#rv-go').onclick = () => { const v = $('#rv-link').value; if (!window.TribeApp.parseInvite(v)) return window.TribeApp.toast('Paste the full invite link'); el.remove(); window.TribeApp.joinLink(v); };
    $('#rv-solo').onclick = () => { location.href = location.origin + '/?skipIntro=1'; };
  }

  // ---------- guided "Add to Home Screen" ----------
  let installEvt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = $('#ins-install'); if (b) b.classList.remove('hidden'); });
  const shareIcon = '<svg class="ins-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 10H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1"/></svg>';
  const addIcon = '<svg class="ins-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
  const dotsIcon = '<svg class="ins-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>';
  function showInstallSheet() {
    if ($('#install-sheet')) return;
    const name = (S.get().name || '').split(' ')[0];
    const where = OS === 'ios' ? (isIPad ? 'top' : 'bottom') : 'top';
    const steps = OS === 'ios'
      ? `<li><span class="ins-n">1</span><span>Tap ${shareIcon} <b>Share</b> ${isIPad ? 'at the top right' : 'at the bottom of Safari'}</span></li>
         <li><span class="ins-n">2</span><span>Choose ${addIcon} <b>Add to Home Screen</b></span></li>`
      : `<li><span class="ins-n">1</span><span>Tap ${dotsIcon} <b>menu</b> at the top right</span></li>
         <li><span class="ins-n">2</span><span>Choose <b>Install app</b> or <b>Add to Home screen</b></span></li>`;
    const el = document.createElement('div');
    el.id = 'install-sheet'; el.className = `ins ins-${where}`; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Add TribeCode to your Home Screen');
    el.innerHTML = `<div class="ins-card">
        <div class="ins-head"><img src="assets/apple-touch-icon.png" alt=""><div><b>Put TribeCode on your Home Screen</b><span>It opens full screen, already signed in${name ? ' as ' + esc(name) : ''}.</span></div></div>
        <button class="btn primary ins-install ${installEvt ? '' : 'hidden'}" id="ins-install">Install TribeCode</button>
        <ol class="ins-steps">${steps}</ol>
        <button class="btn ghost ins-later" id="ins-later">Not now</button>
      </div>
      <svg class="ins-arrow" viewBox="0 0 48 64" aria-hidden="true"><path d="M24 4v50M8 40l16 16 16-16"/></svg>`;
    document.body.appendChild(el);
    const close = () => { el.remove(); try { sessionStorage.setItem('tribecode.installSheet', '1'); } catch {} };
    $('#ins-later').onclick = close;
    el.addEventListener('click', e => { if (e.target === el) close(); });
    $('#ins-install').onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; close(); };
  }

  // ---------- intro (first visit in a browser) ----------
  const PANELS = [
    { art: 'cooperative', n: '01', eyebrow: 'Cooperative workspaces', title: 'Build in the same room.', line: 'Docs, tasks and one shared vision, edited together in real time.' },
    { art: 'campfire', n: '02', eyebrow: 'The Campfire Huddle', title: 'Gather round the fire.', line: 'One click to talk, share a screen and code side by side.' },
    { art: 'brain', n: '03', eyebrow: 'Local Brain AI', title: 'A brain that stays home.', line: 'A model on your machine writes the summaries, so Claude tokens go to real code.' },
    { art: 'chat', n: '04', eyebrow: 'Active Huddle Chat', title: 'Talk turns into tasks.', line: 'One live feed for chat and code. Type /task and it lands on the board.' },
  ];
  function shouldShowIntro() {
    if (desktopApp || deviceKey || location.protocol === 'file:') return false;
    if (params.has('reset') || params.has('skipIntro') || params.has('demo')) return false;
    if (/\/join\//.test(location.pathname) || params.has('code')) return false;
    const st = S.get();
    return !st.onboarded && !(st.server && st.server.token) && !lsGet(INTRO_KEY);
  }
  function downloadHtml() {
    if (mobile) {
      const how = OS === 'ios' ? `In Safari, tap ${shareIcon} <b>Share</b>, then ${addIcon} <b>Add to Home Screen</b>.` : `Tap ${dotsIcon} <b>menu</b>, then <b>Install app</b>.`;
      return `<div class="intro-dl intro-a2hs"><span class="intro-k">On your ${esc(OS_NAME)}</span><p>${how} TribeCode opens full screen, like an app.</p></div>`;
    }
    const label = OS === 'other' ? 'Download the desktop app' : `Download for ${OS_NAME}`;
    return `<div class="intro-dl"><a class="btn intro-dl-btn" id="intro-download" href="${RELEASES}" target="_blank" rel="noopener">${dlIcon}${esc(label)}</a>
      <span class="intro-k">Hosts your tribe, works offline. Also on ${['Windows', 'macOS', 'Linux'].filter(x => x !== OS_NAME).join(' and ')}.</span></div>`;
  }
  const dlIcon = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';

  function openIntro() {
    const el = document.createElement('div');
    el.className = 'intro'; el.id = 'intro'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Welcome to TribeCode');
    const total = PANELS.length + 1;
    el.innerHTML = `
      <header class="intro-top"><img src="assets/icon-512.png" alt="" class="intro-logo"><img class="brand-wm" src="assets/wordmark.svg" alt="TribeCode"><span class="intro-tag">The multiplayer vibecoding platform</span>
        <button class="btn ghost intro-skip" id="intro-skip">Skip intro</button></header>
      <div class="intro-stage" id="intro-stage"><div class="intro-track" id="intro-track">
        ${PANELS.map((p, i) => `<section class="intro-panel" data-i="${i}" aria-roledescription="slide" aria-label="${i + 1} of ${total}">
          <figure class="intro-art"><img src="assets/illustrations/${p.art}.svg" alt="" draggable="false"></figure>
          <div class="intro-copy"><div class="intro-eyebrow"><span>${p.n}</span>${esc(p.eyebrow)}</div><h1>${esc(p.title)}</h1><p>${esc(p.line)}</p></div>
        </section>`).join('')}
        <section class="intro-panel intro-final" data-i="${PANELS.length}" aria-roledescription="slide" aria-label="${total} of ${total}">
          <div class="intro-final-card">
            <div class="intro-eyebrow"><span>05</span>Ready when you are</div>
            <h1>The website <em>is</em> the app.</h1>
            <p>No install, no account. Your tribe's files stay on the host's computer.</p>
            <button class="btn primary intro-open" id="intro-open">Open TribeCode in your browser</button>
            <div class="intro-or"><span>or</span></div>
            <label class="intro-k" for="intro-link">Have an invite link?</label>
            <div class="web-join"><input class="input" id="intro-link" placeholder="https://…/join/k7Qx2" autocomplete="off" spellcheck="false"><button class="btn" id="intro-join">Join</button></div>
            ${downloadHtml()}
          </div>
        </section>
      </div></div>
      <footer class="intro-nav">
        <button class="btn intro-prev" id="intro-prev" aria-label="Previous"><svg class="i" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="intro-dots" id="intro-dots">${Array.from({ length: total }, (_, i) => `<button data-dot="${i}" aria-label="Go to ${i + 1}"></button>`).join('')}</div>
        <button class="btn primary intro-next" id="intro-next">Next<svg class="i" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
      </footer>`;
    document.body.appendChild(el);
    document.body.classList.add('intro-on');
    let i = 0;
    const go = n => {
      i = Math.max(0, Math.min(total - 1, n));
      $('#intro-track').style.transform = `translateX(${-i * 100}%)`;
      el.querySelectorAll('[data-dot]').forEach(d => d.classList.toggle('on', +d.dataset.dot === i));
      el.querySelectorAll('.intro-panel').forEach(p => p.setAttribute('aria-hidden', String(+p.dataset.i !== i)));
      $('#intro-prev').style.visibility = i === 0 ? 'hidden' : 'visible';
      $('#intro-next').style.visibility = i === total - 1 ? 'hidden' : 'visible';
      el.dataset.panel = i;
    };
    const done = () => { lsSet(INTRO_KEY, 'seen'); el.remove(); document.body.classList.remove('intro-on'); removeEventListener('keydown', keys, true); };
    const keys = e => {
      if (e.key === 'Enter') e.stopPropagation();   // keep first-run setup underneath from reacting
      if (e.target instanceof HTMLInputElement) { if (e.key === 'Enter' && e.target.id === 'intro-link') $('#intro-join').click(); return; }
      if (e.key === 'ArrowRight') { go(i + 1); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'ArrowLeft') { go(i - 1); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'Escape') { done(); e.stopPropagation(); }
    };
    addEventListener('keydown', keys, true);
    $('#intro-next').onclick = () => go(i + 1);
    $('#intro-prev').onclick = () => go(i - 1);
    el.querySelectorAll('[data-dot]').forEach(d => d.onclick = () => go(+d.dataset.dot));
    $('#intro-skip').onclick = () => go(total - 1);
    $('#intro-open').onclick = done;   // first-run setup is already waiting underneath
    $('#intro-join').onclick = () => {
      const v = $('#intro-link').value;
      if (!window.TribeApp.parseInvite(v)) { window.TribeApp.toast('Paste the full invite link, e.g. https://host/join/abc12'); $('#intro-link').focus(); return; }
      done(); window.TribeApp.joinLink(v);
    };
    // swipe
    const stage = $('#intro-stage'); let x0 = null, y0 = 0, dx = 0;
    stage.addEventListener('pointerdown', e => { if (e.target.closest('input,button,a')) return; x0 = e.clientX; y0 = e.clientY; dx = 0; });
    stage.addEventListener('pointermove', e => { if (x0 === null) return; dx = e.clientX - x0; if (Math.abs(dx) > Math.abs(e.clientY - y0)) $('#intro-track').style.transform = `translateX(calc(${-i * 100}% + ${dx}px))`; });
    const end = () => { if (x0 === null) return; x0 = null; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); else go(i); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end); stage.addEventListener('pointerleave', end);
    go(0);
  }

  // ---------- Settings → Devices & app ----------
  const when = s => (s ? new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');
  async function shareBase() {
    let base = C.base();
    try { const h = await C.api('/health'); const pick = (h.lan || [])[0]; if (pick && (pick.kind === 'public' || /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(base))) base = pick.url; } catch {}
    return base;
  }
  async function openDevices() {
    const body = $('#invite-body'); $('#invite-modal').classList.remove('hidden');
    const connected = C.connected();
    body.innerHTML = `<h2>Devices &amp; app</h2>
      <p class="lead">${connected ? 'Phones and tablets signed in to your account with a private link. Turn one off and it is signed out right away.' : 'Join or start a tribe to sign in on your phone.'}</p>
      ${connected ? `<div class="web-sec"><div class="web-sec-h">Signed-in devices</div><div id="dev-list" class="dev-list"><div class="faint">Loading…</div></div>
        <button class="btn" id="dev-add">${dlIcon.replace('M12 4v11M7 10l5 5 5-5M5 20h14', 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2')}Sign in on your phone</button><div id="dev-qr"></div></div>` : ''}
      ${desktopApp ? '' : `<div class="web-sec"><div class="web-sec-h">Desktop app</div><p class="faint web-sec-p">Host your tribe, get the tray icon and notifications, and keep working offline.</p>
        <a class="btn" id="get-desktop" href="${RELEASES}" target="_blank" rel="noopener">${dlIcon}${mobile ? 'See desktop downloads' : `Download for ${esc(OS_NAME)}`}</a></div>`}
      <div class="modal-foot"><button class="btn" data-close>Done</button></div>`;
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    if (!connected) return;
    const load = async () => {
      try {
        const { devices } = await C.api('/devices');
        $('#dev-list').innerHTML = devices.length ? devices.map(d => `<div class="dev" data-dev="${esc(d.id)}"><svg class="i" viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/></svg>
            <div><b>${esc(d.label)}</b>${d.current ? ' <span class="chip">this device</span>' : ''}<small>linked ${when(d.created)}${d.lastUsed ? ' · signed in ' + when(d.lastUsed) : ' · not opened yet'}</small></div>
            <button class="btn ghost dev-off" data-revoke="${esc(d.id)}" data-current="${d.current ? 1 : ''}">Sign out</button></div>`).join('')
          : '<div class="faint dev-empty">No other devices yet.</div>';
        $('#dev-list').querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
          b.disabled = true;
          try {
            await C.api('/devices/' + b.dataset.revoke, { method: 'DELETE' });
            if (b.dataset.current) { $('#invite-modal').classList.add('hidden'); S.set({ server: { url: '', token: '' } }); C.connect(); showRevoked(); return; }
            window.TribeApp.toast('Signed out. That link no longer works.'); load();
          }
          catch (e) { window.TribeApp.toast(e.message); b.disabled = false; }
        });
      } catch (e) { $('#dev-list').innerHTML = `<div class="faint">${esc(e.message)}</div>`; }
    };
    $('#dev-add').onclick = async () => {
      try {
        const r = await C.api('/device-link', { method: 'POST', body: { label: 'Phone' } });
        const link = (await shareBase()) + r.path;
        $('#dev-qr').innerHTML = `<div class="qr-wrap"><div class="qr">${window.TribeQR.svg(link)}</div><p><b>Scan with your phone's camera.</b> It opens signed in as you, then add it to your Home Screen. Keep this code private: it's a key to your account.</p></div>`;
        load();
      } catch (e) { window.TribeApp.toast(e.message); }
    };
    load();
  }

  // Settings is first-run setup reopened: add a "Devices & app" button to its header while it's open.
  function decorateSettings() {
    const ob = $('#onboard'); if (!ob) return;
    new MutationObserver(() => {
      const open = !ob.classList.contains('hidden'), btn = $('#ob-devices');
      if (open && S.get().onboarded && !btn) {
        const b = document.createElement('button'); b.className = 'btn ghost ob-devices'; b.id = 'ob-devices';
        b.textContent = desktopApp ? 'Signed-in devices' : 'Devices & desktop app'; b.onclick = openDevices;
        ob.querySelector('.ob-top').appendChild(b);
      } else if (!open && btn) btn.remove();
    }).observe(ob, { attributes: true, attributeFilter: ['class'] });
  }

  // ---------- invite modal: "Share beyond my Wi-Fi" (host only) ----------
  function decorateInvite() {
    const body = $('#invite-body');
    new MutationObserver(() => {
      if (!$('#inv-link') || $('#share-pub')) return;
      const me = C.state().me;
      if (!me || me.role !== 'host') return;
      const foot = body.querySelector('.modal-foot'); if (!foot) return;
      const box = document.createElement('div'); box.id = 'share-pub'; box.className = 'share-pub';
      box.innerHTML = `<button class="toggle" role="switch" aria-checked="false" id="share-pub-t"><span><span class="share-pub-l">Share beyond my Wi-Fi</span><small>Gives your tribe a public https address, so friends anywhere can join and voice works on phones. Your files stay on this computer.</small></span><span class="switch"></span></button><div class="share-msg" id="share-pub-msg"></div>`;
      foot.before(box);
      const t = $('#share-pub-t'), msg = $('#share-pub-msg');
      const show = st => {
        t.setAttribute('aria-checked', String(st.status === 'on'));
        t.disabled = st.status === 'starting';
        msg.className = 'share-msg ' + (st.status === 'on' ? 'ok' : st.status === 'error' || st.status === 'unavailable' ? 'warn' : '');
        msg.innerHTML = st.status === 'on' ? `<code>${esc(st.url)}</code> ${esc(st.message || '')}`
          : st.status === 'starting' ? 'Getting a public address… (the first time this can take a minute)'
          : st.status === 'unavailable' || st.status === 'error'
            ? (st.approveUrl ? `<a class="btn" href="${esc(st.approveUrl)}" target="_blank" rel="noopener">Allow Tailscale Funnel (one time)</a> then switch this on again for an address that never changes.<br>` : '') +
              `${esc(st.message)}${st.install && !st.approveUrl ? `<ul><li>${esc(st.install.tailscale)}</li><li>${esc(st.install.cloudflared)}</li></ul>` : ''}` : '';
      };
      // Invites should work from anywhere, so the public address turns on by itself unless the host switched it off.
      const OFF_KEY = 'tribecode.sharePublicOff';
      C.api('/share/public').then(st => {
        if (st.status === 'on') return show(st);
        if (!lsGet(OFF_KEY)) t.onclick(null, true);
      }).catch(() => {});
      t.onclick = async (_e, auto = false) => {
        const on = t.getAttribute('aria-checked') === 'true';
        if (on) lsSet(OFF_KEY, '1'); else try { localStorage.removeItem(OFF_KEY); } catch {}
        show({ status: 'starting' });
        try {
          const st = await C.api('/share/public', { method: on ? 'DELETE' : 'POST', body: on ? undefined : { auto } });
          show(st);
          const h = $('#inv-hours'); if (h && (st.status === 'on' || on)) h.dispatchEvent(new Event('change'));   // re-make the link with the new address
        } catch (e) { show({ status: 'error', message: e.message }); }
      };
    }).observe(body, { childList: true });
  }

  // ---------- solo mode (no tribe): friendly empty states instead of errors ----------
  function soloChat() {
    {
      const list = $('#chat-list');
      if (list && (!list.children.length || list.querySelector('.empty-room'))) {
        list.innerHTML = `<div class="solo-empty"><svg class="i" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/></svg>
          <b>Chat lives in a tribe</b><span>Start one on your computer or join a friend's with their link. Tasks and Docs work right here in the meantime.</span>
          <button class="btn" data-solo-tribe>Start or join a tribe</button></div>`;
        list.querySelector('[data-solo-tribe]').onclick = () => window.TribeApp.openInvite();
      }
    }
  }

  // ---------- palette commands ----------
  (window.TribePaletteActions = window.TribePaletteActions || []).push(() => [
    ...(desktopApp ? [] : [{ kind: 'Action', label: 'Get the desktop app', keys: 'download install windows mac linux', run: () => window.open(RELEASES, '_blank', 'noopener') }]),
    { kind: 'Action', label: 'Signed-in devices', keys: 'phone iphone sign out revoke devices settings', run: openDevices },
    { kind: 'Action', label: 'Share beyond my Wi-Fi', keys: 'public https tunnel tailscale cloudflare host', run: () => window.TribeApp.openInvite() },
  ]);

  // ---------- boot (after app.js has run) ----------
  const introNow = shouldShowIntro();
  C.on('status', s => { if (s.status === 'offline' && !C.hasToken()) soloChat(); });
  setTimeout(() => {
    decorateSettings(); decorateInvite();
    if (C.state().status === 'offline' && !C.hasToken()) soloChat();
    if (deviceKey) deviceBoot();
    if (introNow) openIntro();
  }, 0);

  window.TribeWeb = { os: OS, mobile, openIntro, openDevices, showInstallSheet, deviceKey, RELEASES };
})();
