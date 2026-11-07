# The Explorer and self-heal

TribeCode tests itself the way a curious friend would: it opens the real app, clicks around, tries the main things
people come to do, and writes down what felt broken. Then the app heals the problems it can on its own.

There are three parts:
- **The Explorer** (`scripts/explore.py`): a crawler, smoke tests and "intuitive tests" in one run.
- **Self-heal** (`app/ui/selfheal.js`): recovers from a broken start or a stale page.
- **Insights** (`server/insights.js`): sends what the Explorer and the host's health checks found to the Home "AI Insights" panel.

## Run it

```
npm run explore                      # full run, about 10 min → docs/EXPLORE-REPORT.md + .explore/findings.json
python3 scripts/explore.py --quick   # about 2 min, part of npm test; fails only on critical findings
npm run milestone-report             # previous release vs this checkout → docs/milestones/<version>.md
```

Options:
- `--only desktop,phone,tauri,offline,journeys,core`: run only some phases. `seed` is always on.
- `--keep`: keep the throwaway tribe folder in /tmp so you can look at it.
- `--app-root <checkout>`: drive another copy of TribeCode. The milestone report uses this.
- `--shots-dir <dir>`: save a fixed set of screens.
- `--json <file>`, `--report <file|none>`, `--no-shots`: choose where the output goes.

Ports: the Explorer uses 4871 + `TRIBE_PORT_OFFSET`, and `e2e_selfheal.py` uses 4873 + the offset.

**Every milestone:** run `npm run explore`, fix the critical findings, run `npm run milestone-report`, then `npm run readme-shots` and release.

## What it does

1. **Starts a real server** on a temporary `--dir`, with a mock Ollama, a mock GitHub REST API (`POST /user/repos` makes a local bare repo) and a mock ntfy server.
2. **Seeds a realistic tribe.** Orion is the host and Maya is a friend. Each has a Claude agent connected over MCP. There are two projects; Pixel Quest is a real git repo with an origin. The seed also adds chat (replies, reactions), tasks, a vote, a proposal, docs, a gist and a bug.
3. **Drives four contexts.**
   - Desktop at 1440×900.
   - Phone at 390×844 (iPhone user agent, touch).
   - The desktop app. A fake `window.__TAURI__` is injected: `core.invoke` (`host_start`, `host_log`…), `window`, `app.getVersion`, `deepLink`, `updater`, `path`, `event`, `process`, `notification`, `dialog` and `autostart`, all recording their calls.
   - Not connected (no tribe yet).
4. **Crawls.** It visits every destination in the shell's registry (`TribeShell.dests()`): the nest rows, every workspace tab, Home and its modes, and the Ctrl K entries. Then it opens the overlays: the profile menu, the bell, the palette, the composer `+`, the workspace switcher, the agent detail, the person view, the preview and the Workshop.
   - A full run then clicks every visible, enabled button, link, tab and menu item in each view. It types plausible text into inputs and presses Enter and Escape. Between actions it returns to a known state, reloading if an overlay will not close.
   - It skips anything destructive: delete, remove, revoke, disconnect, close vote, sign out, leave, reset, restart, install and download backup. It never follows off-origin links.
5. **Runs journeys** (see below) and scores each one.
6. **Writes** `.explore/findings.json` and, on full runs, `docs/EXPLORE-REPORT.md`, ranked by severity. Each finding comes with steps to reproduce. Screenshots are saved for the worst findings only (8 at most, small JPEGs in `docs/screenshots/explore/`).

### What counts as a finding

The in-page probes live in `scripts/explore_audit.js`. They only read the page and never change it.

