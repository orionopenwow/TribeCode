// MCP tool for app preview (server/preview.js): agents hand humans a link to the live app ("see it here").
// Merged into the MCP tool list through index.js (extraTools). Runs in the agent's project (or `project`).
'use strict';

module.exports = function mcpPreview(preview, P) {
  const reply = (t, err) => ({ content: [{ type: 'text', text: t }], ...(err ? { isError: true } : {}) });
  return {
    preview_url: {
      description: 'Get a link to the live preview of the app this project is building (served from the repo\'s index.html, or the project\'s dev server). Give it to the humans ("see it here") after you change something they can look at. It works in any browser tab and on phones, reloads by itself when files change, and expires in about 2 hours. Optional `path` opens a page inside the app (e.g. "levels/1.html").',
      inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Optional page inside the app, e.g. "about.html"' }, project: { type: 'string', description: 'Optional project id' } }, additionalProperties: false },
      run: ({ path: sub } = {}, me) => {
        const pid = P.current() || P.defaultId();
        const st = preview.status(pid, me);
        if (!st.hasRepo) return reply('This project has no repo folder yet, so there is nothing to preview. Set up the repo first.', true);
        const t = preview.mint(pid, me); preview.watch(pid);
        const l = preview.links(pid, t.pt);
        const extra = typeof sub === 'string' && sub && preview.okSub(sub) ? sub.replace(/^\/+/, '') : '';
        const lines = [`Preview of ${(P.get(pid) || {}).name || pid}: ${(l.share || l.local) + extra}`];
        if (l.shareKind !== 'public') lines.push(`On the host computer: ${l.local}${extra}`);
        lines.push(`Expires ${t.expires}. It reloads by itself when files change.`);
        if (!st.hasIndex) lines.push(`Note: there is no index.html yet (looked in ${preview.CANDIDATES.map(c => c ? c + '/' : 'the repo root').join(', ')}), so the link shows an empty state until you create one.`);
        if (st.mode === 'dev') lines.push(`Mode: the project's dev server on localhost:${st.port}. If it says "Nothing on port", start the dev server on the host.`);
        return reply(lines.join('\n'));
      },
    },
  };
};
