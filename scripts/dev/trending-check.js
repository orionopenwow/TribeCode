#!/usr/bin/env node
// Validates templates/trending.json (the "Trending on GitHub" feed) before a daily job commits it.
//   node scripts/dev/trending-check.js            schema, permissive licenses, no duplicates, sane dates and links
//   node scripts/dev/trending-check.js --remote   also checks every repo exists on GitHub (git ls-remote, no token needed)
//   node scripts/dev/trending-check.js --sync     also rewrites the "tr-*" block of templates/marketplace.json from the feed
// Exit code 1 on any problem, with one line per problem.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const FEED = path.join(ROOT, 'templates', 'trending.json');
const MARKET = path.join(ROOT, 'templates', 'marketplace.json');
// The marketplace keeps a copy of the feed as "tr-*" entries, so search and Filters find them even offline.
const { check, licenseOk, LICENSES, toMarket } = require('../../server/trendcheck');

function remote(feed) {
  const errs = [];
  for (const it of feed.items) {
    try { execFileSync('git', ['ls-remote', '--exit-code', `https://github.com/${it.repo}`, 'HEAD'], { stdio: 'pipe', timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }); }
    catch { errs.push(`${it.repo}: not reachable on GitHub`); }
  }
  return errs;
}

function sync(feed) {
  // Text edit, not a re-serialize: the file keeps one entry per line, and the trending block stays one contiguous run
  // of lines at the end of "items" so daily commits make small, readable diffs.
  const text = fs.readFileSync(MARKET, 'utf8'), m = JSON.parse(text);
  const keep = m.items.filter(i => !String(i.id).startsWith('tr-'));
  const taken = new Set(keep.map(i => String(i.repo || '').toLowerCase() + '|' + (i.path || '')));
  const add = feed.items.filter(it => !taken.has(it.repo.toLowerCase() + '|' + (it.path || ''))).map(toMarket);
  const lines = text.replace(/\s*$/, '').split('\n').filter(l => !/^\s*\{"id":"tr-/.test(l));
  const end = lines.lastIndexOf(' ]'); if (end < 0) throw new Error('marketplace.json: could not find the end of "items"');
  const start = lines.findIndex(l => /"items": \[/.test(l)) + 1;
  const top = lines.slice(0, start);
  const all = [...lines.slice(start, end).map(l => l.replace(/,\s*$/, '')), ...add.map(i => '  ' + JSON.stringify(i))];
  fs.writeFileSync(MARKET, [...top, all.join(',\n'), ...lines.slice(end)].join('\n') + '\n');
  JSON.parse(fs.readFileSync(MARKET, 'utf8'));   // still valid JSON
  return add.length;
}

if (require.main === module) {
  let feed; try { feed = JSON.parse(fs.readFileSync(FEED, 'utf8')); } catch (e) { console.error(`trending.json: ${e.message}`); process.exit(1); }
  const errs = check(feed);
  if (process.argv.includes('--remote')) errs.push(...remote(feed));
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  let line = `trending.json ok: ${feed.items.length} repos, updated ${feed.updated}`;
  if (process.argv.includes('--sync')) line += ` · marketplace now has ${sync(feed)} trending entries`;
  console.log(line);
}
module.exports = { check, licenseOk, LICENSES };
