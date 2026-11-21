// The master guides for AI agents (docs/ai, app/ui/aiguide-core.js, scripts/dev/ai-guides.js):
//  1 the guides and the served copy are up to date (--check) and each is under 400 lines;
//  2 every tool a guide names exists on the server; every step, section, layout, part, kit, look and font it names
//    exists in the app's own data; every step's example is accepted by the real model;
//  3 the JSON in the worked examples is accepted too;
//  4 the brief, the essentials, the trimmed rules, the notes on bad steps, and the project folder's marked block.
// Usage: node app/test/ai_guides_test.js
'use strict';
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const G = require(path.join(root, 'app/ui/aiguide-core.js')), S = require(path.join(root, 'app/ui/sitecfg.js')), A = require(path.join(root, 'app/ui/appcreator-core.js')), K = require(path.join(root, 'app/ui/motionsocial.js'));
const SERVED = require(path.join(root, 'app/ui/aiguides-data.js'));
let n = 0; const ok = (c, m) => { n++; if (!c) { console.error('FAIL: ' + m); process.exit(1); } };
const read = f => fs.readFileSync(path.join(root, 'docs/ai', f), 'utf8');
const W = read('WEBSITE.md'), AP = read('APP.md'), M = read('MOTION.md'), R = read('README.md');

// 1
execFileSync(process.execPath, [path.join(root, 'scripts/dev/ai-guides.js'), '--check'], { stdio: 'pipe' });
for (const [f, t] of [['WEBSITE.md', W], ['APP.md', AP], ['MOTION.md', M], ['README.md', R]]) ok(t.split('\n').length <= 400, `${f} is over 400 lines`);
for (const k of ['README', 'WEBSITE', 'APP', 'MOTION']) ok(SERVED[k] && SERVED[k].length > 1500 && !/<!-- gen:/.test(SERVED[k]), `the served ${k} guide`);
ok(SERVED.WEBSITE.length < 32000 && SERVED.APP.length < 32000, 'a guide fits a model\'s context (under about 8,000 tokens)');

