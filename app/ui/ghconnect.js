// Connect GitHub: the one flow (feat/setup-github, docs/GITHUB-CONNECT.md). Every door opens this:
//   setup's "GitHub" choice (tribenew.js mounts the block inline), the Sharing and backup card and its More options
//   (livingrepo.js github(), offline.js), a project's "Connect a code repository" (projects.js), Settings and Ctrl K.
// Three steps, one sheet:
//   1. Sign in. With a GitHub app id on the host (env, Settings, or TribeCode's built-in one) it is one button
//      ("Sign in with GitHub": a short code approved on github.com; github.js draws it). Without one, the owner sees a
//      calm line saying what switches it on and everyone can paste a token instead. The token is sent once to the
//      host, kept there, and never comes back to any browser.
//   2. Pick or create where the project goes on GitHub, in one click (GET/POST /api/github/repos).
//   3. Done: connected as @name, the link, and when it was last backed up.
// A tribe that lives only in this browser has no host to keep a sign-in, so there the block asks for owner/name and an
// optional token that stays on this device (setuplocal.js github.connect does the work, as before).
// Public: window.TribeGitHubConnect = { open(o), mount(el, o) -> { value(), resolve() }, slug(name) }
(function () {
  'use strict';
  const C = () => window.TribeClient, OFF = () => window.TribeOffline, L = () => window.TribeLocalSetup, UI = () => window.TribeUI;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const solo = () => !!(OFF() && OFF().solo && OFF().solo());
  const live = () => !!(C() && C().connected && C().connected()) && !solo();
  const pidNow = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C() && C().project && C().project()) || '';
  const slug = n => String(n || '').normalize('NFKD').replace(/[^\w\s.-]+/g, '').trim().replace(/\s+/g, '-').replace(/^[.-]+|[.-]+$/g, '').toLowerCase().slice(0, 90) || 'my-project';
  const parse = v => { const m = String(v || '').trim().replace(/\.git$/, '').match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/); return m ? `${m[1]}/${m[2]}` : ''; };
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const GH = '<svg class="gh-i" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 2.8 5.8 3.1 5.8 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>';

  // ---------- the block: sign in, then pick or create ----------
  // o: { name (the project's, for the suggested name), repo (already typed), local (force the this-browser form), onChange(value), onState(state) }
  function mount(el, o = {}) {
    const st = { mode: 'new', name: slug(o.name), priv: true, repo: parse(o.repo) || '', token: '', login: '', signedIn: false, repos: null, local: !!o.local || !live(), dead: false };
    const value = () => (st.local ? { repo: parse(st.repo), token: st.token.trim(), create: false }
      : !st.signedIn ? { repo: '', create: false }
      : st.mode === 'new' ? { repo: st.login && st.name ? `${st.login}/${st.name}` : '', create: true, private: st.priv }
      : { repo: parse(st.repo), create: false });
    const tell = () => { if (o.onChange) o.onChange(value()); };
    const say = t => { const e = el.querySelector('#ghc-err'); if (e) { e.textContent = t || ''; e.hidden = !t; } };

    function drawLocal() {
      el.innerHTML = `<div class="ghc" data-ghc="local">
        <p class="ph-note ghc-calm" id="ghc-local-note">In this browser GitHub works with a link and, to save changes there, a token. Sign in with one click once this tribe is on a computer.</p>
        <label class="ph-lab" for="ghc-repo">Where on GitHub</label><input class="input" id="ghc-repo" placeholder="owner/name or https://github.com/owner/name" spellcheck="false" autocomplete="off" value="${esc(st.repo)}">
        <details class="su-more"><summary>Token to save changes there <span class="su-opt">optional</span></summary><input class="input" id="ghc-tok" type="password" autocomplete="off" placeholder="github_pat_…" aria-label="GitHub token">
        <p class="ph-note">Without one it is shown read-only. A token stays on this device only.</p></details></div>`;
      const r = el.querySelector('#ghc-repo'), t = el.querySelector('#ghc-tok');
      r.oninput = () => { st.repo = r.value; tell(); }; t.oninput = () => { st.token = t.value; tell(); };
      if (o.onState) o.onState('local');
    }
    function drawSignIn(gh) {
      const owner = gh && gh.canConfigure, ready = gh && gh.configured;
      el.innerHTML = `<div class="ghc" data-ghc="signin">
        <span class="ph-lab">1 · Sign in to GitHub</span>
        ${ready ? '' : `<p class="ph-note ghc-calm" id="ghc-off">${owner ? 'One-click sign-in isn’t switched on yet. A token works for now.' : 'One-click sign-in isn’t switched on for this tribe yet. Pasting a token works the same.'}</p>`}
        <div id="ghc-sign"></div>
        <p class="ph-note">Your sign-in is kept on the computer that runs this tribe. Nobody else in the tribe can see or use it.</p></div>`;
      if (window.TribeGitHub) { window.TribeGitHub.noAuto = true; window.TribeGitHub.mount(el.querySelector('#ghc-sign')); }
      if (o.onState) o.onState('signin');
    }
    function drawPick() {
      const list = st.repos || [];
      el.innerHTML = `<div class="ghc" data-ghc="pick">
        <div class="ghc-who"><span class="ghc-av">${GH}</span><span class="ghc-who-t"><b id="ghc-login">Connected as @${esc(st.login)}</b></span><button type="button" class="linkish" id="ghc-out">Sign out</button></div>
        <span class="ph-lab" id="ghc-where-l">2 · Where it goes on GitHub</span>
        <div class="ghc-seg" role="radiogroup" aria-labelledby="ghc-where-l"><button type="button" role="radio" data-ghc-mode="new" aria-checked="${st.mode === 'new'}">Create a new one</button><button type="button" role="radio" data-ghc-mode="pick" aria-checked="${st.mode === 'pick'}">Use one I have</button></div>
        ${st.mode === 'new' ? `<label class="ph-lab" for="ghc-name">Name</label><div class="ghc-name"><span>${esc(st.login)}/</span><input class="input" id="ghc-name" maxlength="100" spellcheck="false" autocomplete="off" value="${esc(st.name)}"></div>
          <label class="lr-check ghc-check"><input type="checkbox" id="ghc-private" ${st.priv ? 'checked' : ''}> <span>Private: only people you invite on GitHub can see it</span></label>`
        : `${list.length ? `<label class="ph-lab" for="ghc-pick">Yours on GitHub</label><select class="input" id="ghc-pick"><option value="">Pick one…</option>${list.map(r => `<option value="${esc(r.name)}"${r.name === st.repo ? ' selected' : ''}>${esc(r.name)}${r.private ? ' (private)' : ''}</option>`).join('')}</select>` : st.repos ? '<p class="ph-note" id="ghc-none">Nothing on your GitHub yet. Create a new one, or type one below.</p>' : '<p class="ph-note">Looking at your GitHub…</p>'}
          <label class="ph-lab" for="ghc-repo">Or type it</label><input class="input" id="ghc-repo" placeholder="owner/name or https://github.com/owner/name" spellcheck="false" autocomplete="off" value="${esc(st.repo)}">`}
        <p class="tn-err ghc-err" id="ghc-err" role="status" hidden></p></div>`;
      el.querySelectorAll('[data-ghc-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.ghcMode; drawPick(); tell(); if (st.mode === 'pick' && !st.repos) loadRepos(); });
      el.querySelector('#ghc-out').onclick = async () => { try { await C().api('/github/signout', { method: 'POST' }); st.signedIn = false; st.repos = null; refresh(); } catch (e) { say(e.message); } };
      const n = el.querySelector('#ghc-name'); if (n) n.oninput = () => { st.name = n.value.trim(); say(''); tell(); };
      const p = el.querySelector('#ghc-private'); if (p) p.onchange = () => { st.priv = p.checked; tell(); };
      const sel = el.querySelector('#ghc-pick'), r = el.querySelector('#ghc-repo');
      if (sel) sel.onchange = () => { st.repo = sel.value; if (r) r.value = sel.value; say(''); tell(); };
      if (r) r.oninput = () => { st.repo = r.value; if (sel) sel.value = ''; say(''); tell(); };
      if (o.onState) o.onState('pick');
    }
    async function loadRepos() {
      try { st.repos = (await C().api('/github/repos')).repos || []; } catch (e) { st.repos = []; if (!st.dead && el.isConnected) { drawPick(); say(e.message); } return; }
      if (!st.dead && el.isConnected && st.signedIn && st.mode === 'pick') drawPick();
    }
    async function refresh() {
      if (st.dead || !el.isConnected) return;
      if (st.local) { drawLocal(); return tell(); }
      let gh = null; try { gh = (await C().api('/github')).github; } catch (e) { el.innerHTML = `<p class="ph-note">${esc(e.message)}</p>`; return; }
      if (st.dead || !el.isConnected) return;
      st.signedIn = !!gh.signedIn; st.login = gh.login || '';
      if (!st.signedIn) drawSignIn(gh); else { if (st.repo && st.mode === 'new' && o.repo) st.mode = 'pick'; drawPick(); if (st.mode === 'pick') loadRepos(); }
      tell();
    }
    const onIn = () => { if (!el.isConnected) { removeEventListener('tribe:github', onIn); st.dead = true; return; } refresh(); };
    addEventListener('tribe:github', onIn);
    el.innerHTML = '<p class="ph-note">Checking GitHub…</p>';
    refresh();

    // resolve(): makes the new one when "Create a new one" is chosen, and answers { repo, url, created }.
    async function resolve() {
      const v = value();
      if (st.local) { if (!v.repo) throw new Error('Type where it is on GitHub as owner/name.'); return { repo: v.repo, token: v.token, created: false }; }
      if (!st.signedIn) throw new Error('Sign in to GitHub first.');
      if (v.create) {
        if (!st.name) throw new Error('Give it a name.');
        const r = (await C().api('/github/repos', { method: 'POST', body: { name: st.name, private: st.priv, description: o.name ? `${o.name}: built together in TribeCode` : '' } })).repo;
        st.repos = null; return { repo: r.name, url: r.url, created: true, private: r.private };
      }
      if (!v.repo) throw new Error('Pick one from the list, or type it as owner/name.');
      return { repo: v.repo, url: `https://github.com/${v.repo}`, created: false };
    }
    return { value, resolve, refresh, say, stop: () => { st.dead = true; removeEventListener('tribe:github', onIn); if (window.TribeGitHub) window.TribeGitHub.noAuto = false; } };
  }

  // ---------- the sheet: connect one project, or show how it stands ----------
  // o: { pid, name, replace (pick another even when connected), after() }
  let cur = null;
  async function open(o = {}) {
    // A tribe that lives in this browser: its own guided path (a link, an optional token on this device).
    if (!live()) { if (L() && L().choose) return L().choose('github'); return toast('Start a tribe first, then connect GitHub.'); }
    if (cur) { try { cur.close(); } catch {} cur = null; }
    const pid = o.pid || pidNow();
    const P = window.TribeProjects, proj = ((P && P.list && P.list()) || []).find(x => x.id === pid) || {};
    let view = null; try { view = await C().api(`/projects/${encodeURIComponent(pid)}/sync`); } catch {}
    const s = (view && view.status) || {}, can = (view && view.can) || {};
    const sh = cur = UI().sheet({ id: 'ghc-sheet', kind: 'steps', eyebrow: 'GitHub', title: 'Connect GitHub', body: '<div id="ghc-body"></div>', foot: '<span id="ghc-foot"></span>', onClose: () => { if (ctl) ctl.stop(); if (cur === sh) cur = null; } });
    const body = sh.body.querySelector('#ghc-body'), foot = sh.foot;
    let ctl = null;

    function done(st2, login) {
      if (ctl) { ctl.stop(); ctl = null; }
      const last = st2.lastShip;
      sh.setTitle('GitHub is connected');
      body.innerHTML = `<div class="ghc" data-ghc="done">
        <div class="ghc-who"><span class="ghc-av">${GH}</span><span class="ghc-who-t"><b id="ghc-login">${login ? `Connected as @${esc(login)}` : 'Connected'}</b><a id="ghc-link" href="${esc(st2.url || '#')}" target="_blank" rel="noopener noreferrer">${esc(st2.repo || '')}</a></span></div>
        <p class="ph-note" id="ghc-last">${last && last.at ? `Last backup ${esc(ago(last.at))}${last.by ? ` by ${esc(last.by)}` : ''}.` : 'No backup yet. Nothing leaves this computer until you back up.'}</p></div>`;
      foot.innerHTML = `${can.edit ? '<button type="button" class="btn" id="ghc-change">Use another</button>' : ''}<span style="flex:1"></span><button type="button" class="btn" id="ghc-close">Done</button><button type="button" class="btn primary" id="ghc-backup">Back up now</button>`;
      foot.hidden = false;
      foot.querySelector('#ghc-close').onclick = () => sh.close();
      foot.querySelector('#ghc-backup').onclick = () => { sh.close(); if (window.TribeHome && window.TribeHome.sync) window.TribeHome.sync(); };
      const ch = foot.querySelector('#ghc-change'); if (ch) ch.onclick = () => pick();
    }
    function pick() {
      sh.setTitle('Connect GitHub');
      body.innerHTML = `<p class="ph-lead ghc-lead">A copy of ${esc(proj.name || 'this project')} is kept on GitHub when you back up. It stays on this computer too, and you can disconnect any time.</p><div id="ghc-mount"></div>
        ${can.edit === false ? '<p class="ph-note" id="ghc-noedit">Only the owner or the project lead connects GitHub. You can still sign in for your own backups.</p>' : ''}`;
      foot.innerHTML = '<button type="button" class="btn" id="ghc-cancel">Cancel</button><span style="flex:1"></span><button type="button" class="btn primary" id="ghc-go" disabled>Connect</button>';
      foot.hidden = false;
      const go = foot.querySelector('#ghc-go');
      foot.querySelector('#ghc-cancel').onclick = () => sh.close();
      ctl = mount(body.querySelector('#ghc-mount'), { name: o.name || proj.name, onState: k => { go.disabled = k !== 'pick' || can.edit === false; } });
      go.onclick = async () => {
        go.disabled = true; ctl.say('');
        try {
          const r = await ctl.resolve();
          const v2 = await C().api(`/projects/${encodeURIComponent(pid)}/sync`, { method: 'PUT', body: { kind: 'github', repo: r.repo, branch: 'main' } });
          let gh = null; try { gh = (await C().api('/github')).github; } catch {}
          toast(r.created ? `Made ${r.repo} on GitHub and connected it.` : `Connected ${r.repo}.`);
          try { dispatchEvent(new CustomEvent('tribe:github-connected', { detail: { pid, repo: r.repo } })); } catch {}
          if (window.TribeHome && window.TribeHome.refresh) window.TribeHome.refresh();
          if (window.TribeShare && window.TribeShare.refresh) window.TribeShare.refresh();
          done((v2 && v2.status) || { repo: r.repo, url: r.url }, gh && gh.login);
          if (o.after) o.after();
        } catch (e) { go.disabled = false; if (ctl) ctl.say(e.message); else toast(e.message); }
      };
    }
    if (s.connected && s.kind === 'github' && !o.replace) { let gh = null; try { gh = (await C().api('/github')).github; } catch {} done(s, gh && gh.signedIn ? gh.login : ''); }
    else pick();
    return sh;
  }

  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Action', label: 'Connect GitHub', keys: 'github connect backup repo repository code online copy', run: () => open() },
  ]);
  window.TribeGitHubConnect = { open, mount, slug, parse };
})();
