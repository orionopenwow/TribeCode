# TribeCode — living context

The one document that remembers the greater vision and everything in flight. Updated at every milestone and whenever the user gives new direction. HANDOFF.md says *how* to run, test and ship; this says *what and why*.

Last updated: 2026-11-07 (v0.7.0 released from `main`: shared compute step 1, phone report; v0.6.9 host reclaim, delete projects, phone Home rack; v0.6.8: phone Home-first flow, task slates; v0.6.7 simpler rack; v0.6.6: Discord-style setup; v0.6.5 server fix + simple Home; v0.6.4: streamlined sidebar; v0.6.3: simpler navigation, living project overview; v0.6.2: phone-only friends and @ai; v0.6.1 one-tap Invite a friend; v0.6.0: Home command center, AI Insights, self-heal, the Explorer and milestone reports).

## The vision
Multiplayer vibecoding. A group of friends, each with their own Claude Code agents, build one app together, and it feels like a Discord server that ships software. One friend's computer hosts everything (no cloud bill). Friends join with one link from any phone or computer. Humans decide and agents do the work: agents propose, humans approve with one tap. Everything stays in plain Markdown/JSONL in the tribe folder and in git.

Pillars: **one link to join · one shared brain (local Qwen + TRIBE_CONTEXT.md) · one vision (VISION.md + Board votes) · agents that coordinate without stepping on each other**.

Where it's heading:
1. Polished phone app (installable PWA now, native iOS via Tauri later).
2. Chat as the control room: reactions, votes, approvals, and agent requests all happen in the chat stream.
3. Game Studio (docs/GAME-STUDIO.md): friends build small games together, starting with Pixel Quest.
4. Real-device reliability: push, speech, tunnels and huddles on cellular (TURN).

## Future pillar: the Tribe Brain (recipes, tools, shared compute)
The user's idea (2026-11-06): a self-learning brain that remembers the scripts behind facets of features and replays them instead of spending tokens again. Over time that becomes a TribeCode database of reusable features. It also scouts GitHub for tools that help projects like this, and friends contribute compute.

Sketch (not started; the gists and plan work now lays the groundwork):
1. **Recipes.** When an agent finishes a facet (e.g. "add a double-jump to a 2D platformer", "web push setup", "level select screen"), it saves a recipe: intent, inputs, the script/diff template, the files it touches, and a check that proves it worked (a test or screenshot). Stored as Markdown + code in `recipes/`, shared across the tribe's projects and versioned in git.
2. **Replay first, tokens second.** Before an agent builds something, the local brain (Qwen) searches the recipes. On a match it applies the template and runs the check; Claude only fills the gaps. Recipes that pass get reused more, and ones that fail decay. That's the "self-learning" part, kept honest by the checks.
3. **Tool scout.** On a schedule, search GitHub for libraries and tools for the tribe's stack (game engines, asset pipelines, deploy and upload helpers). It posts them as upgrade gists that humans approve. It never auto-installs (supply-chain risk). It checks license, activity and stars, and pins versions.
4. **Shared compute.** Friends opt in to lend their machine as a worker for builds, asset compiling, test runs, analysis, bug repro and local-model jobs. A job queue on the host hands out work, results come back with hashes and are cross-checked. Jobs run sandboxed and only from the tribe's own repo. Workers show up in the person view.
5. **Later.** An opt-in public recipe exchange between tribes (the "database for TribeCode").

## How we work (decided 2026-11-06, refreshed 20:45)
- **Test from source, not the exe.** The user tests new work with Desktop\TribeCode\Working\Start-Working.bat (dev, :4848, opens in an app window, pulls every 20 s, live reload, own test tribe). The exe is only for release checks. Reset-Old-TribeCode.bat cleans out old installs, settings and the old v0.1 code copy.
- **One release updates everything together:** merging dev → main with a version bump publishes the GitHub release (desktop installers + Restart to update) and redeploys the website and demo (Pages) from the same commit.
- **No shell on the user's PC** (the device command workspace doesn't start, and screen control was declined): changes on the PC are delivered as files the user double-clicks.
- **Two lanes.** `main` = stable/released. `dev` = working lane where new work lands first.
  - Desktop\TribeCode\Stable\Start-Stable.bat runs `main` at :4747 with the real tribe.
  - Desktop\TribeCode\Working\Start-Working.bat runs `dev` at :4848 with live reload and its own test tribe (no exe compile needed to test UI).
