// Put the rail and the sidebar in your own order (feat/shell-polish). Drag an item to a new place, or focus it and press
// Alt+↑ / Alt+↓. Lists:
//   rail      the tribe's projects and the Workshop wrench, under the Home logo (Home stays first)   per tribe
//   home      Home's sidebar rows: Home, Files, Design, Code, Work, Agent fleet                     per tribe
//   project   a project's rows: Dashboard, Messages, Files, Design, Task Board, Agents Hub…        per project
//   extra     a project's added rows: Website and widgets                                          per project
// Pointer events cover mouse, touch and pen (touch and pen need a long-press, so scrolling still scrolls). A flat 2px
// line shows where it will land. The order is saved per person in localStorage and, with a tribe, in the member's
// prefs (PUT /api/hub/prefs { order }). Items the order doesn't know yet go at the end. "Reset order" is in the
// right-click menu and in Settings.
//   window.TribeReorder = { order(list), move(el, delta), reset(list?), lists() }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const $ = s => document.querySelector(s);
  const LS = 'tribecode.order.v1';
  const desk = () => matchMedia('(min-width: 821px)').matches;
  const st = () => (C() && C().state && C().state()) || {};
  const tribeKey = () => { const t = st().tribe || {}; return String(t.id || t.name || 'local').replace(/[^\w.-]/g, '').slice(0, 40) || 'local'; };
  const projKey = () => String(st().project || 'none').replace(/[^\w.-]/g, '').slice(0, 60) || 'none';
  const keyOfRow = el => el.dataset.pnav || (el.querySelector && el.querySelector('[data-pnav]') || {}).dataset?.pnav || el.id || '';

  const LISTS = {
    rail: { label: 'the rail', box: () => $('#pj-rail'), sel: ':scope > [data-pj-open], :scope > #rail-workshop', key: el => (el.id === 'rail-workshop' ? 'workshop' : 'p:' + el.dataset.pjOpen), scope: () => tribeKey(), name: el => el.getAttribute('aria-label') || el.title || 'item' },
    home: { label: 'Home\'s sidebar', box: () => $('#grp-global'), sel: ':scope > .nest-row', key: keyOfRow, scope: () => tribeKey() },
    project: { label: 'the project\'s sidebar', box: () => $('#pj-nav'), sel: ':scope > .nest-row, :scope > .nest-line', key: keyOfRow, scope: () => tribeKey() + '.' + projKey(), fixed: true, tail: () => $('#nest-extra'), glue: { 'chat': () => $('#nest-streams') } },
    extra: { label: 'the project\'s added rows', box: () => $('#nest-extra'), sel: ':scope > .nest-row', key: keyOfRow, scope: () => tribeKey() + '.' + projKey() },
  };
  const nameOf = (L, el) => (L.name ? L.name(el) : ((el.querySelector('span') || el).textContent || '').trim() || 'item');
  const listOf = el => { for (const [id, L] of Object.entries(LISTS)) { const b = L.box(); if (b && el.parentElement === b && el.matches(L.sel.replace(/:scope > /g, ''))) return id; } return null; };
  const itemsOf = L => { const b = L.box(); return b ? [...b.querySelectorAll(L.sel)].filter(e => !e.classList.contains('hidden')) : []; };
  const allItems = L => { const b = L.box(); return b ? [...b.querySelectorAll(L.sel)] : []; };

  // ---------- storage ----------
  const read = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };
  const write = x => { try { localStorage.setItem(LS, JSON.stringify(x)); } catch {} };
  const fullKey = id => `${id}:${LISTS[id].scope()}`;
  const order = id => read()[fullKey(id)] || null;
  let pushT = null, pending = {};
  function sync(k, v) {
    if (!(C() && C().connected && C().connected())) return;
    pending[k] = v; clearTimeout(pushT);
    pushT = setTimeout(() => { const body = { order: pending }; pending = {}; C().api('/hub/prefs', { method: 'PATCH', body }).catch(() => {}); }, 400);
  }
  function save(id, keys) { const x = read(), k = fullKey(id); if (keys) x[k] = keys; else delete x[k]; write(x); sync(k, keys || null); }
  async function pull() {   // the member's saved order from the server (another device), when this one has none yet
    try {
      const r = await C().api('/hub/prefs'); const o = (r && r.order) || {}, x = read(); let changed = false;
      for (const [k, v] of Object.entries(o)) if (!x[k] && Array.isArray(v)) { x[k] = v; changed = true; }
      if (changed) { write(x); applyAll(); }
    } catch {}
  }

  // ---------- applying an order ----------
  const defaults = {};   // the renderer's own order, for Reset
  let applying = false;
  let wrench = null;   // kept: the rail's renderer replaces #pj-rail's children, which would drop the wrench we moved in
  function placeWrench() {
    const w = wrench = $('#rail-workshop') || wrench, r = $('#pj-rail'); if (!w || !r) return;
    if (desk()) { if (w.parentElement !== r) r.appendChild(w); }
    else { const plus = $('#pj-plus'); if (plus && w.parentElement === r) plus.after(w); }
  }
  function arrange(id, keys) {
    const L = LISTS[id], b = L.box(); if (!b) return;
    if (id === 'rail') placeWrench();
    const els = allItems(L), by = new Map(els.map(e => [L.key(e), e]));
    const want = [...keys.filter(k => by.has(k)), ...els.map(L.key).filter(k => !keys.includes(k))];   // unknown (new) items at the end
    const tail = L.tail ? L.tail() : null;
    applying = true;
    for (const k of want) {
      const e = by.get(k); b.insertBefore(e, tail && tail.parentElement === b ? tail : null);
      const g = L.glue && L.glue[k] && L.glue[k](); if (g && g.parentElement === b) b.insertBefore(g, tail && tail.parentElement === b ? tail : null);
    }
    applying = false;
  }
  function apply(id) {
    const L = LISTS[id]; if (!L.box()) return;
    if (id === 'rail') placeWrench();
    const cur = allItems(L).map(L.key); if (!cur.length) return;
    if (!defaults[id]) defaults[id] = cur;
    arrange(id, order(id) || defaults[id]);   // no saved order: the renderer's (or the page's) own order
  }
  function applyAll() { for (const id of Object.keys(LISTS)) apply(id); flush(); }

  // re-apply after a renderer redraws a list (projects.js, shell.js, widgets.js); our own moves are ignored
  const observers = new Map();
  function flush() { for (const o of observers.values()) o.takeRecords(); }
  function watch() {
    for (const [id, L] of Object.entries(LISTS)) {
      const b = L.box(); if (!b || observers.has(b)) continue;
      const mo = new MutationObserver(() => {
        if (applying || dragging) return;
        const cur = allItems(L).map(L.key);
        if (L.fixed) defaults[id] = [...(defaults[id] || []).filter(k => cur.includes(k)), ...cur.filter(k => !(defaults[id] || []).includes(k))];   // rows in the page: new ones join the end
        else defaults[id] = id === 'rail' && !cur.includes('workshop') ? [...cur, 'workshop'] : cur;   // a renderer drew it again: that is its own order
        apply(id); flush();
      });
      mo.observe(b, { childList: true }); observers.set(b, mo);
    }
    const g = $('#nest-groups');   // Home's rows live in a box drawn again on every move between places
    if (g && !observers.has(g)) { const mo = new MutationObserver(() => { defaults.home = null; watch(); apply('home'); flush(); }); mo.observe(g, { childList: true }); observers.set(g, mo); }
  }

  // ---------- moving ----------
  const live = () => { let r = $('#ro-live'); if (!r) { r = document.createElement('div'); r.id = 'ro-live'; r.className = 'ro-live'; r.setAttribute('aria-live', 'polite'); r.setAttribute('role', 'status'); document.body.appendChild(r); } return r; };
  const say = t => { const r = live(); r.textContent = ''; setTimeout(() => { r.textContent = t; }, 30); };
  function commit(id, keys, el, how) {
    save(id, keys); arrange(id, keys); flush();
    const L = LISTS[id], i = keys.indexOf(L.key(el));
    say(`${nameOf(L, el)} moved${how ? ' ' + how : ''}: ${i + 1} of ${keys.length} in ${L.label}.`);
  }
  function move(el, delta) {
    const id = listOf(el); if (!id) return false;
    const L = LISTS[id], vis = itemsOf(L).map(L.key), all = allItems(L).map(L.key), k = L.key(el);
    const i = vis.indexOf(k), j = i + delta; if (i < 0 || j < 0 || j >= vis.length) { say(`${nameOf(L, el)} is already ${delta < 0 ? 'first' : 'last'}.`); return false; }
    const target = vis[j], out = all.filter(x => x !== k); out.splice(out.indexOf(target) + (delta > 0 ? 1 : 0), 0, k);
    commit(id, out, el, delta < 0 ? 'up' : 'down');
    const f = el.matches('button') ? el : el.querySelector('button'); if (f) f.focus({ preventScroll: true });
    return true;
  }
  function reset(id) {
    const ids = id ? [id] : Object.keys(LISTS);
    for (const x of ids) {
      save(x, null); const d = defaults[x]; if (d) arrange(x, d);
      if (x === 'rail' && window.TribeProjects && window.TribeProjects.refresh) { try { window.TribeProjects.refresh(); } catch {} }
    }
    flush(); say(id ? `${LISTS[id].label[0].toUpperCase() + LISTS[id].label.slice(1)} is back in its first order.` : 'The rail and the sidebar are back in their first order.');
  }

  // keyboard: Alt+↑ / Alt+↓ (before projects.js's arrow keys and the router's Alt+← / Alt+→)
  addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const t = e.target && e.target.closest && e.target.closest('#pj-rail > *, #grp-global > .nest-row, #pj-nav > .nest-row, #pj-nav > .nest-line, #nest-extra > .nest-row'); if (!t) return;
    e.preventDefault(); e.stopPropagation(); move(t, e.key === 'ArrowUp' ? -1 : 1);
  }, true);

  // pointer: mouse drags after 5px; touch and pen after a 400ms press (moving first means scrolling)
  let drag = null, dragging = false, line = null, swallow = 0;
  const ITEMS = '#pj-rail > [data-pj-open], #pj-rail > #rail-workshop, #grp-global > .nest-row, #pj-nav > .nest-row, #pj-nav > .nest-line, #nest-extra > .nest-row';
  function indicator() { if (!line) { line = document.createElement('div'); line.className = 'ro-line'; line.setAttribute('aria-hidden', 'true'); document.body.appendChild(line); } return line; }
  function slot(L, y, self) {
    const vis = itemsOf(L).filter(e => e !== self);
    for (let i = 0; i < vis.length; i++) { const r = vis[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return { before: vis[i], y: r.top, list: vis }; }
    const last = vis[vis.length - 1]; return { before: null, y: last ? last.getBoundingClientRect().bottom : 0, list: vis };
  }
  function startDrag() {
    dragging = true; document.body.classList.add('ro-on'); drag.el.classList.add('ro-dragging');
    try { drag.el.setPointerCapture(drag.pid); } catch {}
    if (navigator.vibrate && drag.type === 'touch') try { navigator.vibrate(8); } catch {}
  }
  function track(y) {
    const L = LISTS[drag.id], s = slot(L, y, drag.el), b = L.box().getBoundingClientRect(), ln = indicator();
    drag.slot = s;
    ln.style.left = (b.left + 4) + 'px'; ln.style.width = Math.max(24, b.width - 8) + 'px'; ln.style.top = (s.y - 3) + 'px'; ln.classList.add('on');
  }
  function endDrag(ok) {
    const d = drag; drag = null;
    if (line) line.classList.remove('on');
    document.body.classList.remove('ro-on');
    if (!d) return;
    clearTimeout(d.timer); d.el.classList.remove('ro-dragging', 'ro-armed');
    if (!dragging) return; dragging = false; swallow = Date.now();
    if (!ok || !d.slot) return;
    const L = LISTS[d.id], k = L.key(d.el), all = allItems(L).map(L.key).filter(x => x !== k);
    const at = d.slot.before ? all.indexOf(L.key(d.slot.before)) : all.length; all.splice(at < 0 ? all.length : at, 0, k);
    commit(d.id, all, d.el, '');
  }
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag || !e.isTrusted) return;   // a scripted pointerdown (the tour's ghost clicks) has no pointerup: it would arm a drag that never ends and eat Esc
    const el = e.target.closest && e.target.closest(ITEMS); if (!el) return;
    const id = listOf(el); if (!id || itemsOf(LISTS[id]).length < 2) return;
    drag = { el, id, x: e.clientX, y: e.clientY, pid: e.pointerId, type: e.pointerType, slot: null, timer: 0 };
    if (e.pointerType !== 'mouse') { el.classList.add('ro-armed'); drag.timer = setTimeout(() => { if (drag && drag.el === el) { startDrag(); track(drag.y); } }, 400); }
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, far = Math.hypot(dx, dy);
    if (!dragging) {
      if (drag.type === 'mouse') { if (far > 5) startDrag(); else return; }
      else { if (far > 8) { clearTimeout(drag.timer); drag.el.classList.remove('ro-armed'); drag = null; } return; }
    }
    e.preventDefault(); drag.y = e.clientY; track(e.clientY);
  }, { passive: false });
  document.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.pid) endDrag(true); });
  document.addEventListener('pointercancel', () => endDrag(false));
  addEventListener('keydown', e => { if (e.key === 'Escape' && dragging) { e.stopPropagation(); endDrag(false); } }, true);
  document.addEventListener('click', e => { if (Date.now() - swallow < 400 && e.target.closest && e.target.closest(ITEMS)) { e.preventDefault(); e.stopPropagation(); swallow = 0; } }, true);   // a drop is not a click
  document.addEventListener('contextmenu', e => { if (dragging || (drag && drag.type !== 'mouse')) e.preventDefault(); }, true);   // a long-press is a drag, not the menu
  document.addEventListener('touchmove', e => { if (dragging) e.preventDefault(); }, { passive: false });

  // ---------- "Reset order" in a right-click menu (the project circles' own menu adds it too: shell.js) ----------
  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };
  document.addEventListener('contextmenu', e => {
    const el = e.target.closest && e.target.closest('#pj-rail > #rail-workshop, #grp-global > .nest-row, #pj-nav > .nest-row, #pj-nav > .nest-line, #nest-extra > .nest-row'); if (!el || dragging) return;
    const id = listOf(el); if (!id) return;
    if (el.matches('[data-wid]') && window.TribeWidgets) return;   // a widget row has its own menu (widgets.js)
    e.preventDefault(); closeMenu();
    menu = document.createElement('div'); menu.className = 'sh-pop ro-menu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="sh-menu"><button type="button" role="menuitem" data-ro="up">${ico('chev', 15, 'ro-up')}<span>Move up</span></button><button type="button" role="menuitem" data-ro="down">${ico('chev', 15, 'ro-down')}<span>Move down</span></button><hr><button type="button" role="menuitem" data-ro="reset">${ico('refresh', 15)}<span>Reset order</span></button></div>`;
    document.body.appendChild(menu);
    const r = el.getBoundingClientRect(); menu.style.left = Math.min(r.right + 6, innerWidth - menu.offsetWidth - 8) + 'px'; menu.style.top = Math.min(r.top, innerHeight - menu.offsetHeight - 8) + 'px';
    menu.addEventListener('click', ev => { const b = ev.target.closest('[data-ro]'); if (!b) return; const k = b.dataset.ro; closeMenu(); if (k === 'reset') reset(id); else move(el, k === 'up' ? -1 : 1); });
    const f = menu.querySelector('button'); if (f) f.focus({ preventScroll: true });
  });
  const ico = (n, s, cls) => (window.TribeIcons ? window.TribeIcons.svg(n, s, cls || '') : '');
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && menu) { e.stopPropagation(); closeMenu(); } }, true);

  // ---------- boot ----------
  function boot() {
    watch(); applyAll();
    const c = C(); if (c && c.on) {
      c.on('project', () => setTimeout(() => { watch(); applyAll(); }, 0));
      c.on('status', s => { if (s && s.status === 'online') { applyAll(); pull(); } });
    }
    matchMedia('(min-width: 821px)').addEventListener('change', () => { placeWrench(); apply('rail'); flush(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.TribeReorder = { order, move, reset, lists: () => Object.keys(LISTS), apply: applyAll };
})();
