// Ctrl+K command palette: jump to views, docs, tasks and people, or run any action.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let items = [], shown = [], sel = 0, docsCache = [];

  function actions() {
    const A = window.TribeApp, S = window.TribeStore;
    return [
      { kind: 'Action', label: 'New task', keys: 'add todo create', run: () => { A.show('tasks'); setTimeout(() => document.querySelector('#task-new').click(), 50); } },
      { kind: 'Action', label: 'New doc', keys: 'page write note', run: () => { A.show('docs'); window.TribeDocs.create(); } },
      { kind: 'Action', label: 'New proposal', keys: 'vote board idea', run: () => { A.show('board'); setTimeout(() => document.querySelector('#prop-new').click(), 50); } },
      { kind: 'Action', label: 'Invite friends', keys: 'link join share', run: () => A.openInvite() },
      { kind: 'Action', label: 'Join / start huddle', keys: 'voice call talk mic audio', hint: 'Ctrl Shift M', run: () => window.TribeHuddle.join() },
      { kind: 'Action', label: 'Share my screen', keys: 'present screenshare', run: () => window.TribeHuddle.share() },
      { kind: 'Action', label: 'Connect Claude Code', keys: 'agent mcp ai claude', run: () => A.connectClaude() },
      { kind: 'Action', label: 'Report a bug', keys: 'issue problem crash', hint: 'Ctrl Shift B', run: () => window.TribeBugs.capture() },
      { kind: 'Action', label: "Write today's standup", keys: 'brain recap summary', run: () => { A.show('home'); document.querySelector('#standup-go').click(); } },
      { kind: 'Action', label: 'Toggle dark / light', keys: 'theme mode', hint: 'Ctrl Shift L', run: () => { S.set({ theme: document.body.classList.contains('dark') ? 'light' : 'dark' }); A.refresh(); } },
      { kind: 'Action', label: 'Take the tour', keys: 'help tutorial', run: () => window.TribeTour.start() },
      { kind: 'Action', label: 'Settings · replay setup', keys: 'preferences profile name color folder', run: () => window.TribeOnboarding.open({ fromSettings: true }) },
      { kind: 'Action', label: 'Check for updates', keys: 'version upgrade', run: () => window.TribeUpdater.check({ manual: true }) },
      ...(window.TribePaletteActions || []).flatMap(f => { try { return f() || []; } catch { return []; } }),   // feature modules add commands here
      ...['home', 'docs', 'tasks', 'board', 'bugs'].map(v => ({ kind: 'Go to', label: { home: 'Home', docs: 'Docs', tasks: 'Tasks', board: 'Approval board', bugs: 'Bug inbox' }[v], keys: v, run: () => A.show(v) })),
    ];
  }

  async function build() {
    if (C.connected()) { try { docsCache = (await C.api('/docs')).docs; } catch {} }
    const tasks = (window.TribeTasks && window.TribeTasks.all()) || [];
    items = [
      ...actions(),
      ...docsCache.map(d => ({ kind: 'Doc', label: d.title, keys: d.slug, run: () => { window.TribeApp.show('docs'); setTimeout(() => window.TribeDocs.open(d.slug), 80); } })),
      ...tasks.map(t => ({ kind: 'Task', label: t.title, keys: t.status, hint: t.status, run: () => window.TribeApp.show('tasks') })),
      ...(C.state().members || []).map(m => ({ kind: 'Person', label: m.name, keys: m.where || '', hint: m.online ? 'online · ' + (m.where || '') : 'offline', run: () => { $('#chat-input').value = `@${m.name} `; $('#chat-input').focus(); } })),
    ];
  }

  function score(q, it) {
    if (!q) return it.kind === 'Action' || it.kind === 'Go to' ? 1 : 0.5;
    const hay = (it.label + ' ' + (it.keys || '')).toLowerCase(), label = it.label.toLowerCase();
    if (label.startsWith(q)) return 100 - label.length / 100;
    if (label.includes(q)) return 60 - label.indexOf(q);
    if (hay.includes(q)) return 40;
    let i = 0; for (const ch of hay) if (ch === q[i]) i++;           // fuzzy subsequence
    return i === q.length ? 20 - hay.length / 100 : -1;
  }

  function draw() {
    const q = $('#pal-input').value.trim().toLowerCase();
    shown = items.map(it => [score(q, it), it]).filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0]).slice(0, 12).map(([, it]) => it);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    $('#pal-list').innerHTML = shown.length ? shown.map((it, i) => `<button class="pal-item ${i === sel ? 'on' : ''}" data-i="${i}"><span class="k">${it.kind}</span><span class="l">${esc(it.label)}</span>${it.hint ? `<span class="h">${esc(it.hint)}</span>` : ''}</button>`).join('')
      : '<div class="faint" style="padding:14px;font-size:13px">No matches</div>';
    $('#pal-list').querySelectorAll('[data-i]').forEach(b => { b.onmousemove = () => { if (sel !== +b.dataset.i) { sel = +b.dataset.i; draw(); } }; b.onclick = () => run(+b.dataset.i); });
  }
  function run(i) { const it = shown[i]; close(); if (it) setTimeout(it.run, 30); }

  async function open() {
    $('#palette').classList.remove('hidden'); const inp = $('#pal-input'); inp.value = ''; sel = 0;
    items = actions(); draw(); inp.focus(); await build(); draw();
  }
  function close() { $('#palette').classList.add('hidden'); }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette').classList.contains('hidden') ? open() : close(); return; }
    if ($('#palette').classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'pal-input') { sel = 0; draw(); } });
  document.addEventListener('click', e => { if (e.target.id === 'palette') close(); });
  window.TribePalette = { open, close };
})();
