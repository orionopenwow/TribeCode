// p14: scheduled meetings. One sheet ("Schedule a meeting") opened from the calendar, the composer "+", the call button
// in a channel or DM header (Start now / Schedule…), a person's card and Ctrl K. The meeting card in chat reads the
// event live (the 'event' broadcast from server/plan.js) and shows Going / Maybe / Can't, then "Join now" at start time,
// or Cancelled. Add to my calendar downloads a standard .ics (no links, no tokens). Home shows "Next: … · in 25 min · Join".
// Server: server/meetings.js (/api/meetings). Public:
//   window.TribeMeetings = { open(opts), card(ref, ch), join(id), ics(ev), nextLine(), load(), all() }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, sz = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, sz) : '');
  const t = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const toast = (m, k) => window.TribeApp && window.TribeApp.toast(m, k);
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const me = () => (C.state() || {}).me || {};
  const members = () => (C.state().members || []).filter(m => m.role !== 'agent');
  const member = id => (C.state().members || []).find(m => m.id === id);
  const first = n => String(n || '').trim().split(/\s+/)[0];
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
  const MIN = 60000;
  const fmtWhen = d => new Date(d).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const fmtDay = d => new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const cache = new Map();   // id -> meeting event
  const asking = new Set();

  // ---------- data ----------
  function nextOcc(ev, now = Date.now()) {
    const s0 = Date.parse(ev.start), len = Math.max(MIN, Date.parse(ev.end) - s0 || 30 * MIN);
    if (ev.repeat !== 'weekly' || s0 + len > now) return { start: s0, end: s0 + len };
    const d = new Date(s0); let i = 0;
    const skip = Math.floor((now - len - s0) / (7 * 864e5)) - 1; if (skip > 0) d.setDate(d.getDate() + skip * 7);
    while (d.getTime() + len <= now && i++ < 2000) d.setDate(d.getDate() + 7);
    return { start: d.getTime(), end: d.getTime() + len };
  }
  function stateOf(ev, now = Date.now()) {
    if (ev.cancelled) return 'cancelled';
    const o = nextOcc(ev, now);
    if (now >= o.end) return 'over';
    if (now >= o.start - 2 * MIN) return 'live';
    return 'soon';
  }
  const lenOf = ev => Math.round((Date.parse(ev.end) - Date.parse(ev.start)) / MIN);
  const lenLabel = n => (n % 60 === 0 && n >= 60 ? `${n / 60} h` : `${n} min`);
  function peopleOf(ev) {
    if (ev.dm || ev.scope === 'people') return (ev.attendees || []).filter(id => member(id));
    return members().map(m => m.id);
  }
  const canRsvp = ev => peopleOf(ev).includes(me().id) && me().role !== 'spectator';
  const canEdit = ev => ev.by === me().id || me().role === 'host' || !!ev.canEdit;   // canEdit: the server says (project leads)
  function put(ev) { if (!ev || !ev.id) return; const was = cache.get(ev.id); cache.set(ev.id, ev.canEdit === undefined && was ? { ...ev, canEdit: was.canEdit } : ev); }
  async function load() {
    if (!C.connected()) return;
    try { const r = await C.api('/meetings'); (r.meetings || []).forEach(put); paint(); } catch {}
  }
  async function fetchOne(id) {
    if (asking.has(id) || !C.connected()) return; asking.add(id);
    try { const r = await C.api('/meetings/' + encodeURIComponent(id)); put(r.meeting); paint(); } catch { asking.delete(id); }
  }

  // ---------- the chat card ----------
  function inner(ev) {
    const st = stateOf(ev), o = nextOcc(ev), mine = (ev.rsvp || {})[me().id];
    const n = a => Object.values(ev.rsvp || {}).filter(x => x === a).length;
    const who = ev.dm ? (ev.attendees || []).filter(id => id !== me().id).map(id => first((member(id) || {}).name)).join(', ')
      : ev.scope === 'people' ? `${(ev.attendees || []).length} people` : t('Everyone in the project');
    const meta = [fmtWhen(o.start), lenLabel(lenOf(ev)), ev.repeat === 'weekly' ? t('Weekly') : '', ev.notesOn ? t('Notes on') : ''].filter(Boolean).join(' · ');
    const agenda = ev.agenda ? `<ul class="mtg-agenda">${ev.agenda.split('\n').filter(Boolean).slice(0, 4).map(l => `<li>${esc(l.replace(/^[-*•]\s*/, ''))}</li>`).join('')}</ul>` : '';
    let act = '';
    if (st === 'cancelled') act = `<span class="mtg-state cancelled">${t('Cancelled')}</span>`;
    else if (st === 'over') act = `<span class="mtg-state">${t('Ended')}</span>`;
    else if (st === 'live') act = `<button type="button" class="btn primary mtg-join" data-mt-join="${esc(ev.id)}">${ic('phone', 14)}${t('Join now')}</button>`;
    else if (canRsvp(ev)) act = `<div class="mtg-rsvp" role="group" aria-label="${esc(t('Are you going?'))}">${[['yes', 'Going'], ['maybe', 'Maybe'], ['no', "Can't"]].map(([a, l]) => `<button type="button" class="mtg-rb ${mine === a ? 'on' : ''}" data-mt-rsvp="${a}" aria-pressed="${mine === a}">${t(l)}${n(a) ? `<b>${n(a)}</b>` : ''}</button>`).join('')}</div>`;
    else act = `<span class="mtg-state">${n('yes')} going</span>`;
    return `<div class="mtg-top"><span class="mtg-ic">${ic('calendar', 15)}</span><span class="mtg-eb">${t('Meeting')}</span><span class="mtg-who">${esc(who)}</span></div>
      <b class="mtg-title">${esc(ev.title)}</b><div class="mtg-meta">${esc(meta)}</div>${agenda}
      <div class="mtg-foot">${act}<span class="mtg-sp"></span><span class="mtg-links">
        ${st !== 'cancelled' && st !== 'over' ? `<button type="button" class="mtg-link" data-mt-ics="${esc(ev.id)}">${ic('download', 13)}${t('Add to my calendar')}</button>` : ''}
        ${canEdit(ev) && st !== 'cancelled' && st !== 'over' ? `<button type="button" class="mtg-link" data-mt-edit="${esc(ev.id)}">${t('Edit')}</button>` : ''}</span></div>`;
  }
  function card(ref, ch) {
    const id = ref && ref.id; if (!id) return '';
    const ev = cache.get(id);
    if (!ev) fetchOne(id);
    const st = ev ? stateOf(ev) : '';
    return `<div class="mtg-card ${st ? 'st-' + st : ''}" data-meeting="${esc(id)}">${ev ? inner(ev) : `<div class="mtg-top"><span class="mtg-ic">${ic('calendar', 15)}</span><span class="mtg-eb">${t('Meeting')}</span></div><b class="mtg-title">${esc(ref.title || '')}</b>`}</div>`;
  }
  function paint() {
    document.querySelectorAll('.mtg-card[data-meeting]').forEach(el => {
      const ev = cache.get(el.dataset.meeting); if (!ev) return;
      const html = inner(ev); if (el._h === html) return; el._h = html; el.innerHTML = html;
      el.className = `mtg-card st-${stateOf(ev)}`;
    });
    paintNext();
  }

  // ---------- Home: "Next: Design review · in 25 min · Join" ----------
  function upcoming(now = Date.now()) {
    return [...cache.values()].filter(ev => !ev.cancelled && peopleOf(ev).includes(me().id) && (ev.rsvp || {})[me().id] !== 'no')
      .map(ev => ({ ev, o: nextOcc(ev, now) })).filter(x => x.o.end > now && x.o.start < now + 7 * 864e5).sort((a, b) => a.o.start - b.o.start);
  }
  function nextHtml() {
    const x = upcoming()[0]; if (!x) return '';
    const d = x.o.start - Date.now(), live = d <= 2 * MIN;
    const when = live ? t('now') : d < 60 * MIN ? `in ${Math.max(1, Math.round(d / MIN))} min` : d < 864e5 && new Date(x.o.start).getDate() === new Date().getDate() ? new Date(x.o.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : fmtWhen(x.o.start);
    return `<span class="mtg-next-ic">${ic('calendar', 14)}</span><span class="mtg-next-k">${t('Next')}:</span><button type="button" class="mtg-next-t" data-mt-open="${esc(x.ev.id)}">${esc(x.ev.title)}</button><span class="mtg-next-w">· ${esc(when)}</span>${d <= 10 * MIN ? `<button type="button" class="btn sm primary mtg-next-j" data-mt-join="${esc(x.ev.id)}">${t('Join')}</button>` : ''}`;
  }
  const nextLine = () => `<div class="mtg-next" id="mtg-next">${nextHtml()}</div>`;
  function paintNext() { document.querySelectorAll('.mtg-next').forEach(el => { const h = nextHtml(); if (el._h !== h) { el._h = h; el.innerHTML = h; el.classList.toggle('empty', !h); } }); }

  // ---------- joining ----------
  async function join(id) {
    const H = window.TribeHuddle;
    if (!H) return toast(t('Calls are loading. Try again in a moment.'), 'warn');
    try {
      const r = await C.api(`/meetings/${encodeURIComponent(id)}/join`, { method: 'POST' });
      if (r.note) toast(t(r.note));
      if (H.inCall && H.inCall()) { if (window.TribeCall) window.TribeCall.open(); return; }
      if (r.how === 'call' && r.with) { if (window.TribeCall && window.TribeCall.callPerson) await window.TribeCall.callPerson(r.with); else await H.callPerson(r.with); return; }
      await H.join();
      if (H.inCall && H.inCall() && window.TribeCall) window.TribeCall.open();
    } catch (e) { toast(e.message); }
  }

  // ---------- .ics ----------
  const icsDate = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); }
  function icsOf(ev) {
    const o = ev.repeat === 'weekly' ? { start: Date.parse(ev.start), end: Date.parse(ev.end) } : nextOcc(ev);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TribeCode//Meetings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      `UID:${ev.id}@tribecode`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(o.start)}`, `DTEND:${icsDate(o.end)}`, `SUMMARY:${icsText(ev.title)}`,
      ...(ev.agenda ? [`DESCRIPTION:${icsText(ev.agenda)}`] : []), ...(ev.repeat === 'weekly' ? ['RRULE:FREQ=WEEKLY'] : []),
      `STATUS:${ev.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(ev.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  function ics(ev) {
    const blob = new Blob([icsOf(ev)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (String(ev.title || 'meeting').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'meeting') + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- the sheet ----------
  const roundUp = d => { const x = new Date(d); x.setSeconds(0, 0); const m = x.getMinutes(); x.setMinutes(m < 30 ? 30 : 60); return x; };
  function open(opts = {}) {
    if (!C.connected()) return toast(t('Connect to a tribe to schedule a meeting.'));
    if (me().role === 'spectator') return toast(t('Spectators can watch but not schedule.'));
    const ev = opts.ev && opts.ev.id ? opts.ev : null;
    let dm = ev ? ev.dm : opts.dm || null;
    if (!ev && opts.with && window.TribeDM && window.TribeDM.channelWith) dm = window.TribeDM.channelWith(opts.with);
    if (!ev && !dm && opts.channel && /^dm-/.test(opts.channel)) dm = opts.channel;
    const peer = dm ? members().find(m => window.TribeDM && window.TribeDM.channelWith && window.TribeDM.channelWith(m.id) === dm) || (ev ? member((ev.attendees || []).find(id => id !== me().id)) : null) : null;
    const start = ev ? new Date(nextOcc(ev).start) : opts.start ? new Date(opts.start) : roundUp(new Date(Date.now() + 5 * MIN));
    const st = { scope: ev ? ev.scope || 'project' : dm ? 'dm' : 'project', picked: new Set(ev && ev.scope === 'people' ? ev.attendees : []), len: ev ? lenOf(ev) : opts.duration || 30,
      repeat: ev ? ev.repeat === 'weekly' : false, notes: ev ? !!ev.notesOn : false };
    const proj = (window.TribeProjects && window.TribeProjects.cur && (window.TribeProjects.cur() || {}).name) || 'the project';
    const lens = [15, 30, 60].includes(st.len) ? [15, 30, 60] : [15, 30, 60, st.len];
    const m = document.createElement('div'); m.className = 'modal mtg-modal' + (phone() ? ' mtg-phone' : ''); m.id = 'mtg-sheet';
    m.innerHTML = `<div class="modal-card mtg-sheet" role="dialog" aria-modal="true" aria-labelledby="mtg-h">
      <div class="mtg-sh-head"><span class="eyebrow">${t('Meeting')}</span><h2 id="mtg-h">${ev ? t('Edit meeting') : t('Schedule a meeting')}</h2></div>
      <div class="field"><label for="mtg-title">${t('Title')}</label><input class="input" id="mtg-title" maxlength="160" autocomplete="off" value="${esc(ev ? ev.title : opts.title || '')}" placeholder="${esc(t('Design review'))}"></div>
      <div class="field"><label>${t('When')}</label>
        <div class="mtg-quick" role="group">${[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next week']].map(([k, l]) => `<button type="button" class="mtg-chip" data-q="${k}">${t(l)}</button>`).join('')}</div>
        <div class="mtg-row"><input class="input" type="date" id="mtg-day" value="${ymd(start)}" aria-label="${esc(t('Day'))}"><input class="input" type="time" id="mtg-time" step="300" value="${pad(start.getHours())}:${pad(start.getMinutes())}" aria-label="${esc(t('Start time'))}"></div>
        <div class="mtg-tz">${ic('clock', 13)}<span>Your time: ${esc(tz() || 'Local')}</span><span class="mtg-tz-d" id="mtg-tz-d"></span></div>
        <div class="mtg-lens" role="group" aria-label="${esc(t('Length'))}">${lens.map(n => `<button type="button" class="mtg-chip ${n === st.len ? 'on' : ''}" data-len="${n}" aria-pressed="${n === st.len}">${lenLabel(n)}</button>`).join('')}</div></div>
      <div class="field"><label>${t('Who')}</label>
        ${dm ? `<div class="mtg-dmwho">${ic('lock', 13)}<span>${peer ? `You and ${esc(peer.name)}` : t('Just the two of you')}</span><small>${t('Only you two see it')}</small></div>`
          : `<div class="mtg-seg" role="group"><button type="button" class="mtg-chip ${st.scope === 'project' ? 'on' : ''}" data-scope="project">Everyone in ${esc(proj)}</button><button type="button" class="mtg-chip ${st.scope === 'people' ? 'on' : ''}" data-scope="people">${t('Pick people')}</button></div>
          <div class="mtg-people ${st.scope === 'people' ? '' : 'hidden'}" id="mtg-people">${members().filter(x => x.id !== me().id).map(x => `<button type="button" class="mtg-person ${st.picked.has(x.id) ? 'on' : ''}" data-mid="${esc(x.id)}" aria-pressed="${st.picked.has(x.id)}"><span class="mtg-av" style="background:${esc(x.color || 'var(--surface-3)')}">${esc((x.name || '?')[0].toUpperCase())}</span>${esc(x.name)}</button>`).join('') || `<span class="faint">${t('Invite friends to pick them here.')}</span>`}</div>
          <p class="mtg-hint" id="mtg-big"></p>`}</div>
      <div class="field"><label for="mtg-agenda">${t('Agenda')} <span class="faint">${t('optional')}</span></label><textarea class="input" id="mtg-agenda" rows="3" maxlength="1500" placeholder="${esc(t('A few lines: what to decide, what to bring'))}">${esc(ev ? ev.agenda || '' : '')}</textarea></div>
      <div class="field"><label>${t('Repeat')}</label><div class="mtg-seg" role="group"><button type="button" class="mtg-chip ${st.repeat ? '' : 'on'}" data-rep="0">${t('Does not repeat')}</button><button type="button" class="mtg-chip ${st.repeat ? 'on' : ''}" data-rep="1">${t('Weekly')}</button></div></div>
      <div class="toggles"><button type="button" class="toggle" id="mtg-notes" role="switch" aria-checked="${st.notes}"><span class="mtg-tg">${t('Turn on Notes when it starts')}<small>${t('Captions with names, and meeting notes in Files when the call ends. Everyone is told.')}</small></span><span class="switch"></span></button></div>
      <div class="modal-foot">${ev ? `<button type="button" class="btn ghost mtg-cancel-m" id="mtg-cancel-m">${t('Cancel meeting')}</button><span style="flex:1"></span>` : ''}<button type="button" class="btn" id="mtg-close">${t('Close')}</button><button type="button" class="btn primary" id="mtg-save">${ev ? t('Save') : t('Schedule')}</button></div></div>`;
    document.body.appendChild(m);
    const q = s => m.querySelector(s);
    const close = () => { m.remove(); document.removeEventListener('keydown', esc_); };
    const esc_ = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc_);
    m.addEventListener('click', e => { if (e.target === m) close(); });
    const setDay = d => { q('#mtg-day').value = ymd(d); dayNote(); };
    const dayNote = () => { const [y, mo, d] = q('#mtg-day').value.split('-').map(Number); const el = q('#mtg-tz-d'); if (el && y) el.textContent = '· ' + fmtDay(new Date(y, mo - 1, d)); };
    dayNote(); q('#mtg-day').onchange = dayNote;
    m.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const d = new Date(); if (b.dataset.q === 'tomorrow') d.setDate(d.getDate() + 1); if (b.dataset.q === 'week') d.setDate(d.getDate() + 7); setDay(d); });
    m.querySelectorAll('[data-len]').forEach(b => b.onclick = () => { st.len = +b.dataset.len; m.querySelectorAll('[data-len]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
    const big = () => { const el = q('#mtg-big'); if (el) el.textContent = st.scope === 'people' && st.picked.size > 1 ? t('More than two people: the meeting uses the project huddle.') : st.scope === 'people' && st.picked.size === 1 ? t('Two people: a private call.') : ''; };
    m.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { st.scope = b.dataset.scope; m.querySelectorAll('[data-scope]').forEach(x => x.classList.toggle('on', x === b)); q('#mtg-people').classList.toggle('hidden', st.scope !== 'people'); big(); });
    m.querySelectorAll('[data-mid]').forEach(b => b.onclick = () => { const id = b.dataset.mid; st.picked.has(id) ? st.picked.delete(id) : st.picked.add(id); b.classList.toggle('on', st.picked.has(id)); b.setAttribute('aria-pressed', st.picked.has(id)); big(); });
    big();
    m.querySelectorAll('[data-rep]').forEach(b => b.onclick = () => { st.repeat = b.dataset.rep === '1'; m.querySelectorAll('[data-rep]').forEach(x => x.classList.toggle('on', x === b)); });
    q('#mtg-notes').onclick = () => { st.notes = !st.notes; q('#mtg-notes').setAttribute('aria-checked', st.notes); };
    q('#mtg-close').onclick = close;
    q('#mtg-title').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); q('#mtg-save').click(); } };
    if (q('#mtg-cancel-m')) q('#mtg-cancel-m').onclick = async () => {
      if (!confirm(t('Cancel this meeting? Everyone invited is told.'))) return;
      try { const r = await C.api(`/meetings/${encodeURIComponent(ev.id)}/cancel`, { method: 'POST' }); put(r.meeting); paint(); close(); toast(t('Meeting cancelled')); } catch (e) { toast(e.message); }
    };
    q('#mtg-save').onclick = async () => {
      const [y, mo, d] = q('#mtg-day').value.split('-').map(Number), [h, mi] = (q('#mtg-time').value || '09:00').split(':').map(Number);
      if (!y) return toast(t('Pick a day.'));
      const when = new Date(y, mo - 1, d, h, mi);
      if (st.scope === 'people' && !st.picked.size) return toast(t('Pick at least one person.'));
      const body = { title: q('#mtg-title').value.trim() || t('Meeting'), start: when.toISOString(), duration: st.len, agenda: q('#mtg-agenda').value, repeat: st.repeat ? 'weekly' : null, notesOn: st.notes, tz: tz(),
        ...(ev ? (ev.scope === 'people' ? { people: [...st.picked] } : {}) : { scope: st.scope, ...(dm ? { dm } : {}), ...(st.scope === 'people' ? { people: [...st.picked] } : {}) }) };
      q('#mtg-save').disabled = true;
      try {
        const r = await C.api(ev ? `/meetings/${encodeURIComponent(ev.id)}` : '/meetings', { method: ev ? 'PATCH' : 'POST', body });
        put(r.meeting); paint(); close();
        toast(ev ? t('Meeting updated. Everyone invited sees the change.') : `Scheduled: ${r.meeting.title}`);
        if (window.TribePlan && window.TribePlan.state && window.TribePlan.state().loaded) window.TribePlan.load();
      } catch (e) { q('#mtg-save').disabled = false; toast(e.message); }
    };
    setTimeout(() => { if (!phone()) q('#mtg-title').focus(); }, 0);
    return m;
  }
  async function openId(id) {
    let ev = cache.get(id);
    if (!ev) { try { ev = (await C.api('/meetings/' + encodeURIComponent(id))).meeting; put(ev); } catch (e) { return toast(e.message); } }
    if (stateOf(ev) === 'live') return join(id);
    if (canEdit(ev) && !ev.cancelled) return open({ ev });
    if (window.TribeApp) window.TribeApp.show('calendar');
  }

  // ---------- clicks ----------
  document.addEventListener('click', async e => {
    const el = e.target.closest && e.target.closest('[data-mt-rsvp], [data-mt-join], [data-mt-ics], [data-mt-edit], [data-mt-open]'); if (!el) return;
    e.preventDefault(); e.stopPropagation();
    const id = el.dataset.mtJoin || el.dataset.mtIcs || el.dataset.mtEdit || el.dataset.mtOpen || (el.closest('[data-meeting]') || {}).dataset?.meeting;
    const ev = cache.get(id);
    if (el.dataset.mtJoin) return join(id);
    if (el.dataset.mtOpen) return openId(id);
    if (!ev) return;
    if (el.dataset.mtIcs) return ics(ev);
    if (el.dataset.mtEdit) return open({ ev });
    if (el.dataset.mtRsvp) {
      const a = el.dataset.mtRsvp, prev = ev.rsvp || {};
      put({ ...ev, rsvp: { ...prev, [me().id]: a } }); paint();   // shows at once; the broadcast confirms
      try { const r = await C.api(`/meetings/${encodeURIComponent(id)}/rsvp`, { method: 'POST', body: { answer: a } }); put(r.meeting); paint(); }
      catch (err) { put({ ...ev, rsvp: prev }); paint(); toast(err.message); }
    }
  });
  // a meeting reminder in the inbox: open it (Join when it is on)
  document.addEventListener('click', e => {
    const it = e.target.closest && e.target.closest('.nf-item[data-view^="meeting:"]'); if (!it || e.target.closest('[data-more]')) return;
    e.preventDefault(); e.stopPropagation();
    if (window.TribeNotify) { try { window.TribeNotify.markRead(it.dataset.id); window.TribeNotify.closeInbox(); } catch {} }
    openId(it.dataset.view.slice(8));
  }, true);
  // inbox rows for a meeting get a Join button while it is on
  function decorateInbox() {
    document.querySelectorAll('.nf-item[data-view^="meeting:"]').forEach(it => {
      const id = it.dataset.view.slice(8), ev = cache.get(id), main = it.querySelector('.nf-main');
      const want = ev && stateOf(ev) === 'live' && !it.querySelector('.mtg-nf-join');
      if (want && main) main.insertAdjacentHTML('beforeend', `<div class="nf-actions"><button type="button" class="btn sm primary mtg-nf-join" data-mt-join="${esc(id)}">${t('Join')}</button></div>`);
    });
  }
  new MutationObserver(() => { clearTimeout(decorateInbox.t); decorateInbox.t = setTimeout(decorateInbox, 60); }).observe(document.body, { childList: true, subtree: true });

  // the call button in a channel or DM header: Start now / Schedule…
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.cb-btn[data-cb="huddle"]'); if (!b || b._mtPass) return;
    const H = window.TribeHuddle; if (!H || (H.inCall && H.inCall())) return;
    e.preventDefault(); e.stopPropagation();
    const ch = window.TribeDM && window.TribeDM.current ? window.TribeDM.current() : 'general';
    const dm = /^dm-/.test(String(ch || '')) ? ch : null;
    const F = window.TribeFloat; if (!F) { b._mtPass = true; b.click(); b._mtPass = false; return; }
    F.menu(b, [
      { label: dm ? t('Call now') : t('Start now'), icon: 'i-phone', run: () => { b._mtPass = true; b.click(); b._mtPass = false; } },
      { label: dm ? t('Schedule a call…') : t('Schedule…'), icon: 'i-calendar', run: () => open({ channel: ch, dm }) },
    ]);
  }, true);
  // Ctrl K
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Action', label: t('Schedule a meeting'), keys: 'schedule meeting call calendar invite agenda book', run: () => open({ channel: window.TribeDM && window.TribeDM.current ? window.TribeDM.current() : 'general' }) },
  ]);

  // live
  C.on('ws', m => {
    if (m.type === 'event' && m.event && m.event.kind === 'meeting') { put(m.event); paint(); }
    if (m.type === 'event-removed' && m.id && cache.has(m.id)) { cache.delete(m.id); paint(); }
  });
  C.on('hello', () => { cache.clear(); asking.clear(); load(); });
  C.on('project', () => { load(); });
  setInterval(() => { if (!document.hidden) paint(); }, 15000);
  // a tap on a pushed reminder (service worker / ?open=meeting:<id>)
  const op = new URLSearchParams(location.search).get('open');
  if (op && /^meeting:e-/.test(op)) C.on('hello', function once() { setTimeout(() => openId(op.slice(8)), 500); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'tribe-open' && /^meeting:/.test(String(e.data.view || ''))) openId(String(e.data.view).slice(8)); });

  window.TribeMeetings = { open, openId, card, join, ics, icsOf, nextLine, paint, load, all: () => [...cache.values()], stateOf, nextOcc };
})();
