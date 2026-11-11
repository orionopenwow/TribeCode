// Safety (docs/APP-STORE.md, App Store 1.2 + 5.1.1(v), Google Play UGC + account deletion): report, block, and delete
// your account, kept calm and out of the way. Server: server/moderation.js.
//   * Report: a message (chat "…" menu) or a person (profile "…" menu). Pick a reason, add a note if you like. The host
//     and mods get it (Settings › Privacy & safety › Reports) and mark it resolved or dismissed.
//   * Block: hides that person's messages for you, everywhere chat renders (one stylesheet keyed on data-by), and stops
//     their notifications. Private: they aren't told. Unblock from the same menus or Settings › Privacy & safety.
//   * Delete my account: calls DELETE /api/account when the tribe's server has it; otherwise explains where the account
//     lives (the host's computer) and deletes everything this device keeps.
// Hooks: chatx.js (message menu) and profiles.js (profile "…" menu) call menuItems / profileItems; Settings gets one row
// through a MutationObserver (settings.js is untouched).
// Public: window.TribeModeration = { menuItems(m, ch), profileItems(d), report(opts), block(id, on), blocked(),
//   isBlocked(id), openSafety(), deleteAccount(), refresh(), state() }.
(function () {
  'use strict';
  const C = () => window.TribeClient, App = () => window.TribeApp;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, k) => (App() && App().toast ? App().toast(m, k) : console.log(m));
  const REASONS = [['spam', 'Spam or scam'], ['harassment', 'Harassment or bullying'], ['hate', 'Hate'], ['sexual', 'Sexual content'], ['violence', 'Violence or threats'], ['self-harm', 'Self-harm'], ['illegal', 'Something illegal'], ['other', 'Something else']];
  const ICON = {
    flag: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    block: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/></svg>',
  };
  const st = { blocks: [], staff: false, reports: [], filter: null, loaded: false };
  const meId = () => ((C() && C().state().me) || {}).id;
  const member = id => ((C() && C().state().members) || []).find(m => m.id === id);
  const nameOf = id => (member(id) || {}).name || 'this person';
  const first = n => String(n || '').split(' ')[0] || n;

  // ---------- blocked people: hidden by one stylesheet ----------
  function paint() {
    let s = document.getElementById('mod-blocked-css');
    if (!s) { s = document.createElement('style'); s.id = 'mod-blocked-css'; document.head.appendChild(s); }
    const ids = st.blocks.filter(id => /^[\w-]{1,40}$/.test(id));
    s.textContent = ids.length ? ids.map(id => `.msg[data-by="${id}"], [data-mod-person="${id}"]`).join(',\n') + ' { display: none !important; }' : '';
    document.documentElement.toggleAttribute('data-mod-blocking', !!ids.length);
  }
  async function refresh() {
    if (!C() || !C().connected()) return st;
    try { const r = await C().api('/moderation'); st.blocks = r.blocks || []; st.staff = !!r.staff; st.reports = r.reports || []; st.filter = r.filter || null; st.loaded = true; paint(); } catch {}
    return st;
  }
  const isBlocked = id => st.blocks.includes(id);
  async function block(id, on) {
    const r = await C().api('/moderation/block', { method: 'PUT', body: { id, on } });
    st.blocks = r.blocks || []; paint();
    toast(on ? `Blocked ${nameOf(id)}. Their messages are hidden for you.` : `Unblocked ${nameOf(id)}`);
    return st.blocks;
  }

  // ---------- menu items (chat message, profile) ----------
  function menuItems(m, ch) {
    if (!m || m.deleted || !m.by || m.by === meId() || m.by === 'tribecode' || m.by === 'brain') return '';
    const who = member(m.by), agent = who && who.role === 'agent';
    return `<div class="mod-sep2" role="separator"></div>
      <button role="menuitem" data-modx="report-msg" data-mid="${esc(m.id)}" data-by="${esc(m.by)}" data-ch="${esc(ch || '')}" data-ex="${esc(String(m.text || (m.media ? `[${m.media.kind || 'file'}]` : '')).slice(0, 300))}">${ICON.flag}Report…</button>
      ${who && who.role !== 'host' ? `<button role="menuitem" data-modx="block" data-by="${esc(m.by)}">${ICON.block}${isBlocked(m.by) ? 'Unblock' : `Block ${esc(first(who.name))}${agent ? '' : ''}`}</button>` : ''}`;
  }
  function profileItems(d) {
    if (!d || d.you || !d.member || d.member.id === meId()) return '';
    const id = d.member.id, who = member(id) || d.member;
    return `<button role="menuitem" data-modx="report-member" data-by="${esc(id)}">Report…</button>
      ${who.role !== 'host' ? `<button role="menuitem" data-modx="block" data-by="${esc(id)}">${isBlocked(id) ? 'Unblock' : 'Block'}</button>` : ''}`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-modx]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const k = b.dataset.modx, by = b.dataset.by;
    const mm = $('#msg-menu'); if (mm) mm.remove();
    if (window.TribeProfiles && b.closest('#pf-pop, #pf-menu2')) window.TribeProfiles.close();
    try {
      if (k === 'report-msg') report({ kind: 'message', target: by, ref: b.dataset.mid, channel: b.dataset.ch, excerpt: b.dataset.ex });
      if (k === 'report-member') report({ kind: 'member', target: by });
      if (k === 'block') await block(by, !isBlocked(by));
      if (k === 'unblock') { await block(by, false); drawSafety(); }
    } catch (err) { toast(err.message, 'err'); }
  }, true);

  // ---------- dialogs ----------
  let dlg = null;
  function closeDlg() { if (dlg) { dlg.remove(); dlg = null; } }
  function dialog(html, cls = '') {
    closeDlg();
    dlg = document.createElement('div'); dlg.className = 'mod-dlg ' + cls; dlg.id = 'mod-dlg';
    dlg.innerHTML = `<div class="mod-scrim" data-mclose></div><section class="mod-card" role="dialog" aria-modal="true" aria-labelledby="mod-t">${html}</section>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target.closest('[data-mclose]')) closeDlg(); });
    const card = dlg.querySelector('.mod-card'); card.tabIndex = -1;
    const f = cls === 'mod-safety' ? card : dlg.querySelector('button.primary, input[type=radio], button'); if (f) f.focus({ preventScroll: true });   // never a text field: no surprise keyboard on phones
    return dlg;
  }
  function report(o) {
    const who = nameOf(o.target);
    dialog(`<span class="eyebrow">Report</span><h2 id="mod-t">${o.kind === 'member' ? `Report ${esc(who)}` : `Report a message from ${esc(first(who))}`}</h2>
      ${o.excerpt ? `<blockquote class="mod-quote">${esc(o.excerpt)}</blockquote>` : ''}
      <form id="mod-form"><fieldset class="mod-reasons"><legend>What's wrong?</legend>${REASONS.map(([k, l], i) => `<label><input type="radio" name="reason" value="${k}" ${i === 0 ? 'required' : ''}><span>${l}</span></label>`).join('')}</fieldset>
      <label class="mod-note"><span class="eyebrow">Anything else <span class="faint">(optional)</span></span><textarea name="note" rows="2" maxlength="500" placeholder="What happened"></textarea></label>
      <p class="mod-small">The host and the tribe's mods see your report and who sent it. ${esc(first(who))} isn't told.</p>
      <div class="mod-acts"><button type="button" class="btn ghost" data-mclose>Cancel</button><button class="btn primary" type="submit">Send report</button></div></form>`);
    dlg.querySelector('#mod-form').onsubmit = async ev => {
      ev.preventDefault();
      const f = new FormData(ev.target), reason = f.get('reason'); if (!reason) return;
      const btn = ev.target.querySelector('[type=submit]'); btn.disabled = true;
      try {
        await C().api('/moderation/report', { method: 'POST', body: { ...o, reason, note: f.get('note') || '' } });
        const canBlock = member(o.target) && member(o.target).role !== 'host' && !isBlocked(o.target);
        dialog(`<span class="eyebrow">Report sent</span><h2 id="mod-t">Thanks for telling us</h2><p class="mod-p">The host and mods will look at it. You can also block ${esc(first(who))} so you don't see their messages.</p>
          <div class="mod-acts"><button class="btn ghost" data-mclose>Done</button>${canBlock ? `<button class="btn" data-modx="block" data-by="${esc(o.target)}">Block ${esc(first(who))}</button>` : ''}</div>`);
        dlg.querySelector('[data-modx]') && dlg.querySelector('[data-modx]').addEventListener('click', () => setTimeout(closeDlg, 0));
      } catch (err) { btn.disabled = false; toast(err.message, 'err'); }
    };
  }

  // ---------- Settings › Privacy & safety ----------
  function settingsHook() {
    const body = $('#settings-body'); if (!body || body.querySelector('#set-safety-row')) return;
    const anchor = body.querySelector('.set-more'); if (!anchor) return;
    const open = st.reports.filter(r => r.status === 'open').length;
    anchor.insertAdjacentHTML('beforebegin', `<div class="set-row" id="set-safety-row"><div class="set-l"><b>Privacy &amp; safety</b><small>Blocked people, ${st.staff ? 'reports, ' : ''}your data and deleting your account.</small></div>
      <div class="set-c"><button class="btn" id="set-safety">Open${st.staff && open ? ` <span class="mod-count">${open}</span>` : ''}</button></div></div>`);
    body.querySelector('#set-safety').onclick = () => openSafety();
    const before = JSON.stringify([st.staff, open]);   // fresh numbers each time Settings opens
    refresh().then(() => { const r = body.querySelector('#set-safety-row'); if (r && JSON.stringify([st.staff, st.reports.filter(x => x.status === 'open').length]) !== before) { r.remove(); settingsHook(); } });
  }
  function openSafety() { refresh().then(drawSafety); drawSafety(); }
  function drawSafety() {
    if (dlg && !dlg.classList.contains('mod-safety')) return;
    const blocked = st.blocks.map(id => `<li><span>${esc(nameOf(id))}</span><button class="btn sm" data-modx="unblock" data-by="${esc(id)}">Unblock</button></li>`).join('');
    const reports = st.staff ? st.reports.slice(0, 50).map(r => `<li class="mod-rep" data-state="${esc(r.status)}"><div class="mod-rep-t"><b>${esc(r.kind === 'member' ? r.targetName : `Message from ${r.targetName}`)}</b>
        <small>${esc(REASONS.find(x => x[0] === r.reason) ? REASONS.find(x => x[0] === r.reason)[1] : r.reason)} · by ${esc(r.byName)} · ${esc(new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small>
        ${r.excerpt ? `<q>${esc(r.excerpt)}</q>` : ''}${r.note ? `<span class="mod-rnote">${esc(r.note)}</span>` : ''}</div>
        ${r.status === 'open' ? `<div class="mod-rep-a"><button class="btn sm" data-rep="${esc(r.id)}" data-to="resolved">Resolved</button><button class="btn sm ghost" data-rep="${esc(r.id)}" data-to="dismissed">Dismiss</button></div>` : `<span class="mod-done">${esc(r.status)}</span>`}</li>`).join('') : '';
    const role = ((C() && C().state().me) || {}).role;
    const html = `<header class="mod-head"><div><span class="eyebrow">Settings</span><h2 id="mod-t">Privacy &amp; safety</h2></div><button class="btn ghost" data-mclose>Done</button></header>
      <section class="mod-sec"><span class="eyebrow">Blocked</span>${blocked ? `<ul class="mod-list">${blocked}</ul>` : '<p class="mod-p">Nobody. Block someone from their profile or a message\'s "…" menu.</p>'}</section>
      ${st.staff ? `<section class="mod-sec" id="mod-reports"><span class="eyebrow">Reports</span>${reports ? `<ul class="mod-list">${reports}</ul>` : '<p class="mod-p">No reports. When someone reports a message or a person, it shows here.</p>'}</section>` : ''}
      ${st.staff && ['host', 'admin'].includes(role) ? `<section class="mod-sec"><span class="eyebrow">Word filter</span><p class="mod-p">Words listed here show as •••• in every message as it's posted. One per line.</p>
        <textarea id="mod-words" class="input" rows="3" maxlength="6000" spellcheck="false">${esc(((st.filter || {}).words || []).join('\n'))}</textarea><div class="mod-acts"><button class="btn sm" id="mod-words-save">Save filter</button></div></section>` : ''}
      <section class="mod-sec"><span class="eyebrow">Your data</span><p class="mod-p">Your tribe's chat, tasks and docs live on the host's computer or server, not with TribeCode. Read the <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a> and the <a href="terms.html" target="_blank" rel="noopener">terms</a>.</p>
        <div class="mod-acts"><button class="btn danger" id="mod-delete">Delete my account…</button></div></section>`;
    if (!dlg) dialog(html, 'mod-safety'); else dlg.querySelector('.mod-card').innerHTML = html;
    dlg.querySelectorAll('[data-rep]').forEach(b => b.onclick = async () => { try { await C().api(`/moderation/reports/${b.dataset.rep}`, { method: 'POST', body: { status: b.dataset.to } }); await refresh(); drawSafety(); } catch (err) { toast(err.message, 'err'); } });
    const ws = dlg.querySelector('#mod-words-save'); if (ws) ws.onclick = async () => { try { const r = await C().api('/moderation/filter', { method: 'PUT', body: { words: dlg.querySelector('#mod-words').value } }); st.filter = r.filter; toast(`Filter saved (${r.filter.words.length} word${r.filter.words.length === 1 ? '' : 's'})`); } catch (err) { toast(err.message, 'err'); } };
    dlg.querySelector('#mod-delete').onclick = deleteAccount;
  }

  // ---------- delete my account ----------
  async function wipeDevice() {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch {}
    try { if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name) indexedDB.deleteDatabase(d.name); } catch {}
    try { if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch {}
    try { await fetch((C() ? C().base() : '') + '/api/session', { method: 'DELETE', credentials: 'include' }).catch(() => {}); } catch {}
  }
  async function deleteAccount() {
    let api = null;
    if (C() && C().connected()) { try { api = await C().api('/account'); } catch { api = null; } }
    const tribe = ((C() && C().state().tribe) || {}).name || 'this tribe';
    const host = ((C() && C().state().me) || {}).role === 'host';
    const canServer = !!(api && (api.canDelete || api.deletable || api.delete));
    dialog(`<span class="eyebrow">Delete account</span><h2 id="mod-t">Delete your account${canServer ? '' : ' from this device'}</h2>
      ${canServer ? `<p class="mod-p">This removes your account from <b>${esc(tribe)}</b>: your profile, sign-ins, devices, notes and messages you wrote. It can't be undone.${api.keeps ? ` ${esc(api.keeps)}` : ''}</p>`
        : `<p class="mod-p">Your account lives on the host's computer, in <b>${esc(tribe)}</b>, not with TribeCode. ${host ? 'You are the host: Settings › More settings › Start fresh moves the whole tribe into a backup folder, and deleting that folder removes everything.' : 'Ask the host to remove you, or report a problem to them. They can delete everything you posted.'}</p>
           <p class="mod-p">Here you can delete everything this device keeps: your sign-in, settings, drafts, unsent messages and the offline copy.</p>`}
      <label class="mod-note"><span class="eyebrow">Type DELETE to confirm</span><input class="input" id="mod-del-in" autocomplete="off" spellcheck="false" aria-label="Type DELETE to confirm"></label>
      <div class="mod-acts"><button class="btn ghost" data-mclose>Cancel</button><button class="btn danger" id="mod-del-go" disabled>${canServer ? 'Delete my account' : 'Delete from this device'}</button></div>`, 'mod-delete');
    const inp = dlg.querySelector('#mod-del-in'), go = dlg.querySelector('#mod-del-go');
    inp.oninput = () => { go.disabled = inp.value.trim().toUpperCase() !== 'DELETE'; };
    go.onclick = async () => {
      go.disabled = true; go.textContent = 'Deleting…';
      try {
        if (canServer) await C().api('/account', { method: 'DELETE', body: { confirm: 'DELETE' } });
        await wipeDevice();
        dialog(`<span class="eyebrow">Done</span><h2 id="mod-t">${canServer ? 'Your account is deleted' : 'This device is clear'}</h2><p class="mod-p">${canServer ? 'Everything tied to it is gone from the tribe.' : 'TribeCode starts fresh here next time.'}</p><div class="mod-acts"><button class="btn primary" id="mod-reload">Close</button></div>`);
        dlg.querySelector('#mod-reload').onclick = () => location.replace(location.pathname);
      } catch (err) { go.disabled = false; go.textContent = 'Try again'; toast(err.message, 'err'); }
    };
  }

  function start() {
    paint();
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg) closeDlg(); });
    const hook = (n = 0) => { const c = C(); if (!c || !c.on) { if (n < 100) setTimeout(() => hook(n + 1), 150); return; } c.on('hello', () => refresh()); if (c.connected()) refresh(); };
    hook();
    // Watch only the Settings modal (not the whole page: typing in a long doc must stay cheap). settings.js adds it once.
    const watch = m => { if (m.__tcWatchMod) return; m.__tcWatchMod = true; const go = () => { if (!m.classList.contains('hidden')) settingsHook(); }; new MutationObserver(go).observe(m, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); go(); };
    const find = () => { const m = $('#settings-modal'); if (m) { watch(m); return true; } return false; };
    if (!find()) { const mo = new MutationObserver(() => { if (find()) mo.disconnect(); }); mo.observe(document.body, { childList: true }); }
  }
  window.TribeModeration = { menuItems, profileItems, report, block, blocked: () => st.blocks.slice(), isBlocked, openSafety, deleteAccount, refresh, state: () => ({ ...st }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
