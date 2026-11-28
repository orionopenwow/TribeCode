// The call stage (#/call): everyone's camera or face in a grid (or speaker view), screens big, and the things a
// call needs around it: reactions, raise hand, in-call chat, quick polls, live notes from the Secretary, recording
// (everyone sees the red dot), a laser pointer and pen on shared screens, "follow me" to present TribeCode itself,
// picture-in-picture, device and push-to-talk settings, ring a teammate, a lobby for locked calls, call history,
// connection quality. Media and signaling live in huddle.js; the small JSON messages in server/calls.js.
// p13b: Notes (live captions with speaker names + meeting notes saved to Files) lives in the Notes panel; a 1:1 call
// from a person's card or the office is private to the two of them; phones without screen capture say so plainly; a
// connection that can't be made says in one line that a relay (TURN) may be needed; ring / decline / missed / no answer.
//   window.TribeCall = { open, close, isOpen, ring, callPerson, react, history }
(function () {
  'use strict';
  const C = window.TribeClient, H = () => window.TribeHuddle;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, k) => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m, k) : console.log(m));
  const meId = () => (C.state().me || {}).id;
  const mem = id => (C.state().members || []).find(m => m.id === id) || {};
  const nameOf = id => mem(id).name || 'someone';
  const colorOf = id => mem(id).color || 'var(--peer)';
  const initials = n => String(n || '?').trim().split(/\s+/).map(w => [...w][0]).slice(0, 2).join('').toUpperCase();
  const isPhone = () => matchMedia('(max-width: 640px)').matches;
  const I = {   // 24-unit stroke icons, currentColor (same style as icons.js)
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    micoff: '<path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M4 4l16 16"/>',
    cam: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
    camoff: '<path d="M16 10l5-3v10l-5-3M3 6h9.5M16 13v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8M3 3l18 18"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
    hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.5 16a1.5 1.5 0 0 1 2.3-2L8 16"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    notes: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    leave: '<path d="M3.5 14.5c4.7-4.7 12.3-4.7 17 0l-2 2.5-3.5-1.5v-2.5a10 10 0 0 0-6 0v2.5L5.5 17z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    speaker: '<rect x="3" y="4" width="18" height="11" rx="1.5"/><rect x="4" y="17" width="4" height="3" rx="1"/><rect x="10" y="17" width="4" height="3" rx="1"/><rect x="16" y="17" width="4" height="3" rx="1"/>',
    pip: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
    flip: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    dot: '<circle cx="12" cy="12" r="5"/>',
  };
  const ico = (k, n = 20) => `<svg class="ci" width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k] || ''}</svg>`;
  const REACT = ['👍', '👏', '🎉', '😂', '❤️', '🔥', '🙌', '🤔'];

  let open = false, view = 'grid', panel = null, call = { id: null, polls: [], chat: [], recording: [], locked: false, presenting: null };
  let unread = 0, pinned = null, rec = null, knocks = [], qual = new Map(), qTimer = null, warn = null, noticeSeen = '', notice = null;
  const CAP = () => window.TribeCaptions;
  const capOn = () => !!(CAP() && CAP().state().on);
  const isDmCall = () => !!(H() && H().dm && H().dm());
  const other = () => (H().roster().find(m => m.id !== meId()) || {}).id || null;
  const root = () => document.getElementById('call-stage');

  // ---------- mount ----------
  function ensure() {
    let r = root(); if (r) return r;
    r = document.createElement('section'); r.id = 'call-stage'; r.className = 'call-stage hidden'; r.setAttribute('aria-label', 'Call');
    r.innerHTML = `<header class="cs-top"><div class="cs-title"><span class="eyebrow">Huddle</span><b class="cs-name">Call</b><span class="cs-rec hidden" title="Being recorded">${ico('dot', 12)}REC</span><span class="cs-lock hidden">Locked</span><button class="cs-noteson hidden" data-c="notes" title="Notes is on: what people say is transcribed for the meeting notes">${ico('dot', 10)}<span>Notes on</span></button></div>
        <div class="cs-topb"><button class="cs-ib" data-c="view" title="Speaker view / grid">${ico('speaker')}</button><button class="cs-ib" data-c="min" title="Back to the app (Esc)">${ico('x')}</button></div></header>
      <div class="cs-body"><div class="cs-grid" role="list"></div><aside class="cs-side hidden" aria-label="Call panel"></aside></div>
      <div class="cs-present hidden"></div><div class="cs-knock hidden"></div><div class="cs-notice hidden" role="status"></div><div class="cs-warn hidden" role="alert"></div><div class="cs-cc hidden" aria-live="polite"></div><div class="cs-floats" aria-hidden="true"></div>
      <footer class="cs-bar">
        <button class="cs-b" data-c="mic">${ico('mic')}<span>Mute</span></button>
        <button class="cs-b" data-c="cam">${ico('cam')}<span>Camera</span></button>
        <button class="cs-b" data-c="share">${ico('screen')}<span>Share</span></button>
        <button class="cs-b" data-c="hand">${ico('hand')}<span>Hand</span></button>
        <button class="cs-b" data-c="react">${ico('smile')}<span>React</span></button>
        <button class="cs-b" data-c="chat">${ico('chat')}<span>Chat</span><i class="cs-badge hidden"></i></button>
        <button class="cs-b" data-c="notes">${ico('notes')}<span>Notes</span></button>
        <button class="cs-b" data-c="people">${ico('people')}<span>People</span></button>
        <button class="cs-b" data-c="more">${ico('more')}<span>More</span></button>
        <button class="cs-b leave" data-c="leave">${ico('leave')}<span>Leave</span></button>
      </footer>
      <div class="cs-pop hidden" role="menu"></div>`;
    document.body.appendChild(r);
    r.addEventListener('click', onClick);
    r.addEventListener('pointerdown', e => { const b = e.target.closest('[data-c="talk"]'); if (b) { H().pttDown(); b.setPointerCapture(e.pointerId); } });
    r.addEventListener('pointerup', e => { if (e.target.closest('[data-c="talk"]')) H().pttUp(); });
    return r;
  }
  function openStage() {
    if (!H() || !H().inCall()) { if (H()) H().join().then(() => { if (H().inCall()) openStage(); }); return; }
    const r = ensure(); r.classList.remove('hidden'); open = true; document.body.classList.add('in-call-stage');
    C.send({ type: 'call-sync' }); render(); startQuality();
    if (location.hash !== '#/call') history.replaceState(null, '', location.pathname + location.search + '#/call');
  }
  function closeStage() {
    const r = root(); if (r) r.classList.add('hidden'); open = false; document.body.classList.remove('in-call-stage'); closePop();
    if (location.hash === '#/call') history.replaceState(null, '', location.pathname + location.search);
    stopQuality();
  }

  // ---------- tiles ----------
  function tilesFor() {
    const h = H(); if (!h) return [];
    const list = [];
    for (const m of h.roster()) {
      const s = h.streamsOf(m.id);
      if (s.screen) list.push({ key: m.id + ':scr', id: m.id, kind: 'screen', stream: s.screen, m });
      list.push({ key: m.id + ':cam', id: m.id, kind: 'cam', stream: s.cam, m });
    }
    return list;
  }
  function renderGrid() {
    const r = root(); if (!r) return;
    const g = $('.cs-grid', r), tiles = tilesFor();
    const big = pinned && tiles.find(t => t.key === pinned) ? pinned : (tiles.find(t => t.kind === 'screen') || {}).key || (view === 'speaker' ? speakerKey(tiles) : null);
    g.className = `cs-grid n${Math.min(tiles.length, 9)}${big ? ' has-big' : ''}`;
    const keep = new Set();
    for (const t of tiles) {
      keep.add(t.key);
      let el = g.querySelector(`[data-key="${CSS.escape(t.key)}"]`);
      if (!el) {
        el = document.createElement('div'); el.className = 'cs-tile'; el.dataset.key = t.key; el.dataset.id = t.id; el.setAttribute('role', 'listitem');
        el.innerHTML = `<video autoplay playsinline muted></video><canvas class="cs-ink"></canvas><div class="cs-face"></div><div class="cs-cap"><span class="cs-n"></span><span class="cs-ic"></span></div><div class="cs-tb"><button class="cs-ib" data-c="pin" title="Make big">${ico('speaker', 16)}</button><button class="cs-ib" data-c="pip" title="Picture in picture">${ico('pip', 16)}</button></div>`;
        g.appendChild(el);
      }
      const v = el.querySelector('video');
      if (t.stream) { if (v.srcObject !== t.stream) v.srcObject = t.stream; v.classList.remove('hidden'); v.classList.toggle('mirror', t.id === meId() && t.kind === 'cam'); }
      else { v.srcObject = null; v.classList.add('hidden'); }
      el.classList.toggle('screen', t.kind === 'screen'); el.classList.toggle('big', t.key === big); el.classList.toggle('has-video', !!t.stream);
      el.classList.toggle('speaking', H().level(t.id) > 0.04 && !t.m.muted && t.kind === 'cam');
      el.querySelector('.cs-face').innerHTML = t.stream ? '' : `<span class="cs-av" style="--c:${esc(colorOf(t.id))}">${esc(initials(nameOf(t.id)))}</span>`;
      const q = qual.get(t.id);
      el.querySelector('.cs-n').textContent = t.kind === 'screen' ? `${nameOf(t.id)}'s screen` : `${nameOf(t.id)}${t.id === meId() ? ' (you)' : ''}`;
      el.querySelector('.cs-ic').innerHTML = t.kind === 'screen' ? '' : `${t.m.hand ? '<b class="cs-hand" title="Hand raised">✋</b>' : ''}${t.m.muted ? `<i class="cs-mute" title="Muted">${ico('micoff', 14)}</i>` : ''}${q && t.id !== meId() ? `<i class="cs-q ${q.level}" title="${q.rtt != null ? q.rtt + ' ms' : 'connection'}${q.loss ? ' · ' + Math.round(q.loss * 100) + '% lost' : ''}"></i>` : ''}`;
      el.querySelector('[data-c="pip"]').hidden = !t.stream || !document.pictureInPictureEnabled;
    }
    g.querySelectorAll('.cs-tile').forEach(el => { if (!keep.has(el.dataset.key)) el.remove(); });
    drawInk();
  }
  function speakerKey(tiles) {
    let best = null, lv = 0.04;
    for (const t of tiles) if (t.kind === 'cam' && t.id !== meId()) { const l = H().level(t.id); if (l > lv) { lv = l; best = t.key; } }
    return best || (tiles.find(t => t.kind === 'cam' && t.id !== meId()) || tiles[0] || {}).key || null;
  }

  // ---------- bar + top ----------
  function renderBar() {
    const r = root(); if (!r) return;
    const me = H().me();
    const set = (c, on, label, icon) => { const b = r.querySelector(`.cs-bar [data-c="${c}"]`); if (!b) return; b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', String(!!on)); if (icon) b.firstElementChild.outerHTML = ico(icon); if (label) b.querySelector('span').textContent = label; };
    set('mic', me.muted || me.deaf, me.deaf ? 'Deafened' : me.ptt ? 'Hold Space' : me.muted ? 'Unmute' : 'Mute', me.muted || me.deaf ? 'micoff' : 'mic');
    set('cam', me.video, me.video ? 'Stop video' : 'Start video', me.video ? 'cam' : 'camoff');
    set('share', me.sharing, me.sharing ? 'Stop share' : 'Share');
    set('hand', me.hand, me.hand ? 'Lower hand' : 'Hand');
    set('chat', panel === 'chat'); set('notes', panel === 'notes'); set('people', panel === 'people');
    const badge = r.querySelector('.cs-badge'); badge.textContent = unread > 9 ? '9+' : String(unread); badge.classList.toggle('hidden', !unread || panel === 'chat');
    const sh = r.querySelector('.cs-bar [data-c="share"]'); sh.hidden = !H().canShare();   // phones that can't capture the screen: no dead button (More says why)
    set('notes', panel === 'notes' || capOn(), capOn() ? 'Notes on' : 'Notes');
    r.querySelector('.cs-noteson').classList.toggle('hidden', !capOn());
    r.querySelector('.cs-rec').classList.toggle('hidden', !(call.recording || []).length);
    r.querySelector('.cs-lock').classList.toggle('hidden', !call.locked);
    const n = H().roster().length;
    r.querySelector('.cs-title .eyebrow').textContent = isDmCall() ? 'Private call' : 'Huddle';
    r.querySelector('.cs-name').textContent = isDmCall() && other() ? nameOf(other()) : `${n} ${n === 1 ? 'person' : 'people'}`;
    r.querySelector('[data-c="view"]').innerHTML = ico(view === 'grid' ? 'speaker' : 'grid');
    // push-to-talk: a big talk button replaces Mute on phones
    let talk = r.querySelector('.cs-bar [data-c="talk"]');
    if (me.ptt && !talk) { talk = document.createElement('button'); talk.className = 'cs-b talk'; talk.dataset.c = 'talk'; talk.innerHTML = `${ico('mic')}<span>Hold to talk</span>`; r.querySelector('.cs-bar').prepend(talk); }
    else if (!me.ptt && talk) talk.remove();
  }
  function render() { if (!open) return; renderGrid(); renderBar(); renderSide(); renderPresent(); renderKnock(); renderNotice(); renderCC(); renderWarn(); }

  // ---------- Notes: the notice, live captions on the stage, a connection warning ----------
  function renderNotice() {
    const r = root(); if (!r) return; const b = $('.cs-notice', r);
    b.classList.toggle('hidden', !notice);
    if (!notice) return;
    const paused = CAP() && CAP().state().paused.includes(meId());
    b.innerHTML = `<span><b>Notes is on.</b> What you say is transcribed on your device and saved in Files for ${isDmCall() ? 'the two of you' : 'the project'}.</span>
      <button class="btn sm" data-c="notes-pause">${paused ? 'Resume mine' : 'Pause mine'}</button><button class="btn sm ghost" data-c="notice-x">OK</button>`;
  }
  function renderCC() {
    const r = root(); if (!r) return; const b = $('.cs-cc', r), c = CAP();
    const on = capOn() && panel !== 'notes';
    b.classList.toggle('hidden', !on); if (!on) return;
    const ls = c.lines().slice(-2), mine = c.mine && c.mine();
    const rows = ls.map(l => `<div class="cs-ccl"><b style="color:${esc(colorOf(l.by))}">${esc(l.name)}</b> ${esc(l.text)}</div>`);
    if (mine) rows.push(`<div class="cs-ccl faint"><b>${esc(nameOf(meId()))}</b> ${esc(mine)}</div>`);
    b.innerHTML = rows.slice(-2).join('') || '<div class="cs-ccl faint">Captions show here as people talk.</div>';
  }
  function renderWarn() {
    const r = root(); if (!r) return; const b = $('.cs-warn', r);
    b.classList.toggle('hidden', !warn); if (!warn) return;
    b.innerHTML = `<span>${esc(warn)}</span><button class="cs-ib" data-c="warn-x" title="Close">${ico('x', 14)}</button>`;
  }

  // ---------- side panels: chat, notes, people ----------
  function renderSide() {
    const r = root(); if (!r) return;
    const side = $('.cs-side', r); side.classList.toggle('hidden', !panel);
    if (!panel) return;
    const keepDraft = side.querySelector('#cs-chat-in') ? side.querySelector('#cs-chat-in').value : '';
    if (panel === 'chat') {
      side.innerHTML = `<div class="cs-sh"><b>Chat in this call</b><button class="cs-ib" data-c="side-x" title="Close">${ico('x', 16)}</button></div>
        <div class="cs-polls">${(call.polls || []).map(pollHtml).join('')}</div>
        <ol class="cs-chat">${(call.chat || []).map(l => `<li><b style="color:${esc(colorOf(l.by))}">${esc(l.name || nameOf(l.by))}</b> <time>${esc(new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</time><p>${esc(l.text)}</p></li>`).join('') || '<li class="cs-empty">Messages here stay with the call. Type <code>/poll Question? A, B</code> for a quick poll.</li>'}</ol>
        <form class="cs-form" id="cs-chat-f"><input class="input" id="cs-chat-in" maxlength="600" autocomplete="off" placeholder="Message everyone in the call"><button class="btn primary" type="submit">Send</button></form>`;
      const inp = side.querySelector('#cs-chat-in'); inp.value = keepDraft;
      const list = side.querySelector('.cs-chat'); list.scrollTop = list.scrollHeight;
      side.querySelector('#cs-chat-f').onsubmit = e => {
        e.preventDefault(); const t = inp.value.trim(); if (!t) return;
        const pm = t.match(/^\/poll\s+(.+?)\?\s*(.+)$/i);
        if (pm) C.send({ type: 'call-poll', q: pm[1] + '?', options: pm[2].split(/\s*[,|]\s*/) });
        else C.send({ type: 'call-chat', text: t });
        inp.value = '';
      };
      unread = 0;
    } else if (panel === 'notes') {
      const c = CAP(), st = c ? c.state() : { on: false, paused: [], shared: [] }, paused = st.paused.includes(meId()), shared = st.shared.includes(meId());
      const lines = c ? c.lines() : [];
      side.innerHTML = `<div class="cs-sh"><b>Notes</b><button class="cs-ib" data-c="side-x" title="Close">${ico('x', 16)}</button></div>
        <div class="cs-nt">${st.on
          ? `<p class="cs-hint"><b>Notes is on.</b> Each person's mic is transcribed on their own device. When the call ends or Notes is turned off, one meeting note and a note for each person are saved in Files${isDmCall() ? ', only for the two of you' : ''}.</p>
            <div class="cs-nt-row"><button class="btn sm" data-c="notes-pause">${paused ? 'Resume my mic' : 'Pause my mic'}</button><button class="btn sm" data-c="notes-off">Turn off and save</button></div>
            <label class="cs-f row"><input type="checkbox" data-c="notes-shared"${shared ? ' checked' : ''}> <span>Several people share this mic (lines say "Speaker"; rename them below)</span></label>
            ${c && !c.supported() ? '<p class="cs-hint">This browser can\'t transcribe, so your mic isn\'t in the notes. You still see everyone else\'s lines.</p>' : ''}`
          : `<p class="cs-hint">Turn on Notes to get live captions with names and meeting notes in Files when the call ends. Everyone in the call is told and can pause their own mic.</p>
            <div class="cs-nt-row"><button class="btn sm primary" data-c="notes-on">Turn on Notes</button></div>`}</div>
        ${st.on ? `<h4 class="cs-h4">Transcript</h4><ol class="cs-tr">${lines.map(l => `<li><button class="linkish cs-who" data-rename="${esc(l.n)}" title="Rename this speaker" style="color:${esc(colorOf(l.by))}">${esc(l.name)}${l.mic ? ` <small>(${esc(l.mic)}'s mic)</small>` : ''}</button> <time>${esc(new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</time><p>${esc(l.text)}</p></li>`).join('') || '<li class="cs-empty">Lines show here as people talk.</li>'}</ol>` : ''}
        <h4 class="cs-h4">Today</h4><div class="cs-notes"><p class="faint">Loading…</p></div>
        <form class="cs-form" id="cs-note-f"><input class="input" id="cs-note-in" maxlength="600" autocomplete="off" placeholder="Add a note for the Secretary"><button class="btn" type="submit">Add</button></form>`;
      loadNotes();
      side.querySelector('#cs-note-f').onsubmit = async e => {
        e.preventDefault(); const inp = side.querySelector('#cs-note-in'), t = inp.value.trim(); if (!t) return;
        try { await C.api('/secretary/note', { method: 'POST', body: { text: t } }); inp.value = ''; loadNotes(); } catch (er) { toast(er.message, 'warn'); }
      };
    } else if (panel === 'people') {
      const inIds = new Set(H().roster().map(m => m.id));
      const others = (C.state().members || []).filter(m => !inIds.has(m.id) && m.role !== 'agent' && m.id !== meId());
      side.innerHTML = `<div class="cs-sh"><b>People</b><button class="cs-ib" data-c="side-x" title="Close">${ico('x', 16)}</button></div>
        <h4 class="cs-h4">In the call</h4><ul class="cs-ppl">${H().roster().map(m => `<li><span class="cs-av sm" style="--c:${esc(colorOf(m.id))}">${esc(initials(nameOf(m.id)))}</span><span>${esc(nameOf(m.id))}${m.id === meId() ? ' (you)' : ''}</span>${m.hand ? '<b class="cs-hand">✋</b>' : ''}${m.muted ? `<i class="cs-mute">${ico('micoff', 14)}</i>` : ''}</li>`).join('')}</ul>
        ${H().roster().length >= 4 ? `<p class="cs-hint">Everyone connects to everyone in a call, so it stays smooth up to about 4 people with video and holds ${H().meshMax || 6} at most. Turn cameras off if it stutters.</p>` : ''}
        ${others.length && !isDmCall() ? `<h4 class="cs-h4">Ring someone</h4><ul class="cs-ppl">${others.map(m => `<li><span class="cs-av sm" style="--c:${esc(m.color || 'var(--peer)')}">${esc(initials(m.name))}</span><span>${esc(m.name)}</span><button class="btn sm" data-ring="${esc(m.id)}">Ring</button></li>`).join('')}</ul>` : ''}`;
    }
  }
  function pollHtml(p) {
    const tot = Object.keys(p.votes || {}).length, mine = (p.votes || {})[meId()];
    return `<div class="cs-poll" data-poll="${esc(p.id)}"><b>${esc(p.q)}</b>${p.options.map((o, i) => { const n = Object.values(p.votes || {}).filter(v => v === i).length, pct = tot ? Math.round(100 * n / tot) : 0;
      return `<button class="cs-opt${mine === i ? ' mine' : ''}" data-vote="${i}"${p.closed ? ' disabled' : ''}><span class="cs-bar-f" style="width:${pct}%"></span><span>${esc(o)}</span><em>${n}</em></button>`; }).join('')}
      <small>${tot} vote${tot === 1 ? '' : 's'}${p.closed ? ' · closed' : ''}${p.by === meId() && !p.closed ? ' · <button class="linkish" data-close-poll>Close poll</button>' : ''}</small></div>`;
  }
  async function loadNotes() {
    const box = root() && root().querySelector('.cs-notes'); if (!box) return;
    try {
      const t = await C.api('/secretary/summary');
      box.innerHTML = `${(t.summary || []).length ? `<ul class="cs-sum">${t.summary.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="faint">Nothing said today yet.</p>'}
        ${(t.actions || []).length ? `<h4 class="cs-h4">Action items</h4><ul class="cs-sum">${t.actions.slice(0, 8).map(a => `<li>${esc(a.title)}${a.ownerName ? ` · <b>${esc(a.ownerName)}</b>` : ''}${a.task ? ' · task' : ''}</li>`).join('')}</ul>` : ''}`;
    } catch (e) { box.innerHTML = `<p class="faint">${esc(e.message)}</p>`; }
  }

  // ---------- "follow me" and the lobby ----------
  function renderPresent() {
    const r = root(); if (!r) return; const b = $('.cs-present', r);
    const p = call.presenting;
    b.classList.toggle('hidden', !p);
    if (!p) return;
    const mine = p === meId(), following = window.TribeCursors && window.TribeCursors.following() === p;
    b.innerHTML = mine ? `<span>You're presenting TribeCode. Everyone who follows sees the screen you're on.</span><button class="btn sm" data-c="present-stop">Stop presenting</button>`
      : `<span><b>${esc(nameOf(p))}</b> is presenting TribeCode.</span><button class="btn sm ${following ? '' : 'primary'}" data-c="follow">${following ? 'Following' : 'Follow'}</button>`;
  }
  function renderKnock() {
    const r = root(); if (!r) return; const b = $('.cs-knock', r);
    b.classList.toggle('hidden', !knocks.length);
    b.innerHTML = knocks.map(k => `<div class="cs-k"><span><b>${esc(k.name)}</b> wants to join</span><button class="btn sm primary" data-admit="${esc(k.id)}">Let in</button><button class="btn sm ghost" data-deny="${esc(k.id)}">Not now</button></div>`).join('');
  }

  // ---------- more menu: settings, recording, lock, present, history ----------
  async function openMore(btn) {
    const r = root(), pop = $('.cs-pop', r), me = H().me(), d = await H().devices();
    const sel = (k, list, label) => list.length ? `<label class="cs-f"><span>${label}</span><select data-dev="${k}"><option value="">Default</option>${list.map((x, i) => `<option value="${esc(x.deviceId)}"${(localStorage.getItem('tribecode.call.' + k) || '').includes(x.deviceId) && x.deviceId ? ' selected' : ''}>${esc(x.label || `${label} ${i + 1}`)}</option>`).join('')}</select></label>` : '';
    pop.innerHTML = `<div class="cs-pm">
      ${!H().canShare() ? '<p class="cs-pm-note">Screen sharing isn\'t available on this phone. You can still watch when someone shares from a computer.</p>' : ''}
      <button role="menuitem" data-c="deaf">${me.deaf ? 'Undeafen (hear everyone)' : 'Deafen (mute everyone for me)'}</button>
      <button role="menuitem" data-c="ptt">${me.ptt ? 'Turn off push to talk' : 'Push to talk (hold Space)'}</button>
      <button role="menuitem" data-c="rec">${rec ? 'Stop recording' : 'Record the call (everyone is told)'}</button>
      <button role="menuitem" data-c="present">${call.presenting === meId() ? 'Stop presenting TribeCode' : 'Present TribeCode (follow me)'}</button>
      <button role="menuitem" data-c="lock">${call.locked ? 'Unlock the call' : 'Lock the call (newcomers knock)'}</button>
      ${me.video && isPhone() ? '<button role="menuitem" data-c="flip">Flip camera</button>' : ''}
      <button role="menuitem" data-c="history">Call history</button>
      ${sel('mic', d.mic, 'Microphone')}${sel('cam', d.cam, 'Camera')}${d.canPickOut ? sel('out', d.out, 'Speaker') : ''}
      <label class="cs-f row"${H().canShare() ? '' : ' hidden'}><input type="checkbox" data-c="shareaudio"${JSON.parse(localStorage.getItem('tribecode.call.shareAudio') || 'false') ? ' checked' : ''}> <span>Share sound with my screen</span></label>
    </div>`;
    pop.classList.remove('hidden');
    const br = btn.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(innerWidth - 300, br.left - 120)) + 'px'; pop.style.bottom = (innerHeight - br.top + 8) + 'px';
    pop.querySelectorAll('[data-dev]').forEach(s => s.onchange = () => H().setDevice(s.dataset.dev, s.value).catch(e => toast(e.message, 'warn')));
    const sa = pop.querySelector('[data-c="shareaudio"]'); sa.onchange = () => { try { localStorage.setItem('tribecode.call.shareAudio', JSON.stringify(sa.checked)); } catch {} };
  }
  function closePop() { const r = root(); if (r) $('.cs-pop', r).classList.add('hidden'); }
  function openReact(btn) {
    const r = root(), pop = $('.cs-pop', r);
    pop.innerHTML = `<div class="cs-react">${REACT.map(e => `<button data-emoji="${e}" aria-label="React ${e}">${e}</button>`).join('')}</div>`;
    pop.classList.remove('hidden');
    const br = btn.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(innerWidth - 300, br.left - 100)) + 'px'; pop.style.bottom = (innerHeight - br.top + 8) + 'px';
  }
  function float(by, emoji) {
    const r = root(); if (!r || !open) return;
    const f = document.createElement('span'); f.className = 'cs-float'; f.textContent = emoji; f.title = nameOf(by);
    f.style.left = (15 + Math.random() * 70) + '%';
    $('.cs-floats', r).appendChild(f); setTimeout(() => f.remove(), 2600);
  }

  // ---------- recording: everyone's voices mixed on this device, saved to Files ----------
  async function startRec() {
    if (rec || !window.MediaRecorder) return toast('This browser can’t record.', 'warn');
    if (!confirm('Record this call? Everyone in it sees a red dot and chat says so. The recording goes to the project\'s Files.')) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), dest = ctx.createMediaStreamDestination();
    const srcs = [H().localAudio(), ...H().remoteAudio()].filter(Boolean).map(s => { try { const n = ctx.createMediaStreamSource(s); n.connect(dest); return n; } catch { return null; } });
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined), chunks = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec = { mr, ctx, chunks, srcs, t0: Date.now() };
    mr.start(1000); C.send({ type: 'call-rec', on: true }); renderBar();
  }
  async function stopRec() {
    if (!rec) return; const r = rec; rec = null;
    const done = new Promise(res => { r.mr.onstop = res; }); try { r.mr.stop(); } catch {} await done;
    r.ctx.close().catch(() => {});
    const blob = new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' });
    let fileId = '';
    try { if (window.TribeVoiceNote) fileId = (await window.TribeVoiceNote.upload({ blob, mime: blob.type }, `huddle-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${/mp4/.test(blob.type) ? 'm4a' : 'webm'}`)).id; toast('Recording saved to Files'); }
    catch (e) { toast('The recording didn’t save: ' + e.message, 'warn'); }
    C.send({ type: 'call-rec', on: false, file: fileId }); renderBar();
  }

  // ---------- laser pointer + pen on screens (coordinates are 0..1 of the video) ----------
  const ink = new Map();   // key -> [{ by, kind, pts, at }]
  function drawInk() {
    const r = root(); const boxes = [...(r ? r.querySelectorAll('.cs-tile.screen') : []), ...document.querySelectorAll('.screen-win')];
    for (const box of boxes) {
      const owner = box.dataset.id || box.dataset.peer, cv = box.querySelector('canvas'), v = box.querySelector('video'); if (!cv || !v) continue;
      const w = v.clientWidth, h = v.clientHeight; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const g = cv.getContext('2d'); g.clearRect(0, 0, w, h);
      for (const s of ink.get(owner) || []) {
        g.strokeStyle = colorOf(s.by); g.fillStyle = colorOf(s.by); g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
        if (s.kind === 'laser') { const age = (Date.now() - s.at) / 1500; if (age > 1) continue; g.globalAlpha = 1 - age; g.beginPath(); g.arc(s.pts[0][0] * w, s.pts[0][1] * h, 7, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
        else { g.beginPath(); s.pts.forEach(([x, y], i) => i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)); g.stroke(); }
      }
    }
  }
  setInterval(() => { if (ink.size) drawInk(); }, 120);
  function addInk(owner, s) { const l = ink.get(owner) || []; l.push(s); if (l.length > 60) l.shift(); ink.set(owner, l); drawInk(); }
  let stroke = null;
  document.addEventListener('pointerdown', e => {
    const box = e.target.closest && e.target.closest('.cs-tile.screen video, .cs-tile.screen canvas, .screen-win .sw-body'); if (!box || !H() || !H().inCall()) return;
    const host = box.closest('.cs-tile, .screen-win'), owner = host.dataset.id || host.dataset.peer, v = host.querySelector('video'), rr = v.getBoundingClientRect();
    const at = ev => [Math.max(0, Math.min(1, (ev.clientX - rr.left) / rr.width)), Math.max(0, Math.min(1, (ev.clientY - rr.top) / rr.height))];
    if (e.shiftKey || host.classList.contains('pen')) { stroke = { owner, pts: [at(e)], at }; e.preventDefault(); }
    else { const p = at(e); addInk(owner, { by: meId(), kind: 'laser', pts: [p], at: Date.now() }); C.send({ type: 'call-pointer', to: owner, kind: 'laser', x: p[0], y: p[1] }); }
  });
  document.addEventListener('pointermove', e => { if (!stroke) return; stroke.pts.push(stroke.at(e)); if (stroke.pts.length % 4 === 0) addInk(stroke.owner, { by: meId(), kind: 'pen-live', pts: stroke.pts.slice(), at: Date.now() }); });
  document.addEventListener('pointerup', () => {
    if (!stroke) return; const s = stroke; stroke = null;
    const l = (ink.get(s.owner) || []).filter(x => x.kind !== 'pen-live'); ink.set(s.owner, l);
    addInk(s.owner, { by: meId(), kind: 'pen', pts: s.pts, at: Date.now() });
    C.send({ type: 'call-pointer', to: s.owner, kind: 'pen', x: s.pts[0][0], y: s.pts[0][1], pts: s.pts.slice(0, 200) });
  });

  // ---------- clicks ----------
  async function onClick(e) {
    const t = e.target; const c = t.closest('[data-c]'); const h = H();
    const em = t.closest('[data-emoji]'); if (em) { C.send({ type: 'call-react', emoji: em.dataset.emoji }); closePop(); return; }
    const rn = t.closest('[data-rename]'); if (rn) { const l = (CAP() ? CAP().lines() : []).find(x => String(x.n) === rn.dataset.rename); const name = prompt('Who said this?', l && l.name !== 'Speaker' ? l.name : ''); if (name && name.trim()) CAP().rename(Number(rn.dataset.rename), name.trim()); return; }
    const ring = t.closest('[data-ring]'); if (ring) { C.send({ type: 'call-ring', to: ring.dataset.ring }); ring.textContent = 'Ringing…'; ring.disabled = true; return; }
    const ad = t.closest('[data-admit]'); if (ad) { C.send({ type: 'call-admit', id: ad.dataset.admit }); knocks = knocks.filter(k => k.id !== ad.dataset.admit); renderKnock(); return; }
    const dn = t.closest('[data-deny]'); if (dn) { knocks = knocks.filter(k => k.id !== dn.dataset.deny); renderKnock(); return; }
    const vt = t.closest('[data-vote]'); if (vt) { C.send({ type: 'call-poll', poll: vt.closest('[data-poll]').dataset.poll, vote: Number(vt.dataset.vote) }); return; }
    const cp = t.closest('[data-close-poll]'); if (cp) { C.send({ type: 'call-poll', poll: cp.closest('[data-poll]').dataset.poll, close: true }); return; }
    if (!c) { if (!t.closest('.cs-pop')) closePop(); return; }
    const k = c.dataset.c;
    if (!['more', 'react'].includes(k)) closePop();
    if (k === 'mic') h.toggleMute();
    else if (k === 'cam') await h.toggleCamera();
    else if (k === 'share') await h.share();
    else if (k === 'hand') h.toggleHand();
    else if (k === 'react') openReact(c);
    else if (k === 'more') openMore(c);
    else if (k === 'chat' || k === 'notes' || k === 'people') { panel = panel === k && !c.classList.contains('cs-noteson') ? null : k; renderSide(); }
    else if (k === 'side-x') { panel = null; renderSide(); }
    else if (k === 'leave') { if (rec) await stopRec(); h.leave(); closeStage(); }
    else if (k === 'min') closeStage();
    else if (k === 'view') { view = view === 'grid' ? 'speaker' : 'grid'; pinned = null; }
    else if (k === 'pin') { const key = c.closest('.cs-tile').dataset.key; pinned = pinned === key ? null : key; }
    else if (k === 'pip') { const v = c.closest('.cs-tile').querySelector('video'); try { document.pictureInPictureElement === v ? await document.exitPictureInPicture() : await v.requestPictureInPicture(); } catch (er) { toast('Picture in picture isn’t available here.', 'warn'); } }
    else if (k === 'deaf') h.toggleDeaf();
    else if (k === 'ptt') h.setPtt(!h.me().ptt);
    else if (k === 'rec') rec ? stopRec() : startRec();
    else if (k === 'present') C.send({ type: 'call-present', on: call.presenting !== meId(), view: document.body.dataset.view || '' });
    else if (k === 'present-stop') C.send({ type: 'call-present', on: false });
    else if (k === 'follow') { if (window.TribeCursors) window.TribeCursors.follow(window.TribeCursors.following() === call.presenting ? null : call.presenting); if (call.presentView && window.TribeApp && call.presentView !== document.body.dataset.view) { try { window.TribeApp.show(call.presentView); } catch {} } closeStage(); }
    else if (k === 'lock') C.send({ type: 'call-lock', on: !call.locked });
    else if (k === 'flip') h.flipCamera();
    else if (k === 'notes-on') { if (CAP()) CAP().toggle(true); }
    else if (k === 'notes-off') { if (CAP()) { CAP().toggle(false); toast('Saving the meeting notes to Files…'); } }
    else if (k === 'notes-pause') { const cc = CAP(); if (cc) cc.pause(!cc.state().paused.includes(meId())); }
    else if (k === 'notes-shared') { if (CAP()) CAP().setShared(c.checked); }
    else if (k === 'notice-x') notice = null;
    else if (k === 'warn-x') warn = null;
    else if (k === 'history') { closePop(); showHistory(); }
    render();
  }

  async function showHistory() {
    let d; try { d = await C.api('/calls/history'); } catch (e) { return toast(e.message, 'warn'); }
    const r = root() || ensure(), side = $('.cs-side', r); panel = 'history'; side.classList.remove('hidden');
    const fmt = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const len = c => Math.max(1, Math.round((Date.parse(c.ended) - Date.parse(c.started)) / 60000));
    side.innerHTML = `<div class="cs-sh"><b>Call history</b><button class="cs-ib" data-c="side-x" title="Close">${ico('x', 16)}</button></div>
      <ul class="cs-hist">${(d.calls || []).map(c => `<li><b>${esc(fmt(c.started))}</b><span>${len(c)} min · ${esc((c.names || []).join(', '))}</span>${(c.chat || []).length ? `<small>${c.chat.length} chat message${c.chat.length === 1 ? '' : 's'}</small>` : ''}${(c.recordings || []).some(x => x.file) ? '<small>Recorded · in Files</small>' : ''}</li>`).join('') || window.TribeUI.emptyHTML({ tag: 'li', bare: true, cls: 'cs-empty', line: 'No calls yet.' })}</ul>`;
  }

  // ---------- ringing (outside a call too) ----------
  function ringCard(by, name, missed, m = {}) {
    document.querySelectorAll('.call-ring').forEach(x => x.remove());
    const d = document.createElement('div'); d.className = 'call-ring'; d.setAttribute('role', 'alertdialog');
    d.innerHTML = missed ? `<span>Missed call from <b>${esc(name)}</b></span><button class="btn sm primary" data-ring-join>Call back</button><button class="btn sm ghost" data-ring-x>Dismiss</button>`
      : `<span class="call-ring-av" style="--c:${esc(colorOf(by))}">${esc(initials(name))}</span><span><b>${esc(name)}</b> ${m.video ? 'is video calling you' : 'is calling you'}</span><button class="btn sm primary" data-ring-join>Answer</button><button class="btn sm ghost" data-ring-x>Not now</button>`;
    document.body.appendChild(d);
    d.querySelector('[data-ring-join]').onclick = async () => {
      d.remove();
      if (missed) return callPerson(by);
      if (!H().inCall()) await H().join({ dm: m.dm || null, video: !!m.video });
      if (H().inCall()) openStage();
    };
    d.querySelector('[data-ring-x]').onclick = () => { d.remove(); if (!missed) C.send({ type: 'call-decline', to: by }); };
    if (!missed) setTimeout(() => d.isConnected && d.remove(), 30_000);
  }
  async function callPerson(id, o = {}) { await H().callPerson(id, o); if (H().inCall()) openStage(); }

  // ---------- events ----------
  C.on('ws', m => {
    if (m.type === 'call-state') { if (m.id) call = { ...call, ...m }; else call = { id: null, polls: [], chat: [], recording: [], locked: false, presenting: null }; render(); }
    else if (m.type === 'call-chat') { call.chat = [...(call.chat || []), m].slice(-200); if (panel !== 'chat' && m.by !== meId()) unread++; if (open) { renderSide(); renderBar(); } }
    else if (m.type === 'call-react') float(m.by, m.emoji);
    else if (m.type === 'call-pointer') { const owner = m.to || m.by; if (m.kind === 'clear') ink.delete(owner); else addInk(owner, { by: m.by, kind: m.kind, pts: m.pts && m.pts.length ? m.pts : [[m.x, m.y]], at: Date.now() }); }
    else if (m.type === 'call-present' && m.on && call.presenting === m.by && m.by !== meId()) {   // the presenter moved to another screen
      if (window.TribeCursors && window.TribeCursors.following() === m.by && m.view && m.view !== document.body.dataset.view && window.TribeApp) { try { window.TribeApp.show(m.view); } catch {} }
    }
    else if (m.type === 'call-present') { call.presenting = m.on ? m.by : null; call.presentView = m.on ? m.view : null; if (m.on && m.by !== meId()) toast(`${m.name || nameOf(m.by)} is presenting TribeCode. Open the call to follow.`); if (!m.on && window.TribeCursors && window.TribeCursors.following()) window.TribeCursors.follow(null); render(); }
    else if (m.type === 'call-knock') { if (!knocks.some(k => k.id === m.id)) knocks.push({ id: m.id, name: m.name }); toast(`${m.name} wants to join the call`); renderKnock(); }
    else if (m.type === 'call-lobby') toast('This call is locked. Someone in it will let you in.');
    else if (m.type === 'call-ring') ringCard(m.by, m.name, false, m);
    else if (m.type === 'call-missed') ringCard(m.by, m.name, true, m);
    else if (m.type === 'call-declined') toast(`${m.name || nameOf(m.by)} can't talk right now.`);
    else if (m.type === 'call-noanswer') toast(`${m.name || nameOf(m.to)} didn't answer. They'll see a missed call.`);
    else if (m.type === 'captions') {   // the notice: whoever is in the call when Notes is on (or joins later) is told once
      if (m.on && H() && H().inCall() && m.meeting && noticeSeen !== m.meeting) { noticeSeen = m.meeting; if (m.by !== meId()) notice = m.meeting; if (!open && m.by !== meId()) toast('Notes is on in this call: what you say is transcribed for the meeting notes. Pause yours from Notes.'); }
      if (!m.on) notice = null;
      render();
    }
  });
  document.addEventListener('tribe:notes', () => { if (!open) return; renderCC(); renderNotice(); if (panel === 'notes' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.cs-side input[type="text"], .cs-side .input'))) renderSide(); renderBar(); });
  document.addEventListener('tribe:call', e => {
    const n = e.detail.name;
    if (n === 'leave') { closeStage(); knocks = []; panel = panel === 'history' ? panel : null; if (rec) stopRec(); warn = null; notice = null; noticeSeen = ''; }
    else if (n === 'join') { C.send({ type: 'call-sync' }); const cs = CAP() && CAP().state(); if (cs && cs.on && cs.meeting) { noticeSeen = cs.meeting; notice = cs.meeting; toast('Notes is on in this call: what you say is transcribed for the meeting notes. Pause yours from Notes.'); } }
    else if (n === 'relay-needed') { warn = `Couldn't connect to ${nameOf(e.detail.id)}. ${e.detail.relay ? 'Their network may be blocking calls; try Wi-Fi.' : 'Calls over cellular or strict networks may need a relay (TURN) server; the host can add one in Settings.'}`; renderWarn(); toast(warn, 'warn'); }
    else if (n === 'reconnecting') toast(`Reconnecting to ${nameOf(e.detail.id)}…`);
    else if (n === 'screen-win') drawInk();
    if (open) { if (n === 'levels' && view === 'speaker') renderGrid(); else if (n !== 'levels') render(); else renderGrid(); }
  });
  function startQuality() { stopQuality(); qTimer = setInterval(async () => { for (const m of H().roster()) if (m.id !== meId()) { const q = await H().quality(m.id); if (q) qual.set(m.id, q); } renderGrid(); }, 3000); }
  function stopQuality() { clearInterval(qTimer); qTimer = null; }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open && !e.defaultPrevented) { const pop = root() && !$('.cs-pop', root()).classList.contains('hidden'); if (pop) closePop(); else if (panel) { panel = null; renderSide(); } else closeStage(); }
    if (e.ctrlKey && e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      // U: the stage (K is the repo's Context window); H only on the stage (the design canvas uses Ctrl Shift H to hide)
      if (k === 'u') { e.preventDefault(); open ? closeStage() : openStage(); }
      else if (k === 'h' && open && H() && H().inCall()) { e.preventDefault(); e.stopPropagation(); H().toggleHand(); }
    }
  });
  // presenting TribeCode: tell followers whenever I move to another screen
  new MutationObserver(() => { if (call.presenting && call.presenting === meId()) C.send({ type: 'call-present', on: true, view: document.body.dataset.view || '' }); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  const fromHash = () => { if (location.hash === '#/call' && !open) openStage(); };
  addEventListener('hashchange', fromHash);
  if (C && C.on) C.on('hello', () => setTimeout(fromHash, 80));

  window.TribeCall = { open: openStage, close: closeStage, isOpen: () => open, callPerson, ring: id => C.send({ type: 'call-ring', to: id }), react: e => C.send({ type: 'call-react', emoji: e }), history: showHistory, state: () => call };
})();
