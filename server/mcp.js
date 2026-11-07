// MCP endpoint (Streamable HTTP, JSON responses) so each member's Claude Code joins the tribe:
//   claude mcp add --transport http tribecode http://HOST:4747/mcp --header "Authorization: Bearer <agent token>"
// Agents show up in the room, read/update tasks and docs, chat, and claim files.
'use strict';

module.exports = function mcp({ extra = {}, scope = (me, wanted, fn) => fn(), projects = () => [], VERSION, tribe, presence, touchAgent, tasks, docs, chat, claims, board, readVision, approvals, extraTools = {}, coordTools = null }) {
  const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
  const err = (t) => ({ content: [{ type: 'text', text: t }], isError: true });
  const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
  const str = (d) => ({ type: 'string', description: d });

  const TOOLS = {
    tribe_overview: {
      description: 'Start here. Who is online and what they are doing, the project vision, open proposals, active file claims, and tasks assigned to you.',
      inputSchema: S({}),
      run: (_, me) => {
        const t = tasks.all();
        return text({ tribe: tribe.name, you: me.name, online: presence().filter(m => m.online).map(m => `${m.name}${m.role === 'agent' ? ' (agent)' : ''}: ${m.where || 'Home'}`),
          vision: readVision().trim().slice(0, 1500) || '(no VISION.md yet)', openProposals: board.open().map(p => p.title),
          claims: claims.list().map(c => `${c.path} (${c.name})`), yourTasks: t.filter(x => x.assignee === me.id || x.assignee === me.owner).map(x => `${x.id} [${x.status}] ${x.title}`),
          board: { backlog: t.filter(x => x.status === 'backlog').length, doing: t.filter(x => x.status === 'doing').length, review: t.filter(x => x.status === 'review').length, done: t.filter(x => x.status === 'done').length } });
      },
    },
    list_tasks: {
      description: 'List tasks on the shared board. Optional status filter: backlog, doing, review, done.',
      inputSchema: S({ status: { type: 'string', enum: ['backlog', 'doing', 'review', 'done'] } }),
      run: ({ status }) => text(tasks.all().filter(t => !status || t.status === status).map(t => ({ id: t.id, status: t.status, title: t.title, assignee: t.assigneeName || null, branch: `task/${t.id}` }))),
    },
    create_task: {
      description: 'Add a task to the board (lands in backlog unless a status is given).',
      inputSchema: S({ title: str('Short task title'), details: str('Optional Markdown details'), status: { type: 'string', enum: ['backlog', 'doing', 'review', 'done'] } }, ['title']),
      run: ({ title, details, status }, me) => { const t = tasks.create({ title, body: details, status, by: me.id }); return text(`Created ${t.id}: ${t.title}`); },
    },
    update_task: {
      description: 'Move a task, rename it, take it yourself, or add a progress note. Use the id from list_tasks.',
      inputSchema: S({ id: str('Task id'), status: { type: 'string', enum: ['backlog', 'doing', 'review', 'done'] }, title: str('New title'), take: { type: 'boolean', description: 'Assign the task to yourself' }, note: str('Progress note appended to the task') }, ['id']),
      run: (a, me) => { const t = tasks.update(a.id, a, me); return t ? text(`Updated ${t.id}: [${t.status}] ${t.title}`) : err(`No task with id ${a.id}`); },
    },
    list_docs: { description: 'List shared docs (Markdown pages) with their TL;DRs.', inputSchema: S({}), run: () => text(docs.list().map(d => ({ name: d.slug, title: d.title, updated: d.updated, tldr: d.summary || undefined }))) },
    read_doc: {
      description: 'Read a shared doc by name (from list_docs) or title.',
      inputSchema: S({ name: str('Doc name or title') }, ['name']),
      run: ({ name }) => { const d = docs.find(name); return d ? text(`# ${d.title}\n(version ${d.version}, name ${d.slug})\n\n${d.body}`) : err(`No doc called "${name}". Use list_docs.`); },
    },
    write_doc: {
      description: 'Create a doc, or replace a doc\'s body. Pass base_version from read_doc when editing so you never overwrite a teammate\'s newer changes.',
      inputSchema: S({ name: str('Existing doc name, or a new title'), body: str('Full Markdown body'), base_version: { type: 'number', description: 'Version you read; required when editing an existing doc' } }, ['name', 'body']),
      run: ({ name, body, base_version }, me) => {
        const r = docs.upsert({ name, body, baseVersion: base_version, by: me.id });
        return r.conflict ? err(`Not saved: ${r.conflict}. Read the doc again, merge, and retry with the new base_version.`) : text(`Saved "${r.doc.title}" (name ${r.doc.slug}, version ${r.doc.version}).`);
      },
    },
    post_chat: { description: 'Post a message to the tribe chat (#general). Keep it short. "/task …" creates a task.', inputSchema: S({ text: str('Message') }, ['text']), run: ({ text: t }, me) => { chat.post(me, t); return text('Posted.'); } },
    read_chat: { description: 'Read recent chat messages from #general.', inputSchema: S({ limit: { type: 'number', description: 'How many (default 20, max 100)' } }), run: ({ limit }) => text(chat.recent(Math.min(Number(limit) || 20, 100))) },
    claim_file: {
      description: 'Softly claim a file or folder before editing it, so teammates and their agents avoid conflicting edits. Fails if someone else holds an overlapping claim.',
      inputSchema: S({ path: str('Repo-relative path, e.g. src/world/campfire.ts or src/ui/'), note: str('What you are doing') }, ['path']),
      run: ({ path, note }, me) => { const r = claims.claim(path, note, me); return r.conflict ? err(`${r.conflict.path} is claimed by ${r.conflict.name}${r.conflict.note ? ` (${r.conflict.note})` : ''}. Coordinate in chat or pick other files.`) : text(`Claimed ${r.claim.path}. Release it with release_file when done.`); },
    },
    release_file: { description: 'Release your claim on a file or folder.', inputSchema: S({ path: str('Path you claimed') }, ['path']), run: ({ path }, me) => text(claims.release(path, me) ? `Released ${path}.` : `You had no claim on ${path}.`) },
    list_claims: { description: 'Show who has claimed which files.', inputSchema: S({}), run: () => text(claims.list().map(c => ({ path: c.path, by: c.name, note: c.note, since: c.at }))) },
    read_vision: { description: 'Read VISION.md, the tribe\'s agreed direction. Check new work against it.', inputSchema: S({}), run: () => text(readVision() || '(no VISION.md yet)') },
    propose: {
      description: 'Open a proposal on the approval board for changes that alter the plan or scope. Use "- [ ] item" lines under ## Tasks; they become tasks if approved.',
      inputSchema: S({ title: str('Proposal title'), body: str('Markdown: problem, plan, tasks') }, ['title', 'body']),
      run: ({ title, body }, me) => { const p = board.propose(title, body, me); return text(`Proposal opened: ${p.title}. Teammates vote on the Board.`); },
    },
    request_approval: {
      description: 'Ask a human to approve something before you do it (deleting data, force-pushing, migrations, spending, anything risky or irreversible). Low/medium risk asks your owner; high risk asks every human. Their phone gets Approve/Deny buttons. Returns an id: poll check_approval and do not proceed while it is pending.',
      inputSchema: S({ title: str('What you want to do, in one line'), details: str('Why, what changes, how to undo it'), risk: { type: 'string', enum: ['low', 'medium', 'high'] }, kind: str('Short category, e.g. run-migration or install-dependency. Your human can always-allow low-risk kinds.') }, ['title']),
      run: (a, me) => { if (!approvals) return err('Approvals are not available on this server.'); const ap = approvals.create(a, me); return text({ id: ap.id, status: ap.status, askedOf: ap.toNames, note: ap.note || '', next: ap.status === 'approved' ? 'Already approved by a standing rule. Go ahead.' : `Call check_approval with id ${ap.id} in a minute or two. Do not proceed until it says approved.` }); },
    },
    check_approval: {
      description: 'Check an approval you requested: pending, approved or denied, plus the human\'s note and any questions they asked you (answer questions in chat, then keep polling).',
      inputSchema: S({ id: str('Approval id from request_approval') }, ['id']),
      run: ({ id }) => { const ap = approvals && approvals.get(id); return ap ? text({ id: ap.id, status: ap.status, note: ap.note || '', questions: ap.questions.map(q => ({ from: q.name, at: q.at, text: q.text })), decidedBy: ap.decidedByName, decidedAt: ap.decidedAt || null }) : err(`No approval with id ${id}`); },
    },
    ...extraTools,   // e.g. check_messages / reply (chatx.js)
  };
  if (extra.tools) Object.assign(TOOLS, extra.tools({ text, err, S, str })); // repo, context and integrator tools (server/repo.js)
  if (coordTools) Object.assign(TOOLS, coordTools({ text, err, S, str }));   // my_lane, suggest_task, handoff, request_review (server/coord.js)
  // Project rooms: every tool takes an optional `project` (default: the agent's project).
  TOOLS.list_projects = { description: 'List the projects (rooms) you can work in. Every tool takes an optional `project` id; without it you work in your own project (marked yours).', inputSchema: S({}), run: (a, me) => text(projects(me)) };
  const PROJECT_ARG = { type: 'string', description: 'Project id (see list_projects). Default: your project.' };
  const withProject = schema => ({ ...schema, properties: { ...(schema.properties || {}), project: PROJECT_ARG } });


  async function handle(msg, me) {
    const { id, method, params = {} } = msg;
    const reply = result => ({ jsonrpc: '2.0', id, result });
    if (method === 'initialize') return reply({ protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'tribecode', title: `TribeCode · ${tribe.name}`, version: VERSION },
      instructions: `You are ${me.name}, working in the TribeCode tribe "${tribe.name}" alongside humans and other agents. Call tribe_overview first, then my_lane (and again between steps: it carries pause/stop requests). Claim files before editing them, keep the board current (take a task, move it to review when done), respect VISION.md, and use propose for scope changes. When you finish, request_review; to pass work on, handoff; with nothing to do, suggest_task.${extra.instructions ? extra.instructions(me) : ''}` });
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: withProject(t.inputSchema) })) });
    if (method === 'tools/call') {
      const tool = TOOLS[params.name];
      if (!tool) return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params.name}` } };
      const { project, ...args } = params.arguments || {};
      try { return reply(await scope(me, project, async () => { touchAgent(me, params.name); return tool.run(args, me); })); } catch (e) { return reply(err(e.message || String(e))); }
    }
    if (method && method.startsWith('notifications/')) return null;
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }

  async function route(req, res, { me, readBody, send }) {
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
    if (!me) return send(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing or invalid TribeCode token' } });
    const body = await readBody(req, 16 * 1024 * 1024);   // screenshots (add_visual) can be large
    const batch = Array.isArray(body) ? body : [body];
    const out = (await Promise.all(batch.map(m => handle(m, me)))).filter(Boolean);
    if (!out.length) { res.writeHead(202, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
    return send(res, 200, Array.isArray(body) ? out : out[0]);
  }

  return { route, tools: Object.keys(TOOLS) };
};
