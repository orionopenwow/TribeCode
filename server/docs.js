// Shared docs: one Markdown file per page, versioned saves with conflict detection,
// and local-brain TL;DRs written next to each doc as <slug>.summary.md.
'use strict';
const fs = require('node:fs');

module.exports = function docs({ store, slug, str, broadcast, brain, postChat }) {
  const rel = s => `docs/${s}.md`;
  const sumRel = s => `docs/${s}.summary.md`;
  const okSlug = s => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);
  const pending = new Map(); // slug -> timer for debounced summaries

  function read(s) {
    const r = store.readMd(rel(s)); if (!r) return null;
    let summary = ''; try { summary = fs.readFileSync(store.p(sumRel(s)), 'utf8').trim(); } catch {}
    return { slug: s, ...r.meta, body: r.body, summary };
  }
  function list() {
    return store.listMd('docs').map(f => f.replace(/^docs[\\/]/, '').replace(/\.md$/, '')).map(read).filter(Boolean)
      .map(({ body, ...d }) => ({ ...d, words: body.split(/\s+/).filter(Boolean).length }))
      .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  }
  function write(d) {
    const { body = '', summary, words, ...meta } = d;
    store.writeMd(rel(d.slug), meta, body);
    broadcast({ type: 'doc', doc: { slug: d.slug, title: d.title, version: d.version, updated: d.updated, updatedBy: d.updatedBy } });
    scheduleSummary(d.slug);
    return read(d.slug);
  }
  function scheduleSummary(s, delay = 15_000) {
    clearTimeout(pending.get(s));
    pending.set(s, setTimeout(async () => {
      pending.delete(s);
      const d = read(s); if (!d) return;
      try {
        const tldr = await brain.summarize(d.title, d.body);
        if (tldr) { fs.writeFileSync(store.p(sumRel(s)), tldr + '\n'); broadcast({ type: 'doc-summary', slug: s, summary: tldr }); }
      } catch (e) { /* brain off or slow: summaries are best-effort */ }
    }, delay));
  }
  function uniqueSlug(title) {
    const base = slug(title); let s = base, n = 2;
    while (fs.existsSync(store.p(rel(s)))) s = `${base}-${n++}`;
    return s;
  }

  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (m === 'GET' && !b) return send(res, 200, { docs: list() });
    if (b && !okSlug(b)) return fail(res, 400, 'bad doc name');
    if (m === 'GET') { const d = read(b); return d ? send(res, 200, { doc: d }) : fail(res, 404, 'doc not found'); }
    if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');

    if (m === 'POST' && !b) {
      const body = await readBody(req); const title = str(body.title, 120) || 'Untitled';
      const now = new Date().toISOString();
      const d = write({ slug: uniqueSlug(title), title, by: me.id, created: now, updated: now, updatedBy: me.id, version: 1, source: str(body.source, 200) || undefined, body: str(body.body, 400_000) });
      if (body.source) postChat('general', 'tribecode', `${me.name} added **${title}** to Docs`);
      return send(res, 200, { doc: d });
    }
    if (m === 'POST' && b && c === 'summarize') {
      const d = read(b); if (!d) return fail(res, 404, 'doc not found');
      const tldr = await brain.summarize(d.title, d.body).catch(() => null);
      if (!tldr) return fail(res, 503, brain.status().error || 'local brain is off');
      fs.writeFileSync(store.p(sumRel(b)), tldr + '\n'); broadcast({ type: 'doc-summary', slug: b, summary: tldr });
      return send(res, 200, { summary: tldr });
    }
    const d = read(b); if (!d) return fail(res, 404, 'doc not found');
    if (m === 'PUT') {
      const body = await readBody(req, 1024 * 1024);
      if (!body.force && Number(body.baseVersion) !== Number(d.version))
        return send(res, 409, { error: 'conflict', doc: d });
      if (body.title !== undefined) d.title = str(body.title, 120) || d.title;
      if (body.body !== undefined) d.body = typeof body.body === 'string' ? body.body.slice(0, 400_000) : d.body;
      d.version = Number(d.version) + 1; d.updated = new Date().toISOString(); d.updatedBy = me.id;
      return send(res, 200, { doc: write(d) });
    }
    if (m === 'DELETE') {
      store.remove(rel(b)); store.remove(sumRel(b));
      broadcast({ type: 'doc-removed', slug: b });
      return send(res, 200, { ok: true });
    }
    return null;
  }

  // Used by agents (MCP): find by name or title, create or update with optimistic concurrency.
  function find(name) {
    const n = String(name || '').trim(); if (!n) return null;
    if (okSlug(n)) { const d = read(n); if (d) return d; }
    const hit = list().find(d => d.title.toLowerCase() === n.toLowerCase()) || list().find(d => d.slug === slug(n));
    return hit ? read(hit.slug) : null;
  }
  function upsert({ name, body, baseVersion, by }) {
    const d = find(name), now = new Date().toISOString();
    if (!d) return { doc: write({ slug: uniqueSlug(name), title: str(name, 120) || 'Untitled', by, created: now, updated: now, updatedBy: by, version: 1, body: String(body || '').slice(0, 400_000) }) };
    if (baseVersion === undefined || baseVersion === null) return { conflict: `"${d.title}" already exists (version ${d.version}); pass base_version to edit it` };
    if (Number(baseVersion) !== Number(d.version)) return { conflict: `"${d.title}" changed since you read it (now version ${d.version})` };
    d.body = String(body || '').slice(0, 400_000); d.version = Number(d.version) + 1; d.updated = now; d.updatedBy = by;
    return { doc: write(d) };
  }

  return { route, list, read, find, upsert };
};
