// Sheets (feat/crafts): a light spreadsheet inside Files. A sheet is a doc with kind "sheet" whose body is a plain
// Markdown table, so it reads well on GitHub, agents can edit it as text (write_doc with kind "sheet"), and Flint can
// write one from a sentence. Cells starting with "=" are formulas: + - * / ^ & and comparisons, A1 refs, A1:B9
// ranges, and SUM AVERAGE MIN MAX COUNT COUNTA MEDIAN PRODUCT IF AND OR NOT ROUND ABS SQRT LEN UPPER LOWER CONCAT
// TODAY SUMIF COUNTIF. Zero dependencies. For full Excel work (pivots, charts, .xlsx round trips) open the file in
// GridCraft (docs/CRAFTS.md).
//   window.TribeSheet = { parse(body), serialize(sheet), evaluate(grid), mount(pane, opts) -> { update(doc), destroy() } }
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const col = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const colIdx = s => [...s.toUpperCase()].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const MINR = 30, MINC = 10, MAXR = 2000, MAXC = 52;

  // ---------- Markdown table <-> grid ----------
  const splitRow = line => {
    let s = line.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const out = []; let cur = '';
    for (let i = 0; i < s.length; i++) { if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; } else if (s[i] === '|') { out.push(cur.trim()); cur = ''; } else cur += s[i]; }
    out.push(cur.trim()); return out;
  };
  const isSep = line => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
  function parse(body) {
    const lines = String(body || '').replace(/\r/g, '').split('\n');
    let a = lines.findIndex((l, i) => /\|/.test(l) && isSep(lines[i + 1] || ''));
    if (a < 0) {   // no table yet: CSV pasted as a body still opens
      const csvish = lines.filter(l => l.trim()).length && lines.filter(l => l.trim()).every(l => l.includes(',') || l.includes('\t'));
      return { pre: csvish ? '' : String(body || '').trim(), post: '', grid: csvish ? fromCSV(body) : [] };
    }
    let b = a + 2; while (b < lines.length && /\|/.test(lines[b]) && lines[b].trim()) b++;
    const rows = [lines[a], ...lines.slice(a + 2, b)].map(splitRow);
    return { pre: lines.slice(0, a).join('\n').trim(), post: lines.slice(b).join('\n').trim(), grid: rows };
  }
  function bounds(grid) {
    let r = 0, c = 0;
    grid.forEach((row, i) => (row || []).forEach((v, j) => { if (String(v ?? '').trim() !== '') { r = Math.max(r, i + 1); c = Math.max(c, j + 1); } }));
    return { r, c };
  }
  function serialize(sh) {
    const { r, c } = bounds(sh.grid), cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const rows = []; for (let i = 0; i < Math.max(r, 1); i++) { const row = []; for (let j = 0; j < Math.max(c, 1); j++) row.push(cell((sh.grid[i] || [])[j])); rows.push(row); }
    const line = row => `| ${row.map(v => v || ' ').join(' | ')} |`;
    const table = [line(rows[0]), `| ${rows[0].map(() => '---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
    return [sh.pre, table, sh.post].filter(Boolean).join('\n\n') + '\n';
  }
  function fromCSV(text) {
    const t = String(text || '').replace(/\r/g, ''), tab = t.split('\n')[0].includes('\t') && !t.split('\n')[0].includes(','), d = tab ? '\t' : ',';
    const out = []; let row = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === d) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; } else cur += ch;
    }
    if (cur || row.length) { row.push(cur); out.push(row); }
    return out.slice(0, MAXR).map(r => r.slice(0, MAXC));
  }
  const toCSV = (rows, d = ',') => rows.map(r => r.map(v => { v = String(v ?? ''); return /[",\n\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(d)).join('\n');

  // ---------- formulas ----------
  class FErr extends Error { constructor(code) { super(code); this.code = code; } }
  const num = v => { if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; if (v === '' || v == null) return 0; const n = Number(String(v).replace(/[$,%\s]/g, '')); if (isNaN(n)) throw new FErr('#VALUE!'); return String(v).trim().endsWith('%') ? n / 100 : n; };
  const isNum = v => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v.replace(/[$,%\s]/g, ''))));
  const flat = args => args.flat(Infinity);
  const nums = args => flat(args).filter(isNum).map(num);
  const crit = (c) => { const m = /^(<=|>=|<>|=|<|>)?(.*)$/.exec(String(c)); const op = m[1] || '=', rhs = m[2]; return v => { const a = isNum(v) && isNum(rhs) ? num(v) : String(v).toLowerCase(), b = isNum(v) && isNum(rhs) ? num(rhs) : rhs.toLowerCase(); return op === '=' ? a === b : op === '<>' ? a !== b : op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b; }; };
  const FN = {
    SUM: a => nums(a).reduce((x, y) => x + y, 0),
    AVERAGE: a => { const n = nums(a); if (!n.length) throw new FErr('#DIV/0!'); return n.reduce((x, y) => x + y, 0) / n.length; },
    MIN: a => { const n = nums(a); return n.length ? Math.min(...n) : 0; }, MAX: a => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
    COUNT: a => nums(a).length, COUNTA: a => flat(a).filter(v => v !== '' && v != null).length,
    MEDIAN: a => { const n = nums(a).sort((x, y) => x - y); if (!n.length) throw new FErr('#NUM!'); const h = n.length >> 1; return n.length % 2 ? n[h] : (n[h - 1] + n[h]) / 2; },
    PRODUCT: a => nums(a).reduce((x, y) => x * y, 1),
    IF: a => (truthy(a[0]) ? a[1] : a.length > 2 ? a[2] : false), AND: a => flat(a).every(truthy), OR: a => flat(a).some(truthy), NOT: a => !truthy(a[0]),
    ROUND: a => { const p = Math.pow(10, num(a[1] ?? 0)); return Math.round(num(a[0]) * p) / p; }, ABS: a => Math.abs(num(a[0])), SQRT: a => { const n = num(a[0]); if (n < 0) throw new FErr('#NUM!'); return Math.sqrt(n); },
    LEN: a => String(a[0] ?? '').length, UPPER: a => String(a[0] ?? '').toUpperCase(), LOWER: a => String(a[0] ?? '').toLowerCase(), CONCAT: a => flat(a).join(''),
    TODAY: () => new Date().toISOString().slice(0, 10),
    SUMIF: a => { const r = flat([a[0]]), s = a[2] !== undefined ? flat([a[2]]) : r, t = crit(a[1]); return r.reduce((acc, v, i) => acc + (t(v) && isNum(s[i]) ? num(s[i]) : 0), 0); },
    COUNTIF: a => { const t = crit(a[1]); return flat([a[0]]).filter(v => v !== '' && t(v)).length; },
  };
  FN.AVG = FN.AVERAGE; FN.CONCATENATE = FN.CONCAT;
  const truthy = v => (typeof v === 'string' ? (v.toUpperCase() === 'TRUE' ? true : v.toUpperCase() === 'FALSE' ? false : v !== '') : !!v);

  function tokenize(s) {
    const out = []; let i = 0;
    const re = { ws: /\s/, num: /[0-9.]/, id: /[A-Za-z_$]/ };
    while (i < s.length) {
      const ch = s[i];
      if (re.ws.test(ch)) { i++; continue; }
      if (ch === '"') { let j = i + 1, v = ''; while (j < s.length && !(s[j] === '"' && s[j + 1] !== '"')) { if (s[j] === '"') j++; v += s[j++]; } out.push({ t: 'str', v }); i = j + 1; continue; }
      if (re.num.test(ch)) { const m = /^\d*\.?\d+(e[+-]?\d+)?%?/i.exec(s.slice(i)); if (!m) throw new FErr('#ERR'); out.push({ t: 'num', v: m[0].endsWith('%') ? parseFloat(m[0]) / 100 : parseFloat(m[0]) }); i += m[0].length; continue; }
      if (re.id.test(ch)) {
        const m = /^\$?[A-Za-z]{1,2}\$?\d+(:\$?[A-Za-z]{1,2}\$?\d+)?/.exec(s.slice(i));
        if (m && !/^[A-Za-z(]/.test(s[i + m[0].length] || '')) { out.push({ t: 'ref', v: m[0].replace(/\$/g, '').toUpperCase() }); i += m[0].length; continue; }
        const w = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i))[0]; out.push({ t: 'id', v: w.toUpperCase() }); i += w.length; continue;
      }
      const two = s.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/^&=<>(),:'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
      throw new FErr('#ERR');
    }
    return out;
  }
  // precedence climbing: comparison < & < + - < * / < ^ < unary
  function evalFormula(src, get) {
    const tk = tokenize(src); let p = 0;
    const peek = () => tk[p], eat = v => { const x = tk[p]; if (!x || (v && x.v !== v)) throw new FErr('#ERR'); p++; return x; };
    const cmp = (o, a, b) => { const A = isNum(a) && isNum(b) ? num(a) : String(a).toLowerCase(), B = isNum(a) && isNum(b) ? num(b) : String(b).toLowerCase(); return o === '=' ? A === B : o === '<>' ? A !== B : o === '<' ? A < B : o === '>' ? A > B : o === '<=' ? A <= B : A >= B; };
    function expr() { let a = cat(); while (peek() && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) { const o = eat().v; a = cmp(o, a, cat()); } return a; }
    function cat() { let a = add(); while (peek() && peek().v === '&') { eat(); a = String(a ?? '') + String(add() ?? ''); } return a; }
    function add() { let a = mul(); while (peek() && (peek().v === '+' || peek().v === '-')) { const o = eat().v, b = mul(); a = o === '+' ? num(a) + num(b) : num(a) - num(b); } return a; }
    function mul() { let a = pow(); while (peek() && (peek().v === '*' || peek().v === '/')) { const o = eat().v, b = pow(); if (o === '/' && num(b) === 0) throw new FErr('#DIV/0!'); a = o === '*' ? num(a) * num(b) : num(a) / num(b); } return a; }
    function pow() { let a = unary(); while (peek() && peek().v === '^') { eat(); a = Math.pow(num(a), num(unary())); } return a; }
    function unary() { if (peek() && peek().v === '-') { eat(); return -num(unary()); } if (peek() && peek().v === '+') { eat(); return num(unary()); } return atom(); }
    function atom() {
      const x = eat();
      if (x.t === 'num' || x.t === 'str') return x.v;
      if (x.t === 'ref') { if (x.v.includes(':')) return range(x.v); return get(x.v); }
      if (x.t === 'id') {
        if (x.v === 'TRUE') return true; if (x.v === 'FALSE') return false;
        const f = FN[x.v]; if (!f) throw new FErr('#NAME?');
        eat('('); const args = [];
        if (peek() && peek().v !== ')') { args.push(expr()); while (peek() && peek().v === ',') { eat(); args.push(expr()); } }
        eat(')'); return f(args);
      }
      if (x.v === '(') { const v = expr(); eat(')'); return v; }
      throw new FErr('#ERR');
    }
    function range(r) {
      const [a, b] = r.split(':'), pa = /^([A-Z]+)(\d+)$/.exec(a), pb = /^([A-Z]+)(\d+)$/.exec(b);
      const c1 = Math.min(colIdx(pa[1]), colIdx(pb[1])), c2 = Math.max(colIdx(pa[1]), colIdx(pb[1])), r1 = Math.min(+pa[2], +pb[2]), r2 = Math.max(+pa[2], +pb[2]);
      if ((r2 - r1 + 1) * (c2 - c1 + 1) > 50000) throw new FErr('#REF!');
      const out = []; for (let i = r1; i <= r2; i++) for (let j = c1; j <= c2; j++) out.push(get(col(j) + i)); return out;
    }
    const v = expr(); if (p < tk.length) throw new FErr('#ERR'); return v;
  }
  // every cell's shown value; cycles show #CYCLE!
  function evaluate(grid) {
    const memo = new Map(), busy = new Set();
    function get(ref) {
      if (memo.has(ref)) { const v = memo.get(ref); if (v && v.err) throw new FErr(v.err); return v; }
      const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) throw new FErr('#REF!');
      const raw = String(((grid[+m[2] - 1] || [])[colIdx(m[1])]) ?? '');
      if (!raw.startsWith('=')) { const v = isNum(raw) && raw.trim() !== '' ? num(raw) : raw; memo.set(ref, v); return v; }
      if (busy.has(ref)) throw new FErr('#CYCLE!');
      busy.add(ref);
      let v; try { v = evalFormula(raw.slice(1), get); if (Array.isArray(v)) v = v[0] ?? ''; } catch (e) { v = { err: e.code || '#ERR' }; }
      busy.delete(ref);
      if (v && v.err && busy.size) { memo.set(ref, v); throw new FErr(v.err); }
      memo.set(ref, v); return v;
    }
    const safe = ref => { try { return get(ref); } catch (e) { return { err: e.code || '#ERR' }; } };
    return { at: (r, c) => safe(col(c) + (r + 1)) };
  }
  const show = v => {
    if (v && v.err) return v.err;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US', { useGrouping: false }) : String(Math.round(v * 1e6) / 1e6);
    return String(v ?? '');
  };

  // ---------- the editor ----------
  function mount(pane, o) {
    let doc = o.doc, sh = parse(doc.body), ev = null, sel = { r: 0, c: 0, r2: 0, c2: 0 }, editing = null, saveT = null, dirty = new Set();
    const rows = () => Math.min(MAXR, Math.max(MINR, bounds(sh.grid).r + 6)), cols = () => Math.min(MAXC, Math.max(MINC, bounds(sh.grid).c + 3));
    const raw = (r, c) => String((sh.grid[r] || [])[c] ?? '');
    const setRaw = (r, c, v) => { while (sh.grid.length <= r) sh.grid.push([]); const row = sh.grid[r]; while (row.length <= c) row.push(''); row[c] = v; dirty.add(r + ',' + c); };
    pane.innerHTML = `<div class="sx">
      <div class="sx-top">
        <span class="sx-ico" aria-hidden="true">📊</span>
        <input class="sx-title" id="sx-title" value="${esc(doc.title)}" maxlength="120" aria-label="Sheet name">
        <span class="sx-status faint" id="sx-status">Saved</span>
        <span class="sx-acts">
          <button class="btn ghost" id="sx-flint" title="Ask Flint to fill or change this sheet">✨ Ask Flint</button>
          <button class="btn ghost" id="sx-csv" title="Download as CSV (opens in Excel, Sheets, GridCraft)">⬇ CSV</button>
          <label class="btn ghost sx-imp" title="Import a CSV">⬆ Import<input type="file" id="sx-file" accept=".csv,.tsv,.txt" hidden></label>
          <button class="btn ghost" id="sx-del" title="Delete sheet" aria-label="Delete sheet">🗑</button>
          <button class="btn ghost" id="sx-close" title="Close" aria-label="Close sheet">✕</button>
        </span>
      </div>
      <div class="sx-bar"><span class="sx-ref" id="sx-ref">A1</span><span class="sx-fx" aria-hidden="true">fx</span><input class="sx-formula" id="sx-formula" spellcheck="false" aria-label="Cell contents" placeholder="Type a value, or = for a formula like =SUM(B2:B9)"></div>
      <div class="sx-ask hidden" id="sx-ask"><input class="input" id="sx-ask-in" placeholder="e.g. add a column for tax at 8%, or: make a weekly chores rota for 4 people"><button class="btn" id="sx-ask-go">Ask</button></div>
      <div class="sx-wrap" id="sx-wrap" tabindex="0" aria-label="Sheet grid"><table class="sx-grid" id="sx-grid"></table></div>
      <div class="sx-foot faint" id="sx-foot"></div>
    </div>`;
    const $ = s => pane.querySelector(s), wrap = $('#sx-wrap'), fbar = $('#sx-formula');
    function draw() {
      ev = evaluate(sh.grid);
      const R = rows(), Cn = cols();
      let h = '<thead><tr><th class="sx-corner"></th>';
      for (let c = 0; c < Cn; c++) h += `<th data-hc="${c}">${col(c)}</th>`;
      h += '</tr></thead><tbody>';
      for (let r = 0; r < R; r++) {
        h += `<tr><th data-hr="${r}">${r + 1}</th>`;
        for (let c = 0; c < Cn; c++) {
          const v = ev.at(r, c), s = show(v), rw = raw(r, c), n = typeof v === 'number';
          h += `<td data-r="${r}" data-c="${c}" class="${n ? 'n' : ''}${v && v.err ? ' err' : ''}${r === 0 && rw ? ' hd' : ''}${rw.startsWith('=') ? ' fx' : ''}" title="${v && v.err ? esc(v.err + ' in ' + rw) : ''}">${esc(s)}</td>`;
        }
        h += '</tr>';
      }
      $('#sx-grid').innerHTML = h + '</tbody>';
      paintSel();
    }
    function inSel(r, c) { return r >= Math.min(sel.r, sel.r2) && r <= Math.max(sel.r, sel.r2) && c >= Math.min(sel.c, sel.c2) && c <= Math.max(sel.c, sel.c2); }
    function paintSel() {
      pane.querySelectorAll('td.on, td.cur').forEach(td => td.classList.remove('on', 'cur'));
      const r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2), c1 = Math.min(sel.c, sel.c2), c2 = Math.max(sel.c, sel.c2);
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const td = cell(r, c); if (td) td.classList.add('on'); }
      const td = cell(sel.r, sel.c); if (td) { td.classList.add('cur'); td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      $('#sx-ref').textContent = r1 === r2 && c1 === c2 ? col(sel.c) + (sel.r + 1) : `${col(c1)}${r1 + 1}:${col(c2)}${r2 + 1}`;
      if (document.activeElement !== fbar) fbar.value = raw(sel.r, sel.c);
      // the status bar: sum / average / count of the selection, like every spreadsheet
      const vals = []; for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const v = ev.at(r, c); if (typeof v === 'number') vals.push(v); }
      $('#sx-foot').textContent = vals.length > 1 ? `Sum ${show(vals.reduce((a, b) => a + b, 0))} · Average ${show(vals.reduce((a, b) => a + b, 0) / vals.length)} · Count ${vals.length}` : 'Tip: type = to start a formula · paste straight from Excel or Google Sheets';
    }
    const cell = (r, c) => pane.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    function status(t) { const s = $('#sx-status'); if (s) s.textContent = t; }
    function queue() { status('Editing…'); clearTimeout(saveT); saveT = setTimeout(flush, 700); }
    async function flush() {
      clearTimeout(saveT); saveT = null; status('Saving…');
      const body = serialize(sh), title = $('#sx-title').value.trim() || 'Untitled';
      const r = await o.save({ body, title, baseVersion: doc.version });
      if (r && r.conflict) {   // someone else saved first: take theirs, then put back the cells I changed
        const theirs = parse(r.conflict.body), mine = sh; sh = theirs;
        dirty.forEach(k => { const [rr, cc] = k.split(',').map(Number); setRaw(rr, cc, String((mine.grid[rr] || [])[cc] ?? '')); });
        doc = r.conflict; draw(); return flush();
      }
      if (r && r.doc) { doc = { ...doc, ...r.doc }; dirty.clear(); status(`Saved · v${doc.version}`); }
      else status('Not saved, retrying…');
    }
    function commit(r, c, v) { if (raw(r, c) === v) return; setRaw(r, c, v); draw(); queue(); }
    function startEdit(initial) {
      const td = cell(sel.r, sel.c); if (!td) return;
      const r = sel.r, c = sel.c; editing = { r, c };
      const inp = document.createElement('input'); inp.className = 'sx-in'; inp.value = initial != null ? initial : raw(r, c); inp.spellcheck = false;
      td.textContent = ''; td.appendChild(inp); inp.focus(); if (initial == null) inp.select();
      const done = (move) => { if (!editing) return; editing = null; commit(r, c, inp.value); if (move) go(move[0], move[1]); wrap.focus(); };
      inp.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); done([e.shiftKey ? -1 : 1, 0]); }
        else if (e.key === 'Tab') { e.preventDefault(); done([0, e.shiftKey ? -1 : 1]); }
        else if (e.key === 'Escape') { editing = null; draw(); wrap.focus(); }
        e.stopPropagation();
      };
      inp.oninput = () => { fbar.value = inp.value; };
      inp.onblur = () => setTimeout(() => done(null), 0);
    }
    function go(dr, dc, extend) {
      const r = Math.max(0, Math.min(rows() - 1, (extend ? sel.r2 : sel.r) + dr)), c = Math.max(0, Math.min(cols() - 1, (extend ? sel.c2 : sel.c) + dc));
      if (extend) { sel.r2 = r; sel.c2 = c; } else sel = { r, c, r2: r, c2: c };
      if (r >= rows() - 2 || c >= cols() - 1) draw(); else paintSel();
    }
    function selected() { const out = []; for (let r = Math.min(sel.r, sel.r2); r <= Math.max(sel.r, sel.r2); r++) { const row = []; for (let c = Math.min(sel.c, sel.c2); c <= Math.max(sel.c, sel.c2); c++) row.push(raw(r, c)); out.push(row); } return out; }
    wrap.addEventListener('mousedown', e => {
      const td = e.target.closest('td[data-r]'); const hr = e.target.closest('th[data-hr]'), hc = e.target.closest('th[data-hc]');
      if (td && !td.querySelector('.sx-in')) { const r = +td.dataset.r, c = +td.dataset.c; if (e.shiftKey) { sel.r2 = r; sel.c2 = c; } else sel = { r, c, r2: r, c2: c }; paintSel(); e.preventDefault(); wrap.focus(); drag = true; }
      else if (hr) { const r = +hr.dataset.hr; sel = { r, c: 0, r2: r, c2: cols() - 1 }; paintSel(); }
      else if (hc) { const c = +hc.dataset.hc; sel = { r: 0, c, r2: rows() - 1, c2: c }; paintSel(); }
    });
    let drag = false;
    wrap.addEventListener('mouseover', e => { if (!drag) return; const td = e.target.closest('td[data-r]'); if (td) { sel.r2 = +td.dataset.r; sel.c2 = +td.dataset.c; paintSel(); } });
    addEventListener('mouseup', () => { drag = false; });
    wrap.addEventListener('dblclick', e => { if (e.target.closest('td[data-r]')) startEdit(); });
    wrap.addEventListener('keydown', e => {
      if (editing) return;
      const k = e.key, mod = e.ctrlKey || e.metaKey;
      const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
      if (mv) { e.preventDefault(); return go(mv[0], mv[1], e.shiftKey); }
      if (k === 'Enter') { e.preventDefault(); return startEdit(); }
      if (k === 'Tab') { e.preventDefault(); return go(0, e.shiftKey ? -1 : 1); }
      if (k === 'F2') { e.preventDefault(); return startEdit(); }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); for (let r = Math.min(sel.r, sel.r2); r <= Math.max(sel.r, sel.r2); r++) for (let c = Math.min(sel.c, sel.c2); c <= Math.max(sel.c, sel.c2); c++) if (raw(r, c)) setRaw(r, c, ''); draw(); return queue(); }
      if (mod && k.toLowerCase() === 'a') { e.preventDefault(); sel = { r: 0, c: 0, r2: rows() - 1, c2: cols() - 1 }; return paintSel(); }
      if (!mod && k.length === 1) { e.preventDefault(); return startEdit(k); }
    });
    wrap.addEventListener('copy', e => { if (editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', toCSV(selected(), '\t')); });
    wrap.addEventListener('cut', e => { if (editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', toCSV(selected(), '\t')); for (let r = Math.min(sel.r, sel.r2); r <= Math.max(sel.r, sel.r2); r++) for (let c = Math.min(sel.c, sel.c2); c <= Math.max(sel.c, sel.c2); c++) setRaw(r, c, ''); draw(); queue(); });
    wrap.addEventListener('paste', e => {
      if (editing) return; e.preventDefault();
      const rowsIn = fromCSV(e.clipboardData.getData('text/plain').replace(/\n$/, '')); if (!rowsIn.length) return;
      rowsIn.forEach((row, i) => row.forEach((v, j) => { if (sel.r + i < MAXR && sel.c + j < MAXC) setRaw(sel.r + i, sel.c + j, v); }));
      sel.r2 = sel.r + rowsIn.length - 1; sel.c2 = sel.c + Math.max(...rowsIn.map(r => r.length)) - 1; draw(); queue();
    });
    fbar.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(sel.r, sel.c, fbar.value); go(1, 0); wrap.focus(); } else if (e.key === 'Escape') { fbar.value = raw(sel.r, sel.c); wrap.focus(); } });
    fbar.addEventListener('blur', () => { if (fbar.value !== raw(sel.r, sel.c)) commit(sel.r, sel.c, fbar.value); });
    $('#sx-title').addEventListener('input', queue);
    $('#sx-close').onclick = async () => { if (saveT) await flush(); o.close(); };
    $('#sx-del').onclick = () => o.del();
    $('#sx-csv').onclick = () => {
      const ev2 = evaluate(sh.grid), { r, c } = bounds(sh.grid), out = [];
      for (let i = 0; i < r; i++) { const row = []; for (let j = 0; j < c; j++) row.push(show(ev2.at(i, j))); out.push(row); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCSV(out)], { type: 'text/csv' })); a.download = ($('#sx-title').value.trim() || 'sheet') + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $('#sx-file').onchange = async e => { const f = e.target.files[0]; if (!f) return; sh.grid = fromCSV(await f.text()); sh.grid.forEach((row, r) => row.forEach((v, c) => dirty.add(r + ',' + c))); draw(); queue(); e.target.value = ''; };
    const askBox = $('#sx-ask'), askIn = $('#sx-ask-in');
    $('#sx-flint').onclick = () => { askBox.classList.toggle('hidden'); if (!askBox.classList.contains('hidden')) askIn.focus(); };
    const ask = async () => {
      const t = askIn.value.trim(); if (!t || !o.askFlint) return;
      const b = $('#sx-ask-go'); b.disabled = true; b.textContent = 'Flint is working…';
      try {
        const out = await o.askFlint(t, serialize(sh));
        if (out) { const next = parse(out); if (next.grid.length) { sh = next; sh.grid.forEach((row, r) => row.forEach((v, c) => dirty.add(r + ',' + c))); draw(); await flush(); askIn.value = ''; askBox.classList.add('hidden'); } }
      } finally { b.disabled = false; b.textContent = 'Ask'; }
    };
    $('#sx-ask-go').onclick = ask; askIn.onkeydown = e => { if (e.key === 'Enter') ask(); };
    draw(); setTimeout(() => wrap.focus(), 30);
    return {
      update(d) { if (saveT || editing || !d || d.version <= doc.version) return; doc = d; sh = parse(d.body); draw(); status(`Updated by ${o.nameOf ? o.nameOf(d.updatedBy) : 'a teammate'} · v${d.version}`); },
      flush: () => (saveT ? flush() : null), destroy() { clearTimeout(saveT); },
    };
  }

  window.TribeSheet = { parse, serialize, evaluate: g => { const e = evaluate(g); return (r, c) => show(e.at(r, c)); }, fromCSV, toCSV, mount };
})();
