// Planning: Calendar view (week + month), natural-language quick add from the palette, task due chips,
// the Home "Upcoming" card, event/task/person peeks, and the "Join huddle" button on scheduled-huddle chat lines.
// Server side: server/plan.js (events in calendar/<id>.md, reminders via bus.notify).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient, F = window.TribeFloat, esc = F.esc;
  const DAY = 86400000, HOUR_PX = 48, SNAP = 15;
  const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sow = d => { const x = sod(d); return addDays(x, -((x.getDay() + 6) % 7)); };   // Monday
  const fmtT = d => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const H12 = /[ap]m/i.test(new Date(2000, 0, 1, 13).toLocaleTimeString([], { hour: 'numeric' }));
  const fmtRange = (s, e) => {                      // "10 – 11 AM", "11:30 AM – 12:30 PM", "16:00 – 17:30"
    if (!H12) return `${fmtT(s)} – ${fmtT(e)}`;
    const hm = d => { const x = new Date(d), h = x.getHours(), m = x.getMinutes(); return { t: `${h % 12 || 12}${m ? ':' + pad(m) : ''}`, ap: h < 12 ? 'AM' : 'PM' }; };
    const a = hm(s), b = hm(e); return a.ap === b.ap ? `${a.t} – ${b.t} ${b.ap}` : `${a.t} ${a.ap} – ${b.t} ${b.ap}`;
  };
  const fmtDay = d => new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const sameDay = (a, b) => ymd(new Date(a)) === ymd(new Date(b));
  const members = () => (C.state().members || []).filter(m => m.role !== 'agent');
  const member = id => (C.state().members || []).find(m => m.id === id);
  const fg = c => { const n = parseInt(String(c || '#888888').slice(1), 16); return ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114) > 150 ? '#12151A' : '#FFFFFF'; };
  const ini = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const toast = t => window.TribeApp && window.TribeApp.toast(t);
  const relDay = d => { const t = sod(new Date()), x = sod(d), n = Math.round((x - t) / DAY); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 1 && n < 7 ? x.toLocaleDateString([], { weekday: 'short' }) : x.toLocaleDateString([], { month: 'short', day: 'numeric' }); };

  // ================= natural-language quick add =================
  // "huddle tomorrow 4pm with Maya", "design review fri 16:00 for 1h with Jay and Sam", "task ship login due friday"
  function parse(input, now = new Date()) {
    let s = ' ' + String(input || '').trim() + ' ';
    const found = {};
    const take = (re, fn) => { const m = s.match(re); if (m) { fn(m); s = s.replace(m[0], ' '); return true; } return false; };
    take(/\s(?:every week|weekly|each week)\s/i, () => { found.repeat = 'weekly'; });
    take(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?)\b/i, m => { found.dur = Math.round(parseFloat(m[1]) * (/^h/i.test(m[2]) ? 60 : 1)); });
    take(/\s(?:for\s+)?(?:an?\s+)?(half an hour|hour)\b/i, m => { found.dur = /half/i.test(m[1]) ? 30 : 60; });
    take(/\swith\s+(.+?)(?=\s(?:at|on|for|tomorrow|today|tonight|next|every|due)\s|\s\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s|\s*$)/i, m => {
      found.with = m[1].split(/\s*(?:,|\band\b|&|\+)\s*/i).map(x => x.trim().replace(/^@/, '')).filter(Boolean);
    });
    take(/\s(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a|p)\b/i, m => { let h = +m[1] % 12; if (/^p/i.test(m[3])) h += 12; found.time = [h, +(m[2] || 0)]; })
      || take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/, m => { found.time = [+m[1], +m[2]]; })
      || take(/\s(?:at\s+)?(noon|midday|midnight)\b/i, m => { found.time = /mid(night)/i.test(m[1]) ? [0, 0] : [12, 0]; })
      || take(/\sat\s+(\d{1,2})\b/i, m => { const h = +m[1]; found.time = [h < 8 ? h + 12 : h, 0]; });
    const due = /\sdue\s/i.test(s); s = s.replace(/\sdue\s/i, ' ');
    take(/\s(?:on\s+)?(today|tonight|tomorrow|tmrw|tmr)\b/i, m => { const k = m[1].toLowerCase(); found.day = addDays(sod(now), k === 'today' || k === 'tonight' ? 0 : 1); if (k === 'tonight' && !found.time) found.time = [19, 0]; })
      || take(/\s(?:on\s+)?(next\s+)?(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(?:day|nesday|rsday|urday)?\b/i, m => {
        const want = DOW.indexOf(m[2].slice(0, 3).toLowerCase()); let n = (want - now.getDay() + 7) % 7;
        if (m[1] && n === 0) n = 7;
        found.day = addDays(sod(now), n); found.weekday = !m[1] && n === 0;   // "friday" on a Friday: today, unless that time has passed
      })
      || take(/\sin\s+(\d+)\s+days?\b/i, m => { found.day = addDays(sod(now), +m[1]); })
      || take(/\s(?:on\s+)?(\d{4})-(\d{2})-(\d{2})\b/, m => { found.day = new Date(+m[1], +m[2] - 1, +m[3]); })
      || take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})\b/, m => { const d = new Date(now.getFullYear(), +m[1] - 1, +m[2]); found.day = d < sod(now) ? new Date(now.getFullYear() + 1, +m[1] - 1, +m[2]) : d; });
    const isTask = /^\s*(task|todo|to-do)\b[:\s]/i.test(s) || due;
    s = s.replace(/^\s*(task|todo|to-do|schedule|add|new event|event|book)\b[:\s]*/i, ' ').replace(/\s(at|on)\s*$/i, ' ').replace(/\s+/g, ' ').trim();
    if (!found.day && !found.time) return null;
    let title = s;
    const huddle = /\b(huddle|call|standup|sync)\b/i.test(title);
    if (isTask) {
      if (!title) return null;
      return { kind: 'task', title: title[0].toUpperCase() + title.slice(1), due: ymd(found.day || sod(now)) };
    }
    const names = found.with || [];
    if (!title) title = 'Huddle';
    title = title[0].toUpperCase() + title.slice(1);
    if (names.length && /^(huddle|call|meeting|sync|chat)$/i.test(title)) title += ' with ' + names.join(', ');
    let day = found.day || sod(now);
    const [h, mi] = found.time || [9, 0];
    let start = new Date(day); start.setHours(h, mi, 0, 0);
    if (!found.day && start < now) start = addDays(start, 1);                 // "4pm" when it's already 5pm: tomorrow
    if (found.weekday && start < now) start = addDays(start, 7);
    return { kind: 'event', title, start: start.toISOString(), duration: found.dur || 30, with: names, huddle: /\bhuddle\b/i.test(input) || (huddle && names.length > 0 && /\b(call|sync)\b/i.test(title)), repeat: found.repeat || null };
  }
  const matchPeople = names => {
    const ms = members(), out = [], miss = [];
    for (const n of names || []) { const l = n.toLowerCase(); const m = ms.find(x => x.name.toLowerCase() === l) || ms.find(x => x.name.toLowerCase().split(/\s+/)[0] === l) || ms.find(x => x.name.toLowerCase().startsWith(l)); if (m) out.push(m); else miss.push(n); }
    return { found: out, missing: miss };
  };
  function describe(p) {
    if (p.kind === 'task') return `Task “${p.title}” · due ${relDay(fromYmd(p.due))}`;
    const ppl = matchPeople(p.with);
    return `${p.title} · ${relDay(new Date(p.start))} ${fmtT(p.start)} · ${p.duration >= 60 ? (p.duration / 60) + 'h' : p.duration + 'm'}${p.repeat ? ' · weekly' : ''}${ppl.found.length ? '' : ''}`;
  }
  async function quickAdd(p) {
    if (!C.connected()) return toast('Connect to a tribe to schedule things.');
    if (p.kind === 'task') {
      const { task } = await C.api('/tasks', { method: 'POST', body: { title: p.title, due: p.due } });
      toast(`Task added, due ${relDay(fromYmd(p.due))}`); return task;
    }
    const ppl = matchPeople(p.with);
    const { event } = await C.api('/calendar', { method: 'POST', body: { title: p.title, start: p.start, duration: p.duration, attendees: ppl.found.map(m => m.id), huddle: p.huddle, repeat: p.repeat } });
    toast(`Scheduled ${event.title} · ${relDay(new Date(event.start))} ${fmtT(event.start)}${ppl.missing.length ? ` · not in the tribe: ${ppl.missing.join(', ')}` : ''}`);
    cal.anchor = new Date(event.start); window.TribeApp.show('calendar');
    return event;
  }

  // ================= data =================
  const cal = { mode: localStorage.getItem('tribecode.calMode') || 'week', anchor: new Date(), occ: [], events: [], tasks: [], loaded: false, scrolled: false };
  const range = () => {
    if (cal.mode === 'week') { const a = sow(cal.anchor); return [a, addDays(a, 7)]; }
    const first = new Date(cal.anchor.getFullYear(), cal.anchor.getMonth(), 1), a = sow(first); return [a, addDays(a, 42)];
  };
  let loadSeq = 0;
  async function load() {
    const my = ++loadSeq; const [a, b] = range();
    if (C.connected()) {
      try { const r = await C.api(`/calendar?from=${encodeURIComponent(a.toISOString())}&to=${encodeURIComponent(b.toISOString())}`); if (my !== loadSeq) return; cal.occ = r.occurrences; cal.events = r.events; cal.tasks = r.tasks; }
      catch (e) { toast('Could not load the calendar: ' + e.message); }
    }
    cal.loaded = true; render();
  }

  // ================= calendar view =================
  function ensureView() {
    let v = $('#view-calendar');
    if (!v && $('#main')) { v = document.createElement('section'); v.id = 'view-calendar'; v.className = 'hidden'; $('#main').appendChild(v); }
    return v;
  }
  function render() {
    const v = ensureView(); if (!v || (v.classList.contains('hidden') && cal.rendered)) return;
    cal.rendered = true;
    const [a, b] = range();
    const label = cal.mode === 'week'
      ? (() => { const e = addDays(b, -1), mo = d => d.toLocaleDateString([], { month: 'short' }); return a.getMonth() === e.getMonth() ? `${mo(a)} ${a.getDate()} – ${e.getDate()}, ${e.getFullYear()}` : `${mo(a)} ${a.getDate()} – ${mo(e)} ${e.getDate()}, ${e.getFullYear()}`; })()
      : cal.anchor.toLocaleDateString([], { month: 'long', year: 'numeric' });
    v.innerHTML = `<div class="view-head cal-headbar"><h1>Calendar</h1>
        <div class="cal-nav"><button class="btn ghost" data-cal="prev" title="Previous" aria-label="Previous">‹</button><button class="btn" data-cal="today">Today</button><button class="btn ghost" data-cal="next" title="Next" aria-label="Next">›</button></div>
        <span class="cal-label" id="cal-label">${esc(label)}</span>
        <div class="tabs" id="cal-mode"><button data-mode="week" class="${cal.mode === 'week' ? 'on' : ''}">Week</button><button data-mode="month" class="${cal.mode === 'month' ? 'on' : ''}">Month</button></div>
        <button class="btn primary" id="cal-new" style="margin-left:auto">New event</button></div>
      <div id="cal-body"></div>`;
    v.querySelector('[data-cal="prev"]').onclick = () => step(-1);
    v.querySelector('[data-cal="next"]').onclick = () => step(1);
    v.querySelector('[data-cal="today"]').onclick = () => { cal.anchor = new Date(); cal.scrolled = false; load(); };
    v.querySelectorAll('#cal-mode [data-mode]').forEach(b => b.onclick = () => { cal.mode = b.dataset.mode; localStorage.setItem('tribecode.calMode', cal.mode); load(); });
    $('#cal-new').onclick = () => { const s = new Date(); s.setMinutes(s.getMinutes() < 30 ? 30 : 60, 0, 0); editor({ start: s.toISOString(), duration: 30 }); };
    if (cal.mode === 'week') week(a); else month(a);
  }
  function step(n) { cal.anchor = cal.mode === 'week' ? addDays(cal.anchor, 7 * n) : new Date(cal.anchor.getFullYear(), cal.anchor.getMonth() + n, 1); load(); }

  const evColor = o => (o.huddle ? 'var(--live)' : 'var(--peer)');
  const avatars = ids => `<span class="cal-avs">${(ids || []).slice(0, 4).map(id => { const m = member(id); return m ? `<span class="cal-av" style="background:${esc(m.color)};color:${fg(m.color)}" title="${esc(m.name)}">${esc(ini(m.name))}</span>` : ''; }).join('')}</span>`;
  const dueClass = t => { const today = ymd(new Date()); return t.status === 'done' ? 'done' : t.due < today ? 'overdue' : t.due === today ? 'today' : ''; };
  const taskChip = t => `<button class="due-chip cal-task ${dueClass(t)}" draggable="true" data-task-chip="${esc(t.id)}" data-peek="task:${esc(t.id)}" title="${esc(t.title)}"><svg class="i"><use href="#i-check"/></svg><span>${esc(t.title)}</span></button>`;

  function week(a) {
    const days = [...Array(7)].map((_, i) => addDays(a, i)), today = ymd(new Date());
    const body = $('#cal-body');
    body.innerHTML = `<div class="cal-week">
      <div class="cal-row cal-dayhead"><div class="cal-gut"></div>${days.map(d => `<div class="cal-dh ${ymd(d) === today ? 'today' : ''}"><span>${d.toLocaleDateString([], { weekday: 'short' })}</span><b>${d.getDate()}</b></div>`).join('')}</div>
      <div class="cal-row cal-allday"><div class="cal-gut">due</div>${days.map(d => `<div class="cal-ad" data-day="${ymd(d)}">${cal.tasks.filter(t => t.due === ymd(d)).map(taskChip).join('')}</div>`).join('')}</div>
      <div class="cal-scroll" id="cal-scroll"><div class="cal-grid" style="height:${24 * HOUR_PX}px">
        ${[...Array(24)].map((_, h) => `<i class="cal-hl" style="top:${h * HOUR_PX}px"></i>`).join('')}
        <div class="cal-gut cal-hours">${[...Array(24)].map((_, h) => `<span style="top:${h * HOUR_PX}px">${h ? new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' }) : ''}</span>`).join('')}</div>
        ${days.map(d => `<div class="cal-col ${ymd(d) === today ? 'today' : ''}" data-col="${ymd(d)}"></div>`).join('')}
      </div></div></div>`;
    for (const d of days) {
      const col = body.querySelector(`[data-col="${ymd(d)}"]`), dayStart = d.getTime(), dayEnd = addDays(d, 1).getTime();
      const items = cal.occ.filter(o => Date.parse(o.start) < dayEnd && Date.parse(o.end) > dayStart).map(o => ({ o, s: Math.max(Date.parse(o.start), dayStart), e: Math.min(Date.parse(o.end), dayEnd) })).sort((x, y) => x.s - y.s || y.e - x.e);
      // lanes for overlapping events
      let cluster = [], laneEnds = [], clusterEnd = 0;
      const flush = () => { for (const it of cluster) it.n = laneEnds.length; cluster = []; laneEnds = []; };
      for (const it of items) {
        if (it.s >= clusterEnd) { flush(); clusterEnd = 0; }
        let lane = laneEnds.findIndex(e => e <= it.s); if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = it.e; it.lane = lane; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e);
      }
      flush();
      col.innerHTML = items.map(({ o, s, e, lane, n }) => {
        const top = (s - dayStart) / 3600000 * HOUR_PX, h = Math.max(20, (e - s) / 3600000 * HOUR_PX - 2);
        return `<div class="cal-ev ${o.huddle ? 'huddle' : ''} ${h < 40 ? 'short' : ''}" data-ev="${esc(o.id)}" data-start="${esc(o.start)}" data-peek="event:${esc(o.key)}" style="top:${top}px;height:${h}px;left:calc(${lane / n * 100}% + 2px);width:calc(${100 / n}% - 4px);--evc:${evColor(o)}">
          <b>${o.huddle ? '<svg class="i"><use href="#i-mic"/></svg>' : ''}${esc(o.title)}</b><span>${h >= 40 ? fmtRange(o.start, o.end) : fmtT(o.start)}${o.repeat ? ' · weekly' : ''}</span>${h >= 58 ? avatars(o.attendees) : ''}</div>`;
      }).join('');
      if (ymd(d) === today) { const n = new Date(); col.insertAdjacentHTML('beforeend', `<div class="cal-now" style="top:${(n.getHours() * 60 + n.getMinutes()) / 60 * HOUR_PX}px"></div>`); }
    }
    const sc = $('#cal-scroll');
    if (!cal.scrolled || cal.lastScroll === undefined) { sc.scrollTop = Math.max(0, (Math.min(new Date().getHours(), 17) - 1.5) * HOUR_PX - (new Date().getHours() < 9 ? 0 : 0)); if (new Date().getHours() < 9) sc.scrollTop = 7.5 * HOUR_PX; cal.scrolled = true; }
    else sc.scrollTop = cal.lastScroll;
    sc.onscroll = () => { cal.lastScroll = sc.scrollTop; };
    bindWeek(body);
    bindTaskDrops(body);
  }

  function slotAt(col, clientY) {
    const r = col.getBoundingClientRect(), mins = Math.max(0, Math.min(24 * 60 - SNAP, Math.round(((clientY - r.top) / HOUR_PX * 60) / SNAP) * SNAP));
    const d = fromYmd(col.dataset.col); d.setMinutes(mins); return d;
  }
  function bindWeek(body) {
    body.querySelectorAll('.cal-col').forEach(col => col.addEventListener('click', e => {
      if (e.target.closest('.cal-ev') || cal.justDragged) return;
      const d = slotAt(col, e.clientY - 12 < 0 ? e.clientY : e.clientY); d.setMinutes(Math.floor(d.getMinutes() / 30) * 30);
      quickCreate({ clientX: e.clientX, clientY: e.clientY }, d);
    }));
    body.querySelectorAll('.cal-ev').forEach(el => el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const ev = cal.events.find(x => x.id === el.dataset.ev); if (!ev) return;
      const sx = e.clientX, sy = e.clientY, start0 = Date.parse(el.dataset.start), offTop = e.clientY - el.getBoundingClientRect().top;
      let moved = false, target = null;
      const mv = m => {
        if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 5) return;
        if (!moved) { moved = true; el.classList.add('dragging'); el.setPointerCapture(e.pointerId); F.peek.hide(); }
        const col = document.elementsFromPoint(m.clientX, m.clientY).find(x => x.classList && x.classList.contains('cal-col')); if (!col) return;
        target = slotAt(col, m.clientY - offTop);
        if (col !== el.parentNode) { col.appendChild(el); el.style.left = '2px'; el.style.width = 'calc(100% - 4px)'; }
        el.style.top = ((target.getHours() * 60 + target.getMinutes()) / 60 * HOUR_PX) + 'px';
        el.querySelector('span').textContent = fmtT(target);
      };
      const up = async () => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        if (!moved) { return; }
        cal.justDragged = true; setTimeout(() => { cal.justDragged = false; }, 50);
        el.classList.remove('dragging');
        if (!target || target.getTime() === start0) return render();
        const delta = target.getTime() - start0;
        const newStart = new Date(Date.parse(ev.start) + delta).toISOString();
        try { await C.api('/calendar/' + ev.id, { method: 'PATCH', body: { start: newStart } }); toast(`Moved ${ev.title} to ${relDay(target)} ${fmtT(target)}`); }
        catch (err) { toast(err.message); }
        load();
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    }));
    body.querySelectorAll('.cal-ev').forEach(el => el.addEventListener('click', e => { if (cal.justDragged) return; e.stopPropagation(); const ev = cal.events.find(x => x.id === el.dataset.ev); if (ev) editor(ev); }));
  }
  function bindTaskDrops(body) {
    body.querySelectorAll('[data-task-chip]').forEach(ch => {
      ch.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-task', ch.dataset.taskChip); e.dataTransfer.effectAllowed = 'move'; F.peek.hide(); });
      ch.addEventListener('click', e => { e.stopPropagation(); window.TribeApp.show('tasks'); });
    });
    body.querySelectorAll('[data-day]').forEach(cell => {
      cell.addEventListener('dragover', e => { if ([...e.dataTransfer.types].some(t => t === 'text/x-task' || t === 'text/x-event')) { e.preventDefault(); cell.classList.add('over'); } });
      cell.addEventListener('dragleave', () => cell.classList.remove('over'));
      cell.addEventListener('drop', async e => {
        cell.classList.remove('over');
        const tid = e.dataTransfer.getData('text/x-task'), evk = e.dataTransfer.getData('text/x-event'); if (!tid && !evk) return;
        e.preventDefault();
        try {
          if (tid) { await C.api('/tasks/' + tid, { method: 'PATCH', body: { due: cell.dataset.day } }); toast(`Due ${relDay(fromYmd(cell.dataset.day))}`); }
          else {
            const [eid, st] = evk.split('|'); const ev = cal.events.find(x => x.id === eid); if (!ev) return;
            const from = new Date(st), to = fromYmd(cell.dataset.day); to.setHours(from.getHours(), from.getMinutes(), 0, 0);
            await C.api('/calendar/' + eid, { method: 'PATCH', body: { start: new Date(Date.parse(ev.start) + (to - from)).toISOString() } });
            toast(`Moved ${ev.title} to ${relDay(to)}`);
          }
        } catch (err) { toast(err.message); }
        load();
      });
    });
  }

  function month(a) {
    const body = $('#cal-body'), today = ymd(new Date()), m = cal.anchor.getMonth();
    const cells = [...Array(42)].map((_, i) => addDays(a, i));
    body.innerHTML = `<div class="cal-month"><div class="cal-mhead">${cells.slice(0, 7).map(d => `<span>${d.toLocaleDateString([], { weekday: 'short' })}</span>`).join('')}</div>
      <div class="cal-mgrid">${cells.map(d => {
        const k = ymd(d), evs = cal.occ.filter(o => sameDay(o.start, d)), ts = cal.tasks.filter(t => t.due === k), all = [...evs.map(o => ({ o })), ...ts.map(t => ({ t }))];
        return `<div class="cal-cell ${d.getMonth() !== m ? 'out' : ''} ${k === today ? 'today' : ''}" data-day="${k}"><span class="n">${d.getDate()}</span>
          ${all.slice(0, 3).map(x => x.o ? `<button class="cal-mev ${x.o.huddle ? 'huddle' : ''}" draggable="true" data-ev="${esc(x.o.id)}" data-start="${esc(x.o.start)}" data-peek="event:${esc(x.o.key)}" style="--evc:${evColor(x.o)}"><i></i><span class="t">${fmtT(x.o.start)}</span> ${esc(x.o.title)}</button>` : taskChip(x.t)).join('')}
          ${all.length > 3 ? `<button class="cal-more" data-more="${k}">+${all.length - 3} more</button>` : ''}</div>`;
      }).join('')}</div></div>`;
    body.querySelectorAll('.cal-cell').forEach(c => c.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const d = fromYmd(c.dataset.day); d.setHours(9, 0, 0, 0); quickCreate({ clientX: e.clientX, clientY: e.clientY }, d);
    }));
    body.querySelectorAll('.cal-mev').forEach(b => {
      b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-event', `${b.dataset.ev}|${b.dataset.start}`); F.peek.hide(); });
      b.addEventListener('click', () => { const ev = cal.events.find(x => x.id === b.dataset.ev); if (ev) editor(ev); });
    });
    body.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { cal.anchor = fromYmd(b.dataset.more); cal.mode = 'week'; load(); });
    bindTaskDrops(body);
  }

  // ---------- quick create (click an empty slot) ----------
  function quickCreate(at, start) {
    if (!C.connected()) return toast('Connect to a tribe to schedule things.');
    const box = document.createElement('div'); box.className = 'cal-quick';
    box.innerHTML = `<div class="tf-eyebrow">${esc(fmtDay(start))} · ${esc(fmtT(start))}</div>
      <input class="cal-in" id="cq-title" placeholder="Event title" maxlength="160" autocomplete="off">
      <div class="cal-qrow"><select id="cq-dur"><option value="15">15 min</option><option value="30" selected>30 min</option><option value="45">45 min</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select>
        <label class="cal-check"><input type="checkbox" id="cq-huddle"> Huddle</label></div>
      <div class="cal-qrow"><button class="btn ghost" id="cq-more">More options</button><button class="btn primary" id="cq-go">Create</button></div>`;
    const p = F.pop({ left: at.clientX, right: at.clientX, top: at.clientY, bottom: at.clientY }, box);
    const go = async () => {
      const title = box.querySelector('#cq-title').value.trim() || 'Untitled event';
      p.close();
      try { await C.api('/calendar', { method: 'POST', body: { title, start: start.toISOString(), duration: +box.querySelector('#cq-dur').value, huddle: box.querySelector('#cq-huddle').checked } }); load(); }
      catch (e) { toast(e.message); }
    };
    box.querySelector('#cq-title').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    box.querySelector('#cq-go').onclick = go;
    box.querySelector('#cq-more').onclick = () => { const t = box.querySelector('#cq-title').value; p.close(); editor({ title: t, start: start.toISOString(), duration: +box.querySelector('#cq-dur').value, huddle: box.querySelector('#cq-huddle').checked }); };
    setTimeout(() => box.querySelector('#cq-title').focus(), 0);
  }

  // ---------- full editor ----------
  function editor(ev) {
    const isNew = !ev.id, me = (C.state().me || {}).id;
    const s = new Date(ev.start), dur = ev.end ? Math.round((Date.parse(ev.end) - Date.parse(ev.start)) / 60000) : ev.duration || 30;
    const att = new Set(ev.attendees || (isNew && me ? [me] : []));
    const m = document.createElement('div'); m.className = 'modal'; m.id = 'cal-editor';
    m.innerHTML = `<div class="modal-card cal-editor"><h2>${isNew ? 'New event' : 'Edit event'}</h2>
      <div class="field"><label for="ce-title">Title</label><input class="input" id="ce-title" maxlength="160" value="${esc(ev.title || '')}" placeholder="Design review"></div>
      <div class="cal-erow"><div class="field"><label for="ce-day">Day</label><input class="input" type="date" id="ce-day" value="${ymd(s)}"></div>
        <div class="field"><label for="ce-time">Start</label><input class="input" type="time" id="ce-time" step="900" value="${pad(s.getHours())}:${pad(s.getMinutes())}"></div>
        <div class="field"><label for="ce-dur">Length</label><select class="input" id="ce-dur">${[15, 30, 45, 60, 90, 120, 180, 240].map(n => `<option value="${n}" ${n === dur ? 'selected' : ''}>${n < 60 ? n + ' min' : n / 60 + (n === 60 ? ' hour' : ' hours')}</option>`).join('')}${[15, 30, 45, 60, 90, 120, 180, 240].includes(dur) ? '' : `<option value="${dur}" selected>${dur} min</option>`}</select></div></div>
      <div class="field"><label>Attendees</label><div class="cal-people">${members().map(x => `<button type="button" class="cal-person ${att.has(x.id) ? 'on' : ''}" data-mid="${esc(x.id)}"><span class="cal-av" style="background:${esc(x.color)};color:${fg(x.color)}">${esc(ini(x.name))}</span>${esc(x.name)}</button>`).join('') || '<span class="faint">Invite friends to add attendees.</span>'}</div></div>
      <div class="toggles cal-toggles">
        <button type="button" class="toggle" id="ce-huddle" role="switch" aria-checked="${!!ev.huddle}">Huddle<small>Posts a “Join huddle” button in chat when it starts.</small><span class="switch"></span></button>
        <button type="button" class="toggle" id="ce-repeat" role="switch" aria-checked="${ev.repeat === 'weekly'}">Repeats weekly<small>Same time every week.</small><span class="switch"></span></button>
      </div>
      <div class="modal-foot">${isNew ? '' : '<button class="btn ghost cal-del" id="ce-del">Delete</button><span style="flex:1"></span>'}<button class="btn" id="ce-cancel">Cancel</button><button class="btn primary" id="ce-save">${isNew ? 'Create' : 'Save'}</button></div></div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.addEventListener('click', e => { if (e.target === m) close(); });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && e.target.id === 'ce-title') m.querySelector('#ce-save').click(); });
    m.querySelectorAll('[data-mid]').forEach(b => b.onclick = () => { b.classList.toggle('on'); });
    m.querySelectorAll('[role=switch]').forEach(b => b.onclick = () => b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true'));
    m.querySelector('#ce-cancel').onclick = close;
    const del = m.querySelector('#ce-del'); if (del) del.onclick = async () => { try { await C.api('/calendar/' + ev.id, { method: 'DELETE' }); close(); toast(`Deleted ${ev.title}`); load(); } catch (e) { toast(e.message); } };
    m.querySelector('#ce-save').onclick = async () => {
      const [y, mo, d] = m.querySelector('#ce-day').value.split('-').map(Number), [h, mi] = (m.querySelector('#ce-time').value || '09:00').split(':').map(Number);
      let start = new Date(y, mo - 1, d, h, mi);
      if (!isNew && ev.repeat === 'weekly' && cal.editingOcc) { /* editing a series from one occurrence keeps the series anchor */ }
      const body = { title: m.querySelector('#ce-title').value.trim() || 'Untitled event', start: start.toISOString(), duration: +m.querySelector('#ce-dur').value,
        attendees: [...m.querySelectorAll('.cal-person.on')].map(b => b.dataset.mid), huddle: m.querySelector('#ce-huddle').getAttribute('aria-checked') === 'true', repeat: m.querySelector('#ce-repeat').getAttribute('aria-checked') === 'true' ? 'weekly' : null };
      try { await C.api(isNew ? '/calendar' : '/calendar/' + ev.id, { method: isNew ? 'POST' : 'PATCH', body }); close(); cal.anchor = start; load(); }
      catch (e) { toast(e.message); }
    };
    setTimeout(() => m.querySelector('#ce-title').focus(), 0);
  }

  // ================= task due chips =================
  function dueChip(t) {
    if (!t.due) return `<button class="due-chip none" data-due="${esc(t.id)}" title="Set a due date"><svg class="i"><use href="#i-cal"/></svg>due</button>`;
    const d = fromYmd(t.due), cls = dueClass(t);
    return `<button class="due-chip ${cls}" data-due="${esc(t.id)}" title="${cls === 'overdue' ? 'Overdue · ' : ''}Due ${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}"><svg class="i"><use href="#i-cal"/></svg>${esc(relDay(d))}</button>`;
  }
  async function setDue(tid, due) {
    if (window.TribeTasks.patch) await window.TribeTasks.patch(tid, { due });
    else await C.api('/tasks/' + tid, { method: 'PATCH', body: { due } });
    if (cal.loaded) load();
    loadUpcoming();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-due]'); if (!b) return;
    e.stopPropagation();
    const t = ((window.TribeTasks && window.TribeTasks.all()) || []).find(x => x.id === b.dataset.due); if (!t) return;
    const today = new Date(), fri = addDays(today, (5 - today.getDay() + 7) % 7 || 7);
    const box = document.createElement('div'); box.className = 'due-pop';
    box.innerHTML = `<div class="tf-eyebrow">Due date</div><input class="cal-in" type="date" id="due-in" value="${esc(t.due || '')}">
      <div class="due-quick"><button data-d="${ymd(today)}">Today</button><button data-d="${ymd(addDays(today, 1))}">Tomorrow</button><button data-d="${ymd(fri)}">Friday</button><button data-d="${ymd(addDays(today, 7))}">Next week</button></div>
      ${t.due ? '<button class="linkish due-clear" data-d="">Clear due date</button>' : ''}`;
    const p = F.pop(b, box);
    box.querySelector('#due-in').onchange = ev => { p.close(); setDue(t.id, ev.target.value || null); };
    box.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { p.close(); setDue(t.id, x.dataset.d || null); });
  }, true);

  // ================= Home: Upcoming card =================
  function ensureUpcoming() {
    let card = $('#upcoming-card'); if (card) return card;
    const grid = $('.home-grid'); if (!grid) return null;
    card = document.createElement('section'); card.className = 'card'; card.id = 'upcoming-card';
    card.innerHTML = `<h3><svg class="i" style="color:var(--peer)"><use href="#i-cal"/></svg>Upcoming<button class="linkish up-all" id="up-all">Calendar →</button></h3><div id="up-list" class="up-list"></div>`;
    const after = $('#standup-card'); if (after) after.after(card); else grid.appendChild(card);
    card.querySelector('#up-all').onclick = () => window.TribeApp.show('calendar');
    return card;
  }
  async function loadUpcoming() {
    const card = ensureUpcoming(); if (!card) return;
    const list = card.querySelector('#up-list');
    if (!C.connected()) { list.innerHTML = '<div class="faint up-empty">Connect to a tribe to see what\'s coming up.</div>'; return; }
    let items = []; try { items = (await C.api('/calendar/upcoming?n=3')).items; } catch { return; }
    list.innerHTML = items.length ? items.map(it => it.kind === 'event'
      ? `<button class="up-item" data-peek="event:${esc(it.key)}" data-up-ev="${esc(it.start)}"><span class="up-when">${esc(relDay(new Date(it.start)))}<b>${esc(fmtT(it.start))}</b></span><span class="up-what"><span class="up-t">${it.huddle ? '<svg class="i"><use href="#i-mic"/></svg>' : ''}${esc(it.title)}</span>${avatars(it.attendees)}</span></button>`
      : `<button class="up-item" data-peek="task:${esc(it.id)}" data-up-task="1"><span class="up-when ${it.overdue ? 'overdue' : ''}">${it.overdue ? 'Overdue' : 'Due'}<b>${esc(relDay(fromYmd(it.due)))}</b></span><span class="up-what"><span class="up-t"><svg class="i up-task"><use href="#i-check"/></svg>${esc(it.title)}</span></span></button>`).join('')
      : '<div class="faint up-empty">Nothing scheduled. Press <span class="kbd">Ctrl K</span> and type “huddle tomorrow 4pm”.</div>';
    list.querySelectorAll('[data-up-ev]').forEach(b => b.onclick = () => { cal.anchor = new Date(b.dataset.upEv); window.TribeApp.show('calendar'); });
    list.querySelectorAll('[data-up-task]').forEach(b => b.onclick = e => { if (!e.target.closest('[data-due]')) window.TribeApp.show('tasks'); });
  }

  // ================= peeks =================
  F.peek.register('event', async key => {
    const [eid, at] = key.split('@');
    let ev = cal.events.find(x => x.id === eid);
    if (!ev) { try { ev = (await C.api('/calendar/' + eid)).event; } catch { return null; } }
    const start = at || ev.start, end = new Date(Date.parse(start) + (Date.parse(ev.end) - Date.parse(ev.start)));
    const now = Date.now(), live = Date.parse(start) - 10 * 60000 <= now && end > now;
    return {
      eyebrow: ev.huddle ? '<span class="chip teal">huddle</span>' : '<span class="chip peer">event</span>', title: ev.title,
      rows: [['When', `${esc(relDay(new Date(start)))} · ${esc(fmtRange(start, end))}`], ['Repeats', ev.repeat ? 'weekly' : ''], ['With', (ev.attendees || []).map(id => esc((member(id) || {}).name || 'someone')).join(', ')]],
      actions: [...(ev.huddle ? [{ label: live ? 'Join huddle' : 'Join early', primary: live, run: () => window.TribeHuddle.join() }] : []), { label: 'Open', run: () => { cal.anchor = new Date(start); window.TribeApp.show('calendar'); editor(ev); } }],
    };
  });
  F.peek.register('task', async tid => {
    let t = ((window.TribeTasks && window.TribeTasks.all()) || []).find(x => x.id === tid);
    if (!t) { try { t = (await C.api('/tasks')).tasks.find(x => x.id === tid); } catch {} }
    if (!t) return null;
    const me = (C.state().me || {}).id, who = t.assignee ? (member(t.assignee) || {}).name : '';
    const status = { backlog: 'Backlog', doing: 'In progress', review: 'Review', done: 'Done' }[t.status] || t.status;
    return {
      eyebrow: '<span class="chip">task</span>', title: t.title,
      rows: [['Status', esc(status)], ['Owner', who ? esc(who) : '<span class="faint">unassigned</span>'], ['Due', t.due ? dueChip(t) : '']],
      body: t.body ? esc(t.body.slice(0, 160)) : '',
      actions: [...(me && t.assignee !== me ? [{ label: 'Assign to me', run: async () => { await C.api('/tasks/' + t.id, { method: 'PATCH', body: { assignee: me } }); toast(`Assigned “${t.title}” to you`); } }] : []), { label: 'Open', primary: true, run: () => window.TribeApp.show('tasks') }],
    };
  });
  F.peek.register('person', async mid => {
    const m = member(mid); if (!m) return null;
    const me = (C.state().me || {}).id;
    const tasks = ((window.TribeTasks && window.TribeTasks.all()) || []).filter(t => t.assignee === mid && t.status !== 'done');
    const next = cal.occ.filter(o => (o.attendees || []).includes(mid) && Date.parse(o.end) > Date.now())[0];
    const inHuddle = (C.state().huddle || []).some(h => h.id === mid);
    return {
      eyebrow: `<span class="cal-av" style="background:${esc(m.color)};color:${fg(m.color)}">${esc(ini(m.name))}</span> <span class="${m.online ? 'tf-on' : 'faint'}">${m.online ? 'online' : 'offline'}</span>${m.role === 'host' ? ' · host' : ''}`,
      title: m.name,
      rows: [['Now', m.online ? esc(m.where || 'Home') : ''], ['Tasks', tasks.length ? `${tasks.length} open` : ''], ['Next', next ? `${esc(next.title)} · ${esc(relDay(new Date(next.start)))} ${esc(fmtT(next.start))}` : '']],
      actions: m.id === me ? [] : [
        ...(inHuddle ? [{ label: 'Join huddle', primary: true, run: () => window.TribeHuddle.join() }] : []),
        { label: 'Mention', run: () => { const i = $('#chat-input'); i.value = `@${m.name} `; i.focus(); } },
        { label: 'Schedule', run: () => { const s = new Date(); s.setMinutes(s.getMinutes() < 30 ? 30 : 60, 0, 0); editor({ title: `Huddle with ${m.name.split(' ')[0]}`, start: s.toISOString(), duration: 30, huddle: true, attendees: [me, m.id].filter(Boolean) }); } },
      ],
    };
  });
  F.peek.bind('#room-list [data-follow]', el => 'person:' + el.dataset.follow);

  // ================= floating task board =================
  const floatTasks = () => F.open({ id: 'tasks', kind: 'tasks', ...taskWin() });
  function taskWin() {
    return { title: 'Tasks', w: 320, h: 440, onOpenFull: () => window.TribeApp.show('tasks'), render: body => {
      const draw = () => {
        const ts = (window.TribeTasks && window.TribeTasks.all()) || [];
        const cols = [['doing', 'In progress'], ['review', 'Review'], ['backlog', 'Backlog'], ['done', 'Done']];
        body.innerHTML = `<div class="ft-list">${cols.map(([k, l]) => { const l2 = ts.filter(t => t.status === k).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); return l2.length ? `<div class="ft-h">${l}<span>${l2.length}</span></div>${l2.map(t => `<div class="ft-row ${k === 'done' ? 'done' : ''}" data-peek="task:${esc(t.id)}"><button class="ft-box" data-ft="${esc(t.id)}" title="${k === 'done' ? 'Mark not done' : 'Mark done'}">${k === 'done' ? '<svg class="i"><use href="#i-tick"/></svg>' : ''}</button><span class="ft-t">${esc(t.title)}</span>${t.due ? dueChip(t) : ''}</div>`).join('')}` : ''; }).join('') || '<div class="faint" style="padding:12px">No tasks yet.</div>'}</div>`;
        body.querySelectorAll('[data-ft]').forEach(b => b.onclick = () => { const t = ts.find(x => x.id === b.dataset.ft); if (t) (window.TribeTasks.patch ? window.TribeTasks.patch(t.id, { status: t.status === 'done' ? 'backlog' : 'done', order: Date.now() }) : C.api('/tasks/' + t.id, { method: 'PATCH', body: { status: t.status === 'done' ? 'backlog' : 'done' } })); });
      };
      draw();
      // Redraw on board changes (the board's own list is the source of truth).
      let t = null; const kick = () => { clearTimeout(t); t = setTimeout(() => { if (body.isConnected) draw(); }, 40); };
      taskKicks.add(kick);
      if (window.TribeTasks && !window.TribeTasks.all().length && C.connected()) window.TribeTasks.load().then(draw).catch(() => {});
      return () => { taskKicks.delete(kick); clearTimeout(t); };
    } };
  }
  const taskKicks = new Set();
  C.on('task', () => taskKicks.forEach(k => k())); C.on('task-removed', () => taskKicks.forEach(k => k())); C.on('hello', () => setTimeout(() => taskKicks.forEach(k => k()), 600));
  F.restorer('tasks', () => taskWin());

  // ================= chat: "Join huddle" button on scheduled-huddle lines =================
  function decorateChat() {
    document.querySelectorAll('#chat-list .msg.sys p').forEach(p => {
      if (p.dataset.huddleBtn || !/Scheduled huddle .* is starting/.test(p.textContent)) return;
      p.dataset.huddleBtn = '1';
      const b = document.createElement('button'); b.className = 'btn chat-join'; b.innerHTML = '<svg class="i"><use href="#i-mic"/></svg>Join huddle';
      b.onclick = () => window.TribeHuddle.join(); p.after(b);
    });
  }
  const chatList = $('#chat-list'); if (chatList) new MutationObserver(decorateChat).observe(chatList, { childList: true, subtree: false });

  // ================= palette: views, quick add =================
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(q => {
    const out = [
      { kind: 'Go to', label: 'Calendar', keys: 'calendar schedule week month events', run: () => window.TribeApp.show('calendar') },
      { kind: 'Action', label: 'New event', keys: 'schedule meeting calendar huddle book', run: () => { window.TribeApp.show('calendar'); const s = new Date(); s.setMinutes(s.getMinutes() < 30 ? 30 : 60, 0, 0); editor({ start: s.toISOString(), duration: 30 }); } },
      { kind: 'Action', label: 'Pop out the task board', keys: 'float floating window tasks pin', run: floatTasks },
    ];
    const raw = ($('#pal-input') || {}).value || q;   // the palette lowercases its query; names keep their case here
    const p = raw && raw.trim().length > 3 ? parse(raw) : null;
    if (p && p.with && p.with.length) {
      const fixed = p.with.map(n => { const m = matchPeople([n]).found[0]; return m ? m.name : n; });
      if (p.title.endsWith(' with ' + p.with.join(', '))) p.title = p.title.slice(0, -p.with.join(', ').length) + fixed.join(', ');
      p.with = fixed;
    }
    if (p) out.unshift({ kind: p.kind === 'task' ? 'Add task' : 'Schedule', label: describe(p), hint: p.kind === 'event' && p.with.length ? 'with ' + p.with.join(', ') : 'Enter', score: 500, run: () => quickAdd(p).catch(e => toast(e.message)) });
    return out;
  });

  // ================= live updates =================
  C.on('*', m => {
    if (m.type === 'event' || m.type === 'event-removed') { if (cal.loaded && !$('#view-calendar').classList.contains('hidden')) load(); else cal.loaded && (cal.stale = true); loadUpcoming(); }
    if (m.type === 'task') { if (cal.loaded && !$('#view-calendar').classList.contains('hidden')) load(); clearTimeout(cal.upT); cal.upT = setTimeout(loadUpcoming, 200); }
    if (m.type === 'notification' && m.fallback && m.notification) {
      const n = m.notification; toast(`${n.title}${n.body ? ' · ' + n.body : ''}`);
      (window.TribePlan.received = window.TribePlan.received || []).push(n);
    }
  });
  C.on('hello', () => { loadUpcoming(); if (window.TribeTasks && !window.TribeTasks.all().length) window.TribeTasks.load().catch(() => {}); });
  setInterval(() => { if (!document.hidden) loadUpcoming(); }, 60000);
  setInterval(() => { const v = $('#view-calendar'); if (v && !v.classList.contains('hidden') && cal.mode === 'week') { const n = $('.cal-now'); if (n) { const d = new Date(); n.style.top = (d.getHours() * 60 + d.getMinutes()) / 60 * HOUR_PX + 'px'; } } }, 60000);
  ensureView(); ensureUpcoming();

  window.TribePlan = { parse, quickAdd, load, render, editor, dueChip, floatTasks, loadUpcoming, state: () => cal, show: () => { ensureView(); load(); } };
})();
