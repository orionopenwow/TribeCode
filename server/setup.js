// Project setup (feat/setup-flow): the light, deterministic steps after the vision. No model needed.
//   Role flows   small one-screen choosers: the artist picks a palette, the engineer picks the engine or stack, the
//                designer picks the core loop (or the first screen), the writer picks a tagline. Each choice is kept
//                per project and turns into two starter tasks on the Task Board.
//   Repo         "Create the repo": a local git repo for a project that has none (a folder in the tribe's workspaces,
//                a README and the vision, git init, a first commit). An existing folder that isn't a repo yet gets
//                git init. Pushing to GitHub stays the existing flow (POST /api/flow/github) and is only offered
//                when GitHub is already set up.
//   Starter      "Make the starter": files from templates/ (starter-game, tavern-3d or starter-site) copied into the
//                repo (never overwriting a file), the palette as CSS variables, then one commit. The Preview opens.
//
//   GET  /api/projects/:id/setup            { kind, label, choices, roles: [...], starter: { ready, made, template } }
//   PUT  /api/projects/:id/setup            { role, choice }   host and builders; returns { setup, tasks }
//   POST /api/projects/:id/setup/repo       host: make sure the project has a git repo; returns { created, repo }
//   POST /api/projects/:id/setup/starter    host: copy the starter in and commit; returns { written, template }
//   POST /api/projects/:id/setup/business   v0.27 company: "A business" { template, helpers } -> the project becomes a company
//                                           (server/company.js); helpers: true fills the open seats with the caller's AI helper
// State: .tribe/setup.json in the tribe folder (one entry per project).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATES = require('./tpldir')();   // v0.27: also works in the desktop app
const FILE = '.tribe/setup.json';

