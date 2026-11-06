# Changelog

## Unreleased: Sprints 2–8

- Claude Code relay: MCP endpoint at `/mcp` (Streamable HTTP, JSON responses) with 14 tribe tools; "Connect your Claude Code" makes a per-member agent key and the one-line `claude mcp add` command
- Agents are members with role `agent`: they show in the room while active ("using claim file"), can't vote or invite, and their proposals start with zero votes
- Soft file claims (folder-aware, 4 h expiry) for people and agents; shown in the room panel; handed off to a teammate from the update panel
- Follow mode: click a teammate in the room to jump to what they're viewing
- Fixes: background doc loading overwrote your presence; chat didn't stay pinned to the newest message

- Desktop hosting: server bundled into one file (`scripts/bundle-server.js`) and built as a standalone Node SEA sidecar per platform (`scripts/build-sidecar.js`, run in CI); "Host a tribe on this computer" starts it, makes you host and resumes on next launch; server exits with the app
- `tribecode://join?server=…&code=…` deep links, single-instance app (second launch focuses the window and forwards the link), "Open it there" on the join page
- In-app join from any pasted invite link, with a tribe-switch warning
- Server: `--ui` and `--exit-with-parent` flags, clear message when the port is busy
- CI: separate Apple Silicon and Intel macOS builds (each with its own sidecar)

- Drift radar (`--repo`): every branch vs main with behind/ahead, files changed, linked task, and a watch/drifting level; periodic `git fetch`
- Bug inbox: Ctrl+Shift+B capture with recent logs + view + version; automatic crash reports (rate-limited); triage by local brain or rules; duplicates merge with a seen-count; bug → task, and the bug resolves itself when the task is done (reopens if the task does)
- Ctrl+K command palette over actions, views, docs, tasks and people with fuzzy search
- Brain rail button opens the standup card

- Docs: Markdown pages in `docs/`, Notion-style `/` menu (headings, to-dos, lists, quote, code, divider, table, date, summarize), list continuation, Ctrl+B/I/S, Write/Read modes with clickable checklists
- Docs autosave with versioning; live updates for idle readers; conflict banner (use theirs / copy mine / keep mine); drop files to import; works offline on one device
- Local brain via Ollama (`--ollama`, `--model`, prefers Qwen): doc TL;DRs saved as `*.summary.md`, daily standup written to `brain/` and posted to chat, vision check on every new proposal
- Home drop zone imports files into Docs; title bar shows the host's brain model

- Tribe server (`npm start`): zero-dependency Node, serves the UI, hand-rolled WebSocket for presence + chat
- Invite links with expiry, max uses and builder/spectator roles; join page that carries name + color into setup
- Host bootstrap from the host machine only; per-member tokens stored hashed; per-IP rate limits on public endpoints
- Chat with `/task` (creates a task) and `/decide` (writes to `decisions/`)
- Tasks board: drag between columns and reorder, quick add, double-click rename, assign, delete; live sync; works offline on one device
- Everything stored in the tribe folder as Markdown (tasks, decisions) and JSONL (chat)
- Room panel shows who's online and which view they're in; update hand-off uses real online teammates
- Fixes: invite modal crash after the room list rendered; help button no longer covers the chat box
- Approval board: proposals with Markdown template, majority voting (author's vote counts), auto-park when it can't pass, withdraw
- Approval creates the next milestone (v0.x.0), turns `- [ ]` items into tasks, writes a decision record, announces in chat
- VISION.md editable by the host from the board; milestones released by the host get an annotated git tag in `--repo` and are pushed to origin
- Sidebar shortcuts open Tasks and the Board; title bar shows the tribe's real name
- Fixes: friends were told "You're the host" after joining; proposal bodies showed raw Markdown
- Tests: `npm test` runs the UI smoke test and a two-person end-to-end test against the real server

## v0.1.0: Desktop shell (2026-11-06)

- First-run setup for personal preferences (name, color, theme, density, folder, local brain, startup), with no account needed
- 60-second spotlight tour, replayable from the ? button; Getting started checklist on Home
- Auto-update: background download, "Restart to update" pill, save + hand off agents/claims + tell the room, snooze options, welcome-back toast
- Local brain detection via Ollama (prefers Qwen models)
- Tauri v2 wrapper (dialog, updater, process, notification, autostart) and icons for Windows, macOS, Linux
- GitHub Actions release workflow publishing installers + latest.json on version tags
- milestone.sh now bumps the app version; UI smoke test in app/test/ui_smoke.py
- Fix: ?reset=1 no longer wipes settings on every reload

## v0.0.1: Design phase (2026-11-06)

- Feature spec: core requirements, 25 new features, market niche, open-source building blocks, architecture, roadmap
- Brand kit: "Campfire Brackets" app icon, wordmark (light and dark), Windows `.ico`, color tokens
- UI mockups for docs, tasks, approval board and invite screens in dark and light mode
- README, MIT license and the `scripts/milestone.sh` release script
