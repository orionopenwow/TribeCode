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
// TRIBE_I18N_ROOT: read another checkout's tables (the "before" column is the starting commit, unpacked elsewhere)
const APP = process.env.TRIBE_I18N_ROOT ? path.resolve(process.env.TRIBE_I18N_ROOT) : ROOT;
const arg =k => { const i = process.argv.indexOf(k); return i > 0 ? (process.argv[i + 1] || true) : null; };
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
  for (const f of ['i18n.js', 'i18n-more.js']) { const p = path.join(APP, 'app', 'ui', f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); }
  return win.TribeI18n;
}

function staticChecks() {
  const out = { fails: [] };
  const src = fs.readFileSync(path.join(APP, 'app', 'ui', 'i18n.js'), 'utf8');
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
  out.rows = rows; out.repeats = repeats;   // repeats: rows whose key is defined again further down (dead text)
  // the check checks itself: what it read must be the whole table, or it says how much it missed
  let real = -1; try { const body = table.slice(table.indexOf('{'), table.lastIndexOf('};') + 1); real = Object.keys(new Function('return (' + body + ')')()).length; } catch (e) { out.fails.push('the table in app/ui/i18n.js could not be evaluated: ' + e.message); }
  out.tableKeys = real;
  // rows whose translation IS the English ("Chat" in Spanish, "Design" in French): translated on purpose, so the walk
  // must not count them as still English. Per language, from the table as the app evaluates it.
  out.same = Object.fromEntries(LANGS.map(l => [l, []]));
  for (const [k, val] of seen) { const cells = JSON.parse(val); LANGS.forEach((l, i) => { if (cells[i] === k) out.same[l].push(k); }); }
  if (real >= 0 && seen.size !== real) out.fails.push(`the static check read ${seen.size} of the table's ${real} keys (${unread} rows it could not parse): its duplicate and empty-cell results are incomplete`);
  // the extra file: every row has seven cells, placeholders survive translation
  const morePath = path.join(APP, 'app', 'ui', 'i18n-more.js'); out.moreRows = 0; out.badPlaceholders = [];
  if (fs.existsSync(morePath)) {
    const I = loadTables();
    const more = I._more ? I._more() : { rows: {}, patterns: {}, plurals: {} };
    const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
    for (const [kind, rowsOf] of Object.entries(more)) for (const [en, row] of Object.entries(rowsOf)) {
      out.moreRows++;
      if (!Array.isArray(row) || row.length !== 7 || row.some(c => !c)) { out.short.push(en); continue; }
      if (kind === 'rows') row.forEach((c, i) => { if (c === en) out.same[LANGS[i]].push(en); });
      row.forEach((c, i) => { const cells = typeof c === 'string' ? [c] : Object.values(c); if (cells.some(x => ph(x) !== ph(en))) out.badPlaceholders.push(`${LANGS[i]}: ${en}`); });
    }
    // a row here whose English the big table already has is dead text: add() never replaces a table row
    out.shadowed = Object.keys(more.rows).filter(en => seen.has(en));
    // a key written twice in one section of this file: JS keeps the last and says nothing, so it is read from the source
    out.moreDup = [];
    const text = fs.readFileSync(morePath, 'utf8'), marks = ['I.add(', 'I.addPatterns(', 'I.addPlurals('];
    marks.forEach((mk, i) => {
      const a = text.indexOf(mk); if (a < 0) return; const ends = marks.map(m => text.indexOf(m, a + 1)).filter(x => x > a); const part = text.slice(a, ends.length ? Math.min(...ends) : text.length);
      const keys = new Map(); for (const m of part.matchAll(new RegExp('^\\s*(' + STR + ')\\s*:', 'gm'))) { const k = lit(m[1]); keys.set(k, (keys.get(k) || 0) + 1); }
      for (const [k, c] of keys) if (c > 1) out.moreDup.push(`${mk.slice(2, -1)}: ${k}`);
      const want = Object.keys(i === 0 ? more.rows : i === 1 ? more.patterns : more.plurals).length;
      if (keys.size !== want) out.fails.push(`i18n-more.js ${mk.slice(2, -1)}: read ${keys.size} keys in the source, the app has ${want}: a row is not one per line, or the check is out of date`);
    });
  } else { out.shadowed = []; out.moreDup = []; }
  if (out.shadowed.length) out.fails.push(`${out.shadowed.length} rows in i18n-more.js are already in the table (never shown): ${out.shadowed.slice(0, 6).join(' | ')}`);
  if (out.moreDup.length) out.fails.push(`${out.moreDup.length} keys are written twice in i18n-more.js: ${out.moreDup.slice(0, 6).join(' | ')}`);
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

// ---- counting: ONE place for it. The walk (app/test/e2e_i18n_audit.py) only collects raw lists; before and after,
// the report and the test all get their numbers from tally(), so two columns are always counted the same way.
const DATE_STRONG = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2}\b|\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b|\b\d+ ?(s|sec|min|mins|h|hr|hours?|days?|d|w|weeks?|mo|months?) ago\b|\b\d{1,2}:\d{2} ?(AM|PM)\b|^\d{1,2} ?(AM|PM)$/i;
const DATE_WORD = /\b(just now|yesterday|today|tomorrow)\b/i, DAY = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(day|sday|nesday|rsday|urday)?$/;
// a date or time LABEL: a real date/time value, a lone weekday, or today/yesterday/just now in a string of at most
// four words. A sentence that merely contains the word "yesterday" is prose and is counted with the other strings.
const isDateLabel = t => DATE_STRONG.test(t) || DAY.test(t.trim()) || (DATE_WORD.test(t) && t.trim().split(/\s+/).length <= 4);
// names that are the same in every language (app/test/i18n_allow.json): a plan or key name inside a Japanese sentence
// ("Premiumで何が増えますか？", "Shift") does not make it a mixed sentence. Applied here so every column uses today's list.
const BRAND = (() => { try { const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'test', 'i18n_allow.json'), 'utf8')).brand || []; return new RegExp('(?<![A-Za-z])(?:' + a.slice().sort((x, y) => y.length - x.length).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![A-Za-z])', 'g'); } catch { return /$^/g; } })();
const reallyMixed = t => /[A-Za-z]{4,}/.test(String(t).replace(BRAND, ' '));
// one element that does not fit is one finding, however many places show it (a sidebar label is on every place)
const element = k => String(k).replace(/^[^|]*\| /, '');
function tally(res, same, skipPlaces) {
  const skip = new Set(skipPlaces || []), c = {};
  const outside = (side, t) => { const p = (side.places || {})[t]; return !p || p.some(x => !skip.has(x)); };   // seen somewhere that is not skipped (old walks have no places: kept)
  for (const l of LANGS) {
    const L = (res.langs || {})[l]; if (!L) continue;
    const sm = new Set((same || {})[l] || []);
    const side = s => { if (!s) return null;
      const un = (s.untranslated || []).filter(t => !sm.has(t) && outside(s, t));
      return { untranslated: un.filter(t => !isDateLabel(t)).length, dates: [...new Set([...(s.dates || []), ...un])].filter(t => isDateLabel(t) && outside(s, t)).length,
        attrs: (s.attrs || []).filter(k => !sm.has(k.slice(k.indexOf(':') + 1))).length, overflow: new Set((s.overflow || []).filter(k => !skip.has(k.split(' | ')[0])).map(element)).size,
        mixed: (s.mixed || []).filter(reallyMixed).length, held: (s.held || []).length, list: un.filter(t => !isDateLabel(t)) }; };   // list: the strings behind "untranslated" (date labels are their own row)
    const d = side(L.desktop) || {}, p = side(L.phone);
    c[l] = { untranslated: d.untranslated, attrs: d.attrs, overflow: d.overflow, dates: d.dates, mixed: d.mixed, held: d.held,
      flint: L.flint_english ? L.flint_english.length : null, flintAsked: L.flint_asked || 0,
      phoneUntranslated: p ? p.untranslated : null, phoneOverflow: p ? p.overflow : null, _list: d.list || [] };
  }
  return c;
}
const strip = c => Object.fromEntries(Object.entries(c).map(([l, v]) => { const { _list, ...rest } = v; return [l, rest]; }));
// what kind of thing is still English (for the "what remains" table)
function kindsOf(list, whereOf) {
  const CONTENT = new Set(['market', 'guide', 'guide:website', 'academy']);
  const kind = t => {
    if (/^[,.;:)]/.test(t) || (/[(,]$/.test(t)) || /^(and|or|to|with|then|in|on|for|by|of)\b/.test(t)) return 'Pieces of a sentence split around a link or code';
    if (/\d/.test(t) && t.length <= 40) return 'Has a number in it (needs a pattern or plural)';
    if (CONTENT.has(whereOf(t))) return 'Marketplace catalog and Guide content';
    if (/^[$>]|\bmcp add\b|\.(js|json|md|html)\b|https?:|^[a-z-]+\.[a-z]{2,}/.test(t)) return 'Code, commands, addresses (stay as they are)';
    if (t.length > 60) return 'Long copy (over 60 characters)';
    if (t.length > 32) return 'Sentences (33 to 60 characters)';
    return 'Short labels and buttons (up to 32 characters)';
  };
  const by = {}; list.forEach(t => { const k = kind(t); (by[k] = by[k] || []).push(t); });
  return Object.entries(by).sort((a, b) => b[1].length - a[1].length);
}

