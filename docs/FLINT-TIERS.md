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

## Flint on your device: levels 0 to 2

What runs on hardware you control, with nothing sent to an AI service. Flint's page (`#/flint`) lists the levels and
has **Running on your device**: WebGPU or not, cores, the memory hint, free storage, which levels are active, what
was downloaded, a self-test with live numbers, and what would leave the device (only your own AI or credits).

| Level | What | Download | How it turns on |
|---|---|---|---|
| **0 · No AI** | Rules and math: commands, follow-ups ("tell Sam too", "make that 15"), plans from a goal, project memory, duplicate-task check, concept search | none | always |
| **1 · Local brain** | A small word-meaning model in plain JS, no GPU: matching by meaning in "did you mean", help answers, the palette and "where did we talk about…" | about 30 MB (8 MB on phones), once | **recommended setup step**: Home after sign-up, the Getting started list, Settings › Plan & AI. Download now / Later; waits on metered or slow connections and low storage; resumes |
| **2 · Local model** | A small language model: turns loose requests into Flint's own commands (checked, undoable), real summaries, rewrites in a tone, drafts from project facts, explains errors, names | the model's own size | opt-in: "Choose a local model" on Flint's page. Ollama / LM Studio / llama.cpp on this computer or the host, or the built-in model in a WebGPU browser |

- **A plan from a goal:** "launch page for our bake sale by friday" shows the steps first (skip any), then runs them
  one by one with a progress bar; "Undo last step" takes back exactly one.
- **Project memory:** say "the bake sale is on Saturday 14 June" or "we decided to drop multiplayer"; ask "when is
  the bake sale?". "What Flint knows about this project" lists every fact to edit or forget. Stored in the project's
  `.tribe/flint-facts.json`, never sent anywhere.
- **What a local model may do:** only hand back text or Flint's own commands. Hosting, invites, payments and
  publishing are refused; messages to people and deletions wait for a press. Only `localhost` addresses are accepted.

Details, what was only tested with fixtures, and the desktop CSP: [FLINT-RESEARCH.md §5](FLINT-RESEARCH.md).
Scores: [FLINT-CAPABILITY.md](FLINT-CAPABILITY.md). Tests: `flint_local_test.js`, `e2e_flint_setup.py`,
`e2e_flint_llm.py`, `e2e_flint_showcase.py`.

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

## Watch Flint build and proof of work

`app/ui/flintrun.js` (Help › Watch Flint build, "watch flint build", `scripts/flint-runthrough.js`). Flint drives the real
app with his normal commands, one caption per step, checks each step through the API, then exports two ZIPs with the
existing ZIP writer (`TribeExport.zip`), saved by the host in `<tribe>/exports/` (`server/flintrun.js`) and downloadable:

```
<project>-proof.zip                           tribe-<name>-proof.zip
  README.md          what Flint built            README.md
  TIMELINE.md        every step, time, command   TIMELINE.md, timeline.json
  timeline.json      + Flint's reply + check     tribe/manifest.json
  tribe/manifest.json  tribe, members, projects  projects/<project>/…   the project's proof (all of the left)
  website/           the site (template + edit)  projects/<other>/…     each other project's
  game/              the game from the starter                           tasks, docs, chat, vision
  builds/            other builds
  docs/*.md          docs from templates + the presentation deck
  design/            design.svg, design.png, canvas.json
  chat/              transcript.md, messages.json
  tasks/             board.json, board.md
  vision/VISION.md, company/company.json, proposals/proposals.json
  presentation/      index.html (standalone), slides.md
```

New commands it uses (also usable on their own): "start a tribe called …", "start a project called …", "set the vision
to: …", "propose: …", "approve the proposal", "run the standup", "change the website headline to …", "make the product
presentation", "export the proof of work", "make a blender turntable [for model.glb]" ([FLINT-CREATORS.md](FLINT-CREATORS.md)).

## Local document smarts

