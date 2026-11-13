// feat/auth2 (docs/SIGNUP-FLOWS.md, docs/ACCOUNTS.md): the sign-in steps that come after a provider or an email link, the
// desktop app's own provider sign-in, and Settings › Account › Sign-in methods (plus the host's open sign-up and email).
//  * render(el, outcome, ctx)  a provider (or email link) came back with no account yet:
//      new         pick a username (suggested, editable, checked as you type), then signed in
//      invite      sign-up here is by invite: paste the code (and the username)
//      link-offer  an account already has that verified email: sign in to it once, then the provider is linked
//      account     signed in to an account (and the member it belongs to, when it has one in this tribe)
//  * desktopSignIn(p)  the desktop app opens the system browser; the host's page hands back a one-time code (a
//      tribecode://auth?code=… link, or 6 characters to type) that only this app can trade, with its PKCE verifier.
//  * emailForm(el)  "Email me a sign-in link" (only when the host set up email).
//  * settings(row)  Settings › Account: sign-in methods (link, unlink, never the last one) and, for the host on the host
//      computer, Open sign-up and Email (SMTP) with Send test email.
// Works in the app and on signin.html (no TribeClient there). Public: window.TribeAuth2.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => window.TribeClient, S = () => window.TribeStore, A = () => window.TribeAccounts, OA = () => window.TribeOAuth;
  const NAMES = { discord: 'Discord', github: 'GitHub', google: 'Google', apple: 'Apple' };
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : null);
  const desktop = () => !!(window.__TAURI__ || window.__TAURI_INTERNALS__) || /tauri\.localhost$/i.test(location.hostname);
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} } };
  function baseUrl() {
    const b = C() && C().base ? C().base() || '' : '';
    if (b && !/\.invalid(:\d+)?$/.test(b)) return b.replace(/\/+$/, '');
    return /^https?:$/.test(location.protocol) && !/tauri\.localhost$/i.test(location.hostname) ? location.origin : 'http://localhost:4747';
  }
  const norm = raw => String(raw == null ? '' : raw).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  const validName = u => u.length >= 2 && /^[\p{L}\p{N} ._-]+$/u.test(u);
  async function api(base, path, { method = 'GET', body, token } = {}) {
    const r = await fetch(base + '/api' + path, { method, credentials: 'omit', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(r.status === 429 && !d.code ? 'That is a lot of tries in a row. Take a breather and try again in a minute.' : (d.error || r.statusText || 'That did not work')), { status: r.status, code: d.code, data: d });
    return d;
  }
  const say = s => { const t = String(s || ''); return t ? t.replace(/^./, c => c.toUpperCase()) + (/[.!?]$/.test(t) ? '' : '.') : ''; };
  async function config(base = baseUrl()) { try { return await api(base, '/accounts/config'); } catch { return { on: false, openSignup: false, email: false }; } }

  // ---------- signed in: keep the account (and the member key) on this device ----------
  const KEY = 'tribecode.accounts.v1';
  function keep(d, base) {
    if (A() && A().adopt) { A().adopt(d.account, d.token, d.memberToken || ''); }
    else {
      let st = {}; try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
      st.accounts = Array.isArray(st.accounts) ? st.accounts : [];
      const id = `acct:${base}:${d.account.id}`;
      let a = st.accounts.find(x => x.id === id); if (!a) { a = { id, kind: 'server', tribes: [] }; st.accounts.unshift(a); }
      Object.assign(a, { name: d.account.displayName || d.account.username, username: d.account.username, color: a.color || '#F26B1D', acct: d.token, server: { url: base, token: d.memberToken || (a.server && a.server.token) || '' }, seen: new Date().toISOString() });
      st.current = id; st.mode = d.memberToken ? 'signedin' : 'account';
      try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
    }
    if (d.memberToken && S()) S().set({ name: d.account.displayName || d.account.username, ...(d.member && d.member.color ? { color: d.member.color } : {}), onboarded: true, server: { url: base, token: d.memberToken } });
    else if (S()) S().set({ name: d.account.displayName || d.account.username });
  }
  function enter(d, base, ctx = {}) {
    keep(d, base);
    if (ctx.onDone) return ctx.onDone(d);
    if (C() && d.memberToken) { location.reload(); return; }
    if (C()) { closeSheet(); toast(`Signed in as ${d.account.username}`); if (A() && A().paint) A().paint(); return; }
    location.replace('/');
  }

  // ---------- the steps after a provider (or an email link) ----------
  const providerName = d => d.providerName || NAMES[d.provider] || 'that account';
  function render(el, d, ctx = {}) {
    const base = ctx.base || baseUrl();
    if (!d || d.error) return;
    if (d.mode === 'account' || (d.account && d.token && !d.mode)) return enter(d, base, ctx);
    if (d.mode === 'new' || d.mode === 'invite' || d.need === 'username') return pickName(el, d, ctx, base);
    if (d.mode === 'link-offer') return linkOffer(el, d, ctx, base);
  }
  function head(eyebrow, title, lead) {
    return `<div class="eyebrow au-eye"><span class="dot"></span>${esc(eyebrow)}</div><h1 class="au-h" id="title">${esc(title)}</h1>${lead ? `<p class="lead au-lead">${lead}</p>` : ''}`;
  }
  function pickName(el, d, ctx, base) {
    const email = d.need === 'username', invite = d.mode === 'invite';
    const p = providerName(d);
    el.innerHTML = head(invite ? 'Ask for an invite' : 'New here', invite ? 'Sign-up here is by invite' : 'Pick your username',
      invite ? 'Ask the host or a friend for an invite code, then paste it here. Your username comes with it.'
        : email ? `Your email <b>${esc(d.email)}</b> is confirmed. Pick the name your friends will see; you can change it now.`
          : `${esc(p)} says you're <b>${esc(d.displayName || d.suggested)}</b>. Pick the username your friends will see; you can change it now.`) +
      `<form class="au-form" id="au-new" autocomplete="on" novalidate>
        ${invite ? `<label class="au-f">Invite code<input class="input" id="au-invite" name="invite" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="16" placeholder="From your invite link" required></label>` : ''}
        <label class="au-f">Username<input class="input" id="au-user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" value="${esc(d.suggested || '')}" required aria-describedby="au-user-hint"></label>
        <p class="au-hint" id="au-user-hint" aria-live="polite">2 to 32 letters, numbers, spaces, dots, dashes or underscores.</p>
        <div class="au-sugs" id="au-sugs" hidden></div>
        <p class="au-err" id="au-err" role="alert"></p>
        <button class="btn primary au-go" id="au-create" type="submit">${invite ? 'Join with this invite' : 'Create my account'}</button>
      </form>
      ${email ? '' : `<p class="au-alt">Already have an account? <button class="linkish" type="button" id="au-have">Sign in and link ${esc(p)}</button></p>`}`;
    const f = el.querySelector('#au-new'), u = f.querySelector('#au-user'), err = f.querySelector('#au-err'), hint = f.querySelector('#au-user-hint'), sugs = f.querySelector('#au-sugs');
    let seq = 0, t = null;
    const check = async () => {
      const v = norm(u.value), my = ++seq;
      if (!validName(v)) { hint.textContent = v.length < 2 ? 'At least 2 characters.' : 'Only letters, numbers, spaces, dots, dashes or underscores.'; hint.dataset.kind = 'bad'; return; }
      hint.textContent = 'Checking…'; hint.dataset.kind = 'wait';
      try {
        const r = await api(base, '/accounts/check?username=' + encodeURIComponent(v)); if (my !== seq) return;
        hint.textContent = r.available ? 'Available' : (r.suggestions || []).length ? 'Taken. These are free:' : 'Taken. Try another.'; hint.dataset.kind = r.available ? 'good' : 'bad';
        showSugs(r.available ? [] : r.suggestions || []);
      } catch { if (my === seq) { hint.textContent = 'Could not check that name right now.'; hint.dataset.kind = ''; } }
    };
    const showSugs = list => { sugs.innerHTML = list.map(x => `<button type="button" class="sg-sug" data-sug="${esc(x)}">${esc(x)}</button>`).join(''); sugs.hidden = !list.length; sugs.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { u.value = b.dataset.sug; check(); u.focus(); }); };
    u.addEventListener('input', () => { clearTimeout(t); t = setTimeout(check, 250); });
    if (u.value) check();
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = '';
      const username = norm(u.value); if (!validName(username)) { err.textContent = 'Pick a username of 2 to 32 letters, numbers, spaces, dots, dashes or underscores.'; u.focus(); return; }
      const inv = f.querySelector('#au-invite'), code = inv ? inv.value.trim().replace(/^.*\/join\//, '').replace(/[^A-Za-z0-9]/g, '') : undefined;
      if (inv && !code) { err.textContent = 'Paste the invite code first.'; inv.focus(); return; }
      const go = f.querySelector('#au-create'); go.disabled = true;
      try {
        const out = email ? await api(base, '/accounts/email/complete', { method: 'POST', body: { token: d.token, username, displayName: d.displayName || username } })
          : await api(base, '/accounts/oauth/confirm', { method: 'POST', body: { ticket: d.ticket, username, displayName: d.displayName || username, ...(code ? { invite: code } : {}) } });
        return enter(out, base, ctx);
      } catch (e2) {
        go.disabled = false;
        if (e2.code === 'invite' && !invite) return pickName(el, { ...d, mode: 'invite', suggested: username }, ctx, base);
        if (e2.code === 'taken') { hint.textContent = 'Someone has that username. These are free:'; hint.dataset.kind = 'bad'; showSugs((e2.data && e2.data.suggestions) || []); u.focus(); return; }
        err.innerHTML = esc(say(e2.message)) + (e2.status === 410 ? ` <a href="${ctx.restart || '/signin.html'}">Start again</a>` : '');
      }
    };
    const have = el.querySelector('#au-have'); if (have) have.onclick = () => linkOffer(el, { ...d, username: '' }, ctx, base);
    setTimeout(() => (f.querySelector('#au-invite') || u).focus(), 30);
  }
  // Sign in to the account first (password, or an email link), then the provider is linked to it
  function linkOffer(el, d, ctx, base) {
    const p = providerName(d);
    el.innerHTML = head('Link ' + p, d.username ? 'You already have an account' : 'Sign in to link ' + p,
      d.username ? `<b>${esc(d.email)}</b> belongs to <b>${esc(d.username)}</b>. Sign in to it once and we'll link ${esc(p)}, so either one signs you in next time. No second account.`
        : `Sign in to your TribeCode account and we'll link ${esc(p)} to it.`) +
      `<form class="au-form" id="au-link" autocomplete="on" novalidate>
        <label class="au-f">Username<input class="input" id="au-luser" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="40" value="${esc(d.username || '')}" required></label>
        <label class="au-f">Password<input class="input" id="au-lpass" name="password" type="password" autocomplete="current-password" maxlength="200" required></label>
        <p class="au-err" id="au-err" role="alert"></p>
        <button class="btn primary au-go" id="au-link-go" type="submit">Sign in and link ${esc(p)}</button>
      </form>
      <div id="au-mail-box"></div>
      <p class="au-alt">Forgot your password? <a href="/?signup=forgot">Reset it</a>${d.mode === 'link-offer' ? '' : ` · <button class="linkish" type="button" id="au-back">Make a new account instead</button>`}</p>`;
    const f = el.querySelector('#au-link'), err = f.querySelector('#au-err');
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = '';
      const username = norm(f.querySelector('#au-luser').value), password = f.querySelector('#au-lpass').value;
      if (!username || !password) { err.textContent = 'Type your username and password.'; return; }
      const go = f.querySelector('#au-link-go'); go.disabled = true;
      try {
        const s = await api(base, '/accounts/login', { method: 'POST', body: { username, password } });
        await api(base, '/accounts/oauth/link', { method: 'POST', token: s.token, body: { ticket: d.ticket } });
        return enter({ ...s }, base, ctx);
      } catch (e2) { go.disabled = false; err.innerHTML = esc(e2.status === 401 ? 'That username and password do not match. Try again, or use Forgot your password.' : say(e2.message)) + (e2.status === 410 ? ' <a href="/signin.html">Start again</a>' : ''); }
    };
    const back = el.querySelector('#au-back'); if (back) back.onclick = () => pickName(el, { ...d, mode: 'new' }, ctx, base);
    setTimeout(() => (d.username ? f.querySelector('#au-lpass') : f.querySelector('#au-luser')).focus(), 30);
  }

  // ---------- Email me a sign-in link ----------
  function emailForm(el, { base = baseUrl(), invite } = {}) {
    el.innerHTML = `<form class="au-form au-mail" id="au-mail" novalidate><label class="au-f">Email<input class="input" id="au-email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="you@example.com" required></label>
      <p class="au-err" id="au-mail-err" role="alert"></p><button class="btn au-go" id="au-mail-go" type="submit">Email me a sign-in link</button></form>`;
    const f = el.querySelector('#au-mail'), err = f.querySelector('#au-mail-err');
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = '';
      const email = f.querySelector('#au-email').value.trim();
      if (!/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(email)) { err.textContent = 'That address looks off. Check it and try again.'; return; }
      f.querySelector('#au-mail-go').disabled = true;
      try {
        await api(base, '/accounts/email/request', { method: 'POST', body: { email, ...(invite ? { invite } : {}) } });
        el.innerHTML = `<div class="au-sent" id="au-sent"><b>Check your email.</b> If <b>${esc(email)}</b> can sign in or sign up here, a link is on its way. It works once, for 15 minutes. Nothing there? Check spam, or try again in a minute.</div>`;
      } catch (e2) { f.querySelector('#au-mail-go').disabled = false; err.textContent = e2.code === 'no-email' ? "This TribeCode doesn't send email. Sign in with a password or a provider, or ask your host." : say(e2.message); }
    };
  }

  // ---------- the desktop app: provider sign-in through the system browser ----------
  const PK = 'tribecode.auth.desktop';
  const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let sheetEl = null;
  function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
  function sheet(inner) {
    closeSheet();
    sheetEl = document.createElement('div'); sheetEl.className = 'ac-scrim au-scrim'; sheetEl.id = 'au-sheet';
    sheetEl.innerHTML = `<div class="ac-sheet au-sheet" role="dialog" aria-modal="true" aria-labelledby="title"><button class="ac-x" data-au="close" aria-label="Close"><svg class="i" style="width:16px;height:16px" aria-hidden="true"><use href="#i-x"/></svg></button><div id="au-body">${inner}</div></div>`;
    sheetEl.addEventListener('click', e => { if (e.target === sheetEl || e.target.closest('[data-au="close"]')) { ss.set(PK, null); closeSheet(); } });
    document.body.appendChild(sheetEl);
    return sheetEl.querySelector('#au-body');
  }
  function openExternal(url) {
    try { const sh = window.__TAURI__ && window.__TAURI__.shell; if (sh && sh.open) return sh.open(url); } catch {}
    window.open(url, '_blank', 'noopener');
  }
  const acctToken = () => { const a = A() && A().current && A().current(); return a && a.acct || ''; };
  async function desktopSignIn(p, mode = 'signin') {
    const base = baseUrl();
    if (!(window.crypto && crypto.subtle)) { toast('This window cannot sign in with a provider. Update TribeCode, or sign in with a password.'); return; }
    const v = b64(crypto.getRandomValues(new Uint8Array(32)));
    const ch = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
    let d; try { d = await api(base, `/oauth/${encodeURIComponent(p)}/start`, { method: 'POST', token: mode === 'account' ? acctToken() : '', body: { mode, desktop: { challenge: ch, method: 'S256' } } }); }
    catch (e) { toast(say(e.message)); return; }
    ss.set(PK, JSON.stringify({ v, base, p, mode, at: Date.now() }));
    openExternal(d.url);
    codeSheet(p);
  }
  function codeSheet(p, msg) {
    const body = sheet(`<span class="eyebrow">Sign in with ${esc(NAMES[p] || p)}</span><h2 id="title">Finish in your browser</h2>
      <p class="ac-lead">We opened ${esc(NAMES[p] || p)} in your browser. When it says <b>Return to TribeCode</b>, click it and you're in. If nothing happens, type the 6-character code it shows.</p>
      <form class="au-form" id="au-code-form" novalidate><label class="au-f">Code from the browser<input class="input au-code" id="au-code" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="7" placeholder="ABC123"></label>
        <p class="au-err" id="au-err" role="alert">${esc(msg || '')}</p>
        <div class="au-row"><button class="btn" type="button" id="au-again">Start again</button><button class="btn primary" type="submit" id="au-code-go">Continue</button></div></form>`);
    const f = body.querySelector('#au-code-form');
    f.onsubmit = e => { e.preventDefault(); const v = f.querySelector('#au-code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (v.length !== 6) { f.querySelector('#au-err').textContent = 'The code has 6 letters and numbers.'; return; } exchange({ short: v }); };
    body.querySelector('#au-again').onclick = () => desktopSignIn(p, (JSON.parse(ss.get(PK) || '{}') || {}).mode || 'signin');
    setTimeout(() => { const i = body.querySelector('#au-code'); if (i) i.focus(); }, 30);
  }
  async function exchange(what) {
    let pend = null; try { pend = JSON.parse(ss.get(PK) || 'null'); } catch {}
    if (!pend || Date.now() - pend.at > 10 * 60_000) { toast('Start the sign-in from TribeCode first.'); return; }
    let d;
    try { d = await api(pend.base, '/oauth/desktop/exchange', { method: 'POST', token: pend.mode === 'account' ? acctToken() : '', body: { ...what, verifier: pend.v } }); }
    catch (e) {
      const m = e.code === 'expired' ? 'That code ran out or was already used (codes last 2 minutes). Choose Start again.' : e.code === 'mismatch' ? 'That code belongs to another sign-in. Choose Start again.' : say(e.message);
      return codeSheet(pend.p, m);
    }
    ss.set(PK, null);
    if (d.mode === 'account-link') { closeSheet(); toast(`${d.providerName} is linked`); return; }
    if (d.token && d.member && !d.account) {   // a member of this tribe: their own device key for this app
      S().set({ name: d.member.name, color: d.member.color, server: { url: pend.base, token: d.token } });
      try { const a = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; a.mode = 'signedin'; localStorage.setItem(KEY, JSON.stringify(a)); } catch {}
      location.reload(); return;
    }
    if (d.mode === 'account') return enter(d, pend.base);
    render(sheet(''), d, { base: pend.base });
  }
  // tribecode://auth?code=… (app.js forwards it here)
  function deepLink(u) {
    const m = /[?&]code=([A-Za-z0-9_-]{20,80})(?:&|$)/.exec(String(u || ''));
    if (m) exchange({ code: m[1] }); else toast('That sign-in link is not complete. Type the 6-character code instead.');
  }

  // ---------- Settings › Account: sign-in methods, and the host's sign-in settings ----------
  async function settings(row) {
    if (!row || !row.parentNode) return;
    const base = baseUrl(), a = A() && A().current && A().current(), mode = A() && A().mode ? A().mode() : '';
    const cfg = await config(base); if (!cfg.on || !row.parentNode) return;
    if (a && a.kind === 'server' && a.acct && mode !== 'signedout') methodsRow(row, a, base, cfg);
    const me = C() && (C().state() || {}).me;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || desktop();
    if (me && me.role === 'host' && local && C().hasToken()) hostRow(row, base);
  }
  async function methodsRow(row, a, base, cfg) {
    let d, provs = [];
    try { [d, provs] = await Promise.all([api(base, '/accounts/methods', { token: a.acct }), api(base, '/oauth/providers').then(x => x.providers || []).catch(() => [])]); } catch { return; }
    if (!row.parentNode) return;
    let el = row.parentNode.querySelector('#set-methods');
    if (!el) { el = document.createElement('div'); el.className = 'set-row au-methods'; el.id = 'set-methods'; row.after(el); }
    const list = d.methods || [], linked = new Set(list.filter(m => m.kind === 'provider').map(m => m.provider)), only = list.filter(m => m.kind !== 'email' || m.usable).length <= 1;
    const glyph = p => (OA() ? OA().glyph(p) : '');
    const item = m => `<li data-m="${esc(m.id)}"><span>${m.kind === 'provider' ? glyph(m.provider) : ''}<b>${esc(m.kind === 'password' ? 'Password' : m.kind === 'email' ? 'Email link' : NAMES[m.provider] || m.provider)}</b><small>${esc(m.kind === 'email' ? m.address + (m.usable ? '' : ' · email is off on this TribeCode') : m.kind === 'provider' ? (m.name ? 'as ' + m.name : 'linked') : 'set')}</small></span>
      <button class="btn sm" data-unlink="${esc(m.id)}" ${only ? 'disabled title="Keep at least one way to sign in"' : ''}>${m.kind === 'provider' ? 'Unlink' : 'Remove'}</button></li>`;
    el.innerHTML = `<div class="set-l"><b>Sign-in methods</b><small>${only ? 'Add another way in before removing this one.' : 'Any of these signs you in to ' + esc(a.username || a.name) + '.'}</small></div>
      <ul class="ac-ses au-mlist">${list.map(item).join('')}</ul>
      <div class="au-mlinks">${provs.filter(p => !linked.has(p.id)).map(p => `<button class="btn sm" data-link="${esc(p.id)}">${glyph(p.id)}Link ${esc(p.name)}</button>`).join('')}${list.some(m => m.kind === 'password') ? '' : '<button class="btn sm" data-setpw>Set a password</button>'}</div>`;
    el.querySelectorAll('[data-unlink]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await api(base, '/accounts/methods/' + encodeURIComponent(b.dataset.unlink), { method: 'DELETE', token: a.acct }); toast('Removed'); methodsRow(row, a, base, cfg); }
      catch (e) { toast(e.code === 'last' ? 'Keep at least one way to sign in. Add another one first.' : say(e.message)); b.disabled = false; }
    });
    el.querySelectorAll('[data-link]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      if (desktop()) return desktopSignIn(b.dataset.link, 'account');
      try { const r = await api(base, `/oauth/${encodeURIComponent(b.dataset.link)}/start`, { method: 'POST', token: a.acct, body: { mode: 'account' } }); ss.set('tribecode.oauth.acct', a.acct); location.assign(r.url); }
      catch (e) { toast(say(e.message)); b.disabled = false; }
    });
    const sp = el.querySelector('[data-setpw]'); if (sp) sp.onclick = () => {
      sp.outerHTML = `<form class="au-inline" id="au-setpw"><input class="input" type="password" id="au-newpw" autocomplete="new-password" minlength="8" maxlength="200" placeholder="A new password" aria-label="New password"><button class="btn sm primary" type="submit">Save</button></form>`;
      const f = el.querySelector('#au-setpw'); f.querySelector('input').focus();
      f.onsubmit = async e => { e.preventDefault(); try { await api(base, '/accounts/password', { method: 'POST', token: a.acct, body: { password: f.querySelector('input').value } }); toast('Password saved'); methodsRow(row, a, base, cfg); } catch (e2) { toast(say(e2.message)); } };
    };
  }
  async function hostRow(row, base) {
    const tok = (S().get().server || {}).token || '';
    let d; try { d = await api(base, '/accounts/admin/settings', { token: tok }); } catch { return; }
    if (!row.parentNode) return;
    let el = row.parentNode.querySelector('#set-signin-host');
    if (!el) { el = document.createElement('div'); el.className = 'set-row au-host'; el.id = 'set-signin-host'; (row.parentNode.querySelector('#set-methods') || row).after(el); }
    const s = d.smtp;
    el.innerHTML = `<div class="set-l"><b>Who can sign up</b><small>${d.openSignup ? 'Anyone who reaches this TribeCode can make an account. They join tribes with an invite.' : 'Only people with an invite code can make an account. Everyone else sees “Ask for an invite”.'}</small></div>
      <div class="set-c"><button class="toggle set-toggle" role="switch" id="au-open" aria-label="Open sign-up" aria-checked="${!!d.openSignup}"><span>Open sign-up</span><span class="switch"></span></button></div>
      <details class="au-smtp" id="au-smtp"${s.on ? '' : ''}><summary><b>Email</b><span class="oa-st ${s.on ? 'on' : ''}">${s.on ? 'On' : 'Off'}</span></summary>
        <p class="au-hint">${s.on ? 'Sign-in links, sign-up links and password resets go out by email.' : "Off: TribeCode sends no email. Password resets use a one-time code you make here. Add an SMTP server to send sign-in links and resets."}</p>
        <form class="au-form au-grid" id="au-smtp-form" autocomplete="off">
          <label class="au-f">SMTP server<input class="input" data-s="host" value="${esc(s.host)}" placeholder="smtp.example.com" spellcheck="false"></label>
          <label class="au-f au-port">Port<input class="input" data-s="port" inputmode="numeric" value="${esc(s.port)}"></label>
          <label class="au-f">Security<select class="input" data-s="secure"><option value="starttls"${s.secure === 'starttls' ? ' selected' : ''}>STARTTLS (587)</option><option value="tls"${s.secure === 'tls' ? ' selected' : ''}>TLS (465)</option><option value="none"${s.secure === 'none' ? ' selected' : ''}>None (this computer only)</option></select></label>
          <label class="au-f">Username<input class="input" data-s="user" value="${esc(s.user)}" autocomplete="off" spellcheck="false"></label>
          <label class="au-f">Password<input class="input" type="password" data-s="pass" placeholder="${s.hasPass ? 'Saved. Type to replace it' : 'App password'}" autocomplete="new-password"></label>
          <label class="au-f">From<input class="input" data-s="from" value="${esc(s.from)}" placeholder="TribeCode &lt;tribe@example.com&gt;" spellcheck="false"></label>
          <div class="au-row"><button class="btn primary sm" type="submit">Save email</button>${s.host ? '<button class="btn sm" type="button" data-smtp="off">Turn off</button>' : ''}</div>
        </form>
        ${s.on ? `<form class="au-inline" id="au-test"><input class="input" type="email" id="au-test-to" placeholder="Send a test to…" aria-label="Test email address"><button class="btn sm" type="submit" id="au-test-go">Send test email</button></form>` : ''}
      </details>`;
    const sw = el.querySelector('#au-open');
    sw.onclick = async () => { const on = sw.getAttribute('aria-checked') !== 'true'; try { await api(base, '/accounts/admin/settings', { method: 'PUT', token: tok, body: { openSignup: on } }); toast(on ? 'Open sign-up is on' : 'Sign-up is by invite now'); hostRow(row, base); } catch (e) { toast(say(e.message)); } };
    const f = el.querySelector('#au-smtp-form'), v = k => f.querySelector(`[data-s="${k}"]`).value.trim();
    f.onsubmit = async e => {
      e.preventDefault();
      try { await api(base, '/accounts/admin/settings', { method: 'PUT', token: tok, body: { smtp: { host: v('host'), port: Number(v('port')) || 587, secure: v('secure'), user: v('user'), from: v('from'), ...(v('pass') ? { pass: f.querySelector('[data-s="pass"]').value } : {}) } } }); toast('Email settings saved'); await hostRow(row, base); const dd = row.parentNode && row.parentNode.querySelector('#au-smtp'); if (dd) dd.open = true; }
      catch (e2) { toast(say(e2.message)); }
    };
    const off = el.querySelector('[data-smtp="off"]'); if (off) off.onclick = async () => { try { await api(base, '/accounts/admin/settings', { method: 'PUT', token: tok, body: { smtp: null } }); toast('Email is off'); hostRow(row, base); } catch (e) { toast(say(e.message)); } };
    const t = el.querySelector('#au-test'); if (t) t.onsubmit = async e => {
      e.preventDefault(); const b = t.querySelector('#au-test-go'); b.disabled = true; b.textContent = 'Sending…';
      try { await api(base, '/accounts/admin/smtp-test', { method: 'POST', token: tok, body: { to: t.querySelector('#au-test-to').value.trim() } }); toast('Test email sent. Check that inbox.'); b.textContent = 'Sent'; }
      catch (e2) { toast(say(e2.message)); b.textContent = 'Send test email'; b.disabled = false; }
    };
  }

  window.TribeAuth2 = { config, render, enter, emailForm, desktopSignIn, deepLink, exchange, settings, closeSheet, desktop, api };
})();