function report(res, st, before, now, nowSame) {
  const L = [], B = before ? before.counts : null;
  const v = x => (x === null || x === undefined ? '–' : x);
  const pair = (b, a) => ((b === null || b === undefined) && (a === null || a === undefined) ? '–' : `${v(b)} → ${v(a)}`);   // not walked on either side: one dash
  const row = (label, k, src) => L.push(`| ${label} | ` + LANGS.map(l => (B && B[l] && src[l] ? pair(B[l][k], src[l][k]) : v(src[l] ? src[l][k] : null))).join(' | ') + ' |');
  const head = () => L.push('| | ' + LANGS.map(l => NAMES[l]).join(' | ') + ' |', '|---|' + LANGS.map(() => '---').join('|') + '|');
  const skipped = before && before.skipped && before.skipped.length ? before.skipped : null;
  L.push('# Language report', '');
  L.push('Written by `node scripts/dev/i18n-audit.js` (it walks the app headless; `app/test/e2e_i18n_audit.py` does the walking). Numbers are `before → after`. Do not edit the tables by hand: run the script. The notes under the tables are in `docs/I18N-REPORT-NOTES.md`.', '');
  L.push(`**What was walked:** ${res.routes || '?'} places (every main section, every Settings tab, Help, the Guide, Next step, Publish, Versions, New, Invite, Plans, Flint's page, Academy, Marketplace, Company, Design, the website builder) in English and in each language at 1280, and German and Japanese again at 390. English showed ${v((res.english || {}).desktop)} different strings at 1280.`, '');
  if (before) L.push(`**Before** is commit \`${before.commit || '?'}\`, walked the same way` + (skipped ? `, except ${skipped.length} places (${skipped.join(', ')}) that froze the app in every language but English at that commit and could not be walked. The first table leaves those places out on both sides, so the two numbers compare like with like; the second table is the whole app now.` : '.'), '');
  L.push('**How a string counts as still English:** it reads exactly the same in the English walk and in the language walk, and it is not a name, a number, code, or a row whose translation is the English on purpose ("Chat" in Spanish, "Design" in French).', '');
  L.push(skipped ? `## Before and after, on the ${(res.routes || 0) - skipped.length} places both could walk` : '## Before and after', ''); head();
  row('Visible strings still English', 'untranslated', nowSame); row('Placeholders, tooltips, labels still English', 'attrs', nowSame);
  row('Date and time labels still English', 'dates', nowSame); row('Text cut off or off the screen (and not in English)', 'overflow', nowSame);
  row('Mixed sentences (CJK with English words inside)', 'mixed', nowSame);
  row(`Flint replies that stayed English (of ${v((now.ja || {}).flintAsked)} asked)`, 'flint', nowSame);
  row('Phone (390): strings still English', 'phoneUntranslated', nowSame); row('Phone (390): text cut off', 'phoneOverflow', nowSame);
  L.push('');
  const eng = (res.english || {}).desktop || 0;
  // the honest name for this number: what is left after the still-English strings and date labels are taken out also
  // holds names, numbers and code, which never needed translating. So it is an upper bound on "translated".
  const share = (c, total) => Math.round((1 - (c.untranslated + (c.dates || 0)) / total) * 100) + '%';
  if (eng) { L.push('Share of the strings English shows (1280) that are no longer English, counting names, numbers and code, which never needed translating: ' + LANGS.map(l => `${NAMES[l]} ${B && B[l] && before.english ? share(B[l], before.english) + ' → ' : ''}${nowSame[l] ? share(nowSame[l], eng) : '–'}`).join(' · ') + '. Read it as an upper bound on how much is translated.', ''); }
  if (skipped) { L.push('## The whole app now (all places)', ''); head(); const B0 = B;
    const plain = (label, k) => L.push(`| ${label} | ` + LANGS.map(l => v(now[l] ? now[l][k] : null)).join(' | ') + ' |');
    plain('Visible strings still English', 'untranslated'); plain('Placeholders, tooltips, labels still English', 'attrs'); plain('Date and time labels still English', 'dates');
    plain('Text cut off or off the screen', 'overflow'); plain('Labels the translator gave up on (must be 0)', 'held'); L.push(''); }
  // what remains, by kind (German: the longest words, so the hardest case for layout too)
  const de = ((res.langs || {}).de || {}).desktop;
  if (de && now.de) {
    const whereOf = t => (de.where || {})[t] || '?';
    L.push('## What is still English, by kind (German, 1280)', '', '| Kind | Strings | Examples |', '|---|---|---|');
    for (const [k, a] of kindsOf(now.de._list, whereOf)) L.push(`| ${k} | ${a.length} | ${a.slice(0, 3).map(s => '"' + s.slice(0, 44).replace(/\|/g, '/') + (s.length > 44 ? '…' : '') + '"').join(' · ')} |`);
    L.push('');
    const by = {}; now.de._list.forEach(t => { const w = whereOf(t); (by[w] = by[w] || []).push(t); });
    L.push('## What is still English, by place first seen (German, 1280; top 15)', '', '| Place | Strings |', '|---|---|');
    Object.entries(by).sort((a, b) => b[1].length - a[1].length).slice(0, 15).forEach(([w, a]) => L.push(`| ${w} | ${a.length} |`)); L.push('');
  }
  L.push('## The tables', '', '| Check | Before | After |', '|---|---|---|');
  const bs = (before && before.static) || {};
  L.push(`| Keys in the table (app/ui/i18n.js) | ${v(bs.tableKeys)} | ${st.tableKeys} |`);
  L.push(`| Rows written in the source (more than keys means dead rows) | ${v(bs.rows)} | ${st.rows} |`);
  L.push(`| Keys defined twice with a different translation (the earlier one was never shown) | ${bs.dupDiff ? bs.dupDiff.length : '–'} | ${st.dupDiff.length} |`);
  L.push(`| Rows without seven filled cells | ${bs.short ? bs.short.length : '–'} | ${st.short.length} |`);
  L.push(`| Rows, patterns and plurals in app/ui/i18n-more.js | 0 | ${st.moreRows} |`);
  L.push(`| Translations that lost a {placeholder} | – | ${st.badPlaceholders.length} |`, '');
  L.push('## The website (site/lang/*.json)', ''); head();
  L.push('| Keys | ' + LANGS.map(l => st.site[l].keys).join(' | ') + ' |');
  L.push(`| Missing (of ${st.siteKeys}) | ` + LANGS.map(l => st.site[l].missing.length).join(' | ') + ' |');
  L.push('| Same as English (names, mostly) | ' + LANGS.map(l => st.site[l].same).join(' | ') + ' |', '');
  const extra = path.join(ROOT, 'docs', 'I18N-REPORT-NOTES.md');
  if (fs.existsSync(extra)) L.push(fs.readFileSync(extra, 'utf8').trim(), '');
  return L.join('\n');
}

