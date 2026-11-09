# Assets, inspiration and site templates

What Flint, the agents and people can pull into a project, and where it comes from. Added in v0.25.

## The asset library (`templates/assets.json`, `server/assets.js`, Files › Assets)

Only permissive licenses: CC0, MIT, ISC, Apache-2.0, OFL-1.1, and CC-BY-4.0 with credit. GPL, share-alike (CC-BY-SA),
non-commercial and unlicensed material is left out. Every file added to a project goes to `assets/` and gets a line in
`assets/CREDITS.md` (what, from where, by whom, license, link).

| Kind | Source | How it's added | License |
|---|---|---|---|
| Sound effects | TribeCode's own synth (jump, coin, hit, explosion, power-up, laser, click, select, blip, hurt, pickup, door) | made on the spot as .wav; a seed gives a variation | CC0 |
| Pixel sprites | TribeCode pixel kit (16 sprites, SVG) | built in | CC0 |
| Motion | TribeCode motion presets (one CSS file, reduced motion built in) | built in | CC0 |
| Icons | Lucide, Tabler, Phosphor, Heroicons | single SVG files from pinned npm packages on jsDelivr | ISC / MIT |
| Pixel icons | Pixelarticons, HackerNoon pixel icons | same | MIT |
| Emoji | Twemoji | same | CC-BY-4.0 (graphics) |
| Fonts | Fontsource (Google Fonts, self-hosted) | woff2 + a fonts.css | OFL-1.1 |
| 3D models, rigged and animated | Khronos glTF sample models (Fox with Survey/Walk/Run, Rigged Figure, Rigged Simple, Box Animated, Animated Morph Cube, Lantern, Avocado, Boom Box, Water Bottle, Barramundi Fish, Corset) | .glb from GitHub raw | per model: CC0 or CC-BY-4.0 |
| Textures, HDRIs, models | Poly Haven API (1k sizes) | API, with includes for glTF | CC0 ("Powered by Poly Haven") |

Browse-and-drop sources (download, then drop the files in Files): Kenney (CC0), Quaternius incl. the Universal
Animation Library (CC0), KayKit (CC0), OpenGameArt with the CC0 filter, ambientCG (CC0), Freesound with the CC0 filter.

Libraries listed for agents to install (MIT/Apache): ZzFX, Howler, Tone.js, three.js, model-viewer, Rive runtimes,
Motion, Anime.js, lottie-web, tsParticles, AOS, pixelfx, Pico CSS, daisyUI, Flowbite, Open Props, NES.css.

Left out on purpose: Mixamo (not an open license), GSAP (own "no charge" license), LottieFiles free animations (Lottie
Simple License), Sonniss bundles (royalty-free, not open), LPC sprites (CC-BY-SA/GPL), OpenMoji (CC-BY-SA), Khronos
samples with custom licenses (Duck, BrainStem, Sponza).

Safety: downloads only from an allowlist (cdn.jsdelivr.net, data.jsdelivr.com, raw.githubusercontent.com,
api.polyhaven.com, dl.polyhaven.org), only the file types a kind needs, size caps per file and per request, cleaned
file names, never executed. Agents use the MCP tools `find_assets` and `add_assets`. Flint: "add a jump sound",
"get me a coin sprite", "find a 3D fox".

## The inspiration board (`server/inspo.js`, `app/ui/inspo.js`, on the dashboard)

Drop pictures, paste Pinterest boards and pins, Dribbble/Behance shots, any page or gallery, Google Fonts links, or a
font name. Pages are read through the same SSRF-safe fetcher as chat link previews. Colors are measured in the browser
(canvas + k-means); the palette roles (background, surface, text, accent, accent 2) are picked by rules that keep text
at 12:1 and accents at 3:1 on the background. Fonts map to the website's font pairs and a Fontsource family.
"Dress it up" sets the website's brand kit and writes `design/inspiration.css` (and updates `design/palette.css`).
No AI needed. Flint: "use this for inspiration <link>", "dress it up".

## Site templates (`server/sitetemplates.js`)

The host or project lead saves any project's website as a template (name, tagline and color become `{{name}}`,
`{{tagline}}`, `{{color}}`). New projects start from it in the setup guide ("Make the starter" → pick a template) or
from the Website view. Nothing is ever overwritten.

## Editing the website in the preview (`server/preview.js`, `app/ui/preview.js`)

Edit in the preview bar: double-click text to change it, or click anything and tell Flint what to change. "Change it
to …" and "remove this" need no AI; with an AI, Flint returns small find/replace edits for the page and its CSS that
must match exactly once, and edits that add scripts, event handlers, iframes or outside imports are refused.

## Skills to read

Anthropic's public skills repository (github.com/anthropics/skills) is Apache-2.0 for most skills; the document
skills (docx, pdf, pptx, xlsx) are source-available, not open source, so they're not copied. Community lists worth
reading for agent skills: VoltAgent/awesome-agent-skills, travisvn/awesome-claude-skills,
ComposioHQ/awesome-claude-skills (check each skill's own license before adding it to the shelf).
