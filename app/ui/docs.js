// Docs: shared Markdown pages with a Notion-style slash menu, live co-editing (coedit.js), autosave,
// preview, conflict handling, file import, and local-brain TL;DRs. Works offline on one device.
// While a live session is open the body syncs as OT ops; the 900 ms PUT autosave is the fallback.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient, MD = window.TribeMD;
  const esc = MD.esc;
  const LKEY = 'tribecode.localDocs';
  const TEXT_EXT = /\.(md|markdown|txt|json|csv|tsv|js|ts|jsx|tsx|py|rs|go|java|c|cpp|h|cs|rb|php|html|css|yml|yaml|toml|ini|sh|sql|log)$/i;
  const SLASH = [
    ['h1', 'Heading 1', '## '], ['h2', 'Heading 2', '### '], ['h3', 'Heading 3', '#### '], ['todo', 'To-do', '- [ ] '], ['bullet', 'Bulleted list', '- '],
    ['num', 'Numbered list', '1. '], ['quote', 'Quote', '> '], ['code', 'Code block', '```\n\n```'], ['hr', 'Divider', '---\n'],
    ['table', 'Table', '| Column | Column |\n| --- | --- |\n|  |  |\n'], ['date', 'Today\'s date', null], ['brain', 'Summarize with AI', null],
    ['template', 'Template…', null], ['link', 'Link to page [[…]]', null], ['mention', 'Mention @…', null],   // handled by docsx.js
  ];
  let list = [], cur = null, dirty = false, saving = false, saveTimer = null, mode = 'write', filter = '', slash = null, loaded = false;
  let sess = null, liveOn = true, openSeq = 0, peersNow = [], readTimer = null;
  const inLive = () => !!(sess && !sess.closed && cur && sess.slug === cur.slug);

  const remote = () => C.connected();
  const onScreen = () => { const v = document.querySelector('#view-docs'); return v && !v.classList.contains('hidden'); };
  const activity = () => { if (onScreen()) window.TribeClient.sendActivity(cur ? `Docs · ${cur.title}` : 'Docs'); };
  const nameOf = id => { const m = (C.state().members || []).find(x => x.id === id); return m ? m.name : id === (C.state().me || {}).id ? 'you' : 'someone'; };
  const ago = iso => { if (!iso) return ''; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString(); };
  const local = {
    all() { try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch { return []; } },
    save(docs) { try { localStorage.setItem(LKEY, JSON.stringify(docs)); } catch {} },
  };
  const slugify = t => (t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'untitled');

  // ---------- data ----------
  async function load(openSlug) {
    const pj = C.project ? C.project() : null, seq0 = openSeq;
    if (remote()) { try { const got = (await C.api('/docs')).docs; if (C.project && C.project() !== pj) return; list = got; } catch (e) { window.TribeApp.toast('Could not load docs: ' + e.message); } }   // a list for a project we already left: the next load has the right one
    else list = local.all().map(({ body, ...d }) => ({ ...d, words: (body || '').split(/\s+/).filter(Boolean).length }));
    loaded = true; renderList();
    // a doc was opened while this list was on its way (a sheet made from a dropped CSV, a new doc): the list may be
    // older than the doc, so it must not close it and put the file grid back
    if (!openSlug && openSeq !== seq0) return;
    const keep = cur && list.some(d => d.slug === cur.slug) ? cur.slug : null;   // the open doc may belong to the project we just left
    if (cur && !keep) cur = null;   // …then don't ask the new project for its comments or backlinks either
    const want = openSlug || keep || (!(window.TribeFileGrid && desk()) && list[0] && list[0].slug);   // desktop opens on the file grid (feat/file-grid)
    if (want) open(want); else renderEditor();
  }

  async function fetchDoc(slug) {
    if (remote()) return (await C.api('/docs/' + slug)).doc;
    return local.all().find(d => d.slug === slug) || null;
  }

  let making = null;   // qa-pass: a double click on + / New doc makes one doc, not two
  const createOnce = () => making || (making = create().finally(() => { making = null; }));
  async function create(title = 'Untitled', body = '', source, kind) {
    let doc;
    if (remote()) doc = (await C.api('/docs', { method: 'POST', body: { title, body, source, kind } })).doc;
    else {
      const all = local.all(); let s = slugify(title), n = 2; while (all.some(d => d.slug === s)) s = `${slugify(title)}-${n++}`;
      const now = new Date().toISOString(); doc = { slug: s, title, body, version: 1, created: now, updated: now, source, ...(kind ? { kind } : {}) };
      all.push(doc); local.save(all);
    }
    await load(doc.slug);
    return doc;
  }

  async function open(slug) {
    const my = ++openSeq;
    if (dirty) await save();
    if (sess && sess.slug !== slug) { sess.leave(); sess = null; peersNow = []; }
    let fresh = null; try { fresh = await fetchDoc(slug); } catch (e) { fresh = null; }
    if (my !== openSeq) return;
    // Reconnecting to the doc we are already in: keep the editor (and the caret) as it is.
    const keep = !!(fresh && sess && sess.slug === slug && cur && cur.slug === slug && $('#doc-body'));
    const prevBody = cur && cur.slug === slug ? cur.body : null;
    cur = fresh;
    if (craft && (!cur || craft.slug !== cur.slug)) { craft.ctl.destroy(); craft = null; }
    if (cur && remote() && liveOn && !isCraft(cur)) {
      if (!sess) sess = window.TribeCoedit.open(slug, liveHooks());
      const ok = await sess.join();
      if (my !== openSeq) return;
      if (ok && cur) cur.body = sess.text();
      else if (sess) { sess.leave(); sess = null; peersNow = []; }
    } else if (sess) { sess.leave(); sess = null; peersNow = []; }
    if (keep && inLive()) { if (prevBody !== null) cur.body = sess.text(); renderList(); renderPeers(); activity(); return; }
    dirty = false; hideBanner(); renderList(); renderEditor();
    activity();
  }

  // ---------- live co-editing glue ----------
  function liveHooks() {
    return {
      onDom() { const ta = $('#doc-body'); if (ta) autosize(ta); if (outlineCtl) outlineCtl.refresh(); },
      onChange(text, isRemote) { if (!cur) return; cur.body = text; if (isRemote && mode === 'read') { clearTimeout(readTimer); readTimer = setTimeout(() => { if (mode === 'read' && $('#doc-read')) renderRead(); }, 150); } },
      onStatus(st) {
        if (!inLive()) return;
        setStatus(st === 'offline' ? 'Offline · your edits sync when you reconnect' : st === 'syncing' ? 'Syncing…' : `Live · synced${cur && cur.version ? ` · v${cur.version}` : ''}`);
      },
      onTitle(title, by) {
        if (!cur || !title) return; cur.title = title;
        const el = $('#doc-title'); if (el && document.activeElement !== el && el.value !== title) el.value = title;
        const nm = $('#dl-name'); if (nm && document.activeElement !== nm && nm.value !== title) nm.value = title;   // feat/doc-editor: the top bar's title
        const li = list.find(x => x.slug === cur.slug); if (li && li.title !== title) { li.title = title; renderList(); }
      },
      onVersion(v) { if (cur && v) cur.version = v; },
      onPeers(peers) { peersNow = peers; renderPeers(); },
      onExternal(by) { if (by && by === (C.state().me || {}).id) return; window.TribeApp.toast(`${nameOf(by)} changed this doc outside the editor. Merged in.`); },
      onToast(t) { window.TribeApp.toast(t); },
      onGone() { if (sess) { sess.leave(); sess = null; peersNow = []; renderPeers(); } },
      // The server lost the history needed to merge our unsent edits (e.g. it restarted): fall back to the banner.
      onConflict(mine, st) {
        sess = null; peersNow = [];
        const theirs = { ...cur, body: st.text, title: st.title || cur.title, version: st.version, updatedBy: null };
        cur = { ...cur, body: mine, version: st.version }; dirty = true;
        renderEditor(); showConflict(theirs); setStatus('Not saved: the live session was reset');
      },
    };
  }
  function renderPeers() {
    const el = $('#doc-peers'); if (!el) return;
    if (!inLive() || !peersNow.length) { el.innerHTML = ''; el.classList.add('hidden'); return; }
    const fg = c => { const n = parseInt(String(c || '#888888').slice(1), 16); return ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114) > 150 ? '#12151A' : '#FFFFFF'; };
    el.classList.remove('hidden');
    el.innerHTML = `<span class="co-avs">${peersNow.slice(0, 5).map(p => `<span class="co-av" title="${esc(p.name)}" style="background:${esc(p.color)};color:${fg(p.color)}">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>`).join('')}</span>` +
      `<span class="co-who">Editing now: ${peersNow.map(p => esc(p.name)).join(', ')}</span>`;
  }
  // Something changed the body (typing, slash menu, list continuation, checkbox): sync it.
  function changed() { if (inLive()) sess.localChange(); else queueSave(); }
  function titleChanged() {
    if (!inLive()) return queueSave();
    const t = $('#doc-title').value.trim() || 'Untitled'; cur.title = t;
    if (!window.TribeCoedit.sendTitle(cur.slug, t)) queueSave();   // not connected right now: PUT the title
    const li = list.find(x => x.slug === cur.slug); if (li) { li.title = t; renderList(); }
  }
  async function setLive(on) {
    liveOn = !!on;
    if (!liveOn && sess) { sess.leave(); sess = null; peersNow = []; }
    if (cur) await open(cur.slug);
  }

  function queueSave() { dirty = true; setStatus('Editing…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 900); }

  async function save({ force = false } = {}) {
    clearTimeout(saveTimer);
    if (!cur || !dirty || saving) return;
    saving = true; setStatus('Saving…');
    const title = $('#doc-title').value.trim() || 'Untitled', body = $('#doc-body').value, liveBody = inLive();
    try {
      if (remote()) {
        // In a live session the body travels as ops; only the title goes through PUT (and wins).
        const payload = liveBody ? { title, baseVersion: cur.version, force: true } : { title, body, baseVersion: cur.version, force };
        const r = await fetch(C.base() + '/api/docs/' + cur.slug, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (window.TribeStore.get().server || {}).token },
          body: JSON.stringify(payload) });
        const d = await r.json();
        if (r.status === 409) { showConflict(d.doc); setStatus('Not saved: someone else edited this'); return; }
        if (!r.ok) throw new Error(d.error || r.statusText);
        cur = { ...cur, ...d.doc }; if (liveBody && sess) cur.body = sess.text(); dirty = false; setStatus(`Saved · v${cur.version}`);
        activity();
      } else {
        const all = local.all(); const i = all.findIndex(x => x.slug === cur.slug);
        cur = { ...cur, title, body, version: (cur.version || 1) + 1, updated: new Date().toISOString() };
        if (i >= 0) all[i] = cur; local.save(all); dirty = false; setStatus('Saved on this device');
      }
      const li = list.find(x => x.slug === cur.slug); if (li) { li.title = cur.title; li.updated = cur.updated; li.version = cur.version; }
      renderList();
    } catch (e) { setStatus('Not saved, retrying…'); setTimeout(save, 4000); }
    finally { saving = false; }
  }

  async function remove() {
    if (!cur) return;
    const title = cur.title, slug = cur.slug;
    if (sess) { sess.leave(); sess = null; peersNow = []; }
    if (remote()) { try { await C.api('/docs/' + slug, { method: 'DELETE' }); } catch (e) { return window.TribeApp.toast(e.message); } }
    else local.save(local.all().filter(d => d.slug !== slug));
    cur = null; dirty = false; await load();
    window.TribeApp.toast(`Deleted "${title}"`);
  }

  async function summarize() {
    if (!cur) return;
    if (!remote()) return window.TribeApp.toast('Summaries run on the tribe\'s AI. Connect to a tribe first.');
    if (dirty) await save();
    setTldr('<span class="faint">Thinking…</span>');
    try { const r = await C.api(`/docs/${cur.slug}/summarize`, { method: 'POST' }); cur.summary = r.summary; renderTldr(); }
    catch (e) { cur.summary = ''; renderTldr(); window.TribeApp.toast(e.status === 503 ? 'No AI is on for the tribe. The host can pick one in Settings › Flint\'s brain.' : e.message); }
  }

  // ---------- import ----------
  async function importFiles(files) {
    let made = 0;
    for (const f of files) {
      const title = f.name.replace(/\.[^.]+$/, '') || f.name;
      if (TEXT_EXT.test(f.name) && f.size < 2_000_000) {
        let text = await f.text();
        if (!/\.(md|markdown|txt)$/i.test(f.name)) text = '```\n' + text + '\n```';
        await create(title, text, f.name); made++;
      } else {
        await create(title, `> Imported from **${f.name}** (${Math.round(f.size / 1024)} KB).\n>\n> Rich formats (PDF, Word, slides) are converted to Markdown by the desktop app's converter, coming in a later sprint. For now, paste the text here.\n`, f.name); made++;
      }
    }
    if (made) { window.TribeStore.set({ checklist: { drop: true } }); window.TribeApp.refresh(); window.TribeApp.toast(`${made} file${made > 1 ? 's' : ''} added to Files`); }
  }

  // ---------- rendering ----------
  function setStatus(t) {
    const el = $('#doc-status'); if (el) { el.textContent = t; el.classList.toggle('warn', /^(Offline|Not saved)/.test(String(t))); }
    const sv = $('#dl-save'); if (!sv) return;   // the toolbar's short version: Saving… / ✓ Saved / Offline
    const x = String(t || ''); sv.textContent = /^Offline|Not saved|retry/i.test(x) ? 'Offline · will save' : /Sav(ing)|Sync(ing)|…/i.test(x) && !/^Saved/i.test(x) ? 'Saving…' : '✓ Saved';
    sv.classList.toggle('busy', sv.textContent === 'Saving…'); sv.classList.toggle('warn', /^Offline/.test(sv.textContent));
  }   // only problems show; the rest is for screen readers
  function setTldr(html) { const el = $('#doc-tldr-text'); if (el) el.innerHTML = html; }
  function renderTldr() {
    const box = $('#doc-tldr'); if (!box) return;
    if (cur && cur.summary) { box.classList.remove('empty'); setTldr(esc(cur.summary).replace(/\n/g, '<br>')); }
    else { box.classList.add('empty'); box.classList.toggle('blank', !String((cur && cur.body) || '').trim()); setTldr(`No TL;DR yet. ${remote() ? '<button class="linkish" id="doc-sum">Summarize with AI</button>' : 'Summaries run on the tribe\'s AI.'}`); const b = $('#doc-sum'); if (b) b.onclick = summarize; }
  }

  function renderList() {
    const el = $('#doc-list'); if (!el) return;
    if (window.TribeDocsX) return window.TribeDocsX.renderList(el, list, { filter, cur, open, nameOf, ago });   // pins + nested tree
    const f = filter.toLowerCase();
    const items = list.filter(d => !f || d.title.toLowerCase().includes(f));
    el.innerHTML = items.length ? items.map(d => `<button class="doc-item ${cur && cur.slug === d.slug ? 'on' : ''}" data-slug="${esc(d.slug)}">
        <span class="t">${esc(d.title)}</span><span class="m">${ago(d.updated)}${d.updatedBy ? ' · ' + esc(nameOf(d.updatedBy)) : ''}</span></button>`).join('')
      : `<div class="faint" style="padding:12px;font-size:13px">${list.length ? 'No matches' : 'Nothing here yet. Make a doc or drop any file here.'}</div>`;
    el.querySelectorAll('[data-slug]').forEach(b => b.onclick = () => open(b.dataset.slug));
  }

  // feat/doc-editor: desktop gets the shared Google Docs + Notion layout (doclayout.js); phones keep this view's
  // inline editor plus a compact format bar. Every id other modules and tests use (#doc-title, #doc-body,
  // #doc-status, #doc-peers, #doc-del, .doc-toolbar, [data-mode], #doc-read, #doc-slash, #doc-tldr) stays.
  const DL = () => window.TribeDocLayout;
  let outlineCtl = null, wasDesk = null;
  const desk = () => !!(DL() && DL().isDesk());
  const projName = () => { try { const p = window.TribeProjects && window.TribeProjects.cur && window.TribeProjects.cur(); return (p && p.name) || 'Project'; } catch { return 'Project'; } };
  // The docs list (#doc-list-wrap) becomes the left panel's "Document tabs" on desktop; it goes back to the grid otherwise.
  function parkAside() {
    const aside = $('#doc-list-wrap'), grid = $('#view-docs .docs-grid'), pane = $('#doc-pane');
    if (aside && grid && pane && aside.parentNode !== grid) grid.insertBefore(aside, pane);
  }
  function wideMode(on) {
    const grid = $('#view-docs .docs-grid'); if (grid) grid.classList.toggle('dl-on', !!on);
    syncWide();
  }
  function syncWide() {
    const grid = $('#view-docs .docs-grid');
    document.body.classList.toggle('dl-wide', !!(grid && grid.classList.contains('dl-on') && onScreen() && desk()));
  }
  function statusText() { return cur && cur.updated ? `Saved · ${ago(cur.updated)}${cur.updatedBy ? ' by ' + nameOf(cur.updatedBy) : ''}` : ''; }
  function docLink() {
    const pid = C.project ? C.project() : '';
    return `${location.origin}${location.pathname}#/doc/${encodeURIComponent(pid || '')}/${encodeURIComponent(cur.slug)}`;
  }
  function closeDoc() {
    if (dirty) save();
    if (craft) { craft.ctl.flush(); craft.ctl.destroy(); craft = null; }
    if (sess) { sess.leave(); sess = null; peersNow = []; }
    cur = null; dirty = false; renderList(); renderEditor(); activity();
  }

  // ---------- Sheets and Slides (feat/crafts): sheet.js and deck.js edit docs whose kind is sheet or deck ----------
  let craft = null;   // { slug, ctl }
  const isCraft = d => !!(d && (d.kind === 'sheet' || d.kind === 'deck'));
  async function craftSave({ body, title, baseVersion }) {
    if (!cur) return null;
    if (!remote()) {
      const all = local.all(), i = all.findIndex(x => x.slug === cur.slug);
      cur = { ...cur, title, body, version: (cur.version || 1) + 1, updated: new Date().toISOString() }; if (i >= 0) all[i] = cur; local.save(all);
      const li = list.find(x => x.slug === cur.slug); if (li) Object.assign(li, { title, version: cur.version, updated: cur.updated }); return { doc: cur };
    }
    try {
      const r = await fetch(C.base() + '/api/docs/' + cur.slug, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (window.TribeStore.get().server || {}).token, ...(C.project && C.project() ? { 'X-Project': C.project() } : {}) },
        body: JSON.stringify({ title, body, baseVersion }) });
      const d = await r.json();
      if (r.status === 409) return { conflict: d.doc };
      if (!r.ok) return null;
      cur = { ...cur, ...d.doc }; const li = list.find(x => x.slug === cur.slug); if (li) Object.assign(li, { title: cur.title, version: cur.version, updated: cur.updated }); renderList();
      return { doc: d.doc };
    } catch { return null; }
  }
  // "Ask Flint" inside a sheet or deck: the tribe's brain rewrites the body (server/flint.js /api/flint/make)
  // feat/flint-max: sums, sorts, currency, a total row, charts, a pitch from a doc: done here with no model, offline (one Undo each)
  const craftUndo = [];
  async function craftLocal(kind, ask, body, opt) {
    const FM = window.TribeFlintMax; if (!FM || !FM.craft || !cur) return null;
    if (/^(?:undo|undo that|take that back)$/i.test(String(ask).trim())) { const u = craftUndo.filter(x => x.slug === cur.slug).pop(); if (!u) return { say: 'Nothing to undo here.' }; craftUndo.splice(craftUndo.lastIndexOf(u), 1); return { body: u.body, say: 'Undone.' }; }
    const r = await FM.craft(kind, String(ask).replace(/\n\(The person is looking at slide \d+\.\)$/, ''), body, opt || {}); if (!r) return null;
    if (r.body != null && r.body !== body) craftUndo.push({ slug: cur.slug, body });
    return r;
  }
  async function craftAsk(kind, ask, body, opt) {
    const loc = await craftLocal(kind, ask, body, opt);
    if (loc) { if (loc.say) window.TribeApp.toast(loc.say); return loc.body != null ? loc.body : null; }
    if (!remote()) { window.TribeApp.toast('Flint writes sheets and slides with the tribe\'s brain. Join or host a tribe first.'); return null; }
    try { const r = await C.api('/flint/make', { method: 'POST', body: { kind, ask, body, title: cur && cur.title } }); if (r.basic) window.TribeApp.toast(r.note || 'Flint is in basic mode, so he used a template. Give him a brain for smarter results.'); return r.body; }
    catch (e) { window.TribeApp.toast(e.status === 503 ? 'Flint needs a brain for that. Pick one in Settings › Flint\'s brain.' : 'Flint could not do that: ' + e.message); return null; }
  }
  const newCraft = k => create(k === 'sheet' ? 'Untitled sheet' : 'Untitled slides', k === 'sheet' ? '| Name | Amount |\n| --- | --- |\n|  |  |\n' : '<!-- theme: campfire -->\n\n# Untitled slides\n\nA one-line subtitle\n\n---\n\n## First point\n\n- \n', undefined, k);
  // Flint's chat (anywhere) runs the same local moves on the open sheet or deck, and re-draws it
  async function flintCraft(text) {
    if (!cur || !isCraft(cur)) return null;
    const opt = craft && craft.ctl && craft.ctl.sel ? { sel: craft.ctl.sel() } : {};
    const r = await craftLocal(cur.kind, text, cur.body || '', opt); if (!r) return null;
    if (r.body != null && r.body !== cur.body) { await craftSave({ body: r.body, title: cur.title, baseVersion: cur.version }); cur.body = r.body; const pane = $('#doc-pane'); if (pane) renderCraft(pane); }
    return r;
  }
  function renderCraft(pane) {
    wideMode(false);
    const M = cur.kind === 'sheet' ? window.TribeSheet : window.TribeDeck; if (!M) { pane.innerHTML = '<p class="faint">This editor did not load. Reload the app.</p>'; return; }
    if (craft) craft.ctl.destroy();
    pane.classList.add('craft-on'); { const g = $('#view-docs .docs-grid'); if (g) g.classList.add('craft-grid'); }
    craft = { slug: cur.slug, ctl: M.mount(pane, { doc: cur, save: craftSave, close: () => { pane.classList.remove('craft-on'); closeDoc(); }, del: () => { if (confirmDelete()) { pane.classList.remove('craft-on'); if (craft) { craft.ctl.destroy(); craft = null; } remove(); } }, nameOf,
      askFlint: (ask, body, opt) => craftAsk(cur.kind, ask, body, opt) }) };
    activity();
  }

  function renderEditor() {
    { const p = $('#doc-pane'), g = $('#view-docs .docs-grid'); if (p && !(cur && isCraft(cur))) { p.classList.remove('craft-on'); if (g) g.classList.remove('craft-grid'); } }
    const pane = $('#doc-pane'); if (!pane) return;
    { const h = $('#doc-repo-hero'), w = $('#doc-list-wrap'); if (h && w && !w.contains(h)) { const x = h.nextElementSibling && h.nextElementSibling.classList.contains('vw-assets') ? h.nextElementSibling : null; w.prepend(h); if (x) h.after(x); } }   // feat/file-grid: the code repository strip lives in the grid while it shows
    parkAside(); outlineCtl = null; wasDesk = desk();
    if (!cur) {
      wideMode(false);
      if (window.TribeFileGrid && desk()) { window.TribeFileGrid.render(pane, list, { open, create: k => (k ? newCraft(k) : createOnce()), nameOf, ago }); return; }   // feat/file-grid: files as a drive-like grid
      pane.innerHTML = `<div class="doc-empty"><svg class="i"><use href="#i-doc"/></svg><h2>${list.length ? 'Pick a doc to open' : 'Your tribe\'s files live here'}</h2>
        <p>Notes, docs, pictures, PDFs: any file, kept in the tribe folder. Docs are plain Markdown; type <span class="kbd">/</span> in one for blocks.</p>
        <button class="btn" id="doc-first">New doc</button></div>`;
      $('#doc-first').onclick = () => createOnce(); return;
    }
    if (isCraft(cur)) return renderCraft(pane);
    if (craft) { craft.ctl.destroy(); craft = null; }
    const words = (cur.body || '').split(/\s+/).filter(Boolean).length;
    const seg = `<div class="seg" role="group" aria-label="Mode"><button data-mode="write" class="${mode === 'write' ? 'on' : ''}" aria-pressed="${mode === 'write'}" title="Edit the doc">✏️ Edit</button><button data-mode="read" class="${mode === 'read' ? 'on' : ''}" aria-pressed="${mode === 'read'}" title="See it as others read it">Preview</button></div>`;
    const page = `
      <input class="doc-title" id="doc-title" value="${esc(cur.title)}" maxlength="120" placeholder="Untitled" aria-label="Title">
      ${cur.source ? `<div class="doc-meta">Imported from ${esc(cur.source)}</div>` : ''}
      <div class="doc-tldr" id="doc-tldr"><div class="lbl"><svg class="i" style="width:14px;height:14px"><use href="#i-spark"/></svg>TL;DR · the tribe\'s AI</div><div id="doc-tldr-text"></div></div>
      ${desk() ? '' : DL() ? `<div class="gd-fmt-wrap ${mode === 'write' ? '' : 'hidden'}">${DL().gdBar()}</div>` : ''}
      <div class="doc-edit ${mode === 'write' ? '' : 'hidden'}"><textarea id="doc-body" spellcheck="true" aria-label="Document text" placeholder="Start writing, or type / for blocks…">${esc(inLive() ? sess.text() : cur.body || '')}</textarea></div>
      <article class="md ${mode === 'read' ? '' : 'hidden'}" id="doc-read"></article>
      <div class="slash hidden" id="doc-slash" role="listbox" aria-label="Insert block"></div>`;
    if (desk() && DL()) {
      const L = DL();
      const acts = `<div class="doc-toolbar dl-acts">${seg}
          <button class="btn ghost dx-tool" id="dl-ai" title="Ask AI about this doc" aria-label="Ask AI">${L.ico('sparkle', 18)}</button>
          ${remote() ? '' : `<button class="btn ghost dx-tool" id="dl-more" title="More" aria-label="More">${L.ico('more', 18)}</button>`}
          ${remote() ? `<button class="btn ghost dl-act" id="dl-link" title="Copy a link to this doc" aria-label="Copy link">${L.ico('share', 17)}<span>Share</span></button>` : ''}
          <button class="btn ghost dx-tool" id="doc-del" title="Delete doc" aria-label="Delete doc">${L.ico('trash', 17)}</button>
          <span class="dl-save" id="dl-save" role="status" aria-live="polite">✓ Saved</span>
          <button class="btn primary dl-done" id="dl-close" title="Done: save and go back to all files" aria-label="Done">Done</button></div>`;
      pane.innerHTML = `<div class="doc-banner hidden" id="doc-banner"></div>
        <div class="dl-head">${L.top({ kind: 'doc', nameId: 'dl-name', title: cur.title, where: remote() ? projName() : 'On this device', statusId: 'doc-status', status: statusText(), peers: '<span class="doc-peers hidden" id="doc-peers" aria-live="polite"></span>', acts })}
          ${L.toolbar()}</div>
        <div class="dl-body">
          <aside class="dl-side" id="dl-side" aria-label="Document tabs and outline">
            <div class="dl-side-h"><span class="dl-eyebrow">Document tabs</span><button class="dl-x" id="dl-side-x" aria-label="Hide side panel" title="Hide side panel">${L.ico('side', 16)}</button></div>
            <div class="dl-tabs" id="dl-tabs"></div>
            <section class="dl-outline" id="dl-outline-sec"><button class="dl-ol-head" id="dl-ol-head" aria-expanded="true" aria-controls="dl-outline">${L.ico('chev', 14)}<span class="dl-eyebrow">Outline</span></button><nav class="dl-ol" id="dl-outline" aria-label="Outline"></nav></section>
          </aside>
          <button class="dl-side-open" id="dl-side-open" aria-label="Show side panel" title="Show side panel">${L.ico('side', 16)}</button>
          <div class="dl-canvas" id="dl-canvas"><div class="dl-page" id="dl-page">${page}</div></div>
        </div>`;
      const aside = $('#doc-list-wrap'); if (aside) $('#dl-tabs').appendChild(aside);
      wideMode(true);
    } else {
      wideMode(false);
      pane.innerHTML = `
      <div class="doc-banner hidden" id="doc-banner"></div>
      <div class="doc-toolbar">
        ${seg}
        <span class="faint" id="doc-status">${esc(statusText())}</span>
        <span class="doc-peers hidden" id="doc-peers" aria-live="polite"></span>
        ${DL() ? `<button class="btn ghost dl-olb" id="dl-outline-btn" aria-label="Outline" title="Outline" style="margin-left:auto">${DL().ico('outline', 18)}</button><button class="btn ghost dl-olb" id="dl-ai" aria-label="Ask AI" title="Ask AI">${DL().ico('sparkle', 18)}</button>${remote() ? '' : `<button class="btn ghost dl-olb" id="dl-more" aria-label="More" title="More">${DL().ico('more', 18)}</button>`}` : ''}
        <button class="btn ghost" id="doc-del" title="Delete doc"${DL() ? '' : ' style="margin-left:auto"'}><svg class="i"><use href="#i-x"/></svg>Delete</button>
      </div>${page}`;
    }
    renderTldr();
    if (window.TribeRich && mode === 'write') window.TribeRich.upgrade($('#doc-body'));   // feat/richtext: formatted editing; #doc-body keeps the textarea API
    const ta = $('#doc-body'), title = $('#doc-title');
    if (inLive()) sess.attach(ta);
    autosize(ta); renderPeers();
    title.oninput = titleChanged;
    title.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } };
    ta.oninput = () => { autosize(ta); changed(); checkSlash(); if (window.TribeDocsX) window.TribeDocsX.onInput(ta); if (outlineCtl) outlineCtl.refresh(); };
    ta.onkeydown = onKey;
    ta.onblur = () => setTimeout(() => { if (document.activeElement !== ta) hideSlash(); }, 150);   // a late timer must not close a menu opened after refocusing
    ta.ondragover = e => e.preventDefault();
    ta.ondrop = async e => { if (e.dataTransfer.files.length) { e.preventDefault(); importFiles([...e.dataTransfer.files]); } };
    pane.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; renderEditor(); });
    if (inLive()) sess.status();
    $('#doc-del').onclick = () => { if (confirmDelete()) remove(); };
    if (DL()) wireLayout(pane, ta, title);
    if (mode === 'read') renderRead();
    if (window.TribeDocsX) window.TribeDocsX.afterEditor(pane, cur, mode);   // breadcrumbs, backlinks, comments, history
    // feat/doc-editor: on desktop the backlinks sit at the foot of the page and the comment margin beside it
    const page2 = $('#dl-page'), canvas = $('#dl-canvas');
    if (page2) { const bl = $('#doc-backlinks'); if (bl) page2.appendChild(bl); const mg = $('#doc-margin'); if (mg && canvas) canvas.appendChild(mg); }
  }
  // Toolbar, outline, title mirror, side panel and share/close for the shared layout.
  function wireLayout(pane, ta, title) {
    const L = DL();
    L.bind(pane, () => $('#doc-body'));
    const olb = $('#dl-outline-btn'); if (olb) olb.onclick = () => L.outlineSheet({ ta: () => $('#doc-body'), read: () => $('#doc-read') });
    const aib = $('#dl-ai'); if (aib) aib.onclick = () => L.aiSheet($('#doc-body'), { anchor: aib, title: cur ? cur.title : 'this doc' });
    const mb = $('#dl-more');   // feat/richtext: ⋮ More when offline (docsx's ⋯ menu has View Markdown in a tribe)
    if (mb) mb.onclick = () => L.menuSheet({ title: 'More', anchor: mb, items: [{ label: 'Find and replace', icon: 'find', run: () => L.findSheet($('#doc-body'), { anchor: mb }) },
      ...(window.TribeRich ? [window.TribeRich.menuItem(() => { if (mode !== 'write') mode = 'write'; renderEditor(); })] : [])] });
    const name = $('#dl-name');
    if (name) L.mirror(name, title, () => ta.focus());
    const olEl = $('#dl-outline');
    if (olEl) outlineCtl = L.outline({ el: olEl, ta: () => $('#doc-body'), read: () => $('#doc-read'), offset: () => { const h = pane.querySelector('.dl-head'); return h ? h.getBoundingClientRect().height : 0; } });
    const hd = pane.querySelector('.dl-head'); if (hd) pane.style.setProperty('--dl-head', Math.round(hd.getBoundingClientRect().height) + 'px');   // the side panel sticks under it
    const sideKey = 'tribecode.docs.side', olKey = 'tribecode.docs.outline';
    const get = k => { try { return localStorage.getItem(k); } catch { return null; } }, set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
    const body = pane.querySelector('.dl-body');
    if (body) {
      const fit = () => body.classList.toggle('narrow', pane.clientWidth < 1000);   // a squeezed pane (room panel open): a slimmer side panel and page margins
      fit(); if (!pane.__dlFit && window.ResizeObserver) { pane.__dlFit = new ResizeObserver(() => { const b = pane.querySelector('.dl-body'); if (b) b.classList.toggle('narrow', pane.clientWidth < 1000); }); pane.__dlFit.observe(pane); }   // the room panel opening or closing resizes the pane
      const so = $('#dl-side-open'), acts = pane.querySelector('.dl-acts'); if (so && acts) acts.prepend(so);   // v0.21: in the toolbar row, not over the page
      const sideSync = off => { body.classList.toggle('side-off', off); pane.classList.toggle('side-off-on', off); };
      sideSync(get(sideKey) !== 'on');   // the side panel starts hidden; the toolbar button brings it back
      $('#dl-side-x').onclick = () => { sideSync(true); set(sideKey, 'off'); $('#dl-side-open').focus(); };
      $('#dl-side-open').onclick = () => { sideSync(false); set(sideKey, 'on'); $('#dl-side-x').focus(); if (outlineCtl) outlineCtl.render(); };
    }
    const sec = $('#dl-outline-sec'), head = $('#dl-ol-head');
    if (sec && head) {
      const fold = on => { sec.classList.toggle('folded', on); head.setAttribute('aria-expanded', String(!on)); };
      fold(get(olKey) === 'folded');
      head.onclick = () => { const on = !sec.classList.contains('folded'); fold(on); set(olKey, on ? 'folded' : 'open'); };
    }
    const lk = $('#dl-link');
    if (lk) lk.onclick = async () => {
      const url = docLink();
      try { await navigator.clipboard.writeText(url); window.TribeApp.toast('Link copied. It opens this doc for anyone in the project.'); }
      catch { window.TribeApp.toast(url); }
    };
    const cl = $('#dl-close'); if (cl) cl.onclick = closeDoc;
    if (!L.isDesk()) { const bar = pane.querySelector('.gd-fmt-wrap'); L.dockAboveKeyboard(bar, ta); }
  }
  // Crossing the 820px line re-lays the editor out (desktop layout <-> phone layout).
  addEventListener('resize', () => { if (wasDesk !== null && desk() !== wasDesk && onScreen()) renderEditor(); else syncWide(); });
  setTimeout(() => { const v = $('#view-docs'); if (v) new MutationObserver(syncWide).observe(v, { attributes: true, attributeFilter: ['class'] }); }, 0);
  // Copied links: #/doc/<project>/<slug> switches to the project and opens the doc.
  const bootHash = location.hash;
  let hashDone = false;
  async function fromHash(h) {
    const m = /^#\/doc\/([^/]*)\/([^/?#]+)$/.exec(h || location.hash); if (!m) return;
    const pid = decodeURIComponent(m[1]), slug = decodeURIComponent(m[2]);
    if (/^#\/doc\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    const P = window.TribeProjects;
    if (pid && P && P.current && P.current() !== pid && (P.list() || []).some(p => p.id === pid)) { await P.switchTo(pid); await new Promise(r => setTimeout(r, 250)); }
    window.TribeApp.show('docs'); setTimeout(() => open(slug), 120);
  }
  addEventListener('hashchange', () => fromHash());
  C.on('hello', () => { if (hashDone) return; hashDone = true; setTimeout(() => fromHash(/^#\/doc\//.test(location.hash) ? location.hash : bootHash), 200); });

  let delArmed = 0;
  function confirmDelete() {
    if (Date.now() - delArmed < 3000) return true;
    delArmed = Date.now(); window.TribeApp.toast('Click Delete again to remove this doc'); return false;
  }

  function renderRead() {
    const el = $('#doc-read'); el.innerHTML = MD.render(cur.body || '') || '<p class="faint">Empty doc.</p>';
    el.querySelectorAll('input[type=checkbox][data-line]').forEach(cb => cb.onchange = () => {
      const lines = (cur.body || '').split('\n'), n = +cb.dataset.line;
      lines[n] = lines[n].replace(/\[( |x|X)\]/, cb.checked ? '[x]' : '[ ]');
      cur.body = lines.join('\n'); $('#doc-body').value = cur.body; changed(); renderRead();
    });
    if (window.TribeDocsX) window.TribeDocsX.afterRead(el, cur);   // [[links]], @mentions, comment highlights
  }

  function autosize(ta) {
    // the rich surface (richtext.js, a contenteditable div) grows by itself; measuring it on every key forced a layout of
    // the whole doc twice per keystroke (a 20k-word doc typed at ~40 ms per key)
    if (ta.rtMeasure) { if (ta.style.height) ta.style.height = ''; if (!ta.style.minHeight) ta.style.minHeight = '320px'; return; }
    ta.style.height = 'auto'; ta.style.height = Math.max(320, ta.scrollHeight + 4) + 'px';
  }

  // ---------- slash menu ----------
  function checkSlash() {
    const ta = $('#doc-body'), pos = ta.selectionStart, before = ta.value.slice(0, pos);
    const m = before.match(/(^|\n)\/([a-z0-9 ]*)$/i);
    if (!m) return hideSlash();
    const q = m[2].toLowerCase();
    const items = SLASH.filter(([, label]) => label.toLowerCase().includes(q));
    if (!items.length) return hideSlash();
    slash = { start: pos - m[2].length - 1, items, sel: slash && slash.items === items ? slash.sel : 0 };
    drawSlash();
  }
  function drawSlash() {
    const el = $('#doc-slash'), ta = $('#doc-body');
    el.innerHTML = slash.items.map(([key, label], i) => `<button class="${i === slash.sel ? 'on' : ''}" data-k="${key}">${label}</button>`).join('');
    const xy = caretXY(ta, slash.start);
    el.style.left = xy.x + 'px'; el.style.top = (xy.y + 26) + 'px'; el.classList.remove('hidden');
    el.querySelectorAll('[data-k]').forEach((b, i) => b.onmousedown = e => { e.preventDefault(); slash.sel = i; applySlash(); });
  }
  function hideSlash() { slash = null; const el = $('#doc-slash'); if (el) el.classList.add('hidden'); }
  function applySlash() {
    const ta = $('#doc-body'), [key, , insert] = slash.items[slash.sel], end = ta.selectionStart;
    let text = insert;
    if (key === 'date') text = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (key === 'brain') { ta.setRangeText('', slash.start, end, 'end'); hideSlash(); changed(); summarize(); return; }
    if (window.TribeDocsX && window.TribeDocsX.slash(key, ta, slash.start, end)) { hideSlash(); return; }
    // feat/doc-editor: block items go through the shared Markdown edits (undoable, same result as the toolbar)
    const BLOCK = { h1: 'h1', h2: 'h2', h3: 'h3', todo: 'todo', bullet: 'bullet', num: 'num', quote: 'quote', code: 'codeblock', hr: 'hr', table: 'table' };
    if (DL() && BLOCK[key]) { const st = slash.start; hideSlash(); DL().edit(ta, st, end, '', st); DL().run(BLOCK[key], ta); autosize(ta); return; }
    ta.setRangeText(text, slash.start, end, 'end');
    if (key === 'code') ta.selectionStart = ta.selectionEnd = slash.start + 4;
    hideSlash(); autosize(ta); changed(); ta.focus();
  }
  function caretXY(ta, pos) {
    if (ta.rtMeasure) return ta.rtMeasure([pos])[0] || { x: 0, y: 0 };   // feat/richtext
    const m = document.createElement('div'), cs = getComputedStyle(ta);
    ['fontFamily', 'fontSize', 'lineHeight', 'padding', 'border', 'letterSpacing', 'whiteSpace', 'wordWrap', 'width', 'boxSizing'].forEach(k => (m.style[k] = cs[k]));
    Object.assign(m.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', wordWrap: 'break-word', top: 0, left: 0 });
    m.textContent = ta.value.slice(0, pos); const span = document.createElement('span'); span.textContent = '​'; m.appendChild(span);
    ta.parentNode.appendChild(m);
    const r = { x: span.offsetLeft + ta.offsetLeft, y: span.offsetTop + ta.offsetTop - ta.scrollTop };
    m.remove(); return r;
  }

  // ---------- editing keys ----------
  function onKey(e) {
    const ta = e.target;
    if (window.TribeDocsX && window.TribeDocsX.onKey(e)) return;   // [[ and @ autocomplete
    if (slash) {
      if (e.key === 'ArrowDown') { e.preventDefault(); slash.sel = (slash.sel + 1) % slash.items.length; return drawSlash(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); slash.sel = (slash.sel - 1 + slash.items.length) % slash.items.length; return drawSlash(); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return applySlash(); }
      if (e.key === 'Escape') { e.preventDefault(); return hideSlash(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (inLive()) window.TribeCoedit.flush(cur.slug); else save(); return; }
    if (DL() && DL().key(e, ta)) return;   // feat/doc-editor: Ctrl+B/I/K/E, Ctrl+Alt+1-3, Ctrl+Shift+7-9, Ctrl+Z/Y
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); wrap(ta, e.key === 'b' ? '**' : '*'); return; }
    if (e.key === 'Enter' && !e.shiftKey) {             // continue lists like Notion
      const pos = ta.selectionStart, lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1, line = ta.value.slice(lineStart, pos);
      const m = line.match(/^(\s*)([-*] \[[ xX]\] |[-*] |(\d+)[.)] |> )/);
      if (m) {
        e.preventDefault();
        if (line.trim() === m[2].trim()) { ta.setRangeText('', lineStart, pos, 'end'); }   // empty item ends the list
        else { let next = m[2].replace(/\[[xX]\]/, '[ ]'); if (m[3]) next = `${+m[3] + 1}. `; ta.setRangeText('\n' + m[1] + next, pos, ta.selectionEnd, 'end'); }
        autosize(ta); changed();
      }
    }
    if (e.key === 'Tab' && !slash) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); changed(); }
  }
  function wrap(ta, mark) {
    const a = ta.selectionStart, b = ta.selectionEnd, sel = ta.value.slice(a, b) || 'text';
    ta.setRangeText(mark + sel + mark, a, b, 'select'); ta.selectionStart = a + mark.length; ta.selectionEnd = a + mark.length + sel.length; changed();
  }

  // ---------- conflicts + live updates ----------
  function showConflict(theirs) {
    const b = $('#doc-banner'); if (!b) return;
    b.classList.remove('hidden');
    b.innerHTML = `<b>${esc(nameOf(theirs.updatedBy))} edited this doc while you were typing.</b> <span class="faint">Their version is v${theirs.version}.</span>
      <span style="margin-left:auto;display:flex;gap:8px"><button class="btn" id="cf-theirs">Use theirs</button><button class="btn" id="cf-copy">Copy mine</button><button class="btn primary" id="cf-mine">Keep mine</button></span>`;
    $('#cf-theirs').onclick = () => { cur = theirs; dirty = false; hideBanner(); renderEditor(); if (liveOn && remote()) open(cur.slug); };
    $('#cf-copy').onclick = async () => { try { await navigator.clipboard.writeText($('#doc-body').value); window.TribeApp.toast('Your text is on the clipboard'); } catch {} };
    $('#cf-mine').onclick = async () => { cur.version = theirs.version; hideBanner(); dirty = true; await save({ force: true }); if (!dirty && liveOn && remote()) open(cur.slug); };
  }
  function hideBanner() { const b = $('#doc-banner'); if (b) b.classList.add('hidden'); }

  C.on('doc', d => {
    if (!loaded) return;
    const i = list.findIndex(x => x.slug === d.slug); if (i >= 0) list[i] = { ...list[i], ...d }; else list.unshift(d);
    list.sort((a, b) => String(b.updated).localeCompare(String(a.updated))); renderList();
    // Live session: the text already arrived as ops; this is just the file being written.
    if (cur && cur.slug === d.slug && inLive()) {
      if (d.version >= (cur.version || 0)) { cur.version = d.version; cur.updated = d.updated; cur.updatedBy = d.updatedBy; }
      if (!sess.pending() && !dirty) setStatus(`Saved · v${d.version}${sess.joined ? ' · live' : ''}`);
      return;
    }
    if (craft && cur && cur.slug === d.slug && d.updatedBy !== (C.state().me || {}).id) { fetchDoc(d.slug).then(f => { if (f && craft && craft.slug === f.slug) { cur = f; craft.ctl.update(f); } }); return; }
    if (cur && cur.slug === d.slug && d.version > cur.version && d.updatedBy !== (C.state().me || {}).id) {
      if (dirty) fetchDoc(d.slug).then(showConflict);
      else fetchDoc(d.slug).then(fresh => { const ta = $('#doc-body'), pos = ta ? ta.selectionStart : 0, focused = document.activeElement === ta;
        cur = fresh; renderEditor(); if (focused) { const t = $('#doc-body'); t.focus(); t.selectionStart = t.selectionEnd = Math.min(pos, t.value.length); }
        setStatus(`Updated by ${nameOf(fresh.updatedBy)} · v${fresh.version}`); });
    }
  });
  if (C.on) C.on('project', () => { if (remote() && !dirty) cur = null; });   // the open doc belongs to the project we left
  C.on('doc-summary', ({ slug, summary }) => { if (cur && cur.slug === slug) { cur.summary = summary; renderTldr(); } });
  C.on('doc-removed', slug => { list = list.filter(d => d.slug !== slug); renderList(); if (cur && cur.slug === slug) { if (sess) { sess.leave(); sess = null; peersNow = []; } cur = null; renderEditor(); window.TribeApp.toast('This doc was deleted by a teammate'); } });
  C.on('status', s => { if (s.status === 'online' && loaded) load(); });
  addEventListener('beforeunload', e => { if (dirty || (sess && sess.pending())) { if (dirty) save(); e.preventDefault(); e.returnValue = ''; } });

  document.addEventListener('input', e => { if (e.target.id === 'doc-search') { filter = e.target.value; renderList(); } });
  document.addEventListener('click', e => { if (e.target.closest('#doc-new')) createOnce(); });
  document.addEventListener('dragover', e => { if (e.target.closest('#doc-list-wrap')) { e.preventDefault(); $('#doc-list-wrap').classList.add('over'); } });
  document.addEventListener('dragleave', e => { if (e.target.closest && e.target.closest('#doc-list-wrap') && !e.target.closest('#doc-list-wrap').contains(e.relatedTarget)) $('#doc-list-wrap').classList.remove('over'); });
  document.addEventListener('drop', e => { const w = e.target.closest && e.target.closest('#doc-list-wrap'); if (w) { e.preventDefault(); w.classList.remove('over'); importFiles([...e.dataTransfer.files]); } });

  async function refreshList() { if (remote()) { try { list = (await C.api('/docs')).docs; } catch {} } renderList(); }
  window.TribeDocs = { flintCraft, shelf: () => { if (cur) closeDoc(); }, load, create, importFiles, open, saveNow: () => save(), isDirty: () => dirty || !!(sess && sess.pending()), setLive, live: () => inLive() && sess.joined,
    newSheet: () => newCraft('sheet'), newDeck: () => newCraft('deck'),
    current: () => cur, list: () => list, refreshList, renderList, changed, caretXY, mode: () => mode, setMode: m => { mode = m; renderEditor(); } };
})();
