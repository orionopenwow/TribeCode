// The Marketplace (v0.27 company): one curated catalog of real things a tribe can add (templates/marketplace.json):
// sidebar widgets, company templates, role playbooks, Claude Code skills, open-source libraries / tools / studios, site
// starters, MCP connectors, asset packs, legal templates and academy tracks. Offline, no central server.
//
//   GET  /api/market?q=&kind=&tag=&for=&seat=&sort=hot|rising|new|top&offset=&limit=   24 per page (max 60)
//   GET  /api/market/facets?q=&kind=&tag=&for=&seat=      counts per kind / for / seat / tag (for the Filters popover)
//   GET  /api/market/items/:id                            one item, with this tribe's usage
//   POST /api/market/:id/use { project, only?: 'open' }   records usage, then does the item's action:
//        widget -> the project's sidebar (server/widgets.js) · skill/library/tool/studio/connector -> the Toolbox
//        (server/shelf.js; skills copy into .claude/skills) · playbook -> a checklist doc · site-template -> remix
//        (client) · company-template -> Company mode (client; { needs: 'company' } until it exists) · asset-pack,
//        legal, academy -> opened by the client. Agents never install directly: they get an approval for a human.
//
// Ranking is honest about where it comes from: usage is THIS tribe's (installs, opens, uses), kept in
// .tribe/market/usage.json. Hot = this week's tribe usage blended with the curated score; Rising = usage beating last
// week, or recently added items with a high curated score; New = date added to the catalog; Top = curated score plus
// all-time tribe usage. "score" is TribeCode's own curated score, never a rating or download count.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SORTS = ['hot', 'rising', 'new', 'top'];
const KIND = {
  widget: { label: 'Widgets', emoji: '🧩' }, 'company-template': { label: 'Company templates', emoji: '🏢' }, playbook: { label: 'Playbooks', emoji: '📋' },
  skill: { label: 'Skills', emoji: '🧠' }, library: { label: 'Libraries', emoji: '📚' }, tool: { label: 'Tools', emoji: '🛠️' }, studio: { label: 'Studios', emoji: '🎛️' },
  'site-template': { label: 'Starters', emoji: '🌐' }, connector: { label: 'Connectors', emoji: '🔌' }, 'asset-pack': { label: 'Asset packs', emoji: '🎨' },
  legal: { label: 'Legal', emoji: '⚖️' }, academy: { label: 'Academy', emoji: '🎓' },
};
const FOR = { game: 'Games', site: 'Sites', app: 'Apps', business: 'Businesses', any: 'Anything' };
const SEATS = ['ceo', 'cto', 'design', 'growth', 'sales', 'support', 'ops', 'finance', 'legal'];
const INSTALL = new Set(['widget', 'skill', 'library', 'tool', 'studio', 'connector', 'playbook', 'site-template', 'company-template']);   // agents ask first
const TOOLBOX = new Set(['skill', 'library', 'tool', 'studio', 'connector']);
const DAY = 864e5;

