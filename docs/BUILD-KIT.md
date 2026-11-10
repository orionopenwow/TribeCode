# Build kit

TribeCode's builders (Flint, the preview's build loop, each member's AI helper and the starters) build on one curated,
open-source stack per kind of project, with a written quality bar. The aim: studio-quality games, apps, video tools and
sites from permissively licensed libraries.

- Catalog: `templates/buildkit.json` (stacks, pinned versions, licenses, CDN import maps, rules).
- Server: `server/buildkit.js` picks the stack from the project's kind and tags (`server/sense.js`): 3D → `3d-game`,
  game → `2d-game`, a project that sounds like a video editor → `video`, a dashboard → `data-viz`, a site → `site`,
  everything else → `app-ui`.
- Reaches builders through: a "Build kit" section in `TRIBE_CONTEXT.md` (libraries, import map, quality bar), the MCP
  tool `get_build_kit`, a one-line hint on build requests sent from the preview's Flint panel, and the stack chips in
  Studios and in Project setup › Make the starter.
- Starters: `templates/starter-3d` (three.js + cannon-es: tone mapping, soft shadows, fixed-step physics with
  interpolation, follow camera, sound, loading screen, touch stick) and `templates/starter-video` (clips, trim, split,
  reorder, titles, export via MediaRecorder, then MP4 through Mediabunny/WebCodecs when available; edits offline).
- API: `GET /api/buildkit` (whole kit), `GET /api/projects/:id/buildkit` (`{ kind, stack, importMap, hint }`).

## Rules for adding a library

1. Permissive license only: MIT, ISC, BSD, Zlib, Apache-2.0, MPL-2.0, CC0 or Unlicense. Read it from the package or the
   repository. No GPL/AGPL/share-alike (the ffmpeg.wasm core is GPL-2.0-or-later, so it stays out).
2. Pin an exact version that has been out for at least two weeks; the import URL carries the version
   (`https://cdn.jsdelivr.net/npm/<pkg>@<version>/...`).
3. Say in one line what it's for, and add a rule to the stack's quality bar if it changes what "good" means.
4. `app/test/e2e_build_kit.py` checks all of the above.
