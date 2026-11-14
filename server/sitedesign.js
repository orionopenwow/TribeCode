// The website designer's server side (feat/flint-site; the model is app/ui/sitecfg.js, the UI app/ui/sitedesigner.js).
// One JSON config per project is the source of truth; versions on the Saved shelf keep it (server/siteflint.js useConfig).
//   GET  /api/site-designer/templates                 { templates: [{ id, title, summary, category, tags, thumb, source?, license? }], categories }
//                                                     the 16 TribeCode templates + the imported open-source ones (app/ui/sitetpl/catalog.json)
//   GET  /api/site-designer/template/:id              { config }  the template as a config, its pictures inlined (data: URLs)
//   GET  /api/projects/:id/site-config                { config | null, rev, canEdit }
//   PUT  /api/projects/:id/site-config  { config, base?, force? }   builders (not spectators); <= 6 MB, normalized.
//                                                     feat/site-v2: versioned. base = the rev the editor started from; a newer
//                                                     rev on disk answers 409 { conflict, config, rev, by } unless force.
//   POST /api/projects/:id/site-config/publish        writes the site to the project's site/ folder (one HTML file per page,
//                                                     assets/, fonts/): host, project lead or builder
//   GET  /api/projects/:id/site-autofill              feat/site-v2: what the project knows, for sitecfg.fill(): name, tagline,
//                                                     mission (vision), members + roles, building (open tasks, milestones),
//                                                     hours/dates/links/email/phone/address from recent chat, the board's
//                                                     accent and pictures, the logo. Local extraction (aibasics-core).
//   GET  /api/projects/:id/site-comments              feat/site-v2: { comments, canEdit }
//   POST /api/projects/:id/site-comments  { page, block, blockType, label, text, x, y }   any member: a pin on a section
//   POST /api/projects/:id/site-comments/:cid/resolve · /reopen       the author, or a builder
//   DELETE /api/projects/:id/site-comments/:cid                         the author, or a builder
//   POST /api/projects/:id/site-comments/tasks        builders: open comments grouped per section -> one task each (linked
//                                                     to the block, assigned per the project's task mode); resolving the task
//                                                     resolves its comments (onTask, called from saveTask)
//   MCP: site_comments, site_comments_to_tasks
//   feat/design-site2:
//   GET|PUT  /api/projects/:id/brand                     the brand kit (logo, colours, fonts, voice) shared with the canvas
//   GET      /api/projects/:id/site-proposals            changes an agent proposed, waiting for a person
//   POST     /api/projects/:id/site-proposals/:pid/applied|declined   a person's answer (the designer applies it as one undo step)
//   MCP: site_read (the site as an outline), site_propose (a list of safe steps; nothing changes until a person approves)
// Stored in .tribe/website/<pid>.config.json and <pid>.comments.json. Plain files; no AI needed anywhere.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const S = require('../app/ui/sitecfg.js');
const AI = require('../app/ui/aibasics-core.js');

