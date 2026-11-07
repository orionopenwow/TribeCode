// Project rooms, client side: the Projects cascade in the sidebar (each project unfolds into Overview,
// Chat, Docs, Tasks, Requests and More ›), the project Overview (pulse) and Requests views, the
// shared-workspace panel (GitHub sign-in on the host, "Give me a branch", commit/push as you), the
// "Start a project" flow (drop a folder or repo, paste a GitHub URL or a path), the invite project
// picker, and the mobile project switcher sheet. Server side: server/projects.js, rooms.js, workspace.js.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const App = () => window.TribeApp;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#38C6B1', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');
  const toast = m => App() && App().toast(m);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!isFinite(s)) return ''; if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`; };
  const ico = (id, sz = 16) => `<svg class="i" style="width:${sz}px;height:${sz}px"><use href="#${id}"/></svg>`;
  const CHEV = '<svg class="i pj-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.next', '.nuxt', '.cache', '.venv', 'venv', '__pycache__', '.gradle', '.idea', 'Pods', 'DerivedData', '.trees']);
  const CAP = 25 * 1024 * 1024;

  let projects = [], moreOpen = false, pulses = {};
  try { moreOpen = localStorage.getItem('tribecode.pjMore') === '1'; } catch {}
  const cur = () => C.project() || (projects[0] || {}).id;
  const curP = () => projects.find(p => p.id === cur()) || projects[0] || null;
  const me = () => C.state().me || {};
  const isHost = () => me().role === 'host';
  const scopedMe = () => Array.isArray(me().projects);
  const onHostMachine = () => !!(window.__TAURI__) || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const here = pid => (C.state().members || []).filter(m => m.online && m.project === pid);

  // ---------- data ----------
  let refreshing = null, again = false;
  async function refresh() {
    if (!C.hasToken() || !C.connected()) return;
    if (refreshing) { again = true; return refreshing; }
    refreshing = (async () => {
      try { const r = await C.api('/projects'); projects = r.projects || []; render(); } catch {}
      refreshing = null; if (again) { again = false; refresh(); }
    })();
    return refreshing;
  }
  let rt; const soon = (ms = 250) => { clearTimeout(rt); rt = setTimeout(refresh, ms); };

  // ---------- project circles (rail) + the project's nest (second column) ----------
  // A project's face: its image, else its emoji, else its initials on its color.
  const pinit = n => String(n || '?').trim().split(/[\s_-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  function face(p, cls = '') {
    if (p.image) return `<span class="pj-face ${cls} img" style="--pc:${esc(p.color)}"><img src="${esc(p.image)}" alt=""></span>`;
    return `<span class="pj-face ${cls} ${p.emoji ? 'emo' : ''}" style="--pc:${esc(p.color)};color:${ink(p.color)}">${esc(p.emoji || pinit(p.name))}</span>`;
  }
  const label = p => `${p.emoji ? esc(p.emoji) + ' ' : ''}${esc(p.name)}`;
  function badge(p) {
    const k = p.counts || {}, n = (pulses[p.id] || 0) + (k.requests || 0);
    return n ? `<span class="pj-badge" aria-label="${n} new">${n > 99 ? '99+' : n}</span>` : '';
  }
  function circles(where) {
    const c = cur();
    return projects.map(p => `<button class="pj-circle ${p.id === c ? 'on' : ''}" role="listitem" data-pj-open="${esc(p.id)}" title="${esc(p.name)}" aria-label="${esc(p.name)}${p.id === c ? ' (current project)' : ''}" aria-current="${p.id === c}">
        ${face(p)}${p.id === c ? '' : badge(p)}${here(p.id).some(m => m.id !== me().id) ? '<span class="pj-live-dot" title="People are here"></span>' : ''}</button>`).join('') +
      (where === 'strip' && !scopedMe() ? '<button class="pj-circle pj-plus" data-pj-new title="Start a project" aria-label="Start a project">+</button>' : '');
  }
  function item(view, text, icon, n, cls = '') {
    return `<button class="item pj-item" data-nav="${view}">${ico(icon)}<span>${text}</span>${n ? `<span class="n pj-n ${cls}">${n}</span>` : ''}</button>`;
  }
  function render() {
    const nav = $('#pj-nav'); if (!nav) return;
    const p = curP(), active = App() ? App().view() : 'home';
    const rail = $('#pj-rail'); if (rail) rail.innerHTML = circles('rail');
    const strip = $('#pj-strip'); if (strip) strip.innerHTML = circles('strip');
    const plus = $('#pj-plus'); if (plus) plus.classList.toggle('hidden', scopedMe());
    const homeBtn = document.querySelector('.rail [data-nav="home"]'); if (homeBtn) homeBtn.classList.toggle('hidden', scopedMe());
    const head = $('#nest-head');
    if (!p) { nav.innerHTML = ''; if (head) head.innerHTML = ''; return; }
    const k = p.counts || {}, tribeName = ((C.state().tribe || {}).name) || 'Tribe';
    if (head) head.innerHTML = `<button class="nest-title" data-nav="overview" title="${esc(p.name)} overview"><b>${esc(scopedMe() ? p.name : tribeName)}</b>${scopedMe() ? '' : `<span class="faint">/</span><span class="nest-p">${esc(p.name)}</span>`}</button>
      <div class="nest-sub faint">${here(p.id).length} here${k.tasks ? ` · ${k.tasks} open task${k.tasks > 1 ? 's' : ''}` : ''}</div>`;
    const inMore = ['calendar', 'repo', 'visuals', 'bugs', 'board'].concat(k.requests ? [] : ['requests']);
    const showMore = moreOpen || inMore.includes(active);
    const unread = Number(($('#nf-count') && !$('#nf-count').classList.contains('hidden') && $('#nf-count').textContent) || 0);
    nav.innerHTML = `
      ${item('docs', 'Docs', 'i-doc')}
      <button class="item pj-item" data-pnav="chat">${ico('i-chat')}<span>Chat</span>${pulses[p.id] ? `<span class="n pj-n hot">${pulses[p.id]}</span>` : ''}</button>
      <button class="item pj-item" data-pnav="inbox">${NOTIF}<span>Notifications</span>${unread ? `<span class="n pj-n hot">${unread}</span>` : ''}</button>
      ${item('tasks', 'Tasks', 'i-check', k.tasks)}
      ${k.requests ? item('requests', 'Requests', 'i-vote', k.requests, 'hot') : ''}
      <button class="item pj-item pj-more" aria-expanded="${showMore}" id="pj-more">${CHEV}<span>More</span>${!showMore && k.bugs ? `<span class="n pj-n">${k.bugs}</span>` : ''}</button>
      ${showMore ? `<div class="pj-more-list">
        ${item('overview', 'Overview', 'i-zap')}${k.requests ? '' : item('requests', 'Requests', 'i-vote')}${item('calendar', 'Calendar', 'i-cal')}${item('repo', 'Repo', 'i-git')}${item('visuals', 'Visuals', 'i-sparkle')}${item('bugs', 'Bugs', 'i-bug', k.bugs)}${item('board', 'Board', 'i-list')}
        <button class="item pj-item" data-float-more>${ico('i-more')}<span>Pop out a window</span></button>
      </div>` : ''}`;
    document.querySelectorAll('#pj-nav [data-nav], #nest-head [data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === active));
    const sw = $('#pj-switch');
    if (sw) { sw.classList.toggle('hidden', !p); if (p) sw.innerHTML = `${face(p, 'sm')}<span>${esc(p.name)}</span>${CHEV}`; }
    title(active);
    if ($('#pj-sheet') && !$('#pj-sheet').classList.contains('hidden')) sheet();
  }
  const NOTIF = '<svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>';
  function title(view) {
    const t = document.querySelector('.titlebar .faint'), p = curP(); if (!t) return;
    const lb = { overview: 'Overview', requests: 'Requests', docs: 'Docs', tasks: 'Tasks', board: 'Board', bugs: 'Bugs', repo: 'Repo', calendar: 'Calendar', visuals: 'Visuals' }[view];
    t.textContent = view === 'home' || !p || !lb ? '/ Home' : `/ ${p.name} / ${lb}`;
  }
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const open = e.target.closest('[data-pj-open]');
    if (open && open.closest('#pj-rail, #pj-strip')) { const id = open.dataset.pjOpen; if (isPhone()) document.body.classList.remove('drawer-open'); if (id === cur()) App().show('overview'); else switchTo(id, App().view() === 'home' ? 'overview' : undefined); return; }
    if (e.target.closest('#pj-plus, [data-pj-new]')) { document.body.classList.remove('drawer-open'); openNew(); return; }
    if (!e.target.closest('#pj-nav, #nest-head')) return;
    const go = e.target.closest('[data-nav]'), pn = e.target.closest('[data-pnav]');
    if (go) { App().show(go.dataset.nav); return; }
    if (pn && pn.dataset.pnav === 'inbox') { document.body.classList.remove('drawer-open'); const b = $('#nf-bell'); if (b) b.click(); return; }
    if (pn) { if (isPhone()) { document.body.classList.remove('drawer-open'); const r = document.querySelector('.rail [data-nav="chat"]'); if (r) r.click(); } else { const i = $('#chat-input'); i && i.focus(); } return; }
    if (e.target.closest('#pj-more')) { moreOpen = !moreOpen; try { localStorage.setItem('tribecode.pjMore', moreOpen ? '1' : '0'); } catch {} render(); const f = $('#pj-more'); f && f.focus(); }
  });
  // Keyboard: arrows move through the circles and through the nest.
  document.addEventListener('keydown', e => {
    if (!e.target.closest || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const box = e.target.closest('#pj-nav') ? '#pj-nav button' : e.target.closest('#pj-rail') ? '#pj-rail button' : null; if (!box) return;
    const all = [...document.querySelectorAll(box)]; const i = all.indexOf(e.target);
    const n = all[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { n.focus(); e.preventDefault(); }
  });
  // Notification count lives on the title-bar bell (notify.js); mirror it in the nest.
  setTimeout(() => { const n = $('#nf-count'); if (n) new MutationObserver(() => render()).observe(n, { childList: true, attributes: true, characterData: true, subtree: true }); }, 0);

  async function switchTo(id, view) {
    if (!id) return;
    if (id === cur()) { if (view) App().show(view); return; }
    pulses[id] = 0;
    await C.switchProject(id);
    if (view) App().show(view);
  }
  // After the server moved us: reload what is on screen for the new project.
  C.on('project', () => {
    pulses[cur()] = 0;
    const v = App().view();
    App().reloadChat();
    // Lists other views keep in memory belong to the old project: reload them so live events land in the right list.
    for (const k of ['TribeTasks', 'TribeBoard', 'TribeBugs']) { const m = window[k]; if (m && m.load && !['tasks', 'board', 'bugs'].includes(v)) try { m.load(); } catch {} }
    App().show(v === 'home' ? 'overview' : v);
    refresh();
    App().refreshRoom && App().refreshRoom();
  });
  C.on('hello', () => refresh());
  C.on('projects', () => soon(50));
  C.on('project-pulse', m => { if (m.kind === 'chat') pulses[m.project] = (pulses[m.project] || 0) + 1; soon(400); });
  ['task', 'proposal', 'change', 'approval', 'bug', 'doc'].forEach(t => C.on(t, () => soon(800)));
  C.on('presence', () => { render(); const v = App() && App().view(); if (v === 'overview') overviewSoon(); });

  function onShow(view) {
    title(view);
        render();
    if (view === 'overview') overview();
    if (view === 'requests') requests();
    if (view === 'repo') setTimeout(repoPanel, 0);
  }
  function whereLabel(m) {
    if (!m.project || m.project === cur()) return '';
    const p = projects.find(x => x.id === m.project); return p ? `${label(p)} · ` : '';
  }
  function invitePicker() {
    if (projects.length < 2 && !scopedMe()) return '';   // one project: a tribe invite, nothing to choose
    return `<div class="opts pj-inv"><label for="inv-project" class="faint">Invite to</label><select id="inv-project" title="A project invite only shows that project; a tribe invite shows them everything">
      ${projects.map(p => `<option value="${esc(p.id)}" ${p.id === cur() ? 'selected' : ''}>${label(p)} only</option>`).join('')}
      ${scopedMe() ? '' : '<option value="tribe">Whole tribe (every project)</option>'}</select></div>`;
  }

  // ---------- Overview (pulse) ----------
  let ot; const overviewSoon = () => { clearTimeout(ot); ot = setTimeout(overview, 400); };
  async function overview() {
    const el = $('#pj-overview'); if (!el) return;
    const p = curP();
    if (!p) { el.innerHTML = '<div class="pj-empty">Connect to a tribe to see its projects.</div>'; return; }
    let d; try { d = await C.api(`/projects/${encodeURIComponent(p.id)}/pulse`); } catch (e) { el.innerHTML = `<div class="pj-empty">${esc(e.message)}</div>`; return; }
    const who = m => `<div class="pj-person"><span class="avatar" style="background:${m.kind === 'agent' ? 'var(--surface-3)' : esc(m.color)};color:${ink(m.color)}">${m.kind === 'agent' ? '🤖' : esc(initials(m.name))}</span><span>${esc(m.name)}</span><span class="faint">${m.here ? 'here' : m.online ? 'elsewhere' : 'away'}${m.role === 'host' ? ' · host' : m.role === 'spectator' ? ' · watching' : ''}</span></div>`;
    const kindIco = { task: 'i-check', doc: 'i-doc', commit: 'i-git' };
    const team = d.team.filter(m => m.kind !== 'agent');
    el.innerHTML = `<div class="view-head pj-title"><button class="pj-face-btn" id="pj-face" title="Change the project picture" aria-label="Change the project picture">${face(p, 'lg')}</button><h1>${esc(p.name)}</h1>
        <span class="faint">${team.length} ${team.length === 1 ? 'person' : 'people'}${d.repo ? ` · ${esc(d.repo.name)} on ${esc(d.repo.branch)}` : ''}</span>
        <button class="btn" id="pj-invite" style="margin-left:auto">${ico('i-users', 15)}Invite to ${esc(p.name)}</button></div>
      <div class="pj-grid">
        <section class="card"><h3>${ico('i-users', 16)}Who is here</h3>
          ${team.length ? team.sort((a, b) => b.here - a.here || b.online - a.online).map(who).join('') : '<div class="pj-none">Just you so far. Invite a friend to this project.</div>'}</section>
        <section class="card"><h3><span class="pj-live"></span>Agents</h3>
          ${d.agents.length ? d.agents.map(a => `<div class="pj-agent"><span class="pj-live"></span><b>${esc(a.name)}</b><span class="faint">${esc(a.where || 'working')}</span></div>`).join('') : `<div class="pj-none">No agent is working here right now. <button class="linkish" id="pj-cc">Connect your Claude Code</button></div>`}</section>
        <section class="card"><h3>${ico('i-refresh', 16)}Recent changes</h3>
          ${d.recent.length ? d.recent.map(r => `<div class="pj-row-line" ${r.kind === 'doc' ? `data-doc="${esc(r.ref)}"` : r.kind === 'task' ? 'data-go="tasks"' : 'data-go="repo"'}>${ico(kindIco[r.kind] || 'i-doc', 14)}<span class="t">${esc(r.text)}</span><span class="faint">${esc(r.sub)} · ${ago(r.at)}</span></div>`).join('') : '<div class="pj-none">Nothing yet. Drop a doc, add a task or start a branch.</div>'}</section>
        <section class="card"><h3>${ico('i-cal', 16)}Upcoming</h3>
          ${d.upcoming.length ? d.upcoming.map(u => `<div class="pj-row-line" data-go="calendar">${ico(u.kind === 'task' ? 'i-check' : 'i-cal', 14)}<span class="t">${esc(u.title)}</span><span class="faint ${u.overdue ? 'pj-over' : ''}">${u.overdue ? 'overdue' : esc(new Date(u.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</span></div>`).join('') : '<div class="pj-none">Nothing scheduled.</div>'}</section>
        <section class="card pj-ws-card"><h3>${ico('i-git', 16)}Shared workspace</h3><div id="pj-ws">Loading…</div></section>
      </div>`;
    $('#pj-invite').onclick = () => App().openInvite();
    $('#pj-face').onclick = () => pickImage(p);
    const cc = $('#pj-cc'); if (cc) cc.onclick = () => App().connectClaude();
    el.querySelectorAll('[data-go]').forEach(x => x.onclick = () => App().show(x.dataset.go));
    el.querySelectorAll('[data-doc]').forEach(x => x.onclick = () => { App().show('docs'); setTimeout(() => window.TribeDocs.open(x.dataset.doc), 150); });
    workspacePanel($('#pj-ws'));
  }

  // Project picture: any image, shrunk to a 128px square in the browser, stored with the project.
  function pickImage(p) {
    if (me().role === 'spectator' || me().role === 'agent') return;
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const img = await createImageBitmap(f), c = document.createElement('canvas'); c.width = c.height = 128;
        const sz = Math.min(img.width, img.height); c.getContext('2d').drawImage(img, (img.width - sz) / 2, (img.height - sz) / 2, sz, sz, 0, 0, 128, 128);
        await C.api(`/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { image: c.toDataURL('image/png') } });
        await refresh(); overview();
      } catch (e) { toast(e.message || 'Could not use that image'); }
    };
    inp.click();
  }

  // ---------- shared workspace panel (Overview + Repo view) ----------
  async function workspacePanel(box) {
    if (!box) return;
    const p = curP(); if (!p) return;
    let w; try { w = await C.api(`/projects/${encodeURIComponent(p.id)}/workspace`); } catch (e) { box.innerHTML = `<div class="pj-none">${esc(e.message)}</div>`; return; }
    const gh = w.github || {}, r = w.repo, b = w.branch, id = w.identity || {};
    const ghLine = gh.signedIn ? `<div class="pj-gh ok">${ico('i-tick', 14)}Signed in to GitHub as <b>${esc(gh.user)}</b> on the host</div>`
      : `<div class="pj-gh">${gh.installed ? 'GitHub CLI is not signed in on the host' : 'No GitHub CLI on the host'}: pushes use the host's git credentials. GitHub is optional; everything works with plain git.</div>`;
    let html = '';
    if (!r) html = `<div class="pj-none">No repo yet. ${isHost() ? 'Start a project from a folder or a GitHub URL with <b>+</b> in the sidebar.' : 'The host can attach one.'}</div>`;
    else if (!r.git) html = `<div class="pj-none">The folder <b>${esc(r.name)}</b> is not a git repo yet.</div>${isHost() ? '<button class="btn primary" id="pj-gitinit">Make it a git repo</button><div class="faint pj-small">Runs git init with a .gitignore for node_modules, build folders and .env, then makes a first commit.</div>' : ''}`;
    else {
      html = `<div class="pj-repo"><b>${esc(r.name)}</b>${r.remote ? ` <span class="faint">· ${esc(r.remote.replace(/^https?:\/\//, ''))}</span>` : ' <span class="faint">· local only</span>'}</div>${ghLine}`;
      if (b && b.exists) html += `<div class="pj-branch"><code>${esc(b.branch)}</code><span class="faint">${b.head ? esc(b.head.subject) + ' · ' + esc(b.head.author) : ''}${b.dirty ? ` · ${b.dirty} changed file${b.dirty > 1 ? 's' : ''}` : ''}</span></div>
          ${b.path && isHost() ? `<div class="pj-small faint">Your worktree: <code>${esc(b.path)}</code></div>` : `<div class="pj-small faint">Your own worktree on the host, so you and your agent never collide with anyone.</div>`}
          <div class="pj-actions"><button class="btn" id="pj-commit" ${me().role === 'spectator' ? 'disabled' : ''}>Commit my changes</button>${r.remote ? '<button class="btn" id="pj-push">Push my branch</button>' : ''}</div>`;
      else html += `<div class="pj-actions"><button class="btn primary" id="pj-mybranch" ${me().role === 'spectator' ? 'disabled' : ''}>Give me a branch</button></div><div class="pj-small faint">Makes <code>tribe/${esc(me().id || 'you')}</code> in its own worktree so two people and their agents never step on each other.</div>`;
      html += `<div class="pj-ident"><span class="faint">Commits as</span> <b>${esc(id.name)}</b> <span class="faint">&lt;${esc(id.email)}&gt;${id.hasToken ? ' · pushes with your GitHub token' : ''}</span> <button class="linkish" id="pj-ident">Change</button></div>
        <div class="pj-ident-form hidden" id="pj-ident-form">
          <input class="input" id="pj-email" placeholder="you@example.com (optional)" value="${id.custom ? esc(id.email) : ''}" autocomplete="email">
          <input class="input" id="pj-token" type="password" placeholder="${id.hasToken ? 'GitHub token saved · paste a new one or leave empty' : 'GitHub token for pushing as you (optional)'}" autocomplete="off">
          <div class="pj-actions"><button class="btn primary" id="pj-ident-save">Save</button>${id.hasToken ? '<button class="btn" id="pj-token-clear">Remove token</button>' : ''}</div>
          <div class="pj-small faint">The token stays on the host (in the tribe's .tribe/secrets, readable only by the host's account) and is only used for your pushes. It is never sent back to any browser.</div></div>`;
    }
    box.innerHTML = html;
    const pid = encodeURIComponent(p.id), again = () => workspacePanel(box);
    const act = (sel, fn) => { const x = box.querySelector(sel); if (x) x.onclick = async () => { x.disabled = true; try { await fn(); } catch (e) { toast(e.message); } x.disabled = false; again(); }; };
    act('#pj-gitinit', async () => { await C.api(`/projects/${pid}/git-init`, { method: 'POST' }); toast('It is a git repo now, with a first commit.'); refresh(); });
    act('#pj-mybranch', async () => { const r2 = await C.api(`/projects/${pid}/branch`, { method: 'POST' }); toast(`Your branch ${r2.branch.branch} is ready`); });
    act('#pj-commit', async () => { const msg = prompt('Commit message', 'Work in progress'); if (msg === null) return; await C.api(`/projects/${pid}/branch/commit`, { method: 'POST', body: { message: msg } }); toast('Committed as you'); });
    act('#pj-push', async () => { const r2 = await C.api(`/projects/${pid}/branch/push`, { method: 'POST' }); toast(`Pushed ${r2.branch} with ${r2.as}`); });
    const idb = box.querySelector('#pj-ident'); if (idb) idb.onclick = () => box.querySelector('#pj-ident-form').classList.toggle('hidden');
    act('#pj-ident-save', async () => { const body = { email: box.querySelector('#pj-email').value.trim() }; const t = box.querySelector('#pj-token').value.trim(); if (t) body.githubToken = t; await C.api('/me/git', { method: 'PUT', body }); toast('Saved'); });
    act('#pj-token-clear', async () => { await C.api('/me/git', { method: 'PUT', body: { githubToken: '' } }); toast('Token removed from the host'); });
  }
  function repoPanel() {
    const v = $('#view-repo'); if (!v) return;
    let card = $('#pj-repo-ws');
    if (!card) { card = document.createElement('section'); card.className = 'card pj-ws-card pj-repo-card'; card.id = 'pj-repo-ws'; card.innerHTML = `<h3>${ico('i-users', 16)}Your branch in the shared workspace</h3><div></div>`; const head = v.querySelector('.view-head'); head ? head.after(card) : v.prepend(card); }
    workspacePanel(card.querySelector('div'));
  }

  // ---------- Requests: approvals + change requests + proposals of this project ----------
  async function requests() {
    const el = $('#pj-requests'); if (!el) return;
    const p = curP(); if (!p) return;
    let d; try { d = await C.api(`/projects/${encodeURIComponent(p.id)}/requests`); } catch (e) { el.innerHTML = `<div class="pj-empty">${esc(e.message)}</div>`; return; }
    const chip = (s, hot) => `<span class="pj-chip ${hot ? 'hot' : ''}">${esc(s)}</span>`;
    const pend = d.approvals.filter(a => a.status === 'pending');
    const sec = (titleText, rows, empty) => `<section class="card"><h3>${titleText}</h3>${rows.length ? rows.join('') : `<div class="pj-none">${empty}</div>`}</section>`;
    el.innerHTML = `<div class="view-head"><h1>Requests</h1><span class="faint">${esc(p.name)} · approvals, change requests and proposals in one place</span></div><div class="pj-req">
      ${sec(`Approvals${pend.length ? ` ${chip(pend.length, true)}` : ''}`, d.approvals.slice(0, 12).map(a => `<div class="pj-req-row" data-ap="${esc(a.id)}"><div><b>${esc(a.title)}</b><div class="faint">${esc(a.byName)} · ${esc(a.risk)} risk · ${ago(a.created)}</div></div>
        ${a.status === 'pending' && (a.to || []).includes(me().id) ? `<div class="pj-actions"><button class="btn primary" data-ap-do="approve">Approve</button><button class="btn" data-ap-do="deny">Deny</button></div>` : chip(a.status, a.status === 'pending')}</div>`), 'No agent is waiting on anyone.')}
      ${sec('Change requests', d.changes.slice(0, 12).map(c => `<div class="pj-req-row" data-go="repo"><div><b>${esc(c.title)}</b><div class="faint">${esc(c.byName)}${c.claimedByName ? ' · taken by ' + esc(c.claimedByName) : ''} · ${ago(c.created)}</div></div>${chip(c.status, c.status === 'open')}</div>`), 'No “needs a desktop” requests.')}
      ${sec('Proposals', d.proposals.slice(0, 12).map(x => `<div class="pj-req-row" data-go="board"><div><b>${esc(x.title)}</b><div class="faint">${ago(x.created)}</div></div>${chip(x.status, x.status === 'open')}</div>`), 'No proposals. Propose a scope change from the Board.')}
    </div>`;
    el.querySelectorAll('[data-go]').forEach(x => x.onclick = () => App().show(x.dataset.go));
    el.querySelectorAll('[data-ap-do]').forEach(btn => btn.onclick = async e => {
      e.stopPropagation(); const aid = btn.closest('[data-ap]').dataset.ap;
      try { await C.api(`/approvals/${aid}/${btn.dataset.apDo}`, { method: 'POST', body: {} }); } catch (err) { toast(err.message); }
      requests(); refresh();
    });
  }
  C.on('approval', () => { if (App() && App().view() === 'requests') requests(); });
  C.on('change', () => { if (App() && App().view() === 'requests') requests(); });

  // ---------- Start a project: drop a folder or repo, paste a URL or a path ----------
  const modal = () => $('#invite-modal'), body = () => $('#invite-body');
  const close = () => modal().classList.add('hidden');
  // One dialog: drop a folder or repo, or type a name, a GitHub URL or a folder path, then Create.
  let dropped = null;   // { name, files, remote, mode: 'clone' | 'upload' }
  function classify(v) {
    v = v.trim(); if (!v) return { kind: 'none' };
    if (/^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/i.test(v)) return { kind: 'url', url: v };
    if (/^(www\.)?(github|gitlab)\.com\//i.test(v)) return { kind: 'url', url: 'https://' + v.replace(/^www\./, '') };
    if (/^[\w.-]+\/[\w.-]+$/.test(v) && !/\s/.test(v)) return { kind: 'url', url: v };
    if (/^(\/|~|\.{1,2}\/|[A-Za-z]:[\\/]|\\\\)/.test(v)) return { kind: 'path', path: v };
    return { kind: 'name', name: v };
  }
  function hint() {
    const h = $('#np-hint'); if (!h) return;
    const c = classify($('#np-input').value), host = isHost();
    if (dropped && c.kind === 'none') { h.textContent = ''; return; }
    h.textContent = c.kind === 'url' ? (host ? 'Clones the repo onto the host and makes it this project\'s shared workspace.' : 'Only the host can bring a repo in. This will just be the project name.')
      : c.kind === 'path' ? (host && onHostMachine() ? 'Opens that folder on this computer as the project\'s repo.' : 'Folder paths only work on the host computer.')
      : c.kind === 'name' ? 'Starts an empty project. You can attach a repo later.' : '';
  }
  function openNew() {
    if (!C.connected()) return App().openInvite();
    dropped = null;
    modal().classList.remove('hidden');
    const host = isHost();
    body().innerHTML = `<h2>Start a project</h2>
      <p class="lead">A project is a room with its own people, chat, docs and tasks${host ? ', plus a shared git workspace' : ''}.</p>
      ${host ? `<div class="dropzone pj-dropzone" id="np-drop" tabindex="0" role="button" aria-label="Drop a folder or repo, or choose one">${ico('i-folder', 22)}<div>Drop a folder or repo</div><div class="faint" style="font-size:12px;margin-top:4px">or <span class="linkish">choose one</span></div></div>
        <div class="np-status" id="np-status"></div>` : ''}
      <div class="field"><label for="np-input">${host ? 'Or type a name, GitHub URL or folder path' : 'Project name'}</label>
        <input class="input" id="np-input" placeholder="${host ? 'Pixel Quest   or   github.com/you/game' : 'Pixel Quest'}" autocomplete="off" maxlength="400"></div>
      <div class="np-hint faint" id="np-hint"></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="np-create">Create</button></div>`;
    body().querySelector('[data-close]').onclick = close;
    const inp = $('#np-input');
    inp.oninput = hint;
    inp.onkeydown = e => { if (e.key === 'Enter') $('#np-create').click(); };
    $('#np-create').onclick = () => go().catch(() => {});
    const dz = $('#np-drop'); if (dz) wireDrop(dz);
    inp.focus();
  }
  async function go() {
    const c = classify($('#np-input').value), host = isHost();
    if (dropped && (c.kind === 'none' || c.kind === 'name')) {
      const name = c.kind === 'name' ? c.name : dropped.name;
      return dropped.mode === 'clone' ? create({ name, url: dropped.remote }, 'Cloning…') : startFromFiles(name, dropped.files);
    }
    if (c.kind === 'url' && host) return create({ url: c.url }, 'Cloning…');
    if (c.kind === 'path' && host && onHostMachine()) return create({ path: c.path }, 'Opening the folder…');
    if (c.kind === 'none') { $('#np-input').focus(); return; }
    return create({ name: c.name || $('#np-input').value.trim().slice(0, 48) });
  }
  function status(html) { const s = $('#np-status'); if (s) s.innerHTML = html; else if (html) toast(html.replace(/<[^>]+>/g, '')); }
  async function create(payload, busy = 'Creating…') {
    status(`<div class="faint">${busy}</div>`);
    try {
      const r = await C.api('/projects', { method: 'POST', body: payload });
      await refresh();
      if (r.needsGit) return askGit(r.project);
      close(); toast(r.cloned ? `Cloned into ${r.project.name}` : r.uploaded ? `${r.project.name}: ${r.uploaded.written} files, committed` : `${r.project.name} is ready`);
      await switchTo(r.project.id, 'overview');
      return r;
    } catch (e) { status(`<div class="np-err">${esc(e.message)}</div>`); if (!$('#np-status')) toast(e.message); throw e; }
  }
  function askGit(p) {
    modal().classList.remove('hidden');
    body().innerHTML = `<h2>${label(p)} is not a git repo yet</h2>
      <p class="lead">Make it one so everyone gets their own branch and every change is attributed. TribeCode runs <code>git init</code>, adds a .gitignore for node_modules, build folders and .env, and makes a first commit. Nothing leaves this computer.</p>
      <div class="modal-foot"><button class="btn" id="np-later">Not now</button><button class="btn primary" id="np-git">Make it a git repo</button></div>`;
    $('#np-later').onclick = () => { close(); switchTo(p.id, 'overview'); };
    $('#np-git').onclick = async () => { $('#np-git').disabled = true; try { await C.api(`/projects/${encodeURIComponent(p.id)}/git-init`, { method: 'POST' }); toast('It is a git repo now'); } catch (e) { toast(e.message); } close(); await refresh(); switchTo(p.id, 'overview'); };
  }
  const fromPath = path => create({ path }, 'Opening the folder…').catch(() => {});

  // Folder reading: drag and drop (webkitGetAsEntry), showDirectoryPicker, or <input webkitdirectory>.
  function wireDrop(dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', async e => { e.preventDefault(); dz.classList.remove('over'); try { await fromDataTransfer(e.dataTransfer); } catch (err) { status(`<div class="np-err">${esc(err.message)}</div>`); } });
    const pick = async () => {
      if (window.showDirectoryPicker) { try { const h = await window.showDirectoryPicker(); return analyze(h.name, await readHandle(h)); } catch (err) { if (err.name !== 'AbortError') status(`<div class="np-err">${esc(err.message)}</div>`); return; } }
      const inp = document.createElement('input'); inp.type = 'file'; inp.webkitdirectory = true; inp.multiple = true;
      inp.onchange = () => { const fs = [...inp.files]; if (!fs.length) return; const root = fs[0].webkitRelativePath.split('/')[0]; analyze(root, fs.map(f => ({ path: f.webkitRelativePath.split('/').slice(1).join('/'), file: f }))); };
      inp.click();
    };
    dz.addEventListener('click', pick);
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  }
  async function fromDataTransfer(dt) {
    const it = [...(dt.items || [])].find(i => i.kind === 'file');
    const entry = it && it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
    const uri = dt.getData && dt.getData('text/uri-list');
    if (!entry && uri && /^https?:\/\//.test(uri)) { if (!$('#np-input')) openNew(); $('#np-input').value = uri.trim(); hint(); return; }
    if (!entry || !entry.isDirectory) throw new Error('Drop a folder (or a repo folder). Single files go into Docs.');
    if (!$('#np-status')) openNew();
    status('<div class="faint">Reading the folder…</div>');
    return analyze(entry.name, await readEntry(entry));
  }
  function readEntry(dir) {
    const out = [];
    const walk = (d, prefix) => new Promise((res, rej) => {
      const r = d.createReader(); const all = [];
      const more = () => r.readEntries(async ents => {
        if (!ents.length) { try { for (const e of all) await visit(e, prefix); res(); } catch (x) { rej(x); } return; }
        all.push(...ents); more();
      }, rej);
      more();
    });
    const visit = async (e, prefix) => {
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory) { if (e.name === '.git' && !prefix) { const cfg = await new Promise(res => e.getFile('config', {}, f => f.file(res, () => res(null)), () => res(null))); if (cfg) out.push({ path: '.git/config', file: cfg, gitConfig: true }); return; } if (SKIP.has(e.name)) return; return walk(e, p); }
      out.push({ path: p, file: await new Promise((res, rej) => e.file(res, rej)) });
    };
    return walk(dir, '').then(() => out);
  }
  async function readHandle(h, prefix = '', out = []) {
    for await (const [name, child] of h.entries()) {
      const p = prefix ? `${prefix}/${name}` : name;
      if (child.kind === 'directory') { if (name === '.git' && !prefix) { try { out.push({ path: '.git/config', file: await (await child.getFileHandle('config')).getFile(), gitConfig: true }); } catch {} continue; } if (SKIP.has(name)) continue; await readHandle(child, p, out); }
      else out.push({ path: p, file: await child.getFile() });
    }
    return out;
  }
  const kb = n => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  // Decide what to offer: clone (the folder is a git repo with a remote) or upload the files.
  async function analyze(name, items) {
    const cfg = items.find(i => i.gitConfig), files = items.filter(i => !i.gitConfig);
    let remote = null; if (cfg) { const t = await cfg.file.text(); const m = t.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/); remote = m ? m[1] : null; }
    const total = files.reduce((n, f) => n + f.file.size, 0);
    const big = total > CAP;
    dropped = { name, files, remote, mode: remote ? 'clone' : 'upload' };
    const say = () => status(`<div class="np-found">${ico('i-folder', 15)}<b>${esc(name)}</b> <span class="faint">· ${files.length} file${files.length === 1 ? '' : 's'} · ${kb(total)}${remote ? ' · has a git remote' : cfg ? ' · git repo' : ''}</span></div>
      ${dropped.mode === 'clone' ? `<div class="pj-small faint">Create clones it from <code>${esc(remote.replace(/\/\/[^@/]+@/, '//'))}</code> with the host's git, history included. <button class="linkish" id="np-do-upload">Upload the files instead</button></div>`
        : big ? `<div class="np-err">That's over 25 MB after skipping node_modules, .git and build folders. ${remote ? '<button class="linkish" id="np-do-clone">Clone it instead</button>,' : 'Push it to GitHub and paste the URL,'} or paste its path on the host.</div>`
        : `<div class="pj-small faint">Create copies the files to the host (skipping node_modules, .git and build folders), runs git init and commits as you.${remote ? ' <button class="linkish" id="np-do-clone">Clone it instead</button>' : ''}</div>`}`);
    const wire = () => { say(); const u = $('#np-do-upload'), c2 = $('#np-do-clone'); if (u) u.onclick = () => { dropped.mode = 'upload'; wire(); }; if (c2) c2.onclick = () => { dropped.mode = 'clone'; wire(); }; };
    wire();
    const inp = $('#np-input'); if (inp && !inp.value) inp.placeholder = name;
    hint();
    return { name, remote, files: files.length, total };
  }
  const b64 = async f => { const buf = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); };
  async function startFromFiles(name, files) {
    const keep = files.filter(f => !f.path.split('/').slice(0, -1).some(p => SKIP.has(p)));
    const total = keep.reduce((n, f) => n + f.file.size, 0);
    if (total > CAP) { const e = new Error('That folder is over 25 MB after skipping node_modules, .git and build folders.'); status(`<div class="np-err">${esc(e.message)}</div>`); throw e; }
    status(`<div class="faint">Uploading ${keep.length} files…</div>`);
    const payload = []; for (const f of keep) payload.push({ path: f.path, data: await b64(f.file) });
    return create({ name, files: payload }, 'Committing…');
  }

  // Home and sidebar "+" drop zones; desktop app drops give a real path.
  const homeDz = $('#pj-dropzone');
  if (homeDz) {
    homeDz.addEventListener('dragover', e => { e.preventDefault(); homeDz.classList.add('over'); });
    homeDz.addEventListener('dragleave', () => homeDz.classList.remove('over'));
    homeDz.addEventListener('drop', async e => { e.preventDefault(); homeDz.classList.remove('over'); if (!isHost()) return toast('Only the host can bring a repo in. Ask them, or start an empty project with +.'); openNew(); try { await fromDataTransfer(e.dataTransfer); } catch (err) { status(`<div class="np-err">${esc(err.message)}</div>`); } });
    homeDz.addEventListener('click', openNew);
    homeDz.addEventListener('keydown', e => { if (e.key === 'Enter') openNew(); });
  }
  const DROP = '#pj-rail, #pj-plus';   // drop a folder on the circles (or +) to start a project
  document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest(DROP) && isHost()) { e.preventDefault(); $('#pj-plus').classList.add('over'); } });
  document.addEventListener('dragleave', e => { if (e.target.closest && e.target.closest(DROP)) $('#pj-plus').classList.remove('over'); });
  document.addEventListener('drop', async e => { if (!(e.target.closest && e.target.closest(DROP)) || !isHost()) return; e.preventDefault(); $('#pj-plus').classList.remove('over'); openNew(); try { await fromDataTransfer(e.dataTransfer); } catch (err) { status(`<div class="np-err">${esc(err.message)}</div>`); } });
  (async () => {   // Tauri v2: a dropped folder comes with its real path (guarded: the desktop shell only)
    const ev = window.__TAURI__ && window.__TAURI__.event; if (!ev || !ev.listen) return;
    try { await ev.listen('tauri://drag-drop', e => { const paths = e.payload && e.payload.paths; if (paths && paths[0] && C.connected() && isHost()) fromPath(paths[0]); }); } catch {}
  })();

  // ---------- mobile: project switcher sheet ----------
  function sheet() {
    let s = $('#pj-sheet');
    if (!s) { s = document.createElement('div'); s.id = 'pj-sheet'; s.className = 'pj-sheet hidden'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', 'Projects'); document.body.appendChild(s); s.addEventListener('click', e => { if (e.target === s) s.classList.add('hidden'); }); }
    s.innerHTML = `<div class="pj-sheet-card"><div class="pj-grab"></div><h6>Projects</h6>
      ${projects.map(p => { const k = p.counts || {}, n = here(p.id).length; return `<button class="pj-sheet-row ${p.id === cur() ? 'on' : ''}" data-sheet="${esc(p.id)}">${face(p)}<span class="pj-name">${esc(p.name)}<span class="faint">${n ? `${n} here` : ''}${k.tasks ? `${n ? ' · ' : ''}${k.tasks} open tasks` : ''}</span></span>${k.requests ? `<span class="pj-n hot">${k.requests}</span>` : ''}${p.id === cur() ? ico('i-tick', 16) : ''}</button>`; }).join('')}
      <div class="pj-sheet-foot"><button class="btn" id="pj-sheet-invite">${ico('i-users', 15)}Invite</button>${scopedMe() ? '' : `<button class="btn" id="pj-sheet-new">+ New project</button>`}</div></div>`;
    s.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => { s.classList.add('hidden'); switchTo(b.dataset.sheet, App().view() === 'home' ? 'overview' : undefined); });
    $('#pj-sheet-invite').onclick = () => { s.classList.add('hidden'); App().openInvite(); };
    const nw = $('#pj-sheet-new'); if (nw) nw.onclick = () => { s.classList.add('hidden'); openNew(); };
    return s;
  }
  const sw = $('#pj-switch'); if (sw) sw.addEventListener('click', () => sheet().classList.remove('hidden'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#pj-sheet')) $('#pj-sheet').classList.add('hidden'); });


  if (C.connected()) refresh();   // the socket may have said hello before this script loaded

  window.TribeProjects = { refresh, list: () => projects, current: cur, switchTo, onShow, whereLabel, invitePicker, openNew, startFromFiles, analyze, fromPath, overview, requests };
})();
