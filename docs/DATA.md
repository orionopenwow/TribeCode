# Where your tribe's data lives

Everything a tribe makes lives in **one folder on the host's computer**: the *tribe folder*. TribeCode has no cloud database. If you have the folder, you have the tribe.

- Default location: `~/TribeCode` (Windows `C:\Users\<you>\TribeCode`). The desktop app's Settings → Folder, or `npm start -- --dir <folder>`, picks another one.
- Formats are plain text wherever possible: Markdown with a small front-matter block, JSON, and JSONL (one JSON object per line). You can read every file in a text editor.
- Friends' phones and computers keep almost nothing. A browser stores only its own settings and sign-in token in `localStorage` (`tribecode.settings.v1`), a remembered project and unsent composer drafts.

This was verified end to end by `app/test/e2e_friend_flow.py`. A friend joins from a phone, sends text, a reply, a reaction, an image, a voice note, a file, a doc and a vote. The test finds each one on disk, restarts the server and checks that everything is still there.

## Map of the tribe folder

| Path | What | Format |
|---|---|---|
| `.tribe/tribe.json` | Tribe name, created date | JSON |
| `.tribe/members.json` | People and agents: id, name, color, role, projects. Sign-in tokens appear **only as SHA-256 hashes** (`tokenHash`) | JSON |
| `.tribe/devices.json` | Phone device links (`/m/<key>/`): key hash and token hashes per device. Revoking a device deletes it | JSON |
| `.tribe/invites.json` | Invite codes, expiry, uses, project | JSON |
| `.tribe/projects.json` | Projects: id, name, emoji, color, chat channel, repo path, members and roles | JSON |
| `.tribe/secrets/<member>.json` | Per-member GitHub token (file mode 0600). Never sent to browsers, never in backups | JSON |
| `.tribe/notify.json` | Notification settings per person: ntfy topic, Web Push subscriptions, quiet hours, the VAPID key pair | JSON |
| `.tribe/inbox/<member>.jsonl` | Each person's notification inbox (trimmed to the newest few hundred) | JSONL |
| `.tribe/flow/<project>.json`, `.gists.jsonl` | One-click project flow: roles, notes, plan, gists | JSON / JSONL |
| `.tribe/people/<project>.jsonl` | Agent prompt/context log for the person view | JSONL |
| `.tribe/coord.json`, `votes-open.json`, `agent-read.json` | Coordination state, open votes, agent read receipts | JSON |
| `chat/general.jsonl` | The **first** project's chat | JSONL, one message per line |
| `chat/p-<project>.jsonl` | Every other project's chat | JSONL |
| `chat/dm-<idA>-<idB>.jsonl` | Direct messages (also the private chat with your own Claude) | JSONL |
| `chat/<channel>.pins.json` | Pinned message ids | JSON |
| `chat/media/<id>.png/.jpg/.webp/.gif` | Images sent in chat | binary |
| `chat/media/<id>.webm/.ogg/.m4a/.mp3` | Voice notes (the transcript is in the message line) | binary |
| `chat/media/<id>.bin` | Any other shared file (PDF, zip…). The original name is in the message line, and it is always served as a download | binary |
| `tasks/<id>.md` | One task per file: front-matter (`status`, `assignee`, `due`, `project`…) plus the description | Markdown |
| `docs/<slug>.md`, `docs/.history/<slug>/NNNNNN.md` | Docs and their saved versions (front-matter carries `project`) | Markdown |
| `proposals/`, `decisions/`, `calendar/`, `bugs/` | Board proposals, the decision log, events and reminders, bug reports | Markdown |
| `brain/` | Standups, notes dropped for the local brain | Markdown |
| `projects/<project>/` | Per-project VISION.md, TRIBE_CONTEXT.md, milestones, repo state (every project except the first, which uses the root) | Markdown / JSON |
| `workspaces/<project>/` | Projects made with **+ → Create**: a real git repo (README, VISION, CLAUDE.md, PLAN.md, role folders), pushed to GitHub when connected | git |
| `workshop/` | The Workshop library: `items/<id>/workshop.json` and files, `usage.json` | JSON + files |
| `templates/` | Doc templates | Markdown |

Projects that started from an existing folder or a cloned repo keep their code **where it already is**. The tribe folder stores only the path, in `projects.json`.

A chat message line looks like this:
```json
{"id":"Lnr4vONgn21E","at":"2026-11-07T04:24:04.956Z","by":"maya-5Sg1","text":"hey team","reactions":{"🔥":["maya-5Sg1"]}}
```
Optional fields:
- `replyTo` `{id, by, text}`
- `media` `{kind: voice|image|file, file, mime, size, dur, wave, name}`
- `fwd`, `vote`, `gist`, `approval`
- `edited`
- `deleted`: the text is wiped and the line stays

## What persists

| Event | What survives |
|---|---|
| Server restart (closing the app, a crash, a reboot) | Everything above. Members sign in again with their saved token, phone device links keep working, and agent keys keep working. Live doc edits still inside the 1.5-second save window are flushed on Ctrl+C / SIGTERM |
| App update ("Restart to update") | Everything. Updates replace the program, never the tribe folder |
| Moving to a new computer | Everything, if you move the folder (see below). Each friend's browser keeps its token, but the address changes: send them a fresh invite or device link if the old link pointed at the old computer |
| Lost in a restart | Who is online, huddle seats, typing indicators, the unread count in the title. These are live state only |

## Back up, restore, move

**Back up (one click).** Settings → **Download backup** (host only) streams the whole tribe folder as `<tribe>-backup-<date>.tar.gz`. `GET /api/backup` with the host token does the same. The backup leaves out `.tribe/secrets/` (GitHub tokens), `node_modules` and temp files. Members and devices are in it, but only as hashes.

**Back up (by hand).** Copy the tribe folder while TribeCode is closed. You can also use git: the folder's `.gitignore` already keeps `.tribe/` out of commits.

**Restore or move.**
1. Close TribeCode on the old computer.
2. Extract the archive, or copy the folder: `tar -xzf crew-backup-2026-11-07.tar.gz`. On Windows, Explorer and 7-Zip open .tar.gz too.
3. Start TribeCode on that folder. In the desktop app, use Settings → Folder and restart. From a terminal, run `npm start -- --dir ./crew`.
4. Reconnect GitHub, because secrets are not in backups. Projects made with **+ → Create** live in `workspaces/` with their git history. Projects that pointed at a folder elsewhere need that folder at the same path, or a new path set in the project.
5. Friends keep their accounts. If the address changed, send a new invite link. People who are already members get the project added to their account, and no second account is created.

## Privacy notes

- No plaintext tokens or device keys are stored anywhere in the tribe folder. The smoke test scans every file for them.
- Agent keys work like member tokens: hashed, revocable ("Disconnect"), and gone at once when revoked.
- Chat media is served only to members who can read that channel. Files are always downloads, never rendered pages.
