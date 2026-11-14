# Moving and 3D backgrounds for websites

A section of a website made in TribeCode can have gentle motion behind it: drifting dots, a glowing orb, a 3D starfield.
The words stay ordinary text on top. It works with no AI, in the downloaded or published site with no server, and offline.

## What is in the pack (13)

| Background | Drawn with | Where it comes from |
|---|---|---|
| Pulsing dots, Glowing horizon, Ribbons of light, Flowing streams, Ripples, Glowing orb | a small shader (WebGL, no library) | ported from ThreeUI Community (MIT, Meng To) |
| Pixel arc, Water drops | a 2D canvas | ported from ThreeUI Community |
| Turning sphere, Rising dome | Three.js r149 | ported from ThreeUI Community |
| Constellation, Floating particles, Starfield | Three.js r149 | TribeCode's own, after the same catalogue's particle fields |

Left out, and why:

- Liquid Form (a ray-marched metal shape): the port looked rough at a cost a phone can afford.
- Buttons, docks, headings, carousels, toggles, loaders: they are components with their own markup, not backgrounds. They belong in the section library as blocks, which the editor overhaul owns.
- Landing pages, bookshelves, the Japanese tower, koi, the globe, CRT screens, typography vortex, warp field: full scenes with their own art, text and layout (tens of megabytes of pictures), not something to put behind a site's own words.
- Anything Pro or Beta, the catalogue's thumbnails and videos, and its fonts: not in the MIT release, or not needed.

## How it is built

- `app/ui/sitefx.js`: the model, shared by the browser and the server. `block.fx = { kind, s, d, i, p, c, c2 }`. It adds the layer, the CSS and the script to a rendered page (`decorate`), puts `fx/` into a zip or a published site (`exportInto`), draws the still picture (`still`), and runs Flint's `site.fx` steps (`command`).
- `app/ui/sitefx/fx.js`: the runtime and the eight flat backgrounds. One animation loop per page. A section off screen or a hidden tab costs nothing. "Reduce motion" gets one still frame. No WebGL keeps the still picture. Pixel ratio capped at 1.5, and at most 1.5 million pixels per canvas. Removing a section frees its canvas and WebGL context.
- `app/ui/sitefx/fx3d.js` and `three.min.js`: the five 3D backgrounds. Loaded only by a page that uses one, and not at all where WebGL is missing.
- `app/ui/sitefxui.js` and `.css`: the tiles in the section picker and "Moving background" in the Edit panel.
- `scripts/dev/sitefx-thumbs.py`: the picker thumbnails, rendered from our own ports.

Hooks into existing files (each marked `feat/site-3d`):

- `app/ui/sitecfg.js`: a lazy `FX()` getter; `normalize` keeps `block.fx`; `render` passes the page through `decorate`; `exportFiles` through `exportInto`; `command` routes `site.fx`.
- `app/ui/sitedesigner.js`: `opened` (hands over the designer's api), the picker (appends the tiles), the inspector (appends the controls), `download` (loads the script texts first).
- `server/sitedesign.js`: Publish creates sub-folders (for `fx/`).
- `app/ui/flintnlu.js`: `siteFx()` and its words; `scripts/dev/flint-eval-cases.js`: 31 cases.
- `app/ui/index.html`, `app/ui/sw.js`, `package.json`, `app/ui/i18n-more.js`, `templates/quickguides.json`, `NOTICE`.

## Size

About 740 KB in `app/ui/sitefx` (Three.js is 608 KB of it, thumbnails about 90 KB). A published site that uses only flat backgrounds gets one 23 KB script. One with a 3D background also gets Three.js.

## Test

`python3 app/test/e2e_site_fx.py` (needs Chrome's software WebGL; the test passes the flags itself).

## Not done

- Flint's replies about backgrounds are English only, like his other website replies.
- A background behind the whole page (not one section), and a pointer-follow effect, are not built.
- Not tried on a real phone or a real GPU: only Chrome's software renderer.
