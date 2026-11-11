/* "Design it, then build it" (v0.28): plays the Design canvas mock while it is on screen. Camp asks Flint for a sign-in
   screen, Flint lays it out layer by layer (his cursor shows where he works), the button gets selected and turned teal
   through the quick bar, then Send to app puts it in the project and the preview shows it. The four steps beside the
   mock light up as it goes, and clicking one jumps there. Everything is in the HTML already: no JS or reduced motion
   shows the final frame. */
(function () {
  'use strict';
  const fig = document.getElementById('dzw'); if (!fig) return;
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || !('IntersectionObserver' in window)) return;
  const win = fig.querySelector('.dzw__win');
  const beats = [...fig.querySelectorAll('[data-dz]')], layers = [...fig.querySelectorAll('[data-dzl]')];
  const steps = [...document.querySelectorAll('[data-dz-step]')];
  const typed = fig.querySelector('[data-dz-type]'), cur = fig.querySelector('.dzw__cur'), btn = fig.querySelector('.dzw__screen .dzw__btn'), send = fig.querySelector('.dzw__send');
  const PROMPTS = ['make a sign-in screen for Ember', 'make the button teal'];
  // when each beat happens (ms from the start) and which step it belongs to
  const AT = { 2: 1700, 3: 2200, 4: 4300, 5: 5900, 6: 7200, 7: 8600, 8: 9200 };
  const STEP_AT = [0, 2200, 5400, 8400], LOOP = 14500;
  let timers = [], on = false, playing = false;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  function step(n) { steps.forEach((s, i) => s.classList.toggle('is-on', i === n)); }
  function reset() {
    timers.forEach(clearTimeout); timers = [];
    beats.forEach(b => b.classList.remove('is-on', 'is-press')); layers.forEach(l => l.classList.remove('is-on'));
    win.classList.remove('is-teal'); btn && btn.classList.remove('is-sel');
    if (typed) typed.textContent = '';
    if (cur) { cur.style.left = '30%'; cur.style.top = '22%'; }
  }
  function type(text, from) { const per = 34; for (let i = 1; i <= text.length; i++) later(from + per * i, () => { typed.textContent = text.slice(0, i); }); return from + per * text.length; }
  function play(from = 0) {
    reset(); fig.classList.add('is-anim'); playing = true;
    const skip = ms => Math.max(0, ms - from);
    if (from > 0) {   // jumping to a step: everything before it has already happened
      for (const [n, t] of Object.entries(AT)) if (t <= from) beats.filter(b => +b.dataset.dz === +n).forEach(b => b.classList.add('is-on'));
      if (from > AT[3]) layers.forEach(l => l.classList.add('is-on'));
      if (from > AT[5]) btn && btn.classList.add('is-sel');
      if (from > AT[6]) win.classList.add('is-teal');
    }
    STEP_AT.forEach((t, i) => { if (t >= from) later(skip(t), () => step(i)); else if (STEP_AT[i + 1] == null || STEP_AT[i + 1] > from) step(i); });
    if (from < AT[2]) { type(PROMPTS[0], 300); }
    const go = (n, fn) => { if (AT[n] >= from) later(skip(AT[n]), () => { beats.filter(b => +b.dataset.dz === n).forEach(b => b.classList.add('is-on')); fn && fn(); }); };
    go(2, () => { typed.textContent = ''; });
    go(3, () => { layers.forEach((l, i) => later(320 * (i + 1), () => { l.classList.add('is-on'); if (cur) { cur.style.left = '55%'; cur.style.top = (26 + i * 11) + '%'; } })); });
    if (AT[5] - 1100 >= from) later(skip(AT[5] - 1100), () => { btn && btn.classList.add('is-sel'); type(PROMPTS[1], 0); });
    go(4);
    go(5, () => { typed.textContent = ''; });
    go(6, () => { win.classList.add('is-teal'); if (cur) cur.style.top = '78%'; });
    go(7, () => { send.classList.add('is-press'); later(260, () => send.classList.remove('is-press')); });
    go(8);
    later(skip(LOOP), () => { if (on) play(); else playing = false; });
  }
  steps.forEach((s, i) => { s.style.cursor = 'pointer'; s.addEventListener('click', () => play(STEP_AT[i])); });
  new IntersectionObserver(es => { on = es.some(e => e.isIntersecting); if (on && !playing) play(); }, { threshold: 0.12 }).observe(fig);

})();
