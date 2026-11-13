#!/usr/bin/env node
// Feedback digest (v0.27): reads the website's feedback (GitHub issues labelled "feedback", from the form on
// tribecode.org and .github/ISSUE_TEMPLATE/feedback.yml), plus reviews, and writes a short Markdown digest:
// counts per facet, what's new since last time, the themes people repeat, and for each note a suggested next step
// (the area of the code it touches) and a draft reply. Read-only: it never comments, labels or closes anything.
//
//   node scripts/dev/feedback-digest.js [--since 2026-11-01] [--repo owner/name] [--out digest.md] [--json]
//
// Needs the GitHub CLI (`gh`) signed in, or GH_TOKEN. The repo defaults to this checkout's origin remote.
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? a.concat([[x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : a), []));
function repoOf() {
  if (args.repo) return args.repo;
  try { const u = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim(); const m = u.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/); if (m) return `${m[1]}/${m[2]}`; } catch {}
  return 'orionopenwow/TribeCode';
}
const REPO = repoOf();
const gh = path => JSON.parse(execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github+json', path], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));

// facet -> where it lives in the code and the usual first step
const AREAS = {
  'Bug': { area: 'whatever the note names; reproduce first', step: 'Reproduce it, add a failing e2e check, fix, and reply with the version that has the fix.' },
  'Idea': { area: 'next steps in HANDOFF.md', step: 'Group with similar ideas; if three or more people ask, plan it for the next release.' },
  'Company mode': { area: 'server/company.js, app/ui/company.js', step: 'Check it against the Companies plan phases; small wording or flow fixes can ship in the next patch.' },
  'Work and hiring': { area: 'server/talent.js, app/ui/talent.js', step: 'Check gigs, time bank and compute flows; confirm nothing personal is shared publicly by default.' },
  'Learn and Academy': { area: 'site/learn.html, templates/academy.json', step: 'Fix the lesson text or add the missing topic; keep the plain words.' },
  'Marketplace': { area: 'templates/marketplace.json, server/market.js', step: 'Add or fix the item (real link, permissive license), or adjust the filters.' },
  'Design and look': { area: 'app/ui/*.css, docs/DESIGN-SYSTEM.md', step: 'Screenshot at 1440 and 390, fix spacing or contrast, compare before and after.' },
  'Phones': { area: 'app/ui/mobile2.*', step: 'Reproduce at 390px in Playwright; check no sideways scroll.' },
  'Website': { area: 'site/', step: 'Fix the copy or layout; check all eight languages still read well.' },
  'Something else': { area: 'triage', step: 'Read it, label it, and decide whether it belongs to one of the areas above.' },
};
const STOP = new Set('the a an and or to of in on for with it is i my me we our you your this that be can could would should when what how so just like not do does at as are was from have has but if its they them there their about into more than all any also very really want wish please make made get lot thing things tribecode'.split(' '));

function facetOf(issue) {
  const b = String(issue.body || ''), m = b.match(/### What is it about\?\s+([^\n]+)/), t = String(issue.title || '').match(/^Feedback \(([^)]+)\)/);
  return (m && m[1].trim()) || (t && t[1].trim()) || 'Something else';
}
function messageOf(issue) {
  const b = String(issue.body || ''), m = b.match(/### Tell us\s+([\s\S]*?)(\n### |$)/);
  return (m ? m[1] : b).replace(/_No response_/g, '').trim();
}
function draftReply(f, msg) {
  const first = msg.split(/\n/)[0].slice(0, 90);
  if (f === 'Bug') return `Thanks for reporting this: "${first}". We're reproducing it now and will reply here with the version that fixes it.`;
  if (f === 'Idea') return `Thanks for the idea: "${first}". We've added it to the plan; if others ask for it too, it moves up. We'll post here when it ships.`;
  return `Thanks for this: "${first}". We read every note; we'll follow up here with what changes.`;
}

function main() {
  const since = args.since ? new Date(args.since) : new Date(Date.now() - 14 * 864e5);
  let issues = [], reviews = [];
  try { issues = gh(`repos/${REPO}/issues?labels=feedback&state=all&per_page=100&since=${since.toISOString()}`).filter(i => !i.pull_request); }
  catch (e) { console.error(`Could not read ${REPO} issues (${String(e.message).split('\n')[0]}). Sign in with \`gh auth login\` or pass --repo.`); process.exit(1); }
  try { reviews = gh(`repos/${REPO}/issues?labels=review&state=all&per_page=50&since=${since.toISOString()}`).filter(i => !i.pull_request); } catch {}

  const notes = issues.map(i => ({ n: i.number, url: i.html_url, at: i.created_at, state: i.state, facet: facetOf(i), msg: messageOf(i), comments: i.comments, reactions: (i.reactions || {}).total_count || 0 }));
  const byFacet = {}; notes.forEach(x => { (byFacet[x.facet] = byFacet[x.facet] || []).push(x); });
  const words = {}; notes.forEach(x => new Set(x.msg.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).forEach(w => { if (!STOP.has(w)) words[w] = (words[w] || 0) + 1; }));
  const themes = Object.entries(words).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const unanswered = notes.filter(x => x.state === 'open' && !x.comments);

  if (args.json) { process.stdout.write(JSON.stringify({ repo: REPO, since, notes, themes, reviews: reviews.length }, null, 2) + '\n'); return; }
  const L = [];
  L.push(`# Feedback digest · ${REPO}`, '', `Since ${since.toISOString().slice(0, 10)}: **${notes.length}** notes (${unanswered.length} waiting for a first reply), ${reviews.length} reviews.`, '');
  L.push('## By facet', '', ...Object.entries(byFacet).sort((a, b) => b[1].length - a[1].length).map(([f, xs]) => `- **${f}**: ${xs.length}`), '');
  if (themes.length) L.push('## Words people repeat', '', themes.map(([w, c]) => `${w} (${c})`).join(' · '), '');
  L.push('## Each note, with a suggested next step', '');
  for (const [f, xs] of Object.entries(byFacet)) {
    const a = AREAS[f] || AREAS['Something else'];
    L.push(`### ${f}`, `_Where: ${a.area}. Usual step: ${a.step}_`, '');
    for (const x of xs.sort((p, q) => (q.reactions - p.reactions) || q.at.localeCompare(p.at))) {
      L.push(`- [#${x.n}](${x.url}) ${x.state === 'open' ? '' : '(closed) '}${x.reactions ? `👍${x.reactions} ` : ''}${x.msg.split('\n')[0].slice(0, 160)}`);
      if (x.state === 'open' && !x.comments) L.push(`  - Draft reply: ${draftReply(f, x.msg)}`);
    }
    L.push('');
  }
  const md = L.join('\n');
  if (args.out) { fs.writeFileSync(args.out, md); console.log(`Wrote ${args.out}`); } else process.stdout.write(md + '\n');
}
main();
