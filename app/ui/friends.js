// Friends: the people button to the right of the bell. A panel with your friends (online first), everyone else in
// the tribe with "Add friend", and two ways to bring someone new: an invite link, or a one-time guest pass (one use,
// the guest's account stops working after a day). Server: GET/PUT /api/friends, POST /api/invites { guest: true }.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const ICON = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 21c.5-4.4 3.3-7 7-7s6.5 2.6 7 7"/><path d="M16 3.3a4 4 0 0 1 0 7.4M18 14.4c2.2.8 3.6 3 4 6.6"/></svg>';
  let friends = new Set(), open = false;

  const btn = document.createElement('button');
  btn.id = 'fr-btn'; btn.className = 'nf-bell fr-btn'; btn.title = 'Friends'; btn.setAttribute('aria-label', 'Friends');
  btn.innerHTML = `${ICON}<span class="nf-count fr-count hidden" id="fr-count">0</span>`;
  const bell = $('#nf-bell'), anchor = $('#sync-status');
  if (bell) bell.after(btn); else if (anchor) anchor.parentNode.insertBefore(btn, anchor); else ($('.titlebar') || document.body).appendChild(btn);

  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="nf-scrim hidden" id="fr-scrim"></div>
    <aside class="nf-panel fr-panel hidden" id="fr-panel" role="dialog" aria-label="Friends">
      <header class="fr-head"><div><span class="eyebrow">People</span><h2>Friends</h2></div><button class="btn ghost" id="fr-close" aria-label="Close">Done</button></header>
      <div class="fr-body" id="fr-body"></div>
    </aside>`;
  document.body.append(...wrap.children);

  const people = () => ((C() && C().state().members) || []).filter(m => m.role !== 'agent');
  const me = () => (C() && C().state().me) || {};
  const av = m => `<span class="fr-av" style="background:${esc(m.color || '#6C7CFF')}">${esc((m.name || '?').slice(0, 1).toUpperCase())}${m.online ? '<i></i>' : ''}</span>`;
  const sub = m => [m.online ? 'online' : 'offline', m.where && m.online ? m.where : '', m.guest ? 'guest' : ''].filter(Boolean).map(esc).join(' · ');

  function draw() {
    const body = $('#fr-body'); if (!body) return;
    if (!C() || !C().connected()) { body.innerHTML = `<section class="fr-sec"><p class="fr-empty">Friends live in a tribe. Create a project or join one, then add the people you work with.</p></section>`; return; }
    const all = people().filter(m => m.id !== me().id), mine = all.filter(m => friends.has(m.id)), rest = all.filter(m => !friends.has(m.id));
    const sort = a => a.sort((x, y) => (y.online ? 1 : 0) - (x.online ? 1 : 0) || String(x.name).localeCompare(y.name));
    const row = (m, isF) => `<div class="fr-row">${av(m)}<span class="fr-t"><b>${esc(m.name)}</b><small>${sub(m)}</small></span>
      ${isF ? `<button class="btn sm" data-dm="${esc(m.id)}">Message</button><button class="fr-x" data-unfriend="${esc(m.id)}" title="Remove friend" aria-label="Remove ${esc(m.name)} from friends">×</button>` : `<button class="btn sm" data-friend="${esc(m.id)}">Add friend</button>`}</div>`;
    const canInvite = !['spectator', 'agent'].includes(me().role) && !me().guest;
    body.innerHTML = `
      <section class="fr-sec"><div class="fr-sh"><span class="eyebrow">Your friends</span><span class="fr-n">${mine.filter(m => m.online).length} online</span></div>
        ${mine.length ? sort(mine).map(m => row(m, true)).join('') : '<p class="fr-empty">No friends yet. Add people from your tribe below, or invite someone new.</p>'}</section>
      ${rest.length ? `<section class="fr-sec"><div class="fr-sh"><span class="eyebrow">In your tribe</span></div>${sort(rest).map(m => row(m, false)).join('')}</section>` : ''}
      ${canInvite ? `<section class="fr-sec"><div class="fr-sh"><span class="eyebrow">Add someone new</span></div>
        <button class="fr-add" id="fr-invite"><span class="fr-ai k-ember">+</span><span class="fr-t"><b>Invite a friend</b><small>A link for this project. They join with a name, on a computer or a phone.</small></span></button>
        <button class="fr-add" id="fr-guest"><span class="fr-ai k-indigo">1×</span><span class="fr-t"><b>One-time guest pass</b><small>Works once. Their account stops working after a day. Good for a quick look or a playtest.</small></span></button>
        <div id="fr-link" class="fr-link hidden"></div></section>` : ''}`;
    body.querySelectorAll('[data-friend]').forEach(b => b.onclick = () => setFriend(b.dataset.friend, true));
    body.querySelectorAll('[data-unfriend]').forEach(b => b.onclick = () => setFriend(b.dataset.unfriend, false));
    body.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => { close(); if (window.TribeApp) window.TribeApp.show('chat'); setTimeout(() => window.TribeDM && window.TribeDM.open(b.dataset.dm), 150); });
    const inv = $('#fr-invite'); if (inv) inv.onclick = () => mint(false);
    const g = $('#fr-guest'); if (g) g.onclick = () => mint(true);
  }
  function badge() { const n = people().filter(m => friends.has(m.id) && m.online).length, c = $('#fr-count'); if (c) { c.textContent = n; c.classList.toggle('hidden', !n); } }

  async function load() { if (!C() || !C().connected()) { friends = new Set(); badge(); return; } try { friends = new Set((await C().api('/friends')).friends || []); } catch {} badge(); if (open) draw(); }
  async function setFriend(id, on) {
    try { friends = new Set((await C().api('/friends', { method: 'PUT', body: { id, on } })).friends || []); toast(on ? 'Added to your friends.' : 'Removed from your friends.'); } catch (e) { toast(e.message); }
    badge(); draw();
  }
  async function mint(guest) {
    const box = $('#fr-link'); if (!box) return;
    try {
      const pid = C().project && C().project();
      const r = await C().api('/invites', { method: 'POST', body: { project: pid || null, ...(guest ? { guest: true, hours: 24 } : { maxUses: 5, hours: 72 }) } });
      // localhost only works here: share the public (or network) address, and the friendly Pages link when public
      let base = C().base(), site = null;
      try { const h = await C().api('/health'); const pick = (h.lan || [])[0]; site = h.site || null; if (pick && (pick.kind === 'public' || /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(base))) base = pick.url; } catch {}
      const share = site && /^https:/.test(base) ? `${site}/app/go.html#s=${encodeURIComponent(base)}&c=${encodeURIComponent(r.invite.code)}` : `${base}/join/${r.invite.code}`;
      box.classList.remove('hidden');
      box.innerHTML = `<span class="eyebrow">${guest ? 'Guest pass · one use · 24 h' : 'Invite link · 3 days'}</span><div class="fr-lrow"><input class="input" readonly value="${esc(share)}" aria-label="Link"><button class="btn primary sm" id="fr-copy">Copy</button></div>`;
      const copy = async () => { try { await navigator.clipboard.writeText(share); toast('Link copied.'); } catch { box.querySelector('input').select(); } };
      $('#fr-copy').onclick = copy; copy();
    } catch (e) { toast(e.message); }
  }

  function show() { open = true; $('#fr-panel').classList.remove('hidden'); $('#fr-scrim').classList.remove('hidden'); draw(); load(); }
  function close() { open = false; $('#fr-panel').classList.add('hidden'); $('#fr-scrim').classList.add('hidden'); }
  btn.onclick = () => (open ? close() : show());
  $('#fr-scrim').onclick = close; $('#fr-close').onclick = close;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) close(); });
  if (C() && C().on) { C().on('status', () => load()); C().on('presence', () => { badge(); if (open) draw(); }); }
  setTimeout(load, 800);
  window.TribeFriends = { open: show, close, list: () => [...friends] };
})();
