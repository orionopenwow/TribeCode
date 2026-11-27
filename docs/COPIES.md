# Every friend keeps a copy (p12)

Camp asked for it to be "user friendly to push and pull from each other, understanding auto-GitHub". In the app those
words never show up. People see **Send my changes**, **Get the latest**, **backed up** and **saved versions**.

## What each person has

- **A copy on each device.** Each member's TribeCode keeps a copy of what they can see in the tribe: the projects list,
  the website and app designs, docs, tasks and chat. It lives in the browser's storage for that tribe's address
  (`tribecode.copy:*`). It never holds sign-ins, keys, tokens, invites, or anyone's private messages. `app/ui/copies.js`
  keeps a list of what may be copied and what never is.
- **Live while connected.** The editors already follow each other live over the websocket. Each successful read
  refreshes the copy (`TribeClient.api` → `TribeCopies.keep`).
- **Read and change offline.** When the computer that runs the tribe can't be reached, reads come from the copy. App
  Creator and the website designer open from it. Edits wait on the device: messages and tasks in the outbox, designs as
  "saved on this device" drafts.
- **Catches up on reconnect.** When the connection comes back, what waited is sent and the latest is fetched. The copy is
  also refreshed every 10 minutes while connected.

## When both sides changed something

Each design remembers the last few versions it started from (`setBase`/`getBase`, by `rev`). When a save meets a newer
version, `merge3(base, mine, theirs)` puts the two together:

- objects are merged key by key;
- lists of things with an `id` are merged by id: pages, sections, screens, blocks and widgets. New blocks from both
  sides are kept, blocks removed on one side stay removed, and a reordered list keeps the newer order;
- different blocks are put together by themselves, and a quiet line says so;
- the same block changed on both sides is the only case where a person chooses: **Two people changed this** · Keep mine /
  Keep theirs / Keep both. Keep both keeps their block and puts a copy of yours right after it. One field outside any
  block offers only Keep mine / Keep theirs. "Decide later" changes nothing.

Where this runs:
- App Creator: opening with changes that couldn't be sent, a save that meets a newer version, and changes sent with App
  Creator closed.
- The website designer: a save that meets a newer version, and opening with a draft made away from an older version.
- With no known starting version, the old whole-design choice is still there as a fallback.

## Send my changes · Get the latest

Click the status line under your name (`tribestatus.js`). The card has a **Your copy** section:
- "3 changes to send", or "Up to date · 2 min ago";
- **Send my changes** and **Get the latest**. Both happen by themselves; the buttons do it now;
- **Who sent what**: the last saves that reached the tribe, folded by person and thing ("Camp sent 4 changes to the
  website"). The server keeps it in `.tribe/copies-log.json`, read at `GET /api/copies/log`, limited to projects the
  reader can see. It holds names and what changed, never content.

The status line adds "· 3 to send" while changes wait. All of this works the same for a friend's copy of the host's tribe
and for two computers of the same person: each device is simply another member device with its own copy.

## The direct path between friends

- **Ready now:** the tribe server is the meeting point. Over Tailscale or the same Wi-Fi, a friend's TribeCode talks
  straight to the host's computer, with no cloud in between (see ONLINE-MODES.md, "Run your own server"). That is the
  direct friend-to-friend path today, and the copy makes it work when that computer sleeps.
- **Later:** copies flowing friend to friend over WebRTC with no tribe server at all. It would need a signalling step,
  NAT traversal (STUN/TURN), and the same merge run on both ends. Calls already use WebRTC; data does not. Not built.

## Backup on GitHub

One card, in **Agents & office › Get set up** and in **Where it lives** (`TribeGitHubConnect.backup`):
- the sentence "every change is saved to your GitHub, so nothing is lost and friends can get the latest even when your
  computer is off";
- **On/Off**. On means `mode: auto, trigger: save`: a moment after each save, the design files and the project folder go
  to GitHub. The design files written by `designfiles.js` now start a backup too;
- "Backed up a minute ago" and **See it on GitHub**;
- **What is backed up**: the website and app designs as real files (`site/site.json`, `app-web/app-design.json` and the
  pages), plus the project folder's code and docs. **Never** backed up: keys, passwords and sign-ins, `.tribe/`, or
  anyone's private messages. `server/sync.js` refuses `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`,
  `.npmrc` and `secrets/`, whatever a `.gitignore` says, and `.tribe/` is never staged;
- **Get the latest from GitHub**, for a friend when nobody's computer is on. It reads `site/site.json` and
  `app-web/app-design.json` from the backup through GitHub's contents API, puts them in this device's copy, and the
  editors open them. That works for a public backup. For a private one it says so plainly: there is no token in the
  browser, so the friend opens it on github.com with their own sign-in.
- With the backup on, the save line where you work says "Saved · a copy goes to GitHub". It is a quiet line, not a popup.

## What the owner sets up on GitHub

The token path works today with nothing to set up: someone pastes a token, or the host already has the `gh` CLI signed
in. For one-button "Sign in with GitHub" (the device flow):

1. Create an OAuth App under the TribeCode GitHub account or org (Settings › Developer settings › OAuth Apps › New),
   with homepage `https://orionopenwow.github.io/TribeCode/` and callback `http://localhost:4747`.
2. Tick **Enable Device Flow**.
3. Put its Client ID (not a secret) in `BUILTIN_CLIENT_ID` in `server/github-auth.js`, or set `TRIBE_GITHUB_CLIENT_ID`
   on a host. Until then the device flow stays behind that setting, and the token path is the fallback.

More detail in GITHUB-AND-FOLDERS.md and GITHUB-CONNECT.md.

## Tested

`app/test/e2e_copies_sync.py` covers:
- two members, with the friend offline: changes to different blocks are put together, and the same block offers the
  choice, where Keep both keeps the two;
- the counts and buttons, and who sent what;
- the backup turned on from its card, with a local bare git repo standing in for GitHub (`TRIBE_GITHUB_GIT`). It records
  the design files, with no `.env`, no `.tribe/` and no key;
- the host turned off: the friend gets the latest from the backup. Its "api.github.com" is answered in the page from that
  bare repo.

GitHub's real API is never called.
