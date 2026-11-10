/* "One chat for people and their ___." — the last word rolls through Claude, Gemini and Codex. The slot's width glides
   to fit each word so the full stop follows smoothly. Pauses off screen; reduced motion shows "Claude" only. */
(function () {
  'use strict';
  const box = document.querySelector('[data-aiswap]'); if (!box) return;
  const words = [...box.querySelectorAll('.aiswap__w')];
  let i = 0, on = false, t = 0;
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fit = () => { box.style.width = words[i].offsetWidth + 'px'; };
  function show(n, first) {
    const prev = words[i]; i = n;
    words.forEach((w, j) => w.classList.toggle('is-on', j === i));
    if (!first && prev !== words[i]) { prev.classList.add('is-out'); setTimeout(() => prev.classList.remove('is-out'), 600); }
    fit();
  }
  show(0, true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  addEventListener('resize', fit);
  if (still) return;
  const tick = () => { clearTimeout(t); t = setTimeout(() => { if (on) show((i + 1) % words.length); tick(); }, 2200); };
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { on = es.some(e => e.isIntersecting); }).observe(box); else on = true;
  tick();
})();
