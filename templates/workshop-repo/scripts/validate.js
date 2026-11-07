#!/usr/bin/env node
// Validates every item in items/<id>/ (workshop.json + files) and optionally rebuilds index.json.
// Zero dependencies, Node 20+. The same rules as TribeCode's server/workshop.js:
//   - workshop.json: id (matches the folder), kind, title, license (CC0-1.0, CC-BY-4.0, MIT, Apache-2.0), version, files[]
//   - every listed file exists, matches its size and sha256, has an allowed type, a safe path, 25 MB max
//   - 100 MB max per item, 300 files max, no files that are not listed, no symlinks
//   node scripts/validate.js                 check everything (exit 1 on any problem)
//   node scripts/validate.js --write-index   check, then write index.json from the valid items
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(process.argv.find(a => a.startsWith('--root='))?.slice(7) || path.join(__dirname, '..'));
const REPO = process.env.GITHUB_REPOSITORY || process.argv.find(a => a.startsWith('--repo='))?.slice(7) || '';
const KINDS = ['skill', 'recipe', 'template', 'asset', 'script'];
const LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'MIT', 'Apache-2.0'];
const EXT = new Set(['glb', 'gltf', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ogg', 'mp3', 'wav', 'json', 'md', 'txt', 'js', 'ts', 'lua', 'gd', 'cs', 'py', 'glsl', 'frag', 'vert', 'wgsl']);
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const MB = 1024 * 1024, FILE_MAX = 25 * MB, ITEM_MAX = 100 * MB, FILES_MAX = 300;
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/, SHA_RE = /^[a-f0-9]{64}$/, VER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

function safeRel(p) {
  if (typeof p !== 'string' || !p || p.length > 240 || p.includes('\0') || p.includes('\\')) return null;
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const parts = p.split('/');
  if (parts.length > 12 || parts.some(x => !x || x === '.' || x === '..' || x === '.git' || x.length > 100 || /[\x00-\x1f<>:"|?*]/.test(x) || /[. ]$/.test(x) || RESERVED.test(x))) return null;
  return p;
}
const ext = p => (p.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';

function listFiles(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) out.push({ rel: r, link: true });
    else if (e.isDirectory()) out.push(...listFiles(dir, r));
    else if (e.isFile()) out.push({ rel: r });
  }
  return out;
}

function checkItem(id) {
  const errs = [], dir = path.join(ROOT, 'items', id);
  if (!ID_RE.test(id)) return { errs: [`folder name "${id}" is not a valid id (lowercase letters, numbers, dashes)`] };
  let m; try { m = JSON.parse(fs.readFileSync(path.join(dir, 'workshop.json'), 'utf8')); } catch (e) { return { errs: [`workshop.json missing or not valid JSON (${e.message})`] }; }
  if (m.id !== id) errs.push(`id "${m.id}" must match the folder name "${id}"`);
  if (!KINDS.includes(m.kind)) errs.push(`kind must be one of ${KINDS.join(', ')}`);
  if (typeof m.title !== 'string' || !m.title.trim() || m.title.length > 80) errs.push('title is required (80 characters max)');
  if (m.summary !== undefined && (typeof m.summary !== 'string' || m.summary.length > 400)) errs.push('summary: 400 characters max');
  if (!LICENSES.includes(m.license)) errs.push(`license must be one of ${LICENSES.join(', ')}`);
  if (!VER_RE.test(String(m.version || ''))) errs.push('version looks like 1.2.3');
  if (m.tags !== undefined && (!Array.isArray(m.tags) || m.tags.length > 12 || m.tags.some(t => !/^[a-z0-9][a-z0-9-]{0,23}$/.test(t)))) errs.push('tags: up to 12, lowercase-dashes');
  if (!Array.isArray(m.files) || !m.files.length) errs.push('files[] is required');
  const listed = new Set(); let total = 0;
  for (const f of Array.isArray(m.files) ? m.files.slice(0, FILES_MAX + 1) : []) {
    const p = safeRel(f && f.path);
    if (!p) { errs.push(`unsafe path: ${JSON.stringify(f && f.path)}`); continue; }
    if (p === 'workshop.json') { errs.push('a file cannot be named workshop.json'); continue; }
    if (!EXT.has(ext(p))) { errs.push(`file type not allowed: ${p}`); continue; }
    if (!SHA_RE.test(String(f.sha256 || ''))) { errs.push(`${p}: sha256 missing`); continue; }
    if (listed.has(p.toLowerCase())) { errs.push(`duplicate: ${p}`); continue; }
    listed.add(p.toLowerCase());
    let buf; try { const st = fs.lstatSync(path.join(dir, p)); if (!st.isFile()) throw new Error('not a regular file'); buf = fs.readFileSync(path.join(dir, p)); } catch (e) { errs.push(`${p}: ${e.code === 'ENOENT' ? 'listed but missing' : e.message}`); continue; }
    if (buf.length > FILE_MAX) errs.push(`${p}: over 25 MB`);
    if (buf.length !== f.size) errs.push(`${p}: size is ${buf.length}, workshop.json says ${f.size}`);
    if (crypto.createHash('sha256').update(buf).digest('hex') !== f.sha256) errs.push(`${p}: sha256 does not match`);
    total += buf.length;
  }
  if (Array.isArray(m.files) && m.files.length > FILES_MAX) errs.push(`at most ${FILES_MAX} files`);
  if (total > ITEM_MAX) errs.push('item is over 100 MB');
  if (m.preview !== undefined && (!safeRel(m.preview) || !IMAGE.has(ext(m.preview)) || !listed.has(String(m.preview).toLowerCase()))) errs.push('preview must be one of the item\'s PNG/JPEG/WebP/GIF files');
  for (const f of listFiles(dir)) {
    if (f.link) errs.push(`${f.rel}: symlinks are not allowed`);
    else if (f.rel !== 'workshop.json' && !listed.has(f.rel.toLowerCase())) errs.push(`${f.rel}: not listed in workshop.json`);
  }
  return { errs, m, total };
}

function main() {
  const itemsDir = path.join(ROOT, 'items');
  const ids = fs.existsSync(itemsDir) ? fs.readdirSync(itemsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort() : [];
  const good = []; let bad = 0;
  for (const id of ids) {
    const { errs, m, total } = checkItem(id);
    if (errs.length) { bad++; console.log(`✗ ${id}\n  - ${errs.join('\n  - ')}`); continue; }
    console.log(`✓ ${id} ${m.version} (${m.kind}, ${m.license}, ${m.files.length} file${m.files.length === 1 ? '' : 's'})`);
    good.push({ schema: 1, id: m.id, kind: m.kind, title: m.title.trim(), summary: m.summary || '', tags: m.tags || [], license: m.license, author: m.author || '', version: m.version,
      files: m.files.map(f => ({ path: f.path, size: f.size, sha256: f.sha256 })), preview: m.preview, check: m.check, path: `items/${m.id}`, size: total });
  }
  if (process.argv.includes('--write-index')) {
    const idx = { schema: 1, repo: REPO || undefined, updated: new Date().toISOString(), items: good };
    fs.writeFileSync(path.join(ROOT, 'index.json'), JSON.stringify(idx, null, 2) + '\n');
    console.log(`index.json: ${good.length} item${good.length === 1 ? '' : 's'}`);
  }
  if (bad) { console.log(`\n${bad} item${bad === 1 ? '' : 's'} failed. See CONTRIBUTING.md.`); process.exit(1); }
}
main();
