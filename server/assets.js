// The asset library (templates/assets.json): open sound effects, 3D models, rigged/animated models, textures and HDRIs,
// pixel art, icons, fonts and motion that people, Flint and the agents pull into a project in one step.
//   GET  /api/assets                       the catalog: kinds, packs, browse sources, libraries, what's left out and why
//   GET  /api/assets/search?q=&kind=       matches across built-ins, icon/pixel sets (file lists from jsDelivr, cached a day),
//                                          fonts, glTF models and Poly Haven (its search API) -> [{ pack, name, kind, title, license }]
//   GET  /api/assets/preview?pack=&name=   a built-in sprite (SVG) or sound (WAV), or an icon fetched through the allowlist
//   POST /api/assets/add { project, items: [{ pack, name, seed?, weight? }] }   builders only (not spectators or guests)
//        -> files land in <repo>/assets/<kind>/ (or the tribe folder's projects/<id>/assets/ with no repo), every one gets a
//           line in assets/CREDITS.md (what, from where, by whom, license), and the tribe sees one note in chat.
// Safety: downloads only from an allowlist (cdn.jsdelivr.net, data.jsdelivr.com, raw.githubusercontent.com,
// api.polyhaven.com, dl.polyhaven.org), only the file types each kind needs, size caps per file and per request, file names
// cleaned to [a-z0-9-_.], never executed. Tests point the hosts elsewhere with TRIBE_ASSETS_* (TRIBE_TEST=1 only).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const kit = require('./assetkit');

const MB = 1024 * 1024;
const CAP = { icon: 256 * 1024, pixel: 256 * 1024, font: 2 * MB, model: 30 * MB, rigged: 30 * MB, texture: 24 * MB, sound: 8 * MB, music: 16 * MB, motion: 256 * 1024 };
const TOTAL = 80 * MB;
const EXT = { icon: /\.svg$/i, pixel: /\.svg$/i, font: /\.woff2$/i, model: /\.(glb|gltf|bin|png|jpe?g|webp|ktx2)$/i, rigged: /\.(glb|gltf|bin|png|jpe?g|webp)$/i, texture: /\.(hdr|exr|jpe?g|png|webp|gltf|bin)$/i };
const HOSTS = new Set(['cdn.jsdelivr.net', 'data.jsdelivr.com', 'raw.githubusercontent.com', 'api.polyhaven.com', 'dl.polyhaven.org']);

