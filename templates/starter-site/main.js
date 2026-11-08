// The starter's one behavior: a small list that remembers itself. Replace it with the real thing.
const list = document.getElementById('list');
const key = 'starter.items';
let items = [];
try { items = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
const save = () => { try { localStorage.setItem(key, JSON.stringify(items)); } catch {} };
function draw() {
  list.innerHTML = '';
  items.forEach(it => {
    const li = document.createElement('li'); li.className = it.done ? 'done' : '';
    const box = document.createElement('input'); box.type = 'checkbox'; box.checked = it.done;
    box.onchange = () => { it.done = box.checked; save(); draw(); };
    const span = document.createElement('span'); span.textContent = it.text;
    li.append(box, span); list.appendChild(li);
  });
}
document.getElementById('add').addEventListener('submit', e => {
  e.preventDefault();
  const inp = document.getElementById('item'), text = inp.value.trim(); if (!text) return;
  items.push({ text, done: false }); inp.value = ''; save(); draw();
});
draw();
