// Moderation (feat/appstore, docs/APP-STORE.md "1.2 User-generated content"): the minimum the app stores ask of any app
// where people post things, kept small and visible to the host.
//   * Report: anyone can report a message or a person. The report (who, what, an excerpt, why) is kept for the host and
//     mods, and they get a notification. They mark it resolved or dismissed.
//   * Block: anyone can block a person for themselves. Their messages are hidden for you (client side, app/ui/moderation.js)
//     and they no longer notify you. Blocking is private: the blocked person isn't told.
//   * Filter: the host can list words that are masked (••••) in every chat message as it is posted.
// Storage: .tribe/moderation.json { reports: [], blocks: { memberId: [ids] }, filter: { words: [] } }.
//   GET  /api/moderation                     -> { blocks, staff, reports? (staff), filter? (staff) }
//   POST /api/moderation/report              { kind: 'message'|'member', target, ref?, channel?, excerpt?, reason, note? } -> { report }
//   PUT  /api/moderation/block               { id, on } -> { blocks }
//   POST /api/moderation/reports/<id>        { status: 'resolved'|'dismissed'|'open' } (staff) -> { report }
//   PUT  /api/moderation/filter              { words: [] } (host/admin) -> { filter }
'use strict';

const REASONS = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self-harm', 'illegal', 'other'];
const MAX_REPORTS = 2000, MAX_BLOCKS = 500, MAX_WORDS = 300;

module.exports = function makeModeration({ store, getMembers, bus, id, limited, log = () => {} }) {
  const FILE = '.tribe/moderation.json';
  let db = load();
  function load() {
    const d = store.readJSON(FILE, null) || {};
    return { reports: Array.isArray(d.reports) ? d.reports : [], blocks: d.blocks && typeof d.blocks === 'object' ? d.blocks : {}, filter: { words: Array.isArray(d.filter && d.filter.words) ? d.filter.words : [] } };
  }
  const save = () => store.writeJSON(FILE, db);
  const member = mid => getMembers().find(m => m.id === mid);
  const staff = me => !!me && ['host', 'admin', 'mod'].includes(me.role);
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
  const blocksOf = mid => (Array.isArray(db.blocks[mid]) ? db.blocks[mid] : []);
  const isBlocked = (viewer, author) => !!viewer && !!author && blocksOf(viewer).includes(author);

  // The word filter: whole words, any case; each match becomes bullets of the same length (the sentence stays readable).
  let re = null;
  function compile() {
    const words = db.filter.words.map(w => String(w).trim()).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    re = words.length ? new RegExp(`(^|[^\\p{L}\\p{N}_])(${words.join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'giu') : null;
  }
  compile();
  const clean = text => (re && typeof text === 'string' ? text.replace(re, (_, pre, w) => pre + '•'.repeat([...w].length)) : text);

  function view(me) {
    const out = { blocks: blocksOf(me.id), staff: staff(me) };
    if (out.staff) { out.reports = db.reports.slice(-200).reverse(); out.filter = { words: db.filter.words.slice() }; out.reasons = REASONS; }
    return out;
  }

  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role === 'agent') return fail(res, 403, 'people only');
    if (!b && m === 'GET') return send(res, 200, view(me));
    if (b === 'report' && m === 'POST') {
      if (limited && limited(req, 10)) return fail(res, 429, 'slow down');
      const body = await readBody(req);
      const kind = body.kind === 'member' ? 'member' : 'message';
      const target = str(body.target, 40), reason = REASONS.includes(body.reason) ? body.reason : 'other';
      if (!target || target === me.id) return fail(res, 400, 'nothing to report');
      const who = member(target);
      const r = { id: id(10), at: new Date().toISOString(), by: me.id, byName: me.name, kind, target, targetName: who ? who.name : str(body.targetName, 60) || 'someone',
        ref: str(body.ref, 40) || null, channel: str(body.channel, 80) || null, excerpt: str(body.excerpt, 500), reason, note: str(body.note, 500), status: 'open' };
      db.reports.push(r); if (db.reports.length > MAX_REPORTS) db.reports.splice(0, db.reports.length - MAX_REPORTS); save();
      const to = getMembers().filter(x => staff(x) && x.id !== me.id && x.id !== target).map(x => x.id);
      if (to.length && bus) bus.notify({ type: 'report', to, from: me.id, priority: 'normal', title: `${me.name} reported ${kind === 'member' ? r.targetName : `a message from ${r.targetName}`}`, body: `${reason}${r.note ? ': ' + r.note.slice(0, 120) : ''}`, view: 'settings', ref: r.id });
      log(`report ${r.id}: ${kind} ${target} (${reason}) by ${me.id}`);
      return send(res, 200, { report: { id: r.id, status: r.status } });
    }
    if (b === 'block' && m === 'PUT') {
      const body = await readBody(req), who = str(body.id, 40);
      if (!who || who === me.id || who === 'tribecode') return fail(res, 400, 'nobody to block');
      const target = member(who);
      if (target && target.role === 'host' && body.on) return fail(res, 400, 'The host keeps the tribe running and can\'t be blocked. Report them instead, or leave the tribe.');
      const set = new Set(blocksOf(me.id));
      body.on ? set.add(who) : set.delete(who);
      db.blocks[me.id] = [...set].slice(-MAX_BLOCKS); save();
      return send(res, 200, { blocks: db.blocks[me.id] });
    }
    if (b === 'reports' && c && m === 'POST') {
      if (!staff(me)) return fail(res, 403, 'hosts and mods only');
      const r = db.reports.find(x => x.id === c); if (!r) return fail(res, 404, 'no such report');
      const body = await readBody(req);
      if (!['open', 'resolved', 'dismissed'].includes(body.status)) return fail(res, 400, 'status must be open, resolved or dismissed');
      r.status = body.status; r.handledBy = me.id; r.handledAt = new Date().toISOString(); save();
      return send(res, 200, { report: r });
    }
    if (b === 'filter' && m === 'PUT') {
      if (!['host', 'admin'].includes(me.role)) return fail(res, 403, 'the host or an admin only');
      const body = await readBody(req);
      const words = [...new Set((Array.isArray(body.words) ? body.words : String(body.words || '').split(/[\n,]/)).map(w => str(w, 40).toLowerCase()).filter(Boolean))].slice(0, MAX_WORDS);
      db.filter.words = words; compile(); save();
      return send(res, 200, { filter: { words } });
    }
    return fail(res, 404, 'not found');
  }

  const reload = () => { db = load(); compile(); };
  return { route, clean, isBlocked, blocksOf, reload, REASONS };
};
