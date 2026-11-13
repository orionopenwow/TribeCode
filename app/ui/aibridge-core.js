// The AI bridge's logic (feat/agents-free), no DOM, no dependencies: it runs in the browser (window.TribeBridgeCore)
// and in Node (app/test/aibridge_core_test.js). The UI is app/ui/aibridge.js.
//
//   PROVIDERS                                  the free AI chats (name, url, a short how-to, a soft paste budget)
//   strip(text) -> { text, found: [kind] }     takes anything that looks like a key, token or password out
//   pack(o) -> { text, removed, chars, tokens } the context pack: goal, constraints, the strict reply format, the files
//   split(text, max) -> [part]                 a pack too big for a free chat, in numbered parts
//   parse(reply) -> { files, notes, site, html } fenced blocks with paths, unified diffs, whole files, a site config
//   hunks(old, new) -> [hunk]                  line diff in hunks (3 lines of context) for the preview
//   applyHunks(old, hunks, keep) -> text       only the accepted hunks
//   patch(old, diffHunks) -> { text, failed }  applies a unified diff's hunks (tolerant of shifted lines)
//   risks(changes) -> [{ kind, text, path }]   installs, network calls, eval, secrets, many deletions, odd paths
//   pdf(text, title) -> Uint8Array             a plain text PDF (Courier), no dependencies
//   pdfText(bytes, inflate?) -> Promise<string> the text of a simple PDF (our own, and most plain ones)
(function (root) {
  'use strict';

  const PROVIDERS = [
    { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', budget: 30000, how: 'Free with an account. Paste the pack, or attach the PDF or TXT with the paperclip.' },
    { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/', budget: 60000, how: 'Free with a Google account. Takes long pastes and PDF uploads.' },
    { id: 'claude', name: 'Claude', url: 'https://claude.ai/', budget: 40000, how: 'Free plan. Long pastes turn into an attachment by themselves.' },
    { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/', budget: 12000, how: 'Free with a Microsoft account. Shorter messages: use Split into parts.' },
    { id: 'mistral', name: 'Le Chat', url: 'https://chat.mistral.ai/', budget: 30000, how: 'Mistral\'s free chat. Paste the pack or attach the TXT.' },
  ];
  const byId = id => PROVIDERS.find(p => p.id === id) || null;

  // ---------- secrets: never in a pack that leaves this computer ----------
  const SECRETS = [
    ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
    ['an Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{16,}/g],
    ['an OpenAI key', /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}/g],
    ['a Stripe key', /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g],
    ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
    ['an AWS key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['a Google key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
    ['a Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
    ['a TribeCode key', /\btc_[A-Za-z0-9_-]{20,}/g],
    ['a web token', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
    ['a bearer token', /(\bBearer\s+)[A-Za-z0-9._~+/-]{20,}=*/g],
    ['a password or key in the code', /((?:api[_-]?key|apikey|secret|token|passw(?:or)?d|pwd|auth|client[_-]?secret|access[_-]?key)["']?\s*[:=]\s*)(["'`])([^"'`\s]{6,})\2/gi],
    ['a password or key in a config', /^((?:[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD))\s*=\s*)([^\s#]{6,})$/gm],
    ['a link with a password', /\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]{3,})(@)/gi],
  ];
  const MARK = '[REMOVED: secret]';
  function strip(text) {
    let t = String(text == null ? '' : text); const found = [];
    for (const [kind, rx] of SECRETS) {
      rx.lastIndex = 0;
      t = t.replace(rx, (...m) => {
        found.push(kind);
        if (kind === 'a bearer token') return m[1] + MARK;
        if (kind === 'a password or key in the code') return m[1] + m[2] + MARK + m[2];
        if (kind === 'a password or key in a config') return m[1] + MARK;
        if (kind === 'a link with a password') return m[1] + MARK + m[3];
        return MARK;
      });
    }
    return { text: t, found };
  }
  const SECRET_FILE = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|secrets?\.(json|ya?ml|toml)|credentials.*)$/i;

  // ---------- the context pack ----------
  const LANG = { js: 'js', mjs: 'js', cjs: 'js', ts: 'ts', html: 'html', htm: 'html', css: 'css', json: 'json', md: 'md', py: 'python', sh: 'bash', svg: 'svg', txt: 'text', yml: 'yaml', yaml: 'yaml', toml: 'toml' };
  const langOf = p => LANG[String(p || '').split('.').pop().toLowerCase()] || '';
  const fenceFor = t => { let f = '```'; while (String(t).includes(f)) f += '`'; return f; };
  const FORMAT = [
    '## How to reply (strict)',
    'Reply with code only in fenced blocks, and put the file path in the fence info, like this:',
    '',
    '```js path=src/game.js',
    '// the whole new file, every line',
    '```',
    '',
    'For a small change in a big file you may send a unified diff instead, one per file:',
    '',
    '```diff path=src/game.js',
    '--- a/src/game.js',
    '+++ b/src/game.js',
    '@@ -10,3 +10,4 @@',
    ' unchanged line',
    '-old line',
    '+new line',
    '```',
    '',
    'Rules: one block per file; a whole file has every line (never "..." or "rest stays the same"); new files are whole files;',
    'no install commands, no new packages, no secrets. Keep any explanation to three short lines after the code.',
  ].join('\n');
  function pack(o = {}) {
    const files = (o.files || []).filter(f => f && f.path && !SECRET_FILE.test(f.path));
    const skipped = (o.files || []).filter(f => f && f.path && SECRET_FILE.test(f.path)).map(f => f.path);
    const out = ['# TribeCode context pack', ''];
    out.push(`GOAL: ${String(o.goal || 'Help me with the files below.').trim().replace(/\s+/g, ' ')}`);
    if (o.project) out.push(`PROJECT: ${o.project}`);
    out.push('', '## Constraints',
      `- Stack: ${o.stack || 'plain HTML, CSS and JavaScript in the browser'}. No npm packages, no frameworks, no CDNs, no build step.`,
      '- Change only what the goal needs; keep the existing style, names and file layout.',
      '- Do not add network calls, eval or new dependencies unless the goal asks for them.');
    (o.constraints || []).forEach(c => out.push('- ' + c));
    out.push('', FORMAT);
    const ctx = [];
    if (o.task) ctx.push(['Task', o.task]);
    if (o.error) ctx.push(['Error from the preview', o.error]);
    if (o.doc) ctx.push([`Doc${o.docTitle ? ': ' + o.docTitle : ''}`, o.doc]);
    if (ctx.length) { out.push('', '## Context'); ctx.forEach(([h, t]) => { const f = fenceFor(t); out.push('', `### ${h}`, f + 'text', String(t).trim(), f); }); }
    if (o.site) { const t = typeof o.site === 'string' ? o.site : JSON.stringify(o.site, null, 1); const f = fenceFor(t); out.push('', '## Website config (site.json)', 'Reply with the whole changed config in one block: ```json path=site.json', '', f + 'json path=site.json', t, f); }
    if (files.length) {
      out.push('', `## Files (${files.length})`);
      files.forEach(fl => { const t = String(fl.text == null ? '' : fl.text).replace(/\n$/, ''); const f = fenceFor(t); out.push('', `### ${fl.path}`, `${f}${langOf(fl.path)} path=${fl.path}`, t, f); });
    }
    if (skipped.length) out.push('', `(Left out on purpose, they hold secrets: ${skipped.join(', ')})`);
    out.push('', 'Answer in the reply format above.');
    const s = strip(out.join('\n'));
    return { text: s.text, removed: s.found, skipped, chars: s.text.length, tokens: Math.ceil(s.text.length / 4) };
  }
  function split(text, max) {
    max = Math.max(2000, max | 0 || 12000);
    if (text.length <= max) return [text];
    const room = max - 400, lines = text.split('\n'), chunks = []; let cur = '';
    for (const ln of lines) {
      if ((cur + ln + '\n').length > room && cur) { chunks.push(cur); cur = ''; }
      if (ln.length > room) { for (let i = 0; i < ln.length; i += room) chunks.push(ln.slice(i, i + room) + '\n'); continue; }
      cur += ln + '\n';
    }
    if (cur) chunks.push(cur);
    const n = chunks.length;
    return chunks.map((c, i) => i < n - 1
      ? `[Part ${i + 1} of ${n}. Do not answer yet: reply only "ok, send part ${i + 2}".]\n\n${c}\n[End of part ${i + 1} of ${n}.]`
      : `[Part ${n} of ${n}, the last one. Now answer the GOAL from part 1, in the reply format it gives.]\n\n${c}`);
  }

  // ---------- reading the reply ----------
  const cleanPath = p => {
    p = String(p || '').trim().replace(/^["'`*(<\[]+|["'`*)>\]:,]+$/g, '').replace(/^\.\//, '').replace(/^[ab]\//, '').replace(/\\/g, '/');
    if (!p || p === '/dev/null' || /\s/.test(p) || !/[A-Za-z0-9]/.test(p) || p.length > 200) return '';
    if (!/\.[A-Za-z0-9]{1,8}$/.test(p) && !/(^|\/)(Makefile|Dockerfile|LICENSE|README)$/.test(p)) return '';
    return p;
  };
  const PATH_IN_INFO = /(?:^|\s)(?:path|file|filename|title)\s*[=:]\s*["']?([^\s"']+)/i;
  const PATH_LINE = /^\s*(?:#{1,6}\s*|\*\*|__|`|File:\s*|Path:\s*|\/\/\s*|<!--\s*|\/\*\s*|--\s*)?(?:file(?:name)?:\s*|path:\s*)?`?([\w./@-]+\.[A-Za-z0-9]{1,8})`?(?:\*\*|__)?\s*(?:\(.*\))?:?\s*(?:-->|\*\/)?\s*$/i;
  const COMMENT_PATH = /^\s*(?:\/\/|#|<!--|\/\*|--)\s*(?:file(?:name)?:\s*|path:\s*)?([\w./@-]+\.[A-Za-z0-9]{1,8})\s*(?:-->|\*\/)?\s*$/i;
  function blocks(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n'), out = [], prose = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s{0,3}(`{3,}|~{3,})\s*([^`]*)$/);
      if (!m) { prose.push(lines[i]); continue; }
      const fence = m[1], info = m[2].trim(), body = [];
      let j = i + 1; for (; j < lines.length; j++) { const c = lines[j].match(/^\s{0,3}(`{3,}|~{3,})\s*$/); if (c && c[1][0] === fence[0] && c[1].length >= fence.length) break; body.push(lines[j]); }
      let before = ''; for (let k = prose.length - 1; k >= 0 && k >= prose.length - 3; k--) { if (prose[k].trim()) { before = prose[k]; break; } }
      out.push({ info, body: body.join('\n'), before, closed: j < lines.length });
      prose.push(`[code block ${out.length}]`);
      i = j;
    }
    return { blocks: out, prose: prose.join('\n') };
  }
  // a unified diff (one or several files)
  function parseDiff(text, fallbackPath) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n'), files = []; let cur = null, h = null;
    const start = p => { cur = { path: p, hunks: [], isNew: false, isDelete: false }; files.push(cur); h = null; };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (/^diff --git /.test(ln)) { const m = ln.match(/ b\/(\S+)\s*$/); start(cleanPath(m ? m[1] : '') || fallbackPath || ''); continue; }
      if (/^--- /.test(ln) && /^\+\+\+ /.test(lines[i + 1] || '')) {
        const a = ln.slice(4).split('\t')[0].trim(), b = lines[i + 1].slice(4).split('\t')[0].trim();
        const p = cleanPath(b) || cleanPath(a) || fallbackPath || '';
        if (!cur || cur.hunks.length || (cur.path && p && cur.path !== p)) start(p); else cur.path = p || cur.path;
        cur.isNew = a === '/dev/null'; cur.isDelete = b === '/dev/null';
        i++; continue;
      }
      const hm = ln.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hm) { if (!cur) start(fallbackPath || ''); h = { oldStart: +hm[1], oldLines: hm[2] == null ? 1 : +hm[2], newStart: +hm[3], newLines: hm[4] == null ? 1 : +hm[4], lines: [] }; cur.hunks.push(h); continue; }
      if (/^@@\s*@@?\s*$/.test(ln) || /^@@ /.test(ln)) { if (!cur) start(fallbackPath || ''); h = { oldStart: 0, oldLines: 0, newStart: 0, newLines: 0, lines: [], loose: true }; cur.hunks.push(h); continue; }
      if (h && /^[ +-]/.test(ln)) { h.lines.push(ln); continue; }
      if (h && ln === '') { h.lines.push(' '); continue; }
      if (/^\\ No newline/.test(ln)) continue;
    }
    files.forEach(f => f.hunks.forEach(x => { while (x.lines.length && x.lines[x.lines.length - 1] === ' ') x.lines.pop(); }));
    return files.filter(f => f.hunks.length || f.isDelete);
  }
  const looksDiff = t => /^(?:--- \S.*\n\+\+\+ \S|diff --git |@@ -\d)/m.test(t) && /^[+-]/m.test(t);
  function parse(reply) {
    const text = String(reply == null ? '' : reply);
    const out = { files: [], notes: '', site: null, html: null, problems: [] };
    if (!text.trim()) { out.problems.push('The answer is empty.'); return out; }
    const { blocks: bs, prose } = blocks(text);
    out.notes = prose.replace(/\[code block \d+\]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200);
    const add = f => { const old = out.files.findIndex(x => x.path === f.path); if (old >= 0) out.files.splice(old, 1); out.files.push(f); };
    let unnamed = 0;
    bs.forEach(b => {
      const lang = (b.info.split(/\s+/)[0] || '').replace(/[{}]/g, '').toLowerCase();
      let p = cleanPath((b.info.match(PATH_IN_INFO) || [])[1]);
      if (!p && /[:]/.test(lang)) p = cleanPath(lang.split(':').slice(1).join(':'));
      if (!p && lang && /\.[a-z0-9]{1,8}$/i.test(lang) && lang.includes('.')) p = cleanPath(b.info.split(/\s+/)[0]);
      if (!p) { const tok = b.info.split(/\s+/)[1]; if (tok) p = cleanPath(tok); }
      let body = b.body;
      if (!p) { const first = body.split('\n')[0] || ''; const cm = first.match(COMMENT_PATH); if (cm && cleanPath(cm[1])) { p = cleanPath(cm[1]); if (!/^(diff|patch)$/.test(lang)) body = body.split('\n').slice(1).join('\n'); } }
      if (!p && b.before) { const bm = b.before.match(PATH_LINE); if (bm) p = cleanPath(bm[1]); }
      if (lang === 'diff' || lang === 'patch' || looksDiff(body)) {
        const ds = parseDiff(body, p);
        if (!ds.length) { out.problems.push(`A diff${p ? ' for ' + p : ''} had no changes I could read.`); return; }
        ds.forEach(d => { if (!d.path) { unnamed++; return; } add({ path: d.path, kind: d.isDelete ? 'delete' : 'diff', hunks: d.hunks, isNew: d.isNew }); });
        return;
      }
      if (!p) {
        const t = body.trim();
        if (/^[{[]/.test(t) && (lang === 'json' || !lang)) { try { const j = JSON.parse(t); if (j && j.pages) { out.site = j; return; } } catch {} }
        if (/^(<!doctype html|<html)/i.test(t)) { out.html = t; return; }
        if (t.length > 40) unnamed++;
        return;
      }
      if (p === 'site.json' || /(^|\/)site(-config)?\.json$/.test(p)) { try { const j = JSON.parse(body); if (j && j.pages) out.site = j; } catch {} }
      if (b.closed === false) out.problems.push(`The block for ${p} was cut off before its end. Ask the AI to "continue" and paste the rest.`);
      add({ path: p, kind: 'full', text: body.replace(/\n?$/, '\n'), lang });
    });
    if (!bs.length && looksDiff(text)) parseDiff(text, '').forEach(d => d.path ? add({ path: d.path, kind: d.isDelete ? 'delete' : 'diff', hunks: d.hunks, isNew: d.isNew }) : unnamed++);
    if (!bs.length && !out.files.length) {
      const t = text.trim();
      if (/^[{[]/.test(t)) { try { const j = JSON.parse(t); if (j && j.pages) out.site = j; } catch {} }
      if (!out.site && /^(<!doctype html|<html)/i.test(t)) out.html = t;
    }
    if (unnamed) out.problems.push(`${unnamed} code block${unnamed === 1 ? ' has' : 's have'} no file path, so I left ${unnamed === 1 ? 'it' : 'them'} out. Ask the AI to put the path in the fence, like \`\`\`js path=src/game.js.`);
    if (!out.files.length && !out.site && !out.html) out.problems.unshift('I could not find any files in that answer.');
    return out;
  }

  // ---------- diffs ----------
  const L = t => { const s = String(t == null ? '' : t); if (!s) return []; const a = s.split('\n'); if (a[a.length - 1] === '') a.pop(); return a; };
  // line diff -> ops [{ t: ' ' | '-' | '+', s }]: common ends trimmed, LCS on the middle (a full rewrite past 6M cells)
  function ops(a, b) {
    let pre = 0; while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    let suf = 0; while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    const A = a.slice(pre, a.length - suf), Bm = b.slice(pre, b.length - suf), n = A.length, m = Bm.length, mid = [];
    if (n * m > 6e6) { A.forEach(s => mid.push({ t: '-', s })); Bm.forEach(s => mid.push({ t: '+', s })); }
    else {
      const T = new Uint32Array((n + 1) * (m + 1)), W = m + 1;
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * W + j] = A[i] === Bm[j] ? T[(i + 1) * W + j + 1] + 1 : Math.max(T[(i + 1) * W + j], T[i * W + j + 1]);
      let i = 0, j = 0;
      while (i < n && j < m) { if (A[i] === Bm[j]) { mid.push({ t: ' ', s: A[i] }); i++; j++; } else if (T[(i + 1) * W + j] >= T[i * W + j + 1]) mid.push({ t: '-', s: A[i++] }); else mid.push({ t: '+', s: Bm[j++] }); }
      while (i < n) mid.push({ t: '-', s: A[i++] }); while (j < m) mid.push({ t: '+', s: Bm[j++] });
    }
    return [...a.slice(0, pre).map(s => ({ t: ' ', s })), ...mid, ...a.slice(a.length - suf).map(s => ({ t: ' ', s }))];
  }
  function hunks(oldText, newText, ctx = 3) {
    const o = ops(L(oldText), L(newText)), out = [];
    let i = 0, oi = 0, ni = 0;
    const pos = []; o.forEach(op => { pos.push([oi, ni]); if (op.t !== '+') oi++; if (op.t !== '-') ni++; });
    while (i < o.length) {
      if (o[i].t === ' ') { i++; continue; }
      let s = Math.max(0, i - ctx), e = i;
      while (e < o.length) { if (o[e].t !== ' ') { e++; continue; } let r = e; while (r < o.length && o[r].t === ' ') r++; if (r - e > ctx * 2 || r === o.length) { e = Math.min(o.length, e + ctx); break; } e = r; }
      const seg = o.slice(s, e), [os, ns] = pos[s];
      out.push({ oldStart: os + 1, newStart: ns + 1, oldLines: seg.filter(x => x.t !== '+').length, newLines: seg.filter(x => x.t !== '-').length, lines: seg.map(x => x.t + x.s), add: seg.filter(x => x.t === '+').length, del: seg.filter(x => x.t === '-').length });
      i = e;
    }
    return out;
  }
  // apply only the hunks whose index is in keep (a Set); hunks come from hunks(old, new) so their positions are exact
  function applyHunks(oldText, hs, keep) {
    const a = L(oldText), out = []; let at = 0;
    hs.forEach((h, idx) => {
      const start = h.oldStart - 1;
      while (at < start) out.push(a[at++]);
      if (keep && !keep.has(idx)) { const n = h.lines.filter(x => x[0] !== '+').length; for (let k = 0; k < n; k++) out.push(a[at++]); return; }
      h.lines.forEach(x => { if (x[0] === '+') out.push(x.slice(1)); else if (x[0] === ' ') out.push(a[at++]); else at++; });
    });
    while (at < a.length) out.push(a[at++]);
    const trail = /\n$/.test(String(oldText)) || !oldText;
    return out.join('\n') + (out.length && trail ? '\n' : '');
  }
  // a unified diff from an AI: line numbers are often off, so each hunk is found by its old lines near where it says
  function patch(oldText, diffHunks) {
    let a = L(oldText); const failed = [];
    const norm = s => s.replace(/\s+$/, '');
    let shift = 0;
    diffHunks.forEach((h, idx) => {
      const oldL = h.lines.filter(x => x[0] !== '+').map(x => x.slice(1)), newL = h.lines.filter(x => x[0] !== '-').map(x => x.slice(1));
      const want = Math.max(0, (h.oldStart || 1) - 1 + shift);
      const match = (at, f) => oldL.every((s, k) => a[at + k] !== undefined && f(a[at + k]) === f(s));
      let found = -1;
      if (!oldL.length) found = Math.min(a.length, h.oldStart ? want : a.length);
      for (const f of [x => x, norm, x => x.trim()]) {
        if (found >= 0) break;
        for (let d = 0; d <= a.length; d++) { if (want - d >= 0 && match(want - d, f)) { found = want - d; break; } if (want + d <= a.length - oldL.length && match(want + d, f)) { found = want + d; break; } if (want - d < 0 && want + d > a.length) break; }
      }
      if (found < 0) { failed.push(idx); return; }
      a = [...a.slice(0, found), ...newL, ...a.slice(found + oldL.length)];
      shift += newL.length - oldL.length;
    });
    const trail = /\n$/.test(String(oldText)) || !oldText;
    return { text: a.join('\n') + (a.length && trail ? '\n' : ''), failed };
  }

  // ---------- safety ----------
  const RISK = [
    ['install', 'installs a package', /\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\b|\bpip3?\s+install\b|\bcargo\s+add\b|\bbrew\s+install\b|\bapt(?:-get)?\s+install\b/],
    ['install', 'loads code from another site', /<script[^>]+src=["']?https?:\/\/|import\s+[^;]*from\s+["']https?:\/\/|@import\s+url\(["']?https?:\/\//],
    ['network', 'makes network calls', /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\s*\(|\bnavigator\.sendBeacon\b|\bEventSource\s*\(|\$\.(?:ajax|get|post)\s*\(|\baxios\b/],
    ['eval', 'runs text as code (eval)', /\beval\s*\(|\bnew\s+Function\s*\(|\bset(?:Timeout|Interval)\s*\(\s*["'`]|\bdocument\.write\s*\(/],
    ['shell', 'runs commands on the computer', /\bchild_process\b|\bexecSync\s*\(|\bspawn\s*\(|\bos\.system\s*\(|\bsubprocess\b|\brm\s+-rf\b/],
  ];
  function risks(changes) {
    const out = [], seen = new Set(), put = (kind, text, path) => { const k = kind + '|' + path; if (seen.has(k)) return; seen.add(k); out.push({ kind, text, path }); };
    let deletes = 0;
    (changes || []).forEach(c => {
      const added = c.added != null ? c.added : (c.lines || []).filter(x => x[0] === '+').map(x => x.slice(1)).join('\n');
      const oldT = c.old || '';
      if (!cleanPath(c.path) || /(^|\/)\.\.(\/|$)|^\//.test(c.path)) put('path', 'has a path outside the project', c.path);
      if (/(^|\/)package(-lock)?\.json$|(^|\/)requirements\.txt$|(^|\/)Cargo\.toml$/.test(c.path)) put('install', 'changes the package list', c.path);
      if (SECRET_FILE.test(c.path)) put('secret', 'writes a file meant for secrets', c.path);
      RISK.forEach(([kind, text, rx]) => { if (rx.test(added) && !rx.test(oldT)) put(kind, text, c.path); });
      if (strip(added).found.length) put('secret', 'contains something that looks like a key or password', c.path);
      if (c.kind === 'delete' || (c.new === '' && oldT)) { deletes++; put('delete', 'deletes the file', c.path); }
      else { const o = L(oldT).length, gone = c.del || 0; if (o >= 20 && gone / o > 0.6 && (c.add || 0) < gone / 3) put('delete', `removes ${gone} of ${o} lines`, c.path); }
    });
    if (deletes >= 3) out.unshift({ kind: 'delete', text: `deletes ${deletes} files`, path: '' });
    return out;
  }

  // ---------- PDF out: Courier text pages, WinAnsi, no compression ----------
  function pdf(text, title) {
    const W = 612, H = 792, M = 48, size = 8.5, lead = 10.5, cols = Math.floor((W - 2 * M) / (size * 0.6)), rows = Math.floor((H - 2 * M - 24) / lead);
    const wrap = []; String(text).replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n').forEach(ln => { if (!ln) return wrap.push(''); for (let i = 0; i < ln.length; i += cols) wrap.push(ln.slice(i, i + cols)); });
    const pages = []; for (let i = 0; i < Math.max(1, wrap.length); i += rows) pages.push(wrap.slice(i, i + rows));
    const esc = s => s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
    const objs = [];   // index = object number - 1
    const add = s => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>'); add('');   // 2: pages, filled in below
    const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
    const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    pages.forEach((pg, n) => {
      const head = `${title || 'TribeCode context pack'}  -  page ${n + 1} of ${pages.length}`;
      const body = [`BT /F2 9 Tf ${M} ${H - M} Td (${esc(head)}) Tj ET`, `BT /F1 ${size} Tf ${lead} TL ${M} ${H - M - 24} Td`, ...pg.map((l, i) => (i ? 'T* ' : '') + `(${esc(l)}) Tj`), 'ET'].join('\n');
      const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${c} 0 R >>`));
    });
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = s.length;
    s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
    const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return b;
  }
  // ---------- PDF in: text from content streams (Tj, TJ, ', ") ----------
  async function pdfText(bytes, inflate) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let raw = ''; for (let i = 0; i < b.length; i += 8192) raw += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    if (!/^%PDF-/.test(raw.slice(0, 1024).trimStart())) throw new Error('not a PDF');
    const out = []; const rx = /<<([\s\S]*?)>>\s*stream\r?\n/g; let m;
    while ((m = rx.exec(raw))) {
      const dict = m[1], startAt = m.index + m[0].length, end = raw.indexOf('endstream', startAt); if (end < 0) break;
      let data = raw.slice(startAt, end).replace(/\r?\n$/, '');
      if (/\/Subtype\s*\/Image|\/Type\s*\/XObject|\/Length1|\/FontFile/.test(dict)) continue;
      if (/\/FlateDecode/.test(dict)) {
        if (!inflate) continue;
        try { const u = await inflate(Uint8Array.from(data, c => c.charCodeAt(0))); data = ''; for (let k = 0; k < u.length; k += 8192) data += String.fromCharCode.apply(null, u.subarray(k, k + 8192)); } catch { continue; }
      } else if (/\/Filter/.test(dict)) continue;
      if (!/(Tj|TJ|')(\s|$)/.test(data)) continue;
      out.push(textOps(data));
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function textOps(s) {
    let out = '', i = 0;
    const str = () => { let d = 0, r = ''; i++; for (; i < s.length; i++) { const c = s[i]; if (c === '\\') { const n = s[++i]; if (n === 'n') r += '\n'; else if (n === 'r') r += ''; else if (n === 't') r += '\t'; else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; r += String.fromCharCode(parseInt(o, 8)); } else if (n !== '\n') r += n; continue; } if (c === '(') d++; if (c === ')') { if (!d) break; d--; } r += c; } i++; return r; };
    const hex = () => { const e = s.indexOf('>', i); const h = s.slice(i + 1, e).replace(/\s+/g, ''); i = e + 1; let r = ''; for (let k = 0; k < h.length; k += 2) r += String.fromCharCode(parseInt(h.substr(k, 2).padEnd(2, '0'), 16)); return r; };
    let pend = '';
    while (i < s.length) {
      const c = s[i];
      if (c === '(') { pend += str(); continue; }
      if (c === '<' && s[i + 1] !== '<') { pend += hex(); continue; }
      if (c === '[') { i++; continue; }
      if (c === ']') { i++; continue; }
      const w = s.slice(i).match(/^[A-Za-z'"*]+/);
      if (w) {
        const op = w[0]; i += op.length;
        if (op === 'Tj' || op === 'TJ') { out += pend; pend = ''; }
        else if (op === "'" || op === '"') { out += '\n' + pend; pend = ''; }
        else if (op === 'T*' || op === 'Td' || op === 'TD' || op === 'ET') { if (!out.endsWith('\n')) out += '\n'; pend = ''; }
        else pend = pend && op === 'Tf' ? '' : pend;
        continue;
      }
      if (/\d|-|\./.test(c) && pend && s.slice(i).match(/^-?\d*\.?\d+/)) { const n = s.slice(i).match(/^-?\d*\.?\d+/)[0]; if (+n < -200) pend += ' '; i += n.length; continue; }
      i++;
    }
    return out;
  }

  const api = { PROVIDERS, byId, strip, pack, split, parse, parseDiff, hunks, applyHunks, patch, risks, pdf, pdfText, langOf, SECRET_FILE, MARK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TribeBridgeCore = api;
})(typeof window !== 'undefined' ? window : null);
