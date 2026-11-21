// Change requests (feat/cowork-editors, docs/ROLES-AND-PERMISSIONS.md): the one way someone suggests a change they
// can't make alone in a creator tool, and the one way an AI helper's refused change waits for a person.
//
//   tools   site   (the website designer, cap site.edit)     app     (App Creator, cap app.edit)
//           motion (a motion graphic, cap motion.edit)       launch  (the Launch kit, cap launch.edit)
//           (publishing is asked for with "Ask to publish", a one-day pass from server/groupstyle.js; it only has a line here)
//   who     the group style decides (server/groupstyle.js decidersFor): one person who holds the right, a holder plus a
//           second person, the council (counted with the group's one counting rule), or everyone. An AI helper's request
//           goes to the person it works for when they hold the right, else to whoever would decide for them.
//   how     a request IS an approval (server/approvals.js, kind 'change'): the inbox, phone push, one-tap Approve / Deny,
//           a comment, "Request changes" (a question back to the asker) all come from there. When it passes, the change is
//           applied here as one step, attributed to both, and kept so Undo puts the earlier version back.
//
// HTTP (members of the project):
//   GET  /api/projects/:pid/changes                -> { requests, how }       newest first; how = per tool { can, rule, who, need, line }
//   GET  /api/projects/:pid/changes/how            -> { how }
//   GET  /api/projects/:pid/changes/:id            -> { request }             with the before/after pictures and the summary
//   POST /api/projects/:pid/changes { tool, key?, payload, title?, why?, summary?, before?, after? }
//                                                  -> { applied: true } when you may change it yourself, else { request }
//   POST /api/projects/:pid/changes/:id/undo       the asker, the approver, or anyone who holds the right
//   POST /api/projects/:pid/changes/:id/withdraw   the asker, while it waits
// Stored in .tribe/changes.json (the list) and .tribe/changes/<id>.json (the change itself and the earlier version).
'use strict';

const TOOL_TEXT = {
  site: { cap: 'site.edit', name: 'website', what: 'the website' },
  app: { cap: 'app.edit', name: 'app', what: 'the phone app design' },
  motion: { cap: 'motion.edit', name: 'motion graphic', what: 'a motion graphic' },
  launch: { cap: 'launch.edit', name: 'store page', what: 'the store page' },
  publish: { cap: 'site.publish', name: 'publish', what: 'publishing for everyone' },
};
const PIC_MAX = 400 * 1024;   // one before/after picture (a data: URL)

