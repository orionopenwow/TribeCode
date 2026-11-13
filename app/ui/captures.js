// feat/captures: Files › Captures (docs/LINK-READER.md). Paste a link or record a voice note; get tidy notes back.
//   The Captures view (list, add a link, record), the notes page (Summary · Key points · Action items · Decisions ·
//   Full transcript, all editable, edits saved), the chat card, the voice recorder sheet, Settings › Packs, the
//   chat message menu items, drop-a-link on the chat, the phone entry in Files, and Flint's "summarize <url>" /
//   "what did we decide about X". Public: window.TribeCaptures, window.TribePacks.
// Every string from a page, a transcript or a person is escaped; nothing from a captured page runs here.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient, S = window.TribeStore;
  const NAME = 'captures';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const token = () => ((S.get().server) || {}).token || '';
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const me = () => (C.state() || {}).me || {};
  const pid = () => (C.project ? C.project() : null);
  const pad = n => String(n).padStart(2, '0');
  const mmss = t => (t === null || t === undefined || !isFinite(t) ? '' : (t >= 3600 ? Math.floor(t / 3600) + ':' : '') + pad(Math.floor(t / 60) % 60) + ':' + pad(Math.floor(t % 60)));
  const ago = iso => { if (!iso) return ''; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  // fix/security-2: signed, short-lived media links (app/ui/media.js), not the sign-in key
  const signed = u => (window.TribeMedia ? window.TribeMedia.url(u) : u);
  const thumbUrl = cid => signed(`${C.base()}/api/captures/${encodeURIComponent(cid)}/thumb${pid() ? '?project=' + encodeURIComponent(pid()) : ''}`);
  const audioUrl = cid => signed(`${C.base()}/api/captures/${encodeURIComponent(cid)}/audio${pid() ? '?project=' + encodeURIComponent(pid()) : ''}`);
  const KIND = { article: '📄', page: '📄', video: '🎬', short: '🎬', post: '💬', image: '🖼️', voice: '🎙️' };
  const dateOf = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s); return isNaN(d) ? String(s).slice(0, 20) : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); };
  const safeHref = u => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : ''; } catch { return ''; } };
  const canWrite = () => me().role && me().role !== 'spectator';
  const human = () => me().role && me().role !== 'agent' && me().role !== 'spectator';

  // ---------- the view (beside app.js views, like website.js) ----------
  let open = false, state = { list: null, q: '', cur: null, recipes: [], pending: [], canApprove: false, settings: {}, saveT: null, busy: false };
  function section() {
    let s = document.getElementById('view-' + NAME);
    if (!s) { const main = $('#main') || $('.main'); if (!main) return null; s = document.createElement('section'); s.id = 'view-' + NAME; s.className = 'hidden cap-view'; s.setAttribute('aria-label', 'Captures'); main.appendChild(s); }
    return s;
  }
  function show(id) {
    const sec = section(); if (!sec) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    document.querySelectorAll('[data-nav].on, [data-go].on').forEach(b => b.classList.remove('on'));
    try { C.sendActivity && C.sendActivity('Files · Captures'); } catch {}
    if (id) openNotes(id); else { state.cur = null; draw(); load(); }
  }
  function hide() { const sec = section(); if (sec) sec.classList.add('hidden'); open = false; stopAudio(); }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); phoneEntry(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  function go(id) { if (window.TribeShell && window.TribeShell.go && !id) window.TribeShell.go('captures'); else show(id); }

  async function load() {
    if (!C.connected()) { state.list = []; draw(); return; }
    try {
      const [l, r] = await Promise.all([C.api('/captures' + (state.q ? '?q=' + encodeURIComponent(state.q) : '')), C.api('/captures/recipes').catch(() => ({ recipes: [], pending: [] }))]);
      state.list = l.captures; state.settings = l.settings || {}; state.recipes = r.recipes || []; state.pending = r.pending || []; state.canApprove = !!r.canApprove;
    } catch (e) { state.list = []; toast(e.message); }
    if (!state.cur) draw();
  }

  function recipeOptions(sel, onlyVoice) {
    const rs = (state.recipes.length ? state.recipes : [{ id: 'voice', title: 'Voice note', emoji: '🎙️' }, { id: 'meeting', title: 'Meeting', emoji: '🗓️' }, { id: 'idea', title: 'Idea', emoji: '💡' }, { id: 'playtest', title: 'Playtest feedback', emoji: '🎮' }, { id: 'interview', title: 'Interview', emoji: '🎤' }, { id: 'lecture', title: 'Lecture', emoji: '🎓' }])
      .filter(r => !onlyVoice || !['article', 'video'].includes(r.id));
    return rs.map(r => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.emoji || '')} ${esc(r.title)}</option>`).join('');
  }
  function rowHtml(c) {
    return `<button class="cap-row" data-cap-open="${esc(c.id)}">
      <span class="cap-th">${c.thumb ? `<img alt="" loading="lazy" src="${esc(thumbUrl(c.id))}">` : `<span aria-hidden="true">${KIND[c.kind] || '📎'}</span>`}</span>
      <span class="cap-rt"><b>${esc(c.title)}</b><small>${esc([c.kind === 'voice' ? (c.byName || 'Voice note') : c.site, ago(c.created), c.duration ? mmss(c.duration) : '', c.dm ? 'private' : ''].filter(Boolean).join(' · '))}</small>
      ${c.summary ? `<span class="cap-rs">${esc(c.summary)}</span>` : c.note ? `<span class="cap-rs faint">${esc(c.note)}</span>` : ''}
      ${(c.tags || []).length ? `<span class="cap-tags">${c.tags.slice(0, 4).map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}</span></button>`;
  }
  function draw() {
    const sec = section(); if (!sec || state.cur) return;
    const list = state.list, host = me().role === 'host';
    sec.innerHTML = `<div class="cap-wrap">
      <div class="sec-head"><span class="eyebrow">📎 Links &amp; voice notes</span><h2>Captures</h2></div>
      <p class="cap-lead">Links, videos and voice notes, turned into short notes the tribe and its agents can use.</p>
      <section class="card cap-hero" aria-label="Add a capture">
        <form class="cap-add" id="cap-add">
          <label class="sr-only" for="cap-url">Link</label>
          <input class="input" id="cap-url" type="url" inputmode="url" placeholder="Paste a link: an article, YouTube, TikTok, Instagram…" autocomplete="off" spellcheck="false" ${canWrite() ? '' : 'disabled'}>
          <button class="btn primary" id="cap-go" type="submit" ${canWrite() ? '' : 'disabled'}>📎 Read it</button>
        </form>
        <div class="cap-hero-row">
          <button class="btn" id="cap-rec-btn" type="button" ${canWrite() ? '' : 'disabled'}>🎙️ Record a voice note</button>
          <span class="cap-hint">${canWrite() ? 'Or paste a link in chat. Notes land here and in chat.' : 'Spectators can read captures.'}</span>
        </div>
      </section>
      ${state.pending.length ? `<section class="cap-pend"><div class="sec-head"><span class="eyebrow">Waiting for a person</span><h2>Suggested recipes</h2></div>${state.pending.map(r => `<div class="cap-pr"><span>${esc(r.emoji)} <b>${esc(r.title)}</b> <small>from ${esc(r.proposedBy || 'an agent')} · ${esc((r.sections || []).join(', '))}</small></span>${state.canApprove ? `<span class="cap-pr-b"><button class="btn sm" data-rec-ok="${esc(r.id)}">Approve</button><button class="btn sm ghost" data-rec-no="${esc(r.id)}">Discard</button></span>` : ''}</div>`).join('')}</section>` : ''}
      <section class="cap-listsec">
        <div class="cap-lh"><div class="sec-head"><span class="eyebrow">Saved</span><h2>Your captures</h2></div>
          <input class="input cap-search" id="cap-q" type="search" placeholder="Search captures" value="${esc(state.q)}" aria-label="Search captures"></div>
        <div class="cap-list" id="cap-list">${list === null ? '<p class="cap-empty">Loading…</p>' : list.length ? list.map(rowHtml).join('') : `<p class="cap-empty">${state.q ? 'Nothing matches that.' : 'Nothing saved yet. Paste a link above, or record a quick voice note.'}</p>`}</div>
      </section>
      ${host ? `<details class="cap-more"><summary>Capture settings</summary><div class="cap-set">
        ${toggle('cap-auto', 'Read links people paste in chat', !!state.settings.auto)}
        ${toggle('cap-vid', 'Video captions with the optional captions tool', !!state.settings.videoTools)}
        <p class="faint">Optional tools (captions, local transcripts) live in Settings › Packs. <button class="linkish" id="cap-packs">Open Packs</button></p>
        <p class="faint">Flint learns which points you keep. <button class="linkish" id="cap-reset">Reset what it learned</button></p></div></details>` : ''}
    </div>`;
    bindList(sec);
  }
  const toggle = (id, label, on) => `<label class="cap-tg"><span>${esc(label)}</span><button class="toggle set-toggle" role="switch" id="${id}" aria-checked="${on}" aria-label="${esc(label)}"><span class="switch"></span></button></label>`;
  function bindList(sec) {
    const f = sec.querySelector('#cap-add');
    if (f) f.onsubmit = async e => { e.preventDefault(); const i = $('#cap-url'), u = i.value.trim(); if (!u) return i.focus(); const b = $('#cap-go'); b.disabled = true; b.textContent = 'Reading…'; try { const r = await capture(u); i.value = ''; if (r) openNotes(r.capture.id); } finally { b.disabled = false; b.textContent = '📎 Read it'; } };
    const rb = sec.querySelector('#cap-rec-btn'); if (rb) rb.onclick = () => recorder();
    const q = sec.querySelector('#cap-q'); if (q) q.oninput = () => { clearTimeout(q._t); q._t = setTimeout(() => { state.q = q.value.trim(); load(); }, 250); };
    sec.querySelectorAll('[data-cap-open]').forEach(b => b.onclick = () => openNotes(b.dataset.capOpen));
    sec.querySelectorAll('[data-rec-ok],[data-rec-no]').forEach(b => b.onclick = async () => { const ok = !!b.dataset.recOk, id = b.dataset.recOk || b.dataset.recNo; try { await C.api(`/captures/recipes/${encodeURIComponent(id)}${ok ? '/approve' : ''}`, { method: ok ? 'POST' : 'DELETE' }); toast(ok ? 'Recipe approved' : 'Recipe discarded'); load(); } catch (e) { toast(e.message); } });
    const tg = (id, key) => { const el = sec.querySelector('#' + id); if (el) el.onclick = async () => { try { const r = await C.api('/captures/settings', { method: 'PATCH', body: { [key]: el.getAttribute('aria-checked') !== 'true' } }); state.settings = r.settings; el.setAttribute('aria-checked', String(!!r.settings[key])); } catch (e) { toast(e.message); } }; };
    tg('cap-auto', 'auto'); tg('cap-vid', 'videoTools');
    const pk = sec.querySelector('#cap-packs'); if (pk) pk.onclick = () => window.TribeSettings && window.TribeSettings.open().then(() => setTimeout(() => { const el = $('#set-packs'); if (el) el.scrollIntoView({ block: 'center' }); }, 150));
    const rs = sec.querySelector('#cap-reset'); if (rs) rs.onclick = async () => { try { await C.api('/captures/weights', { method: 'DELETE' }); toast('Reset. Flint starts fresh.'); } catch (e) { toast(e.message); } };
  }

  // ---------- capturing ----------
  async function capture(url, extra = {}) {
    try {
      const r = await C.api('/captures', { method: 'POST', body: { url, ...extra } });
      toast(r.duplicate ? 'Already saved. Opening it.' : r.capture.status === 'ready' ? `📎 Saved: ${r.capture.title}` : (r.capture.note || 'Saved the link.'));
      if (open && !state.cur) load();
      return r;
    } catch (e) { toast(e.message); return null; }
  }

  // A small sheet to paste a link (the composer's + menu): posts the card in that conversation.
  function addLink({ channel, url } = {}) {
    if (url) return capture(url, { channel });
    const m = document.createElement('div'); m.className = 'modal cap-recm'; m.id = 'cap-link-sheet'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Read a link');
    m.innerHTML = `<form class="modal-card cap-rec-card"><div class="sec-head"><span class="eyebrow">📎 Captures</span><h2>Read a link</h2></div>
      <input class="input" id="cap-link-in" type="url" inputmode="url" placeholder="https://…" autocomplete="off" spellcheck="false" required>
      <div class="cap-rec-btns"><button class="btn primary" type="submit">Read it</button><button class="btn ghost" type="button" id="cap-link-x">Cancel</button></div></form>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.addEventListener('click', e => { if (e.target === m) close(); });
    m.querySelector('#cap-link-x').onclick = close;
    m.querySelector('form').onsubmit = e => { e.preventDefault(); const v = m.querySelector('#cap-link-in').value.trim(); close(); if (v) capture(v, { channel }); };
    setTimeout(() => m.querySelector('#cap-link-in').focus(), 30);
  }

  // ---------- the notes page ----------
  let curRecipes = [];
  async function openNotes(id) {
    const sec = section(); if (!sec) return;
    if (!open) { show(); }
    state.cur = { id, loading: true }; state.saved = null;
    sec.innerHTML = '<div class="cap-wrap"><p class="cap-empty">Loading…</p></div>';
    try { const r = await C.api('/captures/' + encodeURIComponent(id)); state.cur = r.capture; state.cur._canWrite = r.canWrite; state.cur._canTask = r.canTask; curRecipes = r.recipes || []; }
    catch (e) { state.cur = null; toast(e.message); draw(); load(); return; }
    drawNotes();
  }
  function drawNotes() {
    const c = state.cur, sec = section(); if (!c || !sec) return;
    const w = c._canWrite, href = safeHref(c.url);
    const sec_ = s => !c.sections || c.sections.includes(s);
    const meta = [c.kind === 'voice' ? (c.site === 'Huddle' ? 'Huddle' : 'Voice note') : c.site, c.author, c.published ? dateOf(c.published) : '', c.duration ? mmss(c.duration) : '', c.words ? `${c.words} words` : ''].filter(Boolean);
    const working = c.status === 'working';
    sec.innerHTML = `<div class="cap-wrap cap-notes" data-cap="${esc(c.id)}">
      <button class="btn ghost cap-back" id="cap-back">← All captures</button>
      <div class="sec-head"><span class="eyebrow">${esc(KIND[c.kind] || '📎')} ${esc(c.kind === 'voice' ? 'Voice note' : 'Capture')}</span>
        <input class="cap-title" id="cap-title" value="${esc(c.title)}" aria-label="Title" ${w ? '' : 'readonly'} maxlength="200"></div>
      <p class="cap-meta">${esc(meta.join(' · '))}${href ? ` · <a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open the link</a>` : ''}${c.via ? ` · <span class="faint">${esc(c.via)}</span>` : ''}</p>
      ${c.note ? `<div class="cap-note ${working ? 'live' : ''}" role="status">${esc(c.note)}</div>` : ''}
      <section class="card cap-hero cap-sumcard">
        ${c.thumbnail ? `<img class="cap-big" alt="" src="${esc(thumbUrl(c.id))}">` : ''}
        ${c.audio ? `<audio class="cap-audio" controls preload="none" src="${esc(audioUrl(c.id))}"></audio>` : ''}
        ${sec_('summary') ? `<div class="sec-head"><span class="eyebrow">Summary</span></div>
        <textarea class="cap-sum" id="cap-sum" rows="3" ${w ? '' : 'readonly'} aria-label="Summary" placeholder="${c.status === 'needs-transcript' ? 'Add the transcript below and the summary writes itself.' : 'No summary yet.'}">${esc(c.summary || '')}</textarea>` : ''}
        <div class="cap-tools">
          ${w ? `<select class="input cap-recipe" id="cap-recipe" aria-label="Template">${curRecipes.map(r => `<option value="${esc(r.id)}" ${r.id === c.recipe ? 'selected' : ''}>${esc(r.emoji || '')} ${esc(r.title)}</option>`).join('')}</select>` : ''}
          ${w ? '<button class="btn sm" id="cap-again" title="Run the quick summary again">Summarize again</button><button class="btn sm" id="cap-ai" title="Rewrite in plain words with the tribe\'s AI">Plain words (AI)</button>' : ''}
          ${w && ((c.kind !== 'voice' && /video|short|post/.test(c.kind)) || (c.kind === 'voice' && c.audio)) ? `<button class="btn sm" id="cap-tx">${c.kind === 'voice' ? 'Transcribe on the host' : 'Get captions'}</button>` : ''}
        </div>
      </section>
      ${sec_('points') ? `<section class="cap-sec"><div class="sec-head"><span class="eyebrow">Key points</span></div><ul class="cap-items" id="cap-points">${(c.points || []).map(p => itemHtml(p, 'p', w)).join('')}</ul>${w ? '<button class="linkish cap-add-i" data-add="points">+ Add a point</button>' : ''}</section>` : ''}
      ${sec_('actions') ? `<section class="cap-sec"><div class="sec-head"><span class="eyebrow">Action items</span></div><ul class="cap-items cap-acts" id="cap-actions">${(c.actions || []).map(a => itemHtml(a, 'a', w)).join('')}</ul>
        <div class="cap-act-row">${w ? '<button class="linkish cap-add-i" data-add="actions">+ Add an action</button>' : ''}${(c.actions || []).length ? (c._canTask ? '<button class="btn sm" id="cap-tasks">Make tasks</button>' : '<span class="faint">A person turns these into tasks.</span>') : ''}</div></section>` : ''}
      ${(c.decisions || []).length ? `<section class="cap-sec"><div class="sec-head"><span class="eyebrow">Decisions</span></div><ul class="cap-items" id="cap-decisions">${c.decisions.map(d => itemHtml(d, 'd', w)).join('')}</ul></section>` : ''}
      ${(c.transcript || []).length ? `<details class="cap-sec cap-tx" ${c.kind === 'voice' && (c.transcript || []).length < 12 ? 'open' : ''}><summary><span class="eyebrow">Full transcript</span> <small class="faint">${c.transcript.length} lines${c.transcriptVia ? ' · ' + esc(c.transcriptVia) : ''}</small></summary><div class="cap-lines">${c.transcript.map(l => `<p>${l.t !== null && l.t !== undefined ? `<time>${esc(mmss(l.t))}</time>` : ''}${l.who ? `<b>${esc(l.who)}</b> ` : ''}${esc(l.text)}</p>`).join('')}</div></details>`
        : c.text ? `<details class="cap-sec cap-tx"><summary><span class="eyebrow">Article text</span> <small class="faint">${esc(c.words || '')} words</small></summary><div class="cap-lines cap-article">${String(c.text).split(/\n\s*\n/).slice(0, 400).map(p => /^#{2,4}\s/.test(p) ? `<h4>${esc(p.replace(/^#+\s*/, ''))}</h4>` : `<p>${esc(p)}</p>`).join('')}</div></details>` : ''}
      ${w && (c.status === 'needs-transcript' || ((c.kind !== 'article') && !(c.transcript || []).length)) ? `<section class="cap-sec"><div class="sec-head"><span class="eyebrow">Transcript</span></div><textarea class="input cap-paste" id="cap-paste" rows="5" placeholder="Type or paste the transcript. [01:23] at the start of a line keeps its time."></textarea><button class="btn sm" id="cap-paste-go">Save the transcript</button></section>` : ''}
      <div class="cap-foot">${w ? '<button class="btn" id="cap-doc">Open in Docs</button>' : ''}${human() ? '<button class="btn ghost danger" id="cap-del">Delete</button>' : ''}<span class="faint cap-saved" id="cap-saved" aria-live="polite"></span></div>
    </div>`;
    bindNotes(sec);
    if (state.saved && Date.now() - state.saved.at < 5000) { const sv = $('#cap-saved'); if (sv) sv.textContent = state.saved.text; }
  }
  function itemHtml(x, kind, w) {
    const t = x.t !== null && x.t !== undefined ? `<time>${esc(mmss(x.t))}</time>` : '';
    return `<li class="cap-i" data-iid="${esc(x.id)}">${kind === 'a' ? `<input type="checkbox" class="cap-ck" aria-label="Pick for a task" ${x.task ? 'checked disabled' : ''}>` : ''}${t}
      <span class="cap-it" ${w && !x.task ? 'contenteditable="plaintext-only" role="textbox" spellcheck="true"' : ''} aria-label="${kind === 'a' ? 'Action item' : kind === 'd' ? 'Decision' : 'Point'}">${esc(x.text)}</span>${x.task ? '<small class="cap-tk">task made</small>' : ''}
      ${w ? `<button class="cap-x" data-del aria-label="Remove" title="Remove">✕</button>` : ''}</li>`;
  }
  const readItems = (id, old) => [...document.querySelectorAll(`#${id} .cap-i`)].map(li => ({ id: li.dataset.iid.startsWith('new-') ? undefined : li.dataset.iid, text: (li.querySelector('.cap-it') || {}).textContent || '' })).filter(x => x.text.trim());
  function queueSave(fields) {
    const c = state.cur; if (!c) return;
    state.pendingFields = Object.assign(state.pendingFields || {}, fields);
    const s = $('#cap-saved'); if (s) s.textContent = 'Editing…';
    clearTimeout(state.saveT); state.saveT = setTimeout(saveNow, 700);
  }
  async function saveNow() {
    const c = state.cur, f = state.pendingFields; state.pendingFields = null; if (!c || !f) return;
    const body = {};
    if (f.title) body.title = ($('#cap-title') || {}).value || c.title;
    if (f.summary) body.summary = ($('#cap-sum') || {}).value || '';
    for (const k of ['points', 'actions', 'decisions']) if (f[k]) body[k] = readItems('cap-' + k);
    try {
      const r = await C.api('/captures/' + encodeURIComponent(c.id), { method: 'PATCH', body });
      const keep = { _canWrite: c._canWrite, _canTask: c._canTask }; state.cur = { ...r.capture, ...keep };
      if (Object.keys(body).some(k => k !== 'summary' && k !== 'title') && !document.activeElement.closest('.cap-it')) drawNotes();
      else syncIds();
      state.saved = { at: Date.now(), text: r.learned ? 'Saved · Flint noted what you kept' : 'Saved' };
      const s = $('#cap-saved'); if (s) s.textContent = state.saved.text;
    } catch (e) { toast(e.message); }
  }
  function syncIds() {   // new items get server ids: keep the DOM in step without redrawing under the cursor
    for (const k of ['points', 'actions', 'decisions']) {
      const lis = [...document.querySelectorAll(`#cap-${k} .cap-i`)], items = state.cur[k] || [];
      lis.forEach((li, i) => { if (items[i]) li.dataset.iid = items[i].id; });
    }
  }
  function bindNotes(sec) {
    const c = state.cur;
    sec.querySelector('#cap-back').onclick = () => { state.cur = null; stopAudio(); draw(); load(); };
    const ti = sec.querySelector('#cap-title'); if (ti && c._canWrite) ti.oninput = () => queueSave({ title: true });
    const su = sec.querySelector('#cap-sum'); if (su) { autosize(su); su.oninput = () => { autosize(su); if (c._canWrite) queueSave({ summary: true }); }; }
    for (const k of ['points', 'actions', 'decisions']) {
      const ul = sec.querySelector('#cap-' + k); if (!ul) continue;
      ul.addEventListener('input', e => { if (e.target.closest('.cap-it')) queueSave({ [k]: true }); });
      ul.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.cap-it')) { e.preventDefault(); e.target.blur(); } });
      ul.addEventListener('click', e => { const x = e.target.closest('[data-del]'); if (x) { x.closest('.cap-i').remove(); queueSave({ [k]: true }); } });
    }
    sec.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const ul = sec.querySelector('#cap-' + b.dataset.add); if (!ul) return;
      ul.insertAdjacentHTML('beforeend', itemHtml({ id: 'new-' + Math.random().toString(36).slice(2, 7), text: '', t: null }, b.dataset.add === 'actions' ? 'a' : 'p', true));
      const it = ul.lastElementChild.querySelector('.cap-it'); it.focus();
    });
    const tk = sec.querySelector('#cap-tasks'); if (tk) tk.onclick = async () => {
      const lis = [...sec.querySelectorAll('#cap-actions .cap-i')]; let items = lis.map((li, i) => (li.querySelector('.cap-ck:checked:not(:disabled)') ? i : -1)).filter(i => i >= 0);
      if (!items.length) items = lis.map((li, i) => (li.querySelector('.cap-ck:disabled') ? -1 : i)).filter(i => i >= 0);
      if (!items.length) return toast('Every action already has a task.');
      if (state.pendingFields) await saveNow();
      try { const r = await C.api(`/captures/${encodeURIComponent(c.id)}/tasks`, { method: 'POST', body: { items } }); state.cur = { ...r.capture, _canWrite: c._canWrite, _canTask: c._canTask }; drawNotes(); toast(`Made ${r.tasks.length} task${r.tasks.length === 1 ? '' : 's'} on the board`); } catch (e) { toast(e.message); }
    };
    const act = (id, fn) => { const b = sec.querySelector(id); if (b) b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { toast(e.message); } finally { if (b.isConnected) b.disabled = false; } }; };
    const reload = r => { state.cur = { ...r.capture, _canWrite: c._canWrite, _canTask: c._canTask }; drawNotes(); };
    act('#cap-again', async () => { if (state.pendingFields) await saveNow(); reload(await C.api(`/captures/${encodeURIComponent(c.id)}/summarize`, { method: 'POST', body: { depth: 'quick' } })); toast('Summarized again'); });
    act('#cap-ai', async () => { toast('Asking the tribe\'s AI…'); reload(await C.api(`/captures/${encodeURIComponent(c.id)}/summarize`, { method: 'POST', body: { depth: 'model' } })); toast('Rewritten in plain words'); });
    act('#cap-tx', async () => { toast(c.kind === 'voice' ? 'Transcribing…' : 'Getting the captions…'); reload(await C.api(`/captures/${encodeURIComponent(c.id)}/transcribe`, { method: 'POST', body: {} })); });
    act('#cap-paste-go', async () => { const v = ($('#cap-paste') || {}).value || ''; if (!v.trim()) return toast('Type or paste the transcript first.'); reload(await C.api('/captures/' + encodeURIComponent(c.id), { method: 'PATCH', body: { transcript: v } })); toast('Transcript saved. Notes updated.'); });
    const rc = sec.querySelector('#cap-recipe'); if (rc) rc.onchange = async () => { try { reload(await C.api('/captures/' + encodeURIComponent(c.id), { method: 'PATCH', body: { recipe: rc.value } })); toast('Template changed'); } catch (e) { toast(e.message); } };
    act('#cap-doc', async () => { const r = await C.api(`/captures/${encodeURIComponent(c.id)}/doc`, { method: 'POST', body: {} }); if (window.TribeApp) window.TribeApp.show('docs'); setTimeout(() => window.TribeDocs && window.TribeDocs.load(r.doc.slug), 60); toast(`Opened "${r.doc.title}" in Docs`); });
    const del = sec.querySelector('#cap-del'); let armed = false;
    if (del) del.onclick = async () => { if (!armed) { armed = true; del.textContent = 'Tap again to delete'; return; } try { await C.api('/captures/' + encodeURIComponent(c.id), { method: 'DELETE' }); toast('Deleted'); state.cur = null; draw(); load(); } catch (e) { toast(e.message); } };
  }
  function autosize(t) { t.style.height = 'auto'; t.style.height = Math.min(600, Math.max(72, t.scrollHeight + 2)) + 'px'; }
  function stopAudio() { document.querySelectorAll('.cap-audio').forEach(a => { try { a.pause(); } catch {} }); }

  // live updates (a whisper job finished, someone edited)
  C.on('ws', m => {
    if (!m || m.type !== 'capture') return;
    if (open && state.cur && state.cur.id === m.id) {
      if (m.removed) { state.cur = null; draw(); load(); return; }
      const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.cap-notes') && /TEXTAREA|INPUT/.test(document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
      if (!typing && !state.pendingFields) C.api('/captures/' + encodeURIComponent(m.id)).then(r => { if (state.cur && state.cur.id === m.id) { state.cur = { ...r.capture, _canWrite: r.canWrite, _canTask: r.canTask }; drawNotes(); } }).catch(() => {});
    } else if (open && !state.cur) { clearTimeout(state.lt); state.lt = setTimeout(load, 300); }
    if (m.status === 'ready' || m.removed) refreshCards(m.id);
  });
  C.on('project', () => { state = { ...state, list: null, cur: null, q: '' }; if (open) { draw(); load(); } phoneEntry(true); });

  // ---------- chat card ----------
  function card(cap) {
    if (!cap || !cap.id) return '';
    const n = Number(cap.actions) || 0;
    return `<div class="cap-card" data-cap-card="${esc(cap.id)}">
      <div class="cap-cc">${cap.thumb ? `<img class="cap-ct" alt="" loading="lazy" src="${esc(thumbUrl(cap.id))}">` : `<span class="cap-ct cap-ce" aria-hidden="true">${esc(cap.emoji || '📎')}</span>`}
        <div class="cap-cb"><b class="cap-cn">${esc(cap.title)}</b><small>${esc([cap.site, cap.kind === 'voice' ? '' : cap.kind].filter(Boolean).join(' · '))}</small></div></div>
      ${cap.summary ? `<div class="cap-cs">${esc(cap.summary)}</div>` : cap.note ? `<div class="cap-cs faint">${esc(cap.note)}</div>` : ''}
      <div class="cap-cbtn"><button class="btn sm" data-cap-notes="${esc(cap.id)}">Open notes</button>${n ? `<button class="btn sm" data-cap-tasks="${esc(cap.id)}">Make tasks (${n})</button>` : ''}</div></div>`;
  }
  function refreshCards(id) { /* cards are snapshots; the notes page always loads the latest */ }
  document.addEventListener('click', async e => {
    const o = e.target.closest && e.target.closest('[data-cap-notes]');
    if (o) { e.preventDefault(); e.stopPropagation(); show(o.dataset.capNotes); return; }
    const t = e.target.closest && e.target.closest('[data-cap-tasks]');
    if (t) { e.preventDefault(); e.stopPropagation(); show(t.dataset.capTasks); return; }
  }, true);

  // ---------- chat: message menu items + drop a link ----------
  const urlsIn = t => (String(t || '').match(/https?:\/\/[^\s<>"'`]+/g) || []).map(u => u.replace(/[.,;:!?)\]]+$/, ''));
  function menuItems(m, ch) {
    if (!m || m.deleted || !canWrite()) return '';
    const ic = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
    let out = '';
    if (!m.media && urlsIn(m.text).length) out += `<button role="menuitem" data-act="cap-link">${ic('i-link')}📎 Read &amp; summarize</button>`;
    if (m.media && m.media.kind === 'voice') out += `<button role="menuitem" data-act="cap-voice">${ic('i-doc')}🎙️ Make notes</button>`;
    return out;
  }
  async function menuAct(act, m, ch) {
    if (act === 'cap-link') { for (const u of urlsIn(m.text).slice(0, 3)) await capture(u, { channel: ch, message: m.id }); return; }
    if (act === 'cap-voice') {
      try { const r = await C.api('/captures/voice', { method: 'POST', body: { channel: ch, message: m.id, recipe: 'voice' } }); toast(r.capture.status === 'working' ? 'Transcribing on the host…' : 'Notes made'); show(r.capture.id); } catch (e) { toast(e.message); }
    }
  }
  const chan = () => { const D = window.TribeDM, v = D && D.current(); return !v || v === 'general' ? 'general' : v; };
  document.addEventListener('drop', e => {
    const dt = e.dataTransfer; if (!dt || (dt.files && dt.files.length)) return;
    if (!e.target.closest || !e.target.closest('#view-chat, .chat-main, #chat-list, .composer')) return;
    const uri = (dt.getData('text/uri-list') || '').split('\n').map(s => s.trim()).find(s => s && !s.startsWith('#'));
    if (!uri || !/^https?:\/\//.test(uri) || !canWrite()) return;
    e.preventDefault(); e.stopPropagation(); capture(uri, { channel: chan() });
  }, true);

  // ---------- the recorder (Notes › Record) ----------
  let rec = null;
  async function recorder(opts = {}) {
    if (rec) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return toast('Recording needs a browser with a microphone (Chrome, Edge, Safari or Firefox).');
    const wrap = document.createElement('div'); wrap.className = 'modal cap-recm'; wrap.id = 'cap-rec'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Record a voice note');
    const speech = window.TribeSpeech && window.TribeSpeech.supported && window.TribeSpeech.supported();
    wrap.innerHTML = `<div class="modal-card cap-rec-card">
      <div class="sec-head"><span class="eyebrow">🎙️ Voice note</span><h2>Record</h2></div>
      <label class="cap-rl"><span>Template</span><select class="input" id="cap-rec-recipe">${recipeOptions(opts.recipe || 'voice', true)}</select></label>
      <div class="cap-rec-time" id="cap-rec-time" aria-live="off">00:00</div>
      <div class="cap-rec-live" id="cap-rec-live" aria-live="polite">${speech ? '<span class="faint">Live transcript shows here as you talk.</span>' : '<span class="faint">No live transcript in this browser. You can type or paste it after.</span>'}</div>
      <div class="cap-rec-btns"><button class="btn" id="cap-rec-pause">Pause</button><button class="btn primary" id="cap-rec-stop">Stop &amp; make notes</button><button class="btn ghost" id="cap-rec-x">Discard</button></div>
    </div>`;
    document.body.appendChild(wrap);
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { wrap.remove(); return toast('I couldn\'t use the microphone. Check the browser\'s permission and try again.'); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
    rec = { mr, stream, wrap, chunks, lines: [], interim: '', start: Date.now(), pausedFor: 0, pausedAt: 0 };
    const elapsed = () => ((rec.pausedAt || Date.now()) - rec.start - rec.pausedFor) / 1000;
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.start(1000);
    const live = $('#cap-rec-live');
    const paint = () => { if (!live) return; live.innerHTML = rec.lines.slice(-6).map(l => `<p><time>${esc(mmss(l.t))}</time>${esc(l.text)}</p>`).join('') + (rec.interim ? `<p class="faint">${esc(rec.interim)}</p>` : '') || '<span class="faint">Listening…</span>'; live.scrollTop = live.scrollHeight; };
    if (speech) window.TribeSpeech.use('captures', { label: 'Voice note', onFinal: t => { if (!rec || rec.pausedAt) return; const s = String(t || '').trim(); if (s) rec.lines.push({ t: Math.max(0, Math.round(elapsed() - s.split(/\s+/).length * 0.4)), text: s }); rec.interim = ''; paint(); }, onInterim: t => { if (!rec || rec.pausedAt) return; rec.interim = String(t || ''); paint(); } });
    rec.tick = setInterval(() => { const el = $('#cap-rec-time'); if (el) el.textContent = mmss(elapsed()); if (elapsed() > 3600) stop(true); }, 250);
    const pause = $('#cap-rec-pause');
    pause.onclick = () => {
      if (!rec) return;
      if (rec.pausedAt) { rec.pausedFor += Date.now() - rec.pausedAt; rec.pausedAt = 0; try { mr.resume(); } catch {} pause.textContent = 'Pause'; wrap.classList.remove('paused'); }
      else { rec.pausedAt = Date.now(); try { mr.pause(); } catch {} pause.textContent = 'Resume'; wrap.classList.add('paused'); }
    };
    $('#cap-rec-stop').onclick = () => stop(true);
    $('#cap-rec-x').onclick = () => stop(false);
    async function stop(keep) {
      if (!rec) return; const r = rec; rec = null;
      clearInterval(r.tick); if (window.TribeSpeech && window.TribeSpeech.release) window.TribeSpeech.release('captures');
      const dur = Math.round(((r.pausedAt || Date.now()) - r.start - r.pausedFor) / 1000);
      const done = new Promise(res => { mr.onstop = res; }); try { mr.stop(); } catch {} await Promise.race([done, new Promise(res => setTimeout(res, 1500))]);
      r.stream.getTracks().forEach(t => t.stop());
      const recipe = ($('#cap-rec-recipe') || {}).value || 'voice';
      r.wrap.remove();
      if (!keep) return toast('Discarded');
      if (r.interim) r.lines.push({ t: Math.max(0, dur - 2), text: r.interim });
      const blob = new Blob(r.chunks, { type: (mr.mimeType || 'audio/webm').split(';')[0] });
      toast('Making notes…');
      try {
        const data = blob.size ? await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(blob); }) : '';
        const out = await C.api('/captures/voice', { method: 'POST', body: { data, mime: blob.type || 'audio/webm', dur, lines: r.lines, recipe, ...(opts.channel ? { channel: opts.channel, post: true } : {}) } });
        show(out.capture.id);
      } catch (e) { toast(e.message); }
    }
  }

  // ---------- Settings › Packs ----------
  const size = n => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? Math.round(n / 1e6) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
  async function mountPacks(el) {
    let data; try { data = await C.api('/packs'); } catch (e) { el.innerHTML = `<span class="faint">${esc(e.message)}</span>`; return; }
    const row = p => `<div class="pk-row" data-pack="${esc(p.id)}"><div class="pk-t"><b>${esc(p.title)}</b><small>${esc(p.what)}</small>
      <small class="faint">${esc(p.license)} · ${p.installed ? `on this computer, ${size(p.installedBytes)}` : `${p.approx ? 'about ' : ''}${size(p.bytes)} download`}${p.kind === 'whisper' && p.installed ? (p.engine ? ' · whisper.cpp found' : ' · whisper.cpp not found yet') : ''}${p.lastUsed ? ' · used ' + esc(ago(p.lastUsed)) : ''}</small>
      ${p.downloading ? `<span class="pk-bar"><i style="width:${Math.min(100, Math.round(p.downloading.got / Math.max(1, p.downloading.total) * 100))}%"></i></span>` : ''}${p.error ? `<small class="pk-err">${esc(p.error)}</small>` : ''}
      ${p.kind === 'whisper' && p.installed && !p.engine && p.note ? `<small class="faint">${esc(p.note)}</small>` : ''}</div>
      <div class="pk-b">${!p.available ? '<span class="faint">Not for this computer</span>' : p.downloading ? '<span class="faint">Downloading…</span>' : p.installed ? `<button class="btn sm" data-pk-rm="${esc(p.id)}">Remove</button>` : data.host ? `<button class="btn sm" data-pk-add="${esc(p.id)}">Add</button>` : ''}</div></div>`;
    el.innerHTML = `<div class="pk-list">${data.packs.map(row).join('')}</div>${data.host ? '' : '<small class="faint">Only the host adds or removes packs.</small>'}`;
    el.querySelectorAll('[data-pk-add]').forEach(b => b.onclick = async () => {
      const p = data.packs.find(x => x.id === b.dataset.pkAdd); if (!p) return;
      const note = p.terms || p.note;
      if (note && !(await confirmNote(p, note))) return;
      try { await C.api(`/packs/${encodeURIComponent(p.id)}/install`, { method: 'POST', body: { accept: true } }); toast(`Downloading ${p.title}…`); mountPacks(el); } catch (e) { toast(e.message); }
    });
    el.querySelectorAll('[data-pk-rm]').forEach(b => b.onclick = async () => { try { await C.api(`/packs/${encodeURIComponent(b.dataset.pkRm)}`, { method: 'DELETE' }); toast('Removed'); mountPacks(el); } catch (e) { toast(e.message); } });
  }
  function confirmNote(p, note) {
    return new Promise(res => {
      const m = document.createElement('div'); m.className = 'modal cap-recm'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', p.title);
      m.innerHTML = `<div class="modal-card cap-rec-card"><div class="sec-head"><span class="eyebrow">Optional pack</span><h2>${esc(p.title)}</h2></div><p class="cap-terms">${esc(note)}</p>
        <p class="faint">${p.approx ? 'About ' : ''}${esc(size(p.bytes))} download · ${esc(p.license)} · checked by sha256 before it is used.</p>
        <label class="cap-ok"><input type="checkbox" id="pk-ok"> I understand</label>
        <div class="cap-rec-btns"><button class="btn primary" id="pk-yes" disabled>Download</button><button class="btn ghost" id="pk-no">Cancel</button></div></div>`;
      document.body.appendChild(m);
      const ok = m.querySelector('#pk-ok'), yes = m.querySelector('#pk-yes');
      ok.onchange = () => { yes.disabled = !ok.checked; };
      yes.onclick = () => { m.remove(); res(true); }; m.querySelector('#pk-no').onclick = () => { m.remove(); res(false); };
    });
  }
  C.on('ws', m => { if (m && m.type === 'packs') { const el = $('#set-packs'); if (el && (m.done || !el._t || Date.now() - el._t > 1500)) { el._t = Date.now(); mountPacks(el); } } });

  // ---------- phone: Files shows a Captures entry ----------
  async function phoneEntry(force) {
    if (!phone() || document.body.dataset.view !== 'docs' || !C.connected()) return;
    const view = $('#view-docs'); if (!view) return;
    let box = $('#cap-m2');
    if (!box) { box = document.createElement('section'); box.id = 'cap-m2'; box.className = 'm2-only m2-sect cap-m2'; const hub = $('#m2-docs-hub'); if (hub) hub.after(box); else view.prepend(box); }
    if (!force && box._at && Date.now() - box._at < 10000) return;
    box._at = Date.now();
    let list = []; try { list = (await C.api('/captures')).captures || []; } catch {}
    box.innerHTML = `<div class="sec-head"><span class="eyebrow">📎 Captures</span><h2>Links &amp; voice notes</h2></div>
      <div class="cap-list">${list.slice(0, 3).map(rowHtml).join('') || '<p class="m2-empty">Paste a link or record a voice note to get short notes.</p>'}</div>
      <div class="cap-m2-b"><button class="btn" id="cap-m2-all">Open Captures</button>${canWrite() ? '<button class="btn" id="cap-m2-rec">🎙️ Record</button>' : ''}</div>`;
    box.querySelectorAll('[data-cap-open]').forEach(b => b.onclick = () => show(b.dataset.capOpen));
    box.querySelector('#cap-m2-all').onclick = () => go();
    const r = box.querySelector('#cap-m2-rec'); if (r) r.onclick = () => recorder();
  }

  // ---------- Flint ----------
  async function flint(text) {
    const t = String(text || '').trim();
    let m = /^(?:please\s+)?(?:summari[sz]e|read|capture|save|tl;?dr)\s+(?:this\s+|that\s+)?(https?:\/\/\S+)/i.exec(t) || /^(https?:\/\/\S+)$/i.exec(t);
    if (m) {
      if (!C.connected()) return { text: 'Start or join a tribe first, then I can read links into Captures.' };
      try {
        const r = await C.api('/captures', { method: 'POST', body: { url: m[1].replace(/[.,;:!?)\]]+$/, '') } });
        const c = r.capture;
        return { text: `${r.duplicate ? 'Already saved' : 'Saved'}: ${c.title}. ${c.summary ? c.summary.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ') : (c.note || '')}${(c.actions || []).length ? ` ${c.actions.length} action item${c.actions.length === 1 ? '' : 's'}.` : ''}`, capture: c.id };
      } catch (e) { return { text: e.message }; }
    }
    m = /\b(?:what|when|how)\b.*\b(?:did|have)\s+(?:we|you|they|i)\s+(?:decide|agree|say|plan|settle)\b/i.exec(t) || /^(?:what was (?:the )?decision|what's the decision)\b/i.exec(t);
    // "what did we decide (today | so far)?" has no topic: the Secretary's summary answers that (flintlocal secretary.summary)
    if (m && !/\b(?:about|on|for|regarding|with)\s+\S/i.test(t)) m = null;
    if (m) {
      if (!C.connected()) return { text: 'I search the tribe\'s captures and notes. Join a tribe first.' };
      try {
        const r = await C.api('/captures/ask?q=' + encodeURIComponent(t));
        if (!r || !Array.isArray(r.quotes) || !r.quotes.length) return { text: `I didn't find anything about "${(r && r.topic) || t}" in captures or notes yet.` };
        const q = r.quotes[0];
        const when = q.when ? new Date(q.when).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
        const more = r.quotes.slice(1).map(x => `“${x.text}” (${x.title}${x.at ? ' ' + x.at : ''})`).join(' · ');
        return { text: `In “${q.title}”${when ? ` (${when})` : ''}${q.at ? ` at ${q.at}` : ''}${q.who ? `, ${q.who} said` : ''}: “${q.text}”${more ? `\nAlso: ${more}` : ''}`, capture: q.capture || null };
      } catch (e) { return { text: e.message }; }
    }
    return null;
  }

  window.TribeCaptures = { open: show, go, card, menuItems, menuAct, recorder, capture, addLink, flint, mountPacks };
  window.TribePacks = { mount: mountPacks };
})();
