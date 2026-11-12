/* The gallery's filters (feat/site-showcase): All · Apps · Websites · Docs & company · Design · Games. The markup is the
   whole gallery (it reads with no JavaScript); this only hides the cards outside the chosen filter, remembers it in the
   address (#gallery/apps) and says how many show. Public: window.TribeGallery = { show(cat) }. */
(function () {
  'use strict';
  const box = document.getElementById('gallery'); if (!box) return;
  const btns = [...box.querySelectorAll('.gx__f')], cards = [...box.querySelectorAll('.gx__card')], count = document.getElementById('gx-count');
  const tr = s => (window.TribeLang && window.TribeLang.t ? window.TribeLang.t(s) : s);
  let cur = 'all';
  function show(cat) {
    cur = btns.some(b => b.dataset.f === cat) ? cat : 'all';
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === cur)));
    let n = 0; cards.forEach(c => { const on = cur === 'all' || c.dataset.cat === cur; c.hidden = !on; if (on) n++; });
    if (count) count.textContent = cur === 'all' ? '' : tr(n === 1 ? '1 thing to make' : '{n} things to make').replace('{n}', n);
  }
  box.querySelector('.gx__bar').addEventListener('click', e => {
    const b = e.target.closest('.gx__f'); if (!b) return;
    show(b.dataset.f);
    try { history.replaceState(history.state, '', cur === 'all' ? location.pathname + location.search + '#gallery' : '#gallery/' + cur); } catch {}
  });
  document.addEventListener('tribe-lang', () => show(cur));
  const fromHash = () => { const m = /^#gallery\/(\w+)/.exec(location.hash); if (m) { show(m[1]); box.scrollIntoView(); } return m; };
  if (!fromHash()) show('all');
  addEventListener('hashchange', fromHash);
  window.TribeGallery = { show };
})();