// Flat palettes (5 colors: canvas, surface, accent, second, text-ish). `when`: sense tags or kinds that suit it.
const PALETTES = [
  { id: 'campfire', name: 'Campfire', colors: ['#12151A', '#1B2028', '#F26B1D', '#38C6B1', '#E7E9EE'], accent: 2, when: ['*'] },
  { id: 'pixel-dusk', name: 'Pixel dusk', colors: ['#1B1E2B', '#3B4A6B', '#E07A5F', '#F2CC8F', '#81B29A'], accent: 2, when: ['pixel art', 'game', 'platformer', 'retro'] },
  { id: 'arcade', name: 'Arcade', colors: ['#0F0F1A', '#2B2D5C', '#FF6F8E', '#FFD166', '#38C6B1'], accent: 2, when: ['game', 'arcade', '3d', 'multiplayer'] },
  { id: 'meadow', name: 'Meadow', colors: ['#1E2A22', '#3E5C45', '#8FB39A', '#E9D8A6', '#F4F1E8'], accent: 2, when: ['cozy', 'notes', 'farming', 'kids'] },
  { id: 'paper', name: 'Paper', colors: ['#FAF8F3', '#E9E4D8', '#C8553D', '#4A6FA5', '#2B2B2B'], accent: 2, when: ['site', 'notes', 'portfolio', 'blog'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0E1A24', '#16324A', '#2E86AB', '#A8DADC', '#F1FAEE'], accent: 2, when: ['app', '3d', 'dashboard'] },
  { id: 'ink', name: 'Ink', colors: ['#111111', '#2A2A2A', '#6C7CFF', '#3BD16F', '#F5F5F5'], accent: 2, when: ['tool', 'bot', 'api'] },
  { id: 'market', name: 'Market', colors: ['#2D1E2F', '#5C3D5E', '#F26B1D', '#F7B267', '#F4F1E8'], accent: 2, when: ['site', 'app', 'e-commerce'] },
];
// Engines and stacks per kind, from docs/STUDIO-SCOPING.md. `starter`: the template "Make the starter" copies.
const ENGINES = {
  game: [
    { id: 'kaplay', name: 'KAPLAY', why: 'Friendly 2D: sprites, scenes and collisions in a few lines. The default pick.' },
    { id: 'littlejs', name: 'LittleJS', why: 'Tiny and fast. Great for arcade and pixel games.' },
    { id: 'phaser', name: 'Phaser', why: 'The big one: lots of examples, plugins and answers online.' },
    { id: 'threejs', name: 'three.js', why: 'When the game is 3D. Pairs with Rapier for physics.' },
  ],
  '3d': [
    { id: 'threejs-rapier', name: 'three.js + Rapier', why: 'Walk, slopes and steps with a character controller. The default for 3D.' },
    { id: 'threejs', name: 'three.js', why: 'Just the renderer: scenes, lights and models, no physics yet.' },
  ],
  site: [
    { id: 'pico', name: 'Plain HTML + Pico', why: 'No build step. Plain HTML looks good right away.' },
    { id: 'eleventy', name: 'Eleventy', why: 'When the site grows to many pages or a blog.' },
    { id: 'astro', name: 'Astro', why: 'Content sites with components. Heavier, adds a build.' },
  ],
  app: [
    { id: 'vanilla', name: 'Plain JS (or VanJS)', why: 'Small apps stay small: no framework, no build.' },
    { id: 'preact', name: 'Preact', why: 'Components when the screens start to repeat. 4 KB.' },
  ],
  tool: [
    { id: 'node-cli', name: 'Node + commander', why: 'A command-line tool with flags and help for free.' },
    { id: 'python', name: 'A Python script', why: 'Quickest for files, data and automation.' },
  ],
  bot: [
    { id: 'discordjs', name: 'discord.js', why: 'The standard way to build a Discord bot.' },
    { id: 'grammy', name: 'grammY', why: 'Telegram bots, small and well documented.' },
  ],
  api: [
    { id: 'hono', name: 'Hono', why: 'A tiny web framework for APIs. Runs anywhere.' },
    { id: 'node-http', name: 'Plain Node http', why: 'No dependencies at all, like TribeCode itself.' },
  ],
  other: [{ id: 'html', name: 'Plain HTML', why: 'One page, no build. Grow it when it needs more.' }],
};
const LOOPS = {
  game: [
    { id: 'run-jump', name: 'Run, jump, reach the flag', why: 'A platformer: one level teaches the whole game.' },
    { id: 'explore-fight', name: 'Explore, fight, level up', why: 'An adventure: rooms, enemies and getting stronger.' },
    { id: 'dodge-survive', name: 'Dodge, survive, beat your score', why: 'Arcade: short runs and one more try.' },
    { id: 'solve-rooms', name: 'Solve a room, then the next', why: 'A puzzle game: small rules, clever combos.' },
  ],
  other: [
    { id: 'landing', name: 'A landing page with one button', why: 'Say what it is and ask for one thing.' },
    { id: 'list', name: 'A list you can add to', why: 'Add, check off, remove. Most apps start here.' },
    { id: 'dashboard', name: 'A few numbers that matter', why: 'One screen that answers "how is it going?".' },
    { id: 'form', name: 'A form that does one thing', why: 'Type something in, get something useful back.' },
  ],
};
const LINES = {
  game: ['One more run.', 'Small game. Big grin.', 'Jump in, five minutes, done.', 'Made by friends, for friends.'],
  '3d': ['Step inside.', 'A small world to wander.', 'Walk in. Look around. Stay a while.', 'Made by friends, for friends.'],
  site: ['Everything you need, on one page.', 'Say it once, say it clearly.', 'The short version is the best one.', 'Made by friends, for friends.'],
  app: ['The quick way to get it done.', 'Open it, tap twice, done.', 'Small app. Saves a lot of time.', 'Made by friends, for friends.'],
  tool: ['One command instead of ten minutes.', 'Does the boring part for you.', 'Small tool, saves an afternoon.', 'Made by friends, for friends.'],
  bot: ['Your group chat, a little smarter.', 'Ask it. It answers.', 'One command away.', 'Made by friends, for friends.'],
  other: ['Something small we made together.', 'Built in a weekend, kept for good.', 'A tiny thing, done well.', 'Made by friends, for friends.'],
};
const STARTER = { game: 'starter-game', '3d': 'tavern-3d' };   // everything else: starter-site
const one = (s, n = 200) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

module.exports = function setup({ P, W, base, sense, readVision, createTask, broadcast, resetHub, getMembers, siteTpl = () => null, company = () => null }) {
  let all = base.readJSON(FILE, {}); if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  const save = () => base.writeJSON(FILE, all);
  const err = (status, m) => Object.assign(new Error(m), { status });
  const entry = pid => (all[pid] = all[pid] || { choices: {} });
  const roleIn = (me, pid) => ((P.get(pid) || {}).members || {})[me.id] || me.role;
  const canEdit = (me, pid) => !!me && me.role !== 'agent' && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator';
  const isHost = (me, pid) => !!me && (me.role === 'host' || roleIn(me, pid) === 'host');
  const member = mid => (getMembers().find(m => m.id === mid) || null);

  function senseOf(pid) {
    let c = null; try { c = sense && sense.get(pid); } catch {}
    const kind = c && c.kind && c.kind !== 'other' && (c.by === 'host' || c.confidence >= 0.45) ? c.kind : '';
    return { kind, tags: (c && c.tags) || [], label: (c && c.label) || 'project' };
  }
  const visionOf = pid => { try { return P.inProject(pid, () => readVision()) || ''; } catch { return ''; } };
  const hasVision = v => !!v.replace(/^#.*$/gm, '').replace(/Replace these lines together[\s\S]*/, '').replace(/\s+/g, ' ').trim();
  const gistOf = v => { const m = v.match(/##\s*What\s*\n+([^\n#]+)/i); return one(m ? m[1] : v.replace(/^#.*$/gm, '').trim().split('\n').find(Boolean) || '', 160); };

  function palettesFor(kind, tags) {
    const want = new Set([kind, ...tags].filter(Boolean));
    return PALETTES.map((p, i) => ({ p, s: p.when.filter(w => want.has(w)).length * 10 - i + (p.when.includes('*') ? 5 : 0) }))
      .sort((a, b) => b.s - a.s).slice(0, 6).map(x => ({ id: x.p.id, name: x.p.name, colors: x.p.colors }));
  }
  function options(pid) {
    const { kind, tags, label } = senseOf(pid), k = kind || 'other', v = visionOf(pid), game = k === 'game';
    const gist = gistOf(v);
    const lines = [...(gist && gist.length <= 70 ? [gist.replace(/\.$/, '') + '.'] : []), ...(LINES[k] || LINES.other)].slice(0, 4);
    return {
      kind, label, game,
      artist: palettesFor(kind, tags),
      engineer: ENGINES[k] || ENGINES.other,
      designer: game ? LOOPS.game : LOOPS.other,
      writer: lines.map((t, i) => ({ id: `line-${i}`, name: t })),
    };
  }
  const ROLES = o => [
    { id: 'artist', emoji: '🎨', title: 'I’m the artist', sub: 'Pick a palette' },
    { id: 'engineer', emoji: '🧰', title: 'I’m the engineer', sub: o.game || o.kind === '3d' ? 'Pick the engine' : 'Pick the stack' },
    { id: 'designer', emoji: '🎯', title: o.game ? 'I’m the game designer' : 'I’m the designer', sub: o.game ? 'Pick the core loop' : 'Pick the first screen' },
    { id: 'writer', emoji: '✍️', title: 'I’m the writer', sub: 'Pick a tagline' },
  ];
  function view(pid, me) {
    const e = entry(pid), o = options(pid), p = P.get(pid) || {}, v = visionOf(pid);
    const repoOk = !!(p.repo && W.isRepo(p.repo));
    return {
      kind: o.kind, label: o.label, vision: hasVision(v), canEdit: canEdit(me, pid), canHost: isHost(me, pid), choices: e.choices || {},
      roles: ROLES(o).map(r => ({ ...r, options: o[r.id], done: !!(e.choices || {})[r.id] })),
      repo: { has: !!p.repo, git: repoOk },
      starter: { ready: hasVision(v) && !!o.kind, made: !!e.starter, template: STARTER[o.kind] || 'starter-site', at: (e.starter || {}).at || null,
        templates: ((siteTpl() && siteTpl().list()) || []).map(t => ({ slug: t.slug, name: t.name, summary: t.summary, from: t.from })) },
    };
  }
  // Two starter tasks per choice, typed for the Task Board's chips.
  function tasksFor(role, opt, o) {
    if (role === 'artist') return [[`Use the ${opt.name} palette as CSS variables`, 'design', `Colors: ${opt.colors.join(', ')}. Put them in one place (design/palette.css) so agents keep to them.`],
      [o.game ? `Draw the first sprite in the ${opt.name} palette` : `Style the first screen in the ${opt.name} palette`, 'design', '']];
    if (role === 'engineer') return [[`Set up ${opt.name}`, 'build', opt.why], [`Hello world in ${opt.name}: one thing on screen`, 'build', '']];
    if (role === 'designer') return o.game ? [[`Build the core loop: ${opt.name.toLowerCase()}`, 'build', opt.why], ['Make one level that tests the loop', 'design', '']]
      : [[`Build the first screen: ${opt.name.toLowerCase()}`, 'build', opt.why], ['Sketch the first screen before building it', 'design', '']];
    return [[`Write the headline: “${opt.name}”`, 'write', ''], [o.game ? 'Write the title screen and how-to-play text' : 'Write the copy for the first screen', 'write', '']];
  }
  function choose(pid, me, body) {
    if (!canEdit(me, pid)) throw err(403, 'only the host and builders can make setup choices');
    const role = String(body.role || ''), o = options(pid);
    if (!['artist', 'engineer', 'designer', 'writer'].includes(role)) throw err(400, 'which role?');
    const opt = (o[role] || []).find(x => x.id === String(body.choice || '')); if (!opt) throw err(400, 'pick one of the options');
    const e = entry(pid); e.choices = e.choices || {}; e.choices[role] = { id: opt.id, name: opt.name, ...(opt.colors ? { colors: opt.colors } : {}), by: me.id, at: new Date().toISOString() };
    save();
    if (role === 'artist') { const pal = PALETTES.find(x => x.id === opt.id); if (pal) { P.update(pid, { color: pal.colors[pal.accent] }); broadcast({ type: 'projects' }); } }   // the website and theme follow the project color
    if (role === 'writer') { const p = P.get(pid); if (p && !p.bio) { P.update(pid, { bio: opt.name }); broadcast({ type: 'projects' }); } }
    const tasks = P.inProject(pid, () => tasksFor(role, opt, o).map(([title, type, b]) => createTask({ title, type, body: b ? `${b}\n\n_From setup: ${role}._` : `_From setup: ${role}._`, by: me.id, source: 'setup' })));
    broadcast({ type: 'setup', project: pid });
    return { setup: view(pid, me), tasks };
  }

  // ---------- the repo ----------
  async function ensureRepo(pid, me) {
    const p = P.get(pid); if (!p) throw err(404, 'project not found');
    if (p.repo && W.isRepo(p.repo)) return { created: false, repo: p.repo };
    let dir = p.repo;
    if (!dir) {
      dir = base.p('workspaces', pid); fs.mkdirSync(dir, { recursive: true });
      const readme = path.join(dir, 'README.md');
      if (!fs.existsSync(readme)) fs.writeFileSync(readme, `# ${p.name}\n\n${p.bio ? p.bio + '\n\n' : ''}Built together with TribeCode. The vision is in VISION.md.\n`);
      const v = visionOf(pid), vf = path.join(dir, 'VISION.md');
      if (hasVision(v) && !fs.existsSync(vf)) fs.writeFileSync(vf, v);
    }
    await W.makeRepo(dir, member(me.id) || me);
    if (dir !== p.repo) P.update(pid, { repo: dir, workspace: true });
    if (resetHub) resetHub(pid);
    broadcast({ type: 'projects' }); broadcast({ type: 'repo', project: pid });
    return { created: true, repo: dir };
  }

  // ---------- the starter ----------
  function copyTree(src, dest, fill, out, rel = '') {
    for (const f of fs.readdirSync(src, { withFileTypes: true })) {
      if (f.name.startsWith('.') || f.name === 'node_modules') continue;
      const s = path.join(src, f.name), d = path.join(dest, f.name), r = rel ? `${rel}/${f.name}` : f.name;
      if (f.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyTree(s, d, fill, out, r); continue; }
      if (fs.existsSync(d)) continue;   // never overwrite what the tribe already has
      const text = /\.(html|css|js|md|json|txt)$/i.test(f.name);
      fs.writeFileSync(d, text ? fill(fs.readFileSync(s, 'utf8')) : fs.readFileSync(s)); out.push(r);
    }
  }
  async function starter(pid, me, body = {}) {
    // the host, or a builder once the project has its repo (they can write code anyway; only the host creates repos)
    if (!isHost(me, pid) && !(canEdit(me, pid) && (P.get(pid) || {}).repo && W.isRepo(P.get(pid).repo))) throw err(403, 'only the host can add files to a project without a repo');
    const v = visionOf(pid), o = options(pid);
    if (!hasVision(v)) throw err(400, 'write the vision first');
    const { repo } = await ensureRepo(pid, me);
    const p = P.get(pid), e = entry(pid), pal = (e.choices || {}).artist ? PALETTES.find(x => x.id === e.choices.artist.id) : PALETTES[0];
    const tpl = STARTER[o.kind] || 'starter-site', engine = (e.choices || {}).engineer;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const vars = ['--canvas', '--surface', '--accent', '--second', '--ink'];
    const fill = t => t.replace(/\{\{name\}\}/g, esc(p.name)).replace(/\{\{gist\}\}/g, esc(gistOf(v) || p.bio || ''))
      .replace(/\{\{tagline\}\}/g, esc(((e.choices || {}).writer || {}).name || p.bio || '')).replace(/\{\{engine\}\}/g, esc(engine ? engine.name : 'plain HTML'))
      .replace(/\{\{palette\}\}/g, pal.colors.map((c, i) => `${vars[i]}: ${c};`).join(' '));
    let written = [], usedTpl = tpl;
    const own = typeof body.template === 'string' && body.template.startsWith('tribe:') && siteTpl() ? siteTpl().templateDir(body.template.slice(6)) : null;
    if (typeof body.template === 'string' && body.template.startsWith('tribe:') && !own) throw err(404, 'no tribe template by that name');
    if (own) { written = siteTpl().copyInto(body.template.slice(6), repo, t => siteTpl().fillFor(pid)(fill(t))); usedTpl = body.template; }   // v0.25: the host's own website templates
    else copyTree(path.join(TEMPLATES, tpl), repo, fill, written);
    // the game starter's page takes the project's name (the template keeps "Pixel Quest" so the test project still reads well)
    try { const ix = path.join(repo, 'index.html'); if (written.some(f => /(^|[\\/])index\.html$/.test(f))) { const h = fs.readFileSync(ix, 'utf8'); if (h.includes('<title>Pixel Quest</title>')) fs.writeFileSync(ix, h.replace('<title>Pixel Quest</title>', `<title>${esc(p.name)}</title>`)); } } catch {}
    const pf = path.join(repo, 'design', 'palette.css');
    if (!fs.existsSync(pf)) { fs.mkdirSync(path.dirname(pf), { recursive: true }); fs.writeFileSync(pf, `/* ${pal.name}: the project's colors. Use these variables everywhere. */\n:root {\n${pal.colors.map((c, i) => `  ${vars[i]}: ${c};`).join('\n')}\n}\n`); written.push('design/palette.css'); }
    if (written.length) {
      await W.git(['add', '-A'], repo);
      const r = await W.git([...W.identity(member(me.id) || me), 'commit', '-q', '-m', `Add the ${o.label} starter (via TribeCode)`], repo);
      if (r.code && !/nothing to commit/i.test(r.out + r.err)) throw err(422, one(r.err || r.out, 200));
    }
    e.starter = { at: new Date().toISOString(), by: me.id, template: usedTpl, files: written.length }; save();
    if (resetHub) resetHub(pid);
    broadcast({ type: 'setup', project: pid }); broadcast({ type: 'repo', project: pid });
    return { written, template: usedTpl, setup: view(pid, me) };
  }

  async function route(req, res, { m, b, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!P.get(b) || !P.canSee(me, b)) return fail(res, 404, 'project not found');
    const sub = parts[3] || '';
    try {
      if (m === 'GET' && !sub) return send(res, 200, view(b, me));
      if (m === 'PUT' && !sub) return send(res, 200, choose(b, me, await readBody(req, 8 * 1024)));
      if (m === 'POST' && sub === 'repo') { if (!isHost(me, b)) return fail(res, 403, 'only the host can create the repo'); return send(res, 200, { ...(await ensureRepo(b, me)), setup: view(b, me) }); }
      if (m === 'POST' && sub === 'business') { if (!company()) return fail(res, 503, 'company mode is off'); const bd = await readBody(req, 8 * 1024).catch(() => ({})); const r = company().createFrom(b, me, { template: String(bd.template || 'blank'), helpers: !!bd.helpers, name: bd.name, mission: bd.mission }); broadcast({ type: 'setup', project: b }); return send(res, 200, { company: r.company, tasks: r.tasks, helper: r.helper }); }   // v0.27 company
      if (m === 'POST' && sub === 'starter') return send(res, 200, await starter(b, me, await readBody(req, 4 * 1024).catch(() => ({}))));
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 404, 'no such setup route');
  }
  return { route, view, ensureRepo, PALETTES, ENGINES };
};
