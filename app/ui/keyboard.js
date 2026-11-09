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
// Unsent drafts: what you were typing in a chat stays when you switch channels, DMs or projects, or reload.
(function () {
  const inp = () => document.getElementById('chat-input');
  const C = () => window.TribeClient;
  const key = () => { const c = C(), ch = window.TribeDM && window.TribeDM.current ? window.TribeDM.current() : 'general'; return `tribecode.draft:${c && c.project ? c.project() : ''}:${ch}`; };
  let curKey = null, t = null;
  const save = () => { const i = inp(); if (!i || !curKey) return; try { i.value.trim() ? localStorage.setItem(curKey, i.value.slice(0, 4000)) : localStorage.removeItem(curKey); } catch {} };
  function restore() {
    const i = inp(); if (!i) return;
    const k = key(); if (k === curKey) return;
    save(); curKey = k;
    let v = ''; try { v = localStorage.getItem(k) || ''; } catch {}
    if (document.activeElement !== i || !i.value) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  document.addEventListener('input', e => { if (e.target && e.target.id === 'chat-input') { clearTimeout(t); t = setTimeout(save, 300); } }, true);
  document.addEventListener('submit', e => { if (e.target && e.target.id === 'chat-form') { try { localStorage.removeItem(key()); } catch {} } }, true);
  setInterval(restore, 700);   // channel, DM or project changed: swap in that conversation's draft
  addEventListener('pagehide', save);
})();
