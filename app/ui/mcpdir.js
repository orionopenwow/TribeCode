// TribeCode MCP (#/mcp): a calm directory of the tools that can use this project through TribeCode's MCP server, like
// Notion's "Notion MCP" page. It reuses the one-tap "Connect your AI" sheet (app.js connectClaude + connectai.js) for
// every client: Connect mints that tool's own key and shows its exact setup. Connected lists your keys
// (GET /api/agents/mine) with Remove (DELETE /api/agents/mine?id=). Apps on this computer: special connections such as
// ArtCraft (server/connections.js), host only.
//   window.TribeMcpDir = { open(), close(), isOpen() }
// Opened from Agents Hub (a tab, shell.js), the sheet's "See all" chip, Settings, the palette and #/mcp.
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const NAME = 'mcp-directory', HASH = '#/mcp', LAST = 'tribecode.mcpdir.last';
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const isPhone = () => matchMedia('(max-width: 820px)').matches;

  // kind, name, one line, remote (needs the public https link): the one list in connectai.js. TribeCode works with
  // these tools; it isn't made by their vendors, and the marks below are simple original glyphs, not their logos.
  const CLIENTS = (window.TribeConnectAI && window.TribeConnectAI.directory ? window.TribeConnectAI.directory() : [['claude-code', 'Claude Code', 'Anthropic\'s terminal agent. One command.', false], ['mcp', 'Any MCP client', 'Anything else that speaks MCP: a URL and a key.', false]]);
  const COLOR = { 'claude-code': '#38C6B1', codex: '#10A37F', gemini: '#4C8DF6', qwen: '#7C5CFF', cursor: '#8A8F98', 'claude-desktop': '#FFB86B', mcp: '#E86A92',
    vscode: '#3E8EDE', windsurf: '#2BB5A0', zed: '#8C9BFF', cline: '#C7CDD6', goose: '#E8C15A', continue: '#B58CFF', 'claude-ai': '#D9825B', chatgpt: '#5BBF8E', artcraft: '#F2A65A', custom: '#8A8F98' };
  const MARK = {
    goose: '<path d="M7 20c0-5 3-7 7-8 2-.5 3-2 3-4a3 3 0 0 0-6 0"/><path d="M17 8h3"/>',
    continue: '<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>',
    'claude-ai': '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v5M9.5 10.5h5"/>',
    chatgpt: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" stroke-width="2.4"/>',
    artcraft: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><path d="M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01" stroke-width="2.4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  };
  const svg = (inner, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const SHARED = { vscode: 1, windsurf: 1, zed: 1, cline: 1, cursor: 1 };   // the same glyphs an invited agent of that kind wears (icons.js)
  const mark = (k, size = 22) => MARK[k] ? svg(MARK[k], size) : SHARED[k] && window.TribeIcons && window.TribeIcons.agent ? window.TribeIcons.agent(k, size) : window.TribeAgentsHub && window.TribeAgentsHub.glyph ? window.TribeAgentsHub.glyph(k, size) : svg('<circle cx="12" cy="12" r="7"/>', size);
  const tile = (k, emoji) => `<span class="mcd-tile" style="--k:${COLOR[k] || COLOR.custom}">${emoji ? `<span class="mcd-emo" aria-hidden="true">${esc(emoji)}</span>` : mark(k)}</span>`;
  const nameOf = k => (CLIENTS.find(c => c[0] === k) || [k, k])[1];

  let open = false, tab = 'discover', q = '', searchOn = false, hub = null, mine = null, conns = null, timer = null, adding = false, noteFlash = false, lastSig = '';
  function section() {
    let s = document.getElementById('view-' + NAME);
    if (!s) {   // mounted beside app.js views without touching index.html's sections
      const main = $('.main'); if (!main) return null;
      s = document.createElement('section'); s.id = 'view-' + NAME; s.className = 'hidden';
      const after = document.getElementById('view-agents-hub'); if (after && after.parentNode === main) after.after(s); else main.appendChild(s);
    }
    return s;
  }

  // ---------- view mounting (the same pattern as agentshub.js) ----------
  function show() {
    const sec = section(); if (!sec) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    delete document.body.dataset.scope;
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = 'TribeCode MCP';
    if (location.hash !== HASH) history.replaceState(null, '', location.pathname + location.search + HASH);
    try { C.sendActivity && C.sendActivity('TribeCode MCP'); } catch {}
    render(); load();
    clearInterval(timer); timer = setInterval(() => { if (open && !document.hidden) load(true); }, 8000);
    window.scrollTo(0, 0); const m = $('.main'); if (m) m.scrollTop = 0;
  }
  function hide() {
    const sec = section(); if (sec) sec.classList.add('hidden');
    open = false; clearInterval(timer);
    if (location.hash === HASH) history.replaceState(null, '', location.pathname + location.search);
  }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  const fromHash = () => { if (location.hash === HASH && !open) show(); };
  window.addEventListener('hashchange', fromHash);
  if (C && C.on) {
    C.on('hello', () => { setTimeout(fromHash, 50); if (open) load(true); });
    C.on('presence', () => { if (open) load(true); });
    C.on('ws', m => { if (open && m && m.type === 'connections') load(true); });
    C.on('project', () => { if (open) load(); });
  }
  setTimeout(fromHash, 0);
  // The sheet's "See all" chip (connectai.js) and any [data-mcpdir-open] link.
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-mcpdir-open]'); if (!t) return;
    e.preventDefault();
    const m = $('#invite-modal'); if (m && !m.classList.contains('hidden')) { m.classList.add('hidden'); const b = $('#invite-body'); if (b) b.classList.remove('np-setup', 'ii'); }
    const st = $('#settings-modal'); if (st && !st.classList.contains('hidden') && window.TribeSettings) window.TribeSettings.close();
    show();
  });

  // ---------- data ----------
  async function load(quiet) {
    if (!C.hasToken || !C.hasToken()) { render(); return; }
    try {
      const [h, m, cx] = await Promise.all([C.api('/agents/hub').catch(() => hub), C.api('/agents/mine').catch(() => mine), C.api('/connections').catch(() => conns)]);
      hub = h; mine = m; conns = cx;
    } catch {}
    // Quiet refreshes redraw only when something on the page changed (no DOM churn under the cursor).
    const sig = JSON.stringify([isPublic(), amHost(), myAgents().map(a => [a.id, a.online, a.name]), conns]);
    if (quiet && sig === lastSig) return;
    lastSig = sig;
    const ae = document.activeElement;
    if (quiet && ae && ae.closest && ae.closest('#view-mcp-directory') && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) { paintCounts(); return; }   // don't redraw under the cursor
    render();
  }
  const isPublic = () => !!(hub && hub.connect && hub.connect.public);
  const amHost = () => !!(hub && hub.you && hub.you.host) || ((C.state && C.state().me) || {}).role === 'host';
  const myAgents = () => ((mine && mine.agents) || []);
  const connectedKinds = () => new Set(myAgents().map(a => a.kind));
  // The hero's tool: the last one connected here, else the newest key you have, else Claude Code (Claude.ai on phones
  // when the tribe has a public link: no terminal needed).
  function likely() {
    const last = lsGet(LAST); if (last && CLIENTS.some(c => c[0] === last)) return last;
    const a = myAgents().slice(-1)[0]; if (a && CLIENTS.some(c => c[0] === a.kind)) return a.kind;
    return isPhone() && isPublic() ? 'claude-ai' : 'claude-code';
  }

  // ---------- render ----------
  function render() {
    const sec = section(); if (!sec || !open) return;
    if (!C.hasToken || !C.hasToken()) { sec.innerHTML = `<div class="mcd">${head()}<div class="hero-card"><span class="eyebrow">Not connected</span><h2>Start or join a tribe first</h2><p>Your tools connect to a tribe server, even when you're the only one in it.</p></div></div>`; wireHead(sec); return; }
    const k = likely(), n = myAgents().length;
    sec.innerHTML = `<div class="mcd">${head()}
      <section class="hero-card mcd-hero"><div class="mcd-hero-t"><span class="eyebrow">One tap</span><h2>Use your agent to drive TribeCode</h2>
        <p>Connect opens the setup for <b>${esc(nameOf(k))}</b>: a key of its own and the exact lines to paste. Remove it here any time.</p>
        <div class="hero-acts"><button class="btn primary" id="mcd-hero-go" data-kind="${esc(k)}"><span class="emo" aria-hidden="true">🔌</span>Connect</button><button class="btn ghost" id="mcd-pick">Pick another tool</button></div></div>
        <div class="mcd-hero-v" aria-hidden="true"><img src="assets/illustrations/cooperative.svg" alt="" width="240" height="165"></div></section>
      <div class="mcd-tabs" role="tablist" aria-label="Clients">
        <button role="tab" class="mcd-tab${tab === 'discover' ? ' on' : ''}" aria-selected="${tab === 'discover'}" data-tab="discover">Discover clients</button>
        <button role="tab" class="mcd-tab${tab === 'connected' ? ' on' : ''}" aria-selected="${tab === 'connected'}" data-tab="connected">Connected<span class="mcd-count" id="mcd-count">${n || ''}</span></button>
      </div>
      <div class="mcd-panel" id="mcd-panel">${tab === 'discover' ? discover() : connected()}</div>
      ${appsSection()}
      <p class="mcd-foot">Want your GitHub repository or calendar in TribeCode? <button class="linkish" id="mcd-repo">Code &amp; GitHub →</button> <button class="linkish" id="mcd-cal">Calendar →</button></p>
    </div>`;
    wire(sec);
  }
  const head = () => `<header class="sec-head mcd-head"><span class="eyebrow">TribeCode MCP</span><h1>Use TribeCode inside your tools</h1>
    <p class="mcd-lead">Let agents, apps and editors read the plan, claim tasks and post updates in this project through TribeCode's MCP server. <button class="linkish" id="mcd-how">How it works</button></p></header>`;
  function paintCounts() { const el = $('#mcd-count'); if (el) el.textContent = myAgents().length || ''; }

  function discover() {
    const words = q.trim().toLowerCase(), have = connectedKinds();
    const list = CLIENTS.filter(([k, n, d]) => !words || (n + ' ' + d + ' ' + k).toLowerCase().includes(words));
    const pub = isPublic(), host = amHost();
    const note = pub ? '' : `<div class="mcd-note${noteFlash ? ' flash' : ''}" id="mcd-public-note" role="note"><span class="emo" aria-hidden="true">🌐</span><div><b>Claude.ai and ChatGPT need the public link</b>
      <p>They connect from their own cloud, so they can only reach this tribe through its public https address.${host ? '' : ' Ask the host to turn it on.'}</p>
      ${host ? '<button class="btn mcd-btn" id="mcd-public">Turn on the public link</button>' : ''}</div></div>`;
    return `<div class="mcd-sec-head"><h2>Clients to use with TribeCode</h2>
        <button class="mcd-search-btn${searchOn ? ' on' : ''}" id="mcd-search-btn" aria-label="Search clients" aria-expanded="${searchOn}">${svg(MARK.search, 17)}</button></div>
      ${searchOn ? `<input class="input mcd-search" id="mcd-search" type="search" placeholder="Search clients" value="${esc(q)}" autocomplete="off" aria-label="Search clients">` : ''}
      ${note}
      <div class="mcd-grid" id="mcd-grid">${list.map(([k, n, d, remote]) => `<div class="mcd-row" data-kind="${esc(k)}">${tile(k)}
          <div class="mcd-id"><b>${esc(n)}${have.has(k) ? '<span class="mcd-on"><i></i>connected</span>' : ''}</b><span>${esc(d)}</span>${remote && !pub ? '<small class="mcd-need">Needs the public link</small>' : ''}</div>
          <button class="btn mcd-btn" data-enable="${esc(k)}"${remote && !pub ? ' data-needs-public="1"' : ''}>Connect</button></div>`).join('')}</div>
      ${list.length ? '' : `<p class="mcd-empty">No client by that name. Any tool that speaks MCP works: <button class="linkish" data-enable="mcp">use the URL and a key</button>.</p>`}`;
  }

  function connected() {
    const list = myAgents();
    if (!list.length) return `<div class="mcd-empty-card"><b>Nothing connected yet</b><p>Pick a client in Discover clients. Each one gets its own key, and you can remove it here at once.</p><button class="btn mcd-btn" data-tab="discover">Discover clients</button></div>`;
    return `<div class="mcd-list">${list.map(a => `<div class="mcd-row mcd-conn" data-agent="${esc(a.id)}">${tile(a.kind)}
        <div class="mcd-id"><b>${esc(a.name)}</b><span>${esc(nameOf(a.kind))}${a.label && a.label !== nameOf(a.kind) ? ' · ' + esc(a.label) : ''}</span></div>
        <span class="mcd-st${a.online ? ' live' : ''}"><i></i>${a.online ? 'live' : 'idle'}</span>
        <button class="btn ghost mcd-rm" data-remove="${esc(a.id)}">Remove</button></div>`).join('')}</div>
      <p class="mcd-hint">Remove stops that key at once. The tool keeps its settings until you take TribeCode out of it.</p>`;
  }

  // ---------- Apps on this computer: special connections (server/connections.js) ----------
  function appsSection() {
    if (!conns) return '';
    const local = !!conns.local, list = conns.connections || [], art = list.find(c => c.kind === 'artcraft');
    if (!local && !list.length) return `<section class="sec mcd-apps" id="mcd-apps"><div class="mcd-sec-head"><h2>Apps on this computer</h2></div><p class="mcd-hint">Creative apps such as ArtCraft connect on the host's computer. Open TribeCode there to add one.</p></section>`;
    const cards = local ? [art ? connCard(art) : artcraftOffer(), ...list.filter(c => c !== art).map(connCard)] : list.map(readCard);
    return `<section class="sec mcd-apps" id="mcd-apps"><div class="mcd-sec-head"><h2>Apps on this computer</h2>${local ? '' : '<span class="mcd-ro">Open on the host\'s computer</span>'}</div>
      <p class="mcd-hint">${local ? 'Open an app from here and watch its export folder: new images and videos land in Files and Visuals, with a line in chat.' : 'The host opens these on their computer. New renders show up in Files.'}</p>
      <div class="mcd-cards">${cards.join('')}</div>
      ${local ? (adding ? addForm() : '<button class="btn mcd-btn mcd-add" id="mcd-add">+ Add a special connection</button>') : ''}</section>`;
  }
  function artcraftOffer() {
    const found = conns.detect && conns.detect.artcraft;
    return `<article class="mcd-card" data-offer="artcraft"><div class="mcd-card-top">${tile('artcraft')}<div class="mcd-id"><b>ArtCraft</b><span>Open-source studio for AI images and video. Not connected yet.</span></div></div>
      <p class="mcd-path">${found ? `Found at <code>${esc(found)}</code>` : 'Not found in the usual place. Paste where it is installed.'}</p>
      ${found ? '' : `<div class="mcd-field"><input class="input" id="mcd-art-path" placeholder="${esc(winLike() ? 'C:\\Program Files\\ArtCraft' : '/Applications/ArtCraft.app')}" spellcheck="false" aria-label="ArtCraft path">${canPick() ? '<button class="btn" data-pick="#mcd-art-path">Browse</button>' : ''}</div>`}
      <div class="mcd-acts"><button class="btn mcd-btn" id="mcd-art-add">Connect ArtCraft</button></div></article>`;
  }
  const winLike = () => (conns && conns.platform === 'win32') || /Win/i.test(navigator.platform);
  const canPick = () => !!(window.TribeHost && window.TribeHost.isDesktop && window.TribeHost.pickFolder);
  function connCard(c) {
    const status = c.watching ? `Watching${c.imported ? ` · ${c.imported} imported` : ''}${c.lastImport ? ` · last ${new Date(c.lastImport).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}` : 'Not watching a folder';
    return `<article class="mcd-card" data-conn="${esc(c.id)}"><div class="mcd-card-top">${c.kind === 'artcraft' ? tile('artcraft') : tile('custom', c.emoji)}<div class="mcd-id"><b>${esc(c.name)}</b><span>${esc(status)}</span></div></div>
      <label class="mcd-lab" for="app-${esc(c.id)}">App</label><div class="mcd-field"><input class="input" id="app-${esc(c.id)}" data-f="app" value="${esc(c.app)}" placeholder="Full path to the app (optional)" spellcheck="false"></div>
      <label class="mcd-lab" for="watch-${esc(c.id)}">Watch folder</label><div class="mcd-field"><input class="input" id="watch-${esc(c.id)}" data-f="watch" value="${esc(c.watch)}" placeholder="Its export folder (optional)" spellcheck="false">${canPick() ? `<button class="btn" data-pick="#watch-${esc(c.id)}">Browse</button>` : ''}</div>
      ${c.kind === 'custom' ? `<label class="mcd-lab" for="link-${esc(c.id)}">Web link</label><div class="mcd-field"><input class="input" id="link-${esc(c.id)}" data-f="link" value="${esc(c.link)}" placeholder="https://… (optional)" spellcheck="false"></div>` : ''}
      <div class="mcd-acts"><button class="btn mcd-btn" data-save="${esc(c.id)}">Save</button>${c.hasApp ? `<button class="btn mcd-btn" data-launch="${esc(c.id)}">Open ${esc(c.name)}</button>` : ''}${c.link ? `<a class="btn ghost" href="${esc(c.link)}" target="_blank" rel="noopener">Visit</a>` : ''}<span style="flex:1"></span><button class="btn ghost mcd-rm" data-cx-remove="${esc(c.id)}">Remove</button></div></article>`;
  }
  function readCard(c) {
    const sub = [c.watching ? 'New renders go to Files' : '', c.hasApp ? 'Opens on the host\'s computer' : ''].filter(Boolean).join(' · ') || 'On the host\'s computer';
    return `<article class="mcd-card ro" data-conn="${esc(c.id)}"><div class="mcd-card-top">${c.kind === 'artcraft' ? tile('artcraft') : tile('custom', c.emoji)}<div class="mcd-id"><b>${esc(c.name)}</b><span>${esc(sub)}</span></div>${c.link ? `<a class="btn ghost" href="${esc(c.link)}" target="_blank" rel="noopener">Visit</a>` : ''}</div></article>`;
  }
  function addForm() {
    return `<form class="mcd-card mcd-form" id="mcd-form"><div class="mcd-card-top"><b>Add a special connection</b></div>
      <div class="mcd-two"><div><label class="mcd-lab" for="nx-name">Name</label><input class="input" id="nx-name" maxlength="40" placeholder="Blender, Aseprite…" required></div>
        <div class="mcd-emo-f"><label class="mcd-lab" for="nx-emoji">Emoji</label><input class="input" id="nx-emoji" maxlength="4" value="🔗"></div></div>
      <label class="mcd-lab" for="nx-app">App path</label><div class="mcd-field"><input class="input" id="nx-app" placeholder="Optional" spellcheck="false"></div>
      <label class="mcd-lab" for="nx-watch">Watch folder</label><div class="mcd-field"><input class="input" id="nx-watch" placeholder="Optional" spellcheck="false">${canPick() ? '<button class="btn" type="button" data-pick="#nx-watch">Browse</button>' : ''}</div>
      <label class="mcd-lab" for="nx-link">Web link</label><div class="mcd-field"><input class="input" id="nx-link" placeholder="Optional" spellcheck="false"></div>
      <div class="mcd-acts"><button class="btn mcd-btn" type="submit">Add</button><button class="btn ghost" type="button" id="mcd-add-cancel">Cancel</button></div></form>`;
  }

  // ---------- actions ----------
  function enable(kind, btn) {
    const remote = btn && btn.dataset.needsPublic;
    if (remote && !isPublic()) {   // nothing to paste yet: point at the note instead of minting a useless key
      noteFlash = true; const n = $('#mcd-public-note'); if (n) { n.classList.add('flash'); n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      toast(`${nameOf(kind)} needs this tribe's public link first.`); return;
    }
    lsSet(LAST, kind);
    if (window.TribeApp && window.TribeApp.connectClaude) window.TribeApp.connectClaude({ tool: kind, fresh: true });
    const m = $('#invite-modal');   // when the sheet closes, show the new key under Connected
    if (m) { const ob = new MutationObserver(() => { if (m.classList.contains('hidden')) { ob.disconnect(); load(true); } }); ob.observe(m, { attributes: true, attributeFilter: ['class'] }); }
  }
  function wireHead(sec) { const h = $('#mcd-how', sec); if (h) h.onclick = () => window.TribeGuide ? window.TribeGuide.open('03-connect-claude-code') : toast('The guide is in Help.'); }
  function wire(sec) {
    wireHead(sec);
    const go = $('#mcd-hero-go', sec); if (go) go.onclick = () => enable(go.dataset.kind, CLIENTS.find(c => c[0] === go.dataset.kind && c[3]) ? { dataset: { needsPublic: '1' } } : null);
    const pick = $('#mcd-pick', sec); if (pick) pick.onclick = () => { tab = 'discover'; render(); const g = $('#mcd-grid'); if (g) g.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    sec.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    sec.querySelectorAll('[data-enable]').forEach(b => b.onclick = () => enable(b.dataset.enable, b));
    const sb = $('#mcd-search-btn', sec); if (sb) sb.onclick = () => { searchOn = !searchOn; if (!searchOn) q = ''; render(); const i = $('#mcd-search'); if (i) i.focus(); };
    const si = $('#mcd-search', sec); if (si) si.oninput = () => {
      q = si.value; const grid = $('#mcd-panel');
      const pos = si.selectionStart; grid.innerHTML = discover(); wire(sec);
      const n = $('#mcd-search'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} }
    };
    const pub = $('#mcd-public', sec); if (pub) pub.onclick = async () => {
      pub.disabled = true; pub.textContent = 'Turning on…';
      try { await C.api('/share/public', { method: 'POST', body: {} }); toast('The public link is on.'); noteFlash = false; load(); }
      catch (e) { toast(e.message); pub.disabled = false; pub.textContent = 'Turn on the public link'; }
    };
    sec.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => {
      const a = myAgents().find(x => x.id === b.dataset.remove);
      if (!confirm(`Remove ${a ? a.name : 'this connection'}? Its key stops working at once.`)) return;
      try { const o = await C.api('/agents/mine?id=' + encodeURIComponent(b.dataset.remove), { method: 'DELETE' }); toast(`Removed. ${o.remove || ''}`); load(true); } catch (e) { toast(e.message); }
    });
    const rp = $('#mcd-repo', sec); if (rp) rp.onclick = () => window.TribeApp && window.TribeApp.show('repo');
    const cal = $('#mcd-cal', sec); if (cal) cal.onclick = () => window.TribeApp && window.TribeApp.show('calendar');
    wireApps(sec);
  }
  async function cx(path, opts, ok) {
    try { const r = await C.api('/connections' + path, opts); if (ok) toast(ok); conns = await C.api('/connections'); render(); return r; } catch (e) { toast(e.message); return null; }
  }
  function wireApps(sec) {
    sec.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => { try { const p = await window.TribeHost.pickFolder(); if (p) { const i = $(b.dataset.pick); if (i) i.value = p; } } catch (e) { toast(e.message); } });
    const aa = $('#mcd-art-add', sec); if (aa) aa.onclick = () => { const i = $('#mcd-art-path'); cx('', { method: 'POST', body: { kind: 'artcraft', ...(i && i.value.trim() ? { app: i.value.trim() } : {}) } }, 'ArtCraft is connected. Pick its export folder to send new renders to Files.'); };
    sec.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
      const card = b.closest('[data-conn]'), body = {};
      card.querySelectorAll('[data-f]').forEach(i => { body[i.dataset.f] = i.value.trim(); });
      cx('/' + encodeURIComponent(b.dataset.save), { method: 'PATCH', body }, 'Saved.');
    });
    sec.querySelectorAll('[data-launch]').forEach(b => b.onclick = () => cx('/' + encodeURIComponent(b.dataset.launch) + '/launch', { method: 'POST' }, 'Opening it on this computer…'));
    sec.querySelectorAll('[data-cx-remove]').forEach(b => b.onclick = () => { if (confirm('Remove this connection? Files already copied stay in Files.')) cx('/' + encodeURIComponent(b.dataset.cxRemove), { method: 'DELETE' }, 'Removed.'); });
    const add = $('#mcd-add', sec); if (add) add.onclick = () => { adding = true; render(); const n = $('#nx-name'); if (n) n.focus(); };
    const cancel = $('#mcd-add-cancel', sec); if (cancel) cancel.onclick = () => { adding = false; render(); };
    const form = $('#mcd-form', sec); if (form) form.onsubmit = async e => {
      e.preventDefault();
      const body = { kind: 'custom', name: $('#nx-name').value.trim(), emoji: $('#nx-emoji').value.trim(), app: $('#nx-app').value.trim(), watch: $('#nx-watch').value.trim(), link: $('#nx-link').value.trim() };
      try { await C.api('/connections', { method: 'POST', body }); adding = false; toast(`${body.name} is connected.`); conns = await C.api('/connections'); render(); } catch (err) { toast(err.message); }
    };
  }

  window.TribeMcpDir = { open: show, close: hide, isOpen: () => open };
})();
