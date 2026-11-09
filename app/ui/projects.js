// Project rooms, client side: the Projects cascade in the sidebar (each project unfolds into Overview,
// Chat, Docs, Tasks, Requests and More ›), the project Overview (pulse) and Requests views, the
// shared-workspace panel (GitHub sign-in on the host, "Give me a branch", commit/push as you), the
// "Start a project" flow (drop a folder or code repository, paste a GitHub URL or a path), the invite project
// picker, and the mobile project switcher sheet. Server side: server/projects.js, rooms.js, workspace.js.
(function () {
  const GH_MARK = '<svg class="ock-ghm" viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';   // the GitHub mark (the repo step)
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const App = () => window.TribeApp;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (n || '?').trim().split(/\s+/).map(w => [...w][0]).slice(0, 2).join('').toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#38C6B1', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');
  const toast = (m, k) => App() && App().toast(m, k);
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
  const pinit = n => String(n || '?').trim().split(/[\s_-]+/).map(w => [...w][0]).slice(0, 2).join('').toUpperCase() || '?';
  function face(p, cls = '') {
    if (p.image) return `<span class="pj-face ${cls} img" style="--pc:${esc(p.color)}"><img src="${esc(p.image)}" alt=""></span>`;
    if (p.emoji) return `<span class="pj-face ${cls} emo" style="--pc:${esc(p.color)}"><i class="pj-emo">${esc(p.emoji)}</i></span>`;
    return `<span class="pj-face ${cls}" style="--pc:${esc(p.color)};color:${ink(p.color)}">${esc(pinit(p.name))}</span>`;
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
  ['task', 'doc', 'vision', 'repo'].forEach(t => C.on(t, () => { if (App() && App().view && App().view() === 'home') overviewSoon(); }));   // the checklist ticks live
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
  // Put the standup/drop nodes (wired in app.js) back in #home-start, hidden, before a redraw wipes the overview.
  function stash() {
    const sc = $('#standup-card'), td = $('#tour-drop'); if (!sc || !td) return;
    const b = $('#standup-go'); if (b && !sc.contains(b)) { b.classList.remove('sm'); sc.appendChild(b); }
    const t = $('#standup-text'); if (t && !sc.contains(t)) sc.insertBefore(t, b && sc.contains(b) ? b : null);
    ['#dropzone', '#drops'].forEach(q => { const n = $(q); if (n && !td.contains(n)) td.appendChild(n); });
  }
  // One setup step, from the checklist, Flint's nudges or anywhere else
  function step(k) {
    const p = curP(); if (!p) return;
    if (k === 'vision') writeVision(p); else if (k === 'invite') App().openInvite(); else if (k === 'claude') App().connectClaude();
    else if (k === 'repo') { if (p.hasRepo || !isHost()) App().show('repo'); else createRepo(p); }
    else if (k === 'github') connectGithub(p);   // sign in to GitHub inside the app   // feat/setup-flow: one click makes the code repository
    else { App().show('tasks'); setTimeout(() => { const nb = $('#task-new'); nb && nb.click(); }, 80); }
  }
  let ovSeq = 0, visDraft = '', naming = false, lastOv = '';   // naming: the project name is being edited, so a redraw waits   // the checklist's inline vision box keeps what you typed across redraws
  // One redraw at a time: a request that arrives mid-redraw runs once right after it (never cancels it, so the page
  // always catches up even when events keep coming). A redraw that fails tries again shortly.
  let ovFlight = null, ovAgain = false;
  function overview() {
    if (ovFlight) { ovAgain = true; return ovFlight; }
    ovFlight = overviewNow().catch(e => { console.warn('overview', e); clearTimeout(ot); ot = setTimeout(overview, 1500); })
      .finally(() => { ovFlight = null; if (ovAgain) { ovAgain = false; overview(); } });
    return ovFlight;
  }
  async function overviewNow() {
    const el = $('#pj-overview'); if (!el) return;
    // instant first paint: what this device saw last time draws at once (still), then the fresh data replaces it
    { const cp = curP(); if (cp && !el.firstElementChild) { let c = null; try { c = localStorage.getItem('tribecode.ovcache:' + cp.id); } catch {} if (c) { el.innerHTML = c; el.classList.add('from-cache'); el.dataset.ovPid = ''; } } }
    const seq = ++ovSeq;   // the latest call wins: an older, slower render never paints over a newer one
    const p = curP();
    if (!p) { stash(); el.innerHTML = ''; return; }
    let d; try { d = await C.api(`/projects/${encodeURIComponent(p.id)}/pulse`); } catch (e) { stash(); el.innerHTML = `<div class="pj-empty">${esc(e.message)}</div>`; return; }
    const team = d.team.filter(m => m.kind !== 'agent');
    const meId = me().id, members = C.state().members || [];
    const myAgent = members.some(m => m.role === 'agent' && m.owner === meId);
    const whereOf = m => (m.here ? 'here' : m.online ? 'elsewhere' : 'away') + (m.role === 'host' ? ' · host' : m.role === 'spectator' ? ' · watching' : '');
    const who = m => `<div class="pj-person"><span class="avatar" style="background:${esc(m.color)};color:${ink(m.color)}">${esc(initials(m.name))}</span><span>${esc(m.name)}${m.id === meId ? ' <span class="faint">(you)</span>' : ''}</span><span class="faint">${whereOf(m)}</span></div>`;
    const kindIco = { task: 'i-check', doc: 'i-doc', commit: 'i-git' };
    let plan = null; try { plan = (await C.api('/coord/plan')).plan; } catch {}
    let tasksAll = []; try { tasksAll = (await C.api('/tasks')).tasks || []; } catch {}   // simple-dashboard: the Tasks tile and Up next
    let ghs = null; if (me().role !== 'spectator' && me().role !== 'agent') try { ghs = (await C.api('/github')).github || null; } catch {}   // the repo step: Connect GitHub first, then Create
    if (!$('#pj-overview') || curP() !== p) return;   // switched away while loading
    stash();
    const sec = (id, title, inner) => `<section class="sec pj-sec" id="${id}"><h2 class="pj-sec-t">${title}</h2>${inner}</section>`;
    const L = d.living, canEdit = me().role !== 'spectator' && me().role !== 'agent';
    const canName = isHost() || p.role === 'host';   // feat/setup-flow: rename and the emoji are for the host and project leads (the server checks too)
    const MOOD = { buzzing: 'Buzzing', steady: 'Steady', quiet: 'Quiet', fresh: 'Brand new' };
    // Way forward: today's plan focus when there is one (the old "Today's focus" card), else the next task.
    const planned = !!(plan && plan.items && plan.items.length);
    const next = planned ? `Today: ${plan.focus || plan.items[0].title}` : L && L.lines.next;
    // Onboarding checklist: ticks itself from what the project already has (replaces "No vision yet" and "Start here").
    const pk = `tribecode.ov.${p.id}.`, lsg = k => { try { return localStorage.getItem(pk + k); } catch { return null; } };
    const lss = (k, v) => { try { v == null ? localStorage.removeItem(pk + k) : localStorage.setItem(pk + k, v); } catch {} };
    const steps = [
      { id: 'vision', emo: '✨', label: 'Write the vision', sub: 'Say what you’re making and who it’s for. Everyone reads it.', done: !!(d.vision && d.vision.has), acts: canEdit ? `<button class="btn sm" data-ck="vision">${isHost() ? '✨ Help me write' : 'Suggest'}</button>` : '',
        inline: isHost() ? `<form class="ock-inline ock-vis" data-ock-vis><textarea class="input" id="ock-vis-in" rows="3" maxlength="4000" placeholder="e.g. A cozy pixel game where friends grow a garden at night. For our group of five, playable on phones." aria-label="Your vision">${esc(visDraft)}</textarea><div class="ock-in-foot"><small class="faint">A sentence or two is plenty. You can change it any time.</small><button class="btn sm ock-save" type="submit">Save vision</button></div></form>` : '' },
      { id: 'task', emo: '📝', label: 'Add a first task', sub: 'One small thing to build first.', done: (d.taskCount || 0) > 0, below: canEdit ? '<button class="btn sm primary" data-ck="newtask">New task</button>' : '',
        inline: canEdit && d.vision && d.vision.has ? `<div class="ock-inline ock-sugg"><span class="eyebrow">Suggested from your vision</span><div class="ock-sugg-list" id="ock-sugg"><span class="faint">Thinking of first tasks…</span></div><form class="ock-own" data-ock-task><input class="input" maxlength="140" placeholder="Or write your own first task" aria-label="Your own first task"><button class="btn sm" type="submit">Add</button></form></div>` : '' },
      { id: 'claude', emo: '🤖', label: 'Connect your AI', sub: 'Claude Code, Codex, Gemini or Cursor can build with you.', done: myAgent || d.agents.length > 0, acts: canEdit ? '<button class="btn sm" data-ck="claude">Connect</button>' : '' },
      { id: 'repo', emo: GH_MARK, label: ghs && ghs.signedIn ? 'Create the code repository on GitHub' : 'Connect GitHub and create the code repository',
        sub: (d.repo || p.hasRepo) ? 'Your project’s code lives here, with every change saved.' : ghs && ghs.signedIn ? `Signed in as @${esc(ghs.login || 'you')}. One click makes a private GitHub repository for your code, with every change saved.` : 'Your code lives on GitHub (the shared online folder for code), with every change saved. Connect your GitHub account, then one click makes it.',
        done: !!(d.repo || p.hasRepo), acts: isHost() ? `${ghs && !ghs.signedIn ? '<button class="btn sm ock-gh" data-ck="github">Connect GitHub</button>' : ''}<button class="btn sm" data-ck="repo">Create</button>` : (ghs && !ghs.signedIn ? '<button class="btn sm ock-gh" data-ck="github">Connect GitHub</button>' : '') },
    ];   // feat/setup-flow: four steps (a friend joining is no longer one); the code repository comes last
    const nDone = steps.filter(x => x.done).length, allDone = nDone === steps.length;
    // Until the tribe has really begun (a vision, a task or a friend; a pinned repo alone doesn't count), the checklist is
    // the hero of the page and the Living update stays hidden: there is nothing to report yet.
    // v0.24: the big step cards stay until every step is done (or the person hides them), so nobody skips the AI and the
    // code repository just because the vision went in first. "Hide the steps" folds them into the compact list.
    const started = steps.some(x => x.done && (x.id === 'vision' || x.id === 'task')), hero = !allDone && lsg('ckCompact') !== '1';
    const folded = !hero && lsg('ckFold') === '1';
    const tick = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>';
    const checklist = allDone && lsg('ckGone') === '1' ? ''
      : allDone ? `<section class="pj-check done" id="pj-check"><span class="ock-allset">${tick}All set</span><span class="faint ock-allsub">${esc(p.name)} has a vision, a task, an AI and a code repository.</span><button class="ock-x" id="pj-check-x" title="Dismiss" aria-label="Dismiss the checklist">${ico('i-x', 14)}</button></section>`
      : `<section class="pj-check ${folded ? 'folded' : ''} ${hero ? 'hero' : ''}" id="pj-check">
          ${hero ? `<span class="eyebrow ock-eyebrow">🚀 Getting started</span><h2 class="ock-hero-t">Set up ${esc(p.name)} in 4 steps</h2><p class="ock-hero-p">Say what you're making, add a first task, connect an AI helper, and create the code repository (the shared online folder for your code). The dashboard fills in as you go.</p>` : ''}
          <div class="ock-head"><h3>${hero ? 'Steps' : 'Getting started'}</h3><span class="ock-n">${nDone} of ${steps.length} done</span><button class="ock-fold" id="pj-check-fold" aria-expanded="${!folded}" title="Show or hide the checklist" aria-label="Show or hide the checklist">${ico('i-chev', 16)}</button></div>
          <div class="ock-bar" role="progressbar" aria-label="Checklist progress" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${nDone}"><span style="width:${Math.round(nDone / steps.length * 100)}%"></span></div>
          ${hero ? `<div class="ock-list ock-cards">${steps.map(x => `<div class="ock-row ock-card ${x.done ? 'on' : ''}" data-step="${x.id}"><span class="ock-box" role="checkbox" aria-checked="${x.done}" aria-label="${x.label}">${x.done ? tick : ''}</span>
            <span class="ock-emo" aria-hidden="true">${x.emo}${x.done ? `<i class="ock-emo-ok">${tick}</i>` : ''}</span>
            <div class="ock-main"><span class="ock-l">${x.label}</span><p class="ock-sub">${x.done ? 'Done' : esc(x.sub || '')}</p></div>
            ${!x.done && (x.acts || x.below) ? `<span class="ock-acts">${x.acts || ''}${x.below || ''}</span>` : ''}${!x.done && x.inline ? x.inline : ''}</div>`).join('')}</div>` : ''}
          ${hero ? '' : `<div class="ock-list">${steps.map(x => `<div class="ock-row ${x.done ? 'on' : ''}" data-step="${x.id}"><span class="ock-box" role="checkbox" aria-checked="${x.done}" aria-label="${x.label}">${x.done ? tick : ''}</span>
            <div class="ock-main"><div class="ock-line"><span class="ock-l">${x.label}</span>${!x.done && x.acts ? `<span class="ock-acts">${x.acts}</span>` : ''}</div>${!x.done && x.below ? `<div class="ock-below">${x.below}</div>` : ''}${!x.done && x.inline ? x.inline : ''}</div></div>`).join('')}</div>`}</section>`;
    // simple-dashboard: four tiles that answer "what needs me?" at a glance, each one click from where it's handled
    const N = window.TribeNotify && window.TribeNotify.state ? window.TribeNotify.state() : {};
    const dmUnread = window.TribeDM && window.TribeDM.unread ? Object.values(window.TribeDM.unread()).reduce((a, n) => a + (Number(n) || 0), 0) : 0;
    const openT = tasksAll.filter(t => t.status !== 'done'), mineT = openT.filter(t => t.assignee === meId), reviewT = openT.filter(t => t.status === 'review');
    const weekAgo = Date.now() - 7 * 864e5, newFiles = (d.recent || []).filter(x => x.kind === 'doc' && Date.parse(x.at) > weekAgo);
    const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    const prevMore = document.querySelector('#pj-more'), moreOpen = prevMore ? prevMore.open : lsg('more') === '1';
    // v0.25: colour-coded tiles with a big number, what it means, and the one thing to do about it
    const doneT = tasksAll.filter(t => t.status === 'done').length, unreadN = (N.unread || 0) + dmUnread, needN = (N.pending || 0) + reviewT.length;
    const tiles = [
      { k: 'needs', label: 'Needs you', icon: 'i-bell', n: needN, line: N.pending ? plural(N.pending, 'approval waiting', 'approvals waiting') : reviewT.length ? plural(reviewT.length, 'task to review', 'tasks to review') : 'Nothing waiting on you', act: needN ? 'Review now' : 'All clear', go: N.pending ? 'inbox' : 'tasks', hot: needN > 0, c: '#F26B1D' },
      { k: 'unread', label: 'Unread', icon: 'i-chat', n: unreadN, line: unreadN ? plural(unreadN, 'new message', 'new messages') : 'All caught up', act: unreadN ? 'Catch up' : 'Open chat', go: 'chat', hot: unreadN > 0, c: '#6C7CFF' },
      { k: 'tasks', label: 'Tasks', icon: 'i-check', n: openT.length, line: openT.length ? `open${mineT.length ? ` · ${mineT.length} yours` : ''}${doneT ? ` · ${doneT} done` : ''}` : doneT ? `all ${doneT} done` : 'None yet', act: openT.length ? 'Open the board' : 'Add a task', go: 'tasks', hot: mineT.length > 0, c: '#38C6B1', pct: tasksAll.length ? Math.round(doneT / tasksAll.length * 100) : 0 },
      { k: 'files', label: 'New files', icon: 'i-doc', n: newFiles.length, line: newFiles.length ? 'added this week' : 'Nothing new this week', act: newFiles.length ? 'See them' : 'Add a file', go: 'docs', hot: false, c: '#FABD2F' },
    ];
    const r = d.repo;
    if (naming) return;
    const visFocus = document.activeElement && document.activeElement.id === 'ock-vis-in';
    const html = `<div class="view-head pj-title pj-title2"><button class="pj-face-btn" id="pj-face" title="Change the picture" aria-label="Change the project picture">${face(p, 'lg')}${canEdit ? `<span class="pj-cam" aria-hidden="true">${ico('i-photo', 12)}</span>` : ''}</button>
        <div class="pj-id"><h1>${canName ? `<button class="pj-inl pj-name-btn" id="pj-name" title="Rename">${esc(p.name)}</button>` : esc(p.name)}</h1>
          <button class="pj-inl pj-bio ${d.bio ? '' : 'empty'}" id="pj-bio" ${canEdit ? '' : 'disabled'} title="${canEdit ? 'Edit the bio' : ''}">${d.bio ? esc(d.bio) : canEdit ? `${ico('i-quill', 14)}Add a short description` : ''}</button>
          <span class="faint pj-meta">${team.length} ${team.length === 1 ? 'person' : 'people'}${r ? `<span class="pj-dot">·</span><span title="The code repository: the shared folder that holds this project's code">${esc(r.name)}</span><span class="pj-dot">·</span><span title="The branch: the version of the code you're looking at (main is the shared one)">${esc(r.branch)}</span>` : ''}<span id="pj-site-slot"></span></span></div>
        ${canEdit ? `<button class="btn" id="pj-invite" style="margin-left:auto">${ico('i-users', 15)}Invite to ${esc(p.name)}</button>` : ''}</div>
      ${hero ? checklist : ''}
${canEdit && !started ? `      <section class="pj-context" id="pj-context"><div class="pj-ctx-head"><span class="pj-ctx-e" aria-hidden="true">📎</span><div><h3>Add files</h3><p>Drop docs, PDFs, pictures or notes. Flint and the AI helpers read them to understand ${esc(p.name)}.</p></div></div><div id="pj-ctx-body"></div></section>` : ''}
      ${started ? `<section class="card pj-living pj-glance" id="pj-living" aria-label="At a glance"><div class="pl-head"><span class="eyebrow">At a glance</span><button class="linkish pj-share" id="pj-share" type="button" title="Copy progress, the GitHub link and an invite link">📤 Share progress</button></div>
          <div class="pl-grid gl-grid">${tiles.map(t => `<button class="gl-tile gl-${t.k} ${t.hot ? 'hot' : ''} ${t.n ? '' : 'zero'}" data-go="${t.go}" style="--gc:${t.c}" aria-label="${t.label}: ${t.n} · ${esc(t.line)}. ${t.act}">
            <span class="gl-top"><span class="gl-ic">${ico(t.icon, 16)}</span><small>${t.label}</small>${t.hot ? '<i class="gl-dot" aria-hidden="true"></i>' : ''}</span>
            <span class="gl-num">${t.n}</span><span class="gl-line">${esc(t.line)}</span>
            ${t.pct != null && tasksAll.length ? `<span class="gl-bar" aria-hidden="true"><i style="width:${t.pct}%"></i></span>` : ''}
            <span class="gl-act">${t.act}<span aria-hidden="true">→</span></span></button>`).join('')}</div></section>` : ''}
      ${canEdit ? '<div id="pj-board-slot"></div>' : ''}<!-- v0.25: the inspiration board (inspo.js) -->
      ${sec('pj-sec-stream', 'Recent changes and what’s next', `<div class="pj-grid">
        <section class="card" id="pj-recent"><h3>${ico('i-refresh', 16)}Recent changes</h3>
          ${d.recent.length ? d.recent.map(x => `<div class="pj-row-line" ${x.kind === 'doc' ? `data-doc="${esc(x.ref)}"` : x.kind === 'task' ? 'data-go="tasks"' : 'data-go="repo"'}>${ico(kindIco[x.kind] || 'i-doc', 14)}<span class="t">${esc(x.text)}</span><span class="faint">${esc(x.sub)} · ${ago(x.at)}</span></div>`).join('') : '<div class="pj-none">Nothing yet. Saved code, doc edits and task moves show up here.</div>'}</section>
        <section class="card" id="pj-upcoming"><h3>${ico('i-calendar', 16)}Up next</h3>
          ${openT.length ? openT.slice().sort((x, y) => (y.assignee === meId) - (x.assignee === meId) || (x.status === 'doing' ? -1 : 0)).slice(0, 4).map(t => `<div class="pj-row-line" data-go="tasks">${ico('i-check', 14)}<span class="t">${esc(t.title)}</span><span class="faint">${t.status === 'doing' ? 'in progress' : t.status === 'review' ? 'to review' : 'to do'}${t.assignee === meId ? ' · yours' : ''}</span></div>`).join('') : ''}
          ${d.upcoming.length ? d.upcoming.map(u => `<div class="pj-row-line" data-go="calendar">${ico(u.kind === 'task' ? 'i-check' : 'i-calendar', 14)}<span class="t">${esc(u.title)}</span><span class="faint ${u.overdue ? 'pj-over' : ''}">${u.overdue ? 'overdue' : esc(new Date(u.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</span></div>`).join('') : (openT.length ? '' : '<div class="pj-none">Nothing planned yet. Open tasks and calendar items show up here.</div>')}</section></div>`)}
      ${canEdit && started ? `<section class="pj-context pj-files-row" id="pj-context"><div class="pj-ctx-head"><span class="pj-ctx-e" aria-hidden="true">📎</span><div><h3>Add files</h3><p>Drop docs, pictures or notes here. Flint and the AI helpers read them.</p></div>${newFiles.length ? `<div class="pj-newfiles">${newFiles.slice(0, 4).map(x => `<button class="pj-nf" data-doc="${esc(x.ref)}" title="${esc(x.text)}">📄 ${esc(String(x.text).replace(/^(Edited|Added|Created)\s+/i, '').slice(0, 26))}</button>`).join('')}</div>` : ''}</div><div id="pj-ctx-body"></div></section>` : ''}
      ${hero ? '' : checklist}
      <div id="pj-setup-slot"></div><!-- feat/setup-flow: role flows + Make the starter (setup.js) -->
      <div id="pj-insp-slot"></div>
      <details class="pj-more" id="pj-more"${moreOpen ? ' open' : ''}><summary>More about ${esc(p.name)}: people, AI helpers, code and standup</summary>
      ${sec('pj-sec-tribe', 'Tribe &amp; Agents', `<div class="pj-grid">
        <section class="card" id="pj-who"><h3>${ico('i-users', 16)}Who is here</h3>
          ${team.length ? team.sort((a, b) => b.here - a.here || b.online - a.online).map(who).join('') : '<div class="pj-none">Just you so far. Invite a friend to this project.</div>'}</section>
        <section class="card" id="pj-agents"><h3><span class="pj-live"></span>Agents</h3>
          ${d.agents.length ? d.agents.map(a => `<div class="pj-agent"><span class="pj-live"></span><b>${esc(a.name)}</b><span class="faint">${esc(a.where || 'working')}</span></div>`).join('') : '<div class="pj-none">No agent is working here right now.</div><button class="linkish pj-cc" id="pj-cc">Connect your AI</button>'}</section></div>`)}
      ${sec('pj-sec-repo', 'Code &amp; Tools', `<div class="pj-grid">
        <section class="card" id="pj-repo"><h3>${ico('i-git', 16)}Code repository${r ? '<button class="linkish pj-h-act" data-go="repo">Open</button>' : ''}</h3>
          ${r ? `<div class="pj-repo-sum"><b>${esc(r.name)}</b><span class="pj-chip live">${esc(r.branch || 'main')}</span><span class="pj-chip">↑${r.ahead || 0} ↓${r.behind || 0}</span><span class="pj-chip">${r.dirty ? `${r.dirty} changed` : 'clean'}</span></div>`
            : p.hasRepo ? '' : `<div class="pj-none">No code repository yet. Point ${esc(p.name)} at a code folder or a GitHub repository and it lives here.</div><div class="pj-actions"><button class="btn" data-go="repo">Set up the code repository</button></div>`}
          <div id="pj-ws" ${r ? '' : 'data-quiet="1"'}></div></section>
        <section class="card" id="pj-sf"><h3>${ico('i-upload', 16)}Daily standup<span class="pj-h-act" id="pj-sf-btn"></span></h3>
          <div id="pj-sf-body"></div></section></div>
        <div class="pj-tools-row"><button class="linkish pj-tools-link" id="pj-tools-link">${ico('i-box', 14)}Tools for ${esc(p.name)}</button></div>
        <div id="pj-tools-slot"></div>`)}
      </details>`;
    if (html === lastOv && el.dataset.ovPid === p.id && el.firstElementChild && !el.querySelector('.pj-name-in, .pj-bio-in')) return;   // nothing changed: keep the page as it is (nothing you're using gets replaced)
    lastOv = html; el.dataset.ovPid = p.id;
    el.innerHTML = html; el.classList.remove('from-cache');
    try { localStorage.setItem('tribecode.ovcache:' + p.id, html); } catch {}   // instant first paint next time
    // The standup button/text and the drop zone are wired in app.js: move the live nodes in (stash() moves them back before a redraw).
    const sfBtn = $('#standup-go'), sfText = $('#standup-text'), dzn = $('#dropzone'), drops = $('#drops');
    if (sfBtn) { sfBtn.classList.add('sm'); $('#pj-sf-btn').appendChild(sfBtn); }
    const sfBody = $('#pj-sf-body'); if (sfText) sfBody.appendChild(sfText);
    const ctx = $('#pj-ctx-body'); if (ctx) [dzn, drops].forEach(n => n && ctx.appendChild(n));   // qa-pass: spectators get no drop zone   // the drop zone is a main point of the page: it gives everyone context
    el.querySelectorAll('[data-ck]').forEach(x => x.onclick = () => step(x.dataset.ck));
    // tell the room panel and Flint how far along this project is, so they can stay simple early on
    window.TribeStage && window.TribeStage.set(p.id, { vision: steps[0].done, task: steps[1].done, agent: steps[2].done, repo: steps[3].done });
    const fold = $('#pj-check-fold');
    // the hero checklist: the next step gets the one solid button and a soft highlight; the rest stay calm
    const chk = $('#pj-check.hero');
    if (chk) { chk.querySelectorAll('.btn.primary').forEach(x => x.classList.remove('primary')); const nx = chk.querySelector('.ock-row:not(.on)'); if (nx) { nx.classList.add('ock-next'); const b1 = nx.querySelector('.ock-acts .btn, .ock-below .btn'); if (b1) b1.classList.add('primary'); } }
    bindInline(p, visFocus);
    const shb = $('#pj-share'); if (shb) shb.onclick = () => window.TribeShip && window.TribeShip.share();   // feat/ship-flow
    if (fold) fold.onclick = () => { if ($('#pj-check').classList.contains('hero')) { lss('ckCompact', '1'); lss('ckFold', '1'); lastOv = ''; overview(); return; } const f = $('#pj-check').classList.toggle('folded'); lss('ckFold', f ? '1' : null); fold.setAttribute('aria-expanded', String(!f)); };
    const ckx = $('#pj-check-x'); if (ckx) ckx.onclick = () => { lss('ckGone', '1'); $('#pj-check').remove(); };
    const inv = $('#pj-invite'); if (inv) inv.onclick = () => App().openInvite();
    const more = $('#pj-more'); if (more) more.addEventListener('toggle', () => lss('more', more.open ? '1' : null));   // re-renders keep the current open state (moreOpen)
    $('#pj-face').onclick = () => (canName ? pickFace(p) : pickImage(p));   // feat/setup-flow: emoji grid + Upload a picture
    const nm = $('#pj-name'); if (nm) nm.onclick = () => editName(p);
    const bio = $('#pj-bio'); if (bio && canEdit) bio.onclick = () => editBio(p, d.bio);
    const cc = $('#pj-cc'); if (cc) cc.onclick = () => App().connectClaude();
    $('#pj-tools-link').onclick = () => (window.TribeWorkshop && window.TribeWorkshop.open ? window.TribeWorkshop.open('shelf') : App().show('repo'));
    el.querySelectorAll('[data-go]').forEach(x => x.onclick = () => (x.dataset.go === 'plan' ? window.TribeCoord.open('plan') : x.dataset.go === 'inbox' ? (window.TribeNotify && window.TribeNotify.openInbox()) : App().show(x.dataset.go)));
    el.querySelectorAll('[data-doc]').forEach(x => x.onclick = () => window.TribeShell ? window.TribeShell.previewDoc(x.dataset.doc) : (App().show('docs'), setTimeout(() => window.TribeDocs.open(x.dataset.doc), 150)));
    workspacePanel($('#pj-ws'));
    if (window.TribeInspo) window.TribeInspo.draw(p.id);
    toolbox(p);
    if (window.TribeSense) window.TribeSense.card(p);   // feat/project-sense: the Inspiration card (sense.js)
    if (window.TribeSetup) window.TribeSetup.card(p, d);   // feat/setup-flow: role flows + Make the starter (setup.js)
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
    b.replaceWith(inp); inp.focus(); naming = true;
    let done = false;
    const save = async keep => { if (done) return; done = true; lastOv = '';
      if (keep && inp.value.trim() !== (cur || '')) { try { await C.api(`/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { bio: inp.value } }); await refresh(); } catch (e) { toast(e.message); } }
      naming = false; lastOv = ''; overview(); };
    inp.onkeydown = e => { if (e.key === 'Enter') save(true); if (e.key === 'Escape') save(false); };
    inp.onblur = () => save(true);
  }
  // ---------- feat/setup-flow: inline header edits (name, face) and Create the code repository ----------
  // All three header fields behave the same: a hover outline, click to edit, Enter saves, Esc cancels.
  function editName(p) {
    const b = $('#pj-name'); if (!b) return;
    const inp = document.createElement('input'); inp.className = 'input pj-name-in'; inp.maxLength = 48; inp.value = p.name; inp.setAttribute('aria-label', 'Project name');
    b.replaceWith(inp); inp.focus(); inp.select(); naming = true;
    let done = false;
    const save = async keep => { if (done) return; done = true; lastOv = '';
      const v = inp.value.trim();
      if (keep && v && v !== p.name) { try { await C.api(`/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { name: v } }); p.name = v; if (inp.isConnected) { const nb = document.createElement('button'); nb.className = 'pj-inl pj-name-btn'; nb.id = 'pj-name'; nb.title = 'Rename'; nb.textContent = v; nb.onclick = () => editName(p); inp.replaceWith(nb); } await refresh(); const cp = curP(); if (cp && cp.id === p.id) cp.name = v; toast('Renamed'); } catch (e) { toast(e.message); } }
      naming = false; lastOv = ''; overview(); };
    inp.onkeydown = e => { if (e.key === 'Enter') save(true); if (e.key === 'Escape') save(false); };
    inp.onblur = () => save(true);
  }
  const FACES = ['🎮', '🕹️', '👾', '🐉', '🚀', '🌙', '🔥', '🌿', '🍄', '🦊', '🐙', '🌊', '⚡', '🎨', '📱', '🌐', '🛠️', '🤖', '📚', '🎵', '🧩', '🏰', '🧪', '✨'];
  function pickFace(p) {
    const btn = $('#pj-face'); if (!btn) return;
    let pop = $('#pj-face-pop'); if (pop) { pop.remove(); return; }
    pop = document.createElement('div'); pop.id = 'pj-face-pop'; pop.className = 'pj-face-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Pick a face');
    pop.innerHTML = `<div class="pfp-grid">${FACES.map(e => `<button class="pfp-e ${p.emoji === e && !p.image ? 'on' : ''}" data-face="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
      <div class="pfp-foot"><button class="btn sm" id="pfp-upload">${ico('i-photo', 14)}Upload a picture</button>${p.image ? '<button class="linkish" id="pfp-clear">Remove picture</button>' : ''}</div>`;
    document.body.appendChild(pop);   // on the body, so a Dashboard redraw doesn't close it
    const r = btn.getBoundingClientRect(); pop.style.top = `${Math.round(r.bottom + 6)}px`; pop.style.left = `${Math.round(Math.max(16, Math.min(r.left, innerWidth - pop.offsetWidth - 16)))}px`;
    const close = () => { pop.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc1, true); };
    const away = e => { if (!pop.contains(e.target) && !(e.target.closest && e.target.closest('#pj-face'))) close(); };
    const esc1 = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc1, true); }, 0);
    const patch = async body => { close(); try { await C.api(`/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body }); await refresh(); overview(); } catch (e) { toast(e.message); } };
    pop.querySelectorAll('[data-face]').forEach(b => b.onclick = () => patch({ emoji: b.dataset.face, image: '' }));
    pop.querySelector('#pfp-upload').onclick = () => { close(); pickImage(p); };
    const cl = pop.querySelector('#pfp-clear'); if (cl) cl.onclick = () => patch({ image: '' });
    const first = pop.querySelector('.pfp-e'); if (first) first.focus();
  }
  async function createRepo(p) {
    const b = document.querySelector('#pj-check [data-ck=repo], #room-next [data-rn=repo]'); if (b) { b.disabled = true; b.textContent = 'Creating…'; }
    try {
      await C.api(`/projects/${encodeURIComponent(p.id)}/setup/repo`, { method: 'POST' });
      toast('Code repository ready, with its first saved version', 'ok'); await refresh(); overview();
      // GitHub only when it is already set up on the host (a signed-in gh CLI or a saved token)
      let w = null; try { w = await C.api(`/projects/${encodeURIComponent(p.id)}/workspace`); } catch {}
      if (w && w.repo && !w.repo.remote && ((w.github || {}).signedIn || (w.identity || {}).hasToken)) {
        try { const r = await C.api('/flow/github', { method: 'POST', body: {} }); toast(r.step && r.step.s === 'ok' ? 'Your code repository is on GitHub now (private)' : 'Saved on this computer. GitHub: ' + ((r.step && r.step.note) || 'not done yet'), r.step && r.step.s === 'ok' ? 'ok' : 'warn'); } catch (e) { offerGithub(p); }
        overview();
      } else if (w && w.repo && !w.repo.remote) toast('Saved on this computer. Connect GitHub to put it online.', 'info');
    } catch (e) { toast(e.message); if (b) { b.disabled = false; b.textContent = 'Create'; } }
  }
  // ---------- the checklist, inline: write the vision right in its card, then pick a first task from suggestions ----------
  function bindInline(p, refocus) {
    const vf = $('[data-ock-vis]');
    if (vf) {
      const ta = vf.querySelector('textarea');
      ta.oninput = () => { visDraft = ta.value; };
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); vf.requestSubmit(); } };
      if (refocus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      vf.onsubmit = async e => {
        e.preventDefault(); const text = ta.value.trim();
        if (text.length < 8) { toast('Write a sentence about what you’re making and who it’s for', 'warn'); ta.focus(); return; }
        const btn = vf.querySelector('button'); btn.disabled = true; btn.textContent = 'Saving…';
        try { await C.api('/vision', { method: 'PUT', body: { text: `# ${p.name}\n\n${text}` } }); visDraft = ''; toast('Vision saved. Here are some first tasks to pick from.', 'ok'); overview(); }
        catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.textContent = 'Save vision'; }
      };
    }
    const own = $('[data-ock-task]');
    if (own) own.onsubmit = async e => {
      e.preventDefault(); const inp = own.querySelector('input'), title = inp.value.trim(); if (!title) { inp.focus(); return; }
      try { await C.api('/tasks', { method: 'POST', body: { title } }); toast(`Added “${title}” to the Task Board`, 'ok'); overview(); } catch (err) { toast(err.message, 'err'); }
    };
    const list = $('#ock-sugg');
    if (list) (async () => {
      let sg = []; try { sg = (await C.api('/assist/tasks')).suggestions || []; } catch {}
      if (!list.isConnected) return;
      if (!sg.length) { list.innerHTML = '<span class="faint">No suggestions yet. Write your own below.</span>'; return; }
      list.innerHTML = sg.slice(0, 4).map(x => `<button type="button" class="ock-sg" data-title="${esc(x.title)}" title="${esc(x.why || '')}"><span aria-hidden="true">＋</span>${esc(x.title)}</button>`).join('');
      list.querySelectorAll('.ock-sg').forEach(b => b.onclick = async () => {
        b.disabled = true;
        try { await C.api('/tasks', { method: 'POST', body: { title: b.dataset.title } }); toast(`Added “${b.dataset.title}” to the Task Board`, 'ok'); overview(); } catch (err) { b.disabled = false; toast(err.message, 'err'); }
      });
    })();
  }
  function connectGithub(p) {
    const m = $('#invite-modal'), body = $('#invite-body'); if (!m || !body) return;
    m.classList.remove('hidden');
    body.innerHTML = `<span class="eyebrow">GitHub · ${esc(p.name)}</span><h2 class="pj-gh-h">${GH_MARK} Connect GitHub</h2>
      <p class="lead">GitHub keeps your project’s code online, with every change saved, so your friends and AI helpers all work from the same place. Sign in once. Your token stays on the host computer and is never shown in a browser.</p>
      <div id="pj-gh-box" class="pj-gh-box"></div>
      <div class="modal-foot"><a class="linkish" href="https://github.com/signup" target="_blank" rel="noopener">No account? Make one free</a><span style="flex:1"></span><button class="btn" data-close>Done</button></div>`;
    const onIn = () => { if (!m.classList.contains('hidden')) setTimeout(close, 1200); };
    function close() { m.classList.add('hidden'); removeEventListener('tribe:github', onIn); overview(); }
    addEventListener('tribe:github', onIn);
    body.querySelector('[data-close]').onclick = close;
    if (window.TribeGitHub) window.TribeGitHub.mount($('#pj-gh-box')); else $('#pj-gh-box').textContent = 'Open Settings › GitHub to sign in.';
  }
  function offerGithub(p) {
    const m = $('#invite-modal'), body = $('#invite-body'); if (!m || !body) return;
    m.classList.remove('hidden');
    body.innerHTML = `<span class="eyebrow">Code repository · ${esc(p.name)}</span><h2>Also put it on GitHub?</h2>
      <p class="lead">GitHub is set up on this computer, so ${esc(p.name)} can get a private GitHub repository too. Everything works locally either way.</p>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Not now</button><button class="btn primary" id="pj-gh-go">Push to GitHub</button></div>`;
    const close = () => m.classList.add('hidden');
    body.querySelector('[data-close]').onclick = close;
    $('#pj-gh-go').onclick = async () => { const g = $('#pj-gh-go'); g.disabled = true; g.textContent = 'Pushing…';
      try { const r = await C.api('/flow/github', { method: 'POST', body: {} }); toast(r.step && r.step.s === 'ok' ? 'On GitHub now' : 'GitHub: ' + ((r.step && r.step.note) || 'not done yet')); } catch (e) { toast(e.message); }
      close(); overview(); };
  }
  // No vision yet: the host writes it (VISION.md, read by the plan, the board and the agents); others suggest one in chat.
  function writeVision(p) {
    if (window.TribeAssist) return window.TribeAssist.vision(p, { host: isHost(), done: overview });   // feat/assist: guided prompts, Draft with Flint / my Claude, suggestion chips
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
    if (!r && box.dataset.quiet) { box.innerHTML = ''; return; }
    if (!r) html = `<div class="pj-none">No code repository yet. ${isHost() ? 'Start a project from a folder or a GitHub URL with <b>+</b> in the sidebar.' : 'The host can attach one.'}</div>`;
    else if (!r.git) html = `<div class="pj-none">The folder <b>${esc(r.name)}</b> is not a code repository yet.</div>${isHost() ? '<button class="btn primary" id="pj-gitinit">Make it a code repository</button><div class="faint pj-small">Runs git init with a .gitignore for node_modules, build folders and .env, then saves a first version.</div>' : ''}`;
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
    act('#pj-gitinit', async () => { await C.api(`/projects/${pid}/git-init`, { method: 'POST' }); toast('It’s a code repository now, with its first saved version.'); refresh(); });
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
    if (window.TribeAskAgent) window.TribeAskAgent.mountRequests(el.querySelector('.pj-req'));   // feat/any-llm: Ask an agent requests
    el.querySelectorAll('[data-go]').forEach(x => x.onclick = () => App().show(x.dataset.go));
    el.querySelectorAll('[data-ap-do]').forEach(btn => btn.onclick = async e => {
      e.stopPropagation(); const aid = btn.closest('[data-ap]').dataset.ap;
      try { await C.api(`/approvals/${aid}/${btn.dataset.apDo}`, { method: 'POST', body: {} }); } catch (err) { toast(err.message); }
      requests(); refresh();
    });
  }
  C.on('approval', () => { if (App() && App().view() === 'requests') requests(); });
  C.on('change', () => { if (App() && App().view() === 'requests') requests(); });

  // ---------- Start a project: drop a folder or code repository, paste a URL or a path ----------
  const modal = () => $('#invite-modal'), body = () => $('#invite-body');
  const close = () => { modal().classList.add('hidden'); body().classList.remove('np-setup'); };
  // One dialog: drop a folder or code repository, or type a name, a GitHub URL or a folder path, then Create.
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
    h.textContent = c.kind === 'url' ? (host ? 'Clones the code repository onto the host and makes it this project\'s shared workspace.' : 'Only the host can bring a code repository in. This will just be the project name.')
      : c.kind === 'path' ? (host && onHostMachine() ? 'Opens that folder on this computer as the project\'s repo.' : 'Folder paths only work on the host computer.')
      : c.kind === 'name' ? (window.TribeFlow ? 'One click: the room, an invite link and a code repository with a starter. The chat opens with a Getting started card.' : 'Starts an empty project. You can attach a code repository later.') : '';
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
      body().innerHTML = `<div class="ns-head"><h2>${on ? 'Join a project' : 'Create your project'}</h2><p class="lead">${desk ? 'Your work lives in a shared GitHub repository; friends join with one link.' : 'Your work lives in a shared GitHub repository. Get the app to start a tribe, or join a friend.'}</p></div>
        ${on ? '' : `<div class="ns-list"><button class="ns-row ns-own" id="np-host"><span class="ns-ic">${ico('i-plus', 18)}</span><span class="ns-t"><b>${desk ? 'Host on this computer' : 'Get the desktop app'}</b><small>${desk ? 'Start a tribe here, then make your first project' : 'Windows, Mac and Linux'}</small></span>${ico('i-chev', 16)}</button></div>`}
        ${joinFoot()}`;
      wireStart(); return;
    }
    const row = (k, ic, t, sub, cls = '') => `<button class="ns-row ${cls}" data-ns="${k}"><span class="ns-ic">${ic}</span><span class="ns-t"><b>${t}</b><small>${sub}</small></span>${ico('i-chev', 16)}</button>`;
    body().innerHTML = `<button class="ns-x" data-close aria-label="Close">${ico('i-x', 16)}</button>
      <div class="ns-head"><h2>What do you want to make?</h2><p class="lead">One sentence is enough. It becomes your project's vision, and the suggested tasks, starter and website follow from it.</p></div>
      <form class="ns-prompt" id="np-prompt"><textarea class="input" id="np-idea" rows="3" maxlength="600" placeholder="e.g. A cozy pixel game where friends water plants at night" aria-label="What do you want to make?"></textarea>
        <div class="ns-chips">${IDEAS.map(t => `<button type="button" class="ns-chip" data-idea="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="np-status" id="np-status"></div>
        <div class="ns-btns"><span style="flex:1"></span><button class="btn primary" id="np-idea-go" type="submit">Start building</button></div></form>
      <div class="ns-list"><div class="ns-sub">Or start from</div>
        ${row('own', ico('i-plus', 18), 'A blank project', 'Name it and add the idea later', 'ns-own')}
        ${TEMPLATES.map(t => row('tpl:' + t.k, `<span class="ns-emo">${t.emoji}</span>`, t.t, t.s)).join('')}
        ${host ? row('remix', '<span class="ns-emo">🧩</span>', 'Remix a starter', 'Open-source games, apps and sites to build on', 'ns-remix') : ''}
        ${host ? row('code', ico('i-folder', 18), 'Bring my code', 'A folder on this computer, or a GitHub repository') : ''}</div>
      ${joinFoot()}`;
    body().querySelectorAll('[data-ns]').forEach(b => b.onclick = () => {
      const k = b.dataset.ns;
      if (k === 'code') { body().classList.remove('np-setup'); return openAdvanced(); }
      if (k === 'remix') return openStarters();
      setup.tpl = k.startsWith('tpl:') ? TEMPLATES.find(t => t.k === k.slice(4)) : null;
      customize();
    });
    const ideaIn = $('#np-idea');
    body().querySelectorAll('[data-idea]').forEach(b => b.onclick = () => { ideaIn.value = b.dataset.idea; ideaIn.focus(); });
    ideaIn.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#np-prompt').requestSubmit(); } };
    $('#np-prompt').onsubmit = e => { e.preventDefault(); createFromIdea(ideaIn.value); };
    if (!isPhone()) ideaIn.focus();
    wireStart();
  }
  // Start with a prompt (v0.20): the sentence becomes the vision; the name, emoji and kind are guessed from it, and the
  // dashboard's suggested tasks, the starter and the site builder read the vision from there.
  const IDEAS = ['A cozy pixel game we can play together', 'A website for my friend\'s bakery', 'An app that tracks our habits', 'A party quiz for game night'];
  const KIND_OF = [[/\b(game|platformer|rpg|puzzle|shooter|runner|quiz|pixel|level|boss)\b/i, '🎮'], [/\b(site|website|page|portfolio|blog|landing|bakery|shop|caf[eé]|restaurant|event)\b/i, '🌐'], [/\b(app|tracker|planner|list|bot|tool|dashboard)\b/i, '📱']];
  function nameFromIdea(idea) {
    const STOP = new Set('a an the and or of to for in on at with by is are be it its this that we our us you your my me i from as into where who can will make build want like some cozy simple small little new friend friends play together let lets'.split(' '));
    const KINDW = /^(game|website|site|app|page|bot|tool|quiz)$/i;
    const pick = t => String(t).replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(w => w && !STOP.has(w.toLowerCase()) && !/'s$/i.test(w));
    let words = pick(String(idea).split(/\s(?:with|that|where|which|so|to help|,)\s/i)[0]);
    if (words.length < 2) words = pick(idea);
    words = words.slice(0, 3);
    if (words.length > 1 && KINDW.test(words[0])) words.push(words.shift());   // "website … bakery" -> "Bakery Website"
    const n = words.slice(0, 3).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    return (n || `${String(me().name || 'My').split(/\s+/)[0]}'s project`).slice(0, 40);
  }
  async function createFromIdea(raw) {
    const idea = String(raw || '').trim(); if (!idea) { $('#np-idea').focus(); return; }
    const kind = KIND_OF.find(([re]) => re.test(idea)), taken = new Set(projects.map(p => p.name)), base = nameFromIdea(idea);
    let name = base; for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
    const btn = $('#np-idea-go'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Setting it up…';
    try {
      const f = await window.TribeFlow.create(name, { emoji: kind ? kind[1] : '✨', wait: 8000 });
      const pid = f.project;
      await C.api(`/projects/${encodeURIComponent(pid)}`, { method: 'PATCH', body: { bio: idea.slice(0, 200) } }).catch(() => {});
      await C.api('/vision', { method: 'PUT', project: pid, body: { text: `# ${name}\n\n${idea}\n` } }).catch(() => {});
      body().classList.remove('np-setup');
      await refresh();
      window.TribeFlow.inviteSheet(f);
    } catch (e) { btn.disabled = false; btn.textContent = 'Start building'; status(`<div class="np-err">${esc(e.message)}</div>`); }
  }
  // Remix a starter (templates/starters.json): open-source projects checked for permissive licenses. Small ones copy
  // straight into a new project from GitHub; big collections open in the browser to borrow from. Credit stays with the authors.
  const KIND_E = { game: '🎮 Games', app: '📱 Apps', site: '🌐 Sites', asset: '🎨 Art and sound' };
  async function openStarters() {
    body().classList.add('np-setup');
    body().innerHTML = `<button class="ns-x" data-close aria-label="Close">${ico('i-x', 16)}</button><div class="ns-head"><h2>Remix a starter</h2><p class="lead">Open-source projects you can build on. Each one keeps its authors' license and credit.</p></div><div class="st-list" id="st-list"><p class="faint">Loading…</p></div>
      <div class="ns-btns"><button class="linkish" id="np-back">Back</button></div>`;
    body().querySelector('[data-close]').onclick = close; $('#np-back').onclick = openNew;
    let items = []; try { items = (await C.api('/shelf/starters')).items || []; } catch {}
    const box = $('#st-list'); if (!box) return;
    if (!items.length) { box.innerHTML = '<p class="faint">Starters are not available right now.</p>'; return; }
    const groups = Object.keys(KIND_E).map(k => [k, items.filter(i => i.kind === k)]).filter(([, l]) => l.length);
    box.innerHTML = groups.map(([k, l]) => `<div class="ns-sub">${KIND_E[k]}</div>${l.map(i => `<div class="st-row"><span class="ns-emo">${esc(i.emoji || '✨')}</span>
        <span class="st-t"><b>${esc(i.title)}</b><small>${esc(i.summary)}</small><small class="st-cred">by ${esc(i.by)} · <span class="st-lic">${esc(i.license)}</span></small></span>
        ${i.remix && i.repo ? `<button class="btn sm primary" data-remix="${esc(i.repo)}" data-name="${esc(i.title)}">Start from this</button>` : `<a class="btn sm" href="${esc(i.url || 'https://github.com/' + i.repo)}" target="_blank" rel="noopener">Browse</a>`}</div>`).join('')}`).join('');
    box.querySelectorAll('[data-remix]').forEach(b => b.onclick = () => remix(b.dataset.remix));
  }
  function remix(repo) {   // the "Bring my code" box, filled with the GitHub address
    if (!isHost()) { toastMsg('Ask your host to start this one: only the host can copy code into a new project.'); return; }
    body().classList.remove('np-setup'); openAdvanced();
    const inp = $('#np-input'); if (!inp) return;
    inp.value = /^https?:/.test(repo) ? repo : 'https://github.com/' + repo; inp.dataset.touched = '1';
    inp.dispatchEvent(new Event('input')); inp.focus();
  }
  const toastMsg = t => { if (App() && App().toast) App().toast(t); else alert(t); };
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
  function openAdvanced() {   // bring existing code (a folder, a code repository, a GitHub URL), and the old one-box start
    dropped = null;
    modal().classList.remove('hidden');
    const on = C.connected(), host = on && isHost(), desk = !!window.TribeHost.isDesktop;
    const suggested = window.TribeFlow ? window.TribeFlow.suggestName() : '';
    const top = on
      ? `<div class="np-card np-new">
          <span class="eyebrow">Start a new tribe</span>
          <h3>Name it and go</h3>
          <p class="faint">A room, an invite link, chat and a code repository, in one click.</p>
          <div class="np-row"><input class="input" id="np-input" aria-label="${host ? 'Name, GitHub URL or folder path' : 'Tribe name'}" placeholder="${host ? 'Name, or paste a GitHub URL' : 'Tribe name'}" autocomplete="off" maxlength="400" value="${esc(suggested)}"><button class="btn primary" id="np-create">Create</button></div>
          <div class="np-hint faint" id="np-hint"></div>
          ${window.TribeFlow ? `<button class="btn np-instant" id="np-instant">${ico('i-link', 15)}Invite a friend now<span class="faint">a fresh project, link copied</span></button>` : ''}
          ${host ? `<button class="linkish np-more" id="np-more">Bring existing code: a folder or code repository</button>
            <div class="dropzone pj-dropzone np-drop-alt hidden" id="np-drop" tabindex="0" role="button" aria-label="Drop a folder or code repository, or choose one">${ico('i-folder', 18)}<div>Drop a folder or code repository here</div><div class="faint" style="font-size:12px;margin-top:2px">or <span class="linkish">choose one</span></div></div>
            <div class="np-status" id="np-status"></div>` : ''}
        </div>`
      : `<div class="np-card np-new">
          <span class="eyebrow">Start a new tribe</span>
          <h3>${desk ? 'Host it on this computer' : 'Host it with the desktop app'}</h3>
          <p class="faint">${desk ? 'Your work lives in a shared GitHub repository; friends join with a link.' : 'Your work lives in a shared GitHub repository. Get the app to start a tribe.'}</p>
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
    body().innerHTML = `<h2>${label(p)} is not a code repository yet</h2>
      <p class="lead">Make it one so everyone gets their own branch and every change is attributed. TribeCode runs <code>git init</code>, adds a .gitignore for node_modules, build folders and .env, and saves a first version. Nothing leaves this computer.</p>
      <div class="modal-foot"><button class="btn" id="np-later">Not now</button><button class="btn primary" id="np-git">Make it a code repository</button></div>`;
    $('#np-later').onclick = () => { close(); switchTo(p.id, 'home'); };
    $('#np-git').onclick = async () => { $('#np-git').disabled = true; try { await C.api(`/projects/${encodeURIComponent(p.id)}/git-init`, { method: 'POST' }); toast('It’s a code repository now'); } catch (e) { toast(e.message); } close(); await refresh(); switchTo(p.id, 'home'); };
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
    if (!entry || !entry.isDirectory) throw new Error('Drop a folder (or a code folder). Single files go into Docs.');
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
  // Decide what to offer: clone (the folder is a code repository with a remote) or upload the files.
  async function analyze(name, items) {
    const cfg = items.find(i => i.gitConfig), files = items.filter(i => !i.gitConfig);
    let remote = null; if (cfg) { const t = await cfg.file.text(); const m = t.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/); remote = m ? m[1] : null; }
    const total = files.reduce((n, f) => n + f.file.size, 0);
    const big = total > CAP;
    dropped = { name, files, remote, mode: remote ? 'clone' : 'upload' };
    const say = () => status(`<div class="np-found">${ico('i-folder', 15)}<b>${esc(name)}</b> <span class="faint">· ${files.length} file${files.length === 1 ? '' : 's'} · ${kb(total)}${remote ? ' · has a git remote' : cfg ? ' · code repository' : ''}</span></div>
      ${dropped.mode === 'clone' ? `<div class="pj-small faint">Create clones it from <code>${esc(remote.replace(/\/\/[^@/]+@/, '//'))}</code> with the host's git, history included. <button class="linkish" id="np-do-upload">Upload the files instead</button></div>`
        : big ? `<div class="np-err">That's over 25 MB after skipping node_modules, .git and build folders. ${remote ? '<button class="linkish" id="np-do-clone">Clone it instead</button>,' : 'Push it to GitHub and paste the URL,'} or paste its path on the host.</div>`
        : `<div class="pj-small faint">Create copies the files to the host (skipping node_modules, .git and build folders), sets up the code repository and saves the first version as you.${remote ? ' <button class="linkish" id="np-do-clone">Clone it instead</button>' : ''}</div>`}`);
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
    homeDz.addEventListener('drop', async e => { e.preventDefault(); homeDz.classList.remove('over'); if (!isHost()) return toast('Only the host can bring a code repository in. Ask them, or start an empty project with +.'); openAdvanced(); try { await fromDataTransfer(e.dataTransfer); } catch (err) { status(`<div class="np-err">${esc(err.message)}</div>`); } });
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
  // tribecode.org's "Start from this" opens the app with ?remix=owner/repo: once you're the host, the box is filled in
  (function remixFromLink() {
    let r = ''; try { r = new URLSearchParams(location.search).get('remix') || ''; } catch {}
    if (!/^[\w.-]+\/[\w.-]+$/.test(r)) return;
    const tryIt = () => { if (!C.connected() || !me().id) return false; try { history.replaceState(null, '', location.pathname + location.hash); } catch {} if (isHost()) remix(r); else toastMsg('That starter needs the host to start it. Share the link with them: github.com/' + r); return true; };
    if (!tryIt()) C.on('hello', function once() { if (r && tryIt()) r = ''; });
  })();
  window.TribeProjects = { createFromIdea, nameFromIdea, openStarters, remix, step, refresh, list: () => projects, current: cur, cur: curP, face, label, here, pulses: () => pulses, sheet, pickImage, workspacePanel, switchTo, onShow, whereLabel, invitePicker, openNew, startFromFiles, analyze, fromPath, overview, requests };
})();
