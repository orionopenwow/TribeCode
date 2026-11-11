// Phone tribe -> real host (docs/PHONE-HOSTING.md). A tribe started "on this phone" lives only in that browser
// (app/ui/offline.js, solo mode). When a real host exists, the phone sends everything here in one call and it
// becomes ordinary projects on the host: tasks, docs, the vision and the chat history.
//   POST /api/import/solo   { tribe: { name }, projects: [{ name, emoji, color, bio, vision, tasks: [], docs: [], chat: [] }] }
//                           -> { ok, projects: [{ id, name, tasks, docs, chat }] }      (anyone who may start projects)
// Everything is clipped and re-validated: the phone's copy is data, never trusted shapes.
// feat/setup-local: the same call takes a local draft from the dashboard's instant setup (app/ui/setuplocal.js).
//   draftId   the host remembers each draft it took (solo-imports.json), so sending it again (a retry after a dropped
//             connection) returns the first result instead of a second copy: { ...first, again: true }
//   company   { name, mission, seats: { ceo|cto|growth|ops: 'me' | 'ai' | 'later' } } makes the project a company
//             (server/company.js, the blank template) and gives 'me' seats to the person moving it; the rest stay open
//   docs[].kind 'sheet' | 'deck' keeps a sheet a sheet
'use strict';
const fs = require('node:fs');

module.exports = function soloImport({ P, docs, postChat, store, str, saveTask, createTask, rooms, base = null, company = () => null }) {
  const SEEN = 'solo-imports.json';
  const seenAll = () => { try { return base ? JSON.parse(fs.readFileSync(base.p(SEEN), 'utf8')) : {}; } catch { return {}; } };
  const remember = (id, out) => { if (!base || !id) return; const all = seenAll(); all[id] = { at: new Date().toISOString(), out }; const keys = Object.keys(all); for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete all[k]; try { fs.writeFileSync(base.p(SEEN), JSON.stringify(all)); } catch {} };
  const LIM = { projects: 12, tasks: 300, docs: 60, chat: 1500 };
  const STATUS = ['backlog', 'doing', 'review', 'done'];
  function run(body, me) {
    const draftId = /^[A-Za-z0-9_-]{6,40}$/.test(String(body && body.draftId || '')) ? String(body.draftId) : '';
    if (draftId) { const prev = seenAll()[draftId]; if (prev && prev.out) return { ...prev.out, again: true }; }
    const list = Array.isArray(body && body.projects) ? body.projects.slice(0, LIM.projects) : [];
    if (!list.length) { const e = new Error('nothing to bring over'); e.code = 400; throw e; }
    const out = [];
    for (const sp of list) {
      const p = P.create({ name: str(sp.name, 48) || 'From my phone', emoji: str(sp.emoji, 4), color: sp.color, by: me.id });
      if (sp.bio) P.update(p.id, { bio: str(sp.bio, 200) });
      const n = { id: p.id, name: p.name, tasks: 0, docs: 0, chat: 0 };
      P.inProject(p.id, () => {
        if (sp.vision) try { fs.writeFileSync(store.p('VISION.md'), str(sp.vision, 20000) + '\n'); } catch {}
        for (const t of (Array.isArray(sp.tasks) ? sp.tasks : []).slice(0, LIM.tasks)) {
          const task = createTask({ title: t.title, by: me.id, status: STATUS.includes(t.status) ? t.status : 'backlog', body: t.body, source: 'phone', due: t.due, type: t.type });
          if (Array.isArray(t.subtasks) && t.subtasks.length) { task.subtasks = t.subtasks.slice(0, 30).map(s => ({ t: str(s && s.t, 200), done: !!(s && s.done) })).filter(s => s.t); saveTask(task); }
          n.tasks++;
        }
        for (const d of (Array.isArray(sp.docs) ? sp.docs : []).slice(0, LIM.docs)) {
          if (!d || (!d.title && !d.body)) continue;
          docs.create({ title: str(d.title, 120) || 'A note', body: String(d.body || '').slice(0, 400_000), by: me.id, ...(d.kind === 'sheet' || d.kind === 'deck' ? { kind: d.kind } : {}) }); n.docs++;
        }
        const chat = (Array.isArray(sp.chat) ? sp.chat : []).slice(-LIM.chat).filter(m => m && m.text);
        if (chat.length) {
          const channel = P.channelOf(p.id);
          for (const m of chat) {
            const by = m.by === 'me' ? me.id : 'tribecode';
            const text = m.by === 'me' || m.by === 'tribecode' ? str(m.text, 4000) : `**${str(m.name || m.by, 32)}:** ${str(m.text, 3900)}`;
            store.appendJSONL(`chat/${channel}.jsonl`, { id: 'ph' + Math.random().toString(36).slice(2, 12), at: typeof m.at === 'string' ? m.at.slice(0, 30) : new Date().toISOString(), by, text, imported: true });
            n.chat++;
          }
        }
        postChat('general', 'tribecode', `Moved **${p.name}** over from ${str(me.name, 32)}’s ${draftId ? 'device' : 'phone'}: ${n.tasks} tasks, ${n.docs} docs and ${n.chat} messages.`);
      });
      const co = sp.company && typeof sp.company === 'object' && company();
      if (co) {   // the Company basics from setup: anything left for later stays an open seat
        try {
          co.createFrom(p.id, me, { template: 'blank', name: str(sp.company.name, 60) || p.name, mission: str(sp.company.mission, 400), replace: true });
          const seats = sp.company.seats || {};
          for (const k of ['cto', 'growth', 'ops']) if (seats[k] === 'me') try { co.assign(p.id, me, k, { person: me.id }); } catch {}
          if (seats.ceo === 'later') try { co.assign(p.id, me, 'ceo', { person: null }); } catch {}
          n.company = true;
        } catch (e) { n.company = false; n.companyError = e.message; }
      }
      const gh = sp.github && /^[\w.-]+\/[\w.-]+$/.test(String(sp.github.repo || '')) ? String(sp.github.repo) : '';
      if (gh) { n.github = gh; P.inProject(p.id, () => postChat('general', 'tribecode', `This project is mirrored to GitHub: https://github.com/${gh} (suggestions on the \`${str(sp.github.branch, 60) || 'tribe/suggestions'}\` branch). Connect it under Code repository to keep it in sync from here.`)); }
      out.push(n);
    }
    try { rooms.pushProjects(); } catch {}
    const result = { ok: true, tribe: str(body.tribe && body.tribe.name, 48), projects: out };
    remember(draftId, result);
    return result;
  }
  async function route(req, res, { m, me, readBody, send, fail, isBoss }) {
    if (m !== 'POST') return fail(res, 405, 'POST only');
    if (!isBoss(me)) return fail(res, 403, 'you need permission to start projects in this tribe');
    try { return send(res, 200, run(await readBody(req, 4 * 1024 * 1024), me)); }
    catch (e) { return fail(res, e.code || e.status || 500, e.message); }
  }
  return { route, run };
};
