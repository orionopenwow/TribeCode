// Build kit: one curated open-source stack per kind of project (templates/buildkit.json): three.js + physics for 3D,
// Phaser/KAPLAY/PixiJS for 2D, Mediabunny (WebCodecs) for video, design tokens + Lucide + Motion for apps and sites,
// uPlot/Chart.js/ECharts/D3 for dashboards. Each library is pinned, permissively licensed and loaded by the project
// from a CDN through an import map, so TribeCode itself stays zero-dependency.
// The kit for a project follows its kind (server/sense.js) and tags (video, dashboard). It reaches the builders three
// ways: a "Build kit" section in TRIBE_CONTEXT.md, the MCP tool get_build_kit, and the stack chips in the app.
//   GET /api/buildkit                     -> { about, stacks }              the whole kit
//   GET /api/projects/:id/buildkit        -> { kind, stack, importMap }     the stack for this project
'use strict';
const fs = require('node:fs');
const path = require('node:path');

module.exports = function buildkit({ P, root, sense }) {
  const kit = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'templates', 'buildkit.json'), 'utf8')); } catch { return { stacks: [], pick: {} }; } })();
  const byId = Object.fromEntries((kit.stacks || []).map(s => [s.id, s]));

  function senseOf(pid) {
    try { const v = sense && sense.get ? sense.get(pid) : null; if (v) return { kind: v.kind || 'other', tags: v.tags || [] }; } catch {}
    return { kind: 'other', tags: [] };
  }
  function stackFor(kind, tags = []) {
    const pick = kit.pick || {}, t = pick.tags || {};
    if (kind !== '3d' && kind !== 'game') for (const tag of tags) if (t[tag] && byId[t[tag]]) return byId[t[tag]];
    return byId[pick[kind]] || byId[pick.other] || (kit.stacks || [])[0] || null;
  }
  const importMap = s => { const imports = {}; for (const l of (s && s.libs) || []) Object.assign(imports, l.import || {}); return { imports }; };
  function forProject(pid) { const { kind, tags } = senseOf(pid); const stack = stackFor(kind, tags); return { kind, stack, importMap: importMap(stack) }; }
  // the chips the app shows: [{ name, license, role }]
  function brief(pid) { const { stack } = forProject(pid); return stack ? { id: stack.id, title: stack.title, glyph: stack.glyph, libs: stack.libs.map(l => ({ name: l.name, license: l.license, role: l.role, version: l.version })) } : null; }

  function lines(stack) {
    if (!stack) return [];
    const L = [`## Build kit: ${stack.title}`, '', `> ${stack.what} Use these pinned, open-source libraries (load them with the import map below; no npm install). Keep each library's license; never add GPL code.`, ''];
    for (const l of stack.libs) L.push(`- **${l.name}** ${l.version} (${l.license}): ${l.role}`);
    const im = importMap(stack);
    if (Object.keys(im.imports).length) L.push('', '```html', '<script type="importmap">', JSON.stringify(im, null, 2), '</script>', '```');
    L.push('', '**Quality bar (check your work against it):**');
    stack.rules.forEach(r => L.push(`- ${r}`));
    if (stack.starter) L.push('', `Starter to copy from: \`templates/${stack.starter}\` (Project setup › Make the starter).`);
    return L;
  }
  const contextLines = pid => { try { return lines(forProject(pid).stack); } catch { return []; } };
  // a short line for build requests sent to the AI helpers (preview Flint, #agents)
  function hint(pid) {
    const { stack } = forProject(pid); if (!stack) return '';
    return `Build kit (${stack.title}): ${stack.libs.map(l => `${l.name}@${l.version}`).join(', ')}. Follow its quality bar in TRIBE_CONTEXT.md › Build kit.`;
  }

  async function route(req, res, { m, a, b, me, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m !== 'GET') return fail(res, 405, 'GET only');
    if (a === 'buildkit') return send(res, 200, { about: kit.about, checked: kit.checked, stacks: kit.stacks });
    if (!P.get(b) || (P.canSee && !P.canSee(me, b))) return fail(res, 404, 'project not found');
    const r = forProject(b);
    return send(res, 200, { ...r, hint: hint(b) });
  }

  const text = t => ({ content: [{ type: 'text', text: t }] });
  const mcpTools = {
    get_build_kit: {
      description: 'The open-source stack and quality bar for this project (or for a kind: 3d-game, 2d-game, video, app-ui, site, data-viz): pinned libraries with licenses, a ready import map, and the rules to check your work against. Use it before building features.',
      inputSchema: { type: 'object', properties: { stack: { type: 'string', description: 'Optional stack id; default is the one for your project' } }, additionalProperties: false },
      run: async ({ stack } = {}) => {
        const s = (stack && byId[stack]) || forProject(P.current()).stack;
        return text(s ? lines(s).join('\n') : 'No build kit found.');
      },
    },
  };
  return { route, forProject, brief, contextLines, hint, stackFor, mcpTools, stacks: () => kit.stacks };
};
