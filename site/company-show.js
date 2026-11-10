/* Company section (v0.27): plays the "Lantern Games" company mock and the three explainers on the home page.
   The mock is a script of steps: each standup line types in while its seat lights up, the Money tiles count up, an
   approval arrives and a person approves it, then the weekly review lands in the Inbox. The explainers cycle through
   their beats with one caption each. Everything is in the HTML already (no JS, reduced motion and screen readers get
   the final frame); this only hides what hasn't happened yet and plays it while the section is on screen. */
(function () {
  'use strict';
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cs = document.getElementById('cs');
  const cards = [...document.querySelectorAll('.bx__card[data-bx]')];
  if (still || !('IntersectionObserver' in window)) return;   // the final frame is the static page

  // ---------- the company mock ----------
  if (cs) {
    const steps = [...cs.querySelectorAll('[data-cs]')];
    const seats = Object.fromEntries([...cs.querySelectorAll('[data-seat]')].map(s => [s.dataset.seat, s]));
    const typed = [...cs.querySelectorAll('[data-type]')].map(el => ({ el, text: el.textContent }));
    const counts = [...cs.querySelectorAll('[data-count]')];
    const ask = cs.querySelector('.cs__ask');
    const NOW = { ceo: 'Writing to the standup…', build: 'Posting an update…', grow: 'Posting an update…', run: 'Posting an update…' };
    const setNow = (who, txt) => { const n = seats[who] && seats[who].querySelector('.cs__now'); if (n) n.textContent = txt || n.dataset.now; };
    // when each step happens (ms from the start); 7 is the person pressing Approve
    const AT = { 1: 600, 2: 2900, 3: 5200, 4: 7300, 5: 9200, 6: 11000, 7: 13100, 8: 14600 };
    const LOOP = 20000;
    let timers = [], on = false, playing = false;
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      steps.forEach(s => s.classList.remove('is-on'));
      Object.values(seats).forEach(s => s.classList.remove('is-talk', 'is-done')); Object.keys(seats).forEach(k => setNow(k));
      typed.forEach(t => { t.el.textContent = ''; });
      counts.forEach(c => { c.textContent = (c.dataset.pre || '') + '0'; });
      ask && ask.classList.remove('is-approved');
    }
    function type(t, ms) {
      const n = t.text.length, per = Math.max(14, Math.min(32, ms / n));
      for (let i = 1; i <= n; i++) later(per * i, () => { t.el.textContent = t.text.slice(0, i); });
      return per * n;
    }
    function count(c) {
      const to = +c.dataset.count, pre = c.dataset.pre || '', N = 18;
      for (let i = 1; i <= N; i++) later(i * 50, () => { c.textContent = pre + Math.round(to * (1 - Math.pow(1 - i / N, 3))); });
    }
    function play() {
      reset(); cs.classList.add('is-anim'); playing = true;
      steps.forEach(s => {
        const n = +s.dataset.cs;
        later(AT[n], () => {
          s.classList.add('is-on');
          const who = s.dataset.for, t = typed.find(x => s.contains(x.el));
          if (who && seats[who]) {
            Object.values(seats).forEach(x => x.classList.remove('is-talk'));
            seats[who].classList.add('is-talk'); setNow(who, NOW[who]);
            const d = t ? type(t, 1500) : 0;
            later(d + 250, () => { seats[who].classList.remove('is-talk'); seats[who].classList.add('is-done'); setNow(who); });
          }
          if (s.classList.contains('cs__money')) s.querySelectorAll('[data-count]').forEach(count);
        });
      });
      later(AT[7], () => ask && ask.classList.add('is-approved'));
      later(LOOP, () => { if (on) play(); else playing = false; });
    }
    new IntersectionObserver(es => {
      on = es.some(e => e.isIntersecting);
      if (on && !playing) play();
    }, { threshold: 0.35 }).observe(cs);
    reset(); cs.classList.add('is-anim');
  }

  // ---------- the explainers ----------
  cards.forEach((card, k) => {
    const max = +card.dataset.bx, parts = [...card.querySelectorAll('[data-b]')], caps = [...card.querySelectorAll('.bx__cap')];
    let beat = 0, timer = null;
    card.classList.add('is-anim');
    // step dots under the caption, one per beat
    const dots = document.createElement('span'); dots.className = 'bx__dots'; dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = caps.map(() => '<i></i>').join(''); card.appendChild(dots);
    function show(n) {
      beat = n; card.dataset.beat = n;
      parts.forEach(p => p.classList.toggle('is-on', +p.dataset.b <= n));
      caps.forEach((c, i) => c.classList.toggle('is-on', i === n - 1));
      [...dots.children].forEach((d, i) => d.classList.toggle('is-on', i === n - 1));
    }
    const tick = () => show(beat >= max ? 1 : beat + 1);
    show(1);
    let vis = false;
    new IntersectionObserver(es => {
      vis = es.some(e => e.isIntersecting);
      if (vis && !timer) setTimeout(() => { if (vis && !timer) timer = setInterval(tick, 2600); }, k * 500);
      else if (!vis && timer) { clearInterval(timer); timer = null; }
    }, { threshold: 0.4 }).observe(card);
  });
})();
