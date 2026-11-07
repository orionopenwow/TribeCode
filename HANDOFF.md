# TribeCode handoff

Read this to pick up the work in a new session (a new Claude chat, Claude Code, or a person). It is kept current at every milestone, alongside `docs/CONTEXT.md` (mirrored to the project doc "TribeCode-Context": vision, user requests, what's in flight).

Last updated: 2026-11-06, v0.3.1.

## What TribeCode is
A self-hosted "multiplayer vibecoding" app. Friends, each with their own Claude Code agents, build one app together. Everything runs on one friend's computer. The server and web app have zero npm dependencies (plain Node and browser JS), and a Tauri v2 desktop wrapper bundles the server as a sidecar. GitHub holds the code, the releases and a website (Pages).

- Repo: https://github.com/orionopenwow/TribeCode. MIT. `main` = stable/released, `dev` = working lane (feature branches merge into `dev` first; the user tests it with Desktop\TribeCode\Working\Start-Working.bat at :4848, then it's merged to `main` and released).
- Releases: one is published automatically when the version in `app/src-tauri/tauri.conf.json` changes on main. That builds Windows, Apple Silicon Mac and Linux installers plus signed `latest.json`, and the in-app updater picks it up. Bump it in 4 files: `package.json`, `app/package.json`, `app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml`. Add an entry to `CHANGELOG.md`.
- Website: https://orionopenwow.github.io/TribeCode/ (`app/ui` is the site root, marketing lives under `/about/`). Friend links: `go.html#s=<host>&c=<code>`. Demo: `demo.html`.

## Run, test, ship
```
npm start                      # server on :4747, tribe folder ~/TribeCode
npm run live                   # auto-pull + restart + UI live reload (TribeCode-Live-Test.bat on Windows)
npm run invite                 # one-click public invite + QR (TribeCode-Invite-Friend.bat)
node scripts/start-test-project.js   # Pixel Quest test project + project invite + Claude Code command
npm test                       # 15 suites (Python Playwright with /usr/bin/google-chrome, --no-proxy-server)
npm run explore                # click-around smoke + intuitive + core-intent journeys → docs/EXPLORE-REPORT.md (--quick is in npm test)
npm run milestone-report       # previous release vs this checkout → docs/milestones/<version>.md
npm run readme-shots           # docs/screenshots/readme-*.png + site/assets/shots/*.webp from a seeded throwaway tribe
```

Every milestone: `npm run explore`, fix criticals, then readme-shots and release. In full: `npm run explore` (docs/EXPLORE-REPORT.md, docs/EXPLORER.md), fix the critical findings, `npm run milestone-report` (docs/milestones/<version>.md: before | after screens, findings delta, journeys), then `npm run readme-shots`, refresh README.md and the Pages site (`site/`, published at `/about/`), then release.

How to write tests:
- Host pages use `/?skipIntro=1`.
- Phones that join via an invite land on `/m/<key>/` with `#install-sheet`; click `#ins-later`.
- Use the helpers `named(page, name)` and `chat(page)`.
- Use `TRIBE_PORT_OFFSET` to run tests in parallel.
- `TRIBE_NO_DOWNLOAD=1` (set by `npm test`) stops tests from downloading cloudflared.

Branches: push only `dev` and `main` (no feature branches on GitHub, no pull requests; the user's rule). Milestones go dev → main with a version bump.

Pushing from the Claude cloud sandbox:
- If push returns 403, attach the repo with push access (add_repo, access: push) first.
- `git push` prints "This repository moved…" but works. Check it with `git ls-remote origin main`.
- Tag pushes and GitHub API writes are blocked from the sandbox. Releases don't need tags anymore.
- `gh api` reads work. `gh release download` does not (GraphQL); use `gh api -H "Accept: application/octet-stream" repos/.../releases/assets/<id>` instead.
- Commits end with the Co-Authored-By and Claude-Session trailers.

## Map of the code
- `server/index.js` wires everything. Other modules:
  - `projects.js` + `rooms.js` + `workspace.js`: per-project data, folders/repos, branches.
  - `coord.js` + `agentnet.js`: agents panel, ownership, conflicts, hand-offs, reviews, daily plan, the #agents channel, delegation.
  - `notify.js` + `approvals.js` + `webpush.js`: inbox, phone push, one-tap approvals.
  - `chatx.js` + `dm.js` + `voice.js`: chat actions, DMs, voice, captions, meeting notes.
  - `docs.js` + `docsx.js` + `live.js` + `ot.js`: docs and live co-editing.
  - `plan.js`: calendar.
  - `visuals.js`: screenshots.
  - `repo.js` + `context.js` + `integrator.js`: live repo, TRIBE_CONTEXT.md, gated merges.
  - `board.js`: proposals and milestones.
  - `bugs.js`, `brain.js` (Ollama/Qwen), `mcp.js` (Claude Code tools).
  - `askai.js`: `@ai` for people without their own Claude (own Claude → a teammate's Claude by owner policy → local model → board).
  - `share.js`: public https via Tailscale Funnel or cloudflared.
  - `site.js`: GitHub Pages friend links.
  - `devices.js`: phone device links.
- `app/ui`:
  - `shell.js`: project circles, the calm sidebar, breadcrumbs, the right panel.
  - `app.js`: core views; `hostHere` auto-hosts on desktop.
  - `settings.js`: zero-step setup and the Settings page.
  - One JS/CSS pair per feature.
- `app/src-tauri`:
  - `main.rs`: sidecar `host_start`/`host_log`; reuses a server already on the port.
  - `tauri.conf.json`: frameless, resizable window, `deep-link tribecode://`, updater.
- `templates/starter-game`: the Pixel Quest starter.
- `docs/`: DESIGN-SYSTEM, PROJECTS, HOSTING, MOBILE, GAME-STUDIO (game plan), screenshots.

## Design rules (decided by the user, keep them)
- Flat matte "Tactile Matte Developer UI + Editorial Flat Vector": 1px borders, depth only from luminance steps, no glows, blur or gradients.
- Colors: Ember #F26B1D (primary), Teal #38C6B1 (live and agents), Indigo #6C7CFF (peers), canvas #12151A, surface #1B2028, raised #1E242D, border #2A313C. Approve/Deny buttons may use green #3BD16F and rose #FF6F8E.
- Section clarity:
  - Each section has a mono eyebrow and a clear title, with generous spacing on desktop and tight spacing on phones.
  - One hero card per screen.
  - Reading layout for long text (line-height 1.6, ~65 characters per line).
  - The pinned repo is the hero of Docs, with the living notes journal under it.
- Desktop: Discord-style project circles, a calm Claude-app-style sidebar (New, Search, sections, More, Pinned, Recents), and a right panel that becomes a preview. The window is frameless with mac-style traffic lights, a 64px logo and a 40px search.
- Phone:
  - Discord-mobile flow: swipe from the left for the circles and the section list.
  - Outside Chat: no header, and a bottom rack of Chat · Docs · Updates · Tasks (profile in the top bar).
  - In Chat, the icons sit in a compact top bar.
- Simplicity first: zero-step setup (no wizard), sleek and bare UI, no repeated labels.

## State right now
- On main and released (v0.3.1): everything listed in CHANGELOG.md v0.2.0 to v0.3.1.
- In flight (agents; branches may exist as git worktrees under /home/claude in the sandbox):
  - `feat/mobile`: the real app's phone UI. Includes:
    - Discord-mobile panel; bottom rack, moving to the top in Chat; no header; tight spacing
    - the composer: "+" menu, a one-tap recorder with pause/stop/delete, the send arrow
    - Docs hub (repo hero, living notes, files, screenshots)
    - one-tap approvals with a comment
    - Suggested tasks
    - a "Talk to…" picker (my Claude, Qwen brain, my desktop, #agents)
    - motion; profile sheet (add friend, network, DM, ask their Claude); DMs in Chat
    - an in-app-browser escape banner on join/go pages
    - the section-clarity principle written into DESIGN-SYSTEM.md
    - tests in `app/test/e2e_mobile2.py`
    If this branch is lost, rebuild from this list.
  - `feat/demo4`: the demo's phone layout. No header, a richer and more distinct bottom rack, less whitespace.
- The user's machine: Windows, Desktop folder `C:\Users\campw\Desktop\TribeCode` with `Get-Latest-TribeCode.bat`, the installer, `TribeCode-Start-Test-Project.bat` (clones the repo next to itself on first run) and README.txt. Tailscale is installed and signed in. Pages is enabled.

## Next steps (in order)
1. Merge `feat/mobile` (resolve conflicts with shell.js, run the full npm test, look at the screenshots), then `feat/demo4`. Bump to v0.3.2 and refresh the README screenshots and this doc.
2. Walk the user through the test project:
   - Update the app (Restart to update, or `Get-Latest-TribeCode.bat`).
   - Double-click `TribeCode-Start-Test-Project.bat`.
   - Approve Tailscale Funnel once.
   - Text the link.
   - Run the printed `claude mcp add …` command.
   - The friend taps the link, enters a name, taps Join, then Add to Home Screen.
3. Verify on real devices: iPhone Safari join and Home Screen, Web Push, speech, Messenger in-app banner, Tailscale Funnel.
4. Game Studio MVP (docs/GAME-STUDIO.md).
5. Native iOS via Tauri + TestFlight (needs a Mac). Intel Mac builds. A TURN relay for huddles on cellular.

## Known issues
- The Tauri side can only be compiled in CI. Check the Release workflow logs after changing Rust.
- The first desktop start on the user's PC once stalled on "Starting…". v0.2.1+ shows the server log and reuses a server already on port 4747; confirmation is pending.
- Real-device features (push, speech, tunnels) are verified only with emulators and mocks.
