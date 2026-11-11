// The Agent fleet (feat/fleet): one calm page that says what your agents are doing and what to do next.
//   Hero (the one next step): no tribe → Start a project / Try the demo; no agent of yours ever connected → Connect your
//     AI (tabs per tool, the exact command with a fresh key, Copy, Test connection that turns green on the first MCP
//     call); otherwise whatever matters most (an agent waiting for an approval, suggested tasks nobody took, a paused or
//     idle agent, an offline one, or who is working).
//   Agents: one row per agent (name, owner, kind, status with last seen, task + branch, files claimed, the last 3
//     things it did) with Message, Give a task, Pause/Resume, Connect command (a new key) and Remove.
//   How agents work here: 4 illustrated steps and a link to the Guide.
// Two homes: inside a project the Agents Hub dashboard (agentsdash.js) paints hero(), rows() and how() around its own
// cards and calls wire(); with no project selected the global Agent fleet (agentshub.js, #/fleet) calls render(el),
// which shows your agents in every project. There, tapping an agent opens a preview in the right panel with
// "Open in tribe"; nothing switches project by itself.
// Server: GET /api/agents/fleet[?scope=all], POST /api/agents/fleet/<id>/task, POST /api/agents/channel { to },
// POST /api/agents { kind, label } (keys), POST /api/coord/agents/<id>/control, DELETE /api/agents/mine?id=.
//   window.TribeFleet = { render, load, hero, rows, how, wire, openAgent, copy, state }
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m);
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
  const pidNow = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C && C.project && C.project()) || 'default';
  const hasTribe = () => !!(C && C.hasToken && C.hasToken());

  // ---------- copy that works on iOS (and over plain http on the Wi-Fi, where navigator.clipboard is missing) ----------
  function copy(text) {
    try { if (navigator.clipboard && window.isSecureContext) { return navigator.clipboard.writeText(text).then(() => true, () => legacy(text)); } } catch {}
    return Promise.resolve(legacy(text));
  }
  function legacy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.contentEditable = 'true';
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px';   // 16px: iOS doesn't zoom
    document.body.appendChild(ta);
    const r = document.createRange(); r.selectNodeContents(ta);
    const sel = getSelection(), back = document.activeElement;
    try { ta.focus({ preventScroll: true }); ta.select(); } catch {}
    sel.removeAllRanges(); sel.addRange(r); ta.setSelectionRange(0, text.length);   // iOS wants both
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); sel.removeAllRanges(); if (back && back.focus) try { back.focus({ preventScroll: true }); } catch {}
    return ok;
  }
  const copied = (ok, what) => toast(ok ? `${what || 'Command'} copied.` : 'Press and hold the text to copy it.');

  // ---------- tools: the tabs of Connect your AI (docs/ANY-LLM.md) ----------
  const TABS = [['claude-code', 'Claude Code'], ['codex', 'Codex'], ['gemini', 'Gemini CLI'], ['cursor', 'Cursor'], ['qwen', 'Qwen Code'], ['mcp', 'Other MCP']];
  const HINT = {
    'claude-code': 'Run it once in a terminal, then start claude in your project folder.',
    codex: 'Paste it into ~/.codex/config.toml, then start codex.',
    gemini: 'Run it once in a terminal, then start gemini.',
    cursor: 'Save it as .cursor/mcp.json in your project. Cursor picks it up in Settings › MCP.',
    qwen: 'Run it once in a terminal, then start qwen.',
    mcp: 'Add an MCP server named tribecode in your tool: Streamable HTTP, this URL and this header.',
  };
  const glyph = (k, size = 18) => (window.TribeAgentsHub && window.TribeAgentsHub.glyph ? window.TribeAgentsHub.glyph(k, size) : '');
  const PLACES = [['here', 'This computer'], ['wifi', 'Same Wi-Fi'], ['anywhere', 'Anywhere']];

  // ---------- state that survives repaints ----------
  const LS = 'tribecode.fleet.tab';
  const st = {
    tab: (() => { try { const t = localStorage.getItem(LS); return TABS.some(x => x[0] === t) ? t : 'claude-code'; } catch { return 'claude-code'; } })(),
    place: '', keys: {}, minting: {}, test: {}, stay: false,
    open: {}, drafts: {}, cmd: {}, data: null, scope: 'project',
  };
  const keyFor = kind => st.keys[`${pidNow()}:${kind}`];

  // ---------- data ----------
  async function load(scope) {
    if (!hasTribe()) return null;
    const d = await C.api('/agents/fleet' + (scope === 'all' ? '?scope=all' : ''));
    st.data = d; return d;
  }
  const mine = d => (d && d.agents || []).filter(a => a.yours);
  function heroState(d) {
    if (!hasTribe()) return 'notribe';
    if (!d) return 'loading';
    const top = (d.next || [])[0];
    if (st.stay) return 'connect';
    if (top && top.kind === 'approval') return 'next';
    if (!d.connected && d.you && d.you.canAct) return 'connect';
    return 'next';
  }

  // ---------- hero ----------
  function hero(d, opts = {}) {
    const s = heroState(d), id = opts.id || 'ad-hero';
    const head = (eyebrow, title, lead) => `<span class="eyebrow">${esc(eyebrow)}</span><h2 class="fl-title">${title}</h2>${lead ? `<p class="fl-lead">${lead}</p>` : ''}`;
    if (s === 'loading') return `<section class="hero-card fl-hero" id="${id}" data-state="loading">${head('Next step', 'Looking at your agents…')}</section>`;
    if (s === 'notribe') return `<section class="hero-card fl-hero" id="${id}" data-state="notribe">${head('Next step', 'Start a project first', 'Agents join a tribe\'s project: they read its plan, take its tasks and work on its code, next to you and your friends.')}
      <div class="fl-acts"><button class="btn primary" id="fl-start">Start a project</button><button class="btn" id="fl-demo">Try the demo</button></div></section>`;
    if (s === 'connect') {
      return `<section class="hero-card fl-hero" id="${id}" data-state="connect">${head('Next step', 'Connect your AI', 'Pick the tool you use and run one line. It joins this project, reads the plan and asks you before anything ships.')}
        <div class="fl-tabs" role="tablist" aria-label="Your AI tool">${TABS.map(([k, n]) => `<button type="button" role="tab" class="fl-tab${k === st.tab ? ' on' : ''}" aria-selected="${k === st.tab}" data-fl-tab="${k}">${glyph(k, 15)}<span>${esc(n)}</span></button>`).join('')}</div>
        <div class="fl-connect" id="fl-connect">${connectBody()}</div>
        <p class="fl-more"><button class="linkish" id="ad-tools" type="button">VS Code, Windsurf, Claude.ai and more →</button></p></section>`;
    }
    const top = (d.next || [])[0];
    if (!top) {
      const n = (d.agents || []).length;
      return `<section class="hero-card fl-hero" id="${id}" data-state="calm">${head('Next step', n ? 'All quiet' : 'No agents here yet', n ? 'Your agents are connected and nothing is waiting on you. Give one a task when you\'re ready.' : 'Nobody has connected an agent to this project yet.')}
        ${n ? '' : '<div class="fl-acts"><button class="btn primary" data-fl-go="connect">Connect your AI</button></div>'}</section>`;
    }
    const acts = {
      approval: `<button class="btn fl-ok" data-fl-ap="approve" data-id="${esc(top.approval)}" data-pj="${esc(top.project)}">Approve</button><button class="btn fl-no" data-fl-ap="deny" data-id="${esc(top.approval)}" data-pj="${esc(top.project)}">Deny</button>`,
      paused: `<button class="btn primary" data-fl-act="resume" data-id="${esc(top.agent)}">Resume</button>`,
      idle: `<button class="btn primary" data-fl-act="task" data-id="${esc(top.agent)}">Give it a task</button>`,
      tasks: (() => { const idle = (d.agents || []).find(a => a.status === 'idle' && a.project === top.project && (a.yours || (d.you || {}).host)); const t = (top.tasks || [])[0];
        return idle && t ? `<button class="btn primary" data-fl-give="${esc(t.id)}" data-id="${esc(idle.id)}">Give "${esc(t.title.length > 34 ? t.title.slice(0, 33) + '…' : t.title)}" to ${esc(idle.name)}</button>` : d.scope === 'all' ? '' : '<button class="btn" data-fl-go="tasks">Open the board</button>'; })(),
      offline: `<button class="btn" data-fl-act="cmd" data-id="${esc(top.agent)}">Show its connect command</button>`,
      working: '',
    }[top.kind] || '';
    return `<section class="hero-card fl-hero" id="${id}" data-state="next" data-next="${esc(top.kind)}">${head('Next step', esc(top.title), esc(top.sub || ''))}${acts ? `<div class="fl-acts">${acts}</div>` : ''}
      ${(d.next || []).length > 1 ? `<p class="fl-then">Then: ${(d.next || []).slice(1, 3).map(x => esc(x.title)).join(' · ')}</p>` : ''}</section>`;
  }
  function places(r) {
    const have = PLACES.filter(([w]) => r && r.setup && r.setup[w]);
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const pick = have.some(x => x[0] === st.place) ? st.place : (local && have.some(x => x[0] === 'here') ? 'here' : (have.find(x => x[0] === 'anywhere') || have.find(x => x[0] === 'wifi') || have[0] || [])[0]);
    return { have, pick };
  }
  function connectBody() {
    const r = keyFor(st.tab);
    if (!r) return `<p class="fl-wait">Making a key for ${esc((TABS.find(x => x[0] === st.tab) || [])[1])}…</p>`;
    const { have, pick } = places(r), s = (r.setup || {})[pick] || {};
    const blocks = (s.blocks || []).filter(b => !b.alt);
    const t = st.test[r.agent.id];
    return `${have.length > 1 ? `<div class="fl-places" role="radiogroup" aria-label="Where it runs">${have.map(([w, l]) => `<button type="button" role="radio" aria-checked="${w === pick}" class="fl-place${w === pick ? ' on' : ''}" data-fl-place="${w}">${esc(l)}</button>`).join('')}</div>` : ''}
      ${blocks.map((b, i) => `<div class="fl-cmd">${blocks.length > 1 || st.tab === 'cursor' || st.tab === 'codex' ? `<span class="eyebrow">${esc(b.label)}</span>` : ''}<pre class="fl-pre" ${i === 0 ? 'id="fl-cmd"' : ''} data-fl-text="${i}">${esc(b.text)}</pre></div>`).join('')}
      <div class="fl-acts">${blocks.map((b, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" type="button" ${i === 0 ? 'id="fl-copy"' : ''} data-fl-copy="${i}">${blocks.length > 1 ? `Copy ${esc(b.label.toLowerCase())}` : 'Copy'}</button>`).join('')}
        <button class="btn fl-test${t === 'ok' ? ' ok' : ''}" type="button" id="fl-test" aria-live="polite">${t === 'ok' ? '✓ Connected' : t === 'wait' ? 'Waiting for its first call…' : 'Test connection'}</button>
        ${t === 'ok' ? '<button class="btn" type="button" id="fl-done">Done</button>' : ''}</div>
      <p class="fl-hint">${esc(HINT[st.tab] || '')} It joins as <b>${esc(r.agent.name)}</b>.</p>`;
  }
  async function ensureKey(repaint) {
    const kind = st.tab, k = `${pidNow()}:${kind}`;
    if (st.keys[k] || st.minting[k] || !hasTribe()) return;
    st.minting[k] = true;
    try { st.keys[k] = await C.api('/agents', { method: 'POST', body: { kind } }); }
    catch (e) { toast(e.message); }
    finally { delete st.minting[k]; }
    repaint();
  }

  // ---------- rows ----------
  const STATUS = { working: 'Working', idle: 'Idle', paused: 'Paused', offline: 'Offline' };
  function statusText(a) {
    if (a.status === 'offline') return a.lastSeen ? `Offline · last seen ${ago(a.lastSeen)}` : 'Not connected yet';
    if (a.status === 'paused') return `Paused${a.control && a.control.seen === false ? ' · not seen yet' : ''}`;
    return `${STATUS[a.status]} · ${a.lastSeen ? ago(a.lastSeen) : 'now'}`;
  }
  function rowHtml(a, d) {
    const can = d.you && d.you.canAct, steer = a.yours || (d.you && d.you.host);
    const open = st.open[a.id];
    const owner = a.yours ? 'Yours' : `${a.ownerName}'s`;
    const now = a.task ? `<div class="fl-now"><span class="fl-k">Task</span><span><b>${esc(a.task.title)}</b>${a.branch ? ` <code>${esc(a.branch)}</code>` : ''}</span></div>` : '';
    const files = a.files.length ? `<div class="fl-now"><span class="fl-k">Files</span><span class="fl-files">${a.files.slice(0, 3).map(f => `<code>${esc(f)}</code>`).join('')}${a.files.length > 3 ? `<span class="fl-n">+${a.files.length - 3}</span>` : ''}</span></div>` : '';
    const recent = a.recent.length ? `<ol class="fl-recent" aria-label="Last things it did">${a.recent.map(x => `<li><span>${esc(x.text)}</span><time>${esc(ago(x.at))}</time></li>`).join('')}</ol>` : '';
    const btn = (act, label, cls = '') => `<button type="button" class="btn fl-b ${cls}${open === act ? ' on' : ''}" data-fl-act="${act}" data-id="${esc(a.id)}" aria-expanded="${open === act}">${label}</button>`;
    const acts = [
      can ? btn('msg', 'Message') : '',
      can ? btn('task', 'Give a task') : '',
      steer && a.status !== 'offline' || a.status === 'paused' ? (a.status === 'paused' ? btn('resume', 'Resume', 'agent') : btn('pause', 'Pause')) : '',
      a.yours ? btn('cmd', 'Connect command') : '',
      a.yours ? btn('remove', 'Remove', 'quiet') : '',
    ].join('');
    return `<article class="fl-row s-${esc(a.status)}" data-fl-agent="${esc(a.id)}" tabindex="0" aria-label="${esc(a.name)}, ${esc(statusText(a))}">
      <div class="fl-r-top"><span class="fl-glyph">${glyph(a.kind)}</span>
        <div class="fl-id"><b>${esc(a.name)}</b><span>${esc(owner)} · ${esc(a.kindLabel)}${d.scope === 'all' && a.projectName ? ` · ${esc(a.projectName)}` : ''}</span></div>
        <span class="fl-st st-${esc(a.status)}"><i aria-hidden="true"></i>${esc(statusText(a))}</span></div>
      ${now}${files}${recent}
      ${acts ? `<div class="fl-r-acts">${acts}</div>` : ''}
      ${open ? `<div class="fl-drawer">${drawer(a, open, d)}</div>` : ''}</article>`;
  }
  function drawer(a, mode, d) {
    const v = esc(st.drafts[`${a.id}:${mode}`] || '');
    if (mode === 'msg') return `<form class="fl-form" data-fl-form="msg" data-id="${esc(a.id)}"><input class="input" name="t" maxlength="2000" autocomplete="off" placeholder="Message ${esc(a.name)}…" value="${v}" aria-label="Message ${esc(a.name)}"><button class="btn primary">Send</button></form>
      <p class="fl-note">It reads this on its next check_messages, and it shows in #agents.</p>`;
    if (mode === 'task') {
      const sug = ((d.next || []).find(x => x.kind === 'tasks' && x.project === a.project) || {}).tasks || [];
      return `<form class="fl-form" data-fl-form="task" data-id="${esc(a.id)}"><input class="input" name="t" maxlength="200" autocomplete="off" placeholder="What should it do?" value="${v}" aria-label="A task for ${esc(a.name)}"><button class="btn primary">Give</button></form>
        ${sug.length ? `<div class="fl-sug"><span class="fl-k">Or take one</span>${sug.slice(0, 3).map(t => `<button type="button" class="fl-chip" data-fl-give="${esc(t.id)}" data-id="${esc(a.id)}">${esc(t.title)}</button>`).join('')}</div>` : ''}
        <p class="fl-note">It lands on the board assigned to ${esc(a.name)}, and the agent hears about it at once.</p>`;
    }
    if (mode === 'cmd') {
      const r = st.cmd[a.id];
      if (!r) return `<p class="fl-note">This makes a new key for ${esc(a.name)}. The old one stops working, so run the new command where it lives.</p><div class="fl-acts"><button type="button" class="btn primary" data-fl-rotate="${esc(a.id)}">Make a new key</button></div>`;
      const { pick } = places(r), s = (r.setup || {})[pick] || {}, b = (s.blocks || []).filter(x => !x.alt)[0] || { text: r.command || '' };
      return `<pre class="fl-pre" data-fl-rowcmd="${esc(a.id)}">${esc(b.text)}</pre><div class="fl-acts"><button type="button" class="btn primary" data-fl-rowcopy="${esc(a.id)}">Copy</button></div><p class="fl-note">New key ready. The old one stopped working.</p>`;
    }
    return '';
  }
  function rows(d, opts = {}) {
    if (!d) return '';
    const all = d.agents || [];
    // keys of yours that never connected (each tab of Connect your AI makes one) fold into one quiet line
    const unused = all.filter(a => a.yours && !a.everSeen && !a.task && !st.open[a.id]);
    let list = all.filter(a => !unused.includes(a));
    if (!list.length && (!unused.length || heroState(d) === 'connect')) return '';
    const spare = unused.length ? `<details class="fl-unused" id="fl-unused"${st.unusedOpen ? ' open' : ''}><summary>${unused.length} key${unused.length === 1 ? '' : 's'} you made that never connected</summary>
      <ul>${unused.map(a => `<li><span>${glyph(a.kind, 15)}${esc(a.name)} <small>${esc(a.kindLabel)}</small></span><span class="fl-u-acts"><button type="button" class="btn fl-b" data-fl-act="cmd" data-id="${esc(a.id)}">Connect command</button><button type="button" class="btn fl-b quiet" data-fl-act="remove" data-id="${esc(a.id)}">Remove</button></span></li>`).join('')}</ul></details>` : '';
    const working = list.filter(a => a.status === 'working').length;
    if (!list.length) return `<section class="fl-sec" id="fl-agents"><div class="sec-head"><span class="eyebrow">${d.scope === 'all' ? 'Yours, in every project' : 'Agents'}</span><h2>None connected yet</h2></div>${spare}</section>`;
    const eyebrow = d.scope === 'all' ? 'Yours, in every project' : 'Agents';
    return `<section class="fl-sec" id="fl-agents"><div class="sec-head"><span class="eyebrow">${eyebrow}</span><h2>${list.length} agent${list.length === 1 ? '' : 's'}${working ? ` · ${working} working` : ''}</h2></div>
      <div class="fl-rows">${list.map(a => rowHtml(a, d)).join('')}</div>${heroState(d) === 'connect' ? '' : spare}${opts.after || ''}</section>`;
  }

  // ---------- how agents work here: 4 steps, each with a small flat picture of the real thing ----------
  const ILL = [
    `<svg class="fl-ill" viewBox="0 0 160 92" aria-hidden="true"><rect class="i-win" x="4" y="6" width="152" height="80" rx="8"/><rect class="i-bar" x="4" y="6" width="152" height="16" rx="8"/><rect class="i-bar" x="4" y="14" width="152" height="8"/><circle class="i-dot" cx="15" cy="14" r="2.6"/><circle class="i-dot" cx="24" cy="14" r="2.6"/><circle class="i-dot" cx="33" cy="14" r="2.6"/>
      <text class="i-mono" x="12" y="38">$ claude mcp add</text><text class="i-mono" x="12" y="50">  tribecode http://…/mcp</text><circle class="i-live" cx="16" cy="70" r="4"/><text class="i-txt" x="25" y="73">Connected</text></svg>`,
    `<svg class="fl-ill" viewBox="0 0 160 92" aria-hidden="true"><rect class="i-win" x="4" y="6" width="96" height="80" rx="8"/><text class="i-mono" x="12" y="22">TRIBE_CONTEXT.md</text><rect class="i-line" x="12" y="31" width="76" height="4" rx="2"/><rect class="i-line" x="12" y="41" width="62" height="4" rx="2"/><rect class="i-line" x="12" y="51" width="70" height="4" rx="2"/><rect class="i-line" x="12" y="61" width="48" height="4" rx="2"/>
      <rect class="i-chip" x="88" y="56" width="68" height="26" rx="6"/><text class="i-sm" x="95" y="67">Your lane</text><text class="i-mono i-live-t" x="95" y="77">src/ui/</text></svg>`,
    `<svg class="fl-ill" viewBox="0 0 160 92" aria-hidden="true"><rect class="i-win" x="4" y="6" width="152" height="80" rx="8"/><rect class="i-chip" x="12" y="16" width="96" height="20" rx="5"/><text class="i-mono" x="20" y="30">src/game.js</text><text class="i-sm i-live-t" x="114" y="30">claimed</text>
      <path class="i-git" d="M20 50 v26 M20 58 q0 10 18 10 h30"/><circle class="i-node" cx="20" cy="50" r="4"/><circle class="i-node live" cx="72" cy="68" r="4"/><text class="i-mono" x="82" y="72">task/t-12</text></svg>`,
    `<svg class="fl-ill" viewBox="0 0 160 92" aria-hidden="true"><rect class="i-win" x="4" y="6" width="152" height="80" rx="8"/><text class="i-txt" x="14" y="26">Review task/t-12</text><text class="i-sm" x="14" y="40">Adds speed boots</text>
      <rect class="i-ok" x="14" y="52" width="62" height="24" rx="6"/><text class="i-btn" x="45" y="68" text-anchor="middle">Approve</text><rect class="i-no" x="84" y="52" width="58" height="24" rx="6"/><text class="i-btn" x="113" y="68" text-anchor="middle">Deny</text></svg>`,
  ];
  const STEPS = [
    ['Connect it', 'Run one line in your AI tool. It gets its own key; you can remove it any time.'],
    ['It reads the room', 'It reads TRIBE_CONTEXT.md (the plan, the rules) and your lane: the files and areas that are yours.'],
    ['It claims and builds', 'It claims the files it touches, so nobody collides, and works on its own branch.'],
    ['You approve', 'When it\'s ready it asks. You approve with one tap, here or from your phone.'],
  ];
  function how() {
    return `<section class="fl-sec fl-how" id="fl-how"><div class="sec-head"><span class="eyebrow">How it works</span><h2>How agents work here</h2></div>
      <ol class="fl-steps" aria-label="Connect, it reads TRIBE_CONTEXT and your lane, it claims files and works on a branch, you approve with one tap">${STEPS.map(([t, p], i) => `<li class="fl-step">${ILL[i]}<div><b><span class="fl-num">${i + 1}</span>${esc(t)}</b><p>${esc(p)}</p></div></li>`).join('')}</ol>
      <p class="fl-more"><button class="linkish" type="button" id="fl-guide">Read the Guide: agents and the Office →</button></p></section>`;
  }

  // ---------- events ----------
  function find(id) { return ((st.data && st.data.agents) || []).find(a => a.id === id) || null; }
  const pj = a => (a && a.project) || undefined;
  function wire(root, opts) {
    st.scope = opts.scope || 'project';
    root.__flOpts = opts;
    if (heroState(st.data) === 'connect' && !keyFor(st.tab)) ensureKey(() => paintHero(root));
    resumeTest(root);
    if (root.__flWired) return;
    root.__flWired = true;
    root.addEventListener('input', e => { const f = e.target.closest && e.target.closest('[data-fl-form]'); if (f) st.drafts[`${f.dataset.id}:${f.dataset.flForm}`] = e.target.value; });
    root.addEventListener('submit', e => { const f = e.target.closest && e.target.closest('[data-fl-form]'); if (!f) return; e.preventDefault(); submit(root, f); });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-fl-agent]')) openAgent(e.target.dataset.flAgent); });
    root.addEventListener('click', e => click(root, e));
    root.addEventListener('toggle', e => { if (e.target.id === 'fl-unused') st.unusedOpen = e.target.open; }, true);
  }
  const O = root => root.__flOpts || {};
  const reload = root => { const o = O(root); if (o.reload) o.reload(); };
  function paintHero(root) {
    const h = root.querySelector('.fl-hero'); if (!h) return;
    const id = h.id; const tmp = document.createElement('div'); tmp.innerHTML = hero(st.data, { id }); h.replaceWith(tmp.firstElementChild);
    resumeTest(root);
  }
  function paintRow(root, id) {
    const a = find(id), el = root.querySelector(`[data-fl-agent="${CSS.escape(id)}"]`);
    if (!a || !el) return;
    const tmp = document.createElement('div'); tmp.innerHTML = rowHtml(a, st.data); el.replaceWith(tmp.firstElementChild);
    const inp = root.querySelector(`[data-fl-agent="${CSS.escape(id)}"] .fl-form input`); if (inp) inp.focus({ preventScroll: true });
  }

  let testTimer = null, testAgent = null;
  function resumeTest(root) {
    const r = keyFor(st.tab); if (!r) return;
    if (st.test[r.agent.id] === 'wait' && testAgent !== r.agent.id) startTest(root, r.agent.id);
  }
  function startTest(root, agentId) {
    clearInterval(testTimer); testAgent = agentId; st.test[agentId] = 'wait'; st.stay = true;
    const tick = async () => {
      if (testAgent !== agentId || st.test[agentId] !== 'wait') return clearInterval(testTimer);
      try {
        const r = await C.api('/agents/mine'), a = (r.agents || []).find(x => x.id === agentId);
        if (a && a.online) { st.test[agentId] = 'ok'; clearInterval(testTimer); testAgent = null; toast(`${a.name} is connected.`); paintHero(document.body.contains(root) ? root : document); }
      } catch {}
    };
    tick(); testTimer = setInterval(tick, 1500);
  }
  if (C && C.on) C.on('presence', () => { if (testAgent) { const m = (C.state().members || []).find(x => x.id === testAgent); if (m && m.online && st.test[testAgent] === 'wait') { st.test[testAgent] = 'ok'; const id = testAgent; testAgent = null; clearInterval(testTimer); const root = document.querySelector('.fl-hero') && document.querySelector('.fl-hero').parentElement; if (root) paintHero(root); toast(`${m.name} is connected.`); void id; } } });

  async function act(root, b, fn, done) {
    b.disabled = true;
    try { await fn(); if (done) toast(done); setTimeout(() => reload(root), 120); } catch (e) { toast(e.message); b.disabled = false; }
  }
  function click(root, e) {
    const t = e.target; if (!t.closest) return;
    const b = t.closest('button');
    if (b && b.dataset.flTab) { st.tab = b.dataset.flTab; try { localStorage.setItem(LS, st.tab); } catch {} paintHero(root); ensureKey(() => paintHero(root)); return; }
    if (b && b.dataset.flPlace) { st.place = b.dataset.flPlace; paintHero(root); return; }
    if (b && b.dataset.flCopy !== undefined) {
      const pre = root.querySelector(`.fl-hero [data-fl-text="${b.dataset.flCopy}"]`); if (!pre) return;
      copy(pre.textContent).then(ok => copied(ok, b.dataset.flCopy === '0' ? 'Command' : 'Text'));
      return;
    }
    if (b && b.id === 'fl-test') { const r = keyFor(st.tab); if (r && st.test[r.agent.id] !== 'ok') { startTest(root, r.agent.id); paintHero(root); } return; }
    if (b && b.id === 'fl-done') { st.stay = false; reload(root); return; }
    if (b && b.id === 'ad-tools') { if (st.scope === 'project' && window.TribeShell) window.TribeShell.go('mcp-directory'); else if (window.TribeMcpDir) window.TribeMcpDir.open(); return; }
    if (b && b.id === 'fl-guide') { if (window.TribeGuide) window.TribeGuide.open('08-agents-and-office'); else toast('The Guide is in Help.'); return; }
    if (b && b.id === 'fl-start') { if (window.TribeSetup && typeof window.TribeSetup.start === 'function') window.TribeSetup.start(); else if (window.TribeApp && window.TribeApp.startFirst) window.TribeApp.startFirst().then(() => reload(root)); return; }
    if (b && b.id === 'fl-demo') { if (window.TribeOffline && window.TribeOffline.start) window.TribeOffline.start('showcase'); return; }
    if (b && b.dataset.flGo) {
      if (b.dataset.flGo === 'connect') { st.stay = true; paintHero(root); ensureKey(() => paintHero(root)); return; }
      if (b.dataset.flGo === 'tasks' && window.TribeApp) window.TribeApp.show('tasks');
      return;
    }
    if (b && b.dataset.flAp) { const v = b.dataset.flAp; return act(root, b, () => C.api(`/approvals/${encodeURIComponent(b.dataset.id)}/${v}`, { method: 'POST', body: {}, project: b.dataset.pj || undefined }), v === 'approve' ? 'Approved' : 'Denied'); }
    if (b && b.dataset.flGive) { const a = find(b.dataset.id); return act(root, b, () => C.api(`/agents/fleet/${encodeURIComponent(b.dataset.id)}/task`, { method: 'POST', body: { task: b.dataset.flGive }, project: pj(a) }), `Given to ${a ? a.name : 'the agent'}`); }
    if (b && b.dataset.flRotate) {
      const a = find(b.dataset.flRotate); if (!a) return;
      b.disabled = true;
      C.api('/agents', { method: 'POST', body: { kind: a.kind, ...(a.label ? { label: a.label } : {}) }, project: pj(a) })
        .then(r => { st.cmd[a.id] = r; paintRow(root, a.id); }, err => { toast(err.message); b.disabled = false; });
      return;
    }
    if (b && b.dataset.flRowcopy) { const pre = root.querySelector(`[data-fl-rowcmd="${CSS.escape(b.dataset.flRowcopy)}"]`); if (pre) copy(pre.textContent).then(ok => copied(ok)); return; }
    if (b && b.dataset.flAct) {
      const a = find(b.dataset.id), mode = b.dataset.flAct; if (!a) return;
      if (mode === 'pause' || mode === 'resume') return act(root, b, () => C.api(`/coord/agents/${encodeURIComponent(a.id)}/control`, { method: 'POST', body: { action: mode }, project: pj(a) }), mode === 'pause' ? `Asked ${a.name} to pause` : `${a.name} can carry on`);
      if (mode === 'remove') {
        if (!confirm(`Remove ${a.name}? Its key stops working at once.`)) return;
        return act(root, b, async () => { const o = await C.api('/agents/mine?id=' + encodeURIComponent(a.id), { method: 'DELETE', project: pj(a) }); toast(`Removed. ${o.remove || ''}`); });
      }
      st.open[a.id] = st.open[a.id] === mode ? null : mode;
      if (mode !== 'cmd') delete st.cmd[a.id];
      const row = root.querySelector(`[data-fl-agent="${CSS.escape(a.id)}"]`);
      if (row) { paintRow(root, a.id); const r2 = root.querySelector(`[data-fl-agent="${CSS.escape(a.id)}"]`); if (r2 && t.closest('.fl-hero')) r2.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      else reload(root);   // it was folded away (a key that never connected)
      return;
    }
    if (!b && !t.closest('a, input, textarea, pre, select, .fl-drawer')) { const row = t.closest('[data-fl-agent]'); if (row) openAgent(row.dataset.flAgent); }
  }
  async function submit(root, f) {
    const a = find(f.dataset.id), mode = f.dataset.flForm, inp = f.querySelector('input'), text = inp.value.trim();
    if (!a || !text) return;
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      if (mode === 'msg') { await C.api('/agents/channel', { method: 'POST', body: { text, to: a.id }, project: pj(a) }); toast(`Sent to ${a.name}.`); }
      else { await C.api(`/agents/fleet/${encodeURIComponent(a.id)}/task`, { method: 'POST', body: { title: text }, project: pj(a) }); toast(`Task given to ${a.name}.`); }
      delete st.drafts[`${a.id}:${mode}`]; st.open[a.id] = null; reload(root);
    } catch (e) { toast(e.message); btn.disabled = false; }
  }

  // ---------- an agent's preview in the right panel ----------
  // Inside a project: the shell's own agent detail. In the global fleet: a summary with "Open in tribe" (tap only).
  function openAgent(id) {
    const S = window.TribeShell, a = find(id);
    if (st.scope !== 'all' && S && S.previewAgent) return S.previewAgent(id);
    if (!a || !S || !S.preview) return;
    const sec = (eyebrow, inner) => `<section class="fl-pv-sec"><span class="eyebrow">${esc(eyebrow)}</span>${inner}</section>`;
    const html = `<div class="fl-pv"><div class="fl-pv-top"><span class="fl-glyph">${glyph(a.kind)}</span><div><b>${esc(a.name)}</b><small>${esc(a.yours ? 'Yours' : a.ownerName + "'s")} · ${esc(a.kindLabel)}</small></div></div>
      <p class="fl-st st-${esc(a.status)}"><i aria-hidden="true"></i>${esc(statusText(a))}</p>
      ${sec('Project', `<p>${esc(a.projectName || 'Not in a project yet')}</p>`)}
      ${sec('Now', a.task ? `<p><b>${esc(a.task.title)}</b>${a.branch ? ` <code>${esc(a.branch)}</code>` : ''}</p>` : '<p class="faint">No task</p>')}
      ${a.files.length ? sec('Files claimed', `<p class="fl-files">${a.files.slice(0, 6).map(f => `<code>${esc(f)}</code>`).join('')}</p>`) : ''}
      ${sec('Lately', a.recent.length ? `<ol class="fl-recent">${a.recent.map(x => `<li><span>${esc(x.text)}</span><time>${esc(ago(x.at))}</time></li>`).join('')}</ol>` : '<p class="faint">Nothing yet.</p>')}</div>`;
    S.preview({ kind: 'Agent', title: a.name, html, actions: a.project ? [{ label: 'Open in tribe', primary: true, run: () => openInTribe(a) }] : [] });
    const room = $('#tour-room'); if (room) room.dataset.agent = id;
  }
  async function openInTribe(a) {
    const S = window.TribeShell, PJ = window.TribeProjects;
    if (S && S.closePreview) S.closePreview();
    if (PJ && PJ.switchTo && PJ.current() !== a.project) { await PJ.switchTo(a.project); await new Promise(r => setTimeout(r, 250)); }
    if (S && S.go) S.go('agents');
  }

  // ---------- the global page (#/fleet) ----------
  let seq = 0;
  async function render(el, opts = {}) {
    const n = ++seq, scope = opts.scope || 'all';
    const paint = d => {
      const keep = document.activeElement && el.contains(document.activeElement) && document.activeElement.matches('input') ? document.activeElement.closest('[data-fl-form]') : null;
      el.innerHTML = `<div class="fl-page" id="fl-page">${hero(d, { id: 'fl-hero' })}${rows(d)}${how()}${opts.extra ? opts.extra(d) : ''}</div>`;
      wire(el, { scope, reload: () => { if (!opts.alive || opts.alive()) render(el, opts); } });
      if (keep) { const f = el.querySelector(`[data-fl-form="${keep.dataset.flForm}"][data-id="${CSS.escape(keep.dataset.id)}"] input`); if (f) f.focus({ preventScroll: true }); }
      if (opts.after) opts.after(d);
    };
    if (!hasTribe()) { st.data = null; return paint(null); }
    if (!el.querySelector('.fl-page')) paint(undefined);
    try { const d = await load(scope); if (n === seq && el.isConnected && (!opts.alive || opts.alive())) paint(d); }
    catch (e) { if (n === seq) { const h = el.querySelector('.fl-hero .fl-title'); if (h) h.textContent = 'The fleet could not load'; toast(e.message); } }
  }

  window.TribeFleet = { render, load, hero, rows, how, wire, openAgent, copy, state: () => st, setData: d => { st.data = d; } };
})();
