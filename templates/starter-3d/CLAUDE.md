# Notes for AI helpers on {{name}}

- Plain ES modules, no build step. Add libraries only through the import map in `index.html`, pinned to an exact
  version, and only permissive licenses (MIT, ISC, BSD, Zlib, Apache-2.0, MPL-2.0). Never GPL.
- Check your work against the quality bar in `TRIBE_CONTEXT.md › Build kit` (MCP tool `get_build_kit`):
  60 fps on a mid-range laptop and phone, tone mapping + sRGB, soft shadows, a real loading screen, sound from the
  first tap, touch controls, pause when hidden, prefers-reduced-motion respected.
- Physics runs on a fixed 1/60 s step in `physics()`; render code only reads interpolated positions.
- Reuse geometries and materials (`shared` in `src/main.js`); use InstancedMesh for many copies.
- Models as glTF (.glb) in `assets/models`, loaded through the LoadingManager so the bar shows real progress.
