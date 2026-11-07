// Workshop tools for Claude Code agents (server/workshop.js). Wired into server/mcp.js through the
// `extraTools` it already accepts, so mcp.js itself is untouched.
//   workshop_search   find skills, recipes, templates, assets and scripts (tribe library, or the community shelf)
//   workshop_publish  suggest files from your project for the library; a human approves it first
//   workshop_use      copy a library item into your project (files only: nothing is run or installed)
'use strict';

module.exports = function workshopMcp(workshop, { current = () => null } = {}) {
  const text = t => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
  const err = t => ({ content: [{ type: 'text', text: t }], isError: true });
  const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
  const str = d => ({ type: 'string', description: d });
  const kb = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const wrap = fn => async (a, me) => { try { return await fn(a || {}, me); } catch (e) { return err(e.message || String(e)); } };

  return {
    workshop_search: {
      description: 'Search the tribe Workshop before building something: reusable skills (SKILL.md folders), recipes (feature scripts with a check), templates (project starters), assets (GLB/glTF models, animations, sprites, audio, shaders) and scripts. community=true searches the public community shelf instead (read-only; a human brings items into the tribe library).',
      inputSchema: S({ query: str('Words to match in titles, summaries, tags and file names'), kind: { type: 'string', enum: workshop.KINDS }, community: { type: 'boolean', description: 'Search the community shelf (public GitHub repo via jsDelivr)' } }),
      run: wrap(async ({ query, kind, community }, me) => {
        if (community) {
          const c = await workshop.community(false);
          if (!c.available) return text(`The community shelf (${c.repo}) is not available: ${c.reason === 'missing' ? 'the repo or its index.json does not exist yet' : c.message}.`);
          const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
          const hits = c.items.filter(it => (!kind || it.kind === kind) && words.every(w => [it.id, it.title, it.summary, ...(it.tags || [])].join(' ').toLowerCase().includes(w))).slice(0, 25);
          return text(hits.length ? hits.map(it => ({ id: it.id, kind: it.kind, title: it.title, summary: it.summary, license: it.license, author: it.author, version: it.version, files: it.files.length, size: kb(it.size), inLibrary: it.inLibrary })) : 'Nothing on the community shelf matches.');
        }
        const hits = workshop.list(me, query, kind).slice(0, 25);
        return text(hits.length ? hits.map(it => ({ id: it.id, kind: it.kind, title: it.title, summary: it.summary, tags: it.tags, license: it.license, author: it.author, version: it.version,
          files: it.files.map(f => f.path).slice(0, 20), size: kb(it.size), check: it.check, usedIn: it.usedIn.map(u => u.name) })) : 'Nothing in the Workshop matches. Build it, then suggest it with workshop_publish so the next agent can reuse it.');
      }),
    },
    workshop_publish: {
      description: 'Suggest files or folders from your project (paths relative to the project folder) for the tribe Workshop, so others reuse them instead of rebuilding. A human approves it before it is published: you get an approval id to poll with check_approval. Pick an open license (CC0-1.0 or CC-BY-4.0 for art, MIT or Apache-2.0 for code). For a recipe, describe the check that proves it works. Reusing an existing id suggests a new version.',
      inputSchema: S({
        kind: { type: 'string', enum: workshop.KINDS }, title: str('Short title, e.g. "Double jump for 2D platformers"'), summary: str('One or two lines: what it is, how to use it'),
        paths: { type: 'array', items: { type: 'string' }, description: 'Files or folders in your project, e.g. ["src/systems/doublejump.js"] or ["assets/hero"]' },
        license: { type: 'string', enum: workshop.LICENSES }, tags: { type: 'array', items: { type: 'string' } }, id: str('Optional id (lowercase-dashes); an existing id of yours makes a new version'),
        preview: str('Optional image file (relative to what you picked) to show as the preview'), version: str('Optional version, e.g. 1.2.0'),
        check: S({ kind: { type: 'string', enum: ['test', 'screenshot', 'manual'] }, run: str('Command a human can run to check it, e.g. npm test -- jump (never run automatically)'), file: str('Test or screenshot file inside the item'), note: str('What a pass looks like') }),
      }, ['kind', 'title', 'paths', 'license']),
      run: wrap(async (a, me) => {
        const pid = current(); if (!pid) return err('You are not in a project.');
        const r = workshop.publish({ ...a, from: { project: pid, paths: a.paths } }, me);
        if (r.pending) return text({ suggestion: r.suggestion, approval: r.approval, status: r.status, askedOf: r.askedOf, next: `Waiting for ${(r.askedOf || []).join(', ') || 'a human'} to approve. Poll check_approval with id ${r.approval}; once approved it appears in the Workshop.` });
        return text(`Published ${r.item.id} ${r.item.version}.`);
      }),
    },
    workshop_use: {
      description: 'Copy a Workshop item (id from workshop_search) into your project folder, by default under workshop/<id>/. Files are only copied, never run or installed: read them, then wire them in yourself. Keep the license and credit the author (CC-BY-4.0 requires attribution).',
      inputSchema: S({ id: str('Item id'), dest: str('Folder in your project, e.g. src/vendor/doublejump (default workshop/<id>)'), overwrite: { type: 'boolean', description: 'Replace files that already exist' } }, ['id']),
      run: wrap(async ({ id, dest, overwrite }, me) => {
        const pid = current(); if (!pid) return err('You are not in a project.');
        const r = workshop.use(id, { project: pid, dest, overwrite }, me);
        return text({ copied: r.copied, into: `${r.dest}/`, files: r.files.map(f => f.path), license: r.license, author: r.author, note: r.note });
      }),
    },
  };
};
