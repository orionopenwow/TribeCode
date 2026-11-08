// Zero-step setup + one calm Settings page (replaces the old first-run wizard).
//  * First launch: name = the computer's user name (desktop: home folder; localhost: /api/health `user`,
//    which the server only reveals to local requests), folder = ~/TribeCode, color picked for you.
//    The desktop app then hosts on its own (app.js hostHere) and you land in your first project.
//  * Settings (gear, your avatar, More → Settings → App settings): name, color, theme, folder, local
//    brain, open at login, a quick tour, and joining another tribe with a link.
// window.TribeOnboarding stays as a thin alias so older callers (palette, tests) keep working.
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore;
  const C = () => window.TribeClient;
  const COLORS = ['#F26B1D', '#7C5CFF', '#FFB86B', '#38C6B1', '#FF6F8E', '#5B8CFF', '#9AE66E'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const pretty = n => String(n || '').replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ').slice(0, 32);

  async function defaultFolder() {
    const home = await window.TribeHost.homeDir();
    return home ? home.replace(/[\\/]$/, '') + (home.includes('\\') ? '\\TribeCode' : '/TribeCode') : '';
  }
  async function osUser() {
    try { const h = await C().probe(); if (h && h.user) return h.user; } catch {}
    const home = await window.TribeHost.homeDir();
    return home ? home.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : '';
  }
  // Fill in everything the wizard used to ask. Idempotent; never overwrites what you set.
  async function autoSetup() {
    const st = S.get(); if (st.onboarded) return false;
    const name = st.name || pretty(await osUser()) || 'Me';
    const color = st.color && st.color !== S.defaults.color ? st.color : COLORS[Math.floor(Math.random() * COLORS.length)];
    S.set({ onboarded: true, firstRun: true, name, color, folder: st.folder || await defaultFolder(), checklist: { setup: true }, tour: { done: true } });
    return true;
  }

  // ---------- Settings ----------
  let probe = { state: 'idle', models: [] };
  async function probeBrain() {
    probe = { state: 'checking', models: [] }; draw();
    let models = [];
    try { const b = C().connected() ? (await C().api('/brain')).brain : null; if (b && b.online) { probe = { state: 'host', models: [b.model] }; draw(); return; } } catch {}
    // Only look for Ollama on this device when it could be the host (no tribe yet, or this page is served by this computer).
    // A friend's phone or laptop asking its own localhost only got a console error (and, in newer browsers, a
    // "allow access to devices on your local network" prompt).
    const here = /^(localhost|127\.0\.0\.1|\[::1\]|tauri\.localhost)$/.test(location.hostname) || location.protocol === 'tauri:';
    if (C().connected() && !here) { probe = { state: 'missing', models: [] }; draw(); return; }
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1800);
      const r = await fetch(S.get().brain.host.replace(/\/$/, '') + '/api/tags', { signal: ctl.signal }); clearTimeout(t);
      models = ((await r.json()).models || []).map(m => m.name);
      probe = { state: 'found', models };
      const st = S.get(); if (!st.brain.model) { const q = models.find(m => /qwen/i.test(m)); if (q) S.set({ brain: { model: q, enabled: true }, checklist: { brain: true } }); }
    } catch { probe = { state: 'missing', models: [] }; }
    draw();
  }
  const modal = () => $('#settings-modal');
  function ensure() {
    if (modal()) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal hidden" id="settings-modal" role="dialog" aria-label="Settings"><div class="modal-card set-card" id="settings-body"></div></div>');
    modal().addEventListener('click', e => { if (e.target === modal()) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal().classList.contains('hidden')) close(); });
  }
  function close() { modal().classList.add('hidden'); window.TribeApp && window.TribeApp.refresh(); }
  function row(label, control, hint = '') { return `<div class="set-row"><div class="set-l"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div><div class="set-c">${control}</div></div>`; }
  function draw() {
    const box = $('#settings-body'); if (!box || modal().classList.contains('hidden')) return;
    const st = S.get(), desk = window.TribeHost.isDesktop;
    const brainTxt = probe.state === 'host' ? `${esc(probe.models[0])} on the host` : probe.state === 'found' ? (st.brain.enabled ? `${esc(st.brain.model)}` : 'Ollama found') : probe.state === 'checking' ? 'Looking…' : 'Off. Install Ollama and run <code>ollama pull qwen3</code>.';
    box.innerHTML = `<header class="set-head"><h2>Settings</h2><button class="btn ghost" id="set-close" aria-label="Close">Done</button></header>
      ${window.TribeProfiles && C() && C().connected() ? row('Profile', '<button class="btn" id="set-profile">Edit profile</button>', 'Avatar, name color, bio, status and presence.') : ''}
      ${row('Name', `<input class="input" id="set-name" maxlength="32" value="${esc(st.name)}" autocomplete="off">`)}
      ${row('Color', `<div class="swatches">${COLORS.map(c => `<button class="swatch ${c === st.color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div>`)}
      ${themeRow(st)}
      ${desk ? row('Folder', `<div class="folder"><input class="input" id="set-folder" value="${esc(st.folder)}" spellcheck="false"><button class="btn" id="set-browse">Browse</button></div>`, 'Docs, tasks and chat live here as plain files.') : ''}
      ${window.TribeBrain ? row('Flint\'s brain', '<div id="set-flintbrain"></div>', 'Built in, Ollama, or a cloud model with your key. Also writes summaries, drafts and standups.') : row('Local brain', `<span class="set-brain">${brainTxt}</span>${probe.state === 'found' && probe.models.length ? `<select id="set-model">${['', ...probe.models].map(m => `<option value="${esc(m)}" ${(st.brain.enabled ? st.brain.model : '') === m ? 'selected' : ''}>${m ? esc(m) : 'Off'}</option>`).join('')}</select>` : ''}`, 'Writes summaries and standups on this computer.')}
      ${desk ? row('Host on this computer', `<button class="toggle set-toggle" role="switch" id="set-host" aria-label="Host on this computer" aria-checked="${!!(st.hosting && !st.hostOff)}" ${st.hosting ? '' : 'disabled'}><span class="switch"></span></button>`, st.hosting ? 'Your tribe runs here only while this is on. Off stops the server; nothing is deleted.' : 'Starts when you create your first project.') : ''}
      ${desk ? row('Open at login', `<button class="toggle set-toggle" role="switch" id="set-login" aria-label="Open at login" aria-checked="${!!st.startup.launchAtLogin}"><span class="switch"></span></button>`) : ''}
      ${window.TribeUpdater && window.TribeUpdater.supported() ? row('Download updates in the background', `<button class="toggle set-toggle" role="switch" id="set-bgupdate" aria-label="Download updates in the background" aria-checked="${st.startup.autoUpdate !== false}"><span class="switch"></span></button>`, st.startup.autoUpdate !== false ? 'New versions download quietly. When one is ready, Restart to update opens it in seconds.' : 'You see Update available and choose when to download.') : ''}
      ${C() && C().connected() ? row('Friends can ask my Claude', `<select class="input set-select" id="set-askai" aria-label="Friends can ask my Claude"><option value="ask">Ask me each time</option><option value="always">Always</option><option value="never">Never</option></select>`, 'When a friend without Claude Code types @ai, your Claude can answer. It uses your subscription, so you decide.') : ''}
      ${C() && C().connected() && window.TribeGitHub ? row('GitHub', '<div id="set-github"></div>', 'Sign in once and everything pushes on its own.') : row('GitHub', '<span class="faint">Start your tribe first (Home › Create your first project), then sign in here.</span>', 'Sign in once and everything pushes on its own.')}
      ${C() && C().connected() ? row('Sign-in', '<div id="set-oauth"></div>', 'Discord, GitHub or Google: join with one tap, sign back in on a new device.') : ''}
      ${row('Crash reports', `<button class="toggle set-toggle" role="switch" id="set-crash" aria-label="Send crash reports" aria-checked="${st.crashReports !== false}"><span class="switch"></span></button>`, 'When something breaks, send the error and recent logs to the bug inbox. Repeats are filed once.')}
      ${isHost() ? row('Backup', '<button class="btn" id="set-backup">Download backup</button>', 'The whole tribe folder as one .tar.gz. GitHub keys stay on this computer.') : ''}
      <div class="set-links"><button class="linkish" id="set-tour">Take a quick tour</button><button class="linkish" id="set-join">Join another tribe with a link</button>${window.TribeOffline ? `<button class="linkish" id="set-demo">${esc(window.TribeOffline.label())}</button>` : ''}${window.TribeGuide ? '<button class="linkish set-guide" id="set-guide" title="How to TribeCode"><span aria-hidden="true">?</span> Guide</button>' : ''}</div>`;
    $('#set-close').onclick = close;
    const sp = $('#set-profile'); if (sp) sp.onclick = () => { close(); window.TribeProfiles.edit(); };   // feat/profiles
    $('#set-name').onchange = () => { const v = $('#set-name').value.trim(); if (v) { S.set({ name: v }); syncMe({ name: v }); } window.TribeApp.refresh(); };
    box.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { S.set({ color: b.dataset.color }); syncMe({ color: b.dataset.color }); window.TribeApp.refresh(); draw(); });
    const bk = $('#set-backup'); if (bk) bk.onclick = backup;
    // Theme picker (themes.js): a chip sets the theme; with "Match system" on it becomes your light or dark theme.
    box.querySelectorAll('[data-theme-id]').forEach(b => b.onclick = () => {
      const T = window.TribeThemes, t = T.byId(b.dataset.themeId), cur = S.get();
      const sysMode = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      S.set({ ...T.pick(t.id), themeSystem: !!(cur.themeSystem || cur.theme === 'system') && t.mode === sysMode });
      window.TribeApp.applyTheme(); draw();
    });
    const tsys = $('#set-theme-sys'); if (tsys) tsys.onclick = () => {
      const T = window.TribeThemes, cur = S.get(), on = !(cur.themeSystem || cur.theme === 'system');
      S.set({ themeSystem: on, theme: cur.theme === 'system' ? T.resolve(cur) : cur.theme });
      window.TribeApp.applyTheme(); draw();
    };
    const bgu = $('#set-bgupdate'); if (bgu) bgu.onclick = () => { const on = !S.get().startup.autoUpdate; S.set({ startup: { autoUpdate: on } }); if (on && window.TribeUpdater) window.TribeUpdater.check(); draw(); };
    const f = $('#set-folder'); if (f) f.onchange = () => S.set({ folder: f.value.trim() });
    const br = $('#set-browse'); if (br) br.onclick = async () => { const p = await window.TribeHost.pickFolder(); if (p) { S.set({ folder: p }); draw(); toast('Restart TribeCode to host from the new folder.'); } };
    const md = $('#set-model'); if (md) md.onchange = () => { S.set({ brain: { model: md.value, enabled: !!md.value }, checklist: { brain: !!md.value } }); window.TribeApp.refresh(); };
    const ai = $('#set-askai');
    if (ai) { C().api('/ask/policy').then(r => { ai.value = r.policy; }).catch(() => {}); ai.onchange = () => C().api('/ask/policy', { method: 'PUT', body: { policy: ai.value } }).then(() => toast('Saved')).catch(e => toast(e.message)); }
    const fb = $('#set-flintbrain'); if (fb) window.TribeBrain.mountRow(fb);   // feat/any-llm: Flint's brain (app/ui/brainpick.js)
    const gh = $('#set-github'); if (gh) window.TribeGitHub.mount(gh);   // GitHub sign-in (app/ui/github.js)
    const oa = $('#set-oauth'); if (oa && window.TribeOAuth) window.TribeOAuth.mount(oa);   // Sign in with Discord/GitHub/Google (app/ui/oauth.js)
    const cr = $('#set-crash'); if (cr) cr.onclick = () => { S.set({ crashReports: S.get().crashReports === false }); draw(); };
    const hs = $('#set-host'); if (hs) hs.onclick = async () => { hs.disabled = true; await window.TribeApp.setHosting(hs.getAttribute('aria-checked') !== 'true'); draw(); };
    const lg = $('#set-login'); if (lg) lg.onclick = () => { const on = !S.get().startup.launchAtLogin; S.set({ startup: { launchAtLogin: on } }); window.TribeHost.setAutostart(on); draw(); };
    $('#set-tour').onclick = () => { close(); window.TribeTour.start(); };
    $('#set-join').onclick = () => { close(); joinPrompt(); };
    const sd = $('#set-demo'); if (sd) sd.onclick = () => { close(); window.TribeOffline.toggle(); };   // feat/offline-demo
    const sg = $('#set-guide'); if (sg) sg.onclick = () => { close(); window.TribeGuide.open(); };   // feat/vision-guide
  }
  // Settings › Theme: swatch chips (canvas · surface · accent) and a "Match system" switch. Styles in themes.css.
  function themeRow(st) {
    const T = window.TribeThemes; if (!T) return '';
    const cur = T.resolve(st), sys = !!(st.themeSystem || st.theme === 'system');
    const chips = T.list.map(t => `<button class="th-chip ${t.id === cur ? 'on' : ''}" role="radio" aria-checked="${t.id === cur}" data-theme-id="${t.id}" title="${esc(t.name)}">`
      + `<span class="th-sw" aria-hidden="true"><i style="background:${t.sw[0]}"></i><i style="background:${t.sw[1]}"></i><b style="background:${t.sw[2]}"></b></span><span class="th-name">${esc(t.name)}</span></button>`).join('');
    return `<div class="set-row set-theme"><div class="set-l"><b>Theme</b></div><div class="set-c"><div class="th-grid" role="radiogroup" aria-label="Theme">${chips}</div>
      <div class="th-sys"><span>Match system (light/dark)</span><button class="toggle set-toggle" role="switch" id="set-theme-sys" aria-label="Match system light or dark" aria-checked="${sys}"><span class="switch"></span></button></div></div></div>`;
  }
  const isHost = () => C().connected() && (C().state().me || {}).role === 'host';
  // Your name and color live on the server too, so friends see the change (not only this device).
  async function syncMe(patch) {
    if (!C().connected()) return;
    try { await C().api('/me', { method: 'PATCH', body: patch }); } catch (e) { toast(e.message); }
  }
  async function backup(e) {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Packing…';
    try {
      const st = S.get(), res = await fetch(C().base() + '/api/backup', { headers: { Authorization: 'Bearer ' + st.server.token } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'tribe-backup.tar.gz';
      const url = URL.createObjectURL(await res.blob()), a = document.createElement('a');
      a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast(`Saved ${name}`);
    } catch (err) { toast(`Backup failed: ${err.message}`); }
    b.disabled = false; b.textContent = 'Download backup';
  }
  function open() { ensure(); modal().classList.remove('hidden'); draw(); probeBrain(); const n = $('#set-name'); if (n) n.focus(); return Promise.resolve(); }

  // "+ circle → Join with a link" and Settings both land here.
  function joinPrompt() {
    const body = $('#invite-body'); $('#invite-modal').classList.remove('hidden');
    body.innerHTML = `<h2>Join a tribe</h2><div class="field"><label for="join-link">Invite link</label><div class="folder"><input class="input" id="join-link" placeholder="https://…/join/k7Qx2" autocomplete="off" spellcheck="false"><button class="btn primary" id="join-go">Join</button></div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button></div>`;
    const go = () => window.TribeApp.joinLink($('#join-link').value);
    $('#join-go').onclick = go; $('#join-link').onkeydown = e => { if (e.key === 'Enter') go(); };
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    $('#join-link').focus();
  }

  // ---------- first-launch banner: one line, dismissible ----------
  // Retired in v0.9.3: hosting shows as the "Hosting" pill top left (hostpill.js). Clear the first-run flag quietly.
  function banner() {
    const st = S.get(); if (st.firstRun && C().connected()) S.set({ firstRun: false }); return;
    if (!st.firstRun || $('#hi-banner') || !C().connected()) return;   // eslint-disable-line no-unreachable
    const me = C().state().me || {}, host = me.role === 'host', tribe = (C().state().tribe || {}).name || 'your tribe';
    const el = document.createElement('div'); el.className = 'hi-banner'; el.id = 'hi-banner';
    el.innerHTML = `<span>${host ? '<span class="emo" aria-hidden="true">🔥</span>' : '<span class="emo" aria-hidden="true">👋</span>'}Hi ${esc((st.name || '').split(' ')[0] || 'there')}, ${host ? "you're hosting." : `welcome to ${esc(tribe)}.`}</span>${host ? '<button class="linkish" id="hi-invite">Invite a friend →</button>' : ''}<span class="spacer"></span><button class="hi-x" id="hi-x" aria-label="Dismiss">✕</button>`;
    const main = $('#main'); main.insertBefore(el, main.firstChild);
    const done = () => { el.remove(); S.set({ firstRun: false }); };
    $('#hi-x').onclick = done;
    const iv = $('#hi-invite'); if (iv) iv.onclick = () => { done(); window.TribeFlow ? window.TribeFlow.instant() : window.TribeApp.openInvite(); };
  }
  C().on('hello', () => setTimeout(banner, 200));

  window.TribeSettings = { open, autoSetup, joinPrompt, close: () => modal() && close() };
  window.TribeOnboarding = { open: () => open(), goTo: () => {}, autoSetup };
})();