module.exports = function changereq({ P, store, perms, groupStyle, approvals, bus, broadcast = () => {}, getMembers, str, id, tools = {}, now = () => Date.now() }) {
  const FILE = '.tribe/changes.json';
  let list = store.readJSON(FILE, []); if (!Array.isArray(list)) list = [];
  const save = () => { list = list.slice(-400); store.writeJSON(FILE, list); };
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const nameOf = mid => (member(mid) || {}).name || 'someone';
  const rel = cid => `.tribe/changes/${String(cid).replace(/[^\w-]/g, '')}.json`;
  const body = cid => store.readJSON(rel(cid), null);
  const keep = (cid, x) => { try { require('node:fs').mkdirSync(require('node:path').dirname(store.p(rel(cid))), { recursive: true }); } catch {} store.writeJSON(rel(cid), x); };
  const pic = v => (typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= PIC_MAX ? v : null);
  const toolOf = t => (TOOL_TEXT[t] && (t === 'publish' || tools[t]) ? t : null);   // publish: a "who decides" line only
  // the human behind a request: an AI helper works for its owner
  const humanOf = me => (me && me.role === 'agent' ? member(me.owner) : me);

  // ---------- who decides, in one line ----------
  function howFor(pid, me, tool) {
    const T = TOOL_TEXT[tool], h = humanOf(me);
    if (!T || !h) return null;
    const can = perms.can(h, T.cap, pid);
    const d = groupStyle && groupStyle.decidersFor ? groupStyle.decidersFor(pid, h, T.cap) : { rule: 'one', ids: [], need: 'one' };
    const who = d.ids.filter(x => x !== h.id).map(nameOf);
    const n = d.ids.length, mark = perms.passMark ? perms.passMark(d.need, n || 1) : 1;
    const watch = perms.actingRole(h, pid) === 'spectator';
    let line;
    if (watch) line = 'You can look. People who only watch can’t change this.';
    else if (can) line = 'You can change this directly.';
    else if (!who.length) line = 'Nobody here can approve changes to this yet. Ask the computer’s owner.';
    else if (d.rule === 'council') line = `Your changes go to the council for OK (${mark} of ${n}).`;
    else if (d.rule === 'all') line = 'Your changes need everyone’s OK.';
    else line = `Your changes go to ${who.slice(0, 2).join(' or ')}${who.length > 2 ? ` +${who.length - 2}` : ''} for OK.`;
    return { tool, cap: T.cap, can, watch, rule: d.rule, who, need: d.need, mark, of: n, line };
  }
  const how = (pid, me) => Object.fromEntries(Object.keys(TOOL_TEXT).filter(toolOf).map(t => [t, howFor(pid, me, t)]));

  // ---------- views ----------
  function view(x, me, full) {
    const a = x.approval && approvals.get(x.approval);
    const out = { id: x.id, project: x.project, tool: x.tool, key: x.key || null, title: x.title, why: x.why || '', summary: x.summary || [], by: x.by, byName: nameOf(x.by),
      agent: x.agent || null, agentName: x.agent ? nameOf(x.agent) : null, status: x.status, created: x.created, decidedBy: x.decidedBy || null, decidedByName: x.decidedBy ? nameOf(x.decidedBy) : null,
      decidedAt: x.decidedAt || null, note: x.note || '', approval: x.approval || null, to: (a && a.to ? a.to : x.to || []).map(nameOf), rule: x.rule, tally: a && a.tally ? a.tally : null,
      questions: a && a.questions ? a.questions : [], hasPictures: !!x.pics, undone: !!x.undoneAt,
      mine: !!me && (x.by === me.id || x.agent === me.id), canDecide: !!me && x.status === 'open' && !!a && a.to.includes(me.id) && (x.by !== me.id || !!x.agent),   // pass 4: your own helper's request is yours to answer (it asked on your behalf)
      canUndo: !!me && x.status === 'applied' && !x.undoneAt && mayUndo(x, me) };
    if (full) { const bd = body(x.id) || {}; out.before = bd.before || null; out.after = bd.after || null; }
    // pass 4: an AI helper's app proposal has no pictures (it cannot draw); the reviewer's own screen draws before and after
    if (full && !x.pics && x.tool === 'app' && x.status === 'open' && tools.app && tools.app.get) { const bd = body(x.id) || {}; try { out.draw = { before: tools.app.get(x.project) || null, after: bd.payload || null }; } catch {} }
    return out;
  }
  function mayUndo(x, me) {
    const h = humanOf(me); if (!h || h.role === 'agent') return false;
    if (x.by === h.id || x.decidedBy === h.id) return true;
    const T = TOOL_TEXT[x.tool]; return !!T && perms.can(h, T.cap, x.project);
  }
  const visible = (x, me) => !!me && (me.role === 'host' || P.canSee(me, x.project));

  // ---------- making one ----------
  function create(pid, me, b) {
    b = b && typeof b === 'object' ? b : {};
    const tool = toolOf(String(b.tool || ''));
    if (!tool) throw err(400, 'which tool: site, app, motion, launch or publish');
    if (!P.get(pid)) throw err(404, 'project not found');
    if (P.canSee && !P.canSee(me, pid)) throw err(404, 'project not found');
    const T = TOOL_TEXT[tool], h = humanOf(me);
    if (!h) throw err(403, 'this AI helper has no person to ask for');
    if (h.role === 'spectator' || perms.actingRole(h, pid) === 'spectator' || me.role === 'spectator') throw err(403, 'people who only watch can’t suggest changes');
    // publishing is asked for with "Ask to publish" (a pass for a day, server/groupstyle.js ask): one way to ask for it
    if (tool === 'publish') throw err(400, 'ask to publish from the Publish sheet: the people who can publish get it');
    if (b.payload == null || typeof b.payload !== 'object') throw err(400, 'send the change (payload)');
    const key = tool === 'motion' ? String(b.key || '') : null;
    if (tool === 'motion' && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(key)) throw err(400, 'bad motion key');
    // a person who holds the right just makes the change; a helper always asks its person first
    if (me.role !== 'agent' && perms.can(me, T.cap, pid)) {
      tools[tool].apply(pid, b.payload, me, key); broadcast({ type: 'change', project: pid, tool, applied: true, by: me.id });
      return { applied: true };
    }
    let rule, to, need;
    if (me.role === 'agent' && perms.can(h, T.cap, pid)) { rule = 'one'; to = [h.id]; need = 'one'; }
    else { const d = groupStyle.decidersFor(pid, h, T.cap); rule = d.rule; need = d.need; to = d.ids.filter(x => x !== h.id && x !== me.id); }
    if (!to.length) throw err(409, 'Nobody else here can approve this yet. Invite someone, or ask the computer’s owner.');
    const dup = list.find(x => x.status === 'open' && x.project === pid && x.tool === tool && (x.key || null) === key && x.by === h.id && (x.agent || null) === (me.role === 'agent' ? me.id : null));
    if (dup) withdraw(pid, me, dup.id, 'Replaced by a newer suggestion');   // one open suggestion per person per thing: the newest wins
    const cid = 'cr' + now().toString(36) + id(4).toLowerCase();
    const title = (str(b.title, 120) || `${me.role === 'agent' ? `${me.name} (for ${h.name})` : h.name} suggests a change to ${T.what}`).slice(0, 160);
    const why = str(b.why, 600);
    const summary = (Array.isArray(b.summary) ? b.summary : []).slice(0, 12).map(s => str(s, 200)).filter(Boolean);
    const before = pic(b.before), after = pic(b.after);
    const x = { id: cid, project: pid, tool, key, title, why, summary, by: h.id, agent: me.role === 'agent' ? me.id : null, status: 'open', created: new Date(now()).toISOString(), rule, need, to, pics: !!(before || after) };
    keep(cid, { payload: tool === 'publish' ? null : b.payload, before, after });
    const details = [why, summary.length ? summary.join(' · ') : '', me.role === 'agent' ? `Asked by ${h.name}’s AI helper ${me.name}.` : ''].filter(Boolean).join('\n');
    const a = approvals.create({ title, details, risk: rule === 'council' ? 'high' : 'medium', kind: 'change', to, change: { id: cid, tool, project: pid, onBehalf: me.role === 'agent' ? h.id : null, ...(rule === 'council' || rule === 'all' ? { council: { ids: to, need: rule === 'all' ? 'all' : need } } : {}) } }, me);
    x.approval = a.id; list.push(x); save();
    broadcast({ type: 'change', project: pid, id: cid, tool, status: 'open' });
    return { request: view(x, me) };
  }

  // feat/ai-guides: a helper's own waiting request for a tool, with the design it holds, so its next steps build on it
  // (still one request for the person). Only ever the caller's own: by this helper, for its person.
  function pending(pid, me, tool, key = null) {
    const h = humanOf(me); if (!h || !me || me.role !== 'agent') return null;
    const x = list.find(y => y.status === 'open' && y.project === pid && y.tool === tool && (y.key || null) === key && y.by === h.id && y.agent === me.id); if (!x) return null;
    const bd = body(x.id) || {}; return bd.payload ? { id: x.id, payload: JSON.parse(JSON.stringify(bd.payload)), summary: x.summary || [], why: x.why || '' } : null;
  }

  // ---------- answers (the approvals hook) ----------
  function decided(a) {
    if (!a || a.kind !== 'change' || !a.change) return;
    const x = list.find(y => y.id === a.change.id); if (!x || x.status !== 'open') return;
    x.decidedBy = a.decidedBy || null; x.decidedAt = a.decidedAt || new Date(now()).toISOString(); x.note = a.note || '';
    const approver = member(x.decidedBy);
    if (a.status === 'approved') {
      try {
        {
          const bd = body(x.id) || {};
          const earlier = tools[x.tool].get(x.project, x.key);
          tools[x.tool].apply(x.project, bd.payload, approver || member(x.by), x.key, { askedBy: x.by });
          keep(x.id, { ...bd, earlier: earlier == null ? null : earlier });
          x.status = 'applied';
        }
      } catch (e) { x.status = 'failed'; x.note = `Could not apply: ${e.message}`.slice(0, 300); }
    } else if (a.status === 'denied') x.status = 'denied';
    else if (a.status === 'closed') x.status = 'withdrawn';
    save();
    broadcast({ type: 'change', project: x.project, id: x.id, tool: x.tool, status: x.status, applied: x.status === 'applied', by: x.decidedBy });
    const tell = [x.by, x.agent ? member(x.agent) && member(x.agent).owner : null].filter((v, i, l) => v && l.indexOf(v) === i && v !== x.decidedBy);
    if (bus && tell.length) {
      const title = x.status === 'applied' ? `${nameOf(x.decidedBy)} approved your change` : x.status === 'failed' ? 'Your change was approved but could not be applied' : `${nameOf(x.decidedBy)} said no to your change`;
      bus.notify({ type: 'change', priority: 'normal', to: tell, from: x.decidedBy || 'tribecode', title, body: x.title + (x.note ? ` · “${x.note}”` : ''), view: 'inbox', ref: x.id, project: x.project });
    }
  }

  function undo(pid, me, cid) {
    const x = list.find(y => y.id === cid && y.project === pid); if (!x) throw err(404, 'that request is gone');
    if (x.status !== 'applied' || x.undoneAt) throw err(409, 'nothing to undo');
    if (!mayUndo(x, me)) throw err(403, 'the person who asked, the person who approved, or someone who can change this undoes it');
    const bd = body(x.id) || {};
    if (bd.earlier == null && (x.tool === 'site' || x.tool === 'app')) throw err(409, 'this change started the design, so there is no earlier version to go back to');   // feat/ai-guides: a helper may start a design
    tools[x.tool].apply(x.project, bd.earlier, humanOf(me), x.key, { undo: true });
    x.undoneAt = new Date(now()).toISOString(); x.undoneBy = humanOf(me).id; save();
    broadcast({ type: 'change', project: pid, id: cid, tool: x.tool, status: 'undone', applied: true, by: x.undoneBy });
    return view(x, me);
  }
  function withdraw(pid, me, cid, note) {
    const x = list.find(y => y.id === cid && y.project === pid); if (!x) throw err(404, 'that request is gone');
    const h = humanOf(me);
    if (x.by !== (h && h.id) && x.agent !== me.id && me.role !== 'host') throw err(403, 'only the person who asked can take it back');
    if (x.status !== 'open') throw err(409, `already ${x.status}`);
    x.status = 'withdrawn'; save();
    if (x.approval) approvals.close(x.approval, note || `${nameOf(x.by)} took it back`);
    broadcast({ type: 'change', project: pid, id: cid, tool: x.tool, status: 'withdrawn' });
    return view(x, me);
  }
  const forProject = (pid, me) => list.filter(x => x.project === pid && visible(x, me)).slice(-60).reverse().map(x => view(x, me));

  // ---------- an editor's refused save becomes a request (a helper's always; a person's when they asked for it) ----------
  function fromRefusal(pid, me, tool, payload, extra) {
    return create(pid, me, { ...(extra || {}), tool, payload });
  }

  async function route(req, res, { m, b: pid, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    if (!P.get(pid) || (P.canSee && !P.canSee(me, pid))) return fail(res, 404, 'project not found');
    const d = parts[3], e = parts[4];
    try {
      if (!d && m === 'GET') return send(res, 200, { requests: forProject(pid, me), how: how(pid, me) });
      if (d === 'how' && m === 'GET') return send(res, 200, { how: how(pid, me) });
      if (!d && m === 'POST') { const bd = await readBody(req, 7 * 1024 * 1024); return send(res, 200, create(pid, me, bd)); }
      if (d && !e && m === 'GET') { const x = list.find(y => y.id === d && y.project === pid); return x && visible(x, me) ? send(res, 200, { request: view(x, me, true) }) : fail(res, 404, 'that request is gone'); }
      if (d && e === 'undo' && m === 'POST') return send(res, 200, { request: undo(pid, me, d) });
      if (d && e === 'withdraw' && m === 'POST') return send(res, 200, { request: withdraw(pid, me, d) });
      return fail(res, 404, 'not found');
    } catch (x) { return fail(res, x.status || 500, x.message); }
  }

  approvals.onDecided(decided);
  return { route, create, pending, fromRefusal, decided, undo, withdraw, how, howFor, list: forProject, TOOL_TEXT };
};
