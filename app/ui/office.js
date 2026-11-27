// The office (feat/p10-office): a calm floor where every person and every AI helper in the tribe has a desk, and the
// screen at each desk says what they are doing right now, in short lines with a blinking cursor (a dim screensaver
// when nobody is there). People walk to the thinking spot, the task board or the lounge and back. Idea from the
// owner's own MIT project Vanilla Agents; drawn fresh in TribeCode's flat style.
// It is the top of Agents & office (agentsoffice.js): the pixel floor (Office Space, officespace.js) is on for every tribe,
// phones too (feat/p13-office); the host or an admin can turn it off (the desks show instead), and each person can hide
// the office on their device. The first time someone is in a tribe, "Make your character" opens (officelooks.js).
// One card for everyone: a click on someone at a desk, on the floor or in the list opens the same actions (Message,
// Call, Give a task, Open what they're working on; for AI helpers Approve / Ask for changes, Pause, its page).
// Server: server/office.js (GET/PUT /api/office).
//   window.TribeOffice = { mount(el, { compact }), refresh(), hidden(), setHidden(bool), state(), load(), setOn(bool),
//     openCard(id), cardBody(d), cardClick(e, card, d), cardSubmit(e, card, d), statusOf(d), linesOf(d), everyone() }
//   mount() returns { destroy() }. compact: a one-line strip of who is at their desk (for the project dashboard).
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const initials = n => (String(n || '?').trim().split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w)).map(w => [...w][0]).slice(0, 2).join('') || '?').toUpperCase();   // "Claude · Maya" -> CM
  const LS_HIDE = 'tribecode.office.hide', LS_VIEW = 'tribecode.office.view';
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  // Office Space (pass 11): on a computer the office opens as the pixel floor; "Desks" keeps the calm list. Phones get the list.
  const viewOf = () => { try { return localStorage.getItem(LS_VIEW) === 'desks' ? 'desks' : 'floor'; } catch { return 'floor'; } };
  const canFloor = () => !!window.TribeOfficeSpace;   // phones too: the floor fits 390px and a tap opens the card
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let data = null, loading = null, last = 0;
  const mounts = new Set();

  const hidden = () => { try { return localStorage.getItem(LS_HIDE) === '1'; } catch { return false; } };
  function setHidden(v) { try { localStorage.setItem(LS_HIDE, v ? '1' : '0'); } catch {} paintAll(); }

  // ---------- data ----------
  async function load(force) {
    if (!C.hasToken || !C.hasToken()) return null;
    if (loading) return loading;
    if (!force && data && Date.now() - last < 1500) return data;
    loading = C.api('/office').then(d => { data = d; last = Date.now(); return d; }).catch(() => data).finally(() => { loading = null; });
    return loading;
  }
  const refresh = () => load(true).then(paintAll);
  const api = { refresh: () => refresh() };

  // Where a person is, in plain words (the same places presence.js shows on avatars).
  function placeText(d) {
    const P = window.TribePresence, w = d.where;
    if (!w) return '';
    if (typeof w === 'string') return w;
    try { if (P && P.label) { const l = P.label(w); if (l) return l; } } catch {}
    return w.l ? String(w.l) : '';
  }
  // The lines on a desk's screen.
  function screenLines(d) {
    if (d.kind === 'flint') return [tr('Ready when you are'), tr('Ask me what to do next')];
    const lines = [];
    if (d.kind === 'person' && d.state === 'active') { const p = placeText(d); if (p) lines.push(p); }
    lines.push(...(d.lines || []).map(tr));
    if (!lines.length && d.state === 'active') lines.push(d.kind === 'agent' ? tr('Connected') : tr('Around'));
    return lines.slice(0, 4);
  }
  const roleOf = d => (d.kind === 'flint' ? 'flint' : d.kind === 'agent' ? 'agent' : 'person');
  function withFlint(list) {
    const out = (list || []).slice();
    out.push({ id: 'flint', name: 'Flint', kind: 'flint', state: 'active', spot: 'desk', lines: [] });   // TribeCode's own helper always has a desk
    return out;
  }
  const status = d => (d.state === 'off' ? tr('Away from desk') : d.state === 'away' ? tr('Away') : d.spot === 'think' ? tr('Thinking') : d.spot === 'board' ? tr('At the task board') : d.spot === 'lounge' ? tr('In the lounge') : tr('At their desk'));

  // ---------- drawing ----------
  const avatar = (d, cls = '') => `<span class="of-av ${cls}" data-who="${esc(d.id)}" data-role="${roleOf(d)}" title="${esc(d.name)} · ${esc(status(d))}" aria-hidden="true">${d.kind === 'flint' ? '<svg viewBox="0 0 24 24" class="of-flame"><path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z"/></svg>' : esc(initials(d.name))}</span>`;
  function desk(d) {
    const here = d.state === 'active' && d.spot === 'desk';
    const lines = screenLines(d);
    const live = d.state === 'active' && lines.length;
    return `<article class="of-desk" data-desk="${esc(d.id)}" data-role="${roleOf(d)}" data-state="${esc(d.state)}" tabindex="0" role="button" aria-label="${esc(d.name)}: ${esc(status(d))}${lines.length ? '. ' + esc(lines.join('. ')) : ''}">
      <div class="of-screen${live ? ' on' : ' saver'}">${live ? `<ul>${lines.map((l, i) => `<li>${esc(l)}${i === lines.length - 1 ? '<i class="of-caret"></i>' : ''}</li>`).join('')}</ul>` : `<span class="of-saver">${esc(d.state === 'off' ? tr('Away from desk') : status(d))}</span>`}</div>
      <footer class="of-who"><span class="of-chair">${here ? avatar(d) : '<span class="of-av of-empty" aria-hidden="true"></span>'}</span>
        <span class="of-name"><b>${esc(d.name)}</b><span>${esc(d.kind === 'flint' ? tr('Built-in helper') : d.kind === 'agent' ? tr('AI helper') : tr('Person'))}${!here && d.state !== 'off' ? ' · ' + esc(status(d)) : ''}</span></span></footer>
    </article>`;
  }
  function zone(id, title, list, extra = '') {
    return `<section class="of-zone of-${id}" data-zone="${id}"><span class="eyebrow">${esc(title)}</span><div class="of-crowd">${list.map(d => avatar(d)).join('') || `<span class="faint of-none">${esc(tr('Nobody'))}</span>`}</div>${extra}</section>`;
  }
  function boardHtml(b) {
    if (!b) return '';
    const sum = [b.todo ? `${b.todo} ${tr('to do')}` : '', b.doing ? `${b.doing} ${tr('in progress')}` : '', b.requests ? `${b.requests} ${tr('waiting for an OK')}` : ''].filter(Boolean).join(' · ') || tr('Nothing waiting');
    return `<p class="of-sum">${esc(sum)}</p>${(b.top || []).length ? `<ul class="of-cards">${b.top.map(t => `<li data-task="${esc(t.id)}"><span>${esc(t.title)}</span>${t.who ? `<em>${esc(t.who)}</em>` : ''}</li>`).join('')}</ul>` : ''}`;
  }
  function floor(d, full) {
    const list = withFlint(d.desks);
    const at = s => list.filter(x => x.state !== 'off' && x.spot === s);
    const people = list.filter(x => x.kind === 'person').length, agents = list.filter(x => x.kind !== 'person').length;
    return `<div class="of-floor">
      <div class="of-desks">${list.map(desk).join('')}</div>
      <div class="of-zones">${zone('think', tr('Thinking spot'), at('think'))}${zone('board', tr('Task board'), at('board'), boardHtml(d.board))}${zone('lounge', tr('Lounge'), list.filter(x => x.state === 'away' || (x.state === 'active' && x.spot === 'lounge')))}</div>
      ${full ? '' : `<p class="of-foot faint">${esc(`${people} ${people === 1 ? tr('person') : tr('people')} · ${agents} ${agents === 1 ? tr('helper') : tr('helpers')}`)} · <button class="linkish" data-of-hide>${esc(tr('Hide the office for me'))}</button></p>`}
    </div>`;
  }
  // Who's here, beside the pixel floor: the same people as the floor, as a list a keyboard and a screen reader can use.
  function rosterHtml(d) {
    return withFlint(d.desks).map(x => `<li><button type="button" class="of-ro" data-desk="${esc(x.id)}" data-role="${roleOf(x)}" data-state="${esc(x.state)}">${avatar(x)}<span class="of-ro-t"><b>${esc(x.name)}</b><small>${esc(screenLines(x)[0] || status(x))}</small></span></button></li>`).join('');
  }
  function strip(d) {
    const list = withFlint(d.desks).filter(x => x.state === 'active');
    if (!list.length) return '';
    return `<div class="of-strip" role="group" aria-label="${esc(tr('The office'))}"><span class="eyebrow">${esc(tr('The office'))}</span>
      <div class="of-strip-row">${list.slice(0, 8).map(x => `<button class="of-strip-who" data-desk="${esc(x.id)}" data-role="${roleOf(x)}" title="${esc(x.name)} · ${esc(screenLines(x)[0] || status(x))}">${avatar(x)}<span>${esc(screenLines(x)[0] || status(x))}</span></button>`).join('')}</div>
      <button class="linkish of-strip-open" data-of-open>${esc(tr('Open the office'))} →</button></div>`;
  }
  // The pixel floor is off: the host or an admin sees one quiet offer above the desks.
  function offerHtml(d) {
    if (!d || d.on || !d.canSet || !window.TribeOfficeSpace) return '';
    return `<p class="of-offer faint">${esc(tr('Show the office as a pixel floor, with everyone walking to their desk.'))} <button class="linkish" data-of-on>${esc(tr('Turn on the pixel floor'))}</button></p>`;
  }

  // ---------- FLIP: avatars glide from their old place to the new one ----------
  function glide(el, paint) {
    const before = new Map(); if (!reduce()) el.querySelectorAll('[data-who]').forEach(a => before.set(a.dataset.who, a.getBoundingClientRect()));
    paint();
    if (reduce() || !before.size) return;
    el.querySelectorAll('[data-who]').forEach(a => {
      const b = before.get(a.dataset.who); if (!b) return;
      const n = a.getBoundingClientRect(), dx = b.left - n.left, dy = b.top - n.top; if (!dx && !dy) return;
      a.style.transition = 'none'; a.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => { a.style.transition = ''; a.style.transform = ''; });
    });
  }

  // full (Agents & office, agentsoffice.js): the office fills the page and the page draws the toolbar (Floor | Desks,
  // zoom, ⋯), so here there is no toggle, no list under the floor and no footer; onPaint(m) runs after each paint.
  function paint(m) {
    const { el, opts } = m; if (!el.isConnected) { mounts.delete(m); return; }
    paintOne(m);
    if (opts.onPaint) try { opts.onPaint(m); } catch (e) { console.error(e); }
  }
  function paintOne(m) {
    const { el, opts } = m, full = !!opts.full;
    const d = data;
    if (opts.compact) { el.innerHTML = d && d.on && !hidden() ? strip(d) : ''; el.hidden = !el.innerHTML; return; }
    glide(el, () => {
      if (!d) { el.innerHTML = `<p class="faint of-wait">${esc(tr('Opening the office…'))}</p>`; return; }
      if (hidden()) { el.innerHTML = `<div class="of-off"><p class="faint">${esc(tr('You hid the office on this device.'))}</p><button class="btn" data-of-show>${esc(tr('Show the office'))}</button></div>`; return; }
      el.dataset.ofView = canFloor() && d.on && viewOf() === 'floor' ? 'floor' : 'desks';
      const toggle = full ? '' : canFloor() && d.on ? `<div class="of-view" role="group" aria-label="${esc(tr('How to show the office'))}"><button class="btn sm${viewOf() === 'floor' ? ' on' : ''}" data-of-view="floor" aria-pressed="${viewOf() === 'floor'}">${esc(tr('Floor'))}</button><button class="btn sm${viewOf() === 'desks' ? ' on' : ''}" data-of-view="desks" aria-pressed="${viewOf() === 'desks'}">${esc(tr('Desks'))}</button></div>` : '';
      if (canFloor() && d.on && viewOf() === 'floor') {
        // keep the canvas alive between refreshes: only feed it new data
        if (!m.space || !el.querySelector('.of-space')) {
          if (m.space) m.space.destroy();
          el.innerHTML = full ? '<div class="of-space"></div>' : `${toggle}<div class="of-space"></div><ul class="of-roster" aria-label="${esc(tr('Who’s here'))}"></ul><p class="of-foot faint"><button class="linkish" data-of-hide>${esc(tr('Hide the office for me'))}</button></p>`;
          m.space = window.TribeOfficeSpace.mount(el.querySelector('.of-space'), api, full ? { bar: false, fill: true } : {});
          const v = el.querySelector(':scope > .of-view'), bar = el.querySelector('.os-bar'); if (v && bar) bar.prepend(v);
        }
        m.space.update(d);
        const ro = el.querySelector('.of-roster'); if (ro) ro.innerHTML = rosterHtml(d);
        return;
      }
      if (m.space) { m.space.destroy(); m.space = null; }
      el.innerHTML = toggle + offerHtml(d) + floor(d, full);
    });
  }
  function paintAll() { mounts.forEach(paint); }
  // Speech bubbles on the floor: the last thing someone said in a channel, for a few seconds.
  function say(id, text) { mounts.forEach(m => { if (m.space && m.space.say) m.space.say(id, String(text)); }); }

  async function setOn(on) {
    try { data = { ...(data || {}), ...(await C.api('/office', { method: 'PUT', body: { on } })) }; } catch (e) { if (window.TribeApp) window.TribeApp.toast(e.message); }
    refresh();
  }
  // ---------- one card for everyone (the floor's card, the desks and the list in Agents & office) ----------
  const everyone = () => withFlint((data && data.desks) || []);
  const statusOf = d => (d.state === 'off' ? tr('Offline') : d.state === 'away' ? tr('Away') : d.spot === 'think' ? tr('Thinking') : d.spot === 'board' ? tr('At the task board') : d.spot === 'lounge' ? tr('In the lounge') : tr('At their desk'));
  const kindText = d => (d.kind === 'agent' ? tr('AI helper') : d.kind === 'flint' ? tr('Built-in helper') : tr('Person'));
  // The card's body. The attributes (data-os-*) are the floor's, so one click handler serves every place it shows.
  function cardBody(d) {
    if (d.kind === 'flint') return `<p class="faint">${esc(tr('TribeCode\'s own helper. He works with no AI and gets better with one.'))}</p>
      <div class="os-acts"><button class="btn primary sm" data-os-do="flint">${esc(tr('Ask Flint'))}</button><button class="btn sm" data-os-do="next">${esc(tr('What to do next'))}</button><button class="btn sm" data-os-do="design">${esc(tr('Polish a design'))}</button></div>`;
    if (d.kind === 'agent') {
      const asks = (d.asks || []).map(a => `<li class="os-ask"><span>${esc(a.title)}</span>${a.canDecide ? `<span class="os-ask-acts"><button class="btn sm ok" data-os-ap="approve" data-id="${esc(a.id)}">${esc(tr('Approve'))}</button><button class="btn sm" data-os-ap="question" data-id="${esc(a.id)}">${esc(tr('Ask for changes'))}</button></span>` : `<em class="faint">${esc(tr('Waiting for an OK'))}</em>`}</li>`).join('');
      return `<dl class="os-dl">${d.ownerName ? `<dt>${esc(tr('Helps'))}</dt><dd>${esc(d.ownerName)}</dd>` : ''}${d.agentKind ? `<dt>${esc(tr('Tool'))}</dt><dd>${esc(d.agentKind)}</dd>` : ''}${d.task ? `<dt>${esc(tr('Task'))}</dt><dd><button class="linkish" data-os-task="${esc(d.task.id)}">${esc(d.task.title)}</button></dd>` : ''}</dl>
        ${(d.files || []).length ? `<p class="os-sub">${esc(tr('Files it claimed'))}</p><ul class="os-files">${d.files.map(f => `<li><button class="linkish" data-os-file="${esc(f)}">${esc(f)}</button></li>`).join('')}</ul>` : ''}
        ${(d.lines || []).length ? `<p class="os-sub">${esc(tr('Last steps'))}</p><ul class="os-lines">${d.lines.map(l => `<li>${esc(tr(l))}</li>`).join('')}</ul>` : ''}
        ${asks ? `<p class="os-sub">${esc(tr('Asking for your OK'))}</p><ul class="os-asks">${asks}</ul><input class="input sm os-note" maxlength="300" placeholder="${esc(tr('What to change (for Ask for changes)'))}" aria-label="${esc(tr('What to change (for Ask for changes)'))}">` : ''}
        <div class="os-acts"><button class="btn sm" data-os-do="dm">${esc(tr('Message it'))}</button>${d.state !== 'off' ? `<button class="btn sm" data-os-do="${d.paused ? 'resume' : 'pause'}">${esc(d.paused ? tr('Resume') : tr('Pause'))}</button>` : ''}<button class="btn sm" data-os-do="agent">${esc(tr('Its page'))}</button>${data && (d.owner === data.me || data.canSet) && window.TribeOfficeLooks ? `<button class="btn sm" data-os-do="look">${esc(tr('Change its look'))}</button>` : ''}</div>
        <form class="os-give" data-os-give><input class="input sm" maxlength="140" placeholder="${esc(tr('Give a task…'))}" aria-label="${esc(tr('Give a task'))}"><button class="btn sm">${esc(tr('Give'))}</button></form>`;
    }
    const where = placeText(d), mine = (window.TribeTasks && window.TribeTasks.all ? window.TribeTasks.all() : []).filter(t => t.assignee === d.id).slice(-3).reverse();
    const self = d.id === (data && data.me);
    return `${where ? `<p class="os-where"><span class="faint">${esc(tr('Now'))}</span> ${esc(where)} <button class="linkish" data-os-do="open">${esc(tr('Open'))}</button></p>` : ''}
      ${d.task ? `<p class="os-where"><span class="faint">${esc(tr('Task'))}</span> <button class="linkish" data-os-task="${esc(d.task.id)}">${esc(d.task.title)}</button></p>` : ''}
      ${mine.length ? `<p class="os-sub">${esc(tr('Recent work'))}</p><ul class="os-lines">${mine.map(t => `<li><button class="linkish" data-os-task="${esc(t.id)}">${esc(t.title)}</button> <span class="faint">${esc(t.status || '')}</span></li>`).join('')}</ul>` : ''}
      <div class="os-acts">${!self ? `<button class="btn primary sm" data-os-do="dm">${esc(tr('Message'))}</button><button class="btn sm" data-os-do="call">${esc(tr('Call'))}</button>` : `<button class="btn primary sm" data-os-act="look">${esc(tr('Your look'))}</button>`}<button class="btn sm" data-os-do="profile">${esc(tr('Profile'))}</button></div>
      ${!self ? `<form class="os-give" data-os-give><input class="input sm" maxlength="140" placeholder="${esc(tr('Give a task…'))}" aria-label="${esc(tr('Give a task'))}"><button class="btn sm">${esc(tr('Give'))}</button></form>` : ''}`;
  }
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  async function cardAct(kind, d, btn) {
    const W = window;
    try {
      if (kind === 'dm') { if (W.TribeDM && W.TribeDM.open) await W.TribeDM.open(d.id); return; }
      if (kind === 'call') { if (W.TribeDM && W.TribeDM.open) await W.TribeDM.open(d.id); if (W.TribeHuddle && W.TribeHuddle.join) W.TribeHuddle.join(); return; }
      if (kind === 'profile') { if (W.TribeProfiles && W.TribeProfiles.open) W.TribeProfiles.open(d.id, btn); else if (W.TribeProfile && W.TribeProfile.open) W.TribeProfile.open(d.id); return; }
      if (kind === 'open') { if (W.TribePresence && W.TribePresence.jump) { const ok = await W.TribePresence.jump(d.id); if (ok === false) toast(tr('You can\'t open that from here.')); } return; }
      if (kind === 'agent') { if (W.TribeShell && W.TribeShell.previewAgent) W.TribeShell.previewAgent(d.id); return; }
      if (kind === 'pause' || kind === 'resume') { await C.api(`/coord/agents/${encodeURIComponent(d.id)}/control`, { method: 'POST', body: { action: kind } }); toast(kind === 'pause' ? tr('Paused') : tr('Resumed')); refresh(); return; }
      if (kind === 'look') { if (W.TribeOfficeLooks) W.TribeOfficeLooks.openHelper(d); return; }   // feat/office-looks: the helper's owner changes its look
      if (kind === 'flint') { if (W.TribeFlint && W.TribeFlint.open) W.TribeFlint.open(); return; }
      if (kind === 'next') { if (W.TribeShell && W.TribeShell.go) W.TribeShell.go('home'); return; }
      if (kind === 'design') { if (W.TribeDesignFlow && W.TribeDesignFlow.open) W.TribeDesignFlow.open(); else if (W.TribeShell && W.TribeShell.go) W.TribeShell.go('canvas'); return; }
    } catch (e) { toast(e.message); }
  }
  // A click inside a card. Returns true when it was one of the card's actions; done() runs after an action that leaves.
  function cardClick(e, card, d, done) {
    const t = e.target.closest && e.target.closest('[data-os-do],[data-os-ap],[data-os-task],[data-os-file]'); if (!t || !d) return false;
    if (t.matches('[data-os-task]')) { if (done) done(); if (window.TribeTasks && window.TribeTasks.open) window.TribeTasks.open(t.dataset.osTask); return true; }
    if (t.matches('[data-os-file]')) { if (done) done(); const A2 = window.TribeApp; if (A2 && A2.show) A2.show('code'); setTimeout(() => { if (window.TribeCodeFiles && window.TribeCodeFiles.open) window.TribeCodeFiles.open(t.dataset.osFile); }, 120); return true; }
    if (t.matches('[data-os-ap]')) {
      const v = t.dataset.osAp, note = (card.querySelector('.os-note') || {}).value || '';
      if (v === 'question' && !note.trim()) { const n = card.querySelector('.os-note'); if (n) n.focus(); toast(tr('Say what to change first.')); return true; }
      t.disabled = true;
      (v === 'approve' ? C.api(`/approvals/${encodeURIComponent(t.dataset.id)}/approve`, { method: 'POST', body: { note: note.trim() || undefined } })
        : C.api(`/approvals/${encodeURIComponent(t.dataset.id)}/question`, { method: 'POST', body: { text: note.trim() } }))
        .then(() => { toast(v === 'approve' ? tr('Approved') : tr('Sent. It can change it and ask again.')); refresh(); }, err => { t.disabled = false; toast(err.message); });
      return true;
    }
    const k = t.dataset.osDo;
    if (done && !['pause', 'resume'].includes(k)) done();
    cardAct(k, d, t);
    return true;
  }
  function cardSubmit(e, card, d) {
    const f = e.target.closest && e.target.closest('[data-os-give]'); if (!f || !d) return false; e.preventDefault();
    const inp = f.querySelector('input'), title = inp.value.trim(); if (!title) return true;
    // an AI helper hears about its task at once (the fleet's route); a person finds it on the board, assigned to them
    const make = d.kind === 'agent' ? C.api(`/agents/fleet/${encodeURIComponent(d.id)}/task`, { method: 'POST', body: { title } })
      : window.TribeTasks && window.TribeTasks.create ? window.TribeTasks.create(title, 'todo', { assignee: d.id }) : C.api('/tasks', { method: 'POST', body: { title, status: 'todo', assignee: d.id } });
    Promise.resolve(make).then(() => { inp.value = ''; toast(tr('Task given')); refresh(); }, err => toast(err.message));
    return true;
  }
  // The card on its own (from a desk or the list): the same body in the app's one sheet.
  let cardSheet = null;
  function openCard(id) {
    const find = () => everyone().find(x => x.id === id);
    const d = find(); if (!d) return;
    const UI = window.TribeUI;
    if (!UI || !UI.sheet) { if (d.kind === 'flint') return cardAct('flint', d); return cardAct(d.kind === 'agent' ? 'agent' : 'profile', d); }
    if (cardSheet) cardSheet.close();
    const sh = cardSheet = UI.sheet({ id: 'of-card', eyebrow: `${kindText(d)} · ${statusOf(d)}`, title: d.name, body: `<div class="os-card of-card" data-who="${esc(d.id)}">${cardBody(d)}</div>`, onClose: () => { if (cardSheet === sh) cardSheet = null; } });
    const card = sh.body.querySelector('.of-card');
    card.addEventListener('click', e => {
      if (e.target.closest('[data-os-act="look"]')) { sh.close(); if (window.TribeOfficeLooks) window.TribeOfficeLooks.openMine(); return; }   // feat/office-looks
      cardClick(e, card, find() || d, () => sh.close());
    });
    card.addEventListener('submit', e => cardSubmit(e, card, find() || d));
  }
  function click(e) {
    const t = e.target.closest('[data-of-on],[data-of-hide],[data-of-show],[data-of-open],[data-of-view],[data-desk],[data-task]'); if (!t) return;
    if (t.matches('[data-of-view]')) { try { localStorage.setItem(LS_VIEW, t.dataset.ofView); } catch {} return paintAll(); }
    if (t.matches('[data-of-on]')) return setOn(true);
    if (t.matches('[data-of-hide]')) return setHidden(true);
    if (t.matches('[data-of-show]')) return setHidden(false);
    if (t.matches('[data-of-open]')) {   // Agents & office, where the office is the top of the page
      const S = window.TribeShell;
      if (S && S.go) S.go('ws-agents');
      else if (window.TribeAgentsHub && window.TribeAgentsHub.office) window.TribeAgentsHub.office();
      return;
    }
    if (t.matches('[data-task]')) { if (window.TribeTasks && window.TribeTasks.open) window.TribeTasks.open(t.dataset.task); return; }
    openCard(t.dataset.desk);
  }

  function mount(el, opts = {}) {
    const m = { el, opts };
    mounts.add(m);
    el.classList.add('of-mount'); if (opts.compact) el.classList.add('of-compact');
    el.addEventListener('click', click);
    el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-desk]')) { e.preventDefault(); openCard(e.target.dataset.desk); } });
    paint(m); load().then(() => paint(m));
    if (opts.full) makeSoon(900);   // opening the office is a good first moment for Make your character
    return { destroy() { mounts.delete(m); el.removeEventListener('click', click); if (m.space) m.space.destroy(); }, space: () => m.space };
  }

  // Live: presence, places, claims, tasks, change requests and the switches all repaint (at most every 1.5 s), plus a slow tick for "thinking".
  let soon = null;
  const nudge = () => { if (!mounts.size) return; clearTimeout(soon); soon = setTimeout(() => load(true).then(paintAll), 400); };
  if (C.on) {
    C.on('presence', nudge);
    C.on('ws', m => {
      if (m && /^(office|claims|task|tasks|places|place|changereq|coord|agents|huddle|approval)/.test(m.type || '')) nudge();
      // a message in a shared channel: a speech bubble over whoever sent it. Never a private message (dm-…): the office
      // only ever says someone is "in messages".
      if (m && m.type === 'chat' && typeof m.channel === 'string' && !/^dm[-:]/.test(m.channel) && m.message && m.message.by && typeof m.message.text === 'string' && !m.message.deleted && !m.message.e2ee) say(m.message.by, m.message.text);
    });
  }
  setInterval(() => { if (mounts.size && document.visibilityState === 'visible') load(true).then(paintAll); }, 8000);

  // ---------- Settings: Tribe & admin (host/admin) and Workspace (everyone: hide for me) ----------
  function wireSettings() {
    const S = window.TribeSettings; if (!S || !S.addSection) return false;
    S.addSection('admin', { id: 'office', title: tr('The office'), render(el) {   // "on" is the pixel floor: the desks are always in Agents & office
      el.innerHTML = `<p class="faint">${esc(tr('Loading…'))}</p>`;
      load(true).then(d => {
        const on = !!(d && d.on), off = !!(d && d.agentsOff);
        el.innerHTML = `<div class="set-row"><div class="set-l"><b>${esc(tr('Pixel floor'))}</b><span class="set-hint">${esc(tr('Everyone as a character at their desk, walking to meetings and the task board. Turn off to show a list of desks instead.'))}</span></div>
          <button class="toggle set-toggle" role="switch" id="set-office" aria-checked="${on}"${d && d.canSet ? '' : ' disabled'}><span class="switch"></span></button></div>
          <div class="set-row"><div class="set-l"><b>${esc(tr('AI helpers can work'))}</b><span class="set-hint">${esc(tr('Turn off to pause every agent in this tribe at once.'))}</span></div>
          <button class="toggle set-toggle" role="switch" id="set-agents-on" aria-checked="${!off}"${d && d.canSet ? '' : ' disabled'}><span class="switch"></span></button></div>`;
        el.querySelector('#set-office').onclick = async e => { const v = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(v)); await setOn(v); };
        el.querySelector('#set-agents-on').onclick = async e => { const v = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(v)); try { await C.api('/office', { method: 'PUT', body: { agentsOff: !v } }); } catch (err) { if (window.TribeApp) window.TribeApp.toast(err.message); } refresh(); };
      });
    } });
    S.addSection('workspace', { id: 'office-me', title: tr('The office'), render(el) {
      el.innerHTML = `<div class="set-row"><div class="set-l"><b>${esc(tr('Show the office'))}</b><span class="set-hint">${esc(tr('Only on this device. The tribe can still have it on.'))}</span></div>
        <button class="toggle set-toggle" role="switch" id="set-office-me" aria-checked="${!hidden()}"><span class="switch"></span></button></div>`;
      el.querySelector('#set-office-me').onclick = e => { const v = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(v)); setHidden(!v); };
    } });
    return true;
  }
  if (!wireSettings()) document.addEventListener('DOMContentLoaded', wireSettings, { once: true });

  // ---------- Make your character (feat/p13-office) ----------
  // The first time someone is in a tribe and has no look there: the look they made in another tribe (kept on this
  // device) comes along by itself; with none, "Make your character" opens once. Not over the one-sentence start, not
  // over another sheet, not for AI helpers. Automated browsers only with ?character=1.
  const LS_MADE = 'tribecode.office.made';
  const tribeKey = () => { try { const s = C.state ? C.state() : {}; const t = s.tribe; return String((C.base ? C.base() : '') + '|' + (t && typeof t === 'object' ? t.id || t.name || '' : t || ''));  } catch { return 'tribe'; } };
  const madeHere = () => { try { return (JSON.parse(localStorage.getItem(LS_MADE) || '[]') || []).includes(tribeKey()); } catch { return false; } };
  function markMade() { try { const l = JSON.parse(localStorage.getItem(LS_MADE) || '[]') || []; if (!l.includes(tribeKey())) l.push(tribeKey()); localStorage.setItem(LS_MADE, JSON.stringify(l.slice(-50))); } catch {} }
  let asking = false;
  async function maybeMake() {
    if (asking || madeHere() || !C.hasToken || !C.hasToken() || !C.connected || !C.connected()) return;
    if (navigator.webdriver && !/[?&]character=1/.test(location.search)) return;
    const st = C.state ? C.state() : {}, me = st.me || {};
    if (me.role === 'agent' || me.role === 'spectator') return;
    const NC = window.TribeNewcomer, P = window.TribeProjects;
    if ((NC && NC.blank && NC.blank()) || (P && P.loaded && !P.loaded()) || document.querySelector('#hub-idea')) return;   // the one-sentence start comes first
    if (document.querySelector('.ui-sheet, .ui-scrim, dialog[open]')) return;
    asking = true;
    try {
      const d = await load(true); if (!d || !d.me || d.myLook) { if (d && d.myLook) markMade(); return; }
      const L = window.TribeOfficeLooks; if (!L) return;
      const kept = L.kept && L.kept();
      if (kept) { try { await C.api('/office/look', { method: 'PUT', body: { look: kept } }); markMade(); refresh(); return; } catch {} }
      markMade();
      L.openMine({ first: true });
    } finally { asking = false; }
  }
  let makeT = null;
  const makeSoon = (ms = 2500) => { clearTimeout(makeT); makeT = setTimeout(maybeMake, ms); };
  if (C.on) C.on('hello', () => makeSoon());
  addEventListener('tribe-projects-loaded', () => makeSoon());

  // the page's toolbar (agentsoffice.js): which view shows, switch it, and the pixel floor of a mount
  const view = () => (data && data.on && canFloor() ? viewOf() : 'desks');
  function setView(v) { try { localStorage.setItem(LS_VIEW, v === 'desks' ? 'desks' : 'floor'); } catch {} paintAll(); }
  window.TribeOffice = { mount, refresh, hidden, setHidden, view, setView, canFloor, state: () => data, setOn, load, openCard, cardBody, cardClick, cardSubmit, statusOf, linesOf: screenLines, kindText, everyone, say, maybeMake };
})();