`app/ui/localdoc.js` (shared by the browser and the server) reads any text with no model: **summarize** (extractive,
TextRank-lite: a sentence graph by shared words, PageRank, a small lead and heading bonus, near-duplicates dropped),
**key points and action items**, **title ideas**, **tags**, **reading time and outline**, and **explain like I'm new** (a
glossary from the text's own definitions, "Model Context Protocol (MCP)", and ~90 plain-language basics). Text comes from
docs, notes, chat, and repo files (txt, md, html, json, csv and the text layer of PDFs, `GET /api/ai/extract`).
Each is a ✦ in the doc and note toolbars and a Flint command ("summarize the doc called …", "key points of this doc",
"suggest tags for …", "how long to read …", "explain the terms in …", "summarize the file brief.pdf", "summarize the chat").
With an AI on, the same answer is refined in place (`POST /api/ai/refine`, kinds `doc.summary`, `doc.points`,
`doc.title`, `doc.tags`, `doc.read`, `doc.glossary`) and says "via …". The docs API's summarize (`POST
/api/docs/:slug/summarize`) falls back to the extractive summary when there is no local brain. Test:
`app/test/e2e_local_summarize.py`.

## One Flint chat everywhere

The website designer, the design canvas and the live preview all use the same Flint chat as the right panel and Home:
`TribeFlint.mount(el, { ctx, run, chips, onSay, onClear, tools })` in `app/ui/flint.js` (CSS in `flint.css`, `.flint-mount`).
Same thread look, composer (flame menu, dictation, send), chips, AI card and history; only the context changes:

- `ctx: 'designer'` (`app/ui/sitedesigner.js`): the thread is the design's log, so Undo on a message and the designer's
  Undo/Redo share one history. Chips follow what you're doing (a link-in-bio page, a selected section, a picture).
- `ctx: 'canvas'` (`app/ui/canvas/flintpane.js`): the thread is the design file's, shared live; each change has its own
  Undo and Show; + Note collects several asks.
- `ctx: 'preview'` (`app/ui/previewflint.js`): the build feed (saved files with +/− counts, reloads, errors with Fix it,
  AI helpers' work) is event lines in the same thread; Plan first, History, Properties and notes sit above the composer.

`run(text, ui)` does the editor's own commands; anything else goes to Flint's full brain (`ui.flint(text)`), and the
reply lands in that same thread. At 390px each is the editor's bottom sheet with the same chat.

## When Flint doesn't understand

He asks one short question with chips that do something real (`TribeNLU.clarify(text, { view })`): "Add a link: what
should it say, and where does it go?", "Align which way?", or anywhere else "Should I… add it as a task / save it as a
note / search for it". After an edit with a missing detail he asks for just that detail ("Added “Book club”. What's the
address?") and takes your next message as the answer (a link, an email, a @handle, a phone number, or a page name);
"leave it" skips it.

## When something needs an AI

Only when the ask really needs generation (`TribeNLU.needsAI`: writing long copy, poems and jokes, pictures and logos,
code and engineering, "make it look like …", judging a design). Then one card everywhere (`app/ui/aiboost.js`): **This one
needs an AI.** **Free · no AI**: what Flint did (or "Nothing changed") and what he does for free. **With an AI**: what an
AI adds. Buttons: **Use my AI** (free: connect your own, or hand it to your connected AI helper) and **Get credits /
Premium** (`TribePremium.gate('credits')`).

## Command list (free, no AI)

Every edit can be undone ("undo", the message's Undo, or Ctrl Z). New in feat/flint-unify (`app/ui/flintnlu.js` reads
them, `app/ui/sitecfg.js` `command2`, `app/ui/canvas/flintpane.js` `MOVES` and `app/ui/flintcmds.js` do them):

**Website designer**
- Links: "add a link for my book club" (asks for the address), "add a link called Tickets to https://…", "remove the
  shop link", "move the tickets link to the top", "the shop link should go to https://…". Link-in-bio pages get a link
  item; other sites a hero button, else a footer link.
- Socials: "add my instagram @mara", "add a tiktok icon", "add soundcloud and bandcamp icons", "remove the twitter icon"
  (Instagram, TikTok, YouTube, Spotify, X, GitHub, LinkedIn, Facebook, Twitch, SoundCloud, Bandcamp, Pinterest, Threads,
  Bluesky, Mastodon, Discord, Patreon, Substack, Ko-fi, Behance, Dribbble, Snapchat, WhatsApp, Telegram, Vimeo, Apple Music).
- Buttons: "add an email me button", "add a button to call us at …", "add a button that says Book now", "remove the
  second button", "send the contact form to hi@…".
- Sections with items: "add a faq: do you ship abroad? yes", "add a pro plan for $19", "add Maya to the team as our
  designer", "add a testimonial from Sam saying …", "add a stat: 300 customers", "add a feature called Free delivery",
  "add a menu item Latte $4", "add a tour date: Leeds Jun 3", "add an episode called …", "add a photo to the gallery".
- Places and media: "add a map to 12 Main St" (a Find us section with an OpenStreetMap button), "embed my youtube video
  https://…", "add a countdown to june 5" (a dated banner; exported sites stay script-free).
- Words: "change the faq title to …", "footer should say …", "update the copyright year", "add an announcement: …",
  "change my bio to …" (plus the earlier headline, tagline and button words).
- Pages and menu: "add Shop to the menu", "move the about page first", "go to the contact page", "clear this page".
- Look: "center the text in the hero", "left align everything", "make the pricing section teal", "make this section
  navy", "rounder corners", "square corners", "set the site language to spanish", "remove the logo", "move this
  section up" (plus themes, dark mode, accent, fonts, spacing, backgrounds, layouts, hide/duplicate/move sections).

**Design canvas** (select layers first where it makes sense)
- "align these to the left / top / center", "distribute evenly", "space them vertically", "group them", "ungroup",
  "duplicate this", "lock it" / "unlock it", "hide this layer", "bring it to the front", "send it backward",
  "resize it to 320 by 200", "set the width to 250", "make it twice as big", "rename this to Header", "add a rectangle /
  circle / line / frame / card / image placeholder", "add a text that says hello", "add a button that says Sign up",
  "snap to grid", "delete this", "select all", "zoom to fit / in / out" (plus screens from templates, tidy, rename
  layers, dark and light versions, variants, wiring, send to app, export).

**Anywhere** (Flint's panel, Home, or any of the mounted chats)
- "set a timer for 10 minutes", "remind me in 5 minutes to stretch" (undo cancels it)
- "turn off animations" / "bring back animations" (this device), "mute notifications" / "turn on notifications",
  "appear away" / "I'm back", "hide where I am"
- "pin the last message", "react thumbs up to the last message", "heart the last message"
- "reopen the logo task", "unassign the logo task", "make the logo task urgent" (moves it to the top of its column)
- "start a fresh whiteboard", "new doc from the meeting notes template", "add three js from the marketplace",
  "find inspiration for a cozy cafe", "open the people panel", "any gigs for me", "run the app", "copy the preview
  link", "clear our chat"
- plus the ~170 earlier actions (tasks, notes, docs, chat and DMs, calendar, builds, themes, navigation, math…).

**Design, copy, sheets, docs and slides** (feat/flint-max, `app/ui/flintmax.js`; research and the model plan:
[FLINT-RESEARCH.md](FLINT-RESEARCH.md))
- Several steps, one Undo: "add a pricing section with three plans, make the middle one highlighted, then switch to
  dark mode"; "undo that" takes all three back. Pronouns: "make it bigger" (the selection), "do the same on the about page".
- Palettes: "warm autumn palette", "ocean colors", "palette from #2a8c80", "brutalist" (30 moods, OKLCH, a light and a
  dark variant, each checked against WCAG and fixed if it misses). "fix the contrast" measures and fixes the site's
  colors (before → after ratios).
- Type and style: "pick fonts that feel elegant", "make this more professional / elegant / friendly / brutalist /
  luxury / calm / retro / techy / modern" (palette + fonts + corners + spacing in one step). "tidy this up" (one
  spacing rhythm, one alignment, even corners).
- Copy: "give me headline ideas" and "what should the button say" (tap one to use it), "how readable is this"
  (Flesch, grade, tips), "title case the headings"; anywhere: "headline ideas for a candle shop", "title case: …".
- Canvas: "add a navbar / footer / hero / sign up form / sidebar / tab bar / dialog", "turn these into a card grid",
  "apply a sunset palette".
- Sheets (Flint's chat or the sheet's Ask box, Undo there): "sum this column", "average of the price column", "sort by
  sales, highest first", "format as currency", "add a total row", "make a chart of sales by month" (drawn under the table).
- Docs: "make a table of contents", "turn this into a checklist", "fix capitalization", "add a tldr at the top",
  "whats the reading level" (each one Undo).
- Slides: "make a 5-slide pitch from the vision doc" (or any doc, or "turn the readme into a presentation").
- Flint's page (`app/ui/flintpage.js`, ✦ menu › What can Flint do?, "what can you do", `#/flint`): Flint's levels (no
  AI, local helper, your AI, credits) with the active one marked and "Set up a local model"; "What I can do", searchable
  and grouped by editor, each with Try it (a demo on sample data, never your work) and Ask Flint; the lessons.

