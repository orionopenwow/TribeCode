// Phones: the message bar rides up with the on-screen keyboard, the way the best chat apps do it.
// iPhone Safari doesn't shrink the page when the keyboard opens, so the composer would hide behind it: we size the app
// to the visible area (visualViewport), keep the page pinned, hide the bottom bar while typing, and keep the newest
// message in view. Android Chrome resizes the page itself (interactive-widget=resizes-content in index.html).
(function () {
  'use strict';
  const vv = window.visualViewport; if (!vv) return;
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const list = () => document.querySelector('#view-chat:not(.hidden) #chat-list, #dm-list:not(.hidden)');
  let wasOpen = false, nearBottom = true;
  const stick = () => { const l = list(); if (l && nearBottom) l.scrollTop = l.scrollHeight; };
  document.addEventListener('scroll', e => { const l = e.target; if (l && l.id === 'chat-list') nearBottom = l.scrollHeight - l.scrollTop - l.clientHeight < 120; }, true);
  function sync() {
    if (!phone()) { document.body.classList.remove('kb-open'); return; }
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop), open = kb > 120;
    document.documentElement.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    document.body.classList.toggle('kb-open', open);
    if (open) { if (window.scrollY) window.scrollTo(0, 0); if (!wasOpen) requestAnimationFrame(stick); }
    wasOpen = open;
  }
  vv.addEventListener('resize', sync); vv.addEventListener('scroll', sync);
  document.addEventListener('focusin', e => { if (e.target && e.target.id === 'chat-input') { nearBottom = true; setTimeout(() => { sync(); stick(); }, 250); } });
  document.addEventListener('focusout', () => setTimeout(sync, 150));
  // your own message always scrolls into view (even if you were reading older ones)
  document.addEventListener('submit', e => { if (e.target && e.target.id === 'chat-form') { nearBottom = true; setTimeout(stick, 120); setTimeout(stick, 600); } }, true);
  window.TribeKeyboard = { sync };
})();
// A tiny haptic tick for main actions on phones that support it (Android). Never on every tap: only primary buttons and Send.
(function () {
  if (!('vibrate' in navigator) || !matchMedia('(hover: none) and (pointer: coarse)').matches) return;
  document.addEventListener('pointerup', e => {
    const b = e.target && e.target.closest && e.target.closest('.btn.primary, .m2-send, #m2-send, #jw-hi, .ap-yes, .ap-no');
    if (b && !b.disabled) try { navigator.vibrate(6); } catch {}
  }, { passive: true });
})();
