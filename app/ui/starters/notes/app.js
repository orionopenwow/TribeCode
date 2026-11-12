// Notes, adapted from 50projects50days › notes-app by Brad Traversy and Florin Pop (MIT, see LICENSE).
// TribeCode: a tiny safe Markdown renderer instead of the marked CDN, text buttons instead of the Font Awesome CDN,
// starter notes from config.js and a store that works in a sandboxed preview.
var store = (function () { try { var s = window.localStorage; s.getItem('x'); return s; } catch (e) { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); } }; } })();   // works in a sandboxed preview too
var C = window.CONFIG || {};
document.getElementById('title').textContent = C.title || 'Notes';
var addBtn = document.getElementById('add'), box = document.getElementById('notes');
function md(t) {   // # headings, **bold**, *italic*, `code`, - lists; everything else escaped
  var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  return t.split('\n').map(function (l) {
    var e = esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
    if (/^## /.test(l)) return '<h2>' + e.slice(3) + '</h2>'; if (/^# /.test(l)) return '<h1>' + e.slice(2) + '</h1>';
    if (/^[-*] /.test(l)) return '&bull; ' + e.slice(2) + '<br>'; return e ? e + '<br>' : '<br>';
  }).join('');
}
var notes = JSON.parse(store.getItem('notes') || 'null') || [C.firstNote || '# Welcome\nWrite in **Markdown**.\n- Click edit to change me'];
notes.forEach(function (note) { addNewNote(note); });
addBtn.addEventListener('click', function () { addNewNote(); });
function addNewNote(text) {
  text = text || '';
  var note = document.createElement('div'); note.classList.add('note');
  note.innerHTML = '<div class="tools"><button class="edit" type="button">Edit</button><button class="delete" type="button">Delete</button></div><div class="main ' + (text ? '' : 'hidden') + '"></div><textarea aria-label="Note" class="' + (text ? 'hidden' : '') + '"></textarea>';
  var main = note.querySelector('.main'), textArea = note.querySelector('textarea');
  textArea.value = text; main.innerHTML = md(text);
  note.querySelector('.delete').addEventListener('click', function () { note.remove(); updateLS(); });
  note.querySelector('.edit').addEventListener('click', function () { main.classList.toggle('hidden'); textArea.classList.toggle('hidden'); if (!textArea.classList.contains('hidden')) textArea.focus(); });
  textArea.addEventListener('input', function (e) { main.innerHTML = md(e.target.value); updateLS(); });
  box.prepend(note);
  if (!text) textArea.focus();
}
function updateLS() { var list = []; box.querySelectorAll('textarea').forEach(function (n) { list.unshift(n.value); }); store.setItem('notes', JSON.stringify(list)); }
