// Flint's local helper, tier 1 (feat/build-feeds): where the browser gets the small word-embedding model from.
// The model runs in each person's browser (app/ui/flintembed.js); the server never runs it and never sends text anywhere.
//
//   GET /api/flint/model               { name, base, files, bytes, approx, license, card, hosted }
//   GET /api/flint/model/file/<name>   model.safetensors | tokenizer.json | config.json   (only when the host holds the files)
//
// By default the browser downloads the documented model straight from its publisher, once, when the person opts in.
// A host can instead keep the files in <tribe>/.tribe/flint-model/ (or TRIBE_FLINT_MODEL_DIR): then members download
// from their own host and nothing outside is contacted (air-gapped tribes, and the tests' fixture model).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// The documented default. A Model2Vec static embedding model (MIT), 256 dimensions, about 30 MB as float32.
const DEFAULT = { name: 'potion-base-8M', base: 'https://huggingface.co/minishlab/potion-base-8M/resolve/main/', card: 'https://huggingface.co/minishlab/potion-base-8M', license: 'MIT', approx: 30 * 1024 * 1024 };
const FILES = { model: 'model.safetensors', tokenizer: 'tokenizer.json', config: 'config.json' };
const TYPES = { 'model.safetensors': 'application/octet-stream', 'tokenizer.json': 'application/json', 'config.json': 'application/json' };

module.exports = function flintModel({ base }) {
  function hostedDir() {
    for (const d of [process.env.TRIBE_FLINT_MODEL_DIR, base.p('.tribe/flint-model')].filter(Boolean)) {
      try { if (fs.statSync(path.join(d, FILES.model)).isFile() && fs.statSync(path.join(d, FILES.tokenizer)).isFile()) return d; } catch {}
    }
    return null;
  }
  function info() {
    const d = hostedDir();
    if (!d) return { ...DEFAULT, files: FILES, bytes: null, hosted: false };
    let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(d, FILES.config), 'utf8')); } catch {}
    const bytes = fs.statSync(path.join(d, FILES.model)).size + fs.statSync(path.join(d, FILES.tokenizer)).size;
    return { name: String(cfg.name || path.basename(d)).slice(0, 60), base: '/api/flint/model/file/', card: null, license: String(cfg.license || 'see the host').slice(0, 40), approx: bytes, bytes, files: FILES, hosted: true, note: cfg.note ? String(cfg.note).slice(0, 200) : undefined };
  }
  async function route(req, res, { m, c, parts, me, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m !== 'GET') return fail(res, 405, 'GET only');
    if (!c) return send(res, 200, info());
    if (c === 'file') {
      const name = String(parts[3] || ''), d = hostedDir();
      if (!d || !TYPES[name]) return fail(res, 404, 'no such model file');
      const full = path.join(d, name); let st; try { st = fs.statSync(full); } catch { return fail(res, 404, 'no such model file'); }
      res.writeHead(200, { 'Content-Type': TYPES[name], 'Content-Length': st.size, 'Cache-Control': 'private, max-age=86400', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(full).pipe(res);
    }
    return fail(res, 404, 'not found');
  }
  return { route, info };
};
module.exports.DEFAULT = DEFAULT;
