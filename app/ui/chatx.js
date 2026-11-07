// Chat messages, richer: one renderer for #general and DMs with replies, forwards, reactions, pins,
// edited/deleted states, voice notes (hold the composer mic), pasted images, domain-only link chips,
// an unread divider, jump-to-latest, and "delivered / read" for your own agent's channel.
// Actions live in a small per-message "…" menu (hover, focus, or long-press on touch).
// Reactions sit on the bubble: a quick-react bar on hover (long-press on touch, with the menu below it),
// a picker for the rest, double-click/double-tap = 👍, "+👍" in an empty composer and Ctrl/⌘ Shift \ react
// to the latest message. Vote cards render through app/ui/votes.js (TribeVotes.card).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient, S = window.TribeStore;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#38C6B1', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');
  const EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '✅', '🔥', '👎', '❌', '🙏', '💯', '🚀', '🤔', '😮', '😢', '👏', '🙌', '⭐', '💡', '🐛', '📌', '➕', '🎮', '✨'];   // same list as server/chatx.js
  const QUICK = EMOJI.slice(0, 6);
  const ALIAS = { '1': '👍', '+1': '👍', '-1': '👎', ok: '✅', yes: '✅', check: '✅', heart: '❤️', love: '❤️', lol: '😂', tada: '🎉', party: '🎉', eyes: '👀', fire: '🔥', pin: '📌', bug: '🐛', rocket: '🚀', idea: '💡', thanks: '🙏', star: '⭐' };
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prevRx = new Map();        // id -> { emoji: count } as last drawn, so only changed chips animate
  const SEEN = 'tribecode.lastSeen.v1';
  const pad = n => String(n).padStart(2, '0');
  const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toast = t => window.TribeApp && window.TribeApp.toast(t);

  const msgs = new Map();          // id -> { m, ch }
  const pinsBy = new Map();        // channel -> [messages]
  const receipts = new Map();      // channel -> { agent, at }
  let reply = null, lastSeen = {};
  try { lastSeen = JSON.parse(localStorage.getItem(SEEN) || '{}'); } catch {}

  const me = () => (C.state().me || {}).id;
  const member = id => (C.state().members || []).find(m => m.id === id);
  const nameOf = id => (id === 'tribecode' ? 'TribeCode' : id === 'brain' ? 'Local Brain' : (member(id) || {}).name || 'someone');
  const colorOf = id => (member(id) || {}).color || '#6C7CFF';
  const cur = () => (window.TribeDM ? window.TribeDM.current() : 'general');
  const listFor = ch => (ch === 'general' ? $('#chat-list') : $('#dm-list'));
  const token = () => (S.get().server && S.get().server.token) || '';
  const mediaUrl = (ch, f) => `${C.base()}/api/chat/${encodeURIComponent(ch)}/media/${encodeURIComponent(f)}?token=${encodeURIComponent(token())}`;
  const textOf = m => m.text || (m.media ? (m.media.kind === 'voice' ? 'Voice note' : 'Image') : '');
  const dur = s => { s = Math.round(Number(s) || 0); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

  // ---------- icons (added to the page's sprite) ----------
  const ICONS = {
    'i-reply': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
    'i-fwd': '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v5"/>',
    'i-copy': '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    'i-pin': '<path d="M12 17v5M8 3h8l-1 7 3 3v2H6v-2l3-3z"/>',
    'i-trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    'i-edit': '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    'i-more': '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
    'i-play': '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
    'i-pause': '<path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" stroke="none"/>',
    'i-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    'i-chev': '<path d="m6 9 6 6 6-6"/>',
    'i-back': '<path d="M15 6l-6 6 6 6"/>',
    'i-smile-plus': '<path d="M20.9 13A9 9 0 1 1 11 3.1"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/><path d="M16 5h6M19 2v6"/>',
    'i-vt-yes': '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    'i-vt-no': '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8.5"/>',
  };
  function addIcons() {
    const sprite = document.querySelector('svg[aria-hidden="true"]'); if (!sprite || sprite.querySelector('#i-reply')) return;
    sprite.insertAdjacentHTML('beforeend', Object.entries(ICONS).map(([k, v]) => `<symbol id="${k}" viewBox="0 0 24 24">${v}</symbol>`).join(''));
  }
  const icon = (k, cls = '') => `<svg class="i ${cls}"><use href="#${k}"/></svg>`;

  // ---------- rendering ----------
  function linkChips(text) {
    const seen = new Set(), out = [];
    for (const u of String(text || '').match(/https?:\/\/[^\s<>()]+/g) || []) {
      let host; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch { continue; }
      if (!seen.has(host) && out.length < 3) { seen.add(host); out.push(`<a class="lp" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${icon('i-link')}${esc(host)}</a>`); }
    }
    return out.length ? `<div class="lps">${out.join('')}</div>` : '';
  }
  function voiceHtml(m, ch) {
    const w = m.media.wave && m.media.wave.length ? m.media.wave : Array.from({ length: 28 }, (_, i) => 3 + ((i * 7) % 5));
    return `<div class="vn" data-src="${esc(mediaUrl(ch, m.media.file))}"><button class="vn-play" aria-label="Play voice note">${icon('i-play')}</button>
      <div class="vn-wave" aria-hidden="true">${w.map(v => `<i style="height:${18 + Math.min(9, v) * 9}%"></i>`).join('')}</div><span class="vn-dur">${dur(m.media.dur)}</span></div>`;
  }
  // Reaction chips under the bubble: counts, yours highlighted, names in the tooltip, a quiet "+" to add one.
  // Only chips whose count went up since the last draw get the small pop (none on first load).
  function reactsHtml(m) {
    const rx = Object.entries(m.reactions || {});
    const prev = prevRx.get(m.id);
    prevRx.set(m.id, Object.fromEntries(rx.map(([e, w]) => [e, w.length])));
    if (!rx.length) return '';
    const who = ids => { const n = ids.map(nameOf); return n.length <= 2 ? n.join(' and ') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`; };
    return `<div class="reacts">${rx.map(([e, ids]) => {
      const pop = prev && (prev[e] || 0) < ids.length ? 'pop' : '';
      return `<button class="rx ${ids.includes(me()) ? 'on' : ''} ${pop}" data-rx="${e}" title="${esc(who(ids))} reacted ${e}" aria-label="${e} ${ids.length}, ${esc(who(ids))}${ids.includes(me()) ? ', tap to remove yours' : ''}">${e}<span>${ids.length}</span></button>`;
    }).join('')}<button class="rx rx-add" data-rx-add title="Add a reaction" aria-label="Add a reaction">${icon('i-smile-plus')}</button></div>`;
  }
  function html(m, ch) {
    msgs.set(m.id, { m, ch });
    const sys = m.by === 'tribecode', brain = m.by === 'brain', agent = (member(m.by) || {}).role === 'agent';
    const when = new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const md = t => (window.TribeMD ? window.TribeMD.inline(t).replace(/\n/g, '<br>') : esc(t));
    const av = sys ? `<div class="avatar" style="background:var(--surface-3);color:var(--accent-2)">🔥</div>`
      : brain ? `<div class="avatar av-brain">${icon('i-brain')}</div>`
      : agent ? `<div class="avatar av-agent">${icon('i-sparkle')}</div>`
      : `<div class="avatar" style="background:${esc(colorOf(m.by))};color:${ink(colorOf(m.by))}">${esc(initials(nameOf(m.by)))}</div>`;
    let body = '';
    if (m.deleted) body = `<p class="gone">message deleted</p>`;
    else {
      if (m.fwd) body += `<div class="fwd">${icon('i-fwd')}Forwarded from <b>${esc(nameOf(m.fwd.by))}</b> · ${esc(m.fwd.from || '')}</div>`;
      if (m.replyTo) body += `<button class="quote" data-jump="${esc(m.replyTo.id)}" title="Jump to the original"><b>${esc(nameOf(m.replyTo.by))}</b><span>${esc(m.replyTo.text)}</span></button>`;
      if (m.vote && window.TribeVotes) body += window.TribeVotes.card(m, ch);
      else if (m.media && m.media.kind === 'voice') body += voiceHtml(m, ch) + (m.text ? `<p class="vn-tx">${esc(m.text)}</p>` : `<p class="vn-tx faint">No transcript</p>`);
      else if (m.media && m.media.kind === 'image') body += `<button class="thumb" data-full="${esc(mediaUrl(ch, m.media.file))}"><img src="${esc(mediaUrl(ch, m.media.file))}" alt="Image from ${esc(nameOf(m.by))}" loading="lazy"></button>${m.text ? `<p>${md(m.text)}</p>` : ''}`;
      else body += `<p>${md(m.text || '')}</p>`;
      if (!m.vote) body += linkChips(m.text);
      body += reactsHtml(m);
      if (window.TribeVotes) body += window.TribeVotes.hint(m);
    }
    const more = sys || m.deleted ? '' : `<button class="msg-more" aria-label="Message actions" title="More">${icon('i-more')}</button>`;
    return `<div class="msg dx ${sys ? 'sys' : ''} ${brain ? 'brain' : ''} ${m.deleted ? 'deleted' : ''} ${m.vote ? 'has-vote' : ''}" data-id="${esc(m.id)}" data-at="${esc(m.at)}" data-by="${esc(m.by)}">${av}
      <div class="mb"><b>${esc(nameOf(m.by))}</b><time>${when}</time>${m.edited && !m.deleted ? '<span class="edited">edited</span>' : ''}${body}</div>${more}</div>`;
  }
  function rerender(id) {
    const e = msgs.get(id); if (!e) return;
    document.querySelectorAll(`.msg[data-id="${CSS.escape(id)}"]`).forEach(el => { el.outerHTML = html(e.m, e.ch); });
    drawPins(); drawReceipt();
  }
  // app.js renders #general; upgrade its messages to this renderer as they arrive.
  function upgrade(list, ch) {
    for (const el of list.querySelectorAll('.msg[data-id]:not(.dx)')) { const e = msgs.get(el.dataset.id); if (e) el.outerHTML = html(e.m, ch); }
  }

  // ---------- unread divider, jump to latest, receipts ----------
  function divider(list, since) {
    list.querySelectorAll('.unread-div').forEach(d => d.remove());
    if (!since) return;
    const first = [...list.querySelectorAll('.msg[data-id]')].find(el => el.dataset.at > since && el.dataset.by !== me() && el.dataset.by !== 'tribecode');
    if (first) first.insertAdjacentHTML('beforebegin', '<div class="unread-div" role="separator"><span>New since you left</span></div>');
  }
  function remember(ch) {
    const list = listFor(ch), last = list && [...list.querySelectorAll('.msg[data-at]')].pop();
    if (last) { lastSeen[ch] = last.dataset.at; try { localStorage.setItem(SEEN, JSON.stringify(lastSeen)); } catch {} }
  }
  addEventListener('pagehide', () => remember(cur()));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') remember(cur()); });

  let newBelow = 0;
  const far = l => l && l.scrollHeight - l.scrollTop - l.clientHeight > 160;
  function jumpBtn() {
    let b = $('#jump-latest');
    if (!b) {
      const panel = $('#chat-form') && $('#chat-form').parentNode; if (!panel) return null;
      b = document.createElement('button'); b.id = 'jump-latest'; b.className = 'jump-latest hidden'; b.type = 'button';
      b.onclick = () => { const l = listFor(cur()); if (l) l.scrollTop = l.scrollHeight; newBelow = 0; drawJump(); };
      $('#chat-form').insertAdjacentElement('beforebegin', b);
    }
    return b;
  }
  function drawJump() {
    const b = jumpBtn(); if (!b) return;
    const l = listFor(cur()), show = far(l);
    if (!show) newBelow = 0;
    b.classList.toggle('hidden', !show);
    b.innerHTML = `${icon('i-down')}${newBelow ? `${newBelow} new` : 'Latest'}`;
  }
  function watchScroll(l) { if (l && !l.dataset.jw) { l.dataset.jw = '1'; l.addEventListener('scroll', drawJump, { passive: true }); } }

  function drawReceipt() {
    const ch = cur(), r = receipts.get(ch), l = $('#dm-list');
    if (!l) return;
    l.querySelectorAll('.rcpt').forEach(x => x.remove());
    if (!r || ch === 'general') return;
    const mine = [...l.querySelectorAll('.msg[data-by]')].filter(el => el.dataset.by === me()).pop(); if (!mine) return;
    const read = r.at && r.at >= mine.dataset.at;
    mine.querySelector('.mb').insertAdjacentHTML('beforeend', `<div class="rcpt ${read ? 'read' : ''}">${read ? 'read' : 'delivered'}</div>`);
  }

  // ---------- pins ----------
  function pinStrip() {
    let el = $('#pin-strip');
    if (!el) { const l = $('#chat-list'); if (!l) return null; el = document.createElement('div'); el.id = 'pin-strip'; el.className = 'pin-strip hidden'; l.insertAdjacentElement('beforebegin', el); }
    return el;
  }
  function drawPins() {
    const el = pinStrip(); if (!el) return;
    const list = pinsBy.get(cur()) || [];
    el.classList.toggle('hidden', !list.length);
    if (!list.length) { el.innerHTML = ''; return; }
    const open = el.classList.contains('open');
    el.innerHTML = `<button class="pin-head" aria-expanded="${open}">${icon('i-pin')}<b>${list.length} pinned</b><span>${esc(textOf(list[0]))}</span>${icon('i-chev', 'chev')}</button>
      <div class="pin-items">${list.map(m => `<button data-jump="${esc(m.id)}"><b>${esc(nameOf(m.by))}</b><span>${esc(textOf(m))}</span></button>`).join('')}</div>`;
    el.querySelector('.pin-head').onclick = () => { el.classList.toggle('open'); drawPins(); };
  }
  async function loadPins(ch) {
    try { const { pins } = await C.api(`/chat/${ch}/pins`); pinsBy.set(ch, pins); } catch { pinsBy.delete(ch); }
    if (ch === cur()) drawPins();
  }
  function jump(id) {
    const el = document.querySelector(`.chat:not(.hidden) .msg[data-id="${CSS.escape(id)}"]`);
    if (!el) return toast('That message is further back than what is loaded.');
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200);
  }

  // ---------- message menu ----------
  function closeMenu() { const m = $('#msg-menu'); if (m) m.remove(); }
  function targets(ch) {
    const out = [];
    if (ch !== 'general') out.push({ to: 'general', label: '#general' });
    const mine = (C.state().members || []).find(x => x.role === 'agent' && x.owner === me());
    if (mine) out.push({ to: window.TribeDM.channelWith(mine.id), label: mine.name, agent: true });
    for (const x of C.state().members || []) if (x.role !== 'agent' && x.id !== me()) out.push({ to: window.TribeDM.channelWith(x.id), label: x.name });
    return out.filter(t => t.to !== ch);
  }
  function openMenu(el, anchor, touchMenu = false) {
    closeMenu();
    const e = msgs.get(el.dataset.id); if (!e) return;
    const { m, ch } = e, own = m.by === me(), pinned = (pinsBy.get(ch) || []).some(p => p.id === m.id);
    const menu = document.createElement('div'); menu.id = 'msg-menu'; menu.className = 'dm-menu msg-menu'; menu.setAttribute('role', 'menu');
    const main = () => {
      // On touch the quick-react bar sits above the menu, so the menu skips its own emoji row.
      const row = touchMenu ? '' : `<div class="rx-row">${[...QUICK, '🔥'].map(x => `<button data-emoji="${x}" aria-label="React ${x}">${x}</button>`).join('')}<button data-emoji-more aria-label="More reactions" title="More reactions">${icon('i-smile-plus')}</button></div>`;
      menu.innerHTML = `${row}
        <button role="menuitem" data-act="reply">${icon('i-reply')}Reply</button>
        <button role="menuitem" data-act="forward">${icon('i-fwd')}Forward…</button>
        ${m.text ? `<button role="menuitem" data-act="copy">${icon('i-copy')}Copy text</button>` : ''}
        <button role="menuitem" data-act="pin">${icon('i-pin')}${pinned ? 'Unpin' : 'Pin'}</button>
        ${m.text && !m.vote ? `<button role="menuitem" data-act="task">${icon('i-check')}Make task</button>` : ''}
        ${m.text && !m.vote && window.TribeVotes ? `<button role="menuitem" data-act="vote">${icon('i-vote')}Make it a vote</button>` : ''}
        ${m.media && m.media.kind === 'voice' ? `<button role="menuitem" data-act="notes">${icon('i-doc')}Add to my notes</button>` : ''}
        ${own && !m.media && !m.vote ? `<button role="menuitem" data-act="edit">${icon('i-edit')}Edit</button>` : ''}
        ${own ? `<button role="menuitem" data-act="delete" class="danger">${icon('i-trash')}Delete</button>` : ''}`;
      bind();
    };
    const fwd = () => {
      menu.innerHTML = `<div class="menu-label">Forward to</div>${targets(ch).map(t => `<button role="menuitem" data-to="${esc(t.to)}">${t.agent ? icon('i-sparkle') : t.to === 'general' ? icon('i-chat') : icon('i-users')}${esc(t.label)}</button>`).join('')}
        <button role="menuitem" data-to="notes">${icon('i-doc')}My notes</button>`;
      menu.querySelectorAll('[data-to]').forEach(b => b.onclick = async () => {
        closeMenu();
        try {
          const r = await C.api(`/chat/${ch}/forward`, { method: 'POST', body: { id: m.id, to: b.dataset.to, date: today() } });
          toast(r.doc ? `Added to ${r.doc.title}` : `Forwarded to ${b.textContent.trim()}`);
        } catch (err) { toast(err.message); }
      });
      place();
    };
    let armed = false;
    const bind = () => {
      menu.querySelectorAll('[data-emoji]').forEach(b => b.onclick = () => { closeMenu(); react(ch, m.id, b.dataset.emoji); });
      const more = menu.querySelector('[data-emoji-more]'); if (more) more.onclick = () => { const a = anchor || el; closeMenu(); openPicker(m.id, a); };
      menu.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
        const act = b.dataset.act;
        if (act === 'forward') return fwd();
        if (act === 'delete' && !armed) { armed = true; b.innerHTML = `${icon('i-trash')}Click again to delete`; return; }
        closeMenu();
        try {
          if (act === 'reply') startReply(m, ch);
          if (act === 'copy') { await navigator.clipboard.writeText(m.text); toast('Copied'); }
          if (act === 'pin') await C.api(`/chat/${ch}/pin`, { method: 'POST', body: { id: m.id, on: !pinned } });
          if (act === 'task') { const { task } = await C.api('/tasks', { method: 'POST', body: { title: m.text.replace(/\s+/g, ' ').slice(0, 200) } }); toast(`Task created: ${task.title}`); }
          if (act === 'notes') { const r = await C.api(`/chat/${ch}/notes`, { method: 'POST', body: { id: m.id, date: today() } }); toast(`Added to ${r.doc.title}`); }
          if (act === 'vote') window.TribeVotes.openComposer({ question: m.text.replace(/\s+/g, ' ').slice(0, 200), channel: ch });
          if (act === 'edit') edit(el, m, ch);
          if (act === 'delete') await C.api(`/chat/${ch}/msg/${m.id}`, { method: 'DELETE' });
        } catch (err) { toast(err.message); }
      });
      place();
    };
    const place = () => {
      const r = (anchor || el).getBoundingClientRect();
      menu.style.top = Math.max(8, Math.min(innerHeight - menu.offsetHeight - 8, r.bottom + 4)) + 'px';
      menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + 'px';
      const f = menu.querySelector('button'); if (f) f.focus();
    };
    document.body.appendChild(menu);
    main();
  }
  async function react(ch, id, emoji, on) {
    try {
      const r = await C.api(`/chat/${ch}/react`, { method: 'POST', body: { id, emoji, ...(on ? { on: true } : {}) } });
      if (r.approved) toast(`Approved: ${r.approved.title}`);
      else if (r.pinned) toast('Pinned');
    } catch (e) { toast(e.message); }
  }

  // ---------- quick-react bar + picker ----------
  const reactable = el => { const e = el && msgs.get(el.dataset.id); return e && !e.m.deleted && e.m.by !== 'tribecode' ? e : null; };
  let qrFor = null, qrHide = null, qrTouch = false, lpAt = 0;   // lpAt: when a long-press opened the bar (its trailing click is swallowed)
  function qrBar() {
    let b = $('#qr-bar');
    if (!b) { b = document.createElement('div'); b.id = 'qr-bar'; b.className = 'qr-bar hidden'; b.setAttribute('role', 'toolbar'); b.setAttribute('aria-label', 'Quick reactions'); document.body.appendChild(b); }
    return b;
  }
  function showQuick(el, { touch = false, focus = false } = {}) {
    const e = reactable(el); if (!e) return;
    clearTimeout(qrHide);
    const b = qrBar(), mine = e.m.reactions || {};
    qrFor = el.dataset.id; qrTouch = touch;
    b.dataset.id = e.m.id;
    b.innerHTML = QUICK.map(x => `<button type="button" data-q="${x}" class="${(mine[x] || []).includes(me()) ? 'on' : ''}" aria-label="React ${x}" title="React ${x}">${x}</button>`).join('')
      + `<button type="button" data-q="more" class="qr-more" aria-label="More reactions" title="More reactions">${icon('i-smile-plus')}</button>`;
    b.classList.toggle('touch', touch);
    b.classList.remove('hidden');
    const r = (el.querySelector('.mb') || el).getBoundingClientRect(), w = b.offsetWidth, h = b.offsetHeight;
    let top, left;
    if (touch) { top = r.top - h - 8; left = r.left; if (top < 8) top = r.bottom + 8; }
    else { top = r.top - h + 4; left = el.getBoundingClientRect().right - w - 30; const list = el.closest('.chat'); if (list && top < list.getBoundingClientRect().top) top = r.top + 2; }
    b.style.top = Math.max(8, Math.min(innerHeight - h - 8, top)) + 'px';
    b.style.left = Math.max(8, Math.min(innerWidth - w - 8, left)) + 'px';
    if (focus) b.querySelector('button').focus();
  }
  function hideQuick(now) {
    clearTimeout(qrHide);
    const go = () => { const b = $('#qr-bar'); if (b) b.classList.add('hidden'); qrFor = null; };
    if (now) go(); else qrHide = setTimeout(go, 160);
  }
  function closePicker() { const p = $('#rx-picker'); if (p) p.remove(); }
  function openPicker(id, anchor) {
    closePicker();
    const e = msgs.get(id); if (!e) return;
    const mine = e.m.reactions || {};
    const p = document.createElement('div'); p.id = 'rx-picker'; p.className = 'rx-picker'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Pick a reaction');
    p.innerHTML = `<div class="rx-grid">${EMOJI.map(x => `<button type="button" data-pick="${x}" class="${(mine[x] || []).includes(me()) ? 'on' : ''}" aria-label="React ${x}">${x}</button>`).join('')}</div>
      <div class="rx-tip">✅ on an agent's request approves it · 📌 pins</div>`;
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect();
    p.style.top = Math.max(8, Math.min(innerHeight - p.offsetHeight - 8, r.bottom + 6)) + 'px';
    p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.right - p.offsetWidth)) + 'px';
    p.dataset.id = id;
    p.querySelector('button').focus();
  }
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    if (e.target.closest && e.target.closest('#qr-bar')) { clearTimeout(qrHide); return; }
    const el = e.target.closest && e.target.closest('.chat .msg.dx:not(.sys):not(.deleted)');
    if (el) { if (qrFor !== el.dataset.id || $('#qr-bar').classList.contains('hidden')) showQuick(el); else clearTimeout(qrHide); }
    else if (qrFor && !qrTouch) hideQuick();
  });
  document.addEventListener('click', e => {
    if (lpAt && Date.now() - lpAt < 1200 && !(e.target.closest && e.target.closest('#qr-bar, #msg-menu'))) { lpAt = 0; e.preventDefault(); e.stopImmediatePropagation(); return; }
    const q = e.target.closest && e.target.closest('#qr-bar [data-q]');
    if (q) {
      e.preventDefault(); e.stopPropagation();
      const id = $('#qr-bar').dataset.id, x = msgs.get(id); if (!x) return;
      if (q.dataset.q === 'more') { openPicker(id, q); hideQuick(true); closeMenu(); return; }
      hideQuick(true); closeMenu(); react(x.ch, id, q.dataset.q);
      return;
    }
    const pk = e.target.closest && e.target.closest('#rx-picker [data-pick]');
    if (pk) { e.stopPropagation(); const id = $('#rx-picker').dataset.id, x = msgs.get(id); closePicker(); if (x) react(x.ch, id, pk.dataset.pick); return; }
    if (!(e.target.closest && e.target.closest('#rx-picker'))) closePicker();
    if (qrTouch && !(e.target.closest && e.target.closest('#qr-bar'))) hideQuick(true);
  }, true);
  addEventListener('scroll', () => { if (qrFor) hideQuick(true); closePicker(); }, true);

  // Double-click (mouse) or double-tap (touch) a bubble = 👍. Never toggles a 👍 off.
  let lastTap = { id: null, t: 0, x: 0, y: 0 };
  const INTERACTIVE = 'button, a, input, textarea, select, label, .vn, .thumb, .vt, .quote, .edit-in, .rx, .reacts';
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('.chat .msg.dx:not(.sys):not(.deleted)');
    if (!el || e.target.closest(INTERACTIVE)) { lastTap.id = null; return; }
    const now = Date.now(), near = Math.abs(e.clientX - lastTap.x) < 24 && Math.abs(e.clientY - lastTap.y) < 24;
    if (lastTap.id === el.dataset.id && now - lastTap.t < 350 && near) {
      lastTap.id = null;
      const x = msgs.get(el.dataset.id); if (!x) return;
      try { const s = getSelection(); if (s && !s.isCollapsed && el.contains(s.anchorNode)) s.removeAllRanges(); } catch {}
      if (!((x.m.reactions || {})['👍'] || []).includes(me())) react(x.ch, x.m.id, '👍', true);
      if (!reducedMotion()) { el.classList.remove('liked'); void el.offsetWidth; el.classList.add('liked'); setTimeout(() => el.classList.remove('liked'), 500); }
      return;
    }
    lastTap = { id: el.dataset.id, t: now, x: e.clientX, y: e.clientY };
  });

  // The latest message you can react to in the open conversation.
  const lastMsg = () => [...document.querySelectorAll('.chat:not(.hidden) .msg.dx:not(.sys):not(.deleted)')].pop() || null;
  // Ctrl/⌘ Shift \ : quick-react to the latest message.
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'Backslash') {
      const el = lastMsg(); if (!el) return;
      e.preventDefault(); showQuick(el, { touch: true, focus: true });
    }
    if (e.key === 'Escape') { if (qrFor) hideQuick(true); closePicker(); }
  });
  function edit(el, m, ch) {
    const p = el.querySelector('.mb > p'); if (!p) return;
    p.outerHTML = `<input class="edit-in" maxlength="4000" aria-label="Edit message">`;
    const inp = el.querySelector('.edit-in'); inp.value = m.text; inp.focus(); inp.select();
    inp.onkeydown = async e => {
      if (e.key === 'Escape') { e.preventDefault(); rerender(m.id); }
      if (e.key === 'Enter') { e.preventDefault(); const t = inp.value.trim(); if (!t || t === m.text) return rerender(m.id); try { await C.api(`/chat/${ch}/msg/${m.id}`, { method: 'PATCH', body: { text: t } }); } catch (err) { toast(err.message); rerender(m.id); } }
    };
    inp.onblur = () => setTimeout(() => { if (inp.isConnected) rerender(m.id); }, 150);
  }

  // ---------- reply ----------
  function startReply(m, ch) {
    reply = { id: m.id, ch, by: m.by, text: textOf(m) };
    drawReply(); $('#chat-input').focus();
  }
  function drawReply() {
    let bar = $('#reply-bar');
    if (!bar) { const f = $('#chat-form'); if (!f) return; bar = document.createElement('div'); bar.id = 'reply-bar'; bar.className = 'reply-bar hidden'; f.insertAdjacentElement('beforebegin', bar); }
    if (reply && reply.ch !== cur()) reply = null;
    bar.classList.toggle('hidden', !reply);
    bar.innerHTML = reply ? `${icon('i-reply')}<span>Replying to <b>${esc(nameOf(reply.by))}</b> · ${esc(reply.text)}</span><button type="button" aria-label="Cancel reply">${icon('i-x')}</button>` : '';
    if (reply) bar.querySelector('button').onclick = () => { reply = null; drawReply(); };
  }

  // Sending: DMs and replies go through /chat/<ch>/send; plain #general posts stay with app.js.
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'chat-form') return;
    // "+👍" (or +1, +ok, +fire…) reacts to the latest message instead of sending it.
    const quick = ($('#chat-input').value.trim().match(/^\+(\S{1,12})$/) || [])[1];
    const emo = quick && (EMOJI.includes(quick) ? quick : ALIAS[quick.toLowerCase()] || (EMOJI.includes(quick + '️') ? quick + '️' : null));
    if (emo && C.connected()) {
      const el = lastMsg(), x = el && msgs.get(el.dataset.id);
      if (x) {
        e.preventDefault(); e.stopImmediatePropagation();
        $('#chat-input').value = ''; react(x.ch, x.m.id, emo, true);
        return;
      }
    }
    const ch = cur(); if (ch === 'general' && !reply) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const inp = $('#chat-input'), text = inp.value.trim(); if (!text || !C.connected()) return;
    const r = reply && reply.ch === ch ? reply.id : undefined;
    inp.value = ''; reply = null; drawReply();
    C.send({ type: 'typing', channel: ch, stop: true });
    try { await C.api(`/chat/${ch}/send`, { method: 'POST', body: { text, replyTo: r } }); }
    catch (err) { inp.value = text; toast(err.message); }
  }, true);

  // ---------- media: voice player, image lightbox, paste ----------
  let player = null, playing = null;
  function togglePlay(vn) {
    if (playing === vn) { player.paused ? player.play() : player.pause(); return; }
    if (player) { player.pause(); if (playing) paint(playing, 0, false); }
    player = new Audio(vn.dataset.src); playing = vn;
    player.ontimeupdate = () => paint(vn, player.duration ? player.currentTime / player.duration : 0, !player.paused);
    player.onplay = player.onpause = () => paint(vn, player.duration ? player.currentTime / player.duration : 0, !player.paused);
    player.onended = () => { paint(vn, 0, false); playing = null; };
    player.play().catch(() => toast("Couldn't play this voice note."));
  }
  function paint(vn, frac, on) {
    if (!vn.isConnected) return;
    const bars = vn.querySelectorAll('.vn-wave i'), k = Math.round(frac * bars.length);
    bars.forEach((b, i) => b.classList.toggle('on', i < k));
    vn.querySelector('.vn-play').innerHTML = icon(on ? 'i-pause' : 'i-play');
    vn.querySelector('.vn-play').setAttribute('aria-label', on ? 'Pause voice note' : 'Play voice note');
  }
  function lightbox(src) {
    const d = document.createElement('div'); d.className = 'modal lightbox'; d.innerHTML = `<img src="${esc(src)}" alt="">`;
    d.onclick = () => d.remove(); document.body.appendChild(d);
  }
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  document.addEventListener('paste', async e => {
    if (e.target.id !== 'chat-input') return;
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.kind === 'file' && /^image\//.test(i.type));
    if (!item) return;
    e.preventDefault();
    const f = item.getAsFile(); if (!f) return;
    if (f.size > 3 * 1024 * 1024) return toast('Images up to 3 MB.');
    const text = $('#chat-input').value.trim();
    try { await C.api(`/chat/${cur()}/image`, { method: 'POST', body: { data: await toB64(f), mime: f.type, text } }); $('#chat-input').value = ''; }
    catch (err) { toast(err.message); }
  });

  // ---------- voice notes: hold the composer mic ----------
  let rec = null, holdTimer = null, suppressClick = false;
  const pickMime = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  async function startRec() {
    if (rec || !window.MediaRecorder || !navigator.mediaDevices) return toast('Voice notes need a browser that can record audio.');
    const ch = cur();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return toast(e.name === 'NotAllowedError' ? 'Microphone access was blocked.' : 'No microphone found.'); }
    const mime = pickMime(), r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const st = rec = { r, stream, ch, chunks: [], levels: [], words: [], interim: '', t0: Date.now(), cancelled: false };
    r.ondataavailable = e => { if (e.data && e.data.size) st.chunks.push(e.data); };
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      st.meter = setInterval(() => { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) ** 2; st.levels.push(Math.sqrt(s / buf.length) / 128); }, 100);
      st.ctx = ctx;
    } catch {}
    const SP = window.TribeSpeech;
    if (SP && SP.supported()) SP.use('voicenote', { label: 'recording', onFinal: t => { st.words.push(t); st.interim = ''; drawRec(); }, onInterim: t => { st.interim = t; drawRec(); } });
    r.start(250);
    st.tick = setInterval(() => { drawRec(); if (Date.now() - st.t0 > 120000) stopRec(true); }, 250);
    drawRec();
  }
  function drawRec() {
    const f = $('#chat-form'); if (!f) return;
    let bar = f.querySelector('.rec-bar');
    if (!rec) { if (bar) bar.remove(); f.classList.remove('recording'); return; }
    if (!bar) { bar = document.createElement('div'); bar.className = 'rec-bar'; bar.setAttribute('aria-live', 'polite'); f.appendChild(bar); }
    f.classList.add('recording');
    const said = [...rec.words, rec.interim].filter(Boolean).join(' ');
    bar.innerHTML = `<span class="rec-dot"></span><span class="rec-time">${dur((Date.now() - rec.t0) / 1000)}</span><span class="rec-tx">${esc(said || 'Recording a voice note…')}</span><span class="rec-hint">release to send · Esc cancels</span>`;
  }
  async function stopRec(sendIt) {
    const st = rec; if (!st) return;
    rec = null; clearInterval(st.tick); clearInterval(st.meter);
    const stopped = new Promise(res => { st.r.onstop = res; });
    try { st.r.stop(); } catch {}
    await stopped;
    st.stream.getTracks().forEach(t => t.stop()); if (st.ctx) st.ctx.close().catch(() => {});
    const secs = (Date.now() - st.t0) / 1000;
    if (window.TribeSpeech) { await new Promise(r => setTimeout(r, sendIt ? 350 : 0)); window.TribeSpeech.release('voicenote'); }   // let a last final result land
    drawRec();
    if (!sendIt) return toast('Voice note discarded');
    if (secs < 0.7) return toast('Hold the mic a little longer to record a voice note.');
    const blob = new Blob(st.chunks, { type: st.r.mimeType || pickMime() || 'audio/webm' });
    if (blob.size > 3 * 1024 * 1024) return toast('Voice note too long (max about 2 minutes).');
    const n = 32, L = st.levels, max = Math.max(0.02, ...L);
    const wave = Array.from({ length: n }, (_, i) => { const seg = L.slice(Math.floor(i * L.length / n), Math.floor((i + 1) * L.length / n)); const v = seg.length ? Math.max(...seg) : 0; return Math.round(1 + 8 * v / max); });
    try {
      await C.api(`/chat/${st.ch}/voice`, { method: 'POST', body: { data: await toB64(blob), mime: blob.type, dur: Math.round(secs), transcript: [...st.words, st.interim].filter(Boolean).join(' ').trim(), wave } });
    } catch (err) { toast('Voice note not sent: ' + err.message); }
  }
  function bindMic() {
    const b = $('#chat-form [data-dictate]'); if (!b || b.dataset.vn) return;
    b.dataset.vn = '1'; b.title = 'Tap to dictate · hold to send a voice note (Ctrl Shift D)';
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !C.connected()) return;
      try { b.setPointerCapture(e.pointerId); } catch {}
      holdTimer = setTimeout(() => { holdTimer = null; suppressClick = true; startRec(); }, 320);
    });
    const up = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; return; } if (rec) stopRec(true); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } if (rec) stopRec(false); });
  }
  document.addEventListener('click', e => {
    if (suppressClick && e.target.closest && e.target.closest('#chat-form [data-dictate]')) { e.stopPropagation(); e.preventDefault(); suppressClick = false; }
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && rec) { e.preventDefault(); stopRec(false); } }, true);

  // ---------- delegated clicks + long-press ----------
  document.addEventListener('click', e => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const more = t.closest('.msg.dx .msg-more'); if (more) { e.preventDefault(); return openMenu(more.closest('.msg'), more); }
    if (!e.composedPath().some(n => n.id === 'msg-menu')) closeMenu();   // path, not closest: submenus replace the clicked node
    const pin = t.closest('#pin-strip [data-jump]'); if (pin) return jump(pin.dataset.jump);
    const el = t.closest('.msg.dx'); if (!el) return;   // everything below lives inside a chat message
    const add = t.closest('.rx-add'); if (add) { e.stopPropagation(); return openPicker(el.dataset.id, add); }
    const rx = t.closest('.rx'); if (rx) { const x = msgs.get(el.dataset.id); if (x) react(x.ch, x.m.id, rx.dataset.rx); return; }
    const q = t.closest('.quote[data-jump]'); if (q) return jump(q.dataset.jump);
    const play = t.closest('.vn-play'); if (play) return togglePlay(play.closest('.vn'));
    const th = t.closest('.thumb[data-full]'); if (th) return lightbox(th.dataset.full);
  });
  let press = null;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const el = e.target.closest && e.target.closest('.chat .msg.dx:not(.sys):not(.deleted)'); if (!el) return;
    press = setTimeout(() => { press = null; lpAt = Date.now(); openMenu(el, null, true); showQuick(el, { touch: true }); if (navigator.vibrate) try { navigator.vibrate(8); } catch {} }, 480);   // emoji bar above, actions below
  });
  ['pointerup', 'pointercancel', 'pointermove'].forEach(t => document.addEventListener(t, () => { if (press) { clearTimeout(press); press = null; } }));
  document.addEventListener('contextmenu', e => { if (qrTouch && qrFor && e.target.closest && e.target.closest('.chat .msg.dx')) e.preventDefault(); });   // long-press opened our bar, not the OS menu
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  // ---------- events ----------
  C.on('ws', m => {
    if (m.type === 'chat-update') {
      const e = msgs.get(m.message.id); msgs.set(m.message.id, { m: m.message, ch: e ? e.ch : m.channel });
      const p = pinsBy.get(m.channel); if (p) pinsBy.set(m.channel, p.map(x => (x.id === m.message.id ? m.message : x)));
      rerender(m.message.id);
    }
    if (m.type === 'chat-pins') { pinsBy.set(m.channel, m.pins || []); if (m.channel === cur()) drawPins(); }
    if (m.type === 'chat-read') { const r = receipts.get(m.channel) || {}; receipts.set(m.channel, { ...r, at: m.at }); drawReceipt(); }
  });
  C.on('chat', ({ channel, message }) => {
    msgs.set(message.id, { m: message, ch: channel });
    if (channel === cur()) {
      const l = listFor(channel);
      if (far(l) && message.by !== me()) { newBelow++; drawJump(); }
      setTimeout(drawReceipt, 0);
    }
  });
  let placed = false;
  C.on('hello', () => { loadPins('general'); if (cur() !== 'general') loadPins(cur()); });
  function boot() {
    addIcons(); drawReply(); pinStrip(); jumpBtn(); bindMic();
    const l = $('#chat-list');
    if (l) {
      watchScroll(l);
      new MutationObserver(() => {
        const stick = l.scrollHeight - l.scrollTop - l.clientHeight < 260;
        upgrade(l, 'general');
        if (stick) l.scrollTop = l.scrollHeight;   // richer bubbles are taller than app.js's plain ones
        if (!placed && l.querySelector('.msg.dx')) { placed = true; divider(l, lastSeen.general); }
        drawJump();
      }).observe(l, { childList: true });
    }
    const form = $('#chat-form'); if (form) new MutationObserver(bindMic).observe(form, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.TribeChatX = {
    seen: (m, ch) => msgs.set(m.id, { m, ch }),
    html,
    // dm.js calls this when the panel switches channel
    async channelChanged(ch, { list, since } = {}) {
      if (ch !== 'general') remember('general');   // so #general shows "New since you left" next time
      if (reply && reply.ch !== ch) { reply = null; }
      drawReply(); drawPins(); watchScroll(list || listFor(ch)); newBelow = 0; drawJump();
      if (list && since !== undefined) divider(list, since);
      if (ch !== 'general' && !pinsBy.has(ch)) loadPins(ch);
      if (ch !== 'general') { try { const { receipt } = await C.api(`/chat/${ch}/receipt`); if (receipt) receipts.set(ch, receipt); else receipts.delete(ch); } catch {} }
      drawReceipt();
    },
    drawReceipt, startRec, stopRec, recording: () => !!rec, EMOJI, QUICK,
    rerender, react: (id, emoji) => { const x = msgs.get(id); if (x) return react(x.ch, id, emoji); },
    quickReact: id => { const el = document.querySelector(`.chat:not(.hidden) .msg[data-id="${CSS.escape(id)}"]`); if (el) showQuick(el, { touch: true, focus: true }); },
  };
})();
