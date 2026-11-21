#!/usr/bin/env node
// One source for every number the website and the README quote (feat/claims).
// The numbers are counted from the real sources below and written to site/facts.json; then every place that quotes one
// (site/*.html, site/*.js, site/lang/*.json, README.md, docs/guide/*.md) is stamped with the counted value, as plain
// text, so the pages read right with no JavaScript and the exact-text translations (site/i18n.js) keep matching.
//   node scripts/dev/site-facts.js          count, write site/facts.json, stamp every quoted number
//   node scripts/dev/site-facts.js --check  exit 1 when a quoted number differs from the count, when a number is quoted
//                                           that no rule knows (add a rule or reword it), or when docs/CLAIMS.md has a
//                                           row marked False (used by app/test/site_facts_test.js, in npm test)
// To quote a new number: add how it is counted to count(), a rule to RULES, then run this script.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const R = (...p) => path.join(root, ...p);
const read = f => fs.readFileSync(R(f), 'utf8');
const json = f => JSON.parse(read(f));
const CHECK = process.argv.includes('--check');

function count() {
  const nlu = require(R('app/ui/flintnlu.js'));
  const actions = new Set(nlu.catalog().map(x => x.id)).size;
  const academy = json('templates/academy.json');
  const market = json('templates/marketplace.json').items.length;
  const fx = require(R('app/ui/sitefx.js')).LIST.length;
  const dir = (read('app/ui/connectai.js').match(/const DIRECTORY = \[([^\]]*)\]/) || [, ''])[1].split(',').filter(s => s.trim()).length;
  const guides = json('templates/quickguides.json');
  const companies = json('templates/companies.json');
  const motion = require(R('app/ui/motionsocial.js'));          // Motion Studio's engine with the social posts and share clips
  const appc = require(R('app/ui/appcreator-core.js'));         // App Creator: templates, looks, parts, kits
  const lk = require(R('app/ui/launchkit-core.js'));            // Launch kit: screenshot styles, icon styles, paywalls, checklist
  const siteLangs = (read('site/i18n.js').match(/const LANGS = \[([\s\S]*?)\];/) || [, ''])[1].match(/\['[a-z]{2}'/g) || [];
  return {
    version: 'v' + json('package.json').version,
    flintActions: actions,                                   // every action Flint understands with no AI (TribeNLU.catalog)
    flintActionsAbout: Math.floor(actions / 10) * 10,        // quoted as "about N"
    addons: market,                                          // templates/marketplace.json
    addonsPlus: Math.floor(market / 50) * 50,                // quoted as "N+"
    lessons: academy.tracks.reduce((n, t) => n + (t.lessons || []).length, 0),
    tracks: academy.tracks.length,
    websiteTemplates: fs.readdirSync(R('templates/sites')).filter(d => !d.startsWith('_') && fs.existsSync(R('templates/sites', d, 'site.json'))).length,
    designerTemplates: (json('app/ui/sitetpl/catalog.json').templates || []).filter(t => !t.retired).length,   // the ones the gallery offers
    screenTemplates: fs.readdirSync(R('templates/canvas')).filter(f => f.endsWith('.json')).length,
    companyTemplates: (companies.templates || companies.companies || companies).filter(c => c.id !== 'blank').length,
    quickGuides: (guides.guides || guides).length,
    movingBackgrounds: fx,
    languages: siteLangs.length,
    agentTools: dir,                                         // the tools the "Connect your AI" directory lists
    remix: (read('site/index.html').match(/class="rx__card"/g) || []).length,
    appTemplates: appc.templateList().length,
    appLooks: Object.keys(appc.PRESETS).length,
    appParts: Object.keys(appc.BLOCKS).length,
    appScreens: Object.keys(appc.KITS).length,
    motionTemplates: motion.LIST.length,
    socialLayouts: motion.LIST.filter(id => motion.TEMPLATES[id].cat === 'social').length,
    motionFeels: motion.FEEL_LIST.length,
    shotStyles: lk.SHOT_STYLES.length,
    iconStyles: lk.ICON_STYLES.length,
    paywalls: lk.PAYWALLS.length,
    checklistSteps: lk.CHECKLIST.length,
  };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
const toNum = s => /^\d+$/.test(s) ? Number(s) : WORDS.indexOf(String(s).toLowerCase());
const like = (was, n) => /^\d+$/.test(was) ? String(n) : (WORDS[n] ? (/^[A-Z]/.test(was) ? WORDS[n][0].toUpperCase() + WORDS[n].slice(1) : WORDS[n]) : String(n));
const N = '(\\d+|' + WORDS.join('|') + ')';
// each rule: the fact, and a pattern whose first group is the quoted number
const RULES = [
  ['flintActionsAbout', `about ${N}(?: everyday)? actions`],
  ['addons', `${N} checked add-ons`],
  ['addonsPlus', `${N}\\+ (?:checked )?add-ons`],
  ['lessons', `${N} lessons in`],
  ['lessons', `${N} lessons, each`],
  ['lessons', `${N} short lessons`],
  ['websiteTemplates', `See all ${N}<`],
  ['websiteTemplates', `Website templates</b><span>${N}</span>`],
  ['tracks', `${N} tracks`],
  ['websiteTemplates', `${N} website templates`],
  ['websiteTemplates', `websites from ${N} templates`],
  ['websiteTemplates', `Websites \\(v0\\.28\\): ${N} templates`],
  ['websiteTemplates', `>${N} templates<`],
  ['designerTemplates', `It has ${N} templates`],
  ['designerTemplates', `dark mode: ${N} templates`],
  ['screenTemplates', `${N} screen templates`],
  ['screenTemplates', `canvas from ${N} templates`],
  ['companyTemplates', `seats, ${N} templates`],
  ['languages', `in ${N} languages`],
  ['languages', `${N} languages' command words`],
  ['agentTools', `lists ${N} tools`],
  ['remix', `Show all ${N}`],
  ['quickGuides', `${N} quick guides`],
  ['movingBackgrounds', `${N} moving(?: and 3D)? backgrounds`],
  ['appTemplates', `${N} apps to start from`],
  ['appLooks', `${N} app looks`],
  ['appParts', `${N} app parts`],
  ['appScreens', `${N} ready-made screens`],
  ['motionTemplates', `${N} motion templates`],
  ['socialLayouts', `${N} social post layouts`],
  ['motionFeels', `${N} motion feels`],
  ['shotStyles', `${N} screenshot styles`],
  ['iconStyles', `${N} icon styles`],
  ['paywalls', `${N} paywall designs`],
  ['checklistSteps', `${N}-step checklist`],
].map(([fact, src]) => ({ fact, re: new RegExp(src, 'gi') }));
// a number in front of one of these words must be covered by a rule
const LOOSE = /\b\d[\d,]*\+? (?:checked |everyday |website |screen |quick |moving |free )?(?:add-ons|lessons in|templates|tracks|guides|backgrounds|actions|languages)\b/gi;
const ALLOW = [/170 more website phrasings/];

function files() {
  const out = [];
  for (const f of fs.readdirSync(R('site'))) if (/\.(html|js)$/.test(f)) out.push('site/' + f);
  for (const f of fs.readdirSync(R('site/lang'))) if (f.endsWith('.json')) out.push('site/lang/' + f);
  out.push('README.md');
  for (const f of fs.readdirSync(R('docs/guide'))) if (f.endsWith('.md')) out.push('docs/guide/' + f);
  return out;
}

// stamp one piece of text; returns [text, changes]
function stamp(text, facts, seen) {
  let changes = [];
  for (const { fact, re } of RULES) {
    text = text.replace(re, (m, g) => {
      if (seen) seen.push(m);
      const want = facts[fact], have = toNum(g);
      if (have === want) return m;
      changes.push({ fact, was: g, now: like(g, want) });
      return m.replace(g, like(g, want));
    });
  }
  return [text, changes];
}

function run() {
  const facts = count();
  const problems = [], wrote = [];
  const factsText = JSON.stringify(facts, null, 2) + '\n';
  let haveFacts = null; try { haveFacts = read('site/facts.json'); } catch {}
  if (haveFacts !== factsText) { if (CHECK) problems.push('site/facts.json is out of date'); else { fs.writeFileSync(R('site/facts.json'), factsText); wrote.push('site/facts.json'); } }

  for (const f of files()) {
    const before = read(f); let after = before; const seen = [];
    if (f.startsWith('site/lang/')) {
      // "English": "translation" per line: stamp the English key, and carry the same number change into the translation
      after = before.split('\n').map(line => {
        const m = line.match(/^("(?:[^"\\]|\\.)*")(\s*:\s*)("(?:[^"\\]|\\.)*")(,?\s*)$/); if (!m) return line;
        const [key, ch] = stamp(m[1], facts, seen); if (!ch.length) return line;
        let val = m[3];
        for (const c of ch) {
          const re = new RegExp('(^|[^\\d])' + c.was.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\d)');
          if (/^\d+$/.test(c.was) && re.test(val)) val = val.replace(re, '$1' + c.now);
          else problems.push(`${f}: the translation of ${key.slice(0, 70)}… still quotes the old ${c.fact} (${c.was}); fix it by hand`);
        }
        return key + m[2] + val + m[4];
      }).join('\n');
    } else {
      [after] = stamp(before, facts);
      stamp(after, facts, seen);
      // the release tile on the home page shows the packaged version before (or without) GitHub's answer
      if (f === 'site/index.html') after = after.replace(/(data-gh="version">)[^<]*(<)/, `$1${facts.version}$2`);
      for (const m of after.match(LOOSE) || []) {
        if (ALLOW.some(a => a.test(m))) continue;
        const tail = m.replace(/^\D*/, '');
        if (!seen.some(s => s.includes(tail) || tail.includes(s.replace(/^\D*/, '')))) problems.push(`${f}: "${m}" is a number no rule counts (scripts/dev/site-facts.js)`);
      }
    }
    if (after !== before) { if (CHECK) problems.push(`${f}: quotes a number that differs from site/facts.json (run node scripts/dev/site-facts.js)`); else { fs.writeFileSync(R(f), after); wrote.push(f); } }
  }

  // the claims ledger: nothing on the site may be marked False
  try {
    const rows = read('docs/CLAIMS.md').split('\n').filter(l => /^\|/.test(l) && /\|\s*False\s*\|/.test(l));
    for (const r of rows) problems.push('docs/CLAIMS.md has a False claim: ' + r.slice(0, 120));
  } catch { problems.push('docs/CLAIMS.md is missing'); }

  if (problems.length) { console.error('site-facts: ' + problems.length + ' problem(s)\n  ' + problems.join('\n  ')); if (CHECK || problems.some(p => /by hand|no rule/.test(p))) process.exitCode = 1; }
  if (!CHECK) console.log('site-facts: ' + (wrote.length ? 'wrote ' + wrote.join(', ') : 'nothing to change'));
  else if (!problems.length) console.log('site-facts: OK (' + Object.keys(facts).length + ' facts, every quoted number matches)');
  return { facts, problems };
}
if (require.main === module) run();
module.exports = { count, run };
