// "Trending on GitHub": the daily feed of viral, permissively licensed open source repos for building apps, games and
// sites (templates/trending.json, checked by scripts/dev/trending-check.js). The bundled copy ships with each release;
// the server (it runs on the host's machine) also refreshes it once a day from the main branch on GitHub, so a tribe
// sees new repos without updating TribeCode. The download is cached in .tribe/trending.json; offline, or when the
// download is bad, the newest good copy wins (cache or bundled). Nothing runs in tests (TRIBE_TEST) or with
// TRIBE_NO_DOWNLOAD set. The Marketplace serves it at GET /api/market/trending (server/market.js).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { check } = require('./trendcheck');

const URL_FEED = 'https://raw.githubusercontent.com/orionopenwow/TribeCode/main/templates/trending.json';
const DAY = 864e5, FILE = '.tribe/trending.json';

module.exports = function trending({ store, root, env = process.env, fetchFn = (...a) => fetch(...a), now = () => Date.now(), auto = true }) {
  const read = f => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return check(j).length ? null : j; } catch { return null; } };
  const bundled = read(path.join(root, 'templates', 'trending.json')) || { updated: '', about: '', items: [] };
  const cached = (() => { try { const j = store.readJSON(FILE, null); return j && j.feed && !check(j.feed).length ? j : null; } catch { return null; } })();
  let feed = cached && String(cached.feed.updated) > String(bundled.updated) ? cached.feed : bundled;
  let source = feed === bundled ? 'bundled' : 'downloaded', fetchedAt = cached ? cached.at || 0 : 0, lastError = '';
  const off = () => !!(env.TRIBE_TEST || env.TRIBE_NO_DOWNLOAD);

  async function refresh(force) {
    if (off()) return { skipped: true };
    if (!force && now() - fetchedAt < DAY) return { fresh: true };
    fetchedAt = now();
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
      const r = await fetchFn(URL_FEED, { signal: ctl.signal, headers: { accept: 'application/json' } }).finally(() => clearTimeout(t));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text(); if (text.length > 2e6) throw new Error('too big');
      const j = JSON.parse(text), errs = check(j);
      if (errs.length) throw new Error(`failed the check: ${errs[0]}`);
      try { fs.mkdirSync(path.dirname(store.p(FILE)), { recursive: true }); } catch {}
      store.writeJSON(FILE, { at: fetchedAt, feed: j });
      if (String(j.updated) >= String(feed.updated)) { feed = j; source = 'downloaded'; }
      lastError = '';
      return { ok: true, updated: feed.updated };
    } catch (e) { lastError = String(e.message || e).slice(0, 200); return { ok: false, error: lastError }; }
  }
  if (auto && !off()) {
    setTimeout(() => refresh().catch(() => {}), 20000).unref?.();
    setInterval(() => refresh().catch(() => {}), 6 * 3600e3).unref?.();   // checks every 6 hours, downloads at most once a day
  }
  return { get: () => ({ updated: feed.updated, about: feed.about, source, items: feed.items, error: lastError || undefined }), refresh };
};
