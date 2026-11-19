// The first preview's guess (app/ui/firstlook.js, pass 6): what someone types when they start a project -> the kind of
// first version (website / phone app / game) and the template it starts from. Every template id must exist.
// Usage: node app/test/firstlook_test.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const F = require('../ui/firstlook.js');
const UI = path.join(__dirname, '..', 'ui');
global.window = {}; const A = require('../ui/appcreator-core.js');
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };

const CASES = [
  ['A cozy pixel game where friends water plants at night', 'game', null, 'platformer'],
  ["A website for my friend's bakery", 'site', 'business', 'cafe'],
  ['An app that tracks our habits', 'app', 'app', 'habits'],
  ['A party quiz for game night', 'app', 'app', 'trivia'],
  ['link in bio for my tiktok', 'site', 'linkbio', 'linkbio'],
  ['a page for my app Pocket Plant', 'site', 'app', 'gh-project'],
  ['send people to my app on the app store', 'site', 'app', 'app-redirect'],
  ['a portfolio for my photography', 'site', 'portfolio', 'portfolio'],
  ['wedding site for Sam and Alex', 'site', 'event', 'wedding'],
  ['a blog about hiking', 'site', 'blog', 'blog'],
  ['a budget tracker for our flat', 'app', 'app', 'budget'],
  ['a snake game', 'game', null, 'snake'],
  ['tetris clone with neon colors', 'game', null, 'blocks'],
  ['a platformer with silly bosses', 'game', null, 'platformer'],
  ['an endless runner', 'game', null, 'runner'],
  ['a top-down dungeon crawler', 'game', null, 'topdown'],
  ['a recipes app for our family', 'app', 'app', 'recipes'],
  ['a workout log', 'app', 'app', 'workout'],
  ['a landing page for our startup', 'site', 'business', 'saas'],
  ['a site for our running club', 'site', 'business', 'club'],
  ['our band Lantern Moths', 'site', 'business', 'band'],
  ['a shop for my handmade mugs', 'site', 'business', 'merch'],
  ['habit tracker', 'app', 'app', 'habits'],
  ['a to-do list for chores', 'app', 'app', 'todo'],
  ['plan our trip to Japan', 'app', 'app', 'trip'],
  ['a memory matching game for kids', 'game', null, 'memory'],
  ['a breakout game', 'game', null, 'breakout'],
  ['a newsletter about design', 'site', 'blog', 'blog'],
  ['my resume', 'site', 'portfolio', 'resume'],
  ['a café menu', 'site', 'business', 'cafe'],
  ['a meditation timer', 'app', 'app', 'meditation'],
  ['water reminder app', 'app', 'app', 'water'],
  ['a chat app for our team', 'app', 'app', 'chat'],
  ['a game about cats', 'game', null, 'platformer'],
  ['juego de plataformas', 'game', null, 'platformer'],
  ['un sitio web para mi panadería', 'site', 'business', 'cafe'],
  ['a conference page for DevDays', 'site', 'event', 'conference'],
  ['a podcast site', 'site', 'blog', 'podcast'],
  ['a flashcards app for Spanish words', 'app', 'app', 'flashcards'],
  ['a page for our GitHub project', 'site', 'app', 'gh-project'],
  ['an app for our book club', 'app', 'app', 'bookclub'],
  ['a kanban board for the band', 'app', 'app', 'kanban'],
  ['my links', 'site', 'linkbio', 'linkbio'],
  ['something cool', 'site', 'business', null],
];
for (const [idea, kind, sub, tpl] of CASES) {
  const g = F.guess(idea);
  ok(g.kind === kind, `${idea}: kind ${g.kind}, want ${kind}`);
  if (sub) ok(g.sub === sub, `${idea}: sub ${g.sub}, want ${sub}`);
  if (tpl) ok(g.tpl === tpl, `${idea}: template ${g.tpl}, want ${tpl}`);
}
ok(F.guess('something cool').sure === false, 'an unclear idea says it is a guess');
ok(F.guess("A website for my friend's bakery").sure === true, 'a clear idea is not a guess');

// every template the guess can name exists
const siteIds = new Set(fs.readdirSync(path.join(UI, 'sitetpl')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')));
for (const [, [def, more]] of Object.entries(F.SITE_TPL)) for (const id of [def, ...more.map(x => x[0])]) ok(siteIds.has(id), `website template ${id} exists`);
const appIds = new Set(A.templateList().map(t => t.id));
for (const [id] of F.APP_TPL) ok(appIds.has(id), `App Creator template ${id} exists`);
const games = new Set(JSON.parse(fs.readFileSync(path.join(UI, 'starters', 'catalog.json'), 'utf8')).items.filter(x => x.kind === 'game').map(x => x.id));
for (const [id] of F.GAME_TPL) ok(games.has(id), `game starter ${id} exists`);

// "Make it an app instead" keeps the idea and picks that kind's closest template
ok(F.forced("A website for my friend's bakery", 'app').kind === 'app', 'forced app');
ok(F.forced('An app that tracks our habits', 'site').kind === 'site', 'forced site');
ok(F.forced('a snake app', 'game').tpl === 'snake', 'forced game keeps the closest starter');

// the line the page shows: the person's own words, without "make me a website for"
ok(F.line('Make me a website for Sunrise Bakery, warm colors') === 'Sunrise Bakery, warm colors.', 'line: ' + F.line('Make me a website for Sunrise Bakery, warm colors'));
ok(F.line('a site') === '', 'line: too short says nothing');

console.log(bad ? `${bad} of ${n} checks failed` : `firstlook_test: all ${n} checks passed (${CASES.length} phrasings)`);
process.exit(bad ? 1 : 0);
