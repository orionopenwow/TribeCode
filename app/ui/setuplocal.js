// Optimistic setup (feat/setup-local, docs/LIGHT-HOSTING.md): a project starts instantly on this device, and where it
// lives is the last step, optional, and can be chosen any time later.
//   start()   "Start a project": a name, one line about it, optional notes and first tasks, and optional Company basics
//             (company name, mission, the four lean seats as Me / AI / Later). Create makes a local draft at once
//             (offline.js solo mode: tasks, docs, notes, chat and Company all work with no server), then offers where().
//   where()   "Where should it live?" (optional, last): a GitHub repo · This computer · Free cloud · Phone · Decide later.
//     GitHub repo    the project lives in a repo anyone can see: the live repo state shows on the project, and with a
//                    token kept only on this device, suggestions (tasks, the project page, docs) are mirrored as plain
//                    files on a PR-less branch (tribe/suggestions). No always-on server is needed for viewing.
//     This computer  the desktop app starts its server (app.js hostHere, silent), or the TribeCode server that serves
//                    this page takes it; the draft syncs in with POST /api/import/solo (idempotent by draftId, the local
//                    copy is kept until the host confirms it has everything).
//     Free cloud     Render's one-click deploy (docs/CLOUD.md), then Move with its invite link (phonehost.js move()).
//     Phone          keep it on this phone, or host from an Android phone with Termux (docs/PHONE-HOSTING.md).
// Public: window.TribeLocalSetup = { start(), where(), choose(home), github: { connect(repo, token), live(force), mirror() },
//   state(), pid() }
(function () {
  'use strict';
  const S = () => window.TribeStore, OFF = () => window.TribeOffline, PH = () => window.TribePhoneHost, A = () => window.TribeApp;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => A() && A().toast(m);
  const ic = (n, s = 18) => `<svg class="i" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const phoneLike = () => matchMedia('(max-width: 820px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent || '');
  const desktopApp = () => !!(window.TribeHost && window.TribeHost.isDesktop && window.__TAURI__);
  const realFetch = (u, o) => (OFF() && OFF().realFetch ? OFF().realFetch(u, o) : fetch(u, o));
  const GH = 'https://api.github.com', BRANCH = 'tribe/suggestions', TKEY = 'tribecode.light.ghToken';

  // ---------- one sheet at a time (the same look as phonehost.js) ----------
  let el = null, scrim = null;
  function close() {
    if (!el) return; const a = el, b = scrim; el = scrim = null;
    a.classList.add('out'); b.classList.add('out');
    setTimeout(() => { a.remove(); b.remove(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
  }
  function sheet(html, id, label) {
    if (PH() && PH().close) try { PH().close(); } catch {}
    if (el) { el.remove(); scrim.remove(); }
    scrim = document.createElement('div'); scrim.className = 'ph-scrim'; scrim.onclick = close;
    el = document.createElement('div'); el.className = 'ph-sheet su-sheet'; el.id = id; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', label);
    el.innerHTML = `<div class="ph-grab" aria-hidden="true"></div>${html}`;
    const h = el.querySelector('.ph-h');   // every sheet has a close X (docs/NAVIGATION.md: the create sheet always has a way out)
    if (h) h.insertAdjacentHTML('beforeend', '<button type="button" class="su-x" data-su-close aria-label="Close"><svg class="i" width="16" height="16" aria-hidden="true"><use href="#i-x"/></svg></button>');
    document.body.append(scrim, el);
    el.querySelectorAll('[data-su-close]').forEach(b => { b.onclick = close; });
    el.querySelectorAll('[data-su-back]').forEach(b => { b.onclick = () => where(); });
    el.querySelectorAll('[data-su-join]').forEach(b => { b.onclick = () => { close(); if (window.TribeSettings && window.TribeSettings.joinPrompt) window.TribeSettings.joinPrompt(); }; });   // polish: joining a friend is one tap from Start and Where
    return el;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && el) { close(); e.stopPropagation(); } }, true);
  const back = '<button class="ph-back" data-su-back aria-label="Back"><svg class="i" width="16" height="16" aria-hidden="true"><use href="#i-chev"/></svg></button>';

  // ---------- 1. Start a project (instant, on this device) ----------
  const SEATS = [['ceo', 'CEO', 'where it is going'], ['cto', 'Build', 'making it'], ['growth', 'Grow', 'finding people'], ['ops', 'Run', 'keeping it working']];
  function start(o = {}) {
    const st = S().get(), first = (st.name && st.name !== 'Me' ? st.name : '').split(' ')[0];
    const seatRow = ([k, t, sub]) => `<div class="su-seat" role="group" aria-label="${t} seat"><span class="su-seat-t"><b>${t}</b><small>${sub}</small></span>
      <span class="su-seg">${[['me', 'Me'], ['ai', 'AI'], ['later', 'Later']].map(([v, l]) => `<button type="button" data-seat="${k}" data-v="${v}" aria-pressed="${(k === 'ceo' ? 'me' : 'later') === v}">${l}</button>`).join('')}</span></div>`;
    const s = sheet(`<header class="ph-h"><div><span class="eyebrow">Start a project</span><h3>What are you making?</h3></div></header>
      <form id="su-form" autocomplete="off">
        <label class="ph-lab" for="su-name">Name</label>
        <input class="input" id="su-name" maxlength="48" required placeholder="e.g. Pixel Quest" value="${esc(o.name || '')}">
        <label class="ph-lab" for="su-bio">In one line <span class="su-opt">optional</span></label>
        <input class="input" id="su-bio" maxlength="300" placeholder="e.g. A cozy pixel game we build on weekends" value="${esc(o.bio || '')}">
        <details class="su-more" id="su-notes-d"><summary>Notes and first tasks <span class="su-opt">optional</span></summary>
          <label class="ph-lab" for="su-notes">Notes</label><textarea class="input" id="su-notes" rows="3" maxlength="4000" placeholder="Anything you already know: ideas, links, who's in"></textarea>
          <label class="ph-lab" for="su-tasks">First tasks, one per line</label><textarea class="input" id="su-tasks" rows="3" maxlength="3000" placeholder="Sketch the title screen&#10;Pick a color palette"></textarea>
        </details>
        <details class="su-more" id="su-co-d"><summary>Run it like a company <span class="su-opt">optional</span></summary>
          <p class="ph-note su-co-note">Seats for the jobs a business needs. Leave anything for later; Company keeps every section to fill in when you're ready.</p>
          <label class="ph-lab" for="su-co-name">Company name</label><input class="input" id="su-co-name" maxlength="60" placeholder="Later is fine">
          <label class="ph-lab" for="su-co-mission">Mission</label><input class="input" id="su-co-mission" maxlength="400" placeholder="One or two sentences, or later">
          <span class="ph-lab">Seats</span><div class="su-seats">${SEATS.map(seatRow).join('')}</div>
        </details>
        <p class="ph-note">It starts right here${first ? `, ${esc(first)}` : ''}: nothing waits on a server. You choose where it lives at the end, or any time later.</p>
        <div class="ph-acts"><button type="button" class="btn" data-su-close>Cancel</button><button class="btn primary" id="su-create" type="submit">Create</button></div>
      </form>
      <p class="ph-foot"><button type="button" class="linkish" data-su-join>Join with a link</button></p>`, 'su-start', 'Start a project');
    s.querySelectorAll('[data-seat]').forEach(b => b.onclick = () => { s.querySelectorAll(`[data-seat="${b.dataset.seat}"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    s.querySelector('#su-form').onsubmit = e => { e.preventDefault(); create(s); };
    const n = s.querySelector('#su-name'); n.focus(); n.select();
    return s;
  }
  function create(s) {
    const v = id => (s.querySelector(id) || {}).value || '';
    const name = v('#su-name').trim(); if (!name) return s.querySelector('#su-name').focus();
    const co = s.querySelector('#su-co-d').open || v('#su-co-name').trim() || v('#su-co-mission').trim();
    const seats = {}; s.querySelectorAll('[data-seat][aria-pressed="true"]').forEach(b => { seats[b.dataset.seat] = b.dataset.v; });
    const draft = { name, bio: v('#su-bio').trim(), notes: v('#su-notes'), tasks: v('#su-tasks').split('\n').map(x => x.trim()).filter(Boolean),
      company: co ? { name: v('#su-co-name').trim(), mission: v('#su-co-mission').trim(), seats } : null };
    if (!OFF() || !OFF().start) return toast('Setup did not load. Reload the app.');
    close();
    OFF().start('solo', draft);   // instant: the local backend answers the app from here on
    try { localStorage.setItem('tribecode.setup.wherePending', '1'); } catch {}
    const offer = () => { if (window.TribeClient && window.TribeClient.connected()) where({ first: true }); else setTimeout(offer, 120); };
    setTimeout(offer, 700);
  }

  // ---------- 2. Where should it live? (optional, last; also from the pill any time) ----------
  const pid = () => { const o = OFF(); const db = o && o.solo && o.solo() ? o.state() : null; return db ? (db.current || (db.projects[0] || {}).id) : null; };
  const homeOf = id => ((OFF() && OFF().homes ? OFF().homes() : {})[id || pid()] || {});
  function where(o = {}) {
    try { localStorage.removeItem('tribecode.setup.wherePending'); } catch {}
    if (!(OFF() && OFF().solo && OFF().solo())) {
      if (window.TribeClient && window.TribeClient.connected()) return toast('This project already has a home.');
      return start();
    }
    const gh = homeOf().github, desk = desktopApp();
    const row = (k, icon, title, sub, tag, live) => `<button class="ph-row" data-su="${k}"><span class="ph-ic${live ? ' live' : ''}">${ic(icon)}</span><span class="ph-tt"><b>${title}${tag ? ` <em class="ph-tag">${tag}</em>` : ''}</b><small>${sub}</small></span><span class="ph-go">${ic('chev', 16)}</span></button>`;
    const s = sheet(`<header class="ph-h"><div><span class="eyebrow">${o.first ? 'Last step · optional' : 'Where it lives'}</span><h3>Where should it live?</h3></div></header>
      <p class="ph-lead">${o.first ? 'It already works here. Pick a home now so friends can join, or decide later from the pill at the top.' : 'It works on this device now. A home lets friends see it and join.'}</p>
      <div class="ph-list">
        ${row('github', 'git', 'A GitHub repo', gh ? `Live on ${esc(gh.repo)}` : 'Anyone can see the live repo and suggested changes. No server needed', gh ? 'Connected' : 'Light', true)}
        ${row('computer', 'box', 'This computer', desk ? 'The desktop app hosts it here. Friends join with a link' : 'The TribeCode app or server on this computer hosts it')}
        ${row('cloud', 'net', 'Free cloud', 'Always online on a free Render server')}
        ${row('phone', 'zap', 'Phone', phoneLike() ? 'Keep it on this phone, or host from an Android phone' : 'Host from an Android phone with Termux')}
      </div>
      <p class="ph-foot"><button class="linkish" data-su-close id="su-later">Decide later</button><span aria-hidden="true">·</span><button class="linkish" data-su-join>Join with a link</button></p>`, 'su-where', 'Where should it live?');
    s.addEventListener('click', e => {
      const b = e.target.closest('[data-su]'); if (!b) return;
      choose(b.dataset.su);
    });
    return s;
  }
  function choose(home) {
    if (home === 'github') return githubSheet();
    if (home === 'computer') return computer();
    if (home === 'cloud') return cloud();
    if (home === 'phone') return phone();
  }

  // ---------- This computer: sync the draft into the server here ----------
  function syncing(title) {
    return sheet(`<header class="ph-h">${back}<div><span class="eyebrow">This computer</span><h3>${esc(title)}</h3></div></header>
      <div class="su-prog" id="su-prog" role="status" aria-live="polite"><span class="su-spin" aria-hidden="true"></span><span id="su-prog-t">Starting…</span></div>
      <div id="su-fail"></div>`, 'su-computer', 'This computer');
  }
  const step = t => { const x = document.getElementById('su-prog-t'); if (x) x.textContent = t; };
  function failed(msg, retry) {
    const box = document.getElementById('su-fail'), prog = document.getElementById('su-prog'); if (!box) return;
    if (prog) prog.hidden = true;
    const line = String(msg || '').split('\n')[0] || 'It didn’t work this time.';
    box.innerHTML = `<div class="su-err" role="alert"><b>Couldn’t move it to this computer.</b> <span>${esc(line)}</span>
      ${String(msg).includes('\n') || desktopApp() ? `<details><summary>Details</summary><pre>${esc(msg)}</pre></details>` : ''}
      <div class="ph-acts"><button class="btn" id="su-offline">Keep working offline</button><button class="btn primary" id="su-retry">Try again</button></div></div>
      <p class="ph-note">Your project is safe on this device; nothing was lost.</p>`;
    box.querySelector('#su-retry').onclick = retry;
    box.querySelector('#su-offline').onclick = () => { close(); toast('Still on this device. Choose a home any time from the pill at the top.'); };
  }
  async function computer() {
    const s = syncing('Moving it to this computer');
    try {
      if (desktopApp()) {
        step('Starting the tribe server on this computer…');
        const r = A() && A().hostHere ? await A().hostHere({ silent: true }) : { ok: false, error: 'The app did not load. Reload it.' };
        if (!r || !r.ok) throw new Error((r && r.error) || 'The tribe server did not start.');
        const st = S().get();
        return await importTo(r.url, st.server.token, { hosting: true });
      }
      // A browser page served by a TribeCode server (npm start, the Working version): that server is "this computer".
      const served = /^https?:$/.test(location.protocol) && !/(^|\.)tauri\.localhost$/i.test(location.hostname);
      let h = null;
      if (served) { step('Looking for TribeCode on this computer…'); h = await realFetch(location.origin + '/api/health', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null); }
      if (!h || h.offlineDemo) { close(); return getApp(); }
      if (h.cloud) throw new Error('This page comes from a cloud server. Use Free cloud and its invite link instead.');
      const st = S().get();
      let token = '';
      if (!h.members) {
        step('Making your tribe on this computer…');
        const r = await realFetch(location.origin + '/api/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: st.name && st.name !== 'Me' ? st.name : 'Host', color: st.color }) });
        const d = await r.json().catch(() => ({})); if (!r.ok || !d.token) throw new Error(d.error || `The server said ${r.status}.`);
        token = d.token;
      } else {
        step('Signing in to the tribe on this computer…');
        const ss = await realFetch(location.origin + '/api/session', { credentials: 'include' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
        token = (ss && ss.token) || ((st.staleServer && st.staleServer.url === location.origin && st.staleServer.token) || '');
        if (!token) { close(); toast('This computer already has a tribe. Paste an invite link from its host to move your project in.'); return PH() && PH().move(); }
      }
      return await importTo(location.origin, token, { hosting: false });
    } catch (e) { failed(e && e.message || String(e), computer); }
  }
  // Send the draft (idempotent: the host remembers draftId), then switch this device over to the host. The local copy
  // is forgotten only after the host answered that it has everything.
  async function importTo(server, token, { hosting }) {
    step('Bringing your project over…');
    const data = OFF().exportSolo();
    let r, d;
    for (let i = 0; i < 3; i++) {   // a dropped connection retries the same draft; the host makes no second copy
      try { r = await realFetch(`${server}/api/import/solo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(data) }); d = await r.json().catch(() => ({})); break; }
      catch (e) { if (i === 2) throw new Error('Couldn’t reach the tribe server. Is it still running?'); await new Promise(res => setTimeout(res, 600 * (i + 1))); }
    }
    if (!r.ok) throw new Error(d.error || `The server said ${r.status}.`);
    const name = S().get().name, first = (d.projects || [])[0];
    OFF().forget();
    S().set({ server: { url: server, token }, hosting: !!hosting, ...(hosting ? { hostOff: false, tribeHere: true } : {}), name });
    try { if (first && first.id) localStorage.setItem('tribecode.project:' + server, first.id); sessionStorage.setItem('tribecode.view', 'home'); } catch {}
    step('Done. Opening it…');
    toast(d.again ? 'It was already there. Opening it.' : `${(first && first.name) || 'Your project'} now lives on this computer.`);
    setTimeout(() => location.reload(), 300);
    return d;
  }
  function getApp() {
    if (PH() && PH().computer) return PH().computer();
    window.open((window.TribeWeb && window.TribeWeb.RELEASES) || 'https://github.com/orionopenwow/TribeCode/releases/latest', '_blank', 'noopener');
  }

  // ---------- Free cloud and Phone: the existing steps (phonehost.js), then Move with an invite link ----------
  function cloud() {
    const s = sheet(`<header class="ph-h">${back}<div><span class="eyebrow">Free cloud</span><h3>A home that stays online</h3></div></header>
      <ol class="ph-steps">
        <li>Open Render and sign in (GitHub works). It reads TribeCode’s setup by itself.</li>
        <li>Tap Apply and wait a few minutes for the first build.</li>
        <li>Open your new address, enter TRIBE_SETUP_CODE and your name. You’re the host.</li>
        <li>Make an invite link there, then come back and tap Move.</li>
      </ol>
      <p class="ph-note">Free plan: it naps after 15 minutes alone and wakes in about a minute. Cloud save brings everything back.</p>
      <div class="ph-acts"><a class="btn" href="https://render.com/deploy?repo=https://github.com/orionopenwow/TribeCode" target="_blank" rel="noopener">Open Render</a><button class="btn primary" id="su-move">I have the link · Move</button></div>`, 'su-cloud', 'Free cloud');
    s.querySelector('#su-move').onclick = () => { close(); PH() && PH().move(); };
  }
  function phone() {
    const s = sheet(`<header class="ph-h">${back}<div><span class="eyebrow">Phone</span><h3>${phoneLike() ? 'Keep it on this phone' : 'Host from a phone'}</h3></div></header>
      <div class="ph-list">
        ${phoneLike() ? `<button class="ph-row" data-p="stay"><span class="ph-ic live">${ic('spark')}</span><span class="ph-tt"><b>Keep it on this phone</b><small>It already lives here. Friends join once it moves to a host</small></span><span class="ph-go">${ic('chev', 16)}</span></button>` : ''}
        <button class="ph-row" data-p="android"><span class="ph-ic">${ic('zap')}</span><span class="ph-tt"><b>My Android (Termux)</b><small>One line starts a host on an Android phone you keep charged</small></span><span class="ph-go">${ic('chev', 16)}</span></button>
        <button class="ph-row" data-p="move"><span class="ph-ic">${ic('link')}</span><span class="ph-tt"><b>It's running · Move</b><small>Paste the invite link the phone printed</small></span><span class="ph-go">${ic('chev', 16)}</span></button>
      </div>
      <p class="ph-note">iPhones can’t host (no background apps). Use a GitHub repo, a computer or a free cloud instead.</p>`, 'su-phone', 'Phone');
    s.addEventListener('click', e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      if (b.dataset.p === 'stay') { close(); return toast('It stays on this phone.'); }
      if (b.dataset.p === 'android') { close(); return PH() && PH().termux(); }
      if (b.dataset.p === 'move') { close(); return PH() && PH().move(); }
    });
  }

  // ---------- A GitHub repo: "lightly live" (docs/LIGHT-HOSTING.md) ----------
  const token = () => { try { return localStorage.getItem(TKEY) || ''; } catch { return ''; } };
  async function gh(path, o = {}) {
    const t = o.token !== undefined ? o.token : token();
    const r = await realFetch(GH + path, { method: o.method || 'GET', headers: { Accept: 'application/vnd.github+json', ...(t ? { Authorization: 'Bearer ' + t } : {}), ...(o.body ? { 'Content-Type': 'application/json' } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
    const d = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.message || `GitHub said ${r.status}`); e.status = r.status; throw e; }
    return d;
  }
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const unb64 = s => { try { return decodeURIComponent(escape(atob(String(s || '').replace(/\n/g, '')))); } catch { return null; } };
  function parseRepo(v) {
    const m = String(v || '').trim().replace(/\.git$/, '').match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/);
    return m ? `${m[1]}/${m[2]}` : '';
  }
  function githubSheet() {
    const cur = homeOf().github || {};
    const s = sheet(`<header class="ph-h">${back}<div><span class="eyebrow">A GitHub repo</span><h3>Live on GitHub</h3></div></header>
      <p class="ph-lead">The repo is the shared truth: anyone can see it, and suggestions (tasks, the project page, docs) appear as plain files on a <code>${BRANCH}</code> branch. No server needs to stay on.</p>
      <label class="ph-lab" for="su-gh-repo">Repository</label>
      <input class="input" id="su-gh-repo" placeholder="owner/name or https://github.com/owner/name" value="${esc(cur.repo || '')}" spellcheck="false">
      <label class="ph-lab" for="su-gh-tok">Token to write suggestions <span class="su-opt">optional</span></label>
      <input class="input" id="su-gh-tok" type="password" placeholder="A fine-grained token with Contents: read and write" value="${token() ? '••••••••' : ''}" autocomplete="off">
      <p class="ph-note">Without a token the project shows the live repo (read only). The token stays on this device and never goes into the project or to a server.</p>
      <p class="ph-err hidden" id="su-gh-err" role="alert"></p>
      <div id="su-gh-live"></div>
      <div class="ph-acts"><button class="btn" data-su-close>Not now</button><button class="btn primary" id="su-gh-go">${cur.repo ? 'Update' : 'Connect'}</button></div>`, 'su-github', 'A GitHub repo');
    const err = t => { const e = s.querySelector('#su-gh-err'); e.textContent = t; e.classList.toggle('hidden', !t); };
    if (cur.repo) live().then(v => drawLive(s.querySelector('#su-gh-live'), v)).catch(() => {});
    s.querySelector('#su-gh-repo').focus();
    s.querySelector('#su-gh-go').onclick = async () => {
      err(''); const repo = parseRepo(s.querySelector('#su-gh-repo').value), tv = s.querySelector('#su-gh-tok').value.trim();
      if (!repo) return err('Type the repository as owner/name.');
      const btn = s.querySelector('#su-gh-go'); btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const r = await connect(repo, tv && !/^•+$/.test(tv) ? tv : undefined);
        drawLive(s.querySelector('#su-gh-live'), r.live);
        btn.textContent = 'Done'; btn.disabled = false; btn.onclick = close;
        toast(r.mirrored ? `Live on GitHub: ${r.mirrored} suggestion file${r.mirrored === 1 ? '' : 's'} on ${BRANCH}.` : `Connected to ${repo}.`);
      } catch (e) { err(e.status === 404 ? 'GitHub can’t find that repo. Check the name, or add a token for a private repo.' : e.status === 401 ? 'GitHub didn’t accept that token.' : e.message); btn.disabled = false; btn.textContent = 'Connect'; }
    };
  }
  async function connect(repo, tok) {
    if (tok !== undefined) { try { if (tok) localStorage.setItem(TKEY, tok); else localStorage.removeItem(TKEY); } catch {} }
    const info = await gh(`/repos/${repo}`);
    OFF().setHome(pid(), { github: { repo: info.full_name || repo, branch: BRANCH, default: info.default_branch || 'main', url: info.html_url || `https://github.com/${repo}`, at: new Date().toISOString() } });
    cache = null;
    let mirrored = 0;
    if (token()) mirrored = (await mirror()).written;
    return { live: await live(true), mirrored };
  }
  // The suggestions, as plain files: .tribe/project.md, .tribe/tasks.md and .tribe/docs/<slug>.md on a PR-less branch.
  function files() {
    const db = OFF().state(), p = db.projects.find(x => x.id === pid()) || db.projects[0], co = (db.company || {})[p.id];
    const tasks = db.tasks[p.id] || [], docs = db.docs[p.id] || [];
    const by = k => tasks.filter(t => t.status === k).map(t => `- [${k === 'done' ? 'x' : ' '}] ${t.title}`).join('\n') || '_none_';
    const out = {
      '.tribe/README.md': `# Suggested changes from TribeCode\n\nThis branch is written by TribeCode from ${p.name}'s local-first project. Everything here is a suggestion: read it on GitHub, discuss it, and merge what you like. Nothing here runs.\n\nSee docs/LIGHT-HOSTING.md in TribeCode for how this works.\n`,
      '.tribe/project.md': `# ${p.name}\n\n${p.bio || ''}\n\n${db.vision[p.id] ? `## Vision\n\n${db.vision[p.id]}\n\n` : ''}${co ? `## Company\n\n- Name: ${co.name || 'later'}\n- Mission: ${co.mission || 'later'}\n${Object.entries(co.seats || {}).map(([k, v]) => `- Seat ${k}: ${v}`).join('\n')}\n` : ''}`,
      '.tribe/tasks.md': `# Tasks\n\n## To do\n\n${by('backlog')}\n\n## Doing\n\n${by('doing')}\n\n## Review\n\n${by('review')}\n\n## Done\n\n${by('done')}\n`,
    };
    for (const d of docs) out[`.tribe/docs/${String(d.slug || d.title).replace(/[^\w-]+/g, '-').slice(0, 60) || 'doc'}.md`] = d.body && /^#\s/.test(d.body) ? d.body : `# ${d.title}\n\n${d.body || ''}`;
    return out;
  }
  async function mirror() {
    const h = homeOf().github; if (!h) throw new Error('Connect a repo first.');
    if (!token()) throw new Error('Add a token to write suggestions.');
    const repo = h.repo, br = h.branch || BRANCH;
    try { await gh(`/repos/${repo}/git/ref/heads/${br}`); }
    catch (e) {
      if (e.status !== 404) throw e;
      const base = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(h.default || 'main')}`);
      await gh(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${br}`, sha: base.object.sha } });
    }
    let written = 0;
    for (const [path, text] of Object.entries(files())) {
      let sha; try { const cur = await gh(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(br)}`); sha = cur.sha; if (unb64(cur.content) === text) continue; } catch (e) { if (e.status !== 404) throw e; }
      await gh(`/repos/${repo}/contents/${path}`, { method: 'PUT', body: { message: `TribeCode: ${path.replace('.tribe/', '')}`, content: b64(text), branch: br, ...(sha ? { sha } : {}) } });
      written++;
    }
    OFF().setHome(pid(), { github: { ...h, synced: new Date().toISOString() } });
    cache = null;
    return { written };
  }
  let cache = null;
  async function live(force) {
    const h = homeOf().github; if (!h) return null;
    if (!force && cache && cache.repo === h.repo && Date.now() - cache.t < 60000) return cache.v;
    const [repo, commits, branches, pulls] = await Promise.all([
      gh(`/repos/${h.repo}`), gh(`/repos/${h.repo}/commits?per_page=3`).catch(() => []),
      gh(`/repos/${h.repo}/branches?per_page=100`).catch(() => []), gh(`/repos/${h.repo}/pulls?state=open&per_page=5`).catch(() => []),
    ]);
    const v = { repo: h.repo, url: repo.html_url || h.url, branch: repo.default_branch, pushed: repo.pushed_at, synced: h.synced || null,
      commits: (commits || []).map(c => ({ sha: String(c.sha || '').slice(0, 7), msg: String((c.commit || {}).message || '').split('\n')[0], at: ((c.commit || {}).author || {}).date })),
      suggestions: (branches || []).filter(b => /^tribe\//.test(b.name)).map(b => b.name), pulls: (pulls || []).map(p => ({ n: p.number, title: p.title, url: p.html_url })) };
    cache = { repo: h.repo, t: Date.now(), v };
    return v;
  }
  const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
  function drawLive(box, v) {
    if (!box) return;
    if (!v) { box.innerHTML = ''; return; }
    box.innerHTML = `<section class="su-live" aria-label="Live on GitHub"><div class="su-live-h"><span class="eyebrow">Live on GitHub</span><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.repo)}</a></div>
      <ul class="su-live-l">
        ${v.commits.length ? v.commits.map(c => `<li><code>${esc(c.sha)}</code> ${esc(c.msg)} <span class="faint">${esc(ago(c.at))}</span></li>`).join('') : '<li class="faint">No commits yet.</li>'}
      </ul>
      <p class="su-live-f">${v.suggestions.length ? `Suggested changes: ${v.suggestions.map(b => `<a href="${esc(v.url)}/tree/${esc(b)}" target="_blank" rel="noopener"><code>${esc(b)}</code></a>`).join(' ')}` : 'No suggestions branch yet.'}${v.pulls.length ? ` · ${v.pulls.length} open pull request${v.pulls.length === 1 ? '' : 's'}` : ''}${v.synced ? ` · mirrored ${esc(ago(v.synced))}` : ''}
        ${token() ? '<button class="linkish" data-su-mirror>Mirror now</button>' : ''}</p></section>`;
    const m = box.querySelector('[data-su-mirror]'); if (m) m.onclick = async () => { m.disabled = true; m.textContent = 'Mirroring…'; try { const r = await mirror(); toast(r.written ? `${r.written} file${r.written === 1 ? '' : 's'} mirrored.` : 'GitHub already has everything.'); drawLive(box, await live(true)); } catch (e) { toast(e.message); m.disabled = false; m.textContent = 'Mirror now'; } };
  }
  // The live repo state on the project's Home (only for a local draft that lives on GitHub).
  function mountHome() {
    const home = document.getElementById('view-home');
    if (!home || !(OFF() && OFF().solo && OFF().solo()) || !homeOf().github) { const old = document.getElementById('su-home-live'); if (old) old.remove(); return; }
    let box = document.getElementById('su-home-live');
    if (!box) { box = document.createElement('div'); box.id = 'su-home-live'; box.className = 'su-home-live'; home.prepend(box); }
    live().then(v => drawLive(box, v)).catch(e => { box.innerHTML = `<section class="su-live"><span class="eyebrow">Live on GitHub</span><p class="faint">${esc(e.message)}</p></section>`; });
  }
  let homeT = null;
  new MutationObserver(() => { clearTimeout(homeT); homeT = setTimeout(() => { if (document.body.dataset.view === 'home' && !document.getElementById('su-home-live')) mountHome(); }, 150); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-view'], childList: true });
  // A reload right after Create (before choosing) offers the last step again.
  addEventListener('load', () => { let p = null; try { p = localStorage.getItem('tribecode.setup.wherePending'); } catch {} if (p && OFF() && OFF().solo && OFF().solo()) setTimeout(() => { if (!el) where({ first: true }); }, 1200); });

  const api = { start, where, choose, close, github: { connect, live, mirror, files }, state: () => ({ open: el ? el.id : null, pid: pid(), home: homeOf() }), pid };
  window.TribeLocalSetup = api;
  // Also on window.TribeSetup (setup.js owns that name for the role cards): TribeSetup.start() / .where() for other screens.
  const alias = () => { const t = window.TribeSetup; if (!t) return; if (!t.start) t.start = start; if (!t.where) t.where = where; };
  alias(); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alias); else setTimeout(alias, 0);
})();
