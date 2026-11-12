# Starters to remix

Two kinds of starters live in TribeCode:

- **Built-in starters** (`app/ui/starters/`, since the Design flow): small apps and games copied into TribeCode with their license, adapted to run with no build step, and tweakable by Flint. They are what Design › App and Design › Game offer, and what Flint picks for "make a breakout game".
- **Starters to remix** (`templates/starters.json`): bigger open-source projects you copy from GitHub or browse, listed under New project › Remix a starter.

TribeCode lists open-source projects people can build on: in the app (New project › **Remix a starter**) and on the website (**Remix a classic**). The list lives in `templates/starters.json`.

## The rules for adding one

1. **License first.** Only MIT, BSD, Apache-2.0, ISC, zlib or CC0. Check the repository's LICENSE file yourself. No GPL/AGPL (it would bind the remix), and nothing without a license (no license means no permission).
2. **Credit stays.** Each entry names its authors, and a remix keeps their LICENSE file.
3. **`remix: true` only for small repositories** that make a good first version on their own. Big collections (engines, example galleries) get `remix: false` and a `url` to browse.
4. Add three `try` ideas: what a tribe could build on it first.

Checked and left out (November 2026): `ellisonleao/clumsy-bird` (GPL), `excaliburjs/sample-platformer` (no license file).

## The list

| Starter | Kind | By | License | How | Source |
| --- | --- | --- | --- | --- | --- |
| 🔢 2048 | game | Gabriele Cirulli | MIT | Copy into a new project | https://github.com/gabrielecirulli/2048 |
| 🕹️ Phaser + Vite template | game | Phaser Studio | MIT | Copy into a new project | https://github.com/phaserjs/template-vite |
| 🍈 melonJS boilerplate | game | melonJS | MIT | Copy into a new project | https://github.com/melonjs/es6-boilerplate |
| 🧩 PixiJS open games | game | PixiJS | MIT | Copy into a new project | https://github.com/pixijs/open-games |
| 🎯 LittleJS examples | game | Frank Force | MIT | Browse and borrow | https://github.com/KilledByAPixel/LittleJS |
| 🦖 KAPLAY examples | game | KAPLAY team | MIT | Browse and borrow | https://github.com/kaplayjs/kaplay |
| 🤖 Godot demo projects | game | Godot Engine contributors | MIT | Browse and borrow | https://github.com/godotengine/godot-demo-projects |
| 🧊 three.js examples | game | three.js authors | MIT | Browse and borrow | https://github.com/mrdoob/three.js |
| ✅ TodoMVC | app | TasteJS | MIT | Browse and borrow | https://github.com/tastejs/todomvc |
| 📱 Expo phone app | app | Expo | MIT | Browse and borrow | https://github.com/expo/expo |
| 🌐 HTML5 Boilerplate | site | H5BP | MIT | Copy into a new project | https://github.com/h5bp/html5-boilerplate |
| 🚀 Astro site templates | site | Astro | MIT | Browse and borrow | https://github.com/withastro/astro |
| 🎨 Kenney game art | asset | Kenney | CC0 | Browse and borrow | https://kenney.nl/assets |

## Screenshots

- **Starter cards** (website "Start from something"): real screenshots of real, working pages, made by `python3 scripts/starter-shots.py`. The Pixel platformer and Portfolio come straight from `templates/`; the others are small working pages in `scripts/starter-shots/` (their real UI, real code and real output).
- **Remix cards**: each image comes from the project itself, under its MIT license, with the authors credited on the card: 2048, TodoMVC and the KAPLAY double-jump example were run locally and captured; Phaser, LittleJS, Godot and three.js use the screenshot files in their own repositories. Projects without a usable image show a plain tile instead of an invented picture.

## Built-in starters (the Design flow)

### The plan

1. **What we want.** Small, readable starters for the most-asked app and game kinds that run as plain files: an
   `index.html` with no build step, no CDN, no network, no npm. They must work in three places: opened directly, inside
   a sandboxed iframe (the Design flow's play pane and the project preview: no same-origin, so no `localStorage`,
   no `fetch` of local files, no `alert`/`prompt`), and copied into a project's code by Flint.
2. **Where they come from.** First choice: a permissively licensed (MIT, Apache-2.0, BSD, ISC, CC0) small repo on GitHub
   with a vanilla canvas or DOM implementation. We cloned the candidates through the proxy, read every LICENSE file and
   the file headers, and measured them. When nothing suitable and clean existed for a kind, we wrote an original
   starter (MIT, TribeCode contributors) and say so on the card and in its README, naming what inspired it.
3. **How each one is adapted.** The game or app code stays recognisable. The tunable numbers and colors move into
   `config.js` (one `key: value,` line each), so Flint and people change them without touching the code. Each folder has:
   `index.html`, the code, `config.js`, `STARTER.json` (title, kind, summary, controls, the source repo, license,
   authors and what changed, the knobs with min/max and the words that move them, ideas), `README.md` and the original
   `LICENSE` file. NOTICE lists every starter. Adapted code gets a header comment with the source and the changes.
4. **Rules (checked by `node scripts/dev/starters.js --check` and `app/test/starters_test.js`).** An allowed license;
   source URL, authors and changes for adapted starters; a LICENSE file and a NOTICE entry; ≤ 300 KB; text files and
   small images only; nothing loaded from the network; and the page runs with no console errors, directly and sandboxed.
