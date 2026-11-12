# Developer tools

Small scripts for the whole loop: check the machine, seed a tribe to click around in, test everything, soak the server,
clean up, refresh screenshots, get a release ready. All plain Node or Python, no new dependencies. They live in
`scripts/dev/` and run as `npm run dev:<name>` (pass options after `--`, e.g. `npm run dev:loop -- --loops 3`).

| Command | What it does | Time |
|---|---|---|
| `npm run dev:doctor` | Is this machine ready? Node 20+, Python + Playwright, Chrome at `/usr/bin/google-chrome`, git identity, the four version files agree, the Tauri config is valid, ports free, leftover test data | 5 s |
| `npm run dev:seed` | A realistic tribe on a throwaway folder (port 4952): two projects with lanes, a plan, tasks, docs, a vote, an agent, plus two friends with chat, a DM and reactions. Prints a sign-in link per person and the Claude Code command | 10 s, then runs |
| `npm run dev:test` | The whole `npm test` suite, 4 suites at a time, each on its own ports. Failures re-run once alone (flaky vs real). Prints a table and writes [TEST-REPORT.md](TEST-REPORT.md) | ~10 min |
| `npm run dev:loop` | Reset/restart soak test of the server (below) | 15 s |
| `npm run dev:reset` | Cleans test leftovers. Dry run unless you add `--yes` | 2 s |
| `npm run dev:shots` | Regenerates every screenshot the README, the website and the docs use, and keeps only the ones that really changed | ~8 min |
| `npm run dev:release` | Gets a release ready without pushing: checks the CHANGELOG, bumps versions, runs the checks, prints the git commands | ~2 min |
| `node scripts/dev/clean-slate.js` | A clean TribeCode for editing small things before a release: own port, throwaway folder, signed in as a local guest, live reload ([below](#edit-small-things-before-a-release)) | 3 s, then runs |
| `node scripts/flint-runthrough.js` | Watch Flint build an app, a site and a game with his normal commands, then save proof-of-work ZIPs ([below](#watch-flint-build)) | ~1 min |
| `npm run dev:infographic` | Renders [infographic/index.html](infographic/index.html) to `infographic/tribecode-infographic.png` at 2x | 5 s |

## dev:doctor

Red rows exit with code 1; yellow rows are warnings (for example a server already on 4747, or screenshots changed by a
test run). Optional tools (cloudflared, Tailscale, the GitHub CLI) are listed as info.

## dev:seed

```
npm run dev:seed                        # fresh /tmp/tribe-seed-* folder, port 4952
npm run dev:seed -- --port 4953 --dir /tmp/tribe-seed-mine   # reuse a folder: seeds once, prints the same links
npm run dev:seed -- --no-serve          # seed, print, stop
```

Open each printed link in its own browser profile or private window (Orion is the host, Vega a laptop friend, Lyra a
phone friend; use devtools device mode at 390px for the phone). GitHub is off (`TRIBE_NO_GH`), so nothing leaves the
machine. Ctrl+C stops the server; the folder stays until `dev:reset`.

## dev:test

```
npm run dev:test                        # everything, writes docs/TEST-REPORT.md
npm run dev:test -- --jobs 3            # 2-core machines: 3 is steadier than 4
npm run dev:test -- --only e2e_chat,e2e_nav      # a subset (no report)
npm run dev:test -- --offset 7000       # a second run on the same machine at the same time
npm run dev:test -- --list
```

Worker *n* uses `TRIBE_PORT_OFFSET = offset + 200·n`, so suites never share a port. Logs go to
`/tmp/tribe-devtest-<time>/<suite>.log`. Screenshots and reports the suites rewrite under `docs/` are restored at the
end (unless `--keep-shots`), so a test run leaves `git status` clean. "flaky" means the suite failed in the parallel run
and passed alone; on a busy 2-core machine a few Chrome suites time out under load, so look at a flaky suite's log before
ignoring it.

## dev:loop

```
npm run dev:loop                        # 10 loops x 3 restarts on port 4951
npm run dev:loop -- --loops 3 --restarts 5 --verbose --keep
```

Each loop starts the server on a fresh temp tribe folder, then: bootstrap a host, create two projects, invite and join
a friend, use a one-time guest pass (and check it is used up), post chat, a DM, a reaction, a task and a doc. Then it
restarts the server on the same folder again and again, alternating a clean stop (SIGTERM, what the desktop app's
**Host on this computer** switch does) and a crash (SIGKILL), adding more data each time, and checks:

- everything is still there: members, projects, chat, reactions, DMs, tasks, docs; nothing duplicated
- the host signs back in from this computer (`/api/host/reclaim`, the desktop app after losing its key), the old key is
  refused, and reclaim from another site is refused
- the friend's key still works, the friend still only sees their project, the guest can't read others' DMs
- before each crash, 25 concurrent messages are all kept, and messages still in flight when the server is killed never
  leave a broken line: every JSONL line and JSON file still parses, no half-written `.tmp` files
- a restart adds no files and under 64 KB, the folder stays small, server memory stays under 350 MB
- the port is free after every stop and at the end (no leaked server)
- a `members.json` broken by hand is copied aside (`members.json.broken-*`) before anything overwrites it
- reset: a wiped folder is a brand-new tribe, old keys are refused, it can be bootstrapped again

A short run (`--loops 2 --restarts 2`) is part of `npm test`.

## dev:reset

```
npm run dev:reset                       # what it would clean (touches nothing)
npm run dev:reset -- --yes              # clean
npm run dev:reset -- --yes --min-age 0  # also leftovers from the last 30 minutes
npm run dev:reset -- --yes --tribe ~/TribeCode-test   # also reset that tribe folder (moved aside, not deleted)
```

It only touches dev and test state:

1. temp tribes in the temp folder (`/tmp/tribe-*`, and `/tmp/tmp*` folders that hold a `.tribe/`), test logs and
   failure screenshots, skipping anything changed in the last 30 minutes or still used by a running process (parallel
   test runs are safe)
2. `docs/screenshots` changes made by test runs
3. git worktrees under `.claude/worktrees` whose branch is merged into `dev`, with no uncommitted changes, not locked
   and unused for 2 hours (`git worktree remove`), and branches merged into `dev` (`git branch -d`, never `-D`).
   `dev`, `main` and the current branch are never deleted
4. `node_modules/.cache` folders in the checkout

A real tribe folder is only touched with `--tribe <folder>`, it must contain `.tribe/`, and it is renamed to
`<folder>.reset-<time>`, never deleted. Stop its server first.

## dev:shots

```
npm run dev:shots                       # everything below
npm run dev:shots -- --readme-only      # scripts/readme-shots.py only: docs/screenshots/readme-*.png + site/assets/og-image.png
npm run dev:shots -- --docs-only        # e2e_website --shots (docs/WEBSITE.md), ui_smoke --shots, e2e_tribe --shots
npm run dev:shots -- --threshold 0.5    # percent of pixels that must change to keep a new PNG
python3 scripts/readme-shots.py --only dashboard,phone-doc   # just some README screens (names without readme-)
```

`scripts/readme-shots.py` starts a throwaway server (temp folder, a mock GitHub and a mock local model) and seeds a
realistic tribe through the API and MCP: Orion hosting, Maya and Jay, Orion's Claude and Maya's Claude, Pixel Quest
(the starter game, so Preview runs a real game) and Lantern Run, the vision, chat with replies, reactions, a picture,
a voice note, agent gists, a suggested vote and a proposal, tasks, docs, a personal note, uploaded files, Workshop
items and the Secretary. Then it captures every README screen in the default Campfire theme: desktop at 1440×900
(2× pixels, stored 1600px wide) and phones at 390×844 (3×, stored 780px wide), plus the offline demo tribe in a fresh
browser. PNGs are quantized to 256 colours. The Dashboard shot also becomes the website's social card
(`site/assets/og-image.png`, 1200×630). A screen that fails is retried once and then reported; set
`SHOTS_DEBUG=<folder>` to keep a screenshot of the page at the moment it failed.

Adding a README screen: add a `shoot(page, "<name>", prep)` call in `run()` (prep opens the screen), reference
`docs/screenshots/readme-<name>.png` in README.md, and run it with `--only <name>`.

Every run uses a fixed time zone (UTC), locale and a throwaway seeded tribe. Afterwards each regenerated image is
compared with the committed one; when less than the threshold of its pixels moved (a clock, a caret, anti-aliasing),
the committed file is restored. `git status` then shows only screens that really changed.

## dev:release

```
npm run dev:release                     # next patch version
npm run dev:release -- 0.9.0
npm run dev:release -- --check          # the checklist only, changes nothing
npm run dev:release -- --skip-tests
```

1. The CHANGELOG must already have `## v<new>` with a **Phones** line (it stops and shows the template otherwise).
2. Bumps `package.json`, `app/package.json`, `app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml` and the
   service worker cache name in `app/ui/sw.js` (so phones load the new shell).
3. Runs `bundle_test`, the Tauri config check and a smoke subset (ot, security, ui_smoke, smoke_live, guide, updater).
4. Prints the git commands to commit, merge to `dev` and `main` and push. Nothing is pushed or tagged: CI publishes the
   release when the version in `tauri.conf.json` changes on `main`.

## The Windows reset

`scripts/desktop/Tools/Reset-Everything.bat` (on the user's Desktop as Tools\Reset-Everything.bat) stops TribeCode,
removes the old app settings and installers, and removes an old v0.1 code checkout in `%USERPROFILE%\TribeCode` only
when that folder holds no tribe data (`.tribe\`, `projects\` or `tribe.json`); that folder is also the default tribe
folder, so a checkout that was used as a tribe is kept.

## Edit small things before a release

A clean-slate TribeCode that is completely local and forgets everything between runs: the place to try a small change
before it goes into `dev`.

```
node scripts/dev/clean-slate.js                # wipes ~/TribeCode-Dev, port 4858, opens the browser
node scripts/dev/clean-slate.js --keep         # keep last run's folder and this browser's guest storage
node scripts/dev/clean-slate.js --port 4860 --dir /tmp/tc-dev --no-open
```

Windows: double-click `Tools\Clean-Slate-Dev.bat`. macOS: `Tools/Clean-Slate-Dev.command` (Finder, or a terminal for
`--keep`).

- **Its own port and folder.** Port 4858 (not 4747, not the Working lane's 4848), folder `~/TribeCode-Dev`, listening on
  127.0.0.1 only. GitHub and tunnel downloads are off (`TRIBE_NO_GH`, `TRIBE_NO_DOWNLOAD`), so nothing leaves the computer.
- **Signed in as a local guest, no tribe yet.** The page opens as `/?devslate=<run id>` (`app/ui/devslate.js`, loaded before
  `store.js`): it signs in as the TEST **Guest** account from `app/ui/accounts.js` (no tribe key, no server member) and
  skips the intro. Start a tribe from there like a new user would ("Start your first project", or ask Flint "start a
  tribe called …").
- **Nothing persists.** Each run wipes the folder and gets a new run id; the new id clears this browser's TribeCode
  storage for that address (local and session storage, the shell cache, the service worker). `--keep` reuses both. The
  script only ever wipes a folder it made (it has a `.tribecode-dev` marker) or an empty one, never `~/TribeCode`.
- **Live reload.** The server runs with `--dev`: saving a file in `app/ui` reloads open tabs (over the socket when signed in;
  a guest with no tribe polls `GET /api/dev/stamp`), and saving one in `server/` restarts the server.

Test: `app/test/e2e_clean_slate.py`.

## Watch Flint build

```
node scripts/flint-runthrough.js               # fresh /tmp folder, port 4859, opens the app with the run-through playing
node scripts/flint-runthrough.js --dir ~/flint-demo
node scripts/flint-runthrough.js --headless    # no window: runs app/test/e2e_flint_runthrough.py, prints the ZIP paths
```

In the app: Help (?) › **Watch Flint build**, or ask Flint "watch flint build". Flint types 17 of his normal commands
(tribe, project, vision, company, tasks, a doc, a website and an edit, a game, a design, chat, a proposal and its
approval, a standup, a summary, the presentation, the proof), with a caption for each, and saves
`<project>-proof.zip` and `tribe-<name>-proof.zip` in `<tribe folder>/exports/` (layout in
[FLINT-TIERS.md](FLINT-TIERS.md#watch-flint-build-and-proof-of-work)). No AI is needed; with one on, the captions are
refined and say so.
