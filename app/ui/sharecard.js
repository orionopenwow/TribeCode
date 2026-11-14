// Sharing and backup (feat/real-tribe): one plain card on the project's dashboard says who can see the tribe and where
// it is saved, in one sentence, with at most two buttons. It stands in for the header pills ("On this device",
// "Hosting", "Folder · …"): everything they opened (folder, GitHub, backup settings, versions, who can reach this
// computer) now sits behind "More options".
//   TribeShare.card()            fills #pj-share-slot on the dashboard (projects.js leaves the slot)
//   TribeShare.status()          { where: 'browser' | 'computer' | 'tribe', line, primary, tone } for the current tribe
//   TribeShare.more(anchor)      the "More options" list, anchored to a button
//   TribeShare.online(feature)   "Put this tribe online": a tribe that lives in this browser moves to this computer in
//                                one step when TribeCode runs here; elsewhere it opens the short list of places it can
//                                go. Afterwards you land back in the view you were in.
//   TribeShare.needs(feature)    HTML for the short "this needs the tribe online" card with that one button
(function () {
  'use strict';
  const C = () => window.TribeClient, S = () => window.TribeStore, A = () => window.TribeApp, OFF = () => window.TribeOffline;
  const L = () => window.TribeLocalSetup, H = () => window.TribeHome, NX = () => window.TribeNextOpts, PH = () => window.TribePhoneHost;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, s = 17) => `<svg class="i" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const toast = m => A() && A().toast && A().toast(m);
  const phone = () => matchMedia('(max-width: 820px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent || '');
  const desktopApp = () => !!(window.TribeHost && window.TribeHost.isDesktop && window.__TAURI__);
  const staticWeb = () => /(^|\.)tribecode\.org$|\.github\.io$/.test(location.hostname) || !/^https?:$/.test(location.protocol);
  const solo = () => !!(OFF() && OFF().solo && OFF().solo());
  const demo = () => !!(OFF() && OFF().active && OFF().active()) && !solo();
  const live = () => !!(C() && C().connected && C().connected()) && !solo() && !demo();
  const me = () => ((C() && C().state && C().state()) || {}).me || {};
  const isLocal = () => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(C().base()).hostname) || /(^|\.)tauri\.localhost$/i.test(location.hostname); } catch { return false; } };
  const hostHere = () => live() && me().role === 'host' && isLocal() && !(S() && S().get().hostOff);
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

  // ---------- what the sentence says ----------
  function status() {
    if (solo()) {
      const gh = (() => { try { const db = OFF().state(), h = (OFF().homes ? OFF().homes() : {})[db.current || (db.projects[0] || {}).id] || {}; return h.github; } catch { return null; } })();
      return { where: 'browser', tone: 'none', primary: 'online',
        line: gh ? `${T(phone() ? 'Only you can see this. It’s saved on this phone, with a copy on GitHub' : 'Only you can see this. It’s saved in this browser, with a copy on GitHub')} (${gh.repo}).`
          : T(phone() ? 'Only you can see this, and it’s saved on this phone.' : 'Only you can see this, and it’s saved in this browser.') };
    }
    if (!live()) return null;
    const st = H() && H().state ? H().state() : {}, sy = (st.sync && st.sync.status) || {}, gh = !!sy.connected, folder = st.folder;
    const n = ((C().state().members || []).filter(m => m.role !== 'agent' && !m.guestExpired)).length;
    const who = n > 1 ? T('Everyone in the tribe can see this') : T('Only you can see this');
    if (sy.state === 'conflict') return { where: hostHere() ? 'computer' : 'tribe', tone: 'conflict', primary: 'fix', line: T('The copy on GitHub and the one here changed the same lines. Nothing was lost.') };
    const copy = gh ? (sy.kind === 'folder' ? T('with a copy in your shared folder') : T('with a copy on GitHub')) : '';
    if (hostHere()) return { where: 'computer', tone: gh ? sy.state || 'ok' : 'ok', primary: 'invite',
      line: `${who}, ${folder ? `${T('and it’s saved in')} ${folder.display} ${T('on this computer')}` : T('and it’s saved on this computer')}${copy ? `, ${copy}` : ''}.` };
    return { where: 'tribe', tone: 'ok', primary: (me().role === 'host' || me().role === 'lead' || me().role === 'builder') ? 'invite' : '',
      line: `${who}, ${T('and it’s saved where the tribe lives')}${copy ? `, ${copy}` : ''}.` };
  }

  // ---------- the card ----------
  function card() {
    const slot = $('#pj-share-slot'); if (!slot) return null;
    if (document.body.classList.contains('global')) { slot.innerHTML = ''; return null; }
    const s = status();
    if (!s) { slot.innerHTML = ''; return null; }
    const key = JSON.stringify(s);
    if (slot.dataset.k === key && slot.firstElementChild) return slot.firstElementChild;
    slot.dataset.k = key;
    const btn = s.primary === 'online' ? `<button type="button" class="btn primary" id="sc-online">${esc(T('Put this tribe online'))}</button>`
      : s.primary === 'invite' ? `<button type="button" class="btn" id="sc-invite">${esc(T('Invite friends'))}</button>`
      : s.primary === 'fix' ? `<button type="button" class="btn primary" id="sc-fix">${esc(T('Sort it out'))}</button>` : '';
    slot.innerHTML = `<section class="card share-card" id="share-card" data-where="${s.where}" data-tone="${esc(s.tone)}" aria-labelledby="sc-h">
      <span class="sc-ic" aria-hidden="true">${ic(s.where === 'browser' ? 'spark' : s.where === 'computer' ? 'box' : 'users', 18)}</span>
      <div class="sc-t"><h3 id="sc-h">${esc(T('Sharing and backup'))}</h3><p id="sc-line">${esc(s.line)}</p></div>
      <div class="sc-acts">${btn}<button type="button" class="btn" id="sc-more" aria-haspopup="dialog">${esc(T('More options'))}</button></div></section>`;
    const on = (id, f) => { const b = $(id, slot); if (b) b.onclick = e => { e.stopPropagation(); f(b); }; };
    on('#sc-online', () => online('friends'));
    on('#sc-invite', () => (A() && A().openInvite ? A().openInvite({ who: 'friend' }) : null));
    on('#sc-fix', () => H() && H().ship && H().ship());
    on('#sc-more', b => more(b));
    return slot.firstElementChild;
  }
  // "More options": the lists the pills used to open (livingrepo.js for a tribe that is online, offline.js for one in
  // this browser), anchored to the button.
  function more(anchor) {
    const a = anchor || $('#sc-more');
    if (solo()) return OFF().options ? OFF().options(a) : null;
    if (live() && H() && H().open) return H().open(a);
  }

  // ---------- Put this tribe online ----------
  const RET = 'tribecode.online.return';
  function remember() {
    const view = document.body.dataset.view || '';
    if (view) lsSet(RET, JSON.stringify({ view, hash: location.hash || '', at: Date.now() }));
  }
  // after the move (a reload into the tribe's new home): back to the view you were in
  function comeBack() {
    let r = null; try { r = JSON.parse(lsGet(RET) || 'null'); } catch {}
    if (!r) return;
    if (Date.now() - (r.at || 0) > 30 * 60e3) return lsSet(RET, null);
    if (!live()) return;   // still in this browser (they closed the list): keep it for when the move lands
    lsSet(RET, null);
    if (r.view && r.view !== 'home' && A() && A().show) setTimeout(() => { try { A().show(r.view); } catch {} }, 250);
  }
  let busyEl = null;
  function progress(text) {
    if (!busyEl) { busyEl = document.createElement('div'); busyEl.id = 'sc-busy'; busyEl.className = 'sc-busy'; busyEl.setAttribute('role', 'status'); busyEl.setAttribute('aria-live', 'polite'); document.body.appendChild(busyEl); }
    busyEl.innerHTML = `<span class="su-spin" aria-hidden="true"></span><span>${esc(text)}</span>`;
  }
  const progressDone = () => { if (busyEl) busyEl.remove(); busyEl = null; };
  // Can this page reach a TribeCode on this computer by itself (the desktop app, or a page its own server serves)?
  const hereCanHost = () => desktopApp() || (!staticWeb() && !phone() && /^https?:$/.test(location.protocol));
  let going = false;
  async function online(feature) {
    if (!solo()) return { ok: true, already: true };
    if (going) return { ok: false, busy: true };
    remember();
    if (hereCanHost() && L() && L().host && L().host.computer) {
      going = true; progress(T('Putting your tribe online…'));
      try {
        const r = await L().host.computer({ step: t => progress(t), noReload: true });
        if (r && r.server && r.token) {
          progress(T('Done. Opening it…'));
          if (feature === 'friends') try { sessionStorage.setItem('tribecode.invite.after', 'friend'); } catch {}
          setTimeout(() => location.reload(), 250);
          return { ok: true };
        }
      } catch (e) { toast(`${T('That didn’t work this time. Nothing was lost.')} ${String((e && e.message) || '').split('\n')[0]}`); }
      finally { going = false; progressDone(); }
    }
    // no TribeCode on this device to carry it: the short list of places it can go
    if (phone() && NX() && NX().sheet) return NX().sheet(feature || 'friends'), { ok: false, list: true };
    if (L() && L().where) return L().where(), { ok: false, list: true };
    if (PH() && PH().move) return PH().move(), { ok: false, list: true };
    return { ok: false };
  }
  // The short card for a part that needs the tribe online: why, and the one button.
  function needs(feature, whyText) {
    const w = whyText || (NX() && NX().why ? T(NX().why(feature)) : T('Other people and AI agents reach a tribe through a computer that keeps it online.'));
    return `<div class="nx-card sc-needs" data-nx-card="${esc(feature || 'generic')}"><span class="nx-ic">${window.TribeIcons ? window.TribeIcons.svg('help', 18) : ic('zap', 18)}</span><div class="nx-t"><b>${esc(T('This needs the tribe online'))}</b><small>${esc(w)}</small></div><span class="nx-acts"><button type="button" class="btn sm primary" data-sc-online="${esc(feature || 'generic')}">${esc(T('Put this tribe online'))}</button></span></div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-sc-online]'); if (!b) return;
    e.preventDefault(); const n = b.closest('#od-needs, #nx-nudge'); if (n) n.remove();
    online(b.dataset.scOnline);
  });

  // ---------- keeping the card true ----------
  let t = 0;
  const soon = () => { clearTimeout(t); t = setTimeout(async () => { if (live() && H() && H().load) await H().load().catch(() => {}); card(); }, 120); };
  const watch = () => {
    const ov = $('#pj-overview'); if (ov) new MutationObserver(soon).observe(ov, { childList: true });
    new MutationObserver(soon).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'class'] });
    const hook = () => { const c = C(); if (!c || !c.on) return setTimeout(hook, 300); ['status', 'hello', 'presence', 'members', 'sync'].forEach(ev => c.on(ev, soon)); c.on('hello', () => setTimeout(comeBack, 300)); soon(); if (c.connected && c.connected()) setTimeout(comeBack, 600); };
    hook(); if (S() && S().on) S().on(soon);
    // a dashboard that redrew without a signal still gets its card (cheap: only when the slot is empty)
    setInterval(() => { const sl = $('#pj-share-slot'); if (sl && !sl.firstElementChild && document.body.dataset.view === 'home') card(); }, 1500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  window.TribeShare = { card, status, more, online, needs, refresh: soon, hereCanHost };
})();