## Lessons

`app/ui/flintlessons.js`: a short lesson for each feature (website designer, canvas, preview, tasks, work, templates,
files, chat, huddles, agents, company, inspiration board, export, Premium). "teach me <feature>", "how do I <thing>",
"how does <feature> work" open it; **Show me** opens the real place and rings the real control; Read more goes to the
Guide or the Academy where they exist. Tests: `app/test/flint_eval_test.js` (the lesson index), `app/test/e2e_flint_lessons.py`.

## Evaluation set

`app/test/flint_eval.json` (written by `scripts/dev/flint-eval-cases.js`, run by `app/test/flint_eval_test.js`, fails
under 98%): 1,003 phrasings for websites, the canvas, preview edits, lessons and global commands, with typos, slang and
indirect wording, in five contexts (website designer, canvas, canvas with a selection, preview, anywhere). Before
feat/flint-unify: 667/674 (99.0%). Then (feat/flint-unify): 996/1,003 (99.3%), including 249 phrasings for the new commands (100%). Now (feat/flint-max): 1,189/1,196 (99.4%), including 143 tuning phrasings for the design, copy, sheet, doc and slide moves (100%).
Held-out batches: 1 scored 22/32 (68.8%) when first run and was then tuned; 2 was never tuned against: 14/16 (87.5%);
3: 27/32 (84.4%). Batch 4 (40, `scripts/dev/flint-eval/held4.js`) was written before the new commands were built, so its
phrasings shaped them: 0/40 before, 40/40 after. Batch 5 (40, `flint-eval/held5.js`) was written after the matchers existed and
scored 34/40 (85%) on its first, untuned run; its six misses were then fixed (40/40). `app/test/e2e_flint_unify.py`
runs 45 commands end to end in the designer, the canvas, the preview and the main chat.

