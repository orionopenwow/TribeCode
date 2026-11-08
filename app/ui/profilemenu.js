// Top-right profile button: your avatar with a quiet connection dot, and a menu of the things that are
// about you: your profile, status, your Claude and agents, inviting friends, notifications, settings,
// updates. Replaces the old "connected" pill (the dot carries that now). When an update is downloaded the
// avatar gets a small Teal update mark and the menu leads with "Update ready · vX — Restart" (updater.js flow).
(() => {
  const C = window.TribeClient, $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tb = $('.titlebar .tb-right'); if (!tb || !C) return;
  const ico = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

  const btn = document.createElement('button');
  btn.id = 'pf-btn'; btn.className = 'pf-btn'; btn.title = 'You'; btn.setAttribute('aria-label', 'Your profile and settings');
  btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span class="pf-face" id="pf-face">?</span><span class="pf-dot" id="pf-dot"></span><span class="pf-up hidden" id="pf-up" aria-hidden="true"></span>';
  tb.appendChild(btn);

  const menu = document.createElement('div');
  menu.id = 'pf-menu'; menu.className = 'pf-menu hidden'; menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);

  const me = () => (C.state() || {}).me || null;
  const settingsName = () => { try { return (JSON.parse(localStorage.getItem('tribecode.settings.v1') || '{}').name) || ''; } catch { return ''; } };
  const status = () => {
    const st = C.state() || {}, on = C.connected();
    if (!on) return { on: false, text: st.server && st.server.url ? 'Reconnecting…' : 'Only on this device' };
    const role = (me() || {}).role;
    return { on: true, text: `${role === 'host' ? 'Hosting' : 'Connected to'} ${(st.tribe && st.tribe.name) || 'the tribe'}` };
  };

  function paint() {
    const m = me(), name = (m && m.name) || settingsName() || '?', s = status();
    const face = $('#pf-face');
    face.textContent = name.trim().charAt(0).toUpperCase() || '?';
    face.style.background = (m && m.color) || 'var(--surface-2, #262D38)';
    $('#pf-dot').className = 'pf-dot' + (s.on ? ' on' : '');
    const up = window.TribeUpdater && window.TribeUpdater.pending ? window.TribeUpdater.pending() : null;
    $('#pf-up').classList.toggle('hidden', !(up && up.ready));
    btn.title = `${name} · ${s.text}${up && up.ready ? ` · update v${up.version} ready` : ''}`;
  }

  const item = (act, icon, label, extra = '') => `<button role="menuitem" class="pf-item" data-act="${act}">${ico(icon)}<span>${label}</span>${extra}</button>`;
  function draw() {
    const m = me(), s = status(), name = (m && m.name) || settingsName() || 'You';
    const role = m ? (m.role === 'host' ? 'Host' : m.role === 'spectator' ? 'Spectator' : 'Builder') : 'Not in a tribe yet';
    const capOn = !!(window.TribeCapture && window.TribeCapture.on());
    const upd = window.TribeUpdater && window.TribeUpdater.pending ? window.TribeUpdater.pending() : null;
    menu.innerHTML = `
      <div class="pf-head"><span class="pf-face lg" style="background:${esc((m && m.color) || 'var(--surface-2, #262D38)')}">${esc(name.charAt(0).toUpperCase())}</span>
        <div><b>${esc(name)}</b><small>${esc(role)}</small></div></div>
      <div class="pf-status"><span class="pf-dot ${s.on ? 'on' : ''}"></span>${esc(s.text)}</div>
      ${upd && upd.ready ? `<button role="menuitem" class="pf-item pf-update" data-act="restart"><svg class="i" aria-hidden="true"><use href="#i-refresh"/></svg><span>Update ready · v${esc(upd.version)}</span><b class="pf-restart">Restart</b></button>` : ''}
      <div class="pf-sep"></div>
      ${m ? item('profile', 'i-users', 'My profile and activity') : ''}
      ${item('claude', 'i-sparkle', 'Connect your AI')}
      ${window.TribeAgentsHub ? item('agents', 'i-robot', 'Your agents') : ''}
      ${item('invite', 'i-link', 'Invite friends')}
      <div class="pf-sep"></div>
      ${window.TribeNotify ? item('notify', 'i-bell', 'Notifications') : ''}
      ${window.TribeCapture ? item('capture', 'i-mic', 'Capture to notes', `<span class="pf-sw ${capOn ? 'on' : ''}"><i></i></span>`) : ''}
      ${item('settings', 'i-gear', 'Settings')}
      ${window.TribeGuide ? item('guide', 'i-help', 'Guide') : ''}
      ${window.TribeUpdater ? item('update', 'i-refresh', 'Check for updates') : ''}
      ${window.TribeUi && window.TribeUi.desktop() ? (window.TribeUi.onWorking() ? item('installed', 'i-home', 'Back to the installed version') : item('working', 'i-zap', 'Open the Working version (newest)')) : ''}`;
  }

  const close = () => { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
  function open() {
    draw();
    const r = btn.getBoundingClientRect();
    if (r.top > innerHeight / 2) {   // in the bottom-left user bar (desktop): open upward, from the left
      menu.style.right = 'auto'; menu.style.left = `${Math.max(8, r.left)}px`; menu.style.top = 'auto'; menu.style.bottom = `${innerHeight - r.top + 8}px`;
    } else { menu.style.left = 'auto'; menu.style.bottom = 'auto'; menu.style.top = `${r.bottom + 8}px`; menu.style.right = `${Math.max(8, innerWidth - r.right)}px`; }
    menu.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true');
    const first = menu.querySelector('.pf-item'); if (first) first.focus();
  }
  btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.contains('hidden') ? open() : close(); });
  document.addEventListener('click', e => { if (!menu.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, m = me();
    if (a === 'capture') { window.TribeCapture.toggle(); draw(); return; }
    close();
    const click = sel => { const el = $(sel); if (el) el.click(); };
    if (a === 'profile' && m && window.TribePeople) window.TribePeople.open(m.id);
    else if (a === 'claude') click('#cc-connect');
    else if (a === 'agents') window.TribeAgentsHub.open();
    else if (a === 'invite') click('#tour-invite');
    else if (a === 'notify') window.TribeNotify.openSettings ? window.TribeNotify.openSettings() : window.TribeNotify.openInbox();
    else if (a === 'guide') window.TribeGuide.open();
    else if (a === 'settings') window.TribeSettings ? window.TribeSettings.open() : click('#settings-btn');
    else if (a === 'working') window.TribeUi.useUi('working');
    else if (a === 'installed') window.TribeUi.useUi('installed');
    else if (a === 'restart') window.TribeUpdater.restartNow();   // one click: save, install, reopen (updater.js)
    else if (a === 'update') { window.TribeUpdater.check(); window.TribeApp && window.TribeApp.toast('Checking for updates…'); }
  });

  C.on('hello', paint); C.on('presence', paint); C.on('ws', m => { if (m && (m.type === 'presence' || m.type === 'members')) paint(); });
  setInterval(paint, 3000); paint();
  window.TribeProfileMenu = { open, close, paint };
})();
