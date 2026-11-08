// Hosting status, top left of the title bar (replaces the old "Hi, you're hosting" banner). While this computer hosts
// the tribe: a green dot + "Hosting". Off or not the host: nothing. Click it for a small popout: the Host switch
// (desktop app), who can reach you (Wi-Fi / Tailscale / public), Invite a friend, Share beyond my Wi-Fi, Copy the
// address and Host settings.   window.TribeHostPill = { refresh(), open(), close() }
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const C = () => window.TribeClient, S = () => window.TribeStore, A = () => window.TribeApp;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = id => `<svg class="i"><use href="#${id}"/></svg>`;
  const desktop = () => !!(window.TribeHost && window.TribeHost.isDesktop);
  const isLocal = () => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(C().base()).hostname) || /(^|\.)tauri\.localhost$/i.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname); } catch { return false; } };
  const hosting = () => { const c = C(); if (!c || !c.connected()) return false; const me = c.state().me || {}; return me.role === 'host' && isLocal() && !(S() && S().get().hostOff); };

  const pill = document.createElement('button');
  pill.id = 'host-pill'; pill.className = 'host-pill hidden'; pill.setAttribute('aria-haspopup', 'dialog'); pill.title = 'Hosting: this computer runs the tribe';
  pill.innerHTML = '<span class="hp-dot" aria-hidden="true"></span><span>Hosting</span>';
  const crumbs = $('#crumbs');
  if (crumbs) crumbs.parentNode.insertBefore(pill, crumbs); else ($('.titlebar') || document.body).appendChild(pill);

  let pop = null, health = null;
  function refresh() { const on = hosting(); pill.classList.toggle('hidden', !on); if (!on) close(); }
  function close() { if (pop) { pop.remove(); pop = null; pill.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); } }
  const outside = e => { if (pop && !pop.contains(e.target) && !pill.contains(e.target)) close(); };
  const reach = () => { const l = (health && health.lan) || [], k = (l[0] || {}).kind; return k === 'public' ? ['Anyone with a link', 'public https address'] : k === 'tailscale' ? ['Your Tailscale network', 'tailnet address'] : l.length ? ['People on your Wi-Fi', 'same network'] : ['Only this computer', 'local']; };
  async function open() {
    if (pop) return close();
    try { health = await C().api('/health'); } catch {}
    const tribe = (C().state().tribe || {}).name || 'your tribe', [who, kind] = reach(), addr = ((health && health.lan) || [])[0];
    const n = (C().state().members || []).filter(m => m.online && m.role !== 'agent').length;
    pop = document.createElement('div'); pop.className = 'host-pop'; pop.id = 'host-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Hosting');
    pop.innerHTML = `<header><span class="hp-dot" aria-hidden="true"></span><div><span class="eyebrow">Hosting</span><b>${esc(tribe)} runs on this computer</b></div></header>
      <div class="hpo-rows">
        <div class="hpo-row"><span>Who can reach you</span><b>${esc(who)}</b></div>
        <div class="hpo-row"><span>Online now</span><b>${n} ${n === 1 ? 'person' : 'people'}</b></div>
        ${addr ? `<div class="hpo-row"><span>Address</span><code title="${esc(addr.url)}">${esc(addr.url.replace(/^https?:\/\//, ''))}</code><button class="hpo-copy" id="hpo-copy" aria-label="Copy address">${ico('i-link')}</button></div>` : ''}
        ${desktop() ? `<div class="hpo-row hpo-switch"><span>Host this tribe</span><button class="hpo-sw" id="hpo-sw" role="switch" aria-checked="true" aria-label="Host this tribe"><i></i></button></div>` : ''}
      </div>
      <div class="hpo-acts">
        <button id="hpo-invite">${ico('i-users')}<span>Invite a friend</span></button>
        ${kind !== 'public https address' ? `<button id="hpo-share">${ico('i-net')}<span>Share beyond my Wi-Fi</span></button>` : ''}
        <button id="hpo-settings">${ico('i-gear')}<span>Host settings</span></button>
      </div>`;
    document.body.appendChild(pop);
    const r = pill.getBoundingClientRect(); pop.style.top = (r.bottom + 8) + 'px'; pop.style.left = Math.max(8, r.left) + 'px';
    pill.setAttribute('aria-expanded', 'true');
    const on = (id, f) => { const b = pop.querySelector(id); if (b) b.onclick = f; };
    on('#hpo-copy', async () => { try { await navigator.clipboard.writeText(addr.url); A().toast('Address copied.'); } catch {} });
    on('#hpo-invite', () => { close(); window.TribeFlow && window.TribeFlow.instant ? window.TribeFlow.instant() : A().openInvite(); });
    on('#hpo-share', () => { close(); A().openInvite(); });
    on('#hpo-settings', () => { close(); window.TribeSettings && window.TribeSettings.open(); setTimeout(() => { const h = document.querySelector('#settings-body [data-sec="hosting"], #settings-body .set-host'); h && h.scrollIntoView({ block: 'start' }); }, 120); });
    on('#hpo-sw', async () => { close(); await A().setHosting(false); refresh(); });
    setTimeout(() => document.addEventListener('click', outside, true), 0);
  }
  pill.onclick = e => { e.stopPropagation(); open(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop) { close(); pill.focus(); } });
  const hook = () => { const c = C(); if (!c || !c.on) return setTimeout(hook, 300); ['status', 'hello', 'presence'].forEach(ev => c.on(ev, refresh)); refresh(); };
  hook(); if (S() && S().on) S().on(refresh);
  window.TribeHostPill = { refresh, open, close };
})();
// The pixel wordmark at the start of the top bar goes Home, like the rail logo (no inline handler: the desktop CSP forbids them)
(function () { const b = document.getElementById('tb-brand'); if (b) b.addEventListener('click', () => { const r = document.getElementById('rail-logo'); if (r) r.click(); }); })();
