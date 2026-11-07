// Notion-lite extras for Docs (server: server/docsx.js). docs.js calls these hooks:
//   renderList(el, list, ctx)   pinned docs on top, then a nested tree (parent in front-matter) with collapse arrows
//   afterEditor(pane, cur, mode) breadcrumbs, toolbar (comment, history, pin, pop out, more), backlinks, comment margin
//   afterRead(el, cur)          [[Page]] links, [[task: Title]] chips, @mentions, comment highlights, select-to-comment
//   onInput / onKey             [[ and @ autocomplete in Write mode
//   slash(key, …)               /template, /link, /mention
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient, F = window.TribeFloat, MD = window.TribeMD, esc = MD.esc;
  const D = () => window.TribeDocs;
  const toast = t => window.TribeApp && window.TribeApp.toast(t);
  const meId = () => (C.state().me || {}).id;
  const member = id => (C.state().members || []).find(m => m.id === id);
  const nameOf = id => (member(id) || {}).name || 'someone';
  const people = () => (C.state().members || []).filter(m => m.role !== 'agent');
  const fg = c => { const n = parseInt(String(c || '#888888').slice(1), 16); return ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114) > 150 ? '#12151A' : '#FFFFFF'; };
  const ini = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const av = (id, size = 20) => { const m = member(id) || { name: '?', color: '#64748B' }; return `<span class="dx-av" style="width:${size}px;height:${size}px;background:${esc(m.color)};color:${fg(m.color)}">${esc(ini(m.name))}</span>`; };
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const when = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const slugOf = title => { const l = String(title).trim().toLowerCase(); const ds = (D() && D().list()) || []; const d = ds.find(x => x.title.toLowerCase() === l) || ds.find(x => x.slug === l); return d ? d.slug : null; };
  const TKEY = 'tribecode.docTree';
  const collapsed = new Set((() => { try { return JSON.parse(localStorage.getItem(TKEY) || '[]'); } catch { return []; } })());
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  let threads = [], threadsFor = null, showResolved = false, composing = null, marginOpen = false, focusThread = null;

  // ================= docs list: pins + tree, and sidebar pins =================
  function renderList(el, list, { filter, cur, open, nameOf: who, ago: rel }) {
    const f = (filter || '').toLowerCase();
    const item = (d, depth, kids) => `<div class="doc-row" style="--depth:${depth}">
        ${kids ? `<button class="dx-caret ${collapsed.has(d.slug) ? '' : 'open'}" data-caret="${esc(d.slug)}" aria-label="${collapsed.has(d.slug) ? 'Expand' : 'Collapse'}"><svg viewBox="0 0 10 10"><path d="M3 2l4 3-4 3z"/></svg></button>` : '<span class="dx-caret-sp"></span>'}
        <button class="doc-item ${cur && cur.slug === d.slug ? 'on' : ''}" data-slug="${esc(d.slug)}"><span class="t">${d.pinned ? '<svg class="i dx-pin-i"><use href="#i-pin"/></svg>' : ''}${esc(d.title)}</span><span class="m">${rel(d.updated)}${d.updatedBy ? ' · ' + esc(who(d.updatedBy)) : ''}</span></button></div>`;
    let html = '';
    if (f) {
      const hits = list.filter(d => d.title.toLowerCase().includes(f));
      html = hits.map(d => item(d, 0, false)).join('') || '<div class="faint" style="padding:12px;font-size:13px">No matches</div>';
    } else if (!list.length) html = '<div class="faint" style="padding:12px;font-size:13px">No docs yet. Create one or drop files here.</div>';
    else {
      const bySlug = new Map(list.map(d => [d.slug, d])), kids = new Map();
      for (const d of list) if (d.parent && bySlug.has(d.parent) && d.parent !== d.slug) { if (!kids.has(d.parent)) kids.set(d.parent, []); kids.get(d.parent).push(d); }
      const pinned = list.filter(d => d.pinned);
      if (pinned.length) html += `<div class="dx-sec">Pinned</div>${pinned.map(d => item(d, 0, false)).join('')}<div class="dx-sec">Pages</div>`;
      const seen = new Set();
      const walk = (d, depth) => {
        if (seen.has(d.slug)) return ''; seen.add(d.slug);
        const ch = (kids.get(d.slug) || []).slice().sort((a, b) => a.title.localeCompare(b.title));
        return item(d, depth, ch.length) + (ch.length && !collapsed.has(d.slug) ? ch.map(c => walk(c, depth + 1)).join('') : '');
      };
      html += list.filter(d => !d.parent || !bySlug.has(d.parent)).map(d => walk(d, 0)).join('');
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-slug]').forEach(b => b.onclick = () => open(b.dataset.slug));
    el.querySelectorAll('[data-caret]').forEach(b => b.onclick = e => { e.stopPropagation(); const s = b.dataset.caret; collapsed.has(s) ? collapsed.delete(s) : collapsed.add(s); try { localStorage.setItem(TKEY, JSON.stringify([...collapsed])); } catch {} renderList(el, list, { filter, cur, open, nameOf: who, ago: rel }); });
    sidePins(list);
  }
  function sidePins(list) {
    const side = $('.side'); if (!side) return;
    let box = $('#side-pins');
    if (!box) {
      const anchor = [...side.querySelectorAll('h6')].find(h => /huddle/i.test(h.textContent));
      box = document.createElement('div'); box.id = 'side-pins'; box.innerHTML = '<h6>Pinned</h6><div id="side-pins-list"></div>';
      side.insertBefore(box, anchor || null);
    }
    const pins = (list || []).filter(d => d.pinned);
    box.classList.toggle('hidden', !pins.length);
    $('#side-pins-list').innerHTML = pins.map(d => `<button class="item" data-pin-open="${esc(d.slug)}" data-peek="doc:${esc(d.slug)}"><svg class="i" style="width:16px;height:16px"><use href="#i-pin"/></svg><span class="dx-ell">${esc(d.title)}</span></button>`).join('');
    box.querySelectorAll('[data-pin-open]').forEach(b => b.onclick = () => openDoc(b.dataset.pinOpen));
  }
  function openDoc(slug) { window.TribeApp.show('docs'); setTimeout(() => D().open(slug), 60); }
  async function loadPinsEarly() { if (!C.connected()) return; try { sidePins((await C.api('/docs')).docs); } catch {} }

  // ================= editor chrome =================
  function afterEditor(pane, cur, mode) {
    if (!cur) { marginOpen = false; return; }
    if (threadsFor !== cur.slug) { threads = []; threadsFor = cur.slug; composing = null; showResolved = false; focusThread = null; loadThreads(cur.slug); }
    // breadcrumbs
    const list = D().list(), bySlug = new Map(list.map(d => [d.slug, d])), chain = [];
    for (let p = (bySlug.get(cur.slug) || cur).parent, n = 0; p && bySlug.has(p) && n < 20; n++) { chain.unshift(bySlug.get(p)); p = bySlug.get(p).parent; }
    const title = pane.querySelector('#doc-title');
    if (chain.length && title) title.insertAdjacentHTML('beforebegin', `<nav class="doc-crumbs" aria-label="Breadcrumbs">${chain.map(d => `<button data-crumb="${esc(d.slug)}" data-peek="doc:${esc(d.slug)}">${esc(d.title)}</button><span>/</span>`).join('')}<b>${esc(cur.title)}</b></nav>`);
    pane.querySelectorAll('[data-crumb]').forEach(b => b.onclick = () => D().open(b.dataset.crumb));
    // toolbar
    const del = pane.querySelector('#doc-del');
    if (del && C.connected()) {
      const pinned = !!(bySlug.get(cur.slug) || cur).pinned;
      del.insertAdjacentHTML('beforebegin', `<div class="dx-tools">
        <button class="btn ghost dx-tool" id="dx-comment" title="Comment (select text in Read mode)"><svg class="i"><use href="#i-comment"/></svg><span id="dx-ccount"></span></button>
        <button class="btn ghost dx-tool" id="dx-history" title="Page history"><svg class="i"><use href="#i-history"/></svg></button>
        <button class="btn ghost dx-tool ${pinned ? 'on' : ''}" id="dx-pin" title="${pinned ? 'Unpin' : 'Pin to the top'}" aria-pressed="${pinned}"><svg class="i"><use href="#i-pin"/></svg></button>
        <button class="btn ghost dx-tool" id="dx-float" title="Pop out as a floating window"><svg class="i"><use href="#i-popout"/></svg></button>
        <button class="btn ghost dx-tool" id="dx-more" title="More"><svg class="i"><use href="#i-more"/></svg></button></div>`);
      del.style.marginLeft = '0';
      pane.querySelector('#dx-comment').onclick = () => startComment(pane);
      pane.querySelector('#dx-history').onclick = () => history(cur.slug);
      pane.querySelector('#dx-pin').onclick = () => setMeta(cur.slug, { pinned: !pinned }).then(() => toast(pinned ? 'Unpinned' : 'Pinned to the top'));
      pane.querySelector('#dx-float').onclick = () => floatDoc(cur.slug, cur.title);
      pane.querySelector('#dx-more').onclick = e => F.menu(e.currentTarget, [
        { label: 'Move under a page…', icon: 'i-doc', run: () => pickParent(cur, pane.querySelector('#dx-more')) },
        ...((bySlug.get(cur.slug) || cur).parent ? [{ label: 'Move to top level', run: () => setMeta(cur.slug, { parent: null }) }] : []),
        { label: 'New sub-page', icon: 'i-doc', run: () => newDoc({ parent: cur.slug }) },
        { label: 'New doc from template', icon: 'i-template', run: () => templatePicker({ parent: cur.slug }) },
        '-',
        { label: (bySlug.get(cur.slug) || cur).pinned ? 'Unpin' : 'Pin to the top', icon: 'i-pin', run: () => setMeta(cur.slug, { pinned: !(bySlug.get(cur.slug) || cur).pinned }) },
        { label: 'Page history', icon: 'i-history', run: () => history(cur.slug) },
        '-',
        { label: 'Delete doc…', icon: 'i-x', run: () => confirmDelete(cur, pane.querySelector('#dx-more')) },
      ]);
    }
    // backlinks
    pane.insertAdjacentHTML('beforeend', '<section class="doc-backlinks hidden" id="doc-backlinks"></section><aside class="doc-margin hidden" id="doc-margin" aria-label="Comments"></aside>');
    loadBacklinks(cur.slug);
    renderMargin();
  }

  function confirmDelete(cur, anchor) {
    const box = document.createElement('div'); box.className = 'dx-picker';
    box.innerHTML = `<div class="tf-eyebrow">Delete page</div><p class="dx-confirm">Delete “${esc(cur.title)}” for everyone? Its history stays in the tribe folder.</p>
      <div class="cal-qrow"><button class="btn ghost" id="dd-no">Cancel</button><button class="btn dx-danger" id="dd-yes">Delete</button></div>`;
    const p = F.pop(anchor, box);
    box.querySelector('#dd-no').onclick = () => p.close();
    box.querySelector('#dd-yes').onclick = () => { p.close(); const del = $('#doc-del'); if (del) { del.click(); del.click(); } };   // docs.js asks for two clicks
  }
  async function setMeta(slug, patch) {
    try { await C.api(`/docs/${slug}/meta`, { method: 'PATCH', body: patch }); await D().refreshList(); const c = D().current(); if (c && c.slug === slug) rerender(); }
    catch (e) { toast(e.message); }
  }
  const rerender = () => { const c = D().current(); if (c) D().setMode(D().mode()); };

  function pickParent(cur, anchor) {
    const list = D().list(), bySlug = new Map(list.map(d => [d.slug, d]));
    const inside = s => { for (let p = s, n = 0; p && n < 30; n++) { if (p === cur.slug) return true; p = (bySlug.get(p) || {}).parent; } return false; };
    const box = document.createElement('div'); box.className = 'dx-picker';
    box.innerHTML = `<div class="tf-eyebrow">Move “${esc(cur.title)}” under</div><input class="cal-in" placeholder="Search pages" id="pp-q"><div class="dx-pick-list" id="pp-list"></div>`;
    const p = F.pop(anchor, box);
    const draw = () => {
      const q = box.querySelector('#pp-q').value.toLowerCase();
      const opts = list.filter(d => !inside(d.slug) && d.title.toLowerCase().includes(q)).slice(0, 8);
      box.querySelector('#pp-list').innerHTML = opts.map(d => `<button data-pp="${esc(d.slug)}">${esc(d.title)}</button>`).join('') || '<div class="faint" style="padding:6px 8px">No pages</div>';
      box.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => { p.close(); setMeta(cur.slug, { parent: b.dataset.pp }).then(() => toast(`Moved under ${bySlug.get(b.dataset.pp).title}`)); });
    };
    box.querySelector('#pp-q').oninput = draw; draw();
  }

  // ================= templates =================
  let tplCache = null;
  async function templates() { if (!tplCache) { try { tplCache = (await C.api('/templates')).templates; } catch { tplCache = []; } setTimeout(() => { tplCache = null; }, 30000); } return tplCache; }
  const fill = (body, title) => body.replace(/\{\{date\}\}/g, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
    .replace(/\{\{me\}\}/g, (member(meId()) || {}).name || 'me').replace(/\{\{title\}\}/g, title || '');
  async function newDoc({ title = 'Untitled', body = '', parent } = {}) {
    window.TribeApp.show('docs');
    const d = await D().create(title, body);
    if (parent && d && C.connected()) await setMeta(d.slug, { parent });
    return d;
  }
  async function fromTemplate(t, opts = {}) {
    const title = `${t.title} · ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    const d = await newDoc({ title, body: fill(t.body, title), parent: opts.parent });
    toast(`New ${t.title} doc`); return d;
  }
  async function templatePicker(opts = {}) {
    if (!C.connected()) return toast('Templates live in the tribe folder. Connect to a tribe first.');
    const list = await templates();
    const m = document.createElement('div'); m.className = 'modal'; m.id = 'tpl-modal';
    m.innerHTML = `<div class="modal-card dx-tpl"><h2>New doc from template</h2><p class="lead">Templates are Markdown files in <code>templates/</code> in the tribe folder. Add your own there.</p>
      <div class="dx-tpl-grid">${list.map((t, i) => `<button class="dx-tpl-item" data-tpl="${i}"><svg class="i"><use href="#i-template"/></svg><b>${esc(t.title)}</b><span>${esc((t.body.match(/^## (.+)$/m) || [, ''])[1])}${(t.body.match(/^## /gm) || []).length > 1 ? ` · ${(t.body.match(/^## /gm) || []).length} sections` : ''}</span></button>`).join('')}</div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button></div></div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) close(); };
    m.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => { close(); fromTemplate(list[+b.dataset.tpl], opts).catch(e => toast(e.message)); });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const first = m.querySelector('[data-tpl]'); if (first) first.focus();
  }

  // ================= backlinks =================
  async function loadBacklinks(slug) {
    if (!C.connected()) return;
    let bl = []; try { bl = (await C.api(`/docs/${slug}/backlinks`)).backlinks; } catch { return; }
    const box = $('#doc-backlinks'); const c = D().current(); if (!box || !c || c.slug !== slug) return;
    box.classList.toggle('hidden', !bl.length);
    box.innerHTML = `<h6>Linked from <span>${bl.length}</span></h6>${bl.map(b => `<button class="dx-bl" data-bl="${esc(b.slug)}" data-peek="doc:${esc(b.slug)}"><b>${esc(b.title)}</b><span>${MD.inline(b.snippet).replace(/\[\[([^\]]+)\]\]/g, '<mark>$1</mark>')}</span></button>`).join('')}`;
    box.querySelectorAll('[data-bl]').forEach(b => b.onclick = () => D().open(b.dataset.bl));
  }

  // ================= read mode: links, mentions, highlights =================
  function textNodes(root) {
    const out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('code, pre, a, .dx-link, .dx-mention, .dx-task') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let n; while ((n = w.nextNode())) out.push(n); return out;
  }
  function decorate(el) {
    const tasks = (window.TribeTasks && window.TribeTasks.all()) || [];
    const names = people().flatMap(m => [[m.name, m], [m.name.split(/\s+/)[0], m]]).sort((a, b) => b[0].length - a[0].length);
    const nameRe = names.length ? new RegExp(`(^|[^\\w@])@(${names.map(([n]) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w])`, 'gi') : null;
    for (const node of textNodes(el)) {
      const t = node.nodeValue; if (!t.includes('[[') && !t.includes('@')) continue;
      let html = esc(t), changed = false;
      html = html.replace(/\[\[([^\[\]\n]{1,160})\]\]/g, (_, raw) => {
        changed = true; const label = raw.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const tm = label.match(/^task:\s*(.+)$/i);
        if (tm) { const tk = tasks.find(x => x.title.toLowerCase() === tm[1].trim().toLowerCase()); return tk ? `<button class="dx-task ${tk.status === 'done' ? 'done' : ''}" data-peek="task:${esc(tk.id)}" data-task-open="${esc(tk.id)}"><svg class="i"><use href="#i-check"/></svg>${esc(tk.title)}</button>` : `<span class="dx-task missing">${esc(tm[1])}</span>`; }
        const s = slugOf(label);
        return s ? `<a class="dx-link" href="#" data-doc="${esc(s)}" data-peek="doc:${esc(s)}">${esc(label)}</a>` : `<a class="dx-link missing" href="#" data-newdoc="${esc(label)}" title="No page called “${esc(label)}” yet. Click to create it.">${esc(label)}</a>`;
      });
      if (nameRe) html = html.replace(nameRe, (all, pre, n) => { const hit = names.find(([x]) => x.toLowerCase() === n.toLowerCase()); if (!hit) return all; changed = true; return `${pre}<span class="dx-mention" data-peek="person:${esc(hit[1].id)}">@${n}</span>`; });
      if (!changed) continue;
      const span = document.createElement('span'); span.innerHTML = html;
      node.replaceWith(...span.childNodes);
    }
    el.querySelectorAll('[data-doc]').forEach(a => a.onclick = e => { e.preventDefault(); D().open(a.dataset.doc); });
    el.querySelectorAll('[data-newdoc]').forEach(a => a.onclick = e => { e.preventDefault(); const c = D().current(); newDoc({ title: a.dataset.newdoc, parent: c && c.slug }); });
    el.querySelectorAll('[data-task-open]').forEach(a => a.onclick = () => window.TribeApp.show('tasks'));
  }

  // locate a thread's quote in the rendered text; returns [start, end] or null
  function locate(full, t, bodyLen) {
    if (!t.quote) return null;
    const hits = []; let i = -1; while ((i = full.indexOf(t.quote, i + 1)) >= 0) hits.push(i);
    if (!hits.length) { const q = t.quote.replace(/\s+/g, ' ').trim(); const norm = full.replace(/\s+/g, ' '); const j = norm.indexOf(q); if (j < 0) return null; return mapNorm(full, j, q.length); }
    const want = bodyLen ? t.offset / bodyLen * full.length : 0;
    const best = hits.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    return [best, best + t.quote.length];
  }
  function mapNorm(full, j, len) { let k = 0, n = 0, start = -1; for (; k < full.length; k++) { if (n === j && start < 0) start = k; if (!(/\s/.test(full[k]) && /\s/.test(full[k - 1] || ''))) n++; if (start >= 0 && n >= j + len) return [start, k + 1]; } return null; }
  function wrapRange(nodes, s, e, mk) {
    let pos = 0;
    for (const n of nodes) {
      const len = n.nodeValue.length, a = Math.max(s, pos), b = Math.min(e, pos + len);
      if (a < b) {
        let target = n; if (a - pos > 0) target = target.splitText(a - pos);
        if (b - a < target.nodeValue.length) target.splitText(b - a);
        const m = mk(); target.replaceWith(m); m.appendChild(target);
      }
      pos += len;
    }
  }
  function allText(el) {
    const nodes = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) nodes.push(n);
    return { nodes, full: nodes.map(x => x.nodeValue).join('') };
  }
  function highlight(el) {
    const cur = D().current(); if (!cur) return;
    const bodyLen = (cur.body || '').length;
    for (const t of threads) {
      if (t.resolved && !showResolved) continue;
      const { nodes, full } = allText(el);
      const r = locate(full, t, bodyLen); t._orphan = !r; if (!r) continue;
      wrapRange(nodes, r[0], r[1], () => { const m = document.createElement('mark'); m.className = 'cm-hl' + (t.resolved ? ' resolved' : '') + (focusThread === t.id ? ' on' : ''); m.dataset.thread = t.id; return m; });
    }
    el.querySelectorAll('mark.cm-hl').forEach(m => m.onclick = () => { focusThread = m.dataset.thread; marginOpen = true; renderMargin(); markFocus(); });
  }
  function afterRead(el, cur) {
    decorate(el);
    highlight(el);
    el.onmouseup = () => setTimeout(() => selectionButton(el), 0);
    el.ontouchend = () => setTimeout(() => selectionButton(el), 300);
    requestAnimationFrame(() => placeCards());
  }

  // ================= comments =================
  async function loadThreads(slug) {
    if (!C.connected()) return;
    try { const r = await C.api(`/docs/${slug}/comments`); if (threadsFor !== slug) return; threads = r.threads; } catch { return; }
    refreshComments();
  }
  function refreshComments() {
    const read = $('#doc-read'), cur = D().current();
    if (read && cur && D().mode() === 'read' && !read.classList.contains('hidden')) { read.querySelectorAll('mark.cm-hl').forEach(m => m.replaceWith(...m.childNodes)); read.normalize(); highlight(read); }
    renderMargin();
  }
  let selBtn = null;
  function hideSelBtn() { if (selBtn) { selBtn.remove(); selBtn = null; } }
  function selectionButton(el) {
    hideSelBtn();
    const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0); if (!el.contains(range.commonAncestorContainer)) return;
    const quote = sel.toString().replace(/\s+$/, '').slice(0, 500); if (!quote.trim()) return;
    const pre = document.createRange(); pre.setStart(el, 0); pre.setEnd(range.startContainer, range.startOffset);
    const at = pre.toString().length, full = el.textContent;
    const r = range.getBoundingClientRect();
    selBtn = document.createElement('button'); selBtn.className = 'btn primary cm-add'; selBtn.innerHTML = '<svg class="i"><use href="#i-comment"/></svg>Comment';
    selBtn.style.left = Math.min(innerWidth - 120, r.right - 40) + 'px'; selBtn.style.top = (r.bottom + 8) + 'px';
    selBtn.onmousedown = e => e.preventDefault();
    selBtn.onclick = () => { hideSelBtn(); const cur = D().current(); composing = { quote: quote.trim(), offset: Math.round(at / Math.max(1, full.length) * (cur.body || '').length) }; marginOpen = true; renderMargin(); getSelection().removeAllRanges(); };
    document.body.appendChild(selBtn);
  }
  document.addEventListener('pointerdown', e => { if (selBtn && e.target !== selBtn && !selBtn.contains(e.target)) hideSelBtn(); });

  // From the toolbar: in Write mode comment the selection or the current line; in Read mode use the selection.
  function startComment(pane) {
    const cur = D().current(); if (!cur) return;
    const ta = pane.querySelector('#doc-body');
    if (D().mode() === 'write' && ta) {
      let a = ta.selectionStart, b = ta.selectionEnd;
      if (a === b) { a = ta.value.lastIndexOf('\n', a - 1) + 1; b = ta.value.indexOf('\n', a); if (b < 0) b = ta.value.length; }
      const raw = ta.value.slice(a, b);
      const quote = raw.replace(/^\s*(#{1,4}\s+|[-*]\s+\[[ xX]\]\s+|[-*]\s+|\d+[.)]\s+|>\s?)/, '').replace(/\*\*|__|`|~~/g, '').replace(/\[\[([^\]]+)\]\]/g, '$1').trim().slice(0, 500);
      if (!quote) { toast('Put the cursor on a line with text, or select some text, then comment.'); return; }
      composing = { quote, offset: a };
    } else {
      const sel = getSelection();
      if (sel && !sel.isCollapsed && $('#doc-read').contains(sel.anchorNode)) { selectionButton($('#doc-read')); if (selBtn) selBtn.click(); return; }
      marginOpen = !marginOpen || !threads.length ? true : !marginOpen;
      if (!threads.length) toast('Select some text to comment on it.');
    }
    marginOpen = true; renderMargin();
  }

  // @Name in comment text -> mention chip (same look as in the doc)
  const mentionify = html => {
    const names = people().flatMap(m => [[m.name, m], [m.name.split(/\s+/)[0], m]]).sort((a, b) => b[0].length - a[0].length);
    if (!names.length) return html;
    const re = new RegExp(`(^|[^\\w@])@(${names.map(([n]) => esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w])`, 'gi');
    return html.replace(re, (all, pre, n) => { const hit = names.find(([x]) => x.toLowerCase() === n.toLowerCase()); return hit ? `${pre}<span class="dx-mention" data-peek="person:${esc(hit[1].id)}">@${n}</span>` : all; });
  };
  function threadHtml(t) {
    const head = (by, at) => `<div class="cm-head">${av(by)}<b>${esc(nameOf(by))}</b><time title="${esc(when(at))}">${esc(ago(at))}</time></div>`;
    return `<div class="cm-thread ${t.resolved ? 'resolved' : ''} ${focusThread === t.id ? 'on' : ''}" data-tid="${esc(t.id)}">
      <div class="cm-quote ${t._orphan ? 'orphan' : ''}" title="${t._orphan ? 'The quoted text was changed or removed' : ''}">${esc(t.quote || '(whole page)')}</div>
      ${head(t.by, t.at)}<div class="cm-body">${mentionify(MD.inline(t.body))}</div>
      ${t.replies.map(r => `<div class="cm-reply">${head(r.by, r.at)}<div class="cm-body">${mentionify(MD.inline(r.body))}</div></div>`).join('')}
      <div class="cm-foot"><textarea class="cm-in" rows="1" placeholder="Reply…" data-reply="${esc(t.id)}"></textarea>
        <button class="btn ghost cm-res" data-resolve="${esc(t.id)}">${t.resolved ? 'Reopen' : 'Resolve'}</button></div></div>`;
  }
  function renderMargin() {
    const box = $('#doc-margin'), pane = $('#doc-pane'), cur = D().current(); if (!box || !pane || !cur) return;
    const open = threads.filter(t => !t.resolved), resolved = threads.filter(t => t.resolved);
    const cnt = $('#dx-ccount'); if (cnt) cnt.textContent = open.length ? String(open.length) : '';
    const want = composing || open.length || (marginOpen && (threads.length));
    const inline = !isPhone() && pane.clientWidth >= 700;
    const visible = want && (inline || marginOpen || composing);
    pane.classList.toggle('has-margin', !!(want && inline));
    box.classList.toggle('hidden', !visible);
    box.classList.toggle('drawer', !inline && !isPhone());
    box.classList.toggle('sheet', isPhone());
    if (!visible) return;
    const shown = [...open, ...(showResolved ? resolved : [])];
    box.innerHTML = `<div class="cm-top"><h6>Comments <span>${open.length}</span></h6>${resolved.length ? `<button class="linkish" id="cm-showres">${showResolved ? 'Hide' : 'Show'} resolved (${resolved.length})</button>` : ''}${!inline ? '<button class="fwin-btn" id="cm-close" title="Close"><svg class="i"><use href="#i-x"/></svg></button>' : ''}</div>
      ${composing ? `<div class="cm-thread cm-new"><div class="cm-quote">${esc(composing.quote)}</div><textarea class="cm-in" id="cm-new" rows="2" placeholder="Add a comment… @ to mention"></textarea>
        <div class="cm-foot"><button class="btn ghost" id="cm-cancel">Cancel</button><button class="btn primary" id="cm-post">Comment</button></div></div>` : ''}
      <div class="cm-list">${shown.map(threadHtml).join('')}${!shown.length && !composing ? '<div class="faint cm-empty">No open comments. Select text in Read mode to start a thread.</div>' : ''}</div>`;
    const sr = box.querySelector('#cm-showres'); if (sr) sr.onclick = () => { showResolved = !showResolved; refreshComments(); };
    const cl = box.querySelector('#cm-close'); if (cl) cl.onclick = () => { marginOpen = false; composing = null; renderMargin(); };
    if (composing) {
      const ta = box.querySelector('#cm-new'); setTimeout(() => ta.focus(), 0);
      box.querySelector('#cm-cancel').onclick = () => { composing = null; renderMargin(); };
      const post = async () => {
        const text = ta.value.trim(); if (!text) return ta.focus();
        try { const { thread } = await C.api(`/docs/${cur.slug}/comments`, { method: 'POST', body: { ...composing, body: text } }); composing = null; focusThread = thread.id; if (!threads.some(x => x.id === thread.id)) threads.push(thread); refreshComments(); }
        catch (e) { toast(e.message); }
      };
      box.querySelector('#cm-post').onclick = post;
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) { e.preventDefault(); post(); } };
    }
    box.querySelectorAll('[data-reply]').forEach(ta => {
      ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      ta.onkeydown = async e => {
        if (e.key !== 'Enter' || e.shiftKey) return; e.preventDefault();
        const text = ta.value.trim(); if (!text) return;
        try { const { thread } = await C.api(`/docs/${cur.slug}/comments/${ta.dataset.reply}`, { method: 'POST', body: { body: text } }); const i = threads.findIndex(x => x.id === thread.id); if (i >= 0) threads[i] = thread; focusThread = thread.id; refreshComments(); }
        catch (err) { toast(err.message); }
      };
    });
    box.querySelectorAll('[data-resolve]').forEach(b => b.onclick = async () => {
      const t = threads.find(x => x.id === b.dataset.resolve); if (!t) return;
      try { const { thread } = await C.api(`/docs/${cur.slug}/comments/${t.id}`, { method: 'PATCH', body: { resolved: !t.resolved } }); Object.assign(t, thread); refreshComments(); toast(thread.resolved ? 'Resolved' : 'Reopened'); }
      catch (e) { toast(e.message); }
    });
    box.querySelectorAll('.cm-thread[data-tid]').forEach(c => c.addEventListener('click', e => { if (e.target.closest('textarea, button')) return; focusThread = c.dataset.tid; markFocus(); }));
    placeCards();
  }
  function markFocus() {
    document.querySelectorAll('mark.cm-hl').forEach(m => m.classList.toggle('on', m.dataset.thread === focusThread));
    document.querySelectorAll('.cm-thread[data-tid]').forEach(c => c.classList.toggle('on', c.dataset.tid === focusThread));
    const m = document.querySelector(`mark.cm-hl[data-thread="${focusThread}"]`); if (m && D().mode() === 'read') m.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    placeCards();
  }
  // Inline margin in Read mode: line each thread up with its highlight, pushing down to avoid overlaps.
  function placeCards() {
    const box = $('#doc-margin'), pane = $('#doc-pane'); if (!box || box.classList.contains('hidden') || !pane.classList.contains('has-margin')) { if (box) box.querySelectorAll('.cm-thread').forEach(c => { c.style.top = ''; }); if (box) box.classList.remove('placed'); return; }
    const read = $('#doc-read'), reading = read && !read.classList.contains('hidden');
    const cards = [...box.querySelectorAll('.cm-list .cm-thread[data-tid]')];
    if (!reading) { box.classList.remove('placed'); cards.forEach(c => { c.style.top = ''; }); return; }
    box.classList.add('placed');
    const base = box.getBoundingClientRect().top, head = box.querySelector('.cm-top').offsetHeight + (box.querySelector('.cm-new') ? box.querySelector('.cm-new').offsetHeight + 10 : 0);
    let y = head + 6;
    const want = c => { const m = document.querySelector(`mark.cm-hl[data-thread="${c.dataset.tid}"]`); return m ? m.getBoundingClientRect().top - base - 4 : Infinity; };
    cards.map(c => [c, want(c)]).sort((a, b) => a[1] - b[1]).forEach(([c, w]) => { const top = Math.max(y, Number.isFinite(w) ? w : y); c.style.top = top + 'px'; y = top + c.offsetHeight + 10; });
    box.style.minHeight = y + 'px';
  }
  addEventListener('resize', () => { if ($('#doc-margin')) renderMargin(); });

  // ================= page history =================
  function lineDiff(a, b) {
    const A = a.split('\n'), B = b.split('\n');
    if (A.length * B.length > 4e6) return [...A.map(l => ['-', l]), ...B.map(l => ['+', l])];
    const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', A[i++]]); else out.push(['+', B[j++]]); }
    while (i < n) out.push(['-', A[i++]]); while (j < m) out.push(['+', B[j++]]);
    return out;
  }
  async function history(slug) {
    let r; try { r = await C.api(`/docs/${slug}/history`); } catch (e) { return toast(e.message); }
    const m = document.createElement('div'); m.className = 'modal'; m.id = 'history-modal';
    m.innerHTML = `<div class="modal-card dx-hist"><div class="dx-hist-head"><h2>Page history</h2><span class="faint">${r.versions.length} saved version${r.versions.length === 1 ? '' : 's'}</span><button class="fwin-btn" data-close title="Close" style="margin-left:auto"><svg class="i"><use href="#i-x"/></svg></button></div>
      <div class="dx-hist-grid"><div class="dx-hist-list">${r.versions.map((v, i) => `<button class="dx-ver" data-v="${v.version}">${av(v.by, 22)}<span><b>v${v.version}${i === 0 ? ' · current' : ''}</b><small>${esc(nameOf(v.by))} · ${esc(when(v.at))}</small></span><span class="dx-words">${v.words}w</span></button>`).join('')}</div>
      <div class="dx-hist-view" id="hist-view"><div class="faint" style="padding:20px">Pick a version to compare it with the current page.</div></div></div></div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) close(); };
    m.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }); m.tabIndex = -1; m.focus();
    const show = async v => {
      m.querySelectorAll('.dx-ver').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
      const view = m.querySelector('#hist-view'); view.innerHTML = '<div class="faint" style="padding:20px">Loading…</div>';
      let old; try { old = (await C.api(`/docs/${slug}/history/${v}`)).version; } catch (e) { view.textContent = e.message; return; }
      const cur = D().current(), now = cur && cur.slug === slug ? cur.body || '' : ((await C.api('/docs/' + slug)).doc.body || '');
      const diff = lineDiff(old.body, now), adds = diff.filter(x => x[0] === '+').length, dels = diff.filter(x => x[0] === '-').length;
      // Collapse long unchanged stretches so the changes stand out.
      const rows = []; let run = [];
      const flushRun = () => { if (run.length > 6) { rows.push(...run.slice(0, 2), ['…', `${run.length - 4} unchanged lines`], ...run.slice(-2)); } else rows.push(...run); run = []; };
      for (const d of diff) { if (d[0] === ' ') run.push(d); else { flushRun(); rows.push(d); } } flushRun();
      const latest = v === r.versions[0].version && !adds && !dels;
      view.innerHTML = `<div class="dx-hist-bar"><span><b>v${v}</b> → current</span><span class="dx-stat"><span class="add">+${adds}</span> <span class="del">−${dels}</span></span>
          <button class="btn primary" id="hist-restore" ${latest ? 'disabled' : ''}>Restore this version</button></div>
        <pre class="dx-diff">${rows.map(([k, l]) => `<div class="dl ${k === '+' ? 'add' : k === '-' ? 'del' : k === '…' ? 'gap' : ''}"><i>${k === ' ' ? '' : k === '-' ? '−' : k}</i>${esc(l) || ' '}</div>`).join('')}</pre>`;
      view.querySelector('#hist-restore').onclick = async () => {
        try { await C.api(`/docs/${slug}/history/${v}/restore`, { method: 'POST' }); close(); toast(`Restored v${v}`); const c = D().current(); if (c && c.slug === slug && !D().live()) D().open(slug); }
        catch (e) { toast(e.message); }
      };
    };
    m.querySelectorAll('.dx-ver').forEach(b => b.onclick = () => show(+b.dataset.v));
    if (r.versions[1]) show(r.versions[1].version); else if (r.versions[0]) show(r.versions[0].version);
  }

  // ================= autocomplete: [[ and @ =================
  let ac = null;
  function acItems(kind, q) {
    const ql = q.toLowerCase(), docs = D().list(), cur = D().current();
    const pages = docs.filter(d => (!cur || d.slug !== cur.slug) && d.title.toLowerCase().includes(ql)).slice(0, 6).map(d => ({ type: 'page', label: d.title, insert: `[[${d.title}]]` }));
    if (kind === 'link') return [...pages, ...(q.trim() && !docs.some(d => d.title.toLowerCase() === ql) ? [{ type: 'new', label: `New page “${q.trim()}”`, insert: `[[${q.trim()}]]` }] : [])];
    const ppl = people().filter(m => m.name.toLowerCase().includes(ql) || ini(m.name).toLowerCase() === ql).slice(0, 5).map(m => ({ type: 'person', label: m.name, insert: `@${m.name} `, m }));
    const tasks = ((window.TribeTasks && window.TribeTasks.all()) || []).filter(t => t.title.toLowerCase().includes(ql.replace(/^#/, ''))).slice(0, 4).map(t => ({ type: 'task', label: t.title, insert: `[[task: ${t.title}]]` }));
    return q.startsWith('#') ? tasks : [...ppl, ...tasks, ...pages.slice(0, 3)];
  }
  function onInput(ta) {
    const pos = ta.selectionStart, before = ta.value.slice(Math.max(0, pos - 80), pos);
    let m = before.match(/\[\[([^\[\]\n]{0,60})$/), kind = 'link';
    if (!m) { m = before.match(/(?:^|[\s(])@([^\s@\[\]]{0,30}(?: [^\s@\[\]]{1,20})?)$/); kind = 'at'; }
    if (!m || (kind === 'at' && /\s$/.test(m[1]))) return hideAc();
    const q = m[1], items = acItems(kind, q);
    if (!items.length) return hideAc();
    ac = { kind, start: pos - q.length - (kind === 'link' ? 2 : 1), items, sel: ac && ac.kind === kind ? Math.min(ac.sel, items.length - 1) : 0, ta };
    drawAc();
  }
  function drawAc() {
    let el = $('#doc-ac'); const pane = $('#doc-pane'); if (!pane) return;
    if (!el) { el = document.createElement('div'); el.id = 'doc-ac'; el.className = 'slash dx-ac'; el.setAttribute('role', 'listbox'); pane.appendChild(el); }
    const icon = { page: 'i-doc', new: 'i-doc', person: 'i-users', task: 'i-check' };
    el.innerHTML = ac.items.map((it, i) => `<button class="${i === ac.sel ? 'on' : ''}" data-ac="${i}">${it.type === 'person' ? av(it.m.id, 18) : `<svg class="i"><use href="#${icon[it.type]}"/></svg>`}<span>${esc(it.label)}</span><small>${it.type === 'new' ? 'create' : it.type}</small></button>`).join('');
    const xy = D().caretXY(ac.ta, ac.start);
    el.style.left = xy.x + 'px'; el.style.top = (xy.y + 26) + 'px'; el.classList.remove('hidden');
    el.querySelectorAll('[data-ac]').forEach(b => b.onmousedown = e => { e.preventDefault(); ac.sel = +b.dataset.ac; applyAc(); });
  }
  function hideAc() { ac = null; const el = $('#doc-ac'); if (el) el.classList.add('hidden'); }
  function applyAc() {
    const { ta, start, items, sel } = ac, it = items[sel];
    ta.setRangeText(it.insert, start, ta.selectionStart, 'end');
    hideAc(); ta.style.height = 'auto'; ta.style.height = Math.max(320, ta.scrollHeight + 4) + 'px'; D().changed(); ta.focus();
  }
  function onKey(e) {
    if (!ac) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); ac.sel = (ac.sel + 1) % ac.items.length; drawAc(); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); ac.sel = (ac.sel - 1 + ac.items.length) % ac.items.length; drawAc(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyAc(); return true; }
    if (e.key === 'Escape') { e.preventDefault(); hideAc(); return true; }
    return false;
  }
  document.addEventListener('focusout', e => { if (e.target.id === 'doc-body') setTimeout(hideAc, 150); });

  // ================= slash commands =================
  function slash(key, ta, start, end) {
    if (key === 'link' || key === 'mention') {
      ta.setRangeText(key === 'link' ? '[[' : '@', start, end, 'end'); D().changed(); ta.focus(); onInput(ta); return true;
    }
    if (key !== 'template') return false;
    ta.setRangeText('', start, end, 'end'); D().changed();
    templates().then(list => {
      const box = document.createElement('div'); box.className = 'dx-picker';
      box.innerHTML = `<div class="tf-eyebrow">Insert template</div><div class="dx-pick-list">${list.map((t, i) => `<button data-ti="${i}"><svg class="i"><use href="#i-template"/></svg>${esc(t.title)}</button>`).join('')}</div>`;
      const xy = D().caretXY(ta, start), r = ta.getBoundingClientRect();
      const p = F.pop({ left: r.left + xy.x - ta.offsetLeft, top: r.top + xy.y - ta.offsetTop, bottom: r.top + xy.y - ta.offsetTop + 22 }, box);
      box.querySelectorAll('[data-ti]').forEach(b => b.onclick = () => {
        p.close(); const c = D().current();
        ta.setRangeText(fill(list[+b.dataset.ti].body, c && c.title) + '\n', start, start, 'end');
        ta.style.height = 'auto'; ta.style.height = Math.max(320, ta.scrollHeight + 4) + 'px'; D().changed(); ta.focus();
      });
    });
    return true;
  }

  // ================= peeks + floating docs =================
  const docCache = new Map();
  async function fetchDoc(slug, fresh) {
    const c = docCache.get(slug); if (c && !fresh && Date.now() - c.at < 15000) return c.doc;
    const doc = (await C.api('/docs/' + slug)).doc; docCache.set(slug, { at: Date.now(), doc }); return doc;
  }
  F.peek.register('doc', async slug => {
    let d; try { d = await fetchDoc(slug); } catch { return null; }
    const first = (d.body || '').split('\n').map(l => l.replace(/^#+\s*|^[-*]\s+(\[[ xX]\]\s+)?|^>\s*/g, '').trim()).filter(Boolean).slice(0, 2).join(' · ');
    return {
      eyebrow: `<span class="chip peer">doc</span>${d.pinned ? ' <span class="faint">pinned</span>' : ''}`, title: d.title,
      rows: [['Updated', `${esc(ago(d.updated))}${d.updatedBy ? ' · ' + esc(nameOf(d.updatedBy)) : ''}`], ['Size', `${(d.body || '').split(/\s+/).filter(Boolean).length} words · v${d.version}`]],
      body: d.summary ? esc(d.summary.slice(0, 220)) : esc(first.slice(0, 200)),
      actions: [{ label: 'Pop out', run: () => floatDoc(slug, d.title) }, { label: 'Open', primary: true, run: () => openDoc(slug) }],
    };
  });
  function docWin(slug, title) {
    return { title: title || 'Doc', w: 380, h: 460, onOpenFull: () => openDoc(slug), render: body => {
      let alive = true;
      const draw = async fresh => {
        let d; try { d = await fetchDoc(slug, fresh); } catch { body.innerHTML = '<div class="faint" style="padding:14px">This doc is not available.</div>'; return; }
        if (!alive) return;
        const w = F.get('doc:' + slug); if (w) w.setTitle(d.title);
        const keep = body.scrollTop;
        body.innerHTML = `<article class="md fwin-md">${MD.render(d.body || '') || '<p class="faint">Empty doc.</p>'}</article>`;
        decorate(body.querySelector('article')); body.scrollTop = keep;
      };
      draw(true);
      const onDoc = m => { if (alive && ((m.type === 'doc' && m.doc && m.doc.slug === slug) || (m.type === 'doc-meta' && m.slug === slug))) draw(true); if (m.type === 'doc-removed' && m.slug === slug) { const w = F.get('doc:' + slug); if (w) w.close(); } };
      docListeners.add(onDoc);
      return () => { alive = false; docListeners.delete(onDoc); };
    } };
  }
  const docListeners = new Set();
  function floatDoc(slug, title) { F.open({ id: 'doc:' + slug, kind: 'doc', ref: slug, ...docWin(slug, title) }); }
  F.restorer('doc', slug => docWin(slug));

  // ================= live updates =================
  C.on('ws', m => {
    docListeners.forEach(fn => fn(m));
    if (m.type === 'doc-comments') {
      if (m.slug === threadsFor) { threads = m.threads; refreshComments(); }
    }
    if (m.type === 'doc-meta') { docCache.delete(m.slug); if (D() && D().list().length) D().refreshList().then(() => { const c = D().current(); if (c && (c.slug === m.slug || m.parent === c.slug)) rerender(); }); else loadPinsEarly(); }
    if (m.type === 'doc') { docCache.delete(m.doc.slug); const c = D() && D().current(); if (c && c.slug !== m.doc.slug) { clearTimeout(window.__dxbl); window.__dxbl = setTimeout(() => loadBacklinks(c.slug), 600); } }
  });
  C.on('hello', loadPinsEarly);

  // ================= palette =================
  if (window.TribePalette && window.TribePalette.register) {
    let tplNames = [];
    window.TribePalette.register(() => {
      if (!tplNames.length && C.connected() && !tplNames.loading) { tplNames.loading = true; templates().then(l => { tplNames = l; }); }
      return [
        { kind: 'Action', label: 'New doc from template', keys: 'template meeting notes spec retro bug report weekly update', run: () => templatePicker() },
        ...tplNames.map(t => ({ kind: 'Template', label: `New ${t.title}`, keys: 'template doc ' + t.title, run: () => fromTemplate(t).catch(e => toast(e.message)) })),
        ...(D() && D().current() && C.connected() ? [
          { kind: 'Action', label: 'Page history', keys: 'versions restore diff doc', run: () => { const c = D().current(); if (c) history(c.slug); } },
          { kind: 'Action', label: 'Pop out this doc', keys: 'float floating window pin', run: () => { const c = D().current(); if (c) floatDoc(c.slug, c.title); } },
          { kind: 'Action', label: D().current().pinned || ((D().list().find(d => d.slug === D().current().slug) || {}).pinned) ? 'Unpin this doc' : 'Pin this doc', keys: 'pin favourite favorite star', run: () => { const c = D().current(), it = D().list().find(d => d.slug === c.slug) || c; setMeta(c.slug, { pinned: !it.pinned }); } },
        ] : []),
      ];
    });
  }

  window.TribeDocsX = { renderList, afterEditor, afterRead, onInput, onKey, slash, templatePicker, fromTemplate, history, floatDoc, setMeta, lineDiff, threads: () => threads };
})();
