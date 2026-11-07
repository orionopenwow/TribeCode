// The Global Hub (#/hub): what the main screen shows with no project selected, and the start screen.
//   One hero: Quick launch (New project · Paste invite link · Resume last session · a big search that opens Ctrl K).
//   Then: Global stream (newest first, across every project you can see, live via the `hub` socket event),
//   Agents & models (your agents, local models, background loops), Your notes, Suggestions for you.
//   Sub-pages from the sidebar's Global group: All repos (#/hub/repos), Global docs (#/hub/docs).
// Also owns the right panel's helpers (Secretary, local model, autopilot listed as present entities) and the
// private global scratchpad (server/scratch.js; localStorage until you are in a tribe).
// Not connected yet: quick launch, the local scratchpad, "Start hosting on this computer" / "Join with a link".
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
    if (!l) return toast('Nothing to resume yet. Open a project and it shows up here.');
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
  const sec = (eyebrow, title, inner, extra = '') => `<section class="sec hub-sec" ${extra}><div class="sec-head"><span class="eyebrow">${esc(eyebrow)}</span><h2>${title}</h2></div>${inner}</section>`;
  function greeting() {
    const h = new Date().getHours(), part = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const name = (me().name || (window.TribeStore && window.TribeStore.get().name) || '').split(' ')[0];
    return `${part}${name && name !== 'Me' ? `, ${esc(name)}` : ''}`;
  }
  function render() {
    const el = section(); if (!el) return;
    if (mode === 'repos') return renderRepos(el);
    if (mode === 'docs') return renderDocs(el);
    const on = connected(), tribe = (C.state().tribe || {}).name;
    const pj = projects(), live = (data && data.status) || {};
    const sub = on ? [tribe, `${pj.length} project${pj.length === 1 ? '' : 's'}`, live.activeToday ? `${live.activeToday} active today` : ''].filter(Boolean).join(' · ')
      : C.hasToken() ? 'Reconnecting to your tribe…' : 'Not in a tribe yet. Everything below works on this device.';
    el.innerHTML = `<div class="hub">
      <header class="hub-head"><span class="eyebrow">Your home</span><h1>${greeting()}</h1><p class="faint">${esc(sub)}</p></header>
      ${launch(on)}
      ${on ? stream() : offline()}
      ${on ? fleetSec() : ''}
      <div class="hub-two">${notesSec(on)}${on ? suggestSec() : ''}</div>
    </div>`;
    bind(el);
  }

  function launch(on) {
    const l = on ? last() : null, lp = l && projOf(l.project);
    const resumeCard = lp
      ? `<button class="hub-tile" id="hub-resume" data-hl="resume"><span class="ht-face">${PJ().face(lp, 'sm')}</span><span class="ht-t"><span class="eyebrow">Resume</span><b>${esc(lp.name)} · ${esc(l.label)}</b><small>${esc(ago(l.at))}</small></span>${ico('i-chev', 16)}</button>`
      : `<button class="hub-tile" id="hub-resume" data-hl="resume" ${on && pj1() ? '' : 'disabled'}><span class="ht-ico">${ico('i-refresh', 18)}</span><span class="ht-t"><span class="eyebrow">Resume</span><b>${on && pj1() ? `Open ${esc(pj1().name)}` : 'Your last session'}</b><small>${on ? 'Shows up once you work in a project' : 'Join or host a tribe first'}</small></span></button>`;
    return `<section class="hero-card hub-launch" id="hub-launch"><span class="eyebrow">Quick launch</span><h2>${on ? 'Jump back in, or start something new' : 'Start a tribe, or join one'}</h2>
      <button class="hub-search" id="hub-search" type="button" aria-label="Search or jump to anything (Ctrl K)">${ico('i-search', 18)}<input id="hub-q" placeholder="Search or jump to anything…" autocomplete="off" tabindex="-1" aria-hidden="true"><span class="kbd">Ctrl K</span></button>
      <div class="hub-grid">
        <button class="hub-tile primary" id="hub-new" data-hl="new"><span class="ht-ico">${ico('i-plus', 20)}</span><span class="ht-t"><b>New project</b><small>${on ? 'A room, a link and a repo in one click' : 'Hosts a tribe on this computer first'}</small></span></button>
        <button class="hub-tile" id="hub-join" data-hl="join"><span class="ht-ico">${ico('i-link', 18)}</span><span class="ht-t"><span class="eyebrow">Invite</span><b>Paste invite link</b><small>Join a friend's tribe or project</small></span></button>
        ${resumeCard}
      </div></section>`;
  }
  const pj1 = () => projects()[0] || null;

  function offline() {
    const desk = !!(window.TribeHost && window.TribeHost.isDesktop);
    return sec('This computer', 'Two ways in', `<div class="hub-cards">
        <div class="card hub-way"><h3>${ico('i-zap', 16)}Start hosting on this computer</h3><p class="faint">${desk ? 'Your tribe runs here. Friends join with one link, from a phone or a computer.' : 'Hosting runs in the desktop app (or <code>npm start</code>). Everything stays on the host\'s computer.'}</p>
          <button class="btn ${desk ? 'primary' : ''}" id="hub-host">${desk ? 'Start hosting' : 'Get the desktop app'}</button></div>
        <div class="card hub-way"><h3>${ico('i-link', 16)}Join with a link</h3><p class="faint">A friend sent you a link like <code>…/join/k7Qx2</code>. Paste it and pick a name. No account needed.</p>
          <button class="btn" id="hub-join2">Join with a link</button></div></div>`);
  }

  // Global stream: newest first, items grouped under a project chip (consecutive items of one project share it).
  const KIND = { gist: ['i-sparkle', 'Agent'], commit: ['i-git', 'Commit'], decision: ['i-vote', 'Decision'], proposal: ['i-vote', 'Proposal'], vote: ['i-vote', 'Vote'], doc: ['i-doc', 'Doc'], task: ['i-check', 'Task'], join: ['i-users', 'Joined'], chat: ['i-chat', 'Chat'], plan: ['i-flag', 'Plan'] };
  function chip(pid) {
    const p = projOf(pid); if (!p) return '';
    return `<span class="hub-chip" style="--pc:${esc(p.color || '#6C7CFF')}"><i></i>${esc(p.name)}</span>`;
  }
  function stream() {
    const feed = (data && data.feed) || [];
    if (data && data.error) return sec('Global stream', 'Across your projects', `<div class="hub-empty">${esc(data.error)}</div>`, 'id="hub-stream"');
    if (!data) return sec('Global stream', 'Across your projects', '<div class="hub-empty faint">Loading…</div>', 'id="hub-stream"');
    if (!feed.length) return sec('Global stream', 'Across your projects', `<div class="hub-empty">Quiet so far. Commits, agent gists, decisions, new docs and people joining show up here as they happen.</div>`, 'id="hub-stream"');
    let prev = null;
    const rows = feed.slice(0, 30).map(it => {
      const [icon, kind] = KIND[it.kind] || ['i-doc', it.kind], head = it.project !== prev; prev = it.project;
      return `${head ? `<div class="hub-grp">${chip(it.project)}</div>` : ''}<button class="hub-item k-${esc(it.kind)} ${it.agent ? 'agent' : ''}" data-feed="${esc(it.id)}">
        <span class="hi-ico">${ico(icon, 15)}</span><span class="hi-t"><b>${esc(it.title)}</b><small>${esc([it.sub && it.kind !== 'commit' ? it.sub : kind, it.byName].filter(Boolean).join(' · '))}${it.kind === 'commit' && it.sub ? ` · <code>${esc(it.sub)}</code>` : ''}</small></span>
        <span class="hi-at">${esc(ago(it.at))}</span><span class="hi-go">Jump to ${ico('i-chev', 12)}</span></button>`;
    }).join('');
    return sec('Global stream', 'Across your projects', `<div class="hub-feed" id="hub-feed">${rows}</div>`, 'id="hub-stream"');
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

  function notesSec(on) {
    const notes = (data && data.notes) || [];
    const docs = on && notes.length ? `<div class="hub-list">${notes.slice(0, 5).map(n => `<button class="hub-li" data-note="${esc(n.id)}">${ico('i-doc', 14)}<span><b>${esc(n.title)}</b><small>${chip(n.project)} ${esc(ago(n.at))}</small></span></button>`).join('')}</div>` : '';
    const showPad = !on || isPhone() || document.body.classList.contains('panel-off');
    return sec('Your notes', on ? 'Notes and scratchpad' : 'Scratchpad', `${docs}${showPad ? '<div class="scratch" id="hub-scratch"></div>' : `<button class="hub-li" id="hub-pad">${ico('i-quill', 14)}<span><b>Scratchpad</b><small>${scratch.count() ? `${scratch.count()} note${scratch.count() === 1 ? '' : 's'} · ` : ''}in the right panel</small></span></button>`}${on && !notes.length ? '<p class="faint hub-hint">Docs you write in any project collect here.</p>' : ''}`, 'id="hub-notes"');
  }

  function suggestSec() {
    const need = [...((data && data.hero) || []), ...((data && data.more) || [])].slice(0, 4);
    const sug = (data && data.suggestions) || [];
    const row = (x, isNeed) => `<div class="hub-sug ${isNeed ? 'need' : ''}" data-sug="${esc(x.id)}"><div class="hs-t">${chip(x.project)}<b>${esc(x.title)}</b><small>${esc(x.why || x.sub || '')}</small></div>
      <div class="hs-a">${isNeed ? `<button class="btn ${x.kind === 'approval' ? 'primary' : ''}" data-sug-go="${esc(x.id)}">${x.kind === 'approval' ? 'Review' : x.kind === 'vote' ? 'Vote' : 'Open'}</button>` : x.action ? `<button class="btn" data-sug-go="${esc(x.id)}">${esc(x.action.label)}</button>` : ''}
        <button class="hs-x" data-sug-x="${esc(x.id)}" title="Not now" aria-label="Dismiss">${ico('i-x', 14)}</button></div></div>`;
    const inner = need.length || sug.length ? `<div class="hub-sugs">${need.map(x => row(x, true)).join('')}${sug.map(x => row(x, false)).join('')}</div>` : '<div class="hub-empty">Nothing waiting on you. Suggestions roll in as your projects move.</div>';
    return sec('For you', need.length ? `${need.length} waiting on you` : 'Suggestions', inner, 'id="hub-suggest"');
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
    if (PJ().current() !== pid) await PJ().switchTo(pid);
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
    on('#hub-new', newProject); on('#hub-join', join); on('#hub-join2', join); on('#hub-host', host); on('#hub-resume', resume);
    on('#hub-search', () => search()); on('#hub-cc', () => App().connectClaude());
    on('#hub-pad', () => { if (SH() && SH().setPanel) SH().setPanel(false); const t = $('#scratch-in'); if (t) { t.focus(); t.closest('.scratch').scrollIntoView({ block: 'nearest' }); } });
    el.querySelectorAll('[data-feed]').forEach(b => b.onclick = () => { const it = ((data && data.feed) || []).find(x => x.id === b.dataset.feed); if (it) jump(it); });
    el.querySelectorAll('[data-note]').forEach(b => b.onclick = () => { const n = ((data && data.notes) || []).find(x => x.id === b.dataset.note); if (n) jump(n); });
    el.querySelectorAll('[data-sug-go]').forEach(b => b.onclick = () => sugGo(b.dataset.sugGo));
    el.querySelectorAll('[data-sug-x]').forEach(b => b.onclick = () => dismiss(b.dataset.sugX));
    el.querySelectorAll('[data-fleet]').forEach(b => b.onclick = () => fleetGo(b.dataset.fleet, b.dataset.id));
    const pad = el.querySelector('#hub-scratch'); if (pad) scratch.mount(pad);
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
      ].join('');
      box.innerHTML = `<h6>Helpers</h6>${rows}`;
      box.querySelectorAll('[data-helper]').forEach(r => r.onclick = () => fleetGo(r.dataset.helper));
    }
    let pad = $('#room-scratch');
    if (!pad) { pad = document.createElement('div'); pad.id = 'room-scratch'; pad.className = 'scratch room-scratch'; const cc = $('#cc-connect'); cc.after(pad); }
    if (!pad.dataset.mounted) scratch.mount(pad);
    pad.classList.toggle('hidden', !connected() && document.body.dataset.view === 'hub');   // offline, the hub shows the scratchpad itself
  }

  // ---------- the scratchpad ----------
  const scratch = (() => {
    const LOCAL = 'tribecode.scratch.local', DRAFT = 'tribecode.scratch.draft';
    let notes = lsGet(LOCAL, []) || [], synced = false, saveT = null, mounts = new Set(), editing = null;
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
          editing = id;
          const area = document.createElement('textarea'); area.className = 'sc-edit'; area.value = n.text; area.rows = Math.min(10, Math.max(2, n.text.split('\n').length + 1));
          tx.replaceWith(area); area.focus();
          area.oninput = () => { n.text = area.value; n.updated = new Date().toISOString(); persist(); };
          area.onblur = () => { editing = null; if (!n.text.trim()) notes = notes.filter(x => x !== n); persist(true).then(draw); };
          area.onkeydown = e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); area.blur(); } };
        };
        tx.onclick = edit; tx.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); edit(); } };
        el.querySelectorAll('[data-sc]').forEach(b => b.onclick = e => { e.stopPropagation(); const a = b.dataset.sc; if (a === 'del') remove(id); else file(id, a, b); });
      });
    }
    function draw() {
      mounts.forEach(root => { if (!document.body.contains(root)) { mounts.delete(root); return; } const had = root.querySelector('.sc-in') === document.activeElement; root.innerHTML = html(); wire(root); if (had) { const t = root.querySelector('.sc-in'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); } });
      const pc = $('#hub-pad small'); if (pc) pc.textContent = `${notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'} · ` : ''}in the right panel`;
    }
    function mount(root) { root.dataset.mounted = '1'; mounts.add(root); root.innerHTML = html(); wire(root); const t = root.querySelector('.sc-in'); if (t && root.id === 'room-scratch') t.id = 'scratch-in'; }
    return { sync, mount, add, count: () => notes.length, notes: () => notes.slice(), draw };
  })();

  setTimeout(() => { panel(); scratch.sync(); fromHash(); }, 0);
  if (document.body.dataset.view === 'hub') setTimeout(onShow, 0);   // app.js may have shown the hub before this file loaded
  window.TribeHub = { open, onShow, onHide, mode: () => mode, last, remember, resume, scratch, refresh: () => load(true), data: () => data, panel };
})();
