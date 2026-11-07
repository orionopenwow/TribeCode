// Person view: click anyone (a human or an agent) and see what they and their Claude are doing, in the
// context of the project's chat.
//   GET /api/people                      status line: host uptime + project commit counter
//   GET /api/people/:id                  { member, presence, now, context, timeline, counters }
//         ?kind=all|commit|prompt|chat|note  &before=<iso>  &limit=30
//   GET /api/people/:id/commit/:sha      diff summary of one of their commits (files, +/-)
//   GET /api/people/:id/around?at=<iso>  the project chat around a moment (for commits and prompts)
// Everything is project-scoped: the request runs in one project (X-Project / ?project=), and the person
// must belong to that project too, otherwise 403.
//
// Agent prompts: every MCP tool call that does something (not reads) is logged per project in
// .tribe/people/<project>.jsonl, plus what Claude Code shares itself with share_prompt / report_context
// (server/mcp-people.js). The latest context report per agent lives in .tribe/people/context.json.
'use strict';
const fs = require('node:fs');
const { run } = require('./gitutil');

const STARTED = Date.now();
const SKIP = new Set(['tribe_overview', 'my_lane', 'check_messages', 'agents_read', 'list_projects', 'check_approval', 'get_context', 'read_vision', 'post_chat', 'reply',
  'share_prompt', 'report_context', 'release_file']);
