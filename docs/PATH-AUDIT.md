# Path audit: a folder, then friends, then GitHub (pass 4)

2026-11-16, branch `feat/p4-path` from v0.39.0 (46dbf314). A beginner's walk from nothing to a public address, for a
website (the website designer) and a phone app (App Creator): a fresh tribe folder, no GitHub, no friends, no internet;
then one friend; then GitHub. Walked through the HTTP API and in a real browser at 1440 and 390 px.
GitHub was a stand-in throughout (`app/test/ghmock.py` and a local bare git repository): the sandbox cannot write to
GitHub. The path is described in `docs/WHERE-IT-LIVES.md`; the test is `app/test/e2e_path_journey.py`.

Severity: **high** loses work or ends the path; **medium** confuses or hides something; **low** polish.

## What was broken

| # | Stage | What | Severity | Now |
|---|---|---|---|---|
| 1 | Folder | A designed website or app existed only as one JSON file inside the tribe's hidden `.tribe/` folder. Real files appeared only after "Publish to the project" (third item in the designer's download menu) or an Export | high | Fixed: `server/designfiles.js` writes `site/` and `app-web/` into the project folder a moment after every save |
| 2 | Online | Publish › Where it goes, for a project with a designed website and nothing else: "This project has no code repository yet. Set it up first (Code repository › Create)." A dead end, in words the rules ban | high | Fixed: Publish reads the designed website or app from the project folder; the play link too. With nothing made yet it says "Nothing to put online yet. Make a website or an app in Design first." |
| 3 | Friends | App Creator with the tribe unreachable: "Not saved: offline" once, no second try, nothing kept. Closing the editor lost the change | high | Fixed: kept on the device, tried again every 5 s, sent when the tribe is back, and sent on the next open if the editor was closed. Two versions: Keep mine / Keep theirs |
| 4 | Friends | App Creator opened while the tribe was unreachable showed the device's own no-tribe design (or a blank app) as if it were the tribe's app | high | Fixed: it says "Can't reach the tribe right now. Your app is safe there" and does not open |
| 5 | Folder | Export "Save into the project" and the Expo export deleted the whole `app-web/` or `app-expo/` folder each time, with anything a person had put there (notes, `node_modules`) and no question | high | Fixed: only files TribeCode wrote and nobody touched are ever removed |
| 6 | Folder | The website was written to `<tribe>/projects/<id>/site`. As soon as the project got a code folder (the app export makes one) the website stayed behind and Publish saw only the app | medium | Fixed: the files follow the project to its code folder or chosen folder; our untouched files leave the old place |
| 7 | Online | A project with a website and an app could publish only the one the web-folder check happened to pick, and both would have used the same page name | medium | Fixed: "What goes online?" in Publish; the app keeps its own link (`<name>-app`) |
| 8 | Folder | A page edited by hand in `site/` was written over by the next "Publish to the project" | medium | Fixed: the write is held and the editor asks. "Use the design" copies theirs to `.my-changes/` first; "Keep my files" stops the designer writing |
| 9 | Folder | Esc with a sheet open over App Creator closed App Creator (or dropped the selection) and left the sheet open | medium | Fixed in `appcreator.js` |
| 10 | Online | Publish opened from inside App Creator appeared behind the full-screen editor and could not be clicked | medium | Fixed: Publish leaves App Creator first (it saves on close) |
| 11 | Folder | A website or app made with no tribe stayed behind in the browser when the person started a tribe | medium | Fixed: it comes along into a project that has none yet, and the editor says so |
| 12 | Folder | With the tribe's own copy of a design gone (a deleted `.tribe/` file), the design was gone | medium | Fixed: it is read back from `site/site.json` or `app-web/app-design.json` |
| 13 | All | Two things called publish in the website designer (the menu item and the Publish sheet); "Save into the project" in App Creator did what saving already does | low | "Publish to the project" is gone; "Where it lives" takes its place. The App Creator item is "Try it in the live preview" |
| 14 | All | No one place said where a design is, who can reach it, and how it gets online | low | The Where it lives sheet |

Checked and fine: a spectator can look at where the files are but cannot answer the "changed outside" question, write
the files or change the design; a shortcut (symlink) inside `site/` is never written through; "Open the folder" refuses
a request that came through a proxy; the token is in no response, no log line and no file of the project; the server
restarting keeps every design; a friend's change lands in the folder; the website designer already kept unsent changes.

## Left, and why

| What | Why it is left |
|---|---|
| The Code place still says "repository", "Ship", "Pull" and "repo" (`livingrepo.js`, `versions.js`, `folders.js`) | It is the name of a whole place and its buttons; renaming it is a product decision (also #14 in `docs/PASS3-AUDIT.md`). The path above never needs those screens |
| With no tribe at all (a browser with nothing set up) a design lives in that browser only | A browser cannot write a folder by itself. Chrome and Edge could with the File System Access API; not built |
| A file write still waiting (0.7 s) when the server is killed | The design itself is saved at once. The files catch up the next time anyone opens the editor, the sheet or Publish |
| Server messages (the 403 lines, the "changed outside" file names) are English | The known gap for server text |
| Flint does not know "where does my site live" yet; no quick guide points at the sheet | Flint and lessons belong to other work in this pass. The sheet has stable hooks: `TribeWhere.open(pid)` |
| "Put it on your phone" and Where it lives are two sheets | They answer different questions (an icon on a phone; where the files are). Each links to Publish, which links to both |

## Needs a real machine or the real GitHub

- **Open the folder** on Windows (`explorer.exe`), Mac (`open`) and Linux (`xdg-open`): the same call the Desktop
  export has used since v0.2, but this button was only run with reveal turned off.
- **Double-click `index.html`** was checked in Chrome from disk. Safari and Firefox from disk were not. The phone app's
  offline copy (its service worker) does not start from a double-click, by the browser's own rule; the app itself runs.
- **GitHub for real**: the short-code sign-in, the first publish, turning Pages on, the minute GitHub takes before
  the link opens, and publishing the website and the app as two projects in one account.
- **A second computer**: a friend on another network editing while the first computer sleeps and wakes.
- **A project folder inside a synced drive** (iCloud, OneDrive, Dropbox): their own conflict copies were not tried.

## Features to suggest

1. **Pick the folder at the start.** A new project could offer "Keep it in Documents/<name>" in one tap, so the files
   are somewhere a person already looks, not under the tribe folder.
2. **Bring a hand-edited page back into the designer.** Today the choice is the design or their files. Reading simple
   edits (words, links) back in would remove the choice for the common case.
3. **One row in Publish for the code too.** "Send the whole folder to GitHub" lives in the Code place under other
   words. A plain row beside "A link that stays up" would finish the path for people who want the files there as well.
4. **A browser-only folder** with the File System Access API where the browser has it.
