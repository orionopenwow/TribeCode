# Office: Open Space inside TribeCode

[Open Space](https://github.com/Fantomiald/open-space) by Fantomiald (MIT) is a pixel-art office where several
Claude Code sessions work side by side, each at its own desk. TribeCode can install it and run it on the host's
computer, next to the tribe. It is optional: nothing is downloaded until the host presses Install.

## Where
Home › **Agent fleet** › **Office** (at the top), or a project's Agents Hub. One switch turns it on and off.

## How it works
- **Install** clones the repo into `~/TribeCode-Tools/open-space` at a commit we read through (`7b661d6`), runs
  `npm ci --ignore-scripts` (no install scripts run) and builds it. It needs Git and Node 22.18 or newer on the host.
- **Start and open** runs it on port **4850** (TribeCode's Working server already uses 4848). Its desks get every
  project repo in the tribe (`OFFICE_ROOTS`). TribeCode opens Open Space's pairing link in your own browser, which
  signs that browser in once.
- **Stop** stops it. Quitting TribeCode stops it too.
- Open Space only answers on 127.0.0.1 and refuses to be shown inside another page, so it opens in its own browser
  window, on the host computer. Friends see whether the office is open; they can't drive it.
- Its data (the pairing secret, sessions) stays in `~/.open-space`, the same place a standalone Open Space uses.
- The office needs Claude Code on the host; the Office card says when it is missing.

## Server
`server/openspace.js`. Routes (host only, from this computer only): `GET /api/openspace`,
`POST /api/openspace/install | start | stop | open`. Test: `app/test/e2e_openspace.py` (a local fake of the repo).
Environment for tests: `TRIBE_OPENSPACE_REPO`, `_REF`, `_DIR`, `_DATA`, `_PORT`.

To move to a newer Open Space, read its changes, then bump `REF` in `server/openspace.js`.
