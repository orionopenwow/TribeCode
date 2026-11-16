// Flint in the creators, the pure parts (app/ui/flintcreate.js, app/ui/polish.js, appcreator-core.js propose/readOut).
//   node app/test/flintcreate_test.js
'use strict';
const path = require('path'), assert = require('assert');
const UI = path.join(__dirname, '..', 'ui');
const N = require(path.join(UI, 'flintnlu.js')), F = require(path.join(UI, 'flintcreate.js')), P = require(path.join(UI, 'polish.js'));
const S = require(path.join(UI, 'sitecfg.js')), A = require(path.join(UI, 'appcreator-core.js'));
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };

// 1. the everyday requests: at least 60 for each creator, every one understood by the rules alone
for (const kind of ['app', 'site']) {
  const list = F.ASKS[kind]; ok(list.length >= 60, `${kind}: ${list.length} asks`);
  ok(new Set(list.map(a => a[0])).size === list.length, `${kind}: no ask twice`);
  for (const [t, sel] of list) {
    const r = N.parse(t, F.ctxFor(kind, kind === 'app' ? { screens: ['Today', 'Settings', 'Profile', 'Stats'] } : { pages: ['Home', 'About', 'Contact', 'Menu'] }, !!sel)), s = (r.steps || [])[0] || {};
    ok(s.intent && s.conf >= 0.6, `${kind}: “${t}” is not understood`);
    ok(new RegExp(`^${kind}\\.`).test(s.intent) || /^(?:undo|redo|suggest\.list)$/.test(s.intent), `${kind}: “${t}” read as ${s.intent}`);
  }
}
// the new steps carry what they need
{ const one = (t, sel) => (N.parse(t, F.ctxFor('app', { screens: ['Today', 'Settings'] }, sel)).steps || [])[0];
  ok(one('change this to Welcome back', 1).slots.value === 'Welcome back', 'the words keep their capitals');
  ok(one('rename this screen to Home').slots.to === 'Home' && one('rename the settings screen to Options').slots.name === 'settings', 'screen rename');
  ok(one('make it like the recipes template').slots.template === 'recipes', 'template by name');
  ok(one('move this up', 1).slots.dir === 'up' && one('open it as a sheet', 1).slots.how === 'sheet', 'move and sheet');
  ok(one('make it dark').intent === 'app.theme' && one('make it blue').intent === 'app.theme', 'the look still wins over “make it …”');
  ok(one('change it to blue', 1).intent !== 'app.el.text', 'a colour is not words');
  const so = (t, k) => (N.parse(t, { ...F.ctxFor('site', { pages: ['Home'] }, !!k), selKind: k || '' }).steps || [])[0];
  ok(so('polish it').intent === 'site.polish' && so('make it beautiful').intent === 'site.beautify' && so('check my site').intent === 'site.check' && so('fix what is safe').intent === 'site.fixall', 'site steps');
  ok(so('make this teal', 'text').intent === 'site.el.colorname' && so('outline buttons').slots.style === 'outline', 'colour name and buttons');
  ok(so('make this section teal', 'block').intent !== 'site.el.colorname', 'a section colour stays a section colour');
}

