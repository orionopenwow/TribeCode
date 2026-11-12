// Design plans (feat/design-flow, app/ui/designflow.js): the recommended process for each design (a game, an app, a
// website, a screen, slides, a poster, a whiteboard, a logo), one JSON file per design in the project's .tribe folder:
// .tribe/design-plans/<key>.json (projects other than the first under projects/<pid>/.tribe/design-plans/). The plan
// ticks off as people follow it, so everyone in the tribe sees the same progress.
//   GET    /api/projects/:pid/design-plans            -> { plans: [plan] } (newest first)
//   GET    /api/projects/:pid/design-plans/:key       -> { plan }
//   PUT    /api/projects/:pid/design-plans/:key { plan } -> { plan }   (builders; the key and kind are checked)
//   PATCH  /api/projects/:pid/design-plans/:key { step, done } -> { plan }   tick or untick one step
//   DELETE /api/projects/:pid/design-plans/:key       -> { ok }
// A plan: { key, kind, title, template, prompt, target: { type, id, dir, href }, steps: [{ id, t, d, act, done, by, at }],
//           created, updated, by }
'use strict';
const KINDS = new Set(['website', 'app', 'game', 'screen', 'slides', 'poster', 'whiteboard', 'logo']);
const okKey = k => /^[a-z0-9][a-z0-9-]{0,63}$/.test(String(k || ''));
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);

module.exports = function designPlans({ P, base, broadcast = () => {}, perms = null }) {
  const err = (status, m) => Object.assign(new Error(m), { status });
  const rel = (pid, key) => (pid === P.defaultId() ? '' : `projects/${pid}/`) + `.tribe/design-plans/${key}.json`;
  const projRole = (me, pid) => ((P.get(pid) || {}).members || {})[me.id];
  const canEdit = (me, pid) => !!me && me.role !== 'spectator' && projRole(me, pid) !== 'spectator' && (perms ? perms.atLeast(me, 'builder', pid) : me.role !== 'agent');
  const fs = require('node:fs'), path = require('node:path');
  function list(pid) {
    const dir = path.dirname(base.p(rel(pid, 'x')));
    let names = []; try { names = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch {}
    return names.map(f => base.readJSON(rel(pid, f.slice(0, -5)), null)).filter(p => p && p.key).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  }
  function clean(raw, key, me, old) {
    if (!raw || typeof raw !== 'object') throw err(400, 'send a plan');
    if (!KINDS.has(raw.kind)) throw err(400, 'unknown kind');
    const steps = (Array.isArray(raw.steps) ? raw.steps : []).slice(0, 20).map((s, i) => ({
      id: str(s.id || 's' + i, 24), t: str(s.t, 80), d: str(s.d, 240),
      act: s.act && typeof s.act === 'object' ? { k: str(s.act.k, 20), q: str(s.act.q, 120), label: str(s.act.label, 40) } : null,
      done: !!s.done, by: s.done ? str(s.by || me.name || me.id, 60) : '', at: s.done ? str(s.at || new Date().toISOString(), 30) : '',
    })).filter(s => s.t);
    const t = raw.target && typeof raw.target === 'object' ? raw.target : {};
    const now = new Date().toISOString();
    return { key, kind: raw.kind, title: str(raw.title, 80) || 'Untitled', template: str(raw.template, 60), prompt: str(raw.prompt, 600),
      target: { type: str(t.type, 20), id: str(t.id, 80), dir: str(t.dir, 120), href: str(t.href, 200), pid: str(t.pid, 40) },
      steps, created: (old && old.created) || now, updated: now, by: (old && old.by) || str(me.name || me.id, 60) };
  }
  async function route(req, res, { m, b: pid, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!P.get(pid) || (P.canSee && !P.canSee(me, pid))) return fail(res, 404, 'project not found');
    const key = parts[3];
    try {
      if (!key && m === 'GET') return send(res, 200, { plans: list(pid) });
      if (!okKey(key)) return fail(res, 400, 'bad plan key');
      const old = base.readJSON(rel(pid, key), null);
      if (m === 'GET') return old ? send(res, 200, { plan: old }) : fail(res, 404, 'no such plan');
      if (!canEdit(me, pid)) return fail(res, 403, 'spectators can look but not change the plan');
      if (m === 'DELETE') { try { fs.unlinkSync(base.p(rel(pid, key))); } catch {} broadcast({ type: 'design-plans', project: pid }); return send(res, 200, { ok: true }); }
      const body = await readBody(req, 64 * 1024).catch(() => ({}));
      let plan;
      if (m === 'PUT') plan = clean(body.plan, key, me, old);
      else if (m === 'PATCH') {
        if (!old) return fail(res, 404, 'no such plan');
        const s = old.steps.find(x => x.id === String(body.step)); if (!s) return fail(res, 404, 'no such step');
        s.done = !!body.done; s.by = s.done ? str(me.name || me.id, 60) : ''; s.at = s.done ? new Date().toISOString() : '';
        old.updated = new Date().toISOString(); plan = old;
      } else return fail(res, 405, 'method not allowed');
      base.writeJSON(rel(pid, key), plan);
      broadcast({ type: 'design-plans', project: pid, key });
      return send(res, 200, { plan });
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, list };
};