**v0.31 features (feat/flint-cleanup, 2026-11-12).** The set is now 885 phrasings: 875/885 (98.9%).

- **Batch 4 (`scripts/dev/flint-held4.js`, 163 phrasings).** Covers task offers, Design flow kinds, people and presence, abilities and gigs, the Marketplace's Installed tab, Files by kind, the demo, plans, settings and the sidebar order. It scored 95/163 (58.3%) on its first run, before any tuning. It was then tuned against: 162/163 (99.4%).
- **Fresh held-out batch 5 (`scripts/dev/flint-held5.js`, 48 phrasings).** Written after that tuning and never tuned against: 45/48 (93.8%). This is the honest number for new wording.

What Flint now does locally:

| Ask | What happens |
| --- | --- |
| "accept the poster task" | Accepts a task offered to you (server/taskflow.js); it starts. |
| "decline the flyer task, too busy" | Hands it back to whoever assigned it, with the reason. |
| "claim the banner task", "grab an open task" | Claims an open task in Council mode. In Lead mode Flint starts it for you instead. "I'll do X" also accepts X when it was offered to you. |
| "make a poster for our gig", "design a logo for Ember Socks" | Opens the Design flow on that kind: poster, logo, screen, app, game or whiteboard. |
| "add drawing to my skills" | Opens your abilities with the skill ready to add. |
| "what have I installed", "remove the timer widget" | Opens the Marketplace's Installed tab, or removes the item. |
| "show my pictures" | Opens Files on that kind. |
| "stop showing where I am" | Hides your place from the tribe. Undo works. |
| "reset the sidebar order", "mute notifications", "start the demo", "how many credits do I have", "what is 12 times 9" | Each does what it says. |

