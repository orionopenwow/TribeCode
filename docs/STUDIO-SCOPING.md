# Studio scoping: open-source code to build on, per kind of project

*Status: research, no app code changed (branch `docs/studio-scoping`, 2026-11-07). Companion to
[GAME-STUDIO.md](GAME-STUDIO.md) (the game plan) and [ANY-LLM.md](ANY-LLM.md) (bring any model).*

The question: for each kind of thing a tribe vibe-codes (website, app, tool or bot, 2D game, 3D world, "Godot-level"
game), which GitHub projects can we lean on, so the Preview pane can grow real studio abilities as a project gains
context, without TribeCode itself getting heavy? And how does Flint (the free, local-first action brain) learn the
scripts so it can do more of this with no cloud at all?

The short answer:

- **Nothing heavy ships in the app.** Every engine, model and tool below is an optional **pack** that the host
  downloads on demand, checks by sha256, keeps in the tribe folder and can remove (section 10). The Preview pane serves
  packs from the host, so friends on phones and tunnels get them with nothing extra.
- **Abilities appear as project sense gets sure** (`server/sense.js`: `kind`, `tags`, `confidence`). A new project gets
  a plain preview. At confidence 0.45 the kind's starter shelf shows up. At 0.65 with tags like `pixel art` or `3d`,
  studio tools show up. Godot, image models and anything multi-gigabyte appear only when someone asks (section 9).
- **Flint learns by saving recipes, not by training.** When a generation works (it passes checks and the tribe keeps
  it), Flint offers to save it as a recipe: a template with slots plus a check. Recipes stay in the tribe. Sharing one
  with other tribes is an explicit, per-item opt-in through the existing Workshop donate flow (section 8).

---

## 0. How this was checked

Checked on 2026-11-07 from the Claude sandbox:

- **License**: the license file at the repo's current `HEAD` (read with a blobless `git clone`), not a summary site.
- **Activity**: the date of the latest commit on the default branch (from git) and the latest npm release and its
  date (from `registry.npmjs.org`).
- **Size**: the main runtime file from the npm tarball, measured raw and with `gzip -9` ("gz" below). Brotli on the
  wire is a bit smaller. Where a single file does not make sense, the npm "unpacked" size is given and labeled.
- **Stars**: GitHub's API was blocked from the sandbox after one query, so star counts are given only for the three
  repos that query returned (Phaser 40.7k, LittleJS 4.4k, KAPLAY 1.8k). Activity dates are the verified signal here.
- **Licensing rule**: only MIT, Apache-2.0, BSD, zlib, 0BSD/Unlicense and MPL-2.0 are recommended for embedding or
  shipping inside a pack. GPL, AGPL and custom licenses are marked **reference only**: fine to read, learn from, or for
  the user to install themselves and talk to over an API, never copied into packs or templates.

One constraint from our own code shapes everything below. The Preview iframe is sandboxed **without**
`allow-same-origin` (`server/preview.js`, `CSP: sandbox allow-scripts allow-forms allow-pointer-lock allow-popups`),
and its `allow` attribute is `fullscreen; gamepad; autoplay` (`app/ui/preview.js`). So inside the Preview:

- IndexedDB, OPFS and Cache Storage are not available (opaque origin). The injected storage shim covers
  localStorage-style data. Big files must come over HTTP from the host (`/packs/…`), not from a browser cache API.
