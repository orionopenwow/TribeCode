// Flint's free tier (docs/FLINT-TIERS.md): what Flint does with no AI at all, what a small free model adds, and what
// honestly needs a stronger AI. Two jobs:
//   1. Free builds from recipes: "a 3D game", "a to-do app", "a video editor", "a landing page for Sunrise Bakery",
//      "a platformer". Flint picks the starter from the build kit (templates/starter-*, templates/recipes/*), fills in
//      the name, words and colors from what you said (no model needed), writes the files into the project's code,
//      commits them, and the live preview shows them. Never overwrites: when the repo already has a page at the top,
//      the new build goes into builds/<name>/.
//   2. The capability map and an honest answer to "can Flint do this for free?" for any request.
//   GET  /api/flint/tiers                    -> { tiers: [...], now: { host: { online, via } } }
//   POST /api/flint/tier       { ask }       -> { tier, why, recipe? }
//   POST /api/projects/:id/flint/build { ask } -> { recipe, title, dir, href, files, tier: 'recipe' }
//   GET  /api/projects/:id/flint/history       -> { commits: [{ sha, short, author, subject, at }], dirty }   (P1-F)
//   POST /api/projects/:id/flint/save          -> saves uncommitted changes as a version
//   POST /api/projects/:id/flint/restore { sha } -> saves first, then a NEW commit with that version's files (no rewrite)
// Nothing here calls a model or any outside service. No prices live in this repo.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// ---------- the capability map ----------
const TIERS = [
  { id: 'rules', label: 'Free · no AI', where: 'Runs anywhere, even on a phone with no signal',
    can: ['Understand plain requests, typos and several steps at once, in eight languages', 'Answer how-to questions from the Guide and the docs', 'Add, finish, assign and reschedule tasks; notes and reminders', 'Tell people things, post in chat, put things on the calendar', 'Switch theme, accent, text size and language', 'Undo what it did, and learn your own phrases', 'Math, units, dates, coins and dice', 'Open any part of the app', 'Edit the picked element in the preview: words, color, size, spacing, corners, alignment, hide or remove', 'Add built-in sounds and sprites', 'Draft docs, sheets and decks from templates and your project'] },
  { id: 'recipe', label: 'Free · recipes', where: 'No AI needed: builds from the open-source build kit',
    can: ['A landing page for anything', 'A website from 16 templates: link in bio, merch shop, café, band, portfolio, blog and more', 'A to-do app', 'A 3D game (three.js)', 'A 2D platformer', 'A video editor in the browser', 'Names, words and colors filled in from what you said'] },
  { id: 'small', label: 'Free · small model', where: 'Qwen on this device (WebGPU) or on the host (Ollama)',
    can: ['Chat and quick answers about your project', 'Write and rewrite short copy', 'Fuller docs, sheets and decks', 'Small edits to one page'] },
  { id: 'agent', label: 'A stronger AI', where: "A member's own Claude Code, Codex or Gemini, or the host's AI key",
    can: ['Changes across many files', 'New game systems (multiplayer, saves, AI enemies, level editors)', 'Accounts, databases, payments and servers', 'Refactors, ports and performance work', 'Debugging hard errors'] },
];

