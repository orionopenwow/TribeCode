# Where it lives: a folder, your friends, online

One path for a website (the website designer) and a phone app (App Creator), in three steps. Each step works without
the next one. The app shows it as one sheet, **Where it lives** (`app/ui/wherelives.js`), reached from the website
designer's download menu, App Creator's Export menu and Publish.

| Step | What is true | The one button |
|---|---|---|
| 1 In a folder | The design is real files in the project's folder, written a moment after every change | Open the folder |
| 2 With your friends | One link lets friends in. Everyone changes the same website and app, live, by their role | Invite a friend |
| 3 Online | A public address on the person's own GitHub account. It stays up when every computer is off | Put it online |

The words stay true for a tribe kept on a computer and for one kept on a free cloud spot: the sheet says "where this
tribe is kept", never "on your friend's computer".

## 1. In a folder

`server/designfiles.js` writes each design out as files, with no button to press:

- `<project folder>/site/`: `index.html` and the other pages, `assets/`, `fonts/`, `README.md`, and `site.json` (the design).
- `<project folder>/app-web/`: the phone web app (`index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`,
  `fonts/`) and `app-design.json` (the design).

The project folder is the folder the project was given (Files › Folder), else its code folder, else
`<tribe folder>/projects/<id>/`. When a project gets a folder later, the files follow it there on the next look or save,
and our untouched files leave the old place.

Rules the writer keeps:

- **Never silently over a person's own edits.** A list of what was written (path and hash) is kept in
  `.tribe/designfiles/<project>.json`. A file on disk that is neither what TribeCode wrote last nor what it is about to
  write was changed outside. Nothing is written then. The editors ask:
  - **Use the design**: their versions are first copied to `<project folder>/.my-changes/<time>/`, then the design is written.
  - **Keep my files**: the designer stops writing that folder. Publishing uses their files. "Write the design again" in
    the sheet turns it back on (and copies theirs aside first).
- **Only our own files are ever removed**, and only when untouched. A file a person added to `site/` or `app-web/`
  stays. Export no longer empties `app-web/` or `app-expo/`.
- **No path leaves the folder** and no write goes through a shortcut (symlink).
- **The folder is the way back.** With no saved design in the tribe's own data, `site/site.json` or
  `app-web/app-design.json` is read. Clearing the browser's storage loses nothing: the design is kept where the tribe is.
- **Open the folder** answers only on the computer that keeps the tribe (`isLocal`); anyone else is told where it is.

With no tribe at all (the app opened in a browser with nothing set up) a design is kept in that browser only, and the
sheet says so. When that person starts or joins a tribe, the design they made comes along into a project that has none yet.

HTTP: `GET /api/projects/:id/design-files`, `POST …/design-files/open`, `…/resolve { kind, use }`, `…/write { kind }`.
Websocket: `{ type: 'design-files', project, kind, held }`. Setting: `TRIBE_DESIGNFILES_MS` (the wait after a save, 700).

## 2. With your friends

Nothing new to learn: the invite link is the one in Invite. What this pass checked and fixed for the two editors:

- A friend who joins sees the same website and app and changes them by their role (`site.edit`, `app.edit`; others
  suggest, see `docs/ROLES-AND-PERMISSIONS.md` §5). The files in the folder follow whoever made the change.
- **When the tribe cannot be reached** both editors say so in the saved line ("Not saved yet: can't reach the tribe.
  Kept on this device"), keep the change on the device, try again by themselves, and send it when the tribe is back.
  App Creator did not do this before pass 4: it showed "Not saved: offline" once and the change was lost on close.
- A change kept on the device from a closed editor is sent the next time the editor opens. If someone changed the app
  in between, the person chooses **Keep mine** or **Keep theirs**.
- App Creator never opens a blank app, or the design kept on the device from before the tribe, in place of the tribe's
  app when the tribe cannot be reached. It says "Can't reach the tribe right now" instead.

## 3. Online

Publish › Where it goes (`server/publishreal.js`, `docs/PUBLISH.md`) now works with no code folder: it reads the
designed website or app straight from the project folder.

- **What goes online?** appears when the project has both a website and a phone app. Each keeps its own record and
  its own link (`<name>` and `<name>-app`), so one never replaces the other.
- **A link that stays up** publishes to the person's own GitHub account (GitHub Pages), shows the public address, and
  **Update it** publishes the newest design: pending file writes are finished first.
- The play link (Publish's first row) also works for a designed website or app with no code folder.
- Free limits and their sources are in `docs/HOMESCREEN-PATH.md` (Put it on your phone shows them in the app).
- The token is the member's own, kept on the computer that keeps the tribe. It is in no response, log or project file.

Saved versions and GitHub for the whole folder already existed and are part of the path:

- **Saved versions** (`server/versions.js`): in a folder with git, a saved version is a real commit; a plain folder
  gets a private history. Restore is always a new version.
- **GitHub as a copy of the folder** (`server/sync.js`): send the folder to a project on GitHub, and bring back
  changes a friend made there. A change that comes back onto a file the designer writes is treated like any outside
  edit: held, and the person chooses.

## Test

`app/test/e2e_path_journey.py` walks all of it once for a website and an app on a fresh folder. GitHub is a stand-in
(`app/test/ghmock.py` and a local bare git repository). What it found and what is left: `docs/PATH-AUDIT.md`.
