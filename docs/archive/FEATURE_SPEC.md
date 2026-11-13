> Archived 2026-11-12: the v0.0.1 spec. The app has moved far past it; see HANDOFF.md and docs/DOCS-INDEX.md.

# TribeCode Feature Spec v1

*Milestone `v0.0.1` · 2026-11-06 · Living version: the TribeCode Feature Spec doc in Claude.*

## Overview

TribeCode is a small self-hosted server plus desktop app for a few friends or a team to run live coding sessions together, with their Claude Code instances wired into one shared workspace. It already has Docs, Tasks, Projects and a self-sorting, self-healing Bug Reports area. This spec covers the core requirements and 25 new features.

Design principles:

- **Everything is a file.** Context, memory, tasks, proposals and decisions live as Markdown and JSON in a git worktree. The UI is a view over files.
- **Local first, tokens last.** Summaries, sorting and triage go to a local model (Qwen via Ollama) first. Claude is used for real coding work.
- **One link to join.** Click the invite, pick a name, you're in, in under a minute.
- **One vision, one main line.** Proposals, an approval board and version matching keep everyone building the same thing.
- **Casual by default.** Chat-first, dark mode first, keyboard and drag-and-drop everywhere.

## Core requirements

| Requirement | How it works |
| --- | --- |
| Invite links | Host generates a short link (`tribe.link/k7Qx2`) with expiry, max uses and role. It opens the desktop app if installed, otherwise a download page with the code pre-filled. |
| Low-hassle signup | Display name + avatar color only. No email or password by default; a device keypair is created silently. GitHub/Google sign-in optional later. |
| `.exe` + desktop wrapper | Tauri shell for Windows `.exe`/`.msi`, macOS `.dmg`, Linux AppImage. The same shell can host the server, so any member can be the host. |
| Glassmorphic dark + light | Frosted panels (backdrop blur, 1 px translucent borders) over a soft gradient. Dark default, follows OS, one-key toggle. |
| Drag and drop everywhere | Files into Docs, tasks between columns, task onto a person to assign, bug onto a task to link, files onto chat to share. |
| Google Docs + any format | Google Drive import/export. A local converter turns docx, pdf, pptx, xlsx, html, epub and images (OCR) into Markdown in the worktree. |
| Local LLM summaries | Every imported or changed doc gets a 3-line TL;DR from the local model, stored as `*.summary.md`. No model running means no summary, not a Claude call, unless the user opts in. |
| Qwen as the evolving brain | A Qwen model through Ollama keeps `brain/` notes per project (decisions, conventions, glossary) and answers "how do we do X here?". Each project can pin its own brain. |
| Proposals + approval board | Big changes start as a proposal doc. The board votes; approved proposals become a project or milestone with tasks. |
| Version matching | Every client shows how far it is from main. Work on a stale base or outside an approved proposal is flagged before push. Approved milestones are auto-tagged and committed to GitHub. |

## 25 new features

**P1** = build first.

| # | Group | Feature | What it does |
| --- | --- | --- | --- |
| 1 | Sessions | **Live lobby + follow mode** (P1) | Who is online, which file/task they're in, whose Claude is running; click to follow a cursor and terminal. |
| 2 | Sessions | **Shared Claude Code relay** (P1) | A TribeCode MCP server every member's Claude Code connects to; shared worktree context, agent output streams to the room, "pass the agent". |
| 3 | Sessions | **Soft file claims** | Claim a file or folder; others see a lock and get a warning before editing. Claims expire. |
| 4 | Sessions | **One-click voice huddle** | WebRTC audio rooms per project, push-to-talk and screen share. |
| 5 | Sessions | **Spectator links** | Read-only invite to watch, chat and react. |
| 6 | Alignment | **Drift radar** (P1) | Live badge of commits behind/ahead of main and off-task files; tribe-wide radar view. |
| 7 | Alignment | **Vision check** | Local model compares branches and proposals against `VISION.md` and flags mismatches. |
| 8 | Alignment | **Milestone auto-commit to GitHub** (P1) | On board approval: merge, tag (`v0.3.0`), changelog from tasks and commits, push. |
| 9 | Alignment | **Session snapshots** | Checkpoint every 10 min and before agent runs; restore any snapshot to a branch. |
| 10 | Alignment | **Merge helper** | Local model explains both sides of a conflict and proposes a resolution. |
| 11 | Tasks | **Chat to task** (P1) | `/task` or right-click a message; the brain also suggests tasks hidden in chat. |
| 12 | Tasks | **Auto standup** | Morning per-person recap from commits, tasks and chat, zero Claude tokens. |
| 13 | Tasks | **Task to branch link** | Starting a task creates a worktree + branch; merging closes the task. |
| 14 | Tasks | **Agent assignment** | Assign a task to a Claude agent with a token cap; progress and diff show on the card. |
| 15 | Tasks | **Token budget meter** | Token use per person/project/day; auto-routes cheap work to the local model. |
| 16 | Knowledge | **Universal drop zone** (P1) | Drop a file, URL, screenshot or Google Doc link: converted, summarized, filed. |
| 17 | Knowledge | **Local semantic search** | Local embeddings across code, docs, chat and bugs. |
| 18 | Knowledge | **Decision log** | Approved proposals and `/decide` messages become dated entries in `decisions/`. |
| 19 | Knowledge | **Brain review queue** | The brain proposes memory changes as diffs; members approve or reject. |
| 20 | Knowledge | **Onboarding pack** | New members get a generated "start here" page with good first tasks. |
| 21 | QoL | **Command palette** (P1) | `Ctrl+K` to any file, task, doc, person or action. |
| 22 | QoL | **Focus mode + digest** | Mute all but mentions; get a local digest when you return. |
| 23 | QoL | **One-key bug capture** | Hotkey grabs screenshot, logs, branch and recent actions; crashes self-report. |
| 24 | QoL | **Shared skill shelf** | Share Claude Code skills, MCP configs and prompts, synced into each `.claude/`. |
| 25 | QoL | **Easy remote hosting** | One toggle for Tailscale or a Cloudflare tunnel, plus encrypted nightly backups. |