- No COOP/COEP headers, so **no `SharedArrayBuffer`**: use single-threaded WASM builds (Godot's single-threaded web
  export, Jolt's non-multithread build, ONNX Runtime with one thread).
- Camera and motion sensors are not delegated today. Motion control needs a per-project opt-in that adds
  `camera` (and `accelerometer; gyroscope` for phones) to the iframe's `allow` list, with a clear prompt (section 4).
- Gamepad and pointer lock already work.

---

## 1. Websites and landing pages

Goal: HTML-first sites that don't look like every other template, built and previewed with zero build step where
possible.

| Repo | License | What we'd use it for | In browser? | Size | Activity | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| [picocss/pico](https://github.com/picocss/pico) | MIT | Classless, semantic CSS base: plain HTML looks good at once | Yes (one CSS file) | 81 KB, 11 KB gz | commit 2026-10; npm 2.1.1 (2025-03) | Releases are slow; fine for a CSS base |
| [argyleink/open-props](https://github.com/argyleink/open-props) | MIT | Design tokens (sizes, easings, shadows, color ramps) for our own "style packs" | Yes | npm 1.3 MB unpacked; import only what is used | commit 2026-10; npm 1.7.23 (2026-01) | Low |
| [kevquirk/simple.css](https://github.com/kevquirk/simple.css) | MIT | A second classless look for blogs and docs | Yes | npm 0.04 MB | commit 2026-05; npm 2.3.7 (2025-05) | Small project, one maintainer |
| [bigskysoftware/htmx](https://github.com/bigskysoftware/htmx) | 0BSD | Forms, partial updates, "contact" and "waitlist" without a framework | Yes | 51 KB, 16 KB gz | commit 2026-09; npm 2.0.11 (2026-09) | htmx 4 is in progress; pin 2.x |
| [alpinejs/alpine](https://github.com/alpinejs/alpine) | MIT | Small interactions (menus, tabs, modals) written in HTML attributes | Yes | 55 KB, 19 KB gz | commit 2026-10; npm 3.17.5 (2026-10) | Low |
| [11ty/eleventy](https://github.com/11ty/eleventy) | MIT | Multi-page sites, blogs, Markdown to HTML when a site outgrows one file | No (Node build on the host) | npm 0.54 MB plus deps | commit 2026-11; npm 3.1.8 (2026-11) | Adds a build step and a node_modules folder |
| [withastro/astro](https://github.com/withastro/astro) | MIT | Content-heavy sites that want components | No (Node build) | npm 3.5 MB plus many deps | commit 2026-11; npm 7.4.7 (2026-11) | Heavy for a first site; fast-moving majors |
| [shoelace-style/webawesome](https://github.com/shoelace-style/webawesome) | MIT (free part) | Framework-free web components (dialogs, tabs, color pickers) | Yes | npm 17.5 MB unpacked; load per component | commit 2026-11; npm 3.14.0 (2026-09) | Has a paid Pro tier; use only the MIT part |

Also checked: [gohugoio/hugo](https://github.com/gohugoio/hugo) (Apache-2.0, very active, but a native Go binary
download) and [saadeghi/daisyui](https://github.com/saadeghi/daisyui) (MIT, needs Tailwind's build).

**Recommended pick:** plain HTML + **Pico** as the base + **Open Props** tokens for TribeCode "style packs" + **htmx**
or **Alpine** only when the page needs behavior. Eleventy only when the project has many pages.

**Non-generic look:** the look should come from Flint recipes, not from a component kit. A style pack is a small CSS
file of Open Props tokens plus a type pairing, a layout rhythm and one signature element (a marquee, a grid of
stickers, a big serif headline). Five to ten hand-made packs beat one generic kit.

**Lazy-download plan:** Pico, Open Props (subset), htmx and Alpine are under 30 KB gz each, small enough to be a single
"Site basics" pack (~70 KB gz) fetched the first time a project senses as `site`. Eleventy installs into the project
(`npm i`) only when a recipe asks for it, after a one-tap confirm.

---

## 2. Web and mobile apps

Goal: lightweight UI, data that lives on the device and syncs between friends, no auth to start, installable as a PWA.

| Repo | License | What we'd use it for | In browser? | Size | Activity | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| [preactjs/preact](https://github.com/preactjs/preact) | MIT | React-style components when an app needs them | Yes | 12 KB, 5 KB gz | commit 2026-11; npm 11.2.0 (2026-11) | Low |
| [vanjs-org/van](https://github.com/vanjs-org/van) | MIT | Tiny reactive UI with no build (closest to how TribeCode is written) | Yes | 5 KB, 2 KB gz | commit 2026-11; npm 1.6.2 (2026-11) | Smaller ecosystem |
| [lit/lit](https://github.com/lit/lit) | BSD-3 | Web components with reactive properties | Yes | npm 0.11 MB unpacked | commit 2026-11; npm 3.3.3 (2026-05) | Low |
| [yjs/yjs](https://github.com/yjs/yjs) | MIT | CRDT shared state for apps friends use together (lists, boards, docs) | Yes | 293 KB, 61 KB gz (unminified ESM) | commit 2026-11; npm 13.6.33 (2026-09) | v14 is in release candidates; pin 13.x |
| [automerge/automerge](https://github.com/automerge/automerge) | MIT | CRDT with full history (JSON-like documents) | Yes (WASM) | npm 47.5 MB unpacked (several WASM builds) | commit 2026-11; npm 3.5.0 (2026-09) | Heavier than Yjs |
| [tinyplex/tinybase](https://github.com/tinyplex/tinybase) | MIT | Reactive local store with sync and persistence options | Yes | npm 16 MB unpacked (many entry points) | commit 2026-09; npm 10.0.1 (2026-09) | Import the core only |
| [GoogleChrome/workbox](https://github.com/GoogleChrome/workbox) | MIT | Service worker caching for real PWAs (outside the Preview) | Yes | workbox-window 0.58 MB unpacked | commit 2026-09; npm 7.4.1 (2026-05) | A hand-written service worker is often enough |
| [framework7io/framework7](https://github.com/framework7io/framework7) | MIT | Native-feeling iOS/Android screens for phone-first apps | Yes | npm 14.8 MB unpacked | commit 2026-10; npm 9.3.0 (2026-10) | Big; the look is recognizable |

Also checked: [ionic-team/ionic-framework](https://github.com/ionic-team/ionic-framework) (MIT, active, npm 9.0.10,
heavier) and [electric-sql/pglite](https://github.com/electric-sql/pglite) (section 3).

**Recommended pick:** **VanJS** or plain JS for small apps, **Preact** when components help. **Yjs** for shared state:
TribeCode already has a WebSocket on the host, so a tiny `y-websocket`-style relay on the existing `/ws` gives
"friends edit the same list" with no new service. Auth-free prototypes reuse TribeCode's member identity in the
Preview; a real login is a later recipe.

**Lazy-download plan:** "App basics" pack = VanJS + Preact + a phone shell CSS (~20 KB gz). "Shared data" pack = Yjs
(~61 KB gz), fetched when the app's code or chat mentions syncing or "together". Framework7 only on request.

---

## 3. Tools, bots and APIs

Goal: small CLIs, Discord and Telegram bots, HTTP APIs and data tools that can be tried right in the Preview.

| Repo | License | What we'd use it for | In browser? | Size | Activity | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| [honojs/hono](https://github.com/honojs/hono) | MIT | Tiny HTTP framework for APIs (Node, Bun, Deno, Workers) | Server (Node) | npm 1.3 MB unpacked | commit 2026-11; npm 4.13.17 (2026-11) | Low |
| [fastify/fastify](https://github.com/fastify/fastify) | MIT | Larger APIs with schemas and plugins | Server | npm 3 MB unpacked plus deps | commit 2026-11; npm 5.12.8 (2026-11) | More deps than Hono |
| [discordjs/discord.js](https://github.com/discordjs/discord.js) | Apache-2.0 | Discord bots | Server | npm 2 MB unpacked plus deps | commit 2026-11; npm 14.28.1 (2026-11) | Needs a bot token (kept on the host) |
| [grammyjs/grammY](https://github.com/grammyjs/grammY) | MIT | Telegram bots | Server | npm 1.4 MB unpacked | commit 2026-10; npm 1.46.0 (2026-08) | Needs a bot token |
| [tj/commander.js](https://github.com/tj/commander.js) | MIT | CLI argument parsing | Node | npm 0.21 MB | commit 2026-11; npm 15.1.0 (2026-11) | Low |
| [bombshell-dev/clack](https://github.com/bombshell-dev/clack) | MIT | Pretty interactive CLI prompts | Node | npm 0.09 MB | commit 2026-10; npm 1.8.1 (2026-09) | Low |
| [sqlite/sqlite-wasm](https://github.com/sqlite/sqlite-wasm) | Apache-2.0 wrapper; SQLite is public domain | Official SQLite in the browser for data tools | Yes (WASM) | wasm 858 KB, 397 KB gz | commit 2026-11; npm 3.54.1 (2026-10) | Its OPFS persistence won't work in our sandboxed Preview; use in-memory plus export |
| [sql-js/sql.js](https://github.com/sql-js/sql.js) | MIT | SQLite in the browser, simpler API, in-memory | Yes (WASM) | wasm 669 KB, 327 KB gz | commit 2026-10; npm 1.15.2 (2026-10) | Older build of SQLite than the official one |

Also checked: [electric-sql/pglite](https://github.com/electric-sql/pglite) (Apache-2.0, Postgres in WASM, wasm + data
~5 MB gz; for projects that will deploy on Postgres), [evanw/esbuild](https://github.com/evanw/esbuild) (MIT;
`esbuild-wasm` bundles TypeScript in the browser, 3.6 MB gz) and [pyodide/pyodide](https://github.com/pyodide/pyodide)
(MPL-2.0, Python in the browser for data tools; npm 13.9 MB unpacked before packages). On the server side, Node's own
`node:sqlite` module needs no package at all.

**Recommended pick:** **Hono** for APIs, **grammY** / **discord.js** for bots, **commander + clack** for CLIs,
**sql.js** for "try it" data tools in the Preview.

**How the Preview shows these kinds:** `sense.js` already labels the Preview "Try the tool", "Try the bot" and
"Preview API". The pane should show:

- an API: a request runner (method, path, body, response);
- a bot: a fake chat that sends messages to the bot's handler on the host, so no real Discord or Telegram is needed;
- a CLI: a terminal-like pane with the command's output.

**Lazy-download plan:** these install into the project with `npm i` after a one-tap confirm (they are the project's
dependencies, not TribeCode's). sql.js (~330 KB gz) is a "Data tools" pack served from `/packs/`.

---

## 4. 2D and pixel-art games, with motion control

### 4a. Engines

| Repo | License | What we'd use it for | In browser? | Size | Activity | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| [kaplayjs/kaplay](https://github.com/kaplayjs/kaplay) | MIT | Starter template B in GAME-STUDIO.md; simple API that LLMs write well | Yes | 184 KB, 68 KB gz | commit 2026-11; npm 3001.0.19 (2025-06); v4000 in alpha | Stable npm line is older than the repo; pin 3001 until 4000 ships |
| [KilledByAPixel/LittleJS](https://github.com/KilledByAPixel/LittleJS) | MIT | Tiny, fast pixel-art engine with built-in sound (ZzFX), tiles, particles, Box2D option | Yes | 612 KB, 173 KB gz (+ optional Box2D wasm 71 KB gz) | commit 2026-11; npm 1.29.1 (2026-11); 4.4k stars | One main maintainer |
| [phaserjs/phaser](https://github.com/phaserjs/phaser) | MIT | The most complete 2D engine; huge examples and training coverage | Yes | 1.34 MB, 344 KB gz | commit 2026-08; npm 4.2.1 (2026-07); 40.7k stars | Biggest of the 2D options |
| [excaliburjs/Excalibur](https://github.com/excaliburjs/Excalibur) | BSD-2 | TypeScript-first 2D engine with ECS and good docs | Yes | 856 KB, 193 KB gz | commit 2026-11; npm 0.32.0 (2025-12) | Still pre-1.0 |
| [pixijs/pixijs](https://github.com/pixijs/pixijs) | MIT | Fast 2D renderer (WebGL/WebGPU) when a project wants its own game loop | Yes | 821 KB, 231 KB gz | commit 2026-11; npm 8.22.0 (2026-10) | A renderer, not an engine |
| [liabru/matter-js](https://github.com/liabru/matter-js) | MIT | 2D physics for puzzle/physics games | Yes | 82 KB, 25 KB gz | commit 2026-09; npm 0.20.0 (2024-06) | Slow releases |

### 4b. Levels, sprites and sound

| Repo | License | What we'd use it for | In browser? | Size | Activity | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| [deepnight/ldtk](https://github.com/deepnight/ldtk) | MIT | Level editor; its JSON format is clean for agents to read and write | Format: yes. Editor: native app | n/a | commit 2026-10; tag v1.5.3 | Editor is a desktop download; we only need the format |
| [mapeditor/tiled](https://github.com/mapeditor/tiled) | Editor GPL-2 (some parts BSD/Apache) | The most common map format (TMX/JSON); many engines read it | Format: yes. Editor: native | n/a | commit 2026-10; tag v1.12.2 | **Editor is reference only** (user installs it); reading its JSON is fine |
| [piskelapp/piskel](https://github.com/piskelapp/piskel) | Apache-2.0 | In-browser sprite and animation editor we could open in the Preview pane | Yes | repo-sized web app | commit 2026-11; tag v0.15.0 | Older codebase; check that it runs offline from `/packs/` |
| [Orama-Interactive/Pixelorama](https://github.com/Orama-Interactive/Pixelorama) | MIT | Full pixel-art editor (built with Godot) | Native; a web build is published (check before relying) | n/a | commit 2026-11; tag v1.2.4 | Large compared with Piskel |
| [KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX) | MIT | Tiny sound effects from a short array of numbers: perfect for agents | Yes | 10 KB, 3 KB gz | commit 2026-11; npm 1.4.0 (2026-10) | Low |
| [chr15m/jsfxr](https://github.com/chr15m/jsfxr) | Unlicense | Classic sfxr sound maker with an editor page | Yes | npm 0.05 MB | commit 2026-05; npm 1.4.1 (2026-05) | Low |

Reference only: [aseprite/aseprite](https://github.com/aseprite/aseprite) (source-available under a custom EULA, not
open source) and [LibreSprite/LibreSprite](https://github.com/LibreSprite/LibreSprite) (GPL-2). Users can install
either; we read their exported PNG + JSON sprite sheets.

### 4c. Motion control

| Repo | License | What we'd use it for | In browser? | Size | Activity | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe) (`@mediapipe/tasks-vision`) | Apache-2.0 | Webcam hand, pose and face landmarks: "jump by raising your hands", "steer with your palm" | Yes (WASM + GPU) | vision wasm 14 MB, 4 MB gz, plus a model file per task | commit 2026-11; npm 1.2.2 (2026-11) | Needs camera permission; Google's docs suggest running it in a worker |
| [tensorflow/tfjs-models](https://github.com/tensorflow/tfjs-models) | Apache-2.0 | Older pose models (MoveNet, BlazePose) | Yes | pose-detection npm 1.5 MB + TF.js | commit 2026-03; pose-detection npm 2.1.3 (2023-08) | Stale npm releases; prefer MediaPipe Tasks |
| Gamepad API (browser built-in) | n/a | Controllers; already allowed in our Preview iframe | Yes | 0 | n/a | None |
| DeviceOrientation / DeviceMotion (browser built-in) | n/a | Tilt-to-steer on phones | Yes | 0 | n/a | iOS asks for permission on a tap; iframe needs `accelerometer; gyroscope` |

**Recommended pick:** **KAPLAY** stays the default 2D starter (already chosen in GAME-STUDIO.md). Add **LittleJS** as
the "instant pixel-art game" starter: it is small, has sound and tiles built in, and its single-file games are easy
for a small local model to edit. **LDtk JSON** as the level format, **Piskel** as the in-pane sprite editor, **ZzFX**
for sound. For motion control, **MediaPipe Tasks Vision**, wrapped in one tiny TribeCode helper (`tribe-motion.js`)
that turns landmarks into plain input events (`left`, `right`, `jump`, `fire`, `tilt`). Games then never touch
MediaPipe directly, and the same events come from keyboard, gamepad, webcam or phone tilt.

**Lazy-download plan:**

- "2D game" pack: KAPLAY or LittleJS + ZzFX, ~70 to 180 KB gz, fetched when sense says `game` with ≥0.45 confidence.
- "Sprite and level tools" pack: Piskel web build + an LDtk loader, fetched when the `pixel art` tag appears.
- "Motion control" pack: MediaPipe vision wasm (~4 MB gz) + the hand and pose models. Fetched only when someone turns
  on "Play with your hands" for that project. That same switch adds `camera` to the Preview iframe's `allow` list.

---

## 5. 3D worlds

Goal: walk around a simple 3D world with a character, physics and animated glTF models, in the Preview pane, on a
laptop and ideally on a phone.

### 5a. Engines and physics

| Repo | License | What we'd use it for | In browser? | Size | Activity | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | MIT | Starter template A in GAME-STUDIO.md; the widest ecosystem and training coverage | Yes (WebGL2, WebGPU renderer) | module + core 2.1 MB, ~410 KB gz (unminified) | commit 2026-11; npm 0.187.0 (2026-10) | Monthly releases can break addons; pin |
| [BabylonJS/Babylon.js](https://github.com/BabylonJS/Babylon.js) | Apache-2.0 | Batteries-included engine (physics, GUI, inspector) | Yes (WebGL2/WebGPU) | full UMD 8.7 MB, 1.9 MB gz (the ES modules tree-shake far smaller) | commit 2026-11; npm 9.35.0 (2026-11) | Large if not tree-shaken |
| [playcanvas/engine](https://github.com/playcanvas/engine) | MIT | Fast, compact engine with good splat support | Yes (WebGL2/WebGPU) | 2.5 MB, 639 KB gz | commit 2026-11; npm 2.23.3 (2026-10) | Their editor is a hosted product; we use the engine only |
| [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) | MIT | Only if the project is already React | Yes | npm 2.4 MB unpacked + React | commit 2026-10; npm 9.8.2 (2026-10) | Pulls in React; v10 in alpha |
| [dimforge/rapier.js](https://github.com/dimforge/rapier.js) | Apache-2.0 | Physics and a built-in kinematic character controller (WASM) | Yes | 3D compat build 4.2 MB, 1.6 MB gz (wasm inlined) | commit 2026-07; npm 0.21.0 (2026-09) | Pre-1.0 API changes |
| [jrouwe/JoltPhysics.js](https://github.com/jrouwe/JoltPhysics.js) | MIT | Heavier, very fast physics (the engine Horizon Forbidden West used); character virtual controller | Yes (WASM) | wasm 2 MB, 728 KB gz (single-thread build) | commit 2026-10; npm 1.1.1 (2026-10) | Emscripten-style API, harder for small models |
| [pmndrs/cannon-es](https://github.com/pmndrs/cannon-es) | MIT | Simple pure-JS physics | Yes | 338 KB, 73 KB gz | **last commit 2024-01**; npm 0.20.0 (2022-08) | Stale; reference only for new work |

### 5b. Characters, animation, navigation, assets

| Repo / source | License | What we'd use it for | In browser? | Size | Activity | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| [mesh2motion/mesh2motion-app](https://github.com/mesh2motion/mesh2motion-app) | Code MIT, rigs and animations CC0 | Open Mixamo alternative: rig a model and apply animations in the browser | Yes | web app | commit 2026-11 | Young project |
| [VAST-AI-Research/UniRig](https://github.com/VAST-AI-Research/UniRig) | MIT | AI auto-rigging of any mesh | No (Python + GPU) | multi-GB | commit 2026-06 | Native, heavy; optional pack only |
| [isaac-mason/recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) | MIT | Navmesh pathfinding for NPCs | Yes (WASM) | npm small wrapper + wasm | commit 2026-10; npm 0.44.0 (2026-10) | Pre-1.0 |
| [donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform) | MIT | Shrink and fix glTF/GLB files on the host (Draco/Meshopt, texture resize) | Node and browser | npm 1.8 MB unpacked | commit 2026-10; npm 4.5.1 (2026-09) | Low |
| [pixiv/three-vrm](https://github.com/pixiv/three-vrm) | MIT | VRM avatars (humanoid rigs) for player characters | Yes | npm 2.5 MB unpacked | commit 2026-10; npm 3.5.5 (2026-07) | Low |
| [pmndrs/ecctrl](https://github.com/pmndrs/ecctrl) | MIT | Ready-made third-person character controller | Yes | npm 0.64 MB | commit 2026-09; npm 2.0.2 (2026-09) | Needs react-three-fiber and Rapier |
| [Kenney](https://kenney.nl) assets | CC0 | Low-poly and pixel packs ("all game assets … are public domain licensed (CC0)") | Files | per pack, MBs | ongoing | None; can be mirrored in packs |
| [Poly Haven](https://polyhaven.com/license) | CC0 | HDRIs, PBR textures, models | Files | MBs to GBs (pick resolutions) | ongoing | None; pick 1K/2K to keep packs small |
| [Quaternius](https://quaternius.com/license.html) | **Quaternius Asset License v1.0 (not CC0)** | Animated low-poly characters | Files | MBs | ongoing | Commercial use and no credit are fine, but **raw assets may not be redistributed as packs**: link to the site, never mirror them or put them in the community index |
| [KhronosGroup/glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) | Per asset (CC-BY-4.0, some CC-BY-NC) | Test models for loaders | Files | repo is large | commit 2026-10 | Check each asset's license; good for tests, not templates |

Many tutorials still call Quaternius "CC0". The current page says QAL v1.0. Older packs may have been released as CC0;
check the license that came with the files.

### 5c. Gaussian splats (photo-real captured scenes)

| Repo | License | Use | In browser? | Size | Activity | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| [sparkjsdev/spark](https://github.com/sparkjsdev/spark) | MIT | Splat renderer for three.js (by World Labs); mixes splats with meshes | Yes | 2.8 MB, 958 KB gz | commit 2026-10; npm 2.4.0 (2026-10) | Splat files themselves are tens to hundreds of MB |
| [mkkellogg/GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) | MIT | Older three.js splat viewer | Yes | 602 KB, 104 KB gz | last commit 2025-10; npm 0.4.7 (2025-01) | Slowing down; prefer Spark |
| [playcanvas/supersplat](https://github.com/playcanvas/supersplat) | MIT | Browser splat editor (crop, clean up, compress) | Yes | web app | commit 2026-10; tag v3.7.0 | Could open in the Preview as a tool |

**Recommended pick:** **three.js + Rapier** (Rapier's `KinematicCharacterController` gives walk, slopes and steps with
little code), **glTF-Transform** on the host to keep models small, **Kenney + Poly Haven** CC0 assets in a starter
pack, **Mesh2Motion** for open rigging and animation, **Spark** for splats. Babylon.js or PlayCanvas as the
alternative template when a project wants an all-in-one engine.

**Lazy-download plan:**

- "3D world" pack: three.js + Rapier + a walk-around starter scene with 3 to 5 Kenney models (~3 MB gz total).
  Offered at sense kind `3d` (or `game` with the `3d` tag).
- "Characters" pack: a rigged CC0 character + idle/walk/run/jump clips from Mesh2Motion's CC0 animations.
- "Splats" pack: Spark, fetched when a `.ply`/`.spz`/`.splat` file lands in the project.
- Poly Haven HDRIs and textures: downloaded per asset at 1K by default, never in bulk.

---

## 6. The "Godot-level / Unreal-level" path

Honest framing: browser engines (three.js, Babylon, PlayCanvas) already reach the "walk around a world with animated
characters" level. A real editor-based engine is for teams who want its editor, its animation tools and its export
targets. TribeCode can host that **as an optional, user-installed tool**, and the Preview pane can run its web export.

| Engine | License | Runs in the Preview? | Download | Activity | Notes |
| --- | --- | --- | --- | --- | --- |
| [godotengine/godot](https://github.com/godotengine/godot) | MIT | **Yes**, via its web export (WebAssembly + WebGL2, Compatibility renderer) | Editor and export templates are separate native downloads (templates are the big one) | commit 2026-11; latest tag 4.7.2-stable | Best fit. MIT means no royalties and we can ship web export output freely |
| [bevyengine/bevy](https://github.com/bevyengine/bevy) | MIT or Apache-2.0 | Yes, compiled to WASM (WebGL2 or WebGPU) | Rust toolchain on the host, also multi-GB with build caches | commit 2026-11; tag v0.20.1 | Code-only (no editor yet); long compile times hurt live vibe-coding |
| [FyroxEngine/Fyrox](https://github.com/FyroxEngine/Fyrox) | MIT | Yes (WASM) | Rust toolchain | commit 2026-11; tag v1.0.1 | Has an editor; smaller community |
| [4ian/GDevelop](https://github.com/4ian/GDevelop) | MIT (core, engine, IDE and extensions; name and logo are trademarks) | Yes, the engine is HTML5 | web IDE or desktop app | commit 2026-11; tag v5.6.287 | No-code event sheets; a possible "for non-coders" lane |
| [defold/defold](https://github.com/defold/defold) | Defold License 1.0 (custom) | Yes (HTML5 export) | native editor | commit 2026-11 | **Reference only** under our licensing rule |
| Unreal Engine | Epic EULA (custom) | Not natively: HTML5 export was removed from the engine years ago. Pixel Streaming instead streams video from a GPU machine | tens of GB, user-installed through Epic's launcher | n/a | **Reference only / user-installed.** Never bundled (below) |

### Godot in the Preview pane

How it would work:

1. The host installs Godot (an optional "Godot" pack: we fetch the official build and the web export templates from
   Godot's own releases, check the sha256, and store them under the tribe folder).
2. On save, the host runs `godot --headless --export-release "Web" .tribe/build/web/index.html` for the project.
3. The Preview pane serves that folder like any other preview, with live reload when the export finishes.

What to know:

- **Use the single-threaded web export.** Since Godot 4.3, web builds can run without threads, so they don't need
  the cross-origin isolation headers (COOP/COEP) that `SharedArrayBuffer` requires
  ([Godot 4.3 web export report](https://godotengine.org/article/progress-report-web-export-in-4-3/)). Our sandboxed
  Preview has no cross-origin isolation, so single-threaded is the only option without changing the sandbox.
- **Size:** in that 4.3 report the engine `.wasm` was about 40 MB uncompressed and about 5 MB with Brotli. Serve it
  compressed from the host.
- **Use GDScript for web projects.** C# web export has not been part of stable Godot 4 releases (a
  [prototype exists](https://github.com/raulsntos/godot4-web-dotnet-prototype)). Re-check this before promising it.
- **Agent fit:** `.tscn`/`.tres` scene files and GDScript are text, so Claude Code and local models can edit them.
  The [Kenney 3D platformer starter kit](https://github.com/KenneyNL/Starter-Kit-3D-Platformer) (MIT) is a good first
  template.

### Unreal, honestly

- **License** ([unrealengine.com/license](https://www.unrealengine.com/en-US/license)): free under $1M a year in
  revenue. Games pay a 5% royalty on lifetime gross revenue above $1M; Epic Games Store sales are royalty-free.
  Non-game commercial users above $1M pay $1,850 per seat per year. The EULA is custom, so we never redistribute
  engine code or binaries.
- **Size:** the editor install is tens of GB and needs a strong GPU. It cannot be a TribeCode pack.
- **Preview pane:** with no web export, the only route is Pixel Streaming: the host (or a friend's gaming PC) runs the
  packaged game and streams video over WebRTC into the Preview iframe. That costs real GPU time and upload bandwidth,
  and it adds latency. It is a "bring your own Unreal" integration: TribeCode detects an installed editor and links to
  the docs. We don't ship it.
- **Recommendation:** treat Unreal as a known external tool, like ArtCraft in `server/connections.js`. Agents can edit
  C++ and config files in the repo as usual, and humans run the editor themselves.

### How this compares with Spawn

What [spawn.co](https://spawn.co) says publicly (read 2026-11-07):

- **The pitch:** "Your Place to Make Games with Friends". You build by talking to an AI builder called Savi, who
  makes terrain, characters, lighting, music and rules.
- **Multiplayer:** "everything you make is multiplayer from the start", and friends join by link. A game can have
  places and instances.
- **2D and 3D:** "You can make 3D games, 2D games, or a mix of both", on its own engine (currently "Spawn 6", not
  named publicly beyond that).
- **Code:** each game has a Git repository with history, and outside coding agents can read and edit it. Spawn does
  not provide a ready-to-run Steam export, and assets are referenced by name, so a copy of the code isn't a full art
  bundle.
- **Money and devices:** making and playing are free with Savi included. Creators keep 50% of player spending, plus a
  daily Creator Fund. It works in a phone browser; an iOS app beta is announced on its Discord.

| | Spawn | TribeCode Studio (this plan) |
| --- | --- | --- |
| Where it runs | Spawn's cloud and engine | One friend's computer; any engine |
| Who builds | Savi (Spawn's AI) + you | You, your friends, each person's own agents, Flint locally |
| Multiplayer | Built in from the start, massive shared spaces | Friends-scale relay on the host (GAME-STUDIO.md); Colyseus later |
| Your code | Git repo, engine-specific; no Steam export | Plain repo you own; standard engines (KAPLAY, three.js, Godot) that export anywhere |
| Assets | Generated and referenced by name | CC0 packs + local generation; files live in your repo |
| Cost | Free; Spawn pays creators from player spending | Free and self-hosted; no store or payouts |
| Offline / local AI | Not offered | The point: deterministic recipes first, local models next, cloud only if chosen |

What to borrow: multiplayer as a default, one link to join, game-specific tools that can be shared as mods (our
Workshop already holds skills, recipes and templates), and a Git history behind every game. What not to copy: an
engine you can't take with you.

---

## 7. Local AI for building

### 7a. What to route where

Rule: **deterministic first, then the smallest local model that can do it, then a bigger local model, then the cloud
only if the tribe set one up.** Flint already follows the first two steps (`app/ui/flint.js` intents, then
WebLLM/Ollama via `server/llm.js`).

| Task | 1. Deterministic (Flint recipe) | 2. Small local | 3. Bigger local | Cloud (optional) |
| --- | --- | --- | --- | --- |
| New site, app or game skeleton | Recipe template + slots | — | — | — |
| Copy (headlines, button text, bios) | Phrase banks per tone | Qwen3 0.6B–1.7B (WebLLM, in browser) | Qwen3 4B–8B (Ollama) | Any |
| Small code edits ("make the player faster") | Tuning panel / AST edit recipes | Qwen2.5-Coder 1.5B | Qwen2.5-Coder 7B, Qwen3-Coder 30B-A3B | Claude Code etc. |
| Code completion | — | Qwen2.5-Coder 1.5B | Qwen2.5-Coder 7B | — |
| Sprites and textures | Procedural generators (palette, dither, tile rules) + pixelate filter | — | FLUX.1-schnell via stable-diffusion.cpp, then pixelate | Any image API |
| Sound effects | ZzFX/jsfxr parameter presets | — | — | — |
| Voice lines, narration | — | Kokoro-82M in browser (kokoro-js) | Kokoro / Piper on host | — |
| Speech to text (huddles, voice commands) | — | Whisper tiny/base (transformers.js) | whisper.cpp on host | — |
| "What's on this screenshot" | Visual diff (`visuals.js`) | SmolVLM-256M | Moondream 2B, Qwen2.5-VL | — |
| 3D models from an image | Kenney/Poly Haven search | — | TripoSR or TRELLIS (GPU, native) | — |

### 7b. Runtimes

| Repo | License | Use | Where | Size | Activity |
| --- | --- | --- | --- | --- | --- |
| [ollama/ollama](https://github.com/ollama/ollama) | MIT | Already the host's local brain (`server/brain.js`) | Host, native | installer + models | commit 2026-11 |
| [mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) | Apache-2.0 | Already Flint's in-browser brain (pinned 0.2.83 in `brainpick.js`; npm latest 0.2.87, 2026-10-30) | Browser, WebGPU | lib 6.7 MB, 2.2 MB gz + model | commit 2026-11 |
| [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) | MIT | Direct GGUF serving, OpenAI-compatible server, when Ollama is missing | Host, native | small binary + models | commit 2026-11 |
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | Apache-2.0 | Whisper, Kokoro, SmolVLM, embeddings in the browser (ONNX, WebGPU) | Browser | npm 10 MB unpacked + ONNX Runtime + model | commit 2026-10; npm 4.3.2 |
| [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) | MIT | The engine under transformers.js (`onnxruntime-web`) | Browser (WebGPU/WASM) | JSEP wasm 28.8 MB, 6.7 MB gz | commit 2026-11; npm 1.31.1 |
| [leejet/stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) | MIT | Local image generation (SD 1.5/SDXL/FLUX GGUF) without Python | Host, native | small binary + model | commit 2026-11 |
| [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) | MIT | Fast local speech to text on the host | Host, native | small binary + model | commit 2026-11 |
| [mudler/LocalAI](https://github.com/mudler/LocalAI) | MIT | One OpenAI-compatible server for text, image and TTS backends | Host, native/Docker | large | commit 2026-11 |

Reference only: [comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI) (GPL-3). A user can install it,
and TribeCode can call its local HTTP API, but we never bundle it.
[OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) (GPL-3): Piper moved there when
[rhasspy/piper](https://github.com/rhasspy/piper) (MIT) was archived on 2025-10-06. The archived MIT code and
existing web ports still work, but new Piper development is GPL. Prefer Kokoro (Apache-2.0) for TTS.

### 7c. Models and their licenses

| Model | License (from its model card) | Use | Notes |
| --- | --- | --- | --- |
| Qwen3 0.6B / 1.7B | Apache-2.0 | Flint chat, copy, intent fallback | Already offered in WebLLM |
| Qwen2.5-Coder 1.5B / 7B | Apache-2.0 (7B checked) | Completion, small edits | **The 3B size is `qwen-research` (not open for commercial use); skip it** |
| Qwen3-Coder-30B-A3B-Instruct | Apache-2.0 | Best local coder for a strong host; 30.5B total, 3.3B active, 256K context | Fast for its size because only 3.3B are active, but all weights must fit in RAM/VRAM |
| FLUX.1-schnell | Apache-2.0 ("personal, scientific, and commercial purposes") | Sprites, textures, concept art | 12B parameters; use quantized GGUF via stable-diffusion.cpp |
| SDXL-Turbo | `sai-nc-community` | — | **Custom / non-commercial: reference only** |
| Stable Diffusion 3.5 Medium | Stability Community License (free under $1M annual revenue) | — | **Custom: reference only** under our rule; a user may install it themselves |
| Kokoro-82M | Apache-2.0 | TTS, voice lines | 82M parameters; runs in the browser through kokoro-js (npm 1.2.1, Apache-2.0) |
| SmolVLM-256M-Instruct | Apache-2.0 | Screenshot understanding | "under 1GB of GPU RAM" per its card |
| Moondream 2 | Apache-2.0 | Better screenshot Q&A | 2B parameters |
| TripoSR | MIT | Image to 3D mesh | Python + GPU on the host |
| TRELLIS | MIT (repo) | Higher-quality image to 3D | Big GPU; check the weights' card too |
| Hunyuan3D-2 | Tencent community license | — | **Custom (also excludes some regions): reference only** |

### 7d. Memory guidance (rule of thumb, not measured here)

At 4-bit quantization a model needs about 0.6 GB per billion parameters, plus 1 to 2 GB for context and runtime.

| Model size | Approx. memory at 4-bit | Fits on |
| --- | --- | --- |
| 0.6B–1.7B | 0.5–1.5 GB | Any WebGPU laptop or recent phone (WebLLM) |
| 3B–4B | 2.5–3.5 GB | Most laptops with 8 GB RAM; 4 GB GPUs |
| 7B–8B | 5–6 GB | 8 GB GPUs; Apple Silicon with 16 GB |
| 14B | 9–10 GB | 12 GB GPUs; 16–24 GB Macs |
| 30B-A3B (MoE) | ~18–20 GB | 24 GB GPUs, or 32 GB+ RAM on CPU/Apple Silicon (fast because only 3B are active) |
| FLUX.1-schnell (quantized) | ~8–12 GB | 12 GB+ GPUs; slow on CPU |

The download manager should read the host's RAM/VRAM (Ollama and llama.cpp report it) and only suggest sizes that fit.

---

## 8. Flint brain: learning scripts safely

"Learning" here means **collecting working recipes and getting better at choosing them**, not training a model. It
is cheap, explainable, works offline and can be undone.

### 8a. The recipe format

A recipe is an [Agent Skills](https://agentskills.io) folder (`SKILL.md` with `name` and `description`, plus files),
the open format Anthropic released and the Workshop already stores. Flint adds a machine-readable `recipe.json`:

```json
{
  "id": "site.landing.waitlist",
  "version": 3,
  "kind": "site",
  "tags": ["landing page", "saas"],
  "when": { "kind": ["site"], "tagsAny": ["landing page", "saas"], "minConfidence": 0.45 },
  "slots": {
    "name":     { "type": "text", "from": "project.name" },
    "headline": { "type": "text", "from": "brain|phrasebank:headline", "max": 70 },
    "style":    { "type": "enum", "of": ["pico-warm", "pico-mono", "sticker-grid"], "default": "pico-warm" }
  },
  "steps": [
    { "op": "copy", "from": "files/index.html", "to": "index.html" },
    { "op": "fill", "file": "index.html" },
    { "op": "pack", "id": "site-basics@1" }
  ],
  "check": [
    { "op": "html-valid", "file": "index.html" },
    { "op": "preview-loads", "path": "/", "noConsoleErrors": true },
    { "op": "screenshot-not-blank" }
  ],
  "provenance": { "made": "2026-11-07", "from": "accepted generation", "sources": [{ "repo": "picocss/pico", "license": "MIT" }] },
  "license": "MIT"
}
```

Steps use only an allowlist of operations: `copy`, `fill` (slot substitution), `patch` (a structured edit),
`pack` (fetch a pack from the allowlist) and `npm` (add a dependency, after a confirm). There is no `exec`. Running a
recipe can't run arbitrary code on the host. Checks run the project in the existing sandboxed Preview or in a temp
worktree (`server/repo.js` already does temp-worktree checks).

### 8b. Deterministic generators per section

These are the recipes Flint can run with no model at all:

| Section | Generators |
| --- | --- |
| Sites | Landing (hero, features, waitlist), portfolio grid, link-in-bio, event page, docs page; 5–10 style packs |
| Apps | Tabs + list + detail shell, settings screen, shared list (Yjs), PWA manifest + icons from the project avatar |
| Tools / bots / APIs | Hono CRUD API over a JSON file or SQLite, Telegram/Discord bot with a `/start` and one command, CLI with clack prompts |
| 2D games | Platformer, top-down, shooter, endless runner, match-3 (KAPLAY and LittleJS); tile-map from rules; ZzFX presets (jump, coin, hit, explosion); palette-swap and pixelate filters |
| 3D | Walk-around scene (three.js + Rapier), orbit viewer for a GLB, low-poly island from noise, day/night skybox |
| Motion | "Hands as controller", "lean to steer", "tilt to steer" adapters wired to `tribe-motion.js` events |

### 8c. How a recipe gets learned

1. **Something works.** An agent, a local model or a person makes a change. The change merges, the Preview loads
   without errors, and the tribe keeps it (not reverted within a few days).
2. **Flint offers to save it**, as a quiet card, never automatically: "This waitlist section worked well. Save it as a
   recipe?"
3. **Slots are found deterministically.** Flint compares the result with the nearest existing recipe or starter. The
   parts that match the project's name, bio and copy become slots, and the rest becomes the template.
4. **A human approves it.** It goes into the existing Workshop `pending/` flow, and the person sees the files and the
   slots.
5. **Ranking stays local.** Each recipe keeps counts (used, kept, reverted) in the tribe folder. Flint suggests the
   ones that get kept. This is "learning over time from all users" inside a tribe, with no telemetry.

"Learning from how things work on the internet" means **reading permissively licensed repos** (the tables above)
into recipes, with their source and license recorded in `provenance`. We never scrape arbitrary websites into
templates.

### 8d. Sharing between tribes (opt-in only)

- **Nothing leaves a tribe without an explicit opt-in, per recipe.** No background upload, no usage telemetry, no
  "anonymous statistics".
- Sharing reuses the Workshop **donate** flow (`server/workshop.js`): it builds a contribution bundle, and with the
  member's own GitHub token it can open a pull request to the community repo. Tribes read the community index through
  jsDelivr (read-only, pinned to a commit).
- **Before a bundle is made**, Flint strips names, emails, paths, project text and chat. It scans for secrets (keys,
  tokens, `.env` patterns), requires an MIT or CC0 license on the recipe and on every included asset (so no Quaternius
  files, section 5), and shows the person the exact files that will be shared.
- **Using a community recipe** is also opt-in: it shows a diff first, runs its checks in a temp worktree, and is
  never applied automatically. The sha256 of every file is checked on download (the Workshop already does this).

### 8e. Evaluation and safety gates

- **Golden tests per recipe:** each recipe ships 1–3 example slot sets. CI for the community repo runs them headless
  (render, no console errors, screenshot not blank, size budget).
- **Size budgets:** a recipe declares its pack needs. A recipe that would pull more than its budget is refused.
- **Version pins:** packs and npm deps are pinned to exact versions with checksums.
- **Kill switch:** the host can turn off community recipes for the tribe in one toggle, and remove any learned recipe.
- **Model output is untrusted:** anything a model wrote goes through the same checks as a person's change before
  Flint offers to save it.

---

## 9. Phased roadmap: what appears in the Preview pane, and when

Project sense already gives `kind` and `confidence`, and the UI treats ≥0.45 as "we know what this is"
(`kindFor`). The host can always override the kind (confidence 1). Abilities appear as quiet chips in the Preview
toolbar, never as popups, and each one can be dismissed.

| Phase | Trigger | The Preview pane shows | Downloads |
| --- | --- | --- | --- |
| 0. Plain | Any project, confidence < 0.45 | Live preview, device sizes, reload (today) | None |
| 1. Starter shelf | Kind known, confidence ≥ 0.45 | Kind label ("Preview game"); 2–3 starter recipes for that kind; Flint can run them offline | Kind's basics pack (≤ 200 KB gz) on first use |
| 2. Studio tools | Confidence ≥ 0.65 **and** a matching tag (`pixel art`, `platformer`, `3d`, `multiplayer`, `landing page`…) | Chips: Sprite editor (Piskel), Level (LDtk), Sounds (ZzFX), Tuning panel, Style packs, API runner, Bot chat | Tool packs, each ≤ ~5 MB, on tap |
| 3. Play modes | A game that runs (Preview loaded without errors at least once) | "Play with your hands" (MediaPipe), gamepad map, phone tilt; "Play together" (GAME-STUDIO.md relay) | Motion pack (~4 MB gz + models) on opt-in; turns on `camera` for this project's iframe |
| 4. Studio mode | Confidence ≥ 0.8 or host override, plus ≥ 2 people working on it | Lanes, playtest journal, spectate (GAME-STUDIO.md) | None extra |
| 5. Heavy engines and AI | **Explicit request only** ("use Godot", "generate sprites", Settings › Packs) | Godot web export in the pane; local image/3D generation; Bevy builds; Unreal as a linked external tool | Multi-GB packs, with size, disk space and GPU fit shown before download |

Build order:

1. The pack manager (section 10), plus the 2D game and Site basics packs.
2. `tribe-motion.js` + the Motion pack.
3. The 3D world pack.
4. The recipe format + learn-a-recipe flow.
5. The Godot pack.
6. Local image generation.
7. Community recipe sharing.

---

## 10. Download manager design (optional packs)

**What a pack is:** a manifest + files, all pinned and verified.

```json
{
  "id": "motion", "version": "1.2.2-tc1", "title": "Play with your hands",
  "license": "Apache-2.0", "source": "npm:@mediapipe/tasks-vision@1.2.2",
  "bytes": 9800000, "installedBytes": 31000000,
  "needs": { "webgpu": false, "vramGB": 0, "native": false },
  "files": [
    { "path": "wasm/vision_wasm_internal.wasm", "url": "https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.2.2.tgz#wasm/vision_wasm_internal.wasm", "sha256": "…", "bytes": 14603000 },
    { "path": "models/hand_landmarker.task", "url": "…", "sha256": "…", "bytes": 7800000 }
  ]
}
```

**Where things come from:** the official npm tarball, the project's GitHub release, or the model's official host.
URLs and hashes are written into a signed pack index that ships with each TribeCode release. A pack is never "latest".

**Where packs live:** on the host, in `~/TribeCode/.tribe/packs/<id>@<version>/`, served read-only at
`/packs/<id>@<version>/…` with `Cache-Control: immutable`, `nosniff` and the right `Content-Encoding` for
pre-compressed `.br`/`.gz` files. The Preview loads packs from the host, never from a CDN, so:

- it works offline;
- it works for friends through Tailscale Funnel or cloudflared;
- it works despite the Preview's opaque-origin sandbox (plain HTTP caching, no Cache Storage needed).

Native packs (Ollama models, stable-diffusion.cpp, Godot) go in `~/TribeCode/.tribe/packs/native/` and are run by the
server only through fixed command lines, never through a shell.

**The flow:**

1. **Offer.** A chip shows the name, what it adds, the download size, the disk size, and whether this computer can
   run it (RAM/VRAM, WebGPU).
2. **Download.** Resumable (HTTP Range), on the host, with progress shown to everyone in the room. One download at a
   time per pack, and a pause button.
3. **Verify.** sha256 of every file. On a mismatch, delete it and say so plainly. Then unpack into a temp folder and
   rename into place (atomic).
4. **Use.** Projects reference packs by id and version. `.tribe/packs/usage.json` records which projects use what.
5. **Remove.** Settings › Packs lists each pack with its size, which projects use it, when it was last used, and a
   Remove button. It warns if a project still uses the pack, and it can remove packs unused for 30 days.
6. **Budget.** A host setting caps total pack disk use (default 5 GB). Multi-GB packs always ask, even under the cap.

**Never bundled:** Unreal, the Godot editor and templates, image and 3D models, and anything GPL or custom-licensed.
Users can install the GPL and custom ones themselves, and TribeCode then detects them and talks to them over their
local APIs.

---

## 11. Top 10 repos to try first

| # | Repo | Why first |
| --- | --- | --- |
| 1 | [KilledByAPixel/LittleJS](https://github.com/KilledByAPixel/LittleJS) (MIT) | "Instant pixel-art game" starter: small, sound and tiles built in, easy for small models to edit |
| 2 | [kaplayjs/kaplay](https://github.com/kaplayjs/kaplay) (MIT) | Already the planned 2D template; 68 KB gz |
| 3 | [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe) Tasks Vision (Apache-2.0) | Motion control in the browser; the headline new ability |
| 4 | [mrdoob/three.js](https://github.com/mrdoob/three.js) (MIT) | 3D template A; widest ecosystem |
| 5 | [dimforge/rapier.js](https://github.com/dimforge/rapier.js) (Apache-2.0) | Physics + character controller for "walk around a world" |
| 6 | [KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX) (MIT) | 3 KB gz sound effects as numbers, ideal for deterministic recipes |
| 7 | [deepnight/ldtk](https://github.com/deepnight/ldtk) (MIT) | Level format agents can read and write |
| 8 | [picocss/pico](https://github.com/picocss/pico) (MIT) | Site basics: good-looking HTML in 11 KB gz |
| 9 | [yjs/yjs](https://github.com/yjs/yjs) (MIT) | Shared app state over our existing WebSocket |
| 10 | [huggingface/transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0) | One runtime for in-browser Whisper, Kokoro TTS and SmolVLM |

Next in line: Godot web export (MIT), [sparkjsdev/spark](https://github.com/sparkjsdev/spark) for splats,
[piskelapp/piskel](https://github.com/piskelapp/piskel) as the in-pane sprite editor,
[leejet/stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) + FLUX.1-schnell for local sprites, and
[mesh2motion/mesh2motion-app](https://github.com/mesh2motion/mesh2motion-app) for open character animation.

---

## Sources (beyond the repos linked above)

- Spawn: [spawn.co](https://spawn.co) (read 2026-11-07).
- Unreal license: [unrealengine.com/license](https://www.unrealengine.com/en-US/license).
- Godot web export: [Progress report: Web export in 4.3](https://godotengine.org/article/progress-report-web-export-in-4-3/);
  [C# web prototype](https://github.com/raulsntos/godot4-web-dotnet-prototype).
- MediaPipe web setup: [Hand Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
- Model cards on Hugging Face: [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell),
  [SDXL-Turbo](https://huggingface.co/stabilityai/sdxl-turbo),
  [SD 3.5 Medium](https://huggingface.co/stabilityai/stable-diffusion-3.5-medium),
  [Qwen2.5-Coder-3B-Instruct](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct),
  [Qwen2.5-Coder-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct),
  [Qwen3-Coder-30B-A3B-Instruct](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct),
  [Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B), [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M),
  [SmolVLM-256M-Instruct](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct),
  [moondream2](https://huggingface.co/vikhyatk/moondream2).
- Asset licenses: [Kenney](https://kenney.nl/support), [Poly Haven](https://polyhaven.com/license),
  [Quaternius](https://quaternius.com/license.html).
- Skill format: [agentskills.io](https://agentskills.io).
