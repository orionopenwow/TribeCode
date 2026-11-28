// fix/p15-updates: the local admin door, used to finish an update (docs/UPDATES.md).
//
// The desktop app (Rust, main.rs host_start) and scripts/update-from-source.js must be able to stop an OLDER TribeCode
// server that still holds the port after an update; otherwise that old process keeps serving the old screens and old
// server code. They share one per-install secret, a file only this computer's user can read:
//   ~/.tribecode/admin-secret            (TRIBECODE_HOME overrides ~/.tribecode)
// and say it in the X-Tribe-Admin header. The door answers only requests from this machine (127.0.0.1 / ::1, no proxy
// headers, a localhost Host: the same isLocal() the rest of the server uses), so a tunnel (Tailscale Funnel, Cloudflare)
// or a home-network visitor never reaches it, even with the secret.
//   POST /api/admin/shutdown   secret              -> 200, then the server writes pending edits and exits (code 0)
//   POST /api/admin/restart    secret, or the host  -> 200 and exit code 75 when a supervisor restarts it
//                              signed in here       (TRIBE_SUPERVISED=1: the .bat loops, scripts/update-from-source.js),
//                                                   else 409 so the page says "close and reopen"
// Each running server also leaves ~/.tribecode/servers/<port>.json { pid, port, version, build, ui, dir, startedAt } so
// the update scripts know which process they started; it is removed on exit.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

module.exports = function makeAdmin({ port, version, build, ui, dir, isLocal, authed, onStop, log = () => {} }) {
  const home = () => process.env.TRIBECODE_HOME || path.join(os.homedir(), '.tribecode');
  const secretFile = () => path.join(home(), 'admin-secret');
  const pidFile = () => path.join(home(), 'servers', `${port}.json`);

  // read the shared secret, making it the first time (whoever starts first, the app or the server, writes it once)
  function secret() {
    try { const s = fs.readFileSync(secretFile(), 'utf8').trim(); if (s.length >= 32) return s; } catch {}
    try {
      fs.mkdirSync(home(), { recursive: true });
      const s = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretFile(), s, { flag: 'wx', mode: 0o600 });
      return s;
    } catch { try { const s = fs.readFileSync(secretFile(), 'utf8').trim(); if (s.length >= 32) return s; } catch {} }
    return '';
  }
  const same = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length >= 32 && crypto.timingSafeEqual(x, y); };

  function writePid() {
    try {
      fs.mkdirSync(path.dirname(pidFile()), { recursive: true });
      fs.writeFileSync(pidFile(), JSON.stringify({ pid: process.pid, port, version, build, ui, dir, supervised: process.env.TRIBE_SUPERVISED === '1', startedAt: new Date().toISOString() }, null, 2));
      const drop = () => { try { const cur = JSON.parse(fs.readFileSync(pidFile(), 'utf8')); if (cur.pid === process.pid) fs.unlinkSync(pidFile()); } catch {} };
      process.on('exit', drop);
    } catch {}
    secret();   // make sure the secret exists, so the app can always ask this server to stop
  }

  function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
  function stop(code, why) {
    log(`Stopping (${why})`);
    setTimeout(() => { try { onStop && onStop(); } catch {} process.exit(code); }, 150);
  }
  function route(req, res, url) {
    const what = url.pathname.replace(/^\/api\/admin\//, '').replace(/\/$/, '');
    if (req.method !== 'POST' || !['shutdown', 'restart'].includes(what)) return json(res, 404, { error: 'not found' });
    if (!isLocal(req)) return json(res, 403, { error: 'only from this computer' });
    const ok = same(req.headers['x-tribe-admin'], secret());
    if (what === 'shutdown') {
      if (!ok) return json(res, 403, { error: 'wrong or missing admin secret' });
      json(res, 200, { ok: true, stopping: true, version, build, pid: process.pid });
      return stop(0, 'asked to stop by this computer, for an update');
    }
    const me = authed(req);
    if (!ok && !(me && me.role === 'host')) return json(res, 403, { error: 'only the host on this computer' });
    if (process.env.TRIBE_SUPERVISED !== '1') return json(res, 409, { error: 'not supervised', restart: false });
    json(res, 200, { ok: true, restarting: true });
    return stop(75, 'restarting to finish an update');
  }
  return { route, writePid, secret, secretFile, pidFile, home };
};
