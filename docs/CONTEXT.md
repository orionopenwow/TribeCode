# TribeCode — living context

The one document that remembers the greater vision and everything in flight. Updated at every milestone and whenever the user gives new direction. HANDOFF.md says *how* to run, test and ship; this says *what and why*.

Last updated: 2026-11-06 (v0.3.2 security release shipped from `main`; features build up on `dev` toward v0.4.0).

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

## Design rules (user's, keep)
Restraint: numbers only where they answer a question; color carries meaning (role colors on people, folders, gists, plan items).
Flat matte, 1px borders, depth from luminance only, no glows/blur/gradients. Ember #F26B1D, Teal #38C6B1, Indigo #6C7CFF, canvas #12151A, surface #1B2028, raised #1E242D, border #2A313C, approve #3BD16F, deny #FF6F8E. Section clarity (mono eyebrow + clear title, one hero card per screen, reading layout). Phone: Discord-mobile flow, no header outside Chat, bottom rack, top bar in Chat. Simplicity first: zero-step setup, no repeated labels.

## In flight (v0.4.0 on `dev`)
| Branch | What | Status |
|---|---|---|
| `feat/demo4` | Demo phone layout, reactions and vote card | ✅ merged into dev |
| `feat/people` | Person panel in chat: now, timeline (commits, prompts, chat, notes), jump to chat, context bar, uptime and commit counters | ✅ merged into dev |
| `feat/chat-votes` | Reactions on bubbles, team votes, suggest_vote (Claude proposes), /vote, decisions log, ✅ approves and 📌 pins | ✅ merged into dev |
| `feat/mobile` | Real app phone UI and the repo hero with README art or a screenshot ("Flare") | building |
| `feat/flow` | One-click Create project → room → invite → chat → GitHub repo; roles with colors and folder identity; gists; living PLAN.md; assessments | building |
| `feat/workshop` | Community Workshop: skills, recipes, templates, assets (GLB, animations, scripts), a community index on GitHub served by jsDelivr | building |
| `feat/secretary` | Solo mode: an agents hub (Claude Code, Claude Desktop through a stdio bridge, other MCP agents, local models). The Secretary: a background agent that ingests everything, distills a journal and digest, dreams up inspirations, and routes research to the Claudes | building |
| `feat/chat-bubbles`, `feat/nav2`, `feat/preview`, `feat/demo5`, `feat/audit` | Chat bubbles; the sidebar per the user's layout; app preview; demo matches the app; audit fixes + friend smoke test + DATA.md + FEATURES-NEXT.md + quick wins (backup, chat search, file sharing, load earlier, drafts, rename everywhere) | ✅ merged into dev |
| security | v0.3.2 shipped (C1, H2, H3, H4, M1, L1). Still to do: Tauri CSP (H5), tokens in URLs (M2), WS Origin + CORS (M3), JSONL caps (M4), Host allowlist (M5) | partly done |

## User requests log (newest first)
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
- The feature roadmap now lives in docs/FEATURES-NEXT.md (top 10 next / later). Storage, backups and persistence are in docs/DATA.md.
1. Merge the three branches into `dev`, run the full test suite, review screenshots, let the user try Working.
2. Release v0.3.2 (bump 4 version files + CHANGELOG), confirm installers + latest.json, user restarts to update.
3. Walk the user through the Pixel Quest test project with a real friend's phone.
4. Real-device checks: iPhone Safari join + Home Screen, Web Push, speech, Messenger banner, Tailscale Funnel.
5. Game Studio MVP. Then native iOS (needs a Mac), Intel Mac builds, a TURN relay.

## Decisions
- 2026-11-06: The security review found host RCE reachable by any builder. Fixes were shipped as v0.3.2 straight from `main` ahead of the features, with `app/test/security_test.py` as the regression test.
- 2026-11-06: The Workshop's community index is a public GitHub repo served through jsDelivr (a free open-source CDN). Items need an open license and sha256 checks, and are never executed.
- 2026-11-06: Automated browsers skip the GitHub update check (`navigator.webdriver`), so sandbox proxies don't break tests.
- 2026-11-06: `dev` branch introduced as the working lane.
