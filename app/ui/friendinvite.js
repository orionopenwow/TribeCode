// Invite from your friends list (p13, docs/ONLINE-MODES.md). People you already know in this tribe (from your projects, or
// starred as friends) show in the invite sheet with their face and an Invite button; a friend's profile card and the
// people panel have "Invite to <project>" too. The invite lands in their Home (and their inbox) with Join / Not now.
// Nobody is added until they press Join. Server: server/network.js (/api/friend-invites).
//   window.TribeFriendInvite = { mount(el, { project }), mountHome(el), invite(id, project), target(), join(id), later(id), offer(box, id), offerRows(root) }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (s, v) => { let t = window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s; if (v) for (const k in v) t = t.split('{' + k + '}').join(v[k]); return t; };
  const toast = (m, k) => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m, k);
  const first = n => String(n || '').split(' ')[0];
  const initials = n => (String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?');
  const online = () => { const c = C(); return !!(c && c.connected && c.connected()); };
  const face = p => `<span class="fi-face" style="${p.color ? `background:${esc(p.color)}` : ''}">${p.avatar && p.avatar.kind === 'emoji' && p.avatar.emoji ? esc(p.avatar.emoji) : esc(initials(p.name))}</span>`;

  // where an invite goes: the open project, else the whole tribe
  function target() {
    const c = C(), P = window.TribeProjects;
    const pid = (P && P.current && P.current()) || (c && c.state && c.state().project) || '';
    const onHome = !!(window.TribeRouter && window.TribeRouter.where && (() => { try { const w = window.TribeRouter.where(); return w && w.place === 'global'; } catch { return false; } })());
    return pid && !onHome ? pid : 'tribe';
  }

  async function invite(id, project) {
    const c = C(); project = project || target();
    const r = await c.api('/friend-invites', { method: 'POST', body: { to: id, project } });
    toast(T('Invite sent. {name} can join from their Home.', { name: first(r.invite.toName) }), 'ok');
    return r.invite;
  }

  // ---------- the invite sheet: "People you know" ----------
  async function mount(el, o) {
    if (!el || !online()) { if (el) el.hidden = true; return; }
    const project = (o && o.project) || target();
    let d; try { d = await C().api('/friend-invites/people?project=' + encodeURIComponent(project)); } catch { el.hidden = true; return; }
    const list = d.people || [];
    if (!list.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span class="eyebrow">${esc(T('People you know'))}</span><p class="faint tl-sub">${esc(T('Invite them to {where}. They see it in their Home and choose Join or Not now.', { where: d.where }))}</p>
      <ul class="fi-list" id="fi-list">${list.slice(0, 12).map(p => `<li class="fi-row" data-fi="${esc(p.id)}">${face(p)}<span class="fi-t"><b>${esc(p.name)}</b><small>${esc(p.invited ? T('Invite sent') : p.online ? T('Online now') : T('Offline · gets it when back'))}</small></span>
        <button type="button" class="btn sm${p.invited ? '' : ' primary'}" data-fi-go="${esc(p.id)}"${p.invited ? ' disabled' : ''}>${esc(p.invited ? T('Invited') : T('Invite'))}</button></li>`).join('')}</ul>`;
    el.querySelectorAll('[data-fi-go]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await invite(b.dataset.fiGo, project); b.textContent = T('Invited'); b.classList.remove('primary'); const s = b.parentNode.querySelector('small'); if (s) s.textContent = T('Invite sent'); }
      catch (e) { b.disabled = false; toast(e.message, 'err'); }
    });
  }

  // ---------- a friend's profile card and the people panel: "Invite to <where>" for people you can invite ----------
  let cand = null;   // { at, project, ids: Set, where }
  async function candidates() {
    const project = target();
    if (cand && cand.project === project && Date.now() - cand.at < 8000) return cand;
    try { const d = await C().api('/friend-invites/people?project=' + encodeURIComponent(project)); cand = { at: Date.now(), project, where: d.where, ids: new Set((d.people || []).filter(p => !p.invited).map(p => p.id)), sent: new Set((d.people || []).filter(p => p.invited).map(p => p.id)) }; }
    catch { cand = { at: Date.now(), project, where: '', ids: new Set(), sent: new Set() }; }
    return cand;
  }
  const btnFor = (id, c, cls) => `<button type="button" class="btn sm ${cls}" data-fi-offer="${esc(id)}"${c.sent.has(id) ? ' disabled' : ''}>${esc(c.sent.has(id) ? T('Invited') : T('Invite to {where}', { where: c.where }))}</button>`;
  function wireOffer(root) {
    root.querySelectorAll('[data-fi-offer]').forEach(b => b.onclick = async e => {
      e.stopPropagation(); b.disabled = true;
      try { await invite(b.dataset.fiOffer, cand && cand.project); b.textContent = T('Invited'); if (cand) { cand.ids.delete(b.dataset.fiOffer); cand.sent.add(b.dataset.fiOffer); } }
      catch (err) { b.disabled = false; toast(err.message, 'err'); }
    });
  }
  async function offer(box, id) {
    if (!box || !id || !online()) return;
    const c = await candidates(); if (!document.contains(box) || box.querySelector('[data-fi-offer]')) return;
    if (!c.ids.has(id) && !c.sent.has(id)) return;
    box.insertAdjacentHTML('beforeend', btnFor(id, c, 'tonal pf-invite')); wireOffer(box);
  }
  async function offerRows(root) {
    if (!root || !online()) return;
    const c = await candidates();
    root.querySelectorAll('.ppl-row[data-mid]').forEach(r => {
      const id = r.dataset.mid, acts = r.querySelector('.ppl-acts');
      if (!acts || acts.querySelector('[data-fi-offer]') || (!c.ids.has(id) && !c.sent.has(id))) return;
      acts.insertAdjacentHTML('afterbegin', btnFor(id, c, 'pp-invite'));
    });
    wireOffer(root);
  }

  // ---------- Home: invites waiting for me ----------
  let homeEl = null;
  async function mountHome(el) {
    homeEl = el || homeEl; el = homeEl;
    if (!el || !document.contains(el)) return;
    if (!online()) { el.innerHTML = ''; return; }
    let d; try { d = await C().api('/friend-invites'); } catch { return; }
    const list = d.forMe || [];
    el.innerHTML = list.length ? `<section class="sec hub-sec fi-home" id="fi-home"><div class="sec-head"><div><span class="eyebrow">${esc(T('Invites'))}</span><h2>${esc(list.length === 1 ? T('Someone invited you') : T('{n} invites for you', { n: list.length }))}</h2></div></div>
      ${list.map(i => `<div class="fi-card" data-fi-inv="${esc(i.id)}"><span class="fi-t"><b>${esc(T('{name} invited you to {where}', { name: first(i.byName), where: i.where }))}</b><small>${esc(T('You join only if you press Join.'))}</small></span>
        <span class="fi-acts"><button type="button" class="btn" data-fi-later="${esc(i.id)}">${esc(T('Not now'))}</button><button type="button" class="btn primary" data-fi-join="${esc(i.id)}">${esc(T('Join'))}</button></span></div>`).join('')}</section>` : '';
    el.querySelectorAll('[data-fi-join]').forEach(b => b.onclick = () => join(b.dataset.fiJoin, b));
    el.querySelectorAll('[data-fi-later]').forEach(b => b.onclick = () => later(b.dataset.fiLater, b));
  }
  async function join(id, btn) {
    const c = C(); if (btn) btn.disabled = true;
    try {
      const r = await c.api('/friend-invites/' + encodeURIComponent(id), { method: 'POST', body: { answer: 'join' } });
      try { localStorage.setItem('tribecode.invitedBy', r.by || ''); } catch {}
      if (window.TribeProjects && window.TribeProjects.refresh) try { await window.TribeProjects.refresh(); } catch {}
      if (r.project && window.TribeProjects && window.TribeProjects.switchTo) await window.TribeProjects.switchTo(r.project, 'home');
      else if (window.TribeApp && window.TribeApp.show) window.TribeApp.show('home');
      setTimeout(() => { if (window.TribeApp && window.TribeApp.joinWelcome) window.TribeApp.joinWelcome(); }, 400);
      return r;
    } catch (e) { if (btn) btn.disabled = false; toast(e.message, 'err'); mountHome(); }
  }
  async function later(id, btn) {
    if (btn) btn.disabled = true;
    try { await C().api('/friend-invites/' + encodeURIComponent(id), { method: 'POST', body: { answer: 'later' } }); } catch (e) { toast(e.message, 'err'); }
    mountHome();
  }

  // live: an invite arrives while you're in the app
  function boot() {
    const c = C(); if (!c || !c.on) return setTimeout(boot, 300);
    c.on('ws', m => {
      if (!m) return;
      if (m.type === 'friend-invite' && m.invite) {
        mountHome();
        toast(T('{name} invited you to {where}. Join from your Home.', { name: first(m.invite.byName), where: m.invite.where }));
      }
      if (m.type === 'friend-invite-joined' && m.invite) toast(T('{name} joined {where}.', { name: first(m.invite.toName), where: m.invite.where }), 'ok');
    });
    c.on('hello', () => mountHome());
  }
  boot();
  window.TribeFriendInvite = { mount, mountHome, invite, target, join, later, offer, offerRows };
})();
