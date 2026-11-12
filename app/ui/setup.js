// Setup after the vision (feat/setup-flow), client side. Server side: server/setup.js.
//   Dashboard card "Shape it": small optional role cards (I'm the artist / engineer / designer / writer). Each opens
//   one screen with a few choices; picking one saves it and adds two starter tasks. "Make the starter" appears once
//   there is a vision and a category: it puts starter files in the code repository and opens the Preview.
// Everything is skippable, needs no model, and stays out of the way once done.
// Public: window.TribeSetup = { card(p, pulse), open(role), starter(), get() }.
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const pid = () => (window.TribeProjects && window.TribeProjects.current()) || '';
  const TICK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>';
  const hideKey = p => `tribecode.setup.${p}.hide`;
  const hidden = p => { try { return localStorage.getItem(hideKey(p)) === '1'; } catch { return false; } };

  let st = null, forPid = '', seq = 0, making = false, tplPick = '';   // tplPick: '' = the built-in starter, 'tribe:<slug>' = a host's template
  async function load(p) {
    const n = ++seq;
    try { const r = await C.api(`/projects/${encodeURIComponent(p)}/setup`); if (n === seq) { st = r; forPid = p; } }
    catch { if (n === seq) { st = null; forPid = p; } }
  }
  function card(p, d) {
    const slot = $('#pj-setup-slot'); if (!slot || !p) return;
    if (!d || !d.vision || !d.vision.has) { slot.innerHTML = ''; return; }
    load(p.id).then(draw);
  }
  function draw() {
    const slot = $('#pj-setup-slot'); if (!slot) return;
    if (!st || forPid !== pid() || !st.canEdit || !st.vision || hidden(forPid)) { slot.innerHTML = ''; return; }
    const allRoles = st.roles.every(r => r.done), s = st.starter;
    if (allRoles && s.made) { slot.innerHTML = ''; return; }
    const noun = st.kind ? st.label : 'project';
    const starterHtml = s.made ? `<div class="su-made">${TICK}<span>The starter is in the code repository.</span><button class="linkish" id="su-preview">Open the preview</button></div>`
      : s.ready && st.canHost ? `<div class="su-starter" id="su-starter-row"><span class="su-e" aria-hidden="true">🚀</span><div class="su-st-t"><b>Make the starter</b><small>Starter files for your ${esc(noun)}, committed to the code repository and open in Preview. Nothing gets overwritten.</small>${s.kit && s.kit.libs ? `<span class="su-kit" id="su-kit" title="The open-source build kit Flint and your AI helpers use">${s.kit.libs.slice(0, 4).map(l => `<i>${esc(l.name)}</i>`).join('')}</span>` : ''}</div><button class="btn primary" id="su-starter" ${making ? 'disabled' : ''}>${making ? 'Making…' : 'Make the starter'}</button></div>${(s.templates || []).length ? `<div class="su-tpls" role="radiogroup" aria-label="Start from"><span class="faint">Start from</span><button type="button" role="radio" class="su-tpl ${!tplPick ? 'on' : ''}" aria-checked="${!tplPick}" data-sutpl="">TribeCode starter</button>${s.templates.map(t => `<button type="button" role="radio" class="su-tpl ${tplPick === 'tribe:' + t.slug ? 'on' : ''}" aria-checked="${tplPick === 'tribe:' + t.slug}" data-sutpl="tribe:${esc(t.slug)}" title="${esc(t.summary || '')}">🧩 ${esc(t.name)}</button>`).join('')}</div>` : ''}<div class="su-sitelib"><span class="faint">Building a website?</span><button type="button" class="linkish" id="su-sitelib">Pick from 16 website templates</button></div>`
      : '';
    slot.innerHTML = `<section class="card su-card" id="pj-setup">
      <div class="su-head"><div><span class="eyebrow">Shape it · optional</span><h3>Pick a role, make one choice</h3></div><button class="linkish su-hide" id="su-hide">Hide</button></div>
      <p class="su-sub">Each one is a single screen and adds two starter tasks. Skip any of them.</p>
      ${starterHtml}
      <div class="su-roles">${st.roles.map(r => { const ch = (st.choices || {})[r.id];
        return `<button class="su-role ${r.done ? 'on' : ''}" data-role="${esc(r.id)}"><span class="su-e" aria-hidden="true">${r.emoji}</span><span class="su-rt"><b>${esc(r.title)}</b><small>${r.done ? esc(ch.name) : esc(r.sub)}</small></span>${r.done ? `<span class="su-ok" aria-label="Done">${TICK}</span>` : ''}</button>`; }).join('')}</div></section>`;
    slot.querySelectorAll('[data-role]').forEach(b => b.onclick = () => open(b.dataset.role));
    const hb = $('#su-hide'); if (hb) hb.onclick = () => { try { localStorage.setItem(hideKey(forPid), '1'); } catch {} draw(); };
    const sb = $('#su-starter'); if (sb) sb.onclick = starter;
    const sl = $('#su-sitelib'); if (sl) sl.onclick = () => window.TribeSiteLib && window.TribeSiteLib.open({ pid: forPid });   // website templates (sitelib.js)
    slot.querySelectorAll('[data-sutpl]').forEach(b => b.onclick = () => { tplPick = b.dataset.sutpl; draw(); });
    const pv = $('#su-preview'); if (pv) pv.onclick = () => window.TribePreview && window.TribePreview.open();
  }

  // ---------- one role, one screen ----------
  const LEAD = {
    artist: n => `Flat colors that suit your ${n}. The project color, the website and design/palette.css follow your pick.`,
    engineer: () => 'What the code is built on. You can change it later; this just gets the first tasks right.',
    designer: n => (n === 'game' ? 'The one thing the player does again and again. Everything else hangs off it.' : 'The first screen people see. Build that one well and the rest follows.'),
    writer: () => 'A short line that says what it is. It becomes the description if there isn’t one yet.',
  };
  function open(role) {
    if (!st) return;
    const r = st.roles.find(x => x.id === role); if (!r) return;
    const m = $('#invite-modal'), body = $('#invite-body'); if (!m || !body) return;
    const cur = (st.choices || {})[role], noun = st.kind ? st.label : 'project';
    m.classList.remove('hidden');
    body.innerHTML = `<div class="su-flow"><span class="eyebrow">${r.emoji} ${esc(r.title.replace(/^I’m the /, ''))}</span><h2>${esc(r.sub)}</h2>
      <p class="lead">${esc(LEAD[role](noun))}</p>
      <div class="su-opts ${role === 'artist' ? 'pal' : ''}" role="radiogroup" aria-label="${esc(r.sub)}">${r.options.map(o => `<button type="button" role="radio" class="su-opt ${cur && cur.id === o.id ? 'on' : ''}" aria-checked="${!!(cur && cur.id === o.id)}" data-opt="${esc(o.id)}">
        ${o.colors ? `<span class="su-sw" aria-hidden="true">${o.colors.map(c => `<i style="background:${esc(c)}"></i>`).join('')}</span>` : ''}<span class="su-ot"><b>${esc(o.name)}</b>${o.why ? `<small>${esc(o.why)}</small>` : ''}</span></button>`).join('')}</div>
      <div class="modal-foot"><span class="faint su-note">Adds two starter tasks to the board.</span><span style="flex:1"></span><button class="btn" data-close>Skip</button></div></div>`;
    const close = () => m.classList.add('hidden');
    body.querySelector('[data-close]').onclick = close;
    body.querySelectorAll('[data-opt]').forEach(b => b.onclick = async () => {
      body.querySelectorAll('[data-opt]').forEach(x => { x.disabled = true; });
      try {
        const res = await C.api(`/projects/${encodeURIComponent(forPid)}/setup`, { method: 'PUT', body: { role, choice: b.dataset.opt } });
        st = res.setup; close(); draw();
        toast(`${r.emoji} ${(res.tasks || []).length} starter tasks added`);
        if (window.TribeTasks && window.TribeTasks.load) window.TribeTasks.load();
      } catch (e) { toast(e.message); body.querySelectorAll('[data-opt]').forEach(x => { x.disabled = false; }); }
    });
    const first = body.querySelector('.su-opt'); if (first && !matchMedia('(max-width: 820px)').matches) first.focus();
  }

  async function starter() {
    if (making) return; making = true;
    const b = $('#su-starter'); if (b) { b.disabled = true; b.textContent = 'Making…'; }
    try {
      const r = await C.api(`/projects/${encodeURIComponent(forPid)}/setup/starter`, { method: 'POST', body: tplPick ? { template: tplPick } : undefined });
      making = false; st = r.setup; draw();
      toast(r.written.length ? `🚀 Starter ready: ${r.written.length} files in the code repository` : 'The code repository already had these files');
      if (window.TribeProjects && window.TribeProjects.refresh) window.TribeProjects.refresh();
      const here = document.body.dataset.view;   // open the preview only if the user is still here, not over where they went
      if (window.TribePreview) setTimeout(() => { if (document.body.dataset.view === here) window.TribePreview.open(); }, 300);
    } catch (e) { making = false; toast(e.message); draw(); }
  }

  C.on('ws', m => { if (m && m.type === 'setup' && m.project === pid() && $('#pj-setup-slot')) load(pid()).then(draw); });
  C.on('project', () => { st = null; });
  window.TribeSetup = { card, open, starter, get: () => st };
})();
