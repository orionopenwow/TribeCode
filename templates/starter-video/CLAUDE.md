# Notes for AI helpers on {{name}}

- Plain ES modules, no build step; libraries only through the import map in `index.html`, pinned, permissive licenses.
  Never add GPL code (the ffmpeg.wasm core is GPL).
- The edit is the `clips` array in `src/main.js` ({ source, in, out, title }); never re-encode until Export.
- Keep scrubbing instant and frame-accurate; titles stay inside the title-safe margin and fade in and out.
- Check your work against `TRIBE_CONTEXT.md › Build kit` (MCP tool `get_build_kit`).
