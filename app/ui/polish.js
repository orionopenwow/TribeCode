// "Polish it" (pass 4, docs/CLAUDE-HOOKS.md): what a careful designer would tidy before showing the work, found by rules.
// No AI, no network. The same pass for the website designer (sitecfg.js) and App Creator (appcreator-core.js):
//
//   TribePolish.site(cfg, S)  -> [item]      S = TribeSiteCfg        (Check my site's safe fixes + spacing rhythm, type
//   TribePolish.app(doc, A)   -> [item]      A = TribeAppCreatorCore  scale, alignment, colour that reads, dead buttons,
//                                                                    empty parts, picture descriptions)
//   item = { id, group, title, why, run?(design) -> design }   an item with no run() is a note: something to do by hand
//   TribePolish.apply(design, items) -> { design, done: [titles] }     every picked fix, in order: the caller commits the
//                                                                    result once, so it is ONE Undo
//   TribePolish.open({ kind, items, onApply(picked) })   the sheet: what will change, tick boxes, one Apply
//
// Groups: 'read' (colour and contrast) · 'space' (spacing rhythm) · 'type' (type scale) · 'align' (alignment) ·
//         'work' (buttons and forms that do nothing) · 'empty' (empty parts) · 'pics' (picture descriptions) · 'find' (search)
(function (root, factory) { const api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribePolish = api; })(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const GROUPS = { read: 'Colour that reads', space: 'Spacing', type: 'Type sizes', align: 'Alignment', work: 'Buttons that work', empty: 'Empty parts', pics: 'Pictures', find: 'Search and sharing' };
  const short = (t, n) => { t = String(t || ''); return t.length > (n || 40) ? t.slice(0, (n || 40) - 1) + '…' : t; };
  const most = list => { const n = {}; let best = null; list.forEach(v => { n[v] = (n[v] || 0) + 1; if (best == null || n[v] > n[best]) best = v; }); return { value: best, count: best == null ? 0 : n[best], kinds: Object.keys(n).length }; };

  // ---------- the website ----------
  const CHECK_GROUP = { 'contrast-ink': 'read', 'contrast-accent': 'read', 'contrast-muted': 'read', 'seo-desc': 'find', 'seo-long': 'find', 'seo-icon': 'find', 'seo-share': 'find', link: 'work', 'link-http': 'work', form: 'work', nl: 'work', embed: 'work', alt: 'pics', pic: 'pics', empty: 'empty', 'empty-page': 'empty', example: 'empty', footer: 'empty', longword: 'type', table: 'space' };
  function site(cfg, S) {
    const c = S.normalize(JSON.parse(JSON.stringify(cfg))), out = [];
    // 1. everything Check my site can fix safely, and its notes
    for (const x of S.check(c)) {
      const kind = String(x.id).split(':')[0], ops = x.fix && x.fix.ops;
      out.push({ id: 'check:' + x.id, group: CHECK_GROUP[kind] || 'work', title: x.title, why: ops ? `${x.fix.label}.` : x.text, ...(ops ? { run: d => { const r = S.applyOps(d, ops); return r.done.length ? r.cfg : d; } } : {}) });
    }
    c.pages.forEach(pg => {
      const vis = pg.blocks.filter(b => !b.hidden && !/^(footer|divider)$/.test(b.type)), where = c.pages.length > 1 ? ` on “${short(pg.title, 24)}”` : '';
      // 2. spacing rhythm: one section tighter or roomier than the rest breaks the beat of the page
      if (vis.length >= 3) {
        const m = most(vis.map(b => (b.style && b.style.pad) || '')), odd = vis.filter(b => ((b.style && b.style.pad) || '') !== m.value);
        if (odd.length && odd.length <= Math.max(1, Math.floor(vis.length / 3))) out.push({ id: 'space:' + pg.id, group: 'space', title: `${odd.length === 1 ? 'One section has' : `${odd.length} sections have`} different spacing${where}`, why: `The others share ${m.value === 's' ? 'tight' : m.value === 'l' ? 'roomy' : 'the normal'} spacing. Matching them gives the page one rhythm.`, run: d => odd.reduce((x, b) => S.setStyle(x, pg.id, b.id, { pad: m.value }), d) });
      }
      // 3. two loud backgrounds in a row read as one long block
      for (let i = 1; i < pg.blocks.length; i++) {
        const a = pg.blocks[i - 1], b = pg.blocks[i], ba = a.style && a.style.bg, bb = b.style && b.style.bg;
        if (!a.hidden && !b.hidden && ba && ba === bb && /^(accent|ink)$/.test(bb)) out.push({ id: 'bg:' + b.id, group: 'space', title: `Two ${bb === 'accent' ? 'coloured' : 'dark'} sections sit back to back${where}`, why: 'The second one goes back to the plain background, so each section stands apart.', run: d => S.setStyle(d, pg.id, b.id, { bg: '' }) });
      }
      // 4. entrances: one page, one kind of motion
      { const an = pg.blocks.filter(b => !b.hidden && b.style && b.style.anim), m = most(an.map(b => b.style.anim)); if (m.kinds > 1) { const odd = an.filter(b => b.style.anim !== m.value); out.push({ id: 'anim:' + pg.id, group: 'align', title: `Sections come in two different ways${where}`, why: `Most ${m.value === 'rise' ? 'rise' : 'fade'} in. The rest will do the same.`, run: d => odd.reduce((x, b) => S.setStyle(x, pg.id, b.id, { anim: m.value }), d) }); } }
      pg.blocks.forEach(b => {
        if (b.hidden || !b.es) return; const es = b.es, name = short((b.props && b.props.title) || b.type, 28);
        // 5. type scale: a headline set smaller than normal, or a paragraph set to the biggest size, flips the order of what is read first
        const small = Object.keys(es).filter(p => /(^|\.)title$/.test(p) && es[p].sz === 's'), big = Object.keys(es).filter(p => /(^|\.)(text|sub|bio|note)$/.test(p) && es[p].sz === 'xl');
        if (small.length || big.length) out.push({ id: 'type:' + b.id, group: 'type', title: `The sizes in “${name}” fight each other`, why: `${small.length ? 'A heading is set smaller than normal' : 'A paragraph is set to the biggest size'}. Back to normal sizes, the heading leads again.`, run: d => [...small, ...big].reduce((x, p) => S.setElStyle(x, pg.id, b.id, p, { sz: '' }), d) });
        // 6. alignment: a centred heading over left-aligned words (or the reverse) in one section
        const al = Object.keys(es).filter(p => es[p].al && !/\d/.test(p)), m = most(al.map(p => es[p].al));
        if (m.kinds > 1) { const tp = al.find(p => /title$/.test(p)), to = tp ? es[tp].al : m.value, odd = al.filter(p => es[p].al !== to); out.push({ id: 'align:' + b.id, group: 'align', title: `“${name}” lines up two ways`, why: `Everything in it will line up ${to === 'center' ? 'in the centre' : `on the ${to}`}, like its heading.`, run: d => odd.reduce((x, p) => S.setElStyle(x, pg.id, b.id, p, { al: to }), d) }); }
      });
    });
    return out;
  }

  // ---------- the app ----------
  const STOP = /^(?:a|an|the|to|my|your|new|add|go|open|see|view|all|more|and|of|for|in|on|it|get|start|started|now|me)$/;
  const wordsOf = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.test(w)).map(w => w.replace(/s$/, ''));
  function reach(doc) { const seen = new Set([doc.start]), q = [doc.start]; while (q.length) { const s = doc.screens.find(x => x.id === q.shift()); if (!s) continue; for (const b of s.blocks) for (const l of Object.values(b.links || {})) if (!seen.has(l.to)) { seen.add(l.to); q.push(l.to); } } return seen; }
  function app(doc, A) {
    const d = A.normalize(doc), out = [], k = A.palette(d.theme), seen = reach(d);
    const apply = (x, op) => A.apply(x, op).doc;
    // 1. the main colour has to stand out from the background (buttons, links, the selected tab)
    if (A.contrast(k.accent, k.bg) < 3) {
      const fixed = readable(d.theme.accent, k.bg, A, d.theme);
      out.push({ id: 'accent', group: 'read', title: 'The main colour fades into the background', why: `Buttons and the selected tab are hard to spot. A ${d.theme.mode === 'dark' ? 'lighter' : 'deeper'} shade of the same colour reads well.`, run: x => apply(x, { op: 'theme', set: { accent: fixed } }) });
    }
    const untouched = s => s.blocks.length <= 2 && s.blocks.every(b => b.type === 'nav' || b.type === 'empty');
    d.screens.forEach(s => {
      const body = s.blocks.filter(b => b.type !== 'tabs' && !b.hide);
      // 2. a screen nobody can get to, and a screen with nothing on it
      if (!seen.has(s.id)) {
        if (untouched(s) && d.screens.length > 1) { out.push({ id: 'unused:' + s.id, group: 'empty', title: `“${s.name}” is empty and nothing opens it`, why: 'It will be removed. Undo brings it back.', run: x => apply(x, { op: 'screen.remove', screen: s.id }) }); return; }
        out.push({ id: 'lost:' + s.id, group: 'work', title: `Nothing opens “${s.name}”`, why: 'Select a button or a row on another screen and link it here, or say “link this to ' + s.name + '”.' });
      } else if (!body.length || untouched(s)) out.push({ id: 'empty:' + s.id, group: 'empty', title: `“${s.name}” has nothing on it yet`, why: 'Open Add and pick a part, or say “add a list”.' });
      // 3. every screen starts with a title, so people know where they are
      if (body.length && !/^(nav|header|hero|onboarding|signin|profile|paywall|stories|search|otp|player|video|map|chat)$/.test(body[0].type)) out.push({ id: 'title:' + s.id, group: 'align', title: `“${s.name}” starts without a title`, why: 'A title bar goes on top, like the other screens.', run: x => { const r = A.apply(x, { op: 'block.add', screen: s.id, type: s.tab || s.id === d.start ? 'header' : 'nav', at: 0 }); return r.block ? A.apply(r.doc, { op: 'text', block: r.block, path: 'title', value: s.name }).doc : r.doc; } });
      // 4. buttons that go nowhere
      body.forEach(b => {
        const label = b.type === 'button' ? (b.props.label || b.props.title || b.props.text) : (typeof b.props.button === 'string' ? b.props.button : ''), path = b.type === 'button' ? '' : 'button';
        if (!label || (b.links && b.links[path])) return;
        if (/^(form|signin|otp|paywall|contact|poll|search|chat|comments|voice|keypad|player|timer|stepper|rating)$/.test(b.type) && b.type !== 'button') return;   // these do their own thing in Play
        const lw = wordsOf(label), to = d.screens.filter(t => t.id !== s.id).map(t => ({ t, n: wordsOf(t.name).filter(w => lw.includes(w)).length })).filter(x => x.n).sort((p, q) => q.n - p.n)[0];
        if (to) out.push({ id: 'link:' + b.id, group: 'work', title: `“${short(label, 28)}” goes nowhere`, why: `It will open “${to.t.name}”, the screen its words match.`, run: x => apply(x, { op: 'link', block: b.id, path, to: to.t.id, how: 'push' }) });
        else out.push({ id: 'dead:' + b.id, group: 'work', title: `“${short(label, 28)}” goes nowhere`, why: `On “${s.name}”. Select it and pick where it goes.` });
      });
      // 5. the same part twice in a row with the same words is almost always a slip
      for (let i = 1; i < body.length; i++) if (body[i].type === body[i - 1].type && JSON.stringify(body[i].props) === JSON.stringify(body[i - 1].props) && body[i].type !== 'button') out.push({ id: 'twice:' + body[i].id, group: 'space', title: `The same part sits twice in a row on “${s.name}”`, why: 'The copy goes; the first one stays.', run: x => apply(x, { op: 'block.remove', block: body[i].id }) });
      // 6. names people will see
      if (/^(new screen|screen|untitled)(?:[ -]\d+)?$/i.test(s.name)) out.push({ id: 'name:' + s.id, group: 'type', title: 'A screen is still called “' + s.name + '”', why: 'Give it a name people will know, like Settings or Cart.' });
    });
    // 7. three or more main screens and no tab bar: there is no way to move between them
    const tops = d.screens.filter(s => !s.blocks.some(b => b.type === 'nav' && b.props.back));
    if (tops.length >= 3 && !d.screens.some(s => s.blocks.some(b => b.type === 'tabs')) && tops.some(s => !seen.has(s.id))) out.push({ id: 'tabs', group: 'work', title: 'There is no way to move between the main screens', why: `A tab bar with ${Math.min(5, tops.length)} tabs goes at the bottom.`, run: x => apply(x, { op: 'tabbar' }) });
    // 8. a very tight layout on a full screen is hard to tap
    if (d.theme.density === 'compact' && d.screens.some(s => s.blocks.length >= 6)) out.push({ id: 'dense', group: 'space', title: 'The screens are packed tight', why: 'Regular spacing gives every row room for a thumb.', run: x => apply(x, { op: 'theme', set: { density: 'regular' } }) });
    return out;
  }
  // a shade of the same colour that stands out from the background (3 to 1), found by stepping its lightness
  function readable(hex, bg, A, theme) {
    const h = String(hex).replace('#', ''), rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)), dark = theme.mode === 'dark';
    for (let s = 1; s <= 20; s++) { const f = s / 20, c = '#' + rgb.map(v => Math.round(dark ? v + (255 - v) * f : v * (1 - f)).toString(16).padStart(2, '0')).join('').toUpperCase(); if (A.contrast(A.palette({ ...theme, accent: c }).accent, bg) >= 3) return c; }
    return dark ? '#FFFFFF' : '#15171B';
  }

  function apply(design, items) {
    let x = design; const done = [];
    for (const it of items || []) { if (!it || typeof it.run !== 'function') continue; try { const before = JSON.stringify(x), y = it.run(x); if (y && JSON.stringify(y) !== before) { x = y; done.push(it.title); } } catch {} }
    return { design: x, done };
  }
  const pure = { site, app, apply, GROUPS, version: 1 };
  if (typeof document === 'undefined') return pure;

  // ---------- the sheet ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (root.TribeI18n && root.TribeI18n.t ? (root.TribeI18n.t(s, s) || s) : s);
  function open(o) {
    close();
    const items = o.items || [], fixes = items.filter(i => i.run), notes = items.filter(i => !i.run);
    const el = document.createElement('div'); el.id = 'polish'; el.className = 'pol-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', tr('Polish it'));
    const row = (i, n) => `<label class="pol-row"><input type="checkbox" data-pol="${n}" checked><span><b>${esc(i.title)}</b><small>${esc(i.why)}</small></span><em class="pol-g">${esc(tr(GROUPS[i.group] || ''))}</em></label>`;
    el.innerHTML = `<div class="pol-in"><header><p class="pol-eyebrow">${esc(tr(o.kind === 'app' ? 'App' : 'Website'))} · ${esc(tr('no AI'))}</p><h2>${esc(tr('Polish it'))}</h2><button type="button" class="pol-x" data-pol-x aria-label="${esc(tr('Close'))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
      ${fixes.length ? `<p class="pol-lead">${esc(fixes.length === 1 ? tr('One thing to tidy. Untick it to leave it.') : tr('{n} things to tidy. Untick any you want to leave.').replace('{n}', fixes.length))}</p><div class="pol-list" id="pol-fixes">${fixes.map(row).join('')}</div>`
        : `<p class="pol-lead">${esc(tr(notes.length ? 'Nothing to fix automatically. A few things are worth a look by hand.' : 'Nothing to tidy: spacing, sizes, colours and buttons all check out.'))}</p>`}
      ${notes.length ? `<p class="pol-eyebrow pol-hand">${esc(tr('To do by hand'))}</p><ul class="pol-notes">${notes.slice(0, 12).map(i => `<li><b>${esc(i.title)}</b><small>${esc(i.why)}</small></li>`).join('')}</ul>` : ''}
      <footer>${fixes.length ? `<button type="button" class="btn primary" id="pol-apply">${esc(tr('Apply'))}</button>` : ''}<button type="button" class="btn ghost" data-pol-x>${esc(tr(fixes.length ? 'Cancel' : 'Close'))}</button><small class="pol-foot">${esc(tr('One Undo takes it all back.'))}</small></footer></div>`;
    (o.host || document.body).appendChild(el);
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (e.target === el || e.target.closest('[data-pol-x]')) return close();
      if (e.target.closest('#pol-apply')) { const picked = [...el.querySelectorAll('[data-pol]')].filter(c => c.checked).map(c => fixes[+c.dataset.pol]); close(); if (picked.length && o.onApply) o.onApply(picked); }
    });
    // Escape closes this sheet and nothing behind it: the editors listen on the document in the capture phase, so this goes first
    onEsc = e => { if (e.key === 'Escape' && document.getElementById('polish')) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    window.addEventListener('keydown', onEsc, true);
    setTimeout(() => { const b = el.querySelector('#pol-apply') || el.querySelector('[data-pol-x]'); if (b) b.focus(); }, 0);
    return el;
  }
  let onEsc = null;
  function close() { const el = document.getElementById('polish'); if (el) el.remove(); if (onEsc) { window.removeEventListener('keydown', onEsc, true); onEsc = null; } }
  return Object.assign(pure, { open, close });
});