module.exports = function assets({ P, root, base, postChat, str, nameOf }) {
  const cat = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'templates', 'assets.json'), 'utf8')); } catch { return { kinds: [], packs: [], sources: [], libraries: [] }; } })();
  const pack = id => (cat.packs || []).find(p => p.id === id);
  const err = (status, m) => Object.assign(new Error(m), { status });
  const test = process.env.TRIBE_TEST === '1';
  const host = (k, def) => (test && process.env[k]) ? process.env[k].replace(/\/+$/, '') : def;
  const CDN = () => host('TRIBE_ASSETS_CDN', 'https://cdn.jsdelivr.net/npm');
  const DATA = () => host('TRIBE_ASSETS_DATA', 'https://data.jsdelivr.com/v1/packages/npm');
  const RAW = () => host('TRIBE_ASSETS_RAW', 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models');
  const PH = () => host('TRIBE_ASSETS_POLYHAVEN', 'https://api.polyhaven.com');
  const allowed = u => { try { const x = new URL(u); return (test && /^(127\.0\.0\.1|localhost)$/.test(x.hostname)) || (x.protocol === 'https:' && HOSTS.has(x.hostname)); } catch { return false; } };
  async function get(u, { json = false, cap = 4 * MB } = {}) {
    if (!allowed(u)) throw err(400, 'that address is not on the asset allowlist');
    const r = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'TribeCode asset library' } }).catch(() => null);
    if (!r || !r.ok) throw err(502, `couldn't download from ${new URL(u).host}${r ? ` (${r.status})` : ''}`);
    if (r.url && r.url !== u && !allowed(r.url)) throw err(502, 'the download redirected off the allowlist');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > cap) throw err(413, 'that file is bigger than the asset library allows');
    return json ? JSON.parse(buf.toString('utf8')) : buf;
  }
  const clean = s => String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '').slice(0, 80);

  // ---------- file lists for icon/pixel sets (jsDelivr's package listing, cached for a day) ----------
  const lists = new Map();
  async function names(p) {
    const key = `${p.pkg}@${p.version}`, hit = lists.get(key);
    if (hit && Date.now() - hit.at < 864e5) return hit.names;
    const cacheF = base.p('.tribe', 'cache', `assets-${clean(key)}.json`);
    try { const c = JSON.parse(fs.readFileSync(cacheF, 'utf8')); if (Date.now() - c.at < 864e5) { lists.set(key, c); return c.names; } } catch {}
    const j = await get(`${DATA()}/${p.pkg}@${p.version}?structure=flat`, { json: true, cap: 16 * MB });
    const pre = '/' + p.dir; const out = [];
    for (const f of j.files || []) if (f.name.startsWith(pre) && f.name.endsWith('.svg') && !f.name.slice(pre.length).includes('/')) out.push(f.name.slice(pre.length, -4));
    const c = { at: Date.now(), names: out };
    lists.set(key, c);
    try { fs.mkdirSync(path.dirname(cacheF), { recursive: true }); fs.writeFileSync(cacheF, JSON.stringify(c)); } catch {}
    return out;
  }
  const codeOf = name => [...String(name)].map(ch => ch.codePointAt(0).toString(16)).filter(h => h !== 'fe0f').join('-');

  // ---------- search ----------
  const score = (q, n) => { n = n.toLowerCase(); if (n === q) return 100; if (n.startsWith(q)) return 80 - n.length / 10; if (n.includes(q)) return 50 - n.length / 10; return q.split(/[\s-]+/).every(w => n.includes(w)) ? 30 : 0; };
  async function search(q, kind, { remote = true } = {}) {
    q = String(q || '').trim().toLowerCase().slice(0, 60); if (!q) return [];
    const out = [];
    const push = (p, name, extra = {}) => out.push({ pack: p.id, name, kind: extra.kind || p.kind, title: extra.title || name, license: extra.license || p.license, by: extra.by || p.by, how: p.how, s: extra.s || 0 });
    for (const p of cat.packs || []) {
      if (kind && p.kind !== kind && !(p.id === 'gltf' && (kind === 'rigged' || kind === 'model'))) continue;
      if (p.how === 'built-in' || p.id === 'fonts') for (const n of p.names || []) { const s = score(q, n) || (score(q, p.title) ? 10 : 0); if (s) push(p, n, { s }); }
      if (p.how === 'gltf') for (const m of p.models) { const s = score(q, m.name) || (kind === m.kind ? 5 : 0) || ((/anim|rig|walk|run|bone|skelet|character/.test(q) && m.kind === 'rigged') ? 40 : 0); if (s && (!kind || kind === m.kind)) push(p, m.name, { kind: m.kind, license: m.license, by: m.by, s }); }
      if (remote && p.how === 'npm' && p.dir != null && p.id !== 'twemoji') {
        try { for (const n of await names(p)) { const s = score(q, n); if (s) push(p, n, { s: s - 1 }); } } catch {}
      }
    }
    if (remote && (!kind || kind === 'texture' || kind === 'model')) {
      try {
        const ph = pack('polyhaven'), j = await get(`${PH()}/search?q=${encodeURIComponent(q)}&limit=8`, { json: true, cap: 2 * MB });
        const ids = Array.isArray(j) ? j : (j.results || j.assets || []);
        ids.slice(0, 8).forEach((r, i) => { const id = typeof r === 'string' ? r : r.id || r.slug; if (id) push(ph, id, { s: 20 - i, title: id.replace(/_/g, ' ') }); });
      } catch {}
    }
    const seen = new Set();
    return out.sort((a, b) => b.s - a.s).filter(x => { const k = x.pack + ':' + x.name; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 60).map(({ s, ...x }) => x);
  }

  // ---------- fetching one item -> [{ rel, buf }] ----------
  async function files(item) {
    const p = pack(item.pack); if (!p) throw err(404, 'not in the asset library');
    const name = String(item.name || '').slice(0, 80);
    if (p.id === 'sfx') { const b = kit.sfx(name, Number(item.seed) || 1); if (!b) throw err(404, 'no sound by that name'); return [{ rel: `sounds/${clean(name)}${item.seed > 1 ? '-' + Number(item.seed) : ''}.wav`, buf: b }]; }
    if (p.id === 'sprites') { const s = kit.sprite(name); if (!s) throw err(404, 'no sprite by that name'); return [{ rel: `sprites/${clean(name)}.svg`, buf: Buffer.from(s) }]; }
    if (p.id === 'motion-css') return [{ rel: 'css/motion.css', buf: Buffer.from(kit.motionCss()) }];
    if (p.id === 'fonts') {
      const id = clean(name); if (!(p.names || []).includes(id)) throw err(404, 'that font isn\'t in the library yet');
      const weights = id === 'inter' || id === 'space-grotesk' || id === 'jetbrains-mono' ? [400, 700] : [400];
      const out = [];
      for (const w of weights) out.push({ rel: `fonts/${id}-${w}.woff2`, buf: await get(`${CDN()}/@fontsource/${id}@${p.version}/files/${id}-latin-${w}-normal.woff2`, { cap: CAP.font }) });
      const fam = id.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join(' ').replace('2p', '2P').replace('Vt323', 'VT323');
      out.push({ rel: `fonts/${id}.css`, buf: Buffer.from(weights.map(w => `@font-face { font-family: "${fam}"; src: url("./${id}-${w}.woff2") format("woff2"); font-weight: ${w}; font-style: normal; font-display: swap; }`).join('\n') + '\n') });
      return out;
    }
    if (p.how === 'npm') {
      const n = p.id === 'twemoji' ? codeOf(name) : clean(name);
      if (!n) throw err(400, 'which one?');
      const rel = p.file.replace('{name}', n).replace('{code}', n);
      return [{ rel: `${p.kind === 'pixel' ? 'pixel' : 'icons'}/${p.id}-${n}.svg`, buf: await get(`${CDN()}/${p.pkg}@${p.version}/${rel}`, { cap: CAP.icon }) }];
    }
    if (p.how === 'gltf') {
      const m = p.models.find(x => x.name.toLowerCase() === name.toLowerCase()); if (!m) throw err(404, 'no sample model by that name');
      return [{ rel: `models/${m.name}.glb`, buf: await get(`${RAW()}/${m.name}/glTF-Binary/${m.name}.glb`, { cap: CAP.model }) }];
    }
    if (p.how === 'polyhaven') {
      const id = String(name).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80); if (!id) throw err(400, 'which Poly Haven asset?');
      const info = await get(`${PH()}/info/${id}`, { json: true, cap: 2 * MB }), fl = await get(`${PH()}/files/${id}`, { json: true, cap: 4 * MB });
      const type = info.type === 0 ? 'hdri' : info.type === 1 ? 'texture' : 'model';
      const pick = o => o && (o['1k'] || o['2k'] || Object.values(o)[0]);
      const out = [];
      if (type === 'hdri') { const r = pick(fl.hdri); const f = r && (r.hdr || r.exr); if (!f) throw err(502, 'no 1k HDRI on Poly Haven for that'); out.push({ rel: `hdri/${id}_1k.hdr`, buf: await get(f.url, { cap: CAP.texture }) }); }
      else if (type === 'texture') {
        for (const map of ['Diffuse', 'diff_png', 'nor_gl', 'Rough', 'rough', 'AO', 'arm', 'Displacement']) {
          const r = pick(fl[map]); const f = r && (r.jpg || r.png); if (f && out.length < 4) out.push({ rel: `textures/${id}/${path.basename(new URL(f.url).pathname)}`, buf: await get(f.url, { cap: CAP.texture }) });
        }
        if (!out.length) throw err(502, 'no 1k texture maps for that');
      } else {
        const r = pick(fl.gltf); const g = r && r.gltf; if (!g) throw err(502, 'no glTF version of that model');
        out.push({ rel: `models/${id}/${path.basename(new URL(g.url).pathname)}`, buf: await get(g.url, { cap: CAP.model }) });
        for (const [inc, f] of Object.entries(g.include || {}).slice(0, 12)) {
          const relInc = inc.split('/').map(clean).filter(Boolean).join('/'); if (!relInc) continue;
          out.push({ rel: `models/${id}/${relInc}`, buf: await get(f.url, { cap: CAP.model }) });
        }
      }
      return out.map(o => ({ ...o, by: (info.authors && Object.keys(info.authors).join(', ')) || p.by, title: info.name || id }));
    }
    throw err(400, 'that pack is browse-only: download it from its site and drop the files in Files');
  }

  // ---------- where files go + credits ----------
  function dirOf(pid) {
    const p = P.get(pid);
    if (p && p.repo && fs.existsSync(p.repo)) return { dir: path.join(fs.realpathSync(p.repo), 'assets'), shown: 'assets/' };
    return { dir: base.p('projects', pid, 'assets'), shown: `projects/${pid}/assets/ (tribe folder)` };
  }
  function credit(dir, lines) {
    const f = path.join(dir, 'CREDITS.md');
    let cur = ''; try { cur = fs.readFileSync(f, 'utf8'); } catch { cur = '# Asset credits\n\nEvery asset here came from TribeCode\'s asset library. Keep this file with the assets: some licenses (CC-BY) ask for credit.\n\n'; }
    const add = lines.filter(l => !cur.includes(l));
    if (add.length) fs.writeFileSync(f, cur.replace(/\s*$/, '\n') + add.join('\n') + '\n');
  }
  async function add(pid, items, me) {
    const p = P.get(pid); if (!p || !P.canSee(me, pid)) throw err(404, 'project not found');
    if (!me || ['spectator', 'guest'].includes(me.role)) throw err(403, 'only builders can add assets');
    if (!Array.isArray(items) || !items.length) throw err(400, 'pick at least one asset');
    const { dir, shown } = dirOf(pid); let total = 0; const done = [], lines = [];
    for (const it of items.slice(0, 24)) {
      const pk = pack(it.pack); if (!pk) throw err(404, `not in the asset library: ${it.pack}`);
      for (const f of await files(it)) {
        const kind = (pk.how === 'gltf' ? (pk.models.find(m => m.name.toLowerCase() === String(it.name).toLowerCase()) || {}).kind : pk.kind) || pk.kind;
        if (EXT[kind] && !/\.(css|md)$/.test(f.rel) && !EXT[kind].test(f.rel)) continue;
        total += f.buf.length; if (total > TOTAL) throw err(413, 'that is more than one go can add: pick fewer');
        const out = path.resolve(dir, f.rel); if (!out.startsWith(dir + path.sep)) continue;
        fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, f.buf);
        const rel = path.relative(dir, out).replace(/\\/g, '/');
        done.push(rel);
        const m = pk.how === 'gltf' ? pk.models.find(x => x.name.toLowerCase() === String(it.name).toLowerCase()) : null;
        lines.push(`- \`${rel}\`: ${f.title || it.name} from ${pk.title}, by ${(m && m.by) || f.by || pk.by}, license ${(m && m.license) || pk.license}${pk.credit ? ` (${pk.credit})` : ''}${pk.url ? ` · ${pk.url}` : ''}`);
      }
    }
    if (!done.length) throw err(502, 'nothing was added');
    credit(dir, lines);
    P.inProject(pid, () => postChat('general', 'tribecode', `🎒 ${nameOf(me.id)} added ${done.length === 1 ? `\`${shown}${done[0]}\`` : `${done.length} assets to \`${shown}\``} from the asset library (credits in ${shown}CREDITS.md)`));
    return { ok: true, files: done, where: shown };
  }

  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    try {
      if (!b && m === 'GET') return send(res, 200, { kinds: cat.kinds, packs: cat.packs.map(({ models, ...p }) => ({ ...p, models: models && models.map(x => ({ name: x.name, kind: x.kind, license: x.license })) })), sources: cat.sources, libraries: cat.libraries, left_out: cat.left_out });
      if (b === 'search' && m === 'GET') return send(res, 200, { results: await search(url.searchParams.get('q'), str(url.searchParams.get('kind') || '', 20) || null, { remote: url.searchParams.get('remote') !== '0' }) });
      if (b === 'preview' && m === 'GET') {
        const pk = url.searchParams.get('pack'), name = url.searchParams.get('name') || '';
        if (pk === 'sprites') { const s = kit.sprite(name); if (!s) return fail(res, 404, 'no sprite'); res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=86400', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'x-content-type-options': 'nosniff' }); return res.end(s); }
        if (pk === 'sfx') { const w = kit.sfx(name, Number(url.searchParams.get('seed')) || 1); if (!w) return fail(res, 404, 'no sound'); res.writeHead(200, { 'content-type': 'audio/wav', 'cache-control': 'max-age=86400', 'x-content-type-options': 'nosniff' }); return res.end(w); }
        const p = pack(pk); if (p && p.how === 'npm' && p.dir != null) { const [f] = await files({ pack: pk, name }); res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=86400', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'x-content-type-options': 'nosniff' }); return res.end(f.buf); }
        return fail(res, 404, 'no preview for that');
      }
      if (b === 'add' && m === 'POST') { const body = await readBody(req); return send(res, 200, await add(str(body.project, 80) || P.current() || P.defaultId(), body.items, me)); }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  // Claude Code and the other agents: find and add assets with credit, the same way people do
  const text = (t, isError) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
  const mcpTools = {
    find_assets: {
      description: 'Search TribeCode\'s open asset library (CC0/MIT/OFL/CC-BY only): sound effects, 3D models (.glb), rigged and animated models, textures and HDRIs, pixel sprites, icons, fonts, motion CSS. Returns pack + name pairs for add_assets.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'e.g. "jump", "coin", "heart", "fox", "forest hdri"' }, kind: { type: 'string', enum: (cat.kinds || []).map(k => k.id) } }, required: ['query'], additionalProperties: false },
      run: async ({ query, kind }) => { const r = await search(query, kind || null); return text(r.length ? r.slice(0, 25).map(x => `${x.pack} / ${x.name} (${x.kind}, ${x.license})`).join('\n') : 'Nothing found. Try a simpler word, or a browse source from GET /api/assets (Kenney, Quaternius, KayKit).'); },
    },
    add_assets: {
      description: 'Add assets from the library to the current project: files go to assets/<kind>/ in the repo and each gets a credit line in assets/CREDITS.md.',
      inputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { pack: { type: 'string' }, name: { type: 'string' }, seed: { type: 'number' } }, required: ['pack', 'name'] }, maxItems: 24 }, project: { type: 'string' } }, required: ['items'], additionalProperties: false },
      run: async ({ items, project }, me) => { try { const r = await add(project || P.current() || P.defaultId(), items, me); return text(`Added ${r.files.length} file(s) under ${r.where}: ${r.files.join(', ')}. Credits are in ${r.where}CREDITS.md.`); } catch (e) { return text(`Not added: ${e.message}`, true); } },
    },
  };
  return { route, search, add, mcpTools, catalog: () => cat };
};