module.exports = function market({ P, store, root, approvals, widgets, shelf, docs, postChat, nameOf = id => id, getMembers = () => [], str = (v, n) => String(v == null ? '' : v).slice(0, n), now = () => Date.now(), tick = true }) {
  const catalog = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'templates', 'marketplace.json'), 'utf8')).items || []; } catch { return []; } })();
  const byId = new Map(catalog.map((it, i) => [it.id, Object.assign(it, { _i: i })]));
  const err = (status, m) => Object.assign(new Error(m), { status });
  const UFILE = '.tribe/market/usage.json', PFILE = '.tribe/market/pending.json';
  let usage = store.readJSON(UFILE, {}); if (!usage || typeof usage !== 'object' || !usage.items) usage = { items: {} };
  let pending = store.readJSON(PFILE, []); if (!Array.isArray(pending)) pending = [];
  const ensureDir = () => { try { fs.mkdirSync(path.dirname(store.p(UFILE)), { recursive: true }); } catch {} };
  const saveUsage = () => { ensureDir(); store.writeJSON(UFILE, usage); }, savePending = () => { ensureDir(); store.writeJSON(PFILE, pending.slice(-200)); };
  const dayKey = t => new Date(t).toISOString().slice(0, 10);

  // ---------- usage (this tribe only) ----------
  function record(id, how) {
    const u = usage.items[id] || (usage.items[id] = { d: {}, all: 0 });
    const k = dayKey(now());
    if ((u.d[k] || 0) >= 500) return;   // a runaway loop shouldn't own the charts
    u.d[k] = (u.d[k] || 0) + 1; u.all = (u.all || 0) + 1; u.last = new Date(now()).toISOString(); u.how = str(how, 20);
    for (const d of Object.keys(u.d)) if ((now() - Date.parse(d + 'T00:00:00Z')) / DAY > 60) delete u.d[d];
    saveUsage();
  }
  function counts(id) {
    const u = usage.items[id]; if (!u) return { week: 0, prev: 0, all: 0 };
    let week = 0, prev = 0;
    for (const [d, n] of Object.entries(u.d || {})) { const age = (now() - Date.parse(d + 'T00:00:00Z')) / DAY; if (age < 7) week += n; else if (age < 14) prev += n; }
    return { week, prev, all: u.all || 0 };
  }
  const ageDays = it => Math.max(0, (now() - Date.parse((it.added || '2026-11-01') + 'T00:00:00Z')) / DAY);
  const RANK = {
    hot: (it, c) => 0.35 * it.score + 30 * Math.log(1 + c.week) + (it.featured ? 8 : 0),
    rising: (it, c) => (c.week > c.prev ? 45 + 15 * Math.log2(1 + c.week - c.prev) : 0) + (ageDays(it) <= 30 ? it.score * 0.5 * (1 - ageDays(it) / 30) : 0),
    top: (it, c) => it.score + 8 * Math.log(1 + c.all),
  };
  function sortList(list, sort) {
    if (sort === 'new') return list.sort((a, b) => String(b.added).localeCompare(String(a.added)) || b._i - a._i);   // newest date, then latest added to the catalog
    const f = RANK[sort] || RANK.hot, s = new Map(list.map(it => [it.id, f(it, counts(it.id))]));
    return list.sort((a, b) => s.get(b.id) - s.get(a.id) || b.score - a.score || (sort === 'rising' ? String(b.added).localeCompare(String(a.added)) : 0) || a.title.localeCompare(b.title));
  }

  // ---------- filters ----------
  const listOf = v => String(v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).slice(0, 12);
  function parse(sp) {
    return { q: str(sp.get('q'), 120).toLowerCase().trim(), kind: listOf(sp.get('kind')), tag: listOf(sp.get('tag')), for: listOf(sp.get('for')), seat: listOf(sp.get('seat')) };
  }
  const hay = it => (it._hay || (it._hay = `${it.title} ${it.summary} ${(it.tags || []).join(' ')} ${it.kind} ${it.repo || ''} ${it.seat || ''}`.toLowerCase()));
  function match(it, f, skip) {
    if (f.q && !f.q.split(/\s+/).every(w => hay(it).includes(w))) return false;
    if (skip !== 'kind' && f.kind.length && !f.kind.includes(it.kind)) return false;
    if (skip !== 'tag' && f.tag.length && !f.tag.every(t => (it.tags || []).includes(t))) return false;
    if (skip !== 'for' && f.for.length && !(it.for || []).some(x => f.for.includes(x) || x === 'any')) return false;
    if (skip !== 'seat' && f.seat.length && !f.seat.includes(it.seat)) return false;
    return true;
  }
  function view(it) {
    const c = counts(it.id), o = {};
    for (const [k, v] of Object.entries(it)) if (k[0] !== '_') o[k] = v;
    return { ...o, kindLabel: (KIND[it.kind] || {}).label || it.kind, uses: { week: c.week, lastWeek: c.prev, all: c.all } };
  }
  function search(sp) {
    const f = parse(sp), sort = SORTS.includes(sp.get('sort')) ? sp.get('sort') : 'hot';
    const offset = Math.max(0, Math.min(10000, parseInt(sp.get('offset'), 10) || 0)), limit = Math.max(1, Math.min(60, parseInt(sp.get('limit'), 10) || 24));
    const all = sortList(catalog.filter(it => match(it, f)), sort);
    const active = Object.values(usage.items).reduce((n, u) => n + Object.entries(u.d || {}).filter(([d]) => (now() - Date.parse(d + 'T00:00:00Z')) / DAY < 7).reduce((a, [, x]) => a + x, 0), 0);
    return { items: all.slice(offset, offset + limit).map(view), total: all.length, offset, limit, sort, catalog: catalog.length, tribeUsesThisWeek: active,
      note: sort === 'hot' ? (active ? 'Hot in your tribe: what your tribe used this week, plus TribeCode’s picks' : 'Nothing used in your tribe this week yet, so these are TribeCode’s picks')
        : sort === 'rising' ? 'Rising in your tribe: used more than last week, or new and well rated by TribeCode'
          : sort === 'new' ? 'Newest in the catalog' : 'Top: TribeCode’s curated score plus your tribe’s all-time use' };
  }
  function facets(sp) {
    const f = parse(sp), out = { kind: {}, for: {}, seat: {}, tag: {} };
    for (const it of catalog) {
      if (match(it, f, 'kind')) out.kind[it.kind] = (out.kind[it.kind] || 0) + 1;
      if (match(it, f, 'for')) for (const x of it.for || []) out.for[x] = (out.for[x] || 0) + 1;
      if (match(it, f, 'seat') && it.seat) out.seat[it.seat] = (out.seat[it.seat] || 0) + 1;
      if (match(it, f, 'tag')) for (const t of it.tags || []) out.tag[t] = (out.tag[t] || 0) + 1;
    }
    const total = catalog.filter(it => match(it, f)).length;
    return {
      total, catalog: catalog.length,
      kind: Object.keys(KIND).filter(k => out.kind[k]).map(k => ({ id: k, label: KIND[k].label, emoji: KIND[k].emoji, n: out.kind[k] })),
      for: Object.keys(FOR).filter(k => out.for[k]).map(k => ({ id: k, label: FOR[k], n: out.for[k] })),
      seat: SEATS.filter(k => out.seat[k]).map(k => ({ id: k, label: k === 'cto' ? 'CTO / Build' : k === 'ceo' ? 'CEO' : k[0].toUpperCase() + k.slice(1), n: out.seat[k] })),
      tag: Object.entries(out.tag).filter(([t]) => !['link', 'skill', 'open-source', 'mcp', 'claude-code'].includes(t)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([id, n]) => ({ id, n })),
    };
  }

  // ---------- actions ----------
  const human = me => me && me.role !== 'agent' && me.role !== 'spectator';
  const projectFor = (pid, me) => { const id = str(pid, 80) || P.current() || P.defaultId(); const p = P.get(id); if (!p || !P.canSee(me, id)) throw err(404, 'project not found'); return id; };
  const shelfItem = it => ({ id: it.id, kind: it.kind === 'connector' ? 'mcp' : it.kind, title: it.title, summary: it.summary, license: it.license || 'see repo', repo: it.repo, path: it.path, ref: it.ref || 'main', url: it.url, install: it.install });
  const exists = rel => { try { return fs.existsSync(path.join(root, rel)); } catch { return false; } };
  async function perform(it, pid, me) {
    if (it.kind === 'widget') {
      const r = widgets.addOne(pid, it.widget, me);
      return { done: 'widget', already: !!r.already, message: r.already ? `${it.title} is already in the sidebar` : `${it.title} added to the sidebar` };
    }
    if (TOOLBOX.has(it.kind)) {
      if (!it.repo && !it.url) throw err(400, 'nothing to add');
      const r = await shelf.add(it.shelf || it.id, pid, me, it.shelf ? undefined : shelfItem(it));
      return { done: 'toolbox', where: r.where || null, url: it.url || (it.repo ? `https://github.com/${it.repo}` : null), message: r.where ? `${it.title} copied to ${r.where}` : `${it.title} added to the Toolbox` };
    }
    if (it.kind === 'playbook') {
      const name = `Playbook: ${it.title}`;
      const body = `# ${it.title}\n\n${it.summary}\n\n${(it.steps || []).map(s => `- [ ] ${s}`).join('\n')}\n\n_From the TribeCode Marketplace. A starting checklist: change it to fit your crew._\n`;
      let slug = null;
      P.inProject(pid, () => {
        const d = docs.find(name);   // already there: keep the crew's edits
        slug = d ? d.slug : ((docs.upsert({ name, body, by: me.id }) || {}).doc || {}).slug || null;
        postChat('general', 'tribecode', `📋 ${nameOf(me.id)} added the **${it.title}** playbook${it.seat ? ` for the ${it.seat.toUpperCase() === 'CTO' ? 'Build' : it.seat} seat` : ''}`);
      });
      return { done: 'doc', doc: slug, name, message: `${it.title} saved as a doc` };
    }
    if (it.kind === 'site-template') return { client: 'remix', repo: it.repo || null, remix: (it.tags || []).includes('remix'), url: it.url || (it.repo ? `https://github.com/${it.repo}` : null) };
    if (it.kind === 'company-template') return exists('server/company.js') ? { client: 'company', template: it.ref } : { needs: 'company', template: it.ref, message: 'Company mode isn’t on this tribe’s TribeCode yet' };
    if (it.kind === 'asset-pack') return it.url ? { client: 'open', url: it.url } : { client: 'assets', kind: it.assetKind || '', ref: it.ref };
    if (it.kind === 'legal') return exists('templates/legal') ? { client: 'legal', ref: it.ref } : { needs: 'legal', ref: it.ref, message: 'Legal templates aren’t on this tribe’s TribeCode yet' };
    if (it.kind === 'academy') return { client: 'academy', ref: it.ref };
    return { client: 'open', url: it.url || null };
  }
  async function use(id, body, me) {
    const it = byId.get(str(id, 80)); if (!it) throw err(404, 'not in the marketplace');
    if (!me || me.role === 'spectator') throw err(403, 'read-only');
    if (body && body.only === 'open') { record(it.id, 'open'); return { ok: true, recorded: true }; }
    const pid = projectFor(body && body.project, me);
    if (me.role === 'agent' && INSTALL.has(it.kind)) {   // a human decides first (server/approvals.js)
      const ap = approvals.create({ title: `Add “${it.title}” from the Marketplace`, risk: it.kind === 'widget' || it.kind === 'playbook' ? 'low' : 'medium', kind: 'market-use',
        details: `${(KIND[it.kind] || {}).label || it.kind}: ${it.summary}${it.repo ? ` · https://github.com/${it.repo}` : it.url ? ` · ${it.url}` : ''}${it.license ? ` · ${it.license}` : ''} · project ${(P.get(pid) || {}).name || pid}` }, me);
      pending.push({ approval: ap.id, id: it.id, project: pid, by: me.id, at: new Date(now()).toISOString() }); savePending();
      setImmediate(sweep);
      return { pending: true, approval: ap.id, status: ap.status, askedOf: ap.toNames, message: `Asked ${ap.toNames.join(', ') || 'a human'} to approve` };
    }
    const r = await perform(it, pid, me);
    if (!r.needs) record(it.id, it.kind);
    return { ok: true, item: view(it), ...r };
  }
  // Settle agents' requests once a human decided (inbox, phone button, anywhere).
  let sweeping = false;
  async function sweep() {
    if (sweeping || !pending.length) return; sweeping = true;
    try {
      const keep = [];
      for (const p of pending) {
        const ap = approvals.get(p.approval);
        if (!ap || ['denied', 'closed'].includes(ap.status)) continue;
        if (ap.status !== 'approved') { keep.push(p); continue; }
        const it = byId.get(p.id), who = getMembers().find(m => m.id === ap.decidedBy) || getMembers().find(m => m.role === 'host');
        if (!it || !who) continue;
        try { const r = await perform(it, p.project, who); if (!r.needs) record(it.id, it.kind); postChat('general', 'tribecode', `🛍️ ${nameOf(p.by)}’s request went through: **${it.title}** from the Marketplace`); }
        catch (e) { postChat('general', 'tribecode', `🛍️ Couldn’t add **${it.title}** for ${nameOf(p.by)}: ${e.message}`); }
      }
      pending = keep; savePending();
    } finally { sweeping = false; }
  }
  if (tick) { const t = setInterval(() => { sweep().catch(() => {}); }, 3000); if (t.unref) t.unref(); }

  async function route(req, res, { m, b, c, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    try {
      sweep().catch(() => {});
      if (m === 'GET' && !b) return send(res, 200, search(url.searchParams));
      if (m === 'GET' && b === 'facets') return send(res, 200, facets(url.searchParams));
      if (m === 'GET' && b === 'items' && c) { const it = byId.get(str(c, 80)); return it ? send(res, 200, { item: view(it) }) : fail(res, 404, 'not in the marketplace'); }
      if (m === 'POST' && b && c === 'use') return send(res, 200, await use(b, await readBody(req, 8 * 1024), me));
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }

  // ---------- Claude Code tools ----------
  const text = (t, isError) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
  const mcpTools = {
    market_search: {
      description: 'Search the TribeCode Marketplace: a curated, verified catalog of sidebar widgets (links to real tools), company templates, role playbooks, Claude Code skills, open-source libraries/tools/studios, site starters, MCP connectors, asset packs, legal templates and academy tracks. sort: hot (this tribe\'s use this week), rising, new, top. Returns ids for market_use.',
      inputSchema: { type: 'object', properties: { q: { type: 'string' }, kind: { type: 'string', enum: Object.keys(KIND) }, sort: { type: 'string', enum: SORTS } }, additionalProperties: false },
      run: async ({ q, kind, sort } = {}) => {
        const sp = new URLSearchParams(); if (q) sp.set('q', q); if (kind) sp.set('kind', kind); if (sort) sp.set('sort', sort); sp.set('limit', '20');
        const r = search(sp);
        return text(r.items.length ? `${r.total} match (showing ${r.items.length}). ${r.note}.\n` + r.items.map(it => `${it.id} · ${it.kind} · ${it.title} — ${it.summary}${it.license ? ` (${it.license})` : ''}${it.repo ? ` github.com/${it.repo}` : it.url ? ` ${it.url}` : ''}`).join('\n') : 'Nothing matches. Try fewer words or another kind.');
      },
    },
    market_use: {
      description: 'Use a Marketplace item in a project: add a widget to the sidebar, a skill/library/tool/connector to the Toolbox (skills copy into .claude/skills), or a playbook as a doc. Agents never install directly: this creates an approval for a human, and it happens once they approve.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, project: { type: 'string' } }, required: ['id'], additionalProperties: false },
      run: async ({ id, project }, me) => {
        try {
          const r = await use(id, { project }, me);
          if (r.pending) return text(`Waiting for approval (${r.approval}): ${r.message}. It happens by itself once they approve.`);
          if (r.needs) return text(r.message || `Needs ${r.needs} first.`);
          if (r.client) return text(`This one opens in the app${r.url ? `: ${r.url}` : ''}. Ask a teammate to open it from the Marketplace.`);
          return text(r.message || 'Done.');
        } catch (e) { return text(`Not used: ${e.message}`, true); }
      },
    },
  };

  return { route, search, facets, use, record, counts, sweep, mcpTools, catalog: () => catalog, KIND };
};
