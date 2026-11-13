// "Ready to make your own?" (feat/demo-intro, docs/SIGNUP-FLOWS.md): one calm pop-up after the tour with Flint for
// someone with no account. demowatch.js arms it when the tour ends (the Your turn card, Skip to end, or Exit once it got
// going); it shows a short beat later (5 s, or soon after the first click or key in the real app), never while the tour
// plays or another sheet is open.
//   Sign up: the ways the host turned on (Create an account when TRIBE_ACCOUNTS=1; each OAuth provider that is on), plus
//            Continue as guest, Not now and "Have an account? Log in". A member key on this device (a guest pass, a
//            friend's invite) LINKS the provider to that member, so everything they made stays theirs.
//   Alt:     a host with accounts off and no providers (the website's static demo too): no sign-up, but Host your own
//            (a project on this device; the desktop app hosts) and Join a friend (paste an invite link).
// Inside the demo every choice first leaves it (Exit cleans up) and then runs in the real app (sessionStorage
// 'tribecode.signupNudge.then'), so a sign-in never lands back in the pretend tribe.
// Rules: once per session (sessionStorage), "Not now" snoozes it for 7 days (localStorage 'tribecode.signupNudge.snooze'),
// never for someone signed in (an account, or a full member key on this device), never in an automated browser unless
// forced (localStorage 'tribecode.test.nudge' = '1'; 'tribecode.test.nudgeDelay' = ms). Esc and X close it; a bottom
// sheet on phones.
// Public: window.TribeSignupNudge = { arm(why), show(opts), close(), blocked(), state() }
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, n = 16) => `<svg class="i" style="width:${n}px;height:${n}px" aria-hidden="true"><use href="#${id}"/></svg>`;
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const ssGet = k => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const ssSet = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} };
  const A = () => window.TribeAccounts, C = () => window.TribeClient, O = () => window.TribeOffline, W = () => window.TribeDemoWatch, OA = () => window.TribeOAuth;
  const SNOOZE = 'tribecode.signupNudge.snooze', SHOWN = 'tribecode.signupNudge.shown', ARM = 'tribecode.signupNudge.arm', THEN = 'tribecode.signupNudge.then';
  const WEEK = 7 * 864e5, RELEASES = 'https://github.com/orionopenwow/TribeCode/releases/latest';
  const forced = () => lsGet('tribecode.test.nudge') === '1';
  const delay = () => { const d = Number(lsGet('tribecode.test.nudgeDelay')); return d >= 0 && lsGet('tribecode.test.nudgeDelay') != null ? d : 5000; };
  const desktop = () => !!(window.__TAURI__ || window.__TAURI_INTERNALS__) || /tauri\.localhost$/i.test(location.hostname);
  const st = { armed: '', shown: false, reason: '', kind: '', providers: [], accounts: false, then: '' };

  // ---------- who is this ----------
  // the sign-in really saved on this device (a demo never rewrites it: offline.js)
  const saved = () => { try { const k = 'tribecode.settings.v1'; return JSON.parse((O() && O().saved ? O().saved(k) : lsGet(k)) || '{}') || {}; } catch { return {}; } };   // the tour masks it from ordinary reads
  const realKey = () => { const s = saved().server || {}; return s.token && s.token !== 'offline-demo' ? s : null; };
  const acctMode = () => { try { return (JSON.parse(lsGet('tribecode.accounts.v1') || '{}') || {}).mode || ''; } catch { return ''; } };
  const inDemo = () => !!(O() && O().active && O().active() && !(O().solo && O().solo()));
  const guestPass = () => { const me = !inDemo() && C() && C().state && (C().state() || {}).me; return !!(me && (me.guestUntil || me.guest)); };
  function signedIn() {
    if (A() && A().signedAs && A().signedAs()) return true;
    return !!realKey() && !['guest', 'signedout', 'test'].includes(acctMode()) && !guestPass();
  }
  function blocked() {
    if (navigator.webdriver && !forced()) return 'test';
    if (signedIn()) return 'signed-in';
    if (ssGet(SHOWN)) return 'shown';
    if (Number(lsGet(SNOOZE)) > Date.now()) return 'snoozed';
    return '';
  }
  // the tour is playing, another demo is on, or a sheet is open: wait
  const busy = () => {
    const w = W(); if (w && w.active && w.active() && !(w.finished && w.finished())) return true;
    if (inDemo() && !(O().mode && O().mode() === 'watch' && w && w.finished && w.finished())) return true;
    return !!($('#di') || $('#sg') || $('#pz') || $('.ac-scrim') || $('#su-start') || [...document.querySelectorAll('.ph-sheet, .modal:not(.hidden), [role="dialog"][aria-modal="true"]')].some(x => x.offsetParent !== null && !x.closest('#sn')));
  };

  // ---------- arm and wait ----------
  let timer = 0, tries = 0;
  function arm(why) {
    const r = blocked(); st.reason = r;
    if (r) return false;
    st.armed = why || 'end'; ssSet(ARM, st.armed); later(delay()); return true;
  }
  function later(ms) { clearTimeout(timer); timer = setTimeout(tryShow, ms); }
  function tryShow() {
    if (!ssGet(ARM) || $('#sn')) return;
    const r = blocked(); st.reason = r;
    if (r) { ssSet(ARM, null); return; }
    if (document.hidden) { addEventListener('visibilitychange', () => later(800), { once: true }); return; }
    if (busy()) { if (tries++ < 240) later(1000); return; }
    show();
  }

  // ---------- what the host offers ----------
  function base() {
    const b = (C() && C().base ? C().base() : '') || '';
    if (b && !/\.invalid(:\d+)?$/.test(b)) return b;
    return /^https?:$/.test(location.protocol) && !desktop() ? location.origin : desktop() ? 'http://localhost:4747' : '';
  }
  const net = (u, o) => (O() && O().realFetch ? O().realFetch(u, o) : fetch(u, o));
  async function offer() {
    let accounts = false, providers = [];
    try { await A().api('/me'); accounts = true; } catch (e) { accounts = e && e.status === 401; }
    if (!desktop() || window.TribeAuth2) {   // feat/auth2: the desktop app signs in with providers through the system browser
      try { const r = await net(base() + '/api/oauth/providers', { credentials: 'omit' }); if (r.ok) providers = ((await r.json()).providers || []).filter(p => p && p.id); } catch {}
      if (OA() && OA().forPlatform) providers = OA().forPlatform(providers);
    }
    return { accounts, providers };
  }

  // ---------- the pop-up ----------
  let el = null, back = null;
  async function show(opts = {}) {
    if ($('#sn')) return true;
    if (!opts.force && blocked()) return false;
    const o = opts.offer || await offer();
    if ($('#sn')) return true;
    st.accounts = o.accounts; st.providers = o.providers.map(p => p.id); st.kind = o.accounts || o.providers.length ? 'signup' : 'alt';
    st.shown = true; ssSet(SHOWN, '1'); ssSet(ARM, null);
    back = document.activeElement;
    el = document.createElement('section'); el.id = 'sn'; el.className = 'sn'; el.dataset.kind = st.kind;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'false'); el.setAttribute('aria-labelledby', 'sn-title'); el.setAttribute('aria-describedby', 'sn-lead'); el.tabIndex = -1;
    el.innerHTML = `<button type="button" class="sn-x" data-sn="close" aria-label="Close">${ico('i-x', 16)}</button>` + (st.kind === 'signup' ? signupHtml(o) : altHtml());
    el.addEventListener('click', onClick);
    document.body.appendChild(el);
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { if (el) try { el.focus({ preventScroll: true }); } catch {} }, 30);
    return true;
  }
  const linkMode = () => { const k = realKey(); return k && (!k.url || k.url === location.origin) && !inDemo() ? 'link' : 'signin'; };
  function signupHtml(o) {
    const link = linkMode() === 'link', guestNow = acctMode() === 'guest';
    const prov = o.providers.map(p => `<button type="button" class="oa-btn sn-p" data-sn="oauth" data-p="${esc(p.id)}">${OA() ? OA().glyph(p.id) : ''}<span>${link ? 'Save with' : 'Continue with'} ${esc(p.name)}</span></button>`).join('');
    return `<span class="eyebrow">Your turn</span><h2 id="sn-title">Ready to make your own?</h2>
      <p class="sn-lead" id="sn-lead">${link ? 'Save your spot: link an account and everything you made here stays yours, on every device.' : 'Make an account so your projects, tribes and friends follow you to every device. It takes a minute.'}</p>
      <div class="sn-ways">${o.accounts ? `<button type="button" class="btn primary sn-main" data-sn="create" id="sn-create">${ico('i-users', 16)}Create an account</button>` : ''}${prov}</div>
      ${desktop() && o.accounts && !o.providers.length && !window.TribeAuth2 ? '<p class="sn-note">GitHub, Google and Discord sign-in work from TribeCode in your browser.</p>' : ''}
      <div class="sn-acts"><button type="button" class="btn" data-sn="guest" id="sn-guest">${guestNow ? 'Keep going as a guest' : 'Continue as guest'}</button><button type="button" class="btn ghost" data-sn="later" id="sn-later">Not now</button></div>
      <p class="sn-alt">Have an account? <button type="button" class="linkish" data-sn="login" id="sn-login">Log in</button></p>`;
  }
  function altHtml() {
    return `<span class="eyebrow">Your turn</span><h2 id="sn-title">Ready to make your own?</h2>
      <p class="sn-lead" id="sn-lead">This TribeCode doesn’t have sign-up turned on, and you don’t need it: host your own, or join a friend’s tribe with their link.</p>
      <div class="sn-ways"><button type="button" class="sn-way" data-sn="host" id="sn-host">${ico('i-plus', 18)}<span><b>Host your own</b><small>${desktop() ? 'This computer runs your tribe. Friends join with a link.' : 'Start a project on this device. Choose where it lives later.'}</small></span></button>
        <button type="button" class="sn-way" data-sn="join" id="sn-join">${ico('i-link', 18)}<span><b>Join a friend</b><small>Paste the invite link a friend sent you.</small></span></button></div>
      <div class="sn-acts">${desktop() ? '' : `<a class="btn" href="${RELEASES}" target="_blank" rel="noopener" id="sn-app">Get the desktop app</a>`}<button type="button" class="btn ghost" data-sn="later" id="sn-later">Not now</button></div>`;
  }
  function close(how) {
    if (!el) return;
    el.remove(); el = null; document.removeEventListener('keydown', onKey, true);
    if (how === 'later') lsSet(SNOOZE, String(Date.now() + WEEK));
    if (back && back.isConnected && how !== 'act') try { back.focus({ preventScroll: true }); } catch {}
    back = null;
  }
  function onKey(e) {
    if (!el) return;
    if (e.key === 'Escape' && !$('#sg') && !$('.ac-scrim')) { e.preventDefault(); e.stopPropagation(); close('x'); }
  }
  function onClick(e) {
    const b = e.target.closest('[data-sn]'); if (!b) return;
    const k = b.dataset.sn;
    if (k === 'close') return close('x');
    if (k === 'later') return close('later');
    close('act'); act(k, b.dataset.p);
  }
  // run a choice in the real app: inside the demo, leave it first (Exit cleans up) and run it after the reload
  function act(k, p) {
    st.then = k + (p ? ':' + p : '');
    if (inDemo() || (O() && O().mode && O().mode() === 'watch')) {
      ssSet(THEN, JSON.stringify({ k, p, at: Date.now() }));
      if (W() && W().exit) W().exit(); else if (O() && O().exit) O().exit();
      return;
    }
    run(k, p);
  }
  function run(k, p) {
    const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
    if (k === 'create') { if (window.TribeSignup) window.TribeSignup.open('create', realKey() || acctMode() === 'guest' || (A() && A().upgradable && A().upgradable()) ? { upgrade: 'demo' } : {}); }
    else if (k === 'oauth' && desktop() && window.TribeAuth2 && linkMode() === 'signin') window.TribeAuth2.desktopSignIn(p);
    else if (k === 'oauth' && OA()) {
      const mode = linkMode();
      if (mode === 'signin') { try { const a = JSON.parse(lsGet('tribecode.accounts.v1') || '{}') || {}; a.mode = 'signedin'; lsSet('tribecode.accounts.v1', JSON.stringify(a)); } catch {} }   // like signup.js: the key it brings back signs this device in
      OA().begin(p, mode).catch(e => { toast(e.message); if (window.TribeSignup) window.TribeSignup.open('start'); });
    }
    else if (k === 'guest') { if (acctMode() !== 'guest' && !realKey() && A()) A().guest(); else toast('You’re a guest on this device. Start a project whenever you like.'); }
    else if (k === 'login' && A()) A().login();
    else if (k === 'host') {
      if (desktop() && window.TribeApp && window.TribeApp.hostHere) window.TribeApp.hostHere();
      else if (window.TribeLocalSetup) window.TribeLocalSetup.start();
      else if (window.TribeApp && window.TribeApp.startFirst) window.TribeApp.startFirst();
    }
    else if (k === 'join' && window.TribeSettings) window.TribeSettings.joinPrompt();
  }

  // ---------- boot: a choice made in the demo, or a nudge armed before Exit's reload ----------
  function boot() {
    let then = null; try { then = JSON.parse(ssGet(THEN) || 'null'); } catch {}
    ssSet(THEN, null);
    if (then && Date.now() - (then.at || 0) < 120000) { st.then = then.k + (then.p ? ':' + then.p : ''); setTimeout(() => run(then.k, then.p), 900); return; }
    if (!ssGet(ARM)) return;
    st.armed = ssGet(ARM);
    const first = () => { removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); later(800); };
    addEventListener('pointerdown', first, true); addEventListener('keydown', first, true);   // or soon after the first click or key in the real app
    later(delay());
  }
  if (document.readyState === 'complete') setTimeout(boot, 0); else addEventListener('load', () => setTimeout(boot, 0));

  window.TribeSignupNudge = { arm, show, close: () => close('x'), blocked, state: () => ({ ...st, open: !!el, snoozedUntil: Number(lsGet(SNOOZE)) || 0 }) };
})();
