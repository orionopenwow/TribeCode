// feat/captures: the download manager for optional packs (docs/STUDIO-SCOPING.md section 10, docs/LINK-READER.md).
// Host only, off by default. A pack is pinned (exact version, sha256 per file), downloaded on the host into
// .tribe/packs/<id>@<version>/, verified, then renamed into place. Executables run only through fixed argument
// arrays (execFile, never a shell). Settings › Packs lists each pack with its size and a Remove button.
//   GET    /api/packs                 -> { packs: [...], tools: { ffmpeg } }       members (details trimmed for non-hosts)
//   POST   /api/packs/:id/install     { accept: true }  -> { started }              host only
//   DELETE /api/packs/:id                               -> { ok }                    host only
// Packs here: yt-dlp (published captions and public audio for video links) and whisper.cpp models (local transcripts).
// whisper.cpp itself (the engine) is a native program people install their own way (brew, winget, a release zip);
// we look for it on PATH or in .tribe/packs/<pack>/bin/. Tests (TRIBE_TEST=1) can load a stand-in index from
// TRIBE_TEST_PACKS_INDEX with local URLs and mock executables.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const { execFile } = require('node:child_process');
const { isPrivate } = require('./embeds');

const YT = '2026.10.21', YTBASE = `https://github.com/yt-dlp/yt-dlp/releases/download/${YT}/`;
const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';
const TERMS = 'yt-dlp reads public captions and audio from video sites. You are responsible for following each site\'s terms. TribeCode never logs in to accounts and never fetches private or paywalled videos.';
const WHISPER_NOTE = 'This downloads the speech model. The whisper.cpp program itself is installed your own way (macOS: brew install whisper-cpp · Windows: the release zip from github.com/ggml-org/whisper.cpp, put whisper-cli.exe in the pack\'s bin folder · Linux: build it or use your package manager). TribeCode finds it on PATH.';
// sha256 values from the projects' own published checksums (yt-dlp SHA2-256SUMS, Hugging Face LFS object ids).
const INDEX = [
  { id: 'yt-dlp', version: YT, title: 'Video captions (yt-dlp)', what: 'Published captions for video links, and public audio for local transcripts.', license: 'Unlicense', source: 'github.com/yt-dlp/yt-dlp', terms: TERMS, kind: 'tool',
    platforms: {
      'win32-x64': [{ path: 'yt-dlp.exe', url: YTBASE + 'yt-dlp.exe', sha256: 'f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d', bytes: 18_000_000, approx: true, exec: true }],
      'win32-arm64': [{ path: 'yt-dlp.exe', url: YTBASE + 'yt-dlp_arm64.exe', sha256: '0066dbac3c124028e2dcae2a197fccee33cd91f456313d24f7af89fd54590e98', bytes: 18_000_000, approx: true, exec: true }],
      'darwin-arm64': [{ path: 'yt-dlp', url: YTBASE + 'yt-dlp_macos', sha256: '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa', bytes: 36_000_000, approx: true, exec: true }],
      'darwin-x64': [{ path: 'yt-dlp', url: YTBASE + 'yt-dlp_macos', sha256: '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa', bytes: 36_000_000, approx: true, exec: true }],
      'linux-x64': [{ path: 'yt-dlp', url: YTBASE + 'yt-dlp_linux', sha256: '767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795', bytes: 36_000_000, approx: true, exec: true }],
      'linux-arm64': [{ path: 'yt-dlp', url: YTBASE + 'yt-dlp_linux_aarch64', sha256: 'e87e9533e89fe5889abaa21f5114dfe7756d6aa6219b83551add04d48b18e483', bytes: 36_000_000, approx: true, exec: true }],
    }, run: 'yt-dlp' },
  { id: 'whisper-tiny', version: 'ggml-tiny.en', title: 'Local transcripts, small (whisper.cpp)', what: 'Turns voice notes and video audio into text on this computer. Good for laptops. English.', license: 'MIT', source: 'huggingface.co/ggerganov/whisper.cpp', note: WHISPER_NOTE, kind: 'whisper',
    files: [{ path: 'model.bin', url: HF + 'ggml-tiny.en.bin', sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f', bytes: 77_704_715 }] },
  { id: 'whisper-base', version: 'ggml-base', title: 'Local transcripts, better (whisper.cpp)', what: 'More accurate, any language. Needs a bit more time and memory.', license: 'MIT', source: 'huggingface.co/ggerganov/whisper.cpp', note: WHISPER_NOTE, kind: 'whisper',
    files: [{ path: 'model.bin', url: HF + 'ggml-base.bin', sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe', bytes: 147_951_465 }] },
];
const HOSTS = [/^github\.com$/, /(^|\.)githubusercontent\.com$/, /^huggingface\.co$/, /(^|\.)hf\.co$/, /^cdn-lfs(-[a-z0-9-]+)?\.huggingface\.co$/];
const HARD_CAP = 600 * 1024 * 1024;

module.exports = function packs({ store, isHost = me => me && me.role === 'host', broadcast = () => {}, log = () => {} }) {
  const ROOT = store.p('.tribe', 'packs');
  const TEST = process.env.TRIBE_TEST === '1';
  const plat = `${process.platform}-${process.arch}`;
  function index() {
    let list = INDEX;
    if (TEST && process.env.TRIBE_TEST_PACKS_INDEX) { try { const extra = JSON.parse(fs.readFileSync(process.env.TRIBE_TEST_PACKS_INDEX, 'utf8')); list = [...INDEX.filter(p => !extra.some(x => x.id === p.id)), ...extra]; } catch (e) { log('packs: bad test index ' + e.message); } }
    return list;
  }
  const byId = id => index().find(p => p.id === id);
  const filesOf = p => p.files || (p.platforms && (p.platforms[plat] || p.platforms[`${process.platform}-x64`])) || null;
  const dirOf = p => path.join(ROOT, `${p.id}@${String(p.version).replace(/[^\w.-]/g, '_')}`);
  const manifest = p => { try { return JSON.parse(fs.readFileSync(path.join(dirOf(p), 'manifest.json'), 'utf8')); } catch { return null; } };
  const installed = p => { const m = manifest(p); return !!(m && m.version === p.version && (m.files || []).every(f => fs.existsSync(path.join(dirOf(p), f.path)))); };
  const jobs = new Map();   // id -> { got, total, error, done }

  // ---------- finding programs ----------
  const exe = n => (process.platform === 'win32' ? `${n}.exe` : n);
  function onPath(names) {
    const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const n of names) for (const d of dirs) { const f = path.join(d, exe(n)); try { if (fs.statSync(f).isFile()) return f; } catch {} }
    return null;
  }
  function whisperEngine(p) {
    for (const n of ['whisper-cli', 'whisper-cpp', 'main']) { const f = path.join(dirOf(p), 'bin', exe(n)); try { if (fs.statSync(f).isFile()) return f; } catch {} }
    if (TEST && process.env.TRIBE_TEST_NO_PATH === '1') return null;
    return onPath(['whisper-cli', 'whisper-cpp']);
  }
  const ffmpeg = () => (TEST && process.env.TRIBE_TEST_NO_PATH === '1' ? null : onPath(['ffmpeg']));
  // The best whisper pack that is installed and has an engine: { model, engine } or null.
  function whisper() {
    for (const id of ['whisper-base', 'whisper-tiny', ...index().filter(p => p.kind === 'whisper').map(p => p.id)]) {
      const p = byId(id); if (!p || !installed(p)) continue;
      const engine = whisperEngine(p); if (engine) { touch(p); return { model: path.join(dirOf(p), 'model.bin'), engine, pack: p.id }; }
    }
    return null;
  }
  function ytdlp() {
    const p = byId('yt-dlp'); if (!p || !installed(p)) return null;
    const f = (filesOf(p) || []).find(x => x.exec); if (!f) return null;
    touch(p); return path.join(dirOf(p), f.path);
  }
  function touch(p) { try { const u = store.readJSON('.tribe/packs/usage.json', {}) || {}; u[p.id] = { last: new Date().toISOString() }; store.writeJSON('.tribe/packs/usage.json', u); } catch {} }

  // Run a pack's program: fixed args, no shell, a time limit, output capped.
  function run(file, args, { timeout = 120_000, cwd } = {}) {
    return new Promise((resolve, reject) => {
      execFile(file, args.map(String), { timeout, cwd, shell: false, windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }, (err, stdout, stderr) => {
        if (err) return reject(Object.assign(new Error(err.killed ? 'it took too long' : String(stderr || err.message).split('\n').filter(Boolean).slice(-1)[0] || 'it stopped with an error'), { code: err.code, stderr: String(stderr || '').slice(-2000) }));
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      });
    });
  }

  // ---------- downloading ----------
  const hostOk = h => HOSTS.some(re => re.test(h));
  const testAllow = new Set(TEST ? String(process.env.TRIBE_TEST_PACKS_ALLOW || '').split(',').map(s => s.trim()).filter(Boolean) : []);
  async function address(u) {
    const host = u.hostname.replace(/^\[|\]$/g, ''), port = u.port || (u.protocol === 'https:' ? '443' : '80');
    if (testAllow.has(`${host}:${port}`)) return { address: net.isIP(host) ? host : '127.0.0.1', family: 4 };
    if (u.protocol !== 'https:') throw new Error('packs only download over https');
    if (!hostOk(host)) throw new Error(`packs only download from the projects' own sites (not ${host})`);
    const addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
    if (!addrs.length || addrs.some(a => isPrivate(a.address))) throw new Error('that download address is not public');
    return addrs[0];
  }
  function getTo(url, file, cap, onData, hops = 0) {
    return new Promise((resolve, reject) => {
      let u; try { u = new URL(url); } catch { return reject(new Error('bad download link')); }
      address(u).then(addr => {
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request(u, { method: 'GET', agent: false, lookup: (h, o, cb) => (o && o.all ? cb(null, [addr]) : cb(null, addr.address, addr.family)), headers: { 'User-Agent': 'TribeCodePacks/1.0', 'Accept-Encoding': 'identity' } }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); if (hops >= 6) return reject(new Error('too many redirects')); return getTo(new URL(res.headers.location, u).href, file, cap, onData, hops + 1).then(resolve, reject); }
          if (res.statusCode !== 200) { res.resume(); return reject(new Error(`the download site answered ${res.statusCode}`)); }
          const hash = crypto.createHash('sha256'), out = fs.createWriteStream(file); let size = 0, done = false;
          const idle = () => { clearTimeout(req._idle); req._idle = setTimeout(() => req.destroy(new Error('the download stalled')), 30_000); };
          idle();
          res.on('data', c => { size += c.length; if (size > cap) { done = true; req.destroy(new Error('the download is bigger than expected')); return; } hash.update(c); onData(c.length); idle(); });
          res.pipe(out);
          out.on('finish', () => { clearTimeout(req._idle); if (!done) resolve({ sha256: hash.digest('hex'), size }); });
          res.on('error', e => { clearTimeout(req._idle); out.destroy(); reject(e); });
          req.on('error', e => { clearTimeout(req._idle); out.destroy(); reject(e); });
        });
        req.on('error', reject);
        req.end();
      }, reject);
    });
  }
  async function install(p) {
    const files = filesOf(p); if (!files) throw new Error('this pack has no build for this computer');
    if (jobs.has(p.id) && !jobs.get(p.id).done) return jobs.get(p.id);
    const job = { got: 0, total: files.reduce((a, f) => a + (f.bytes || 0), 0), error: '', done: false, started: Date.now() };
    jobs.set(p.id, job);
    const tmp = path.join(ROOT, `.tmp-${p.id}-${Date.now().toString(36)}`);
    const push = () => broadcast({ type: 'packs', id: p.id, got: job.got, total: job.total, done: job.done, error: job.error });
    let last = 0;
    (async () => {
      fs.mkdirSync(tmp, { recursive: true });
      for (const f of files) {
        const dest = path.join(tmp, f.path);
        if (path.relative(tmp, dest).startsWith('..')) throw new Error('bad file name in the pack');
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        let r = null, lastErr = null;
        for (let attempt = 0; attempt < 3 && !r; attempt++) {
          if (attempt) await new Promise(res => setTimeout(res, 800 * 2 ** attempt));
          const before = job.got;
          try { r = await getTo(f.url, dest, Math.min(HARD_CAP, f.approx ? (f.bytes || 0) * 4 + 1e6 : (f.bytes || HARD_CAP) + 1024), n => { job.got += n; if (Date.now() - last > 500) { last = Date.now(); push(); } }); }
          catch (e) { lastErr = e; job.got = before; try { fs.unlinkSync(dest); } catch {} if (/not public|only download|https/.test(e.message)) break; }
        }
        if (!r) throw lastErr || new Error('the download failed');
        if (r.sha256 !== String(f.sha256).toLowerCase()) { try { fs.unlinkSync(dest); } catch {} throw new Error(`${f.path} did not match its checksum, so it was deleted. Try again later.`); }
        if (f.exec && process.platform !== 'win32') fs.chmodSync(dest, 0o755);
      }
      fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({ id: p.id, version: p.version, installed: new Date().toISOString(), files: files.map(f => ({ path: f.path, sha256: f.sha256 })) }, null, 2));
      const dir = dirOf(p);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.renameSync(tmp, dir);   // atomic: a half download never looks installed
      job.done = true; push(); log(`packs: installed ${p.id}@${p.version}`);
    })().catch(e => { job.error = e.message; job.done = true; try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} push(); log(`packs: ${p.id} failed: ${e.message}`); });
    return job;
  }
  function remove(p) {
    for (const d of fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : []) if (d === p.id || d.startsWith(p.id + '@')) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
    jobs.delete(p.id);
  }
  function du(dir) { let n = 0; try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); n += e.isDirectory() ? du(f) : fs.statSync(f).size; } } catch {} return n; }

  function view(p, host) {
    const files = filesOf(p), inst = installed(p), job = jobs.get(p.id), usage = (store.readJSON('.tribe/packs/usage.json', {}) || {})[p.id];
    const engine = p.kind === 'whisper' ? whisperEngine(p) : null;
    return { id: p.id, title: p.title, what: p.what, license: p.license, version: p.version, kind: p.kind, available: !!files, installed: inst,
      bytes: files ? files.reduce((a, f) => a + (f.bytes || 0), 0) : 0, approx: !!(files && files.some(f => f.approx)), installedBytes: inst ? du(dirOf(p)) : 0,
      ready: inst && (p.kind !== 'whisper' || !!engine), ...(p.kind === 'whisper' ? { engine: !!engine } : {}), terms: p.terms || '', note: p.note || '',
      lastUsed: usage ? usage.last : null, ...(host && job && !job.done ? { downloading: { got: job.got, total: job.total } } : {}), ...(host && job && job.error ? { error: job.error } : {}),
      ...(host ? { source: p.source, folder: inst ? dirOf(p) : null } : {}) };
  }

  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const host = isHost(me);
    if (m === 'GET' && !b) return send(res, 200, { packs: index().map(p => view(p, host)), tools: { ffmpeg: !!ffmpeg() }, host });
    if (!host) return fail(res, 403, 'only the host can add or remove packs');
    const p = b && byId(b); if (!p) return fail(res, 404, 'no such pack');
    if (m === 'POST' && c === 'install') {
      const body = await readBody(req);
      if (p.terms && body.accept !== true) return fail(res, 400, 'please read and accept the note first');
      if (!filesOf(p)) return fail(res, 400, 'this pack has no build for this computer');
      try { await install(p); } catch (e) { return fail(res, 400, e.message); }
      return send(res, 200, { started: true, pack: view(p, true) });
    }
    if (m === 'DELETE' && !c) { remove(p); return send(res, 200, { ok: true, pack: view(p, true) }); }
    return fail(res, 404, 'not found');
  }
  return { route, whisper, ytdlp, ffmpeg, run, index, installed: id => { const p = byId(id); return !!(p && installed(p)); }, TERMS };
};
module.exports.INDEX = INDEX;
