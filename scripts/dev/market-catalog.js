#!/usr/bin/env node
// The Marketplace catalog (feat/market-v2). Three jobs:
//
//   node scripts/dev/market-catalog.js           writes app/ui/market-catalog.json, the slim copy of
//                                                templates/marketplace.json the app reads when no tribe answers
//   node scripts/dev/market-catalog.js --fetch   checks every item against its real source, then rewrites
//                                                templates/marketplace.json and the slim copy:
//     - GitHub repos are read over git (the sandbox proxy allows git, not the GitHub API): `git ls-remote` proves the
//       repo exists, a blobless depth-1 clone gives the last commit date, the LICENSE (to an SPDX id), the skill
//       folder (must hold SKILL.md) and the README's first real picture, which market-thumb.py turns into a small
//       WebP under app/ui/market-thumbs/. Nothing from a clone is ever executed.
//     - Dropped: repos that are gone or private, skill folders without SKILL.md, no clear license, libraries / tools /
//       connectors / skills untouched for 4+ years, link widgets that duplicate a real repo item (same title).
//       The drop list goes to templates/market-dropped.json with the reason.
//   node scripts/dev/market-catalog.js --check   fails when the slim copy is out of date or any item breaks the
//                                                schema: an http(s) source link, a license, an author, and a thumbnail
//                                                file that exists when one is named.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'templates', 'marketplace.json');
const OUT = path.join(ROOT, 'app', 'ui', 'market-catalog.json');
const THUMBS = path.join(ROOT, 'app', 'ui', 'market-thumbs');
const OWN = 'https://github.com/orionopenwow/TribeCode';
const KINDS = ['widget', 'company-template', 'playbook', 'skill', 'library', 'tool', 'studio', 'site-template', 'connector', 'asset-pack', 'legal', 'academy'];
const KEEP = ['id', 'kind', 'emoji', 'title', 'summary', 'tags', 'for', 'seat', 'url', 'repo', 'path', 'license', 'author', 'source', 'docs', 'updated', 'stars', 'thumb', 'thumbWide', 'install', 'mcp', 'score', 'added', 'featured', 'steps', 'verified'];

function slim(src) {
  const items = (src.items || []).map(it => Object.fromEntries(KEEP.filter(k => it[k] !== undefined).map(k => [k, it[k]])));
  return { items, out: JSON.stringify({ about: 'The Marketplace catalog, saved with the app (generated from templates/marketplace.json by scripts/dev/market-catalog.js).', checked: src.checked, items }) + '\n' };
}

// ---------- schema ----------
const HTTP = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
function problems(items) {
  const bad = [], ids = new Set();
  for (const it of items) {
    const p = m => bad.push(`${it.id || '?'}: ${m}`);
    if (!it.id || ids.has(it.id)) p('missing or duplicate id'); ids.add(it.id);
    if (!KINDS.includes(it.kind)) p(`unknown kind ${it.kind}`);
    if (!it.title || !it.summary) p('needs a title and a summary');
    if (!HTTP.test(it.source || '')) p('no http(s) source link');
    if (it.docs && !HTTP.test(it.docs)) p('docs link is not http(s)');
    if (!it.license || /see repo|per model|unknown/i.test(it.license)) p('no clear license');
    if (!it.author) p('no author');
    if (it.thumb && !fs.existsSync(path.join(ROOT, 'app', 'ui', it.thumb))) p(`thumbnail missing: ${it.thumb}`);
    if (it.thumb && !/^market-thumbs\/[a-z0-9._-]+\.webp$/.test(it.thumb)) p('thumbnail must be market-thumbs/*.webp');
  }
  return bad;
}

// ---------- git (read only) ----------
const CACHE = path.join(os.tmpdir(), 'tribe-market-git');
const git = (args, cwd, opts = {}) => new Promise(res => execFile('git', args, { cwd, timeout: 90000, maxBuffer: 32 * 1048576, encoding: opts.buffer ? 'buffer' : 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (e, out) => res(e ? null : out)));
const run = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 60000 }, (e, out) => res(e ? null : String(out))));

