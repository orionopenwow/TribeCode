// v0.27 company: Offload (server/academy.js + templates/freemodels.json). Some jobs don't need the tribe's agents: pick a
// task, see verified free AI tools for it (limits, privacy notes, the date they were checked), copy a ready prompt that
// carries the project's name and gist (never keys or secrets), open the site, then "Bring the result in": a paste box or
// a dropped .txt/.md file saved to Files or Captures, tagged source "offload:<provider>". Lives in Academy › Offload and
// opens from Flint ("do this for free"). window.TribeOffload = { mount(el, { task }), prompt(taskId, input) }
(function () {
  'use strict';
  const C = () => window.TribeClient, A = () => window.TribeApp;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => A() && A().toast && A().toast(t);
  const api = (p, o) => C().api(p, o);
  const me = () => (C() && C().state && C().state().me) || {};
  const canWrite = () => me().role && !['spectator', 'guest', 'agent'].includes(me().role);
  // never let anything key-shaped into a prompt that leaves the tribe
  const SECRET = /(sk-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|xox[abpr]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+|-----BEGIN[^-]*-----)/g;
  let data = null, st = { task: null, provider: null, input: '', target: null }, host = null;

  // a project on this device answers without the lists: say so instead of throwing on data.tasks (audit 2026-11-13)
  async function load() { if (!data) { const d = await api('/academy/offload'); if (!d || !Array.isArray(d.tasks) || !Array.isArray(d.providers)) throw new Error('Offload opens once the tribe is online (the pill at the top), or in a tribe.'); data = d; } return data; }
  function prompt(taskId, input) {
    const t = data && data.tasks.find(x => x.id === taskId); if (!t) return '';
    const ctx = data.context || {}, gist = ctx.gist ? `In short: ${ctx.gist}` : '';
    const inp = String(input || '').replace(SECRET, '[removed]').trim() || '[describe what you need]';
    return t.prompt.replace(/\{\{project\}\}/g, ctx.project || 'our project').replace(/\{\{gist\}\}/g, gist).replace(/\{\{input\}\}/g, inp).replace(/ \n/g, '\n').replace(SECRET, '[removed]');
  }
  async function mount(el, { task } = {}) {
    host = el; el.innerHTML = '<p class="ac-empty">Loading…</p>';
    try { await load(); } catch (e) { el.innerHTML = `<p class="ac-empty">${esc(e.message)}</p>`; return; }
    if (task && data.tasks.some(t => t.id === task)) { st.task = task; st.provider = null; st.target = null; }
    draw();
  }
  const pv = id => data.providers.find(p => p.id === id);
  const day = s => new Date(s + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  function draw() {
    const el = host; if (!el) return;
    const t = data.tasks.find(x => x.id === st.task);
    el.innerHTML = `
      <p class="ac-lead of-lead">Some jobs don't need your tribe's agents. Use a free AI tool elsewhere, then bring the result back here so everyone (and every agent) can use it.</p>
      <details class="of-safe"><summary><b>Before you paste anything:</b> never share passwords, keys or customer data with a free tool.</summary><ul>${data.safety.map(s => `<li>${esc(s)}</li>`).join('')}</ul></details>
      <div class="sec-head ac-sh"><span class="eyebrow">1 · Pick the job</span></div>
      <div class="of-tasks" role="radiogroup" aria-label="Task">${data.tasks.map(x => `<button role="radio" aria-checked="${x.id === st.task}" class="of-chip ${x.id === st.task ? 'on' : ''}" data-task="${esc(x.id)}" title="${esc(x.blurb)}">${esc(x.emoji)} ${esc(x.title)}</button>`).join('')}</div>
      ${t ? `
      <div class="sec-head ac-sh"><span class="eyebrow">2 · Choose a free tool</span></div>
      <div class="of-opts">${t.options.map(o => { const p = pv(o.provider); return p ? `
        <div class="ac-card of-opt ${st.provider === p.id ? 'on' : ''}" data-p="${esc(p.id)}">
          <div class="of-opt-h"><b>${esc(p.name)}</b><span class="of-where ${p.where}">${p.where === 'local' ? 'On your computer' : 'Cloud'}</span></div>
          <small class="of-why">${esc(o.why)}</small>
          <small>${esc(p.free)}</small>
          <small class="of-priv">🔒 ${esc(p.privacy)}</small>
          <div class="of-opt-f"><a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" data-open="${esc(p.id)}">Open ${esc(p.name.replace(/\s*\(.*\)$/, ''))} ↗</a><a class="of-src" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">checked ${esc(day(p.checked))}</a></div>
        </div>` : ''; }).join('')}</div>
      <div class="sec-head ac-sh"><span class="eyebrow">3 · Copy the prompt</span></div>
      <section class="card of-prompt-card">
        <label class="lg-field" for="of-input"><span>What do you need? <small>(optional: it goes into the prompt)</small></span>
          <textarea class="input" id="of-input" rows="2" placeholder="${esc(t.id === 'research' ? 'e.g. other apps that take cake orders for small bakeries' : t.id === 'copy' ? 'e.g. the headline and two lines for our landing page' : 'Describe it, or paste the text')}">${esc(st.input)}</textarea></label>
        <textarea class="input of-prompt" id="of-prompt" rows="7" readonly aria-label="Prompt to copy">${esc(prompt(t.id, st.input))}</textarea>
        <div class="ac-row"><button class="btn primary" id="of-copy">Copy prompt</button><span class="ac-meta">Includes the project's name and a short gist. No keys or private notes.</span></div>
      </section>
      <div class="sec-head ac-sh"><span class="eyebrow">4 · Bring the result in</span></div>
      <section class="card of-bring" id="of-bring">
        <p class="ac-lead">${esc(t.bringHint)}</p>
        ${t.bring === 'inspo' ? '<div class="ac-row"><button class="btn" id="of-inspo">Open the inspiration board</button></div>' : ''}
        <textarea class="input of-drop" id="of-text" rows="6" placeholder="Paste the answer here, or drop a .txt or .md file"></textarea>
        <div class="of-bring-row">
          <input class="input" id="of-title" placeholder="Title (optional)" maxlength="120">
          <div class="of-seg" role="radiogroup" aria-label="Save to">${[['files', 'Files'], ['captures', 'Captures']].map(([k, l]) => `<button role="radio" data-target="${k}" aria-checked="${(st.target || (t.bring === 'captures' ? 'captures' : 'files')) === k}" class="${(st.target || (t.bring === 'captures' ? 'captures' : 'files')) === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <select class="input" id="of-from" aria-label="Which tool it came from">${t.options.map(o => pv(o.provider)).filter(Boolean).map(p => `<option value="${esc(p.id)}" ${st.provider === p.id ? 'selected' : ''}>${esc(p.name.replace(/\s*\(.*\)$/, ''))}</option>`).join('')}<option value="other">Another tool</option></select>
          <button class="btn primary" id="of-save" ${canWrite() ? '' : 'disabled title="Spectators can read but not add"'}>Bring it in</button>
        </div>
      </section>` : '<p class="ac-empty">Pick a job to see free tools and a ready prompt.</p>'}
      <p class="ac-note">Free options checked ${esc(day(data.checked))} on each provider's own pages. Free tiers change often: follow "checked" to see the source.</p>`;
    el.querySelectorAll('[data-task]').forEach(b => b.onclick = () => { st.task = b.dataset.task; st.provider = null; st.target = null; draw(); });
    if (!t) return;
    el.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', () => { st.provider = a.dataset.open; el.querySelectorAll('.of-opt').forEach(c => c.classList.toggle('on', c.dataset.p === st.provider)); const s = el.querySelector('#of-from'); if (s) s.value = st.provider; }));
    el.querySelectorAll('.of-opt').forEach(c => c.addEventListener('click', e => { if (e.target.closest('a')) return; st.provider = c.dataset.p; el.querySelectorAll('.of-opt').forEach(x => x.classList.toggle('on', x === c)); const s = el.querySelector('#of-from'); if (s) s.value = st.provider; }));
    const inp = el.querySelector('#of-input'), pr = el.querySelector('#of-prompt');
    inp.addEventListener('input', () => { st.input = inp.value; pr.value = prompt(t.id, st.input); });
    el.querySelector('#of-copy').onclick = async () => { try { await navigator.clipboard.writeText(pr.value); toast('Prompt copied. Paste it into the tool you opened.'); } catch { pr.focus(); pr.select(); toast('Select all and copy the prompt.'); } };
    const ib = el.querySelector('#of-inspo'); if (ib) ib.onclick = () => { if (window.TribeShell && window.TribeShell.go) window.TribeShell.go('home'); setTimeout(() => { const b = document.querySelector('#pj-board'); if (b) b.scrollIntoView({ block: 'center' }); }, 300); };
    el.querySelectorAll('[data-target]').forEach(b => b.onclick = () => { st.target = b.dataset.target; el.querySelectorAll('[data-target]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); });
    const ta = el.querySelector('#of-text');
    ta.addEventListener('dragover', e => { e.preventDefault(); ta.classList.add('drag'); });
    ta.addEventListener('dragleave', () => ta.classList.remove('drag'));
    ta.addEventListener('drop', async e => { e.preventDefault(); ta.classList.remove('drag'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; if (!/\.(txt|md|markdown|csv)$/i.test(f.name) && !/^text\//.test(f.type)) return toast('Drop a .txt, .md or .csv file'); if (f.size > 400 * 1024) return toast('That file is too big (400 KB max)'); ta.value = await f.text(); const ti = el.querySelector('#of-title'); if (ti && !ti.value) ti.value = f.name.replace(/\.[^.]+$/, '').slice(0, 120); });
    el.querySelector('#of-save').onclick = async () => {
      const text = ta.value.trim(); if (!text) { toast('Paste the result first'); ta.focus(); return; }
      const target = st.target || (t.bring === 'captures' ? 'captures' : 'files'), b = el.querySelector('#of-save'); b.disabled = true;
      try {
        const r = await api('/academy/offload/bring', { method: 'POST', body: { target, provider: el.querySelector('#of-from').value, task: t.id, title: el.querySelector('#of-title').value, text } });
        ta.value = ''; el.querySelector('#of-title').value = '';
        const box = el.querySelector('#of-bring'), note = document.createElement('div'); note.className = 'of-ok'; note.id = 'of-ok';
        note.innerHTML = r.doc ? `Saved to Files: <b>${esc(r.doc.title)}</b> <button class="btn sm" id="of-open">Open</button>` : `Saved to Captures: <b>${esc(r.capture.title)}</b> <button class="btn sm" id="of-open">Open</button>`;
        box.appendChild(note);
        note.querySelector('#of-open').onclick = () => { if (r.doc) { A().show('docs'); setTimeout(() => window.TribeDocs && window.TribeDocs.open(r.doc.slug), 80); } else if (window.TribeCaptures) window.TribeCaptures.open(r.capture.id); };
        toast(r.doc ? 'Brought into Files' : 'Brought into Captures');
      } catch (e) { toast(e.message); }
      b.disabled = false;
    };
  }
  window.TribeOffload = { mount, prompt: (t, i) => prompt(t, i) };
})();
