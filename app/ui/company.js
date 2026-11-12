// Company mode (v0.27), client side. Server side: server/company.js (data contract in the company brief).
//   The Company view (v2, feat/company-gigs) is a one-page report: header (name, mission, health in one sentence),
//   Seats (big cards: avatar, role, holder, what they're on, one action), This week (standup, approvals, decisions),
//   Money (ledger summary + a small flat chart), Charters & goals, Rituals (next run + Run now) and Activity. Sections
//   fold on phones. A seat sheet edits the charter and who holds it. Empty state: "Make this project a company" with
//   template cards; one click makes it. The sidebar row "Company" (or a subtle "Make it a company" for leads), the
//   dashboard's At a glance tile (projects.js asks tile()), and Flint's "make me a company", "who's in charge of X",
//   "give X to my claude".
// Mount points for other features (they listen for the events below and fill the slots):
//   view:  (v2 draws Money itself; seat autopilot lives in each seat sheet)  event 'tribe:company-view'  { project, company }
//   sheet: #co-seat-ledger-slot, #co-seat-autopilot-slot, #co-academy-slot ("Learn this role"),
//          #co-hire-slot (empty seats: "Hire someone for this seat")  event 'tribe:company-sheet' { project, seat, el }
//   empty seat cards also carry <div class="co-hire-slot" data-seat="…">.
// Public: window.TribeCompany = { open, close, refresh, get, tile, flint, openSeat }.
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const NAME = 'company';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const pid = () => (C && C.project ? C.project() : '') || '';
  const me = () => (C.state() || {}).me || {};
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const ago = iso => { if (!iso) return ''; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const initials = n => String(n || '?').split(/[\s·]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const ink = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#12151A'; const n = parseInt(m[1], 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? '#12151A' : '#FFFFFF'; };
  const STATUS = { 'on-track': 'On track', 'needs-you': 'Needs you', blocked: 'Blocked', idle: 'Idle' };
  const KIND_L = { 'ceo-call': 'CEO call', vote: 'Vote', approval: 'Approval', proposal: 'Proposal', decision: 'Decision' };
  const ASK_CHIPS = ['publish', 'spend money', 'email customers', 'sign contracts', 'deploy to production'];

  let st = { d: null, pid: '', busy: false };
  let open = false, seq = 0;
  async function load(p = pid()) {
    if (!p || !C.connected()) { st = { d: null, pid: p }; nav(); return null; }
    const n = ++seq;
    try { const d = await C.api(`/projects/${encodeURIComponent(p)}/company`, { project: p }); if (n === seq) st = { d, pid: p }; }
    catch { if (n === seq) st = { d: null, pid: p }; }
    nav(); if (open) draw();
    return st.d;
  }
  const co = () => (st.d && st.pid === pid() && st.d.company && st.d.company.on ? st.d.company : null);

  // ---------- the view (beside app.js views, like captures.js) ----------
  function section() {
    let s = document.getElementById('view-' + NAME);
    if (!s) { const main = $('#main') || $('.main'); if (!main) return null; s = document.createElement('section'); s.id = 'view-' + NAME; s.className = 'hidden co-view'; s.setAttribute('aria-label', 'Company'); main.appendChild(s); }
    return s;
  }
  function show() {
    const sec = section(); if (!sec) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(x => { if (x !== sec) x.classList.add('hidden'); });
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    document.querySelectorAll('[data-nav].on, [data-go].on').forEach(b => b.classList.remove('on'));
    try { C.sendActivity && C.sendActivity('Company'); } catch {}
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = 'Company';
    draw(); load();
  }
  function hide() { const sec = section(); if (sec) sec.classList.add('hidden'); open = false; }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  function go() { if (window.TribeShell && window.TribeShell.go) window.TribeShell.go('company'); else show(); }

  function avatar(w, cls = '') {
    if (!w) return '';
    const agent = w.role === 'agent';
    const img = w.avatar && /^https:\/\//.test(w.avatar) ? `<img src="${esc(w.avatar)}" alt="">` : agent ? '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-robot"/></svg>' : esc(initials(w.name));
    const bg = agent ? 'var(--accent-2, #38C6B1)' : (w.color || '#6C7CFF');
    return `<span class="co-av ${agent ? 'ag' : ''} ${cls}" style="background:${esc(bg)};color:${ink(agent ? '#38C6B1' : w.color)}" title="${esc(w.name)}">${img}</span>`;
  }
  const holderLine = x => [x.who.person && x.who.person.name, x.who.agent && x.who.agent.name].filter(Boolean).join(' + ');
  // ---------- v2: the company report (feat/company-gigs) ----------
  // Reads top-down like a one-page report: header (name, mission, health in one sentence) → Seats → This week
  // (standup, approvals, decisions) → Money (ledger summary + a small flat chart) → Charters & goals → Rituals (next run,
  // Run now) → Activity. Every section has an icon, a mono eyebrow, a title, an empty state with one action, and on
  // phones it folds (the header is a toggle). Type: body ≥14px, labels ≥12px.
  const ICONS = {
    users: '<path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="8" r="3.2"/><path d="M20 19v-1.4a3.2 3.2 0 0 0-2.4-3.1M15.5 5.1a3.2 3.2 0 0 1 0 6"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>',
    coins: '<circle cx="9" cy="9" r="5"/><path d="M14.5 10.2a5 5 0 1 1-4.3 8.3"/><path d="M9 7v4"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>',
    repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    play: '<path d="M8 5.5v13l10-6.5z"/>',
  };
  const icon = (n, s = 18) => (window.TribeIcons && window.TribeIcons.svg && window.TribeIcons.has && window.TribeIcons.has(n) ? window.TribeIcons.svg(n, s)
    : `<svg class="co-ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const when = iso => { if (!iso) return ''; const d = new Date(iso), t = new Date(); const tm = new Date(t); tm.setDate(t.getDate() + 1);
    const hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === t.toDateString() ? `Today ${hm}` : d.toDateString() === tm.toDateString() ? `Tomorrow ${hm}` : `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${hm}`; };
  function sec(key, ico, eyebrow, title, body, extra = '') {
    const folded = !!ui.fold[key];
    return `<section class="co-sec${folded ? ' folded' : ''}" data-sec="${key}" aria-labelledby="co-h-${key}">
      <header class="co-sec-h"><button class="co-sec-t" type="button" data-fold="${key}" aria-expanded="${!folded}" aria-controls="co-b-${key}"><span class="co-sec-ic">${icon(ico)}</span>
        <span class="co-sec-tt"><span class="eyebrow">${esc(eyebrow)}</span><h2 id="co-h-${key}">${title}</h2></span><span class="co-fold-i">${icon('chev', 16)}</span></button>${extra ? `<div class="co-sec-x">${extra}</div>` : ''}</header>
      <div class="co-sec-b" id="co-b-${key}">${body}</div></section>`;
  }
  const empty = (text, act) => `<div class="co-none"><p>${text}</p>${act || ''}</div>`;

  function seatAction(x, d) {
    const emptySeat = !x.who.person && !x.who.agent, mine = (d.mySeats || []).includes(x.id);
    const posted = ((d.today || {}).standups || {})[x.id];
    if (emptySeat) return d.canLead ? ['hire', 'Hire someone'] : ['open', 'See charter'];
    if (mine && !posted) return ['standup', 'Post standup'];
    if (mine) return ['open', 'Edit seat'];
    if (x.who.person) return ['profile', 'View profile'];
    return ['open', 'See charter'];
  }
  function seatCard(x, ceo, d = st.d) {
    const emptySeat = !x.who.person && !x.who.agent, mine = (d.mySeats || []).includes(x.id);
    const goal = (co() || d.company).goals.find(g => g.seat === x.id);
    const s = ((d.today || {}).standups || {})[x.id];
    const now = s ? (s.next || s.done) : x.last ? x.last.text : '';
    const [act, label] = seatAction(x, d);
    const big = w => w ? avatar(w, 'lg') : '';
    return `<article class="co-seat ${ceo ? 'ceo' : ''} ${emptySeat ? 'empty' : ''} ${mine ? 'mine' : ''}" data-seat="${esc(x.id)}" style="--sc:${esc(x.color)}" tabindex="0" role="button" aria-label="${esc(x.title)} seat${emptySeat ? ', open' : ': ' + esc(holderLine(x))}. ${esc(STATUS[x.status] || '')}">
      <div class="co-seat-top"><span class="co-avs">${emptySeat ? '<span class="co-av lg open" aria-hidden="true">+</span>' : big(x.who.person) + big(x.who.agent)}</span>
        <span class="co-seat-id"><span class="co-role">${esc(x.title)}</span><b>${emptySeat ? 'Open seat' : esc(holderLine(x))}${mine ? ' <small>you</small>' : ''}</b>
          <small class="co-kindl">${emptySeat ? 'A friend or an AI helper can hold it' : x.who.person && x.who.agent ? 'Person + AI helper' : x.who.agent ? 'AI helper' : 'Person'}</small></span>
        <span class="co-pill s-${esc(x.status)}">${esc(STATUS[x.status] || x.status)}</span></div>
      ${emptySeat ? '' : `<div class="co-now"><span class="co-lbl">On now</span><p>${now ? esc(now) : '<span class="faint">No update yet today.</span>'}</p></div>`}
      ${goal ? `<div class="co-seat-goal"><span class="co-lbl">${esc(goal.title)}</span><span class="co-bar sm" role="progressbar" aria-label="${esc(goal.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal.progress}"><i style="width:${goal.progress}%"></i></span><span class="co-pct">${goal.progress}%</span></div>` : ''}
      <div class="co-seat-f"><span class="faint">${x.last ? esc(ago(x.last.at)) : ''}</span><button class="btn sm ${act === 'hire' || act === 'standup' ? 'primary' : ''}" type="button" data-seat-act="${act}" data-sid="${esc(x.id)}">${esc(label)}</button></div></article>`;
  }

  // A live update never wipes what someone is typing: the redraw waits until the field loses focus. Open <details> stay open.
  const ui = { dec: false, week: false, pending: false, sample: false, fold: {} };
  function busyTyping(sec) { const a = document.activeElement; return !!(a && sec.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && (a.value || a.tagName === 'SELECT')); }
  function report(c, d, sample) {
    const lead = d.canLead && !sample, ceo = c.seats.find(x => x.kind === 'ceo'), rest = c.seats.filter(x => x !== ceo);
    const h = d.health || { tone: 'good', text: '' };
    const openSeats = c.seats.filter(x => !x.who.person && !x.who.agent).length;
    const seatsX = lead ? `${d.myAgent && openSeats ? `<button class="btn sm" id="co-fill">Fill ${plural(openSeats, 'open seat')} with ${esc(d.myAgent.name)}</button>` : ''}${c.seats.length < 16 ? '<button class="btn sm" id="co-add">Add a seat</button>' : ''}` : '';
    return `<header class="co-head"><div class="co-h-t"><span class="eyebrow">Company report</span><h1>${esc(c.name)}</h1>
        ${c.mission ? `<p class="co-mission">${esc(c.mission)}</p>` : lead ? '<button class="linkish co-mission-add" id="co-edit-co">Add a one-line mission</button>' : ''}
        ${h.text ? `<p class="co-health t-${esc(h.tone)}" id="co-health"><span class="co-hdot" aria-hidden="true"></span>${esc(h.text)}</p>` : ''}</div>
        ${lead ? `<button class="btn" id="co-settings" aria-label="Company settings">${icon('gear', 16)}Settings</button>` : ''}</header>
      ${sec('seats', 'users', 'Seats', `Who does what <span class="co-n">${c.seats.length}</span>`, `<div class="co-seats">${ceo ? seatCard(ceo, true, d) : ''}${rest.map(x => seatCard(x, false, d)).join('')}</div>`, seatsX)}
      ${sec('week', 'calendar', 'This week', 'Standup, approvals, decisions', `<div class="co-week-g">${todayCard(c, d)}${approvalsCard(c, d)}${decisionsCard(c, d, sample)}</div>`)}
      ${sec('money', 'coins', 'Money', 'This month’s books', `<div id="co-money" class="co-money">${sample ? moneyHtml(SAMPLE_MONEY()) : '<p class="faint">Loading the ledger…</p>'}</div>`, `<button class="btn sm" id="co-money-open">Open Money</button>`)}
      ${sec('goals', 'target', 'Charters & goals', 'This month’s goals', goalsCard(c, d))}
      ${sec('rituals', 'repeat', 'Rituals', 'Next check-ins', ritualsCard(c, d, sample))}
      ${sec('activity', 'activity', 'Activity', 'What happened lately', activityCard(c, d))}`;
  }
  function draw() {
    const sec = section(); if (!sec || !open) return;
    if (busyTyping(sec)) { if (!ui.pending) { ui.pending = true; document.activeElement.addEventListener('blur', () => setTimeout(() => { ui.pending = false; draw(); }, 150), { once: true }); } return; }
    if (!C.connected()) { sec.innerHTML = `<div class="co-wrap"><div class="card co-empty"><span class="eyebrow">Company</span><h2>Join or start a tribe first</h2></div></div>`; return; }
    if (!st.d || st.pid !== pid()) { sec.innerHTML = `<div class="co-wrap"><p class="faint">Loading…</p></div>`; return; }
    const c = co(); if (!c) return ui.sample ? drawSample(sec) : drawEmpty(sec);
    ui.sample = false;
    if (phone() && !ui.foldInit) { ui.foldInit = true; ui.fold = { rituals: true, activity: true }; }
    const d = st.d;
    sec.innerHTML = `<div class="co-wrap co-v2">${report(c, d, false)}</div>`;
    wire(sec, c, d);
    const dec = $('#co-dec');
    if (dec) { dec.open = ui.dec; dec.addEventListener('toggle', () => { ui.dec = dec.open; }); }
    money($('#co-money'), st.pid);
    try { window.dispatchEvent(new CustomEvent('tribe:company-view', { detail: { project: st.pid, company: c } })); } catch {}
  }

  function todayCard(c, d) {
    const t = d.today || { standups: {}, missing: [] }, held = c.seats.filter(x => x.who.person || x.who.agent);
    const mine = c.seats.filter(x => (d.mySeats || []).includes(x.id) && !t.standups[x.id]);
    const posted = held.filter(x => t.standups[x.id]).length, blocked = held.filter(x => t.standups[x.id] && t.standups[x.id].blocked).length;
    const form = mine.length ? `<form class="co-su" id="co-su"><div class="co-su-h"><b>Your standup</b>${mine.length > 1 ? `<select class="input sm" id="co-su-seat" aria-label="Seat">${mine.map(x => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')}</select>` : `<span class="co-chip" style="--sc:${esc(mine[0].color)}">${esc(mine[0].title)}</span>`}</div>
      <input class="input" id="co-su-done" maxlength="600" placeholder="Done: what got done" aria-label="What got done">
      <input class="input" id="co-su-next" maxlength="600" placeholder="Next: what you'll do" aria-label="What's next">
      <div class="co-su-f"><input class="input" id="co-su-blocked" maxlength="600" placeholder="Blocked? (optional)" aria-label="Anything blocking"><button class="btn primary" type="submit">Post</button></div></form>` : '';
    const rows = held.filter(x => t.standups[x.id]).map(x => { const s = t.standups[x.id];
      return `<div class="co-su-row" style="--sc:${esc(x.color)}"><span class="co-dot" aria-hidden="true"></span><div class="co-su-t"><b>${esc(x.title)}</b><p>${s.done ? `<span>Done</span> ${esc(s.done)}` : ''}${s.next ? `${s.done ? '<br>' : ''}<span>Next</span> ${esc(s.next)}` : ''}${s.blocked ? `<br><span class="bl">Blocked</span> ${esc(s.blocked)}` : ''}</p><small class="faint">${esc(s.byName || '')} · ${ago(s.at)}</small></div></div>`; }).join('');
    const sum = held.length ? `${posted} of ${held.length} seats posted today${blocked ? ` · ${blocked} blocked` : ''}` : 'No seat is held yet';
    return `<section class="card co-today" aria-label="Today's standup"><div class="co-c-h"><span class="co-lbl">Standup</span><h3>${esc(sum)}</h3></div>
      ${form}${rows || (form ? '' : empty(held.length ? 'Nobody has posted today.' : 'Give a seat to someone and their standup shows here.', held.length && d.canLead ? '<button class="btn sm" data-run="standup">Ask everyone now</button>' : ''))}
      ${t.weekly ? `<details class="co-week"><summary>Last weekly review · ${ago(t.weekly.at)}</summary><pre>${esc(t.weekly.text)}</pre></details>` : ''}</section>`;
  }
  function approvalsCard(c, d) {
    const list = d.approvals || [];
    return `<section class="card co-appr" aria-label="Open approvals"><div class="co-c-h"><span class="co-lbl">Approvals</span><h3>${list.length ? `${plural(d.waiting || list.length, 'approval')} waiting` : 'Nothing waiting'}</h3></div>
      ${list.length ? `<ul class="co-list">${list.map(a => `<li><span class="co-risk r-${esc(a.risk)}">${esc(a.risk || 'low')}</span><div><b>${esc(a.title)}</b><small class="faint">${esc(a.byName || '')}${a.at ? ` · ${ago(a.at)}` : ''}</small></div></li>`).join('')}</ul><button class="btn sm primary" id="co-appr-open">Review in inbox</button>`
        : empty('Anything outward or costly a seat wants to do waits here for a person’s OK.', '<button class="btn sm" id="co-appr-open">Open inbox</button>')}</section>`;
  }
  function decisionsCard(c, d) {
    const list = d.decisions || [], ceo = c.seats.find(x => x.kind === 'ceo'), canCall = d.canLead || (ceo && (d.mySeats || []).includes(ceo.id));
    const needs = c.seats.filter(x => x.status === 'needs-you' || x.status === 'blocked');
    return `<section class="card co-decs" aria-label="Decisions"><div class="co-c-h"><span class="co-lbl">Decisions</span><h3>${needs.length ? `${plural(needs.length, 'seat')} need${needs.length === 1 ? 's' : ''} a call` : 'No calls needed'}</h3></div>
      ${needs.length ? `<ul class="co-list">${needs.map(x => `<li><span class="co-dot" style="--sc:${esc(x.color)}"></span><div><b>${esc(x.title)}</b><small class="faint">${esc(x.status === 'blocked' ? 'Blocked' : 'Needs you')}${x.last ? ` · ${esc(x.last.text)}` : ''}</small></div></li>`).join('')}</ul>` : ''}
      <details class="co-dec" id="co-dec"><summary><span>Decision log</span><span class="co-dec-n">${list.length ? `${list.length} logged` : 'None yet'}</span></summary>
      ${canCall ? `<form class="co-call" id="co-call"><input class="input" id="co-call-t" maxlength="160" placeholder="Make a CEO call: what's decided?" aria-label="CEO call"><input class="input" id="co-call-w" maxlength="600" placeholder="Why (one line)" aria-label="Why"><button class="btn sm primary" type="submit">Log it</button></form>` : ''}
      <div class="co-dec-list">${list.map(x => `<div class="co-dec-row"><span class="co-kind k-${esc(x.kind)}">${esc(KIND_L[x.kind] || x.kind)}</span><div><b>${esc(x.title)}</b>${x.why ? `<p>${esc(x.why)}</p>` : ''}<small class="faint">${esc(x.byName || 'TribeCode')} · ${ago(x.at)}</small></div></div>`).join('') || '<p class="faint">CEO calls, closed votes and decided approvals land here.</p>'}</div></details></section>`;
  }
  function goalsCard(c, d) {
    const can = g => d.canLead || (g.seat && (d.mySeats || []).includes(g.seat));
    const seatOf = id => c.seats.find(x => x.id === id);
    const charters = c.seats.filter(x => x.charter && x.charter.goal && !c.goals.some(g => g.seat === x.id));
    return `<div class="co-goals" aria-label="Goals">
      ${c.goals.length ? `<div class="co-goal-g">${c.goals.map(g => { const s = seatOf(g.seat); return `<div class="co-goal card" data-goal="${esc(g.id)}"><div class="co-goal-h"><b>${esc(g.title)}</b><span class="co-pct">${g.progress}%</span></div>
        <span class="co-bar" role="progressbar" aria-label="${esc(g.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${g.progress}"><i style="width:${g.progress}%"></i></span>
        ${s ? `<span class="co-chip" style="--sc:${esc(s.color)}">${esc(s.title)}</span>` : ''}
        ${g.results.map((r, i) => `<div class="co-kr"><span>${esc(r.text)}</span><span class="co-kr-n">${r.current} / ${r.target}${r.unit ? ' ' + esc(r.unit) : ''}</span>${can(g) ? `<button class="co-inc" data-inc="${esc(g.id)}:${i}" aria-label="Add one to ${esc(r.text)}">+1</button>` : ''}</div>`).join('')}
        ${d.canLead ? `<button class="linkish co-goal-del" data-gdel="${esc(g.id)}">Remove</button>` : ''}</div>`; }).join('')}</div>` : empty('No goals yet. One measurable goal for the month keeps every seat pointed the same way.', d.canLead ? '<button class="btn sm primary" id="co-goal-focus">Add a goal</button>' : '')}
      ${d.canLead && c.goals.length < 12 ? `<form class="co-goal-add" id="co-goal-add"><input class="input" id="co-g-title" maxlength="160" placeholder="New goal, e.g. 25 sign-ups" aria-label="New goal"><input class="input co-g-n" id="co-g-target" type="number" min="1" placeholder="Target" aria-label="Target number"><button class="btn sm" type="submit">Add</button></form>` : ''}
      ${charters.length ? `<div class="co-charters"><span class="co-lbl">Seat charters</span><ul class="co-list">${charters.map(x => `<li><span class="co-dot" style="--sc:${esc(x.color)}"></span><div><b>${esc(x.title)}</b><small>${esc(x.charter.goal)}</small></div></li>`).join('')}</ul></div>` : ''}</div>`;
  }
  function ritualsCard(c, d, sample) {
    const r = d.rituals || {}, lead = d.canLead && !sample;
    const ROWS = [['standup', 'Daily standup', 'Each seat says what got done'], ['weekly', 'Weekly review', 'Goals, decisions waiting, spend'], ['board', 'Board update', 'A one-page summary doc']];
    return `<ul class="co-rits">${ROWS.map(([k, t, sub]) => { const x = r[k] || {}, on = x.on !== false && c.rhythms[k] !== false;
      return `<li class="co-rit${on ? '' : ' off'}" data-rit="${k}"><div><b>${t}</b><small>${esc(sub)}</small></div><span class="co-rit-n">${on ? (x.next ? `Next: ${esc(when(x.next))}` : 'On') : 'Off'}</span>${lead ? `<button class="btn sm" data-run="${k}">Run now</button>` : ''}</li>`; }).join('')}</ul>
      ${lead ? '' : '<p class="faint co-note">The host or a project lead runs these.</p>'}`;
  }
  function activityCard(c, d) {
    const items = [];
    for (const x of c.seats) if (x.last && x.last.at) items.push({ at: x.last.at, color: x.color, who: x.title, text: x.last.text });
    for (const x of d.decisions || []) items.push({ at: x.at, color: 'var(--brand)', who: KIND_L[x.kind] || 'Decision', text: x.title });
    if (d.today && d.today.weekly) items.push({ at: d.today.weekly.at, color: 'var(--peer)', who: 'Weekly review', text: 'Sent to the team' });
    const seen = new Set(), list = items.filter(i => i.at && !seen.has(i.who + i.text) && seen.add(i.who + i.text)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
    return list.length ? `<ol class="co-act">${list.map(i => `<li style="--sc:${esc(i.color)}"><span class="co-dot" aria-hidden="true"></span><div><b>${esc(i.who)}</b> <span>${esc(i.text)}</span></div><time class="faint">${esc(ago(i.at))}</time></li>`).join('')}</ol>`
      : empty('Standups, seat updates and decisions show up here as they happen.', '<button class="btn sm" data-seat-act="standup-any">Post the first standup</button>');
  }

  // ---------- Money: a clear ledger summary + a small flat chart (revenue vs costs, last 6 months) ----------
  const fmt = (n, cur) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0); } catch { return `${Math.round(Number(n) || 0)} ${cur || ''}`; } };
  const monthsBack = k => { const out = [], d = new Date(); d.setDate(1); for (let i = k - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); } return out; };
  const SAMPLE_MONEY = () => { const m = monthsBack(6), rv = [0, 40, 95, 160, 240, 412], cs = [30, 45, 60, 70, 90, 118];
    return { currency: 'USD', sample: true, months: m.map((k, i) => ({ month: k, revenue: rv[i], costs: cs[i], entries: 3 })), users: 41, runway: null }; };
  async function money(el, p) {
    if (!el) return;
    let m;
    try {
      const ms = monthsBack(6), sums = await Promise.all(ms.map(k => C.api(`/projects/${encodeURIComponent(p)}/ledger/summary?month=${k}`, { project: p }).catch(() => null)));
      const last = sums[sums.length - 1] || {};
      m = { currency: last.currency || 'USD', months: ms.map((k, i) => { const s = sums[i] || {}; return { month: k, revenue: (s.revenue || {}).total || 0, costs: (s.costs || {}).total || 0, entries: s.entries || 0 }; }),
        users: last.users && last.users.count ? last.users.total : null, runway: last.runway && last.runway.months != null ? last.runway.months : null, sources: [...((last.revenue || {}).sources || []), ...((last.costs || {}).sources || [])] };
    } catch { m = null; }
    if (!el.isConnected) return;
    el.innerHTML = m ? moneyHtml(m) : empty('Money isn’t available for your role here.');
    const add = el.querySelector('#co-money-add'); if (add) add.onclick = openMoney;
  }
  function moneyHtml(m) {
    const cur = m.currency, now = m.months[m.months.length - 1], any = m.months.some(x => x.entries || x.revenue || x.costs);
    if (!any) return empty('Nothing recorded yet. Type in a number or import a Stripe CSV; every figure keeps its source.', '<button class="btn sm primary" id="co-money-add">Add the first number</button>');
    const net = now.revenue - now.costs, max = Math.max(1, ...m.months.map(x => Math.max(x.revenue, x.costs)));
    const H = 96, mon = k => new Date(k + '-15').toLocaleDateString([], { month: 'short' });
    const bars = m.months.map(x => `<div class="co-ch-col" tabindex="0" aria-label="${esc(mon(x.month))}: revenue ${esc(fmt(x.revenue, cur))}, costs ${esc(fmt(x.costs, cur))}">
        <div class="co-ch-pair"><i class="in" style="height:${Math.round(x.revenue / max * H)}px"></i><i class="out" style="height:${Math.round(x.costs / max * H)}px"></i></div><span>${esc(mon(x.month))}</span>
        <span class="co-tip" role="tooltip"><b>${esc(mon(x.month))}</b>Revenue ${esc(fmt(x.revenue, cur))}<br>Costs ${esc(fmt(x.costs, cur))}</span></div>`).join('');
    return `<div class="co-m-grid"><dl class="co-m-nums">
        <div><dt>Revenue</dt><dd>${esc(fmt(now.revenue, cur))}</dd></div><div><dt>Costs</dt><dd>${esc(fmt(now.costs, cur))}</dd></div>
        <div><dt>Net</dt><dd class="${net >= 0 ? 'pos' : 'neg'}">${net < 0 ? '−' : ''}${esc(fmt(Math.abs(net), cur))}</dd></div>
        ${m.users != null ? `<div><dt>Users</dt><dd>${esc(m.users)}</dd></div>` : m.runway != null ? `<div><dt>Runway</dt><dd>${esc(m.runway)} mo</dd></div>` : ''}</dl>
      <figure class="co-chart" aria-label="Revenue and costs, last 6 months"><div class="co-ch-legend"><span><i class="in"></i>Revenue</span><span><i class="out"></i>Costs</span></div>
        <div class="co-ch-plot">${bars}</div><figcaption class="faint">${m.sample ? 'Example numbers' : 'Only numbers with a source: typed in or from a connected tool.'}</figcaption></figure></div>`;
  }
  const openMoney = () => (window.TribeShell && window.TribeShell.go ? window.TribeShell.go('money') : window.TribeLedger && window.TribeLedger.open());

  // Empty state: four big tiles (seats, money, rituals, approvals), few words, one clear CTA ("Make it a company"),
  // "See an example" (a read-only sample company in the real view) and the templates below for leads.
  const TILE = (k, color, title, line, art) => `<li class="co-ig-tile" data-ig="${k}" style="--ic:${color}"><div class="co-ig-art" aria-hidden="true">${art}</div><h3>${title}</h3><p>${line}</p></li>`;
  function infographic() {
    const av = (c, t, ai) => `<i class="co-ig-av${ai ? ' ai' : ''}" style="--a:${c}">${t}</i>`;
    return `<ul class="co-ig-grid" role="list">
      ${TILE('seats', 'var(--brand)', 'Seats', 'A friend or an AI helper holds each job.', `<div class="co-ig-org">
        <span class="co-ig-seat" style="--c:var(--brand)">${av('var(--brand)', 'C')}<b>CEO</b><small>you</small></span><span class="co-ig-stem"></span>
        <span class="co-ig-row"><span class="co-ig-seat" style="--c:var(--live)">${av('var(--live)', '✦', 1)}<b>Build</b></span><span class="co-ig-seat" style="--c:var(--amber)">${av('var(--peer)', 'M')}<b>Grow</b></span></span></div>`)}
      ${TILE('money', 'var(--amber)', 'Money', 'Real numbers, each with its source.', `<div class="co-ig-money"><b class="mono">$412</b><span class="co-ig-bars"><i style="--h:30%"></i><i style="--h:48%"></i><i style="--h:40%"></i><i style="--h:64%"></i><i style="--h:92%"></i></span></div>`)}
      ${TILE('standup', 'var(--peer)', 'Rituals', 'A daily standup writes itself.', `<ol class="co-ig-feed"><li><b style="--c:var(--live)">Build</b>Shipped the fix</li><li><b style="--c:var(--amber)">Grow</b>Email drafted</li></ol>`)}
      ${TILE('approve', 'var(--alert)', 'Approvals', 'People OK anything costly.', `<div class="co-ig-ask"><p><b>Grow</b>&nbsp;wants to email 120 people</p><p class="co-ig-btns"><span class="ok">Approve</span><span>Deny</span></p></div>`)}
    </ul>`;
  }
  function drawEmpty(sec) {
    const d = st.d, lead = d && d.canLead;
    sec.innerHTML = `<div class="co-wrap"><section class="card co-empty co-hero co-ig" aria-labelledby="co-ig-t">
      <div class="co-ig-top"><div class="co-ig-intro"><span class="eyebrow">Company mode</span><h1 id="co-ig-t">Run it like a company</h1>
        <p class="co-lead">Give the work seats. Friends and AI helpers hold them; people approve anything costly.</p></div>
        <div class="co-ig-cta">${lead ? '<button class="btn primary lg" id="co-make">Make it a company</button>' : ''}<button class="btn ${lead ? 'ghost' : ''}" id="co-example">See an example</button></div></div>
      ${infographic()}
      ${lead ? '' : '<p class="faint co-note">Ask your host or a project lead to make this project a company.</p>'}
    </section>
    ${lead && (d.templates || []).length ? `<section class="card co-tpl-card" aria-label="Templates"><div class="co-c-h"><span class="co-lbl">Or start from a shape</span><h3>Templates</h3></div><div class="co-tpls">${(d.templates || []).map(t => `<button class="co-tpl" data-tpl="${esc(t.id)}"><span class="co-tpl-e" aria-hidden="true">${esc(t.emoji)}</span><b>${esc(t.name)}</b><small>${esc(t.blurb)}</small><span class="co-tpl-s">${esc(t.seats.join(' · '))}</span></button>`).join('')}</div>
      <p class="faint co-note">One click makes it. You can rename seats, change charters and add or remove seats after.</p></section>` : ''}</div>`;
    sec.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => create(b.dataset.tpl, b));
    const mk = sec.querySelector('#co-make'); if (mk) mk.onclick = () => create(guessTpl(), mk);
    sec.querySelector('#co-example').onclick = () => { ui.sample = true; draw(); sec.scrollTop = 0; };
  }
  // "Make it a company" makes the lean four (CEO · Build · Grow · Run); templates below give other shapes
  const guessTpl = () => { const ids = ((st.d || {}).templates || []).map(x => x.id); return !ids.length || ids.includes('blank') ? 'blank' : ids[0]; };
  // "See an example": the real Company view, filled with a sample company, read-only
  const ago_ = m => new Date(Date.now() - m * 60000).toISOString();
  const SAMPLE = () => {
    const P_ = (n, c) => ({ name: n, color: c, role: 'builder' }), A_ = n => ({ name: n, role: 'agent' });
    const seat = (id, kind, title, color, who, goal, status, last, m) => ({ id, kind, title, color, who, charter: { goal }, status, last: last ? { text: last, at: ago_(m) } : null });
    return { canLead: false, canEdit: false, mySeats: [], sample: true,
      company: { on: true, name: 'Lantern Games', mission: 'Cozy little games for short breaks, made by four friends and their AI helpers.', template: 'game-studio', rhythms: { standup: true, weekly: true },
        seats: [seat('s-ceo', 'ceo', 'CEO', '#F26B1D', { person: P_('Camp', '#F26B1D') }, 'Launch on Friday', 'on-track', 'This week: launch. Everything else waits.', 40),
          seat('s-build', 'cto', 'Build', '#38C6B1', { agent: A_('Camp’s Claude') }, 'Ship level 3 and the boss', 'on-track', 'Shipped the save-slot fix', 25),
          seat('s-grow', 'growth', 'Grow', '#FABD2F', { person: P_('Maya', '#6C7CFF') }, '100 wishlist sign-ups', 'needs-you', 'Launch email ready: needs an OK to send', 12),
          seat('s-run', 'ops', 'Run', '#94A3B8', { person: P_('Jo', '#38C6B1'), agent: A_('Flint') }, 'Books up to date every Monday', 'on-track', 'Imported October’s Stripe CSV', 90),
          seat('s-sup', 'support', 'Support', '#6C7CFF', {}, 'Answer every email within a day', 'idle', null, 0)],
        goals: [{ id: 'g1', title: 'Launch on Friday', seat: 's-ceo', progress: 60, results: [{ text: 'Launch checklist', current: 3, target: 5, unit: '' }] },
          { id: 'g2', title: '100 wishlist sign-ups', seat: 's-grow', progress: 41, results: [{ text: 'Sign-ups', current: 41, target: 100, unit: '' }] }] },
      today: { standups: { 's-build': { done: 'Shipped the save-slot fix', next: 'The level 3 boss' }, 's-grow': { done: 'Launch email drafted', next: 'Send it once Camp says OK', blocked: '' }, 's-run': { done: 'Imported October’s Stripe CSV', next: 'Two refunds to handle' } }, missing: [] },
      health: { tone: 'attention', text: 'Goals are 51% done, 1 approval waiting and 1 seat is open.' }, waiting: 1, approvals: [{ id: 'a1', title: 'Send the launch email to 120 people', risk: 'medium', byName: 'Maya', at: ago_(12) }],
      rituals: { standup: { on: true, next: new Date(Date.now() + 15 * 3600e3).toISOString() }, weekly: { on: true, next: new Date(Date.now() + 4 * 864e5).toISOString() }, board: { on: true, next: new Date(Date.now() + 18 * 864e5).toISOString() } },
      decisions: [{ kind: 'ceo-call', title: 'Launch on Friday, not next month', why: 'The demo is fun now; polish can follow.', byName: 'Camp', at: ago_(300) }, { kind: 'approval', title: 'Spend $20 on the itch.io banner', byName: 'Camp', at: ago_(1500) }] };
  };
  function drawSample(sec) {
    const real = st; st = { d: SAMPLE(), pid: pid() };
    try {
      const c = st.d.company, d = st.d, lead = real.d && real.d.canLead;
      sec.innerHTML = `<div class="co-wrap co-v2 co-sample"><div class="co-sample-bar" role="note"><span class="co-lbl">Example · read-only</span><span>A company after one week. Nothing here is real.</span>
          <span class="co-sample-acts"><button class="btn sm" id="co-sample-back">Back</button>${lead ? '<button class="btn sm primary" id="co-sample-make">Make it a company</button>' : ''}</span></div>
        ${report(c, d, true)}</div>`;
    } finally { st = real; }
    sec.querySelectorAll('[data-fold]').forEach(b => b.onclick = () => { ui.fold[b.dataset.fold] = !ui.fold[b.dataset.fold]; b.closest('.co-sec').classList.toggle('folded', !!ui.fold[b.dataset.fold]); b.setAttribute('aria-expanded', String(!ui.fold[b.dataset.fold])); });
    sec.querySelectorAll('.co-sample .co-seat, .co-sample button:not(#co-sample-back):not(#co-sample-make):not([data-fold]), .co-sample input, .co-sample form').forEach(x => { x.setAttribute('tabindex', '-1'); x.setAttribute('aria-disabled', 'true'); if (x.tagName === 'FORM') x.onsubmit = e => e.preventDefault(); else x.onclick = e => { e.preventDefault(); e.stopPropagation(); toast('This is an example. Make your own company to change things.'); }; });
    sec.querySelector('#co-sample-back').onclick = () => { ui.sample = false; draw(); };
    const mk = sec.querySelector('#co-sample-make'); if (mk) mk.onclick = () => { ui.sample = false; create(guessTpl(), mk); };
  }
  async function create(tpl, btn, helpers) {
    if (st.busy) return; st.busy = true; if (btn) { btn.disabled = true; btn.classList.add('busy'); }
    try {
      const r = await C.api(`/projects/${encodeURIComponent(pid())}/company/template`, { method: 'POST', body: { template: tpl, helpers: !!helpers } });
      st = { d: r, pid: pid(), busy: false }; nav(); if (open) draw();
      toast(`🏢 ${r.company.name} is a company now${(r.tasks || []).length ? ` · ${r.tasks.length} starter tasks added` : ''}`);
      if (window.TribeTasks && window.TribeTasks.load) window.TribeTasks.load();
      return r;
    } catch (e) { st.busy = false; if (btn) { btn.disabled = false; btn.classList.remove('busy'); } toast(e.message); return null; }
  }

  function wire(sec, c, d) {
    const P = `/projects/${encodeURIComponent(st.pid)}/company`;
    sec.querySelectorAll('[data-fold]').forEach(b => b.onclick = () => { if (!phone()) return; ui.fold[b.dataset.fold] = !ui.fold[b.dataset.fold]; b.closest('.co-sec').classList.toggle('folded', !!ui.fold[b.dataset.fold]); b.setAttribute('aria-expanded', String(!ui.fold[b.dataset.fold])); });
    const focusSu = () => { const f = $('#co-su-done'); if (!f) return toast('You have no seat waiting for a standup today.'); ui.fold.week = false; const s = f.closest('.co-sec'); if (s) s.classList.remove('folded'); f.scrollIntoView({ block: 'center' }); f.focus(); };
    sec.querySelectorAll('[data-seat-act]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const a = b.dataset.seatAct, x = c.seats.find(s => s.id === b.dataset.sid);
      if (a === 'hire') return window.TribeTalent && window.TribeTalent.hireSlot ? window.TribeTalent.hireSlot(null, st.pid, x.id) : openSeat(x.id);
      if (a === 'standup' || a === 'standup-any') return focusSu();
      if (a === 'profile' && x.who.person && window.TribeAbilities && window.TribeAbilities.profile) return window.TribeAbilities.profile(x.holder.person || x.who.person.id);
      openSeat(x.id);
    });
    sec.querySelectorAll('.co-seat[data-seat]').forEach(b => { b.onclick = () => openSeat(b.dataset.seat); b.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); openSeat(b.dataset.seat); } }; });
    const add = $('#co-add'); if (add) add.onclick = addSeatSheet;
    const set = $('#co-settings'); if (set) set.onclick = settingsSheet;
    const ec = $('#co-edit-co'); if (ec) ec.onclick = settingsSheet;
    const mo = $('#co-money-open'); if (mo) mo.onclick = openMoney;
    const ap = $('#co-appr-open'); if (ap) ap.onclick = () => (window.TribeNotify && window.TribeNotify.openInbox ? window.TribeNotify.openInbox() : toast('Open the bell to answer approvals.'));
    const gf = $('#co-goal-focus'); if (gf) gf.onclick = () => { const i = $('#co-g-title'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } };
    sec.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => {
      b.disabled = true; const was = b.textContent; b.textContent = 'Running…';
      try { const r = await C.api(`${P}/rhythms/run`, { method: 'POST', body: { kind: b.dataset.run } });
        toast(r.kind === 'weekly' ? `Weekly review sent to ${plural(r.to, 'person')}` : r.kind === 'board' ? `Board update written: ${r.doc.title}` : `Standup asked: ${plural(r.asked, 'person')}${r.agents ? `, ${plural(r.agents, 'AI helper')}` : ''}`);
        load(); } catch (e) { toast(e.message); b.disabled = false; b.textContent = was; }
    });
    const fill = $('#co-fill'); if (fill) fill.onclick = async () => {
      fill.disabled = true;
      try { for (const x of c.seats.filter(s => !s.who.person && !s.who.agent)) await C.api(`${P}/seats/${encodeURIComponent(x.id)}/assign`, { method: 'POST', body: { agent: d.myAgent.id } }); toast(`${d.myAgent.name} holds the open seats`); load(); }
      catch (e) { toast(e.message); fill.disabled = false; }
    };
    const su = $('#co-su'); if (su) su.onsubmit = async e => {
      e.preventDefault(); const seat = ($('#co-su-seat') || {}).value || c.seats.find(x => (d.mySeats || []).includes(x.id) && !(d.today.standups || {})[x.id]).id;
      const body = { seat, done: $('#co-su-done').value, next: $('#co-su-next').value, blocked: $('#co-su-blocked').value };
      if (!body.done.trim() && !body.next.trim() && !body.blocked.trim()) return $('#co-su-done').focus();
      try { await C.api(`${P}/standups`, { method: 'POST', body }); toast('Standup posted'); load(); } catch (er) { toast(er.message); }
    };
    sec.querySelectorAll('[data-inc]').forEach(b => b.onclick = async () => {
      const [gid, i] = b.dataset.inc.split(':'), g = c.goals.find(x => x.id === gid); if (!g) return;
      const results = g.results.map((r, k) => ({ ...r, current: k === Number(i) ? r.current + 1 : r.current }));
      b.disabled = true; try { await C.api(`${P}/goals/${encodeURIComponent(gid)}`, { method: 'PATCH', body: { results } }); load(); } catch (e) { toast(e.message); b.disabled = false; }
    });
    sec.querySelectorAll('[data-gdel]').forEach(b => b.onclick = async () => { if (!confirm('Remove this goal?')) return; try { await C.api(`${P}/goals/${encodeURIComponent(b.dataset.gdel)}`, { method: 'DELETE' }); load(); } catch (e) { toast(e.message); } });
    const ga = $('#co-goal-add'); if (ga) ga.onsubmit = async e => {
      e.preventDefault(); const title = $('#co-g-title').value.trim(); if (!title) return $('#co-g-title').focus();
      const target = Number($('#co-g-target').value) || 0;
      try { await C.api(`${P}/goals`, { method: 'POST', body: { title, results: target ? [{ text: title, target, current: 0 }] : [] } }); load(); } catch (er) { toast(er.message); }
    };
    const call = $('#co-call'); if (call) call.onsubmit = async e => {
      e.preventDefault(); const title = $('#co-call-t').value.trim(); if (!title) return $('#co-call-t').focus();
      try { await C.api(`${P}/decisions`, { method: 'POST', body: { title, why: $('#co-call-w').value } }); toast('📌 Logged'); load(); } catch (er) { toast(er.message); }
    };
  }

  // ---------- sheets (the shared modal; on phones it is a bottom sheet) ----------
  function sheet(html) {
    const m = $('#invite-modal'), body = $('#invite-body'); if (!m || !body) return null;
    watchModal(); body.classList.add('co-sheet'); body.innerHTML = html; m.classList.remove('hidden');
    const close = () => { m.classList.add('hidden'); body.classList.remove('co-sheet'); };
    body.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    return { body, close };
  }
  function watchModal() { const m = $('#invite-modal'), b = $('#invite-body'); if (!m || !b || m._coWatch) return; m._coWatch = true; new MutationObserver(() => { if (m.classList.contains('hidden') && b.classList.contains('co-sheet')) b.classList.remove('co-sheet'); }).observe(m, { attributes: true, attributeFilter: ['class'] }); }   // other sheets reuse the modal: drop our class when it closes
  function chips(id, items, sugg = []) {
    return `<div class="co-chips" id="${id}" role="group">${items.map(t => `<span class="co-tag">${esc(t)}<button type="button" aria-label="Remove ${esc(t)}" data-rm>×</button></span>`).join('')}<input class="co-tag-in" placeholder="Add…" maxlength="60" aria-label="Add an item"></div>
      ${sugg.length ? `<div class="co-sugg">${sugg.filter(x => !items.includes(x)).map(x => `<button type="button" class="co-sg" data-sg="${esc(x)}" data-for="${id}">+ ${esc(x)}</button>`).join('')}</div>` : ''}`;
  }
  function wireChips(root) {
    const addTo = (box, v) => { v = String(v || '').trim().slice(0, 60); if (!v || [...box.querySelectorAll('.co-tag')].some(t => t.firstChild.textContent === v) || box.querySelectorAll('.co-tag').length >= 12) return; const sp = document.createElement('span'); sp.className = 'co-tag'; sp.innerHTML = `${esc(v)}<button type="button" aria-label="Remove ${esc(v)}" data-rm>×</button>`; box.insertBefore(sp, box.querySelector('.co-tag-in')); };
    root.querySelectorAll('.co-chips').forEach(box => {
      const inp = box.querySelector('.co-tag-in');
      inp.onkeydown = e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTo(box, inp.value); inp.value = ''; } else if (e.key === 'Backspace' && !inp.value) { const l = box.querySelectorAll('.co-tag'); if (l.length) l[l.length - 1].remove(); } };
      inp.onblur = () => { if (inp.value.trim()) { addTo(box, inp.value); inp.value = ''; } };
      box.onclick = e => { if (e.target.matches('[data-rm]')) e.target.parentElement.remove(); else inp.focus(); };
    });
    root.querySelectorAll('[data-sg]').forEach(b => b.onclick = () => { addTo(root.querySelector('#' + b.dataset.for), b.dataset.sg); b.remove(); });
  }
  const chipVals = el => (el ? [...el.querySelectorAll('.co-tag')].map(t => t.firstChild.textContent) : []);

  function openSeat(id) {
    const c = co(), d = st.d; if (!c) return;
    const x = c.seats.find(s => s.id === id); if (!x) return;
    const lead = d.canLead, mine = (d.mySeats || []).includes(x.id), ro = !lead, ch = x.charter;
    const empty = !x.who.person && !x.who.agent;
    const opt = (list, cur, none) => `<option value="">${none}</option>${list.map(m => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.name)}${m.ownerName ? ` (${esc(m.ownerName)})` : ''}</option>`).join('')}`;
    const people = d.people.length ? d.people : [x.who.person].filter(Boolean);
    const agents = lead ? d.agents : d.agents.concat(x.who.agent && !d.agents.some(a => a.id === x.who.agent.id) ? [x.who.agent] : []);
    const field = (label, inner, hint) => `<label class="co-f"><span class="co-fl">${label}${hint ? ` <span class="faint">${hint}</span>` : ''}</span>${inner}</label>`;
    const roText = (v, none = '—') => `<p class="co-ro">${v ? esc(v) : `<span class="faint">${none}</span>`}</p>`;
    const roList = l => (l.length ? `<div class="co-chips ro">${l.map(t => `<span class="co-tag">${esc(t)}</span>`).join('')}</div>` : '<p class="co-ro faint">—</p>');
    const s = sheet(`<button class="co-x" data-close aria-label="Close">×</button>
      <div class="co-sh-h" style="--sc:${esc(x.color)}"><span class="co-stripe" aria-hidden="true"></span><div><span class="eyebrow">${esc(x.kind === 'custom' ? 'Seat' : (d.kinds.find(k => k.id === x.kind) || {}).title || x.kind)} seat</span>
        ${lead ? `<input class="co-title-in" id="cs-title" value="${esc(x.title)}" maxlength="40" aria-label="Seat name">` : `<h2>${esc(x.title)}</h2>`}</div></div>
      <div class="co-sh-body">
        <div class="co-hold">${field('Person', lead ? `<select class="input" id="cs-person">${opt(people, x.holder.person, 'Nobody')}</select>` : roText(x.who.person && x.who.person.name, 'Nobody'))}
          ${field('AI helper', lead || (mine && x.holder.person === me().id) ? `<select class="input" id="cs-agent">${opt(agents, x.holder.agent, 'None')}</select>` : roText(x.who.agent && x.who.agent.name, 'None'))}</div>
        ${empty ? '<div id="co-hire-slot" data-seat="' + esc(x.id) + '" data-project="' + esc(st.pid) + '"></div>' : ''}
        ${field('This month\'s goal', ro ? roText(ch.goal) : `<input class="input" id="cs-goal" maxlength="200" value="${esc(ch.goal)}" placeholder="One thing this seat gets done this month">`)}
        ${field('May do', ro ? roList(ch.mayDo) : chips('cs-may', ch.mayDo), ro ? '' : 'on its own')}
        ${field('Needs a human\'s yes', ro ? roList(ch.needsApproval) : chips('cs-ask', ch.needsApproval, ASK_CHIPS))}
        <details class="co-more"${ro ? ' open' : ''}><summary>Owns, budget and done</summary>
          ${field('Owns', ro ? roList(ch.owns) : chips('cs-owns', ch.owns))}
          <div class="co-two">${field('Weekly budget', ro ? roText(ch.budgetWeekly ? String(ch.budgetWeekly) : '', 'None') : `<input class="input" id="cs-budget" type="number" min="0" step="1" value="${ch.budgetWeekly || ''}" placeholder="0">`, 'your currency')}
          ${field('Status', lead || mine ? `<select class="input" id="cs-status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === x.status ? 'selected' : ''}>${v}</option>`).join('')}</select>` : roText(STATUS[x.status]))}</div>
          ${field('Done means', ro ? roText(ch.done) : `<input class="input" id="cs-done" maxlength="300" value="${esc(ch.done)}" placeholder="How you'll know it's done">`)}
        </details>
        <div id="co-academy-slot" data-seat="${esc(x.id)}" data-kind="${esc(x.kind)}" data-project="${esc(st.pid)}"></div>
        <div id="co-seat-ledger-slot" data-seat="${esc(x.id)}" data-project="${esc(st.pid)}"></div>
        <div id="co-seat-autopilot-slot" data-seat="${esc(x.id)}" data-project="${esc(st.pid)}"></div>
      </div>
      <div class="modal-foot co-foot">${lead && x.kind !== 'ceo' ? '<button class="linkish co-del" id="cs-del">Remove seat</button>' : ''}<span style="flex:1"></span><button class="btn" data-close>${lead || mine ? 'Cancel' : 'Close'}</button>${lead || mine ? '<button class="btn primary" id="cs-save">Save</button>' : ''}</div>`);
    if (!s) return;
    wireChips(s.body);
    const P = `/projects/${encodeURIComponent(st.pid)}/company/seats/${encodeURIComponent(x.id)}`;
    const save = s.body.querySelector('#cs-save');
    if (save) save.onclick = async () => {
      save.disabled = true;
      try {
        const v = sel => { const el = s.body.querySelector(sel); return el ? el.value : undefined; };
        const patch = {}; if (v('#cs-status') !== undefined && v('#cs-status') !== x.status) patch.status = v('#cs-status');
        if (lead) { patch.title = v('#cs-title'); patch.charter = { goal: v('#cs-goal'), mayDo: chipVals(s.body.querySelector('#cs-may')), needsApproval: chipVals(s.body.querySelector('#cs-ask')), owns: chipVals(s.body.querySelector('#cs-owns')), budgetWeekly: Number(v('#cs-budget')) || 0, done: v('#cs-done') }; }
        if (Object.keys(patch).length) await C.api(P, { method: 'PATCH', body: patch });
        const as = {}; const pp = v('#cs-person'), ag = v('#cs-agent');
        if (pp !== undefined && (pp || null) !== x.holder.person) as.person = pp || null;
        if (ag !== undefined && (ag || null) !== x.holder.agent) as.agent = ag || null;
        if (Object.keys(as).length) await C.api(`${P}/assign`, { method: 'POST', body: as });
        s.close(); toast(`${x.title} saved`); load();
      } catch (e) { save.disabled = false; toast(e.message); }
    };
    const del = s.body.querySelector('#cs-del'); if (del) del.onclick = async () => { if (!confirm(`Remove the ${x.title} seat?`)) return; try { await C.api(P, { method: 'DELETE' }); s.close(); load(); } catch (e) { toast(e.message); } };
    try { window.dispatchEvent(new CustomEvent('tribe:company-sheet', { detail: { project: st.pid, seat: x, el: s.body } })); } catch {}
  }
  function addSeatSheet() {
    const d = st.d, c = co(); if (!c) return;
    const kinds = d.kinds.filter(k => k.id !== 'ceo');
    const s = sheet(`<button class="co-x" data-close aria-label="Close">×</button><span class="eyebrow">Add a seat</span><h2>Who else does this company need?</h2>
      <div class="co-kinds">${kinds.map(k => `<button class="co-kind-b" data-kind="${esc(k.id)}" style="--sc:${esc(k.color)}"><span class="co-dot" aria-hidden="true"></span>${esc(k.id === 'custom' ? 'Something else' : k.title)}${c.seats.some(x => x.kind === k.id) && k.id !== 'custom' ? ' <span class="faint">· another</span>' : ''}</button>`).join('')}</div>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Cancel</button></div>`);
    if (!s) return;
    s.body.querySelectorAll('[data-kind]').forEach(b => b.onclick = async () => {
      if (window.TribePremium) await window.TribePremium.gate('seats', { count: c.seats.length + 1 });   // feat/work-company: never blocks, a note for bigger teams
      b.disabled = true;
      try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/company/seats`, { method: 'POST', body: { kind: b.dataset.kind } }); s.close(); await load(); openSeat(r.seat.id); }
      catch (e) { b.disabled = false; toast(e.message); }
    });
  }
  function settingsSheet() {
    const c = co(), d = st.d; if (!c || !d.canLead) return;
    const R = { standup: ['Daily standup', 'Each seat says what got done (people get a nudge, AI helpers post on their own)'], weekly: ['Weekly review', 'One notification on Mondays: goals, decisions waiting, spend'], board: ['Monthly board update', 'A doc on the 1st: metrics, wins, risks, asks'] };
    const s = sheet(`<button class="co-x" data-close aria-label="Close">×</button><span class="eyebrow">Company settings</span><h2>${esc(c.name)}</h2>
      <label class="co-f"><span class="co-fl">Name</span><input class="input" id="cx-name" maxlength="60" value="${esc(c.name)}"></label>
      <label class="co-f"><span class="co-fl">Mission <span class="faint">one line</span></span><input class="input" id="cx-mission" maxlength="400" value="${esc(c.mission)}" placeholder="What the company does, for whom"></label>
      <div class="co-f"><span class="co-fl">Rhythms</span>${Object.entries(R).map(([k, [t, sub]]) => `<div class="co-rh"><label class="co-rh-l"><input type="checkbox" data-rh="${k}" ${c.rhythms[k] ? 'checked' : ''}><span><b>${t}</b><small>${sub}</small></span></label><button class="btn sm" data-run="${k}">Run now</button></div>`).join('')}</div>
      <div class="modal-foot"><button class="linkish co-del" id="cx-off">Turn Company mode off</button><span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="cx-save">Save</button></div>`);
    if (!s) return;
    const P = `/projects/${encodeURIComponent(st.pid)}/company`;
    s.body.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Running…';
      try { const r = await C.api(`${P}/rhythms/run`, { method: 'POST', body: { kind: b.dataset.run } });
        toast(r.kind === 'weekly' ? `Weekly review sent to ${r.to} ${r.to === 1 ? 'person' : 'people'}` : r.kind === 'board' ? `Board update written: ${r.doc.title}` : `Standup asked: ${r.asked} ${r.asked === 1 ? 'person' : 'people'}${r.agents ? `, ${r.agents} AI helper${r.agents === 1 ? '' : 's'}` : ''}`);
        b.textContent = 'Done'; load(); } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Run now'; }
    });
    s.body.querySelector('#cx-save').onclick = async () => {
      const rhythms = {}; s.body.querySelectorAll('[data-rh]').forEach(x => { rhythms[x.dataset.rh] = x.checked; });
      try { await C.api(P, { method: 'PUT', body: { name: s.body.querySelector('#cx-name').value, mission: s.body.querySelector('#cx-mission').value, rhythms } }); s.close(); load(); } catch (e) { toast(e.message); }
    };
    s.body.querySelector('#cx-off').onclick = async () => { if (!confirm('Turn Company mode off? Seats and goals are kept; turn it back on any time.')) return; try { await C.api(P, { method: 'PUT', body: { on: false } }); s.close(); load(); } catch (e) { toast(e.message); } };
  }

  // ---------- the sidebar row ----------
  function nav() {
    const after = $('#nest-ws-agents'); if (!after) return;
    let row = $('#nest-company');
    const c = co(), lead = !!(st.d && st.pid === pid() && st.d.canLead);
    const want = !!c || lead;   // polish: until it's a company, leads see a quiet "Set up company" row that opens the setup
    if (!want) { if (row) row.classList.add('hidden'); return; }
    if (!row) { row = document.createElement('button'); row.className = 'nest-row core'; row.id = 'nest-company'; row.dataset.pnav = 'company'; after.after(row); }
    const html = `<svg class="i"><use href="#i-flag"/></svg><span>${c ? 'Company' : 'Set up company'}</span>${c && c.seats.some(x => x.status === 'needs-you' || x.status === 'blocked') ? '<span class="n hot">!</span>' : ''}`;
    if (row.innerHTML !== html) row.innerHTML = html;
    row.classList.toggle('co-subtle', !c); row.title = c ? '' : 'Make this project a company: seats, goals and rhythms'; row.classList.remove('hidden');
  }

  // ---------- the dashboard tile (projects.js) ----------
  function tile() {
    const c = co(); if (!c) return null;
    const goals = st.d.company.goals || [], pct = goals.length ? Math.round(goals.reduce((a, g) => a + g.progress, 0) / goals.length) : 0;
    const need = c.seats.filter(x => x.status === 'needs-you' || x.status === 'blocked').length, open = c.seats.filter(x => !x.who.person && !x.who.agent).length;
    return { k: 'company', label: 'Company goals', icon: 'i-flag', n: `${pct}%`, pct, line: need ? `${need} seat${need === 1 ? '' : 's'} need${need === 1 ? 's' : ''} you` : open ? `${open} open seat${open === 1 ? '' : 's'}` : `${goals.length} goal${goals.length === 1 ? '' : 's'} · all seats moving`, act: 'Open Company', go: 'company', hot: need > 0, c: '#F26B1D' };
  }

  // ---------- Flint ----------
  const SYN = [[/market|growth|grow|promot|social|launch/, 'growth'], [/build|engineer|code|tech|develop|cto/, 'cto'], [/design|art|look|brand/, 'design'], [/sale|sell|deal|partner|sponsor/, 'sales'], [/support|customer|help desk|service/, 'support'], [/money|financ|budget|account|treasur|invoice/, 'finance'], [/ops|operat|run|event|program|admin/, 'ops'], [/legal|law|contract|terms|privacy/, 'legal'], [/ceo|boss|charge of everything|lead|owner|director|founder/, 'ceo']];
  function findSeat(c, q) {
    q = String(q || '').toLowerCase().replace(/[?.!]+$/, '').replace(/\b(the|seat|team|department|stuff|things)\b/g, '').trim();
    if (!q) return null;
    return c.seats.find(x => x.title.toLowerCase() === q) || c.seats.find(x => q.includes(x.title.toLowerCase()) || x.title.toLowerCase().includes(q))
      || (() => { const k = (SYN.find(([re]) => re.test(q)) || [])[1]; return k ? c.seats.find(x => x.kind === k) : null; })();
  }
  const TPL_GUESS = [[/saas|software|app|tool|product|startup/, 'saas'], [/agency|studio for clients|client|freelanc|consult/, 'agency'], [/creator|youtube|newsletter|podcast|channel|tiktok|stream/, 'creator'], [/game/, 'game-studio'], [/shop|caf[eé]|salon|bakery|restaurant|store|local/, 'local'], [/nonprofit|non-profit|charity|cause|ngo/, 'nonprofit'], [/club|community|group|meetup/, 'club']];
  async function flint(text) {
    const t = String(text || '').toLowerCase().trim();
    let m;
    if ((/\b(make|turn|start|set up|create)\b.*\b(company|business)\b/.test(t) && !/\b(plan|card|cards|name|logo|email|website|site|page|doc)\b/.test(t)) || /^(a )?company( mode)?$/.test(t)) {
      if (!C.connected() || !pid()) return { text: 'Start or open a project first, then I can make it a company.' };
      const d = st.pid === pid() && st.d ? st.d : await load();
      if (co()) return { text: `${co().name} is already a company with ${co().seats.length} seats.`, open: true };
      if (!d || !d.canLead) return { text: 'Only the host or a project lead can make this project a company. Ask them, or start your own project.' };
      const tpl = (TPL_GUESS.find(([re]) => re.test(t)) || [])[1] || 'blank';
      const r = await create(tpl, null, /\b(ai|helpers?|claude|agents?)\b/.test(t));
      if (!r) return { text: 'That didn\'t work. Try the Company page.', open: true };
      return { text: `Done: ${r.company.name} is a company (${r.company.seats.map(x => x.title).join(', ')}). You hold the CEO seat.${r.helper ? ` ${r.helper.name} holds the open seats.` : ''} Tap a seat to change its charter or who holds it.`, open: true };
    }
    if ((m = /\bwho(?:'s| is| are)?\s+(in charge of|running|doing|handling|responsible for|owns?)\s+(.+)/.exec(t))) {
      if (!C.connected() || !pid()) return null;
      if (!(st.pid === pid() && st.d)) await load();
      const strong = /in charge|responsible/.test(m[1]), q = m[2];
      const c = co(); if (!c) return strong && /\b(marketing|sales|money|finance|growth|support|legal|ops|operations|design|building|code)\b/.test(q) ? { text: 'This project isn\'t a company yet, so nobody holds seats. Say "make me a company" to set one up.' } : null;
      const x = findSeat(c, q); if (!x) return strong ? { text: `I couldn't match "${q}" to a seat. The seats are ${c.seats.map(s => s.title).join(', ')}.`, open: true } : null;
      const who = holderLine(x);
      return { text: `${x.title}: ${who || 'nobody yet (it\'s open)'}. ${x.charter.goal ? `This month: ${x.charter.goal}.` : ''}${x.last ? ` Last: ${x.last.text} (${ago(x.last.at)}).` : ''}`, open: true };
    }
    if ((m = /\bgive\s+(?:the\s+)?(.+?)\s+(?:seat\s+)?to\s+my\s+(?:claude|ai|agent|helper|ai helper)\b/.exec(t))) {
      if (!C.connected() || !pid()) return null;
      if (!(st.pid === pid() && st.d)) await load();
      const c = co(), d = st.d; if (!c) return { text: 'This project isn\'t a company yet. Say "make me a company" first.' };
      const x = findSeat(c, m[1]); if (!x) return { text: `Which seat? The seats are ${c.seats.map(s => s.title).join(', ')}.`, open: true };
      if (!d.myAgent) return { text: 'You haven\'t connected an AI helper yet. Connect Claude Code (or another AI) first, then ask again.' };
      try { await C.api(`/projects/${encodeURIComponent(pid())}/company/seats/${encodeURIComponent(x.id)}/assign`, { method: 'POST', body: { agent: d.myAgent.id } }); load(); return { text: `${d.myAgent.name} now holds ${x.title}. It reads its charter with my_seat and posts a daily standup; anything in "needs a human's yes" comes to you first.`, open: true }; }
      catch (e) { return { text: e.message, open: true }; }
    }
    return null;
  }

  // ---------- live ----------
  C.on('ws', msg => { if (msg && msg.type === 'company' && (!msg.project || msg.project === pid())) { clearTimeout(st.t); st.t = setTimeout(() => load(), 250); } });
  C.on('project', () => { st = { d: null, pid: '' }; nav(); setTimeout(() => load(), 50); if (open) draw(); });
  C.on('hello', () => setTimeout(() => load(), 300));
  if (C.connected && C.connected()) setTimeout(() => load(), 600);

  window.TribeCompany = { open: show, go, close: hide, refresh: load, get: () => co(), view: () => st.d, loadedFor: () => (st.d ? st.pid : ''), tile, flint, openSeat, create };
})();
