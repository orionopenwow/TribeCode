// Floating quick looks, shared by every feature:
//   TribeFloat.peek.register(kind, async (id, el) => card)   hover (desktop) / long-press (touch) cards on
//                                                            any element with data-peek="kind:id"
//   TribeFloat.peek.bind(selector, el => 'kind:id')          make existing elements peekable without touching them
//   TribeFloat.open({ id, title, kind, ref, render })        a small draggable, resizable floating window that
//                                                            survives view switches and remembers its position
//   TribeFloat.restorer(kind, ref => opts)                   reopen floating windows after a reload
//   TribeFloat.pop(anchor, el, opts) / TribeFloat.menu(anchor, items)   small anchored popovers and menus
// Matte: 1px borders, flat surfaces, no shadows (docs/DESIGN-SYSTEM.md).
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const touchy = () => matchMedia('(hover: none)').matches;

  // Icons used by planning, docs extras, visuals and floating windows (1.6px line icons, Lucide style).
  const ICONS = {
    'i-cal': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    'i-image': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    'i-more': '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    'i-pin': '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v7"/>',
    'i-history': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    'i-comment': '<path d="M4 5h16v11H9l-5 4z"/>',
    'i-expand': '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
    'i-popout': '<rect x="3" y="7" width="12" height="12" rx="2"/><path d="M11 3h10v10M21 3l-8 8"/>',
    'i-template': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
    'i-diff': '<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/><path d="M7 9v6M17 10v4"/>',
  };
  (function sprite() {
    if (!document.body) return document.addEventListener('DOMContentLoaded', sprite);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('style', 'display:none'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = Object.entries(ICONS).map(([k, v]) => `<symbol id="${k}" viewBox="0 0 24 24">${v}</symbol>`).join('');
    document.body.prepend(svg);
  })();

  // ---------- anchored popovers ----------
  let popEl = null, popClose = null;
  function place(card, anchor, gap = 6) {
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const w = card.offsetWidth, h = card.offsetHeight, vw = innerWidth, vh = innerHeight;
    let x = Math.min(Math.max(8, r.left), vw - w - 8), y = r.bottom + gap;
    if (y + h > vh - 8) y = Math.max(8, r.top - h - gap);
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
  function closePop() { if (popEl) { popEl.remove(); popEl = null; const f = popClose; popClose = null; if (f) f(); } }
  function pop(anchor, content, { cls = '', onClose } = {}) {
    closePop(); hidePeek(true);
    const el = document.createElement('div'); el.className = 'tf-pop ' + cls;
    if (typeof content === 'string') el.innerHTML = content; else el.appendChild(content);
    document.body.appendChild(el); place(el, anchor);
    popEl = el; popClose = onClose || null;
    setTimeout(() => { const f = el.querySelector('input, select, textarea, button'); if (f && !touchy()) f.focus(); }, 0);
    return { el, close: closePop };
  }
  document.addEventListener('pointerdown', e => { if (popEl && !popEl.contains(e.target) && !e.target.closest('[data-pop-keep]')) closePop(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && popEl) { closePop(); e.stopPropagation(); } }, true);

  function menu(anchor, items) {
    const box = document.createElement('div'); box.className = 'tf-menu';
    box.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button data-i="${i}" ${it.disabled ? 'disabled' : ''}>${it.icon ? `<svg class="i"><use href="#${esc(it.icon)}"/></svg>` : ''}<span>${esc(it.label)}</span>${it.hint ? `<span class="h">${esc(it.hint)}</span>` : ''}</button>`).join('');
    const p = pop(anchor, box, { cls: 'tf-pop-menu' });
    box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { closePop(); items[+b.dataset.i].run(); });
    return p;
  }

  // ---------- peek cards ----------
  const providers = {}, binders = [];
  let peekEl = null, peekFor = null, showTimer = null, hideTimer = null, swallowClick = false, longTimer = null, peekSeq = 0;
  const keyOf = el => el.dataset.peek || (binders.find(([sel]) => el.matches(sel)) || [, () => null])[1](el);
  const target = node => {
    if (!node || !node.closest) return null;
    const el = node.closest('[data-peek]') || binders.map(([sel]) => node.closest(sel)).find(Boolean);
    return el && keyOf(el) ? el : null;
  };
  function hidePeek(now) {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    const go = () => { if (peekEl) { peekEl.remove(); peekEl = null; peekFor = null; } };
    if (now) go(); else hideTimer = setTimeout(go, 220);
  }
  async function showPeek(el) {
    const key = keyOf(el); if (!key) return;
    const i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1), fn = providers[kind]; if (!fn) return;
    const my = ++peekSeq;
    let card; try { card = await fn(id, el); } catch { card = null; }
    if (my !== peekSeq || !card || !el.isConnected) return;
    hidePeek(true); peekFor = el;
    const c = document.createElement('div'); c.className = 'tf-peek'; c.setAttribute('role', 'dialog');
    c.innerHTML = `${card.eyebrow ? `<div class="tf-eyebrow">${card.eyebrow}</div>` : ''}<div class="tf-title">${esc(card.title)}</div>
      ${(card.rows || []).filter(r => r && r[1]).map(([k, v]) => `<div class="tf-row"><span>${esc(k)}</span><span>${v}</span></div>`).join('')}
      ${card.body ? `<div class="tf-body">${card.body}</div>` : ''}
      ${(card.actions || []).length ? `<div class="tf-actions">${card.actions.map((a, j) => `<button class="btn ${a.primary ? 'primary' : ''}" data-a="${j}">${esc(a.label)}</button>`).join('')}</div>` : ''}`;
    c.querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.stopPropagation(); hidePeek(true); card.actions[+b.dataset.a].run(); });
    c.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    c.addEventListener('mouseleave', () => hidePeek());
    document.body.appendChild(c); place(c, el); peekEl = c;
  }
  document.addEventListener('mouseover', e => {
    if (touchy() || popEl) return;
    const el = target(e.target);
    if (peekEl && (peekEl.contains(e.target))) return;
    if (!el) { if (peekEl || showTimer) { clearTimeout(showTimer); showTimer = null; hidePeek(); } return; }
    if (el === peekFor) { clearTimeout(hideTimer); return; }
    clearTimeout(showTimer); showTimer = setTimeout(() => showPeek(el), 380);
  });
  document.addEventListener('pointerdown', e => {
    if (peekEl && !peekEl.contains(e.target)) hidePeek(true);
    if (e.pointerType !== 'touch') { clearTimeout(showTimer); return; }
    const el = target(e.target); if (!el) return;
    const x = e.clientX, y = e.clientY;
    clearTimeout(longTimer); longTimer = setTimeout(() => { swallowClick = true; showPeek(el); if (navigator.vibrate) navigator.vibrate(8); }, 480);
    const cancel = ev => { if (ev.type === 'pointermove' && Math.hypot(ev.clientX - x, ev.clientY - y) < 8) return; clearTimeout(longTimer); off(); };
    const off = () => { removeEventListener('pointermove', cancel); removeEventListener('pointerup', cancel); removeEventListener('pointercancel', cancel); };
    addEventListener('pointermove', cancel); addEventListener('pointerup', cancel); addEventListener('pointercancel', cancel);
  }, true);
  document.addEventListener('click', e => { if (swallowClick) { swallowClick = false; if (!(peekEl && peekEl.contains(e.target))) { e.preventDefault(); e.stopPropagation(); } } }, true);
  document.addEventListener('contextmenu', e => { if (touchy() && target(e.target)) e.preventDefault(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePeek(true); });
  addEventListener('scroll', () => hidePeek(true), true);

  // ---------- floating windows ----------
  const SKEY = 'tribecode.floats';
  const wins = new Map(), restorers = {};
  const saved = () => { try { return JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch { return {}; } };
  const persist = (id, patch) => { const all = saved(); all[id] = { ...(all[id] || {}), ...patch }; if (patch === null) delete all[id]; try { localStorage.setItem(SKEY, JSON.stringify(all)); } catch {} };
  let zTop = 28;

  function open(opts) {
    const { id, title, kind, ref, render, onOpenFull } = opts;
    if (wins.has(id)) { const w = wins.get(id); w.el.style.zIndex = ++zTop; w.setTitle(title); return w; }
    const st = saved()[id] || {}, n = wins.size;
    const el = document.createElement('div'); el.className = 'fwin'; el.dataset.float = id; el.style.zIndex = ++zTop;
    const w0 = Math.min(st.w || opts.w || 360, innerWidth - 16), h0 = Math.min(st.h || opts.h || 420, innerHeight - 16);
    Object.assign(el.style, { width: w0 + 'px', height: h0 + 'px', left: clampX(st.x ?? innerWidth - w0 - 340 - n * 24, w0) + 'px', top: clampY(st.y ?? 90 + n * 24) + 'px' });
    el.innerHTML = `<div class="fwin-head"><span class="fwin-title"></span>
      ${onOpenFull ? '<button class="fwin-btn" data-full title="Open in place"><svg class="i"><use href="#i-expand"/></svg></button>' : ''}
      <button class="fwin-btn" data-x title="Close"><svg class="i"><use href="#i-x"/></svg></button></div><div class="fwin-body"></div>`;
    document.body.appendChild(el);
    const head = el.querySelector('.fwin-head'), body = el.querySelector('.fwin-body');
    const api = { id, el, body, setTitle: t => { el.querySelector('.fwin-title').textContent = t || ''; }, close, cleanup: null };
    api.setTitle(title);
    el.addEventListener('pointerdown', () => { el.style.zIndex = ++zTop; });
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      e.preventDefault(); head.setPointerCapture(e.pointerId);
      const sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop; el.classList.add('dragging');
      const mv = ev => { el.style.left = clampX(ev.clientX - sx, el.offsetWidth) + 'px'; el.style.top = clampY(ev.clientY - sy) + 'px'; };
      const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); el.classList.remove('dragging'); persist(id, { x: el.offsetLeft, y: el.offsetTop }); };
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
    });
    let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (el.isConnected) persist(id, { w: el.offsetWidth, h: el.offsetHeight }); }, 200); }).observe(el);
    el.querySelector('[data-x]').onclick = () => close();
    const full = el.querySelector('[data-full]'); if (full) full.onclick = () => onOpenFull();
    function close() { if (api.cleanup) try { api.cleanup(); } catch {} el.remove(); wins.delete(id); const all = saved(); if (all[id]) { all[id].open = false; try { localStorage.setItem(SKEY, JSON.stringify(all)); } catch {} } }
    wins.set(id, api);
    persist(id, { open: true, kind, ref, x: el.offsetLeft, y: el.offsetTop });
    try { api.cleanup = render(body, api) || null; } catch (e) { console.error(e); }
    return api;
  }
  const clampX = (x, w) => Math.min(Math.max(4, x), Math.max(4, innerWidth - Math.min(w, 120)));
  const clampY = y => Math.min(Math.max(4, y), innerHeight - 44);
  addEventListener('resize', () => { for (const w of wins.values()) { w.el.style.left = clampX(w.el.offsetLeft, w.el.offsetWidth) + 'px'; w.el.style.top = clampY(w.el.offsetTop) + 'px'; } });
  function restorer(kind, fn) {
    restorers[kind] = fn;
    for (const [id, st] of Object.entries(saved())) if (st.open && st.kind === kind && !wins.has(id)) { try { const o = fn(st.ref); if (o) open({ ...o, id, kind, ref: st.ref }); } catch {} }
  }

  // ---------- rail "more" menu (features that don't need their own rail slot) ----------
  const more = [];
  document.addEventListener('click', e => {
    const b = e.target.closest('#rail-more, [data-float-more]'); if (!b) return;
    const r = b.getBoundingClientRect();
    const items = more.map(m => ({ ...m }));
    if (matchMedia('(max-width: 820px)').matches) menu({ left: r.left, top: r.top, bottom: r.top }, items);
    else menu({ left: r.right + 8, top: r.top - 6, bottom: r.top - 6 }, items);
  });

  window.TribeFloat = {
    peek: { register: (kind, fn) => { providers[kind] = fn; }, bind: (sel, fn) => binders.push([sel, fn]), hide: () => hidePeek(true) },
    open, restorer, pop, menu, closePop, isOpen: id => wins.has(id), get: id => wins.get(id), more: item => more.push(item), esc,
  };
})();
