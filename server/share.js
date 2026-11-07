// "Share beyond my Wi-Fi": give the host a public https address for the tribe.
//   1. Tailscale Funnel (if the CLI exists and is logged in): stable https://<machine>.<tailnet>.ts.net URL.
//   2. Cloudflare quick tunnel (if cloudflared exists): no account, random https://*.trycloudflare.com URL
//      that changes every time it starts. The child process lives as long as the server.
//   3. Neither installed: a clear message with one-line install hints. Nothing is installed automatically.
// Host-only API: POST/DELETE /api/share/public, GET for status (any member).
'use strict';
const { spawn, spawnSync } = require('node:child_process');

const INSTALL = {
  tailscale: 'Tailscale (free, stable address): install from https://tailscale.com/download, run "tailscale up", then allow Funnel for your tailnet when it asks.',
  cloudflared: 'Cloudflare quick tunnel (no account): Windows "winget install --id Cloudflare.cloudflared", macOS "brew install cloudflared", Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
};

module.exports = function makeShare({ port, log = console.log }) {
  let state = { status: 'off', provider: null, url: null, message: '' };
  let child = null, detected = null, detectedAt = 0;

  function run(cmd, args, timeout = 8000) {
    try {
      const r = spawnSync(cmd, args, { encoding: 'utf8', timeout, windowsHide: true });
      if (r.error) return { ok: false, missing: r.error.code === 'ENOENT', out: String(r.error.message) };
      return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`, stdout: r.stdout || '' };
    } catch (e) { return { ok: false, missing: true, out: e.message }; }
  }
  const json = s => { try { return JSON.parse(s); } catch { return null; } };

  // Which tools exist? Cached briefly so GET /api/share/public stays cheap.
  function detect(force) {
    if (!force && detected && Date.now() - detectedAt < 30_000) return detected;
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

  function startTailscale(d) {
    const r = run('tailscale', ['funnel', '--bg', String(port)], 20000);
    if (!r.ok) {
      const hint = (r.out.match(/https:\/\/login\.tailscale\.com\/\S+/) || [])[0];
      return { ok: false, message: hint ? `Funnel isn't enabled for your tailnet yet. Allow it here, then try again: ${hint}` : `tailscale funnel failed: ${r.out.trim().slice(0, 300)}` };
    }
    const url = tailscaleUrl(d);
    return url ? { ok: true, url } : { ok: false, message: 'Funnel started, but the address could not be read from "tailscale funnel status".' };
  }

  function startCloudflare() {
    return new Promise(resolve => {
      let done = false, buf = '';
      const p = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const finish = r => { if (done) return; done = true; clearTimeout(t); resolve(r); };
      const t = setTimeout(() => { try { p.kill(); } catch {} finish({ ok: false, message: 'cloudflared did not report an address within 40 seconds.' }); }, 40_000);
      const onData = c => {
        buf = (buf + c.toString()).slice(-20000);
        const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
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

  async function start(provider) {
    if (state.status === 'on') return status();
    const d = detect(true);
    const tried = [];
    if (provider !== 'cloudflare' && d.tailscale && d.tailscaleReady) {
      const r = startTailscale(d);
      if (r.ok) { state = { status: 'on', provider: 'tailscale', url: r.url, message: 'Tailscale Funnel is on. This address stays the same.' }; log(`  Public:   ${r.url} (Tailscale Funnel)`); return status(); }
      tried.push(r.message);
    }
    if (provider !== 'tailscale' && d.cloudflared) {
      state = { status: 'starting', provider: 'cloudflare', url: null, message: 'Starting a Cloudflare tunnel…' };
      const r = await startCloudflare();
      if (r.ok) { state = { status: 'on', provider: 'cloudflare', url: r.url, message: 'Cloudflare quick tunnel is on. The address changes each time it starts.' }; log(`  Public:   ${r.url} (Cloudflare quick tunnel)`); return status(); }
      tried.push(r.message);
    }
    state = { status: 'off', provider: null, url: null, message: '' };
    if (!tried.length) return { ...status(), status: 'unavailable', message: unavailableMessage(d) };
    return { ...status(), status: 'error', message: tried.join(' ') };
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
    if (m === 'POST') { const body = await readBody(req); return send(res, 200, await start(['tailscale', 'cloudflare'].includes(body.provider) ? body.provider : '')); }
    if (m === 'DELETE') return send(res, 200, stop());
    return null;
  }

  process.on('exit', () => { if (state.status === 'on' || child) { try { stop(); } catch {} } });

  const publicUrl = () => (state.status === 'on' && state.url) || null;   // cheap: no CLI calls
  return { route, status, start, stop, lanEntry, publicUrl, INSTALL };
};
