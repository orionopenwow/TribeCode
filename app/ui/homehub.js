// Home's Messages and previews (feat/p10-home). Two calm sections on the personal home (hub.js gives them slots):
//   · "Being made": one card per project with its preview picture (the dashboard band's own drawing, no live frames),
//     its name, what it is, who changed it and when, Open preview and Open. Lazy: the first few, then more on scroll.
//   · "Messages": the newest line of every conversation you can read across your projects (GET /api/hub/inbox): the
//     project's face or the person, the channel, the last line, the time, an unread dot. Click opens it; Reply sends from
//     the row. Offline: the last list this device saw, marked offline. Only your own DMs ever come back from the server.
// Public: window.TribeHomeHub = { mount(slotPreviews, slotMessages), refresh() }
(function () {
  'use strict';
  const C = window.TribeClient;
  const PJ = () => window.TribeProjects, DB = () => window.TribeDashBand, App = () => window.TribeApp;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, sz = 14) => `<svg class="i" style="width:${sz}px;height:${sz}px"><use href="#${id}"/></svg>`;
  const t = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const toast = (m, k) => App() && App().toast(m, k);
  const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return t('just now'); if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`; return new Date(at).toLocaleDateString(); };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const meId = () => ((C.state() || {}).me || {}).id || '';
  const IK = () => `tribecode.homeInbox:${C.base()}:${meId()}`, SEEN = 'tribecode.homeSeen.v1', DMREAD = 'tribecode.dmRead.v1';

  let rows = null, fromCache = false, cards = new Map(), slots = { p: null, m: null }, openReply = '';

  // ---------- data ----------
  async function loadInbox() {
    if (!C.hasToken()) { rows = []; return; }
    if (C.connected()) {
      try { const r = await C.api('/hub/inbox'); rows = r.rows || []; fromCache = false; ls.set(IK(), rows); return; } catch {}
    }
    rows = ls.get(IK(), []) || []; fromCache = true;
  }
  const seenAt = ch => { const a = (ls.get(SEEN, {}) || {})[ch] || '', b = (ls.get(DMREAD, {}) || {})[ch] || ''; return a > b ? a : b; };
  const markSeen = (ch, at) => { const s = ls.get(SEEN, {}) || {}; s[ch] = at || new Date().toISOString(); ls.set(SEEN, s); };
  const unread = r => !r.mine && r.last && String(r.last.at) > String(seenAt(r.channel));

  // ---------- previews ----------
  function projectsNow() { const l = (PJ() && PJ().list()) || []; return l.length ? l : (PJ() && PJ().cachedList ? PJ().cachedList() : []); }
  function cardHtml(p, c) {
    const face = PJ() && PJ().face ? PJ().face(p, 'sm') : '';
    const by = c && c.updated && c.updated.at ? `${c.updated.byName ? esc(c.updated.byName) + ' · ' : ''}${esc(ago(c.updated.at))}` : '';
    const pic = c ? (c.pick === 'none' || !c.pic ? `<div class="hh-pic-empty">${ico('i-sparkle', 18)}<span>${t('Nothing to preview yet')}</span></div>` : c.pic) : '<div class="hh-pic-load" aria-hidden="true"></div>';
    const sketch = !!c && c.pick === 'sketch';   // living preview: only a sentence so far; the dashboard has "Make it real"
    const canOpen = c && c.pick && c.pick !== 'none' && !sketch;
    if (c && !canOpen && !sketch) return `<article class="hh-card hh-card-sm" data-hh-pid="${esc(p.id)}"><button type="button" class="hh-sm" data-hh-go="open">${face}<span class="hh-tx"><b>${esc(p.name)}</b><small>${t('Nothing to preview yet')}</small></span>${ico('i-chev', 14)}</button></article>`;   // nothing to show: one compact row
    return `<article class="hh-card" data-hh-pid="${esc(p.id)}">
      <button type="button" class="hh-pic${sketch ? ' hh-sketch' : ''}" data-hh-go="${canOpen ? 'preview' : 'open'}" aria-label="${esc(canOpen ? t('Open the preview of') + ' ' + p.name : t('Open') + ' ' + p.name)}">${pic}</button>
      <div class="hh-meta">${face}<div class="hh-tx"><b>${esc(p.name)}</b><small>${c && c.kind ? esc(t(c.kind)) + (by ? ' · ' : '') : ''}${by}</small></div></div>
      <div class="hh-acts">${sketch ? `<button type="button" class="btn sm primary" data-hh-go="open">${ico('i-sparkle', 13)}${t('See the sketch')}</button>` : canOpen ? `<button type="button" class="btn sm primary" data-hh-go="preview">${ico('i-play', 13)}${t('Open preview')}</button>` : ''}${sketch ? '' : `<button type="button" class="btn sm" data-hh-go="open">${t('Open')}</button>`}</div></article>`;
  }
  const rank = c => !c ? 1 : c.pick && c.pick !== 'none' ? 2 : 0;   // previews first, then loading, then the empty ones
  function drawPreviews() {
    const el = slots.p; if (!el) return;
    const list = projectsNow();
    if (!C.hasToken() || !list.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<section class="sec hub-sec hh-prev" id="hh-prev" aria-labelledby="hh-prev-t">
      <div class="sec-head"><span class="eyebrow">${t('Your projects')}</span><h2 id="hh-prev-t">${t('What you’re making')}</h2></div>
      <div class="hh-strip" id="hh-strip">${list.slice(0, 12).map(p => [p, cards.get(p.id)]).sort((a, b) => rank(b[1]) - rank(a[1])).map(([p, c]) => cardHtml(p, c)).join('')}</div></section>`;
    el.querySelectorAll('.hh-card').forEach(bindCard);
    if (C.connected()) lazyCards(el);
  }
  function bindCard(card) {
    const pid = card.dataset.hhPid;
    card.querySelectorAll('[data-hh-go]').forEach(b => b.onclick = async () => {
      if (b.dataset.hhGo === 'preview' && DB() && DB().open) { try { await DB().open(pid, 'open'); return; } catch {} }
      if (PJ() && PJ().switchTo) PJ().switchTo(pid, 'home');
    });
  }
  let io = null;
  function lazyCards(el) {
    if (io) io.disconnect();
    const load = async node => {
      const pid = node.dataset.hhPid; if (!pid || node.__hh) return; node.__hh = 1;
      const c = DB() && DB().card ? await DB().card(pid).catch(() => null) : null;
      if (!c) return; const was = cards.get(pid); c.at = Date.now(); cards.set(pid, c);
      const p = projectsNow().find(x => x.id === pid) || c.project;
      if (!node.isConnected || !p) return;
      const tmp = document.createElement('div'); tmp.innerHTML = cardHtml(p, c); const fresh = tmp.firstElementChild;
      fresh.__hh = 1; node.replaceWith(fresh); bindCard(fresh);
      if ((!was || was.pick !== c.pick) && projectsNow().slice(0, 12).every(x => cards.has(x.id))) drawPreviews();   // all in: previews first (a card looked at again redraws only when it changed)
    };
    const fresh = pid => { const c = cards.get(pid); return !!c && Date.now() - (c.at || 0) < (c.pick === 'none' ? 3000 : 15000); };   // living preview: a card is looked at again after a while, so Home and the dashboard agree
    const nodes = [...el.querySelectorAll('.hh-card')].filter(n => !fresh(n.dataset.hhPid));
    if (!('IntersectionObserver' in window)) { nodes.slice(0, 6).forEach(load); return; }
    io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }), { rootMargin: '200px' });
    nodes.forEach(n => io.observe(n));
  }

  // ---------- messages ----------
  function who(r) {
    if (r.kind === 'dm') {
      const n = (r.title || '?').trim();
      return `<span class="hh-av${r.agent ? ' ai' : ''}" style="${r.color ? `background:${esc(r.color)}` : ''}">${r.agent ? ico('i-sparkle', 13) : esc(([...n][0] || '?').toUpperCase())}</span>`;
    }
    const p = projectsNow().find(x => x.id === r.project);
    return p && PJ() && PJ().face ? PJ().face(p, 'sm') : `<span class="hh-av">#</span>`;
  }
  function rowHtml(r, i) {
    const where = r.kind === 'dm' ? `<b>${esc(r.title)}</b>` : `<b>${esc(r.projectName || '')}</b><span class="hh-ch">${esc(r.title)}</span>`;
    const line = `${r.mine ? `<span class="faint">${t('You')}: </span>` : r.kind === 'dm' ? '' : `<span class="hh-by">${esc(r.last.name)}: </span>`}${esc(r.last.enc ? t('New message') : String(r.last.text || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)[*_`](\S[^*_`]*?)[*_`](?=\s|$)/g, '$1$2'))}`;   // feat/p12-e2ee: a private message shows no words here
    const u = unread(r);
    return `<li class="hh-row${u ? ' unread' : ''}${r.mention ? ' mention' : ''}" data-i="${i}">
      <button type="button" class="hh-open" data-hh-open="${i}">${who(r)}<span class="hh-main"><span class="hh-top">${where}${r.mention ? `<span class="hh-at">@${t('you')}</span>` : ''}<time datetime="${esc(r.last.at)}">${esc(ago(r.last.at))}</time></span><span class="hh-line">${line}</span></span>${u ? '<i class="hh-dot" aria-label="Unread"></i>' : ''}</button>
      <button type="button" class="hh-reply-b" data-hh-reply="${i}" aria-label="${esc(t('Reply'))}" title="${esc(t('Reply'))}">${ico('i-chat', 14)}</button>
      ${openReply === r.channel ? `<form class="hh-reply" data-hh-form="${i}"><input class="input" maxlength="2000" placeholder="${esc(t('Reply to') + ' ' + (r.kind === 'dm' ? r.title : r.title))}" aria-label="${esc(t('Reply'))}"><button class="btn sm primary" type="submit">${t('Send')}</button></form>` : ''}</li>`;
  }
  function drawMessages() {
    const el = slots.m; if (!el) return;
    if (!C.hasToken()) { el.innerHTML = ''; return; }
    const list = rows || [];
    const n = list.filter(unread).length;
    const body = rows === null ? `<div class="hh-empty faint">${t('Loading…')}</div>`
      : !list.length ? `<p class="hh-empty-line faint">${ico('i-chat', 14)}${t('No messages yet. When someone writes in one of your projects, it shows here.')}</p>`
      : `<ul class="hh-list" id="hh-list">${list.slice(0, 20).map(rowHtml).join('')}</ul>`;
    el.innerHTML = `<section class="sec hub-sec hh-msgs" id="hh-msgs" aria-labelledby="hh-msgs-t">
      <div class="sec-head hh-mhead"><span class="eyebrow">${t('Messages')}${n ? ` · ${n} ${t('new')}` : ''}</span><h2 id="hh-msgs-t">${t('Latest from your projects')}</h2>${fromCache && list.length ? `<span class="hh-off">${t('Saved on this device')}</span>` : ''}</div>
      ${window.TribeMeetings ? window.TribeMeetings.nextLine() : ''}${body}</section>`;
    el.querySelectorAll('[data-hh-open]').forEach(b => b.onclick = () => go(list[+b.dataset.hhOpen]));
    el.querySelectorAll('[data-hh-reply]').forEach(b => b.onclick = () => { const r = list[+b.dataset.hhReply]; openReply = openReply === r.channel ? '' : r.channel; drawMessages(); const f = el.querySelector('.hh-reply input'); if (f) f.focus(); });
    el.querySelectorAll('[data-hh-form]').forEach(f => f.onsubmit = e => { e.preventDefault(); reply(list[+f.dataset.hhForm], f.querySelector('input')); });
  }
  async function go(r) {
    if (!r) return;
    markSeen(r.channel, r.last && r.last.at);
    if (r.kind === 'dm') { if (window.TribeDM && window.TribeDM.open) return window.TribeDM.open(r.with); return; }
    if (PJ() && PJ().switchTo && C.project && C.project() !== r.project) await PJ().switchTo(r.project, 'chat');
    else if (App()) App().show('chat');
    const custom = r.title !== '#general';
    if (custom && window.TribeDM && window.TribeDM.openChannel) setTimeout(() => window.TribeDM.openChannel(r.channel), 120);
    else if (window.TribeDM && window.TribeDM.back && window.TribeDM.current && window.TribeDM.current() !== 'general') window.TribeDM.back();
  }
  async function reply(r, inp) {
    const text = (inp.value || '').trim(); if (!text || !r) return;
    const same = !r.project || (C.project && C.project() === r.project);
    const path = '/chat/' + (r.kind !== 'dm' && r.title === '#general' && same ? 'general' : r.channel);
    inp.disabled = true;
    try {
      const seal = b => (r.kind === 'dm' && window.TribeE2E ? window.TribeE2E.seal(r.channel, b) : Promise.resolve(b));   // feat/p12-e2ee: a private reply is sealed before it leaves
      if (C.connected()) await C.api(path, { method: 'POST', body: await seal({ text, cid: C.newId ? C.newId() : undefined }), project: r.project || undefined });
      else if (same && C.queue && r.kind === 'dm') C.queue(path, await seal({ text, cid: C.newId ? C.newId() : undefined }), { kind: 'chat', ch: r.channel });
      else if (same && C.queue) C.queue(path, { text, cid: C.newId ? C.newId() : undefined }, { kind: 'chat', ch: r.kind === 'dm' ? r.channel : 'general', label: text });
      else { toast(t('Your tribe is offline. Open the project to write there: it sends when the tribe is back.')); inp.disabled = false; return; }
      openReply = ''; markSeen(r.channel); toast(C.connected() ? t('Sent') : t('Waiting to send'), 'ok');
      refresh(true);
    } catch (e) { inp.disabled = false; toast(e.message || String(e), 'err'); }
  }

  // ---------- mount ----------
  let busy = null, lastAt = 0;
  async function refresh(force) {
    if (busy) return busy;
    if (!force && Date.now() - lastAt < 4000 && rows) { drawMessages(); drawPreviews(); return; }
    busy = (async () => { await loadInbox(); lastAt = Date.now(); drawMessages(); drawPreviews(); })().finally(() => { busy = null; });
    return busy;
  }
  function mount(p, m) {
    slots = { p, m };
    drawPreviews(); drawMessages();
    refresh();
  }
  // live: a new message anywhere you can read redraws the list (cheaply, a moment later)
  let rt; const soon = () => { clearTimeout(rt); rt = setTimeout(() => { if (slots.m && slots.m.isConnected) refresh(true); }, 600); };
  C.on('chat', soon);
  C.on('status', () => { if (slots.m && slots.m.isConnected) refresh(true); });
  addEventListener('tribe-projects-loaded', () => { if (slots.p && slots.p.isConnected) { cards.clear(); drawPreviews(); } });

  window.TribeHomeHub = { mount, refresh };
})();
