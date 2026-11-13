// Visual compare: screenshots tracked over time, grouped by screen name.
//   visuals/<screen>/<timestamp>.png   the image
//   visuals/<screen>/<timestamp>.json  { screen, name, at, by, w, h, bytes, note, diffPrev }
//   visuals/<screen>/screen.json       { name }
// Pixel diffs for the UI are drawn on a canvas in the browser; the server only decodes PNGs (zero deps, zlib)
// to work out "% changed vs the previous version" and emit bus.notify({ type: 'visual-diff' }) above 5%.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const bus = require('./bus');

const MAX_BYTES = 8 * 1024 * 1024;
const DIFF_NOTIFY = Number(process.env.TRIBE_VISUAL_DIFF_PCT) || 5;

// Minimal PNG decoder: 8-bit gray/gray-alpha/RGB/RGBA/palette, non-interlaced. Returns { w, h, rgba } or null.
function decodePng(buf) {
  if (!buf || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null; const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') plte = data; else if (kind === 'tRNS') trns = data; else if (kind === 'IDAT') idat.push(data); else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!w || !h || depth !== 8 || interlace || !ch || w * h > 40e6) return null;
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch { return null; }
  const stride = w * ch, out = Buffer.alloc(w * h * 4); let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      if (type === 6) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
      else if (type === 2) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else if (type === 0 || type === 4) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = type === 4 ? cur[s + 1] : 255; }
      else { const k = cur[s]; out[o] = plte ? plte[k * 3] : k; out[o + 1] = plte ? plte[k * 3 + 1] : k; out[o + 2] = plte ? plte[k * 3 + 2] : k; out[o + 3] = trns && k < trns.length ? trns[k] : 255; }
    }
    [prev, cur] = [cur, prev];
  }
  return { w, h, rgba: out };
}
// Share of pixels that differ noticeably (any channel by more than `tol`). Different sizes count as 100%.
function diffPct(a, b, tol = 24) {
  if (!a || !b) return null;
  if (a.w !== b.w || a.h !== b.h) return 100;
  let n = 0; const A = a.rgba, B = b.rgba;
  for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) > tol || Math.abs(A[i + 1] - B[i + 1]) > tol || Math.abs(A[i + 2] - B[i + 2]) > tol || Math.abs(A[i + 3] - B[i + 3]) > tol) n++;
  return Math.round((n / (a.w * a.h)) * 10000) / 100;
}

