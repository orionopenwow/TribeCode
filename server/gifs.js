// GIFs for the chat composer (feat/chat2).
// Search uses GIPHY, only when the host adds a GIPHY API key in Settings › Chat. The key lives only on the host:
// .tribe/secrets/gifs.json (0600, skipped by backups), never sent to a browser or logged. Tenor is not offered:
// Google shut the Tenor API down on 30 June 2026.
// Without a key the picker shows "Your GIFs": GIFs already shared in this project's channels, plus pasting a GIF link.
// Results come back as links on GIPHY's media host; the chat shows them through the server's picture proxy
// (server/embeds.js), so friends' browsers don't call GIPHY.
//   GET   /api/gifs/search?q=&offset=   -> { gifs: [{ id, title, url, preview, w, h }], provider: 'giphy' }   (503 without a key)
//   GET   /api/gifs/mine                -> { gifs: [{ url, preview, by, at }] }
//   GET   /api/gifs/settings            -> { provider: 'giphy' | null, hasKey }
//   PATCH /api/gifs/settings { key }    host only ('' removes it)
// GIPHY Search API: GET https://api.giphy.com/v1/gifs/search?api_key=&q=&limit=&offset=&rating=&lang=  (developers.giphy.com/docs/api/endpoint)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SECRET = '.tribe/secrets/gifs.json';
const GIPHY = 'https://api.giphy.com/v1/gifs/search';

module.exports = function gifs({ store, pstore, P, channels, isHost = me => me && me.role === 'host', fetchImpl = (...a) => fetch(...a) }) {
  function readKey() { try { return String(JSON.parse(fs.readFileSync(store.p(SECRET), 'utf8')).giphy || ''); } catch { return ''; } }
  function writeKey(key) {
    const file = store.p(SECRET), dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); try { fs.chmodSync(dir, 0o700); } catch {}
    if (!key) { try { fs.unlinkSync(file); } catch {} return; }
    fs.writeFileSync(file, JSON.stringify({ giphy: key }), { mode: 0o600 }); try { fs.chmodSync(file, 0o600); } catch {}
  }
  const cache = new Map();
  const minute = new Map();
  const tooFast = mid => { const now = Date.now(), h = (minute.get(mid) || []).filter(t => now - t < 60_000); h.push(now); minute.set(mid, h); return h.length > 40; };

  async function search(q, offset) {
    const key = readKey(); if (!key) return null;
    const k = `${q}\u0000${offset}`, hit = cache.get(k); if (hit && Date.now() - hit.at < 600_000) return hit.gifs;
    const u = new URL(GIPHY);
    u.searchParams.set('api_key', key); u.searchParams.set('q', q.slice(0, 50)); u.searchParams.set('limit', '24');
    u.searchParams.set('offset', String(Math.max(0, Math.min(4999, offset | 0)))); u.searchParams.set('rating', 'pg-13'); u.searchParams.set('lang', 'en');
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    let r; try { r = await fetchImpl(u.href, { signal: ctl.signal, headers: { Accept: 'application/json' } }); } finally { clearTimeout(t); }
    if (!r.ok) throw Object.assign(new Error(r.status === 401 || r.status === 403 ? 'GIPHY did not accept the key. The host can check it in Settings › Chat.' : `GIPHY answered ${r.status}`), { status: 502 });
    const j = await r.json();
    const ok = s => typeof s === 'string' && /^https:\/\/media\d*\.giphy\.com\//.test(s);
    const out = (Array.isArray(j.data) ? j.data : []).map(g => {
      const im = g.images || {}, full = (im.downsized_medium || im.original || {}), small = (im.fixed_width || im.fixed_width_downsampled || full);
      return { id: String(g.id || '').slice(0, 40), title: String(g.title || '').slice(0, 100), url: full.url, preview: small.url, w: Number(small.width) || 0, h: Number(small.height) || 0 };
    }).filter(g => ok(g.url) && ok(g.preview)).map(g => ({ ...g, url: g.url.split('?')[0], preview: g.preview.split('?')[0] }));
    cache.set(k, { at: Date.now(), gifs: out }); if (cache.size > 200) cache.delete(cache.keys().next().value);
    return out;
  }

  // GIFs shared in this project's channels (uploaded .gif files and GIF links), newest first, no repeats.
  function mine(me, pid) {
    const chs = channels.listFor(pid).filter(c => !c.archived).map(c => c.id);
    const out = [], seen = new Set();
    for (const ch of chs) {
      const rows = pstore.readJSONL(`chat/${ch}.jsonl`, 1500);
      for (const x of rows) {
        if (x.deleted) continue;
        const media = [x.media, ...(Array.isArray(x.images) ? x.images : [])].filter(Boolean);
        for (const md of media) if (md.mime === 'image/gif' && md.file && !seen.has(md.file)) { seen.add(md.file); out.push({ kind: 'file', ch, file: md.file, by: x.by, at: x.at }); }
        const link = typeof x.text === 'string' && /^https?:\/\/\S+\.gif(\?\S*)?$/i.test(x.text.trim()) ? x.text.trim() : null;
        if (link && !seen.has(link)) { seen.add(link); out.push({ kind: 'link', url: link, by: x.by, at: x.at }); }
      }
    }
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
  }

  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (b === 'settings') {
      if (m === 'GET') return send(res, 200, { provider: readKey() ? 'giphy' : null, hasKey: !!readKey() });
      if (m === 'PATCH') {
        if (!isHost(me)) return fail(res, 403, 'only the host can change this');
        const body = await readBody(req);
        const key = typeof body.key === 'string' ? body.key.trim() : null;
        if (key !== null) { if (key && !/^[A-Za-z0-9_-]{8,128}$/.test(key)) return fail(res, 400, 'that does not look like a GIPHY API key'); writeKey(key); cache.clear(); }
        return send(res, 200, { provider: readKey() ? 'giphy' : null, hasKey: !!readKey() });
      }
      return fail(res, 405, 'GET or PATCH');
    }
    if (m !== 'GET') return fail(res, 405, 'GET only');
    if (b === 'mine') return send(res, 200, { gifs: mine(me, P.current() || P.defaultId()) });
    if (b === 'search') {
      if (!readKey()) return fail(res, 503, 'GIF search is off. The host can add a GIPHY key in Settings › Chat.');
      if (tooFast(me.id)) return fail(res, 429, 'slow down');
      const q = String(url.searchParams.get('q') || '').trim().slice(0, 50);
      if (!q) return send(res, 200, { gifs: [], provider: 'giphy' });
      try { return send(res, 200, { gifs: await search(q, Number(url.searchParams.get('offset')) || 0), provider: 'giphy' }); }
      catch (e) { return fail(res, e.status || 502, e.name === 'AbortError' ? 'GIPHY took too long' : e.message); }
    }
    return fail(res, 404, 'not found');
  }
  return { route, hasKey: () => !!readKey() };
};
