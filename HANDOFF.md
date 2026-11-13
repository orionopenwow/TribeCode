# TribeCode handoff

Read this to pick up the work in a new session (a new Claude chat, Claude Code, or a person). It is kept current at every milestone, alongside `docs/CONTEXT.md` (mirrored to the project doc "TribeCode-Context": vision, user requests, what's in flight).

Last updated: 2026-11-12, v0.31.2. The living vision and request log are in docs/CONTEXT.md (also the project doc claude/TribeCode-Context.md); update both at every release. Every doc and its status: docs/DOCS-INDEX.md.

## What TribeCode is
A self-hosted "multiplayer vibecoding" app. Friends, each with their own Claude Code agents, build one app together. The work lives in the tribe's shared GitHub repo; someone's desktop app or own server keeps it online for speed. The server and web app have zero npm dependencies (plain Node and browser JS), and a Tauri v2 desktop wrapper bundles the server as a sidecar. GitHub holds the code, the releases and a website (Pages).

- Repo: https://github.com/orionopenwow/TribeCode. MIT. `main` = stable/released, `dev` = working lane (feature branches merge into `dev` first; the user tests it with Desktop\TribeCode\Working\Start-Working.bat at :4848, then it's merged to `main` and released).
- Releases: one is published automatically when the version in `app/src-tauri/tauri.conf.json` changes on main. That builds Windows, Apple Silicon Mac and Linux installers plus signed `latest.json`, and the in-app updater picks it up. Bump it in 4 files: `package.json`, `app/package.json`, `app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml`. Add an entry to `CHANGELOG.md`.
- Website: https://tribecode.org (GitHub Pages, custom domain). The marketing site is `site/`; the web app is served at `/app/` from `app/ui`. Friend links: `go.html#s=<host>&c=<code>`. Demo: `/app/?demo=showcase` (also Ctrl K › Start demo and the ? menu). Public pages: `/app/privacy.html`, `/app/terms.html`, `/app/support.html`.

## Run, test, ship
```
npm start                      # server on :4747, tribe folder ~/TribeCode
npm run live                   # auto-pull + restart + UI live reload (TribeCode-Live-Test.bat on Windows)
npm run invite                 # one-click public invite + QR (TribeCode-Invite-Friend.bat)
node scripts/start-test-project.js   # Pixel Quest test project + project invite + Claude Code command
npm test                       # ~170 suites (Python Playwright with /usr/bin/google-chrome, --no-proxy-server, plus node unit tests)
npm run explore                # click-around smoke + intuitive + core-intent journeys → docs/EXPLORE-REPORT.md (--quick is in npm test)
npm run milestone-report       # previous release vs this checkout → docs/milestones/<version>.md
npm run readme-shots           # docs/screenshots/readme-*.png + site/assets/shots/*.webp from a seeded throwaway tribe
node scripts/dev/release.js X.Y.Z --skip-tests   # checks the CHANGELOG entry (needs a **Phones** line), bumps the 4 version files + sw.js CACHE
node app/test/flint_nlu_test.js   # Flint's no-AI understanding (cases in app/test/flint_nlu_cases.json; flint_eval.json is the 390-phrase eval)
node scripts/dev/design-tokens.js # regenerate docs/design-tokens.json after changing a token
```

Every milestone: `npm run explore`, fix criticals, then readme-shots and release. In full: `npm run explore` (docs/EXPLORE-REPORT.md, docs/EXPLORER.md), fix the critical findings, `npm run milestone-report` (docs/milestones/<version>.md: before | after screens, findings delta, journeys), then `npm run readme-shots`, refresh README.md and the Pages site (`site/`, published at `/about/`), then release.

How to write tests:
- Host pages use `/?skipIntro=1`.
- Phones that join via an invite land on `/m/<key>/` with `#install-sheet`; click `#ins-later`.
- Use the helpers `named(page, name)` and `chat(page)`.
- Use `TRIBE_PORT_OFFSET` to run tests in parallel (offsets 40+ apart, at most two at once; re-run a failure alone before treating it as real).
- `TRIBE_NO_DOWNLOAD=1` (set by `npm test`) stops tests from downloading cloudflared.

Branches: push `dev` and `main` (no pull requests; the user's rule). Agents work in local worktrees on `fork/*` branches; a branch is pushed only to survive a sandbox restart. After a push to main, merge main into `dev` and `next/v0.27` so the Working lane follows. A release needs the user's explicit "release".

Pushing from the Claude cloud sandbox:
- If push returns 403, attach the repo with push access (add_repo, access: push) first.
- `git push` prints "This repository moved…" but works. Check it with `git ls-remote origin main`.
- Tag pushes and GitHub API writes are blocked from the sandbox. Releases don't need tags anymore.
- `gh api` reads work. `gh release download` does not (GraphQL); use `gh api -H "Accept: application/octet-stream" repos/.../releases/assets/<id>` instead.
- Commits end with the Co-Authored-By and Claude-Session trailers.

## Map of the code
- `server/index.js` wires everything. Other modules:
  - `projects.js` + `rooms.js` + `workspace.js`: per-project data, folders/repos, branches.
  - `coord.js` + `agentnet.js`: agents panel, ownership, conflicts, hand-offs, reviews, daily plan, the #agents channel, delegation.
  - `notify.js` + `approvals.js` + `webpush.js`: inbox, phone push, one-tap approvals.
  - `chatx.js` + `dm.js` + `voice.js`: chat actions, DMs, voice, captions, meeting notes.
  - `docs.js` + `docsx.js` + `live.js` + `ot.js`: docs and live co-editing.
  - `plan.js`: calendar (repeat weekly / weekdays / daily; `ritual` events call `rituals.js`).
  - `rituals.js`: standup / weekly review / retro rituals that collect answers in chat and write the doc.
  - `talent.js`: Work (gigs, matching, assign, progress, review, credit, time bank, compute).
  - `visuals.js`: screenshots.
  - `repo.js` + `context.js` + `integrator.js`: live repo, TRIBE_CONTEXT.md, gated merges.
  - `board.js`: proposals and milestones.
  - `taskflow.js`: how work is shared on the Task Board: Lead assigns (assign → Accept / Decline with a reason) or Council (Open to claim, Claim, a claim limit); `/api/tasks/settings`, `/api/tasks/<id>/accept|decline|claim`, MCP `accept_task`, `decline_task`, `claim_task`. Test: `app/test/e2e_tasks_accept.py`.
  - `bugs.js`, `brain.js` (Ollama/Qwen), `mcp.js` (Claude Code tools).
  - `aibasics.js` + `app/ui/aibasics-core.js`: the ✦ "basic features, supercharged by AI" (rules first, `POST /api/ai/refine` when an AI is on; docs/DESIGN-SYSTEM.md §11, docs/GROK-SCOPE.md).
  - `flintrun.js` + `app/ui/flintrun.js`: Watch Flint build (a scripted run-through with his normal commands) and the proof-of-work ZIPs in `<tribe>/exports/`; the Blender bridge stub (docs/FLINT-CREATORS.md). `app/ui/localdoc.js`: local summarize, key points, titles, tags, reading time, glossary (no model). Dev: `scripts/dev/clean-slate.js` (docs/DEV-TOOLS.md).
  - `inspo.js` + `imgcolors.js`: inspiration boards (per project and per person), Openverse/Wikimedia search, a thumbnail/sound cache in `.tribe/inspo/cache`, server-side palettes.
  - `askai.js`: `@ai` for people without their own Claude (own Claude → a teammate's Claude by owner policy → local model → board).
  - `openspace.js`: optional Open Space office (host-only install/start/stop/open, port 4850).
  - `showcase.js`: per-project website (`site/index.html`), preview, suggestions.
  - `siteflint.js` + `app/ui/siteedit-core.js` + `app/ui/siteshelf.js`: Flint edits the website in the preview with no AI (undo, a version per change) and the Saved shelf (docs/WEBSITE.md).
  - `sitedesign.js` + `app/ui/sitecfg.js` + `app/ui/sitedesigner.js`: the website designer on OpenPage's model (one JSON config, blocks with variants, themes with a dark variant, wiring, export; NOTICE credits OpenPage). `app/ui/aiboost.js`: the one "this needs an AI" card. `app/ui/flintlessons.js`: Flint's lessons with Show me (docs/WEBSITE.md › The website designer, docs/FLINT-TIERS.md).
  - `applink.js` + `export.js` + `github-auth.js`: Home Screen/desktop app links, Desktop folder export/copy, GitHub device-flow sign-in.
  - `demo.js` + `scripts/start-demo-tribe.js`: the demo tribe (templates/lantern-run, templates/tavern-3d).
  - `app/ui/demowatch.js`: "See how TribeCode works", the hands-off ~2-minute tour with Flint: one short chapter per feature (Home, a project, chat, tasks with accept and council claim, docs, Files, canvas, website designer, preview pin, Work and approvals, Claude as a teammate, Company, inspiration board, a pretend huddle, Flint's lesson and the AI-boost card, Your turn), chapter dots to jump (`app/?demo=watch`, the site's hero link, Help, the empty Home's Tour with Flint, Welcome's Just watch it). Every demo (offline.js) lives in its tab only and never touches the saved settings. Tests: e2e_demo_watch, e2e_demo_actions, e2e_demo_isolation.
  - `places.js` + `app/ui/presence.js` + `app/ui/peoplepanel.js`: where everyone is. Small `place` websocket frames on route change (doc, website designer, channel, task, preview, canvas; a DM is only "in messages"), filtered per viewer, Show where I am / Appear away, last seen; avatars on places and list rows; the People button in the top bar (This tribe · Friends, Jump to; Friends has star, invite link and the one-time guest pass: the old friends.js button is retired). `GET /api/places`, `PUT /api/places/prefs`. Test: `app/test/e2e_presence.py`.
  - Flint, the built-in helper (docs/FLINT-TIERS.md): `flint.js` (routing; providers via `llm.js`), `flintfree.js` (free builds from recipes and templates, picker edits, the tiers map `GET /api/flint/tiers`), `flintmem.js` (memory, skills, taught phrases `/api/flint/learned`), `flintkb.js` (answers "how do I…" from docs/guide and docs). Client: `app/ui/flintnlu.js` (the no-AI understanding engine, shared with the server), `flintlocal.js` (runs first: actions, multi-step, clarifying questions, undo), `flintguide.js` + `flinttour.js` (the guided tour), `flintfly.js` (the small flier that flies to what he edits), `previewflint.js` (Flint's pane beside the preview: Properties, Plan first, notes, History).
  - Design canvas (docs/EDITOR-PARITY.md): `canvas.js` (files in `.tribe/canvas/`, live ops), `canvascode.js` (frame → HTML/CSS in the repo between markers, `POST /api/canvascode/send`), `canvasai.js` (MCP canvas tools, Flint's canvas moves), `canvaschat.js` (the per-design Flint conversation). Client: `app/ui/canvas/` (`scene.js` model and export, `canvas.js` editor and focused workspace, `layers.js`, `props.js`, `code.js` Inspect and export, `extras.js` presets, align, selection colors, `flint.js` + `flintpane.js` the Simple/Advanced Flint pane).
  - `pins.js` + `app/ui/pins.js`: comment pins on the preview and on canvas layers (threads, @mentions to the Inbox, follow a friend; MCP `list_pins`, `add_pin_reply`, `resolve_pin`).
  - `preview.js` + `app/ui/preview.js`: the live preview, the focused full-window workspace (Back to app, quick jumps, Esc order), and the picker helper injected into pages.
  - `sitelib.js` + `app/ui/sitelib.js`: website templates (`templates/sites/`, Easy / Comfortable / Pro; docs/SITE-TEMPLATES.md). `sitegen.js` is the older page generator; its client, the site builder, was removed in v0.31 (docs/UI-CLEANUP.md).
  - `buildkit.js`: checked open-source stacks per project kind (`templates/buildkit.json`, docs/BUILD-KIT.md). `trending.js` + `trendcheck.js`: the Trending on GitHub feed (`templates/trending.json`, refreshed daily by a scheduled task; docs/TRENDING.md).
  - `publish.js`, `jam.js`, `studios.js`: play links with a security check, Jam mode, the creative-studio shelf.
  - `soloimport.js` + `app/ui/phonehost.js`: a tribe that lives on a phone, and moving it to a host (docs/PHONE-HOSTING.md). `cloudsave.js`: cloud save snapshots (never secrets or other members' DMs).
  - `share.js`: public https via Tailscale Funnel or cloudflared.
  - `site.js`: GitHub Pages friend links.
  - `devices.js`: phone device links.
- `app/ui`:
  - `shell.js`: project circles, the calm sidebar, breadcrumbs, the right panel.
  - `router.js`: the one router (global dashboard vs a project, Back/Forward via history, no dead ends, one pane on screen). Route table: docs/NAVIGATION.md.
  - `accounts.js`: Log in / Log out / Continue as guest, the account switcher and TEST accounts (docs/ACCOUNTS.md). Server scaffold: `server/accounts.js` (off unless `TRIBE_ACCOUNTS=1`); clean-up: `scripts/dev/clean-accounts.js`.
  - `signup.js`: the sign-up sheet (guest, account, providers), Save your work nudges, Forgot password (docs/ACCOUNTS.md › Sign up). Test: `app/test/e2e_signup.py`.
  - `app.js`: core views; `hostHere` auto-hosts on desktop.
  - `settings.js`: zero-step setup and the Settings page. `personalize.js`: Make it yours (name, icon, theme, language, text size) on first open and in Settings › Personalize.
  - `hub.js`: Home, your dashboard: the empty-state hero on a fresh open, and Files, Design, Code, Work across tribes.
  - `tasks.js`: the Task Board as a dashboard (counters that filter, rows with one next-step button, List | Board).
  - `premium.js` + `plans.js`: soft Premium gates and the plans pop-out (prices hidden until paid plans exist; docs/PREMIUM.md).
  - `motion.js` + `motion.css`: shared motion tokens; `docs/design-tokens.json` is the machine-readable design system.
  - `setuplocal.js` + `localfiles.js`: instant setup on this device with the home chosen last (GitHub repo, this computer, free cloud, phone), and Files with no tribe (docs/LIGHT-HOSTING.md); local docs, sheets, slides, whiteboards, designs, websites and code files.
  - `designflow.js` + `designflow-data.js` + `starterkit.js`: Design is a creation flow (what are you making → a template gallery with an optional prompt → the design opens with a Plan card that ticks off and becomes tasks); plans in `.tribe/design-plans` (`server/designplans.js`). App and game starters in `app/ui/starters/` (docs/STARTERS.md); Flint builds them free (`server/flintfree.js`). Tests: `e2e_design_flow.py`, `starters_test.js`.
  - `filesview.js`: the one Files dashboard (Home's and each project's): + Create (the Studio), tabs with stroke icons, Where (Mine · Everything · each tribe), sections by source, previews, ⋯ menu. Home also has Design, Code and Work-across-tribes pages (hub.js). The Marketplace (`market.js`, a full page at `#/market` or `TribeMarket.mount(el)`; server/market.js) lists `templates/marketplace.json`, checked by `node scripts/dev/market-catalog.js --fetch` (repos over git: license, author, last update, README thumbnails in `app/ui/market-thumbs/`, MCP configs; drops in `templates/market-dropped.json`). Add/Remove per kind with an undo record (`.tribe/market/installed.json`); with no tribe it saves the setup as a doc in Files on this device (`market-catalog.json`). Test: `e2e_market_v2.py`. Tests: `e2e_files_rehaul.py`, `e2e_home_parity.py`.
  - `talent.js` + `workloop.js` + `workcore.js`: Work and its loop and suggestions; `doctpl.js` + `doctpl-data.js`: company templates (Guided / Advanced / ✦); `premium.js`: calm Premium gates (docs/PREMIUM.md).
  - `aiconsent.js`: asks once (per device and provider) before data first goes to a cloud AI; Settings › Privacy & safety revokes. `aibasics.js ask()` is the one ✦ AI path (tribe AI, then the in-browser model, then basic).
  - Public pages: `support.html`, `delete-account.html` (`support-contact.js` holds the one support address), `privacy.html`, `terms.html`.
  - One JS/CSS pair per feature.
- `app/src-tauri`:
  - `main.rs`: sidecar `host_start`/`host_log`; reuses a server already on the port.
  - `tauri.conf.json`: frameless, resizable window, `deep-link tribecode://`, updater.
- `templates/`: starters (starter-game, starter-site, starter-3d, starter-video, tavern-3d, lantern-run), `sites/` (website templates), `canvas/` (screen templates), `recipes/`, `buildkit.json`, `marketplace.json`, `trending.json`, `legal/`.
- `site/`: the public website (tribecode.org). `promo/`: ads, not published.
- `docs/`: see docs/DOCS-INDEX.md.

## Design rules (decided by the user, keep them)
- Flat matte "Tactile Matte Developer UI + Editorial Flat Vector": 1px borders, depth only from luminance steps, no glows, blur or gradients.
- Colors: Ember #F26B1D (primary), Teal #38C6B1 (live and agents), Indigo #6C7CFF (peers), canvas #12151A, surface #1B2028, raised #1E242D, border #2A313C. Approve/Deny buttons may use green #3BD16F and rose #FF6F8E.
- Section clarity:
  - Each section has a mono eyebrow and a clear title, with generous spacing on desktop and tight spacing on phones.
  - One hero card per screen.
  - Reading layout for long text (line-height 1.6, ~65 characters per line).
  - The pinned repo is the hero of Docs, with the living notes journal under it.
- Desktop: Discord-style project circles, a calm Claude-app-style sidebar (New, Search, sections, More, Pinned, Recents), and a right panel that becomes a preview. The window is frameless with mac-style traffic lights, a 64px logo and a 40px search.
- Phone:
  - Discord-mobile flow: swipe from the left for the circles and the section list.
  - Outside Chat: no header, and a bottom rack (Home · Chat · Docs · Updates · Tasks).
  - In Chat, the icons sit in a compact top bar.
- Simplicity first: zero-step setup (no wizard), sleek and bare UI, no repeated labels.

## State right now
- **v0.31.2** is on `main` and released (2026-11-12): installers for Windows x64, Apple Silicon and Linux plus a signed `latest.json`; the in-app updater works. Recent releases: v0.31.1 tour step mode; v0.31.0 the Design creation flow, website designer v2, People and presence, Company v2 and gigs, Marketplace v2, the blank-slate desktop demo; v0.30 Flint's understanding and the OpenPage-style designer; v0.28 the design canvas, focused Preview and Design, Flint's local brain, comment pins, phone tribes, Make it yours. See CHANGELOG.md.
- After v0.31.2 on main: planned prices are hidden on the site and in the plans pop-out until paid plans exist (no prices in the repo).
- Launch checklist: docs/LAUNCH.md. Owner's one-pager: docs/ONE-PAGER.md. Truth test: `python3 app/test/e2e_truth.py` → docs/TRUTH-TEST.md. Journey QA: docs/LOOPS-REPORT.md (once `fix/close-loops` is merged).
- Windows desktop: the page is http://tauri.localhost; the client must use the saved server (:4747). The server answers Private Network Access preflights. The server only runs with a tribe and Host on; a fresh open creates nothing.
- Scheduled: "TribeCode daily trending repos" (5:17 Phoenix) updates templates/trending.json on main.
- The user's machine: Windows, `C:\Users\campw\Desktop\TribeCode` (TribeCode.bat reinstaller, Invite-A-Friend.bat, Start-Demo-Tribe.bat, Working\ dev lane on :4848 following `dev`, Stable\, Tools\, Ads\, Private\). Tailscale signed in.

## Next steps (in order)
1. Owner tasks (only the user can do these; see the doc "TribeCode: your critical to-dos"): back up the updater key (`~/.tauri/*.key` and its password); verify tribecode.org on GitHub (TXT record) and turn on Enforce HTTPS; review the privacy and terms pages; turn on Tailscale Funnel once; register OAuth apps per host; Windows signing (SignPath Foundation or Azure Artifact Signing) and an Apple Developer account for Mac notarization.
2. Real devices: iPhone Safari join, Home Screen and Web Push, speech, Android, Tailscale Funnel, huddles on cellular (needs a TURN relay).
3. Render and tunnels: push keys must survive a sleep (VAPID from env) and live updates must fall back when SSE fails over a quick tunnel (in progress on `fix/close-loops`).
4. Editor parity Phase 2 (docs/EDITOR-PARITY.md): project light/dark tokens, prototypes, responsive rules, version history. Open polish items: docs/POLISH-AUDIT.md.
5. Payments only once the backend exists (docs/PREMIUM.md, `TODO(payments)`); the accounts backend stays behind `TRIBE_ACCOUNTS=1` (docs/ACCOUNTS.md).
6. Decide with the user: disable WebView2's Local Network Access check in the app window.

## Known issues
- The Tauri side can only be compiled in CI. Check the Release workflow logs after changing Rust.
- Tests run in parallel can time out under load; re-run failures alone before treating them as real.
- Real-device features (push, speech, tunnels) are verified only with emulators and mocks.
