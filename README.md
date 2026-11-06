<div align="center">

<img src="assets/brand/icon-512.png" width="112" alt="TribeCode icon">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-wordmark-dark.png">
  <img src="assets/brand/logo-wordmark.png" width="360" alt="TribeCode">
</picture>

### Code with friends. One link to join, one shared brain, one vision.

TribeCode is a lightweight, self-hosted clubhouse for building software together with your friends **and** your Claude Code agents: chat, docs, tasks, proposals and live sessions in one glassy desktop app.

[![License: MIT](https://img.shields.io/badge/license-MIT-7C5CFF.svg)](LICENSE)
![Status](https://img.shields.io/badge/status-design%20phase-FFB86B.svg)
![Platforms](https://img.shields.io/badge/desktop-Windows%20%7C%20macOS%20%7C%20Linux-3DD6D0.svg)
![Local first](https://img.shields.io/badge/brain-local%20Qwen-FF6F8E.svg)

[Features](#-features) · [Screenshots](#-screenshots) · [How it works](#-how-it-works) · [Roadmap](#-roadmap) · [Feature spec](docs/FEATURE_SPEC.md) · [Brand](docs/BRAND.md)

</div>

---

> **Status:** TribeCode is in the design phase (milestone `v0.0.1`). The screenshots below are rendered **UI mockups** from [`design/mockups/app.html`](design/mockups/app.html), not a running build yet.

<p align="center">
  <img src="docs/screenshots/docs-dark.png" alt="TribeCode docs workspace, dark mode" width="100%">
</p>

## ✨ Why TribeCode

Multiplayer Claude Code tools already let people share a terminal session. TribeCode is built for the part that comes next: keeping a small crew **aligned** while everyone (and every agent) builds at once.

- **🔗 One link to join.** Send `tribe.link/k7Qx2`. Your friend picks a name and a color and is in. No email, no password form.
- **🧭 One vision.** Proposals, an approval board, a drift radar and a `VISION.md` check stop people from building divergent copies.
- **🧠 A zero-token brain.** A local Qwen model (via Ollama) writes summaries, standups and triage and keeps project memory, so Claude tokens go to real code.
- **📝 Notion-like docs next to the code.** Blocks, slash menu, inline databases and Google Docs import, all stored as Markdown in your repo.
- **🏷️ Milestones ship themselves.** When the board approves a milestone, TribeCode tags it, writes the changelog and pushes it to GitHub.

## 🧩 Features

| Area | Highlights |
| --- | --- |
| **Sessions** | Live lobby + follow mode · shared Claude Code relay over MCP · soft file claims · one-click voice huddles · spectator links |
| **Alignment** | Proposals + approval board · drift radar · vision check · milestone auto-commit to GitHub · session snapshots · merge helper |
| **Tasks** | Chat-to-task · auto standup · task ↔ branch link · assign tasks to Claude agents with a token cap · token budget meter |
| **Knowledge** | Universal drop zone (any file → Markdown + TL;DR) · local semantic search · decision log · brain review queue · onboarding pack |
| **Quality of life** | `Ctrl+K` command palette · focus mode + digest · one-key bug capture · shared skill shelf · easy remote hosting via Tailscale |
| **Core** | Docs · Tasks · Projects · self-sorting, self-healing bug reports · drag and drop everywhere · glassmorphic dark + light themes |

The full list of 25 features with rationale is in **[docs/FEATURE_SPEC.md](docs/FEATURE_SPEC.md)**.

## 📸 Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/tasks-dark.png" alt="Task board with drag and drop and a Claude agent task"><br><sub><b>Tasks:</b> drag cards between columns, start a branch by dropping, watch an agent's token budget.</sub></td>
    <td width="50%"><img src="docs/screenshots/board-dark.png" alt="Approval board with drift radar and milestones"><br><sub><b>Approval board:</b> vote on proposals, see who is drifting from main, track milestones pushed to GitHub.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/docs-light.png" alt="Docs workspace in light mode"><br><sub><b>Light mode:</b> the same glass, brighter. Notion-style blocks with a local TL;DR.</sub></td>
    <td width="50%"><img src="docs/screenshots/join-dark.png" alt="Invite join screen"><br><sub><b>Joining:</b> one link, a name and a color. That's the whole sign-up.</sub></td>
  </tr>
</table>

## ⚙️ How it works

```
 Each member's desktop                 Tribe server (any member can host)        Outside
┌──────────────────────┐   sync    ┌────────────────────────────────┐
│ Tauri app (glass UI) │ ◀───────▶ │ Relay + presence (WebSocket)   │ ──▶ GitHub (milestone tags)
│ Claude Code ── MCP ──┤           │ Yjs live doc sync              │ ◀─▶ Google Drive
│ Ollama + Qwen brain  │           │ Git worktree (Markdown = truth)│ ◀── Tailscale / tunnel
└──────────────────────┘           │ Governance: proposals, drift   │
                                   └────────────────────────────────┘
```

Everything (docs, tasks, proposals, decisions, the brain's memory) is plain Markdown and JSON in a git worktree, so people, agents and git all read the same source of truth.

## 🗺️ Roadmap

- [x] **Phase 0: Design.** Feature spec, brand kit, UI mockups, MIT license (`v0.0.1`)
- [ ] **Phase 1: Foundation.** Tauri shell + `.exe`, invite-link sign-up, docs/tasks/chat, drop zone + local summaries
- [ ] **Phase 2: Together.** Claude Code relay, presence + follow, voice huddles, soft file claims
- [ ] **Phase 3: One vision.** Proposals + approval board, drift radar, vision check, milestone auto-commit
- [ ] **Phase 4: Grow.** Brain review queue, shared skill shelf, remote hosting, bug capture hotkey

## 🏷️ Version milestones

Milestones are committed and tagged with [`scripts/milestone.sh`](scripts/milestone.sh):

```bash
./scripts/milestone.sh v0.1.0 "Foundation: desktop shell and invites"
```

It adds an entry to [`CHANGELOG.md`](CHANGELOG.md), commits, creates an annotated tag and pushes both to GitHub. In Phase 3 the approval board calls this same step automatically.

## 🧱 Built on

[Tauri](https://github.com/tauri-apps/tauri) · [BlockNote](https://github.com/TypeCellOS/BlockNote) · [Yjs](https://github.com/yjs/yjs) · [Ollama](https://github.com/ollama/ollama) · [MarkItDown](https://github.com/microsoft/markitdown) · [dnd-kit](https://github.com/clauderic/dnd-kit) · [cmdk](https://github.com/pacocoursey/cmdk) · [Lucide](https://github.com/lucide-icons/lucide) · [LiveKit](https://github.com/livekit/livekit)

## 🤝 Contributing

TribeCode is designed in the open. Open an issue with an idea or start a proposal in `proposals/` once the board ships. See the [feature spec](docs/FEATURE_SPEC.md) for what's planned.

## 📄 License

[MIT](LICENSE) © 2026 orionopenwow and TribeCode contributors.
