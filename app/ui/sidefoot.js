// The sidebar's foot rows (feat/shell-polish): "Preview" and "Invite friends" are plain sidebar rows like Messages and
// Files, each with a small thumbnail on the left instead of an emoji.
//   Preview (#nest-preview, drawn by widgets.js): the project's latest picture, 40×28: the newest screenshot of the
//     running app, else the README picture or GitHub's card (GET /api/thumb, server/thumb.js, cached there). No live
//     iframe. With no picture yet it keeps the stroke icon. Refreshes when a screenshot or preview event arrives, when
//     the project changes and when the window comes back, at most every 15 seconds.
//   Invite friends (#tour-invite): up to three of the other members' avatars, then "+N"; alone, a dashed "add" circle.
//   window.TribeSideFoot = { refresh() }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = s => document.querySelector(s);
  const ico = (n, s = 20) => (window.TribeIcons ? window.TribeIcons.svg(n, s, 'i') : '');

  // ---------- Invite friends: a small stack of faces ----------
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  function face(m) {
    if (window.TribeProfiles && window.TribeProfiles.avatar) return window.TribeProfiles.avatar(m, 'sf-av');
    return `<span class="pf-av sf-av" style="background:${esc(m.color || 'var(--peer)')}">${esc(initials(m.name))}</span>`;
  }
  function faces() {
    const box = $('#sf-faces'); if (!box) return;
    const st = (C() && C().state()) || {}, me = st.me && st.me.id;
    const seen = new Set(), others = (st.members || []).filter(m => m && m.role !== 'agent' && !m.agent && m.id !== me && !seen.has(m.id) && seen.add(m.id));
    const html = others.length
      ? `${others.slice(0, 3).map(face).join('')}${others.length > 3 ? `<span class="sf-more">+${others.length - 3}</span>` : ''}`
      : `<span class="sf-add">${window.TribeIcons ? window.TribeIcons.svg('plus', 16) : '+'}</span>`;
    if (box.__h === html) return; box.__h = html; box.innerHTML = html;
    box.dataset.n = String(others.length);
    const row = $('#tour-invite'); if (row) row.title = others.length ? `Invite friends: ${others.length} other${others.length === 1 ? '' : 's'} here so far` : 'Invite friends: it\'s just you so far';
  }

  // ---------- Preview: the latest picture ----------
  let thumb = null, at = 0, forPid = null, inflight = null;
  const pid = () => (C() && C().state && (C().state().project || null)) || null;
  const srcOf = t => { if (!/^\//.test(t.src)) return t.src; const u = `${C().base()}${t.src}`; return window.TribeMedia ? window.TribeMedia.url(u) : u; };
  async function load(force) {
    if (!C() || !C().connected()) return null;
    const p = pid();
    if (!force && p === forPid && Date.now() - at < 15000) return thumb;
    if (inflight) return inflight;
    inflight = C().api('/thumb').then(r => { thumb = r.thumb || null; at = Date.now(); forPid = p; return thumb; }).catch(() => thumb).finally(() => { inflight = null; });
    return inflight;
  }
  function paintPreview() {
    const box = $('#nest-preview .sf-pv'); if (!box) return;
    const t = thumb && forPid === pid() && thumb.kind !== 'tile' && thumb.src ? thumb : null;
    const want = t ? 'img:' + t.src : 'icon';
    if (box.dataset.sf === want) return;
    if (!t) { box.dataset.sf = 'icon'; box.classList.remove('has-img'); box.innerHTML = ico('preview', 20); return; }
    const img = new Image(); img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.width = 40; img.height = 28;
    img.onload = () => { if (!box.isConnected) return; box.dataset.sf = want; box.classList.add('has-img'); box.replaceChildren(img); };
    img.onerror = () => { box.dataset.sf = 'icon'; };
    img.src = srcOf(t);
  }
  async function preview(force) { if (!$('#nest-preview')) return; await load(force); paintPreview(); }

  function refresh(force) { faces(); preview(force); }
  let timer = 0; const soon = (force) => { clearTimeout(timer); timer = setTimeout(() => refresh(force), 120); };
  function boot() {
    const c = C(); if (c && c.on) {
      c.on('presence', () => faces()); c.on('status', () => soon()); c.on('project', () => soon(true));
      c.on('ws', m => { if (m && /visual|screenshot|preview|thumb/i.test(m.type || '')) soon(true); });
    }
    addEventListener('focus', () => soon());
    const slot = $('#nest-preview-slot');   // widgets.js redraws the Preview row: paint its picture again
    if (slot) new MutationObserver(() => { if ($('#nest-preview') && !$('#nest-preview .sf-pv[data-sf]')) soon(); }).observe(slot, { childList: true, subtree: true });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.TribeSideFoot = { refresh: () => refresh(true) };
})();
