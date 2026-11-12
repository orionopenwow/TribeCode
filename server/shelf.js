// The starter shelf (templates/shelf.json): open-source tools, libraries and Claude Code skills that fit a project's
// type. Tucked into the work: a project's overview shows a few picks for that project (from its template, its bio and
// what its repo already uses); the Workshop shows the whole shelf.
//   GET  /api/shelf[?project=]       { types, picks, items } (items marked added when the repo already has them)
//   POST /api/shelf/:id/add { project }   skill -> copied into <repo>/.claude/skills/<name>/ (from jsDelivr, verified paths,
//                                    allowlisted types, size caps; never run); every item -> a line in the project's
//                                    Toolbox (TOOLBOX.md in the repo + the "Toolbox" doc), and a note in chat.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TYPE_BY_EMOJI = { '🎮': 'game', '🌐': 'site', '📱': 'app', '🛠️': 'tool', '📚': 'notes', '🍺': '3d' };   // 3d, platformer and rpg also come from the name/bio and the repo
const WORDS = { game: /\b(game|platformer|rpg|level|sprite|pixel|arcade|boss)\b/i, site: /\b(site|website|landing|blog|portfolio|page)\b/i, app: /\b(app|mobile|ios|android|desktop)\b/i, tool: /\b(tool|script|cli|bot|automat\w*|api)\b/i, notes: /\b(notes?|research|wiki|study|docs?)\b/i, platformer: /\b(platformer|jump|run and jump)\b/i, '3d': /\b(3d|three\.?js|first[- ]person|fps|tavern)\b/i, rpg: /\b(rpg|quest|inventory|dungeon)\b/i };
const OK_EXT = /\.(md|txt|py|js|mjs|cjs|ts|json|html|css|sh|yml|yaml|svg)$/i;

