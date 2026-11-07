// Sign in to GitHub inside TribeCode (server/github-auth.js). Settings › GitHub, the Desktop folder sheet and
// Ctrl K all mount the same block: signed in as @you · Sign out, or Sign in with GitHub (device flow: the code is
// copied, github.com/login/device opens, TribeCode waits), "Use my GitHub CLI login" on the host computer, and
// pasting a token as the last resort. The token never reaches the browser.
// Public: window.TribeGitHub = { mount(el), signIn(), status() }.
(function () {
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const DOCS = 'https://github.com/orionopenwow/TribeCode/blob/main/docs/GITHUB-AND-FOLDERS.md';
  const GH = '<svg class="gh-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 2.8 5.8 3.1 5.8 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>';
  let gh = null, poller = null;
  const mounts = new Set();

  async function status() { const r = await C.api('/github'); gh = r.github; return gh; }
  async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
  function redraw() { for (const el of [...mounts]) { if (!el.isConnected) { mounts.delete(el); continue; } draw(el); } }

  function draw(el) {
    if (!gh) { el.innerHTML = '<p class="gh-wait">Checking GitHub…</p>'; return; }
    const f = gh.flow || { state: 'none' };
    let body;
    if (gh.signedIn) {
      body = `<div class="gh-row"><span class="gh-av">${GH}</span><span class="gh-who"><b id="gh-login">@${esc(gh.login || 'signed in')}</b><small>Pushes go to GitHub on their own${gh.via === 'gh' ? ' · from the GitHub CLI' : gh.via === 'token' ? ' · with a token' : ''}</small></span><button class="btn ghost" data-gh="signout">Sign out</button></div>`;
    } else if (f.state === 'pending') {
      body = `<div class="gh-code"><span class="eyebrow">Type this code on GitHub</span><code id="gh-code">${esc(f.userCode)}</code>
        <div class="gh-acts"><button class="btn primary" data-gh="open">Open GitHub</button><button class="btn" data-gh="copy">Copy code</button><button class="btn ghost" data-gh="cancel">Cancel</button></div>
        <small class="gh-hint">Waiting for GitHub… this finishes by itself once you approve.</small></div>`;
    } else {
      const note = f.state === 'expired' ? 'The code expired. Try again.' : f.state === 'denied' ? 'GitHub sign-in was cancelled.' : f.state === 'error' ? esc(f.error || 'Something went wrong.') : '';
      const ghcli = gh.gh && gh.gh.signedIn ? `<button class="btn" data-gh="cli">Use my GitHub CLI login${gh.gh.user ? ` (@${esc(gh.gh.user)})` : ''}</button>` : '';
      const signIn = gh.configured ? `<button class="btn primary" data-gh="start">${GH}<span>Sign in with GitHub</span></button>` : '';
      const setup = !gh.configured ? (gh.canConfigure
        ? `<div class="gh-setup"><small>One-time setup: register a GitHub OAuth App and paste its client id. <a href="${DOCS}" target="_blank" rel="noopener">How</a></small>
            <div class="gh-line"><input class="input" id="gh-cid" placeholder="Client id, e.g. Ov23li…" autocomplete="off" spellcheck="false" maxlength="80"><button class="btn" data-gh="cid">Save</button></div></div>`
        : '<small class="gh-hint">The host hasn\'t turned on GitHub sign-in yet. You can paste a token below.</small>') : '';
      body = `${note ? `<p class="gh-note">${note}</p>` : ''}<div class="gh-acts">${signIn}${ghcli}</div>${setup}
        <details class="gh-paste"><summary>Paste a token instead</summary><div class="gh-line"><input class="input" id="gh-tok" type="password" placeholder="ghp_… or github_pat_…" autocomplete="off" spellcheck="false"><button class="btn" data-gh="token">Save</button></div><small>Needs the <code>repo</code> scope. It stays on the host computer.</small></details>`;
    }
    el.innerHTML = `<div class="gh-box" data-state="${gh.signedIn ? 'in' : f.state}">${body}</div>`;
    el.querySelectorAll('[data-gh]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); act(b.dataset.gh, el); }));
  }

  async function act(what, el) {
    try {
      if (what === 'start') {   // open the tab now, while the click still counts (popup blockers), and point it at GitHub once the code is ready
        const desk = !!(window.TribeHost && window.TribeHost.isDesktop), w = desk ? null : window.open('about:blank', '_blank');
        return signIn(w).catch(e => { if (w) w.close(); throw e; });
      }
      if (what === 'open') return openGitHub();
      if (what === 'copy') { const ok = await copy(gh.flow.userCode); return toast(ok ? 'Code copied' : gh.flow.userCode); }
      if (what === 'cancel') { await C.api('/github/device', { method: 'DELETE' }); stopPoll(); await status(); return redraw(); }
      if (what === 'signout') { gh = (await C.api('/github/signout', { method: 'POST' })).github; toast('Signed out of GitHub'); return redraw(); }
      if (what === 'cli') { const r = await C.api('/github/gh', { method: 'POST' }); gh = r.github; done(r.login); return; }
      if (what === 'token') { const v = el.querySelector('#gh-tok').value.trim(); if (!v) return; const r = await C.api('/github/token', { method: 'POST', body: { token: v } }); gh = r.github; done(r.login); return; }
      if (what === 'cid') { const v = el.querySelector('#gh-cid').value.trim(); gh = (await C.api('/github/config', { method: 'PUT', body: { clientId: v } })).github; toast(gh.configured ? 'GitHub sign-in is on' : 'Saved'); return redraw(); }
    } catch (e) { toast(e.message); }
  }
  function openGitHub(win) {
    const u = gh && gh.flow && gh.flow.verificationUri;
    if (!u || (window.TribeHost && window.TribeHost.isDesktop)) return;
    if (win && !win.closed) { try { win.opener = null; } catch {} win.location.href = u; return; }
    const w = window.open(u, '_blank', 'noopener'); if (w) try { w.opener = null; } catch {}
  }
  async function signIn(win) {
    if (!gh) await status();
    const desk = !!(window.TribeHost && window.TribeHost.isDesktop);
    const f = await C.api('/github/device', { method: 'POST', body: { open: desk } });
    gh.flow = f; redraw();
    copy(f.userCode).then(ok => ok && toast(`Code ${f.userCode} copied: paste it on GitHub`));
    openGitHub(win);
    startPoll(f.interval);
  }
  function stopPoll() { clearTimeout(poller); poller = null; }
  function startPoll(interval = 5) {
    stopPoll();
    const tick = async () => {
      let f; try { f = await C.api('/github/device'); } catch { poller = setTimeout(tick, 3000); return; }
      if (gh) gh.flow = f;
      if (f.state === 'pending') { poller = setTimeout(tick, Math.max(1000, Math.min(interval, 3) * 1000)); return; }
      poller = null;
      if (f.state === 'ok') { await status().catch(() => {}); done(f.login); } else redraw();
    };
    poller = setTimeout(tick, 1000);
  }
  // Signed in: say so, and finish this project's GitHub step if it was waiting for a login (server/flow.js).
  async function done(login) {
    toast(`Signed in to GitHub as @${login}`);
    redraw();
    try {
      const fl = (await C.api('/flow')).flow;
      const s = fl && fl.steps && fl.steps.github && fl.steps.github.s;
      if (s === 'todo' || s === 'fail') { const r = await C.api('/flow/github', { method: 'POST', body: {} }); if (r.step && r.step.s === 'ok') toast('Your project is on GitHub now'); }
    } catch {}
  }

  async function mount(el) {
    if (!el) return;
    mounts.add(el); draw(el);
    try { await status(); } catch (e) { el.innerHTML = `<p class="gh-note">${esc(e.message)}</p>`; return; }
    if (gh.flow && gh.flow.state === 'pending' && !poller) startPoll(gh.flow.interval);
    redraw();
  }

  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Action', label: 'Sign in with GitHub', keys: 'github login sign in account push token oauth', run: () => window.TribeSettings ? window.TribeSettings.open().then(() => { const el = document.getElementById('set-github'); if (el) el.scrollIntoView({ block: 'center' }); }) : signIn() },
  ]);
  window.TribeGitHub = { mount, signIn, status: () => gh };
})();
