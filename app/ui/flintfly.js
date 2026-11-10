// Flint at work (v0.27.2): when Flint changes something, a small flame with a short label ("Opening", "Writing…",
// "Moving", "Editing", "Done ✓") glides to the place he's working on and outlines it with a quiet dashed ember line.
// When he's idle he flies home (the Flint panel's composer; the bottom rack on phones) and fades out.
//   TribeFlintFly.to(target, label)     glide to a target (element, selector, or { frame, rect } for a spot inside an iframe)
//   TribeFlintFly.work(target, label)   same, with a blinking "working" dot; stays until done()/home()
//   TribeFlintFly.done(target, label)   a last stop ("Done ✓" by default), then home after a moment
//   TribeFlintFly.home()                fly home now and fade out
//   TribeFlintFly.busy()                true while he's out working
//   TribeFlintFly.enabled() / .setEnabled(bool)   Settings › Flint "Show Flint moving around" (on by default)
// It never blocks clicks (pointer-events: none), follows scrolling and resizing, and jumps instead of gliding with
// reduced motion. Flat matte: a 1px ember pill and a dashed outline, no glow.
(function () {
  'use strict';
  const KEY = 'tribecode.flint.fly';
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const enabled = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
  let el = null, lab = null, cur = null, sel = null, working = false, homeT = 0, hideT = 0;

  function ensure() {
    if (el) return el;
    el = document.createElement('div'); el.className = 'ffly'; el.id = 'flint-fly'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<img src="assets/flint.svg" alt="" width="14" height="18"><span class="ffly-l">Flint</span>';
    document.body.appendChild(el); lab = el.querySelector('.ffly-l');
    // start at home so the first trip is a glide from Flint's corner
    const h = homeRect(); place(h ? h.left : innerWidth - 120, h ? h.top : innerHeight - 80, true);
    addEventListener('scroll', follow, true); addEventListener('resize', follow);
    return el;
  }
  const elOf = t => (typeof t === 'string' ? document.querySelector(t) : t);
  function rectOf(t) {
    if (!t) return null;
    if (t.frame && t.rect) {   // a spot inside an iframe: map its box through the frame (which may be scaled to fit)
      const f = elOf(t.frame); if (!f || !f.isConnected) return null; const fr = f.getBoundingClientRect(), r = t.rect, k = f.offsetWidth ? fr.width / f.offsetWidth : 1;
      return { left: fr.left + r.left * k, top: fr.top + r.top * k, width: r.width * k, height: r.height * k };
    }
    const e = elOf(t); if (!e || !e.getBoundingClientRect) return null;
    const r = e.getBoundingClientRect(); if (!r.width && !r.height) return null; return r;
  }
  function homeEl() {
    if (phone()) return document.querySelector('#tabbar') || document.querySelector('.flint-fab');
    return document.querySelector('#flint:not(.hidden) .fl-bar, #flint:not(.hidden)') || document.querySelector('#flint-full:not(.hidden) .ff-foot') || document.querySelector('.flint-fab');
  }
  function homeRect() {
    const h = homeEl(); const r = h && h.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return null;
    return phone() ? { left: r.right - 92, top: r.top - 34 } : { left: r.left + 6, top: r.top - 28 };
  }
  function place(x, y, instant) {
    const w = el.offsetWidth || 80;
    x = Math.max(6, Math.min(innerWidth - w - 6, x)); y = Math.max(6, Math.min(innerHeight - 30, y));
    if (instant || calm()) { el.classList.add('ffly-jump'); el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; void el.offsetWidth; el.classList.remove('ffly-jump'); }
    else el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  // the pill sits on the target's top-right corner, just outside it
  function aim(r) { place(r.left + r.width - (el.offsetWidth || 80) + 8, r.top - 26); }
  function follow() { if (!el || !cur) return; const r = rectOf(cur); if (r) aim(r); }
  function outline(t) {
    if (sel && sel !== t) sel.classList.remove('ffly-sel');
    sel = null;
    const e = t && !t.frame ? elOf(t) : null;   // inside the preview the page marks its own picked element
    if (e && e.classList && e !== document.body) { e.classList.add('ffly-sel'); sel = e; }
  }

  function to(t, label, opts) {
    if (!enabled()) return false;
    const r = rectOf(t); if (!r) return false;
    ensure(); clearTimeout(homeT); clearTimeout(hideT);
    lab.textContent = label || 'Flint';
    el.classList.toggle('ffly-sm', phone());
    el.classList.add('on'); el.classList.toggle('is-working', !!(opts && opts.working));
    working = !!(opts && opts.working);
    cur = t; aim(r); outline(t);
    if (!working) homeT = setTimeout(home, (opts && opts.stay) || 2600);
    return true;
  }
  function work(t, label) { return to(t, label || 'Working…', { working: true }); }
  function done(t, label) { const ok = to(t || cur, label || 'Done ✓', { stay: 1300 }); if (!ok) home(); return ok; }
  function home() {
    clearTimeout(homeT); clearTimeout(hideT); working = false;
    if (sel) sel.classList.remove('ffly-sel'); sel = null; cur = null;
    if (!el || !el.classList.contains('on')) return;
    el.classList.remove('is-working');
    const h = homeRect(); if (h) place(h.left, h.top);
    hideT = setTimeout(() => el && el.classList.remove('on'), calm() ? 0 : 900);
  }
  // a short pause so a glide reads before the real change lands (never more than a few hundred ms)
  const beat = (ms = 380) => new Promise(r => setTimeout(r, enabled() && !calm() ? ms : 0));

  window.TribeFlintFly = {
    to, work, done, home, beat,
    busy: () => !!(el && el.classList.contains('on') && cur),
    label: () => (el && el.classList.contains('on') ? lab.textContent : ''),
    enabled, setEnabled(b) { try { localStorage.setItem(KEY, b ? '1' : '0'); } catch {} if (!b) { home(); if (el) el.classList.remove('on'); } },
  };
})();
