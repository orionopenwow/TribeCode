// App Creator's server side (docs/APP-CREATOR.md; the model is app/ui/appcreator-core.js, the editor app/ui/appcreator.js).
// One JSON design per project, like the website designer's config, saved on the host so the whole tribe edits one app.
//   GET  /api/projects/:id/app-config                     { config | null, rev, savedBy, savedAt, canEdit }
//   PUT  /api/projects/:id/app-config  { config, base?, force? }   builders (not spectators or guests); <= 4 MB, normalized.
//                                                          base = the rev the editor started from: a newer rev on disk
//                                                          answers 409 { conflict, config, rev, by } unless force.
//   POST /api/projects/:id/app-config/export { kind: 'pwa' | 'expo' }   builders: writes the app into the project's code
//        pwa  -> app-web/   an installable phone web app (plain HTML/JS, offline), with its fonts; the live preview finds it
//        expo -> app-expo/  an Expo project drawing the same screens; phone app mode is pointed at it when it has none yet,
//                           so the Phone app card can install dependencies and show the Expo Go QR code
//        Files are written only inside that one folder, and the folder is replaced as a whole on each export. A project
//        with no code folder gets one first (server/setup.js ensureRepo), as the website templates do.
//   pass 4 (history and comments, like the website designer's):
//   GET  /api/projects/:id/app-config/history             { versions: [{ id, rev, at, by, name, screens }] } newest first
//   GET  /api/projects/:id/app-config/history/:vid        { config, name, at, by }   (restoring = the editor saves it again)
//   POST /api/projects/:id/app-config/history  { name }   builders: name the design as it is now ("v1 demo"); named ones are kept
//   POST /api/projects/:id/app-config/history/:vid/name { name }
//        Every save lands in the history; saves by the same person within two minutes share one entry. The last 30 unnamed
//        and 20 named versions are kept. Pictures are stored once, by id, beside the versions.
//   GET  /api/projects/:id/app-comments                   { comments, canEdit }
//   POST /api/projects/:id/app-comments  { screen, block, label, text, x, y }      any member (not guests): a pin on a part
//   POST /api/projects/:id/app-comments/:cid/reply { text } · /resolve · /reopen   replies: any member; resolve: author or builder
//   DELETE /api/projects/:id/app-comments/:cid                                     the author, or a builder
// addKit(pid, kit, me): the add-on shelf's app kits land here (server/market.js).
// Stored in .tribe/appdesign/<pid>.json. No AI anywhere; "Have my AI build it" is the client posting the brief to #agents.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const A = require('../app/ui/appcreator-core.js');

