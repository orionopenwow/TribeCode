// The first version is built from the sentence (app/ui/firstmake.js), with no AI. For 60+ sentences across kinds and
// subjects: the result differs from the raw template in what it is called and in at least three visible strings; a
// named feature gets its screen or section; no sample first names are left; a plain tracker about another subject has
// none of the template's stock items; the same sentence gives the same result; the brief, chips and tasks say what
// was understood.   node app/test/firstmake_test.js
'use strict';
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const UI = path.join(__dirname, '..', 'ui');
const M = require(path.join(UI, 'firstmake.js')), FL = require(path.join(UI, 'firstlook.js')), A = require(path.join(UI, 'appcreator-core.js')), S = require(path.join(UI, 'sitecfg.js'));
let n = 0; const fails = []; const ok = (c, m) => { n++; if (process.env.ALL) { if (!c) fails.push(m); } else assert.ok(c, m); };

// every visible string of a design (no ids, icons, links or pictures)
const words = x => { const out = []; const go = (v, k) => { if (typeof v === 'string') { if (v && !/^(id|type|icon|to|how|style|img|kind|variant|slug|shape|template|accent|font|radius|mode|preset|alt)$/.test(k) && !/^data:|^#[0-9a-f]{3,8}$/i.test(v)) out.push(v); } else if (Array.isArray(v)) v.forEach(y => go(y, k)); else if (v && typeof v === 'object') for (const kk of Object.keys(v)) go(v[kk], kk); }; go(x, ''); return out; };
const strip = x => JSON.parse(JSON.stringify(x, (k, v) => (k === 'id' ? undefined : v)).replace(/"[a-z]{3}-[a-z0-9]{4,8}"/g, '""').replace(/"b[a-z0-9]{6,10}"/g, '""'));
const tplSite = id => S.normalize(JSON.parse(fs.readFileSync(path.join(UI, 'sitetpl', id + '.json'), 'utf8')));
const NAMES = /\b(Maya|Alex|Ruth|Priya|Jordan Reyes|Sam Ortiz|Ana Silva|Jo Park|Alex Kim|Maya Lee)\b/;

function make(idea, name) {
  const g = FL.guess(idea), b = M.brief(idea);
  if (g.kind === 'app') { const raw = A.template(g.tpl, { name: 'RAW' }); return { g, b, raw, out: M.app(A, A.template(g.tpl, { name }), b, name, g.tpl) }; }
  if (g.kind === 'site') { const raw = tplSite(g.tpl); b.line = FL.line(idea); let c = S.fill(tplSite(g.tpl), { name, ...(b.line ? { tagline: b.line } : {}) }); c = (c && c.cfg) || c; return { g, b, raw, out: M.site(S, c, b, name, g.tpl) }; }
  return { g, b, raw: null, out: null };
}

// [sentence, name, kind, words the result must show, a feature that must be understood and built]
const CASES = [
  ['A habit tracker app for my running club with streaks and a weekly leaderboard', 'Running Club', 'app', /run/i, 'leaderboard'],
  ['to-do app for my chess club with a leaderboard and chat', 'Chess Club', 'app', /game|Chess Club/i, 'chat'],
  ['habit tracker for my dog with reminders', 'Good Dog', 'app', /walk/i, 'reminders'],
  ['a checklist app for my gym workouts', 'Gym List', 'app', /workout|train/i, null],
  ['notes app to study spanish, dark mode', 'Spanish Notes', 'app', /study|topic/i, 'dark'],
  ['a planner app for our band rehearsals and gigs', 'Band Plan', 'app', /gig|rehearsal/i, null],
  ['kanban board app for our wedding planning', 'Wedding Board', 'app', /guest|Wedding Board/i, null],
  ['a journal app for my travels with photos', 'Trip Journal', 'app', /stop|trip/i, 'photos'],
  ['todo app for household chores with my roommates', 'House Jobs', 'app', /chore|dishes|laundry/i, null],
  ['habit app for reading more books with streaks', 'Read More', 'app', /book|read|pages/i, 'streaks'],
  ['a to-do app for my class homework', 'Homework', 'app', /lesson|homework|topic|study/i, null],
  ['habit tracker for saving money with goals', 'Save Up', 'app', /expense|spent|saved|money/i, 'goals'],
  ['a notes app for recipes I cook', 'Cook Notes', 'app', /recipe|cook/i, null],
  ['todo app for my podcast episodes', 'Pod Tasks', 'app', /episode/i, null],
  ['a habit tracker for my soccer team with a leaderboard', 'Team Habits', 'app', /match|training|team/i, 'leaderboard'],
  ['planner app for our church community events', 'Parish Plan', 'app', /event|gathering|notice/i, null],
  ['to-do app for launching my startup with a timer', 'Launch List', 'app', /signup|launch/i, 'timer'],
  ['a habit app for practicing guitar every day', 'Six Strings', 'app', /song|scales|play/i, null],
  ['journal app for my mood and gratitude', 'Good Days', 'app', /Good Days/i, null],
  ['a budget app for my band', 'Band Budget', 'app', /Band Budget/i, null],
  ['workout app with a timer and a leaderboard for my friends', 'Lift Club', 'app', /Lift Club/i, 'leaderboard'],
  ['recipes app with search and favourites', 'Supper', 'app', /Supper/i, 'favourites'],
  ['a chat app for my family', 'Home Chat', 'app', /Home Chat/i, null],
  ['shopping list app that works offline', 'The List', 'app', /The List/i, 'offline'],
  ['a quiz app about space for kids', 'Space Quiz', 'app', /Space Quiz/i, null],
  ['trip planner app for our road trip with a map', 'Road Trip', 'app', /Road Trip/i, 'map'],
  ['a flashcards app to learn french words', 'Mots', 'app', /Mots/i, null],
  ['a booking app for my barber shop', 'Fresh Cuts', 'app', /Fresh Cuts/i, null],
  ['a meditation app with reminders, purple', 'Still', 'app', /Still/i, 'reminders'],
  ['pet care app for my two cats with photos', 'Cat Care', 'app', /Cat Care/i, 'photos'],
  ['a water tracker app with streaks and badges', 'Sip', 'app', /Sip/i, 'badges'],
  ['an events app for our neighbourhood with a poll', 'Block Party', 'app', /Block Party/i, 'poll'],
  ['a website for my dog walking business with prices and a contact form, green', 'Happy Paws', 'site', /walk|dog/i, 'shop'],
  ['a website for my bakery with a menu and a map', 'Sunrise Bakery', 'site', /Sunrise Bakery/i, 'map'],
  ['a site for our wedding with rsvp and a gallery', 'Ana and Leo', 'site', /Ana and Leo/i, 'photos'],
  ['link in bio for my band with tour dates', 'The Lows', 'site', /The Lows/i, null],
  ['a portfolio site for my photography with a contact form', 'Jo Shoots', 'site', /Jo Shoots/i, 'contact'],
  ['a website for our running club with a schedule and faq', 'River Runners', 'site', /River Runners/i, 'faq'],
  ['a landing page for my new app with a waitlist and pricing', 'Tidy', 'site', /Tidy/i, 'signup'],
  ['a blog about my travels with a newsletter', 'Far Places', 'site', /Far Places/i, 'signup'],
  ['a website for my tutoring business with testimonials and prices', 'Bright Tutor', 'site', /session|Bright Tutor/i, 'reviews'],
  ['a site for my book club with a calendar', 'Page Turners', 'site', /book|read/i, 'calendar'],
  ['a website for a nonprofit food bank with a team page and faq', 'Full Plates', 'site', /Full Plates/i, 'faq'],
  ['a page for my podcast with links', 'Small Talk', 'site', /Small Talk/i, null],
  ['a website for my hair salon with booking and prices', 'Curl Up', 'site', /Curl Up/i, 'shop'],
  ['a website for my yoga studio with a schedule, teal', 'Open Mat', 'site', /class|train|Open Mat/i, 'calendar'],
  ['a site for our soccer team with fixtures and a leaderboard', 'Park FC', 'site', /fixture|squad|Park FC/i, 'leaderboard'],
  ['a website for my real estate listings with a contact form', 'Key Homes', 'site', /listing|Key Homes/i, 'contact'],
  ['a personal website about me with links to my socials', 'Hi, I am Kit', 'site', /Kit/i, null],
  ['a website for my etsy shop of handmade candles, warm colours', 'Wick & Co', 'site', /Wick/i, null],
  ['a website for my church with events and a contact page', 'St Anne', 'site', /St Anne/i, 'contact'],
  ['a conference website with a schedule and faq', 'DevDay', 'site', /DevDay/i, 'faq'],
  ['a site for my chess club with a leaderboard and gallery', 'Knight Club', 'site', /Knight Club/i, 'leaderboard'],
  ['a website for my pet sitting service with reviews', 'Purr Sit', 'site', /Purr Sit/i, 'reviews'],
  ['a resume site for a designer, dark', 'Mina Cho', 'site', /Mina Cho/i, null],
  ['a website for my coffee shop with opening times and a gallery', 'Slow Drip', 'site', /Slow Drip/i, 'photos'],
  ['a newsletter page about gardening with a sign-up form', 'Dirt', 'site', /Dirt/i, 'signup'],
  ['a website for my gaming clan with a leaderboard', 'Night Owls', 'site', /Night Owls/i, 'leaderboard'],
  ['a simple page to send people to my app in the app store', 'Get Tidy', 'site', /Get Tidy/i, null],
  ['a website for my school class with homework and a calendar', 'Class 5B', 'site', /Class 5B/i, 'calendar'],
  ['a platformer game about a fox collecting stars', 'Fox Run', 'game', null, null],
  ['a snake game with a leaderboard', 'Snek', 'game', null, null],
  ['a memory matching game for kids with animals', 'Zoo Match', 'game', null, null],
];
ok(CASES.length >= 60, 'at least 60 sentences');

for (const [idea, name, kind, must, feat] of CASES) {
  const { g, b, raw, out } = make(idea, name);
  ok(g.kind === kind, `${idea}: kind ${g.kind} (wanted ${kind})`);
  const ch = M.chips(b, g.label); ok(ch[0] === g.label, `${idea}: chips start with the kind`);
  if (feat) ok(b.features.includes(feat), `${idea}: understood "${feat}" (${b.features.join(',')})`);
  if (kind === 'game') { ok(Array.isArray(M.tasks(b)), 'tasks never throw'); continue; }
  const w0 = words(raw), w1 = words(out), all = w1.join(' \n ');
  // differs from the raw template: what it is called, and at least three visible strings
  ok(all.includes(name), `${idea}: the name shows`);
  const fresh = [...new Set(w1.filter(x => !w0.includes(x)))];
  ok(fresh.length >= 3, `${idea}: at least 3 visible strings differ from the template (${fresh.length}: ${fresh.slice(0, 6).join(' | ')})`);
  if (must) ok(must.test(all), `${idea}: shows its own subject ${must} in: ${w1.slice(0, 12).join(' | ')}`);
  if (kind === 'app') ok(!NAMES.test(words(out.screens.flatMap(s => s.blocks.filter(x => x.type === 'header' || x.type === 'profile'))).join(' ')), `${idea}: no sample first names in greetings or the profile`);
  // a plain tracker about another subject keeps none of the template's stock items
  if (kind === 'app' && M.PLAIN[g.tpl] && b.domain && M.TPL_DOMAIN[g.tpl] !== b.domain) for (const stock of ['Drink water', 'Read 20 pages', 'Walk outside', 'No phone after 10', 'Good morning, Maya']) ok(!all.includes(stock), `${idea}: stock "${stock}" is gone`);
  // a named feature gets its screen or section
  if (feat && kind === 'app') { const f = M.FEATS.find(x => x.id === feat); ok((f.kit && (out.screens.length > raw.screens.length || out.screens.some(s => new RegExp(f.label.split(' ')[0], 'i').test(s.name) || s.blocks.some(x => x.type === f.kit)))) || f.fx.some(x => (out.features || []).includes(x)), `${idea}: "${feat}" is in the app (screens ${out.screens.map(s => s.name).join(', ')}; features ${(out.features || []).join(',')})`); }
  if (feat && kind === 'site') { const f = M.FEATS.find(x => x.id === feat); ok(!f.sec || out.pages.some(p => p.blocks.some(x => x.type === f.sec)), `${idea}: "${feat}" has its ${f.sec} section (${out.pages[0].blocks.map(x => x.type).join(',')})`); }
  // the same sentence gives the same result
  const again = make(idea, name).out; ok(JSON.stringify(strip(again)) === JSON.stringify(strip(out)), `${idea}: the same sentence gives the same result`);
  // the design is still valid for its tool
  if (kind === 'app') { ok(A.normalize(out).screens.length === out.screens.length && out.screens.every(s => s.blocks.length), `${idea}: a valid app`); ok(typeof A.screenHTML(out, out.screens[0]) === 'string', 'draws'); }
  else ok(typeof S.render(out, { mode: 'single' }) === 'string' && S.normalize(out).pages[0].blocks.length === out.pages[0].blocks.length, `${idea}: a valid site`);
  ok(M.tasks(b).every(t => typeof t === 'string' && t.length > 6 && t.length < 70), `${idea}: tasks read well (${M.tasks(b).join(' / ')})`);
}

// the running club, in detail
{ const { b, out } = make(CASES[0][0], 'Running Club'), all = words(out).join('\n');
  ok(b.domain === 'running' && b.audience === 'running club' && b.features.join() === 'leaderboard,streaks', JSON.stringify(b));
  ok(/Ready to run\?/.test(all) && /Easy run/.test(all) && /Log a run/.test(all) && /km this week/.test(all), 'running words');
  ok(out.screens.some(s => s.name === 'Leaderboard') && /Member 1/.test(all) && !/Priya|Sam\b/.test(words(out.screens.find(s => s.name === 'Leaderboard')).join(' ')), 'a leaderboard with honest placeholder members');
  ok((out.features || []).includes('streak'), 'streaks switched on'); ok(out.screens.some(s => s.name === 'New run'), '"New habit" became "New run"');
  ok(out.screens[0].blocks.find(x => x.type === 'tabs').props.items.some(i => i.label === 'Leaderboard'), 'the leaderboard is a tab');
  ok(M.tasks(b).includes('Let members log a run') && M.tasks(b).some(t => /leaderboard/i.test(t)), M.tasks(b).join(' / '));
  ok(M.chips(b, 'Phone app').join(' · ') === 'Phone app · running club · Leaderboard · Streaks', M.chips(b, 'Phone app').join(' · ')); }
// colours and dark
{ const { out } = make('a to-do app for my garden, green and dark', 'Garden'); ok(out.theme.accent === M.COLORS.green && out.theme.mode === 'dark', 'green and dark: ' + JSON.stringify(out.theme)); }
{ const { out } = make('a website for my bakery, pink', 'Rosa'); ok(out.theme.colors.accent && out.theme.colors.accent !== tplSite('cafe').theme.colors.accent, 'pink site accent'); }
// a site about another subject: no leftover plumbers, honest placeholders, never a made-up review
{ const { out } = make('a website for my dog walking business with prices and a contact form, green', 'Happy Paws'), all = words(out).join('\n');
  ok(!/plumb|Duluth|218\) 555/i.test(all), 'the template\'s own business is gone: ' + all.slice(0, 300)); ok(/Set your real prices/.test(all), 'prices are a placeholder'); }
{ const { out } = make('a website for my tutoring business with testimonials and prices', 'Bright Tutor'); const t = out.pages[0].blocks.find(x => x.type === 'testimonials'); ok(t && t.props.items.every(i => /real|will show|Their name|^$/i.test(i.quote + i.name)), 'testimonials are placeholders, never made up: ' + JSON.stringify(t && t.props.items)); }
// nothing to go on still works
{ const b = M.brief(''); ok(b.features.length === 0 && !b.domain && M.chips(b, 'Website').join() === 'Website' && M.tasks(b).length === 0, 'an empty sentence'); const d = M.app(A, A.template('todo', { name: 'X' }), b, 'X', 'todo'); ok(d.screens.length > 0, 'still an app'); }
// the fingerprint ignores ids and notices edits
{ const a = A.template('habits', { name: 'N' }), c = A.template('habits', { name: 'N' }); ok(M.sig(a) === M.sig(c), 'same design, different ids, same fingerprint'); c.screens[0].name = 'Edited'; ok(M.sig(a) !== M.sig(c), 'an edit changes it'); }
ok(M.BANK.length >= 30, '30 subjects in the word bank'); ok(M.BANK.every(d => d.items.length === 5 && d.stats.length === 3 && d.site.feats.length === 3), 'every subject is complete');
ok(M.FEATS.every(f => !f.kit || A.KITS[f.kit]), 'every kit exists: ' + M.FEATS.filter(f => f.kit && !A.KITS[f.kit]).map(f => f.kit));
{ const FX = require(path.join(UI, 'appfeatures.js')); ok(M.FEATS.every(f => f.fx.every(x => FX.get(x))), 'every working feature exists: ' + M.FEATS.flatMap(f => f.fx).filter(x => !FX.get(x))); }
ok(M.FEATS.every(f => !f.sec || S.BLOCKS[f.sec]), 'every site section exists');
if (fails.length) { console.log(fails.map(f => "FAIL " + String(f).slice(0, 330)).join("\n")); process.exit(1); }
console.log(`firstmake_test: OK (${n} checks, ${CASES.length} sentences)`);
