// feat/dropzone: Flint reads a dropped folder (or a pile of files) in the browser, before anything is uploaded, with no AI.
// It works out what the set is (a Vite + React app, a Python project, a static site, a photo set, a CSV data set, a Unity
// or Godot game…), the key facts (README summary, entry points, scripts, dependencies, license, TODOs, tests, colors of
// the pictures, CSV columns) and the flags (secrets, huge files, binaries, executables, duplicates), writes one short
// summary line and the suggestions that fit. It also answers follow-up questions locally (counts, search, file lookups,
// README facts) and builds the context pack for an AI when a question needs real reasoning. Pure: browser and Node.
//   window.TribeFolderRead = { analyze(items, opts) -> report, answer(report, q) -> { text, files, needsAI } | null,
//     pack(report, q) -> text, skipReason(path, ignore), isSecretName(name), scanSecrets(text), gitignore(text),
//     classify(path), csv(text), readme(text), TEXT_EXT }
//   items = [{ path: 'src/App.jsx', size, file?: Blob, text?: string }]
//   opts = { name, readText(item) -> text|null, colorsOf(items) -> ['#hex'], hashOf(item) -> string }
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFolderRead = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ---------- what to skip, what is secret ----------
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.cache', '.parcel-cache', '.turbo', 'coverage',
    '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', 'target', 'Library', 'Temp', 'Obj', 'Logs', '.godot', '.import', '.gradle', '.idea', '.vs', 'bower_components', 'Pods', 'DerivedData']);
  const SKIP_FILES = /^(\.DS_Store|Thumbs\.db|desktop\.ini|.*\.pyc|.*\.pyo|.*\.class|.*\.o|npm-debug\.log.*|yarn-error\.log)$/i;
  const SECRET_NAME = /^(\.env(\..*)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|keystore|jks|kdbx|asc|gpg|ppk)|credentials(\..*)?|secrets?(\..*)?|\.npmrc|\.netrc|\.htpasswd|.*service[-_]?account.*\.json|\.pypirc|\.git-credentials)$/i;
  const isSecretName = n => SECRET_NAME.test(String(n || '').split('/').pop()) && !/^\.env\.(example|sample|template|dist)$/i.test(String(n || '').split('/').pop());
  const SECRET_RX = [
    [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/, 'a private key'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
    [/\bsk-(?:proj-|live-|ant-)?[A-Za-z0-9_-]{20,}/, 'an API key (sk-…)'],
    [/\bsk_live_[0-9a-zA-Z]{20,}/, 'a Stripe live key'],
    [/\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/, 'a GitHub token'],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
    [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
    [/(?:api[_-]?key|secret|passw(?:or)?d|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i, 'a password or key in the code'],
  ];
  function scanSecrets(text) {
    const s = String(text || ''); if (!s) return null;
    for (const [rx, why] of SECRET_RX) { const m = rx.exec(s); if (m) return { why, line: s.slice(0, m.index).split('\n').length }; }
    return null;
  }
  const redact = text => SECRET_RX.reduce((t, [rx]) => t.replace(new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g'), '[secret removed]'), String(text || ''));
  // a root .gitignore, simply: names, dir/, *.ext, /path, a/b (no negation)
  function gitignore(text) {
    const pats = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('!')).slice(0, 200).map(l => {
      const dir = l.endsWith('/'), anchored = l.startsWith('/'), body = l.replace(/^\/|\/$/g, '');
      const rx = new RegExp('^' + body.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
      return { rx, dir, anchored, slash: body.includes('/') };
    });
    return p => {
      const parts = String(p).split('/');
      for (const x of pats) {
        if (x.anchored || x.slash) { for (let i = 1; i <= parts.length; i++) if (x.rx.test(parts.slice(0, i).join('/')) && (!x.dir || i < parts.length)) return true; continue; }
        for (let i = 0; i < parts.length; i++) if (x.rx.test(parts[i]) && (!x.dir || i < parts.length - 1)) return true;
      }
      return false;
    };
  }
  // why a path is skipped by default ('' = keep). `rel` is relative to the dropped folder.
  function skipReason(rel, ignore) {
    const parts = String(rel).split('/'), name = parts[parts.length - 1];
    for (const d of parts.slice(0, -1)) { if (d === '.git') return 'git'; if (SKIP_DIRS.has(d)) return d; }
    if (SKIP_FILES.test(name)) return 'junk';
    if (ignore && ignore(rel) && !isSecretName(name)) return '.gitignore';   // a secret stays in the set, flagged (and kept out of uploads)
    return '';
  }

  // ---------- file kinds ----------
  const EXT = p => { const n = String(p).split('/').pop().toLowerCase(); const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1) : ''; };
  const CAT = {
    image: 'png jpg jpeg gif webp avif bmp heic heif tif tiff svg ico raw cr2 nef arw dng',
    audio: 'mp3 wav ogg m4a flac aac aif aiff opus mid midi',
    video: 'mp4 mov webm mkv avi m4v',
    code: 'js mjs cjs jsx ts tsx vue svelte py rb go rs c h cpp hpp cc cs java kt swift php lua gd gdshader shader hlsl glsl sh ps1 bat cmd pl r scala dart ex exs elm clj hs zig nim sql html htm css scss sass less astro',
    data: 'csv tsv json jsonl ndjson xml yaml yml toml parquet sqlite db xlsx xls ods',
    doc: 'md markdown txt rtf pdf doc docx odt pages epub tex rst org',
    slides: 'ppt pptx key odp',
    design: 'fig sketch psd ai xd afdesign afphoto kra blend aseprite ase procreate indd',
    font: 'ttf otf woff woff2',
    model: 'glb gltf fbx obj stl dae usdz 3ds',
    archive: 'zip 7z rar tar gz tgz bz2 xz',
    exec: 'exe dll so dylib msi apk ipa jar app dmg deb rpm bin wasm',
  };
  const BY_EXT = {}; for (const [k, v] of Object.entries(CAT)) for (const e of v.split(' ')) BY_EXT[e] = k;
  const classify = p => BY_EXT[EXT(p)] || 'other';
  const TEXT_EXT = new Set('js mjs cjs jsx ts tsx vue svelte py rb go rs c h cpp hpp cc cs java kt swift php lua gd gdshader shader hlsl glsl sh ps1 bat cmd pl r scala dart ex exs elm clj hs zig nim sql html htm css scss sass less astro csv tsv json jsonl xml yaml yml toml md markdown txt rst org tex ini cfg conf env gitignore editorconfig lock mod sum tscn tres godot unity meta prefab asset csproj sln gradle properties svg'.split(' '));
  const isTextPath = p => { const n = String(p).split('/').pop().toLowerCase(); return TEXT_EXT.has(EXT(p)) || /^(readme|license|licence|copying|makefile|dockerfile|procfile|gemfile|rakefile|\.env.*|\.gitignore|\.npmrc|cargo\.lock|requirements.*\.txt)$/.test(n); };
  const fsize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`;
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : ws || w + 's'}`;

  // ---------- small readers ----------
  function readme(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const title = ((lines.find(l => /^#\s+/.test(l)) || '').replace(/^#\s+/, '') || '').replace(/[*_`]/g, '').trim();
    const paras = String(text || '').replace(/\r/g, '').replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/).map(p => p.trim())
      .filter(p => p && !/^#/.test(p) && !/^(\[!\[|!\[|<)/.test(p) && !/^[-*|>]/.test(p) && /[a-z]{3}/i.test(p))
      .map(p => p.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const first = paras[0] || '';
    const sentences = first.match(/[^.!?]+[.!?]+/g) || (first ? [first] : []);
    const summary = sentences.slice(0, 2).join(' ').trim().slice(0, 280);
    // "Pantry is a recipe site for busy cooks." -> "a recipe site for busy cooks"
    const m = /\b(?:is|are|—|–|-|:)\s+((?:an?|the|your|my|our)\s+[^.!?;]{3,90})/i.exec(sentences[0] || '');
    const about = m ? m[1].replace(/\s+(?:that|which|built|made|written)\b.*$/i, '').trim() : '';
    return { title, summary, about };
  }
  function csv(text) {
    const s = String(text || '').replace(/\r/g, ''), lines = s.split('\n').filter(l => l.trim());
    if (!lines.length) return null;
    const sep = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? '\t' : (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const split = l => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
    const head = split(lines[0]), rows = lines.slice(1, 201).map(split);
    const type = vals => { const v = vals.filter(x => x !== ''); if (!v.length) return 'empty'; if (v.every(x => /^-?[\d,]*\.?\d+(e-?\d+)?%?$/i.test(x.replace(/^[$€£]/, '')))) return 'number'; if (v.every(x => /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(x))) return 'date'; if (v.every(x => /^(true|false|yes|no|0|1)$/i.test(x))) return 'yes/no'; return 'text'; };
    return { sep, rows: lines.length - 1, columns: head.map((h, i) => ({ name: h || `Column ${i + 1}`, type: type(rows.map(r => r[i] || '')) })), sample: rows.slice(0, 5) };
  }
  const json = t => { try { return JSON.parse(t); } catch { return null; } };
  function licenseOf(t) { t = String(t || ''); return /MIT License|Permission is hereby granted, free of charge/i.test(t) ? 'MIT' : /Apache License/i.test(t) ? 'Apache-2.0' : /GNU AFFERO/i.test(t) ? 'AGPL' : /GNU LESSER/i.test(t) ? 'LGPL' : /GNU GENERAL PUBLIC/i.test(t) ? 'GPL' : /Redistribution and use in source and binary forms/i.test(t) ? 'BSD' : /ISC License/i.test(t) ? 'ISC' : /Mozilla Public License/i.test(t) ? 'MPL-2.0' : /unlicense/i.test(t) ? 'Unlicense' : t.trim() ? 'a custom license' : ''; }

  // ---------- analyze ----------
  async function analyze(items, opts = {}) {
    items = (items || []).filter(x => x && x.path);
    const name = opts.name || (items.length ? (items.every(x => x.path.includes('/')) && new Set(items.map(x => x.path.split('/')[0])).size === 1 ? items[0].path.split('/')[0] : 'these files') : 'nothing');
    // paths relative to the dropped folder (one folder dropped: drop its own name)
    const strip = items.every(x => x.path.startsWith(name + '/'));
    const rel = x => strip ? x.path.slice(name.length + 1) : x.path;
    const files = items.map(x => ({ item: x, rel: rel(x), name: x.path.split('/').pop(), ext: EXT(x.path), cat: classify(x.path), size: +x.size || (x.file && x.file.size) || 0 }));
    const text = {}; let budget = opts.maxText || 6 * 1048576;
    const readText = opts.readText || (async x => (x.text != null ? x.text : x.file && x.file.text ? x.file.text() : null));
    // text: the important files first (manifests, README), then code and data, small before big
    const order = files.filter(f => isTextPath(f.rel) && !isSecretName(f.name) && f.size <= 512 * 1024)
      .sort((a, b) => (imp(b) - imp(a)) || a.size - b.size);
    function imp(f) { return /^(package\.json|readme(\..*)?|project\.godot|cargo\.toml|go\.mod|pyproject\.toml|requirements\.txt|license.*|index\.html?)$/i.test(f.rel) ? 3 : /^(readme|license)/i.test(f.name) ? 2 : f.cat === 'code' ? 1 : 0; }
    for (const f of order) { if (f.size > budget) continue; let t = null; try { t = await readText(f.item); } catch {} if (typeof t === 'string') { text[f.rel] = t; budget -= t.length; } if (budget <= 0) break; }
    // also scan (but do not keep) the secret-named ones: they are flagged by name anyway
    const R = { name, files: files.length, bytes: files.reduce((n, f) => n + f.size, 0), folders: 0, cats: {}, exts: {}, tree: [], kind: null, key: {}, flags: {}, text, list: files.map(f => ({ path: f.rel, size: f.size, cat: f.cat })) };
    const dirs = new Set(); for (const f of files) { const p = f.rel.split('/'); for (let i = 1; i < p.length; i++) dirs.add(p.slice(0, i).join('/')); }
    R.folders = dirs.size;
    for (const f of files) { R.cats[f.cat] = (R.cats[f.cat] || 0) + 1; if (f.ext) R.exts[f.ext] = (R.exts[f.ext] || 0) + 1; }
    R.tree = treeLines(files.map(f => f.rel), 40);
    const has = rx => files.find(f => rx.test(f.rel));
    const top = n => files.find(f => f.rel.toLowerCase() === n.toLowerCase());
    const K = R.key;
    // README
    const rd = files.filter(f => /^readme(\.(md|markdown|txt|rst))?$/i.test(f.name)).sort((a, b) => a.rel.split('/').length - b.rel.split('/').length)[0];
    if (rd && text[rd.rel] != null) K.readme = { path: rd.rel, ...readme(text[rd.rel]) };
    // manifests
    const pkgF = files.filter(f => f.name === 'package.json' && !f.rel.includes('node_modules/')).sort((a, b) => a.rel.split('/').length - b.rel.split('/').length)[0];
    const pkg = pkgF && json(text[pkgF.rel]);
    const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
    if (pkg) { K.package = { name: pkg.name || '', version: pkg.version || '', path: pkgF.rel }; K.scripts = pkg.scripts || {}; K.deps = Object.keys(pkg.dependencies || {}); K.devDeps = Object.keys(pkg.devDependencies || {}); if (pkg.license) K.license = String(pkg.license); }
    const req = files.find(f => /^requirements.*\.txt$/i.test(f.name)), pyproj = top('pyproject.toml'), gomod = files.find(f => f.name === 'go.mod'), cargo = files.find(f => f.name === 'Cargo.toml');
    if (req && text[req.rel]) K.deps = (K.deps || []).concat(text[req.rel].split('\n').map(l => l.replace(/#.*/, '').trim().split(/[=<>~!\[; ]/)[0]).filter(Boolean));
    if (pyproj && text[pyproj.rel]) { const m = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(text[pyproj.rel]); if (m) K.deps = (K.deps || []).concat((m[1].match(/["']([A-Za-z0-9_.-]+)/g) || []).map(x => x.slice(1))); }
    if (gomod && text[gomod.rel]) { K.deps = (K.deps || []).concat((text[gomod.rel].match(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]+\/[^\s]+)\s+v[\d.]+/gm) || []).map(x => x.trim().replace(/^require\s+/, '').split(/\s+/)[0])); const mm = /^module\s+(\S+)/m.exec(text[gomod.rel]); if (mm) K.module = mm[1]; }
    if (cargo && text[cargo.rel]) { const sec = /\[dependencies\]([\s\S]*?)(\n\[|$)/.exec(text[cargo.rel]); if (sec) K.deps = (K.deps || []).concat((sec[1].match(/^\s*([A-Za-z0-9_-]+)\s*=/gm) || []).map(x => x.trim().split(/\s*=/)[0])); }
    if (K.deps) K.deps = [...new Set(K.deps)].slice(0, 200);
    // license
    const lic = files.find(f => /^(license|licence|copying)(\..*)?$/i.test(f.name) && f.rel.split('/').length <= 2);
    if (lic) K.license = licenseOf(text[lic.rel]) || K.license || 'yes';
    // TODOs, tests, components
    const todos = [];
    for (const [p, t] of Object.entries(text)) { if (classify(p) !== 'code' && !/\.(md|txt)$/i.test(p)) continue; t.split('\n').forEach((l, i) => { const m = /\b(TODO|FIXME|XXX|HACK)\b[:\s-]*(.*)/.exec(l); if (m && todos.length < 300) todos.push({ path: p, line: i + 1, tag: m[1], text: (m[2] || '').replace(/\*\/\s*$|-->\s*$/, '').trim().slice(0, 140) }); }); }
    K.todos = todos.length; K.todoList = todos;
    const testRx = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]*\.py$|Tests?\.cs$/i;
    K.testFiles = files.filter(f => testRx.test(f.rel) && f.cat === 'code').length; K.tests = K.testFiles > 0;
    K.components = files.filter(f => /\.(jsx|tsx|vue|svelte)$/i.test(f.rel) && !/(^|\/)(main|index|vite-env\.d)\.[jt]sx?$/i.test(f.rel) && !testRx.test(f.rel)).length;
    // entry points
    const entries = [];
    if (pkg) { if (pkg.main) entries.push(pkg.main); if (pkg.module) entries.push(pkg.module); }
    for (const rx of [/^index\.html?$/i, /^src\/main\.[jt]sx?$/, /^src\/index\.[jt]sx?$/, /^(app|main|manage|server|__main__)\.py$/, /^src\/main\.rs$/, /^main\.go$/, /^cmd\/[^/]+\/main\.go$/, /^server\.js$/, /^app\/page\.[jt]sx?$/, /^pages\/index\.[jt]sx?$/]) { const f = has(rx); if (f && !entries.includes(f.rel)) entries.push(f.rel); }
    // Godot / Unity
    const godot = files.find(f => f.name === 'project.godot');
    if (godot) { const t = text[godot.rel] || ''; K.godot = { name: (/config\/name="([^"]+)"/.exec(t) || [])[1] || '', main: (/run\/main_scene="res:\/\/([^"]+)"/.exec(t) || [])[1] || '', version: (/config\/features=PackedStringArray\("([\d.]+)/.exec(t) || [])[1] || '' }; if (K.godot.main) entries.push(K.godot.main); }
    const unityVer = files.find(f => /(^|\/)ProjectSettings\/ProjectVersion\.txt$/.test(f.rel));
    const unityHit = unityVer || files.some(f => f.ext === 'unity') || (files.some(f => /(^|\/)Assets\//.test(f.rel)) && files.some(f => f.ext === 'meta'));
    if (unityHit) { K.unity = { version: unityVer ? ((/m_EditorVersion:\s*(\S+)/.exec(text[unityVer.rel] || '') || [])[1] || '') : '', scenes: files.filter(f => f.ext === 'unity').map(f => f.rel), scripts: files.filter(f => f.ext === 'cs').length }; entries.push(...K.unity.scenes.slice(0, 3)); }
    K.entries = [...new Set(entries)].slice(0, 8);
    // CSV / data
    K.csv = files.filter(f => /^(csv|tsv)$/.test(f.ext) && text[f.rel] != null).slice(0, 8).map(f => ({ path: f.rel, ...csv(text[f.rel]) }));
    // pictures
    K.images = R.cats.image || 0;
    if (opts.colorsOf && K.images) { try { K.colors = (await opts.colorsOf(files.filter(f => f.cat === 'image' && f.ext !== 'svg').slice(0, 8).map(f => f.item))) || []; } catch { K.colors = []; } }
    // ---------- flags ----------
    const F = R.flags;
    F.secrets = [];
    for (const f of files) { if (isSecretName(f.name)) F.secrets.push({ path: f.rel, why: /^\.env/i.test(f.name) ? 'an .env file' : 'a key or credentials file' }); }
    for (const [p, t] of Object.entries(text)) { if (F.secrets.some(s => s.path === p)) continue; const s = scanSecrets(t); if (s) F.secrets.push({ path: p, why: s.why, line: s.line }); }
    F.git = files.filter(f => f.rel.split('/').includes('.git')).length;
    F.huge = files.filter(f => f.size > 25 * 1048576).map(f => ({ path: f.rel, size: f.size }));
    F.binaries = files.filter(f => !isTextPath(f.rel)).length;
    F.executables = files.filter(f => f.cat === 'exec').map(f => f.rel);
    const bySize = new Map(); for (const f of files) { if (!f.size) continue; const k = f.size; if (!bySize.has(k)) bySize.set(k, []); bySize.get(k).push(f); }
    F.duplicates = [];
    for (const g of bySize.values()) {
      if (g.length < 2) continue;
      const byKey = new Map();
      for (const f of g) { let k = null; if (text[f.rel] != null) k = 't:' + hashStr(text[f.rel]); else if (opts.hashOf) { try { k = 'h:' + await opts.hashOf(f.item); } catch {} } if (!k) continue; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(f.rel); }
      for (const l of byKey.values()) if (l.length > 1) F.duplicates.push(l);
    }
    // ---------- kind ----------
    R.kind = kindOf(R, { files, pkg, deps, godot, unityHit, req, pyproj, gomod, cargo, has });
    R.summary = summarize(R);
    R.suggestions = suggest(R);
    return R;
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; }
  function treeLines(paths, max) {
    const tops = new Map(); for (const p of paths) { const [a, ...rest] = p.split('/'); if (!tops.has(a)) tops.set(a, { files: 0, dir: rest.length > 0 }); const t = tops.get(a); t.files++; if (rest.length) t.dir = true; }
    return [...tops.entries()].sort((a, b) => (b[1].dir - a[1].dir) || a[0].localeCompare(b[0])).slice(0, max).map(([n, t]) => t.dir ? `${n}/ (${t.files})` : n);
  }
  function kindOf(R, { files, pkg, deps, godot, unityHit, req, pyproj, gomod, cargo, has }) {
    const n = R.files || 1, c = k => R.cats[k] || 0, why = [];
    const out = (id, label, extra) => ({ id, label, why, family: extra && extra.family || id, frameworks: extra && extra.frameworks || [] });
    if (godot) { why.push('project.godot'); return out('godot', 'Godot project', { family: 'game' }); }
    if (unityHit) { why.push('Unity Assets and scenes'); return out('unity', 'Unity project', { family: 'game' }); }
    if (pkg) {
      const d = k => Object.prototype.hasOwnProperty.call(deps, k), fw = [];
      if (d('next')) fw.push('Next.js'); else if (d('vite')) fw.push('Vite');
      if (d('@sveltejs/kit')) fw.push('SvelteKit'); else if (d('svelte')) fw.push('Svelte');
      if (d('react')) fw.push('React'); if (d('vue') || d('nuxt')) fw.push(d('nuxt') ? 'Nuxt' : 'Vue'); if (d('@angular/core')) fw.push('Angular'); if (d('astro')) fw.push('Astro');
      const game = ['phaser', 'kaplay', 'kaboom', 'pixi.js', 'three', 'babylonjs', '@babylonjs/core', 'excalibur', 'melonjs'].find(d);
      why.push('package.json' + (fw.length ? ` (${fw.join(', ')})` : ''));
      if (game) return out('web-game', `web game (${game})`, { family: 'game', frameworks: [game, ...fw] });
      if (fw.length) return out(fw.includes('Next.js') ? 'web-next' : fw.includes('React') ? 'web-react' : fw.includes('Vue') || fw.includes('Nuxt') ? 'web-vue' : /Svelte/.test(fw.join()) ? 'web-svelte' : 'web-vite', `${fw.join(' + ')} app`, { family: 'web', frameworks: fw });
      if (['express', 'fastify', 'koa', 'hono', '@nestjs/core'].some(d)) return out('node', 'Node server', { family: 'code', frameworks: ['express', 'fastify', 'koa', 'hono', '@nestjs/core'].filter(d) });
      return out('node', 'Node project', { family: 'code' });
    }
    if (req || pyproj || has(/(^|\/)setup\.py$/) || (R.exts.py || 0) >= Math.max(2, n * 0.3)) {
      const fw = ['django', 'flask', 'fastapi', 'streamlit', 'pygame', 'pandas', 'torch'].filter(x => (R.key.deps || []).map(d => d.toLowerCase()).includes(x));
      why.push(req ? 'requirements.txt' : pyproj ? 'pyproject.toml' : 'Python files');
      return out(fw.includes('pygame') ? 'python-game' : 'python', `Python project${fw.length ? ` (${fw.map(x => x[0].toUpperCase() + x.slice(1)).join(', ')})` : ''}`, { family: fw.includes('pygame') ? 'game' : 'code', frameworks: fw });
    }
    if (gomod) { why.push('go.mod'); return out('go', 'Go project', { family: 'code' }); }
    if (cargo) { why.push('Cargo.toml'); return out('rust', 'Rust project', { family: 'code' }); }
    const html = (R.exts.html || 0) + (R.exts.htm || 0);
    if (html && (has(/^index\.html?$/i) || has(/^[^/]+\/index\.html?$/i)) && (html + (R.exts.css || 0) + (R.exts.js || 0) + c('image') + c('font')) >= n * 0.6) { why.push('index.html with pages, styles and pictures'); return out('static', 'static website', { family: 'web' }); }
    if (c('code') >= n * 0.4) { why.push('mostly code'); return out('code', 'code folder', { family: 'code' }); }
    const lead = Object.entries(R.cats).filter(([k]) => k !== 'other').sort((a, b) => b[1] - a[1])[0];
    const share = lead ? lead[1] / n : 0;
    if (c('design') && c('design') + c('image') + c('font') >= n * 0.6 && (c('design') >= 1)) { why.push('design files'); return out('design', 'set of design files', { family: 'design' }); }
    if (c('image') >= n * 0.6) { why.push('mostly pictures'); return out('photos', 'photo set', { family: 'photos' }); }
    if (c('audio') >= n * 0.6) { why.push('mostly audio'); return out('audio', 'music and audio set', { family: 'audio' }); }
    if (c('slides') && c('slides') >= n * 0.4) { why.push('slide decks'); return out('slides', 'set of slides', { family: 'docs' }); }
    if (c('data') >= n * 0.5) { why.push('spreadsheets and data files'); return out('data', 'data set', { family: 'data' }); }
    if (c('doc') + c('slides') >= n * 0.5) { why.push('mostly documents'); return out('docs', 'set of documents', { family: 'docs' }); }
    if (c('archive') >= n * 0.5) { why.push('mostly archives'); return out('archive', 'pile of archives', { family: 'mixed' }); }
    why.push(lead ? `a mix (${Math.round(share * 100)}% ${lead[0]})` : 'a mix');
    return out('mixed', 'mixed folder', { family: 'mixed' });
  }
  const list = a => a.length <= 1 ? a.join('') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
  function summarize(R) {
    const K = R.key, F = R.flags, k = R.kind, bits = [], a = /^[aeiou]/i.test(k.label) ? 'an' : 'a';
    let s;
    if (k.family === 'web' && k.id !== 'static') {
      if (K.components) bits.push(plural(K.components, 'component'));
      bits.push(K.tests ? plural(K.testFiles, 'test file') : 'no tests');
      if (K.readme) bits.push(K.readme.about ? `a README describing ${K.readme.about}` : 'a README');
      s = `This looks like ${a} ${k.label} with ${list(bits)}.`;
    } else if (k.id === 'static') {
      s = `This looks like a static website: ${plural(R.exts.html || R.exts.htm || 0, 'page')}, ${plural(R.exts.css || 0, 'stylesheet')}, ${plural(K.images, 'picture')}${K.readme && K.readme.about ? `, and a README describing ${K.readme.about}` : ''}.`;
    } else if (k.id === 'unity') {
      s = `This looks like a Unity project${K.unity.version ? ` (${K.unity.version})` : ''} with ${plural(K.unity.scripts, 'C# script')} and ${plural(K.unity.scenes.length, 'scene')}.`;
    } else if (k.id === 'godot') {
      s = `This looks like a Godot project${K.godot.name ? ` called “${K.godot.name}”` : ''} with ${plural(R.exts.gd || 0, 'GDScript file')} and ${plural(R.exts.tscn || 0, 'scene')}.`;
    } else if (k.family === 'code' || k.family === 'game') {
      const ext = { python: 'py', 'python-game': 'py', go: 'go', rust: 'rs', node: 'js' }[k.id];
      bits.push(plural(ext ? (R.exts[ext] || 0) + (ext === 'js' ? (R.exts.ts || 0) : 0) : R.cats.code || 0, ext === 'py' ? 'module' : 'code file'));
      bits.push(K.tests ? plural(K.testFiles, 'test file') : 'no tests');
      if (K.readme) bits.push(K.readme.about ? `a README describing ${K.readme.about}` : 'a README');
      s = `This looks like ${a} ${k.label} with ${list(bits)}.`;
    } else if (k.id === 'photos') {
      const fmts = Object.entries(R.exts).filter(([e]) => classify('x.' + e) === 'image').sort((a2, b) => b[1] - a2[1]).slice(0, 3).map(([e]) => e.toUpperCase().replace('JPG', 'JPEG'));
      s = `This looks like a photo set: ${plural(K.images, 'picture')}${fmts.length ? ` (${fmts.join(', ')})` : ''}, ${fsize(R.bytes)}${K.colors && K.colors.length ? `, colors around ${K.colors.slice(0, 3).join(' ')}` : ''}.`;
    } else if (k.id === 'audio') {
      s = `This looks like a music and audio set: ${plural(R.cats.audio, 'track')}, ${fsize(R.bytes)}.`;
    } else if (k.id === 'data') {
      const c0 = K.csv[0];
      s = `This looks like a data set: ${plural(R.cats.data, 'data file')}${c0 ? `; ${c0.path.split('/').pop()} has ${plural(c0.columns.length, 'column')} (${c0.columns.slice(0, 5).map(c => c.name).join(', ')}${c0.columns.length > 5 ? ', …' : ''}) and ${plural(c0.rows, 'row')}` : ''}.`;
    } else if (k.id === 'docs' || k.id === 'slides') {
      s = `These look like ${k.id === 'slides' ? 'slides' : 'documents'}: ${plural(R.files, 'file')} (${Object.keys(R.exts).slice(0, 4).map(e => e.toUpperCase()).join(', ')}), ${fsize(R.bytes)}.`;
    } else if (k.id === 'design') {
      s = `These look like design files: ${plural(R.cats.design, 'design file')} and ${plural(K.images, 'picture')}.`;
    } else {
      s = `This is ${a} ${k.label}: ${plural(R.files, 'file')} in ${plural(R.folders, 'folder')}, ${fsize(R.bytes)}.`;
    }
    if (K.todos) s += ` ${plural(K.todos, 'TODO')}.`;
    if (F.secrets.length) s += ` Careful: ${plural(F.secrets.length, 'secret')} (${F.secrets.slice(0, 2).map(x => x.path.split('/').pop()).join(', ')}) ${F.secrets.length === 1 ? 'stays' : 'stay'} out unless you say so.`;
    return s;
  }
  // the one-click suggestions that fit (dropzone.js runs them by id)
  function suggest(R) {
    const k = R.kind, K = R.key, out = [], add = (id, label) => { if (!out.some(x => x.id === id)) out.push({ id, label }); };
    const htmlEntry = (R.list || []).some(f => /(^|\/)index\.html?$/i.test(f.path));
    if (k.id === 'static' || (k.family === 'web' && htmlEntry)) add('preview', 'Open it in Preview');
    if (['web', 'code', 'game'].includes(k.family)) add('project', 'Make it a project');
    if (K.todos) add('todos', `Create tasks from the ${plural(K.todos, 'TODO')}`);
    if (['web', 'code', 'game'].includes(k.family) && !K.readme) add('readme', 'Add a README');
    if (k.id === 'photos' || (K.images >= 3 && k.family !== 'code')) add('gallery', 'Turn these photos into a gallery website');
    if (K.images >= 2) add('moodboard', 'Make a mood board from these images');
    if (K.csv && K.csv.length) add('sheet', 'Chart this CSV in a sheet');
    if (k.id === 'docs' || k.id === 'slides' || ((R.cats.doc || 0) >= 2 && k.family !== 'code' && k.family !== 'web')) add('deck', 'Start a slide deck from these docs');
    if (['web', 'code', 'game'].includes(k.family)) add('bug', 'Find the bug');
    if (k.family === 'audio') add('moodboard', 'Add these sounds to the inspiration board');
    if (!out.length) add('files', 'Add it to this project’s files');
    return out.slice(0, 6);
  }

  // ---------- follow-up questions, answered here ----------
  const STOP = new Set('the a an is are was what where which who how does do did in of on to for this that these those it its my me i you your there any all and or with from by be use used using code file files folder show find tell about please can could would'.split(' '));
  function search(R, terms, max = 8) {
    const hits = [];
    const rx = terms.map(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ |[\s_-]+/g, '[\\s_-]?'), 'i'));
    for (const [p, t] of Object.entries(R.text || {})) {
      if (isSecretName(p)) continue;
      const lines = t.split('\n');
      for (let i = 0; i < lines.length && hits.length < 200; i++) if (rx.every(r => r.test(lines[i]))) hits.push({ path: p, line: i + 1, text: redact(lines[i].trim()).slice(0, 120) });
    }
    return hits.slice(0, max === Infinity ? hits.length : max).concat(hits.length > max ? [{ more: hits.length - max }] : []);
  }
  function answer(R, q) {
    if (!R) return null;
    const t = String(q || '').toLowerCase().replace(/[?!.]+$/, '').trim(), K = R.key;
    let m;
    // how many X
    if ((m = /\bhow many\s+([a-z0-9 .-]+?)(?:\s+(?:are|is|do|does|in|there|files?)\b.*)?$/.exec(t))) {
      const w = m[1].trim().replace(/s$/, '');
      const map = { image: 'image', picture: 'image', photo: 'image', pic: 'image', song: 'audio', track: 'audio', sound: 'audio', audio: 'audio', video: 'video', doc: 'doc', document: 'doc', csv: 'csv', script: 'code', 'code file': 'code', font: 'font', model: 'model', archive: 'archive', folder: 'folder', file: 'file', todo: 'todo', component: 'component', test: 'test', dependency: 'dep', dependencie: 'dep', secret: 'secret', line: 'line' };
      const k = map[w] || (R.exts[w.replace(/^\./, '')] != null ? 'ext:' + w.replace(/^\./, '') : null);
      if (k) {
        const n = k === 'folder' ? R.folders : k === 'file' ? R.files : k === 'todo' ? K.todos : k === 'component' ? K.components : k === 'test' ? K.testFiles : k === 'dep' ? (K.deps || []).length + (K.devDeps || []).length
          : k === 'secret' ? R.flags.secrets.length : k === 'csv' ? (R.exts.csv || 0) + (R.exts.tsv || 0) : k === 'line' ? Object.values(R.text).reduce((a, x) => a + x.split('\n').length, 0) : k.startsWith('ext:') ? R.exts[k.slice(4)] : R.cats[k] || 0;
        const label = { image: 'picture', audio: 'audio file', doc: 'document', code: 'code file', dep: 'dependency', todo: 'TODO', line: 'line of text (in the files I read)' }[k] || (k.startsWith('ext:') ? `.${k.slice(4)} file` : k);
        return { text: `${n === 1 ? 'There is' : 'There are'} ${plural(n, label, label === 'dependency' ? 'dependencies' : label.endsWith('(in the files I read)') ? 'lines of text (in the files I read)' : undefined)} in ${R.name}.`, files: [], needsAI: false };
      }
    }
    if (/\b(what is (this|it)|what('?s| is) in (it|here|the folder|this folder)|summar\w*|overview|readme|describe\w*)\b/.test(t)) {
      return { text: `${R.summary}${K.readme && K.readme.summary ? `\nThe README says: “${K.readme.summary}”` : ''}\nTop level: ${R.tree.slice(0, 10).join(', ')}.`, files: K.readme ? [K.readme.path] : [], needsAI: false };
    }
    if (/\b(dependenc\w*|packages?|librar\w*|requirements)\b/.test(t)) { const d = [...(K.deps || []), ...(K.devDeps || [])]; return { text: d.length ? `${plural(d.length, 'dependency', 'dependencies')}: ${d.slice(0, 30).join(', ')}${d.length > 30 ? ', …' : ''}.` : 'I found no dependency list (no package.json, requirements.txt, go.mod or Cargo.toml).', files: [], needsAI: false }; }
    if (/\b(scripts?|how (do i|to) (run|start|build)|commands?)\b/.test(t) && K.scripts) { const s = Object.entries(K.scripts); return { text: s.length ? `Scripts in package.json: ${s.map(([k2, v]) => `${k2} → ${v}`).join('; ')}. I never run them; they run in the project's preview once it is a project.` : 'package.json has no scripts.', files: [], needsAI: false }; }
    if (/\b(entry|start(s|ing)? point|main file|where does it start)\b/.test(t)) return { text: K.entries.length ? `Entry points: ${K.entries.join(', ')}.` : 'I could not spot an entry point.', files: K.entries, needsAI: false };
    if (/\blicen[cs]e\b/.test(t)) return { text: K.license ? `License: ${K.license}.` : 'I found no license file.', files: [], needsAI: false };
    if (/\btests?\b/.test(t) && !/\bwhere\b/.test(t)) return { text: K.tests ? `${plural(K.testFiles, 'test file')}.` : 'There are no tests in it.', files: [], needsAI: false };
    if (/\b(todos?|fixmes?)\b/.test(t)) return { text: K.todos ? `${plural(K.todos, 'TODO')}:\n${K.todoList.slice(0, 8).map(x => `• ${x.path}:${x.line} ${x.text || x.tag}`).join('\n')}${K.todos > 8 ? `\n…and ${K.todos - 8} more.` : ''}` : 'No TODOs or FIXMEs.', files: [...new Set(K.todoList.slice(0, 8).map(x => x.path))], needsAI: false };
    if (/\b(biggest|largest|huge)\b/.test(t)) { const b = (R.list || []).slice().sort((a, b2) => b2.size - a.size).slice(0, 5); return { text: `Biggest files: ${b.map(x => `${x.path} (${fsize(x.size)})`).join(', ')}.`, files: b.map(x => x.path), needsAI: false }; }
    if (/\b(colou?rs?|palette)\b/.test(t)) return { text: K.colors && K.colors.length ? `The pictures' main colors: ${K.colors.join(' ')}.` : 'There are no pictures to read colors from.', files: [], needsAI: false };
    if (/\b(columns?|fields?|schema)\b/.test(t)) return { text: K.csv.length ? K.csv.map(c => `${c.path}: ${c.columns.map(x => `${x.name} (${x.type})`).join(', ')}, ${plural(c.rows, 'row')}`).join('\n') : 'There is no CSV here.', files: K.csv.map(c => c.path), needsAI: false };
    if (/\bsecrets?|keys?\b/.test(t) && /\b(any|are there|did you find|secrets)\b/.test(t)) return { text: R.flags.secrets.length ? `Flagged: ${R.flags.secrets.map(x => `${x.path} (${x.why})`).join(', ')}. They stay out of uploads unless you say so.` : 'I found no secrets.', files: [], needsAI: false };
    // where is X (used | defined)
    if ((m = /\bwhere\b(?:\s+(?:is|are|do|does))?\s+(?:the\s+|my\s+|an?\s+)?(.+?)(?:\s+(?:used|defined|set|called|read|imported|loaded|handled|stored))?$/.exec(t))) {
      const words = m[1].split(/\s+/).filter(w => !STOP.has(w));
      const term = words.join(' ').trim(); if (!term) return null;
      let hits = search(R, [term]); if (!hits.length && words.length > 1) hits = search(R, words);
      const pathHits = (R.list || []).filter(f => words.some(w => f.path.toLowerCase().includes(w))).slice(0, 5);
      if (!hits.length && !pathHits.length) return { text: `I found “${term}” nowhere in the files I read.`, files: [], needsAI: false };
      const more = hits.find(h => h.more), lines = hits.filter(h => !h.more);
      return { text: `${lines.length ? `“${term}” shows up in:\n${lines.map(h => `• ${h.path}:${h.line}  ${h.text}`).join('\n')}${more ? `\n…and ${more.more} more.` : ''}` : ''}${pathHits.length ? `${lines.length ? '\n' : ''}Files named like it: ${pathHits.map(f => f.path).join(', ')}.` : ''}`, files: [...new Set([...lines.map(h => h.path), ...pathHits.map(f => f.path)])], needsAI: false };
    }
    // what does the X code do: a local look, then the AI offer
    if ((m = /\bwhat does (?:the |my )?(.+?)(?: code| file| part| module| component| function)? do\b/.exec(t)) || (m = /\b(?:explain|how does) (?:the |my )?(.+?)(?: code| file| work| works)?$/.exec(t))) {
      const words = m[1].split(/\s+/).filter(w => !STOP.has(w)); if (!words.length) return null;
      const files = (R.list || []).filter(f => R.text[f.path] != null && classify(f.path) === 'code' && words.some(w => f.path.toLowerCase().includes(w))).slice(0, 4);
      const hit = files.length ? files : [...new Set(search(R, words, 20).filter(h => !h.more).map(h => h.path))].map(p => ({ path: p })).slice(0, 4);
      if (!hit.length) return { text: `I found no ${words.join(' ')} code in ${R.name}.`, files: [], needsAI: false };
      const outline = hit.map(f => { const tx = R.text[f.path] || ''; const fns = [...new Set((tx.match(/(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(|def\s+([A-Za-z_]\w*)|func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)|fn\s+([A-Za-z_]\w*)|export\s+default\s+function\s+([A-Za-z_$][\w$]*))/g) || []).map(x => x.replace(/^(function|const|let|def|func|fn|export default function)\s+(\([^)]*\)\s*)?/, '').replace(/\s*=.*$/, '')))].slice(0, 8);
        const doc = (/^\s*(?:\/\/|#|\/\*+|\*)\s*(.{10,140})/m.exec(tx) || [])[1] || '';
        return `• ${f.path}${fns.length ? `: ${fns.join(', ')}` : ''}${doc ? ` — “${doc.trim()}”` : ''}`; });
      return { text: `Here is where the ${words.join(' ')} code lives:\n${outline.join('\n')}\nFor what it really does, step by step, ask an AI: I'll hand it these files (secrets removed).`, files: hit.map(f => f.path), needsAI: true };
    }
    // open / show a file
    if ((m = /\b(?:open|show|read|print|cat)\s+(?:me\s+)?(?:the\s+)?(?:file\s+)?([\w./-]*\.[a-z0-9]+)\b/.exec(t))) {
      const f = (R.list || []).find(x => x.path.toLowerCase() === m[1] || x.path.toLowerCase().endsWith('/' + m[1]));
      if (!f) return { text: `There is no ${m[1]} in ${R.name}.`, files: [], needsAI: false };
      if (isSecretName(f.path)) return { text: `${f.path} looks like a secret, so I won't show it here.`, files: [], needsAI: false };
      const tx = R.text[f.path]; return { text: tx != null ? `${f.path} (${fsize(f.size)}):\n${redact(tx).split('\n').slice(0, 14).join('\n')}${tx.split('\n').length > 14 ? '\n…' : ''}` : `${f.path} is ${fsize(f.size)} and not text, so there is nothing to show here.`, files: [f.path], needsAI: false };
    }
    return null;
  }
  // the context pack for an AI: question, overview, the files that matter (secrets never included, keys redacted)
  function pack(R, q, max = 60000) {
    const K = R.key, words = String(q || '').toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOP.has(w));
    const score = p => { const t = (R.text[p] || '').toLowerCase(); return words.reduce((n, w) => n + (p.toLowerCase().includes(w) ? 5 : 0) + Math.min(5, t.split(w).length - 1), 0) + (K.entries.includes(p) ? 2 : 0) + (/^readme/i.test(p.split('/').pop()) ? 1 : 0); };
    const picks = Object.keys(R.text).filter(p => !isSecretName(p) && !R.flags.secrets.some(s => s.path === p)).sort((a, b) => score(b) - score(a));
    let out = `# Context pack: ${R.name}\n\nQUESTION: ${q || '(none)'}\n\nWHAT IT IS: ${R.summary}\nFILES: ${R.files} in ${R.folders} folders, ${fsize(R.bytes)}\nTOP LEVEL: ${R.tree.join(', ')}\n${K.entries.length ? `ENTRY POINTS: ${K.entries.join(', ')}\n` : ''}${K.deps && K.deps.length ? `DEPENDENCIES: ${K.deps.slice(0, 40).join(', ')}\n` : ''}${R.flags.secrets.length ? `NOTE: ${R.flags.secrets.length} secret file(s) left out on purpose.\n` : ''}\n`;
    const files = [];
    for (const p of picks) { const body = redact(R.text[p]); const chunk = `### ${p}\n\`\`\`${EXT(p)}\n${body.slice(0, 20000)}\n\`\`\`\n\n`; if (out.length + chunk.length > max) continue; out += chunk; files.push({ path: p, text: body }); if (files.length >= 12) break; }
    return { text: out, files };
  }
  return { analyze, answer, pack, search, skipReason, isSecretName, scanSecrets, redact, gitignore, classify, csv, readme, isTextPath, fsize, TEXT_EXT, SKIP_DIRS };
});
