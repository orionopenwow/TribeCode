// Task Board (v0.28, dashboard pass): a strip of stat tiles that filter (Needs someone · In progress · Waiting for
// review · Done this week · Overdue), one full-width "Add a task" line with type / "for me" / due chips, and full-width
// horizontal task rows grouped by what has to happen next: Needs someone (nobody on it yet), In progress, Waiting for
// review, Up next (someone has it, not started) and Done (collapsed to the latest three). Every row shows its title in
// full, type, who has it, due date, checklist progress and ONE always-visible button for the next step:
// Assign → Start → Send for review → Approve (with Send back) → Reopen. Everything else lives in the row's "⋯" menu and
// in the side drawer (a bottom sheet on phones) that opens when you click a row. A List | Board toggle keeps the old
// columns for people who like them (wide enough for real titles). Drag rows between sections or columns.
// Keys: ↑/↓ move between rows (←/→ between columns on the board), Enter opens, Esc closes, X marks done, A assigns.
// Uses the tribe server when connected; otherwise keeps tasks locally on this device.
// Public: window.TribeTasks = { load, render, create, patch, all, open(id), close(), typeChips, TYPES, filter(k), view(v) }.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const COLS = [['backlog', 'Backlog'], ['doing', 'In progress'], ['review', 'Review'], ['done', 'Done']];
  const LKEY = 'tribecode.localTasks', VKEY = 'tribecode.tasksView';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let lastSig = '', tasks = [], dragId = null, loaded = false, openId = null, justDragged = 0, draggedId = null;
  let filter = '', allDone = false, view = (() => { try { return localStorage.getItem(VKEY) === 'board' ? 'board' : 'list'; } catch { return 'list'; } })();
  const TYPES = [['build', '🔨', 'Build'], ['fix', '🩹', 'Fix'], ['design', '🎨', 'Design'], ['write', '✍️', 'Write'], ['research', '🔎', 'Research']];
  const typeOf = k => TYPES.find(t => t[0] === k);
  const textTask = t => t.type === 'write' || t.type === 'research';
  const meId = () => (C.state().me || {}).id;
  const members = () => C.state().members || [];
  const mem = id => members().find(m => m.id === id);
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const typeChips = (sel, cls = '') => `<div class="tk-types ${cls}" role="radiogroup" aria-label="Task type">${TYPES.map(([k, e, l]) => `<button type="button" role="radio" class="tk-type" data-type="${k}" aria-checked="${k === sel}"><span class="emo" aria-hidden="true">${e}</span>${l}</button>`).join('')}</div>`;
  const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const ink = c => { const h = String(c || '').replace('#', ''); if (h.length !== 6) return '#fff'; const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#12151A' : '#fff'; };
  const av = (m, cls = '') => !m ? `<span class="tk-av tk-av--none ${cls}" title="Unassigned" aria-label="Unassigned"></span>`
    : m.role === 'agent' ? `<span class="tk-av tk-av--ai ${cls}" title="${esc(m.name)}" aria-label="${esc(m.name)}">✦</span>`
      : `<span class="tk-av ${cls}" style="background:${esc(m.color || '#6C7CFF')};color:${ink(m.color || '#6C7CFF')}" title="${esc(m.name)}" aria-label="${esc(m.name)}">${esc(initials(m.name))}</span>`;
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const IC = {
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    notes: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="12.5" cy="8" r="1.4" fill="currentColor"/></svg>',
    list: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    board: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="3.4" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="6.3" y="2.5" width="3.4" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="10.6" y="2.5" width="3.4" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    user: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 13.5c.8-2.4 2.8-3.6 5-3.6s4.2 1.2 5 3.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    cal: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    chev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 6.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const remote = () => C.connected();
  const local = {
    all() { try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch { return []; } },
    save(list) { try { localStorage.setItem(LKEY, JSON.stringify(list)); } catch {} },
  };

  async function load() {
    if (remote()) { try { tasks = (await C.api('/tasks')).tasks; } catch (e) { window.TribeApp.toast('Could not load tasks: ' + e.message); } }
    else tasks = local.all();
    loaded = true; render();
  }

  async function create(title, status, extra = {}) {
    title = String(title || '').trim(); if (!title) return;
    const type = typeOf(extra.type) ? extra.type : undefined, assignee = extra.assignee || null, due = extra.due || undefined;
    if (remote()) { const { task } = await C.api('/tasks', { method: 'POST', body: { title, status, type, assignee, due } }); upsert(task); }
    else { const now = new Date().toISOString(); const t = { id: 'l-' + Date.now().toString(36), title, status, order: Date.now(), created: now, updated: now, assignee, type, due }; tasks.push(t); local.save(tasks); render(); }
    window.TribeStore.set({ checklist: {} });
  }

  async function patch(id, changes) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    Object.assign(t, changes, { updated: new Date().toISOString() }); render();   // optimistic
    try { if (remote()) upsert((await C.api('/tasks/' + id, { method: 'PATCH', body: changes })).task); else local.save(tasks); }
    catch (e) { window.TribeApp.toast('Change not saved: ' + e.message); load(); }
  }

  async function remove(id) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    tasks = tasks.filter(x => x.id !== id); if (openId === id) close(); render();
    if (remote()) { try { await C.api('/tasks/' + id, { method: 'DELETE' }); } catch { load(); } } else local.save(tasks);
    window.TribeApp.toast(`Deleted "${t.title}"`);
  }

  function upsert(t) { const i = tasks.findIndex(x => x.id === t.id); if (i >= 0) tasks[i] = t; else tasks.push(t); render(); }

  /* ---------------- what each task needs next ---------------- */
  const hasOwner = t => !!(t.assignee || t.doer === 'flint' || t.doer === 'agent');
  const overdue = t => t.status !== 'done' && t.due && t.due < ymd(new Date());
  const weekAgo = () => Date.now() - 7 * 864e5;
  const doneWeek = t => t.status === 'done' && (!t.updated || new Date(t.updated).getTime() >= weekAgo());
  const STATS = [
    ['needs', 'Needs someone', 'Unassigned', t => t.status !== 'done' && !hasOwner(t)],
    ['doing', 'In progress', 'Doing', t => t.status === 'doing'],
    ['review', 'Waiting for review', 'Review', t => t.status === 'review'],
    ['done', 'Done this week', 'Done', doneWeek],
    ['overdue', 'Overdue', 'Late', overdue],
  ];
  const statOf = k => STATS.find(s => s[0] === k);
  // list sections, in the order you act on them; both backlog sections drop tasks into "backlog"
  const SECTIONS = [
    ['needs', 'backlog', 'Needs someone', 'Nobody is on these yet. Pick one up or hand it to a friend or an AI.', t => t.status === 'backlog' && !hasOwner(t)],
    ['doing', 'doing', 'In progress', 'Being built right now.', t => t.status === 'doing'],
    ['review', 'review', 'Waiting for review', 'Ready for a second look. Approve or send back.', t => t.status === 'review'],
    ['ready', 'backlog', 'Up next', 'Someone has these. Not started yet.', t => t.status === 'backlog' && hasOwner(t)],
    ['done', 'done', 'Done', '', t => t.status === 'done'],
  ];
  function step(t) {   // the one button a row shows: [action, label, style]
    if (t.status === 'done') return ['reopen', 'Reopen', 'ghost'];
    if (t.status === 'backlog') return hasOwner(t) ? ['start', 'Start', 'go'] : ['assign', 'Assign', 'assign'];
    if (t.status === 'doing') return ['review', 'Send for review', 'next'];
    return ['approve', 'Approve', 'ok'];
  }
  async function doStep(id, act, anchor) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    if (act === 'assign') return menu(anchor, 'assign', t);
    const to = { start: 'doing', review: 'review', approve: 'done', back: 'doing', reopen: hasOwner(t) ? 'doing' : 'backlog', done: 'done', undone: hasOwner(t) ? 'doing' : 'backlog' }[act];
    if (!to) return;
    if (act === 'start' && !t.assignee && !t.doer && meId()) return patch(id, { status: to, order: Date.now(), assignee: meId(), doer: 'me' });
    await patch(id, { status: to, order: Date.now() });
    const msg = { start: 'Started. It is in progress.', review: 'Sent for review', approve: 'Approved. Done ✓', back: 'Sent back to in progress', done: 'Done ✓' }[act];
    if (msg && window.TribeApp) window.TribeApp.toast(msg, act === 'approve' || act === 'done' ? 'ok' : undefined);
  }

  /* ---------------- the board shell ---------------- */
  function shell(board) {
    if (board.querySelector('.tk-cols')) return;
    board.classList.add('tkb');
    board.innerHTML = `<div class="tk-stats" id="tk-seg" role="toolbar" aria-label="Filter tasks">${STATS.map(([k, l, s]) => `<button type="button" class="tk-stat" data-seg="${k}" aria-pressed="false"><span class="tk-stat__n" data-segn="${k}">0</span><span class="tk-stat__l">${l}</span><span class="tk-stat__s">${s}</span></button>`).join('')}</div>
      <div class="tk-top quick-wrap">
        <label class="tk-add"><span class="tk-add__plus" aria-hidden="true">+</span><input id="tk-add" class="quick-add" placeholder="Add a task… press Enter" maxlength="200" aria-label="Add a task" autocomplete="off"><kbd class="tk-add__kbd" aria-hidden="true">Enter</kbd></label>
        <div class="tk-top__more">${typeChips('', 'sm')}<span class="tk-top__sep" aria-hidden="true"></span>
          <button type="button" class="tk-pill" data-forme aria-pressed="false">${IC.user}<span>For me</span></button>
          <label class="tk-pill tk-pill--due">${IC.cal}<span>Due</span><input type="date" id="tk-add-due" aria-label="Due date"></label>
          <span class="tk-top__flint" id="tk-flint"></span></div>
      </div>
      <div class="tk-bar"><p class="tk-bar__f" id="tk-filter" hidden></p>
        <div class="tk-views" role="radiogroup" aria-label="View"><button type="button" role="radio" data-view="list" aria-checked="true">${IC.list}<span>List</span></button><button type="button" role="radio" data-view="board" aria-checked="false">${IC.board}<span>Board</span></button></div></div>
      <div class="tk-cols"></div>`;
    const inp = board.querySelector('#tk-add'), top = board.querySelector('.tk-top'), dueIn = board.querySelector('#tk-add-due'), forMe = board.querySelector('[data-forme]');
    let topType = '';
    top.querySelectorAll('[data-type]').forEach(b => {
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => { topType = topType === b.dataset.type ? '' : b.dataset.type; top.querySelectorAll('[data-type]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.type === topType))); inp.focus(); });
    });
    forMe.addEventListener('mousedown', e => e.preventDefault());
    forMe.addEventListener('click', () => { forMe.setAttribute('aria-pressed', String(forMe.getAttribute('aria-pressed') !== 'true')); inp.focus(); });
    dueIn.addEventListener('change', () => dueIn.closest('.tk-pill').classList.toggle('is-on', !!dueIn.value));
    inp.addEventListener('keydown', async e => {
      if (e.key === 'Enter' && inp.value.trim()) {
        const v = inp.value; inp.value = '';
        const mine = forMe.getAttribute('aria-pressed') === 'true' && meId();
        const status = filter === 'doing' || filter === 'review' ? filter : 'backlog';
        await create(v, status, { type: topType, assignee: mine ? meId() : null, due: dueIn.value || undefined });
      }
      if (e.key === 'Escape') inp.blur();
    });
    board.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => setFilter(filter === b.dataset.seg ? '' : b.dataset.seg)));
    board.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    board.querySelector('#tk-filter').addEventListener('click', e => { if (e.target.closest('[data-clear-filter]')) setFilter(''); });
  }
  function setFilter(k) { filter = statOf(k) ? k : ''; if (filter === 'done') allDone = true; lastSig = ''; render(); }
  function setView(v) { view = v === 'board' ? 'board' : 'list'; try { localStorage.setItem(VKEY, view); } catch {} lastSig = ''; render(); }

  /* ---------------- a row ---------------- */
  function whoCell(t) {
    const a = t.assignee && mem(t.assignee);
    if (a) return `<span class="tk-own" title="${esc(a.name)}">${av(a)}<span class="tk-own__n">${esc(a.id === meId() ? 'Me' : a.name)}</span></span>`;
    if (t.doer === 'flint') return '<span class="tk-own"><span class="tk-av tk-av--flint" title="Flint" aria-label="Flint">🔥</span><span class="tk-own__n">Flint</span></span>';
    if (t.doer === 'agent') return '<span class="tk-own"><span class="tk-av tk-av--ai" title="An AI helper" aria-label="An AI helper">✦</span><span class="tk-own__n">AI helper</span></span>';
    if (t.status === 'backlog') return '<span class="tk-own tk-own--none">' + av(null) + '<span class="tk-own__n">Nobody yet</span></span>';
    return `<button type="button" class="tk-own tk-own--btn" data-qa="assign">${IC.user}<span>Assign</span></button>`;
  }
  function row(t) {
    const ty = typeOf(t.type), [act, label, kind] = step(t);
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [], sd = subs.filter(s => s.done).length;
    const due = t.due && window.TribePlan ? window.TribePlan.dueChip(t) : '';
    const done = t.status === 'done';
    return `<div class="task tk-row${done ? ' is-done' : ''}${overdue(t) ? ' is-late' : ''}" draggable="true" tabindex="0" data-id="${esc(t.id)}" data-st="${esc(t.status)}" role="button" aria-label="${esc(t.title)}. Open details">
      <button type="button" class="tk-check" data-qa="${done ? 'undone' : 'done'}" aria-label="${done ? 'Mark not done' : 'Mark done'}" title="${done ? 'Mark not done' : 'Mark done'}">${IC.check}</button>
      <div class="tk-main">
        <div class="t" data-title>${esc(t.title)}</div>
        <div class="tk-meta">
          ${ty ? `<span class="tk-ty"><span aria-hidden="true">${ty[1]}</span><span>${ty[2]}</span></span>` : ''}
          ${due}
          ${subs.length ? `<span class="tk-cnt${sd === subs.length ? ' is-full' : ''}" title="Checklist"><span class="tk-bar-mini" aria-hidden="true"><i style="width:${Math.round(sd / subs.length * 100)}%"></i></span>${sd}/${subs.length}</span>` : ''}
          ${t.body ? `<span class="tk-cnt" title="Has notes">${IC.notes}</span>` : ''}
          ${(t.labels || []).slice(0, 3).map(l => `<span class="tk-lab">${esc(l)}</span>`).join('')}
          ${t.source === 'chat' ? '<span class="tk-lab tk-lab--src">from chat</span>' : ''}
        </div>
      </div>
      ${whoCell(t)}
      <div class="tk-acts">
        ${t.status === 'review' ? '<button type="button" class="tk-btn tk-btn--back" data-qa="back">Send back</button>' : ''}
        <button type="button" class="tk-btn tk-btn--${kind}" data-qa="${act}">${label}</button>
        <button type="button" class="tk-more" data-qa="more" aria-label="More actions" title="More actions">${IC.more}</button>
      </div>
    </div>`;
  }

  /* ---------------- render ---------------- */
  function sorted(list) { return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
  function doneList(list) {   // newest first; collapsed shows three
    const l = list.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
    return allDone ? l : l.slice(0, 3);
  }
  function sectionHtml(key, status, label, hint, list, totalAll) {
    const F = window.TribeFlint;
    const isDone = status === 'done', n = list.length, shown = isDone ? doneList(list.slice()) : sorted(list.slice());
    const empty = !n ? (key === 'needs' && !totalAll
      ? `<div class="tk-empty"><p>No tasks yet. Write one small thing to build.</p><button type="button" class="tk-chip" data-focus-add>Add a task</button>${F && F.ask ? '<button type="button" class="tk-chip" data-flint-plan>🔥 Ask Flint to plan tasks</button>' : ''}</div>`
      : `<p class="tk-empty tk-empty--sm">${key === 'needs' ? 'Everything has someone on it.' : key === 'doing' ? 'Nothing in progress. Press Start on a task.' : key === 'review' ? 'Nothing waiting for review.' : key === 'done' ? 'Finished work lands here.' : 'Nothing waiting.'}</p>`) : '';
    const more = isDone && n > 3 ? `<button type="button" class="tk-showall" data-done-toggle aria-expanded="${allDone}">${allDone ? '<span>Show less</span>' : `<span>Show all</span> <span class="mono">${n}</span>`}</button>` : '';
    const add = status !== 'done' && key !== 'ready' ? `<button class="add" data-add="${status}" title="Add a task to ${label}" aria-label="Add a task to ${label}">+</button>` : '';
    return `<section class="col tk-sec" data-col="${status}" data-sec="${key}" aria-label="${label}">
        <h5><span class="dot"></span><span class="tk-sec__l">${label}</span> <span class="n">${n}</span>${hint && view === 'list' ? `<span class="tk-sec__h">${hint}</span>` : ''}${add}</h5>
        <div class="tk-list">${shown.map(row).join('')}${empty}</div>${more}
      </section>`;
  }
  function render() {
    const board = $('#board'); if (!board) return;
    shell(board);
    const total = tasks.length, done = tasks.filter(t => t.status === 'done').length;
    const sub = $('#tasks-sub'); if (sub) sub.textContent = `${total} task${total === 1 ? '' : 's'} · ${done} done · ${remote() ? 'shared with your tribe' : 'saved on this device'}`;
    const F = window.TribeFlint, fl = board.querySelector('#tk-flint');
    if (fl) fl.innerHTML = F && F.ask ? `<button type="button" class="tk-chip" data-flint-plan>🔥 Plan this week with Flint</button>` : '';
    STATS.forEach(([k, , , fn]) => {
      const n = tasks.filter(fn).length, el = board.querySelector(`[data-segn="${k}"]`); if (el) el.textContent = n;
      const b = board.querySelector(`[data-seg="${k}"]`); if (b) { b.setAttribute('aria-pressed', String(filter === k)); b.classList.toggle('is-zero', !n); }
    });
    board.dataset.view = phone() ? 'list' : view; board.dataset.filter = filter;
    board.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === view)));
    const fp = board.querySelector('#tk-filter'), st = statOf(filter);
    fp.hidden = !st; if (st) fp.innerHTML = `<span class="tkf-k">Showing</span> <b>${st[1]}</b> <button type="button" class="tkd-link" data-clear-filter>Show everything</button>`;
    const pass = st ? st[3] : () => true, vis = tasks.filter(pass);
    const asBoard = view === 'board' && !phone();
    const secs = asBoard ? COLS.map(([k, l]) => [k, k, l, '', t => t.status === k]) : SECTIONS;
    const html = secs.map(([key, status, label, hint, fn]) => {
      const list = vis.filter(fn);
      if (st && !list.length && !asBoard) return '';
      if (!asBoard && key === 'ready' && !list.length) return '';
      return sectionHtml(key, status, label, hint, list, total);
    }).join('') || `<p class="tk-empty tk-empty--sm tk-none">Nothing here right now. <button type="button" class="tkd-link" data-clear-filter>Show everything</button></p>`;
    const sig = (asBoard ? 'B' : 'L') + html;
    const cols = board.querySelector('.tk-cols');
    if (lastSig !== sig || !cols.firstElementChild) {   // nothing changed (a presence blip): leave the DOM alone, so a click in progress or an open add line survives
      const oq = cols.querySelector('.tk-colq .quick-add'), keepQ = oq ? { sec: oq.closest('.col').dataset.sec, v: oq.value, f: document.activeElement === oq } : null;
      const keepF = document.activeElement && document.activeElement.closest && document.activeElement.closest('#board .task') ? document.activeElement.closest('#board .task').dataset.id : null;
      cols.innerHTML = html; lastSig = sig; bind();
      if (keepQ) { quickAdd(keepQ.sec, keepQ.f); const n = cols.querySelector('.tk-colq .quick-add'); if (n) n.value = keepQ.v; }
      if (keepF) { const n = cols.querySelector(`.task[data-id="${CSS.escape(keepF)}"]`); if (n) n.focus({ preventScroll: true }); }
    }
    if (openId) { document.querySelectorAll('#board .task').forEach(c => c.classList.toggle('is-open', c.dataset.id === openId)); if (tasks.some(t => t.id === openId)) fillDrawer(); else close(); }
  }

  function orderFor(colEl, y) {
    const cards = [...colEl.querySelectorAll('.task:not(.dragging)')];
    const after = cards.find(c => y < c.getBoundingClientRect().top + c.offsetHeight / 2);
    const get = el => el && tasks.find(t => t.id === el.dataset.id);
    const next = get(after), prevEl = after ? after.previousElementSibling : cards[cards.length - 1];
    const prev = prevEl && prevEl.classList.contains('task') ? get(prevEl) : null;
    if (prev && next) return (prev.order + next.order) / 2;
    if (next) return next.order - 1000;
    if (prev) return prev.order + 1000;
    return Date.now();
  }

  function bind() {
    document.querySelectorAll('#board .task').forEach(el => {   // only the board's rows (other views use .task too)
      const id = el.dataset.id;
      el.addEventListener('dragstart', e => { dragId = id; el.classList.add('dragging'); document.getElementById('board').classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); });
      el.addEventListener('dragend', () => { dragId = null; justDragged = Date.now(); draggedId = id; el.classList.remove('dragging'); const b = document.getElementById('board'); if (b) b.classList.remove('is-dragging'); document.querySelectorAll('#board .col').forEach(c => c.classList.remove('over')); });
      el.addEventListener('click', e => {
        if ((draggedId === id && Date.now() - justDragged < 250) || e.target.closest('[data-due]')) return;
        const q = e.target.closest('[data-qa]');
        if (q) { e.stopPropagation(); const t = tasks.find(x => x.id === id); if (!t) return;
          if (q.dataset.qa === 'more') return menu(q, 'more', t);
          return doStep(id, q.dataset.qa, q); }
        open(id);
      });
      el.addEventListener('keydown', e => {
        if (e.target !== el) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(id); return; }
        if (e.key === 'x' || e.key === 'X') { e.preventDefault(); const t = tasks.find(x => x.id === id); if (t) doStep(id, t.status === 'done' ? 'undone' : 'done'); return; }
        if (e.key === 'a' || e.key === 'A') { e.preventDefault(); const t = tasks.find(x => x.id === id); if (t) menu(el.querySelector('.tk-acts .tk-btn:last-of-type') || el, 'assign', t); return; }
        const arrows = { ArrowDown: [0, 1], ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowLeft: [-1, 0] }; const d = arrows[e.key]; if (!d) return;
        e.preventDefault();
        if (!d[0] || document.getElementById('board').dataset.view !== 'board') {   // the list: one long column of rows
          if (d[0]) return;
          const all = [...document.querySelectorAll('#board .task')], i = all.indexOf(el), n = all[i + d[1]]; if (n) n.focus(); return;
        }
        const cols = [...document.querySelectorAll('#board .col')].map(c => [...c.querySelectorAll('.task')]);
        const ci = cols.findIndex(l => l.includes(el)), ri = cols[ci].indexOf(el);
        let nc = ci + d[0]; while (nc >= 0 && nc < cols.length && !cols[nc].length) nc += d[0];
        if (nc < 0 || nc >= cols.length) return; cols[nc][Math.min(ri, cols[nc].length - 1)].focus();
      });
    });
    document.querySelectorAll('#board .col').forEach(col => {
      col.addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', e => {
        e.preventDefault(); col.classList.remove('over'); if (!dragId) return;
        const status = col.dataset.col, order = orderFor(col, e.clientY), t = tasks.find(x => x.id === dragId);
        if (t && (t.status !== status || t.order !== order)) patch(dragId, { status, order });
      });
    });
    document.querySelectorAll('#board [data-add]').forEach(b => {   // open on press, so a layout shift above the board (the ideas pane) can't swallow the click
      b.addEventListener('mousedown', e => { if (e.button) return; e.preventDefault(); quickAdd(b.closest('.col').dataset.sec); });
      b.addEventListener('click', e => { if (!e.detail) quickAdd(b.closest('.col').dataset.sec); });   // keyboard / programmatic clicks
    });
    document.querySelectorAll('#board [data-done-toggle]').forEach(b => b.addEventListener('click', () => { allDone = !allDone; lastSig = ''; render(); }));
    document.querySelectorAll('#board .tk-cols [data-clear-filter]').forEach(b => b.addEventListener('click', () => setFilter('')));
    document.querySelectorAll('#board [data-focus-add]').forEach(b => b.addEventListener('click', () => { const i = $('#tk-add'); if (i) i.focus(); }));
    document.querySelectorAll('#board [data-flint-plan]').forEach(b => b.addEventListener('click', () => { const F = window.TribeFlint; if (!F) return; try { F.focus && F.focus(); } catch {} F.ask('Plan this week: suggest a few small tasks for this project'); }));
  }

  let lastType = '';
  function quickAdd(sec, focus = true) {
    const col = document.querySelector(`#board .col[data-sec="${sec}"]`); if (!col) return;
    const status = col.dataset.col;
    col.querySelectorAll('.quick-wrap').forEach(x => x.remove());
    const wrap = document.createElement('div'); wrap.className = 'quick-wrap tk-colq';
    wrap.innerHTML = `<input class="quick-add" placeholder="Task title, Enter to add" maxlength="200" aria-label="Task title">${typeChips(lastType, 'sm')}`;
    const inp = wrap.querySelector('input');
    col.querySelector('h5').after(wrap); if (focus) inp.focus();
    wrap.querySelectorAll('[data-type]').forEach(b => {
      b.addEventListener('mousedown', e => e.preventDefault());   // keep the focus in the title
      b.addEventListener('click', () => { lastType = lastType === b.dataset.type ? '' : b.dataset.type; wrap.querySelectorAll('[data-type]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.type === lastType))); inp.focus(); });
    });
    inp.addEventListener('keydown', async e => {
      if (e.key === 'Enter' && inp.value.trim()) { const v = inp.value; inp.value = ''; await create(v, status, { type: lastType }); quickAdd(sec); }
      if (e.key === 'Escape') wrap.remove();
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) wrap.remove(); }, 150));
  }

  /* ---------------- the row menus: Assign and ⋯ ---------------- */
  function closeMenu(refocus) {
    const p = document.getElementById('tk-pop'); if (!p) return;
    const back = p._anchor; p.remove();
    if (refocus && back && document.contains(back)) back.focus({ preventScroll: true });
  }
  function menu(anchor, kind, t) {
    const had = document.getElementById('tk-pop'); if (had && had._anchor === anchor && had.dataset.kind === kind) return closeMenu(true);
    closeMenu();
    const me = meId(), ms = members(), F = window.TribeFlint;
    const item = (k, label, icon = '', cls = '') => `<button type="button" role="menuitem" class="tkp-i ${cls}" data-m="${esc(k)}">${icon}<span>${esc(label)}</span></button>`;
    let html = '';
    if (kind === 'assign') {
      const meM = mem(me) || { name: (C.state().me || {}).name || 'Me', color: (C.state().me || {}).color };
      html = `<p class="tkp-h">Who does it?</p>${item('who:' + (me || 'me'), 'Me', av(meM))}`
        + ms.filter(m => m.role !== 'agent' && m.id !== me).map(m => item('who:' + m.id, m.name, av(m))).join('')
        + ms.filter(m => m.role === 'agent').map(m => item('who:' + m.id, m.name, av(m))).join('')
        + (remote() ? item('who:ask-agent', 'Ask an AI helper', '<span class="tk-av tk-av--ai">✦</span>') : '')
        + (textTask(t) ? item('who:flint', 'Flint', '<span class="tk-av tk-av--flint">🔥</span>') : '')
        + (hasOwner(t) ? item('who:', 'Nobody yet', av(null)) : '')
        + (F ? '<hr>' + item('flint-pick', '🔥 Ask Flint to pick') : '');
    } else {
      html = `<p class="tkp-h">Move to</p>${COLS.filter(([k]) => k !== t.status).map(([k, l]) => item('move:' + k, l, `<span class="tkp-dot" style="--c:var(--tk-${k})"></span>`)).join('')}<hr>`
        + item('open', 'Open details') + item('assign', 'Assign…')
        + (remote() ? item('ask-agent', 'Ask an AI helper') : '')
        + (F ? item('flint-pick', '🔥 Ask Flint to pick') : '')
        + (remote() && t.status !== 'done' ? item('split', '✂️ Split into smaller tasks') : '')
        + '<hr>' + item('delete', 'Delete', '', 'tkp-i--danger');
    }
    const p = document.createElement('div'); p.id = 'tk-pop'; p.className = 'tk-pop'; p.setAttribute('role', 'menu'); p.dataset.kind = kind; p._anchor = anchor;
    p.innerHTML = html; document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    let x = Math.min(innerWidth - w - 8, Math.max(8, r.right - w)), y = r.bottom + 6;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
    p.style.left = x + 'px'; p.style.top = y + 'px';
    const items = () => [...p.querySelectorAll('.tkp-i')];
    (items()[0] || p).focus({ preventScroll: true });
    p.addEventListener('keydown', e => {
      const l = items(), i = l.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (l[i + 1] || l[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (l[i - 1] || l[l.length - 1]).focus(); }
      else if (e.key === 'Tab') closeMenu();
    });
    p.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const m = b.dataset.m; closeMenu(true);
      if (m.startsWith('who:')) return pickWho(t, m.slice(4));
      if (m.startsWith('move:')) return patch(t.id, { status: m.slice(5), order: Date.now() });
      if (m === 'open') return open(t.id);
      if (m === 'assign') { const row = document.querySelector(`#board .task[data-id="${CSS.escape(t.id)}"]`); return menu((row && row.querySelector('.tk-more')) || anchor, 'assign', t); }
      if (m === 'ask-agent') return pickWho(t, 'ask-agent');
      if (m === 'flint-pick') { if (!F) return; try { F.focus && F.focus(); } catch {} return F.ask(`Who should do this task, and why: ${t.title}`); }
      if (m === 'split') return split(t.id);
      if (m === 'delete') return remove(t.id);
    });
  }
  async function split(id, btn) {
    if (btn) btn.disabled = true;
    try { const r = await C.api(`/tasks/${encodeURIComponent(id)}/split`, { method: 'POST', body: {} }); window.TribeApp && window.TribeApp.toast(`✂️ Split into ${r.tasks.length} smaller tasks`, 'ok'); }
    catch (err) { if (btn) btn.disabled = false; window.TribeApp && window.TribeApp.toast(err.message, 'err'); }
  }

  /* ---------------- the drawer ---------------- */
  function drawer() {
    let d = document.getElementById('tk-drawer');
    if (d) return d;
    d = document.createElement('aside'); d.id = 'tk-drawer'; d.className = 'tk-drawer'; d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'false'); d.setAttribute('aria-labelledby', 'tkd-title');
    (document.getElementById('view-tasks') || document.body).appendChild(d);
    d.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    return d;
  }
  function open(id, focus) {
    if (!tasks.some(t => t.id === id)) return;
    closeMenu();
    openId = id; const d = drawer(); d.hidden = false; document.body.classList.add('tk-drawer-open');
    document.querySelectorAll('#board .task').forEach(c => c.classList.toggle('is-open', c.dataset.id === id));
    fillDrawer();
    requestAnimationFrame(() => d.classList.add('is-in'));
    const f = focus === 'who' ? d.querySelector('[data-whopick]') : d.querySelector('#tkd-title'); if (f) f.focus({ preventScroll: true });
  }
  function close() {
    const d = document.getElementById('tk-drawer'); const was = openId; openId = null;
    if (d) { d.classList.remove('is-in'); d.hidden = true; }
    document.body.classList.remove('tk-drawer-open');
    document.querySelectorAll('#board .task.is-open').forEach(c => c.classList.remove('is-open'));
    const c = was && document.querySelector(`#board .task[data-id="${CSS.escape(was)}"]`); if (c) c.focus({ preventScroll: true });
  }
  function rel(iso) { if (!iso) return ''; const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return new Date(iso).toLocaleDateString(); }

  function fillDrawer() {
    const d = drawer(), t = tasks.find(x => x.id === openId); if (!t) return;
    const keep = document.activeElement && d.contains(document.activeElement) ? document.activeElement.dataset.keep : null;
    if (keep && d.dataset.for === t.id) { syncDrawer(d, t); return; }   // don't redraw under the cursor; update the rest
    d.dataset.for = t.id;
    const me = meId(), ms = members(), a = t.assignee && mem(t.assignee);
    const friends = ms.filter(m => m.role !== 'agent' && m.id !== me), agents = ms.filter(m => m.role === 'agent');
    const opt = (key, label, avatar, on) => `<button type="button" class="tkd-who" data-who="${esc(key)}" aria-pressed="${on}">${avatar}<span>${esc(label)}</span></button>`;
    const whoNow = a ? a.id : t.doer === 'flint' ? 'flint' : t.doer === 'agent' ? 'ask-agent' : '';
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    const by = t.by && mem(t.by), upBy = t.updatedBy && mem(t.updatedBy);
    const [act, label, kind] = step(t);
    d.innerHTML = `<div class="tkd-head"><span class="tkd-k mono">Task</span><button type="button" class="tkd-x" data-tkclose aria-label="Close">✕</button></div>
      <div class="tkd-body">
        <textarea id="tkd-title" class="tkd-title" rows="2" maxlength="200" data-keep="title" aria-label="Title">${esc(t.title)}</textarea>
        <div class="tkd-next">${t.status === 'review' ? '<button type="button" class="tk-btn tk-btn--back" data-step="back">Send back</button>' : ''}<button type="button" class="tk-btn tk-btn--${kind}" data-step="${act}">${label}</button></div>
        <div class="tkd-row"><span class="tkd-l">Status</span><div class="tkd-status" role="radiogroup" aria-label="Status">${COLS.map(([k, l]) => `<button type="button" role="radio" data-status="${k}" aria-checked="${t.status === k}" style="--c:var(--tk-${k})">${l}</button>`).join('')}</div></div>
        <div class="tkd-row tkd-row--who"><span class="tkd-l">Who does it?</span>
          <div class="tkd-whos" data-whopick tabindex="-1">
            ${opt(me || 'me', 'Me', av(mem(me) || { name: (C.state().me || {}).name || 'Me', color: (C.state().me || {}).color }), whoNow === me)}
            ${friends.map(m => opt(m.id, m.name, av(m), whoNow === m.id)).join('')}
            ${agents.map(m => opt(m.id, m.name, av(m), whoNow === m.id)).join('')}
            ${remote() ? opt('ask-agent', 'Ask an AI helper', '<span class="tk-av tk-av--ai">✦</span>', whoNow === 'ask-agent') : ''}
            ${textTask(t) ? opt('flint', 'Flint', '<span class="tk-av tk-av--flint">🔥</span>', whoNow === 'flint') : ''}
            ${opt('', 'Nobody yet', av(null), !whoNow)}
            ${!friends.length && remote() ? '<button type="button" class="tkd-link" data-invite>Invite a friend</button>' : ''}
            ${window.TribeFlint ? '<button type="button" class="tkd-link" data-flint-pick>🔥 Ask Flint to pick</button>' : ''}
          </div></div>
        <div class="tkd-row"><span class="tkd-l">Type</span>${typeChips(t.type || '', 'sm tkd-types')}</div>
        <div class="tkd-row"><span class="tkd-l">Due</span><div class="tkd-due"><input type="date" class="tkd-in" id="tkd-due" data-keep="due" value="${esc(t.due || '')}">${t.due ? '<button type="button" class="tkd-link" data-clear-due>Clear</button>' : ''}</div></div>
        <div class="tkd-row"><span class="tkd-l">Labels</span><div class="tkd-labels">${(t.labels || []).map(l => `<span class="tk-lab">${esc(l)}<button type="button" data-unlabel="${esc(l)}" aria-label="Remove ${esc(l)}">×</button></span>`).join('')}<input class="tkd-in tkd-in--sm" id="tkd-label" data-keep="label" placeholder="Add a label" maxlength="24"></div></div>
        <div class="tkd-sec"><span class="tkd-l">Notes</span><textarea class="tkd-in tkd-notes" id="tkd-notes" data-keep="notes" rows="4" maxlength="20000" placeholder="What does done look like?">${esc(t.body || '')}</textarea></div>
        <div class="tkd-sec"><span class="tkd-l">Checklist ${subs.length ? `<em>${subs.filter(s => s.done).length}/${subs.length}</em>` : ''}</span>
          <ul class="tkd-subs">${subs.map((s, i) => `<li><label><input type="checkbox" data-sub="${i}" ${s.done ? 'checked' : ''}><span>${esc(s.t)}</span></label><button type="button" data-unsub="${i}" aria-label="Remove">×</button></li>`).join('')}</ul>
          <input class="tkd-in tkd-in--sm" id="tkd-sub" data-keep="sub" placeholder="Add a step… press Enter" maxlength="200"></div>
        <div class="tkd-sec tkd-act"><span class="tkd-l">Activity</span>
          <p>${by ? `Added by ${esc(by.name)}` : 'Added'} ${esc(rel(t.created))}${t.source === 'chat' ? ' · from chat' : ''}</p>
          ${t.updated ? `<p>Changed ${upBy ? 'by ' + esc(upBy.name) + ' ' : ''}${esc(rel(t.updated))}</p>` : ''}
        </div>
      </div>
      <div class="tkd-foot">${remote() && t.status !== 'done' ? '<button type="button" class="btn sm" data-split>✂️ Split into smaller tasks</button>' : ''}<button type="button" class="btn sm danger" data-del>Delete</button></div>`;
    wireDrawer(d, t);
  }
  function syncDrawer(d, t) {
    d.querySelectorAll('[data-status]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.status === t.status)));
  }
  function wireDrawer(d, t) {
    const id = t.id;
    d.querySelector('[data-tkclose]').onclick = close;
    const ti = d.querySelector('#tkd-title');
    ti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ti.blur(); } });
    ti.addEventListener('change', () => { const v = ti.value.trim(); if (v && v !== t.title) patch(id, { title: v }); });
    d.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { if (b.dataset.step === 'assign') { const w = d.querySelector('[data-whopick]'); if (w) { w.scrollIntoView({ block: 'nearest' }); w.focus(); w.classList.add('is-ask'); } return; } doStep(id, b.dataset.step, b); });
    d.querySelectorAll('[data-status]').forEach(b => b.onclick = () => patch(id, { status: b.dataset.status, order: Date.now() }));
    d.querySelectorAll('[data-who]').forEach(b => b.onclick = () => pickWho(t, b.dataset.who));
    const inv = d.querySelector('[data-invite]'); if (inv) inv.onclick = () => window.TribeApp.openInvite && window.TribeApp.openInvite();
    const fp = d.querySelector('[data-flint-pick]'); if (fp) fp.onclick = () => { const F = window.TribeFlint; if (!F) return; try { F.focus && F.focus(); } catch {} F.ask(`Who should do this task, and why: ${t.title}`); };
    d.querySelectorAll('.tkd-types [data-type]').forEach(b => b.onclick = () => patch(id, { type: t.type === b.dataset.type ? '' : b.dataset.type }));
    const due = d.querySelector('#tkd-due'); due.onchange = () => patch(id, { due: due.value || null });
    const cd = d.querySelector('[data-clear-due]'); if (cd) cd.onclick = () => patch(id, { due: null });
    const lab = d.querySelector('#tkd-label');
    lab.addEventListener('keydown', e => { if (e.key === 'Enter' && lab.value.trim()) { e.preventDefault(); const v = lab.value.trim().toLowerCase(); lab.value = ''; patch(id, { labels: [...new Set([...(t.labels || []), v])].slice(0, 6) }); } });
    d.querySelectorAll('[data-unlabel]').forEach(b => b.onclick = () => patch(id, { labels: (t.labels || []).filter(l => l !== b.dataset.unlabel) }));
    const notes = d.querySelector('#tkd-notes'); notes.addEventListener('change', () => { if (notes.value !== (t.body || '')) patch(id, { body: notes.value }); });
    const subs = () => (Array.isArray(t.subtasks) ? t.subtasks : []).map(s => ({ ...s }));
    d.querySelectorAll('[data-sub]').forEach(c => c.onchange = () => { const l = subs(); l[+c.dataset.sub].done = c.checked; patch(id, { subtasks: l }); });
    d.querySelectorAll('[data-unsub]').forEach(b => b.onclick = () => { const l = subs(); l.splice(+b.dataset.unsub, 1); patch(id, { subtasks: l }); });
    const si = d.querySelector('#tkd-sub');
    si.addEventListener('keydown', e => { if (e.key === 'Enter' && si.value.trim()) { e.preventDefault(); const l = subs(); l.push({ t: si.value.trim(), done: false }); si.value = ''; d.dataset.for = ''; patch(id, { subtasks: l }).then(() => { const n = document.getElementById('tkd-sub'); if (n) n.focus(); }); } });
    d.querySelector('[data-del]').onclick = () => remove(id);
    const sp = d.querySelector('[data-split]'); if (sp) sp.onclick = () => split(id, sp);   // feat/ship-flow: one task becomes smaller ones
  }
  async function pickWho(t, key) {
    const me = meId();
    if (key === '') return patch(t.id, { assignee: null, doer: '' });
    if (key === 'ask-agent') { await patch(t.id, { doer: 'agent', assignee: null }); if (window.TribeAskAgent) window.TribeAskAgent.open({ task: t }); return; }
    if (key === 'flint') { await patch(t.id, { doer: 'flint', assignee: null }); const F = window.TribeFlint; if (F) { try { F.focus(); } catch {} F.ask(`Help me with this task: ${t.title}`); } return; }
    const m = mem(key);
    if (key === me || key === 'me') return patch(t.id, { doer: 'me', assignee: me || null });
    if (m) return patch(t.id, { doer: m.role === 'agent' ? 'agent' : 'friend', assignee: m.id });
  }

  C.on('task', t => { if (loaded) upsert(t); });
  C.on('task-removed', id => { tasks = tasks.filter(t => t.id !== id); if (openId === id) close(); render(); });
  C.on('status', s => { if (s.status === 'online' && loaded) load(); });
  C.on('presence', () => { if (!loaded) return; const a = document.activeElement; if (a && a.classList && (a.classList.contains('quick-add') || (a.closest && a.closest('#tk-drawer, #tk-pop')))) return; render(); });   // a presence blip never wipes what you're typing
  document.addEventListener('click', e => { if (e.target.closest('#task-new')) { const i = $('#tk-add'); if (i) i.focus(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openId && !e.defaultPrevented) close(); });
  document.addEventListener('pointerdown', e => {   // a click outside closes the menu, and outside the drawer (and outside a row) the drawer
    if (!e.target.closest('#tk-pop') && !e.target.closest('[data-qa="more"], [data-qa="assign"]')) closeMenu();
    if (!openId) return; const d = document.getElementById('tk-drawer');
    if (d && !d.contains(e.target) && !e.target.closest('#board .task') && !e.target.closest('#tk-pop, .flint-panel, #flint-panel, .ff-pill')) close();
  });
  addEventListener('resize', () => { closeMenu(); const b = $('#board'); if (b && b.classList.contains('tkb') && b.dataset.view !== (phone() ? 'list' : view)) { lastSig = ''; render(); } });
  addEventListener('scroll', e => { if (!(e.target && e.target.closest && e.target.closest('#tk-pop'))) closeMenu(); }, true);

  window.TribeTasks = { load, render, create, patch, all: () => tasks, open, close, typeChips, TYPES, filter: setFilter, view: setView };
})();
