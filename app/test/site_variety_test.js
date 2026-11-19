// The website templates are few, good and different from each other (site-templates2).
//   1 the gallery offers 20 to 28 templates; every kind of site has its two or three; picks are real and offered
//   2 no two offered templates share a structural signature (opening + sections, colours and words left out), none are
//     near-duplicates, and none is "a headline, then a row of feature cards"; at least 12 openings and 6 type characters
//   3 every offered template: no placeholder words, a description, sample copy of its own, passes Check (contrast, alt
//     text, links, nothing empty; a newsletter may still wait for the owner's signup link), exports clean with no script
//   4 every retired template still loads, renders and exports as before, and points at an offered template
//   5 in a real browser: each offered template at 1280 and 390px has no sideways scroll and nothing wider than the page
//     (app/test/site_variety_render.py; skipped with --no-browser)
// Usage: node app/test/site_variety_test.js [--no-browser]
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'app', 'ui', 'sitetpl');
const S = require(path.join(ROOT, 'app', 'ui', 'sitecfg.js'));
const V = require(path.join(ROOT, 'scripts', 'dev', 'site-variety.js'));
global.window = {}; require(path.join(ROOT, 'app', 'ui', 'designflow-data.js')); const D = global.window.TribeDesignData;
const cat = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8')).templates;
const cfgOf = id => JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const offered = cat.filter(t => !t.retired), retired = cat.filter(t => t.retired);

// 1. the set
ok(offered.length >= 20 && offered.length <= 28, `20 to 28 templates offered (${offered.length})`);
for (const k of D.SITE_KINDS.filter(k => k.id !== 'blank')) { const l = D.siteTemplatesFor(cat, k.id); ok(l.length >= 2, `${k.id} has at least two (${l.length})`); ok(D.siteTemplatesFor(cat, k.id, D.SITE_KIND_SHOWS).length <= 3, `${k.id}: its screen shows three at most`); }
ok(Object.values(D.SITE_PICKS).flat().every(id => offered.some(t => t.id === id)), 'every pick is an offered template');
ok(offered.every(t => Object.values(D.SITE_PICKS).flat().includes(t.id)), 'every offered template is some kind\'s pick');
ok(offered.every(t => t.title && t.summary && /^For /.test(t.summary) && t.summary.length <= 170 && fs.existsSync(path.join(ROOT, 'app', 'ui', t.thumb))), 'each card: an honest name, one line on who it is for, a picture');
ok(retired.every(t => !t.thumb && !fs.existsSync(path.join(DIR, 'thumbs', t.id + '.webp'))), 'retired templates have no card picture');
const sw = fs.readFileSync(path.join(ROOT, 'app', 'ui', 'sw.js'), 'utf8');
ok(offered.every(t => sw.includes(`'sitetpl/${t.id}.json'`)) && retired.every(t => !sw.includes(`'sitetpl/${t.id}.json'`)), 'the offline shell holds the offered templates only');

// 2. sameness
const list = V.load(false), r = V.report(list);
ok(r.sameSignature.length === 0, 'no two share a signature: ' + JSON.stringify(r.sameSignature));
ok(r.nearPairs === 0 && r.loose.nearPairs === 0, 'no near-duplicates: ' + JSON.stringify(r.loose.clusters));
ok(r.heroThenCards.length === 0, 'none is a headline over a row of feature cards: ' + r.heroThenCards.join());
ok(Object.keys(r.heroTypes).length >= 12, `at least 12 opening compositions (${Object.keys(r.heroTypes).length})`);
ok(Object.values(r.heroTypes).every(c => c <= 3), 'no opening is used by more than three');
ok(Object.keys(r.typeCharacters).length >= 6 && ['serif', 'mono', 'round', 'condensed'].every(k => r.typeCharacters[k]), 'a serif, a mono, a rounded and a condensed type character among at least six');
ok(Object.values(r.firstScreen).every(g => g.length <= 2), 'no first screen (opening and the section after) is shared by more than two');
const want = ['hero:split', 'hero:full', 'hero:minimal', 'hero:card', 'links:bento', 'list:magazine', 'text:letter'];
ok(want.every(h => r.heroTypes[h]), 'split, full-bleed, big type, a card, a bento grid, a magazine grid and a letter all open a template');
const has = (type, variant) => list.some(t => cfgOf(t.id).pages.some(p => p.blocks.some(b => b.type === type && (!variant || b.variant === variant))));
ok(has('timeline') && has('list', 'menu') && has('info', 'map') && has('features', 'bento') && has('gallery', 'mosaic') && list.some(t => cfgOf(t.id).nav === 'side'), 'a timeline, a menu, a map beside the hours, bento tiles, a mosaic and side navigation are all used');
ok(new Set(list.map(t => JSON.stringify(cfgOf(t.id).theme.colors))).size === list.length, 'every palette is its own');

