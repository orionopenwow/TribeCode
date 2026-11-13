// Work (server/talent.js), redesigned in feat/work-v2 (docs/WORK-BACKEND.md for what comes next). One page, top to bottom:
//   the header "Work" + one line · three action tiles (Get help = post a gig, Offer help = your own gig, Find people) ·
//   the "you" strip (Your abilities from abilities.js + Your tasks across your tribes, one line when there are none) ·
//   the three-step guide with Show me (Flint's lesson director, flintlessons.js) · four tabs with icons:
//   Gigs (This tribe | Public), My offers (abilities.js mountOffers), Find people, Trade (Time bank | AI time).
// Every tab has an empty state with one action and "How it works" in three steps. Nothing waits on "Loading…" forever:
// no tribe (or a tribe that lives in this tab, offline.js) shows what this device has and says exactly what needs a
// tribe, with Create a tribe (tribenew.js); a network error is a calm card with Retry.
// Public: window.TribeTalent = { open(tab?), post(prefill?), editProfile(), hireSlot(el, pid, seatId), openGig(id), find(skill), reload() }.
//   Old tab names still work: templates -> Get help's templates, bank/compute -> Trade, public -> Gigs › Public.
// Every string from a person or the community repository is escaped; links are http(s) / mailto only.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const NAME = 'work';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const me = () => (C.state() || {}).me || {};
  const human = () => me().role && me().role !== 'agent' && me().role !== 'spectator';
  const projects = () => (C.state() || {}).projects || [];
  const ago = iso => { if (!iso) return ''; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : s < 86400 * 14 ? `${Math.round(s / 86400)} d ago` : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const safeHref = u => { try { const x = new URL(u); return ['http:', 'https:', 'mailto:'].includes(x.protocol) ? x.href : ''; } catch { return ''; } };
  const ico = (id, n = 16) => `<svg class="i" width="${n}" height="${n}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const SEATS = { ceo: ['CEO', '#F26B1D'], cto: ['Build', '#38C6B1'], design: ['Design', '#E86A92'], growth: ['Grow', '#FABD2F'], sales: ['Sales', '#6C7CFF'], support: ['Support', '#3BD16F'], ops: ['Run', '#94A3B8'], finance: ['Finance', '#2DD4BF'], legal: ['Legal', '#A78BFA'], custom: ['Custom', '#9AA7B8'] };
  const PAY = { free: 'Free', time: 'Time exchange', paid: 'Paid' };
  const WHAT = { 'claude-code': 'Claude Code', 'local-model': 'Local model', gpu: 'GPU', other: 'Other' };
  // feat/work-v2: four tabs, each with an icon. Templates fold into Get help, Time bank + Compute are Trade, Public is a
  // "Where" switch on Gigs (and a visibility choice on each gig). Old names still open the right place (LEGACY).
  const TABS = [['gigs', 'work', 'Gigs'], ['offers', 'gift', 'My offers'], ['people', 'people', 'Find people'], ['trade', 'swap', 'Trade']];
  const LEGACY = { templates: ['gigs', { tpl: true }], bank: ['trade', { trade: 'bank' }], compute: ['trade', { trade: 'compute' }], public: ['gigs', { where: 'public' }] };
  const NOPE = 'This needs a real tribe';   // offline.js answers this for anything a tribe-in-this-tab can't do
  const LS = 'tribecode.work.v1';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
  const remember = () => { try { localStorage.setItem(LS, JSON.stringify({ tab: st.tab, sort: st.sort, trade: st.trade })); } catch {} };
  const svg = (n, s = 16) => (window.TribeIcons && window.TribeIcons.svg ? window.TribeIcons.svg(n, s) : '');

  const st = { tab: TABS.some(t => t[0] === saved.tab) ? saved.tab : 'gigs', sort: saved.sort === 'new' ? 'new' : 'hot', trade: saved.trade === 'compute' ? 'compute' : 'bank', where: 'tribe', tpl: false,
    f: { skills: '', seat: '', pay: '', hours: 0, free: 0 }, data: null, bank: null, compute: null, pub: null, busy: false, err: '', local: false };
  let open_ = false;

  // Where Work's data comes from: 'tribe' (a real tribe answers /api/talent), 'waiting' (a tribe is reconnecting) or
  // 'local' (no tribe, or a tribe that lives in this tab: offline.js has no Work backend). Local never calls the API.
  const inTab = () => !!(window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active());
  function mode() {
    if (C.connected() && !inTab() && !st.local) return 'tribe';
    if (!C.connected() && !inTab() && C.hasToken && C.hasToken()) return 'waiting';
    return 'local';
  }

  // ---------- the view (beside app.js views, like captures.js) ----------
  function section() {
    let s = document.getElementById('view-' + NAME);
    if (!s) { const main = $('#main') || $('.main'); if (!main) return null; s = document.createElement('section'); s.id = 'view-' + NAME; s.className = 'hidden tl-view'; s.setAttribute('aria-label', 'Work'); main.appendChild(s); }
    return s;
  }
  function pick(tab) {
    if (!tab) return;
    if (LEGACY[tab]) { const [t, extra] = LEGACY[tab]; st.tab = t; Object.assign(st, extra); }
    else if (TABS.some(t => t[0] === tab)) st.tab = tab;
    remember();
  }
  function show(tab) {
    const sec = section(); if (!sec) return;
    pick(tab);
    const wasOpen = open_ && !sec.classList.contains('hidden');
    const swap = fn => (!wasOpen && window.TribeMotion && window.TribeMotion.swap ? window.TribeMotion.swap(fn) : fn());
    swap(() => {
      document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
      sec.classList.remove('hidden');
      document.body.classList.remove('mobile-chat', 'drawer-open');
      document.body.dataset.view = NAME; open_ = true;
      document.querySelectorAll('[data-nav].on, [data-go].on').forEach(b => b.classList.remove('on'));
      // Work is part of your dashboard (router.js): the global sidebar stays, the crumb and the link say Work
      const cl = $('#crumb-label'); if (cl) cl.textContent = 'Work';
      if (location.hash !== '#/hub/work') history.replaceState(null, '', location.pathname + location.search + '#/hub/work');
      draw();
    });
    try { C.sendActivity && C.sendActivity('Work'); } catch {}
    load();
  }
  function hide() { const sec = section(); if (sec) sec.classList.add('hidden'); open_ = false; closePop(); needClose(); if (location.hash === '#/hub/work') history.replaceState(null, '', location.pathname + location.search); }
  new MutationObserver(() => { if (open_ && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

  // One load per open. A failure never leaves "Loading…" on screen: it becomes a calm message with Retry, and a tribe
  // that lives in this tab (NOPE) switches Work to what this device has.
  async function load() {
    if (mode() !== 'tribe') { st.busy = false; if (open_) draw(); return; }
    st.busy = true; st.err = '';
    const jobs = [C.api('/talent').then(d => { st.data = d; })];
    if (st.tab === 'trade' && st.trade === 'bank') jobs.push(C.api('/talent/timebank').then(d => { st.bank = d; }));
    if (st.tab === 'trade' && st.trade === 'compute') jobs.push(C.api('/talent/compute').then(d => { st.compute = d; }));
    if (st.tab === 'gigs' && st.where === 'public' && !st.pub) jobs.push(C.api('/talent/public').then(d => { st.pub = d; }).catch(() => { st.pub = { available: false, gigs: [], reason: 'offline' }; }));
    try { await Promise.all(jobs); }
    catch (e) { const m = String((e && e.message) || ''); if (m === NOPE || /real tribe/i.test(m)) st.local = true; else st.err = m || 'no answer'; }
    st.busy = false;
    if (open_) draw();
    loadTasks();
  }

  // ---------- your tasks across your tribes (was hub.js's own header; now one compact row in the "you" strip) ----------
  let tasks = { at: 0, list: [] };
  async function loadTasks(force) {
    if (mode() !== 'tribe') { tasks = { at: 0, list: [] }; return paintTasks(); }
    if (!force && Date.now() - tasks.at < 15000) return paintTasks();
    const meId = me().id, mine = ((C.state() || {}).members || []).filter(m => m.role === 'agent' && m.owner === meId).map(m => m.id), out = [];
    await Promise.all(projects().slice(0, 12).map(async p => { try { const r = await C.api('/tasks', { project: p.id }); for (const k of r.tasks || []) if (k.status !== 'done' && (k.assignee === meId || mine.includes(k.assignee))) out.push({ ...k, pid: p.id, pname: p.name }); } catch {} }));
    const rank = { doing: 0, review: 1, backlog: 2 };
    tasks = { at: Date.now(), list: out.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || String(a.due || '9').localeCompare(String(b.due || '9'))) };
    paintTasks();
  }
  function tasksHtml() {
    const l = tasks.list || [];
    if (!l.length) return `<div class="wk-row" id="hub-mytasks"><span class="wk-row-ic">${svg('tasks', 18)}</span><span class="wk-row-t"><b>Your tasks</b><span class="wk-row-v">Nothing assigned to you</span></span></div>`;
    const rows = l.slice(0, 3).map(k => `<button type="button" class="hmt-row" data-mytask="${esc(k.pid)}|${esc(k.id)}"><span class="hmt-st s-${esc(k.status)}">${esc(k.status === 'doing' ? 'Doing' : k.status === 'review' ? 'Review' : 'To do')}</span><b>${esc(k.title)}</b>${k.due ? `<small>Due ${esc(k.due)}</small>` : ''}<span class="hmt-pj">${esc(k.pname || 'A tribe')}</span></button>`).join('');
    return `<div class="wk-row has" id="hub-mytasks"><span class="wk-row-ic">${svg('tasks', 18)}</span><span class="wk-row-t"><b>Your tasks</b><span class="wk-row-v">${l.length} across your tribes${l.length > 3 ? ` · showing 3` : ''}</span></span><div class="hmt-list">${rows}</div></div>`;
  }
  function paintTasks() {
    const old = document.querySelector('#view-work #hub-mytasks'); if (!old) return;
    const html = tasksHtml(); if (old.outerHTML !== html) old.outerHTML = html;
  }

  // ---------- filters + sort ----------
  const fCount = () => (st.f.skills.trim() ? 1 : 0) + (st.f.seat ? 1 : 0) + (st.f.pay ? 1 : 0) + (st.f.hours ? 1 : 0);
  const wantSkills = () => st.f.skills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  function passes(x, isPerson) {
    const w = wantSkills();
    if (w.length && !w.some(s => (x.skills || []).some(k => k.includes(s)))) return false;
    if (st.f.seat && (isPerson ? !(x.roles || []).includes(st.f.seat) : x.seatKind !== st.f.seat)) return false;
    if (st.f.pay && ((isPerson ? x.rate : x.pay) || {}).type !== st.f.pay) return false;
    if (st.f.hours && (x.hours || 0) > st.f.hours) return false;
    if (isPerson && st.f.free && (x.hours || 0) < st.f.free) return false;   // Find people: at least N hours a week free
    return true;
  }
  const hot = g => (g.applicantCount || 0) * 2 + (g.pay && g.pay.type === 'paid' ? 1 : 0) + 6 / (1 + (Date.now() - Date.parse(g.at || 0)) / 86400000);
  const sorted = list => list.slice().sort((a, b) => st.sort === 'new' ? String(b.at || b.posted || b.updated).localeCompare(String(a.at || a.posted || a.updated)) : hot(b) - hot(a));

  // ---------- drawing ----------
  const payChip = p => p ? `<i class="tl-pay" data-pay="${esc(p.type)}">${esc(PAY[p.type] || 'Free')}${p.text ? ` · ${esc(p.text)}` : ''}</i>` : '';
  const seatChip = k => k && SEATS[k] ? `<i class="tl-seat" style="--seat:${SEATS[k][1]}">${esc(SEATS[k][0])}</i>` : '';
  const skillChips = (l, n = 5) => (l || []).length ? `<span class="tl-skills">${l.slice(0, n).map(s => `<i>${esc(s)}</i>`).join('')}${l.length > n ? `<i>+${l.length - n}</i>` : ''}</span>` : '';
  function toolbar(withSort, withWhere) {
    const n = fCount();
    const where = withWhere ? `<div class="tl-seg wk-where" role="group" aria-label="Where">${[['tribe', 'This tribe'], ['public', 'Public']].map(([k, l]) => `<button type="button" class="${st.where === k ? 'on' : ''}" data-where="${k}" aria-pressed="${st.where === k}">${l}</button>`).join('')}</div>` : '';
    const sort = withSort ? `<div class="tl-seg" role="group" aria-label="Sort"><button class="${st.sort === 'hot' ? 'on' : ''}" data-sort="hot" aria-pressed="${st.sort === 'hot'}">Hot</button><button class="${st.sort === 'new' ? 'on' : ''}" data-sort="new" aria-pressed="${st.sort === 'new'}">New</button></div>` : '';
    return `<div class="tl-bar">${where || sort || '<span></span>'}<span class="tl-bar-r">${where ? sort : ''}<button class="btn ghost sm tl-fbtn" id="tl-filters" aria-haspopup="dialog">${svg('sliders', 14)} Filters${n ? ` <b class="tl-fn">${n}</b>` : ''}</button></span></div>`;
  }
  function gigCard(g, hero) {
    if (g.kind === 'offer' && window.TribeAbilities) return window.TribeAbilities.offerCard(g);   // a gig someone posted for themselves
    const col = g.color || (g.seatKind && SEATS[g.seatKind] ? SEATS[g.seatKind][1] : 'var(--edge)');
    return `<article class="tl-gig${hero ? ' hero card' : ''}" data-gig="${esc(g.id)}" style="--seat:${col}" tabindex="0" role="button" aria-label="${esc(g.title)}">
      <div class="tl-gig-top"><span class="eyebrow">${esc(g.kind === 'seat' ? 'Seat' : g.kind === 'bounty' ? 'Bounty' : 'Task')}${g.projectName ? ` · ${esc(g.projectName)}` : ''}${g.status === 'draft' ? ' · draft, waiting for approval' : g.status === 'filled' && g.stage ? ` · ${esc({ assigned: 'assigned', working: 'in progress', review: 'in review', done: 'done', credited: 'credited' }[g.stage] || g.stage)}` : g.status !== 'open' ? ` · ${esc(g.status)}` : ''}</span>${seatChip(g.seatKind)}</div>
      <h3>${esc(g.title)}</h3>
      ${g.description ? `<p class="tl-desc">${esc(g.description)}</p>` : ''}
      <div class="tl-meta">${payChip(g.pay)}${g.hours ? `<i class="tl-h">${esc(g.hours)} h</i>` : ''}${skillChips(g.skills, hero ? 6 : 3)}</div>
      ${window.TribeWorkLoop ? window.TribeWorkLoop.stageHtml(g) : ''}
      <div class="tl-foot"><small>${esc(g.byName)} · ${esc(ago(g.at))}${g.applicantCount ? ` · ${g.applicantCount} interested` : ''}</small>
        ${g.canManage ? `<button class="btn sm tonal" data-open="${esc(g.id)}">${g.stage === 'review' ? 'Review' : g.stage === 'done' ? 'Credit' : g.status === 'open' ? (g.applicantCount ? 'Pick someone' : 'Match') : 'Track'}</button>` : g.mine ? `<button class="btn sm primary" data-open="${esc(g.id)}">${g.stage === 'review' ? 'Handed in' : 'Update'}</button>` : g.applied ? '<span class="tl-ok">Applied ✓</span>' : g.status === 'open' && human() ? `<button class="btn sm primary" data-apply="${esc(g.id)}">I'm interested</button>` : ''}</div>
    </article>`;
  }
  // An empty tab: what it is, one action, and "How it works" in three steps.
  const HOW = {
    gigs: [['quill', 'Say what you need and roughly how long it takes.'], ['people', 'Friends and AI helpers say they are interested.'], ['check', 'Pick one. It becomes their task.']],
    people: [['user', 'Add your skills and free hours.'], ['search', 'Search by skill, like “draw” or “javascript”.'], ['chat', 'Message them, or post a gig they can take.']],
    trade: [['clock', 'Help a friend for an hour.'], ['check', 'You both confirm the hours.'], ['swap', 'Spend your hours when you need help. No money.']],
  };
  const how = k => `<ol class="wk-how" aria-label="How it works">${HOW[k].map(([i, t], n) => `<li><span class="wk-how-ic">${svg(i, 18)}</span><span><b>${n + 1}.</b> ${esc(t)}</span></li>`).join('')}</ol>`;
  function emptyCard({ id, icon, title, text, act, k, extra }) {
    return `<section class="wk-empty${id === 'tl-empty' ? ' tl-empty' : ''}"${id ? ` id="${id}"` : ''}><span class="wk-empty-ic">${svg(icon, 24)}</span>
      <h3>${esc(title)}</h3><p>${esc(text)}</p>${act || ''}${extra || ''}${k ? `<span class="wk-how-h">How it works</span>${how(k)}` : ''}</section>`;
  }
  const needAct = (id = 'tl-e-start') => `<div class="tl-empty-acts"><button class="btn primary" id="${id}" data-wk="tribe">${svg('plus', 16)} Create a tribe</button></div>`;
  function errCard() {
    return `<section class="wk-err" id="wk-err" role="status"><span class="wk-empty-ic">${svg('refresh', 20)}</span><div><b>Work didn’t load.</b><p>Your tribe didn’t answer. Check the connection, then try again.</p></div><button class="btn sm" data-retry="1" id="wk-retry">Retry</button></section>`;
  }
  const loading = () => '<p class="tl-none wk-loading" role="status">Loading…</p>';
  const pending = () => (st.err ? '' : loading());   // with an error, draw() already shows the Retry card

  function gigsTab() {
    const m = mode();
    if (m === 'local') return emptyCard({ id: 'tl-empty', icon: 'work', title: 'Gigs live in a tribe', k: 'gigs',
      text: 'Posting a gig and answering one needs a tribe your friends can reach. Your abilities and offers already work on this device.',
      act: needAct(), extra: `<p class="wk-alt"><button class="linkish" id="tl-e-join" data-wk="join">Join a friend’s tribe with a link</button><span aria-hidden="true">·</span><button class="linkish" id="tl-e-tpl" data-wk="tpl">Plan it first with a template</button></p>` });
    if (m === 'waiting') return emptyCard({ id: 'tl-empty', icon: 'refresh', title: 'Reconnecting to your tribe', text: 'Gigs come back as soon as your tribe does.', act: '<div class="tl-empty-acts"><button class="btn" data-retry="1" id="wk-retry">Retry</button></div>' });
    if (!st.data) return pending(true);
    if (st.where === 'public') return toolbar(true, true) + publicTab();
    const all = st.data.gigs || [];
    const sug = window.TribeWorkLoop && st.data.canPost ? window.TribeWorkLoop.suggestHtml() : '';
    const active = g => g.status === 'open' || g.status === 'draft' || (g.status === 'filled' && !['done', 'credited'].includes(g.stage));
    const list = sorted(all.filter(g => g.status === 'open' || g.status === 'draft' || g.canManage || g.mine).filter(g => passes(g)));
    const live = list.filter(active), done = list.filter(g => !active(g));
    if (!all.length) return `${toolbar(true, true)}${emptyCard({ id: 'wk-empty-gigs', icon: 'work', title: 'No gigs yet', k: 'gigs', text: 'Post what you need. Everyone in this tribe sees it here.',
      act: st.data.canPost ? `<div class="tl-empty-acts"><button class="btn primary" data-post="1">${svg('hand', 16)} Get help</button></div>` : '' })}${sug}`;
    return `${toolbar(true, true)}${live.length ? gigCard(live[0], true) : `<p class="tl-none">No open gigs match your filters.</p>`}
      ${live.length > 1 ? `<div class="tl-grid">${live.slice(1).map(g => gigCard(g)).join('')}</div>` : ''}
      ${done.length ? `<details class="tl-done"><summary>Finished and closed (${done.length})</summary><div class="tl-grid">${done.map(g => gigCard(g)).join('')}</div></details>` : ''}${sug}`;
  }
  function personCard(p) {
    const mine = p.id === me().id;
    return `<article class="tl-person card" data-person="${esc(p.id)}">
      <div class="tl-p-head"><span class="tl-av" style="background:${esc(p.color || '#6C7CFF')}">${esc((p.name || '?').slice(0, 1).toUpperCase())}</span><div><b>${esc(p.name)}</b><small>${p.hours ? `${esc(p.hours)} h/week` : 'hours flexible'}${p.tz ? ` · ${esc(p.tz.split('/').pop().replace(/_/g, ' '))}` : ''}</small></div>${payChip(p.rate)}</div>
      ${(p.roles || []).length ? `<div class="tl-meta">${p.roles.map(seatChip).join('')}</div>` : ''}
      ${(p.skills || []).length ? `<span class="tl-skills">${p.skills.slice(0, 6).map(s => `<i>${esc(s)}${(p.levels || {})[s] === 3 ? ' · expert' : ''}</i>`).join('')}</span>` : ''}
      ${p.bio ? `<p class="tl-desc">${esc(p.bio)}</p>` : ''}
      ${(p.projects || []).length || (p.links || []).length ? `<div class="tl-port">${(p.projects || []).map(x => `<span>${esc(x.name)}</span>`).join('')}${(p.links || []).map(l => safeHref(l.url) ? `<a href="${esc(safeHref(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label || new URL(l.url).hostname)}</a>` : '').join('')}</div>` : ''}
      <div class="tl-foot"><small>${p.balance ? `Time bank ${p.balance > 0 ? '+' : ''}${esc(p.balance)} h` : ''}</small><span class="tl-tx-b">${window.TribeAbilities ? `<button class="btn sm ghost" data-ab-person="${esc(p.id)}">View profile</button>` : ''}${mine ? `<button class="btn sm ghost" ${window.TribeAbilities ? 'data-ab-edit="1"' : 'data-edit-prof="1"'}>Edit</button>` : human() ? `<button class="btn sm tonal" data-dm="${esc(p.id)}">Message</button>` : ''}</span></div>
    </article>`;
  }
  function peopleTab() {
    const m = mode();
    if (m === 'local') return emptyCard({ icon: 'people', title: 'Finding people needs a tribe', k: 'people', text: 'You can only search people who share a tribe with you. Make one and invite friends.', act: needAct('wk-need-people') });
    if (m === 'waiting') return emptyCard({ icon: 'refresh', title: 'Reconnecting to your tribe', text: 'People come back as soon as your tribe does.' });
    if (!st.data) return pending(true);
    const all = (st.data.people || []), list = all.filter(p => passes(p, true));
    const findbar = `<div class="ab-findbar" role="search"><input class="input" id="tl-find-skill" placeholder="Find someone who can… (draw, javascript)" value="${esc(st.f.skills)}" aria-label="Skill">
      <select class="input" id="tl-find-hours" aria-label="Availability">${[[0, 'Any availability'], [5, '5+ h/week'], [10, '10+ h/week'], [20, '20+ h/week']].map(([v, l]) => `<option value="${v}" ${st.f.free === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    if (!all.length) return findbar + emptyCard({ id: 'wk-empty-people', icon: 'people', title: 'Nobody listed yet', k: 'people', text: 'People show up here once they add their abilities. Start with yours.',
      act: human() ? `<div class="tl-empty-acts"><button class="btn primary" ${window.TribeAbilities ? 'data-ab-edit="1"' : 'data-edit-prof="1"'}>${svg('user', 16)} Add your abilities</button></div>` : '' });
    return `${findbar}${toolbar(false)}
      ${list.length ? `<div class="tl-grid">${list.map(personCard).join('')}</div>` : `<p class="tl-none">${fCount() || st.f.free ? 'Nobody matches. Try fewer filters.' : 'Nobody here is open to work yet.'}</p>`}`;
  }
  function memberOptions(sel) {
    const ms = ((C.state() || {}).members || []).filter(m => m.role !== 'agent' && m.role !== 'spectator' && m.id !== me().id);
    return ms.map(m => `<option value="${esc(m.id)}" ${sel === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  }
  function bankTab() {
    const b = st.bank; if (!b) return pending(false);
    const row = e => {
      const gave = e.from === me().id, other = gave ? e.toName : e.fromName, mineOk = e.ok && e.ok[gave ? 'from' : 'to'];
      return `<li class="tl-tx" data-tx="${esc(e.id)}"><span class="tl-tx-h ${gave ? 'plus' : 'minus'}">${gave ? '+' : '−'}${esc(e.hours)} h</span>
        <span class="tl-tx-t"><b>${gave ? `You helped ${esc(other)}` : `${esc(other)} helped you`}</b><small>${e.note ? esc(e.note) + ' · ' : ''}${esc(ago(e.at))}${e.status === 'proposed' ? (mineOk ? ` · waiting for ${esc(other)}` : '') : ` · ${esc(e.status)}`}</small></span>
        ${e.status === 'proposed' && !mineOk && human() ? `<span class="tl-tx-b"><button class="btn sm ok" data-tx-ok="${esc(e.id)}">Confirm</button><button class="btn sm ghost" data-tx-no="${esc(e.id)}">Not right</button></span>` : ''}</li>`;
    };
    return `<section class="card tl-bal"><span class="eyebrow">Your hours</span>
        <div class="tl-bal-n"><b>${b.balance.net > 0 ? '+' : ''}${esc(b.balance.net)}</b><span>hours</span></div>
        <div class="tl-bal-s"><span>Given <b>${esc(b.balance.given)} h</b></span><span>Received <b>${esc(b.balance.received)} h</b></span>${b.waiting ? `<span class="tl-wait">${b.waiting} to confirm</span>` : ''}</div></section>
      ${human() ? `<form class="tl-log" id="tl-log"><span class="eyebrow">Log hours</span>
        <div class="tl-log-row"><select class="input" id="tl-log-dir" aria-label="Direction"><option value="gave">I helped</option><option value="got">I was helped by</option></select>
        <select class="input" id="tl-log-who" aria-label="Person" required>${memberOptions()}</select>
        <input class="input" id="tl-log-h" type="number" min="0.25" max="80" step="0.25" value="1" aria-label="Hours"><span class="tl-unit">h</span></div>
        <div class="tl-log-row"><input class="input" id="tl-log-note" maxlength="200" placeholder="What was it? (optional)"><button class="btn primary" type="submit">Log</button></div></form>` : ''}
      ${b.entries.length ? `<section><div class="sec-head"><span class="eyebrow">History</span><h2>Hours with friends</h2></div><ul class="tl-txs">${b.entries.map(row).join('')}</ul></section>` : `<div class="wk-howonly"><span class="wk-how-h">How it works</span>${how('trade')}</div>`}`;
  }
  function computeTab() {
    const c = st.compute; if (!c) return pending(false);
    const mine = c.offers.filter(o => o.mine), others = c.offers.filter(o => !o.mine && o.on);
    const offerRow = o => `<article class="tl-offer card" data-offer="${esc(o.id)}"><div class="tl-p-head"><span class="tl-av" style="background:${esc(o.color || '#38C6B1')}">${esc((o.name || '?').slice(0, 1).toUpperCase())}</span><div><b>${esc(o.name)} · ${esc(WHAT[o.what] || o.what)}</b><small>${esc(o.usedThisWeek || 0)} of ${esc(o.hoursPerWeek)} h used this week${o.what === 'claude-code' ? ` · ${esc({ ask: 'asks before each use', always: 'says yes on its own', never: 'kept private for now' }[o.askPolicy] || '')}` : ''}</small></div></div>
      ${o.rules ? `<p class="tl-desc">${esc(o.rules)}</p>` : ''}
      <div class="tl-foot"><span></span>${o.mine ? `<span class="tl-tx-b"><button class="btn sm ghost" data-off-edit="${esc(o.id)}">Edit</button><button class="btn sm ghost" data-off-del="${esc(o.id)}">Remove</button></span>` : human() ? `<button class="btn sm tonal" data-off-ask="${esc(o.id)}">Ask for time</button>` : ''}</div></article>`;
    const reqRow = r => { const theirs = r.offerer === me().id; return `<li class="tl-tx"><span class="tl-tx-h">${esc(r.hours)} h</span><span class="tl-tx-t"><b>${theirs ? `${esc(r.byName)} asked for your ${esc(WHAT[r.what] || '')}` : `You asked ${esc(r.offererName)}`}</b><small>${r.note ? esc(r.note) + ' · ' : ''}${esc(r.status)}${r.used ? ` · ${esc(r.used)} h used` : ''} · ${esc(ago(r.at))}</small></span>
      ${theirs && r.status === 'pending' ? '<button class="btn sm tonal" data-inbox="1">Answer in your inbox</button>' : theirs && r.status === 'approved' ? `<span class="tl-tx-b"><button class="btn sm ghost" data-used="${esc(r.id)}">Log 1 h used</button></span>` : ''}</li>`; };
    if (!c.offers.length && !c.requests.length) return emptyCard({ id: 'wk-empty-ai', icon: 'spark', title: 'Nobody is sharing AI time yet', text: 'Have spare Claude Code or a strong computer? Offer a few hours a week. People ask; you say yes or no each time.',
      act: human() ? '<div class="tl-empty-acts"><button class="btn primary" data-off-new="1">Offer my AI time</button></div>' : '' });
    return `<p class="tl-fine">${esc(c.note)}</p>
      <section><div class="tl-sh"><div class="sec-head"><span class="eyebrow">Offered to the tribe</span><h2>AI and computer time</h2></div>${human() && mine.length < 4 ? '<button class="btn sm primary" data-off-new="1">Offer mine</button>' : ''}</div>
        ${mine.length ? `<div class="tl-grid">${mine.map(offerRow).join('')}</div>` : ''}
        ${others.length ? `<div class="tl-grid">${others.map(offerRow).join('')}</div>` : `<p class="tl-none">${mine.length ? 'Nobody else is offering yet.' : 'Nobody is offering yet.'}</p>`}</section>
      ${c.requests.length ? `<section><div class="sec-head"><span class="eyebrow">Requests</span><h2>Asked and answered</h2></div><ul class="tl-txs">${c.requests.map(reqRow).join('')}</ul></section>` : ''}`;
  }
  function tradeTab() {
    const m = mode();
    if (m === 'local') return emptyCard({ icon: 'swap', title: 'Trading time needs a tribe', k: 'trade', text: 'Hours and AI time are traded between people in one tribe, so both of you can confirm them.', act: needAct('wk-need-trade') });
    if (m === 'waiting') return emptyCard({ icon: 'refresh', title: 'Reconnecting to your tribe', text: 'Your hours come back as soon as your tribe does.' });
    const seg = `<div class="tl-seg wk-trade" role="group" aria-label="Trade">${[['bank', 'clock', 'Time bank'], ['compute', 'spark', 'AI time']].map(([k, i, l]) => `<button type="button" class="${st.trade === k ? 'on' : ''}" data-trade="${k}" aria-pressed="${st.trade === k}">${svg(i, 14)} ${l}</button>`).join('')}</div>`;
    return seg + (st.trade === 'compute' ? computeTab() : bankTab());
  }
  function publicTab() {
    const p = st.pub; if (!p) return '<p class="tl-none wk-loading" role="status">Looking at the community board…</p>';
    if (!p.available || !p.gigs.length) return emptyCard({ id: 'wk-empty-public', icon: 'globe', title: p.available ? 'No public gigs yet' : 'The community board isn’t reachable', text: p.available ? 'When a tribe makes a gig public, it shows up here for every tribe. Make one of yours public from its page.' : 'Check your connection, then try again.',
      act: '<div class="tl-empty-acts"><button class="btn sm" data-pub-refresh="1">Retry</button></div>' });
    const list = sorted(p.gigs.filter(g => passes(g)));
    const card = g => { const href = safeHref(g.contact); return `<article class="tl-gig" style="--seat:${g.seatKind && SEATS[g.seatKind] ? SEATS[g.seatKind][1] : 'var(--edge)'}"><div class="tl-gig-top"><span class="eyebrow">${esc(g.kind)}${g.tribe ? ` · ${esc(g.tribe)}` : ''}</span>${seatChip(g.seatKind)}</div><h3>${esc(g.title)}</h3>${g.description ? `<p class="tl-desc">${esc(g.description)}</p>` : ''}<div class="tl-meta">${payChip(g.pay)}${g.hours ? `<i class="tl-h">${esc(g.hours)} h</i>` : ''}${skillChips(g.skills, 3)}</div><div class="tl-foot"><small>${esc(g.posted || '')}</small>${g.contact ? (href ? `<a class="btn sm tonal" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Contact</a>` : `<span class="tl-contact">${esc(g.contact)}</span>`) : ''}</div></article>`; };
    return `<p class="tl-fine">Read-only, from the community board (${esc(p.repo)}). Reach posters through the contact they chose.</p>${list.length ? `<div class="tl-grid">${list.map(card).join('')}</div>` : '<p class="tl-none">No public gigs match your filters.</p>'}`;
  }
  function offersTab() { return '<div id="wk-offers"></div>'; }

  // ---------- the page: one header, three actions, you, the guide, four tabs ----------
  const TILES = [['get', 'hand', 'Get help', 'Post what you need'], ['offer', 'gift', 'Offer help', 'Say what you can do'], ['find', 'search', 'Find people', 'By skill and free hours']];
  const GUIDE = [['quill', 'Say what you need.'], ['people', 'Friends or AIs offer.'], ['check', 'Accept and it becomes a task.']];
  function draw() {
    const sec = section(); if (!sec) return;
    const m = mode(), canPost = m !== 'tribe' || !st.data || st.data.canPost !== false;
    const body = st.tab === 'people' ? peopleTab() : st.tab === 'trade' ? tradeTab() : st.tab === 'offers' ? offersTab() : gigsTab();
    const crumb = '<nav class="hub-crumb" aria-label="Breadcrumb"><button type="button" class="hc-home" data-hc-home>' + svg('home', 13) + 'Home</button><span class="hc-sep" aria-hidden="true">›</span><span class="hc-here" aria-current="page">Work</span></nav>';
    const keepScroll = sec.scrollTop;
    sec.innerHTML = `<div class="tl-wrap wk" data-mode="${m}">
      ${crumb}
      <header class="wk-head" id="wk-head"><h1 class="wk-title">Work</h1><p class="wk-sub">Find help, offer help, trade time.</p></header>
      <div class="wk-tiles" id="wk-tiles" role="group" aria-label="Start here">${TILES.map(([k, i, t, s]) => `<button type="button" class="wk-tile" id="wk-${k}" data-wk="${k}"${k === 'get' && !canPost ? ' disabled' : ''}><span class="wk-tile-ic">${svg(i, 24)}</span><span class="wk-tile-t"><b>${t}</b><small>${s}</small></span></button>`).join('')}</div>
      <section class="wk-me" id="wk-me" aria-label="You"><div id="ab-mount"></div>${tasksHtml()}</section>
      <section class="wk-guide" id="wk-guide" aria-label="How Work works"><ol>${GUIDE.map(([i, t], n) => `<li data-step="${n + 1}"><span class="wk-n">${n + 1}</span><span class="wk-g-ic">${svg(i, 16)}</span><span>${esc(t)}</span></li>`).join('')}</ol><button type="button" class="btn sm" id="wk-show">${svg('eye', 14)} Show me</button></section>
      ${st.tpl ? `<section class="wk-tpl" id="wk-tpl" aria-label="Templates"><header><div><span class="eyebrow">Get help</span><h2>Start from a template</h2></div><button class="fwin-btn" data-tpl-x="1" aria-label="Close templates">${ico('i-x')}</button></header><div id="tl-tpl"></div></section>` : ''}
      <nav class="tl-tabs wk-tabs" id="wk-tabs" role="tablist" aria-label="Work">${TABS.map(([k, i, l]) => `<button role="tab" class="${st.tab === k ? 'on' : ''}" aria-selected="${st.tab === k}" data-tab="${k}" id="wk-tab-${k}">${svg(i, 16)}<span>${l}</span>${k === 'trade' && st.data && st.data.balance && st.data.balance.net ? ` <small>${st.data.balance.net > 0 ? '+' : ''}${esc(st.data.balance.net)} h</small>` : ''}</button>`).join('')}</nav>
      <div class="tl-body" id="tl-body" role="tabpanel" aria-labelledby="wk-tab-${st.tab}">${st.err && m === 'tribe' ? errCard() : ''}${body}</div>
      ${window.TribePremium ? window.TribePremium.footHtml() : ''}</div>`;
    sec.scrollTop = keepScroll;
    afterDraw(sec);
  }
  function afterDraw(sec) {
    const am = sec.querySelector('#ab-mount'); if (am && window.TribeAbilities) window.TribeAbilities.mount(am);
    const ao = sec.querySelector('#wk-offers'); if (ao && window.TribeAbilities && window.TribeAbilities.mountOffers) window.TribeAbilities.mountOffers(ao);
    const fs = sec.querySelector('#tl-find-skill'); if (fs) { fs.oninput = () => { st.f.skills = fs.value; clearTimeout(fs.t); fs.t = setTimeout(() => { const pos = fs.selectionStart; draw(); const n = $('#tl-find-skill'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }, 250); }; }
    if (fs && st.focusFind) { fs.focus(); try { fs.scrollIntoView({ block: 'nearest' }); } catch {} if (!st.busy) st.focusFind = false; }
    const fh = sec.querySelector('#tl-find-hours'); if (fh) fh.onchange = () => { st.f.free = +fh.value || 0; draw(); };
    const tp = sec.querySelector('#tl-tpl'); if (tp && window.TribeTemplates) window.TribeTemplates.mount(tp);
    const sg = sec.querySelector('#wl-suggest'); if (sg && window.TribeWorkLoop) window.TribeWorkLoop.mountSuggest(sg, (st.data && st.data.gigs) || [], () => load());
    sec.querySelectorAll('[data-mytask]').forEach(b => b.onclick = () => { const [pid, id] = b.dataset.mytask.split('|'); if (window.TribeHub && window.TribeHub.jump) window.TribeHub.jump({ project: pid, ref: { type: 'task', id } }); });
  }

  // ---------- "This needs a tribe", said exactly, with the one-tap fix ----------
  const NEEDS = { get: 'Posting a gig', find: 'Finding people', trade: 'Trading time', apply: 'Answering a gig' };
  function needClose() { const n = document.getElementById('wk-need'); if (n) n.remove(); }
  function needsTribe(what) {
    let n = document.getElementById('wk-need');
    if (!n) { n = document.createElement('div'); n.id = 'wk-need'; n.className = 'wk-need'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
    const waiting = mode() === 'waiting';
    n.innerHTML = `<span class="wk-need-ic">${svg('tribe', 18)}</span><div class="wk-need-t"><b>${esc(what)} needs a tribe.</b><small>${waiting ? 'Your tribe is reconnecting. Try again in a moment.' : 'Only people in a tribe you share can see it. Make one in a minute; it can live on this device.'}</small></div>${waiting ? '<button class="btn sm" data-retry="1">Retry</button>' : '<button class="btn sm primary" id="wk-need-go" data-wk="tribe">Create a tribe</button>'}<button class="wk-need-x" aria-label="Close" data-need-x="1">${ico('i-x', 14)}</button>`;
    clearTimeout(needsTribe.t); needsTribe.t = setTimeout(needClose, 9000);
  }
  function newTribe() {
    needClose();
    if (window.TribeNew && window.TribeNew.open) return window.TribeNew.open();
    if (window.TribeProjects && window.TribeProjects.openNew) return window.TribeProjects.openNew();
  }
  function tile(k) {
    const m = mode();
    if (k === 'offer') return window.TribeAbilities ? window.TribeAbilities.post() : null;
    if (m !== 'tribe') return needsTribe(NEEDS[k]);
    if (k === 'get') return post();
    if (k === 'find') { st.tab = 'people'; st.focusFind = true; remember(); const p = load(); draw(); return p; }
  }
  function showMe() {
    if (window.TribeFlintLessons && window.TribeFlintLessons.showMe) return window.TribeFlintLessons.showMe('work');
  }

  // ---------- popover + sheets ----------
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function filtersPop(btn) {
    closePop();
    pop = document.createElement('div'); pop.className = 'tl-pop' + (phone() ? ' sheet' : ''); pop.id = 'tl-fpop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Filters');
    pop.innerHTML = `<label class="tl-lbl">Skills<input class="input" id="tl-f-skills" placeholder="javascript, pixel art" value="${esc(st.f.skills)}"></label>
      <label class="tl-lbl">Seat<select class="input" id="tl-f-seat"><option value="">Any seat</option>${Object.entries(SEATS).map(([k, [l]]) => `<option value="${k}" ${st.f.seat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="tl-lbl">Pay<div class="tl-seg" role="group">${[['', 'Any'], ...Object.entries(PAY)].map(([k, l]) => `<button type="button" class="${st.f.pay === k ? 'on' : ''}" data-fpay="${k}">${l}</button>`).join('')}</div></div>
      <label class="tl-lbl">At most <b id="tl-f-hn">${st.f.hours ? st.f.hours + ' h' : 'any hours'}</b><input type="range" id="tl-f-hours" min="0" max="40" step="1" value="${st.f.hours}"></label>
      <div class="tl-pop-f"><button class="btn ghost sm" data-fclear="1">Clear</button><button class="btn primary sm" data-fdone="1">Done</button></div>`;
    document.body.appendChild(pop);
    if (!phone()) { const r = btn.getBoundingClientRect(); const h = pop.offsetHeight, below = r.bottom + 6 + h <= innerHeight - 12; pop.style.top = `${Math.round(below ? r.bottom + 6 : Math.max(12, Math.min(r.top - 6 - h, innerHeight - 12 - h)))}px`;   /* fits on screen: above the button when there's no room below */ pop.style.left = `${Math.round(Math.max(12, Math.min(innerWidth - 300, r.right - 288)))}px`; }
    const redraw = () => { const b = $('#tl-body'); if (b) { draw(); } };
    pop.addEventListener('input', e => {
      if (e.target.id === 'tl-f-skills') st.f.skills = e.target.value;
      if (e.target.id === 'tl-f-hours') { st.f.hours = +e.target.value; pop.querySelector('#tl-f-hn').textContent = st.f.hours ? st.f.hours + ' h' : 'any hours'; }
      if (e.target.id === 'tl-f-seat') st.f.seat = e.target.value;
      redraw();
    });
    pop.addEventListener('change', e => { if (e.target.id === 'tl-f-seat') { st.f.seat = e.target.value; redraw(); } });
    pop.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.fpay !== undefined) { st.f.pay = t.dataset.fpay; pop.querySelectorAll('[data-fpay]').forEach(b => b.classList.toggle('on', b === t)); redraw(); }
      if (t.dataset.fclear) { st.f = { skills: '', seat: '', pay: '', hours: 0 }; closePop(); draw(); }
      if (t.dataset.fdone) closePop();
    });
  }
  function sheet(title, eyebrow, html, onMount) {
    closeSheet();
    const scrim = document.createElement('div'); scrim.className = 'tl-scrim'; scrim.onclick = closeSheet;
    const el = document.createElement('div'); el.className = 'tl-sheet' + (phone() ? ' phone' : ''); el.id = 'tl-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    el.innerHTML = `<header class="tl-sh-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><button class="fwin-btn" data-x="1" aria-label="Close">${ico('i-x')}</button></header><div class="tl-sh-body">${html}</div>`;
    document.body.append(scrim, el);
    el.querySelector('[data-x]').onclick = closeSheet;
    if (onMount) onMount(el);
    const f = el.querySelector('input:not([type=checkbox]),textarea'); if (f && !phone()) f.focus();
    return el;
  }
  function closeSheet() { const s = $('#tl-sheet'); if (s) s.remove(); document.querySelectorAll('.tl-scrim').forEach(x => x.remove()); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (pop) closePop(); else if ($('#tl-sheet')) closeSheet(); else needClose(); } });

  function segHtml(id, opts, cur) { return `<div class="tl-seg" role="radiogroup" id="${id}">${opts.map(([k, l]) => `<button type="button" role="radio" aria-checked="${cur === k}" class="${cur === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>`; }
  const segVal = (el, id) => { const b = el.querySelector(`#${id} .on`); return b ? b.dataset.v : ''; };
  function wireSegs(el) { el.querySelectorAll('.tl-seg[role=radiogroup]').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; g.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); g.dispatchEvent(new Event('seg')); })); }

  async function post(pre = {}) {
    if (mode() !== 'tribe') return needsTribe(NEEDS.get);
    const kind = pre.kind || 'task';
    const pj = projects();
    const el = sheet('Get help', 'Post a gig', `<form id="tl-pf" class="tl-form">
      <p class="tl-fine wk-pf-tpl">Big ask? <button type="button" class="linkish" id="tl-p-tpl">Start from a template</button> to plan it first.</p>
      <label class="tl-lbl">What do you need?<input class="input" id="tl-p-title" maxlength="100" required placeholder="Someone to run our launch posts" value="${esc(pre.title || '')}"></label>
      <div class="tl-lbl">Kind${segHtml('tl-p-kind', [['task', 'Task'], ['seat', 'Seat'], ['bounty', 'Bounty']], kind)}</div>
      <div class="tl-two"><label class="tl-lbl">Project<select class="input" id="tl-p-proj"><option value="">The whole tribe</option>${pj.map(p => `<option value="${esc(p.id)}" ${(pre.project || '') === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="tl-lbl" id="tl-p-seatl">Seat<select class="input" id="tl-p-seat">${Object.entries(SEATS).map(([k, [l]]) => `<option value="${k}" ${(pre.seatKind || 'growth') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label class="tl-lbl">Details <small class="faint">optional</small><textarea class="input" id="tl-p-desc" rows="3" maxlength="2000" placeholder="What's the goal, what does done look like?">${esc(pre.description || '')}</textarea></label>
      <div class="tl-two"><label class="tl-lbl">Skills <small class="faint">commas</small><input class="input" id="tl-p-skills" maxlength="200" placeholder="writing, social" value="${esc((pre.skills || []).join(', '))}"></label>
      <label class="tl-lbl">Hours <small class="faint">about</small><input class="input" id="tl-p-hours" type="number" min="0" max="168" step="0.5" value="${esc(pre.hours || '')}" placeholder="5"></label></div>
      <div class="tl-lbl">Pay${segHtml('tl-p-pay', Object.entries(PAY), (pre.pay && pre.pay.type) || 'free')}<input class="input" id="tl-p-paytext" maxlength="80" placeholder="e.g. $200, or 1 h for 1 h" value="${esc((pre.pay && pre.pay.text) || '')}"></div>
      <p class="tl-fine">TribeCode handles no payments. "Paid" is a note you write; you settle it yourselves.</p>
      <div class="tl-sh-foot"><button type="button" class="btn ghost" data-x2="1">Cancel</button><button class="btn primary" type="submit" id="tl-p-go">Post</button></div></form>`, el => {
      wireSegs(el);
      const sync = () => { const k = segVal(el, 'tl-p-kind'); el.querySelector('#tl-p-seatl').hidden = k !== 'seat'; const pt = segVal(el, 'tl-p-pay'); el.querySelector('#tl-p-paytext').hidden = pt === 'free'; };
      el.querySelectorAll('.tl-seg').forEach(g => g.addEventListener('seg', sync)); sync();
      el.querySelector('[data-x2]').onclick = closeSheet;
      el.querySelector('#tl-p-tpl').onclick = () => { closeSheet(); if (!open_) show('templates'); else { st.tpl = true; draw(); } };
      el.querySelector('#tl-pf').onsubmit = async e => {
        e.preventDefault();
        const k = segVal(el, 'tl-p-kind'), body = { title: el.querySelector('#tl-p-title').value, kind: k, project: el.querySelector('#tl-p-proj').value || null,
          description: el.querySelector('#tl-p-desc').value, skills: el.querySelector('#tl-p-skills').value.split(','), hours: +el.querySelector('#tl-p-hours').value || 0,
          pay: { type: segVal(el, 'tl-p-pay'), text: el.querySelector('#tl-p-paytext').value }, tasks: pre.tasks || [] };
        if (k === 'seat') { body.seatKind = el.querySelector('#tl-p-seat').value; if (pre.seat && body.project === pre.project) body.seat = pre.seat; }
        try { await C.api('/talent/gigs', { method: 'POST', body }); closeSheet(); toast('Posted on Work'); if (open_) { st.tab = 'gigs'; st.where = 'tribe'; load(); } else show('gigs'); } catch (er) { toast(er.message); }
      };
    });
    return el;
  }
  async function gigSheet(gid) {
    const g = ((st.data && st.data.gigs) || []).find(x => x.id === gid); if (!g) return;
    const apps = g.applicants || [];
    const appRow = a => `<li class="tl-app"><span class="tl-tx-t"><b>${esc(a.name)}${a.member ? '' : ' <small class="faint">(outside the tribe)</small>'}</b><small>${a.note ? esc(a.note) + ' · ' : ''}${a.contact ? esc(a.contact) + ' · ' : ''}${esc(a.status)}</small></span>
      ${g.status === 'open' && (a.status === 'applied' || a.status === 'invited') ? `<button class="btn sm ${a.status === 'invited' ? 'ghost' : 'primary'}" data-hire="${esc(a.id)}">${a.status === 'invited' ? 'New link' : a.member ? 'Hire' : 'Hire + invite'}</button>` : ''}</li>`;
    const loop = window.TribeWorkLoop ? window.TribeWorkLoop.loopHtml(g) : '';
    if (!g.canManage) return sheet(g.title, 'Yours to do', `<div class="tl-meta">${seatChip(g.seatKind)}${payChip(g.pay)}${g.hours ? `<i class="tl-h">${esc(g.hours)} h</i>` : ''}</div>${g.description ? `<p class="tl-read">${esc(g.description)}</p>` : ''}${loop}`, el => window.TribeWorkLoop && window.TribeWorkLoop.wireLoop(el, g, reopen));
    sheet(g.title, g.kind === 'seat' ? `Seat${g.projectName ? ' · ' + g.projectName : ''}` : g.kind, `
      <div class="tl-meta">${seatChip(g.seatKind)}${payChip(g.pay)}${g.hours ? `<i class="tl-h">${esc(g.hours)} h</i>` : ''}${skillChips(g.skills, 8)}</div>
      ${g.description ? `<p class="tl-read">${esc(g.description)}</p>` : ''}
      ${loop}
      <section><span class="eyebrow">Interested (${apps.length})</span>${apps.length ? `<ul class="tl-txs">${apps.map(appRow).join('')}</ul>` : '<p class="tl-none">Nobody yet. Share it in chat, or publicly below.</p>'}</section>
      <div id="tl-invite-out"></div>
      ${g.status === 'open' ? `<details class="tl-more"><summary>Add someone from outside the tribe</summary><form class="tl-form" id="tl-ext"><div class="tl-two"><input class="input" id="tl-ext-n" maxlength="40" placeholder="Their name" required><input class="input" id="tl-ext-c" maxlength="120" placeholder="How to reach them (kept private)"></div><button class="btn tonal sm" type="submit">Add</button></form></details>` : ''}
      <section class="wk-vis" id="tl-vis-box"><span class="eyebrow">Who sees it</span>${segHtml('tl-vis', [['tribe', 'This tribe'], ['public', 'Public']], g.shared ? 'public' : 'tribe')}
        <p class="tl-fine" id="tl-vis-note">${g.shared ? 'Public: in your tribe’s signed gig feed and ready for the community board.' : 'Only people in this tribe see it.'}</p>
        <form class="tl-form" id="tl-share" ${g.shared || g.status !== 'open' ? 'hidden' : ''}><p class="tl-fine">Public gigs go in your tribe’s signed gig feed and, through a pull request, the community board. Nothing personal is added: write the contact you want people to use.</p><input class="input" id="tl-share-c" maxlength="120" placeholder="Public contact: a link, an email, or @you on Discord" required><button class="btn tonal sm" type="submit">Make public</button><div id="tl-share-out"></div></form></section>
      <div class="tl-sh-foot">${g.status === 'open' ? '<button class="btn ghost" data-gclose="1">Close gig</button>' : '<button class="btn ghost" data-gopen="1">Reopen</button>'}<button class="btn ghost" data-gdel="1">Delete</button></div>`, el => {
      if (window.TribeWorkLoop) window.TribeWorkLoop.wireLoop(el, g, reopen);
      wireSegs(el);
      const vis = el.querySelector('#tl-vis');
      if (vis) vis.addEventListener('seg', async () => {
        const v = segVal(el, 'tl-vis'), form = el.querySelector('#tl-share'), note = el.querySelector('#tl-vis-note');
        if (v === 'public' && !g.shared) { if (g.status !== 'open') { toast('Only open gigs can be public'); return; } form.hidden = false; const c = el.querySelector('#tl-share-c'); if (c) c.focus(); return; }
        form.hidden = true;
        if (v === 'tribe' && g.shared) { try { await C.api(`/talent/gigs/${encodeURIComponent(gid)}/unshare`, { method: 'POST', body: {} }); g.shared = null; note.textContent = 'Only people in this tribe see it. It left your gig feed.'; toast('Back to this tribe only'); load(); } catch (er) { toast(er.message); } }
      });
      el.addEventListener('click', async e => {
        const t = e.target.closest('button'); if (!t) return;
        try {
          if (t.dataset.hire) {
            const r = await C.api(`/talent/gigs/${encodeURIComponent(gid)}/hire`, { method: 'POST', body: { applicant: t.dataset.hire } });
            if (r.invite) { el.querySelector('#tl-invite-out').innerHTML = `<section class="card tl-inv"><span class="eyebrow">Invite link · one use, 14 days</span><p>Send this to them. When they join, they get ${g.kind === 'seat' ? 'the seat' : 'the gig'} automatically.</p><div class="tl-copy"><input class="input" readonly id="tl-inv-link" value="${esc(r.invite.link)}"><button class="btn sm primary" data-copy="1">Copy</button></div></section>`; }
            else { toast(r.seat ? `Hired into the ${r.seat.title} seat` : 'Hired'); closeSheet(); }
            load(); return;
          }
          if (t.dataset.copy) { const i = el.querySelector('#tl-inv-link'); i.select(); try { await navigator.clipboard.writeText(i.value); } catch {} toast('Link copied'); return; }
          if (t.dataset.gclose || t.dataset.gopen) { await C.api(`/talent/gigs/${encodeURIComponent(gid)}`, { method: 'PATCH', body: { status: t.dataset.gclose ? 'closed' : 'open' } }); closeSheet(); load(); return; }
          if (t.dataset.gdel) { if (!confirm('Delete this gig?')) return; await C.api(`/talent/gigs/${encodeURIComponent(gid)}`, { method: 'DELETE' }); closeSheet(); load(); }
        } catch (er) { toast(er.message); }
      });
      const ext = el.querySelector('#tl-ext'); if (ext) ext.onsubmit = async e => { e.preventDefault(); try { await C.api(`/talent/gigs/${encodeURIComponent(gid)}/apply`, { method: 'POST', body: { name: el.querySelector('#tl-ext-n').value, contact: el.querySelector('#tl-ext-c').value } }); await load(); gigSheet(gid); } catch (er) { toast(er.message); } };
      const sh = el.querySelector('#tl-share'); if (sh) sh.onsubmit = async e => {
        e.preventDefault();
        try { const r = await C.api(`/talent/gigs/${encodeURIComponent(gid)}/share`, { method: 'POST', body: { contact: el.querySelector('#tl-share-c').value } });
          g.shared = { id: r.bundle && r.bundle.id }; const nt = el.querySelector('#tl-vis-note'); if (nt) nt.textContent = 'Public: in your tribe’s signed gig feed and ready for the community board.'; load();
          el.querySelector('#tl-share-out').innerHTML = `<p class="tl-fine">In your feed. To list it on ${esc(r.repo)} too:</p><a class="btn sm primary" href="${esc(safeHref(r.links.file))}" target="_blank" rel="noopener noreferrer" id="tl-share-link">Open the pull request page on GitHub</a>`;
        } catch (er) { toast(er.message); }
      };
    });
  }
  async function reopen(gid) { await load(); if (((st.data && st.data.gigs) || []).some(x => x.id === gid)) gigSheet(gid); else closeSheet(); }
  async function openGig(gid) { if (!open_) show('gigs'); if (!st.data) await load(); const g = ((st.data && st.data.gigs) || []).find(x => x.id === gid); if (!g) return toast('That gig is gone'); return g.canManage || g.mine ? gigSheet(gid) : applySheet(gid); }
  async function applySheet(gid) {
    const g = ((st.data && st.data.gigs) || []).find(x => x.id === gid); if (!g) return;
    sheet(g.title, 'I\'m interested', `<form class="tl-form" id="tl-af">${g.description ? `<p class="tl-read">${esc(g.description)}</p>` : ''}<label class="tl-lbl">A note for ${esc(g.byName)} <small class="faint">optional</small><textarea class="input" id="tl-a-note" rows="3" maxlength="600" placeholder="What you'd bring, when you're free"></textarea></label><div class="tl-sh-foot"><button type="button" class="btn ghost" data-x2="1">Cancel</button><button class="btn primary" type="submit" id="tl-a-go">Send</button></div></form>`, el => {
      el.querySelector('[data-x2]').onclick = closeSheet;
      el.querySelector('#tl-af').onsubmit = async e => { e.preventDefault(); try { await C.api(`/talent/gigs/${encodeURIComponent(gid)}/apply`, { method: 'POST', body: { note: el.querySelector('#tl-a-note').value } }); closeSheet(); toast(`Sent to ${g.byName}`); load(); } catch (er) { toast(er.message); } };
    });
  }
  async function editProfile() {
    if (!C.connected()) return toast('Connect to your tribe first.');
    let p; try { p = (await C.api('/talent/profile')).profile; } catch (e) { return toast(e.message); }
    const pj = projects(), links = [0, 1, 2].map(i => (p.links || [])[i] || { url: '' });
    sheet('Work profile', 'You', `<form class="tl-form" id="tl-wf">
      <label class="tl-check"><input type="checkbox" id="tl-w-open" ${p.open ? 'checked' : ''}> <span><b>Open to work</b><small>People in this tribe can find you in Work › People.</small></span></label>
      <label class="tl-lbl">Skills <small class="faint">commas, up to 12</small><input class="input" id="tl-w-skills" maxlength="300" value="${esc((p.skills || []).join(', '))}" placeholder="javascript, pixel art, copywriting"></label>
      <div class="tl-lbl">Seats you can fill<div class="tl-chips" id="tl-w-roles">${Object.entries(SEATS).filter(([k]) => k !== 'custom').map(([k, [l, c]]) => `<button type="button" class="tl-chip ${(p.roles || []).includes(k) ? 'on' : ''}" data-role="${k}" style="--seat:${c}" aria-pressed="${(p.roles || []).includes(k)}">${l}</button>`).join('')}</div></div>
      <div class="tl-two"><label class="tl-lbl">Hours a week<input class="input" id="tl-w-hours" type="number" min="0" max="80" step="1" value="${esc(p.hours || '')}" placeholder="10"></label>
      <label class="tl-lbl">Time zone<input class="input" id="tl-w-tz" maxlength="64" value="${esc(p.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || '')}"></label></div>
      <div class="tl-lbl">How you like to work${segHtml('tl-w-rate', Object.entries(PAY), (p.rate && p.rate.type) || 'free')}<input class="input" id="tl-w-ratetext" maxlength="80" placeholder="e.g. $40/h, or hour for hour" value="${esc((p.rate && p.rate.text) || '')}"></div>
      ${pj.length ? `<div class="tl-lbl">Portfolio: projects here<div class="tl-chips" id="tl-w-proj">${pj.map(x => `<button type="button" class="tl-chip ${(p.projects || []).some(y => (y.id || y) === x.id) ? 'on' : ''}" data-proj="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div></div>` : ''}
      <div class="tl-lbl">Links <small class="faint">up to 3</small>${links.map((l, i) => `<input class="input" data-wl="${i}" inputmode="url" maxlength="300" placeholder="https://" value="${esc(l.url || '')}">`).join('')}</div>
      <div class="tl-sh-foot"><button type="button" class="btn ghost" data-x2="1">Cancel</button><button class="btn primary" type="submit" id="tl-w-save">Save</button></div></form>`, el => {
      wireSegs(el);
      el.querySelector('[data-x2]').onclick = closeSheet;
      el.addEventListener('click', e => { const b = e.target.closest('.tl-chip'); if (b) { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); } });
      el.querySelector('#tl-wf').onsubmit = async e => {
        e.preventDefault();
        const body = { open: el.querySelector('#tl-w-open').checked, skills: el.querySelector('#tl-w-skills').value.split(','), roles: [...el.querySelectorAll('#tl-w-roles .on')].map(b => b.dataset.role),
          hours: +el.querySelector('#tl-w-hours').value || 0, tz: el.querySelector('#tl-w-tz').value.trim() || null, rate: { type: segVal(el, 'tl-w-rate'), text: el.querySelector('#tl-w-ratetext').value },
          projects: [...el.querySelectorAll('#tl-w-proj .on')].map(b => b.dataset.proj), links: [...el.querySelectorAll('[data-wl]')].map(i => i.value.trim()).filter(Boolean).map(url => ({ url })) };
        try { await C.api('/talent/profile', { method: 'PUT', body }); closeSheet(); toast('Work profile saved'); if (open_) load(); } catch (er) { toast(er.message); }
      };
    });
  }
  function offerSheet(o) {
    o = o || { what: 'claude-code', hoursPerWeek: 2, rules: '', on: true };
    sheet(o.id ? 'Edit your offer' : 'Offer your AI or computer', 'Compute', `<form class="tl-form" id="tl-of">
      <p class="tl-fine">Your subscription stays yours. People ask; you say yes or no each time in your inbox. Nothing runs through your login on its own.</p>
      <div class="tl-lbl">What${segHtml('tl-o-what', Object.entries(WHAT), o.what)}</div>
      <label class="tl-lbl">Up to how many hours a week?<input class="input" id="tl-o-h" type="number" min="1" max="80" step="1" value="${esc(o.hoursPerWeek)}"></label>
      <label class="tl-lbl">Your rules <small class="faint">optional</small><textarea class="input" id="tl-o-rules" rows="2" maxlength="400" placeholder="Evenings only. Small tasks, no long refactors.">${esc(o.rules || '')}</textarea></label>
      <label class="tl-check"><input type="checkbox" id="tl-o-on" ${o.on !== false ? 'checked' : ''}> <span><b>Show it to the tribe</b></span></label>
      <div class="tl-sh-foot"><button type="button" class="btn ghost" data-x2="1">Cancel</button><button class="btn primary" type="submit" id="tl-o-save">Save</button></div></form>`, el => {
      wireSegs(el); el.querySelector('[data-x2]').onclick = closeSheet;
      el.querySelector('#tl-of').onsubmit = async e => { e.preventDefault(); try { await C.api('/talent/compute/offers', { method: 'PUT', body: { id: o.id, what: segVal(el, 'tl-o-what'), hoursPerWeek: +el.querySelector('#tl-o-h').value, rules: el.querySelector('#tl-o-rules').value, on: el.querySelector('#tl-o-on').checked } }); closeSheet(); load(); } catch (er) { toast(er.message); } };
    });
  }
  function askSheet(o) {
    sheet(`Ask ${o.name}`, `${WHAT[o.what] || 'Compute'} time`, `<form class="tl-form" id="tl-qf">
      ${o.rules ? `<p class="tl-read">“${esc(o.rules)}”</p>` : ''}
      <label class="tl-lbl">How many hours?<input class="input" id="tl-q-h" type="number" min="0.5" max="40" step="0.5" value="1"></label>
      <label class="tl-lbl">What for?<textarea class="input" id="tl-q-note" rows="3" maxlength="600" placeholder="Help me write tests for the save system"></textarea></label>
      <p class="tl-fine">${esc(o.name)} gets a message and a request in their inbox. It's their call.</p>
      <div class="tl-sh-foot"><button type="button" class="btn ghost" data-x2="1">Cancel</button><button class="btn primary" type="submit" id="tl-q-go">Ask</button></div></form>`, el => {
      el.querySelector('[data-x2]').onclick = closeSheet;
      el.querySelector('#tl-qf').onsubmit = async e => { e.preventDefault(); try { await C.api('/talent/compute/request', { method: 'POST', body: { offer: o.id, hours: +el.querySelector('#tl-q-h').value, note: el.querySelector('#tl-q-note').value } }); closeSheet(); toast(`Asked ${o.name}`); load(); } catch (er) { toast(er.message); } };
    });
  }

  // ---------- clicks in the view ----------
  document.addEventListener('click', async e => {
    const sec = document.getElementById('view-' + NAME);
    if (pop && !pop.contains(e.target) && !e.target.closest('#tl-filters')) closePop();
    const nb = e.target.closest && e.target.closest('#wk-need button');
    if (nb) { if (nb.dataset.needX) return needClose(); if (nb.dataset.wk === 'tribe') return newTribe(); if (nb.dataset.retry) { needClose(); return load(); } }
    if (!sec || !sec.contains(e.target)) return;
    const t = e.target.closest('button, [data-gig]'); if (!t) return;
    const d = t.dataset;
    try {
      if (d.tab) { if (d.tab === st.tab) return; st.tab = d.tab; remember(); closePop(); (window.TribeMotion ? window.TribeMotion.swap : f => f())(draw); return load(); }
      if (d.wk === 'tribe') return newTribe();
      if (d.wk === 'join') return window.TribeSettings && window.TribeSettings.joinPrompt && window.TribeSettings.joinPrompt();
      if (d.wk === 'tpl') { st.tpl = true; draw(); const x = $('#wk-tpl'); if (x) try { x.scrollIntoView({ block: 'start' }); } catch {} return; }
      if (d.wk) return tile(d.wk);
      if (t.id === 'wk-show') return showMe();
      if (d.tplX) { st.tpl = false; return draw(); }
      if (d.retry) { st.err = ''; st.local = false; draw(); return load(); }
      if (d.where) { st.where = d.where; draw(); return load(); }
      if (d.trade) { st.trade = d.trade; remember(); draw(); return load(); }
      if (d.sort) { st.sort = d.sort; remember(); return draw(); }
      if (t.id === 'tl-filters') return pop ? closePop() : filtersPop(t);
      if (d.post) return post();
      if (d.editProf) return editProfile();
      if (d.abEdit) return window.TribeAbilities.edit();
      if (d.apply) return applySheet(d.apply);
      if (d.open) return gigSheet(d.open);
      if (d.dm) return window.TribeDM && window.TribeDM.open(d.dm);
      if (d.txOk || d.txNo) { await C.api(`/talent/timebank/${encodeURIComponent(d.txOk || d.txNo)}/${d.txOk ? 'confirm' : 'decline'}`, { method: 'POST', body: {} }); toast(d.txOk ? 'Confirmed' : 'Marked as not right'); return load(); }
      if (d.offNew) return offerSheet();
      if (d.offEdit) return offerSheet((st.compute.offers || []).find(o => o.id === d.offEdit));
      if (d.offDel) { await C.api(`/talent/compute/offers/${encodeURIComponent(d.offDel)}`, { method: 'DELETE' }); return load(); }
      if (d.offAsk) return askSheet((st.compute.offers || []).find(o => o.id === d.offAsk));
      if (d.used) { await C.api(`/talent/compute/requests/${encodeURIComponent(d.used)}/used`, { method: 'POST', body: { hours: 1 } }); return load(); }
      if (d.inbox) return window.TribeShell && window.TribeShell.go('updates');
      if (d.pubRefresh) { st.pub = null; draw(); st.pub = await C.api('/talent/public?refresh=1').catch(() => ({ available: false, gigs: [] })); return draw(); }
      if (d.gig) { const g = ((st.data && st.data.gigs) || []).find(x => x.id === d.gig); if (g && (g.canManage || g.mine)) return gigSheet(g.id); if (g && !g.applied && g.status === 'open' && human()) return applySheet(g.id); }
    } catch (er) { toast(er.message); }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'tl-log') return;
    e.preventDefault();
    const dir = $('#tl-log-dir').value, who = $('#tl-log-who').value; if (!who) return toast('Pick a person');
    try { await C.api('/talent/timebank', { method: 'POST', body: { from: dir === 'gave' ? me().id : who, to: dir === 'gave' ? who : me().id, hours: +$('#tl-log-h').value, note: $('#tl-log-note').value } }); toast('Logged. They confirm it next.'); load(); } catch (er) { toast(er.message); }
  });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#view-work [data-gig]')) { e.preventDefault(); e.target.click(); } });
  if (C && C.on) C.on('ws', m => { if (open_ && m && (m.type === 'talent' || m.type === 'approval')) load(); if (open_ && m && m.type === 'task') { clearTimeout(loadTasks.t); loadTasks.t = setTimeout(() => loadTasks(true), 400); } });
  if (C && C.on) C.on('hello', () => { if (!inTab()) st.local = false; tasks.at = 0; if (open_) { draw(); load(); } });   // the tribe came back (or was just made): Work fills in

  // ---------- Company seats (Agent A's #co-hire-slot): an empty seat -> "Hire someone for this seat" ----------
  async function hireSlot(el, pid, seatId) {
    let seat = null;
    try { const co = await C.api(`/projects/${encodeURIComponent(pid)}/company`); const c = co.company || co; seat = (c.seats || []).find(s => s.id === seatId) || null; } catch {}
    const kind = (seat && seat.kind) || (SEATS[seatId] ? seatId : 'custom'), title = (seat && seat.title) || (SEATS[kind] || ['Seat'])[0];
    const pname = (projects().find(p => p.id === pid) || {}).name || '';
    const pre = { kind: 'seat', project: pid, seat: seatId, seatKind: kind, title: `${title} for ${pname}`.trim(), description: seat && seat.charter && seat.charter.goal ? `This month: ${seat.charter.goal}` : '' };
    if (!el) return post(pre);
    el.innerHTML = `<button class="btn tonal sm tl-hire" type="button">${ico('i-users', 14)} Hire someone for this seat</button>`;
    el.querySelector('button').onclick = () => post(pre);
    return el;
  }

  // Find people (Flint's "find someone who can draw"): the People tab with the skill filled in
  function find(q) { st.f.skills = String(q || ''); show('people'); if (mode() !== 'tribe') needsTribe(NEEDS.find); }
  window.TribeTalent = { open: tab => show(tab), post, editProfile, hireSlot, openGig, find, reload: () => { tasks.at = 0; return load(); } };
})();
