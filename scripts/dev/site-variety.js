#!/usr/bin/env node
// How alike are the website templates? (scripts/dev/site-variety.js, used by app/test/site_variety_test.js)
//
//   node scripts/dev/site-variety.js [--all] [--json]
//
// For every offered template in app/ui/sitetpl/catalog.json (or every one with --all) it works out a structural
// signature (what is in the page and how it is laid out, never its colours or words) and groups the ones that are alike:
//   hero      the opening composition (hero:split, hero:cover, links:stack, text:letter ...)
//   seq       the sections after it, as type:variant, footer left out
//   type      the character of the display face (serif, mono, round, condensed, grotesk, sans, pixel)
//   tone      dark or light, and the accent's hue family
// Two templates are near-duplicates when they open the same way and their section lists are at least 60% alike.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'app', 'ui', 'sitetpl');
const TYPE_OF = { 'Fraunces': 'serif', 'Instrument Serif': 'serif', 'DM Serif Display': 'serif', 'System serif': 'serif', 'JetBrains Mono': 'mono', 'Silkscreen': 'pixel', 'Outfit': 'round', 'Anton': 'condensed', 'Space Grotesk': 'grotesk', 'Bricolage Grotesque': 'grotesk', 'Inter': 'sans', 'System sans': 'sans' };
const hue = h => { const n = parseInt(String(h).slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.12) return 'grey'; let x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; x = (x * 60 + 360) % 360; return x < 20 || x >= 335 ? 'red' : x < 50 ? 'orange' : x < 75 ? 'yellow' : x < 170 ? 'green' : x < 200 ? 'teal' : x < 260 ? 'blue' : x < 300 ? 'purple' : 'pink'; };
const lum = h => { const n = parseInt(String(h).slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
function signature(cfg) {
  const t = cfg.theme || {}, k = t.colors || {}, bl = (((cfg.pages || [])[0] || {}).blocks || []).filter(b => !b.hidden);
  const body = bl.filter(b => b.type !== 'footer' && b.type !== 'banner' && b.type !== 'divider');
  const first = body[0] || { type: 'none', variant: '' };
  const seq = body.slice(1).map(b => `${b.type}:${b.variant}`);
  const cols = body.map(b => (b.props && Array.isArray(b.props.items) ? b.props.items.length : b.props && Array.isArray(b.props.plans) ? b.props.plans.length : 0));
  return { hero: `${first.type}:${first.variant}`, seq, types: body.slice(1).map(b => b.type), cols, nav: cfg.nav || 'top', pages: (cfg.pages || []).length,
    type: TYPE_OF[(t.fonts || {}).display] || 'other', font: (t.fonts || {}).display || '', tone: (lum(k.bg || '#FFFFFF') < 0.3 ? 'dark' : 'light') + '/' + hue(k.accent || '#000000'),
    key: `${first.type}:${first.variant}|${seq.join(',')}|${cfg.nav || 'top'}` };
}
// how alike two section lists are: the longest common run of sections in order, over the longer list (0..1)
function alike(a, b) { const n = a.length, m = b.length; if (!n && !m) return 1; const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)); for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[n][m] / Math.max(n, m); }
const near = (A, B) => A.hero === B.hero && alike(A.seq, B.seq) >= 0.6;
// loosely alike: the same opening and at least 60% the same kinds of section, whatever their layout
const loose = (A, B) => A.hero === B.hero && alike(A.types, B.types) >= 0.6;
function load(all) {
  const cat = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8')).templates;
  return cat.filter(c => all || !c.retired).map(c => ({ ...c, sig: signature(JSON.parse(fs.readFileSync(path.join(DIR, c.id + '.json'), 'utf8'))) }));
}
function report(list, fn) {
  if (!fn) return { ...report(list, near), loose: (r => ({ nearPairs: r.nearPairs, inCluster: r.inCluster, clusters: r.clusters }))(report(list, loose)), firstScreen: (() => { const o = {}; list.forEach(x => { const k = x.sig.hero + ' > ' + (x.sig.types[0] || 'nothing'); (o[k] = o[k] || []).push(x.id); }); return Object.fromEntries(Object.entries(o).filter(e => e[1].length > 1).sort((a, b) => b[1].length - a[1].length)); })() };
  const pairs = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (fn(list[i].sig, list[j].sig)) pairs.push([list[i].id, list[j].id]);
  // clusters: templates joined by near-duplicate pairs
  const up = Object.fromEntries(list.map(x => [x.id, x.id])), find = x => (up[x] === x ? x : (up[x] = find(up[x]))); pairs.forEach(([a, b]) => { up[find(a)] = find(b); });
  const groups = {}; list.forEach(x => { (groups[find(x.id)] = groups[find(x.id)] || []).push(x.id); });
  const clusters = Object.values(groups).filter(g => g.length > 1).sort((a, b) => b.length - a.length);
  const count = f => { const o = {}; list.forEach(x => { const v = f(x.sig); o[v] = (o[v] || 0) + 1; }); return o; };
  const sameKey = Object.values(list.reduce((o, x) => { (o[x.sig.key] = o[x.sig.key] || []).push(x.id); return o; }, {})).filter(g => g.length > 1);
  const cards3 = list.filter(x => x.sig.hero.startsWith('hero:') && x.sig.seq.slice(0, 2).some(s => /^features:(grid|icons|stats)$/.test(s))).map(x => x.id);
  return { total: list.length, heroTypes: count(s => s.hero), typeCharacters: count(s => s.type), tones: count(s => s.tone), nearPairs: pairs.length, inCluster: clusters.reduce((n, g) => n + g.length, 0), clusters, sameSignature: sameKey, heroThenCards: cards3 };
}
module.exports = { signature, alike, near, loose, load, report, TYPE_OF };
if (require.main === module) {
  const r = report(load(process.argv.includes('--all')));
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else { console.log(`${r.total} templates · ${Object.keys(r.heroTypes).length} opening compositions · ${Object.keys(r.typeCharacters).length} type characters`); console.log('openings', r.heroTypes); console.log('type', r.typeCharacters); console.log(`near-duplicate pairs: ${r.nearPairs} · templates in a look-alike cluster: ${r.inCluster}/${r.total} · identical signatures: ${r.sameSignature.length} groups`); r.clusters.forEach(g => console.log('  cluster', g.length, g.join(', '))); console.log(`loosely alike (same opening, 60% the same kinds of section): ${r.loose.nearPairs} pairs · ${r.loose.inCluster}/${r.total} templates`); r.loose.clusters.forEach(g => console.log('  cluster', g.length, g.join(', '))); console.log('same first screen (opening > next section):'); Object.entries(r.firstScreen).forEach(([k, g]) => console.log('  ', g.length, k)); console.log(`a headline then a row of feature cards: ${r.heroThenCards.length}`, r.heroThenCards.join(', ')); }
}
