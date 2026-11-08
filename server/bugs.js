// Bug inbox: self-sorting (triage by brain or heuristics), self-healing (duplicates merge,
// bugs resolve when their linked task is done). One Markdown file per bug in bugs/.
// Triage columns: New (new|triaged) → Confirmed → In progress → Fixed (resolved); closed = wontfix|duplicate.
// Each bug can carry repro steps, screenshots/attachments (uploads/bugs/), an assignee (a person or an
// agent: "Give to agent"), a linked task and branch, and a duplicate-of link.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const bus = require('./bus');
const SEVERITIES = ['critical', 'high', 'normal', 'low'];
const AREAS = ['ui', 'sync', 'docs', 'tasks', 'board', 'brain', 'install', 'other'];
const STATUSES = ['new', 'triaged', 'confirmed', 'progress', 'resolved', 'wontfix', 'duplicate'];
const CLOSED = ['resolved', 'wontfix', 'duplicate'];
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain; charset=utf-8', log: 'text/plain; charset=utf-8', json: 'application/json', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm' };

module.exports = function bugs({ store, id, str, broadcast, postChat, brain, createTask, getTask, saveTask = null, getMembers = () => [], tellAgent = () => {}, can = () => true }) {   // can(me, cap): feat/roles tasks.triage
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

  async function report({ title, details = '', repro = '', logs = '', view = '', version = '', auto = false }, me) {
    title = str(title, 160) || 'Untitled bug';
    const now = new Date().toISOString();
    // Self-healing #1: merge duplicates instead of piling up reports.
    const dup = all().find(x => !CLOSED.includes(x.status) && similar(x.title, title) >= 0.6);
    if (dup) {
      dup.count = (dup.count || 1) + 1; dup.lastSeen = now; dup.reporters = [...new Set([...(dup.reporters || []), me.id])];
      if (logs) dup.body += `\n\n### Also seen ${now.slice(0, 16).replace('T', ' ')} by ${me.name}\n\`\`\`\n${str(logs, 4000)}\n\`\`\``;
      if (dup.count >= 3 && SEVERITIES.indexOf(dup.severity) > 1) dup.severity = 'high';
      save(dup);
      return { bug: dup, merged: true };
    }
    const body = [str(details, 8000), view && `**Where:** ${view}`, version && `**Version:** ${version}`, logs && `### Logs\n\`\`\`\n${str(logs, 8000)}\n\`\`\``].filter(Boolean).join('\n\n');
    const b = { id: `b-${Date.now().toString(36)}-${id(3).toLowerCase()}`, title, status: 'new', severity: 'normal', area: 'other', by: me.id, created: now, lastSeen: now, count: 1, reporters: [me.id], auto: !!auto, repro: str(repro, 4000) || undefined, body };
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
      else if (task.status !== 'done' && b.status === 'resolved') { b.status = task.status === 'doing' ? 'progress' : 'confirmed'; delete b.resolved; save(b); }
      else if (task.status === 'doing' && ['new', 'triaged', 'confirmed'].includes(b.status)) { b.status = 'progress'; save(b); }
    }
  }

  // ---------- attachments: uploads/bugs/<bug id>/<safe name>, never outside the tribe folder ----------
  const fdir = bid => store.p('uploads', 'bugs', bid);
  const safeName = n => String(n || 'file').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(-80) || 'file';
  function attach(bug, { name, data }, me) {
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
    if (!m) throw Object.assign(new Error('send the file as a data: URL'), { status: 400 });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) throw Object.assign(new Error('attachments are limited to 8 MB'), { status: 413 });
    let n = safeName(name); if (!/\.\w{1,5}$/.test(n)) n += '.' + ((m[1].split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin');
    const dir = fdir(bug.id); fs.mkdirSync(dir, { recursive: true });
    let final = n, k = 2; while (fs.existsSync(path.join(dir, final))) final = n.replace(/(\.\w+)?$/, `-${k++}$1`);
    const full = path.join(dir, final); if (!full.startsWith(store.p('uploads'))) throw Object.assign(new Error('bad file name'), { status: 400 });
    fs.writeFileSync(full, buf);
    bug.attachments = [...(bug.attachments || []), { name: final, type: m[1], size: buf.length, by: me.id, at: new Date().toISOString() }].slice(-20);
    return save(bug);
  }
  // Copy as Markdown for Claude: everything an agent needs to fix it.
  function markdown(b) {
    return [`# Bug: ${b.title}`, `- id: ${b.id}`, `- severity: ${b.severity} · area: ${b.area} · status: ${b.status}`, b.count > 1 ? `- seen ${b.count} times` : '', b.task ? `- task: ${b.task}` : '', b.branch ? `- branch: ${b.branch}` : '',
      b.repro ? `\n## Steps to reproduce\n${b.repro}` : '', b.body ? `\n## Details\n${b.body}` : '', (b.attachments || []).length ? `\n## Attachments\n${b.attachments.map(a => `- ${a.name} (${a.type})`).join('\n')}` : '',
      '\n## Ask\nFind the root cause, fix it on its own branch, add a test if you can, then call request_review.'].filter(Boolean).join('\n');
  }
  function linkTask(bug, me, assignee) {
    let t = bug.task && getTask(bug.task);
    if (!t) { t = createTask({ title: `Fix: ${bug.title}`, by: me.id, source: 'bug', assignee: assignee || null, status: assignee ? 'doing' : 'backlog', body: `Bug ${bug.id} (${bug.severity}, ${bug.area}).\n\n${bug.repro ? '## Steps to reproduce\n' + bug.repro + '\n\n' : ''}${String(bug.body || '').slice(0, 4000)}` }); bug.task = t.id; }
    else if (assignee && t.assignee !== assignee && saveTask) { t.assignee = assignee; if (t.status === 'backlog') t.status = 'doing'; t.updated = new Date().toISOString(); t.updatedBy = me.id; saveTask(t); }
    if (!bug.branch) bug.branch = `task/${t.id}`;
    return t;
  }

  async function route(req, res, { m, b, c, parts = [], me, readBody, send, fail }) {
    if (m === 'GET' && !b) {
      const order = { critical: 0, high: 1, normal: 2, low: 3 };
      return send(res, 200, { bugs: all().sort((x, y) => CLOSED.includes(x.status) - CLOSED.includes(y.status) || order[x.severity] - order[y.severity] || String(y.lastSeen).localeCompare(String(x.lastSeen))) });
    }
    if (m === 'POST' && !b) { const body = await readBody(req); return send(res, 200, await report(body, me)); }
    const bug = b && load(b); if (!bug) return fail(res, 404, 'bug not found');
    if (m === 'GET' && c === 'files' && parts[3]) {
      const n = safeName(decodeURIComponent(parts[3])), full = path.join(fdir(bug.id), n);
      if (!(bug.attachments || []).some(a => a.name === n) || !fs.existsSync(full)) return fail(res, 404, 'no such file');
      res.writeHead(200, { 'Content-Type': MIME[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream', 'Content-Disposition': `inline; filename="${n}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' });
      return res.end(fs.readFileSync(full));
    }
    if (m === 'GET' && c === 'markdown') return send(res, 200, { markdown: markdown(bug) });
    if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
    if (m === 'POST' && c === 'task') {
      if (bug.task && getTask(bug.task)) return send(res, 200, { bug, task: getTask(bug.task) });
      const t = linkTask(bug, me); bug.status = CLOSED.includes(bug.status) ? 'confirmed' : bug.status; save(bug);
      return send(res, 200, { bug, task: t });
    }
    if (m === 'POST' && c === 'agent') {   // "Give to agent": your Claude Code gets the bug, a task and a branch
      const body = await readBody(req);
      const ag = getMembers().find(x => x.role === 'agent' && (body.agent ? x.id === body.agent && (x.owner === me.id || me.role === 'host') : x.owner === (me.role === 'agent' ? me.owner : me.id)));
      if (!ag) return fail(res, 400, body.agent ? 'that agent is not yours' : 'Connect your Claude Code first (right panel → Connect your Claude Code)');
      bug.assignee = ag.id; bug.status = 'progress';
      const t = linkTask(bug, me, ag.id); save(bug);
      tellAgent(ag.id, 'bug', `${me.name} gave you bug ${bug.id}: "${bug.title}". Task ${t.id}, branch ${bug.branch}. Read it with list_tasks; details:\n${markdown(bug).slice(0, 1500)}`, me.id);
      postChat('general', 'tribecode', `🐞 ${me.name} gave **${bug.title}** to ${ag.name}`);
      return send(res, 200, { bug, task: t, agent: { id: ag.id, name: ag.name } });
    }
    if (m === 'POST' && c === 'duplicate') {   // merge into another bug: counts, reporters, notes
      const body = await readBody(req); const into = body.of && load(String(body.of));
      if (!into || into.id === bug.id) return fail(res, 400, 'pick the bug this one duplicates');
      into.count = (into.count || 1) + (bug.count || 1); into.reporters = [...new Set([...(into.reporters || []), ...(bug.reporters || [])])];
      into.attachments = [...(into.attachments || []), ...(bug.attachments || []).map(a => ({ ...a, from: bug.id }))].slice(-20);
      into.body += `\n\n### Merged duplicate ${bug.id} (${me.name})\n${bug.title}${bug.repro ? '\n\n' + bug.repro : ''}`;
      if (SEVERITIES.indexOf(bug.severity) < SEVERITIES.indexOf(into.severity)) into.severity = bug.severity;
      bug.status = 'duplicate'; bug.dupOf = into.id; save(bug); save(into);
      return send(res, 200, { bug, into });
    }
    if (m === 'POST' && c === 'attach') { const body = await readBody(req, 12 * 1024 * 1024); try { return send(res, 200, { bug: attach(bug, body, me) }); } catch (e) { return fail(res, e.status || 400, e.message); } }
    if (m === 'PATCH') {
      const mine = (bug.reporters || []).includes(me.id) || bug.by === me.id || bug.assignee === me.id;
      if (!mine && !can(me, 'tasks.triage')) return fail(res, 403, 'your role can only change bugs you reported or own');   // feat/roles
      const body = await readBody(req);
      if (SEVERITIES.includes(body.severity)) bug.severity = body.severity;
      if (AREAS.includes(body.area)) bug.area = body.area;
      if (STATUSES.includes(body.status)) { bug.status = body.status; if (body.status === 'resolved') bug.resolved = new Date().toISOString(); else delete bug.resolved; if (body.status !== 'duplicate') delete bug.dupOf; }
      if (body.assignee !== undefined) { const to = body.assignee === 'me' ? me.id : body.assignee; bug.assignee = to && getMembers().some(x => x.id === to) ? to : undefined; if (bug.assignee && ['new', 'triaged'].includes(bug.status)) bug.status = 'confirmed'; }
      if (body.repro !== undefined) bug.repro = str(body.repro, 4000) || undefined;
      if (body.branch !== undefined) bug.branch = str(body.branch, 120).replace(/[^\w./-]/g, '') || undefined;
      if (body.title !== undefined) bug.title = str(body.title, 160) || bug.title;
      return send(res, 200, { bug: save(bug) });
    }
    return null;
  }

  return { route, report, onTask, markdown, STATUSES };
};
