# TribeCode — living context

The one document that remembers the greater vision and everything in flight. Updated at every milestone and whenever the user gives new direction. HANDOFF.md says *how* to run, test and ship; this says *what and why*.

Last updated: 2026-11-06 (v0.3.1 released; v0.3.2 in progress on `dev`).

## The vision
Multiplayer vibecoding. A group of friends, each with their own Claude Code agents, build one app together, and it feels like a Discord server that ships software. One friend's computer hosts everything (no cloud bill). Friends join with one link from any phone or computer. Humans decide and agents do the work: agents propose, humans approve with one tap. Everything stays in plain Markdown/JSONL in the tribe folder and in git.

Pillars: **one link to join · one shared brain (local Qwen + TRIBE_CONTEXT.md) · one vision (VISION.md + Board votes) · agents that coordinate without stepping on each other**.

Where it's heading:
1. Polished phone app (installable PWA now, native iOS via Tauri later).
2. Chat as the control room: reactions, votes, approvals, and agent requests all happen in the chat stream.
3. Game Studio (docs/GAME-STUDIO.md): friends build small games together, starting with Pixel Quest.
4. Real-device reliability: push, speech, tunnels and huddles on cellular (TURN).

## How we work (decided 2026-11-06)
- **Two lanes.** `main` = stable/released. `dev` = working lane where new work lands first.
  - Desktop\TribeCode\Stable\Start-Stable.bat runs `main` at :4747 with the real tribe.
  - Desktop\TribeCode\Working\Start-Working.bat runs `dev` at :4848 with live reload and its own test tribe (no exe compile needed to test UI).
- **Shipping.** Feature branches → `dev` (user tests in Working) → merge to `main` + version bump → CI release → in-app "Restart to update".
- **Parallel agents, no interference.** Big work is split across agents in separate git worktrees, each owning an explicit set of files. Every branch is pushed to GitHub (branches were lost once because they weren't).
- Commits end with the Co-Authored-By and Claude-Session trailers.

## Design rules (user's, keep)
Restraint: numbers only where they answer a question; color carries meaning (role colors on people, folders, gists, plan items).
Flat matte, 1px borders, depth from luminance only, no glows/blur/gradients. Ember #F26B1D, Teal #38C6B1, Indigo #6C7CFF, canvas #12151A, surface #1B2028, raised #1E242D, border #2A313C, approve #3BD16F, deny #FF6F8E. Section clarity (mono eyebrow + clear title, one hero card per screen, reading layout). Phone: Discord-mobile flow, no header outside Chat, bottom rack, top bar in Chat. Simplicity first: zero-step setup, no repeated labels.

## In flight (v0.3.2)
| Branch | What | Status |
|---|---|---|
| `feat/mobile` | Real app phone UI: rack, composer (+ menu, recorder), Docs hub, one-tap approvals, suggested tasks, Talk-to picker, profile sheet/DMs, in-app-browser escape, section clarity doc, e2e_mobile2.py | rebuilding (agent) |
| `feat/chat-votes` | Emoji reactions on bubbles (quick-react bar, double-tap), team votes in chat, Claude can propose votes (MCP), /vote, vote → task/Board, QoL extras | building (agent) |
| `feat/flow` | One-click Create project → hosted room → invite link → chat opens → GitHub repo created + pushed → roles, notes and files dropped → Start the flow. Agents post short gists (post_gist), not code dumps. Self-updating PLAN.md + assessment gists | building (agent) |
| `feat/people` | Click a person → panel inside chat: what they and their Claude are doing now, their commits, prompts, chat and notes in one timeline, jump to the moment in chat, context-window bar. Quiet uptime and commit counters | building (agent) |
| security review | Full audit of the public-facing server, then fixes + regression tests | auditing (agent) |
| `feat/demo4` | Demo phone layout: no header, richer rack, less whitespace, reactions + vote card in demo | rebuilding (agent) |

## User requests log (newest first)
- 2026-11-06: Roles area you can navigate, named roles, named folders with a clear identity, color-coded concepts. Click a person → their commits, prompts, chats and notes in context, their position and context window. Not numbers everywhere, don't overwhelm, keep it sleek. Uptime counter, commit counter.
- 2026-11-06: Security review. One-click Create project → hosting room → invite link → chat opens → repo created and pushed to GitHub → humans delegate roles, dump notes and files → flow begins → agents give gists (progress, upgrades, plans), not monolith code dumps → self-evolving plan and assessments.
- 2026-11-06: Keep the GitHub → main → Restart-to-update loop working end to end. Keep this living context doc.
- 2026-11-06: Stable and Working folders on the Desktop to test UI without compiling an exe. ✅
- 2026-11-06: Always send agents to work on separate parts without interference. ✅ (process)
- 2026-11-06: Emoji reactions on chat bubbles; votes Claude can suggest ("team should vote to approve a feature"); related quality-of-life features.
- Earlier: everything in CHANGELOG.md v0.2.0–v0.3.1.

## Next up
1. Merge the three branches into `dev`, run the full test suite, review screenshots, let the user try Working.
2. Release v0.3.2 (bump 4 version files + CHANGELOG), confirm installers + latest.json, user restarts to update.
3. Walk the user through the Pixel Quest test project with a real friend's phone.
4. Real-device checks: iPhone Safari join + Home Screen, Web Push, speech, Messenger banner, Tailscale Funnel.
5. Game Studio MVP. Then native iOS (needs a Mac), Intel Mac builds, a TURN relay.

## Decisions
- 2026-11-06: Automated browsers skip the GitHub update check (`navigator.webdriver`), so sandbox proxies don't break tests.
- 2026-11-06: `dev` branch introduced as the working lane.