## Market and niche

Multiplayer Claude Code already exists in many forms (Clay, open-tag, ICE, Hubcode, ccshare, mpai, team-coding, Jam), so TribeCode should not compete on session sharing alone. The gap is **governance plus a local brain for small tribes**: no tool found combines proposals, an approval board and drift detection with a zero-token local memory and a Notion-like workspace in a desktop app.

**Positioning:** *"The clubhouse for building with friends and AI. One link to join, one shared brain, one vision."*

1. **Vision lock**: proposals, approval board, drift radar and milestone auto-commits.
2. **Zero-token brain**: a local Qwen model handles summaries, triage, standups and memory.
3. **Friend-grade onboarding**: one short invite link, no account form, a real `.exe`.
4. **Notion-like docs inside a dev tool**, stored as Markdown in the repo.
5. **Casual, social feel**: presence, huddles and reactions.

## Open-source building blocks

MIT and Apache-2.0 code can be adapted with attribution. AGPL projects (Clay, Hubcode) are reference only: study ideas, write fresh code.

| Area | Repo | License |
| --- | --- | --- |
| Desktop shell + `.exe` | [tauri-apps/tauri](https://github.com/tauri-apps/tauri) | MIT / Apache-2.0 |
| Notion-like docs | [TypeCellOS/BlockNote](https://github.com/TypeCellOS/BlockNote) | MPL-2.0 (avoid GPL `xl-*` packages) |
| Real-time sync | [yjs/yjs](https://github.com/yjs/yjs), [ueberdosis/hocuspocus](https://github.com/ueberdosis/hocuspocus) | MIT |
| Any format to Markdown | [microsoft/markitdown](https://github.com/microsoft/markitdown) | MIT |
| Local LLM + embeddings | [ollama/ollama](https://github.com/ollama/ollama) | MIT |
| Shared Claude session | [m3nadav/team-coding](https://github.com/m3nadav/team-coding), [ofershap/clawgether](https://github.com/ofershap/clawgether) | MIT |
| Channels, tasks, agent teammates | [fancyboi999/open-tag](https://github.com/fancyboi999/open-tag) | Apache-2.0 |
| Git + GitHub | [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git), [octokit.js](https://github.com/octokit/octokit.js) | MIT |
| Voice huddles | [livekit/livekit](https://github.com/livekit/livekit) | Apache-2.0 |
| Drag and drop | [clauderic/dnd-kit](https://github.com/clauderic/dnd-kit) | MIT |
| Command palette | [pacocoursey/cmdk](https://github.com/pacocoursey/cmdk) | MIT |
| Icons | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) | ISC |
| Remote access | [tailscale/tailscale](https://github.com/tailscale/tailscale) | BSD-3 |
| Reference only | [chadbyte/clay](https://github.com/chadbyte/clay), [hubtool/hubcode](https://github.com/hubtool/hubcode) | AGPL-3.0 |

Built in-house (the differentiators): proposal + approval board, drift radar, vision check, brain review queue, invite + zero-form signup, milestone auto-commit.

## UI direction

Rounded frosted-glass window: 64 px icon rail · 248 px sidebar (projects, workspace shortcuts, huddles, *Invite friends*) · Notion-style canvas · 300 px room panel (presence + chat). See [`docs/screenshots/`](screenshots/) and [BRAND.md](../BRAND.md).

## Architecture

```
Each member's desktop          Tribe server (any host)              Outside services
- Tauri desktop app   <-sync-> - Relay + presence (WebSocket)  ---> GitHub (milestone tags)
- Claude Code (MCP)            - Yjs live doc sync             <--> Google Drive
- Ollama + Qwen brain          - Git worktree (Markdown truth) <--- Tailscale / tunnel
                               - Governance engine
```

```
tribe/
  projects/<name>/
    VISION.md
    docs/        # Notion-like pages as .md + *.summary.md
    tasks/       # one .md per task, front-matter status
    proposals/   # proposal docs + votes.json
    decisions/   # ADR-style decision log
    bugs/        # self-sorted bug reports
    brain/       # Qwen's reviewed memory notes
  chat/          # JSONL per channel
  skills/        # shared Claude Code skills + MCP configs
```

## Roadmap

| Phase | Scope | Gate (= tagged milestone) |
| --- | --- | --- |
| 0 · Design ✅ | Spec, brand kit, mockups, README, MIT license | `v0.0.1` |
| 1 · Foundation | Tauri shell + `.exe`, invite sign-up, docs/tasks/chat, drop zone + summaries | A friend joins in 1 minute |
| 2 · Together | Claude Code relay, presence + follow, voice huddles, soft file claims | 3 people share one agent |
| 3 · One vision | Proposals + board, drift radar, vision check, milestone auto-commit | First auto-tagged release |
| 4 · Grow | Brain review queue, skill shelf, remote hosting, bug capture | |

### Open questions

- [ ] Server language: Node/TypeScript (shares code with the UI) or Rust (smaller binary)?
- [ ] Default local model size for laptops vs the host machine.
- [ ] Board voting rule: simple majority, or owner veto plus majority?
