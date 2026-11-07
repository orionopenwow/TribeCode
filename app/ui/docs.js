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
    ['h1', 'Heading 1', '# '], ['h2', 'Heading 2', '## '], ['todo', 'To-do', '- [ ] '], ['bullet', 'Bulleted list', '- '],
    ['num', 'Numbered list', '1. '], ['quote', 'Quote', '> '], ['code', 'Code block', '```\n\n```'], ['hr', 'Divider', '---\n'],
    ['table', 'Table', '| Column | Column |\n| --- | --- |\n|  |  |\n'], ['date', 'Today\'s date', null], ['brain', 'Summarize with local brain', null],
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
    const pj = C.project ? C.project() : null;
    if (remote()) { try { const got = (await C.api('/docs')).docs; if (C.project && C.project() !== pj) return; list = got; } catch (e) { window.TribeApp.toast('Could not load docs: ' + e.message); } }   // a list for a project we already left: the next load has the right one
    else list = local.all().map(({ body, ...d }) => ({ ...d, words: (body || '').split(/\s+/).filter(Boolean).length }));
    loaded = true; renderList();
    const keep = cur && list.some(d => d.slug === cur.slug) ? cur.slug : null;   // the open doc may belong to the project we just left
    if (cur && !keep) cur = null;   // …then don't ask the new project for its comments or backlinks either
    const want = openSlug || keep || (list[0] && list[0].slug);
    if (want) open(want); else renderEditor();
  }

  async function fetchDoc(slug) {
    if (remote()) return (await C.api('/docs/' + slug)).doc;
    return local.all().find(d => d.slug === slug) || null;
  }

  async function create(title = 'Untitled', body = '', source) {
    let doc;
    if (remote()) doc = (await C.api('/docs', { method: 'POST', body: { title, body, source } })).doc;
    else {
      const all = local.all(); let s = slugify(title), n = 2; while (all.some(d => d.slug === s)) s = `${slugify(title)}-${n++}`;
      const now = new Date().toISOString(); doc = { slug: s, title, body, version: 1, created: now, updated: now, source };
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
    if (cur && remote() && liveOn) {
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
      onDom() { const ta = $('#doc-body'); if (ta) autosize(ta); },
      onChange(text, isRemote) { if (!cur) return; cur.body = text; if (isRemote && mode === 'read') { clearTimeout(readTimer); readTimer = setTimeout(() => { if (mode === 'read' && $('#doc-read')) renderRead(); }, 150); } },
      onStatus(st) {
        if (!inLive()) return;
        setStatus(st === 'offline' ? 'Offline · your edits sync when you reconnect' : st === 'syncing' ? 'Syncing…' : `Live · synced${cur && cur.version ? ` · v${cur.version}` : ''}`);
      },
      onTitle(title, by) {
        if (!cur || !title) return; cur.title = title;
        const el = $('#doc-title'); if (el && document.activeElement !== el && el.value !== title) el.value = title;
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
    if (!remote()) return window.TribeApp.toast('Summaries run on the host\'s local brain. Connect to a tribe first.');
    if (dirty) await save();
    setTldr('<span class="faint">Thinking…</span>');
    try { const r = await C.api(`/docs/${cur.slug}/summarize`, { method: 'POST' }); cur.summary = r.summary; renderTldr(); }
    catch (e) { cur.summary = ''; renderTldr(); window.TribeApp.toast(e.status === 503 ? 'The local brain is off. Install Ollama and a Qwen model on the host.' : e.message); }
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
    if (made) { window.TribeStore.set({ checklist: { drop: true } }); window.TribeApp.refresh(); window.TribeApp.toast(`${made} file${made > 1 ? 's' : ''} added to Docs`); }
  }

  // ---------- rendering ----------
  function setStatus(t) { const el = $('#doc-status'); if (el) el.textContent = t; }
  function setTldr(html) { const el = $('#doc-tldr-text'); if (el) el.innerHTML = html; }
  function renderTldr() {
    const box = $('#doc-tldr'); if (!box) return;
    if (cur && cur.summary) { box.classList.remove('empty'); setTldr(esc(cur.summary).replace(/\n/g, '<br>')); }
    else { box.classList.add('empty'); setTldr(`No TL;DR yet. ${remote() ? '<button class="linkish" id="doc-sum">Summarize with local brain</button>' : 'Summaries run on the host\'s local brain.'}`); const b = $('#doc-sum'); if (b) b.onclick = summarize; }
  }

  function renderList() {
    const el = $('#doc-list'); if (!el) return;
    if (window.TribeDocsX) return window.TribeDocsX.renderList(el, list, { filter, cur, open, nameOf, ago });   // pins + nested tree
    const f = filter.toLowerCase();
    const items = list.filter(d => !f || d.title.toLowerCase().includes(f));
    el.innerHTML = items.length ? items.map(d => `<button class="doc-item ${cur && cur.slug === d.slug ? 'on' : ''}" data-slug="${esc(d.slug)}">
        <span class="t">${esc(d.title)}</span><span class="m">${ago(d.updated)}${d.updatedBy ? ' · ' + esc(nameOf(d.updatedBy)) : ''}</span></button>`).join('')
      : `<div class="faint" style="padding:12px;font-size:13px">${list.length ? 'No matches' : 'No docs yet. Create one or drop files here.'}</div>`;
    el.querySelectorAll('[data-slug]').forEach(b => b.onclick = () => open(b.dataset.slug));
  }

  function renderEditor() {
    const pane = $('#doc-pane'); if (!pane) return;
    if (!cur) {
      pane.innerHTML = `<div class="doc-empty"><svg class="i"><use href="#i-doc"/></svg><h2>Your tribe's docs live here</h2>
        <p>Plain Markdown files in the tribe folder: design docs, notes, plans. Type <span class="kbd">/</span> in a doc for blocks.</p>
        <button class="btn primary" id="doc-first">New doc</button></div>`;
      $('#doc-first').onclick = () => create(); return;
    }
    pane.innerHTML = `
      <div class="doc-banner hidden" id="doc-banner"></div>
      <div class="doc-toolbar">
        <div class="seg"><button data-mode="write" class="${mode === 'write' ? 'on' : ''}">Write</button><button data-mode="read" class="${mode === 'read' ? 'on' : ''}">Read</button></div>
        <span class="faint" id="doc-status">${cur.updated ? `Saved · ${ago(cur.updated)}${cur.updatedBy ? ' by ' + esc(nameOf(cur.updatedBy)) : ''}` : ''}</span>
        <span class="doc-peers hidden" id="doc-peers" aria-live="polite"></span>
        <button class="btn ghost" id="doc-del" title="Delete doc" style="margin-left:auto"><svg class="i"><use href="#i-x"/></svg>Delete</button>
      </div>
      <input class="doc-title" id="doc-title" value="${esc(cur.title)}" maxlength="120" placeholder="Untitled">
      <div class="doc-meta">${cur.source ? `Imported from ${esc(cur.source)} · ` : ''}${(cur.body || '').split(/\s+/).filter(Boolean).length} words · <span class="faint">${remote() ? 'shared with your tribe' : 'saved on this device'}</span></div>
      <div class="doc-tldr" id="doc-tldr"><div class="lbl"><svg class="i" style="width:14px;height:14px"><use href="#i-spark"/></svg>TL;DR · local brain, 0 tokens</div><div id="doc-tldr-text"></div></div>
      <div class="doc-edit ${mode === 'write' ? '' : 'hidden'}"><textarea id="doc-body" spellcheck="true" placeholder="Start writing, or type / for blocks…">${esc(inLive() ? sess.text() : cur.body || '')}</textarea></div>
      <article class="md ${mode === 'read' ? '' : 'hidden'}" id="doc-read"></article>
      <div class="slash hidden" id="doc-slash" role="listbox"></div>`;
    renderTldr();
    const ta = $('#doc-body'), title = $('#doc-title');
    if (inLive()) sess.attach(ta);
    autosize(ta); renderPeers();
    title.oninput = titleChanged;
    title.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } };
    ta.oninput = () => { autosize(ta); changed(); checkSlash(); if (window.TribeDocsX) window.TribeDocsX.onInput(ta); };
    ta.onkeydown = onKey;
    ta.onblur = () => setTimeout(hideSlash, 150);
    ta.ondragover = e => e.preventDefault();
    ta.ondrop = async e => { if (e.dataTransfer.files.length) { e.preventDefault(); importFiles([...e.dataTransfer.files]); } };
    pane.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; renderEditor(); });
    if (inLive()) sess.status();
    $('#doc-del').onclick = () => { if (confirmDelete()) remove(); };
    if (mode === 'read') renderRead();
    if (window.TribeDocsX) window.TribeDocsX.afterEditor(pane, cur, mode);   // breadcrumbs, backlinks, comments, history
  }

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

  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(320, ta.scrollHeight + 4) + 'px'; }

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
    ta.setRangeText(text, slash.start, end, 'end');
    if (key === 'code') ta.selectionStart = ta.selectionEnd = slash.start + 4;
    hideSlash(); autosize(ta); changed(); ta.focus();
  }
  function caretXY(ta, pos) {
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
  document.addEventListener('click', e => { if (e.target.closest('#doc-new')) create(); });
  document.addEventListener('dragover', e => { if (e.target.closest('#doc-list-wrap')) { e.preventDefault(); $('#doc-list-wrap').classList.add('over'); } });
  document.addEventListener('dragleave', e => { if (e.target.closest && e.target.closest('#doc-list-wrap') && !e.target.closest('#doc-list-wrap').contains(e.relatedTarget)) $('#doc-list-wrap').classList.remove('over'); });
  document.addEventListener('drop', e => { const w = e.target.closest && e.target.closest('#doc-list-wrap'); if (w) { e.preventDefault(); w.classList.remove('over'); importFiles([...e.dataTransfer.files]); } });

  async function refreshList() { if (remote()) { try { list = (await C.api('/docs')).docs; } catch {} } renderList(); }
  window.TribeDocs = { load, create, importFiles, open, saveNow: () => save(), isDirty: () => dirty || !!(sess && sess.pending()), setLive, live: () => inLive() && sess.joined,
    current: () => cur, list: () => list, refreshList, renderList, changed, caretXY, mode: () => mode, setMode: m => { mode = m; renderEditor(); } };
})();