| Kind | Severity | What |
|---|---|---|
| `pageerror`, `console`, `request` | critical at boot, else high / medium | script errors, console errors, 4xx/5xx and failed requests (expected answers such as 401 when not connected or 409 "nothing to commit" are ignored) |
| `dead` | medium | a click with no DOM change, no request, no WebSocket frame, no navigation, popup, dialog or file chooser within 0.65 s |
| `slow`, `slow-boot` | medium | first visible change more than 1 s after a click; a start that takes more than 6 s |
| `h-overflow` | high on phone | the page scrolls sideways; names the widest offenders |
| `clipped-text` | medium | a button or label cut off without an ellipsis |
| `obscured`, `unclickable` | medium | a button whose center is covered by another (small) element. Open overlays, full-screen pages and sticky headers over scrollable content are not counted |
| `focus-trap` | medium | controls that take keyboard focus while invisible (opacity 0 and not revealed on focus, off-screen, inside `aria-hidden`) |
| `contrast` | medium under 3:1, else low | text under WCAG AA (4.5:1, or 3:1 for large text) in the dark theme. Grouped per color pair; emoji are skipped |
| `no-label` | medium | icon-only buttons with no accessible name |
| `dup-label` | low | the same label twice in one navigation |
| `empty-dead-end`, `offline-dead-end` | low / medium | an empty state, or a view with no tribe, with no button or link to go on |
| `layout-shift` | low | cumulative layout shift above 0.1 after a view opens |
| `blank-view`, `nav` | high | a view that renders nothing, or a destination that fails to open |
| `journey`, `journey-long` | high / medium | a goal that cannot be reached, or one that needs more clicks than its target |

Findings are deduplicated by a stable id (kind + selector + label). The milestone report uses these ids to tell fixed, new and still-open findings apart.

### Intuitive tests (goal-based journeys)

These are written as plain steps with resilient selectors (role and visible name first, an element id only as a last resort, which is noted as friction). For each one the Explorer records the clicks to the goal, the time and friction notes. Phone variants live in `steps_phone`.

| Journey | Goal | Target |
|---|---|---|
| Invite a friend and get a link | a join link on screen | ≤ 2 clicks |
| Propose a feature and get it on the Board | the proposal is listed | ≤ 4 |
| Connect Claude Code | a `claude mcp add` command on screen | ≤ 2 |
| Preview the app | the preview pane is open | ≤ 2 |
| Find the bug inbox | the Bugs view | ≤ 2 |
| Turn on capture to notes | capture is on | ≤ 2 |
| Start at Home and open a project | a project view | ≤ 2 |

### Core-intent journeys

The user's words: *"collaborating easily with other people using LLMs and not disrupt code by working on the same thing and the automatic claude code generator and autopilot github upload with high fidelity chat and notif systems"*. Each journey is a list of checks, scored pass/fail with clicks and time, and goes into `findings.json` under `journeys` (with `kind: "core"`) so the nightly run can track trends.

1. **Collaboration.** Two humans and two Claudes work on one project.
   - Orion's Claude claims `src/player.js`. Maya's Claude gets a clear refusal that names the holder, and the Explorer notes whether the refusal says what to do next.
   - Two `tribe/<member>` branches touch `src/world.js`, and the conflict radar flags them.
   - A hand-off moves the file, and the receiver hears about it and can claim it.
   - The host sees the conflict in Agents Hub → Conflicts.
2. **Connect Claude Code.** The generator works end to end.
   - The Explorer opens the generator while Maya's Claude is working and checks that the running agent keeps its key.
   - It reads the command off the screen (MCP URL and key) and checks that a "This computer" command exists. It notes when there is no "Anywhere" command.
   - The agent connects with that exact key, posts a gist, reads the chat and appears in the room.
3. **Repo autopilot.** One-click create makes a GitHub repo (mock) with a first push.
   - Start the flow, which writes the living plan.
   - Give me a branch, then commit and push as Orion. The commit lands on GitHub with Orion's name and email.
   - The commit becomes a gist. PLAN.md is in the repo.
4. **Chat fidelity.** Maya types on the phone. Text, a reply, a reaction, an image, a voice note, a file and a vote arrive live on the desktop and the phone, in order. The image renders.
   - The server restarts. Everything persists, including the reply quote and the vote options.
   - A reload shows it all.
