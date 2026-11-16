// App features Flint adds with no AI (docs/FLINT-APP-KNOWLEDGE.md, docs/APP-BUILDING.md): small, working behaviours for
// phone apps, written from scratch for TribeCode. One list for both kinds of app:
//   • App Creator apps: the doc keeps `features: [id, …]` (appcreator-core.js normalize/apply), and the exported phone
//     web app (pwa()) carries the code below, so the feature works when the app runs on a phone.
//   • Code apps (a recipe, a starter, your own HTML): Flint writes tribe-features/<id>.js (+ .css) next to the page and
//     adds one <script> line (server/flintfree.js POST /api/projects/:id/flint/feature), then commits it.
// Each feature is one function of (root, kit) that only looks for what it needs and does nothing when it isn't there,
// so adding one never breaks a page. Everything stays on the phone (localStorage); nothing is sent anywhere.
// Things that need a server (real accounts that work on every device, payments, sync, push from a server) are NOT
// here: Flint says so and offers the ask for a stronger AI (server/flintfree.js classify).
//   window.TribeAppFeatures / require('./appfeatures.js') = { FEATURES, GROUPS, list(), get(id), match(text), clean(ids),
//     runtime(ids, { name }) -> JS text, css(ids) -> CSS text, codeFiles(ids, { name }) -> [[path, text]], inject(html, ids) -> html }
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TribeAppFeatures = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* eslint-disable no-var */

  // ---------- the shared helper every feature gets (stringified into the exported app) ----------
  function TCKit(root, name) {
    var key = 'tc-app:' + String(name || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + ':';
    var ls = { get: function (k, d) { try { var v = localStorage.getItem(key + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(key + k, JSON.stringify(v)); } catch (e) {} }, del: function (k) { try { localStorage.removeItem(key + k); } catch (e) {} } };
    var all = function (sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); };
    var ROWS = '.ax-row,.ax-cardi,.ax-gi,[data-tc-item],ul > li,ol > li';
    var LISTS = '.ax-list,[data-tc-list],ul,ol';
    var screen = function (el) { return (el && el.closest && el.closest('.ax-screen')) || root; };
    var current = function () { var s = all('.ax-screen').filter(function (x) { return x.offsetParent !== null || getComputedStyle(x).display !== 'none'; }); return s[0] || root; };
    var toastEl = null, toastT = 0;
    function toast(msg, act) {
      if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'tcf-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
      toastEl.innerHTML = ''; var t = document.createElement('span'); t.textContent = msg; toastEl.appendChild(t);
      if (act) { var b = document.createElement('button'); b.textContent = act.label; b.onclick = function () { act.run(); toastEl.classList.remove('on'); }; toastEl.appendChild(b); }
      toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, act ? 5000 : 2200);
    }
    function button(label, cls, where) { var b = document.createElement('button'); b.type = 'button'; b.className = 'tcf-btn ' + (cls || ''); b.textContent = label; (where || root).appendChild(b); return b; }
    function bar(where) { var host = where || current(); var bb = host.querySelector(':scope > .tcf-bar'); if (!bb) { bb = document.createElement('div'); bb.className = 'tcf-bar'; var first = host.querySelector('.ax-navb, .ax-nav, header, h1'); if (first && first.parentNode === host) first.insertAdjacentElement('afterend', bb); else host.insertBefore(bb, host.firstChild); } return bb; }
    function textOf(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
    function rowsIn(el) { return all(ROWS, el).filter(function (r) { return !r.closest('.tcf-bar, .tcf-sheet, nav'); }); }
    function lists() { return all(LISTS).filter(function (l) { return !l.closest('nav, .tcf-sheet, .ax-tabs') && rowsIn(l).length; }); }
    function sheet(title) {
      var s = document.createElement('div'); s.className = 'tcf-sheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', title);
      s.innerHTML = '<div class="tcf-card"><div class="tcf-head"><b></b><button type="button" class="tcf-x" aria-label="Close">×</button></div><div class="tcf-body"></div></div>';
      s.querySelector('b').textContent = title; s.querySelector('.tcf-x').onclick = function () { s.remove(); };
      s.addEventListener('click', function (e) { if (e.target === s) s.remove(); });
      document.body.appendChild(s); return s.querySelector('.tcf-body');
    }
    return { root: root, name: name || 'App', ls: ls, all: all, ROWS: ROWS, screen: screen, current: current, toast: toast, button: button, bar: bar, textOf: textOf, rowsIn: rowsIn, lists: lists, sheet: sheet };
  }

  // ---------- the features ----------
  // id, group, title, what (one plain line), words (what people say), fn(root, k), css, note (honest limits), secure (needs https)
  const F = [];
  const def = (o) => { F.push(o); };

  // Saved on the phone
  def({ id: 'remember', group: 'data', title: 'Remember everything', what: 'Ticks, switches, choices and typed text stay put after the app is closed.',
    words: ['offline storage', 'remember things', 'remember everything', 'save data', 'saves my data', 'save my data', 'keep my data', 'local storage', 'persist data', 'remember ticks', 'loses data', 'loses its data', 'loses my data', 'forgets everything', 'store data on the phone', 'make it work offline', 'make it remember', 'remember what i tick', 'keep data after closing', 'data stays after reload'], weak: ['save progress', 'storage', 'persistence'],
    fn: function (root, k) {
      var path = function (el) { var p = []; while (el && el !== root && el.parentNode) { p.unshift(Array.prototype.indexOf.call(el.parentNode.children, el)); el = el.parentNode; } return p.join('.'); };
      var st = k.ls.get('remember', {});
      var save = function () { k.ls.set('remember', st); };
      k.all('[data-check],[data-tog],[data-like],input[type=checkbox],input[type=radio],input[type=text],input:not([type]),textarea,select').forEach(function (el) {
        if (el.closest('.tcf-sheet, [data-compose], [data-filter]')) return;
        var id = path(el), v = st[id]; if (v === undefined) return;
        if (el.matches('[data-check]')) el.classList.toggle('done', !!v);
        else if (el.matches('[data-tog]')) { el.classList.toggle('on', !!v); el.setAttribute('aria-checked', v ? 'true' : 'false'); }
        else if (el.matches('[data-like]')) el.classList.toggle('liked', !!v);
        else if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!v;
        else el.value = v;
      });
      root.addEventListener('click', function (e) { var el = e.target.closest && e.target.closest('[data-check],[data-tog],[data-like]'); if (!el || el.closest('.tcf-sheet')) return; setTimeout(function () { st[path(el)] = el.classList.contains('done') || el.classList.contains('on') || el.classList.contains('liked'); save(); }, 0); });
      root.addEventListener('change', function (e) { var el = e.target; if (!el.matches || el.closest('.tcf-sheet, [data-compose], [data-filter]')) return; st[path(el)] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value; save(); });
      root.addEventListener('input', function (e) { var el = e.target; if (!el.matches || !el.matches('textarea,input[type=text],input:not([type])') || el.closest('.tcf-sheet, [data-compose], [data-filter]')) return; st[path(el)] = el.value; save(); });
    } });
  def({ id: 'addlist', group: 'data', title: 'Add to a list', what: 'A box above the first list adds new rows, and they are saved on the phone.',
    words: ['let people add items', 'add items to the list', 'add new items to the list', 'type to add items', 'add rows to the list', 'add an item box', 'let me add to the list', 'add box above the list'], weak: ['make the list editable', 'editable list'],
    fn: function (root, k) {
      var list = k.lists()[0]; if (!list) return;
      var tmpl = k.rowsIn(list)[0]; if (!tmpl) return;
      var f = document.createElement('form'); f.className = 'tcf-add'; f.innerHTML = '<input aria-label="New item" placeholder="Add something"><button type="submit">Add</button>';
      list.parentNode.insertBefore(f, list);
      var saved = k.ls.get('addlist', []);
      var make = function (text) { var r = tmpl.cloneNode(true); r.classList.remove('done'); var t = r.querySelector('b, strong, .ax-rt, span, p') || r; t.textContent = text; Array.prototype.forEach.call(r.querySelectorAll('small, .ax-sub, .ax-meta'), function (s) { s.textContent = ''; }); r.setAttribute('data-tc-added', '1'); list.appendChild(r); return r; };
      saved.forEach(make);
      f.addEventListener('submit', function (e) { e.preventDefault(); var i = f.querySelector('input'), v = i.value.trim(); if (!v) return; make(v); saved.push(v); k.ls.set('addlist', saved); i.value = ''; k.toast('Added'); });
    } });
  def({ id: 'swipe', group: 'data', title: 'Swipe to remove', what: 'Swipe a row to the left to remove it, with Undo.',
    words: ['swipe to delete', 'swipe to remove', 'swipe rows away', 'swipe left to delete', 'delete by swiping'], weak: [],
    fn: function (root, k) {
      var x0 = 0, row = null;
      root.addEventListener('touchstart', function (e) { row = e.target.closest && e.target.closest(k.ROWS); x0 = e.touches[0].clientX; }, { passive: true });
      root.addEventListener('touchmove', function (e) { if (!row) return; var dx = Math.min(0, e.touches[0].clientX - x0); row.style.transform = 'translateX(' + dx + 'px)'; }, { passive: true });
      root.addEventListener('touchend', function (e) {
        if (!row) return; var dx = (e.changedTouches[0].clientX - x0), r = row; row = null;
        if (dx < -90) { var parent = r.parentNode, next = r.nextSibling; r.remove(); k.toast('Removed', { label: 'Undo', run: function () { parent.insertBefore(r, next); r.style.transform = ''; } }); }
        else r.style.transform = '';
      });
    } });
  def({ id: 'backup', group: 'data', title: 'Backup and restore', what: 'A Settings button saves everything the app remembers to a file, and another brings it back.',
    words: ['backup and restore', 'back up my data', 'backup my data', 'restore my data', 'export my data', 'import my data', 'download my data', 'data backup'], weak: ['backup'],
    fn: function (root, k) {
      var b = k.bar(); var dl = k.button('Back up', 'tcf-ghost', b), up = k.button('Restore', 'tcf-ghost', b);
      var prefix = 'tc-app:' + String(k.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + ':';
      dl.onclick = function () { var o = {}; for (var i = 0; i < localStorage.length; i++) { var key = localStorage.key(i); if (key.indexOf(prefix) === 0) o[key] = localStorage.getItem(key); } var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' })); a.download = k.name + '-backup.json'; a.click(); };
      up.onclick = function () { var i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json'; i.onchange = function () { var f = i.files[0]; if (!f) return; f.text().then(function (t) { try { var o = JSON.parse(t); Object.keys(o).forEach(function (key) { if (key.indexOf(prefix) === 0) localStorage.setItem(key, o[key]); }); location.reload(); } catch (e) { k.toast('That file is not a backup from this app'); } }); }; i.click(); };
    } });
  def({ id: 'reset', group: 'data', title: 'Start over', what: 'A button that clears what the app remembers on this phone, after asking.',
    words: ['reset data', 'clear the data', 'clear app data', 'delete all data', 'reset the app', 'start over button', 'wipe the data'], weak: [],
    fn: function (root, k) {
      var b = k.button('Start over', 'tcf-ghost tcf-danger', k.bar());
      var prefix = 'tc-app:' + String(k.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + ':';
      b.onclick = function () { if (b.dataset.sure) { var ks = []; for (var i = 0; i < localStorage.length; i++) { var key = localStorage.key(i); if (key.indexOf(prefix) === 0) ks.push(key); } ks.forEach(function (x) { localStorage.removeItem(x); }); location.reload(); return; } b.dataset.sure = '1'; b.textContent = 'Tap again to clear'; setTimeout(function () { delete b.dataset.sure; b.textContent = 'Start over'; }, 3000); };
    } });
  def({ id: 'csv', group: 'data', title: 'Export as CSV', what: 'Downloads the first list as a spreadsheet file (CSV).',
    words: ['export csv', 'export as csv', 'download csv', 'export to spreadsheet', 'export to excel', 'csv export', 'download the list as csv', 'export the list'], weak: [],
    fn: function (root, k) {
      var b = k.button('Export CSV', 'tcf-ghost', k.bar());
      b.onclick = function () { var list = k.lists()[0]; if (!list) return k.toast('No list to export'); var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; }; var lines = k.rowsIn(list).map(function (r) { var parts = Array.prototype.map.call(r.querySelectorAll('b, strong, small, span, p, .ax-rt, .ax-sub'), function (x) { return k.textOf(x); }).filter(Boolean); if (!parts.length) parts = [k.textOf(r)]; return parts.map(q).join(','); }); var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = k.name + '.csv'; a.click(); };
    } });
  def({ id: 'notes', group: 'data', title: 'A note on each item', what: 'Long-press (or right-click) a row to write a note on it; notes are saved.',
    words: ['notes on items', 'a note on each item', 'add a note to each item', 'notes on each row', 'item notes', 'write a note on each'], weak: [],
    fn: function (root, k) {
      var notes = k.ls.get('notes', {});
      var keyOf = function (r) { return k.textOf(r).slice(0, 60); };
      var mark = function () { k.all(k.ROWS).forEach(function (r) { r.classList.toggle('tcf-hasnote', !!notes[keyOf(r)]); }); };
      var open = function (r) { var body = k.sheet('Note'); var t = document.createElement('textarea'); t.value = notes[keyOf(r)] || ''; t.rows = 5; body.appendChild(t); var s = k.button('Save', 'tcf-primary', body); s.onclick = function () { var v = t.value.trim(); if (v) notes[keyOf(r)] = v; else delete notes[keyOf(r)]; k.ls.set('notes', notes); mark(); body.closest('.tcf-sheet').remove(); }; t.focus(); };
      var timer = 0;
      root.addEventListener('contextmenu', function (e) { var r = e.target.closest && e.target.closest(k.ROWS); if (!r) return; e.preventDefault(); open(r); });
      root.addEventListener('touchstart', function (e) { var r = e.target.closest && e.target.closest(k.ROWS); if (!r) return; timer = setTimeout(function () { open(r); }, 550); }, { passive: true });
      root.addEventListener('touchend', function () { clearTimeout(timer); });
      mark();
    } });
  def({ id: 'favorites', group: 'data', title: 'Favourites', what: 'A star on each row, and a Favourites filter; stars are saved.',
    words: ['favorites', 'favourites', 'star items', 'star favorites', 'bookmark items', 'save favorites', 'mark favorites', 'favorite button'], weak: [],
    fn: function (root, k) {
      var fav = k.ls.get('fav', {}), only = false;
      k.all(k.ROWS).forEach(function (r) { if (r.querySelector('.tcf-star')) return; var s = document.createElement('button'); s.type = 'button'; s.className = 'tcf-star'; s.setAttribute('aria-label', 'Favourite'); var id = k.textOf(r).slice(0, 60); s.classList.toggle('on', !!fav[id]); s.onclick = function (e) { e.stopPropagation(); fav[id] = !fav[id]; if (!fav[id]) delete fav[id]; s.classList.toggle('on', !!fav[id]); k.ls.set('fav', fav); }; r.appendChild(s); });
      var b = k.button('Favourites', 'tcf-ghost', k.bar()); b.onclick = function () { only = !only; b.classList.toggle('on', only); k.all(k.ROWS).forEach(function (r) { var s = r.querySelector('.tcf-star'); r.style.display = only && !(s && s.classList.contains('on')) ? 'none' : ''; }); };
    } });

  // Finding things
  def({ id: 'search', group: 'find', title: 'Search', what: 'A search box that filters the rows and cards on the screen as you type.',
    words: ['search every screen', 'search on every screen', 'make it searchable', 'search that works', 'working search', 'filter as i type', 'search across the lists', 'search to every list'], weak: ['search', 'search box', 'search bar'],
    fn: function (root, k) {
      k.all('.ax-screen').concat(k.all('.ax-screen').length ? [] : [root]).forEach(function (sc) {
        if (sc.querySelector('[data-filter], .tcf-search') || !k.rowsIn(sc).length) return;
        var i = document.createElement('input'); i.type = 'search'; i.className = 'tcf-search'; i.placeholder = 'Search'; i.setAttribute('aria-label', 'Search');
        k.bar(sc).appendChild(i);
        i.addEventListener('input', function () { var q = i.value.toLowerCase().trim(); k.rowsIn(sc).forEach(function (r) { r.style.display = !q || k.textOf(r).toLowerCase().indexOf(q) >= 0 ? '' : 'none'; }); var e = sc.querySelector('.tcf-none'); var any = k.rowsIn(sc).some(function (r) { return r.style.display !== 'none'; }); if (!any && !e) { e = document.createElement('p'); e.className = 'tcf-none'; e.textContent = 'Nothing matches.'; k.bar(sc).insertAdjacentElement('afterend', e); } if (e) e.hidden = any; });
      });
    } });
  def({ id: 'sort', group: 'find', title: 'Sort A to Z', what: 'A button that sorts the first list A to Z, then Z to A.',
    words: ['sort a to z', 'sort alphabetically', 'sort the list', 'sort items', 'sort button', 'order by name', 'alphabetical order'], weak: ['sort'],
    fn: function (root, k) {
      var dir = 1, b = k.button('Sort A–Z', 'tcf-ghost', k.bar());
      b.onclick = function () { k.lists().forEach(function (l) { var rs = k.rowsIn(l).filter(function (r) { return r.parentNode === l; }); rs.sort(function (a, c) { return k.textOf(a).localeCompare(k.textOf(c)) * dir; }).forEach(function (r) { l.appendChild(r); }); }); b.textContent = dir > 0 ? 'Sort Z–A' : 'Sort A–Z'; dir = -dir; };
    } });
  def({ id: 'filterchips', group: 'find', title: 'Filter with chips', what: 'Tapping a chip shows only the rows that mention it; tapping it again shows all.',
    words: ['filter by tag', 'filter by category', 'make the chips filter', 'chips that filter', 'tag filter', 'category filter', 'filter with chips'], weak: ['filter chips'],
    fn: function (root, k) {
      root.addEventListener('click', function (e) {
        var chip = e.target.closest && e.target.closest('[data-chip], .tcf-chip'); if (!chip) return;
        var sc = k.screen(chip), word = k.textOf(chip).toLowerCase(), on = chip.classList.contains('tcf-on');
        Array.prototype.forEach.call(chip.parentNode.children, function (c) { c.classList.remove('tcf-on'); });
        if (!on) chip.classList.add('tcf-on');
        var all = !!on || /^(all|everything|any)$/.test(word);
        k.rowsIn(sc).forEach(function (r) { r.style.display = all || k.textOf(r).toLowerCase().indexOf(word) >= 0 ? '' : 'none'; });
      });
    } });
  def({ id: 'empty', group: 'find', title: 'Friendly empty lists', what: 'An empty list shows a short, kind message instead of a blank space.',
    words: ['friendly empty lists', 'message when the list is empty', 'empty list message', 'when the list is empty show', 'nothing here message'], weak: ['empty state', 'empty states'],
    fn: function (root, k) {
      var check = function () { k.all('.ax-list,[data-tc-list],ul,ol').forEach(function (l) { if (l.closest('nav, .ax-tabs, .tcf-sheet')) return; var none = !k.rowsIn(l).some(function (r) { return r.style.display !== 'none'; }); var m = l.nextElementSibling && l.nextElementSibling.classList.contains('tcf-emptymsg') ? l.nextElementSibling : null; if (none && !m) { m = document.createElement('p'); m.className = 'tcf-emptymsg'; m.textContent = 'Nothing here yet.'; l.insertAdjacentElement('afterend', m); } if (m) m.hidden = !none; }); };
      check(); try { new MutationObserver(check).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] }); } catch (e) {}
    } });

  // Look and feel
  def({ id: 'darkswitch', group: 'look', title: 'Dark mode switch', what: 'A switch for light or dark that follows the phone at first and is remembered.',
    words: ['dark mode toggle', 'dark mode switch', 'night mode toggle', 'light dark switch', 'let people choose dark mode', 'theme switch', 'dark mode button', 'light and dark switch', 'switch between light and dark'], weak: [],
    fn: function (root, k) {
      var pref = k.ls.get('dark', null), sys = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
      var apply = function (d) { document.documentElement.classList.toggle('tcf-dark', !!d); if (root.setAttribute && root.getAttribute('data-mode') != null) root.setAttribute('data-mode', d ? 'dark' : 'light'); };
      apply(pref == null ? sys : pref);
      var b = k.button(document.documentElement.classList.contains('tcf-dark') ? 'Light mode' : 'Dark mode', 'tcf-ghost', k.bar());
      b.onclick = function () { var d = !document.documentElement.classList.contains('tcf-dark'); apply(d); k.ls.set('dark', d); b.textContent = d ? 'Light mode' : 'Dark mode'; };
    },
    css: 'html.tcf-dark{filter:invert(1) hue-rotate(180deg)}html.tcf-dark img,html.tcf-dark video,html.tcf-dark .ax-art,html.tcf-dark canvas{filter:invert(1) hue-rotate(180deg)}' });
  def({ id: 'textsize', group: 'look', title: 'Bigger text', what: 'A button that makes all text larger, remembered on the phone.',
    words: ['bigger text option', 'bigger text setting', 'text size setting', 'font size setting', 'larger text option', 'let people make text bigger', 'accessibility text size'], weak: [],
    fn: function (root, k) {
      var on = !!k.ls.get('bigtext', false), apply = function () { document.documentElement.style.fontSize = on ? '118%' : ''; root.style && (root.style.zoom = on ? '1.12' : ''); };
      apply(); var b = k.button(on ? 'Normal text' : 'Bigger text', 'tcf-ghost', k.bar()); b.onclick = function () { on = !on; k.ls.set('bigtext', on); apply(); b.textContent = on ? 'Normal text' : 'Bigger text'; };
    } });
  def({ id: 'calm', group: 'look', title: 'Less motion', what: 'Turns animations down when the phone asks for less motion, with a switch to do it by hand.',
    words: ['reduce motion', 'less motion option', 'reduced motion', 'calm mode', 'respect reduced motion', 'motion switch'], weak: [],
    fn: function (root, k) {
      var on = k.ls.get('calm', null); if (on == null) on = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      var apply = function () { document.documentElement.classList.toggle('tcf-calm', !!on); };
      apply(); var b = k.button(on ? 'Motion on' : 'Less motion', 'tcf-ghost', k.bar()); b.onclick = function () { on = !on; k.ls.set('calm', on); apply(); b.textContent = on ? 'Motion on' : 'Less motion'; };
    },
    css: 'html.tcf-calm *,html.tcf-calm *::before,html.tcf-calm *::after{animation-duration:.01ms!important;transition-duration:.01ms!important}' });
  def({ id: 'haptics', group: 'look', title: 'Buzz on tap', what: 'A short vibration when a button is tapped, on phones that allow it (most Android phones; not iPhone web apps).',
    words: ['haptics', 'haptic feedback', 'vibrate on tap', 'vibration on tap', 'buzz when tapping', 'vibrate when tapped'], weak: [], note: 'iPhone web apps cannot vibrate; Android phones can.',
    fn: function (root) { root.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('button, a, [data-to], [data-check], [data-tog]') && navigator.vibrate) { try { navigator.vibrate(12); } catch (x) {} } }); } });
  def({ id: 'pullrefresh', group: 'look', title: 'Pull to refresh', what: 'Pulling down at the top shows a spinner and reloads the screen.',
    words: ['pull to refresh', 'pull down to refresh', 'refresh gesture', 'swipe down to refresh'], weak: [],
    fn: function (root, k) {
      var y0 = null, el = document.createElement('div'); el.className = 'tcf-pull'; el.textContent = '↻'; document.body.appendChild(el);
      root.addEventListener('touchstart', function (e) { var sc = k.screen(e.target); y0 = (sc.scrollTop || window.scrollY) <= 0 ? e.touches[0].clientY : null; }, { passive: true });
      root.addEventListener('touchmove', function (e) { if (y0 == null) return; var d = Math.max(0, Math.min(90, e.touches[0].clientY - y0)); el.style.transform = 'translate(-50%,' + (d - 40) + 'px) rotate(' + d * 4 + 'deg)'; el.style.opacity = d / 90; }, { passive: true });
      root.addEventListener('touchend', function (e) { if (y0 == null) return; var d = e.changedTouches[0].clientY - y0; y0 = null; if (d > 80) { el.classList.add('spin'); setTimeout(function () { location.reload(); }, 450); } else { el.style.opacity = 0; } });
    } });
  def({ id: 'skeleton', group: 'look', title: 'Loading placeholders', what: 'Grey placeholder shapes for a moment when the app opens, so it never looks empty.',
    words: ['skeleton loading', 'loading placeholders', 'loading shimmer', 'skeleton screen', 'placeholders while loading', 'loading skeleton'], weak: [],
    fn: function (root, k) { var rows = k.all(k.ROWS).slice(0, 12); rows.forEach(function (r) { r.classList.add('tcf-skel'); }); setTimeout(function () { rows.forEach(function (r) { r.classList.remove('tcf-skel'); }); }, 650); } });
  def({ id: 'toasts', group: 'look', title: 'Little confirmations', what: 'A short message at the bottom when something is ticked, liked or saved.',
    words: ['toasts', 'toast messages', 'snackbar', 'little confirmations', 'show a message when saved', 'confirmation toasts'], weak: [],
    fn: function (root, k) { root.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('[data-check],[data-like],[data-tog]'); if (!t) return; setTimeout(function () { k.toast(t.matches('[data-like]') ? (t.classList.contains('liked') ? 'Liked' : 'Unliked') : t.matches('[data-tog]') ? (t.classList.contains('on') ? 'On' : 'Off') : (t.classList.contains('done') ? 'Done' : 'Not done')); }, 0); }); } });
  def({ id: 'celebrate', group: 'look', title: 'Celebrate', what: 'A small burst of shapes when every item in a list is ticked.',
    words: ['celebrate', 'confetti', 'celebration when done', 'celebrate when everything is done', 'confetti when finished'], weak: [],
    fn: function (root, k) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-check]'); if (!t) return;
        setTimeout(function () { var sc = k.screen(t), all = sc.querySelectorAll('[data-check]'), done = sc.querySelectorAll('[data-check].done'); if (!all.length || all.length !== done.length) return; if (document.documentElement.classList.contains('tcf-calm')) return k.toast('All done'); for (var i = 0; i < 24; i++) { var p = document.createElement('i'); p.className = 'tcf-bit'; p.style.left = (10 + Math.random() * 80) + 'vw'; p.style.background = ['#F26B1D', '#38C6B1', '#6C7CFF', '#E9B949'][i % 4]; p.style.animationDelay = (Math.random() * 0.25) + 's'; document.body.appendChild(p); setTimeout(function (x) { return function () { x.remove(); }; }(p), 1600); } k.toast('All done'); }, 0);
      });
    } });

  // Sharing and people
  def({ id: 'share', group: 'share', title: 'Share button', what: 'Opens the phone’s share sheet for the app link; copies the link where sharing isn’t there.',
    words: ['share sheet', 'share the app', 'web share', 'share button that works', 'let people share the app', 'share link button'], weak: ['share button'], secure: true,
    fn: function (root, k) {
      var b = k.button('Share', 'tcf-ghost', k.bar());
      b.onclick = function () { var data = { title: k.name, text: 'Have a look at ' + k.name, url: location.href }; if (navigator.share) navigator.share(data).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { k.toast('Link copied'); }); };
    } });
  def({ id: 'copylink', group: 'share', title: 'Copy link', what: 'A button that copies the app’s link.',
    words: ['copy link button', 'copy the app link', 'copy url button'], weak: ['copy link'], secure: true,
    fn: function (root, k) { var b = k.button('Copy link', 'tcf-ghost', k.bar()); b.onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(function () { k.toast('Link copied'); }, function () { k.toast(location.href); }); }; } });
  def({ id: 'feedback', group: 'share', title: 'Send feedback', what: 'A feedback button that opens an email to you with the app name filled in.',
    words: ['send feedback button', 'feedback email', 'feedback button that works', 'email feedback'], weak: ['feedback button', 'feedback'], note: 'Opens the phone’s email app; change the address in tribe-features/feedback.js (data-email).',
    fn: function (root, k) { var b = k.button('Feedback', 'tcf-ghost', k.bar()); b.onclick = function () { var to = root.getAttribute('data-email') || ''; location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Feedback on ' + k.name); }; } });
  def({ id: 'rate', group: 'share', title: 'Ask for a rating', what: 'After the fifth visit, a gentle “Enjoying it?” with a 1–5 star choice, asked once.',
    words: ['ask for a rating after', 'rating prompt', 'ask people to rate', 'rate this app prompt', 'review prompt'], weak: ['ask for a rating'],
    fn: function (root, k) {
      var n = k.ls.get('visits', 0) + 1; k.ls.set('visits', n); if (n < 5 || k.ls.get('rated')) return;
      setTimeout(function () { var body = k.sheet('Enjoying ' + k.name + '?'); var row = document.createElement('div'); row.className = 'tcf-stars'; for (var i = 1; i <= 5; i++) { var s = document.createElement('button'); s.type = 'button'; s.textContent = '★'; s.setAttribute('aria-label', i + ' stars'); s.onclick = function (v) { return function () { k.ls.set('rated', v); body.closest('.tcf-sheet').remove(); k.toast('Thank you'); }; }(i); row.appendChild(s); } body.appendChild(row); }, 1200);
    } });

  // On the phone
  def({ id: 'install', group: 'phone', title: 'Install button', what: 'An “Install app” button on Android and computers, and simple Add to Home Screen steps on iPhone.',
    words: ['install button', 'install prompt', 'install the app button', 'add to home screen button', 'install banner', 'add to home screen prompt'], weak: [], secure: true,
    fn: function (root, k) {
      if ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone) return;
      var ev = null, b = k.button('Install app', 'tcf-primary', k.bar());
      window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); ev = e; });
      b.onclick = function () { if (ev) { ev.prompt(); ev = null; return; } var ios = /iphone|ipad|ipod/i.test(navigator.userAgent); var body = k.sheet('Add to Home Screen'); var p = document.createElement('p'); p.textContent = ios ? 'Tap the Share button, then “Add to Home Screen”, then Add.' : 'Open your browser’s menu and choose “Install app” or “Add to Home screen”.'; body.appendChild(p); };
    } });
  def({ id: 'offline', group: 'phone', title: 'Offline notice', what: 'A small banner when the phone loses its connection, gone when it’s back.',
    words: ['offline banner', 'offline notice', 'no internet message', 'connection lost banner', 'show when offline', 'tell people when offline'], weak: [],
    fn: function (root, k) { var el = document.createElement('div'); el.className = 'tcf-offline'; el.textContent = 'You’re offline. Changes are saved on this phone.'; document.body.appendChild(el); var up = function () { el.classList.toggle('on', !navigator.onLine); }; window.addEventListener('online', up); window.addEventListener('offline', up); up(); } });
  def({ id: 'reminders', group: 'phone', title: 'Reminders', what: 'Set a reminder for a time; the phone shows a notification while the app is open (web apps can’t wake a closed app without a server).',
    words: ['reminders', 'remind me at a time', 'local notifications', 'reminder notifications', 'set reminders', 'daily reminder', 'notify me at a time'], weak: ['notifications that work', 'working notifications'], secure: true, note: 'A closed app can’t remind anyone without a push server; that part needs a stronger AI and a server.',
    fn: function (root, k) {
      var items = k.ls.get('reminders', []);
      var fire = function (r) { var msg = r.text || 'Reminder'; try { if (window.Notification && Notification.permission === 'granted') new Notification(k.name, { body: msg }); else k.toast(msg); } catch (e) { k.toast(msg); } };
      var tick = function () { var now = Date.now(), left = []; items.forEach(function (r) { if (r.at <= now) fire(r); else left.push(r); }); if (left.length !== items.length) { items = left; k.ls.set('reminders', items); } };
      setInterval(tick, 15000); tick();
      var b = k.button('Remind me', 'tcf-ghost', k.bar());
      b.onclick = function () { var body = k.sheet('New reminder'); body.innerHTML = '<label>What<input class="tcf-in" id="tcf-rt" placeholder="Drink water"></label><label>When<input class="tcf-in" id="tcf-rw" type="time"></label>'; var s = k.button('Save', 'tcf-primary', body); s.onclick = function () { var t = body.querySelector('#tcf-rt').value.trim(), w = body.querySelector('#tcf-rw').value; if (!w) return; var d = new Date(), hm = w.split(':'); d.setHours(+hm[0], +hm[1], 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); items.push({ text: t, at: d.getTime() }); k.ls.set('reminders', items); if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); body.closest('.tcf-sheet').remove(); k.toast('Reminder set for ' + w); }; };
    } });
  def({ id: 'camera', group: 'phone', title: 'Take a photo', what: 'A button that opens the camera (or the photo library), shows the picture and keeps it on the phone.',
    words: ['camera button that works', 'open the camera', 'take a photo with the camera', 'use the camera', 'camera capture', 'snap a photo'], weak: ['camera', 'take a photo', 'add photo button'],
    fn: function (root, k) {
      var b = k.button('Add photo', 'tcf-ghost', k.bar()), img = document.createElement('img'); img.className = 'tcf-photo'; img.alt = 'Your photo';
      var saved = k.ls.get('photo', ''); if (saved) { img.src = saved; b.parentNode.insertAdjacentElement('afterend', img); }
      b.onclick = function () { var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment'); i.onchange = function () { var f = i.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { var im = new Image(); im.onload = function () { var c = document.createElement('canvas'), s = Math.min(1, 720 / Math.max(im.width, im.height)); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); var url = c.toDataURL('image/jpeg', 0.8); img.src = url; k.ls.set('photo', url); if (!img.parentNode) b.parentNode.insertAdjacentElement('afterend', img); }; im.src = r.result; }; r.readAsDataURL(f); }; i.click(); };
    } });
  def({ id: 'location', group: 'phone', title: 'Where am I', what: 'A button that asks for the phone’s location and shows it, with a link to open it in a map.',
    words: ['my location', 'gps location', 'where am i', 'near me button', 'find my location', 'geolocation', 'use my location'], weak: [], secure: true,
    fn: function (root, k) { var b = k.button('My location', 'tcf-ghost', k.bar()); b.onclick = function () { if (!navigator.geolocation) return k.toast('This phone can’t share its location here'); navigator.geolocation.getCurrentPosition(function (p) { var lat = p.coords.latitude.toFixed(5), lon = p.coords.longitude.toFixed(5); var body = k.sheet('You are here'); var a = document.createElement('a'); a.href = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=16/' + lat + '/' + lon; a.target = '_blank'; a.rel = 'noopener'; a.textContent = lat + ', ' + lon + ' · open in a map'; body.appendChild(a); }, function () { k.toast('Location was not shared'); }); }; } });
  def({ id: 'map', group: 'phone', title: 'Map', what: 'A map of a place (OpenStreetMap), set by the words in a row called Address or Location.',
    words: ['openstreetmap', 'map link', 'make the map work', 'working map', 'open in maps', 'map that opens'], weak: ['map'], note: 'The map tiles come from OpenStreetMap, so it needs a connection.',
    fn: function (root, k) {
      var host = k.current(); if (host.querySelector('.tcf-map')) return;
      var q = (k.all(k.ROWS).map(k.textOf).filter(function (t) { return /address|location|where/i.test(t); })[0] || '').replace(/^(address|location|where)\s*:?\s*/i, '');
      var a = document.createElement('a'); a.className = 'tcf-map'; a.target = '_blank'; a.rel = 'noopener'; a.href = 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(q || k.name); a.textContent = q ? 'Open the map for ' + q : 'Open the map';
      k.bar(host).insertAdjacentElement('afterend', a);
    } });
  def({ id: 'wakelock', group: 'phone', title: 'Keep the screen on', what: 'A switch that keeps the screen awake, handy for recipes, workouts and timers.',
    words: ['keep screen on', 'keep the screen on', 'keep the screen awake', 'wake lock', 'stop the screen sleeping', 'screen stays on'], weak: [], secure: true,
    fn: function (root, k) { var lock = null, on = false, b = k.button('Keep screen on', 'tcf-ghost', k.bar()); var take = function () { if (on && navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then(function (l) { lock = l; }).catch(function () {}); }; document.addEventListener('visibilitychange', take); b.onclick = function () { if (!navigator.wakeLock) return k.toast('This browser can’t keep the screen on'); on = !on; b.classList.toggle('on', on); if (on) take(); else if (lock) { lock.release(); lock = null; } b.textContent = on ? 'Screen stays on' : 'Keep screen on'; }; } });

  // Time
  def({ id: 'timer', group: 'time', title: 'Countdown timer', what: 'A countdown with start, pause and reset that beeps at zero.',
    words: ['countdown timer', 'working timer', 'timer that beeps', 'make the timer work', 'kitchen timer', 'workout timer', 'countdown that beeps'], weak: ['timer', 'countdown'],
    fn: function (root, k) {
      var host = k.current(), wrap = document.createElement('div'); wrap.className = 'tcf-timer'; wrap.innerHTML = '<output>05:00</output><div><button type="button" data-t="m">−1</button><button type="button" data-t="go">Start</button><button type="button" data-t="p">+1</button><button type="button" data-t="r">Reset</button></div>';
      k.bar(host).insertAdjacentElement('afterend', wrap);
      var left = 300, base = 300, run = null, out = wrap.querySelector('output'), go = wrap.querySelector('[data-t=go]');
      var show = function () { var m = Math.floor(left / 60), s = left % 60; out.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; };
      var beep = function () { try { var ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.2, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6); o.start(); o.stop(ac.currentTime + 0.6); } catch (e) {} if (navigator.vibrate) navigator.vibrate([200, 100, 200]); };
      wrap.addEventListener('click', function (e) { var t = e.target.getAttribute('data-t'); if (!t) return;
        if (t === 'go') { if (run) { clearInterval(run); run = null; go.textContent = 'Start'; } else { run = setInterval(function () { left = Math.max(0, left - 1); show(); if (!left) { clearInterval(run); run = null; go.textContent = 'Start'; beep(); k.toast('Time’s up'); } }, 1000); go.textContent = 'Pause'; } }
        if (t === 'm') { base = Math.max(60, base - 60); left = Math.max(0, left - 60); } if (t === 'p') { base += 60; left += 60; } if (t === 'r') left = base; show(); });
      show();
    } });
  def({ id: 'stopwatch', group: 'time', title: 'Stopwatch', what: 'A stopwatch with laps.',
    words: ['stopwatch', 'lap timer', 'stop watch', 'time laps', 'count up timer'], weak: [],
    fn: function (root, k) {
      var host = k.current(), w = document.createElement('div'); w.className = 'tcf-timer'; w.innerHTML = '<output>0:00.0</output><div><button type="button" data-s="go">Start</button><button type="button" data-s="lap">Lap</button><button type="button" data-s="r">Reset</button></div><ol class="tcf-laps"></ol>';
      k.bar(host).insertAdjacentElement('afterend', w);
      var t0 = 0, acc = 0, run = null, out = w.querySelector('output'), laps = w.querySelector('ol');
      var fmt = function (ms) { var s = ms / 1000, m = Math.floor(s / 60); return m + ':' + ('0' + (s % 60).toFixed(1)).slice(-4); };
      var now = function () { return acc + (run ? Date.now() - t0 : 0); };
      w.addEventListener('click', function (e) { var a = e.target.getAttribute('data-s'); if (!a) return;
        if (a === 'go') { if (run) { acc = now(); clearInterval(run); run = null; e.target.textContent = 'Start'; } else { t0 = Date.now(); run = setInterval(function () { out.textContent = fmt(now()); }, 100); e.target.textContent = 'Stop'; } }
        if (a === 'lap' && run) { var li = document.createElement('li'); li.textContent = fmt(now()); laps.insertBefore(li, laps.firstChild); }
        if (a === 'r') { acc = 0; t0 = Date.now(); out.textContent = fmt(0); laps.innerHTML = ''; } });
    } });
  def({ id: 'streak', group: 'time', title: 'Daily streak', what: 'Counts the days in a row something was ticked and shows the streak.',
    words: ['daily streak', 'streak counter', 'days in a row', 'habit streak', 'keep a streak', 'count my streak'], weak: ['streak'],
    fn: function (root, k) {
      var day = function (d) { return new Date(d).toISOString().slice(0, 10); }, days = k.ls.get('streakDays', []);
      var count = function () { var n = 0, d = new Date(); if (days.indexOf(day(d)) < 0) d.setDate(d.getDate() - 1); while (days.indexOf(day(d)) >= 0) { n++; d.setDate(d.getDate() - 1); } return n; };
      var el = document.createElement('p'); el.className = 'tcf-streak'; k.bar().appendChild(el);
      var show = function () { var n = count(); el.textContent = n ? n + (n === 1 ? ' day streak' : ' day streak') : 'Tick something to start a streak'; };
      root.addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('[data-check], input[type=checkbox]'))) return; var t = day(Date.now()); if (days.indexOf(t) < 0) { days.push(t); days = days.slice(-400); k.ls.set('streakDays', days); } setTimeout(show, 0); });
      show();
    } });
  def({ id: 'today', group: 'time', title: 'Today’s date', what: 'Shows today’s date at the top, in the phone’s own language.',
    words: ['todays date', 'today date at the top', 'show the date at the top', 'current date at the top', 'show todays date'], weak: [],
    fn: function (root, k) { var el = document.createElement('p'); el.className = 'tcf-today'; try { el.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { el.textContent = new Date().toDateString(); } k.bar().insertBefore(el, k.bar().firstChild); } });

  // Accounts (on the phone only)
  def({ id: 'demologin', group: 'people', title: 'Demo sign-in (this phone only)', what: 'A sign-in screen that remembers a name on this phone, for trying the flow. It is not real security.',
    words: ['demo login', 'demo sign in', 'fake login', 'login that remembers', 'make the login work', 'working login on the phone', 'sign in that remembers my name', 'pretend login'], weak: ['working login', 'login that works'], note: 'Not real accounts: nothing is checked and nothing leaves the phone. Real sign-in needs a server; ask a stronger AI.',
    fn: function (root, k) {
      var user = k.ls.get('user', null);
      var gate = function () { var s = document.createElement('div'); s.className = 'tcf-gate'; s.innerHTML = '<form class="tcf-card"><b>Sign in</b><p class="tcf-small">Demo only: your name is kept on this phone and nothing is checked.</p><input class="tcf-in" name="n" placeholder="Your name" autocomplete="name" required><input class="tcf-in" name="e" type="email" placeholder="Email (optional)" autocomplete="email"><button class="tcf-btn tcf-primary" type="submit">Continue</button></form>'; s.querySelector('form').onsubmit = function (e) { e.preventDefault(); var n = s.querySelector('[name=n]').value.trim(); if (!n) return; user = { name: n, email: s.querySelector('[name=e]').value.trim() }; k.ls.set('user', user); s.remove(); hello(); }; document.body.appendChild(s); };
      var hello = function () { var b = k.bar(); var p = b.querySelector('.tcf-hello') || document.createElement('span'); p.className = 'tcf-hello'; p.textContent = 'Hi, ' + user.name; b.insertBefore(p, b.firstChild); var o = b.querySelector('.tcf-out') || k.button('Sign out', 'tcf-ghost tcf-out', b); o.onclick = function () { k.ls.del('user'); location.reload(); }; };
      if (user) hello(); else gate();
    } });
  def({ id: 'profile', group: 'people', title: 'Your name and picture', what: 'People set their name and a picture once; it shows in the app and stays on the phone.',
    words: ['remember my name and picture', 'set my name and picture', 'edit my profile picture', 'profile picture upload', 'my name and picture', 'set my avatar'], weak: ['profile that works'],
    fn: function (root, k) {
      var me = k.ls.get('me', { name: '', pic: '' });
      var paint = function () { k.all('.ax-av, .ax-prof img, [data-tc-me]').forEach(function (el) { if (me.pic && el.tagName === 'IMG') el.src = me.pic; else if (me.pic) { el.style.backgroundImage = 'url(' + me.pic + ')'; el.style.backgroundSize = 'cover'; } }); k.all('[data-tc-name]').forEach(function (el) { if (me.name) el.textContent = me.name; }); };
      var b = k.button(me.name ? me.name : 'Set your name', 'tcf-ghost', k.bar());
      b.onclick = function () { var body = k.sheet('You'); body.innerHTML = '<input class="tcf-in" id="tcf-pn" placeholder="Your name"><button type="button" class="tcf-btn tcf-ghost" id="tcf-pp">Choose a picture</button>'; body.querySelector('#tcf-pn').value = me.name; body.querySelector('#tcf-pp').onclick = function () { var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = function () { var r = new FileReader(); r.onload = function () { me.pic = r.result; k.ls.set('me', me); paint(); }; if (i.files[0]) r.readAsDataURL(i.files[0]); }; i.click(); }; var s = k.button('Save', 'tcf-primary', body); s.onclick = function () { me.name = body.querySelector('#tcf-pn').value.trim(); k.ls.set('me', me); b.textContent = me.name || 'Set your name'; paint(); body.closest('.tcf-sheet').remove(); }; };
      paint();
    } });
  def({ id: 'pinlock', group: 'people', title: 'PIN lock (this phone only)', what: 'Asks for a 4-digit PIN when the app opens. It keeps out a curious friend, not a determined one.',
    words: ['pin lock', 'passcode lock', 'lock the app with a pin', 'pin code lock', 'app lock'], weak: ['passcode'], note: 'A PIN in a web app is a light lock only; it is not encryption.',
    fn: function (root, k) {
      var pin = k.ls.get('pin', '');
      var ask = function (setMode) { var s = document.createElement('div'); s.className = 'tcf-gate'; s.innerHTML = '<form class="tcf-card"><b>' + (setMode ? 'Choose a PIN' : 'Enter your PIN') + '</b><input class="tcf-in" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required autocomplete="off"><button class="tcf-btn tcf-primary" type="submit">OK</button></form>'; s.querySelector('form').onsubmit = function (e) { e.preventDefault(); var v = s.querySelector('input').value; if (setMode) { k.ls.set('pin', v); pin = v; s.remove(); k.toast('PIN set'); } else if (v === pin) s.remove(); else { s.querySelector('input').value = ''; k.toast('Wrong PIN'); } }; document.body.appendChild(s); s.querySelector('input').focus(); };
      if (pin) ask(false);
      var b = k.button(pin ? 'Change PIN' : 'Set a PIN', 'tcf-ghost', k.bar()); b.onclick = function () { ask(true); };
    } });
  def({ id: 'onboardonce', group: 'people', title: 'Welcome only once', what: 'The welcome pages show on the first open only; later opens go straight in.',
    words: ['onboarding only once', 'show onboarding only once', 'welcome only once', 'first launch only', 'skip welcome next time', 'welcome screen once'], weak: [],
    fn: function (root, k) {
      var ob = root.querySelector('[data-onb]'); if (!ob) return;
      var sc = ob.closest('.ax-screen'); if (!sc) return;
      if (k.ls.get('seenWelcome')) { var next = sc.nextElementSibling; while (next && !next.classList.contains('ax-screen')) next = next.nextElementSibling; if (next) { sc.style.display = 'none'; next.style.display = ''; } }
      k.ls.set('seenWelcome', true);
    } });

  // Numbers
  def({ id: 'totals', group: 'numbers', title: 'Totals', what: 'Adds up the money or numbers in a list and shows the total under it.',
    words: ['totals', 'add up the numbers', 'running total', 'sum the list', 'sum of expenses', 'show a total', 'total at the bottom'], weak: ['total'],
    fn: function (root, k) {
      var num = function (t) { var m = String(t).replace(/,/g, '').match(/[−-]?\s?[$€£¥]?\s?\d+(?:\.\d+)?/g); if (!m) return null; var v = parseFloat(m[m.length - 1].replace(/[^0-9.\-−]/g, '').replace('−', '-')); return isNaN(v) ? null : v; };
      var paint = function () { k.lists().forEach(function (l) { var vals = k.rowsIn(l).filter(function (r) { return r.style.display !== 'none'; }).map(function (r) { return num(k.textOf(r)); }).filter(function (v) { return v != null; }); if (vals.length < 2) return; var sum = vals.reduce(function (a, b) { return a + b; }, 0), cur = (k.textOf(l).match(/[$€£¥]/) || [''])[0]; var el = l.nextElementSibling && l.nextElementSibling.classList.contains('tcf-total') ? l.nextElementSibling : null; if (!el) { el = document.createElement('p'); el.className = 'tcf-total'; l.insertAdjacentElement('afterend', el); } el.textContent = 'Total ' + cur + (Math.round(sum * 100) / 100).toLocaleString(); }); };
      paint(); root.addEventListener('input', function () { setTimeout(paint, 0); }); root.addEventListener('click', function () { setTimeout(paint, 0); });
    } });
  def({ id: 'progress', group: 'numbers', title: 'Progress bar', what: 'A bar that fills as items are ticked off.',
    words: ['progress bar that fills', 'show how much is done', 'completion bar', 'percent done', 'fill as items are ticked'], weak: ['progress bar'],
    fn: function (root, k) {
      var el = document.createElement('div'); el.className = 'tcf-prog'; el.innerHTML = '<i></i><span></span>'; k.bar().appendChild(el);
      var paint = function () { var sc = k.current(), all = sc.querySelectorAll('[data-check], input[type=checkbox]'), done = Array.prototype.filter.call(all, function (x) { return x.classList.contains('done') || x.checked; }).length; var pc = all.length ? Math.round(done / all.length * 100) : 0; el.querySelector('i').style.width = pc + '%'; el.querySelector('span').textContent = all.length ? done + ' of ' + all.length + ' done' : ''; el.hidden = !all.length; };
      root.addEventListener('click', function () { setTimeout(paint, 0); }); root.addEventListener('change', paint); paint();
    } });
  def({ id: 'chart', group: 'numbers', title: 'Chart from a list', what: 'A simple bar chart drawn from the numbers in the first list.',
    words: ['chart from the list', 'chart from my data', 'graph from the numbers', 'draw a chart from the list', 'chart of the numbers', 'visualize the numbers'], weak: ['chart', 'graph'],
    fn: function (root, k) {
      var list = k.lists()[0]; if (!list) return;
      var rows = k.rowsIn(list).map(function (r) { var t = k.textOf(r), m = t.replace(/,/g, '').match(/\d+(?:\.\d+)?/g); return m ? { label: t.replace(/[\d.,$€£¥%+−-]+/g, '').trim().slice(0, 14), v: parseFloat(m[m.length - 1]) } : null; }).filter(Boolean).slice(0, 12);
      if (rows.length < 2) return;
      var max = Math.max.apply(null, rows.map(function (r) { return r.v; })) || 1;
      var el = document.createElement('div'); el.className = 'tcf-chart'; el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Bar chart: ' + rows.map(function (r) { return r.label + ' ' + r.v; }).join(', '));
      el.innerHTML = rows.map(function (r) { return '<div class="tcf-cb"><i style="height:' + Math.max(4, r.v / max * 100) + '%"></i><span></span></div>'; }).join('');
      Array.prototype.forEach.call(el.querySelectorAll('span'), function (s, i) { s.textContent = rows[i].label; });
      list.parentNode.insertBefore(el, list);
    } });
  def({ id: 'counter', group: 'numbers', title: 'Tap counter', what: 'A big number with plus and minus, remembered on the phone (water glasses, reps, people).',
    words: ['tap counter', 'tally counter', 'count taps', 'plus minus counter', 'clicker counter', 'counter with plus and minus'], weak: ['counter'],
    fn: function (root, k) { var n = k.ls.get('count', 0), w = document.createElement('div'); w.className = 'tcf-count'; w.innerHTML = '<button type="button" aria-label="Minus">−</button><output></output><button type="button" aria-label="Plus">+</button>'; k.bar().insertAdjacentElement('afterend', w); var out = w.querySelector('output'); var show = function () { out.textContent = n; }; w.firstChild.onclick = function () { n = Math.max(0, n - 1); k.ls.set('count', n); show(); }; w.lastChild.onclick = function () { n++; k.ls.set('count', n); show(); }; show(); } });

  // Words
  def({ id: 'languages', group: 'words', title: 'More languages', what: 'A language switch with a word table you fill in; buttons and titles change language.',
    words: ['translate the app', 'multiple languages', 'language switch', 'i18n', 'localize the app', 'more languages', 'spanish version of the app'], weak: ['languages'], note: 'Starts with the words on the screen in a table; fill in the other language yourself or ask an AI to.',
    fn: function (root, k) {
      var T = window.TC_WORDS || {}, langs = Object.keys(T); var cur = k.ls.get('lang', '');
      var nodes = []; var walk = function (n) { if (n.nodeType === 3 && n.nodeValue.trim()) nodes.push([n, n.nodeValue.trim()]); else if (n.nodeType === 1 && !/^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(n.tagName) && !n.closest('.tcf-bar')) Array.prototype.forEach.call(n.childNodes, walk); }; walk(root);
      var apply = function (l) { nodes.forEach(function (p) { var w = l && T[l] && T[l][p[1]]; p[0].nodeValue = p[0].nodeValue.replace(p[0].__tcNow || p[1], w || p[1]); p[0].__tcNow = w || p[1]; }); };
      if (!langs.length) { window.TC_WORDS_TODO = nodes.map(function (p) { return p[1]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 300); return; }
      var sel = document.createElement('select'); sel.className = 'tcf-in tcf-lang'; sel.setAttribute('aria-label', 'Language'); sel.innerHTML = '<option value="">Original</option>' + langs.map(function (l) { return '<option>' + l + '</option>'; }).join(''); sel.value = cur; k.bar().appendChild(sel);
      sel.onchange = function () { cur = sel.value; k.ls.set('lang', cur); apply(cur); }; if (cur) apply(cur);
    } });
  def({ id: 'readaloud', group: 'words', title: 'Read aloud', what: 'A button that reads the screen’s words out loud with the phone’s own voice.',
    words: ['read aloud', 'text to speech', 'speak the text', 'read it out loud', 'read the screen aloud'], weak: [],
    fn: function (root, k) { var b = k.button('Read aloud', 'tcf-ghost', k.bar()); b.onclick = function () { if (!window.speechSynthesis) return k.toast('This phone can’t read aloud here'); if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; } var u = new SpeechSynthesisUtterance(k.textOf(k.current()).slice(0, 4000)); speechSynthesis.speak(u); }; } });
  def({ id: 'dictate', group: 'words', title: 'Speak to type', what: 'A microphone button next to the first text box that types what you say, where the browser allows it.',
    words: ['dictation', 'speech to text', 'voice input', 'speak to type', 'voice typing', 'microphone typing'], weak: [], note: 'Speech recognition works in Chrome and Safari; some browsers send the audio to their own service.',
    fn: function (root, k) { var R = window.SpeechRecognition || window.webkitSpeechRecognition; var box = root.querySelector('textarea, input[type=text], input:not([type])'); if (!R || !box) return; var b = document.createElement('button'); b.type = 'button'; b.className = 'tcf-mic'; b.setAttribute('aria-label', 'Speak to type'); b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'; box.insertAdjacentElement('afterend', b); b.onclick = function () { var r = new R(); r.lang = document.documentElement.lang || 'en'; r.onresult = function (e) { box.value = (box.value ? box.value + ' ' : '') + e.results[0][0].transcript; box.dispatchEvent(new Event('input', { bubbles: true })); }; r.start(); }; } });

  // Keyboard
  def({ id: 'shortcuts', group: 'find', title: 'Keyboard shortcuts', what: 'On a computer: / jumps to search, Esc closes, arrow keys move through rows.',
    words: ['keyboard shortcuts', 'hotkeys', 'shortcut keys', 'keyboard navigation'], weak: [],
    fn: function (root, k) { var i = -1; document.addEventListener('keydown', function (e) { var tag = (e.target.tagName || '').toLowerCase(); if (e.key === '/' && tag !== 'input' && tag !== 'textarea') { var s = document.querySelector('.tcf-search, [data-filter], input[type=search]'); if (s) { e.preventDefault(); s.focus(); } } if (e.key === 'Escape') { var sh = document.querySelector('.tcf-sheet'); if (sh) sh.remove(); } if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && tag !== 'input' && tag !== 'textarea') { var rows = k.rowsIn(k.current()).filter(function (r) { return r.style.display !== 'none'; }); if (!rows.length) return; i = Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); rows.forEach(function (r, j) { r.classList.toggle('tcf-focus', j === i); }); rows[i].scrollIntoView({ block: 'nearest' }); e.preventDefault(); } }); } });
  def({ id: 'undo', group: 'data', title: 'Undo', what: 'After ticking or removing something, an Undo button appears for a few seconds.',
    words: ['undo button', 'undo last action', 'undo toast', 'let people undo'], weak: [],
    fn: function (root, k) { root.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('[data-check],[data-tog],[data-like]'); if (!t) return; var cls = t.matches('[data-check]') ? 'done' : t.matches('[data-like]') ? 'liked' : 'on'; setTimeout(function () { var now = t.classList.contains(cls); k.toast(now ? 'Done' : 'Changed', { label: 'Undo', run: function () { t.classList.toggle(cls, !now); t.dispatchEvent(new Event('change', { bubbles: true })); } }); }, 0); }); } });

  const GROUPS = { data: 'Saved on the phone', find: 'Finding things', look: 'Look and feel', share: 'Sharing', phone: 'On the phone', time: 'Time', people: 'People (on this phone)', numbers: 'Numbers', words: 'Words' };
  const CSS_BASE = '.tcf-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 16px}.tcf-btn{font:inherit;font-size:14px;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer}.tcf-btn.on{border-color:currentColor}.tcf-primary{background:var(--ax-accent,#F26B1D);border-color:transparent;color:#fff}.tcf-danger{color:#D23B30}.tcf-in,.tcf-search{font:inherit;font-size:16px;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;box-sizing:border-box;width:100%}.tcf-search{flex:1;min-width:140px;width:auto}.tcf-add{display:flex;gap:8px;padding:8px 16px}.tcf-add input{flex:1;font:inherit;font-size:16px;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit}.tcf-add button{font:inherit;min-height:40px;padding:0 14px;border-radius:10px;border:0;background:var(--ax-accent,#F26B1D);color:#fff}'
    + '.tcf-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);opacity:0;pointer-events:none;background:#1B2028;color:#fff;border-radius:12px;padding:10px 14px;font:14px/1.3 system-ui,sans-serif;display:flex;gap:12px;align-items:center;transition:opacity .2s,transform .2s;z-index:9999}.tcf-toast.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}.tcf-toast button{font:inherit;color:#F26B1D;background:none;border:0;min-height:36px;cursor:pointer}'
    + '.tcf-sheet,.tcf-gate{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;z-index:9998}.tcf-gate{align-items:center;background:var(--ax-bg,#fff)}.tcf-card{background:var(--ax-bg,#fff);color:var(--ax-ink,#111);width:min(440px,100%);border-radius:16px 16px 0 0;padding:16px;box-sizing:border-box;display:grid;gap:10px;font:15px/1.4 system-ui,sans-serif}.tcf-gate .tcf-card{border-radius:16px;border:1px solid rgba(127,127,127,.3)}.tcf-head{display:flex;justify-content:space-between;align-items:center}.tcf-x{font-size:22px;background:none;border:0;min-width:40px;min-height:40px;color:inherit;cursor:pointer}.tcf-body{display:grid;gap:10px}.tcf-body textarea{font:inherit;width:100%;box-sizing:border-box;border-radius:10px;border:1px solid rgba(127,127,127,.35);padding:10px;background:transparent;color:inherit}.tcf-body label{display:grid;gap:4px;font-size:13px}.tcf-small{font-size:12px;opacity:.7;margin:0}'
    + '.tcf-star{margin-left:auto;background:none;border:0;min-width:36px;min-height:36px;font-size:18px;color:rgba(127,127,127,.6);cursor:pointer}.tcf-star::before{content:"☆"}.tcf-star.on{color:#E0951F}.tcf-star.on::before{content:"★"}.tcf-hasnote{box-shadow:inset 3px 0 0 var(--ax-accent,#F26B1D)}.tcf-none,.tcf-emptymsg{padding:16px;opacity:.65;text-align:center;margin:0}.tcf-on{outline:2px solid var(--ax-accent,#F26B1D);outline-offset:1px}'
    + '.tcf-pull{position:fixed;top:8px;left:50%;transform:translate(-50%,-40px);opacity:0;font-size:22px;z-index:9997;pointer-events:none}.tcf-pull.spin{animation:tcfspin .6s linear infinite;opacity:1}@keyframes tcfspin{to{transform:translate(-50%,40px) rotate(360deg)}}.tcf-skel{color:transparent!important;background:rgba(127,127,127,.18)!important;border-radius:10px}.tcf-skel *{visibility:hidden}.tcf-bit{position:fixed;top:-10px;width:8px;height:12px;border-radius:2px;z-index:9999;animation:tcffall 1.4s ease-in forwards}@keyframes tcffall{to{transform:translateY(105vh) rotate(540deg)}}'
    + '.tcf-offline{position:fixed;top:0;left:0;right:0;padding:8px 12px;background:#2B2B2B;color:#fff;font:13px system-ui,sans-serif;text-align:center;transform:translateY(-100%);transition:transform .2s;z-index:9999}.tcf-offline.on{transform:none}.tcf-photo{display:block;max-width:calc(100% - 32px);margin:8px 16px;border-radius:12px}.tcf-map{display:block;margin:8px 16px}'
    + '.tcf-timer{display:grid;gap:8px;justify-items:center;padding:12px 16px}.tcf-timer output{font:600 44px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}.tcf-timer div{display:flex;gap:8px}.tcf-timer button,.tcf-count button{font:inherit;min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit}.tcf-laps{margin:0;padding-left:20px;font-variant-numeric:tabular-nums}.tcf-streak,.tcf-today,.tcf-hello{margin:0;font-weight:600}.tcf-total{text-align:right;padding:8px 16px;margin:0;font-weight:600}'
    + '.tcf-prog{flex:1 1 100%;display:grid;gap:4px}.tcf-prog i{display:block;height:8px;border-radius:8px;background:var(--ax-accent,#F26B1D);width:0;transition:width .3s}.tcf-prog span{font-size:12px;opacity:.7}.tcf-chart{display:flex;gap:6px;align-items:flex-end;height:140px;padding:8px 16px}.tcf-cb{flex:1;display:grid;grid-template-rows:1fr auto;height:100%;gap:4px;min-width:0}.tcf-cb i{align-self:end;display:block;background:var(--ax-accent,#F26B1D);border-radius:6px 6px 0 0}.tcf-cb span{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}'
    + '.tcf-count{display:flex;gap:16px;align-items:center;justify-content:center;padding:12px}.tcf-count output{font:600 40px system-ui,sans-serif;min-width:64px;text-align:center}.tcf-stars{display:flex;gap:4px;justify-content:center}.tcf-stars button{font-size:28px;background:none;border:0;min-width:44px;min-height:44px;color:#E0951F;cursor:pointer}.tcf-mic{min-width:40px;min-height:40px;border-radius:10px;border:1px solid rgba(127,127,127,.35);background:transparent}.tcf-focus{outline:2px solid var(--ax-accent,#F26B1D)}';

  const byId = {}; for (const f of F) byId[f.id] = f;
  const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  // "add offline storage", "make my app remember things", "a dark mode switch please": the feature whose words fit best.
  // Weak words ("search", "timer", "chart") are also App Creator parts, so they count only with a cue that asks for
  // behaviour: "a search that works", "make the timer work", "working chart", "the … feature".
  const CUE = / (?:that works?|which works?|working|work properly|actually works?|for real|functional|functionality|feature|features|make (?:the |my |our |it )?\w+(?: \w+)? work|so (?:it|people|that)) /;
  function match(text, o) {
    const t = ' ' + norm(text) + ' ', cue = (o && o.cue) || CUE.test(t);
    let best = null, bs = 0;
    for (const f of F) for (const [ws, strong] of [[f.words, 1], [cue ? (f.weak || []).concat([f.title]) : [], 0]]) for (const w of ws) {
      const n = norm(w); if (!n) continue;
      if (t.indexOf(' ' + n + ' ') >= 0) { const sc = n.length + (n.indexOf(' ') >= 0 ? 4 : 0) + (strong ? 2 : 0); if (sc > bs) { bs = sc; best = f.id; } }
    }
    return best;
  }
  const clean = ids => [...new Set((Array.isArray(ids) ? ids : []).filter(id => byId[id]))].slice(0, 40);
  function runtime(ids, o) {
    const list = clean(ids); if (!list.length) return '';
    const name = JSON.stringify(String((o && o.name) || 'App'));
    return `// Features added by Flint (TribeCode, no AI): ${list.join(', ')}. Everything stays on this phone.\n(function () {\n  var TCKit = ${TCKit.toString()};\n  var FEATURES = {\n${list.map(id => `    ${JSON.stringify(id)}: ${byId[id].fn.toString()}`).join(',\n')}\n  };\n  function start() { var root = document.getElementById('app') || document.querySelector('main') || document.body, kit = TCKit(root, ${name}); Object.keys(FEATURES).forEach(function (id) { try { FEATURES[id](root, kit); } catch (e) { if (window.console) console.warn('feature ' + id, e); } }); }\n  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();\n})();\n`;
  }
  const css = ids => { const list = clean(ids); if (!list.length) return ''; return CSS_BASE + list.map(id => byId[id].css || '').join(''); };
  // a code app: one file of features and one stylesheet, plus the line that loads them
  function codeFiles(ids, o) { const list = clean(ids); if (!list.length) return []; return [['tribe-features/features.js', runtime(list, o)], ['tribe-features/features.css', css(list)]]; }
  function inject(html, ids) {
    let h = String(html || '');
    if (!clean(ids).length) return h.replace(/\s*<link[^>]+tribe-features\/features\.css[^>]*>/g, '').replace(/\s*<script[^>]+tribe-features\/features\.js[^>]*><\/script>/g, '');
    if (!/tribe-features\/features\.css/.test(h)) h = /<\/head>/i.test(h) ? h.replace(/<\/head>/i, '<link rel="stylesheet" href="tribe-features/features.css">\n</head>') : '<link rel="stylesheet" href="tribe-features/features.css">\n' + h;
    if (!/tribe-features\/features\.js/.test(h)) h = /<\/body>/i.test(h) ? h.replace(/<\/body>(?![\s\S]*<\/body>)/i, '<script src="tribe-features/features.js"></script>\n</body>') : h + '\n<script src="tribe-features/features.js"></script>\n';
    return h;
  }
  const list = () => F.map(f => ({ id: f.id, group: f.group, groupName: GROUPS[f.group], title: f.title, what: f.what, note: f.note || '', secure: !!f.secure }));
  const get = id => { const f = byId[id]; return f ? { id: f.id, group: f.group, title: f.title, what: f.what, note: f.note || '', secure: !!f.secure, words: f.words.slice() } : null; };
  return { FEATURES: F, GROUPS, TCKit, list, get, match, clean, runtime, css, codeFiles, inject };
});
