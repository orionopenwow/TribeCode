// To-do list: add, check off, delete, filter, clear done. Saved in this browser.
const KEY = 'todo.items';
let items = []; try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch {}
let filter = 'all';
const $ = s => document.querySelector(s);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} };
function draw() {
  const shown = items.filter(i => filter === 'all' || (filter === 'done' ? i.done : !i.done));
  $('#list').innerHTML = '';
  for (const it of shown) {
    const li = document.createElement('li'); li.className = it.done ? 'done' : '';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = it.done; cb.setAttribute('aria-label', 'Done');
    cb.onchange = () => { it.done = cb.checked; save(); draw(); };
    const sp = document.createElement('span'); sp.textContent = it.text;
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Delete');
    x.onclick = () => { items = items.filter(i => i !== it); save(); draw(); };
    li.append(cb, sp, x); $('#list').appendChild(li);
  }
  $('#left').textContent = `${items.filter(i => !i.done).length} left`;
  $('#empty').hidden = items.length > 0;
}
$('#add').onsubmit = e => { e.preventDefault(); const t = $('#new').value.trim(); if (!t) return; items.push({ text: t, done: false }); $('#new').value = ''; save(); draw(); };
document.querySelectorAll('.filters button').forEach(b => b.onclick = () => { filter = b.dataset.f; document.querySelectorAll('.filters button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
$('#clear').onclick = () => { items = items.filter(i => !i.done); save(); draw(); };
draw();