function spdx(text, file) {
  const t = String(text || '').slice(0, 6000).replace(/\s+/g, ' ');
  if (/^\s*\{/.test(text || '')) { try { const l = JSON.parse(text).license; return typeof l === 'string' ? l : (l && l.type) || null; } catch { return null; } }
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(t)) return 'AGPL-3.0';
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(t)) return /Version 2\.1/i.test(t) ? 'LGPL-2.1' : 'LGPL-3.0';
  if (/GNU GENERAL PUBLIC LICENSE/i.test(t)) return /Version 2/i.test(t) ? 'GPL-2.0' : 'GPL-3.0';
  if (/Apache License,? Version 2\.0|Apache-2\.0/i.test(t)) return 'Apache-2.0';
  if (/Mozilla Public License,? (Version|v\.?) ?2\.0/i.test(t)) return 'MPL-2.0';
  if (/Permission is hereby granted, free of charge/i.test(t)) return 'MIT';
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose/i.test(t)) return /0BSD|without fee is hereby granted\.? THE SOFTWARE/i.test(t) && !/copyright notice and this permission notice appear/i.test(t) ? '0BSD' : 'ISC';
  if (/Redistribution and use in source and binary forms/i.test(t)) return /Neither the name|names of its contributors/i.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  if (/This is free and unencumbered software released into the public domain/i.test(t)) return 'Unlicense';
  if (/CC0 1\.0|Creative Commons Zero|CC0-1\.0/i.test(t)) return 'CC0-1.0';
  if (/Attribution 4\.0 International/i.test(t)) return 'CC-BY-4.0';
  if (/SIL OPEN FONT LICENSE/i.test(t)) return 'OFL-1.1';
  if (/zlib License|This software is provided 'as-is', without any express or implied/i.test(t)) return 'Zlib';
  if (/Business Source License|Functional Source License|Elastic License|Server Side Public License|Commons Clause/i.test(t)) return 'source-available';
  return null;
}
const ONE = '(MIT|Apache-2\\.0|BSD-[23]-Clause|0BSD|ISC|Unlicense|CC0-1\\.0|CC-BY-4\\.0|OFL-1\\.1|Zlib|MPL-2\\.0|LGPL-[23]\\.[01]|GPL-[23]\\.0|AGPL-3\\.0)';
const PERMISSIVE_OR_CLEAR = new RegExp(`^${ONE}( (OR|AND) ${ONE})*$`, 'i');

