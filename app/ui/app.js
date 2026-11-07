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
    const first = st.name && st.name !== 'Me' ? st.name.split(' ')[0] : '';   // 'Me' is the placeholder name, not a real one
    const tribeName = window.TribeClient && window.TribeClient.state().tribe && window.TribeClient.state().tribe.name;
    $('#ws-name').textContent = tribeName || (first ? `${first}'s Tribe` : 'My Tribe');
    for (const id of ['#me-avatar', '#room-me']) { const a = $(id); if (!a) continue; a.textContent = initials(st.name); a.style.background = st.color; a.style.color = ink(st.color); }
    if ($('#room-name')) $('#room-name').textContent = st.name || 'You';
    if ($('#folder-label')) $('#folder-label').textContent = st.folder || 'Not set';
    $('#brain-label').textContent = serverBrain && serverBrain.online ? `${serverBrain.model} · host` : st.brain.enabled ? `${st.brain.model} · local` : 'brain off';

    if (!$('#checklist')) return;
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
    // Text becomes docs; anything else (PDF, zip, images…) is shared in the chat as a file, so its bytes are kept
    // (Docs import alone keeps only a stub for binary files).
    const texty = f => /\.(md|markdown|txt|text|csv|json|ya?ml|js|ts|py|css|html?)$/i.test(f.name) && f.size < 2_000_000;
    const bin = C.connected() ? real.filter(f => !texty(f)) : [];
    const txt = real.filter(f => !bin.includes(f));
    const toB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
    (async () => {
      for (const f of bin) {
        if (f.size > 8 * 1024 * 1024) { toast(`${f.name} is over 8 MB: put it in the repo instead`); continue; }
        try { await C.api('/chat/general/file', { method: 'POST', body: { data: await toB64(f), name: f.name, mime: f.type } }); toast(`${f.name} shared in the chat`); } catch (err) { toast(err.message); }
      }
      if (txt.length) { await window.TribeDocs.importFiles(txt); show('docs'); } else if (bin.length) show('chat');
    })();
  });
  function renderDrops() {
    $('#drops').innerHTML = drops.slice(-4).map(d => `<div><svg class="i" style="width:15px;height:15px;color:var(--accent-2)"><use href="#i-doc"/></svg><span>${esc(d.name)}</span><span class="faint" style="margin-left:auto">${d.saved ? 'saved' : 'queued'}</span></div>`).join('');
  }

  // nav + views (the shell: app/ui/shell.js renders the nest, breadcrumbs and menus around these)
  const VIEWS = { hub: 'Hub', home: 'Home', chat: 'Chat', requests: 'Requests', docs: 'Docs', tasks: 'Tasks', board: 'Board', bugs: 'Bugs', repo: 'Repo', calendar: 'Calendar', visuals: 'Visuals', coord: 'Coordinate' };
  const ALIAS = { overview: 'home', inbox: 'home' };
  let current = 'home';
  function show(view) {
    view = ALIAS[view] || view;
    if (!VIEWS[view]) return;
    // Chat needs a tribe: with none yet, the Global Hub (quick launch, scratchpad, host or join) instead of a dead box.
    if (view === 'chat' && !C.hasToken()) { view = 'hub'; setTimeout(() => toast('Chat lives in a tribe. Start hosting or join with a link, right here.'), 0); }
    const leaving = current;
    document.body.classList.remove('mobile-chat', 'drawer-open');
    Object.keys(VIEWS).forEach(v => { const el = $('#view-' + v); if (el) el.classList.toggle('hidden', v !== view); });
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === view));
    document.querySelectorAll('[data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === view && !b.textContent.includes('Milestones')));
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = VIEWS[view];
    document.body.dataset.view = view;
    if (view === 'tasks') window.TribeTasks.load();
    if (view === 'board') window.TribeBoard.load();
    if (view === 'docs') window.TribeDocs.load();
    if (view === 'bugs') window.TribeBugs.load();
    if (view === 'repo') window.TribeRepo.load();
    if (view === 'calendar') window.TribePlan.show();
    if (view === 'visuals') window.TribeVisuals.show();
    if (view === 'chat') { const l = $('#chat-list'); if (l) l.scrollTop = 1e9; if (!isPhone()) setTimeout(() => { const i = $('#chat-input'); if (i && !document.activeElement.closest('.modal')) i.focus({ preventScroll: true }); }, 0); }
    current = view;
    if (window.TribeHub) { if (view === 'hub') window.TribeHub.onShow(); else { if (leaving === 'hub') window.TribeHub.onHide(); window.TribeHub.remember(view); } }
    if (window.TribeProjects) window.TribeProjects.onShow(view);   // overview, requests, cascade highlight
    if (window.TribeShell) window.TribeShell.onShow(view);
    if (window.TribeCoord && view === 'coord') window.TribeCoord.show();
    window.TribeClient.sendActivity(VIEWS[view]);
    try { sessionStorage.setItem('tribecode.view', view); } catch {}
  }
  // One delegated handler for every [data-nav] button (nest rows, tab bar, cards, menus).
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-nav]'); if (!b || b.disabled) return;
    const v = ALIAS[b.dataset.nav] || b.dataset.nav;
    if (v === 'hub' && window.TribeHub) window.TribeHub.open('home');
    else if (VIEWS[v]) show(v);
    else if (v === 'brain') { show('home'); document.querySelector('#standup-card').scrollIntoView({ block: 'center' }); }
  });

  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  $('#menu-btn').addEventListener('click', e => { e.stopPropagation(); document.body.classList.toggle('drawer-open'); });
  document.addEventListener('click', e => { if (document.body.classList.contains('drawer-open') && !e.target.closest('.side') && !e.target.closest('#menu-btn') && !e.target.closest('.tf-pop')) document.body.classList.remove('drawer-open'); });
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
    const shown = list.filter(m => m.role !== 'agent');   // agents have their own list below (coord.js #room-agents)
    $('#room-list').innerHTML = shown.slice().sort((a, b) => b.online - a.online || (a.role === 'agent') - (b.role === 'agent')).map(m => `
      <div class="person ${m.online ? 'on' : ''} ${m.role === 'agent' ? 'agent' : ''}" data-follow="${esc(m.id)}" title="${m.online && m.id !== meId && m.role !== 'agent' ? 'Click to follow ' + esc(m.name) : ''}">
      <div class="avatar" style="background:${m.role === 'agent' ? 'var(--surface-3)' : esc(m.color)};color:${ink(m.color)}">${m.role === 'agent' ? '🤖' : esc(initials(m.name))}<span class="st"></span></div>
      <div><span>${esc(m.name)}${meId === m.id ? ' <span class="faint">(you)</span>' : ''}${(C.state().huddle || []).some(h => h.id === m.id) ? ' <span title="In the huddle">🎙️</span>' : ''}</span><div class="what">${m.online ? (m.role === 'agent' ? '<span class="ok">agent</span> · ' : '<span class="ok">online</span> · ') + (window.TribeProjects ? window.TribeProjects.whereLabel(m) : '') + esc(m.where || 'Home') : m.role === 'agent' ? 'agent · idle' : 'offline'}${m.role === 'host' ? ' · host' : ''}</div></div></div>`).join('');
    $('#room-list').querySelectorAll('[data-follow]').forEach(el => el.onclick = () => follow(el.dataset.follow));
    $('#room-hint').classList.toggle('hidden', shown.length > 1);
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
  // Connect Claude Code from anywhere (this computer, same Wi-Fi, or a remote session at home via the public link),
  // see whether it's connected, and disconnect in one click.
  async function connectClaude() {
    if (!C.connected()) return openInvite();
    const body = $('#invite-body'); $('#invite-modal').classList.remove('hidden');
    body.innerHTML = '<h2>Connect your Claude Code</h2><p class="lead">Creating a key…</p>';
    let r, where, timer;
    const isHost = (C.state().me || {}).role === 'host';
    const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { toast('Select the command and copy it.'); } };
    const status = async () => {
      const el = $('#cc-status'); if (!el || $('#invite-modal').classList.contains('hidden')) return clearInterval(timer);   // closed with Esc or the backdrop
      try { const s = await C.api('/agents/mine'); el.innerHTML = s.online ? `<span class="cc-dot on"></span>Connected · ${esc(s.agent.name)}` : `<span class="cc-dot"></span>Waiting for Claude Code…`; } catch {}
    };
    const draw = () => {
      const cmd = r.commands[where];
      const tabs = [['anywhere', 'Anywhere'], ['wifi', 'Same Wi-Fi'], ['here', 'This computer']].filter(([k]) => k !== 'wifi' || r.commands.wifi);
      body.innerHTML = `<h2>Connect your Claude Code</h2>
        <p class="lead">Run this once in a terminal, on any computer: at home, at work, or a remote session. It joins as <b>${esc(r.agent.name)}</b>, sees the board, docs and chat, and claims files before editing.</p>
        <div class="cc-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="cc-tab ${k === where ? 'on' : ''}" aria-selected="${k === where}" data-where="${k}">${l}</button>`).join('')}</div>
        ${cmd ? `<div class="linkbox"><code id="cc-cmd" title="${esc(cmd)}">${esc(cmd)}</code><button class="btn primary" id="cc-copy">Copy</button></div>`
          : `<p class="faint" style="font-size:13px;line-height:1.5">Anywhere needs this tribe's public link.</p>${isHost ? '<button class="btn primary" id="cc-public">Turn on the public link</button>' : '<p class="faint" style="font-size:13px">Ask the host to turn on the public link.</p>'}`}
        <div class="cc-status" id="cc-status"><span class="cc-dot"></span>Waiting for Claude Code…</div>
        <p class="faint" style="font-size:12px;line-height:1.5">A new key replaces the old one. Agents can't vote, approve or invite people.${window.TribeAgentsHub ? ' <a href="#/agents-hub" id="cc-hub">Claude Desktop, more agents and local models →</a>' : ''}</p>
        <div class="modal-foot"><button class="btn" id="cc-out">Disconnect</button><button class="btn" data-close>Done</button></div>`;
      body.querySelectorAll('[data-where]').forEach(b => b.onclick = () => { where = b.dataset.where; draw(); });
      if ($('#cc-hub')) $('#cc-hub').onclick = e => { e.preventDefault(); clearInterval(timer); closeInvite(); window.TribeAgentsHub.open(); };
      if ($('#cc-copy')) $('#cc-copy').onclick = () => copy(cmd, 'Command copied. Paste it in your terminal.');
      if ($('#cc-public')) $('#cc-public').onclick = async e => {
        e.target.disabled = true; e.target.textContent = 'Turning on…';
        try { await C.api('/share/public', { method: 'POST', body: {} }); r = await C.api('/agents', { method: 'POST' }); where = r.commands.anywhere ? 'anywhere' : where; draw(); }
        catch (err) { toast(err.message); e.target.disabled = false; e.target.textContent = 'Turn on the public link'; }
      };
      $('#cc-out').onclick = async () => {
        try { const o = await C.api('/agents/mine', { method: 'DELETE' }); clearInterval(timer);
          body.innerHTML = `<h2>Disconnected</h2><p class="lead">The key stopped working. To remove it from Claude Code too, run:</p>
            <div class="linkbox"><code>${esc(o.remove)}</code><button class="btn primary" id="cc-rm">Copy</button></div>
            <div class="modal-foot"><button class="btn" id="cc-again">Connect again</button><button class="btn" data-close>Done</button></div>`;
          $('#cc-rm').onclick = () => copy(o.remove, 'Copied.'); $('#cc-again').onclick = () => connectClaude();
          body.querySelector('[data-close]').onclick = closeInvite;
        } catch (err) { toast(err.message); }
      };
      body.querySelector('[data-close]').onclick = () => { clearInterval(timer); closeInvite(); };
      status();
    };
    try {
      r = await C.api('/agents', { method: 'POST' });
      where = r.commands.anywhere ? 'anywhere' : (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'here' : (r.commands.wifi ? 'wifi' : 'here');
      draw(); clearInterval(timer); timer = setInterval(status, 3000);
    } catch (e) { body.innerHTML = `<h2>Couldn't create a key</h2><p class="lead">${esc(e.message)}</p><div class="modal-foot"><button class="btn" data-close>Close</button></div>`; body.querySelector('[data-close]').onclick = closeInvite; }
  }
  $('#cc-connect').addEventListener('click', () => connectClaude());
  C.on('claims', renderClaims);
  C.on('hello', () => C.api('/claims').then(r => { C.state().claims = r.claims; renderClaims(r.claims); }).catch(() => {}));

  function chatHtml(m) {
    const sys = m.by === 'tribecode', when = new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (window.TribeChatX) window.TribeChatX.seen(m, 'general');   // chatx.js upgrades it (replies, reactions, voice notes…)
    return `<div class="msg ${sys ? 'sys' : ''}" data-id="${esc(m.id || '')}"><div class="avatar" style="background:${sys ? 'var(--surface-3)' : esc(colorOf(m.by))};color:${sys ? 'var(--accent-2)' : ink(colorOf(m.by))}">${sys ? '🔥' : esc(initials(nameOf(m.by)))}</div>
      <div><b>${esc(nameOf(m.by))}</b><time>${when}</time><p>${md(m.text)}</p></div></div>`;
  }
  // Chat sticks to the newest message unless you've scrolled up to read history.
  let readingHistory = false;
  $('#chat-list').addEventListener('scroll', () => { const l = $('#chat-list'); readingHistory = l.scrollTop + l.clientHeight < l.scrollHeight - 60; }, { passive: true });
  new ResizeObserver(() => { if (!readingHistory) $('#chat-list').scrollTop = 1e9; }).observe($('#chat-list'));
  const PAGE = 100;
  const moreBtn = () => '<button class="chat-more" id="chat-more" type="button">Load earlier messages</button>';
  async function loadChat() {
    try {
      const { messages } = await C.api(`/chat/general?limit=${PAGE}`);
      $('#chat-list').innerHTML = messages.length ? (messages.length >= PAGE ? moreBtn() : '') + messages.map(chatHtml).join('') : '<div class="empty-room">Say hi 👋</div>';
      $('#chat-list').scrollTop = 1e9;
    } catch {}
  }
  // Older history, a page at a time, keeping your place in the list.
  async function loadEarlier() {
    const list = $('#chat-list'), btn = $('#chat-more'), first = list.querySelector('.msg[data-id]');
    if (!btn || !first) return;
    btn.disabled = true; btn.textContent = 'Loading…';
    try {
      const { messages } = await C.api(`/chat/general?limit=${PAGE}&before=${encodeURIComponent(first.dataset.id)}`);
      // Keep the message you were looking at in the same spot, also after chatx.js upgrades the new bubbles.
      const id = first.dataset.id, offset = el => el.getBoundingClientRect().top - list.getBoundingClientRect().top, was = offset(first);
      const keep = () => { const el = list.querySelector(`.msg[data-id="${CSS.escape(id)}"]`); if (el) list.scrollTop += offset(el) - was; };
      readingHistory = true;
      btn.remove();
      list.insertAdjacentHTML('afterbegin', (messages.length >= PAGE ? moreBtn() : '') + messages.map(chatHtml).join(''));
      keep(); await Promise.resolve(); keep(); requestAnimationFrame(keep);
      if (!messages.length) toast("That's the start of the chat.");
    } catch (e) { btn.disabled = false; btn.textContent = 'Load earlier messages'; toast(e.message); }
  }
  $('#chat-list').addEventListener('click', e => { if (e.target.closest && e.target.closest('#chat-more')) loadEarlier(); });
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
  // Unread count in the tab / window title while you're away: "(3) TribeCode".
  let unseen = 0, baseTitle = document.title;
  const paintTitle = () => { document.title = unseen ? `(${unseen > 99 ? '99+' : unseen}) ${baseTitle}` : baseTitle; };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && unseen) { unseen = 0; paintTitle(); } });
  C.on('chat', ({ message }) => {
    if (!document.hidden || !message || message.by === 'tribecode' || message.by === (C.state().me || {}).id) return;
    if (!/^\(\d+\+?\) /.test(document.title)) baseTitle = document.title;
    unseen++; paintTitle();
  });
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
      body.innerHTML = desktop ? `<h2>${window.__hostError ? 'Your tribe did not start' : 'Starting your tribe…'}</h2>
          ${window.__hostError ? `<pre class="host-err">${esc(window.__hostError)}</pre>` : ''}
          <div class="modal-foot"><button class="btn ghost" id="join-instead">Join a friend instead</button><span style="flex:1"></span><button class="btn" data-close>Close</button><button class="btn primary" id="host-here">${window.__hostError ? 'Try again' : 'Host on this computer'}</button></div>`
        : `<h2>Join a tribe</h2>
          <div class="field"><label for="join-link">Invite link</label><div class="folder"><input class="input" id="join-link" placeholder="https://…/join/k7Qx2"><button class="btn primary" id="join-go">Join</button></div></div>
          <p class="faint" style="font-size:12.5px">To host your own, open the desktop app or run <span class="code" style="display:inline;padding:2px 6px">npm start</span>.</p>
          <div class="modal-foot"><button class="btn" data-close>Close</button></div>`;
      if (desktop) { $('#host-here').onclick = hostHere; $('#join-instead').onclick = () => window.TribeSettings.joinPrompt(); }
      else { $('#join-go').onclick = () => joinLink($('#join-link').value); $('#join-link').onkeydown = e => { if (e.key === 'Enter') joinLink($('#join-link').value); }; }
    } else {
      body.innerHTML = `<h2>Invite friends</h2>
        <div class="opts"><select id="inv-hours" title="Link expires after"><option value="24">24 hours</option><option value="168">7 days</option><option value="1">1 hour</option></select>
          <select id="inv-uses" title="How many people can use it"><option value="5">5 people</option><option value="1">1 person</option><option value="20">20 people</option></select>
          <select id="inv-role" title="Builders can edit; spectators can only watch"><option value="builder">Builder</option><option value="spectator">Spectator</option></select></div>
        ${window.TribeProjects ? window.TribeProjects.invitePicker() : ''}
        <div class="linkbox"><code id="inv-link">Creating link…</code><button class="btn primary" id="inv-copy" disabled>Copy</button></div>
        <div class="qr-wrap"><div class="qr" id="inv-qr"></div><p>Scan to join from a phone.<br><span class="faint" id="inv-net"></span></p></div>
        <div class="modal-foot"><button class="btn" data-close>Done</button></div>`;
      const make = async () => {
        $('#inv-copy').disabled = true; $('#inv-link').textContent = 'Creating link…';
        try {
          const { invite } = await C.api('/invites', { method: 'POST', body: { hours: +$('#inv-hours').value, maxUses: +$('#inv-uses').value, role: $('#inv-role').value, ...($('#inv-project') ? { project: $('#inv-project').value } : {}) } });
          // localhost links only work on this computer: share the network address instead
          let base = C.base(), note = '';
          // a public https address ("Share beyond my Wi-Fi") always wins; it comes first in /api/health lan
          let site = null;
          try { const h = await C.api('/health'); const pick = (h.lan || [])[0]; site = h.site || null;
            if (pick && (pick.kind === 'public' || /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(base))) { base = pick.url; note = pick.kind === 'public' ? 'Public https address: works from anywhere, and voice works on phones.' : pick.kind === 'tailscale' ? 'Tailscale address: works from anywhere your friend is signed in to Tailscale.' : 'Wi-Fi address: your friend needs to be on the same network (or use Tailscale).'; } }
          catch {}
          // Public hosts get the friendly GitHub Pages link (device-aware, says when the host is offline).
          const link = site && /^https:/.test(base) ? `${site}/go.html#s=${encodeURIComponent(base)}&c=${encodeURIComponent(invite.code)}` : `${base}/join/${invite.code}`;
          $('#inv-link').textContent = link; $('#inv-copy').disabled = false;
          $('#inv-qr').innerHTML = window.TribeQR.svg(link); $('#inv-net').textContent = note;
          S.set({ checklist: { invite: true } }); refresh();
        } catch (e) { $('#inv-link').textContent = 'Could not create invite: ' + e.message; }
      };
      ['#inv-hours', '#inv-uses', '#inv-role', '#inv-project'].forEach(s => $(s) && $(s).addEventListener('change', make));
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
      if (/\/go\.html$/.test(u.pathname) && u.hash) {   // GitHub Pages friend link: go.html#s=<host>&c=<code>
        const h = new URLSearchParams(u.hash.slice(1)), server = (h.get('s') || '').replace(/\/+$/, ''), code = h.get('c') || '';
        if (/^https?:\/\/[^/\s]+$/.test(server) && /^[A-Za-z0-9]{3,16}$/.test(code)) return { server, code };
      }
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
  async function hostHere(opts) {
    const quiet = !!(opts && opts.quiet === true);
    const st = S.get(), inv = window.__TAURI__ && window.__TAURI__.core;
    if (!inv) return;
    const btn = $('#host-here'); if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
    const reset = () => { if (btn) { btn.disabled = false; btn.textContent = 'Host a tribe on this computer'; } };
    // Each check gives up after 1.5 s, and the whole start after 30 s, so this never hangs on "Starting…".
    const healthy = async url => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 1500);
      try { const r = await fetch(url + '/api/health', { signal: c.signal, cache: 'no-store' }); return r.ok; } catch { return false; } finally { clearTimeout(t); } };
    try {
      const url = await inv.invoke('host_start', { port: 4747, dir: st.folder || '', name: st.name && st.name !== 'Me' ? `${st.name.split(' ')[0]}'s Tribe` : 'My Tribe' });
      let ok = false;
      for (const until = Date.now() + 30000; Date.now() < until;) {
        if ((ok = await healthy(url))) break;
        const log = await inv.invoke('host_log').catch(() => []);
        if (log.some(l => l.startsWith('[server stopped'))) break;
        await new Promise(r => setTimeout(r, 400));
      }
      // Sense a stale server: an older copy of TribeCode left running on this port serves old code and blocks
      // updates. If its version differs from this app's, stop it and start ours.
      if (ok && !(opts && opts.noStaleCheck)) {
        const mine = await (window.__TAURI__.app ? window.__TAURI__.app.getVersion().catch(() => '') : '');
        const theirs = await fetch(url + '/api/health', { cache: 'no-store' }).then(r => r.json()).then(h => h.version || '').catch(() => '');
        if (mine && theirs && mine !== theirs) {
          toast(`An older TribeCode server (v${theirs}) was still running. Restarting it as v${mine}…`);
          await inv.invoke('host_kill_stale').catch(() => {});
          for (const until = Date.now() + 8000; Date.now() < until;) { if (!(await healthy(url))) break; await new Promise(r => setTimeout(r, 300)); }
          if (await healthy(url)) throw new Error(`Another TribeCode (v${theirs}) is running on port 4747 and isn't this app's server. Close it (for example a terminal running npm start), then reopen TribeCode.`);
          return hostHere({ ...(opts || {}), noStaleCheck: true });
        }
      }
      if (!ok) {
        const log = (await inv.invoke('host_log').catch(() => [])).filter(Boolean).slice(-8).join('\n');
        throw new Error('The tribe server did not start.' + (log ? '\n\n' + log : ' It printed nothing. Your antivirus may have blocked tribecode-server.exe.'));
      }
      // The OS user name is only known once the server runs: replace the placeholder name with it.
      if (!st.name || st.name === 'Me') {
        const u = await fetch(url + '/api/health', { cache: 'no-store' }).then(r => r.json()).then(h => h.user || '').catch(() => '');
        const nice = u.replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
        if (nice) { S.set({ name: nice }); st.name = nice; }
      }
      const keep = st.server && st.server.url === url ? st.server.token : '';
      window.__hostError = null;
      S.set({ server: { url, token: keep }, hosting: true });
      const role = await C.ensureMember({ name: st.name, color: st.color });
      C.connect(); refresh();
      if (!role && !keep) toast('A TribeCode server is already running here with other members. Open the invite link it gave you to join it.');
      else if (!quiet) { closeInvite(); toast(role === 'host' ? "You're hosting! Now invite your friends." : 'Hosting again on this computer.'); setTimeout(openInvite, 600); }
    } catch (e) { reset(); if (!quiet || !(e && e.message)) toast(String(e && e.message || e)); else showHostError(e.message); }
  }
  function showHostError(msg) {
    toast(msg.split('\n')[0] + ' Open Invite for details.');
    window.__hostError = msg;
  }

  // Frameless desktop window: our own quiet buttons; the top bar drags (data-tauri-drag-region).
  if (window.__TAURI__ && window.__TAURI__.window) {
    document.body.classList.add('tauri');
    const w = window.__TAURI__.window.getCurrentWindow();
    document.querySelectorAll('#win-ctl [data-w]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.w;
      if (a === 'close') return (async () => { try { if (window.TribeUpdater && window.TribeUpdater.beforeClose) await window.TribeUpdater.beforeClose(); } catch {} w.close().catch(() => {}); })();
      (a === 'min' ? w.minimize() : w.toggleMaximize()).catch(() => {});
    }));
  }

  else document.querySelectorAll('#win-ctl [data-w]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.w, fs = document.fullscreenElement;
    if (a === 'close') window.close();
    else if (a === 'max') (fs ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
    else if (fs) document.exitFullscreen().catch(() => {});
  }));

  // ---- desktop app: switch between the installed UI and the Working version (dev, live on :4848) ----
  // No exe rebuild to try new UI: the frameless desktop window simply shows the Working server's page.
  const WORKING = 'http://localhost:4848/';
  const INSTALLED = /Windows/.test(navigator.userAgent) ? 'http://tauri.localhost/' : 'tauri://localhost/';
  const onWorking = () => location.origin === 'http://localhost:4848' || location.origin === 'http://127.0.0.1:4848';
  async function workingUp() { try { const c = new AbortController(); setTimeout(() => c.abort(), 1500); return (await fetch(WORKING + 'api/health', { signal: c.signal, cache: 'no-store' })).ok; } catch { return false; } }
  async function useUi(which, { quiet = false } = {}) {
    if (!window.TribeHost.isDesktop) return;
    if (which === 'working') {
      if (!(await workingUp())) { if (!quiet) toast('The Working version isn\'t running. Double-click "Try New Work" in your TribeCode folder first.'); return; }
      try { localStorage.setItem('tribecode.ui', 'working'); } catch {}
      location.href = WORKING + '?skipIntro=1';
    } else {
      location.href = INSTALLED + '?ui=installed';
    }
  }
  window.TribeUi = { useUi, onWorking, desktop: () => !!window.TribeHost.isDesktop };
  if (window.TribeHost.isDesktop && !onWorking()) {
    if (params.get('ui') === 'installed') { try { localStorage.removeItem('tribecode.ui'); } catch {} }
    else { let pref = null; try { pref = localStorage.getItem('tribecode.ui'); } catch {} if (pref === 'working') useUi('working', { quiet: true }); }
  }
  if (onWorking()) document.body.classList.add('ui-working');

  // tribecode:// links: on launch and while running (single-instance forwards them here)
  const deepLink = u => {
    const m = /^tribecode:\/\/(working|dev|installed|stable)\b/i.exec(String(u || ''));
    if (m) return useUi(/working|dev/i.test(m[1]) ? 'working' : 'installed');
    joinLink(u);
  };
  (async () => {
    const dl = window.__TAURI__ && window.__TAURI__.deepLink;
    if (!dl) return;
    try { const urls = await dl.getCurrent(); if (urls && urls[0]) deepLink(urls[0]); } catch {}
    try { await dl.onOpenUrl(urls => urls && urls[0] && deepLink(urls[0])); } catch {}
  })();
  $('#invite-modal').addEventListener('click', e => { if (e.target.id === 'invite-modal') closeInvite(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInvite(); });
  // Settings lives at the bottom of the nest (shell.js), the profile at the top right (profilemenu.js).
  $('#rail-logo').addEventListener('click', () => (window.TribeHub ? window.TribeHub.open('home') : show('hub')));   // the Global Hub (app/ui/hub.js)
  $('#tour-invite').addEventListener('click', () => { document.body.classList.remove('drawer-open'); openInvite(); });
  $('#tour-search').addEventListener('click', () => window.TribePalette.open());
  if ($('#folder-item')) $('#folder-item').addEventListener('click', () => window.TribeOnboarding.open({ fromSettings: true }).then(() => window.TribeOnboarding.goTo(3)));
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
    async afterSetup() { const st = S.get(); await C.ensureMember({ name: st.name, color: st.color }); },
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
  // The offline cache (sw.js) is for phones and browsers only. Inside the desktop app its network requests can't
  // reach the app's bundled files, so it served old cached pages after every update (old layout + new scripts).
  // In the app: never register it, remove any old one and its caches, and reload once so the real files load.
  if (window.__TAURI__ && 'serviceWorker' in navigator) {
    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
        let done = false; try { done = sessionStorage.getItem('tribecode.swCleared') === '1'; } catch {}
        if ((regs.length || navigator.serviceWorker.controller) && !done) { try { sessionStorage.setItem('tribecode.swCleared', '1'); } catch {} location.reload(); }
      } catch {}
    })();
  } else if ('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  // boot
  if (params.has('reset')) {
    S.reset();
    params.delete('reset');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  refresh();
  // Zero-step setup (settings.js): name, folder and color fill themselves in; the desktop app hosts on its own.
  (async () => {
    await window.TribeSettings.autoSetup(); refresh();
    const st = S.get(), remote = st.server && st.server.url && !/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(st.server.url);
    // The desktop app showing a page served by a TribeCode server (the Working version) talks to that server; it doesn't host its own.
    const served = /^https?:$/.test(location.protocol) && !/(^|\.)tauri\.localhost$/.test(location.hostname);
    if (window.TribeHost.isDesktop && !served && !st.hostOff && !remote) hostHere({ quiet: true });
    else if ((await C.ensureMember({ name: st.name, color: st.color })) !== 'host') C.connect();
  })();
  window.TribeUpdater.init();
  let autoHub = false;   // the hub was shown only because there was no tribe yet
  // Start screen: the view you were on in this tab, else the project home, else (no tribe yet) the Global Hub.
  { let v = null; try { v = sessionStorage.getItem('tribecode.view'); } catch {}
    if (/^#\/hub/.test(location.hash) && window.TribeHub) window.TribeHub.open((location.hash.split('/')[2]) || 'home');
    else { autoHub = !(v && VIEWS[v]) && !C.hasToken(); show(v && VIEWS[v] ? v : C.hasToken() ? 'home' : 'hub'); } }
  // Nothing to connect to (no tribe yet): the project home has nothing to show, the hub does.
  C.on('status', s => { if (s.status === 'offline' && !C.hasToken() && ['home', 'chat'].includes(current)) { autoHub = true; show('hub'); } });
  // The hub was only standing in for "no tribe yet": once connected (hosting or joined), open the project as usual.
  C.on('hello', () => { if (autoHub && current === 'hub') show('home'); autoHub = false; });
  setTimeout(iosHint, 1500);
  Object.assign(window.TribeApp, { show, hostHere, view: () => current, reloadChat: loadChat, openInvite, joinLink, parseInvite, connectClaude, refreshRoom: () => renderRoom(C.state().members) });
})();
