// In-app browser escape (join.html, go.html). Links tapped inside Messenger, Instagram, Facebook, TikTok,
// Snapchat, LINE, X, LinkedIn or Discord open in that app's own browser, which can't add TribeCode to the
// Home Screen, loses the sign-in, and often blocks the mic and notifications. Show a slim banner that says how
// to get out: Android jumps straight to Chrome; iPhone copies the link and points at "•••  →  Open in browser".
// Flat matte: surface + 1px border, Ember for the one action. Public: window.TribeInApp = { inApp, app, show }.
(function () {
  'use strict';
  const UA = navigator.userAgent || '';
  const APPS = [
    [/FBAN\/Messenger|MessengerForiOS|MessengerLite|\bOrca-Android/i, 'Messenger'],
    [/Instagram/i, 'Instagram'],
    [/FBAN|FBAV|FB_IAB|FBIOS|\[FB/i, 'Facebook'],
    [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
    [/Snapchat/i, 'Snapchat'],
    [/\bLine\//i, 'LINE'],
    [/Twitter|\bX\/\d/i, 'X'],
    [/LinkedInApp/i, 'LinkedIn'],
    [/Discord/i, 'Discord'],
    [/\bGSA\//i, 'the Google app'],
  ];
  const hit = APPS.find(([re]) => re.test(UA));
  const forced = /[?&#]inapp=1\b/.test(location.search + location.hash);
  const inApp = !!hit || forced, app = hit ? hit[1] : 'this app';
  const ios = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(UA);
  const browser = ios ? 'Safari' : android ? 'Chrome' : 'your browser';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CSS = `
  .tc-inapp { position: fixed; top: 0; left: 0; right: 0; z-index: 90; box-sizing: border-box; background: #1B2028; border-bottom: 1px solid #2A313C; color: #94A3B8;
    padding: calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 10px) 10px calc(env(safe-area-inset-left) + 12px);
    font: 14px/1.4 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; animation: tc-ia-in .2s ease-out; }
  .tc-inapp .row { display: flex; align-items: center; gap: 10px; }
  .tc-inapp .ic { width: 30px; height: 30px; border-radius: 8px; background: #F26B1D; color: #fff; display: grid; place-items: center; flex: none; }
  .tc-inapp .t { flex: 1; min-width: 0; }
  .tc-inapp .t b { display: block; color: #F8FAFC; font-size: 14px; font-weight: 600; }
  .tc-inapp .t small { display: block; font-size: 12.5px; margin-top: 1px; }
  .tc-inapp .t .dots { color: #F8FAFC; font-weight: 700; letter-spacing: 1px; }
  .tc-inapp .go { min-height: 38px; padding: 0 12px; border-radius: 9px; border: 1px solid #F26B1D; background: #F26B1D; color: #fff; font: 600 13.5px Inter, system-ui, sans-serif; white-space: nowrap; flex: none; cursor: pointer; }
  .tc-inapp .x { width: 36px; height: 36px; border-radius: 9px; border: 0; background: none; color: #94A3B8; display: grid; place-items: center; flex: none; cursor: pointer; padding: 0; }
  .tc-inapp .link { display: none; width: 100%; margin-top: 8px; height: 40px; border-radius: 9px; border: 1px solid #2A313C; background: #12151A; color: #F8FAFC; font-size: 16px; padding: 0 10px; }
  .tc-inapp.show-link .link { display: block; }
  @keyframes tc-ia-in { from { transform: translateY(-100%); } }
  @media (prefers-reduced-motion: reduce) { .tc-inapp { animation: none; } }`;

  function show() {
    if (!inApp || document.getElementById('tc-inapp')) return;
    try { if (sessionStorage.getItem('tribecode.inappOff') === '1') return; } catch {}
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const url = location.href.replace(/([?&#])inapp=1\b&?/, '$1').replace(/[?#&]$/, '');
    const b = document.createElement('div'); b.className = 'tc-inapp'; b.id = 'tc-inapp'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Open in ' + browser);
    const how = android ? `${esc(app)}'s browser can't install TribeCode. Open this page in Chrome.`
      : `Tap <span class="dots">•••</span> then <b style="display:inline;font-size:inherit">Open in ${esc(browser)}</b>, or copy the link and paste it there.`;
    b.innerHTML = `<div class="row"><span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></span>
      <div class="t"><b>Open in ${esc(browser)}</b><small>${how}</small></div>
      <button class="go" id="tc-ia-go" type="button">${android ? 'Open' : 'Copy link'}</button>
      <button class="x" id="tc-ia-x" type="button" aria-label="Dismiss"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <input class="link" id="tc-ia-link" readonly value="${esc(url)}" aria-label="Link to this page">`;
    document.body.prepend(b);
    const pad = getComputedStyle(document.body).paddingTop;   // keep the page below the fixed banner
    const fit = () => { if (b.isConnected) document.body.style.paddingTop = `calc(${pad} + ${b.offsetHeight}px)`; };
    fit(); addEventListener('resize', fit); new MutationObserver(fit).observe(b, { attributes: true, attributeFilter: ['class'] });
    b.querySelector('#tc-ia-x').onclick = () => { b.remove(); document.body.style.paddingTop = ''; try { sessionStorage.setItem('tribecode.inappOff', '1'); } catch {} };
    b.querySelector('#tc-ia-go').onclick = async () => {
      if (android) { location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=${url.startsWith('https') ? 'https' : 'http'};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`; return; }
      const btn = b.querySelector('#tc-ia-go');
      try { await navigator.clipboard.writeText(url); btn.textContent = 'Copied'; }
      catch { b.classList.add('show-link'); const i = b.querySelector('#tc-ia-link'); i.focus(); i.select(); btn.textContent = 'Select'; }
    };
  }
  window.TribeInApp = { inApp, app, browser, show };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
