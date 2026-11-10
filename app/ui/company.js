// Company mode (v0.27), client side. Server side: server/company.js (data contract in the company brief).
//   The Company view: hero = the org chart (CEO on top, the other seats in a grid: color stripe, who holds it, this
//   month's goal, status, last action), then Today (one standup per seat, a one-tap form for yours), Goals and the
//   decision log. A seat sheet edits the charter and who holds it. Empty state: "Make this project a company" with
//   template cards; one click makes it. The sidebar row "Company" (or a subtle "Make it a company" for leads), the
//   dashboard's At a glance tile (projects.js asks tile()), and Flint's "make me a company", "who's in charge of X",
//   "give X to my claude".
// Mount points for other features (they listen for the events below and fill the slots):
//   view:  #co-ledger-slot, #co-autopilot-slot                     event 'tribe:company-view'  { project, company }
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
  function seatCard(x, ceo) {
    const empty = !x.who.person && !x.who.agent, mine = (st.d.mySeats || []).includes(x.id);
    const goal = (co().goals || []).find(g => g.seat === x.id);
    return `<button class="co-seat ${ceo ? 'ceo' : ''} ${empty ? 'empty' : ''} ${mine ? 'mine' : ''}" data-seat="${esc(x.id)}" style="--sc:${esc(x.color)}" aria-label="${esc(x.title)} seat${empty ? ', open' : ': ' + esc(holderLine(x))}. ${esc(STATUS[x.status] || '')}">
      <span class="co-seat-top"><span class="co-avs">${empty ? '<span class="co-av open" aria-hidden="true">+</span>' : avatar(x.who.person) + avatar(x.who.agent)}</span>
        <span class="co-seat-id"><b>${esc(x.title)}</b><small>${empty ? 'Open seat' : esc(holderLine(x))}${mine ? ' · you' : ''}</small></span>
        <span class="co-pill s-${esc(x.status)}">${esc(STATUS[x.status] || x.status)}</span></span>
      <span class="co-seat-goal"><i>This month</i>${esc(x.charter.goal || 'No goal yet')}</span>
      ${goal ? `<span class="co-mini" aria-hidden="true"><i style="width:${goal.progress}%"></i></span>` : ''}
      <span class="co-seat-last">${x.last ? `${esc(x.last.text)} <span class="faint">· ${ago(x.last.at)}</span>` : empty ? 'Give it to a friend or an AI helper.' : 'No update yet.'}</span>
      ${empty ? `<div class="co-hire-slot" data-seat="${esc(x.id)}"></div>` : ''}</button>`;
  }

  // A live update never wipes what someone is typing: the redraw waits until the field loses focus. Open <details> stay open.
  const ui = { dec: false, week: false, pending: false };
  function busyTyping(sec) { const a = document.activeElement; return !!(a && sec.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && (a.value || a.tagName === 'SELECT')); }
  function draw() {
    const sec = section(); if (!sec || !open) return;
    if (busyTyping(sec)) { if (!ui.pending) { ui.pending = true; document.activeElement.addEventListener('blur', () => setTimeout(() => { ui.pending = false; draw(); }, 150), { once: true }); } return; }
    if (!C.connected()) { sec.innerHTML = `<div class="co-wrap"><div class="card co-empty"><span class="eyebrow">Company</span><h2>Join or start a tribe first</h2></div></div>`; return; }
    if (!st.d || st.pid !== pid()) { sec.innerHTML = `<div class="co-wrap"><p class="faint">Loading…</p></div>`; return; }
    const c = co(); if (!c) return drawEmpty(sec);
    const d = st.d, lead = d.canLead, ceo = c.seats.find(x => x.kind === 'ceo'), rest = c.seats.filter(x => x !== ceo);
    sec.innerHTML = `<div class="co-wrap">
      <header class="co-head"><div class="co-h-t"><span class="eyebrow">🏢 Company</span><h1>${esc(c.name)}</h1>
        ${c.mission ? `<p class="co-mission">${esc(c.mission)}</p>` : lead ? '<button class="linkish co-mission-add" id="co-edit-co">Add a one-line mission</button>' : ''}</div>
        ${lead ? '<button class="btn" id="co-settings" aria-label="Company settings"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-gear"/></svg>Settings</button>' : ''}</header>
      <section class="card co-org" aria-label="Org chart">
        <div class="co-org-h"><span class="eyebrow">Org chart</span><span class="faint">${c.seats.length} seats · tap one to see its charter</span></div>
        ${ceo ? `<div class="co-ceo-row">${seatCard(ceo, true)}</div><div class="co-stem" aria-hidden="true"></div>` : ''}
        <div class="co-grid">${rest.map(x => seatCard(x)).join('')}${lead && c.seats.length < 16 ? '<button class="co-add" id="co-add"><span aria-hidden="true">+</span>Add a seat</button>' : ''}</div>
        ${lead && d.myAgent && c.seats.some(x => !x.who.person && !x.who.agent) ? `<div class="co-fill"><span>Some seats are open.</span><button class="btn sm" id="co-fill">Fill them with ${esc(d.myAgent.name)}</button></div>` : ''}
      </section>
      <div class="co-cols">${todayCard(c, d)}${goalsCard(c, d)}</div>
      ${decisionsCard(c, d)}
      <div id="co-ledger-slot" data-project="${esc(st.pid)}"></div>
      <div id="co-autopilot-slot" data-project="${esc(st.pid)}"></div>
    </div>`;
    wire(sec, c, d);
    const dec = $('#co-dec'), wk = sec.querySelector('.co-week');
    if (dec) { dec.open = ui.dec; dec.addEventListener('toggle', () => { ui.dec = dec.open; }); }
    if (wk) { wk.open = ui.week; wk.addEventListener('toggle', () => { ui.week = wk.open; }); }
    try { window.dispatchEvent(new CustomEvent('tribe:company-view', { detail: { project: st.pid, company: c } })); } catch {}
  }

  function todayCard(c, d) {
    const t = d.today || { standups: {}, missing: [] }, held = c.seats.filter(x => x.who.person || x.who.agent);
    const mine = c.seats.filter(x => (d.mySeats || []).includes(x.id) && !t.standups[x.id]);
    const form = mine.length ? `<form class="co-su" id="co-su"><div class="co-su-h"><b>Your standup</b>${mine.length > 1 ? `<select class="input sm" id="co-su-seat" aria-label="Seat">${mine.map(x => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')}</select>` : `<span class="co-chip" style="--sc:${esc(mine[0].color)}">${esc(mine[0].title)}</span>`}</div>
      <input class="input" id="co-su-done" maxlength="600" placeholder="Done: what got done" aria-label="What got done">
      <input class="input" id="co-su-next" maxlength="600" placeholder="Next: what you'll do" aria-label="What's next">
      <div class="co-su-f"><input class="input" id="co-su-blocked" maxlength="600" placeholder="Blocked? (optional)" aria-label="Anything blocking"><button class="btn primary" type="submit">Post</button></div></form>` : '';
    const rows = held.map(x => { const s = t.standups[x.id];
      return `<div class="co-su-row" style="--sc:${esc(x.color)}"><span class="co-dot" aria-hidden="true"></span><div class="co-su-t"><b>${esc(x.title)}</b>${s ? `<p>${s.done ? `<span>Done</span> ${esc(s.done)}` : ''}${s.next ? `${s.done ? '<br>' : ''}<span>Next</span> ${esc(s.next)}` : ''}${s.blocked ? `<br><span class="bl">Blocked</span> ${esc(s.blocked)}` : ''}</p><small class="faint">${esc(s.byName || '')} · ${ago(s.at)}</small>` : '<p class="faint">No standup yet today.</p>'}</div></div>`; }).join('');
    return `<section class="card co-today" aria-label="Today"><div class="co-c-h"><span class="eyebrow">Today · standup</span><h3>What every seat is doing</h3></div>
      ${form}${rows || '<p class="faint">Give a seat to someone and their standup shows here.</p>'}
      ${t.weekly ? `<details class="co-week"><summary>Last weekly review · ${ago(t.weekly.at)}</summary><pre>${esc(t.weekly.text)}</pre></details>` : ''}</section>`;
  }
  function goalsCard(c, d) {
    const can = g => d.canLead || (g.seat && (d.mySeats || []).includes(g.seat));
    const seatOf = id => c.seats.find(x => x.id === id);
    return `<section class="card co-goals" aria-label="Goals"><div class="co-c-h"><span class="eyebrow">Goals</span><h3>This month's goals</h3></div>
      ${c.goals.length ? c.goals.map(g => { const s = seatOf(g.seat); return `<div class="co-goal" data-goal="${esc(g.id)}"><div class="co-goal-h"><b>${esc(g.title)}</b>${s ? `<span class="co-chip" style="--sc:${esc(s.color)}">${esc(s.title)}</span>` : ''}<span class="co-pct">${g.progress}%</span></div>
        <span class="co-bar" role="progressbar" aria-label="${esc(g.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${g.progress}"><i style="width:${g.progress}%"></i></span>
        ${g.results.map((r, i) => `<div class="co-kr"><span>${esc(r.text)}</span><span class="co-kr-n">${r.current} / ${r.target}${r.unit ? ' ' + esc(r.unit) : ''}</span>${can(g) ? `<button class="co-inc" data-inc="${esc(g.id)}:${i}" aria-label="Add one to ${esc(r.text)}">+1</button>` : ''}</div>`).join('')}
        ${d.canLead ? `<button class="linkish co-goal-del" data-gdel="${esc(g.id)}">Remove</button>` : ''}</div>`; }).join('') : '<p class="faint">No goals yet.</p>'}
      ${d.canLead && c.goals.length < 12 ? `<form class="co-goal-add" id="co-goal-add"><input class="input" id="co-g-title" maxlength="160" placeholder="New goal, e.g. 25 sign-ups" aria-label="New goal"><input class="input co-g-n" id="co-g-target" type="number" min="1" placeholder="Target" aria-label="Target number"><button class="btn sm" type="submit">Add</button></form>` : ''}</section>`;
  }
  function decisionsCard(c, d) {
    const list = d.decisions || [], ceo = c.seats.find(x => x.kind === 'ceo'), canCall = d.canLead || (ceo && (d.mySeats || []).includes(ceo.id));
    return `<details class="card co-dec" id="co-dec"${list.length && !phone() ? '' : ''}><summary><span class="eyebrow">Decisions</span><span class="co-dec-n">${list.length ? `${list.length} logged${d.waiting ? ` · ${d.waiting} waiting` : ''}` : 'None yet'}</span></summary>
      ${canCall ? `<form class="co-call" id="co-call"><input class="input" id="co-call-t" maxlength="160" placeholder="Make a CEO call: what's decided?" aria-label="CEO call"><input class="input" id="co-call-w" maxlength="600" placeholder="Why (one line)" aria-label="Why"><button class="btn sm primary" type="submit">Log it</button></form>` : ''}
      <div class="co-dec-list">${list.map(x => `<div class="co-dec-row"><span class="co-kind k-${esc(x.kind)}">${esc(KIND_L[x.kind] || x.kind)}</span><div><b>${esc(x.title)}</b>${x.why ? `<p>${esc(x.why)}</p>` : ''}<small class="faint">${esc(x.byName || 'TribeCode')} · ${ago(x.at)}</small></div></div>`).join('') || '<p class="faint">CEO calls, closed votes and decided approvals land here.</p>'}</div></details>`;
  }

  function drawEmpty(sec) {
    const d = st.d, lead = d && d.canLead;
    sec.innerHTML = `<div class="co-wrap"><section class="card co-empty co-hero" aria-label="Make this project a company">
      <span class="eyebrow">🏢 Company mode</span><h1>Make this project a company</h1>
      <p class="co-lead">Give the work seats, like a real business: a CEO, someone who builds, someone who grows it. Each seat has a charter and can be held by a friend, an AI helper, or both. Humans still say yes to anything outward or costly.</p>
      ${lead ? `<div class="co-tpls">${(d.templates || []).map(t => `<button class="co-tpl" data-tpl="${esc(t.id)}"><span class="co-tpl-e" aria-hidden="true">${esc(t.emoji)}</span><b>${esc(t.name)}</b><small>${esc(t.blurb)}</small><span class="co-tpl-s">${esc(t.seats.join(' · '))}</span></button>`).join('')}</div>
        <p class="faint co-note">One click makes it. You can rename seats, change charters and add or remove seats after.</p>` : '<p class="faint">Ask your host or a project lead to make this project a company.</p>'}
    </section></div>`;
    sec.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => create(b.dataset.tpl, b));
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
    sec.querySelectorAll('.co-seat[data-seat]').forEach(b => b.onclick = e => { if (e.target.closest('.co-hire-slot') && e.target.closest('.co-hire-slot').children.length) return; openSeat(b.dataset.seat); });
    const add = $('#co-add'); if (add) add.onclick = addSeatSheet;
    const set = $('#co-settings'); if (set) set.onclick = settingsSheet;
    const ec = $('#co-edit-co'); if (ec) ec.onclick = settingsSheet;
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
    const want = !!c || (lead && C.connected());
    if (!want) { if (row) row.classList.add('hidden'); return; }
    if (!row) { row = document.createElement('button'); row.className = 'nest-row core'; row.id = 'nest-company'; row.dataset.pnav = 'company'; after.after(row); }
    const html = `<svg class="i"><use href="#i-flag"/></svg><span>${c ? 'Company' : 'Make it a company'}</span>${c && c.seats.some(x => x.status === 'needs-you' || x.status === 'blocked') ? '<span class="n hot">!</span>' : ''}`;
    if (row.innerHTML !== html) row.innerHTML = html;
    row.classList.toggle('co-subtle', !c); row.classList.remove('hidden');
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