const st = staticChecks();
if (process.argv.includes('--static')) {
  // --json: the same checks as data (app/test/e2e_i18n_audit.py reads this, so there is one implementation)
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ rows: st.rows, tableKeys: st.tableKeys, repeats: st.repeats, moreRows: st.moreRows, dupDiff: st.dupDiff, short: st.short, badPlaceholders: st.badPlaceholders, same: st.same, fails: st.fails })); process.exit(0); }
  if (st.fails.length) { console.error('i18n static checks failed:\n  ' + st.fails.join('\n  ')); process.exit(1); }
  console.log(`i18n static checks: ok (${st.rows} + ${st.moreRows} rows, website ${st.siteKeys} keys × 7)`); process.exit(0);
}
// --counts walk.json: the numbers of one walk, as JSON (the test compares these with its baseline)
if (arg('--counts')) { const r = JSON.parse(fs.readFileSync(arg('--counts'), 'utf8')); console.log(JSON.stringify(strip(tally(r, st.same, (arg('--skip') || '').toString().split(',').filter(Boolean))))); process.exit(0); }
let from = arg('--from');
if (!from || from === true) {
  from = path.join(os.tmpdir(), `tribe-i18n-audit-${process.pid}.json`);
  const r = spawnSync('python3', [path.join(ROOT, 'app', 'test', 'e2e_i18n_audit.py'), '--full', '--json', from], { stdio: 'inherit', env: { ...process.env, TRIBE_NO_DOWNLOAD: '1' } });
  if (!fs.existsSync(from)) { console.error('the walk did not finish'); process.exit(r.status || 1); }
}
const res = JSON.parse(fs.readFileSync(from, 'utf8'));
// --before <commit>: save this walk as the "before" column (run it with TRIBE_I18N_ROOT set to that commit's checkout,
// so rows that are English on purpose are judged by that commit's table)
if (arg('--before')) {
  fs.writeFileSync(BEFORE, JSON.stringify({ commit: String(arg('--before')), skipped: res.skipped || [], routes: res.routes, english: (res.english || {}).desktop || null, englishPhone: (res.english || {}).phone || null,
    static: { tableKeys: st.tableKeys, rows: st.rows, repeats: st.repeats, dupDiff: st.dupDiff, short: st.short }, counts: strip(tally(res, st.same, [])) }, null, 1) + '\n');
  console.log('saved the before column: app/test/i18n_before.json'); process.exit(0);
}
const before = fs.existsSync(BEFORE) ? JSON.parse(fs.readFileSync(BEFORE, 'utf8')) : null;
const now = tally(res, st.same, []), nowSame = before && before.skipped && before.skipped.length ? tally(res, st.same, before.skipped) : now;
fs.writeFileSync(path.join(ROOT, 'docs', 'I18N-REPORT.md'), report(res, st, before, now, nowSame));
console.log('wrote docs/I18N-REPORT.md');
if (st.fails.length) console.log('static checks:\n  ' + st.fails.join('\n  '));
