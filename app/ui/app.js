// App shell: theme, profile, Home checklist, drop zone, and hooks used by onboarding/tour/updater.
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore;
  const params = new URLSearchParams(location.search);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');
  const drops = [];          // files dropped this session (unsaved until saveAll)
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
    { key: 'invite', label: 'Invite a friend', go: 'Soon', run: () => toast('Invite links arrive with the tribe server in Phase 1.') },
  ];

  function refresh() {
    const st = S.get();
    applyTheme(st.theme);
    document.body.classList.toggle('compact', st.density === 'compact');
    const first = (st.name || '').split(' ')[0];
    $('#hello').textContent = first ? `Welcome, ${first}` : 'Welcome';
    $('#ws-name').textContent = first ? `${first}'s Tribe` : 'My Tribe';
    for (const id of ['#me-avatar', '#room-me']) { const a = $(id); a.textContent = initials(st.name); a.style.background = st.color; a.style.color = ink(st.color); }
    $('#room-name').textContent = st.name || 'You';
    $('#folder-label').textContent = st.folder || 'Not set';
    $('#brain-label').textContent = st.brain.enabled ? `${st.brain.model} · local` : 'brain off';

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
    if (!files.length) return;
    files.forEach(f => drops.push({ name: f.name, size: f.size, saved: false }));
    renderDrops();
    S.set({ checklist: { drop: true } }); refresh();
    toast(`${files.length} item${files.length > 1 ? 's' : ''} queued for conversion to Markdown.`);
  });
  function renderDrops() {
    $('#drops').innerHTML = drops.slice(-4).map(d => `<div><svg class="i" style="width:15px;height:15px;color:var(--accent-2)"><use href="#i-doc"/></svg><span>${esc(d.name)}</span><span class="faint" style="margin-left:auto">${d.saved ? 'saved' : 'queued'}</span></div>`).join('');
  }

  // nav + buttons
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.nav !== 'home') toast(`${b.title} is coming in the next build. Home is ready now.`);
  }));
  $('#settings-btn').addEventListener('click', () => window.TribeOnboarding.open({ fromSettings: true }));
  $('#help-btn').addEventListener('click', () => window.TribeTour.start());
  $('#tour-invite').addEventListener('click', () => CHECKS.find(c => c.key === 'invite').run());
  $('#tour-search').addEventListener('click', () => toast('Command palette is coming in the next build.'));
  $('#folder-item').addEventListener('click', () => window.TribeOnboarding.open({ fromSettings: true }).then(() => window.TribeOnboarding.goTo(3)));
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      S.set({ theme: next }); refresh(); e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#tour-search').click(); }
  });

  // hooks for the updater's save + hand-off flow
  window.TribeApp = {
    applyTheme, refresh, toast,
    session: () => ({
      openDocs: Math.max(1, drops.length), unsaved: drops.filter(d => !d.saved).length + (demo.peers.length ? 2 : 0),
      peers: demo.peers, agentRuns: demo.agentRuns, claims: demo.claims,
    }),
    async saveAll() {
      drops.forEach(d => { d.saved = true; });
      try { localStorage.setItem('tribecode.drafts', JSON.stringify(drops)); } catch {}
      renderDrops();
      await new Promise(r => setTimeout(r, 500));
    },
    async handOff(id, to) { await new Promise(r => setTimeout(r, 450)); console.info('handoff', id, '→', to); },
    async announce(msg) { console.info('room:', msg); },
  };

  // boot
  if (params.has('reset')) {
    S.reset();
    params.delete('reset');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  refresh();
  if (!S.get().onboarded) window.TribeOnboarding.open();
  window.TribeUpdater.init();
})();
