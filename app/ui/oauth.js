// Sign in with Discord / GitHub / Google, and Apple once the host sets its Services ID (server/oauth.js, docs/SIGN-IN.md).
//  * Join page (/join/<code>) and sign-in page (/signin.html): provider buttons, start the flow, finish it when the
//    provider sends the browser back with #oauth=<one-time code> (traded once for a key by POST /api/oauth/finish).
//  * Settings › Sign-in: the host turns providers on (client id + secret, the redirect URI to copy, where to register);
//    everyone sees Linked accounts (Link / Unlink).
// Glyphs are simple monochrome marks drawn for TribeCode, not the providers' logos.
// Public: window.TribeOAuth = { glyph, buttons, begin, finish, landed, mount, iosApp, forPlatform }.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GLYPHS = {
    // a rounded game pad with two eyes
    discord: '<path d="M7 6.5c1.6-.7 3.2-1 5-1s3.4.3 5 1c1.6 2.2 2.6 4.8 2.8 8-1.3 1.2-2.8 2-4.5 2.5l-1-1.7M7 6.5C5.4 8.7 4.4 11.3 4.2 14.5c1.3 1.2 2.8 2 4.5 2.5l1-1.7M8.5 15.2c2.3.9 4.7.9 7 0"/><circle cx="9.4" cy="11.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.6" cy="11.6" r="1.1" fill="currentColor" stroke="none"/>',
    // a round cat head with ears and a tail: a nod to an octocat, drawn from scratch
    github: '<path d="M6.2 9.2 5.6 4.8l3.6 2.1a7.6 7.6 0 0 1 5.6 0l3.6-2.1-.6 4.4a6.6 6.6 0 0 1 1 3.6c0 3.6-3.1 6-6.8 6s-6.8-2.4-6.8-6c0-1.3.4-2.5 1-3.6Z"/><path d="M9.5 18.6c-.2 1-.9 1.8-2.4 1.6"/>',
    // a G: an open ring with a bar
    google: '<path d="M18.6 8.2A7.4 7.4 0 1 0 19.4 12H12.4"/>',
    // an apple with a leaf (TODO(appstore): Apple's own button artwork per its guidelines before submitting)
    apple: '<path d="M12 7.6c-1.2-.9-2.6-1.2-3.9-.8C5.8 7.5 4.9 10.3 5.6 13.4c.7 3.1 2.6 5.6 4.3 5.6.8 0 1.3-.4 2.1-.4s1.3.4 2.1.4c1.7 0 3.6-2.5 4.3-5.6.7-3.1-.2-5.9-2.5-6.6-1.3-.4-2.7-.1-3.9.8Z"/><path d="M12 7.4c0-1.9 1.1-3.2 2.8-3.6"/>',
  };
  // iPhone app builds (the Tauri iOS app, or ?platform=ios to try it in a browser): App Store 4.8 needs Sign in with
  // Apple beside any third-party sign-in, so Discord and Google stay hidden until the host turns Apple on.
  const iosApp = () => {
    try { const q = new URLSearchParams(location.search).get('platform'); if (q) sessionStorage.setItem('tribecode.platform', q); } catch {}
    let p = ''; try { p = sessionStorage.getItem('tribecode.platform') || ''; } catch {}
    return p === 'ios' || (!!(window.__TAURI_INTERNALS__ || window.__TAURI__) && /iPhone|iPad|iPod/.test(navigator.userAgent));
  };
  const forPlatform = list => (iosApp() && !list.some(p => p.id === 'apple') ? list.filter(p => p.id !== 'discord' && p.id !== 'google') : list);
  const glyph = p => `<svg class="oa-g" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[p] || ''}</svg>`;
  const ERRS = {
    denied: 'Sign-in was cancelled.', expired: 'That sign-in expired or was already used. Try again.', mismatch: 'Finish signing in in the same browser you started in.',
    provider: 'The provider did not let us in. Try again, or pick a name instead.', invite: 'This invite has expired. Ask for a fresh link.',
    unknown: 'No one here has linked that account yet.', taken: 'That account is already linked to someone else in this tribe.', busy: 'Too many tries. Wait a minute.', off: 'That sign-in option was turned off.',
  };
  const store = () => (window.TribeStore ? window.TribeStore.get() : {});
  const myToken = () => { const st = store(); return st.server && st.server.url === location.origin ? st.server.token || '' : ''; };
  const mobile = () => /iPhone|iPad|iPod|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // "Continue with …" buttons for the providers that are on. Renders nothing when none are.
  function buttons(el, providers, verb, onPick) {
    providers = forPlatform(providers || []);
    if (!providers.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="oa-btns">${providers.map(p => `<button type="button" class="oa-btn" data-oa="${esc(p.id)}">${glyph(p.id)}<span>${esc(verb)} ${esc(p.name)}</span></button>`).join('')}</div>`;
    el.querySelectorAll('[data-oa]').forEach(b => b.onclick = () => { el.querySelectorAll('[data-oa]').forEach(x => { x.disabled = true; }); b.classList.add('busy'); onPick(b.dataset.oa, b); });
  }
  async function providers() {
    try { const r = await fetch('/api/oauth/providers'); return r.ok ? (await r.json()).providers || [] : []; } catch { return []; }
  }
  // Start a flow on this server; the browser then goes to the provider.
  async function begin(p, mode, code) {
    const t = mode === 'link' ? myToken() : '';
    const r = await fetch(`/api/oauth/${encodeURIComponent(p)}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify({ mode, code }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || 'Could not start sign-in');
    location.assign(d.url);
  }
  // Back from the provider? Trade the one-time code (in the fragment: never sent to a server or logged) for the result.
  function landed() { const h = new URLSearchParams(location.hash.slice(1)); return h.get('oauth') || h.get('oauth_error') ? { rc: h.get('oauth'), error: h.get('oauth_error') } : null; }
  async function finish() {
    const l = landed(); if (!l) return null;
    history.replaceState(null, '', location.pathname + location.search);
    if (l.error) return { error: ERRS[l.error] || ERRS.provider, code: ERRS[l.error] ? l.error : 'provider' };
    const t = myToken();
    try {
      const r = await fetch('/api/oauth/finish', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify({ rc: l.rc }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { error: (d.code && ERRS[d.code] && d.code !== 'unknown' && d.code !== 'taken' ? ERRS[d.code] : d.error) || 'Sign-in failed', code: d.code || 'provider' };
      return d;
    } catch { return { error: "Can't reach the tribe right now.", code: 'offline' }; }
  }
  // Signed in (join or sign back in): keep the key on this device, then open the app like the join form does.
  async function enter(d) {
    window.TribeStore.set({ name: d.member.name, color: d.member.color, server: { url: location.origin, token: d.token } });
    try { if (d.project) localStorage.setItem('tribecode.project:' + location.origin, d.project); localStorage.setItem('tribecode.intro.v1', 'seen'); } catch {}
    if (mobile()) {   // phones: the private device link, so "Add to Home Screen" installs an app that signs itself in
      if (d.path) { location.replace(d.path); return; }
      try {
        const k = await fetch('/api/device-link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: '{}' });
        const kd = await k.json(); if (k.ok && kd.path) { location.replace(kd.path); return; }
      } catch {}
    }
    if (d.mode === 'join') { try { localStorage.setItem('tribecode.afterJoin', '1'); } catch {} }
    location.replace('/');
  }

  // ---------- Settings › Sign-in ----------
  const C = () => window.TribeClient;
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  let cfg = null, mine = null;
  const openNow = new Set();   // provider cards the host has open (kept open across redraws)
  async function load() {
    const host = ((C().state() || {}).me || {}).role === 'host';
    const [c, m] = await Promise.all([host ? C().api('/oauth/config').catch(() => null) : null, C().api('/oauth/me').catch(() => ({ linked: [], providers: [] }))]);
    cfg = c; mine = m;
  }
  function drawSettings(el) {
    const row = el.closest('.set-row');
    const showLinks = mine && mine.providers.length;
    if (!cfg && !showLinks) { if (row) row.style.display = 'none'; el.innerHTML = ''; return; }
    if (row) row.style.display = '';
    const desk = !!(window.TribeHost && window.TribeHost.isDesktop) || (C().base && C().base() !== location.origin);
    let html = '';
    if (cfg) {
      html += `<div class="oa-sec"><span class="oa-eye">Providers</span>${cfg.canEdit ? '' : '<small class="oa-hint">Change these on the host computer.</small>'}
        ${cfg.public ? '' : '<small class="oa-hint">Friends outside your Wi-Fi need the public link on (Invite › Share beyond my Wi-Fi), and the redirect below changes with it. Tailscale Funnel keeps it stable.</small>'}
        ${cfg.providers.map(p => `<details class="oa-prov" data-p="${esc(p.id)}"${openNow.has(p.id) ? ' open' : ''}>
          <summary class="oa-ph">${glyph(p.id)}<b>${esc(p.name)}</b><span class="oa-st ${p.on ? 'on' : ''}">${p.on ? 'On' : 'Off'}</span><svg class="oa-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></summary>
          <div class="oa-body">
            <label class="oa-l">Client ID<input class="input" data-f="clientId" value="${esc(p.clientId)}" autocomplete="off" spellcheck="false" maxlength="200" ${cfg.canEdit ? '' : 'disabled'}></label>
            <label class="oa-l">Client secret<input class="input" type="password" data-f="clientSecret" placeholder="${p.hasSecret ? 'Saved. Paste a new one to replace it' : 'Paste the client secret'}" autocomplete="new-password" spellcheck="false" maxlength="300" ${cfg.canEdit ? '' : 'disabled'}></label>
            <div class="oa-l">Redirect URI<div class="oa-copy"><code>${esc(p.redirectUri)}</code><button class="btn ghost" data-act="copy" data-v="${esc(p.redirectUri)}">Copy</button></div></div>
            <small class="oa-hint">${esc(p.where)} <a href="${esc(p.register)}" target="_blank" rel="noopener">Open ↗</a></small>
            ${cfg.canEdit ? `<div class="oa-acts"><button class="toggle oa-sw" role="switch" aria-label="${esc(p.name)} sign-in" aria-checked="${p.enabled}" data-act="toggle"><span>On</span><span class="switch"></span></button><button class="btn" data-act="save">Save</button></div>` : ''}
          </div>
        </details>`).join('')}</div>`;
    }
    if (showLinks) {
      const linked = Object.fromEntries((mine.linked || []).map(l => [l.provider, l]));
      html += `<div class="oa-sec"><span class="oa-eye">Linked accounts</span><small class="oa-hint">Sign back in on a new device with one tap, no invite needed.</small>
        ${mine.providers.map(p => { const l = linked[p.id]; return `<div class="oa-link" data-p="${esc(p.id)}">${glyph(p.id)}<span class="oa-who"><b>${esc(p.name)}</b><small>${l ? `Linked${l.name ? ' as ' + esc(l.name) : ''}` : 'Not linked'}</small></span>
          ${l ? '<button class="btn ghost" data-act="unlink">Unlink</button>' : desk ? '<small class="oa-hint">Link from TribeCode in your browser</small>' : '<button class="btn" data-act="link">Link</button>'}</div>`; }).join('')}</div>`;
    }
    el.innerHTML = `<div class="oa-set">${html}</div>`;
    el.querySelectorAll('details.oa-prov').forEach(d => d.addEventListener('toggle', () => { d.open ? openNow.add(d.dataset.p) : openNow.delete(d.dataset.p); }));
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); act(b, el); }));
  }
  async function act(b, el) {
    const box = b.closest('[data-p]'), p = box && box.dataset.p, what = b.dataset.act;
    try {
      if (what === 'copy') { try { await navigator.clipboard.writeText(b.dataset.v); toast('Redirect URI copied'); } catch { toast(b.dataset.v); } return; }
      if (what === 'save' || what === 'toggle') {
        const body = {};
        const id = box.querySelector('[data-f="clientId"]').value.trim(), sec = box.querySelector('[data-f="clientSecret"]').value.trim();
        body.clientId = id; if (sec) body.clientSecret = sec;
        if (what === 'toggle') body.enabled = b.getAttribute('aria-checked') !== 'true';
        else if (id && (sec || cfg.providers.find(x => x.id === p).hasSecret)) body.enabled = true;   // Save with both filled turns it on
        const r = await C().api(`/oauth/config/${p}`, { method: 'PUT', body });
        cfg = { ...cfg, providers: r.providers };
        const now = r.providers.find(x => x.id === p);
        toast(`${now.name} sign-in is ${now.on ? 'on' : 'off'}`);
        mine = await C().api('/oauth/me').catch(() => mine);
        return drawSettings(el);
      }
      if (what === 'link') { b.disabled = true; const r = await C().api(`/oauth/${p}/start`, { method: 'POST', body: { mode: 'link' } }); location.assign(r.url); return; }
      if (what === 'unlink') { mine = await C().api(`/oauth/me/${p}`, { method: 'DELETE' }); toast('Unlinked'); return drawSettings(el); }
    } catch (e) { b.disabled = false; toast(e.message); }
  }
  async function mount(el) {
    if (!el || !C() || !C().connected()) return;
    el.innerHTML = '<small class="oa-hint">Checking…</small>';
    await load(); drawSettings(el);
  }

  window.TribeOAuth = { glyph, buttons, providers, begin, finish, landed, enter, mount, ERRS, iosApp, forPlatform };
})();
