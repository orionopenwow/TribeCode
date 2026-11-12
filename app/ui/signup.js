// Sign up (feat/signup, docs/ACCOUNTS.md › Sign up). One sheet, three ways in, in this order:
//   Continue as guest   instant and local (accounts.js guest()), nothing to fill in
//   Create an account   a username (checked as you type, with free suggestions), a display name, a password with a strength
//                       meter and an optional email for recovery; needs the server's accounts (TRIBE_ACCOUNTS=1)
//   Sign in with …      the providers the host turned on (oauth.js; Apple only once configured)
// Then Make it yours (personalize.js, skippable) and Home with the next step. There is no email yet: an address is kept,
// marked "verify later" (TODO(email) in server/accounts.js). Forgot password asks the host for a one-time code.
// "Save your work": guests, TEST accounts, guest passes and projects kept only on this device get one calm, dismissible
// nudge per moment (after the first project, when inviting a friend, before logging out), never blocking. Upgrading keeps
// everything on this device; a member key on this device is linked to the new account (POST /api/accounts/signup link).
// Open with ?signup=1 (or ?signup=create). Public: window.TribeSignup = { open(view, opts), close(), nudge(moment), strength(pw, user) }
(function () {
  'use strict';
  const C = window.TribeClient, S = window.TribeStore; if (!C || !S) return;
  const A = () => window.TribeAccounts, OFF = () => window.TribeOffline;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, n = 18) => `<svg class="i" style="width:${n}px;height:${n}px" aria-hidden="true"><use href="#${id}"/></svg>`;
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

  // ---------- the rules, the same as server/accounts.js ----------
  const norm = raw => String(raw == null ? '' : raw).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  const validName = u => u.length >= 2 && /^[\p{L}\p{N} ._-]+$/u.test(u);
  const validEmail = e => e.length <= 254 && /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(e);
  const COMMON = ['password', 'password1', 'password12', 'password123', 'passw0rd', '12345678', '123456789', '1234567890', 'qwerty12', 'qwerty123', 'qwertyuiop',
    'iloveyou', 'letmein1', 'welcome1', 'welcome123', 'admin123', 'abc12345', 'abcd1234', '11111111', '00000000', 'football', 'baseball', 'sunshine', 'princess',
    'trustno1', 'tribecode', 'monkey123', 'dragon123', 'superman', 'changeme'];
  // 0 too short · 1 weak (or too easy to guess) · 2 okay · 3 strong · 4 very strong. Create needs 2 or more.
  function strength(pw, user) {
    const p = String(pw || ''), l = p.toLowerCase(), u = norm(user).toLowerCase().replace(/[\s._-]+/g, '');
    if (!p) return { score: 0, label: '', tip: 'At least 8 characters. A short phrase is easy to remember and hard to guess.', ok: false };
    if (p.length < 8) return { score: 0, label: 'Too short', tip: `${8 - p.length} more character${p.length === 7 ? '' : 's'} to go.`, ok: false };
    if (COMMON.includes(l) || /^(.)\1+$/.test(p) || '01234567890123456789abcdefghijklmnopqrstuvwxyz'.includes(l)) return { score: 1, label: 'Too easy to guess', tip: 'That one is on every list. Try a few words you like.', ok: false };
    if (u.length >= 3 && l.replace(/[\s._-]+/g, '').includes(u)) return { score: 1, label: 'Too easy to guess', tip: 'Keep your username out of your password.', ok: false };
    const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length;
    let s = 1 + (p.length >= 12) + (p.length >= 16) + (kinds >= 3) + (/\s/.test(p.trim()) && p.length >= 12);
    if (kinds === 1 && p.length < 12) s = 1;
    s = Math.min(4, s);
    const label = ['Too short', 'Weak', 'Okay', 'Strong', 'Very strong'][s];
    const tip = s < 2 ? 'Add a word or two, or mix in numbers and symbols.' : s < 3 ? 'Good enough. A longer phrase is even better.' : 'Nice one.';
    return { score: s, label, tip, ok: s >= 2 };
  }

  // ---------- the sheet ----------
  let el = null, view = 'start', opts = {}, back = null, ck = { seq: 0, user: '', state: '' }, nameTouched = false, busy = false;
  function close() {
    if (!el) return;
    el.remove(); el = null; document.removeEventListener('keydown', onKey, true);
    if (back && back.isConnected) try { back.focus(); } catch {}
    back = null;
  }
  function onKey(e) {
    if (!el) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {   // keep focus inside the sheet
      const f = [...el.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function open(v = 'start', o = {}) {
    if (A() && A().close) A().close();
    if (!el) back = document.activeElement;
    opts = o || {}; view = v;
    if (!el) {
      el = document.createElement('div'); el.className = 'ac-scrim sg-scrim'; el.id = 'sg';
      el.addEventListener('mousedown', e => { if (e.target === el) close(); });
      el.addEventListener('click', onClick);
      document.body.appendChild(el); document.addEventListener('keydown', onKey, true);
    }
    const run = () => draw();
    if (el.firstChild && window.TribeMotion && window.TribeMotion.swap) window.TribeMotion.swap(run); else run();
  }
  const sheet = (inner, label) => `<div class="ac-sheet sg-sheet" role="dialog" aria-modal="true" aria-labelledby="sg-title" data-view="${view}">
      <button class="ac-x" data-sg="close" aria-label="Close">${ico('i-x', 16)}</button>${inner}</div>`;
  function draw() {
    if (!el) return;
    if (view === 'create') el.innerHTML = sheet(createHtml());
    else if (view === 'forgot') el.innerHTML = sheet(forgotHtml());
    else el.innerHTML = sheet(startHtml());
    if (view === 'create') wireCreate(); else if (view === 'forgot') wireForgot(); else wireStart();
  }

  // 1. Three ways in
  function startHtml() {
    return `<span class="eyebrow">Get started</span><h2 id="sg-title">Join TribeCode</h2>
      <p class="ac-lead">Start right now, or make an account so your work follows you to every device.</p>
      <div class="sg-paths">
        <button class="sg-path" data-sg="guest" id="sg-guest">${ico('i-zap')}<span><b>Continue as guest</b><small>Instant. Everything stays on this device.</small></span>${ico('i-chev', 14).replace('class="i"', 'class="i sg-chev"')}</button>
        <button class="sg-path sg-main" data-sg="create" id="sg-create">${ico('i-users')}<span><b>Create an account</b><small id="sg-create-sub">A username and password. Keeps your projects and tribes.</small></span>${ico('i-chev', 14).replace('class="i"', 'class="i sg-chev"')}</button>
      </div>
      <div class="ac-sec" id="sg-oa-sec" hidden><span class="ac-eye">Or sign in with</span><div id="sg-oa"></div></div>
      <p class="sg-alt">Have an account? <button class="linkish" data-sg="login" id="sg-login">Log in</button></p>`;
  }
  function wireStart() {
    const sh = el;
    A().serverOn().then(on => {
      if (el !== sh || on) return;
      const b = sh.querySelector('#sg-create'), sub = sh.querySelector('#sg-create-sub'); if (!b) return;
      b.disabled = true; b.setAttribute('aria-disabled', 'true');
      sub.textContent = 'Not on for this TribeCode yet: the host turns accounts on (TRIBE_ACCOUNTS=1).';
    });
    if (window.TribeOAuth && /^https?:$/.test(location.protocol)) {
      fetch('/api/oauth/providers').then(r => r.ok ? r.json() : { providers: [] }).then(d => {
        const box = el === sh && sh.querySelector('#sg-oa'); if (!box) return;
        window.TribeOAuth.buttons(box, (d.providers || []).filter(p => p && p.id), 'Continue with', p => {
          const st = JSON.parse(lsGet('tribecode.accounts.v1') || '{}'); st.mode = 'signedin'; lsSet('tribecode.accounts.v1', JSON.stringify(st));
          window.TribeOAuth.begin(p, 'signin').catch(e => { toast(e.message); draw(); });
        });
        sh.querySelector('#sg-oa-sec').hidden = box.hidden;
      }).catch(() => {});
    }
    setTimeout(() => { const f = el === sh && sh.querySelector('#sg-guest'); if (f) f.focus(); }, 30);
  }

  // 2. Create an account
  function createHtml() {
    const up = opts.upgrade;
    return `<button class="sg-back" data-sg="start" aria-label="Back to all the ways in">${ico('i-chev', 16)}</button>
      <span class="eyebrow">${up ? 'Save your work' : 'Create an account'}</span><h2 id="sg-title">${up ? 'Keep what you made' : 'Make your account'}</h2>
      ${up ? '<p class="ac-lead">Everything on this device stays just as it is, and your tribes come along.</p>' : ''}
      <form id="sg-form" class="sg-form" method="post" action="#" autocomplete="on" novalidate>
        <div class="sg-f"><label for="sg-user">Username</label>
          <input class="input" id="sg-user" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" required enterkeyhint="next" aria-describedby="sg-user-hint" aria-invalid="false">
          <p class="sg-hint" id="sg-user-hint" aria-live="polite">2 to 32 letters, numbers, spaces, dots, dashes or underscores.</p>
          <div class="sg-sugs" id="sg-sugs" hidden></div></div>
        <div class="sg-f"><label for="sg-name">Display name <small>what friends see</small></label>
          <input class="input" id="sg-name" name="nickname" type="text" autocomplete="nickname" maxlength="32" enterkeyhint="next"></div>
        <div class="sg-f"><label for="sg-pass">Password</label>
          <div class="sg-pw"><input class="input" id="sg-pass" name="new-password" type="password" autocomplete="new-password" passwordrules="minlength: 8; maxlength: 200;" minlength="8" maxlength="200" required enterkeyhint="next" aria-describedby="sg-pass-hint" aria-invalid="false">
            <button type="button" class="sg-eye" id="sg-eye" aria-label="Show password" aria-pressed="false">Show</button></div>
          <div class="sg-meter" id="sg-meter" data-score="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <p class="sg-hint" id="sg-pass-hint" aria-live="polite">At least 8 characters. A short phrase is easy to remember and hard to guess.</p></div>
        <div class="sg-f"><label for="sg-email">Email <small>optional, for getting back in</small></label>
          <input class="input" id="sg-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" enterkeyhint="done" aria-describedby="sg-email-hint" aria-invalid="false">
          <p class="sg-hint" id="sg-email-hint" aria-live="polite">You can verify it later: TribeCode doesn't send email yet.</p></div>
        <p class="ac-err" id="sg-err" role="alert" hidden></p>
        <button class="btn primary sg-go" id="sg-submit" type="submit" disabled>Create account</button>
      </form>
      <p class="sg-alt">Have an account? <button class="linkish" data-sg="login">Log in</button></p>`;
  }
  function wireCreate() {
    const f = el.querySelector('#sg-form'), u = f.querySelector('#sg-user'), n = f.querySelector('#sg-name'), p = f.querySelector('#sg-pass'), em = f.querySelector('#sg-email');
    nameTouched = false; ck = { seq: ck.seq + 1, user: '', state: '' }; busy = false;
    const hint = (id, text, kind) => { const h = f.querySelector(id); h.textContent = text; h.dataset.kind = kind || ''; };
    const invalid = (input, on) => input.setAttribute('aria-invalid', on ? 'true' : 'false');
    let t = null;
    u.addEventListener('input', () => {
      const v = norm(u.value);
      if (!nameTouched) n.value = v;
      f.querySelector('#sg-sugs').hidden = true;
      clearTimeout(t); ck.state = ''; validate();
      if (!u.value.trim()) { hint('#sg-user-hint', '2 to 32 letters, numbers, spaces, dots, dashes or underscores.'); invalid(u, false); return; }
      if (!validName(v)) { hint('#sg-user-hint', v.length < 2 ? 'At least 2 characters.' : 'Only letters, numbers, spaces, dots, dashes or underscores.', 'bad'); invalid(u, true); return; }
      invalid(u, false); hint('#sg-user-hint', 'Checking…', 'wait');
      t = setTimeout(() => check(v), 280);
    });
    n.addEventListener('input', () => { nameTouched = true; });
    p.addEventListener('input', validate); em.addEventListener('input', validate);
    em.addEventListener('blur', () => { const e = em.value.trim(); const bad = e && !validEmail(e); invalid(em, bad); hint('#sg-email-hint', bad ? 'That address looks off. Check it, or leave it empty.' : "You can verify it later: TribeCode doesn't send email yet.", bad ? 'bad' : ''); });
    f.querySelector('#sg-eye').onclick = e => { const b = e.currentTarget, show = p.type === 'password'; p.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); };
    f.onsubmit = e => { e.preventDefault(); submit(); };
    if (opts.username) { u.value = opts.username; u.dispatchEvent(new Event('input')); }
    setTimeout(() => { if (el) u.focus(); }, 40);
  }
  async function check(v) {
    const seq = ++ck.seq, f = el && el.querySelector('#sg-form'); if (!f) return;
    const hint = (text, kind) => { const h = f.querySelector('#sg-user-hint'); h.textContent = text; h.dataset.kind = kind || ''; };
    const tok = memberKey();
    let d; try { d = await A().api('/check?username=' + encodeURIComponent(v), { token: tok }); }
    catch (e) { if (seq !== ck.seq) return; ck = { ...ck, user: v, state: 'error' }; hint(e.status === 429 ? "You're typing faster than we can check. Give it a second." : e.status === 404 ? 'Accounts are off on this TribeCode.' : 'Could not check that name right now.', 'bad'); validate(); return; }
    if (seq !== ck.seq || !el) return;
    ck = { ...ck, user: d.username, state: d.available ? 'free' : 'taken' };
    const sugs = f.querySelector('#sg-sugs');
    if (d.available) { hint(`Available${d.username !== f.querySelector('#sg-user').value ? `, saved as “${d.username}”` : ''}`, 'good'); sugs.hidden = true; }
    else {
      hint((d.suggestions || []).length ? 'Taken. These are free:' : 'Taken. Try another.', 'bad');
      sugs.innerHTML = (d.suggestions || []).map(x => `<button type="button" class="sg-sug" data-sug="${esc(x)}">${esc(x)}</button>`).join('');
      sugs.hidden = !(d.suggestions || []).length;
      sugs.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { const u = f.querySelector('#sg-user'); u.value = b.dataset.sug; u.dispatchEvent(new Event('input')); u.focus(); });
    }
    f.querySelector('#sg-user').setAttribute('aria-invalid', d.available ? 'false' : 'true');
    validate();
  }
  function validate() {
    const f = el && el.querySelector('#sg-form'); if (!f) return false;
    const user = norm(f.querySelector('#sg-user').value), pw = f.querySelector('#sg-pass').value, em = f.querySelector('#sg-email').value.trim();
    const st = strength(pw, user), m = f.querySelector('#sg-meter'), h = f.querySelector('#sg-pass-hint');
    m.dataset.score = String(pw ? Math.max(1, st.score) : 0);
    h.textContent = pw ? `${st.label}. ${st.tip}` : st.tip; h.dataset.kind = !pw ? '' : st.ok ? 'good' : 'bad';
    f.querySelector('#sg-pass').setAttribute('aria-invalid', pw && !st.ok ? 'true' : 'false');
    const ok = validName(user) && ck.state === 'free' && ck.user === user && st.ok && (!em || validEmail(em)) && !busy;
    f.querySelector('#sg-submit').disabled = !ok;
    return ok;
  }
  // The member key on this device (a guest pass, an invite), never the local-only stand-in of a project on this device
  const memberKey = () => { const s = S.get(); return !(OFF() && OFF().active && OFF().active()) && C.hasToken() && s.server && s.server.token || ''; };
  async function submit() {
    if (!validate()) return;
    const f = el.querySelector('#sg-form'), err = f.querySelector('#sg-err'), btn = f.querySelector('#sg-submit');
    const say = t => { err.textContent = t; err.hidden = !t; };
    const username = norm(f.querySelector('#sg-user').value), displayName = norm(f.querySelector('#sg-name').value) || username;
    const password = f.querySelector('#sg-pass').value, email = f.querySelector('#sg-email').value.trim();
    busy = true; btn.disabled = true; btn.textContent = 'Creating…'; say('');
    const tok = memberKey();
    try {
      const d = await A().api('/signup', { method: 'POST', token: tok, body: { username, displayName, password, ...(email ? { email } : {}), ...(tok ? { link: true } : {}) } });
      const wasTest = A().mode() === 'test';
      A().adopt(d.account, d.token, d.linked ? tok : '');
      if (!d.linked || wasTest) S.set({ name: displayName });
      done(d.account, !!email);
    } catch (e) {
      busy = false; btn.textContent = 'Create account';
      if (e.status === 409) { ck.state = 'taken'; check(username); }
      say(e.status === 409 ? 'Someone just took that username. Pick another one.' : e.status === 404 ? 'Accounts are off on this TribeCode: the host turns them on.' : e.message.replace(/^./, c => c.toUpperCase()) + (/[.!?]$/.test(e.message) ? '' : '.'));
      validate();
    }
  }
  // After sign-up: Make it yours (skippable), then Home with the next step
  function done(account, email) {
    close();
    lsSet(NEXT, JSON.stringify({ name: account.displayName || account.username, username: account.username, email, at: Date.now() }));
    const home = () => { if (window.TribeHub && window.TribeHub.open) window.TribeHub.open('home'); else location.hash = '#/hub'; setTimeout(nextCard, 60); };
    const P = window.TribePersonalize;
    if (P && P.afterSignup) {
      P.afterSignup();
      if (P.isOpen()) { addEventListener('tribe-personalized', () => setTimeout(home, 30), { once: true }); return; }
    }
    home();
  }

  // ---------- Home: the next step ----------
  const NEXT = 'tribecode.signup.next';
  function nextCard() {
    const hub = $('#view-hub'); let raw = null; try { raw = JSON.parse(lsGet(NEXT) || 'null'); } catch {}
    const old = hub && hub.querySelector('#sg-next');
    if (!hub || !raw) { if (old) old.remove(); return; }
    const projects = ((C.state() || {}).projects || []).length, member = C.connected && C.connected() && (C.state() || {}).me;
    const step = projects && member ? { k: 'invite', t: 'Next: invite a friend', b: 'Invite a friend' } : { k: 'project', t: 'Next: start your first project', b: 'Start a project' };
    const html = `<div class="ac-b-t"><span class="eyebrow">You're in</span><b>Welcome, ${esc(raw.name)}. ${step.t}</b>
        <small>Signed in as ${esc(raw.username)}${raw.email ? ' · Email: verify later (TribeCode doesn\'t send email yet)' : ''}</small></div>
      <div class="ac-b-acts"><button class="btn primary" data-sgn="${step.k}" id="sg-next-go">${step.b}</button><button class="btn" data-sgn="dismiss">Got it</button></div>`;
    const el2 = old || Object.assign(document.createElement('section'), { id: 'sg-next', className: 'ac-banner sg-next' });
    if (el2.dataset.sig !== step.k) { el2.innerHTML = html; el2.dataset.sig = step.k; }
    el2.setAttribute('aria-label', 'Your next step');
    if (!el2.isConnected) hub.insertBefore(el2, hub.firstChild);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-sgn]'); if (!b) return;
    lsSet(NEXT, null); const card = $('#sg-next'); if (card) card.remove();
    if (b.dataset.sgn === 'project') { if (window.TribeLocalSetup) window.TribeLocalSetup.start(); else if (window.TribeApp && window.TribeApp.startFirst) window.TribeApp.startFirst(); }
    else if (b.dataset.sgn === 'invite' && window.TribeApp) window.TribeApp.openInvite();
  });

  // 3. Forgot password: ask, then the host's one-time code and a new password
  function forgotHtml() {
    const sent = !!opts.sent;
    return `<button class="sg-back" data-sg="login" aria-label="Back to Log in">${ico('i-chev', 16)}</button>
      <span class="eyebrow">Forgot password</span><h2 id="sg-title">${sent ? 'Ask your host for a code' : 'Get back in'}</h2>
      <p class="ac-lead">${sent ? 'Your host sees your request in Settings › Account › Password resets and can give you a one-time code. TribeCode doesn\'t send email yet.' : 'Tell us your username. Your host gives you a one-time code to set a new password.'}</p>
      <form id="sg-fp" class="sg-form" method="post" action="#" autocomplete="on" novalidate>
        <div class="sg-f"><label for="sg-fp-user">Username</label>
          <input class="input" id="sg-fp-user" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" required value="${esc(opts.username || '')}"></div>
        ${sent ? `<div class="sg-f"><label for="sg-code">Reset code</label>
          <input class="input sg-code" id="sg-code" name="one-time-code" type="text" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="9" placeholder="ABCD-EFGH" required></div>
        <div class="sg-f"><label for="sg-newpass">New password</label>
          <input class="input" id="sg-newpass" name="new-password" type="password" autocomplete="new-password" passwordrules="minlength: 8; maxlength: 200;" minlength="8" maxlength="200" required aria-describedby="sg-np-hint">
          <div class="sg-meter" id="sg-np-meter" data-score="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <p class="sg-hint" id="sg-np-hint" aria-live="polite">At least 8 characters.</p></div>` : ''}
        <p class="ac-err" id="sg-fp-err" role="alert" hidden></p>
        <button class="btn primary sg-go" id="sg-fp-go" type="submit">${sent ? 'Set new password' : 'Ask for a reset'}</button>
      </form>`;
  }
  function wireForgot() {
    const f = el.querySelector('#sg-fp'), err = f.querySelector('#sg-fp-err'), go = f.querySelector('#sg-fp-go'), u = f.querySelector('#sg-fp-user');
    const say = t => { err.textContent = t; err.hidden = !t; };
    const np = f.querySelector('#sg-newpass');
    if (np) np.addEventListener('input', () => { const st = strength(np.value, u.value), h = f.querySelector('#sg-np-hint'); f.querySelector('#sg-np-meter').dataset.score = String(np.value ? Math.max(1, st.score) : 0); h.textContent = np.value ? `${st.label}. ${st.tip}` : 'At least 8 characters.'; h.dataset.kind = !np.value ? '' : st.ok ? 'good' : 'bad'; });
    f.onsubmit = async e => {
      e.preventDefault(); say('');
      const username = norm(u.value); if (!validName(username)) { say('Type your username.'); u.focus(); return; }
      go.disabled = true;
      try {
        if (!opts.sent) { await A().api('/reset/request', { method: 'POST', body: { username } }); opts = { ...opts, username, sent: true }; draw(); setTimeout(() => { const c = el && el.querySelector('#sg-code'); if (c) c.focus(); }, 40); return; }
        const code = f.querySelector('#sg-code').value, password = np.value, st = strength(password, username);
        if (!st.ok) { say(`${st.label}. ${st.tip}`); go.disabled = false; np.focus(); return; }
        await A().api('/reset/complete', { method: 'POST', body: { username, code, password } });
        const r = await A().signIn(username, password);
        if (r === 'member') return;
        A().adopt({ id: r.id.split(':').pop(), username: r.username, displayName: r.name }, r.acct, '');
        close(); toast(`New password saved. Signed in as ${username}`);
      } catch (e2) { say(e2.message.replace(/^./, c => c.toUpperCase())); go.disabled = false; }
    };
    setTimeout(() => { if (el && !opts.sent) (u.value ? go : u).focus(); }, 40);
  }

  function onClick(e) {
    const b = e.target.closest('[data-sg]'); if (!b) return;
    const k = b.dataset.sg;
    if (k === 'close') close();
    else if (k === 'guest') { close(); if (A().mode() !== 'guest') A().guest(); }
    else if (k === 'create') open('create', opts);
    else if (k === 'start') open('start', {});
    else if (k === 'login') { close(); A().login(); }
  }

  // ---------- "Save your work" ----------
  const SEEN = 'tribecode.signup.nudged';
  const seen = () => { try { return JSON.parse(lsGet(SEEN) || '{}') || {}; } catch { return {}; } };
  const mark = m => { const s = seen(); s[m] = new Date().toISOString(); lsSet(SEEN, JSON.stringify(s)); };
  const COPY = {
    project: 'Your first project lives only on this device. An account keeps it, and you, when you switch devices.',
    invite: 'Friends can find you again on any device once you have an account.',
  };
  const busyUi = () => !!(el || $('#pz') || $('.ac-scrim') || [...document.querySelectorAll('.ph-sheet, .modal:not(.hidden)')].some(x => x.offsetParent !== null));
  async function nudge(moment) {
    if (!A() || !A().upgradable() || seen()[moment] || $('#sg-nudge')) return;
    if (!(await A().serverOn())) return;
    if (moment === 'invite') return inline();
    let tries = 0;
    const show = () => {
      if (!A().upgradable() || seen()[moment] || $('#sg-nudge')) return;
      if (busyUi() && tries++ < 90) return setTimeout(show, 1000);   // after the sheet that is open now (Where should it live?)
      mark(moment);
      const n = document.createElement('aside'); n.id = 'sg-nudge'; n.className = 'sg-nudge'; n.setAttribute('role', 'status'); n.setAttribute('aria-label', 'Save your work');
      n.innerHTML = `<span class="eyebrow">Save your work</span><b>Create an account</b><small>${esc(COPY[moment] || COPY.project)}</small>
        <div class="sg-n-acts"><button class="btn primary sm" data-sgu="go" id="sg-nudge-go">Create an account</button><button class="btn sm" data-sgu="later">Not now</button></div>`;
      n.addEventListener('click', e => { const b = e.target.closest('[data-sgu]'); if (!b) return; n.remove(); if (b.dataset.sgu === 'go') open('create', { upgrade: moment }); });
      document.body.appendChild(n);
    };
    show();
  }
  // In the invite sheet: one quiet line at the top, never in the way of the link
  function inline() {
    const body = $('#invite-body'), modal = $('#invite-modal'); if (!body || !modal || modal.classList.contains('hidden')) return;
    const put = () => {
      if (modal.classList.contains('hidden') || seen().inviteClosed || body.querySelector('#sg-inv')) return;
      const r = document.createElement('div'); r.id = 'sg-inv'; r.className = 'sg-inline';
      r.innerHTML = `<span><b>Save your work</b><small>${esc(COPY.invite)}</small></span><button class="btn sm" data-sgi="go">Create an account</button><button class="ac-x sg-inv-x" data-sgi="x" aria-label="Not now">${ico('i-x', 14)}</button>`;
      r.addEventListener('click', e => { const b = e.target.closest('[data-sgi]'); if (!b) return; const s = seen(); s.inviteClosed = new Date().toISOString(); lsSet(SEEN, JSON.stringify(s)); r.remove(); if (b.dataset.sgi === 'go') { modal.classList.add('hidden'); open('create', { upgrade: 'invite' }); } });
      body.prepend(r);
    };
    put();
    const mo = new MutationObserver(() => { if (modal.classList.contains('hidden')) mo.disconnect(); else put(); });
    mo.observe(body, { childList: true }); mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  // ---------- boot ----------
  addEventListener('tribe-project-created', () => setTimeout(() => nudge('project'), 1200));
  addEventListener('load', () => {
    const inv = $('#invite-modal');
    if (inv) new MutationObserver(() => { if (!inv.classList.contains('hidden')) nudge('invite'); }).observe(inv, { attributes: true, attributeFilter: ['class'] });
    const hub = $('#view-hub');
    if (hub) new MutationObserver(() => { if (lsGet(NEXT) && !hub.querySelector('#sg-next')) nextCard(); }).observe(hub, { childList: true });
    if (lsGet(NEXT)) nextCard();
    // so the menu and Log out know whether to offer an account: asked once a tribe answers, never before a home is chosen (setup-local's rule)
    const C = window.TribeClient, probe = () => { if (A() && A().upgradable()) A().serverOn(); };
    if (C && C.connected && C.connected()) probe(); else if (C && C.on) C.on('hello', probe);
    const q = new URLSearchParams(location.search).get('signup');
    if (q) setTimeout(() => open(q === 'create' ? 'create' : 'start'), 250);
  });

  window.TribeSignup = { open, close, nudge, strength, isOpen: () => !!el };
})();
