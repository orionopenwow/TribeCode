// v0.27 company: Legal documents (server/legal.js). Template cards -> a progressive form (required fields first, the
// rest under "More options") -> a live preview -> Create doc (a doc in Files with the "not legal advice" banner, a
// decision-log entry in Company mode, and optionally an approval "Send for signature"). Lives in Academy › Legal and
// opens from the Company seat sheet for the legal seat. window.TribeLegal = { mount(el, { template }), open(template) }
(function () {
  'use strict';
  const C = () => window.TribeClient, A = () => window.TribeApp;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => A() && A().toast && A().toast(t);
  const api = (p, o) => C().api(p, o);
  const pid = () => (C() && C().project && C().project()) || '';
  const me = () => (C() && C().state && C().state().me) || {};
  const canDraft = () => me().role && !['spectator', 'guest'].includes(me().role);
  const JUR = { US: 'the United States', UK: 'the United Kingdom', EU: 'the European Union', CA: 'Canada', AU: 'Australia', Other: 'other places' };
  const TITLE_KEYS = ['party_b', 'contractor', 'client', 'assignor', 'volunteer', 'app_name', 'site', 'project', 'company'];
  let list = null, banner = '', cur = null, vals = {}, host = null, timer = 0;

  // the same fill rules as server/legal.js (the server's copy is the one that is saved)
  const clean = (v, long) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/^[ \t]*(#+|>+|-{3,})[ \t]*/gm, '').trim().slice(0, long ? 4000 : 300);
  function values(t) { const v = {}; for (const f of t.fields) { const x = clean(vals[f.key], f.type === 'textarea'); v[f.key] = x || (f.default != null ? String(f.default) : ''); } return v; }
  const included = (cl, v) => { if (!cl.when) return true; const w = cl.when; if (w[0] === '!') return !v[w.slice(1)]; const [k, eq] = w.split('='); return eq === undefined ? !!v[k] : v[k] === eq; };
  const fill = (text, t, v) => String(text).replace(/\{\{#([a-z_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, inner) => (v[k] ? inner : '')).replace(/\{\{([a-z_]+)\}\}/g, (_, k) => (v[k] ? v[k] : `[${(t.fields.find(f => f.key === k) || {}).label || k}]`));
  function render(t) {
    const v = values(t), jur = v.jurisdiction && t.jurisdiction && t.jurisdiction[v.jurisdiction] ? v.jurisdiction : null, out = [];
    let n = 0; for (const cl of t.clauses) { if (!included(cl, v)) continue; n++; out.push(`## ${n}. ${cl.heading}`, '', fill(cl.text, t, v), ''); if (cl.note) out.push(`> *What this means:* ${cl.note}`, ''); }
    if (jur) out.push('---', '', `## Notes for ${JUR[jur]}`, '', t.jurisdiction[jur], '');
    const who = TITLE_KEYS.map(k => v[k]).find(Boolean);
    return { md: out.join('\n'), title: `${t.title}${who ? ' · ' + who.split('\n')[0].slice(0, 60) : ''}`, missing: t.fields.filter(f => f.required && !v[f.key]) };
  }

  async function mount(el, { template } = {}) {
    host = el; cur = null;
    if (!list) { try { const r = await api('/legal'); list = r.templates; banner = r.banner; } catch (e) { el.innerHTML = `<p class="ac-empty">${esc(e.message)}</p>`; return; } }
    if (template && list.some(t => t.id === template)) return pick(template);
    cards();
  }
  const bannerHtml = () => `<div class="lg-banner" role="note"><b>Starting point, not legal advice.</b> These templates are plain-English drafts. Laws differ by place: have a lawyer in your jurisdiction review anything before it's signed.</div>`;

  async function cards() {
    const el = host; if (!el) return;
    const cats = [...new Set(list.map(t => t.category))];
    el.innerHTML = `${bannerHtml()}
      ${cats.map(c => `<div class="sec-head ac-sh"><span class="eyebrow">${esc(c)}</span></div>
        <div class="lg-grid">${list.filter(t => t.category === c).map(t => `<button class="ac-card lg-card" data-t="${esc(t.id)}"><span class="ac-emo" aria-hidden="true">${esc(t.emoji)}</span><b>${esc(t.title)}</b><small>${esc(t.blurb)}</small><span class="ac-meta">${t.required} to fill in${t.fields > t.required ? ` · ${t.fields - t.required} optional` : ''}</span></button>`).join('')}</div>`).join('')}
      <div id="lg-drafts"></div>`;
    el.querySelectorAll('.lg-card').forEach(b => b.onclick = () => pick(b.dataset.t));
    try {
      const r = await api(`/projects/${encodeURIComponent(pid())}/legal`); const d = (r.drafts || []).slice(0, 5);
      const box = el.querySelector('#lg-drafts'); if (!box || !d.length) return;
      box.innerHTML = `<div class="sec-head ac-sh"><span class="eyebrow">Recent drafts</span></div><div class="lg-drafts">${d.map(x => `<button class="lg-draft" data-doc="${esc(x.doc)}"><b>${esc(x.title)}</b><small>${esc(x.byName || '')} · ${esc(new Date(x.at).toLocaleDateString([], { month: 'short', day: 'numeric' }))}</small><span class="lg-st ${/ready/.test(x.status) ? 'ok' : /not/.test(x.status) ? 'no' : ''}">${esc(x.status)}</span></button>`).join('')}</div>`;
      box.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => openDoc(b.dataset.doc));
    } catch {}
  }
  function openDoc(slug) { if (A() && A().show) A().show('docs'); setTimeout(() => window.TribeDocs && window.TribeDocs.open(slug), 80); }

  async function pick(id) {
    try { cur = (await api('/legal/' + encodeURIComponent(id))).template; } catch (e) { toast(e.message); return; }
    vals = {}; for (const f of cur.fields) if (f.default != null && f.type === 'select') vals[f.key] = f.default;
    if (cur.fields.some(f => f.key === 'effective_date')) vals.effective_date = new Date().toISOString().slice(0, 10);
    form();
  }
  const field = f => {
    const id = 'lg-f-' + f.key, v = vals[f.key] != null ? vals[f.key] : '';
    const ph = f.placeholder || (f.default && f.type !== 'select' ? f.default : '');
    const input = f.type === 'textarea' ? `<textarea class="input lg-in" id="${id}" data-k="${esc(f.key)}" rows="3" placeholder="${esc(ph)}">${esc(v)}</textarea>`
      : f.type === 'select' ? `<select class="input lg-in" id="${id}" data-k="${esc(f.key)}">${(f.options || []).map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(f.key === 'jurisdiction' ? (JUR[o] ? `${o} · ${JUR[o].replace(/^the /, '')}` : o) : o)}</option>`).join('')}</select>`
      : `<input class="input lg-in" id="${id}" data-k="${esc(f.key)}" type="${f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}" value="${esc(v)}" placeholder="${esc(ph)}" ${f.type === 'number' ? 'min="0"' : ''}>`;
    return `<label class="lg-field" for="${id}"><span>${esc(f.label)}${f.required ? ' <i aria-hidden="true">*</i>' : ''}</span>${input}${f.help ? `<small>${esc(f.help)}</small>` : ''}</label>`;
  };
  function form() {
    const el = host, t = cur; if (!el || !t) return;
    const reqd = t.fields.filter(f => f.required), opt = t.fields.filter(f => !f.required);
    el.innerHTML = `<button class="btn ghost ac-back" id="lg-back">← All templates</button>
      <div class="lg-split">
        <form class="card lg-form" id="lg-form" autocomplete="off">
          <span class="eyebrow">${esc(t.emoji)} ${esc(t.category)}</span><h3>${esc(t.title)}</h3><p class="ac-lead">${esc(t.blurb)}</p>
          ${reqd.map(field).join('')}
          ${opt.length ? `<details class="lg-more"><summary>More options <small>${opt.length}</small></summary>${opt.map(field).join('')}</details>` : ''}
          <label class="lg-check"><input type="checkbox" id="lg-sign"><span>Ask the tribe to approve sending it for signature <small>(no e-signing: it just marks it ready)</small></span></label>
          <div class="ac-row"><button class="btn primary" id="lg-create" type="submit" ${canDraft() ? '' : 'disabled title="Spectators can read but not draft"'}>Create doc</button><span class="ac-meta" id="lg-miss"></span></div>
          ${t.credit ? `<p class="ac-note">${esc(t.credit)}</p>` : ''}
        </form>
        <section class="lg-prev-wrap" aria-label="Preview">
          <details class="lg-prev-fold" ${matchMedia('(max-width: 820px)').matches ? '' : 'open'}><summary><span class="eyebrow">Live preview</span></summary>
          <div class="lg-prev card">${bannerHtml()}<div class="lg-prev-t" id="lg-title"></div><div class="lg-md" id="lg-md"></div></div></details>
        </section>
      </div>`;
    el.querySelector('#lg-back').onclick = () => { cur = null; cards(); };
    el.querySelectorAll('.lg-in').forEach(i => i.addEventListener('input', () => { vals[i.dataset.k] = i.value; clearTimeout(timer); timer = setTimeout(preview, 120); }));
    el.querySelector('#lg-form').onsubmit = e => { e.preventDefault(); create(); };
    preview();
  }
  function preview() {
    if (!cur || !host) return; const r = render(cur), md = host.querySelector('#lg-md'); if (!md) return;
    md.innerHTML = window.TribeMD ? window.TribeMD.render(r.md) : `<pre>${esc(r.md)}</pre>`;
    host.querySelector('#lg-title').textContent = r.title;
    host.querySelector('#lg-miss').textContent = r.missing.length ? `Still needed: ${r.missing.map(f => f.label).join(', ')}` : 'Ready to create';
  }
  async function create() {
    const r = render(cur); if (r.missing.length) { toast(`Fill in: ${r.missing.map(f => f.label).join(', ')}`); const f = host.querySelector(`#lg-f-${r.missing[0].key}`); if (f) f.focus(); return; }
    const b = host.querySelector('#lg-create'); b.disabled = true; b.textContent = 'Creating…';
    try {
      const out = await api(`/projects/${encodeURIComponent(pid())}/legal/draft`, { method: 'POST', body: { template: cur.id, fields: vals, signature: host.querySelector('#lg-sign').checked } });
      host.innerHTML = `${bannerHtml()}<section class="card ac-hero lg-done" id="lg-done"><div class="ac-hero-b"><span class="eyebrow">Saved to Files</span><h3>${esc(out.doc.title)}</h3>
        <p class="ac-lead">${out.draft.approval ? 'An approval to send it for signature is waiting in Requests. ' : ''}${out.decision ? `Logged in the company's decisions: “${esc(out.decision)}”. ` : ''}Read it through, replace anything in [square brackets], and have a lawyer review it.</p>
        <div class="ac-row"><button class="btn primary" id="lg-open">Open the doc</button><button class="btn ghost" id="lg-another">Draft another</button></div></div></section>`;
      host.querySelector('#lg-open').onclick = () => openDoc(out.doc.slug);
      host.querySelector('#lg-another').onclick = () => { cur = null; cards(); };
      toast('Draft saved to Files');
    } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Create doc'; }
  }

  window.TribeLegal = { mount, open: template => window.TribeAcademy && window.TribeAcademy.open({ tab: 'legal', template }), render: t => render(t) };
})();