There are new lessons for inviting, People, the Marketplace and the Design flow.

What still needs a model: open writing ("write a song about our cat", "write me a short story"), reasoning about code ("why does the build keep failing"), and judging a design.

## Abilities log

Agents: add a dated line whenever Flint learns something new. Newest first. Say which tier it runs in.

- **2026-11-12** (feat/flint-max)
  - Several steps in one message land as one Undo in the website designer; "do the same on the about page" and "make it bigger" (free · no AI).
  - Palettes from 30 moods or one color, light and dark, WCAG-checked and fixed; "fix the contrast" (free · no AI).
  - Font pairing by mood; style moves (professional, elegant, friendly, brutalist, luxury, calm, retro, techy, modern); tidy (free · no AI).
  - Headline ideas, CTA picker, readability (Flesch), Title Case, tone word lists (free · no AI).
  - Canvas recipes (navbar, footer, hero, forms, card grid, pricing, sidebar, tab bar, dialog), card grid from a selection, recolor with a palette (free · no AI).
  - Sheets: sum/average/min/max/count, sort, currency and percent, a Total row, charts (free · no AI).
  - Docs: table of contents, checklist, capitals, TL;DR, reading level (free · no AI).
  - Slides: a pitch from the vision or any doc (free · no AI).
  - Flint's page: levels, searchable abilities with Try it, lessons (free · no AI).

- **2026-11-11** (feat/flint-site)
  - Understands websites by meaning: "link tree website", "something for my band", "i sell candles online", "we got engaged, need a page" pick the right one of the 16 templates (free · no AI).
  - The website designer, on OpenPage's model: one JSON config, blocks with layout variants, theme presets with a real dark variant, inline editing, drag to reorder, undo/redo, Download HTML (one standalone file) or a zip (free · no AI).
  - Wires buttons and links to pages, sections, web addresses and email; "make the buttons work" wires every one, adding a contact form when nothing fits (free · no AI).
  - Adds, renames and deletes pages; adds, removes, moves and re-lays-out blocks; changes the theme, accent and words (free · no AI).
  - Pictures: replace from an upload or the inspiration board, round or square, alt text (free · no AI).
  - On the design canvas: "functional buttons" wires layers to screens (making the screens it needs; Send to app exports real links), "make a dark mode" recolors the layers in place, "add a page/screen", "edit this image" fills a layer with a picture, "make it round"; websites open the website designer (free · no AI).
  - Says plainly when something needs an AI, with Use my AI and Get credits / Premium (free · no AI).
  - A lesson for every feature with Show me (free · no AI).
  - Redo; "buy credits", "get premium"; "open my moodboard" (free · no AI).

- **2026-11-11** (feat/flint-runthrough)
  - Watch Flint build: a 17-step run-through that drives the real app with his normal commands, one caption per step, checked through the API (free · no AI; captions refined by AI when on).
  - Proof of work: `<project>-proof.zip` and `tribe-<name>-proof.zip` in `<tribe>/exports/` and as downloads: code, docs, design SVG + PNG, chat, tasks, timeline, manifest, README, presentation (free · no AI).
  - Starts a tribe (or renames it) and a project by name; sets the vision from one sentence (free · no AI).
  - Proposes, and approves a proposal (free · no AI).
  - Runs the daily standup from the board and posts it in chat; pings company seats when it's a company (free · no AI).
  - Changes the website's headline and saves it as a version (free · no AI).
  - Makes the product presentation: a deck in Files plus a standalone page (free · no AI).
  - Summarizes any doc, note, repo file (txt, md, html, json, csv, PDF text) or the chat with no model, extractive TextRank-lite; the chat summary no longer needs a brain (free · no AI; refined by AI when on).
  - Key points and action items (Add to Tasks), title ideas (one tap sets the title), tag ideas, reading time and outline, and an "explain like I'm new" glossary (free · no AI; refined by AI when on).
  - Blender bridge stub: writes a turntable-render Python script for you to run in your own Blender; nothing runs on its own (free · no AI). Plan in [FLINT-CREATORS.md](FLINT-CREATORS.md).

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