module.exports = function appCreator({ P, store, root, perms = null, requests = () => null, brand = () => ({}), broadcast = () => {}, nameOf = x => x, ensureRepo = null, log = () => {} }) {
  const FONTS = [path.join(root, 'app', 'ui', 'assets', 'site-fonts'), path.join(root, 'ui', 'assets', 'site-fonts')].find(d => fs.existsSync(d)) || path.join(root, 'app', 'ui', 'assets', 'site-fonts');
  const rel = pid => `.tribe/appdesign/${String(pid).replace(/[^\w-]/g, '')}.json`;
  const loadRaw = pid => store.readJSON(rel(pid), null);
  const err = (status, m) => Object.assign(new Error(m), { status });
  // ---------- history (pass 4) ----------
  const safe = pid => String(pid).replace(/[^\w-]/g, '');
  const hrel = pid => `.tribe/appdesign/${safe(pid)}.history.json`, crel = pid => `.tribe/appdesign/${safe(pid)}.comments.json`;
  const vid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const loadH = pid => { const h = store.readJSON(hrel(pid), null); return h && Array.isArray(h.versions) ? h : { versions: [], pics: {} }; };
  function saveH(pid, h) {
    const named = h.versions.filter(v => v.name).slice(-20), plain = h.versions.filter(v => !v.name).slice(-30), keep = new Set(named.concat(plain));
    h.versions = h.versions.filter(v => keep.has(v));
    const used = new Set(); for (const v of h.versions) for (const id of v.pics || []) used.add(id);
    for (const id of Object.keys(h.pics || {})) if (!used.has(id)) delete h.pics[id];
    store.writeJSON(hrel(pid), h);
  }
  function remember(pid, c, rev, me, name) {
    try {
      const h = loadH(pid), now = Date.now(), last = h.versions[h.versions.length - 1];
      const { pics, ...lean } = c; h.pics = Object.assign(h.pics || {}, pics || {});
      const entry = { id: vid(), rev, at: new Date(now).toISOString(), by: me.id, name: name ? String(name).slice(0, 60) : '', screens: c.screens.length, pics: Object.keys(pics || {}), config: lean };
      if (!name && last && !last.name && last.by === me.id && now - Date.parse(last.at) < 120000) { entry.id = last.id; h.versions[h.versions.length - 1] = entry; }
      else h.versions.push(entry);
      saveH(pid, h); return entry;
    } catch (e) { log(`app creator: history: ${e.message}`); return null; }
  }
  const fullOf = (h, v) => { const pics = {}; for (const id of v.pics || []) if (h.pics && h.pics[id]) pics[id] = h.pics[id]; return A.normalize({ ...v.config, pics }); };
  const hview = v => ({ id: v.id, rev: v.rev, at: v.at, by: nameOf(v.by), name: v.name || '', screens: v.screens || 0 });
  // ---------- comments (pass 4) ----------
  const loadC = pid => { const l = store.readJSON(crel(pid), []); return Array.isArray(l) ? l : []; };
  const saveC = (pid, l) => { fs.mkdirSync(path.dirname(store.p(crel(pid))), { recursive: true }); store.writeJSON(crel(pid), l.slice(-300)); try { broadcast({ type: 'app-comments', project: pid }); } catch {} };
  const cview = c => ({ id: c.id, screen: c.screen, block: c.block, label: c.label || '', text: c.text, x: c.x, y: c.y, by: nameOf(c.by), byId: c.by, at: c.at, status: c.status, replies: (c.replies || []).map(r => ({ by: nameOf(r.by), text: r.text, at: r.at })) });
  const num = v => Math.max(0, Math.min(1, +v || 0));

  function save(pid, config, me) {
    const cur = loadRaw(pid), rev = ((cur && cur.rev) || 0) + 1;
    const c = A.normalize(config);
    fs.mkdirSync(path.dirname(store.p(rel(pid))), { recursive: true });
    store.writeJSON(rel(pid), { ...c, rev, savedBy: me.id, savedAt: new Date().toISOString() });
    remember(pid, c, rev, me);
    try { broadcast({ type: 'app-config', project: pid, rev, by: me.id }); } catch {}
    return { config: c, rev };
  }
  const repoOf = p => { if (!p || !p.repo) return null; try { return fs.realpathSync(p.repo); } catch { return null; } };
  function writeFolder(repo, folder, files) {
    const dir = path.join(repo, folder);
    if (!dir.startsWith(repo + path.sep)) throw err(400, 'bad folder');
    fs.rmSync(dir, { recursive: true, force: true });
    const written = [];
    for (const [name, data] of files) {
      if (data == null) continue;
      const out = path.resolve(dir, name);
      if (!out.startsWith(dir + path.sep)) continue;   // a file name can never leave the folder
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, data);
      written.push(`${folder}/${name}`);
    }
    return written;
  }
  async function exportApp(p, kind, me) {
    const raw = loadRaw(p.id); if (!raw) throw err(400, 'design the app first: nothing is saved yet');
    let repo = repoOf(p);
    if (!repo && ensureRepo) { try { await ensureRepo(p.id, me); repo = repoOf(P.get(p.id)); } catch (e) { log(`app creator: code folder: ${e.message}`); } }   // the project's code folder, made like the website's
    if (!repo) throw err(400, 'give the project a code folder first (Repo → set up), or use Download');
    const doc = A.normalize(raw);
    if (kind === 'pwa') {
      const files = A.pwa(doc, { fonts: f => { try { return fs.readFileSync(path.join(FONTS, f + '.woff2')); } catch { return null; } } });
      const font = A.FONTS[doc.theme.font]; const lic = { 'Inter': 'Inter', 'Outfit': 'Outfit', 'Bricolage Grotesque': 'BricolageGrotesque', 'Space Grotesk': 'SpaceGrotesk', 'Fraunces': 'Fraunces', 'DM Serif Display': 'DMSerifDisplay', 'Instrument Serif': 'InstrumentSerif', 'JetBrains Mono': 'JetBrainsMono', 'Silkscreen': 'Silkscreen' };
      for (const fam of [font.display, font.body].filter((x, i, a) => x && a.indexOf(x) === i)) { try { files.push([`fonts/LICENSE-${lic[fam]}.txt`, fs.readFileSync(path.join(FONTS, `LICENSE-${lic[fam]}.txt`))]); } catch {} }
      const written = writeFolder(repo, 'app-web', files);
      return { ok: true, kind, folder: 'app-web', written, preview: 'app-web/' };
    }
    if (kind === 'expo') {
      const written = writeFolder(repo, 'app-expo', A.expo(doc));
      // point phone app mode at it when the project has no phone app yet (server/phoneapp.js reads this file)
      let phone = false;
      try { const all = store.readJSON('.tribe/phoneapp.json', {}) || {}; const cur = all[p.id] || {}; if (!cur.setUp) { all[p.id] = { ...cur, on: true, stack: 'expo', folder: 'app-expo', setUp: true, at: new Date().toISOString(), by: me.id, from: 'app-creator' }; store.writeJSON('.tribe/phoneapp.json', all); phone = true; try { broadcast({ type: 'phoneapp', project: p.id }); } catch {} } } catch (e) { log(`app creator: phone app mode: ${e.message}`); }
      return { ok: true, kind, folder: 'app-expo', written, phoneApp: phone };
    }
    throw err(400, 'export kind is pwa or expo');
  }

  async function route(req, res, { m, a, b, c, d, e, f, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    if (a !== 'projects' || (c !== 'app-config' && c !== 'app-comments')) return fail(res, 404, 'not found');
    const p = P.get(b); if (!p || (P.canSee && !P.canSee(me, p.id))) return fail(res, 404, 'project not found');
    const mayRole = me.role !== 'spectator' && me.role !== 'guest' && (p.members || {})[me.id] !== 'spectator';
    const canEdit = mayRole && (!perms || perms.can(me, 'app.edit', p.id));   // feat/cowork-editors: a row in the table (app.edit)
    try {
      if (c === 'app-comments') {   // pass 4: pins on parts of a screen, with replies
        const body = m === 'POST' ? ((await readBody(req)) || {}) : {};
        if (!d && m === 'GET') return send(res, 200, { comments: loadC(p.id).map(cview), canEdit });
        if (me.role === 'guest') return fail(res, 403, 'join the tribe to comment');
        const l = loadC(p.id);
        if (!d && m === 'POST') {
          const text = String(body.text || '').trim().slice(0, 600); if (!text) return fail(res, 400, 'write the comment first');
          const cm = { id: 'c' + vid(), screen: String(body.screen || '').slice(0, 40), block: String(body.block || '').slice(0, 40), label: String(body.label || '').slice(0, 80), text, x: num(body.x), y: num(body.y), by: me.id, at: new Date().toISOString(), status: 'open', replies: [] };
          l.push(cm); saveC(p.id, l); return send(res, 200, { comment: cview(cm) });
        }
        const cm = l.find(x => x.id === d); if (!cm) return fail(res, 404, 'no such comment');
        const mine = cm.by === me.id || canEdit;
        if (e === 'reply' && m === 'POST') { const text = String(body.text || '').trim().slice(0, 600); if (!text) return fail(res, 400, 'write the reply first'); cm.replies = (cm.replies || []).concat({ by: me.id, text, at: new Date().toISOString() }).slice(-40); saveC(p.id, l); return send(res, 200, { comment: cview(cm) }); }
        if ((e === 'resolve' || e === 'reopen') && m === 'POST') { if (!mine) return fail(res, 403, 'only the person who wrote it, or someone who can change the app, can do that'); cm.status = e === 'resolve' ? 'resolved' : 'open'; saveC(p.id, l); return send(res, 200, { comment: cview(cm) }); }
        if (!e && m === 'DELETE') { if (!mine) return fail(res, 403, 'only the person who wrote it, or someone who can change the app, can remove it'); saveC(p.id, l.filter(x => x !== cm)); return send(res, 200, { ok: true }); }
        return fail(res, 404, 'not found');
      }
      if (d === 'history') {   // pass 4
        const h = loadH(p.id);
        if (!e && m === 'GET') return send(res, 200, { versions: h.versions.map(hview).reverse(), canEdit });
        if (e && !f && m === 'GET') { const v = h.versions.find(x => x.id === e); if (!v) return fail(res, 404, 'no such version'); return send(res, 200, { config: fullOf(h, v), name: v.name || '', at: v.at, by: nameOf(v.by) }); }
        if (!canEdit) return fail(res, 403, 'naming versions needs someone who can change the app');
        const body = (await readBody(req)) || {}, name = String(body.name || '').trim().slice(0, 60);
        if (!e && m === 'POST') { const r = loadRaw(p.id); if (!r) return fail(res, 400, 'nothing is saved yet'); const v = remember(p.id, A.normalize(r), r.rev || 0, me, name || 'Saved version'); return send(res, 200, { version: v ? hview(v) : null }); }
        if (e && f === 'name' && m === 'POST') { const v = h.versions.find(x => x.id === e); if (!v) return fail(res, 404, 'no such version'); v.name = name; saveH(p.id, h); return send(res, 200, { version: hview(v) }); }
        return fail(res, 404, 'not found');
      }
      if (!d && m === 'GET') { const r = loadRaw(p.id); return send(res, 200, { config: r ? A.normalize(r) : null, rev: (r && r.rev) || 0, savedBy: r && r.savedBy ? nameOf(r.savedBy) : '', savedAt: (r && r.savedAt) || '', canEdit, canSuggest: mayRole && !canEdit }); }
      if (!canEdit && !d && m === 'PUT' && mayRole && requests()) {
        const body = await readBody(req, 4 * 1024 * 1024); if (!body || typeof body.config !== 'object') return fail(res, 400, 'config missing');
        if (me.role === 'agent' || body.asRequest) return send(res, 202, requests().fromRefusal(p.id, me, 'app', body.config, { title: body.title, why: body.why, summary: body.summary, before: body.before, after: body.after }));
        perms.can(me, 'app.edit', p.id);
        return fail(res, 403, 'changing the app needs someone’s OK here: suggest the change instead');
      }
      if (!canEdit) return fail(res, 403, mayRole ? 'changing the app needs someone’s OK here' : 'spectators can look, not change the app');
      if (!d && m === 'PUT') {
        const body = await readBody(req, 4 * 1024 * 1024); if (!body || typeof body.config !== 'object') return fail(res, 400, 'config missing');
        const cur = loadRaw(p.id);
        if (cur && body.base != null && !body.force && +body.base !== (cur.rev || 0)) return send(res, 409, { conflict: true, config: A.normalize(cur), rev: cur.rev || 0, by: nameOf(cur.savedBy) });
        const r = save(p.id, body.config, me); return send(res, 200, { ok: true, config: r.config, rev: r.rev });
      }
      if (d === 'export' && m === 'POST') { const body = (await readBody(req)) || {}; return send(res, 200, await exportApp(p, body.kind, me)); }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  // the add-on shelf's app kits (server/market.js): the kit's screens join the project's app design (a blank app when none yet)
  function addKit(pid, kitId, me) {
    const p = P.get(pid); if (!p) throw err(404, 'project not found');
    if (!A.KITS[kitId]) throw err(400, 'no such app kit');
    const raw = loadRaw(pid), doc = raw ? A.normalize(raw) : A.blank(p.name || 'My app');
    const r = A.apply(doc, { op: 'kit', kit: kitId });
    save(pid, r.doc, me);
    return { added: r.added || [], say: r.say };
  }
  // Flint's app features (app/ui/appfeatures.js) for a project whose app lives in App Creator: the design keeps them and
  // the next export carries them (server/flintfree.js feature()).
  function addFeature(pid, feature, me, off) {
    const p = P.get(pid); if (!p) throw err(404, 'project not found');
    const raw = loadRaw(pid); if (!raw) return null;
    const r = A.apply(A.normalize(raw), { op: off ? 'feature.remove' : 'feature.add', feature });
    if (r.doc.features !== undefined || off) save(pid, r.doc, me);
    return { say: r.say, features: r.doc.features || [] };
  }
  // ---------- MCP: an AI helper reads the app design and proposes steps (docs/CLAUDE-HOOKS.md) ----------
  // app_read  the design as JSON (ids, types, words, links, the look), the brand kit, and the steps a helper may use
  // app_propose { ops, note }  the steps are checked one by one (app/ui/appcreator-core.js propose); what passes becomes a
  //   change request (server/changereq.js): the helper's person, or whoever approves changes to the app, sees it before
  //   and after and approves or declines. A helper can never approve its own request, and nothing is saved until then.
  const text = (t, isError) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
  const cur = a => (a && a.project) || (P && (P.current() || P.defaultId()));
  const mcpTools = {
    app_read: {
      description: 'Read the project\'s phone app design (made in App Creator) as JSON: every screen with its id and name, each part (block) with its id, type, words and links, the look (theme), the brand kit, what parts, looks, fonts, icons and kits exist, and the steps app_propose accepts. Use it before app_propose. Pictures are left out.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' } }, additionalProperties: false },
      run: async (a = {}) => { const pid = cur(a), raw = loadRaw(pid); if (!raw) return text('This project has no app design yet. A person starts one in App Creator (Design › App).', true); let k = {}; try { k = brand(pid) || {}; } catch {} return text(JSON.stringify({ ...A.readOut(raw), brand: { name: k.name, colors: k.colors, fonts: k.fonts, voice: k.voice } })); },
    },
    app_propose: {
      description: `Propose changes to the project's phone app design as a list of safe steps. Nothing changes until a person approves the proposal (they see the app before and after), and Undo takes it back. ${A.PROPOSE_HELP}`,
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, note: { type: 'string', description: 'one or two sentences for the person: what you changed and why' }, ops: { type: 'array', items: { type: 'object' }, maxItems: 60 } }, required: ['ops'], additionalProperties: false },
      run: async (a = {}, me) => {
        try {
          const pid = cur(a), p = P.get(pid); if (!p) return text('project not found', true);
          const raw = loadRaw(pid); if (!raw) return text('This project has no app design yet. A person starts one in App Creator (Design › App).', true);
          const r = A.propose(raw, a.ops); const skipped = r.skipped.length ? `\nSkipped:\n${r.skipped.map(x => '- ' + x).join('\n')}` : '';
          if (!r.done.length) return text(`None of the steps could be used, so nothing was proposed.${skipped}`, true);
          const rq = requests(); if (!rq) return text('change requests are not available here', true);
          const who = me || { id: 'agent', role: 'agent', name: 'AI helper' };
          const out = rq.create(pid, who, { tool: 'app', payload: r.doc, title: `${who.name || 'An AI helper'} proposes ${r.done.length} change${r.done.length === 1 ? '' : 's'} to the app`, why: String(a.note || '').slice(0, 600), summary: r.done.slice(0, 12) });
          return text(`${out.applied ? `Applied ${r.done.length} change${r.done.length === 1 ? '' : 's'} (you hold the right to change the app).` : `Proposed ${r.done.length} change${r.done.length === 1 ? '' : 's'}. A person approves them under Requests in App Creator or in the inbox; nothing has changed yet.`}\n${r.done.map(x => '- ' + x).join('\n')}${skipped}`);
        } catch (e) { return text(e.message, true); }
      },
    },
  };
  return { mcpTools, route, addKit, addFeature, save: (pid, cfg, me) => save(pid, cfg, me), load: pid => { const r = loadRaw(pid); return r ? A.normalize(r) : null; } };
};
