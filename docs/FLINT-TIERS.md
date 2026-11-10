# Flint's tiers: what's free, and what needs a stronger AI

Flint is TribeCode's built-in helper. Most of what he does needs no AI model at all. When a job is bigger than
that, he says so plainly and hands it to a stronger AI, with your OK. This page is the map; the code is
`server/flintfree.js` (the capability map and recipes), `server/preview.js` (look rules, the property sheet,
Undo) and `app/ui/previewflint.js` (the Flint panel beside the live preview).

Flint is not a large trained model. "Free" here means: rules, templates and recipes that run anywhere, plus small
open models (Qwen) when a device or the host can run one. TribeCode never routes requests through anyone's Claude
subscription, and this repository holds no prices.

## The four tiers

| Tier | Runs on | What it does |
|---|---|---|
| **Free · no AI** (`rules`) | Anywhere, even a phone with no signal | Guide answers, tasks, notes, navigation, built-in sounds and sprites, docs/sheets/decks from templates, and edits to the element you pick in the preview: words, color (named or hex), size, font size, bold/italic/underline, alignment, padding, rounded corners, hide or remove, dark or light page |
| **Free · recipes** (`recipe`) | The host, no AI | First versions from the open-source build kit: a landing page for anything, a to-do app, a 3D game (three.js), a 2D platformer, a video editor. Name, words and accent color come from what you said |
| **Free · small model** (`small`) | Qwen in this browser (WebGPU) or on the host (Ollama) | Chat, short copy, fuller docs/sheets/decks, small one-page edits |
| **A stronger AI** (`agent`) | A member's own Claude Code, Codex or Gemini; or the host's AI key | Many-file changes, new game systems (multiplayer, saves, AI enemies, level editors), accounts, databases, payments, servers, refactors, ports, performance, hard debugging |

`GET /api/flint/tiers` returns this map and whether the tribe's AI is on. `POST /api/flint/tier { ask, picked }`
classifies one request. Ask Flint "What can you do for free?" to see it in the app.

## Free building

- In the Flint panel beside the preview, or in Flint's chat: "make a 3D game called Gem Rush", "build a to-do app
  for our chores", "make a landing page for Sunrise Bakery in green", "build me a video editor", "make a platformer".
- Flint copies the starter (`templates/starter-3d`, `starter-video`, `starter-game`, `templates/recipes/landing`,
  `recipes/todo`), fills in the words, commits it ("Flint: a … (free recipe)"), and shows it in the preview.
- It never overwrites: if the repo already has a page at the top, the build goes into `builds/<name>/`.
- When an AI helper is connected, the brief also goes to them so they can take it further. With none, the free build
  stands on its own and Flint says what a stronger AI could add.

## Point and edit (no prompt)

Pick an element with **Edit** in the preview and the **Properties** sheet opens in the Flint panel: padding, margin,
width, height, font size and weight, text and fill color, radius and alignment. Each change is written to the
page's source as an inline style on that element (values are checked against an allowlist), the preview reloads,
and **Undo** takes back the last change on that page (up to 40 steps, kept while the server runs).

## The Flint panel's tools

- **Plan first:** anything going to the AI helpers first shows the steps; edit them, then **Run plan**. The plan goes
  with the request.
- **+ Note / Apply all:** collect several notes (each remembers the element you had picked), then apply them together.
  Free ones are done right away; the rest go to the AI helpers in one brief.
- **History:** every version is a git commit. **Save this version** commits unsaved preview edits; **Restore** brings
  back an earlier version as a new commit (your unsaved work is saved first, nothing is rewritten).

## On phones

- The built-in model needs WebGPU: Safari on iOS 26 or later, or Chrome on Android. Phones always get the smallest
  model (Qwen3 0.6B, about 500 MB) with a note to download on Wi-Fi; it uses some battery while it thinks.
- Without WebGPU, everything in the first two tiers still works on the phone: picked-element edits, the property
  sheet, recipe builds, tasks, notes and the Guide.
- The Flint panel is a bottom sheet over the preview at phone width, with full-size buttons.

Tests: `app/test/e2e_flint_free.py`.
