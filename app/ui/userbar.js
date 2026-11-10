// Desktop: your avatar, Friends and the inbox bell live in a small bar at the bottom left of the sidebar (like a
// chat app's user panel), instead of the top right. Phones keep them where they are. The buttons are moved, not
// copied, so their own scripts (profilemenu.js, friends.js, notify.js) keep working unchanged.
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
    bar.querySelector('#ub-gear').onclick = () => window.TribeSettings && window.TribeSettings.open();
    return bar;
  }
  function label() {
    if (!bar) return;
    const st = (C && C.state()) || {}, m = st.me, on = C && C.connected();
    let name = m && m.name; if (!name) { try { name = JSON.parse(localStorage.getItem('tribecode.settings.v1') || '{}').name; } catch {} }
    $('#ub-name').textContent = name || 'You';
    $('#ub-st').textContent = on ? (m && m.role === 'host' ? 'Hosting' : 'Online') : (C && C.hasToken && C.hasToken() ? 'Reconnecting…' : 'Just you for now');
  }
  function place() {
    const pf = $('#pf-btn'), fr = $('#fr-btn'), bell = $('#nf-bell'), tb = $('.titlebar .tb-right'), nest = $('#tour-side');
    if (!pf || !tb || !nest) return;
    if (!phone.matches) {
      const b = build(); if (!b.isConnected) document.body.appendChild(b);   // wedged into the bottom-left corner, across the rail and the sidebar
      $('#ub-face').appendChild(pf);
      const acts = $('#ub-acts'); if (bell) acts.appendChild(bell); if (fr) acts.appendChild(fr);   // Friends sits right of the bell
      document.body.classList.add('has-userbar'); label(); size();
    } else {
      // phones: you (and Settings) sit at the bottom of the side panel the fire logo opens; the rack keeps the tabs + Friends
      const b = build(); if (b.parentNode !== nest) nest.appendChild(b);
      $('#ub-face').appendChild(pf);
      const anchor = $('#sync-status');
      if (bell && bell.parentNode !== tb) tb.insertBefore(bell, anchor && anchor.parentNode === tb ? anchor : null);
      if (fr) $('#ub-acts').appendChild(fr);   // Friends rides in your bar on phones
      document.body.classList.remove('has-userbar'); b.style.width = ''; label();
    }
  }
  // as wide as the rail + sidebar, whatever their width
  function size() { if (!bar || phone.matches) return; const side = $('#tour-side'); const r = side && side.getBoundingClientRect(); if (r && r.right) bar.style.width = `${Math.round(r.right)}px`; }
  addEventListener('resize', size);
  // the bell and Friends buttons are added by their scripts on load; place once everything is there
  const ready = () => { place(); if (C && C.on) { C.on('status', label); C.on('presence', label); } };
  addEventListener('tribe-local-profile', label);   // Make it yours before any tribe (personalize.js)
  if (document.readyState === 'complete') setTimeout(ready, 0); else addEventListener('load', ready);
  phone.addEventListener('change', place);
  window.TribeUserbar = { place };
})();
