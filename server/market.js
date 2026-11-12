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
const { toMarket } = require('./trendcheck');
const fs = require('node:fs');
const path = require('node:path');

const SORTS = ['hot', 'rising', 'new', 'top', 'az'];
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

module.exports = function market({ P, store, root, approvals, widgets, shelf, docs, inspo = null, postChat, nameOf = id => id, getMembers = () => [], str = (v, n) => String(v == null ? '' : v).slice(0, n), now = () => Date.now(), tick = true, trending = null }) {
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
    if (sort === 'az') return list.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
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
  function view(it, pid) {
    const c = counts(it.id), o = {};
    for (const [k, v] of Object.entries(it)) if (k[0] !== '_') o[k] = v;
    const t = it.id.startsWith('tr-') && trending ? (trending.get().items || []).find(x => x.id === it.id) : null;   // trending extras for the detail sheet
    if (t) Object.assign(o, { stars: t.stars == null ? null : t.stars, why: t.why || '', seenOn: Array.isArray(t.seenOn) ? t.seenOn : [] });
    return { ...o, kindLabel: (KIND[it.kind] || {}).label || it.kind, uses: { week: c.week, lastWeek: c.prev, all: c.all }, installed: isIn(pid, it.id), installedAt: isIn(pid, it.id) ? installed[pid][it.id].at : undefined };
  }
  function search(sp) {
    const f = parse(sp), sort = SORTS.includes(sp.get('sort')) ? sp.get('sort') : 'hot';
    const offset = Math.max(0, Math.min(10000, parseInt(sp.get('offset'), 10) || 0)), limit = Math.max(1, Math.min(60, parseInt(sp.get('limit'), 10) || 24));
    const pid = str(sp.get('project'), 80) || P.current() || '';
    const onlyIn = sp.get('installed') === '1';
    const all = sortList(catalog.filter(it => match(it, f) && (!onlyIn || isIn(pid, it.id))), sort);
    const active = Object.values(usage.items).reduce((n, u) => n + Object.entries(u.d || {}).filter(([d]) => (now() - Date.parse(d + 'T00:00:00Z')) / DAY < 7).reduce((a, [, x]) => a + x, 0), 0);
    return { items: all.slice(offset, offset + limit).map(it => view(it, pid)), installedCount: pid && installed[pid] ? Object.keys(installed[pid]).length : 0, total: all.length, offset, limit, sort, catalog: catalog.length, tribeUsesThisWeek: active,
      note: sort === 'hot' ? (active ? 'Hot in your tribe: what your tribe used this week, plus TribeCode’s picks' : 'Nothing used in your tribe this week yet, so these are TribeCode’s picks')
        : sort === 'rising' ? 'Rising in your tribe: used more than last week, or new and well rated by TribeCode'
          : sort === 'new' ? 'Newest in the catalog' : sort === 'az' ? 'A to Z' : 'Top: TribeCode’s curated score plus your tribe’s all-time use' };
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
  // feat/market-v2: every Add leaves an undo record (.tribe/market/installed.json, per project), so Remove takes back
  // exactly what Add did: the sidebar widget, the Toolbox line, the copied skill folder, the .mcp.json entry, the doc
  // (only while nobody edited it) or the inspiration-board card.
  const IFILE = '.tribe/market/installed.json';
  let installed = store.readJSON(IFILE, {}); if (!installed || typeof installed !== 'object' || Array.isArray(installed)) installed = {};
  const saveInst = () => { ensureDir(); store.writeJSON(IFILE, installed); };
  const isIn = (pid, id) => !!(pid && installed[pid] && installed[pid][id]);
  const readT = rel => { try { return JSON.parse(fs.readFileSync(path.join(root, 'templates', rel), 'utf8')); } catch { return null; } };
  const sourceOf = it => it.source || (it.repo ? `https://github.com/${it.repo}` : it.url) || '';
  function addDoc(pid, me, name, body) {
    let r = null;
    P.inProject(pid, () => {
      const d = docs.find(name);
      if (d) r = { slug: d.slug, created: false };
      else { const x = ((docs.upsert({ name, body, by: me.id }) || {}).doc) || {}; r = { slug: x.slug, created: true, version: x.version }; }
    });
    return r;
  }
  const credit = it => `\n\n---\n_From the TribeCode Marketplace · ${it.license || ''}${sourceOf(it) ? ` · ${sourceOf(it)}` : ''}_\n`;
  function docFor(it) {
    if (it.kind === 'playbook') return [`Playbook: ${it.title}`, `# ${it.title}\n\n${it.summary}\n\n${(it.steps || []).map(s => `- [ ] ${s}`).join('\n')}\n\n_A starting checklist: change it to fit your crew._` + credit(it)];
    if (it.kind === 'legal') {
      const t = readT(`legal/${String(it.ref || '').replace(/[^a-z0-9-]/gi, '')}.json`); if (!t) return null;
      const fields = (t.fields || []).map(f => `- **${f.label}**: {{${f.key}}}`).join('\n');
      return [`Legal: ${t.title || it.title}`, `# ${t.title || it.title}\n\n> A starting point, not legal advice. Check local law or ask a professional.\n\n${t.blurb || it.summary}\n\n## Fill in\n\n${fields}\n\n${(t.clauses || []).map(c => `## ${c.heading}\n\n${c.text}`).join('\n\n')}\n\n_${t.credit || ''}_` + credit(it)];
    }
    if (it.kind === 'academy') {
      const t = ((readT('academy.json') || {}).tracks || []).find(x => x.id === it.ref); if (!t) return null;
      return [`Academy: ${t.title}`, `# ${t.title}\n\n${t.blurb || ''}\n\n## Lessons\n\n${(t.lessons || []).map(l => `- [ ] **${l.title}** (${l.minutes || 5} min)`).join('\n')}\n\n${(t.links || []).length ? `## Further reading\n\n${t.links.map(l => `- [${l.title}](${l.url}) · ${l.by || ''}`).join('\n')}` : ''}\n\n_Open the Academy for the full lessons._` + credit(it)];
    }
    if (it.kind === 'company-template') {
      const t = ((readT('companies.json') || {}).templates || []).find(x => x.id === it.ref); if (!t) return null;
      return [`Company plan: ${t.name || it.title}`, `# ${t.name || it.title}\n\n${t.mission || t.blurb || ''}\n\n## Seats\n\n${(t.seats || []).map(x => `- **${x.title}**: ${(x.charter || {}).goal || ''}`).join('\n')}\n\n## Goals\n\n${(t.goals || []).map(g => `- ${g.title}`).join('\n')}\n\n## First tasks\n\n${(t.tasks || []).map(x => `- [ ] ${x.title}${x.seat ? ` (${x.seat})` : ''}`).join('\n')}\n\n_Turn on Company mode with this template from the Marketplace to get the seats, goals and tasks for real._` + credit(it)];
    }
    if (it.kind === 'site-template') {
      const dir = String(it.ref || it.title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return [`Starter: ${it.title}`, `# Starter: ${it.title}\n\n${it.summary}\n\n## Start from it\n\n\`\`\`\ngit clone --depth 1 ${it.repo ? `https://github.com/${it.repo}` : sourceOf(it)} ${dir}\n\`\`\`\n\n${it.url ? `See it running: ${it.url}\n\n` : ''}Keep the LICENSE file and credit the authors (${it.author || 'see the repo'}).` + credit(it)];
    }
    return null;
  }
  const mcpJson = it => it.mcp && it.mcp.config ? `claude mcp add-json ${it.mcp.name} '${JSON.stringify(it.mcp.config)}'` : '';
  async function perform(it, pid, me) {
    const fx = [];
    if (it.kind === 'widget') {
      const r = widgets.addOne(pid, it.widget, me);
      if (!r.already) fx.push({ t: 'widget', w: it.widget });
      return { done: 'widget', fx, already: !!r.already, message: r.already ? `${it.title} was already in the sidebar` : `${it.title} added to the sidebar` };
    }
    if (TOOLBOX.has(it.kind)) {
      if (!it.repo && !it.url) throw err(400, 'nothing to add');
      const p = P.get(pid), dir = shelf.repoDir(p);
      let where = null, note = '';
      if (it.kind === 'skill' && it.path && it.repo) {
        if (!dir) note = ' Give the project a code folder to copy the skill files in too.';
        else {
          const rel = `.claude/skills/${path.basename(it.path)}`, had = fs.existsSync(path.join(dir, rel));
          try { where = await shelf.installSkill(it, dir); if (!had) fx.push({ t: 'dir', rel }); }
          catch (e) { note = ` Couldn’t copy the files just now (${e.message}).`; }
        }
      }
      if (it.kind === 'connector' && it.mcp && it.mcp.config && dir) {
        const f = path.join(dir, '.mcp.json'); let j = {};
        try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
        if (!j || typeof j !== 'object') j = {};
        j.mcpServers = j.mcpServers || {};
        if (!j.mcpServers[it.mcp.name]) { j.mcpServers[it.mcp.name] = it.mcp.config; fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'); fx.push({ t: 'mcp', name: it.mcp.name }); where = '.mcp.json'; }
      }
      const extra = { id: it.id, kind: it.kind === 'connector' ? 'mcp' : it.kind, title: it.title, summary: it.summary, license: it.license || 'see repo', repo: it.repo, url: it.url, install: it.install || mcpJson(it) || undefined };
      shelf.toolboxAdd(pid, extra, me); fx.push({ t: 'toolbox', id: it.id });
      P.inProject(pid, () => postChat('general', 'tribecode', `🧰 ${nameOf(me.id)} added **${it.title}** from the Marketplace${where ? ` (${where})` : ''}`));
      const msg = it.kind === 'skill' ? (where ? `${it.title} copied to ${where}` : `${it.title} added to the Toolbox.${note}`)
        : it.kind === 'connector' ? (where ? `${it.title} added to .mcp.json and the Toolbox` : `${it.title} added to the Toolbox${it.mcp ? ' with its MCP setup' : ''}${dir ? '' : '. Give the project a code folder to write .mcp.json'}`)
          : `${it.title} added to the Toolbox`;
      return { done: 'toolbox', fx, where, url: sourceOf(it), message: msg };
    }
    const d = docFor(it);
    if (d) {
      const r = addDoc(pid, me, d[0], d[1]);
      if (r.created) fx.push({ t: 'doc', slug: r.slug, version: r.version });
      if (it.kind === 'playbook') P.inProject(pid, () => postChat('general', 'tribecode', `📋 ${nameOf(me.id)} added the **${it.title}** playbook${it.seat ? ` for the ${it.seat.toUpperCase() === 'CTO' ? 'Build' : it.seat} seat` : ''}`));
      return { done: 'doc', fx, doc: r.slug, name: d[0], message: r.created ? `${d[0]} saved in Files` : `${d[0]} was already in Files` };
    }
    if (it.kind === 'asset-pack') {
      if (!inspo) throw err(501, 'the inspiration board isn’t on this tribe’s TribeCode yet');
      let host = ''; try { host = new URL(it.url || sourceOf(it)).hostname.replace(/^www\./, ''); } catch {}
      const card = inspo.add(pid, me, { kind: 'link', url: it.url || sourceOf(it), site: host, title: it.title, note: `${it.summary} (${it.license})`, images: [], colors: [], fonts: [], market: it.id });
      fx.push({ t: 'inspo', id: card.id });
      return { done: 'inspo', fx, message: `${it.title} pinned to the inspiration board` };
    }
    return { client: 'open', fx, url: it.url || sourceOf(it) || null };
  }
  function undo(pid, rec, me) {
    const kept = [];
    const dir = shelf.repoDir(P.get(pid));
    for (const f of (rec.fx || []).slice().reverse()) {
      try {
        if (f.t === 'widget') widgets.removeOne(pid, f.w, me);
        else if (f.t === 'toolbox') shelf.toolboxRemove(pid, f.id, me);
        else if (f.t === 'dir' && dir && /^\.claude\/skills\/[^/]+$/.test(f.rel)) fs.rmSync(path.join(dir, f.rel), { recursive: true, force: true });
        else if (f.t === 'mcp' && dir) {
          const file = path.join(dir, '.mcp.json'); const j = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (j.mcpServers && j.mcpServers[f.name]) { delete j.mcpServers[f.name]; if (!Object.keys(j.mcpServers).length && Object.keys(j).length === 1) fs.unlinkSync(file); else fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n'); }
        } else if (f.t === 'doc') P.inProject(pid, () => { const d = docs.read ? docs.read(f.slug) : null; if (d && f.version != null && Number(d.version) !== Number(f.version)) kept.push(d.title || f.slug); else docs.remove(f.slug); });
        else if (f.t === 'inspo' && inspo) inspo.drop(pid, f.id);
      } catch {}
    }
    return kept;
  }
  async function remove(id, body, me) {
    const it = byId.get(str(id, 80)); if (!it) throw err(404, 'not in the marketplace');
    if (!human(me)) throw err(403, me && me.role === 'agent' ? 'ask a human to remove it' : 'read-only');
    const pid = projectFor(body && body.project, me);
    const rec = installed[pid] && installed[pid][it.id];
    if (!rec) return { ok: true, removed: false, message: `${it.title} isn’t in this project` };
    const kept = undo(pid, rec, me);
    delete installed[pid][it.id]; if (!Object.keys(installed[pid]).length) delete installed[pid]; saveInst();
    return { ok: true, removed: true, item: view(it, pid), kept, message: kept.length ? `${it.title} removed. Kept ${kept.join(', ')}: it was edited since.` : `${it.title} removed` };
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
    if (isIn(pid, it.id)) return { ok: true, project: pid, item: view(it, pid), installed: true, already: true, message: `${it.title} is already in this project` };
    const r = await perform(it, pid, me);
    if (!r.needs) record(it.id, it.kind);
    if (!r.client && !r.needs) { (installed[pid] = installed[pid] || {})[it.id] = { at: new Date(now()).toISOString(), by: me.id, fx: r.fx || [], message: r.message }; saveInst(); }
    delete r.fx;
    return { ok: true, project: pid, item: view(it, pid), installed: isIn(pid, it.id), ...r };
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
        try { const r = await perform(it, p.project, who); if (!r.needs) record(it.id, it.kind); if (!r.client && !r.needs) { (installed[p.project] = installed[p.project] || {})[it.id] = { at: new Date(now()).toISOString(), by: who.id, fx: r.fx || [], message: r.message }; saveInst(); } postChat('general', 'tribecode', `🛍️ ${nameOf(p.by)}’s request went through: **${it.title}** from the Marketplace`); }
        catch (e) { postChat('general', 'tribecode', `🛍️ Couldn’t add **${it.title}** for ${nameOf(p.by)}: ${e.message}`); }
      }
      pending = keep; savePending();
    } finally { sweeping = false; }
  }
  if (tick) { const t = setInterval(() => { sweep().catch(() => {}); }, 3000); if (t.unref) t.unref(); }

  // "Trending on GitHub" (server/trending.js): the daily feed, shown as Marketplace cards so Add works the same.
  // A repo the daily download added after this release isn't in marketplace.json yet, so it joins the catalog here.
  function trendingView() {
    const f = trending ? trending.get() : { updated: '', items: [], source: 'none' };
    const items = (f.items || []).map(t => {
      let it = byId.get(t.id);
      if (!it) { it = Object.assign(toMarket(t), { _i: catalog.length }); catalog.push(it); byId.set(it.id, it); }
      return view(it);
    });
    return { updated: f.updated, source: f.source, items };
  }

  async function route(req, res, { m, b, c, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    try {
      sweep().catch(() => {});
      if (m === 'GET' && !b) return send(res, 200, search(url.searchParams));
      if (m === 'GET' && b === 'trending') return send(res, 200, trendingView());
      if (m === 'GET' && b === 'facets') return send(res, 200, facets(url.searchParams));
      if (m === 'GET' && b === 'items' && c) { const it = byId.get(str(c, 80)); return it ? send(res, 200, { item: view(it, str(url.searchParams.get('project'), 80) || P.current() || '') }) : fail(res, 404, 'not in the marketplace'); }
      if (m === 'POST' && b && c === 'remove') return send(res, 200, await remove(b, await readBody(req, 8 * 1024), me));
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

  return { route, search, facets, use, remove, record, counts, sweep, mcpTools, catalog: () => catalog, KIND };
};
