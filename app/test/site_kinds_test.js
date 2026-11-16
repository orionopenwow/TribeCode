// The website start screen's data and the page that sends visitors on (p5-start), with no browser:
//   the kinds and their templates (app/ui/designflow-data.js), the 'go' section (app/ui/sitecfg.js): only http(s)
//   addresses, a wait of 2 to 30 seconds, the refresh written only into exported pages; the GitHub address and latest
//   version read from a project's own git folder (server/sitedesign.js gitFacts) and filled into an App or project page;
//   Flint's rules for "make a website", "a page for my app", "send people to my app".
// Usage: node app/test/site_kinds_test.js
const assert = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'app', 'ui', 'sitecfg.js'));
const N = require(path.join(ROOT, 'app', 'ui', 'flintnlu.js'));
global.window = {}; require(path.join(ROOT, 'app', 'ui', 'designflow-data.js')); const D = global.window.TribeDesignData;
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'ui', 'sitetpl', 'catalog.json'), 'utf8')).templates;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// 1. kinds: two main ones first; every template has a kind; the main kinds have 8 or more, the best first, 12 at most
ok(D.SITE_KINDS.filter(k => k.main).map(k => k.id).join() === 'linkbio,app', 'the two main kinds');
ok(D.SITE_KINDS.map(k => k.id).join() === 'linkbio,app,business,portfolio,event,blog,blank', 'the order of the kinds');
ok(D.SITE_KINDS.every(k => /<svg[^>]*viewBox="0 0 64 48"/.test(k.art) && !/fill="#/.test(k.art)), 'each kind has its own drawing in the current colour');
ok(cat.every(t => t.kind && D.siteKindOf(t) === t.kind), 'the catalog and the page agree on every kind');
for (const k of ['linkbio', 'app']) { const l = D.siteTemplatesFor(cat, k); ok(l.length >= 8, `${k} has at least 8 templates (${l.length})`); ok(D.siteTemplatesFor(cat, k, 12).length <= 12, `${k}: at most 12 shown`); }
ok(D.siteTemplatesFor(cat, 'linkbio')[0].id === 'linkbio' && D.siteTemplatesFor(cat, 'app')[0].id === 'gh-project', 'the best first');
ok(Object.values(D.SITE_PICKS).flat().every(id => cat.some(t => t.id === id)), 'every pick is a real template');
ok(new Set(cat.map(t => t.id)).size === cat.length && cat.every(t => fs.existsSync(path.join(ROOT, 'app', 'ui', 'sitetpl', t.id + '.json')) && fs.existsSync(path.join(ROOT, 'app', 'ui', t.thumb))), 'every template has its file and picture');

// 2. the 'go' section
const page = (props) => S.normalize({ v: 1, name: 'x', pages: [{ title: 'Home', blocks: [{ type: 'go', variant: 'card', props }, { type: 'footer', props: { text: '©', links: [] } }] }] });
for (const bad of ['javascript:alert(1)', 'data:text/html,hi', '//evil.example', 'https://user:pw@example.com', 'https://example.com/"><script>', 'ftp://example.com', 'https://localhost', '  ']) ok(page({ to: bad }).pages[0].blocks[0].props.to === '', `refuses ${bad}`);
ok(page({ to: 'https://apps.apple.com/app/id1' }).pages[0].blocks[0].props.to === 'https://apps.apple.com/app/id1', 'keeps an https address');
ok(['0', '1', 99, 'x'].map(w => page({ to: 'https://e.co', wait: w }).pages[0].blocks[0].props.wait).join() === '2,2,30,4', 'the wait is 2 to 30 seconds');
const c = page({ title: 'Off we go', text: 'Hold on', to: 'https://example.com/app?a=1&b=2', wait: '3', button: 'Open it' });
const zip = S.exportFiles(c, 'zip').files['index.html'], one = S.exportFiles(c, 'single')['index.html'];
ok(zip.includes('<meta http-equiv="refresh" content="3;url=https://example.com/app?a=1&amp;b=2">') && one.includes('http-equiv="refresh"'), 'exported pages move on by themselves');
ok(!S.render(c, { edit: true, mode: 'single' }).includes('http-equiv') && !S.render(c, { mode: 'pages' }).includes('http-equiv') && !S.render(c, { mode: 'pages', go: false }).includes('http-equiv'), 'the editor, previews and pictures never move');
ok(zip.includes('Taking you to <b>example.com</b> in 3 seconds.') && zip.includes('href="https://example.com/app?a=1&amp;b=2"') && zip.includes('>https://example.com/app?a=1&amp;b=2</p>'), 'where it goes is shown in full, with a button');
ok(!/<script/i.test(zip), 'still no scripts');
const hidden = S.normalize(JSON.parse(JSON.stringify(c))); hidden.pages[0].blocks[0].hidden = true;
ok(!S.exportFiles(hidden, 'zip').files['index.html'].includes('http-equiv'), 'a hidden section does not move the page');
const empty = page({ to: '' });
ok(!S.exportFiles(empty, 'zip').files['index.html'].includes('http-equiv') && S.render(empty, { edit: true }).includes('Not sending anyone yet'), 'with no address: nothing moves, and the editor says so');
ok(S.BLOCKS.go.fields.to && S.CATS.go === 'Conversion', 'the inspector names its fields');
const r = S.command(S.blank('x'), { intent: 'site.redirect', slots: {}, text: 'make a redirect to https://example.com/x.' }, {});
ok(r.need === 'template' && r.template === 'app-redirect' && r.go === 'https://example.com/x', 'Flint: the redirect, with the address said');
ok(S.command(S.blank('x'), { intent: 'site.start', slots: { kind: 'app' } }, {}).need === 'start', 'Flint: the start screen');

// 3. GitHub facts from the project's own git folder, filled into an App or project page
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tribe-gh-'));
fs.mkdirSync(path.join(dir, '.git', 'refs', 'tags'), { recursive: true });
fs.writeFileSync(path.join(dir, '.git', 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:ada/tidepool.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
for (const t of ['v1.9.0', 'v2.10.1', 'v2.9.9', 'nightly']) fs.writeFileSync(path.join(dir, '.git', 'refs', 'tags', t), 'x');
fs.writeFileSync(path.join(dir, '.git', 'packed-refs'), '# pack-refs\nabc refs/tags/v2.3.0\n^def\n');
const SD = require(path.join(ROOT, 'server', 'sitedesign.js'))({ base: { p: (...a) => path.join(dir, ...a), readJSON: () => null, writeJSON() {} }, root: dir, showcase: {}, P: { get: () => null } });
const gf = SD.gitFacts(dir);
ok(gf && gf.repo === 'ada/tidepool' && gf.url === 'https://github.com/ada/tidepool' && gf.version === '2.10.1', JSON.stringify(gf));
ok(SD.gitFacts(os.tmpdir()) === null && SD.gitFacts('') === null, 'no git folder: nothing');
fs.writeFileSync(path.join(dir, '.git', 'config'), '[remote "origin"]\n\turl = https://gitlab.com/ada/tidepool.git\n');
ok(SD.gitFacts(dir) === null, 'only GitHub addresses');
const gh = S.normalize(JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'ui', 'sitetpl', 'gh-project.json'), 'utf8')));
const f1 = S.fill(gh, { github: gf });
ok(f1.used.includes('the GitHub address') && f1.used.includes('the latest version'), f1.used.join());
const h = f1.cfg.pages[0].blocks[0].props;
ok(h.eyebrow.startsWith('Version 2.10.1') && h.buttons[0].link.to === 'https://github.com/ada/tidepool/releases/latest' && h.buttons[1].link.to === 'https://github.com/ada/tidepool', 'buttons and version filled');
ok(!JSON.stringify(f1.cfg).includes('you/your-project'), 'no placeholder left');
ok(!S.fill(gh, {}).used.includes('the GitHub address') && JSON.stringify(S.fill(gh, {}).cfg).includes('github.com/you/your-project'), 'nothing known: clear placeholders stay');
ok(!S.fill(gh, { github: { url: 'https://evil.example/x', version: '1' } }).used.includes('the GitHub address'), 'only a GitHub address is used');
const rd = S.fill(S.normalize(JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'ui', 'sitetpl', 'app-redirect.json'), 'utf8'))), { github: gf });
ok(rd.cfg.pages[0].blocks[0].props.to === 'https://github.com/ada/tidepool/releases/latest', 'the redirect goes to the latest release');

// 4. Flint, no AI
const intent = q => { const s = N.parse(q, {}).steps[0]; return [s.intent, (s.slots || {}).kind]; };
ok(intent('make a website').join() === 'site.start,', 'make a website');
ok(intent('make a page for my app').join() === 'site.start,app' && intent('build a site for my github project').join() === 'site.start,app', 'a page for my app');
ok(intent('send people to my app')[0] === 'site.redirect' && intent('make a redirect page')[0] === 'site.redirect', 'send people to my app');
ok(intent('make a link in bio')[0] === 'site.linkbio' && intent('make a landing page for my game')[0] === 'build.landing', 'the template words still pick templates');

console.log(`site_kinds_test: OK (${n} checks)`);
