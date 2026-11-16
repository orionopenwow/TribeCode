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
  var CM = false, SEL = null, selEl = null, cur = null, drag = null, line = null, navT = 0, swapping = false;
  var ROOT = function () { return document.getElementById('wdz-root') || document.body; };
  var q = function (s) { return document.querySelector(s); };
  var esc = function (s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); };
  var L = { smaller: 'Smaller', bigger: 'Bigger', bold: 'Bold', color: 'Colour', align: 'Align', link: 'Where it goes', up: 'Move up', down: 'Move down', dup: 'Duplicate', add: 'Add another', del: 'Remove', flint: 'Ask Flint about this', more: 'More', replace: 'Replace the picture', fit: 'Fill or fit', swap: 'Swap the icon', words: 'Edit the words',
    grip: 'Drag to move this section', sadd: 'Add a section below', igrip: 'Drag to move it', ital: 'Slanted', wlink: 'Link the selected words' };
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
        var foreign = function (b) { return keyed.some(function (e) { return b.contains(e) && els.indexOf(e) < 0 && !(e._items || []).some(function (x) { return x === it; }); }); };
        if (!box || box === bl || foreign(box)) { box = els[0].closest('[data-btn]') || els[0]; if (box.hasAttribute('data-item')) return; box.setAttribute('data-item', id + '|' + it); return; }   // no box of its own: its main element stands for it
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
    if (s.kind === 'text' || s.kind === 'button') { if (!site) h += T('smaller', 'smaller', 'A\u2212') + T('bigger', 'bigger', 'A+') + T('bold', 'bold', 'B') + '<button type="button" data-a="ital" title="' + L.ital + '" aria-label="' + L.ital + '"><b style="font-style:italic;font-family:Georgia,serif">I</b></button>' + (s.kind === 'text' ? '<button type="button" data-a="wlink" title="' + L.wlink + '" aria-label="' + L.wlink + '">' + IC.link + '</button>' : '') + B('color') + B('align'); else h += B('words'); if (s.kind === 'button') h += B('link'); }
    if (s.kind === 'image') h += B('replace') + (site ? '' : B('fit'));
    if (s.kind === 'icon') h += B('swap');
    if (s.kind === 'field') h += B('words');
    if (s.kind === 'item' || inList(s)) h += '<i></i>' + '<button type="button" data-a="igrip" title="' + L.igrip + '" aria-label="' + L.igrip + '">\u22EE\u22EE</button>' + B('up') + B('down') + B('dup') + (s.kind === 'item' ? B('add') : '') + B('del');
    if (!site) h += '<i></i>' + B('flint');
    return h + B('more');
  }
  function placeTb() {
    if (!SEL || !selEl || SEL.kind === 'block' || !document.contains(selEl)) { tb.remove(); return; }
    if (tb.dataset.for !== SEL.kind + SEL.key) { tb.innerHTML = tbHtml(SEL); tb.dataset.for = SEL.kind + SEL.key; }
    if (tb.parentNode !== document.body) document.body.appendChild(tb);
    var r = selEl.getBoundingClientRect(), w = tb.offsetWidth, h = tb.offsetHeight, dw = document.documentElement.clientWidth;
    var left = Math.max(4, Math.min(r.left, dw - w - 4));
    // feat/site-editor2 round 2: it never sits on words, a picture or the section's bar. Places tried in order: above,
    // below, above at the right edge, below at the right edge; if all are taken it docks at the top of the screen.
    var others = [].filter.call(document.querySelectorAll('[data-e],[data-btn],[data-img],[data-icon],[data-ph],.wdz-bar'), function (e) { return e !== selEl && !e.contains(selEl) && !selEl.contains(e); }).map(function (e) { return e.getBoundingClientRect(); }).filter(function (b) { return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight; });
    var free = function (x, y) { if (y < 2 || y + h > innerHeight - 2) return false; for (var i = 0; i < others.length; i++) { var b = others[i]; if (x < b.right + 2 && x + w > b.left - 2 && y < b.bottom + 2 && y + h > b.top - 2) return false; } return true; };
    others.push(r);   // nor on the thing itself
    var rx = Math.max(4, Math.min(r.right - w, dw - w - 4)), tries = [[left, r.top - h - 8], [left, r.bottom + 8], [rx, r.top - h - 8], [rx, r.bottom + 8]], at = null;
    for (var t = 0; t < tries.length && !at; t++) if (free(tries[t][0], tries[t][1])) at = tries[t];
    tb.classList.toggle('is-docked', !at);
    if (!at) {   // docked: the free spot on screen nearest to the thing, so it is clear of every word
      var xs = [left, rx, Math.max(4, (dw - w) / 2), 4, dw - w - 4], best = null, cy = (r.top + r.bottom) / 2;
      for (var y = 4; y + h <= innerHeight - 2; y += 10) for (var k = 0; k < xs.length; k++) if (free(xs[k], y)) { var dist = Math.abs(y + h / 2 - cy) + Math.abs(xs[k] - left) / 4; if (!best || dist < best[2]) best = [xs[k], y, dist]; }
      at = best || [Math.max(4, (dw - w) / 2), Math.max(4, innerHeight - h - 6)];
    }
    tb.style.top = Math.round(at[1] + scrollY) + 'px'; tb.style.left = Math.round(at[0] + scrollX) + 'px';
  }
  function select(s) {
    if (selEl) selEl.classList.remove('wdz-sel');
    SEL = s && s.key ? { kind: s.kind, key: s.key } : null; selEl = find(SEL);
    if (selEl) { selEl.classList.add('wdz-sel'); var b = selEl.closest('[data-block]'); if (b) placeBar(b); }
    placeTb();
  }
  var MULTI = [];
  function multiSet(list) { MULTI = list || []; [].forEach.call(document.querySelectorAll('.wdz-msel'), function (e) { e.classList.remove('wdz-msel'); }); MULTI.forEach(function (m) { var e = find(m); if (e) e.classList.add('wdz-msel'); }); }
  function pick(x, quiet) { select(x); if (!quiet) post({ t: 'select', key: x.key, kind: x.kind }); }
  function typeIn(el, all) {
    if (!el) return; if (el.hasAttribute('data-dbl')) el.setAttribute('contenteditable', 'plaintext-only');
    el.focus(); try { var r = document.createRange(); r.selectNodeContents(el); if (!all) r.collapse(false); var g = getSelection(); g.removeAllRanges(); g.addRange(r); } catch (e) {}
  }
  // the words as they are written, not as CSS shows them: innerText gives "ADDRESS" for a label styled in capitals,
  // and saving that would change what the site says. Line breaks typed with Shift Enter are kept.
  function words(el) { var out = ''; (function go(n) { for (var c = n.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3) out += c.nodeValue; else if (c.nodeName === 'BR') out += '\n'; else if (c.nodeType === 1) { if (/^(DIV|P)$/.test(c.nodeName) && out && !/\n$/.test(out)) out += '\n'; var w = /^(B|STRONG)$/.test(c.nodeName) ? ['**', '**'] : /^(I|EM)$/.test(c.nodeName) ? ['*', '*'] : c.nodeName === 'A' && c.getAttribute('href') ? ['[', '](' + c.getAttribute('href') + ')'] : null; if (w && !c.textContent.trim()) continue; if (w) out += w[0]; go(c); if (w) out += w[1]; } } })(el); return out.replace(/\u00a0/g, ' ').replace(/\n$/, ''); }
  // some of the words, selected with the mouse inside the thing that is being typed in: wrap or unwrap them
  function partRange() { var g = getSelection(); if (!g || !g.rangeCount || g.isCollapsed || !selEl) return null; var r = g.getRangeAt(0), host = selEl.matches('[data-e]') ? selEl : selEl.querySelector('[data-e]'); return host && host.contains(r.commonAncestorContainer) && String(r).trim() ? { r: r, host: host } : null; }
  function wrapPart(tag, attrs) {
    var p = partRange(); if (!p) return null;
    var inside = p.r.commonAncestorContainer.nodeType === 1 ? p.r.commonAncestorContainer : p.r.commonAncestorContainer.parentElement, old = inside.closest(tag);
    if (old && p.host.contains(old) && old !== p.host) { while (old.firstChild) old.parentNode.insertBefore(old.firstChild, old); old.remove(); }   // again takes it off
    else { var el = document.createElement(tag); for (var k in attrs || {}) el.setAttribute(k, attrs[k]); el.appendChild(p.r.extractContents()); p.r.insertNode(el); var g = getSelection(); g.removeAllRanges(); var nr = document.createRange(); nr.selectNodeContents(el); g.addRange(nr); }
    p.host.normalize(); post({ t: 'text', key: p.host.dataset.e, value: words(p.host) }); return p.host;
  }
  var editing = function () { var a = document.activeElement; return a && a.closest && a.closest('[data-e]') && a.isContentEditable ? a.closest('[data-e]') : null; };
  // which screen size the editor is showing: the one picked in the top bar, or "phone" when the preview itself is that narrow
  var DEV = 'desktop'; function setDev() { document.documentElement.dataset.dev = innerWidth <= 640 ? 'phone' : DEV; }
  setDev(); addEventListener('resize', setDev);
  addEventListener('resize', placeTb);
  if (window.ResizeObserver) new ResizeObserver(placeTb).observe(document.documentElement);
  document.addEventListener('load', placeTb, true);   // a picture arriving moves what is under it
  tb.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the caret where it is
  // ---- drag an entry of a list (round 2): hold its grip, a line shows where it lands among its own kind ----
  var idrag = null, iline = null;
  function entryKey(s) { var k = String(s.key), b = k.slice(0, k.indexOf('|')), ls = lists(k.slice(k.indexOf('|') + 1)); return ls.length ? b + '|' + ls[ls.length - 1] : ''; }
  function siblings(key) { var pre = key.replace(/\.\d+$/, '.'); return [].filter.call(document.querySelectorAll('[data-item]'), function (e) { var k = e.dataset.item; return k.indexOf(pre) === 0 && /^\d+$/.test(k.slice(pre.length)); }).sort(function (a, b) { return +a.dataset.item.slice(pre.length) - +b.dataset.item.slice(pre.length); }); }
  function igap(x, y) {   // where the pointer would drop it: the entry under (or nearest to) the pointer, before or after by its middle
    var el = idrag.sibs, best = 0, bd = Infinity, i, r;
    for (i = 0; i < el.length; i++) { r = el[i].getBoundingClientRect(); var dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    r = el[best].getBoundingClientRect(); var row = idrag.row, after = row ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    return { i: best + (after ? 1 : 0), r: r, after: after };
  }
  function ilineAt(g) {
    if (!iline) { iline = document.createElement('div'); iline.className = 'wdz-idrop'; document.body.appendChild(iline); }
    var r = g.r, st = iline.style;
    if (idrag.row) { st.width = '3px'; st.height = Math.round(r.height) + 'px'; st.top = Math.round(r.top + scrollY) + 'px'; st.left = Math.round((g.after ? r.right + 3 : r.left - 6) + scrollX) + 'px'; }
    else { st.height = '3px'; st.width = Math.round(r.width) + 'px'; st.left = Math.round(r.left + scrollX) + 'px'; st.top = Math.round((g.after ? r.bottom + 3 : r.top - 6) + scrollY) + 'px'; }
  }
  function iend(ok) {
    if (!idrag) return; var d = idrag; idrag = null; d.el.classList.remove('wdz-moving'); document.documentElement.classList.remove('wdz-dragging'); if (iline) { iline.remove(); iline = null; }
    if (!ok || d.gap < 0) return; var to = d.gap > d.from ? d.gap - 1 : d.gap; if (to !== d.from) post({ t: 'imove', key: d.key, from: d.from, to: to });
  }
  tb.addEventListener('pointerdown', function (e) {
    var g = e.target.closest('[data-a="igrip"]'); if (!g || !SEL) return; var key = SEL.kind === 'item' ? SEL.key : entryKey(SEL); if (!key) return;
    var sibs = siblings(key), el = q('[data-item="' + esc(key) + '"]'), from = sibs.indexOf(el); if (from < 0 || sibs.length < 2) return;
    e.preventDefault(); var a = sibs[0].getBoundingClientRect(), b = sibs[1].getBoundingClientRect();
    idrag = { key: key, el: el, sibs: sibs, from: from, gap: -1, row: Math.abs(a.top - b.top) < Math.min(a.height, b.height) / 2 };
    el.classList.add('wdz-moving'); document.documentElement.classList.add('wdz-dragging'); try { g.setPointerCapture(e.pointerId); } catch (x) {}
  });
  tb.addEventListener('pointermove', function (e) { if (!idrag) return; var g = igap(e.clientX, e.clientY); idrag.gap = g.i; ilineAt(g); if (e.clientY < 60) scrollBy(0, -18); else if (e.clientY > innerHeight - 60) scrollBy(0, 18); });
  tb.addEventListener('pointerup', function () { iend(true); }); tb.addEventListener('pointercancel', function () { iend(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && idrag) { e.stopPropagation(); iend(false); } }, true);
  tb.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b || !SEL) return; e.preventDefault(); e.stopPropagation();
    var a = b.dataset.a; if (a === 'igrip') return;
    if (a === 'words') { if (SEL.kind === 'field') return post({ t: 'tb', act: 'words', key: SEL.key, kind: SEL.kind }); return typeIn(selEl.matches('[data-e]') ? selEl : selEl.querySelector('[data-e]'), true); }
    if (a === 'more') { var r = b.getBoundingClientRect(); return post({ t: 'menu', x: r.left, y: r.bottom + 4, key: SEL.key, kind: SEL.kind }); }
    if ((a === 'bold' || a === 'ital') && partRange()) { wrapPart(a === 'bold' ? 'b' : 'i'); return; }   // only the selected words
    if (a === 'wlink') { var had = partRange(); if (!had) return post({ t: 'tb', act: 'wlink-none', key: SEL.key, kind: SEL.kind }); var h = wrapPart('a', { href: '#', 'data-new': '1' }); if (h && !h.querySelector('a[data-new]')) return; return post({ t: 'tb', act: 'wlink', key: SEL.key, kind: SEL.kind }); }
    if (a === 'ital') return post({ t: 'tb', act: 'ital', key: SEL.key, kind: SEL.kind });
    var ed = editing(); if (ed) ed.blur();
    post({ t: 'tb', act: a, key: SEL.key, kind: SEL.kind });
  });

  // ---------- clicks ----------
  var noClick = 0;
  document.addEventListener('click', function (e) {
    if (Date.now() - noClick < 300) { e.preventDefault(); e.stopPropagation(); return; }   // the end of a drag is not a click
    var t = e.target, a = t.closest('a'); if (a || t.closest('form button, form input[type=submit]')) e.preventDefault();
    if (t.closest('.wdz-bar,.wdz-tb')) return;
    var pn = t.closest('.wdz-pin'); if (pn) { e.preventDefault(); return post({ t: 'pinopen', id: pn.dataset.id }); }
    if (CM) { e.preventDefault(); e.stopPropagation(); var sb = t.closest('[data-block]'); if (!sb) return; var r = sb.getBoundingClientRect(); return post({ t: 'pin', block: sb.dataset.block, x: Math.round((e.clientX - r.left) / r.width * 100), y: Math.round(e.clientY - r.top), cx: e.clientX, cy: e.clientY }); }
    var sys = t.closest('[data-sys]'); if (sys) { var sbl = sys.closest('[data-block]'); if (sbl) select({ kind: 'block', key: sbl.dataset.block + '|' }); return post({ t: 'sys', what: sys.dataset.sys, block: sbl ? sbl.dataset.block : '' }); }
    var dbl = t.closest('[data-dbl]'); if (dbl && dbl.isContentEditable) return;   // typing in it
    var pg = t.closest('[data-page]'); if (pg) { if (dbl) select({ kind: 'text', key: dbl.dataset.e }); var m = { t: 'page', id: pg.dataset.page, key: dbl ? dbl.dataset.e : '' }; clearTimeout(navT); navT = setTimeout(function () { post(m); }, e.detail > 1 ? 0 : 260); return; }   // a double-click types in the name instead of leaving the page
    var go = t.closest('[data-goto]'); if (go) { var gb = q('[data-block="' + esc(go.dataset.goto) + '"]'); if (gb) gb.scrollIntoView({ block: 'start', behavior: 'smooth' }); if (dbl) pick({ kind: 'text', key: dbl.dataset.e }); return; }
    var x = target(t); if (!x) { multiSet([]); select(null); return post({ t: 'select', key: '', kind: '' }); }
    if (e.shiftKey && x.kind !== 'field' && x.kind !== 'icon' && String(x.key).charAt(0) !== '@') {   // round 3: several things at once
      e.preventDefault(); var ed0 = editing(); if (ed0) ed0.blur(); try { getSelection().removeAllRanges(); } catch (z) {}
      var cur0 = MULTI.slice(); if (!cur0.length && SEL && String(SEL.key).charAt(0) !== '@') cur0.push({ kind: SEL.kind, key: SEL.key });
      var at0 = -1; for (var mi = 0; mi < cur0.length; mi++) if (cur0[mi].key === x.key && cur0[mi].kind === x.kind) at0 = mi;
      if (at0 >= 0) cur0.splice(at0, 1); else cur0.push({ kind: x.kind, key: x.key });
      multiSet(cur0); select(null); return post({ t: 'multi', list: cur0 });
    }
    if (MULTI.length) multiSet([]);
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
  document.addEventListener('mousedown', function (e) { if (e.target.closest('[data-ph]') || (e.shiftKey && !e.target.closest('.wdz-tb,.wdz-bar'))) e.preventDefault(); }, true);   // shift-click picks things, it does not stretch a text selection   // the box is part of the design here, not a form to fill in
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);
  // (round 2) drag a selected picture inside its frame to choose what stays in view; the focus point is saved in percent
  var pdrag = null;
  document.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);   // a picture is moved inside its frame here, never dragged out of the page
  document.addEventListener('pointercancel', function () { if (pdrag) { pdrag.box.classList.remove('wdz-panning'); pdrag = null; } }, true);
  document.addEventListener('pointerdown', function (e) {
    var box = e.target.closest && e.target.closest('[data-img]'); if (!box || CM || !SEL || SEL.kind !== 'image' || box.dataset.img !== SEL.key || SEL.key.charAt(0) === '@' || e.button) return;
    var im = box.querySelector('img'); if (!im || !im.naturalWidth) return; var cs = getComputedStyle(im); if (cs.objectFit !== 'cover') return;
    var p = cs.objectPosition.split(' '); pdrag = { box: box, im: im, x0: e.clientX, y0: e.clientY, fx: parseFloat(p[0]) || 50, fy: parseFloat(p[1]) || 50, moved: false };
  }, true);
  document.addEventListener('pointermove', function (e) {
    if (!pdrag) return; var dx = e.clientX - pdrag.x0, dy = e.clientY - pdrag.y0; if (!pdrag.moved && Math.abs(dx) + Math.abs(dy) < 5) return; pdrag.moved = true; e.preventDefault();
    var r = pdrag.im.getBoundingClientRect(), k = Math.max(r.width / pdrag.im.naturalWidth, r.height / pdrag.im.naturalHeight), ox = pdrag.im.naturalWidth * k - r.width, oy = pdrag.im.naturalHeight * k - r.height;
    pdrag.nx = Math.max(0, Math.min(100, pdrag.fx - (ox > 1 ? dx / ox * 100 : 0))); pdrag.ny = Math.max(0, Math.min(100, pdrag.fy - (oy > 1 ? dy / oy * 100 : 0)));
    pdrag.im.style.objectPosition = pdrag.nx + '% ' + pdrag.ny + '%'; pdrag.box.classList.add('wdz-panning');
  }, true);
  document.addEventListener('pointerup', function () { if (!pdrag) return; var d = pdrag; pdrag = null; d.box.classList.remove('wdz-panning'); if (d.moved) { noClick = Date.now(); post({ t: 'focus', key: d.box.dataset.img, x: Math.round(d.nx), y: Math.round(d.ny) }); } }, true);

  // ---------- words ----------
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-e]'); if (!el) return;
    var v = words(el), same = document.querySelectorAll('[data-e="' + esc(el.dataset.e) + '"]');
    for (var i = 0; i < same.length; i++) if (same[i] !== el) same[i].textContent = v;   // its copy in the menu follows
    post({ t: 'text', key: el.dataset.e, value: v }); placeTb();
  });
  document.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('[data-e]'); if (!el) return; var x = target(el); if (x && !(SEL && SEL.key === x.key && SEL.kind === x.kind)) pick(x); });
  document.addEventListener('focusout', function (e) {
    var el = e.target.closest && e.target.closest('[data-e]'); if (!el || swapping) return;
    if (el.hasAttribute('data-dbl')) el.removeAttribute('contenteditable');
    post({ t: 'commit', key: el.dataset.e, value: words(el) });
  });
  document.addEventListener('keydown', function (e) {
    var el = editing(), mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { if (drag || idrag) return; if (el) { e.preventDefault(); el.blur(); return; } return post({ t: 'esc' }); }
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
    if (d.dev) { DEV = d.dev; setDev(); }
    if (d.labels) { for (var k in d.labels) L[k] = d.labels[k]; barHtml(); tb.dataset.for = ''; placeTb(); }
    if (d.html != null) {   // the design changed: swap the page in place (no reload, no flash, the scroll stays)
      var wasEd = !!editing();
      if ('sel' in d) SEL = d.sel && d.sel.key ? { kind: d.sel.kind, key: d.sel.key } : null;   // what is selected after the change (an entry that moved keeps the caret)
      var cssEl = document.getElementById('wdz-css'); if (cssEl && d.css != null && cssEl.textContent !== d.css) cssEl.textContent = d.css;
      bar.remove(); cur = null; selEl = null;
      swapping = true; try { ROOT().innerHTML = d.html; } finally { swapping = false; }   // the old words leaving the page are not an edit
      markItems(); select(SEL); multiSet(MULTI);
      if (wasEd && SEL && SEL.kind === 'text' && selEl && !selEl.hasAttribute('data-dbl')) typeIn(selEl, false);
      var w = wide(); post({ t: 'ready', soft: 1, sw: w.sw, iw: w.iw, wide: w.wide });
    }
    if ('cm' in d) { CM = !!d.cm; document.documentElement.classList.toggle('wdz-cm', CM); if (CM) select(null); }
    if (d.pins) pins(d.pins);
    if ('sel' in d) { var s = d.sel; if (typeof s === 'string') { var el = s ? q(s) : null; s = el ? target(el) : null; } select(s); if (selEl && d.scroll) { var r = selEl.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) selEl.scrollIntoView({ block: 'center' }); } }
    if (d.type) { var te = find({ kind: 'text', key: d.type }); if (te) typeIn(te, true); }
    if (d.multi) multiSet(d.multi === 'none' ? [] : d.multi);
    if (d.play) { var pb = q('[data-block="' + esc(d.play) + '"]'); if (pb) { pb.classList.remove('an-play-fade', 'an-play-rise'); void pb.offsetWidth; pb.classList.add('an-play-' + (d.anim === 'rise' ? 'rise' : 'fade')); pb.scrollIntoView({ block: 'nearest' }); setTimeout(function () { pb.classList.remove('an-play-fade', 'an-play-rise'); }, 900); } }
    if ('linkset' in d) { var na = q('a[data-new]'); if (na) { var hostE = na.closest('[data-e]'); if (d.linkset) { na.setAttribute('href', d.linkset); na.removeAttribute('data-new'); } else { while (na.firstChild) na.parentNode.insertBefore(na.firstChild, na); na.remove(); } if (hostE) { hostE.normalize(); post({ t: 'commit', key: hostE.dataset.e, value: words(hostE) }); } } }
    if (d.y != null) scrollTo(0, d.y);
  });
  addEventListener('scroll', function () { post({ t: 'scroll', y: scrollY }); if (tb.classList.contains('is-docked') || SEL) placeTb(); }, { passive: true });
  // ---------- feat/cowork-editors: the others in this page ----------
  // My pointer goes out as the thing under it ("<kind>:<key>") plus where inside it, so it lands on the same words at any
  // width; the others come in from the designer ({ cw: people }) and are drawn here, on the real elements.
  var cwPeople = [], cwLayer = null, cwLast = 0, cwT = 0, cwPend = null, cwShown = false;
  function cwPath(t) { var g = t && target(t); if (!g || !g.el) return null; return { p: g.kind + ':' + g.key, el: g.el }; }
  function cwFind(p) {
    var k = String(p || ''), i = k.indexOf(':'); if (i < 0) return null;
    var kind = k.slice(0, i), key = k.slice(i + 1);
    if (kind === 'block') return q('[data-block="' + esc(key.split('|')[0]) + '"]');
    var a = ATTR[kind]; return a ? q('[' + a + '="' + esc(key) + '"]') : null;
  }
  function cwSend(a) {
    cwPend = a; var now = Date.now();
    if (now - cwLast >= 55) { cwLast = now; post({ t: 'cw-ptr', a: cwPend }); cwShown = !!cwPend; cwPend = undefined; }
    else if (!cwT) cwT = setTimeout(function () { cwT = 0; if (cwPend !== undefined) { cwLast = Date.now(); post({ t: 'cw-ptr', a: cwPend }); cwShown = !!cwPend; cwPend = undefined; } }, 55);
  }
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    var w = cwPath(e.target); if (!w) { if (cwShown) cwSend(null); return; }
    var r = w.el.getBoundingClientRect(); if (!r.width || !r.height) return;
    cwSend({ p: w.p, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  }, { passive: true });
  document.addEventListener('mouseleave', function () { if (cwShown) cwSend(null); });
  function cwDraw() {
    if (!cwLayer || !cwLayer.isConnected) { cwLayer = document.createElement('div'); cwLayer.className = 'wdz-cw'; cwLayer.setAttribute('aria-hidden', 'true'); cwLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:hidden'; document.documentElement.appendChild(cwLayer); }
    var html = '';
    cwPeople.forEach(function (p) {
      var col = String(p.color || '#6C7CFF').replace(/[^#0-9a-zA-Z]/g, ''), name = String(p.name || '').replace(/[<>&"']/g, '');
      var box = p.editing || p.sel, el = box && cwFind(box);
      if (el) { var r = el.getBoundingClientRect(); if (r.width) html += '<div class="wdz-cw-out" data-cw-out="' + p.id + '" style="position:absolute;left:' + (r.left - 2) + 'px;top:' + (r.top - 2) + 'px;width:' + (r.width + 4) + 'px;height:' + (r.height + 4) + 'px;border:2px ' + (p.editing ? 'dashed' : 'solid') + ' ' + col + ';border-radius:6px"><span style="position:absolute;left:-2px;top:-20px;padding:1px 6px;border-radius:5px 5px 5px 0;background:' + col + ';color:#12151A;font:600 11px/16px system-ui,sans-serif;white-space:nowrap">' + (p.editing ? name + ' ' + (L.isEditing || 'is editing') : name) + '</span></div>'; }
      var a = p.a, ael = a && cwFind(a.p);
      if (ael) { var ar = ael.getBoundingClientRect(); if (ar.width) html += '<div class="wdz-cw-ptr" data-cw-ptr="' + p.id + '" style="position:absolute;left:0;top:0;transform:translate(' + Math.round(ar.left + a.x * ar.width) + 'px,' + Math.round(ar.top + a.y * ar.height) + 'px)"><svg viewBox="0 0 16 20" width="16" height="20"><path d="M1 1l13 8-6 1.5L5 18z" fill="' + col + '" stroke="#12151A" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="position:absolute;left:13px;top:15px;padding:2px 7px;border-radius:6px;background:' + col + ';color:#12151A;font:600 12px/16px system-ui,sans-serif;white-space:nowrap">' + name + '</span></div>'; }
    });
    cwLayer.innerHTML = html;
  }
  addEventListener('message', function (e) { var d = e.data || {}; if (d.cw) { cwPeople = d.cw; cwDraw(); } });
  addEventListener('scroll', function () { if (cwPeople.length) cwDraw(); }, { passive: true });
  addEventListener('resize', function () { if (cwPeople.length) cwDraw(); });
  setInterval(function () { if (cwPeople.length) cwDraw(); }, 500);   // the page swaps in place when the design changes
  markItems();
  var w0 = wide(); post({ t: 'ready', sw: w0.sw, iw: w0.iw, wide: w0.wide });
})();
