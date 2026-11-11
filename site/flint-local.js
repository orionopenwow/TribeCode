/* Meet Flint, "no AI needed" (v0.28): cycles a few real phrasings through the parse card, typed in with their typos,
   then shows the steps Flint's local brain (app/ui/flintnlu.js) turns them into. Reduced motion: the first example
   stays as written in the HTML. */
(function () {
  'use strict';
  const box = document.querySelector('[data-flparse]'); if (!box) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const inp = box.querySelector('[data-flp-in]'), out = box.querySelector('[data-flp-out]');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const EX = [
    ['add a taks to order samples by fri and tell maya', [['Add task', '"Order samples" · due Friday'], ['Message', 'to Maya · "I added Order samples"']], 'one tap undoes both'],
    ['make me a link in bio for mara makes pots', [['Build', 'Link in bio template · "Mara Makes Pots"'], ['Open', 'the Easy editor: name, links, photos']], 'free from the website templates'],
    ['dark mode pls, and bigger text', [['Theme', 'dark'], ['Text size', 'Large']], 'one tap undoes both'],
    ['how do i invite a friend?', [['Answer', 'from the Guide: "Invite friends"'], ['Show', 'the Invite button, with Flint pointing at it']], 'answered from the docs, with the source'],
    ['put a playtest on the calendar thursday 7pm', [['Event', '"Playtest" · Thursday 7:00 PM'], ['Tell', 'the tribe in #general']], 'one tap undoes both'],
  ];
  let i = 0, seen = false, t = 0;
  function show(n) {
    const [said, steps, note] = EX[n];
    box.classList.add('is-wait'); inp.textContent = '';
    let k = 0;
    const reveal = () => {
      out.innerHTML = steps.map(([a, b], j) => `<p><b>${j + 1}</b><span>${esc(a)}</span><em>${esc(b)}</em></p>`).join('') + `<p class="fl-parse__note">Understood with no AI · ${esc(note)}</p>`;
      requestAnimationFrame(() => box.classList.remove('is-wait'));
      t = setTimeout(() => { if (seen) show(i = (i + 1) % EX.length); }, 3600);
    };
    const type = () => { k = Math.min(said.length, k + 1); inp.textContent = said.slice(0, k); if (k < said.length) t = setTimeout(type, 38); else t = setTimeout(reveal, 450); };
    type();
  }
  if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(es => { const was = seen; seen = es.some(e => e.isIntersecting); if (seen && !was) { clearTimeout(t); show(i); } }, { threshold: 0.3 }).observe(box);
})();
