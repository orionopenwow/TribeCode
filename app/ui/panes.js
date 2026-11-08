// Resizable panes (desktop): drag the line between the sidebar and the page, or between the page and the right panel
// (or the preview), to resize. Sizes are remembered on this device; double-click a handle to reset it.
// Keyboard: focus a handle (Tab) and use ← / →. Phones: no handles (the panes are drawers there).
//   window.TribePanes = { reset() }
(function () {
  'use strict';
  const KEY = 'tribecode.panes.v1', RAIL = 76;
  const LIMITS = { side: [200, 440, 260], right: [260, 600, 320], pvw: [320, 1100, 0] };
  const win = document.querySelector('.shell .window'); if (!win) return;
  const phone = matchMedia('(max-width: 820px)');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };
  const rightKey = () => document.body.classList.contains('pvw-on') ? 'pvw' : 'right';
  const varOf = k => ({ side: '--side-w', right: '--right-w', pvw: '--pvw-w' })[k];
  const clamp = (k, v) => { const [lo, hi] = LIMITS[k], max = k === 'side' ? hi : Math.min(hi, Math.round(innerWidth - RAIL - (saved.side || 260) - 420)); return Math.round(Math.max(lo, Math.min(max, v))); };
  function apply() {
    for (const k of ['side', 'right', 'pvw']) { if (saved[k]) win.style.setProperty(varOf(k), clamp(k, saved[k]) + 'px'); else win.style.removeProperty(varOf(k)); }
    place(); dispatchEvent(new Event('resize'));
  }
  const mk = (id, label) => { const h = document.createElement('div'); h.className = 'pane-handle'; h.id = id; h.tabIndex = 0; h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical'); h.setAttribute('aria-label', label); h.title = 'Drag to resize · double-click to reset'; win.appendChild(h); return h; };
  const hs = mk('pane-h-side', 'Resize the sidebar'), hr = mk('pane-h-right', 'Resize the right panel');
  function place() {
    const off = phone.matches, side = document.querySelector('#tour-side'), right = document.querySelector('.window > .right, .window > aside.right, #room-panel');
    const panelOff = document.body.classList.contains('panel-off') || document.body.classList.contains('pp-on');
    hs.hidden = off || !side; hr.hidden = off || panelOff;
    const wr = win.getBoundingClientRect();
    if (!hs.hidden) { const r = side.getBoundingClientRect(); hs.style.left = Math.round(r.right - wr.left - 3) + 'px'; }
    if (!hr.hidden) { const cs = getComputedStyle(win).gridTemplateColumns.split(' '), w = parseFloat(cs[cs.length - 1]) || 0; hr.hidden = w < 40; hr.style.left = Math.round(wr.width - w - 3) + 'px'; }
  }
  function drag(h, which) {
    h.addEventListener('pointerdown', e => {
      if (e.button !== 0) return; e.preventDefault(); h.setPointerCapture(e.pointerId);
      const k = which === 'side' ? 'side' : rightKey(), wr = win.getBoundingClientRect();
      const sideEl = document.querySelector('#tour-side'), sideLeft = sideEl ? sideEl.getBoundingClientRect().left : wr.left + RAIL;   // qa-qol-2: measured (the rail got narrower than RAIL), so the edge follows the pointer exactly
      document.body.classList.add('pane-resizing'); h.classList.add('on');
      const move = ev => { const v = k === 'side' ? ev.clientX - sideLeft : wr.right - ev.clientX; saved[k] = clamp(k, v); win.style.setProperty(varOf(k), saved[k] + 'px'); place(); dispatchEvent(new Event('resize')); };
      const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); document.body.classList.remove('pane-resizing'); h.classList.remove('on'); save(); };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
    h.addEventListener('dblclick', () => { delete saved[which === 'side' ? 'side' : rightKey()]; save(); apply(); });
    h.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault();
      const k = which === 'side' ? 'side' : rightKey(), cur = saved[k] || parseFloat(getComputedStyle(win).getPropertyValue(varOf(k))) || (k === 'side' ? 260 : k === 'right' ? 320 : Math.round(innerWidth * 0.4));
      const d = (e.shiftKey ? 40 : 12) * (e.key === 'ArrowRight' ? 1 : -1) * (k === 'side' ? 1 : -1);
      saved[k] = clamp(k, cur + d); save(); apply();
    });
  }
  drag(hs, 'side'); drag(hr, 'right');
  apply();
  addEventListener('resize', () => requestAnimationFrame(place));
  new MutationObserver(() => requestAnimationFrame(place)).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  phone.addEventListener('change', apply);
  window.TribePanes = { reset() { saved = {}; save(); apply(); } };
})();
