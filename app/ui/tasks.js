// Tasks board: drag between columns, reorder, quick add, inline rename, assign, delete.
// Uses the tribe server when connected; otherwise keeps tasks locally on this device.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const COLS = [['backlog', 'Backlog', 'var(--faint)'], ['doing', 'In progress', 'var(--accent)'], ['review', 'Review', 'var(--amber)'], ['done', 'Done', 'var(--accent-2)']];
  const LKEY = 'tribecode.localTasks';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let tasks = [], dragId = null, loaded = false;

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

  async function create(title, status) {
    title = title.trim(); if (!title) return;
    if (remote()) { const { task } = await C.api('/tasks', { method: 'POST', body: { title, status } }); upsert(task); }
    else { const t = { id: 'l-' + Date.now().toString(36), title, status, order: Date.now(), created: new Date().toISOString(), assignee: null }; tasks.push(t); local.save(tasks); render(); }
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
            <div class="meta">${t.source === 'chat' ? '<span class="chip">from chat</span>' : ''}<select class="mv" data-move title="Move to">${COLS.map(([k, l]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${l}</option>`).join('')}</select>${memberOptions(t.assignee)}</div>
          </div>`).join('')}
      </div>`;
    }).join('');
    bind();
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

  function quickAdd(status) {
    const col = document.querySelector(`[data-col="${status}"]`);
    const inp = document.createElement('input');
    inp.className = 'quick-add'; inp.placeholder = 'Task title, Enter to add'; inp.maxLength = 200;
    col.querySelector('h5').after(inp); inp.focus();
    inp.addEventListener('keydown', async e => {
      if (e.key === 'Enter' && inp.value.trim()) { const v = inp.value; inp.value = ''; await create(v, status); quickAdd(status); }
      if (e.key === 'Escape') inp.remove();
    });
    inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 150));
  }

  C.on('task', t => { if (loaded) upsert(t); });
  C.on('task-removed', id => { tasks = tasks.filter(t => t.id !== id); render(); });
  C.on('status', s => { if (s.status === 'online' && loaded) load(); });
  C.on('presence', () => { if (loaded) render(); });
  document.addEventListener('click', e => { if (e.target.closest('#task-new')) quickAdd('backlog'); });

  window.TribeTasks = { load, render, create, all: () => tasks };
})();
