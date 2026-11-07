# Project rooms

A tribe has projects. Each project is its own room: its own people, chat channel, docs, tasks,
proposals, calendar items, bugs, repo, agents, `VISION.md` and `TRIBE_CONTEXT.md`.

## In the app

- **Project circles.** The far-left rail: the TribeCode logo, one round avatar per project (picture,
  emoji or initials on its color) and **+** (new project, or Join with a link). The current project
  has an orange bar on its left edge; others show a white unread pill and a red count for requests.
- **The nest.** The second column belongs to the current project (app/ui/shell.js): its name (click
  for Home, the project overview with today's focus), **New** (task, doc, upload, huddle, ask Claude),
  **Search**, **Chat**, **Docs & files**, **Updates**, **Tasks**, **Huddle**, **More ⋯** (Bugs, Board,
  Milestones, Calendar, Repo, Visuals, Requests, Agents, Ownership, Conflicts, Hand-offs, Reviews,
  Daily plan, Settings), then **Pinned** and **Recents**, and **Invite friends** at the bottom.
- **Top bar.** *Tribe / Project ▾ / Section ▾*, the search, the bell and status, the window buttons.
- **Right panel.** In the room (people, then agents and what they're doing); opening a doc,
  screenshot, bug or approval turns it into a preview with a close button. It collapses.
- **Phones.** The drawer shows the circles as a horizontal strip above the nest, the project name
  in the title bar opens a project switcher sheet, and the bottom tab bar works on the current
  project.
- **Presence.** The room panel shows which project each person (and each agent) is in.

## One click: Create project → room → link → chat → repo → flow

Click **+**. The name is already filled in, so **Create** is the only click (server/flow.js, app/ui/flow.js):

1. **Room.** The project is created and this computer hosts it.
2. **Link.** A project invite (72 h, 10 uses). It uses the public https address when Tailscale Funnel or
   cloudflared is available (turned on in the background), else the Wi-Fi address.
3. **Chat opens** with a **Getting started** card docked on top: compact steps (Room ✓ · Link ✓ · Repo ✓ ·
   GitHub ✓), the invite link (Copy, QR, Share on phones), roles, and a drop zone for notes and files.
4. **Repo.** In the background: `workspaces/<project>/` with README, VISION.md, CLAUDE.md (the gist rules),
   PLAN.md, TRIBE_CONTEXT.md and one folder per role (each with a README saying who owns it), `git init`
   and a first commit.
5. **GitHub.** A private repo is created and pushed: with the starter's saved GitHub token (REST API,
   token passed to git through a credential helper, never in a URL or a log), else with the `gh` CLI when
   it is signed in on the host, else it stays local and the card shows one **Connect GitHub** chip.
   `TRIBE_GITHUB_API` points at another API base (tests use a mock); `TRIBE_NO_GH=1` skips the gh CLI.

**Roles and folders.** Each role has a name, a color (Ember, Teal, Indigo, green, rose, or the muted sand,
sage and plum), a glyph, its people (and their agents) and the folders it owns. Default: Lead (`docs/`),
Design (`design/`, `assets/`), Frontend (`app/`), Backend (`server/`), QA (`tests/`); the starter makes
these folders. Tap a role in the card to take it, leave it or give it to someone; **Edit roles** (or
**Roles** in the sidebar) renames, recolors, changes the glyph and the folders. Holding a role gives you
and your agents lanes on its folders in the ownership map (coord.js). The role color shows everywhere:
gist cards, plan items, task cards, folder chips (color dot + friendly folder name) and avatar rings.
`GET /api/projects/:id/roles` returns roles, people and folder → role mappings for other views.

**Notes and files** dropped on the card become Docs (text) or files in the repo's `docs/notes/`
(anything else), and a copy of text notes goes to `brain/notes/`.

**Start the flow** turns the notes (or VISION.md) into a first plan: the local brain if it answers, else
rules (headings → milestones, bullets → items, keywords or `[Role]` tags → roles). Every item becomes a
task (assigned when the role has one person), PLAN.md is written and committed, and a plan gist is posted.

**Gists.** Agents report with the MCP tool `post_gist` (kind: progress, upgrade, plan, blocker,
assessment; a title, ≤5 bullets of ≤120 characters, files, link). The server rejects fenced code, code-like
bullets and bodies over ~600 characters with a message telling the agent to summarize. Gists render as
compact cards in chat and in **Updates**. Commits (Commit my changes, or new commits on the checked-out
branch) become gists automatically: commit subjects + files and the role areas they touch (brain summary
when available), with a link to the diff on GitHub. Also `read_plan`, `my_role`, `list_gists`.

**The living plan** (Updates, one hero card): items check off as their tasks finish (PLAN.md commits keep
the history), blocker gists surface on the plan until resolved (by a human, or a "fixed/unblocked"
progress gist), upgrade gists become plan changes that only humans approve (Approve/Deny). **Assess now**
(and once a day) posts an assessment gist: progress vs plan, who is blocked, risks, the next 3 moves.

State: `.tribe/flow/<project>.json` and `.tribe/flow/<project>.gists.jsonl`. HTTP: `/api/flow`
(`create`, `roles`, `notes`, `start`, `assess`, `plan`, `changes/:id/approve|deny`, `blockers/:id/resolve`,
`github`, `invite`) and `/api/gists`.

## Starting a project from a folder or repo

Click the **+** circle (or drop a folder on the circles, or on the **Start a project** card on Home). One dialog: drop a folder or repo, or type a name, a GitHub URL or a folder path, then **Create**.

| How | What happens |
| --- | --- |
| Drop a folder in the desktop app | The real path is used; the project is bound to that folder. |
| Paste a path (host machine only) | Same as above. Refused for anything that arrives through a tunnel. |
| Drop a folder in a browser | If it has `.git/config` with a remote, TribeCode offers **Clone it into TribeCode**. Otherwise the files are uploaded (node_modules, .git, build folders skipped; 25 MB cap) into `workspaces/<project>/`, then `git init` and a first commit as you. |
| Paste a GitHub URL | Cloned into `workspaces/<project>/` with the host's git. `you/repo` shorthand works. |
| Start empty | A project with no repo; attach one later. |

If a folder is not a git repo yet, **Make it a git repo** runs `git init`, writes a `.gitignore`
(node_modules, build folders, `.env`, logs) and makes the first commit.

## Shared workspace and git identity

- All git work runs on the host machine with the host's own git and credentials. GitHub is optional:
  everything works offline with plain git. If the GitHub CLI is signed in on the host, the workspace
  panel says **Signed in to GitHub as …**.
- **Give me a branch** makes `tribe/<you>` in its own worktree at `<repo>/.trees/<you>` (excluded via
  `.git/info/exclude`), so two people and their agents never collide. Claims and hand-offs work as
  before.
- **Commit my changes** commits in your worktree as you: name from your profile, email you set once
  (optional, default `<name>@users.noreply.tribecode`).
- **Push my branch** uses the host's credentials, or your own GitHub token if you saved one under
  **Change** in the workspace panel. The token is stored on the host in `.tribe/secrets/<you>.json`
  (mode 0600), handed to that single `git push` through a credential helper that reads it from the
  process environment, and never sent to any browser or written to logs. Remove it any time.

## Invites

The invite dialog has a project picker (default: the current project). A **project invite** makes
the friend a tribe member who only sees that project: its chat, docs, tasks, people and agents. A
**whole-tribe** invite sees every project. Project-only members can invite people to their own
projects only.

## Agents (MCP)

Every tool takes an optional `project` argument; without it, an agent works in the project its key
was created in. `list_projects` shows the projects the agent can see (its owner's).

## Storage

- `.tribe/projects.json`: the projects (id, name, emoji, color, channel, repo, members and roles).
- Records in `tasks/`, `docs/`, `proposals/`, `bugs/`, `calendar/`, `decisions/` carry a `project`
  field. Records without one belong to the first project.
- The first project keeps the original paths (`VISION.md`, `repo/`, `changes/`, `chat/general.jsonl`).
  Other projects keep theirs under `projects/<id>/` and chat in `chat/p-<id>.jsonl`.
- Uploaded and cloned repos live in `workspaces/<id>/`.
- `--repo <path>` is the first project's repo.

**Migration** is automatic and idempotent: the first start after updating creates the first project
(named after the `--repo` folder or the tribe) and writes `project` into existing records. Nothing is
moved or deleted.

## Limitations

- Milestone tags, visuals and file claims are still tribe-wide.
- Browser uploads are capped at 25 MB; bigger folders: paste the path on the host, use the desktop
  app, or push to GitHub and paste the URL.
- The desktop drop handler listens for Tauri's `tauri://drag-drop` event; the Rust side was not
  changed.
