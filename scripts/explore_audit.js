// The Explorer's in-page probes (scripts/explore.py injects this before any app script runs).
// window.__ex = { audit(), cands(scope), mark(), since(), cls() }: everything returns plain JSON for Python.
// Read-only: it never changes the app, it only looks (and counts DOM mutations + layout shifts).
(() => {
  if (window.__ex) return;
  let muts = 0, firstAt = 0, markAt = 0, cls = 0, clsSrc = [];
  const start = () => {
    new MutationObserver(list => {
      // Ignore our own probes and pure "time ago" text ticks inside <time> elements.
      const n = list.filter(m => !(m.target && m.target.closest && m.target.closest('time, .toast-x'))).length;
      if (!n) return;
      muts += n; if (!firstAt && markAt) firstAt = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  };
  if (document.documentElement) start(); else addEventListener('DOMContentLoaded', start);
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput && e.value > 0.001) { cls += e.value; (e.sources || []).slice(0, 2).forEach(s => s.node && clsSrc.push(desc(s.node.nodeType === 1 ? s.node : s.node.parentElement))); } })
      .observe({ type: 'layout-shift', buffered: true });
  } catch {}

  const W = () => innerWidth, H = () => innerHeight;
  function desc(el) {
    if (!el || !el.tagName) return '?';
    let s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    const cls = [...el.classList].filter(c => !/^(on|hidden|active|open|over|sel|show|in)$/.test(c)).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const anc = el.parentElement && el.parentElement.closest('[id]');
    return (anc ? '#' + anc.id + ' ' : '') + s;
  }
  const text = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
  function label(el) {
    const a = el.getAttribute('aria-label'); if (a) return a.trim().slice(0, 60);
    const lb = el.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(/\s+/).map(i => document.getElementById(i)).filter(Boolean).map(text).join(' '); if (t) return t.slice(0, 60); }
    const t = text(el); if (t) return t.slice(0, 60);
    if (el.title) return el.title.trim().slice(0, 60);
    const img = el.querySelector('img[alt]'); if (img && img.alt) return img.alt.slice(0, 60);
    if (el.value && el.tagName === 'INPUT') return String(el.value).slice(0, 60);
    return '';
  }
  function opacityChain(el) { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); o *= parseFloat(s.opacity); if (s.visibility === 'hidden' && e === el) return 0; } return o; }
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') return false;
    if (opacityChain(el) < 0.05) return false;
    if (r.right < 0 || r.left > W() || r.bottom < -2000) return false;
    const det = el.closest('details:not([open])'); if (det && !el.closest('summary')) return false;   // inside a closed <details>
    // clipped away by an overflow:hidden ancestor (closed drawers, collapsed rows)
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const pr = e.getBoundingClientRect();
      if (pr.width < 1 || pr.height < 1) return false;
      if (r.right <= pr.left + 1 || r.left >= pr.right - 1) return false;
      if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && (r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1)) return false;
    }
    return true;
  }
  const disabled = el => el.disabled || el.getAttribute('aria-disabled') === 'true' || !!el.closest('[inert], fieldset[disabled]');
  const regionOf = el => {
    const m = el.closest('.modal:not(.hidden), [role=dialog], [role=menu], .pf-menu, .float-menu, .sheet, #palette, .popover');
    if (m) return 'overlay:' + (m.id || [...m.classList][0] || m.getAttribute('role'));
    for (const id of ['win-ctl', 'tour-rail', 'pj-rail', 'nest', 'room-pane', 'preview-pane', 'tabbar', 'view-tabs']) if (el.closest('#' + id)) return id;
    if (el.closest('.titlebar, header.top, #crumbs')) return 'titlebar';
    const v = el.closest('[id^="view-"]'); if (v) return v.id;
    return 'page';
  };
  const DESTRUCTIVE = /\b(delete|remove|revoke|disconnect|close (the )?vote|end vote|sign ?out|log ?out|leave|reset|discard|kick|wipe|uninstall|stop hosting|forget|unpublish|archive|clear all|restart|relaunch|install|download backup|unpair|ban)\b/i;

  // Everything a curious user could click in `scope` (a CSS selector) or the whole page.
  function cands(scope) {
    const root = scope ? document.querySelector(scope) : document; if (!root) return [];
    const sel = 'button, a[href], [role=button], [role=menuitem], [role=tab], [role=switch], [role=option], summary, [data-nav], [data-go], [onclick]';
    const seen = new Set(), out = [];
    for (const el of root.querySelectorAll(sel)) {
      if (seen.has(el) || !visible(el) || disabled(el)) continue;
      { const r = el.getBoundingClientRect(); if (r.top >= 0 && r.bottom <= H() && r.left >= 0 && r.right <= W()) { const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue; } }
      if (el.closest('a, button') && el.closest('a, button') !== el && el.parentElement.closest(sel)) continue;   // nested clickable: the outer one counts
      seen.add(el);
      const l = label(el), href = el.getAttribute('href') || '';
      let external = false; try { external = !!href && !href.startsWith('#') && !href.startsWith('javascript') && new URL(href, location.href).origin !== location.origin; } catch {}
      const blob = `${l} ${el.title || ''} ${el.dataset.w || ''} ${el.className || ''}`;
      out.push({ label: l, desc: desc(el), region: regionOf(el), key: regionOf(el) + '|' + desc(el) + '|' + l, destructive: DESTRUCTIVE.test(blob) || el.dataset.w === 'close', external, download: el.hasAttribute('download'), file: el.matches('input[type=file]') });
    }
    return out;
  }
  function find(key) {
    const sel = 'button, a[href], [role=button], [role=menuitem], [role=tab], [role=switch], [role=option], summary, [data-nav], [data-go], [onclick]';
    for (const el of document.querySelectorAll(sel)) if (visible(el) && !disabled(el) && regionOf(el) + '|' + desc(el) + '|' + label(el) === key) return el;
    return null;
  }

  // ---------- color + contrast ----------
  function rgba(s) { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  function bgOf(el) {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) return null;   // over an image: can't judge
      const c = rgba(s.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    let base = { r: 18, g: 21, b: 26, a: 1 };   // canvas #12151A
    if (layers.length && layers[layers.length - 1].a >= 0.99) base = layers.pop();
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

  // ---------- one pass over what is on screen ----------
  function audit() {
    const issues = [], add = (kind, o) => issues.push({ kind, ...o });
    const doc = document.scrollingElement || document.documentElement;
    // 1. horizontal overflow of the page
    if (doc.scrollWidth > W() + 1) {
      const offenders = [];
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect(); if (r.right <= W() + 1 || r.width < 2 || !visible(el)) continue;
        if (el.parentElement && el.parentElement.getBoundingClientRect().right > W() + 1) continue;   // report the outermost
        offenders.push(desc(el) + ` (+${Math.round(r.right - W())}px)`); if (offenders.length >= 3) break;
      }
      add('h-overflow', { selector: offenders[0] || 'html', detail: `page is ${doc.scrollWidth}px wide in a ${W()}px viewport: ${offenders.join(', ')}` });
    }
    // 2. clipped / cut labels (no ellipsis on purpose)
    for (const el of document.querySelectorAll('button, a, [role=tab], [role=menuitem], label, h1, h2, h3, h4, .nest-row, .chip, .eyebrow')) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el); if (s.overflow === 'visible' && s.overflowX === 'visible') continue;
      const t = text(el); if (!t || t.length < 2) continue;
      const ell = s.textOverflow === 'ellipsis' || [...el.querySelectorAll('*')].some(c => getComputedStyle(c).textOverflow === 'ellipsis');
      if (ell) continue;
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) add('clipped-text', { selector: desc(el), label: t.slice(0, 50), detail: `text needs ${el.scrollWidth}px, box is ${el.clientWidth}px (cut without an ellipsis)` });
      else if (el.scrollHeight > el.clientHeight + 3 && el.clientHeight > 0 && (s.overflowY === 'hidden' || s.overflow === 'hidden')) add('clipped-text', { selector: desc(el), label: t.slice(0, 50), detail: `text needs ${el.scrollHeight}px tall, box is ${el.clientHeight}px` });
    }
    // 3. text that spills out of a fixed-size card
    // 4. clickables covered by another (small) element: the click lands on the wrong thing
    const big = e => { const r = e.getBoundingClientRect(); return r.width * r.height > W() * H() * 0.45; };
    for (const el of document.querySelectorAll('button, a[href], [role=button], [role=tab], input, textarea')) {
      if (!visible(el) || disabled(el)) continue;
      const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > H() || r.left < 0 || r.right > W() || r.width < 8 || r.height < 8) continue;
      const x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      const cover = hit.closest('.toast, .modal, [role=dialog], .sheet, .backdrop, .scrim, #palette, .pf-menu, .float-menu, [role=menu], .fwin, .tf-pop') || (big(hit) ? hit : null);
      if (cover) continue;   // an open overlay covers the page on purpose
      let overlay = false;
      for (let e = hit; e && e !== document.body; e = e.parentElement) { const ps = getComputedStyle(e).position; if ((ps === 'fixed' || ps === 'absolute') && big(e) && !e.contains(el)) { overlay = true; break; } }
      if (overlay) continue;   // a full-screen page (Workshop, preview on a phone) sits above the shell
      let sc = el.parentElement, reachable = false;
      for (; sc && sc !== document.body; sc = sc.parentElement) { const cs = getComputedStyle(sc); if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollHeight > sc.clientHeight + 2) { const sr = sc.getBoundingClientRect(); reachable = r.top < sr.top + 4 ? sc.scrollTop > 0 : sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2 || r.bottom > sr.bottom - 4 && sc.scrollTop > 0; break; } }
      if (reachable) continue;   // scrolled under a header or footer: scrolling the list reveals it
      add('obscured', { selector: desc(el), label: label(el), detail: `its center is covered by ${desc(hit)}` });
    }
    // 5. invisible but focusable (keyboard focus disappears into it)
    const groups = {};
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable=true]')) {
      if (el.disabled || el.tabIndex < 0 || el.closest('[inert]')) continue;
      if (el.closest('details:not([open])') && !el.closest('summary')) continue;
      const rects = el.getClientRects(); if (!rects.length) continue;   // display:none: not focusable, fine
      const s = getComputedStyle(el); if (s.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      let why = el.closest('[aria-hidden="true"]') ? 'inside aria-hidden' : opacityChain(el) < 0.05 ? 'opacity 0' : (r.right <= 0 || r.left >= W()) ? 'off-screen' : null;
      if (why === 'off-screen') { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2) { why = null; break; } } }   // in a sideways-scrolling board: scrolling reveals it
      if (why === 'opacity 0') {   // revealed on focus (:focus-within / :focus-visible)? then it is a keyboard-friendly hover control
        const prev = document.activeElement;
        const chain = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { chain.push([e, e.style.transition]); e.style.transition = 'none'; }   // read the end state, not a fade's first frame
        try { el.focus({ preventScroll: true }); if (opacityChain(el) > 0.5) why = null; } catch {}
        chain.forEach(([e, t]) => { e.style.transition = t; });
        try { if (prev && prev.focus) prev.focus({ preventScroll: true }); else el.blur(); } catch {}
      }
      if (!why) continue;
      const g = (el.parentElement && el.parentElement.closest('[id]') || { id: 'page' }).id + ' · ' + why;
      (groups[g] = groups[g] || []).push(label(el) || desc(el));
    }
    for (const [g, list] of Object.entries(groups)) add('focus-trap', { selector: '#' + g.split(' · ')[0], detail: `${list.length} focusable control(s) are not visible (${g.split(' · ')[1]}): ${list.slice(0, 4).join(', ')}` });
    // 6. contrast (normal text < 4.5:1, large text < 3:1)
    const seenC = new Set();
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim().length > 1 ? 1 : 2 });
    let n, count = 0;
    while ((n = tw.nextNode()) && count < 900) {
      const el = n.parentElement; if (!el || seenC.has(el)) continue; seenC.add(el); count++;
      if (!/[A-Za-z0-9\u00C0-\u024F]/.test(n.nodeValue)) continue;   // emoji and symbols ignore CSS color
      if (el.closest('svg, script, style, [aria-hidden="true"], code.hl, .kbd') || disabled(el) || el.closest('button[disabled], .disabled')) continue;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > H()) continue;
      const s = getComputedStyle(el), fg = rgba(s.color); if (!fg) continue;
      const bg = bgOf(el); if (!bg) continue;
      const f = over({ ...fg, a: fg.a * Math.min(1, opacityChain(el)) }, bg), cr = ratio(f, bg);
      const px = parseFloat(s.fontSize), large = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
      const need = large ? 3 : 4.5;
      if (cr < need) add('contrast', { selector: desc(el), label: text(el).slice(0, 40), detail: `${cr.toFixed(2)}:1 (${hex(f)} on ${hex(bg)}, ${px}px) needs ${need}:1`, ratio: +cr.toFixed(2), fg: hex(f), bg: hex(bg) });
    }
    // 7. icon-only buttons with no accessible name
    for (const el of document.querySelectorAll('button, a[href], [role=button]')) {
      if (!visible(el)) continue;
      if (!label(el)) add('no-label', { selector: desc(el), detail: 'icon-only control with no aria-label, title or text' });
    }
    // 8. the same label twice in one navigation
    for (const nav of document.querySelectorAll('#pj-nav, #nest-groups, nav, [role=tablist], #view-tabs, [role=menu], #tabbar')) {
      if (!visible(nav)) continue;
      const seen = {};
      for (const el of nav.querySelectorAll('button, a, [role=tab], [role=menuitem]')) {
        if (!visible(el)) continue;
        const t = (text(el).split('\n')[0] || '').toLowerCase().replace(/\d+$/, '').trim(); if (!t) continue;
        seen[t] = (seen[t] || 0) + 1;
      }
      for (const [t, c] of Object.entries(seen)) if (c > 1) add('dup-label', { selector: desc(nav), label: t, detail: `"${t}" appears ${c}× in the same navigation` });
    }
    // 9. empty states with no next action
    for (const el of document.querySelectorAll('[class*="empty"], [class*="-none"], .faint')) {
      if (!visible(el)) continue;
      const t = text(el); if (!t || t.length > 200) continue;
      if (!/^(no |nothing|none|empty|not yet|.*\byet\b)/i.test(t) && !/empty|none/.test(el.className)) continue;
      const near = [el, el.parentElement, el.parentElement && el.parentElement.parentElement].filter(Boolean);
      if (near.some(x => [...x.querySelectorAll('button, a[href], input, textarea')].some(b => visible(b) && !disabled(b)))) continue;
      add('empty-dead-end', { selector: desc(el), label: t.slice(0, 80), detail: 'empty state with no button or link next to it' });
    }
    // 10. a visible view that rendered nothing
    for (const v of document.querySelectorAll('[id^="view-"]:not(.hidden)')) {
      if (!visible(v) || v.id === 'view-tabs') continue;
      if (text(v).length < 8 && !v.querySelector('button, input, textarea, canvas, img, iframe')) add('blank-view', { selector: '#' + v.id, detail: 'the view is visible but empty' });
    }
    return { issues, cls: +cls.toFixed(3), clsSrc: [...new Set(clsSrc)].slice(0, 3), view: document.body.dataset.view || '', w: W(), h: H() };
  }

  window.__ex = {
    audit, cands, find, label, desc, visible,
    mark() { muts = 0; firstAt = 0; markAt = performance.now(); },
    since() { return { muts, first: firstAt ? Math.round(firstAt - markAt) : null }; },
    resetCls() { cls = 0; clsSrc = []; },
    overlay() { return [...document.querySelectorAll('.modal:not(.hidden), [role=dialog]:not(.hidden), .pf-menu:not(.hidden), [role=menu]:not(.hidden), #palette:not(.hidden), .sheet.open, .float-menu, .tf-pop')].filter(visible).map(desc); },
  };
})();
