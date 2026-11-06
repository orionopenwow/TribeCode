// App shell: theme, profile, Home checklist, drop zone, and hooks used by onboarding/tour/updater.
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore;
  const params = new URLSearchParams(location.search);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');
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
  const VIEWS = { home: 'Home', docs: 'Docs', tasks: 'Tasks', board: 'Board', bugs: 'Bugs' };
  function show(view) {
    if (!VIEWS[view]) return;
    Object.keys(VIEWS).forEach(v => $('#view-' + v).classList.toggle('hidden', v !== view));
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === view));
    document.querySelectorAll('[data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === view && !b.textContent.includes('Milestones')));
    document.querySelector('.titlebar .faint').textContent = '/ ' + VIEWS[view];
    if (view === 'tasks') window.TribeTasks.load();
    if (view === 'board') window.TribeBoard.load();
    if (view === 'docs') window.TribeDocs.load();
    if (view === 'bugs') window.TribeBugs.load();
    window.TribeClient.sendActivity(VIEWS[view]);
    try { sessionStorage.setItem('tribecode.view', view); } catch {}
  }
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    if (VIEWS[b.dataset.nav]) show(b.dataset.nav);
    else if (b.dataset.nav === 'chat') $('#chat-input').focus();
    else if (b.dataset.nav === 'brain') { show('home'); document.querySelector('#standup-card').scrollIntoView({ block: 'center' }); }
  }));

  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    if (VIEWS[b.dataset.go]) show(b.dataset.go);
  }));

  // ---- live room + chat ----
  const C = window.TribeClient;
  const nameOf = id => { if (id === 'tribecode') return 'TribeCode'; const m = (C.state().members || []).find(x => x.id === id); return m ? m.name : 'someone'; };
  const colorOf = id => { const m = (C.state().members || []).find(x => x.id === id); return m ? m.color : '#3DD6D0'; };
  const md = t => window.TribeMD.inline(t).replace(/\n/g, '<br>');
  function renderRoom(list) {
    const st = S.get();
    if (!C.hasToken() || !list || !list.length) return;
    const on = list.filter(m => m.online).length;
    $('#room-count').textContent = `· ${on} online`;
    $('#room-list').innerHTML = list.slice().sort((a, b) => b.online - a.online).map(m => `
      <div class="person ${m.online ? 'on' : ''}"><div class="avatar" style="background:${esc(m.color)};color:${ink(m.color)}">${esc(initials(m.name))}<span class="st"></span></div>
      <div><span>${esc(m.name)}${C.state().me && C.state().me.id === m.id ? ' <span class="faint">(you)</span>' : ''}</span><div class="what">${m.online ? 'online · ' + esc(m.where || 'Home') : 'offline'}${m.role === 'host' ? ' · host' : ''}</div></div></div>`).join('');
    $('#room-hint').classList.toggle('hidden', list.length > 1);
    $('#room-hint').textContent = 'Invite friends to see them here.';
  }
  function chatHtml(m) {
    const sys = m.by === 'tribecode', when = new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `<div class="msg ${sys ? 'sys' : ''}"><div class="avatar" style="background:${sys ? 'var(--surface-3)' : esc(colorOf(m.by))};color:${sys ? 'var(--accent-2)' : ink(colorOf(m.by))}">${sys ? '🔥' : esc(initials(nameOf(m.by)))}</div>
      <div><b>${esc(nameOf(m.by))}</b><time>${when}</time><p>${md(m.text)}</p></div></div>`;
  }
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
    const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
    list.insertAdjacentHTML('beforeend', chatHtml(message)); if (stick) list.scrollTop = 1e9;
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
      body.innerHTML = `<h2>Start or join a tribe</h2>
        <p class="lead">Invites come from a tribe server. Any member can host one on their computer.</p>
        <ol class="steps-host"><li>On the host computer run <span class="code" style="display:inline-block;padding:3px 8px">node server/index.js</span></li>
        <li>Open <b>http://localhost:4747</b> there. You'll be the host.</li><li>Click <b>Invite friends</b> to get a link.</li></ol>
        <div class="field" style="margin-top:16px"><label for="join-link">Got a link from a friend?</label>
          <div class="folder"><input class="input" id="join-link" placeholder="http://192.168.1.20:4747/join/k7Qx2"><button class="btn primary" id="join-go">Join</button></div></div>
        <div class="modal-foot"><button class="btn" data-close>Close</button></div>`;
      $('#join-go').onclick = () => { const v = $('#join-link').value.trim(); if (/^https?:\/\/.+\/join\/[A-Za-z0-9]+/.test(v)) location.href = v; else toast('Paste the full invite link, e.g. http://host:4747/join/abc12'); };
    } else {
      body.innerHTML = `<h2>Invite friends</h2><p class="lead">Anyone with this link can join <b>${esc((C.state().tribe || {}).name || 'your tribe')}</b>. They pick a name and they're in.</p>
        <div class="opts"><select id="inv-hours" title="Link expires after"><option value="24">24 hours</option><option value="168">7 days</option><option value="1">1 hour</option></select>
          <select id="inv-uses" title="How many people can use it"><option value="5">5 people</option><option value="1">1 person</option><option value="20">20 people</option></select>
          <select id="inv-role" title="Builders can edit; spectators can only watch"><option value="builder">Builder</option><option value="spectator">Spectator</option></select></div>
        <div class="linkbox"><code id="inv-link">Creating link…</code><button class="btn primary" id="inv-copy" disabled>Copy</button></div>
        <p class="faint" style="font-size:12px">Friends on another network can join through Tailscale or a tunnel to this computer.</p>
        <div class="modal-foot"><button class="btn" data-close>Done</button></div>`;
      const make = async () => {
        $('#inv-copy').disabled = true; $('#inv-link').textContent = 'Creating link…';
        try {
          const { invite } = await C.api('/invites', { method: 'POST', body: { hours: +$('#inv-hours').value, maxUses: +$('#inv-uses').value, role: $('#inv-role').value } });
          $('#inv-link').textContent = `${C.base()}/join/${invite.code}`; $('#inv-copy').disabled = false;
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
      const live = (C.state().members || []).filter(m => m.online && (!me || m.id !== me.id)).map(m => ({ id: m.id, name: m.name }));
      return { openDocs: Math.max(1, drops.length), unsaved: drops.filter(d => !d.saved).length + (window.TribeDocs && window.TribeDocs.isDirty() ? 1 : 0) + (demo.peers.length ? 2 : 0),
        peers: live.length ? live : demo.peers, agentRuns: demo.agentRuns, claims: demo.claims };
    },
    async afterSetup() { const st = S.get(); if ((await C.ensureMember({ name: st.name, color: st.color })) === 'host') toast("You're the host of this tribe. Invite friends from the sidebar."); },
    async saveAll() {
      if (window.TribeDocs && window.TribeDocs.isDirty()) await window.TribeDocs.saveNow();
      drops.forEach(d => { d.saved = true; });
      try { localStorage.setItem('tribecode.drafts', JSON.stringify(drops)); } catch {}
      renderDrops();
      await new Promise(r => setTimeout(r, 500));
    },
    async handOff(id, to) { await new Promise(r => setTimeout(r, 450)); console.info('handoff', id, '→', to); },
    async announce(msg) { C.announce(msg); },
  };

  // boot
  if (params.has('reset')) {
    S.reset();
    params.delete('reset');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  refresh();
  if (!S.get().onboarded) window.TribeOnboarding.open();
  else C.ensureMember({ name: S.get().name, color: S.get().color });
  C.connect();
  window.TribeUpdater.init();
  try { const v = sessionStorage.getItem('tribecode.view'); if (v) show(v); } catch {}
  Object.assign(window.TribeApp, { show, openInvite });
})();
