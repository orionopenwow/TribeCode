// Shared UI helpers (feat/ui-consistent). The rules live in uikit.css; this file holds the two that need code.
//
//   TribeUI.empty(el, { title, line, action: { label, run }, how: { label, run }, center, bare, kind })
//     One empty state everywhere: a title, one line, one action, and an optional "How it works" link.
//     If nothing passes an action, a provider can offer one for that kind of place:
//       TribeUI.emptyAction = (kind, el) => ({ label, run }) | null      // set by the "what next" engine
//   TribeUI.emptyHTML(opts) -> the same thing as a string, for templates (buttons carry data-ui-empty="act|how";
//     call TribeUI.bindEmpty(el, opts) after inserting it).
//   TribeUI.layers() -> the sheets and panels open right now, topmost last.
//   One Esc rule: Esc closes the topmost open sheet or panel. Features keep their own handlers; this is the safety
//     net for the ones that have none (the chat's Details panel, one-off sheets), so no layer is left ignoring Esc.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);

  function emptyHTML(o) {
    o = o || {};
    const act = o.action || (typeof TribeUI.emptyAction === 'function' ? TribeUI.emptyAction(o.kind || '', null) : null);
    // Optional, for places that already have hooks: cls (extra classes), id, icon (trusted svg), tag ('li' inside a
    // list), action.attr (extra attributes on the button, e.g. 'data-goto-browse'), action.quiet (not the page's main action).
    const tag = o.tag === 'li' ? 'li' : 'div';
    return `<${tag} class="ui-empty${o.center ? ' center' : ''}${o.bare ? ' bare' : ''}${o.cls ? ' ' + esc(o.cls) : ''}"${o.id ? ` id="${esc(o.id)}"` : ''} data-ui-kind="${esc(o.kind || '')}">
      ${o.icon ? `<span class="ui-empty-ic" aria-hidden="true">${o.icon}</span>` : ''}${o.title ? `<b>${esc(tr(o.title))}</b>` : ''}${o.line ? `<p>${esc(tr(o.line))}</p>` : ''}
      ${act || o.how ? `<div class="ui-empty-acts">${act ? `<button type="button" class="btn ${act.quiet ? 'sm' : 'primary'}" data-ui-empty="act"${act.attr ? ' ' + act.attr : ''}>${esc(tr(act.label))}</button>` : ''}${o.how ? `<button type="button" class="linkish" data-ui-empty="how">${esc(tr(o.how.label || 'How it works'))}</button>` : ''}</div>` : ''}
    </${tag}>`;
  }
  function bindEmpty(el, o) {
    if (!el) return;
    o = o || {};
    const act = o.action || (typeof TribeUI.emptyAction === 'function' ? TribeUI.emptyAction(o.kind || '', el) : null);
    const a = el.querySelector('[data-ui-empty="act"]'), h = el.querySelector('[data-ui-empty="how"]');
    if (a && act && act.run) a.onclick = () => act.run();
    if (h && o.how && o.how.run) h.onclick = () => o.how.run();
  }
  function empty(el, o) { if (!el) return null; el.innerHTML = emptyHTML(o); bindEmpty(el, o); return el.firstElementChild; }

  // ---------- sheets: one header, one close, one scrim, one way in and out ----------
  //   TribeUI.sheet({ kind: 'steps' | 'decision', eyebrow, title, body (html or node), foot (html or node), id, wide,
  //                   onClose }) -> { el, scrim, body, foot, close(), setTitle(t) }
  //     'steps' is the bottom-sheet family (a bottom sheet on phones, a centred card on wider screens); 'decision'
  //     is the centred modal. Esc and a click on the scrim close it; Tab stays inside; focus returns where it was.
  //   TribeUI.adopt(card, { scrim, kind, onClose, trap }) -> { close() }
  //     For a sheet that draws its own box (the free-AI bridge, plans, History, Flint's page, website templates):
  //     it keeps its contents and takes the shared scrim colour, the way in, Esc, the focus trap and the way out.
  //   TribeUI.dismiss(nodes, done): the one way out. Plays the short leave on every node, then calls done().
  //     Nothing moves under reduced motion; automated browsers skip the wait so tests stay exact (as TribeMotion does).
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OUT_MS = 140;   // --dur-quick
  const still = () => reduced() || (navigator.webdriver && !/[?&]uimotion=1/.test(location.search));
  if (still()) document.documentElement.classList.add('ui-still');   // uikit.css: no leave motion
  function dismiss(nodes, done) {
    nodes = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
    if (still()) { if (done) done(); return; }
    nodes.forEach(n => n.classList.add('ui-out'));
    setTimeout(() => { nodes.forEach(n => n.classList.remove('ui-out')); if (done) done(); }, OUT_MS);
  }
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function trapTab(card, e) {
    if (e.key !== 'Tab') return;
    const f = [...card.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function adopt(card, o) {
    o = o || {};
    if (!card) return { close() {} };
    card.classList.add('ui-sheet', o.kind === 'decision' ? 'ui-decision' : 'ui-steps');
    if (o.scrim) o.scrim.classList.add('ui-veil');
    if (card.__uiAdopted) return card.__uiAdopted;
    const close = () => { if (o.onClose) o.onClose(); };
    if (o.trap !== false) card.addEventListener('keydown', e => trapTab(card, e));
    card.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); close(); } });
    return (card.__uiAdopted = { close });
  }
  function sheet(o) {
    o = o || {};
    const back = document.activeElement;
    const scrim = document.createElement('div'); scrim.className = 'ui-scrim';
    const el = document.createElement('div'); el.className = 'ui-card' + (o.wide ? ' wide' : ''); if (o.id) el.id = o.id;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.tabIndex = -1;
    const hid = 'ui-h-' + Math.random().toString(36).slice(2, 8); el.setAttribute('aria-labelledby', hid);
    el.innerHTML = `<header class="ui-h"><div>${o.eyebrow ? `<span class="eyebrow">${esc(tr(o.eyebrow))}</span>` : ''}<h3 id="${hid}">${esc(tr(o.title || ''))}</h3></div><button type="button" class="ui-x" aria-label="${esc(tr('Close'))}"><svg class="ti-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header><div class="ui-body"></div><footer class="ui-foot" hidden></footer>`;
    const body = el.querySelector('.ui-body'), foot = el.querySelector('.ui-foot');
    const put = (box, v) => { if (v == null) return; if (typeof v === 'string') box.innerHTML = v; else box.appendChild(v); box.hidden = false; };
    put(body, o.body); put(foot, o.foot);
    let open = true;
    const close = () => {
      if (!open) return; open = false;
      dismiss([el, scrim], () => { el.remove(); scrim.remove(); if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true }); });
      if (o.onClose) o.onClose();
    };
    scrim.onclick = close; el.querySelector('.ui-x').onclick = close;
    adopt(el, { scrim, kind: o.kind, onClose: close });
    document.body.append(scrim, el);
    setTimeout(() => { const f = el.querySelector('.ui-body ' + FOCUSABLE.split(', ').join(', .ui-body ')) || el; f.focus({ preventScroll: true }); }, 30);
    return { el, scrim, body, foot, close, setTitle: t => { el.querySelector('h3').textContent = tr(t); } };
  }

  // ---------- one Esc rule ----------
  // Layers Esc should close when their own code did not. Each entry: a selector, and how to close it.
  const click = sel => el => { const b = el.querySelector(sel); if (b) { b.click(); return true; } return false; };
  const LAYERS = [
    ['#frun', () => { if (window.TribeFlintRun && window.TribeFlintRun.active && window.TribeFlintRun.active()) { window.TribeFlintRun.stop(); return true; } return false; }],
    ['#info-panel, #pins-panel', el => { el.remove(); return true; }],
    ['.ui-card', click('.ui-x')],
    ['.modal:not(.hidden)', click('[data-close]')],
    ['.plp-scrim, .pm-scrim, .aib-scrim, .ab-scrim, .ac-scrim, .ad-scrim, .lg-scrim, .mk-scrim, .pp-scrim, .pf-scrim, .tl-scrim, .nx-scrim, .pl-scrim, .dfl-scrim',
      el => click('[data-close], [aria-label="Close"], .x, [class$="-x"]')(el) || (el.click(), true)],
  ];
  const shown = el => { if (!el || el.hidden) return false; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  function layers() {
    const out = [];
    for (const [sel, close] of LAYERS) document.querySelectorAll(sel).forEach(el => { if (shown(el)) out.push({ el, close }); });
    return out;
  }
  // Runs last (window, bubble). If a feature's own handler already dealt with the key (it called preventDefault, or
  // the layer is gone a tick later), nothing happens here.
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
    const before = layers(); if (!before.length) return;
    const top = before[before.length - 1];
    setTimeout(() => { if (shown(top.el) && document.contains(top.el)) top.close(top.el); }, 0);
  });

  const TribeUI = window.TribeUI = { empty, emptyHTML, bindEmpty, layers, sheet, adopt, dismiss, emptyAction: null };
})();