module.exports = function visuals({ store, slug, str, broadcast, nameOf }) {
  const root = store.p('visuals'); fs.mkdirSync(root, { recursive: true });
  const okScreen = s => /^[a-z0-9][a-z0-9-]{0,47}$/.test(s);
  const okTs = t => /^\d{13}(-\d+)?$/.test(t);

  function screens() {
    let dirs = []; try { dirs = fs.readdirSync(root).filter(d => okScreen(d) && fs.statSync(path.join(root, d)).isDirectory()); } catch {}
    return dirs.map(d => { const v = versions(d); const meta = store.readJSON(`visuals/${d}/screen.json`, {}); return { slug: d, name: meta.name || d, count: v.length, latest: v[v.length - 1] || null }; })
      .filter(s => s.count).sort((a, b) => String(b.latest.at).localeCompare(String(a.latest.at)));
  }
  function versions(screen) {
    let files = []; try { files = fs.readdirSync(path.join(root, screen)).filter(f => /^\d{13}(-\d+)?\.json$/.test(f)).sort(); } catch {}
    return files.map(f => store.readJSON(`visuals/${screen}/${f}`, null)).filter(Boolean);
  }

  // Add one screenshot. `data` is base64 (or a data: URL) of a PNG.
  function add({ screen, data, note, by }) {
    const name = str(screen, 60) || 'Untitled screen', s = slug(name).slice(0, 48);
    const b64 = String(data || '').replace(/^data:image\/png;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length || buf.length > MAX_BYTES) return { error: buf.length ? 'image too large (8 MB max)' : 'empty image' };
    const img = decodePng(buf); if (!img && buf.readUInt32BE(0) !== 0x89504e47) return { error: 'not a PNG' };
    fs.mkdirSync(path.join(root, s), { recursive: true });
    if (!fs.existsSync(path.join(root, s, 'screen.json'))) store.writeJSON(`visuals/${s}/screen.json`, { name });
    let ts = String(Date.now()); while (fs.existsSync(path.join(root, s, ts + '.png'))) ts = String(Date.now()) + '-' + Math.floor(Math.random() * 1000);
    const prev = versions(s).pop();
    let pct = null;
    if (prev && img) { try { pct = diffPct(decodePng(fs.readFileSync(path.join(root, s, prev.ts + '.png'))), img); } catch {} }
    fs.writeFileSync(path.join(root, s, ts + '.png'), buf);
    // harden: each screen keeps its newest 60 versions (TRIBE_VISUALS_MAX); the oldest PNG and its .json go first
    require('./diskcap').prune(path.join(root, s), { match: n => /^\d+(-\d+)?\.png$/.test(n), keep: ts + '.png', maxCount: require('./diskcap').envNum('TRIBE_VISUALS_MAX', 60), onRemove: n => { try { fs.unlinkSync(path.join(root, s, n.replace(/\.png$/, '.json'))); } catch {} } });
    const meta = { ts, screen: s, name, at: new Date().toISOString(), by, w: img ? img.w : null, h: img ? img.h : null, bytes: buf.length, note: str(note, 300) || undefined, diffPrev: pct };
    store.writeJSON(`visuals/${s}/${ts}.json`, meta);
    broadcast({ type: 'visual', visual: meta });
    if (pct !== null && pct > DIFF_NOTIFY)
      bus.notify({ type: 'visual-diff', to: 'all', priority: 'low', view: 'visuals', ref: `${s}/${ts}`, title: `${name} changed ${pct}%`, body: `${nameOf(by)} posted a new version that differs ${pct}% from the last one.` });
    return { visual: meta };
  }

  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (m === 'GET' && !b) return send(res, 200, { screens: screens() });
    if (m === 'POST' && !b) {
      if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
      const body = await readBody(req, 12 * 1024 * 1024);
      const r = add({ screen: body.screen, data: body.png_base64 || body.data, note: body.note, by: me.id });
      return r.error ? fail(res, 400, r.error) : send(res, 200, r);
    }
    if (!b || !okScreen(b)) return fail(res, 400, 'bad screen');
    if (m === 'GET' && !c) return send(res, 200, { screen: { slug: b, name: store.readJSON(`visuals/${b}/screen.json`, {}).name || b }, versions: versions(b) });
    const ts = String(c || '').replace(/\.png$/, '');
    if (!okTs(ts)) return fail(res, 400, 'bad version');
    const file = path.join(root, b, ts + '.png');
    if (m === 'GET') {
      if (!fs.existsSync(file)) return fail(res, 404, 'not found');
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' });
      return fs.createReadStream(file).pipe(res);
    }
    if (m === 'DELETE') {
      if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
      try { fs.unlinkSync(file); fs.unlinkSync(path.join(root, b, ts + '.json')); } catch {}
      broadcast({ type: 'visual-removed', screen: b, ts }); return send(res, 200, { ok: true });
    }
    return null;
  }

  // MCP tool so Claude agents can post screenshots of what they built.
  const mcpTools = {
    add_visual: {
      description: 'Post a PNG screenshot of what you built to the tribe\'s Visuals view, grouped by screen name, so teammates can compare it with earlier versions (side by side, swipe, pixel diff).',
      inputSchema: { type: 'object', properties: { screen: { type: 'string', description: 'Screen name, e.g. "Login page"' }, png_base64: { type: 'string', description: 'Base64-encoded PNG' }, note: { type: 'string', description: 'Optional note' } }, required: ['screen', 'png_base64'], additionalProperties: false },
      run: ({ screen, png_base64, note }, me) => {
        const r = add({ screen, data: png_base64, note, by: me.id });
        const content = t => ({ content: [{ type: 'text', text: t }], ...(r.error ? { isError: true } : {}) });
        return r.error ? content(`Not added: ${r.error}`) : content(`Added a new version of "${r.visual.name}"${r.visual.diffPrev !== null ? ` (${r.visual.diffPrev}% different from the previous one)` : ''}.`);
      },
    },
  };

  return { route, screens, versions, add, mcpTools };
};
module.exports.decodePng = decodePng;
module.exports.diffPct = diffPct;
