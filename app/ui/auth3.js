// feat/auth3 (docs/ACCOUNTS.md › Two-step sign-in and passkeys, docs/SIGNUP-FLOWS.md): the second step of a sign-in,
// passkeys, and their settings.
//  * challenge(d, base)   a sign-in answered { need: 'two-step', ticket }: a trusted device passes silently, otherwise a
//      small sheet asks for the 6-digit code (or a recovery code, or a passkey) with "Trust this device for 30 days".
//      Resolves with the sign-in the ticket stood for. auth2.js, accounts.js and oauth.js call it from their one fetch
//      helper, so every way in (password, provider, email link, reset, the desktop handoff) gets the same step.
//  * enrolRequired(d, base)   the host requires two-step for admins and this admin has none: turn it on now, then the
//      tribe key arrives.
//  * passkeyButton(el, { base, onDone })   "Sign in with a passkey" (Log in, signin.html), or one plain line where the
//      browser can't offer passkeys (plain http on a network address, an IP address, the desktop app on a Mac).
//  * Settings › Account & sign-in: Two-step sign-in (QR from qr.js, the secret, confirm, ten recovery codes to copy or
//      download; turn off with a current code; new recovery codes; forget trusted devices) and Passkeys (add, rename,
//      remove, never the last way in). Settings › Tribe & admin: Require two-step for admins (the host, on the host computer).
// Works in the app and on signin.html / join.html (no TribeClient there). Public: window.TribeAuth3.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => window.TribeClient, S = () => window.TribeStore, A = () => window.TribeAccounts;
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : null);
  const say = s => { const t = String(s || ''); return t ? t.replace(/^./, c => c.toUpperCase()) + (/[.!?]$/.test(t) ? '' : '.') : ''; };
  const desktop = () => !!(window.__TAURI__ || window.__TAURI_INTERNALS__) || /tauri\.localhost$/i.test(location.hostname);
  function baseUrl() {
    const b = C() && C().base ? C().base() || '' : '';
    if (b && !/\.invalid(:\d+)?$/.test(b)) return b.replace(/\/+$/, '');
    return /^https?:$/.test(location.protocol) && !/tauri\.localhost$/i.test(location.hostname) ? location.origin : 'http://localhost:4747';
  }
  // our own fetch (never the hooked helpers: a challenge inside a challenge would loop)
  async function call(base, path, { method = 'GET', body, token } = {}) {
    const r = await fetch(base + '/api' + path, { method, credentials: 'omit', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(r.status === 429 && !d.code ? 'That is a lot of tries in a row. Take a breather and try again in a minute.' : (d.error || r.statusText || 'That did not work')), { status: r.status, code: d.code, data: d });
    return d;
  }
  const KEY_SVG = '<svg class="a3-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="m16 7 3 3"/></svg>';

  // ---------- this device's trust tokens (one per address and username; the server keeps only their hash) ----------
  const TRUST = 'tribecode.trust.v1';
  const trustAll = () => { try { return JSON.parse(localStorage.getItem(TRUST) || '{}') || {}; } catch { return {}; } };
  const trustKey = (base, user) => base + '|' + String(user || '').toLowerCase();
  const trustGet = k => trustAll()[k] || '';
  const trustSet = (k, v) => { const x = trustAll(); if (v) x[k] = v; else delete x[k]; try { localStorage.setItem(TRUST, JSON.stringify(x)); } catch {} };

  // ---------- passkeys in the browser ----------
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  // Can this page have passkeys? -> { ok } or { ok: false, why } in plain words
  function available() {
    const h = location.hostname, local = h === 'localhost' || /\.localhost$/.test(h);
    if (!/^https?:$/.test(location.protocol)) return { ok: false, why: 'Passkeys aren\'t available in this window. Open TribeCode in a browser at its https address, or at http://localhost on the host computer.' };
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[')) return { ok: false, why: `Passkeys aren't available at ${location.host}: browsers only offer them at a named, secure address. Open TribeCode at its https address, or at http://localhost on the host computer.` };
    if (location.protocol === 'http:' && !local) return { ok: false, why: `Passkeys aren't available at ${location.host}: it is plain http on the network. Open TribeCode at its https address, or at http://localhost on the host computer.` };
    if (!window.PublicKeyCredential || !navigator.credentials || window.isSecureContext === false) return { ok: false, why: 'This browser doesn\'t offer passkeys here. Use a password or a code instead.' };
    return { ok: true };
  }
  const pkError = e => (e && (e.name === 'NotAllowedError' || e.name === 'AbortError') ? 'No passkey was used. Try again when you\'re ready.' : e && e.name === 'InvalidStateError' ? 'That passkey is already on this account.' : e && e.name === 'SecurityError' ? 'The browser won\'t use a passkey at this address.' : say(e && e.message));
  async function getAssertion(base, ticket) {
    const { publicKey: pk } = await call(base, '/accounts/passkey/start', { method: 'POST', body: ticket ? { ticket } : {} });
    const cred = await navigator.credentials.get({ publicKey: { challenge: unb64(pk.challenge), rpId: pk.rpId, timeout: pk.timeout, userVerification: pk.userVerification, allowCredentials: (pk.allowCredentials || []).map(c => ({ ...c, id: unb64(c.id) })) } });
    const r = cred.response;
    return { id: cred.id, type: cred.type, response: { clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.authenticatorData), signature: b64(r.signature), userHandle: r.userHandle && r.userHandle.byteLength ? b64(r.userHandle) : '' } };
  }
  async function passkeySignIn(base = baseUrl()) {
    const credential = await getAssertion(base);
    return call(base, '/accounts/passkey/finish', { method: 'POST', body: { credential } });
  }
  async function addPasskey(base, token, name) {
    const { publicKey: pk } = await call(base, '/accounts/passkeys/options', { method: 'POST', token, body: {} });
    const cred = await navigator.credentials.create({ publicKey: { ...pk, challenge: unb64(pk.challenge), user: { ...pk.user, id: unb64(pk.user.id) }, excludeCredentials: (pk.excludeCredentials || []).map(c => ({ ...c, id: unb64(c.id) })) } });
    const r = cred.response;
    return call(base, '/accounts/passkeys', { method: 'POST', token, body: { name, credential: { id: cred.id, type: cred.type, response: { clientDataJSON: b64(r.clientDataJSON), attestationObject: b64(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] } } } });
  }
  // "Sign in with a passkey", or the plain line where passkeys can't work
  function passkeyButton(el, { base = baseUrl(), onDone, quiet = false } = {}) {
    if (!el) return;
    const av = available();
    if (!av.ok) { el.innerHTML = quiet ? '' : `<p class="a3-note" id="a3-pk-off">${esc(av.why)}</p>`; return; }
    el.innerHTML = `<button class="btn a3-pk" type="button" id="a3-passkey">${KEY_SVG}<span>Sign in with a passkey</span></button><p class="a3-err" id="a3-pk-err" role="alert"></p>`;
    const b = el.querySelector('#a3-passkey'), err = el.querySelector('#a3-pk-err');
    b.onclick = async () => {
      err.textContent = ''; b.disabled = true;
      try { const d = await passkeySignIn(base); if (onDone) onDone(d); else if (window.TribeAuth2) window.TribeAuth2.enter(d, base); }
      catch (e) { err.textContent = e.name ? pkError(e) : e.code === 'unknown' ? 'That passkey isn\'t on an account here. Sign in another way, then add it in Settings.' : say(e.message); b.disabled = false; }
    };
  }

  // ---------- the second step ----------
  let stepEl = null;
  function closeStep() { if (stepEl) { stepEl.remove(); stepEl = null; } }
  function sheet(id, inner) {
    const el = document.createElement('div'); el.className = 'a3-scrim'; el.id = id;
    el.innerHTML = `<div class="a3-sheet" role="dialog" aria-modal="true" aria-labelledby="a3-title">${inner}</div>`;
    document.body.appendChild(el); return el;
  }
  async function challenge(d, base = baseUrl()) {
    const tk = trustKey(base, d.username), t = trustGet(tk);
    if (t) {   // a trusted device: no code
      try { return await call(base, '/accounts/two-step', { method: 'POST', body: { ticket: d.ticket, trust: t } }); }
      catch (e) { if (e.code === 'untrusted') trustSet(tk, ''); else if (e.status === 410) throw e; }
    }
    return new Promise((resolve, reject) => {
      closeStep();
      const pkOk = d.methods && d.methods.passkey && available().ok;
      stepEl = sheet('a3-step', `<span class="a3-eye">Two-step sign-in</span><h2 id="a3-title">Type your code</h2>
        <p class="a3-lead" id="a3-lead">Open your authenticator app and type the 6-digit code for <b>${esc(d.username || 'your account')}</b>.</p>
        <form class="a3-form" id="a3-form" novalidate autocomplete="off">
          <input class="input a3-code" id="a3-code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" aria-label="6-digit code">
          <label class="a3-check"><input type="checkbox" id="a3-remember"><span>Trust this device for 30 days</span></label>
          <p class="a3-err" id="a3-err" role="alert"></p>
          <div class="a3-row"><button class="btn" type="button" id="a3-cancel">Cancel</button><button class="btn primary" type="submit" id="a3-go">Continue</button></div>
        </form>
        <p class="a3-alt"><button class="linkish" type="button" id="a3-swap">Use a recovery code</button>${pkOk ? ' · <button class="linkish" type="button" id="a3-use-pk">Use a passkey</button>' : ''}</p>`);
      const el = stepEl, f = el.querySelector('#a3-form'), inp = el.querySelector('#a3-code'), err = el.querySelector('#a3-err'), go = el.querySelector('#a3-go');
      let rec = false;
      const done = out => { if (out.trust) trustSet(tk, out.trust); if (typeof out.recoveryLeft === 'number') toast(out.recoveryLeft ? `${out.recoveryLeft} recovery code${out.recoveryLeft === 1 ? '' : 's'} left. Make new ones in Settings when you're low.` : 'That was your last recovery code. Make new ones in Settings.'); cleanup(); resolve(out); };
      const stop = e => { cleanup(); reject(e); };
      const onKey = e => { if (e.key === 'Escape' && stepEl === el) { e.stopPropagation(); stop(Object.assign(new Error('Sign-in cancelled'), { code: 'cancelled' })); } };
      function cleanup() { document.removeEventListener('keydown', onKey, true); if (stepEl === el) closeStep(); else el.remove(); }
      document.addEventListener('keydown', onKey, true);
      el.querySelector('#a3-cancel').onclick = () => stop(Object.assign(new Error('Sign-in cancelled'), { code: 'cancelled' }));
      el.querySelector('#a3-swap').onclick = e => {
        rec = !rec; err.textContent = ''; inp.value = '';
        el.querySelector('#a3-title').textContent = rec ? 'Use a recovery code' : 'Type your code';
        el.querySelector('#a3-lead').innerHTML = rec ? 'Type one of the recovery codes you saved when you turned on two-step sign-in. Each one works once.' : `Open your authenticator app and type the 6-digit code for <b>${esc(d.username || 'your account')}</b>.`;
        inp.maxLength = rec ? 12 : 7; inp.placeholder = rec ? 'XXXXX-XXXXX' : '000000'; inp.setAttribute('inputmode', rec ? 'text' : 'numeric'); inp.setAttribute('aria-label', rec ? 'Recovery code' : '6-digit code'); inp.classList.toggle('a3-rec', rec);
        e.currentTarget.textContent = rec ? 'Use a code from my app' : 'Use a recovery code'; inp.focus();
      };
      const pk = el.querySelector('#a3-use-pk');
      if (pk) pk.onclick = async () => {
        err.textContent = ''; pk.disabled = true;
        try { const credential = await getAssertion(base, d.ticket); done(await call(base, '/accounts/passkey/finish', { method: 'POST', body: { credential, ticket: d.ticket, remember: el.querySelector('#a3-remember').checked } })); }
        catch (e) { pk.disabled = false; if (e.status === 410) return stop(Object.assign(new Error('That sign-in ran out. Start again.'), { status: 410 })); err.textContent = e.name && !e.status ? pkError(e) : say(e.message); }
      };
      f.onsubmit = async e => {
        e.preventDefault(); err.textContent = '';
        const v = inp.value.trim();
        if (rec ? v.replace(/[^A-Za-z0-9]/g, '').length !== 10 : v.replace(/\D/g, '').length !== 6) { err.textContent = rec ? 'A recovery code has 10 letters and numbers.' : 'The code has 6 digits.'; inp.focus(); return; }
        go.disabled = true;
        try { done(await call(base, '/accounts/two-step', { method: 'POST', body: { ticket: d.ticket, ...(rec ? { recovery: v } : { code: v }), remember: el.querySelector('#a3-remember').checked } })); }
        catch (e2) {
          go.disabled = false;
          if (e2.status === 410 || (e2.data && e2.data.left === 0)) return stop(Object.assign(new Error(e2.status === 410 ? 'That sign-in ran out. Start again.' : 'Too many wrong codes. Start the sign-in again.'), { status: 410 }));
          err.textContent = say(e2.message); inp.select();
        }
      };
      setTimeout(() => inp.focus(), 30);
    });
  }

  // ---------- turning it on: the QR, the secret, one code, then the recovery codes ----------
  function recoveryHtml(list) {
    return `<div class="a3-recs" id="a3-recs" aria-label="Recovery codes">${list.map(c => `<code>${esc(c)}</code>`).join('')}</div>
      <div class="a3-row a3-row-l"><button class="btn sm" type="button" data-a3="copy-recs">Copy</button><button class="btn sm" type="button" data-a3="dl-recs">Download</button></div>`;
  }
  function wireRecovery(root, list, username) {
    const text = `TribeCode recovery codes for ${username}\nEach code works once. Keep them somewhere safe.\n\n${list.join('\n')}\n`;
    const c = root.querySelector('[data-a3="copy-recs"]'), dl = root.querySelector('[data-a3="dl-recs"]');
    if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(list.join('\n')); c.textContent = 'Copied'; } catch { c.textContent = 'Select and copy them'; } };
    if (dl) dl.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = 'tribecode-recovery-codes.txt'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  }
  // host: the box to draw in. token: the account session. Resolves the confirm answer ({ recovery, member?, memberToken? }) or null.
  function enrol(host, base, token, username, { onDone, lead } = {}) {
    host.innerHTML = '<p class="a3-note">One moment…</p>';
    call(base, '/accounts/two-step/setup', { method: 'POST', token, body: {} }).then(s => {
      const qr = window.TribeQR ? window.TribeQR.svg(s.uri) : '';
      host.innerHTML = `<div class="a3-enrol" id="a3-enrol">${lead ? `<p class="a3-lead">${esc(lead)}</p>` : ''}
        <ol class="a3-steps"><li><b>Scan this</b> with an authenticator app (Google Authenticator, 1Password, Authy, your phone's built-in one).</li></ol>
        <div class="a3-qrrow">${qr ? `<div class="a3-qr qr" id="a3-qr">${qr}</div>` : ''}<div class="a3-secret"><span class="a3-eye">Or type this key</span><code id="a3-secret">${esc(s.secret.replace(/(.{4})/g, '$1 ').trim())}</code><button class="btn sm" type="button" id="a3-copy-secret">Copy key</button></div></div>
        <form class="a3-form a3-confirm" id="a3-confirm" novalidate autocomplete="off"><label class="a3-f" for="a3-first"><b>Then type the 6-digit code</b> the app shows</label>
          <div class="a3-inline"><input class="input a3-code" id="a3-first" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000"><button class="btn primary" type="submit" id="a3-confirm-go">Turn on</button><button class="btn" type="button" id="a3-enrol-cancel">Cancel</button></div>
          <p class="a3-err" id="a3-enrol-err" role="alert"></p></form></div>`;
      const f = host.querySelector('#a3-confirm'), err = host.querySelector('#a3-enrol-err');
      host.querySelector('#a3-copy-secret').onclick = async e => { try { await navigator.clipboard.writeText(s.secret); e.currentTarget.textContent = 'Copied'; } catch {} };
      host.querySelector('#a3-enrol-cancel').onclick = () => onDone && onDone(null);
      f.onsubmit = async e => {
        e.preventDefault(); err.textContent = '';
        const code = host.querySelector('#a3-first').value.replace(/\D/g, ''); if (code.length !== 6) { err.textContent = 'The code has 6 digits.'; return; }
        host.querySelector('#a3-confirm-go').disabled = true;
        try {
          const out = await call(base, '/accounts/two-step/confirm', { method: 'POST', token, body: { code } });
          host.innerHTML = `<div class="a3-enrol a3-done" id="a3-recovery"><p class="a3-lead"><b>Two-step sign-in is on.</b> Save these ten recovery codes now: each one signs you in once if you lose your phone. They are shown only this time.</p>
            ${recoveryHtml(out.recovery)}<div class="a3-row"><button class="btn primary" type="button" id="a3-saved">I saved them</button></div></div>`;
          wireRecovery(host, out.recovery, username);
          host.querySelector('#a3-saved').onclick = () => onDone && onDone(out);
        } catch (e2) { host.querySelector('#a3-confirm-go').disabled = false; err.textContent = say(e2.message); }
      };
      setTimeout(() => { const i = host.querySelector('#a3-first'); if (i) i.focus({ preventScroll: true }); }, 30);
    }, e => { host.innerHTML = `<p class="a3-err">${esc(say(e.message))}</p>`; });
  }
  // The host requires two-step for admins: this sign-in has the account but not the tribe key yet.
  function enrolRequired(d, base = baseUrl()) {
    return new Promise(resolve => {
      const el = sheet('a3-required', `<span class="a3-eye">Two-step sign-in</span><h2 id="a3-title">Admins here use two-step sign-in</h2><div id="a3-req-body"></div>`);
      const finish = out => { el.remove(); if (out && out.memberToken) resolve({ ...d, member: out.member, memberToken: out.memberToken, twoStep: undefined }); else { toast('You\'re signed in to your account. Turn on two-step sign-in in Settings to open the tribe as an admin.'); resolve(d); } };
      enrol(el.querySelector('#a3-req-body'), base, d.token, d.account.username, { onDone: finish, lead: 'The host asks every admin to turn on two-step sign-in. It takes a minute, and then you\'re in.' });
    });
  }
  // The one hook the fetch helpers call with every answer
  function after(d, base) {
    if (d && d.need === 'two-step' && d.ticket) return challenge(d, base);
    if (d && d.twoStep && d.twoStep.required && d.token && d.account) return enrolRequired(d, base);
    return d;
  }

  // ---------- Settings › Account & sign-in ----------
  const acct = () => { const a = A() && A().current && A().current(), m = A() && A().mode ? A().mode() : ''; return a && a.kind === 'server' && a.acct && m !== 'signedout' ? a : null; };
  const when = t => { try { return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } };
  async function settings(el) {
    const a = acct(), base = baseUrl();
    if (!a) { el.innerHTML = '<p class="set-note a3-setnote" id="a3-noacct">Two-step sign-in and passkeys protect a TribeCode account. Log in to one, or create one, and they appear here.</p>'; return; }
    let st, keys;
    try { [st, keys] = await Promise.all([call(base, '/accounts/two-step', { token: a.acct }), call(base, '/accounts/passkeys', { token: a.acct })]); }
    catch (e) { el.innerHTML = e.status === 404 ? '' : `<p class="set-note a3-setnote">${esc(say(e.message))}</p>`; return; }
    if (!el.isConnected) return;
    const av = available(), list = keys.passkeys || [];
    el.innerHTML = `<div class="set-row set-row-wide" id="set-twostep" data-keys="2fa two-factor totp authenticator code otp mfa two-step">
        <div class="set-l"><b>Two-step sign-in <span class="oa-st ${st.on ? 'on' : ''}" id="a3-state">${st.on ? 'On' : 'Off'}</span></b><small>${st.on ? `On since ${esc(when(st.since))}. Signing in asks for a code from your authenticator app. ${st.recoveryLeft} recovery code${st.recoveryLeft === 1 ? '' : 's'} left${st.trusted ? `, ${st.trusted} trusted device${st.trusted === 1 ? '' : 's'}` : ''}.` : 'After your password, provider or email link, signing in also asks for a 6-digit code from an app on your phone.'}${st.required ? ' <b class="a3-req">The host requires it for admins.</b>' : ''}</small></div>
        <div class="set-c a3-acts" id="a3-acts">${st.on ? `<button class="btn" data-a3="new-recs">New recovery codes</button>${st.trusted ? '<button class="btn" data-a3="untrust">Forget trusted devices</button>' : ''}<button class="btn" data-a3="off" id="a3-off">Turn off</button>` : '<button class="btn primary" data-a3="on" id="a3-on">Turn on two-step sign-in</button>'}</div>
        <div class="a3-panel" id="a3-panel" hidden></div></div>
      <div class="set-row set-row-wide" id="set-passkeys" data-keys="passkey webauthn fido security key biometric face id touch id fingerprint">
        <div class="set-l"><b>Passkeys</b><small>Sign in with your fingerprint, face or screen lock instead of a password. A passkey sign-in counts as two-step.</small></div>
        <div class="set-c a3-pkc">${list.length ? `<ul class="ac-ses a3-pklist" id="a3-pklist">${list.map(k => `<li data-pk="${esc(k.id)}"><span class="a3-pkname">${KEY_SVG}<span><b>${esc(k.name)}</b><small>Added ${esc(when(k.created))}${k.lastUsed ? ' · last used ' + esc(when(k.lastUsed)) : ''} · ${esc(k.where)}${k.synced ? ' · synced' : ''}</small></span></span><span class="a3-pkbtns"><button class="btn sm" data-pk-rename="${esc(k.id)}">Rename</button><button class="btn sm" data-pk-del="${esc(k.id)}">Remove</button></span></li>`).join('')}</ul>` : ''}
          ${av.ok ? `<button class="btn" id="a3-add-pk" ${list.length >= keys.max ? 'disabled' : ''}>${KEY_SVG}<span>Add a passkey</span></button>` : `<p class="a3-note" id="a3-pk-off">${esc(av.why)}</p>`}<p class="a3-err" id="a3-pk-msg" role="alert"></p></div></div>`;
    const panel = el.querySelector('#a3-panel'), redraw = () => settings(el);
    const ask = (title, btn, run) => {   // a small inline form that needs a current code
      panel.hidden = false;
      panel.innerHTML = `<form class="a3-form" id="a3-ask" novalidate autocomplete="off"><label class="a3-f" for="a3-ask-code">${esc(title)}</label><div class="a3-inline"><input class="input a3-code" id="a3-ask-code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="000000"><button class="btn primary" type="submit">${esc(btn)}</button><button class="btn" type="button" id="a3-ask-x">Cancel</button></div><p class="a3-err" id="a3-ask-err" role="alert"></p></form>`;
      const f = panel.querySelector('#a3-ask');
      panel.querySelector('#a3-ask-x').onclick = () => { panel.hidden = true; panel.innerHTML = ''; };
      f.onsubmit = async e => { e.preventDefault(); const code = f.querySelector('#a3-ask-code').value.trim(); if (code.replace(/[^A-Za-z0-9]/g, '').length < 6) { f.querySelector('#a3-ask-err').textContent = 'Type the 6-digit code from your app.'; return; } try { await run(code); } catch (e2) { f.querySelector('#a3-ask-err').textContent = say(e2.message); } };
      setTimeout(() => f.querySelector('#a3-ask-code').focus({ preventScroll: true }), 30);
    };
    el.querySelectorAll('[data-a3]').forEach(b => b.addEventListener('click', async () => {
      const k = b.dataset.a3;
      if (k === 'on') { panel.hidden = false; el.querySelector('#a3-acts').hidden = true; enrol(panel, base, a.acct, a.username || a.name, { onDone: out => { if (out) toast('Two-step sign-in is on'); if (out && out.memberToken && S()) { S().set({ server: { url: base, token: out.memberToken } }); } redraw(); } }); }
      else if (k === 'off') ask('Type a current code (or a recovery code) to turn two-step sign-in off', 'Turn off', async code => { await call(base, '/accounts/two-step/disable', { method: 'POST', token: a.acct, body: { code } }); trustSet(trustKey(base, a.username), ''); toast('Two-step sign-in is off'); redraw(); });
      else if (k === 'new-recs') ask('Type a current code to make ten new recovery codes (the old ones stop working)', 'Make new codes', async code => {
        const out = await call(base, '/accounts/two-step/recovery', { method: 'POST', token: a.acct, body: { code } });
        panel.innerHTML = `<div class="a3-enrol a3-done" id="a3-recovery"><p class="a3-lead"><b>Your new recovery codes.</b> The old ones no longer work. Save these now: they are shown only this time.</p>${recoveryHtml(out.recovery)}<div class="a3-row"><button class="btn primary" type="button" id="a3-saved">I saved them</button></div></div>`;
        wireRecovery(panel, out.recovery, a.username || a.name); panel.querySelector('#a3-saved').onclick = redraw;
      });
      else if (k === 'untrust') { try { await call(base, '/accounts/two-step/trusted', { method: 'DELETE', token: a.acct }); trustSet(trustKey(base, a.username), ''); toast('Trusted devices forgotten: each one asks for a code next time'); redraw(); } catch (e) { toast(say(e.message)); } }
    }));
    const msg = el.querySelector('#a3-pk-msg'), add = el.querySelector('#a3-add-pk');
    if (add) add.onclick = async () => {
      msg.textContent = ''; add.disabled = true;
      try { await addPasskey(base, a.acct, defaultName()); toast('Passkey added'); redraw(); }
      catch (e) { add.disabled = false; msg.textContent = e.name && !e.status ? pkError(e) : say(e.message); }
    };
    el.querySelectorAll('[data-pk-del]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await call(base, '/accounts/passkeys/' + encodeURIComponent(b.dataset.pkDel), { method: 'DELETE', token: a.acct }); toast('Passkey removed'); redraw(); }
      catch (e) { b.disabled = false; msg.textContent = e.code === 'last' ? 'Keep at least one way to sign in. Add a password or another passkey first.' : say(e.message); }
    });
    el.querySelectorAll('[data-pk-rename]').forEach(b => b.onclick = () => {
      const li = b.closest('li'), cur = li.querySelector('b').textContent;
      li.querySelector('.a3-pkbtns').innerHTML = `<form class="a3-inline a3-rename" id="a3-rename"><input class="input" maxlength="40" value="${esc(cur)}" aria-label="Passkey name"><button class="btn sm primary" type="submit">Save</button></form>`;
      const f = li.querySelector('#a3-rename'), i = f.querySelector('input'); i.focus(); i.select();
      f.onsubmit = async e => { e.preventDefault(); try { await call(base, '/accounts/passkeys/' + encodeURIComponent(b.dataset.pkRename), { method: 'PUT', token: a.acct, body: { name: i.value.trim() } }); redraw(); } catch (e2) { msg.textContent = say(e2.message); } };
    });
  }
  function defaultName() {
    const ua = navigator.userAgent;
    const dev = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux PC' : 'This device';
    return desktop() ? dev + ' (TribeCode app)' : dev;
  }
  // Settings › Tribe & admin: the host, on the host computer
  async function adminSettings(el) {
    const me = C() && (C().state() || {}).me, local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || desktop();
    if (!(me && me.role === 'host' && local && C().hasToken())) { el.closest('.set-sec') && (el.closest('.set-sec').hidden = true); return; }
    const base = baseUrl(), tok = (S().get().server || {}).token || '';
    let d; try { d = await call(base, '/accounts/admin/settings', { token: tok }); } catch { el.closest('.set-sec') && (el.closest('.set-sec').hidden = true); return; }
    if (!el.isConnected) return;
    el.innerHTML = `<div class="set-row" id="set-twostep-admins" data-keys="2fa two-factor admins require mfa"><div class="set-l"><b>Require two-step for admins</b><small>${d.twoStepAdmins ? 'On: an admin who signs in to their account gets into the tribe only with two-step sign-in (or a passkey). Until they turn it on, they are asked to.' : 'Admins can sign in with a password, a provider or an email link alone. Turn this on to ask every admin for two-step sign-in.'} Sign-ins on this computer are not held back.</small></div>
      <div class="set-c"><button class="toggle set-toggle" role="switch" id="a3-admins" aria-label="Require two-step for admins" aria-checked="${!!d.twoStepAdmins}"><span class="switch"></span></button></div></div>`;
    const sw = el.querySelector('#a3-admins');
    sw.onclick = async () => { const on = sw.getAttribute('aria-checked') !== 'true'; try { await call(base, '/accounts/admin/settings', { method: 'PUT', token: tok, body: { twoStepAdmins: on } }); toast(on ? 'Admins now need two-step sign-in' : 'Two-step is optional for admins'); adminSettings(el); } catch (e) { toast(say(e.message)); } };
  }
  function boot() {
    const T = window.TribeSettings; if (!T || !T.addSection) return;
    try {
      T.addSection('account', { id: 'twostep', title: 'Two-step sign-in and passkeys', render: el => settings(el) });
      T.addSection('admin', { id: 'twostep-admins', title: 'Sign-in rules', render: el => adminSettings(el) });
    } catch {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.TribeAuth3 = { after, challenge, enrolRequired, passkeyButton, passkeySignIn, addPasskey, available, settings, call };
})();