// The MCP server setup the project's own README gives: the first "mcpServers" / "servers" entry in a JSON block,
// else the first `claude mcp add` line. Copied as written (placeholders like <YOUR_TOKEN> stay for the user to fill).
function mcpConfig(md) {
  for (const m of md.matchAll(/```(?:jsonc?|json5)?\s*\n([\s\S]*?)```/g)) {
    let j; try { j = JSON.parse(m[1].replace(/\/\/[^\n"]*$/gm, '').replace(/,(\s*[}\]])/g, '$1')); } catch { continue; }
    const box = j.mcpServers || j.servers || (j.mcp && (j.mcp.servers || j.mcp.mcpServers)) || (j.context_servers);
    if (!box || typeof box !== 'object') continue;
    const [name, cfg] = Object.entries(box)[0] || [];
    if (!name || !cfg || typeof cfg !== 'object' || !(cfg.command || cfg.url || cfg.serverUrl)) continue;
    const c = {}; for (const k of ['type', 'command', 'args', 'env', 'url', 'headers']) if (cfg[k] !== undefined) c[k] = cfg[k];
    if (!c.url && cfg.serverUrl) c.url = cfg.serverUrl;
    if (c.url && !c.type) c.type = 'http';
    if (c.args && !Array.isArray(c.args)) continue;
    if (typeof c.command === 'string' && /["']/.test(c.command)) continue;
    if (typeof c.command === 'string' && /\s/.test(c.command.trim()) && !c.args) { const [cmd, ...rest] = c.command.trim().split(/\s+/); c.command = cmd; c.args = rest; }
    if (JSON.stringify(c).length > 2000) continue;
    return { name: String(name).replace(/[^a-z0-9_-]/gi, '-').slice(0, 40), config: c, from: 'README' };
  }
  const line = /claude mcp add\s+((?:--?[a-z-]+(?:[ =]\S+)?\s+)*)([a-z0-9_.-]+)\s+(?:--\s+)?([^\n`]+)/i.exec(md);
  if (line) {
    const flags = line[1] || '', rest = line[3].trim().split(/\s+/);
    const t = /--transport[ =](\w+)/.exec(flags);
    if (t && /http|sse/.test(t[1])) return { name: line[2], config: { type: t[1], url: rest[0] }, from: 'README' };
    if (rest.some(x => /["']/.test(x))) return null;
    if (rest[0] && !/^https?:/.test(rest[0])) return { name: line[2], config: { command: rest[0], args: rest.slice(1) }, from: 'README' };
    if (/^https?:/.test(rest[0])) return { name: line[2], config: { type: 'http', url: rest[0] }, from: 'README' };
  }
  return null;
}

async function inspectRepo(repo, paths) {
  const dir = path.join(CACHE, repo.replace('/', '__'));
  const url = `https://github.com/${repo}.git`;
  const head = await git(['ls-remote', url, 'HEAD'], ROOT);
  if (!head || !head.trim()) return { gone: true };
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(CACHE, { recursive: true });
    if (await git(['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', '--quiet', url, dir], CACHE) == null) return { gone: true, why: 'clone failed' };
  }
  const date = ((await git(['log', '-1', '--format=%cI'], dir)) || '').trim().slice(0, 10);
  const files = ((await git(['ls-tree', '-r', '--name-only', 'HEAD'], dir)) || '').split('\n').filter(Boolean);
  const set = new Set(files);
  const show = (f, buffer) => git(['show', `HEAD:${f}`], dir, { buffer });
  const licIn = async prefix => {
    const fl = files.filter(x => x.startsWith(prefix) && /^(UN)?(LICEN[CS]E|COPYING)([-._][a-z0-9.-]+)?$/i.test(x.slice(prefix.length))), f = fl[0];
    const ids = [...new Set((await Promise.all(fl.slice(0, 3).map(async x => spdx(await show(x), x)))).filter(Boolean))];
    if (ids.length) return ids.sort().join(' OR ');
    if (set.has(prefix + 'package.json')) { const l = spdx(await show(prefix + 'package.json')); if (l && l !== 'UNLICENSED' && l !== 'SEE LICENSE IN LICENSE') return l; }
    return f ? 'unrecognized' : null;
  };
  const license = await licIn('');
  const mcpIn = async pre => {
    const rd = files.find(f => f.startsWith(pre) && /^readme\.(md|markdown)$/i.test(f.slice(pre.length)));
    const fromReadme = rd ? mcpConfig((await show(rd)) || '') : null;
    if (fromReadme) return fromReadme;
    if (set.has(pre + 'package.json')) { try { const pj = JSON.parse(await show(pre + 'package.json')); if (pj.name && !pj.private && pj.bin && /mcp/i.test(pj.name) && !/handler|adapter|sdk/i.test(pj.name)) return { name: pj.name.replace(/^@[^/]+\//, '').replace(/[^a-z0-9-]/gi, '-'), config: { command: 'npx', args: ['-y', pj.name] }, from: 'package.json' }; } catch {} }
    return null;
  };
  const sub = {};
  for (const p of paths) {
    const pre = p.replace(/^\/|\/$/g, '') + '/';
    sub[p] = { exists: set.has(pre.slice(0, -1)) || files.some(f => f.startsWith(pre)), skill: set.has(pre + 'SKILL.md'), license: await licIn(pre), mcp: await mcpIn(pre) };
  }
  const mcp = await mcpIn('');
  // the README's first real picture (a file in the repo, not a badge)
  let image = null;
  const readme = files.find(f => /^readme\.(md|markdown)$/i.test(f));
  if (readme) {
    const md = (await show(readme)) || '';
    const refs = [...md.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1] || m[2]);
    for (let r of refs) {
      r = r.replace(/[?#].*$/, '');
      const m = /^https:\/\/(?:github\.com\/([^/]+\/[^/]+)\/(?:raw|blob)\/[^/]+\/|raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/[^/]+\/)(.+)$/i.exec(r);
      let rel = null;
      if (m) { if ((m[1] || m[2]).toLowerCase() === repo.toLowerCase()) rel = m[3]; }
      else if (!/^[a-z]+:|^\/\//i.test(r)) rel = path.posix.normalize(r.replace(/^\.?\//, ''));
      if (!rel || !/\.(png|jpe?g|gif|webp)$/i.test(rel) || /badge|shield|logo-?small|icon\.|favicon/i.test(rel)) continue;
      rel = decodeURIComponent(rel);
      if (!set.has(rel)) continue;
      image = rel; break;
    }
  }
  return { date, license, sub, image, dir, mcp };
}

async function pool(list, n, fn) {
  let i = 0; const out = new Array(list.length);
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}

async function fetchAll() {
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const items = src.items, drop = [], keep = [];
  const repos = new Map();
  for (const it of items) if (it.repo) { const r = repos.get(it.repo) || new Set(); if (it.path) r.add(it.path); repos.set(it.repo, r); }
  const list = [...repos.keys()];
  let done = 0;
  const res = new Map((await pool(list, 6, async r => { const x = await inspectRepo(r, [...repos.get(r)]); if (++done % 20 === 0) process.stderr.write(`  ${done}/${list.length} repos\n`); return [r, x]; })));
  fs.mkdirSync(THUMBS, { recursive: true });
  const thumbOf = new Map();
  await pool(list, 3, async r => {
    const x = res.get(r); if (!x || x.gone || !x.image) return;
    const tmp = path.join(os.tmpdir(), 'tribe-market-img', r.replace('/', '__') + path.extname(x.image));
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    const buf = await git(['show', `HEAD:${x.image}`], x.dir, { buffer: true });
    if (!buf || buf.length > 15 * 1048576) return;
    fs.writeFileSync(tmp, buf);
    const name = r.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.webp';
    const outp = await run('python3', ['-I', path.join(__dirname, 'market-thumb.py'), tmp, path.join(THUMBS, name)]);
    if (!outp) return;
    const [w, h] = outp.trim().split(' ').map(Number);
    thumbOf.set(r, { thumb: 'market-thumbs/' + name, wide: w / h >= 1.3 && w / h <= 2.6 && w >= 200 });
  });
  const titles = new Set(items.filter(it => ['library', 'tool', 'studio', 'asset-pack'].includes(it.kind) && (it.repo || it.url)).map(it => it.title.toLowerCase()));
  const seen = new Set();
  const ageYears = d => (Date.now() - Date.parse(d)) / (365.25 * 864e5);
  for (const it of items) {
    const no = why => drop.push({ id: it.id, kind: it.kind, title: it.title, repo: it.repo || undefined, url: it.url || undefined, why });
    const key = `${it.kind}|${it.repo || it.url || it.ref || it.id}|${it.path || ''}`;
    if (seen.has(key)) { no('duplicate of another item'); continue; } seen.add(key);
    if (it.kind === 'widget' && it.widget && it.widget.kind === 'link' && titles.has(it.title.toLowerCase())) { no('duplicate: the open-source item with the same name is the real one'); continue; }
    delete it.verified;
    if (it.repo) {
      const x = res.get(it.repo);
      if (!x || x.gone) { no('repo is gone or private'); continue; }
      const s = it.path ? x.sub[it.path] : null;
      if (s && !s.exists) { no(`folder ${it.path} is gone from the repo`); continue; }
      if (it.kind === 'skill' && it.path && !s.skill) { no('skill folder has no SKILL.md'); continue; }
      let lic = (s && s.license && s.license !== 'unrecognized' ? s.license : null) || (x.license && x.license !== 'unrecognized' ? x.license : null);
      const claimed = String(it.license || '').replace(/ \(.*\)$/, '');
      if (!lic && x.license === 'unrecognized' && PERMISSIVE_OR_CLEAR.test(claimed)) lic = claimed;   // a license file in a form we don't parse: trust the curated id
      if (lic && /OR|AND/.test(claimed) && claimed.includes(lic)) lic = claimed;                     // dual licenses read as one
      if (!lic || !PERMISSIVE_OR_CLEAR.test(lic)) { no(`no clear open license (${lic || x.license || 'none found'})`); continue; }
      if (['library', 'tool', 'connector', 'skill'].includes(it.kind) && x.date && ageYears(x.date) > 4) { no(`untouched since ${x.date}`); continue; }
      it.license = lic.replace(/^zlib$/i, 'Zlib');
      it.updated = x.date || undefined;
      it.author = it.repo.split('/')[0];
      it.source = `https://github.com/${it.repo}${it.path ? `/tree/HEAD/${it.path}` : ''}`;
      it.docs = it.url && !/github\.com/i.test(it.url) ? it.url : `https://github.com/${it.repo}${it.path ? `/tree/HEAD/${it.path}` : ''}#readme`;
      const t = !it.path && thumbOf.get(it.repo);
      if (t) { it.thumb = t.thumb; it.thumbWide = t.wide || undefined; } else { delete it.thumb; delete it.thumbWide; }
      if (it.kind === 'connector') { const mc = (s && s.mcp) || (!it.path && x.mcp) || null; if (mc) it.mcp = mc; else delete it.mcp; }
      it.verified = `${today} git`;
    } else if (it.url) {
      if (!HTTP.test(it.url)) { no('link is not http(s)'); continue; }
      if (/per model|see repo/i.test(it.license || '')) { no('license differs per file, nothing clear to record'); continue; }
      let host = ''; try { host = new URL(it.url).hostname.replace(/^www\./, ''); } catch {}
      it.source = it.url; it.docs = it.docs || it.url;
      it.author = it.author || host.split('.').slice(-2, -1)[0].replace(/^./, c => c.toUpperCase()) || host;
      if (!it.license || /source-available/i.test(it.license)) it.license = it.kind === 'widget' ? 'Proprietary service' : it.license;
      if (!it.license) { no('no license'); continue; }
      it.license = it.license.replace(/ \(filter by license\)$/, '');
      it.verified = `${today} listed`;   // the sandbox proxy only reaches GitHub over git, so outside links are checked by hand at curation
    } else {
      // TribeCode's own: built-in widgets, playbooks, legal, academy, company templates and built-in asset packs
      const file = it.kind === 'legal' ? `templates/legal/${it.ref}.json` : it.kind === 'academy' ? 'templates/academy.json' : it.kind === 'company-template' ? 'templates/companies.json'
        : it.kind === 'asset-pack' ? 'templates/assets.json' : it.kind === 'playbook' ? 'templates/marketplace.json' : it.kind === 'connector' ? null : 'app/ui/widgets.js';
      if (!file || !fs.existsSync(path.join(ROOT, file))) { no('no source to point to'); continue; }
      if (/per model/i.test(it.license || '')) { no('license differs per file, nothing clear to record'); continue; }
      it.license = it.license || 'MIT';
      it.author = 'TribeCode';
      it.source = `${OWN}/blob/main/${file}`;
      it.docs = `${OWN}#readme`;
      it.verified = `${today} bundled`;
    }
    keep.push(it);
  }
  src.items = keep; src.checked = today;
  fs.writeFileSync(SRC, JSON.stringify(src, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'templates', 'market-dropped.json'), JSON.stringify({ about: 'Items scripts/dev/market-catalog.js --fetch took out of the Marketplace, with the reason.', checked: today, items: drop }, null, 2) + '\n');
  // thumbnails nobody uses any more
  const used = new Set(keep.map(it => it.thumb).filter(Boolean).map(t => path.basename(t)));
  for (const f of fs.readdirSync(THUMBS)) if (!used.has(f)) fs.unlinkSync(path.join(THUMBS, f));
  const bytes = fs.readdirSync(THUMBS).reduce((n, f) => n + fs.statSync(path.join(THUMBS, f)).size, 0);
  console.log(`checked ${list.length} repos: kept ${keep.length}, dropped ${drop.length}, ${used.size} thumbnails (${Math.round(bytes / 1024)} KB)`);
}

(async () => {
  if (process.argv.includes('--fetch')) await fetchAll();
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const { items, out } = slim(src);
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    const bad = problems(items);
    if (bad.length) { console.error(`market catalog: ${bad.length} problem(s)\n  ` + bad.slice(0, 40).join('\n  ')); process.exit(1); }
    if (cur !== out) { console.error('app/ui/market-catalog.json is out of date: run node scripts/dev/market-catalog.js'); process.exit(1); }
    const thumbs = items.filter(it => it.thumb).length;
    console.log(`market-catalog.json up to date and valid (${items.length} items, ${thumbs} with a picture, the rest get a drawn tile)`);
  } else { fs.writeFileSync(OUT, out); console.log(`wrote app/ui/market-catalog.json (${items.length} items, ${Math.round(out.length / 1024)} KB)`); }
})();
