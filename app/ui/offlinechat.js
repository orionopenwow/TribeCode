// Offline messages (p7). When the tribe can't be reached (the host's computer is off or asleep, or the network dropped):
//   - Messages shows one calm line above the composer: who is off, and how many messages are waiting to send;
//   - the tribe's circles in the rail and the phone drawer get a small dot (body.tribe-off), the icons stay full colour;
//   - messages waiting in the outbox (tribe.js) are drawn again after a reload or a channel switch, so nothing looks lost;
//   - a small picture or voice note waits in the outbox too (under 2 MB); a bigger one says plainly it needs the tribe.
// The message itself always goes through TribeClient.queue (the outbox): it sends in order when the tribe is back, and the
// server drops a repeat by its client id.
// Public: window.TribeOfflineChat = { queueMedia(ch, path, body, label, bytes) -> boolean, waiting(), paint() }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (t, v) => { let s = window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(t, t) || t : t; if (v) for (const k in v) s = s.split('{' + k + '}').join(v[k]); return s; };
  const ico = n => (window.TribeIcons ? window.TribeIcons.svg(n, 14, 'ofc-ico') : '');
  const MAX = 2 * 1024 * 1024;
  const chatKind = it => it && (it.kind === 'chat' || it.kind === 'chat-media');
  const waiting = () => (C.outbox ? C.outbox() : []).filter(chatKind);
  const curCh = () => (window.TribeDM && window.TribeDM.current ? window.TribeDM.current() : (window.TribeChannels && window.TribeChannels.current ? window.TribeChannels.current() : 'general')) || 'general';
  const me = () => (C.state && C.state().me) || {};

  // Offline = a member of a tribe whose server isn't answering. A short grace so a quick reconnect never flashes the bar.
  let off = false, graceT = null;
  function offNow() { const s = C.state && C.state().status; return !!(C.hasToken && C.hasToken()) && s && s !== 'online'; }
  function hostName() {
    const ms = (C.state && C.state().members) || [], h = ms.find(m => m.role === 'host');
    return h && h.id !== me().id ? String(h.name || '').split(' ')[0] : '';
  }
  function line() {
    const n = waiting().length, host = hostName();
    const who = me().role === 'host' || !host ? tr('Your tribe is offline') : tr("{name}'s computer is off or asleep", { name: host });
    const tail = n ? (n === 1 ? tr('1 message will send when it’s back') : tr('{n} messages will send when they’re back', { n })) : tr('Messages will send when it’s back');
    return `${ico('cloud')}<span><b>${esc(who)}</b> · ${esc(tail)}</span>`;
  }
  function paint() {
    document.body.classList.toggle('tribe-off', off);
    document.querySelectorAll('.pj-circle, #rail-logo').forEach(el => { if (off) el.setAttribute('data-off-tip', '1'); else el.removeAttribute('data-off-tip'); });
    const form = $('#chat-form'); if (!form) return;
    let bar = $('#chat-offline');
    if (!off) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'chat-offline'; bar.className = 'chat-offline'; bar.setAttribute('role', 'status'); form.parentNode.insertBefore(bar, form); }
    bar.innerHTML = line();
    const rl = $('#rail-logo'); if (rl) rl.title = tr('Your tribe is offline');
  }
  function sync() {
    clearTimeout(graceT);
    if (!offNow()) { off = false; paint(); return; }
    graceT = setTimeout(() => { off = offNow(); paint(); }, 2500);
  }
  C.on('status', sync);
  C.on('outbox', () => { if (off) paint(); redraw(); });
  C.on('presence', () => { if (off) paint(); });

  // ---------- waiting messages drawn again (after a reload, or switching back to the channel) ----------
  let rdT = null, drawing = false;
  function redraw() {
    clearTimeout(rdT);
    rdT = setTimeout(() => {
      const list = $('#chat-list'), App = window.TribeApp; if (!list || !App || !App.pendingBubble) return;
      const ch = curCh();
      drawing = true;
      try {
        for (const it of waiting()) {
          const cid = it.body && it.body.cid; if (!cid || (it.ch || 'general') !== ch) continue;
          if (list.querySelector(`[data-cid="${CSS.escape(cid)}"]`)) continue;
          App.pendingBubble(it.kind === 'chat-media' ? (it.label || tr('Picture')) : (it.body.text || ''), cid, C.connected() ? 'sending' : 'waiting');
        }
      } finally { drawing = false; }
    }, 80);
  }
  function watchList() {
    const list = $('#chat-list'); if (!list || list.dataset.ofc) return;
    list.dataset.ofc = '1';
    new MutationObserver(() => { if (!drawing && waiting().length) redraw(); }).observe(list, { childList: true });
  }

  // ---------- a picture or voice note while offline ----------
  // Returns true when it's queued (or sent by the outbox right away); false when the caller should send it itself.
  function queueMedia(ch, path, body, label, bytes) {
    if (C.connected()) return false;
    if (!(C.hasToken && C.hasToken())) return false;
    if ((bytes || 0) > MAX) { if (window.TribeApp && window.TribeApp.toast) window.TribeApp.toast(tr('That’s over 2 MB, so it needs your tribe online. Try again when it’s back.')); return true; }
    const cid = C.newId(); C.queue(path, { ...body, cid }, { kind: 'chat-media', ch, label });
    if (window.TribeApp && window.TribeApp.pendingBubble && ch === curCh()) window.TribeApp.pendingBubble(label, cid, 'waiting');
    return true;
  }

  function boot() { watchList(); sync(); redraw(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 1500);   // the chat list can be built after this file runs
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-nav="chat"], [data-view="chat"], .ch-row, .dm-row')) setTimeout(redraw, 300); }, true);

  window.TribeOfflineChat = { queueMedia, waiting, paint: () => { sync(); redraw(); } };
})();
