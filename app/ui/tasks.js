// Task Board (v0.27.2, calm pass): one "Add a task" line at the top, slim columns, calm cards (title, one meta row:
// who · type · due · labels · checklist), and a side drawer (a bottom sheet on phones) for everything else: who does it,
// status, type, due date, labels, a checklist, notes and activity, split and delete. Hover a card for three quick icons
// (assign · move on · open). Drag between columns as before. Keys: Enter opens a card, Esc closes, arrows move focus.
// Phones: one column at a time with a segmented control (Backlog · Doing · Review · Done) and a swipe.
// Uses the tribe server when connected; otherwise keeps tasks locally on this device.
// Public: window.TribeTasks = { load, render, create, patch, all, open(id), close(), typeChips, TYPES }.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const COLS = [['backlog', 'Backlog', 'Backlog'], ['doing', 'In progress', 'Doing'], ['review', 'Review', 'Review'], ['done', 'Done', 'Done']];
  const LKEY = 'tribecode.localTasks';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let lastSig = '', tasks = [], dragId = null, loaded = false, openId = null, seg = 'backlog', justDragged = 0, draggedId = null;
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
  const T = s => s;   // strings are plain English; app/ui/i18n.js translates the interface chrome in place

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
    const type = typeOf(extra.type) ? extra.type : undefined;
    if (remote()) { const { task } = await C.api('/tasks', { method: 'POST', body: { title, status, type } }); upsert(task); }
    else { const t = { id: 'l-' + Date.now().toString(36), title, status, order: Date.now(), created: new Date().toISOString(), assignee: null, type }; tasks.push(t); local.save(tasks); render(); }
    window.TribeStore.set({ checklist: {} });
  }

  async function patch(id, changes) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    Object.assign(t, changes); render();                       // optimistic
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

  /* ---------------- the board ---------------- */
  function shell(board) {
    if (board.querySelector('.tk-cols')) return;
    board.classList.add('tkb');
    board.innerHTML = `<div class="tk-top quick-wrap">
        <label class="tk-add"><span class="tk-add__plus" aria-hidden="true">+</span><input id="tk-add" class="quick-add" placeholder="Add a task… press Enter" maxlength="200" aria-label="Add a task" autocomplete="off"></label>
        <div class="tk-top__more">${typeChips('', 'sm')}<span class="tk-top__flint" id="tk-flint"></span></div>
      </div>
      <div class="tk-seg" id="tk-seg" role="tablist" aria-label="Columns">${COLS.map(([k, , s]) => `<button type="button" role="tab" data-seg="${k}" aria-selected="false"><span class="tk-seg__l">${s}</span><span class="tk-seg__n" data-segn="${k}">0</span></button>`).join('')}</div>
      <div class="tk-cols"></div>`;
    const inp = board.querySelector('#tk-add'), top = board.querySelector('.tk-top');
    let topType = '';
    top.querySelectorAll('[data-type]').forEach(b => {
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => { topType = topType === b.dataset.type ? '' : b.dataset.type; top.querySelectorAll('[data-type]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.type === topType))); inp.focus(); });
    });
    inp.addEventListener('keydown', async e => {
      if (e.key === 'Enter' && inp.value.trim()) { const v = inp.value; inp.value = ''; await create(v, phone() ? seg : 'backlog', { type: topType }); }
      if (e.key === 'Escape') inp.blur();
    });
    board.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => setSeg(b.dataset.seg)));
    // phones: swipe between columns
    const cols = board.querySelector('.tk-cols'); let sx = 0, sy = 0;
    cols.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    cols.addEventListener('touchend', e => {
      if (!phone() || dragId) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const i = COLS.findIndex(c => c[0] === seg), n = Math.max(0, Math.min(COLS.length - 1, i + (dx < 0 ? 1 : -1))); setSeg(COLS[n][0]);
    }, { passive: true });
  }
  function setSeg(k) {
    seg = k; const board = $('#board'); if (!board) return;
    board.dataset.seg = k;
    board.querySelectorAll('[data-seg]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.seg === k)));
  }

  function card(t) {
    const a = t.assignee && mem(t.assignee), ty = typeOf(t.type);
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [], sd = subs.filter(s => s.done).length;
    const due = t.due && window.TribePlan ? window.TribePlan.dueChip(t) : '';
    const flintDoer = !a && t.doer === 'flint', agentAsk = !a && t.doer === 'agent';
    return `<div class="task" draggable="true" tabindex="0" data-id="${esc(t.id)}" role="button" aria-label="${esc(t.title)}. Open details">
      <div class="t" data-title>${esc(t.title)}</div>
      <div class="tk-meta">
        ${flintDoer ? '<span class="tk-av tk-av--flint" title="Flint" aria-label="Flint">🔥</span>' : agentAsk ? '<span class="tk-av tk-av--ai" title="An AI helper" aria-label="An AI helper">✦</span>' : av(a)}
        ${ty ? `<span class="tk-ty" title="${ty[2]}" aria-label="${ty[2]}">${ty[1]}</span>` : ''}
        ${due}
        ${(t.labels || []).slice(0, 2).map(l => `<span class="tk-lab">${esc(l)}</span>`).join('')}
        ${t.source === 'chat' ? '<span class="tk-lab tk-lab--src">from chat</span>' : ''}
        <span class="tk-meta__end">${subs.length ? `<span class="tk-cnt" title="Checklist"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${sd}/${subs.length}</span>` : ''}${t.body ? '<span class="tk-cnt" title="Has notes"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>' : ''}</span>
      </div>
      <div class="tk-qa" aria-hidden="true"><button type="button" tabindex="-1" data-qa="assign" title="Who does it?">👤</button>${t.status !== 'done' ? '<button type="button" tabindex="-1" data-qa="next" title="Move on">→</button>' : ''}<button type="button" tabindex="-1" data-qa="open" title="Open">⤢</button></div>
    </div>`;
  }

  function render() {
    const board = $('#board'); if (!board) return;
    shell(board); setSeg(seg);
    const total = tasks.length, done = tasks.filter(t => t.status === 'done').length;
    const sub = $('#tasks-sub'); if (sub) sub.textContent = `${total} task${total === 1 ? '' : 's'} · ${done} done · ${remote() ? 'shared with your tribe' : 'saved on this device'}`;
    const F = window.TribeFlint, fl = board.querySelector('#tk-flint');
    if (fl) fl.innerHTML = F && F.ask ? `<button type="button" class="tk-chip" data-flint-plan>🔥 Plan this week with Flint</button>` : '';
    const html = COLS.map(([key, label]) => {
      const list = tasks.filter(t => t.status === key).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const n = board.querySelector(`[data-segn="${key}"]`); if (n) n.textContent = list.length;
      const empty = !list.length ? (key === 'backlog' && !total
        ? `<div class="tk-empty"><p>No tasks yet. Write one small thing to build.</p><button type="button" class="tk-chip" data-focus-add>Add a task</button>${F && F.ask ? '<button type="button" class="tk-chip" data-flint-plan>🔥 Ask Flint to plan tasks</button>' : ''}</div>`
        : `<p class="tk-empty tk-empty--sm">${key === 'done' ? 'Finished work lands here.' : key === 'review' ? 'Ready for a second look.' : key === 'doing' ? 'Drag a card here when you start.' : 'Nothing waiting.'}</p>`) : '';
      return `<section class="col" data-col="${key}" aria-label="${label}">
        <h5><span class="dot"></span>${label} <span class="n">${list.length}</span><button class="add" data-add="${key}" title="Add a task to ${label}" aria-label="Add a task to ${label}">+</button></h5>
        <div class="tk-list">${list.map(card).join('')}${empty}</div>
      </section>`;
    }).join('');
    const cols = board.querySelector('.tk-cols');
    if (lastSig !== html || !cols.firstElementChild) {   // nothing changed (a presence blip): leave the DOM alone, so a click in progress or an open add line survives
      const oq = cols.querySelector('.tk-colq .quick-add'), keepQ = oq ? { col: oq.closest('.col').dataset.col, v: oq.value, f: document.activeElement === oq } : null;
      cols.innerHTML = html; lastSig = html; bind();
      if (keepQ) { quickAdd(keepQ.col, keepQ.f); const n = cols.querySelector('.tk-colq .quick-add'); if (n) n.value = keepQ.v; }
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
  const nextCol = s => { const i = COLS.findIndex(c => c[0] === s); return COLS[Math.min(COLS.length - 1, i + 1)][0]; };

  function bind() {
    document.querySelectorAll('#board .task').forEach(el => {   // only the board's cards (other views use .task too)
      const id = el.dataset.id;
      el.addEventListener('dragstart', e => { dragId = id; el.classList.add('dragging'); document.getElementById('board').classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); });
      el.addEventListener('dragend', () => { dragId = null; justDragged = Date.now(); draggedId = id; el.classList.remove('dragging'); const b = document.getElementById('board'); if (b) b.classList.remove('is-dragging'); document.querySelectorAll('#board .col').forEach(c => c.classList.remove('over')); });
      el.addEventListener('click', e => {
        if ((draggedId === id && Date.now() - justDragged < 250) || e.target.closest('[data-due]')) return;
        const q = e.target.closest('[data-qa]');
        if (q) { e.stopPropagation(); const t = tasks.find(x => x.id === id); if (!t) return;
          if (q.dataset.qa === 'next') return patch(id, { status: nextCol(t.status), order: Date.now() });
          return open(id, q.dataset.qa === 'assign' ? 'who' : null); }
        open(id);
      });
      el.addEventListener('keydown', e => {
        if (e.target !== el) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(id); return; }
        const arrows = { ArrowDown: [0, 1], ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowLeft: [-1, 0] }; const d = arrows[e.key]; if (!d) return;
        e.preventDefault();
        const cols = [...document.querySelectorAll('#board .col')].map(c => [...c.querySelectorAll('.task')]);
        const ci = cols.findIndex(l => l.includes(el)), ri = cols[ci].indexOf(el);
        let nc = ci + d[0], nr = ri + d[1];
        if (d[0]) { while (nc >= 0 && nc < cols.length && !cols[nc].length) nc += d[0]; if (nc < 0 || nc >= cols.length) return; nr = Math.min(ri, cols[nc].length - 1); }
        else { nc = ci; if (nr < 0 || nr >= cols[ci].length) return; }
        cols[nc][nr].focus();
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
      b.addEventListener('mousedown', e => { if (e.button) return; e.preventDefault(); quickAdd(b.dataset.add); });
      b.addEventListener('click', e => { if (!e.detail) quickAdd(b.dataset.add); });   // keyboard / programmatic clicks
    });
    document.querySelectorAll('#board [data-focus-add]').forEach(b => b.addEventListener('click', () => { const i = $('#tk-add'); if (i) i.focus(); }));
    document.querySelectorAll('#board [data-flint-plan]').forEach(b => b.addEventListener('click', () => { const F = window.TribeFlint; if (!F) return; try { F.focus && F.focus(); } catch {} F.ask('Plan this week: suggest a few small tasks for this project'); }));
  }

  let lastType = '';
  function quickAdd(status, focus = true) {
    const col = document.querySelector(`#board [data-col="${status}"]`); if (!col) return;
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
      if (e.key === 'Enter' && inp.value.trim()) { const v = inp.value; inp.value = ''; await create(v, status, { type: lastType }); quickAdd(status); }
      if (e.key === 'Escape') wrap.remove();
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) wrap.remove(); }, 150));
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
    d.innerHTML = `<div class="tkd-head"><span class="tkd-k mono">Task</span><button type="button" class="tkd-x" data-tkclose aria-label="Close">✕</button></div>
      <div class="tkd-body">
        <textarea id="tkd-title" class="tkd-title" rows="2" maxlength="200" data-keep="title" aria-label="Title">${esc(t.title)}</textarea>
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
    const sp = d.querySelector('[data-split]'); if (sp) sp.onclick = async () => {   // feat/ship-flow: one task becomes smaller ones
      sp.disabled = true;
      try { const r = await C.api(`/tasks/${encodeURIComponent(id)}/split`, { method: 'POST', body: {} }); window.TribeApp && window.TribeApp.toast(`✂️ Split into ${r.tasks.length} smaller tasks`, 'ok'); }
      catch (err) { sp.disabled = false; window.TribeApp && window.TribeApp.toast(err.message, 'err'); }
    };
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
  C.on('presence', () => { if (!loaded) return; const a = document.activeElement; if (a && a.classList && (a.classList.contains('quick-add') || (a.closest && a.closest('#tk-drawer')))) return; render(); });   // a presence blip never wipes what you're typing
  document.addEventListener('click', e => { if (e.target.closest('#task-new')) { const i = $('#tk-add'); if (i) i.focus(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openId && !e.defaultPrevented) close(); });
  document.addEventListener('pointerdown', e => {   // a click outside the drawer (and outside a card) closes it
    if (!openId) return; const d = document.getElementById('tk-drawer');
    if (d && !d.contains(e.target) && !e.target.closest('#board .task') && !e.target.closest('.flint-panel, #flint-panel, .ff-pill')) close();
  });

  window.TribeTasks = { load, render, create, patch, all: () => tasks, open, close, typeChips, TYPES };
})();
