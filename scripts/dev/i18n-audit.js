#!/usr/bin/env node
// Language audit (feat/languages). Walks the app in every language (app/test/e2e_i18n_audit.py --full does the
// walking, headless) and writes docs/I18N-REPORT.md: per language, what is still English, what is cut off, English
// dates, mixed sentences and Flint replies that stay English; plus checks on the tables and the website's files.
//
//   node scripts/dev/i18n-audit.js            walk, then write docs/I18N-REPORT.md (before = app/test/i18n_before.json)
//   node scripts/dev/i18n-audit.js --from f   build the report from an earlier walk's JSON (no browser)
//   node scripts/dev/i18n-audit.js --before   also save this walk's counts as the "before" column
//   node scripts/dev/i18n-audit.js --static   only the table and website checks; exits 1 when one fails
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? (process.argv[i + 1] || true) : null; };
const LANGS = ['es', 'pt', 'fr', 'de', 'ja', 'zh', 'ko'];
const NAMES = { es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', ja: 'Japanese', zh: 'Chinese', ko: 'Korean' };
const BEFORE = path.join(ROOT, 'app', 'test', 'i18n_before.json');

// ---- the tables, loaded the way the browser loads them
function loadTables() {
  const listeners = [];
  const win = { addEventListener: () => {}, dispatchEvent: () => {} };
  const doc = { body: null, documentElement: {}, addEventListener: (n, f) => listeners.push(f), createTreeWalker: () => ({ nextNode: () => null }) };
  const store = { getItem: () => 'en', setItem: () => {} };
  const ctx = { window: win, document: doc, localStorage: store, navigator: { language: 'en' }, NodeFilter: {}, MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; }, CustomEvent: function () {}, Intl, console };
  const vm = require('vm'); vm.createContext(ctx);
  for (const f of ['i18n.js', 'i18n-more.js']) { const p = path.join(ROOT, 'app', 'ui', f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
  return win.TribeI18n;
}

function staticChecks() {
  const out = { fails: [] };
  const src = fs.readFileSync(path.join(ROOT, 'app', 'ui', 'i18n.js'), 'utf8');
  const table = src.slice(src.indexOf('const D = {'), src.indexOf("const KEY = 'tribecode.lang';"));
  // Every row, wherever it sits on its line: a quoted key, a colon, a flat array of quoted cells. (A JS object keeps
  // only the last of two equal keys, so twice-defined keys can only be found in the source text.)
  const seen = new Map(); out.dupDiff = []; out.short = []; let rows = 0, repeats = 0, unread = 0;
  const STR = '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
  const ROW = new RegExp('(' + STR + ')\\s*:\\s*(\\[\\s*(?:' + STR + '\\s*,?\\s*)*\\])', 'g');
  const lit = s => { try { return new Function('return ' + s)(); } catch { return undefined; } };
  for (const m of table.matchAll(ROW)) {
    const k = lit(m[1]), cells = lit(m[2]);
    if (typeof k !== 'string' || !Array.isArray(cells)) { unread++; continue; }
    rows++;
    const val = JSON.stringify(cells);   // compare what the cells say, not how the row is spaced
    if (seen.has(k)) { repeats++; if (seen.get(k) !== val) out.dupDiff.push(k); }
    seen.set(k, val);
    if (cells.length !== 7 || cells.some(c => !c)) out.short.push(k);
  }
  out.rows = rows;
  // the check checks itself: what it read must be the whole table, or it says how much it missed
  let real = -1; try { const body = table.slice(table.indexOf('{'), table.lastIndexOf('};') + 1); real = Object.keys(new Function('return (' + body + ')')()).length; } catch (e) { out.fails.push('the table in app/ui/i18n.js could not be evaluated: ' + e.message); }
  out.tableKeys = real;
  if (real >= 0 && seen.size !== real) out.fails.push(`the static check read ${seen.size} of the table's ${real} keys (${unread} rows it could not parse): its duplicate and empty-cell results are incomplete`);
  // the extra file: every row has seven cells, placeholders survive translation
  const morePath = path.join(ROOT, 'app', 'ui', 'i18n-more.js'); out.moreRows = 0; out.badPlaceholders = [];
  if (fs.existsSync(morePath)) {
    const I = loadTables();
    const more = I._more ? I._more() : { rows: {}, patterns: {}, plurals: {} };
    const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
    for (const [kind, rowsOf] of Object.entries(more)) for (const [en, row] of Object.entries(rowsOf)) {
      out.moreRows++;
      if (!Array.isArray(row) || row.length !== 7 || row.some(c => !c)) { out.short.push(en); continue; }
      row.forEach((c, i) => { const cells = typeof c === 'string' ? [c] : Object.values(c); if (cells.some(x => ph(x) !== ph(en) && kind !== 'plurals')) out.badPlaceholders.push(`${LANGS[i]}: ${en}`); });
    }
  }
  // the website: every language file has the same keys
  const langDir = path.join(ROOT, 'site', 'lang'); out.site = {};
  const files = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(langDir, l + '.json'), 'utf8'))]));
  const all = new Set(); Object.values(files).forEach(d => Object.keys(d).forEach(k => all.add(k)));
  for (const l of LANGS) { const d = files[l]; out.site[l] = { keys: Object.keys(d).length, missing: [...all].filter(k => !(k in d) || !d[k]), same: Object.keys(d).filter(k => d[k] === k && /\p{L}{4,}/u.test(k)).length }; }
  out.siteKeys = all.size;
  if (out.dupDiff.length) out.fails.push(`${out.dupDiff.length} keys appear twice with different translations: ${out.dupDiff.slice(0, 5).join(' | ')}`);
  if (out.short.length) out.fails.push(`${out.short.length} rows without seven filled cells: ${out.short.slice(0, 5).join(' | ')}`);
  if (out.badPlaceholders.length) out.fails.push(`${out.badPlaceholders.length} translations lost a {placeholder}: ${out.badPlaceholders.slice(0, 5).join(' | ')}`);
  for (const l of LANGS) if (out.site[l].missing.length) out.fails.push(`site/lang/${l}.json misses ${out.site[l].missing.length} keys: ${out.site[l].missing.slice(0, 3).join(' | ')}`);
  return out;
}

