// App shell: theme, profile, Home checklist, drop zone, and hooks used by onboarding/tour/updater.
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore;
  const params = new URLSearchParams(location.search);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#38C6B1', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');
  const drops = [];
  let serverBrain = null;     // brain status reported by the tribe host          // files dropped this session (unsaved until saveAll)
  const mq = matchMedia('(prefers-color-scheme: light)');

  // Optional demo room so the hand-off flow has someone to hand off to (?demo=1)
  const demo = params.has('demo') ? {
    peers: [{ id: 'maya', name: 'Maya' }, { id: 'jay', name: 'Jay' }],
    agentRuns: [{ id: 'run-fishing', task: 'Fishing mini-game' }],
    claims: [{ id: 'claim-1', path: 'src/world/campfire.ts' }],
  } : { peers: [], agentRuns: [], claims: [] };

  function applyTheme(t) {
    const mode = t === 'system' ? (mq.matches ? 'light' : 'dark') : t;
    document.body.classList.toggle('dark', mode === 'dark');
    document.body.classList.toggle('light', mode === 'light');
  }
  mq.addEventListener('change', () => { if (S.get().theme === 'system') applyTheme('system'); });

  const CHECKS = [
    { key: 'setup', label: 'Set up this computer', go: 'Open', run: () => window.TribeOnboarding.open({ fromSettings: true }) },
    { key: 'tour', label: 'Take the 60-second tour', go: 'Start', run: () => window.TribeTour.start() },
    { key: 'drop', label: 'Drop your first file into the drop zone', go: 'Show me', run: () => { const d = $('#dropzone'); d.classList.add('over'); d.scrollIntoView({ block: 'center' }); setTimeout(() => d.classList.remove('over'), 1400); } },
    { key: 'brain', label: 'Connect a local brain (Ollama + Qwen)', go: 'Connect', run: async () => { await window.TribeOnboarding.open({ fromSettings: true }); window.TribeOnboarding.goTo(4); } },
    { key: 'invite', label: 'Invite a friend', go: 'Invite', run: () => openInvite() },
  ];

  function refresh() {
    const st = S.get();
    applyTheme(st.theme);
    document.body.classList.toggle('compact', st.density === 'compact');
    const first = (st.name || '').split(' ')[0];
    $('#hello').textContent = first ? `Welcome, ${first}` : 'Welcome';
    const tribeName = window.TribeClient && window.TribeClient.state().tribe && window.TribeClient.state().tribe.name;
    $('#ws-name').textContent = tribeName || (first ? `${first}'s Tribe` : 'My Tribe');
    for (const id of ['#me-avatar', '#room-me']) { const a = $(id); if (!a) continue; a.textContent = initials(st.name); a.style.background = st.color; a.style.color = ink(st.color); }
    if ($('#room-name')) $('#room-name').textContent = st.name || 'You';
    $('#folder-label').textContent = st.folder || 'Not set';
    $('#brain-label').textContent = serverBrain && serverBrain.online ? `${serverBrain.model} · host` : st.brain.enabled ? `${st.brain.model} · local` : 'brain off';

    const done = CHECKS.filter(c => st.checklist[c.key]).length;
    $('#check-count').textContent = `${done} of ${CHECKS.length}`;
    $('#check-bar').style.width = (done / CHECKS.length * 100) + '%';
    $('#checklist').innerHTML = CHECKS.map(c => `
      <button class="check ${st.checklist[c.key] ? 'done' : ''}" data-check="${c.key}">
        <span class="box">${st.checklist[c.key] ? '<svg class="i" style="width:13px;height:13px;stroke-width:2.4"><use href="#i-tick"/></svg>' : ''}</span>
        <span class="label">${c.label}</span><span class="go">${c.go} →</span></button>`).join('');
    document.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', () => CHECKS.find(c => c.key === b.dataset.check).run()));
  }

  let toastTimer;
  function toast(msg) {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  // drop zone
  const dz = $('#dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('over');
    const files = [...e.dataTransfer.files];
    const url = e.dataTransfer.getData('text/uri-list');
    if (url) files.push({ name: url, size: 0 });
    const real = [...e.dataTransfer.files];
    if (url && !real.length) {
      window.TribeDocs.create(url.replace(/^https?:\/\//, '').slice(0, 60), `Link: ${url}\n\n> Google Docs import arrives with the Drive connector. Paste the text below for now.\n`, url).then(() => show('docs'));
      S.set({ checklist: { drop: true } }); refresh(); return;
    }
    if (!real.length) return;
    real.forEach(f => drops.push({ name: f.name, size: f.size, saved: true }));
    renderDrops();
    window.TribeDocs.importFiles(real).then(() => show('docs'));
  });
  function renderDrops() {
    $('#drops').innerHTML = drops.slice(-4).map(d => `<div><svg class="i" style="width:15px;height:15px;color:var(--accent-2)"><use href="#i-doc"/></svg><span>${esc(d.name)}</span><span class="faint" style="margin-left:auto">${d.saved ? 'saved' : 'queued'}</span></div>`).join('');
  }

  // nav + views
  const VIEWS = { home: 'Home', docs: 'Docs', tasks: 'Tasks', board: 'Board', bugs: 'Bugs', repo: 'Repo' };
  function show(view) {
    if (!VIEWS[view]) return;
    document.body.classList.remove('mobile-chat', 'drawer-open');
    Object.keys(VIEWS).forEach(v => $('#view-' + v).classList.toggle('hidden', v !== view));
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === view));
    const isPhone = () => matchMedia('(max-width: 820px)').matches;
  $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('drawer-open'));
  document.addEventListener('click', e => { if (document.body.classList.contains('drawer-open') && !e.target.closest('.side') && !e.target.closest('#menu-btn')) document.body.classList.remove('drawer-open'); });
  document.querySelectorAll('[data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === view && !b.textContent.includes('Milestones')));
    document.querySelector('.titlebar .faint').textContent = '/ ' + VIEWS[view];
    if (view === 'tasks') window.TribeTasks.load();
    if (view === 'board') window.TribeBoard.load();
    if (view === 'docs') window.TribeDocs.load();
    if (view === 'bugs') window.TribeBugs.load();
    if (view === 'repo') window.TribeRepo.load();
    window.TribeClient.sendActivity(VIEWS[view]);
    try { sessionStorage.setItem('tribecode.view', view); } catch {}
  }
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    if (VIEWS[b.dataset.nav]) show(b.dataset.nav);
    else if (b.dataset.nav === 'chat') { if (isPhone()) { document.body.classList.add('mobile-chat'); document.querySelectorAll('[data-nav]').forEach(x => x.classList.toggle('on', x === b)); $('#chat-list').scrollTop = 1e9; } else $('#chat-input').focus(); }
    else if (b.dataset.nav === 'brain') { show('home'); document.querySelector('#standup-card').scrollIntoView({ block: 'center' }); }
  }));

  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('drawer-open'));
  document.addEventListener('click', e => { if (document.body.classList.contains('drawer-open') && !e.target.closest('.side') && !e.target.closest('#menu-btn')) document.body.classList.remove('drawer-open'); });
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    if (VIEWS[b.dataset.go]) show(b.dataset.go);
  }));

  // ---- live room + chat ----
  const C = window.TribeClient;
  const nameOf = id => { if (id === 'tribecode') return 'TribeCode'; const m = (C.state().members || []).find(x => x.id === id); return m ? m.name : 'someone'; };
  const colorOf = id => { const m = (C.state().members || []).find(x => x.id === id); return m ? m.color : '#6C7CFF'; };
  const md = t => window.TribeMD.inline(t).replace(/\n/g, '<br>');
  function renderRoom(list) {
    const st = S.get();
    if (!C.hasToken() || !list || !list.length) return;
    const on = list.filter(m => m.online).length;
    $('#room-count').textContent = `· ${on} online`;
    const meId = (C.state().me || {}).id;
    const shown = list.filter(m => m.role !== 'agent' || m.online || m.owner === meId);
    $('#room-list').innerHTML = shown.slice().sort((a, b) => b.online - a.online || (a.role === 'agent') - (b.role === 'agent')).map(m => `
      <div class="person ${m.online ? 'on' : ''} ${m.role === 'agent' ? 'agent' : ''}" data-follow="${esc(m.id)}" title="${m.online && m.id !== meId && m.role !== 'agent' ? 'Click to follow ' + esc(m.name) : ''}">
      <div class="avatar" style="background:${m.role === 'agent' ? 'var(--surface-3)' : esc(m.color)};color:${ink(m.color)}">${m.role === 'agent' ? '🤖' : esc(initials(m.name))}<span class="st"></span></div>
      <div><span>${esc(m.name)}${meId === m.id ? ' <span class="faint">(you)</span>' : ''}${(C.state().huddle || []).some(h => h.id === m.id) ? ' <span title="In the huddle">🎙️</span>' : ''}</span><div class="what">${m.online ? (m.role === 'agent' ? '<span class="ok">agent</span> · ' : '<span class="ok">online</span> · ') + esc(m.where || 'Home') : m.role === 'agent' ? 'agent · idle' : 'offline'}${m.role === 'host' ? ' · host' : ''}</div></div></div>`).join('');
    $('#room-list').querySelectorAll('[data-follow]').forEach(el => el.onclick = () => follow(el.dataset.follow));
    $('#room-hint').classList.toggle('hidden', list.length > 1);
    $('#room-hint').textContent = 'Invite friends to see them here.';
  }
  function follow(mid) {
    const m = (C.state().members || []).find(x => x.id === mid);
    if (!m || !m.online || m.role === 'agent' || m.id === (C.state().me || {}).id) return;
    const w = m.where || 'Home', view = Object.keys(VIEWS).find(k => w.startsWith(VIEWS[k])) || 'home';
    show(view);
    const doc = w.match(/^Docs · (.+)$/);
    if (doc) C.api('/docs').then(({ docs }) => { const d = docs.find(x => x.title === doc[1]); if (d) window.TribeDocs.open(d.slug); }).catch(() => {});
    toast(`Following ${m.name} to ${w}`);
  }
  function renderClaims(list) {
    const meId = (C.state().me || {}).id;
    $('#claims-box').classList.toggle('hidden', !list || !list.length);
    $('#claims-list').innerHTML = (list || []).map(c => `<div class="claim"><svg class="i" style="width:14px;height:14px;color:var(--amber)"><use href="#i-folder"/></svg>
      <code title="${esc(c.note || '')}">${esc(c.path)}</code><span class="faint">${esc(c.name)}</span>${c.by === meId ? `<button class="linkish" data-unclaim="${esc(c.id)}">release</button>` : ''}</div>`).join('');
    $('#claims-list').querySelectorAll('[data-unclaim]').forEach(b => b.onclick = () => C.api('/claims/' + b.dataset.unclaim, { method: 'DELETE' }).catch(e => toast(e.message)));
  }
  async function connectClaude() {
    if (!C.connected()) return openInvite();
    const body = $('#invite-body'); $('#invite-modal').classList.remove('hidden');
    body.innerHTML = '<h2>Connect your Claude Code</h2><p class="lead">Creating a key…</p>';
    try {
      const r = await C.api('/agents', { method: 'POST' });
      body.innerHTML = `<h2>Connect your Claude Code</h2>
        <p class="lead">Run this once in a terminal. Your Claude Code joins the tribe as <b>${esc(r.agent.name)}</b>: it sees the board, docs, chat and VISION.md, claims files before editing, and shows up in the room while it works.</p>
        <div class="linkbox"><code id="cc-cmd" title="${esc(r.command)}">${esc(r.command)}</code><button class="btn primary" id="cc-copy">Copy</button></div>
        <p class="faint" style="font-size:12px;line-height:1.5">${r.tools.length} tools: ${r.tools.map(esc).join(', ')}. Making a new key replaces the old one. Agents can't vote or invite people.</p>
        <div class="modal-foot"><button class="btn" data-close>Done</button></div>`;
      $('#cc-copy').onclick = async () => { try { await navigator.clipboard.writeText(r.command); toast('Command copied. Paste it in your terminal.'); } catch { getSelection().selectAllChildren($('#cc-cmd')); } };
    } catch (e) { body.innerHTML = `<h2>Couldn't create a key</h2><p class="lead">${esc(e.message)}</p><div class="modal-foot"><button class="btn" data-close>Close</button></div>`; }
    body.querySelector('[data-close]').onclick = closeInvite;
  }
  $('#cc-connect').addEventListener('click', () => connectClaude());
  C.on('claims', renderClaims);
  C.on('hello', () => C.api('/claims').then(r => { C.state().claims = r.claims; renderClaims(r.claims); }).catch(() => {}));

  function chatHtml(m) {
    const sys = m.by === 'tribecode', when = new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `<div class="msg ${sys ? 'sys' : ''}"><div class="avatar" style="background:${sys ? 'var(--surface-3)' : esc(colorOf(m.by))};color:${sys ? 'var(--accent-2)' : ink(colorOf(m.by))}">${sys ? '🔥' : esc(initials(nameOf(m.by)))}</div>
      <div><b>${esc(nameOf(m.by))}</b><time>${when}</time><p>${md(m.text)}</p></div></div>`;
  }
  // Chat sticks to the newest message unless you've scrolled up to read history.
  let readingHistory = false;
  $('#chat-list').addEventListener('scroll', () => { const l = $('#chat-list'); readingHistory = l.scrollTop + l.clientHeight < l.scrollHeight - 60; }, { passive: true });
  new ResizeObserver(() => { if (!readingHistory) $('#chat-list').scrollTop = 1e9; }).observe($('#chat-list'));
  async function loadChat() {
    try {
      const { messages } = await C.api('/chat/general?limit=100');
      $('#chat-list').innerHTML = messages.length ? messages.map(chatHtml).join('') : '<div class="empty-room">Say hi 👋</div>';
      $('#chat-list').scrollTop = 1e9;
    } catch {}
  }
  async function refreshBrain() {
    if (!C.connected()) return;
    try {
      const { brain } = await C.api('/brain');
      serverBrain = brain; refresh();
      $('#brain-status').title = brain.online ? 'Local brain running on the tribe host' : brain.error;
    } catch {}
  }
  $('#standup-go').addEventListener('click', async () => {
    const b = $('#standup-go'), out = $('#standup-text');
    if (!C.connected()) { toast('Standups use the host\'s local brain. Start or join a tribe first.'); return; }
    b.disabled = true; b.textContent = 'Writing…'; out.innerHTML = '';
    try { const { text } = await C.api('/brain/standup', { method: 'POST' }); out.innerHTML = window.TribeMD.render(text); b.textContent = 'Rewrite standup'; }
    catch (e) { out.innerHTML = `<p class="faint">${esc(e.status === 503 ? 'The local brain is off on the host. Install Ollama and run: ollama pull qwen3' : e.message)}</p>`; b.textContent = "Write today's standup"; }
    b.disabled = false;
  });
  C.on('presence', renderRoom);
  C.on('hello', refreshBrain);
  C.on('hello', () => { loadChat(); refresh(); });
  C.on('chat', ({ channel, message }) => {
    if (channel !== 'general') return;
    const list = $('#chat-list'); if (list.querySelector('.empty-room')) list.innerHTML = '';
    list.insertAdjacentHTML('beforeend', chatHtml(message));
    if (!readingHistory) list.scrollTop = 1e9;
  });
  C.on('status', s => {
    const label = { online: 'connected', connecting: 'connecting…', reconnecting: 'reconnecting…', offline: 'local only' }[s.status];
    const dot = { online: 'var(--accent-2)', connecting: 'var(--amber)', reconnecting: 'var(--amber)', offline: 'var(--faint)' }[s.status];
    $('#sync-status').innerHTML = `<span class="dot" style="background:${dot}"></span>${label}`;
    $('#chat-form').classList.toggle('disabled', s.status !== 'online');
    $('#chat-input').placeholder = s.status === 'online' ? 'Message the tribe…' : 'Connect to a tribe to chat';
  });
  $('#chat-form').addEventListener('submit', async e => {
    e.preventDefault();
    const inp = $('#chat-input'), text = inp.value.trim(); if (!text) return;
    if (!C.connected()) return openInvite();
    inp.value = '';
    try { await C.api('/chat/general', { method: 'POST', body: { text } }); } catch (err) { inp.value = text; toast(err.message); }
  });

  // ---- invites ----
  async function openInvite() {
    const body = $('#invite-body');
    $('#invite-modal').classList.remove('hidden');
    if (!C.connected()) {
      const desktop = window.TribeHost.isDesktop;
      body.innerHTML = `<h2>Start or join a tribe</h2>
        <p class="lead">A tribe lives on one member's computer, the host. Everyone else joins with an invite link.</p>
        ${desktop ? `<button class="btn primary" id="host-here" style="width:100%;height:44px;margin-bottom:6px">Host a tribe on this computer</button>
          <p class="faint" style="font-size:12px;margin-bottom:16px">Files are stored in ${esc(S.get().folder || '~/TribeCode')}. TribeCode keeps hosting while the app is open.</p>`
        : `<ol class="steps-host"><li>On the host computer run <span class="code" style="display:inline-block;padding:3px 8px">npm start</span> (or use the desktop app)</li>
          <li>Open <b>http://localhost:4747</b> there. You'll be the host.</li><li>Click <b>Invite friends</b> to get a link.</li></ol>`}
        <div class="field" style="margin-top:6px"><label for="join-link">Got an invite link from a friend?</label>
          <div class="folder"><input class="input" id="join-link" placeholder="http://192.168.1.20:4747/join/k7Qx2"><button class="btn ${desktop ? '' : 'primary'}" id="join-go">Join</button></div></div>
        <div class="modal-foot"><button class="btn" data-close>Close</button></div>`;
      $('#join-go').onclick = () => joinLink($('#join-link').value);
      $('#join-link').onkeydown = e => { if (e.key === 'Enter') joinLink($('#join-link').value); };
      if (desktop) $('#host-here').onclick = hostHere;
    } else {
      body.innerHTML = `<h2>Invite friends</h2><p class="lead">Anyone with this link can join <b>${esc((C.state().tribe || {}).name || 'your tribe')}</b>. They pick a name and they're in.</p>
        <div class="opts"><select id="inv-hours" title="Link expires after"><option value="24">24 hours</option><option value="168">7 days</option><option value="1">1 hour</option></select>
          <select id="inv-uses" title="How many people can use it"><option value="5">5 people</option><option value="1">1 person</option><option value="20">20 people</option></select>
          <select id="inv-role" title="Builders can edit; spectators can only watch"><option value="builder">Builder</option><option value="spectator">Spectator</option></select></div>
        <div class="linkbox"><code id="inv-link">Creating link…</code><button class="btn primary" id="inv-copy" disabled>Copy</button></div>
        <div class="qr-wrap"><div class="qr" id="inv-qr"></div><p><b>On a phone?</b> Point the camera at this code to join. On iPhone, tap Share → <b>Add to Home Screen</b> afterwards to get the app.<br><span class="faint" id="inv-net"></span></p></div>
        <div class="modal-foot"><button class="btn" data-close>Done</button></div>`;
      const make = async () => {
        $('#inv-copy').disabled = true; $('#inv-link').textContent = 'Creating link…';
        try {
          const { invite } = await C.api('/invites', { method: 'POST', body: { hours: +$('#inv-hours').value, maxUses: +$('#inv-uses').value, role: $('#inv-role').value } });
          // localhost links only work on this computer: share the network address instead
          let base = C.base(), note = '';
          // a public https address ("Share beyond my Wi-Fi") always wins; it comes first in /api/health lan
          try { const h = await C.api('/health'); const pick = (h.lan || [])[0];
            if (pick && (pick.kind === 'public' || /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(base))) { base = pick.url; note = pick.kind === 'public' ? 'Public https address: works from anywhere, and voice works on phones.' : pick.kind === 'tailscale' ? 'Tailscale address: works from anywhere your friend is signed in to Tailscale.' : 'Wi-Fi address: your friend needs to be on the same network (or use Tailscale).'; } }
          catch {}
          const link = `${base}/join/${invite.code}`;
          $('#inv-link').textContent = link; $('#inv-copy').disabled = false;
          $('#inv-qr').innerHTML = window.TribeQR.svg(link); $('#inv-net').textContent = note;
          S.set({ checklist: { invite: true } }); refresh();
        } catch (e) { $('#inv-link').textContent = 'Could not create invite: ' + e.message; }
      };
      ['#inv-hours', '#inv-uses', '#inv-role'].forEach(s => $(s).addEventListener('change', make));
      $('#inv-copy').onclick = async () => { try { await navigator.clipboard.writeText($('#inv-link').textContent); toast('Invite link copied'); } catch { getSelection().selectAllChildren($('#inv-link')); toast('Press Ctrl+C to copy'); } };
      make();
    }
    body.querySelectorAll('[data-close]').forEach(b => b.onclick = closeInvite);
  }
  const closeInvite = () => $('#invite-modal').classList.add('hidden');

  // ---- join from a link (pasted, or a tribecode:// deep link) without leaving the app ----
  function parseInvite(raw) {
    const v = String(raw || '').trim();
    let m = v.match(/^(https?:\/\/[^/\s]+)\/join\/([A-Za-z0-9]{3,16})\/?$/);
    if (m) return { server: m[1], code: m[2] };
    try {
      const u = new URL(v);
      if (u.protocol === 'tribecode:') {
        const code = u.searchParams.get('code') || u.pathname.replace(/^\/+/, '').split('/').pop();
        const server = u.searchParams.get('server');
        if (server && /^https?:\/\//.test(server) && /^[A-Za-z0-9]{3,16}$/.test(code)) return { server: server.replace(/\/$/, ''), code };
      }
    } catch {}
    return null;
  }
  async function joinLink(raw) {
    const inv = parseInvite(raw);
    if (!inv) return toast('Paste the full invite link, e.g. http://host:4747/join/abc12');
    if (location.protocol.startsWith('http') && inv.server !== location.origin) { location.href = `${inv.server}/join/${inv.code}`; return; }
    const body = $('#invite-body'); $('#invite-modal').classList.remove('hidden');
    body.innerHTML = '<h2>Checking invite…</h2>';
    let info;
    try { const r = await fetch(`${inv.server}/api/invites/${inv.code}`); info = await r.json(); if (!r.ok) throw new Error(info.error); }
    catch (e) { body.innerHTML = `<h2>This invite doesn't work</h2><p class="lead">${esc(e.message === 'invite expired' ? 'It has expired. Ask your friend for a fresh link.' : "Couldn't reach the tribe. Check the link, and that you're on the same network or Tailscale.")}</p><div class="modal-foot"><button class="btn" data-close>Close</button></div>`; body.querySelector('[data-close]').onclick = closeInvite; return; }
    const st = S.get(), current = C.state().tribe;
    body.innerHTML = `<h2>Join ${esc(info.tribe)}</h2><p class="lead">${esc(info.invitedBy)} invited you${info.role === 'spectator' ? ' to watch' : ''}. No account needed.</p>
      ${current && current.name !== info.tribe ? `<p class="faint" style="font-size:12.5px;margin-bottom:12px">You'll switch from ${esc(current.name)}. You can rejoin it later with its link.</p>` : ''}
      <div class="field"><label for="jn-name">Your name</label><input class="input" id="jn-name" maxlength="32" value="${esc(st.name || '')}"></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="jn-go">Join the tribe</button></div>`;
    body.querySelector('[data-close]').onclick = closeInvite;
    $('#jn-name').focus();
    $('#jn-go').onclick = async () => {
      const name = $('#jn-name').value.trim(); if (!name) return $('#jn-name').focus();
      $('#jn-go').disabled = true;
      try {
        const r = await fetch(`${inv.server}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: inv.code, name, color: st.color }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error);
        S.set({ name, server: { url: inv.server, token: d.token }, hosting: false });
        closeInvite(); C.connect(); refresh(); toast(`Welcome to ${info.tribe}!`);
      } catch (e) { toast(e.message); $('#jn-go').disabled = false; }
    };
  }

  // ---- desktop: host the tribe server on this computer (bundled sidecar) ----
  async function hostHere({ quiet = false } = {}) {
    const st = S.get(), inv = window.__TAURI__ && window.__TAURI__.core;
    if (!inv) return;
    const btn = $('#host-here'); if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
    try {
      const url = await inv.invoke('host_start', { port: 4747, dir: st.folder || '', name: `${(st.name || 'My').split(' ')[0]}'s Tribe` });
      for (let i = 0; i < 40; i++) { try { const r = await fetch(url + '/api/health'); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
      const keep = st.server && st.server.url === url ? st.server.token : '';
      S.set({ server: { url, token: keep }, hosting: true });
      const role = await C.ensureMember({ name: st.name, color: st.color });
      C.connect(); refresh();
      if (!quiet) { closeInvite(); toast(role === 'host' ? "You're hosting! Now invite your friends." : 'Hosting again on this computer.'); setTimeout(openInvite, 600); }
    } catch (e) { toast(String(e)); if (btn) { btn.disabled = false; btn.textContent = 'Host a tribe on this computer'; } }
  }

  // tribecode:// links: on launch and while running (single-instance forwards them here)
  (async () => {
    const dl = window.__TAURI__ && window.__TAURI__.deepLink;
    if (!dl) return;
    try { const urls = await dl.getCurrent(); if (urls && urls[0]) joinLink(urls[0]); } catch {}
    try { await dl.onOpenUrl(urls => urls && urls[0] && joinLink(urls[0])); } catch {}
  })();
  $('#invite-modal').addEventListener('click', e => { if (e.target.id === 'invite-modal') closeInvite(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInvite(); });
  $('#settings-btn').addEventListener('click', () => window.TribeOnboarding.open({ fromSettings: true }));
  $('#help-btn').addEventListener('click', () => window.TribeTour.start());
  $('#tour-invite').addEventListener('click', () => openInvite());
  $('#tour-search').addEventListener('click', () => window.TribePalette.open());
  $('#folder-item').addEventListener('click', () => window.TribeOnboarding.open({ fromSettings: true }).then(() => window.TribeOnboarding.goTo(3)));
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      S.set({ theme: next }); refresh(); e.preventDefault();
    }
  });

  // hooks for the updater's save + hand-off flow
  window.TribeApp = {
    applyTheme, refresh, toast,
    session: () => {
      const me = C.state().me;
      const live = (C.state().members || []).filter(m => m.online && m.role !== 'agent' && (!me || m.id !== me.id)).map(m => ({ id: m.id, name: m.name }));
      return { openDocs: Math.max(1, drops.length), unsaved: drops.filter(d => !d.saved).length + (window.TribeDocs && window.TribeDocs.isDirty() ? 1 : 0) + (demo.peers.length ? 2 : 0),
        peers: live.length ? live : demo.peers, agentRuns: demo.agentRuns,
        claims: C.connected() ? (C.state().claims || []).filter(c => me && c.by === me.id).map(c => ({ id: c.id, path: c.path })) : demo.claims };
    },
    async afterSetup() { const st = S.get(); if ((await C.ensureMember({ name: st.name, color: st.color })) === 'host') toast("You're the host of this tribe. Invite friends from the sidebar."); },
    async saveAll() {
      if (window.TribeDocs && window.TribeDocs.isDirty()) await window.TribeDocs.saveNow();
      drops.forEach(d => { d.saved = true; });
      try { localStorage.setItem('tribecode.drafts', JSON.stringify(drops)); } catch {}
      renderDrops();
      await new Promise(r => setTimeout(r, 500));
    },
    async handOff(id, to) {
      if (C.connected() && String(id).startsWith('c-') && to !== 'pause') { try { await C.api('/claims/' + id, { method: 'PATCH', body: { to } }); } catch (e) { toast(e.message); } return; }
      await new Promise(r => setTimeout(r, 300));
    },
    async announce(msg) { C.announce(msg); },
  };

  // iPhone/iPad Safari: offer "Add to Home Screen" so it opens like an app
  function iosHint() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios || navigator.standalone || localStorage.getItem('tribecode.iosHint') || !S.get().onboarded) return;
    const d = document.createElement('div'); d.className = 'ios-hint';
    d.innerHTML = `<img src="assets/apple-touch-icon.png" alt=""><div><b>Get the TribeCode app</b><br>Tap <b>Share</b> <span aria-hidden="true">⬆︎</span> then <b>Add to Home Screen</b>. It opens full screen, like a real app.</div><button aria-label="Dismiss">✕</button>`;
    d.querySelector('button').onclick = () => { d.remove(); try { localStorage.setItem('tribecode.iosHint', '1'); } catch {} };
    document.body.appendChild(d);
  }
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  // boot
  if (params.has('reset')) {
    S.reset();
    params.delete('reset');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  refresh();
  if (!S.get().onboarded) window.TribeOnboarding.open();
  else C.ensureMember({ name: S.get().name, color: S.get().color });
  if (window.TribeHost.isDesktop && S.get().hosting) hostHere({ quiet: true }); else C.connect();
  window.TribeUpdater.init();
  try { const v = sessionStorage.getItem('tribecode.view'); if (v) show(v); } catch {}
  setTimeout(iosHint, 1500);
  Object.assign(window.TribeApp, { show, openInvite, joinLink, parseInvite, connectClaude, refreshRoom: () => renderRoom(C.state().members) });
})();