module.exports = function siteDesign({ base, root, showcase, siteFlint, P, tasks, nameOf = x => x, members = () => [], inspo, postChat, broadcast, log = () => {} }) {
  const LIB = path.join(root, 'templates', 'sites');
  const UI = [path.join(root, 'app', 'ui'), path.join(root, 'ui')].find(d => fs.existsSync(path.join(d, 'sitecfg.js'))) || path.join(root, 'app', 'ui');
  const FONTS = path.join(UI, 'assets', 'site-fonts');
  const GAL = path.join(UI, 'sitetpl');
  const err = (status, m) => Object.assign(new Error(m), { status });
  const safe = pid => String(pid).replace(/[^\w-]/g, '');
  const file = pid => `.tribe/website/${safe(pid)}.config.json`;
  const cfile = pid => `.tribe/website/${safe(pid)}.comments.json`;
  const pfile = pid => `.tribe/website/${safe(pid)}.proposals.json`;
  const bfile = pid => `.tribe/website/${safe(pid)}.brand.json`;
  const loadP = pid => { const l = base.readJSON(pfile(pid), []); return Array.isArray(l) ? l : []; };
  const saveP = (pid, l) => base.writeJSON(pfile(pid), l.slice(-40));
  const brandGet = pid => S.kitNormalize(base.readJSON(bfile(pid), null));
  const brandSet = (pid, kit, me) => { const k = S.kitNormalize(kit); try { fs.mkdirSync(path.dirname(base.p(bfile(pid))), { recursive: true }); } catch {} base.writeJSON(bfile(pid), { ...k, savedBy: me ? me.id : '', savedAt: new Date().toISOString() }); try { if (broadcast) broadcast({ type: 'brand-kit', project: pid }); } catch {} return k; };
  // an agent's proposal: the steps are tried on a copy right away, so the person sees in words what would change
  function propose(pid, me, { note, ops }) {
    const cfg = load(pid); if (!cfg) throw err(404, 'this project has no website design yet: a person starts one in the website designer');
    if (!Array.isArray(ops) || !ops.length) throw err(400, 'ops must be a list of steps');
    const r = S.applyOps(cfg, ops); if (!r.done.length) throw err(400, `none of the steps could be applied: ${r.skipped.join('; ') || 'nothing to do'}`);
    const raw = loadRaw(pid), l = loadP(pid);
    const rec = { id: 'sp' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), by: me ? me.id : 'agent', at: new Date().toISOString(), note: String(note || '').slice(0, 400), ops: JSON.parse(JSON.stringify(ops)).slice(0, 60), done: r.done, skipped: r.skipped, rev: (raw && raw.rev) || 0, status: 'open' };
    l.forEach(x => { if (x.status === 'open' && x.by === rec.by) x.status = 'replaced'; });   // one open proposal per helper
    l.push(rec); saveP(pid, l);
    try { if (broadcast) broadcast({ type: 'site-proposal', project: pid, id: rec.id }); } catch {}
    return rec;
  }
  const pview = x => ({ id: x.id, by: x.by, byName: nameOf(x.by), at: x.at, note: x.note, ops: x.ops, done: x.done, skipped: x.skipped, status: x.status, rev: x.rev });
  const loadRaw = pid => base.readJSON(file(pid), null);
  const load = pid => { const c = loadRaw(pid); if (c) { delete c.rev; delete c.savedBy; delete c.savedAt; } return c; };
  const save = (pid, cfg, me) => { const old = loadRaw(pid); const c = S.normalize(cfg); delete c.rev; delete c.savedBy; delete c.savedAt; const rec = { ...c, rev: ((old && old.rev) || 0) + 1, savedBy: me ? me.id : (old && old.savedBy) || '', savedAt: new Date().toISOString() }; base.writeJSON(file(pid), rec); return { config: c, rev: rec.rev }; };
  if (siteFlint && siteFlint.useConfig) siteFlint.useConfig({ load, save: (pid, cfg) => save(pid, cfg).config });
  const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
  const inlineFile = (dir, rel) => {
    if (!rel || /^(https?:|data:)/.test(rel)) return rel || '';
    const f = path.resolve(dir, rel); if (!f.startsWith(dir + path.sep)) return '';
    const ext = path.extname(f).slice(1).toLowerCase(); if (!MIME[ext]) return '';
    try { const b = fs.readFileSync(f); return b.length > 400 * 1024 ? '' : `data:${MIME[ext]};base64,${b.toString('base64')}`; } catch { return ''; }
  };

  // ---------- the template gallery ----------
  let CAT = null;
  function catalog() {
    if (CAT) return CAT;
    try { CAT = JSON.parse(fs.readFileSync(path.join(GAL, 'catalog.json'), 'utf8')); } catch { CAT = null; }
    if (!CAT) CAT = { templates: S.TEMPLATES.map(id => { try { const m = JSON.parse(fs.readFileSync(path.join(LIB, id, 'site.json'), 'utf8')).meta || {}; return { id, title: m.title || id, summary: m.summary || '', category: m.category || '', tags: m.tags || [], order: m.order || 99 }; } catch { return null; } }).filter(Boolean).sort((a, b) => a.order - b.order), categories: [] };
    return CAT;
  }
  const templates = () => catalog().templates;
  function template(id) {
    id = String(id || '');
    if (S.TEMPLATES.includes(id)) { const dir = path.join(LIB, id), d = JSON.parse(fs.readFileSync(path.join(dir, 'site.json'), 'utf8')); return S.fromTemplate(id, d, rel => inlineFile(dir, rel)); }
    if (!/^[a-z0-9-]{2,60}$/.test(id) || !templates().some(t => t.id === id)) throw err(404, 'no template by that name');
    const cfg = JSON.parse(fs.readFileSync(path.join(GAL, id + '.json'), 'utf8'));
    const walk = o => { if (Array.isArray(o)) return o.forEach(walk); if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { if ((k === 'img' || k === 'logo') && typeof o[k] === 'string' && o[k] && !/^data:/.test(o[k])) o[k] = inlineFile(UI, o[k]); else walk(o[k]); } };
    walk(cfg); return S.normalize(cfg);
  }
  function publish(pid) {
    const cfg = load(pid); if (!cfg) throw err(409, 'design the site first');
    const dir = showcase.siteDir(pid).dir; fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    const ex = S.exportFiles(cfg, 'zip'); const written = [];
    for (const [f, text] of Object.entries(ex.files)) { fs.writeFileSync(path.join(dir, f), text); written.push(f); }
    for (const a of ex.assets) { const bytes = S.dataToBytes(a.src); if (bytes) { fs.writeFileSync(path.join(dir, a.path), Buffer.from(bytes)); written.push(a.path); } }
    if (fs.existsSync(FONTS) && ex.fonts.length) { fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true }); for (const f of ex.fonts) for (const n of [f.file, f.license]) { try { fs.copyFileSync(path.join(FONTS, n), path.join(dir, 'fonts', n)); written.push('fonts/' + n); } catch {} } }
    return { ok: true, dir: showcase.siteDir(pid).shown.replace(/index\.html.*$/, ''), files: written };
  }

  // ---------- auto-populate: what the project knows ----------
  async function facts(pid) {
    const p = (P && P.get(pid)) || {}; const F = { name: p.name || '', tagline: p.bio || '' };
    try {
      const g = await showcase.gather(pid);
      if (g.vision) F.mission = String(g.vision).split(/\n{2,}/).map(s => s.trim()).filter(Boolean).slice(0, 2).join('\n\n').slice(0, 900);
      F.members = (g.people || []).map(x => ({ name: x.name, role: (x.roles || []).join(', ') }));
      const ms = (g.milestones || []).filter(m => m.status !== 'done').slice(0, 3).map(m => ({ title: m.title, text: m.version ? `Milestone ${m.version}` : 'Next milestone' }));
      F.building = ms;
    } catch (e) { log('site-autofill gather: ' + e.message); }
    try { const open = (tasks && tasks.load ? tasks.load() : []).filter(t => t.status !== 'done' && (!t.project || t.project === pid)).slice(0, 12); F.building = (F.building || []).concat(open.filter(t => !/^website:/i.test(t.title)).slice(0, 6 - (F.building || []).length).map(t => ({ title: t.title, text: t.status === 'doing' ? 'In progress now' : 'Coming up' }))); } catch {}
    try { const st = P.scopedStore(() => pid); const msgs = st.readJSONL('chat/general.jsonl', 400).filter(x => !x.deleted && x.by !== 'tribecode' && x.text).map(x => ({ who: nameOf(x.by), text: x.text, at: x.at })); Object.assign(F, AI.siteFacts(msgs)); } catch (e) { log('site-autofill chat: ' + e.message); }
    try { if (inspo) { const v = inspo.view(pid); if (v && v.palette && v.palette.accent) F.accent = v.palette.accent; F.images = (v.items || []).filter(x => (x.kind || 'image') === 'image' && x.thumb).slice(0, 6).map(x => x.thumb); } } catch {}
    try { const b = showcase.brandView ? showcase.brandView(pid) : null; if (b && b.logo && b.logo.url) F.logo = b.logo.url; } catch {}
    return F;
  }

  // ---------- comments -> tasks ----------
  const loadC = pid => base.readJSON(cfile(pid), []);
  const saveC = (pid, l) => base.writeJSON(cfile(pid), l.slice(-500));
  const cid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const view = (c) => ({ ...c, byName: nameOf(c.by) });
  function addComment(pid, me, body) {
    const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 600); if (!text) throw err(400, 'say what should change');
    const c = { id: cid(), page: String(body.page || '').slice(0, 40), block: String(body.block || '').slice(0, 40), blockType: String(body.blockType || '').slice(0, 20), label: String(body.label || '').slice(0, 80), text, by: me.id, at: new Date().toISOString(), x: Math.max(0, Math.min(100, +body.x || 0)), y: Math.max(0, +body.y || 0), status: 'open', from: body.from === 'preview' ? 'preview' : 'designer' };
    const l = loadC(pid); l.push(c); saveC(pid, l);
    const open = l.filter(x => x.status === 'open').length;
    try { if (broadcast) broadcast({ type: 'site-comments', project: pid }); } catch {}
    return { comment: view(c), open };
  }
  function setStatus(pid, me, id, status, canEdit) {
    const l = loadC(pid), c = l.find(x => x.id === id); if (!c) throw err(404, 'no such comment');
    if (c.by !== me.id && !canEdit) throw err(403, 'only the author or a builder can do that');
    if (status === 'delete') { saveC(pid, l.filter(x => x !== c)); return { ok: true }; }
    c.status = status; if (status === 'resolved') { c.resolvedBy = me.id; c.resolvedAt = new Date().toISOString(); } else { delete c.resolvedBy; delete c.resolvedAt; }
    saveC(pid, l); return { comment: view(c) };
  }
  // one task per section with open comments; Lead mode: a lead's request assigns them to whoever last saved the design
  // (they accept or decline); Council mode (or anyone else asking): open to claim, unassigned
  async function toTasks(pid, me, { titles } = {}) {
    if (!tasks || !tasks.create) throw err(501, 'tasks are not available here');
    const l = loadC(pid), open = l.filter(x => x.status === 'open');
    if (!open.length) return { tasks: [], groups: 0, say: 'No open comments to turn into tasks.' };
    const groups = AI.groupComments(open.map(c => ({ ...c, byName: nameOf(c.by) })));
    const flow = tasks.flow, mode = flow && flow.settings ? flow.settings().mode : 'lead', lead = !!(flow && flow.isLead && flow.isLead(me));
    const cfg = loadRaw(pid), owner = cfg && cfg.savedBy && members().some(m => m.id === cfg.savedBy) ? cfg.savedBy : null;
    const made = [];
    groups.forEach((g, i) => {
      const t = tasks.create({ title: (titles && titles[i]) || g.title, by: me.id, body: g.body, source: 'website', type: 'build' });
      t.site = { project: pid, page: g.page, block: g.block, comments: g.ids };
      if (mode !== 'council' && lead && owner && owner !== me.id) { t.assignee = owner; if (flow.assigned) flow.assigned(t, null, me); }
      tasks.save(t); made.push(t);
      g.ids.forEach(id => { const c = l.find(x => x.id === id); if (c) { c.status = 'tasked'; c.task = t.id; } });
    });
    saveC(pid, l);
    try { if (postChat) postChat('general', 'tribecode', `🗒 Flint turned ${open.length} website comment${open.length === 1 ? '' : 's'} into ${made.length} task${made.length === 1 ? '' : 's'}${mode === 'council' ? ', open to claim' : ''}: ${made.map(t => `“${t.title}”`).join(', ')}.`); } catch {}
    return { tasks: made, groups: groups.length, mode, say: `Made ${made.length} task${made.length === 1 ? '' : 's'} from ${open.length} comment${open.length === 1 ? '' : 's'}, one per section${mode === 'council' ? ' (Council mode: open to claim)' : made.some(t => t.assignee) ? `, assigned to ${nameOf(made.find(t => t.assignee).assignee)} to accept` : ' (a lead assigns them)'}.` };
  }
  // saveTask hook: a website task marked done resolves its comments (and reopening it reopens them)
  function onTask(t) {
    if (!t || !t.site || !t.site.project) return;
    const l = loadC(t.site.project); let n = 0;
    for (const c of l) if (c.task === t.id) { const want = t.status === 'done' ? 'resolved' : 'tasked'; if (c.status !== want) { c.status = want; n++; if (want === 'resolved') { c.resolvedAt = new Date().toISOString(); c.resolvedBy = t.updatedBy || t.assignee || ''; } } }
    if (n) { saveC(t.site.project, l); try { if (broadcast) broadcast({ type: 'site-comments', project: t.site.project }); } catch {} }
  }

  async function route(req, res, { m, a, b, c, d, parts = [], me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    const canEdit = !!me && me.role !== 'spectator' && me.role !== 'guest';
    try {
      if (a === 'site-designer') {
        if (b === 'templates' && m === 'GET') { const k = catalog(); return send(res, 200, { templates: k.templates, categories: k.categories || [] }); }
        if (b === 'template' && c && m === 'GET') return send(res, 200, { config: template(c) });
        return fail(res, 404, 'not found');
      }
      if (a === 'projects' && c === 'site-config') {
        if (!d && m === 'GET') { const r = loadRaw(b); return send(res, 200, { config: load(b), rev: (r && r.rev) || 0, savedBy: r && r.savedBy ? nameOf(r.savedBy) : '', savedAt: (r && r.savedAt) || '', canEdit }); }
        if (!canEdit) return fail(res, 403, 'spectators are read-only');
        if (!d && m === 'PUT') {
          const body = await readBody(req, 6 * 1024 * 1024); if (!body || typeof body.config !== 'object') return fail(res, 400, 'config missing');
          const cur = loadRaw(b);
          if (cur && body.base != null && !body.force && +body.base !== (cur.rev || 0) && cur.savedBy !== me.id + '#never') { const cc = { ...cur }; delete cc.rev; delete cc.savedBy; delete cc.savedAt; if (JSON.stringify(S.normalize(cc)) !== JSON.stringify(S.normalize(JSON.parse(JSON.stringify(body.config))))) return send(res, 409, { conflict: true, config: cc, rev: cur.rev || 0, by: nameOf(cur.savedBy), at: cur.savedAt }); }
          const r = save(b, body.config, me); return send(res, 200, { ok: true, config: r.config, rev: r.rev });
        }
        if (d === 'publish' && m === 'POST') return send(res, 200, publish(b));
      }
      if (a === 'projects' && c === 'site-autofill' && m === 'GET') return send(res, 200, { facts: await facts(b) });
      if (a === 'projects' && c === 'brand') {
        if (m === 'GET') return send(res, 200, { kit: brandGet(b), canEdit });
        if (m === 'PUT') { if (!canEdit) return fail(res, 403, 'spectators are read-only'); const body = await readBody(req, 600 * 1024); return send(res, 200, { ok: true, kit: brandSet(b, (body && body.kit) || {}, me) }); }
      }
      if (a === 'projects' && c === 'site-proposals') {
        const e = parts[4];
        if (!d && m === 'GET') return send(res, 200, { proposals: loadP(b).filter(x => x.status === 'open').map(pview), canEdit });
        if (d && m === 'POST' && (e === 'applied' || e === 'declined')) {
          if (!canEdit || me.role === 'agent') return fail(res, 403, 'a person answers a proposal');
          const l = loadP(b), x = l.find(y => y.id === d); if (!x) return fail(res, 404, 'that proposal is gone');
          x.status = e; x.answeredBy = me.id; x.answeredAt = new Date().toISOString(); saveP(b, l);
          try { if (broadcast) broadcast({ type: 'site-proposal', project: b, id: x.id }); } catch {}
          return send(res, 200, { ok: true });
        }
      }
      if (a === 'projects' && c === 'site-comments') {
        const e = parts[4];
        if (!d && m === 'GET') return send(res, 200, { comments: loadC(b).map(view), canEdit });
        if (!d && m === 'POST') { if (me.role === 'guest') return fail(res, 403, 'join the tribe to comment'); return send(res, 200, addComment(b, me, (await readBody(req)) || {})); }
        if (d === 'tasks' && m === 'POST') { if (!canEdit) return fail(res, 403, 'spectators are read-only'); const body = (await readBody(req)) || {}; return send(res, 200, await toTasks(b, me, { titles: Array.isArray(body.titles) ? body.titles.map(x => String(x || '').slice(0, 200)) : null })); }
        if (d && m === 'DELETE') return send(res, 200, setStatus(b, me, d, 'delete', canEdit));
        if (d && m === 'POST' && (e === 'resolve' || e === 'reopen')) return send(res, 200, setStatus(b, me, d, e === 'resolve' ? 'resolved' : 'open', canEdit));
      }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  const text = (t, isError) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
  const cur = a => (a && a.project) || (P && (P.current() || P.defaultId()));
  const mcpTools = {
    site_comments: {
      description: 'List the comments people dropped on sections of the project website (in the website designer or the website preview): what they want changed, on which section, and whether it is open, tasked or resolved.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, open: { type: 'boolean', description: 'only open ones' } }, additionalProperties: false },
      run: async (a = {}) => { const l = loadC(cur(a)).filter(c => !a.open || c.status === 'open'); return text(l.length ? l.map(c => `[${c.status}] ${c.label || c.blockType || 'section'} (${c.block}): “${c.text}” · ${nameOf(c.by)}${c.task ? ` · task ${c.task}` : ''}`).join('\n') : 'No comments on the website.'); },
    },
    site_read: {
      description: 'Read the project website as an outline: its pages, each section (block) with its id, type, layout variant and words, the theme, and which block types, looks and font pairs exist. Use it before site_propose. Pictures are left out.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' } }, additionalProperties: false },
      run: async (a = {}) => { const cfg = load(cur(a)); if (!cfg) return text('This project has no website design yet. A person starts one in the website designer (Files › Website).', true); return text(JSON.stringify(S.outline(cfg))); },
    },
    site_propose: {
      description: 'Propose changes to the project website as a list of safe steps. Nothing changes until a person approves the proposal in the website designer, where it becomes one undo step. Steps (each { op, … }): text { block, path, value } (path like "title", "text", "items.0.title", "buttons.0.label"); add { type, variant?, page?, after?: blockId, props?: words only }; remove { block }; move { block, to: "up"|"down"|"top"|"bottom"|index }; variant { block, variant }; style { block, bg: ""|"card"|"accent"|"ink", pad: ""|"s"|"l" }; link { block, path, kind: "page"|"section"|"url"|"email", to }; alt { block, path, value }; theme { preset }; palette { preset }; accent { color: "#RRGGBB" }; fonts { pair }; space { value: "compact"|"normal"|"roomy" }; radius { value }; page { title }; rename { page, title }; seo { title?, description? }. Pictures cannot be set. Steps that do not fit are skipped and named in the answer.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, note: { type: 'string', description: 'one or two sentences for the person: what you changed and why' }, ops: { type: 'array', items: { type: 'object' }, maxItems: 60 } }, required: ['ops'], additionalProperties: false },
      run: async (a = {}, me) => { try { const r = propose(cur(a), me || { id: 'agent', role: 'agent' }, a); return text(`Proposed ${r.done.length} change${r.done.length === 1 ? '' : 's'}; a person approves them in the website designer.\n${r.done.map(x => '- ' + x).join('\n')}${r.skipped.length ? `\nSkipped:\n${r.skipped.map(x => '- ' + x).join('\n')}` : ''}`); } catch (e) { return text(e.message, true); } },
    },
    site_comments_to_tasks: {
      description: 'Summarize the open website comments into tasks, one per section, linked to the block and assigned per the project\'s task mode (Lead or Council). Finishing a task resolves its comments.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' } }, additionalProperties: false },
      run: async (a = {}, me) => { try { const r = await toTasks(cur(a), me || { id: 'agent', role: 'agent' }); return text(r.say); } catch (e) { return text(e.message, true); } },
    },
  };
  return { propose, proposals: loadP, brandGet, brandSet, route, load, save: (pid, cfg) => save(pid, cfg).config, template, templates, publish, facts, onTask, toTasks, mcpTools, comments: loadC, exists: pid => !!loadRaw(pid) };
};
