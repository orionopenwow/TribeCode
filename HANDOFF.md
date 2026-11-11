# TribeCode handoff

Read this to pick up the work in a new session (a new Claude chat, Claude Code, or a person). It is kept current at every milestone, alongside `docs/CONTEXT.md` (mirrored to the project doc "TribeCode-Context": vision, user requests, what's in flight).

Last updated: 2026-11-07, v0.8.0. The living vision and request log are in docs/CONTEXT.md (also the project doc claude/TribeCode-Context.md); update both at every release.

## What TribeCode is
A self-hosted "multiplayer vibecoding" app. Friends, each with their own Claude Code agents, build one app together. The work lives in the tribe's shared GitHub repo; someone's desktop app or own server keeps it online for speed. The server and web app have zero npm dependencies (plain Node and browser JS), and a Tauri v2 desktop wrapper bundles the server as a sidecar. GitHub holds the code, the releases and a website (Pages).

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
  - `openspace.js`: optional Open Space office (host-only install/start/stop/open, port 4850).
  - `showcase.js`: per-project website (`site/index.html`), preview, suggestions.
  - `applink.js` + `export.js` + `github-auth.js`: Home Screen/desktop app links, Desktop folder export/copy, GitHub device-flow sign-in.
  - `demo.js` + `scripts/start-demo-tribe.js`: the demo tribe (templates/lantern-run, templates/tavern-3d).
  - `share.js`: public https via Tailscale Funnel or cloudflared.
  - `site.js`: GitHub Pages friend links.
  - `devices.js`: phone device links.
- `app/ui`:
  - `shell.js`: project circles, the calm sidebar, breadcrumbs, the right panel.
  - `router.js`: the one router (global dashboard vs a project, Back/Forward via history, no dead ends, one pane on screen). Route table: docs/NAVIGATION.md.
  - `accounts.js`: Log in / Log out / Continue as guest, the account switcher and TEST accounts (docs/ACCOUNTS.md). Server scaffold: `server/accounts.js` (off unless `TRIBE_ACCOUNTS=1`); clean-up: `scripts/dev/clean-accounts.js`.
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
- On `main` and released: v0.8.0 (everything in CHANGELOG.md). `dev` = working lane; release = bump 4 version files + CHANGELOG (with a **Phones** line) + sw.js CACHE, merge dev → main, push; CI builds installers + latest.json. If latest.json lacks windows, re-run the failed Windows job.
- New since v0.7.0 (server modules): `openspace.js` (Office), `showcase.js` (project websites), `applink.js` + `export.js` + `github-auth.js` (app links, Desktop folders, GitHub device flow), `demo.js` (demo tribe), `oauth.js` (Discord/GitHub/Google sign-in), `huddlesum.js` (after-huddle summary), `files.js` + phone app mode (viewers, Expo starter). UI: `friends.js`, `userbar.js` (desktop bottom-left bar), `chatlist.css` (chat as a list), `themes.js`/`themes.css`, `guide.js` (when merged).
- Windows desktop: the page is http://tauri.localhost; the client must use the saved server (:4747). The server answers Private Network Access preflights. Host switch in Settings; the server only runs with a tribe + Host on.
- In flight: the vision/research/guide agent (docs/VISION.md, docs/RESEARCH-2026-11.md, docs/guide/*.md).
- The user's machine: Windows, `C:\Users\campw\Desktop\TribeCode` (TribeCode.bat reinstaller, Invite-A-Friend.bat, Start-Demo-Tribe.bat, Working\ dev lane on :4848, Tools\). Tailscale signed in. Leyline workspace at Desktop\Leyline (reference only).

## Next steps (in order)
1. Confirm v0.8.0 on the user's PC (Create your first project, GitHub client id, Office switch, Restart to update, installer art).
2. Merge the vision/guide branch; build the roadmap's Now items (Workshop + featured projects, repo scraper, skills catalog).
3. Real devices: phones on cellular huddles (TURN relay), iPhone speech, Web Push, Tailscale Funnel + OAuth redirect.
4. Decide with the user: disable WebView2's Local Network Access check in the app window (future-proofing the desktop app).

## Known issues
- The Tauri side can only be compiled in CI. Check the Release workflow logs after changing Rust.
- Tests run in parallel can time out under load; re-run failures alone before treating them as real.
- Real-device features (push, speech, tunnels) are verified only with emulators and mocks.
