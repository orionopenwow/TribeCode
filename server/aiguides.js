// What an AI helper needs to design well here (feat/ai-guides, docs/ai/README.md). The rules, the steps and the text
// views are in app/ui/aiguide-core.js (shared with the browser); the guides are docs/ai/*.md, served from
// app/ui/aiguides-data.js (scripts/dev/ai-guides.js writes it). This module adds what needs the tribe's data:
//
//   the project brief   gather(pid, me) -> facts;  briefFor(pid, me, o) -> markdown. Only this project's own data, and only
//                       for someone who can see the project (the callers check: MCP runs in the agent's project, the HTTP
//                       route checks P.canSee). A helper's brief is its person's view, never more.
//   MCP tools           get_guide, project_brief, site_catalog, site_view, site_check, app_catalog, app_view, app_check
//                       (read-only: none of them changes anything). site_propose / app_propose stay where they were
//                       (server/sitedesign.js, server/appcreator.js) and use dryRun() / lint from here.
//   MCP resources       tribecode://guide/{index,website,app,motion}, tribecode://project/brief
//   MCP prompts         design_website, design_app, design_motion
//   HTTP                GET /api/ai-guides                     { guides: [{ id, title, lines }] }
//                       GET /api/ai-guides/<id>                { id, text }           any member
//                       GET /api/projects/<pid>/ai-brief?kind=site|app|motion   { brief, essentials, trimmed, line }
//                                                             members who can see the project (the bridge and Flint use it)
//   the project folder  syncFolder(pid): AGENTS.md (a marked block; a file a person wrote is never touched), CLAUDE.md
//                       (only when there is none), and .tribe/ai/{PROJECT,WEBSITE,APP,MOTION}.md. TRIBE_NO_AI_FILES=1 turns
//                       it off. In a git folder the three are added to .git/info/exclude (this computer only), so the
//                       project's own history is left alone until a person chooses to commit them.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const G = require('../app/ui/aiguide-core.js');
const S = require('../app/ui/sitecfg.js');
const A = require('../app/ui/appcreator-core.js');
const Polish = require('../app/ui/polish.js');
let GUIDES = {}; try { GUIDES = require('../app/ui/aiguides-data.js'); } catch { GUIDES = {}; }
let Kit = null; try { Kit = require('../app/ui/motionsocial.js'); } catch { Kit = null; }

