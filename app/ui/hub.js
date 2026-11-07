// Home (#/hub): your command center, shown with no tribe/project selected and on every launch.
//   Header "Your command center" · the hero: Suggestions (rolling, dismissible, Resume) | Ask (to your own Claude
//   Code's private chat when connected, else the local model via POST /api/hub/ask; the answer shows inline with
//   "Open in chat") | Join with a link / New project · Get started (five steps with progress, "Refine with AI" asks
//   the local model for a first project from your notes, "Get started with your agent"; dismissible, remembered) ·
//   Scratchpad (Refine with AI: POST /api/scratch/refine, then Replace / Keep) | Recent activity (the global stream,
//   condensed) · Agents & models. Reference: design/inspiration/home-ref.png, translated to the flat palette.
//   Sub-pages from the sidebar's Global group: All repos (#/hub/repos), Global docs (#/hub/docs).
// Also owns the right panel's Home mode (you, Connect your Claude Code, Share my hub link, Invite friends, AI Insights
// from GET /api/insights with a fallback to suggestions + the Secretary's inspirations), the helpers (Secretary, local
// model, autopilot listed as present entities) and the private global scratchpad (server/scratch.js; localStorage
// until you are in a tribe).
// Public: window.TribeHub = { open(mode), mode(), last(), remember(), scratch, refresh, data }.
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
  const LABEL = { home: 'Project home', chat: 'Chat', docs: 'Docs', tasks: 'Tasks', board: 'Board', bugs: 'Bugs', repo: 'Repo', calendar: 'Calendar', visuals: 'Visuals', coord: 'Coordinate', requests: 'Requests' };
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
    mode = ['home', 'repos', 'docs'].includes(m) ? m : 'home';
    App().show('hub');
  }
  function onShow() {   // app.js show('hub') calls this
    const want = mode === 'home' ? '#/hub' : `#/hub/${mode}`;
    if (location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
    const cl = $('#crumb-label'); if (cl) cl.textContent = mode === 'repos' ? 'All repos' : mode === 'docs' ? 'Global docs' : 'Home';
    render(); load(); panel();
  }
  function onHide() { setTimeout(panel, 0); if (/^#\/hub/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }
  const fromHash = () => { const m = /^#\/hub(?:\/(repos|docs))?$/.exec(location.hash); if (m && (document.body.dataset.view !== 'hub' || mode !== (m[1] || 'home'))) open(m[1] || 'home'); };
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
  C.on('ws', m => { if (m && (m.type === 'hub' || m.type === 'dashboard') && (!data || m.rev !== data.rev)) load(true); });
  C.on('hello', () => { load(true); scratch.sync(); setTimeout(fromHash, 30); });
  C.on('status', () => { if (document.body.dataset.view === 'hub') render(); panel(); });
  C.on('projects', () => { if (document.body.dataset.view === 'hub') setTimeout(render, 300); });
  setInterval(() => { if (!document.hidden && connected()) load(true); }, 90_000);

  // ---------- render ----------
  // Home is the command center (reference: design/inspiration/home-ref.png, translated to the flat palette):
  //   header · the hero (Suggestions | Ask | Join or start) · Get started (dismissible) · Scratchpad | Recent activity ·
  //   Agents & models. The right panel on Home: you, Connect your Claude Code, Share my hub link, Invite friends,
  //   AI Insights (GET /api/insights, else the hub's suggestions + the Secretary's inspirations). Phones: one column.
  const sec = (eyebrow, title, inner, extra = '', aside = '') => `<section class="sec hub-sec" ${extra}><div class="sec-head ${aside ? 'hs-row' : ''}"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${title}</h2></div>${aside}</div>${inner}</section>`;
  const SEND = '<svg class="i" viewBox="0 0 24 24" style="width:17px;height:17px"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  const aiTag = (label = 'AI') => `<span class="ai-tag">${ico('i-sparkle', 11)}${esc(label)}</span>`;
  const myAgent = () => { const id = me().id; return id ? (C.state().members || []).find(m => m.role === 'agent' && m.owner === id) || null : null; };
  const memberOf = id => (C.state().members || []).find(m => m.id === id) || null;
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
    const on = connected(), tribe = (C.state().tribe || {}).name;
    const pj = projects(), live = (data && data.status) || {};
    const sub = on ? [greeting(), `${pj.length} project${pj.length === 1 ? '' : 's'}`, live.activeToday ? `${live.activeToday} active today` : ''].filter(Boolean).join(' · ')
      : C.hasToken() ? `${greeting()}. Reconnecting to your tribe…` : `${greeting()}. Not in a tribe yet: everything here works on this device.`;
    keepFocus(() => {
      el.innerHTML = `<div class="hub hub-home">
        <header class="hub-head">${isPhone() ? '<div class="hub-thumb" aria-hidden="true"><img src="assets/icon-512.png" alt=""></div>' : ''}<span class="eyebrow">Your home</span><h1>Your command center</h1><p>${sub}</p></header>
        ${gsHero(on)}
        ${isPhone() && on && pj.length ? phoneProjects(pj) : ''}
        <div class="hub-two hub-bottom">${notesSec(on)}${activitySec(on)}</div>
        ${isPhone() ? sec('AI insights', 'Worth a look', `<div class="ai-cards" id="hub-ins-phone">${insightCards()}</div>`, 'id="hub-insights"') : ''}
      </div>`;
      bind(el);
    });
  }

  // Phones have no rail: your projects are rows on Home; tapping one opens it (and its bottom rack).
  function phoneProjects(pj) {
    const pulses = (PJ().pulses && PJ().pulses()) || {};
    return sec('Your projects', 'Jump in', `<div class="hub-pjs" id="hub-pjs">${pj.map(p => `<button class="hub-pj" data-pj-go="${esc(p.id)}">${PJ().face(p, 'sm')}<span><b>${esc(p.name)}</b><small>${esc(p.bio || (p.counts && p.counts.tasks ? `${p.counts.tasks} open tasks` : 'Open the project'))}</small></span>${pulses[p.id] ? '<i class="hub-pj-dot" aria-label="unread"></i>' : ''}${ico('i-chev', 15)}</button>`).join('')}</div>`, 'id="hub-pjs-sec"');
  }

  // ---------- the one hero: two big choices (Getting started, or Quick start once you're in) ----------
  // Suggestions, Ask and the agents fleet moved out of the way: AI Insights (right panel), @ai in chat, Agent fleet row.
  function gsHero(on) {
    const desk = !!(window.TribeHost && window.TribeHost.isDesktop);
    const l = on ? last() : null, lp = l && projOf(l.project), p1 = on && pj1();
    const tile = (id, title, sub, faceHtml = '') => `<button class="gs-tile" id="${id}">${faceHtml}<b>${title}</b><span>${sub}</span></button>`;
    const tiles = !on
      ? tile(desk ? 'hub-host' : 'hub-host', 'Create your first project', desk ? 'Start a project on this computer and invite AI.' : 'Get the desktop app to host a project.')
        + tile('hub-join', 'Join a friend\'s tribe', 'Use an invite link to collaborate.')
      : (lp || p1
          ? tile('hub-resume', lp ? 'Pick up where you left off' : `Open ${esc(p1.name)}`, lp ? `${esc(lp.name)} · ${esc(l.label)} · ${esc(ago(l.at))}` : 'Your last session shows up here.')
          : tile('hub-new', 'Create a project', 'A room, a link and a repo, in one click.'))
        + tile('hub-instant', 'Invite a friend', 'A fresh project and a link that works anywhere, copied.');
    const links = on ? `<div class="gs-links">${lp || p1 ? '<button class="linkish" id="hub-new">New project</button><span aria-hidden="true">·</span>' : ''}<button class="linkish" id="hub-join">Paste invite link</button></div>` : '';
    return `<section class="hero-card hub-hero hub-gs" id="hub-hero"><div class="gs-band"><span class="eyebrow">${on ? 'Quick start' : 'Getting started'}</span></div>
      <div class="gs-grid">${tiles}</div>${links}</section>`;
  }

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
    const to = ag ? `<div class="ask-to" role="group" aria-label="Ask who"><button type="button" data-ask-to="claude" class="${tgt === 'claude' ? 'on' : ''}" aria-pressed="${tgt === 'claude'}">${esc(ag.name || 'Your Claude')}</button><button type="button" data-ask-to="brain" class="${tgt === 'brain' ? 'on' : ''}" aria-pressed="${tgt === 'brain'}">Local model</button></div>`
      : `<span class="ask-who">${on ? 'Local model' : 'Not connected'}</span>`;
    const ph = !on ? 'Host or join a tribe, then ask your agent or local model…' : tgt === 'claude' ? `Ask ${ag.name || 'your Claude'} anything, or give it a task…` : 'Ask your hub anything: what changed, what is next…';
    return `<div class="hh-panel hh-ask" id="hub-ask"><div class="hh-head"><span class="eyebrow">Ask</span>${to}</div>
      <form class="ask-box" id="hub-ask-form" autocomplete="off"><textarea id="hub-ask-in" rows="3" placeholder="${esc(ph)}" aria-label="Ask">${esc(ask.draft)}</textarea>
        <div class="ask-row"><span class="ask-hint">${on ? 'Enter to send · Shift Enter for a new line' : 'Answers come from the tribe\'s host'}</span><button class="ask-send" id="hub-ask-send" type="submit" aria-label="Send" title="Send">${SEND}</button></div></form>
      <div class="ask-out" id="hub-answer" aria-live="polite">${answerHtml()}</div></div>`;
  }
  function answerHtml() {
    if (ask.error) return `<div class="ask-ans err"><p>${esc(ask.error)}</p>${ask.offerConnect ? '<div class="aa-acts"><button class="btn" id="hub-ask-cc">Connect your Claude Code</button></div>' : ''}</div>`;
    if (!ask.status) return '';
    const who = ask.via === 'claude' ? esc((ask.agent && ask.agent.name) || 'Your Claude') : `Local model${ask.model ? ` · ${esc(ask.model)}` : ''}`;
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
      <div class="hj-acts"><button class="btn primary" id="hub-join">Paste invite link</button><button class="btn" id="hub-host">Get the desktop app</button></div>
      <p class="hj-note">Hosting runs in the desktop app (or <code>npm start</code>).</p>`}</div>`;
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
      { id: 'claude', label: 'Connect your Claude Code', done: on && (!!myAgent() || (f.agents || []).length > 0) },
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
          <p class="hst-lead">Let the local model shape a first project from your notes, or hand it straight to your Claude Code.</p>
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
  function notesSec(on) {
    const notes = (data && data.notes) || [];
    const docs = on && notes.length ? `<div class="hub-list hub-mynotes"><span class="eyebrow">Docs you wrote</span>${notes.slice(0, 3).map(n => `<button class="hub-li" data-note="${esc(n.id)}">${ico('i-doc', 14)}<span><b>${esc(n.title)}</b><small>${chip(n.project)} ${esc(ago(n.at))}</small></span></button>`).join('')}</div>` : '';
    const out = refine.error ? `<div class="ref-out err">${esc(refine.error)}</div>`
      : refine.status === 'thinking' ? '<div class="ref-out"><p class="aa-wait">Cleaning up your note…</p></div>'
      : refine.text ? `<div class="ref-out" id="hub-refine-out"><div class="aa-head">${aiTag()}<b>Cleaned up${refine.model ? ` · ${esc(refine.model)}` : ''}</b></div><div class="aa-text">${esc(refine.text)}</div>
          <div class="aa-acts"><button class="btn primary" id="hub-refine-replace">Replace</button><button class="btn" id="hub-refine-keep">Keep original</button></div></div>` : '';
    return sec('Your notes', 'Scratchpad', `<div class="scratch" id="hub-scratch"></div>${out}${docs}`, 'id="hub-notes"',
      `<button class="btn ai" id="hub-refine" title="Clean up the selected note (or the newest) with the local model">${ico('i-sparkle', 14)}Refine with AI</button>`);
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
    return `<span class="ha-av" style="background:${esc((m && m.color) || (it.kind === 'commit' ? '#6C7CFF' : '#2A313C'))}">${esc(name.trim().charAt(0).toUpperCase() || '?')}</span>`;
  }
  function activitySec(on) {
    const head = inner => sec('Across your projects', 'Recent activity', inner, 'id="hub-stream"');
    if (!on) {
      const local = scratch.notes().slice(0, 4), nm = ((window.TribeStore && window.TribeStore.get().name) || 'Me');
      return head(local.length ? `<div class="hub-act" id="hub-feed">${local.map(n => `<div class="ha-row static"><span class="ha-av" style="background:var(--accent)">${esc(nm.charAt(0).toUpperCase())}</span><span class="ha-t"><span class="ha-l1"><b>You</b><span class="ha-at">${esc(ago(n.updated || n.at))}</span></span><span class="ha-text">${esc(n.text.split('\n')[0])}</span><span class="ha-l3"><small>Scratchpad note</small><span class="ha-tag">On this device</span></span></span></div>`).join('')}</div>`
        : '<div class="hub-empty">Quiet so far. Notes you jot show up here; once you are in a tribe, so do commits, agent gists, decisions and people joining.</div>');
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
      : `<div class="hf-row static"><span class="hf-dot"></span><span class="hf-name">No agents yet</span><span class="hf-what faint">Connect Claude Code and it shows up here with its task and context.</span><button class="btn" id="hub-cc">Connect your Claude Code</button></div>`;
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
    if (data && m.online === false) out.push({ id: 'h:model', kind: 'health', title: 'The local model is off', body: `${m.error || 'Ollama is not running'}. Start it for answers on Home, note cleanup and the Secretary.`, source: 'Agents & models' });
    if (data && !(f.agents || []).length && !myAgent()) out.push({ id: 's:cc', kind: 'suggestion', title: 'Connect your Claude Code', body: 'It shows up in the room with its task and context, and Ask on Home can go straight to it.', source: 'Home', run: () => App().connectClaude(), label: 'Connect' });
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
    const api = insights.src === 'api' && insights.items ? insights.items : [], seen = new Set();
    const list = [...fallbackInsights(), ...api].filter(it => { const k = String(it.title || '').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
    insActs = {};
    if (!list.length) return '<p class="ai-cards-empty">Nothing to flag right now.</p>';
    return list.map((it, i) => { const [icon, label] = INS[it.kind] || INS.suggestion, run = insightRun(it), key = 'k' + i; if (run) insActs[key] = run;
      return `<div class="ai-card k-${esc(it.kind || 'suggestion')}" data-ins="${esc(it.id || key)}"><div class="ai-card-k">${ico(icon, 13)}<span>${esc(label)}</span></div><b>${esc(it.title)}</b>${it.body ? `<p>${esc(it.body)}</p>` : ''}
        <div class="ai-card-foot">${aiTag()}<span class="ai-card-src">${esc(it.source || '')}${it.at ? ` · ${esc(ago(it.at))}` : ''}</span>${run ? `<button class="btn ai-card-go" data-ai-card-go="${key}">${esc(it.label || (it.action && it.action.label) || 'Open')}</button>` : ''}</div></div>`; }).join('');
  }
  function bindInsights(root) { root.querySelectorAll('[data-ai-card-go]').forEach(b => b.onclick = () => { const f = insActs[b.dataset.aiCardGo]; if (f) f(); }); }
  function drawInsights() {
    const html = insightCards();
    for (const id of ['#home-ai-cards', '#hub-ins-phone']) { const box = $(id); if (box) { box.innerHTML = html; bindInsights(box); } }
  }

  // ---------- All repos ----------
  async function renderRepos(el) {
    el.innerHTML = `<div class="hub"><header class="hub-head"><span class="eyebrow">Global</span><h1>All repos</h1><p class="faint">Every project's code, branch and state. Click one to open its Repo.</p></header><div class="hub-repos" id="hub-repos">${reposCache ? reposHtml(reposCache) : '<div class="hub-empty faint">Loading…</div>'}</div></div>`;
    if (!connected()) { $('#hub-repos').innerHTML = '<div class="hub-empty">Join or host a tribe to see its repos.</div>'; return; }
    try { reposCache = (await C.api('/hub/repos')).repos; const box = $('#hub-repos'); if (box && mode === 'repos') { box.innerHTML = reposHtml(reposCache); bindRepos(box); } } catch (e) { const box = $('#hub-repos'); if (box) box.innerHTML = `<div class="hub-empty">${esc(e.message)}</div>`; }
  }
  function reposHtml(list) {
    if (!list.length) return '<div class="hub-empty">No projects yet.</div>';
    return list.map(r => { const p = projOf(r.project) || r, g = r.repo;
      const state = !g ? '<span class="faint">No repo yet</span>' : g.loading ? '<span class="faint">Reading…</span>'
        : [g.branch ? `<code>${esc(g.branch)}</code>` : '', g.ahead ? `${g.ahead} ahead` : '', g.behind ? `${g.behind} behind` : '', g.dirty ? `<span class="hr-dirty">${g.dirty} changed</span>` : (g.branch ? '<span class="hr-clean">clean</span>' : '')].filter(Boolean).join(' · ');
      return `<button class="hub-repo" data-repo="${esc(r.project)}"><span class="hr-face">${PJ() ? PJ().face(p, 'sm') : ''}</span><span class="hr-t"><b>${esc(r.name)}${g && g.name ? ` <span class="faint">· ${esc(g.name)}</span>` : ''}</b><small>${state}</small></span>
        <span class="hr-last">${g && g.last ? `${esc(g.last.subject)} <span class="faint">· ${esc(g.last.author)} · ${esc(ago(g.last.at))}</span>` : g && g.remote ? esc(g.remote) : ''}</span>${ico('i-chev', 14)}</button>`; }).join('');
  }
  function bindRepos(box) { box.querySelectorAll('[data-repo]').forEach(b => b.onclick = () => go(b.dataset.repo, () => App().show('repo'))); }

  // ---------- Global docs ----------
  let docsT = null;
  function renderDocs(el) {
    el.innerHTML = `<div class="hub"><header class="hub-head"><span class="eyebrow">Global</span><h1>Global docs</h1><p class="faint">Docs from every project you are in.</p></header>
      <div class="hub-docsearch">${ico('i-search', 16)}<input id="hub-dq" class="input" placeholder="Search titles and text across projects" autocomplete="off" value="${esc(docsQ)}"></div><div class="hub-list hub-docs" id="hub-docs"><div class="hub-empty faint">Loading…</div></div></div>`;
    const inp = $('#hub-dq'); inp.oninput = () => { clearTimeout(docsT); docsT = setTimeout(() => { docsQ = inp.value.trim(); docsList(); }, 200); };
    if (!isPhone()) inp.focus();
    docsList();
  }
  async function docsList() {
    const box = $('#hub-docs'); if (!box) return;
    if (!connected()) { box.innerHTML = '<div class="hub-empty">Join or host a tribe to see its docs.</div>'; return; }
    try {
      const { docs } = await C.api('/hub/docs?q=' + encodeURIComponent(docsQ));
      if (mode !== 'docs') return;
      box.innerHTML = docs.length ? docs.map(d => `<button class="hub-li" data-gdoc="${esc(d.project)}|${esc(d.slug)}">${ico('i-doc', 14)}<span><b>${esc(d.title)}</b><small>${chip(d.project)} ${esc(d.byName || '')} · ${esc(ago(d.at))}${d.snippet ? ` · ${esc(d.snippet)}` : ''}</small></span></button>`).join('')
        : `<div class="hub-empty">${docsQ ? 'No doc matches that.' : 'No docs yet.'}</div>`;
      box.querySelectorAll('[data-gdoc]').forEach(b => b.onclick = () => { const [pid, slug] = b.dataset.gdoc.split('|'); go(pid, () => openDoc(slug)); });
    } catch (e) { box.innerHTML = `<div class="hub-empty">${esc(e.message)}</div>`; }
  }

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
    if (window.TribeHost && window.TribeHost.isDesktop && App().hostHere) return App().hostHere();
    if (window.TribeHost && window.TribeHost.isDesktop) return App().openInvite();
    window.open((window.TribeWeb && window.TribeWeb.RELEASES) || 'https://github.com/orionopenwow/TribeCode/releases/latest', '_blank', 'noopener');
  }
  const join = () => window.TribeSettings && window.TribeSettings.joinPrompt();
  function newProject() { if (!connected()) return window.TribeHost && window.TribeHost.isDesktop ? host() : join(); PJ().openNew(); }

  function bind(el) {
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
    el.querySelectorAll('[data-pj-go]').forEach(b => b.onclick = () => { const id = b.dataset.pjGo; if (PJ().current() === id) App().show('home'); else PJ().switchTo(id, 'home'); });
    on('#hub-new', newProject); on('#hub-instant', instant); on('#hub-join', join); on('#hub-host', host); on('#hub-resume', resume);
    on('#hub-cc', () => App().connectClaude());
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
    const pad = el.querySelector('#hub-scratch'); if (pad) scratch.mount(pad);
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
  // On Home (body.global) it is yours: you, Connect your Claude Code, Share my hub link, Invite friends, AI Insights
  // (the room's people and the scratchpad step aside: Home shows the scratchpad itself).
  // =====================================================================
  function panel() {
    const pane = $('#room-pane'); if (!pane) return;
    let box = $('#room-helpers');
    if (!box) { box = document.createElement('div'); box.id = 'room-helpers'; box.className = 'room-helpers'; const ag = $('#room-agents'); (ag || $('#room-list')).after(box); }
    const f = data && data.fleet;
    if (!connected() || !f) { box.innerHTML = ''; }
    else {
      const m = f.models || {}, loops = f.loops || [], sec2 = loops.find(l => l.id === 'secretary'), auto = loops.find(l => l.id === 'autopilot');
      const row = (key, glyph, name, what, on) => `<div class="person helper ${on ? 'on' : ''}" data-helper="${key}" title="${esc(name)}"><div class="avatar helper-av">${ico(glyph, 14)}<span class="st"></span></div><div><span>${esc(name)}</span><div class="what">${what}</div></div></div>`;
      const rows = [
        sec2 ? row('secretary', 'i-quill', 'Secretary', `${sec2.on ? `<span class="ok">${esc(sec2.state)}</span>` : 'off'}${sec2.last ? ` · ${esc(ago(sec2.last))}` : ''}`, sec2.on) : '',
        row('models', 'i-net', m.online ? `Local model · ${m.model}` : 'Local model', m.online ? '<span class="ok">ready</span> · Ollama' : 'off · Ollama not running', m.online),
        auto ? row('autopilot', 'i-git', 'Repo autopilot', auto.on ? `<span class="ok">on</span> · ${esc(auto.state.replace(/^on /, ''))}` : 'off', auto.on) : '',
        computeRow(row),
      ].join('');
      box.innerHTML = `<h6><span class="emo" aria-hidden="true">🤝</span>Helpers</h6>${rows}`;
      box.querySelectorAll('[data-helper]').forEach(r => r.onclick = () => r.dataset.helper === 'compute' ? computeSheet() : fleetGo(r.dataset.helper));
    }
    let pad = $('#room-scratch');
    if (!pad) { pad = document.createElement('div'); pad.id = 'room-scratch'; pad.className = 'scratch room-scratch'; const cc = $('#cc-connect'); cc.after(pad); }
    if (!pad.dataset.mounted) scratch.mount(pad);
    pad.classList.toggle('hidden', document.body.dataset.view === 'hub');   // Home shows the scratchpad itself
    homePanel();
  }
  // ---------- Shared compute: a quiet helper, only once a project has a repo and more than one person ----------
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
      <p class="lead">Lend this computer to the tribe for heavy repo work: builds, test runs and code analysis. Work only comes from this tribe's repos, runs on a clean copy, and you can stop any time.</p>
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
    meBox.innerHTML = `<h6>Your home</h6><div class="person on"><div class="avatar" style="width:30px;height:30px;font-size:12px;background:${esc(m.color || 'var(--accent)')};color:#fff">${esc(nm.trim().charAt(0).toUpperCase())}<span class="st"></span></div><div><span>${esc(nm)} <span class="faint">(you)</span></span><div class="what">${on ? `<span class="ok">online</span> · Home` : 'on this device · not in a tribe yet'}</div></div></div>`;
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
      const link = site && /^https:/.test(base) ? `${site}/go.html#s=${encodeURIComponent(base)}&c=${encodeURIComponent(invite.code)}` : `${base}/join/${invite.code}`;
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
    }
    function mount(root) { root.dataset.mounted = '1'; mounts.add(root); root.innerHTML = html(); wire(root); const t = root.querySelector('.sc-in'); if (t && root.id === 'room-scratch') t.id = 'scratch-in'; }
    // Refine with AI: save pending edits first, then swap a note's text (or the draft) for the cleaned-up one.
    const flush = () => (saveT ? persist(true) : Promise.resolve());
    function replace(id, text) { const n = notes.find(x => x.id === id); if (!n) return; n.text = text; n.updated = new Date().toISOString(); selected = id; draw(); persist(true); }
    function setDraft(text) { lsSet(DRAFT, text); mounts.forEach(m => { const t = m.querySelector('.sc-in'); if (t) t.value = text; }); }
    return { sync, mount, add, count: () => notes.length, notes: () => notes.slice(), draw, flush, replace, setDraft, selected: () => selected };
  })();

  setTimeout(() => { panel(); scratch.sync(); fromHash(); }, 0);
  if (document.body.dataset.view === 'hub') setTimeout(onShow, 0);   // app.js may have shown the hub before this file loaded
  window.TribeHub = { open, onShow, onHide, mode: () => mode, last, remember, resume, scratch, refresh: () => load(true), data: () => data, panel };
})();