// ---------- recipes ----------
const RECIPES = [
  { id: '3d', tpl: 'starter-3d', title: '3D game', rx: /\b(3d|three\.?js|first[- ]person|third[- ]person)\b.*\b(game|world|scene|level|walk|explore)|\b(game|world|scene)\b.*\b3d\b/ },
  { id: 'video', tpl: 'starter-video', title: 'video editor', rx: /\b(video|clip|movie|film|reel)s?\s*(editor|editing|cutter|trimmer|maker)\b|\bedit (my |our )?videos?\b/ },
  { id: 'game', tpl: 'starter-game', title: '2D game', rx: /\b(platformer|pixel (art )?game|2d game|arcade game|side[- ]scroller|jump(ing)? game)\b|^(?:a |an )?(?:little |small |simple |fun )?game\b/ },
  { id: 'todo', tpl: 'recipes/todo', title: 'to-do app', rx: /\b(to-?do|todo|task|checklist|shopping list|chore)s?\s*(list|app|tracker|manager)?\b/ },
  { id: 'landing', tpl: 'recipes/landing', title: 'landing page', rx: /\b(landing page|home ?page|web ?site|site|one[- ]pager|page for)\b/ },
];
// Website templates (templates/sites/<id>, server/sitelib.js): matched before the generic landing page, except when
// someone says "landing page" (then they get the landing recipe).
const SITE_RECIPES = [
  { id: 'site:linkbio', site: 'linkbio', title: 'link-in-bio page', rx: /\b(link[- ]?in[- ]?bio|link ?tree|links? page|bio link|all my links)\b/ },
  { id: 'site:merch', site: 'merch', title: 'merch shop', rx: /\b(merch|shop|store|online store|e-?commerce|sell (my|our)? ?(stuff|products|things))\b/ },
  { id: 'site:cafe', site: 'cafe', title: 'restaurant site', rx: /\b(restaurant|caf[eé]|coffee shop|bakery|bistro|diner|food truck|menu)\b/ },
  { id: 'site:band', site: 'band', title: 'band page', rx: /\b(band|musician|tour dates|album|dj|singer|rapper)\b/ },
  { id: 'site:podcast', site: 'podcast', title: 'podcast site', rx: /\bpodcast\b/ },
  { id: 'site:wedding', site: 'wedding', title: 'event page', rx: /\b(wedding|rsvp|reunion|retreat|birthday (party|weekend)|save the date)\b/ },
  { id: 'site:blog', site: 'blog', title: 'blog', rx: /\b(blog|newsletter|journal|devlog|writing site)\b/ },
  { id: 'site:portfolio', site: 'portfolio', title: 'portfolio', rx: /\b(portfolio|case stud(y|ies)|design studio|interior design|architect)\b/ },
  { id: 'site:photography', site: 'photography', title: 'photo gallery', rx: /\b(photograph(y|er)|photo gallery|gallery)\b/ },
  { id: 'site:resume', site: 'resume', title: 'resume', rx: /\b(resume|r[eé]sum[eé]|cv|about me page)\b/ },
  { id: 'site:creator', site: 'creator', title: 'creator page', rx: /\b(streamer|stream(ing)? (page|site)|twitch|youtuber|youtube channel|content creator)\b/ },
  { id: 'site:gamepage', site: 'gamepage', title: 'game page', rx: /\b(press kit|game page|steam page|wishlist page)\b/ },
  { id: 'site:nonprofit', site: 'nonprofit', title: 'nonprofit site', rx: /\b(nonprofit|non-profit|charity|donat(e|ion)s?|fundrais\w*|community group|mutual aid)\b/ },
  { id: 'site:service', site: 'service', title: 'local business site', rx: /\b(plumb\w*|salon|barber\w*|cleaning (service|business)|electrician|handyman|landscap\w*|repair shop|hvac|roofer)\b/ },
  { id: 'site:comingsoon', site: 'comingsoon', title: 'coming-soon page', rx: /\b(coming soon|waitlist|wait list|pre-?launch|launch page)\b/ },
  { id: 'site:saas', site: 'saas', title: 'product page', rx: /\b(saas|startup|product page|app page|software product)\b/ },
];
const siteRecipeFor = a => (/\blanding page\b/.test(a) ? null : SITE_RECIPES.find(x => x.rx.test(a)) || null);
const BIG = /\b(refactor|rewrite|migrat\w*|multiplayer|online play|log ?in|sign[- ]?(in|up)|accounts?|auth\w*|database|backend|back-end|server|api\b|payments?|stripe|checkout|subscriptions?|chat ?bot|ai (enemies|opponent|chat)|leaderboards?|level editor|inventory system|save (system|games?)|physics engine|across (all|every|the whole)|whole (app|codebase|project|site)|every (file|page)|all (the )?(files|pages)|optimi[sz]e|performance|port (it|this)|convert (it|this|the app) to|typescript|react|vue|svelte|unit tests?|test suite|deploy pipeline|ci\b|debug|crash(es|ing)?|memory leak)\b/i;
const PICKY = /\b(bigger|larger|smaller|bold|italic|underline|uppercase|cent(er|re)(ed)?|align|left|right|color|colour|background|rounded|corners?|padding|spacing|space|margin|hide|remove|delete|font|size|dark|light|red|orange|yellow|gold|green|mint|teal|blue|sky|navy|indigo|purple|violet|pink|rose|brown|white|black|gr[ae]y)\b|#[0-9a-f]{3,6}\b/i;

