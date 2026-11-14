// The website designer's preview helper. It runs inside the designer's sandboxed about:srcdoc frame, loaded by src from
// the app's origin: an inline script would be blocked by the desktop app's CSP (script-src without 'unsafe-inline'),
// which the srcdoc frame inherits. Talks to sitedesigner.js by postMessage only.
//
// feat/site-editor2: one way to work on the page.
//   Click anything: it is selected (one outline, one small toolbar above it) and, if it is words, the caret is in it.
//   Double-click or Enter: type in words that a single click uses for something else (a page link in the menu).
//   Esc: stop typing; Esc again steps out to what holds it (the entry, then the section).
//   Right-click: the same actions as a menu. Entries of a list ([data-item], found here, not per template) move, copy and go.
//   The page is swapped in place when the design changes ({ html, css }), so nothing flashes and the scroll stays put.
(function () {
  'use strict';
  var post = function (m) { m.sd = 1; parent.postMessage(m, '*'); };
  var CM = false, SEL = null, selEl = null, cur = null, drag = null, line = null, navT = 0;
  var ROOT = function () { return document.getElementById('wdz-root') || document.body; };
  var q = function (s) { return document.querySelector(s); };
  var esc = function (s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); };
  var L = { smaller: 'Smaller', bigger: 'Bigger', bold: 'Bold', color: 'Colour', align: 'Align', link: 'Where it goes', up: 'Move up', down: 'Move down', dup: 'Duplicate', add: 'Add another', del: 'Remove', flint: 'Ask Flint about this', more: 'More', replace: 'Replace the picture', fit: 'Fill or fit', swap: 'Swap the icon', words: 'Edit the words',
    grip: 'Drag to move this section', sadd: 'Add a section below' };
  var I = function (d) { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var IC = { up: I('<path d="M12 19V5M6 11l6-6 6 6"/>'), down: I('<path d="M12 5v14M6 13l6 6 6-6"/>'), dup: I('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>'), add: I('<path d="M12 5v14M5 12h14"/>'),
    del: I('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'), link: I('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    flint: I('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v4M17 18h4"/>'), more: I('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
    replace: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="9" cy="10" r="1.5"/>'), fit: I('<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>'),
    align: I('<path d="M4 6h16M7 12h10M4 18h16"/>'), color: I('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-2 1-2h2a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="8" r="1"/>'),
    swap: I('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'), words: I('<path d="M5 6h14M12 6v13M9 19h6"/>') };

  // ---------- what a click lands on ----------
  var ATTR = { text: 'data-e', button: 'data-btn', image: 'data-img', icon: 'data-icon', field: 'data-ph', item: 'data-item' };
  function target(t) {
    var x;
    if ((x = t.closest('[data-icon]'))) return { kind: 'icon', key: x.dataset.icon, el: x };
    if ((x = t.closest('[data-ph]'))) return { kind: 'field', key: x.dataset.ph, el: x };
    if ((x = t.closest('[data-btn]'))) return { kind: 'button', key: x.dataset.btn, el: x };
    if ((x = t.closest('[data-e]'))) return { kind: 'text', key: x.dataset.e, el: x };
    if ((x = t.closest('[data-img]'))) return { kind: 'image', key: x.dataset.img, el: x };
    if ((x = t.closest('[data-item]'))) return { kind: 'item', key: x.dataset.item, el: x };
    if ((x = t.closest('[data-block]'))) return { kind: 'block', key: x.dataset.block + '|', el: x };
    return null;
  }
  function find(s) {
    if (!s || !s.key) return null;
    if (s.kind === 'block' || !ATTR[s.kind]) return q('[data-block="' + esc(String(s.key).split('|')[0]) + '"]');
    var all = document.querySelectorAll('[' + ATTR[s.kind] + '="' + esc(s.key) + '"]');
    for (var i = 0; i < all.length; i++) if (!all[i].hasAttribute('data-dbl')) return all[i];   // the words on the page before their copy in the menu
    return all[0] || null;
  }
  // the entries of every list, found from the keys ("items.2.title" belongs to entry items.2): the smallest box that
  // holds everything of one entry and nothing of another gets data-item. No template has to say so.
  function lists(path) { var seg = String(path || '').replace(/\.$/, '').split('.'), out = []; for (var n = 1; n < seg.length; n++) if (/^\d+$/.test(seg[n])) out.push(seg.slice(0, n + 1).join('.')); return out; }
  function markItems() {
    [].forEach.call(document.querySelectorAll('[data-block]'), function (bl) {
      var id = bl.dataset.block, groups = {}, keyed = [].slice.call(bl.querySelectorAll('[data-e],[data-btn],[data-img],[data-icon]'));
      keyed.forEach(function (el) {
        var k = el.dataset.e || el.dataset.btn || el.dataset.img || el.dataset.icon || ''; if (k.split('|')[0] !== id) return;
        el._items = lists(k.split('|')[1] || ''); el._items.forEach(function (it) { (groups[it] = groups[it] || []).push(el); });
      });
      Object.keys(groups).sort(function (a, b) { return b.length - a.length; }).forEach(function (it) {
        var els = groups[it], box = els[0];
        while (box && !els.every(function (e) { return box.contains(e); })) box = box.parentElement;
        if (!box || box === bl) return;
        for (;;) {   // grow to the card around it while that card holds nothing of another entry
          var up = box.parentElement; if (!up || up === bl || up.hasAttribute('data-block') || /\bwrap\b/.test(up.className)) break;
          var others = keyed.some(function (e) { return up.contains(e) && els.indexOf(e) < 0 && !(e._items || []).some(function (x) { return x === it; }); });
          if (others) break; box = up;
        }
        if (!box.hasAttribute('data-item')) box.setAttribute('data-item', id + '|' + it);
      });
    });
  }

  // ---------- selection: one outline, one toolbar ----------
  var bar = document.createElement('div');
  var tb = document.createElement('div'); tb.className = 'wdz-tb'; tb.setAttribute('contenteditable', 'false'); tb.setAttribute('role', 'toolbar');
  function inList(s) { return !!s && s.kind !== 'block' && lists(String(s.key).split('|')[1] || '').length > 0; }
  function tbHtml(s) {
    var B = function (a, label) { return '<button type="button" data-a="' + a + '" title="' + L[label || a] + '" aria-label="' + L[label || a] + '">' + (IC[a] || '') + '</button>'; };
    var T = function (a, label, txt) { return '<button type="button" data-a="' + a + '" title="' + L[label] + '" aria-label="' + L[label] + '"><b>' + txt + '</b></button>'; };
    var h = '', site = String(s.key).charAt(0) === '@';
    if (s.kind === 'text' || s.kind === 'button') { if (!site) h += T('smaller', 'smaller', 'A\u2212') + T('bigger', 'bigger', 'A+') + T('bold', 'bold', 'B') + B('color') + B('align'); else h += B('words'); if (s.kind === 'button') h += B('link'); }
    if (s.kind === 'image') h += B('replace') + (site ? '' : B('fit'));
    if (s.kind === 'icon') h += B('swap');
    if (s.kind === 'field') h += B('words');
    if (s.kind === 'item' || inList(s)) h += '<i></i>' + B('up') + B('down') + B('dup') + (s.kind === 'item' ? B('add') : '') + B('del');
    if (!site) h += '<i></i>' + B('flint');
    return h + B('more');
  }
  function placeTb() {
    if (!SEL || !selEl || SEL.kind === 'block' || !document.contains(selEl)) { tb.remove(); return; }
    if (tb.dataset.for !== SEL.kind + SEL.key) { tb.innerHTML = tbHtml(SEL); tb.dataset.for = SEL.kind + SEL.key; }
    if (tb.parentNode !== document.body) document.body.appendChild(tb);
    var r = selEl.getBoundingClientRect(), w = tb.offsetWidth, h = tb.offsetHeight, dw = document.documentElement.clientWidth;
    var top = r.top + scrollY - h - 8; if (r.top - h - 8 < 0 && r.bottom + h + 8 < innerHeight) top = r.bottom + scrollY + 8; if (top < 4) top = 4;
    var left = Math.max(4, Math.min(r.left + scrollX, dw - w - 4));
    if (bar.parentNode) { var br = bar.getBoundingClientRect(), ty = top - scrollY, lx = left - scrollX; if (ty < br.bottom + 2 && ty + h > br.top - 2 && lx < br.right + 2 && lx + w > br.left - 2) top = r.bottom + scrollY + 8; }   // never on top of the section's own bar
    tb.style.top = Math.round(top) + 'px'; tb.style.left = Math.round(left) + 'px';
  }
  function select(s) {
    if (selEl) selEl.classList.remove('wdz-sel');
    SEL = s && s.key ? { kind: s.kind, key: s.key } : null; selEl = find(SEL);
    if (selEl) { selEl.classList.add('wdz-sel'); var b = selEl.closest('[data-block]'); if (b) placeBar(b); }
    placeTb();
  }
  function pick(x, quiet) { select(x); if (!quiet) post({ t: 'select', key: x.key, kind: x.kind }); }
  function typeIn(el, all) {
    if (!el) return; if (el.hasAttribute('data-dbl')) el.setAttribute('contenteditable', 'plaintext-only');
    el.focus(); try { var r = document.createRange(); r.selectNodeContents(el); if (!all) r.collapse(false); var g = getSelection(); g.removeAllRanges(); g.addRange(r); } catch (e) {}
  }
  var editing = function () { var a = document.activeElement; return a && a.closest && a.closest('[data-e]') && a.isContentEditable ? a.closest('[data-e]') : null; };
  addEventListener('resize', placeTb);
  if (window.ResizeObserver) new ResizeObserver(placeTb).observe(document.documentElement);
  document.addEventListener('load', placeTb, true);   // a picture arriving moves what is under it
  tb.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the caret where it is
  tb.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b || !SEL) return; e.preventDefault(); e.stopPropagation();
    var a = b.dataset.a;
    if (a === 'words') { if (SEL.kind === 'field') return post({ t: 'tb', act: 'words', key: SEL.key, kind: SEL.kind }); return typeIn(selEl.matches('[data-e]') ? selEl : selEl.querySelector('[data-e]'), true); }
    if (a === 'more') { var r = b.getBoundingClientRect(); return post({ t: 'menu', x: r.left, y: r.bottom + 4, key: SEL.key, kind: SEL.kind }); }
    var ed = editing(); if (ed) ed.blur();
    post({ t: 'tb', act: a, key: SEL.key, kind: SEL.kind });
  });

  // ---------- clicks ----------
  document.addEventListener('click', function (e) {
    var t = e.target, a = t.closest('a'); if (a) e.preventDefault();
    if (t.closest('.wdz-bar,.wdz-tb')) return;
    var pn = t.closest('.wdz-pin'); if (pn) { e.preventDefault(); return post({ t: 'pinopen', id: pn.dataset.id }); }
    if (CM) { e.preventDefault(); e.stopPropagation(); var sb = t.closest('[data-block]'); if (!sb) return; var r = sb.getBoundingClientRect(); return post({ t: 'pin', block: sb.dataset.block, x: Math.round((e.clientX - r.left) / r.width * 100), y: Math.round(e.clientY - r.top), cx: e.clientX, cy: e.clientY }); }
    var sys = t.closest('[data-sys]'); if (sys) { var sbl = sys.closest('[data-block]'); if (sbl) select({ kind: 'block', key: sbl.dataset.block + '|' }); return post({ t: 'sys', what: sys.dataset.sys, block: sbl ? sbl.dataset.block : '' }); }
    var dbl = t.closest('[data-dbl]'); if (dbl && dbl.isContentEditable) return;   // typing in it
    var pg = t.closest('[data-page]'); if (pg) { if (dbl) select({ kind: 'text', key: dbl.dataset.e }); var m = { t: 'page', id: pg.dataset.page, key: dbl ? dbl.dataset.e : '' }; clearTimeout(navT); navT = setTimeout(function () { post(m); }, e.detail > 1 ? 0 : 260); return; }   // a double-click types in the name instead of leaving the page
    var go = t.closest('[data-goto]'); if (go) { var gb = q('[data-block="' + esc(go.dataset.goto) + '"]'); if (gb) gb.scrollIntoView({ block: 'start', behavior: 'smooth' }); if (dbl) pick({ kind: 'text', key: dbl.dataset.e }); return; }
    var x = target(t); if (!x) { select(null); return post({ t: 'select', key: '', kind: '' }); }
    if (x.kind === 'field') e.preventDefault();
    pick(x);
    if (x.kind === 'icon') post({ t: 'icon', key: x.key });
  }, true);
  document.addEventListener('dblclick', function (e) {
    var t = e.target; if (t.closest('.wdz-bar,.wdz-tb,.wdz-pin') || CM) return;
    var d = t.closest('[data-dbl]'); if (d) { clearTimeout(navT); e.preventDefault(); pick({ kind: 'text', key: d.dataset.e }, true); return typeIn(d, true); }
    var im = t.closest('[data-img]'); if (im && !t.closest('[data-e]')) { pick({ kind: 'image', key: im.dataset.img }); post({ t: 'tb', act: 'replace', key: im.dataset.img, kind: 'image' }); }
  }, true);
  document.addEventListener('contextmenu', function (e) {
    if (CM || e.target.closest('.wdz-bar,.wdz-tb')) return; var x = target(e.target); if (!x) return;
    e.preventDefault(); if (!(SEL && SEL.key === x.key && SEL.kind === x.kind)) pick(x);
    post({ t: 'menu', x: e.clientX, y: e.clientY, key: x.key, kind: x.kind });
  }, true);
  document.addEventListener('mousedown', function (e) { if (e.target.closest('[data-ph]')) e.preventDefault(); }, true);   // the box is part of the design here, not a form to fill in
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);

  // ---------- words ----------
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-e]'); if (!el) return;
    var v = el.innerText, same = document.querySelectorAll('[data-e="' + esc(el.dataset.e) + '"]');
    for (var i = 0; i < same.length; i++) if (same[i] !== el) same[i].textContent = v;   // its copy in the menu follows
    post({ t: 'text', key: el.dataset.e, value: v }); placeTb();
  });
  document.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('[data-e]'); if (!el) return; var x = target(el); if (x && !(SEL && SEL.key === x.key && SEL.kind === x.kind)) pick(x); });
  document.addEventListener('focusout', function (e) {
    var el = e.target.closest && e.target.closest('[data-e]'); if (!el) return;
    if (el.hasAttribute('data-dbl')) el.removeAttribute('contenteditable');
    post({ t: 'commit', key: el.dataset.e, value: el.innerText });
  });
  document.addEventListener('keydown', function (e) {
    var el = editing(), mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { if (drag) return; if (el) { e.preventDefault(); el.blur(); return; } return post({ t: 'esc' }); }
    if (el) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); } return; }
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (mod && /^[zy]$/i.test(e.key)) { e.preventDefault(); return post({ t: (e.key.toLowerCase() === 'y' || e.shiftKey) ? 'redo' : 'undo' }); }
    if (e.key === 'Enter' && SEL && selEl) { var w = selEl.matches('[data-e]') ? selEl : selEl.querySelector('[data-e]'); if (w) { e.preventDefault(); return typeIn(w, false); } if (SEL.kind === 'image') return post({ t: 'tb', act: 'replace', key: SEL.key, kind: 'image' }); }
    if (/^(Delete|Backspace)$/.test(e.key) || (mod && /^[ds]$/i.test(e.key)) || (e.altKey && /^Arrow(Up|Down)$/.test(e.key))) e.preventDefault();
    if (e.key.length === 1 || /^(Delete|Backspace|Arrow(Up|Down))$/.test(e.key)) post({ t: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey });
  });

  // ---------- the section bar (feat/design-site2): on the section under the pointer, or the selected one ----------
  bar.className = 'wdz-bar'; bar.setAttribute('contenteditable', 'false');
  function barHtml() { var B = function (a, l, g) { return '<button type="button" data-a="' + a + '" title="' + L[l] + '" aria-label="' + L[l] + '">' + g + '</button>'; }; bar.innerHTML = B('grip', 'grip', '\u22EE\u22EE') + B('up', 'up', IC.up) + B('down', 'down', IC.down) + B('dup', 'dup', IC.dup) + B('add', 'sadd', IC.add) + B('del', 'del', IC.del); }
  barHtml();
  function blocks() { return [].slice.call(document.querySelectorAll('[data-block]')); }
  function placeBar(b) { if (b === cur && bar.parentNode === b) return; cur = b; if (!b) { bar.remove(); return; } b.appendChild(bar); }
  document.addEventListener('mouseover', function (e) { if (drag) return; var b = e.target.closest && e.target.closest('[data-block]'); if (b) placeBar(b); });
  bar.addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (!b || !cur) return; e.preventDefault(); e.stopPropagation(); var a = b.dataset.a; if (a === 'grip') return; post({ t: 'act', act: a, block: cur.dataset.block }); });
  function gapAt(y) { var bs = blocks(), g = bs.length; for (var i = 0; i < bs.length; i++) { var r = bs[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { g = i; break; } } return g; }
  function lineAt(g) { var bs = blocks(); if (!line) { line = document.createElement('div'); line.className = 'wdz-drop'; document.body.appendChild(line); } var y = g < bs.length ? bs[g].getBoundingClientRect().top + scrollY : bs[bs.length - 1].getBoundingClientRect().bottom + scrollY; line.style.top = (y - 2) + 'px'; }
  bar.addEventListener('pointerdown', function (e) { var g = e.target.closest('[data-a="grip"]'); if (!g || !cur) return; e.preventDefault(); drag = { id: cur.dataset.block, el: cur, gap: -1 }; cur.classList.add('wdz-moving'); document.documentElement.classList.add('wdz-dragging'); try { g.setPointerCapture(e.pointerId); } catch (x) {} });
  bar.addEventListener('pointermove', function (e) { if (!drag) return; var g = gapAt(e.clientY); if (g !== drag.gap) { drag.gap = g; lineAt(g); } if (e.clientY < 60) scrollBy(0, -18); else if (e.clientY > innerHeight - 60) scrollBy(0, 18); });
  function end(e, ok) { if (!drag) return; var d = drag; drag = null; d.el.classList.remove('wdz-moving'); document.documentElement.classList.remove('wdz-dragging'); if (line) { line.remove(); line = null; } if (!ok || d.gap < 0) return; var bs = blocks(), i = bs.indexOf(d.el), to = d.gap > i ? d.gap - 1 : d.gap; if (to !== i) post({ t: 'move', block: d.id, to: to }); }
  bar.addEventListener('pointerup', function (e) { end(e, true); }); bar.addEventListener('pointercancel', function (e) { end(e, false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drag) end(e, false); }, true);

  // ---------- from the designer ----------
  function pins(list) {
    [].forEach.call(document.querySelectorAll('.wdz-pin'), function (x) { x.remove(); });
    (list || []).forEach(function (p) { var b = q('[data-block="' + esc(p.block) + '"]'); if (!b) return; var s = document.createElement('button'); s.className = 'wdz-pin' + (p.status !== 'open' ? ' done' : ''); s.dataset.id = p.id; s.type = 'button'; s.textContent = p.n; s.title = p.text; s.style.left = p.x + '%'; s.style.top = Math.min(p.y, b.offsetHeight - 12) + 'px'; b.appendChild(s); });
  }
  function wide() { var sw = document.documentElement.scrollWidth, iw = innerWidth, w = ''; if (sw > iw + 1) { var bs = document.querySelectorAll('[data-block]'); for (var i = 0; i < bs.length && !w; i++) { var els = bs[i].querySelectorAll('*'); for (var j = 0; j < els.length; j++) { if (els[j].closest('.wdz-bar,.wdz-tb')) continue; if (els[j].getBoundingClientRect().right > iw + 1) { w = bs[i].dataset.block; break; } } } } return { sw: sw, iw: iw, wide: w }; }
  addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.labels) { for (var k in d.labels) L[k] = d.labels[k]; barHtml(); tb.dataset.for = ''; placeTb(); }
    if (d.html != null) {   // the design changed: swap the page in place (no reload, no flash, the scroll stays)
      var ed = editing(), keep = ed ? ed.dataset.e : '';
      var cssEl = document.getElementById('wdz-css'); if (cssEl && d.css != null && cssEl.textContent !== d.css) cssEl.textContent = d.css;
      bar.remove(); cur = null; selEl = null;
      ROOT().innerHTML = d.html; markItems(); select(SEL);
      if (keep) { var again = q('[data-e="' + esc(keep) + '"]'); if (again) typeIn(again, false); }
      var w = wide(); post({ t: 'ready', soft: 1, sw: w.sw, iw: w.iw, wide: w.wide });
    }
    if ('cm' in d) { CM = !!d.cm; document.documentElement.classList.toggle('wdz-cm', CM); if (CM) select(null); }
    if (d.pins) pins(d.pins);
    if ('sel' in d) { var s = d.sel; if (typeof s === 'string') { var el = s ? q(s) : null; s = el ? target(el) : null; } select(s); if (selEl && d.scroll) { var r = selEl.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) selEl.scrollIntoView({ block: 'center' }); } }
    if (d.type) { var te = find({ kind: 'text', key: d.type }); if (te) typeIn(te, true); }
    if (d.y != null) scrollTo(0, d.y);
  });
  addEventListener('scroll', function () { post({ t: 'scroll', y: scrollY }); }, { passive: true });
  markItems();
  var w0 = wide(); post({ t: 'ready', sw: w0.sw, iw: w0.iw, wide: w0.wide });
})();
