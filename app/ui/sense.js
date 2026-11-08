// Project sense, client side (feat/project-sense): the Dashboard's small "Inspiration" card and the copy that follows
// what the project is (a game, an app, a website…). Server side: server/sense.js (GET/PUT /api/projects/:id/sense).
//   Inspiration   1–3 gentle cards (2 on phones): a palette, a feature idea, a reference to look at, a starter task.
//                 More cycles; × hides one for you (kept on the host); "Make it a task" adds it to the Task Board.
//   This is a…    host and builders can correct the sensed kind (game · app · site · …) or hand it back to sensing,
//                 and turn Flint's idea notes in chat off for this project.
// Public: window.TribeSense = { card(p), get(), kind(), noun(), previewLabel(), refresh() }.
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const pid = () => (window.TribeProjects && window.TribeProjects.current()) || (C.project && C.project()) || '';
  const an = w => (/^[aeiou3]/i.test(w) ? 'an' : 'a');
  const KIND_EMO = { game: '🎮', '3d': '🧊', app: '📱', site: '🌐', tool: '🛠️', bot: '🤖', api: '🔌', notes: '📚' };

  let st = null, forPid = '', offset = 0, open = '', seq = 0;
  const done = new Set();   // inspiration ids turned into tasks this session

  async function load(p) {
    const n = ++seq;
    try { const r = await C.api(`/projects/${encodeURIComponent(p)}/sense`); if (n !== seq) return null; st = r; forPid = p; return r; }
    catch { if (n === seq) { st = null; forPid = p; } return null; }
  }

  // ---------- the Dashboard card ----------
  function card(p) {
    const slot = $('#pj-insp-slot'); if (!slot || !p) return;
    if (forPid !== p.id) { offset = 0; open = ''; }
    load(p.id).then(() => draw());
  }
  function draw() {
    const slot = $('#pj-insp-slot'); if (!slot) return;
    if (!st || forPid !== pid()) { slot.innerHTML = ''; return; }
    const items = st.inspiration || [];
    const n = isPhone() ? 2 : 3, k = st.kind && st.kind !== 'other' ? st.kind : '', noun = k ? st.label : 'project';
    if (!items.length && !st.canEdit) { slot.innerHTML = ''; return; }
    if (offset >= items.length) offset = 0;
    const shown = items.length <= n ? items : [...items.slice(offset, offset + n), ...items.slice(0, Math.max(0, offset + n - items.length))].slice(0, n);
    const title = k ? `Ideas for your ${esc(noun)}` : 'Ideas to get going';
    const fix = st.canEdit ? `<button class="linkish sx-fix" id="sx-fix" aria-expanded="${open === 'kind'}">${k ? `Not ${an(noun)} ${esc(noun)}?` : 'What is it?'}</button>` : '';
    const why = (st.signals || []).length ? `<button class="linkish sx-whyb" id="sx-whyb" aria-expanded="${open === 'why'}">Why?</button>` : '';
    slot.innerHTML = `<section class="card sx-card" id="pj-insp" data-kind="${esc(k)}">
      <div class="sx-head"><div class="sx-ttl"><span class="eyebrow"><span class="emo" aria-hidden="true">💡</span>Inspiration${k ? ` · ${KIND_EMO[k] || ''} ${esc(noun)}` : ''}</span><h3>${title}</h3></div>
        ${items.length > n ? '<button class="btn sm sx-more" id="sx-more" title="Show other ideas">More</button>' : ''}</div>
      <p class="sx-sum">${esc(st.summary || '')} ${why}${fix}</p>
      ${open === 'why' ? `<ul class="sx-why" id="sx-why">${st.signals.map(s => `<li><span class="sx-from">${esc(s.from)}</span>${esc(s.text)}</li>`).join('')}</ul>` : ''}
      ${open === 'kind' && st.canEdit ? kindRow() : ''}
      <div class="sx-list">${shown.map(item).join('') || '<p class="sx-none">No more ideas right now. They come back as the project grows.</p>'}</div></section>`;
    wire(slot);
  }
  function kindRow() {
    const cur = st.override || '';
    return `<div class="sx-kinds" id="sx-kinds" role="group" aria-label="This is a"><span class="sx-k-l">This is ${an(st.label || 'a')}:</span>
      ${st.kinds.map(x => `<button class="sx-chip ${cur === x.id ? 'on' : ''}" data-kind="${esc(x.id)}" aria-pressed="${cur === x.id}">${KIND_EMO[x.id] ? `<span class="emo" aria-hidden="true">${KIND_EMO[x.id]}</span>` : ''}${esc(x.label)}</button>`).join('')}
      <button class="sx-chip ${cur ? '' : 'on'}" data-kind="" aria-pressed="${!cur}">✨ Sense it</button>
      <label class="sx-notes"><input type="checkbox" id="sx-notes" ${st.notes ? 'checked' : ''}> Flint drops ideas in chat</label></div>`;
  }
  // feat/setup-flow: a colored thumbnail strip on the left (tinted by type; a palette shows its swatches), a bold
  // title, one line of body, and "Make it a task" at the bottom right.
  function item(it) {
    const added = done.has(it.id);
    const thumb = it.colors ? `<span class="sx-thumb sx-pal" aria-label="Colors: ${esc(it.colors.join(', '))}">${it.colors.map(c => `<i style="background:${esc(c)}" title="${esc(c)}"></i>`).join('')}</span>`
      : `<span class="sx-thumb" aria-hidden="true"><span class="sx-emo">${esc(it.emoji || '💡')}</span></span>`;
    return `<div class="sx-item" data-sx="${esc(it.id)}" data-type="${esc(it.type)}">${thumb}
      <div class="sx-body"><b>${esc(it.title)}</b><p title="${esc(it.text || '')}">${esc(it.text || '')}</p>
        ${it.task && C.state && (C.state().me || {}).role !== 'spectator' ? `<div class="sx-acts"><button class="btn sm sx-task" data-task="${esc(it.id)}" ${added ? 'disabled' : ''}>${added ? 'Added to tasks' : 'Make it a task'}</button></div>` : ''}</div>
      <button class="sx-x" data-dismiss="${esc(it.id)}" title="Hide this idea" aria-label="Hide this idea">×</button></div>`;
  }
  function wire(slot) {
    const p = forPid;
    const more = slot.querySelector('#sx-more'); if (more) more.onclick = () => { offset += isPhone() ? 2 : 3; draw(); };
    const fx = slot.querySelector('#sx-fix'); if (fx) fx.onclick = () => { open = open === 'kind' ? '' : 'kind'; draw(); };
    const wy = slot.querySelector('#sx-whyb'); if (wy) wy.onclick = () => { open = open === 'why' ? '' : 'why'; draw(); };
    slot.querySelectorAll('[data-kind]').forEach(b => { if (b.closest('#sx-kinds')) b.onclick = () => put(p, { kind: b.dataset.kind }); });
    const nt = slot.querySelector('#sx-notes'); if (nt) nt.onchange = () => put(p, { notes: nt.checked });
    slot.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = async () => {
      const el = b.closest('.sx-item'); if (el) el.classList.add('gone');
      try { st = await C.api(`/projects/${encodeURIComponent(p)}/sense/dismiss`, { method: 'POST', body: { id: b.dataset.dismiss } }); } catch (e) { toast(e.message); }
      draw();
    });
    slot.querySelectorAll('[data-task]').forEach(b => b.onclick = async () => {
      const it = (st.inspiration || []).find(x => x.id === b.dataset.task); if (!it) return;
      b.disabled = true;
      const body = [it.text, it.colors ? `Colors: ${it.colors.join(', ')}` : '', '_From the Inspiration card._'].filter(Boolean).join('\n\n');
      try { const { task } = await C.api('/tasks', { method: 'POST', body: { title: it.task, body, status: 'backlog' } }); done.add(it.id); toast(`📝 Task created: ${task.title}`); draw(); }
      catch (e) { b.disabled = false; toast(e.message); }
    });
  }
  async function put(p, body) {
    try { st = await C.api(`/projects/${encodeURIComponent(p)}/sense`, { method: 'PUT', body }); if (body.kind !== undefined) { open = ''; toast(body.kind ? `Got it: this is ${an(st.label)} ${st.label}` : 'Back to sensing it from the project'); } draw(); if (window.TribeWidgets) window.TribeWidgets.refresh(); }
    catch (e) { toast(e.message); }
  }

  // ---------- live ----------
  let rt; const soon = () => { clearTimeout(rt); rt = setTimeout(() => { const p = pid(); if (p && $('#pj-insp-slot')) load(p).then(draw); }, 300); };
  C.on('ws', m => { if (m && m.type === 'sense' && (!m.project || m.project === pid())) soon(); });
  C.on('project', () => { st = null; });
  let wasPhone = isPhone(); addEventListener('resize', () => { if (isPhone() !== wasPhone) { wasPhone = isPhone(); draw(); } });

  // ---------- copy that follows the project ----------
  const W = () => (window.TribeWidgets && window.TribeWidgets.state && window.TribeWidgets.state()) || {};
  function previewLabel() {
    const w = W(); if (w.preview && w.preview.show && w.preview.label && w.project === pid()) return w.preview.label;
    if (st && forPid === pid() && st.preview) return st.preview;
    return 'Preview';
  }
  window.TribeSense = { card, get: () => (forPid === pid() ? st : null), kind: () => (st && forPid === pid() ? st.kind : ''), noun: () => (st && forPid === pid() && st.kind !== 'other' ? st.label : 'app'), previewLabel, refresh: soon };
})();
