// Rich text (WYSIWYG) editing over Markdown, for project docs (docs.js) and personal notes (hub.js noteEditor).
//
// TribeRich.upgrade(textarea) swaps the editor's <textarea> for a contenteditable surface that shows the doc as
// formatted text (headings look like headings, **bold** is bold, checkboxes are real) while Markdown stays the stored
// format. The surface keeps the textarea's id and acts like one for every other module: it has .value (the Markdown),
// .selectionStart / .selectionEnd / .selectionDirection (Markdown offsets), setSelectionRange(), setRangeText(),
// focus(), and fires 'input' after each change. So live co-editing (coedit.js + ot.js diff the Markdown text), the
// toolbar and menus (doclayout.js edit Markdown), the slash menu, [[links]] / @mentions, dictation, history, export
// and the server keep working unchanged.
//
// Model: one Markdown line = one block element (a fenced code block or a table = one block for all its lines). Each
// block keeps its Markdown in el._md and its markers in data-* attributes (data-pre="## ", data-al, data-ck…), so
// Markdown -> DOM -> Markdown gives back the identical string (a line whose inline marks would not survive the trip
// is shown as literal text instead). Typing inside a block is serialized back from the DOM; Enter, Backspace at a
// block edge, paste, cut and cross-block deletes are Markdown line edits; the changed blocks re-render (that is how
// "# ", "- ", "1. ", "> ", "[] ", "---", "```", **x**, *x* and `x` autoformat as you type). Undo/redo is our own stack
// of Markdown edits (grouped by pauses), shifted through remote edits so it never reverts a teammate's text.
// Paste: HTML is converted to the supported Markdown subset (scripts, styles, handlers and other tags dropped) and
// only ever rendered through the escaping renderer below; no untrusted HTML reaches innerHTML.
// "View Markdown" (⋮ More) turns the surface off on this device: the plain textarea comes back.
(function () {
  'use strict';
  const COLS = ['ember', 'teal', 'indigo', 'amber', 'rose', 'green'];
  const CRE = COLS.join('|');
  const PREF = 'tribecode.doc.markdown';
  const esc = s => String(s).replace(/[&<>"'\r]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\r': '&#13;' }[c]));
  const isDesk = () => !matchMedia('(max-width: 820px)').matches;

  // ================= inline Markdown <-> tree =================
  // nodes: text{s} code{s} auto{s} b|i|s|u{c} mark{col,c} color{col,c} a{href,c}
  const RE_LINK = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
  const RE_MARK = new RegExp(`^==(?:\\{(${CRE})\\})?([^=]+?)==`);
  const RE_COLOR = new RegExp(`^\\{(${CRE})\\}([\\s\\S]+?)\\{\\/\\}`);
  const RE_AUTO = /^https?:\/\/[^\s<]+/;
  const WS = /\s/;
  function parseInline(s) {
    const out = []; let buf = '', i = 0, m, j;
    const push = n => { if (buf) { out.push({ t: 'text', s: buf }); buf = ''; } out.push(n); };
    while (i < s.length) {
      const ch = s[i], nx = s[i + 1];
      if (ch === '`' && (j = s.indexOf('`', i + 1)) > i + 1) { push({ t: 'code', s: s.slice(i + 1, j) }); i = j + 1; continue; }
      if (ch === '[' && (m = RE_LINK.exec(s.slice(i)))) { push({ t: 'a', href: m[2], c: parseInline(m[1]) }); i += m[0].length; continue; }
      if (ch === '*' && nx === '*' && (j = s.indexOf('**', i + 3)) > 0) { push({ t: 'b', c: parseInline(s.slice(i + 2, j)) }); i = j + 2; continue; }
      if (ch === '*' && nx !== undefined && nx !== '*' && s[i - 1] !== '*' && !WS.test(nx) && (j = s.indexOf('*', i + 1)) > 0) { push({ t: 'i', c: parseInline(s.slice(i + 1, j)) }); i = j + 1; continue; }
      if (ch === '~' && nx === '~' && (j = s.indexOf('~~', i + 3)) > 0) { push({ t: 's', c: parseInline(s.slice(i + 2, j)) }); i = j + 2; continue; }
      if (ch === '+' && nx === '+' && s[i + 2] !== undefined && !WS.test(s[i + 2])) {
        let k = s.indexOf('++', i + 3); while (k > 0 && WS.test(s[k - 1])) k = s.indexOf('++', k + 1);
        if (k > 0) { push({ t: 'u', c: parseInline(s.slice(i + 2, k)) }); i = k + 2; continue; }
      }
      if (ch === '=' && nx === '=' && (m = RE_MARK.exec(s.slice(i)))) { push({ t: 'mark', col: m[1] || '', c: parseInline(m[2]) }); i += m[0].length; continue; }
      if (ch === '{' && (m = RE_COLOR.exec(s.slice(i)))) { push({ t: 'color', col: m[1], c: parseInline(m[2]) }); i += m[0].length; continue; }
      if (ch === 'h' && (i === 0 || WS.test(s[i - 1])) && s.startsWith('http', i) && (m = RE_AUTO.exec(s.slice(i)))) { push({ t: 'auto', s: m[0] }); i += m[0].length; continue; }
      buf += ch; i++;
    }
    if (buf) out.push({ t: 'text', s: buf });
    return out;
  }
  const DL = { b: ['**', '**'], i: ['*', '*'], s: ['~~', '~~'], u: ['++', '++'] };
  function serTree(ns) {
    let o = '';
    for (const n of ns) {
      if (n.t === 'text' || n.t === 'auto') o += n.s;
      else if (n.t === 'code') o += '`' + n.s + '`';
      else if (n.t === 'mark') o += '==' + (n.col ? `{${n.col}}` : '') + serTree(n.c) + '==';
      else if (n.t === 'color') o += `{${n.col}}` + serTree(n.c) + '{/}';
      else if (n.t === 'a') o += '[' + serTree(n.c) + '](' + n.href + ')';
      else o += DL[n.t][0] + serTree(n.c) + DL[n.t][1];
    }
    return o;
  }
  // parse, but fall back to literal text when the round trip would not give the same Markdown back
  function inlineOf(s) { const t = parseInline(s); return serTree(t) === s ? t : (s ? [{ t: 'text', s }] : []); }
  const TAG = { b: 'strong', i: 'em', s: 'del', u: 'u' };
  const LINK = ' target="_blank" rel="noopener noreferrer"';
  function treeHtml(ns) {
    let o = '';
    for (const n of ns) {
      if (n.t === 'text') o += esc(n.s);
      else if (n.t === 'code') o += `<code>${esc(n.s)}</code>`;
      else if (n.t === 'auto') o += `<a href="${esc(n.s)}" data-auto="1"${LINK}>${esc(n.s)}</a>`;
      else if (n.t === 'mark') o += `<mark class="hl hl-${n.col || 'amber'}"${n.col ? ` data-c="${n.col}"` : ''}>${treeHtml(n.c)}</mark>`;
      else if (n.t === 'color') o += `<span class="tc tc-${n.col}" data-c="${n.col}">${treeHtml(n.c)}</span>`;
      else if (n.t === 'a') o += `<a href="${esc(n.href)}"${LINK}>${treeHtml(n.c)}</a>`;
      else o += `<${TAG[n.t]}>${treeHtml(n.c)}</${TAG[n.t]}>`;
    }
    return o;
  }
  const inlineHtml = s => treeHtml(inlineOf(s)) || '<br>';

  // ================= blocks =================
  const RE_H = /^(#{1,5})(\s+)([\s\S]*)$/, RE_HR = /^\s*(---|\*\*\*|___)\s*$/, RE_Q = /^(>\s?)([\s\S]*)$/;
  const RE_UL = /^(\s*)([-*])(\s)([\s\S]*)$/, RE_OL = /^(\s*)(\d+)([.)])(\s)([\s\S]*)$/, RE_TASK = /^\[([ xX])\](\s)([\s\S]*)$/;
  const RE_AL = /^\{(left|center|right|justify)\} ([\s\S]*)$/, RE_ROW = /^\|[\s\S]*\|\s*$/, RE_SEP = /^\|?\s*:?-{2,}/;
  const al = s => { const m = RE_AL.exec(s); return m ? { al: m[1], c: m[2] } : { al: '', c: s }; };
  function parseLine(l) {
    let m;
    if ((m = RE_H.exec(l))) return { k: m[1].length === 5 ? 'sub' : 'h', lv: m[1].length, pre: m[1] + m[2], ...al(m[3]) };
    if (RE_HR.test(l)) return { k: 'hr' };
    if ((m = RE_Q.exec(l))) return { k: 'q', pre: m[1], ...al(m[2]) };
    if ((m = RE_UL.exec(l))) {
      const t = RE_TASK.exec(m[4]);
      return t ? { k: 'todo', pre: m[1] + m[2] + m[3], ind: m[1], ck: t[1], sp2: t[2], c: t[3] } : { k: 'ul', pre: m[1] + m[2] + m[3], ind: m[1], c: m[4] };
    }
    if ((m = RE_OL.exec(l))) return { k: 'ol', pre: m[1] + m[2] + m[3] + m[4], ind: m[1], n: m[2] + m[3], c: m[5] };
    return { k: 'p', ...al(l) };
  }
  const row = l => { const m = /^\|([\s\S]*)\|(\s*)$/.exec(l); return { cells: m[1].split('|'), tail: m[2] }; };
  function parseBlocks(md) {
    const lines = String(md).split('\n'), out = [];
    for (let i = 0; i < lines.length;) {
      const l = lines[i];
      if (l.startsWith('```')) {
        let j = i + 1; while (j < lines.length && !lines[j].startsWith('```')) j++;
        const closed = j < lines.length, body = lines.slice(i + 1, j);
        out.push({ k: 'code', fence: l, close: closed ? lines[j] : null, nl0: !body.length, text: body.join('\n'), md: lines.slice(i, closed ? j + 1 : j).join('\n') });
        i = closed ? j + 1 : j; continue;
      }
      if (RE_ROW.test(l) && i + 1 < lines.length && RE_SEP.test(lines[i + 1])) {
        let j = i + 2; const body = [];
        while (j < lines.length && RE_ROW.test(lines[j])) body.push(row(lines[j++]));
        out.push({ k: 'table', head: row(l), sep: lines[i + 1], body, md: lines.slice(i, j).join('\n') });
        i = j; continue;
      }
      const d = parseLine(l); d.md = l; out.push(d); i++;
    }
    return out;
  }
  const alc = a => (a && a !== 'left' ? ` md-al-${a}` : ''), ald = a => (a ? ` data-al="${a}"` : '');
  const indent = ind => (ind ? ` style="--ind:${Math.min(8, Math.ceil(ind.replace(/\t/g, '  ').length / 2))}"` : '');
  function blockHtml(d) {
    switch (d.k) {
      case 'h': return `<h${d.lv} class="rt-b rt-h${alc(d.al)}" data-pre="${esc(d.pre)}"${ald(d.al)}>${inlineHtml(d.c)}</h${d.lv}>`;
      case 'sub': return `<p class="rt-b rt-sub md-sub${alc(d.al)}" data-pre="${esc(d.pre)}"${ald(d.al)}>${inlineHtml(d.c)}</p>`;
      case 'q': return `<blockquote class="rt-b rt-q${alc(d.al)}" data-pre="${esc(d.pre)}"${ald(d.al)}>${inlineHtml(d.c)}</blockquote>`;
      case 'ul': return `<div class="rt-b rt-li" data-pre="${esc(d.pre)}"${indent(d.ind)}>${inlineHtml(d.c)}</div>`;
      case 'ol': return `<div class="rt-b rt-ol" data-pre="${esc(d.pre)}" data-n="${esc(d.n)}"${indent(d.ind)}>${inlineHtml(d.c)}</div>`;
      case 'todo': return `<div class="rt-b rt-todo${d.ck !== ' ' ? ' done' : ''}" data-pre="${esc(d.pre)}" data-ck="${d.ck}" data-sp2="${esc(d.sp2)}"${indent(d.ind)}><span class="rt-cb" contenteditable="false" role="checkbox" aria-checked="${d.ck !== ' '}" aria-label="Done"></span>${inlineHtml(d.c)}</div>`;
      case 'hr': return `<div class="rt-b rt-hr" contenteditable="false" data-raw="${esc(d.md)}"><hr></div>`;
      case 'code': {
        let body = esc(d.text);
        if (d.text.startsWith('\n')) body = '\n' + body;            // the HTML parser eats one newline after <pre>
        if (!d.text || d.text.endsWith('\n')) body += '<br>';        // so the last (empty) line can hold the caret
        return `<pre class="rt-b rt-code" data-fence="${esc(d.fence)}"${d.close !== null ? ` data-close="${esc(d.close)}"` : ''}${d.nl0 ? ' data-nl0="1"' : ''} spellcheck="false">${body}</pre>`;
      }
      case 'table': {
        const tr = (r, tag) => `<tr${r.tail ? ` data-tail="${esc(r.tail)}"` : ''}>${r.cells.map(c => `<${tag}>${inlineHtml(c)}</${tag}>`).join('')}</tr>`;
        return `<div class="rt-b rt-table" data-sep="${esc(d.sep)}"><table><thead>${tr(d.head, 'th')}</thead><tbody>${d.body.map(r => tr(r, 'td')).join('')}</tbody></table></div>`;
      }
      default: return `<p class="rt-b rt-p${alc(d.al)}"${ald(d.al)}>${inlineHtml(d.c)}</p>`;
    }
  }
  const htmlMemo = new Map();
  function htmlOf(d) {
    let h = htmlMemo.get(d.md);
    if (h === undefined) { h = blockHtml(d); if (htmlMemo.size > 6000) htmlMemo.clear(); htmlMemo.set(d.md, h); }
    return h;
  }

  // ================= DOM -> Markdown =================
  const isCb = n => n.nodeType === 1 && n.classList.contains('rt-cb');
  const colOf = n => { const c = n.getAttribute && n.getAttribute('data-c'); return c && COLS.includes(c) ? c : ''; };
  function delims(n) {
    switch (n.tagName) {
      case 'STRONG': case 'B': return ['**', '**'];
      case 'EM': case 'I': return ['*', '*'];
      case 'DEL': case 'S': case 'STRIKE': return ['~~', '~~'];
      case 'U': case 'INS': return ['++', '++'];
      case 'CODE': return ['`', '`'];
      case 'MARK': return ['==' + (colOf(n) ? `{${colOf(n)}}` : ''), '=='];
      case 'SPAN': return colOf(n) ? [`{${colOf(n)}}`, '{/}'] : ['', ''];
      case 'A': { const h = n.getAttribute('href') || ''; return !n.getAttribute('data-auto') && /^https?:\/\/[^\s)]+$/.test(h) ? ['[', `](${h})`] : ['', '']; }
      default: return ['', ''];
    }
  }
  const atomic = n => n.tagName === 'CODE' || (n.tagName === 'A' && n.getAttribute('data-auto'));
  const plain = (s, code) => (code ? s.replace(/ /g, ' ') : s.replace(/ /g, ' ').replace(/\n/g, ' '));
  function serNode(n) {
    if (n.nodeType === 3) return plain(n.data);
    if (n.nodeType !== 1 || isCb(n) || n.tagName === 'BR') return '';
    if (n.tagName === 'CODE') { const t = plain(n.textContent).replace(/`/g, ''); return t ? '`' + t + '`' : ''; }
    if (n.tagName === 'A' && n.getAttribute('data-auto')) return plain(n.textContent);
    const inner = serKids(n); if (!inner) return '';
    const [o, c] = delims(n); return o + inner + c;
  }
  function serKids(n) { let o = ''; for (let c = n.firstChild; c; c = c.nextSibling) o += serNode(c); return o; }
  const kindOf = b => (b.classList.contains('rt-code') ? 'code' : b.classList.contains('rt-table') ? 'table' : b.classList.contains('rt-hr') ? 'hr' : 'text');
  function headMd(b) {
    const pre = b.getAttribute('data-pre') || '';
    if (b.classList.contains('rt-todo')) return pre + '[' + (b.getAttribute('data-ck') || ' ') + ']' + (b.getAttribute('data-sp2') ?? ' ');
    const a = b.getAttribute('data-al'); return pre + (a ? `{${a}} ` : '');
  }
  const codeText = b => plain(b.textContent, true);
  const cellMd = c => serKids(c).replace(/\|/g, '/');
  const rowMd = tr => '|' + [...tr.cells].map(cellMd).join('|') + '|' + (tr.getAttribute('data-tail') || '');
  function serBlock(b) {
    if (b.nodeType === 3) return plain(b.data);
    if (b.nodeType !== 1) return '';
    if (!b.classList.contains('rt-b')) {
      const kids = [...b.children].filter(c => /^(P|DIV|H[1-6]|PRE|BLOCKQUOTE|UL|OL|LI|TABLE)$/.test(c.tagName));
      return kids.length ? [...b.childNodes].map(serBlock).filter((s, i, a) => s || a.length === 1).join('\n') : serKids(b);
    }
    const k = kindOf(b);
    if (k === 'code') { const t = codeText(b), close = b.getAttribute('data-close'); return b.getAttribute('data-fence') + (b.hasAttribute('data-nl0') && !t ? '' : '\n' + t) + (close !== null ? '\n' + close : ''); }
    if (k === 'hr') return b.getAttribute('data-raw') || '---';
    if (k === 'table') { const rows = [...b.querySelectorAll('tr')]; if (!rows.length) return ''; return [rowMd(rows[0]), b.getAttribute('data-sep') || '| --- |', ...rows.slice(1).map(rowMd)].join('\n'); }
    return headMd(b) + serKids(b);
  }

  // ================= HTML (paste) -> Markdown, sanitized =================
  const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'DD', 'DT', 'DL', 'ADDRESS', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'CENTER', 'FORM', 'FIELDSET', 'DETAILS', 'SUMMARY']);
  function wrapMd(o, inner, c = o) { const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner); return m[2] ? m[1] + o + m[2] + c + m[3] : inner; }
  function inl(n) {
    if (n.nodeType === 3) return n.data.replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const t = n.tagName, kids = () => [...n.childNodes].map(inl).join('');
    const st = (n.getAttribute('style') || '').toLowerCase();
    switch (t) {
      case 'BR': return ' ';
      case 'IMG': return (n.getAttribute('alt') || '').replace(/\s+/g, ' ');
      case 'STRONG': case 'B': return /font-weight:\s*(normal|[1-4]00)/.test(st) ? kids() : wrapMd('**', kids());
      case 'EM': case 'I': case 'CITE': return wrapMd('*', kids());
      case 'U': case 'INS': return wrapMd('++', kids());
      case 'S': case 'DEL': case 'STRIKE': return wrapMd('~~', kids());
      case 'MARK': return wrapMd('==', kids().replace(/=/g, ''));
      case 'CODE': case 'KBD': case 'SAMP': case 'TT': { const x = n.textContent.replace(/[`\n]/g, ' '); return x.trim() ? '`' + x + '`' : x; }
      case 'A': { const h = (n.getAttribute('href') || '').trim(), x = kids(); return /^https?:\/\//i.test(h) && x.trim() ? wrapMd('[', x, '](' + h.replace(/[\s()]/g, c => encodeURIComponent(c)) + ')') : x; }
      default: {
        let x = kids();
        if (/font-weight:\s*(bold|[6-9]00)/.test(st)) x = wrapMd('**', x);
        if (/font-style:\s*italic/.test(st)) x = wrapMd('*', x);
        if (/text-decoration[^;]*underline/.test(st)) x = wrapMd('++', x);
        if (/text-decoration[^;]*line-through/.test(st)) x = wrapMd('~~', x);
        return x;
      }
    }
  }
  function conv(root) {
    const out = []; let buf = '';
    const end = () => { const t = buf.replace(/[ \t]+/g, ' ').trim(); if (t) out.push(t); buf = ''; };
    for (const n of root.childNodes) {
      if (n.nodeType === 3) { buf += n.data.replace(/\s+/g, ' '); continue; }
      if (n.nodeType !== 1) continue;
      const t = n.tagName;
      if (n.classList.contains('rt-b')) { end(); out.push(...serBlock(n).split('\n')); continue; }   // copied from this editor
      if (t === 'BR') { end(); continue; }
      if (!BLOCKS.has(t)) { buf += inl(n); continue; }
      end();
      if (/^H[1-6]$/.test(t)) { const x = conv(n).join(' '); if (x) out.push('#'.repeat(Math.min(4, +t[1])) + ' ' + x); }
      else if (t === 'HR') out.push('---');
      else if (t === 'PRE') out.push('```', ...n.textContent.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => (l.startsWith('```') ? ' ' + l : l)), '```');
      else if (t === 'BLOCKQUOTE') out.push(...conv(n).map(l => '> ' + l));
      else if (t === 'UL' || t === 'OL') {
        let k = +(n.getAttribute('start') || 1);
        for (const li of n.children) {
          if (li.tagName !== 'LI') { out.push(...conv(li)); continue; }
          const cb = li.querySelector('input[type=checkbox]');
          const pre = t === 'OL' ? `${k++}. ` : cb ? `- [${cb.checked || cb.hasAttribute('checked') ? 'x' : ' '}] ` : '- ';
          const ls = conv(li); out.push(pre + (ls[0] || ''), ...ls.slice(1).map(l => '  ' + l));
        }
      } else if (t === 'LI') { const ls = conv(n); out.push('- ' + (ls[0] || ''), ...ls.slice(1).map(l => '  ' + l)); }
      else if (t === 'TABLE') {
        const rows = [...n.querySelectorAll('tr')].map(tr => [...tr.children].filter(c => /^T[DH]$/.test(c.tagName)).map(c => inl(c).replace(/\|/g, '/').replace(/\s+/g, ' ').trim()));
        rows.filter(r => r.length).forEach((r, i) => { out.push('| ' + r.join(' | ') + ' |'); if (i === 0) out.push('| ' + r.map(() => '---').join(' | ') + ' |'); });
      } else out.push(...conv(n));
    }
    end();
    return out;
  }
  function htmlToMd(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');   // inert: no scripts run, nothing loads
    doc.querySelectorAll('script,style,noscript,template,iframe,frame,object,embed,svg,math,head,meta,link,title,button,select,textarea,video,audio,canvas,input:not([type=checkbox])').forEach(n => n.remove());
    return conv(doc.body || doc.documentElement).join('\n').replace(/^\n+|\n+$/g, '');
  }

  // ================= the editor =================
  const live = new Set();
  const P = HTMLElement.prototype;
  function lineSpan(a, b) {                         // the changed span between two strings
    let s = 0; const max = Math.min(a.length, b.length);
    while (s < max && a.charCodeAt(s) === b.charCodeAt(s)) s++;
    let ea = a.length, eb = b.length;
    while (ea > s && eb > s && a.charCodeAt(ea - 1) === b.charCodeAt(eb - 1)) { ea--; eb--; }
    return [s, ea, eb];
  }

  class Rich {
    constructor(ta) {
      const el = this.el = document.createElement('div');
      for (const a of ['id', 'class', 'aria-label', 'spellcheck']) if (ta.hasAttribute(a)) el.setAttribute(a, ta.getAttribute(a));
      el.classList.add('rt', 'md');
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('role', 'textbox'); el.setAttribute('aria-multiline', 'true');
      el.setAttribute('autocapitalize', 'sentences');
      el.setAttribute('data-ph', ta.getAttribute('placeholder') || '');
      el._rt = this;
      this.md = ta.value; this.sel = { s: 0, e: 0, dir: 'none' }; this.composing = false; this.stale = false;
      this.undos = []; this.redos = []; this.lastSel = this.sel; this.selKey = '';
      this.api();
      this.render();
      this.mo = new MutationObserver(() => {});
      this.mo.observe(el, { childList: true, characterData: true, subtree: true });
      this.events();
      ta.replaceWith(el);
      live.add(this);
    }

    // ---------- the textarea-compatible surface ----------
    api() {
      const el = this.el, me = this;
      const def = (k, get, set) => Object.defineProperty(el, k, { configurable: true, get, set });
      def('value', () => me.md, v => me.setValue(v));
      def('selectionStart', () => me.cur().s, v => { const c = me.cur(); me.setSel(+v, Math.max(+v, c.e)); });
      def('selectionEnd', () => me.cur().e, v => { const c = me.cur(); me.setSel(Math.min(c.s, +v), +v); });
      def('selectionDirection', () => me.cur().dir, v => { const c = me.cur(); me.setSel(c.s, c.e, v); });
      def('textLength', () => me.md.length);
      el.setSelectionRange = (a, b, dir) => me.setSel(+a, b === undefined ? +a : +b, dir);
      el.select = () => me.setSel(0, me.md.length);
      el.setRangeText = (text, start, end, mode) => me.rangeText(String(text), start, end, mode);
      el.focus = o => { const was = me.focused(); P.focus.call(el, o); if (!was && me.focused()) me.place(); };
      el.rtEdit = (from, to, text, a, b) => me.edit(from, to, text, a, b);
      el.rtUndo = () => me.undo(); el.rtRedo = () => me.redo();
      el.rtMeasure = ps => me.measure(ps);
      el.rtCaretY = pos => { const r = me.caretRect(pos); return r ? r.top - el.getBoundingClientRect().top : 0; };
    }
    focused() { const a = document.activeElement; return !!a && (a === this.el || this.el.contains(a)); }
    cur() {
      if (this.focused() && !this.stale) { const d = this.domSel(); if (d) this.sel = d; }
      return this.sel;
    }
    clamp(x) { return Math.max(0, Math.min(this.md.length, x | 0)); }
    setSel(a, b, dir) {
      a = this.clamp(a); b = this.clamp(b); if (b < a) [a, b] = [b, a];
      this.sel = { s: a, e: b, dir: dir || (a === b ? 'none' : 'forward') };
      if (this.focused()) this.place(); else this.stale = true;
    }
    place() {
      const { s, e, dir } = this.sel, pa = this.pointAt(s), pb = e === s ? pa : this.pointAt(e);
      this.stale = false;
      if (!pa || !pb) return;
      try {
        const sel = getSelection();
        if (dir === 'backward') sel.setBaseAndExtent(pb[0], pb[1], pa[0], pa[1]); else sel.setBaseAndExtent(pa[0], pa[1], pb[0], pb[1]);
      } catch {}
      this.selKey = `${s}:${e}`;
    }
    setValue(v) {
      v = String(v ?? '');
      if (v === this.md) return;
      this.syncNative(false);
      this.shift(this.md, v);
      this.md = v; this.render();
      this.sel = { s: v.length, e: v.length, dir: 'none' }; this.stale = true;
      queueMicrotask(() => { if (this.stale && this.focused()) this.place(); });
    }
    rangeText(text, start, end, mode = 'preserve') {
      this.syncNative(false);
      const c = this.cur(); this.lastSel = c; this.lastTyped = '';
      const st = this.clamp(start ?? c.s), en = Math.max(st, this.clamp(end ?? c.e));
      const md = this.md.slice(0, st) + text + this.md.slice(en), d = text.length - (en - st);
      let a, b;
      if (mode === 'select') { a = st; b = st + text.length; }
      else if (mode === 'start') a = b = st;
      else if (mode === 'end') a = b = st + text.length;
      else { const f = x => (x <= st ? x : x >= en ? x + d : st); a = f(c.s); b = f(c.e); }
      this.commit(md, a, b, 'cmd', false);
    }
    edit(from, to, text, a, b) {
      if (!this.focused()) this.el.focus({ preventScroll: true });
      this.syncNative(false); this.lastSel = this.cur(); this.lastTyped = '';
      const st = this.clamp(from), en = Math.max(st, this.clamp(to));
      const md = this.md.slice(0, st) + text + this.md.slice(en);
      if (a === undefined) a = st + text.length;
      this.commit(md, a, b === undefined ? a : b, 'cmd', true);
    }

    // ---------- render (only the blocks that changed) ----------
    render(dirty) {
      const el = this.el, descs = parseBlocks(this.md);
      for (let n = el.firstChild; n;) { const nx = n.nextSibling; if (n.nodeType !== 1 || n._md === undefined) n.remove(); n = nx; }   // stray nodes: re-rendered below
      const kids = el.children, K = kids.length, D = descs.length, bad = new Set();
      if (dirty) for (const k of dirty) if (k.parentNode === el && k.outerHTML !== canon(k._md)) bad.add(k);
      let p = 0; while (p < K && p < D && kids[p]._md === descs[p].md && !bad.has(kids[p])) p++;
      let s = 0; while (s < K - p && s < D - p && kids[K - 1 - s]._md === descs[D - 1 - s].md && !bad.has(kids[K - 1 - s])) s++;
      let changed = false;
      if (p < K - s || p < D - s) {
        const ref = kids[K - s] || null;
        for (let i = K - s - 1; i >= p; i--) kids[i].remove();
        const tpl = document.createElement('template');
        tpl.innerHTML = descs.slice(p, D - s).map(htmlOf).join('');
        [...tpl.content.children].forEach((n, i) => { n._md = descs[p + i].md; });
        el.insertBefore(tpl.content, ref);
        changed = true;
      }
      if (this.mo) this.mo.takeRecords();
      el.classList.toggle('rt-empty', this.md === '');
      return changed;
    }

    // ---------- offsets: DOM point <-> Markdown ----------
    blockOf(node) {
      if (!node || node === this.el) return null;
      let n = node; while (n && n.parentNode !== this.el) n = n.parentNode;
      return n && n.nodeType === 1 ? n : null;
    }
    start(b) { let s = 0; for (let k = this.el.firstElementChild; k && k !== b; k = k.nextElementSibling) s += (k._md ?? '').length + 1; return s; }
    // { b, lo }: the block and the Markdown offset inside it (end: the point ends a range)
    locate(node, off, end) {
      const el = this.el;
      if (node === el) {
        const kids = el.children; if (!kids.length) return null;
        if (end && off > 0) { const b = kids[Math.min(off, kids.length) - 1]; return { b, lo: b._md.length }; }
        const b = kids[Math.min(off, kids.length - 1)]; return { b, lo: off >= kids.length ? b._md.length : kindOf(b) === 'text' ? headMd(b).length : 0 };
      }
      const b = this.blockOf(node); if (!b || b._md === undefined) return null;
      return { b, lo: localOf(b, node, off) };
    }
    mdAt(node, off, end) { const L = this.locate(node, off, end); return L ? this.start(L.b) + L.lo : 0; }
    domSel() {
      const sel = getSelection(); if (!sel || !sel.rangeCount) return null;
      if (!this.el.contains(sel.anchorNode) || !this.el.contains(sel.focusNode)) return null;
      const r = sel.getRangeAt(0), a = this.mdAt(r.startContainer, r.startOffset), b = r.collapsed ? a : this.mdAt(r.endContainer, r.endOffset, true);
      const back = sel.anchorNode === r.endContainer && sel.anchorOffset === r.endOffset && !r.collapsed;
      return { s: Math.min(a, b), e: Math.max(a, b), dir: a === b ? 'none' : back ? 'backward' : 'forward' };
    }
    pointAt(off) {
      const kids = this.el.children; if (!kids.length) return [this.el, 0];
      let s = 0;
      for (let i = 0; i < kids.length; i++) {
        const b = kids[i], L = (b._md ?? '').length;
        if (off <= s + L || i === kids.length - 1) {
          const p = pointIn(b, Math.min(off - s, L));
          if (p) return p;
          const nb = kids[i + 1] || kids[i - 1];          // a divider has no caret position: the next (or previous) block
          return nb ? (kids[i + 1] ? pointIn(nb, kindOf(nb) === 'text' ? headMd(nb).length : 0) : pointIn(nb, nb._md.length)) || [this.el, i] : [this.el, i];
        }
        s += L + 1;
      }
      return [this.el, kids.length];
    }
    caretRect(off) {
      const p = this.pointAt(this.clamp(off)); if (!p) return null;
      try {
        const r = document.createRange(); r.setStart(p[0], p[1]); r.collapse(true);
        const rs = r.getClientRects(); if (rs.length && (rs[0].height || rs[0].width)) return rs[0];
      } catch {}
      const b = p[0] === this.el ? this.el.children[p[1]] || this.el.lastElementChild : this.blockOf(p[0]) || this.el;
      if (!b) return this.el.getBoundingClientRect();
      const br = b.getBoundingClientRect(), cs = getComputedStyle(b), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
      return { left: br.left + (parseFloat(cs.paddingLeft) || 0), top: br.top + (parseFloat(cs.paddingTop) || 0), height: lh, bottom: br.top + lh, width: 0 };
    }
    // the remote-caret layer and slash menus position against the editor's offsetParent (like coedit's mirror div)
    measure(ps) {
      const op = this.el.offsetParent || document.body, or = op.getBoundingClientRect();
      return ps.map(p => { const r = this.caretRect(p); return r && { x: r.left - or.left - op.clientLeft + op.scrollLeft, y: r.top - or.top - op.clientTop + op.scrollTop, h: r.height }; });
    }

    // ---------- committing changes ----------
    // Native typing changed some blocks: serialize them back to Markdown.
    syncNative(doRender, kind = 'type') {
      const recs = this.mo.takeRecords(); if (!recs.length) return false;
      const el = this.el, dirty = new Set(); let top = false;
      for (const r of recs) { if (r.target === el) top = true; else { const b = this.blockOf(r.target); if (b) dirty.add(b); } }
      if (top) {                                               // a bare text node or a browser-made element at the top: put it in a paragraph
        let wrap = null;
        for (let n = el.firstChild; n;) {
          const nx = n.nextSibling;
          if (n.nodeType === 1 && n.classList.contains('rt-b') && n._md !== undefined) wrap = null;
          else if (n.nodeType === 1 && n.tagName === 'BR') n.remove();
          else if (n.nodeType !== 1 && n.nodeType !== 3) n.remove();
          else {
            if (!wrap) { wrap = document.createElement('p'); wrap.className = 'rt-b rt-p rt-stray'; el.insertBefore(wrap, n); dirty.add(wrap); }
            wrap.appendChild(n);
          }
          n = nx;
        }
      }
      for (const b of dirty) if (b.parentNode === el) b._md = serBlock(b);
      const caret = this.domSel() || this.sel;
      const md = [...el.children].map(k => k._md ?? '').join('\n');
      if (md !== this.md) { this.record(this.md, md, this.lastSel, caret, kind); this.md = md; }
      if (doRender && !this.composing && this.render(dirty)) { this.sel = caret; if (this.focused()) this.place(); }
      else this.sel = caret;
      return true;
    }
    commit(md, a, b, kind, fire) {
      const old = this.md, before = this.lastSel;
      if (md !== old) { this.record(old, md, before, { s: a, e: b }, kind); this.md = md; this.render(); }
      this.setSel(a, b);
      this.lastSel = this.sel;
      if (fire && md !== old) this.fire();
      this.visible();
    }
    fire() { this.el.dispatchEvent(new Event('input', { bubbles: true })); }
    replaceBlocks(b1, b2, text, caret, kind = 'cmd') {
      const s = this.start(b1), e = this.start(b2) + b2._md.length;
      this.commit(this.md.slice(0, s) + text + this.md.slice(e), caret, caret, kind, true);
    }

    // ---------- undo / redo (Markdown edits, shifted through remote changes) ----------
    record(old, md, selBefore, selAfter, kind) {
      const [s, eo, en] = lineSpan(old, md), now = Date.now();
      const e = { pos: s, del: old.slice(s, eo), ins: md.slice(s, en), sb: [selBefore.s, selBefore.e], sa: [selAfter.s, selAfter.e], kind, t: now };
      const last = this.undos[this.undos.length - 1];
      if (kind === 'type' && last && last.kind === 'type' && now - last.t < 1000 && s <= last.pos + last.ins.length && s + e.del.length >= last.pos) {
        const lo = Math.min(last.pos, s), hi1 = Math.max(last.pos + last.ins.length, s + e.del.length);   // merge in old-md coordinates
        last.del = old.slice(lo, last.pos) + last.del + old.slice(last.pos + last.ins.length, hi1);
        last.ins = md.slice(lo, hi1 + (e.ins.length - e.del.length));
        last.pos = lo; last.sa = e.sa; last.t = now;
      } else { this.undos.push(e); if (this.undos.length > 400) this.undos.shift(); }
      this.redos = [];
    }
    shift(old, md) {
      const [s, eo, en] = lineSpan(old, md), d = en - eo;
      const mv = x => (x >= eo ? x + d : x);
      for (const st of [this.undos, this.redos]) {
        for (let i = st.length - 1; i >= 0; i--) {
          const e = st[i];
          if (eo <= e.pos) e.pos += d; else if (s >= e.pos + e.ins.length) { /* after it: unchanged */ } else { st.splice(i, 1); continue; }
          e.sb = e.sb.map(mv); e.sa = e.sa.map(mv);
        }
      }
    }
    step(from, to, back) {
      this.syncNative(false);
      for (;;) {
        const e = from.pop(); if (!e) return;
        const have = back ? e.ins : e.del, put = back ? e.del : e.ins;
        if (this.md.slice(e.pos, e.pos + have.length) !== have) continue;
        to.push(e);
        this.md = this.md.slice(0, e.pos) + put + this.md.slice(e.pos + have.length);
        this.render();
        const [a, b] = back ? e.sb : e.sa; this.setSel(a, b); this.lastSel = this.sel;
        this.fire(); this.visible();
        return;
      }
    }
    undo() { this.step(this.undos, this.redos, true); }
    redo() { this.step(this.redos, this.undos, false); }

    // ---------- events ----------
    events() {
      const el = this.el;
      el.addEventListener('beforeinput', e => this.beforeInput(e));
      el.addEventListener('input', e => { if (e.isTrusted) { this.syncNative(!this.composing); } }, true);   // before the host's own input handlers
      el.addEventListener('keydown', e => this.keydown(e), true);
      el.addEventListener('compositionstart', () => { this.composing = true; this.lastSel = this.cur(); });
      el.addEventListener('compositionend', () => { this.composing = false; setTimeout(() => { if (!this.composing) { this.syncNative(true); } }, 0); });
      el.addEventListener('blur', () => { setTimeout(() => { if (!this.focused()) el.style.paddingBottom = ''; }, 200); });
      el.addEventListener('paste', e => this.paste(e));
      el.addEventListener('copy', e => this.copy(e, false));
      el.addEventListener('cut', e => this.copy(e, true));
      el.addEventListener('drop', e => { if (!e.defaultPrevented && !(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length)) e.preventDefault(); });
      el.addEventListener('dragstart', e => e.preventDefault());
      // checkboxes: toggle without moving the caret or opening the keyboard
      el.addEventListener('mousedown', e => { if (isCb(e.target)) e.preventDefault(); });
      el.addEventListener('click', e => {
        if (isCb(e.target)) { e.preventDefault(); this.toggle(e.target.parentNode); return; }
        const a = e.target.closest && e.target.closest('a[href]');
        if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
      });
      el.addEventListener('touchstart', e => { if (isCb(e.target)) e.preventDefault(); }, { passive: false });
      el.addEventListener('touchend', e => { if (isCb(e.target)) { e.preventDefault(); this.toggle(e.target.parentNode); } }, { passive: false });
    }
    toggle(b) {
      if (!b || b.parentNode !== this.el || !b.classList.contains('rt-todo')) return;
      this.syncNative(false);
      const at = this.start(b) + (b.getAttribute('data-pre') || '').length + 1, ck = this.md[at] === ' ' ? 'x' : ' ';
      const keep = this.focused() ? this.cur() : this.sel;
      this.lastSel = keep;
      const md = this.md.slice(0, at) + ck + this.md.slice(at + 1);
      this.record(this.md, md, keep, keep, 'cmd'); this.md = md; this.render();
      if (this.focused()) { this.sel = keep; this.place(); }
      this.fire();
    }
    keydown(e) {
      if (e.isComposing || e.keyCode === 229) return;
      const k = e.key, mod = e.ctrlKey || e.metaKey;
      if (document.querySelector('.slash:not(.hidden)') && ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(k)) return;   // a slash / [[ / @ menu is open: the host handles it
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (mod && !e.altKey && (k.toLowerCase() === 'z' || k.toLowerCase() === 'y')) { stop(); if (k.toLowerCase() === 'y' || e.shiftKey) this.redo(); else this.undo(); return; }
      if (k === 'Enter' && !mod && !e.altKey) { stop(); this.enter(e.shiftKey); return; }
      if (k === 'Tab' && !mod && !e.altKey) { stop(); this.tab(e.shiftKey); return; }
      this.lastSel = this.cur();
    }
    beforeInput(e) {
      const t = e.inputType;
      if (this.composing || e.isComposing) return;   // IME text: native, serialized on compositionend
      this.syncNative(false);
      this.lastSel = this.cur();
      if (t === 'insertText' || t === 'insertReplacementText' && e.data) { e.preventDefault(); this.typeText(e.data ?? (e.dataTransfer && e.dataTransfer.getData('text/plain')) ?? ''); return; }
      if (t === 'insertReplacementText') return;   // spellcheck / autocorrect with a DataTransfer: native, serialized after
      if (t === 'insertParagraph' || t === 'insertLineBreak') { e.preventDefault(); this.enter(t === 'insertLineBreak'); return; }
      if (t.startsWith('delete')) { e.preventDefault(); this.del(e); return; }
      if (t === 'historyUndo') { e.preventDefault(); this.undo(); return; }
      if (t === 'historyRedo') { e.preventDefault(); this.redo(); return; }
      if (t.startsWith('format')) {
        e.preventDefault();
        const op = { formatBold: 'bold', formatItalic: 'italic', formatUnderline: 'underline', formatStrikeThrough: 'strike' }[t];
        if (op && window.TribeDocLayout) window.TribeDocLayout.run(op, this.el);
        return;
      }
      if (t.startsWith('insertFrom') || t === 'insertOrderedList' || t === 'insertUnorderedList' || t === 'insertHorizontalRule' || t === 'insertLink') e.preventDefault();
    }

    // ---------- typing ----------
    range() { const s = getSelection(); return s && s.rangeCount && this.el.contains(s.anchorNode) ? s.getRangeAt(0) : null; }
    typeText(text) {
      if (!text) return;
      this.lastTyped = text.slice(-1);
      let r = this.range(); if (!r) return;
      const A = this.locate(r.startContainer, r.startOffset), Z = r.collapsed ? A : this.locate(r.endContainer, r.endOffset, true);
      if (!A || !Z) return;
      if (A.b !== Z.b || (kindOf(A.b) === 'table' && cellOf(r.startContainer) !== cellOf(r.endContainer))) return this.replaceRange(text);
      const k = kindOf(A.b); if (k === 'hr') return;
      if (k === 'table') { if (!cellOf(r.startContainer)) return; text = text.replace(/\|/g, '/'); }
      if (k !== 'code') text = text.replace(/\r?\n/g, ' ');
      if (!r.collapsed) { r = this.clampRange(A.b, this.inner(r, A, Z)); r.deleteContents(); }
      let [n, o] = k === 'text' ? normPoint(A.b, r.startContainer, r.startOffset) : [r.startContainer, r.startOffset];
      if (n.nodeType === 3) { n.insertData(o, text); o += text.length; }
      else {
        const prev = n.childNodes[o - 1], next = n.childNodes[o];
        if (prev && prev.nodeType === 3) { o = prev.length; n = prev; n.appendData(text); o += text.length; }
        else if (next && next.nodeType === 3) { n = next; n.insertData(0, text); o = text.length; }
        else { const t = document.createTextNode(text); n.insertBefore(t, next || null); n = t; o = text.length; if (next && next.tagName === 'BR' && !next.nextSibling) next.remove(); }
      }
      if (n.nodeType === 3) { const sib = n.nextSibling; if (sib && sib.tagName === 'BR' && !sib.nextSibling && n.parentNode.lastChild === sib && serKids(n.parentNode)) sib.remove(); }
      try { getSelection().setBaseAndExtent(n, o, n, o); } catch {}
      this.afterManual('type');
    }
    inner(r, A, Z) {   // a range whose ends sit at the editor's top level -> the same range inside the blocks
      const ok = (b, n) => b.contains(n);
      if (ok(A.b, r.startContainer) && ok(Z.b, r.endContainer)) return r;
      const pa = ok(A.b, r.startContainer) ? [r.startContainer, r.startOffset] : pointIn(A.b, A.lo), pz = ok(Z.b, r.endContainer) ? [r.endContainer, r.endOffset] : pointIn(Z.b, Z.lo);
      if (!pa || !pz) return r;
      const nr = document.createRange(); nr.setStart(pa[0], pa[1]); nr.setEnd(pz[0], pz[1]); return nr;
    }
    clampRange(b, r) {   // never delete the checkbox
      const cb = b.querySelector(':scope > .rt-cb');
      if (cb && (r.startContainer === b && r.startOffset <= [...b.childNodes].indexOf(cb))) r.setStart(b, [...b.childNodes].indexOf(cb) + 1);
      return r;
    }
    afterManual(kind) {
      const old = this.md;
      this.syncNative(true, kind);
      this.autoformat();
      this.lastSel = this.sel;
      if (this.md !== old) this.fire();
      this.visible();
    }
    // Typed shortcuts the Markdown parser does not turn into blocks by itself: "[] " -> checklist, "```" -> a closed
    // code block, "---" -> a divider with a fresh line under it.
    autoformat() {
      const { s, e } = this.sel, t = this.lastTyped; if (s !== e || !t) return;
      const md = this.md, ls = md.lastIndexOf('\n', s - 1) + 1; let le = md.indexOf('\n', s); if (le < 0) le = md.length;
      if (s !== le) return;
      const line = md.slice(ls, le); let m;
      const inFence = () => { let n = 0; for (const l of md.slice(0, ls).split('\n')) if (l.startsWith('```')) n++; return n % 2 === 1; };
      if (t === ' ' && (m = /^(\s*)\[( |x)?\] $/.exec(line))) { const nl = `${m[1]}- [${m[2] === 'x' ? 'x' : ' '}] `; return this.commit(md.slice(0, ls) + nl + md.slice(le), ls + nl.length, ls + nl.length, 'cmd', true); }
      if (t === '`' && /^```[\w+-]*$/.test(line) && !inFence()) return this.commit(md.slice(0, le) + '\n\n```' + md.slice(le), le + 1, le + 1, 'cmd', true);
      if ('-*_'.includes(t) && /^(---|\*\*\*|___)$/.test(line) && !inFence()) return this.commit(md.slice(0, le) + '\n' + md.slice(le), le + 1, le + 1, 'cmd', true);
    }

    // ---------- Enter / Tab / delete ----------
    enter(soft) {
      this.syncNative(false);
      let r = this.range(); if (!r) return;
      if (!r.collapsed) { this.replaceRange(''); r = this.range(); if (!r) return; }
      const L = this.locate(r.startContainer, r.startOffset); if (!L) return;
      const { b } = L, k = kindOf(b), S = this.start(b);
      if (k === 'code') {
        const H = codeHead(b), t = codeText(b), at = Math.max(0, L.lo - H);
        if (!soft && at === t.length && t.endsWith('\n')) {            // Enter on an empty last line leaves the block
          const blk = b.getAttribute('data-fence') + '\n' + t.slice(0, -1) + '\n' + (b.getAttribute('data-close') ?? '```');
          return this.replaceBlocks(b, b, blk + '\n', S + blk.length + 1);
        }
        const x = S + H + at; return this.commit(this.md.slice(0, x) + '\n' + this.md.slice(x), x + 1, x + 1, 'cmd', true);
      }
      if (k === 'table') return this.tableMove(b, cellOf(r.startContainer), 'down');
      if (k === 'hr') return;
      const H = headMd(b), C = b._md.slice(H.length), p = pointIn(b, L.lo);
      const left = frag(b, contentStart(b), p), right = frag(b, p, [b, b.childNodes.length]);
      const kind = blockKind(b);
      if (['ul', 'ol', 'todo', 'q'].includes(kind) && !C && !soft) return this.replaceBlocks(b, b, '', S);   // Enter on an empty item ends the list
      if (kind === 'h' || kind === 'sub') {
        if (!right) return this.replaceBlocks(b, b, H + left + '\n', S + H.length + left.length + 1);
        if (!left) return this.replaceBlocks(b, b, '\n' + H + right, S + 1 + H.length);
        return this.replaceBlocks(b, b, H + left + '\n' + H + right, S + H.length + left.length + 1 + H.length);
      }
      const cont = soft ? '' : contHead(b, kind);
      this.replaceBlocks(b, b, H + left + '\n' + cont + right, S + H.length + left.length + 1 + cont.length);
    }
    tab(back) {
      this.syncNative(false);
      const r = this.range(); if (!r) return;
      const L = this.locate(r.startContainer, r.startOffset); if (!L) return;
      const k = kindOf(L.b);
      if (k === 'table') return this.tableMove(L.b, cellOf(r.startContainer), back ? 'prev' : 'next');
      if (k === 'text' && ['ul', 'ol', 'todo'].includes(blockKind(L.b)) && window.TribeDocLayout) { window.TribeDocLayout.run(back ? 'outdent' : 'indent', this.el); return; }
      if (back) return;
      const a = this.start(L.b) + L.lo; this.commit(this.md.slice(0, a) + '  ' + this.md.slice(a), a + 2, a + 2, 'cmd', true);
    }
    tableMove(b, cell, dir) {
      const rows = [...b.querySelectorAll('tr')]; if (!cell) return;
      const tr = cell.parentNode, ri = rows.indexOf(tr), ci = [...tr.cells].indexOf(cell);
      const go = (r, c) => { const tc = rows[r] && rows[r].cells[c]; if (!tc) return false; const p = findIn(tc, cellMd(tc).startsWith(' ') ? 1 : 0); try { getSelection().setBaseAndExtent(p[0], p[1], p[0], p[1]); } catch {} this.sel = this.domSel() || this.sel; return true; };
      if (dir === 'next' && (go(ri, ci + 1) || go(ri + 1, 0))) return;
      if (dir === 'prev') { if (!go(ri, ci - 1) && ri > 0) go(ri - 1, rows[ri - 1].cells.length - 1); return; }
      if (dir === 'down' && go(ri + 1, ci)) return;
      const n = tr.cells.length, line = '|' + Array(n).fill('  ').join('|') + '|', S = this.start(b);
      const want = dir === 'down' ? ci : 0;
      this.replaceBlocks(b, b, b._md + '\n' + line, S + b._md.length + 1 + 1 + want * 3 + 1);
    }
    del(e) {
      const t = e.inputType, back = t.includes('Backward') || t === 'deleteByCut' || t === 'deleteContent' || t === 'deleteByDrag';
      let r = this.range(); if (!r) return;
      if (!r.collapsed) return this.deleteRange(r);
      const L = this.locate(r.startContainer, r.startOffset); if (!L) return;
      const { b } = L, k = kindOf(b);
      if (k === 'text') {
        const H = headMd(b).length, c = L.lo - H, n = b._md.length - H;
        if (back && c <= 0) return this.backAtStart(b);
        if (!back && c >= n) return this.delAtEnd(b);
      } else if (k === 'code') {
        const t = Math.max(0, L.lo - codeHead(b)), len = codeText(b).length;
        if (back && t === 0) { if (!len) this.replaceBlocks(b, b, '', this.start(b)); return; }
        if (!back && t >= len) return;
      } else if (k === 'table') {
        const cell = cellOf(r.startContainer); if (!cell) return;
        const at = inlineOffset(cell, r.startContainer, r.startOffset), len = cellMd(cell).length;
        if ((back && at === 0) || (!back && at >= len)) return;
      } else return;
      // the browser knows the extent (a character, a grapheme, a word, the line)
      const tr = e.getTargetRanges && e.getTargetRanges()[0];
      const rr = document.createRange();
      if (tr) { rr.setStart(tr.startContainer, tr.startOffset); rr.setEnd(tr.endContainer, tr.endOffset); }
      else { const sel = getSelection(); sel.modify('extend', back ? 'backward' : 'forward', 'character'); if (!sel.rangeCount) return; const x = sel.getRangeAt(0); rr.setStart(x.startContainer, x.startOffset); rr.setEnd(x.endContainer, x.endOffset); }
      if (rr.collapsed) return;
      const A = this.locate(rr.startContainer, rr.startOffset), Z = this.locate(rr.endContainer, rr.endOffset, true);
      if (!A || !Z || A.b !== b || Z.b !== b || (k === 'table' && cellOf(rr.startContainer) !== cellOf(rr.endContainer))) return this.deleteRange(rr);
      this.deleteRange(rr);
    }
    deleteRange(r) {
      const A = this.locate(r.startContainer, r.startOffset), Z = this.locate(r.endContainer, r.endOffset, true);
      if (!A || !Z) return;
      const sameCell = kindOf(A.b) !== 'table' || cellOf(r.startContainer) === cellOf(r.endContainer);
      if (A.b === Z.b && kindOf(A.b) !== 'hr' && sameCell) {
        r = this.inner(r, A, Z);
        if (kindOf(A.b) === 'text') this.clampRange(A.b, r);
        r.deleteContents();
        const p = [r.startContainer, r.startOffset];
        try { getSelection().setBaseAndExtent(p[0], p[1], p[0], p[1]); } catch {}
        return this.afterManual('type');
      }
      this.replaceRange('', r);
    }
    // Replace the selection (or range r) with Markdown text, across blocks.
    replaceRange(text, r) {
      r = r || this.range(); if (!r) return;
      const A = this.locate(r.startContainer, r.startOffset), Z = this.locate(r.endContainer, r.endOffset, true);
      if (!A || !Z) return;
      const sA = this.start(A.b), sZ = A.b === Z.b ? sA : this.start(Z.b);
      if (kindOf(A.b) !== 'text' || kindOf(Z.b) !== 'text') {         // code, table or divider at an end: a plain text edit
        const a = sA + A.lo, z = Math.max(a, sZ + Z.lo);
        return this.commit(this.md.slice(0, a) + text + this.md.slice(z), a + text.length, a + text.length, 'cmd', true);
      }
      let head = headMd(A.b);
      const left = frag(A.b, contentStart(A.b), pointIn(A.b, Math.max(A.lo, head.length)));
      const right = frag(Z.b, pointIn(Z.b, Math.max(Z.lo, headMd(Z.b).length)), [Z.b, Z.b.childNodes.length]);
      const lines = text.split('\n');
      if (!left && lines.length > 1 && parseLine(lines[0]).k !== 'p') head = '';   // pasting blocks onto an empty line: their own style wins
      const first = head + left + lines[0];
      const all = lines.length === 1 ? first + right : [first, ...lines.slice(1, -1), lines[lines.length - 1] + right].join('\n');
      this.replaceBlocks(A.b, Z.b, all, sA + all.length - right.length);
    }
    backAtStart(b) {
      const kind = blockKind(b), S = this.start(b), H = headMd(b), C = b._md.slice(H.length), pre = b.getAttribute('data-pre') || '';
      if (pre) {
        if (/^\s/.test(pre) && ['ul', 'ol', 'todo'].includes(kind)) { const line = b._md.replace(/^( {1,2}|\t)/, ''); return this.replaceBlocks(b, b, line, S + H.length - (b._md.length - line.length)); }
        const a = b.getAttribute('data-al'), keep = a && !['ul', 'ol', 'todo'].includes(kind) ? `{${a}} ` : '';
        return this.replaceBlocks(b, b, keep + C, S + keep.length);
      }
      const prev = b.previousElementSibling; if (!prev) return;
      const pk = kindOf(prev), ps = this.start(prev);
      if (pk === 'text') return this.replaceBlocks(prev, b, prev._md + C, ps + prev._md.length);
      if (pk === 'hr') return this.replaceBlocks(prev, b, b._md, ps + H.length);
      const rows = prev.querySelectorAll('tr'), lr = rows[rows.length - 1];
      const end = ps + (pk === 'code' ? codeHead(prev) + codeText(prev).length : prev._md.length - 1 - ((lr && lr.getAttribute('data-tail')) || '').length);
      if (!C) return this.replaceBlocks(prev, b, prev._md, end);
      this.setSel(end, end);
    }
    delAtEnd(b) {
      const next = b.nextElementSibling; if (!next) return;
      const S = this.start(b), nk = kindOf(next);
      if (nk === 'text') return this.replaceBlocks(b, next, b._md + next._md.slice(headMd(next).length), S + b._md.length);
      if (nk === 'hr') return this.replaceBlocks(b, next, b._md, S + b._md.length);
      if (b._md === headMd(b)) return this.replaceBlocks(b, next, next._md, S);
    }

    // ---------- clipboard ----------
    paste(e) {
      e.preventDefault();
      const dt = e.clipboardData; if (!dt) return;
      const html = dt.getData('text/html'), txt = dt.getData('text/plain');
      let md = html && !/class="?rt-b/.test(html) ? htmlToMd(html) : '';
      if (!md) md = txt || (html ? htmlToMd(html) : '');
      md = md.replace(/\r\n?/g, '\n');
      if (!md) return;
      this.syncNative(false); this.lastSel = this.cur();
      const r = this.range(); if (!r) return;
      const A = this.locate(r.startContainer, r.startOffset);
      if (A && (kindOf(A.b) === 'code' || kindOf(A.b) === 'table')) {   // plain text into code; one line into a table cell
        const plainTxt = (txt || md).replace(/\r\n?/g, '\n');
        return kindOf(A.b) === 'code' ? this.replaceRange(plainTxt) : this.typeText(plainTxt.split('\n')[0]);
      }
      this.replaceRange(md);
    }
    selectedMd(r) {
      const A = this.locate(r.startContainer, r.startOffset), Z = this.locate(r.endContainer, r.endOffset, true);
      if (!A || !Z) return null;
      const sA = this.start(A.b) + A.lo, sZ = this.start(Z.b) + Z.lo;
      if (A.b === Z.b && kindOf(A.b) === 'text') return frag(A.b, pointIn(A.b, Math.max(A.lo, headMd(A.b).length)), pointIn(Z.b, Z.lo));
      const out = [];
      for (let b = A.b; b; b = b.nextElementSibling) {
        const s = this.start(b), k = kindOf(b), first = b === A.b, last = b === Z.b;
        if (k !== 'text') out.push(this.md.slice(first ? sA : s, last ? sZ : s + b._md.length));
        else if (first) { const H = headMd(b); out.push((A.lo <= H.length ? H : '') + frag(b, pointIn(b, Math.max(A.lo, H.length)), [b, b.childNodes.length])); }
        else if (last) out.push(headMd(b) + frag(b, contentStart(b), pointIn(b, Z.lo)));
        else out.push(b._md);
        if (last) break;
      }
      return out.join('\n');
    }
    copy(e, cut) {
      const r = this.range(); if (!r || r.collapsed) return;
      this.syncNative(false);
      const md = this.selectedMd(r); if (md === null) return;
      e.preventDefault();
      const box = document.createElement('div'); box.appendChild(r.cloneContents());
      box.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
      box.querySelectorAll('.rt-cb').forEach(n => n.remove());
      try { e.clipboardData.setData('text/plain', md); e.clipboardData.setData('text/html', box.innerHTML); } catch {}
      if (cut) { this.lastSel = this.cur(); this.deleteRange(r); }
    }

    // ---------- phone: keep the caret above the keyboard's format bar ----------
    visible() {
      if (isDesk() || !this.focused()) return;
      const r = this.caretRect(this.sel.e); if (!r) return;
      const vv = window.visualViewport, bar = document.querySelector('.gd-fmt-wrap.docked');
      const bottom = (vv ? vv.offsetTop + vv.height : innerHeight) - (bar ? bar.getBoundingClientRect().height : 0) - 12, topLimit = 76;
      const hidden = innerHeight - bottom;   // room the keyboard + bar cover: let the last lines scroll above them
      this.el.style.paddingBottom = hidden > 90 ? hidden + 'px' : '';
      const sc = scroller(this.el);
      if (r.bottom > bottom) sc.scrollTop += r.bottom - bottom;
      else if (r.top < topLimit) sc.scrollTop -= topLimit - r.top;
    }
  }

  // ---------- helpers on blocks ----------
  function blockKind(b) {
    const c = b.classList;
    return c.contains('rt-h') ? 'h' : c.contains('rt-sub') ? 'sub' : c.contains('rt-q') ? 'q' : c.contains('rt-li') ? 'ul' : c.contains('rt-ol') ? 'ol' : c.contains('rt-todo') ? 'todo' : 'p';
  }
  function contHead(b, kind) {
    const pre = b.getAttribute('data-pre') || '', a = b.getAttribute('data-al');
    if (kind === 'ul') return pre;
    if (kind === 'ol') { const m = /^(\s*)(\d+)([.)])(\s)$/.exec(pre); return m ? m[1] + (+m[2] + 1) + m[3] + m[4] : pre; }
    if (kind === 'todo') return pre + '[ ]' + (b.getAttribute('data-sp2') ?? ' ');
    if (kind === 'q') return pre + (a ? `{${a}} ` : '');
    return a ? `{${a}} ` : '';
  }
  const codeHead = b => b.getAttribute('data-fence').length + (b.hasAttribute('data-nl0') && !b.textContent ? 0 : 1);
  const cellOf = n => { const e = n && (n.nodeType === 3 ? n.parentElement : n); return e && e.closest ? e.closest('td,th') : null; };
  function contentStart(b) { const cb = b.querySelector(':scope > .rt-cb'); return [b, cb ? [...b.childNodes].indexOf(cb) + 1 : 0]; }
  function normPoint(b, n, o) {   // a point before the checkbox -> right after it
    if (n === b) { const cb = b.querySelector(':scope > .rt-cb'); if (cb) { const i = [...b.childNodes].indexOf(cb); if (o <= i) return [b, i + 1]; } }
    if (isCb(n) || (n.parentNode && isCb(n.parentNode))) return contentStart(b);
    return [n, o];
  }
  function frag(b, p1, p2) {
    try {
      const r = document.createRange(); r.setStart(p1[0], p1[1]); r.setEnd(p2[0], p2[1]);
      if (r.collapsed) return '';
      const box = document.createElement('div'); box.appendChild(r.cloneContents());
      box.querySelectorAll('.rt-cb').forEach(n => n.remove());
      return serKids(box);
    } catch { return ''; }
  }
  // Markdown offset of a DOM point inside an inline container
  function inlineOffset(root, node, off) {
    if (root === node) { let a = 0; const cs = root.childNodes; for (let i = 0; i < off && i < cs.length; i++) a += serNode(cs[i]).length; return a; }
    let a = 0;
    for (let c = root.firstChild; c; c = c.nextSibling) {
      if (c === node || c.contains(node)) {
        if (c.nodeType === 3) return a + Math.min(off, c.data.length);
        if (c.nodeType !== 1 || isCb(c)) return a;
        const s = serNode(c); if (!s) return a;
        const [o] = delims(c);
        if (atomic(c)) { const r = document.createRange(); r.selectNodeContents(c); try { r.setEnd(node, off); } catch {} return a + o.length + Math.min(r.toString().length, plain(c.textContent).length); }
        return a + o.length + inlineOffset(c, node, off);
      }
      a += serNode(c).length;
    }
    return a;
  }
  function localOf(b, node, off) {
    const k = kindOf(b);
    if (k === 'hr') return 0;
    if (k === 'code') {
      const r = document.createRange(); r.selectNodeContents(b);
      try { if (node !== b || off < b.childNodes.length) r.setEnd(node, off); } catch {}
      return codeHead(b) + Math.min(r.toString().length, codeText(b).length);
    }
    if (k === 'table') {
      const cell = cellOf(node); if (!cell || !b.contains(cell)) return 0;
      const rows = [...b.querySelectorAll('tr')], tr = cell.parentNode, ri = rows.indexOf(tr);
      let a = 0;
      if (ri > 0) { a = rowMd(rows[0]).length + 1 + (b.getAttribute('data-sep') || '').length + 1; for (let i = 1; i < ri; i++) a += rowMd(rows[i]).length + 1; }
      a += 1; for (const c of tr.cells) { if (c === cell) break; a += cellMd(c).length + 1; }
      return a + (node === cell || cell.contains(node) ? inlineOffset(cell, node, off) : 0);
    }
    const H = headMd(b).length;
    if (node === b) { const cb = b.querySelector(':scope > .rt-cb'), i = cb ? [...b.childNodes].indexOf(cb) : -1; if (off <= i) return H; let a = 0; for (let j = i + 1; j < off && j < b.childNodes.length; j++) a += serNode(b.childNodes[j]).length; return H + a; }
    if (isCb(node) || (node.parentNode && isCb(node.parentNode))) return H;
    return H + inlineOffset(b, node, off);
  }
  // DOM point for a Markdown offset inside an inline container
  function findIn(root, t) {
    let a = 0;
    const cs = [...root.childNodes].filter(c => !isCb(c));
    for (const c of cs) {
      if (c.nodeType === 3) { const L = c.data.length; if (t <= a + L) return [c, t - a]; a += L; continue; }
      if (c.nodeType !== 1) continue;
      const L = serNode(c).length; if (!L) continue;
      if (t === a) return [root, [...root.childNodes].indexOf(c)];
      if (t < a + L) {
        const rel = t - a, [o, cl] = delims(c);
        if (atomic(c)) return textAt(c, Math.max(0, Math.min(rel - o.length, plain(c.textContent).length)));
        return findIn(c, Math.max(0, Math.min(rel - o.length, L - o.length - cl.length)));
      }
      a += L;
    }
    return [root, root.childNodes.length && root.lastChild.tagName === 'BR' ? root.childNodes.length - 1 : root.childNodes.length];
  }
  function textAt(root, t) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let a = 0, n, last = null;
    while ((n = w.nextNode())) { if (t <= a + n.data.length) return [n, t - a]; a += n.data.length; last = n; }
    return last ? [last, last.data.length] : [root, 0];
  }
  function pointIn(b, lo) {
    const k = kindOf(b);
    if (k === 'hr') return null;
    if (k === 'code') return textAt(b, Math.max(0, lo - codeHead(b)));
    if (k === 'table') {
      const rows = [...b.querySelectorAll('tr')]; if (!rows.length) return [b, 0];
      const lines = [rowMd(rows[0]), b.getAttribute('data-sep') || '', ...rows.slice(1).map(rowMd)];
      let a = 0;
      for (let li = 0; li < lines.length; li++) {
        if (lo <= a + lines[li].length) {
          const tr = li === 0 ? rows[0] : li === 1 ? null : rows[li - 1];
          if (!tr) { const c = rows[0].cells[rows[0].cells.length - 1]; return findIn(c, cellMd(c).length); }
          let t = lo - a - 1;
          const cells = [...tr.cells];
          for (const c of cells) { const L = cellMd(c).length; if (t <= L) return findIn(c, Math.max(0, t)); t -= L + 1; }
          const c = cells[cells.length - 1]; return c ? findIn(c, cellMd(c).length) : [tr, 0];
        }
        a += lines[li].length + 1;
      }
      const lr = rows[rows.length - 1], c = lr.cells[lr.cells.length - 1]; return c ? findIn(c, cellMd(c).length) : [b, 0];
    }
    const H = headMd(b).length;
    if (lo <= H) { const [n, o] = contentStart(b); const f = n.childNodes[o]; return f && f.nodeType === 3 ? [f, 0] : [n, o]; }
    return findIn(b, lo - H);
  }
  const canonMemo = new Map();
  function canon(md) {
    if (md === undefined) return null;
    let h = canonMemo.get(md);
    if (h === undefined) {
      const ds = parseBlocks(md);
      if (ds.length !== 1) h = null;
      else { const t = document.createElement('template'); t.innerHTML = htmlOf(ds[0]); h = t.content.firstElementChild ? t.content.firstElementChild.outerHTML : null; }
      if (canonMemo.size > 4000) canonMemo.clear(); canonMemo.set(md, h);
    }
    return h;
  }
  function scroller(el) {
    for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p; }
    return document.scrollingElement;
  }

  // selection -> the textarea-style selection (toolbar state, remote cursor, slash menu); a 'select' event like a textarea
  let raf = 0;
  document.addEventListener('selectionchange', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (const r of live) {
        if (!r.el.isConnected) { live.delete(r); continue; }
        if (!r.focused() || r.composing) continue;
        const d = r.domSel(); if (!d) continue;
        r.sel = d; r.stale = false;
        const key = `${d.s}:${d.e}`;
        if (key !== r.selKey) { r.selKey = key; r.el.dispatchEvent(new Event('select')); r.visible(); }
      }
    });
  });
  addEventListener('resize', () => { for (const r of live) if (r.focused()) r.visible(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { for (const r of live) if (r.focused()) setTimeout(() => r.visible(), 60); });

  // ---------- public ----------
  const markdown = () => { try { return localStorage.getItem(PREF) === '1'; } catch { return false; } };
  window.TribeRich = {
    // swap a textarea for the rich surface (unless this device prefers the Markdown view); returns the editor element
    upgrade(ta) {
      if (!ta || ta.tagName !== 'TEXTAREA' || markdown()) return ta;
      try { return new Rich(ta).el; } catch (e) { console.warn('rich text unavailable', e); return ta; }
    },
    markdown,
    setMarkdown(on) { try { if (on) localStorage.setItem(PREF, '1'); else localStorage.removeItem(PREF); } catch {} },
    // ⋮ More item: { label, icon, run }
    menuItem(after) { const on = markdown(); return { label: on ? 'View formatted' : 'View Markdown', icon: 'code', id: 'rt-view-md', run: () => { window.TribeRich.setMarkdown(!on); after && after(!on); } }; },
    parse: parseBlocks, html: md => parseBlocks(md).map(blockHtml).join(''), htmlToMd, inline: inlineOf,
    // Markdown -> DOM -> Markdown through a real (detached) editor; for tests
    roundTrip(md) {
      const ta = document.createElement('textarea'); ta.value = md; const box = document.createElement('div'); box.style.cssText = 'position:absolute;left:-9999px;top:0;width:600px'; box.appendChild(ta); document.body.appendChild(box);
      const r = new Rich(ta); const out = [...r.el.children].map(serBlock).join('\n'); live.delete(r); box.remove(); return out;
    },
  };
})();
