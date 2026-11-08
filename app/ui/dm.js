// Direct messages and typing indicators in the room panel.
// Click a person → Message (or use the "#general ▾" switcher) to open a 1:1 thread (channel dm-<idA>-<idB>,
// ids sorted) in place of #general, with a back arrow. Your own Claude agent sits at the top of the list.
// Unread counts show as badges; "Maya is typing…" shows under the chat. Messages render through chatx.js.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const READ = 'tribecode.dmRead.v1';
  const X = () => window.TribeChatX;

  let view = 'general', withId = null, generalUnread = 0;
  // feat/chat2: created channels (c-xxxxxxxx, app/ui/channels.js) open in the same second list as DMs.
  const isChan = ch => /^c-[a-f0-9]{8}$/.test(ch || '');
  const CH = () => window.TribeChannels;
  const chanOf = id => (CH() && CH().get(id)) || null;
  const chanName = id => { const c = chanOf(id); return c ? c.name : 'channel'; };
  let showArchived = false;
  const unread = new Map();            // channel -> count
  const typers = new Map();            // channel -> Map(by -> { name, until })
  let lastRead = {}; try { lastRead = JSON.parse(localStorage.getItem(READ) || '{}'); } catch {}

  const me = () => (C.state().me || {}).id;
  const member = id => (C.state().members || []).find(m => m.id === id);
  const nameOf = id => (member(id) || {}).name || 'someone';
  const myAgent = () => (C.state().members || []).find(m => m.role === 'agent' && m.owner === me());
  const canDm = m => !!m && m.id !== me() && (m.role !== 'agent' || m.owner === me());
  const channelWith = id => 'dm-' + [me(), id].sort().join('-');
  const otherIn = ch => { const m = me(); if (!m || !ch.startsWith('dm-')) return null; const rest = ch.slice(3); return rest.startsWith(m + '-') ? rest.slice(m.length + 1) : rest.endsWith('-' + m) ? rest.slice(0, -m.length - 1) : null; };
  const markRead = (ch, at) => { lastRead[ch] = at || new Date().toISOString(); unread.delete(ch); try { localStorage.setItem(READ, JSON.stringify(lastRead)); } catch {} };
  const totalUnread = except => [...unread.entries()].filter(([ch]) => ch !== except).reduce((n, [, c]) => n + c, 0);
  const svg = d => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
  const CHEV = svg('<path d="m6 9 6 6 6-6"/>'), BACK = svg('<path d="M15 6l-6 6 6 6"/>');

  // ---------- panel ----------
  const head = () => { const l = $('#chat-list'); const h = l && l.previousElementSibling && l.previousElementSibling.id === 'pin-strip' ? l.previousElementSibling.previousElementSibling : l && l.previousElementSibling; if (h && h.tagName === 'H6') h.id = h.id || 'chat-head'; return $('#chat-head'); };
  function dmList() {
    let el = $('#dm-list');
    if (!el) { el = document.createElement('div'); el.id = 'dm-list'; el.className = 'chat hidden'; el.setAttribute('aria-live', 'polite'); $('#chat-list').insertAdjacentElement('afterend', el); }
    return el;
  }
  const render = (m, ch) => X().html(m, ch);
  function drawHead() {
    const h = head(); if (!h) return;
    if (view === 'general' || isChan(view)) {
      const n = totalUnread(view) + (view !== 'general' ? generalUnread : 0);
      h.innerHTML = `<button class="chan-switch" id="chan-switch" aria-haspopup="menu" title="Switch channel or conversation"><span class="cs-hash">#</span>${esc(view === 'general' ? 'general' : chanName(view))}${CHEV}${n ? `<span class="dm-badge">${n}</span>` : ''}</button>`;
      h.querySelector('#chan-switch').onclick = e => { e.stopPropagation(); switcher(h.querySelector('#chan-switch')); };
      return;
    }
    const others = totalUnread(view) + generalUnread, ag = (member(withId) || {}).role === 'agent';
    h.innerHTML = `<button class="dm-back" id="dm-back" title="Back to #general" aria-label="Back to #general">${BACK}#general${others ? `<span class="dm-badge">${others}</span>` : ''}</button>` +
      `<span class="dm-with">${ag ? '<svg class="i spark"><use href="#i-sparkle"/></svg>' : '· '}${esc(nameOf(withId))}</span><span class="dm-lock" title="Only you and ${esc(nameOf(withId))} can read this">private</span>`;
    h.querySelector('#dm-back').onclick = back;
  }

  // "#general ▾": conversations, your agent first.
  function switcher(anchor) {
    closeMenu();
    const people = (C.state().members || []).filter(m => m.role !== 'agent' && m.id !== me())
      .sort((a, b) => (unread.get(channelWith(b.id)) || 0) - (unread.get(channelWith(a.id)) || 0) || b.online - a.online || a.name.localeCompare(b.name));
    const ag = myAgent(), row = (m, iconHtml) => { const n = unread.get(channelWith(m.id)) || 0; return `<button role="menuitem" data-dm="${esc(m.id)}">${iconHtml}<span>${esc(m.name)}</span>${n ? `<span class="dm-badge">${n}</span>` : ''}</button>`; };
    const menu = document.createElement('div'); menu.id = 'dm-menu'; menu.className = 'dm-menu chan-menu'; menu.setAttribute('role', 'menu');
    // feat/chat2: Channels (# general + created ones, unread dots, a "…" menu each), + New channel, then DMs.
    const chans = CH() ? CH().list() : [{ id: 'general', name: 'general', main: true }], manage = CH() && CH().canManage();
    const dot = id => (id === 'general' ? (view !== 'general' && generalUnread) : unread.get(id)) ? '<span class="ch-dot" aria-label="new messages"></span>' : '';
    const crow = c => `<div class="ch-row ${c.id === view ? 'on' : ''} ${c.archived ? 'arch' : ''}"><button role="menuitem" data-ch="${esc(c.id)}"><span class="ch-ico" aria-hidden="true">${c.emoji ? esc(c.emoji) : '#'}</span><span class="ch-nm">${esc(c.name)}</span>${dot(c.id)}</button>`
      + `<button class="ch-more" data-chm="${esc(c.id)}" aria-label="#${esc(c.name)} options" title="Channel options"><svg class="i"><use href="#i-more"/></svg></button></div>`;
    const live = chans.filter(c => !c.archived), gone = chans.filter(c => c.archived);
    menu.innerHTML = `<div class="menu-label">Channels</div>${live.map(crow).join('')}` +
      (gone.length ? `<button class="ch-arch-t" data-arch-toggle aria-expanded="${showArchived}">${showArchived ? 'Hide' : 'Show'} archived (${gone.length})</button>${showArchived ? gone.map(crow).join('') : ''}` : '') +
      (manage ? `<button role="menuitem" class="ch-new" data-ch-new><svg class="i"><use href="#i-plus"/></svg>New channel</button>` : '') +
      `<div class="menu-label">Direct messages</div>` +
      (ag ? row(ag, '<svg class="i spark"><use href="#i-sparkle"/></svg>') : '') +
      (people.map(m => row(m, `<span class="mini-dot ${m.online ? 'on' : ''}"></span>`)).join('') || '<div class="menu-empty">Invite friends to message them.</div>');
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = Math.min(innerHeight - menu.offsetHeight - 8, r.bottom + 4) + 'px';
    menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left)) + 'px';
    menu.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => open(b.dataset.dm));
    menu.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => openChannel(b.dataset.ch));
    menu.querySelectorAll('[data-chm]').forEach(b => b.onclick = e => { e.stopPropagation(); CH() && CH().menu(b.dataset.chm, b); });
    const nw = menu.querySelector('[data-ch-new]'); if (nw) nw.onclick = () => { closeMenu(); CH().create(); };
    const at = menu.querySelector('[data-arch-toggle]'); if (at) at.onclick = e => { e.stopPropagation(); showArchived = !showArchived; switcher(anchor); };
    const f = menu.querySelector('button'); if (f) f.focus();
  }

  async function open(id) {
    const m = member(id); if (!canDm(m)) return;
    closeMenu();
    const ch = channelWith(id), since = lastRead[ch] || '';
    view = ch; withId = id;
    document.body.classList.add('dm-open'); document.body.classList.remove('chan-open');
    if (window.TribeApp && window.TribeApp.view && window.TribeApp.view() !== 'chat') window.TribeApp.show('chat');
    const list = dmList(); $('#chat-list').classList.add('hidden'); list.classList.remove('hidden');
    list.innerHTML = '<div class="empty-room">Loading…</div>';
    $('#chat-input').placeholder = m.role === 'agent' ? `Message ${m.name}…` : `Message ${m.name}…`;
    drawHead(); drawTyping(); decorateRoom(); X().channelChanged(ch); if (CH()) CH().applyBg();
    try {
      const { messages } = await C.api('/chat/' + ch + '?limit=200');
      if (view !== ch) return;
      list.innerHTML = messages.length ? messages.map(x => render(x, ch)).join('')
        : `<div class="empty-room">${m.role === 'agent' ? 'Your AI reads this when it calls <b>check_messages</b> and answers with <b>reply</b>. Only you can see this chat.' : `This is the start of your conversation with ${esc(m.name)}. Only the two of you can see it.`}</div>`;
      list.scrollTop = list.scrollHeight;
      markRead(ch, messages.length ? messages[messages.length - 1].at : undefined);
      X().channelChanged(ch, { list, since });
    } catch (e) { list.innerHTML = `<div class="empty-room">${esc(e.message)}</div>`; }
    drawHead(); decorateRoom();
    $('#chat-input').focus();
  }
  // feat/chat2: open a created channel (or #general) in the panel
  async function openChannel(id) {
    if (!id || id === 'general') { closeMenu(); return back(); }
    if (!isChan(id)) return;
    closeMenu();
    const since = lastRead[id] || '', c = chanOf(id);
    view = id; withId = null;
    document.body.classList.remove('dm-open'); document.body.classList.add('chan-open');
    if (window.TribeApp && window.TribeApp.view && window.TribeApp.view() !== 'chat') window.TribeApp.show('chat');
    const list = dmList(); $('#chat-list').classList.add('hidden'); list.classList.remove('hidden');
    list.innerHTML = '<div class="empty-room">Loading…</div>';
    const inp = $('#chat-input'); inp.placeholder = c && c.archived ? `#${chanName(id)} is archived` : `Message #${chanName(id)}…`;
    drawHead(); drawTyping(); X().channelChanged(id); if (CH()) CH().applyBg();
    try {
      const { messages } = await C.api('/chat/' + id + '?limit=200');
      if (view !== id) return;
      list.innerHTML = messages.length ? messages.map(x => render(x, id)).join('')
        : `<div class="empty-room ch-start"><span class="ch-start-e" aria-hidden="true">${esc((c && c.emoji) || '💬')}</span><b>This is the start of #${esc(chanName(id))}</b>${c && c.topic ? `<span>${esc(c.topic)}</span>` : ''}</div>`;
      list.scrollTop = list.scrollHeight;
      markRead(id, messages.length ? messages[messages.length - 1].at : undefined);
      X().channelChanged(id, { list, since });
    } catch (e) { list.innerHTML = `<div class="empty-room">${esc(e.message)}</div>`; }
    drawHead();
    if (!matchMedia('(max-width: 820px)').matches) inp.focus();
  }
  // channels.js: the project's channel list changed (or loaded): unread dots from each channel's last message
  function syncChannels(chs) {
    const now = new Date().toISOString();
    for (const c of chs || []) {
      if (c.main) continue;
      if (!lastRead[c.id]) { lastRead[c.id] = c.last || now; continue; }   // a channel you have never opened starts read
      if (c.id !== view && c.last && c.last > lastRead[c.id]) unread.set(c.id, Math.max(1, unread.get(c.id) || 0));
    }
    try { localStorage.setItem(READ, JSON.stringify(lastRead)); } catch {}
    if (isChan(view) && !chanOf(view)) back(); else drawHead();
  }
  function back() {
    view = 'general'; withId = null; generalUnread = 0;
    document.body.classList.remove('dm-open', 'chan-open');
    dmList().classList.add('hidden'); $('#chat-list').classList.remove('hidden'); $('#chat-list').scrollTop = 1e9;
    $('#chat-input').placeholder = C.connected() ? 'Message the tribe…' : 'Connect to a tribe to chat';
    drawHead(); drawTyping(); decorateRoom(); X().channelChanged('general'); if (CH()) CH().applyBg();
  }

  // ---------- people: badges + "Message" menu ----------
  function decorateRoom() {
    document.querySelectorAll('#room-list .person[data-follow]').forEach(p => {
      const id = p.dataset.follow, n = me() ? unread.get(channelWith(id)) || 0 : 0;
      let b = p.querySelector('.dm-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'dm-badge'; b.title = 'Unread messages'; p.appendChild(b); }
      b.textContent = n > 99 ? '99+' : n;
    });
  }
  function closeMenu() { const m = $('#dm-menu'); if (m) m.remove(); }
  document.addEventListener('click', e => {
    const p = e.target.closest && e.target.closest('#room-list .person[data-follow]');
    if (!p) { if (!e.target.closest || !e.target.closest('#dm-menu')) closeMenu(); return; }
    const m = member(p.dataset.follow);
    if (!canDm(m) || !C.connected()) return;   // yourself / other people's agents: keep the default (follow)
    e.preventDefault(); e.stopPropagation();
    closeMenu();
    const menu = document.createElement('div'); menu.id = 'dm-menu'; menu.className = 'dm-menu'; menu.setAttribute('role', 'menu');
    const n = unread.get(channelWith(m.id)) || 0;
    menu.innerHTML = `<button role="menuitem" data-act="message"><svg class="i"><use href="#i-chat"/></svg>Message${n ? `<span class="dm-badge">${n}</span>` : ''}</button>` +
      (m.online && m.role !== 'agent' ? `<button role="menuitem" data-act="follow"><svg class="i"><use href="#i-users"/></svg>Follow ${esc(m.name)}</button>` : '');
    document.body.appendChild(menu);
    const r = p.getBoundingClientRect();
    menu.style.top = Math.min(innerHeight - menu.offsetHeight - 8, r.bottom + 4) + 'px';
    menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left)) + 'px';
    menu.querySelector('[data-act="message"]').onclick = () => open(m.id);
    const f = menu.querySelector('[data-act="follow"]'); if (f) f.onclick = () => { closeMenu(); p.onclick && p.onclick(); };
    menu.querySelector('button').focus();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  // ---------- typing ----------
  let lastTyping = 0, lastTypingCh = '', typingNow = false;
  document.addEventListener('input', e => {
    if (e.target.id !== 'chat-input') return;
    const has = !!e.target.value.trim();
    if (!has) { if (typingNow) { typingNow = false; C.send({ type: 'typing', channel: view, stop: true }); } return; }
    if (typingNow && Date.now() - lastTyping < 2500 && lastTypingCh === view) return;
    lastTyping = Date.now(); lastTypingCh = view; typingNow = true;
    C.send({ type: 'typing', channel: view });
  });
  function typingLine() {
    let el = $('#typing-line');
    if (!el) { const f = $('#chat-form'); if (!f) return null; el = document.createElement('div'); el.id = 'typing-line'; el.className = 'typing-line hidden'; el.setAttribute('aria-live', 'polite'); f.insertAdjacentElement('beforebegin', el); }
    return el;
  }
  function drawTyping() {
    const el = typingLine(); if (!el) return;
    const t = typers.get(view), now = Date.now();
    if (t) for (const [k, v] of t) if (v.until <= now) t.delete(k);
    const names = t ? [...t.values()].map(x => x.name) : [];
    el.classList.toggle('hidden', !names.length);
    el.innerHTML = names.length ? `<span class="dots"><i></i><i></i><i></i></span>${esc(names.length === 1 ? names[0] + ' is typing…' : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : 'Several people are typing…')}` : '';
  }
  setInterval(() => { if ([...typers.values()].some(t => t.size)) drawTyping(); }, 1000);

  // ---------- events ----------
  C.on('ws', m => {
    if (m.type === 'typing' && m.by !== me()) {
      const t = typers.get(m.channel) || new Map();
      if (m.stop) t.delete(m.by); else t.set(m.by, { name: m.name, until: Date.now() + 4000 });
      typers.set(m.channel, t); drawTyping();
    }
  });
  C.on('chat', ({ channel, message }) => {
    const t = typers.get(channel); if (t && t.delete(message.by)) drawTyping();
    const mine = message.by === me();
    if (channel === 'general') { if (view !== 'general' && !mine) { generalUnread++; drawHead(); } return; }
    if (isChan(channel)) {   // feat/chat2: a created channel: append when open, else an unread dot
      if (channel === view) {
        const list = dmList(); if (list.querySelector('.empty-room')) list.innerHTML = '';
        const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 160 || mine;
        list.insertAdjacentHTML('beforeend', render(message, channel)); if (stick) list.scrollTop = list.scrollHeight;
        markRead(channel, message.at);
      } else if (!mine) { unread.set(channel, (unread.get(channel) || 0) + 1); drawHead(); }
      else { lastRead[channel] = message.at; }
      return;
    }
    if (!channel.startsWith('dm-')) return;
    if (channel === view) {
      const list = dmList(); if (list.querySelector('.empty-room')) list.innerHTML = '';
      const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 160 || mine;
      list.insertAdjacentHTML('beforeend', render(message, channel)); if (stick) list.scrollTop = list.scrollHeight;
      markRead(channel, message.at);
    } else if (!mine) {
      unread.set(channel, (unread.get(channel) || 0) + 1);
      const from = otherIn(channel);
      window.TribeApp && window.TribeApp.toast(`${nameOf(from || message.by)}: ${String(message.text || (message.media ? 'sent a ' + (message.media.kind === 'voice' ? 'voice note' : 'picture') : '')).slice(0, 80)}`);
      drawHead(); decorateRoom();
    }
  });
  C.on('presence', () => { if (view === 'general') drawHead(); });
  C.on('hello', async () => {
    try {
      const { conversations } = await C.api('/dms');
      for (const c of conversations) {
        if (c.channel === view) continue;
        const n = c.incoming.filter(at => !lastRead[c.channel] || at > lastRead[c.channel]).length;
        if (n) unread.set(c.channel, n); else unread.delete(c.channel);
      }
      decorateRoom(); drawHead();
      if (view !== 'general' && withId) open(withId);   // reconnected: reload the open thread
      else if (isChan(view)) openChannel(view);
    } catch {}
  });
  function boot() { const r = $('#room-list'); if (r) new MutationObserver(decorateRoom).observe(r, { childList: true }); typingLine(); drawHead(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  C.on('project', () => { if (isChan(view)) back(); });   // feat/chat2: channels belong to one project
  window.TribeDM = { open, back, openChannel, syncChannels, isChannel: isChan, current: () => view, unread: () => Object.fromEntries(unread), channelWith };
})();
