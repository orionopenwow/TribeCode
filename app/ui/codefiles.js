// Code-aware Files (feat/files-code): when the project is code (a pinned repo, or project sense says game / app / site /
// tool / bot / api / 3d), the project's Files view (#view-docs) gets a three-way switch at the top:
//   Files  today's view, unchanged (docs.js, the phone Docs hub in mobile2.js)
//   Code   the code repository, read-only (server/codefiles.js): a branch picker (view any branch; nothing is checked out), a lazy
//          folder tree (a drill-down list on phones), file-name search, a "Recently changed" strip, breadcrumbs and a
//          viewer with line numbers, light syntax tint, Copy path, Open on GitHub, recent commits, who owns the path
//          (claims and lanes from /api/coord/ownership) and Ask an agent. The root README renders like on GitHub.
//   Docs   VISION.md, the project's notes, the living notes journal and the code repository's Markdown (root + docs/) in one
//          searchable list, grouped Vision · Notes · Repo docs. Notes open in the doc editor (Files).
// The choice is remembered per project. Other projects keep today's view with no switch.
// Keys (Code and Docs): / focuses search, ↑ ↓ move, Enter opens, ← closes a folder or goes up, → opens a folder, Esc closes the viewer.
// Public: window.TribeCodeFiles = { mode(), set(mode), refresh() }.
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const pid = () => (C.project && C.project()) || null;
  const proj = () => ((C.state().projects || []).find(p => p.id === pid())) || null;
  const me = () => C.state().me || {};
  const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; if (!isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`; return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const fsize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const CODE_KINDS = new Set(['game', 'app', 'site', 'tool', 'bot', 'api', '3d']);
  const SEGS = [['files', '📝 Notes'], ['code', '💻 Code'], ['docs', '📚 Docs']];   // "Notes": the outer tab is already Files

  // ---------- icons (24px grid, stroke = currentColor) ----------
  const svg = (d, sz = 18) => `<svg class="cf-i" viewBox="0 0 24 24" style="width:${sz}px;height:${sz}px" aria-hidden="true">${d}</svg>`;
  const I = {
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-11 5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
    note: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    journal: '<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><path d="M6 3v18M10 8h5M10 12h5"/>',
  };
  // A file's icon colour by type (solid tokens only, no Ember: that stays the brand colour).
  const EXT_TONE = { js: 'amber', mjs: 'amber', cjs: 'amber', jsx: 'amber', ts: 'peer', tsx: 'peer', json: 'amber', css: 'live', scss: 'live', html: 'rose', htm: 'rose', md: 'muted', markdown: 'muted', txt: 'muted',
    py: 'peer', rs: 'amber', go: 'live', png: 'live', jpg: 'live', jpeg: 'live', gif: 'live', svg: 'rose', webp: 'live', glb: 'peer', gltf: 'peer', toml: 'muted', yml: 'muted', yaml: 'muted', lock: 'muted', sh: 'live' };
  const extOf = p => { const n = String(p).split('/').pop(); const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };
  const iconFor = e => e.type === 'dir' || e.type === 'module' ? `<span class="cf-ic dir">${svg(I.folder, 18)}</span>` : e.type === 'link' ? `<span class="cf-ic">${svg(I.link, 18)}</span>`
    : `<span class="cf-ic t-${EXT_TONE[extOf(e.path)] || 'muted'}">${svg(I.file, 18)}</span>`;

  // ---------- a tiny tokenizer: comments, strings, numbers, keywords, tags, keys ----------
  const KW = {
    js: 'await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield async',
    ts: 'abstract any as boolean declare enum implements interface keyof namespace never number private protected public readonly string type unknown',
    py: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield',
    rs: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while i32 i64 u8 u32 u64 usize f32 f64 bool str String Vec Option Some None Result Ok Err',
  };
  const LANG = { js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', json: 'json', css: 'css', scss: 'css', html: 'html', htm: 'html', svg: 'html', xml: 'html', md: 'md', markdown: 'md', py: 'py', rs: 'rs' };
  const RULES = {
    js: [['c', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y], ['s', /`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y], ['n', /\b(?:0x[\da-fA-F]+|\d[\d_]*\.?\d*(?:e[+-]?\d+)?)\b/y], ['w', /[A-Za-z_$][\w$]*/y]],
    py: [['c', /#[^\n]*/y], ['s', /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y], ['n', /\b\d[\d_]*\.?\d*\b/y], ['w', /[A-Za-z_]\w*/y]],
    rs: [['c', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y], ['s', /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\\n])'/y], ['n', /\b\d[\d_]*\.?\d*\w*\b/y], ['w', /[A-Za-z_]\w*!?/y]],
    json: [['p', /"(?:\\.|[^"\\\n])*"(?=\s*:)/y], ['s', /"(?:\\.|[^"\\\n])*"/y], ['n', /-?\b\d+\.?\d*(?:e[+-]?\d+)?\b/y], ['k', /\b(?:true|false|null)\b/y]],
    css: [['c', /\/\*[\s\S]*?\*\//y], ['s', /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y], ['k', /@[\w-]+/y], ['p', /[\w-]+(?=\s*:(?!:))/y], ['n', /#[\da-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?\b/y]],
    html: [['c', /<!--[\s\S]*?-->/y], ['f', /<\/?[A-Za-z][\w:-]*|\/?>/y], ['s', /"[^"\n]*"|'[^'\n]*'/y], ['p', /[\w:-]+(?==)/y]],
    md: [['h', /^#{1,6} [^\n]*/my], ['s', /```[\s\S]*?```|`[^`\n]+`/y], ['k', /\*\*[^*\n]+\*\*|__[^_\n]+__/y], ['p', /\[[^\]\n]+\]\([^)\n]+\)/y], ['c', /<!--[\s\S]*?-->/y]],
  };
  RULES.ts = RULES.js;
  function tint(text, lang) {
    const rules = RULES[lang]; if (!rules || text.length > 400000) return esc(text);
    const kw = new Set([...(KW[lang] || '').split(' '), ...(lang === 'ts' ? KW.js.split(' ') : [])].filter(Boolean));
    let out = '', i = 0, plain = '';
    const flush = () => { if (plain) { out += esc(plain); plain = ''; } };
    outer: while (i < text.length) {
      for (const [cls, re] of rules) {
        if (lang === 'md' && cls === 'h' && i > 0 && text[i - 1] !== '\n') continue;
        re.lastIndex = i; const m = re.exec(text);
        if (m && m.index === i && m[0].length) {
          let c = cls;
          if (cls === 'w') { if (kw.has(m[0])) c = 'k'; else if (text[i + m[0].length] === '(') c = 'f'; else { plain += m[0]; i += m[0].length; continue outer; } }
          flush(); out += `<span class="t-${c}">${esc(m[0])}</span>`; i += m[0].length; continue outer;
        }
      }
      plain += text[i++];
    }
    flush();
    return out;
  }

  // ---------- state ----------
  let seg = 'files', isCode = false, senseCache = {}, info = null, ref = '', branchList = null;
  const kids = new Map();      // folder path -> { entries, more, total }
  const open = new Set(['']);  // expanded folders (desktop tree)
  let cwd = '', sel = '', file = null, q = '', results = null, recent = null, own = null, docsQ = '', docsData = null, reading = null;
  const LS = () => `tribecode.files.seg:${pid()}`;
  const remembered = () => { try { const v = localStorage.getItem(LS()); return SEGS.some(s => s[0] === v) ? v : 'files'; } catch { return 'files'; } };
  const view = () => document.getElementById('view-docs');
  const visible = () => { const v = view(); return !!(v && !v.classList.contains('hidden')); };
  const canAsk = () => me().role !== 'spectator';

  async function senseKind(p) {
    const hit = senseCache[p]; if (hit && Date.now() - hit.at < 60000) return hit.kind;
    let kind = ''; try { kind = (await C.api(`/projects/${encodeURIComponent(p)}/sense`, { project: p })).kind || ''; } catch {}
    senseCache[p] = { kind, at: Date.now() };
    return kind;
  }
  function resetRepo() { info = null; ref = ''; branchList = null; kids.clear(); open.clear(); open.add(''); cwd = ''; sel = ''; file = null; q = ''; results = null; recent = null; own = null; docsData = null; reading = null; }

  // Decide whether this project gets the switch, then draw.
  let checking = null, lastPid = null;
  async function check() {
    if (!C.connected() || !view()) return apply(false);
    const p = proj(); if (!p) return apply(false);
    if (p.id !== lastPid) { lastPid = p.id; resetRepo(); drawn = ''; }
    const code = p.hasRepo || CODE_KINDS.has(await senseKind(p.id));
    if (pid() !== p.id) return;
    apply(code);
  }
  function apply(code) {
    isCode = !!code;
    const v = view(); if (!v) return;
    if (!isCode) { drawn = ''; const s = $('#cf-switch'), pane = $('#cf-pane'); if (s) s.remove(); if (pane) pane.remove(); if (v.classList.contains('cf-on')) v.classList.remove('cf-on'); delete v.dataset.cf; try { window.dispatchEvent(new Event('tribe:cf')); } catch {} return; }
    let s = $('#cf-switch');
    if (!s) {
      s = document.createElement('div'); s.id = 'cf-switch'; s.className = 'cf-switch'; s.setAttribute('role', 'tablist'); s.setAttribute('aria-label', 'Show');
      s.innerHTML = SEGS.map(([k, l]) => `<button role="tab" data-seg="${k}">${l}</button>`).join('');
      v.prepend(s);
      s.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => set(b.dataset.seg));
    }
    if (s !== v.firstElementChild) v.prepend(s);
    let pane = $('#cf-pane');
    if (!pane) { pane = document.createElement('div'); pane.id = 'cf-pane'; pane.className = 'cf-pane'; s.after(pane); }
    const want = remembered();
    if (drawn === `${pid()}|${want}` && (want === 'files' || pane.firstElementChild)) return;   // already showing it: keep the tree, the open file, the scroll
    set(want, true);
  }
  let drawn = '';
  function set(m, quiet) {
    seg = SEGS.some(s => s[0] === m) ? m : 'files';
    drawn = `${pid()}|${seg}`;
    if (!quiet) try { localStorage.setItem(LS(), seg); } catch {}
    const v = view(); if (!v || !isCode) return;
    if (v.classList.contains('cf-on') !== (seg !== 'files')) v.classList.toggle('cf-on', seg !== 'files');
    v.dataset.cf = seg;
    try { window.dispatchEvent(new Event('tribe:cf')); } catch {}   // the Files tab row shows Notes · Code · Docs
    document.querySelectorAll('#cf-switch [data-seg]').forEach(b => { const on = b.dataset.seg === seg; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    if (seg === 'code') drawCode(); else if (seg === 'docs') drawDocs(); else { const pane = $('#cf-pane'); if (pane) pane.innerHTML = ''; }
  }

  // ---------- data ----------
  const qs = o => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const get = (b, o = {}) => C.api(`/code/${b}?${qs({ ref, ...o })}`);
  async function folder(path, more) {
    const have = kids.get(path);
    if (have && !more) return have;
    const r = await get('tree', { path, offset: more && have ? have.entries.length : 0 });
    const v = more && have ? { ...r, entries: [...have.entries, ...r.entries] } : r;
    kids.set(path, v); return v;
  }
  async function loadInfo() {
    if (info) return info;
    try { info = await C.api('/code'); } catch { info = { hasRepo: false }; }
    return info;
  }
  async function loadOwn() { try { own = await C.api('/coord/ownership'); } catch { own = { owners: [] }; } }
  const norm = a => String(a || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\*+$/, '').replace(/\/+$/, '');
  function ownersOf(path) {
    if (!own || !own.owners) return [];
    const hit = (area) => { const a = norm(area); return a && (path === a || path.startsWith(a + '/')); };
    const out = [];
    for (const o of own.owners) {
      const c = (o.claims || []).find(x => hit(x.path)), l = (o.lanes || []).find(x => hit(x.area));
      if (c) out.push({ name: o.name, kind: o.kind, how: 'editing', note: c.note });
      else if (l) out.push({ name: o.name, kind: o.kind, how: 'lane', note: l.area });
    }
    return out;
  }

  // ---------- Code ----------
  function drawCode() {
    const pane = $('#cf-pane'); if (!pane) return;
    const p = proj() || {};
    pane.innerHTML = `<div class="cf-code" id="cf-code">
      <div class="cf-head"><div><span class="eyebrow">Code</span><h2 id="cf-title">${esc(p.name || 'Code')}</h2></div>
        <button class="btn cf-branch" id="cf-branch" aria-haspopup="menu" disabled>${svg(I.git, 16)}<span id="cf-branch-name">…</span>${svg(I.down, 14)}</button></div>
      <div id="cf-body"><p class="cf-empty">Reading the code…</p></div></div>`;
    loadInfo().then(i => {
      if (seg !== 'code' || !$('#cf-code')) return;
      if (!i.hasRepo) {
        $('#cf-branch').remove();
        $('#cf-body').innerHTML = `<div class="cf-none"><span class="cf-none-ic">${svg(I.git, 30)}</span><b>No code repository yet</b><span>Pin a code folder or a GitHub repository and its code shows up here: folders, branches, recent changes.</span><button class="btn primary" data-nav="repo">Set up the code repository</button></div>`;
        return;
      }
      if (!ref) ref = i.branch || '';
      $('#cf-branch-name').textContent = ref || 'files';
      const bb = $('#cf-branch'); bb.disabled = !i.git; bb.onclick = e => branchMenu(e.currentTarget);
      $('#cf-body').innerHTML = `
        <label class="cf-search">${svg(I.search, 18)}<input id="cf-q" placeholder="Find a file" autocomplete="off" spellcheck="false" aria-label="Find a file by name" value="${esc(q)}"><kbd>/</kbd></label>
        <div class="cf-recent" id="cf-recent" aria-label="Recently changed"></div>
        <div class="cf-split">
          <nav class="cf-nav" aria-label="Files in the code repository"><div class="cf-crumbs" id="cf-crumbs"></div><div class="cf-tree" id="cf-tree" role="tree" tabindex="-1"></div></nav>
          <section class="cf-view" id="cf-view" aria-live="polite"></section>
        </div>`;
      const inp = $('#cf-q'); let t = null;
      inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { q = inp.value.trim(); doSearch(); }, 160); };
      inp.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(0); } else if (e.key === 'Enter') { e.preventDefault(); const r = rows()[0]; if (r) activate(r); } else if (e.key === 'Escape' && inp.value) { inp.value = ''; q = ''; doSearch(); } };
      drawRecent(); drawTree(); drawView();
      if (!kids.has(cwd)) folder(cwd).then(() => { drawTree(); if (!file) drawView(); }).catch(e => { const tr = $('#cf-tree'); if (tr) tr.innerHTML = `<p class="cf-empty">${esc(e.message)}</p>`; });
      if (q) doSearch();
      if (!recent) get('recent').then(r => { recent = r.files || []; drawRecent(); }).catch(() => { recent = []; drawRecent(); });
      if (!own) loadOwn().then(() => { if (file) drawView(); });
    });
  }
  function drawRecent() {
    const el = $('#cf-recent'); if (!el) return;
    if (!recent || !recent.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span class="cf-recent-h">Recently changed</span><div class="cf-chips">${recent.map(f => `<button class="cf-chip" data-open="${esc(f.path)}" title="${esc(f.path)} · ${esc(f.subject)}">${iconFor({ type: 'file', path: f.path })}<span><b>${esc(f.path.split('/').pop())}</b><small>${esc(f.author)} · ${esc(ago(f.at))}</small></span></button>`).join('')}</div>`;
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => reveal(b.dataset.open));
  }
  function crumbs() {
    const el = $('#cf-crumbs'); if (!el) return;
    const base = (info && info.name) || 'repo', parts = cwd ? cwd.split('/') : [];
    el.innerHTML = `<button data-crumb="">${esc(base)}</button>${parts.map((x, i) => `<span class="cf-sep">/</span><button data-crumb="${esc(parts.slice(0, i + 1).join('/'))}">${esc(x)}</button>`).join('')}`;
    el.querySelectorAll('[data-crumb]').forEach(b => b.onclick = () => goFolder(b.dataset.crumb));
  }
  // Desktop: a nested tree with lazy folders. Phones: the current folder as a drill-down list.
  function drawTree() {
    const el = $('#cf-tree'); if (!el) return;
    crumbs();
    if (q) return drawResults();
    const row = (e, depth) => {
      const isDir = e.type === 'dir', ex = isDir && open.has(e.path);
      return `<div class="cf-row${sel === e.path ? ' on' : ''}${isDir ? ' dir' : ''}" role="treeitem" tabindex="-1" data-path="${esc(e.path)}" data-type="${e.type}" ${isDir ? `aria-expanded="${ex}"` : ''} style="--d:${depth}">
        ${!isPhone() && isDir ? `<span class="cf-tw${ex ? ' ex' : ''}">${svg(I.chev, 14)}</span>` : '<span class="cf-tw"></span>'}${iconFor(e)}<span class="cf-nm">${esc(e.name)}</span>${isPhone() && isDir ? `<span class="cf-go">${svg(I.chev, 16)}</span>` : ''}</div>`;
    };
    let html = '';
    if (isPhone()) {
      const f = kids.get(cwd);
      if (cwd) html += `<div class="cf-row up" role="treeitem" tabindex="-1" data-up="1"><span class="cf-tw"></span><span class="cf-ic">${svg(I.back, 18)}</span><span class="cf-nm">Back to ${esc(cwd.includes('/') ? cwd.split('/').slice(-2, -1)[0] : (info && info.name) || 'the top')}</span></div>`;
      if (!f) html += '<p class="cf-empty">Loading…</p>';
      else { html += f.entries.map(e => row(e, 0)).join(''); if (f.more) html += `<button class="cf-more" data-more="${esc(cwd)}">Show more (${f.total - f.entries.length} left)</button>`; if (!f.entries.length) html += '<p class="cf-empty">This folder is empty.</p>'; }
    } else {
      const walk = (path, depth) => {
        const f = kids.get(path); if (!f) return depth ? `<div class="cf-row wait" style="--d:${depth}"><span class="cf-tw"></span><span class="cf-nm faint">Loading…</span></div>` : '<p class="cf-empty">Loading…</p>';
        let h = '';
        for (const e of f.entries) { h += row(e, depth); if (e.type === 'dir' && open.has(e.path)) h += walk(e.path, depth + 1); }
        if (f.more) h += `<button class="cf-more" data-more="${esc(path)}" style="--d:${depth}">Show more (${f.total - f.entries.length} left)</button>`;
        if (!f.entries.length && !depth) h += '<p class="cf-empty">This code repository is empty.</p>';
        return h;
      };
      html = walk('', 0);
    }
    el.innerHTML = html;
    bindRows(el);
  }
  function bindRows(el) {
    el.querySelectorAll('.cf-row[data-path], .cf-row[data-up]').forEach(r => { r.onclick = () => activate(r); r.onkeydown = rowKey; });
    el.querySelectorAll('[data-more]').forEach(b => b.onclick = () => folder(b.dataset.more, true).then(drawTree).catch(e => toast(e.message)));
  }
  const rows = () => [...document.querySelectorAll('#cf-tree .cf-row[data-path], #cf-tree .cf-row[data-up]')];
  function focusRow(i) { const r = rows(); if (!r.length) return; const el = r[Math.max(0, Math.min(r.length - 1, i))]; el.focus(); el.scrollIntoView({ block: 'nearest' }); }
  function rowKey(e) {
    const r = rows(), i = r.indexOf(e.currentTarget), el = e.currentTarget;
    if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) { const s = $('#cf-q'); if (s) s.focus(); } else focusRow(i - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(el); }
    else if (e.key === 'ArrowRight' && el.dataset.type === 'dir' && !q) { e.preventDefault(); if (isPhone()) activate(el); else if (!open.has(el.dataset.path)) toggle(el.dataset.path, true); }
    else if (e.key === 'ArrowLeft' && !q) {
      e.preventDefault(); const pth = el.dataset.path || '';
      if (isPhone()) goFolder(cwd.split('/').slice(0, -1).join('/'));
      else if (el.dataset.type === 'dir' && open.has(pth)) toggle(pth, true);
      else { const up = pth.split('/').slice(0, -1).join('/'); if (up) { const t = document.querySelector(`#cf-tree .cf-row[data-path="${CSS.escape(up)}"]`); if (t) t.focus(); } }
    }
  }
  function activate(el) {
    if (el.dataset.up) return goFolder(cwd.split('/').slice(0, -1).join('/'), true);
    const path = el.dataset.path, type = el.dataset.type;
    if (type === 'dir') { if (isPhone()) return goFolder(path, false); sel = path; cwd = path; toggle(path, true); file = null; drawView(); return; }
    if (type === 'module') return toast('That folder is a git submodule. It lives in its own repo.');
    openFile(path);
  }
  async function toggle(path, keepFocus) {
    if (open.has(path)) open.delete(path); else { open.add(path); if (!kids.has(path)) { drawTree(); await folder(path).catch(e => toast(e.message)); } }
    drawTree();
    if (keepFocus) { const t = document.querySelector(`#cf-tree .cf-row[data-path="${CSS.escape(path)}"]`); if (t) t.focus(); }
  }
  async function goFolder(path, focus) {
    cwd = path; sel = path; file = null;
    if (!isPhone()) { const parts = path ? path.split('/') : []; parts.forEach((_, i) => open.add(parts.slice(0, i + 1).join('/'))); }
    drawTree(); drawView();
    const chain = isPhone() ? [path] : ['', ...(path ? path.split('/').map((_, i, a) => a.slice(0, i + 1).join('/')) : [])];
    for (const c of chain) if (!kids.has(c)) await folder(c).catch(() => {});
    drawTree(); drawView();
    if (focus) focusRow(0);
  }
  // Open a file anywhere in the tree: expand its folders (desktop) or go to its folder (phones), then show it.
  async function reveal(path) {
    if (q) { q = ''; const s = $('#cf-q'); if (s) s.value = ''; }
    const parts = path.split('/'); parts.pop();
    const chain = ['', ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))];
    for (const c of chain) { open.add(c); if (!kids.has(c)) await folder(c).catch(() => {}); }
    cwd = parts.join('/');
    drawTree(); openFile(path);
  }

  // ---------- search ----------
  async function doSearch() {
    if (!q) { results = null; return drawTree(); }
    const want = q; drawResults(true);
    try { const r = await get('search', { q: want }); if (want !== q) return; results = r; } catch (e) { results = { results: [], error: e.message }; }
    drawResults();
  }
  function drawResults(wait) {
    const el = $('#cf-tree'); if (!el) return;
    if (wait && !results) { el.innerHTML = '<p class="cf-empty">Looking…</p>'; return; }
    const list = (results && results.results) || [];
    const hl = p => { const i = p.toLowerCase().lastIndexOf(q.toLowerCase()); return i < 0 ? esc(p) : `${esc(p.slice(0, i))}<mark>${esc(p.slice(i, i + q.length))}</mark>${esc(p.slice(i + q.length))}`; };
    el.innerHTML = list.length ? list.map(r => `<div class="cf-row res${sel === r.path ? ' on' : ''}" role="treeitem" tabindex="-1" data-path="${esc(r.path)}" data-type="file" style="--d:0"><span class="cf-tw"></span>${iconFor({ type: 'file', path: r.path })}<span class="cf-nm"><b>${hl(r.path.split('/').pop())}</b><small>${esc(r.path)}</small></span></div>`).join('')
      + (results.more ? '<p class="cf-empty">More files match. Type a bit more.</p>' : '')
      : `<p class="cf-empty">${results && results.error ? esc(results.error) : `No file names match “${esc(q)}”.`}</p>`;
    bindRows(el);
  }

  // ---------- the viewer ----------
  async function openFile(path) {
    sel = path; file = { path, loading: true };
    document.querySelectorAll('#cf-tree .cf-row').forEach(r => r.classList.toggle('on', r.dataset.path === path));
    drawView();
    try {
      const [f, l] = await Promise.all([get('file', { path }), get('log', { path }).catch(() => ({ commits: [] }))]);
      if (!file || file.path !== path) return;
      file = { ...f, commits: l.commits || [], md: /\.(md|markdown)$/i.test(path), source: false };
    } catch (e) { if (!file || file.path !== path) return; file = { path, error: e.message }; }
    drawView();
  }
  const ghUrl = path => info && info.github && ref ? `https://github.com/${info.github}/blob/${ref.split('/').map(encodeURIComponent).join('/')}/${path.split('/').map(encodeURIComponent).join('/')}` : '';
  async function copy(t) {
    try { await navigator.clipboard.writeText(t); toast('Path copied.'); }
    catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Path copied.'); } catch { toast(t); } ta.remove(); }
  }
  function codeBlock(text, lang) {
    const lines = text.replace(/\n$/, '').split('\n');
    const big = lines.length > 5000;
    return `<div class="cf-codebox"><pre class="cf-gut" aria-hidden="true">${lines.map((_, i) => i + 1).join('\n')}</pre><pre class="cf-src" tabindex="0" aria-label="File contents"><code>${big ? esc(lines.join('\n')) : tint(lines.join('\n'), lang)}</code></pre></div>`;
  }
  // ---------- edit (v0.23): write the file, commit it on the checked-out branch, 🔒 lock it so nobody saves over you ----------
  const meNow = () => (window.TribeClient && window.TribeClient.state().me) || {};
  const live = () => !ref || !info || !info.branch || ref === info.branch;
  const editable = f => { const m = meNow(); return f && !f.loading && !f.error && !f.hidden && !f.binary && !f.tooBig && live() && m.role && m.role !== 'spectator' && m.role !== 'agent' && !m.guest; };
  const allClaims = () => ((own && own.owners) || []).flatMap(o => (o.claims || []).map(c => ({ ...c, by: o.id, name: o.name })));
  const myLock = path => allClaims().find(c => c.path === path && c.by === meNow().id);
  const otherLock = path => allClaims().find(c => c.by !== meNow().id && (c.path === path || (c.path.endsWith('/') && path.startsWith(c.path))));
  function editorHtml(f) {
    const ol = otherLock(f.path), ml = myLock(f.path);
    return `<div class="cf-ed-wrap">
      ${ol ? `<div class="cf-ed-warn">🔒 <b>${esc(ol.name || 'Someone')}</b> has locked this file. You can look, but saving waits until they unlock it.</div>` : ''}
      <textarea class="cf-ed" id="cf-ed" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Edit ${esc(f.path)}">${esc(f.draft)}</textarea>
      <div class="cf-ed-bar"><input class="input" id="cf-ed-msg" placeholder="What did you change? (optional)" maxlength="160">
        <button class="btn" id="cf-lock" aria-pressed="${!!ml}" title="Lock the file so nobody else saves over it">${ml ? '🔓 Unlock' : '🔒 Lock'}</button>
        <button class="btn ghost" id="cf-ed-cancel">Cancel</button><button class="btn primary" id="cf-ed-save" ${ol ? 'disabled' : ''}>Save <small>Ctrl S</small></button></div></div>`;
  }
  function wireEditor(f) {
    const ta = $('#cf-ed'); if (!ta) return;
    ta.oninput = () => { f.draft = ta.value; };
    ta.onkeydown = e => {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const a = ta.selectionStart, z = ta.selectionEnd; ta.setRangeText('  ', a, z, 'end'); f.draft = ta.value; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    };
    const cancel = () => { if (f.draft !== (f.text || '') && !confirm('Drop your changes?')) return; f.editing = false; drawView(); };
    async function save() {
      const b = $('#cf-ed-save'); if (!b || b.disabled) return; b.disabled = true; b.textContent = 'Saving…';
      try {
        const r = await window.TribeClient.api('/code/file', { method: 'PUT', body: { path: f.path, text: f.draft, message: ($('#cf-ed-msg') || {}).value || '' } });
        f.text = f.draft; f.editing = false; f.size = new Blob([f.text]).size; toast(r.committed ? `Saved and committed${r.sha ? ' (' + r.sha + ')' : ''}.` : 'Saved.');
        get('log', { path: f.path }).then(l => { if (file === f) { f.commits = l.commits || []; drawView(); } }).catch(() => {});
        drawView();
      } catch (e) { b.disabled = false; b.innerHTML = 'Save <small>Ctrl S</small>'; toast(e.message || 'Could not save'); }
    }
    $('#cf-ed-save').onclick = save; $('#cf-ed-cancel').onclick = cancel;
    $('#cf-lock').onclick = async () => {
      const ml = myLock(f.path);
      try {
        if (ml) await window.TribeClient.api('/code/lock?path=' + encodeURIComponent(f.path), { method: 'DELETE' });
        else await window.TribeClient.api('/code/lock', { method: 'POST', body: { path: f.path } });
        await loadOwn(); toast(ml ? 'Unlocked.' : 'Locked. Others see your name on it.'); drawView();
      } catch (e) { toast(e.message || 'Could not change the lock'); }
    };
  }
  function drawView() {
    const el = $('#cf-view'); if (!el) return;
    el.classList.toggle('open', !!file);
    if (!file) {   // a folder: its README (the root README like GitHub), else a calm hint
      el.innerHTML = '<div class="cf-readme" id="cf-readme"></div>';
      const f = kids.get(cwd), rd = f && f.entries.find(e => e.type === 'file' && /^readme(\.md|\.markdown)?$/i.test(e.name));
      const box = $('#cf-readme');
      if (!rd) { box.innerHTML = isPhone() ? '' : `<div class="cf-hint">${svg(I.file, 26)}<b>Pick a file to read it</b><span>Use ↑ ↓ and Enter, or press / to find a file by name.</span></div>`; return; }
      box.innerHTML = `<div class="cf-rd-h">${svg(I.doc, 16)}<b>${esc(rd.name)}</b></div><div class="cf-rd-body md">Opening…</div>`;
      get('file', { path: rd.path }).then(r => { const b = box.querySelector('.cf-rd-body'); if (b && !file) b.innerHTML = r.text ? window.TribeMD.render(r.text) : '<p class="faint">Empty README.</p>'; }).catch(() => {});
      return;
    }
    const f = file, gh = ghUrl(f.path), who = ownersOf(f.path), parts = f.path.split('/');
    el.innerHTML = `<div class="cf-file" id="cf-viewer" role="dialog" aria-label="${esc(f.path)}">
      <header class="cf-fh">
        <button class="cf-x" id="cf-close" aria-label="Close">${svg(isPhone() ? I.back : I.x, 20)}</button>
        <div class="cf-ft"><b>${esc(parts[parts.length - 1])}</b><small>${esc(parts.slice(0, -1).join(' / ') || (info && info.name) || '')}${f.size != null ? ` · ${esc(fsize(f.size))}` : ''}${ref ? ` · ${esc(ref)}` : ''}</small></div>
      </header>
      <div class="cf-acts">
        <button class="btn" id="cf-copy">${svg(I.copy, 15)}Copy path</button>
        ${gh ? `<a class="btn" id="cf-gh" href="${esc(gh)}" target="_blank" rel="noopener noreferrer">${svg(I.out, 15)}Open on GitHub</a>` : ''}
        ${f.md && f.text ? `<button class="btn" id="cf-src">${f.source ? 'Show it rendered' : 'Show the source'}</button>` : ''}
        ${canAsk() ? `<button class="btn" id="cf-ask">${svg(I.robot, 15)}Ask an agent about this file</button>` : ''}
        ${editable(f) && !f.editing ? `<button class="btn primary" id="cf-edit">✏️ Edit</button>` : ''}
      </div>
      ${who.length ? `<div class="cf-owner" id="cf-owner">${who.map(w => `<span>${w.how === 'editing' ? '✋' : '🧭'} <b>${esc(w.name)}</b> ${w.how === 'editing' ? `is working on this${w.note ? `: ${esc(w.note)}` : ''}` : `looks after <code>${esc(w.note)}</code>`}</span>`).join('')}</div>` : ''}
      <div class="cf-fbody" id="cf-fbody">${f.loading ? '<p class="cf-empty">Opening…</p>' : f.error ? `<p class="cf-empty">${esc(f.error)}</p>`
        : f.hidden ? '<div class="cf-none"><b>Kept private</b><span>Files that hold keys or passwords are not shown here.</span></div>'
        : f.tooBig ? `<div class="cf-none"><b>Too big to show here</b><span>This file is ${esc(fsize(f.size))}. Open it in your editor${gh ? ' or on GitHub' : ''}.</span></div>`
        : f.binary ? `<div class="cf-none"><b>Not a text file</b><span>${esc(fsize(f.size))} of binary data, like a picture or a build.</span></div>`
        : !f.text && !f.editing ? '<p class="cf-empty">This file is empty.</p>'
        : f.editing ? editorHtml(f)
        : f.md && !f.source ? `<div class="cf-rd-body md">${window.TribeMD.render(f.text)}</div>` : codeBlock(f.text, LANG[extOf(f.path)])}</div>
      ${f.commits && f.commits.length ? `<section class="cf-log"><span class="eyebrow">History</span><h3>Recent saved changes</h3>${f.commits.map(c => `<div class="cf-commit"><code>${esc(c.sha)}</code><span><b>${esc(c.subject)}</b><small>${esc(c.author)} · ${esc(ago(c.at))}</small></span></div>`).join('')}</section>` : ''}
    </div>`;
    $('#cf-close').onclick = closeFile;
    $('#cf-copy').onclick = () => copy(f.path);
    const sb = $('#cf-src'); if (sb) sb.onclick = () => { file.source = !file.source; drawView(); };
    const eb = $('#cf-edit'); if (eb) eb.onclick = () => { file.editing = true; file.draft = file.text || ''; drawView(); const ta = $('#cf-ed'); if (ta) ta.focus(); };
    if (f.editing) wireEditor(f);
    const ab = $('#cf-ask'); if (ab) ab.onclick = () => window.TribeAskAgent ? window.TribeAskAgent.open({ text: `About \`${f.path}\`${ref ? ` (branch ${ref})` : ''}: ` }) : toast('Ask an agent is not available here.');
  }
  function closeFile() {
    const p = file && file.path; file = null; drawView();
    if (p) { const r = document.querySelector(`#cf-tree .cf-row[data-path="${CSS.escape(p)}"]`); if (r) r.focus({ preventScroll: true }); }
  }

  // ---------- branches ----------
  async function branchMenu(anchor) {
    closeMenus();
    const w = document.createElement('div'); w.className = 'cf-menu-wrap'; w.id = 'cf-branches';
    w.innerHTML = `<div class="cf-menu" role="menu" aria-label="Branches"><div class="cf-menu-h"><b>Branches</b><small>Pick one to look around. Nothing changes in the code repository.</small></div><div class="cf-menu-list"><p class="cf-empty">Loading…</p></div></div>`;
    document.body.appendChild(w);
    if (!isPhone()) { const r = anchor.getBoundingClientRect(), m = w.firstElementChild; m.style.top = `${r.bottom + 6}px`; m.style.left = `${Math.max(12, Math.min(innerWidth - 372, r.right - 360))}px`; }
    w.onclick = e => { if (e.target === w) closeMenus(); };
    const key = e => { if (e.key === 'Escape') { closeMenus(); anchor.focus(); } };
    w.addEventListener('keydown', key);
    try { branchList = await C.api('/code/branches'); } catch (e) { w.querySelector('.cf-menu-list').innerHTML = `<p class="cf-empty">${esc(e.message)}</p>`; return; }
    const list = w.querySelector('.cf-menu-list'); if (!list) return;
    list.innerHTML = branchList.branches.map(b => `<button role="menuitemradio" aria-checked="${b.name === ref}" data-branch="${esc(b.name)}" class="${b.name === ref ? 'on' : ''}">
      <span class="cf-bn"><b>${esc(b.name)}</b>${b.current ? '<span class="cf-tag">checked out</span>' : ''}</span>
      <small>${b.subject ? `${esc(b.subject)} · ` : ''}${esc(b.author || '')}${b.at ? ` · ${esc(ago(b.at))}` : ''}</small></button>`).join('') || '<p class="cf-empty">No branches yet.</p>';
    const items = [...list.querySelectorAll('[data-branch]')];
    items.forEach((b, i) => { b.onclick = () => pickBranch(b.dataset.branch); b.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); } }; });
    (items.find(b => b.classList.contains('on')) || items[0] || { focus() {} }).focus();
  }
  function closeMenus() { document.querySelectorAll('.cf-menu-wrap').forEach(x => x.remove()); }
  function pickBranch(name) {
    closeMenus();
    if (name === ref) return;
    ref = name; kids.clear(); open.clear(); open.add(''); cwd = ''; sel = ''; file = null; results = null; recent = null; docsData = null;
    toast(`Viewing ${name}`);
    drawCode();
  }

  // ---------- Docs ----------
  // The living notes journal: decisions, approvals, voice notes and files from #general (like the phone Docs hub).
  function journalFrom(msgs) {
    const out = [];
    for (const m of msgs) {
      if (m.deleted) continue;
      const t = String(m.text || ''), sys = m.by === 'tribecode';
      if (/decid|decision/i.test(t) || (sys && /approved|denied|✅|⛔/.test(t)) || /📎|shared|uploaded|added .* to docs/i.test(t) || (m.media && m.media.kind === 'voice')) out.push({ at: m.at, by: m.by, text: t || 'Voice note' });
    }
    return out.reverse();
  }
  async function loadDocs() {
    const [v, d, r, chat] = await Promise.all([
      C.api('/vision').catch(() => ({ text: '' })), C.api('/docs').catch(() => ({ docs: [] })),
      (proj() || {}).hasRepo ? C.api(`/code/docs?${qs({ ref })}`).catch(() => ({ files: [] })) : Promise.resolve({ files: [] }),
      C.api('/chat/general?limit=200').catch(() => ({ messages: [] })),
    ]);
    docsData = { vision: v.text || '', notes: d.docs || [], repo: r.files || [], journal: journalFrom(chat.messages || []) };
  }
  function docItems() {
    const d = docsData; if (!d) return [];
    const first = s => (String(s || '').split('\n').map(x => x.replace(/^#+\s*/, '').trim()).find(x => x) || '');
    const vlines = d.vision.split('\n').filter(x => x.trim() && !/^#\s/.test(x));
    return [
      { group: 'Vision', kind: 'vision', id: 'vision', title: 'VISION.md', sub: first(vlines.join('\n')) || 'What you are building, in a few lines.', icon: I.star, text: d.vision },
      ...d.notes.map(n => ({ group: 'Notes', kind: 'note', id: n.slug, title: n.title || n.slug, sub: `${n.words || 0} words · ${ago(n.updated)}`, icon: I.note })),
      { group: 'Notes', kind: 'journal', id: 'journal', title: 'Living notes', sub: d.journal.length ? `${d.journal.length} moments from chat` : 'Decisions and files from chat collect here.', icon: I.journal },
      ...d.repo.map(f => ({ group: 'Docs in the code', kind: 'repo', id: f.path, title: f.path.split('/').pop(), sub: f.path, icon: I.doc })),
    ];
  }
  function drawDocs() {
    const pane = $('#cf-pane'); if (!pane) return;
    pane.innerHTML = `<div class="cf-code cf-docs" id="cf-docs">
      <div class="cf-head"><div><span class="eyebrow">Docs</span><h2>Everything written down</h2></div></div>
      <label class="cf-search">${svg(I.search, 18)}<input id="cf-dq" placeholder="Search docs" autocomplete="off" aria-label="Search docs" value="${esc(docsQ)}"><kbd>/</kbd></label>
      <div class="cf-split"><nav class="cf-nav" aria-label="Docs"><div class="cf-tree" id="cf-dlist" role="listbox"></div></nav><section class="cf-view" id="cf-dview" aria-live="polite"></section></div></div>`;
    const inp = $('#cf-dq'); inp.oninput = () => { docsQ = inp.value.trim(); drawDocList(); };
    inp.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); const r = docRows(); if (r[0]) r[0].focus(); } else if (e.key === 'Enter') { e.preventDefault(); const r = docRows()[0]; if (r) r.click(); } };
    drawDocList(); drawReader();
    if (!docsData) loadDocs().then(() => { if (seg === 'docs') { drawDocList(); drawReader(); } });
  }
  const docRows = () => [...document.querySelectorAll('#cf-dlist [data-doc]')];
  function drawDocList() {
    const el = $('#cf-dlist'); if (!el) return;
    if (!docsData) { el.innerHTML = '<p class="cf-empty">Gathering your docs…</p>'; return; }
    const ql = docsQ.toLowerCase();
    const items = docItems().filter(it => !ql || `${it.title} ${it.sub} ${it.kind === 'vision' ? it.text : ''}`.toLowerCase().includes(ql));
    if (!items.length) { el.innerHTML = `<p class="cf-empty">Nothing matches “${esc(docsQ)}”. Try another word.</p>`; return; }
    let html = '', g = '';
    for (const it of items) {
      if (it.group !== g) { g = it.group; html += `<div class="cf-group">${esc(g)}</div>`; }
      html += `<button class="cf-row cf-doc${reading && reading.kind === it.kind && reading.id === it.id ? ' on' : ''}" role="option" data-doc="${esc(it.kind)}|${esc(it.id)}" data-doc-kind="${esc(it.kind)}" style="--d:0"><span class="cf-tw"></span><span class="cf-ic">${svg(it.icon, 18)}</span><span class="cf-nm"><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></span></button>`;
    }
    el.innerHTML = html;
    const rs = docRows();
    rs.forEach((b, i) => {
      b.onclick = () => { const [kind, ...rest] = b.dataset.doc.split('|'); openDocItem(kind, rest.join('|')); };
      b.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); (rs[i + 1] || b).focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); if (i) rs[i - 1].focus(); else $('#cf-dq').focus(); } };
    });
  }
  async function openDocItem(kind, id) {
    if (kind === 'note') {   // project notes open in the doc editor, under Files
      set('files');
      if (window.TribeDocs) setTimeout(() => window.TribeDocs.open(id), 60);
      return;
    }
    reading = { kind, id, loading: kind === 'repo' };
    drawDocList(); drawReader();
    if (kind === 'repo') {
      try { const f = await get('file', { path: id }); if (reading && reading.id === id) reading = { kind, id, text: f.text || '', size: f.size }; }
      catch (e) { if (reading && reading.id === id) reading = { kind, id, error: e.message }; }
      drawReader();
    }
  }
  function drawReader() {
    const el = $('#cf-dview'); if (!el) return;
    el.classList.toggle('open', !!reading);
    if (!reading) { el.innerHTML = isPhone() ? '' : `<div class="cf-hint">${svg(I.doc, 26)}<b>Pick a doc to read it</b><span>Notes open in the editor. Docs in the code and the vision open right here.</span></div>`; return; }
    const r = reading, d = docsData || { vision: '', journal: [] };
    const p = proj() || {}, host = me().role === 'host';
    let title = '', sub = '', body = '', acts = '';
    if (r.kind === 'vision') {
      title = 'VISION.md'; sub = p.name || '';
      body = d.vision.trim() ? `<div class="cf-rd-body md">${window.TribeMD.render(d.vision)}</div>` : `<div class="cf-none"><b>No vision yet</b><span>A few lines on what you are building help everyone, agents too.</span></div>`;
      if (window.TribeAssist && me().role !== 'spectator') acts = `<button class="btn" id="cf-vedit">${host ? (d.vision.trim() ? 'Edit the vision' : 'Write the vision') : 'Suggest a change'}</button>`;
    } else if (r.kind === 'journal') {
      title = 'Living notes'; sub = 'From #general, newest first';
      const nameOf = id => id === 'tribecode' ? '' : ((C.state().members || []).find(m => m.id === id) || {}).name || '';
      const md = s => (window.TribeMD ? window.TribeMD.inline(s) : esc(s));
      body = d.journal.length ? `<div class="cf-journal">${d.journal.slice(0, 60).map(n => `<div class="cf-je"><small>${esc(ago(n.at))}</small><p>${nameOf(n.by) ? `<b>${esc(nameOf(n.by))}</b> ` : ''}${md(n.text)}</p></div>`).join('')}</div>`
        : '<div class="cf-none"><b>Nothing yet</b><span>Decisions, voice notes, approvals and files from chat collect here.</span></div>';
    } else {
      const parts = r.id.split('/'); title = parts.pop(); sub = parts.join(' / ') || 'top folder of the code';
      body = r.loading ? '<p class="cf-empty">Opening…</p>' : r.error ? `<p class="cf-empty">${esc(r.error)}</p>` : `<div class="cf-rd-body md">${window.TribeMD.render(r.text)}</div>`;
      acts = `<button class="btn" id="cf-dcode">${svg(I.git, 15)}Show in Code</button>`;
    }
    el.innerHTML = `<div class="cf-file" id="cf-reader" role="dialog" aria-label="${esc(title)}"><header class="cf-fh"><button class="cf-x" id="cf-dclose" aria-label="Close">${svg(isPhone() ? I.back : I.x, 20)}</button><div class="cf-ft"><b>${esc(title)}</b><small>${esc(sub)}</small></div></header>
      ${acts ? `<div class="cf-acts">${acts}</div>` : ''}<div class="cf-fbody">${body}</div></div>`;
    $('#cf-dclose').onclick = () => { const k = reading; reading = null; drawReader(); drawDocList(); const b = k && document.querySelector(`#cf-dlist [data-doc="${CSS.escape(k.kind + '|' + k.id)}"]`); if (b) b.focus({ preventScroll: true }); };
    const ve = $('#cf-vedit'); if (ve) ve.onclick = () => window.TribeAssist.vision(p, { host, done: () => { docsData = null; loadDocs().then(() => { drawDocList(); drawReader(); }); } });
    const dc = $('#cf-dcode'); if (dc) dc.onclick = () => { const path = r.id; reading = null; set('code'); setTimeout(() => reveal(path), 50); };
  }

  // ---------- keys ----------
  document.addEventListener('keydown', e => {
    if (!isCode || seg === 'files' || !visible()) return;
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { const s = $(seg === 'code' ? '#cf-q' : '#cf-dq'); if (s) { e.preventDefault(); s.focus(); s.select(); } }
    else if (e.key === 'Escape' && !document.querySelector('.cf-menu-wrap') && !document.querySelector('.modal:not(.hidden)')) {
      if (seg === 'code' && file) { e.preventDefault(); closeFile(); } else if (seg === 'docs' && reading) { e.preventDefault(); const c = $('#cf-dclose'); if (c) c.click(); }
    }
  });

  // ---------- wiring ----------
  // Opening a doc from elsewhere (search, Home, a link) shows it under Files.
  function wrapDocs() {
    const D = window.TribeDocs; if (!D || D.__cf) return;
    const o = D.open; D.open = (...a) => { if (isCode && seg !== 'files' && visible()) set('files'); return o.apply(D, a); }; D.__cf = true;
  }
  let t = null;
  const soon = (ms = 60) => { clearTimeout(t); t = setTimeout(() => { if (visible()) check(); }, ms); };
  setTimeout(() => {
    wrapDocs();
    const v = view(); if (!v) return;
    let was = v.classList.contains('hidden');
    new MutationObserver(() => { const h = v.classList.contains('hidden'); if (h !== was) { was = h; if (!h) soon(); } }).observe(v, { attributes: true, attributeFilter: ['class'] });
    if (visible()) soon();
  }, 0);
  C.on('project', () => { resetRepo(); lastPid = pid(); drawn = ''; soon(80); });
  C.on('hello', () => soon(80));
  C.on('projects', () => soon(120));
  C.on('ws', m => {
    if (!m) return;
    if (m.type === 'sense' && (!m.project || m.project === pid())) { delete senseCache[pid()]; soon(); }
    if ((m.type === 'claims' || m.type === 'ownership') && isCode && seg === 'code') { own = null; loadOwn().then(() => { if (file) drawView(); }); }
  });
  C.on('repo', () => { if (isCode && seg === 'code') { recent = null; info = null; } });
  addEventListener('resize', () => { if (!isCode || seg !== 'code' || !$('#cf-tree')) return; const ph = isPhone(); if (ph !== drawTree.__ph) { drawTree.__ph = ph; drawTree(); drawView(); } });

  window.TribeCodeFiles = { mode: () => (isCode ? seg : null), set, refresh: () => { resetRepo(); lastPid = pid(); drawn = ''; return check(); } };
})();
