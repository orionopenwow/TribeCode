// The real app on phones (< 820px), ported from the demo's phone layout (app/ui/demo.html):
//   - Discord-mobile panel: swipe from the left (or tap the project) for the project circles + section list.
//   - No header outside Chat: a bare project line, then the screen. A distinct bottom rack:
//     avatar · Chat · Docs · Updates · Tasks · orange action. In Chat the rack moves into a compact top bar.
//   - Composer: "+" menu (photo, file, task, vote), a one-tap voice recorder (pause / stop / delete), the send arrow.
//   - "Talk to…" picker: Flint (the built-in helper), my Claude, my desktop, #agents, #general and DMs.
//   - Updates: one-tap approvals with an optional comment, then what happened.
//   - Docs hub: the pinned repo as the hero, the living notes journal, files, screenshots.
//   - Suggested tasks on Tasks and Home. Profile sheets (add friend, network, DM, ask their Claude).
// Desktop is untouched: everything here is gated on the phone media query (and mobile2.css on @media).
// Public: window.TribeMobile = { show, onShow, profile, myProfile: () => profile(me().id), talkTo, startTribe, projectsSheet, askAi, plusMenu, recorder, refresh }.
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const C = window.TribeClient;
  const App = () => window.TribeApp, PJ = () => window.TribeProjects, DM = () => window.TribeDM;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mq = matchMedia('(max-width: 820px)');
  const phone = () => mq.matches;
  const toast = m => App() && App().toast(m);
  const me = () => C.state().me || {};
  const members = () => C.state().members || [];
  const member = id => members().find(m => m.id === id);
  const myAgent = () => members().find(m => m.role === 'agent' && m.owner === me().id);
  const agentOf = id => members().find(m => m.role === 'agent' && m.owner === id);
  const initials = n => String(n || '?').split(/\s+/).map(w => [...w][0]).slice(0, 2).join('').toUpperCase();
  const ink = hex => { const h = String(hex || '#6C7CFF').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? '#12151A' : '#FFFFFF'; };
  const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; if (!isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; };
  const dur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const chan = () => (DM() ? DM().current() : 'general');

  // ---------- icons (1.6px line, Lucide style) ----------
  const SYM = {
    'm2-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    'm2-clip': '<path d="M21 11.5 12.6 19.9a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/>',
    'm2-trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    'm2-pause': '<rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/>',
    'm2-play': '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
    'm2-stop': '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
    'm2-mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    'm2-image': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    'm2-clip': '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
    'm2-vote': '<path d="M4 20h16M7 16V9M12 16V5M17 16v-4"/>',
    'm2-task': '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
    'm2-desk': '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    'm2-hash': '<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>',
    'm2-spark': '<path d="M12 2c.6 4.6 2.4 7.3 7 8.5-4.6 1.2-6.4 3.9-7 8.5-.6-4.6-2.4-7.3-7-8.5 4.6-1.2 6.4-3.9 7-8.5z" fill="currentColor" stroke="none"/>',
    'm2-brain': '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
    'm2-robot': '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13h.01M15 13h.01M9 17h6"/>',
    'm2-userplus': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
    'm2-usercheck': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 11l2 2 4-4"/>',
    'm2-net': '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/><path d="M12 7.2v4.3M12 11.5 6.4 17.2M12 11.5l5.6 5.7"/>',
    'm2-chat': '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
    'm2-chev': '<path d="m6 9 6 6 6-6"/>',
    'm2-right': '<path d="m9 6 6 6-6 6"/>',
    'm2-back': '<path d="M15 6l-6 6 6 6"/>',
    'm2-plus': '<path d="M12 5v14M5 12h14"/>',
    'm2-git': '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-11 5"/>',
    'm2-bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    'm2-doc': '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
    'm2-check': '<path d="m5 12 5 5 9-10"/>',
    'm2-x': '<path d="M6 6l12 12M18 6 6 18"/>',
    'm2-hand': '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4 14a1.5 1.5 0 0 1 2.5-1.6L7 13"/>',
    'm2-pin': '<path d="M12 17v5M5 17h14l-2-4V5H7v8z"/>',
    'm2-mic-note': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/>',
    'm2-user': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    'm2-gear': '<path d="M10.3 2.6h3.4l.5 2.6a7.3 7.3 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.8a7.4 7.4 0 0 1 0 2.2l2 1.8-1.7 2.9-2.5-.9a7.3 7.3 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.3 7.3 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.8a7.4 7.4 0 0 1 0-2.2l-2-1.8 1.7-2.9 2.5.9a7.3 7.3 0 0 1 1.9-1.1z"/><circle cx="12" cy="12" r="2.8"/>',
    'm2-robot': '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V5M9.5 13h.01M14.5 13h.01M9.5 16h5M3 12v3M21 12v3"/><circle cx="12" cy="4" r="1"/>',
    'm2-home': '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>', 'm2-list': '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>', 'm2-users': '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 5.3a3.2 3.2 0 0 1 0 5.4M17.5 14.4c1.6.6 2.7 2.2 3 4.6"/>', 'm2-link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 'm2-search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  };
  (function sprite() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('style', 'display:none'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = Object.entries(SYM).map(([k, d]) => `<symbol id="${k.replace('m2-', 'm2i-')}" viewBox="0 0 24 24">${d}</symbol>`).join('');
    document.body.prepend(s);
  })();
  const ic = (id, sz = 20) => `<svg class="i m2i" style="width:${sz}px;height:${sz}px" aria-hidden="true"><use href="#m2i-${id}"/></svg>`;
  const avatar = (m, cls = '') => window.TribeProfiles && m && m.profile && m.profile.avatar ? window.TribeProfiles.avatar(m, 'm2-av ' + cls) : m && m.role === 'agent'   // feat/profiles: emoji / pixel / photo avatars
    ? `<span class="m2-av agent ${cls}">${ic('spark', 14)}</span>`
    : `<span class="m2-av ${cls}" style="background:${esc((m && m.color) || '#6C7CFF')};color:${ink((m && m.color) || '#6C7CFF')}">${esc(initials(m && m.name))}</span>`;

  // ---------- friends (kept on this device) ----------
  const FKEY = 'tribecode.friends.v1';
  const friends = () => { try { return new Set(JSON.parse(localStorage.getItem(FKEY) || '[]')); } catch { return new Set(); } };
  const setFriend = (id, on) => { const f = friends(); on ? f.add(id) : f.delete(id); try { localStorage.setItem(FKEY, JSON.stringify([...f])); } catch {} };

  // ---------- sheets: one at a time, flat scrim + 1px border, slide up ----------
  let sheetEl = null, scrimEl = null;
  function closeSheet() {
    if (!sheetEl) return;
    const s = sheetEl, sc = scrimEl; sheetEl = scrimEl = null;
    s.classList.add('out'); sc.classList.add('out');
    setTimeout(() => { s.remove(); sc.remove(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
  }
  function sheet(html, { id, label = '' } = {}) {
    if (sheetEl) { sheetEl.remove(); scrimEl.remove(); sheetEl = scrimEl = null; }
    scrimEl = document.createElement('div'); scrimEl.className = 'm2-scrim'; scrimEl.onclick = closeSheet;
    sheetEl = document.createElement('div'); sheetEl.className = 'm2-sheet'; if (id) sheetEl.id = id;
    sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-label', label);
    sheetEl.innerHTML = `<div class="m2-grab" aria-hidden="true"></div>${html}`;
    document.body.append(scrimEl, sheetEl);
    // drag the grab handle down to close
    let y0 = null;
    sheetEl.addEventListener('touchstart', e => { if (sheetEl && sheetEl.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    sheetEl.addEventListener('touchmove', e => { if (y0 === null || !sheetEl) return; const dy = e.touches[0].clientY - y0; if (dy > 0) { sheetEl.style.transition = 'none'; sheetEl.style.transform = `translateY(${dy}px)`; } }, { passive: true });
    sheetEl.addEventListener('touchend', e => { if (y0 === null || !sheetEl) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; sheetEl.style.transition = ''; sheetEl.style.transform = ''; if (dy > 90) closeSheet(); });
    return sheetEl;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetEl) { closeSheet(); e.stopPropagation(); } }, true);

  // =====================================================================
  // Rack: avatar · Chat · Docs · Updates · Tasks · action
  // =====================================================================
  const RACK = [
    { nav: 'hub', label: 'Home', icon: 'home', m2: true },   // your Home (all projects); the side panel is a swipe from the left
    { nav: 'chat', label: 'Chat', icon: 'chat', badge: 'nn-chat' },
    { nav: 'docs', label: 'Files', icon: 'doc' },
    { nav: 'tasks', label: 'Tasks', icon: 'task', badge: 'nn-tasks' },
    { nav: 'agents', label: 'Agents', icon: 'robot', m2: true },   // this project's Agents Hub
  ];
  function buildRack() {
    const bar = $('#tabbar'); if (!bar || bar.dataset.m2) return;
    bar.dataset.m2 = '1'; bar.classList.add('m2-rack');
    // Just the four places: you are in the top bar (profile), new things come from each screen and the chat +.
    bar.innerHTML = `<div class="m2-seg" role="tablist">${RACK.map(r => `<button ${r.m2 ? `data-m2nav="${r.nav}"` : `data-nav="${r.nav}"`} role="tab" aria-label="${r.label}" title="${r.label}">${ic(r.icon, 22)}<span class="lb">${r.label}</span><span class="bd hidden" data-bd="${r.badge || ''}"></span></button>`).join('')}</div>`;
  }
  // ---------- Home's own rack (phones): lines up with the dashboard, hides as you scroll down, + starts or joins ----------
  // Home · Projects · Notes · Activity · +. Each icon jumps to that part of the dashboard; the lit one follows the scroll.
  // Same five slots and look as a project's rack (Home · Chat · Docs · Updates · Tasks), Home's versions:
  // You · Messages · Notes · Notifs · Projects. On Home the Home tab becomes your avatar: tap it for your profile.
  const HOMEBAR = [['home', 'home', 'Home'], ['msgs', 'chat', 'Messages'], ['notes', 'doc', 'Files'], ['agents', 'robot', 'Agents'], ['pjs', 'list', 'Projects']];   // the bell lives in Home's top bar
  function homeBar() {
    if ($('#m2-homebar')) return;
    const bar = document.createElement('nav'); bar.id = 'm2-homebar'; bar.className = 'm2-homebar'; bar.setAttribute('aria-label', 'Home');
    bar.innerHTML = `<div class="m2-seg">${HOMEBAR.map(([k, i, l]) => k === 'plus' ? `<button class="m2-hb-plus" id="m2-hb-plus" aria-label="Start or join a tribe">${ic('plus', 24)}</button>`
      : `<button data-hb="${k}" aria-label="${k === 'me' ? 'Your profile' : l}" title="${k === 'me' ? 'Your profile' : l}">${k === 'me' ? '<span class="m2-hb-av" id="m2-hb-av"></span>' : ic(i, 22)}<span class="lb">${l}</span></button>`).join('')}</div>`;
    document.body.appendChild(bar);
    bar.addEventListener('click', e => {
      if (e.target.closest('#m2-hb-plus')) return startTribe();
      const b = e.target.closest('[data-hb]'); if (!b) return;
      const k = b.dataset.hb;
      if (k === 'pjs') return projectsSheet();
      if (k === 'agents') return C.connected() ? talkTo() : window.TribeAgentsHub && window.TribeAgentsHub.open({ global: true });   // your Claude, the AI, Manage agents
      if (k === 'notes') return window.TribeHub && window.TribeHub.open('docs');   // your docs center: your notes, then project docs
      if (k === 'msgs') return C.connected() ? messagesSheet() : window.TribeFriends && window.TribeFriends.open();   // all chats + DMs, color-coded
      if (k === 'notifs') return window.TribeNotify && window.TribeNotify.openInbox ? window.TribeNotify.openInbox() : null;
      if (k === 'home') return window.TribeHub && window.TribeHub.open('home');   // back to the dashboard from anywhere on Home (docs center too)
      scroller().scrollTo({ top: 0, behavior: 'smooth' });
    });
    // hide while scrolling down, show when scrolling up (or near the top)
    let lastY = 0;
    const onScroll = () => {
      if (!document.body.classList.contains('global')) return;
      const y = scroller().scrollTop || window.scrollY || 0;
      if (Math.abs(y - lastY) < 6) return;
      lastY = y; litHome();   // the rack stays put (no hiding on scroll)
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', e => { if (e.target && e.target.id === 'main') onScroll(); }, { passive: true, capture: true });
  }
  const scroller = () => { const m = $('#main'); return m && m.scrollHeight > m.clientHeight + 4 ? m : document.scrollingElement || document.documentElement; };
  function litHome() {
    const bar = $('#m2-homebar'); if (!bar) return;
    const on = window.TribeHub && window.TribeHub.mode && window.TribeHub.mode() === 'docs' ? 'notes' : 'home';
    bar.querySelectorAll('[data-hb]').forEach(b => b.classList.toggle('on', b.dataset.hb === on));
    const av = $('#hpt-av') || $('#m2-hb-av'), m = me() || {};
    if (av) { let sn = ''; try { sn = JSON.parse(localStorage.getItem('tribecode.settings.v1') || '{}').name || ''; } catch {} const n = (m.name || sn || '?').trim(); av.textContent = ([...n][0] || '').toUpperCase(); av.style.background = m.color || 'var(--accent)'; }
  }
  // Messages: every conversation in one list — each project's chat (in its color) and your direct messages (in
  // each person's color), unread first. Tap one to open it.
  function messagesSheet() {
    const pulses = (PJ() && PJ().pulses ? PJ().pulses() : {}) || {}, unread = (DM() && DM().unread ? DM().unread() : {}) || {};
    const pjs = (PJ() && PJ().list ? PJ().list() : []).map(p => ({ p, n: pulses[p.id] ? 1 : 0, here: PJ().here ? PJ().here(p.id).length : 0 }))
      .sort((a, b) => b.n - a.n || String(a.p.name).localeCompare(String(b.p.name)));
    const f = friends();
    const people = members().filter(m => m.role !== 'agent' && m.id !== me().id).map(m => ({ m, n: unread[DM().channelWith(m.id)] || 0 }))
      .sort((a, b) => b.n - a.n || (f.has(b.m.id) - f.has(a.m.id)) || (b.m.online - a.m.online) || String(a.m.name).localeCompare(String(b.m.name)));
    const ag = myAgent();
    const pRows = pjs.map(({ p, n, here }) => `<button class="m2-mi m2-conv" data-conv="pj:${esc(p.id)}" style="--cc:${esc(p.color || '#6C7CFF')}"><span class="m2-pjf">${PJ().face(p, 'sm')}</span><span class="m2-mt"><b># ${esc(p.name)}</b><small>${n ? 'New messages' : here ? `${here} here now` : 'Project chat'}</small></span>${n ? '<span class="m2-n">•</span>' : ''}</button>`).join('');
    const dRows = people.map(({ m, n }) => `<button class="m2-mi m2-conv" data-conv="dm:${esc(m.id)}" style="--cc:${esc(m.color || '#6C7CFF')}"><span class="m2-avw">${avatar(m)}<i class="m2-on ${m.online ? 'y' : ''}"></i></span><span class="m2-mt"><b>${esc(m.name)}${f.has(m.id) ? ' <span class="m2-tag">friend</span>' : ''}</b><small>${n ? `${n} new` : m.online ? 'online' : 'away'}</small></span>${n ? `<span class="m2-n">${n}</span>` : ''}</button>`).join('');
    const el = sheet(`<div class="m2-sh-h"><span class="eyebrow">Messages</span></div>
      ${ag ? `<div class="m2-menu"><button class="m2-mi m2-conv" data-conv="claude" style="--cc:#38C6B1"><span class="m2-mic live">${ic('robot', 18)}</span><span class="m2-mt"><b>My AI</b><small>${esc(ag.name)} · ${ag.online ? 'online' : 'reads it next time'}</small></span></button></div>` : ''}
      <div class="m2-sh-sub eyebrow">Project chats</div><div class="m2-menu">${pRows || '<p class="m2-fine left">No projects yet.</p>'}</div>
      <div class="m2-sh-sub eyebrow">Direct messages</div><div class="m2-menu">${dRows || '<p class="m2-fine left">Invite friends to message them here.</p>'}</div>`, { id: 'm2-messages-sheet', label: 'Messages' });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-conv]'); if (!b) return; closeSheet();
      const [k, id] = b.dataset.conv.split(':');
      if (k === 'pj') { try { if (PJ().current() !== id || document.body.classList.contains('global')) await PJ().switchTo(id); } catch {} return setTimeout(() => App().show('chat'), 200); }
      if (document.body.classList.contains('global')) { try { await PJ().switchTo(PJ().current()); } catch {} }
      App().show('chat');
      setTimeout(() => { if (k === 'claude') { const a = myAgent(); if (a && DM()) DM().open(a.id); } else if (DM()) DM().open(id); }, 250);
    });
  }
  // Your projects as a list sheet (Home's Projects button and the TribeCode ⌄ header): tap one to open it.
  function projectsSheet() {
    const list = (PJ() && PJ().list ? PJ().list() : []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const cur = PJ() && PJ().current ? PJ().current() : null;
    const rows = list.map(p => { const here = PJ().here ? PJ().here(p.id).length : 0;
      return `<button class="m2-mi ${p.id === cur && !document.body.classList.contains('global') ? 'on' : ''}" data-pj="${esc(p.id)}"><span class="m2-pjf">${PJ().face(p, 'sm')}</span><span class="m2-mt"><b>${esc(p.name)}</b><small>${here ? `${here} here now` : esc(p.bio || 'Open the project')}</small></span>${ic('chev', 16)}</button>`; }).join('');
    const el = sheet(`<div class="m2-sh-h"><span class="eyebrow">Your projects</span></div>
      ${list.length ? `<div class="m2-menu m2-pjlist">${rows}</div>` : '<p class="m2-fine left">No projects yet.</p>'}
      <div class="m2-menu"><button class="m2-mi" data-pj="new"><span class="m2-mic live">${ic('plus', 18)}</span><span class="m2-mt"><b>New project</b><small>Start one, or join with a link</small></span></button>${window.TribeOffline && !C.connected() ? `<button class="m2-mi" data-pj="demo" id="m2-demo"><span class="m2-mic">${ic('spark', 18)}</span><span class="m2-mt"><b>Try a demo tribe (offline)</b><small>Host a pretend tribe on this phone. Nothing leaves it.</small></span></button>` : ''}</div>`, { id: 'm2-projects-sheet', label: 'Your projects' });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-pj]'); if (!b) return; closeSheet();
      if (b.dataset.pj === 'new') return startTribe();
      if (b.dataset.pj === 'demo') return window.TribeOffline.start();   // feat/offline-demo
      try { await PJ().switchTo(b.dataset.pj); } catch {}
      setTimeout(() => App().show('home'), 200);
    });
  }
  // "+" on Home: one sheet to start or join, even from a phone (phones can't run the tribe themselves).
  function startTribe() {
    if (C.connected()) return PJ() && PJ().openNew ? PJ().openNew() : null;   // in a tribe: a new project (Create my own · templates · Join)
    if (window.TribePhoneHost) return window.TribePhoneHost.open();   // where should your tribe live? (phonehost.js, docs/PHONE-HOSTING.md)
    const dl = (window.TribeWeb && window.TribeWeb.RELEASES) || 'https://github.com/orionopenwow/TribeCode/releases/latest';
    const el = sheet(`<div class="m2-sh-h"><span class="eyebrow">Start a tribe</span><h3>Who runs it?</h3></div>
      <p class="m2-fine left">A tribe’s work lives in its shared GitHub repository. Someone keeps the tribe online (a desktop app or their own server) so friends and agents can reach it. Your phone joins from anywhere.</p>
      <div class="m2-menu">
        <button class="m2-mi" data-st="mine"><span class="m2-mic live">${ic('desk', 18)}</span><span class="m2-mt"><b>My own computer</b><small>Send yourself the link, install, it starts hosting</small></span></button>
        <button class="m2-mi" data-st="friend"><span class="m2-mic">${ic('users', 18)}</span><span class="m2-mt"><b>A friend's computer</b><small>Ask someone with a PC or Mac to host for the group</small></span></button>
        <button class="m2-mi" data-st="join"><span class="m2-mic">${ic('link', 18)}</span><span class="m2-mt"><b>I have an invite link</b><small>Join a tribe someone already started</small></span></button>
        ${window.TribeOffline ? `<button class="m2-mi" data-st="demo"><span class="m2-mic">${ic('spark', 18)}</span><span class="m2-mt"><b>Try a demo tribe first</b><small>Offline, on this phone: you host a pretend tribe</small></span></button>` : ''}
      </div>`, { id: 'm2-start-sheet', label: 'Start a tribe' });
    el.querySelector('.m2-menu').addEventListener('click', async e => {
      const b = e.target.closest('[data-st]'); if (!b) return; const k = b.dataset.st;
      if (k === 'join') { closeSheet(); return window.TribeSettings && window.TribeSettings.joinPrompt(); }
      if (k === 'demo') { closeSheet(); return window.TribeOffline.start(); }   // feat/offline-demo
      const text = k === 'mine' ? `Install TribeCode on my computer (it hosts our tribe): ${dl}` : `Can you host our TribeCode tribe? Install the app, open it, tap Invite a friend and send me the link: ${dl}`;
      try { if (navigator.share) await navigator.share({ title: 'TribeCode', text }); else { await navigator.clipboard.writeText(text); toast('Copied. Paste it in a message.'); } } catch {}
      closeSheet();
    });
  }
  function homeMode() {
    const on = phone() && document.body.classList.contains('global');
    if (on) homeBar();
    const bar = $('#m2-homebar'); if (bar) { bar.classList.toggle('hidden', !on); if (on) { bar.classList.remove('away'); setTimeout(litHome, 50); } }
  }

  function paintMe() { const b = $('#m2-me'); if (b) b.innerHTML = avatar(me()); }
  function setBadge(key, n) {
    const el = document.querySelector(`#tabbar [data-bd="${key}"], .titlebar [data-bd="${key}"]`); if (!el) return;
    const was = el.textContent; el.textContent = n > 99 ? '99+' : n || '';
    el.classList.toggle('hidden', !n);
    if (n && was !== el.textContent) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }
  function syncBadges() {
    const num = id => { const e = document.getElementById(id); return e ? Number(String(e.textContent).replace('+', '')) || 0 : 0; };
    setBadge('nn-chat', num('nn-chat'));
    setBadge('nn-tasks', window.TribeTaskNews ? window.TribeTaskNews.count() : 0);   // v0.26: task updates you haven't seen (tasknews.js)
    // The bell's unread count (notify.js #nf-count; the old nest Updates row is gone) — it already includes approval asks.
    const inbox = window.TribeNotify && window.TribeNotify.state ? window.TribeNotify.state().unread || 0 : num('nf-count');
    setBadge('updates', Math.max(pendingMine().length, inbox));
  }

  // =====================================================================
  // View switching: "updates" is a phone-only screen; everything else is TribeApp.show
  // =====================================================================
  let cur = 'home';
  function ensureUpdatesView() {
    let v = $('#view-updates');
    if (!v && $('#main')) { v = document.createElement('section'); v.id = 'view-updates'; v.className = 'hidden m2-only'; $('#main').appendChild(v); }
    return v;
  }
  function show(view) {
    if (view === 'agents') return phone() ? talkTo() : window.TribeAgentsHub && window.TribeAgentsHub.open();   // phones: reach your Claude on your computer in one tap
    if (view === 'hub') return window.TribeHub ? window.TribeHub.open('home') : App().show('home');
    if (view !== 'updates') return App().show(view);
    if (window.TribeFlow && window.TribeFlow.isFlow && window.TribeFlow.isFlow() && window.TribeFlow.openUpdates) return window.TribeFlow.openUpdates();   // flow projects: the living plan + gists
    if (!phone()) return window.TribeNotify ? window.TribeNotify.openInbox() : App().show('home');
    App().show('home');                                  // resets the shell (drawer, breadcrumbs, previews)
    $$('#main > section').forEach(s => s.classList.add('hidden'));
    ensureUpdatesView().classList.remove('hidden');
    document.body.dataset.view = 'updates';
    $$('[data-nav]').forEach(b => b.classList.remove('on'));
    cur = 'updates'; paintRack(); enter($('#view-updates'));
    renderUpdates(); loadUpdates();
    // v0.26: opening Updates is reading them: the badge clears (the dots stay for this visit); new ones count it back up
    clearTimeout(show.rd); show.rd = setTimeout(() => { if (cur === 'updates' && window.TribeNotify && window.TribeNotify.state().unread && window.TribeNotify.markAllRead) window.TribeNotify.markAllRead(); }, 1200);
    const cl = $('#crumb-label'); if (cl) cl.textContent = 'Updates';
    try { sessionStorage.setItem('tribecode.view', 'home'); } catch {}
  }
  function onShow(view) {            // TribeShell.onShow calls this on every App.show
    const u = $('#view-updates'); if (u) u.classList.add('hidden');
    cur = view; paintRack();
    if (!phone()) return;
    if (view === 'docs') docsHub();
    if (view === 'tasks' || view === 'home') suggested(view);
    if (view === 'chat') { composer(); talkLabel(); }
    enter($('#view-' + view));
  }
  function paintRack() {
    const bar = $('#tabbar'); if (!bar) return;
    document.querySelectorAll('#tabbar [data-m2nav], #m2-bell').forEach(b => b.classList.toggle('on', b.dataset.m2nav === cur || (b.dataset.m2nav === 'agents' && cur === 'agents-hub')));
    bar.querySelectorAll('[data-nav]').forEach(b => b.setAttribute('aria-selected', b.classList.contains('on')));
    document.body.classList.toggle('m2-in-chat', cur === 'chat');
    const t = $('#m2-talk'); if (t) t.classList.toggle('hidden', cur !== 'chat');
  }
  function enter(el) {
    if (!el || !phone()) return;
    el.classList.remove('m2-enter'); void el.offsetWidth; el.classList.add('m2-enter');
  }
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-m2nav], [data-m2]'); if (!t) return;
    if (t.dataset.m2nav) { e.preventDefault(); return show(t.dataset.m2nav); }
    if (t.dataset.m2 === 'me') { e.preventDefault(); return profile(me().id); }
    if (t.dataset.m2 === 'act') { e.preventDefault(); return action(t); }
  });
  // The orange action: what you most likely want to make on this screen.
  function action(anchor) {
    const S = window.TribeShell;
    if (cur === 'tasks') return quickTask();
    if (cur === 'docs') { const b = $('#doc-new'); if (b) return b.click(); }
    if (S && S.openNew) return S.openNew(anchor);
  }
  function quickTask(prefill = '') {
    const el = sheet(`<div class="m2-sh-h"><span class="eyebrow">New</span><h3>Task</h3></div>
      <form class="m2-quick" id="m2-qt"><input id="m2-qt-in" maxlength="140" placeholder="What needs doing?" enterkeyhint="done" autocomplete="off" value="${esc(prefill)}"><button class="m2-go" aria-label="Add task">${ic('up', 20)}</button></form>
      ${window.TribeTasks && window.TribeTasks.typeChips ? window.TribeTasks.typeChips('', 'm2-types') : ''}
      <p class="m2-fine">Lands in Backlog. Anyone (or their AI) can take it.</p>`, { id: 'm2-task-sheet', label: 'New task' });
    const inp = el.querySelector('#m2-qt-in'); setTimeout(() => inp.focus(), 60);
    let qtType = '';   // feat/setup-flow: task type chips
    el.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { qtType = qtType === b.dataset.type ? '' : b.dataset.type; el.querySelectorAll('[data-type]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.type === qtType))); });
    if (window.TribeAssist) window.TribeAssist.ideas(el, { compact: true, force: true });   // feat/assist: suggested tasks
    el.querySelector('#m2-qt').onsubmit = async e => {
      e.preventDefault(); const v = inp.value.trim(); if (!v) return;
      try { await window.TribeTasks.create(v, 'backlog', { type: qtType }); closeSheet(); toast('Task added'); if (cur === 'tasks' || cur === 'home') suggested(cur, true); } catch (err) { toast(err.message); }
    };
  }

  // =====================================================================
  // Top bar: the project line (tap = panel). In Chat: rack in the middle, "Talk to…" on the right.
  // =====================================================================
  function topBar() {
    const mb = $('#menu-btn'); if (!mb || mb.dataset.m2) return;
    mb.dataset.m2 = '1';
    mb.insertAdjacentHTML('beforeend', '<span class="m2-face" id="m2-face"></span><span class="m2-pj"><b id="m2-pjn"></b><small id="m2-pjs"></small></span>');
    const tb = $('.titlebar .tb-right');
    if (tb && !$('#m2-talk')) tb.insertAdjacentHTML('afterbegin', `<button class="m2-talk hidden" id="m2-talk" aria-haspopup="dialog" aria-label="Talk to…"><span id="m2-talk-l">#general</span>${ic('chev', 14)}</button>`);
    $('#m2-talk').addEventListener('click', e => { e.stopPropagation(); talkTo(); });
    // top right: the pane button opens the right-side pane (who's here, helpers, Claude, scratchpad) as a sheet
    // In a project, Updates (the bell) sits top right like a social app's activity button, beside the pane button:
    // it's checked at a glance, not navigated to, so it doesn't take a slot in the rack.
    if (tb && !$('#m2-bell')) { tb.insertAdjacentHTML('beforeend', `<button class="m2-pane-btn m2-bell" id="m2-bell" data-m2nav="updates" aria-label="Updates" title="Updates">${ic('bell', 22)}<span class="bd hidden" data-bd="updates"></span></button>`); }
    if (tb && !$('#m2-pane')) { tb.insertAdjacentHTML('beforeend', '<button class="m2-pane-btn" id="m2-pane" aria-label="Open the side pane" title="Side pane"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/></svg></button>');
      $('#m2-pane').addEventListener('click', e => { e.stopPropagation(); document.body.classList.toggle('m2-pane-open'); }); }
    document.addEventListener('click', e => { if (!document.body.classList.contains('m2-pane-open')) return; if (e.target.closest && (e.target.closest('#tour-room') || e.target.closest('#m2-pane'))) return; document.body.classList.remove('m2-pane-open'); }, true);
    // The profile moved from the bottom rack to the top bar: on phones it opens your profile sheet.
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#pf-btn'); if (!b || !phone()) return; e.preventDefault(); e.stopPropagation(); profile(me().id); }, true);
    // New task on phones: the quick sheet (the screen's own button, now that the rack has no + of its own)
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#task-new'); if (!b || !phone()) return; e.preventDefault(); e.stopPropagation(); quickTask(); }, true);
    paintProject();
  }
  function paintProject() {
    const p = PJ() && PJ().cur && PJ().cur();
    const f = $('#m2-face'), n = $('#m2-pjn'), s = $('#m2-pjs'); if (!f) return;
    const sw = $('#pj-switch'); document.body.classList.toggle('m2-has-switch', !!(sw && !sw.classList.contains('hidden')));
    // The fire logo opens the projects panel (like the desktop rail); the name says where you are.
    // In a project its own picture sits top left; on Home the fire logo
    const home = document.body.classList.contains('global');
    const want = !home && p && PJ().face ? 'pj:' + p.id + ':' + (p.image || '') + (p.emoji || '') : 'logo';
    if (f.dataset.k !== want) { f.dataset.k = want; f.innerHTML = want === 'logo' ? '<img class="m2-logo" src="assets/icon.svg" alt="">' : PJ().face(p, 'sm'); }
    n.textContent = home ? 'Home' : p ? p.name : 'TribeCode';
    const here = p && PJ().here ? PJ().here(p.id).length : 0;
    s.textContent = home ? (C.connected() ? 'your projects' : 'not in a tribe yet') : C.connected() ? (here ? `${here} here` : 'just you') : 'offline';
  }
  function talkLabel() {
    const l = $('#m2-talk-l'); if (!l) return;
    const ch = chan();
    if (ch === 'general') { l.textContent = '#general'; return; }
    if (/^c-/.test(ch)) { l.textContent = window.TribeChannels ? window.TribeChannels.label(ch) : '#channel'; return; }   // feat/chat2
    const rest = ch.replace(/^dm-/, ''), mid = me().id, other = rest.startsWith(mid + '-') ? rest.slice(mid.length + 1) : rest.slice(0, -(mid.length + 1));
    const m = member(other); l.textContent = m ? m.name : 'Direct message';
  }

  // =====================================================================
  // Discord-mobile panel: swipe from the left edge (or anywhere, horizontally) to open; swipe back to close.
  // =====================================================================
  function swipe() {
    let t = null;
    const side = () => $('.window > .side');
    const W = () => (side() ? side().getBoundingClientRect().width : 320);
    const blocked = el => el.closest('input, textarea, select, [contenteditable="true"], .board, .m2-hscroll, .m2-sheet, .sh-pop, .modal:not(.hidden), .pj-strip, .vn, .doc-edit, #m2-rec, .tour:not(.hidden)');
    document.addEventListener('touchstart', e => {
      if (!phone() || e.touches.length !== 1 || sheetEl) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY, open = document.body.classList.contains('drawer-open');
      if (!open && x > 28 && blocked(e.target)) return;
      t = { x, y, open, on: false, dx: 0, t0: Date.now() };
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!t) return;
      const dx = e.touches[0].clientX - t.x, dy = e.touches[0].clientY - t.y;
      if (!t.on) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.4) { if (Math.abs(dy) > 14) t = null; return; }
        if ((!t.open && dx < 0) || (t.open && dx > 0)) { t = null; return; }
        t.on = true; document.body.classList.add('m2-dragging');
      }
      t.dx = dx;
      const w = W(), off = t.open ? Math.min(0, dx) : Math.min(0, dx - w);
      const s = side(); if (s) s.style.transform = `translateX(${off}px)`;
      document.body.style.setProperty('--m2-p', String(Math.max(0, Math.min(1, 1 + off / w))));
    }, { passive: true });
    const end = () => {
      if (!t) return; const st = t; t = null;
      if (!st.on) return;
      const s = side(); if (s) s.style.transform = '';
      document.body.classList.remove('m2-dragging'); document.body.style.removeProperty('--m2-p');
      const fast = Math.abs(st.dx) / Math.max(1, Date.now() - st.t0) > 0.45, w = W();
      const open = st.open ? !(st.dx < -w * 0.3 || (fast && st.dx < 0)) : (st.dx > w * 0.3 || (fast && st.dx > 0));
      document.body.classList.toggle('drawer-open', open);
    };
    document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  }

  // =====================================================================
  // Composer: "+" · input · mic (empty) / send arrow (typing). One-tap recorder with pause, stop, delete.
  // =====================================================================
  function composer() {
    const mount = $('#composer-mount'), form = $('#chat-form'); if (!mount || !form || $('#m2-plus')) return;
    mount.classList.add('m2-composer');
    form.insertAdjacentHTML('beforebegin', `<button type="button" class="m2-cbtn m2-only" id="m2-plus" aria-label="Add" aria-haspopup="dialog">${ic('plus', 22)}</button>`);
    form.insertAdjacentHTML('afterend', `<button type="button" class="m2-cbtn m2-only" id="m2-mic" aria-label="Record a voice note">${ic('mic', 21)}</button>
      <button type="button" class="m2-cbtn m2-send m2-only" id="m2-send" aria-label="Send">${ic('up', 21)}</button>
      <div class="m2-rec m2-only" id="m2-rec" aria-live="polite" hidden>
        <button type="button" class="m2-cbtn ghost" id="m2-rec-del" aria-label="Delete voice note">${ic('trash', 20)}</button>
        <div class="m2-pill live"><span class="m2-dot"></span><span class="m2-time" id="m2-rec-time">0:00</span><div class="m2-wave" id="m2-rec-wave"></div></div>
        <div class="m2-pill pv"><button type="button" class="m2-play" id="m2-rec-play" aria-label="Play preview">${ic('play', 14)}</button><div class="m2-wave pv" id="m2-pv-wave"></div><span class="m2-time" id="m2-pv-dur">0:00</span></div>
        <button type="button" class="m2-cbtn" id="m2-rec-pause" aria-label="Pause recording">${ic('pause', 18)}</button>
        <button type="button" class="m2-cbtn" id="m2-rec-stop" aria-label="Stop and preview">${ic('stop', 16)}</button>
        <button type="button" class="m2-cbtn m2-send on" id="m2-rec-send" aria-label="Send voice note">${ic('up', 21)}</button>
      </div>`);
    const inp = $('#chat-input');
    const sync = () => mount.classList.toggle('typing', !!inp.value.trim());
    inp.addEventListener('input', sync);
    form.addEventListener('submit', () => setTimeout(sync, 0));
    new MutationObserver(sync).observe(inp, { attributes: true, attributeFilter: ['value'] });
    $('#m2-send').addEventListener('click', () => { if (!inp.value.trim()) return; const b = $('#m2-send'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); form.requestSubmit(); setTimeout(sync, 0); inp.focus(); });
    $('#m2-plus').addEventListener('click', e => { e.stopPropagation(); plusMenu(); });
    $('#m2-mic').addEventListener('click', () => recorder.start());
    $('#m2-rec-del').addEventListener('click', () => recorder.discard());
    $('#m2-rec-pause').addEventListener('click', () => recorder.pause());
    $('#m2-rec-stop').addEventListener('click', () => recorder.stop());
    $('#m2-rec-send').addEventListener('click', () => recorder.send());
    $('#m2-rec-play').addEventListener('click', () => recorder.play());
    sync();
  }

  // "+": photo, file, task, vote (votes.js from another branch registers window.TribeVotes).
  function plusMenu() {
    if (window.TribePlus) return window.TribePlus.open($('#m2-plus'));
    const votes = !!(window.TribeVotes && typeof window.TribeVotes.openComposer === 'function');
    const items = [
      { k: 'photo', icon: 'image', t: 'Photo', s: 'From your camera roll or camera' },
      { k: 'file', icon: 'clip', t: 'File', s: 'Adds it to Files and tells the chat' },
      { k: 'task', icon: 'task', t: 'Task', s: 'Turn this into a task' },
      ...(votes ? [{ k: 'vote', icon: 'vote', t: 'Start a vote', s: 'Ask everyone to pick' }] : []),
    ];
    const el = sheet(`<div class="m2-menu">${items.map(x => `<button class="m2-mi" data-plus="${x.k}">${`<span class="m2-mic">${ic(x.icon, 19)}</span>`}<span class="m2-mt"><b>${x.t}</b><small>${x.s}</small></span></button>`).join('')}</div>`, { id: 'm2-plus-menu', label: 'Add to the chat' });
    const plus = $('#m2-plus'); if (plus) plus.classList.add('open');
    const off = () => { const p = $('#m2-plus'); if (p) p.classList.remove('open'); };
    el.querySelector('.m2-menu').addEventListener('click', e => {
      const b = e.target.closest('[data-plus]'); if (!b) return;
      const k = b.dataset.plus; closeSheet(); off();
      if (k === 'photo') return pick('image/*', sendPhoto);
      if (k === 'file') return pick('', sendFile);
      if (k === 'task') { const v = ($('#chat-input') || {}).value || ''; return quickTask(v.trim()); }
      if (k === 'vote' && votes) return window.TribeVotes.openComposer();
    });
    scrimEl.addEventListener('click', off);
  }
  function pick(accept, fn) {
    const i = document.createElement('input'); i.type = 'file'; if (accept) i.accept = accept;
    i.onchange = () => { const f = i.files && i.files[0]; if (f) fn(f); };
    i.click();
  }
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  async function sendPhoto(f) {
    if (!/^image\//.test(f.type)) return toast('That is not an image.');
    if (f.size > 3 * 1024 * 1024) return toast('Images up to 3 MB.');
    const inp = $('#chat-input'), text = inp ? inp.value.trim() : '';
    try { await C.api(`/chat/${chan()}/image`, { method: 'POST', body: { data: await toB64(f), mime: f.type, text } }); if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input')); } }
    catch (e) { toast(e.message); }
  }
  async function sendFile(f) {
    try {
      if (/\.(md|markdown|txt)$/i.test(f.name)) { await window.TribeDocs.importFiles([f]); await C.api('/chat/' + chan(), { method: 'POST', body: { text: `📎 Shared **${f.name}** in Files` } }); toast('Added to Files'); }
      else { if (f.size > 8 * 1024 * 1024) return toast('Files up to 8 MB.'); await C.api(`/chat/${chan()}/file`, { method: 'POST', body: { data: await toB64(f), name: f.name, mime: f.type || 'application/octet-stream' } }); }   // keeps the bytes (a download chip in chat)
    }
    catch (e) { toast(e.message); }
  }

  // The recorder: MediaRecorder with pause/resume, a live level meter, preview before sending.
  const recorder = (function () {
    let r = null;   // { mr, stream, chunks, levels, t0, acc, paused, blob, url, audio, ctx, meter, tick, words }
    const ui = () => ({ mount: $('#composer-mount'), box: $('#m2-rec') });
    const pickMime = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const elapsed = () => (r ? r.acc + (r.paused || r.blob ? 0 : (Date.now() - r.t0) / 1000) : 0);
    function state(s) {
      const { mount, box } = ui(); if (!mount || !box) return;
      box.hidden = s === 'idle';
      mount.classList.toggle('rec', s !== 'idle'); mount.classList.toggle('paused', s === 'paused'); mount.classList.toggle('preview', s === 'preview');
      const pz = $('#m2-rec-pause'); if (pz) { pz.innerHTML = ic(s === 'paused' ? 'mic' : 'pause', 18); pz.setAttribute('aria-label', s === 'paused' ? 'Resume recording' : 'Pause recording'); }
    }
    function wave(el, levels, n = 40) {
      if (!el) return;
      const L = levels.length ? levels : [0], max = Math.max(0.02, ...L);
      el.innerHTML = Array.from({ length: n }, (_, i) => { const seg = L.slice(Math.floor(i * L.length / n), Math.floor((i + 1) * L.length / n)); const v = seg.length ? Math.max(...seg) : 0; return `<i style="height:${Math.round(3 + 18 * v / max)}px"></i>`; }).join('');
    }
    async function start() {
      if (r) return;
      if (!C.connected()) return toast('Connect to a tribe to send voice notes.');
      if (!window.MediaRecorder || !navigator.mediaDevices) return toast('Voice notes need a browser that can record audio.');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { return toast(e.name === 'NotAllowedError' ? 'Microphone access was blocked.' : 'No microphone found.'); }
      const mime = pickMime(), mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      r = { mr, stream, chunks: [], levels: [], t0: Date.now(), acc: 0, paused: false, ch: chan(), words: [], interim: '' };
      mr.ondataavailable = e => { if (e.data && e.data.size) r && r.chunks.push(e.data); };
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)(), an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize); r.ctx = ctx;
        r.meter = setInterval(() => { if (!r || r.paused) return; an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) ** 2; r.levels.push(Math.sqrt(s / buf.length) / 128); }, 90);
      } catch {}
      speech(true);
      mr.start(250);
      r.tick = setInterval(draw, 200);
      state('recording'); draw();
    }
    function speech(on) {
      const SP = window.TribeSpeech; if (!SP || !SP.supported || !SP.supported() || navigator.webdriver) return;   // live transcript; automated browsers have no recognizer
      try {
        if (on) SP.use('m2voice', { label: 'recording', onFinal: t => { if (r) { r.words.push(t); r.interim = ''; } }, onInterim: t => { if (r) r.interim = t; } });
        else SP.release('m2voice');
      } catch {}
    }
    function draw() {
      if (!r) return;
      const t = $('#m2-rec-time'); if (t) t.textContent = dur(elapsed());
      const w = $('#m2-rec-wave'); if (w) { const L = r.levels.slice(-36); w.innerHTML = L.map(v => `<i style="height:${Math.round(3 + Math.min(1, v * 4) * 18)}px"></i>`).join(''); }
      if (elapsed() > 120) stop();
    }
    function pause() {
      if (!r || r.blob) return;
      if (!r.paused) { try { r.mr.pause(); } catch {} r.acc += (Date.now() - r.t0) / 1000; r.paused = true; speech(false); state('paused'); }
      else { try { r.mr.resume(); } catch {} r.t0 = Date.now(); r.paused = false; speech(true); state('recording'); }
      draw();
    }
    async function finish() {   // stop the MediaRecorder and build the blob (once)
      if (!r || r.blob) return r;
      if (!r.paused) r.acc += (Date.now() - r.t0) / 1000;
      r.paused = true; clearInterval(r.tick); clearInterval(r.meter);
      const done = new Promise(res => { r.mr.onstop = res; });
      try { r.mr.stop(); } catch {}
      await Promise.race([done, new Promise(res => setTimeout(res, 1500))]);
      r.stream.getTracks().forEach(t => t.stop()); if (r.ctx) r.ctx.close().catch(() => {});
      speech(false);
      r.blob = new Blob(r.chunks, { type: r.mr.mimeType || pickMime() || 'audio/webm' });
      return r;
    }
    async function stop() {
      if (!r) return;
      await finish(); if (!r) return;
      r.url = URL.createObjectURL(r.blob);
      wave($('#m2-pv-wave'), r.levels, 34); const d = $('#m2-pv-dur'); if (d) d.textContent = dur(r.acc);
      state('preview');
    }
    function play() {
      if (!r || !r.url) return;
      if (r.audio && !r.audio.paused) { r.audio.pause(); return; }
      r.audio = r.audio || new Audio(r.url);
      const b = $('#m2-rec-play'), bars = () => $$('#m2-pv-wave i');
      r.audio.ontimeupdate = () => { const k = Math.round((r && r.audio && r.audio.duration ? r.audio.currentTime / r.audio.duration : 0) * bars().length); bars().forEach((x, i) => x.classList.toggle('p', i < k)); };
      r.audio.onplay = () => { if (b) b.innerHTML = ic('pause', 14); };
      r.audio.onpause = r.audio.onended = () => { if (b) b.innerHTML = ic('play', 14); };
      r.audio.play().catch(() => toast("Couldn't play the preview."));
    }
    function reset() {
      if (r) { clearInterval(r.tick); clearInterval(r.meter); if (r.audio) r.audio.pause(); if (r.url) URL.revokeObjectURL(r.url); }
      r = null; state('idle'); const w = $('#m2-rec-wave'); if (w) w.innerHTML = '';
    }
    async function discard() {
      if (!r) return;
      if (!r.blob) { try { r.mr.stop(); } catch {} r.stream.getTracks().forEach(t => t.stop()); if (r.ctx) r.ctx.close().catch(() => {}); speech(false); }
      reset(); toast('Voice note deleted');
    }
    async function send() {
      if (!r) return;
      const st = await finish(); if (!st) return;
      const secs = st.acc, ch = st.ch, transcript = [...st.words, st.interim].filter(Boolean).join(' ').trim();
      const blob = st.blob, n = 32, L = st.levels, max = Math.max(0.02, ...L);
      const w = Array.from({ length: n }, (_, i) => { const seg = L.slice(Math.floor(i * L.length / n), Math.floor((i + 1) * L.length / n)); const v = seg.length ? Math.max(...seg) : 0; return Math.round(1 + 8 * v / max); });
      reset();
      if (secs < 0.6) return toast('That was too short to send.');
      if (blob.size > 3 * 1024 * 1024) return toast('Voice note too long (max about 2 minutes).');
      try { await C.api(`/chat/${ch}/voice`, { method: 'POST', body: { data: await toB64(blob), mime: blob.type, dur: Math.max(1, Math.round(secs)), transcript, wave: w } }); }
      catch (e) { toast('Voice note not sent: ' + e.message); }
    }
    return { start, pause, stop, play, discard, send, active: () => !!r, state: () => (!r ? 'idle' : r.url ? 'preview' : r.paused ? 'paused' : 'recording') };
  })();

  // =====================================================================
  // "Talk to…": Flint, my Claude, my desktop, #agents, #general and DMs (friends first)
  // =====================================================================
  function talkTo() {
    const ag = myAgent(), f = friends(), ch = chan();
    const people = members().filter(m => m.role !== 'agent' && m.id !== me().id && m.role !== 'spectator')
      .sort((a, b) => (f.has(b.id) - f.has(a.id)) || (b.online - a.online) || String(a.name).localeCompare(b.name));
    const unread = DM() && DM().unread ? DM().unread() : {};
    const row = (k, iconHtml, t, s, on = false, extra = '') => `<button class="m2-mi ${on ? 'on' : ''}" data-talk="${esc(k)}">${iconHtml}<span class="m2-mt"><b>${t}</b><small>${s}</small></span>${extra}</button>`;
    const el = sheet(`<div class="m2-sh-h"><span class="eyebrow">Talk to your AI, Flint or the tribe</span></div>
      <div class="m2-menu">
        ${window.TribeFlint ? row('flint', `<span class="m2-mic live"><svg class="i m2i" style="width:18px;height:18px" aria-hidden="true"><use href="#i-flint"/></svg></span>`, 'Flint', `The built-in helper · ${window.TribeFlint.status().online ? 'local model on' : 'basic mode'}`) : ''}
        ${row('ai', `<span class="m2-mic live">${ic('spark', 18)}</span>`, 'Ask AI', '<span id="m2-ai-sub">The tribe\'s AI answers in #general</span>')}
        ${ag ? row('claude', `<span class="m2-mic live">${ic('robot', 18)}</span>`, 'My AI', `${esc(ag.name)} · ${ag.online ? 'online' : 'reads it next time'}`, ch === DM().channelWith(ag.id)) : ''}
        ${ag ? row('desktop', `<span class="m2-mic">${ic('desk', 18)}</span>`, 'My desktop', 'Hand a change to a computer that can push') : ''}
        ${row('agents', `<span class="m2-mic">${ic('robot', 18)}</span>`, '#agents', 'Where the agents coordinate')}
        ${row('general', `<span class="m2-mic">${ic('hash', 18)}</span>`, '#general', 'Everyone in this project', ch === 'general')}
        ${chanRows(ch)}
        ${row('manage', `<span class="m2-mic">${ic('gear', 18)}</span>`, 'Manage agents', 'Connect your AI, the fleet, the Office')}
      </div>
      ${ag ? '' : '<button class="m2-fine m2-byo" data-talk="claude">Have an AI on a computer? Connect it too</button>'}
      ${people.length ? `<div class="m2-sh-sub eyebrow">Direct messages</div><div class="m2-menu">${people.map(m => { const n = unread[DM().channelWith(m.id)] || 0;
        return row('dm:' + m.id, `<span class="m2-avw">${avatar(m)}<i class="m2-on ${m.online ? 'y' : ''}"></i></span>`, esc(m.name) + (f.has(m.id) ? ' <span class="m2-tag">friend</span>' : ''), m.online ? 'online' : 'away', ch === DM().channelWith(m.id),
          `${n ? `<span class="m2-n">${n}</span>` : ''}<span class="m2-info" data-prof="${esc(m.id)}" role="button" aria-label="${esc(m.name)}'s profile">${ic('user', 16)}</span>`); }).join('')}</div>` : '<p class="m2-fine">Invite friends to message them here.</p>'}`, { id: 'm2-talk-sheet', label: 'Talk to' });
    C.api('/ask').then(r => { const sub = $('#m2-ai-sub'); if (sub) sub.textContent = AI_SUB[r.kind](r); }).catch(() => {});
    el.addEventListener('click', e => {
      const pf = e.target.closest('[data-prof]'); if (pf) { e.stopPropagation(); return profile(pf.dataset.prof); }
      const cm = e.target.closest('[data-chm]'); if (cm) { e.stopPropagation(); return window.TribeChannels.menu(cm.dataset.chm, cm); }   // feat/chat2
      const b = e.target.closest('[data-talk]'); if (!b) return;
      closeSheet(); talk(b.dataset.talk);
    });
  }
  // feat/chat2: the project's created channels in the Talk to sheet (a ... for each one's menu), and + New channel
  function chanRows(ch) {
    const T = window.TribeChannels; if (!T) return '';
    const un = DM() && DM().unread ? DM().unread() : {};
    const rows = T.list().filter(c => !c.main && !c.archived).map(c => `<button class="m2-mi ${ch === c.id ? 'on' : ''}" data-talk="ch:${esc(c.id)}"><span class="m2-mic m2-ch-e">${c.emoji ? esc(c.emoji) : ic('hash', 18)}</span><span class="m2-mt"><b>#${esc(c.name)}</b><small>${esc(c.topic || 'Channel')}</small></span>${un[c.id] ? '<span class="m2-n">•</span>' : ''}<span class="m2-info" data-chm="${esc(c.id)}" role="button" aria-label="#${esc(c.name)} options"><svg class="i" style="width:16px;height:16px" aria-hidden="true"><use href="#i-more"/></svg></span></button>`).join('');
    return rows + (T.canManage() ? `<button class="m2-mi" data-talk="newch"><span class="m2-mic">${ic('plus', 18)}</span><span class="m2-mt"><b>New channel</b><small>A place for one topic</small></span></button>` : '');
  }
  // Who answers "@ai" right now (server/askai.js decides when the question is sent)
  const AI_SUB = { mine: r => `${r.label} answers`, theirs: r => `${r.label} answers${r.needsOk ? ' (they tap OK)' : ''}`, brain: () => 'The local model answers right away', queue: () => 'No AI on right now: it waits on the board for the next agent' };
  function askAi() {
    if (DM() && DM().current() !== 'general') DM().back(); App().show('chat');
    setTimeout(() => { const i = $('#chat-input'); if (i) { if (!/^@ai\b/i.test(i.value)) i.value = '@ai ' + i.value.replace(/^@(ai|brain)\s*/i, ''); i.dispatchEvent(new Event('input')); i.focus(); } talkLabel(); }, 60);
  }
  function talk(k) {
    const inp = () => $('#chat-input');
    if (k === 'ai') return askAi();
    if (k === 'flint') return window.TribeFlint && window.TribeFlint.openFull();   // feat/flint
    if (k === 'claude') { const ag = myAgent(); if (ag && DM()) return DM().open(ag.id); App().connectClaude ? App().connectClaude() : ($('#cc-connect') && $('#cc-connect').click()); return; }
    if (k === 'general') { if (DM() && DM().current() !== 'general') DM().back(); App().show('chat'); return setTimeout(talkLabel, 0); }
    if (k === 'brain') { if (DM() && DM().current() !== 'general') DM().back(); App().show('chat'); setTimeout(() => { const i = inp(); if (i) { if (!/^@brain\b/.test(i.value)) i.value = '@brain ' + i.value.replace(/^@brain\s*/, ''); i.dispatchEvent(new Event('input')); i.focus(); } talkLabel(); }, 60); return; }
    if (k === 'manage') return window.TribeAgentsHub && window.TribeAgentsHub.open(document.body.classList.contains('global') ? { global: true } : undefined);
    if (k === 'desktop') { if (window.TribeRepo && window.TribeRepo.sendToDesktop) return window.TribeRepo.sendToDesktop({}); return App().show('repo'); }
    if (k === 'agents') { if (window.TribeCoord) window.TribeCoord.open('agents'); else App().show('coord'); setTimeout(() => { const t = $('#talk-input'); if (t) t.scrollIntoView({ block: 'center' }); }, 400); return; }
    if (k.startsWith('dm:') && DM()) { DM().open(k.slice(3)); setTimeout(talkLabel, 0); }
    if (k.startsWith('ch:') && DM()) { DM().openChannel(k.slice(3)); setTimeout(talkLabel, 0); }   // feat/chat2
    if (k === 'newch' && window.TribeChannels) window.TribeChannels.create();
  }

  // =====================================================================
  // Profile sheet: you (settings, network) or a teammate (message, add friend, network, ask their Claude)
  // =====================================================================
  function profile(id, pane) {
    const m = member(id) || (id === me().id ? me() : null); if (!m) return;
    const mine = m.id === me().id, f = friends(), ag = agentOf(m.id);
    const where = (members().find(x => x.id === m.id) || {}).what || (m.online ? 'online' : 'away');
    const projects = (PJ() && PJ().list ? PJ().list() : []);
    const shared = projects.filter(p => PJ().here && PJ().here(p.id).some(x => (x.id || x) === m.id));
    const PF = window.TribeProfiles, pst = PF && PF.statusOf(member(m.id) || m);   // feat/profiles: status, pronouns, edit / full profile
    const head = `<div class="m2-pf-top">${avatar(member(m.id) || m, 'xl')}<div class="m2-pf-id"><b>${esc(PF ? PF.displayName(member(m.id) || m) : m.name)}</b>${pst ? `<small class="m2-pf-cs">${PF.statusLine(pst)}</small>` : ''}<small><i class="m2-on ${m.online || mine ? 'y' : ''}"></i>${mine ? 'You' : esc(m.online ? 'online' : 'away')}${m.role === 'host' && !window.TribeRoles ? ' · host' : ''}${m.role === 'spectator' ? ' · watching' : ''}${window.TribeRoles ? window.TribeRoles.badge(m) : ''}</small></div></div>`;
    let body;
    if (pane === 'net') {
      body = `<div class="m2-pf-h"><button class="m2-back" data-pf="main" aria-label="Back">${ic('back', 18)}</button>${mine ? 'Your network' : esc(m.name) + "'s network"}</div>
        <div class="m2-pf-sec"><div class="eyebrow">Agents</div>${ag ? `<div class="m2-pf-row">${avatar(ag)}<span><b>${esc(ag.name)}</b><small>${ag.online ? 'online' : 'offline'} · agent</small></span></div>` : `<p class="m2-fine left">No AI connected${mine ? ' yet.' : '.'}</p>`}</div>
        <div class="m2-pf-sec"><div class="eyebrow">Projects</div>${projects.length ? projects.map(p => `<div class="m2-pf-row">${PJ().face(p, 'sm')}<span><b>${esc(p.name)}</b><small>${PJ().here(p.id).length} here</small></span></div>`).join('') : '<p class="m2-fine left">Just this one.</p>'}</div>
        <div class="m2-pf-sec"><div class="eyebrow">People</div>${members().filter(x => x.role !== 'agent' && x.id !== m.id).map(x => `<div class="m2-pf-row">${avatar(x)}<span><b>${esc(x.name)}</b><small>${x.online ? 'online' : 'away'}${f.has(x.id) ? ' · friend' : ''}</small></span></div>`).join('') || '<p class="m2-fine left">Nobody else yet.</p>'}</div>`;
    } else if (mine) {
      body = `${head}
        ${/^(online|away)$/.test(where) ? '' : `<div class="m2-pf-sec"><div class="eyebrow">Status</div><div class="m2-pf-st">${esc(where)}</div></div>`}
        <div class="m2-pf-sec"><div class="eyebrow">Your AI</div>${ag ? `<button class="m2-pf-agent" data-pf="claude">${avatar(ag)}<span><b>${esc(ag.name)}</b><small>${ag.online ? 'online' : 'offline'} · open your private chat</small></span>${ic('right', 16)}</button><button class="m2-pf-more" data-pf="connect">Connect from another computer</button>` : `<button class="m2-pf-agent" data-pf="connect"><span class="m2-av agent">${ic('spark', 14)}</span><span><b>Connect your AI</b><small>Claude Code, Codex, Gemini CLI, Cursor…</small></span>${ic('right', 16)}</button>`}</div>
        <div class="m2-pf-acts">
          <button data-pf="invite">${ic('userplus', 20)}<span>Invite</span></button>
          <button data-pf="net">${ic('net', 20)}<span>Network</span></button>
          <button data-pf="notify">${ic('bell', 20)}<span>Alerts</span></button>
          <button data-pf="settings">${ic('gear', 20)}<span>Settings</span></button>
        </div>
        ${window.TribeProfiles ? '<button class="m2-pf-more" data-pf="editprofile">Edit profile and status</button>' : ''}
        ${window.TribeGuide ? '<button class="m2-pf-more" data-pf="guide">Guide: how to TribeCode</button>' : ''}`;   // feat/vision-guide: tucked under the actions
    } else {
      body = `${head}
        ${/^(online|away)$/.test(where) ? '' : `<div class="m2-pf-sec"><div class="eyebrow">Now</div><div class="m2-pf-st">${esc(where)}</div></div>`}
        ${ag ? `<div class="m2-pf-sec"><div class="eyebrow">Their AI</div><div class="m2-pf-row">${avatar(ag)}<span><b>${esc(ag.name)}</b><small>${ag.online ? 'online' : 'offline'}</small></span></div></div>` : ''}
        <div class="m2-pf-acts">
          <button data-pf="dm">${ic('chat', 20)}<span>Message</span></button>
          <button data-pf="friend" class="${f.has(m.id) ? 'on' : ''}" aria-pressed="${f.has(m.id)}">${ic(f.has(m.id) ? 'usercheck' : 'userplus', 20)}<span>${f.has(m.id) ? 'Friends' : 'Add friend'}</span></button>
          <button data-pf="net">${ic('net', 20)}<span>Network</span></button>
          <button data-pf="ask" ${ag ? '' : 'disabled'}>${ic('spark', 20)}<span>Ask their AI</span></button>
        </div>
        ${window.TribeRoles ? window.TribeRoles.memberActions(m, { cls: 'btn soft' }) : ''}
        ${window.TribeProfiles ? '<button class="m2-pf-more" data-pf="fullprofile">Full profile</button>' : ''}
        ${window.TribePeople ? `<button class="m2-pf-agent m2-pf-activity" data-pf="activity">${ic('net', 18)}<span><b>Activity</b><small>Commits, prompts, chat and notes</small></span>${ic('right', 16)}</button>` : ''}
        ${ag ? '' : `<p class="m2-fine">${esc(m.name)} hasn't connected an AI yet.</p>`}`;
    }
    const el = sheet(`<div class="m2-pf" data-who="${esc(m.id)}">${body}</div>`, { id: 'm2-profile', label: mine ? 'Your profile' : `${m.name}'s profile` });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-pf]'); if (!b || b.disabled) return;
      const k = b.dataset.pf;
      if (k === 'main' || k === 'net') return profile(id, k === 'net' ? 'net' : undefined);
      if (k === 'friend') { const on = !friends().has(m.id); setFriend(m.id, on); return profile(id); }   // the button itself shows the new state
      closeSheet();
      if (k === 'dm') return DM() && DM().open(m.id);
      if (k === 'activity') return window.TribePeople && window.TribePeople.open(m.id);
      if (k === 'editprofile') return window.TribeProfiles.edit();   // feat/profiles
      if (k === 'fullprofile') return window.TribeProfiles.open(m.id);
      if (k === 'claude') return DM() && DM().open(ag.id);
      if (k === 'connect') return App().connectClaude ? App().connectClaude() : $('#cc-connect').click();
      if (k === 'invite') return App().openInvite();
      if (k === 'notify') return window.TribeNotify && window.TribeNotify.openSettings();
      if (k === 'settings') return window.TribeSettings && window.TribeSettings.open();
      if (k === 'guide') return window.TribeGuide && window.TribeGuide.open();
      if (k === 'ask' && ag) {
        if (window.TribeCoord) window.TribeCoord.open('agents'); else App().show('coord');
        const handle = '@' + ag.name + ' ';
        const fill = n => { const t = $('#talk-input'); if (t) { t.value = handle; t.focus(); t.scrollIntoView({ block: 'center' }); } else if (n) setTimeout(() => fill(n - 1), 150); };
        setTimeout(() => fill(12), 120);
      }
    });
  }
  // Tap someone's avatar in chat (or in the people lists) for their profile.
  document.addEventListener('click', e => {
    if (!phone() || !e.target.closest) return;
    const av = !window.TribePeople && e.target.closest('.chat .msg[data-by] > .avatar');   // people.js has its own person sheet for chat
    if (av) { const by = av.parentElement.dataset.by; if (member(by) && member(by).role !== 'agent') { e.preventDefault(); e.stopPropagation(); profile(by); } return; }
    const pp = e.target.closest('.pj-person');
    if (pp) { const name = (pp.children[1] || {}).textContent; const m = members().find(x => x.name === name && x.role !== 'agent'); if (m) profile(m.id); }
  }, true);

  // =====================================================================
  // Updates: approvals that need you (hero, one tap + optional note), then what happened
  // =====================================================================
  let approvals = [], inbox = [], upLoaded = false;
  const pendingMine = () => approvals.filter(a => a.status === 'pending' && ((a.to || []).includes(me().id)));
  async function loadUpdates() {
    if (!C.connected()) return;
    try {
      const [ap, ib] = await Promise.all([C.api('/approvals'), C.api('/notify/inbox').catch(() => ({ items: [] }))]);
      approvals = ap.approvals || []; inbox = (ib.items || []).filter(i => i.type !== 'approval'); upLoaded = true;
    } catch {}
    syncBadges(); if (cur === 'updates') renderUpdates();
  }
  const RISK = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' };
  function apCard(a, open) {
    const decided = a.status !== 'pending';
    return `<article class="m2-ap ${decided ? 'done ' + a.status : ''}" data-ap="${esc(a.id)}">
      <div class="m2-ap-top">${avatar(member(a.by) || { name: a.byName })}<div class="m2-ap-t"><b>${esc(a.title)}</b><small>${esc(a.byName || 'someone')} · <span class="risk ${esc(a.risk)}">${RISK[a.risk] || ''}</span> · ${esc(ago(a.created))}</small></div></div>
      ${a.details ? `<p class="m2-ap-d">${esc(a.details.slice(0, 280))}</p>` : ''}
      ${decided ? `<div class="m2-ap-res">${ic(a.status === 'approved' ? 'check' : 'x', 16)}<span>${a.status === 'closed' ? 'Closed' : `${a.status === 'approved' ? 'Approved' : 'Denied'} by ${esc(a.decidedByName || 'someone')}`}${a.note ? ` · “${esc(a.note)}”` : ''}</span></div>`
        : `<button class="m2-ap-note-btn ${open ? 'hidden' : ''}" data-note>${ic('plus', 14)}Add a comment</button>
        <textarea class="m2-ap-note ${open ? '' : 'hidden'}" rows="2" maxlength="500" placeholder="Optional comment for ${esc(a.byName || 'them')}" aria-label="Comment"></textarea>
        <div class="m2-ap-btns"><button class="deny" data-decide="deny">${ic('x', 18)}Deny</button><button class="approve" data-decide="approve">${ic('check', 18)}Approve</button></div>`}
    </article>`;
  }
  function renderUpdates() {
    const v = ensureUpdatesView(); if (!v) return;
    const pend = pendingMine(), decided = approvals.filter(a => a.status !== 'pending').slice(0, 6);
    const kept = new Map([...v.querySelectorAll('.m2-ap[data-ap] textarea')].map(t => [t.closest('[data-ap]').dataset.ap, { val: t.value, open: !t.classList.contains('hidden') }]));
    v.innerHTML = `
      <section class="m2-sect">
        <div class="sec-head"><span class="eyebrow">Needs you</span><h2>${pend.length ? `${pend.length} approval${pend.length > 1 ? 's' : ''}` : 'Approvals'}</h2></div>
        <div class="hero-card m2-needs">${pend.length ? pend.map(a => apCard(a, (kept.get(a.id) || {}).open)).join('') : `<p class="m2-empty">${upLoaded || !C.connected() ? 'Nothing waiting on you. When an agent needs a person, it lands here.' : 'Loading…'}</p>`}</div>
      </section>
      <section class="m2-sect">
        <div class="sec-head"><span class="eyebrow">Recent</span><h2>What happened</h2></div>
        <div class="m2-feed">${inbox.slice(0, 20).map(i => `<button class="m2-fi ${window.TribeNotify && window.TribeNotify.isUnread && window.TribeNotify.isUnread(i.id) ? 'unread' : ''}" data-fi-id="${esc(i.id)}" data-fi-view="${esc(i.view || '')}" data-fi-ref="${esc(i.ref || '')}">${avatar(member(i.from) || { name: i.fromName || 'TribeCode', color: '#2A313C' })}<span class="m2-ft"><b>${esc(i.title)}</b>${i.body ? `<small>${esc(String(i.body).slice(0, 140))}</small>` : ''}</span><time>${esc(ago(i.at || i.created))}</time></button>`).join('') || '<p class="m2-empty">Quiet so far.</p>'}</div>
      </section>
      ${decided.length ? `<section class="m2-sect"><div class="sec-head"><span class="eyebrow">Decided</span><h2>Approvals</h2></div><div class="m2-decided">${decided.map(a => apCard(a)).join('')}</div></section>` : ''}`;
    kept.forEach((k, aid) => { const t = v.querySelector(`[data-ap="${CSS.escape(aid)}"] textarea`); if (t) t.value = k.val; });
  }
  document.addEventListener('click', async e => {
    if (!e.target.closest) return;
    const nb = e.target.closest('.m2-ap [data-note]');
    if (nb) { const card = nb.closest('.m2-ap'); nb.classList.add('hidden'); const t = card.querySelector('textarea'); t.classList.remove('hidden'); t.focus(); return; }
    const d = e.target.closest('.m2-ap [data-decide]');
    if (d) {
      const card = d.closest('.m2-ap'), aid = card.dataset.ap, t = card.querySelector('textarea'), note = t ? t.value.trim() : '';
      card.classList.add('deciding'); d.classList.add('chosen'); card.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try {
        const { approval } = await C.api(`/approvals/${aid}/${d.dataset.decide}`, { method: 'POST', body: { note } });
        approvals = approvals.map(a => (a.id === approval.id ? approval : a));
        toast(approval.status === 'approved' ? 'Approved' : 'Denied');
        setTimeout(() => { syncBadges(); renderUpdates(); }, 260);
      } catch (err) { toast(err.message); card.classList.remove('deciding'); card.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
      return;
    }
    const fi = e.target.closest('.m2-fi');
    if (fi) { if (fi.classList.contains('unread') && window.TribeNotify && window.TribeNotify.markRead) { fi.classList.remove('unread'); window.TribeNotify.markRead(fi.dataset.fiId); } const v = fi.dataset.fiView; if (v && v !== 'inbox' && v !== 'home') App().show(v); }
  });
  C.on('approval', m => { if (!m.approval) return; const i = approvals.findIndex(a => a.id === m.approval.id); if (i >= 0) approvals[i] = m.approval; else approvals.unshift(m.approval); syncBadges(); if (cur === 'updates' && !document.querySelector('#view-updates .deciding')) renderUpdates(); });
  C.on('notification', m => { if (m.item && !m.pocket && m.item.type !== 'approval' && !inbox.some(x => x.id === m.item.id)) { inbox.unshift(m.item); if (cur === 'updates') renderUpdates(); } });
  C.on('hello', () => { loadUpdates(); paintMe(); paintProject(); });

  // =====================================================================
  // Docs hub (phone): pinned repo hero · living notes · files · screenshots
  // =====================================================================
  let hub = { repo: null, notes: null, shots: null, more: false, at: 0 };
  function docsHub(force) {
    const view = $('#view-docs'), grid = view && view.querySelector('.docs-grid'); if (!grid) return;
    let top = $('#m2-docs-hub');
    if (!top) {
      top = document.createElement('div'); top.id = 'm2-docs-hub'; top.className = 'm2-only m2-hub'; view.insertBefore(top, grid);
      grid.insertAdjacentHTML('beforebegin', '<div class="sec-head m2-only m2-files-h" id="m2-files-h"><span class="eyebrow">Project</span><h2>Files</h2></div>');
      grid.insertAdjacentHTML('afterend', '<section class="m2-only m2-sect" id="m2-shots"></section>');
    }
    renderHub();
    if (force || Date.now() - hub.at > 15000) loadHub();
  }
  async function loadHub() {
    hub.at = Date.now();
    if (window.TribeRepoHero) window.TribeRepoHero.refresh();
    if (!C.connected()) return renderHub();
    const p = PJ() && PJ().cur && PJ().cur();
    const [repo, chat, vis] = await Promise.all([
      p && p.hasRepo ? C.api('/repo').catch(() => null) : Promise.resolve(null),
      C.api('/chat/general?limit=200').catch(() => ({ messages: [] })),
      C.api('/visuals').catch(() => ({ screens: [] })),
    ]);
    hub.repo = repo && repo.status && repo.status.enabled ? repo.status : (p && p.hasRepo ? { enabled: false, name: p.name } : null);
    hub.notes = notesFrom(chat.messages || []);
    hub.shots = vis.screens || [];
    renderHub();
  }
  // The living notes journal: what the project decided, shipped and said, from #general, newest first.
  function notesFrom(msgs) {
    const out = [];
    for (const m of msgs) {
      if (m.deleted) continue;
      const t = String(m.text || ''), sys = m.by === 'tribecode';
      let kind = null;
      if (/decid|decision/i.test(t)) kind = 'decision';
      else if (m.media && m.media.kind === 'voice') kind = 'voice';
      else if (/approved|denied|✅|⛔/.test(t) && sys) kind = 'approval';
      else if (/📎|shared|uploaded|added .* to docs/i.test(t)) kind = 'file';
      else if (sys && /task|done|took|finished|moved/i.test(t)) kind = 'task';
      else if (sys && /joined|started the tribe/i.test(t)) kind = 'join';
      if (!kind) continue;
      out.push({ kind, at: m.at, by: m.by, text: kind === 'voice' ? (t || 'Voice note') : t });
    }
    return out.reverse();
  }
  const KIND = { decision: ['pin', 'Decision'], voice: ['mic-note', 'Voice note'], approval: ['check', 'Approval'], file: ['doc', 'File'], task: ['task', 'Task'], join: ['user', 'People'] };
  function dayLabel(at) {
    const d = new Date(at), t = new Date(), y = new Date(Date.now() - 86400000);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function renderHub() {
    const top = $('#m2-docs-hub'); if (!top) return;
    const p = PJ() && PJ().cur && PJ().cur(), r = hub.repo;
    const md = s => (window.TribeMD ? window.TribeMD.inline(s) : esc(s));
    const hero = '<div id="m2-repo-hero" class="m2-repo"></div>';
    const notes = hub.notes || [], shown = notes.slice(0, hub.more ? 30 : 6);
    let lastDay = '', journal = '';
    for (const n of shown) {
      const dl = dayLabel(n.at); if (dl !== lastDay) { journal += `<div class="m2-jg">${esc(dl)}</div>`; lastDay = dl; }
      const [icn, lab] = KIND[n.kind]; const who = member(n.by);
      journal += `<div class="m2-je"><span class="m2-jk k-${n.kind}" title="${lab}">${ic(icn, 14)}</span><div class="m2-jt"><p>${who && n.by !== 'tribecode' ? `<b>${esc(who.name)}</b> ` : ''}${md(n.text)}</p><small>${esc(new Date(n.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</small></div></div>`;
    }
    top.innerHTML = `${hero}
      <section class="m2-sect">
        <div class="sec-head"><span class="eyebrow">Living notes</span><h2>The project journal</h2></div>
        <div class="m2-journal">${journal || `<p class="m2-empty">${hub.notes ? 'Decisions, voice notes, approvals and files from chat collect here.' : 'Loading…'}</p>`}
        ${notes.length > 6 ? `<button class="m2-more" id="m2-notes-more">${hub.more ? 'Show less' : `Show ${Math.min(24, notes.length - 6)} more`}</button>` : ''}</div>
      </section>`;
    const rh = $('#m2-repo-hero');
    if (rh && window.TribeRepoHero) window.TribeRepoHero.render(rh, { project: p, status: r && r.enabled ? r : null, empty: !(p && p.hasRepo) });
    const mb = $('#m2-notes-more'); if (mb) mb.onclick = () => { hub.more = !hub.more; renderHub(); };
    const sh = $('#m2-shots');
    if (sh) {
      const shot = x => { const u = `${C.base()}/api/visuals/${x.screen}/${x.ts}.png`; return (window.TribeMedia ? window.TribeMedia.url(u) : u); };   // fix/security-2: signed link, not the sign-in key
      const list = hub.shots || [];
      sh.innerHTML = `<div class="sec-head"><span class="eyebrow">Screenshots</span><h2>How it looks</h2></div>
        ${list.length ? `<div class="m2-shots m2-hscroll">${list.map(s => `<button class="m2-shot" data-preview-img="${esc(shot(s.latest))}" data-preview-title="${esc(s.name)}"><img alt="" loading="lazy" src="${esc(shot(s.latest))}"><span><b>${esc(s.name)}</b><small>${s.count} version${s.count === 1 ? '' : 's'}</small></span></button>`).join('')}</div>`
        : `<p class="m2-empty">${hub.shots ? 'No screenshots yet. Agents add them as the app changes, or tap below.' : 'Loading…'}</p>`}
        <button class="btn m2-wide" data-nav="visuals">Open screenshots</button>`;
    }
  }
  C.on('ws', m => { if ((m.type === 'visual' || m.type === 'visual-removed') && cur === 'docs' && phone()) { hub.at = 0; docsHub(); } });
  C.on('repo', m => { if (hub.repo !== null && m.status) { hub.repo = m.status; if (cur === 'docs') renderHub(); } });
  C.on('chat', () => { if (cur === 'docs' && phone()) { clearTimeout(hub.t); hub.t = setTimeout(() => { hub.at = 0; docsHub(); }, 800); } });

  // =====================================================================
  // Suggested tasks (Tasks and Home): today's plan for you, else open unassigned tasks
  // =====================================================================
  let sugg = { items: null, at: 0 };
  async function loadSugg() {
    sugg.at = Date.now();
    let items = [];
    if (C.connected()) {
      try {
        const { plan } = await C.api('/coord/plan');
        const mine = (plan.items || []).filter(i => i.member === me().id && !i.keep), rest = (plan.items || []).filter(i => i.member !== me().id && !i.keep && i.kind === 'person');
        items = [...mine, ...rest].map(i => ({ id: i.task, title: i.title, why: i.member === me().id ? (i.why || 'suggested for you') : `suggested for ${i.name}` }));
      } catch {}
    }
    if (!items.length) {
      const all = (window.TribeTasks && window.TribeTasks.all()) || [];
      items = all.filter(t => t.status === 'backlog' && !t.assignee).slice(0, 4).map(t => ({ id: t.id, title: t.title, why: 'open, nobody on it yet' }));
    }
    const all = (window.TribeTasks && window.TribeTasks.all()) || [];
    sugg.items = items.filter(i => { const t = all.find(x => x.id === i.id); return !t || (t.status !== 'done' && !t.assignee); }).slice(0, 4);
  }
  async function suggested(view, force) {
    const host = view === 'tasks' ? $('#view-tasks') : $('#view-home'); if (!host) return;
    const id = 'm2-sugg-' + view;
    let box = document.getElementById(id);
    if (!box) {
      box = document.createElement('section'); box.id = id; box.className = 'm2-only m2-sect m2-sugg';
      if (view === 'tasks') { const head = host.querySelector('.view-head'); head ? head.insertAdjacentElement('afterend', box) : host.prepend(box); }
      else { const ov = $('#pj-overview'); ov ? ov.insertAdjacentElement('afterend', box) : host.prepend(box); }
    }
    renderSugg(box, view);
    if (force || !sugg.items || Date.now() - sugg.at > 10000) { await loadSugg(); $$('.m2-sugg').forEach(b => renderSugg(b, b.id.replace('m2-sugg-', ''))); }
  }
  function renderSugg(box, view) {
    const items = sugg.items || [], ag = myAgent();
    if (view === 'tasks') {   // v0.28: the Task Board is the hero here; one slim "Up next" line, no second add box (the board has one)
      const top = items.slice(0, 2);
      box.classList.add('m2-sugg--slim');
      box.innerHTML = top.length ? `<div class="m2-sl">${top.map(i => `<div class="m2-si m2-si--slim" data-st="${esc(i.id)}"><span class="m2-si-k">Up next</span><b class="m2-si-tt">${esc(i.title)}</b><button class="take" data-take>${ic('hand', 15)}Take it</button>${ag ? `<button class="claude" data-give aria-label="Give to my AI" title="Give to my AI">${ic('spark', 15)}</button>` : ''}</div>`).join('')}</div>` : '';
      box.hidden = !top.length && !(window.TribeAssist && (window.TribeTasks && window.TribeTasks.all() || []).length < 3);
      if (window.TribeAssist) window.TribeAssist.ideas(box, { compact: true });
      return;
    }
    box.innerHTML = `<div class="sec-head"><span class="eyebrow">Suggested</span><h2>Up next</h2></div>
      <div class="m2-sl">${items.map(i => `<div class="m2-si" data-st="${esc(i.id)}"><div class="m2-si-t"><b>${esc(i.title)}</b><small>${esc(i.why)}</small></div>
        <div class="m2-si-b"><button class="take" data-take>${ic('hand', 16)}Take it</button>${ag ? `<button class="claude" data-give>${ic('spark', 15)}Give to my AI</button>` : ''}</div></div>`).join('')
        || `<p class="m2-empty">${sugg.items ? 'Nothing open. Suggest something below.' : 'Loading…'}</p>`}</div>
      <form class="m2-quick" data-sugg-form><input maxlength="140" placeholder="Suggest a task…" enterkeyhint="done" autocomplete="off" aria-label="Suggest a task"><button class="m2-go" aria-label="Add suggestion">${ic('up', 18)}</button></form>`;
    if (view === 'tasks' && window.TribeAssist) window.TribeAssist.ideas(box, { compact: true });   // feat/assist: ideas from the vision, template and repo
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('.m2-si [data-take], .m2-si [data-give]'); if (!b) return;
    const id = b.closest('[data-st]').dataset.st, ag = myAgent();
    const to = b.hasAttribute('data-give') && ag ? ag.id : me().id;
    b.closest('.m2-si').classList.add('taken');
    try {
      if (!(window.TribeTasks.all() || []).some(t => t.id === id)) await window.TribeTasks.load();
      await window.TribeTasks.patch(id, { assignee: to, status: 'doing' });
      toast(to === me().id ? 'Yours. Moved to Doing.' : `${ag.name} has it`);
    } catch (err) { toast(err.message); }
    sugg.items = (sugg.items || []).filter(i => i.id !== id);
    setTimeout(() => $$('.m2-sugg').forEach(x => renderSugg(x, x.id.replace('m2-sugg-', ''))), 220);
  });
  document.addEventListener('submit', async e => {
    const f = e.target.closest && e.target.closest('[data-sugg-form]'); if (!f) return;
    e.preventDefault(); const inp = f.querySelector('input'), v = inp.value.trim(); if (!v) return;
    inp.value = '';
    try { await window.TribeTasks.create(v, 'backlog'); toast('Suggested. It is in Backlog.'); suggested(cur === 'home' ? 'home' : 'tasks', true); } catch (err) { toast(err.message); inp.value = v; }
  });
  C.on('task', () => { if (phone() && (cur === 'tasks' || cur === 'home')) { clearTimeout(sugg.t); sugg.t = setTimeout(() => suggested(cur, true), 600); } });

  // =====================================================================
  // boot
  // =====================================================================
  function boot() {
    buildRack(); topBar(); swipe(); ensureUpdatesView(); composer();
    // Host uptime + commits today (people.js) belongs in the sidebar footer.
    // Desktop: it's a global fact, so it sits small at the bottom of the left rail, not in a project's tools.
    const desk = matchMedia('(min-width: 821px)').matches, foot = desk ? $('#tour-rail') : $('.nest-foot');
    if (desk) { const d = $('#people-status'); if (d) d.remove(); }   // desktop: no uptime line ("up 0m") anywhere
    else if (foot && window.TribePeople && window.TribePeople.statusLine && !$('#nest-status')) {
      const el = document.createElement('div'); el.id = 'nest-status'; if (desk) el.className = 'rail-status'; foot.appendChild(el); window.TribePeople.statusLine(el);
      const d = $('#people-status'); if (d) d.remove();
    }
    const watch = (id, fn) => { const el = document.getElementById(id); if (el) new MutationObserver(fn).observe(el, { childList: true, characterData: true, subtree: true, attributes: true }); };
    ['nn-chat', 'nf-count', 'nn-tasks'].forEach(id => watch(id, syncBadges));
    watch('nest-name', paintProject); watch('nest-sub', paintProject); watch('pj-switch', paintProject);
    const head = $('#chat-head') || $('.chat-title'); if (head) new MutationObserver(talkLabel).observe(head, { childList: true, subtree: true });
    C.on('presence', () => { paintProject(); paintMe(); });
    let wasHome = null; new MutationObserver(() => { const h = document.body.classList.contains('global'); if (h !== wasHome) { wasHome = h; paintProject(); homeMode(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });   // Home ⇄ project
    C.on('project', () => { hub = { repo: null, notes: null, shots: null, more: false, at: 0 }; sugg = { items: null, at: 0 }; paintProject(); if (phone() && cur === 'docs') docsHub(true); });
    cur = (App() && App().view && App().view()) || 'home';
    onShow(cur); syncBadges();
    mq.addEventListener('change', () => { if (phone()) onShow(cur); });
    if (C.connected()) loadUpdates();
  }
  window.TribeMobile = { show, onShow, profile, myProfile: () => profile(me().id), talkTo, startTribe: typeof startTribe === 'function' ? startTribe : undefined, projectsSheet: typeof projectsSheet === 'function' ? projectsSheet : undefined, askAi, plusMenu, recorder, closeSheet, refresh: () => { loadUpdates(); hub.at = 0; if (cur === 'docs') docsHub(true); if (cur === 'tasks' || cur === 'home') suggested(cur, true); } };
  // Phone: while the drawer (rail + nest) is closed it sits off-screen; keep its controls out of the Tab order
  // and away from screen readers (found by scripts/explore.py: 15+ invisible focusable controls).
  const phoneMq = matchMedia('(max-width: 820px)');
  const drawerInert = () => { const closed = phoneMq.matches && !document.body.classList.contains('drawer-open'); ['#tour-rail', '#tour-side'].forEach(s => { const el = document.querySelector(s); if (el && el.inert !== closed) el.inert = closed; }); };
  new MutationObserver(drawerInert).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  phoneMq.addEventListener('change', drawerInert); drawerInert();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
