// Desktop: your avatar, Friends and the inbox bell live in a small bar at the bottom left of the sidebar (like a
// chat app's user panel), instead of the top right. Phones keep them where they are. The buttons are moved, not
// copied, so their own scripts (profilemenu.js, notify.js) keep working unchanged.
(() => {
  const $ = s => document.querySelector(s);
  const phone = matchMedia('(max-width: 820px)');
  const C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let bar = null;
  function build() {
    if (bar) return bar;
    bar = document.createElement('div'); bar.className = 'userbar'; bar.id = 'userbar';
    bar.innerHTML = '<div class="ub-me" id="ub-me"><span class="ub-slot" id="ub-face"></span><span class="ub-t"><b id="ub-name"></b><small id="ub-st"></small></span></div><div class="ub-acts" id="ub-acts"></div>'
      + '<button class="nf-bell ub-gear" id="ub-gear" title="Settings" aria-label="Settings"><svg class="i"><use href="#i-gear"/></svg></button>';
    const where = e => { if (!e.target.closest('.ub-where')) return; if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); e.stopPropagation(); if (window.TribeLocalSetup) window.TribeLocalSetup.where(); };
    bar.addEventListener('click', where, true); bar.addEventListener('keydown', where, true);
    bar.querySelector('#ub-gear').onclick = () => window.TribeSettings && window.TribeSettings.open();
    return bar;
  }
  function label() {
    if (!bar) return;
    const st = (C && C.state()) || {}, m = st.me, on = C && C.connected();
    let name = m && m.name; if (!name) { try { name = JSON.parse(localStorage.getItem('tribecode.settings.v1') || '{}').name; } catch {} }
    $('#ub-name').textContent = name || 'You';
    // polish: a project kept only on this device (offline.js solo mode) answers as its "host"; say where it lives instead,
    // with a tap to "Where should it live?", and say Hosting only when this device really hosts a tribe
    const O = window.TribeOffline, local = on && O && O.solo && O.solo();
    const st_ = $('#ub-st');
    if (local) {
      const db = O.state && O.state(), pid = db && (db.current || ((db.projects || [])[0] || {}).id), h = ((O.homes && O.homes()) || {})[pid] || {};
      st_.textContent = h.github ? 'Live on GitHub' : 'On this device';
      st_.classList.add('ub-where'); st_.setAttribute('role', 'button'); st_.tabIndex = 0; st_.title = 'Where should it live?';
    } else {
      st_.textContent = on ? (m && m.role === 'host' ? 'Hosting' : 'Online') : (C && C.hasToken && C.hasToken() && !(O && O.asleep && O.asleep()) ? 'Reconnecting…' : 'Just you for now');
      st_.classList.remove('ub-where'); st_.removeAttribute('role'); st_.removeAttribute('tabindex'); st_.title = '';
    }
    const ac = !on && window.TribeAccounts && window.TribeAccounts.status(true);   // signed out, a guest or a TEST account (accounts.js)
    if (ac) { $('#ub-st').textContent = ac; if (window.TribeAccounts.mode() === 'signedout') $('#ub-name').textContent = 'Signed out'; }
    const as = window.TribeAccounts && window.TribeAccounts.signedAs && window.TribeAccounts.signedAs();   // feat/signup: who this is
    if (as) { st_.textContent = local ? `${as} · ${st_.textContent}` : `Signed in as ${as}`; st_.title = `Signed in as ${as}` + (local ? ' · Where should it live?' : ''); }
  }
  function place() {
    const pf = $('#pf-btn'), bell = $('#nf-bell'), tb = $('.titlebar .tb-right'), nest = $('#tour-side');
    if (!pf || !tb || !nest) return;
    if (!phone.matches) {
      const b = build(); if (!b.isConnected) document.body.appendChild(b);   // wedged into the bottom-left corner, across the rail and the sidebar
      $('#ub-face').appendChild(pf);
      const acts = $('#ub-acts'); if (bell) acts.appendChild(bell);
      document.body.classList.add('has-userbar'); label(); size();
    } else {
      // phones: you (and Settings) sit at the bottom of the side panel the fire logo opens; the rack keeps the tabs (People is in the top bar)
      const b = build(); if (b.parentNode !== nest) nest.appendChild(b);
      $('#ub-face').appendChild(pf);
      const anchor = $('#sync-status');
      if (bell && bell.parentNode !== tb) tb.insertBefore(bell, anchor && anchor.parentNode === tb ? anchor : null);
      document.body.classList.remove('has-userbar'); b.style.width = ''; label();
    }
  }
  // as wide as the rail + sidebar, whatever their width
  function size() { if (!bar || phone.matches) return; const side = $('#tour-side'); const r = side && side.getBoundingClientRect(); if (r && r.right) bar.style.width = `${Math.round(r.right)}px`; }
  addEventListener('resize', size);
  // the bell and Friends buttons are added by their scripts on load; place once everything is there
  const ready = () => { place(); if (C && C.on) { C.on('status', label); C.on('presence', label); } };
  addEventListener('tribe-local-profile', label);
  addEventListener('tribe-local-home', label);   // a home was chosen for the project on this device (offline.js setHome)   // Make it yours before any tribe (personalize.js)
  if (document.readyState === 'complete') setTimeout(ready, 0); else addEventListener('load', ready);
  phone.addEventListener('change', place);
  window.TribeUserbar = { place, label };
})();
