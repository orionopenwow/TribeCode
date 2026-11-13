// Flint's knowledge base only indexes user-facing help (server/flintkb.js HELP_DOCS): internal docs (audits, reviews,
// plans, launch checklists, research) never surface in "how do I…" answers. Usage: node app/test/flintkb_test.js
'use strict';
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..', '..'), UI = path.join(ROOT, 'app', 'ui');
const make = require(path.join(ROOT, 'server', 'flintkb.js'));
const kb = make({ ui: UI, nlu: require(path.join(UI, 'flintnlu.js')) });
const files = kb.files();
assert(files.length >= 10, 'help docs are indexed: ' + files.length);
const INTERNAL = /REPO-CLEANUP|REVIEW|APP-AUDIT|SETTINGS-AUDIT|WIDGETS-AUDIT|POLISH-AUDIT|UI-CLEANUP|OPENPAGE-PORT|FLINT-RESEARCH|WORK-BACKEND|SIGNUP-FLOWS|LAUNCH|ONE-PAGER|CONTEXT|TRUTH-TEST|PHONE-REPORT|TEST-REPORT|EXPLORE|RESEARCH|VISION|NAVIGATION|DESIGN-SYSTEM|DEV-TOOLS|APP-STORE|AD-PLAYBOOK|BRAND|GAME-STUDIO|NEXT-PHASE|FEATURES-NEXT|STUDIO-SCOPING|archive/i;
for (const f of files.filter(f => !/^docs\/guide\//.test(f))) assert(!INTERNAL.test(f), 'an internal doc is indexed: ' + f);
// every top-level doc is either on the allow-list or left out; a new file is left out by default
for (const f of fs.readdirSync(path.join(ROOT, 'docs')).filter(f => /\.md$/i.test(f))) assert.strictEqual(files.includes('docs/' + f), make.indexed(f), f);
assert(!make.indexed('APP-AUDIT-2026-11-13.md') && !make.indexed('SOMETHING-NEW.md') && make.indexed('HOSTING.md'));
// answers: a how-to still answers, and no answer cites an internal file
for (const q of ['how do I invite a friend', 'how do I host on my computer', 'launch checklist', 'what did the audit find', 'repo cleanup', 'two-factor plan', 'security review findings']) {
  for (const a of kb.ask(q, 5)) assert(!a.file || /^docs\/guide\//.test(a.file) || (!INTERNAL.test(a.file) && make.indexed(path.basename(a.file))), q + ' -> ' + a.file);
}
assert(kb.ask('how do I invite a friend', 3).length > 0, 'the Guide still answers');
console.log('flintkb_test: OK (' + files.length + ' help docs indexed)');
