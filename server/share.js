// "Share beyond my Wi-Fi": give the host a public https address for the tribe.
//   1. Tailscale Funnel (if the CLI exists and is logged in): stable https://<machine>.<tailnet>.ts.net URL.
//   2. Cloudflare quick tunnel (if cloudflared exists): no account, random https://*.trycloudflare.com URL
//      that changes every time it starts. The child process lives as long as the server.
//   3. No cloudflared: when the host turns sharing on, the official cloudflared binary is fetched from
//      Cloudflare's GitHub releases into ~/.tribecode/bin (one file, no installer, no admin) and used.
// Host-only API: POST/DELETE /api/share/public, GET for status (any member).
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');

const BIN_DIR = path.join(os.homedir(), '.tribecode', 'bin');
const WIN = process.platform === 'win32';
const CANDIDATES = {
  tailscale: ['tailscale', ...(WIN ? ['C:\\Program Files\\Tailscale\\tailscale.exe'] : []), ...(process.platform === 'darwin' ? ['/Applications/Tailscale.app/Contents/MacOS/Tailscale'] : [])],
  cloudflared: ['cloudflared', path.join(BIN_DIR, WIN ? 'cloudflared.exe' : 'cloudflared'), ...(WIN ? ['C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'] : ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared'])],
};
// Official release assets: https://github.com/cloudflare/cloudflared/releases
function cloudflaredAsset() {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'arm' ? 'arm' : process.arch === 'ia32' ? '386' : 'amd64';
  if (WIN) return { name: `cloudflared-windows-${arch === 'arm64' ? 'amd64' : arch}.exe`, tgz: false };
  if (process.platform === 'darwin') return { name: `cloudflared-darwin-${arch === 'arm64' ? 'arm64' : 'amd64'}.tgz`, tgz: true };
  return { name: `cloudflared-linux-${arch}`, tgz: false };
}
// fix/security-2: the download is checked against the SHA-256 Cloudflare publishes for the same release before anything is
// unpacked, made executable or run. The release (tag, notes, assets) comes from GitHub's API over https; the checksum is the
// "<asset>: <sha256>" line under "SHA256 Checksums:" in the release notes, and GitHub's own asset digest when it has one.
// Every published value must match the bytes; with none, or on any mismatch, the file is deleted and nothing runs.
const RELEASE_API = () => String(process.env.TRIBE_CLOUDFLARED_API || 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest');
function clientFor(url) {
  if (url.startsWith('https://')) return https;
  if (process.env.TRIBE_TEST && url.startsWith('http://127.0.0.1:')) return require('node:http');   // tests only: a local fake release
  throw new Error(`refusing a download that is not https (${url.slice(0, 80)})`);
}
function getJSON(url, hops = 0) {
  return new Promise((resolve, reject) => {
    clientFor(url).get(url, { headers: { 'user-agent': 'TribeCode', accept: 'application/vnd.github+json' }, timeout: 30_000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 4) { res.resume(); return resolve(getJSON(new URL(res.headers.location, url).href, hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`could not read the cloudflared release (HTTP ${res.statusCode})`)); }
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => { d += c; if (d.length > 4e6) res.destroy(new Error('release info too large')); });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('the cloudflared release info was not JSON')); } });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('release info timed out')); });
  });
}
// Saves to dest + '.part' and resolves with the SHA-256 (hex) of the bytes; the caller renames it only after checking.
function download(url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    clientFor(url).get(url, { headers: { 'user-agent': 'TribeCode' }, timeout: 60_000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) { res.resume(); return resolve(download(new URL(res.headers.location, url).href, dest, hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`download failed (HTTP ${res.statusCode})`)); }
      const f = fs.createWriteStream(dest + '.part', { mode: 0o600 }), h = crypto.createHash('sha256');
      res.on('data', c => h.update(c));
      res.pipe(f); f.on('finish', () => f.close(() => resolve(h.digest('hex')))); f.on('error', reject);
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('download timed out')); });
  });
}
// The SHA-256 values a GitHub release object publishes for one asset (release notes line + asset digest).
function publishedSha(rel, name) {
  const out = new Set();
  for (const line of String(rel.body || '').split(/\r?\n/)) {
    const m = /^\s*[-*]?\s*([\w.-]+)\s*:\s*([0-9a-fA-F]{64})\s*$/.exec(line);
    if (m && m[1] === name) out.add(m[2].toLowerCase());
  }
  const asset = (rel.assets || []).find(a => a && a.name === name) || null;
  if (asset && /^sha256:[0-9a-f]{64}$/i.test(String(asset.digest || ''))) out.add(String(asset.digest).slice(7).toLowerCase());
  return { shas: [...out], asset };
}
async function verifiedDownload(name, dest) {
  const rel = await getJSON(RELEASE_API());
  const tag = String(rel.tag_name || '');
  if (!/^[\w.-]{1,40}$/.test(tag)) throw new Error('the cloudflared release has no usable version tag');
  const { shas, asset } = publishedSha(rel, name);
  if (!shas.length) throw new Error(`Cloudflare's release ${tag} lists no SHA-256 for ${name}, so TribeCode did not download it. Install cloudflared yourself.`);
  if (shas.length > 1) throw new Error(`Cloudflare's release ${tag} lists two different SHA-256 values for ${name}, so TribeCode did not download it.`);
  // the exact release the checksum came from (not "latest", which could move in between)
  const url = process.env.TRIBE_TEST && asset && asset.browser_download_url ? asset.browser_download_url
    : `https://github.com/cloudflare/cloudflared/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
  let got;
  try { got = await download(url, dest); } catch (e) { try { fs.unlinkSync(dest + '.part'); } catch {} throw e; }
  if (got !== shas[0]) {
    try { fs.unlinkSync(dest + '.part'); } catch {}
    throw new Error(`the downloaded cloudflared (${name}, ${tag}) does not match the SHA-256 Cloudflare published (got ${got.slice(0, 12)}…, expected ${shas[0].slice(0, 12)}…). It was deleted and not run.`);
  }
  fs.renameSync(dest + '.part', dest);
  return { tag, sha: got };
}

const INSTALL = {
  tailscale: 'Tailscale (free, stable address): install from https://tailscale.com/download, run "tailscale up", then allow Funnel for your tailnet when it asks.',
  cloudflared: 'Cloudflare quick tunnel (no account): Windows "winget install --id Cloudflare.cloudflared", macOS "brew install cloudflared", Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
};

module.exports = function makeShare({ port, log = console.log }) {
  let state = { status: 'off', provider: null, url: null, message: '' };
  let child = null, detected = null, detectedAt = 0, fetching = null;
  const bins = {};
  // First candidate that runs (PATH, the usual install folders, or our own ~/.tribecode/bin copy).
  function bin(tool, force) {
    if (!force && bins[tool]) return bins[tool];
    for (const c of CANDIDATES[tool]) {
      if (c.includes(path.sep) && !fs.existsSync(c)) continue;
      const r = spawnSync(c, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      if (!r.error) return (bins[tool] = c);
    }
    return null;
  }
  async function fetchCloudflared() {
    if (fetching) return fetching;
    fetching = (async () => {
      const a = cloudflaredAsset(); fs.mkdirSync(BIN_DIR, { recursive: true });
      log(`  Public:   downloading cloudflared (${a.name})...`);
      const exe = path.join(BIN_DIR, WIN ? 'cloudflared.exe' : 'cloudflared');
      // fix/security-2: checked against Cloudflare's published SHA-256 before it is unpacked, made executable or run
      const t = a.tgz ? path.join(BIN_DIR, a.name) : exe;
      const v = await verifiedDownload(a.name, t);
      if (a.tgz) { spawnSync('tar', ['-xzf', t, '-C', BIN_DIR]); try { fs.unlinkSync(t); } catch {} }
      log(`  Public:   cloudflared ${v.tag} verified against Cloudflare's SHA-256`);
      if (!WIN) fs.chmodSync(exe, 0o755);
      return bin('cloudflared', true);
    })().finally(() => { fetching = null; });
    return fetching;
  }

  function run(cmd, args, timeout = 8000) {
    if (cmd === 'tailscale' || cmd === 'cloudflared') { const b = bin(cmd); if (!b) return { ok: false, missing: true, out: `${cmd} not found` }; cmd = b; }
    try {
      const r = spawnSync(cmd, args, { encoding: 'utf8', timeout, windowsHide: true });
      if (r.error) return { ok: false, missing: r.error.code === 'ENOENT', out: String(r.error.message) };
      return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`, stdout: r.stdout || '' };
    } catch (e) { return { ok: false, missing: true, out: e.message }; }
  }
  // Async variant for slow commands (tailscale funnel can wait ~20 s for approval): never block the server.
  function runAsync(cmd, args, timeout = 8000) {
    const b = bin(cmd); if (!b) return Promise.resolve({ ok: false, missing: true, out: `${cmd} not found` });
    return new Promise(resolve => {
      let out = '', done = false;
      const p = spawn(b, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const fin = r => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
      const t = setTimeout(() => { try { p.kill(); } catch {} fin({ ok: false, out }); }, timeout);
      p.stdout.on('data', c => (out += c)); p.stderr.on('data', c => (out += c));
      p.on('error', e => fin({ ok: false, out: e.message })); p.on('exit', code => fin({ ok: code === 0, out, stdout: out }));
    });
  }
  const json = s => { try { return JSON.parse(s); } catch { return null; } };

  // Which tools exist? Cached briefly so GET /api/share/public stays cheap.
  function detect(force) {
    if (!force && detected && Date.now() - detectedAt < 30_000) return detected;
    if (force) { delete bins.tailscale; delete bins.cloudflared; }
    const ts = run('tailscale', ['status', '--json'], 5000);
    const st = ts.ok ? json(ts.stdout) : null;
    const cf = run('cloudflared', ['--version'], 5000);
    detected = {
      tailscale: !ts.missing, tailscaleReady: !!(st && st.BackendState === 'Running'),
      tailscaleName: st && st.Self && st.Self.DNSName ? String(st.Self.DNSName).replace(/\.$/, '') : '',
      cloudflared: !cf.missing,
    };
    detectedAt = Date.now();
    return detected;
  }

  function status() {
    const d = detect();
    const available = { tailscale: d.tailscale && d.tailscaleReady, cloudflared: d.cloudflared };
    if (state.status === 'off' && !available.tailscale && !available.cloudflared) {
      return { status: 'unavailable', url: null, provider: null, available, message: unavailableMessage(d), install: INSTALL };
    }
    return { ...state, available, install: INSTALL };
  }
  function unavailableMessage(d) {
    if (d.tailscale && !d.tailscaleReady) return 'Tailscale is installed but not signed in. Run "tailscale up", or install cloudflared for a no-account tunnel.';
    return 'Sharing beyond your Wi-Fi needs Tailscale or cloudflared on this computer. Neither is installed.';
  }

  function tailscaleUrl(d) {
    const fs = json(run('tailscale', ['funnel', 'status', '--json'], 5000).stdout || '');
    const host = fs && fs.AllowFunnel && Object.keys(fs.AllowFunnel).find(k => fs.AllowFunnel[k]);
    if (host) return 'https://' + host.replace(/:443$/, '');
    return d.tailscaleName ? 'https://' + d.tailscaleName : null;
  }

  async function startTailscale(d) {
    const r = await runAsync('tailscale', ['funnel', '--bg', String(port)], 20000);
    if (!r.ok) {
      const hint = (r.out.match(/https:\/\/login\.tailscale\.com\/\S+/) || [])[0];
      return { ok: false, approveUrl: hint || null, message: hint ? `Funnel isn't enabled for your tailnet yet. Allow it here, then try again: ${hint}` : `tailscale funnel failed: ${r.out.trim().slice(0, 300)}` };
    }
    const url = tailscaleUrl(d);
    return url ? { ok: true, url } : { ok: false, message: 'Funnel started, but the address could not be read from "tailscale funnel status".' };
  }

  function startCloudflare() {
    return new Promise(resolve => {
      let done = false, buf = '';
      const p = spawn(bin('cloudflared') || 'cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const finish = r => { if (done) return; done = true; clearTimeout(t); resolve(r); };
      const t = setTimeout(() => { try { p.kill(); } catch {} finish({ ok: false, message: 'cloudflared did not report an address within 40 seconds.' }); }, 40_000);
      const onData = c => {
        buf = (buf + c.toString()).slice(-20000);
        const m = buf.match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/);   // qa-pass: not api.trycloudflare.com from an error line
        if (m) { child = p; finish({ ok: true, url: m[0] }); }
      };
      p.stdout.on('data', onData); p.stderr.on('data', onData);
      p.on('error', e => finish({ ok: false, message: 'cloudflared could not start: ' + e.message }));
      p.on('exit', code => {
        if (child === p) { child = null; if (state.provider === 'cloudflare') { state = { status: 'off', provider: null, url: null, message: 'The Cloudflare tunnel stopped.' }; log('  Public:   Cloudflare tunnel stopped'); } }
        finish({ ok: false, message: `cloudflared exited (code ${code}). ${buf.trim().split('\n').slice(-2).join(' ').slice(0, 240)}` });
      });
    });
  }

  async function start(provider, { download = true } = {}) {
    // Upgrading a temporary Cloudflare address to Tailscale's permanent one is allowed while on.
    const upgrade = state.status === 'on' && state.provider === 'cloudflare' && provider === 'tailscale';
    if (state.status === 'on' && !upgrade) return status();
    const d = detect(true);
    const tried = []; let approveUrl = null;
    if (provider !== 'cloudflare' && d.tailscale && d.tailscaleReady) {
      const r = await startTailscale(d);
      if (r.ok) { if (child) { try { child.kill(); } catch {} child = null; } state = { status: 'on', provider: 'tailscale', url: r.url, message: 'Tailscale Funnel is on. This address stays the same.' }; log(`  Public:   ${r.url} (Tailscale Funnel)`); return status(); }
      tried.push(r.message); approveUrl = r.approveUrl || null;
      if (upgrade) return { ...status(), approveUrl };   // keep the Cloudflare address running
    }
    if (provider !== 'tailscale' && !d.cloudflared && download && !process.env.TRIBE_NO_DOWNLOAD) {
      try { if (await fetchCloudflared()) d.cloudflared = true; } catch (e) { tried.push(`Could not download cloudflared: ${e.message}.`); }
    }
    if (provider !== 'tailscale' && d.cloudflared) {
      state = { status: 'starting', provider: 'cloudflare', url: null, message: 'Starting a Cloudflare tunnel…' };
      const r = await startCloudflare();
      if (r.ok) { state = { status: 'on', provider: 'cloudflare', url: r.url, message: 'Cloudflare quick tunnel is on. The address changes each time it starts.' }; log(`  Public:   ${r.url} (Cloudflare quick tunnel)`); return { ...status(), approveUrl }; }
      tried.push(r.message);
    }
    state = { status: 'off', provider: null, url: null, message: '' };
    if (!tried.length) return { ...status(), status: 'unavailable', approveUrl, message: unavailableMessage(d) };
    return { ...status(), status: 'error', approveUrl, message: tried.join(' ') };
  }

  function stop() {
    if (child) { try { child.kill(); } catch {} child = null; }
    if (state.provider === 'tailscale') {
      // Turn off only what we turned on; older CLIs use the second form.
      if (!run('tailscale', ['funnel', '--bg', String(port), 'off'], 8000).ok) run('tailscale', ['funnel', '--https=443', 'off'], 8000);
    }
    state = { status: 'off', provider: null, url: null, message: '' };
    return status();
  }

  // For /api/health: the public address goes first in `lan`, so invites and QR codes use it.
  const lanEntry = () => (state.status === 'on' && state.url ? [{ url: state.url, kind: 'public', name: state.provider }] : []);

  async function route(req, res, { b, m, me, readBody, send, fail }) {
    if (b !== 'public') return null;
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m === 'GET') return send(res, 200, status());
    if (me.role !== 'host') return fail(res, 403, 'only the host can share the tribe publicly');
    if (m === 'POST') { const body = await readBody(req); return send(res, 200, await start(['tailscale', 'cloudflare'].includes(body.provider) ? body.provider : '', { download: !body.auto })); }
    if (m === 'DELETE') return send(res, 200, stop());
    return null;
  }

  process.on('exit', () => { if (state.status === 'on' || child) { try { stop(); } catch {} } });

  const publicUrl = () => (state.status === 'on' && state.url) || null;   // cheap: no CLI calls
  return { route, status, start, stop, lanEntry, publicUrl, INSTALL };
};
module.exports.verifiedDownload = verifiedDownload;   // fix/security-2: tests (app/test/security3_test.py)
module.exports.publishedSha = publishedSha;