function classify(ask, { picked = false } = {}) {
  const a = String(ask || '').toLowerCase().trim();
  if (!a) return { tier: 'rules', why: 'Nothing asked yet.' };
  if (BIG.test(a)) return { tier: 'agent', why: 'This touches many parts of the code or needs real engineering (systems, accounts, data, servers or debugging). That is a job for a stronger AI: a member\'s own Claude Code, Codex or Gemini, or the host\'s AI key.' };
  const wantsBuild = /\b(make|build|create|start|give me|set up|spin up|i want|we want|need)\b/.test(a);
  const sr = wantsBuild && !RECIPES.slice(0, 4).some(x => x.rx.test(a)) && siteRecipeFor(a);
  if (sr) return { tier: 'recipe', recipe: sr.id, site: sr.site, why: `Free: Flint builds a ${sr.title} from TribeCode's website templates, no AI needed. Customize it in a short form.` };
  const r = wantsBuild && RECIPES.find(x => x.rx.test(a));
  if (r) return { tier: 'recipe', recipe: r.id, why: `Free: Flint builds a ${r.title} from the open-source build kit, no AI needed.` };
  if (picked && PICKY.test(a)) return { tier: 'rules', why: 'Free: a look change on the element you picked, no AI needed.' };
  if (/\b(change|make|set|rename)\b.*\b(to|say|read)\b/.test(a) && picked) return { tier: 'rules', why: 'Free: new words for the element you picked.' };
  if (/\b(add|make|build|create)\b.*\b(feature|system|mode|screen|page|level|enemy|enemies|boss|menu|animation|logic)\b/.test(a)) return { tier: 'agent', why: 'A new feature means writing real code. A small model can try a one-page tweak, but your AI helper (Claude Code, Codex, Gemini) does this well.' };
  return { tier: 'small', why: 'A small free model can handle this: Qwen on this device or on the host. With none on, Flint answers what it can without one.' };
}

