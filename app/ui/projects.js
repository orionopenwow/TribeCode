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
  let loaded = false;   // once the list has come back, a project id that isn't in it (deleted) no longer counts
  const cur = () => { const id = C.project(); if (loaded && id && !projects.some(p => p.id === id)) return (projects[0] || {}).id || null; return id || (projects[0] || {}).id; };
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
      try { const r = await C.api('/projects'); projects = r.projects || []; loaded = true; render(); } catch {}
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
  // Discord-style: a white pill on the left edge for unread chat, a red count for things waiting on you.
  function badge(p) {
    const k = p.counts || {}, n = k.requests || 0;
    return (pulses[p.id] ? '<span class="pj-unread" aria-label="unread messages"></span>' : '') + (n ? `<span class="pj-badge" aria-label="${n} waiting">${n > 99 ? '99+' : n}</span>` : '');
  }
  function circles(where) {
    const c = cur(), pin = window.TribeShell && window.TribeShell.pins ? window.TribeShell.pins() : [];
    const order = [...projects].sort((a, b) => (pin.includes(b.id) - pin.includes(a.id)));   // pinned first (right-click a bubble)
    return order.map(p => `<button class="pj-circle ${p.id === c ? 'on' : ''}" role="listitem" data-pj-open="${esc(p.id)}" title="${esc(p.name)}" aria-label="${esc(p.name)}${p.id === c ? ' (current project)' : ''}" aria-current="${p.id === c}">
        ${face(p)}${p.id === c ? '' : badge(p)}${here(p.id).some(m => m.id !== me().id) ? '<span class="pj-live-dot" title="People are here"></span>' : ''}</button>`).join('') +
      (where === 'strip' && !scopedMe() ? '<button class="pj-circle pj-plus" data-pj-new title="Start a project" aria-label="Start a project">+</button>' : '');
  }
  function render() {
    const p = curP();
    const rail = $('#pj-rail'); if (rail) rail.innerHTML = circles('rail');
    const strip = $('#pj-strip'); if (strip) strip.innerHTML = circles('strip');
    const plus = $('#pj-plus'); if (plus) plus.classList.toggle('hidden', scopedMe());
    const sw = $('#pj-switch');
    if (sw) { sw.classList.toggle('hidden', !p); document.querySelectorAll('.pj-sep').forEach(x => x.classList.toggle('hidden', !p)); if (p) sw.innerHTML = `${face(p, 'sm')}<span>${esc(p.name)}</span>`; }
    if (window.TribeShell) window.TribeShell.render(p, { face, pulses, here });
    if ($('#pj-sheet') && !$('#pj-sheet').classList.contains('hidden')) sheet();
  }
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const open = e.target.closest('[data-pj-open]');
    if (open && open.closest('#pj-rail, #pj-strip, .tf-pop')) { const id = open.dataset.pjOpen; document.body.classList.remove('drawer-open'); if (window.TribeFloat) window.TribeFloat.closePop(); if (id === cur()) App().show('home'); else switchTo(id); return; }
    if (e.target.closest('#pj-plus, [data-pj-new]')) { document.body.classList.remove('drawer-open'); if (window.TribeFloat) window.TribeFloat.closePop(); openNew(); return; }
  });
  // Keyboard: arrows move through the circles.
  document.addEventListener('keydown', e => {
    if (!e.target.closest || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const box = e.target.closest('#pj-rail') ? '#pj-rail button' : null; if (!box) return;
    const all = [...document.querySelectorAll(box)]; const i = all.indexOf(e.target);
    const n = all[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { n.focus(); e.preventDefault(); }
  });

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
    const v = App().view() === 'hub' ? 'home' : App().view();   // picking a project from the Global Hub opens it
    App().reloadChat();
    // Lists other views keep in memory belong to the old project: reload them so live events land in the right list.
    for (const k of ['TribeTasks', 'TribeBoard', 'TribeBugs']) { const m = window[k]; if (m && m.load && !['tasks', 'board', 'bugs'].includes(v)) try { m.load(); } catch {} }
    App().show(v);
    refresh();
    App().refreshRoom && App().refreshRoom();
  });
  C.on('hello', () => refresh());
  C.on('projects', () => soon(50));
  C.on('project-pulse', m => { if (m.kind === 'chat') pulses[m.project] = (pulses[m.project] || 0) + 1; soon(400); });
  ['task', 'proposal', 'change', 'approval', 'bug', 'doc'].forEach(t => C.on(t, () => soon(800)));
  C.on('presence', () => { render(); const v = App() && App().view(); if (v === 'home') overviewSoon(); });

  function onShow(view) {
    render();
    if (view === 'home') overview();
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
    if (!p) { el.innerHTML = ''; return; }
    let d; try { d = await C.api(`/projects/${encodeURIComponent(p.id)}/pulse`); } catch (e) { el.innerHTML = `<div class="pj-empty">${esc(e.message)}</div>`; return; }
    const who = m => `<div class="pj-person"><span class="avatar" style="background:${m.kind === 'agent' ? 'var(--surface-3)' : esc(m.color)};color:${ink(m.color)}">${m.kind === 'agent' ? '🤖' : esc(initials(m.name))}</span><span>${esc(m.name)}</span><span class="faint">${m.here ? 'here' : m.online ? 'elsewhere' : 'away'}${m.role === 'host' ? ' · host' : m.role === 'spectator' ? ' · watching' : ''}</span></div>`;
    const kindIco = { task: 'i-check', doc: 'i-doc', commit: 'i-git' };
    const team = d.team.filter(m => m.kind !== 'agent');
    let plan = null; try { plan = (await C.api('/coord/plan')).plan; } catch {}
    const mine = plan ? plan.items.filter(i => i.member === me().id || (C.state().members || []).some(m => m.id === i.member && m.owner === me().id)) : [];
    const hero = plan && plan.items.length
      ? `<section class="hero-card" id="pj-hero"><span class="eyebrow">Today's focus</span><h2>${esc(plan.focus || plan.items[0].title)}</h2>
          <p>${mine.length ? `Yours today: ${mine.slice(0, 3).map(i => esc(i.title)).join(', ')}${mine.length > 3 ? ` and ${mine.length - 3} more` : ''}.` : 'Nothing is planned for you yet. The daily plan suggests who does what.'}</p>
          <div class="hero-acts"><button class="btn primary" data-hero="plan">Open the daily plan</button><button class="btn" data-hero="tasks">Tasks</button></div></section>`
      : `<section class="hero-card" id="pj-hero"><span class="eyebrow">Start here</span><h2>Give ${esc(p.name)} its first task</h2><p>Add a task, or invite a friend and connect your Claude Code. The daily plan then suggests who does what.</p>
          <div class="hero-acts"><button class="btn primary" data-hero="newtask">New task</button><button class="btn" data-hero="invite">Invite a friend</button></div></section>`;
    const sec = (eyebrow, title, inner) => `<section class="sec"><div class="sec-head"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div>${inner}</section>`;
    const L = d.living, canEdit = me().role !== 'spectator' && me().role !== 'agent';
    const MOOD = { buzzing: '<span class="emo" aria-hidden="true">🔥</span>Buzzing', steady: '<span class="emo" aria-hidden="true">🌿</span>Steady', quiet: '<span class="emo" aria-hidden="true">🌙</span>Quiet', fresh: '<span class="emo" aria-hidden="true">✨</span>Brand new' };
    el.innerHTML = `<div class="view-head pj-title pj-title2"><button class="pj-face-btn" id="pj-face" title="Change the picture" aria-label="Change the project picture">${face(p, 'lg')}${canEdit ? `<span class="pj-cam" aria-hidden="true">${ico('i-photo', 12)}</span>` : ''}</button>
        <div class="pj-id"><h1>${esc(p.name)}</h1>
          <button class="pj-bio ${d.bio ? '' : 'empty'}" id="pj-bio" ${canEdit ? '' : 'disabled'} title="${canEdit ? 'Edit the bio' : ''}">${d.bio ? esc(d.bio) : canEdit ? 'Add a one-line bio: what is this?' : ''}</button>
          <span class="faint pj-meta">${team.length} ${team.length === 1 ? 'person' : 'people'}${d.repo ? ` · ${esc(d.repo.name)} on ${esc(d.repo.branch)}` : ''}<span id="pj-site-slot"></span></span></div>
        <button class="btn" id="pj-invite" style="margin-left:auto">${ico('i-users', 15)}Invite to ${esc(p.name)}</button></div>
      ${L ? `<section class="card pj-living" id="pj-living"><div class="pl-head"><span class="eyebrow">Living update</span><span class="pl-mood ${esc(L.mood)}">${MOOD[L.mood] || ''}</span>${L.by === 'local model' ? '<span class="pl-by">local model</span>' : ''}</div>
          <p class="pl-sum">${esc(L.summary)}</p>
          <div class="pl-grid">${[['Lately', 'i-refresh', L.lines.lately, 'updates'], ['Chat', 'i-chat', L.lines.chat, 'chat'], ['Way forward', 'i-check', L.lines.next, 'tasks'], ['Coming up', 'i-calendar', L.lines.soon, 'calendar']]
            .map(([k, i, t, go]) => `<button class="pl-cell" data-go="${go}">${ico(i, 14)}<span><small>${k}</small><b>${esc(t)}</b></span></button>`).join('')}</div></section>` : ''}
      ${d.vision && !d.vision.has ? `<section class="pj-vision-nudge" id="pj-vnudge">${ico('i-flag', 16)}<span><b>No vision yet.</b> A few lines on what ${esc(p.name)} is and who it's for keeps people and agents pointed the same way.</span><button class="btn sm primary" id="pj-vwrite">${isHost() ? 'Write the vision' : 'Suggest a vision'}</button></section>` : ''}
      <div id="pj-tools-slot"></div>
      ${hero}
      ${sec('People', 'Who\'s building', `<div class="pj-grid">
        <section class="card"><h3>${ico('i-users', 16)}Who is here</h3>
          ${team.length ? team.sort((a, b) => b.here - a.here || b.online - a.online).map(who).join('') : '<div class="pj-none">Just you so far. Invite a friend to this project.</div>'}</section>
        <section class="card"><h3><span class="pj-live"></span>Agents</h3>
          ${d.agents.length ? d.agents.map(a => `<div class="pj-agent"><span class="pj-live"></span><b>${esc(a.name)}</b><span class="faint">${esc(a.where || 'working')}</span></div>`).join('') : `<div class="pj-none">No agent is working here right now. <button class="linkish" id="pj-cc">Connect your Claude Code</button></div>`}</section></div>`)}
      ${sec('Activity', 'What changed', `<div class="pj-grid">
        <section class="card"><h3>${ico('i-refresh', 16)}Recent changes</h3>
          ${d.recent.length ? d.recent.map(r => `<div class="pj-row-line" ${r.kind === 'doc' ? `data-doc="${esc(r.ref)}"` : r.kind === 'task' ? 'data-go="tasks"' : 'data-go="repo"'}>${ico(kindIco[r.kind] || 'i-doc', 14)}<span class="t">${esc(r.text)}</span><span class="faint">${esc(r.sub)} · ${ago(r.at)}</span></div>`).join('') : '<div class="pj-none">Nothing yet. Drop a doc, add a task or start a branch.</div>'}</section>
        <section class="card"><h3>${ico('i-calendar', 16)}Upcoming</h3>
          ${d.upcoming.length ? d.upcoming.map(u => `<div class="pj-row-line" data-go="calendar">${ico(u.kind === 'task' ? 'i-check' : 'i-calendar', 14)}<span class="t">${esc(u.title)}</span><span class="faint ${u.overdue ? 'pj-over' : ''}">${u.overdue ? 'overdue' : esc(new Date(u.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</span></div>`).join('') : '<div class="pj-none">Nothing scheduled.</div>'}</section></div>`)}
      ${sec('Workspace', 'Shared repo', `<section class="card pj-ws-card"><h3>${ico('i-git', 16)}Your branch</h3><div id="pj-ws">Loading…</div></section>`)}`;
    el.querySelectorAll('[data-hero]').forEach(x => x.onclick = () => { const k = x.dataset.hero;
      if (k === 'plan') window.TribeCoord.open('plan'); else if (k === 'tasks') App().show('tasks'); else if (k === 'invite') App().openInvite();
      else { App().show('tasks'); setTimeout(() => { const nb = $('#task-new'); nb && nb.click(); }, 80); } });
    $('#pj-invite').onclick = () => App().openInvite();
    $('#pj-face').onclick = () => pickImage(p);
    const bio = $('#pj-bio'); if (bio && canEdit) bio.onclick = () => editBio(p, d.bio);
    const vw = $('#pj-vwrite'); if (vw) vw.onclick = () => writeVision(p);
    const cc = $('#pj-cc'); if (cc) cc.onclick = () => App().connectClaude();
    el.querySelectorAll('[data-go]').forEach(x => x.onclick = () => App().show(x.dataset.go));
    el.querySelectorAll('[data-doc]').forEach(x => x.onclick = () => window.TribeShell ? window.TribeShell.previewDoc(x.dataset.doc) : (App().show('docs'), setTimeout(() => window.TribeDocs.open(x.dataset.doc), 150)));
    workspacePanel($('#pj-ws'));
    toolbox(p);
    if (window.TribeWebsite) window.TribeWebsite.overviewLink(p);   // "· Website" once the page exists (app/ui/website.js)
  }
  // Toolbox: a few checked tools, libraries and Claude skills that fit this project (server/shelf.js). Tucked in: only picks, one row.
  const KIND_L = { skill: 'Claude skill', library: 'Library', tool: 'Tool', mcp: 'Agent tool' };
  async function toolbox(p) {
    if (!$('#pj-tools-slot')) return;
    let d; try { d = await C.api(`/shelf?project=${encodeURIComponent(p.id)}`); } catch { return; }
    const slot = $('#pj-tools-slot'); if (!slot) return;   // the overview may have redrawn while we waited
    if (!d.picks || !d.picks.length || (C.project && C.project() !== p.id)) { slot.innerHTML = ''; return; }
    const what = d.types && d.types.length ? `picks for a ${d.types[0]}` : 'picks for this project';
    slot.innerHTML = `<section class="card pj-tools" id="pj-tools"><div class="pt-head"><span class="eyebrow"><span class="emo" aria-hidden="true">🧰</span>Toolbox · ${esc(what)}</span><button class="linkish" id="pj-tools-all">All tools</button></div>
      <div class="pt-grid">${d.picks.map(it => `<div class="pt-tile"><span class="pt-kind">${esc(KIND_L[it.kind] || it.kind)} · ${esc(it.license)}</span><b>${esc(it.title)}</b><small>${esc(it.summary)}</small>
        <div class="pt-acts"><button class="btn sm" data-shelf-add="${esc(it.id)}">Add</button><a class="linkish" href="${esc(it.url || `https://github.com/${it.repo}`)}" target="_blank" rel="noopener noreferrer">Open</a></div></div>`).join('')}</div></section>`;
    slot.querySelector('#pj-tools-all').onclick = () => window.TribeWorkshop && window.TribeWorkshop.open ? window.TribeWorkshop.open('shelf') : null;
    slot.querySelectorAll('[data-shelf-add]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Adding…';
      try { const r = await C.api(`/shelf/${encodeURIComponent(b.dataset.shelfAdd)}/add`, { method: 'POST', body: { project: p.id } }); toast(r.where ? `${r.item.title}: Claude Code reads it from ${r.where}` : `${r.item.title} is in the Toolbox`); toolbox(p); }
      catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Add'; }
    });
  }

  // One-line bio, edited in place on the overview (any builder).
  function editBio(p, cur) {
    const b = $('#pj-bio'); if (!b) return;
    const inp = document.createElement('input'); inp.className = 'input pj-bio-in'; inp.maxLength = 200; inp.value = cur || ''; inp.placeholder = 'What is this, in one line?';
    b.replaceWith(inp); inp.focus();
    let done = false;
    const save = async keep => { if (done) return; done = true;
      if (keep && inp.value.trim() !== (cur || '')) { try { await C.api(`/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { bio: inp.value } }); await refresh(); } catch (e) { toast(e.message); } }
      overview(); };
    inp.onkeydown = e => { if (e.key === 'Enter') save(true); if (e.key === 'Escape') save(false); };
    inp.onblur = () => save(true);
  }
  // No vision yet: the host writes it (VISION.md, read by the plan, the board and the agents); others suggest one in chat.
  function writeVision(p) {
    const m = $('#invite-modal'), body = $('#invite-body'); m.classList.remove('hidden');
    const h = isHost();
    body.innerHTML = `<span class="eyebrow">Vision · ${esc(p.name)}</span><h2>${h ? 'What are you building?' : 'Suggest a vision'}</h2>
      <p class="lead">Three short lines are plenty: what it is, who it's for, what "done" looks like for now. ${h ? 'It becomes VISION.md, which the plan, the board and every agent read.' : 'It goes to the chat for the host to adopt.'}</p>
      <textarea class="input pj-vision-in" id="pj-vtext" rows="5" placeholder="A cozy pixel platformer for friends to build together.&#10;For people who like short levels and silly bosses.&#10;Done for now: 3 levels, a boss, playable in the browser."></textarea>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Later</button><button class="btn primary" id="pj-vsave">${h ? 'Save the vision' : 'Send to chat'}</button></div>`;
    const close = () => m.classList.add('hidden');
    body.querySelector('[data-close]').onclick = close;
    $('#pj-vtext').focus();
    $('#pj-vsave').onclick = async () => {
      const t = $('#pj-vtext').value.trim(); if (!t) return $('#pj-vtext').focus();
      try {
        if (h) { await C.api('/vision', { method: 'PUT', body: { text: `# ${p.name}\n\n${t}\n` } }); toast('Vision saved'); }
        else { await C.api('/chat/general', { method: 'POST', body: { text: `💡 Vision suggestion for ${p.name}:\n${t}` } }); toast('Sent to the chat'); }
        close(); overview();
      } catch (e) { toast(e.message); }
    };
  }

  // Project picture: pick, frame it in the cropper (drag, zoom), stored with the project as a 256 px square.
  function pickImage(p) {
    if (me().role === 'spectator' || me().role === 'agent') return;
    (async () => {   // pick → frame it (drag, zoom, round + square preview) → Apply (cropper.js)
      const url = await window.TribeCropper.pick({ title: `Picture for ${p.name}` }); if (!url) return;
      try { await C.api(`/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { image: url } }); await refresh(); overview(); toast('Picture updated'); }
      catch (e) { toast(e.message || 'Could not use that image'); }
    })();
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
  const close = () => { modal().classList.add('hidden'); body().classList.remove('np-setup'); };
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
      : c.kind === 'name' ? (window.TribeFlow ? 'One click: the room, an invite link and a repo with a starter. The chat opens with a Getting started card.' : 'Starts an empty project. You can attach a repo later.') : '';
  }
  // The rail "+": two choices, stacked. Top: start a new tribe (one click, name prefilled). Bottom: paste an invite link.
  // ---------- Start a project, like Discord's "Create a server" ----------
  // 1. Create my own · a template · Bring my code · "Have an invite already? Join"   2. Picture, name, bio   3. Invite friends
  const TEMPLATES = [
    { k: 'game', emoji: '🎮', t: 'Game', s: 'Something to play together', word: 'Game', bio: 'A game we build together', note: 'Game idea: what is the player doing, what makes it fun, and the first level we can play.' },
    { k: 'site', emoji: '🌐', t: 'Website', s: 'A site or a landing page', word: 'Site', bio: 'A website we build together', note: 'Website: who is it for, the pages it needs, and the one thing a visitor should do.' },
    { k: 'app', emoji: '📱', t: 'App', s: 'For phones or the desktop', word: 'App', bio: 'An app we build together', note: 'App idea: the problem, who has it, and the first screen.' },
    { k: 'tool', emoji: '🛠️', t: 'Tool or script', s: 'Automate something', word: 'Tool', bio: 'A small tool we build together', note: 'Tool: what it automates, the input, the output.' },
    { k: 'notes', emoji: '📚', t: 'Notes & research', s: 'Plan, write, learn together', word: 'Notebook', bio: 'Notes and research we keep together', note: '' },
  ];
  const setup = { tpl: null, image: null };
  function openNew() {
    dropped = null; setup.tpl = null; setup.image = null;
    modal().classList.remove('hidden'); body().classList.add('np-setup');
    const on = C.connected(), host = on && isHost(), desk = !!window.TribeHost.isDesktop, scoped = scopedMe();
    if (!on || scoped) {
      body().innerHTML = `<div class="ns-head"><h2>${on ? 'Join a project' : 'Create your project'}</h2><p class="lead">${desk ? 'Your computer runs the tribe; friends join with one link.' : 'TribeCode runs on one friend\'s computer. Get the app to start one, or join a friend.'}</p></div>
        ${on ? '' : `<div class="ns-list"><button class="ns-row ns-own" id="np-host"><span class="ns-ic">${ico('i-plus', 18)}</span><span class="ns-t"><b>${desk ? 'Host on this computer' : 'Get the desktop app'}</b><small>${desk ? 'Start a tribe here, then make your first project' : 'Windows, Mac and Linux'}</small></span>${ico('i-chev', 16)}</button></div>`}
        ${joinFoot()}`;
      wireStart(); return;
    }
    const row = (k, ic, t, sub, cls = '') => `<button class="ns-row ${cls}" data-ns="${k}"><span class="ns-ic">${ic}</span><span class="ns-t"><b>${t}</b><small>${sub}</small></span>${ico('i-chev', 16)}</button>`;
    body().innerHTML = `<button class="ns-x" data-close aria-label="Close">${ico('i-x', 16)}</button>
      <div class="ns-head"><h2>Create your project</h2><p class="lead">Your project is where you, your friends and your agents build together. Make yours and start building.</p></div>
      <div class="ns-list">${row('own', ico('i-plus', 18), 'Create my own', 'Start from a blank page', 'ns-own')}
        <div class="ns-sub">Start from a template</div>
        ${TEMPLATES.map(t => row('tpl:' + t.k, `<span class="ns-emo">${t.emoji}</span>`, t.t, t.s)).join('')}
        ${host ? row('code', ico('i-folder', 18), 'Bring my code', 'A folder on this computer, or a GitHub repo') : ''}</div>
      ${joinFoot()}`;
    body().querySelectorAll('[data-ns]').forEach(b => b.onclick = () => {
      const k = b.dataset.ns;
      if (k === 'code') { body().classList.remove('np-setup'); return openAdvanced(); }
      setup.tpl = k.startsWith('tpl:') ? TEMPLATES.find(t => t.k === k.slice(4)) : null;
      customize();
    });
    wireStart();
  }
  const joinFoot = () => `<div class="ns-foot"><b>Have an invite already?</b><div class="np-row"><input class="input" id="np-link" placeholder="https://…/join/k7Qx2" autocomplete="off" spellcheck="false" aria-label="Invite link"><button class="btn" id="np-join-go">Join</button></div></div>`;
  function wireStart() {
    const x = body().querySelector('[data-close]'); if (x) x.onclick = close;
    const join = () => { const v = $('#np-link').value.trim(); if (v) window.TribeApp.joinLink(v); else $('#np-link').focus(); };
    $('#np-join-go').onclick = join; $('#np-link').onkeydown = e => { if (e.key === 'Enter') join(); };
    const hb = $('#np-host'); if (hb) hb.onclick = () => { close(); if (window.TribeHost.isDesktop && App().hostHere) App().hostHere(); else window.open('https://github.com/orionopenwow/TribeCode/releases/latest', '_blank', 'noopener'); };
  }
  function customize() {
    const t = setup.tpl, first = String((me().name || 'My')).split(/\s+/)[0];
    const taken = new Set(projects.map(p => p.name));
    let name = t ? `${first}'s ${t.word}` : (window.TribeFlow ? window.TribeFlow.suggestName() : `${first}'s project`);
    for (let i = 2; taken.has(name); i++) name = `${t ? `${first}'s ${t.word}` : name.replace(/ \d+$/, '')} ${i}`;
    body().innerHTML = `<div class="ns-head"><h2>Customize your project</h2><p class="lead">Give it a personality with a picture, a name and a line about it. You can change these later.</p></div>
      <button class="ns-pic" id="np-pic" aria-label="Upload a picture">${setup.image ? `<img src="${setup.image}" alt="">` : `${t ? `<span class="ns-pic-emo">${t.emoji}</span>` : ico('i-photo', 22)}<span>Upload</span>`}<i aria-hidden="true">+</i></button>
      <label class="ns-lab" for="np-input">Project name</label><input class="input" id="np-input" maxlength="48" value="${esc(name)}" autocomplete="off">
      <label class="ns-lab" for="np-bio">About it <span class="faint">optional</span></label><input class="input" id="np-bio" maxlength="200" value="${esc(t ? t.bio : '')}" placeholder="A one-line bio" autocomplete="off">
      <div class="np-status" id="np-status"></div>
      <div class="ns-btns"><button class="linkish" id="np-back">Back</button><span style="flex:1"></span><button class="btn primary" id="np-create">Create</button></div>`;
    $('#np-back').onclick = openNew;
    $('#np-pic').onclick = async () => {   // Discord-style: upload, then frame it before it's used
      const keep = { n: $('#np-input').value, b: $('#np-bio').value };
      const url = await window.TribeCropper.pick({ title: 'Your project picture' }); if (!url) return;
      setup.image = url; customize(); $('#np-input').value = keep.n; $('#np-bio').value = keep.b;
    };
    const inp = $('#np-input'); inp.focus(); inp.select();
    inp.onkeydown = e => { if (e.key === 'Enter') $('#np-create').click(); };
    $('#np-create').onclick = createFromSetup;
  }
  async function createFromSetup() {
    const name = $('#np-input').value.trim().slice(0, 48); if (!name) return $('#np-input').focus();
    const bio = $('#np-bio').value.trim(), t = setup.tpl, btn = $('#np-create');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Creating…';
    try {
      const f = await window.TribeFlow.create(name, { emoji: t ? t.emoji : undefined, wait: 8000 });
      const patch = {}; if (bio) patch.bio = bio; if (setup.image) patch.image = setup.image;
      if (Object.keys(patch).length) await C.api(`/projects/${encodeURIComponent(f.project)}`, { method: 'PATCH', body: patch }).catch(() => {});
      if (t && t.note) await C.api('/flow/notes', { method: 'POST', body: { name: 'Starting idea', text: t.note } }).catch(() => {});
      body().classList.remove('np-setup');
      await refresh();
      window.TribeFlow.inviteSheet(f);   // step 3, like Discord: invite your friends
    } catch (e) { btn.disabled = false; btn.textContent = 'Create'; status(`<div class="np-err">${esc(e.message)}</div>`); }
  }
  function openAdvanced() {   // bring existing code (a folder, a repo, a GitHub URL), and the old one-box start
    dropped = null;
    modal().classList.remove('hidden');
    const on = C.connected(), host = on && isHost(), desk = !!window.TribeHost.isDesktop;
    const suggested = window.TribeFlow ? window.TribeFlow.suggestName() : '';
    const top = on
      ? `<div class="np-card np-new">
          <span class="eyebrow">Start a new tribe</span>
          <h3>Name it and go</h3>
          <p class="faint">A room, an invite link, chat and a repo, in one click.</p>
          <div class="np-row"><input class="input" id="np-input" aria-label="${host ? 'Name, GitHub URL or folder path' : 'Tribe name'}" placeholder="${host ? 'Name, or paste a GitHub URL' : 'Tribe name'}" autocomplete="off" maxlength="400" value="${esc(suggested)}"><button class="btn primary" id="np-create">Create</button></div>
          <div class="np-hint faint" id="np-hint"></div>
          ${window.TribeFlow ? `<button class="btn np-instant" id="np-instant">${ico('i-link', 15)}Invite a friend now<span class="faint">a fresh project, link copied</span></button>` : ''}
          ${host ? `<button class="linkish np-more" id="np-more">Bring existing code: a folder or repo</button>
            <div class="dropzone pj-dropzone np-drop-alt hidden" id="np-drop" tabindex="0" role="button" aria-label="Drop a folder or repo, or choose one">${ico('i-folder', 18)}<div>Drop a folder or repo here</div><div class="faint" style="font-size:12px;margin-top:2px">or <span class="linkish">choose one</span></div></div>
            <div class="np-status" id="np-status"></div>` : ''}
        </div>`
      : `<div class="np-card np-new">
          <span class="eyebrow">Start a new tribe</span>
          <h3>${desk ? 'Host it on this computer' : 'Host it with the desktop app'}</h3>
          <p class="faint">${desk ? 'Your computer runs the tribe; friends join with a link.' : 'TribeCode runs on one friend\'s computer. Get the app to start a tribe.'}</p>
          <div class="np-row">${desk ? '<button class="btn primary" id="np-host">Start hosting</button>' : '<a class="btn primary" href="https://github.com/orionopenwow/TribeCode/releases/latest" target="_blank" rel="noopener">Get TribeCode</a>'}</div>
        </div>`;
    body().innerHTML = `<div class="np-stack">${top}
        <div class="np-card np-join">
          <span class="eyebrow">Join a friend</span>
          <h3>Paste invite link</h3>
          <div class="np-row"><input class="input" id="np-link" placeholder="https://…/join/k7Qx2" autocomplete="off" spellcheck="false" aria-label="Invite link"><button class="btn" id="np-join-go">Join</button></div>
        </div>
      </div>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Cancel</button></div>`;
    body().querySelector('[data-close]').onclick = close;
    const join = () => { const v = $('#np-link').value.trim(); if (v) window.TribeApp.joinLink(v); };
    $('#np-join-go').onclick = join; $('#np-link').onkeydown = e => { if (e.key === 'Enter') join(); };
    const ib = $('#np-instant'); if (ib) ib.onclick = () => { close(); window.TribeFlow.instant(); };
    const hostBtn = $('#np-host'); if (hostBtn) hostBtn.onclick = () => { close(); App().openInvite(); };
    const inp = $('#np-input');
    if (inp) {
      inp.oninput = () => { inp.dataset.touched = '1'; hint(); };
      inp.onkeydown = e => { if (e.key === 'Enter') $('#np-create').click(); };
      $('#np-create').onclick = () => go().catch(() => {});
      const more = $('#np-more'), dz = $('#np-drop');
      if (more && dz) more.onclick = () => { dz.classList.remove('hidden'); more.classList.add('hidden'); };
      if (dz) wireDrop(dz);
      hint(); inp.focus(); inp.select();
    } else $('#np-link').focus();
  }
  async function go() {
    const c = classify($('#np-input').value), host = isHost();
    if (dropped && (c.kind === 'none' || c.kind === 'name')) {
      const name = c.kind === 'name' && $('#np-input').dataset.touched ? c.name : dropped.name;
      return dropped.mode === 'clone' ? create({ name, url: dropped.remote }, 'Cloning…') : startFromFiles(name, dropped.files);
    }
    if (c.kind === 'url' && host) return create({ url: c.url }, 'Cloning…');
    if (c.kind === 'path' && host && onHostMachine()) return create({ path: c.path }, 'Opening the folder…');
    if (c.kind === 'none') { $('#np-input').focus(); return; }
    const name = c.name || $('#np-input').value.trim().slice(0, 48);
    if (window.TribeFlow) {   // one-click flow: room + invite + repo + GitHub, then the chat with its Getting started card
      status('<div class="faint">Creating…</div>'); $('#np-create').disabled = true;
      try { await window.TribeFlow.create(name); close(); return; } catch (e) { $('#np-create').disabled = false; status(`<div class="np-err">${esc(e.message)}</div>`); if (!$('#np-status')) toast(e.message); throw e; }
    }
    return create({ name });
  }
  function status(html) { const s = $('#np-status'); if (s) s.innerHTML = html; else if (html) toast(html.replace(/<[^>]+>/g, '')); }
  async function create(payload, busy = 'Creating…') {
    status(`<div class="faint">${busy}</div>`);
    try {
      const r = await C.api('/projects', { method: 'POST', body: payload });
      await refresh();
      if (r.needsGit) return askGit(r.project);
      close(); toast(r.cloned ? `Cloned into ${r.project.name}` : r.uploaded ? `${r.project.name}: ${r.uploaded.written} files, committed` : `${r.project.name} is ready`);
      await switchTo(r.project.id, 'home');
      return r;
    } catch (e) { status(`<div class="np-err">${esc(e.message)}</div>`); if (!$('#np-status')) toast(e.message); throw e; }
  }
  function askGit(p) {
    modal().classList.remove('hidden');
    body().innerHTML = `<h2>${label(p)} is not a git repo yet</h2>
      <p class="lead">Make it one so everyone gets their own branch and every change is attributed. TribeCode runs <code>git init</code>, adds a .gitignore for node_modules, build folders and .env, and makes a first commit. Nothing leaves this computer.</p>
      <div class="modal-foot"><button class="btn" id="np-later">Not now</button><button class="btn primary" id="np-git">Make it a git repo</button></div>`;
    $('#np-later').onclick = () => { close(); switchTo(p.id, 'home'); };
    $('#np-git').onclick = async () => { $('#np-git').disabled = true; try { await C.api(`/projects/${encodeURIComponent(p.id)}/git-init`, { method: 'POST' }); toast('It is a git repo now'); } catch (e) { toast(e.message); } close(); await refresh(); switchTo(p.id, 'home'); };
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
    if (!entry && uri && /^https?:\/\//.test(uri)) { if (!$('#np-input') || $('#invite-body').classList.contains('np-setup')) { $('#invite-body').classList.remove('np-setup'); openAdvanced(); } $('#np-input').value = uri.trim(); hint(); return; }
    if (!entry || !entry.isDirectory) throw new Error('Drop a folder (or a repo folder). Single files go into Docs.');
    if (!$('#np-status') || $('#invite-body').classList.contains('np-setup')) { $('#invite-body').classList.remove('np-setup'); openAdvanced(); }
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
    homeDz.addEventListener('drop', async e => { e.preventDefault(); homeDz.classList.remove('over'); if (!isHost()) return toast('Only the host can bring a repo in. Ask them, or start an empty project with +.'); openAdvanced(); try { await fromDataTransfer(e.dataTransfer); } catch (err) { status(`<div class="np-err">${esc(err.message)}</div>`); } });
    homeDz.addEventListener('click', openNew);
    homeDz.addEventListener('keydown', e => { if (e.key === 'Enter') openAdvanced(); });
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
    s.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => { s.classList.add('hidden'); switchTo(b.dataset.sheet); });
    $('#pj-sheet-invite').onclick = () => { s.classList.add('hidden'); App().openInvite(); };
    const nw = $('#pj-sheet-new'); if (nw) nw.onclick = () => { s.classList.add('hidden'); openNew(); };
    return s;
  }
  const sw = $('#pj-switch'); if (sw) sw.addEventListener('click', e => { if (isPhone() || !window.TribeShell) sheet().classList.remove('hidden'); else App().show('home'); });   // the crumb opens the project's overview; the rail bubbles switch
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#pj-sheet')) $('#pj-sheet').classList.add('hidden'); });


  if (C.connected()) refresh();   // the socket may have said hello before this script loaded

  // A project deleted (here or by the host elsewhere): leave it and go Home.
  C.on('ws', m => { if (m.type !== 'project-removed') return; const was = cur() === m.id; refresh().then(async () => { if (!was) return; const d = projects[0]; if (d) await switchTo(d.id, 'home').catch(() => {}); if (window.TribeHub) window.TribeHub.open('home'); }); });
  window.TribeProjects = { refresh, list: () => projects, current: cur, cur: curP, face, label, here, pulses: () => pulses, sheet, pickImage, workspacePanel, switchTo, onShow, whereLabel, invitePicker, openNew, startFromFiles, analyze, fromPath, overview, requests };
})();
