// The free AI bridge (feat/agents-free): help from ChatGPT, Gemini, Claude, Copilot or Le Chat on their free plans, with
// no subscription and no key. Copy out → paste into the AI → paste its answer back → apply.
//   Copy out    pick what to send (this file, files, a task, a doc, the preview's error, the website), TribeCode builds a
//               compact context pack (goal, files with paths, constraints, a strict reply format), strips anything that
//               looks like a secret and says so, copies it in one click with a size meter; too big: Split into parts,
//               or Download PDF / TXT to attach.
//   Paste back  a big box, Paste from clipboard (the browser asks first), or drop a TXT / PDF. The answer is read for
//               fenced blocks with paths, unified diffs and whole files: a diff per file with accept / reject per file
//               and per hunk, and calm warnings for risky changes (installs, network calls, eval, secrets, deletions).
//   Apply       shows at once in the Code view and the preview, then saves through PUT /api/code/file (one commit per file,
//               "From ChatGPT (pasted)"); one-click Undo. A site config or a page of HTML goes to the website designer as
//               a new version. Pasted code never runs here.
// Logic: app/ui/aibridge-core.js (TribeBridgeCore). Opened from the Agents Hub ("Use any free AI"), the Code view
// ("Ask a free AI"), the preview's error card, the website designer, the AI-boost card and Flint.
//   window.TribeAIBridge = { open({ src, files, goal, error, task, tab, reply }), close(), guideHtml(), noteError(msg), state() }
(function () {
  'use strict';
  const C = window.TribeClient, B = () => window.TribeBridgeCore;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const ico = (n, s = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, s) : '');
  const has = () => !!(C && C.hasToken && C.hasToken() && C.connected && C.connected());
  const pid = () => (C && C.project && C.project()) || '';
  const num = n => n.toLocaleString('en-US');
  const LKEY = 'tribecode.aibridge.v1';
  const saved = () => { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch { return {}; } };
  const remember = o => { try { localStorage.setItem(LKEY, JSON.stringify({ ...saved(), ...o })); } catch {} };

  let el = null, st = null, lastError = '';
  const fresh = o => ({
    tab: o.tab || 'out', provider: saved().provider || 'chatgpt', src: o.src || (o.files && o.files.length ? 'file' : o.error ? 'error' : 'file'),
    goal: o.goal || '', files: (o.files || []).map(f => ({ path: f.path, text: f.text })), pick: new Set((o.files || []).map(f => f.path)),
    all: null, filter: '', tasks: null, task: o.task || '', docs: null, doc: '', docText: '', docTitle: '', error: o.error || lastError, site: null,
    pk: null, parts: null, paste: o.reply || '', parsed: null, changes: [], risks: [], msg: null, applied: null, busy: false, from: saved().provider || 'chatgpt', repo: null,
  });

  // ---------- the guide in the Agents Hub ----------
  function guideHtml() {
    const P = B() ? B().PROVIDERS : [];
    return `<section class="sec aib-guide" id="aib-guide" aria-labelledby="aib-guide-h">
      <div class="sec-head"><span class="eyebrow">No subscription needed</span><h2 id="aib-guide-h">Use any free AI</h2></div>
      <p class="aib-lead">The free plans of ChatGPT, Gemini, Claude, Copilot and Le Chat can help with your project too. TribeCode packs what they need, you paste it in, then paste the answer back and pick what to keep.</p>
      <ol class="aib-steps">
        <li><b>Copy out</b><span>Pick a file, a task, a doc, an error or the website. One click copies a small pack: the goal, the files and how to answer.</span></li>
        <li><b>Paste into the AI</b><span>Open the AI in a new tab and paste. Too long? Split it into parts, or attach the PDF or TXT.</span></li>
        <li><b>Paste the answer back</b><span>TribeCode reads the code in the answer and shows what changes, file by file. Keep what you like.</span></li>
        <li><b>Apply, or Undo</b><span>The change shows in the preview at once and is saved as a commit. Undo puts it back. Pasted code never runs by itself.</span></li>
      </ol>
      <div class="aib-provs">${P.map(p => `<a class="aib-prov" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" data-aib-site="${esc(p.id)}"><b>${esc(p.name)}</b><span>${esc(p.how)}</span><span class="aib-ext">${esc(p.url.replace(/^https:\/\/|\/$/g, ''))} ${ico('external', 14)}</span></a>`).join('')}</div>
      <div class="hero-acts"><button type="button" class="btn primary" data-aib-open="out">${ico('copy', 15)}Copy out for a free AI</button><button type="button" class="btn" data-aib-open="back">${ico('upload', 15)}Paste an answer back</button></div>
      <p class="faint aib-fine">TribeCode works with these sites; it isn't made by them. Their free plans have daily limits and can change.</p>
    </section>`;
  }

  // ---------- open / close ----------
  function open(o = {}) {
    if (!B()) return;
    const keep = st && el && !el.hidden && !o.fresh ? st : null;
    st = fresh(o); if (keep && !o.files && !o.src) { st = keep; if (o.tab) st.tab = o.tab; }
    if (!el) { el = document.createElement('div'); el.id = 'aib'; el.className = 'aib-scrim'; el.hidden = true; document.body.appendChild(el); el.addEventListener('click', onClick); el.addEventListener('input', onInput); el.addEventListener('change', onChange); el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }); wireDrop(); }
    el.hidden = false; document.body.classList.add('aib-open');
    if (st.src === 'file' && !st.files.length) { const cur = window.TribeCodeFiles && window.TribeCodeFiles.current && window.TribeCodeFiles.current(); if (cur && cur.text != null) { st.files = [{ path: cur.path, text: cur.text }]; st.pick = new Set([cur.path]); } }
    if (st.src === 'file' && !st.files.length && has()) st.src = 'files';   // no file open: pick some
    draw(); loadFor(st.src);
    if (st.paste && st.tab === 'back') read();
    setTimeout(() => { const f = el.querySelector(st.tab === 'back' ? '#aib-paste' : '#aib-goal'); if (f) f.focus({ preventScroll: true }); }, 30);
    return st;
  }
  function close() { if (!el) return; el.hidden = true; document.body.classList.remove('aib-open'); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && el && !el.hidden && !e.defaultPrevented && !el.contains(e.target)) close(); });   // Esc closes it even when focus is still on the button that opened it

  // ---------- data for each source ----------
  async function loadFor(src) {
    if (!has()) { rebuild(); return; }
    try {
      if ((src === 'files' || src === 'file') && !st.all) { st.repo = await C.api('/code').catch(() => ({ hasRepo: false })); st.all = st.repo.hasRepo ? ((await C.api('/code/list')).paths || []) : []; }
      if (src === 'task' && !st.tasks) st.tasks = ((await C.api('/tasks')).tasks || []).filter(t => t.status !== 'done');
      if (src === 'doc' && !st.docs) st.docs = (await C.api('/docs')).docs || [];
      if (src === 'site' && !st.site) {
        const D = window.TribeSiteDesigner, cfg = D && D.cfg && D.cfg();
        st.site = cfg || (pid() ? ((await C.api(`/projects/${encodeURIComponent(pid())}/site-config`).catch(() => null)) || {}).config || null : null);
      }
    } catch {}
    if (st && el && !el.hidden) { rebuild(); draw(); }
  }
  async function readFile(path) { const r = await C.api('/code/file?path=' + encodeURIComponent(path)); if (r.hidden || r.binary || r.tooBig) throw new Error(`${path} can't be sent (${r.hidden ? 'it holds secrets' : r.binary ? 'not text' : 'too big'})`); return r.text || ''; }

  // ---------- the pack ----------
  function rebuild() {
    if (!st) return;
    const o = { goal: st.goal || defaultGoal(), project: projName() };
    if (st.src === 'file' || st.src === 'files') o.files = st.files.filter(f => st.pick.has(f.path));
    if (st.src === 'task') { const t = (st.tasks || []).find(x => x.id === st.task); if (t) o.task = `${t.title}${t.body || t.description ? '\n\n' + (t.body || t.description) : ''}`; }
    if (st.src === 'doc' && st.docText) { o.doc = st.docText; o.docTitle = st.docTitle; }
    if (st.src === 'error') o.error = st.error || '';
    if (st.src === 'site' && st.site) o.site = st.site;
    st.pk = B().pack(o); st.parts = null;
  }
  const projName = () => { try { const p = (C.state().projects || []).find(x => x.id === pid()); return p ? p.name : ''; } catch { return ''; } };
  const defaultGoal = () => ({ error: 'Fix the error the preview shows.', site: 'Improve this website.', task: 'Do this task.', doc: 'Help me with this doc.' })[st.src] || 'Help me improve these files.';
  const prov = () => B().byId(st.provider) || B().PROVIDERS[0];

  // ---------- drawing ----------
  const SRC = [['file', 'This file', 'code'], ['files', 'Files', 'files'], ['task', 'A task', 'tasks'], ['doc', 'A doc', 'docs'], ['error', 'Preview error', 'bug'], ['site', 'Website', 'globe']];
  function draw() {
    if (!el || !st) return;
    if (!st.pk) rebuild();
    const P = B().PROVIDERS, p = prov();
    el.innerHTML = `<div class="aib" role="dialog" aria-modal="true" aria-labelledby="aib-h">
      <header class="aib-head"><div><span class="eyebrow">Free AI bridge</span><h2 id="aib-h">Ask a free AI</h2></div>
        <button type="button" class="aib-x" data-aib="close" aria-label="Close">${ico('x', 20)}</button></header>
      <div class="aib-tabs" role="tablist">
        <button role="tab" id="aib-tab-out" class="aib-tab ${st.tab === 'out' ? 'on' : ''}" aria-selected="${st.tab === 'out'}" data-aib-tab="out"><span class="aib-n">1</span>Copy out</button>
        <button role="tab" id="aib-tab-back" class="aib-tab ${st.tab === 'back' ? 'on' : ''}" aria-selected="${st.tab === 'back'}" data-aib-tab="back"><span class="aib-n">2</span>Paste back</button>
      </div>
      <div class="aib-body">${st.tab === 'out' ? outHtml(P, p) : backHtml(P)}</div>
    </div>`;
  }
  function outHtml(P, p) {
    const pk = st.pk, over = pk.chars > p.budget, pct = Math.min(100, Math.round(pk.chars / p.budget * 100));
    return `<div class="aib-pane" id="aib-out">
      <div class="aib-field"><span class="aib-k">Which AI</span><div class="aib-chips" role="radiogroup" aria-label="Which AI">${P.map(x => `<button type="button" role="radio" class="aib-chip ${x.id === st.provider ? 'on' : ''}" aria-checked="${x.id === st.provider}" data-aib-prov="${x.id}">${esc(x.name)}</button>`).join('')}</div></div>
      <div class="aib-field"><span class="aib-k">What to send</span><div class="aib-chips" role="radiogroup" aria-label="What to send">${SRC.map(([k, l, i]) => `<button type="button" role="radio" class="aib-chip ${k === st.src ? 'on' : ''}" aria-checked="${k === st.src}" data-aib-src="${k}">${ico(i, 14)}${l}</button>`).join('')}</div></div>
      <div class="aib-detail" id="aib-src-detail">${srcDetail()}</div>
      <label class="aib-field"><span class="aib-k">Goal</span><textarea id="aib-goal" class="input aib-goal" rows="2" maxlength="600" placeholder="${esc(defaultGoal())}">${esc(st.goal)}</textarea></label>
      <div class="aib-meter${over ? ' over' : ''}" id="aib-meter"><div class="aib-bar"><i style="width:${pct}%"></i></div>
        <span id="aib-size">${num(pk.chars)} characters · about ${num(pk.tokens)} tokens · ${over ? `longer than ${esc(p.name)}'s free chat takes in one go` : `fits ${esc(p.name)}'s free chat`}</span></div>
      ${pk.removed.length || pk.skipped.length ? `<p class="aib-note aib-strip" id="aib-removed">${ico('shield', 15)}<span>${pk.removed.length ? `Removed ${pk.removed.length === 1 ? 'something that looks like' : pk.removed.length + ' things that look like'} a secret (${esc([...new Set(pk.removed)].join(', '))}) from the pack.` : ''}${pk.skipped.length ? ` Left out ${esc(pk.skipped.join(', '))}: files like that hold secrets.` : ''}</span></p>` : ''}
      <div class="aib-acts">
        <button type="button" class="btn primary" id="aib-copy" data-aib="copy">${ico('copy', 15)}Copy pack</button>
        ${over ? `<button type="button" class="btn" id="aib-split" data-aib="split">Split into parts</button>` : ''}
        <button type="button" class="btn" id="aib-dl-pdf" data-aib="pdf">${ico('download', 15)}PDF</button>
        <button type="button" class="btn" id="aib-dl-txt" data-aib="txt">${ico('download', 15)}TXT</button>
        <a class="btn ghost" id="aib-open-prov" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open ${esc(p.name)} ${ico('external', 14)}</a>
      </div>
      ${st.parts ? `<div class="aib-parts" id="aib-parts"><p class="aib-k">${st.parts.length} parts · paste them in order, one message each</p>${st.parts.map((x, i) => `<button type="button" class="btn sm" data-aib-part="${i}">Copy part ${i + 1} <span class="faint">${num(x.length)}</span></button>`).join('')}</div>` : ''}
      <p class="faint aib-how">${esc(p.how)}</p>
      <details class="aib-peek"><summary>See the pack</summary><pre id="aib-pack">${esc(pk.text)}</pre></details>
      <div class="aib-next"><span>When ${esc(p.name)} answers, copy its whole answer.</span><button type="button" class="btn" data-aib-tab="back">Paste back →</button></div>
    </div>`;
  }
  function srcDetail() {
    const s = st.src;
    if (!has() && s !== 'error') return `<p class="aib-note">${s === 'site' ? 'Open the website designer to send the website.' : 'This needs a tribe: files, tasks and docs live there. Paste back still reads any answer.'}</p>`;
    if (s === 'file') {
      if (st.files.length) return `<p class="aib-sel">${st.files.filter(f => st.pick.has(f.path)).map(f => `<code>${esc(f.path)}</code>`).join(' ')} <button type="button" class="linkish" data-aib-src="files">Pick other files</button></p>`;
      return `<p class="aib-note">No file is open. <button type="button" class="linkish" data-aib-src="files">Pick files</button></p>`;
    }
    if (s === 'files') {
      if (!st.all) return '<p class="faint">Loading the files…</p>';
      if (!st.all.length) return '<p class="aib-note">This project has no code repository yet, so there are no files to send. A task, a doc or the website still works.</p>';
      const f = st.filter.toLowerCase(), list = st.all.filter(x => !f || x.toLowerCase().includes(f)).slice(0, 60);
      return `<input class="input aib-filter" id="aib-filter" placeholder="Find a file" value="${esc(st.filter)}" aria-label="Find a file">
        <div class="aib-list" id="aib-files" role="group" aria-label="Files">${list.map(x => `<label class="aib-li"><input type="checkbox" data-aib-pick="${esc(x)}" ${st.pick.has(x) ? 'checked' : ''}><code>${esc(x)}</code></label>`).join('') || '<p class="faint">No file matches.</p>'}</div>
        <p class="faint aib-sel">${st.pick.size ? `${st.pick.size} picked` : 'Pick one or a few: smaller packs get better answers.'}</p>`;
    }
    if (s === 'task') {
      if (!st.tasks) return '<p class="faint">Loading the tasks…</p>';
      if (!st.tasks.length) return '<p class="aib-note">No open tasks.</p>';
      return `<select class="input" id="aib-task" aria-label="Task"><option value="">Pick a task</option>${st.tasks.map(t => `<option value="${esc(t.id)}" ${t.id === st.task ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select>`;
    }
    if (s === 'doc') {
      if (!st.docs) return '<p class="faint">Loading the docs…</p>';
      if (!st.docs.length) return '<p class="aib-note">No docs yet.</p>';
      return `<select class="input" id="aib-doc" aria-label="Doc"><option value="">Pick a doc</option>${st.docs.map(d => `<option value="${esc(d.slug)}" ${d.slug === st.doc ? 'selected' : ''}>${esc(d.title || d.slug)}</option>`).join('')}</select>`;
    }
    if (s === 'error') return st.error ? `<pre class="aib-err">${esc(st.error)}</pre>` : '<p class="aib-note">The preview shows no error right now. Errors from the preview appear here.</p>';
    if (s === 'site') return st.site ? `<p class="aib-sel">The website's config: ${esc(st.site.name || 'site')}, ${(st.site.pages || []).length} page${(st.site.pages || []).length === 1 ? '' : 's'}. The AI answers with a changed config, and it comes back as a new version.</p>` : '<p class="faint">Loading the website…</p>';
    return '';
  }
  function backHtml(P) {
    const keep = n => st.changes.filter(c => c.on && c.keep.size).length;
    return `<div class="aib-pane" id="aib-back">
      <div class="aib-field aib-row"><label class="aib-k" for="aib-from">Who answered</label><select id="aib-from" class="input sm">${P.map(x => `<option value="${x.id}" ${x.id === st.from ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="other" ${st.from === 'other' ? 'selected' : ''}>Another AI</option></select></div>
      <div class="aib-drop" id="aib-drop"><textarea id="aib-paste" class="input aib-paste" rows="9" spellcheck="false" placeholder="Paste the AI's whole answer here, or drop a TXT or PDF you downloaded from it.">${esc(st.paste)}</textarea></div>
      <div class="aib-acts">
        <button type="button" class="btn primary" id="aib-read" data-aib="read">Read the answer</button>
        <button type="button" class="btn" id="aib-clip" data-aib="clip">${ico('copy', 15)}Paste from clipboard</button>
        <label class="btn" id="aib-file-l">${ico('upload', 15)}Open a file<input type="file" id="aib-file" accept=".txt,.md,.markdown,.json,.html,.htm,.diff,.patch,.pdf,text/*,application/pdf" hidden></label>
      </div>
      <p class="faint aib-fine">Nothing you paste runs by itself. You see every change first.</p>
      ${st.msg ? `<div class="aib-msg ${esc(st.msg.kind || '')}" id="aib-msg" role="status">${st.msg.html}</div>` : ''}
      ${st.risks.length ? `<div class="aib-risks" id="aib-risks" role="alert"><b>${ico('shield', 15)}Look before you apply</b><ul>${st.risks.map(r => `<li><code>${esc(r.path || 'the answer')}</code> ${esc(r.text)}</li>`).join('')}</ul><span class="faint">Untick anything you don't want. Nothing is run; it is only saved as files.</span></div>` : ''}
      ${st.parsed && (st.parsed.site || st.parsed.html) ? `<div class="aib-site" id="aib-site"><div><b>${st.parsed.site ? 'A website config' : 'A web page (HTML)'}</b><span>Import it into the website designer as a new version. Your current design stays on the Saved shelf.</span></div><button type="button" class="btn primary" id="aib-import" data-aib="import">Import as a new version</button></div>` : ''}
      ${st.changes.length ? `<div class="aib-changes" id="aib-changes">${st.changes.map(changeHtml).join('')}</div>` : ''}
      ${st.changes.length || st.applied ? `<div class="aib-foot">
        ${st.changes.length ? `<button type="button" class="btn primary" id="aib-apply" data-aib="apply" ${keep() && !st.busy && !(st.applied && st.applied.live) ? '' : 'disabled'}>${st.applied && st.applied.live ? 'Applied' : `Apply ${keep()} file${keep() === 1 ? '' : 's'}`}</button>` : ''}
        ${st.applied && st.applied.live ? `<button type="button" class="btn" id="aib-undo" data-aib="undo" ${st.busy ? 'disabled' : ''}>Undo</button>` : ''}
        ${st.applied && st.applied.live && window.TribePreview ? '<button type="button" class="btn ghost" data-aib="preview">Open the preview</button>' : ''}
      </div>` : ''}
    </div>`;
  }
  function changeHtml(c, i) {
    const add = c.hunks.reduce((n, h, k) => n + (c.keep.has(k) ? h.add : 0), 0), del = c.hunks.reduce((n, h, k) => n + (c.keep.has(k) ? h.del : 0), 0);
    const badge = c.err ? '<span class="aib-b err">can\'t apply</span>' : c.kind === 'delete' ? '<span class="aib-b del">delete</span>' : c.isNew ? '<span class="aib-b new">new file</span>' : c.same ? '<span class="aib-b">no change</span>' : '<span class="aib-b">changed</span>';
    return `<article class="aib-file${c.on ? '' : ' off'}" data-path="${esc(c.path)}" data-i="${i}">
      <header><label class="aib-fl"><input type="checkbox" data-aib-file="${i}" ${c.on ? 'checked' : ''} ${c.err || c.same ? 'disabled' : ''} aria-label="Keep the changes to ${esc(c.path)}"><code>${esc(c.path)}</code></label>${badge}<span class="aib-pm"><span class="add">+${add}</span> <span class="del">−${del}</span></span></header>
      ${c.err ? `<p class="aib-note">${esc(c.err)}</p>` : c.hunks.map((h, k) => `<div class="aib-hunk${c.keep.has(k) && c.on ? '' : ' off'}" data-h="${k}">
        <div class="aib-hh"><span class="faint">Lines ${h.oldStart}–${h.oldStart + Math.max(0, h.oldLines - 1)}</span><label class="aib-hk"><input type="checkbox" data-aib-hunk="${i}:${k}" ${c.keep.has(k) ? 'checked' : ''} ${c.on ? '' : 'disabled'}>Keep</label></div>
        <pre class="aib-diff">${h.lines.slice(0, 400).map(l => `<span class="${l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : 'c'}">${esc(l[0] === ' ' ? '  ' + l.slice(1) : l[0] + ' ' + l.slice(1)) || ' '}</span>`).join('')}${h.lines.length > 400 ? `<span class="c">… ${h.lines.length - 400} more lines</span>` : ''}</pre></div>`).join('')}
    </article>`;
  }

  // ---------- reading the answer ----------
  async function read() {
    const text = st.paste;
    st.msg = null; st.changes = []; st.risks = []; st.applied = null;
    const r = B().parse(text); st.parsed = r;
    if (!r.files.length && !r.site && !r.html) { st.msg = { kind: 'calm', html: `<b>${esc(r.problems[0] || 'I could not read that answer.')}</b><span>Your pasted text is still here. Ask the AI to answer again in the reply format from the pack: code in fenced blocks with the file path, like <code>\`\`\`js path=src/game.js</code>.</span>` }; draw(); return; }
    st.busy = true; draw();
    for (const f of r.files) {
      let old = '', exists = false, err = '';
      if (has() && (st.repo === null || st.repo === undefined)) st.repo = await C.api('/code').catch(() => ({ hasRepo: false }));
      if (has() && st.repo && st.repo.hasRepo) { try { old = await readFile(f.path); exists = true; } catch (e) { if (!/not found/i.test(e.message)) err = e.message; } }
      else if (!r.site && !r.html) err = has() ? 'This project has no code repository yet, so there is nowhere to save files.' : 'Join or start a tribe to save files.';
      let next = old;
      if (!err) {
        if (f.kind === 'full') next = f.text;
        else if (f.kind === 'delete') next = '';
        else { const p = B().patch(old, f.hunks); next = p.text; if (p.failed.length === f.hunks.length) err = `The diff for ${f.path} doesn't match the file as it is now (maybe it changed since you copied it). Ask the AI for the whole file instead.`; else if (p.failed.length) err = ''; f.partial = p.failed.length; }
      }
      const hs = err ? [] : B().hunks(old, next);
      st.changes.push({ path: f.path, kind: f.kind, isNew: !exists && f.kind !== 'delete', old, next, hunks: hs, keep: new Set(hs.map((_, k) => k)), on: !err && hs.length > 0, err, same: !err && !hs.length, exists, partial: f.partial || 0 });
    }
    st.risks = B().risks(st.changes.filter(c => !c.err).map(c => ({ path: c.path, kind: c.kind, old: c.old, new: c.next, lines: c.hunks.flatMap(h => h.lines), add: c.hunks.reduce((n, h) => n + h.add, 0), del: c.hunks.reduce((n, h) => n + h.del, 0) })));
    const ok = st.changes.filter(c => c.on).length, parts = [];
    if (ok) parts.push(`${ok} file${ok === 1 ? '' : 's'} to change. Untick a file or a part to leave it out.`);
    if (st.changes.some(c => c.partial)) parts.push('Some parts of a diff did not match and were left out.');
    r.problems.forEach(p => parts.push(p));
    if (parts.length) st.msg = { kind: ok ? 'ok' : 'calm', html: parts.map((p, i) => i ? `<span>${esc(p)}</span>` : `<b>${esc(p)}</b>`).join('') };
    st.busy = false; draw();
  }

  // ---------- applying, optimistic ----------
  const fromName = () => st.from === 'other' ? 'another AI' : (B().byId(st.from) || {}).name || 'an AI';
  async function apply() {
    const list = st.changes.filter(c => c.on && c.keep.size && !c.err);
    if (!list.length || st.busy) return;
    const label = `From ${fromName()} (pasted)`, goal = (st.goal || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const plan = list.map(c => ({ c, text: B().applyHunks(c.old, c.hunks, c.keep) }));
    st.busy = true; st.applied = { live: true, label, files: plan.map(x => ({ path: x.c.path, old: x.c.old, existed: x.c.exists, text: x.text })) };
    plan.forEach(x => show(x.c.path, x.text));   // optimistic: the editor shows it at once
    st.msg = { kind: 'ok', html: `<b>Applied ${plan.length} file${plan.length === 1 ? '' : 's'}.</b><span>Saving… The preview reloads as each file lands.</span>` }; draw();
    const done = [], failed = [];
    for (const x of plan) {
      try {
        let text = x.text;
        if (x.c.exists) {   // conflict check: the file as it is now
          const now = await readFile(x.c.path);
          if (now !== x.c.old) { const p = B().patch(now, B().hunks(x.c.old, x.text)); if (p.failed.length) throw new Error(`${x.c.path} changed since you read the answer`); text = p.text; }
        }
        if (x.c.kind === 'delete') await C.api('/code/file?path=' + encodeURIComponent(x.c.path) + '&message=' + encodeURIComponent(`${label}: remove ${x.c.path}`), { method: 'DELETE' });
        else await C.api('/code/file', { method: 'PUT', body: { path: x.c.path, text, message: `${label}: ${goal || x.c.path}` } });
        done.push(x.c.path); const f = st.applied.files.find(y => y.path === x.c.path); if (f) f.text = text;
      } catch (e) { failed.push([x.c.path, e.message]); show(x.c.path, x.c.old); }
    }
    st.applied.files = st.applied.files.filter(f => done.includes(f.path));
    if (!done.length) st.applied = null;
    st.busy = false;
    if (window.TribePreview && window.TribePreview.refresh) try { window.TribePreview.refresh(); } catch {}
    if (window.TribeCodeFiles && window.TribeCodeFiles.refresh && !(window.TribeCodeFiles.current && window.TribeCodeFiles.current())) try { window.TribeCodeFiles.refresh(); } catch {}
    st.msg = failed.length
      ? { kind: 'calm', html: `<b>${done.length ? `Saved ${done.length}; ` : ''}${failed.length} file${failed.length === 1 ? '' : 's'} could not be saved.</b>${failed.map(([p, m]) => `<span><code>${esc(p)}</code>: ${esc(m)}.</span>`).join('')}<span>Nothing else changed, and the pasted answer is still here. Copy a fresh pack if a file moved on.</span>` }
      : { kind: 'ok', html: `<b>Saved ${done.length} file${done.length === 1 ? '' : 's'}: “${esc(label)}”.</b><span>Each is a commit. Undo puts them back.</span>` };
    draw();
    if (done.length) toast(`Applied ${done.length} file${done.length === 1 ? '' : 's'} from ${fromName()}.`);
    window.dispatchEvent(new CustomEvent('tribe:bridge-applied', { detail: { files: done } }));
  }
  async function undo() {
    if (!st.applied || st.busy) return;
    st.busy = true; draw();
    const label = st.applied.label, bad = [];
    for (const f of [...st.applied.files].reverse()) {
      try {
        if (f.existed) await C.api('/code/file', { method: 'PUT', body: { path: f.path, text: f.old, message: `Undo: ${label}` } });
        else await C.api('/code/file?path=' + encodeURIComponent(f.path) + '&message=' + encodeURIComponent(`Undo: ${label}`), { method: 'DELETE' });
        show(f.path, f.existed ? f.old : null);
      } catch (e) { bad.push(`${f.path}: ${e.message}`); }
    }
    st.applied = bad.length ? st.applied : null; st.busy = false;
    st.msg = bad.length ? { kind: 'calm', html: `<b>Undo could not finish.</b>${bad.map(b => `<span>${esc(b)}</span>`).join('')}` } : { kind: 'ok', html: '<b>Undone.</b><span>The files are back as they were. The answer is still here if you want to try again.</span>' };
    if (window.TribePreview && window.TribePreview.refresh) try { window.TribePreview.refresh(); } catch {}
    draw(); toast(bad.length ? 'Undo could not finish.' : 'Undone.');
  }
  const show = (path, text) => { try { window.TribeCodeFiles && window.TribeCodeFiles.show && window.TribeCodeFiles.show(path, text); } catch {} };

  async function importSite() {
    const r = st.parsed; if (!r) return;
    let cfg = r.site;
    if (!cfg && r.html && window.TribeSiteImport) { try { cfg = window.TribeSiteImport.fromHtml(r.html, { name: projName() || 'My site' }).cfg; } catch {} }
    if (!cfg || !window.TribeSiteDesigner || !window.TribeSiteDesigner.importCfg) { st.msg = { kind: 'calm', html: '<b>That page could not be turned into a design.</b><span>The pasted text is still here.</span>' }; return draw(); }
    close();
    await window.TribeSiteDesigner.importCfg(cfg, `From ${fromName()} (pasted)`);
    toast('Imported into the website designer as a new version.');
  }

  // ---------- copying and downloading ----------
  async function copyText(t, msg) {
    try { await navigator.clipboard.writeText(t); toast(msg); return true; }
    catch { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); toast(ok ? msg : 'Select the pack under "See the pack" and copy it.'); return ok; }
  }
  function download(kind) {
    const name = `tribecode-pack-${(projName() || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'}.${kind}`;
    const blob = kind === 'pdf' ? new Blob([B().pdf(st.pk.text, `TribeCode context pack${projName() ? ' - ' + projName() : ''}`)], { type: 'application/pdf' }) : new Blob([st.pk.text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Downloaded ${name}. Attach it in ${prov().name} with the paperclip.`);
  }
  async function fileText(file) {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const inflate = typeof DecompressionStream === 'function' ? async u => new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()) : null;
      const t = await B().pdfText(new Uint8Array(await file.arrayBuffer()), inflate);
      if (!t.trim()) throw new Error('no text in this PDF');
      return t;
    }
    return file.text();
  }
  async function takeFile(file) {
    if (!file) return;
    try { st.paste = await fileText(file); st.tab = 'back'; draw(); read(); }
    catch (e) { st.msg = { kind: 'calm', html: `<b>I couldn't read text from ${esc(file.name)}.</b><span>${esc(e.message)}. Open it, select the answer and copy it, then paste it here.</span>` }; st.tab = 'back'; draw(); }
  }
  function wireDrop() {
    el.addEventListener('dragover', e => { if (e.target.closest('#aib-drop')) { e.preventDefault(); e.target.closest('#aib-drop').classList.add('drag'); } });
    el.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('#aib-drop'); if (d) d.classList.remove('drag'); });
    el.addEventListener('drop', e => { const d = e.target.closest && e.target.closest('#aib-drop'); if (!d) return; const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); takeFile(f); });
  }

  // ---------- events ----------
  async function onClick(e) {
    if (e.target === el) return close();
    const t = e.target.closest('button, a'); if (!t) return;
    if (t.dataset.aibTab) { st.tab = t.dataset.aibTab; draw(); return; }
    if (t.dataset.aibProv) { st.provider = st.from = t.dataset.aibProv; remember({ provider: st.provider }); st.parts = null; draw(); return; }
    if (t.dataset.aibSrc) { st.src = t.dataset.aibSrc; if (st.src === 'files' && st.files.length) st.files.forEach(f => st.pick.add(f.path)); rebuild(); draw(); loadFor(st.src); return; }
    if (t.dataset.aibPart) { copyText(st.parts[+t.dataset.aibPart], `Part ${+t.dataset.aibPart + 1} of ${st.parts.length} copied.`); return; }
    const k = t.dataset.aib; if (!k) return;
    if (k === 'close') return close();
    if (k === 'copy') { if (await copyText(st.pk.text, `Pack copied (${num(st.pk.chars)} characters). Paste it into ${prov().name}.`)) { t.textContent = 'Copied ✓'; } return; }
    if (k === 'split') { st.parts = B().split(st.pk.text, prov().budget); draw(); return; }
    if (k === 'pdf' || k === 'txt') return download(k);
    if (k === 'read') { st.paste = el.querySelector('#aib-paste').value; return read(); }
    if (k === 'clip') {
      try { const t2 = await navigator.clipboard.readText(); if (!t2.trim()) { toast('The clipboard is empty. Copy the AI\'s answer first.'); return; } st.paste = t2; draw(); read(); }
      catch { st.msg = { kind: 'calm', html: '<b>The browser didn\'t let TribeCode read the clipboard.</b><span>Click in the box and press Ctrl V (⌘ V on a Mac) instead.</span>' }; draw(); }
      return;
    }
    if (k === 'apply') return apply();
    if (k === 'undo') return undo();
    if (k === 'import') return importSite();
    if (k === 'preview' && window.TribePreview) { close(); window.TribePreview.open(); }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.id === 'aib-file') return takeFile(t.files && t.files[0]);
    if (t.id === 'aib-from') { st.from = t.value; return; }
    if (t.dataset.aibPick) {
      const p = t.dataset.aibPick;
      if (t.checked) { st.pick.add(p); if (!st.files.some(f => f.path === p)) { try { st.files.push({ path: p, text: await readFile(p) }); } catch (er) { st.pick.delete(p); toast(er.message); } } }
      else st.pick.delete(p);
      rebuild(); const f = el.querySelector('#aib-filter'), v = f ? f.value : ''; draw(); const nf = el.querySelector('#aib-filter'); if (nf && v) nf.value = v; return;
    }
    if (t.id === 'aib-task') { st.task = t.value; rebuild(); return draw(); }
    if (t.id === 'aib-doc') {
      st.doc = t.value; st.docText = ''; st.docTitle = '';
      if (st.doc) { try { const d = (await C.api('/docs/' + encodeURIComponent(st.doc))).doc || {}; st.docText = d.body || d.text || d.content || ''; st.docTitle = d.title || st.doc; } catch (er) { toast(er.message); } }
      rebuild(); return draw();
    }
    if (t.dataset.aibFile) { const c = st.changes[+t.dataset.aibFile]; c.on = t.checked; return draw(); }
    if (t.dataset.aibHunk) { const [i, k] = t.dataset.aibHunk.split(':').map(Number), c = st.changes[i]; t.checked ? c.keep.add(k) : c.keep.delete(k); return draw(); }
  }
  let inT = 0;
  function onInput(e) {
    const t = e.target;
    if (t.id === 'aib-goal') { st.goal = t.value; clearTimeout(inT); inT = setTimeout(() => { rebuild(); const m = el.querySelector('#aib-size'), p = prov(); if (m) { m.textContent = `${num(st.pk.chars)} characters · about ${num(st.pk.tokens)} tokens · ${st.pk.chars > p.budget ? `longer than ${p.name}'s free chat takes in one go` : `fits ${p.name}'s free chat`}`; } const pre = el.querySelector('#aib-pack'); if (pre) pre.textContent = st.pk.text; }, 150); }
    if (t.id === 'aib-paste') st.paste = t.value;
    if (t.id === 'aib-filter') { st.filter = t.value; const box = el.querySelector('#aib-src-detail'); if (box) { box.innerHTML = srcDetail(); const f = el.querySelector('#aib-filter'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
  }

  // the guide's buttons work wherever it is drawn (Agents Hub dashboard, Your agents, the fleet)
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-aib-open]'); if (!b || (el && el.contains(b))) return; e.preventDefault(); open({ tab: b.dataset.aibOpen, fresh: true }); });

  function noteError(msg) { lastError = String(msg || '').slice(0, 2000); }
  window.TribeAIBridge = { open, close, guideHtml, noteError, state: () => st && { tab: st.tab, src: st.src, provider: st.provider, chars: st.pk ? st.pk.chars : 0, removed: st.pk ? st.pk.removed : [], changes: st.changes.map(c => ({ path: c.path, on: c.on, keep: [...c.keep], hunks: c.hunks.length, err: c.err })), applied: !!(st.applied && st.applied.live), risks: st.risks.map(r => r.kind), parts: st.parts ? st.parts.length : 0, open: !!el && !el.hidden } };
  if (location.hash === '#/ai-bridge') setTimeout(() => open({}), 300);
})();