// 2 tools
const src = fs.readdirSync(path.join(root, 'server')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(root, 'server', f), 'utf8')).join('\n');
const tools = new Set([...src.matchAll(/^\s{4}([a-z][a-z_]+): \{(?:\s*\n\s*)?\s*description:/gm)].map(m => m[1]));
for (const [f, t] of [['WEBSITE', W], ['APP', AP], ['MOTION', M], ['README', R]]) {
  const named = new Set([...t.matchAll(/`((?:site|app|motion)_[a-z_]+|project_brief|get_guide)`?/g)].map(m => m[1]));
  ok(named.size >= 3, `${f} names its tools`);
  for (const x of named) ok(tools.has(x), `${f} names the tool ${x}, which the server does not have`);
}
for (const k of ['site', 'app', 'motion']) for (const x of Object.values(G.TOOLS[k])) ok(tools.has(x), `TOOLS.${k} names ${x}`);
// sections and layouts
const rows = (t, head) => { const l = t.split('\n'), i = l.findIndex(x => x.startsWith(head)); const out = []; for (let j = i + 2; j < l.length && l[j].startsWith('|'); j++) out.push(l[j].split('|').slice(1, -1).map(x => x.trim())); return out; };
const blocks = rows(W, '| type |'); ok(blocks.length === S.TYPES.length, 'every section type is in the website guide');
for (const [t, , vs] of blocks) { const type = t.replace(/`/g, ''); ok(S.BLOCKS[type], `section ${type}`); for (const v of vs.split(', ')) ok(S.BLOCKS[type].variants.includes(v), `${type} · ${v}`); }
for (const [p] of rows(W, '| preset |')) ok(S.PRESETS[p.replace(/`/g, '')], `look ${p}`);
const ticked = (t, from, to) => [...t.slice(t.indexOf(from), to ? t.indexOf(to, t.indexOf(from)) : undefined).matchAll(/`([a-z0-9-]+)`/g)].map(m => m[1]);
for (const f of ticked(W, 'Font pairs (`fonts`)', 'Illustrations for')) if (f !== 'fonts') ok(S.FONT_PAIRS[f], `font pair ${f}`);
for (const r of G.RULES.site.recipes) for (const [t, v] of r.blocks) ok(S.BLOCKS[t] && S.BLOCKS[t].variants.includes(v), `recipe ${r.kind}: ${t} · ${v}`);
for (const row of rows(W, '| Kind of site |')) for (const s of row[1].split('→')) { const [t, v] = s.split('·').map(x => x.trim()); ok(S.BLOCKS[t] && S.BLOCKS[t].variants.includes(v), `the guide's recipe ${t} · ${v}`); }
// parts, kits, looks
const tableTicks = (t, from, to) => [...t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from))).split('\n').filter(l => l.startsWith('|')).join('\n').matchAll(/`([a-z0-9-]+)`/g)].map(m => m[1]);
const parts = tableTicks(AP, '## 3. Parts', '## 4.'); ok(parts.length === A.BLOCK_TYPES.length, 'every part is in the app guide'); for (const p of parts) ok(A.BLOCKS[p], `part ${p}`);
const kitLine = AP.slice(AP.indexOf('## 4. Kits')).split('\n').find(l => l.startsWith('`')); const kits = [...kitLine.matchAll(/`([a-z0-9-]+)`/g)].map(m => m[1]); for (const k of kits) ok(A.KITS[k], `kit ${k}`); ok(kits.length === Object.keys(A.KITS).length, 'every kit is in the app guide');
for (const l of ticked(AP, 'Light: ', 'Fonts (`theme`')) ok(A.PRESETS.some(p => p.id === l), `app look ${l}`);
for (const r of G.RULES.app.recipes) for (const [t] of r.blocks) ok(A.BLOCKS[t], `app recipe part ${t}`);
for (const k of ticked(M, 'Kinds of state:', 'Templates, by group')) ok(K.KINDS[k], `motion kind ${k}`);
const mt = new Set(K.LIST.map(x => (typeof x === 'string' ? x : x.id))); for (const t of ticked(M, 'Templates, by group:', 'Feels (')) ok(mt.has(t), `motion template ${t}`);