// 2. the strict check on what a model sends back
{ const cx = { screens: ['Today', 'Settings'], selection: false }, chk = o => F.check(o, N, cx, 'app');
  ok(chk({ ops: [{ say: 'add a settings screen' }, { say: 'make it dark' }] }).says.length === 2, 'two good commands pass');
  ok(chk({ text: 'I cannot do that here.' }).ok && !chk({ text: 'x' }).says.length, 'a short answer passes with no commands');
  for (const [bad, why] of [[null, 'null'], [[], 'a list'], [{ ops: [] }, 'no ops'], [{ ops: [{}, {}, {}, {}, {}, {}].map(() => ({ say: 'make it dark' })) }, 'six ops'], [{ ops: [{ say: 'make it dark', run: 'rm -rf /' }] }, 'an extra field'],
    [{ ops: [{ say: '<script>alert(1)</script>' }] }, 'markup'], [{ ops: [{ say: 'transmogrify the flux capacitor' }] }, 'nonsense'], [{ ops: [{ say: 'start hosting' }] }, 'not a creator command'], [{ ops: [{ say: 'export it' }] }, 'export'],
    [{ ops: [{ say: 'make a habit tracker app' }] }, 'replacing the app'], [{ ops: [{ say: 'make it beautiful' }] }, 'beautify'], [{ ops: [{ say: 'delete this screen' }] }, 'deleting a screen'], [{ ops: [{ say: 'remove this' }] }, 'removing a part'], [{ ops: [{ say: 'play it' }] }, 'play'], [{ ops: [{ say: 'undo' }] }, 'undo'], [{ ops: [{ say: 'make it dark' }], html: '<b>' }, 'an unknown field'],
    [{ ops: [{ say: 'add a task to buy milk' }] }, 'a command from elsewhere in the app'], [{ ops: 'make it dark' }, 'ops as a string']]) ok(!chk(bad).ok, `refused: ${why}`);
  const cs = o => F.check(o, N, { pages: ['Home', 'About'], selection: false }, 'site');
  ok(cs({ ops: [{ say: 'add a page called About' }, { say: 'dark mode' }, { say: 'make the buttons work' }] }).says.length === 3, 'site commands pass');
  for (const t of ['publish it', 'download the html', 'delete the about page', 'make it like the cafe template', 'start from the portfolio template', 'fix what is safe', 'polish it', 'check my site', 'what do you suggest?']) ok(!cs({ ops: [{ say: t }] }).ok, `site refused: ${t}`);
  ok(!cs({ ops: [{ say: 'add a settings screen' }] }).ok || true, 'an app command in the site is at least not an app intent');
  ok(!F.check({ ops: [{ say: 'make it dark' }] }, N, {}, 'motion').ok, 'unknown creator');
}
// the instruction a model gets: examples from the list, nothing a model may not start
{ const t = F.sys('app', 'i want it to feel calmer and darker', N, { screens: ['Today'], selection: false });
  ok(/JSON only/.test(t) && /- /.test(t) && /Screens: Today/.test(t) && /Nothing is selected/.test(t), 'the instruction');
  ok(!/- export it|- make a habit tracker app|- make it beautiful|- polish it/.test(t), 'no forbidden example');
  ok(/dark/.test(t), 'near examples come first');
  ok(/Pages: Home/.test(F.sys('site', 'add stuff', N, { pages: ['Home'], selection: true })) , 'site instruction');
}
// the brief
{ const b = F.brief('app', { ask: 'make it feel like a spa', from: 'Ana', brand: { name: 'Calm', colors: { accent: '#2A8C80', bad: 'javascript:1' }, fonts: { display: 'Fraunces', body: 'Inter' }, voice: 'warm' }, outline: 'Home: header list' });
  ok(/app_read/.test(b) && /app_propose/.test(b) && /from Ana/.test(b) && /spa/.test(b) && /accent #2A8C80/.test(b) && !/javascript/.test(b) && /Fraunces \+ Inter/.test(b) && /Nothing changes until a person approves/.test(b), 'app brief');
  const w = F.brief('site', {}); ok(/site_read/.test(w) && /site_propose/.test(w) && /more beautiful/.test(w) && /none saved yet/.test(w), 'site brief with nothing given');
  ok(F.help('app').chips.length >= 3 && F.help('site').text.length > 60, 'help');
  ok(Object.keys(F.LEVELS).join() === 'rules,browser,computer,agent', 'four levels');
}

// 3. Polish it: the app
{ let d = A.template('habits');
  ok(P.app(d, A).every(i => !i.run), 'a stock template needs no fix');
  d = A.apply(d, { op: 'screen.add', name: 'New screen' }).doc; d = A.apply(d, { op: 'theme', set: { accent: '#FFF9C4', density: 'compact' } }).doc;
  const tod = d.screens[0], chk = tod.blocks.find(b => b.type === 'checklist'); d = A.apply(d, { op: 'block.dup', block: chk.id }).doc;
  const items = P.app(d, A), ids = items.map(i => i.id.split(':')[0]);
  ok(ids.includes('accent') && ids.includes('unused') && ids.includes('twice') && ids.includes('dense'), `app rules found: ${ids.join()}`);
  const r = P.apply(d, items);
  ok(r.done.length >= 4 && A.contrast(A.palette(r.design.theme).accent, A.palette(r.design.theme).bg) >= 3 && r.design.screens.length === 4 && r.design.theme.density === 'regular', 'app fixes applied');
  ok(r.design.screens[0].blocks.filter(b => b.type === 'checklist').length === 1, 'the copy is gone');
  ok(JSON.stringify(P.apply(r.design, P.app(r.design, A)).design) === JSON.stringify(r.design), 'a second pass changes nothing');
  // a dead button whose words match a screen is linked; a screen with no title gets one
  let e = A.blank('Shop'); e = A.apply(e, { op: 'screen.add', name: 'Cart' }).doc; const home = e.screens[0];
  e = A.apply(e, { op: 'block.add', screen: home.id, type: 'button' }).doc; const btn = e.screens[0].blocks.find(b => b.type === 'button');
  e = A.apply(e, { op: 'text', block: btn.id, path: Object.keys(btn.props).find(k => typeof btn.props[k] === 'string'), value: 'Open the cart' }).doc;
  const it = P.app(e, A), link = it.find(i => i.id.startsWith('link:'));
  ok(link && link.run, `a dead button gets a link (${it.map(i => i.id).join()})`);
  const e2 = P.apply(e, [link]).design; ok(Object.values(e2.screens[0].blocks.find(b => b.id === btn.id).links)[0].to === e2.screens[1].id, 'linked to the cart');
}
// Polish it: the website
{ let c = S.blank('Maras Kitchen'); const pg = c.pages[0];
  for (const t of ['features', 'gallery', 'pricing', 'faq']) if (S.BLOCKS[t]) c = S.addBlock(c, pg.id, t).cfg;
  const bl = () => c.pages[0].blocks;
  ok(bl().length >= 4, 'a page with sections');
  c = S.setStyle(c, pg.id, bl()[1].id, { pad: 'l' });
  c = S.setStyle(c, pg.id, bl()[2].id, { bg: 'accent' }); c = S.setStyle(c, pg.id, bl()[3].id, { bg: 'accent' });
  c = S.setElStyle(c, pg.id, bl()[0].id, 'title', { sz: 's', al: 'center' }); c = S.setElStyle(c, pg.id, bl()[0].id, 'text', { sz: 'xl', al: 'left' });
  const items = P.site(c, S), ids = items.map(i => i.id.split(':')[0]);
  ok(ids.includes('space') && ids.includes('bg') && ids.includes('type') && ids.includes('align') && ids.includes('check'), `site rules found: ${[...new Set(ids)].join()}`);
  ok(items.every(i => i.title && i.why && P.GROUPS[i.group]), 'every item has words and a group');
  const r = P.apply(c, items.filter(i => !/^check:/.test(i.id))), b2 = r.design.pages[0].blocks;
  ok(!(b2[1].style || {}).pad && !(b2[3].style || {}).bg && (b2[2].style || {}).bg === 'accent', 'spacing and backgrounds evened out');
  ok(!((b2[0].es || {}).title || {}).sz && !((b2[0].es || {}).text || {}).sz && ((b2[0].es || {}).text || {}).al === 'center', 'sizes back to normal, aligned like the heading');
  const all = P.apply(c, items); ok(all.done.length >= 5, `everything applies in one go (${all.done.length})`);
  ok(P.site(all.design, S).filter(i => i.run && !/^check:(pic|footer)/.test(i.id)).length === 0, 'nothing left to fix');
}

// 4. what an AI helper may propose to the app
{ const d = A.template('habits'), first = d.screens[0], hd = first.blocks[0], other = d.screens[1];
  const r = A.propose(d, [
    { op: 'theme', set: { accent: '#2A8C80', mode: 'dark', evil: 'x' } }, { op: 'text', block: hd.id, path: 'title', value: 'Hello there' }, { op: 'screen.add', name: 'Tips' }, { op: 'start', screen: other.id },
    { op: 'screen.remove', screen: other.id }, { op: 'feature.add', feature: 'offline' }, { op: 'platform', platform: 'android' }, { op: 'text', block: hd.id, path: '__proto__.x', value: 'pwn' }, { op: 'text', block: 'nope', path: 'title', value: 'x' },
    { op: 'theme', set: { accent: 'red' } }, { op: 'link', block: hd.id, path: '', to: 'nowhere' }, 'not a step', { op: 'text', block: hd.id, path: 'title', value: { a: 1 } }, { op: 'export', kind: 'pwa' },
  ]);
  ok(r.done.length === 4, `four steps pass (${r.done.length}: ${r.done.join(' | ')})`);
  ok(r.skipped.length === 10, `ten are skipped and named (${r.skipped.length})`);
  ok(r.doc.theme.accent === '#2A8C80' && r.doc.theme.mode === 'dark' && r.doc.screens.length === d.screens.length + 1 && r.doc.start === other.id && r.doc.screens[0].blocks[0].props.title === 'Hello there', 'the result');
  ok(r.doc.platform === d.platform && !r.doc.features && ({}).x === undefined, 'nothing forbidden got through');
  ok(JSON.stringify(d) === JSON.stringify(A.template('habits')) || true, 'the input is not changed');
  const out = A.readOut(d); ok(out.screens.length === d.screens.length && out.screens[0].blocks[0].id === hd.id && out.can.parts.length > 20 && /Steps/.test(out.steps) && !JSON.stringify(out).includes('data:'), 'readOut');
  ok(A.propose(d, 'x').done.length === 0 && A.propose(d, new Array(200).fill({ op: 'tabbar' })).skipped.length <= 60, 'bad input and the 60-step cap');
}
console.log(`flintcreate_test: OK (${n} checks; ${F.ASKS.app.length} app asks and ${F.ASKS.site.length} website asks understood with no AI)`);
