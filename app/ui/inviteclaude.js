// Invite your Claude: the one way a person's Claude joins (server/inviteclaude.js). It is the "Your Claude" choice of the
// one invite sheet (inviteone.js), which calls mount(el) to draw it:
//   No Claude yet: pick Claude Code (one command), Claude Desktop (a config to paste or download) or Claude on the web
//     (an address for claude.ai; it signs in on a TribeCode page, so no key is in the address). The setup is shown with
//     the key masked: the Claude member is made when you press Copy or Download, never when the sheet opens. Then
//     "Waiting for your Claude…" turns into "✓ Campw's Claude joined".
//   Already have one (also one from Connect your AI): it is shown as already connected, with what it may do (chat,
//     docs, tasks, files, website, approvals), "Let it act as me for admin", Pause, Remove and its claude.ai sign-ins.
//     Two Claudes (from before there was one way) both show, with a hint to merge them. A new key is one deliberate tap.
// Entry points: the sidebar row (#sf-claude), the People panel, the empty chat, Connect your AI's Claude choices, Flint.
//   window.TribeInviteClaude = { open(opts), mount(el, opts), unmount(), access(el), card(), close() }
//     open():     opens the one sheet on "Your Claude" (kept for everything that already calls it).
//     access(el): the permissions block, for Settings.   card(): a small HTML card for the Agents Hub.
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, k) => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m, k) : null);
  const KINDS = [['code', 'Claude Code', 'In your terminal'], ['desktop', 'Claude Desktop', 'The desktop app'], ['web', 'Claude on the web', 'claude.ai']];
  const FROM_TOOL = { 'claude-code': 'code', 'claude-desktop': 'desktop', 'claude-ai': 'web' };
  const KEY = 'tribecode.inviteclaude.kind';
  let root = null, st = null, setupData = null, kind = null, poll = 0, copiedCode = false, showSetup = false, target = '', ask = null;

  function guessKind() {
    try { const k = localStorage.getItem(KEY); if (KINDS.some(x => x[0] === k)) return k; } catch {}
    if (matchMedia('(max-width: 820px)').matches) return 'web';   // a phone has no terminal
    return 'code';
  }
  const alive = () => !!(root && root.isConnected);
  function unmount() { clearInterval(poll); poll = 0; setupData = null; root = null; ask = null; }
  function close() { if (window.TribeInvite && window.TribeInvite.isOpen()) window.TribeInvite.close(); unmount(); }
  function open(opts) {
    if (!C || !C.connected || !C.connected()) { if (window.TribeApp && window.TribeApp.openInvite) window.TribeApp.openInvite(); return; }
    if (window.TribeInvite) window.TribeInvite.open({ ...(opts || {}), who: 'claude' });
  }

  async function mount(el, opts) {
    unmount(); root = el; if (!el) return;
    const me = C.state().me || {};
    if (me.role === 'agent' || me.role === 'spectator' || me.guest) { el.innerHTML = `<p class="io-calm">${me.role === 'spectator' ? 'Spectators watch along, so they can\'t bring an AI in.' : 'Guests can\'t bring an AI in.'}</p>`; return; }
    const k = opts && opts.kind; kind = KINDS.some(x => x[0] === k) ? k : FROM_TOOL[k] || guessKind();
    copiedCode = false; setupData = null; target = ''; ask = null;
    el.innerHTML = '<p class="lead">Getting it ready…</p>';
    try { st = await C.api('/invite-claude'); } catch (e) { if (alive()) el.innerHTML = `<p class="io-calm">Couldn't open this: ${esc(e.message)}</p>`; return; }
    if (!alive() || root !== el) return;
    // Already here: show it and its access. A new key would cut a running session off, so the setup waits behind a button.
    showSetup = !(st.claudes || []).length || !!(opts && opts.fresh);
    draw(); watch();
  }
  // Copy or Download: this is when the Claude member is made (or, for one that exists, gets its new key).
  async function ensureKey() {
    if (setupData) return setupData;
    try { setupData = await C.api('/invite-claude', { method: 'POST', body: target ? { id: target } : {} }); st = setupData; }
    catch (e) { toast(e.message); return null; }
    return setupData;
  }
  const copy = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
  const block = (label, text, id, extra) => `<div class="cai-block ic-block"><div class="cai-bl"><span class="eyebrow">${esc(label)}</span><button type="button" class="btn cai-copy" data-ic-copy="${esc(id)}">Copy</button></div><pre class="cai-pre"${extra || ''} data-ic-text="${esc(id)}">${esc(text)}</pre></div>`;
  // The text behind each Copy button, from a setup (the masked preview, or the real one once the key exists).
  function texts(s) {
    const o = { code: s.code.command, stdio: s.code.stdio, desktop: s.desktop.json };
    (s.code.alt || []).forEach((a, i) => { o['alt' + i] = a.command; });
    if (s.web && s.web.available) o.web = s.web.plain;
    return o;
  }
  const cur = () => setupData || st.preview;
  const myName = () => (setupData && setupData.agent ? setupData.agent.name : st.name || 'your Claude');

  function statusHtml(c) {
    const name = c ? c.name : myName();
    if (c && c.paused) return `<div class="ic-status paused" data-ic-status><span class="cc-dot"></span>Paused · ${esc(name)} can't do anything until you resume it</div>`;
    if (c && c.joined) return `<div class="ic-status on" data-ic-status><span class="ic-check" aria-hidden="true">✓</span>${esc(name)} ${c.via === 'connect' ? 'is already connected' : 'joined'}${c.online ? ' · online now' : ''}</div>`;
    return `<div class="ic-status" data-ic-status><span class="cc-dot"></span>Waiting for your Claude…</div>`;
  }
  // The line under the title: nothing made yet / waiting / joined.
  function topStatus() {
    const list = st.claudes || [];
    if (list.length) return list.length === 1 ? `<div id="ic-status">${statusHtml(list[0])}</div>` : '<div id="ic-status"></div>';
    if (setupData || kind === 'web') return `<div id="ic-status">${statusHtml(null)}</div>`;
    return `<div id="ic-status"><div class="ic-status ic-idle" data-ic-status>Nothing is made yet. Your Claude gets its key when you press Copy${kind === 'desktop' ? ' or Download' : ''}.</div></div>`;
  }
  function setupHtml() {
    if (!showSetup) {
      return `<p class="ic-note faint">To connect it on another computer, make a new key. The old one stops working, so a session running now needs the new setup too.</p>
        <button type="button" class="btn" id="ic-new">New key and setup</button>`;
    }
    const s = cur(), masked = !setupData;
    const tabs = `<div class="cai-chips ic-kinds" role="tablist" aria-label="Which Claude">${KINDS.map(([k, n, sub]) => `<button type="button" role="tab" class="cai-chip${k === kind ? ' on' : ''}" aria-selected="${k === kind}" data-ic-kind="${k}" title="${esc(sub)}">${esc(n)}</button>`).join('')}</div>`;
    const hint = masked && (st.claudes || []).length ? '<p class="ic-note faint">Copy makes a new key. The old one stops working at that moment.</p>' : '';
    let inner = '';
    if (kind === 'code') {
      inner = `<ol class="cai-steps ic-steps"><li class="${copiedCode ? 'done' : ''}">Copy this command.</li><li class="${copiedCode ? 'now' : ''}">${copiedCode ? '<b>Copied — paste it in your terminal</b> and press Enter.' : 'Paste it in your terminal and press Enter.'}</li><li>Start <code>claude</code> (or type <code>/mcp</code> in one that's running). It joins as ${esc(myName())}.</li></ol>
        ${hint}${block('Terminal', s.code.command, 'code', ' id="cc-cmd"')}
        ${(s.code.alt || []).map((a, i) => `<details class="cai-alt"><summary>From ${a.where === 'wifi' ? 'another computer on this Wi-Fi' : a.where === 'here' ? 'this computer' : 'anywhere'}</summary>${block('Terminal', a.command, 'alt' + i)}</details>`).join('')}
        <details class="cai-alt"><summary>Or the local bridge (stdio)</summary>${block('Terminal', s.code.stdio, 'stdio')}</details>
        <details class="cc-what"><summary>What's a terminal?</summary><p>The window where you type commands. On Windows, open the Start menu, type <b>PowerShell</b> and press Enter. On a Mac, open <b>Terminal</b> (Applications › Utilities). Paste the line, press Enter, and Claude Code joins. No Claude Code yet? Install it first, then come back to this line.</p></details>`;
    } else if (kind === 'desktop') {
      inner = `<ol class="cai-steps ic-steps">${s.desktop.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        ${hint}${block('claude_desktop_config.json', s.desktop.json, 'desktop')}
        <div class="ic-row"><button type="button" class="btn" id="ic-dl">Download config</button><span class="faint ic-small">Mac: ${esc(s.desktop.files.mac)} · Windows: ${esc(s.desktop.files.windows)}</span></div>`;
    } else if (s.web.available) {
      inner = `<ol class="cai-steps ic-steps">${s.web.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        ${block('Connector address (no key in it)', s.web.plain, 'web')}
        <div class="ic-approve" id="ic-approve">${approveHtml()}</div>`;
    } else {
      inner = `<div class="ic-need"><p>${esc(s.web.why)}</p><button type="button" class="btn primary" id="ic-public">Work with friends anywhere</button></div>`;
    }
    return tabs + inner;
  }
  // Claude on the web: the TribeCode page it opens may be on an address this browser isn't signed in to (the host uses
  // localhost, claude.ai opens the public one). That page then shows a short code; typing it here approves from the app.
  function approveHtml() {
    if (ask) return `<p class="ic-askline"><b>${esc(ask.client)}</b> wants to join as <b>${esc(myName())}</b>. It will return to <b>${esc(ask.host)}</b>.${ask.loopback ? ' That is an app on a computer, not a website.' : ''}</p>
      <div class="ic-row"><button type="button" class="btn primary" id="ic-ask-yes">Approve</button><button type="button" class="btn" id="ic-ask-no">Not now</button></div>`;
    return `<label class="ic-codelab" for="ic-code">Did the page show a code? Type it here to approve.</label>
      <div class="ic-row"><input class="input ic-code" id="ic-code" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234" aria-label="Approval code"><button type="button" class="btn" id="ic-code-go">Check</button></div>`;
  }
  function connectionsHtml(c) {
    const list = c.connections || []; if (!list.length) return '';
    const when = t => { try { return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };
    return `<div class="ic-conns"><span class="eyebrow">Signed in</span><ul class="ic-connlist">${list.map(g => `<li><span><b>${esc(g.client)}</b><small>${esc(g.host)} · since ${esc(when(g.created))} · last used ${esc(when(g.used))}</small></span><button type="button" class="btn sm" data-ic-revoke="${esc(g.id)}">Sign out</button></li>`).join('')}</ul></div>`;
  }
  function accessHtml(c, first, many) {
    const on = new Set(c.scopes || []), inv = c.via === 'invite';
    return `<section class="ic-access"${first ? ' id="ic-access"' : ''} data-ic-of="${esc(c.id)}">
      ${many ? `<div class="ic-who"><span class="ppl-ai">AI</span><b>${esc(c.name)}</b><small class="faint">${inv ? 'from Invite your Claude' : 'from Connect your AI'}</small></div>${statusHtml(c)}` : ''}
      <div class="ic-ah"><span class="eyebrow">What it can do</span><span class="faint ic-small">Everything you can, never more</span></div>
      <div class="ic-scopes">${(st.all || []).map(s => `<label class="ic-scope"><input type="checkbox" data-ic-scope="${esc(s.id)}"${on.has(s.id) ? ' checked' : ''}><span>${esc(s.label)}</span></label>`).join('')}</div>
      ${st.canAdmin && inv ? `<label class="ic-scope ic-admin"><input type="checkbox" data-ic-admin${first ? ' id="ic-admin"' : ''}${c.adminAsMe ? ' checked' : ''}><span>Let it act as me for admin<small>Off by default. Host-only things (hosting, keys, backups) always stay yours.</small></span></label>` : ''}
      ${connectionsHtml(c)}
      <div class="ic-row ic-ctl"><label class="ic-pause"><input type="checkbox" data-ic-pause${first ? ' id="ic-pause"' : ''}${c.paused ? ' checked' : ''}><span>Pause</span></label><span class="ic-flex"></span>${many ? `<button type="button" class="btn sm" data-ic-keep title="Keep this one and remove the other">Keep only this one</button>` : ''}<button type="button" class="btn ic-remove" data-ic-remove${first ? ' id="ic-remove"' : ''}>Remove</button></div>
      ${first ? `<p class="faint ic-small">It can't read anyone's private messages, approve requests or invite people. ${inv ? `It's limited to ${esc(st.rate || 120)} actions a minute, and everything` : 'Everything'} it does is labelled ${esc(c.name)}.</p>` : ''}</section>`;
  }
  function draw() {
    if (!alive() || !st) return;
    const list = st.claudes || [], has = list.length > 0;
    root.innerHTML = `<p class="lead">${has ? (list[0].via === 'connect' && list.length === 1 ? `<b>${esc(list[0].name)}</b> is already connected, so there is nothing new to make. Narrow it, pause it or remove it here.` : `<b>${esc(list[0].name)}</b> works next to you, with your access and never more. Narrow it, pause it or remove it any time.`)
        : `It joins next to you as <b>${esc(myName())}</b>, with your access and never more. Narrow it, pause it or remove it any time.`}</p>
      ${topStatus()}
      ${st.merge ? `<div class="ic-merge" id="ic-merge"><b>You have two Claudes.</b> Both keep working. One is enough: pick the one you use with <b>Keep only this one</b>, and the other is removed.</div>` : ''}
      <div class="ic-setup" id="ic-setup">${setupHtml()}</div>
      ${list.map((c, i) => accessHtml(c, i === 0, list.length > 1)).join('')}
      <p class="faint ic-small ic-other">Using Codex, Gemini CLI, Cursor or another AI? <button type="button" class="linkish" id="ic-other">Connect another AI</button></p>`;
    wire();
  }
  function wire() {
    const body = root;
    body.querySelectorAll('[data-ic-kind]').forEach(b => b.onclick = () => { kind = b.dataset.icKind; ask = null; try { localStorage.setItem(KEY, kind); } catch {} draw(); });
    body.querySelectorAll('[data-ic-copy]').forEach(b => b.onclick = async () => {
      const id = b.dataset.icCopy;
      // The address for claude.ai has no key in it: nothing to make. Everything else carries the key, so this is the moment.
      const s = id === 'web' ? cur() : await ensureKey(); if (!s || !alive()) return;
      const ok = await copy(texts(s)[id] || '');
      if (id === 'code' || id.startsWith('alt') || id === 'stdio') copiedCode = true;
      draw(); watch();
      toast(ok ? (id === 'code' ? 'Copied — paste it in your terminal' : 'Copied') : 'Select the text and copy it.');
    });
    const dl = body.querySelector('#ic-dl'); if (dl) dl.onclick = async () => {
      const s = await ensureKey(); if (!s || !alive()) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s.desktop.json], { type: 'application/json' })); a.download = 'claude_desktop_config.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      draw(); watch();
    };
    const pub = body.querySelector('#ic-public'); if (pub) pub.onclick = async () => {
      pub.disabled = true; pub.textContent = 'Turning it on…';
      try { await C.api('/share/public', { method: 'POST', body: {} }); st = { ...st, ...(await C.api('/invite-claude')) }; if (setupData) setupData = null; draw(); } catch (e) { pub.disabled = false; pub.textContent = 'Work with friends anywhere'; toast((C.state().me || {}).role === 'host' ? e.message : 'Ask the host to turn on "Work with friends anywhere" in Settings.'); }
    };
    const nk = body.querySelector('#ic-new'); if (nk) nk.onclick = () => { showSetup = true; setupData = null; target = (st.claudes[0] || {}).id || ''; draw(); };
    const ot = body.querySelector('#ic-other'); if (ot) ot.onclick = () => { const A = window.TribeApp; close(); if (A && A.connectClaude) A.connectClaude({ tool: 'codex', fresh: true }); };
    body.querySelectorAll('[data-ic-of]').forEach(sec => wireAccess(sec, sec.dataset.icOf, draw));
    wireApprove();
  }
  function wireApprove() {
    const go = root && root.querySelector('#ic-code-go'), inp = root && root.querySelector('#ic-code');
    const redraw = () => { const el = root && root.querySelector('#ic-approve'); if (el) { el.innerHTML = approveHtml(); wireApprove(); } };
    if (go && inp) {
      const check = async () => { const code = inp.value.trim(); if (!code) return inp.focus(); try { ask = { ...(await C.api('/claude-auth?code=' + encodeURIComponent(code))), code }; redraw(); } catch (e) { toast(e.message); } };
      go.onclick = check; inp.onkeydown = e => { if (e.key === 'Enter') check(); };
    }
    const yes = root && root.querySelector('#ic-ask-yes'), no = root && root.querySelector('#ic-ask-no');
    const send = async allow => { const a = ask; ask = null; try { const r = await C.api('/claude-auth', { method: 'POST', body: { code: a.code, allow } }); toast(allow ? `Approved. ${r.name || 'Your Claude'} is signing in.` : 'Declined. Nothing was shared.'); st = { ...st, ...(await C.api('/invite-claude')) }; draw(); } catch (e) { toast(e.message); redraw(); } };
    if (yes) yes.onclick = () => send(true); if (no) no.onclick = () => send(false);
  }
  // One Claude's controls. `after` repaints whoever shows them (the sheet, or Settings).
  function wireAccess(sec, cid, after) {
    const put = async (patch, msg) => { try { Object.assign(st, await C.api('/invite-claude', { method: 'PUT', body: { ...patch, id: cid } })); after(); toast(msg || 'Saved.'); } catch (e) { toast(e.message); } };
    const gone = async (id, msg) => { try { await C.api('/invite-claude?id=' + encodeURIComponent(id), { method: 'DELETE' }); if (setupData && setupData.agent && setupData.agent.id === id) setupData = null; st = { ...st, ...(await C.api('/invite-claude')) }; showSetup = showSetup || !(st.claudes || []).length; after(); toast(msg); } catch (e) { toast(e.message); } };
    sec.querySelectorAll('[data-ic-scope]').forEach(c => c.onchange = () => put({ scopes: [...sec.querySelectorAll('[data-ic-scope]:checked')].map(x => x.dataset.icScope) }));
    const ad = sec.querySelector('[data-ic-admin]'); if (ad) ad.onchange = () => put({ adminAsMe: ad.checked });
    const pa = sec.querySelector('[data-ic-pause]'); if (pa) pa.onchange = () => put({ paused: pa.checked }, pa.checked ? 'Paused. It can\'t do anything until you resume it.' : 'Resumed.');
    const rm = sec.querySelector('[data-ic-remove]'); if (rm) rm.onclick = () => gone(cid, 'Removed. Its key stopped working. In your terminal: claude mcp remove tribecode');
    const kp = sec.querySelector('[data-ic-keep]'); if (kp) kp.onclick = () => {
      if (kp.dataset.sure !== '1') { kp.dataset.sure = '1'; kp.textContent = 'Remove the other one?'; kp.classList.add('ic-remove'); return; }
      const other = (st.claudes || []).find(x => x.id !== cid); if (other) gone(other.id, `Merged. ${other.name} was removed; its key stopped working.`);
    };
    sec.querySelectorAll('[data-ic-revoke]').forEach(b => b.onclick = async () => { b.disabled = true; try { Object.assign(st, await C.api('/invite-claude/connections/' + encodeURIComponent(b.dataset.icRevoke), { method: 'DELETE' })); after(); toast('Signed out there. It has to sign in again to come back.'); } catch (e) { b.disabled = false; toast(e.message); } });
  }
  const paintStatus = () => { const el = root && root.querySelector('#ic-status'); if (!el) return; const tmp = document.createElement('div'); tmp.innerHTML = topStatus(); el.innerHTML = tmp.firstElementChild.innerHTML; };
  function watch() {
    clearInterval(poll); poll = 0;
    if (!alive()) return;
    const tick = async () => {
      if (!alive() || !root.getClientRects().length) { clearInterval(poll); poll = 0; return; }   // closed (Esc, the backdrop, another sheet)
      try {
        const r = await C.api('/invite-claude'); if (!alive()) return;
        const was = st && st.joined, n = (st.claudes || []).length, conns = JSON.stringify((st.claudes || []).map(c => [c.paused, c.connections]));
        st = { ...st, ...r };
        if ((r.claudes || []).length !== n || conns !== JSON.stringify((r.claudes || []).map(c => [c.paused, c.connections]))) draw(); else paintStatus();   // a claude.ai sign-in made (or ended) one
        if (!was && r.joined && r.agent) toast(`✓ ${r.agent.name} joined`);
      } catch {}
    };
    poll = setInterval(tick, 2000);
  }
  if (C && C.on) C.on('ws', m => { if (m && m.type === 'claude-joined') { if (alive() && st) { const was = st.joined; st = { ...st, joined: st.joined || new Date().toISOString(), online: true }; if (st.claudes && st.claudes[0]) Object.assign(st.claudes[0], { joined: st.claudes[0].joined || st.joined, online: true }); paintStatus(); if (!was) toast(`✓ ${m.agent.name} joined`); } else toast(`✓ ${m.agent.name} joined`); } });

  // ---------- for other modules ----------
  // The permissions block on its own (Settings renders it wherever it likes).
  async function access(el) {
    if (!el) return;
    try { st = await C.api('/invite-claude'); } catch (e) { el.innerHTML = `<p class="faint">${esc(e.message)}</p>`; return; }
    const paint = () => {
      const list = st.claudes || [];
      if (!list.length) { el.innerHTML = '<p class="faint">You haven\'t invited your Claude yet.</p><button type="button" class="btn primary" data-ic-open>Invite your Claude</button>'; return; }
      el.innerHTML = (list.length === 1 ? statusHtml(list[0]) : '') + list.map((c, i) => accessHtml(c, i === 0, list.length > 1)).join('');
      el.querySelectorAll('[data-ic-of]').forEach(sec => wireAccess(sec, sec.dataset.icOf, paint));
    };
    paint();
  }
  // A card for the Agents Hub: plain HTML, the button opens the sheet through a delegated click.
  const card = () => `<div class="ic-hubcard"><span class="ppl-ai">AI</span><div><b>Invite your Claude</b><small>It joins next to you, with your access and never more.</small></div><button type="button" class="btn sm primary" data-ic-open>Invite</button></div>`;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-ic-open]'); if (b) { e.preventDefault(); open(); } });

  window.TribeInviteClaude = { open, mount, unmount, access, card, close };
})();