// steps: the guide lists exactly the model's steps, and each example is accepted
const stepsIn = t => [...t.slice(t.indexOf('. The steps')).matchAll(/^- `([a-z.]+)`:/gm)].map(m => m[1]);
ok(JSON.stringify(stepsIn(W)) === JSON.stringify(G.OPS.site.map(o => o.op)), 'the website guide lists every step');
ok(JSON.stringify(stepsIn(AP)) === JSON.stringify(G.OPS.app.map(o => o.op)), 'the app guide lists every step');
{
  let c = S.blank('Bean and Gone'); c = S.applyOps(c, [{ op: 'add', type: 'image' }, { op: 'page', title: 'About' }]).cfg;
  const pg = c.pages[0], hero = pg.blocks.find(b => b.type === 'hero'), feat = pg.blocks.find(b => b.type === 'features'), img = pg.blocks.find(b => b.type === 'image');
  const fill = (o, b) => JSON.parse(JSON.stringify(o).replace(/<block id of the target>/g, feat.id).replace(/<block id>/g, b.id));
  for (const o of G.OPS.site) {
    const b = /^(illustration|alt)$/.test(o.op) ? img : /^(item)$/.test(o.op) ? feat : hero;
    const r = S.applyOps(c, [fill(o.ex, b)]); ok(r.done.length === 1 && !r.skipped.length, `the website step ${o.op} is accepted: ${r.skipped.join(' ')}`);
    ok(!G.lint('site', [fill(o.ex, b)], c, S).length, `no notes on the example of ${o.op}: ${JSON.stringify(G.lint('site', [fill(o.ex, b)], c, S))}`);
  }
  // the model has no step the guide leaves out
  const known = new Set(G.OPS.site.map(o => o.op)); const body = fs.readFileSync(path.join(root, 'app/ui/sitecfg.js'), 'utf8'); const fn = body.slice(body.indexOf('function applyOps('), body.indexOf('function outline('));
  for (const m of fn.matchAll(/case '([a-z]+)':/g)) ok(known.has(m[1]), `applyOps knows "${m[1]}" but the guide does not`);
}
{
  let d = A.template(A.templateList()[0].id); d = A.propose(d, [{ op: 'screen.add', name: 'Extra' }]).doc;
  const s0 = d.screens[0], list = d.screens.flatMap(s => s.blocks).find(b => Array.isArray(b.props.items) && b.props.items.length > 1 && typeof b.props.items[0].title === 'string' && b.props.items[0].icon), btn = d.screens.flatMap(s => s.blocks).find(b => b.type === 'button'), hdr = s0.blocks.find(b => typeof b.props.title === 'string');
  ok(list && btn && hdr, 'the fixture app has a list, a button and a title');
  const extra = d.screens.find(s => s.name === 'Extra');
  for (const o of G.OPS.app) {
    if (o.op === 'illus') continue;   // needs a part with a picture; checked by name below
    const b = /^(item\.|icon)/.test(o.op) ? list : /^(link|unlink)$/.test(o.op) ? btn : o.op === 'text' ? hdr : /^block\.(move|dup|remove)$/.test(o.op) ? list : hdr;
    let base = d; if (o.op === 'link') base = A.propose(d, [{ op: 'unlink', block: btn.id, path: '' }]).doc; if (o.op === 'tabbar') base = A.blank('T'); if (o.op === 'start') base = d;
    const step = JSON.parse(JSON.stringify(o.ex).replace(/<block id>/g, b.id).replace(/<screen id>/g, o.op === 'link' || o.op === 'start' || o.op === 'screen.move' ? extra.id : s0.id));
    if (o.op === 'text') step.value += ' again';
    const r = A.propose(base, [step]); ok(r.done.length === 1, `the app step ${o.op} is accepted: ${r.skipped.join(' ')}`);
  }
  ok(A.ILL_NAMES.includes(G.opOf('app', 'illus').ex.value) && A.ICON_NAMES.includes(G.opOf('app', 'icon').ex.value), 'the picture and icon in the examples exist');
  const body = fs.readFileSync(path.join(root, 'app/ui/appcreator-core.js'), 'utf8'); const set = /PROPOSE_OK = new Set\(\[([^\]]+)\]/.exec(body)[1].match(/'[a-z.]+'/g).map(x => x.slice(1, -1));
  ok(JSON.stringify(set.slice().sort()) === JSON.stringify(G.OPS.app.map(o => o.op).sort()), 'the app guide and the model agree on the steps');
}

