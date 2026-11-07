// Bug inbox: self-sorting (triage by brain or heuristics), self-healing (duplicates merge,
// bugs resolve when their linked task is done). One Markdown file per bug in bugs/.
'use strict';

const bus = require('./bus');
const SEVERITIES = ['critical', 'high', 'normal', 'low'];
const AREAS = ['ui', 'sync', 'docs', 'tasks', 'board', 'brain', 'install', 'other'];

module.exports = function bugs({ store, id, str, broadcast, postChat, brain, createTask, getTask }) {
  const rel = b => `bugs/${b.id}.md`;
  const all = () => store.listMd('bugs').map(f => { const r = store.readMd(f); return r && { ...r.meta, body: r.body }; }).filter(b => b && b.id);
  const load = bid => { const r = store.readMd(`bugs/${bid}.md`); return r && { ...r.meta, body: r.body }; };
  const save = b => { const { body = '', ...meta } = b; store.writeMd(rel(b), meta, body); broadcast({ type: 'bug', bug: b }); return b; };

  const words = t => new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2));
  function similar(a, b) {
    const A = words(a), B = words(b); if (!A.size || !B.size) return 0;
    let n = 0; for (const w of A) if (B.has(w)) n++;
    return n / (A.size + B.size - n);
  }

  function heuristic(text) {
    const t = text.toLowerCase();
    const severity = /crash|data loss|lost (my )?work|cannot start|won'?t (open|start)|corrupt/.test(t) ? 'critical'
      : /error|exception|broken|fails?|can'?t|cannot|stuck|freez/.test(t) ? 'high'
      : /typo|color|colour|spacing|align|cosmetic|nit/.test(t) ? 'low' : 'normal';
    const area = /sync|connect|socket|offline|reconnect/.test(t) ? 'sync' : /doc|markdown|editor/.test(t) ? 'docs'
      : /task|board|drag|kanban/.test(t) ? 'tasks' : /proposal|vote|milestone/.test(t) ? 'board' : /brain|ollama|summary|standup/.test(t) ? 'brain'
      : /install|update|exe|launch/.test(t) ? 'install' : /button|layout|theme|ui|screen|modal|click/.test(t) ? 'ui' : 'other';
    return { severity, area };
  }

  async function triage(b) {
    let out = heuristic(`${b.title}\n${b.body}`);
    try {
      const r = brain && await brain.generate(`Bug report:\n${b.title}\n${String(b.body).slice(0, 3000)}\n\nReply with exactly two words: severity (critical, high, normal or low) and area (${AREAS.join(', ')}).`, { maxTokens: 12 });
      if (r) { const [sv, ar] = r.toLowerCase().split(/\W+/).filter(Boolean); if (SEVERITIES.includes(sv)) { out.severity = sv; out.by = 'brain'; } if (AREAS.includes(ar)) { out.area = ar; out.by = 'brain'; } }
    } catch {}
    return out;
  }

  async function report({ title, details = '', logs = '', view = '', version = '', auto = false }, me) {
    title = str(title, 160) || 'Untitled bug';
    const now = new Date().toISOString();
    // Self-healing #1: merge duplicates instead of piling up reports.
    const dup = all().find(x => x.status !== 'resolved' && similar(x.title, title) >= 0.6);
    if (dup) {
      dup.count = (dup.count || 1) + 1; dup.lastSeen = now; dup.reporters = [...new Set([...(dup.reporters || []), me.id])];
      if (logs) dup.body += `\n\n### Also seen ${now.slice(0, 16).replace('T', ' ')} by ${me.name}\n\`\`\`\n${str(logs, 4000)}\n\`\`\``;
      if (dup.count >= 3 && SEVERITIES.indexOf(dup.severity) > 1) dup.severity = 'high';
      save(dup);
      return { bug: dup, merged: true };
    }
    const body = [str(details, 8000), view && `**Where:** ${view}`, version && `**Version:** ${version}`, logs && `### Logs\n\`\`\`\n${str(logs, 8000)}\n\`\`\``].filter(Boolean).join('\n\n');
    const b = { id: `b-${Date.now().toString(36)}-${id(3).toLowerCase()}`, title, status: 'new', severity: 'normal', area: 'other', by: me.id, created: now, lastSeen: now, count: 1, reporters: [me.id], auto: !!auto, body };
    Object.assign(b, await heuristic(`${title}\n${body}`)); save(b);
    if (!auto) postChat('general', 'tribecode', `🐞 ${me.name} reported a bug: **${title}**`);
    const critical = x => bus.notify({ type: 'bug-critical', priority: 'high', from: auto ? null : me.id, title: `Critical bug: ${x.title}`.slice(0, 160), body: `${x.area} · reported by ${me.name}`, view: 'bugs', ref: x.id });
    if (b.severity === 'critical') critical(b);
    triage(b).then(t => { const fresh = load(b.id); if (fresh && fresh.status === 'new') { const was = fresh.severity; Object.assign(fresh, { severity: t.severity, area: t.area, status: 'triaged', triagedBy: t.by || 'rules' }); save(fresh); if (fresh.severity === 'critical' && was !== 'critical') critical(fresh); } });
    return { bug: b, merged: false };
  }

  // Self-healing #2: when a linked task is done, the bug resolves itself (and reopens if the task reopens).
  function onTask(task) {
    for (const b of all().filter(x => x.task === task.id)) {
      if (task.status === 'done' && b.status !== 'resolved') { b.status = 'resolved'; b.resolved = new Date().toISOString(); save(b); postChat('general', 'tribecode', `✅ Bug resolved by finishing its task: **${b.title}**`); }
      else if (task.status !== 'done' && b.status === 'resolved') { b.status = 'triaged'; delete b.resolved; save(b); }
    }
  }

  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (m === 'GET' && !b) {
      const order = { critical: 0, high: 1, normal: 2, low: 3 };
      return send(res, 200, { bugs: all().sort((x, y) => (x.status === 'resolved') - (y.status === 'resolved') || order[x.severity] - order[y.severity] || String(y.lastSeen).localeCompare(String(x.lastSeen))) });
    }
    if (m === 'POST' && !b) { const body = await readBody(req); return send(res, 200, await report(body, me)); }
    const bug = b && load(b); if (!bug) return fail(res, 404, 'bug not found');
    if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
    if (m === 'POST' && c === 'task') {
      if (bug.task && getTask(bug.task)) return send(res, 200, { bug, task: getTask(bug.task) });
      const t = createTask({ title: `Fix: ${bug.title}`, by: me.id, source: 'bug', body: `Bug ${bug.id} (${bug.severity}, ${bug.area}).\n\n${bug.body.slice(0, 4000)}` });
      bug.task = t.id; bug.status = bug.status === 'resolved' ? 'triaged' : bug.status; save(bug);
      return send(res, 200, { bug, task: t });
    }
    if (m === 'PATCH') {
      const body = await readBody(req);
      if (SEVERITIES.includes(body.severity)) bug.severity = body.severity;
      if (AREAS.includes(body.area)) bug.area = body.area;
      if (['new', 'triaged', 'resolved', 'wontfix'].includes(body.status)) { bug.status = body.status; if (body.status === 'resolved') bug.resolved = new Date().toISOString(); }
      return send(res, 200, { bug: save(bug) });
    }
    return null;
  }

  return { route, report, onTask };
};