function counts(res) {
  const c = {};
  for (const l of LANGS) {
    const L = (res.langs || {})[l]; if (!L) continue;
    const d = L.desktop || {}, p = L.phone || null;
    c[l] = { untranslated: (d.untranslated || []).length, attrs: (d.attrs || []).length, overflow: (d.overflow || []).length, dates: (d.dates || []).length, mixed: (d.mixed || []).length,
      flint: L.flint_english ? L.flint_english.length : null, flintAsked: L.flint_asked || 0,
      phoneUntranslated: p ? p.untranslated.length : null, phoneOverflow: p ? p.overflow.length : null };
  }
  return c;
}

function report(res, st, before) {
  const now = counts(res), L = [];
  const cell = (b, a) => (b === undefined || b === null ? `${a === null || a === undefined ? '–' : a}` : `${b} → ${a === null || a === undefined ? '–' : a}`);
  const col = (k) => LANGS.map(l => cell(before && before[l] ? before[l][k] : null, now[l] ? now[l][k] : null)).join(' | ');
  L.push('# Language report', '');
  L.push('Written by `node scripts/dev/i18n-audit.js`. It walks ' + (res.routes || '?') + ' places of the app (main sections, every Settings tab, Help, Guide, Next step, Publish, Versions, Company, Design, the website builder, the common sheets) in each language at 1280, and German and Japanese again at 390. Numbers are `before → after` for this pass; a single number means no "before" was recorded.', '');
  L.push('## The app, per language', '');
  L.push('| What | ' + LANGS.map(l => NAMES[l]).join(' | ') + ' |', '|---|' + LANGS.map(() => '---').join('|') + '|');
  L.push('| Visible strings still English | ' + col('untranslated') + ' |');
  L.push('| Placeholders, tooltips, labels still English | ' + col('attrs') + ' |');
  L.push('| Text cut off or off-screen (not so in English) | ' + col('overflow') + ' |');
  L.push('| English dates and times | ' + col('dates') + ' |');
  L.push('| Mixed sentences (CJK with English words) | ' + col('mixed') + ' |');
  L.push('| Flint replies that stay English (of ' + ((now.ja || {}).flintAsked || '?') + ' asked) | ' + col('flint') + ' |');
  L.push('| Phone 390: still English | ' + col('phoneUntranslated') + ' |');
  L.push('| Phone 390: cut off | ' + col('phoneOverflow') + ' |', '');
  L.push('## The tables', '');
  L.push('| Check | Result |', '|---|---|');
  L.push(`| Rows in the exact-text table (app/ui/i18n.js) | ${st.rows} |`);
  L.push(`| Rows, patterns and plurals in app/ui/i18n-more.js | ${st.moreRows} |`);
  L.push(`| Keys present twice with different translations | ${st.dupDiff.length} |`);
  L.push(`| Rows without seven filled cells | ${st.short.length} |`);
  L.push(`| Translations that lost a {placeholder} | ${st.badPlaceholders.length} |`, '');
  L.push('## The website (site/lang/*.json)', '');
  L.push('| | ' + LANGS.map(l => NAMES[l]).join(' | ') + ' |', '|---|' + LANGS.map(() => '---').join('|') + '|');
  L.push('| Keys | ' + LANGS.map(l => st.site[l].keys).join(' | ') + ' |');
  L.push('| Missing (of ' + st.siteKeys + ') | ' + LANGS.map(l => st.site[l].missing.length).join(' | ') + ' |');
  L.push('| Same as English | ' + LANGS.map(l => st.site[l].same).join(' | ') + ' |', '');
  const extra = path.join(ROOT, 'docs', 'I18N-REPORT-NOTES.md');
  if (fs.existsSync(extra)) L.push(fs.readFileSync(extra, 'utf8').trim(), '');
  L.push('## What is still English, by place (German, 1280; first 60)', '');
  const de = ((res.langs || {}).de || {}).desktop;
  if (de) { const by = {}; de.untranslated.forEach(t => { const w = (de.where || {})[t] || '?'; (by[w] = by[w] || []).push(t); });
    L.push('| Place | Count | Examples |', '|---|---|---|'); let n = 0;
    Object.entries(by).sort((a, b) => b[1].length - a[1].length).forEach(([w, a]) => { if (n > 60) return; n += a.length; L.push(`| ${w} | ${a.length} | ${a.slice(0, 3).map(s => s.slice(0, 50).replace(/\|/g, '/')).join(' · ')} |`); }); }
  L.push('');
  return L.join('\n');
}

