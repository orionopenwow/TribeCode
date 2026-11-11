// Solo mode: "Your agents" (#/agents-hub). One calm screen for everything that works with you: Claude Code
// sessions, Claude Desktop (through the stdio bridge), any other MCP client, the local models at home and
// the Secretary. One card per agent with a kind glyph and color, live/idle, what it's doing, its lane and
// its last gist; connect buttons for each kind; revoke any key.
//   window.TribeAgentsHub = { open(), close(), glyph(kind) }
// Server: server/agentshub.js (GET /api/agents/hub), POST /api/agents { kind, label }, DELETE /api/agents/mine?id=.
// The view mounts in <section id="view-agents-hub"> (index.html) next to the app's own views; the shell nav
// opens it with TribeAgentsHub.open() or a link to #/agents-hub.
(function () {
  const C = window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const NAME = 'agents-hub';
  const GLYPH = {
    'claude-code': '<path d="M4 6.5 9 12l-5 5.5M12 18h8"/>',
    'claude-desktop': '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
    mcp: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/>',
    codex: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 10 3 2-3 2M12 15h5"/>',
    gemini: '<path d="M12 3c.6 4.6 3.4 7.4 9 9-5.6 1.6-8.4 4.4-9 9-.6-4.6-3.4-7.4-9-9 5.6-1.6 8.4-4.4 9-9z"/>',
    qwen: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2M16.5 16.5 20 20"/>',
    cursor: '<path d="m5 3 14 8-6 1.5L10 19z"/>',
    model: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><rect x="10" y="10" width="4" height="4"/>',
    secretary: '<path d="M6 3h10l3 3v15H6z"/><path d="M9 9h7M9 13h7M9 17h4"/>',
    office: '<rect x="3" y="9" width="18" height="11" rx="1"/><path d="M3 13h18M8 9V5h8v4M7 17h2M15 17h2"/>',
    host: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.8 2.4-5 .3 1.6 1 2.4 1.9 2.8C11 8.8 11 6 12 3z"/>',
  };
  const COLOR = { 'claude-code': '#38C6B1', codex: '#10A37F', gemini: '#4C8DF6', qwen: '#7C5CFF', cursor: '#8A8F98', 'claude-desktop': '#FFB86B', mcp: '#E86A92', model: '#9AE66E', secretary: '#F26B1D', host: '#F26B1D', office: '#6C7CFF' };
  const glyph = (k, size = 18) => `<svg class="ah-g" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${GLYPH[k] || GLYPH.mcp}</svg>`;
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const copy = async (t, msg = 'Copied.') => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { toast('Select the text and copy it.'); } };

  let office = null, data = null, open = false, connectKind = null, result = null, timer = null, stopWatch = null;
  const section = () => document.getElementById('view-' + NAME);

  // ---------- view mounting (beside app.js views, without touching them) ----------
  // From Home's sidebar (Agent fleet) the page belongs to the dashboard: the global sidebar stays. From a project
  // (Agents Hub) it belongs to that project.
  let fleet = false;
  function show(opts) {
    const sec = section(); if (!sec) return;
    fleet = !!(opts && opts.global);
    if (fleet) document.body.dataset.scope = 'global'; else delete document.body.dataset.scope;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    document.querySelectorAll('[data-nav].on, [data-go].on').forEach(b => b.classList.remove('on'));   // the app's nav: nothing of its own is current
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = fleet ? 'Agent fleet' : 'Your agents';
    const h = fleet ? '#/fleet' : '#/' + NAME;
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
    try { C.sendActivity && C.sendActivity('Your agents'); } catch {}
    load();
    clearInterval(timer); timer = setInterval(() => { if (open && !document.hidden) load(true); }, 15000);
  }
  function hide() {
    const sec = section(); if (sec) { sec.classList.add('hidden'); if (fleet) sec.innerHTML = ''; }   // feat/fleet: no second copy of the fleet's ids behind the project's view
    open = false; clearInterval(timer); delete document.body.dataset.scope;
    if (location.hash === '#/' + NAME || location.hash === '#/fleet') history.replaceState(null, '', location.pathname + location.search);
  }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  const fromHash = () => { if (location.hash === '#/' + NAME && !open) show(); };
  window.addEventListener('hashchange', fromHash);
  if (C && C.on) C.on('hello', () => { setTimeout(fromHash, 50); if (open) load(true); });
  let soon = null;
  if (C && C.on) C.on('presence', () => { if (open) { clearTimeout(soon); soon = setTimeout(() => { if (open) load(true); }, 400); } });
  if (C && C.on) C.on('ws', m => { if (open && m.type === 'openspace') C.api('/openspace').then(o => { office = o; drawOffice(); }).catch(() => {}); });
  if (C && C.on) C.on('project', () => { if (open) { result = null; load(); } });
  setTimeout(fromHash, 0);

  // ---------- data ----------
  async function load(quiet) {
    const sec = section(); if (!sec) return;
    if (fleet && window.TribeFleet) return loadFleet(sec, quiet);   // feat/fleet: the global Agent fleet
    if (!C.hasToken || !C.hasToken()) { sec.innerHTML = `<div class="ah">${head()}<div class="hero-card"><span class="eyebrow">Not connected</span><h2>Start or join a tribe first</h2><p>Your agents connect to a tribe server, even when you're the only one in it.</p></div></div>`; return; }
    try { [data, office] = await Promise.all([C.api('/agents/hub'), C.api('/openspace').catch(() => null)]); } catch (e) { if (!quiet) sec.innerHTML = `<div class="ah">${head()}<p class="faint">${esc(e.message)}</p></div>`; return; }
    if (quiet && document.activeElement && document.activeElement.closest && document.activeElement.closest('#view-agents-hub input, #view-agents-hub select')) return;   // don't redraw under the cursor
    render();
  }
  // The global Agent fleet: your agents in every project, the next step, how agents work; the Office stays at the end.
  function loadFleet(sec, quiet) {
    if (quiet && document.activeElement && document.activeElement.closest && document.activeElement.closest('#view-agents-hub input, #view-agents-hub select')) return;
    let root = sec.querySelector('#fl-root');
    if (!root) { sec.innerHTML = `<div class="ah ah-fleet">${head()}<div id="fl-root"></div></div>`; root = sec.querySelector('#fl-root'); }
    const officeSec = () => (C.hasToken && C.hasToken() ? `<section class="fl-sec" id="ah-office-sec"><div class="sec-head"><span class="eyebrow">Optional</span><h2><span class="emo" aria-hidden="true">🪑</span>Office</h2></div><div id="ah-office">${officeHtml()}</div></section>` : '');
    return window.TribeFleet.render(root, { scope: 'all', alive: () => open, extra: officeSec, after: () => { wireOffice(); if (C.hasToken && C.hasToken()) C.api('/openspace').then(o => { office = o; drawOffice(); }).catch(() => {}); } });
  }
  const head = () => fleet ? `<header class="sec-head ah-head"><span class="eyebrow">Every project</span><h1>Agent fleet</h1></header>` : `<header class="sec-head ah-head"><span class="eyebrow">Solo mode</span><h1>Your agents</h1></header>`;

  // ---------- constellation: this computer in the middle, agents and models around it ----------
  function constellation(nodes) {
    const W = 360, H = 200, cx = W / 2, cy = H / 2, n = nodes.length;
    const pos = nodes.map((x, i) => { const a = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2, rx = n > 6 ? 150 : 132, ry = n > 6 ? 78 : 70; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
    const lines = pos.map(([x, y], i) => `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${nodes[i].live ? nodes[i].color : 'var(--edge-pop)'}" stroke-width="1" ${nodes[i].live ? '' : 'stroke-dasharray="3 4"'}/>`).join('');
    const dots = pos.map(([x, y], i) => { const d = nodes[i]; return `<g class="ah-node${d.live ? ' live' : ''}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><title>${esc(d.title)}</title>
      <circle r="17" fill="var(--surface)" stroke="${d.live ? d.color : 'var(--edge-pop)'}" stroke-width="${d.live ? 2 : 1}"/><g transform="translate(-9 -9)" style="color:${d.color}">${glyph(d.kind, 18)}</g></g>`; }).join('');
    return `<svg class="ah-sky" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your agents around this computer"><ellipse cx="${cx}" cy="${cy}" rx="132" ry="70" fill="none" stroke="var(--edge)" stroke-width="1"/>${lines}
      <g transform="translate(${cx} ${cy})"><circle r="25" fill="var(--accent)"/><g transform="translate(-11 -11)" style="color:#fff">${glyph('host', 22)}</g></g>${dots}</svg>`;
  }

  function card(a) {
    const k = a.kind;
    return `<article class="ah-card${a.live ? ' live' : ''}" style="--k:${COLOR[k] || COLOR.mcp}" data-agent="${esc(a.id)}">
      <div class="ah-card-top"><span class="ah-glyph">${glyph(k)}</span>
        <div class="ah-id"><b data-person="${esc(a.id)}">${esc(TOOLK.has(k) ? a.name : a.label || a.name)}</b><span>${esc(a.kindLabel)}${a.ownerName ? ` · ${a.yours ? 'yours' : esc(a.ownerName) + "'s"}` : ''}</span></div>
        <span class="ah-st ${a.live ? 'live' : ''}"><i></i>${a.live ? 'live' : 'idle'}</span></div>
      <p class="ah-doing">${a.doing ? esc(a.doing) : `<span class="faint">${a.live ? 'Working' : a.since ? `Last seen ${ago(a.since)} ago` : 'Not connected yet'}</span>`}</p>
      ${a.lane && a.lane.length ? `<div class="ah-lane">${a.lane.map(l => `<code>${esc(l)}</code>`).join('')}</div>` : ''}
      ${a.last ? `<p class="ah-last"><span class="eyebrow">Last gist</span>${esc(a.last.text)} <time>${ago(a.last.at)}</time></p>` : ''}
      ${a.yours ? `<div class="ah-acts"><button class="btn ghost ah-revoke" data-revoke="${esc(a.id)}">Revoke key</button></div>` : ''}
    </article>`;
  }
  function secretaryCard(s) {
    if (!s) return '';
    const st = s.enabled ? (s.quiet ? 'quiet hours' : s.running ? 'thinking' : 'on') : 'off';
    return `<article class="ah-card ah-sec${s.enabled && !s.quiet ? ' live' : ''}" style="--k:${COLOR.secretary}">
      <div class="ah-card-top"><span class="ah-glyph">${glyph('secretary')}</span><div class="ah-id"><b>Secretary</b><span>Background notes · on the host</span></div>
        <span class="ah-st ${s.enabled && !s.quiet ? 'live' : ''}"><i></i>${st}</span></div>
      <p class="ah-doing">${s.enabled ? `Keeps the journal, the digest and the inspiration board${s.model ? ` with <code>${esc(s.model)}</code>` : ''}.` : '<span class="faint">Off. It reads what the tribe makes and keeps notes when it is on.</span>'}</p>
      ${s.lastRun ? `<p class="ah-last"><span class="eyebrow">Last run</span>${ago(s.lastRun)} ago</p>` : ''}
      <div class="ah-acts"><button class="btn ah-open-sec">Open Secretary</button></div>
    </article>`;
  }
  // Any coding agent that speaks MCP (feat/any-llm). TribeCode works with these tools; it isn't made by their vendors.
  const TILES = [
    ['claude-code', 'Claude Code', 'A terminal session on any computer. Name it to run several.'],
    ['codex', 'Codex CLI', 'OpenAI\'s terminal agent: one block in config.toml.'],
    ['gemini', 'Gemini CLI', 'Google\'s terminal agent: one command.'],
    ['qwen', 'Qwen Code', 'Qwen\'s terminal agent: one command.'],
    ['cursor', 'Cursor', 'The AI editor: one .cursor/mcp.json file.'],
    ['claude-desktop', 'Claude Desktop', 'The desktop app, through a tiny bridge on this computer.'],
    ['mcp', 'Any MCP client', 'Windsurf, VS Code Copilot, Goose, OpenCode…: a URL and a key.'],
  ];
  const TOOLK = new Set(['codex', 'gemini', 'qwen', 'cursor']);
  function render() {
    const sec = section(); if (!sec || !data) return;
    const ag = data.agents || [], models = data.models || { list: [] }, s = data.secretary;
    const live = ag.filter(a => a.live);
    const nodes = [...ag.map(a => ({ kind: a.kind, color: COLOR[a.kind] || COLOR.mcp, live: a.live, title: `${a.label || a.name} · ${a.live ? 'live' : 'idle'}` })),
      ...(s ? [{ kind: 'secretary', color: COLOR.secretary, live: s.enabled && !s.quiet, title: `Secretary · ${s.enabled ? 'on' : 'off'}` }] : []),
      ...models.list.slice(0, 4).map(m => ({ kind: 'model', color: COLOR.model, live: models.online, title: `${m} · local model` }))];
    const line = [live.length ? `${live.map(a => esc(a.label || a.name)).slice(0, 2).join(' and ')}${live.length > 2 ? ` and ${live.length - 2} more` : ''} ${live.length === 1 ? 'is' : 'are'} working` : ag.length ? 'Your agents are idle' : 'No agents connected yet',
      s ? (s.enabled ? 'the secretary is keeping notes' : 'the secretary is off') : '', models.online ? `${esc(models.default)} runs at home` : ''].filter(Boolean).join(', ') + '.';
    sec.innerHTML = `<div class="ah">${head()}
      <section class="hero-card ah-hero"><div class="ah-hero-t"><span class="eyebrow">Solo or together</span><h2>Everything that works with you, in one place</h2><p>${line}</p>
        <div class="hero-acts"><button class="btn primary" data-connect="claude-code">${glyph('claude-code', 15)}Connect an agent</button>${s ? '<button class="btn ah-open-sec">Secretary</button>' : ''}</div></div>
        <div class="ah-hero-v">${constellation(nodes)}</div></section>
      <section class="sec"><div class="sec-head"><span class="eyebrow">Connected</span><h2>Agents</h2></div>
        <div class="ah-grid">${secretaryCard(s)}${ag.map(card).join('')}${ag.length ? '' : '<div class="ah-empty">Connect your AI below: Claude Code, Codex CLI, Gemini CLI, Qwen Code, Cursor or any MCP client. Each gets its own key you can revoke.</div>'}</div></section>
      <section class="sec" id="ah-connect-sec"><div class="sec-head"><span class="eyebrow">Connect</span><h2>Add an agent</h2>${window.TribeMcpDir ? '<button class="linkish ah-all" data-mcpdir-open>Claude.ai, ChatGPT, VS Code and more →</button>' : ''}</div>
        <div class="ah-tiles">${TILES.map(([k, t, d]) => `<button class="ah-tile${connectKind === k ? ' on' : ''}" style="--k:${COLOR[k]}" data-connect="${k}" aria-expanded="${connectKind === k}"><span class="ah-glyph">${glyph(k)}</span><b>${t}</b><span>${d}</span></button>`).join('')}</div>
        <div class="ah-connect${connectKind ? '' : ' hidden'}" id="ah-connect">${connectKind ? connectPanel() : ''}</div></section>
      <section class="sec"><div class="sec-head"><span class="eyebrow">At home</span><h2><span class="emo" aria-hidden="true">🏠</span>Local models</h2></div>${modelsHtml(models, s)}</section>
      <section class="sec" id="ah-office-sec"><div class="sec-head"><span class="eyebrow">Optional</span><h2><span class="emo" aria-hidden="true">🪑</span>Office</h2></div><div id="ah-office">${officeHtml()}</div></section>
    </div>`;
    if (fleet) { const o = $('#ah-office-sec'), first = sec.querySelector('.ah > .sec'); if (o && first && o !== first) first.before(o); }   // Agent fleet: the Office leads
    wire();
  }
  function modelsHtml(models, s) {
    if (!models.online) return `<div class="ah-models-off"><span class="ah-glyph" style="--k:${COLOR.model}">${glyph('model')}</span><div><b>No local model yet</b><p>Install Ollama on the host (ollama.com), then <code>ollama pull qwen3</code>. Summaries and the secretary then run at home, without spending Claude tokens.</p></div></div>`;
    const host = data.you && data.you.host, cur = (s && s.model) || models.default;
    return `<div class="ah-models">${models.list.map(m => `<div class="ah-model${m === cur ? ' on' : ''}" style="--k:${COLOR.model}"><span class="ah-glyph">${glyph('model')}</span><div class="ah-id"><b>${esc(m)}</b><span>${m === models.default ? 'Default brain' : 'Installed'}${m === cur && s ? ' · the secretary thinks with it' : ''}</span></div>
      ${host && s ? (m === cur ? '<span class="ah-st live"><i></i>secretary</span>' : `<button class="btn ghost" data-model="${esc(m)}">Use for secretary</button>`) : ''}</div>`).join('')}</div>`;
  }

  // ---------- connect ----------
  function connectPanel() {
    const k = connectKind, def = { 'claude-code': '', 'claude-desktop': 'Claude Desktop', mcp: '' }[k] || '';
    const ph = { 'claude-code': 'laptop (optional)', 'claude-desktop': 'Claude Desktop', mcp: 'Windsurf, Goose, OpenCode…' }[k] || 'work laptop (optional)';
    let out = `<form class="ah-form" id="ah-form"><label class="eyebrow" for="ah-label">Name it</label><div class="ah-row"><input class="input" id="ah-label" maxlength="24" placeholder="${esc(ph)}" value="${esc(result && result.kind === k ? result.label || '' : def)}"><button class="btn primary" type="submit">${result && result.kind === k ? 'New key' : 'Create key'}</button></div>
      <p class="faint ah-note">${k === 'claude-code' ? 'Leave it empty for your main Claude Code. A name (laptop, work…) adds another one with its own key.' : TOOLK.has(k) ? 'Leave it empty for your main one. A name adds another with its own key. Agents can\'t vote, approve or invite people.' : 'Each name gets its own key. Agents can\'t vote, approve or invite people.'}</p></form>`;
    if (result && result.kind === k) out += k === 'claude-code' ? codeResult(result.r) : TOOLK.has(k) ? toolResult(result.r) : desktopResult(result.r, k);
    return out;
  }
  function codeResult(r) {
    const tabs = [['anywhere', 'Anywhere'], ['wifi', 'Same Wi-Fi'], ['here', 'This computer']].filter(([w]) => r.commands[w]);
    const where = result.where && r.commands[result.where] ? result.where : (tabs[0] || [])[0];
    const cmd = where ? r.commands[where] : r.command;
    return `<div class="ah-result"><div class="cc-tabs" role="tablist">${tabs.map(([w, l]) => `<button type="button" role="tab" class="cc-tab ${w === where ? 'on' : ''}" data-where="${w}">${l}</button>`).join('')}</div>
      <p class="ah-step">Run once in a terminal:</p><div class="linkbox"><code id="ah-cmd">${esc(cmd)}</code><button class="btn primary" data-copy="${esc(cmd)}">Copy</button></div></div>`;
  }
  // Codex CLI, Gemini CLI, Qwen Code, Cursor: 2-3 steps, the exact config with the real key, and live status.
  function whereTabs(r) {
    const s = r.setup || {}, tabs = [['anywhere', 'Anywhere'], ['wifi', 'Same Wi-Fi'], ['here', 'This computer']].filter(([w]) => s[w]);
    const where = result.where && s[result.where] ? result.where : (tabs[0] || [])[0];
    return { where, html: tabs.length > 1 ? `<div class="cc-tabs" role="tablist">${tabs.map(([w, l]) => `<button type="button" role="tab" class="cc-tab ${w === where ? 'on' : ''}" data-where="${w}">${l}</button>`).join('')}</div>` : '' };
  }
  function toolResult(r) {
    const t = whereTabs(r), s = (r.setup || {})[t.where];
    return `<div class="ah-result" data-setup-where="${esc(t.where || '')}">${t.html}${window.TribeConnectAI ? window.TribeConnectAI.setupHtml(s) : ''}
      <div class="cc-status cai-status" id="ah-status"><span class="cc-dot"></span>Waiting for it to connect…</div>
      <p class="faint ah-note">It joins as <b>${esc(r.agent.name)}</b>: it shows up in the room, claims files and posts gists like any agent.</p></div>`;
  }
  function desktopResult(r, k) {
    const d = r.desktop || {}, os = result.os || (/Mac/i.test(navigator.platform) ? 'mac' : /Win/i.test(navigator.platform) ? 'windows' : 'linux');
    const files = d.files || {};
    return `<div class="ah-result">
      ${k === 'mcp' ? `${window.TribeConnectAI ? window.TribeConnectAI.setupHtml((r.setup || {})[whereTabs(r).where]) : ''}
        <div class="cc-status cai-status" id="ah-status"><span class="cc-dot"></span>Waiting for it to connect…</div>
        <p class="ah-step">Clients that only speak stdio: use the bridge, same as Claude Desktop.</p>` : `<p class="ah-step">Add this to Claude Desktop's config file, then restart Claude Desktop.</p>`}
      <div class="cc-tabs" role="tablist">${[['windows', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux']].map(([o, l]) => `<button type="button" role="tab" class="cc-tab ${o === os ? 'on' : ''}" data-os="${o}">${l}</button>`).join('')}</div>
      <div class="ah-file"><span class="eyebrow">File</span><code id="ah-cfg-file">${esc(files[os] || '')}</code></div>
      <div class="ah-code"><pre id="ah-cfg">${esc(d.json || '')}</pre><button class="btn primary" data-copy-cfg>Copy</button></div>
      <p class="faint ah-note">Already have other servers in that file? Add the <code>tribecode</code> entry inside <code>mcpServers</code>. The bridge runs on this computer with Node; on another computer, <a href="${esc(C.base() + (d.bridge || '/api/agents/bridge.js'))}" download="mcp-stdio.js">download the bridge</a> and point the path at it. It never prints your key.</p></div>`;
  }
  async function createKey(label) {
    const k = connectKind;
    try {
      const r = await C.api('/agents', { method: 'POST', body: { kind: k, ...(label ? { label } : {}) } });
      result = { kind: k, label, r };
      toast(`Key ready for ${r.agent.label || r.agent.name}.`);
      await load(true);
      const p = $('#ah-connect'); if (p) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (e) { toast(e.message); }
  }

  // ---------- Office: Open Space (server/openspace.js), a pixel-art office for several Claude Code sessions ----------
  function officeHtml() {
    const o = office, k = COLOR.office;
    const intro = `<div class="ah-id"><b>Open Space</b><span>A pixel-art office where several Claude Code sessions work side by side, each at its own desk, on this tribe's repos. By Fantomiald, MIT.</span></div>`;
    if (!o) return '';
    if (o.hostOnly) return `<div class="ah-office" style="--k:${k}"><span class="ah-glyph">${glyph('office')}</span>${intro}<span class="ah-st${o.running ? ' live' : ''}"><i></i>${o.running ? 'open on the host' : 'host only'}</span></div>`;
    const t = o.tools || {}, miss = [!t.git && 'Git (git-scm.com)', !t.nodeOk && `Node ${o.need}+ (nodejs.org${t.node ? `, you have ${t.node}` : ''})`, !t.npm && 'npm'].filter(Boolean);
    const st = o.busy ? `<span class="ah-st live"><i></i>${esc(o.busy)}…</span>` : o.running ? '<span class="ah-st live"><i></i>running</span>' : o.installed ? '<span class="ah-st"><i></i>stopped</span>' : '';
    const on = !!(o.running || o.busy), can = !o.busy && !(miss.length && !o.installed) && !(o.running && !o.ours);
    const sw = `<button class="toggle ah-os-switch" role="switch" id="os-switch" aria-checked="${on}" aria-label="Open Space in TribeCode" ${can ? '' : 'disabled'}><span class="switch"></span></button>`;
    const acts = o.running && !o.busy ? '<button class="btn primary" id="os-open">Open the office</button>' : '';
    const need = !o.installed && miss.length ? `<p class="ah-os-need">Needs ${miss.join(', ')} on this computer first.</p>` : '';
    const note = o.installed ? `<p class="faint ah-os-note">Runs on this computer at <code>${esc(o.url)}</code> with ${o.roots} project folder${o.roots === 1 ? '' : 's'} on its desks${t.claude ? '' : ' · Claude Code is not installed here yet, the office needs it'}.</p>`
      : `<p class="faint ah-os-note">Turning it on the first time downloads it to <code>${esc(o.dir)}</code> and builds it (no install scripts run), then starts it.</p>`;
    const logs = (o.busy || o.error) && o.log && o.log.length ? `<pre class="ah-os-log">${esc(o.log.join('\n'))}</pre>` : '';
    return `<div class="ah-office" style="--k:${k}"><span class="ah-glyph">${glyph('office')}</span>${intro}${st}${sw}</div>${need}${o.error ? `<p class="ah-os-err">${esc(o.error)}</p>` : ''}${logs}<div class="ah-acts">${acts}</div>${note}`;
  }
  function drawOffice() { const el = $('#ah-office'); if (!el) return; el.innerHTML = officeHtml(); wireOffice(); }
  function wireOffice() {
    const act = (id, path, done) => { const b = $(id); if (b) b.onclick = async () => {
      b.disabled = true; b.textContent = path === 'install' ? 'Installing…' : path === 'stop' ? 'Stopping…' : 'Opening…';
      try { office = await C.api('/openspace/' + path, { method: 'POST' }); if (done) toast(done); } catch (e) { toast(e.message); try { office = await C.api('/openspace'); } catch {} }
      drawOffice();
    }; };
    act('#os-open', 'open', 'The office opened in your browser.');
    const sw = $('#os-switch'); if (sw) sw.onclick = async () => {
      const turnOn = sw.getAttribute('aria-checked') !== 'true'; sw.disabled = true; sw.setAttribute('aria-checked', String(turnOn));
      try {
        if (!turnOn) { office = await C.api('/openspace/stop', { method: 'POST' }); toast('Open Space is off.'); }
        else if (!office.installed) {   // first time: install in the background, then start when it's ready
          office = await C.api('/openspace/install', { method: 'POST' }); drawOffice();
          for (let i = 0; i < 600 && office && office.busy; i++) { await new Promise(r => setTimeout(r, 1000)); office = await C.api('/openspace'); drawOffice(); }
          if (office.installed) { office = await C.api('/openspace/start', { method: 'POST' }); toast('Open Space is on. Open the office to see your agents at their desks.'); }
        } else { office = await C.api('/openspace/start', { method: 'POST' }); toast('Open Space is on.'); }
      } catch (e) { toast(e.message); try { office = await C.api('/openspace'); } catch {} }
      drawOffice();
    };
  }

  function wire() {
    const sec = section();
    wireOffice();
    sec.querySelectorAll('[data-connect]').forEach(b => b.onclick = () => {
      const k = b.dataset.connect; connectKind = connectKind === k && b.classList.contains('ah-tile') ? null : k;
      if (result && result.kind !== connectKind) result = null;
      render(); if (connectKind) { const f = $('#ah-label'); if (f && !TOOLK.has(connectKind)) f.focus({ preventScroll: true }); $('#ah-connect-sec').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      if (connectKind && TOOLK.has(connectKind) && !(result && result.kind === connectKind)) createKey('');   // one tap: the key and the exact setup
    });
    sec.querySelectorAll('.ah-open-sec').forEach(b => b.onclick = () => window.TribeSecretary && window.TribeSecretary.open());
    const form = $('#ah-form'); if (form) form.onsubmit = e => { e.preventDefault(); createKey($('#ah-label').value.trim()); };
    sec.querySelectorAll('[data-where]').forEach(b => b.onclick = () => { result.where = b.dataset.where; render(); });
    sec.querySelectorAll('[data-os]').forEach(b => b.onclick = () => { result.os = b.dataset.os; render(); });
    sec.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy));
    if (result && result.r && result.r.setup && window.TribeConnectAI && (TOOLK.has(result.kind) || result.kind === 'mcp')) {   // tool setups: copy buttons + live "connected"
      const res = sec.querySelector('.ah-result'), w = whereTabs(result.r).where;
      if (res) window.TribeConnectAI.wire(res, result.r.setup[w] || {}, toast);
      const st = $('#ah-status'); if (st) { if (stopWatch) stopWatch(); stopWatch = window.TribeConnectAI.watch(result.r.agent.id, st, () => open); }
    }
    const cc = sec.querySelector('[data-copy-cfg]'); if (cc) cc.onclick = () => copy($('#ah-cfg').textContent, 'Config copied. Paste it into the file and restart Claude Desktop.');
    sec.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
      const a = (data.agents || []).find(x => x.id === b.dataset.revoke);
      if (!confirm(`Revoke the key for ${a ? a.label || a.name : 'this agent'}? It stops working at once.`)) return;
      try { const o = await C.api('/agents/mine?id=' + encodeURIComponent(b.dataset.revoke), { method: 'DELETE' }); toast(`Revoked. ${o.remove}`); if (result && result.r.agent.id === b.dataset.revoke) result = null; load(true); } catch (e) { toast(e.message); }
    });
    sec.querySelectorAll('[data-model]').forEach(b => b.onclick = async () => {
      try { await C.api('/secretary/config', { method: 'PUT', body: { model: b.dataset.model } }); toast(`The secretary now thinks with ${b.dataset.model}.`); load(true); } catch (e) { toast(e.message); }
    });
  }

  window.TribeAgentsHub = { open: show, close: hide, glyph, colors: COLOR, isOpen: () => open, fleet: () => open && fleet };
  if (location.hash === '#/fleet') setTimeout(() => show({ global: true }), 0);
})();
