// The shared document editor (project docs in docs.js, personal notes in hub.js noteEditor).
// The text stays plain Markdown in a <textarea> so live co-editing (coedit.js + ot.js) keeps working: every
// toolbar action, shortcut, menu and slash item is a Markdown edit made with execCommand('insertText'), which keeps
// the browser's undo stack and fires a normal 'input' event (docs.js syncs it as an OT op).
//
// Two layouts, one set of commands and menus:
//   Desktop (>= 821px): Google Docs desktop + Notion — top bar (doc icon, inline title, where it lives · Saved ·
//     who's editing, actions) · a sticky one-row formatting toolbar (role=toolbar, roving arrow keys) · a left
//     panel (Document tabs + Outline) · a centered ~720px page card.
//   Phone (<= 820px): Google Docs mobile — a 64px header (✓ Done pill; undo, redo, +, comment, sparkle, ⋮) and a
//     52px format bar riding on the on-screen keyboard (visualViewport): B I U A(color) highlighter | align ▾ |
//     lists… with a pinned "A≡" cell that opens the Text / Paragraph panel.
// Markdown extensions (rendered by md.js): ++underline++, {teal}colored text{/}, ==highlight== / =={teal}highlight==,
// and a line prefix {center} / {right} / {justify} for alignment. Line spacing is a per-device view setting.
//
// Public: window.TribeDocLayout = { isDesk, toolbar, gdBar, gdHeader, bind, sync, key, run, ops, headings, outline,
//   outlineSheet, slash, enterList, top, mirror, styleOf, ico, edit, dockAboveKeyboard, scrollerOf, sheet, insertSheet,
//   aiSheet, findSheet, menuSheet, download, applySpacing }
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isDesk = () => !matchMedia('(max-width: 820px)').matches;
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const K = MAC ? '⌘' : 'Ctrl+';
  const toast = t => window.TribeApp && window.TribeApp.toast(t);

  // ---------- icons (24px grid, stroke = currentColor, solid colors only) ----------
  const P = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M14 5h-4M14 19h-4M14.5 5l-5 14"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
    strike: '<path d="M4 12h16"/><path d="M16.5 7.5C16 5.8 14.3 5 12 5c-2.8 0-4.5 1.3-4.5 3.2 0 1.3.8 2.3 2.6 3"/><path d="M8 16.5c.5 1.6 2 2.5 4.3 2.5 2.8 0 4.5-1.3 4.5-3.3 0-.8-.3-1.5-.9-2"/>',
    code: '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    bullet: '<path d="M10 6h10M10 12h10M10 18h10"/><circle cx="5" cy="6" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="5" cy="18" r="1.2"/>',
    num: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5l1.5-1v5M4 14.5c0-1 .8-1.5 1.5-1.5S7 13.5 7 14.3c0 1.2-3 2-3 3.7h3"/>',
    todo: '<rect x="3.5" y="4.5" width="6" height="6" rx="1.2"/><path d="m4.8 16.5 1.5 1.5 3-3M13 7.5h7M13 16.5h7"/>',
    hr: '<path d="M3 12h18"/><path d="M7 7h10M7 17h10"/>',
    table: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 10h17M12 5v14"/>',
    clear: '<path d="M6 5h12M12 5 9.5 19"/><path d="m15 14 5 5M20 14l-5 5"/>',
    outline: '<path d="M4 6h16M8 12h12M8 18h12"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="18" r=".8"/>',
    chev: '<path d="m7 10 5 5 5-5"/>',
    caret: '<path d="m8 10 4 4 4-4"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    note: '<path d="M5 4h10l4 4v12H5z"/><path d="M9 11h6M9 15h6M9 7h3"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    share: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    tick: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    side: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    comment: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12.5h5"/>',
    sparkle: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/>',
    more: '<circle cx="12" cy="5.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/>',
    highlight: '<path d="m14.5 4.5 5 5-8 8H6.5v-5z"/><path d="M4 20.5h7"/>',
    alignleft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    aligncenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    alignright: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    alignjustify: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
    outdent: '<path d="M11 6h9M11 12h9M11 18h9M7 9l-3 3 3 3"/>',
    indent: '<path d="M11 6h9M11 12h9M11 18h9M4 9l3 3-3 3"/>',
    textfmt: '<path d="M3.5 18 8 6l4.5 12M5.2 14h5.6"/><path d="M15 9h6M15 13h6M15 17h6"/>',
    find: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    rename: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    toc: '<path d="M4 6h3M10 6h10M6 12h3M12 12h8M6 18h3M12 18h8"/>',
    codeblock: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2"/>',
  };
  const ico = (k, sz = 18) => `<svg class="dl-i" viewBox="0 0 24 24" width="${sz}" height="${sz}" aria-hidden="true" focusable="false">${P[k] || ''}</svg>`;

  // ---------- palettes (the design system's colors; solid, flat) ----------
  const COLORS = [['ember', 'Ember', '#F26B1D'], ['teal', 'Teal', '#38C6B1'], ['indigo', 'Indigo', '#6C7CFF'], ['amber', 'Amber', '#FFB86B'], ['rose', 'Rose', '#FF6F8E'], ['green', 'Green', '#3BD16F']];
  const CNAMES = COLORS.map(c => c[0]).join('|');

  // ---------- block styles (style dropdown, A≡ panel, slash menu, Ctrl+Alt+digit) ----------
  // Title is the page's big "# " line; Heading 1-3 follow it ("## ", "### ", "#### ") like Google Docs' Title > H1 > H2.
  const STYLES = [
    { k: 'normal', label: 'Normal text', prefix: '' },
    { k: 'title', label: 'Title', prefix: '# ' },
    { k: 'subtitle', label: 'Subtitle', prefix: '##### ' },
    { k: 'h1', label: 'Heading 1', prefix: '## ', keys: `${K}Alt+1` },
    { k: 'h2', label: 'Heading 2', prefix: '### ', keys: `${K}Alt+2` },
    { k: 'h3', label: 'Heading 3', prefix: '#### ', keys: `${K}Alt+3` },
    { k: 'quote', label: 'Quote', prefix: '> ' },
    { k: 'codeblock', label: 'Code', prefix: null },
  ];
  const TOOLS = [
    ['undo', 'Undo', `${K}Z`], ['redo', 'Redo', `${K}Y`], '|', 'style', '|',
    ['bold', 'Bold', `${K}B`], ['italic', 'Italic', `${K}I`], ['underline', 'Underline', `${K}U`], ['strike', 'Strikethrough', `${K}Shift+X`], ['code', 'Inline code', `${K}E`], '|',
    ['color', 'Text color'], ['highlight', 'Highlight color'], ['link', 'Insert link', `${K}K`], '|',
    ['align', 'Align'], '|',
    ['bullet', 'Bulleted list', `${K}Shift+8`], ['num', 'Numbered list', `${K}Shift+7`], ['todo', 'Checklist', `${K}Shift+9`], '|',
    ['hr', 'Insert divider'], ['table', 'Insert table'], '|',
    ['clear', 'Clear formatting', `${K}\\`],
  ];
  const tip = (label, keys) => keys ? `${label} (${keys})` : label;

  // Desktop toolbar. ids: { undo, redo } lets the notes editor keep #note-undo / #note-redo.
  function toolbar({ ids = {}, label = 'Formatting' } = {}) {
    const parts = TOOLS.map(t => {
      if (t === '|') return '<span class="dl-sep" role="separator" aria-orientation="vertical"></span>';
      if (t === 'style') return `<button type="button" class="dl-tb dl-style" data-fmt="style" aria-haspopup="menu" aria-expanded="false" aria-label="Text style: Normal text" title="Text style"><span class="dl-style-l">Normal text</span>${ico('chev', 16)}</button>`;
      const [k, l, keys] = t;
      const id = ids[k] ? ` id="${esc(ids[k])}"` : '';
      const pressable = ['bold', 'italic', 'underline', 'strike', 'code', 'bullet', 'num', 'todo'].includes(k) ? ' aria-pressed="false"' : '';
      const popup = ['color', 'highlight', 'align'].includes(k) ? ' aria-haspopup="menu"' : '';
      const inner = k === 'color' ? `<span class="gd-a">A<i class="gd-bar"></i></span>` : k === 'align' ? `${ico('alignleft')}${ico('caret', 12)}` : ico(k);
      return `<button type="button" class="dl-tb ${k === 'align' ? 'dl-alignb' : ''}" data-fmt="${k}"${id}${pressable}${popup} aria-label="${esc(tip(l, keys))}" title="${esc(tip(l, keys))}">${inner}</button>`;
    }).join('');
    return `<div class="dl-fmt" role="toolbar" aria-label="${esc(label)}">${parts}</div>`;
  }

  // Phone format bar (Google Docs mobile). Positions are tuned to the Docs app at 390px (see doclayout.css).
  function gdBar({ label = 'Formatting' } = {}) {
    const b = (k, l, inner, cls = '') => `<button type="button" class="gd-b dl-tb ${cls}" data-fmt="${k}" aria-label="${esc(l)}" title="${esc(l)}"><span class="gd-g">${inner}</span></button>`;
    return `<div class="gd-fmt" role="toolbar" aria-label="${esc(label)}"><div class="gd-scroll">
      ${b('bold', 'Bold', '<span class="gd-t gd-tb">B</span>', 'gd-1')}${b('italic', 'Italic', '<span class="gd-t gd-ti">I</span>', 'gd-2')}${b('underline', 'Underline', '<span class="gd-t gd-tu">U</span>', 'gd-3')}
      ${b('color', 'Text color', '<span class="gd-a">A<i class="gd-bar"></i></span>', 'gd-4')}${b('highlight', 'Highlight color', ico('highlight', 22), 'gd-5')}
      <span class="gd-div gd-d1" role="separator" aria-orientation="vertical"></span>
      ${b('align', 'Align', `${ico('alignleft', 22)}${ico('caret', 12)}`, 'gd-al')}
      <span class="gd-div gd-d2" role="separator" aria-orientation="vertical"></span>
      ${b('bullet', 'Bulleted list', ico('bullet', 22), 'gd-6')}${b('num', 'Numbered list', ico('num', 22))}${b('todo', 'Checklist', ico('todo', 22))}
      ${b('outdent', 'Decrease indent', ico('outdent', 22))}${b('indent', 'Increase indent', ico('indent', 22))}${b('link', 'Insert link', ico('link', 22))}${b('clear', 'Clear formatting', ico('clear', 22))}
    </div><div class="gd-pin"><button type="button" class="gd-b dl-tb gd-tf" data-fmt="textfmt" aria-label="Text and paragraph format" title="Format"><span class="gd-g">${ico('textfmt', 22)}</span></button></div></div>`;
  }
  // Phone header (Google Docs mobile): ✓ Done pill on the left, six icons on the right.
  function gdHeader({ ids = {}, comment = true } = {}) {
    const i = (k, l, id) => `<button type="button" class="gd-ib" data-act="${k}"${id ? ` id="${esc(id)}"` : ''} aria-label="${esc(l)}" title="${esc(l)}">${ico(k, 24)}</button>`;
    return `<header class="gd-head"><button type="button" class="gd-done" id="${esc(ids.done || 'note-done')}" aria-label="Done">${ico('tick', 22)}</button>
      <div class="gd-icons">${i('undo', 'Undo', ids.undo)}${i('redo', 'Redo', ids.redo)}${i('plus', 'Insert')}${i('comment', comment ? 'Comments' : 'Comments')}${i('sparkle', 'Ask AI')}${i('more', 'More')}</div></header>`;
  }

  // ---------- markdown edits ----------
  function edit(ta, from, to, text, a, b) {
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(from, to);
    let ok = false;
    try { ok = text === '' ? (from === to ? true : document.execCommand('delete')) : document.execCommand('insertText', false, text); } catch { ok = false; }
    if (!ok || ta.value.slice(from, from + text.length) !== text) {
      ta.setRangeText(text, from, to, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (a !== undefined) ta.setSelectionRange(a, b === undefined ? a : b);
  }
  function lineRange(v, a, b) {
    const s = v.lastIndexOf('\n', a - 1) + 1;
    const endAt = b > a && v[b - 1] === '\n' ? b - 1 : b;
    let e = v.indexOf('\n', endAt); if (e < 0) e = v.length;
    return [s, Math.max(s, e)];
  }
  const ALIGN = /\{(left|center|right|justify)\} /;
  const PREFIX = /^(\s*)(#{1,6}\s+|>\s?|[-*+]\s\[[ xX]\]\s|[-*+]\s|\d+[.)]\s)/;
  const stripPrefix = l => l.replace(PREFIX, '$1');
  function wordAt(v, i) {
    let a = i, b = i;
    while (a > 0 && /[\wÀ-￿'-]/.test(v[a - 1])) a--;
    while (b < v.length && /[\wÀ-￿'-]/.test(v[b])) b++;
    return [a, b];
  }
  // inline spans: which one (if any) holds the selection
  const SPANS = {
    bold: { re: () => /\*\*(?=\S)([^\n]*?\S)\*\*/g, close: 2 },
    italic: { re: () => /(?<![*\w])\*(?![*\s])([^*\n]*?[^*\s])\*(?![*\w])/g, close: 1 },
    underline: { re: () => /\+\+(?=\S)([^\n]*?\S)\+\+/g, close: 2 },
    strike: { re: () => /~~(?=\S)([^\n]*?\S)~~/g, close: 2 },
    code: { re: () => /`([^`\n]+)`/g, close: 1 },
    color: { re: () => new RegExp(`\\{(${CNAMES})\\}([^\\n]*?)\\{\\/\\}`, 'g'), close: 3, inner: 2 },
    highlight: { re: () => new RegExp(`==(?:\\{(${CNAMES})\\})?([^\\n=]+?)==`, 'g'), close: 2, inner: 2 },
  };
  function spanAt(ta, kind) {
    const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd, [s, e] = lineRange(v, a, a);
    if (b > e) return null;
    const def = SPANS[kind], line = v.slice(s, e), re = def.re(); let m;
    while ((m = re.exec(line))) {
      const inner = m[def.inner || 1], st = s + m.index, en = st + m[0].length, open = m[0].length - inner.length - def.close;
      if (a >= st && b <= en && !(a === en && b === en) && !(a === st && b === st && a !== b)) return { s: st, e: en, is: st + open, ie: en - def.close, inner, open: m[0].slice(0, open), arg: m[1] && def.inner === 2 ? m[1] : null };
    }
    return null;
  }
  function unwrapSpan(ta, sp) {
    const a = ta.selectionStart, b = ta.selectionEnd, d = sp.is - sp.s;
    const clamp = x => Math.max(sp.s, Math.min(sp.s + sp.inner.length, x - d));
    edit(ta, sp.s, sp.e, sp.inner, clamp(a), clamp(b));
  }
  function wrap(ta, mark, placeholder = 'text', kind) {
    const v = ta.value; let a = ta.selectionStart, b = ta.selectionEnd; const m = mark.length;
    if (kind) { const sp = spanAt(ta, kind); if (sp) return unwrapSpan(ta, sp); }
    if (a === b) { const [wa, wb] = wordAt(v, a); if (wb > wa) { a = wa; b = wb; } }
    const sel = v.slice(a, b);
    if (sel.length >= 2 * m && sel.startsWith(mark) && sel.endsWith(mark)) return edit(ta, a, b, sel.slice(m, -m), a, b - 2 * m);
    if (a === b) return edit(ta, a, b, mark + placeholder + mark, a + m, a + m + placeholder.length);
    return edit(ta, a, b, mark + sel + mark, a + m, b + m);
  }
  // text color / highlight: color = name or null (none)
  function paint(ta, kind, color) {
    const sp = spanAt(ta, kind);
    if (sp) {
      if (!color) return unwrapSpan(ta, sp);
      const open = kind === 'color' ? `{${color}}` : (color === 'amber' ? '==' : `=={${color}}`);
      const d = open.length - (sp.is - sp.s), a = ta.selectionStart, b = ta.selectionEnd;
      return edit(ta, sp.s, sp.is, open, a + d, b + d);
    }
    if (!color) return;
    const v = ta.value; let a = ta.selectionStart, b = ta.selectionEnd;
    if (a === b) { const [wa, wb] = wordAt(v, a); if (wb > wa) { a = wa; b = wb; } }
    const sel = v.slice(a, b) || 'text';
    const open = kind === 'color' ? `{${color}}` : (color === 'amber' ? '==' : `=={${color}}`), close = kind === 'color' ? '{/}' : '==';
    edit(ta, a, b, open + sel + close, a + open.length, a + open.length + sel.length);
  }
  function inFence(v, pos) { let open = false, off = 0; for (const l of v.split('\n')) { if (off > pos) break; if (/^```/.test(l)) open = !open; off += l.length + 1; } return open; }
  function setStyle(ta, k) {
    const v = ta.value, [s, e] = lineRange(v, ta.selectionStart, ta.selectionEnd), st = STYLES.find(x => x.k === k); if (!st) return;
    if (k === 'codeblock') {
      const before = v.slice(0, s), after = v.slice(e);
      if (/(^|\n)```[^\n]*\n$/.test(before) && /^\n```/.test(after)) {
        const fs = before.lastIndexOf('```'), fe = e + 4;
        return edit(ta, fs, fe, v.slice(s, e), fs, fs + (e - s));
      }
      const body = v.slice(s, e);
      return edit(ta, s, e, '```\n' + body + '\n```', s + 4, s + 4 + body.length);
    }
    const lines = v.slice(s, e).split('\n');
    const out = lines.map(l => { const bare = stripPrefix(l); return bare.trim() || lines.length === 1 ? st.prefix + bare.replace(/^\s+/, '') : bare; }).join('\n');
    edit(ta, s, e, out, s + out.length);
  }
  function setAlign(ta, al) {
    const v = ta.value, [s, e] = lineRange(v, ta.selectionStart, ta.selectionEnd), lines = v.slice(s, e).split('\n');
    const out = lines.map(l => {
      if (!l.trim() && lines.length > 1) return l;
      const m = l.match(/^(\s*(?:#{1,6}\s+|>\s?)?)(\{(?:left|center|right|justify)\} )?(.*)$/);
      return m[1] + (al && al !== 'left' ? `{${al}} ` : '') + m[3];
    }).join('\n');
    edit(ta, s, e, out, s + out.length);
  }
  function indent(ta, dir) {
    const v = ta.value, [s, e] = lineRange(v, ta.selectionStart, ta.selectionEnd), lines = v.slice(s, e).split('\n');
    const out = lines.map(l => dir > 0 ? (l.trim() ? '  ' + l : l) : l.replace(/^ {1,2}|^\t/, '')).join('\n');
    edit(ta, s, e, out, s + out.length);
  }
  function toggleList(ta, kind) {
    const v = ta.value, [s, e] = lineRange(v, ta.selectionStart, ta.selectionEnd), lines = v.slice(s, e).split('\n');
    const is = { bullet: l => /^\s*[-*+]\s(?!\[[ xX]\]\s)/.test(l), num: l => /^\s*\d+[.)]\s/.test(l), todo: l => /^\s*[-*+]\s\[[ xX]\]\s/.test(l) }[kind];
    const filled = lines.filter(l => l.trim());
    const allOn = filled.length ? filled.every(is) : is(lines[0] || '');
    let n = 0;
    const out = lines.map(l => {
      if (!l.trim() && lines.length > 1) return l;
      const ind = (l.match(/^\s*/) || [''])[0], bare = stripPrefix(l).slice(ind.length);
      if (allOn) return ind + bare;
      n++; return ind + (kind === 'bullet' ? '- ' : kind === 'num' ? `${n}. ` : '- [ ] ') + bare;
    }).join('\n');
    edit(ta, s, e, out, s + out.length);
  }
  function insertBlock(ta, block, caretIn) {
    const v = ta.value, pos = ta.selectionEnd, [s, e] = lineRange(v, pos, pos), line = v.slice(s, e);
    if (!line.trim()) {
      const pre = s > 0 && v[s - 2] !== undefined && v[s - 2] !== '\n' ? '\n' : '';
      const text = pre + block + (v.slice(e, e + 1) === '\n' ? '' : '\n');
      const at = s + pre.length + (caretIn === undefined ? block.length + 1 : caretIn);
      return edit(ta, s, e, text, Math.min(at, s + text.length));
    }
    const text = '\n\n' + block + '\n';
    edit(ta, e, e, text, e + 2 + (caretIn === undefined ? block.length + 1 : caretIn));
  }
  function link(ta) {
    const v = ta.value; let a = ta.selectionStart, b = ta.selectionEnd;
    if (a === b) { const [wa, wb] = wordAt(v, a); if (wb > wa) { a = wa; b = wb; } }
    const sel = v.slice(a, b);
    if (/^https?:\/\/\S+$/.test(sel)) return edit(ta, a, b, `[${sel}](${sel})`, a + 1, a + 1 + sel.length);
    const t = sel || 'link text', url = 'https://';
    edit(ta, a, b, `[${t}](${url})`, a + t.length + 3, a + t.length + 3 + url.length);
  }
  function clear(ta) {
    const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    const [ls, le] = lineRange(v, a, b), [s, e] = a === b ? [ls, le] : [a, b];
    const whole = a === b || (s === ls && e === le);
    let t = v.slice(s, e).replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1').replace(new RegExp(`\\{(?:${CNAMES})\\}|\\{\\/\\}|==\\{(?:${CNAMES})\\}`, 'g'), '')
      .replace(/\*\*|__|~~|\+\+|==|`/g, '').replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*/g, '$1$2').replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_/g, '$1$2');
    if (whole) t = t.split('\n').map(l => stripPrefix(l).replace(ALIGN, '')).join('\n');
    edit(ta, s, e, t, s, s + t.length);
  }
  function toc(ta) {
    const hs = headings(ta.value).filter(h => h.level > 1 || headings(ta.value).every(x => x.level === 1));
    if (!hs.length) return toast('Add a heading first: the table of contents lists your headings.');
    const min = Math.min(...hs.map(h => h.level));
    insertBlock(ta, '**Contents**\n' + hs.map(h => `${'  '.repeat(h.level - min)}- ${h.text}`).join('\n'));
  }
  function history(ta, dir) { ta.focus({ preventScroll: true }); try { document.execCommand(dir); } catch {} }

  function styleOf(ta) {
    const v = ta.value, pos = ta.selectionStart, [s, e] = lineRange(v, pos, pos), line = v.slice(s, e);
    if (inFence(v, s)) return 'codeblock';
    const m = line.match(/^(#{1,6})\s/); if (m) return ['title', 'h1', 'h2', 'h3', 'subtitle', 'subtitle'][m[1].length - 1];
    if (/^>\s?/.test(line)) return 'quote';
    return 'normal';
  }
  function listOf(ta) {
    const v = ta.value, pos = ta.selectionStart, [s, e] = lineRange(v, pos, pos), l = v.slice(s, e);
    return /^\s*[-*+]\s\[[ xX]\]\s/.test(l) ? 'todo' : /^\s*[-*+]\s/.test(l) ? 'bullet' : /^\s*\d+[.)]\s/.test(l) ? 'num' : '';
  }
  function alignOf(ta) {
    const v = ta.value, pos = ta.selectionStart, [s, e] = lineRange(v, pos, pos), m = v.slice(s, e).match(/^\s*(?:#{1,6}\s+|>\s?)?\{(left|center|right|justify)\} /);
    return m ? m[1] : 'left';
  }

  // ---------- line spacing: a per-device view setting (Markdown has no line spacing) ----------
  const LH_KEY = 'tribecode.doc.lineSpacing';
  const lhGet = () => { try { return +localStorage.getItem(LH_KEY) || 1.15; } catch { return 1.15; } };
  function applySpacing(root) { const v = lhGet(); (root || document.documentElement).style.setProperty('--dl-lh', String(Math.round(v * 1.6 / 1.15 * 100) / 100)); return v; }

  // ---------- commands (shared by both layouts) ----------
  const ops = {
    undo: ta => history(ta, 'undo'), redo: ta => history(ta, 'redo'),
    bold: ta => wrap(ta, '**', 'text', 'bold'), italic: ta => wrap(ta, '*', 'text', 'italic'), underline: ta => wrap(ta, '++', 'text', 'underline'),
    strike: ta => wrap(ta, '~~', 'text', 'strike'), code: ta => wrap(ta, '`', 'code', 'code'), link,
    bullet: ta => toggleList(ta, 'bullet'), num: ta => toggleList(ta, 'num'), todo: ta => toggleList(ta, 'todo'),
    outdent: ta => indent(ta, -1), indent: ta => indent(ta, 1),
    hr: ta => insertBlock(ta, '---'), table: ta => { const t = '| Column | Column |\n| --- | --- |\n|  |  |\n|  |  |'; insertBlock(ta, t, t.indexOf('|  |') + 2); },
    clear, toc,
    normal: ta => setStyle(ta, 'normal'), title: ta => setStyle(ta, 'title'), subtitle: ta => setStyle(ta, 'subtitle'), h1: ta => setStyle(ta, 'h1'), h2: ta => setStyle(ta, 'h2'), h3: ta => setStyle(ta, 'h3'),
    quote: ta => setStyle(ta, 'quote'), codeblock: ta => setStyle(ta, 'codeblock'),
    left: ta => setAlign(ta, 'left'), center: ta => setAlign(ta, 'center'), right: ta => setAlign(ta, 'right'), justify: ta => setAlign(ta, 'justify'),
  };
  for (const [c] of COLORS) { ops['color:' + c] = ta => paint(ta, 'color', c); ops['highlight:' + c] = ta => paint(ta, 'highlight', c); }
  ops['color:none'] = ta => paint(ta, 'color', null); ops['highlight:none'] = ta => paint(ta, 'highlight', null);
  function run(k, ta) { if (!ta || !ops[k]) return false; ops[k](ta); return true; }

  function key(e, ta) {
    if (!(e.ctrlKey || e.metaKey)) return false;
    const k = e.key.toLowerCase(), code = e.code || '';
    let act = null;
    if (e.altKey && !e.shiftKey) act = { Digit0: 'normal', Digit1: 'h1', Digit2: 'h2', Digit3: 'h3' }[code] || null;
    else if (e.shiftKey && !e.altKey) act = { Digit7: 'num', Digit8: 'bullet', Digit9: 'todo', KeyX: 'strike', KeyL: 'left', KeyE: 'center', KeyR: 'right', KeyJ: 'justify' }[code] || (k === 'z' ? 'redo' : null);
    else if (!e.altKey) act = { b: 'bold', i: 'italic', u: 'underline', k: 'link', e: 'code', '\\': 'clear', z: 'undo', y: 'redo', ']': 'indent', '[': 'outdent' }[k] || null;
    if (!act) return false;
    e.preventDefault(); e.stopPropagation();   // Ctrl+K is also the command palette: in the editor it inserts a link
    run(act, ta);
    return true;
  }

  // ---------- sheets + popovers (phone: bottom sheet; desktop: popover under the anchor, or a centered card) ----------
  let openSheet = null;
  function sheet({ title, html, anchor, cls = '', label, onClose, keepFocus = true }) {
    if (openSheet) openSheet.close(true);
    const pop = isDesk() && anchor;
    const w = document.createElement('div'); w.className = `dl-sheet-wrap ${pop ? 'pop' : ''} ${cls}`;
    w.innerHTML = `<div class="dl-sheet" role="dialog" aria-label="${esc(label || title || 'Menu')}">${title ? `<div class="dl-sheet-h"><span class="dl-eyebrow">${esc(title)}</span><button type="button" class="dl-x" data-close aria-label="Close">${ico('close')}</button></div>` : ''}${html}</div>`;
    document.body.appendChild(w);
    const box = w.querySelector('.dl-sheet');
    if (pop) { const r = anchor.getBoundingClientRect(); box.style.left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.left)) + 'px'; box.style.top = Math.min(innerHeight - box.offsetHeight - 8, r.bottom + 6) + 'px'; }
    if (keepFocus) box.addEventListener('mousedown', e => { if (e.target.closest('button') && !e.target.closest('input, textarea')) e.preventDefault(); });
    const prev = document.activeElement;
    const self = {
      el: w, box,
      close(silent) { if (!w.isConnected) return; w.remove(); if (openSheet === self) openSheet = null; if (anchor) anchor.setAttribute('aria-expanded', 'false'); if (onClose) onClose(); if (!silent && prev && prev.focus && prev.isConnected) prev.focus({ preventScroll: true }); },
    };
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-close]')) self.close(); });
    w.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); self.close(); } });
    openSheet = self;
    return self;
  }
  // A list of actions: items [{ k, label, icon, id, run, sub }] ('-' = divider)
  function menuSheet({ title, items, anchor, label }) {
    const html = `<div class="dl-list" role="menu">${items.map((it, i) => it === '-' ? '<div class="dl-list-sep" role="separator"></div>'
      : `<button type="button" role="menuitem" class="dl-li ${it.danger ? 'danger' : ''} ${it.on ? 'on' : ''}" data-i="${i}"${it.id ? ` id="${esc(it.id)}"` : ''}>${it.icon ? ico(it.icon, 20) : ''}<span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`).join('')}</div>`;
    const s = sheet({ title, html, anchor, label });
    s.box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const it = items[+b.dataset.i]; s.close(true); it.run && it.run(); });
    const f = s.box.querySelector('.dl-li.on') || s.box.querySelector('.dl-li'); if (f && isDesk()) f.focus();
    s.box.addEventListener('keydown', e => {
      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return; const all = [...s.box.querySelectorAll('.dl-li')], i = all.indexOf(document.activeElement);
      e.preventDefault(); all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length].focus();
    });
    return s;
  }
  function paletteSheet(ta, kind, anchor, after) {
    const sp = spanAt(ta, kind), cur = sp ? (sp.arg || (kind === 'highlight' ? 'amber' : null)) : null;
    const html = `<div class="dl-swatches" role="radiogroup" aria-label="${kind === 'color' ? 'Text color' : 'Highlight color'}">
      <button type="button" class="dl-sw none ${!cur ? 'on' : ''}" data-c="none" role="radio" aria-checked="${!cur}" aria-label="None"><span>${ico('close', 16)}</span></button>
      ${COLORS.map(([k, l, hex]) => `<button type="button" class="dl-sw ${kind} ${cur === k ? 'on' : ''}" data-c="${k}" role="radio" aria-checked="${cur === k}" aria-label="${l}" title="${l}"><span style="${kind === 'color' ? `color:${hex}` : `background:${hex}`}">${kind === 'color' ? 'A' : ''}</span></button>`).join('')}</div>`;
    const s = sheet({ title: kind === 'color' ? 'Text color' : 'Highlight color', html, anchor });
    s.box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { s.close(true); run(`${kind}:${b.dataset.c}`, ta); after && after(); });
    if (isDesk()) (s.box.querySelector('.dl-sw.on') || s.box.querySelector('.dl-sw')).focus();
    return s;
  }
  function alignSheet(ta, anchor, after) {
    const cur = alignOf(ta);
    return menuSheet({ title: 'Align', anchor, items: ['left', 'center', 'right', 'justify'].map(a => ({ label: a[0].toUpperCase() + a.slice(1), icon: 'align' + a, on: cur === a, run: () => { run(a, ta); after && after(); } })) });
  }
  // A≡: the Text / Paragraph panel (Google Docs mobile)
  function formatPanel(ta, after, tab = 'text') {
    const draw = () => {
      const st = styleOf(ta), al = alignOf(ta), li = listOf(ta), lh = lhGet();
      const on = k => { const sp = SPANS[k] && spanAt(ta, k); return sp ? 'on' : ''; };
      return `<div class="dl-tabs2" role="tablist"><button role="tab" type="button" class="${tab === 'text' ? 'on' : ''}" aria-selected="${tab === 'text'}" data-tab="text">Text</button><button role="tab" type="button" class="${tab === 'para' ? 'on' : ''}" aria-selected="${tab === 'para'}" data-tab="para">Paragraph</button></div>
      ${tab === 'text' ? `<div class="dl-styles">${['title', 'subtitle', 'h1', 'h2', 'h3', 'normal'].map(k => { const s = STYLES.find(x => x.k === k); return `<button type="button" class="dl-mi st-${k} ${st === k ? 'on' : ''}" data-op="${k}" aria-pressed="${st === k}"><span>${esc(s.label)}</span>${st === k ? ico('tick', 18) : ''}</button>`; }).join('')}</div>
        <div class="dl-row4">${['bold', 'italic', 'underline', 'strike'].map(k => `<button type="button" class="dl-pb ${on(k)}" data-op="${k}" aria-label="${k[0].toUpperCase() + k.slice(1)}" aria-pressed="${!!on(k)}">${ico(k, 22)}</button>`).join('')}</div>
        <div class="dl-row2"><button type="button" class="dl-pb wide" data-sub="color"><span class="gd-a">A<i class="gd-bar"></i></span><span>Text color</span></button><button type="button" class="dl-pb wide" data-sub="highlight">${ico('highlight', 20)}<span>Highlight</span></button></div>
        <button type="button" class="dl-li" data-op="clear">${ico('clear', 20)}<span>Clear formatting</span></button>`
      : `<div class="dl-sub">Alignment</div><div class="dl-row4">${['left', 'center', 'right', 'justify'].map(a => `<button type="button" class="dl-pb ${al === a ? 'on' : ''}" data-op="${a}" aria-label="Align ${a}" aria-pressed="${al === a}">${ico('align' + a, 22)}</button>`).join('')}</div>
        <div class="dl-sub">Indent</div><div class="dl-row2"><button type="button" class="dl-pb wide" data-op="outdent">${ico('outdent', 20)}<span>Decrease</span></button><button type="button" class="dl-pb wide" data-op="indent">${ico('indent', 20)}<span>Increase</span></button></div>
        <div class="dl-sub">Line spacing <small>on this device</small></div><div class="dl-row4">${[1, 1.15, 1.5, 2].map(v => `<button type="button" class="dl-pb ${Math.abs(lh - v) < 0.01 ? 'on' : ''}" data-lh="${v}" aria-pressed="${Math.abs(lh - v) < 0.01}">${v}</button>`).join('')}</div>
        <div class="dl-sub">Lists</div><div class="dl-row4">${[['bullet', 'Bulleted list'], ['num', 'Numbered list'], ['todo', 'Checklist']].map(([k, l]) => `<button type="button" class="dl-pb ${li === k ? 'on' : ''}" data-op="${k}" aria-label="${l}" aria-pressed="${li === k}">${ico(k, 22)}</button>`).join('')}</div>`}`;
    };
    const s = sheet({ title: 'Format', html: `<div class="dl-fp">${draw()}</div>`, cls: 'fp', label: 'Format' });
    const body = s.box.querySelector('.dl-fp');
    const wire = () => {
      body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; body.innerHTML = draw(); wire(); });
      body.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { run(b.dataset.op, ta); after && after(); body.innerHTML = draw(); wire(); });
      body.querySelectorAll('[data-lh]').forEach(b => b.onclick = () => { try { localStorage.setItem(LH_KEY, b.dataset.lh); } catch {} applySpacing(); after && after(); body.innerHTML = draw(); wire(); });
      body.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { s.close(true); paletteSheet(ta, b.dataset.sub, null, after); });
    };
    wire();
    return s;
  }
  // + Insert (shared): Link, Comment, Table, Horizontal line, Checklist, Code block, Table of contents
  function insertSheet(ta, { anchor, onComment, after } = {}) {
    const go = k => () => { run(k, ta); after && after(); };
    return menuSheet({ title: 'Insert', anchor, items: [
      { label: 'Link', icon: 'link', run: go('link') },
      ...(onComment ? [{ label: 'Comment', icon: 'comment', run: onComment }] : []),
      { label: 'Table', icon: 'table', run: go('table') },
      { label: 'Horizontal line', icon: 'hr', run: go('hr') },
      { label: 'Checklist', icon: 'todo', run: go('todo') },
      { label: 'Code block', icon: 'codeblock', run: go('codeblock') },
      { label: 'Table of contents', icon: 'toc', run: go('toc') },
    ] });
  }
  // Ask AI (sparkle): Summarize · Help me write · Tidy up · a free prompt. The answer can go into the doc.
  function aiSheet(ta, { anchor, title = 'this doc', after } = {}) {
    const C = window.TribeClient;
    const html = `<div class="dl-ai"><div class="dl-ai-chips"><button type="button" class="dl-chip" data-ai="sum">${ico('sparkle', 16)}Summarize</button><button type="button" class="dl-chip" data-ai="write">${ico('rename', 16)}Help me write</button><button type="button" class="dl-chip" data-ai="tidy">${ico('clear', 16)}Tidy up</button></div>
      <div class="dl-ai-row"><input class="dl-in" id="dl-ai-q" placeholder="Ask about ${esc(title)}…" autocomplete="off" aria-label="Ask AI"><button type="button" class="btn primary" id="dl-ai-go">Ask</button></div>
      <div class="dl-ai-out" id="dl-ai-out" aria-live="polite"></div></div>`;
    const s = sheet({ title: 'Ask AI', html, anchor, keepFocus: false });
    const out = s.box.querySelector('#dl-ai-out');
    const ask = async (kind, q) => {
      if (!C || !C.connected()) return void (out.innerHTML = '<p class="dl-ai-note">Ask AI uses the tribe\'s local model. Join or host a tribe first.</p>');
      const text = ta.value, sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      out.innerHTML = '<p class="dl-ai-note">Thinking…</p>';
      try {
        let answer;
        if (kind === 'tidy') answer = (await C.api('/scratch/refine', { method: 'POST', body: { text: sel || text } })).text;
        else {
          const prompt = kind === 'sum' ? `Summarize this document in a few short bullet points:\n\n${text}`
            : kind === 'write' ? `Continue this document with one or two helpful paragraphs in the same voice. Reply with the new text only.\n\n${text}`
            : `${q}\n\nThe document:\n\n${text}`;
          answer = (await C.api('/hub/ask', { method: 'POST', body: { prompt: prompt.slice(0, 12000) } })).answer;
        }
        answer = String(answer || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        out.innerHTML = `<div class="md dl-ai-ans">${window.TribeMD ? window.TribeMD.render(answer) : esc(answer)}</div>
          <div class="dl-ai-acts"><button type="button" class="btn" data-put="insert">Insert</button>${kind === 'tidy' ? `<button type="button" class="btn" data-put="replace">Replace ${sel ? 'selection' : 'all'}</button>` : ''}<button type="button" class="btn ghost" data-put="copy">Copy</button></div>`;
        out.querySelectorAll('[data-put]').forEach(b => b.onclick = async () => {
          const how = b.dataset.put;
          if (how === 'copy') { try { await navigator.clipboard.writeText(answer); toast('Copied'); } catch {} return; }
          s.close(true);
          if (how === 'replace') { if (sel) edit(ta, ta.selectionStart, ta.selectionEnd, answer); else edit(ta, 0, ta.value.length, answer, 0); }
          else { const p = ta.selectionEnd, [, e] = lineRange(ta.value, p, p); edit(ta, e, e, (e ? '\n\n' : '') + answer + '\n', e + (e ? 2 : 0) + answer.length); }
          after && after();
        });
      } catch (e) { out.innerHTML = `<p class="dl-ai-note">${esc(e.status === 503 ? 'The local model is off. Install Ollama and a Qwen model on the host.' : e.message)}</p>`; }
    };
    s.box.querySelectorAll('[data-ai]').forEach(b => b.onclick = () => ask(b.dataset.ai));
    const q = s.box.querySelector('#dl-ai-q');
    s.box.querySelector('#dl-ai-go').onclick = () => q.value.trim() && ask('q', q.value.trim());
    q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (q.value.trim()) ask('q', q.value.trim()); } };
    if (isDesk()) q.focus();
    return s;
  }
  // Find and replace (works on the Markdown text)
  function findSheet(ta, { anchor } = {}) {
    const html = `<div class="dl-find"><input class="dl-in" id="dl-find-q" placeholder="Find" autocomplete="off" aria-label="Find"><input class="dl-in" id="dl-find-r" placeholder="Replace with" autocomplete="off" aria-label="Replace with">
      <div class="dl-find-acts"><span class="dl-find-n" id="dl-find-n" aria-live="polite"></span><button type="button" class="btn ghost" id="dl-find-next">Next</button><button type="button" class="btn" id="dl-find-one">Replace</button><button type="button" class="btn primary" id="dl-find-all">Replace all</button></div></div>`;
    const s = sheet({ title: 'Find and replace', html, anchor, keepFocus: false });
    const q = s.box.querySelector('#dl-find-q'), r = s.box.querySelector('#dl-find-r'), n = s.box.querySelector('#dl-find-n');
    const count = () => { const t = q.value; const c = t ? ta.value.split(t).length - 1 : 0; n.textContent = t ? `${c} found` : ''; return c; };
    const next = () => {
      const t = q.value; if (!t) return;
      let i = ta.value.indexOf(t, ta.selectionEnd); if (i < 0) i = ta.value.indexOf(t);
      if (i < 0) return count();
      ta.setSelectionRange(i, i + t.length);
      const sc = scrollerOf(ta), base = ta.getBoundingClientRect().top - (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top) + sc.scrollTop;
      sc.scrollTop = Math.max(0, base + caretY(ta, i) - 120); count();
    };
    q.oninput = count;
    q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); next(); } };
    s.box.querySelector('#dl-find-next').onclick = next;
    s.box.querySelector('#dl-find-one').onclick = () => { const t = q.value; if (!t) return; if (ta.value.slice(ta.selectionStart, ta.selectionEnd) !== t) return next(); const a = ta.selectionStart; edit(ta, a, a + t.length, r.value, a, a + r.value.length); next(); };
    s.box.querySelector('#dl-find-all').onclick = () => { const t = q.value; if (!t) return; const c = count(); if (!c) return; edit(ta, 0, ta.value.length, ta.value.split(t).join(r.value), 0); count(); toast(`Replaced ${c}`); };
    q.focus();
    return s;
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = (String(name || 'note').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'note') + '.md';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- wiring a toolbar (desktop .dl-fmt or phone .gd-fmt) to a textarea ----------
  function bind(root, getTa, opts = {}) {
    const bars = [...root.querySelectorAll('.dl-fmt, .gd-fmt')];
    for (const bar of bars) {
      const btns = () => [...bar.querySelectorAll('.dl-tb')];
      btns().forEach((b, i) => b.tabIndex = i === 0 ? 0 : -1);
      bar.addEventListener('mousedown', e => { if (e.target.closest('.dl-tb')) e.preventDefault(); });
      bar.addEventListener('click', e => {
        const b = e.target.closest('.dl-tb'); if (!b) return;
        const k = b.dataset.fmt, ta = getTa(); if (!ta) return;
        const after = () => sync(root, ta);
        if (k === 'style') return styleMenu(b, ta, after);
        if (k === 'color' || k === 'highlight') return paletteSheet(ta, k, b, after);
        if (k === 'align') return alignSheet(ta, b, after);
        if (k === 'textfmt') return formatPanel(ta, after);
        run(k, ta); after();
      });
      bar.addEventListener('keydown', e => {
        const b = e.target.closest('.dl-tb'); if (!b || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const all = btns(), i = all.indexOf(b);
        const n = e.key === 'Home' ? all[0] : e.key === 'End' ? all[all.length - 1] : all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
        if (n) { e.preventDefault(); all.forEach(x => x.tabIndex = -1); n.tabIndex = 0; n.focus(); }
      });
      bar.addEventListener('focusin', e => { const b = e.target.closest('.dl-tb'); if (b) { btns().forEach(x => x.tabIndex = -1); b.tabIndex = 0; } });
    }
    const ta = getTa(); if (ta) { const s = () => sync(root, getTa()); ['keyup', 'mouseup', 'input', 'focus', 'select'].forEach(ev => ta.addEventListener(ev, s)); sync(root, ta); }
    applySpacing();
  }
  // reflect the selection's styles in the toolbar (bold on, list kind, block style, alignment, color)
  function sync(root, ta) {
    if (!root || !ta) return;
    const st = STYLES.find(x => x.k === styleOf(ta)) || STYLES[0], li = listOf(ta), al = alignOf(ta);
    root.querySelectorAll('.dl-style').forEach(b => { b.querySelector('.dl-style-l').textContent = st.label; b.setAttribute('aria-label', 'Text style: ' + st.label); });
    const set = (b, on) => { b.classList.toggle('on', on); if (b.hasAttribute('aria-pressed') || b.classList.contains('gd-b')) b.setAttribute('aria-pressed', String(on)); };
    root.querySelectorAll('[data-fmt="bullet"],[data-fmt="num"],[data-fmt="todo"]').forEach(b => set(b, b.dataset.fmt === li));
    ['bold', 'italic', 'underline', 'strike', 'code'].forEach(k => root.querySelectorAll(`[data-fmt="${k}"]`).forEach(b => set(b, !!spanAt(ta, k))));
    root.querySelectorAll('[data-fmt="align"]').forEach(b => { const svg = b.querySelector('svg.dl-i'); if (svg) svg.innerHTML = P['align' + al]; b.setAttribute('aria-label', `Align: ${al}`); });
    const c = spanAt(ta, 'color'), h = spanAt(ta, 'highlight');
    const hex = n => (COLORS.find(x => x[0] === n) || [])[2];
    root.querySelectorAll('[data-fmt="color"] .gd-bar').forEach(i => { i.style.background = c ? hex(c.arg) : ''; });
    root.querySelectorAll('[data-fmt="highlight"]').forEach(b => set(b, !!h));
  }
  let menuEl = null;
  function closeMenu(focusBack) {
    if (!menuEl) return; const { el, btn, off } = menuEl; menuEl = null;
    el.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', off, true);
    if (focusBack) btn.focus();
  }
  function styleMenu(btn, ta, after) {
    if (menuEl) return closeMenu(true);
    const cur = styleOf(ta);
    const el = document.createElement('div'); el.className = 'dl-menu'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', 'Text style');
    el.innerHTML = STYLES.map(s => `<button type="button" role="menuitemradio" aria-checked="${s.k === cur}" class="dl-mi st-${s.k} ${s.k === cur ? 'on' : ''}" data-st="${s.k}" tabindex="-1"><span>${esc(s.label)}</span>${s.keys ? `<small>${esc(s.keys)}</small>` : ''}</button>`).join('');
    document.body.appendChild(el); btn.setAttribute('aria-expanded', 'true');   // fixed: the toolbar scrolls sideways and would clip it
    const r = btn.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, r.left)) + 'px';
    el.style.top = Math.min(innerHeight - el.offsetHeight - 8, r.bottom + 4) + 'px';
    const items = [...el.querySelectorAll('[data-st]')];
    const pick = k => { closeMenu(false); run(k, ta); after && after(); ta.focus({ preventScroll: true }); };
    items.forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => pick(b.dataset.st); });
    el.addEventListener('keydown', e => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'Tab') closeMenu(false);
    });
    const off = e => { if (!el.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMenu(false); };
    menuEl = { el, btn, off };
    setTimeout(() => document.addEventListener('mousedown', off, true), 0);
    (items.find(b => b.dataset.st === cur) || items[0]).focus();
  }

  // ---------- headings + outline ----------
  function headings(text) {
    const out = []; let fence = false, off = 0;
    for (const line of String(text || '').split('\n')) {
      if (/^```/.test(line)) fence = !fence;
      else if (!fence) { const m = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/); if (m) out.push({ level: m[1].length, text: m[2].replace(ALIGN, '').replace(/\*\*|__|~~|\+\+|==|`/g, ''), at: off, end: off + line.length }); }
      off += line.length + 1;
    }
    return out;
  }
  function caretY(ta, pos) {
    const m = document.createElement('div'), cs = getComputedStyle(ta);
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'border', 'letterSpacing', 'wordSpacing', 'tabSize', 'width', 'boxSizing'].forEach(k => (m.style[k] = cs[k]));
    Object.assign(m.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '0', height: 'auto' });
    m.textContent = ta.value.slice(0, pos);
    const sp = document.createElement('span'); sp.textContent = '​'; m.appendChild(sp);
    ta.parentNode.appendChild(m); const y = sp.offsetTop - ta.scrollTop; m.remove(); return y;
  }
  function scrollerOf(el) {
    for (let p = el && el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return p; }
    return document.scrollingElement;
  }
  function outline(o) {
    let hs = [], ys = null, raf = 0, scroller = null, cur = -1;
    const ta = () => o.ta(), read = () => (o.read ? o.read() : null);
    const reading = () => { const r = read(); return !!(r && !r.classList.contains('hidden') && r.offsetParent !== null); };
    function render() {
      const t = ta(); hs = headings(t ? t.value : ''); ys = null;
      if (!o.el) return;
      if (!hs.length) { o.el.innerHTML = '<p class="dl-ol-empty">Headings you add appear here</p>'; cur = -1; return; }
      const min = Math.min(...hs.map(h => h.level));
      o.el.innerHTML = `<ul class="dl-ol-list" role="list">${hs.map((h, i) => `<li><button type="button" class="dl-ol-i ${i === cur ? 'on' : ''}" data-h="${i}" style="--lv:${h.level - min}" ${i === cur ? 'aria-current="true"' : ''}>${esc(h.text)}</button></li>`).join('')}</ul>`;
      o.el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => go(+b.dataset.h));
      attach(); spy();
    }
    function attach() {
      const t = ta(); if (!t) return;
      const s = scrollerOf(t); if (s === scroller) return;
      if (scroller) (scroller === document.scrollingElement ? window : scroller).removeEventListener('scroll', onScroll);
      scroller = s; (scroller === document.scrollingElement ? window : scroller).addEventListener('scroll', onScroll, { passive: true });
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; spy(); }); };
    const top0 = () => (scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top);
    function positions() {
      const t = ta(); if (!t || !scroller) return [];
      if (reading()) { const els = [...read().querySelectorAll('h1, h2, h3, h4')]; return hs.map((h, i) => els[i] ? els[i].getBoundingClientRect().top - top0() + scroller.scrollTop : Infinity); }
      if (!ys) { const base = t.getBoundingClientRect().top - top0() + scroller.scrollTop; ys = hs.map(h => base + caretY(t, h.at)); }
      return ys;
    }
    function spy() {
      if (!o.el || !hs.length || !scroller) return;
      const off = (o.offset ? o.offset() : 0) + 24, y = scroller.scrollTop + off, p = positions();
      let i = -1; for (let j = 0; j < p.length; j++) if (p[j] <= y) i = j;
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      if (atEnd && p.length && p[p.length - 1] < scroller.scrollTop + scroller.clientHeight) i = Math.max(i, p.length - 1);
      if (i === -1 && hs.length) i = 0;
      if (i === cur) return; cur = i;
      o.el.querySelectorAll('[data-h]').forEach(b => { const on = +b.dataset.h === i; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    }
    function go(i) {
      const h = hs[i], t = ta(); if (!h || !t) return;
      attach(); ys = null;
      const p = positions()[i], off = o.offset ? o.offset() : 0;
      if (Number.isFinite(p)) scroller.scrollTo({ top: Math.max(0, p - off - 12), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (!reading()) { t.focus({ preventScroll: true }); t.setSelectionRange(h.end, h.end); }
      cur = -2; setTimeout(() => { cur = -2; spy(); }, 450);
      o.el.querySelectorAll('[data-h]').forEach(b => b.classList.toggle('on', +b.dataset.h === i));
      if (o.onGo) o.onGo(i);
    }
    let rt = 0;
    const refresh = () => { clearTimeout(rt); rt = setTimeout(render, 120); };
    addEventListener('resize', () => { ys = null; spy(); });
    render();
    return { refresh, render, go, invalidate: () => { ys = null; }, headings: () => hs };
  }
  function outlineSheet(o) {
    const s = sheet({ title: 'Outline', html: '<nav class="dl-ol" aria-label="Outline"></nav>', keepFocus: false });
    outline({ ...o, el: s.box.querySelector('.dl-ol'), onGo: () => setTimeout(() => s.close(true), 60) });
    const f = s.box.querySelector('.dl-ol-i') || s.box.querySelector('.dl-x'); if (f) f.focus({ preventScroll: true });
    return s;
  }

  // ---------- slash menu (the notes editor; docs.js keeps its own richer one with the same block items) ----------
  const SLASH = [['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['bullet', 'Bulleted list'], ['num', 'Numbered list'], ['todo', 'To-do'], ['quote', 'Quote'], ['codeblock', 'Code'], ['hr', 'Divider'], ['table', 'Table']];
  function slash(ta, host) {
    let st = null;
    const el = document.createElement('div'); el.className = 'slash dl-slash hidden'; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', 'Insert block');
    host.appendChild(el);
    function check() {
      const pos = ta.selectionStart, before = ta.value.slice(0, pos), m = before.match(/(^|\n)\/([a-z0-9 ]*)$/i);
      if (!m || ta.selectionStart !== ta.selectionEnd) return hide();
      const q = m[2].toLowerCase(), items = SLASH.filter(([, l]) => l.toLowerCase().includes(q));
      if (!items.length) return hide();
      st = { start: pos - m[2].length - 1, items, sel: st && st.items.length === items.length ? Math.min(st.sel, items.length - 1) : 0 };
      draw();
    }
    function draw() {
      el.innerHTML = st.items.map(([k, l], i) => `<button type="button" role="option" aria-selected="${i === st.sel}" class="${i === st.sel ? 'on' : ''}" data-k="${k}">${esc(l)}</button>`).join('');
      const tr = ta.getBoundingClientRect(), hr = host.getBoundingClientRect();
      const y = caretY(ta, st.start) + (tr.top - hr.top) + host.scrollTop;
      el.style.left = Math.max(0, Math.min(tr.left - hr.left, host.clientWidth - 270)) + 'px'; el.style.top = (y + 28) + 'px';
      el.classList.remove('hidden');
      el.querySelectorAll('[data-k]').forEach((b, i) => b.onmousedown = e => { e.preventDefault(); st.sel = i; apply(); });
    }
    function hide() { st = null; el.classList.add('hidden'); }
    function apply() {
      const [k] = st.items[st.sel], start = st.start, end = ta.selectionStart; hide();
      edit(ta, start, end, '', start);
      run(k, ta);
    }
    function onKey(e) {
      if (!st) return false;
      if (e.key === 'ArrowDown') { e.preventDefault(); st.sel = (st.sel + 1) % st.items.length; draw(); return true; }
      if (e.key === 'ArrowUp') { e.preventDefault(); st.sel = (st.sel - 1 + st.items.length) % st.items.length; draw(); return true; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); apply(); return true; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); return true; }
      return false;
    }
    ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) hide(); }, 150));
    return { key: onKey, check, hide, open: () => !!st };
  }
  function enterList(e, ta) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
    const pos = ta.selectionStart, ls = ta.value.lastIndexOf('\n', pos - 1) + 1, line = ta.value.slice(ls, pos);
    const m = line.match(/^(\s*)([-*] \[[ xX]\] |[-*] |(\d+)[.)] |> )/); if (!m) return false;
    e.preventDefault();
    if (line.trim() === m[2].trim()) edit(ta, ls, pos, '', ls);
    else { let next = m[2].replace(/\[[xX]\]/, '[ ]'); if (m[3]) next = `${+m[3] + 1}. `; const t = '\n' + m[1] + next; edit(ta, pos, ta.selectionEnd, t, pos + t.length); }
    return true;
  }

  // ---------- desktop top bar ----------
  function top(o) {
    return `<header class="dl-top">
      <span class="dl-ic ${o.kind === 'note' ? 'note' : ''}" aria-hidden="true">${ico(o.kind === 'note' ? 'note' : 'doc', 20)}</span>
      <div class="dl-id">
        <input class="dl-name" id="${esc(o.nameId)}" value="${esc(o.title)}" maxlength="120" placeholder="Untitled" aria-label="Document title" autocomplete="off" spellcheck="false">
        <div class="dl-meta"><span class="dl-where">${esc(o.where)}</span><span class="dl-dot" aria-hidden="true">·</span><span id="${esc(o.statusId)}" class="dl-status" aria-live="polite">${esc(o.status || '')}</span>${o.peers || ''}</div>
      </div>
      ${o.acts || ''}
    </header>`;
  }
  function mirror(name, title, onEnter) {
    if (!name || !title) return;
    name.addEventListener('input', () => { title.value = name.value; title.dispatchEvent(new Event('input', { bubbles: true })); });
    title.addEventListener('input', () => { if (document.activeElement !== name) name.value = title.value; });
    name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); onEnter && onEnter(); } });
  }

  // Phone: the format bar rides on the on-screen keyboard (visualViewport). always: it is fixed at the bottom even
  // without a keyboard (the full-screen note editor); otherwise it docks only while the keyboard is up.
  function dockAboveKeyboard(bar, ta, { always = false } = {}) {
    if (!bar || !ta) return () => {};
    const vv = window.visualViewport;
    const place = () => {
      if (!bar.isConnected) return;
      if (isDesk()) { bar.classList.remove('docked'); bar.style.removeProperty('--kb'); return; }
      const kb = vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;
      const focused = document.activeElement === ta || bar.contains(document.activeElement);
      const dock = always || (focused && kb > 80);
      bar.classList.toggle('docked', dock);
      bar.style.setProperty('--kb', (dock ? kb : 0) + 'px');
    };
    if (vv) { vv.addEventListener('resize', place); vv.addEventListener('scroll', place); }
    addEventListener('resize', place);
    ta.addEventListener('focus', place); ta.addEventListener('blur', () => setTimeout(place, 120));
    place();
    return place;
  }

  window.TribeDocLayout = { isDesk, toolbar, gdBar, gdHeader, bind, sync, key, run, ops, headings, outline, outlineSheet, slash, enterList, top, mirror, styleOf, ico, edit, dockAboveKeyboard, scrollerOf,
    sheet, menuSheet, insertSheet, aiSheet, findSheet, formatPanel, paletteSheet, download, applySpacing, spanAt };
})();