module.exports = function shelf({ P, root, docs, postChat, str, nameOf }) {
  const catalog = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'templates', 'shelf.json'), 'utf8')).items || []; } catch { return []; } })();
  const CDN = () => (process.env.TRIBE_SHELF_CDN || 'https://cdn.jsdelivr.net/gh').replace(/\/+$/, '');
  const DATA = () => (process.env.TRIBE_SHELF_DATA || 'https://data.jsdelivr.com/v1/packages/gh').replace(/\/+$/, '');
  const err = (status, m) => Object.assign(new Error(m), { status });
  const repoDir = p => { if (!p || !p.repo) return null; try { return fs.realpathSync(p.repo); } catch { return null; } };

  function deps(dir) {
    if (!dir) return new Set();
    try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); return new Set([...Object.keys(j.dependencies || {}), ...Object.keys(j.devDependencies || {})]); } catch { return new Set(); }
  }
  const hasSkill = (dir, it) => !!(dir && it.kind === 'skill' && fs.existsSync(path.join(dir, '.claude', 'skills', path.basename(it.path), 'SKILL.md')));
  function toolbox(dir) { try { return fs.readFileSync(path.join(dir, 'TOOLBOX.md'), 'utf8'); } catch { return ''; } }
  function typesOf(p) {
    const t = new Set(), dir = repoDir(p), d = deps(dir);
    if (TYPE_BY_EMOJI[p.emoji]) t.add(TYPE_BY_EMOJI[p.emoji]);
    const text = `${p.name || ''} ${p.bio || ''}`;
    for (const [k, re] of Object.entries(WORDS)) if (re.test(text)) t.add(k);
    for (const it of catalog) if ((it.detect || []).some(x => d.has(x))) (it.for || []).filter(f => f !== 'any').forEach(f => t.add(f));
    if (dir && fs.existsSync(path.join(dir, 'assets')) && fs.existsSync(path.join(dir, 'index.html')) && !t.size) t.add('game');
    if (t.has('3d') || t.has('platformer') || t.has('rpg')) t.add('game');
    return [...t];
  }
  function view(p) {
    const dir = repoDir(p), d = deps(dir), tb = dir ? toolbox(dir) : '', types = typesOf(p);
    const items = catalog.map(it => ({ ...it, added: (it.detect || []).some(x => d.has(x)) || hasSkill(dir, it) || tb.includes(`<!-- shelf:${it.id} -->`) }));
    // matches count double; an item's main type (its first 'for') counts once more; 'any' only breaks ties
    const score = it => { const f = it.for || [], hit = f.filter(x => types.includes(x)).length; return hit * 2 + (types.includes(f[0]) ? 1 : 0) + (f.includes('any') ? 0.5 : 0); };
    const kinds = {};
    const picks = items.filter(it => !it.added && score(it) > 0).sort((a, b) => score(b) - score(a))
      .filter(it => { kinds[it.kind] = (kinds[it.kind] || 0) + 1; return kinds[it.kind] <= 2; }).slice(0, 4);
    return { types, picks, items, hasRepo: !!dir };
  }

  async function getJSON(url) { const r = await fetch(url, { headers: { accept: 'application/json' } }); if (!r.ok) throw err(502, `couldn't reach ${new URL(url).host} (${r.status})`); return r.json(); }
  async function installSkill(it, dir) {
    const listing = await getJSON(`${DATA()}/${it.repo}@${it.ref || 'main'}?structure=flat`);
    const prefix = '/' + it.path.replace(/^\/|\/$/g, '') + '/';
    const files = (listing.files || []).filter(f => f.name.startsWith(prefix) && OK_EXT.test(f.name) && (f.size || 0) <= 512 * 1024).slice(0, 60);
    if (!files.some(f => f.name === prefix + 'SKILL.md')) throw err(502, 'that skill has no SKILL.md upstream');
    const dest = path.join(dir, '.claude', 'skills', path.basename(it.path));
    let total = 0;
    for (const f of files) {
      const rel = f.name.slice(prefix.length); if (!rel || rel.split('/').some(s => s === '..' || s.startsWith('.'))) continue;
      const out = path.resolve(dest, rel); if (!out.startsWith(dest + path.sep)) continue;
      const r = await fetch(`${CDN()}/${it.repo}@${it.ref || 'main'}${f.name}`); if (!r.ok) throw err(502, `download failed: ${rel}`);
      const buf = Buffer.from(await r.arrayBuffer()); total += buf.length; if (total > 3 * 1024 * 1024) throw err(413, 'that skill is too big to copy');
      fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf);
    }
    return path.relative(dir, dest).replace(/\\/g, '/');
  }
  const line = it => `- **${it.title}** (${it.kind}, ${it.license}): ${it.summary}${it.install ? ` \`${it.install}\`` : ''}${it.repo ? ` · https://github.com/${it.repo}` : ''}${it.url ? ` · ${it.url}` : ''} <!-- shelf:${it.id} -->`;
  function addToToolbox(p, it, dir, me) {
    const head = `# Toolbox\n\nTools, libraries and Claude Code skills this project uses or wants to try. Added from TribeCode's starter shelf; agents read this before picking a library.\n\n`;
    if (dir) {
      const f = path.join(dir, 'TOOLBOX.md'), cur = toolbox(dir) || head;
      if (!cur.includes(`<!-- shelf:${it.id} -->`)) fs.writeFileSync(f, cur.replace(/\s*$/, '\n') + line(it) + '\n');
    }
    const d = docs.find('Toolbox'), body = (d && d.body) || head;
    if (!body.includes(`<!-- shelf:${it.id} -->`)) docs.upsert({ name: 'Toolbox', body: body.replace(/\s*$/, '\n') + line(it) + '\n', baseVersion: d ? d.version : undefined, by: me.id });
  }
  async function add(id, pid, me, extra) {   // v0.27 company: extra = a Marketplace item (server/market.js, from its own checked catalog)
    const it = extra || catalog.find(x => x.id === id); if (!it) throw err(404, 'not on the shelf');
    const p = P.get(pid); if (!p || !P.canSee(me, pid)) throw err(404, 'project not found');
    if (me.role === 'spectator') throw err(403, 'read-only');
    const dir = repoDir(p); let where = null;
    if (it.kind === 'skill') { if (!dir) throw err(400, 'skills go into the project\'s repo: give it a repo first'); where = await installSkill(it, dir); }
    P.inProject(pid, () => { addToToolbox(p, it, dir, me); postChat('general', 'tribecode', `🧰 ${nameOf(me.id)} added **${it.title}** to the toolbox${where ? ` (Claude Code reads it from ${where})` : ''}${it.install ? `. Install: \`${it.install}\`` : ''}`); });
    return { ok: true, item: it, where };
  }

  // open-source starters to remix (templates/starters.json): checked permissive licenses only, with credit
  const starters = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'templates', 'starters.json'), 'utf8')).items || []; } catch { return []; } })();
  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    if (b === 'starters' && m === 'GET') return send(res, 200, { items: starters });
    try {
      const pid = url.searchParams.get('project') || P.current() || P.defaultId();
      if (!b && m === 'GET') { const p = P.get(pid); if (!p || !P.canSee(me, pid)) return send(res, 200, { types: [], picks: [], items: catalog }); return send(res, 200, view(p)); }
      if (b && m === 'POST') { const body = await readBody(req); return send(res, 200, await add(b.split('/')[0], str(body.project, 80) || pid, me)); }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  // feat/market-v2: the Marketplace adds and removes its own Toolbox lines (server/market.js keeps the undo record)
  function toolboxAdd(pid, it, me) { const p = P.get(pid); P.inProject(pid, () => addToToolbox(p, it, repoDir(p), me)); }
  function toolboxRemove(pid, id, me) {
    const p = P.get(pid), dir = repoDir(p), mark = `<!-- shelf:${id} -->`;
    const strip = t => t.split('\n').filter(l => !l.includes(mark)).join('\n');
    if (dir) { const cur = toolbox(dir); if (cur.includes(mark)) fs.writeFileSync(path.join(dir, 'TOOLBOX.md'), strip(cur)); }
    P.inProject(pid, () => { const d = docs.find('Toolbox'); if (d && d.body && d.body.includes(mark)) docs.upsert({ name: 'Toolbox', body: strip(d.body), baseVersion: d.version, by: me.id }); });
  }
  return { route, view, add, catalog: () => catalog, starters: () => starters, toolboxAdd, toolboxRemove, installSkill, repoDir };
};
