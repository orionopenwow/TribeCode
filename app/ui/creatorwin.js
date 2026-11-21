// The window stays a window (v0.44): in the desktop app a full-screen creator (App Creator, the website designer, Motion
// Studio, the Launch kit, the first preview) covers the title bar, so its top bar carries the same minimize, maximize and
// close buttons, and is the strip you drag the window by. A sheet's scrim covers the title bar too: while one is up, a
// floating copy of the three buttons sits exactly over the title bar's own.
//
// Nothing to call: any top bar at the top of the window holding the shared Back button (creatorshell.js backHTML, [data-cs="back"]) gets them.
// The buttons press the title bar's own (#win-ctl, wired once in app.js): one behaviour, two places.
// Public: window.TribeCreatorWin = { isDesktop, sync }
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? (window.TribeI18n.t(s, s) || s) : s);
  const isDesktop = () => document.body.classList.contains('tauri') || document.body.classList.contains('app-window');

  function lights() {
    const el = document.createElement('div'); el.className = 'win-ctl cw-win';   // .win-ctl: the title bar's own look (styles.css)
    el.setAttribute('role', 'group'); el.setAttribute('aria-label', tr('Window'));
    el.innerHTML = `<button type="button" data-cw="min" class="tl tl-min" title="${esc(tr('Minimize'))}" aria-label="${esc(tr('Minimize'))}"><svg viewBox="0 0 12 12"><path d="M3 6h6"/></svg></button>
      <button type="button" data-cw="max" class="tl tl-max" title="${esc(tr('Maximize'))}" aria-label="${esc(tr('Maximize'))}"><svg viewBox="0 0 12 12"><path d="M3.6 8.4V4.8l3.6 3.6zM8.4 3.6v3.6L4.8 3.6z" fill="currentColor" stroke="none"/></svg></button>
      <button type="button" data-cw="close" class="tl tl-close" title="${esc(tr('Close'))}" aria-label="${esc(tr('Close'))}"><svg viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg></button>`;
    return el;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-cw]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const real = document.querySelector(`#win-ctl [data-w="${b.dataset.cw}"]`); if (real) real.click();
  }, true);
  document.addEventListener('dblclick', e => {   // double-click on the bar's empty strip maximizes, as on the title bar
    if (window.__TAURI__ || !isDesktop() || !e.target.hasAttribute || !e.target.hasAttribute('data-cw-bar')) return;
    const real = document.querySelector('#win-ctl [data-w="max"]'); if (real) real.click();
  });

  const bars = () => [...document.querySelectorAll('[data-cs="back"]')].map(b => b.parentElement).filter(Boolean);
  let floatEl = null, busy = false;
  function sync() {
    if (busy) return; busy = true;
    try {
      const desk = isDesktop(), seen = new Set();
      for (const bar of bars()) {
        seen.add(bar);
        const had = bar.querySelector(':scope > .cw-win'), r = bar.getBoundingClientRect();
        if (desk && r.height && r.top < 4) {   // the bar is where the title bar was (a full-screen tool); a sheet with a margin gets the floating copy
          if (!bar.hasAttribute('data-cw-bar')) { bar.setAttribute('data-cw-bar', ''); bar.setAttribute('data-tauri-drag-region', ''); }
          if (!had) bar.appendChild(lights());
          else if (had !== bar.lastElementChild) bar.appendChild(had);   // a tool that adds to its bar later keeps them last
        } else if (had) { had.remove(); seen.delete(bar); }
      }
      document.querySelectorAll('[data-cw-bar]').forEach(b => { if (!seen.has(b) || !desk) { b.removeAttribute('data-cw-bar'); b.removeAttribute('data-tauri-drag-region'); const w = b.querySelector(':scope > .cw-win'); if (w) w.remove(); } });
      // under a sheet: one floating copy over the title bar's own, unless a creator's bar is showing them already
      const real = document.getElementById('win-ctl');
      const covered = !!document.querySelector('body > .ui-scrim, body > .ui-veil, body > .lch-scrim');
      const shown = [...document.querySelectorAll('.cw-win:not(.cw-float)')].some(w => w.getClientRects().length);
      const r = desk && real && covered && !shown ? (real.querySelector('[data-w]') || real).getBoundingClientRect() : null;
      if (!r || !r.width) { if (floatEl) { floatEl.remove(); floatEl = null; } }
      else {
        if (!floatEl) { floatEl = lights(); floatEl.classList.add('cw-float'); document.body.appendChild(floatEl); }
        floatEl.style.top = Math.round(r.top + r.height / 2) + 'px'; floatEl.style.left = Math.round(r.left) + 'px';
      }
    } finally { busy = false; }
  }
  let t = 0; const later = () => { if (!t) t = requestAnimationFrame(() => { t = 0; sync(); }); };
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(ms => { if (ms.some(m => m.type === 'attributes' || [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && n !== floatEl && !(n.classList && n.classList.contains('cw-win'))))) later(); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', later);
  }
  window.TribeCreatorWin = { isDesktop, sync };
})();
