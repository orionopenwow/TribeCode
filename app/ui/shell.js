// The shell around every view (the mix of Discord and the Claude desktop app):
//   far-left circle rail (projects.js draws the circles) | the project's nest | main | right panel.
// This file renders the nest: the header (project · switcher), the core daily drivers (Chat, Docs & files,
// Updates, Tasks, Huddle, Capture to notes), two collapsible groups (Project Hub, Coordinate & Ops), Pinned,
// Recents and the bottom utility row (Settings, Invite friends). One registry (DEST) drives the nest, the
// breadcrumb section menu and the Ctrl K palette, so every destination is listed exactly once.
// Also: the project switcher dropdown, the + New menu (phones' orange action), the right panel's preview mode.
// Public: window.TribeShell = { render, onShow, preview, closePreview, switcher, go, dests, openNew, recent }.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const App = () => window.TribeApp;
  const PJ = () => window.TribeProjects;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, sz = 16) => `<svg class="i" style="width:${sz}px;height:${sz}px"><use href="#${id}"/></svg>`;
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const toast = m => App() && App().toast(m);
  const pid = () => (PJ() && PJ().current()) || 'default';
  const closeDrawer = () => document.body.classList.remove('drawer-open');

  // ---------- every destination, once ----------
  // group: core | hub | ops | foot | none (palette and crumbs only). when(): shown only while true (Roles, Requests).
  const coord = tab => { if (window.TribeCoord) window.TribeCoord.open(tab); else App().show('coord'); };
  const flowOn = () => !!(window.TribeFlow && window.TribeFlow.state && window.TribeFlow.state());
  let counts = {};   // badges: bugs, requests, reviews, handoffs
  let lastDest = '';
  const DEST = [
    { key: 'chat', label: 'Chat', icon: 'i-chat', group: 'core', keys: 'messages general talk', run: () => App().show('chat') },
    { key: 'docs', label: 'Docs & files', icon: 'i-doc', group: 'core', keys: 'documents notes files pages', run: () => App().show('docs') },
    { key: 'updates', label: 'Updates', icon: 'i-bell', group: 'core', keys: 'inbox notifications plan feed', run: () => openUpdates() },
    { key: 'tasks', label: 'Tasks', icon: 'i-check', group: 'core', keys: 'todo kanban', run: () => App().show('tasks') },
    { key: 'huddle', label: 'Huddle', icon: 'i-mic', group: 'core', kind: 'Action', keys: 'voice call talk mic audio join start', hint: 'Ctrl Shift M', run: () => { const H = window.TribeHuddle; if (H && !H.inCall()) H.join(); } },
    { key: 'capture', label: 'Capture to notes', icon: 'i-doc', group: 'core', kind: 'Action', keys: 'voice speech transcribe dictate record notes toggle', hint: 'Ctrl Shift N', run: () => window.TribeCapture && window.TribeCapture.toggle() },
    { key: 'bugs', label: 'Bugs', icon: 'i-bug', group: 'hub', keys: 'bug inbox issues', run: () => App().show('bugs') },
    { key: 'board', label: 'Proposals & board', icon: 'i-vote', group: 'hub', keys: 'approval board vote vision', run: () => App().show('board') },
    { key: 'milestones', label: 'Milestones', icon: 'i-flag', group: 'hub', keys: 'roadmap goals', run: () => { App().show('board'); setTimeout(() => { const m = $('#ms-list'); m && m.closest('.card').scrollIntoView({ block: 'center' }); }, 120); } },
    { key: 'calendar', label: 'Calendar', icon: 'i-calendar', group: 'hub', keys: 'schedule week month events', run: () => App().show('calendar') },
    { key: 'repo', label: 'Repo', icon: 'i-git', group: 'hub', keys: 'git branches code github', run: () => App().show('repo') },
    { key: 'visuals', label: 'Visuals & screenshots', icon: 'i-photo', group: 'hub', keys: 'screenshots compare diff images', run: () => App().show('visuals') },
    { key: 'roles', label: 'Roles', icon: 'i-users', group: 'hub', keys: 'people roles folders', when: flowOn, run: () => window.TribeFlow && window.TribeFlow.openRoles() },
    { key: 'requests', label: 'Requests', icon: 'i-inbox', group: 'hub', keys: 'approvals change requests waiting', when: () => !!counts.requests || (App() && App().view() === 'requests'), run: () => App().show('requests') },
    { key: 'agents', label: 'Agents', icon: 'i-robot', group: 'ops', keys: 'coordinate claude agents panel', run: () => coord('agents') },
    { key: 'ownership', label: 'Ownership map', icon: 'i-map', group: 'ops', keys: 'claims files owners', run: () => coord('ownership') },
    { key: 'conflicts', label: 'Conflict radar', icon: 'i-merge', group: 'ops', keys: 'merge overlap branches', run: () => coord('conflicts') },
    { key: 'handoffs', label: 'Hand-offs', icon: 'i-hand', group: 'ops', keys: 'handoff park take', run: () => coord('handoffs') },
    { key: 'reviews', label: 'Reviews', icon: 'i-eye', group: 'ops', keys: 'review approve', run: () => coord('reviews') },
    { key: 'plan', label: 'Daily plan', icon: 'i-sun', group: 'ops', keys: 'today standup plan', run: () => coord('plan') },
    { key: 'agents-hub', label: 'Your agents', icon: 'i-plug', group: 'ops', keys: 'claude desktop mcp local models hub connect', run: () => window.TribeAgentsHub && window.TribeAgentsHub.open() },
    { key: 'secretary', label: 'Secretary', icon: 'i-quill', group: 'ops', keys: 'journal digest inspirations background', run: () => window.TribeSecretary && window.TribeSecretary.open() },
    { key: 'settings', label: 'Settings', icon: 'i-gear', group: 'foot', kind: 'Action', keys: 'preferences profile name color folder brain', run: () => window.TribeSettings && window.TribeSettings.open() },
    { key: 'invite', label: 'Invite friends', icon: 'i-users', group: 'foot', kind: 'Action', keys: 'link join share qr', run: () => App().openInvite() },
    { key: 'home', label: 'Project home', icon: 'i-home', keys: 'home overview', run: () => App().show('home') },
    { key: 'project-settings', label: 'Project settings', icon: 'i-gear', kind: 'Action', keys: 'rename emoji color picture project', run: () => projectSettings() },
  ];
  const byKey = k => DEST.find(d => d.key === k);
  const GROUPS = [['hub', 'Project Hub'], ['ops', 'Coordinate & Ops']];
  const COUNT = { bugs: 1, requests: 1, reviews: 1, handoffs: 1 };
  const HOT = { requests: 1, reviews: 1, handoffs: 1 };
  function go(key) {
    const d = byKey(key); if (!d) return;
    lastDest = key; closePop(); closeDrawer();
    d.run(); setTimeout(markActive, 0);
  }

  // ---------- the two collapsible groups (open/closed per group in localStorage) ----------
  const FKEY = g => `tribecode.nav.${g}`;
  const isOpen = g => { try { return localStorage.getItem(FKEY(g)) !== '0'; } catch { return true; } };
  function drawGroups() {
    const box = $('#nest-groups'); if (!box) return;
    box.innerHTML = GROUPS.map(([g, label]) => `<div class="nest-fold ${isOpen(g) ? 'open' : ''}" id="grp-${g}" data-group="${g}">
        <button class="nest-fold-head" data-fold="${g}" aria-expanded="${isOpen(g)}" aria-controls="grp-${g}-body"><span>${esc(label)}</span><span class="n" id="gn-${g}"></span>${ico('i-chev', 14)}</button>
        <div class="nest-fold-body" id="grp-${g}-body" role="group" aria-label="${esc(label)}">${DEST.filter(d => d.group === g).map(d =>
          `<button class="nest-row" data-pnav="${esc(d.key)}" id="nest-${esc(d.key)}">${ico(d.icon, 18)}<span>${esc(d.label)}</span>${COUNT[d.key] ? `<span class="n" id="nn-${esc(d.key)}"></span>` : ''}</button>`).join('')}</div></div>`).join('');
    visibility();
  }
  function fold(g, open) {
    const el = $(`#grp-${g}`); if (!el) return;
    el.classList.toggle('open', open); el.querySelector('.nest-fold-head').setAttribute('aria-expanded', String(open));
    try { localStorage.setItem(FKEY(g), open ? '1' : '0'); } catch {}
    paintGroupCounts();
  }
  function visibility() { DEST.forEach(d => { if (!d.when) return; const el = $(`#nest-${d.key}`); if (el) el.classList.toggle('hidden', !d.when()); }); }
  function paintCounts() {
    for (const k of Object.keys(COUNT)) {
      const el = $(`#nn-${k}`); if (!el) continue; const v = counts[k] || 0;
      el.textContent = v ? (v > 99 ? '99+' : v) : ''; el.classList.toggle('hot', !!(v && HOT[k]));
    }
    visibility(); paintGroupCounts();
  }
  // A folded group still says when something inside waits on you.
  function paintGroupCounts() {
    for (const [g] of GROUPS) {
      const el = $(`#gn-${g}`); if (!el) continue;
      const v = isOpen(g) ? 0 : DEST.filter(d => d.group === g && HOT[d.key]).reduce((s, d) => s + (counts[d.key] || 0), 0);
      el.textContent = v ? (v > 99 ? '99+' : v) : ''; el.classList.toggle('hot', !!v);
    }
  }

  // ---------- which destination is on screen ----------
  function current() {
    const v = document.body.dataset.view || '';
    if (v === 'coord') return (window.TribeCoord && window.TribeCoord.tab()) || 'agents';
    if (v === 'flow-roles') return 'roles';
    if (v === 'flow-updates' || v === 'updates') return 'updates';
    if (v === 'board') return lastDest === 'milestones' ? 'milestones' : 'board';
    return v;
  }
  function markActive() {
    const cur = document.body.classList.contains('ws-open') ? '' : current();
    document.querySelectorAll('[data-pnav]').forEach(b => { const on = b.dataset.pnav === cur; if (b.classList.contains('on') !== on) b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    for (const [g] of GROUPS) { const el = $(`#grp-${g}`); if (el) el.classList.toggle('has-on', DEST.some(d => d.group === g && d.key === cur)); }
    visibility();
  }
  new MutationObserver(markActive).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  setTimeout(() => {
    const cl = $('#crumb-label'); if (cl) new MutationObserver(markActive).observe(cl, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => markActive()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }, 0);

  // ---------- a small popover we own (flat, 1px border, no shadow) ----------
  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; document.querySelectorAll('#crumb-section, #pj-switch, #nest-switch, [data-nav-menu]').forEach(b => b.setAttribute('aria-expanded', 'false')); } }
  function pop(anchor, html, { id, side = 'right', cls = '' } = {}) {
    closePop();
    const el = document.createElement('div'); el.className = `sh-pop ${cls} ${isPhone() ? 'sheet' : ''}`; if (id) el.id = id; el.setAttribute('role', 'menu');
    el.innerHTML = (isPhone() ? '<div class="pj-grab"></div>' : '') + html;
    document.body.appendChild(el); popEl = el;
    if (!isPhone()) {
      const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      let x = side === 'right' ? r.right + 8 : r.left, y = side === 'right' ? r.top - 6 : r.bottom + 6;
      x = Math.min(Math.max(8, x), innerWidth - w - 8); y = Math.min(Math.max(8, y), innerHeight - h - 8);
      el.style.left = x + 'px'; el.style.top = y + 'px';
    }
    anchor.setAttribute && anchor.setAttribute('aria-expanded', 'true');
    const f = el.querySelector('button'); if (f && !isPhone()) f.focus({ preventScroll: true });
    return el;
  }
  document.addEventListener('mousedown', e => { if (popEl && !popEl.contains(e.target) && !e.target.closest('#nest-switch, #crumb-section, #pj-switch, [data-nav-menu]')) closePop(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && popEl) { closePop(); e.stopPropagation(); }
    if (popEl && ['ArrowDown', 'ArrowUp'].includes(e.key)) { const all = [...popEl.querySelectorAll('button:not([disabled])')]; const i = all.indexOf(document.activeElement); const n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]; if (n) { n.focus(); e.preventDefault(); } }
  }, true);

  // Updates: the flow's plan + feed, the phone's Updates screen, or the bell's inbox.
  function openUpdates() {
    if (flowOn() && window.TribeFlow.openUpdates) return window.TribeFlow.openUpdates();
    if (isPhone() && window.TribeMobile) return window.TribeMobile.show('updates');
    return window.TribeNotify ? window.TribeNotify.openInbox() : ($('#nf-bell') && $('#nf-bell').click());
  }

  // ---------- + New ----------
  function openNew(anchor) {
    const items = [
      { label: 'Task', icon: 'i-check', run: () => { App().show('tasks'); setTimeout(() => { const b = $('#task-new'); b && b.click(); }, 80); } },
      { label: 'Doc', icon: 'i-doc', run: () => { App().show('docs'); setTimeout(() => { const b = $('#doc-new'); b && b.click(); }, 120); } },
      { label: 'Upload a file', icon: 'i-upload', run: upload },
      { label: 'Start a huddle', icon: 'i-mic', run: () => { if (window.TribeHuddle) window.TribeHuddle.join(); } },
      { label: 'Ask Claude', icon: 'i-sparkle', run: askClaude },
      { label: 'Report a bug', icon: 'i-bug', run: () => window.TribeBugs && window.TribeBugs.capture() },
    ];
    const el = pop(anchor, `<div class="sh-menu">${items.map((x, i) => `<button data-i="${i}">${ico(x.icon)}<span>${esc(x.label)}</span></button>`).join('')}</div>`, { id: 'new-menu' });
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { closePop(); document.body.classList.remove('drawer-open'); items[+b.dataset.i].run(); });
  }
  function upload() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
    inp.onchange = () => { const fs = [...inp.files]; if (!fs.length) return; App().show('docs'); window.TribeDocs.importFiles(fs).then(() => toast(`Added ${fs.length} file${fs.length > 1 ? 's' : ''} to Docs`)).catch(e => toast(e.message)); };
    inp.click();
  }
  // Ask Claude: your own Claude Code's private chat if it is connected, else the local brain in chat.
  function askClaude() {
    const me = (C.state().me || {}).id;
    const ag = (C.state().members || []).find(m => m.role === 'agent' && m.owner === me);
    if (ag && window.TribeDM) { window.TribeDM.open(ag.id); return; }
    App().show('chat');
    setTimeout(() => { const i = $('#chat-input'); if (i) { i.value = '@brain '; i.focus(); i.dispatchEvent(new Event('input', { bubbles: true })); } }, 60);
    if (!ag) toast('Connect your Claude Code (right panel) to ask it directly. @brain asks the local brain.');
  }

  // ---------- breadcrumbs: the section menu mirrors the nest (core, then the two groups) ----------
  function menuRows(list) {
    const cur = current();
    return list.filter(d => !d.when || d.when()).map(d => `<button data-dest="${esc(d.key)}" class="${d.key === cur ? 'on' : ''}">${ico(d.icon)}<span>${esc(d.label)}</span>${COUNT[d.key] && counts[d.key] ? `<span class="n ${HOT[d.key] ? 'hot' : ''}">${counts[d.key]}</span>` : ''}</button>`).join('');
  }
  function sectionMenu(anchor) {
    const core = DEST.filter(d => d.group === 'core' && d.kind !== 'Action');
    const html = `<div class="sh-menu">${menuRows(core)}${GROUPS.map(([g, label]) => `<h6>${esc(label)}</h6>${menuRows(DEST.filter(d => d.group === g))}`).join('')}</div>`;
    const el = pop(anchor, html, { id: 'section-menu', side: 'below' });
    el.querySelectorAll('[data-dest]').forEach(b => b.onclick = () => go(b.dataset.dest));
  }
  function switcher(anchor) {
    const list = PJ() ? PJ().list() : [], cur = PJ() && PJ().current(), F = PJ().face;
    const scoped = Array.isArray((C.state().me || {}).projects);
    const el = pop(anchor, `<div class="sh-menu sh-projects"><h6>Projects</h6>${list.map(p => { const k = p.counts || {}, h = PJ().here(p.id).length;
        return `<button data-pj-open="${esc(p.id)}" class="${p.id === cur ? 'on' : ''}">${F(p, 'sm')}<span>${esc(p.name)}<small>${h ? `${h} here` : ''}${k.tasks ? `${h ? ' · ' : ''}${k.tasks} open` : ''}</small></span>${p.id === cur ? ico('i-tick', 14) : ''}</button>`; }).join('')}
      <hr>${scoped ? '' : `<button data-pj-new>${ico('i-plus')}<span>New project</span></button>`}${cur ? `<button data-dest="project-settings">${ico('i-gear')}<span>Project settings</span></button>` : ''}</div>`, { id: 'project-menu', side: anchor.id === 'nest-switch' ? 'right' : 'below' });
    el.querySelectorAll('[data-dest]').forEach(b => b.onclick = () => go(b.dataset.dest));
    return el;
  }
  $('#crumb-section').addEventListener('click', e => { e.stopPropagation(); popEl && popEl.id === 'section-menu' ? closePop() : sectionMenu(e.currentTarget); });
  $('#ws-name').addEventListener('click', () => App().show('home'));
  $('#nest-switch').addEventListener('click', e => { e.stopPropagation(); if (popEl && popEl.id === 'project-menu') return closePop(); if (PJ() && PJ().list().length) switcher(e.currentTarget); else App().show('home'); });

  // ---------- nest ----------
  function render(p, h) {
    if (!p) return;
    const k = p.counts || {}, here = h ? h.here(p.id).length : 0;
    const tribe = (C.state().tribe || {}).name || ($('#ws-name') && $('#ws-name').textContent) || '';
    $('#nest-face').innerHTML = h ? h.face(p, 'sm') : '';
    $('#nest-name').textContent = p.name;
    $('#nest-sub').textContent = [tribe !== p.name ? tribe : '', here > 1 ? `${here} here` : ''].filter(Boolean).join(' · ');
    const set = (id, v, hot) => { const el = $(id); if (!el) return; el.textContent = v ? (v > 99 ? '99+' : v) : ''; el.classList.toggle('hot', !!(v && hot)); };
    const pulse = h ? (h.pulses[p.id] || 0) : 0;
    set('#nn-chat', pulse, true); set('#nn-tasks', k.tasks);
    counts.bugs = k.bugs || 0; counts.requests = k.requests || 0;
    paintCounts();
    pinned(p);
    recents();
  }
  function updates() {   // the bell's unread count (notify.js) mirrored on the Updates row
    const c = $('#nf-count'), v = c && !c.classList.contains('hidden') ? Number(c.textContent) || 0 : 0;
    const el = $('#nn-updates'); if (el) { el.textContent = v ? (v > 99 ? '99+' : v) : ''; el.classList.toggle('hot', !!v); }
  }
  setTimeout(() => { const c = $('#nf-count'); if (c) new MutationObserver(updates).observe(c, { childList: true, attributes: true, characterData: true, subtree: true }); updates(); }, 0);
  async function refreshCounts() {
    if (!C.connected()) return;
    try { const s = await C.api('/coord/summary'); counts.reviews = s.reviews; counts.handoffs = s.handoffs; } catch { return; }
    paintCounts();
  }
  let ct; const countsSoon = () => { clearTimeout(ct); ct = setTimeout(refreshCounts, 500); };
  C.on('hello', countsSoon); C.on('project', countsSoon); C.on('task', countsSoon); C.on('approval', countsSoon);
  C.on('ws', m => { if (m.type === 'coord') countsSoon(); });

  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const f = e.target.closest('[data-fold]'); if (f) { const g = f.dataset.fold; return fold(g, !isOpen(g)); }
    const nm = e.target.closest('[data-nav-menu]'); if (nm) { e.stopPropagation(); return document.body.classList.toggle('drawer-open'); }
    const d = e.target.closest('.side [data-pnav], #tabbar [data-pnav]');
    if (d && !d.dataset.nav && !e.defaultPrevented) { e.preventDefault(); return go(d.dataset.pnav); }
    if (d && d.dataset.nav) lastDest = d.dataset.pnav;
    const rc = e.target.closest('[data-recent]'); if (rc) { closeDrawer(); return openRecent(rc.dataset.recent); }
  });
  function onShow(view) {
    closePop();
    if (window.TribeMobile) window.TribeMobile.onShow(view);   // phones: rack, hubs, composer (app/ui/mobile2.js)
    if (view === 'chat') { const p = PJ() && PJ().cur(); if (p && PJ().pulses()) { PJ().pulses()[p.id] = 0; const el = $('#nn-chat'); if (el) { el.textContent = ''; el.classList.remove('hot'); } } }
    markActive();
  }

  // ---------- huddle row: "Huddle · Live", then "Orion and Maya talking" ----------
  function huddleLine() {
    const r = (window.TribeHuddle && window.TribeHuddle.roster()) || C.state().huddle || [];
    const names = r.map(x => ((C.state().members || []).find(m => m.id === x.id) || {}).name || 'someone');
    const sub = $('#huddle-sub'), live = $('#huddle-live'), box = $('#nest-huddle');
    if (!sub) return;
    sub.classList.toggle('hidden', !names.length); live.classList.toggle('hidden', !names.length);
    if (box) { box.classList.toggle('live', !!names.length); box.classList.toggle('in-call', !!(window.TribeHuddle && window.TribeHuddle.inCall())); }
    const row = $('#nest-huddle-row'); if (row) row.title = window.TribeHuddle && window.TribeHuddle.inCall() ? 'You are in the huddle' : names.length ? 'Join the huddle (Ctrl Shift M)' : 'Start a huddle (Ctrl Shift M)';
    sub.textContent = !names.length ? '' : names.length === 1 ? `${names[0]} is talking` : names.length === 2 ? `${names[0]} and ${names[1]} talking` : `${names[0]}, ${names[1]} and ${names.length - 2} more talking`;
  }
  C.on('huddle', () => setTimeout(huddleLine, 0)); C.on('presence', huddleLine);
  setTimeout(() => { const hb = $('#huddle-box'); if (hb) new MutationObserver(huddleLine).observe(hb, { childList: true }); }, 0);
  drawGroups(); markActive();

  const repoBranch = {};
  // ---------- Pinned: the repo, pinned docs (docsx.js fills #side-pins-list), pinned chat messages ----------
  function pinned(p) {
    const repo = $('#pin-repo');
    if (repo) repo.innerHTML = p && p.hasRepo ? `<button class="pin-repo-card" data-nav="repo" title="Open the repo"><span class="pr-ico">${ico('i-git')}</span><span class="pr-t"><span class="eyebrow">Repo</span><b>${esc(p.name)}</b><code id="pin-repo-branch">${esc(repoBranch[p.id] || '')}</code></span></button>` : '';
    if (p && p.hasRepo && repoBranch[p.id] === undefined) { repoBranch[p.id] = ''; C.api(`/projects/${encodeURIComponent(p.id)}/workspace`).then(w => { const b = w.branch && w.branch.exists ? w.branch.branch : (w.repo ? (w.repo.remote ? w.repo.remote.replace(/^https?:\/\/(www\.)?/, '').replace(/\.git$/, '') : 'local repo') : ''); repoBranch[p.id] = b; const el = $('#pin-repo-branch'); if (el) el.textContent = b; }).catch(() => {}); }
    const chats = $('#pin-chats'), strip = $('#pin-strip'), m = strip && !strip.classList.contains('hidden') && /(\d+) pinned/.exec(strip.textContent);
    if (chats) chats.innerHTML = m ? `<button class="nest-row small" id="pin-chat-open">${ico('i-pin')}<span>${m[1]} pinned in chat</span></button>` : '';
    const pc = $('#pin-chat-open'); if (pc) pc.onclick = () => { App().show('chat'); const s = $('#pin-strip'); if (s && !s.classList.contains('open')) { const hb = s.querySelector('.pin-head'); hb && hb.click(); } };
    const docsHave = $('#side-pins') && !$('#side-pins').classList.contains('hidden') && $('#side-pins-list').children.length;
    $('#nest-pinned').classList.toggle('empty', !(p && p.hasRepo) && !m && !docsHave);
  }
  setTimeout(() => { const s = $('#pin-strip'); if (s) new MutationObserver(() => pinned(PJ() && PJ().cur())).observe(s, { childList: true, attributes: true }); const l = $('#side-pins-list'); if (l) new MutationObserver(() => pinned(PJ() && PJ().cur())).observe(l, { childList: true }); }, 500);

  // ---------- Recents: docs, tasks and threads you opened here ----------
  const RKEY = () => `tribecode.recents:${pid()}`;
  const getR = () => { try { return JSON.parse(localStorage.getItem(RKEY()) || '[]'); } catch { return []; } };
  function recent(kind, ref, title) {
    if (!ref || !title) return;
    const list = getR().filter(r => !(r.kind === kind && r.ref === ref));
    list.unshift({ kind, ref, title: String(title).slice(0, 80), at: Date.now() });
    try { localStorage.setItem(RKEY(), JSON.stringify(list.slice(0, 12))); } catch {}
    recents();
  }
  function recents() {
    const box = $('#recents-list'); if (!box) return;
    const list = getR().slice(0, 6), icon = { doc: 'i-doc', task: 'i-check', thread: 'i-chat', file: 'i-upload' };
    box.innerHTML = list.map(r => `<button class="nest-row small" data-recent="${esc(r.kind)}:${esc(r.ref)}" title="${esc(r.title)}">${ico(icon[r.kind] || 'i-doc')}<span>${esc(r.title)}</span></button>`).join('');
    $('#nest-recents').classList.toggle('empty', !list.length);
  }
  function openRecent(key) {
    const i = key.indexOf(':'), kind = key.slice(0, i), ref = key.slice(i + 1);
    if (kind === 'doc') return previewDoc(ref);
    if (kind === 'thread') return window.TribeDM && window.TribeDM.open(ref);
    if (kind === 'task') { App().show('tasks'); setTimeout(() => { const t = document.querySelector(`.task[data-id="${CSS.escape(ref)}"]`); if (t) { t.scrollIntoView({ block: 'center' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1400); } }, 300); }
  }
  // Record what gets opened.
  (function hook() {
    const D = window.TribeDocs;
    if (D && D.open && !D.open.__shell) {
      const orig = D.open; D.open = async function (slug, ...rest) { const r = await orig.call(this, slug, ...rest); setTimeout(() => { const t = $('#doc-title'); recent('doc', slug, (t && t.value) || slug); }, 50); return r; }; D.open.__shell = true;
    }
    const M = window.TribeDM;
    if (M && M.open && !M.open.__shell) {
      const orig = M.open; M.open = function (mid, ...rest) { const m = (C.state().members || []).find(x => x.id === mid); if (m) recent('thread', mid, m.role === 'agent' ? m.name : `Chat with ${m.name}`); return orig.call(this, mid, ...rest); }; M.open.__shell = true;
    }
    document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('.task[data-id]'); if (t && !e.target.closest('button, select, input')) recent('task', t.dataset.id, (t.querySelector('.title, .t, b, span') || t).textContent.trim()); });
  })();

  // ---------- right panel: In the room ⇄ preview ----------
  const room = $('#tour-room');
  function preview({ kind = 'File', title = '', html = '', node = null, actions = [] } = {}) {
    document.body.classList.remove('panel-off'); syncToggle();
    room.classList.add('previewing');
    $('#preview-kind').textContent = kind;
    $('#preview-title').textContent = title;
    const body = $('#preview-body'); body.innerHTML = html; if (node) body.appendChild(node);
    const act = $('#preview-actions'); act.innerHTML = actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''}" data-pa="${i}">${esc(a.label)}</button>`).join('');
    act.querySelectorAll('[data-pa]').forEach(b => b.onclick = () => actions[+b.dataset.pa].run());
    if (isPhone()) document.body.classList.add('phone-preview');
  }
  function closePreview() { room.classList.remove('previewing'); document.body.classList.remove('phone-preview'); $('#preview-body').innerHTML = ''; }
  $('#preview-close').addEventListener('click', closePreview);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && room.classList.contains('previewing') && !popEl && !document.querySelector('.modal:not(.hidden)')) closePreview(); });
  async function previewDoc(slug) {
    preview({ kind: 'Doc', title: 'Loading…', html: '' });
    try {
      const { doc } = await C.api('/docs/' + encodeURIComponent(slug));
      preview({ kind: 'Doc', title: doc.title, html: `<div class="md pv-doc">${window.TribeMD.render(doc.body || '')}</div>`,
        actions: [{ label: 'Open', primary: true, run: () => { closePreview(); App().show('docs'); setTimeout(() => window.TribeDocs.open(slug), 80); } }] });
      recent('doc', slug, doc.title);
    } catch (e) { preview({ kind: 'Doc', title: slug, html: `<p class="faint">${esc(e.message)}</p>` }); }
  }
  function previewImage(url, title, kind = 'Screenshot') {
    preview({ kind, title, html: `<div class="pv-img"><img alt="${esc(title)}" src="${esc(url)}"></div>`, actions: [{ label: 'Open full size', run: () => window.open(url, '_blank', 'noopener') }] });
  }
  function previewApproval(a, after) {
    const mine = a.status === 'pending' && ((a.to || []).includes((C.state().me || {}).id) || (C.state().me || {}).role === 'host');
    preview({ kind: 'Approval', title: a.title, html: `<div class="pv-ap"><div class="faint">${esc(a.byName || '')} · ${esc(a.risk || '')} risk · ${esc(a.status)}</div>${a.details ? `<div class="md">${window.TribeMD.render(a.details)}</div>` : ''}${a.note ? `<p class="faint">Note: ${esc(a.note)}</p>` : ''}</div>`,
      actions: mine ? [{ label: 'Approve', primary: true, run: () => decide('approve') }, { label: 'Deny', run: () => decide('deny') }] : [] });
    async function decide(d) { try { await C.api(`/approvals/${a.id}/${d}`, { method: 'POST', body: {} }); toast(d === 'approve' ? 'Approved' : 'Denied'); closePreview(); after && after(); } catch (e) { toast(e.message); } }
  }
  // Anything can ask for a preview declaratively.
  document.addEventListener('click', e => {
    const im = e.target.closest && e.target.closest('[data-preview-img]'); if (im) { e.preventDefault(); return previewImage(im.dataset.previewImg, im.dataset.previewTitle || 'Image', im.dataset.previewKind || 'Screenshot'); }
    const d = e.target.closest && e.target.closest('[data-preview-doc]'); if (d) { e.preventDefault(); return previewDoc(d.dataset.previewDoc); }
  });
  // Pinned docs open as a preview first (docsx.js binds them to the editor; the preview has "Open").
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#side-pins-list [data-pin-open]'); if (b) { e.stopImmediatePropagation(); e.preventDefault(); document.body.classList.remove('drawer-open'); previewDoc(b.dataset.pinOpen); } }, true);

  // collapse
  const PKEY = 'tribecode.panelOff';
  function syncToggle() { const t = $('#panel-toggle'); if (t) t.setAttribute('aria-pressed', String(!document.body.classList.contains('panel-off'))); }
  try { if (localStorage.getItem(PKEY) === '1') document.body.classList.add('panel-off'); } catch {}
  syncToggle();
  $('#panel-toggle').addEventListener('click', () => { const off = document.body.classList.toggle('panel-off'); if (off) closePreview(); try { localStorage.setItem(PKEY, off ? '1' : '0'); } catch {} syncToggle(); });

  // ---------- project settings (the switcher's Project settings, Ctrl K) ----------
  function projectSettings() {
    const p = PJ() && PJ().cur(); if (!p) return window.TribeOnboarding.open({ fromSettings: true });
    const host = (C.state().me || {}).role === 'host';
    const body = $('#invite-body'); $('#invite-modal').classList.remove('hidden');
    body.innerHTML = `<h2>${esc(p.name)} settings</h2>
      <div class="ps-row"><button class="pj-face-btn" id="ps-face" title="Change the picture">${PJ().face(p, 'lg')}</button><div class="faint" style="font-size:12.5px">Click the circle to use a picture. Otherwise it shows the emoji or initials on the project color.</div></div>
      ${host ? `<div class="field"><label for="ps-name">Name</label><input class="input" id="ps-name" maxlength="48" value="${esc(p.name)}"></div>
      <div class="field"><label for="ps-emoji">Emoji</label><input class="input" id="ps-emoji" maxlength="4" value="${esc(p.emoji || '')}" placeholder="🎮"></div>
      <div class="field"><label>Color</label><div class="swatches" id="ps-colors">${['#F26B1D', '#38C6B1', '#6C7CFF', '#FFB86B', '#9AE66E', '#E86A92'].map(c => `<button class="swatch ${c === p.color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>` : '<p class="lead">Only the host can rename the project.</p>'}
      <div class="modal-foot"><button class="btn" id="ps-app">App settings</button><span style="flex:1"></span><button class="btn" data-close>Close</button>${host ? '<button class="btn primary" id="ps-save">Save</button>' : ''}</div>`;
    let color = p.color;
    body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { color = b.dataset.c; body.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); });
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    $('#ps-app').onclick = () => { $('#invite-modal').classList.add('hidden'); window.TribeOnboarding.open({ fromSettings: true }); };
    $('#ps-face').onclick = () => { $('#invite-modal').classList.add('hidden'); PJ().pickImage(p); };
    const sv = $('#ps-save'); if (sv) sv.onclick = async () => { try { await C.api(`/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { name: $('#ps-name').value, emoji: $('#ps-emoji').value, color } }); $('#invite-modal').classList.add('hidden'); PJ().refresh(); toast('Saved'); } catch (e) { toast(e.message); } };
  }

  // Ctrl K: every destination, once (palette.js drops other modules' duplicate "Go to" rows).
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => DEST.filter(d => !d.when || d.when()).map(d => ({
    kind: d.kind || 'Go to', label: d.label, dest: d.key, keys: `${d.key} ${d.keys || ''} ${(GROUPS.find(g => g[0] === d.group) || [])[1] || ''}`, icon: d.icon,
    hint: d.key === 'capture' ? (window.TribeCapture && window.TribeCapture.on() ? 'on · Ctrl Shift N' : 'off · Ctrl Shift N') : d.hint || '',
    run: () => go(d.key) })));

  C.on('project', () => { closePreview(); recents(); });
  recents();
  window.TribeShell = { render, onShow, preview, closePreview, previewDoc, previewImage, previewApproval, switcher, openNew, recent, go, dests: () => DEST.map(d => ({ key: d.key, label: d.label, group: d.group || '', kind: d.kind || 'Go to', visible: !d.when || !!d.when() })), counts: () => counts, current };
})();
