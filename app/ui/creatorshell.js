// The creators' shared shell (pass 9): the same Back button, the same place for Undo and Redo, and one Flint column in
// every full-screen creating tool (the website designer, App Creator, Motion Studio, the Launch kit, the first preview).
//
//   Back       backHTML(id, label)            "‹ Dashboard" at the far left of the top bar; the tool saves, then leaves.
//   Undo/Redo  undoHTML(ids, { history })     grouped right after the title; a caret opens History where there is one.
//   Flint      flint(root, opts) -> ctl       his own column on the far right, folded and reopened with ONE flame button
//                                             in the top bar (Ctrl J). Under 1440px he is a drawer; on a phone a sheet.
//                                             The fold is remembered once, for every creator.
//
// opts for flint(): { top, before, body, aside, right, mount(host, tools) -> ui, cls, phone(open), onDock(open, mode), wide }
//   top     the top bar element; before: the element in it the flame goes in front of (else it is appended)
//   body    the row the column is appended to (when aside is not given); aside: an existing column element to drive
//   right   an element the drawer must stay left of (the inspector), so it never covers the controls
//   mount   the tool's own TribeFlint.mount call; tools is the header's one fold control to pass through
//   cls     class names set on root: { open, closed, sheet } (the website designer keeps its own: fl-open, fl-rail, fl-sheet)
//   phone   the tool's own way to show Flint on a phone (App Creator has a sheet); else the shared bottom sheet
// Public: window.TribeCreatorShell = { backHTML, undoHTML, flint, FLAME, mode }
(function () {
  'use strict';
  const KEY = 'tribecode.creator.flint';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? (window.TribeI18n.t(s, s) || s) : s);
  const FLAME = '<img class="fl-face cs-flame-i" src="assets/flint.svg" alt="" width="20" height="20" aria-hidden="true">';
  const CHEV_L = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  const CHEV_R = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const UNDO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
  const REDO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>';
  const CARET = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const mode = wide => innerWidth <= 820 ? 'phone' : innerWidth < (wide || 1440) ? 'narrow' : 'wide';

  // "‹ Dashboard": where Back goes is its label. The tool wires the click (save first, then leave).
  function backHTML(id, label, title) {
    const l = label || tr('Dashboard');
    return `<button type="button" class="cs-back" id="${esc(id)}" data-cs="back" aria-label="${esc(title || tr('Back to the dashboard'))}" title="${esc(title || tr('Back to the dashboard'))}">${CHEV_L}<span>${esc(l)}</span></button>`;
  }
  // Undo and Redo together, right after the title. ids: { undo, redo, history }.
  function undoHTML(ids, o = {}) {
    return `<span class="cs-undo" role="group" aria-label="${esc(tr('Undo and redo'))}"><button type="button" class="cs-ub" id="${esc(ids.undo)}" aria-label="${esc(tr('Undo'))}" title="${esc(tr('Undo (Ctrl Z)'))}">${UNDO}</button><button type="button" class="cs-ub" id="${esc(ids.redo)}" aria-label="${esc(tr('Redo'))}" title="${esc(tr('Redo (Ctrl Shift Z)'))}">${REDO}</button>${o.history ? `<button type="button" class="cs-ub cs-hist" id="${esc(ids.history)}" aria-label="${esc(tr('History'))}" title="${esc(tr('History: go back to any step'))}" aria-haspopup="dialog">${CARET}</button>` : ''}</span>`;
  }

  const live = new Set();   // the creators open right now; the last one opened owns Ctrl J
  function flint(root, o) {
    if (!root || !o) return null;
    const cls = Object.assign({ open: 'csf-open', closed: 'csf-closed', sheet: 'csf-sheet' }, o.cls || {});
    let aside = o.aside || null, host = null, ui = null, last = '';
    if (!aside) {
      aside = document.createElement('aside'); aside.className = 'cs-fl'; aside.setAttribute('aria-label', 'Flint');
      aside.innerHTML = '<section class="cs-flint"></section>'; (o.body || root).appendChild(aside);
    }
    host = aside.querySelector('.cs-flint') || aside.querySelector('section') || aside;
    // the one flame in the top bar
    const flame = document.createElement('button'); flame.type = 'button'; flame.className = 'cs-flame'; flame.dataset.cs = 'flint';
    flame.innerHTML = FLAME; flame.setAttribute('aria-controls', host.id || ''); flame.setAttribute('aria-label', tr('Ask Flint'));
    if (o.top) { if (o.before && o.before.parentElement) o.before.parentElement.insertBefore(flame, o.before); else o.top.appendChild(flame); }
    const fold = [{ title: tr('Hide Flint (Ctrl J)'), html: CHEV_R, attrs: { 'data-fl-hide': '1' }, fn: () => dock(false) }];
    const mountNow = () => { if (ui) return ui; if (o.ui) return o.ui(); if (!o.mount) return null; try { ui = o.mount(host, fold) || null; } catch { ui = null; } return ui; };
    const U = () => ui || (o.ui ? o.ui() : null);
    const isOpen = () => root.classList.contains(mode(o.wide) === 'phone' ? cls.sheet : cls.open);
    function aria(open) {
      flame.setAttribute('aria-expanded', String(!!open)); flame.classList.toggle('on', !!open);
      flame.title = open ? tr('Hide Flint (Ctrl J)') : tr('Ask Flint · Ctrl J');
    }
    function place() {   // the drawer stays left of the inspector
      if (o.aside) return;
      const m = mode(o.wide), r = o.right && o.right.offsetParent ? o.right.getBoundingClientRect().width : 0;
      aside.style.setProperty('--cs-right', (m === 'narrow' ? Math.round(r) : 0) + 'px');
    }
    function init() {
      const m = mode(o.wide); last = m; root.classList.remove(cls.open, cls.closed, cls.sheet); root.dataset.csMode = m;
      if (m === 'phone') { aria(false); return; }
      let pref = 'open'; try { pref = localStorage.getItem(KEY) || 'open'; } catch {}
      const open = m === 'wide' && pref !== 'closed'; root.classList.add(open ? cls.open : cls.closed); aria(open); place();
      if (open) mountNow();
      if (o.onDock) o.onDock(open, m);
    }
    function dock(open, opt = {}) {
      const m = mode(o.wide);
      if (m === 'phone') {
        if (open == null) open = !root.classList.contains(cls.sheet);
        if (o.phone) { o.phone(!!open); aria(false); return; }
        mountNow(); root.classList.toggle(cls.sheet, !!open); aria(open);
        if (open && U()) setTimeout(() => { const u = U(), b = u.el && u.el.querySelector('.flm-thread'); if (b) b.scrollTop = b.scrollHeight; if (opt.focus === true) u.focus(); }, 30);
        if (o.onDock) o.onDock(!!open, m); return;
      }
      if (open == null) open = !root.classList.contains(cls.open);
      if (open) mountNow();
      root.classList.toggle(cls.open, !!open); root.classList.toggle(cls.closed, !open); aria(open); place();
      if (m === 'wide' && opt.remember !== false) try { localStorage.setItem(KEY, open ? 'open' : 'closed'); } catch {}
      if (open && opt.focus !== false && U()) U().focus();
      else if (!open && aside.contains(document.activeElement)) flame.focus();
      if (o.onDock) o.onDock(!!open, m);
    }
    flame.onclick = e => { e.stopPropagation(); dock(); };
    const onResize = () => { if (!root.isConnected) return destroy(); if (root.hidden) return; if (mode(o.wide) !== last) init(); else place(); };
    addEventListener('resize', onResize);
    const ctl = { dock, init, isOpen, flame, aside, host, fold, get ui() { return U() || mountNow(); }, root, destroy };
    function destroy() { removeEventListener('resize', onResize); live.delete(ctl); }
    live.add(ctl); init();
    return ctl;
  }
  // Ctrl J: show or hide Flint in the creator that is on top, even while typing
  addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || String(e.key).toLowerCase() !== 'j') return;
    let top = null; for (const c of live) { if (!c.root.isConnected) { live.delete(c); continue; } if (!c.root.hidden && c.root.getClientRects().length) top = c; }
    if (!top) return; e.preventDefault(); e.stopPropagation(); top.dock();
  }, true);

  // The browser's and the phone's Back button leave the creator too. onBack closes the tool (it saves first).
  // Returns done(): call it when the tool closes by its own button, so the extra history step is taken back.
  let seq = 0;
  function history_(root, onBack) {
    const id = 'cs' + (++seq) + '-' + Date.now().toString(36); let over = false;
    try { history.pushState(Object.assign({}, history.state || {}, { cs: id }), ''); } catch { return () => {}; }
    const pop = e => { if (over) return; if (e.state && e.state.cs === id) return; over = true; removeEventListener('popstate', pop); if (root.isConnected) { try { onBack(); } catch {} } };
    addEventListener('popstate', pop);
    return () => { if (over) return; over = true; removeEventListener('popstate', pop); try { if (history.state && history.state.cs === id) history.back(); } catch {} };
  }

  window.TribeCreatorShell = { backHTML, undoHTML, flint, history: history_, FLAME, mode, KEY };
})();
