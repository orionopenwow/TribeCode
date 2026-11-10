// Validator for templates/trending.json, shared by server/trending.js (checks downloads) and
// scripts/dev/trending-check.js (checks the file before the daily job commits it).
'use strict';

// Permissive only. Copyleft and share-alike (GPL, AGPL, LGPL, CC-BY-SA), source-available (BSL, FSL, SUL) and unlicensed repos are never listed.
const LICENSES = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'CC0-1.0', 'Unlicense', 'Zlib', '0BSD'];
const KINDS = ['tool', 'library', 'skill', 'studio', 'connector', 'site-template', 'asset-pack'];
const SITES = ['TikTok', 'Instagram', 'Reddit', 'Threads', 'X', 'YouTube', 'Hacker News', 'Bluesky', 'LinkedIn', 'Product Hunt', 'Forum', 'News', 'Blog', 'Trendshift', 'GitTrend', 'GitHub'];
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, DATE = /^\d{4}-\d{2}-\d{2}$/;

// "MIT OR Apache-2.0" is fine when every option is permissive
const licenseOk = l => typeof l === 'string' && l.split(/\s+OR\s+/).every(x => LICENSES.includes(x.trim()));

function check(feed) {
  const errs = [], bad = (i, m) => errs.push(`${i ? i.repo || i.id || '?' : 'feed'}: ${m}`);
  if (!feed || typeof feed !== 'object') return ['feed: not an object'];
  if (!DATE.test(feed.updated || '')) bad(null, 'updated must be YYYY-MM-DD');
  if (typeof feed.about !== 'string' || feed.about.length < 40) bad(null, 'about is missing');
  if (!Array.isArray(feed.items) || !feed.items.length) return [...errs, 'feed: items must be a non-empty array'];
  const seenRepo = new Set(), seenId = new Set();
  for (const it of feed.items) {
    if (!REPO.test(it.repo || '')) bad(it, 'repo must be owner/name');
    const key = String(it.repo).toLowerCase();
    if (seenRepo.has(key)) bad(it, 'duplicate repo'); seenRepo.add(key);
    if (!/^tr-[a-z0-9-]+$/.test(it.id || '')) bad(it, 'id must look like tr-name');
    if (seenId.has(it.id)) bad(it, 'duplicate id'); seenId.add(it.id);
    for (const k of ['title', 'summary', 'why']) if (typeof it[k] !== 'string' || !it[k].trim()) bad(it, `${k} is missing`);
    if (it.summary && it.summary.length > 200) bad(it, 'summary is over 200 characters');
    if (!KINDS.includes(it.kind)) bad(it, `kind must be one of ${KINDS.join(', ')}`);
    if (it.kind === 'skill' && (typeof it.path !== 'string' || !it.path || it.path.includes('..'))) bad(it, 'a skill needs the folder path of its SKILL.md');
    if (!Array.isArray(it.tags) || !it.tags.includes('trending')) bad(it, 'tags must include "trending"');
    if (!licenseOk(it.license)) bad(it, `license "${it.license}" is not on the permissive list`);
    if (it.stars != null && !(Number.isInteger(it.stars) && it.stars >= 0)) bad(it, 'stars must be a whole number or null');
    if (!DATE.test(it.added || '')) bad(it, 'added must be YYYY-MM-DD');
    if (it.url && !/^https:\/\//.test(it.url)) bad(it, 'url must be https');
    if (it.kind === 'studio' && !it.url) bad(it, 'a studio needs a url (its site or download page)');
    if (!Array.isArray(it.seenOn) || !it.seenOn.length) bad(it, 'seenOn needs at least one public source');
    else for (const s of it.seenOn) {
      if (!SITES.includes(s.site)) bad(it, `seenOn site "${s.site}" is not a known site`);
      if (!/^https:\/\/[^\s]+$/.test(s.url || '')) bad(it, 'seenOn url must be https');
      if (!DATE.test(s.date || '')) bad(it, 'seenOn date must be YYYY-MM-DD');
    }
  }
  return errs;
}

// A feed item as a Marketplace entry (templates/marketplace.json keeps these as its "tr-*" block). The score is
// TribeCode's curated score, nudged by how widely the repo is used; it is not a star count.
const score = it => it.stars >= 50000 ? 70 : it.stars >= 15000 ? 66 : 62;
function toMarket(it) {
  const o = { id: it.id, kind: it.kind, emoji: it.emoji || '✨', title: it.title, summary: it.summary, tags: it.tags, for: it.for || ['app', 'game', 'site'], repo: it.repo };
  for (const k of ['url', 'path', 'install']) if (it[k]) o[k] = it[k];
  return { ...o, license: it.license, score: score(it), added: it.added };
}
module.exports = { check, licenseOk, LICENSES, KINDS, SITES, toMarket };