const VERB = {
  suggest_task: () => 'Asked for the next task',
  request_review: a => `Asked for review: ${a.title || a.branch || ''}`,
  message_agent: a => `To ${a.to || 'an agent'}: ${a.text || ''}`,
  agents_post: a => `In #agents: ${a.text || ''}`,
  handoff: a => `Handed off: ${a.title || ''}${a.to ? ` → ${a.to}` : ''}`,
  delegate: a => `Delegated ${a.title || a.task_id || 'a task'}${a.to ? ` to ${a.to}` : ''}`,
  accept_delegation: () => 'Accepted a delegation',
  decline_delegation: a => `Declined a delegation${a.reason ? `: ${a.reason}` : ''}`,
  post_gist: a => a.text || a.summary || a.title || 'Posted a gist',
  propose: a => `Proposed: ${a.title || ''}`,
  request_approval: a => `Asked to: ${a.title || ''}`,
  create_task: a => `New task: ${a.title || ''}`,
  update_task: a => `Task ${a.status ? `→ ${a.status}` : 'update'}${a.note ? `: ${a.note}` : a.title ? `: ${a.title}` : ''}`,
  claim_file: a => `Claimed ${a.path || ''}${a.note ? ` (${a.note})` : ''}`,
  write_doc: a => `Wrote ${a.name || 'a doc'}`,
  recommend: a => `Recommended: ${a.title || a.text || ''}`,
  add_visual: a => `Shared a screenshot${a.title ? `: ${a.title}` : ''}`,
};
const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };   // commit dates carry offsets; sort in UTC
const plain = s => String(s || '').replace(/\*\*|__|`/g, '');   // chat Markdown -> one plain line
const clip = (s, n = 160) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

module.exports = function people({ P, store, getMembers, presenceFor, claims, coord, docs, loadTasks, nameOf, emailOf, isHost = m => m && m.role === 'host' }) {
  fs.mkdirSync(store.p('.tribe/people'), { recursive: true });
  const pid = () => P.current() || P.defaultId();
  const logRel = p => `.tribe/people/${p}.jsonl`;
  const CTX = '.tribe/people/context.json';
  let ctx = store.readJSON(CTX, {});
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const isAgent = m => !!m && m.role === 'agent';
  const err = (status, msg) => Object.assign(new Error(msg), { status });

  // ---------- agent prompts / requests ----------
  function log(me, kind, tool, text, extra = {}) {
    const t = clip(text, 240); if (!t) return null;
    const rec = { at: new Date().toISOString(), by: me.id, kind, tool, text: t, ...extra };
    try { store.appendJSONL(logRel(pid()), rec); } catch {}
    return rec;
  }
  function logAgentCall(me, tool, args = {}) {
    if (!isAgent(me) || SKIP.has(tool) || /^(list|read|get|check)_/.test(tool)) return;
    const f = VERB[tool];
    const firstStr = Object.values(args).find(v => typeof v === 'string' && v.trim());
    log(me, 'call', tool, f ? f(args) : `${tool.replace(/_/g, ' ')}${firstStr ? `: ${firstStr}` : ''}`);
  }
  function sharePrompt(me, summary) {
    const r = log(me, 'prompt', 'share_prompt', summary);
    if (!r) throw err(400, 'summary is empty');
    return r;
  }
  function reportContext(me, { used_pct, focus }) {
    const k = `${pid()}:${me.id}`, prev = ctx[k] || {};
    const pct = Number.isFinite(Number(used_pct)) && used_pct !== null && used_pct !== '' ? Math.max(0, Math.min(100, Math.round(Number(used_pct)))) : prev.pct ?? null;
    const f = clip(focus, 200) || prev.focus || '';
    ctx[k] = { pct, focus: f, at: new Date().toISOString() };
    store.writeJSON(CTX, ctx);
    if (f && f !== prev.focus) log(me, 'focus', 'report_context', `Focus: ${f}`);
    return ctx[k];
  }
  const contextOf = agentId => { const c = ctx[`${pid()}:${agentId}`]; return c ? { usedPct: c.pct, focus: c.focus, at: c.at } : null; };

  // ---------- git (the project's repo) ----------
  const cache = new Map();   // repo -> { at, commits, total }
  async function commits() {
    const p = P.get(pid()); const repo = p && p.repo;
    if (!repo || !fs.existsSync(repo)) return { commits: [], total: 0, repo: null };
    const c = cache.get(repo); if (c && Date.now() - c.at < 5000) return c;
    const r = await run('git', ['log', '--all', '-n', '400', '--name-only', '--format=%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%cI%x1f%s'], { cwd: repo, timeout: 15_000 });
    const list = r.code ? [] : r.out.split('\x1e').filter(s => s.trim()).map(block => {
      const [head, ...rest] = block.split('\n');
      const [sha, short, author, email, at, subject] = head.split('\x1f');
      return { sha, short, author, email: String(email || '').toLowerCase(), at: iso(at), subject, files: rest.map(s => s.trim()).filter(Boolean) };
    });
    const t = await run('git', ['rev-list', '--count', '--all'], { cwd: repo, timeout: 10_000 });
    const out = { at: Date.now(), commits: list, total: t.code ? list.length : Number(t.out) || 0, repo };
    cache.set(repo, out);
    return out;
  }
  function authoredBy(c, m) {
    if (!m) return false;
    const names = [m.name].filter(Boolean).map(s => s.toLowerCase());
    const emails = [`${m.id}@tribecode.local`.toLowerCase(), m.email && m.email.toLowerCase(), emailOf && !isAgent(m) ? emailOf(m).toLowerCase() : null].filter(Boolean);
    return names.includes(String(c.author || '').toLowerCase()) || emails.includes(c.email);
  }
  const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  async function diff(sha) {
    if (!/^[0-9a-f]{4,40}$/i.test(sha)) throw err(400, 'bad commit id');
    const p = P.get(pid()); if (!p || !p.repo) throw err(404, 'this project has no repo');
    const r = await run('git', ['show', '--numstat', '--format=%H%x1f%h%x1f%an%x1f%cI%x1f%s%x1f%b%x1e', sha], { cwd: p.repo, timeout: 15_000 });
    if (r.code) throw err(404, 'commit not found');
    const [head, stat = ''] = r.out.split('\x1e');
    const [full, short, author, at, subject, body] = head.split('\x1f');
    const files = stat.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [a, d, ...f] = l.split('\t'); return { path: f.join('\t'), add: a === '-' ? null : Number(a), del: d === '-' ? null : Number(d) }; });
    return { sha: full, short, author, at: iso(at), subject, body: clip(body, 600), files: files.slice(0, 40), more: Math.max(0, files.length - 40) };
  }

  // ---------- access ----------
  // The person must be in this project (an agent through its owner) and visible to the viewer.
  function visible(me, mid) {
    const m = member(mid); if (!m) throw err(404, 'no such person');
    const src = isAgent(m) ? member(m.owner) || m : m;
    if (!P.canSee(src, pid()) || !presenceFor(me).some(x => x.id === m.id)) throw err(403, 'that person is not in this project');
    return m;
  }

  // ---------- one person ----------
  function chatOf(mid, limit = 3000) {
    return store.readJSONL('chat/general.jsonl', limit).filter(x => x.by === mid && !x.deleted)
      .map(x => ({ kind: 'chat', at: x.at, id: x.id, text: clip(plain(x.text) || (x.media ? (x.media.kind === 'voice' ? 'Voice note' : 'Image') : ''), 220) }));
  }
  function promptsOf(ids, limit = 2000) {
    return store.readJSONL(logRel(pid()), limit).filter(x => ids.includes(x.by))
      .map(x => ({ kind: 'prompt', at: x.at, tool: x.tool, text: x.text, by: x.by, byName: nameOf(x.by), shared: x.kind === 'prompt' }));
  }
  function notesOf(mid) {
    return docs.list().filter(d => d.by === mid || d.updatedBy === mid)
      .map(d => ({ kind: 'note', at: d.updated || d.created, slug: d.slug, title: d.title, verb: d.updatedBy === mid && d.by !== mid ? 'edited' : 'wrote', words: d.words }));
  }
  async function view(me, mid, { kind = 'all', before = null, limit = 30 } = {}) {
    const m = visible(me, mid);
    const agent = isAgent(m) ? null : getMembers().find(x => isAgent(x) && x.owner === m.id) || null;
    const pres = presenceFor(me), here = pres.find(x => x.id === m.id) || {};
    const ag = agent && pres.find(x => x.id === agent.id);
    const panel = (() => { try { return coord.agents(me); } catch { return []; } })();
    const agRow = id => panel.find(a => a.id === id) || null;
    const tasks = loadTasks().filter(t => t.status !== 'done');
    const taskOf = id => { const t = tasks.find(x => x.assignee === id && x.status === 'doing') || tasks.find(x => x.assignee === id && x.status !== 'backlog') || null; return t && { id: t.id, title: t.title, status: t.status }; };
    const cl = claims.list().filter(c => !c.project || c.project === pid());
    const lanes = (() => { try { return (coord.ownership(me).owners.find(o => o.id === m.id) || { lanes: [] }).lanes.map(l => l.area); } catch { return []; } })();
    const g = await commits();
    const mine = g.commits.filter(c => authoredBy(c, m));
    const agentId = isAgent(m) ? m.id : agent && agent.id;
    const ctxNow = agentId ? contextOf(agentId) : null;

    const all = [
      ...mine.map(c => ({ kind: 'commit', at: c.at, sha: c.sha, short: c.short, text: c.subject, files: c.files.slice(0, 6), moreFiles: Math.max(0, c.files.length - 6) })),
      ...chatOf(m.id),
      ...promptsOf([m.id, ...(agent ? [agent.id] : [])]),
      ...notesOf(m.id),
    ].filter(x => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const kinds = { commit: 0, prompt: 0, chat: 0, note: 0 }; all.forEach(x => kinds[x.kind]++);
    const pool = all.filter(x => kind === 'all' || x.kind === kind).filter(x => !before || String(x.at) < before);
    const n = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const items = pool.slice(0, n);
    const today = midnight();

    return {
      member: { id: m.id, name: m.name, color: m.color, role: m.role, joined: m.joined, agent: isAgent(m), owner: m.owner || null, ownerName: m.owner ? nameOf(m.owner) : null,
        host: isHost(m), you: m.id === me.id, agentOf: agent ? { id: agent.id, name: agent.name } : null, projectRole: (P.get(pid()).members || {})[isAgent(m) ? m.owner : m.id] || null },
      presence: { online: !!here.online, where: here.where || null, since: here.since || null },
      now: {
        task: taskOf(m.id), files: cl.filter(c => c.by === m.id).map(c => ({ path: c.path, note: c.note })), lanes,
        agent: agentId && !isAgent(m) ? (() => { const r = agRow(agentId) || {}; return { id: agentId, name: agent.name, online: !!(ag && ag.online), where: ag && ag.online ? ag.where : null, task: taskOf(agentId) || r.task || null, files: cl.filter(c => c.by === agentId).map(c => ({ path: c.path, note: c.note })), control: r.control || null }; })() : null,
        control: isAgent(m) ? (agRow(m.id) || {}).control || null : null,
      },
      context: ctxNow,
      timeline: { items, more: pool.length > n, next: pool.length > n ? items[items.length - 1].at : null, kinds },
      counters: {
        commits: mine.length, commitsToday: mine.filter(c => Date.parse(c.at) >= today).length,
        projectCommits: g.total, projectToday: g.commits.filter(c => Date.parse(c.at) >= today).length,
        uptimeSec: isHost(m) ? Math.round((Date.now() - STARTED) / 1000) : null, startedAt: isHost(m) ? new Date(STARTED).toISOString() : null,
      },
    };
  }
  function around(at, n = 3) {
    const t = Date.parse(at); if (!Number.isFinite(t)) throw err(400, 'at must be a time');
    const list = store.readJSONL('chat/general.jsonl', 3000).filter(x => !x.deleted);
    let i = list.findIndex(x => Date.parse(x.at) >= t); if (i < 0) i = list.length;
    return list.slice(Math.max(0, i - n), i + n).map(x => ({ id: x.id, at: x.at, by: x.by, name: x.by === 'tribecode' ? 'TribeCode' : nameOf(x.by), text: clip(plain(x.text) || (x.media ? 'Voice note' : ''), 160), after: Date.parse(x.at) >= t }));
  }
  async function status() {
    const g = await commits(), today = midnight();
    return { startedAt: new Date(STARTED).toISOString(), uptimeSec: Math.round((Date.now() - STARTED) / 1000), commitsToday: g.commits.filter(c => Date.parse(c.at) >= today).length, commitsTotal: g.total, repo: !!g.repo };
  }

  async function route(req, res, { m, b, c, parts, me, url, send, fail }) {
    if (m !== 'GET') return null;
    try {
      if (!b) return send(res, 200, { status: await status() });
      const mid = decodeURIComponent(b);
      if (!c) {
        const q = url.searchParams;
        const kind = ['commit', 'prompt', 'chat', 'note'].includes(q.get('kind')) ? q.get('kind') : 'all';
        return send(res, 200, await view(me, mid, { kind, before: q.get('before') || null, limit: q.get('limit') }));
      }
      visible(me, mid);
      if (c === 'commit' && parts[3]) return send(res, 200, { commit: await diff(parts[3]) });
      if (c === 'around') return send(res, 200, { messages: around(url.searchParams.get('at')) });
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }

  return { route, view, status, logAgentCall, sharePrompt, reportContext, contextOf, startedAt: STARTED };
};
module.exports.STARTED = STARTED;