5. **Notifications.**
   - An @mention, an agent's approval request and a vote nudge reach the right inboxes.
   - With quiet hours on, the inbox fills but ntfy (mock) gets nothing; outside quiet hours a push goes out.
   - The desktop bell and the phone Updates badge both show the server's unread count, and the inbox opens with the mention.

### Suggestions

The report ends with feature and UX ideas derived from what the run saw: dead controls, contrast, unnamed icons, long journeys, claim refusals with no next step, a missing "Anywhere" command, dead ends without a tribe, empty states, and errors that deserve a one-tap report. Ideas already in `docs/FEATURES-NEXT.md` are marked there and not repeated. New ones were merged into FEATURES-NEXT as "Part 3: from the Explorer".

## Self-heal (`app/ui/selfheal.js`)

`index.html` loads this before any other script.

- **Start-up watchdog.** The shell counts as built when `TribeApp`, `TribeShell` and `TribeClient` exist, `body[data-view]` is set and the nest has rows.
  - If the shell has not built within about 6 s, or one of our own scripts threw (or failed to load) while the page was starting (until load + 0.8 s), self-heal unregisters service workers, deletes CacheStorage and reloads once. A sessionStorage guard, `tribecode.heal`, prevents reload loops.
  - If the start still fails, a calm card appears ("Something went wrong", Reload / Send report) instead of a half-built page. It is full-screen when the shell is missing, and a corner card when only a feature failed.
  - The report goes to the bug inbox (`POST /api/bugs`, `auto: true`) with the last logs. It is sent automatically unless **Settings → Crash reports** is off.
  - `?healWait=<ms>` shortens the watchdog for tests.
- **Version check.** The server stamps every page it serves with `<meta name="tribe-version">`. On every WebSocket `hello` (connect and reconnect), and once through `/api/health` for pages with no tribe, the page's version is compared with the server's.
  - If they differ, a soft bar appears ("TribeCode was updated to vX. Reload to use it." Later / Reload). Reload clears stale caches first.
  - In the desktop app, where the page is bundled, a server version different from `app.getVersion()` re-runs the stale-server check (`TribeApp.hostHere`) once per session.
- **Error budget.** `TribeSelfHeal.shouldFile(msg)` normalizes the error (numbers, ids and URLs stripped). It files the same error once per 30 minutes and at most 5 errors an hour from one device, and counts what it suppressed. The `bugs.js` automatic crash reports go through it and respect the Settings opt-out.
- The socket reconnect with backoff stays in `tribe.js`.

Tests: `app/test/e2e_selfheal.py` covers:
- a normal start;
- a boot failure (clear, one reload, card, report, Reload after the fix);
- the watchdog without an error;
- the version prompt across a server upgrade;
- the error budget and the opt-out;
- the Insights API.

## Insights (`server/insights.js`)

`GET /api/insights` returns `{ items: [{ id, kind, title, body, source, at, project?, severity?, public? }] }`, with issues first.
- `kind`: `optimization`, `suggestion`, `issue` or `health`.
- `source`: `explorer`, `secretary` or `health`.

Sources:
- **explorer**: the newest run, from `POST /api/insights/explorer` (host only, stored trimmed in `.tribe/insights/explorer.json`) or a `.explore/findings.json` in the tribe folder, the TribeCode checkout or a project repo (tagged with that project). The feed shows a summary, the top findings, failing journeys and new suggestions.
- **health** (host): disk space in the tribe folder, JSONL files over 20 MB or 50 MB, no GitHub token for pushes, the local model being off (public), no backup in 7 days (Download backup now records `.tribe/backup.json`), and a newer GitHub release (public, skipped in tests).
- **secretary**: new inspirations per project the viewer can see.

Members see explorer and secretary items for their projects, and only health items marked `public`. Agents get 403. Tokens, keys and long secrets are scrubbed from every title and body.