// 3. each offered template is finished
const PLACEHOLDER = /a clear heading|main hero message|say what this is about|say what it is in one line|one or two sentences on who|lorem|ipsum|a real quote from|their name|a question people ask|another answer|say one plain thing|your (name|company|website)\b|placeholder|coming soon\.\.\.|\btodo\b|heading goes here|12 example street/i;
const names = new Set();
for (const t of offered) {
  const raw = cfgOf(t.id), c = S.normalize(JSON.parse(JSON.stringify(raw)));
  const words = []; S.walkWords(c, (pg, b, p, v) => words.push(v));
  const bad = words.find(w => PLACEHOLDER.test(w));
  ok(!bad, `${t.id}: no placeholder words (${bad})`);
  ok(c.seo.description && c.seo.description.length <= 170, `${t.id}: a description for search results`);
  ok(!names.has(c.name) || t.id === 'app-redirect', `${t.id}: its own invented name`);   // the redirect is for the same app as the download page names.add(c.name);
  const chk = S.check(c), fixes = chk.filter(x => x.level === 'fix' && !/^nl(:|$)/.test(x.id));
  ok(fixes.length === 0, `${t.id}: passes Check (${fixes.map(x => x.id + ' ' + x.title).join('; ')})`);
  ok(!chk.some(x => /^(example|pic|contrast-muted|longword|alt|link)/.test(x.id)), `${t.id}: no example words, grey pictures, faint text or dead buttons (${chk.map(x => x.id).join()})`);
  const one = S.exportFiles(c, 'single')['index.html'], zip = S.exportFiles(c, 'zip');
  ok(one.startsWith('<!doctype html>') && !/<script/i.test(one) && !/undefined|\[object Object\]|NaN/.test(one.replace(/data:[^"')]+/g, '')), `${t.id}: exports one clean file with no script`);
  ok(c.pages.every(p => zip.files[p.slug === 'index' ? 'index.html' : p.slug + '.html']) && zip.files['site.json'] && zip.fonts.every(f => fs.existsSync(path.join(ROOT, 'app', 'ui', 'assets', 'site-fonts', f.file)) && fs.existsSync(path.join(ROOT, 'app', 'ui', 'assets', 'site-fonts', f.license))), `${t.id}: the .zip has every page, and its fonts ship with their licences`);
  ok((one.match(/<h1[\s>]/g) || []).length >= 1 && c.pages.every(p => (S.render(c, { page: p.id, mode: 'pages' }).match(/<h1[\s>]/g) || []).length === 1), `${t.id}: one main heading on every page`);
  ok(!/<img(?![^>]*\salt="[^"]+")[^>]*>/.test(one), `${t.id}: every picture has a description`);
  ok(JSON.stringify(S.normalize(JSON.parse(JSON.stringify(c)))) === JSON.stringify(c), `${t.id}: opening it again changes nothing`);
  ok(S.render(c, { edit: true }).includes('data-block='), `${t.id}: opens in the editor`);
}

// 4. retired templates: still loadable exactly, and each maps to an offered one
ok(retired.length >= 30, `the older templates are kept (${retired.length})`);
for (const t of retired) {
  ok(fs.existsSync(path.join(DIR, t.id + '.json')), `${t.id}: its file is still there`);
  const c = S.normalize(cfgOf(t.id));
  ok(c.pages.length && c.pages[0].blocks.length && S.render(c).length > 2000 && S.exportFiles(c, 'single')['index.html'].includes('</html>'), `${t.id}: still loads, renders and exports`);
  ok(offered.some(o => o.id === t.alias), `${t.id}: points at an offered template (${t.alias})`);
  ok(D.siteKindOf(offered.find(o => o.id === t.alias)) === t.kind || ['portfolio', 'business', 'app'].includes(t.kind), `${t.id}: the closest one is of its kind`);
}
// a site made from an older template (its own saved design) is untouched by the new layouts
{ const old = S.normalize(cfgOf('sb-agency')), again = S.normalize(JSON.parse(JSON.stringify(old))); ok(JSON.stringify(old) === JSON.stringify(again) && old.template === 'sb-agency', 'an older design keeps its own template id and content'); }
// the server gives the closest offered template for a retired id, and the very file when asked
{ const os = require('node:os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tribe-var-'));
  const SD = require(path.join(ROOT, 'server', 'sitedesign.js'))({ base: { p: (...a) => path.join(dir, ...a), readJSON: () => null, writeJSON() {} }, root: ROOT, showcase: {}, P: { get: () => null } });
  if (SD.template) { ok(SD.template('sb-agency').template === 'portfolio' && SD.template('sb-agency', true).template === 'sb-agency', 'the server: a retired id gives its closest offered template, or itself when asked exactly'); ok(SD.template('cafe').name === 'Marigold', 'the server serves the gallery\'s own file for an offered template'); } }

// 5. a real browser: no overflow at 1280 and 390
if (!process.argv.includes('--no-browser')) {
  const out = cp.spawnSync('python3', [path.join(__dirname, 'site_variety_render.py')], { encoding: 'utf8', timeout: 240000 });
  ok(out.status === 0, 'every offered template fits at 1280 and 390px:\n' + (out.stdout || '') + (out.stderr || ''));
  console.log(String(out.stdout || '').trim().split('\n').pop());
}
console.log(`site_variety_test: OK (${n} checks; ${offered.length} offered, ${retired.length} retired, ${Object.keys(r.heroTypes).length} openings, ${Object.keys(r.typeCharacters).length} type characters)`);
