// Company-running templates (feat/work-company): standups, reviews, OKRs, briefs, launch and website plans, hiring,
// onboarding, investor updates, retros and postmortems (the library is app/ui/doctpl-data.js).
//   Guided    3-5 friendly questions, one at a time, with Skip and Back. No AI: the answers fill the doc.
//   Advanced  a switch that works at any moment: every question at once, with a live preview. Answers carry over.
//   ✦ Draft the rest   fills empty sections from the project (open/done tasks, people, name) at once ("Basic · no AI");
//             with the tribe's AI on, the same sections are drafted from the project context ("✦ via …").
//   Save      into the project's Files (POST /api/docs), or on this device with no tribe (TribeLocalFiles.create).
//   Rituals   the standup (and weekly review, retro) can become a calendar ritual: "every weekday at 9"
//             (POST /api/rituals → server/rituals.js + plan.js). When it starts, a card asks each member their three
//             lines; the answers go to chat and into one doc.
// Lives in Work › Templates (and Work's no-tribe state).  window.TribeTemplates = { mount(el), open(id), close(), lib }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const L = () => window.TribeTemplateLib;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const connected = () => !!(C() && C().connected && C().connected());
  const state = () => (connected() && C().state && C().state()) || {};
  const md = s => (window.TribeMD && window.TribeMD.render ? window.TribeMD.render(String(s || '')) : `<pre>${esc(s)}</pre>`);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const LS = 'tribecode.templates.draft.v1';

  const root = document.createElement('div'); root.className = 'dt-root'; root.id = 'dt-root';
  let s = { view: 'lib', t: null, v: {}, step: 0, adv: false, via: '', boosting: false, saved: null, rituals: null };
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(s.t ? { id: s.t.id, v: s.v, step: s.step, adv: s.adv } : {})); } catch {} };

  function mount(el) {
    if (!el) return;
    if (root.parentNode !== el) el.appendChild(root);
    if (!root.firstChild) draw();
    if (connected() && !s.rituals) loadRituals();
  }
  async function loadRituals() { try { s.rituals = await C().api('/rituals'); if (s.view === 'lib') draw(); } catch { s.rituals = { events: [], runs: [] }; } }

  // ---------- library ----------
  function libHtml() {
    const T = L().TEMPLATES, evs = (s.rituals && s.rituals.events) || [];
    return `<div class="dt-lib" id="dt-lib">
      ${evs.length ? `<section class="dt-rit-on"><span class="eyebrow">Running</span>${evs.map(e => `<span class="dt-pill">${esc(e.title)} · ${esc(e.repeat === 'weekdays' ? 'weekdays' : e.repeat || 'once')} · ${esc(new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span>`).join('')}</section>` : ''}
      ${L().GROUPS.map(g => { const list = T.filter(t => t.group === g); return list.length ? `<section class="dt-group"><span class="eyebrow">${esc(g)}</span><div class="dt-grid">${list.map(t => `<button class="dt-card${t.premium ? ' prem' : ''}" data-tpl="${esc(t.id)}"><b>${esc(t.title)}${t.premium ? ' <i class="dt-prem">Premium</i>' : ''}</b><span>${esc(t.summary)}</span><small>Guided · ${t.qs.filter(q => q.guided).length} questions${t.ritual ? ' · can repeat' : ''}</small></button>`).join('')}</div></section>` : ''; }).join('')}
      <p class="tl-fine">${connected() ? 'Docs are saved in the project\'s Files.' : 'No tribe yet: docs are saved on this device (Files) and move into a project with one tap.'}</p></div>`;
  }

  // ---------- filling ----------
  const guidedQs = () => s.t.qs.filter(q => q.guided);
  const field = (q, auto) => q.long ? `<textarea class="input dt-in" data-q="${esc(q.key)}" rows="${auto ? 4 : 3}" placeholder="${esc(q.hint || '')}">${esc(s.v[q.key] || '')}</textarea>`
    : `<input class="input dt-in" data-q="${esc(q.key)}" maxlength="300" placeholder="${esc(q.hint || '')}" value="${esc(s.v[q.key] || '')}">`;
  function headHtml() {
    const gq = guidedQs(), done = s.step >= gq.length;
    const eb = s.adv ? `Advanced · all ${s.t.qs.length} questions` : done ? 'Guided · ready' : `Guided · ${s.step + 1} of ${gq.length}`;
    return `<header class="dt-head"><button class="btn ghost sm" id="dt-libback">‹ Templates</button>
      <div class="dt-title"><span class="eyebrow" id="dt-eyebrow">${esc(eb)}</span><h3>${esc(s.t.title)}</h3></div>
      <button type="button" class="toggle dt-adv" id="dt-adv" role="switch" aria-checked="${s.adv}">Advanced<small>Every question at once</small><span class="switch"></span></button></header>`;
  }
  function guidedHtml() {
    const gq = guidedQs();
    if (s.step >= gq.length) return finishHtml();
    const q = gq[s.step];
    return `<section class="card dt-q" id="dt-q" data-key="${esc(q.key)}"><div class="dt-dots" aria-hidden="true">${gq.map((_, i) => `<i class="${i < s.step ? 'done' : i === s.step ? 'now' : ''}"></i>`).join('')}</div>
      <label class="dt-ask" for="dt-in-${esc(q.key)}">${esc(q.q)}</label>${field(q, true).replace('class="input dt-in"', `id="dt-in-${esc(q.key)}" class="input dt-in"`)}
      <div class="dt-acts"><button class="btn ghost sm" id="dt-back" ${s.step ? '' : 'disabled'}>Back</button><span class="dt-sp"></span><button class="btn ghost sm" id="dt-skip">Skip</button><button class="btn primary sm" id="dt-next">${s.step === gq.length - 1 ? 'Finish' : 'Next'}</button></div></section>`;
  }
  function boostHtml() {
    return `<div class="dt-boost"><button class="btn tonal sm" id="dt-boost" ${s.boosting ? 'disabled' : ''}><span class="ab-spark" aria-hidden="true">✦</span> Draft the rest</button><span class="wl-via" id="dt-via">${s.via ? esc(s.via) : ''}</span></div>`;
  }
  function ritualHtml() {
    if (!s.t.ritual) return '';
    const label = s.t.ritual === 'standup' ? 'Run standup every weekday at 9' : s.t.ritual === 'retro' ? 'Run a retro every Friday at 4' : 'Run a weekly review every Monday at 10';
    return `<section class="dt-ritual" id="dt-ritual"><span class="eyebrow">Make it a ritual</span>
      ${connected() ? `<p class="tl-fine">A calendar event that asks everyone in chat and writes the doc for you.</p><div class="dt-acts"><button class="btn tonal sm" id="dt-rit-go">${esc(label)}</button><button class="btn ghost sm" id="dt-rit-now">Ask everyone now</button></div>`
        : '<p class="tl-fine">Rituals ask your team in chat, so they start once you have a tribe.</p>'}</section>`;
  }
  function finishHtml() {
    const body = L().render(s.t, s.v, { date: today() });
    return `<section class="card dt-done" id="dt-done"><div class="dt-done-h"><span class="eyebrow">Your doc</span>${boostHtml()}</div>
      <article class="dt-preview reading" id="dt-preview">${md(body)}</article>
      <div class="dt-acts"><button class="btn ghost sm" id="dt-deeper">Go deeper: all questions</button><span class="dt-sp"></span><button class="btn primary" id="dt-save">${connected() ? 'Save to Files' : 'Save on this device'}</button></div>
      <div id="dt-saved">${savedHtml()}</div></section>${ritualHtml()}`;
  }
  const savedHtml = () => s.saved ? `<p class="dt-ok">Saved: <b>${esc(s.saved.title)}</b> ${s.saved.local ? '(on this device)' : '(in Files)'} <button class="btn ghost sm" id="dt-open">Open it</button></p>` : '';
  function advHtml() {
    return `<div class="dt-adv-grid"><form class="dt-form" id="dt-form" autocomplete="off">${s.t.qs.map(q => `<label class="tl-lbl dt-f${q.guided ? ' g' : ''}">${esc(q.q)}${q.meta ? ' <small class="faint">top line</small>' : ''}${field(q)}</label>`).join('')}</form>
      <aside class="dt-side"><div class="dt-done-h"><span class="eyebrow">Preview</span>${boostHtml()}</div><article class="dt-preview reading" id="dt-preview">${md(L().render(s.t, s.v, { date: today() }))}</article>
      <div class="dt-acts"><span class="dt-sp"></span><button class="btn primary" id="dt-save">${connected() ? 'Save to Files' : 'Save on this device'}</button></div><div id="dt-saved">${savedHtml()}</div>${ritualHtml()}</aside></div>`;
  }
  function draw() {
    if (!L()) { root.textContent = 'Loading…'; return; }
    root.innerHTML = s.view === 'lib' || !s.t ? libHtml() : `<div class="dt-fill" data-tpl-open="${esc(s.t.id)}" data-mode="${s.adv ? 'advanced' : 'guided'}">${headHtml()}${s.adv ? advHtml() : guidedHtml()}</div>`;
    const f = root.querySelector('#dt-q .dt-in'); if (f && !matchMedia('(max-width: 820px)').matches) f.focus({ preventScroll: true });
  }
  const swap = fn => (window.TribeMotion && window.TribeMotion.swap ? window.TribeMotion.swap(fn) : fn());
  const preview = () => { const p = root.querySelector('#dt-preview'); if (p) p.innerHTML = md(L().render(s.t, s.v, { date: today() })); };
  const grab = () => root.querySelectorAll('.dt-in').forEach(i => { s.v[i.dataset.q] = i.value; });

  async function open(id) {
    const t = L() && L().byId(id); if (!t) return false;
    if (t.premium && window.TribePremium && !(await window.TribePremium.gate('template', { id: t.id, title: t.title }))) return false;
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch {}
    s = { ...s, view: 'fill', t, v: saved.id === id ? saved.v || {} : {}, step: saved.id === id ? saved.step || 0 : 0, adv: saved.id === id ? !!saved.adv : false, via: '', saved: null };
    swap(draw); return true;
  }
  function close() { grab(); s.view = 'lib'; s.t = null; persist(); swap(draw); }

  // ---------- boost: basic first, then the AI ----------
  async function context() {
    const st = state(), pid = connected() && C().project ? C().project() : '';
    let tasks = []; if (connected()) { try { tasks = (await C().api('/tasks')).tasks || []; } catch {} }
    return { tasks, members: st.members || [], me: st.me || {}, project: ((st.projects || []).find(p => p.id === pid) || {}).name || '' };
  }
  async function boost() {
    grab(); s.boosting = true;
    const ctx = await context(), r = L().basicFill(s.t, s.v, ctx);
    s.v = r.values; s.via = 'Basic · no AI'; draw();
    const left = L().empty(s.t, s.v);
    try {
      const on = window.TribeAIBasics && window.TribeAIBasics.online ? await window.TribeAIBasics.online() : { online: false };
      if (on.online && (left.length || r.filled.length)) {
        const want = [...left, ...s.t.qs.filter(q => r.filled.includes(q.key))].filter(q => !q.meta);
        const input = { document: s.t.title, answers: Object.fromEntries(s.t.qs.filter(q => String(s.v[q.key] || '').trim() && !r.filled.includes(q.key)).map(q => [q.h, s.v[q.key]])),
          emptySections: want.map(q => `${q.h}: ${q.q}`), project: ctx.project, openTasks: ctx.tasks.filter(x => x.status !== 'done').slice(0, 15).map(x => x.title), doneTasks: ctx.tasks.filter(x => x.status === 'done').slice(0, 10).map(x => x.title), people: ctx.members.filter(m => m.role !== 'agent').map(m => m.name) };
        const a = await C().api('/ai/refine', { method: 'POST', body: { kind: 'doc.template', input, draft: want.map(q => `## ${q.h}\n${s.v[q.key] || ''}`).join('\n\n') } });
        const got = L().parseSections(s.t, a.text);
        let n = 0; for (const q of want) if (got[q.key]) { s.v[q.key] = got[q.key]; n++; }
        if (n) s.via = `✦ via ${a.via || 'AI'}`;
      }
    } catch {}
    s.boosting = false; persist(); draw();
  }

  // ---------- save ----------
  async function save() {
    grab();
    const title = `${s.t.title} · ${today()}`, body = L().render(s.t, s.v, { date: today() });
    try {
      if (connected()) { const d = (await C().api('/docs', { method: 'POST', body: { title, body, source: `template:${s.t.id}` } })).doc; s.saved = { title: d.title, slug: d.slug }; }
      else if (window.TribeLocalFiles) { const it = await window.TribeLocalFiles.create('doc', { title, body }); s.saved = { title: it.title, id: it.id, local: true }; }
      else throw new Error('Nowhere to save yet');
      toast(s.saved.local ? 'Saved on this device' : 'Saved to Files');
      try { localStorage.removeItem(LS); } catch {}
      const box = root.querySelector('#dt-saved'); if (box) box.innerHTML = savedHtml();
    } catch (e) { toast(e.message); }
  }
  function openSaved() {
    const x = s.saved; if (!x) return;
    if (x.local) return window.TribeLocalFiles && window.TribeLocalFiles.open(x.id);
    if (window.TribeShell) window.TribeShell.go('docs');
    setTimeout(() => window.TribeDocs && window.TribeDocs.open(x.slug), 120);
  }
  function nextAt(kind) {   // the next weekday 9:00 (standup), Friday 16:00 (retro), Monday 10:00 (weekly review), local time
    const d = new Date(), [day, h] = kind === 'standup' ? [null, 9] : kind === 'retro' ? [5, 16] : [1, 10];
    d.setHours(h, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1);
    while (day == null ? (d.getDay() === 0 || d.getDay() === 6) : d.getDay() !== day) d.setDate(d.getDate() + 1);
    return d;
  }
  async function ritual(now) {
    try {
      if (now) { await C().api('/rituals/run', { method: 'POST', body: { kind: s.t.ritual } }); toast('Asked everyone in chat'); return; }
      const at = nextAt(s.t.ritual);
      await C().api('/rituals', { method: 'POST', body: { kind: s.t.ritual, start: at.toISOString(), repeat: s.t.ritual === 'standup' ? 'weekdays' : 'weekly' } });
      toast(`${s.t.title}: first one ${at.toLocaleDateString([], { weekday: 'short' })} ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
      s.rituals = null; loadRituals();
      const b = root.querySelector('#dt-rit-go'); if (b) { b.disabled = true; b.textContent = 'On the calendar ✓'; }
    } catch (e) { toast(e.message); }
  }

  // ---------- events ----------
  root.addEventListener('click', e => {
    const card = e.target.closest('[data-tpl]'); if (card) return open(card.dataset.tpl);
    const b = e.target.closest('button'); if (!b) return;
    const gq = s.t ? guidedQs() : [];
    if (b.id === 'dt-libback') return close();
    if (b.id === 'dt-adv') { grab(); s.adv = !s.adv; if (!s.adv) { const i = gq.findIndex(q => !String(s.v[q.key] || '').trim()); s.step = i < 0 ? gq.length : i; } persist(); return swap(draw); }
    if (b.id === 'dt-next' || b.id === 'dt-skip') { if (b.id === 'dt-skip') { const q = gq[s.step]; if (q) s.v[q.key] = s.v[q.key] || ''; } else grab(); s.step++; persist(); return swap(draw); }
    if (b.id === 'dt-back') { grab(); s.step = Math.max(0, s.step - 1); persist(); return swap(draw); }
    if (b.id === 'dt-deeper') { s.adv = true; persist(); return swap(draw); }
    if (b.id === 'dt-boost') return boost();
    if (b.id === 'dt-save') return save();
    if (b.id === 'dt-open') return openSaved();
    if (b.id === 'dt-rit-go') return ritual(false);
    if (b.id === 'dt-rit-now') return ritual(true);
  });
  root.addEventListener('input', e => { if (e.target.classList.contains('dt-in')) { s.v[e.target.dataset.q] = e.target.value; if (s.adv) preview(); persist(); } });
  root.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.matches('#dt-q input.dt-in')) { e.preventDefault(); const n = root.querySelector('#dt-next'); if (n) n.click(); } });

  // ---------- a ritual started: answer in one small card ----------
  let card = null;
  function ritualCard(run) {
    const me = state().me || {}; if (!me.id || me.role === 'agent' || me.role === 'spectator' || (run.answered || []).includes(me.id)) { if (card && card.dataset.run === run.id && (run.answered || []).includes(me.id)) { card.remove(); card = null; } return; }
    if (card) card.remove();
    card = document.createElement('section'); card.className = 'rt-card'; card.id = 'rt-card'; card.dataset.run = run.id; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', run.title);
    card.innerHTML = `<header><span class="eyebrow">${esc(run.title)} · ${esc(run.day)}</span><button class="fwin-btn" id="rt-x" aria-label="Later">×</button></header>
      <form id="rt-form">${run.questions.map(q => `<label class="tl-lbl">${esc(q.q)}<input class="input" data-rk="${esc(q.key)}" maxlength="600"></label>`).join('')}
      <div class="dt-acts"><button type="button" class="btn ghost sm" id="rt-later">Later</button><span class="dt-sp"></span><button class="btn primary sm" type="submit" id="rt-send">Post my answers</button></div></form>`;
    document.body.appendChild(card);
    const shut = () => { if (card) card.remove(); card = null; };
    card.querySelector('#rt-x').onclick = shut; card.querySelector('#rt-later').onclick = shut;
    card.querySelector('#rt-form').onsubmit = async e => {
      e.preventDefault();
      const answers = {}; card.querySelectorAll('[data-rk]').forEach(i => { if (i.value.trim()) answers[i.dataset.rk] = i.value.trim(); });
      try { const r = await C().api(`/rituals/runs/${encodeURIComponent(run.id)}/answer`, { method: 'POST', body: { answers } }); shut(); toast(`Posted. It's in ${r.doc ? r.doc.title : 'the doc'}.`); } catch (er) { toast(er.message); }
    };
  }
  if (C() && C().on) C().on('ws', m => { if (m && m.type === 'ritual' && m.run) ritualCard(m.run); });

  window.TribeTemplates = { mount, open, close, ritualCard, get lib() { return L(); }, get state() { return s; } };
})();
