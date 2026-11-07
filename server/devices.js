// Device links: a private, revocable URL (/m/<key>/) that signs a member in on another device.
// Why: an iPhone Home Screen web app does not share localStorage with Safari, so the token from the
// join page is lost once the app is installed. The installed app's start URL carries the key instead,
// and on launch it trades the key for its own member token (POST /api/device-link/redeem).
// Keys and tokens are stored only as SHA-256 hashes in .tribe/devices.json. Revoking a device
// deletes it, which also invalidates every token it handed out.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KEY_RE = /^[A-Za-z0-9_-]{32,64}$/;
const MAX_TOKENS = 6;          // one per redeem (Safari tab, Home Screen app, reinstall…), oldest dropped
const MAX_DEVICES = 20;        // per member

module.exports = function makeDevices({ store, id, hash, str, getMembers, publicMember, tribe }) {
  let devices = store.readJSON('.tribe/devices.json', []);
  const save = () => store.writeJSON('.tribe/devices.json', devices);
  const memberById = mid => getMembers().find(m => m.id === mid) || null;

  function label(req, given) {
    const ua = String(req.headers['user-agent'] || '');
    const auto = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android phone'
      : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux PC' : 'Device';
    return str(given, 40) || auto;
  }

  function create(member, req, given) {
    const key = id(40);
    const d = { id: 'd-' + id(8), member: member.id, keyHash: hash(key), tokens: [], label: label(req, given),
      created: new Date().toISOString(), lastUsed: null };
    devices.push(d);
    const mine = devices.filter(x => x.member === member.id);
    if (mine.length > MAX_DEVICES) { const drop = new Set(mine.slice(0, mine.length - MAX_DEVICES)); devices = devices.filter(x => !drop.has(x)); }
    save();
    return { key, device: d };
  }

  function redeem(key, req) {
    if (!KEY_RE.test(key || '')) return null;
    const kh = hash(key);
    const d = devices.find(x => x.keyHash === kh);
    const m = d && memberById(d.member);
    if (!m) return null;
    const token = id(32);
    d.tokens = [...d.tokens, hash(token)].slice(-MAX_TOKENS);
    d.lastUsed = new Date().toISOString();
    save();
    return { token, member: m, device: d };
  }

  // Used by the server's authed(): a device token signs in as its member until the device is revoked.
  function memberForToken(th) {
    const d = devices.find(x => x.tokens.includes(th));
    if (!d) return null;
    const m = memberById(d.member);
    if (m) d.seen = Date.now();
    return m;
  }
  const deviceForToken = th => devices.find(x => x.tokens.includes(th)) || null;

  const view = (d, th) => ({ id: d.id, label: d.label, created: d.created, lastUsed: d.lastUsed, redeemed: d.tokens.length > 0, current: !!th && d.tokens.includes(th) });

  // ---- API: returns null when the route isn't ours ----
  async function route(req, res, { a, b, m, me, tokenHash, readBody, send, fail, limited }) {
    if (a === 'device-link' && b === 'redeem' && m === 'POST') {
      if (limited(req, 30)) return fail(res, 429, 'slow down');
      const body = await readBody(req);
      const r = redeem(str(body.key, 80), req);
      if (!r) return fail(res, 404, 'this sign-in link was turned off or does not exist');
      return send(res, 200, { token: r.token, member: publicMember(r.member), tribe, device: view(r.device, hash(r.token)) });
    }
    if (a === 'device-link' && !b && m === 'POST') {
      if (!me) return fail(res, 401, 'not a member of this tribe');
      if (me.role === 'agent') return fail(res, 403, 'agents cannot link devices');
      const body = await readBody(req);
      const { key, device } = create(me, req, body.label);
      return send(res, 200, { key, path: `/m/${key}/`, device: view(device) });
    }
    if (a === 'devices') {
      if (!me) return fail(res, 401, 'not a member of this tribe');
      if (m === 'GET' && !b) return send(res, 200, { devices: devices.filter(d => d.member === me.id).map(d => view(d, tokenHash)).reverse() });
      if (m === 'DELETE' && b) {
        const d = devices.find(x => x.id === b && x.member === me.id);
        if (!d) return fail(res, 404, 'device not found');
        devices = devices.filter(x => x !== d); save();
        return send(res, 200, { ok: true });
      }
    }
    return null;
  }

  // ---- static: the app under /m/<key>/ so "Add to Home Screen" keeps the key in its start URL ----
  // Every relative URL in index.html resolves under /m/<key>/, so the same UI files are served there,
  // plus a per-key manifest whose start_url and scope are /m/<key>/.
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
  function serveApp(req, res, url, UI) {
    const mm = url.pathname.match(/^\/m\/([^/]+)(\/.*)?$/);
    if (!mm) return false;
    const key = mm[1], rest = mm[2];
    if (!KEY_RE.test(key)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return true; }
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' };
    if (!rest) { res.writeHead(302, { Location: `/m/${key}/${url.search}`, ...headers }); res.end(); return true; }
    if (rest === '/manifest.webmanifest') {
      let base = {}; try { base = JSON.parse(fs.readFileSync(path.join(UI, 'manifest.webmanifest'), 'utf8')); } catch {}
      const scope = `/m/${key}/`;
      const body = { ...base, id: scope, start_url: scope, scope, icons: (base.icons || []).map(i => ({ ...i, src: '/' + String(i.src).replace(/^\.?\//, '') })) };
      res.writeHead(200, { 'Content-Type': 'application/manifest+json', ...headers }); res.end(JSON.stringify(body, null, 2)); return true;
    }
    let rel = decodeURIComponent(rest);
    if (rel === '/') rel = '/index.html';
    const file = path.resolve(UI, '.' + rel);
    if (!file.startsWith(UI)) { res.writeHead(403); res.end(); return true; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...headers, 'Cache-Control': rel === '/index.html' ? 'no-store' : 'no-cache' });
      res.end(data);
    });
    return true;
  }

  return { route, serveApp, memberForToken, deviceForToken, create, redeem, list: () => devices };
};