// ---------- words for a landing page, from what you said (no model) ----------
const KINDS = [
  { rx: /\b(bak(e|ery|ing)|caf[eé]|coffee|restaurant|food|pizza|kombucha|tea|bistro|kitchen|donut|brew(ery)?|juice|taco|burger|deli)\b/, eyebrow: 'Fresh every day', head: n => `${n}, made with care`, sub: n => `Come by, order ahead, or find us around town. Everything at ${n} is made fresh, in small batches.`, cta: 'Order ahead',
    f: [['🥐', 'Made fresh', 'Small batches every morning, so it tastes like it should.'], ['📍', 'Easy to find', 'Hours, location and where to park, all in one place.'], ['📦', 'Order ahead', 'Skip the line: tell us what you want and pick it up.']] },
  { rx: /\b(gym|fitness|yoga|pilates|run(ning)?|coach(ing)?|trainer|workout|crossfit|martial)\b/, eyebrow: 'Get moving', head: n => `Get stronger with ${n}`, sub: () => 'Classes and coaching that fit your week, whatever your level.', cta: 'Book a class',
    f: [['🏋️', 'Every level', 'Start where you are. Every session scales to you.'], ['📅', 'Fits your week', 'Morning, lunch and evening times, with easy booking.'], ['🤝', 'Real coaches', 'People who know your name and your goals.']] },
  { rx: /\b(app|saas|software|tool|startup|platform|product|extension|plugin|ai)\b/, eyebrow: 'Now in early access', head: n => `${n} does the busywork for you`, sub: n => `${n} takes the repetitive parts off your plate, so you can focus on the work that matters.`, cta: 'Get early access',
    f: [['⚡', 'Fast to start', 'Set up in minutes. No training or manuals.'], ['🔒', 'Private by default', 'Your data stays yours, always.'], ['🔁', 'Works with your tools', 'Fits into the apps you already use.']] },
  { rx: /\b(game|studio|indie|arcade)\b/, eyebrow: 'Coming soon', head: n => `${n}: play it first`, sub: () => 'A small game made with friends. Join the list to get the first build.', cta: 'Join the playtest',
    f: [['🎮', 'Easy to pick up', 'Play in your browser, on your phone or your computer.'], ['🧩', 'Made with friends', 'Built in the open by a small crew.'], ['🔔', 'First to know', 'Playtests, devlogs and launch day, straight to you.']] },
  { rx: /\b(band|music|dj|podcast|album|artist|singer|label)\b/, eyebrow: 'New music', head: n => `${n}, live and loud`, sub: () => 'New releases, shows and the stories behind the songs.', cta: 'Get show alerts',
    f: [['🎧', 'Listen now', 'Every release in one place.'], ['🎟️', 'Shows', 'Dates near you and tickets when they drop.'], ['✉️', 'Stay close', 'Behind-the-scenes notes, a few times a month.']] },
  { rx: /\b(shop|store|brand|cloth(ing|es)?|merch|jewel(le)?ry|candles?|soap|boutique|handmade|etsy)\b/, eyebrow: 'New collection', head: n => `${n}: made to last`, sub: n => `Thoughtfully made goods from ${n}, shipped to your door.`, cta: 'Shop the collection',
    f: [['✨', 'Made well', 'Quality materials and careful work in every piece.'], ['🚚', 'Ships fast', 'Packed with care and on its way within days.'], ['↩️', 'Easy returns', 'Not right? Send it back, no fuss.']] },
  { rx: /\b(event|wedding|party|conference|meetup|festival|workshop|hackathon|camp)\b/, eyebrow: 'Save the date', head: n => `Join us at ${n}`, sub: () => 'All the details in one place: when, where, and how to sign up.', cta: 'Save my spot',
    f: [['📅', 'When', 'Dates and the schedule, kept up to date.'], ['📍', 'Where', 'The venue, directions and where to stay.'], ['🎟️', 'Sign up', 'Grab a spot in under a minute.']] },
  { rx: /\b(portfolio|photograph(y|er)|designer|illustrat\w*|freelanc\w*|consult\w*|agency|resume|cv)\b/, eyebrow: 'Selected work', head: n => `${n}: work that speaks for itself`, sub: () => 'A few projects, what went into them, and how to work together.', cta: 'Start a project',
    f: [['🖼️', 'The work', 'Recent projects with the story behind each one.'], ['🛠️', 'How I work', 'Clear steps from first call to final delivery.'], ['💬', 'Kind words', 'What clients say after we finish.']] },
];
const DEFAULT_KIND = { eyebrow: 'Hello', head: n => `Welcome to ${n}`, sub: n => `Everything you need to know about ${n}, in one place.`, cta: 'Get in touch',
  f: [['✨', 'What it is', 'A short, clear line about what you do.'], ['🎯', 'Who it\'s for', 'The people you help, and how.'], ['💬', 'Talk to us', 'Questions? We answer fast.']] };
