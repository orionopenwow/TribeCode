// Accounts on this device (docs/ACCOUNTS.md): Log in, Log out, Continue as guest, an account switcher and, for testing,
// mounted TEST guest accounts. Everything here is local to this device; the server side is a feature-flagged scaffold
// (server/accounts.js, TRIBE_ACCOUNTS=1) that this front end will talk to at launch.
//
// localStorage 'tribecode.accounts.v1' = { mode, current, accounts: [...], test }
//   mode: 'signedin' (a tribe key on this device) | 'signedout' | 'guest' (no sign-in, local only) | 'test' (a TEST account)
//         absent until someone logs out, picks guest or turns test accounts on, so a first open behaves exactly as before.
//         Anything but 'signedin' stops the automatic sign-ins (tribe.js ensureMember): the boot's auto-claim, the
//         sign-in cookie and the host reclaim. A person's own click (Start your first project, Log in) still signs in.
//   accounts: { id, kind: 'device' | 'test', name, color, avatar, server: { url, token }, tribes: [names], member }
//
// Log out clears this device's session: the tribe key, the sign-in cookie (DELETE /api/session), device-link and media
// keys, and the tab's place. "Also forget this device's tribes" also drops the saved server address and the per-tribe
// caches (chat copy, pins, recents, drafts, unsent outbox). The tribe folder itself is never touched.
// Test accounts: Settings › More settings › Test accounts, or open the app with ?accounts=test.
// polish: when the server has accounts on (TRIBE_ACCOUNTS=1: GET /api/accounts/me answers 401 instead of 404), Log in
// also has a username + password form (POST /api/accounts/login | signup), Log out ends that session
// (POST /api/accounts/logout), Settings › Account lists the signed-in devices (GET/DELETE /api/accounts/sessions), and
// Delete my account uses GET/DELETE /api/account (moderation.js). Such accounts are kind 'server' with an account token
// (acct, tca_…) beside the member key a login hands out. With the flag off, everything stays local as before.
// feat/signup: mode 'account' = signed in to a TribeCode account that has no tribe on this device yet (a guest who made
// one); like every mode but 'signedin' it stops the automatic sign-ins. Recent accounts on this device sign back in with
// one click (a signed-out one fills in its username), Log in has Forgot password and Create an account (signup.js), the
// user bar says "Signed in as …", and the host sees password reset requests in Settings › Account (Password resets).
// Public: window.TribeAccounts = { state(), list(), current(), mode(), login(opts), logout(opts), confirmLogout(), switchTo(id),
//   guest(), setTest(on), status(), menuHtml(), menuAct(el), settings(box), api(path, opts), adopt(account, token, memberToken),
//   signIn(username, password), signedAs(), upgradable() }.
(function () {
  'use strict';
  const C = window.TribeClient, S = window.TribeStore; if (!C || !S) return;
  const KEY = 'tribecode.accounts.v1';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, n = 16) => `<svg class="i" style="width:${n}px;height:${n}px" aria-hidden="true"><use href="#${id}"/></svg>`;
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const lsDel = k => { try { localStorage.removeItem(k); } catch {} };

  // The TEST accounts: names from the design system's story (Maya, Jay, Orion) plus a plain Guest.
  const TEST = [
    { id: 'test:orion', name: 'Orion', color: '#F26B1D', emoji: '🦊', tribes: ['Pixel Quest crew', 'Bake Sale Club'] },
    { id: 'test:maya', name: 'Maya', color: '#6C7CFF', emoji: '🌙', tribes: ['Pixel Quest crew'] },
    { id: 'test:jay', name: 'Jay', color: '#38C6B1', emoji: '🎸', tribes: ['Lantern Run'] },
    { id: 'test:guest', name: 'Guest', color: '#94A3B8', emoji: '👤', tribes: [] },
  ];

  // ---------- state ----------
  function read() {
    let d = null; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
    d = d && typeof d === 'object' ? d : {};
    if (!Array.isArray(d.accounts)) d.accounts = [];
    return d;
  }
  let st = read();
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
  const mode = () => st.mode || (C.hasToken() ? 'signedin' : '');
  const current = () => st.accounts.find(a => a.id === st.current) || null;
  const list = () => st.accounts.slice();
  const isTest = a => !!a && a.kind === 'test';

  function mountTests(on) {
    st.test = !!on;
    st.accounts = st.accounts.filter(a => a.kind !== 'test');
    if (on) st.accounts.push(...TEST.map(t => ({ id: t.id, kind: 'test', name: t.name, color: t.color, avatar: { kind: 'emoji', emoji: t.emoji }, tribes: t.tribes.slice(), server: { url: '', token: '' } })));
    write();
  }
  // ?accounts=test mounts them (and stays on until turned off in Settings)
  try { const q = new URLSearchParams(location.search); if (q.get('accounts') === 'test' && !st.test) mountTests(true); } catch {}

  // The person signed in on this device becomes a "device" account: switching away and back keeps their key.
  function syncDevice() {
    const me = (C.state() || {}).me; if (!me || me.role === 'agent' || !C.hasToken()) return;
    const s = S.get(), base = C.base(), id = `dev:${base}:${me.id}`, tribe = ((C.state() || {}).tribe || {}).name || 'My Tribe';
    const tok = (s.server && s.server.token) || '';
    let a = st.accounts.find(x => x.id === id) || st.accounts.find(x => x.kind === 'server' && tok && x.server && x.server.token === tok);   // a server account signed this member in
    if (!a) { a = { id, kind: 'device', tribes: [] }; st.accounts.unshift(a); }
    Object.assign(a, { name: me.name, color: me.color, member: me.id, server: { url: (s.server && s.server.url) || base, token: (s.server && s.server.token) || '' }, avatar: s.pendingAvatar || a.avatar || null, seen: new Date().toISOString() });
    if (!a.tribes.includes(tribe)) a.tribes = [tribe, ...a.tribes].slice(0, 6);
    st.current = a.id; st.mode = 'signedin'; write(); paint();
  }
  C.on('hello', syncDevice);

  // ---------- the server's accounts (TRIBE_ACCOUNTS=1) ----------
  let srv = { base: null, on: false };
  // the server's own address, also while a project lives only on this device (offline.js answers /api there: skip it)
  const OFF = () => window.TribeOffline;
  const net = (u, o) => (OFF() && OFF().realFetch ? OFF().realFetch(u, o) : fetch(u, o));
  const base = () => { const b = (C.base ? C.base() : '') || ''; return /\.invalid(:\d+)?$/.test(b) ? (/^https?:$/.test(location.protocol) && !/tauri\.localhost$/i.test(location.hostname) ? location.origin : 'http://localhost:4747') : b; };
  async function serverOn(force) {
    const b = base(); if (!force && srv.base === b) return srv.on;
    let on = false;
    if (OFF() && OFF().active && OFF().active() && !(OFF().solo && OFF().solo())) { srv = { base: b, on }; return on; }   // feat/demo-auto: a demo asks no server
    if (b || /^https?:$/.test(location.protocol)) try { const r = await net(b + '/api/accounts/me', { credentials: 'omit' }); on = r.status === 401 || r.ok; } catch {}
    srv = { base: b, on }; return on;
  }
  async function acctApi(path, { method = 'GET', body, token } = {}) {
    const r = await net(base() + '/api/accounts' + path, { method, credentials: 'omit', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(r.status === 429 ? 'That is a lot of tries in a row. Take a breather and try again in a minute.' : (d.error || r.statusText)), { status: r.status }); return d;
  }
  // a fresh account (sign-up, a reset) becomes this device's current one; with a member key it is signed in to the tribe too
  function adopt(account, acct, memberToken) {
    const a = keepServer(account, acct, memberToken || undefined);
    st.current = a.id; st.mode = memberToken || (mode() === 'signedin' && C.hasToken() && !(OFF() && OFF().active && OFF().active())) ? 'signedin' : 'account';
    write(); paint(); banner(); if (window.TribeUserbar) try { window.TribeUserbar.label(); } catch {} return a;
  }
  const signedAs = () => { const a = current(), m = mode(); return a && a.kind === 'server' && a.acct && (m === 'signedin' || m === 'account') ? (a.username || a.name) : ''; };
  // a guest, a TEST account, a guest pass or a project kept only on this device, with no account yet: "Save your work"
  const upgradable = () => { if (signedAs()) return false; const m = mode(), me = (C.state() || {}).me; return m === 'guest' || m === 'test' || !!(OFF() && OFF().solo && OFF().solo()) || !!(me && me.guestUntil); };
  // Log in with a username and password. A member of this tribe is signed in on this device (the page reloads: 'member');
  // otherwise the account is kept and returned.
  async function signIn(username, password) {
    const d = await acctApi('/login', { method: 'POST', body: { username, password: password || undefined } });
    const a = keepServer(d.account, d.token, d.memberToken || undefined);
    if (d.memberToken) {
      const s = S.get();
      if (s.server && s.server.token && s.server.token !== d.memberToken) { try { await C.api('/session', { method: 'DELETE' }); } catch {} }
      S.set({ name: d.account.displayName || d.account.username, onboarded: true, server: { url: base(), token: d.memberToken } });
      st.current = a.id; st.mode = 'signedin'; write(); reloadHome('switched'); return 'member';
    }
    return a;
  }
  function keepServer(account, acct, memberToken) {
    const b = base(), id = `acct:${b}:${account.id}`, tribe = ((C.state() || {}).tribe || {}).name;
    let a = st.accounts.find(x => x.id === id);
    if (!a) { a = { id, kind: 'server', tribes: [] }; st.accounts.unshift(a); }
    const s = S.get();
    Object.assign(a, { name: account.displayName || account.username, username: account.username, color: a.color || s.color || '#F26B1D', acct, server: { url: b, token: memberToken || (a.server && a.server.token) || '' }, seen: new Date().toISOString() });
    if (tribe && memberToken !== undefined && !a.tribes.includes(tribe)) a.tribes = [tribe, ...a.tribes].slice(0, 6);
    st.accounts = st.accounts.filter(x => !(x.kind === 'device' && x.server && a.server.token && x.server.token === a.server.token));   // one row per person
    write(); return a;
  }
  async function acctSubmit(form, kind) {
    const v = id => (form.querySelector(id) || {}).value || '', err = form.querySelector('#ac-err');
    const say = t => { if (err) { err.textContent = t; err.hidden = !t; } };
    const username = v('#ac-user').trim(), password = v('#ac-pass');
    if (!username) { say('Type your username.'); return; }
    if (kind === 'signup' && password.length < 8) { say('Pick a password of at least 8 characters.'); return; }
    form.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      if (kind === 'signup') {
        const s = S.get(), tok = (s.server && s.server.token) || '';
        const d = await acctApi('/signup', { method: 'POST', token: tok, body: { username, password: password || undefined, displayName: s.name || username, link: !!tok } });
        const a = keepServer(d.account, d.token, d.linked ? tok : '');
        if (d.linked) { st.current = a.id; st.mode = 'signedin'; write(); closeSheet(); paint(); toast(`Account made: log in as ${d.account.username} on any device`); }
        else { closeSheet(); toast(`Account made. Join a tribe with an invite link, then log in as ${d.account.username}.`); }
        return;
      }
      const a = await signIn(username, password);
      if (a === 'member') return;
      if (!C.hasToken() || (OFF() && OFF().active && OFF().active())) { st.current = a.id; st.mode = 'account'; write(); closeSheet(); paint(); banner(); toast(`Signed in as ${a.username}`); return; }
      say(`Logged in as ${a.username}, but that account isn't in this tribe yet (or has no password). Join with an invite link.`);
    } catch (e) { say(e.status === 401 ? 'That username and password do not match.' : e.message); }
    form.querySelectorAll('button').forEach(b => { b.disabled = false; });
  }

  // ---------- leaving this device's session ----------
  const PER_TRIBE = /^tribecode\.(project|chatcache|ovcache|cloudsave|outbox|pins|recents|drafts?|tab\.|coordTab|wsTab|helpers|notes\.|flowMin\.)/;
  async function clearSession(forget) {
    const s = S.get(), token = s.server && s.server.token;
    const ca = current(); if (ca && ca.kind === 'server' && ca.acct) { try { await acctApi('/logout', { method: 'POST', token: ca.acct }); } catch {} ca.acct = ''; }   // ends this session on the server
    if (token) { try { await C.api('/session', { method: 'DELETE' }); } catch {} }   // the HttpOnly sign-in cookie
    const cur = current();
    if (cur && cur.kind === 'device') cur.server = { url: cur.server && cur.server.url || '', token: '' };
    S.set({ server: { url: forget ? '' : ((s.server && s.server.url) || ''), token: '' } });
    ['tribecode.mediaKey', 'tribecode.afterJoin', 'tribecode.fresh'].forEach(lsDel);
    try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (/^tribecode\.device/.test(k) || (forget && PER_TRIBE.test(k))) localStorage.removeItem(k); } } catch {}
    try { sessionStorage.removeItem('tribecode.view'); } catch {}
    if (forget) st.accounts = st.accounts.filter(a => a.kind !== 'device');
  }
  function reloadHome(after) {
    try { if (after) sessionStorage.setItem('tribecode.acc.after', after); } catch {}
    const q = location.search.replace(/([?&])accounts=test(&|$)/, '$1').replace(/[?&]$/, '');
    try { history.replaceState(null, '', location.pathname + q + '#/hub'); } catch {}
    location.reload();   // a clean start: no module keeps the old identity in memory
  }
  async function logout({ forget = false } = {}) {
    await clearSession(forget);
    st.mode = 'signedout'; st.current = null; write();
    reloadHome('signedout');
  }
  function guest() {
    const s = S.get();
    st.mode = 'guest'; st.current = null; write();
    if (!s.name) S.set({ name: 'Guest' });
    closeSheet();
    if (C.hasToken()) { clearSession(false).then(() => reloadHome('guest')); return; }
    paint(); banner(); toast('You are a guest on this device. Start a project or join one whenever you like.');
  }
  // Switch to another account on this device (one click from the menu, the sheet or Settings).
  async function switchTo(id) {
    const a = st.accounts.find(x => x.id === id); if (!a) return;
    if (a.id === st.current && mode() !== 'signedout') { closeSheet(); return; }
    // a recent account with no tribe key here: its account session if it is still live, else Log in with its name filled in
    if (a.kind === 'server' && !(a.server && a.server.token)) {
      if (a.acct) { try { await acctApi('/me', { token: a.acct }); st.current = a.id; st.mode = 'account'; a.seen = new Date().toISOString(); write(); closeSheet(); paint(); banner(); toast(`Signed in as ${a.username || a.name}`); return; } catch { a.acct = ''; write(); } }
      return login({ prefill: a.username || a.name });
    }
    const s = S.get(), cur = current();
    if (cur && cur.kind === 'device') cur.server = { url: (s.server && s.server.url) || '', token: (s.server && s.server.token) || '' };   // keep my key for switching back
    if (cur && cur.kind === 'device') cur.avatar = s.pendingAvatar || cur.avatar || null;
    if (s.server && s.server.token && !(a.kind === 'device' && a.server && a.server.token === s.server.token)) { try { await C.api('/session', { method: 'DELETE' }); } catch {} }
    if (a.kind === 'test') {
      S.set({ name: a.name, color: a.color, pendingAvatar: a.avatar, onboarded: true, server: { url: (s.server && s.server.url) || '', token: '' } });
      st.mode = 'test';
    } else {
      S.set({ name: a.name, color: a.color, ...(a.avatar ? { pendingAvatar: a.avatar } : {}), onboarded: true, server: { url: (a.server && a.server.url) || '', token: (a.server && a.server.token) || '' } });
      st.mode = a.server && a.server.token ? 'signedin' : 'signedout';
    }
    try { if (!localStorage.getItem('tribecode.personalized')) localStorage.setItem('tribecode.personalized', '1'); } catch {}
    st.current = a.id; write();
    reloadHome('switched');
  }
  function setTest(on) {
    const wasTest = isTest(current());
    mountTests(on);
    if (!on && wasTest) { st.current = null; st.mode = 'signedout'; write(); S.set({ name: '', pendingAvatar: null }); reloadHome('signedout'); return; }
    paint(); banner();
  }

  // ---------- the Log in sheet ----------
  let sheet = null;
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }
  const face = (a, cls = '') => `<span class="ac-face ${cls}" style="--ac:${esc(a.color || 'var(--surface-2)')}">${a.avatar && a.avatar.emoji ? esc(a.avatar.emoji) : esc(([...(a.name || '?').trim()][0] || '?').toUpperCase())}</span>`;
  const sub = a => isTest(a) ? (a.tribes.length ? a.tribes.join(' · ') : 'No tribes yet') : a.server && a.server.token ? (a.tribes.join(' · ') || 'Signed in') : 'Signed out · ' + (a.tribes.join(' · ') || 'this device');
  const acctRow = a => `<button class="ac-row ${a.id === st.current && mode() !== 'signedout' ? 'on' : ''}" data-acc="${esc(a.id)}">${face(a)}<span class="ac-t"><b>${esc(a.name)}${isTest(a) ? ' <i class="ac-test">TEST</i>' : ''}</b><small>${esc(sub(a))}</small></span>${a.id === st.current && mode() !== 'signedout' ? ico('i-tick', 14) : ''}</button>`;
  const local = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || !!(window.TribeHost && window.TribeHost.isDesktop);
  function login({ add = false, prefill = '' } = {}) {
    closeSheet();
    const saved = st.accounts.filter(a => !(add && a.id === st.current)).sort((x, y) => String(y.seen || '').localeCompare(String(x.seen || ''))).slice(0, 6);
    sheet = document.createElement('div'); sheet.className = 'ac-scrim'; sheet.id = 'ac-login';
    sheet.innerHTML = `<div class="ac-sheet" role="dialog" aria-modal="true" aria-labelledby="ac-title">
      <button class="ac-x" data-ac="close" aria-label="Close">${ico('i-x', 16)}</button>
      <span class="eyebrow">${add ? 'Add account' : 'Log in'}</span><h2 id="ac-title">${add ? 'Add an account to this device' : mode() === 'signedout' ? 'Welcome back' : 'Log in to TribeCode'}</h2>
      ${saved.length ? `<div class="ac-sec"><span class="ac-eye">Recent on this device</span><div class="ac-list">${saved.map(acctRow).join('')}</div></div>` : ''}
      <div class="ac-sec" id="ac-acct" hidden><span class="ac-eye">Your TribeCode account</span>
        <form id="ac-acct-form" class="ac-form" autocomplete="on"><input class="input" id="ac-user" autocomplete="username" placeholder="Username" maxlength="32" aria-label="Username">
          <input class="input" id="ac-pass" type="password" autocomplete="current-password" placeholder="Password" maxlength="200" aria-label="Password">
          <p class="ac-err" id="ac-err" role="alert" hidden></p>
          <div class="ac-form-acts"><button class="linkish ac-forgot" type="button" data-ac="forgot" id="ac-forgot">Forgot password?</button><button class="btn" type="button" data-acf="signup">Create account</button><button class="btn primary" type="submit" id="ac-acct-go">Log in</button></div></form></div>
      <div class="ac-sec" id="ac-ways"><span class="ac-eye">Sign in</span>
        <div id="ac-oa" hidden></div>
        ${local() ? `<button class="ac-way" data-ac="host">${ico('i-home', 18)}<span><b>Sign in on this computer</b><small>As the host of the tribe that runs here</small></span></button>` : ''}
        <button class="ac-way" data-ac="join">${ico('i-link', 18)}<span><b>Join with an invite link</b><small>A friend's tribe, on this device</small></span></button>
        <p class="ac-fine" id="ac-oa-none" hidden>Discord, GitHub and Google sign-in show up here once the host turns them on (Settings › More settings › Sign-in).</p></div>
      <div class="ac-foot">${st.test ? '' : '<button class="linkish ac-testlink" data-ac="test">Use test accounts</button>'}${window.TribeSignup ? '<button class="linkish ac-newlink" data-ac="signup" id="ac-signup">New here? Create an account</button>' : ''}<button class="btn primary" data-ac="guest" id="ac-guest">Continue as guest</button></div></div>`;
    document.body.appendChild(sheet);
    const af = sheet.querySelector('#ac-acct-form');
    af.onsubmit = e => { e.preventDefault(); acctSubmit(af, 'login'); };
    af.querySelector('[data-acf="signup"]').onclick = () => acctSubmit(af, 'signup');
    const sh = sheet; serverOn().then(on => {
      const x = sh.querySelector('#ac-acct'); if (!x || sheet !== sh) return; x.hidden = !on;
      if (on && prefill) { sh.querySelector('#ac-user').value = prefill; sh.querySelector('#ac-pass').focus(); }
    });
    sheet.addEventListener('click', e => {
      if (e.target === sheet) return closeSheet();
      const r = e.target.closest('[data-acc]'); if (r) return switchTo(r.dataset.acc);
      const b = e.target.closest('[data-ac]'); if (!b) return;
      const k = b.dataset.ac;
      if (k === 'close') closeSheet();
      else if (k === 'guest') guest();
      else if (k === 'test') { mountTests(true); login({ add }); }
      else if (k === 'join') { st.mode = 'signedin'; write(); closeSheet(); window.TribeSettings && window.TribeSettings.joinPrompt(); }
      else if (k === 'host') hostSignIn(b);
      else if (k === 'signup') { closeSheet(); window.TribeSignup.open('create'); }
      else if (k === 'forgot') { const u = (sheet.querySelector('#ac-user') || {}).value || ''; closeSheet(); window.TribeSignup.open('forgot', { username: u }); }
    });
    // the existing providers, where they work (a page served by a TribeCode server)
    if (window.TribeOAuth && /^https?:$/.test(location.protocol)) {
      fetch('/api/oauth/providers').then(r => r.ok ? r.json() : { providers: [] }).then(d => {
        const el = sheet && sheet.querySelector('#ac-oa'); if (!el) return;
        const ps = d.providers || [];
        if (ps.length) window.TribeOAuth.buttons(el, ps, 'Sign in with', p => { st.mode = 'signedin'; write(); window.TribeOAuth.begin(p, 'signin').catch(e => toast(e.message)); });
        else { const n = sheet.querySelector('#ac-oa-none'); if (n) n.hidden = false; }
      }).catch(() => {});
    }
    if (!prefill) setTimeout(() => { const f = sheet && (sheet.querySelector('.ac-row') || sheet.querySelector('#ac-guest')); if (f) f.focus(); }, 30);
  }
  async function hostSignIn(btn) {
    btn.disabled = true;
    const prev = { mode: st.mode, current: st.current };
    st.mode = 'signedin'; write();
    const s = S.get();
    if (s.server && s.server.token) { await clearSession(false); }
    const r = await C.ensureMember({ name: s.name, color: s.color, reclaim: true }).catch(() => false);
    if (r && r !== 'signedout') { reloadHome('signedin'); return; }
    st.mode = prev.mode; st.current = prev.current; write(); btn.disabled = false;
    toast(window.__authError || 'Could not sign in on this computer. Is the tribe running here?');
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet) { e.stopPropagation(); closeSheet(); } if (e.key === 'Escape' && confirmEl) { e.stopPropagation(); confirmEl.remove(); confirmEl = null; } }, true);

  // ---------- Log out (with "Also forget this device's tribes") ----------
  let confirmEl = null;
  function confirmLogout() {
    if (confirmEl) confirmEl.remove();
    const cur = current(), test = isTest(cur);
    confirmEl = document.createElement('div'); confirmEl.className = 'ac-scrim'; confirmEl.id = 'ac-logout';
    confirmEl.innerHTML = `<div class="ac-sheet ac-small" role="dialog" aria-modal="true" aria-labelledby="ac-lo-t">
      <span class="eyebrow">Log out</span><h2 id="ac-lo-t">Log out${cur ? ' of ' + esc(cur.name) : ''} on this device?</h2>
      <p class="ac-lead">${test ? 'This TEST account is only on this device. You can sign back in to it from Log in.' : 'Your tribe key and sign-in cookie leave this device. Your tribes, chats and files stay where they are, and you can log back in any time.'}</p>
      ${upgradable() && srv.on && window.TribeSignup ? `<div class="ac-save" id="ac-save"><span><b>Save your work first?</b><small>An account keeps your projects and tribes when you leave this device.</small></span><button class="btn" data-lo="signup">Create an account</button></div>` : ''}
      ${test ? '' : `<label class="ac-check"><input type="checkbox" id="ac-forget"><span><b>Also forget this device's tribes</b><small>Drops the saved tribe address and this device's copies of chat, pins and drafts. Nothing is deleted from the tribe.</small></span></label>`}
      <div class="ac-foot"><button class="btn" data-lo="cancel">Cancel</button><button class="btn primary" data-lo="go" id="ac-lo-go">Log out</button></div></div>`;
    document.body.appendChild(confirmEl);
    confirmEl.addEventListener('click', e => {
      if (e.target === confirmEl || e.target.closest('[data-lo="cancel"]')) { confirmEl.remove(); confirmEl = null; return; }
      if (e.target.closest('[data-lo="signup"]')) { confirmEl.remove(); confirmEl = null; window.TribeSignup.open('create', { upgrade: 'leave' }); return; }
      if (e.target.closest('[data-lo="go"]')) { const f = confirmEl.querySelector('#ac-forget'); e.target.disabled = true; logout({ forget: !!(f && f.checked) }); }
    });
    setTimeout(() => { const b = confirmEl && confirmEl.querySelector('#ac-lo-go'); if (b) b.focus(); }, 30);
  }

  // ---------- what the rest of the app shows ----------
  function status(short) {   // short: the user bar, where a TEST chip already says it
    const m = mode(), a = current();
    if (m === 'signedout') return short ? 'Log in' : 'Signed out · Log in';
    if (m === 'test' && a) return `${short ? '' : 'TEST · '}${a.tribes.length ? a.tribes[0] + (a.tribes.length > 1 ? ` +${a.tribes.length - 1}` : '') : 'no tribes'}`;
    if (m === 'guest') return 'Guest on this device';
    if (m === 'account' && a) return `Signed in as ${a.username || a.name}`;
    return '';
  }
  function paint() {
    const m = mode();
    document.body.classList.toggle('ac-out', m === 'signedout');
    document.body.classList.toggle('ac-testing', m === 'test');
    const ubn = $('#ub-name'), t = ubn && ubn.parentNode;
    if (t) {
      let chip = t.querySelector('.ac-test'); const want = m === 'test';
      if (want && !chip) { chip = document.createElement('i'); chip.className = 'ac-test'; chip.textContent = 'TEST'; ubn.after(chip); } else if (!want && chip) chip.remove();
      if (m === 'signedout') ubn.textContent = 'Signed out';
      else if (ubn.textContent === 'Signed out') ubn.textContent = S.get().name || 'You';
      const s = status(true), ubs = $('#ub-st'); if (s && ubs && ubs.textContent !== s) ubs.textContent = s;
    }
    if (window.TribeProfileMenu && window.TribeProfileMenu.paint) try { window.TribeProfileMenu.paint(); } catch {}
  }
  // Home: signed out says so with the two ways on; a TEST account says whose it is and which tribes it's in.
  function banner() {
    const hub = $('#view-hub'); if (!hub) return;
    const m = mode(), a = current();
    let el = hub.querySelector('#ac-banner');
    const want = m === 'signedout' || (m === 'test' && a);
    if (!want) { if (el) el.remove(); return; }
    const html = m === 'signedout'
      ? `<div class="ac-b-t"><span class="eyebrow">Signed out</span><b>You're signed out on this device</b><small>Log in to get back to your tribes, or look around as a guest.</small></div><div class="ac-b-acts"><button class="btn primary" data-acb="login">Log in</button>${window.TribeSignup ? '<button class="btn" data-acb="signup">Create account</button>' : ''}<button class="btn" data-acb="guest">Continue as guest</button></div>`
      : `${face(a, 'lg')}<div class="ac-b-t"><span class="eyebrow">Test account <i class="ac-test">TEST</i></span><b>${esc(a.name)}</b><small>${a.tribes.length ? 'In ' + esc(a.tribes.join(', ')) : 'Not in any tribe yet'} · only on this device</small></div><div class="ac-b-acts"><button class="btn" data-acb="switch">Switch</button><button class="btn" data-acb="logout">Log out</button></div>`;
    if (!el) { el = document.createElement('section'); el.id = 'ac-banner'; el.className = 'ac-banner'; }
    if (el.dataset.sig !== m + (a ? a.id : '')) { el.innerHTML = html; el.dataset.sig = m + (a ? a.id : ''); }
    if (hub.firstElementChild !== el) hub.insertBefore(el, hub.firstChild);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-acb]'); if (!b) return;
    const k = b.dataset.acb;
    if (k === 'login') login(); else if (k === 'guest') guest(); else if (k === 'signup') window.TribeSignup.open(); else if (k === 'switch') login({ add: true }); else if (k === 'logout') confirmLogout();
  });
  // the user bar's name opens Log in while signed out
  document.addEventListener('click', e => { if (mode() === 'signedout' && e.target.closest && e.target.closest('#ub-me .ub-t')) login(); });

  // ---------- the profile menu: accounts, Add account, Log out ----------
  function menuHtml() {
    const m = mode(), others = st.accounts.filter(a => a.id !== st.current || m === 'signedout').slice(0, 5);
    const item = (act, icon, label, extra = '') => `<button role="menuitem" class="pf-item" data-act="${act}"${extra}>${ico(icon)}<span>${label}</span></button>`;
    const as = signedAs();
    return `<div class="pf-sep"></div>${as ? `<div class="ac-menu-eye ac-as" id="ac-as">Signed in as <b>${esc(as)}</b></div>` : ''}${upgradable() && srv.on && window.TribeSignup ? item('acc-signup', 'i-sparkle', 'Save your work: create an account') : ''}${others.length ? `<div class="ac-menu-eye">Switch account</div>${others.map(a => `<button role="menuitem" class="pf-item ac-mi" data-act="acc-switch" data-acc="${esc(a.id)}">${face(a, 'sm')}<span>${esc(a.name)}${isTest(a) ? ' <i class="ac-test">TEST</i>' : ''}</span></button>`).join('')}` : ''}
      ${item('acc-add', 'i-plus', m === 'signedout' ? 'Log in' : 'Add account')}
      ${m === 'signedout' ? '' : item('logout', 'i-logout', 'Log out')}`;
  }
  function menuAct(b) {
    const a = b.dataset.act;
    if (a === 'acc-switch') switchTo(b.dataset.acc);
    else if (a === 'acc-add') login({ add: mode() !== 'signedout' });
    else if (a === 'acc-signup') window.TribeSignup.open('create', { upgrade: 'menu' });
    else if (a === 'logout') confirmLogout();
    else return false;
    return true;
  }

  // ---------- Settings: Account (top) and More settings › Test accounts ----------
  function settings(box) {
    if (!box) return;
    const m = mode(), a = current(), s = S.get();
    const who = m === 'signedout' ? 'Signed out' : m === 'guest' ? 'Guest on this device' : a ? `${a.name}${isTest(a) ? ' (TEST)' : ''}` : (s.name || 'You');
    const acc = document.createElement('div'); acc.className = 'set-row set-account'; acc.id = 'set-account';
    acc.innerHTML = `<div class="set-l"><b>Account</b><small>${esc(who)}${st.accounts.length > 1 ? ` · ${st.accounts.length} on this device` : ''}</small></div>
      <div class="set-c ac-set-c">${m === 'signedout' ? '<button class="btn primary" data-ac-set="login">Log in</button>' : `<button class="btn" data-ac-set="switch">Switch account</button><button class="btn" data-ac-set="logout" id="set-logout">${ico('i-logout', 15)} Log out</button>`}</div>`;
    const head = box.querySelector('.set-head'); if (head) head.after(acc); else box.prepend(acc);
    const more = box.querySelector('#set-more');
    if (more) {
      const t = document.createElement('div'); t.className = 'set-row'; t.id = 'set-testacc-row';
      t.innerHTML = `<div class="set-l"><b>Test accounts <i class="ac-test">TEST</i></b><small>Advanced. Mounts four local guest accounts (Orion, Maya, Jay, Guest) to try logging in, out and switching. Stored only on this device.</small></div>
        <div class="set-c"><button class="toggle set-toggle" role="switch" id="set-testacc" aria-label="Test accounts" aria-checked="${!!st.test}"><span class="switch"></span></button></div>`;
      const summary = more.querySelector('summary'); if (summary) summary.after(t); else more.appendChild(t);
    }
    if (a && a.kind === 'server' && a.acct && m !== 'signedout') sessions(acc, a);
    const me = (C.state() || {}).me; if (me && me.role === 'host' && C.hasToken()) resets(acc);
    box.querySelectorAll('[data-ac-set]').forEach(b => b.onclick = () => {
      const k = b.dataset.acSet; if (window.TribeSettings) window.TribeSettings.close();
      if (k === 'login') login(); else if (k === 'switch') login({ add: true }); else if (k === 'logout') confirmLogout();
    });
    const tg = box.querySelector('#set-testacc'); if (tg) tg.onclick = () => { const on = tg.getAttribute('aria-checked') !== 'true'; tg.setAttribute('aria-checked', String(on)); setTest(on); toast(on ? 'Test accounts on: Orion, Maya, Jay and Guest are in Log in and your menu.' : 'Test accounts off.'); };
  }

  // Settings › Account: where this account is signed in (GET /api/accounts/sessions), each with End
  async function sessions(row, a) {
    let list = []; try { list = (await acctApi('/sessions', { token: a.acct })).sessions || []; } catch (e) { if (e.status === 401) { a.acct = ''; write(); } return; }
    let el = row.parentNode && row.parentNode.querySelector('#set-sessions');
    if (!el) { el = document.createElement('div'); el.className = 'set-row ac-sessions'; el.id = 'set-sessions'; row.after(el); }
    const when = t => { try { return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };
    el.innerHTML = `<div class="set-l"><b>Signed in on</b><small>${list.length} device${list.length === 1 ? '' : 's'} for ${esc(a.username || a.name)}</small></div>
      <ul class="ac-ses">${list.map(x => `<li><span><b>${esc(x.current ? 'This device' : (x.device || 'A device').replace(/^Mozilla\/5\.0 \(([^;)]+).*$/, '$1'))}</b><small>since ${esc(when(x.created))} · last ${esc(when(x.lastSeen))}</small></span>${x.current ? '' : `<button class="btn sm" data-ses="${esc(x.id)}">End</button>`}</li>`).join('')}</ul>`;
    el.querySelectorAll('[data-ses]').forEach(b => b.onclick = async () => { b.disabled = true; try { await acctApi('/sessions/' + encodeURIComponent(b.dataset.ses), { method: 'DELETE', token: a.acct }); toast('Signed out there'); sessions(row, a); } catch (e) { toast(e.message); b.disabled = false; } });
  }

  // Settings › Account › Password resets (the host): until there is email, the host makes a one-time code and gives it over
  async function resets(row) {
    if (!(await serverOn())) return;
    const tok = (S.get().server || {}).token || '';
    let list = []; try { list = (await acctApi('/resets', { token: tok })).resets || []; } catch { return; }
    if (!row.parentNode) return;   // Settings closed meanwhile
    let el = row.parentNode.querySelector('#set-resets');
    if (!el) { el = document.createElement('div'); el.className = 'set-row ac-sessions'; el.id = 'set-resets'; (row.parentNode.querySelector('#set-sessions') || row).after(el); }
    const when = t => { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
    el.innerHTML = `<div class="set-l"><b>Password resets</b><small>${list.length ? `${list.length} waiting. Make a code and give it to them yourself: TribeCode doesn't send email yet.` : 'None waiting. When someone forgets their password, it shows up here.'}</small></div>
      ${list.length ? `<ul class="ac-ses">${list.map(r => `<li data-rs="${esc(r.id)}"><span><b>${esc(r.username)}</b><small>asked ${esc(when(r.requested))}${r.status === 'ready' ? ' · a code is out' : ''}</small></span><span class="ac-rs-acts"><button class="btn sm primary" data-rs-make="${esc(r.id)}">${r.status === 'ready' ? 'New code' : 'Make reset code'}</button><button class="btn sm" data-rs-del="${esc(r.id)}">Dismiss</button></span></li>`).join('')}</ul>` : ''}`;
    el.querySelectorAll('[data-rs-make]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try {
        const d = await acctApi('/resets/' + encodeURIComponent(b.dataset.rsMake), { method: 'POST', token: tok });
        const li = b.closest('li'); li.classList.add('ac-rs-ready');
        li.innerHTML = `<span><b>Reset code for ${esc(d.username)}</b><small>Give it to them. It works once, for 30 minutes.</small></span><code class="ac-code" id="ac-rs-code">${esc(d.code)}</code><button class="btn sm" data-rs-copy>Copy</button>`;
        li.querySelector('[data-rs-copy]').onclick = () => { try { navigator.clipboard.writeText(d.code); toast('Copied'); } catch {} };
      } catch (e) { toast(e.message); b.disabled = false; }
    });
    el.querySelectorAll('[data-rs-del]').forEach(b => b.onclick = async () => { b.disabled = true; try { await acctApi('/resets/' + encodeURIComponent(b.dataset.rsDel), { method: 'DELETE', token: tok }); resets(row); } catch (e) { toast(e.message); b.disabled = false; } });
  }

  // ---------- boot ----------
  if (C.hasToken() && st.mode && st.mode !== 'signedin' && st.mode !== 'test') { st.mode = 'signedin'; write(); }   // signed in by a link or a provider
  new MutationObserver(() => { if (mode() === 'signedout' || mode() === 'test') banner(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  addEventListener('load', () => {
    const hub = $('#view-hub'); if (hub) new MutationObserver(() => { if ((mode() === 'signedout' || mode() === 'test') && !hub.querySelector('#ac-banner')) banner(); }).observe(hub, { childList: true });
    paint(); banner();
    let after = null; try { after = sessionStorage.getItem('tribecode.acc.after'); sessionStorage.removeItem('tribecode.acc.after'); } catch {}
    if (after === 'signedout') setTimeout(() => { login(); }, 300);
    else if (after === 'switched' && current()) toast(`Signed in as ${current().name}${isTest(current()) ? ' (TEST)' : ''}`);
  });
  if (C.on) { C.on('status', () => setTimeout(paint, 0)); C.on('presence', () => setTimeout(paint, 0)); }
  addEventListener('tribe-local-profile', () => setTimeout(paint, 0));

  window.TribeAccounts = { state: () => JSON.parse(JSON.stringify(st)), list, current, mode, login, logout, confirmLogout, switchTo, guest, setTest, status, menuHtml, menuAct, settings, close: closeSheet, serverOn,
    api: acctApi, adopt, signIn, signedAs, upgradable, paint };
})();
