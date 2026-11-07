// The Patrons panel (Tab or the button): every bot, their role, what they are doing, and three orders.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ORDERS = [['follow', 'Follow me'], ['stay', 'Stay'], ['home', 'Go to your spot']];

export function createRoster({ panel, list, toggle, patrons, onOpen }) {
  list.innerHTML = patrons.map(p => `<div class="patron" data-id="${esc(p.id)}">
    <div class="row"><span class="dot" style="background:${esc(p.data.color || '#9aa1b2')}"></span><span class="name">${esc(p.name)}</span><span class="bot">BOT</span><span class="dim">${esc(p.role)}</span><span class="doing"></span></div>
    <div class="orders">${ORDERS.map(([o, label]) => `<button class="order" data-order="${o}">${label}</button>`).join('')}</div></div>`).join('');
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-order]'); if (!b) return;
    const p = patrons.find(x => x.id === b.closest('.patron').dataset.id);
    if (p) { p.order(b.dataset.order); refresh(); }
  });
  const isOpen = () => !panel.hidden;
  function set(open) { panel.hidden = !open; if (open) { onOpen && onOpen(); refresh(); } }
  toggle.addEventListener('click', () => set(!isOpen()));
  addEventListener('keydown', e => { if (e.code === 'Tab') { e.preventDefault(); set(!isOpen()); } });
  function refresh() {
    if (!isOpen()) return;
    for (const p of patrons) {
      const el = list.querySelector(`[data-id="${CSS.escape(p.id)}"] .doing`);
      if (el && el.textContent !== p.activity) el.textContent = p.activity;
    }
  }
  return { refresh, open: () => set(true), close: () => set(false), isOpen };
}
