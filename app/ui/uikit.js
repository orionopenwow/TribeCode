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
    return `<div class="ui-empty${o.center ? ' center' : ''}${o.bare ? ' bare' : ''}" data-ui-kind="${esc(o.kind || '')}">
      <b>${esc(tr(o.title || ''))}</b>${o.line ? `<p>${esc(tr(o.line))}</p>` : ''}
      ${act || o.how ? `<div class="ui-empty-acts">${act ? `<button type="button" class="btn primary" data-ui-empty="act">${esc(tr(act.label))}</button>` : ''}${o.how ? `<button type="button" class="linkish" data-ui-empty="how">${esc(tr(o.how.label || 'How it works'))}</button>` : ''}</div>` : ''}
    </div>`;
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

  // ---------- one Esc rule ----------
  // Layers Esc should close when their own code did not. Each entry: a selector, and how to close it.
  const click = sel => el => { const b = el.querySelector(sel); if (b) { b.click(); return true; } return false; };
  const LAYERS = [
    ['#frun', () => { if (window.TribeFlintRun && window.TribeFlintRun.active && window.TribeFlintRun.active()) { window.TribeFlintRun.stop(); return true; } return false; }],
    ['#info-panel, #pins-panel', el => { el.remove(); return true; }],
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

  const TribeUI = window.TribeUI = { empty, emptyHTML, bindEmpty, layers, emptyAction: null };
})();
