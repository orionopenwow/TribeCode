// p13 Files · What we know: the project's living brain, as the top of Files (server/brainhub.js).
//   The hero card "What we know" (a summary that updates itself, worked out with no AI; "Say it in plain words" when an
//   AI is connected), one box to search Files or paste a link to save it, and quick counts that jump to a section.
//   Files gets four more tabs: Links (saved links and notes, the old Captures), Decisions, Questions; Code shows the
//   project's code and the GitHub links people saved. Every item opens the side reader: full notes, tags and title
//   editable in place, Pin, Use in design, Make tasks, Remove (people only).
//   The design flow's "From Files" picker (references, colours, fonts, pictures; "Use what Files knows").
// Page text is shown as plain text only (escaped); nothing from a saved page runs here.
//   window.TribeFilesBrain = { attach(o), cats(), items(), lead(cat), noCount(cat), open(it), act(k, it, a, arg), go(section),
//     openItem(id), add(url|note), designPicker(el, textarea), optedIn(), knows(), flint(text), useInDesign(items) }
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const ico = (n, sz = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, sz, 'fb-i') : '');
  const pid = () => (C && C.project ? C.project() : null);
  const me = () => ((C.state && C.state()) || {}).me || {};
  const human = () => me().role && me().role !== 'agent' && me().role !== 'spectator';
  const canWrite = () => me().role && me().role !== 'spectator';
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const ago = at => (window.TribeFilesView && window.TribeFilesView.ago ? window.TribeFilesView.ago(at) : '');
  const thumbUrl = id => { const u = `${C.base()}/api/captures/${encodeURIComponent(id)}/thumb${pid() ? '?project=' + encodeURIComponent(pid()) : ''}`; return window.TribeMedia ? window.TribeMedia.url(u) : u; };
  const safeHref = u => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : ''; } catch { return ''; } };
  const isUrl = s => /^https?:\/\/\S+$/i.test(String(s || '').trim());
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  const CATS = [['links', 'Links', 'link'], ['decisions', 'Decisions', 'vote'], ['questions', 'Questions', 'help']];
  const st = { data: null, pid: null, loading: false, tag: '', kind: '', q: '', fv: null, refresh: null, slot: null, at: 0 };

  // ---------- data ----------
  async function load(force) {
    if (!C || !C.connected || !C.connected() || !pid()) return null;
    if (!force && st.data && st.pid === pid() && Date.now() - st.at < 4000) return st.data;
    if (st.loading) return st.loading;
    st.loading = (async () => {
      try { const d = await C.api('/brain'); st.data = d; st.pid = pid(); st.at = Date.now(); return d; }
      catch { return st.data; } finally { st.loading = null; }
    })();
    return st.loading;
  }
  const people = id => ((C.state() || {}).members || []).find(m => m.id === id) || null;

  // ---------- the hero ----------
  function hero() {
    const d = st.data, s = d ? d.summary : null, n = d ? d.counts : {};
    const chip = (cat, k, one, many) => (n[k] ? `<button type="button" class="fb-stat" data-fb-cat="${cat}">${esc(String(n[k]))} ${esc(n[k] === 1 ? one : many)}</button>` : '');
    return `<section class="fb-hero" id="fb-hero" aria-labelledby="fb-h">
      <div class="fb-hh"><span class="eyebrow">What we know</span><h2 id="fb-h">${esc((((window.TribeProjects && window.TribeProjects.list && window.TribeProjects.list()) || []).find(p => p.id === pid()) || {}).name || 'This project')}</h2></div>
      <p class="fb-sum${st.more ? ' open' : ''}" id="fb-sum">${s ? esc(s.text) : '<span class="fb-skel"></span><span class="fb-skel short"></span>'}</p>
      ${s ? `<p class="fb-via"><span>${esc(s.model ? `Said in plain words by ${s.via}` : 'Worked out from your links, notes, decisions and tasks')} · ${esc(ago(s.at) || 'just now')}</span>${d.ai && canWrite() ? `<button type="button" class="linkish" id="fb-rewrite">${s.model ? 'Say it again' : 'Say it in plain words'}</button>` : ''}${s.model ? '<button type="button" class="linkish" id="fb-plain">Show the worked-out one</button>' : ''}</p>` : ''}
      <form class="fb-find" id="fb-find" role="search">
        <label class="fb-box">${ico('search', 16)}<span class="sr-only">Search Files or paste a link</span><input id="fb-q" type="search" autocomplete="off" spellcheck="false" placeholder="${canWrite() ? 'Search what we know, or paste a link to save it' : 'Search what we know'}" value="${esc(st.q)}"></label>
        <button type="submit" class="btn primary hidden" id="fb-save">${ico('plus', 15)}<span>Save link</span></button>
      </form>
      <div class="fb-stats" id="fb-stats">${d ? [chip('links', 'links', 'link', 'links'), chip('links', 'notes', 'note', 'notes'), chip('decisions', 'decisions', 'decision', 'decisions'), chip('questions', 'questions', 'open question', 'open questions'), chip('code', 'github', 'code link', 'code links'), chip('docs', 'docs', 'doc', 'docs')].join('') : ''}${canWrite() ? `<button type="button" class="fb-stat ghost" id="fb-note">${ico('notes', 14)}Add a note</button>` : ''}</div>
      <div class="fb-drop" aria-hidden="true">${ico('link', 22)}<b>Drop a link or a text file to save it</b></div>
    </section>`;
  }
  function paintHero() {
    const slot = st.slot; if (!slot || !slot.isConnected) return;
    const had = document.activeElement && document.activeElement.id === 'fb-q', pos = had ? document.activeElement.selectionStart : 0;
    slot.innerHTML = hero(); wireHero(slot);
    if (had) { const i = slot.querySelector('#fb-q'); i.focus(); try { i.setSelectionRange(pos, pos); } catch {} }
  }
  function wireHero(slot) {
    const q = slot.querySelector('#fb-q'), save = slot.querySelector('#fb-save'), form = slot.querySelector('#fb-find');
    const sync = () => { const v = q.value.trim(); save.classList.toggle('hidden', !(canWrite() && isUrl(v))); st.q = isUrl(v) ? '' : v; if (st.fv && st.fv.setQ) st.fv.setQ(st.q); };
    let t = null; q.oninput = () => { clearTimeout(t); t = setTimeout(sync, 120); };
    q.addEventListener('paste', () => setTimeout(() => { const v = q.value.trim(); if (canWrite() && isUrl(v)) { sync(); form.requestSubmit(); } }, 0));
    q.onkeydown = e => { if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; sync(); } };
    form.onsubmit = async e => { e.preventDefault(); const v = q.value.trim(); if (!isUrl(v)) return sync(); save.disabled = true; const r = await add(v); save.disabled = false; if (r) { q.value = ''; sync(); setCat('links'); } };
    slot.querySelectorAll('[data-fb-cat]').forEach(b => b.onclick = () => setCat(b.dataset.fbCat));
    const rw = slot.querySelector('#fb-rewrite'); if (rw) rw.onclick = async () => { rw.disabled = true; rw.textContent = 'Thinking…'; try { st.data = await C.api('/brain/summary', { method: 'POST', body: { model: true } }); st.at = Date.now(); } catch (e) { toast(e.message); } paintHero(); };
    const pl = slot.querySelector('#fb-plain'); if (pl) pl.onclick = async () => { try { st.data = await C.api('/brain/summary', { method: 'POST', body: {} }); st.at = Date.now(); } catch (e) { toast(e.message); } paintHero(); };
    const nb = slot.querySelector('#fb-note'); if (nb) nb.onclick = () => noteSheet();
    const sm = slot.querySelector('#fb-sum'); if (sm) sm.onclick = () => { if (!isPhone()) return; st.more = !st.more; sm.classList.toggle('open', st.more); };   // phones: the summary opens with a tap
    // drop a link or a text file on the hero
    const hz = slot.querySelector('#fb-hero'); let n = 0;
    const ok = e => { const ty = [...((e.dataTransfer && e.dataTransfer.types) || [])]; return canWrite() && (ty.includes('text/uri-list') || ty.includes('Files') || ty.includes('text/plain')); };
    hz.addEventListener('dragenter', e => { if (!ok(e)) return; e.preventDefault(); e.stopPropagation(); n++; hz.classList.add('drop'); });
    hz.addEventListener('dragover', e => { if (ok(e)) { e.preventDefault(); e.stopPropagation(); } });
    hz.addEventListener('dragleave', () => { if (--n <= 0) { n = 0; hz.classList.remove('drop'); } });
    hz.addEventListener('drop', async e => {
      if (!ok(e)) return; e.preventDefault(); e.stopPropagation(); n = 0; hz.classList.remove('drop');
      const dt = e.dataTransfer, uri = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split('\n').map(s => s.trim()).find(s => isUrl(s));
      if (uri) { await add(uri); return setCat('links'); }
      for (const f of [...(dt.files || [])].slice(0, 5)) {
        if (!/^text\/|json|csv|markdown/.test(f.type || '') && !/\.(md|txt|csv|json|markdown)$/i.test(f.name)) { toast(`${f.name}: drop it on the files below to upload it. Here I keep links and text.`); continue; }
        if (f.size > 200 * 1024) { toast(`${f.name} is too big for a note (200 KB).`); continue; }
        await add({ title: f.name.replace(/\.[^.]+$/, ''), text: await f.text(), file: f.name });
      }
      setCat('links');
    });
  }
  // a small sheet to write a note
  function noteSheet() {
    const m = document.createElement('div'); m.className = 'modal fb-modal'; m.id = 'fb-note-sheet'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Add a note');
    m.innerHTML = `<form class="modal-card fb-note-card"><div class="sec-head"><span class="eyebrow">Files · What we know</span><h2>Add a note</h2></div>
      <input class="input" id="fb-note-t" placeholder="Title" maxlength="120" autocomplete="off">
      <textarea class="input" id="fb-note-x" rows="6" placeholder="What should everyone (and every agent) know?"></textarea>
      <input class="input" id="fb-note-tags" placeholder="Tags, with commas (optional)" autocomplete="off">
      <div class="fb-row"><button class="btn primary" type="submit">Save note</button><button class="btn ghost" type="button" id="fb-note-x-btn">Cancel</button></div></form>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.addEventListener('click', e => { if (e.target === m) close(); });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    m.querySelector('#fb-note-x-btn').onclick = close;
    m.querySelector('form').onsubmit = async e => { e.preventDefault(); const r = await add({ title: m.querySelector('#fb-note-t').value, text: m.querySelector('#fb-note-x').value, tags: m.querySelector('#fb-note-tags').value.split(',').map(s => s.trim()).filter(Boolean) }); if (r) { close(); setCat('links'); } };
    setTimeout(() => m.querySelector('#fb-note-t').focus(), 30);
  }

  async function add(x) {
    try {
      const r = await C.api('/brain', { method: 'POST', body: typeof x === 'string' ? { url: x } : { note: x } });
      toast(typeof x === 'string' ? (r.duplicate ? 'Already in Files. Opening it.' : `Saved to Files: ${r.item.title}`) : 'Note saved to Files');
      await reload(); return r;
    } catch (e) { toast(e.message); return null; }
  }
  async function reload() { await load(true); paintHero(); if (st.refresh) st.refresh(); }

  // ---------- Files integration (filegrid.js / filesview.js) ----------
  function attach(o) {
    st.slot = o.slot; st.fv = o.fv; st.refresh = o.refresh;
    if (st.pid !== pid()) { st.data = null; st.tag = ''; st.kind = ''; }
    paintHero();
    if (st.q && st.fv && st.fv.setQ) st.fv.setQ(st.q);
    load().then(d => { if (!d || !st.slot || !st.slot.isConnected) return; paintHero(); if (st.refresh) st.refresh(); });
  }
  const cats = () => CATS;
  function items() {
    const d = st.data; if (!d || st.pid !== pid()) return [];
    const T = window.TribeFilesView.thumb, out = [];
    const tile = (it, kind) => `<div class="fg-th fb-th"><span class="fb-th-src">${ico(kind === 'note' ? 'notes' : 'link', 13)}${esc(kind === 'note' ? 'Note' : it.site || 'Link')}</span><b>${esc(it.title)}</b><span class="fb-th-sum">${esc(kind === 'note' ? it.text : it.summary)}</span>${(it.tags || []).length ? `<span class="fb-tags">${it.tags.slice(0, 3).map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}</div>`;
    const keep = it => (!st.tag || (it.tags || []).includes(st.tag)) && (!st.kind || (st.kind === 'note' ? it.type === 'note' : st.kind === 'video' ? /video|short/.test(it.kind || '') : st.kind === 'voice' ? it.type === 'voice' : it.type === 'link' && !/video|short/.test(it.kind || '')));
    for (const l of d.links.filter(keep)) {
      const who = people(l.by);
      out.push({ src: 'brain', id: 'fb:' + l.id, bid: l.id, item: l, cat: 'links', type: `${l.pinned ? 'Pinned · ' : ''}${l.type === 'voice' ? (l.site && l.site !== 'Huddle' ? l.site : 'Voice note') : l.site || 'Link'}`, title: l.title, at: l.at, pin: l.pinned,
        owner: who ? { name: who.name, color: who.color } : l.byName ? { name: l.byName, color: 'var(--peer)' } : null, text: `${l.summary} ${(l.tags || []).join(' ')} ${l.site}`,
        thumb: l.thumb ? `<div class="fg-th fb-th has-img"><img alt="" loading="lazy" src="${esc(thumbUrl(l.id))}"><span class="fb-th-cap"><span class="fb-th-sum">${esc(l.summary)}</span></span></div>` : tile(l, 'link'), cls: 'fb-card', attrs: `data-fb-id="${esc(l.id)}"`, acts: ['open', 'rename', ...(human() ? ['delete'] : [])] });
    }
    for (const n of d.notes.filter(keep)) {
      const who = people(n.by);
      out.push({ src: 'brain', id: 'fb:' + n.id, bid: n.id, item: n, cat: 'links', type: `${n.pinned ? 'Pinned · ' : ''}Note${n.agent ? ' from an agent' : ''}`, title: n.title, at: n.at, pin: n.pinned,
        owner: who ? { name: who.name, color: who.color } : { name: n.byName || '?', color: 'var(--peer)' }, text: `${n.text} ${(n.tags || []).join(' ')}`, thumb: tile(n, 'note'), cls: 'fb-card', attrs: `data-fb-id="${esc(n.id)}"`, acts: ['open', 'rename', ...(human() ? ['delete'] : [])] });
    }
    return out;
  }
  const qNow = () => (st.fv && st.fv.state ? st.fv.state().q : st.q || '').toLowerCase();
  const matches = (...s) => { const q = qNow(); return !q || s.join(' ').toLowerCase().includes(q); };
  function lead(cat) {
    const d = st.data; if (!d || st.pid !== pid()) return cat === 'decisions' || cat === 'questions' ? `<div class="fb-lead"><p class="fb-empty">Gathering…</p></div>` : '';
    if (cat === 'links') {
      const tags = d.tags.slice(0, 10), kinds = [['', 'Everything'], ['link', 'Pages'], ['video', 'Videos'], ['voice', 'Voice notes'], ['note', 'Notes']].filter(([k]) => !k || d.links.concat(d.notes).some(it => k === 'note' ? it.type === 'note' : k === 'video' ? /video|short/.test(it.kind || '') : k === 'voice' ? it.type === 'voice' : it.type === 'link' && !/video|short/.test(it.kind || '')));
      if (!d.links.length && !d.notes.length) return `<div class="fb-lead"><div class="fb-empty-card"><b>No links yet</b><p>Paste a link in chat or in the box above. It is read, summed up and kept here, and every agent can use it.</p></div></div>`;
      return `<div class="fb-lead fb-filters" role="group" aria-label="Filter links">${kinds.length > 2 ? kinds.map(([k, l]) => `<button type="button" class="fb-chip${st.kind === k ? ' on' : ''}" data-fb-kind="${k}" aria-pressed="${st.kind === k}">${esc(l)}</button>`).join('') : ''}${tags.length ? `${kinds.length > 2 ? '<span class="fb-sep" aria-hidden="true"></span>' : ''}${tags.map(t => `<button type="button" class="fb-chip tag${st.tag === t ? ' on' : ''}" data-fb-tag="${esc(t)}" aria-pressed="${st.tag === t}">#${esc(t)}</button>`).join('')}` : ''}</div>`;
    }
    if (cat === 'decisions') {
      const list = d.decisions.filter(x => matches(x.text, x.from));
      return `<div class="fb-lead"><div class="fb-sh"><span class="eyebrow">Decisions</span><h3>What we decided</h3></div>${list.length ? `<ol class="fb-list">${list.slice(0, 60).map(x => `<li class="fb-li"${x.ref ? ` data-fb-open="${esc(x.ref)}" tabindex="0" role="button"` : ''}><span class="fb-li-t">${esc(x.text)}</span><small>${esc([x.from, x.by, ago(x.at)].filter(Boolean).join(' · '))}</small></li>`).join('')}</ol>` : `<p class="fb-empty">${qNow() ? 'No decision matches that.' : 'No decisions yet. Type /decide in chat, or they are picked up from links and voice notes.'}</p>`}</div>`;
    }
    if (cat === 'questions') {
      const list = d.questions.filter(x => matches(x.text, x.by));
      return `<div class="fb-lead"><div class="fb-sh"><span class="eyebrow">Open questions</span><h3>Still to answer</h3></div>${list.length ? `<ol class="fb-list">${list.map((x, i) => `<li class="fb-li"><span class="fb-li-t">${esc(x.text)}</span><small>${esc([x.by, ago(x.at)].filter(Boolean).join(' · '))}</small>${human() ? `<span class="fb-li-a"><button type="button" class="btn sm" data-fb-qtask="${i}">Make a task</button></span>` : ''}</li>`).join('')}</ol>` : `<p class="fb-empty">${qNow() ? 'No question matches that.' : 'No open questions. Questions people ask in chat show up here.'}</p>`}</div>`;
    }
    if (cat === 'code') {
      const c = d.code; if (!c.folder && !c.github.length) return '';
      const f = c.folder;
      return `<div class="fb-lead fb-code"><div class="fb-sh"><span class="eyebrow">Code</span><h3>Where the code is</h3></div>
        ${f ? `<div class="fb-codecard">${ico('git', 18)}<div><b>${esc(f.branch)}</b><small>${esc([f.last ? `last saved "${f.last.subject}" by ${f.last.author}` : '', f.changed ? `${f.changed} unsaved change${f.changed === 1 ? '' : 's'}` : 'nothing unsaved', f.behind ? `${f.behind} newer on GitHub` : ''].filter(Boolean).join(' · '))}</small></div></div>` : ''}
        ${c.github.map(g => `<div class="fb-codecard" data-fb-open="${esc(g.id)}" role="button" tabindex="0">${ico('github', 18)}<div><b>${esc(g.name)}</b><small>${esc(g.summary || g.title)}</small></div></div>`).join('')}</div>`;
    }
    return '';
  }
  const noCount = cat => cat === 'decisions' || cat === 'questions';
  function wire(body) {
    body.querySelectorAll('[data-fb-tag]').forEach(b => b.onclick = () => { st.tag = st.tag === b.dataset.fbTag ? '' : b.dataset.fbTag; if (st.refresh) st.refresh(); });
    body.querySelectorAll('[data-fb-kind]').forEach(b => b.onclick = () => { st.kind = b.dataset.fbKind; if (st.refresh) st.refresh(); });
    body.querySelectorAll('[data-fb-open]').forEach(el => { const go = () => openItem(el.dataset.fbOpen); el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
    body.querySelectorAll('[data-fb-qtask]').forEach(b => b.onclick = async () => { const x = st.data.questions[+b.dataset.fbQtask]; if (!x) return; try { await C.api('/tasks', { method: 'POST', body: { title: `Answer: ${x.text}`.slice(0, 200), body: `Asked by ${x.by} in chat.` } }); toast('Made a task'); b.disabled = true; } catch (e) { toast(e.message); } });
  }
  function setCat(cat) {
    if (st.fv && st.fv.setCat) st.fv.setCat(cat);
    const t = document.getElementById('fg-tab-' + cat); if (t) t.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  async function act(k, it, anchor, arg) {
    const id = it.bid, isNote = it.item.type === 'note';
    if (k === 'rename') { await C.api('/brain/' + encodeURIComponent(id), { method: 'PATCH', body: { title: arg } }); await load(true); return toast('Renamed.'); }
    if (k === 'delete') { await removeItem(it.item); return; }
  }
  async function removeItem(item) {
    if (item.type === 'note') await C.api('/brain/' + encodeURIComponent(item.id), { method: 'DELETE' });
    else await C.api('/captures/' + encodeURIComponent(item.id), { method: 'DELETE' });
    toast('Removed from Files.'); await load(true); paintHero(); if (st.refresh) st.refresh();
  }

  // ---------- the side reader ----------
  let cur = null;
  async function openItem(id) {
    if (!id) return;
    const known = st.data && st.data.links.concat(st.data.notes).find(x => x.id === id);
    reader(known || { id, title: '…', type: 'link' }, true);
    try { const r = await C.api('/brain/' + encodeURIComponent(id)); if (cur && cur.id === id) reader(r.item); } catch (e) { toast(e.message); closeReader(); }
  }
  const open = it => openItem(it.bid);
  function reader(item, loading) {
    cur = item; let el = $('#fb-reader');
    const back = document.activeElement;
    if (!el) { el = document.createElement('aside'); el.id = 'fb-reader'; el.className = 'fb-reader'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Item from Files'); document.body.appendChild(el); el._back = back; requestAnimationFrame(() => el.classList.add('in')); }
    const note = item.type === 'note', href = safeHref(item.url);
    const look = item.look || {}, sw = (look.colors || []).slice(0, 6), fonts = (look.fonts || []).slice(0, 4);
    el.innerHTML = `<header class="fb-rh"><span class="eyebrow">${esc(note ? 'Note' : item.type === 'voice' ? (item.site && item.site !== 'Huddle' ? item.site : 'Voice note') : item.site || 'Link')}</span>
        <button type="button" class="fb-x" id="fb-r-x" aria-label="Close">${ico('x', 18)}</button></header>
      <div class="fb-rb">
        <input class="fb-rt" id="fb-r-title" value="${esc(item.title)}" maxlength="200" aria-label="Title" ${canWrite() && !loading ? '' : 'readonly'}>
        <p class="fb-rmeta">${esc([item.byName ? `Added by ${item.byName}` : '', ago(item.at), item.author ? `by ${item.author}` : ''].filter(Boolean).join(' · '))}${href ? ` · <a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">Open the page ${ico('external', 12)}</a>` : ''}</p>
        <label class="fb-rtags">${ico('flag', 14)}<input id="fb-r-tags" value="${esc((item.tags || []).join(', '))}" placeholder="Add tags, with commas" aria-label="Tags" ${canWrite() && !loading ? '' : 'readonly'}></label>
        ${item.thumb && !note ? `<img class="fb-rimg" alt="" src="${esc(thumbUrl(item.id))}">` : ''}
        ${loading ? '<p class="fb-empty">Loading…</p>' : note ? `<textarea class="fb-rtext" id="fb-r-text" rows="10" aria-label="Note" ${canWrite() ? '' : 'readonly'}>${esc(item.text)}</textarea>` : `
          ${item.summary ? `<section class="fb-rs"><span class="eyebrow">Summary</span><p>${esc(item.summary)}</p></section>` : item.note ? `<p class="fb-empty">${esc(item.note)}</p>` : ''}
          ${(item.points || []).length ? `<section class="fb-rs"><span class="eyebrow">Key points</span><ul>${item.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></section>` : ''}
          ${(item.decisionsList || []).length ? `<section class="fb-rs"><span class="eyebrow">Decisions</span><ul>${item.decisionsList.map(p => `<li>${esc(p)}</li>`).join('')}</ul></section>` : ''}
          ${(item.actionItems || []).length ? `<section class="fb-rs"><span class="eyebrow">To do</span><ul>${item.actionItems.map(a => `<li>${esc(a.text)}${a.task ? ' <small class="faint">(a task)</small>' : ''}</li>`).join('')}</ul></section>` : ''}
          ${sw.length || fonts.length ? `<section class="fb-rs"><span class="eyebrow">Its look</span><div class="fb-look">${sw.map(c => `<span class="fb-sw" title="${esc(c)}"><i style="background:${/^#[0-9a-f]{6}$/i.test(c) ? c : 'transparent'}"></i>${esc(c)}</span>`).join('')}${fonts.map(f => `<span class="fb-font">${esc(f)}</span>`).join('')}</div></section>` : ''}`}
      </div>
      <footer class="fb-rf">
        <button type="button" class="btn primary" id="fb-r-design">${ico('designs', 15)}Use in design</button>
        ${human() && !loading ? `<button type="button" class="btn" id="fb-r-tasks">${ico('check', 15)}Make tasks</button>` : ''}
        ${canWrite() && !loading ? `<button type="button" class="btn ghost" id="fb-r-pin" aria-pressed="${!!item.pinned}">${ico('pin', 15)}${item.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
        ${!note && !loading && window.TribeCaptures ? `<button type="button" class="btn ghost" id="fb-r-notes">Full notes</button>` : ''}
        ${human() && !loading ? `<button type="button" class="btn ghost fb-danger" id="fb-r-rm">${ico('delete', 15)}Remove</button>` : ''}
      </footer>`;
    const $r = s => el.querySelector(s);
    $r('#fb-r-x').onclick = closeReader;
    el.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); closeReader(); } };
    if (!loading) {
      const patch = async body => { try { const r = await C.api('/brain/' + encodeURIComponent(item.id), { method: 'PATCH', body }); Object.assign(cur, r.item); await load(true); if (st.refresh) st.refresh(); } catch (e) { toast(e.message); } };
      const t = $r('#fb-r-title'); t.onkeydown = e => { if (e.key === 'Enter') t.blur(); }; t.onchange = () => { if (t.value.trim()) patch({ title: t.value.trim() }); };
      const g = $r('#fb-r-tags'); g.onkeydown = e => { if (e.key === 'Enter') g.blur(); }; g.onchange = () => patch({ tags: g.value.split(',').map(s => s.trim()).filter(Boolean) });
      const tx = $r('#fb-r-text'); if (tx) { let tt = null; tx.oninput = () => { clearTimeout(tt); tt = setTimeout(() => patch({ text: tx.value }), 700); }; }
      const pin = $r('#fb-r-pin'); if (pin) pin.onclick = async () => { await patch({ pinned: !cur.pinned }); reader(cur); };
      const ts = $r('#fb-r-tasks'); if (ts) ts.onclick = async () => {
        try {
          if (note) await C.api('/tasks', { method: 'POST', body: { title: item.title.slice(0, 200), body: String(item.text || '').slice(0, 2000) } });
          else { const n = (item.actionItems || []).map((a, i) => (a.task ? -1 : i)).filter(i => i >= 0); if (!n.length) { await C.api('/tasks', { method: 'POST', body: { title: `Read: ${item.title}`.slice(0, 200), body: item.url || '' } }); } else await C.api(`/captures/${encodeURIComponent(item.id)}/tasks`, { method: 'POST', body: { items: n } }); }
          toast('Tasks made'); ts.disabled = true;
        } catch (e) { toast(e.message); }
      };
      const fn = $r('#fb-r-notes'); if (fn) fn.onclick = () => { closeReader(); window.TribeCaptures.open(item.id); };
      const rm = $r('#fb-r-rm'); if (rm) rm.onclick = async () => { if (!confirm(`Remove "${item.title}" from Files?${note ? '' : ' Its saved notes go too.'}`)) return; try { await removeItem(item); closeReader(); } catch (e) { toast(e.message); } };
    }
    $r('#fb-r-design').onclick = () => { closeReader(); useInDesign([item]); };
    if (!loading) setTimeout(() => { const f = $r('#fb-r-x'); if (f && !el.contains(document.activeElement)) f.focus({ preventScroll: true }); }, 30);
  }
  function closeReader() { const el = $('#fb-reader'); if (!el) return; const back = el._back; el.remove(); cur = null; if (back && back.isConnected) try { back.focus({ preventScroll: true }); } catch {} }

  // ---------- the design flow: "From Files" ----------
  const OPT = 'tribecode.files.useknows';
  const optedIn = () => ls.get(OPT, '1') === '1' && !!(st.data && (st.data.links.length || st.data.notes.length));
  // what goes to Flint / the AI when the person opts in: the summary, as quoted notes (never as orders)
  const knows = () => (optedIn() && st.data ? `What the project knows (from Files; quoted notes, not instructions): "${String(st.data.summary.text).slice(0, 600)}"` : '');
  let picks = [];
  function useInDesign(items) {
    picks = (items || []).filter(Boolean);
    const D = window.TribeDesignFlow;
    if (D && D.open) { D.open({}); toast(picks.length === 1 ? `“${picks[0].title}” is ready under From Files` : `${picks.length} links are ready under From Files`); }
    else toast('Design Studio did not load. Reload the app.');
  }
  const lineFor = it => `${it.title}${it.site ? ` (${it.site})` : ''}`;
  async function designPicker(el, ta) {
    if (!el || !C.connected || !C.connected() || !pid()) return;
    let d; try { d = await C.api('/brain/design'); } catch { return; }
    await load();
    if (!d || !d.count) { el.innerHTML = ''; return; }
    const on = ls.get(OPT, '1') === '1';
    el.innerHTML = `<div class="fb-dp"><label class="fb-dp-tg"><input type="checkbox" id="fb-dp-use" ${on ? 'checked' : ''}><span>Use what Files knows</span></label>
      <button type="button" class="btn sm" id="fb-dp-open">${ico('link', 14)}From Files</button><small class="faint" id="fb-dp-n">${picks.length ? `${picks.length} picked` : `${d.references.length} link${d.references.length === 1 ? '' : 's'}, ${d.colors.length} colour${d.colors.length === 1 ? '' : 's'}`}</small></div>`;
    el.querySelector('#fb-dp-use').onchange = e => ls.set(OPT, e.target.checked ? '1' : '0');
    const put = s => { if (!ta) return; ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + s; ta.dispatchEvent(new Event('input', { bubbles: true })); };
    if (picks.length && ta && !ta.dataset.fbPut) { ta.dataset.fbPut = '1'; put(`In the spirit of: ${picks.map(lineFor).join('; ')}`); picks = []; }
    el.querySelector('#fb-dp-open').onclick = () => {
      const m = document.createElement('div'); m.className = 'modal fb-modal'; m.id = 'fb-dp-sheet'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'From Files');
      m.innerHTML = `<div class="modal-card fb-dp-card"><div class="sec-head"><span class="eyebrow">From Files</span><h2>Pick what to start from</h2></div>
        ${d.brief ? `<p class="fb-dp-brief">${esc(d.brief)}</p>` : ''}
        ${d.references.length ? `<span class="eyebrow">References</span><div class="fb-dp-refs">${d.references.map((r, i) => `<label class="fb-dp-ref">${r.thumb ? `<img alt="" loading="lazy" src="${esc(thumbUrl(r.id))}">` : `<span class="fb-dp-ri">${ico('link', 16)}</span>`}<span><b>${esc(r.title)}</b><small>${esc(r.site || '')}</small></span><input type="checkbox" data-ref="${i}"></label>`).join('')}</div>` : ''}
        ${d.colors.length ? `<span class="eyebrow">Colours</span><div class="fb-look">${d.colors.map(c => `<button type="button" class="fb-sw" data-col="${esc(c.hex)}" title="From ${esc(c.from)}"><i style="background:${/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : 'transparent'}"></i>${esc(c.hex)}</button>`).join('')}</div>` : ''}
        ${d.fonts.length ? `<span class="eyebrow">Fonts</span><div class="fb-look">${d.fonts.map(f => `<button type="button" class="fb-font" data-font="${esc(f.name)}" title="From ${esc(f.from)}">${esc(f.name)}</button>`).join('')}</div>` : ''}
        <div class="fb-row"><button class="btn primary" type="button" id="fb-dp-ok">Add to the description</button><button class="btn ghost" type="button" id="fb-dp-x">Cancel</button></div></div>`;
      document.body.appendChild(m);
      const close = () => m.remove();
      m.addEventListener('click', e => { if (e.target === m) close(); });
      m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
      m.querySelectorAll('[data-col],[data-font]').forEach(b => b.onclick = () => { b.classList.toggle('on'); b.setAttribute('aria-pressed', String(b.classList.contains('on'))); });
      m.querySelector('#fb-dp-x').onclick = close;
      m.querySelector('#fb-dp-ok').onclick = () => {
        const refs = [...m.querySelectorAll('[data-ref]:checked')].map(i => d.references[+i.dataset.ref]), cols = [...m.querySelectorAll('[data-col].on')].map(b => b.dataset.col), fs = [...m.querySelectorAll('[data-font].on')].map(b => b.dataset.font);
        const parts = [cols.length && `Colours ${cols.join(', ')}`, fs.length && `fonts ${fs.join(' and ')}`, refs.length && `in the spirit of ${refs.map(lineFor).join('; ')}`].filter(Boolean);
        if (parts.length) put(parts.join('; ') + '.');
        close();
      };
      const f = m.querySelector('input,button'); if (f) f.focus();
    };
  }

  // ---------- one way in: Files (Ctrl K jumps here) ----------
  function go(section) {
    const A = window.TribeApp; if (!A) return;
    if (document.body.dataset.view !== 'docs') A.show('docs');
    else if (window.TribeDocs && window.TribeDocs.shelf) window.TribeDocs.shelf();
    let n = 0; (function wait() {
      const h = $('#fb-hero');
      if (!h || !st.fv) { if (++n < 40) return setTimeout(wait, 100); return; }
      if (section && section !== 'top') setCat(section); else if (st.fv.setCat) st.fv.setCat('all');
      h.scrollIntoView({ block: 'start' });
      if (section === 'top') { const q = $('#fb-q'); if (q && !isPhone()) q.focus({ preventScroll: true }); }
    })();
  }

  // ---------- Flint: "what do we know about X", "use the moodboard links" ----------
  async function flint(text) {
    const t = String(text || '').trim();
    let m = /^(?:so\s+)?what\s+do\s+(?:we|you|i)\s+know(?:\s+(?:about|on|of)\s+(.+?))?\s*\??$/i.exec(t);
    if (m) {
      if (!C.connected() || !pid()) return { text: 'Open a project first. What it knows lives at the top of its Files.' };
      if (!m[1]) { const d = await load(true); return { text: d ? d.summary.text : 'Nothing saved yet.', files: true }; }
      try {
        const r = await C.api('/brain/search?q=' + encodeURIComponent(m[1]));
        if (!r.results.length) return { text: `Nothing in Files about "${m[1]}" yet. Paste a link about it in chat and I'll keep it.`, files: true };
        return { text: `About "${m[1]}", Files has: ` + r.results.slice(0, 3).map(x => `${x.type === 'decision' ? 'a decision' : x.type === 'question' ? 'an open question' : x.type === 'note' ? 'a note' : x.type === 'doc' ? 'a doc' : 'a link'} “${x.title}”${x.text && x.type !== 'decision' && x.type !== 'question' ? ` (${String(x.text).slice(0, 120)})` : ''}`).join('; ') + '.', files: true, capture: r.results[0].type === 'link' ? r.results[0].id : null };
      } catch (e) { return { text: e.message }; }
    }
    m = /^use\s+(?:the\s+|our\s+|my\s+)?(.+?)\s+(?:links?|references?|refs)(?:\s+(?:in|for)\s+(?:the\s+)?design)?\s*$/i.exec(t);
    if (m) {
      if (!C.connected() || !pid()) return { text: 'Open a project first.' };
      const d = await load(true); const w = m[1].toLowerCase();
      const hits = d ? d.links.filter(l => (l.tags || []).some(x => x.includes(w)) || `${l.title} ${l.summary}`.toLowerCase().includes(w)) : [];
      if (!hits.length) return { text: `I didn't find ${m[1]} links in Files. Tag a few links "${w}" in Files, then ask again.`, files: true };
      useInDesign(hits.slice(0, 6));
      return { text: `Opening Design Studio with ${hits.length > 6 ? 6 : hits.length} ${m[1]} link${hits.length === 1 ? '' : 's'} under From Files: ${hits.slice(0, 3).map(h => h.title).join('; ')}.` };
    }
    return null;
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#fb-reader') && !document.querySelector('#fb-note-sheet, #fb-dp-sheet')) { const a = document.activeElement; if (a && a.closest && a.closest('#fb-reader')) return; e.stopPropagation(); closeReader(); } }, true);
  // ---------- phones: Files (mobile2.js's hub) gets the same hero and the sections, one column ----------
  const M2 = [['links', 'Links', 'link'], ['decisions', 'Decisions', 'vote'], ['questions', 'Questions', 'help'], ['code', 'Code', 'code']];
  function m2Row(it) {
    const l = it.item, note = l.type === 'note';
    return `<button type="button" class="fb-card fb-m2-row" data-fb-id="${esc(l.id)}">
      <span class="fb-m2-th">${l.thumb ? `<img alt="" loading="lazy" src="${esc(thumbUrl(l.id))}">` : ico(note ? 'notes' : 'link', 18)}</span>
      <span class="fb-m2-b"><b>${esc(l.title)}</b><small>${esc([it.type, it.owner && it.owner.name, ago(l.at)].filter(Boolean).join(' · '))}</small>
      ${(note ? l.text : l.summary) ? `<span class="fb-th-sum">${esc(note ? l.text : l.summary)}</span>` : ''}
      ${(l.tags || []).length ? `<span class="fb-tags">${l.tags.slice(0, 3).map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}</span></button>`;
  }
  function drawM2() {
    const box = $('#fb-m2-list'); if (!box) return;
    const cat = st.m2cat || 'links', q = (st.q || '').toLowerCase();
    document.querySelectorAll('[data-fb-m2]').forEach(b => { const on = b.dataset.fbM2 === cat; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    if (cat === 'links') {
      const rows = items().filter(it => !q || `${it.title} ${it.text}`.toLowerCase().includes(q)).sort((a, b) => ((b.pin ? 1 : 0) - (a.pin ? 1 : 0)) || ((Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)));
      box.innerHTML = lead('links') + (rows.length ? `<div class="fb-m2-rows">${rows.slice(0, 60).map(m2Row).join('')}</div>` : q ? '<p class="fb-empty">Nothing matches that.</p>' : '');
    } else box.innerHTML = lead(cat) || `<p class="fb-empty">${cat === 'code' ? 'No code yet. Links to GitHub people save show up here.' : ''}</p>`;
    wire(box);
    box.querySelectorAll('.fb-m2-row').forEach(b => b.onclick = () => openItem(b.dataset.fbId));
  }
  const m2fv = { setQ(v) { st.q = String(v || ''); drawM2(); }, setCat(k) { st.m2cat = M2.some(c => c[0] === k) ? k : 'links'; drawM2(); }, state: () => ({ q: st.q || '' }) };
  function phoneMount() {
    if (!isPhone() || document.body.dataset.view !== 'docs' || !C.connected || !C.connected() || !pid()) return;
    const view = $('#view-docs'); if (!view) return;
    let sec = $('#fb-m2');
    if (!sec) {
      sec = document.createElement('section'); sec.id = 'fb-m2'; sec.className = 'm2-only fb-m2'; sec.setAttribute('aria-label', 'What we know');
      sec.innerHTML = `<div class="fg-brain" id="fb-m2-hero"></div><nav class="fb-m2-tabs" role="tablist" aria-label="What we know">${M2.map(([k, l, i]) => `<button type="button" role="tab" id="fg-tab-${k}" data-fb-m2="${k}">${ico(i, 14)}<span>${esc(l)}</span></button>`).join('')}</nav><div id="fb-m2-list" class="fb-m2-list"></div>`;
      view.prepend(sec);
      sec.querySelectorAll('[data-fb-m2]').forEach(b => b.onclick = () => m2fv.setCat(b.dataset.fbM2));
    }
    st.refresh = drawM2;
    attach({ slot: sec.querySelector('#fb-m2-hero'), fv: m2fv, refresh: drawM2 });
    drawM2();
  }
  new MutationObserver(() => { if (document.body.dataset.view === 'docs') setTimeout(phoneMount, 0); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  addEventListener('resize', () => { const s = $('#fb-m2'); if (s && !isPhone()) s.remove(); else if (!s) phoneMount(); });

  // keyboard: "/" searches Files while Files is on screen
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || document.body.dataset.view !== 'docs') return;
    const a = document.activeElement; if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    const q = $('#fb-q'); if (q && q.offsetParent) { e.preventDefault(); q.focus(); }
  });
  // live: a new link or note anywhere in the project refreshes the hero
  if (C && C.on) C.on('ws', m => { if (!m || (m.type !== 'brain' && m.type !== 'capture') || m.dm) return; if (m.project && m.project !== pid()) return; if (st.slot && st.slot.isConnected) { clearTimeout(st.wt); st.wt = setTimeout(reload, 600); } else st.at = 0; });

  window.TribeFilesBrain = { attach, cats, items, lead, noCount, wire, open, act, go, openItem, add, designPicker, optedIn, knows, flint, useInDesign, reload, state: () => st };
})();
