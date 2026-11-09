// Website › the site builder (website.js mounts it in #wb-gen). Three levels, one draft:
//   ⚡ Instant  one tap: the kind of site is guessed from project sense (or picked), then a layout, copy and palette.
//   🧭 Guided   three steps: 1 Type (+ hours, place, date, contact) · 2 Brand (themes, color, accent, logo, font pair, layout)
//              · 3 Sections (on/off, edit, Shuffle, Regenerate, Write it for me). The live preview sits beside (below on phones).
//   🧑‍💻 Code    the files Publish writes (index.html with section markers, styles.css with brand tokens), how to edit them,
//              and a jump to the Code view. Publish never overwrites hand edits without asking (Keep their edits / Replace).
// The level follows the person's experience mode (app/ui/modes.js, TribeMode.get()): Beginner starts at Instant with few
// buttons, Intermediate at Guided (brand kit + sections), Advanced gets every control and the Code view. A level they pick
// here is remembered on this device, as long as their mode shows it. Controls above a mode carry data-mode-min.
// ✨ Suggest for me asks the tribe's brain (or rules from project sense) for a theme, type, palette, font pair, section order
// and tagline; it shows as a card with Apply / Not now and is never applied by itself.
// Server: server/showcase.js + server/sitegen.js (/api/projects/:id/website/gen | instant | brand | ideas | code | publish | draft | export).
//   window.TribeSiteGen = { draw(box, website, { api, toast, set }) }
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const kb = n => (n >= 1024 ? `${Math.round(n / 102.4) / 10} KB` : `${n} B`);
  const FIELDS = { hero: [['kicker', 'Small line above', 80], ['title', 'Headline', 80], ['dek', 'One-line pitch', 220, 'area'], ['cta', 'Button label', 30]], story: [['title', 'Title', 60], ['body', 'Story', 1600, 'area']],
    features: [['title', 'Title', 60]], gallery: [['title', 'Title', 60]], play: [['title', 'Title', 60], ['body', 'Line under it', 220]], devlog: [['title', 'Title', 60]], roadmap: [['title', 'Title', 60]],
    team: [['title', 'Title', 60], ['body', 'Line under it', 300]], faq: [['title', 'Title', 60]], footer: [['text', 'Footer line', 160]],
    visit: [['title', 'Title', 60], ['body', 'Line under it', 300]], event: [['title', 'Title', 60], ['body', 'Line under it', 300]], contact: [['title', 'Title', 60], ['body', 'Line under it', 300]] };
  const ITEMS = { features: [['title', 'Feature'], ['body', 'One line about it']], faq: [['q', 'Question'], ['a', 'Answer']] };
  // The facts each kind of site asks for (step 1).
  const INFO = { business: [['hours', 'Opening hours (one line per day or range)', 'area'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email']],
    event: [['date', 'Date'], ['time', 'Time'], ['place', 'Place'], ['rsvp', 'RSVP link (https)']], portfolio: [['email', 'Email'], ['link', 'A link (https): your profile or shop']], app: [['email', 'Contact email'], ['link', 'A link (https)']] };
  const LS = 'tribecode.sitegen.mode';
  let editing = null, busy = false, step = 1, code = null, codeFile = 'styles.css', mode = null;
  try { mode = localStorage.getItem(LS); } catch {}
  const setMode = m => { mode = m; try { localStorage.setItem(LS, m); } catch {} };
  const XP = () => (window.TribeMode && window.TribeMode.get ? window.TribeMode.get() : 'advanced');
  const allows = min => (window.TribeMode && window.TribeMode.allows ? window.TribeMode.allows(min) : true);
  const LEVEL_MIN = { instant: '', guided: 'intermediate', code: 'advanced' };
  const DEFAULT_LEVEL = { beginner: 'instant', intermediate: 'guided', advanced: 'guided' };
  let lastBox = null, lastW = null, lastCtx = null;
  document.addEventListener('tribe:mode', () => { if (lastBox && lastBox.isConnected) draw(lastBox, lastW, lastCtx); });

  function draw(box, w, ctx) {
    const G = w.gen; if (!G) { box.innerHTML = ''; return; }
    const d = G.draft, can = G.canDraft;
    lastBox = box; lastW = w; lastCtx = ctx;
    // the level: the one picked here (if this experience mode shows it), else the mode's own default
    if (!mode || !LEVEL_MIN.hasOwnProperty(mode) || !allows(LEVEL_MIN[mode])) mode = DEFAULT_LEVEL[XP()] || 'instant';
    if (mode === 'code' && !d) mode = allows('intermediate') ? 'guided' : 'instant';
    const levels = [['instant', '⚡', 'Instant'], ['guided', '🧭', 'Guided'], ['code', '🧑‍💻', 'Code']].filter(([id]) => allows(LEVEL_MIN[id]));
    const tabs = levels.length < 2 ? '' : `<div class="sg-modes" role="tablist" aria-label="How to build" style="grid-template-columns:repeat(${levels.length},minmax(0,1fr))">${levels.map(([id, ic, label]) =>
      `<button class="sg-mode ${mode === id ? 'on' : ''}" role="tab" aria-selected="${mode === id}" data-sgmode="${id}"${LEVEL_MIN[id] ? ` data-mode-min="${LEVEL_MIN[id]}"` : ''} ${id === 'code' && !d ? 'disabled title="Make a draft first"' : ''}><span aria-hidden="true">${ic}</span>${label}</button>`).join('')}</div>`;
    const L = d ? (G.layouts.find(x => x.id === d.layout) || G.layouts[0]) : null, T = d && d.type ? G.types.find(x => x.id === d.type) : null;
    const status = !d ? '' : G.unpublished ? `Draft · ${T ? `${esc(T.name)} · ` : ''}${esc(L.name)} · not published yet` : `Published${G.live && G.live.at ? ` ${esc(ago(G.live.at))}` : ''}${G.live && G.live.byName ? ` by ${esc(G.live.byName)}` : ''} · ${T ? `${esc(T.name)} · ` : ''}${esc(L.name)}`;
    const pol = d && d.polished ? ` · polished by ${esc(d.polished.via)}` : '';
    const exportUrl = G.draftUrl ? G.draftUrl.replace('/website/draft?', '/website/export?') : '';
    const pane = mode === 'guided' ? guided(G, d, can) : mode === 'code' ? codePane(G) : instant(G, d, can, L);
    box.innerHTML = `<div class="sec-head"><span class="eyebrow">Site builder</span><h2>${d ? 'Your website' : 'Make the website'}</h2></div>
      ${tabs}
      ${d ? `<p class="sg-status" id="sg-status"><span class="sg-dot ${G.unpublished ? 'draft' : 'live'}" aria-hidden="true"></span>${status}${pol}</p>` : ''}
      ${can ? `<div class="sg-suggest"><button class="btn sm" id="sg-ideas" title="${G.brain ? 'Asks the tribe\'s brain' : 'Uses what the project is about (no brain is on)'}">✨ Suggest for me</button></div>` : ''}
      ${G.idea ? ideaCard(G) : ''}
      <div class="sg-pane" data-pane="${mode}">${pane}</div>
      ${d ? `${G.handEdited && G.handEdited.length ? `<div class="sg-hand" id="sg-hand" role="alert"><b>Someone edited the code by hand</b><span>${G.handEdited.map(f => `<code>${esc(f)}</code>`).join(' ')} changed since the last publish.${G.canPublish ? ' Keep their edits (those files are skipped) or replace them with the builder\'s version.' : ''}</span>
        ${G.canPublish ? '<div class="sg-hand-acts"><button class="btn sm primary" id="sg-keep">Keep their edits</button><button class="btn sm" id="sg-replace">Replace</button></div>' : ''}</div>` : ''}
      <div class="sg-pub">${G.canPublish ? `<button class="btn primary" id="sg-publish" ${G.unpublished ? '' : 'disabled'}>${G.live ? 'Publish changes' : 'Publish'}</button>` : '<span class="wb-note">The host or the project lead publishes it.</span>'}
        ${exportUrl ? `<a class="linkish" id="sg-export" href="${esc(exportUrl)}" download data-mode-min="intermediate">Export as one HTML file</a>` : ''}${G.canPublish && G.live ? '<button class="linkish" id="sg-classic" data-mode-min="advanced">Use the simple page</button>' : ''}${G.canPublish && G.live ? '<button class="linkish" id="sg-save-tpl" title="New projects can start from this website">Save as a template</button>' : ''}</div>` : ''}
      <div class="sg-tpls" id="sg-tpls" hidden></div>`;
    wire(box, w, ctx);
  }

  // ---------- ⚡ Instant ----------
  function instant(G, d, can, L) {
    const guess = G.guess ? `<p class="wb-note">Looks like ${/^[aeiou]/i.test(G.guess.name) ? 'an' : 'a'} <b>${esc(G.guess.name.toLowerCase())}</b>. Pick another kind if it is not.</p>` : '';
    const types = `<div class="sg-chips" role="radiogroup" aria-label="Kind of site">${G.types.map(t => `<button class="sg-chip ${(d && d.type === t.id) ? 'on' : ''}" data-sginst="${esc(t.id)}" ${can ? '' : 'disabled'}><span aria-hidden="true">${t.icon}</span>${esc(t.name)}</button>`).join('')}</div>`;
    const themes = `<span class="wb-lbl">Start from a theme (optional)</span><div class="sg-chips">${G.themes.slice(0, 6).map(t => `<button class="sg-chip sg-th-chip" data-sginsttheme="${esc(t.id)}" title="${esc(t.why)}" ${can ? '' : 'disabled'}><i style="background:${esc(t.primary)}" aria-hidden="true"></i>${esc(t.name)}</button>`).join('')}</div>`;
    if (!d) return `<p class="wb-note sg-intro">One tap makes a real page from what the project already has: bio, vision, screenshots, saved changes and team. Nothing goes live until you publish.</p>
      ${guess}${can ? `<div class="wb-acts"><button class="btn primary sg-big" id="sg-make">⚡ Make my site</button></div>${types}${themes}` : '<p class="wb-note">Spectators can look but not draft.</p>'}`;
    return `${can ? `<div class="sg-layouts" role="radiogroup" aria-label="Layout" data-mode-min="intermediate">${G.layouts.map(x => `<button class="sg-lay ${x.id === d.layout ? 'on' : ''}" role="radio" aria-checked="${x.id === d.layout}" data-lay="${esc(x.id)}"><b>${esc(x.name)}</b><small>${esc(x.note)}</small></button>`).join('')}</div>
      <div class="sg-acts"><button class="btn" id="sg-shuffle">Shuffle layout</button><button class="btn" id="sg-regen" data-mode-min="intermediate">Regenerate copy</button><button class="btn" id="sg-write" title="${G.brain ? 'Uses the tribe\'s brain' : 'Needs a brain: Settings › Flint\'s brain'}">Write it for me</button></div>
      <span class="wb-lbl">Make it again as</span>${types}${allows('intermediate') ? '<p class="wb-note">Want more control? <button class="linkish" data-sgmode="guided">Fine-tune it in Guided</button></p>' : ''}` : `<p class="wb-note">Spectators can look but not draft.</p>`}`;
  }

  // ---------- 🧭 Guided ----------
  function guided(G, d, can) {
    const steps = [[1, 'Type'], [2, 'Brand'], [3, 'Sections']];
    const nav = `<ol class="sg-steps">${steps.map(([n, label]) => `<li><button class="sg-step ${step === n ? 'on' : ''}" data-sgstep="${n}" aria-current="${step === n ? 'step' : 'false'}"><span>${n}</span>${label}</button></li>`).join('')}</ol>`;
    let body = '';
    if (step === 1) {
      body = `<p class="wb-note">What kind of site is it? Each kind picks its sections and their order.</p>
        <div class="sg-types">${G.types.map(t => `<button class="sg-type ${d && d.type === t.id ? 'on' : ''}" data-sgtype="${esc(t.id)}" aria-pressed="${!!(d && d.type === t.id)}" ${can ? '' : 'disabled'}><span class="sg-ic" aria-hidden="true">${t.icon}</span><b>${esc(t.name)}</b><small>${esc(t.note)}</small></button>`).join('')}</div>
        ${d && d.type && INFO[d.type] ? `<span class="wb-lbl">The details</span><div class="sg-info">${INFO[d.type].map(([k, label, kind]) => `<label class="wb-field"><span>${esc(label)}</span>${kind === 'area'
          ? `<textarea class="input" data-sginfo="${k}" rows="3" maxlength="300">${esc((d.info || {})[k] || '')}</textarea>` : `<input class="input" data-sginfo="${k}" value="${esc((d.info || {})[k] || '')}" maxlength="300" autocomplete="off">`}</label>`).join('')}
          ${can ? '<div class="sg-ed-acts"><button class="btn sm primary" id="sg-info-save">Save details</button></div>' : ''}</div>` : ''}`;
    } else if (step === 2) {
      const B = G.brand || {}, mg = G.canBrand;
      body = `<span class="wb-lbl">Themes</span><div class="sg-themes">${G.themes.map((t, i) => `<button class="sg-theme ${d && d.theme === t.id ? 'on' : ''}" data-sgtheme="${esc(t.id)}" ${can ? '' : 'disabled'}>
          <span class="sg-sws" aria-hidden="true"><i style="background:${esc(t.primary)}"></i>${t.accent ? `<i style="background:${esc(t.accent)}"></i>` : ''}</span><b>${esc(t.name)}</b><small>${esc(t.fontName)} · ${esc(t.note)}</small>${i === 0 ? `<em class="sg-why">${esc(t.why)}</em>` : ''}</button>`).join('')}</div>
        ${mg ? '' : '<p class="wb-note">The host or the project lead sets the brand colors, logo and fonts. Themes change the layout for you.</p>'}
        <span class="wb-lbl">Color</span>
        <div class="sg-color"><div class="sg-chips">${(B.swatches || []).map(c => `<button class="sg-sw ${B.primary === c ? 'on' : ''}" data-sgsw="${esc(c)}" style="background:${esc(c)}" aria-label="Color ${esc(c)}" ${mg ? '' : 'disabled'}></button>`).join('')}</div>
          <label class="wb-field sg-hex"><span>Main color</span><input class="input" id="sg-primary" value="${esc(B.primary || '')}" placeholder="#RRGGBB" maxlength="7" autocomplete="off" ${mg ? '' : 'readonly'}></label>
          <label class="wb-field sg-hex"><span>Accent (optional)</span><input class="input" id="sg-accent" value="${esc(B.accent || '')}" placeholder="#RRGGBB" maxlength="7" autocomplete="off" ${mg ? '' : 'readonly'}></label></div>
        ${(B.notes || []).length ? `<ul class="sg-notes" id="sg-notes">${B.notes.map(n => `<li>${esc(n.text)}</li>`).join('')}</ul>` : ''}
        <span class="wb-lbl">Logo</span>
        <div class="sg-logo-row">${B.logo ? `<img class="sg-logo" src="${esc(B.logo.url)}" alt="Logo">` : '<span class="sg-logo none" aria-hidden="true">Aa</span>'}
          ${mg ? `<label class="btn sm sg-file">Upload PNG, SVG or JPG<input type="file" id="sg-logo" accept="image/png,image/svg+xml,image/jpeg" hidden></label>${B.logo ? '<button class="linkish" id="sg-logo-rm">Remove</button>' : ''}` : ''}</div>
        <label class="wb-field"><span>Name in the header (when there is no logo)</span><input class="input" id="sg-word" value="${esc(B.wordmark || '')}" placeholder="The project name" maxlength="60" autocomplete="off" ${mg ? '' : 'readonly'}></label>
        <label class="wb-field"><span>Font pair</span><select class="input" id="sg-font" ${mg ? '' : 'disabled'}><option value="">The layout's own (${esc(((B.fonts || []).find(f => f.id === B.layoutFont) || {}).name || 'default')})</option>${(B.fonts || []).map(f => `<option value="${esc(f.id)}" ${B.font === f.id ? 'selected' : ''}>${esc(f.feel)}: ${esc(f.name)}</option>`).join('')}</select></label>
        ${mg ? '<div class="sg-ed-acts"><button class="btn sm primary" id="sg-brand-save">Save brand</button></div>' : ''}
        ${d ? `<span class="wb-lbl">Layout</span><div class="sg-layouts" role="radiogroup" aria-label="Layout">${G.layouts.map(x => `<button class="sg-lay ${x.id === d.layout ? 'on' : ''}" role="radio" aria-checked="${x.id === d.layout}" data-lay="${esc(x.id)}" ${can ? '' : 'disabled'}><b>${esc(x.name)}</b><small>${esc(x.note)}</small></button>`).join('')}</div>` : ''}`;
    } else {
      body = d ? `<span class="wb-lbl">Sections</span>
        <div class="sg-secs" id="sg-secs">${G.sections.filter(s => (d.secs || []).includes(s.id)).sort((a, b) => d.secs.indexOf(a.id) - d.secs.indexOf(b.id)).map(s => secRow(s, d, can)).join('')}</div>
        ${can ? `<div class="sg-acts"><button class="btn" id="sg-shuffle">Shuffle layout</button><button class="btn" id="sg-regen">Regenerate copy</button><button class="btn" id="sg-write" title="${G.brain ? 'Uses the tribe\'s brain' : 'Needs a brain: Settings › Flint\'s brain'}">Write it for me</button></div>` : ''}
        <p class="wb-note">Sections with nothing to show yet (no screenshots, no milestones) stay hidden on the page.</p>` : '<p class="wb-note">Pick a type in step 1 first.</p>';
    }
    return `${nav}<div class="sg-stepbody">${body}</div><div class="sg-stepnav">${step > 1 ? '<button class="btn sm" data-sgstep-go="-1">Back</button>' : ''}${step < 3 ? '<button class="btn sm primary" data-sgstep-go="1">Next</button>' : ''}</div>`;
  }

  // ---------- 🧑‍💻 Code ----------
  function codePane(G) {
    if (!code) return '<p class="wb-note" id="sg-code-wait">Loading the files…</p>';
    const f = code.files.find(x => x.name === codeFile && x.text) || code.files.find(x => x.text);
    return `<p class="wb-note sg-howto">${esc(code.howTo)}</p>
      <p class="wb-note">Publish writes these to <code>${esc(code.folder)}</code>${code.draft ? ' (this is the draft; it goes there when you publish)' : ''}.</p>
      <ul class="sg-files">${code.files.map(x => `<li><button class="sg-fileb ${x.name === (f && f.name) ? 'on' : ''}" data-sgfile="${esc(x.name)}" ${x.text ? '' : 'disabled'}><code>${esc(x.name)}</code><small>${esc(kb(x.bytes))}${(code.handEdited || []).includes(x.name) ? ' · edited by hand' : ''}</small></button>${x.note ? `<span class="sg-fnote">${esc(x.note)}</span>` : ''}</li>`).join('')}</ul>
      ${f ? `<pre class="sg-code" tabindex="0" aria-label="${esc(f.name)}"><code>${esc(f.text)}</code></pre>` : ''}
      <div class="sg-acts">${f ? '<button class="btn sm" id="sg-copy">Copy this file</button>' : ''}${code.inRepo ? '<button class="btn sm" id="sg-open-code">Open in the Code view</button>' : ''}</div>`;
  }
  async function loadCode(box, w, ctx) { try { code = await ctx.api('/code'); } catch (e) { code = { files: [], howTo: e.message, folder: '', handEdited: [] }; } if (mode === 'code') draw(box, w, ctx); }

  function ideaCard(G) {
    const x = G.idea, T = G.themes.find(t => t.id === x.theme) || {}, ty = G.types.find(t => t.id === x.type) || {};
    const font = ((G.brand || {}).fonts || []).find(f => f.id === x.font);
    return `<div class="sg-idea" id="sg-idea" role="region" aria-label="Suggestion"><div class="sg-idea-top"><span class="eyebrow">Suggestion${x.via === 'rules' ? '' : ` · by ${esc(x.via)}`}</span>
        <span class="sg-sws" aria-hidden="true"><i style="background:${esc(x.primary)}"></i>${x.accent ? `<i style="background:${esc(x.accent)}"></i>` : ''}</span></div>
      <p class="sg-idea-main"><b>${esc(T.name || x.theme)}</b> theme as ${/^[aeiou]/i.test(ty.name || '') ? 'an' : 'a'} <b>${esc((ty.name || x.type).toLowerCase())}</b>${font ? `, ${esc(font.name)}` : ''}.</p>
      ${x.tagline ? `<p class="sg-idea-tag">“${esc(x.tagline)}”</p>` : ''}${x.why ? `<p class="wb-note">${esc(x.why)}</p>` : ''}
      <div class="sg-hand-acts"><button class="btn sm primary" id="sg-idea-apply">Apply</button><button class="btn sm" id="sg-idea-skip">Not now</button></div></div>`;
  }

  function wire(box, w, ctx) {
    const G = w.gen, d = G.draft, q = s => box.querySelector(s), redraw = () => draw(box, w, ctx);
    box.querySelectorAll('[data-sgmode]').forEach(b => b.onclick = () => { setMode(b.dataset.sgmode); if (mode === 'code') { code = null; loadCode(box, w, ctx); } redraw(); });
    if (mode === 'code' && !code) loadCode(box, w, ctx);
    box.querySelectorAll('[data-sgstep]').forEach(b => b.onclick = () => { step = Number(b.dataset.sgstep); redraw(); });
    box.querySelectorAll('[data-sgstep-go]').forEach(b => b.onclick = () => { step = Math.max(1, Math.min(3, step + Number(b.dataset.sgstepGo))); redraw(); });
    if (q('#sg-make')) q('#sg-make').onclick = e => run(e.currentTarget, () => ctx.api('/instant', { method: 'POST', body: {} }), ctx, null, r => ctx.toast(`Here is a first draft: ${(r.website.gen.types.find(t => t.id === r.type) || {}).name || 'your site'}`));
    box.querySelectorAll('[data-sginst]').forEach(b => b.onclick = () => run(b, () => ctx.api('/instant', { method: 'POST', body: { type: b.dataset.sginst } }), ctx, `Made a ${b.textContent.trim().replace(/^\W+/, '').toLowerCase()}`));
    box.querySelectorAll('[data-sginsttheme]').forEach(b => b.onclick = () => run(b, () => ctx.api('/instant', { method: 'POST', body: { theme: b.dataset.sginsttheme, type: d && d.type ? d.type : undefined } }), ctx, `Made it with the ${b.textContent.trim()} theme`));
    box.querySelectorAll('[data-sgtype]').forEach(b => b.onclick = () => run(b, () => d ? ctx.api('/gen', { method: 'PUT', body: { type: b.dataset.sgtype } }) : ctx.api('/instant', { method: 'POST', body: { type: b.dataset.sgtype } }), ctx));
    if (q('#sg-info-save')) q('#sg-info-save').onclick = e => { const info = {}; box.querySelectorAll('[data-sginfo]').forEach(i => { info[i.dataset.sginfo] = i.value; }); run(e.currentTarget, () => ctx.api('/gen', { method: 'PUT', body: { info } }), ctx, 'Details saved'); };
    box.querySelectorAll('[data-sgtheme]').forEach(b => b.onclick = () => run(b, () => d ? ctx.api('/gen', { method: 'PUT', body: { theme: b.dataset.sgtheme } }) : ctx.api('/instant', { method: 'POST', body: { theme: b.dataset.sgtheme } }), ctx, 'Theme applied'));
    box.querySelectorAll('[data-sgsw]').forEach(b => b.onclick = () => { const i = q('#sg-primary'); if (i) i.value = b.dataset.sgsw; box.querySelectorAll('[data-sgsw]').forEach(x => x.classList.toggle('on', x === b)); });
    const brandPut = (btn, body, msg) => run(btn, () => ctx.api('/brand', { method: 'PUT', body }), ctx, msg, r => { if (r.brand && r.brand.notes && r.brand.notes.length) setTimeout(() => ctx.toast(r.brand.notes[0].text), 1200); });
    if (q('#sg-brand-save')) q('#sg-brand-save').onclick = e => brandPut(e.currentTarget, { primary: q('#sg-primary').value.trim(), accent: q('#sg-accent').value.trim(), font: q('#sg-font').value, wordmark: q('#sg-word').value }, 'Brand saved');
    if (q('#sg-logo')) q('#sg-logo').onchange = e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      if (f.size > 200 * 1024) { ctx.toast('The logo is too big: keep it under 200 KB'); return; }
      const rd = new FileReader(); rd.onload = () => brandPut(q('.sg-file'), { logo: rd.result }, 'Logo added'); rd.readAsDataURL(f);
    };
    if (q('#sg-logo-rm')) q('#sg-logo-rm').onclick = e => brandPut(e.currentTarget, { logo: null }, 'Logo removed');
    box.querySelectorAll('[data-lay]').forEach(b => b.onclick = () => d && b.dataset.lay !== d.layout && run(b, () => ctx.api('/gen', { method: 'PUT', body: { layout: b.dataset.lay } }), ctx));
    if (q('#sg-shuffle')) q('#sg-shuffle').onclick = e => run(e.currentTarget, () => ctx.api('/gen', { method: 'POST', body: { how: 'shuffle' } }), ctx, null, r => ctx.toast(`Now: ${(r.website.gen.layouts.find(x => x.id === r.website.gen.draft.layout) || {}).name} layout`));
    if (q('#sg-regen')) q('#sg-regen').onclick = e => run(e.currentTarget, () => ctx.api('/gen', { method: 'POST', body: { how: 'regenerate' } }), ctx, Object.keys((d && d.edited) || {}).length ? 'Fresh copy. Your hand edits stay.' : 'Fresh copy');
    if (q('#sg-write')) q('#sg-write').onclick = e => write(e.currentTarget, w, ctx);
    if (q('#sg-ideas')) q('#sg-ideas').onclick = e => suggest(e.currentTarget, w, ctx);
    if (q('#sg-idea-apply')) q('#sg-idea-apply').onclick = e => run(e.currentTarget, () => ctx.api('/ideas/apply', { method: 'POST' }), ctx, 'Applied. Have a look at the preview.');
    if (q('#sg-idea-skip')) q('#sg-idea-skip').onclick = e => run(e.currentTarget, () => ctx.api('/ideas/skip', { method: 'POST' }), ctx, 'Noted. Next time I suggest something else.');
    // v0.25: site templates. Save this website as one, or start from one the host made.
    if (q('#sg-save-tpl')) q('#sg-save-tpl').onclick = async e => { const b = e.currentTarget; b.disabled = true; try { const t = await window.TribeClient.api('/site-templates', { method: 'POST', body: { project: window.TribeClient.project(), name: (window.TribeProjects && window.TribeProjects.currentProject && (window.TribeProjects.currentProject() || {}).name) || '' } }); ctx.toast(`Saved as the template “${t.name}”. New projects can start from it in setup.`); } catch (er) { ctx.toast(er.message); } b.disabled = false; };
    if (q('#sg-tpls') && (G.canBrand || G.canPublish)) window.TribeClient.api('/site-templates').then(r => {
      const box2 = q('#sg-tpls'); if (!box2 || !r.templates.length) return;
      box2.hidden = false; box2.innerHTML = `<span class="wb-lbl">Start from a tribe template</span><div class="sg-chips">${r.templates.map(t => `<button class="sg-chip" data-sgtpl="${esc(t.slug)}" title="${esc(t.summary || '')}">🧩 ${esc(t.name)}</button>`).join('')}</div>`;
      box2.querySelectorAll('[data-sgtpl]').forEach(b => b.onclick = () => run(b, () => window.TribeClient.api(`/projects/${encodeURIComponent(window.TribeClient.project())}/site-template`, { method: 'POST', body: { slug: b.dataset.sgtpl } }), ctx, null, x => ctx.toast(x.written.length ? `Added ${x.written.length} files from the template to site/` : 'Those files were already there')));
    }).catch(() => {});
    const pub = onEdited => ctx.api('/publish', { method: 'POST', body: onEdited ? { onEdited } : {} });
    if (q('#sg-publish')) q('#sg-publish').onclick = e => { if (G.handEdited && G.handEdited.length) { ctx.toast('Someone edited the code by hand: keep their edits or replace them first'); const h = q('#sg-hand'); if (h) h.scrollIntoView({ block: 'nearest' }); return; } run(e.currentTarget, () => pub(), ctx, 'Published: the website is live'); };
    if (q('#sg-keep')) q('#sg-keep').onclick = e => run(e.currentTarget, () => pub('keep'), ctx, 'Published. Their hand edits stay as they are.');
    if (q('#sg-replace')) q('#sg-replace').onclick = e => run(e.currentTarget, () => pub('replace'), ctx, 'Published with the builder\'s files');
    if (q('#sg-classic')) q('#sg-classic').onclick = e => run(e.currentTarget, () => ctx.api('/classic', { method: 'POST' }), ctx, 'Back to the simple page');
    box.querySelectorAll('[data-sgsec]').forEach(i => i.onchange = () => run(i, () => ctx.api('/gen', { method: 'PUT', body: { off: { [i.dataset.sgsec]: !i.checked } } }), ctx));
    box.querySelectorAll('[data-sgedit]').forEach(b => b.onclick = () => { editing = editing === b.dataset.sgedit ? null : b.dataset.sgedit; redraw(); const f = box.querySelector('.sg-ed input, .sg-ed textarea'); if (f) f.focus(); });
    box.querySelectorAll('[data-sgfile]').forEach(b => b.onclick = () => { codeFile = b.dataset.sgfile; redraw(); });
    if (q('#sg-copy')) q('#sg-copy').onclick = () => { const t = q('.sg-code').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => ctx.toast('Copied'), () => ctx.toast('Select the text and copy it')); };
    if (q('#sg-open-code')) q('#sg-open-code').onclick = () => { if (window.TribeShell) window.TribeShell.go('docs'); setTimeout(() => { try { window.TribeCodeFiles && window.TribeCodeFiles.set('code'); } catch {} ctx.toast('Open the site folder in the tree'); }, 150); };
    const ed = q('.sg-ed[data-sec]');
    if (ed) {
      const k = ed.dataset.sec;
      const add = ed.querySelector('[data-additem]'); if (add) add.onclick = () => { const list = ed.querySelector('.sg-items'); if (list.children.length >= 6) return; list.insertAdjacentHTML('beforeend', itemRow(k, {}, list.children.length)); };
      ed.querySelector('[data-sgsave]').onclick = e => {
        const copy = {}; ed.querySelectorAll('[data-f]').forEach(i => { copy[i.dataset.f] = i.value; });
        if (ITEMS[k]) copy.items = [...ed.querySelectorAll('.sg-item')].map(r => Object.fromEntries([...r.querySelectorAll('[data-if]')].map(i => [i.dataset.if, i.value])));
        run(e.currentTarget, () => ctx.api('/gen', { method: 'PUT', body: { section: k, copy } }), ctx, 'Saved', () => { editing = null; });
      };
      const rs = ed.querySelector('[data-sgreset]'); if (rs) rs.onclick = e => run(e.currentTarget, () => ctx.api('/gen', { method: 'PUT', body: { reset: k } }), ctx, 'Back to the template', () => { editing = null; });
      ed.querySelector('[data-sgcancel]').onclick = () => { editing = null; redraw(); };
    }
  }
  function secRow(s, d, can) {
    const on = !(d.off || {})[s.id], fixed = s.id === 'hero', ed = (d.edited || {})[s.id];
    return `<div class="sg-sec ${editing === s.id ? 'open' : ''}"><label class="sg-on"><input type="checkbox" data-sgsec="${esc(s.id)}" ${on ? 'checked' : ''} ${can && !fixed ? '' : 'disabled'}><span>${esc(s.name)}</span>${ed ? '<em class="sg-tag">edited</em>' : ''}</label>
      ${can && FIELDS[s.id] ? `<button class="linkish sg-edit" data-mode-min="intermediate" data-sgedit="${esc(s.id)}" aria-expanded="${editing === s.id}">${editing === s.id ? 'Close' : 'Edit'}</button>` : ''}</div>
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
    if (busy) return; busy = true; const was = btn ? btn.disabled : false; if (btn) btn.disabled = true;
    try { const r = await call(); if (after) after(r); code = null; ctx.set(r.website); if (okMsg) ctx.toast(okMsg); }
    catch (e) { ctx.toast(e.message); if (btn && btn.type === 'checkbox') btn.checked = !btn.checked; if (e.status === 409) { try { ctx.set((await ctx.api('')).website); } catch {} } }
    finally { busy = false; if (btn) btn.disabled = was; }
  }
  // Suggest for me: the person's built-in model when they picked it, else the server (the tribe's brain, or rules).
  async function suggest(btn, w, ctx) {
    const B = window.TribeBrain, label = btn.textContent;
    if (busy) return; busy = true; btn.disabled = true; btn.textContent = 'Thinking…';
    try {
      let body = {};
      if (B && B.choice && B.choice() === 'browser') { try { const pr = await ctx.api('/ideas/prompt'); const out = await B.askBrowser([{ role: 'system', content: pr.system }, { role: 'user', content: pr.prompt }], () => {}); body = { reply: out.text || '' }; } catch {} }
      const r = await ctx.api('/ideas', { method: 'POST', body });
      ctx.set(r.website);
    } catch (e) { ctx.toast(e.message); }
    finally { busy = false; btn.disabled = false; btn.textContent = label; }
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
  window.TribeSiteGen = { draw, mode: m => { if (m) setMode(m); return mode; }, step: n => { if (n) step = n; return step; }, levelFor: xp => DEFAULT_LEVEL[xp] || 'instant' };
})();
