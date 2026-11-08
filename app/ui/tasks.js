// Tasks board: drag between columns, reorder, quick add, inline rename, assign, delete.
// Uses the tribe server when connected; otherwise keeps tasks locally on this device.
// feat/setup-flow: a task type (Build · Fix · Design · Write · Research) picked with chips when adding, and one
// "Who does it?" row per card: Me · A friend · An agent (Ask an agent) · Flint (for Write and Research tasks).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const COLS = [['backlog', 'Backlog', 'var(--faint)'], ['doing', 'In progress', 'var(--accent)'], ['review', 'Review', 'var(--amber)'], ['done', 'Done', 'var(--accent-2)']];
  const LKEY = 'tribecode.localTasks';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let tasks = [], dragId = null, loaded = false;
  const TYPES = [['build', '🔨', 'Build'], ['fix', '🩹', 'Fix'], ['design', '🎨', 'Design'], ['write', '✍️', 'Write'], ['research', '🔎', 'Research']];
  const typeOf = k => TYPES.find(t => t[0] === k);
  const DOERS = [['me', '🙋', 'Me'], ['friend', '👋', 'A friend'], ['agent', '🤖', 'An agent'], ['flint', '🔥', 'Flint']];
  const textTask = t => t.type === 'write' || t.type === 'research';
  const meId = () => (C.state().me || {}).id;
  const typeChips = (sel, cls = '') => `<div class="tk-types ${cls}" role="radiogroup" aria-label="Task type">${TYPES.map(([k, e, l]) => `<button type="button" role="radio" class="tk-type" data-type="${k}" aria-checked="${k === sel}"><span class="emo" aria-hidden="true">${e}</span>${l}</button>`).join('')}</div>`;

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
    title = title.trim(); if (!title) return;
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
    tasks = tasks.filter(x => x.id !== id); render();
    if (remote()) { try { await C.api('/tasks/' + id, { method: 'DELETE' }); } catch { load(); } } else local.save(tasks);
    window.TribeApp.toast(`Deleted "${t.title}"`);
  }

  function upsert(t) { const i = tasks.findIndex(x => x.id === t.id); if (i >= 0) tasks[i] = t; else tasks.push(t); render(); }

  function memberOptions(sel) {
    const ms = C.state().members || [];
    if (!ms.length) return '';
    return `<select data-assign title="Assign">${['<option value="">Unassigned</option>', ...ms.map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`)].join('')}</select>`;
  }

  function render() {
    const board = $('#board'); if (!board) return;
    const total = tasks.length, done = tasks.filter(t => t.status === 'done').length;
    $('#tasks-sub').textContent = `${total} task${total === 1 ? '' : 's'} · ${done} done · ${remote() ? 'shared with your tribe' : 'saved on this device'}`;
    board.innerHTML = COLS.map(([key, label, dot]) => {
      const list = tasks.filter(t => t.status === key).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return `<div class="col" data-col="${key}">
        <h5><span class="dot" style="background:${dot}"></span>${label} <span class="n">${list.length}</span><button class="add" data-add="${key}" title="Add task">+</button></h5>
        ${list.map(t => `<div class="task" draggable="true" data-id="${esc(t.id)}">
            <button class="del" data-del title="Delete"><svg class="i" style="width:13px;height:13px"><use href="#i-x"/></svg></button>
            <div class="t" data-title>${esc(t.title)}</div>
            ${who(t)}
            <div class="meta">${typeOf(t.type) ? `<span class="chip tk-tchip" data-t="${t.type}"><span class="emo" aria-hidden="true">${typeOf(t.type)[1]}</span>${typeOf(t.type)[2]}</span>` : ''}${t.source === 'chat' ? '<span class="chip">from chat</span>' : ''}${window.TribePlan ? window.TribePlan.dueChip(t) : ''}<select class="mv" data-move title="Move to">${COLS.map(([k, l]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${l}</option>`).join('')}</select>${memberOptions(t.assignee)}</div>
          </div>`).join('')}
      </div>`;
    }).join('');
    bind();
  }

  // "Who does it?": one row of buttons until someone is picked, then a small chip (tap it to change).
  function who(t) {
    if (!remote() || t.status === 'done') return '';
    const ms = C.state().members || [], a = t.assignee && ms.find(m => m.id === t.assignee);
    const picked = t.doer || (a ? (a.id === meId() ? 'me' : a.role === 'agent' ? 'agent' : 'friend') : '');
    if (picked && !t._pick) {
      const d = DOERS.find(x => x[0] === picked) || DOERS[0];
      const name = picked === 'me' ? 'Me' : picked === 'friend' && a ? a.name.split(' ')[0] : d[2];
      return `<button type="button" class="tk-who-chip" data-who-change title="Change who does it"><span class="emo" aria-hidden="true">${d[1]}</span>${esc(name)}</button>`;
    }
    const list = DOERS.filter(([k]) => k !== 'flint' || textTask(t));
    return `<div class="tk-who" role="group" aria-label="Who does it?"><span class="tk-who-l">Who?</span>${list.map(([k, e, l]) => `<button type="button" class="tk-do" data-do="${k}" ${k === 'agent' ? 'data-askag' : ''} title="${l}" aria-label="${l}"><span class="emo" aria-hidden="true">${e}</span><span class="tk-dl">${l}</span></button>`).join('')}</div>`;
  }
  async function delegate(t, k, el) {
    t._pick = false;
    if (k === 'me') return patch(t.id, { doer: 'me', assignee: meId() });
    if (k === 'agent') { await patch(t.id, { doer: 'agent' }); if (window.TribeAskAgent) window.TribeAskAgent.open({ task: t }); return; }
    if (k === 'flint') { await patch(t.id, { doer: 'flint' }); const F = window.TribeFlint; if (F) { try { F.focus(); } catch {} F.ask(`Help me with this task: ${t.title}`); } return; }
    const friends = (C.state().members || []).filter(m => m.role !== 'agent' && m.id !== meId());
    if (!friends.length) { window.TribeApp.toast('Invite a friend first, then hand it over'); window.TribeApp.openInvite && window.TribeApp.openInvite(); return; }
    const row = el.closest('.tk-who'); if (!row) return;
    row.innerHTML = `<select class="tk-friend" aria-label="Which friend"><option value="">Pick a friend…</option>${friends.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select>`;
    const s = row.querySelector('select'); s.focus();
    s.addEventListener('pointerdown', e => e.stopPropagation());
    s.onchange = () => { if (s.value) patch(t.id, { doer: 'friend', assignee: s.value }); };
    s.onblur = () => setTimeout(() => { if (!s.value) render(); }, 150);
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
    document.querySelectorAll('.task').forEach(el => {
      const id = el.dataset.id;
      el.addEventListener('dragstart', e => { dragId = id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); });
      el.addEventListener('dragend', () => { dragId = null; el.classList.remove('dragging'); document.querySelectorAll('.col').forEach(c => c.classList.remove('over')); });
      const title = el.querySelector('[data-title]');
      title.addEventListener('dblclick', () => {
        title.contentEditable = 'true'; el.draggable = false; title.focus();
        document.getSelection().selectAllChildren(title);
      });
      const commit = () => { if (title.contentEditable !== 'true') return; title.contentEditable = 'false'; el.draggable = true;
        const v = title.textContent.trim(); const t = tasks.find(x => x.id === id); if (v && t && v !== t.title) patch(id, { title: v }); else if (t) title.textContent = t.title; };
      title.addEventListener('blur', commit);
      title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } if (e.key === 'Escape') { const t = tasks.find(x => x.id === id); title.textContent = t ? t.title : ''; title.blur(); } });
      el.querySelector('[data-del]').addEventListener('click', () => remove(id));
      el.querySelectorAll('[data-do]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const t = tasks.find(x => x.id === id); if (t) delegate(t, b.dataset.do, b); }));   // feat/setup-flow (An agent = feat/any-llm's Ask an agent)
      const wc = el.querySelector('[data-who-change]'); if (wc) wc.addEventListener('click', e => { e.stopPropagation(); const t = tasks.find(x => x.id === id); if (t) { t._pick = true; render(); } });
      const mv = el.querySelector('[data-move]'); mv.addEventListener('change', () => patch(id, { status: mv.value, order: Date.now() }));
      mv.addEventListener('pointerdown', e => e.stopPropagation());
      const sel = el.querySelector('[data-assign]'); if (sel) sel.addEventListener('change', () => patch(id, { assignee: sel.value || null }));
    });
    document.querySelectorAll('.col').forEach(col => {
      col.addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', e => {
        e.preventDefault(); col.classList.remove('over'); if (!dragId) return;
        const status = col.dataset.col, order = orderFor(col, e.clientY), t = tasks.find(x => x.id === dragId);
        if (t && (t.status !== status || t.order !== order)) patch(dragId, { status, order });
      });
    });
    document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => quickAdd(b.dataset.add)));
  }

  let lastType = '';
  function quickAdd(status) {
    const col = document.querySelector(`[data-col="${status}"]`); if (!col) return;
    col.querySelectorAll('.quick-wrap').forEach(x => x.remove());
    const wrap = document.createElement('div'); wrap.className = 'quick-wrap';
    wrap.innerHTML = `<input class="quick-add" placeholder="Task title, Enter to add" maxlength="200" aria-label="Task title">${typeChips(lastType, 'sm')}`;
    const inp = wrap.querySelector('input');
    col.querySelector('h5').after(wrap); inp.focus();
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

  C.on('task', t => { if (loaded) upsert(t); });
  C.on('task-removed', id => { tasks = tasks.filter(t => t.id !== id); render(); });
  C.on('status', s => { if (s.status === 'online' && loaded) load(); });
  C.on('presence', () => { if (loaded) render(); });
  document.addEventListener('click', e => { if (e.target.closest('#task-new')) quickAdd('backlog'); });

  window.TribeTasks = { load, render, create, patch, all: () => tasks, typeChips, TYPES };
})();
