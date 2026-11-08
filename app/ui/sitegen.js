// Website › Design it for me: the site generator's panel inside the Website builder (website.js mounts it in #wb-gen).
// Six editorial layouts, Shuffle layout, Regenerate copy, Write it for me (the tribe's brain, or your in-browser
// model), per-section edit, Publish (host or project lead) and Export (one self-contained HTML file).
// Server: server/showcase.js + server/sitegen.js (/api/projects/:id/website/gen | write | publish | draft | export).
//   window.TribeSiteGen = { draw(box, website, { api, toast, set }) }
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const FIELDS = { hero: [['kicker', 'Small line above', 80], ['title', 'Headline', 80], ['dek', 'One-line pitch', 220, 'area'], ['cta', 'Button label', 30]], story: [['title', 'Title', 60], ['body', 'Story', 1600, 'area']],
    features: [['title', 'Title', 60]], gallery: [['title', 'Title', 60]], play: [['title', 'Title', 60], ['body', 'Line under it', 220]], devlog: [['title', 'Title', 60]], roadmap: [['title', 'Title', 60]],
    team: [['title', 'Title', 60], ['body', 'Line under it', 300]], faq: [['title', 'Title', 60]], footer: [['text', 'Footer line', 160]] };
  const ITEMS = { features: [['title', 'Feature'], ['body', 'One line about it']], faq: [['q', 'Question'], ['a', 'Answer']] };
  let editing = null, busy = false;

  function draw(box, w, ctx) {
    const G = w.gen; if (!G) { box.innerHTML = ''; return; }
    const d = G.draft, can = G.canDraft;
    if (!d) {
      box.innerHTML = `<div class="sec-head"><span class="eyebrow">Design</span><h2>Design it for me</h2></div>
        <p class="wb-note sg-intro">Pick-up-and-go layouts with real type and a calm palette, filled from your bio, vision, screenshots, commits and team. Nothing goes live until you publish.</p>
        ${can ? '<div class="wb-acts"><button class="btn primary" id="sg-make">Design it for me</button></div>' : '<p class="wb-note">Spectators can look but not draft.</p>'}`;
      const mk = box.querySelector('#sg-make'); if (mk) mk.onclick = () => run(mk, () => ctx.api('/gen', { method: 'POST', body: {} }), ctx, 'Here is a first draft');
      return;
    }
    const L = G.layouts.find(x => x.id === d.layout) || G.layouts[0];
    const status = G.unpublished ? `Draft · ${esc(L.name)} · not published yet` : `Published${G.live && G.live.at ? ` ${esc(ago(G.live.at))}` : ''}${G.live && G.live.byName ? ` by ${esc(G.live.byName)}` : ''} · ${esc(L.name)}`;
    const pol = d.polished ? ` · polished by ${esc(d.polished.via)}` : '';
    const exportUrl = G.draftUrl ? G.draftUrl.replace('/website/draft?', '/website/export?') : '';
    box.innerHTML = `<div class="sec-head"><span class="eyebrow">Design</span><h2>Design it for me</h2></div>
      <p class="sg-status" id="sg-status"><span class="sg-dot ${G.unpublished ? 'draft' : 'live'}" aria-hidden="true"></span>${status}${pol}</p>
      <div class="sg-layouts" role="radiogroup" aria-label="Layout">${G.layouts.map(x => `<button class="sg-lay ${x.id === d.layout ? 'on' : ''}" role="radio" aria-checked="${x.id === d.layout}" data-lay="${esc(x.id)}" ${can ? '' : 'disabled'}><b>${esc(x.name)}</b><small>${esc(x.note)}</small></button>`).join('')}</div>
      ${can ? `<div class="sg-acts"><button class="btn" id="sg-shuffle">Shuffle layout</button><button class="btn" id="sg-regen">Regenerate copy</button><button class="btn" id="sg-write" title="${G.brain ? 'Uses the tribe\'s brain' : 'Needs a brain: Settings › Flint\'s brain'}">Write it for me</button></div>` : ''}
      <span class="wb-lbl">Sections</span>
      <div class="sg-secs" id="sg-secs">${G.sections.map(s => secRow(s, d, can)).join('')}</div>
      <div class="sg-pub">${G.canPublish ? `<button class="btn primary" id="sg-publish" ${G.unpublished ? '' : 'disabled'}>${G.live ? 'Publish changes' : 'Publish'}</button>` : '<span class="wb-note">The host or the project lead publishes it.</span>'}
        ${exportUrl ? `<a class="linkish" id="sg-export" href="${esc(exportUrl)}" download>Export as HTML</a>` : ''}${G.canPublish && G.live ? '<button class="linkish" id="sg-classic">Use the simple page</button>' : ''}</div>`;
    const q = s => box.querySelector(s);
    box.querySelectorAll('[data-lay]').forEach(b => b.onclick = () => b.dataset.lay !== d.layout && run(b, () => ctx.api('/gen', { method: 'PUT', body: { layout: b.dataset.lay } }), ctx));
    if (q('#sg-shuffle')) q('#sg-shuffle').onclick = e => run(e.currentTarget, () => ctx.api('/gen', { method: 'POST', body: { how: 'shuffle' } }), ctx, null, r => ctx.toast(`Now: ${(r.website.gen.layouts.find(x => x.id === r.website.gen.draft.layout) || {}).name} layout`));
    if (q('#sg-regen')) q('#sg-regen').onclick = e => run(e.currentTarget, () => ctx.api('/gen', { method: 'POST', body: { how: 'regenerate' } }), ctx, Object.keys(d.edited || {}).length ? 'Fresh copy. Your hand edits stay.' : 'Fresh copy');
    if (q('#sg-write')) q('#sg-write').onclick = e => write(e.currentTarget, w, ctx);
    if (q('#sg-publish')) q('#sg-publish').onclick = e => run(e.currentTarget, () => ctx.api('/publish', { method: 'POST' }), ctx, 'Published: the website is live');
    if (q('#sg-classic')) q('#sg-classic').onclick = e => run(e.currentTarget, () => ctx.api('/classic', { method: 'POST' }), ctx, 'Back to the simple page');
    box.querySelectorAll('[data-sgsec]').forEach(i => i.onchange = () => run(i, () => ctx.api('/gen', { method: 'PUT', body: { off: { [i.dataset.sgsec]: !i.checked } } }), ctx));
    box.querySelectorAll('[data-sgedit]').forEach(b => b.onclick = () => { editing = editing === b.dataset.sgedit ? null : b.dataset.sgedit; draw(box, w, ctx); const f = box.querySelector('.sg-ed input, .sg-ed textarea'); if (f) f.focus(); });
    const ed = q('.sg-ed');
    if (ed) {
      const k = ed.dataset.sec;
      const add = ed.querySelector('[data-additem]'); if (add) add.onclick = () => { const list = ed.querySelector('.sg-items'); if (list.children.length >= 6) return; list.insertAdjacentHTML('beforeend', itemRow(k, {}, list.children.length)); };
      ed.querySelector('[data-sgsave]').onclick = e => {
        const copy = {}; ed.querySelectorAll('[data-f]').forEach(i => { copy[i.dataset.f] = i.value; });
        if (ITEMS[k]) copy.items = [...ed.querySelectorAll('.sg-item')].map(r => Object.fromEntries([...r.querySelectorAll('[data-if]')].map(i => [i.dataset.if, i.value])));
        run(e.currentTarget, () => ctx.api('/gen', { method: 'PUT', body: { section: k, copy } }), ctx, 'Saved', () => { editing = null; });
      };
      const rs = ed.querySelector('[data-sgreset]'); if (rs) rs.onclick = e => run(e.currentTarget, () => ctx.api('/gen', { method: 'PUT', body: { reset: k } }), ctx, 'Back to the template', () => { editing = null; });
      ed.querySelector('[data-sgcancel]').onclick = () => { editing = null; draw(box, w, ctx); };
    }
  }
  function secRow(s, d, can) {
    const on = !(d.off || {})[s.id], fixed = s.id === 'hero', ed = (d.edited || {})[s.id];
    return `<div class="sg-sec ${editing === s.id ? 'open' : ''}"><label class="sg-on"><input type="checkbox" data-sgsec="${esc(s.id)}" ${on ? 'checked' : ''} ${can && !fixed ? '' : 'disabled'}><span>${esc(s.name)}</span>${ed ? '<em class="sg-tag">edited</em>' : ''}</label>
      ${can && FIELDS[s.id] ? `<button class="linkish sg-edit" data-sgedit="${esc(s.id)}" aria-expanded="${editing === s.id}">${editing === s.id ? 'Close' : 'Edit'}</button>` : ''}</div>
      ${editing === s.id ? editor(s.id, d.copy[s.id] || {}, ed) : ''}`;
  }
  function itemRow(k, x, i) {
    return `<div class="sg-item">${ITEMS[k].map(([f, label]) => `<input class="input" data-if="${f}" value="${esc(x[f] || '')}" placeholder="${esc(label)}" aria-label="${esc(label)} ${i + 1}" maxlength="${f === 'a' ? 320 : f === 'q' ? 120 : f === 'body' ? 180 : 60}">`).join('')}</div>`;
  }
  function editor(k, c, ed) {
    return `<div class="sg-ed" data-sec="${esc(k)}">${FIELDS[k].map(([f, label, max, kind]) => `<label class="wb-field"><span>${esc(label)}</span>${kind === 'area'
      ? `<textarea class="input" data-f="${f}" rows="${f === 'body' ? 6 : 2}" maxlength="${max}">${esc(c[f] || '')}</textarea>` : `<input class="input" data-f="${f}" value="${esc(c[f] || '')}" maxlength="${max}" autocomplete="off">`}</label>`).join('')}
      ${ITEMS[k] ? `<span class="wb-lbl">${k === 'faq' ? 'Questions' : 'Items'}</span><div class="sg-items">${(c.items || []).map((x, i) => itemRow(k, x, i)).join('')}</div><button class="linkish" data-additem>Add one</button>` : ''}
      <div class="sg-ed-acts"><button class="btn primary sm" data-sgsave>Save</button><button class="btn sm" data-sgcancel>Cancel</button>${ed ? '<button class="linkish" data-sgreset>Use the template again</button>' : ''}</div></div>`;
  }
  async function run(btn, call, ctx, okMsg, after) {
    if (busy) return; busy = true; const was = btn.disabled; btn.disabled = true;
    try { const r = await call(); if (after) after(r); ctx.set(r.website); if (okMsg) ctx.toast(okMsg); }
    catch (e) { ctx.toast(e.message); if (btn.type === 'checkbox') btn.checked = !btn.checked; }
    finally { busy = false; btn.disabled = was; }
  }
  // Write it for me: the person's built-in model when they picked it, else the tribe's brain on the host.
  async function write(btn, w, ctx) {
    const B = window.TribeBrain, label = btn.textContent;
    if (busy) return; busy = true; btn.disabled = true; btn.textContent = 'Writing…';
    try {
      let body = {};
      if (B && B.choice && B.choice() === 'browser') {
        const pr = await ctx.api('/gen/prompt');
        const out = await B.askBrowser([{ role: 'system', content: pr.system }, { role: 'user', content: pr.prompt }], () => {});
        body = { reply: out.text || '' };
      } else if (!w.gen.brain) { ctx.toast('Writing needs a brain: pick one in Settings › Flint\'s brain'); if (B && B.open) B.open(); return; }
      const r = await ctx.api('/write', { method: 'POST', body });
      ctx.set(r.website);
      ctx.toast(r.changed.length ? `Polished ${r.changed.length} line${r.changed.length === 1 ? '' : 's'}${r.rejected.length ? ` (kept ${r.rejected.length} that sounded off)` : ''}` : 'The copy already reads well');
    } catch (e) { ctx.toast(e.message); }
    finally { busy = false; btn.disabled = false; btn.textContent = label; }
  }
  window.TribeSiteGen = { draw };
})();