// 3 worked examples
const jsons = t => [...t.matchAll(/```json\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1]));
{
  const ex = jsons(W); ok(ex.length >= 3, 'the website guide has worked JSON');
  S.normalize(ex[0]);
  const add = ex.find(x => x.op === 'add'); let r = S.applyOps(S.blank('x'), [{ ...add, after: undefined }]); ok(r.done.length === 1, 'the one-step section is accepted');
  const cafe = ex.find(x => x.start); r = S.applyOps(S.blank('Bean and Gone'), cafe.ops); ok(r.done.length === cafe.ops.length && !r.skipped.length, `the café example is accepted: ${r.skipped.join(' ')}`);
  ok(!G.lint('site', cafe.ops, S.blank('x'), S).length, 'no notes on the café example');
}
{
  const ex = jsons(AP); A.normalize(ex[0]);
  const st = ex.find(x => x.ops); const r = A.propose(A.blank('Bean'), st.ops); ok(r.done.length === st.ops.length, `the settings example is accepted: ${r.skipped.join(' ')}`);
  ok(r.doc.theme.mode === 'dark' && r.doc.screens.some(s => s.id === 'settings'), 'it adds Settings and turns dark');
}
{ const d = K.normalize(jsons(M)[0]); ok(d.states.length === 4, 'the motion example keeps its four states'); }

// 4
for (const k of ['site', 'app', 'motion']) { const e = G.essentials(k); ok(e.length > 600 && e.length < 5000 && /Never/.test(e), `essentials(${k})`); }
ok(G.trimmed('site').length < 400 && /invent/.test(G.trimmed('site')) && G.trimmed('app').length < 400, 'the trimmed rules are a few lines');
const data = { name: 'Bean and Gone', vision: 'A small coffee roaster on Mill Street.', brand: { colors: { accent: '#B4532C' }, fonts: { display: 'Fraunces', body: 'Inter' }, voice: 'warm' }, site: G.siteSummary(S.blank('Bean'), S), facts: [{ kind: 'decision', key: 'Hours', value: '7 to 4' }], tasks: [{ id: 't1', status: 'doing', title: 'Menu page' }], approve: { site: 'Camp approves what you propose.' } };
const b = G.brief(data); ok(/Mill Street/.test(b) && /#B4532C/.test(b) && /Fraunces \+ Inter/.test(b) && /Hours: 7 to 4/.test(b) && /Menu page/.test(b) && /Camp approves/.test(b) && b.length < 9000, 'the brief has the vision, brand, facts, tasks and who approves');
ok(G.brief({ ...data, facts: Array.from({ length: 300 }, (_, i) => ({ key: 'k' + i, value: 'v'.repeat(300) })) }).length <= 9000, 'the brief stays small');
ok(G.brief(data, { short: true }).length < b.length && !/Open tasks/.test(G.brief(data, { short: true })), 'the short brief');
const notes = G.lint('site', [{ op: 'add', type: 'menu' }, { op: 'paint' }], S.blank('x'), S); ok(notes.length === 2 && /Try|example/.test(JSON.stringify(notes[0])) && notes[0].example && /Steps are/.test(notes[1].why), 'a bad step gets the reason and a corrected example');
ok(/"op":"text"/.test(G.hint('site', 'text')) && /Steps are/.test(G.hint('app', 'nope')), 'hint()');
const req = G.request('site', { ask: 'Calmer', brief: b }); ok(req.indexOf('# Project brief') === 0 && /get_guide\("website"\)/.test(req) && /site_propose/.test(req), 'the request starts with the brief');
const blk = G.folderBlock(data); ok(blk.startsWith(G.MARK.open) && blk.endsWith(G.MARK.close) && /Mill Street/.test(blk) && /site\/site\.json/.test(blk) && /\.tribe\/ai\/WEBSITE\.md/.test(blk), 'the folder block');
const fresh = G.mergeBlock(null, blk); ok(fresh.includes(blk), 'a new AGENTS.md');
const edited = `My own notes.\n\n${blk}\n\nMore of mine.\n`, blk2 = G.folderBlock({ ...data, vision: 'A new vision.' }), merged = G.mergeBlock(edited, blk2);
ok(merged.startsWith('My own notes.') && merged.endsWith('More of mine.\n') && /A new vision\./.test(merged) && !/Mill Street/.test(merged), 'only the block is rewritten');
ok(G.mergeBlock('# Mine\n\nHand written.\n', blk) === null, 'a hand-written file is left alone');
const txt = G.siteText(S.blank('Bean'), S, { device: 'phone' }); ok(/HERO · center/.test(txt) && /→ nowhere/.test(txt) && /one column/.test(txt), 'the text view of a page');
ok(/NOTHING LEADS HERE/.test(G.appText(A.propose(A.blank('x'), [{ op: 'screen.add', name: 'Lost' }]).doc, A)), 'the text view names a screen nothing leads to');
console.log(`ai_guides_test: OK (${n} checks; guides ${[W, AP, M, R].map(t => t.split('\n').length).join(', ')} lines)`);
