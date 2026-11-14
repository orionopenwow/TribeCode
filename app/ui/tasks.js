// Task Board (v0.28 dashboard pass; v0.36 design pass: a compact summary strip, the add line as the one focal point,
// stroke icons instead of emoji, column-aligned rows, one welcoming empty state, quiet empty sections, motion tokens).
// A strip of status counts that filter (Needs someone · In progress · Waiting for
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
  let work = { mode: 'lead', claimLimit: 0, agentAutoAccept: false }, workLead = false;   // feat/tasks-company: how work is shared (server/taskflow.js)
  let calm = true;   // true: the next redraw is a whole new picture (first paint, a filter, List | Board), so rows don't animate in
  let filter = '', allDone = false, view = (() => { try { return localStorage.getItem(VKEY) === 'board' ? 'board' : 'list'; } catch { return 'list'; } })();
  const TYPES = [['build', '🔨', 'Build'], ['fix', '🩹', 'Fix'], ['design', '🎨', 'Design'], ['write', '✍️', 'Write'], ['research', '🔎', 'Research']];
  const TYPE_ICON = { build: 'wrench', fix: 'bug', design: 'palette', write: 'quill', research: 'search' };   // stroke icons (icons.js); TYPES keeps its emoji for older callers
  const ico = (n, size = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, size) : '');
  const typeOf = k => TYPES.find(t => t[0] === k);
  const textTask = t => t.type === 'write' || t.type === 'research';
  const meId = () => (C.state().me || {}).id;
  const members = () => C.state().members || [];
  const mem = id => members().find(m => m.id === id);
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const typeChips = (sel, cls = '') => `<div class="tk-types ${cls}" role="radiogroup" aria-label="Task type">${TYPES.map(([k, , l]) => `<button type="button" role="radio" class="tk-type" data-type="${k}" aria-checked="${k === sel}"><span class="tk-ic" aria-hidden="true">${ico(TYPE_ICON[k], 14)}</span>${l}</button>`).join('')}</div>`;
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
    if (remote()) {
      try { tasks = (await C.api('/tasks')).tasks; } catch (e) { window.TribeApp.toast('Could not load tasks: ' + e.message); }
      try { const w = await C.api('/tasks/settings'); work = w.settings; workLead = !!w.lead; } catch {}
    }
    else tasks = local.all();
    loaded = true; calm = true; render();   // a fresh load is a new picture: nothing animates in
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
  const council = () => remote() && work.mode === 'council';
  const pending = t => t.accept === 'pending' && !!t.assignee;
  const mineToAnswer = t => pending(t) && (t.assignee === meId() || ((mem(t.assignee) || {}).role === 'agent' && (mem(t.assignee) || {}).owner === meId()));
  const firstName = id => { const m = mem(id); return m ? (m.id === meId() ? 'you' : m.name) : 'someone'; };
  const overdue = t => t.status !== 'done' && t.due && t.due < ymd(new Date());
  const weekAgo = () => Date.now() - 7 * 864e5;
  const doneWeek = t => t.status === 'done' && (!t.updated || new Date(t.updated).getTime() >= weekAgo());
  const STATS = [
    ['needs', 'Needs someone', 'No one', t => t.status !== 'done' && !hasOwner(t)],
    ['doing', 'In progress', 'Doing', t => t.status === 'doing'],
    ['review', 'Waiting for review', 'Review', t => t.status === 'review'],
    ['done', 'Done this week', 'Done', doneWeek],
    ['overdue', 'Overdue', 'Late', overdue],
  ];
  const statOf = k => STATS.find(s => s[0] === k);
  // list sections, in the order you act on them; both backlog sections drop tasks into "backlog"
  const SECTIONS = [
    ['offer', 'backlog', 'Assigned to you', 'Accept to make it yours and start it, or decline with a reason.', t => mineToAnswer(t)],
    ['needs', 'backlog', 'Needs someone', 'Nobody\'s on these yet. Take one or hand it off.', t => t.status === 'backlog' && !hasOwner(t)],
    ['doing', 'doing', 'In progress', 'Being built right now.', t => t.status === 'doing'],
    ['review', 'review', 'Waiting for review', 'Ready for a second look. Approve or send back.', t => t.status === 'review'],
    ['ready', 'backlog', 'Up next', 'Someone has these. Not started yet.', t => t.status === 'backlog' && hasOwner(t) && !mineToAnswer(t)],
    ['done', 'done', 'Done', '', t => t.status === 'done'],
  ];
  function step(t) {   // the one button a row shows: [action, label, style]
    if (t.status === 'done') return ['reopen', 'Reopen', 'ghost'];
    if (mineToAnswer(t)) return ['accept', 'Accept', 'go'];
    if (pending(t)) return ['waiting', `Waiting for ${firstName(t.assignee)}`, 'ghost'];
    if (council() && t.status === 'backlog' && !hasOwner(t)) return ['claim', 'Claim', 'assign'];
    if (t.status === 'backlog') return hasOwner(t) ? ['start', 'Start', 'go'] : ['assign', 'Assign', 'assign'];
    if (t.status === 'doing') return ['review', 'Send for review', 'next'];
    return ['approve', 'Approve', 'ok'];
  }
  async function doStep(id, act, anchor) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    if (act === 'assign') return menu(anchor, 'assign', t);
    if (act === 'accept' || act === 'claim') {
      try { upsert((await C.api(`/tasks/${encodeURIComponent(id)}/${act}`, { method: 'POST', body: {} })).task); window.TribeApp.toast(act === 'claim' ? 'Claimed. It is yours and in progress.' : 'Accepted. It is yours and in progress.', 'ok'); }
      catch (e) { window.TribeApp.toast(e.message, 'err'); load(); }
      return;
    }
    if (act === 'decline') return declinePop(anchor, t);
    if (act === 'waiting') return window.TribeApp.toast(`Waiting for ${firstName(t.assignee)} to accept. It shows in their board and inbox; they can accept or decline with a reason.`);
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
    board.innerHTML = `<div class="tk-stats" id="tk-seg" role="toolbar" aria-label="Filter tasks">${STATS.map(([k, l, s]) => `<button type="button" class="tk-stat" data-seg="${k}" aria-pressed="false" title="Show only: ${l}"><span class="tk-stat__dot" aria-hidden="true"></span><span class="tk-stat__n" data-segn="${k}">0</span><span class="tk-stat__l">${l}</span><span class="tk-stat__s">${s}</span></button>`).join('')}</div>
      <div class="tk-top quick-wrap">
        <label class="tk-add"><span class="tk-add__plus" aria-hidden="true">${ico('plus', 18)}</span><input id="tk-add" class="quick-add" placeholder="Add a task… press Enter" maxlength="200" aria-label="Add a task" autocomplete="off"><kbd class="tk-add__kbd" aria-hidden="true">Enter</kbd></label>
        <div class="tk-top__more">
          <div class="tk-grp tk-grp--kinds">${typeChips('', 'sm')}</div>
          <div class="tk-grp tk-grp--for"><button type="button" class="tk-pill" data-forme aria-pressed="false">${IC.user}<span>For me</span></button>
            <label class="tk-pill tk-pill--due">${IC.cal}<span>Due</span><input type="date" id="tk-add-due" aria-label="Due date"></label></div>
          <div class="tk-grp tk-grp--mode"><button type="button" class="tk-pill tk-pill--mode" id="tk-mode" aria-haspopup="dialog" title="How work is shared"></button></div>
          <div class="tk-grp tk-grp--flint tk-top__flint" id="tk-flint"></div>
        </div>
      </div>
      <div class="tk-bar"><p class="tk-bar__f" id="tk-filter" hidden></p></div>
      <div class="tk-cols"></div>`;
    // List | Board sits in the page header, beside New task (it stays a child of the Tasks view, so #view-tasks [data-view] finds it)
    const head = document.querySelector('#view-tasks .view-head');
    if (head && !head.querySelector('.tk-views')) {
      const v = document.createElement('div'); v.className = 'tk-views'; v.setAttribute('role', 'radiogroup'); v.setAttribute('aria-label', 'View');
      v.innerHTML = `<button type="button" role="radio" data-view="list" aria-checked="true">${IC.list}<span>List</span></button><button type="button" role="radio" data-view="board" aria-checked="false">${IC.board}<span>Board</span></button>`;
      head.insertBefore(v, head.querySelector('#task-new'));
      v.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
      const h1 = head.querySelector('h1'); if (h1 && !h1.querySelector('.tk-h1i')) h1.insertAdjacentHTML('afterbegin', `<span class="tk-h1i" aria-hidden="true">${ico('tasks', 22)}</span>`);
    }
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
    board.querySelector('#tk-mode').addEventListener('click', e => modePop(e.currentTarget));
    board.addEventListener('click', e => { if (e.target.closest('[data-flint-plan]')) planWeek(board); });   // one delegated handler: the button is redrawn
    board.querySelector('#tk-filter').addEventListener('click', e => { if (e.target.closest('[data-clear-filter]')) setFilter(''); });
  }
  // Plan this week with Flint: a few small tasks from the vision, the board and the project (no AI needed; server/assist.js),
  // each one tap to add. With no suggestions helper, Flint is asked in its dock.
  function planWeek(board) {
    const A = window.TribeAssist;
    if (!A || !A.ideas || !remote()) { const F = window.TribeFlint; if (!F) return; try { F.focus && F.focus(); } catch {} return F.ask('Plan this week: suggest a few small tasks for this project'); }
    let box = board.querySelector('#tk-plan');
    if (box) { box.remove(); return; }
    box = document.createElement('div'); box.id = 'tk-plan'; box.className = 'tk-plan';
    box.innerHTML = '<p class="tk-empty tk-empty--sm">Flint is looking at the board…</p>';
    board.querySelector('.tk-bar').after(box);
    A.ideas(box, { always: true, force: true, closable: true, eyebrow: 'Flint · this week', title: 'A plan for this week: tap to add' }).then(() => { const w = box.querySelector(':scope > p'); if (w) w.remove(); if (!box.querySelector('.as-ideas')) box.innerHTML = '<p class="tk-empty tk-empty--sm">Flint has no new ideas right now. Write the vision (Dashboard) and it can suggest more.</p>'; });
  }
  function setFilter(k) { filter = statOf(k) ? k : ''; if (filter === 'done') allDone = true; lastSig = ''; calm = true; render(); }
  function setView(v) { view = v === 'board' ? 'board' : 'list'; try { localStorage.setItem(VKEY, view); } catch {} lastSig = ''; calm = true; const M = window.TribeMotion; if (M && M.swap) M.swap(render); else render(); }

  /* ---------------- a row ---------------- */
  function whoCell(t) {
    const a = t.assignee && mem(t.assignee);
    if (a) return `<span class="tk-own" title="${esc(a.name)}">${av(a)}<span class="tk-own__n">${esc(a.id === meId() ? 'Me' : a.name)}</span></span>`;
    if (t.doer === 'flint') return `<span class="tk-own"><span class="tk-av tk-av--flint" title="Flint" aria-label="Flint">${ico('flame', 14)}</span><span class="tk-own__n">Flint</span></span>`;
    if (t.doer === 'agent') return '<span class="tk-own"><span class="tk-av tk-av--ai" title="An AI helper" aria-label="An AI helper">✦</span><span class="tk-own__n">AI helper</span></span>';
    if (t.status === 'backlog') return '<span class="tk-own tk-own--none">' + av(null) + '<span class="tk-own__n">Nobody yet</span></span>';
    return `<button type="button" class="tk-own tk-own--btn" data-qa="assign">${IC.user}<span>Assign</span></button>`;
  }
  function row(t) {
    const ty = typeOf(t.type), [act, label, kind] = step(t);
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [], sd = subs.filter(s => s.done).length;
    const due = t.due && window.TribePlan ? window.TribePlan.dueChip(t) : '';
    const done = t.status === 'done';
    const mine = mineToAnswer(t);
    const xtra = [
      subs.length ? `<span class="tk-cnt${sd === subs.length ? ' is-full' : ''}" title="Checklist"><span class="tk-bar-mini" aria-hidden="true"><i style="width:${Math.round(sd / subs.length * 100)}%"></i></span>${sd}/${subs.length}</span>` : '',
      t.body ? `<span class="tk-cnt" title="Has notes">${IC.notes}</span>` : '',
      (t.labels || []).slice(0, 3).map(l => `<span class="tk-lab">${esc(l)}</span>`).join(''),
      t.source === 'chat' ? '<span class="tk-lab tk-lab--src">from chat</span>' : '',
      mine && t.assignedBy ? `<span class="tk-offer">Assigned to ${t.assignee === meId() ? 'you' : esc(firstName(t.assignee))} by ${esc(firstName(t.assignedBy))}</span>` : pending(t) ? `<span class="tk-offer tk-offer--wait">Waiting for ${esc(firstName(t.assignee))} to accept</span>` : '',
      t.claimed ? `<span class="tk-offer tk-offer--claim">${ico('hand', 12)}<span>Claimed by ${esc(firstName(t.claimed.by))}</span></span>` : '',
      t.declined && !t.assignee ? `<span class="tk-offer tk-offer--no" title="${esc(t.declined.reason)}">${esc(t.declined.byName || 'Someone')} declined: ${esc(t.declined.reason)}</span>` : '',
    ].join('');
    // title first, then the facts in a fixed order: kind · who · due · the next step (columns on a wide board, one line under the title on a narrow one)
    return `<div class="task tk-row${done ? ' is-done' : ''}${overdue(t) ? ' is-late' : ''}${mine ? ' is-mine' : ''}" draggable="true" tabindex="0" data-id="${esc(t.id)}" data-st="${esc(t.status)}" role="button" aria-label="${esc(t.title)}. Open details">
      <button type="button" class="tk-check" data-qa="${done ? 'undone' : 'done'}" aria-label="${done ? 'Mark not done' : 'Mark done'}" title="${done ? 'Mark not done' : 'Mark done'}">${IC.check}</button>
      <div class="tk-main">
        <div class="t" data-title>${esc(t.title)}</div>
        <div class="tk-meta">${ty ? `<span class="tk-ty" title="${ty[2]}">${ico(TYPE_ICON[ty[0]], 14)}<span>${ty[2]}</span></span>` : ''}${due}${xtra ? `<span class="tk-xtra">${xtra}</span>` : ''}</div>
      </div>
      ${whoCell(t)}
      <div class="tk-acts">
        ${t.status === 'review' ? '<button type="button" class="tk-btn tk-btn--back" data-qa="back">Send back</button>' : ''}${act === 'accept' ? '<button type="button" class="tk-btn tk-btn--back" data-qa="decline">Decline</button>' : ''}
        <button type="button" class="tk-btn tk-btn--${kind}" data-qa="${act}">${esc(label)}</button>
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
    if (key === 'needs' && council()) { label = 'Open to claim'; hint = `Anyone can claim one. It's yours right away${work.claimLimit ? ` (up to ${work.claimLimit} open at a time)` : ''}.`; }
    const isDone = status === 'done', n = list.length, shown = isDone ? doneList(list.slice()) : sorted(list.slice());
    const quiet = key === 'needs' ? 'Everything has someone on it.' : key === 'doing' ? 'Nothing in progress. Press Start on a task.' : key === 'review' ? 'Nothing waiting for review.' : key === 'done' ? 'Finished work lands here.' : 'Nothing waiting.';
    const empty = !n ? `<p class="tk-empty tk-empty--sm">${quiet}</p>` : '';
    const more = isDone && n > 3 ? `<button type="button" class="tk-showall" data-done-toggle aria-expanded="${allDone}">${allDone ? '<span>Show less</span>' : `<span>Show all</span> <span class="mono">${n}</span>`}</button>` : '';
    const add = status !== 'done' && key !== 'ready' && key !== 'offer' ? `<button class="add" data-add="${status}" title="Add a task to ${label}" aria-label="Add a task to ${label}">${ico('plus', 14)}</button>` : '';
    return `<section class="col tk-sec${n ? '' : ' is-empty'}" data-col="${status}" data-sec="${key}" aria-label="${label}">
        <h5><span class="dot"></span><span class="tk-sec__l">${label}</span> <span class="n">${n}</span>${hint && n && view === 'list' ? `<span class="tk-sec__h">${hint}</span>` : ''}${add}</h5>
        <div class="tk-list">${shown.map(row).join('')}${empty}</div>${more}
      </section>`;
  }
  // Nothing on the board at all: one welcome instead of four empty boxes. It is still the "needs someone" drop zone,
  // and its Add a task opens the same inline add line a section's + does.
  function welcomeHtml() {
    const F = window.TribeFlint, flow = [['needs', council() ? 'Open to claim' : 'Needs someone'], ['doing', 'In progress'], ['review', 'Waiting for review'], ['done', 'Done']];
    return `<section class="col tk-sec tk-welcome" data-col="backlog" data-sec="needs" aria-label="No tasks yet">
        <div class="tk-empty tk-welcome__in">
          <span class="tk-welcome__i" aria-hidden="true">${ico('tasks', 22)}</span>
          <div class="tk-welcome__t"><h4>No tasks yet</h4><p>Write one small thing to build.</p></div>
          <div class="tk-welcome__b" data-colq><button type="button" class="tk-btn tk-btn--go" data-add="backlog">${ico('plus', 14)}<span>Add a task</span></button>${F && F.ask ? `<button type="button" class="tk-btn" data-flint-plan>${ico('flame', 14)}<span>Ask Flint to plan</span></button>` : ''}</div>
          <ol class="tk-welcome__flow" aria-label="How a task moves">${flow.map(([k, l]) => `<li data-k="${k}"><span class="dot" aria-hidden="true"></span><span>${l}</span></li>`).join('')}</ol>
        </div>
      </section>`;
  }
  function render() {
    const board = $('#board'); if (!board) return;
    shell(board);
    const total = tasks.length, done = tasks.filter(t => t.status === 'done').length;
    const sub = $('#tasks-sub'); if (sub) sub.textContent = `${total} task${total === 1 ? '' : 's'} · ${done} done · ${remote() ? 'shared with your tribe' : 'saved on this device'}`;
    const md = board.querySelector('#tk-mode'); if (md) { md.hidden = !remote(); const l = work.mode === 'council' ? 'Council' : 'Lead assigns'; if (md.dataset.l !== l) { md.dataset.l = l; md.innerHTML = `${ico(work.mode === 'council' ? 'hand' : 'flag', 14)}<span>${l}</span>${IC.chev}`; } }
    const F = window.TribeFlint, fl = board.querySelector('#tk-flint');
    if (fl) { const h = F && F.ask ? `<button type="button" class="tk-chip" data-flint-plan>${ico('flame', 14)}<span>Plan this week with Flint</span></button>` : ''; if (fl.innerHTML !== h) fl.innerHTML = h; }   // feat/tasks-company: redrawn only when it changes (it lost its click handler on every presence blip)
    STATS.forEach(([k, , , fn]) => {
      const n = tasks.filter(fn).length, el = board.querySelector(`[data-segn="${k}"]`); if (el) el.textContent = n;
      const b = board.querySelector(`[data-seg="${k}"]`); if (b) { b.setAttribute('aria-pressed', String(filter === k)); b.classList.toggle('is-zero', !n); }
    });
    const seg = board.querySelector('#tk-seg'); if (seg) seg.classList.toggle('is-quiet', !STATS.some(([, , , fn]) => tasks.some(fn)));
    board.dataset.view = phone() ? 'list' : view; board.dataset.filter = filter; board.classList.toggle('is-blank', !total);
    const vt = document.getElementById('view-tasks'); if (vt) vt.dataset.tkview = board.dataset.view;
    document.querySelectorAll('#view-tasks .tk-views [data-view]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === view)));
    const fp = board.querySelector('#tk-filter'), st = statOf(filter);
    fp.hidden = !st; if (st) fp.innerHTML = `<span class="tkf-k">Showing</span> <b>${st[1]}</b> <button type="button" class="tkd-link" data-clear-filter>Show everything</button>`;
    const pass = st ? st[3] : () => true, vis = tasks.filter(pass);
    const asBoard = view === 'board' && !phone();
    const secs = asBoard ? COLS.map(([k, l]) => [k, k, l, '', t => t.status === k]) : SECTIONS;
    const html = !total ? welcomeHtml() : secs.map(([key, status, label, hint, fn]) => {
      const list = vis.filter(fn);
      if (st && !list.length && !asBoard) return '';
      if (!asBoard && (key === 'ready' || key === 'offer') && !list.length) return '';
      return sectionHtml(key, status, label, hint, list, total);
    }).join('') || `<p class="tk-empty tk-empty--sm tk-none">Nothing here right now. <button type="button" class="tkd-link" data-clear-filter>Show everything</button></p>`;
    const sig = (asBoard ? 'B' : 'L') + html;
    const cols = board.querySelector('.tk-cols');
    if (lastSig !== sig || !cols.firstElementChild) {   // nothing changed (a presence blip): leave the DOM alone, so a click in progress or an open add line survives
      const oq = cols.querySelector('.tk-colq .quick-add'), keepQ = oq ? { sec: oq.closest('.col').dataset.sec, v: oq.value, f: document.activeElement === oq } : null;
      const keepF = document.activeElement && document.activeElement.closest && document.activeElement.closest('#board .task') ? document.activeElement.closest('#board .task').dataset.id : null;
      // motion: remember where every row was, so a new row rises in and a row that changed section arrives from the side it came from
      const was = new Map(); if (!calm) cols.querySelectorAll('.task').forEach(el => was.set(el.dataset.id, [el.closest('.col').dataset.sec, el.getBoundingClientRect().top, el.dataset.st]));
      cols.innerHTML = html; lastSig = sig; bind();
      if (!calm) cols.querySelectorAll('.task').forEach(el => {
        const w = was.get(el.dataset.id);
        if (!w) return el.classList.add('is-new');
        if (w[0] === el.closest('.col').dataset.sec) return;
        el.style.setProperty('--tk-from', (w[1] < el.getBoundingClientRect().top ? -6 : 6) + 'px'); el.classList.add('is-moved');
        if (el.dataset.st === 'done' && w[2] !== 'done') el.classList.add('just-done');
      });
      calm = !loaded;
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
  }

  let lastType = '';
  function quickAdd(sec, focus = true) {
    const col = document.querySelector(`#board .col[data-sec="${sec}"]`); if (!col) return;
    const status = col.dataset.col;
    col.querySelectorAll('.quick-wrap').forEach(x => x.remove());
    const wrap = document.createElement('div'); wrap.className = 'quick-wrap tk-colq';
    wrap.innerHTML = `<input class="quick-add" placeholder="Task title, Enter to add" maxlength="200" aria-label="Task title">${typeChips(lastType, 'sm')}`;
    const inp = wrap.querySelector('input');
    const at = col.querySelector('h5') || col.querySelector('[data-colq]'); if (!at) return; at.after(wrap); if (focus) inp.focus();
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

  // Who you may hand a task to: leads anyone; everyone else themselves and their own agents (server/taskflow.js).
  const pickable = m => !remote() || workLead || m.id === meId() || (m.role === 'agent' && m.owner === meId());
  const assignNote = () => remote() && !workLead ? `<p class="tkp-note">${council() ? 'Council: people claim tasks themselves.' : 'Only a lead assigns tasks to other people.'}</p>` : '';

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
        + ms.filter(m => m.role !== 'agent' && m.id !== me && pickable(m)).map(m => item('who:' + m.id, m.name + (remote() ? ' · asks them' : ''), av(m))).join('')
        + ms.filter(m => m.role === 'agent' && pickable(m)).map(m => item('who:' + m.id, m.name, av(m))).join('')
        + (council() && !hasOwner(t) ? item('claim', 'Claim it myself', ico('hand', 16)) : '') + assignNote()
        + (remote() ? item('who:ask-agent', 'Ask an AI helper', '<span class="tk-av tk-av--ai">✦</span>') : '')
        + (textTask(t) ? item('who:flint', 'Flint', `<span class="tk-av tk-av--flint">${ico('flame', 14)}</span>`) : '')
        + (hasOwner(t) ? item('who:', 'Nobody yet', av(null)) : '')
        + (remote() ? item('vote', 'Put it to a vote', ico('vote', 16)) : '')
        + (F ? '<hr>' + item('flint-pick', 'Ask Flint to pick', ico('flame', 16)) : '');
    } else {
      html = `<p class="tkp-h">Move to</p>${COLS.filter(([k]) => k !== t.status).map(([k, l]) => item('move:' + k, l, `<span class="tkp-dot" style="--c:var(--tk-${k})"></span>`)).join('')}<hr>`
        + item('open', 'Open details') + item('assign', 'Assign…')
        + (remote() ? item('ask-agent', 'Ask an AI helper') : '')
        + (F ? item('flint-pick', 'Ask Flint to pick', ico('flame', 16)) : '')
        + (remote() && t.status !== 'done' ? item('split', 'Split into smaller tasks') : '')
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
      if (m === 'claim') return doStep(t.id, 'claim', anchor);
      if (m === 'vote') return C.api('/chat/general/vote', { method: 'POST', body: { question: `Should we do “${t.title}”?`.slice(0, 200) } }).then(() => window.TribeApp.toast('Put to a vote in the chat.'), e => window.TribeApp.toast(e.message));   // feat/group-styles: Propose, from a task
      if (m === 'flint-pick') { if (!F) return; try { F.focus && F.focus(); } catch {} return F.ask(`Who should do this task, and why: ${t.title}`); }
      if (m === 'split') return split(t.id);
      if (m === 'delete') return remove(t.id);
    });
  }
  // Decline asks for a short reason; it goes back to whoever assigned the task.
  function declinePop(anchor, t) {
    closeMenu();
    const p = document.createElement('div'); p.id = 'tk-pop'; p.className = 'tk-pop tk-pop--why'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Decline this task'); p.dataset.kind = 'decline'; p._anchor = anchor;
    p.innerHTML = `<p class="tkp-h">Decline “${esc(t.title)}”</p><form class="tkp-why"><input class="tkd-in" id="tk-why" maxlength="300" placeholder="Why? e.g. I'm on the boss fight this week" aria-label="Reason" required>
      <div class="tkp-row"><button type="button" class="tk-btn tk-btn--ghost" data-x>Cancel</button><button type="submit" class="tk-btn tk-btn--back">Decline</button></div></form>`;
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(), w = p.offsetWidth;
    p.style.left = Math.min(innerWidth - w - 8, Math.max(8, r.right - w)) + 'px'; p.style.top = Math.min(innerHeight - p.offsetHeight - 8, r.bottom + 6) + 'px';
    const inp = p.querySelector('#tk-why'); inp.focus();
    p.querySelector('[data-x]').onclick = () => closeMenu(true);
    p.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); } });
    p.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const reason = inp.value.trim(); if (!reason) return inp.focus();
      closeMenu();
      try { upsert((await C.api(`/tasks/${encodeURIComponent(t.id)}/decline`, { method: 'POST', body: { reason } })).task); window.TribeApp.toast(`Declined. ${t.assignedBy && t.assignedBy !== meId() ? firstName(t.assignedBy) + ' gets it back with your reason.' : 'It is open again.'}`); }
      catch (err) { window.TribeApp.toast(err.message, 'err'); load(); }
    };
  }
  // "How work is shared": Lead assigns (default) or Council (open claim), a claim limit, agents auto-accept.
  function modePop(anchor) {
    const had = document.getElementById('tk-pop'); if (had && had.dataset.kind === 'mode') return closeMenu(true);
    closeMenu();
    const p = document.createElement('div'); p.id = 'tk-pop'; p.className = 'tk-pop tk-pop--mode'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'How work is shared'); p.dataset.kind = 'mode'; p._anchor = anchor;
    const ro = !workLead || !!work.fromStyle, opt = (k, t, sub) => `<button type="button" class="tkp-mode" data-wmode="${k}" aria-pressed="${work.mode === k}" ${ro ? 'disabled' : ''}><b>${t}</b><small>${sub}</small></button>`;
    p.innerHTML = `<p class="tkp-h">How work is shared</p>${opt('lead', 'Lead assigns', 'A lead assigns tasks; the person accepts or declines.')}${opt('council', 'Council (open claim)', 'Tasks are posted openly; anyone claims one and it is theirs.')}
      <label class="tkp-lim">Claim limit per person <input type="number" class="tkd-in tkd-in--sm" id="tk-lim" min="0" max="20" value="${work.claimLimit || 0}" ${ro ? 'disabled' : ''}><small>0 = no limit</small></label>
      <label class="tkp-lim"><input type="checkbox" id="tk-aaa" ${work.agentAutoAccept ? 'checked' : ''} ${ro ? 'disabled' : ''}> AI helpers accept on their own<small>Off: the agent's owner accepts for it</small></label>
      ${work.fromStyle ? '<p class="tkp-note">This group decides as a council, so tasks are open to claim. Change it under “How we decide”.</p>' : ro ? '<p class="tkp-note">Only the host or a project lead changes this.</p>' : ''}`;
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left)) + 'px'; p.style.top = (r.bottom + 6) + 'px';
    p.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); } });
    const put = async body => {
      try { const w = await C.api('/tasks/settings', { method: 'PUT', body }); work = w.settings; lastSig = ''; render(); window.TribeApp.toast(work.mode === 'council' ? 'Council: new tasks are open to claim' : 'Lead assigns: a lead hands out tasks, people accept'); }
      catch (e) { window.TribeApp.toast(e.message, 'err'); }
    };
    p.querySelectorAll('[data-wmode]').forEach(b => b.onclick = async () => { await put({ mode: b.dataset.wmode }); p.querySelectorAll('[data-wmode]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.wmode === work.mode))); });
    const lim = p.querySelector('#tk-lim'); lim.onchange = () => put({ claimLimit: Number(lim.value) || 0 });
    const aaa = p.querySelector('#tk-aaa'); aaa.onchange = () => put({ agentAutoAccept: aaa.checked });
  }
  async function split(id, btn) {
    if (btn) btn.disabled = true;
    try { const r = await C.api(`/tasks/${encodeURIComponent(id)}/split`, { method: 'POST', body: {} }); window.TribeApp && window.TribeApp.toast(`Split into ${r.tasks.length} smaller tasks`, 'ok'); }
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
    const friends = ms.filter(m => m.role !== 'agent' && m.id !== me && pickable(m)), agents = ms.filter(m => m.role === 'agent' && pickable(m));
    const offer = mineToAnswer(t) ? `<div class="tkd-offer" role="group" aria-label="Assigned to you"><p><b>Assigned to ${t.assignee === me ? 'you' : esc(firstName(t.assignee))}</b>${t.assignedBy ? ` by ${esc(firstName(t.assignedBy))}` : ''}. Accept to make it yours and start it.</p><div class="tkd-offer__b"><button type="button" class="tk-btn tk-btn--back" data-step="decline">Decline…</button><button type="button" class="tk-btn tk-btn--go" data-step="accept">Accept</button></div></div>`
      : pending(t) ? `<div class="tkd-offer tkd-offer--wait"><p>Waiting for <b>${esc(firstName(t.assignee))}</b> to accept. It shows in their board and inbox.</p></div>`
      : t.declined && !t.assignee ? `<div class="tkd-offer tkd-offer--no"><p><b>${esc(t.declined.byName || 'Someone')} declined</b> ${esc(rel(t.declined.at))}: “${esc(t.declined.reason)}”</p></div>`
      : t.claimed ? `<div class="tkd-offer tkd-offer--claim"><p>Claimed by <b>${esc(firstName(t.claimed.by))}</b> ${esc(rel(t.claimed.at))}</p></div>`
      : council() && !hasOwner(t) && t.status !== 'done' ? `<div class="tkd-offer"><p><b>Open to claim.</b> Anyone can take it; it's theirs right away.</p><div class="tkd-offer__b"><button type="button" class="tk-btn tk-btn--assign" data-step="claim">Claim</button></div></div>` : '';
    const opt = (key, label, avatar, on) => `<button type="button" class="tkd-who" data-who="${esc(key)}" aria-pressed="${on}">${avatar}<span>${esc(label)}</span></button>`;
    const whoNow = a ? a.id : t.doer === 'flint' ? 'flint' : t.doer === 'agent' ? 'ask-agent' : '';
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    const by = t.by && mem(t.by), upBy = t.updatedBy && mem(t.updatedBy);
    const [act, label, kind] = step(t);
    d.innerHTML = `<div class="tkd-head"><span class="tkd-k mono">Task</span><button type="button" class="tkd-x" data-tkclose aria-label="Close">${ico('x', 16)}</button></div>
      <div class="tkd-body">
        <textarea id="tkd-title" class="tkd-title" rows="2" maxlength="200" data-keep="title" aria-label="Title">${esc(t.title)}</textarea>
        ${offer}
        ${['accept', 'waiting', 'claim'].includes(act) ? '' : `<div class="tkd-next">${t.status === 'review' ? '<button type="button" class="tk-btn tk-btn--back" data-step="back">Send back</button>' : ''}<button type="button" class="tk-btn tk-btn--${kind}" data-step="${act}">${label}</button></div>`}
        <div class="tkd-row"><span class="tkd-l">Status</span><div class="tkd-status" role="radiogroup" aria-label="Status">${COLS.map(([k, l]) => `<button type="button" role="radio" data-status="${k}" aria-checked="${t.status === k}" style="--c:var(--tk-${k})">${l}</button>`).join('')}</div></div>
        <div class="tkd-row tkd-row--who"><span class="tkd-l">Who does it?</span>
          <div class="tkd-whos" data-whopick tabindex="-1">
            ${opt(me || 'me', 'Me', av(mem(me) || { name: (C.state().me || {}).name || 'Me', color: (C.state().me || {}).color }), whoNow === me)}
            ${friends.map(m => opt(m.id, m.name, av(m), whoNow === m.id)).join('')}
            ${agents.map(m => opt(m.id, m.name, av(m), whoNow === m.id)).join('')}
            ${remote() ? opt('ask-agent', 'Ask an AI helper', '<span class="tk-av tk-av--ai">✦</span>', whoNow === 'ask-agent') : ''}
            ${textTask(t) ? opt('flint', 'Flint', `<span class="tk-av tk-av--flint">${ico('flame', 14)}</span>`, whoNow === 'flint') : ''}
            ${opt('', 'Nobody yet', av(null), !whoNow)}${assignNote()}
            ${!ms.some(m => m.role !== 'agent' && m.id !== me) && remote() ? '<button type="button" class="tkd-link" data-invite>Invite a friend</button>' : ''}
            ${window.TribeFlint ? `<button type="button" class="tkd-link" data-flint-pick>${ico('flame', 14)}<span>Ask Flint to pick</span></button>` : ''}
          </div></div>
        <div class="tkd-row"><span class="tkd-l">Type</span>${typeChips(t.type || '', 'sm tkd-types')}</div>
        <div class="tkd-row"><span class="tkd-l">Due</span><div class="tkd-due"><input type="date" class="tkd-in" id="tkd-due" data-keep="due" value="${esc(t.due || '')}">${t.due ? '<button type="button" class="tkd-link" data-clear-due>Clear</button>' : ''}</div></div>
        <div class="tkd-row"><span class="tkd-l">Labels</span><div class="tkd-labels">${(t.labels || []).map(l => `<span class="tk-lab">${esc(l)}<button type="button" data-unlabel="${esc(l)}" aria-label="Remove ${esc(l)}">×</button></span>`).join('')}<input class="tkd-in tkd-in--sm" id="tkd-label" data-keep="label" placeholder="Add a label" maxlength="24"></div></div>
        <div class="tkd-sec tkd-desc"><span class="tkd-l">Description <em>Markdown</em>${t.body ? '<button type="button" class="tkd-link" data-desc-edit>Edit</button>' : ''}</span>
          ${t.body && window.TribeMD ? `<div class="tkd-md md" data-desc-view>${window.TribeMD.render(t.body)}</div>` : ''}
          <textarea class="tkd-in tkd-notes" id="tkd-notes" data-keep="notes" rows="5" maxlength="20000" placeholder="What is it, and what does done look like? **bold**, - lists, [links](https://…)" ${t.body && window.TribeMD ? 'hidden' : ''}>${esc(t.body || '')}</textarea></div>
        <div class="tkd-sec"><span class="tkd-l">Checklist ${subs.length ? `<em>${subs.filter(s => s.done).length}/${subs.length}</em>` : ''}</span>
          <ul class="tkd-subs">${subs.map((s, i) => `<li><label><input type="checkbox" data-sub="${i}" ${s.done ? 'checked' : ''}><span>${esc(s.t)}</span></label><button type="button" data-unsub="${i}" aria-label="Remove">×</button></li>`).join('')}</ul>
          <input class="tkd-in tkd-in--sm" id="tkd-sub" data-keep="sub" placeholder="Add a step… press Enter" maxlength="200"></div>
        <div class="tkd-sec tkd-act"><span class="tkd-l">Activity</span>
          <p>${by ? `Added by ${esc(by.name)}` : 'Added'} ${esc(rel(t.created))}${t.source === 'chat' ? ' · from chat' : ''}</p>
          ${t.updated ? `<p>Changed ${upBy ? 'by ' + esc(upBy.name) + ' ' : ''}${esc(rel(t.updated))}</p>` : ''}
        </div>
      </div>
      <div class="tkd-foot">${remote() && t.status !== 'done' ? '<button type="button" class="btn sm" data-split>Split into smaller tasks</button>' : ''}<button type="button" class="btn sm danger" data-del>Delete</button></div>`;
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
    const notes = d.querySelector('#tkd-notes'); notes.addEventListener('change', () => { if (notes.value !== (t.body || '')) { d.dataset.for = ''; patch(id, { body: notes.value }); } });
    const de = d.querySelector('[data-desc-edit]'); if (de) de.onclick = () => { const v = d.querySelector('[data-desc-view]'); if (v) v.hidden = true; notes.hidden = false; notes.focus(); de.remove(); };
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
  document.addEventListener('keydown', e => { if (e.key !== 'Escape' || e.defaultPrevented) return; if (document.getElementById('tk-pop')) return closeMenu();   /* the small menus (How work is shared, assign, ⋯) close first */ if (openId) close(); });
  document.addEventListener('pointerdown', e => {   // a click outside closes the menu, and outside the drawer (and outside a row) the drawer
    if (!e.target.closest('#tk-pop') && !e.target.closest('[data-qa="more"], [data-qa="assign"]')) closeMenu();
    if (!openId) return; const d = document.getElementById('tk-drawer');
    if (d && !d.contains(e.target) && !e.target.closest('#board .task') && !e.target.closest('#tk-pop, .flint-panel, #flint-panel, .ff-pill')) close();
  });
  addEventListener('resize', () => { closeMenu(); const b = $('#board'); if (b && b.classList.contains('tkb') && b.dataset.view !== (phone() ? 'list' : view)) { lastSig = ''; render(); } });
  addEventListener('wheel', e => { if (!(e.target && e.target.closest && e.target.closest('#tk-pop'))) closeMenu(); }, { passive: true });   // scrolling the page closes the menu (it's fixed in place)

  window.TribeTasks = { load, render, create, patch, all: () => tasks, open, close, typeChips, TYPES, TYPE_ICON, filter: setFilter, view: setView, current: () => openId };   // current: feat/presence
})();
