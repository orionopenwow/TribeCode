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
// Stored in .tribe/appdesign/<pid>.json. No AI anywhere; "Have my AI build it" is the client posting the brief to #agents.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const A = require('../app/ui/appcreator-core.js');

module.exports = function appCreator({ P, store, root, broadcast = () => {}, nameOf = x => x, ensureRepo = null, log = () => {} }) {
  const FONTS = [path.join(root, 'app', 'ui', 'assets', 'site-fonts'), path.join(root, 'ui', 'assets', 'site-fonts')].find(d => fs.existsSync(d)) || path.join(root, 'app', 'ui', 'assets', 'site-fonts');
  const rel = pid => `.tribe/appdesign/${String(pid).replace(/[^\w-]/g, '')}.json`;
  const loadRaw = pid => store.readJSON(rel(pid), null);
  const err = (status, m) => Object.assign(new Error(m), { status });
  function save(pid, config, me) {
    const cur = loadRaw(pid), rev = ((cur && cur.rev) || 0) + 1;
    const c = A.normalize(config);
    fs.mkdirSync(path.dirname(store.p(rel(pid))), { recursive: true });
    store.writeJSON(rel(pid), { ...c, rev, savedBy: me.id, savedAt: new Date().toISOString() });
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

  async function route(req, res, { m, a, b, c, d, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    if (a !== 'projects' || c !== 'app-config') return fail(res, 404, 'not found');
    const p = P.get(b); if (!p || (P.canSee && !P.canSee(me, p.id))) return fail(res, 404, 'project not found');
    const canEdit = me.role !== 'spectator' && me.role !== 'guest' && (p.members || {})[me.id] !== 'spectator';
    try {
      if (!d && m === 'GET') { const r = loadRaw(p.id); return send(res, 200, { config: r ? A.normalize(r) : null, rev: (r && r.rev) || 0, savedBy: r && r.savedBy ? nameOf(r.savedBy) : '', savedAt: (r && r.savedAt) || '', canEdit }); }
      if (!canEdit) return fail(res, 403, 'spectators can look, not change the app');
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
  return { route, load: pid => { const r = loadRaw(pid); return r ? A.normalize(r) : null; } };
};
