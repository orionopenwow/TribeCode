// Invite your Claude: as simple as inviting a friend (server/inviteclaude.js).
// One click opens a sheet: pick Claude Code (one command), Claude Desktop (a config to paste or download) or Claude on
// the web (a connector URL, when the tribe has a public https address). Then "Waiting for your Claude…" turns into
// "✓ Campw's Claude joined" when it first connects. Below: what it may do (chat, docs, tasks, files, website, approvals),
// "Let it act as me for admin" (off), Pause and Remove.
// Entry points: the sidebar row (#sf-claude), the People panel, Invite friends, a project's invite sheet, the empty chat,
// and Flint ("invite my claude").
//   window.TribeInviteClaude = { open(opts), access(el), card() }
//     access(el): the permissions block, for Settings (settings.js renders it where it likes).
//     card():     a small HTML card for the Agents Hub (agentshub.js can call it later); its button opens the sheet.
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : null);
  const KINDS = [['code', 'Claude Code', 'In your terminal'], ['desktop', 'Claude Desktop', 'The desktop app'], ['web', 'Claude on the web', 'claude.ai']];
  const KEY = 'tribecode.inviteclaude.kind';
  let modal = null, st = null, setupData = null, kind = null, poll = 0, copiedCode = false;

  function guessKind() {
    try { const k = localStorage.getItem(KEY); if (KINDS.some(x => x[0] === k)) return k; } catch {}
    if (matchMedia('(max-width: 820px)').matches) return 'web';   // a phone has no terminal
    return 'code';
  }
  function ensureModal() {
    if (modal && modal.isConnected) return modal;
    modal = document.createElement('div');
    modal.className = 'modal hidden ic-modal'; modal.id = 'ic-modal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-label', 'Invite your Claude');
    modal.innerHTML = '<div class="modal-card ic-card" id="ic-body"></div>';
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) close(); });
    document.body.appendChild(modal);
    return modal;
  }
  function close() { if (modal) modal.classList.add('hidden'); clearInterval(poll); poll = 0; setupData = null; }

  async function open(opts) {
    if (!C || !C.connected || !C.connected()) { if (window.TribeApp && window.TribeApp.openInvite) window.TribeApp.openInvite(); return; }
    const me = C.state().me || {};
    ensureModal().classList.remove('hidden');
    const body = document.getElementById('ic-body');
    if (me.role === 'agent' || me.role === 'spectator' || me.guest) { body.innerHTML = `<span class="eyebrow">Invite your Claude</span><h2>Not for this account</h2><p class="lead">${me.role === 'spectator' ? 'Spectators watch along, so they can\'t bring an AI in.' : 'Guests can\'t bring an AI in.'}</p><div class="modal-foot"><button class="btn" data-ic-close>Close</button></div>`; wireClose(body); return; }
    kind = (opts && opts.kind) || guessKind(); copiedCode = false;
    body.innerHTML = '<span class="eyebrow">Invite your Claude</span><h2>Bring your Claude in</h2><p class="lead">Getting it ready…</p>';
    try { st = await C.api('/invite-claude'); } catch (e) { body.innerHTML = `<h2>Couldn't open this</h2><p class="lead">${esc(e.message)}</p><div class="modal-foot"><button class="btn" data-ic-close>Close</button></div>`; wireClose(body); return; }
    // Already here: show it and its access; a new key is one deliberate tap away (it would cut the running session off).
    if (st.agent && !(opts && opts.fresh)) { draw(); watch(); return; }
    await mint();
  }
  async function mint() {
    try { setupData = await C.api('/invite-claude', { method: 'POST', body: {} }); st = setupData; } catch (e) { toast(e.message); return; }
    draw(); watch();
  }
  function wireClose(root) { root.querySelectorAll('[data-ic-close]').forEach(b => b.onclick = close); }
  const copy = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
  const block = (label, text, id) => `<div class="cai-block ic-block"><div class="cai-bl"><span class="eyebrow">${esc(label)}</span><button type="button" class="btn cai-copy" data-ic-copy="${esc(id)}">Copy</button></div><pre class="cai-pre" data-ic-text="${esc(id)}">${esc(text)}</pre></div>`;

  function statusHtml() {
    const name = st.agent ? st.agent.name : 'your Claude';
    if (st.paused) return `<div class="ic-status paused" id="ic-status"><span class="cc-dot"></span>Paused · ${esc(name)} can't do anything until you resume it</div>`;
    if (st.joined) return `<div class="ic-status on" id="ic-status"><span class="ic-check" aria-hidden="true">✓</span>${esc(name)} joined${st.online ? ' · online now' : ''}</div>`;
    return `<div class="ic-status" id="ic-status"><span class="cc-dot"></span>Waiting for your Claude…</div>`;
  }
  function setupHtml() {
    if (!setupData) {
      return `<p class="ic-note faint">To connect it on another computer, make a new key. The old one stops working, so a session running now needs the new setup too.</p>
        <button type="button" class="btn" id="ic-new">New key and setup</button>`;
    }
    const s = setupData;
    const tabs = `<div class="cai-chips ic-kinds" role="tablist" aria-label="Which Claude">${KINDS.map(([k, n, sub]) => `<button type="button" role="tab" class="cai-chip${k === kind ? ' on' : ''}" aria-selected="${k === kind}" data-ic-kind="${k}" title="${esc(sub)}">${esc(n)}</button>`).join('')}</div>`;
    let inner = '';
    if (kind === 'code') {
      inner = `<ol class="cai-steps ic-steps"><li class="${copiedCode ? 'done' : ''}">Copy this command.</li><li class="${copiedCode ? 'now' : ''}">${copiedCode ? '<b>Copied — paste it in your terminal</b> and press Enter.' : 'Paste it in your terminal and press Enter.'}</li><li>Start <code>claude</code> (or type <code>/mcp</code> in one that's running). It joins as ${esc(st.agent.name)}.</li></ol>
        ${block('Terminal', s.code.command, 'code')}
        ${(s.code.alt || []).map((a, i) => `<details class="cai-alt"><summary>From ${a.where === 'wifi' ? 'another computer on this Wi-Fi' : a.where === 'here' ? 'this computer' : 'anywhere'}</summary>${block('Terminal', a.command, 'alt' + i)}</details>`).join('')}
        <details class="cai-alt"><summary>Or the local bridge (stdio)</summary>${block('Terminal', s.code.stdio, 'stdio')}</details>`;
    } else if (kind === 'desktop') {
      inner = `<ol class="cai-steps ic-steps">${s.desktop.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        ${block('claude_desktop_config.json', s.desktop.json, 'desktop')}
        <div class="ic-row"><button type="button" class="btn" id="ic-dl">Download config</button><span class="faint ic-small">Mac: ${esc(s.desktop.files.mac)} · Windows: ${esc(s.desktop.files.windows)}</span></div>`;
    } else if (s.web.available) {
      inner = `<ol class="cai-steps ic-steps">${s.web.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        ${block('Connector URL (the key is inside it: keep it private)', s.web.url, 'web')}
        <details class="cai-alt"><summary>Your connector form has a header field? Use the plain URL and this header instead</summary>${block('URL', s.web.plain, 'webplain')}${block('Header', s.web.header, 'webheader')}</details>`;
    } else {
      inner = `<div class="ic-need"><p>${esc(s.web.why)}</p><button type="button" class="btn primary" id="ic-public">Work with friends anywhere</button></div>`;
    }
    return tabs + inner;
  }
  function accessHtml() {
    if (!st.agent) return '';
    const on = new Set(st.scopes || []);
    return `<section class="ic-access" id="ic-access"><div class="ic-ah"><span class="eyebrow">What it can do</span><span class="faint ic-small">Everything you can, never more</span></div>
      <div class="ic-scopes">${(st.all || []).map(s => `<label class="ic-scope"><input type="checkbox" data-ic-scope="${esc(s.id)}"${on.has(s.id) ? ' checked' : ''}><span>${esc(s.label)}</span></label>`).join('')}</div>
      ${st.canAdmin ? `<label class="ic-scope ic-admin"><input type="checkbox" id="ic-admin"${st.adminAsMe ? ' checked' : ''}><span>Let it act as me for admin<small>Off by default. Host-only things (hosting, keys, backups) always stay yours.</small></span></label>` : ''}
      <div class="ic-row ic-ctl"><label class="ic-pause"><input type="checkbox" id="ic-pause"${st.paused ? ' checked' : ''}><span>Pause</span></label><span class="ic-flex"></span><button type="button" class="btn ic-remove" id="ic-remove">Remove</button></div>
      <p class="faint ic-small">It can't read anyone's private messages, approve requests or invite people. It's limited to ${esc(st.rate || 120)} actions a minute, and everything it does is labelled ${esc(st.agent.name)}.</p></section>`;
  }
  function draw() {
    const body = document.getElementById('ic-body'); if (!body || !st) return;
    const name = st.agent ? st.agent.name : 'your Claude';
    body.innerHTML = `<span class="eyebrow">Invite your Claude</span><h2>Bring your Claude in</h2>
      <p class="lead">It joins next to you as <b>${esc(name)}</b>, with your access and never more. Narrow it, pause it or remove it any time.</p>
      ${statusHtml()}
      <div class="ic-setup" id="ic-setup">${setupHtml()}</div>
      ${accessHtml()}
      <div class="modal-foot"><span class="ic-flex"></span><button class="btn primary" data-ic-close>Done</button></div>`;
    wire(body);
  }
  function wire(body) {
    wireClose(body);
    body.querySelectorAll('[data-ic-kind]').forEach(b => b.onclick = () => { kind = b.dataset.icKind; try { localStorage.setItem(KEY, kind); } catch {} draw(); });
    body.querySelectorAll('[data-ic-copy]').forEach(b => b.onclick = async () => {
      const id = b.dataset.icCopy, t = (body.querySelector(`[data-ic-text="${id}"]`) || {}).textContent || '';
      const ok = await copy(t);
      if (id === 'code' || id.startsWith('alt') || id === 'stdio') { copiedCode = true; draw(); }
      toast(ok ? (id === 'code' ? 'Copied — paste it in your terminal' : 'Copied') : 'Select the text and copy it.');
    });
    const dl = body.querySelector('#ic-dl'); if (dl) dl.onclick = () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([setupData.desktop.json], { type: 'application/json' })); a.download = 'claude_desktop_config.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    };
    const pub = body.querySelector('#ic-public'); if (pub) pub.onclick = async () => {
      pub.disabled = true; pub.textContent = 'Turning it on…';
      try { await C.api('/share/public', { method: 'POST', body: {} }); await mint(); } catch (e) { pub.disabled = false; pub.textContent = 'Work with friends anywhere'; toast((C.state().me || {}).role === 'host' ? e.message : 'Ask the host to turn on "Work with friends anywhere" in Settings.'); }
    };
    const nk = body.querySelector('#ic-new'); if (nk) nk.onclick = () => mint();
    body.querySelectorAll('[data-ic-scope]').forEach(c => c.onchange = () => save({ scopes: [...body.querySelectorAll('[data-ic-scope]:checked')].map(x => x.dataset.icScope) }));
    const ad = body.querySelector('#ic-admin'); if (ad) ad.onchange = () => save({ adminAsMe: ad.checked });
    const pa = body.querySelector('#ic-pause'); if (pa) pa.onchange = () => save({ paused: pa.checked }, pa.checked ? 'Paused. Its key stopped working until you resume it.' : 'Resumed.');
    const rm = body.querySelector('#ic-remove'); if (rm) rm.onclick = remove;
  }
  async function save(patch, msg) {
    try { Object.assign(st, await C.api('/invite-claude', { method: 'PUT', body: patch })); draw(); toast(msg || 'Saved.'); } catch (e) { toast(e.message); }
  }
  async function remove() {
    try { await C.api('/invite-claude', { method: 'DELETE' }); toast('Removed. Its key stopped working. In your terminal: claude mcp remove tribecode'); close(); } catch (e) { toast(e.message); }
  }
  function watch() {
    clearInterval(poll);
    const tick = async () => {
      if (!modal || modal.classList.contains('hidden')) return clearInterval(poll);
      try {
        const r = await C.api('/invite-claude'); const was = st && st.joined;
        st = { ...st, ...r };
        const el = document.getElementById('ic-status'); if (el) el.outerHTML = statusHtml();
        if (!was && r.joined) toast(`✓ ${r.agent.name} joined`);
      } catch {}
    };
    poll = setInterval(tick, 2000);
  }
  if (C && C.on) C.on('ws', m => { if (m && m.type === 'claude-joined') { if (modal && !modal.classList.contains('hidden')) { const was = st && st.joined; st = { ...st, joined: st.joined || new Date().toISOString(), online: true }; const el = document.getElementById('ic-status'); if (el) el.outerHTML = statusHtml(); if (!was) toast(`✓ ${m.agent.name} joined`); } else toast(`✓ ${m.agent.name} joined`); } });

  // ---------- for other modules ----------
  // The permissions block on its own (Settings renders it wherever it likes).
  async function access(el) {
    if (!el) return;
    try { st = await C.api('/invite-claude'); } catch (e) { el.innerHTML = `<p class="faint">${esc(e.message)}</p>`; return; }
    if (!st.agent) { el.innerHTML = '<p class="faint">You haven\'t invited your Claude yet.</p><button type="button" class="btn primary" data-ic-open>Invite your Claude</button>'; return; }
    const paint = () => { el.innerHTML = statusHtml() + accessHtml(); wireAccess(el, paint); };
    paint();
  }
  function wireAccess(el, paint) {
    const put = async patch => { try { Object.assign(st, await C.api('/invite-claude', { method: 'PUT', body: patch })); paint(); } catch (e) { toast(e.message); } };
    el.querySelectorAll('[data-ic-scope]').forEach(c => c.onchange = () => put({ scopes: [...el.querySelectorAll('[data-ic-scope]:checked')].map(x => x.dataset.icScope) }));
    const ad = el.querySelector('#ic-admin'); if (ad) ad.onchange = () => put({ adminAsMe: ad.checked });
    const pa = el.querySelector('#ic-pause'); if (pa) pa.onchange = () => put({ paused: pa.checked });
    const rm = el.querySelector('#ic-remove'); if (rm) rm.onclick = async () => { try { await C.api('/invite-claude', { method: 'DELETE' }); access(el); toast('Removed. Its key stopped working.'); } catch (e) { toast(e.message); } };
  }
  // A card for the Agents Hub: plain HTML, the button opens the sheet through a delegated click.
  const card = () => `<div class="ic-hubcard"><span class="ppl-ai">AI</span><div><b>Invite your Claude</b><small>It joins next to you, with your access and never more.</small></div><button type="button" class="btn sm primary" data-ic-open>Invite</button></div>`;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-ic-open]'); if (b && !b.closest('#ic-modal')) { e.preventDefault(); open(); } });

  window.TribeInviteClaude = { open, access, card, close };
})();