- **No pull requests, autopilot milestones** (user, 2026-11-06): agents' feature branches stay local in the sandbox (worktrees). Only `dev` and `main` get pushed, so GitHub never shows "Compare & pull request". At every milestone, dev is merged into main with a version bump, which releases automatically.
- **Shipping.** Feature branches → `dev` (user tests in Working) → merge to `main` + version bump → CI release → in-app "Restart to update".
- **Parallel agents, no interference.** Big work is split across agents in separate git worktrees, each owning an explicit set of files. Every branch is pushed to GitHub (branches were lost once because they weren't).
- Commits end with the Co-Authored-By and Claude-Session trailers.
- **Every milestone:** `npm run readme-shots`, refresh README.md and the Pages site (`site/`, served at `/about/`), then release (user, 2026-11-06: "keep the readme updated with features and screenshots and the pages updated with the current state of app flow").

## Design rules (user's, keep)
Restraint: numbers only where they answer a question; few sidebar rows (4 pillars), depth lives in tabs and the right panel, not in long lists; color carries meaning (role colors on people, folders, gists, plan items).
Flat matte, 1px borders, depth from luminance only, no glows/blur/gradients. Ember #F26B1D, Teal #38C6B1, Indigo #6C7CFF, canvas #12151A, surface #1B2028, raised #1E242D, border #2A313C, approve #3BD16F, deny #FF6F8E. Section clarity (mono eyebrow + clear title, one hero card per screen, reading layout). Phone: Discord-mobile flow, no header outside Chat, bottom rack, top bar in Chat. Simplicity first: zero-step setup, no repeated labels.

## State (v0.6.0 on `main`)
Released: everything in CHANGELOG.md through v0.6.0. Every milestone now runs `npm run explore` (fix criticals), `npm run milestone-report` (before/after against the last release, docs/milestones/), `npm run readme-shots`, then the release.
| Area | Status |
|---|---|
| Home (command center), rail + window, 4-pillar sidebar | ✅ shipped |
| Explorer + self-heal + AI Insights + milestone reports | ✅ shipped (docs/EXPLORER.md, docs/EXPLORE-REPORT.md) |
| Nightly self-upgrade scheduled task | prompt ready in docs/NIGHTLY-UPGRADE.md; creating it was blocked from this session, the user can create it |
| `feat/docs-start` (create-repo card, people/<member>/ folders, notes catalog) | parked locally, unmerged |
| Security follow-ups: Tauri CSP (H5), tokens in URLs (M2), WS Origin + CORS (M3), JSONL caps (M4), Host allowlist (M5) | to do |
| Open from the Explorer: low-contrast online green in the light theme, white on Ember buttons (3.05:1, design call), empty states without an action, two phone layout shifts | to do |

## User requests log (newest first)
- 2026-11-07 09:46–09:55: Phone Home rack (shows on scroll up, hides on scroll down, + to start/join) ✅ v0.6.9; plan for starting tribes on phones and sharing hosting ✅ docs/MOBILE-TRIBES.md; Create showed 'server already running with other members' ✅ host reclaim v0.6.9; smoke-test create/delete/project management live ✅ e2e_smoke_live + delete projects v0.6.9; remove Share/Invite from the Home panel ✅; logo goes Home ✅; test every phone feature with saved data, report, suggest, polish ✅ e2e_phone_features + docs/PHONE-REPORT.md v0.7.0; shared compute tucked into Helpers ✅ step 1 v0.7.0 (docs/SHARED-COMPUTE.md).
- 2026-11-07 09:31–09:32: Phone: fire logo top left opens the projects panel; no search/docs top right; Home header + no bottom rack until in a project; Settings only where relevant; tasks as horizontal slates. ✅ v0.6.8
- 2026-11-07 09:26: Remove the + and the profile picture from the phone's bottom rack. ✅ v0.6.7 (profile in the top bar, New task / New doc on their screens)
- 2026-11-07 09:13–09:17: Simplify Home like the 'Getting started hub' mock ✅ v0.6.5. Desktop server didn't start (CRLF shebang in the bundle) ✅ fixed v0.6.5. Discord-like setup flow ✅ v0.6.6. Keep mobile up to date with each version (standing rule).
- 2026-11-07 08:58: Redundant navigation: delete the sidebar header card, Overview row with correct active state, pinned items as plain rows, hosting status to the rail bottom. ✅ v0.6.4
- 2026-11-07 08:36–08:49: Remove the sidebar dropdown; logo = Home (my overview), bubbles = projects each with its own overview; no 'My Tribe' in Home; no project list on Home; window buttons back; per-project bio, picture, vision nudge and a short living update (lately, chat, way forward, calendar). ✅ v0.6.3
- 2026-11-07 08:22: Finalize the phone flow for a fresh project for a friend with no TribeCode at home and no Claude Code subscription; connect LLMs and agents for them. ✅ v0.6.2: phone "You're in" card (Ask AI, Voice note, Add an idea, roles), @ai routed own Claude → teammate's Claude (owner policy ask/always/never) → local model → board queue (server/askai.js), Talk to… and + menu lead with Ask AI.
- 2026-11-07: "As few steps as possible: an instant invite link for friends to a fresh project, connecting everything through this link." ✅ v0.6.1: one tap (Home, rail +, banner, Invite-A-Friend.bat / tribecode://invite) → fresh project + public link copied; friend taps → name → in the project → (computer) the Claude Code command opens ready to copy.
- 2026-11-07: Home redesign to the user's "AI Command Center" reference: a hero with suggestions, an Ask box (your Claude or the local brain) and Join; a Get started card; scratchpad with "Refine with AI"; recent activity; a right panel with share and invite links and AI Insights. Translated into the flat design rules (the mock uses gradients). (feat/home2)
- 2026-11-07: "Invent a way to click around yourself": an explorer bot (crawls every view and button on desktop, phone and a simulated desktop app; finds errors, dead buttons, overflow, contrast and click-heavy journeys; writes a report and suggestions), app self-heal (boot watchdog, cache clear, error card, version mismatch), an insights feed. (feat/explorer)
- 2026-11-06 23:56: A separate personal Home when no tribe is selected; the app starts at Home. ✅ The rail + opens Start a new tribe (top) / Paste invite link (bottom). ✅
- 2026-11-06 23:02: Sidebar down to 4 pillars: Chat & Streams, Docs & Files, Tasks & Board (tabs: Board, Bugs, Proposals, Milestones, Calendar, Repo, Visuals), Agents Hub (tabs: Agents, Your agents, Ownership, Conflicts & hand-offs, Reviews, Daily plan, Secretary), with Settings and Invite at the bottom. Updates → the bell, Huddle → the chat call button, Capture → the profile menu. The right panel becomes contextual (agent detail). (Part of feat/hub.)
- 2026-11-06: Brighter dark theme: text and icons white rather than grey. ✅ Header: an X on the right panel instead of a header toggle, profile in the rightmost slot, no docs icon. (feat/hub)
- 2026-11-06: Global Hub as the home screen when no project or tribe is selected: global stream, quick-launch grid (new project, resume last session, search), an agents & models status bar. A contextual sidebar (a Global group with All repos, Global docs, Agent fleet), a workspace switcher with pins, agents present in the room, a global scratchpad, and the update pill moved into a subtle icon. (feat/hub, building)
- 2026-11-06: The desktop app showed a half-old UI after updates. Cause: the phones-only service worker cached pages inside the desktop app. Fixed in v0.4.1. ✅ README + website kept current every milestone (docs/site-refresh, building).
- 2026-11-06: Analyze the whole program and fix bugs and user flows; a one-click project with an instant link for a friend; smoke-test everything end to end (chat storage, persistence, files, integrations); 50 features tightened into quick wins / next / later, with the quick wins done. (feat/audit) Update the demo (feat/demo5). Update my folders (✅ Working\New-Project-For-A-Friend.bat). Preview the app in the browser (feat/preview). The revised sidebar layout (feat/nav2).
- 2026-11-06: Composer "+" (back from the paperclip) holds: photo/file, Propose to the tribe (a vote that goes to the Board when approved), quick poll, task, ask my Claude, reminder, note, bug. ✅
- 2026-11-06: With no project selected, the main screen is a dashboard: updates across projects, your own notes, suggestions, refreshed on a rolling basis. (feat/dashboard)
- 2026-11-06: The rail "+" offers Create project (top) or Paste invite link (bottom), then a minimal start flow: GitHub repo if wanted → notes with context → add your agent → done. (part of feat/docs-start)
- 2026-11-06: Top right: drop the connected pill; order panel, Context, profile, bell; a profile button with relevant options. ✅
- 2026-11-06: Navigation cleanup into 4 tiers: core (Home, Chat, Docs, Updates, Huddle) + Workspace / Engineering & Ops / Coordination Hub groups; no duplicate New/Search; Settings, Pop out board and Capture to notes in a gear menu. (feat/nav)
- 2026-11-06: Docs: "Create a repo?" hero with auto-commit, autopilot and a folder per person; under it, "Begin typing notes", where local models clean entries up into the living note network. (feat/docs-start)
- 2026-11-06: Chat looks like Telegram (bubbles, grouping, reply quotes, reactions, voice bubbles, date pills), with Instagram-DM alignment on desktop, in our palette. (feat/chat-bubbles)
- 2026-11-06: Real red/yellow/green window buttons at the top right, with bigger, rearranged icons. ✅
- 2026-11-06: The GitHub repo, demo and desktop app should all update together.
- 2026-11-06: The desktop app showed the old UI after updating. Cause: a leftover server on Windows blocked the installer. Fixed in v0.3.3. ✅
- 2026-11-06: Solo mode: connect Claude Desktop, other desktop agents and local models in an organized visual UI. The same autopilot to GitHub and per-person folders. Agents distill changes and upgrade everything. A background secretary that thinks, researches, collects notes and dreams up realizations from everything typed, voice notes and files.
- 2026-11-06: A Workshop: a community directory separate from projects, holding Claude Code skills, projects, templates and assets (game scripts, animations, GLBs). Everyone's discoveries are donated to an open-source CDN.
- 2026-11-06: Easy in and out for connecting Claude Code from a remote session at home. ✅ (v0.3.2: Anywhere / Same Wi-Fi / This computer, status, Disconnect)
- 2026-11-06: The pinned repo hero shows the README's image or an auto screenshot. "Flare": hero areas carry real imagery (added to the design philosophy).
- 2026-11-06 (future): a self-learning brain that remembers and replays feature scripts instead of spending tokens; a TribeCode feature database; scheduled GitHub tool scouting; friends contributing compute for compiling, analysis, notes and bug fixes. See "Future pillar".
- 2026-11-06: Roles area you can navigate, named roles, named folders with a clear identity, color-coded concepts. Click a person → their commits, prompts, chats and notes in context, their position and context window. Not numbers everywhere, don't overwhelm, keep it sleek. Uptime counter, commit counter.
- 2026-11-06: Security review. One-click Create project → hosting room → invite link → chat opens → repo created and pushed to GitHub → humans delegate roles, dump notes and files → flow begins → agents give gists (progress, upgrades, plans), not monolith code dumps → self-evolving plan and assessments.
- 2026-11-06: Keep the GitHub → main → Restart-to-update loop working end to end. Keep this living context doc.
- 2026-11-06: Stable and Working folders on the Desktop to test UI without compiling an exe. ✅
- 2026-11-06: Always send agents to work on separate parts without interference. ✅ (process)
- 2026-11-06: Emoji reactions on chat bubbles; votes Claude can suggest ("team should vote to approve a feature"); related quality-of-life features.
- Earlier: everything in CHANGELOG.md v0.2.0–v0.3.1.

## Next up
- The feature roadmap lives in docs/FEATURES-NEXT.md (now with Part 3 from the Explorer). Storage, backups and persistence are in docs/DATA.md.
1. The user updates the desktop app to v0.6.0 (Restart to update or TribeCode.bat) and tries Home.
2. Set up the nightly self-upgrade task from docs/NIGHTLY-UPGRADE.md.
3. Walk through the Pixel Quest test project with a real friend's phone; real-device checks (iPhone Safari join + Home Screen, Web Push, speech, Messenger banner, Tailscale Funnel).
4. Security follow-ups (H5, M2–M5). Game Studio MVP. Then native iOS (needs a Mac), Intel Mac builds, a TURN relay.

## Decisions
- 2026-11-07: Open Space is integrated as an optional host-only tool (cloned at a pinned commit, `npm ci --ignore-scripts`, port 4850, opened in the host's browser because it refuses framing). Bump `REF` in server/openspace.js only after reading upstream changes.
- 2026-11-07: The 3D demo is an original tavern (no WotLK content); only Leyline's bot design ideas (labelled bots, roles, orders, data in JSON) were reused.
- 2026-11-07: Every version keeps the phone in step (user's rule): each change also lands in the phone layout, checked at 390px, and the CHANGELOG has a phone line.
- 2026-11-07: Home's AI Insights show your own next steps first and the host's insights (Explorer, health, Secretary) after, deduplicated, at most 8.
- 2026-11-06: The security review found host RCE reachable by any builder. Fixes were shipped as v0.3.2 straight from `main` ahead of the features, with `app/test/security_test.py` as the regression test.
- 2026-11-06: The Workshop's community index is a public GitHub repo served through jsDelivr (a free open-source CDN). Items need an open license and sha256 checks, and are never executed.
- 2026-11-06: Automated browsers skip the GitHub update check (`navigator.webdriver`), so sandbox proxies don't break tests.
- 2026-11-06: `dev` branch introduced as the working lane.
