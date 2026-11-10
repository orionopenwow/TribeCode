/* "Everything in one place" (v0.27): tabs for Docs, Flint, Widgets, Studios and Games & apps. Each panel's mock plays its
   beats ([data-k] 1..n) one after another, then the next tab opens. Plays only while on screen; a click on a tab stops the
   auto-advance. Reduced motion: every beat shown, no auto-advance. Arrow keys move between tabs. */
(function () {
  'use strict';
  const box = document.querySelector('[data-kit]'); if (!box) return;
  const tabs = [...box.querySelectorAll('.kit__tab')], panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = 0, auto = !still, visible = false, timer = 0, beat = 0;
  function show(i, focus) {
    cur = (i + tabs.length) % tabs.length;
    tabs.forEach((t, j) => { const on = j === cur; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; panels[j].hidden = !on; });
    const bar = tabs[cur].parentElement, t = tabs[cur]; if (bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: t.offsetLeft - (bar.clientWidth - t.offsetWidth) / 2, behavior: still ? 'auto' : 'smooth' });
    if (focus) tabs[cur].focus();
    play();
  }
  function play() {
    clearTimeout(timer); const mock = panels[cur].querySelector('.kit__mock'); if (!mock) return;
    const steps = [...mock.querySelectorAll('[data-k]')], max = Math.max(0, ...steps.map(s => +s.dataset.k));
    if (still) { steps.forEach(s => s.classList.add('is-on')); return; }
    mock.classList.add('is-play'); steps.forEach(s => s.classList.remove('is-on')); beat = 0;
    const tick = () => {
      if (!visible) { timer = setTimeout(tick, 400); return; }
      beat++; steps.forEach(s => { if (+s.dataset.k <= beat) s.classList.add('is-on'); });
      if (beat < max) timer = setTimeout(tick, 900);
      else if (auto) timer = setTimeout(() => show(cur + 1), 3200);
    };
    timer = setTimeout(tick, 350);
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => { auto = false; show(i); });
    t.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); auto = false; show(cur + (e.key === 'ArrowRight' ? 1 : -1), true); } });
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); }, { threshold: .25 }).observe(box);
  else visible = true;
  show(0);
})();

// Remix gallery: "Show all" opens the rest of the cards.
(function () { const b = document.querySelector('[data-rx-all]'); if (!b) return; const n = document.querySelectorAll('.rx__card').length; b.textContent = 'Show all ' + n;
  b.addEventListener('click', () => { const rx = b.closest('.rx'); rx.classList.add('is-all'); b.setAttribute('aria-expanded', 'true'); const c = rx.querySelectorAll('.rx__card')[6]; if (c) { const a = c.querySelector('a'); if (a) a.focus({ preventScroll: true }); } }); })();
