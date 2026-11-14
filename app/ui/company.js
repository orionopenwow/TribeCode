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
  const STATUS = { 'on-track': 'On track', 'needs-you': 'Needs you', blocked: 'Stuck', idle: 'Quiet' };
  // Plain words (feat/company3): a seat is a role, a standup is a check-in, the CEO is the lead. Stored titles stay as they are.
  const leadWord = () => (window.TribeGroupStyle ? window.TribeGroupStyle.leadName() : 'Lead');   // feat/group-styles: Lead, Captain, Teacher… or Council
  const roleName = x => (x && (x.title === 'CEO' || (x.kind === 'ceo' && leadWord() === 'Council')) ? leadWord() : (x && x.title) || '');
  const KIND_L = { 'ceo-call': 'Lead’s decision', vote: 'Vote', approval: 'OK given', proposal: 'Proposal', decision: 'Decision' };
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
  const empty = (text, act) => `<div class="ui-empty co-none" data-ui-kind="company"><p>${text}</p>${act ? `<div class="ui-empty-acts">${act}</div>` : ''}</div>`;   // the shared empty state (uikit.css)

  // ---------- feat/company3: an AI in a role, the summary strip, one next step ----------
  const short = (l, n = 3) => (l || []).slice(0, n).join(', ');
  const BOT = '<svg class="i co-ai-i" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-robot"/></svg>';
  function aiLine(x) {
    const ask = short((x.charter || {}).needsApproval) || 'spending money, publishing, emailing people';
    return `<div class="co-ai" data-ai-line>${BOT}<p><b>${esc(x.who.agent.name)}</b> ${x.who.person ? 'helps with this role' : 'does this role'}. It asks a person before: ${esc(ask)}.</p></div>`;
  }
  function stripHtml(c, d) {
    const filled = c.seats.filter(x => x.who.person || x.who.agent), r = d.rituals || {};
    const NAMES = { standup: 'Daily check-in', weekly: 'Weekly look-back', board: 'Monthly summary' };
    const nxt = Object.keys(NAMES).filter(k => r[k] && r[k].on !== false && c.rhythms[k] !== false && r[k].next).sort((a, b) => String(r[a].next).localeCompare(String(r[b].next)))[0];
    const avs = filled.slice(0, 5).map(x => avatar(x.who.person || x.who.agent, 'xs')).join('');
    const cell = (k, jump, label, main, sub, hot) => `<button class="co-strip-c${hot ? ' hot' : ''}" type="button" data-strip="${k}" data-jump="${jump}"><span class="co-lbl">${label}</span><b>${main}</b><small>${sub}</small></button>`;
    return `<nav class="co-strip" id="co-strip" aria-label="Company at a glance">
      ${cell('roles', 'seats', 'Roles', `${avs ? `<span class="co-strip-avs">${avs}</span>` : ''}${filled.length} of ${c.seats.length} filled`, c.seats.length - filled.length ? `${plural(c.seats.length - filled.length, 'role')} with nobody yet` : 'Everyone has a role')}
      ${cell('checkin', 'rituals', 'Next check-in', nxt ? esc(when(r[nxt].next)) : 'Off', nxt ? NAMES[nxt] : 'Turn check-ins on in Settings')}
      ${cell('money', 'money', 'Money this month', '<span id="co-strip-money">…</span>', '<span id="co-strip-money-s">In and out</span>')}
      ${cell('oks', 'week', 'Needs a person’s OK', d.waiting ? plural(d.waiting, 'thing') : 'Nothing', d.waiting ? 'Waiting for a yes or no' : 'Nothing is waiting', !!d.waiting)}
    </nav>`;
  }
  const skipKey = () => `tribecode.co.skip.${st.pid}`;
  const skipped = () => { try { return JSON.parse(localStorage.getItem(skipKey()) || '[]'); } catch { return []; } };
  function steps(c, d) {
    const lead = d.canLead, out = [];
    const emptyRole = c.seats.find(x => !x.who.person && !x.who.agent);
    const due = c.seats.find(x => (d.mySeats || []).includes(x.id) && !((d.today || {}).standups || {})[x.id]);
    if (lead && !c.mission) out.push({ k: 'mission', title: 'Say what this company is for', sub: 'One line, so every person and AI helper knows the point.', acts: [['mission', 'Write it']] });
    if (lead && emptyRole) out.push({ k: 'role:' + emptyRole.id, sid: emptyRole.id, title: `Give the ${roleName(emptyRole)} role to someone`, sub: (emptyRole.charter || {}).goal ? `This role’s job: ${emptyRole.charter.goal}.` : 'A friend or an AI helper can do it.',
      acts: [['take', 'I’ll do it'], ...(d.myAgent ? [['ai', `Give it to ${d.myAgent.name}`]] : []), ['find', 'Find someone']] });
    if (d.waiting) out.push({ k: 'oks', title: `${plural(d.waiting, 'thing')} ${d.waiting === 1 ? 'is' : 'are'} waiting for a person’s OK`, sub: 'Nothing that costs money or goes public happens until someone says yes.', acts: [['oks', 'Look at them']] });
    if (due) out.push({ k: 'checkin', title: 'Post today’s update', sub: 'Two lines: what got done, and what’s next.', acts: [['checkin', 'Write it']] });
    if (lead && !c.goals.length) out.push({ k: 'goal', title: 'Pick one goal for this month', sub: 'One thing with a number, like “25 sign-ups”.', acts: [['goal', 'Add a goal']] });
    if (lead && st.moneyAny === false) out.push({ k: 'money', title: 'Write down your first money in or out', sub: 'Even one number. It keeps the month honest.', acts: [['money', 'Open Money']] });
    const sk = skipped();
    return out.filter(x => !sk.includes(x.k));
  }
  function nextHtml(c, d) {
    const list = steps(c, d), x = list[0];
    if (!x) return `<section class="co-next card done" id="co-next" aria-label="Next step"><span class="co-lbl">Next step</span><h2>You’re set for today</h2><p>Nothing is waiting on you.</p></section>`;
    return `<section class="co-next card" id="co-next" data-step="${esc(x.k)}"${x.sid ? ` data-sid="${esc(x.sid)}"` : ''} aria-label="Next step"><div class="co-next-h"><span class="co-lbl">Next step</span>${list.length > 1 ? `<span class="co-next-n">${list.length - 1} more after this</span>` : ''}</div>
      <h2>${esc(x.title)}</h2><p>${esc(x.sub)}</p>
      <div class="co-next-a">${x.acts.map(([a, l], i) => `<button class="btn ${i ? '' : 'primary'}" type="button" data-next="${a}">${esc(l)}</button>`).join('')}<button class="linkish" type="button" data-next="skip">Not now</button></div></section>`;
  }
  function refreshNext(force) {
    const el = $('#co-next'), c = co(); if (!el || !c || !open) return;
    const a = document.activeElement; if (!force && a && el.contains(a)) return;
    const t = document.createElement('div'); t.innerHTML = nextHtml(c, st.d); el.replaceWith(t.firstElementChild); wireNext(c, st.d);
  }
  function wireNext(c, d) {
    const el = $('#co-next'); if (!el) return;
    const P = `/projects/${encodeURIComponent(st.pid)}/company`, sid = el.dataset.sid;
    const assign = async body => { try { await C.api(`${P}/seats/${encodeURIComponent(sid)}/assign`, { method: 'POST', body }); load(); } catch (e) { toast(e.message); } };
    el.querySelectorAll('[data-next]').forEach(b => b.onclick = () => {
      const a = b.dataset.next, x = c.seats.find(s => s.id === sid);
      if (a === 'skip') { try { localStorage.setItem(skipKey(), JSON.stringify([...skipped(), el.dataset.step].slice(-40))); } catch {} return refreshNext(true); }
      if (a === 'mission') return settingsSheet();
      if (a === 'take') { b.disabled = true; return assign({ person: me().id }); }
      if (a === 'ai') { b.disabled = true; return assign({ agent: d.myAgent.id }); }
      if (a === 'find') return window.TribeTalent && window.TribeTalent.hireSlot ? window.TribeTalent.hireSlot(null, st.pid, x.id) : openSeat(x.id);
      if (a === 'oks') return window.TribeNotify && window.TribeNotify.openInbox ? window.TribeNotify.openInbox() : toast('Open the bell to answer.');
      if (a === 'checkin') { const f = $('#co-su-done'); if (f) { const s = f.closest('.co-sec'); if (s) s.classList.remove('folded'); f.scrollIntoView({ block: 'center' }); f.focus(); } return; }
      if (a === 'goal') { const i = $('#co-g-title'); if (i) { const s = i.closest('.co-sec'); if (s) s.classList.remove('folded'); i.scrollIntoView({ block: 'center' }); i.focus(); } return; }
      if (a === 'money') return openMoney();
    });
  }

  function seatAction(x, d) {
    const emptySeat = !x.who.person && !x.who.agent, mine = (d.mySeats || []).includes(x.id);
    const posted = ((d.today || {}).standups || {})[x.id];
    if (emptySeat) return d.canLead ? ['hire', 'Find someone'] : ['open', 'See what it does'];
    if (mine && !posted) return ['standup', 'Post today’s update'];
    if (mine) return ['open', 'Edit role'];
    if (x.who.person) return ['profile', 'View profile'];
    return ['open', 'See what it does'];
  }
  function seatCard(x, ceo, d = st.d) {
    const emptySeat = !x.who.person && !x.who.agent, mine = (d.mySeats || []).includes(x.id);
    const goal = (co() || d.company).goals.find(g => g.seat === x.id);
    const s = ((d.today || {}).standups || {})[x.id];
    const now = s ? (s.next || s.done) : x.last ? x.last.text : '';
    const [act, label] = seatAction(x, d);
    const big = w => w ? avatar(w, 'lg') : '';
    return `<article class="co-seat ${ceo ? 'ceo' : ''} ${emptySeat ? 'empty' : ''} ${mine ? 'mine' : ''}" data-seat="${esc(x.id)}" style="--sc:${esc(x.color)}" tabindex="0" role="button" aria-label="${esc(roleName(x))} role${emptySeat ? ', nobody yet' : ': ' + esc(holderLine(x))}. ${esc(STATUS[x.status] || '')}">
      <div class="co-seat-top"><span class="co-avs">${emptySeat ? '<span class="co-av lg open" aria-hidden="true">+</span>' : big(x.who.person) + big(x.who.agent)}</span>
        <span class="co-seat-id"><span class="co-role">${esc(roleName(x))}${x.title === 'CEO' && leadWord() === 'Lead' ? ' <span class="co-aka">CEO</span>' : ''}</span><b>${emptySeat ? 'Nobody yet' : esc(holderLine(x))}${mine ? ' <small>you</small>' : ''}</b>
          <small class="co-kindl">${emptySeat ? 'A friend or an AI helper can do it' : x.who.person && x.who.agent ? 'A person, with an AI helper' : x.who.agent ? 'An AI helper does this' : 'A person does this'}</small></span>
        <span class="co-pill s-${esc(x.status)}">${esc(STATUS[x.status] || x.status)}</span></div>
      ${x.who.agent ? aiLine(x) : ''}${emptySeat ? '' : `<div class="co-now"><span class="co-lbl">Working on</span><p>${now ? esc(now) : '<span class="faint">No update yet today.</span>'}</p></div>`}
      ${goal ? `<div class="co-seat-goal"><span class="co-lbl">${esc(goal.title)}</span><span class="co-bar sm" role="progressbar" aria-label="${esc(goal.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal.progress}"><i style="width:${goal.progress}%"></i></span><span class="co-pct">${goal.progress}%</span></div>` : ''}
      <div class="co-seat-f"><span class="faint">${x.last ? esc(ago(x.last.at)) : ''}</span><button class="btn sm ${act === 'hire' || act === 'standup' ? 'primary' : ''}" type="button" data-seat-act="${act}" data-sid="${esc(x.id)}">${esc(label)}</button></div></article>`;
  }

  // A live update never wipes what someone is typing: the redraw waits until the field loses focus. Open <details> stay open.
  const ui = { dec: false, week: false, pending: false, sample: false, setup: false, fold: {} };
  function busyTyping(sec) { const a = document.activeElement; return !!(a && sec.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && (a.value || a.tagName === 'SELECT')); }
  function report(c, d, sample) {
    const lead = d.canLead && !sample, ceo = c.seats.find(x => x.kind === 'ceo'), rest = c.seats.filter(x => x !== ceo);
    const h = d.health || { tone: 'good', text: '' };
    const openSeats = c.seats.filter(x => !x.who.person && !x.who.agent).length;
    const seatsX = lead ? `${d.myAgent && openSeats ? `<button class="btn sm" id="co-fill">Give ${plural(openSeats, 'empty role')} to ${esc(d.myAgent.name)}</button>` : ''}${c.seats.length < 16 ? '<button class="btn sm" id="co-add">Add a role</button>' : ''}` : '';
    return `<header class="co-head"><div class="co-h-t"><span class="eyebrow">Company</span><h1>${esc(c.name)}</h1>
        ${c.mission ? `<p class="co-mission">${esc(c.mission)}</p>` : lead ? '<button class="linkish co-mission-add" id="co-edit-co">Say what it’s for in one line</button>' : ''}
        ${h.text ? `<p class="co-health t-${esc(h.tone)}" id="co-health"><span class="co-hdot" aria-hidden="true"></span>${esc(h.text)}</p>` : ''}</div>
        <span class="co-h-acts"><button class="btn" id="co-whocan">${icon('shield', 16)}Who can do what</button>${lead ? `<button class="btn" id="co-settings" aria-label="Company settings">${icon('gear', 16)}Settings</button>` : d.propose && !sample ? `<button class="btn primary" id="co-propose" data-gs-ask="settings.edit">${icon('edit', 16)}Propose a change</button>` : ''}</span></header>
      ${!lead && d.propose && !sample ? `<p class="co-propose-note" id="co-propose-note">${esc(window.TribeI18n ? window.TribeI18n.t('co.propose', 'The council decides changes here. Propose one; when enough of the council say yes, the edit buttons open for you for a day.') : '')}</p>` : ''}
      ${sample ? '' : stripHtml(c, d)}${sample ? '' : nextHtml(c, d)}
      ${sec('seats', 'users', 'Roles', `Who does what <span class="co-n">${c.seats.length}</span>`, `<div class="co-seats">${ceo ? seatCard(ceo, true, d) : ''}${rest.map(x => seatCard(x, false, d)).join('')}</div>`, seatsX)}
      ${sec('week', 'calendar', 'This week', 'Updates, OKs and decisions', `<div class="co-week-g">${todayCard(c, d)}${approvalsCard(c, d)}${decisionsCard(c, d, sample)}</div>`)}
      ${sec('money', 'coins', 'Money', 'Money in and out this month', `<div id="co-money" class="co-money">${sample ? moneyHtml(SAMPLE_MONEY()) : '<p class="faint">Loading the ledger…</p>'}</div>`, `<button class="btn sm" id="co-money-open">Open Money</button>`)}
      ${sec('goals', 'target', 'Goals', 'This month’s goals', goalsCard(c, d))}
      ${sec('rituals', 'repeat', 'Check-ins', 'When the team checks in', ritualsCard(c, d, sample))}
      ${sec('activity', 'activity', 'Activity', 'What happened lately', activityCard(c, d))}`;
  }
  function draw() {
    const sec = section(); if (!sec || !open) return;
    if (busyTyping(sec)) { if (!ui.pending) { ui.pending = true; document.activeElement.addEventListener('blur', () => setTimeout(() => { ui.pending = false; draw(); }, 150), { once: true }); } return; }
    if (!C.connected()) { sec.innerHTML = `<div class="co-wrap"><div class="card co-empty"><span class="eyebrow">Company</span><h2>Join or start a tribe first</h2></div></div>`; return; }
    if (!st.d || st.pid !== pid()) { sec.innerHTML = `<div class="co-wrap"><p class="faint">Loading…</p></div>`; return; }
    const c = co(); if (!c) { if (ui.setup) { if (!sec.querySelector('.co-setup')) startSetup(sec); return; } return ui.sample ? drawSample(sec) : drawEmpty(sec); }
    ui.sample = false; ui.setup = false;
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
    const form = mine.length ? `<form class="co-su" id="co-su"><div class="co-su-h"><b>Your update for today</b>${mine.length > 1 ? `<select class="input sm" id="co-su-seat" aria-label="Role">${mine.map(x => `<option value="${esc(x.id)}">${esc(roleName(x))}</option>`).join('')}</select>` : `<span class="co-chip" style="--sc:${esc(mine[0].color)}">${esc(mine[0].title)}</span>`}</div>
      <input class="input" id="co-su-done" maxlength="600" placeholder="Done: what got done" aria-label="What got done">
      <input class="input" id="co-su-next" maxlength="600" placeholder="Next: what you'll do" aria-label="What's next">
      <div class="co-su-f"><input class="input" id="co-su-blocked" maxlength="600" placeholder="Stuck on anything? (optional)" aria-label="Anything blocking"><button class="btn primary" type="submit">Post</button></div></form>` : '';
    const rows = held.filter(x => t.standups[x.id]).map(x => { const s = t.standups[x.id];
      return `<div class="co-su-row" style="--sc:${esc(x.color)}"><span class="co-dot" aria-hidden="true"></span><div class="co-su-t"><b>${esc(x.title)}</b><p>${s.done ? `<span>Done</span> ${esc(s.done)}` : ''}${s.next ? `${s.done ? '<br>' : ''}<span>Next</span> ${esc(s.next)}` : ''}${s.blocked ? `<br><span class="bl">Blocked</span> ${esc(s.blocked)}` : ''}</p><small class="faint">${esc(s.byName || '')} · ${ago(s.at)}</small></div></div>`; }).join('');
    const sum = held.length ? `${posted} of ${held.length} checked in today${blocked ? ` · ${blocked} stuck` : ''}` : 'Nobody has a role yet';
    return `<section class="card co-today" aria-label="Today's check-in"><div class="co-c-h"><span class="co-lbl">Today’s check-in</span><h3>${esc(sum)}</h3></div>
      ${form}${rows || (form ? '' : empty(held.length ? 'Nobody has checked in today.' : 'Give a role to someone and their daily update shows here.', held.length && d.canLead ? '<button class="btn sm" data-run="standup">Ask everyone now</button>' : ''))}
      ${t.weekly ? `<details class="co-week"><summary>Last weekly look-back · ${ago(t.weekly.at)}</summary><pre>${esc(t.weekly.text)}</pre></details>` : ''}</section>`;
  }
  function approvalsCard(c, d) {
    const list = d.approvals || [];
    return `<section class="card co-appr" aria-label="Needs a person's OK"><div class="co-c-h"><span class="co-lbl">Needs a person’s OK</span><h3>${list.length ? `${plural(d.waiting || list.length, 'thing')} waiting for an OK` : 'Nothing waiting'}</h3></div>
      ${list.length ? `<ul class="co-list">${list.map(a => `<li><span class="co-risk r-${esc(a.risk)}">${esc(a.risk || 'low')}</span><div><b>${esc(a.title)}</b><small class="faint">${esc(a.byName || '')}${a.at ? ` · ${ago(a.at)}` : ''}</small></div></li>`).join('')}</ul><button class="btn sm primary" id="co-appr-open">Review in inbox</button>`
        : empty('Before anyone spends money, publishes or emails people, it waits here for a person’s OK.', '<button class="btn sm" id="co-appr-open">Open inbox</button>')}</section>`;
  }
  function decisionsCard(c, d) {
    const list = d.decisions || [], ceo = c.seats.find(x => x.kind === 'ceo'), canCall = d.canLead || (ceo && (d.mySeats || []).includes(ceo.id));
    const needs = c.seats.filter(x => x.status === 'needs-you' || x.status === 'blocked');
    return `<section class="card co-decs" aria-label="Decisions"><div class="co-c-h"><span class="co-lbl">Decisions</span><h3>${needs.length ? `${plural(needs.length, 'role')} need${needs.length === 1 ? 's' : ''} a decision` : 'Nothing to decide'}</h3></div>
      ${needs.length ? `<ul class="co-list">${needs.map(x => `<li><span class="co-dot" style="--sc:${esc(x.color)}"></span><div><b>${esc(x.title)}</b><small class="faint">${esc(x.status === 'blocked' ? 'Stuck' : 'Needs you')}${x.last ? ` · ${esc(x.last.text)}` : ''}</small></div></li>`).join('')}</ul>` : ''}
      <details class="co-dec" id="co-dec"><summary><span>Decisions made</span><span class="co-dec-n">${list.length ? `${list.length} logged` : 'None yet'}</span></summary>
      ${canCall ? `<form class="co-call" id="co-call"><input class="input" id="co-call-t" maxlength="160" placeholder="Make a decision: what’s decided?" aria-label="Make a decision"><input class="input" id="co-call-w" maxlength="600" placeholder="Why (one line)" aria-label="Why"><button class="btn sm primary" type="submit">Log it</button></form>` : ''}
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
        ${d.canLead ? `<button class="linkish co-goal-del" data-gdel="${esc(g.id)}">Remove</button>` : ''}</div>`; }).join('')}</div>` : empty('No goals yet. One goal with a number for the month keeps everyone pointed the same way.', d.canLead ? '<button class="btn sm primary" id="co-goal-focus">Add a goal</button>' : '')}
      ${d.canLead && c.goals.length < 12 ? `<form class="co-goal-add" id="co-goal-add"><input class="input" id="co-g-title" maxlength="160" placeholder="New goal, e.g. 25 sign-ups" aria-label="New goal"><input class="input co-g-n" id="co-g-target" type="number" min="1" placeholder="Target" aria-label="Target number"><button class="btn sm" type="submit">Add</button></form>` : ''}
      ${charters.length ? `<div class="co-charters"><span class="co-lbl">What each role is aiming for</span><ul class="co-list">${charters.map(x => `<li><span class="co-dot" style="--sc:${esc(x.color)}"></span><div><b>${esc(x.title)}</b><small>${esc(x.charter.goal)}</small></div></li>`).join('')}</ul></div>` : ''}</div>`;
  }
  function ritualsCard(c, d, sample) {
    const r = d.rituals || {}, lead = d.canLead && !sample;
    const ROWS = [['standup', 'Daily check-in', 'Everyone says what got done and what’s next'], ['weekly', 'Weekly look-back', 'Goals, what’s waiting on a decision, money spent'], ['board', 'Monthly summary', 'One page: numbers, wins, risks']];
    return `<ul class="co-rits">${ROWS.map(([k, t, sub]) => { const x = r[k] || {}, on = x.on !== false && c.rhythms[k] !== false;
      return `<li class="co-rit${on ? '' : ' off'}" data-rit="${k}"><div><b>${t}</b><small>${esc(sub)}</small></div><span class="co-rit-n">${on ? (x.next ? `Next: ${esc(when(x.next))}` : 'On') : 'Off'}</span>${lead ? `<button class="btn sm" data-run="${k}">Do it now</button>` : ''}</li>`; }).join('')}</ul>
      ${lead ? '' : '<p class="faint co-note">The host or a project lead starts these.</p>'}`;
  }
  function activityCard(c, d) {
    const items = [];
    for (const x of c.seats) if (x.last && x.last.at) items.push({ at: x.last.at, color: x.color, who: roleName(x), text: x.last.text });
    for (const x of d.decisions || []) items.push({ at: x.at, color: 'var(--brand)', who: KIND_L[x.kind] || 'Decision', text: x.title });
    if (d.today && d.today.weekly) items.push({ at: d.today.weekly.at, color: 'var(--peer)', who: 'Weekly look-back', text: 'Sent to the team' });
    const seen = new Set(), list = items.filter(i => i.at && !seen.has(i.who + i.text) && seen.add(i.who + i.text)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
    return list.length ? `<ol class="co-act">${list.map(i => `<li style="--sc:${esc(i.color)}"><span class="co-dot" aria-hidden="true"></span><div><b>${esc(i.who)}</b> <span>${esc(i.text)}</span></div><time class="faint">${esc(ago(i.at))}</time></li>`).join('')}</ol>`
      : empty('Daily updates and decisions show up here as they happen.', '<button class="btn sm" data-seat-act="standup-any">Post the first update</button>');
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
    const sm = $('#co-strip-money'), ss = $('#co-strip-money-s');
    if (sm && m) { const nw = m.months[m.months.length - 1], any = m.months.some(x => x.entries || x.revenue || x.costs); sm.textContent = any ? `${fmt(nw.revenue, m.currency)} in` : 'Nothing yet'; if (ss) ss.textContent = any ? `${fmt(nw.costs, m.currency)} out` : 'No money written down';
      const was = st.moneyAny; st.moneyAny = any; if (was !== any) refreshNext(); }
    else if (sm) { sm.textContent = '—'; if (ss) ss.textContent = 'Not shown for your role'; }
    const add = el.querySelector('#co-money-add'); if (add) add.onclick = openMoney;
  }
  function moneyHtml(m) {
    const cur = m.currency, now = m.months[m.months.length - 1], any = m.months.some(x => x.entries || x.revenue || x.costs);
    if (!any) return empty('Nothing written down yet. Type in money that came in or went out, or import a Stripe CSV. Every number keeps where it came from.', '<button class="btn sm primary" id="co-money-add">Add the first number</button>');
    const net = now.revenue - now.costs, max = Math.max(1, ...m.months.map(x => Math.max(x.revenue, x.costs)));
    const H = 96, mon = k => new Date(k + '-15').toLocaleDateString([], { month: 'short' });
    const bars = m.months.map(x => `<div class="co-ch-col" tabindex="0" aria-label="${esc(mon(x.month))}: money in ${esc(fmt(x.revenue, cur))}, money out ${esc(fmt(x.costs, cur))}">
        <div class="co-ch-pair"><i class="in" style="height:${Math.round(x.revenue / max * H)}px"></i><i class="out" style="height:${Math.round(x.costs / max * H)}px"></i></div><span>${esc(mon(x.month))}</span>
        <span class="co-tip" role="tooltip"><b>${esc(mon(x.month))}</b>In ${esc(fmt(x.revenue, cur))}<br>Out ${esc(fmt(x.costs, cur))}</span></div>`).join('');
    return `<div class="co-m-grid"><dl class="co-m-nums">
        <div><dt>Money in</dt><dd>${esc(fmt(now.revenue, cur))}</dd></div><div><dt>Money out</dt><dd>${esc(fmt(now.costs, cur))}</dd></div>
        <div><dt>Left over</dt><dd class="${net >= 0 ? 'pos' : 'neg'}">${net < 0 ? '−' : ''}${esc(fmt(Math.abs(net), cur))}</dd></div>
        ${m.users != null ? `<div><dt>Users</dt><dd>${esc(m.users)}</dd></div>` : m.runway != null ? `<div><dt>Money lasts</dt><dd>${esc(m.runway)} mo</dd></div>` : ''}</dl>
      <figure class="co-chart" aria-label="Money in and out, last 6 months"><div class="co-ch-legend"><span><i class="in"></i>Money in</span><span><i class="out"></i>Money out</span></div>
        <div class="co-ch-plot">${bars}</div><figcaption class="faint">${m.sample ? 'Example numbers' : 'Only real numbers: typed in or from a connected tool.'}</figcaption></figure></div>`;
  }
  const openMoney = () => (window.TribeShell && window.TribeShell.go ? window.TribeShell.go('money') : window.TribeLedger && window.TribeLedger.open());

  // Empty state: four big tiles (seats, money, rituals, approvals), few words, one clear CTA ("Make it a company"),
  // "See an example" (a read-only sample company in the real view) and the templates below for leads.
  const TILE = (k, color, title, line, art) => `<li class="co-ig-tile" data-ig="${k}" style="--ic:${color}"><div class="co-ig-art" aria-hidden="true">${art}</div><h3>${title}</h3><p>${line}</p></li>`;
  function infographic() {
    const av = (c, t, ai) => `<i class="co-ig-av${ai ? ' ai' : ''}" style="--a:${c}">${t}</i>`;
    return `<ul class="co-ig-grid" role="list">
      ${TILE('seats', 'var(--brand)', 'Roles', 'A friend or an AI helper does each job.', `<div class="co-ig-org">
        <span class="co-ig-seat" style="--c:var(--brand)">${av('var(--brand)', 'C')}<b>Lead</b><small>you</small></span><span class="co-ig-stem"></span>
        <span class="co-ig-row"><span class="co-ig-seat" style="--c:var(--live)">${av('var(--live)', 'AI', 1)}<b>Build</b></span><span class="co-ig-seat" style="--c:var(--amber)">${av('var(--peer)', 'M')}<b>Grow</b></span></span></div>`)}
      ${TILE('money', 'var(--amber)', 'Money', 'What came in and what went out.', `<div class="co-ig-money"><b class="mono">$412</b><span class="co-ig-bars"><i style="--h:30%"></i><i style="--h:48%"></i><i style="--h:40%"></i><i style="--h:64%"></i><i style="--h:92%"></i></span></div>`)}
      ${TILE('standup', 'var(--peer)', 'Check-ins', 'A short update from everyone, each day.', `<ol class="co-ig-feed"><li><b style="--c:var(--live)">Build</b>Shipped the fix</li><li><b style="--c:var(--amber)">Grow</b>Email drafted</li></ol>`)}
      ${TILE('approve', 'var(--alert)', 'A person’s OK', 'Nothing costly happens without a yes.', `<div class="co-ig-ask"><p><b>Grow</b>&nbsp;wants to email 120 people</p><p class="co-ig-btns"><span class="ok">Approve</span><span>Deny</span></p></div>`)}
    </ul>`;
  }
  function drawEmpty(sec) {
    const d = st.d, lead = d && d.canLead;
    sec.innerHTML = `<div class="co-wrap"><section class="card co-empty co-hero co-ig" aria-labelledby="co-ig-t">
      <div class="co-ig-top"><div class="co-ig-intro"><span class="eyebrow">Company</span><h1 id="co-ig-t">Run this project like a small business</h1>
        <p class="co-lead">Give each job to a friend or an AI helper, check in once a day and keep track of money. A person OKs anything that costs money or goes public.</p></div>
        <div class="co-ig-cta">${lead ? '<button class="btn primary lg" id="co-make">Set it up in 4 questions</button><button class="btn ghost" id="co-quick">Skip the questions</button>' : ''}<button class="btn ${lead ? 'ghost' : ''}" id="co-example">See an example</button></div></div>
      ${infographic()}
      ${lead ? '<p class="faint co-note">Takes about a minute. You can change every answer later.</p>' : '<p class="faint co-note">Ask your host or a project lead to set this project up as a company.</p>'}
    </section></div>`;
    const mk = sec.querySelector('#co-make'); if (mk) mk.onclick = () => { ui.setup = true; draw(); };
    const qk = sec.querySelector('#co-quick'); if (qk) qk.onclick = () => create(guessTpl(), qk);
    sec.querySelector('#co-example').onclick = () => { ui.sample = true; draw(); sec.scrollTop = 0; };
  }
  // Setup by questions (app/ui/companysetup.js): what you're making, its name, who does what, how you check in.
  function startSetup(sec) {
    const S = window.TribeCompanySetup;
    if (!S) { ui.setup = false; return create(guessTpl()); }
    S.start({ sec, view: st.d, pid: st.pid, me: me(), cancel: () => { ui.setup = false; draw(); }, skip: () => { ui.setup = false; create(guessTpl()); },
      done: r => { ui.setup = false; st = { d: r, pid: pid(), busy: false }; nav(); if (open) draw(); toast(`${r.company.name} is set up`); if (window.TribeTasks && window.TribeTasks.load) window.TribeTasks.load(); load(); } });
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
          <span class="co-sample-acts"><button class="btn sm" id="co-sample-back">Back</button>${lead ? '<button class="btn sm primary" id="co-sample-make">Set mine up</button>' : ''}</span></div>
        ${report(c, d, true)}</div>`;
    } finally { st = real; }
    sec.querySelectorAll('[data-fold]').forEach(b => b.onclick = () => { ui.fold[b.dataset.fold] = !ui.fold[b.dataset.fold]; b.closest('.co-sec').classList.toggle('folded', !!ui.fold[b.dataset.fold]); b.setAttribute('aria-expanded', String(!ui.fold[b.dataset.fold])); });
    sec.querySelectorAll('.co-sample .co-seat, .co-sample button:not(#co-sample-back):not(#co-sample-make):not([data-fold]), .co-sample input, .co-sample form').forEach(x => { x.setAttribute('tabindex', '-1'); x.setAttribute('aria-disabled', 'true'); if (x.tagName === 'FORM') x.onsubmit = e => e.preventDefault(); else x.onclick = e => { e.preventDefault(); e.stopPropagation(); toast('This is an example. Make your own company to change things.'); }; });
    sec.querySelector('#co-sample-back').onclick = () => { ui.sample = false; draw(); };
    const mk = sec.querySelector('#co-sample-make'); if (mk) mk.onclick = () => { ui.sample = false; ui.setup = true; draw(); };
  }
  async function create(tpl, btn, helpers) {
    if (st.busy) return; st.busy = true; if (btn) { btn.disabled = true; btn.classList.add('busy'); }
    try {
      const r = await C.api(`/projects/${encodeURIComponent(pid())}/company/template`, { method: 'POST', body: { template: tpl, helpers: !!helpers } });
      st = { d: r, pid: pid(), busy: false }; nav(); if (open) draw();
      toast(`${r.company.name} is set up${(r.tasks || []).length ? ` · ${r.tasks.length} starter tasks added` : ''}`);
      if (window.TribeTasks && window.TribeTasks.load) window.TribeTasks.load();
      return r;
    } catch (e) { st.busy = false; if (btn) { btn.disabled = false; btn.classList.remove('busy'); } toast(e.message); return null; }
  }

  function wire(sec, c, d) {
    const P = `/projects/${encodeURIComponent(st.pid)}/company`;
    sec.querySelectorAll('[data-fold]').forEach(b => b.onclick = () => { if (!phone()) return; ui.fold[b.dataset.fold] = !ui.fold[b.dataset.fold]; b.closest('.co-sec').classList.toggle('folded', !!ui.fold[b.dataset.fold]); b.setAttribute('aria-expanded', String(!ui.fold[b.dataset.fold])); });
    const focusSu = () => { const f = $('#co-su-done'); if (!f) return toast('You have no update to post today.'); ui.fold.week = false; const s = f.closest('.co-sec'); if (s) s.classList.remove('folded'); f.scrollIntoView({ block: 'center' }); f.focus(); };
    sec.querySelectorAll('[data-seat-act]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const a = b.dataset.seatAct, x = c.seats.find(s => s.id === b.dataset.sid);
      if (a === 'hire') return window.TribeTalent && window.TribeTalent.hireSlot ? window.TribeTalent.hireSlot(null, st.pid, x.id) : openSeat(x.id);
      if (a === 'standup' || a === 'standup-any') return focusSu();
      if (a === 'profile' && x.who.person && window.TribeAbilities && window.TribeAbilities.profile) return window.TribeAbilities.profile(x.holder.person || x.who.person.id);
      openSeat(x.id);
    });
    sec.querySelectorAll('.co-seat[data-seat]').forEach(b => { b.onclick = () => openSeat(b.dataset.seat); b.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); openSeat(b.dataset.seat); } }; });
    sec.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { const t = sec.querySelector(`.co-sec[data-sec="${b.dataset.jump}"]`); if (!t) return; ui.fold[b.dataset.jump] = false; t.classList.remove('folded'); t.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
    wireNext(c, d);
    const add = $('#co-add'); if (add) add.onclick = addSeatSheet;
    const set = $('#co-settings'); if (set) set.onclick = settingsSheet;
    const wc = $('#co-whocan'); if (wc) wc.onclick = () => window.TribeGroupStyle && window.TribeGroupStyle.open();
    const ec = $('#co-edit-co'); if (ec) ec.onclick = settingsSheet;
    const mo = $('#co-money-open'); if (mo) mo.onclick = openMoney;
    const ap = $('#co-appr-open'); if (ap) ap.onclick = () => (window.TribeNotify && window.TribeNotify.openInbox ? window.TribeNotify.openInbox() : toast('Open the bell to answer approvals.'));
    const gf = $('#co-goal-focus'); if (gf) gf.onclick = () => { const i = $('#co-g-title'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } };
    sec.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => {
      b.disabled = true; const was = b.textContent; b.textContent = 'Working…';
      try { const r = await C.api(`${P}/rhythms/run`, { method: 'POST', body: { kind: b.dataset.run } });
        toast(r.kind === 'weekly' ? `Weekly look-back sent to ${plural(r.to, 'person')}` : r.kind === 'board' ? `Monthly summary written: ${r.doc.title}` : `Asked for today’s update: ${plural(r.asked, 'person')}${r.agents ? `, ${plural(r.agents, 'AI helper')}` : ''}`);
        load(); } catch (e) { toast(e.message); b.disabled = false; b.textContent = was; }
    });
    const fill = $('#co-fill'); if (fill) fill.onclick = async () => {
      fill.disabled = true;
      try { for (const x of c.seats.filter(s => !s.who.person && !s.who.agent)) await C.api(`${P}/seats/${encodeURIComponent(x.id)}/assign`, { method: 'POST', body: { agent: d.myAgent.id } }); toast(`${d.myAgent.name} now does the empty roles`); load(); }
      catch (e) { toast(e.message); fill.disabled = false; }
    };
    const su = $('#co-su'); if (su) su.onsubmit = async e => {
      e.preventDefault(); const seat = ($('#co-su-seat') || {}).value || c.seats.find(x => (d.mySeats || []).includes(x.id) && !(d.today.standups || {})[x.id]).id;
      const body = { seat, done: $('#co-su-done').value, next: $('#co-su-next').value, blocked: $('#co-su-blocked').value };
      if (!body.done.trim() && !body.next.trim() && !body.blocked.trim()) return $('#co-su-done').focus();
      try { await C.api(`${P}/standups`, { method: 'POST', body }); toast('Update posted'); load(); } catch (er) { toast(er.message); }
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
      try { await C.api(`${P}/decisions`, { method: 'POST', body: { title, why: $('#co-call-w').value } }); toast('Decision saved'); load(); } catch (er) { toast(er.message); }
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

  // Who does this role, and (when it's an AI) exactly what it may do alone and what waits for a person (feat/company3)
  function whoBlock(x, d, lead, mine) {
    const p = x.who.person, a = x.who.agent, ch = x.charter || {};
    const text = !p && !a ? 'Nobody yet. A person, an AI helper, or both can do it.' : p && a ? `${p.name} does this role, with ${a.name} (an AI helper) doing the day-to-day work.` : a ? `${a.name}, an AI helper, does this role on its own.` : `${p.name} does this role.`;
    const rules = a ? `<ul class="co-ai-rules" id="co-ai-rules">
        <li><b>Works alone on</b><span>${esc(short(ch.mayDo, 6) || 'small, safe work in this role')}</span></li>
        <li><b>Asks a person first</b><span>${esc(short(ch.needsApproval, 6) || 'anything it isn’t sure about')}</span></li>
        <li><b>Always waits for an OK</b><span>spending money, publishing, emailing people. The lists can’t change that.</span></li>
        <li><b>Shows its work</b><span>a short update every day, here on the Company page.</span></li></ul>` : '';
    const iHold = p && p.id === me().id, canAi = lead || (mine && iHold);
    const acts = [lead && !iHold ? '<button class="btn sm" type="button" data-who="take">I’ll do it myself</button>' : '',
      canAi && d.myAgent && (!a || a.id !== d.myAgent.id) ? `<button class="btn sm" type="button" data-who="ai">Hand it to ${esc(d.myAgent.name)}</button>` : '',
      canAi && a ? '<button class="btn sm" type="button" data-who="noai">Take the AI helper off</button>' : ''].filter(Boolean).join('');
    return `<div class="co-who${a ? ' has-ai' : ''}" id="co-who"><span class="co-fl">Who does this role</span><p class="co-who-t">${a ? BOT : ''}${esc(text)}</p>${rules}${acts ? `<div class="co-who-a">${acts}</div>` : ''}${lead ? '<p class="faint co-who-n">Or pick someone else below, then Save.</p>' : ''}</div>`;
  }
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
      <div class="co-sh-h" style="--sc:${esc(x.color)}"><span class="co-stripe" aria-hidden="true"></span><div><span class="eyebrow">Role</span>
        ${lead ? `<input class="co-title-in" id="cs-title" value="${esc(x.title)}" maxlength="40" aria-label="Role name">` : `<h2>${esc(roleName(x))}</h2>`}</div></div>
      <div class="co-sh-body">
        ${whoBlock(x, d, lead, mine)}
        <div class="co-hold">${field('Person', lead ? `<select class="input" id="cs-person">${opt(people, x.holder.person, 'Nobody')}</select>` : roText(x.who.person && x.who.person.name, 'Nobody'))}
          ${field('AI helper', lead || (mine && x.holder.person === me().id) ? `<select class="input" id="cs-agent">${opt(agents, x.holder.agent, 'None')}</select>` : roText(x.who.agent && x.who.agent.name, 'None'))}</div>
        ${empty ? '<div id="co-hire-slot" data-seat="' + esc(x.id) + '" data-project="' + esc(st.pid) + '"></div>' : ''}
        ${field('This month\'s goal', ro ? roText(ch.goal) : `<input class="input" id="cs-goal" maxlength="200" value="${esc(ch.goal)}" placeholder="One thing this role gets done this month">`)}
        ${field('Can do alone', ro ? roList(ch.mayDo) : chips('cs-may', ch.mayDo), ro ? '' : 'without asking')}
        ${field('Asks a person first', ro ? roList(ch.needsApproval) : chips('cs-ask', ch.needsApproval, ASK_CHIPS), ro ? '' : 'waits for an OK')}
        <details class="co-more"${ro ? ' open' : ''}><summary>More: what it looks after, weekly budget, when it’s done</summary>
          ${field('Looks after', ro ? roList(ch.owns) : chips('cs-owns', ch.owns))}
          <div class="co-two">${field('Weekly budget', ro ? roText(ch.budgetWeekly ? String(ch.budgetWeekly) : '', 'None') : `<input class="input" id="cs-budget" type="number" min="0" step="1" value="${ch.budgetWeekly || ''}" placeholder="0">`, 'your currency')}
          ${field('Status', lead || mine ? `<select class="input" id="cs-status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === x.status ? 'selected' : ''}>${v}</option>`).join('')}</select>` : roText(STATUS[x.status]))}</div>
          ${field('Done means', ro ? roText(ch.done) : `<input class="input" id="cs-done" maxlength="300" value="${esc(ch.done)}" placeholder="How you'll know it's done">`)}
        </details>
        <div id="co-academy-slot" data-seat="${esc(x.id)}" data-kind="${esc(x.kind)}" data-project="${esc(st.pid)}"></div>
        <div id="co-seat-ledger-slot" data-seat="${esc(x.id)}" data-project="${esc(st.pid)}"></div>
        <div id="co-seat-autopilot-slot" data-seat="${esc(x.id)}" data-project="${esc(st.pid)}"></div>
      </div>
      <div class="modal-foot co-foot">${lead && x.kind !== 'ceo' ? '<button class="linkish co-del" id="cs-del">Remove role</button>' : ''}<span style="flex:1"></span><button class="btn" data-close>${lead || mine ? 'Cancel' : 'Close'}</button>${lead || mine ? '<button class="btn primary" id="cs-save">Save</button>' : ''}</div>`);
    if (!s) return;
    wireChips(s.body);
    const P = `/projects/${encodeURIComponent(st.pid)}/company/seats/${encodeURIComponent(x.id)}`;
    s.body.querySelectorAll('[data-who]').forEach(b => b.onclick = async () => {
      const a = b.dataset.who, body = a === 'take' ? { person: me().id, agent: null } : a === 'ai' ? { agent: d.myAgent.id } : a === 'noai' ? { agent: null } : null; if (!body) return;
      b.disabled = true; try { await C.api(`${P}/assign`, { method: 'POST', body }); s.close(); toast(a === 'take' ? `You now do ${roleName(x)}` : a === 'ai' ? `${d.myAgent.name} now does ${roleName(x)}` : `${roleName(x)}: the AI helper stepped back`); load(); } catch (e) { b.disabled = false; toast(e.message); }
    });
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
        s.close(); toast(`${roleName(x)} saved`); load();
      } catch (e) { save.disabled = false; toast(e.message); }
    };
    const del = s.body.querySelector('#cs-del'); if (del) del.onclick = async () => { if (!confirm(`Remove the ${roleName(x)} role?`)) return; try { await C.api(P, { method: 'DELETE' }); s.close(); load(); } catch (e) { toast(e.message); } };
    try { window.dispatchEvent(new CustomEvent('tribe:company-sheet', { detail: { project: st.pid, seat: x, el: s.body } })); } catch {}
  }
  function addSeatSheet() {
    const d = st.d, c = co(); if (!c) return;
    const kinds = d.kinds.filter(k => k.id !== 'ceo');
    const s = sheet(`<button class="co-x" data-close aria-label="Close">×</button><span class="eyebrow">Add a role</span><h2>What other job needs doing?</h2>
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
    const R = { standup: ['Daily check-in', 'Weekdays at 9:00. People get a nudge; AI helpers post on their own'], weekly: ['Weekly look-back', 'Mondays: goals, what’s waiting on a decision, money spent'], board: ['Monthly summary', 'On the 1st: one page with numbers, wins and risks'] };
    const s = sheet(`<button class="co-x" data-close aria-label="Close">×</button><span class="eyebrow">Company settings</span><h2>${esc(c.name)}</h2>
      <label class="co-f"><span class="co-fl">Name</span><input class="input" id="cx-name" maxlength="60" value="${esc(c.name)}"></label>
      <label class="co-f"><span class="co-fl">What it’s for <span class="faint">one line</span></span><input class="input" id="cx-mission" maxlength="400" value="${esc(c.mission)}" placeholder="What the company does, and for whom"></label>
      <div class="co-f"><span class="co-fl">Check-ins</span>${Object.entries(R).map(([k, [t, sub]]) => `<div class="co-rh"><label class="co-rh-l"><input type="checkbox" data-rh="${k}" ${c.rhythms[k] ? 'checked' : ''}><span><b>${t}</b><small>${sub}</small></span></label><button class="btn sm" data-run="${k}">Do it now</button></div>`).join('')}</div>
      <div class="modal-foot"><button class="linkish co-del" id="cx-off">Stop running this as a company</button><span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="cx-save">Save</button></div>`);
    if (!s) return;
    const P = `/projects/${encodeURIComponent(st.pid)}/company`;
    s.body.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Working…';
      try { const r = await C.api(`${P}/rhythms/run`, { method: 'POST', body: { kind: b.dataset.run } });
        toast(r.kind === 'weekly' ? `Weekly look-back sent to ${r.to} ${r.to === 1 ? 'person' : 'people'}` : r.kind === 'board' ? `Monthly summary written: ${r.doc.title}` : `Asked for today’s update: ${r.asked} ${r.asked === 1 ? 'person' : 'people'}${r.agents ? `, ${r.agents} AI helper${r.agents === 1 ? '' : 's'}` : ''}`);
        b.textContent = 'Done'; load(); } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Do it now'; }
    });
    s.body.querySelector('#cx-save').onclick = async () => {
      const rhythms = {}; s.body.querySelectorAll('[data-rh]').forEach(x => { rhythms[x.dataset.rh] = x.checked; });
      try { await C.api(P, { method: 'PUT', body: { name: s.body.querySelector('#cx-name').value, mission: s.body.querySelector('#cx-mission').value, rhythms } }); s.close(); load(); } catch (e) { toast(e.message); }
    };
    s.body.querySelector('#cx-off').onclick = async () => { if (!confirm('Stop running this project as a company? Roles and goals are kept; you can set it up again any time.')) return; try { await C.api(P, { method: 'PUT', body: { on: false } }); s.close(); load(); } catch (e) { toast(e.message); } };
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
    row.classList.toggle('co-subtle', !c); row.title = c ? '' : 'Run this project like a small business: roles, goals and check-ins'; row.classList.remove('hidden');
  }

  // ---------- the dashboard tile (projects.js) ----------
  function tile() {
    const c = co(); if (!c) return null;
    const goals = st.d.company.goals || [], pct = goals.length ? Math.round(goals.reduce((a, g) => a + g.progress, 0) / goals.length) : 0;
    const need = c.seats.filter(x => x.status === 'needs-you' || x.status === 'blocked').length, open = c.seats.filter(x => !x.who.person && !x.who.agent).length;
    return { k: 'company', label: 'Company goals', icon: 'i-flag', n: `${pct}%`, pct, line: need ? `${need} role${need === 1 ? '' : 's'} need${need === 1 ? 's' : ''} you` : open ? `${open} role${open === 1 ? '' : 's'} with nobody yet` : `${goals.length} goal${goals.length === 1 ? '' : 's'} · everyone is moving`, act: 'Open Company', go: 'company', hot: need > 0, c: '#F26B1D' };
  }

  // ---------- Flint ----------
  // 'lead' also finds a role titled CEO
  const SYN = [[/market|growth|grow|promot|social|launch/, 'growth'], [/build|engineer|code|tech|develop|cto/, 'cto'], [/design|art|look|brand/, 'design'], [/sale|sell|deal|partner|sponsor/, 'sales'], [/support|customer|help desk|service/, 'support'], [/money|financ|budget|account|treasur|invoice/, 'finance'], [/ops|operat|run|event|program|admin/, 'ops'], [/legal|law|contract|terms|privacy/, 'legal'], [/ceo|boss|charge of everything|lead|owner|director|founder/, 'ceo']];
  function findSeat(c, q) {
    q = String(q || '').toLowerCase().replace(/[?.!]+$/, '').replace(/\b(the|seat|team|department|stuff|things)\b/g, '').trim();
    if (!q) return null;
    return c.seats.find(x => x.title.toLowerCase() === q || roleName(x).toLowerCase() === q) || c.seats.find(x => q.includes(x.title.toLowerCase()) || x.title.toLowerCase().includes(q))
      || (() => { const k = (SYN.find(([re]) => re.test(q)) || [])[1]; return k ? c.seats.find(x => x.kind === k) : null; })();
  }
  const TPL_GUESS = [[/saas|software|app|tool|product|startup/, 'saas'], [/agency|studio for clients|client|freelanc|consult/, 'agency'], [/creator|youtube|newsletter|podcast|channel|tiktok|stream/, 'creator'], [/game/, 'game-studio'], [/shop|caf[eé]|salon|bakery|restaurant|store|local/, 'local'], [/nonprofit|non-profit|charity|cause|ngo/, 'nonprofit'], [/club|community|group|meetup/, 'club']];
  async function flint(text) {
    const t = String(text || '').toLowerCase().trim();
    let m;
    if ((/\b(make|turn|start|set up|create)\b.*\b(company|business)\b/.test(t) && !/\b(plan|card|cards|name|logo|email|website|site|page|doc)\b/.test(t)) || /^(a )?company( mode)?$/.test(t)) {
      if (!C.connected() || !pid()) return { text: 'Start or open a project first, then I can make it a company.' };
      const d = st.pid === pid() && st.d ? st.d : await load();
      if (co()) return { text: `${co().name} is already set up as a company with ${co().seats.length} roles.`, open: true };
      if (!d || !d.canLead) return { text: 'Only the host or a project lead can make this project a company. Ask them, or start your own project.' };
      const tpl = (TPL_GUESS.find(([re]) => re.test(t)) || [])[1] || 'blank';
      const r = await create(tpl, null, /\b(ai|helpers?|claude|agents?)\b/.test(t));
      if (!r) return { text: 'That didn\'t work. Try the Company page.', open: true };
      return { text: `Done: ${r.company.name} is set up as a company (${r.company.seats.map(roleName).join(', ')}). You’re the lead.${r.helper ? ` ${r.helper.name} does the other roles.` : ''} Tap a role to change what it does or who does it.`, open: true };
    }
    if ((m = /\bwho(?:'s| is| are)?\s+(in charge of|running|doing|handling|responsible for|owns?)\s+(.+)/.exec(t))) {
      if (!C.connected() || !pid()) return null;
      if (!(st.pid === pid() && st.d)) await load();
      const strong = /in charge|responsible/.test(m[1]), q = m[2];
      const c = co(); if (!c) return strong && /\b(marketing|sales|money|finance|growth|support|legal|ops|operations|design|building|code)\b/.test(q) ? { text: 'This project isn\'t set up as a company yet, so nobody has a role. Say "make me a company" to set one up.' } : null;
      const x = findSeat(c, q); if (!x) return strong ? { text: `I couldn't match "${q}" to a role. The roles are ${c.seats.map(roleName).join(', ')}.`, open: true } : null;
      const who = holderLine(x);
      return { text: `${roleName(x)}: ${who || 'nobody yet'}. ${x.charter.goal ? `This month: ${x.charter.goal}.` : ''}${x.last ? ` Last: ${x.last.text} (${ago(x.last.at)}).` : ''}`, open: true };
    }
    if ((m = /\bgive\s+(?:the\s+)?(.+?)\s+(?:seat\s+)?to\s+my\s+(?:claude|ai|agent|helper|ai helper)\b/.exec(t))) {
      if (!C.connected() || !pid()) return null;
      if (!(st.pid === pid() && st.d)) await load();
      const c = co(), d = st.d; if (!c) return { text: 'This project isn\'t a company yet. Say "make me a company" first.' };
      const x = findSeat(c, m[1]); if (!x) return { text: `Which role? The roles are ${c.seats.map(roleName).join(', ')}.`, open: true };
      if (!d.myAgent) return { text: 'You haven\'t connected an AI helper yet. Connect Claude Code (or another AI) first, then ask again.' };
      try { await C.api(`/projects/${encodeURIComponent(pid())}/company/seats/${encodeURIComponent(x.id)}/assign`, { method: 'POST', body: { agent: d.myAgent.id } }); load(); return { text: `${d.myAgent.name} now does the ${roleName(x)} role. It posts a short update each day, and anything on its “asks a person first” list comes to you before it happens.`, open: true }; }
      catch (e) { return { text: e.message, open: true }; }
    }
    return null;
  }

  // ---------- live ----------
  C.on('ws', msg => { if (msg && msg.type === 'company' && (!msg.project || msg.project === pid())) { clearTimeout(st.t); st.t = setTimeout(() => load(), 250); } });
  C.on('project', () => { st = { d: null, pid: '' }; nav(); setTimeout(() => load(), 50); if (open) draw(); });
  C.on('hello', () => setTimeout(() => load(), 300));
  addEventListener('tribe-groupstyle', () => { clearTimeout(st.t); st.t = setTimeout(() => load(), 150); });   // feat/group-styles: the lead's name, who may change things
  if (C.connected && C.connected()) setTimeout(() => load(), 600);

  window.TribeCompany = { open: show, go, close: hide, refresh: load, get: () => co(), view: () => st.d, loadedFor: () => (st.d ? st.pid : ''), tile, flint, openSeat, create };
})();
