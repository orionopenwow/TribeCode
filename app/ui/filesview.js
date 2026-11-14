// Files (feat/files-dash): one component for every Files dashboard, Home's (your files everywhere) and a project's.
//   Header: the title "Files", search, grid/list, sort and one "+ Create" that opens the Studio (Note, Doc, Sheet,
//   Slides, Whiteboard, Design, Website, Code file, From a template, Upload, Ask Flint).
//   Tabs with small stroke icons: All · Notes · Docs · Sheets · Slides · Designs · Websites · Pictures · Audio/Video ·
//   Code · Other. Home adds a "Where" filter (Mine = this device + yours in every tribe, Everything, each tribe by name).
//   Files are grouped under section headers by where they live; cards carry a real preview, the type, the owner, the
//   time, a location chip and a ⋯ menu (Open, Rename, Move to…, Duplicate, Download, Delete).
// The caller (hub.js for Home, filegrid.js inside a project) supplies the items and the actions; this file draws them.
//   window.TribeFilesView = { mount(root, opts) -> { draw(), set(items), close() }, icon(name, size), thumb, CATS, studio(anchor, opts), draft(kind, ask) }
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`; return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' }); };

  // ---------- small minimalist stroke icons: the shared set (app/ui/icons.js, TribeIcons) ----------
  const icon = (n, sz = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, sz, 'fx-i') : '');

  // ---------- categories (the tabs) ----------
  const CATS = [
    ['all', 'All', 'all'], ['notes', 'Notes', 'notes'], ['docs', 'Docs', 'docs'], ['sheets', 'Sheets', 'sheets'], ['slides', 'Slides', 'slides'],
    ['designs', 'Designs', 'designs'], ['sites', 'Websites', 'sites'], ['pics', 'Pictures', 'pics'], ['media', 'Audio/Video', 'media'], ['code', 'Code', 'code'], ['other', 'Other', 'other'],
  ];
  const LEGACY = { boards: 'designs' };
  const EMPTY = {
    all: ['No files here yet', 'Make a note, a doc, a sheet or a design. It stays on this device until you move it into a tribe.', 'doc', 'Create a doc'],
    notes: ['No notes yet', 'Quick, private notes. The first line is the title.', 'note', 'Write a note'],
    docs: ['No docs yet', 'Rich text with headings, lists and checkboxes.', 'doc', 'Create a doc'],
    sheets: ['No sheets yet', 'Cells and formulas like =SUM(B2:B9).', 'sheet', 'Create a sheet'],
    slides: ['No slides yet', 'A deck to present, written as simple Markdown.', 'slides', 'Create slides'],
    designs: ['No designs yet', 'Frames, layers and text on a design canvas, or sketch on a whiteboard.', 'design', 'Create a design'],
    sites: ['No websites yet', 'A one-page website you can edit and preview right here.', 'site', 'Create a website'],
    pics: ['No pictures yet', 'Upload pictures, or drop them anywhere on this page.', 'upload', 'Upload pictures'],
    media: ['No audio or video yet', 'Upload sound, music or video clips.', 'upload', 'Upload audio or video'],
    code: ['No code yet', 'A code file you can edit here, or the repos you work in.', 'code', 'Create a code file'],
    other: ['Nothing else here', 'PDFs, 3D models, archives and anything else you upload.', 'upload', 'Upload a file'],
  };

  // ---------- the Studio: everything you can make ----------
  const STUDIO = [
    { k: 'note', ic: 'notes', t: 'Note', s: 'A quick private note' },
    { k: 'doc', ic: 'docs', t: 'Doc', s: 'Headings, lists, checkboxes' },
    { k: 'sheet', ic: 'sheets', t: 'Sheet', s: 'Cells and formulas' },
    { k: 'slides', ic: 'slides', t: 'Slides', s: 'A deck to present' },
    { k: 'whiteboard', ic: 'whiteboard', t: 'Whiteboard', s: 'Draw, stickies, shapes' },
    { k: 'design', ic: 'designs', t: 'Design', s: 'Frames, layers, text' },
    { k: 'site', ic: 'sites', t: 'Website', s: 'A page you can preview' },
    { k: 'code', ic: 'code', t: 'Code file', s: 'JS, Python, HTML…' },
    { k: 'template', ic: 'template', t: 'From a template', s: 'Plans, notes, specs' },
    { k: 'upload', ic: 'upload', t: 'Upload', s: 'Pictures, audio, PDFs, any file' },
    { k: 'flint', ic: 'spark', t: 'Ask Flint', s: 'Describe it, get a draft' },
  ];
  function closeMenus() { document.querySelectorAll('.fx-pop').forEach(m => m.remove()); }
  function place(m, anchor, align = 'right') {
    const r = anchor.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    m.style.top = '0px'; m.style.left = '0px';
    const w = m.offsetWidth, h = m.offsetHeight;
    let top = r.bottom + 6; if (top + h > H - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    m.style.top = `${Math.max(8, Math.min(top, H - h - 8))}px`;
    m.style.left = `${Math.max(8, Math.min(W - w - 8, align === 'right' ? r.right - w : r.left))}px`;
  }
  function outside(m, anchor) {
    setTimeout(() => {
      const off = e => { if (!m.isConnected) return cleanup(); if (!m.contains(e.target) && !(anchor && anchor.contains(e.target))) { m.remove(); cleanup(); } };
      const key = e => { if (e.key === 'Escape' && m.isConnected) { e.stopPropagation(); m.remove(); cleanup(); if (anchor && anchor.focus) anchor.focus(); } };
      const cleanup = () => { document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', key, true); };
      document.addEventListener('mousedown', off, true); document.addEventListener('keydown', key, true);
    }, 0);
  }
  // studio(anchor, { id, kinds?, ids: { kind: elementId }, note, create(k, anchor) })
  function studio(anchor, o) {
    const was = document.getElementById(o.id || 'fx-studio'); closeMenus(); if (was) return;
    const list = STUDIO.filter(x => !o.kinds || o.kinds.includes(x.k)).concat(o.extra || []);
    const m = document.createElement('div'); m.className = 'fx-pop fx-studio'; m.id = o.id || 'fx-studio'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Create');
    m.innerHTML = `<div class="fx-pop-h"><span class="fx-eyebrow">Studio</span><b>Create anything</b></div>
      <div class="fx-studio-grid">${list.map(x => `<button type="button" role="menuitem" class="fx-si" data-new="${x.k}"${x.id || (o.ids && o.ids[x.k]) ? ` id="${x.id || o.ids[x.k]}"` : ''}><span class="fx-si-ic">${icon(x.ic, 18)}</span><span class="fx-si-t"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></button>`).join('')}</div>
      ${o.note ? `<p class="fx-pop-note">${o.note}</p>` : ''}`;
    document.body.appendChild(m); place(m, anchor);
    m.querySelectorAll('[data-new]').forEach(b => b.onclick = () => { m.remove(); o.create(b.dataset.new, anchor); });
    outside(m, anchor);
    const f = m.querySelector('[data-new]'); if (f) f.focus({ preventScroll: true });
    return m;
  }

  // ---------- ✦ Ask Flint: a draft from a sentence; your own AI when connected, else a basic draft ----------
  const ASK_KIND = t => /\b(slides?|deck|presentation|pitch)\b/i.test(t) ? 'slides' : /\b(sheet|table|budget|spreadsheet|list of|tracker)\b/i.test(t) ? 'sheet' : /\b(website|site|landing|homepage|web page)\b/i.test(t) ? 'site' : 'doc';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function basicDraft(kind, ask) {
    const topic = cap(String(ask || '').replace(/^(please\s+)?(make|write|create|draft|build)\s+(me\s+)?(a|an|some|the)?\s*/i, '').replace(/^(doc|document|slides?|deck|sheet|table|website|site|page)\s+(about|for|on)\s+/i, '').trim().slice(0, 80)) || 'Untitled';
    if (kind === 'slides') return { title: topic, body: `<!-- theme: campfire -->\n\n# ${topic}\n\nWhat this is, in one line\n\n---\n\n## Why it matters\n\n- \n- \n\n---\n\n## The plan\n\n1. \n2. \n3. \n\n---\n\n## Next steps\n\n- \n` };
    if (kind === 'sheet') return { title: topic, body: '| Item | Owner | Status | Amount |\n| --- | --- | --- | --- |\n|  |  |  |  |\n|  |  |  |  |\n| Total |  |  | =SUM(D2:D3) |\n' };
    if (kind === 'site') return { title: topic, body: siteHtml(topic) };
    return { title: topic, body: `# ${topic}\n\n## Goal\n\n\n## Notes\n\n- \n\n## Next steps\n\n- [ ] \n` };
  }
  function siteHtml(title) {
    const t = esc(title || 'My website');
    return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${t}</title>\n<style>\n  body { margin: 0; font: 16px/1.6 system-ui, sans-serif; background: #12151A; color: #F8FAFC; }\n  header { padding: 64px 24px 40px; max-width: 720px; margin: 0 auto; }\n  h1 { font-size: 44px; line-height: 1.1; margin: 0 0 12px; }\n  p { color: #94A3B8; max-width: 60ch; }\n  a.cta { display: inline-block; margin-top: 16px; padding: 12px 18px; border-radius: 8px; background: #F26B1D; color: #fff; text-decoration: none; font-weight: 700; }\n  section { max-width: 720px; margin: 0 auto; padding: 24px; border-top: 1px solid #2A313C; }\n</style>\n</head>\n<body>\n<header>\n  <h1>${t}</h1>\n  <p>One line that says what this is and who it is for.</p>\n  <a class="cta" href="#about">Learn more</a>\n</header>\n<section id="about">\n  <h2>About</h2>\n  <p>Write a few sentences here.</p>\n</section>\n</body>\n</html>\n`;
  }
  // draft(kind, ask) -> { title, body, via }   via: who wrote it ('basic' when no AI answered)
  async function draft(kind, ask) {
    const base = basicDraft(kind, ask);
    const AB = window.TribeAIBasics;
    if (kind !== 'site' && AB && AB.ask) {
      try {
        const r = await AB.ask('doc.continue', `Title: ${base.title}\nWhat to write: ${ask}`, base.body);
        if (r && r.text) return { title: base.title, body: `${base.body.replace(/\s+$/, '')}\n\n${r.text.trim()}\n`, via: r.via || 'your AI' };
      } catch {}
    }
    return { ...base, via: 'basic' };
  }
  // A small sheet: "What should Flint make?" → make(kind, { title, body, via })
  function askSheet(anchor, o) {
    closeMenus();
    const m = document.createElement('div'); m.className = 'fx-pop fx-ask'; m.id = 'fx-ask'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Ask Flint');
    m.innerHTML = `<div class="fx-pop-h"><span class="fx-eyebrow">${icon('spark', 12)} Ask Flint</span><b>What should Flint make?</b></div>
      <form class="fx-ask-f" id="fx-ask-f"><input class="input" id="fx-ask-in" placeholder="e.g. slides about our game, a budget sheet, a launch plan" autocomplete="off" aria-label="What should Flint make?">
        <div class="fx-ask-row"><select class="input" id="fx-ask-kind" aria-label="Kind"><option value="">Pick for me</option><option value="doc">Doc</option><option value="sheet">Sheet</option><option value="slides">Slides</option><option value="site">Website</option></select>
        <button class="btn primary" id="fx-ask-go" type="submit">Make it</button></div></form>
      <p class="fx-pop-note" id="fx-ask-note">${o.aiNote || 'Uses your own AI when it is connected. Without one, Flint writes a basic first draft.'} <button class="linkish" type="button" id="fx-ask-more">More AI</button></p>`;
    document.body.appendChild(m); place(m, anchor); outside(m, anchor);
    const inp = m.querySelector('#fx-ask-in'); inp.focus();
    m.querySelector('#fx-ask-more').onclick = async () => {
      const AB = window.TribeAIBasics, on = AB && AB.online ? await AB.online().catch(() => null) : null;
      if (on && on.online) return toast(`Flint is using ${on.via || 'your AI'}.`);
      m.remove(); if (window.TribePremium) window.TribePremium.gate('credits', { need: 'cloud' });
    };
    m.querySelector('#fx-ask-f').onsubmit = async e => {
      e.preventDefault(); const ask = inp.value.trim(); if (!ask) return inp.focus();
      const kind = m.querySelector('#fx-ask-kind').value || ASK_KIND(ask), go = m.querySelector('#fx-ask-go');
      go.disabled = true; go.textContent = 'Drafting…';
      const d = await draft(kind, ask); m.remove();
      o.make(kind, d);
      toast(d.via === 'basic' ? 'Flint wrote a basic first draft. Connect your AI for a fuller one.' : `Drafted with ${d.via}.`);
    };
  }

  // ---------- thumbnails: a real preview of what is inside ----------
  const strip = t => String(t || '').replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>]+/g, '').replace(/^#+\s*/, '').trim();
  const thumb = {
    // a page with the title and the first lines (headings bold, bullets as bullets); a blank page shows ruled lines
    text(title, body, img) {
      const lines = String(body || '').split('\n').filter(l => l.trim() && !/^\s*<!--/.test(l)).slice(0, 12);
      const html = lines.map(l => /^#{1,3}\s/.test(l) ? `<b>${esc(strip(l))}</b>` : /^\s*([-*]|\d+\.)\s/.test(l) ? `<i>• ${esc(strip(l.replace(/^\s*([-*]|\d+\.)\s(\[.\]\s)?/, '')))}</i>` : `<i>${esc(strip(l))}</i>`).join('');
      return `<div class="fg-th fg-th-page fx-th-page"><div class="fg-paper"><b class="fg-pt">${esc(title || 'Untitled')}</b>${html || '<span class="fx-rule"></span><span class="fx-rule"></span><span class="fx-rule s"></span>'}${img ? `<img class="fg-pic" alt="" loading="lazy" src="${esc(img)}">` : ''}</div></div>`;
    },
    // the first rows of a Markdown table, formulas worked out when sheet.js is here
    sheet(body) {
      let rows;
      if (window.TribeSheet && window.TribeSheet.parse) { try { const S = window.TribeSheet, g = S.parse(body || '').grid.slice(0, 7), at = S.evaluate(g); rows = g.map((r, i) => [0, 1, 2, 3].map(c => at(i, c))); } catch {} }
      if (!rows) rows = String(body || '').split('\n').filter(l => /^\s*\|/.test(l) && !/^\s*\|\s*-/.test(l)).slice(0, 7).map(l => l.replace(/^\s*\||\|\s*$/g, '').split('|').map(c => c.trim()).slice(0, 4));
      if (!rows.length) rows = [['A', 'B', 'C', 'D']];
      while (rows.length < 6) rows.push(['', '', '', '']);
      const cells = rows.map((r, i) => [0, 1, 2, 3].map(c => `<span class="${i === 0 ? 'h' : ''}">${esc(r[c] == null ? '' : r[c])}</span>`).join('')).join('');
      return `<div class="fg-th fg-th-sheet">${cells}</div>`;
    },
    deck(body, title) {
      if (window.TribeDeck) { try { const D = window.TribeDeck, k = D.parse(body || ''), MDr = window.TribeMD; return `<div class="fg-th fg-th-deck"><section class="sd th-${esc(k.theme)}"><div class="sd-in md">${MDr ? MDr.render(k.slides[0].md) : esc(k.slides[0].md)}</div></section></div>`; } catch {} }
      const first = String(body || '').split(/\n-{3,}\n/)[0];
      return `<div class="fg-th fx-th-slide"><div><b>${esc(strip((first.match(/^#\s+(.+)$/m) || [])[1] || title || 'Slides'))}</b><i>${esc(strip(first.replace(/^#.*$/m, '')).slice(0, 80))}</i></div></div>`;
    },
    img(src, attr = '') { return `<div class="fg-th fg-th-img"><img alt="" loading="lazy" ${src ? `src="${esc(src)}"` : ''} ${attr}></div>`; },
    code(text, name) {
      const t = String(text || '').replace(/^\s*```[^\n]*\n?/, '').replace(/\n?```[\s\S]*$/, '').split('\n').slice(0, 14).join('\n');
      return `<div class="fg-th fg-th-code"><pre>${t ? esc(t) : `<span class="fx-dim">// ${esc(name || 'empty file')}</span>`}</pre></div>`;
    },
    // a website: the page itself, scaled down in a sandboxed frame (no scripts), under a tiny browser bar
    site(html, title) {
      if (html) return `<div class="fg-th fx-th-site"><span class="fx-bar"><i></i><i></i><i></i></span><iframe sandbox="allow-same-origin" tabindex="-1" aria-hidden="true" loading="lazy" srcdoc="${esc(html)}"></iframe></div>`;
      return `<div class="fg-th fx-th-site"><span class="fx-bar"><i></i><i></i><i></i></span><div class="fx-site-mock"><b>${esc(title || 'Website')}</b><span></span><span class="s"></span><em></em></div></div>`;
    },
    // a design canvas: its top-level frames and shapes as a flat SVG
    design(nodes) {
      const ns = Object.values(nodes || {}).filter(n => n && !n.del && !n.p && Number.isFinite(+n.w) && Number.isFinite(+n.h));
      if (!ns.length) return `<div class="fg-th fx-th-canvas"><span class="fx-grid-bg"></span></div>`;
      const kids = Object.values(nodes || {}).filter(n => n && !n.del && n.p && Number.isFinite(+n.x) && Number.isFinite(+n.w));
      const x0 = Math.min(...ns.map(n => +n.x || 0)), y0 = Math.min(...ns.map(n => +n.y || 0)), x1 = Math.max(...ns.map(n => (+n.x || 0) + +n.w)), y1 = Math.max(...ns.map(n => (+n.y || 0) + +n.h));
      const pad = Math.max(x1 - x0, y1 - y0) * 0.06, vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
      const col = c => /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : 'none';
      const shape = (n, ox = 0, oy = 0) => n.t === 'ellipse' ? `<ellipse cx="${ox + (+n.x || 0) + n.w / 2}" cy="${oy + (+n.y || 0) + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" fill="${col(n.fill)}"/>`
        : n.t === 'text' ? `<rect x="${ox + (+n.x || 0)}" y="${oy + (+n.y || 0) + n.h * 0.3}" width="${Math.min(n.w, 400)}" height="${Math.max(2, n.h * 0.4)}" rx="2" class="fx-sv-t"/>`
        : `<rect x="${ox + (+n.x || 0)}" y="${oy + (+n.y || 0)}" width="${n.w}" height="${n.h}" rx="${Math.min(+n.r || 0, n.w / 2)}" fill="${col(n.fill)}" class="${n.fill ? '' : 'fx-sv-o'}" stroke-width="${Math.max(1, (x1 - x0) / 300)}"/>`;
      const byId = Object.fromEntries(ns.map(n => [n.id, n]));
      const inner = kids.filter(k => byId[k.p] && !byId[k.p].lay).slice(0, 80).map(k => shape(k, +byId[k.p].x || 0, +byId[k.p].y || 0)).join('');
      return `<div class="fg-th fx-th-canvas"><svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${ns.slice(0, 40).map(n => shape(n)).join('')}${inner}</svg></div>`;
    },
    // a whiteboard: its strokes, shapes and stickies as a flat SVG
    board(elements) {
      const es = Object.values(elements || {}).filter(e => e && !e.del).slice(0, 200);
      if (!es.length) return `<div class="fg-th fx-th-board"><span class="fx-grid-bg dots"></span></div>`;
      const box = e => { if (e.pts && e.pts.length) { const xs = e.pts.map(p => p[0]), ys = e.pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; } const x = +e.x || 0, y = +e.y || 0; return [Math.min(x, x + (+e.w || 0)), Math.min(y, y + (+e.h || 0)), Math.max(x, x + (+e.w || 0)), Math.max(y, y + (+e.h || 0))]; };
      const bs = es.map(box), x0 = Math.min(...bs.map(b => b[0])), y0 = Math.min(...bs.map(b => b[1])), x1 = Math.max(...bs.map(b => b[2])), y1 = Math.max(...bs.map(b => b[3]));
      const span = Math.max(40, x1 - x0, y1 - y0), pad = span * 0.08, sw = span / 120;
      const col = c => /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : 'currentColor';
      const out = es.map(e => e.pts ? `<polyline points="${e.pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${col(e.color || e.stroke)}" stroke-width="${Math.max(sw, +e.sw || 2)}" stroke-linecap="round" stroke-linejoin="round"/>`
        : e.type === 'ellipse' ? `<ellipse cx="${(+e.x || 0) + (+e.w || 0) / 2}" cy="${(+e.y || 0) + (+e.h || 0) / 2}" rx="${Math.abs(+e.w || 0) / 2}" ry="${Math.abs(+e.h || 0) / 2}" fill="none" stroke="${col(e.color || e.stroke)}" stroke-width="${sw * 1.5}"/>`
        : `<rect x="${box(e)[0]}" y="${box(e)[1]}" width="${Math.abs(+e.w || 10)}" height="${Math.abs(+e.h || 10)}" rx="${sw * 2}" fill="${e.type === 'sticky' || e.type === 'note' ? (/^#[0-9a-f]{3,8}$/i.test(e.fill || '') ? e.fill : 'currentColor') : 'none'}" stroke="${col(e.color || e.stroke)}" stroke-width="${sw * 1.5}"/>`).join('');
      return `<div class="fg-th fx-th-board"><svg viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${out}</svg></div>`;
    },
    // anything else: a calm tile with the kind's icon and a label (PDF · 1.2 MB)
    icon(cat, label) { return `<div class="fg-th fx-th-icon k-${esc(cat)}">${icon(cat, 30)}${label ? `<small>${esc(label)}</small>` : ''}</div>`; },
  };

  // ---------- the component ----------
  // opts: { scope: 'home'|'project', title, idp ('dc'|'fg'), ids: { search, grid, create, menu }, cardClass, prefs,
  //   where(): [{ key, label }] | null, studio: { kinds?, ids?, note }, create(k, anchor), make(kind, draft),
  //   open(it), act(action, it, anchor), top(): html, after(): html, wire(root), drop(files), loading }
  // item: { id, cat, type, title, at, owner: { name, color }, loc: { key, label, device }, mine, thumb, attrs, cls, text, acts: [] }
  function mount(root, o) {
    const pfx = o.prefs || 'tribecode.files';
    const st = {
      q: o.q || '', items: [], loading: !!o.loading,
      view: lsGet(pfx + '.view', 'grid'), sort: lsGet(pfx + '.sort', 'updated'),
      cat: (k => (CATS.some(c => c[0] === k) ? k : 'all'))(LEGACY[lsGet(pfx + '.kind', 'all')] || lsGet(pfx + '.kind', 'all')),
      where: lsGet(pfx + '.where', o.defaultWhere || 'mine'),
    };
    if (o.fixedCat) st.cat = o.fixedCat;
    const ids = Object.assign({ search: o.idp + '-q', grid: o.idp + '-items', create: o.idp + '-new', menu: o.idp + '-newmenu' }, o.ids || {});
    const whereList = () => (o.where ? o.where() : null);
    if (whereList() && !whereList().some(w => w.key === st.where)) st.where = o.defaultWhere || 'mine';
    root.innerHTML = `<div class="fx fx-${o.scope} dc-${o.scope}" data-scope="${o.scope}">
      <header class="fx-head">
        <div class="fx-title">${o.crumb || `<span class="fx-eyebrow">${esc(o.eyebrow || (o.scope === 'home' ? 'Your files' : 'This project'))}</span>`}<${o.h || 'h1'} id="${o.idp}-title">${esc(o.title || 'Files')}</${o.h || 'h1'}><span class="fx-count" id="${o.idp}-count"></span></div>
        <button class="btn primary fx-create" id="${ids.create}" type="button" aria-haspopup="menu">${icon('plus', 15)}<span>Create</span></button>
      </header>
      <div class="fx-tools dc-bar">
          <label class="fx-search">${icon('search', 16)}<input id="${ids.search}" type="search" placeholder="Search files" autocomplete="off" aria-label="Search files"></label>
          ${whereList() ? `<label class="fx-where-l">${icon('tribe', 14)}<span class="fx-sr">Where</span><select class="fx-where" id="${o.idp}-where" aria-label="Where">${whereList().map(w => `<option value="${esc(w.key)}">${esc(w.label)}</option>`).join('')}</select></label>` : ''}
          <button class="fx-btn fx-sort" id="${o.idp}-sort" type="button" title="Sort">${icon('sort', 15)}<span>${st.sort === 'name' ? 'Name A–Z' : 'Last updated'}</span></button>
          <div class="fx-seg" role="group" aria-label="View"><button type="button" data-dv="grid" aria-label="Grid" title="Grid">${icon('grid', 16)}</button><button type="button" data-dv="list" aria-label="List" title="List">${icon('list', 16)}</button></div>
      </div>
      ${o.fixedCat ? '' : `<nav class="fx-tabs dc-chips" role="tablist" aria-label="Kinds of files">${CATS.map(([k, l, ic]) => `<button type="button" role="tab" data-dk="${k}" id="${o.idp}-tab-${k}"><span class="fx-tab-ic">${icon(ic, 14)}</span><span class="fx-tl">${l}</span><span class="fx-tn" data-n="${k}"></span></button>`).join('')}</nav>`}
      <div class="fx-top" id="${o.idp}-top">${o.top ? o.top() : ''}</div>
      <div class="fx-body" id="${ids.grid}"></div>
      <div class="fx-after" id="${o.idp}-after"></div>
      <div class="dc-drop fx-drop" id="${o.idp}-drop" aria-hidden="true"><span>${icon('upload', 28)}<b>Drop to add to your files</b></span></div>
    </div>`;
    const $ = s => root.querySelector(s);
    const grid = $('#' + CSS.escape(ids.grid));
    const inp = $('#' + CSS.escape(ids.search)); inp.value = st.q;
    let qT = null; inp.oninput = () => { clearTimeout(qT); qT = setTimeout(() => { st.q = inp.value.trim(); if (o.search) o.search(st.q); draw(); }, 150); };
    const wsel = $(`#${o.idp}-where`); if (wsel) { wsel.value = st.where; wsel.onchange = () => { st.where = wsel.value; lsSet(pfx + '.where', st.where); draw(); }; }
    $(`#${o.idp}-sort`).onclick = e => { st.sort = st.sort === 'name' ? 'updated' : 'name'; lsSet(pfx + '.sort', st.sort); e.currentTarget.querySelector('span').textContent = st.sort === 'name' ? 'Name A–Z' : 'Last updated'; draw(); };
    const paintView = () => { root.querySelectorAll('[data-dv]').forEach(b => { const on = b.dataset.dv === st.view; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); root.querySelectorAll('.fx-items').forEach(g => { g.classList.toggle('grid', st.view === 'grid'); g.classList.toggle('list', st.view === 'list'); }); };
    root.querySelectorAll('[data-dv]').forEach(b => b.onclick = () => { st.view = b.dataset.dv; lsSet(pfx + '.view', st.view); paintView(); });
    const paintTabs = () => root.querySelectorAll('[data-dk]').forEach(b => { const on = b.dataset.dk === st.cat; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    root.querySelectorAll('[data-dk]').forEach(b => b.onclick = () => { st.cat = b.dataset.dk; lsSet(pfx + '.kind', st.cat); paintTabs(); draw(); });
    if ($('.fx-tabs')) $('.fx-tabs').addEventListener('keydown', e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; const bs = [...root.querySelectorAll('[data-dk]')], i = bs.findIndex(b => b.dataset.dk === st.cat), n = bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length]; n.click(); n.focus(); });
    $('#' + CSS.escape(ids.create)).onclick = e => openStudio(e.currentTarget);
    function openStudio(anchor) { studio(anchor, { id: ids.menu, kinds: o.studio && o.studio.kinds, ids: o.studio && o.studio.ids, extra: o.studio && o.studio.extra, note: o.studio && o.studio.note, create: (k, a) => (k === 'flint' && o.make ? askSheet(a, { make: o.make, aiNote: o.studio && o.studio.aiNote }) : o.create(k, a)) }); }
    // drop files from the computer
    if (o.drop) {
      const box = $('.fx'), drop = $(`#${o.idp}-drop`); let n = 0;
      const has = e => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files');
      box.addEventListener('dragenter', e => { if (!has(e)) return; e.preventDefault(); n++; drop.classList.add('on'); });
      box.addEventListener('dragover', e => { if (has(e)) e.preventDefault(); });
      box.addEventListener('dragleave', () => { if (--n <= 0) { n = 0; drop.classList.remove('on'); } });
      box.addEventListener('drop', e => { if (!has(e)) return; e.preventDefault(); n = 0; drop.classList.remove('on'); o.drop([...e.dataTransfer.files]); });
    }

    // which items show: search, then Where, then the tab
    function visible() {
      const q = st.q.toLowerCase(), w = whereList() ? st.where : 'all';
      return st.items.filter(it => (!q || `${it.title} ${it.text || ''} ${it.loc ? it.loc.label : ''}`.toLowerCase().includes(q))
        && (w === 'all' || (w === 'mine' ? (it.mine || (it.loc && it.loc.device)) : it.loc && it.loc.key === w)));
    }
    const sorter = (a, b) => st.sort === 'name' ? String(a.title).localeCompare(String(b.title)) : (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0);
    function card(it, i) {
      const av = it.owner && it.owner.name ? `<span class="fx-av" style="background:${esc(it.owner.color || 'var(--peer)')}" title="${esc(it.owner.name)}">${esc(([...it.owner.name][0] || '?').toUpperCase())}</span>` : '';
      const loc = it.loc ? `<span class="fx-loc${it.loc.device ? ' dev' : ''}" title="${esc(it.loc.label)}">${icon(it.loc.device ? 'device' : 'tribe', 12)}<span>${esc(it.loc.label)}</span></span>` : '';
      return `<div class="fx-card ${o.cardClass || ''} ${esc(it.cls || '')}" role="button" tabindex="0" data-fx="${i}" data-cat="${esc(it.cat)}" title="${esc(it.title)}" ${it.attrs || ''}>
        <div class="fx-th">${it.thumb || thumb.icon(it.cat)}${loc}</div>
        <div class="fx-meta-b">
          <div class="fx-r1"><span class="fx-kic k-${esc(it.cat)}" title="${esc(it.type || '')}">${icon(it.cat === 'designs' && it.type === 'Whiteboard' ? 'whiteboard' : it.cat, 15)}</span><b class="fx-name">${esc(it.title || 'Untitled')}</b>
            <button type="button" class="fx-more" data-more="${i}" aria-haspopup="menu" aria-label="More for ${esc(it.title)}" title="More">${icon('more', 16)}</button></div>
          <div class="fx-r2">${av}<span class="fx-t">${esc(it.type || '')}${it.at ? ` · ${esc(ago(it.at))}` : ''}</span></div>
        </div></div>`;
    }
    let shown = [];
    function groups(list) {
      if (o.groups) return o.groups(list, st.where);
      const by = new Map();
      for (const it of list) { const k = it.loc ? it.loc.key : 'here'; if (!by.has(k)) by.set(k, { key: k, label: it.loc ? it.loc.label : '', device: it.loc && it.loc.device, items: [] }); by.get(k).items.push(it); }
      return [...by.values()].sort((a, b) => (b.device ? 1 : 0) - (a.device ? 1 : 0));
    }
    // "All" with nothing in it: inside a project (or a tribe picked in Where) what you make is shared; on Home it is yours
    function emptyWhere() {
      const w = whereList() ? st.where : '';
      if (o.scope === 'project') return 'Make a note, a doc, a sheet or a design. Everyone in this project can open it.';
      if (w && w !== 'mine' && w !== 'all') return 'Nothing from this tribe yet. Make something here, or move a file in with ⋯ › Move to….';
      return EMPTY.all[1];
    }
    function draw() {
      const vis = visible(), counts = {};
      for (const it of vis) counts[it.cat] = (counts[it.cat] || 0) + 1;
      root.querySelectorAll('[data-n]').forEach(s => { const n = s.dataset.n === 'all' ? vis.length : counts[s.dataset.n] || 0; s.textContent = n ? String(n) : ''; });
      const list = vis.filter(it => st.cat === 'all' || it.cat === st.cat).sort(sorter);
      const cnt = $(`#${o.idp}-count`); if (cnt) cnt.textContent = st.loading && !st.items.length ? '' : `${list.length} file${list.length === 1 ? '' : 's'}`;
      shown = [];
      const body = grid;
      if (!list.length) {
        let [t, s, k, a] = st.q ? ['Nothing matches that', 'Try another word, or look in Everything.', '', ''] : EMPTY[st.cat] || EMPTY.all;
        if (!st.q && s === EMPTY.all[1]) s = emptyWhere();   // fix/batch-fixes: the wording fits where you are
        body.innerHTML = `${st.loading ? '<div class="fx-empty dc-empty fg-empty"><span class="fx-spin"></span><b>Gathering your files…</b></div>'
          : window.TribeUI.emptyHTML({ kind: 'files', cls: 'fg-empty', center: true, id: `${o.idp}-empty`, icon: icon(CATS.find(c => c[0] === st.cat)[2], 22), title: t, line: s, action: k ? { label: a, attr: `data-empty-new="${k}"` } : null })}`;
        const eb = body.querySelector('[data-empty-new]'); if (eb) eb.onclick = e => o.create(eb.dataset.emptyNew, e.currentTarget);
      } else {
        const gs = groups(list), one = gs.length === 1 && !o.alwaysHeads;
        body.innerHTML = gs.map(g => {
          const cards = g.items.map(it => { shown.push(it); return card(it, shown.length - 1); }).join('');
          return `<section class="fx-group" data-group="${esc(g.key)}">${one ? '' : `<header class="fx-gh"><span class="fx-gh-ic">${icon(g.icon || (g.device ? 'device' : 'tribe'), 14)}</span><h2>${esc(g.label)}</h2><span class="fx-gh-n">${g.items.length}</span>${g.note ? `<span class="fx-gh-note">${esc(g.note)}</span>` : ''}</header>`}
            <div class="fx-items dc-items ${st.view}">${cards}</div></section>`;
        }).join('');
      }
      paintView();
      body.querySelectorAll('.fx-card').forEach(el => {
        const it = shown[+el.dataset.fx];
        el.onclick = e => { if (e.target.closest('.fx-more, [data-mv]')) return; o.open(it, el); };
        el.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); o.open(it, el); } };
      });
      body.querySelectorAll('[data-more]').forEach(b => b.onclick = e => { e.stopPropagation(); more(b, shown[+b.dataset.more]); });
      if (o.wire) o.wire(body, shown);
    }
    const ACT = [['open', 'Open', 'open'], ['rename', 'Rename', 'rename'], ['move', 'Move to…', 'move'], ['duplicate', 'Duplicate', 'duplicate'], ['download', 'Download', 'download'], ['delete', 'Delete', 'delete']];
    function more(anchor, it) {
      const was = document.getElementById('fx-more-menu'); closeMenus(); if (was && was._for === it) return;
      const acts = it.acts || ['open'];
      const m = document.createElement('div'); m.className = 'fx-pop fx-menu'; m.id = 'fx-more-menu'; m._for = it; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', it.title);
      m.innerHTML = ACT.filter(([k]) => acts.includes(k)).map(([k, l, ic]) => `${k === 'delete' ? '<hr>' : ''}<button type="button" role="menuitem" data-act="${k}" class="${k === 'delete' ? 'danger' : ''}">${icon(ic, 15)}<span>${k === 'download' && it.exportLabel ? esc(it.exportLabel) : l}</span></button>`).join('');
      document.body.appendChild(m); place(m, anchor); outside(m, anchor);
      m.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { m.remove(); const k = b.dataset.act; if (k === 'open') return o.open(it); if (k === 'rename') return rename(it); if (k === 'delete') return remove(it, anchor); o.act(k, it, anchor); });
      const f = m.querySelector('button'); if (f) f.focus({ preventScroll: true });
    }
    // rename in place: the card's name becomes an input
    function rename(it) {
      const el = [...root.querySelectorAll('.fx-card')].find(c => shown[+c.dataset.fx] === it), nm = el && el.querySelector('.fx-name');
      if (!nm) { const t = prompt('New name', it.title); if (t && t.trim()) o.act('rename', it, null, t.trim()); return; }
      const inp = document.createElement('input'); inp.className = 'fx-rename'; inp.id = 'fx-rename'; inp.value = it.title; inp.maxLength = 120; inp.setAttribute('aria-label', 'New name');
      nm.replaceWith(inp); inp.focus(); inp.select();
      let done = false;
      const finish = ok => { if (done) return; done = true; const t = inp.value.trim(); if (ok && t && t !== it.title) { it.title = t; o.act('rename', it, null, t); } draw(); };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
      inp.onclick = e => e.stopPropagation(); inp.onblur = () => finish(true);
    }
    // delete asks once, in the menu's place
    function remove(it, anchor) {
      const m = document.createElement('div'); m.className = 'fx-pop fx-menu fx-confirm'; m.id = 'fx-confirm'; m.setAttribute('role', 'alertdialog'); m.setAttribute('aria-label', 'Delete');
      m.innerHTML = `<p>Delete <b>${esc(it.title)}</b>${it.loc && it.loc.device ? ' from this device' : ''}? This can’t be undone.</p><div class="fx-confirm-a"><button class="btn sm" type="button" data-no>Keep it</button><button class="btn sm fx-danger" type="button" data-yes id="fx-confirm-yes">Delete</button></div>`;
      document.body.appendChild(m); place(m, anchor && anchor.isConnected ? anchor : root); outside(m, anchor);
      m.querySelector('[data-no]').onclick = () => m.remove();
      m.querySelector('[data-yes]').onclick = async () => { m.remove(); try { await o.act('delete', it, anchor); st.items = st.items.filter(x => x !== it); draw(); } catch (e) { toast(e.message); } };
      m.querySelector('[data-yes]').focus();
    }
    paintTabs(); paintView(); draw();
    if (o.after) $(`#${o.idp}-after`).innerHTML = o.after();
    return {
      draw, studio: openStudio,
      set(items, loading = false) { st.items = items || []; st.loading = loading; draw(); },
      setTop(html) { const t = $(`#${o.idp}-top`); if (t) t.innerHTML = html; },
      setAfter(html) { const t = $(`#${o.idp}-after`); if (t) t.innerHTML = html; },
      state: () => ({ q: st.q, cat: st.cat, where: st.where, view: st.view, sort: st.sort, n: st.items.length }),
      setCat(k) { if (CATS.some(c => c[0] === k)) { st.cat = k; lsSet(pfx + '.kind', k); paintTabs(); draw(); } },
      setWhere(k) { st.where = k; lsSet(pfx + '.where', k); if (wsel) wsel.value = k; draw(); },
    };
  }

  window.TribeFilesView = { mount, icon, thumb, CATS, STUDIO, studio, draft, basicDraft, siteHtml, closeMenus, ago };
})();
