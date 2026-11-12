// Home (#/hub): your command center, shown with no tribe/project selected and on every launch.
//   Header "Your command center" · the hero: Suggestions (rolling, dismissible, Resume) | Ask (to your own Claude
//   Code's private chat when connected, else the local model via POST /api/hub/ask; the answer shows inline with
//   "Open in chat") | Join with a link / New project · Get started (five steps with progress, "Refine with AI" asks
//   the local model for a first project from your notes, "Get started with your agent"; dismissible, remembered) ·
//   Scratchpad (Refine with AI: POST /api/scratch/refine, then Replace / Keep) | Recent activity (the global stream,
//   condensed) · Agents & models. Reference: design/inspiration/home-ref.png, translated to the flat palette.
//   Sub-pages from the sidebar's Global group: All repos (#/hub/repos), Global docs (#/hub/docs).
// Also owns the right panel's Home mode (you, Connect your AI, Share my hub link, Invite friends, AI Insights
// from GET /api/insights with a fallback to suggestions + the Secretary's inspirations), the helpers (Secretary, local
// model, autopilot listed as present entities) and the private global scratchpad (server/scratch.js; localStorage
// until you are in a tribe).
// Public: window.TribeHub = { open(mode), mode(), last(), remember(), scratch, refresh, data, openNote(id), jump(item) }.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const App = () => window.TribeApp, PJ = () => window.TribeProjects, SH = () => window.TribeShell;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, sz = 16) => `<svg class="i" style="width:${sz}px;height:${sz}px"><use href="#${id}"/></svg>`;
  const toast = m => App() && App().toast(m);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`; return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const me = () => C.state().me || {};
  const connected = () => C.connected();
  const projects = () => { const l = PJ() ? PJ().list() || [] : []; return l.length ? l : ((data && data.projects) || []); };   // the hub's own list until projects.js has loaded
  const projOf = id => projects().find(p => p.id === id) || ((data && data.projects) || []).find(p => p.id === id) || null;

  let data = null, mode = 'home', loading = null, docsQ = '', reposCache = null;
  const section = () => $('#view-hub');

  // ---------- resume last session (client side, per server) ----------
  const LKEY = () => `tribecode.lastSession:${C.base()}`;
  const last = () => lsGet(LKEY());
  const LABEL = { home: 'Dashboard', chat: 'Messages', docs: 'Files', tasks: 'Task Board', board: 'Board', bugs: 'Bugs', repo: 'Code repository', calendar: 'Calendar', visuals: 'Visuals', coord: 'Coordinate', requests: 'Requests' };
  function remember(view) {
    if (!connected() || !LABEL[view]) return;
    const p = PJ() && PJ().cur(); if (!p) return;
    lsSet(LKEY(), { project: p.id, name: p.name, view, label: LABEL[view], at: new Date().toISOString() });
  }
  async function resume() {
    const l = last();
    if (!l) { const p1 = pj1(); if (p1) return PJ().current() !== p1.id ? PJ().switchTo(p1.id, 'home') : App().show('home'); return toast('Nothing to resume yet. Open a project and it shows up here.'); }
    if (!projOf(l.project)) return toast(`${l.name || 'That project'} is not in this tribe any more.`);
    if (PJ().current() !== l.project) await PJ().switchTo(l.project, l.view); else App().show(l.view);
  }

  // ---------- view mounting ----------
  function open(m = 'home') {
    mode = ['home', 'repos', 'docs', 'design'].includes(m) ? m : 'home';
    App().show('hub');
  }
  function onShow() {   // app.js show('hub') calls this
    const want = mode === 'home' ? '#/hub' : `#/hub/${mode}`;
    if (location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
    const cl = $('#crumb-label'); if (cl) cl.textContent = mode === 'repos' ? 'Code' : mode === 'docs' ? 'Files' : mode === 'design' ? 'Design' : 'Your dashboard';
    document.body.classList.toggle('at-home', true);
    render(); load(); panel();
  }
  function onHide() { document.body.classList.remove('at-home'); setTimeout(panel, 0); if (/^#\/hub/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }
  const fromHash = () => { const m = /^#\/hub(?:\/(repos|docs|design))?$/.exec(location.hash); if (m && (document.body.dataset.view !== 'hub' || mode !== (m[1] || 'home'))) open(m[1] || 'home'); };
  addEventListener('hashchange', fromHash);

  // ---------- data ----------
  async function load(quiet) {
    if (!connected()) { data = null; render(); return; }
    if (loading) return loading;
    loading = (async () => {
      try { data = await C.api('/hub'); } catch (e) { if (!quiet) data = data || { error: e.message }; }
      loading = null;
      if (document.body.dataset.view === 'hub') render();
      panel();
    })();
    return loading;
  }
  addEventListener('tribe-host-error', () => { if (document.body.dataset.view === 'hub') render(); });
  addEventListener('tribe-local-profile', () => { if (document.body.dataset.view === 'hub' && !connected()) render(); });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#hub-host-retry') && App().hostHere) { e.target.disabled = true; e.target.textContent = 'Starting…'; App().hostHere(); } });
  C.on('ws', m => { if (m && (m.type === 'hub' || m.type === 'dashboard') && (!data || m.rev !== data.rev)) load(true); });
  C.on('hello', () => { load(true); scratch.sync(); setTimeout(fromHash, 30); });
  setTimeout(() => { if (connected() && !data) load(true); }, 0);   // the hello can come before this script runs (a fast reload): the helpers still need the data
  C.on('status', () => { if (document.body.dataset.view === 'hub') render(); panel(); });
  C.on('projects', () => { if (document.body.dataset.view === 'hub') setTimeout(render, 300); });
  setInterval(() => { if (!document.hidden && connected()) load(true); }, 90_000);

  // ---------- render ----------
  // Home is the command center (reference: design/inspiration/home-ref.png, translated to the flat palette):
  //   header · the hero (Suggestions | Ask | Join or start) · Get started (dismissible) · Scratchpad | Recent activity ·
  //   Agents & models. The right panel on Home: you, Connect your AI, Share my hub link, Invite friends,
  //   AI Insights (GET /api/insights, else the hub's suggestions + the Secretary's inspirations). Phones: one column.
  const sec = (eyebrow, title, inner, extra = '', aside = '') => `<section class="sec hub-sec" ${extra}><div class="sec-head ${aside ? 'hs-row' : ''}"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${title}</h2></div>${aside}</div>${inner}</section>`;
  const SEND = '<svg class="i" viewBox="0 0 24 24" style="width:17px;height:17px"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  const aiTag = (label = 'AI') => `<span class="ai-tag">${ico('i-sparkle', 11)}${esc(label)}</span>`;
  const myAgent = () => { const id = me().id; return id ? (C.state().members || []).find(m => m.role === 'agent' && m.owner === id) || null : null; };
  const memberOf = id => (C.state().members || []).find(m => m.id === id) || null;
  // feat/files-dash: where you are, said once at the top of every Home page: Home › Files
  const hubCrumb = here => `<nav class="hub-crumb" aria-label="Breadcrumb"><button type="button" class="hc-home" data-hc-home>${ico('i-home', 13)}Home</button><span class="hc-sep" aria-hidden="true">›</span><span class="hc-here" aria-current="page">${esc(here)}</span></nav>`;
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-hc-home]')) open('home'); });
  function greeting() {
    const h = new Date().getHours(), part = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const name = (me().name || (window.TribeStore && window.TribeStore.get().name) || '').split(' ')[0];
    return `${part}${name && name !== 'Me' ? `, ${esc(name)}` : ''}`;
  }
  // Re-rendering keeps whatever you were typing in (the Ask box, the scratchpad) focused.
  function keepFocus(fn) {
    const a = document.activeElement, id = a && a.id && section() && section().contains(a) ? a.id : null;
    const sel = id && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
    fn();
    if (!id) return; const b = document.getElementById(id); if (!b) return;
    b.focus({ preventScroll: true }); if (sel) try { b.setSelectionRange(sel[0], sel[1]); } catch {}
  }
  function render() {
    const el = section(); if (!el) return;
    if (mode === 'repos') return renderRepos(el);
    if (mode === 'docs') return renderDocs(el);
    if (mode === 'design') return renderDesign(el);
    const on = connected(), tribe = (C.state().tribe || {}).name;
    const pj = projects(), live = (data && data.status) || {};
    const sub = on ? [greeting(), `${pj.length} project${pj.length === 1 ? '' : 's'}`, live.activeToday ? `${live.activeToday} active today` : ''].filter(Boolean).join(' · ')
      : C.hasToken() ? `${greeting()}. ${offlineWord()}` : `${greeting()}. Not in a tribe yet: everything here works on this device.`;
    keepFocus(() => {
      el.innerHTML = `<div class="hub hub-home">${isPhone() ? `<div class="hub-ptop" id="hub-ptop"><button class="hpt-btn hpt-me" id="hpt-me" aria-label="Your profile">${meFace()}</button>
          <button class="hpt-brand" id="hpt-brand" aria-label="Your projects"><img class="hpt-mark tc-mark" src="assets/icon.svg" alt="" width="26" height="26"><img class="brand-wm" src="assets/wordmark.svg" alt="TribeCode">${ico('i-chev', 16)}</button>
          <button class="hpt-btn" id="hpt-bell" aria-label="Notifications">${ico('i-bell', 26)}<span class="hpt-dot hidden" id="hpt-dot"></span></button></div>` : ''}
        ${idCard(on, tribe, pj, live, sub)}
        ${gsHero(on)}
        <div id="hub-flint-slot"></div>
        ${isPhone() && on && pj.length ? phoneProjects(pj) : ''}
        <div class="hub-two hub-bottom">${notesSec(on)}${activitySec(on)}</div>
        ${isPhone() ? sec('AI insights', 'Worth a look', `<div class="ai-cards" id="hub-ins-phone">${insightCards()}</div>`, 'id="hub-insights"') : ''}
      </div>`;
      bind(el);
      if (window.TribeFlint && window.TribeFlint.mountDashboard) window.TribeFlint.mountDashboard(el.querySelector('#hub-flint-slot'));   // feat/flint-ai: Flint on the Dashboard
    });
  }

  // Phones have no rail: your projects are rows on Home; tapping one opens it (and its bottom rack).
  function phoneProjects(pj) {
    const pulses = (PJ().pulses && PJ().pulses()) || {};
    return sec('Your projects', 'Jump in', `<div class="hub-pjs" id="hub-pjs">${pj.map(p => `<button class="hub-pj" data-pj-go="${esc(p.id)}">${PJ().face(p, 'sm')}<span><b>${esc(p.name)}</b><small>${esc(p.bio || (p.counts && p.counts.tasks ? `${p.counts.tasks} open tasks` : 'Open the project'))}</small></span>${pulses[p.id] ? '<i class="hub-pj-dot" aria-label="unread"></i>' : ''}${ico('i-chev', 15)}</button>`).join('')}</div>`, 'id="hub-pjs-sec"');
  }

  // ---------- the one hero: two big choices (Getting started, or Quick start once you're in) ----------
  // Suggestions, Ask and the agents fleet moved out of the way: AI Insights (right panel), @ai in chat, Agent fleet row.
  // The top of Home: who you are and where your tribe stands, with the campfire as the identity (flat matte card).
  // Your avatar (your color + initial), for Home's top bar and the docs search pill on phones
  function meFace() {
    const st = (window.TribeStore && TribeStore.get()) || {}, m = (C.state() || {}).me || {};
    const n = (m.name || st.name || '?').trim(), color = m.color || st.color || '#F26B1D';
    return `<span class="me-face" style="background:${esc(color)}">${esc(([...n][0] || '').toUpperCase())}</span>`;
  }
  function idCard(on, tribe, pj, live, sub) {
    const st = (window.TribeStore && TribeStore.get()) || {}, me = (C.state() || {}).me || {};
    const name = (me.name || st.name || 'You').split(' ')[0], color = me.color || st.color || '#F26B1D';
    const people = ((C.state() || {}).members || []).filter(m => m.role !== 'agent' && m.online && m.id !== me.id).length;
    const agents = ((C.state() || {}).members || []).filter(m => m.role === 'agent' && m.online).length;
    const chip = (k, n, l) => `<span class="hid-chip k-${k}"><b>${n}</b>${l}</span>`;
    const chips = on ? chip('ember', pj.length, pj.length === 1 ? 'project' : 'projects') + chip('indigo', people, people === 1 ? 'friend online' : 'friends online') + chip('teal', agents, agents === 1 ? 'agent working' : 'agents working')
      : C.hasToken() ? `<span class="hid-chip k-muted">${offlineChip()}</span>` : '';   // no tribe yet: said once, in the user bar
    return `<header class="hub-head hub-id">
      <div class="hid-art" aria-hidden="true"><img src="assets/illustrations/campfire.svg" alt=""></div>
      <div class="hid-t">${hubCrumb(on && tribe ? `Your dashboard · ${tribe}` : 'Your dashboard')}
        <h1>${localFace(on) || `<span class="hid-av" style="background:${esc(color)}">${esc(([...name][0] || '').toUpperCase())}</span>`}<span>${greeting()}</span></h1>
        ${chips ? `<div class="hid-chips">${chips}</div>` : ''}</div>
    </header>`;
  }
  // before any tribe: your Make-it-yours icon (personalize.js), the same as the user bar and the profile button
  function localFace(on) {
    const Pz = window.TribePersonalize, P = window.TribeProfiles;
    if (on || C.hasToken() || !Pz || !Pz.localMember || !P) return '';
    const lm = Pz.localMember(); if (!lm.profile.avatar || lm.profile.avatar.kind === 'initials') return '';
    return P.avatar(lm, 'hid-av');
  }
  function gsHero(on) {
    const desk = canHost();
    const l = on ? last() : null, lp = l && projOf(l.project), p1 = on && pj1();
    const tile = (id, title, sub, faceHtml = '', ic = '', go = '', k = '') => `<button class="gs-tile${k ? ' k-' + k : ''}" id="${id}">${ic ? `<span class="gs-ic"><svg class="i"><use href="#i-${ic}"/></svg></span>` : faceHtml}<b>${title}</b><span>${sub}</span>${go ? `<em class="gs-go">${go}<svg class="i"><use href="#i-chev"/></svg></em>` : ''}</button>`;
    // Only after setup (a tribe was made on this computer): one actionable line, the host log under Details, Try again and
    // Keep working offline. Before setup nothing here ever says a server failed (feat/setup-local).
    const err = !on && desk && hostFailed() ? `<div class="gs-err" id="hub-host-err" role="status"><b>Your tribe is offline on this computer.</b> <span>Changes wait here and send when it's back.</span>
        <details><summary>Details</summary><pre>${esc(window.__hostError)}</pre></details><div class="gs-err-acts"><button class="btn primary sm" id="hub-host-retry">Try again</button><button class="btn sm" id="hub-host-offline">Keep working offline</button></div></div>` : '';
    // Not in a tribe yet: one honest empty state with one clear way in, and the way to join a friend beside it.
    // Nothing is made until you press Start (no demo, no pretend tribe: the demo lives in the ? menu and Ctrl K).
    if (!on) {
      const tourBtn = window.TribeFlintTour ? `<button class="linkish" id="hub-tour">${ico('i-flint', 13)}${esc(window.TribeFlintTour.label())}</button>` : '';
      return `<section class="hero-card hub-hero hub-gs hub-empty" id="hub-hero">
        <div class="he-copy"><span class="eyebrow">Getting started</span>
          <h2>Make your first project</h2>
          <p class="he-sub">${window.TribeLocalSetup ? 'A project is a room for you, your friends and your AI helpers: chat, files, tasks, a design canvas. It starts right here on this device, no server needed. Choose where it lives later: a GitHub repo, this computer, a free cloud or a phone.' : desk ? 'A project is a room for you, your friends and your AI helpers: a chat, files, a task board, a design canvas and a live preview of what you build.' : 'Projects run on a computer with the TribeCode desktop app, or on a free cloud server. Here you can join a friend\'s tribe with their link.'}</p>
          <div class="he-acts"><button class="btn primary he-go" id="hub-host">${ico('i-plus', 15)}${desk || window.TribeLocalSetup ? 'Start your first project' : 'Get the desktop app'}</button><button class="btn he-join" id="hub-join">${ico('i-link', 15)}Join with a link</button></div>
          <div class="gs-links">${tourBtn}<a class="linkish" id="hub-about" href="https://tribecode.org/docs.html" target="_blank" rel="noopener">${ico('i-doc', 13)}How TribeCode works</a></div>
        </div>
        <ol class="he-steps" aria-label="What happens next">
          <li><b>1</b><span><strong>Say what you want to make</strong><small>Flint builds a first version you can run, no AI needed.</small></span></li>
          <li><b>2</b><span><strong>Invite friends</strong><small>One link. They join from a phone or a laptop.</small></span></li>
          <li><b>3</b><span><strong>Connect your AI</strong><small>Claude Code, Codex, Gemini or a local model builds with you.</small></span></li>
        </ol>
        ${err}</section>`;
    }
    const tiles = (lp || p1
          ? tile('hub-resume', lp ? 'Pick up where you left off' : `Open ${esc(p1.name)}`, lp ? `${esc(lp.name)} · ${esc(l.label)} · ${esc(ago(l.at))}` : 'Its chat, files and tasks, all in one place.', `<span class="gs-ic gs-face">${PJ().face(lp || p1, 'sm')}</span>`, '', lp ? 'Resume' : 'Open', 'ember')
          : tile('hub-new', 'Create a project', 'A room, a link and a code repository, in one click.', '', 'plus', 'Start a project', 'ember'))
        + tile('hub-instant', 'Invite a friend', 'Starts a new project for the two of you and copies a link they can open anywhere.', '', 'link', 'Copy a link', 'teal');
    const links = `<div class="gs-links">${lp || p1 ? `<button class="linkish" id="hub-new">${ico('i-plus', 13)}New project</button><span aria-hidden="true">·</span>` : ''}<button class="linkish" id="hub-join">${ico('i-users', 13)}Paste invite link</button></div>`;
    return `<section class="hero-card hub-hero hub-gs" id="hub-hero"><div class="gs-band"><span class="eyebrow">Quick start</span><span class="gs-band-r">Pick up, or bring someone in</span></div>
      ${err}<div class="gs-grid">${tiles}</div>${links}</section>`;
  }
  // A server that genuinely failed after setup (a tribe exists here), and the person hasn't chosen to keep working offline.
  function hostFailed() {
    const st = (window.TribeStore && TribeStore.get()) || {};
    return !!(window.__hostError && st.hosting && (st.tribeHere || (st.server && st.server.token)) && !window.__hostOfflineOk);
  }
  const offlineWord = () => (window.__hostError ? 'Working offline: changes wait here and send when your tribe is back.' : (window.TribeStore && TribeStore.get().hostOff) ? 'Hosting is off on this computer.' : 'Reconnecting to your tribe…');
  const offlineChip = () => (window.__hostError ? 'Working offline' : (window.TribeStore && TribeStore.get().hostOff) ? 'Hosting is off' : 'Reconnecting…');
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#hub-host-offline')) { window.__hostOfflineOk = true; render(); toast('Working offline. Your changes wait on this device.'); } });
  // Can this device make a tribe right now? The desktop app, or the computer running a TribeCode server (fresh open).
  const canHost = () => !!(window.TribeHost && window.TribeHost.isDesktop) || !!(App() && App().fresh && App().fresh());

  // ---------- the hero: Suggestions | Ask | Join or start ----------
  function hero(on) {
    return `<section class="hero-card hub-hero" id="hub-hero">
      <div class="hh-top"><span class="eyebrow">Direct access</span><h2>Ask, pick up where you left off, or bring a friend</h2></div>
      <div class="hh-grid">${sugPanel(on)}${askPanel(on)}${joinPanel(on)}</div></section>`;
  }
  const pj1 = () => projects()[0] || null;
  let sugOpen = false;
  function sugItems() {
    const need = [...((data && data.hero) || []), ...((data && data.more) || [])].slice(0, 4).map(x => ({ ...x, need: true }));
    return [...need, ...((data && data.suggestions) || [])];
  }
  function sugPanel(on) {
    const l = on ? last() : null, lp = l && projOf(l.project), p1 = on && pj1();
    const resume = lp ? `<button class="hs-li hs-resume" id="hub-resume"><span class="hs-face">${PJ().face(lp, 'sm')}</span><span class="hs-tx"><b>Resume ${esc(lp.name)} · ${esc(l.label)}</b><small>${esc(ago(l.at))}</small></span>${ico('i-chev', 14)}</button>`
      : p1 ? `<button class="hs-li hs-resume" id="hub-resume"><span class="hs-face">${PJ().face(p1, 'sm')}</span><span class="hs-tx"><b>Open ${esc(p1.name)}</b><small>Your last session shows up here</small></span>${ico('i-chev', 14)}</button>` : '';
    let rows = '';
    if (!on) rows = [
      `<div class="hs-li static"><span class="hs-dot"></span><span class="hs-tx"><b>${window.TribeHost && window.TribeHost.isDesktop ? 'Host a tribe on this computer' : 'Join a friend\'s tribe'}</b><small>Projects, chat and your agents live in a tribe</small></span></div>`,
      `<div class="hs-li static"><span class="hs-dot"></span><span class="hs-tx"><b>Jot your first idea</b><small>The scratchpad below keeps it on this device</small></span></div>`].join('');
    else {
      const all = sugItems(), shown = sugOpen ? all.slice(0, 8) : all.slice(0, (lp || p1 ? 2 : 3) - (isPhone() ? 1 : 0));
      rows = shown.map(x => { const btn = x.need ? `<button class="btn ${x.kind === 'approval' ? 'primary' : ''}" data-sug-go="${esc(x.id)}">${x.kind === 'approval' ? 'Review' : x.kind === 'vote' ? 'Vote' : 'Open'}</button>` : x.action ? `<button class="btn" data-sug-go="${esc(x.id)}">${esc(x.action.label)}</button>` : '';
        return `<div class="hs-li ${x.need ? 'need' : ''}" data-sug="${esc(x.id)}"><span class="hs-dot"></span><span class="hs-tx"><b>${esc(x.title)}</b><small>${x.project ? `${esc((projOf(x.project) || {}).name || '')} · ` : ''}${esc(x.why || x.sub || '')}</small>${btn ? `<span class="hs-a">${btn}</span>` : ''}</span>
        <button class="hs-x" data-sug-x="${esc(x.id)}" title="Not now" aria-label="Dismiss">${ico('i-x', 13)}</button></div>`; }).join('')
        + (all.length > shown.length || (sugOpen && all.length > 2) ? `<button class="linkish hs-more" id="hub-sug-more">${sugOpen ? 'Show fewer' : `${all.length - shown.length} more`}</button>` : '')
        + (!all.length && !resume ? '<p class="hs-empty">Nothing waiting on you. Suggestions roll in as your projects move.</p>' : '');
    }
    const n = on ? sugItems().filter(x => x.need).length : 0;
    return `<div class="hh-panel hh-sug" id="hub-suggest"><div class="hh-head"><span class="eyebrow">Suggestions</span>${n ? `<span class="hh-n">${n} waiting</span>` : ''}</div>
      <div class="hs-list">${resume}${rows}</div></div>`;
  }

  // Ask: your own Claude Code's private chat when it is connected (and picked), else the local model (POST /api/hub/ask).
  const ask = { to: lsGet('tribecode.home.askTo', 'claude'), draft: '', q: '', answer: '', status: '', via: '', model: '', error: '', channel: '', agent: null, sentAt: 0, offerConnect: false };
  const askTarget = () => (ask.to === 'claude' && myAgent() ? 'claude' : 'brain');
  function askPanel(on) {
    const ag = myAgent(), tgt = askTarget();
    const to = ag ? `<div class="ask-to" role="group" aria-label="Ask who"><button type="button" data-ask-to="claude" class="${tgt === 'claude' ? 'on' : ''}" aria-pressed="${tgt === 'claude'}">${esc(ag.name || 'Your AI')}</button><button type="button" data-ask-to="brain" class="${tgt === 'brain' ? 'on' : ''}" aria-pressed="${tgt === 'brain'}">Local model</button></div>`
      : `<span class="ask-who">${on ? 'Local model' : 'Not connected'}</span>`;
    const ph = !on ? 'Host or join a tribe, then ask your agent or local model…' : tgt === 'claude' ? `Ask ${ag.name || 'your AI'} anything, or give it a task…` : 'Ask your hub anything: what changed, what is next…';
    return `<div class="hh-panel hh-ask" id="hub-ask"><div class="hh-head"><span class="eyebrow">Ask</span>${to}</div>
      <form class="ask-box" id="hub-ask-form" autocomplete="off"><textarea id="hub-ask-in" rows="3" placeholder="${esc(ph)}" aria-label="Ask">${esc(ask.draft)}</textarea>
        <div class="ask-row"><span class="ask-hint">${on ? 'Enter to send · Shift Enter for a new line' : 'Answers come from the tribe\'s host'}</span><button class="ask-send" id="hub-ask-send" type="submit" aria-label="Send" title="Send">${SEND}</button></div></form>
      <div class="ask-out" id="hub-answer" aria-live="polite">${answerHtml()}</div></div>`;
  }
  function answerHtml() {
    if (ask.error) return `<div class="ask-ans err"><p>${esc(ask.error)}</p>${ask.offerConnect ? '<div class="aa-acts"><button class="btn" id="hub-ask-cc">Connect your AI</button></div>' : ''}</div>`;
    if (!ask.status) return '';
    const who = ask.via === 'claude' ? esc((ask.agent && ask.agent.name) || 'Your AI') : `Local model${ask.model ? ` · ${esc(ask.model)}` : ''}`;
    const body = ask.status === 'thinking' || ask.status === 'sending' ? '<p class="aa-wait">Thinking…</p>'
      : ask.status === 'sent' ? `<p class="aa-wait">Sent to ${who}'s private chat. Its reply shows up here and in the chat.</p>`
      : `<div class="aa-text">${esc(ask.answer)}</div>`;
    return `<div class="ask-ans"><div class="aa-head">${aiTag(ask.via === 'claude' ? 'Agent' : 'AI')}<b>${who}</b><span class="aa-q" title="${esc(ask.q)}">${esc(ask.q)}</span></div>${body}
      <div class="aa-acts"><button class="btn" id="hub-ask-open">Open in chat</button><button class="btn ghost" id="hub-ask-clear">Clear</button></div></div>`;
  }
  function drawAnswer() { const o = $('#hub-answer'); if (o) { o.innerHTML = answerHtml(); bindAnswer(o); } }
  function bindAnswer(root) {
    const on = (sel, fn) => { const b = root.querySelector(sel); if (b) b.onclick = fn; };
    on('#hub-ask-open', openAnswer); on('#hub-ask-cc', () => App().connectClaude());
    on('#hub-ask-clear', () => { Object.assign(ask, { q: '', answer: '', status: '', error: '', via: '', offerConnect: false }); drawAnswer(); });
  }
  async function sendAsk() {
    const inp = $('#hub-ask-in'), text = (inp ? inp.value : ask.draft).trim();
    if (!text) { if (inp) inp.focus(); return; }
    if (!connected()) { Object.assign(ask, { error: 'Asking needs a tribe: the local model and your agents run on the host. Host one on this computer or join a friend with a link.', status: '' }); return drawAnswer(); }
    const tgt = askTarget(), ag = myAgent();
    Object.assign(ask, { q: text, answer: '', error: '', via: tgt, model: '', offerConnect: false, status: tgt === 'claude' ? 'sending' : 'thinking', agent: ag, draft: '' });
    if (inp) inp.value = '';
    drawAnswer();
    if (tgt === 'claude') {
      const ch = window.TribeDM && window.TribeDM.channelWith ? window.TribeDM.channelWith(ag.id) : 'dm-' + [me().id, ag.id].sort().join('-');
      try { ask.sentAt = Date.now(); ask.channel = ch; await C.api('/chat/' + encodeURIComponent(ch), { method: 'POST', body: { text } }); if (ask.status === 'sending') ask.status = 'sent'; }
      catch (e) { Object.assign(ask, { status: '', error: e.message }); }
      return drawAnswer();
    }
    try { const r = await C.api('/hub/ask', { method: 'POST', body: { prompt: text } }); Object.assign(ask, { status: 'done', answer: r.answer, model: r.model || '' }); }
    catch (e) { Object.assign(ask, { status: '', error: e.message, offerConnect: !ag }); }
    drawAnswer();
  }
  // Your agent's reply in its private chat lands under the box too.
  C.on('chat', ({ channel, message }) => {
    if (!ask.channel || channel !== ask.channel || !message || !ask.agent || message.by !== ask.agent.id || ask.via !== 'claude') return;
    if (Date.parse(message.at) < ask.sentAt - 2000) return;
    Object.assign(ask, { status: 'done', answer: message.text || '' }); drawAnswer();
  });
  function openAnswer() {
    if (ask.via === 'claude' && ask.agent && window.TribeDM) return window.TribeDM.open(ask.agent.id);
    if (!connected()) return;
    const q = ask.q;
    App().show('chat');
    setTimeout(() => { const i = $('#chat-input'); if (i) { i.value = '@brain ' + q; i.focus(); i.dispatchEvent(new Event('input', { bubbles: true })); } }, 80);
  }

  function joinPanel(on) {
    const desk = !!(window.TribeHost && window.TribeHost.isDesktop), can = on || desk;
    // The fewest steps to a friend: one tap makes a fresh project and copies a link that works anywhere.
    return `<div class="hh-panel hh-join" id="hub-joinpanel"><div class="hh-head"><span class="eyebrow">Bring a friend</span></div>
      ${can ? `<h3>${ico('i-users', 16)}Invite a friend</h3>
      <p>One tap makes a fresh project and copies a link that works anywhere. They tap it, type a name and they're in.</p>
      <button class="btn primary hj-instant" id="hub-instant">${ico('i-link', 15)}Invite a friend</button>
      <div class="hj-acts"><button class="btn" id="hub-join">Paste invite link</button>${on ? '<button class="btn" id="hub-new">' + ico('i-plus', 15) + 'New project</button>' : ''}</div>`
      : `<h3>${ico('i-link', 16)}Join with a link</h3>
      <p>A friend sent a link like <code>…/join/k7Qx2</code>? Paste it and pick a name. No account needed.</p>
      <div class="hj-acts"><button class="btn primary" id="hub-join">Paste invite link</button><button class="btn" id="hub-host">Get the desktop app</button><a class="btn" id="hub-cloud" href="https://render.com/deploy?repo=https://github.com/orionopenwow/TribeCode" target="_blank" rel="noopener">☁️ Free cloud tribe</a></div>
      <p class="hj-note">To start your own tribe from a browser: the desktop app hosts it on your computer, or one click makes a free cloud tribe (docs: CLOUD.md).</p>`}</div>`;
  }
  async function instant() {   // host first if needed (desktop app), then the instant invite
    if (!connected()) {
      if (!(window.TribeHost && window.TribeHost.isDesktop)) return join();
      await host();
      for (let i = 0; i < 60 && !connected(); i++) await new Promise(r => setTimeout(r, 250));
      if (!connected()) return toast('Hosting did not start. Settings has the log.');
    }
    window.TribeFlow ? window.TribeFlow.instant() : App().openInvite();
  }

  // ---------- Get started: five steps, two ways in (dismissible, remembered) ----------
  const SKEY = 'tribecode.home.startDismissed';
  const start = { status: '', text: '', error: '' };
  function steps(on) {
    const meId = me().id, list = projects(), f = (data && data.fleet) || {};
    const pv = (f.loops || []).find(l => l.id === 'preview');
    return [
      { id: 'tribe', label: 'Start or join a tribe', done: on },
      { id: 'claude', label: 'Connect your AI', done: on && (!!myAgent() || (f.agents || []).length > 0) },
      { id: 'project', label: 'Create a project', done: on && list.some(p => !p.default || p.hasRepo) },
      { id: 'invite', label: 'Invite a friend', done: on && (C.state().members || []).some(m => m.role !== 'agent' && m.id !== meId) },
      { id: 'preview', label: 'Preview your app', done: on && (!!(pv && pv.on) || !!lsGet('tribecode.home.previewed')) },
    ];
  }
  function startCard(on) {
    if (lsGet(SKEY)) return '';
    const st = steps(on), done = st.filter(s => s.done).length, pct = Math.round(done / st.length * 100);
    const out = start.error ? `<div class="hst-out err">${esc(start.error)}</div>`
      : start.status === 'thinking' ? '<div class="hst-out"><p class="aa-wait">The local model is reading your notes…</p></div>'
      : start.text ? `<div class="hst-out" id="hub-start-out"><div class="aa-head">${aiTag()}<b>A first project from your notes</b></div><div class="aa-text">${esc(start.text)}</div>
          <div class="aa-acts"><button class="btn primary" id="hub-start-new">Start this project</button><button class="btn" id="hub-start-save">Save to scratchpad</button><button class="btn ghost" id="hub-start-clear">Clear</button></div></div>` : '';
    return sec('Two ways in', 'Get started', `<div class="hub-start" id="hub-start">
        <button class="hst-x" id="hub-start-x" title="Dismiss" aria-label="Dismiss Get started">${ico('i-x', 15)}</button>
        <div class="hst-main">
          <p class="hst-lead">Let the local model shape a first project from your notes, or hand it straight to your AI.</p>
          <div class="hst-acts"><button class="btn ai" id="hub-start-ai">${ico('i-sparkle', 14)}Refine with AI</button><button class="btn ember-o" id="hub-start-agent">${ico('i-zap', 14)}Get started with your agent</button></div>
          <div class="hst-prog"><div class="hst-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${st.length}" aria-valuenow="${done}" aria-label="Get started progress"><i style="width:${pct}%"></i></div><span class="hst-num" id="hub-start-num">${done} of ${st.length} done</span></div>
          <ol class="hst-steps">${st.map((s, i) => `<li><button class="hst-step ${s.done ? 'done' : ''}" data-step="${s.id}" ${s.done ? 'aria-disabled="true"' : ''}><span class="hst-ck">${s.done ? ico('i-tick', 12) : i + 1}</span><span>${esc(s.label)}</span></button></li>`).join('')}</ol>
          ${out}
        </div>
        <div class="hst-art" aria-hidden="true">${ART}</div>
      </div>`, 'id="hub-start-sec"');
  }
  // Flat editorial illustration in the palette: a raised window, the faceted mark, a progress rail.
  const ART = `<svg viewBox="0 0 220 150" width="220" height="150">
    <rect x="34" y="14" width="152" height="104" rx="12" fill="#1B2028" stroke="#2A313C"/>
    <rect x="34" y="14" width="152" height="22" rx="12" fill="#222833"/><rect x="34" y="28" width="152" height="8" fill="#222833"/>
    <circle cx="48" cy="25" r="3" fill="#FF6F8E"/><circle cx="58" cy="25" r="3" fill="#FFB86B"/><circle cx="68" cy="25" r="3" fill="#3BD16F"/>
    <path d="M78 54h64l-32 52z" fill="#6C7CFF"/><path d="M110 54h32l-32 52z" fill="#4F5BD5"/><path d="M96 46h40l-14 22z" fill="#F26B1D"/>
    <rect x="48" y="96" width="30" height="6" rx="3" fill="#2A313C"/><rect x="150" y="80" width="22" height="22" rx="6" fill="#38C6B1"/><path d="M156 91l4 4 7-8" stroke="#0B1F1C" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="34" y="132" width="152" height="4" rx="2" fill="#2A313C"/><rect x="34" y="132" width="88" height="4" rx="2" fill="#6C7CFF"/><circle cx="122" cy="134" r="6" fill="#F8FAFC" stroke="#6C7CFF" stroke-width="2"/></svg>`;
  async function startAI() {
    if (!connected()) { Object.assign(start, { error: 'The local model runs on the tribe\'s host: host a tribe on this computer or join one first.', text: '' }); return render(); }
    Object.assign(start, { status: 'thinking', text: '', error: '' }); render();
    await scratch.flush();
    try { const r = await C.api('/hub/ask', { method: 'POST', body: { kind: 'start' } }); Object.assign(start, { status: '', text: r.answer }); }
    catch (e) { Object.assign(start, { status: '', error: e.message }); }
    render();
  }
  function startAgent() {
    if (!connected()) return window.TribeHost && window.TribeHost.isDesktop ? host() : join();
    const ag = myAgent();
    if (ag && window.TribeDM) return window.TribeDM.open(ag.id);
    App().connectClaude();
  }
  function stepGo(id) {
    if (id === 'tribe') return window.TribeHost && window.TribeHost.isDesktop ? host() : join();
    if (!connected()) return toast('Start or join a tribe first.');
    if (id === 'claude') return App().connectClaude();
    if (id === 'project') return newProject();
    if (id === 'invite') return App().openInvite();
    if (id === 'preview') {
      lsSet('tribecode.home.previewed', true);
      const l = ((data && data.fleet && data.fleet.loops) || []).find(x => x.id === 'preview'), pid = (l && (l.projects || [])[0]) || (pj1() || {}).id;
      return go(pid, () => (window.TribePreview && window.TribePreview.open ? window.TribePreview.open() : App().show('repo')));
    }
  }

  // ---------- bottom: Scratchpad (with Refine with AI) | Recent activity ----------
  const refine = { status: '', text: '', id: null, draft: false, error: '', model: '' };
  // Your notes: Start a note puts a new note straight into your docs center (Global docs › Your notes).
  const noteTitle = t => (String(t || '').split('\n').find(l => l.trim()) || 'Untitled note').replace(/^#+\s*/, '').slice(0, 80);
  function notesSec(on) {
    const mine = scratch.notes().filter(n => n.text && n.text.trim()).slice(0, 3);
    const rows = mine.map(n => `<button class="hub-li" data-mynote="${esc(n.id || '')}">${ico('i-doc', 14)}<span><b>${esc(noteTitle(n.text))}</b><small>${esc(ago(n.updated || n.at))}</small></span>${ico('i-chev', 14)}</button>`).join('');
    return sec('Your notes', '<span class="emo" aria-hidden="true">📝</span>Notes', `<button class="note-start" id="hub-note-new">${ico('i-plus', 18)}<span><b>Start a note</b><small>It goes straight into your docs</small></span></button>
      ${rows ? `<div class="hub-list hub-mynotes">${rows}</div>` : ''}`, 'id="hub-notes"', `<button class="linkish" id="hub-notes-all">Files</button>`);
  }
  async function startNote() {
    const id = await scratch.create('New note');
    open('docs'); setTimeout(() => noteEditor(id, true), 60);
  }
  // A plain note editor (first line is the title); saves as you type.
  // feat/doc-editor: two layouts over the same commands and menus (doclayout.js).
  //   Desktop: Google Docs desktop + Notion — top bar (title, Only you · Saved, Ask AI, ⋮, Done), sticky formatting
  //   toolbar, Outline panel, centered page. Phone: Google Docs mobile — 64px header (✓ Done pill; undo, redo, +,
  //   comment, sparkle, ⋮) and a format bar riding on the keyboard. Ids kept: #note-title #note-text #note-done
  //   #note-undo #note-redo; #note-del lives in the ⋮ menu.
  // src (feat/setup-local): any other text kept on this device (localfiles.js docs) opens in the same editor:
  //   { title, body, where, at, save(title, body), remove(), move(anchor)? }
  function noteEditor(id, fresh, src) {
    const n = src ? { text: `${src.title || ''}\n${src.body || ''}`, updated: src.at, at: src.at } : scratch.notes().find(x => x.id === id); if (!n) return;
    const where = src ? (src.where || 'On this device') : 'Only you';
    let ov = $('#note-ed'); if (ov) ov.remove();
    const lines = fresh ? ['', ''] : String(n.text).split('\n'), title = lines[0] === 'New note' && fresh ? '' : lines[0], body = lines.slice(1).join('\n');
    const L = window.TribeDocLayout, desk = !!(L && L.isDesk());
    ov = document.createElement('div'); ov.id = 'note-ed'; ov.className = 'note-ed-wrap' + (L ? (desk ? ' dl-full' : ' sheet gd-wrap') : isPhone() ? ' sheet' : '');
    const fields = cls => `<input id="note-title" class="${cls}" placeholder="Title" value="${esc(title)}" autocomplete="off" aria-label="Title"><textarea id="note-text" class="dl-text" spellcheck="true" placeholder="Start typing, or type / for blocks…" aria-label="Note text">${esc(body)}</textarea>`;
    if (L && desk) {
      const acts = `<div class="ne-acts"><button class="ne-btn" data-act="sparkle" id="note-ai" aria-label="Ask AI" title="Ask AI">${L.ico('sparkle', 20)}</button>
        <button class="ne-btn" data-act="more" id="note-more" aria-label="More" title="More">${L.ico('more', 20)}</button>
        <button class="ne-done" id="note-done" aria-label="Done" title="Done (Esc)">${ico('i-tick', 18)}<span>Done</span></button></div>`;
      ov.innerHTML = `<div class="note-ed dl-shell" role="dialog" aria-modal="true" aria-label="Note">
        <div class="dl-head">${L.top({ kind: src ? 'doc' : 'note', nameId: 'note-name', title, where, statusId: 'note-status', status: fresh ? 'New note' : 'Saved', acts })}
          ${L.toolbar({ ids: { undo: 'note-undo', redo: 'note-redo' } })}</div>
        <div class="dl-body">
          <aside class="dl-side" aria-label="Outline"><section class="dl-outline" style="margin:0;padding:0;border:0"><div class="dl-side-h"><span class="dl-eyebrow">Outline</span></div><nav class="dl-ol" id="note-outline" aria-label="Outline"></nav></section></aside>
          <div class="dl-canvas"><div class="dl-page ne-body">${fields('ne-title')}</div></div>
        </div></div>`;
    } else if (L) {
      ov.innerHTML = `<div class="note-ed gd-ed" role="dialog" aria-modal="true" aria-label="Note">
        ${L.gdHeader({ ids: { done: 'note-done', undo: 'note-undo', redo: 'note-redo' } })}
        <div class="ne-body gd-body">${fields('gd-title')}<span class="gd-status" id="note-status" aria-live="polite"></span></div>
        <div class="gd-fmt-wrap docked">${L.gdBar()}</div></div>`;
    } else {
      ov.innerHTML = `<div class="note-ed" role="dialog" aria-label="Note">
        <header><button class="ne-done" id="note-done" aria-label="Done">${ico('i-tick', 20)}</button><span class="ne-where">${esc(where)}</span><span style="flex:1"></span>
          <button class="ne-btn" id="note-undo" aria-label="Undo" title="Undo">↶</button><button class="ne-btn" id="note-redo" aria-label="Redo" title="Redo">↷</button>
          <button class="ne-btn" id="note-del" aria-label="Delete note" title="Delete">${ico('i-x', 18)}</button></header>
        <div class="ne-body">${fields('ne-title')}</div></div>`;
    }
    document.body.appendChild(ov);
    if (window.TribeRich) window.TribeRich.upgrade($('#note-text'));   // feat/richtext: formatted editing; #note-text keeps the textarea API
    const ti = $('#note-title'), ta = $('#note-text');
    (fresh || !title ? ti : ta).focus();
    const status = $('#note-status'); let st = null;
    const grow = () => { if (L) { ta.style.height = 'auto'; ta.style.height = Math.max(desk ? ta.parentNode.clientHeight * 0.5 : 240, ta.scrollHeight + 4) + 'px'; } };
    let srcT = null;
    const save = () => {
      if (src) { clearTimeout(srcT); srcT = setTimeout(() => { srcT = null; src.save(ti.value.trim(), ta.value); }, 300); }
      else scratch.quiet(id, `${ti.value.trim() || 'Untitled note'}\n${ta.value}`);
      if (status) { status.textContent = 'Saving…'; clearTimeout(st); st = setTimeout(async () => { try { if (!src) await scratch.flush(); } catch {} if (status.isConnected) status.textContent = 'Saved'; }, 700); }
    };
    const flushSrc = () => { if (src && srcT) { clearTimeout(srcT); srcT = null; return src.save(ti.value.trim(), ta.value); } };
    ti.oninput = save;
    ti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } });
    const hist = cmd => { if (ta.rtUndo && document.activeElement !== ti) { if (cmd === 'undo') ta.rtUndo(); else ta.rtRedo(); save(); return; } (document.activeElement === ti ? ti : ta).focus(); document.execCommand(cmd); save(); };
    $('#note-undo').onclick = () => hist('undo');
    $('#note-redo').onclick = () => hist('redo');
    const close = () => { ov.remove(); if (mode === 'docs') refreshFiles(); else if (document.body.dataset.view === 'hub') render(); };
    const del = async () => { if (src) { if (!confirm(`Delete “${ti.value.trim() || 'this doc'}” from this device?`)) return; clearTimeout(srcT); srcT = null; await src.remove(); } else scratch.remove(id); ov.remove(); if (mode === 'docs') refreshFiles(); else render(); toast(src ? 'Deleted' : 'Note deleted'); };
    let ol = null, sl = null;
    if (L) {
      sl = L.slash(ta, ta.parentNode);
      const sync = () => L.sync(ov, ta);
      if (desk) { L.mirror($('#note-name'), ti, () => ta.focus()); ol = L.outline({ el: $('#note-outline'), ta: () => ta }); }
      L.bind(ov, () => ta);
      if (!desk) L.dockAboveKeyboard(ov.querySelector('.gd-fmt-wrap'), ta, { always: true });
      ta.addEventListener('keydown', e => { if (sl.key(e)) return; if (L.key(e, ta)) return; L.enterList(e, ta); });
      const words = () => (ta.value.match(/\S+/g) || []).length;
      const more = anchor => L.menuSheet({ title: 'More', anchor, items: [
        { label: 'Find and replace', icon: 'find', run: () => L.findSheet(ta, { anchor }) },
        { label: 'Share & export', icon: 'share', run: () => L.menuSheet({ title: 'Share & export', anchor, items: [
          { label: 'Copy text', icon: 'copy', run: async () => { try { await navigator.clipboard.writeText(`# ${ti.value.trim() || 'Untitled note'}\n\n${ta.value}`); toast('Note copied'); } catch { toast('Could not copy'); } } },
          { label: 'Download .md', icon: 'download', run: () => L.download(ti.value.trim() || 'note', `# ${ti.value.trim() || 'Untitled note'}\n\n${ta.value}\n`) },
        ] }) },
        { label: 'Outline', icon: 'outline', run: () => L.outlineSheet({ ta: () => ta }) },
        ...(src && src.move ? [{ label: 'Move to…', icon: 'share', run: () => { flushSrc(); src.move(anchor); } }] : []),
        ...(window.TribeRich ? [window.TribeRich.menuItem(() => { save(); flushSrc(); src ? noteEditor(null, false, { ...src, title: ti.value.trim(), body: ta.value }) : noteEditor(id); })] : []),   // feat/richtext: View Markdown / View formatted
        { label: 'Details', icon: 'info', run: () => { const s = L.sheet({ title: 'Details', anchor, html: `<dl class="dl-details"><dt>Words</dt><dd>${words()}</dd><dt>Characters</dt><dd>${ta.value.length}</dd><dt>Last edited</dt><dd>${esc(ago((src ? {} : scratch.notes().find(x => x.id === id) || {}).updated || n.updated || n.at) || 'just now')}</dd><dt>Owner</dt><dd>${esc(me().name || 'You')} · ${esc(where.toLowerCase())}</dd></dl>` }); return s; } },
        { label: 'Rename', icon: 'rename', run: () => { ti.focus(); ti.select(); } },
        '-',
        { label: 'Delete', icon: 'trash', id: 'note-del', danger: true, run: del },
      ] });
      ov.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
        const k = b.dataset.act;
        if (k === 'plus') return L.insertSheet(ta, { anchor: b, after: sync });
        if (k === 'comment') return toast(`Comments live on project docs. Move this ${src ? 'doc' : 'note'} into a project to discuss it with your tribe.`);
        if (k === 'sparkle') return L.aiSheet(ta, { anchor: b, title: 'this note', after: sync });
        if (k === 'more') return more(b);
      });
    }
    ta.oninput = () => { save(); grow(); if (sl) sl.check(); if (ol) ol.refresh(); };
    grow();
    const done = async () => {
      if (src) { save(); await flushSrc(); return close(); }
      if (!ti.value.trim() && !ta.value.trim()) { scratch.remove(id); ov.remove(); if (mode === 'docs') refreshFiles(); return; }   // nothing written: no empty note left behind
      save(); await scratch.flush(); close();
    };
    $('#note-done').onclick = done;
    const nd = $('#note-del'); if (nd) nd.onclick = del;
    ov.addEventListener('click', e => { if (e.target === ov) done(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.dl-menu, .dl-sheet-wrap')) done(); });
  }

  async function refineGo() {
    if (!connected() || !C.hasToken()) { refine.error = 'Refine uses the local model on the tribe\'s host: host or join a tribe first. Your notes stay on this device until then.'; return render(); }
    await scratch.flush();
    const list = scratch.notes(), sel = list.find(n => n.id && n.id === scratch.selected()) || list[0];
    const draft = ($('#hub-scratch .sc-in') || {}).value || '';
    const body = sel && sel.id ? { id: sel.id } : draft.trim() ? { text: draft } : null;
    if (!body) { refine.error = 'Write a note first, then Refine with AI tidies it up.'; return render(); }
    Object.assign(refine, { status: 'thinking', text: '', error: '', id: body.id || null, draft: !body.id }); render();
    try { const r = await C.api('/scratch/refine', { method: 'POST', body }); Object.assign(refine, { status: '', text: r.text, model: r.model || '' }); }
    catch (e) { Object.assign(refine, { status: '', error: e.message }); }
    render();
  }
  function refineApply(replace) {
    if (replace) { if (refine.draft) scratch.setDraft(refine.text); else scratch.replace(refine.id, refine.text); toast('Replaced with the cleaned-up note'); }
    Object.assign(refine, { status: '', text: '', error: '', id: null }); render();
  }

  // Global stream, condensed: avatar, who, what, when, and the project (or "On this device").
  const KIND = { gist: ['i-sparkle', 'Agent'], commit: ['i-git', 'Commit'], decision: ['i-vote', 'Decision'], proposal: ['i-vote', 'Proposal'], vote: ['i-vote', 'Vote'], doc: ['i-doc', 'Doc'], task: ['i-check', 'Task'], join: ['i-users', 'Joined'], chat: ['i-chat', 'Chat'], plan: ['i-flag', 'Plan'] };
  function chip(pid) {
    const p = projOf(pid); if (!p) return '';
    return `<span class="hub-chip" style="--pc:${esc(p.color || '#6C7CFF')}"><i></i>${esc(p.name)}</span>`;
  }
  let feedOpen = false;
  function avatar(it) {
    const m = it.by && memberOf(it.by);
    if (it.agent || (m && m.role === 'agent') || it.kind === 'gist') return `<span class="ha-av agent">${ico('i-sparkle', 13)}</span>`;
    if (it.kind === 'plan' || it.by === 'tribecode') return `<span class="ha-av sys">${ico((KIND[it.kind] || ['i-flag'])[0], 13)}</span>`;
    const name = (m && m.name) || it.byName || '?';
    return `<span class="ha-av" style="background:${esc((m && m.color) || (it.kind === 'commit' ? '#6C7CFF' : '#2A313C'))}">${esc(([...name.trim()][0] || '').toUpperCase() || '?')}</span>`;
  }
  function activitySec(on) {
    const head = inner => sec('Across your projects', '<span class="emo" aria-hidden="true">🧭</span>Recent activity', inner, 'id="hub-stream"');
    if (!on) {
      const local = scratch.notes().slice(0, 4), nm = ((window.TribeStore && window.TribeStore.get().name) || 'Me');
      return head(local.length ? `<div class="hub-act" id="hub-feed">${local.map(n => `<div class="ha-row static"><span class="ha-av" style="background:var(--accent)">${esc(([...nm][0] || '').toUpperCase())}</span><span class="ha-t"><span class="ha-l1"><b>You</b><span class="ha-at">${esc(ago(n.updated || n.at))}</span></span><span class="ha-text">${esc(n.text.split('\n')[0])}</span><span class="ha-l3"><small>Scratchpad note</small><span class="ha-tag">On this device</span></span></span></div>`).join('')}</div>`
        : '<div class="hub-empty">Quiet so far. Notes you jot show up here; once you are in a tribe, so do saved code changes, agent gists, decisions and people joining.</div>');
    }
    if (data && data.error) return head(`<div class="hub-empty">${esc(data.error)}</div>`);
    if (!data) return head('<div class="hub-empty faint">Loading…</div>');
    const feed = data.feed || [];
    if (!feed.length) return head('<div class="hub-empty">Quiet so far. Commits, agent gists, decisions, new docs and people joining show up here as they happen.</div>');
    const n = feedOpen ? 30 : 6;
    const rows = feed.slice(0, n).map(it => { const [, kind] = KIND[it.kind] || ['i-doc', it.kind], m = it.by && memberOf(it.by);
      return `<button class="ha-row k-${esc(it.kind)}" data-feed="${esc(it.id)}">${avatar(it)}<span class="ha-t"><span class="ha-l1"><b>${esc((m && m.name) || it.byName || kind)}</b><span class="ha-at">${esc(ago(it.at))}</span></span>
        <span class="ha-text">${esc(it.title)}</span><span class="ha-l3"><small>${esc(it.sub && it.kind !== 'commit' ? it.sub : kind)}${it.kind === 'commit' && it.sub ? ` · <code>${esc(it.sub)}</code>` : ''}</small>${chip(it.project)}</span></span></button>`; }).join('');
    return head(`<div class="hub-act" id="hub-feed">${rows}${feed.length > 6 ? `<button class="linkish ha-more" id="hub-feed-more">${feedOpen ? 'Show fewer' : `Show ${Math.min(30, feed.length) - 6} more`}</button>` : ''}</div>`);
  }

  // Agents & models: one compact row each.
  function fleetSec() {
    const f = (data && data.fleet) || { agents: [], models: {}, loops: [] };
    const meter = a => a.context === null || a.context === undefined ? '' : `<span class="hf-meter" title="Context window used: ${a.context}%"><i style="width:${Math.max(2, Math.min(100, a.context))}%"></i></span><span class="hf-num">${a.context}%</span>`;
    const tok = n => n === null || n === undefined ? '' : `<span class="hf-num" title="Tokens reported through my_lane">${n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : n} tok</span>`;
    const agents = f.agents.length ? f.agents.map(a => `<button class="hf-row" data-fleet="agent" data-id="${esc(a.id)}"><span class="hf-dot ${a.online ? 'on' : ''}"></span><span class="hf-name">${esc(a.name)}</span>
        <span class="hf-what">${a.online ? '' : '<span class="faint">idle · </span>'}${esc(a.doing || (a.online ? 'online' : 'no task'))}</span>${a.project ? chip(a.project) : ''}${meter(a)}${tok(a.tokens)}</button>`).join('')
      : `<div class="hf-row static"><span class="hf-dot"></span><span class="hf-name">No agents yet</span><span class="hf-what faint">Connect your AI (Claude Code, Codex, Gemini CLI, Cursor…) and it shows up here with its task and context.</span><button class="btn" id="hub-cc">Connect your AI</button></div>`;
    const m = f.models || {};
    const model = `<button class="hf-row" data-fleet="models"><span class="hf-dot ${m.online ? 'on' : ''}"></span><span class="hf-name">Local model</span><span class="hf-what">${m.online ? `Ollama · ${esc(m.model)}${m.list && m.list.length > 1 ? ` <span class="faint">+${m.list.length - 1} more</span>` : ''}` : `<span class="faint">${esc(m.error || 'Ollama is off')}</span>`}</span></button>`;
    const loops = (f.loops || []).map(l => `<button class="hf-row" data-fleet="${esc(l.id)}"><span class="hf-dot ${l.on ? 'on' : ''}"></span><span class="hf-name">${esc(l.name)}</span><span class="hf-what">${esc(l.state)}${l.last ? ` <span class="faint">· last ${esc(ago(l.last))}</span>` : ''}</span></button>`).join('');
    return sec('Agents & models', 'What is running', `<div class="hub-fleet" id="hub-fleet"><div class="hf-group">${agents}</div><div class="hf-group">${model}${loops}</div></div>`, 'id="hub-agents"');
  }

  // ---------- AI Insights: GET /api/insights (server/insights.js), else suggestions + inspirations + health ----------
  const INS = { optimization: ['i-zap', 'Optimization'], suggestion: ['i-sparkle', 'Suggestion'], issue: ['i-bug', 'Issue'], health: ['i-net', 'Health'] };
  const insights = { items: null, src: '', at: 0, loading: false };
  let insActs = {};
  async function loadInsights(force) {
    if (!connected()) { insights.items = null; insights.src = ''; return drawInsights(); }
    if (insights.loading || (!force && insights.src && Date.now() - insights.at < 60_000)) return drawInsights();
    insights.loading = true;
    if (!data || !data.insightsApi) { insights.items = null; insights.src = data ? 'fallback' : ''; insights.loading = false; return drawInsights(); }   // no server/insights.js on this host
    try { const r = await C.api('/insights'); insights.items = Array.isArray(r) ? r : (r.items || r.insights || []); insights.src = 'api'; }
    catch { insights.items = null; insights.src = 'fallback'; }   // not built on this host (404) or failed: fall back
    insights.at = Date.now(); insights.loading = false; drawInsights();
  }
  C.on('ws', m => { if (m && m.type === 'insights') loadInsights(true); });
  function fallbackInsights() {
    const out = [], f = (data && data.fleet) || {}, m = f.models || {};
    if (!connected()) return [{ id: 'off:tribe', kind: 'suggestion', title: 'Start or join a tribe', body: 'Insights come from your projects, your agents and the local model on the tribe\'s host.', source: 'Home', run: () => stepGo('tribe'), label: window.TribeHost && window.TribeHost.isDesktop ? 'Start hosting' : 'Join' }];
    // qa-qol-2: plain words for a beginner (no "Ollama not reachable at http://…"); the details stay in Settings › Flint's brain
    if (data && m.online === false && !document.body.classList.contains('hs-on')) out.push({ id: 'h:model', kind: 'health', title: 'Flint has no AI yet', body: 'He answers with simple rules for now. Give him an AI (built in, on this computer, or a cloud key) for real answers, summaries and drafts.', source: 'Flint', run: () => (window.TribeBrain ? window.TribeBrain.open() : window.TribeSettings && window.TribeSettings.open()), label: 'Choose Flint\'s AI' });
    // the desktop right panel already has its own "Connect your AI" card above the insights: no second one there
    if (data && !(f.agents || []).length && !myAgent() && isPhone()) out.push({ id: 's:cc', kind: 'suggestion', title: 'Connect your AI', body: 'It shows up in the room with its task and context, and Ask on Home can go straight to it.', source: 'Home', run: () => App().connectClaude(), label: 'Connect' });
    for (const x of sugItems()) out.push({ id: 'sug:' + x.id, kind: x.need ? 'issue' : 'suggestion', title: x.title, body: x.why || x.sub || '', source: (projOf(x.project) || {}).name || 'Your projects', run: () => sugGo(x.id), label: x.need ? (x.kind === 'approval' ? 'Review' : x.kind === 'vote' ? 'Vote' : 'Open') : x.action ? x.action.label : 'Open' });
    for (const i of (data && data.ideas) || []) out.push({ id: i.id, kind: 'suggestion', title: i.title, body: i.body, source: 'Secretary', run: () => go(i.project, () => window.TribeSecretary && window.TribeSecretary.open()), label: 'Look' });
    return out.slice(0, 6);
  }
  function insightRun(it) {
    if (it.run) return it.run;
    const a = it.action; if (!a) return null;
    return () => {
      if (a.url) return window.open(a.url, '_blank', 'noopener');
      if (a.view) return a.project ? go(a.project, () => App().show(a.view)) : App().show(a.view);
      if (a.ref || a.project) return jump({ project: a.project || it.project, ref: a.ref || { type: 'project' } });
      if (a.do === 'secretary' && window.TribeSecretary) return window.TribeSecretary.open();
      if (a.do === 'connect') return App().connectClaude();
      if (a.dest && SH()) return SH().go(a.dest);
    };
  }
  function insightCards() {
    // Your own next steps (suggestions, approvals, Secretary) first, then the host's insights (explorer, health).
    // qa-qol-2: the Explorer test robot's findings about TribeCode itself (no project: the checkout's .explore/findings.json
    // or an upload) are for the people who make TribeCode, not a beginner's Home: they fold away under one closed line.
    const all = insights.src === 'api' && insights.items ? insights.items : [], seen = new Set();
    const isDev = it => it.source === 'explorer' && !it.project;
    const api = all.filter(it => !isDev(it) && !(it.id === 'h:ollama')), dev = all.filter(isDev);
    const list = [...fallbackInsights(), ...api].filter(it => { const k = String(it.title || '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
    insActs = {};
    const devHtml = dev.length ? `<details class="ai-dev"><summary>Test robot notes (${dev.length}) <span class="faint">· for TribeCode's makers</span></summary><div class="ai-cards">${dev.slice(0, 8).map((it, i) => card(it, 'd' + i)).join('')}</div></details>` : '';
    if (!list.length) return '<p class="ai-cards-empty">Nothing to flag right now.</p>' + devHtml;
    return list.map((it, i) => card(it, 'k' + i)).join('') + devHtml;
  }
  function card(it, key) {
    const [icon, label] = INS[it.kind] || INS.suggestion, run = insightRun(it); if (run) insActs[key] = run;
      return `<div class="ai-card k-${esc(it.kind || 'suggestion')}" data-ins="${esc(it.id || key)}"><div class="ai-card-k">${ico(icon, 13)}<span>${esc(label)}</span></div><b>${esc(it.title)}</b>${it.body ? `<p>${esc(it.body)}</p>` : ''}
        <div class="ai-card-foot">${aiTag()}<span class="ai-card-src">${esc(it.source || '')}${it.at ? ` · ${esc(ago(it.at))}` : ''}</span>${run ? `<button class="btn ai-card-go" data-ai-card-go="${key}">${esc(it.label || (it.action && it.action.label) || 'Open')}</button>` : ''}</div></div>`;
  }
  function bindInsights(root) { root.querySelectorAll('[data-ai-card-go]').forEach(b => b.onclick = () => { const f = insActs[b.dataset.aiCardGo]; if (f) f(); }); }
  function drawInsights() {
    const html = insightCards();
    // v0.26: unchanged cards stay as they are, so an open "Test robot notes" (or anything you're reading) doesn't snap shut
    for (const id of ['#home-ai-cards', '#hub-ins-phone']) { const box = $(id); if (box) { if (box.__html === html && box.childElementCount) { bindInsights(box); continue; } box.__html = html; box.innerHTML = html; bindInsights(box); } }
  }

  // ---------- Code (feat/files-dash: Home parity): the repos you're in, then your code files ----------
  async function renderRepos(el) {
    el.innerHTML = `<div class="hub hub-code"><header class="hub-head">${hubCrumb('Code')}<h1>Code</h1><p class="faint">The repos of every tribe you're in (what changed last and whether everything is saved), then the code files you keep here.</p></header>
      <section class="sec hub-sec"><div class="sec-head"><div><span class="eyebrow">Repos</span><h2>Repos you're in</h2></div></div><div class="hub-repos" id="hub-repos">${reposCache && connected() ? reposHtml(reposCache) : connected() ? '<div class="hub-empty faint">Loading…</div>' : noTribe('Repos live in tribes', 'Each tribe keeps its code in a shared repo. Start a project or join a friend’s, and it shows up here.')}</div></section>
      <section class="sec hub-sec" id="hub-codefiles"></section></div>`;
    subset(el.querySelector('#hub-codefiles'), { idp: 'hc', cat: 'code', title: 'Code files', eyebrow: 'On this device and in your tribes', kinds: ['code', 'site', 'upload'] });
    wireNoTribe(el);
    if (!connected()) return;
    { const box = $('#hub-repos'); if (box && reposCache) bindRepos(box); }
    try { reposCache = (await C.api('/hub/repos')).repos; const box = $('#hub-repos'); if (box && mode === 'repos') { box.innerHTML = reposHtml(reposCache); bindRepos(box); } } catch (e) { const box = $('#hub-repos'); if (box) box.innerHTML = `<div class="hub-empty">${esc(e.message)}</div>`; }
  }
  // ---------- Design (feat/files-dash: Home parity): every canvas and whiteboard, yours on this device and your tribes' ----------
  function renderDesign(el) {
    el.innerHTML = `<div class="hub hub-design" id="hub-design"></div>`;
    subset(el.querySelector('#hub-design'), { idp: 'hd', cat: 'designs', title: 'Design', crumb: hubCrumb('Design'), kinds: ['design', 'whiteboard', 'upload'], h: 'h1', where: true });
  }
  // a Files view showing one kind (Code files, Design), with the same cards, menus and Studio
  function subset(root, o) {
    if (!FV() || !root) return;
    const v = FV().mount(root, {
      scope: 'home', idp: o.idp, title: o.title, eyebrow: o.eyebrow, crumb: o.crumb, h: o.h || 'h2', cardClass: 'dc-card', prefs: 'tribecode.files.' + o.idp, fixedCat: o.cat, loading: connected(),
      where: o.where ? () => [{ key: 'all', label: 'Everywhere' }, { key: 'mine', label: 'Mine' }, ...projects().map(p => ({ key: p.id, label: p.name }))] : null,
      studio: { kinds: o.kinds, note: 'Kept on this device, no tribe needed.' }, groups: fileGroups, alwaysHeads: true,
      create: (k, a) => makeNew(k, a), make: (kind, d) => makeDraft(kind, d), open: openItem, act: actItem, wire: wireThumbs,
    });
    const set = loading => v.set(fileItems(), loading);
    set(connected()); fv = Object.assign(v, { root, loadingNow: connected() });
    if (LF()) LF().ready.then(() => set(fv.loadingNow));
    Promise.all([upList(), o.cat === 'designs' ? designList() : docsList()]).then(() => { fv.loadingNow = false; if (document.contains(root)) set(false); });
  }
  const noTribe = (t, s) => `<div class="hub-empty hub-notribe"><b>${esc(t)}</b><span>${esc(s)}</span><div class="he-acts"><button class="btn primary sm" data-nt="start">${ico('i-plus', 14)}Start a project</button><button class="btn sm" data-nt="join">${ico('i-link', 14)}Join with a link</button></div></div>`;
  function wireNoTribe(el) { el.querySelectorAll('[data-nt]').forEach(b => b.onclick = () => (b.dataset.nt === 'start' ? newProject() : join())); }
  function reposHtml(list) {
    if (!list.length) return '<div class="hub-empty">No projects yet.</div>';
    return list.map(r => { const p = projOf(r.project) || r, g = r.repo;
      const state = !g ? '<span class="faint">No code repository yet</span>' : g.loading ? '<span class="faint">Reading…</span>'
        : [g.branch ? `<code>${esc(g.branch)}</code>` : '', g.ahead ? `${g.ahead} ahead` : '', g.behind ? `${g.behind} behind` : '', g.dirty ? `<span class="hr-dirty">${g.dirty} changed</span>` : (g.branch ? '<span class="hr-clean">clean</span>' : '')].filter(Boolean).join(' · ');
      return `<button class="hub-repo" data-repo="${esc(r.project)}"><span class="hr-face">${PJ() ? PJ().face(p, 'sm') : ''}</span><span class="hr-t"><b>${esc(r.name)}${g && g.name ? ` <span class="faint">· ${esc(g.name)}</span>` : ''}</b><small>${state}</small></span>
        <span class="hr-last">${g && g.last ? `${esc(g.last.subject)} <span class="faint">· ${esc(g.last.author)} · ${esc(ago(g.last.at))}</span>` : g && g.remote ? esc(g.remote) : ''}</span>${ico('i-chev', 14)}</button>`; }).join('');
  }
  function bindRepos(box) { box.querySelectorAll('[data-repo]').forEach(b => b.onclick = () => go(b.dataset.repo, () => App().show('repo'))); }

  // ---------- Files (feat/files-dash): your files everywhere, drawn by filesview.js ----------
  // Sources: your notes, files on this device (localfiles.js), your tribes' docs (GET /api/hub/docs), uploads (yours and
  // your projects'), every project's designs and whiteboards, and each project's website once it is built.
  // Where: Mine (this device + yours in every tribe) · Everything · each tribe by name. Grouped by where they live.
  const FV = () => window.TribeFilesView;
  let fv = null, docsCache = [], designCache = [], siteCache = [], codeCache = { at: 0 };
  const LF = () => window.TribeLocalFiles;
  addEventListener('tribe-local-files', () => { if ((mode === 'docs' || mode === 'design' || mode === 'repos') && document.body.dataset.view === 'hub') refreshFiles(); });
  const FK_CAT = { image: 'pics', audio: 'media', video: 'media', code: 'code', text: 'code', pdf: 'other', model: 'other', archive: 'other', file: 'other' };
  const LK = { doc: ['docs', 'Doc'], sheet: ['sheets', 'Sheet'], slides: ['slides', 'Slides'], whiteboard: ['designs', 'Whiteboard'], design: ['designs', 'Design'], site: ['sites', 'Website'] };
  const myName = () => me().name || ((window.TribeStore && TribeStore.get().name) || 'You');
  const myColor = () => me().color || ((window.TribeStore && TribeStore.get().color) || 'var(--brand)');
  const DEV = { key: 'device', label: 'This device', device: true };
  const privLoc = () => (connected() ? { key: 'me', label: 'Only you' } : DEV);
  const pjLoc = pid => ({ key: pid, label: (projOf(pid) || {}).name || 'Project' });
  const ownerOf = (id, name) => { const m = memberOf(id); return id && (m || name) ? { name: (m && m.name) || name || '?', color: (m && m.color) || 'var(--peer)' } : null; };
  function fileItems() {
    const T = FV().thumb, mine = { name: myName(), color: myColor() }, meId = me().id, out = [];
    for (const n of scratch.notes()) if (n.text && n.text.trim()) {
      const title = noteTitle(n.text);
      out.push({ src: 'note', id: n.id, cat: 'notes', type: 'Note', title, at: n.updated || n.at, owner: mine, loc: privLoc(), mine: true, text: n.text, thumb: T.text(title, n.text.split('\n').slice(1).join('\n')), attrs: `data-mynote="${esc(n.id || '')}"`, acts: ['open', 'duplicate', 'download', 'delete'], exportLabel: 'Download (.md)' });
    }
    if (LF()) for (const x of LF().list()) {
      let cat, type, th;
      if (x.kind === 'file') {
        cat = FK_CAT[x.fkind] || 'other'; type = FK_LABEL[x.fkind] || 'File';
        th = x.fkind === 'image' && x.size < 4 * 1048576 ? T.img('', `data-lthumb="${esc(x.id)}"`) : cat === 'code' && x.size < 256 * 1024 ? T.code('', x.title).replace('<pre>', `<pre data-lcode="${esc(x.id)}">`) : T.icon(cat, `${type} · ${fsize(x.size || 0)}`);
      } else {
        [cat, type] = LK[x.kind] || ['other', 'File'];
        th = x.kind === 'doc' ? T.text(x.title, x.body) : x.kind === 'sheet' ? T.sheet(x.body) : x.kind === 'slides' ? T.deck(x.body, x.title) : x.kind === 'whiteboard' ? T.board(x.elements) : x.kind === 'design' ? T.design(x.nodes) : x.kind === 'site' ? T.site(x.body, x.title) : T.icon(cat);
      }
      out.push({ src: 'local', id: x.id, lk: x.kind, cat, type, title: x.title, at: x.updated, owner: mine, loc: DEV, mine: true, text: typeof x.body === 'string' ? x.body.slice(0, 2000) : '', thumb: th,
        attrs: `data-local="${esc(x.id)}" data-lk="${esc(x.kind)}"`, acts: ['open', 'rename', 'move', 'duplicate', 'download', 'delete'], exportLabel: { doc: 'Download (.md)', slides: 'Download (.md)', sheet: 'Download (.csv)', site: 'Download (.html)' }[x.kind] });
    }
    for (const d of docsCache) {
      const cat = d.kind === 'sheet' ? 'sheets' : d.kind === 'deck' ? 'slides' : 'docs', body = d.excerpt != null ? d.excerpt : d.preview || '';
      out.push({ src: 'doc', id: `${d.project}|${d.slug}`, pid: d.project, slug: d.slug, dk: d.kind || '', cat, type: cat === 'sheets' ? 'Sheet' : cat === 'slides' ? 'Slides' : 'Doc', title: d.title, at: d.at, owner: ownerOf(d.by, d.byName), loc: pjLoc(d.project), mine: !!meId && (d.owner === meId || d.by === meId), text: d.preview || d.snippet || '',
        thumb: cat === 'sheets' ? T.sheet(body) : cat === 'slides' ? T.deck(body, d.title) : T.text(d.title, body, d.img && /^\//.test(d.img) && window.TribeMedia ? window.TribeMedia.url(C.base() + d.img) : ''),
        attrs: `data-gdoc="${esc(d.project)}|${esc(d.slug)}"`, acts: ['open', 'rename', 'move', 'duplicate', 'download', 'delete'], exportLabel: cat === 'sheets' ? 'Download (.md table)' : 'Download (.md)' });
    }
    for (const f of [...(upCache.mine || []), ...(upCache.project || [])]) {
      const cat = FK_CAT[f.kind] || 'other', proj = f.scope === 'project';
      out.push({ src: 'up', id: f.id, f, cat, type: FK_LABEL[f.kind] || 'File', title: f.name, at: f.at, owner: ownerOf(f.by, f.byName), loc: proj ? pjLoc(f.project) : privLoc(), mine: !proj || f.by === meId,
        thumb: f.kind === 'image' && f.size < 4 * 1048576 ? T.img('', `data-thumb="${esc(f.id)}"`) : T.icon(cat, `${FK_LABEL[f.kind] || 'File'} · ${fsize(f.size || 0)}`), attrs: `data-up="${esc(f.id)}"`, acts: ['open', 'download', ...(f.by === meId || me().role === 'host' ? ['delete'] : [])] });
    }
    for (const c of designCache) out.push({ src: c.kind, id: `${c.pid}|${c.id}`, pid: c.pid, rid: c.id, cat: 'designs', type: c.kind === 'board' ? 'Whiteboard' : 'Design', title: c.name || 'Untitled', at: c.updated, loc: pjLoc(c.pid), mine: false,
      thumb: c.kind === 'board' ? T.board(c.elements) : T.design(c.nodes), attrs: `data-gdesign="${esc(c.pid)}|${esc(c.id)}"`, acts: ['open', 'rename', 'download', ...(c.id !== 'main' ? ['delete'] : [])], exportLabel: 'Download (.json)' });
    for (const s of siteCache) out.push({ src: 'site', id: `site|${s.pid}`, pid: s.pid, cat: 'sites', type: 'Website', title: s.title, at: s.at, loc: pjLoc(s.pid), mine: false, thumb: T.site('', s.title), attrs: `data-gsite="${esc(s.pid)}"`, acts: ['open'] });
    return out;
  }
  // Home's sections: this device first, then your private files, then each tribe (in the rail's order)
  function fileGroups(list, where) {
    const order = ['device', 'me', ...projects().map(p => p.id)], by = new Map();
    for (const it of list) { const k = it.loc ? it.loc.key : 'device'; if (!by.has(k)) by.set(k, { key: k, items: [], device: k === 'device', icon: k === 'device' ? 'device' : k === 'me' ? 'notes' : 'tribe' }); by.get(k).items.push(it); }
    return [...by.values()].sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99)).map(g => ({ ...g,
      label: g.key === 'device' ? 'On this device' : g.key === 'me' ? 'Only you' : where === 'mine' ? `Yours in ${(projOf(g.key) || {}).name || 'a tribe'}` : (projOf(g.key) || {}).name || 'A tribe',
      note: g.key === 'device' ? (connected() ? 'Move any of these into a tribe with ⋯ › Move to…' : 'No tribe needed') : '' }));
  }
  function refreshFiles() { if (fv && document.contains(fv.root)) fv.set(fileItems(), fv.loadingNow); }
  function renderDocs(el) {
    if (!FV()) { el.innerHTML = '<div class="hub-empty">Files did not load. Reload the app.</div>'; return; }
    el.innerHTML = `<div class="hub hub-files" id="hub-files"></div>`;   // one + Create in the header, phones too (no second FAB)
    const root = el.querySelector('#hub-files');
    fv = FV().mount(root, {
      scope: 'home', idp: 'dc', title: 'Files', crumb: hubCrumb('Files'), cardClass: 'dc-card', prefs: 'tribecode.files', loading: connected(),
      ids: { search: 'hub-dq', grid: 'hub-docs', create: 'dc-new', menu: 'dc-newmenu' },
      where: () => [{ key: 'mine', label: 'Mine' }, { key: 'all', label: 'Everything' }, ...projects().map(p => ({ key: p.id, label: p.name }))],
      studio: { note: connected() ? 'Made on this device, no tribe needed. Move it into a tribe any time with ⋯ › Move to….' : 'Kept on this device, no tribe needed. Move it into a tribe any time.' },
      groups: fileGroups, alwaysHeads: true,
      create: (k, anchor) => makeNew(k, anchor), make: (kind, d) => makeDraft(kind, d),
      open: it => openItem(it), act: (k, it, anchor, arg) => actItem(k, it, anchor, arg),
      drop: files => uploadFiles(files, connected() ? 'me' : 'local'),
      search: q => { docsQ = q; },
      wire: wireThumbs,
    });
    fv.root = root; fv.loadingNow = connected();
    fv.set(fileItems(), connected());
    if (LF()) LF().ready.then(() => { if (mode === 'docs') refreshFiles(); });
    Promise.all([docsList(), upList(), designList(), siteList()]).then(() => { if (fv) fv.loadingNow = false; if (mode === 'docs') refreshFiles(); });
  }
  function wireThumbs(body) {
    body.querySelectorAll('img[data-lthumb]').forEach(img => thumb({ id: img.dataset.lthumb, local: true }, img));
    body.querySelectorAll('img[data-thumb]').forEach(img => { const f = [...(upCache.mine || []), ...(upCache.project || [])].find(x => x.id === img.dataset.thumb); if (f) thumb(f, img); });
    body.querySelectorAll('pre[data-lcode]').forEach(async pre => { try { const b = LF() && await LF().blob(pre.dataset.lcode); const t = b ? (await b.text()).split('\n').slice(0, 14).join('\n') : ''; if (t.trim()) pre.textContent = t; } catch {} });
  }
  async function makeNew(k, anchor) {
    closeMenus(); if (FV()) FV().closeMenus();
    if (k === 'note') return startNote();
    if (k === 'upload') return connected() ? upMenu(anchor && anchor.isConnected ? anchor : $('#dc-new')) : pickUpload('local');
    if (k === 'template') return templateMenu(anchor && anchor.isConnected ? anchor : $('#dc-new'));
    if (k === 'flint') return FV() && $('#dc-new') ? fv && fv.studio($('#dc-new')) : null;
    if (!LF()) return toast('Files on this device did not load. Reload the app.');
    try {
      const it = k === 'code' ? await LF().createCode('untitled.js') : await LF().create(k);
      if (mode !== 'docs' && mode !== 'design' && mode !== 'repos') open('docs');
      LF().open(it.id); return it;
    } catch (e) { toast(e.message); }
  }
  async function makeDraft(kind, d) {
    if (!LF()) return;
    const it = await LF().create(kind, { title: d.title, body: d.body }); LF().open(it.id); return it;
  }
  // From a template, with no tribe: the company templates as a plain doc on this device (doctpl-data.js)
  function templateMenu(anchor) {
    const L = window.TribeTemplateLib; if (!L || !anchor) return toast('Templates did not load. Reload the app.');
    FV().closeMenus();
    const m = document.createElement('div'); m.className = 'fx-pop fx-menu fx-tpl'; m.id = 'dc-tplmenu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="fx-pop-h"><span class="fx-eyebrow">From a template</span><b>Start from a shape</b></div>` + L.TEMPLATES.filter(t => !t.premium).slice(0, 12).map(t => `<button type="button" role="menuitem" data-tpl="${esc(t.id)}">${FV().icon('template', 15)}<span>${esc(t.title)}</span></button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); m.style.top = `${Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6))}px`; m.style.left = `${Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
    m.querySelectorAll('[data-tpl]').forEach(b => b.onclick = async () => { m.remove(); const t = L.byId(b.dataset.tpl); const it = await LF().create('doc', { title: t.title, body: L.render(t, {}) }); LF().open(it.id); });
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } }, true), 0);
  }
  function openItem(it) {
    if (it.src === 'note') return noteEditor(it.id);
    if (it.src === 'local') return LF().open(it.id);
    if (it.src === 'doc') return go(it.pid, () => openDoc(it.slug));
    if (it.src === 'up') return openFile(it.f);
    if (it.src === 'canvas') return go(it.pid, () => { App().show('canvas'); setTimeout(() => window.TribeCanvas && window.TribeCanvas.open(it.rid), 120); });
    if (it.src === 'board') return go(it.pid, () => window.TribeWhiteboard && window.TribeWhiteboard.open(it.rid));
    if (it.src === 'site') return go(it.pid, () => window.TribeWebsite && window.TribeWebsite.open());
  }
  const saveBlob = (name, blob) => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
  const safeName = t => String(t || 'file').replace(/[\\/:*?"<>|]+/g, '-');
  // a doc moves between tribes as a copy there, then gone here (only once the copy is saved)
  function projectMenu(anchor, skip, cb) {
    FV().closeMenus();
    const list = projects().filter(p => p.id !== skip);
    if (!list.length) return toast('There is no other tribe to move it to.');
    const m = document.createElement('div'); m.className = 'fx-pop fx-menu'; m.id = 'dc-movemenu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="fx-pop-h"><span class="fx-eyebrow">Move to…</span></div>` + list.map(p => `<button type="button" role="menuitem" data-to="${esc(p.id)}">${FV().icon('tribe', 15)}<span>${esc(p.name)}</span></button>`).join('');
    document.body.appendChild(m);
    const r = (anchor && anchor.isConnected ? anchor : $('#dc-new')).getBoundingClientRect(); m.style.top = `${Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6))}px`; m.style.left = `${Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
    m.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { m.remove(); cb(b.dataset.to); });
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } }, true), 0);
  }
  async function actItem(k, it, anchor, arg) {
    try {
      if (it.src === 'local') {
        if (k === 'rename') return LF().rename(it.id, arg);
        if (k === 'move') { const card = document.querySelector(`[data-local="${CSS.escape(it.id)}"] .fx-more`); return LF().moveMenu(anchor && anchor.isConnected ? anchor : card, it.id); }
        if (k === 'duplicate') { await LF().duplicate(it.id); return toast('Duplicated.'); }
        if (k === 'download') return LF().download(it.id);
        if (k === 'delete') { await LF().remove(it.id); return toast('Deleted.'); }
      }
      if (it.src === 'note') {
        if (k === 'duplicate') { await scratch.create(`${it.text}`); refreshFiles(); return toast('Duplicated.'); }
        if (k === 'download') return saveBlob(`${safeName(it.title)}.md`, new Blob([it.text], { type: 'text/markdown' }));
        if (k === 'delete') { scratch.remove(it.id); return toast('Deleted.'); }
      }
      if (it.src === 'doc') {
        const api = (path, o = {}) => C.api(path, { ...o, project: it.pid });
        if (k === 'rename') { await api('/docs/' + encodeURIComponent(it.slug), { method: 'PUT', body: { title: arg, force: true } }); toast('Renamed.'); return docsList().then(refreshFiles); }
        const full = k === 'delete' ? null : (await api('/docs/' + encodeURIComponent(it.slug))).doc;
        if (k === 'download') return saveBlob(`${safeName(full.title)}.md`, new Blob([full.body || ''], { type: 'text/markdown' }));
        if (k === 'duplicate') { await api('/docs', { method: 'POST', body: { title: `${full.title} (copy)`, body: full.body || '', ...(full.kind ? { kind: full.kind } : {}) } }); toast('Duplicated.'); return docsList().then(refreshFiles); }
        if (k === 'move') return projectMenu(anchor, it.pid, async to => {
          try { await C.api('/docs', { method: 'POST', project: to, body: { title: full.title, body: full.body || '', ...(full.kind ? { kind: full.kind } : {}) } }); await api('/docs/' + encodeURIComponent(it.slug), { method: 'DELETE' }); toast(`Moved to ${(projOf(to) || {}).name || 'the tribe'}.`); await docsList(); refreshFiles(); } catch (e) { toast(e.message); }
        });
        if (k === 'delete') { await api('/docs/' + encodeURIComponent(it.slug), { method: 'DELETE' }); docsCache = docsCache.filter(d => !(d.project === it.pid && d.slug === it.slug)); return toast('Deleted.'); }
      }
      if (it.src === 'up') {
        if (k === 'download') { const u = await blobUrl(it.f); const a = document.createElement('a'); a.href = u; a.download = it.f.name; document.body.appendChild(a); a.click(); a.remove(); return; }
        if (k === 'delete') { await C.api('/uploads/' + encodeURIComponent(it.f.id), { method: 'DELETE' }); await upList(); return toast('Deleted.'); }
      }
      if (it.src === 'canvas' || it.src === 'board') {
        const base = it.src === 'board' ? '/whiteboard/' : '/canvas/', api = (o = {}) => C.api(base + encodeURIComponent(it.rid), { ...o, project: it.pid });
        if (k === 'rename') { await api({ method: 'PATCH', body: { name: arg } }); return designList().then(refreshFiles); }
        if (k === 'download') { const r = await api(); return saveBlob(`${safeName(it.title)}.${it.src === 'board' ? 'whiteboard' : 'design'}.json`, new Blob([JSON.stringify(r.board || r.file, null, 2)], { type: 'application/json' })); }
        if (k === 'delete') { await api({ method: 'DELETE' }); designCache = designCache.filter(c => !(c.pid === it.pid && c.id === it.rid)); return toast('Deleted.'); }
      }
    } catch (e) { toast(e.message); if (k === 'delete') throw e; }
  }
  function wireNotes(root) {
    root.querySelectorAll('#hub-note-new').forEach(b => b.onclick = startNote);
    root.querySelectorAll('[data-mynote]').forEach(b => b.onclick = () => { if (mode !== 'docs') open('docs'); setTimeout(() => noteEditor(b.dataset.mynote), 60); });
    const all = root.querySelector('#hub-notes-all'); if (all) all.onclick = () => open('docs');
  }
  async function docsList() {
    if (!connected()) { docsCache = []; return; }
    try { const { docs } = await C.api('/hub/docs'); docsCache = docs || []; } catch {}
  }
  // every project's designs and whiteboards, with their shapes for the thumbnails (at most 24 opened)
  async function designList() {
    if (!connected()) { designCache = []; return; }
    const out = [];
    await Promise.all(projects().slice(0, 12).map(async p => {
      try { const { files } = await C.api('/canvas', { project: p.id }); for (const f of files || []) if (f.count || f.id !== 'main') out.push({ kind: 'canvas', pid: p.id, ...f }); } catch {}
      try { const { boards } = await C.api('/whiteboard', { project: p.id }); for (const b of boards || []) if (b.count || b.id !== 'main') out.push({ kind: 'board', pid: p.id, ...b }); } catch {}
    }));
    await Promise.all(out.slice(0, 24).map(async c => { try { const r = await C.api((c.kind === 'board' ? '/whiteboard/' : '/canvas/') + encodeURIComponent(c.id), { project: c.pid }); if (c.kind === 'board') c.elements = (r.board || {}).elements; else c.nodes = (r.file || {}).nodes; } catch {} }));
    designCache = out;
  }
  // each project's website, once it has been built
  async function siteList() {
    if (!connected()) { siteCache = []; return; }
    const out = [];
    await Promise.all(projects().slice(0, 12).map(async p => { try { const w = await C.api(`/projects/${encodeURIComponent(p.id)}/website`); if (w && w.built) out.push({ pid: p.id, title: ((w.fields || {}).headline) || `${p.name} website`, at: w.built.at }); } catch {} }));
    siteCache = out;
  }

  // ---------- uploads: any kind of file, yours or a project's (server/uploads.js) ----------
  const FK_IC = { image: 'i-photo', audio: 'i-mic', video: 'i-play', pdf: 'i-doc', model: 'i-box', archive: 'i-folder', code: 'i-git', text: 'i-doc', file: 'i-clip' };
  const FK_LABEL = { image: 'Picture', audio: 'Audio', video: 'Video', pdf: 'PDF', model: '3D model', archive: 'Archive', code: 'Code', text: 'Text', file: 'File' };
  let upCache = { mine: [], project: [], max: 50 * 1048576 };
  const blobs = new Map();   // id -> object URL (thumbnails and the viewer)
  const fsize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const authH = () => { const t = ((window.TribeStore && window.TribeStore.get().server) || {}).token, pid = C.project && C.project(); return { ...(t ? { Authorization: 'Bearer ' + t } : {}), ...(pid ? { 'X-Project': pid } : {}) }; };
  async function upList() { if (!connected()) { upCache = { mine: [], project: [], max: upCache.max }; return; } try { upCache = await C.api('/uploads?all=1'); } catch {} }
  async function blobUrl(f) {
    if (blobs.has(f.id)) return blobs.get(f.id);
    if (f.local) { const b = LF() && await LF().blob(f.id); if (!b) throw new Error('That file is gone from this device.'); const u = URL.createObjectURL(b.type || !f.type ? b : new Blob([b], { type: f.type })); blobs.set(f.id, u); return u; }
    const r = await fetch(C.base() + '/api/uploads/' + encodeURIComponent(f.id) + '/raw', { headers: authH() });
    if (!r.ok) throw new Error('Could not open that file.');
    const u = URL.createObjectURL(await r.blob()); blobs.set(f.id, u); return u;
  }
  async function thumb(f, img) { try { img.src = await blobUrl(f); } catch { img.replaceWith(Object.assign(document.createElement('span'), { className: 'dc-fk', innerHTML: ico('i-photo', 30) })); } }
  async function uploadFiles(files, scope) {
    if (scope === 'local' || !connected()) {   // feat/setup-local: no tribe needed, kept on this device
      if (!LF()) return toast('Files on this device did not load. Reload the app.');
      const made = await LF().addFiles(files);
      if (made.length) toast(made.length > 1 ? `${made.length} files kept on this device.` : `${made[0].title} is kept on this device.`);
      if (mode === 'docs') refreshFiles(); return;
    }
    const pid = C.project && C.project();
    for (const file of files) {
      if (file.size > upCache.max) { toast(`${file.name} is over ${Math.round(upCache.max / 1048576)} MB.`); continue; }
      if (!file.size) { toast(`${file.name} is empty.`); continue; }
      toast(`Uploading ${file.name}…`);
      try {
        const r = await fetch(`${C.base()}/api/uploads?name=${encodeURIComponent(file.name)}&scope=${scope}`, { method: 'POST', headers: { ...authH(), 'Content-Type': 'application/octet-stream', ...(scope === 'project' && pid ? { 'X-Project': pid } : {}) }, body: file });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Upload failed');
      } catch (e) { toast(e.message); continue; }
    }
    toast(files.length > 1 ? `${files.length} files added.` : 'Added to your files.');
    await upList(); if (mode === 'docs') refreshFiles();
  }
  function pickUpload(scope) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.id = 'dc-file';
    inp.onchange = () => { const fs = [...inp.files]; inp.remove(); if (fs.length) uploadFiles(fs, scope); };
    inp.style.display = 'none'; document.body.appendChild(inp); inp.click();
  }
  const curPj = () => { const pid = C.project && C.project(); return pid ? projOf(pid) : null; };
  function closeMenus() { document.querySelectorAll('.dc-menu:not(.lf-menu),.dc-sheet-wrap').forEach(x => x.remove()); }
  // desktop: Upload -> to my files / to the current project
  function upMenu(anchor) {
    closeMenus(); const pj = curPj(), r = anchor.getBoundingClientRect();
    const m = document.createElement('div'); m.className = 'dc-menu'; m.id = 'dc-upmenu'; m.setAttribute('role', 'menu');
    m.style.top = `${r.bottom + 6}px`; m.style.left = `${Math.max(8, r.left)}px`;
    m.innerHTML = `<button data-scope="local" role="menuitem">${ico('i-box', 16)}<span><b>On this device</b><small>Works offline · move it later</small></span></button><button data-scope="me" role="menuitem">${ico('i-users', 16)}<span><b>To my files</b><small>Only you</small></span></button>${pj ? `<button data-scope="project" role="menuitem">${ico('i-folder', 16)}<span><b>To ${esc(pj.name)}</b><small>Everyone in the project</small></span></button>` : ''}`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { closeMenus(); pickUpload(b.dataset.scope); });
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  }
  // open a file: a full-screen viewer with a preview when the browser can show it, Download and Delete
  async function openFile(f) {
    closeMenus(); const me = (C.state && C.state().me) || {}, canDel = f.local || f.by === me.id || me.role === 'host';
    const w = document.createElement('div'); w.className = 'fv-wrap'; w.id = 'fv';
    w.innerHTML = `<div class="fv" role="dialog" aria-label="${esc(f.name)}">
      <header class="fv-top"><button class="fv-x" id="fv-close" aria-label="Close">${ico('i-x', 22)}</button><span class="fv-t"><b>${esc(f.name)}</b><small>${esc(FK_LABEL[f.kind] || 'File')} · ${esc(fsize(f.size))} · ${esc(f.byName || '')} · ${esc(ago(f.at))}</small></span>
        ${f.local ? `<button class="btn fv-mv" id="fv-mv">${ico('i-folder', 15)}Move to…</button>` : ''}<a class="btn fv-dl" id="fv-dl" download="${esc(f.name)}">${ico('i-upload', 15)}Download</a>${canDel ? `<button class="btn fv-del" id="fv-del">Delete</button>` : ''}</header>
      <div class="fv-body" id="fv-body"><span class="faint">Opening…</span></div></div>`;
    document.body.appendChild(w);
    const close = () => { w.remove(); document.removeEventListener('keydown', key); }, key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key); $('#fv-close').onclick = close; w.onclick = e => { if (e.target === w) close(); };
    const del = $('#fv-del'); if (del) del.onclick = async () => {
      if (!del.classList.contains('arm')) { del.classList.add('arm'); del.textContent = 'Tap again to delete'; setTimeout(() => { if (del.isConnected) { del.classList.remove('arm'); del.textContent = 'Delete'; } }, 3000); return; }
      try { if (f.local) await LF().remove(f.id); else await C.api('/uploads/' + encodeURIComponent(f.id), { method: 'DELETE' }); toast('Deleted.'); close(); await upList(); if (mode === 'docs') refreshFiles(); } catch (e) { toast(e.message); }
    };
    const mvb = $('#fv-mv'); if (mvb) mvb.onclick = () => { LF().moveMenu(mvb, f.id); const watch = e => { if (e.detail && e.detail.id === f.id) { removeEventListener('tribe-local-moved', watch); close(); } }; addEventListener('tribe-local-moved', watch); };
    let url; try { url = await blobUrl(f); } catch (e) { $('#fv-body').innerHTML = `<span class="faint">${esc(e.message)}</span>`; return; }
    $('#fv-dl').href = url;
    const body = $('#fv-body'); if (!body) return;
    if (f.kind === 'image') body.innerHTML = `<img src="${url}" alt="${esc(f.name)}">`;
    else if (f.kind === 'video') body.innerHTML = `<video src="${url}" controls playsinline></video>`;
    else if (f.kind === 'audio') body.innerHTML = `<div class="fv-audio">${ico('i-mic', 40)}<audio src="${url}" controls></audio></div>`;
    else if (f.kind === 'pdf') body.innerHTML = `<iframe src="${url}" title="${esc(f.name)}"></iframe>`;
    else if ((f.kind === 'code' || f.kind === 'text') && f.size < 512 * 1024 && /^text\//.test(f.type)) { const t = await (await fetch(url)).text(); body.innerHTML = `<pre class="fv-pre">${esc(t)}</pre>`; }
    else if (f.kind === 'model' && window.TribeViewers && window.TribeViewers.kindOf(f.name) === 'model') {
      body.innerHTML = `<div class="fv-none">${ico('i-box', 44)}<b>3D model</b><span>Spin it around in the 3D viewer.</span><button class="btn primary" id="fv-3d">Open in 3D</button></div>`;
      $('#fv-3d').onclick = () => { close(); window.TribeViewers.open({ name: f.name, src: url, size: f.size, kind: 'model' }); };
    }
    else body.innerHTML = `<div class="fv-none">${ico(FK_IC[f.kind] || 'i-clip', 44)}<b>${esc(FK_LABEL[f.kind] || 'File')}</b><span>No preview for this kind of file. Download it to open it.</span></div>`;
  }

  // ---------- Work on Home (feat/files-dash: Home parity): your tasks across every tribe, above the gigs ----------
  let myTasks = { at: 0, list: [] };
  async function loadMyTasks() {
    if (!connected() || Date.now() - myTasks.at < 15000) return myTasks.list;
    const meId = me().id, mine = (C.state().members || []).filter(m => m.role === 'agent' && m.owner === meId).map(m => m.id), out = [];
    await Promise.all(projects().slice(0, 12).map(async p => { try { const { tasks } = await C.api('/tasks', { project: p.id }); for (const k of tasks || []) if (k.status !== 'done' && (k.assignee === meId || mine.includes(k.assignee))) out.push({ ...k, pid: p.id }); } catch {} }));
    const rank = { doing: 0, review: 1, backlog: 2 };
    myTasks = { at: Date.now(), list: out.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || String(a.due || '9').localeCompare(String(b.due || '9'))) };
    return myTasks.list;
  }
  function myTasksHtml(list) {
    const rows = list.slice(0, 8).map(k => { const p = projOf(k.pid) || {};
      return `<button type="button" class="hmt-row" data-mytask="${esc(k.pid)}|${esc(k.id)}"><span class="hmt-st s-${esc(k.status)}">${esc(k.status === 'doing' ? 'Doing' : k.status === 'review' ? 'Review' : 'To do')}</span><b>${esc(k.title)}</b>${k.due ? `<small>Due ${esc(k.due)}</small>` : ''}<span class="hmt-pj">${esc(p.name || 'A tribe')}</span>${ico('i-chev', 14)}</button>`; }).join('');
    return `<section class="hub-mytasks" id="hub-mytasks">${hubCrumb('Work')}<div class="sec-head"><span class="eyebrow">Your tasks · across your tribes</span><h2>${list.length ? `${list.length} on your plate` : 'Nothing on your plate'}</h2></div>
      ${rows ? `<div class="hmt-list">${rows}</div>` : `<p class="faint">When a task in any tribe is assigned to you or your AI, it shows up here.</p>`}</section>`;
  }
  let mtBusy = false;
  async function paintMyTasks() {
    const sec = document.getElementById('view-work'); if (!sec || document.body.dataset.view !== 'work' || mtBusy) return;
    if (!connected()) { if (!sec.querySelector('.hub-crumb')) sec.insertAdjacentHTML('afterbegin', hubCrumb('Work')); return; }
    mtBusy = true; const list = await loadMyTasks(); mtBusy = false;
    const old = sec.querySelector('#hub-mytasks'), html = myTasksHtml(list);
    if (old) { if (old.outerHTML.length !== html.length) old.outerHTML = html; } else sec.insertAdjacentHTML('afterbegin', html);
    sec.querySelectorAll('[data-mytask]').forEach(b => b.onclick = () => { const [pid, id] = b.dataset.mytask.split('|'); jump({ project: pid, ref: { type: 'task', id } }); });
  }
  // the Agent fleet (agentshub.js) on Home says where it is too
  function fleetCrumb() { const sec = document.getElementById('view-agents-hub'); if (sec && document.body.dataset.view === 'agents-hub' && document.body.dataset.scope === 'global' && !sec.querySelector(':scope > .hub-crumb')) sec.insertAdjacentHTML('afterbegin', hubCrumb('Agent fleet')); }
  { const seen = new WeakSet(); let t = null;
    const kick = () => { clearTimeout(t); t = setTimeout(() => { const sec = document.getElementById('view-agents-hub'); if (!sec) return; if (!seen.has(sec)) { seen.add(sec); new MutationObserver(kick).observe(sec, { childList: true }); } fleetCrumb(); }, 40); };
    new MutationObserver(kick).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'data-scope'] }); setTimeout(kick, 0); }
  { const seen = new WeakSet(); let t = null;
    const kick = () => { clearTimeout(t); t = setTimeout(() => {
      const sec = document.getElementById('view-work'); if (!sec) return;
      if (!seen.has(sec)) { seen.add(sec); new MutationObserver(kick).observe(sec, { childList: true }); }   // talent.js redraws the whole section
      if (document.body.dataset.view === 'work' && !sec.querySelector('#hub-mytasks, .hub-crumb')) paintMyTasks();
    }, 60); };
    new MutationObserver(kick).observe(document.body, { attributes: true, attributeFilter: ['data-view'] }); setTimeout(kick, 0); }

  // ---------- actions ----------
  async function go(pid, then) {
    if (!pid || !projOf(pid)) return toast('You are not in that project.');
    if (PJ().current() !== pid) { await PJ().switchTo(pid); await new Promise(r => setTimeout(r, 250)); }   // the project's own reload lands first
    then && then();
  }
  // Open a doc after a project switch: Docs' own load() may still reopen the previous doc, so check once more.
  function openDoc(slug) {
    App().show('docs'); const D = window.TribeDocs;
    setTimeout(() => D.open(slug), 120);
    setTimeout(() => { const c = D.current && D.current(); if (!c || c.slug !== slug) D.open(slug); }, 800);
  }
  function flash(sel) { setTimeout(() => { const el = document.querySelector(sel); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); } }, 450); }
  function jump(it) {
    const ref = it.ref || {};
    return go(it.project, () => {
      if (ref.type === 'doc') openDoc(ref.id);
      else if (ref.type === 'task') { App().show('tasks'); flash(`.task[data-id="${CSS.escape(ref.id)}"]`); }
      else if (ref.type === 'commit') App().show('repo');
      else if (ref.type === 'proposal' || ref.type === 'decision') App().show('board');
      else if (ref.type === 'plan') { if (window.TribeFlow && window.TribeFlow.openUpdates) window.TribeFlow.openUpdates(); else App().show('home'); }
      else if (ref.type === 'secretary') { if (window.TribeSecretary) window.TribeSecretary.open(); }
      else if (ref.type === 'project') App().show('home');
      else { App().show('chat'); if (ref.id) flash(`#chat-list [data-id="${CSS.escape(ref.id)}"]`); }
    });
  }
  async function sugGo(id) {
    const all = [...(data.hero || []), ...(data.more || []), ...(data.suggestions || [])], x = all.find(s => s.id === id); if (!x) return;
    if (x.kind === 'approval' && SH()) { try { const { approvals } = await C.api('/approvals', { project: x.project }); const a = (approvals || []).find(y => y.id === x.approval); if (a) return SH().previewApproval(a, () => load(true)); } catch {} return go(x.project, () => App().show('requests')); }
    if (x.vote) return jump({ project: x.project, ref: { type: 'chat', id: x.vote.id } });
    if (x.task && !x.action) return jump({ project: x.project, ref: { type: 'task', id: x.task } });
    const a = x.action || {};
    if (a.do === 'take' || a.do === 'assign') {
      try { await C.api(`/tasks/${encodeURIComponent(a.task)}`, { method: 'PATCH', project: x.project, body: { assignee: a.do === 'take' ? me().id : a.member, ...(a.do === 'take' ? { status: 'doing' } : {}) } }); toast(a.do === 'take' ? 'It is yours. Moved to Doing.' : 'Handed over.'); dismiss(id, true); }
      catch (e) { toast(e.message); }
      return;
    }
    if (a.do === 'workshop') return window.TribeWorkshop && window.TribeWorkshop.open(a.id);
    if (a.do === 'open') return jump({ project: x.project, ref: a.ref || { type: 'project' } });
    return jump({ project: x.project, ref: { type: 'project' } });
  }
  async function dismiss(id, quiet) {
    const el = document.querySelector(`[data-sug="${CSS.escape(id)}"]`); if (el) el.remove();
    try { await C.api('/hub/dismiss', { method: 'POST', body: { id } }); } catch (e) { if (!quiet) toast(e.message); }
    load(true);
  }
  function search(prefill = '') {
    if (!window.TribePalette) return;
    window.TribePalette.open();
    if (prefill) { const i = $('#pal-input'); if (i) { i.value = prefill; i.dispatchEvent(new Event('input', { bubbles: true })); } }
  }
  function host() {
    if (!connected() && window.TribeLocalSetup) return window.TribeLocalSetup.start();   // feat/setup-local: instant, on this device; where it lives comes last
    if (App().fresh && App().fresh() && App().startFirst) return App().startFirst();
    if (window.TribeHost && window.TribeHost.isDesktop && App().hostHere) return App().hostHere();
    if (window.TribeHost && window.TribeHost.isDesktop) return App().openInvite();
    window.open((window.TribeWeb && window.TribeWeb.RELEASES) || 'https://github.com/orionopenwow/TribeCode/releases/latest', '_blank', 'noopener');
  }
  const join = () => window.TribeSettings && window.TribeSettings.joinPrompt();
  function newProject() { if (!connected()) return window.TribeLocalSetup ? window.TribeLocalSetup.start() : canHost() ? host() : join(); PJ().openNew(); }

  function bind(el) {
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
    el.querySelectorAll('[data-pj-go]').forEach(b => b.onclick = () => { const id = b.dataset.pjGo; if (PJ().current() === id) App().show('home'); else PJ().switchTo(id, 'home'); });
    on('#hub-new', newProject); on('#hub-instant', instant); on('#hub-join', join); on('#hub-host', host); on('#hub-resume', resume);
    on('#hub-cc', () => App().connectClaude());
    on('#hub-tour', () => window.TribeFlintTour && window.TribeFlintTour.start());
    on('#hub-sug-more', () => { sugOpen = !sugOpen; render(); });
    on('#hub-feed-more', () => { feedOpen = !feedOpen; render(); });
    // Ask
    const form = el.querySelector('#hub-ask-form'), ta = el.querySelector('#hub-ask-in');
    if (form) form.onsubmit = e => { e.preventDefault(); sendAsk(); };
    if (ta) { ta.oninput = () => { ask.draft = ta.value; }; ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendAsk(); } }; }
    el.querySelectorAll('[data-ask-to]').forEach(b => b.onclick = () => { ask.to = b.dataset.askTo; lsSet('tribecode.home.askTo', ask.to); render(); const t = $('#hub-ask-in'); if (t) t.focus(); });
    const ans = el.querySelector('#hub-answer'); if (ans) bindAnswer(ans);
    // Get started
    on('#hub-start-x', () => { lsSet(SKEY, true); render(); });
    on('#hub-start-ai', startAI); on('#hub-start-agent', startAgent);
    on('#hub-start-new', () => newProject());
    on('#hub-start-save', () => { scratch.add(start.text); Object.assign(start, { text: '', error: '' }); render(); toast('Saved to your scratchpad'); });
    on('#hub-start-clear', () => { Object.assign(start, { text: '', error: '', status: '' }); render(); });
    el.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { if (!b.classList.contains('done')) stepGo(b.dataset.step); });
    // Scratchpad + Refine with AI
    on('#hub-refine', refineGo); on('#hub-refine-replace', () => refineApply(true)); on('#hub-refine-keep', () => refineApply(false));
    el.querySelectorAll('[data-feed]').forEach(b => b.onclick = () => { const it = ((data && data.feed) || []).find(x => x.id === b.dataset.feed); if (it) jump(it); });
    el.querySelectorAll('[data-note]').forEach(b => b.onclick = () => { const n = ((data && data.notes) || []).find(x => x.id === b.dataset.note); if (n) jump(n); });
    el.querySelectorAll('[data-sug-go]').forEach(b => b.onclick = () => sugGo(b.dataset.sugGo));
    el.querySelectorAll('[data-sug-x]').forEach(b => b.onclick = () => dismiss(b.dataset.sugX));
    el.querySelectorAll('[data-fleet]').forEach(b => b.onclick = () => fleetGo(b.dataset.fleet, b.dataset.id));
    wireNotes(el);
    const tb = el.querySelector('#hub-ptop'); if (tb) {   // phone Home's own top bar: + · TribeCode ⌄ · bell
      tb.querySelector('#hpt-me').onclick = () => window.TribeMobile && window.TribeMobile.myProfile && window.TribeMobile.myProfile();   // you: top left of Home (start/join lives in the projects list)
      tb.querySelector('#hpt-brand').onclick = () => window.TribeMobile && window.TribeMobile.projectsSheet ? window.TribeMobile.projectsSheet() : document.body.classList.add('drawer-open');   // a list of your projects
      tb.querySelector('#hpt-bell').onclick = () => window.TribeNotify && window.TribeNotify.openInbox && window.TribeNotify.openInbox();
    }
    const ins = el.querySelector('#hub-ins-phone'); if (ins) bindInsights(ins);
  }
  function fleetGo(kind, id) {
    if (kind === 'agent' && window.TribePeople && id) return window.TribePeople.open(id);
    if (kind === 'secretary' && window.TribeSecretary) return window.TribeSecretary.open();
    if (kind === 'autopilot' || kind === 'preview') { const l = ((data && data.fleet && data.fleet.loops) || []).find(x => x.id === kind), pid = l && (l.projects || [])[0]; if (pid) return go(pid, () => (kind === 'preview' && window.TribePreview && window.TribePreview.open ? window.TribePreview.open() : App().show('repo'))); if (kind === 'autopilot') return go(PJ().current(), () => App().show('repo')); }
    if (window.TribeAgentsHub) window.TribeAgentsHub.open();
  }
  // The hub's search box types straight into Ctrl K.
  document.addEventListener('keydown', e => {
    if (document.body.dataset.view !== 'hub' || mode !== 'home' || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    if (e.target.closest && e.target.id !== 'pal-input' && e.target.closest('input, textarea, select, [contenteditable="true"], .modal:not(.hidden), .sh-pop, .pf-menu')) return;
    if (!$('#palette').classList.contains('hidden')) return;
    e.preventDefault(); search(e.key);
  });

  // =====================================================================
  // Right panel: helpers as present entities (under people and agents), and the global scratchpad.
  // On Home (body.global) it is yours: you, Connect your AI, Share my hub link, Invite friends, AI Insights
  // (the room's people and the scratchpad step aside: Home shows the scratchpad itself).
  // =====================================================================
  const HKEY = 'tribecode.room.helpersOpen';
  function panel() {
    const pane = $('#room-pane'); if (!pane) return;
    let box = $('#room-helpers');
    if (!box) { box = document.createElement('div'); box.id = 'room-helpers'; box.className = 'room-helpers'; const ag = $('#room-agents'); (ag || $('#room-list')).after(box); }
    const f = data && data.fleet;
    if (!connected() || !f) { box.innerHTML = ''; }
    else {
      const m = f.models || {}, loops = f.loops || [], sec2 = loops.find(l => l.id === 'secretary'), auto = loops.find(l => l.id === 'autopilot');
      // One compact row of pills (feat/sidebar-widgets): a dot says on / off, the detail is in the tooltip (and for screen readers).
      const row = (key, glyph, name, what, on) => { const plain = String(what).replace(/<[^>]+>/g, ''); return `<button class="hp-pill ${on ? 'on' : ''}" data-helper="${key}" title="${esc(name)} · ${esc(plain)}"><span class="hp-dot" aria-hidden="true"></span>${ico(glyph, 15)}<span class="hp-n">${esc(name)}</span><span class="sr-only">: ${esc(plain)}</span></button>`; };
      const rows = [
        sec2 ? row('secretary', 'i-quill', 'Secretary', `${sec2.on ? `<span class="ok">${esc(sec2.state)}</span>` : 'off'}${sec2.last ? ` · ${esc(ago(sec2.last))}` : ''}`, sec2.on) : '',
        row('flint', 'i-flint', 'Flint', m.online ? '<span class="ok">ready</span> · local model on' : 'basic mode · no local model', !!m.online),   // feat/flint: the built-in helper (was "Local model")
        auto ? row('autopilot', 'i-git', 'Autopilot', auto.on ? `<span class="ok">on</span> · ${esc(auto.state.replace(/^on /, ''))}` : 'off', auto.on) : '',
        computeRow(row),
      ].join('');
      const open = lsGet(HKEY, false) === true,   /* simple right panel: folded to one line unless you open it */ nOn = (rows.match(/class="hp-pill on"/g) || []).length;   // collapsible, remembered
      box.innerHTML = `<button class="hp-head" id="helpers-toggle" aria-expanded="${open}" aria-controls="hp-pills"><span class="hp-t">⚙️ Background helpers</span><span class="hp-sum">${nOn ? `${nOn} on` : 'all off'}</span>${ico('i-chev', 14)}</button><div class="hp-pills" id="hp-pills">${rows}</div>`;
      box.classList.toggle('closed', !open);
      box.querySelector('#helpers-toggle').onclick = () => { const o = box.classList.contains('closed'); lsSet(HKEY, o); box.classList.toggle('closed', !o); box.querySelector('#helpers-toggle').setAttribute('aria-expanded', String(o)); };
      box.querySelectorAll('[data-helper]').forEach(r => r.onclick = () => r.dataset.helper === 'compute' ? computeSheet() : r.dataset.helper === 'flint' && window.TribeFlint ? window.TribeFlint.focus() : fleetGo(r.dataset.helper));
    }
    let pad = $('#room-scratch');   // the scratchpad is gone: one quiet "Start a note" that lands in your docs
    if (!pad) { pad = document.createElement('div'); pad.id = 'room-scratch'; pad.className = 'room-note'; const cc = $('#cc-connect'); cc.after(pad);
      pad.innerHTML = `<button class="room-slim" id="room-note-new" title="A new note in your docs">${ico('i-plus', 16)}<span>Start a note</span></button>`;
      pad.querySelector('#room-note-new').onclick = startNote; }
    pad.classList.toggle('hidden', document.body.dataset.view === 'hub');
    homePanel();
  }
  // ---------- Shared compute: a quiet helper, only once a project has a code repository and more than one person ----------
  let cmp = { mine: { on: false }, helpers: [], at: 0 };
  async function loadCompute(force) { if (!connected() || (!force && Date.now() - cmp.at < 30000)) return; cmp.at = Date.now(); try { cmp = { ...(await C.api('/compute')), at: Date.now() }; panel(); } catch {} }
  C.on('ws', m => { if (m.type === 'compute') loadCompute(true); });
  let pSoon = null; const panelSoon = () => { clearTimeout(pSoon); pSoon = setTimeout(panel, 300); };   // members / repo changed: the Shared compute row may now apply
  ['projects', 'project', 'presence'].forEach(e => C.on(e, panelSoon));
  function computeRow(row) {
    const p = PJ() && PJ().cur && PJ().cur(); if (!p || !p.hasRepo) return '';
    const people = (p.members || []).filter(x => x.role !== 'agent' && x.role !== 'spectator').length; if (people < 2) return '';
    loadCompute();
    const n = cmp.helpers.length, on = cmp.mine && cmp.mine.on;
    return row('compute', 'i-zap', 'Shared compute', on ? `<span class="ok">lending</span>${n > 1 ? ` · ${n} computers` : ''}` : n ? `${n} computer${n === 1 ? '' : 's'} lending` : 'off', on || n > 0);
  }
  function computeSheet() {
    const m = $('#invite-modal'), body = $('#invite-body'); m.classList.remove('hidden');
    const on = cmp.mine && cmp.mine.on, cores = navigator.hardwareConcurrency || null;
    body.innerHTML = `<span class="eyebrow">Helpers</span><h2>Shared compute</h2>
      <p class="lead">Lend this computer to the tribe for heavy code work: builds, test runs and code analysis. Work only comes from this tribe's repos, runs on a clean copy, and you can stop any time.</p>
      <div class="cmp-row"><span><b>Lend this computer</b><small>${cores ? `${cores} cores` : 'When it\'s on and TribeCode is open'}</small></span><button class="toggle set-toggle" role="switch" id="cmp-toggle" aria-checked="${!!on}" aria-label="Lend this computer"><span class="switch"></span></button></div>
      <div class="cmp-list">${cmp.helpers.length ? cmp.helpers.map(h => `<div class="cmp-h"><span class="cmp-dot ${h.online ? 'on' : ''}"></span><b>${esc(h.name)}</b><small>${h.cores ? `${h.cores} cores` : ''}${h.online ? ' · online' : ' · away'}</small></div>`).join('') : '<p class="faint">Nobody is lending yet.</p>'}</div>
      <p class="faint cmp-note">Lenders show up here for the tribe. Splitting big builds across them comes next.</p>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Done</button></div>`;
    body.querySelector('[data-close]').onclick = () => m.classList.add('hidden');
    $('#cmp-toggle').onclick = async () => { try { cmp = { ...(await C.api('/compute', { method: 'PUT', body: { on: !on, cores } })), at: Date.now() }; panel(); computeSheet(); } catch (e) { toast(e.message); } };
  }

  // ---------- Home's right panel ----------
  const IKEY = 'tribecode.home.insightsOpen';
  function homePanel() {
    const pane = $('#room-pane'); if (!pane) return;
    const make = (id, cls, after) => { let e = $('#' + id); if (!e) { e = document.createElement('div'); e.id = id; e.className = cls; after.after(e); } return e; };
    const meBox = make('home-me', 'home-me', $('.room-head', pane) || pane.firstElementChild);
    const share = make('home-share', 'home-share', $('#cc-connect'));
    const insBox = make('home-insights', 'home-insights', share);
    const on = connected(), m = me();
    let nm = m.name; if (!nm) try { nm = (JSON.parse(localStorage.getItem('tribecode.settings.v1') || '{}').name); } catch {}
    nm = nm || 'You';
    meBox.innerHTML = `<h6>Your home</h6><div class="person on"><div class="avatar" style="width:30px;height:30px;font-size:12px;background:${esc(m.color || 'var(--accent)')};color:#fff">${esc(([...nm.trim()][0] || '').toUpperCase())}<span class="st"></span></div><div><span>${esc(nm)} <span class="faint">(you)</span></span><div class="what">${on ? `<span class="ok">online</span> · Home` : 'on this device · not in a tribe yet'}</div></div></div>`;
    share.innerHTML = '';   // Share my hub link / Invite a friend moved out of the panel: the hero's Invite a friend does it
    const open = lsGet(IKEY, true) !== false;
    if (!insBox.dataset.built) {
      insBox.dataset.built = '1';
      insBox.innerHTML = `<button class="ai-ins-head" id="home-ins-toggle" aria-expanded="${open}" aria-controls="home-ai-cards"><span>AI Insights</span>${ico('i-chev', 15)}</button><div class="ai-cards" id="home-ai-cards"></div>`;
      $('#home-ins-toggle').onclick = () => { const o = !(lsGet(IKEY, true) !== false); lsSet(IKEY, o); insBox.classList.toggle('closed', !o); $('#home-ins-toggle').setAttribute('aria-expanded', String(o)); };
    }
    insBox.classList.toggle('closed', !open);
    if (document.body.dataset.view === 'hub') loadInsights(); else drawInsights();
  }
  const shareState = { link: '' };
  async function shareLink() {
    if (!connected()) {
      toast('Your hub link appears once you are in a tribe: host one on this computer or join a friend.');
      return window.TribeHost && window.TribeHost.isDesktop ? host() : join();
    }
    try {
      const { invite } = await C.api('/invites', { method: 'POST', body: { hours: 24, maxUses: 5, role: 'builder' } });
      let base = C.base(), site = null;
      try { const h = await C.api('/health'); const pick = (h.lan || [])[0]; site = h.site || null; if (pick && (pick.kind === 'public' || /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(base))) base = pick.url; } catch {}
      const link = site && /^https:/.test(base) ? `${site}/app/go.html#s=${encodeURIComponent(base)}&c=${encodeURIComponent(invite.code)}` : `${base}/join/${invite.code}`;
      shareState.link = link; homePanel();
      try { await navigator.clipboard.writeText(link); toast('Hub link copied. It works for 24 hours, for up to 5 friends.'); } catch { toast('Hub link ready: copy it from the panel.'); }
    } catch (e) { toast(e.message); }
  }
  // ---------- the scratchpad ----------
  const scratch = (() => {
    const LOCAL = 'tribecode.scratch.local', DRAFT = 'tribecode.scratch.draft';
    let notes = lsGet(LOCAL, []) || [], synced = false, saveT = null, mounts = new Set(), editing = null, selected = null;
    const remote = () => connected() && C.hasToken();
    async function sync() {
      if (!remote()) { notes = lsGet(LOCAL, []) || []; draw(); return; }
      try {
        let r = await C.api('/scratch');
        const local = (lsGet(LOCAL, []) || []).filter(n => n.text && n.text.trim());
        if (local.length) { r = await C.api('/scratch', { method: 'PUT', body: { notes: [...local.map(n => ({ text: n.text })), ...r.notes] } }); lsSet(LOCAL, []); }   // carry this device's notes into the tribe once
        notes = r.notes; synced = true; draw();
        if (document.body.dataset.view === 'hub' && mode !== 'repos' && !document.querySelector('#note-ed')) render();   // Home's Notes and the docs center list your notes
      } catch {}
    }
    function persist(now) {
      clearTimeout(saveT);
      const run = async () => {
        if (!remote()) { lsSet(LOCAL, notes); return; }
        try { const r = await C.api('/scratch', { method: 'PUT', body: { notes: notes.map(n => ({ id: n.id, text: n.text })) } }); if (!editing) { notes = r.notes; draw(); } else { const ids = r.notes.map(n => n.id); notes.forEach((n, i) => { if (!n.id || !/^n-/.test(n.id)) n.id = ids[i]; }); } }
        catch (e) { toast(e.message); }
      };
      if (now) return run(); saveT = setTimeout(run, 600);
    }
    function add(text) {
      text = String(text || '').trim(); if (!text) return;
      notes.unshift({ id: remote() ? undefined : 'n-' + Math.random().toString(36).slice(2, 10), text, at: new Date().toISOString(), updated: new Date().toISOString() });
      lsSet(DRAFT, ''); draw(); persist(true);
    }
    function remove(id) { notes = notes.filter(n => n.id !== id); draw(); persist(true); }
    function picker(anchor, title, cb) {
      const list = projects();
      if (!remote()) return toast('Join or host a tribe to file notes into a project.');
      if (!list.length) return toast('No project yet. Start one with New project.');
      const pop = document.createElement('div'); pop.className = 'sh-pop scratch-pick' + (isPhone() ? ' sheet' : ''); pop.setAttribute('role', 'menu');
      pop.innerHTML = `<div class="sh-menu sh-projects"><h6>${esc(title)}</h6>${list.map(p => `<button data-pick="${esc(p.id)}">${PJ().face(p, 'sm')}<span>${esc(p.name)}</span></button>`).join('')}</div>`;
      document.body.appendChild(pop);
      if (!isPhone()) { const r = anchor.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px'; pop.style.top = Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, r.bottom + 6)) + 'px'; }
      const close = () => { pop.remove(); document.removeEventListener('mousedown', out, true); };
      const out = e => { if (!pop.contains(e.target)) close(); };
      setTimeout(() => document.addEventListener('mousedown', out, true), 0);
      pop.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { close(); cb(b.dataset.pick); });
      const f = pop.querySelector('button'); if (f) f.focus();
    }
    async function file(id, how, anchor) {
      await persist(true);
      picker(anchor, how === 'move' ? 'Move to project' : 'Make a task in', async pid => {
        try {
          const r = await C.api(`/scratch/${encodeURIComponent(id)}/${how}`, { method: 'POST', body: { project: pid } });
          notes = r.notes; draw();
          const p = projOf(pid);
          toast(how === 'move' ? `Filed in ${p ? p.name : 'the project'} as “${r.doc.title}”` : `Task added to ${p ? p.name : 'the project'}: ${r.task.title}`);
        } catch (e) { toast(e.message); }
      });
    }
    function html() {
      const draft = lsGet(DRAFT, '') || '';
      return `<div class="sc-head"><h6>Scratchpad</h6><span class="sc-sub">${remote() ? 'Only you see this' : 'On this device'}</span></div>
        <div class="sc-new"><textarea class="sc-in" placeholder="Jot a thought or paste a snippet…" rows="2" aria-label="New scratchpad note">${esc(draft)}</textarea><button class="btn sc-add" type="button" title="Add (Ctrl Enter)">Add</button></div>
        <div class="sc-list">${notes.map(n => `<div class="sc-note" data-sn="${esc(n.id || '')}">
          <div class="sc-text" tabindex="0" role="textbox" aria-label="Edit note" title="Click to edit">${esc(n.text)}</div>
          <div class="sc-acts"><span class="sc-at">${esc(ago(n.updated || n.at))}</span><button class="linkish" data-sc="move">Move to project…</button><button class="linkish" data-sc="task">Make a task</button><button class="sc-x" data-sc="del" title="Delete" aria-label="Delete note">${ico('i-x', 12)}</button></div></div>`).join('')}</div>`;
    }
    function wire(root) {
      const ta = root.querySelector('.sc-in'), addB = root.querySelector('.sc-add');
      ta.oninput = () => { lsSet(DRAFT, ta.value); mounts.forEach(m => { if (m !== root) { const o = m.querySelector('.sc-in'); if (o && o !== document.activeElement) o.value = ta.value; } }); };
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(ta.value); } };
      addB.onclick = () => add(ta.value);
      root.querySelectorAll('.sc-note').forEach(el => {
        const id = el.dataset.sn, tx = el.querySelector('.sc-text');
        const edit = () => {
          if (el.querySelector('textarea')) return;
          const n = notes.find(x => x.id === id); if (!n) return;
          editing = id; selected = id;
          const area = document.createElement('textarea'); area.className = 'sc-edit'; area.value = n.text; area.rows = Math.min(10, Math.max(2, n.text.split('\n').length + 1));
          tx.replaceWith(area); area.focus();
          area.oninput = () => { n.text = area.value; n.updated = new Date().toISOString(); persist(); };
          area.onblur = () => { editing = null; if (!n.text.trim()) notes = notes.filter(x => x !== n); persist(true).then(draw); };
          area.onkeydown = e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); area.blur(); } };
        };
        el.classList.toggle('sel', id === selected);
        tx.onclick = edit; tx.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); edit(); } };
        el.querySelectorAll('[data-sc]').forEach(b => b.onclick = e => { e.stopPropagation(); const a = b.dataset.sc; if (a === 'del') remove(id); else file(id, a, b); });
      });
    }
    function draw() {
      mounts.forEach(root => { if (!document.body.contains(root)) { mounts.delete(root); return; } const had = root.querySelector('.sc-in') === document.activeElement; root.innerHTML = html(); wire(root); if (had) { const t = root.querySelector('.sc-in'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); } });
      if (mode === 'docs' && document.body.dataset.view === 'hub') setTimeout(refreshFiles, 0);   // feat/files-dash: notes are files too
    }
    function mount(root) { root.dataset.mounted = '1'; mounts.add(root); root.innerHTML = html(); wire(root); const t = root.querySelector('.sc-in'); if (t && root.id === 'room-scratch') t.id = 'scratch-in'; }
    // Refine with AI: save pending edits first, then swap a note's text (or the draft) for the cleaned-up one.
    const flush = () => (saveT ? persist(true) : Promise.resolve());
    async function create(text) {   // a new personal note (Start a note): saved at once, returns its id
      notes.unshift({ id: remote() ? undefined : 'n-' + Math.random().toString(36).slice(2, 10), text, at: new Date().toISOString(), updated: new Date().toISOString() });
      draw(); await persist(true); return notes[0] && notes[0].id;
    }
    function quiet(id, text) { const n = notes.find(x => x.id === id); if (!n) return; n.text = text; n.updated = new Date().toISOString(); persist(); }
    function replace(id, text) { const n = notes.find(x => x.id === id); if (!n) return; n.text = text; n.updated = new Date().toISOString(); selected = id; draw(); persist(true); }
    function setDraft(text) { lsSet(DRAFT, text); mounts.forEach(m => { const t = m.querySelector('.sc-in'); if (t) t.value = text; }); }
    return { sync, mount, add, create, quiet, remove, count: () => notes.length, notes: () => notes.slice(), draw, flush, replace, setDraft, selected: () => selected };
  })();

  setTimeout(() => { panel(); scratch.sync(); fromHash(); }, 0);
  if (document.body.dataset.view === 'hub') setTimeout(onShow, 0);   // app.js may have shown the hub before this file loaded
  window.TribeHub = { open, onShow, onHide, mode: () => mode, last, remember, resume, scratch, refresh: () => load(true), data: () => data, panel,
    openNote: id => { open('docs'); setTimeout(() => noteEditor(id), 60); }, jump,
    editText: src => noteEditor(null, false, src), openFile, newMenu: a => newMenu(a) };   // feat/setup-local: localfiles.js opens local docs and files here   // feat/flint: Flint opens the note it captured
})();
