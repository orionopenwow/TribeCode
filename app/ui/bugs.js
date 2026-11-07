// Bug board: one-key capture (Ctrl+Shift+B) with repro steps and screenshots, automatic crash reports,
// triage columns (New / Confirmed / In progress / Fixed) with severity and assignee filters, a ⋯ menu per
// bug (assign to me, give to agent, convert to task, mark duplicate, close, copy as Markdown for Claude),
// and a detail preview in the right panel. Linked tasks resolve the bug when they're done.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const recent = [];                                   // recent console errors for bug reports
  let bugs = [], loaded = false, autoSent = 0, filter = 'open';

  const push = line => { recent.push(`${new Date().toISOString().slice(11, 19)} ${line}`); if (recent.length > 30) recent.shift(); };
  const origErr = console.error.bind(console);
  console.error = (...a) => { push(a.map(x => (x && x.stack) || String(x)).join(' ')); origErr(...a); };
  addEventListener('error', e => { push(`${e.message} @ ${e.filename}:${e.lineno}`); autoReport(e.message, e.error && e.error.stack); });
  addEventListener('unhandledrejection', e => { const r = e.reason || {}; push(`unhandled: ${r.message || r}`); autoReport(String(r.message || r), r.stack); });

  function autoReport(msg, stack) {
    if (!C.connected() || autoSent >= 3 || /ResizeObserver|Script error/.test(msg)) return;   // never spam the inbox
    autoSent++;
    C.api('/bugs', { method: 'POST', body: { title: `Crash: ${String(msg).slice(0, 120)}`, details: 'Reported automatically by TribeCode.', logs: [stack || '', ...recent.slice(-10)].join('\n'), view: currentView(), version: window.TribeUpdater ? window.TribeUpdater.current() : '', auto: true } }).catch(() => {});
  }
  const currentView = () => (document.querySelector('#crumb-label') || {}).textContent || '';

  async function load() {
    if (!C.connected()) { $('#bug-list').innerHTML = '<div class="prop-empty">The bug inbox is shared, so it needs a tribe. Press <span class="kbd">Ctrl Shift B</span> any time to report a bug.</div>'; return; }
    try { bugs = (await C.api('/bugs')).bugs; loaded = true; render(); } catch (e) { window.TribeApp.toast(e.message); }
  }

  // ---------- the board: New / Confirmed / In progress / Fixed, filters, one ⋯ menu per bug ----------
  const COLS = [['new', 'New', ['new', 'triaged']], ['confirmed', 'Confirmed', ['confirmed']], ['progress', 'In progress', ['progress']], ['resolved', 'Fixed', ['resolved']]];
  const CLOSED = ['wontfix', 'duplicate'];
  let sev = 'all', who = 'all';
  const sevChip = s => `<span class="chip sev-${s}">${s}</span>`;
  const members = () => (C.state().members || []);
  const nameOf = id => (members().find(m => m.id === id) || {}).name || '';
  const me = () => (C.state().me || {}).id;
  const fileUrl = (b, a) => `${C.base()}/api/bugs/${encodeURIComponent(b.id)}/files/${encodeURIComponent(a.name)}?token=${encodeURIComponent((window.TribeStore.get().server || {}).token || '')}&project=${encodeURIComponent(C.project() || '')}`;
  function card(b) {
    const img = (b.attachments || []).find(a => /^image\//.test(a.type));
    return `<article class="bug" data-bid="${esc(b.id)}" tabindex="0">
        <div class="top">${sevChip(b.severity)}<span class="chip">${esc(b.area)}</span>${b.status === 'new' ? '<span class="chip amber">sorting…</span>' : ''}${b.count > 1 ? `<span class="chip ember">seen ${b.count}×</span>` : ''}${b.auto ? '<span class="chip">auto</span>' : ''}${b.status === 'resolved' ? '<span class="chip teal">resolved</span>' : ''}${b.status === 'duplicate' ? '<span class="chip">duplicate</span>' : b.status === 'wontfix' ? '<span class="chip">closed</span>' : ''}
          <button class="bug-menu" data-bug-menu title="More" aria-label="Bug actions"><svg class="i"><use href="#i-more"/></svg></button></div>
        <h3>${esc(b.title)}</h3>
        ${b.repro ? `<div class="bug-repro">${esc(b.repro.split('\n').slice(0, 3).join(' · ')).slice(0, 160)}</div>` : ''}
        ${img ? `<button class="bug-att" data-preview-img="${esc(fileUrl(b, img))}" data-preview-title="${esc(img.name)}" data-preview-kind="Bug screenshot"><img alt="" loading="lazy" src="${esc(fileUrl(b, img))}"></button>` : (b.attachments || []).length ? `<button class="bug-att file" data-att="${esc(b.attachments[0].name)}">📎 ${esc(b.attachments[0].name)}</button>` : ''}
        <div class="row">${b.assignee ? `<span class="bug-who">${esc(nameOf(b.assignee))}</span>` : ''}${b.task ? `<span class="faint bug-link">Linked task${b.branch ? ` · <code>${esc(b.branch)}</code>` : ''} · resolves when it's done</span>` : !CLOSED.includes(b.status) && b.status !== 'resolved' ? '<button class="btn ghost" data-mk>Make it a task</button>' : ''}</div>
      </article>`;
  }
  function render() {
    document.querySelectorAll('[data-bf]').forEach(b => b.classList.toggle('on', b.dataset.bf === filter));
    const pass = b => (sev === 'all' || b.severity === sev) && (who === 'all' || (who === 'mine' ? b.assignee === me() || (members().find(m => m.id === b.assignee) || {}).owner === me() : !b.assignee));
    const open = bugs.filter(b => !CLOSED.includes(b.status) && b.status !== 'resolved');
    $('#bugs-sub').textContent = `${open.length} open`;
    const filters = `<div class="bug-filters"><div class="tabs">${['all', 'critical', 'high', 'normal', 'low'].map(x => `<button data-sevf="${x}" class="${sev === x ? 'on' : ''}">${x === 'all' ? 'Any severity' : x}</button>`).join('')}</div>
      <div class="tabs">${[['all', 'Everyone'], ['mine', 'Mine'], ['none', 'Unassigned']].map(([v, l]) => `<button data-whof="${v}" class="${who === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    if (filter === 'resolved') {
      const done = bugs.filter(b => (CLOSED.includes(b.status) || b.status === 'resolved') && pass(b));
      $('#bug-list').innerHTML = filters + (done.length ? `<div class="bug-closed">${done.map(card).join('')}</div>` : '<div class="prop-empty">Nothing closed yet.</div>');
    } else {
      const crit = open.filter(b => b.severity === 'critical');
      const hero = crit.length ? `<section class="hero-card bug-hero"><span class="eyebrow">Critical</span><h2>${crit.length === 1 ? esc(crit[0].title) : `${crit.length} critical bugs are open`}</h2>
        ${crit.length > 1 ? crit.slice(0, 5).map(b => `<div class="hero-row" data-crit="${esc(b.id)}"><b>${esc(b.title)}</b><span class="faint">${esc(b.assignee ? nameOf(b.assignee) : 'nobody yet')}</span></div>`).join('') : `<p>${esc(crit[0].assignee ? `${nameOf(crit[0].assignee)} has it.` : 'Nobody has it yet.')}${crit[0].count > 1 ? ` Seen ${crit[0].count}×.` : ''}</p><div class="hero-acts"><button class="btn primary" data-crit-agent="${esc(crit[0].id)}">Give to agent</button><button class="btn" data-crit-me="${esc(crit[0].id)}">Assign to me</button></div>`}</section>` : '';
      $('#bug-list').innerHTML = hero + filters + `<div class="bug-board">${COLS.map(([key, label, sts]) => { const list = bugs.filter(b => sts.includes(b.status) && pass(b));
        return `<section class="bug-col" data-bcol="${key}"><header><b>${label}</b><span class="faint">${list.length}</span></header>${list.map(card).join('') || '<div class="bug-none">Nothing here</div>'}</section>`; }).join('')}</div>`;
    }
    $('#bug-list').querySelectorAll('.bug').forEach(el => {
      const bid = el.dataset.bid;
      const mk = el.querySelector('[data-mk]'); if (mk) mk.onclick = e => { e.stopPropagation(); toTask(bid); };
      el.querySelector('[data-bug-menu]').onclick = e => { e.stopPropagation(); menu(bid, e.currentTarget); };
      const f = el.querySelector('[data-att]'); if (f) f.onclick = e => { e.stopPropagation(); const b = bugs.find(x => x.id === bid); window.open(fileUrl(b, b.attachments[0]), '_blank', 'noopener'); };
      el.onclick = e => { if (!e.target.closest('button')) detail(bid); };
      el.onkeydown = e => { if (e.key === 'Enter') detail(bid); };
    });
    $('#bug-list').querySelectorAll('[data-crit]').forEach(r => r.onclick = () => detail(r.dataset.crit));
    const ca = $('#bug-list [data-crit-agent]'); if (ca) ca.onclick = async () => { try { const r = await C.api(`/bugs/${ca.dataset.critAgent}/agent`, { method: 'POST', body: {} }); window.TribeApp.toast(`${r.agent.name} has it`); load(); } catch (e) { window.TribeApp.toast(e.message); } };
    const cm = $('#bug-list [data-crit-me]'); if (cm) cm.onclick = () => patch(cm.dataset.critMe, { assignee: 'me' });
    // drag between columns
    $('#bug-list').querySelectorAll('.bug-board .bug').forEach(el => { el.draggable = true; el.ondragstart = e => e.dataTransfer.setData('text/bug', el.dataset.bid); });
    $('#bug-list').querySelectorAll('.bug-col').forEach(col => { col.ondragover = e => { e.preventDefault(); col.classList.add('over'); }; col.ondragleave = () => col.classList.remove('over');
      col.ondrop = e => { e.preventDefault(); col.classList.remove('over'); const bid = e.dataTransfer.getData('text/bug'); if (bid) patch(bid, { status: col.dataset.bcol }); }; });
  }
  async function toTask(bid) { try { await C.api(`/bugs/${bid}/task`, { method: 'POST' }); window.TribeApp.toast('Task created in Backlog'); load(); } catch (e) { window.TribeApp.toast(e.message); } }
  async function patch(bid, body) { try { await C.api('/bugs/' + bid, { method: 'PATCH', body }); } catch (e) { window.TribeApp.toast(e.message); } }
  async function copyMd(bid) {
    try { const { markdown } = await C.api(`/bugs/${bid}/markdown`); try { await navigator.clipboard.writeText(markdown); } catch { const t = document.createElement('textarea'); t.value = markdown; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); } window.TribeApp.toast('Copied as Markdown. Paste it into Claude.'); }
    catch (e) { window.TribeApp.toast(e.message); }
  }
  function menu(bid, anchor) {
    const b = bugs.find(x => x.id === bid); if (!b) return;
    const items = [
      { label: 'Assign to me', icon: 'i-users', run: () => patch(bid, { assignee: 'me' }) },
      { label: 'Give to agent', icon: 'i-robot', run: async () => { try { const r = await C.api(`/bugs/${bid}/agent`, { method: 'POST', body: {} }); window.TribeApp.toast(`${r.agent.name} has it, on ${r.bug.branch}`); load(); } catch (e) { window.TribeApp.toast(e.message); } } },
      { label: b.task ? 'Open linked task' : 'Convert to task', icon: 'i-check', run: () => (b.task ? window.TribeApp.show('tasks') : toTask(bid)) },
      '-',
      ...(['new', 'triaged'].includes(b.status) ? [{ label: 'Confirm', icon: 'i-tick', run: () => patch(bid, { status: 'confirmed' }) }] : []),
      { label: 'Mark duplicate…', icon: 'i-merge', run: () => dupPick(bid) },
      { label: 'Add screenshot or file…', icon: 'i-upload', run: () => attachPick(bid) },
      { label: 'Severity…', icon: 'i-zap', run: () => sevPick(bid, anchor) },
      CLOSED.includes(b.status) || b.status === 'resolved' ? { label: 'Reopen', icon: 'i-refresh', run: () => patch(bid, { status: 'confirmed' }) } : { label: 'Close', icon: 'i-x', run: () => patch(bid, { status: 'wontfix' }) },
      '-',
      { label: 'Copy as Markdown for Claude', icon: 'i-sparkle', run: () => copyMd(bid) },
    ];
    window.TribeFloat.menu(anchor, items);
  }
  function sevPick(bid, anchor) { window.TribeFloat.menu(anchor, ['critical', 'high', 'normal', 'low'].map(s => ({ label: s, run: () => patch(bid, { severity: s }) }))); }
  function dupPick(bid) {
    const others = bugs.filter(x => x.id !== bid && !CLOSED.includes(x.status));
    const body = $('#invite-body'); $('#invite-modal').classList.remove('hidden');
    body.innerHTML = `<h2>Duplicate of…</h2><div class="dup-list">${others.map(o => `<button class="dup-row" data-of="${esc(o.id)}">${sevChip(o.severity)}<span>${esc(o.title)}</span></button>`).join('') || '<p class="faint">No other open bugs.</p>'}</div><div class="modal-foot"><button class="btn" data-close>Cancel</button></div>`;
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    body.querySelectorAll('[data-of]').forEach(r => r.onclick = async () => { try { await C.api(`/bugs/${bid}/duplicate`, { method: 'POST', body: { of: r.dataset.of } }); $('#invite-modal').classList.add('hidden'); window.TribeApp.toast('Merged'); load(); } catch (e) { window.TribeApp.toast(e.message); } });
  }
  const dataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  async function attachFiles(bid, files) { for (const f of files) { if (f.size > 8 * 1024 * 1024) { window.TribeApp.toast(`${f.name} is over 8 MB`); continue; } await C.api(`/bugs/${bid}/attach`, { method: 'POST', body: { name: f.name, data: await dataUrl(f) } }); } }
  function attachPick(bid) { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.onchange = async () => { try { await attachFiles(bid, [...i.files]); window.TribeApp.toast('Attached'); load(); } catch (e) { window.TribeApp.toast(e.message); } }; i.click(); }
  function detail(bid) {
    const b = bugs.find(x => x.id === bid); if (!b || !window.TribeShell) return;
    window.TribeShell.preview({ kind: 'Bug', title: b.title, html: `<div class="bug-detail"><div class="top">${sevChip(b.severity)}<span class="chip">${esc(b.area)}</span><span class="chip">${esc(b.status)}</span>${b.assignee ? `<span class="faint">· ${esc(nameOf(b.assignee))}</span>` : ''}</div>
        ${b.repro ? `<h4>Steps to reproduce</h4><div class="md">${window.TribeMD.render(b.repro)}</div>` : ''}
        ${(b.attachments || []).length ? `<h4>Attachments</h4><div class="bug-atts">${b.attachments.map(a => /^image\//.test(a.type) ? `<button class="bug-att" data-preview-img="${esc(fileUrl(b, a))}" data-preview-title="${esc(a.name)}" data-preview-kind="Bug screenshot"><img alt="" src="${esc(fileUrl(b, a))}"></button>` : `<a href="${esc(fileUrl(b, a))}" target="_blank" rel="noopener">📎 ${esc(a.name)}</a>`).join('')}</div>` : ''}
        ${b.task ? `<p class="faint">Task <code>${esc(b.task)}</code>${b.branch ? ` · branch <code>${esc(b.branch)}</code>` : ''}</p>` : ''}${b.dupOf ? `<p class="faint">Duplicate of <code>${esc(b.dupOf)}</code></p>` : ''}
        <div class="md">${window.TribeMD.render(b.body || '')}</div></div>`,
      actions: [{ label: 'Copy for Claude', run: () => copyMd(bid) }] });
  }

  function capture() {
    const body = $('#invite-body');
    body.innerHTML = `<h2>Report a bug</h2>
      <div class="field"><label for="bug-title">What went wrong?</label><input class="input" id="bug-title" maxlength="160" placeholder="e.g. Dragging a task to Done doesn't stick"></div>
      <div class="field"><label for="bug-repro">Steps to reproduce</label><textarea class="input" id="bug-repro" style="height:84px;font-family:var(--font)" placeholder="1. …&#10;2. …"></textarea></div>
      <div class="field"><label for="bug-details">Anything else (optional)</label><textarea class="input" id="bug-details" style="height:64px;font-family:var(--font)"></textarea></div>
      <div class="bug-cap-files"><button class="btn ghost" id="bug-attach"><svg class="i" style="width:15px;height:15px"><use href="#i-image"/></svg>Add screenshot</button><span class="faint" id="bug-files"></span></div>
      <div class="faint" style="font-size:12px">Attached automatically: ${esc(currentView() || 'Home')} · v${esc(window.TribeUpdater ? window.TribeUpdater.current() : '')} · ${recent.length} log line${recent.length === 1 ? '' : 's'}</div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="bug-go">Send report</button></div>`;
    $('#invite-modal').classList.remove('hidden'); $('#bug-title').focus();
    let files = [];
    const show = () => { $('#bug-files').textContent = files.map(f => f.name).join(', '); };
    $('#bug-attach').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,video/*,.txt,.log,.json'; i.multiple = true; i.onchange = () => { files = files.concat([...i.files]); show(); }; i.click(); };
    body.addEventListener('paste', e => { const f = [...(e.clipboardData && e.clipboardData.files || [])]; if (f.length) { files = files.concat(f); show(); } });
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    $('#bug-go').onclick = async () => {
      const title = $('#bug-title').value.trim(); if (!title) return $('#bug-title').focus();
      if (!C.connected()) { window.TribeApp.toast('Connect to a tribe to send bug reports.'); return; }
      $('#bug-go').disabled = true;
      try {
        const r = await C.api('/bugs', { method: 'POST', body: { title, repro: $('#bug-repro').value, details: $('#bug-details').value, logs: recent.join('\n'), view: currentView(), version: window.TribeUpdater ? window.TribeUpdater.current() : '' } });
        if (files.length) await attachFiles(r.bug.id, files);
        $('#invite-modal').classList.add('hidden');
        window.TribeApp.toast(r.merged ? `Thanks! Merged with an existing report (seen ${r.bug.count}×).` : 'Thanks! Bug reported and sorted into the inbox.');
        if (loaded) load();
      } catch (e) { window.TribeApp.toast(e.message); $('#bug-go').disabled = false; }
    };
  }

  function upsert(b) { const i = bugs.findIndex(x => x.id === b.id); if (i >= 0) bugs[i] = b; else bugs.unshift(b); render(); }
  C.on('bug', b => { if (loaded) upsert(b); });
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); capture(); } });
  document.addEventListener('click', e => { if (!e.target.closest) return; const f = e.target.closest('[data-bf]'); if (f) { filter = f.dataset.bf; render(); } const sv = e.target.closest('[data-sevf]'); if (sv) { sev = sv.dataset.sevf; render(); } const w = e.target.closest('[data-whof]'); if (w) { who = w.dataset.whof; render(); } if (e.target.closest('#bug-new')) capture(); });

  window.TribeBugs = { load, capture };
})();
