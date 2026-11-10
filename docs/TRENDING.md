# Trending on GitHub (daily feed)

The Marketplace's "Trending on GitHub" shelf shows new open source repos that people are talking about and that help
build apps, games and sites. Focus areas: coding agents and agent tools, creating UI and design, video editing,
three.js and 3D games, and app building in general.

## Files

- `templates/trending.json`: the feed. `{ updated, about, items: [{ id, repo, title, emoji, summary, kind, tags, for, license, stars, why, seenOn: [{ site, url, date }], path?, install?, added }] }`.
  - `stars` is the count reported by the linked trend source on its date (or `null`), not a live number.
  - `seenOn` lists public posts and articles where the repo was being talked about (TikTok, Instagram, Reddit, Threads, X, YouTube, Hacker News, Product Hunt, blogs, news, trend lists).
- `server/trendcheck.js`: the validator (schema, permissive licenses only, no duplicates, https links, dates).
- `server/trending.js`: the server keeps the feed fresh. It downloads `https://raw.githubusercontent.com/orionopenwow/TribeCode/main/templates/trending.json` at most once a day, checks it, caches it in `.tribe/trending.json`, and falls back to the newest good copy (cache or bundled) when offline. Nothing downloads under `TRIBE_TEST` or `TRIBE_NO_DOWNLOAD`.
- `GET /api/market/trending`: the feed as Marketplace cards (`server/market.js`). The shelf in `app/ui/market.js` reads it.
- `templates/marketplace.json`: keeps the feed as its `tr-*` block, so search and Filters find these repos too.

## The daily job

1. Find candidates with web search only: public trend lists (Trendshift, GitTrend), articles, and public posts on social sites. No scraping, no logins.
2. For each repo, confirm it exists and read its LICENSE file (for example `git clone --depth 1 --filter=blob:none --no-checkout`, then `git show HEAD:LICENSE`).
3. Keep permissive licenses only: MIT, Apache-2.0, BSD, ISC, MPL-2.0, CC0, Unlicense, Zlib, 0BSD. A dual license like "MIT OR Apache-2.0" is fine. Leave out GPL, AGPL, LGPL, share-alike, source-available (BSL, FSL, custom company licenses) and repos with no license.
4. A `skill` entry needs the folder of its `SKILL.md` in `path`. A skill whose `SKILL.md` sits at the repo root is listed as a `tool` with an `install` line instead.
5. Run `node scripts/dev/trending-check.js --remote --sync`, then commit `templates/trending.json` and `templates/marketplace.json`. Running apps pick it up within a day.
