// Kanban board: an original TribeCode starter (MIT). Columns and cards with drag and drop (mouse) and a Move menu
// (keyboard and touch), saved in the browser. The columns come from config.js.
var store = (function () { try { var s = window.localStorage; s.getItem('x'); return s; } catch (e) { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); } }; } })();   // works in a sandboxed preview too
var C = window.CONFIG || {};
document.getElementById('title').textContent = C.title || 'Board';
var COLS = String(C.columns || 'To do|Doing|Done').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
var data = JSON.parse(store.getItem('kanban') || 'null') || { cards: [{ id: 1, col: 0, t: 'Sketch the first screen' }, { id: 2, col: 0, t: 'Pick colors' }, { id: 3, col: 1, t: 'Build the board' }, { id: 4, col: 2, t: 'Set up the project' }] };
var board = document.getElementById('board'), dragId = null;
function save() { store.setItem('kanban', JSON.stringify(data)); }
function render() {
  board.innerHTML = '';
  COLS.forEach(function (name, ci) {
    var col = document.createElement('section'); col.className = 'col'; col.dataset.col = ci;
    var cards = data.cards.filter(function (c) { return Math.min(c.col, COLS.length - 1) === ci; });
    col.innerHTML = '<h2><span></span><span>' + cards.length + '</span></h2>'; col.querySelector('h2 span').textContent = name;
    cards.forEach(function (c) {
      var el = document.createElement('div'); el.className = 'item'; el.draggable = true; el.textContent = c.t; el.tabIndex = 0;
      el.addEventListener('dragstart', function () { dragId = c.id; el.classList.add('dragging'); });
      el.addEventListener('dragend', function () { el.classList.remove('dragging'); });
      el.addEventListener('dblclick', function () { el.contentEditable = 'true'; el.draggable = false; el.focus(); });
      el.addEventListener('blur', function () { if (el.isContentEditable) { c.t = el.textContent.trim() || c.t; save(); render(); } });
      el.addEventListener('keydown', function (e) { if (el.isContentEditable) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } return; } if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { c.col = Math.max(0, Math.min(COLS.length - 1, c.col + (e.key === 'ArrowRight' ? 1 : -1))); save(); render(); } });
      el.addEventListener('click', function () { if (matchMedia('(pointer: coarse)').matches) { c.col = (c.col + 1) % COLS.length; save(); render(); } });
      col.appendChild(el);
    });
    var add = document.createElement('button'); add.className = 'add'; add.type = 'button'; add.textContent = '+ Add a card';
    add.onclick = function () {   // an inline box (prompt is blocked in sandboxed previews)
      var inp = document.createElement('input'); inp.className = 'input'; inp.placeholder = 'Card title, then Enter'; add.replaceWith(inp); inp.focus();
      inp.onkeydown = function (e) { if (e.key === 'Enter' && inp.value.trim()) { data.cards.push({ id: Date.now(), col: ci, t: inp.value.trim() }); save(); render(); } else if (e.key === 'Escape') render(); };
    };
    col.appendChild(add);
    col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', function () { col.classList.remove('over'); });
    col.addEventListener('drop', function (e) { e.preventDefault(); var c = data.cards.find(function (x) { return x.id === dragId; }); if (c) { c.col = ci; save(); render(); } });
    board.appendChild(col);
  });
}
render();
