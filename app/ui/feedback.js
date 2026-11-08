// Feedback and reviews (feat/reviews): a small card to rate TribeCode and say how it went. Sending opens a prefilled
// review on GitHub (.github/ISSUE_TEMPLATE/review.yml), so every review is public, real and linked; with the person's OK a
// maintainer quotes it on tribecode.org (site/reviews.json, docs/REVIEWS.md). Nothing is sent from the app itself.
// Where it shows: Flint's flame menu ("Rate TribeCode"), the ? menu, and once, gently, from Flint after someone has used
// TribeCode on five different days (never in the demo, tests, or while the welcome runs).
//   window.TribeFeedback = { open(), maybeAsk() }
(function () {
  'use strict';
  const REPO = 'https://github.com/orionopenwow/TribeCode/issues/new';
  const DAYS = 'tribecode.feedback.days', DONE = 'tribecode.feedback.done';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const LABEL = ['', '★☆☆☆☆ Didn\'t work for us', '★★☆☆☆ Not great', '★★★☆☆ Okay', '★★★★☆ Good', '★★★★★ Loved it'];
  function open() {
    close();
    const me = (window.TribeClient && window.TribeClient.state && window.TribeClient.state().me) || {};
    const ov = document.createElement('div'); ov.className = 'fb-ov'; ov.id = 'fb';
    ov.innerHTML = `<form class="fb-card" role="dialog" aria-modal="true" aria-labelledby="fb-t">
      <div class="fb-top"><img src="assets/flint.svg" alt="" width="36" height="36"><div><b id="fb-t">How's TribeCode going?</b><span>Two sentences help a lot, good or bad.</span></div><button type="button" class="fb-x" aria-label="Close">✕</button></div>
      <div class="fb-stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="false" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}<span class="fb-sl" id="fb-sl">Pick a rating</span></div>
      <textarea class="input fb-text" id="fb-text" rows="4" maxlength="1200" placeholder="What did you make, and how did it go? What should change?" required></textarea>
      <input class="input" id="fb-name" maxlength="60" placeholder="Name to show (first name or handle)" value="${esc(String(me.name || '').split(' ')[0])}">
      <label class="fb-ok"><input type="checkbox" id="fb-quote" checked> OK to quote this on tribecode.org</label>
      <p class="fb-how faint">Sending opens your review on GitHub, so it's public and linked. Only reviews people send themselves ever appear on the site.</p>
      <div class="fb-acts"><button type="button" class="btn ghost" data-later>Not now</button><button type="submit" class="btn primary" id="fb-go" disabled>Post my review</button></div>
    </form>`;
    document.body.appendChild(ov);
    let stars = 0;
    const $ = s => ov.querySelector(s), ready = () => { $('#fb-go').disabled = !(stars && $('#fb-text').value.trim().length >= 8); };
    ov.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { stars = +b.dataset.n; ov.querySelectorAll('[data-n]').forEach(x => { const on = +x.dataset.n <= stars; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(+x.dataset.n === stars)); }); $('#fb-sl').textContent = LABEL[stars].slice(6); ready(); });
    $('#fb-text').oninput = ready;
    $('.fb-x').onclick = close; $('[data-later]').onclick = () => { ls.set(DONE, 'later:' + Date.now()); close(); };
    ov.onclick = e => { if (e.target === ov) close(); };
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('form').onsubmit = e => {
      e.preventDefault(); if ($('#fb-go').disabled) return;
      const text = $('#fb-text').value.trim(), name = $('#fb-name').value.trim();
      const q = new URLSearchParams({ template: 'review.yml', title: `Review: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`, stars: LABEL[stars], review: text, name });
      if ($('#fb-quote').checked) q.set('consent', 'OK to quote this review, with the name above, on tribecode.org');
      const url = `${REPO}?${q}`;
      if (window.__TAURI__ && window.__TAURI__.opener) window.__TAURI__.opener.openUrl(url).catch(() => window.open(url, '_blank', 'noopener')); else window.open(url, '_blank', 'noopener');
      ls.set(DONE, 'sent:' + Date.now()); close();
      if (window.TribeApp && window.TribeApp.toast) window.TribeApp.toast('Thanks! Your review is open on GitHub: press Submit there to post it.');
    };
    setTimeout(() => { const b = ov.querySelector('[data-n="5"]'); if (b) b.focus(); }, 30);
  }
  function close() { const o = document.getElementById('fb'); if (o) o.remove(); }
  // a gentle, one-time ask from Flint after five different days of use
  function maybeAsk() {
    if (navigator.webdriver || /[?&](demo=|skipIntro|welcome)/.test(location.search) || (window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active())) return;
    if (ls.get(DONE, '')) return;
    const today = new Date().toISOString().slice(0, 10), days = ls.get(DAYS, []);
    if (!days.includes(today)) { days.push(today); ls.set(DAYS, days.slice(-10)); }
    if (days.length < 5) return;
    ls.set(DONE, 'asked:' + Date.now());
    setTimeout(() => { if (window.TribeFlint && window.TribeFlint.nudge) window.TribeFlint.nudge('You\'ve built with TribeCode on five days now. Would you leave a quick review? It helps other friend groups find it.', 'Rate TribeCode', 'feedback'); }, 8000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybeAsk); else setTimeout(maybeAsk, 0);
  window.TribeFeedback = { open, maybeAsk };
})();
