# Project rooms

A tribe has projects. Each project is its own room: its own people, chat channel, docs, tasks,
proposals, calendar items, bugs, repo, agents, `VISION.md` and `TRIBE_CONTEXT.md`.

## In the app

- **Project circles.** The far-left rail is a column of round project avatars, Discord-style: tribe
  home at the top, one circle per project (its picture, emoji or initials on its color), and **+** to
  start a project. The current project has an orange bar on its left edge; other projects show a
  badge for new chat and open requests. Click a project's picture in its Overview to change it.
- **The nest.** The second column belongs to the current project: a "Tribe / Project" header (click
  it for the Overview: who is here, live agents, recent changes, upcoming, your branch), then
  **Docs**, **Chat**, **Notifications**, **Tasks**, **Requests** (only when something is waiting),
  **More** (Overview, Calendar, Repo, Visuals, Bugs, Board, pop-out windows), the **Huddle** and
  **Invite friends**. Arrow keys move through the circles and the nest.
- **Phones.** The drawer shows the circles as a horizontal strip above the nest, the project name
  in the title bar opens a project switcher sheet, and the bottom tab bar works on the current
  project.
- **Presence.** The room panel shows which project each person (and each agent) is in.

## Starting a project

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
