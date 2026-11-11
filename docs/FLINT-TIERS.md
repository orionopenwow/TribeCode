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

## Flint's local brain (no model at all)

The first tier is wider than a list of commands. `app/ui/flintnlu.js` understands what people type with no language
model, in the browser and on the server, and `app/ui/flintlocal.js` does it. Flint's chat tries it first.

- **About 170 actions across the app:** tasks (add, finish, start, assign, review, delete, move the due date, rename,
  list, "what needs someone"), notes, docs, sheets, slides, the vision, DMs and chat posts, the calendar (add, "what's
  on today"), free builds and the 16 website templates, the design canvas (13 screens, tidy up, rename layers, dark
  version, variants, send to the app, export), the preview (reload, phone/tablet/desktop, edit, comments, publish),
  edits to the picked element, themes, accent, text size, language, personalize, invites, hosting, connecting an AI,
  the Secretary and autopilot, jams, huddles, capture, the Marketplace, trending repos, Studios, assets, find, status,
  and about 40 places to open.
- **Spelling and slang:** "ad a tsk to buy milk tomorow", "pls", "tmrw", "whats". Edit distance against the words
  Flint knows, with real words protected so "bake" stays "bake".
- **Dates, times, people, colors:** "by friday", "the 20th", "in 3 days", "at 5pm", "for Maya", "teal", "#ff6f8e".
- **Several steps at once:** "make a merch store for Ember Socks, dark, then add a task to order samples for Friday
  and tell Maya". A step with no message ("tell Maya") gets a summary of what Flint just did.
- **What's on screen:** "make it bigger" edits the element picked in the preview or the canvas selection; "mark it
  done" is the last task; "tell her" is the last person.
- **Eight languages** for the core commands (tasks, notes, open, theme, undo) and every reply.
- **One question when a detail is missing** ("Which task?"), with tappable answers. **Did you mean** with three
  choices when Flint isn't sure; tapping one teaches him.
- **Undo** for every change it can take back: tasks, messages, calendar events, theme, accent, text size, language.
  A build stays in the code; Flint points to History in the preview instead.
- **Taught phrases:** "when I say standup, open the calendar", or "no, I meant …" after a miss. Stored per person on
  the host (`/api/flint/learned`) and on the device, matched by TF-IDF.
- **How-to answers from the docs:** the Guide first, then `docs/*.md` ranked by TF-IDF (`/api/flint/kb`,
  `server/flintkb.js`), with the source named.
- **Local smarts:** math ("split 120 between 4", "15% of 80", tips), unit conversion, the date and time, "what date
  is next friday", coins, dice, random numbers, "who should do the dishes".

What it can't do: write or judge open-ended text (a poem, a review of a design), reason about code, chat freely, or
answer questions the docs don't cover. Those get the honest card: hand it to your AI helper, or give Flint a brain.

Coverage: `app/test/flint_nlu_test.js` runs `app/test/flint_nlu_cases.json` (750 phrasings: 406 written by hand,
plus typo and filler variants, plus a held-out set that was never tuned against and is reported on its own).
`app/test/e2e_flint_local.py` runs 15 commands in the app with no model.

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

Tests: `app/test/e2e_flint_free.py`, `app/test/e2e_flint_local.py`, `app/test/flint_nlu_test.js`.

## Flint everywhere: the Dashboard, your idea, your style

- **On Home, with or without a tribe.** Ask Flint sits on the Dashboard (`TribeFlint.mountDashboard(el)`, one slot in
  `app/ui/hub.js`). It shares the thread with the room panel. With no tribe yet he still plans your day, grows your
  idea, explains features from the docs (`/api/flint/kb` answers this computer even before a tribe exists), opens your
  files and the inspiration board, and starts your first project.
- **Grow your idea.** Three tappable questions (what you're growing, where it is, what would help most), then a short
  plan that ties the company, the app and the website together, with deep links to the right resources: Academy
  tracks, Guide pages, Legal templates, the build kit and Studios, the Marketplace, the 16 website templates and the
  docs (`app/ui/flintgrow.js`). Rules write the plan; an AI, when on, refines it in place.
- **Your style.** The inspiration board (`app/ui/inspoboard.js`, `server/inspo.js`) holds openly licensed pictures and
  sounds from Openverse and Wikimedia Commons, each with its license, creator and source, copied through the host
  (no hotlinking). The server measures each picture's colors (`server/imgcolors.js`: PNG, and a DC-only JPEG average),
  suggests an accent and a font pairing, and "Use my board's style" applies them to your view and the project's website
  and app.
- **✦ everyday help.** See [DESIGN-SYSTEM.md §11](DESIGN-SYSTEM.md#11-basic-features-supercharged-by-ai).

## Abilities log

Agents: add a dated line whenever Flint learns something new. Newest first. Say which tier it runs in.

- **2026-11-10** (feat/flint-ai)
  - Flint on the Dashboard, working with no tribe (free · no AI).
  - Today's plan from your tasks, reviews, calendar and note checkboxes (free · no AI; refined by AI when on).
  - "Grow my idea": 3 tappable questions, then a plan for company + app + website + cohesion with resource links (free · no AI; refined by AI).
  - Recommends learning resources for a goal (company, app, website, cohesion) with deep links (free · no AI).
  - Explains a feature from the local knowledge base ("explain the inspiration board") (free · no AI).
  - Opens your files and the inspiration board; starts your first project (free · no AI).
  - Searches openly licensed pictures and sounds ("find sounds of rain"), saves them with credits (free · no AI, needs internet).
  - "Use my board's style": accent, font pairing, website brand kit and design/inspiration.css (free · no AI).
  - ✦ in chat (summarize, turn into tasks), tasks (split, estimate, suggest an owner), docs and notes (tidy, outline,
    continue), files (describe and tag), company seats (fill in the charter) (free · no AI; refined by AI).
