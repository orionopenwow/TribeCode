# {{name}}

{{gist}}

A 3D starter from TribeCode's build kit: three.js with ACES tone mapping and soft shadows, cannon-es physics on a fixed
1/60 s step, a rolling player with a smooth follow camera, gems to collect, a tiny synth for sound, a loading screen,
a touch stick on phones, pause (P) and mute (M).

## Run it

Open the project's Preview in TribeCode. Outside TribeCode, serve the folder with any static server (browsers won't
load modules from a double-clicked file).

## Libraries (pinned, loaded from a CDN by the import map in index.html)

| Library | Version | License | For |
| --- | --- | --- | --- |
| three.js | 0.186.1 | MIT | rendering, models, cameras |
| cannon-es | 0.20.0 | MIT | physics |

More from the kit when you need it: postprocessing (Zlib) for SMAA and depth of field, Rapier (Apache-2.0) for
character controllers and vehicles, howler.js (MIT) for sound files, three-mesh-bvh (MIT) for fast raycasts.
See `TRIBE_CONTEXT.md › Build kit` or ask your AI helper for `get_build_kit`.

## Where things are

- `src/main.js`: renderer, lights, physics world, player, gems, sound, input and the loop, top to bottom.
- `style.css`: the flat UI over the scene (loader, HUD, touch stick), using the palette variables.
