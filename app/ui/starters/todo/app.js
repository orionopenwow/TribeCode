// To-do list, adapted from 50projects50days › todo-list by Brad Traversy (MIT, see LICENSE).
// TribeCode: the title and starter items come from config.js, a delete button, a count of what's left, and a store
// that works in a sandboxed preview.
var store = (function () { try { var s = window.localStorage; s.getItem('x'); return s; } catch (e) { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); } }; } })();   // works in a sandboxed preview too
var C = window.CONFIG || {};
var form = document.getElementById('form'), input = document.getElementById('input'), todosUL = document.getElementById('todos');
document.getElementById('title').textContent = C.title || 'To-do';
var todos = JSON.parse(store.getItem('todos') || 'null') || String(C.starterItems || '').split('|').filter(Boolean).map(function (t) { return { text: t.trim(), completed: false }; });
todos.forEach(function (todo) { addTodo(todo); });
form.addEventListener('submit', function (e) { e.preventDefault(); addTodo(); });
function addTodo(todo) {
  var todoText = todo ? todo.text : input.value.trim();
  if (!todoText) return;
  var todoEl = document.createElement('li');
  if (todo && todo.completed) todoEl.classList.add('completed');
  var span = document.createElement('span'); span.innerText = todoText; todoEl.appendChild(span);
  var del = document.createElement('button'); del.type = 'button'; del.textContent = '✕'; del.setAttribute('aria-label', 'Delete'); todoEl.appendChild(del);
  todoEl.addEventListener('click', function (e) { if (e.target === del) { todoEl.remove(); } else todoEl.classList.toggle('completed'); updateLS(); });
  todoEl.addEventListener('contextmenu', function (e) { e.preventDefault(); todoEl.remove(); updateLS(); });
  todosUL.appendChild(todoEl);
  input.value = '';
  updateLS();
}
function updateLS() {
  var list = [];
  todosUL.querySelectorAll('li').forEach(function (el) { list.push({ text: el.querySelector('span').innerText, completed: el.classList.contains('completed') }); });
  store.setItem('todos', JSON.stringify(list));
  document.getElementById('left').textContent = list.filter(function (t) { return !t.completed; }).length + ' to go';
}
updateLS();
