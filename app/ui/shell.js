// The shell around every view (the mix of Discord and the Claude desktop app):
//   far-left circle rail (projects.js draws the circles) | the project's nest | main | right panel.
// The nest is communication and core only: Chat & Streams (with #general, #agents and DMs under it), Docs & Files,
// Tasks & Board and Agents Hub, then Settings and Invite friends. Tasks & Board and Agents Hub are tabbed workspaces:
// a tab bar (#view-tabs) at the top of main holds what used to be the Project Hub and Coordinate & Ops groups
// (Board · Bugs · Proposals · Milestones · Calendar · Repo · Visuals · Roles · Requests, and Agents · Your agents ·
// Ownership · Conflicts · Hand-offs · Reviews · Daily plan · Secretary). The last tab per workspace is remembered,
// deep links (#/tasks/bugs, #/agents/conflicts) work, breadcrumbs say View › Tab, Ctrl K lists every tab.
// Updates live in the bell (and the switcher's Timeline), the huddle in the chat header's call button (the nest
// shows it only while live), Capture to notes in the profile menu (the nest shows it only while on).
// With no project selected (the Global Hub, app/ui/hub.js) the four rows are the Global ones: Hub · Global docs ·
// All repos · Agent fleet, and the header is the tribe.
// One registry (DEST) drives the nest, the tabs, the breadcrumb menu and the Ctrl K palette.
// Also: the workspace switcher (tribe, project views, pinned projects, collaborative rooms, personal scratchpad, new
// project, paste an invite link), the + New menu (phones' orange action), the right panel's preview mode and the
// agent detail in the right panel (task, hand-offs, conflicts, reviews, recent timeline).
// Public: window.TribeShell = { render, onShow, preview, closePreview, switcher, go, dests, openNew, recent, previewAgent }.
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
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  // ---------- every destination, once ----------
  // group: core (the four rows) | tasks / agents (tabs of those workspaces) | global (rows with no project) | foot | none
  // tab: the short tab label; slug: the deep link (#/tasks/<slug>). when(): shown only while true (Roles, Requests).
  const coord = tab => { if (window.TribeCoord) window.TribeCoord.open(tab); if (document.body.dataset.view !== 'coord') App().show('coord'); };   // also from Your agents / Secretary, which app.js does not track
  const flowOn = () => !!(window.TribeFlow && window.TribeFlow.state && window.TribeFlow.state());
  let counts = {};   // badges: bugs, requests, reviews, handoffs
  let lastDest = '';
  const DEST = [
    { key: 'chat', label: 'Chat & Streams', icon: 'i-chat', group: 'core', keys: 'messages general talk channels streams dm', run: () => { if (window.TribeDM && window.TribeDM.current && window.TribeDM.current() !== 'general' && window.TribeDM.back) window.TribeDM.back(); App().show('chat'); } },
    { key: 'docs', label: 'Docs & Files', icon: 'i-doc', group: 'core', keys: 'documents notes files pages', run: () => App().show('docs') },
    { key: 'ws-tasks', label: 'Tasks & Board', icon: 'i-check', group: 'core', keys: 'tasks board workspace kanban bugs proposals', run: () => openWs('tasks') },
    { key: 'ws-agents', label: 'Agents Hub', icon: 'i-robot', group: 'core', keys: 'agents coordinate ops claude workspace', run: () => openWs('agents') },
    { key: 'tasks', label: 'Task board', tab: 'Board', slug: 'board', icon: 'i-check', group: 'tasks', keys: 'tasks todo kanban', run: () => App().show('tasks') },
    { key: 'bugs', label: 'Bugs', tab: 'Bugs', slug: 'bugs', icon: 'i-bug', group: 'tasks', keys: 'bug inbox issues', run: () => App().show('bugs') },
    { key: 'board', label: 'Proposals & board', tab: 'Proposals', slug: 'proposals', icon: 'i-vote', group: 'tasks', keys: 'approval board vote vision', run: () => App().show('board') },
    { key: 'milestones', label: 'Milestones', tab: 'Milestones', slug: 'milestones', icon: 'i-flag', group: 'tasks', keys: 'roadmap goals', run: () => { App().show('board'); setTimeout(() => { const m = $('#ms-list'); m && m.closest('.card').scrollIntoView({ block: 'center' }); }, 120); } },
    { key: 'calendar', label: 'Calendar', tab: 'Calendar', slug: 'calendar', icon: 'i-calendar', group: 'tasks', keys: 'schedule week month events', run: () => App().show('calendar') },
    { key: 'repo', label: 'Repo', tab: 'Repo', slug: 'repo', icon: 'i-git', group: 'tasks', keys: 'git branches code github', run: () => App().show('repo') },
    { key: 'visuals', label: 'Visuals & screenshots', tab: 'Visuals', slug: 'visuals', icon: 'i-photo', group: 'tasks', keys: 'screenshots compare diff images', run: () => App().show('visuals') },
    { key: 'roles', label: 'Roles', tab: 'Roles', slug: 'roles', icon: 'i-users', group: 'tasks', keys: 'people roles folders', when: flowOn, run: () => window.TribeFlow && window.TribeFlow.openRoles() },
    { key: 'requests', label: 'Requests', tab: 'Requests', slug: 'requests', icon: 'i-inbox', group: 'tasks', keys: 'approvals change requests waiting', when: () => !!counts.requests || (App() && App().view() === 'requests'), run: () => App().show('requests') },
    { key: 'agents', label: 'Agents', tab: 'Agents', slug: 'agents', icon: 'i-robot', group: 'agents', keys: 'coordinate claude agents panel', run: () => coord('agents') },
    { key: 'agents-hub', label: 'Your agents', tab: 'Your agents', slug: 'yours', icon: 'i-plug', group: 'agents', keys: 'claude desktop mcp local models hub connect', run: () => window.TribeAgentsHub && window.TribeAgentsHub.open() },
    { key: 'ownership', label: 'Ownership map', tab: 'Ownership', slug: 'ownership', icon: 'i-map', group: 'agents', keys: 'claims files owners', run: () => coord('ownership') },
    { key: 'conflicts', label: 'Conflict radar', tab: 'Conflicts', slug: 'conflicts', icon: 'i-merge', group: 'agents', keys: 'merge overlap branches', run: () => coord('conflicts') },
    { key: 'handoffs', label: 'Hand-offs', tab: 'Hand-offs', slug: 'handoffs', icon: 'i-hand', group: 'agents', keys: 'handoff park take', run: () => coord('handoffs') },
    { key: 'reviews', label: 'Reviews', tab: 'Reviews', slug: 'reviews', icon: 'i-eye', group: 'agents', keys: 'review approve', run: () => coord('reviews') },
    { key: 'plan', label: 'Daily plan', tab: 'Daily plan', slug: 'plan', icon: 'i-sun', group: 'agents', keys: 'today standup plan', run: () => coord('plan') },
    { key: 'secretary', label: 'Secretary', tab: 'Secretary', slug: 'secretary', icon: 'i-quill', group: 'agents', keys: 'journal digest inspirations background', run: () => window.TribeSecretary && window.TribeSecretary.open() },
    { key: 'hub', label: 'Home', icon: 'i-home', group: 'global', row: 'Home', keys: 'hub dashboard stream feed overview all projects start', run: () => hubOpen('home') },
    { key: 'docs-all', label: 'Global docs', icon: 'i-doc', group: 'global', keys: 'documents across projects search every', run: () => hubOpen('docs') },
    { key: 'repos-all', label: 'All repos', icon: 'i-git', group: 'global', keys: 'repositories every project code branches status', run: () => hubOpen('repos') },
    { key: 'fleet', label: 'Agent fleet', icon: 'i-robot', group: 'global', keys: 'agents models claude secretary all fleet', run: () => window.TribeAgentsHub && window.TribeAgentsHub.open() },
    { key: 'updates', label: 'Updates', icon: 'i-bell', keys: 'inbox notifications plan feed timeline', run: () => openUpdates() },
    { key: 'huddle', label: 'Huddle', icon: 'i-mic', kind: 'Action', keys: 'voice call talk mic audio join start', hint: 'Ctrl Shift M', run: () => { const H = window.TribeHuddle; if (H && !H.inCall()) H.join(); } },
    { key: 'capture', label: 'Capture to notes', icon: 'i-doc', kind: 'Action', keys: 'voice speech transcribe dictate record notes toggle', hint: 'Ctrl Shift N', run: () => window.TribeCapture && window.TribeCapture.toggle() },
    { key: 'settings', label: 'Settings', icon: 'i-gear', group: 'foot', kind: 'Action', keys: 'preferences profile name color folder brain', run: () => window.TribeSettings && window.TribeSettings.open() },
    { key: 'invite', label: 'Invite friends', icon: 'i-users', group: 'foot', kind: 'Action', keys: 'link join share qr', run: () => App().openInvite() },
    { key: 'scratch', label: 'Scratchpad', icon: 'i-quill', kind: 'Action', keys: 'notes jot snippet quick personal scratch', run: () => openScratch() },
    { key: 'panel', label: 'Toggle right panel', icon: 'i-list', kind: 'Action', keys: 'right panel in the room sidebar show hide preview', run: () => setPanel(!document.body.classList.contains('panel-off')) },
    { key: 'context', label: 'Tribe context', icon: 'i-doc', kind: 'Action', keys: 'context tribe_context brief drawer', hint: 'Ctrl Shift K', run: () => { const b = $('#ctx-btn'); if (b) b.click(); } },
    { key: 'home', label: 'Project home', icon: 'i-home', keys: 'home overview', run: () => App().show('home') },
    { key: 'project-settings', label: 'Project settings', icon: 'i-gear', kind: 'Action', keys: 'rename emoji color picture project', run: () => projectSettings() },
  ];
  const byKey = k => DEST.find(d => d.key === k);
  const WS = { tasks: { label: 'Tasks & Board', row: 'ws-tasks' }, agents: { label: 'Agents Hub', row: 'ws-agents' } };
  const tabsOf = w => DEST.filter(d => d.group === w && (!d.when || d.when()));
  const wsOf = key => { const d = byKey(key); return d && WS[d.group] ? d.group : null; };
  const TKEY = w => `tribecode.tab.${w}`;
  // A workspace opens on its last tab (if it is still there).
  function openWs(w) {
    const last = lsGet(TKEY(w)), list = tabsOf(w);
    const d = list.find(x => x.key === last) || list[0];
    if (d) { lastDest = d.key; d.run(); }
  }
  // No project selected: the Global Hub is on screen (its sub-pages too).
  const isGlobal = () => document.body.dataset.view === 'hub';
  const hubOpen = m => { if (window.TribeHub) window.TribeHub.open(m); };
  function openScratch() {
    if (isPhone() || !C.connected()) { hubOpen('home'); setTimeout(() => { const t = $('#hub-scratch .sc-in') || $('#scratch-in'); if (t) t.focus(); }, 150); return; }
    setPanel(false); closePreview();
    setTimeout(() => { const t = $('#scratch-in'); if (t) { t.focus(); t.scrollIntoView({ block: 'nearest' }); } }, 60);
  }
  const COUNT = { bugs: 1, requests: 1, reviews: 1, handoffs: 1 };
  const HOT = { requests: 1, reviews: 1, handoffs: 1 };
  function go(key) {
    const d = byKey(key); if (!d) return;
    lastDest = key; closePop(); closeDrawer();
    d.run(); setTimeout(markActive, 0);
  }

  // ---------- the rows: Global ones with no project (in #nest-groups); the project's four are in index.html ----------
  let drawnGlobal = null;
  function drawGroups() {
    const box = $('#nest-groups'); if (!box) return;
    drawnGlobal = isGlobal();
    document.body.classList.toggle('global', drawnGlobal);   // keep the class in step whichever path drew the rows
    box.innerHTML = drawnGlobal ? `<div class="nest-group nest-global" id="grp-global" role="group" aria-label="Global">${DEST.filter(d => d.group === 'global').map(d =>
      `<button class="nest-row" data-pnav="${esc(d.key)}" id="nest-${esc(d.key)}">${ico(d.icon, 18)}<span>${esc(d.row || d.label)}</span></button>`).join('')}</div>` : '';
  }
  function paintCounts() {
    const v = (counts.reviews || 0) + (counts.handoffs || 0), el = $('#nn-agents');
    if (el) { el.textContent = v ? (v > 99 ? '99+' : v) : ''; el.classList.toggle('hot', !!v); }
    drawTabs();
  }

  // ---------- which destination is on screen ----------
  function current() {
    const v = document.body.dataset.view || '';
    if (v === 'hub') { const m = window.TribeHub ? window.TribeHub.mode() : 'home'; return m === 'repos' ? 'repos-all' : m === 'docs' ? 'docs-all' : 'hub'; }
    if (v === 'coord') return (window.TribeCoord && window.TribeCoord.tab()) || 'agents';
    if (v === 'flow-roles') return 'roles';
    if (v === 'flow-updates' || v === 'updates') return 'updates';
    if (v === 'board') return lastDest === 'milestones' ? 'milestones' : 'board';
    return v;
  }
  function markActive() {
    if (drawnGlobal !== isGlobal() || document.body.classList.contains('global') !== isGlobal()) { drawGroups(); globalHead(); }
    const cur = document.body.classList.contains('ws-open') ? '' : current(), w = wsOf(cur);
    const lit = w ? WS[w].row : cur;   // inside a workspace its row is the lit one
    document.querySelectorAll('.side [data-pnav], #tabbar [data-pnav]').forEach(b => { const on = b.dataset.pnav === lit; if (b.classList.contains('on') !== on) b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    drawTabs(cur);
  }
  // ---------- the tab bar of a workspace (Tasks & Board, Agents Hub) ----------
  let tabsSig = '';
  function drawTabs(cur) {
    if (cur === undefined) cur = document.body.classList.contains('ws-open') ? '' : current();
    const bar = $('#view-tabs'); if (!bar) return;
    const w = wsOf(cur);
    document.body.classList.toggle('ws-tabbed', !!w);
    if (!w) {
      if (!bar.classList.contains('hidden')) bar.classList.add('hidden');
      if (/^#\/(tasks|agents)\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    lsSet(TKEY(w), cur);
    const list = tabsOf(w), d = byKey(cur);
    const sig = w + '|' + cur + '|' + list.map(t => t.key + (counts[t.key] || 0)).join(',');
    if (sig !== tabsSig) {
      tabsSig = sig;
      bar.innerHTML = `<span class="eyebrow wt-eye">${esc(WS[w].label)}</span><div class="wt-row" role="tablist" aria-label="${esc(WS[w].label)}">${list.map(t => { const n = COUNT[t.key] && counts[t.key] ? counts[t.key] : 0;
        return `<button role="tab" class="wt ${t.key === cur ? 'on' : ''}" id="wt-${esc(t.key)}" data-tab="${esc(t.key)}" aria-selected="${t.key === cur}" tabindex="${t.key === cur ? 0 : -1}">${esc(t.tab)}${n ? `<span class="n ${HOT[t.key] ? 'hot' : ''}">${n > 99 ? '99+' : n}</span>` : ''}</button>`; }).join('')}</div>`;
    }
    bar.classList.remove('hidden');
    const onTab = bar.querySelector('.wt.on'), row = bar.querySelector('.wt-row');
    if (onTab && row && (onTab.offsetLeft < row.scrollLeft || onTab.offsetLeft + onTab.offsetWidth > row.scrollLeft + row.clientWidth)) row.scrollLeft = onTab.offsetLeft - 12;   // the current tab stays in view
    const want = `#/${w}/${d.slug}`;
    if (location.hash !== want && !/^#\/(agents-hub|secretary)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + want);
    const crumb = $('#crumb-label'), text = `${WS[w].label} › ${d.tab}`;
    if (crumb && crumb.textContent !== text) crumb.textContent = text;
  }
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('#view-tabs [data-tab]'); if (t) { e.preventDefault(); go(t.dataset.tab); } });
  document.addEventListener('keydown', e => {   // arrow keys move along the tabs
    const t = e.target.closest && e.target.closest('#view-tabs [data-tab]'); if (!t || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const all = [...document.querySelectorAll('#view-tabs [data-tab]')], i = all.indexOf(t);
    const n = e.key === 'Home' ? all[0] : e.key === 'End' ? all[all.length - 1] : all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
    if (n) { e.preventDefault(); go(n.dataset.tab); setTimeout(() => { const f = document.getElementById('wt-' + n.dataset.tab); if (f) f.focus(); }, 30); }
  });
  // The Tasks & Board row also carries data-nav="tasks" (the Board); with another tab remembered it opens that one instead.
  addEventListener('click', e => {
    const r = e.target.closest && e.target.closest('#nest-ws-tasks'); if (!r) return;
    const last = lsGet(TKEY('tasks')); if (!last || last === 'tasks' || !tabsOf('tasks').some(t => t.key === last)) return;
    e.preventDefault(); e.stopImmediatePropagation(); go('ws-tasks');
  }, true);
  // Deep links: #/tasks/bugs, #/agents/conflicts.
  function fromHash() {
    const m = /^#\/(tasks|agents)\/([a-z-]+)$/.exec(location.hash); if (!m) return;
    const d = DEST.find(x => x.group === m[1] && x.slug === m[2]);
    if (d && current() !== d.key) go(d.key);
  }
  addEventListener('hashchange', fromHash);
  C.on('hello', () => setTimeout(fromHash, 60));
  new MutationObserver(() => markActive()).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  setTimeout(() => {
    fromHash();
    const cl = $('#crumb-label'); if (cl) new MutationObserver(() => markActive()).observe(cl, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => markActive()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }, 0);

  // ---------- Chat & Streams: #general, #agents and direct messages under the Chat row ----------
  const SKEY = 'tribecode.nav.streams';
  function drawStreams() {
    const box = $('#nest-streams'), tg = $('#streams-toggle'); if (!box || !tg) return;
    const open = lsGet(SKEY) === '1', me = (C.state().me || {}).id;
    tg.setAttribute('aria-expanded', String(open)); tg.setAttribute('aria-label', open ? 'Hide channels' : 'Show channels'); box.classList.toggle('open', open);
    if (!open) { box.innerHTML = ''; return; }
    const ms = (C.state().members || []).filter(m => m.id !== me && (m.role !== 'agent' || m.owner === me)).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name)).slice(0, 8);
    const dmCur = window.TribeDM && window.TribeDM.current ? window.TribeDM.current() : 'general', inChat = document.body.dataset.view === 'chat';
    const isDm = id => dmCur !== 'general' && String(dmCur).includes(id);
    box.innerHTML = `<button class="nest-row small ${inChat && dmCur === 'general' ? 'on' : ''}" data-stream="general"><span class="hash">#</span><span>general</span></button>
      <button class="nest-row small" data-stream="agents"><span class="hash">#</span><span>agents</span></button>
      ${ms.map(m => `<button class="nest-row small ${inChat && isDm(m.id) ? 'on' : ''}" data-stream="dm:${esc(m.id)}"><span class="dm-dot ${m.online ? 'on' : ''}" style="--mc:${esc(m.role === 'agent' ? '#38C6B1' : m.color)}"></span><span>${esc(m.role === 'agent' ? 'My Claude' : m.name)}</span></button>`).join('')}`;
  }
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    if (e.target.closest('#streams-toggle')) { lsSet(SKEY, lsGet(SKEY) === '1' ? '0' : '1'); return drawStreams(); }
    const st = e.target.closest('[data-stream]'); if (!st) return;
    const k = st.dataset.stream; closeDrawer();
    if (k === 'general') return go('chat');
    if (k === 'agents') { coord('agents'); setTimeout(() => { const t = $('#talk-input'); if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); } }, 400); return; }
    if (k.startsWith('dm:') && window.TribeDM) window.TribeDM.open(k.slice(3));
  });
  C.on('presence', () => { if (lsGet(SKEY) === '1') drawStreams(); }); C.on('hello', drawStreams);
  new MutationObserver(() => drawStreams()).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

  // ---------- a small popover we own (flat, 1px border, no shadow) ----------
  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; document.querySelectorAll('#crumb-section, #pj-switch, #nest-switch, #ws-name, [data-nav-menu]').forEach(b => b.setAttribute('aria-expanded', 'false')); } }
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
  document.addEventListener('mousedown', e => { if (popEl && !popEl.contains(e.target) && !e.target.closest('#nest-switch, #ws-name, #crumb-section, #pj-switch, [data-nav-menu]')) closePop(); });
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

  // ---------- breadcrumbs: the section menu mirrors the nest (the four rows, then each workspace's tabs) ----------
  function menuRows(list) {
    const cur = current();
    return list.filter(d => !d.when || d.when()).map(d => `<button data-dest="${esc(d.key)}" class="${d.key === cur ? 'on' : ''}">${ico(d.icon)}<span>${esc(d.label)}</span>${COUNT[d.key] && counts[d.key] ? `<span class="n ${HOT[d.key] ? 'hot' : ''}">${counts[d.key]}</span>` : ''}</button>`).join('');
  }
  function sectionMenu(anchor) {
    const core = DEST.filter(d => d.group === (isGlobal() ? 'global' : 'core'));
    const html = `<div class="sh-menu">${menuRows(core)}${isGlobal() ? '' : Object.entries(WS).map(([g, w]) => `<h6>${esc(w.label)}</h6>${menuRows(DEST.filter(d => d.group === g))}`).join('')}</div>`;
    const el = pop(anchor, html, { id: 'section-menu', side: 'below' });
    el.querySelectorAll('[data-dest]').forEach(b => b.onclick = () => go(b.dataset.dest));
  }
  // ---------- workspace switcher: tribe · pinned · collaborative rooms · personal · new / join ----------
  // Pins persist per member on the server (/api/hub/prefs), with a localStorage copy for offline and first paint.
  const PINKEY = () => `tribecode.pins:${C.base()}`;
  let pins = (() => { try { return JSON.parse(localStorage.getItem(PINKEY()) || '[]'); } catch { return []; } })();
  const setPinsLocal = list => { pins = list; try { localStorage.setItem(PINKEY(), JSON.stringify(list)); } catch {} };
  async function loadPins() { if (!C.connected()) return; try { const r = await C.api('/hub/prefs'); setPinsLocal(r.pins || []); } catch {} }
  async function togglePin(pidv) {
    const next = pins.includes(pidv) ? pins.filter(x => x !== pidv) : [...pins, pidv];
    setPinsLocal(next);
    try { const r = await C.api('/hub/prefs', { method: 'PUT', body: { pins: next } }); setPinsLocal(r.pins || []); } catch (e) { toast(e.message); }
  }
  C.on('hello', loadPins);
  function switcher(anchor) {
    const list = PJ() ? PJ().list() : [], cur = isGlobal() ? null : PJ() && PJ().current(), F = PJ().face;
    const meId = (C.state().me || {}).id, scoped = Array.isArray((C.state().me || {}).projects), on = C.connected();
    const tribe = (C.state().tribe || {}).name || ($('#ws-name') && $('#ws-name').textContent) || 'My Tribe';
    const humans = p => (p.members || []).filter(m => m.role !== 'agent').length;
    const collab = p => humans(p) > 1 || PJ().here(p.id).some(m => m.id !== meId);
    const row = p => { const k = p.counts || {}, h = PJ().here(p.id).length, pinned = pins.includes(p.id);
      return `<div class="sw-row"><button data-pj-open="${esc(p.id)}" class="${p.id === cur ? 'on' : ''}">${F(p, 'sm')}<span>${esc(p.name)}<small>${h ? `${h} here` : ''}${k.tasks ? `${h ? ' · ' : ''}${k.tasks} open` : ''}</small></span>${p.id === cur ? ico('i-tick', 14) : ''}</button>
        <button class="sw-pin ${pinned ? 'on' : ''}" data-pin="${esc(p.id)}" title="${pinned ? 'Unpin' : 'Pin to the top'}" aria-label="${pinned ? 'Unpin' : 'Pin'} ${esc(p.name)}" aria-pressed="${pinned}"><svg class="i" viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg></button></div>`; };
    const pinnedL = list.filter(p => pins.includes(p.id)), rest = list.filter(p => !pins.includes(p.id));
    const rooms = rest.filter(collab), personal = rest.filter(p => !collab(p));
    const groupH = (label, items) => items.length ? `<h6>${esc(label)}</h6>${items.map(row).join('')}` : '';
    const el = pop(anchor, `<div class="sh-menu sh-projects sh-switch">
        <h6>Tribe</h6><button data-sw="hub" class="${isGlobal() ? 'on' : ''}"><span class="pj-face sm tribe-face">${esc(tribe.charAt(0).toUpperCase())}</span><span>${esc(tribe)}<small>${on ? 'Home · every project' : 'Not connected yet'}</small></span>${isGlobal() ? ico('i-tick', 14) : ''}</button>
        ${cur ? `<h6>${esc((list.find(p => p.id === cur) || {}).name || 'Project')}</h6><div class="sw-views">${[['home', 'Overview', 'i-home'], ['tasks', 'Board', 'i-check'], ['repo', 'Repo', 'i-git'], ['updates', 'Timeline', 'i-bell']].map(([k, l, i]) => `<button data-dest="${k}" class="sw-view">${ico(i, 15)}<span>${l}</span></button>`).join('')}</div>` : ''}
        ${groupH('Pinned', pinnedL)}${groupH('Collaborative rooms', rooms)}${groupH(rooms.length || pinnedL.length ? 'Personal' : 'Projects', personal)}
        <button data-sw="scratch" class="sw-scratch"><span class="sw-ico">${ico('i-quill')}</span><span>Personal scratchpad<small>Notes only you see</small></span></button>
        <hr>${scoped || !on ? '' : `<button data-pj-new>${ico('i-plus')}<span>New project</span></button>`}<button data-sw="join">${ico('i-link')}<span>Paste invite link</span></button>${cur ? `<button data-dest="project-settings">${ico('i-gear')}<span>Project settings</span></button>` : ''}</div>`,
      { id: 'project-menu', side: anchor.id === 'nest-switch' ? 'right' : 'below', cls: 'sh-wide' });
    el.querySelectorAll('[data-dest]').forEach(b => b.onclick = () => go(b.dataset.dest));
    el.querySelectorAll('.sw-row [data-pj-open]').forEach(b => b.onclick = () => { const id = b.dataset.pjOpen; closePop(); closeDrawer(); if (id === (PJ() && PJ().current())) App().show('home'); else PJ().switchTo(id, 'home'); });
    el.querySelectorAll('[data-pin]').forEach(b => b.onclick = async e => { e.stopPropagation(); await togglePin(b.dataset.pin); switcher(anchor); });
    el.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { const k = b.dataset.sw; closePop(); closeDrawer();
      if (k === 'hub') hubOpen('home'); else if (k === 'scratch') openScratch(); else if (k === 'join') window.TribeSettings && window.TribeSettings.joinPrompt(); });
    return el;
  }
  $('#crumb-section').addEventListener('click', e => { e.stopPropagation(); popEl && popEl.id === 'section-menu' ? closePop() : sectionMenu(e.currentTarget); });
  $('#ws-name').addEventListener('click', e => { e.stopPropagation(); if (popEl && popEl.id === 'project-menu') return closePop(); switcher(e.currentTarget); });
  $('#nest-switch').addEventListener('click', e => { e.stopPropagation(); if (popEl && popEl.id === 'project-menu') return closePop(); switcher(e.currentTarget); });

  // ---------- nest ----------
  let lastP = null, lastH = null;
  function render(p, h) {
    if (h) lastH = h;
    if (!p) { lastP = null; globalHead(); return; }
    lastP = p;
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
    globalHead();
  }
  // The nest header and the core rows with no project selected: the tribe is the header, the rows dim and say
  // where they open, and one row goes straight into the current project.
  function globalHead() {
    const g = isGlobal(), p = lastP, h = lastH, on = C.connected();
    document.body.classList.toggle('global', g);
    const title = $('#nest-title'); if (!title) return;
    const tribe = (C.state().tribe || {}).name || ($('#ws-name') && $('#ws-name').textContent) || 'My Tribe';
    if (g) {
      // Home is yours, apart from any tribe: your face and name, not the tribe's.
      const me = C.state().me || {}; let nm = me.name; try { nm = nm || (JSON.parse(localStorage.getItem('tribecode.settings.v1') || '{}').name); } catch {}
      nm = nm || 'You';
      title.dataset.nav = 'hub'; title.title = 'Your home';
      $('#nest-face').innerHTML = `<span class="pj-face sm tribe-face" style="background:${esc(me.color || 'var(--accent)')}">${esc(nm.trim().charAt(0).toUpperCase())}</span>`;
      $('#nest-name').textContent = 'Home';
      $('#nest-sub').textContent = on ? `${nm} · ${tribe}` : `${nm} · not in a tribe yet`;
    } else {
      title.dataset.nav = 'home'; title.title = 'Project home';
      if (p) { $('#nest-face').innerHTML = h ? h.face(p, 'sm') : ''; $('#nest-name').textContent = p.name; }
    }
    let enter = $('#nest-enter');
    if (!enter) { enter = document.createElement('div'); enter.id = 'nest-enter'; enter.className = 'nest-enter'; const nav = $('#pj-nav'); nav.insertBefore(enter, nav.firstChild); }
    enter.innerHTML = g ? (on && p ? `<div class="nest-pick">Pick a project</div><button class="nest-row nest-open" id="nest-open" data-nav="home" title="Open ${esc(p.name)}">${h ? h.face(p, 'xs') : ''}<span>Open ${esc(p.name)}</span>${ico('i-chev', 14)}</button>`
      : `<div class="nest-pick">${on ? 'No project yet' : 'Not in a tribe yet'}</div>`) : '';
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
    document.body.classList.toggle('huddle-live', !!names.length);   // the chat header's call button shows a Teal dot
    const row = $('#nest-huddle-row'); if (row) row.title = window.TribeHuddle && window.TribeHuddle.inCall() ? 'You are in the huddle' : names.length ? 'Join the huddle (Ctrl Shift M)' : 'Start a huddle (Ctrl Shift M)';
    sub.textContent = !names.length ? '' : names.length === 1 ? `${names[0]} is talking` : names.length === 2 ? `${names[0]} and ${names[1]} talking` : `${names[0]}, ${names[1]} and ${names.length - 2} more talking`;
  }
  C.on('huddle', () => setTimeout(huddleLine, 0)); C.on('presence', huddleLine);
  // capture.js puts its box after #huddle-box (inside the huddle block); keep it beside it, since the huddle hides when not live.
  const moveCapture = () => { const cb = $('#capture-box'), hb = $('#nest-huddle'); if (cb && hb && hb.contains(cb)) hb.after(cb); };
  setTimeout(() => { const hb = $('#nest-huddle'); if (hb) new MutationObserver(moveCapture).observe(hb, { childList: true, subtree: true }); moveCapture(); }, 0);
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
    if (document.body.classList.contains('panel-off')) { document.body.classList.remove('panel-off'); syncToggle(); }
    room.classList.add('previewing');
    $('#preview-kind').textContent = kind;
    $('#preview-title').textContent = title;
    const body = $('#preview-body'); body.innerHTML = html; if (node) body.appendChild(node);
    const act = $('#preview-actions'); act.innerHTML = actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''}" data-pa="${i}">${esc(a.label)}</button>`).join('');
    act.querySelectorAll('[data-pa]').forEach(b => b.onclick = () => actions[+b.dataset.pa].run());
    if (isPhone()) document.body.classList.add('phone-preview');
  }
  function closePreview() { delete room.dataset.agent; room.classList.remove('previewing'); document.body.classList.remove('phone-preview'); $('#preview-body').innerHTML = ''; }
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
  // ---------- right panel: an agent's detail, next to chat (click an agent under "In the room") ----------
  // Its task, files, tokens and pause/stop state, the hand-offs to or from it, the conflict radar rows on its branch,
  // its review queue, and the latest of its timeline (people.js shows the full one).
  const agoS = at => { const s = (Date.now() - Date.parse(at)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`; };
  async function previewAgent(id) {
    const m0 = (C.state().members || []).find(x => x.id === id) || { name: 'Agent' };
    preview({ kind: 'Agent', title: m0.name, html: '<div class="ad"><div class="pp-skel"></div></div>' });
    $('#tour-room').dataset.agent = id;
    const get = path => C.api(path).catch(() => null);
    const [ag, ho, cf, rv, pp] = await Promise.all([get('/coord/agents'), get('/coord/handoffs'), get('/coord/conflicts'), get('/coord/reviews'), get(`/people/${encodeURIComponent(id)}?kind=all&limit=6`)]);
    if ($('#tour-room').dataset.agent !== id || !$('#tour-room').classList.contains('previewing')) return;
    const a = ((ag && ag.agents) || []).find(x => x.id === id) || { name: m0.name, online: !!m0.online };
    const mine = h => h.from === id || h.to === id || h.takenBy === id;
    const hos = ((ho && ho.handoffs) || []).filter(mine).slice(0, 5);
    const branch = a.branch || '';
    const cfs = ((cf && cf.pairs) || []).filter(p => p.a.owner === id || p.b.owner === id || (branch && (p.a.branch === branch || p.b.branch === branch))).slice(0, 5);
    const rvs = ((rv && rv.reviews) || []).filter(r => r.by === id).slice(0, 5);
    const items = ((pp && pp.timeline && pp.timeline.items) || []).slice(0, 6);
    const sec = (eyebrow, inner, empty) => `<section class="ad-sec"><span class="eyebrow">${esc(eyebrow)}</span>${inner || `<p class="ad-none">${esc(empty)}</p>`}</section>`;
    const pct = a.tokens && a.budget ? Math.min(100, Math.round(a.tokens / a.budget * 100)) : null;
    const ctx = pp && pp.context && Number.isFinite(pp.context.usedPct) ? pp.context.usedPct : null;
    const html = `<div class="ad">
      <div class="ad-head"><span class="ad-dot ${a.online ? 'on' : ''}"></span><div><b>${esc(a.name)}</b><small>${a.online ? `active · ${esc(a.where || 'working')}` : a.lastActive ? `idle · last seen ${esc(agoS(a.lastActive))} ago` : 'not connected yet'}${a.ownerName ? ` · ${a.yours ? 'yours' : esc(a.ownerName) + "'s"}` : ''}</small></div></div>
      ${a.control ? `<div class="ad-ctl">${esc(a.control.action === 'stop' ? 'Stop' : 'Pause')} requested by ${esc(a.control.by)}${a.control.note ? `: ${esc(a.control.note)}` : ''}</div>` : ''}
      ${sec('Now', `<div class="ad-now"><b>${a.task ? esc(a.task.title) : 'No task'}</b>${a.task ? `<small>${esc(a.task.status)}${branch ? ` · <code>${esc(branch)}</code>` : ''}</small>` : ''}
        ${ctx !== null ? `<div class="ad-meter" title="Context window used: ${ctx}%"><span>Context</span><i><em style="width:${ctx}%"></em></i><span>${ctx}%</span></div>` : ''}
        ${pct !== null ? `<div class="ad-meter" title="${a.tokens} of ${a.budget} tokens"><span>Tokens</span><i><em style="width:${pct}%"></em></i><span>${pct}%</span></div>` : ''}
        ${(a.files || []).length ? `<div class="ad-files">${a.files.slice(0, 4).map(f => `<code>${esc(f)}</code>`).join('')}</div>` : ''}</div>`)}
      ${sec('Hand-offs', hos.length ? `<ul class="ad-list">${hos.map(h => `<li><b>${esc(h.title)}</b><small>${esc(h.fromName)} → ${esc(h.toName)} · ${esc(h.status || 'open')} · ${esc(agoS(h.created || h.at))}</small></li>`).join('')}</ul>` : '', 'Nothing handed to or from it.')}
      ${sec('Conflict radar', cfs.length ? `<ul class="ad-list">${cfs.map(p => `<li><b>${esc(p.count)} shared file${p.count === 1 ? '' : 's'} with ${esc((p.a.owner === id || p.a.branch === branch ? p.b : p.a).ownerName || 'another branch')}</b><small><code>${esc(p.files[0] || '')}</code>${p.count > 1 ? ` and ${p.count - 1} more` : ''}</small></li>`).join('')}</ul>` : '', cf && cf.enabled === false ? 'The radar needs a git repo.' : 'No overlap with other branches.')}
      ${sec('Review queue', rvs.length ? `<ul class="ad-list">${rvs.map(r => `<li><b>${esc(r.title || r.branch)}</b><small>${esc(r.status)}${(r.askedOf || []).length ? ` · asked ${esc(r.askedOf.join(', '))}` : ''}</small></li>`).join('')}</ul>` : '', 'Nothing waiting for review.')}
      ${sec('Timeline', items.length ? `<ul class="ad-list ad-tl">${items.map(t => `<li class="k-${esc(t.kind)}"><b>${esc(t.text || t.title || '')}</b><small>${esc(t.kind)} · ${esc(agoS(t.at))}</small></li>`).join('')}</ul>` : '', 'Nothing yet.')}
    </div>`;
    const steer = a.yours || (C.state().me || {}).role === 'host', paused = a.control && a.control.action !== 'resume';
    const acts = [
      { label: 'Full timeline', primary: true, run: () => { closePreview(); window.TribePeople && window.TribePeople.open(id); } },
      { label: 'Agents Hub', run: () => { closePreview(); go('agents'); } },
      ...(steer && a.online ? [{ label: paused ? 'Resume' : 'Pause', run: async () => { try { await C.api(`/coord/agents/${encodeURIComponent(id)}/control`, { method: 'POST', body: { action: paused ? 'resume' : 'pause' } }); previewAgent(id); } catch (e) { toast(e.message); } } }] : []),
    ];
    // the buttons sit under the detail, so the panel header keeps the name readable
    const btns = `<div class="ad-acts">${acts.map((x, i) => `<button class="btn ${x.primary ? 'primary' : ''}" data-ad="${i}">${esc(x.label)}</button>`).join('')}</div>`;
    preview({ kind: 'Agent', title: a.name, html: html + btns });
    document.querySelectorAll('#preview-body [data-ad]').forEach(btn => btn.onclick = () => acts[+btn.dataset.ad].run());
    $('#tour-room').dataset.agent = id;
  }
  // Agents under "In the room" open here (capture: before the agents panel's own row handler).
  addEventListener('click', e => {
    const r = e.target.closest && e.target.closest('#room-agents [data-agent]'); if (!r) return;
    e.preventDefault(); e.stopImmediatePropagation(); previewAgent(r.dataset.agent);
  }, true);
  // Anything can ask for a preview declaratively.
  document.addEventListener('click', e => {
    const im = e.target.closest && e.target.closest('[data-preview-img]'); if (im) { e.preventDefault(); return previewImage(im.dataset.previewImg, im.dataset.previewTitle || 'Image', im.dataset.previewKind || 'Screenshot'); }
    const d = e.target.closest && e.target.closest('[data-preview-doc]'); if (d) { e.preventDefault(); return previewDoc(d.dataset.previewDoc); }
  });
  // Pinned docs open as a preview first (docsx.js binds them to the editor; the preview has "Open").
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#side-pins-list [data-pin-open]'); if (b) { e.stopImmediatePropagation(); e.preventDefault(); document.body.classList.remove('drawer-open'); previewDoc(b.dataset.pinOpen); } }, true);

  // Hide / show: an X in the panel's own corner hides it; a slim tab at the main column's right edge (#panel-toggle,
  // only while hidden) brings it back. Remembered per browser (body.panel-off), also in Ctrl K ("Toggle right panel").
  const PKEY = 'tribecode.panelOff';
  function syncToggle() { const t = $('#panel-toggle'), on = !document.body.classList.contains('panel-off'); if (t) { t.setAttribute('aria-pressed', String(on)); t.tabIndex = on ? -1 : 0; } }
  function setPanel(off) {
    document.body.classList.toggle('panel-off', off); if (off) closePreview();
    try { localStorage.setItem(PKEY, off ? '1' : '0'); } catch {}
    syncToggle();
    if (off) { const t = $('#panel-toggle'); if (t && document.activeElement && document.activeElement.closest && document.activeElement.closest('#tour-room')) t.focus(); }
    else { const x = $('#panel-close'); if (x && document.activeElement === $('#panel-toggle')) x.focus(); }
  }
  try { if (localStorage.getItem(PKEY) === '1') document.body.classList.add('panel-off'); } catch {}
  syncToggle();
  $('#panel-toggle').addEventListener('click', () => setPanel(!document.body.classList.contains('panel-off')));
  $('#panel-close').addEventListener('click', () => setPanel(true));

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
    kind: d.kind || 'Go to', label: d.label, dest: d.key, keys: `${d.key} ${d.keys || ''} ${(WS[d.group] || {}).label || ''} ${d.tab || ''}`, icon: d.icon,
    hint: d.key === 'capture' ? (window.TribeCapture && window.TribeCapture.on() ? 'on · Ctrl Shift N' : 'off · Ctrl Shift N') : d.hint || '',
    run: () => go(d.key) })));

  C.on('project', () => { closePreview(); recents(); });
  recents();
  window.TribeShell = { setPanel, previewAgent, render, onShow, preview, closePreview, previewDoc, previewImage, previewApproval, switcher, openNew, recent, go, dests: () => DEST.map(d => ({ key: d.key, label: d.label, group: d.group || '', kind: d.kind || 'Go to', visible: !d.when || !!d.when() })), counts: () => counts, current };
})();
