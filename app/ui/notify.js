// Pocket agent, client side: title-bar bell + unread count, slide-over Inbox (All / Needs you / Mentions)
// with inline approve/deny, Settings → Notifications, idle/away reporting, web push subscribe,
// and native desktop notifications in the Tauri app.
(function () {
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  const isDesktop = !!(window.__TAURI__ && window.__TAURI__.core);
  const IDLE_MS = 3 * 60_000;

  let items = [], unread = 0, filter = 'all', prefs = null, meta = {};
  const approvals = new Map();
  const meId = () => (C.state().me || {}).id;

  // ---------- icons ----------
  const ICON = {
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    approval: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    mention: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    dm: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    'task-assigned': '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
    reminder: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M19 3l3 3"/>',
    proposal: '<path d="M4 21h16M6 21V10l6-6 6 6v11"/><path d="m9 14 2 2 4-4"/>',
    'bug-critical': '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7V4M3 12h4M17 12h4"/>',
    release: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4c3-1 6-1 6-1s0 3-1 6l-7 7-5-5z"/>',
    huddle: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    digest: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    'approval-question': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>',
    'approval-result': '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/>',
    test: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>',
    gear: '<path d="M10.3 2.6h3.4l.5 2.6a7.3 7.3 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.8a7.4 7.4 0 0 1 0 2.2l2 1.8-1.7 2.9-2.5-.9a7.3 7.3 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.3 7.3 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.8a7.4 7.4 0 0 1 0-2.2l-2-1.8 1.7-2.9 2.5.9a7.3 7.3 0 0 1 1.9-1.1z"/><circle cx="12" cy="12" r="2.8"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  const ico = (k, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.bell}</svg>`;

  // ---------- DOM ----------
  const bell = document.createElement('button');
  bell.id = 'nf-bell'; bell.className = 'nf-bell'; bell.title = 'Inbox'; bell.setAttribute('aria-label', 'Inbox');
  bell.innerHTML = `${ico('bell')}<span class="nf-count hidden" id="nf-count">0</span>`;
  const anchor = $('#sync-status');
  if (anchor) anchor.parentNode.insertBefore(bell, anchor); else ($('.titlebar') || document.body).appendChild(bell);

  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <div class="nf-scrim hidden" id="nf-scrim"></div>
  <aside class="nf-panel hidden" id="nf-panel" role="dialog" aria-label="Inbox">
    <header class="nf-head"><h2>Inbox</h2><span class="nf-sub" id="nf-sub"></span>
      <button class="nf-icon" id="nf-open-settings" title="Notification settings" aria-label="Notification settings">${ico('gear')}</button>
      <button class="nf-icon" id="nf-close" title="Close" aria-label="Close">${ico('x')}</button></header>
    <div class="nf-tabs" role="tablist"><button data-nf="all" class="on">All</button><button data-nf="needs">Needs you <span id="nf-needs-n"></span></button><button data-nf="mentions">Mentions</button></div>
    <div class="nf-list" id="nf-list"></div>
  </aside>
  <div class="nf-modal hidden" id="nf-settings" role="dialog" aria-label="Notification settings"><div class="nf-card" id="nf-settings-body"></div></div>`;
  document.body.append(...wrap.children);

  // ---------- inbox ----------
  const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
  const mine = a => !!a && (a.to || []).includes(meId());
  const pendingForMe = () => [...approvals.values()].filter(a => a.status === 'pending' && mine(a));
  const marks = () => meta.marks || (meta.marks = {});
  const snoozed = i => { const s = (marks()[i.id] || {}).snooze; return !!s && Date.parse(s) > Date.now(); };
  const isUnread = i => { if (snoozed(i)) return false; const mk = marks()[i.id] || {}; return mk.read === false || (mk.read !== true && (!meta.lastRead || i.at > meta.lastRead)); };
  const countUnread = () => items.filter(isUnread).length;
  function needsYou(i) {
    if (i.type === 'approval') { const a = approvals.get(i.approval); return !!a && a.status === 'pending' && mine(a); }
    return ['mention', 'dm', 'task-assigned', 'reminder', 'approval-question'].includes(i.type) && isUnread(i);
  }
  function setBadge() {
    unread = countUnread();
    const n = $('#nf-count');
    n.textContent = unread > 99 ? '99+' : String(unread); n.classList.toggle('hidden', !unread);
    bell.classList.toggle('has', !!unread);
    const p = pendingForMe().length; $('#nf-needs-n').textContent = p ? String(p) : '';
    bell.title = unread ? `Inbox · ${unread} unread` : 'Inbox';
  }
  const LABEL = { approval: 'Approval', mention: 'Mention', dm: 'Message', 'task-assigned': 'Task', reminder: 'Reminder', proposal: 'Proposal', 'bug-critical': 'Critical bug', release: 'Release', huddle: 'Huddle', digest: 'Digest', 'approval-question': 'Question', 'approval-result': 'Decision', 'comment-reply': 'Comment', 'meeting-notes': 'Meeting', 'visual-diff': 'Visuals', repo: 'Code repository' };
  // v0.26: group titles count all of them; how many are unread shows as its own "N new" (it used to say "new" for read ones too)
  const GROUP = { /* task-assigned: each one is answered on its own (Accept / Decline) */ mention: n => `${n} mentions`, dm: n => `${n} messages`, proposal: n => `${n} proposals`,
    release: n => `${n} releases`, huddle: n => `${n} huddles started`, 'bug-critical': n => `${n} critical bugs`, reminder: n => `${n} reminders` };
  const openGroups = new Set();

  function approvalBlock(i) {
    const a = approvals.get(i.approval);
    if (!a) return '';
    const details = a.details ? `<div class="nf-details">${esc(a.details)}</div>` : '';
    const qs = (a.questions || []).map(q => `<div class="nf-q"><b>${esc(q.name)}</b> asked: ${esc(q.text)}</div>`).join('');
    const risk = `<span class="nf-risk ${esc(a.risk)}">${esc(a.risk)} risk</span>`;
    if (a.status === 'pending') {
      if (!mine(a)) return `${details}${qs}<div class="nf-actions">${risk}<span class="nf-faint">waiting on ${esc((a.toNames || []).join(', ') || 'a teammate')}</span></div>`;
      const myAgent = (C.state().members || []).some(m => m.id === a.by && m.role === 'agent' && m.owner === meId());
      return `${details}${qs}
        <div class="nf-comment"><input class="input" data-cm="${esc(a.id)}" maxlength="500" placeholder="Optional comment, or a question for ${esc(a.byName || 'them')}">
          ${a.risk === 'low' && myAgent ? `<label class="nf-always" title="Future low-risk “${esc(a.kind)}” requests from your agent are approved automatically. Revoke in Settings."><input type="checkbox" data-always="${esc(a.id)}"> Always allow</label>` : ''}</div>
        <div class="nf-actions">${risk}
          <span style="flex:1"></span>
          <button class="linkish nf-ask" data-ask="${esc(a.id)}">Ask a question</button>
          <button class="btn nf-deny" data-decide="deny" data-ap="${esc(a.id)}">Deny</button><button class="btn primary nf-approve" data-decide="approve" data-ap="${esc(a.id)}">Approve</button></div>`;
    }
    return `${details}${qs}<div class="nf-actions">${risk}<span class="nf-state ${esc(a.status)}">${a.status === 'closed' ? 'Closed' : a.status === 'approved' ? 'Approved' : 'Denied'}${a.decidedByName ? ' by ' + esc(a.decidedByName) : ''}${a.note ? ` · “${esc(a.note)}”` : ''}</span></div>`;
  }
  // feat/tasks-company: a task offered to you answers right here (Accept, or Decline with a reason)
  function offerBlock(i) {
    const T = window.TribeTasks, t = T && T.all ? T.all().find(x => x.id === i.ref) : null;
    if (t && t.accept !== 'pending') return `<div class="nf-actions"><span class="nf-state">${t.accept === 'accepted' ? 'Accepted' : t.declined ? 'Declined' : 'No longer waiting'}</span></div>`;
    return `<div class="nf-actions nf-offer" data-offer="${esc(i.ref)}" data-proj="${esc(i.project || '')}"><input class="input nf-why hidden" maxlength="300" placeholder="Why not? (sent to whoever assigned it)" aria-label="Reason for declining">
      <button class="btn nf-deny" data-tkans="decline">Decline</button><button class="btn primary nf-approve" data-tkans="accept">Accept</button></div>`;
  }
  const itemHtml = (i, extra = '') => `
      <article class="nf-item ${isUnread(i) ? 'unread' : ''} ${i.priority === 'high' ? 'hi' : ''} ${extra}" data-id="${esc(i.id)}" data-view="${esc(i.view || '')}" data-ref="${esc(i.ref || '')}" data-type="${esc(i.type)}">
        <div class="nf-ico t-${esc(i.type)}">${ico(i.type)}</div>
        <div class="nf-main"><div class="nf-title"><span>${esc(i.title)}</span><time>${ago(i.at)}</time><button class="nf-more" data-more="${esc(i.id)}" title="More" aria-label="More actions">…</button></div>
          ${i.body && i.type !== 'approval' ? `<div class="nf-body">${esc(i.body)}</div>` : ''}
          ${i.type === 'approval' ? approvalBlock(i) : ''}${i.type === 'task-assigned' && i.ref ? offerBlock(i) : ''}</div>
      </article>`;
  // Repeated items of one kind (back to back) collapse into "3 new tasks assigned to you".
  function grouped(list) {
    const out = [];
    for (const i of list) {
      const last = out[out.length - 1];
      if (GROUP[i.type] && last && last.type === i.type && Date.parse(last.items[0].at) - Date.parse(i.at) < 12 * 3600_000) last.items.push(i);
      else out.push({ type: i.type, items: [i] });
    }
    return out;
  }
  function awayCard() {
    const s = meta.away; if (!s || filter !== 'all') return '';
    const counts = Object.entries(s.counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="nf-chip">${n} ${esc((LABEL[t] || t).toLowerCase())}${n > 1 && !/s$/.test(LABEL[t] || t) ? 's' : ''}</span>`).join('');
    return `<section class="nf-away" id="nf-away-card"><div class="nf-away-head"><b>While you were away</b><span class="nf-faint">${esc(s.span)}</span><button class="nf-icon" id="nf-away-x" title="Dismiss" aria-label="Dismiss">${ico('x')}</button></div>
      <div class="nf-chips">${counts}</div>
      <ol>${s.top.map(i => `<li data-jump="${esc(i.id)}">${esc(i.title)}</li>`).join('')}</ol></section>`;
  }
  function render() {
    if (meta.history) return renderHistory();
    let list = items.filter(i => !snoozed(i) && (filter === 'all' || (filter === 'needs' ? needsYou(i) : ['mention', 'dm'].includes(i.type))));
    const lowPending = pendingForMe().filter(a => a.risk === 'low');
    $('#nf-sub').textContent = countUnread() ? `${countUnread()} new` : '';
    const groups = grouped(list);
    const bulk = filter !== 'mentions' && lowPending.length > 1 ? `<div class="nf-bulk"><span>${lowPending.length} low-risk requests waiting</span><button class="btn" id="nf-bulk">Approve all low-risk</button></div>` : '';
    $('#nf-list').innerHTML = awayCard() + bulk + (list.length ? groups.map(g => {
      if (g.items.length === 1) return itemHtml(g.items[0]);
      const key = g.items[0].id, open = openGroups.has(key), un = g.items.filter(isUnread).length;
      return `<div class="nf-group ${open ? 'open' : ''}"><button class="nf-group-head ${un ? 'unread' : ''}" data-group="${esc(key)}"><div class="nf-ico t-${esc(g.type)}">${ico(g.type)}</div>
        <span class="nf-g-title">${esc(GROUP[g.type](g.items.length))}${un ? ` <span class="nf-g-new">${un} new</span>` : ''}</span><time>${ago(g.items[0].at)}</time><span class="nf-caret">${open ? '−' : '+'}</span></button>
        ${open ? g.items.map(i => itemHtml(i, 'sub')).join('') : ''}</div>`;
    }).join('')
      : `<div class="nf-empty"><span class="nf-empty-ic" aria-hidden="true">${filter === 'mentions' ? '💬' : '✨'}</span><b>${filter === 'needs' ? 'Nothing needs you right now' : filter === 'mentions' ? 'No mentions yet' : 'You’re all caught up'}</b><span>${filter === 'needs' ? 'Approvals and reviews show up here.' : filter === 'mentions' ? 'When someone @mentions you, it lands here.' : 'Approvals, mentions, bugs and DMs land here.'}</span><button class="btn sm" id="nf-empty-settings">Choose what pings you</button></div>`)
      + `<div class="nf-foot"><button class="linkish" id="nf-history">Approvals history</button>${countUnread() ? '<button class="linkish" id="nf-allread">Mark all read</button>' : ''}</div>`;
    const es = $('#nf-empty-settings'); if (es) es.onclick = openSettings;
    $('#nf-history').onclick = () => { meta.history = true; render(); };
    const ar = $('#nf-allread'); if (ar) ar.onclick = markAllRead;
    const ax = $('#nf-away-x'); if (ax) ax.onclick = () => { meta.away = null; render(); };
    const bk = $('#nf-bulk'); if (bk) bk.onclick = async () => {
      bk.disabled = true;
      try { const { approved } = await C.api('/approvals/bulk', { method: 'POST', body: {} }); approved.forEach(a => approvals.set(a.id, a)); toast(`Approved ${approved.length} low-risk request${approved.length === 1 ? '' : 's'}`); render(); }
      catch (e) { toast(e.message); bk.disabled = false; }
    };
    setBadge();
  }
  function renderHistory() {
    const done = [...approvals.values()].filter(a => a.status !== 'pending').sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt)));
    $('#nf-sub').textContent = '';
    $('#nf-list').innerHTML = `<div class="nf-hist-head"><button class="linkish" id="nf-back">← Inbox</button><b>Approvals history</b></div>` + (done.length ? `<div class="nf-hist">${done.map(a => `
      <div class="nf-hrow"><span class="nf-mark ${esc(a.status)}">${a.status === 'approved' ? '✓' : '✕'}</span>
        <div><div><b>${esc(a.decidedByName || 'someone')}</b> ${esc(a.status)} <span class="nf-ht">${esc(a.title)}</span></div>
        <div class="nf-faint">for ${esc(a.byName)} · ${esc(a.risk)} risk${a.auto ? ' · rule' : ''}${a.note ? ` · “${esc(a.note)}”` : ''}</div></div>
        <time title="${esc(a.decidedAt || '')}">${a.decidedAt ? ago(a.decidedAt) : ''}</time></div>`).join('')}</div>` : '<div class="nf-empty">No decisions yet.</div>');
    $('#nf-back').onclick = () => { meta.history = false; render(); };
  }
  async function markAllRead() {
    try { await C.api('/notify/read', { method: 'POST' }); meta.lastRead = new Date().toISOString(); for (const k of Object.keys(marks())) delete marks()[k].read; render(); } catch {}
  }
  async function setMark(nid, patch) {
    try { const r = await C.api(`/notify/items/${encodeURIComponent(nid)}`, { method: 'POST', body: patch }); marks()[nid] = r.mark; render(); } catch (e) { toast(e.message); }
  }
  async function decideAp(aid, decision) {
    const cm = document.querySelector(`[data-cm="${CSS.escape(aid)}"]`), al = document.querySelector(`[data-always="${CSS.escape(aid)}"]`);
    const { approval } = await C.api(`/approvals/${aid}/${decision}`, { method: 'POST', body: { note: cm ? cm.value.trim() : '', always: !!(al && al.checked) } });
    approvals.set(approval.id, approval);
    if (approval.ruleAdded) toast('Approved. Future requests like this from your agent are allowed automatically.');
    render();
  }
  $('#nf-list').addEventListener('click', async e => {
    const btn = e.target.closest('[data-decide]');
    if (btn) { e.stopPropagation(); btn.disabled = true; try { await decideAp(btn.dataset.ap, btn.dataset.decide); } catch (err) { toast(err.message); btn.disabled = false; } return; }
    const ans = e.target.closest('[data-tkans]');
    if (ans) {
      e.stopPropagation(); const box = ans.closest('[data-offer]'), why = box.querySelector('.nf-why'), act = ans.dataset.tkans;
      if (act === 'decline' && (why.classList.contains('hidden') || !why.value.trim())) { why.classList.remove('hidden'); why.focus(); ans.textContent = 'Send decline'; return; }
      ans.disabled = true;
      try {
        const r = await C.api(`/tasks/${encodeURIComponent(box.dataset.offer)}/${act}`, { method: 'POST', body: act === 'decline' ? { reason: why.value.trim() } : {}, ...(box.dataset.proj ? { project: box.dataset.proj } : {}) });
        if (window.TribeTasks && window.TribeTasks.load) window.TribeTasks.load();
        toast(act === 'accept' ? `Accepted: ${r.task.title}. It's yours and in progress.` : 'Declined. They get it back with your reason.');
        box.outerHTML = `<div class="nf-actions"><span class="nf-state">${act === 'accept' ? 'Accepted' : 'Declined'}</span></div>`;
      } catch (err) { toast(err.message); ans.disabled = false; }
      return;
    }
    const ask = e.target.closest('[data-ask]');
    if (ask) {
      e.stopPropagation(); const inp = document.querySelector(`[data-cm="${CSS.escape(ask.dataset.ask)}"]`);
      if (!inp.value.trim()) { inp.focus(); inp.placeholder = 'Type your question, then Ask'; return; }
      try { const { approval } = await C.api(`/approvals/${ask.dataset.ask}/question`, { method: 'POST', body: { text: inp.value.trim() } }); approvals.set(approval.id, approval); toast('Question sent'); render(); } catch (err) { toast(err.message); }
      return;
    }
    const more = e.target.closest('[data-more]');
    if (more) { e.stopPropagation(); return openMenu(more, items.find(i => i.id === more.dataset.more)); }
    const g = e.target.closest('[data-group]');
    if (g) { openGroups.has(g.dataset.group) ? openGroups.delete(g.dataset.group) : openGroups.add(g.dataset.group); return render(); }
    const j = e.target.closest('[data-jump]');
    if (j) return highlight(j.dataset.jump);
    if (e.target.closest('input, label, .nf-comment, .nf-offer')) return;
    const it = e.target.closest('.nf-item'); if (!it || it.dataset.type === 'approval') return;
    if (isUnread(items.find(i => i.id === it.dataset.id) || {})) setMark(it.dataset.id, { read: true });
    go(it.dataset.view, it.dataset.ref);
  });
  document.querySelectorAll('[data-nf]').forEach(b => b.onclick = () => { filter = b.dataset.nf; meta.history = false; document.querySelectorAll('[data-nf]').forEach(x => x.classList.toggle('on', x === b)); render(); });

  // ---------- the "…" menu: open, read/unread, snooze, mute this kind, forward to chat ----------
  const menu = document.createElement('div'); menu.className = 'nf-menu hidden'; menu.id = 'nf-menu'; document.body.appendChild(menu);
  const at = (h, m = 0, addDays = 0) => { const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(h, m, 0, 0); return d; };
  function snoozeTimes() {
    const tonight = at(19); const t = tonight > new Date(Date.now() + 30 * 60_000) ? tonight : new Date(Date.now() + 3 * 3600_000);
    return [['1h', 'For 1 hour', new Date(Date.now() + 3600_000)], ['tonight', 'Until tonight', t], ['tomorrow', 'Until tomorrow', at(9, 0, 1)]];
  }
  function dmChannels() {
    return (C.state().members || []).filter(m => m.role !== 'agent' && m.id !== meId()).map(m => ({ ch: 'dm-' + [m.id, meId()].sort().join('-'), name: m.name }));
  }
  function openMenu(anchorEl, item) {
    if (!item) return;
    const un = isUnread(item);
    menu.innerHTML = `
      <button data-m="open">Open</button>
      <button data-m="${un ? 'read' : 'unread'}">Mark as ${un ? 'read' : 'unread'}</button>
      <div class="nf-menu-sep"></div><div class="nf-menu-label">Snooze</div>
      ${snoozeTimes().map(([k, l]) => `<button data-m="snooze" data-s="${k}">${l}</button>`).join('')}
      ${item.type !== 'approval' ? `<div class="nf-menu-sep"></div><button data-m="mute">Mute ${esc((LABEL[item.type] || item.type).toLowerCase())}s</button>` : ''}
      <div class="nf-menu-sep"></div><div class="nf-menu-label">Forward to chat</div>
      <button data-m="fwd" data-ch="general"># general</button>
      ${dmChannels().map(d => `<button data-m="fwd" data-ch="${esc(d.ch)}">@ ${esc(d.name)}</button>`).join('')}`;
    menu.classList.remove('hidden');
    const r = anchorEl.getBoundingClientRect();
    menu.style.top = Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8) + 'px';
    menu.style.left = Math.max(8, r.right - menu.offsetWidth) + 'px';
    menu.onclick = async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      menu.classList.add('hidden');
      const k = b.dataset.m;
      if (k === 'open') { if (isUnread(item)) setMark(item.id, { read: true }); return item.type === 'approval' ? highlight(item.id) : go(item.view, item.ref); }
      if (k === 'read' || k === 'unread') return setMark(item.id, { read: k === 'read' });
      if (k === 'snooze') { const [, label, when] = snoozeTimes().find(s => s[0] === b.dataset.s); await setMark(item.id, { snooze: when.toISOString() }); return toast(`Snoozed ${label.toLowerCase()}`); }
      if (k === 'mute') { try { await C.api('/notify/mute', { method: 'POST', body: { type: item.type } }); toast(`Muted. ${LABEL[item.type] || 'These'}s go to your digest now. Undo in Settings.`); } catch (err) { toast(err.message); } return; }
      if (k === 'fwd') { try { await C.api('/notify/forward', { method: 'POST', body: { id: item.id, channel: b.dataset.ch } }); toast(b.dataset.ch === 'general' ? 'Forwarded to #general' : 'Forwarded'); } catch (err) { toast(err.message); } }
    };
  }
  document.addEventListener('click', e => { if (!e.target.closest('#nf-menu') && !e.target.closest('[data-more]')) menu.classList.add('hidden'); });

  // Open the inbox scrolled to one item (from a chat link, the away card or the menu).
  async function highlight(nid) {
    if (!items.some(i => i.id === nid)) {
      try { const { item } = await C.api(`/notify/items/${encodeURIComponent(nid)}`); items.unshift({ ...item, shared: true }); if (item.approval && !approvals.has(item.approval)) { const r = await C.api('/approvals/' + item.approval).catch(() => null); if (r) approvals.set(r.approval.id, r.approval); } }
      catch { toast('That notification is no longer available'); return; }
    }
    filter = 'all'; meta.history = false; document.querySelectorAll('[data-nf]').forEach(x => x.classList.toggle('on', x.dataset.nf === 'all'));
    const grp = grouped(items).find(g => g.items.some(i => i.id === nid)); if (grp && grp.items.length > 1) openGroups.add(grp.items[0].id);
    if ($('#nf-panel').classList.contains('hidden')) openInbox(); else render();
    const el = document.querySelector(`.nf-item[data-id="${CSS.escape(nid)}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
  }

  // Forwarded notifications in chat: "[open](#notif:<id>)" becomes a link, the quote becomes a compact card.
  function linkify(root) {
    root.querySelectorAll('.msg p:not([data-nf])').forEach(p => {
      p.dataset.nf = '1';
      if (!p.innerHTML.includes('#notif:')) return;
      p.innerHTML = p.innerHTML.replace(/\[open\]\(#notif:([A-Za-z0-9_-]+)\)/g, '<a href="#notif:$1" class="nf-open-link">Open in inbox</a>').replace(/(^|<br>)&gt;\s?/g, '$1');
      p.classList.add('nf-fwd');
    });
  }
  const chatList = $('#chat-list');
  if (chatList) {
    new MutationObserver(() => linkify(chatList)).observe(chatList, { childList: true, subtree: true }); linkify(chatList);
    chatList.addEventListener('click', e => { const a = e.target.closest('a[href^="#notif:"]'); if (!a) return; e.preventDefault(); highlight(a.getAttribute('href').slice(7)); });
  }

  function go(view, ref) {
    closeInbox();
    if (!view || view === 'inbox') return openInbox();
    if (view === 'chat') { window.TribeApp.show('chat'); return; }
    if (view === 'pins') { if (window.TribePins) window.TribePins.openRef(ref); return; }   // P1-E: a comment pin on the preview (app/ui/pins.js)
    if (window.TribeApp && window.TribeApp.show) window.TribeApp.show(view);
    if (view === 'docs' && ref && window.TribeDocs && window.TribeDocs.open) window.TribeDocs.open(ref);
  }

  // "While you were away": one card, not a flood of toasts. Away = no activity here for 30+ minutes.
  const AWAY_KEY = 'tribecode.lastActive', AWAY_MS = 30 * 60_000;
  const lastActive = () => { try { return Number(localStorage.getItem(AWAY_KEY)) || 0; } catch { return 0; } };
  const stamp = () => { try { localStorage.setItem(AWAY_KEY, String(Date.now())); } catch {} };
  let awaySince = lastActive();
  function buildAway(since) {
    if (!since || Date.now() - since < AWAY_MS) return;
    const fresh = items.filter(i => Date.parse(i.at) > since && i.type !== 'digest');
    if (!fresh.length) return;
    const counts = {}; fresh.forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
    const rank = i => (i.type === 'approval' ? 0 : i.priority === 'high' ? 1 : i.priority === 'low' ? 3 : 2);
    const top = fresh.slice().sort((a, b) => rank(a) - rank(b) || b.at.localeCompare(a.at)).slice(0, 3);
    const hrs = (Date.now() - since) / 3600_000;
    meta.away = { counts, top, span: hrs < 1 ? `${Math.round(hrs * 60)} min` : hrs < 48 ? `${Math.round(hrs)} h` : `${Math.round(hrs / 24)} days` };
  }
  setInterval(() => { if (!document.hidden) stamp(); }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stamp(); return; }
    const since = lastActive(); stamp();
    if (Date.now() - since >= AWAY_MS) { buildAway(since); render(); }
  });

  async function load() {
    if (!C.connected()) return;
    try {
      const [ib, ap] = await Promise.all([C.api('/notify/inbox'), C.api('/approvals')]);
      items = ib.items; meta.lastRead = ib.lastRead; meta.marks = ib.marks || {};
      approvals.clear(); ap.approvals.forEach(a => approvals.set(a.id, a));
      if (awaySince) { buildAway(awaySince); awaySince = 0; }
      stamp(); render();
    } catch {}
  }
  setInterval(() => { if (items.some(i => (marks()[i.id] || {}).snooze)) render(); }, 60_000);   // snoozed items wake up
  function openInbox() {
    $('#nf-panel').classList.remove('hidden'); $('#nf-scrim').classList.remove('hidden');
    render();
  }
  function closeInbox() {
    if ($('#nf-panel').classList.contains('hidden')) return;
    $('#nf-panel').classList.add('hidden'); $('#nf-scrim').classList.add('hidden'); menu.classList.add('hidden');
    meta.history = false; meta.away = null;
    if (items.some(i => isUnread(i) && i.type !== 'approval')) markAllRead();
  }
  bell.onclick = () => ($('#nf-panel').classList.contains('hidden') ? openInbox() : closeInbox());
  $('#nf-close').onclick = closeInbox; $('#nf-scrim').onclick = closeInbox;
  $('#nf-open-settings').onclick = () => openSettings();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.classList.add('hidden'); closeSettings(); closeInbox(); } });

  // ---------- live updates ----------
  C.on('hello', () => { load(); sendState(true); });
  C.on('notification', m => {
    if (!m.item) return;
    if (m.pocket) { desktopNotify(m.item); return; }
    if (!items.some(x => x.id === m.item.id)) items.unshift(m.item);
    items = items.slice(0, 200);
    if ($('#nf-panel').classList.contains('hidden') && !document.hidden && m.item.priority === 'high' && !meta.away) toast(m.item.title);
    render();
  });
  C.on('approval', m => { if (m.approval) { approvals.set(m.approval.id, m.approval); render(); } });

  // native notification in the desktop app when its window is hidden
  async function desktopNotify(item) {
    const n = window.__TAURI__ && window.__TAURI__.notification;
    if (!n || !document.hidden) return;
    try {
      let ok = await n.isPermissionGranted();
      if (!ok) ok = (await n.requestPermission()) === 'granted';
      if (ok) n.sendNotification({ title: item.title, body: item.body || '' });
    } catch {}
  }

  // ---------- idle / away reporting ----------
  let idle = false, idleTimer = null;
  function sendState(force) { C.send({ type: 'activity', idle, tz, desktop: isDesktop }); if (force) {} }
  function setIdle(v) { if (v === idle) return; idle = v; sendState(); }
  function poke() { if (document.hidden) return; setIdle(false); clearTimeout(idleTimer); idleTimer = setTimeout(() => setIdle(true), IDLE_MS); }
  document.addEventListener('visibilitychange', () => (document.hidden ? setIdle(true) : poke()));
  let lastPoke = 0;
  for (const ev of ['pointerdown', 'keydown', 'pointermove', 'wheel', 'touchstart']) addEventListener(ev, () => { const t = Date.now(); if (t - lastPoke > 5000) { lastPoke = t; poke(); } }, { passive: true });
  poke();

  // ---------- settings ----------
  const TYPE_ROWS = [
    ['approval', 'Approvals', 'Agents and teammates asking before they act'],
    ['mention', 'Mentions', 'Someone writes @you in chat'],
    ['dm', 'Direct messages', 'Messages sent only to you'],
    ['task-assigned', 'Assigned to me', 'A task lands on your plate'],
    ['reminder', 'Reminders', 'Things you asked to be reminded of'],
    ['proposal', 'Proposals', 'New proposals waiting for your vote'],
    ['bug-critical', 'Critical bugs', 'Crashes and data loss'],
    ['release', 'Releases', 'Off sends these to the digest'],
    ['huddle', 'Huddles', 'Off sends these to the digest'],
    ['comment-reply', 'Doc comments', 'Replies in comment threads you are in'],
    ['meeting-notes', 'Meeting notes', 'Off sends these to the digest'],
    ['visual-diff', 'Visual changes', 'A screen changed by more than 5%'],
  ];
  const toggle = (key, label, sub, on, extra = '') => `<button class="toggle nf-tg" role="switch" aria-checked="${on ? 'true' : 'false'}" data-k="${esc(key)}" ${extra}><span><span class="nf-tg-l">${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="switch"></span></button>`;
  const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;

  async function openSettings() {
    closeInbox();
    const m = $('#nf-settings'); m.classList.remove('hidden');
    const body = $('#nf-settings-body');
    body.innerHTML = '<div class="nf-set-head"><h2>Notifications</h2></div><p class="nf-faint">Loading…</p>';
    try { const [r, rl] = await Promise.all([C.api('/notify/prefs'), C.api('/approvals/rules').catch(() => ({ rules: [] }))]); prefs = r.prefs; meta.ntfyUrl = r.ntfyUrl; meta.devices = r.webpushDevices; meta.vapid = r.vapidPublicKey; meta.rules = rl.rules; }
    catch (e) { body.innerHTML = `<div class="nf-set-head"><h2>Notifications</h2><button class="nf-icon" data-x title="Close" aria-label="Close">${ico('x')}</button></div><p class="nf-faint">${esc(C.connected() ? e.message : 'Join or host a tribe to set up notifications.')}</p>`; body.querySelector('[data-x]').onclick = closeSettings; return; }
    renderSettings();
  }
  function closeSettings() { $('#nf-settings').classList.add('hidden'); }
  $('#nf-settings').addEventListener('click', e => { if (e.target.id === 'nf-settings') closeSettings(); });

  function renderSettings() {
    const p = prefs, body = $('#nf-settings-body');
    const q = p.when.quiet;
    body.innerHTML = `
      <div class="nf-set-head"><h2>Notifications</h2><span class="nf-saved" id="nf-saved"></span><button class="nf-icon" data-x title="Close" aria-label="Close">${ico('x')}</button></div>
      <div class="nf-set-grid">
        <section class="nf-sec"><h6>Ping me about</h6><div class="toggles">
          ${TYPE_ROWS.map(([k, l, s]) => toggle('types.' + k, l, s, !!p.types[k])).join('')}
        </div></section>
        <div class="nf-col">
          <section class="nf-sec"><h6>When</h6>
            <div class="nf-seg" role="radiogroup"><button data-mode="away" class="${p.when.mode === 'away' ? 'on' : ''}">Only when I'm away</button><button data-mode="always" class="${p.when.mode === 'always' ? 'on' : ''}">Always</button></div>
            <p class="nf-faint nf-note">Away means the app is closed, or hidden for
              <select id="nf-away" class="nf-sel">${[1, 5, 15, 30].map(v => `<option value="${v}" ${p.when.awayMinutes === v ? 'selected' : ''}>${v} min</option>`).join('')}</select>.</p>
            <div class="toggles">${toggle('when.quiet.on', 'Quiet hours', 'Hold pings, deliver them after', q.on)}</div>
            <div class="nf-row ${q.on ? '' : 'dim'}" id="nf-quiet-row"><label>From <input type="time" id="nf-q-from" value="${esc(q.from)}"></label><label>to <input type="time" id="nf-q-to" value="${esc(q.to)}"></label><span class="nf-faint nf-tz">${esc(p.tz)}</span></div>
            <div class="toggles">${toggle('digest.on', 'Digest', 'Low-priority items batched into one summary', p.digest.on)}</div>
            <div class="nf-row ${p.digest.on ? '' : 'dim'}"><label>Send <select id="nf-digest" class="nf-sel">
              ${[2, 4, 8].map(h => `<option value="h${h}" ${!p.digest.at && p.digest.everyHours === h ? 'selected' : ''}>at most every ${h} hours</option>`).join('')}
              ${['09:00', '18:00'].map(t => `<option value="t${t}" ${p.digest.at === t ? 'selected' : ''}>daily at ${t}</option>`).join('')}</select></label></div>
          </section>
          <section class="nf-sec"><h6>How</h6><div class="toggles">
            ${toggle('channels.ntfy', 'Phone, via the ntfy app', 'Free, no account. Works on iPhone and Android', p.channels.ntfy)}
            ${toggle('channels.webpush', 'Browser and Home Screen app', meta.devices ? `${meta.devices} device${meta.devices > 1 ? 's' : ''} connected` : 'Web push, enable it below', p.channels.webpush)}
            ${toggle('channels.desktop', 'Desktop app', 'System notification when the window is hidden', p.channels.desktop)}
          </div></section>
          ${(meta.rules || []).length ? `<section class="nf-sec"><h6>Always allowed for your agent</h6><div class="nf-rules">${meta.rules.map(r => `<div class="nf-rule"><div><b>${esc(r.kind)}</b><small>${esc(r.agentName)} · low risk · e.g. “${esc(r.example || '')}”</small></div><button class="btn ghost" data-revoke="${esc(r.id)}">Revoke</button></div>`).join('')}</div></section>` : ''}
        </div>
        <section class="nf-sec nf-phone"><h6>Connect your phone</h6>
          <div class="nf-phone-grid">
            <div class="nf-qr" id="nf-qr" title="Scan to subscribe"></div>
            <div>
              <ol class="nf-steps"><li>Install <b>ntfy</b> (free) from the App Store or Google Play.</li><li>Scan the code, or subscribe to this topic:</li></ol>
              <div class="nf-topic"><code id="nf-topic">${esc(p.ntfy.topic)}</code><button class="btn" id="nf-copy">Copy</button><button class="btn ghost" id="nf-newtopic" title="Make a new secret topic">New</button></div>
              <label class="nf-server">Server <input class="input" id="nf-server" value="${esc(p.ntfy.server)}" spellcheck="false"></label>
              <p class="nf-faint nf-note">The topic is a secret: anyone who knows it can read your pings. Self-hosting ntfy? Put its URL above.</p>
            </div>
          </div>
          <div class="nf-device"><button class="btn" id="nf-webpush" ${pushOk() ? '' : 'disabled'}>Enable notifications on this device</button>
            <span class="nf-faint">${pushOk() ? (meta.devices ? 'Already on for at least one device.' : 'Works in the installed Home Screen app and in browsers.') : 'Needs HTTPS or localhost (or the installed app). Use ntfy instead.'}</span></div>
        </section>
      </div>
      <div class="nf-set-foot"><button class="btn" id="nf-test">Send test</button><span class="nf-faint" id="nf-test-out"></span><span style="flex:1"></span><button class="btn primary" data-x>Done</button></div>`;
    $('#nf-qr').innerHTML = window.TribeQR ? window.TribeQR.svg(`${p.ntfy.server}/${p.ntfy.topic}`, { fg: '#12151A', bg: '#F8FAFC', border: 2 }) : '';
    body.querySelectorAll('[data-x]').forEach(b => b.onclick = closeSettings);
    body.querySelectorAll('.nf-tg').forEach(b => b.onclick = () => {
      const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(on));
      const path = b.dataset.k.split('.'); let o = prefs; for (const k of path.slice(0, -1)) o = o[k]; o[path[path.length - 1]] = on;
      if (b.dataset.k === 'when.quiet.on') $('#nf-quiet-row').classList.toggle('dim', !on);
      if (b.dataset.k === 'digest.on') $('#nf-digest').closest('.nf-row').classList.toggle('dim', !on);
      save();
    });
    body.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { prefs.when.mode = b.dataset.mode; body.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); save(); });
    $('#nf-away').onchange = e => { prefs.when.awayMinutes = +e.target.value; save(); };
    $('#nf-q-from').onchange = e => { prefs.when.quiet.from = e.target.value; save(); };
    $('#nf-q-to').onchange = e => { prefs.when.quiet.to = e.target.value; save(); };
    $('#nf-digest').onchange = e => { const v = e.target.value; if (v[0] === 'h') { prefs.digest.everyHours = +v.slice(1); prefs.digest.at = ''; } else prefs.digest.at = v.slice(1); save(); };
    $('#nf-server').onchange = e => { prefs.ntfy.server = e.target.value.trim(); save(true); };
    $('#nf-copy').onclick = async () => { try { await navigator.clipboard.writeText(prefs.ntfy.topic); toast('Topic copied'); } catch { getSelection().selectAllChildren($('#nf-topic')); } };
    $('#nf-newtopic').onclick = async () => { try { await C.api('/notify/topic', { method: 'POST' }); await openSettings(); toast('New topic made. Subscribe to it in ntfy.'); } catch (e) { toast(e.message); } };
    $('#nf-webpush').onclick = enableWebPush;
    body.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { try { await C.api('/approvals/rules/' + b.dataset.revoke, { method: 'DELETE' }); meta.rules = meta.rules.filter(r => r.id !== b.dataset.revoke); renderSettings(); toast('Rule revoked. Those requests will ask you again.'); } catch (e) { toast(e.message); } });
    $('#nf-test').onclick = async () => {
      const out = $('#nf-test-out'); out.textContent = 'Sending…';
      try { const { channels } = await C.api('/notify/test', { method: 'POST' }); out.textContent = channels.length ? `Sent via ${channels.join(', ')}` : 'No channel is connected yet'; }
      catch (e) { out.textContent = e.message; }
    };
  }
  let saveTimer;
  function save(rerender) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const r = await C.api('/notify/prefs', { method: 'PUT', body: { ...prefs, tz } });
        prefs = r.prefs; meta.ntfyUrl = r.ntfyUrl;
        const s = $('#nf-saved'); if (s) { s.textContent = 'Saved'; setTimeout(() => { s.textContent = ''; }, 1400); }
        if (rerender) renderSettings();
      } catch (e) { toast(e.message); }
    }, 250);
  }

  const keyBytes = b64 => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  async function enableWebPush() {
    if (!pushOk()) return toast('This device needs HTTPS (or the installed app) for push. Use ntfy instead.');
    try {
      if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return toast('Notifications are blocked for this site.');
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await C.api('/notify/vapid');
      let sub = await reg.pushManager.getSubscription();
      if (sub && sub.options && sub.options.applicationServerKey) {
        const cur = new Uint8Array(sub.options.applicationServerKey), want = keyBytes(publicKey);
        if (cur.length !== want.length || cur.some((v, i) => v !== want[i])) { await sub.unsubscribe(); sub = null; }
      }
      sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const r = await C.api('/notify/webpush', { method: 'POST', body: { subscription: sub.toJSON() } });
      meta.devices = r.devices; toast('Notifications are on for this device'); renderSettings();
    } catch (e) { toast('Could not enable push: ' + e.message); }
  }

  // ---------- deep links: ?open=view from a notification tap, or a message from the service worker ----------
  const params = new URLSearchParams(location.search);
  if (params.get('open')) {
    const v = params.get('open'), r = params.get('ref');
    C.on('hello', function once() { setTimeout(() => go(v, r), 300); });
    params.delete('open'); params.delete('ref');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'tribe-open') go(e.data.view, e.data.ref); });

  window.TribeNotify = { openInbox, closeInbox, openSettings, closeSettings, reload: load, enableWebPush, pushOk, markAllRead, markRead: id => setMark(id, { read: true }), isUnread: id => isUnread(items.find(i => i.id === id) || {}), state: () => ({ unread, items: items.length, pending: pendingForMe().length, idle }) };
})();