const COLORS = { red: '#E5484D', orange: '#F26B1D', ember: '#F26B1D', yellow: '#FABD2F', gold: '#E9B949', green: '#3BD16F', mint: '#5FD3A5', teal: '#38C6B1', blue: '#3B82F6', sky: '#4FB3F6', indigo: '#6C7CFF', purple: '#8B5CF6', violet: '#8B5CF6', pink: '#FF6F8E', rose: '#FF6F8E', brown: '#B07A4F', white: '#FFFFFF', gray: '#94A3B8', grey: '#94A3B8' };
const titleCase = s => s.replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
function nameFrom(ask, fallback) {
  const m = /\b(?:for|called|named|about)\s+(?:my\s+|our\s+|a\s+|an\s+|the\s+)?["“']?([^,.!?"”']{2,48})/i.exec(ask);
  let n = m ? m[1].replace(/\s+(with|that|which|in|using|where|and make|please)\b.*$/i, '').trim() : '';
  if (n && n === n.toLowerCase()) n = titleCase(n);
  return n || fallback || 'Our project';
}
function accentFrom(ask) {
  const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(ask); if (hex) return '#' + hex[1];
  const c = new RegExp(`\\b(${Object.keys(COLORS).join('|')})\\b`, 'i').exec(ask); return c ? COLORS[c[1].toLowerCase()] : '#F26B1D';
}

module.exports = function flintFree({ P, W, root, getMembers = () => [], broadcast = () => {}, ensureRepo = null, siteLib = null, llmStatus = () => ({ online: false }), log = () => {} }) {
  const TEMPLATES = path.join(root, 'templates');
  const err = (status, m) => Object.assign(new Error(m), { status });
  const roleIn = (me, pid) => ((P.get(pid) || {}).members || {})[me.id] || me.role;
  const canEdit = (me, pid) => !!me && me.role !== 'agent' && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator';
  const isHost = (me, pid) => !!me && (me.role === 'host' || roleIn(me, pid) === 'host');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'build';

  function copyTree(src, dest, fill, out, rel = '') {
    for (const f of fs.readdirSync(src, { withFileTypes: true })) {
      if (f.name.startsWith('.') || f.name === 'node_modules') continue;
      const s = path.join(src, f.name), d = path.join(dest, f.name), r = rel ? `${rel}/${f.name}` : f.name;
      if (f.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyTree(s, d, fill, out, r); continue; }
      if (fs.existsSync(d)) continue;   // never overwrite
      const text = /\.(html|css|js|md|json|txt)$/i.test(f.name);
      fs.writeFileSync(d, text ? fill(fs.readFileSync(s, 'utf8')) : fs.readFileSync(s)); out.push(r);
    }
  }

  async function build(pid, me, ask) {
    ask = String(ask || '').trim().slice(0, 600);
    if (!ask) throw err(400, 'say what to build');
    const c = classify(ask);
    if (c.tier !== 'recipe') return { built: false, ...c };
    if (c.site && siteLib) {   // a website template: name and color from what was said, then Customize takes over
      const out = await siteLib.create(pid, me, { template: c.site, name: nameFrom(ask, (P.get(pid) || {}).name), accent: /#[0-9a-f]{3,6}\b|\b(red|orange|yellow|gold|green|mint|teal|blue|sky|indigo|purple|violet|pink|rose|brown)\b/i.test(ask) ? accentFrom(ask) : null });
      const t = SITE_RECIPES.find(x => x.id === c.recipe);
      return { built: true, tier: 'recipe', recipe: c.recipe, site: c.site, title: t ? t.title : out.title, name: out.name, dir: out.dir, href: out.href, files: out.files, customize: true };
    }
    const p = P.get(pid);
    let repo = p && p.repo && W.isRepo(p.repo) ? p.repo : null;
    if (!repo) {
      if (!isHost(me, pid)) throw err(403, 'only the host can start the code for a project without a repo');
      if (!ensureRepo) throw err(503, 'the project has no code repository yet');
      repo = (await ensureRepo(pid, me)).repo;
    } else if (!canEdit(me, pid)) throw err(403, 'only builders can add code');
    const r = RECIPES.find(x => x.id === c.recipe);
    const name = nameFrom(ask, r.id === 'landing' ? (p && p.name) : (p && p.name));
    const accent = accentFrom(ask);
    const K = KINDS.find(k => k.rx.test(ask.toLowerCase())) || DEFAULT_KIND;
    const vars = {
      name, gist: ask.replace(/^(please\s+)?(make|build|create|start|give me)\s+(me\s+|us\s+)?/i, '').replace(/^\w/, ch => ch.toUpperCase()),
      tagline: name, engine: r.id === '3d' ? 'three.js' : r.id === 'video' ? 'WebCodecs + Mediabunny' : 'plain HTML', accent,
      palette: `--canvas: #12151A; --surface: #1B2028; --accent: ${accent}; --second: #38C6B1; --ink: #E7E9EE;`,
      eyebrow: K.eyebrow, headline: r.id === 'todo' ? 'What needs doing' : K.head(name), sub: K.sub(name), cta: K.cta,
      f1i: K.f[0][0], f1t: K.f[0][1], f1d: K.f[0][2], f2i: K.f[1][0], f2t: K.f[1][1], f2d: K.f[1][2], f3i: K.f[2][0], f3t: K.f[2][1], f3d: K.f[2][2],
      about: `${name} started with a simple idea: ${K.sub(name).replace(/\.$/, '').toLowerCase()}. This page was put together with TribeCode; change any of these words by picking them in the preview.`,
      year: String(new Date().getFullYear()),
    };
    const fill = t => t.replace(/\{\{(\w+)\}\}/g, (all, k) => k in vars ? (k === 'palette' || k === 'accent' ? vars[k] : esc(vars[k])) : all);
    const topIndex = ['index.html', 'public/index.html'].some(f => fs.existsSync(path.join(repo, f)));
    const dirRel = topIndex ? `builds/${slug(name + (r.id === 'landing' ? '' : '-' + r.id))}` : '';
    const dest = dirRel ? path.join(repo, ...dirRel.split('/')) : repo;
    if (dirRel && fs.existsSync(path.join(dest, 'index.html'))) return { built: false, tier: 'recipe', recipe: r.id, exists: true, dir: dirRel, href: dirRel + '/', title: r.title, why: `There's already a ${r.title} at ${dirRel}/. Pick things in the preview to change it, or ask for a new name.` };
    fs.mkdirSync(dest, { recursive: true });
    const files = []; copyTree(path.join(TEMPLATES, ...r.tpl.split('/')), dest, fill, files);
    if (files.length && W.git) {
      const mem = getMembers().find(m => m.id === me.id) || me;
      await W.git(['add', '-A'], repo);
      const g = await W.git([...(W.identity ? W.identity(mem) : []), 'commit', '-q', '-m', `Flint: a ${r.title} for ${name} (free recipe, via TribeCode)`], repo);
      if (g && g.code && !/nothing to commit/i.test((g.out || '') + (g.err || ''))) log(`flint build commit: ${(g.err || g.out || '').slice(0, 160)}`);
    }
    log(`flint free build: ${r.id} -> ${dirRel || '.'} (${files.length} files)`);
    broadcast({ type: 'repo', project: pid });
    return { built: true, tier: 'recipe', recipe: r.id, title: r.title, name, accent, dir: dirRel, href: dirRel ? dirRel + '/' : '', files: files.map(f => (dirRel ? dirRel + '/' : '') + f) };
  }

  // ---------- build history (P1-F): every version is a git commit; restore never rewrites history ----------
  function repoOf(pid, me) {
    const p = P.get(pid); const repo = p && p.repo && W.isRepo(p.repo) ? p.repo : null;
    if (!repo) throw err(404, 'this project has no code repository yet');
    if (!canEdit(me, pid)) throw err(403, 'only builders can change the code');
    return repo;
  }
  const gitOut = async (args, repo) => { const r = await W.git(args, repo); return { code: r.code, out: String(r.out || '').trim(), err: String(r.err || '').trim() }; };
  async function saveDirty(repo, me, msg) {
    const st = await gitOut(['status', '--porcelain'], repo);
    if (!st.out) return false;
    await gitOut(['add', '-A'], repo);
    const mem = getMembers().find(x => x.id === me.id) || me;
    const r = await gitOut([...(W.identity ? W.identity(mem) : []), 'commit', '-q', '-m', msg], repo);
    if (r.code && !/nothing to commit/i.test(r.out + r.err)) throw err(422, (r.err || r.out).slice(0, 200));
    return true;
  }
  async function history(pid, me) {
    const repo = repoOf(pid, me);
    const log = await gitOut(['log', '-n', '20', '--format=%H%x1f%h%x1f%an%x1f%s%x1f%cI'], repo);
    const commits = log.out ? log.out.split('\n').filter(Boolean).map(l => { const [sha, short, author, subject, at] = l.split('\x1f'); return { sha, short, author, subject, at }; }) : [];
    const dirty = (await gitOut(['status', '--porcelain'], repo)).out.split('\n').filter(Boolean).length;
    return { commits, dirty };
  }
  async function restore(pid, me, sha) {
    const repo = repoOf(pid, me);
    if (!/^[0-9a-f]{7,40}$/i.test(String(sha || ''))) throw err(400, 'which version?');
    const ok = await gitOut(['cat-file', '-e', `${sha}^{commit}`], repo); if (ok.code) throw err(404, 'that version isn\'t in this repository');
    const subj = (await gitOut(['log', '-1', '--format=%s', sha], repo)).out.slice(0, 80);
    const saved = await saveDirty(repo, me, 'Save before restoring an earlier version (via TribeCode)');
    const r = await gitOut(['restore', `--source=${sha}`, '--staged', '--worktree', '--', '.'], repo);
    if (r.code) throw err(422, (r.err || r.out).slice(0, 200));
    await saveDirty(repo, me, `Restore the version “${subj}” (${String(sha).slice(0, 7)}) (via TribeCode)`);
    broadcast({ type: 'repo', project: pid });
    log(`flint restore: ${String(sha).slice(0, 7)}`);
    return { restored: String(sha).slice(0, 7), subject: subj, savedFirst: saved, ...(await history(pid, me)) };
  }

  async function route(req, res, { m, a, b, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    try {
      if (a === 'flint' && b === 'tiers' && m === 'GET') { const s = llmStatus() || {}; return send(res, 200, { tiers: TIERS, now: { host: { online: !!s.online, via: s.via || s.model || '' } } }); }
      if (a === 'flint' && b === 'tier' && m === 'POST') { const body = await readBody(req, 4 * 1024).catch(() => ({})); return send(res, 200, classify(body.ask, { picked: !!body.picked })); }
      if (a === 'projects' && parts[2] === 'flint' && parts[3] === 'build' && m === 'POST') {
        if (!P.get(b) || (P.canSee && !P.canSee(me, b))) return fail(res, 404, 'project not found');
        const body = await readBody(req, 4 * 1024).catch(() => ({}));
        return send(res, 200, await build(b, me, body.ask));
      }
      if (a === 'projects' && parts[2] === 'flint' && ['history', 'restore', 'save'].includes(parts[3])) {
        if (!P.get(b) || (P.canSee && !P.canSee(me, b))) return fail(res, 404, 'project not found');
        if (parts[3] === 'history' && m === 'GET') return send(res, 200, await history(b, me));
        const body = await readBody(req, 4 * 1024).catch(() => ({}));
        if (parts[3] === 'restore' && m === 'POST') return send(res, 200, await restore(b, me, body.sha));
        if (parts[3] === 'save' && m === 'POST') { const repo = repoOf(b, me); const did = await saveDirty(repo, me, String(body.message || 'Save a version from the preview (via TribeCode)').slice(0, 120)); if (did) broadcast({ type: 'repo', project: b }); return send(res, 200, { saved: did, ...(await history(b, me)) }); }
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 404, 'no such route');
  }
  return { route, classify, build, TIERS, RECIPES, SITE_RECIPES };
};
module.exports.classify = classify;
module.exports.TIERS = TIERS;
