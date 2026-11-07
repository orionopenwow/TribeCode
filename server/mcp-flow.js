// MCP tools for the project flow (server/flow.js): agents report with gists instead of code dumps,
// read the living plan and their role. Merged into the MCP tool list through index.js (extraTools), so
// server/mcp.js stays untouched. Every tool also takes the usual optional `project` argument.
'use strict';

module.exports = function mcpFlow({ flow, P }) {
  const text = t => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
  const err = t => ({ content: [{ type: 'text', text: t }], isError: true });
  const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
  const s = d => ({ type: 'string', description: d });
  const pid = () => P.current() || P.defaultId();

  const tools = {
    post_gist: {
      description: 'Report with a GIST, never a code dump: a one-line title and at most 5 short bullets (<=120 chars each, plain words) saying what changed, why, and what is next, plus the files you touched and a link (commit, branch or doc). Kinds: progress (finished something), upgrade (propose a plan change; humans approve it), plan (how you will tackle a task), blocker (what stops you), assessment (how things stand). The server rejects fenced code and bodies over ~600 characters.',
      inputSchema: S({
        kind: { type: 'string', enum: ['progress', 'upgrade', 'plan', 'blocker', 'assessment'] },
        title: s('One line: what happened'),
        bullets: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Up to 5 bullets, each under 120 characters. No code.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Repo paths you touched (optional)' },
        link: s('Commit, branch, PR or doc URL (optional)'),
        task: s('Task id this is about (optional)'),
      }, ['kind', 'title']),
      run: (a, me) => {
        const r = flow.gists.post(pid(), a, me);
        if (r.error) return err(r.error);
        const role = flow.roleOf(pid(), me.id);
        return text(`Posted ${r.gist.kind} gist "${r.gist.title}"${r.notes.length ? ` (${r.notes.join(', ')})` : ''}.${r.gist.kind === 'upgrade' ? ' It is now a proposed plan change; a human approves or turns it down. Keep working on your current task meanwhile.' : r.gist.kind === 'blocker' ? ' It shows on the plan as a blocker until a human resolves it or you post a progress gist saying it is fixed.' : ''}${role ? '' : ' Tip: your human has no role in this project yet, so you have no folders of your own.'}`);
      },
    },
    read_plan: {
      description: 'Read the living PLAN.md: milestones, tasks per role with who owns them, blockers, proposed changes and recent history. Check it before picking work; propose changes with post_gist kind "upgrade".',
      inputSchema: S({}),
      run: () => { const st = flow.load(pid()); return st ? text(flow.planMd(st)) : text('This project has no plan yet. Humans start it with "Start the flow" in the project chat.'); },
    },
    my_role: {
      description: 'Your human\'s role in this project: its name, the folders it owns (stay inside them), teammates in it, and the open plan items for it.',
      inputSchema: S({}),
      run: (_, me) => {
        const st = flow.load(pid()); if (!st) return text('No roles here yet.');
        const r = flow.roleOf(pid(), me.id);
        const all = st.roles.map(x => `${x.name}: ${x.folders.map(f => f.path).join(', ') || '-'}`);
        if (!r) return text({ role: null, note: 'Your human has not taken a role yet. Ask them to claim one in the project chat.', roles: all });
        const items = st.plan ? st.plan.milestones.flatMap(m => m.items.map(i => ({ ...i, milestone: m.title }))).filter(i => i.role === r.id && !i.done) : [];
        return text({ role: r.name, folders: r.folders.map(f => `${f.path} (${f.label})`), open: items.map(i => `${i.task || ''} ${i.text} · ${i.milestone}`.trim()), otherRoles: all.filter(x => !x.startsWith(r.name + ':')) });
      },
    },
    list_gists: {
      description: 'Recent gists in this project (short updates from agents and TribeCode): what teammates finished, blockers, plan changes, assessments.',
      inputSchema: S({ limit: { type: 'number', description: 'How many (default 15, max 50)' } }),
      run: ({ limit }) => text(flow.gists.list(pid(), Math.min(Number(limit) || 15, 50)).map(g => ({ at: g.at, kind: g.kind, by: g.byName, title: g.title, bullets: g.bullets, files: g.files.length ? g.files.slice(0, 8) : undefined }))),
    },
  };
  const instructions = ' Report with post_gist (title + up to 5 short bullets, no code) instead of pasting code or diffs into chat; read_plan and my_role tell you the plan and your folders. Propose plan changes with an upgrade gist; humans approve them.';
  return { tools, instructions };
};
