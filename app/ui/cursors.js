// Live cursors (feat/live-cursors): see where your friends are pointing, like in Figma. Each person's pointer shows
// in their color with their name, on the same screen of the same project. Positions are shared as fractions of the
// main pane, so different window sizes still line up. Desktop only; nothing is sent while the tab is hidden.
// Off switch: Settings › Profile (tribecode.cursors = 'off'), or ?cursors=off.
//   window.TribeCursors = { on(), set(bool) }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C || !C.on) return;
  const KEY = 'tribecode.cursors', desk = () => matchMedia('(min-width: 821px) and (pointer: fine)').matches;
  const on = () => { try { return localStorage.getItem(KEY) !== 'off' && !/[?&]cursors=off/.test(location.search); } catch { return true; } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pane = () => document.querySelector('.window > .main') || document.querySelector('main');
  const view = () => document.body.dataset.view || '';
  const PAL = ['#F26B1D', '#38C6B1', '#6C7CFF', '#FABD2F', '#FF6F8E', '#3BD16F'];
  const colorOf = (id, c) => c || PAL[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PAL.length];

  // ---------- send mine ----------
  let last = 0, pending = null, shown = false;
  function send(e) {
    if (!on() || !desk() || document.hidden || !C.connected || !C.connected()) return;
    const p = pane(); if (!p) return;
    const r = p.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { if (shown) { C.send({ type: 'cursor', gone: true }); shown = false; } return; }
    pending = { type: 'cursor', view: view(), x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top + p.scrollTop) / Math.max(r.height, p.scrollHeight) };
    const now = Date.now();
    if (now - last >= 60) { last = now; C.send(pending); shown = true; pending = null; }
    else if (!send.t) send.t = setTimeout(() => { send.t = null; if (pending) { last = Date.now(); C.send(pending); shown = true; pending = null; } }, 60);
  }
  addEventListener('pointermove', send, { passive: true });
  const bye = () => { clearTimeout(send.t); send.t = null; pending = null; if (shown && C.connected && C.connected()) { C.send({ type: 'cursor', gone: true }); shown = false; } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) bye(); });
  document.addEventListener('mouseleave', bye);

  // ---------- draw theirs ----------
  const els = new Map();   // memberId -> { el, timer, view }
  let following = null;   // P1-E: the friend you follow (set from the preview's viewer avatars, app/ui/pins.js)
  let layer = null;
  function ensure() { if (layer && layer.isConnected) return layer; layer = document.createElement('div'); layer.className = 'lc-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); return layer; }
  function drop(id) { const c = els.get(id); if (c) { clearTimeout(c.timer); c.el.remove(); els.delete(id); } }
  function place(c) {
    const p = pane(); if (!p) return;
    const r = p.getBoundingClientRect(), x = r.left + c.x * r.width, y = r.top + c.y * Math.max(r.height, p.scrollHeight) - p.scrollTop;
    const visible = c.view === view() && y >= r.top - 4 && y <= r.bottom + 4;
    c.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; c.el.classList.toggle('off', !visible);
  }
  C.on('ws', m => {
    if (!m || m.type !== 'cursor' || !m.by) return;
    if (m.gone || !on() || !desk()) return drop(m.by);
    let c = els.get(m.by);
    if (!c) {
      const col = colorOf(m.by, m.color);
      const el = document.createElement('div'); el.className = 'lc';
      el.innerHTML = `<svg viewBox="0 0 16 20" width="16" height="20"><path d="M1 1l13 8-6 1.5L5 18z" fill="${esc(col)}" stroke="#12151A" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="background:${esc(col)}">${esc(m.name || 'Friend')}</span>`;
      ensure().appendChild(el); c = { el }; els.set(m.by, c);
    }
    Object.assign(c, { x: m.x, y: m.y, view: m.view });
    if (following === m.by && m.view && m.view !== view() && window.TribeApp && window.TribeApp.show) { try { window.TribeApp.show(m.view); } catch {} }   // P1-E: follow a friend to the screen they're on
    c.el.classList.toggle('is-followed', following === m.by);
    place(c);
    clearTimeout(c.timer); c.timer = setTimeout(() => drop(m.by), 8000);   // idle pointers fade away
  });
  // keep them pinned to the content while you scroll or resize; drop everyone when you switch projects
  const re = () => els.forEach(place);
  addEventListener('resize', re); document.addEventListener('scroll', re, true);
  new MutationObserver(re).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  C.on('project', () => [...els.keys()].forEach(drop));
  C.on('presence', ms => { const here = new Set((ms || []).filter(x => x.online).map(x => x.id)); [...els.keys()].forEach(id => { if (!here.has(id)) drop(id); }); });

  window.TribeCursors = { following: () => following, follow: id => { following = id || null; els.forEach((c, k) => c.el.classList.toggle('is-followed', k === following)); }, on, set: v => { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch {} if (!v) { bye(); [...els.keys()].forEach(drop); } } };
})();
