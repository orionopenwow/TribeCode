// Small, safe Markdown renderer (escapes all HTML first). Supports headings, lists, task lists,
// quotes, code blocks, tables, hr, bold/italic/strike/code, http(s) links and pictures.
// Pictures (feat/calm-parity): ![alt](url) shows only for a safe address: the tribe's own /api links (signed again
// each time they are drawn, so a picture dropped in a doc keeps showing), a small data:image (png, jpeg, gif, webp)
// and https. Anything else (javascript:, http: elsewhere, SVG data, a relative path) stays as the text you typed.
(function () {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DATA_MAX = 2000000;
  function imgSrc(raw) {
    const u = String(raw).replace(/&amp;/g, '&');
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(u)) return u.length <= DATA_MAX ? u : null;
    let x; try { x = new URL(u); } catch { return null; }
    const C = window.TribeClient; let own = [location.origin];
    try { if (C && C.base) own.push(new URL(C.base(), location.href).origin); } catch {}
    if (own.includes(x.origin) && /^\/api\/[\w./%~-]+$/.test(x.pathname) && !/(^|\/)\.\.(\/|$)/.test(x.pathname)) { x.searchParams.delete('mt'); x.searchParams.delete('token'); return window.TribeMedia ? window.TribeMedia.url(x.href) : x.href; }
    return x.protocol === 'https:' && !x.username && !x.password ? x.href : null;
  }
  function inline(t) {
    const codes = [], imgs = [];
    t = esc(t).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    t = t.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, (all, alt, u) => { const src = imgSrc(u); return src ? `\u0001${imgs.push(`<img class="md-img" src="${esc(src)}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`) - 1}\u0001` : all; });
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      // feat/doc-editor: ++underline++, ==highlight== / =={teal}highlight==, {teal}colored text{/}
      .replace(/\+\+(?=\S)(.*?\S)\+\+/g, '<u>$1</u>')
      .replace(/==(?:\{(ember|teal|indigo|amber|rose|green)\})?([^=]+?)==/g, (_, c, x) => `<mark class="hl hl-${c || 'amber'}">${x}</mark>`)
      .replace(/\{(ember|teal|indigo|amber|rose|green)\}(.*?)\{\/\}/g, '<span class="tc tc-$1">$2</span>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|\s|\()(https?:\/\/[^\s<]+)/g, (all, pre, u) => {   // feat/chat2: trailing punctuation (and an unmatched ")") stays outside the link
        let tail = '';
        for (;;) {
          const m = /(&quot;|&#39;|[.,;:!?\]}*_~])$/.exec(u) || (u.endsWith(')') && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length ? [')'] : null);
          if (!m) break; tail = m[0] + tail; u = u.slice(0, -m[0].length);
        }
        return /^https?:\/\/[^/?#]/.test(u) ? `${pre}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>${tail}` : all;
      });
    return t.replace(/\u0001(\d+)\u0001/g, (_, i) => imgs[i]).replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }
  const align = t => { const m = /^\{(left|center|right|justify)\} (.*)$/.exec(t); return m ? [m[1] === 'left' ? '' : ` class="md-al-${m[1]}"`, m[2]] : ['', t]; };
  function render(src) {
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    const out = []; let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) {
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
      }
      let m;
      if ((m = l.match(/^(#{1,5})\s+(.*)$/))) { const n = m[1].length, [al, rest] = align(m[2]); out.push(n === 5 ? `<p class="md-sub"${al}>${inline(rest)}</p>` : `<h${n}${al}>${inline(rest)}</h${n}>`); i++; continue; }
      if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`); continue; }
      if (/^\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = row(l); i += 2; const body = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
        out.push(`<table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }
      if (/^\s*[-*]\s/.test(l) || /^\s*\d+[.)]\s/.test(l)) {
        const ordered = /^\s*\d/.test(l); const items = [];
        while (i < lines.length && (ordered ? /^\s*\d+[.)]\s/ : /^\s*[-*]\s/).test(lines[i])) {
          const raw = lines[i].replace(ordered ? /^\s*\d+[.)]\s/ : /^\s*[-*]\s/, '');
          const task = raw.match(/^\[([ xX])\]\s(.*)$/);
          items.push(task ? `<li class="todo${task[1] !== ' ' ? ' done' : ''}"><input type="checkbox" data-line="${i}"${task[1] !== ' ' ? ' checked' : ''}> <span>${inline(task[2])}</span></li>` : `<li>${inline(raw)}</li>`);
          i++;
        }
        out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`); continue;
      }
      if (!l.trim()) { i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,5}\s|```|>|\s*[-*]\s|\s*\d+[.)]\s|\|)/.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) buf.push(lines[i++]);
      const [al] = align(buf[0]);   // feat/doc-editor: {center} / {right} / {justify} at the start of a paragraph
      out.push(`<p${al}>${buf.map(x => inline(align(x)[1])).join('<br>')}</p>`);
    }
    return out.join('\n');
  }
  window.TribeMD = { render, inline, esc };
})();