const st = staticChecks();
if (process.argv.includes('--static')) {
  if (st.fails.length) { console.error('i18n static checks failed:\n  ' + st.fails.join('\n  ')); process.exit(1); }
  console.log(`i18n static checks: ok (${st.rows} + ${st.moreRows} rows, website ${st.siteKeys} keys × 7)`); process.exit(0);
}
let from = arg('--from');
if (!from || from === true) {
  from = path.join(os.tmpdir(), `tribe-i18n-audit-${process.pid}.json`);
  const r = spawnSync('python3', [path.join(ROOT, 'app', 'test', 'e2e_i18n_audit.py'), '--full', '--json', from], { stdio: 'inherit', env: { ...process.env, TRIBE_NO_DOWNLOAD: '1' } });
  if (!fs.existsSync(from)) { console.error('the walk did not finish'); process.exit(r.status || 1); }
}
const res = JSON.parse(fs.readFileSync(from, 'utf8'));
if (process.argv.includes('--before')) { fs.writeFileSync(BEFORE, JSON.stringify(counts(res), null, 1) + '\n'); console.log('saved the before column'); }
const before = fs.existsSync(BEFORE) ? JSON.parse(fs.readFileSync(BEFORE, 'utf8')) : null;
fs.writeFileSync(path.join(ROOT, 'docs', 'I18N-REPORT.md'), report(res, st, before));
console.log('wrote docs/I18N-REPORT.md');
if (st.fails.length) console.log('static checks:\n  ' + st.fails.join('\n  '));