const GUIDE_IDS = { index: 'README', readme: 'README', website: 'WEBSITE', site: 'WEBSITE', web: 'WEBSITE', app: 'APP', phone: 'APP', motion: 'MOTION' };
const TITLES = { README: 'TribeCode for AI agents: start here', WEBSITE: 'Building a website', APP: 'Designing a phone app', MOTION: 'Making a motion graphic' };
const guide = id => { const k = GUIDE_IDS[String(id || '').toLowerCase().replace(/\.md$/, '')]; return k && GUIDES[k] ? { id: k.toLowerCase() === 'readme' ? 'index' : k.toLowerCase(), key: k, text: GUIDES[k] } : null; };
// one section of a guide, by a word in its heading ("steps", "good", "never")
function section(text, want) {
  const parts = String(text).split(/\n(?=## )/), w = String(want || '').toLowerCase();
  return parts.find(p => /^## /.test(p) && p.split('\n')[0].toLowerCase().includes(w)) || '';
}
const kindGuess = (name, vision, site, app) => {
  const t = `${name} ${vision}`.toLowerCase();
  const W = [[/caf[eé]|coffee|bakery|restaurant|bar\b|food truck|kitchen/, 'a place that serves food or drink'], [/shop|store|boutique|merch|market/, 'a shop'], [/game\b|games\b|player|level/, 'a game'], [/podcast|band|album|music|tour\b/, 'music or a show'], [/portfolio|studio|photograph|illustrat|freelanc/, 'a portfolio or studio'], [/nonprofit|charity|volunteer|community|club\b/, 'a cause or a community'], [/saas|platform|dashboard|api\b|software|tool\b|app\b/, 'a software product'], [/course|class|lesson|school|learn/, 'something that teaches'], [/event|conference|wedding|festival|meetup/, 'an event']];
  const hit = W.find(([rx]) => rx.test(t)); const has = [site && 'a website', app && 'a phone app'].filter(Boolean).join(' and ');
  return `${hit ? hit[1] : 'not stated (judge from the vision)'}${has ? `; it has ${has} in TribeCode` : ''}`;
};

module.exports = function aiGuides({ P, base, perms = null, site, app, motion = null, requests = () => null, files = null, readVision = () => '', facts = () => [], tasks = () => [], brain = () => [], nameOf = x => x, members = () => [], log = () => {} }) {
  const safe = pid => String(pid).replace(/[^\w-]/g, '');
  const cur = () => P.current() || P.defaultId();
  const text = (t, isError) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t) }], ...(isError ? { isError: true } : {}) });
  const inP = (pid, fn) => { try { return P.inProject(pid, fn); } catch (e) { log('ai brief: ' + e.message); return undefined; } };

  // ---------- the project brief ----------
  function gather(pid, me) {
    const p = P.get(pid) || {}, d = { name: p.name || '', tagline: p.bio || '' };
    const vision = String(inP(pid, () => readVision()) || '').replace(/^#[^\n]*\n/, '').trim();
    d.vision = vision.split(/\n{2,}/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s && !/^#/.test(s) && !/^(?:[-*]\s*)?(audience|tone|voice|who it(?:'s| is) for)\s*:/i.test(s)).slice(0, 2).join(' ');
    const row = rx => { const m = rx.exec(vision); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
    d.audience = row(/(?:^|\n)\s*(?:[-*]\s*|#+\s*)?(?:audience|who it(?:'s| is) for|for whom|users?)\s*[:\n]\s*([^\n]{3,300})/i);
    let kit = {}; try { kit = site.brandGet(pid) || {}; } catch {}
    d.brand = { name: kit.name || '', colors: kit.colors || {}, fonts: kit.fonts || {}, voice: kit.voice || '', logo: !!kit.logo };
    d.tone = kit.voice || row(/(?:^|\n)\s*(?:[-*]\s*|#+\s*)?(?:tone|voice)\s*[:\n]\s*([^\n]{3,300})/i);
    let cfg = null, doc = null; try { cfg = site.load(pid); } catch {} try { doc = app.load(pid); } catch {}
    if (cfg) { d.site = G.siteSummary(cfg, S); try { const c = S.check(cfg); d.site.problems = c.filter(x => x.level === 'fix').length; d.site.tips = c.length - d.site.problems; } catch {} }
    if (doc) d.app = G.appSummary(doc, A);
    try { if (motion) d.motion = (motion.list(pid) || []).map(x => x.name || x.key); } catch {}
    d.kind = kindGuess(d.name, `${d.tagline} ${d.vision}`, !!cfg, !!doc);
    // project memory: decisions first, then the rest, newest first
    try { const f = (inP(pid, () => facts()) || []).slice().reverse(); d.facts = [...f.filter(x => x.kind === 'decision'), ...f.filter(x => x.kind !== 'decision')].map(x => ({ kind: x.kind, key: x.key, value: x.value })); } catch { d.facts = []; }
    try { d.tasks = (inP(pid, () => tasks()) || []).filter(t => t.status !== 'done' && (!t.project || t.project === pid)).sort((a, b) => (/website|site|app|design|screen|page/i.test(b.title) ? 1 : 0) - (/website|site|app|design|screen|page/i.test(a.title) ? 1 : 0)).slice(0, 10).map(t => ({ id: t.id, status: t.status, title: t.title })); } catch { d.tasks = []; }
    try { d.brain = brain(pid) || []; } catch { d.brain = []; }   // p13 Files · What we know (server/brainhub.js)
    d.comments = [];
    try { (site.comments(pid) || []).filter(c => c.status === 'open').slice(-8).forEach(c => d.comments.push({ on: 'Website', where: c.label || c.blockType || '', text: c.text, by: nameOf(c.by) })); } catch {}
    try { const l = base.readJSON(`.tribe/appdesign/${safe(pid)}.comments.json`, []); (Array.isArray(l) ? l : []).filter(c => c && !c.resolved && c.status !== 'resolved').slice(-6).forEach(c => d.comments.push({ on: 'App', where: c.label || c.screen || '', text: c.text || '', by: nameOf(c.by) })); } catch {}
    try { const rq = requests(); if (rq && me) { const how = rq.how(pid, me) || {}; d.approve = {}; ['site', 'app', 'motion'].forEach(t => { if (how[t]) d.approve[t] = me.role === 'agent' ? (how[t].can ? `${nameOf(me.owner)} approves what you propose.` : how[t].who.length ? `${how[t].who.slice(0, 3).join(', ')} ${how[t].who.length === 1 ? 'approves' : 'approve'} (${how[t].rule === 'council' ? `the council, ${how[t].mark} of ${how[t].of}` : how[t].rule === 'all' ? 'everyone' : 'one of them'}).` : 'nobody can approve this yet.') : how[t].line; }); } } catch {}
    if (me && me.role === 'agent') d.you = { name: me.name, owner: me.owner ? nameOf(me.owner) : '' };
    try { if (files) d.folder = { site: files.has(pid, 'site'), app: files.has(pid, 'app') }; } catch {}
    return d;
  }
  const briefFor = (pid, me, o) => G.brief(gather(pid, me), o);

  // ---------- what a proposal would do, before it is sent (site_propose / app_propose with dry_run, and after every send) ----------
  const siteProblems = cfg => { const c = S.check(cfg); return { fix: c.filter(x => x.level === 'fix'), tips: c.filter(x => x.level !== 'fix') }; };
  const appProblems = doc => { try { return Polish.app(doc, A).map(x => ({ group: x.group, title: x.title, why: x.why, fixable: !!x.run })); } catch { return []; } };
  const checkLine = (kind, design) => {
    if (kind === 'site') { const c = siteProblems(design); return `Check my site on the result: ${c.fix.length} to fix, ${c.tips.length} tip${c.tips.length === 1 ? '' : 's'}${c.fix.length ? ` (${c.fix.slice(0, 4).map(x => x.title).join('; ')}${c.fix.length > 4 ? '; …' : ''})` : ''}.`; }
    const c = appProblems(design); return `The check on the result: ${c.length} thing${c.length === 1 ? '' : 's'} to look at${c.length ? ` (${c.slice(0, 4).map(x => x.title).join('; ')}${c.length > 4 ? '; …' : ''})` : ''}.`;
  };
  const idsLine = (kind, design) => kind === 'site'
    ? 'Sections now (id type/layout):\n' + G.siteSummary(design, S).pages.map(p => `  ${p.title} (${p.slug}): ${p.sections.join(' · ')}`).join('\n')
    : 'Screens now (id: name, then its parts):\n' + G.appSummary(design, A).screens.map(s => `  ${s.id}: ${s.name}${s.tab ? ' (tab)' : ''}: ${s.parts.join(' · ')}`).join('\n');
  // notes on the steps (lint) joined with what was skipped, each with a corrected example
  function notes(kind, ops, design, skipped) {
    const lib = kind === 'site' ? S : A, l = G.lint(kind, ops, design, lib), seen = new Set(l.map(n => n.step));
    (skipped || []).forEach(s => { const m = /^Step (\d+)(?: \(([^)]*)\))?: (.*)$/.exec(s); if (!m || seen.has(+m[1])) return; const x = G.opOf(kind, m[2]); l.push({ step: +m[1], op: m[2] || '', why: m[3], ...(x ? { example: JSON.stringify(x.ex) } : {}) }); });
    return l.sort((a, b) => a.step - b.step);
  }

  // ---------- MCP ----------
  const noSite = 'This project has no website design yet. Start one with site_propose and start: { "template": "<id>" } or { "blank": true } (site_catalog lists the templates); a person approves it.';
  const noApp = 'This project has no app design yet. Start one with app_propose and start: { "template": "<id>" } or { "blank": true } (app_catalog lists the templates); a person approves it.';
  const page = (list, a, per) => { const n = Math.max(1, Math.min(per || 40, Math.round(+a.limit) || per || 40)), from = Math.max(0, Math.round(+a.offset) || 0); return { items: list.slice(from, from + n), total: list.length, ...(from + n < list.length ? { next_offset: from + n } : {}) }; };
  const siteTemplates = () => { try { return site.templates().map(t => ({ id: t.id, title: t.title, group: t.category || '', summary: String(t.summary || '').slice(0, 120) })); } catch { return []; } };
  const PART = { type: 'string' };
  const PROPOSED = { type: 'boolean', description: 'Look at your own waiting proposal (the design as it will be if a person approves it) instead of the saved design' };
  // the saved design, or the caller's own waiting proposal when it asks for that
  const designOf = (kind, a, me) => { if (a && a.proposed) { const rq = requests(), p = rq && rq.pending ? rq.pending(cur(), me, kind) : null; return p ? p.payload : null; } return kind === 'site' ? site.load(cur()) : app.load(cur()); };
  const none = (kind, a) => text(a && a.proposed ? `You have no proposal waiting for the ${kind === 'site' ? 'website' : 'app'} (it was answered, or you have not sent one). Leave proposed out to read the saved design.` : kind === 'site' ? noSite : noApp, true);
  const mcpTools = {
    get_guide: {
      description: 'The master guide for a design tool, written for an AI: how its data is shaped, which tools to call in which order, every step with an example, how to make the result good, a checklist, and what never to do. name: "website", "app", "motion", or "index" for the overview. Read the guide before your first proposal. section (optional) returns one part by a word of its heading, e.g. "steps", "good", "done", "never".',
      inputSchema: { type: 'object', properties: { name: { type: 'string', enum: ['index', 'website', 'app', 'motion'], description: 'Which guide' }, section: { type: 'string', description: 'Only the part whose heading holds this word' } }, required: ['name'], additionalProperties: false },
      run: async (a = {}) => { const g = guide(a.name); if (!g) return text('Guides are: index, website, app, motion.', true); if (a.section) { const s = section(g.text, a.section); return s ? text(s) : text(`No part of the ${g.id} guide has “${String(a.section).slice(0, 30)}” in its heading. Headings: ${g.text.split('\n').filter(l => /^## /.test(l)).map(l => l.slice(3)).join(' · ')}`, true); } return text(g.text); },
    },
    project_brief: {
      description: 'What this project is, in one page: its name, the vision, what kind of thing it is, audience, tone, the brand kit (colours, fonts, voice), what exists (website pages and sections, app screens, motion graphics), facts and decisions from the project\'s memory, open tasks and comments on the designs, and who approves what you propose. Call it before you design or write anything, and write from it: a fact that is not in it is a question for the person, never something to invent. short: true gives the first half only.',
      inputSchema: { type: 'object', properties: { short: { type: 'boolean', description: 'Vision, brand kit and who approves only' } }, additionalProperties: false },
      run: async (a = {}, me) => text(briefFor(cur(), me, { short: !!a.short })),
    },
    site_catalog: {
      description: 'What a website can be built from: every section type with its layouts (variants) and the words it holds (props), the looks, font pairs, illustrations, the templates a new site can start from, and every step site_propose accepts with an example. part picks one list: blocks, looks, fonts, illustrations, icons, templates, steps (default: all but icons and templates). templates and icons are paged with limit and offset.',
      inputSchema: { type: 'object', properties: { part: { type: 'string', enum: ['blocks', 'looks', 'fonts', 'illustrations', 'icons', 'templates', 'steps'] }, limit: { type: 'number' }, offset: { type: 'number' } }, additionalProperties: false },
      run: async (a = {}) => { const c = G.catalog('site', S); c.templates = siteTemplates(); if (a.part === 'templates' || a.part === 'icons') return text({ [a.part]: page(c[a.part], a, a.part === 'icons' ? 200 : 40) }); if (a.part) return text({ [a.part]: c[a.part] }); delete c.icons; delete c.templates; return text({ ...c, more: 'part: "templates" and part: "icons" list those. get_guide("website") says how to choose.' }); },
    },
    site_view: {
      description: 'The website as a person reads it, in plain text: each section in order with its id, layout, background, words, buttons with where they go, and picture slots. device: "desktop" (default), "tablet" or "phone" shows what is hidden at that size and flags what gets long on a phone. page: a page id, slug or title (default: the first page). proposed: true shows your waiting proposal. Use it to judge your work the way a visitor would; use site_read for the exact ids and props.',
      inputSchema: { type: 'object', properties: { page: PART, device: { type: 'string', enum: ['desktop', 'tablet', 'phone'] }, full: { type: 'boolean', description: 'Every entry of long lists (default: the first 8)' }, proposed: PROPOSED }, additionalProperties: false },
      run: async (a = {}, me) => { const cfg = designOf('site', a, me); return cfg ? text(G.siteText(cfg, S, a)) : none('site', a); },
    },
    site_check: {
      description: '“Check my site”, the same list the person sees under the Check tab: what should be fixed before it goes live (buttons and forms that go nowhere, missing descriptions, colours that do not read, empty sections) and tips (example words left in, placeholder pictures, long words on phones). Each item names its page and section id; items with fix_ops can be fixed by sending those steps to site_propose. proposed: true checks your waiting proposal before a person has answered it.',
      inputSchema: { type: 'object', properties: { level: { type: 'string', enum: ['fix', 'tip'], description: 'Only this level' }, proposed: PROPOSED }, additionalProperties: false },
      run: async (a = {}, me) => { const cfg = designOf('site', a, me); if (!cfg) return none('site', a); const c = S.check(cfg).filter(x => !a.level || x.level === a.level); return text({ fix: c.filter(x => x.level === 'fix').length, tips: c.filter(x => x.level !== 'fix').length, items: c.slice(0, 60).map(x => ({ level: x.level, title: x.title, text: x.text, ...(x.page ? { page: x.page } : {}), ...(x.block ? { block: x.block } : {}), ...(x.fix ? { fix: x.fix.label, fix_ops: x.fix.ops } : {}) })) }); },
    },
    app_catalog: {
      description: 'What a phone app design can be built from: every part with the words it holds, the kits (ready-made screens and flows), looks, fonts, pictures, the templates a new app can start from, and every step app_propose accepts with an example. part picks one list: parts, kits, looks, fonts, icons, pictures, templates, steps (default: all but icons and templates).',
      inputSchema: { type: 'object', properties: { part: { type: 'string', enum: ['parts', 'kits', 'looks', 'fonts', 'icons', 'pictures', 'templates', 'steps'] }, limit: { type: 'number' }, offset: { type: 'number' } }, additionalProperties: false },
      run: async (a = {}) => { const c = G.catalog('app', A); if (a.part === 'templates' || a.part === 'kits' || a.part === 'looks') return text({ [a.part]: page(c[a.part], a, 80) }); if (a.part) return text({ [a.part]: c[a.part] }); delete c.icons; delete c.templates; return text({ ...c, more: 'part: "templates" and part: "icons" list those. get_guide("app") says how to choose.' }); },
    },
    app_view: {
      description: 'The phone app design as a person reads it, in plain text: every screen with its parts, their words, where each tap goes, the first screen, and screens nothing leads to. screen: a screen id or name for one screen (default: all). proposed: true shows your waiting proposal. Use it to judge your work; use app_read for the exact ids and props.',
      inputSchema: { type: 'object', properties: { screen: PART, full: { type: 'boolean', description: 'Every entry of long lists (default: the first 6)' }, proposed: PROPOSED }, additionalProperties: false },
      run: async (a = {}, me) => { const doc = designOf('app', a, me); return doc ? text(G.appText(doc, A, a)) : none('app', a); },
    },
    app_check: {
      description: 'What a careful designer would point out in the app design: buttons that go nowhere, screens nothing opens, empty parts, colour that does not read, uneven spacing. The same rules as “Polish it” in App Creator. proposed: true checks your waiting proposal. Fix what you can with app_propose.',
      inputSchema: { type: 'object', properties: { proposed: PROPOSED }, additionalProperties: false },
      run: async (a = {}, me) => { const doc = designOf('app', a, me); if (!doc) return none('app', a); const c = appProblems(doc); return text({ count: c.length, items: c.slice(0, 60) }); },
    },
  };

  // ---------- MCP resources and prompts ----------
  const resources = {
    list: () => [
      ...['index', 'website', 'app', 'motion'].map(id => ({ uri: `tribecode://guide/${id}`, name: `guide-${id}`, title: TITLES[guide(id).key], description: id === 'index' ? 'Where to start as an AI in TribeCode.' : `The master guide for the ${id} tool: data, tools in order, steps, how to make it good, checklist.`, mimeType: 'text/markdown' })),
      { uri: 'tribecode://project/brief', name: 'project-brief', title: 'Project brief', description: 'What this project is: vision, audience, brand kit, what exists, facts, tasks, who approves.', mimeType: 'text/markdown' },
    ],
    read: (uri, me) => { const m = /^tribecode:\/\/guide\/([a-z]+)$/.exec(String(uri || '')); if (m && guide(m[1])) return guide(m[1]).text; if (uri === 'tribecode://project/brief') return briefFor(cur(), me, {}); return null; },
  };
  const prompts = {
    list: () => ['website', 'app', 'motion'].map(k => ({ name: `design_${k}`, title: k === 'website' ? 'Work on the website' : k === 'app' ? 'Work on the phone app' : 'Make a motion graphic', description: `The project brief and the ${k} guide, then your request.`, arguments: [{ name: 'ask', description: 'What should be built or changed', required: false }] })),
    get: (name, args, me) => { const m = /^design_(website|app|motion)$/.exec(String(name || '')); if (!m) return null; const g = guide(m[1]); const ask = String((args && args.ask) || '').slice(0, 2000) || (m[1] === 'motion' ? 'Suggest a motion graphic that fits this project and make it.' : `Make the ${m[1]} better: read it, say what you would change and why, then propose it.`); return { description: `Work on the ${m[1]}`, messages: [{ role: 'user', content: { type: 'text', text: `${briefFor(cur(), me, {})}\n\n---\n\n${g.text}\n\n---\n\nThe request: ${ask}` } }] }; },
  };

  // ---------- the project folder ----------
  const OFF = () => process.env.TRIBE_NO_AI_FILES === '1' || !files || !files.home;
  const NOTE = '<!-- written by TribeCode; safe to change or delete -->';
  function exclude(dir, names) {   // this computer only: the project's own history is not touched
    try {
      let g = path.join(dir, '.git'); const st = fs.lstatSync(g); if (!st.isDirectory()) return;
      const f = path.join(g, 'info', 'exclude'); let cur = ''; try { cur = fs.readFileSync(f, 'utf8'); } catch {}
      const add = names.filter(n => !cur.split(/\r?\n/).includes(n)); if (!add.length) return;
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n');
    } catch {}
  }
  const plainFile = f => { try { const st = fs.lstatSync(f); return st.isFile() ? fs.readFileSync(f, 'utf8') : false; } catch { return null; } };   // null: none · false: not a plain file (leave it)
  const put = (f, t) => { const was = plainFile(f); if (was === false || was === t) return false; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); return true; };
  function syncFolder(pid) {
    if (OFF() || !P.get(pid)) return { ok: false, off: true };
    let dir; try { dir = files.home(pid).dir; } catch { return { ok: false }; }
    const d = gather(pid, null), wrote = [], mine = [];
    try {
      const ai = path.join(dir, '.tribe', 'ai');
      try { if (fs.lstatSync(path.join(dir, '.tribe')).isSymbolicLink() || fs.lstatSync(ai).isSymbolicLink()) return { ok: false }; } catch {}
      const briefText = `${NOTE}\n${G.brief(d, {})}\n`;
      if (put(path.join(ai, 'PROJECT.md'), briefText)) wrote.push('.tribe/ai/PROJECT.md');
      for (const k of ['WEBSITE', 'APP', 'MOTION']) if (GUIDES[k] && put(path.join(ai, `${k}.md`), GUIDES[k])) wrote.push(`.tribe/ai/${k}.md`);
      mine.push('.tribe/ai/');
      const af = path.join(dir, 'AGENTS.md'), old = plainFile(af);
      if (old !== false) { const next = G.mergeBlock(old, G.folderBlock(d), 'Notes for AI agents'); if (next != null) { if (old == null) mine.push('AGENTS.md'); if (next !== old) { fs.writeFileSync(af, next); wrote.push('AGENTS.md'); } } }
      const cf = path.join(dir, 'CLAUDE.md');
      if (plainFile(cf) == null && plainFile(af)) { fs.writeFileSync(cf, `@AGENTS.md\n\n${NOTE}\n`); wrote.push('CLAUDE.md'); mine.push('CLAUDE.md'); }
      exclude(dir, mine);
    } catch (e) { log('ai folder files: ' + e.message); return { ok: false, error: e.message }; }
    return { ok: true, dir, wrote };
  }
  const timers = new Map();
  function queueFolder(pid, ms) { if (OFF()) return; clearTimeout(timers.get(pid)); const t = setTimeout(() => { timers.delete(pid); try { syncFolder(pid); } catch (e) { log('ai folder files: ' + e.message); } }, ms == null ? 1500 : ms); if (t.unref) t.unref(); timers.set(pid, t); }

  // ---------- HTTP ----------
  async function route(req, res, { a, b, c, m, me, url, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m !== 'GET') return fail(res, 405, 'read only');
    if (a === 'ai-guides') {
      if (!b) return send(res, 200, { guides: ['index', 'website', 'app', 'motion'].map(id => ({ id, title: TITLES[guide(id).key], lines: guide(id).text.split('\n').length })) });
      const g = guide(b); return g ? send(res, 200, { id: g.id, text: g.text }) : fail(res, 404, 'no such guide');
    }
    if (a === 'projects' && c === 'ai-brief') {
      if (!P.get(b) || (P.canSee && !P.canSee(me, b))) return fail(res, 404, 'project not found');
      const kind = G.kindOf((url && url.searchParams.get('kind')) || 'site') || 'site', d = gather(b, me);
      return send(res, 200, { kind, brief: G.brief(d, {}), short: G.brief(d, { short: true }), essentials: G.essentials(kind), trimmed: G.trimmed(kind), line: G.briefLine(d) });
    }
    return fail(res, 404, 'not found');
  }
  return { mcpTools, resources, prompts, route, gather, briefFor, guide, section, notes, checkLine, idsLine, siteProblems, appProblems, siteTemplates, syncFolder, queueFolder, G };
};