5. **Wiring.** `scripts/dev/starters.js` writes `config.js` and `README.md` from `STARTER.json` and the catalog
   (`app/ui/starters/catalog.json`) that the Design flow reads. `app/ui/starterkit.js` (shared by the browser and
   `server/flintfree.js`) turns words into knob values for free ("much faster", "floaty", "in pink", "called Fox Dash")
   and writes them into `config.js`; with an AI connected the Design flow also asks it (`design.tune`). In a project,
   `POST /api/projects/:id/flint/build { starter, ask, values }` copies the starter into the code (`builds/<name>/`
   when the top folder already has a page), commits it with the license, and `POST …/flint/starter-config` reads or
   changes its knobs. On this device (no tribe) the starter is inlined into one HTML file kept in Files. Flint's words
   ("make a breakout game", "build a kanban board") are entries in `app/ui/flintnlu.js`'s template map and cases in
   `app/test/flint_eval.json`; the server's free tier picks the same starters (`starterFor` in `server/flintfree.js`).
6. **Pictures.** `python3 scripts/dev/design-thumbs.py` plays each starter for a moment in headless Chrome and saves a
   480×300 WebP to `app/ui/starters/thumbs/`.
7. **Adding one.** Make the folder, write `STARTER.json`, wire the knobs to `window.CONFIG`, run
   `node scripts/dev/starters.js`, `python3 scripts/dev/design-thumbs.py --only starters` and
   `node app/test/starters_test.js` (add a one-line interaction to its `POKE` table).

### The list

| Starter | Kind | Source | License | Notes |
| --- | --- | --- | --- | --- |
| Tiny platformer | game | [jakesgordon/javascript-tiny-platformer](https://github.com/jakesgordon/javascript-tiny-platformer), Jake Gordon and contributors | MIT | The level ships as `level.js`; touch controls |
| Breakout | game | [end3r/Gamedev-Canvas-workshop](https://github.com/end3r/Gamedev-Canvas-workshop) (the MDN 2D breakout tutorial), Andrzej Mazur and Mozilla contributors | CC0-1.0 (code) | The repo's prose is CC-BY-SA 2.5; its code samples are public domain, which is all we use |
| Falling blocks | game (puzzle) | [jakesgordon/javascript-tetris](https://github.com/jakesgordon/javascript-tetris), Jake Gordon and contributors | MIT | Texture and FPS stats removed; touch buttons |
| Snake | game | [patorjk/JavaScript-Snake](https://github.com/patorjk/JavaScript-Snake), Patrick Gillespie and contributors | MIT | One flat theme instead of the theme picker, fonts and images |
| Endless runner | game | Original | MIT | Inspired by Chrome's offline dinosaur game; no code or art copied |
| Top-down arena | game | Original | MIT | Twin-stick arena shooter |
| Memory cards | game (cards) | Original | MIT | A card-game base: deck, shuffle, turns, score |
| To-do list | app | [bradtraversy/50projects50days › todo-list](https://github.com/bradtraversy/50projects50days/tree/master/todo-list), Brad Traversy | MIT | Delete button, count, sandbox-safe store |
| Notes | app | [bradtraversy/50projects50days › notes-app](https://github.com/bradtraversy/50projects50days/tree/master/notes-app), Brad Traversy | MIT | A small safe Markdown renderer instead of the marked and Font Awesome CDNs |
| Sketch pad | app | [bradtraversy/50projects50days › drawing-app](https://github.com/bradtraversy/50projects50days/tree/master/drawing-app), Brad Traversy | MIT | Pointer events (mouse, pen, touch), Save PNG |
| Kanban board | app | Original | MIT | Drag and drop, keyboard and tap moves |
| Dashboard | app | Original | MIT | KPI tiles, SVG line chart, bars, a table, from mock data |
| Chat UI | app | Original | MIT | Bubbles, typing indicator, a pretend friend |
| Form and survey | app | Original | MIT | One question per step, validation, answers as JSON |
| Pomodoro timer | app | Original | MIT | Progress ring, rounds, Web Audio beep |
| Calculator | app | Original | MIT | A safe expression parser (no eval) |
| Weather | app | Original | MIT | Mock data; `getWeather()` is the one function to swap for Open-Meteo |

### Checked and left out (November 2026)

- `rembound/Match-3-Game-HTML5`: the LICENSE file says MIT but the source file's header says GPL-3.0. Conflicting
  terms, so no.
- `wayou/t-rex-runner`: BSD-3-Clause code, but the sprites are Chrome's dinosaur artwork; we wrote our own runner instead.
- `bradtraversy/vanillawebprojects`: no LICENSE file (no license means no permission).
- `jakesgordon/javascript-breakout`, `javascript-gauntlet`: MIT, but they need a sound library and many megabytes of
  images and sounds; the MDN breakout is smaller and public domain.
- `einaregilsson/cards.js`: MIT, but it needs jQuery and 1.3 MB of card art; Memory cards covers the card-game base.
- `50projects50days › feedback-ui-design` and `simple-timer`: load their icons and Tailwind from CDNs and outside image
  hosts; the survey and pomodoro starters are original instead.
- Kaboom/KAPLAY and Phaser single-file builds (MIT) were considered; every starter here is vanilla, so none is vendored.
