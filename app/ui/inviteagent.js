// Invite your agent: the one way a person's own AI agent joins (server/inviteagent.js). It is the "Your AI agent" choice
// of the one invite sheet (inviteone.js), which calls mount(el) to draw it. It began as Invite your Claude; Claude is
// now one kind among several, and a person can have one of each kind.
//   The picker: Claude Code, Claude Desktop, Claude on the web, Cursor, Codex CLI, ChatGPT, Gemini CLI, VS Code,
//     Windsurf, Cline, Zed and Something else. Each shows short numbered steps, the exact thing to paste (Copy, and
//     Download where it is a file) and one line on how it behaves. All of that text comes from the server
//     (preview.setups, built by server/agentshub.js setupFor): nothing about a tool's setup is written in this file.
//   No agent of that kind yet: the setup is shown with the key masked. The agent member is made when you press Copy or
//     Download, never when the sheet opens. Apps that sign in (Claude on the web, ChatGPT) get an address with no key
//     in it and a TribeCode page to approve on. Then "Waiting for your Cursor…" turns into "✓ Campw's Cursor joined".
//   Already have one (also a tool from Connect your AI): it is shown as already connected, with what it may do (chat,
//     docs, tasks, files, website, approvals), "Let it act as me for admin", Pause, Remove and its sign-ins. Two of
//     one kind (from before there was one way) both show, with a hint to merge them. A new key is one deliberate tap.
// Entry points: the sidebar row (#sf-claude), the People panel, the empty chat, the Agents Hub, Settings, Flint.
//   window.TribeInviteAgent = { open(opts), mount(el, opts), unmount(), access(el), card(), close(), icon(kind, size) }
//     open({ kind }): opens the one sheet on "Your AI agent". kind: a choice ('code', 'cursor', 'chatgpt'…) or a kind
//                     ('claude', 'gemini'…); an older tool name ('claude-code', 'claude-ai') works too.
//     access(el): every agent's permissions block, for Settings.   card(): a small HTML card for the Agents Hub.
//   window.TribeInviteClaude: the same functions under their first name; open() lands on Claude.
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, k) => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m, k) : null);
  const FROM_TOOL = { 'claude-code': 'code', 'claude-desktop': 'desktop', 'claude-ai': 'web', mcp: 'other', agent: 'other' };
  const KEY = 'tribecode.inviteclaude.kind';   // the last choice (the key keeps its first name so nobody's choice is lost)
  const API = '/invite-agent';
  let root = null, st = null, made = {}, pick = null, poll = 0, copiedCode = false, showSetup = {}, target = {}, ask = null;

  const icon = (kind, size = 16) => (window.TribeIcons && window.TribeIcons.agent ? window.TribeIcons.agent(kind, size) : '');
  const picks = () => (st && st.picks) || [];
  const kindOfPick = id => (picks().find(p => p.id === id) || { kind: 'claude' }).kind;
  const kind = () => kindOfPick(pick);
  const kindInfo = k => ((st && st.kinds) || []).find(x => x.id === k) || { id: k, label: 'agent', short: 'agent', name: 'your agent' };
  const your = k => `your ${k === 'other' ? 'agent' : kindInfo(k).short}`;
  const agentsOf = k => ((st && st.agents) || []).filter(a => a.agentKind === k);
  const setupOf = id => { const k = kindOfPick(id); return (made[k] && made[k].setups && made[k].setups[id]) || st.preview.setups[id]; };
  const nameOf = k => { const a = agentsOf(k)[0]; return a ? a.name : made[k] && made[k].agent ? made[k].agent.name : kindInfo(k).name; };

  function resolvePick(want) {
    const ps = picks(), has = id => ps.some(p => p.id === id);
    const w = FROM_TOOL[want] || want;
    if (w && has(w)) return w;
    let remembered = ''; try { remembered = localStorage.getItem(KEY) || ''; } catch {}
    const ofKind = w && ps.filter(p => p.kind === w);
    if (ofKind && ofKind.length) {
      if (ofKind.some(p => p.id === remembered)) return remembered;
      if (w === 'claude' && matchMedia('(max-width: 820px)').matches) return 'web';   // a phone has no terminal
      return ofKind[0].id;
    }
    if (has(remembered)) return remembered;
    return matchMedia('(max-width: 820px)').matches ? 'web' : 'code';
  }
  const alive = () => !!(root && root.isConnected);
  function unmount() { clearInterval(poll); poll = 0; made = {}; root = null; ask = null; }
  function close() { if (window.TribeInvite && window.TribeInvite.isOpen()) window.TribeInvite.close(); unmount(); }
  function open(opts) {
    if (!C || !C.connected || !C.connected()) { if (window.TribeApp && window.TribeApp.openInvite) window.TribeApp.openInvite(); return; }
    if (window.TribeInvite) window.TribeInvite.open({ ...(opts || {}), who: 'agent' });
  }

  async function mount(el, opts) {
    unmount(); root = el; if (!el) return;
    const me = C.state().me || {};
    if (me.role === 'agent' || me.role === 'spectator' || me.guest) { el.innerHTML = `<p class="io-calm">${me.role === 'spectator' ? 'Spectators watch along, so they can\'t bring an AI in.' : 'Guests can\'t bring an AI in.'}</p>`; return; }
    copiedCode = false; made = {}; target = {}; ask = null; showSetup = {};
    el.innerHTML = '<p class="lead">Getting it ready…</p>';
    try { st = await C.api(API); } catch (e) { if (alive()) el.innerHTML = `<p class="io-calm">Couldn't open this: ${esc(e.message)}</p>`; return; }
    if (!alive() || root !== el) return;
    pick = resolvePick(opts && opts.kind);
    // Already here: show it and its access. A new key would cut a running session off, so the setup waits behind a button.
    if (opts && opts.fresh) showSetup[kind()] = true;
    draw(); watch();
  }
  const setupShown = k => !!showSetup[k] || !agentsOf(k).length;
  const merge = r => { const { token, setups, code, desktop, web, url, kind: _k, ...rest } = r; st = { ...st, ...rest }; };
  // Copy or Download: this is when the agent member is made (or, for one that exists, gets its new key).
  async function ensureKey() {
    const k = kind();
    if (made[k]) return made[k];
    try { const r = await C.api(API, { method: 'POST', body: { kind: k, pick, ...(target[k] ? { id: target[k] } : {}) } }); made[k] = r; merge(r); showSetup[k] = true; }
    catch (e) { toast(e.message); return null; }
    return made[k];
  }
  const copy = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
  const block = b => `<div class="cai-block ic-block"><div class="cai-bl"><span class="eyebrow">${esc(b.label)}</span><button type="button" class="btn cai-copy" data-ic-copy="${esc(b.id)}">Copy</button></div><pre class="cai-pre"${b.id === 'code' ? ' id="cc-cmd"' : ''} data-ic-text="${esc(b.id)}">${esc(b.text)}</pre></div>`;
  const blockOf = id => (setupOf(pick).blocks || []).find(b => b.id === id);

  function statusHtml(c, k) {
    if (c && c.paused) return `<div class="ic-status paused" data-ic-status><span class="cc-dot"></span>Paused · ${esc(c.name)} can't do anything until you resume it</div>`;
    if (c && c.joined) return `<div class="ic-status on" data-ic-status><span class="ic-check" aria-hidden="true">✓</span>${esc(c.name)} ${c.via === 'connect' ? 'is already connected' : 'joined'}${c.online ? ' · online now' : ''}</div>`;
    return `<div class="ic-status" data-ic-status><span class="cc-dot"></span>Waiting for ${esc(your(k || (c && c.agentKind) || 'claude'))}…</div>`;
  }
  // The line under the picker: nothing made yet / waiting / joined.
  function topStatus() {
    const k = kind(), list = agentsOf(k), s = setupOf(pick);
    if (list.length) return list.length === 1 ? `<div id="ic-status">${statusHtml(list[0], k)}</div>` : '<div id="ic-status"></div>';
    if (made[k] || (s.signin && s.available)) return `<div id="ic-status">${statusHtml(null, k)}</div>`;
    const cap = your(k); return `<div id="ic-status"><div class="ic-status ic-idle" data-ic-status>Nothing is made yet. ${esc(cap[0].toUpperCase() + cap.slice(1))} gets its key when you press Copy${(s.blocks || []).some(b => b.file && !b.alt) ? ' or Download' : ''}.</div></div>`;
  }
  function pickerHtml() {
    const have = new Set(((st && st.agents) || []).map(a => a.agentKind));
    return `<div class="cai-chips ic-kinds" role="tablist" aria-label="Which agent">${picks().map(p => `<button type="button" role="tab" class="cai-chip ic-chip${p.id === pick ? ' on' : ''}" aria-selected="${p.id === pick}" data-ic-kind="${esc(p.id)}" data-ic-family="${esc(p.kind)}" title="${esc(p.sub)}${have.has(p.kind) ? ' · already here' : ''}">${icon(p.kind, 14)}<span>${esc(p.name)}</span>${have.has(p.kind) ? '<i class="ic-has" aria-label="already here"></i>' : ''}</button>`).join('')}</div>`;
  }
  function setupHtml() {
    const k = kind(), s = setupOf(pick), has = agentsOf(k).length > 0;
    if (!setupShown(k)) {
      return `<p class="ic-note faint">To connect it on another computer, make a new key. The old one stops working, so a session running now needs the new setup too.</p>
        <button type="button" class="btn" id="ic-new">New key and setup</button>`;
    }
    if (!s.available) return `<div class="ic-need"><p>${esc(s.why)}</p><button type="button" class="btn primary" id="ic-public">Work with friends anywhere</button></div>`;
    const masked = !made[k];
    const hint = masked && has && !s.signin ? '<p class="ic-note faint">Copy makes a new key. The old one stops working at that moment.</p>' : '';
    const main = s.blocks.filter(b => !b.alt), alt = s.blocks.filter(b => b.alt), file = main.find(b => b.file);
    // Claude Code's steps follow the Copy button: step 1 is struck through and step 2 says where to paste.
    const steps = pick === 'code' && copiedCode ? [['done', esc(s.steps[0])], ['now', '<b>Copied — paste it in your terminal</b> and press Enter.'], ...s.steps.slice(2).map(t => ['', esc(t)])] : s.steps.map(t => ['', esc(t)]);
    return `<ol class="cai-steps ic-steps">${steps.map(([c, t]) => `<li${c ? ` class="${c}"` : ''}>${t}</li>`).join('')}</ol>
      ${hint}${main.map(block).join('')}
      ${file ? `<div class="ic-row"><button type="button" class="btn" id="ic-dl" data-ic-dl="${esc(file.id)}">Download ${esc(file.file)}</button>${s.note ? `<span class="faint ic-small">${esc(s.note)}</span>` : ''}</div>` : s.note ? `<p class="faint ic-small ic-filenote">${esc(s.note)}</p>` : ''}
      ${alt.map(b => `<details class="cai-alt"><summary>${esc(b.label)}</summary>${block(b)}${b.file ? `<div class="ic-row"><button type="button" class="btn sm" data-ic-dl="${esc(b.id)}">Download ${esc(b.file)}</button></div>` : ''}${b.nokey && !s.signin && pick !== 'other' ? `<p class="faint ic-small ic-filenote">It opens a TribeCode page in your browser: approve it there, and it joins as ${esc(s.as)}.</p><div class="ic-approve" id="ic-approve">${approveHtml()}</div>` : ''}</details>`).join('')}
      ${pick === 'code' ? '<details class="cc-what"><summary>What\'s a terminal?</summary><p>The window where you type commands. On Windows, open the Start menu, type <b>PowerShell</b> and press Enter. On a Mac, open <b>Terminal</b> (Applications › Utilities). Paste the line, press Enter, and Claude Code joins. No Claude Code yet? Install it first, then come back to this line.</p></details>' : ''}
      ${s.signin ? `<div class="ic-approve" id="ic-approve">${approveHtml()}</div>` : ''}
      <p class="ic-behaves ic-small"><span class="ic-bdot" aria-hidden="true"></span><span>${esc(s.behaves)}${s.docs ? ` Exact menus can change between versions: <a href="${esc(s.docs)}" target="_blank" rel="noopener">its MCP docs</a>.` : ''}</span></p>
      ${s.bridge ? '<p class="faint ic-small ic-nomcp">An AI that can\'t use MCP at all (a chat page with no connectors)? <button type="button" class="linkish" id="ic-bridge">Use the copy-and-paste bridge</button></p>' : ''}`;
  }
  // An app that signs in: the TribeCode page it opens may be on an address this browser isn't signed in to (the host
  // uses localhost, the app opens the public one). That page then shows a short code; typing it here approves from the app.
  function approveHtml() {
    if (ask) return `<p class="ic-askline"><b>${esc(ask.client)}</b> wants to join as <b>${esc(nameOf(ask.kind || kind()))}</b>. It will return to <b>${esc(ask.host)}</b>.${ask.loopback ? ' That is an app on a computer, not a website.' : ''}</p>
      <div class="ic-row"><button type="button" class="btn primary" id="ic-ask-yes">Approve</button><button type="button" class="btn" id="ic-ask-no">Not now</button></div>`;
    return `<label class="ic-codelab" for="ic-code">Did the page show a code? Type it here to approve.</label>
      <div class="ic-row"><input class="input ic-code" id="ic-code" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234" aria-label="Approval code"><button type="button" class="btn" id="ic-code-go">Check</button></div>`;
  }
  function connectionsHtml(c) {
    const list = c.connections || []; if (!list.length) return '';
    const when = t => { try { return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };
    return `<div class="ic-conns"><span class="eyebrow">Signed in</span><ul class="ic-connlist">${list.map(g => `<li><span><b>${esc(g.client)}</b><small>${esc(g.host)} · since ${esc(when(g.created))} · last used ${esc(when(g.used))}</small></span><button type="button" class="btn sm" data-ic-revoke="${esc(g.id)}">Sign out</button></li>`).join('')}</ul></div>`;
  }
  // One agent's block. first: it carries the ids older callers know (#ic-access, #ic-admin, #ic-pause, #ic-remove).
  // head: show whose block this is (two of one kind in the sheet; every agent in Settings).
  function accessHtml(c, first, head, twin) {
    const on = new Set(c.scopes || []), inv = c.via === 'invite';
    return `<section class="ic-access"${first ? ' id="ic-access"' : ''} data-ic-of="${esc(c.id)}" data-ic-agentkind="${esc(c.agentKind)}">
      ${head ? `<div class="ic-who"><span class="ic-kicon" aria-hidden="true">${icon(c.agentKind, 16)}</span><b>${esc(c.name)}</b><span class="ppl-ai">AI</span><small class="faint">${inv ? 'invited by you' : 'from Connect your AI'}</small></div>${statusHtml(c)}` : ''}
      <div class="ic-ah"><span class="eyebrow">What it can do</span><span class="faint ic-small">Everything you can, never more</span></div>
      <div class="ic-scopes">${(st.all || []).map(s => `<label class="ic-scope"><input type="checkbox" data-ic-scope="${esc(s.id)}"${on.has(s.id) ? ' checked' : ''}><span>${esc(s.label)}</span></label>`).join('')}</div>
      ${st.canAdmin && inv ? `<label class="ic-scope ic-admin"><input type="checkbox" data-ic-admin${first ? ' id="ic-admin"' : ''}${c.adminAsMe ? ' checked' : ''}><span>Let it act as me for admin<small>Off by default. Host-only things (hosting, keys, backups) always stay yours.</small></span></label>` : ''}
      ${c.renameable ? `<div class="ic-row ic-rename"><label class="ic-small faint" for="ic-name-${esc(c.id)}">Its name</label><input class="input ic-name" id="ic-name-${esc(c.id)}" data-ic-name maxlength="32" value="${esc(c.name)}" autocomplete="off" spellcheck="false"><button type="button" class="btn sm" data-ic-rename>Rename</button></div>` : ''}
      ${connectionsHtml(c)}
      <div class="ic-row ic-ctl"><label class="ic-pause"><input type="checkbox" data-ic-pause${first ? ' id="ic-pause"' : ''}${c.paused ? ' checked' : ''}><span>Pause</span></label><span class="ic-flex"></span>${twin ? `<button type="button" class="btn sm" data-ic-keep title="Keep this one and remove the other">Keep only this one</button>` : ''}<button type="button" class="btn ic-remove" data-ic-remove${first ? ' id="ic-remove"' : ''}>Remove</button></div>
      ${first ? `<p class="faint ic-small">It can't read anyone's private messages, approve requests or invite people. ${inv ? `It's limited to ${esc(st.rate || 120)} actions a minute, and everything` : 'Everything'} it does is labelled ${esc(c.name)}.</p>` : ''}</section>`;
  }
  function draw() {
    if (!alive() || !st) return;
    const k = kind(), list = agentsOf(k), has = list.length > 0, K = kindInfo(k), plural = k === 'other' ? 'agents here' : `${K.short}s`;
    const others = (st.agents || []).filter(a => a.agentKind !== k);
    root.innerHTML = `${pickerHtml()}
      <p class="lead">${has ? (list[0].via === 'connect' && list.length === 1 ? `<b>${esc(list[0].name)}</b> is already connected, so there is nothing new to make. Narrow it, pause it or remove it here.` : `<b>${esc(list[0].name)}</b> works next to you, with your access and never more. Narrow it, pause it or remove it any time.`)
        : `It joins next to you as <b>${esc(nameOf(k))}</b>, with your access and never more. Narrow it, pause it or remove it any time.`}</p>
      ${topStatus()}
      ${list.length > 1 ? `<div class="ic-merge" id="ic-merge"><b>You have two ${esc(plural)}.</b> Both keep working. One is enough: pick the one you use with <b>Keep only this one</b>, and the other is removed.</div>` : ''}
      <div class="ic-setup" id="ic-setup">${setupHtml()}</div>
      ${list.map((c, i) => accessHtml(c, i === 0, list.length > 1, list.length > 1)).join('')}
      ${others.length ? `<p class="faint ic-small ic-also">Also yours, one of each kind: ${others.map(a => `<button type="button" class="linkish" data-ic-goto="${esc(a.agentKind)}">${esc(a.name)}</button>`).join(' · ')}</p>` : ''}
      <p class="faint ic-small ic-other">Qwen Code, Goose, Continue or another tool with a plain key of its own? <button type="button" class="linkish" id="ic-other">Connect another AI</button></p>`;
    wire();
  }
  function download(b) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([b.text], { type: /\.json$/.test(b.file) ? 'application/json' : 'text/plain' })); a.download = b.file;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function wire() {
    const body = root;
    body.querySelectorAll('[data-ic-kind]').forEach(b => b.onclick = () => { pick = b.dataset.icKind; ask = null; copiedCode = false; try { localStorage.setItem(KEY, pick); } catch {} draw(); });
    body.querySelectorAll('[data-ic-goto]').forEach(b => b.onclick = () => { pick = resolvePick(b.dataset.icGoto); ask = null; draw(); });
    body.querySelectorAll('[data-ic-copy]').forEach(b => b.onclick = async () => {
      const id = b.dataset.icCopy, first = blockOf(id); if (!first) return;
      // An address an app signs in with has no key in it: nothing to make. Everything else carries the key, so this is the moment.
      if (!first.nokey && (!await ensureKey() || !alive())) return;
      const ok = await copy((blockOf(id) || first).text);
      if (pick === 'code') copiedCode = true;
      draw(); watch();
      toast(ok ? (id === 'code' ? 'Copied — paste it in your terminal' : 'Copied') : 'Select the text and copy it.');
    });
    body.querySelectorAll('[data-ic-dl]').forEach(b => b.onclick = async () => {
      const id = b.dataset.icDl; if (!blockOf(id)) return;
      if (!await ensureKey() || !alive()) return;
      download(blockOf(id)); draw(); watch();
    });
    const pub = body.querySelector('#ic-public'); if (pub) pub.onclick = async () => {
      pub.disabled = true; pub.textContent = 'Turning it on…';
      try { await C.api('/share/public', { method: 'POST', body: {} }); st = { ...st, ...(await C.api(API)) }; made = {}; draw(); } catch (e) { pub.disabled = false; pub.textContent = 'Work with friends anywhere'; toast((C.state().me || {}).role === 'host' ? e.message : 'Ask the host to turn on "Work with friends anywhere" in Settings.'); }
    };
    const nk = body.querySelector('#ic-new'); if (nk) nk.onclick = () => { const k = kind(); showSetup[k] = true; delete made[k]; target[k] = (agentsOf(k)[0] || {}).id || ''; draw(); };
    const ot = body.querySelector('#ic-other'); if (ot) ot.onclick = () => { const A = window.TribeApp; close(); if (A && A.connectClaude) A.connectClaude({ tool: 'codex', fresh: true }); };
    const br = body.querySelector('#ic-bridge'); if (br) br.onclick = () => { close(); if (window.TribeAIBridge && window.TribeAIBridge.open) window.TribeAIBridge.open({}); else toast('The copy-and-paste bridge is in the Agents Hub: Use any free AI.'); };
    body.querySelectorAll('[data-ic-of]').forEach(sec => wireAccess(sec, sec.dataset.icOf, draw));
    wireApprove();
  }
  function wireApprove() {
    const go = root && root.querySelector('#ic-code-go'), inp = root && root.querySelector('#ic-code');
    const redraw = () => { const el = root && root.querySelector('#ic-approve'); if (el) { el.innerHTML = approveHtml(); wireApprove(); } };
    if (go && inp) {
      const check = async () => { const code = inp.value.trim(); if (!code) return inp.focus(); try { ask = { ...(await C.api('/agent-auth?code=' + encodeURIComponent(code))), code }; redraw(); } catch (e) { toast(e.message); } };
      go.onclick = check; inp.onkeydown = e => { if (e.key === 'Enter') check(); };
    }
    const yes = root && root.querySelector('#ic-ask-yes'), no = root && root.querySelector('#ic-ask-no');
    const send = async allow => { const a = ask; ask = null; try { const r = await C.api('/agent-auth', { method: 'POST', body: { code: a.code, allow } }); toast(allow ? `Approved. ${r.name || 'Your agent'} is signing in.` : 'Declined. Nothing was shared.'); st = { ...st, ...(await C.api(API)) }; draw(); } catch (e) { toast(e.message); redraw(); } };
    if (yes) yes.onclick = () => send(true); if (no) no.onclick = () => send(false);
  }
  // One agent's controls. `after` repaints whoever shows them (the sheet, or Settings).
  function wireAccess(sec, cid, after) {
    const mineOf = () => (st.agents || []).find(x => x.id === cid) || {};
    const put = async (patch, msg) => { try { Object.assign(st, await C.api(API, { method: 'PUT', body: { ...patch, id: cid } })); after(); toast(msg || 'Saved.'); } catch (e) { toast(e.message); } };
    const gone = async (id, msg) => { try { const r = await C.api(API + '?id=' + encodeURIComponent(id), { method: 'DELETE' }); for (const k of Object.keys(made)) if (made[k].agent && made[k].agent.id === id) delete made[k]; st = { ...st, ...(await C.api(API)) }; after(); toast(typeof msg === 'function' ? msg(r) : msg); } catch (e) { toast(e.message); } };
    sec.querySelectorAll('[data-ic-scope]').forEach(c => c.onchange = () => put({ scopes: [...sec.querySelectorAll('[data-ic-scope]:checked')].map(x => x.dataset.icScope) }));
    const ad = sec.querySelector('[data-ic-admin]'); if (ad) ad.onchange = () => put({ adminAsMe: ad.checked });
    const pa = sec.querySelector('[data-ic-pause]'); if (pa) pa.onchange = () => put({ paused: pa.checked }, pa.checked ? 'Paused. It can\'t do anything until you resume it.' : 'Resumed.');
    const rn = sec.querySelector('[data-ic-rename]'), ni = sec.querySelector('[data-ic-name]');
    if (rn && ni) { const go = () => put({ name: ni.value }, 'Renamed.'); rn.onclick = go; ni.onkeydown = e => { if (e.key === 'Enter') go(); }; }
    const rm = sec.querySelector('[data-ic-remove]'); if (rm) rm.onclick = () => gone(cid, r => `Removed. Its key stopped working.${r && r.remove ? (/^[a-z]+ mcp /.test(r.remove) ? ' In your terminal: ' : ' Then: ') + r.remove : ''}`);
    const kp = sec.querySelector('[data-ic-keep]'); if (kp) kp.onclick = () => {
      if (kp.dataset.sure !== '1') { kp.dataset.sure = '1'; kp.textContent = 'Remove the other one?'; kp.classList.add('ic-remove'); return; }
      const other = (st.agents || []).find(x => x.id !== cid && x.agentKind === mineOf().agentKind); if (other) gone(other.id, `Merged. ${other.name} was removed; its key stopped working.`);
    };
    sec.querySelectorAll('[data-ic-revoke]').forEach(b => b.onclick = async () => { b.disabled = true; try { Object.assign(st, await C.api(API + '/connections/' + encodeURIComponent(b.dataset.icRevoke), { method: 'DELETE' })); after(); toast('Signed out there. It has to sign in again to come back.'); } catch (e) { b.disabled = false; toast(e.message); } });
  }
  const paintStatus = () => { const el = root && root.querySelector('#ic-status'); if (!el) return; const tmp = document.createElement('div'); tmp.innerHTML = topStatus(); el.innerHTML = tmp.firstElementChild.innerHTML; };
  const sig = list => JSON.stringify((list || []).map(c => [c.id, c.name, c.paused, c.connections]));
  const joinedIds = list => new Set((list || []).filter(c => c.joined).map(c => c.id));
  const said = new Set();   // "✓ … joined" is said once per agent, whichever of the poll and the push sees it first
  function watch() {
    clearInterval(poll); poll = 0;
    if (!alive()) return;
    const tick = async () => {
      if (!alive() || !root.getClientRects().length) { clearInterval(poll); poll = 0; return; }   // closed (Esc, the backdrop, another sheet)
      try {
        const r = await C.api(API); if (!alive()) return;
        const before = sig(st.agents), was = joinedIds(st.agents);
        st = { ...st, ...r };
        if (before !== sig(r.agents)) draw(); else paintStatus();   // a sign-in made (or ended) one
        for (const c of r.agents || []) if (c.joined && c.via === 'invite' && !was.has(c.id) && !said.has(c.id)) { said.add(c.id); toast(`✓ ${c.name} joined`); }
      } catch {}
    };
    poll = setInterval(tick, 2000);
  }
  if (C && C.on) C.on('ws', m => {
    if (!m || m.type !== 'agent-joined' || !m.agent) return;
    if (alive() && st) { const c = (st.agents || []).find(x => x.id === m.agent.id); if (c) { c.joined = c.joined || new Date().toISOString(); c.online = true; } paintStatus(); }
    if (!said.has(m.agent.id)) { said.add(m.agent.id); toast(`✓ ${m.agent.name} joined`); }
  });

  // ---------- for other modules ----------
  // Every agent's permissions block (Settings renders it wherever it likes).
  async function access(el) {
    if (!el) return;
    try { st = await C.api(API); } catch (e) { el.innerHTML = `<p class="faint">${esc(e.message)}</p>`; return; }
    const paint = () => {
      const list = st.agents || [];
      if (!list.length) { el.innerHTML = '<p class="faint">You haven\'t invited an AI agent yet.</p><button type="button" class="btn primary" data-ic-open>Invite your agent</button>'; return; }
      const twins = k => list.filter(x => x.agentKind === k).length > 1;
      el.innerHTML = (list.length === 1 ? statusHtml(list[0]) : '') + list.map((c, i) => accessHtml(c, i === 0, list.length > 1, twins(c.agentKind))).join('')
        + '<p class="faint ic-small ic-more">One of each kind: your Claude, your Cursor, your Codex… <button type="button" class="linkish" data-ic-open>Invite another agent</button></p>';
      el.querySelectorAll('[data-ic-of]').forEach(sec => wireAccess(sec, sec.dataset.icOf, paint));
    };
    paint();
  }
  // A card for the Agents Hub: plain HTML, the button opens the sheet through a delegated click.
  const card = () => `<div class="ic-hubcard"><span class="ppl-ai">AI</span><div><b>Invite your agent</b><small>Claude, Cursor, Codex, ChatGPT, Gemini and more. It joins next to you, with your access and never more.</small></div><button type="button" class="btn sm" data-ic-open>Invite</button></div>`;
  // Anything with data-ic-open opens the sheet; data-ic-open="cursor" (a choice or a kind) opens it there.
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-ic-open]'); if (b) { e.preventDefault(); open(b.dataset.icOpen ? { kind: b.dataset.icOpen } : undefined); } });

  window.TribeInviteAgent = { open, mount, unmount, access, card, close, icon };
  // The first name of all this. open() with no kind lands on Claude, as it always did.
  window.TribeInviteClaude = { open: opts => open({ kind: 'claude', ...(opts || {}) }), mount, unmount, access, card, close };
})();
