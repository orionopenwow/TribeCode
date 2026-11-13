# Light hosting: local first, GitHub as the shared truth

*The assumed flow from here on (feat/setup-local).* A project starts on your device, works there with no server, and
picks a home only when you want friends in. The home can be as light as a GitHub repo.

## The flow

1. **Start, instantly.** "Start your first project" (Home, the + New project button, Move to… with no project yet)
   asks for a name, one line about it, and optionally notes, first tasks and Company basics. Create makes it at once on
   this device: tasks, docs, notes, chat, the design canvas, whiteboards and Company all work. Nothing waits on a server,
   so nothing can say "the server didn't start".
2. **Work.** Everything is kept on the device (localStorage and IndexedDB) and survives reloads. Files you make in All
   files without a project (docs, sheets, whiteboards, designs, pictures, code, any upload) are kept on the device too,
   and Move to… puts them in a project later.
3. **Choose a home: last, optional, any time.** "Where should it live?" comes after Create and stays one tap away in the
   pill at the top ("On this device · choose where it lives"):

| Home | What it gives | Needs |
| --- | --- | --- |
| **A GitHub repo** | The repo is the shared truth. Anyone can see the live repo; suggestions appear as files on a branch | A repo; a token only to write |
| **This computer** | A real tribe: friends join with a link, agents, huddles | The desktop app (or `npm start`) |
| **Free cloud** | A tribe that stays online without anyone's computer | A free Render account ([CLOUD.md](CLOUD.md)) |
| **Phone** | Keep it on this phone, or host from an Android phone | Termux for hosting ([PHONE-HOSTING.md](PHONE-HOSTING.md)) |

4. **Sync.** Choosing a server home sends the draft in one call (`POST /api/import/solo`). It is idempotent: the draft
   carries a `draftId`, the host remembers it (`solo-imports.json` in the tribe folder) and answers a repeat with the
   first result (`again: true`) instead of a second copy. The device keeps its copy until the host has answered that it
   has everything; a failure leaves the project where it was ("Try again" or "Keep working offline").

## "Lightly live on GitHub"

The minimal version, shipped now (`app/ui/setuplocal.js`):

- **Signed in?** Picking "A GitHub repo" first checks for a way to write to GitHub: a token in this browser,
  TribeCode's GitHub sign-in, the GitHub CLI (`gh auth status`) or a git credential on this computer
  (`GET /api/github/detect`, members or the host computer itself; it never returns a token). With none, a short guide:
  Sign in with GitHub (when the host turned it on), a fine-grained token (the exact steps: Contents read and write), or
  install git and the GitHub CLI for your system and run `gh auth login`. **Check again** (or coming back to the window)
  re-checks, and once something is there the GitHub sheet opens by itself. **Continue read-only** is always there.

- **Connect** a repo by name (`owner/name` or its URL). Public repos need no token to view. A fine-grained token with
  Contents read and write lets TribeCode write suggestions; it is kept only on this device (`localStorage`), never in
  the project, an export or a server.
- **Suggestions as files, no pull request.** TribeCode writes plain Markdown to a `tribe/suggestions` branch (made from
  the default branch the first time):
  - `.tribe/README.md`: what the branch is.
  - `.tribe/project.md`: the name, the one-liner, the vision and the Company basics (anything left for later says so).
  - `.tribe/tasks.md`: the task list as checkboxes by status.
  - `.tribe/docs/<slug>.md`: each doc.
  Files that haven't changed aren't written again, so mirroring is cheap and repeatable ("Mirror now").
- **The live repo on the project.** The project's Home shows a "Live on GitHub" card: the last commits, the
  `tribe/*` suggestion branches and the open pull requests, read straight from the GitHub API (cached for a minute).
  No always-on server is needed to view any of it; anyone with the link sees the same thing on github.com.

When the project later moves to a server home and the host moves it, the host clones the repo and binds it as the
project's code repository at once (the same as connecting a repo by URL: `workspaces/<project>`, `repo` + `workspace` on
the project; `server/index.js connectRepo`). It is idempotent: a repeated draft returns the first result and a project
that already has a repository keeps it. A member who isn't the host gets a chat line asking the host to connect it. The
existing workspace, autopilot and GitHub sign-in (`server/workspace.js`, `server/github-auth.js`) take over from there.

## Who keeps it live

- **Nobody, for viewing.** GitHub is the shared truth; the repo, the suggestion branch and pull requests are readable by
  anyone.
- **Any member's app, for speed.** When someone hosts (the desktop app, `npm start`), that machine is the live relay for
  chat, presence, huddles and agents. The desktop app only starts its server when a tribe exists on that computer and
  Host is on; a fresh install starts nothing.
- **A free cloud, for always-on.** Render's free plan with cloud save ([CLOUD.md](CLOUD.md)).

## After setup, when a server fails

Only once a tribe exists on this computer can Home say it is offline, and then in one line ("Your tribe is offline on
this computer. Changes wait here and send when it's back.") with **Details** (the host log), **Try again** and
**Keep working offline**. Messages and edits wait in the outbox (`app/ui/tribe.js`) and send when it is back.

## For developers

- `app/ui/setuplocal.js` (`window.TribeLocalSetup`, also `TribeSetup.start()` / `TribeSetup.where()`): the setup sheet,
  Where should it live?, the This computer sync, the GitHub connect / mirror / live card.
- `app/ui/offline.js` solo mode is the local backend: `start('solo', draft)`, Company basics
  (`/projects/:id/company`), whiteboards, `exportSolo()` (with `draftId`, `company`, `github`, doc `kind`),
  `setHome()`, `forget()`, `realFetch()`.
- `app/ui/localfiles.js` (`window.TribeLocalFiles`): files kept on the device and their editors' local backend.
- `server/soloimport.js`: the import, idempotent by `draftId`; Company basics become a company (blank template) with
  "me" seats given to the person moving it.
- `app/ui/app.js` boot: `tribeHere = hosting && (tribeHere || token)`; `hostHere({ silent: true })` returns
  `{ ok, url, role }` or `{ ok: false, error }` and shows nothing itself.
- Tests: `app/test/e2e_setup_local.py` (with a mocked GitHub), `app/test/e2e_files_local.py`.
