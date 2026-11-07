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
| `npm run dev:shots` | Regenerates the README, website and docs screenshots and keeps only the ones that really changed | ~5 min |
| `npm run dev:release` | Gets a release ready without pushing: checks the CHANGELOG, bumps versions, runs the checks, prints the git commands | ~2 min |
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
npm run dev:shots                       # README + website + docs screenshots
npm run dev:shots -- --readme-only      # scripts/readme-shots.py only
npm run dev:shots -- --docs-only        # ui_smoke --shots and e2e_tribe --shots only
npm run dev:shots -- --threshold 0.5    # percent of pixels that must change to keep a new PNG
```

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
