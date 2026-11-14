# TribeCode session handoff

Written 2026-11-13, 19:45 Phoenix time, by the session that released v0.33.0 to v0.36.0. For any agent or Claude session picking up TribeCode work. Read `AGENTS.md` and `HANDOFF.md` first; this page covers what those don't: the current state, work in flight, how releases are done, and how two sessions avoid stepping on each other.

## Where things stand

- **Released:** v0.36.0 is on `main` and `dev` (commit `84507d0`), with Windows, Mac and Linux installers published.
- **Service worker cache:** `tribecode-shell-v200`. Bump it above whatever you find when shell files change.
- **Flint's language score:** 1400/1421 (98.5%) on `flint_eval_test`; the bar is 98%.
- **Two-step sign-in and payments are built but off.** They turn on with `TRIBE_TWO_STEP=1` and `TRIBE_PAYMENTS=1` (or the host-only settings in `docs/ACCOUNTS.md` and `docs/PREMIUM.md`). The owner will say when.

## In flight right now (four branches, not merged)

Each is a git worktree cut from v0.36.0. Don't start the same work elsewhere.

| Branch | What it does | Files it owns |
|---|---|---|
| `feat/real-tribe` | Every tribe starts with the full feature set. The desktop app hosts a new tribe on this computer silently; a browser-only tribe shows a friendly "Put this tribe online" card instead of errors. The phrase "real tribe" is removed. The "On this device" header pill is replaced by a plain "Sharing and backup" card on the dashboard. | `offline.js`, `tribenew.js`, `livingrepo.js`, the dashboard part of `projects.js` |
| `feat/design-site2` | Overhaul of the website designer, Design flow and canvas: better exported sites, more blocks, open-source icons, fonts and illustrations, a shared brand kit, "Check my site", and "Have my agent do it" over MCP tools. | `sitedesigner*`, `sitecfg.js`, `designflow*`, `canvas/*` |
| `feat/company3` | Company made intuitive: setup by questions, plain words (roles, check-ins, money in and out), a summary strip, AI in roles made obvious. | `company*.js`, `server/company*.js`, `server/rituals.js` |
| `feat/chat-invite-ui` | Chat is for people: instructions for an AI go privately to the person's agent, not into the channel; channels show only chosen one-line AI update cards. Also a taller, clearer invite sheet. | chat render and send in `app.js`, `chatx.js`, `askagent.js`, `inviteone.js` layout |

When they finish, the releasing session merges them into `integ6`, runs targeted tests and releases v0.37.0.

## What the owner wants (standing instructions)

- **Build and release.** No large audit passes or long audit documents. Short reports.
- **Keep the design.** Flat matte, tokens only, stroke icons from `icons.js`, no emoji in chrome. Recommend design changes in words; don't restyle unasked.
- **Works with no AI, better with one.** Every feature works free and offline first. AI output becomes the same undoable edits Flint makes.
- **Plain language for users.** No "repo", "ship", "sync", "host" or "real tribe" in primary UI text.
- **One way to do each thing.** Before adding a feature, check whether it should extend an existing one. Most of this week's bugs came from two features doing the same job.
- **Testing:** targeted tests plus a smoke set for normal releases. The full suite takes about two hours on this machine, so run it only for very large merges.

## Two sessions, one repo

Another Claude session also releases to this repo. On 2026-11-13 both released a v0.32.0 with different contents, which cost a 17-conflict merge. Until the owner names one session to own `main`:

1. **Always** `git fetch origin main` and merge it before you push. Never force-push.
2. If `main` moved, your batch takes the next version number; don't reuse one.
3. Prefer pushing feature work to a branch or `dev` and telling the owner, and let one session cut releases.
4. After merging another session's work, regenerate Flint's eval (`node scripts/dev/flint-eval-cases.js`) and run `flint_eval_test`; overlapping Flint rules are the most common silent regression.

## How a release is done

1. Work on a feature branch in its own worktree; merge into the integration branch (`integ6`, worktree `/home/claude/wt-int6`).
2. Merge conflicts in `app/ui/sw.js` (SHELL list) and `package.json` (`test` chain) are unions: `python3 /home/claude/resolve.py app/ui/sw.js package.json`, with CACHE set above both sides.
3. Run the tests for what changed, then the smoke set: `bundle_test`, `ui_smoke`, `e2e_truth`, `e2e_no_stale`, the security tests (`security_test`, `security2`–`8`), `flint_eval_test`, `flint_nlu_test`.
4. Refresh the thumbnails: `npm run dev:thumbs` (`scripts/dev/live-thumbs.py`) re-renders every thumbnail the Workshop and the website show from the real templates, starters and app screens, and puts back the ones that did not really change. Look at what `git status` lists, then commit it. `python3 scripts/dev/live-thumbs.py --check` (in `npm test`) fails when a thumbnail's source item is gone or the website points at a missing picture; `--sheet out.png --ref <last release>` makes a before/after contact sheet. Other makers' screenshots are only used where their terms allow it: `templates/studio-shots.json`, `docs/SCREENSHOT-PERMISSIONS.md`.
5. Add a `## vX.Y.Z` entry to `CHANGELOG.md` with a `**Phones**` line. Update the "Latest" line in `docs/CONTEXT.md`.
6. `node scripts/dev/release.js X.Y.Z --skip-tests`, commit, then push the same commit to `dev` and `main`.
7. The Release workflow publishes when the version changes on `main`. Watch it. The Mac build sometimes gets no machine from GitHub; the release still publishes, and "rerun failed jobs" attaches the Mac installer later.

Commit messages end with a `Co-Authored-By` line for the model and a `Claude-Session` line with the session link.

## Rules of the machine (cloud sandbox)

- Two cores. Run one test at a time, each agent with its own `TRIBE_PORT_OFFSET`. Under load, timing-sensitive tests fail; rerun alone before judging.
- A background command is stopped a few minutes after the session stops responding. Stay active while a long run is going.
- Git reaches GitHub. Most other sites are blocked from the shell, including huggingface.co, so real models can't be downloaded here.
- Agents hit usage limits. Their work is saved; resume them by message after the reset instead of starting over.
- Never switch the branch of a worktree that a test run is using.

## Known gaps and things only a real device can confirm

- **Untested with the real thing:** the claude.ai connector sign-in, other agents' setups (from documentation only), passkeys on real devices, the desktop folder picker and desktop drag and drop, real Dropbox-style folder sync, Flint's local brain download and any local language model (tested with stand-ins).
- **Flint's weakest areas** with no model: search by meaning, "did you mean", paraphrased commands (`docs/FLINT-CAPABILITY.md`).
- **Payments:** needs the owner's Stripe setup (`docs/PREMIUM.md`). The Tribe plan's weekly credit refill and sales tax are not built.
- **Email sign-in links** need the host's own mail server.
- **Phone push notifications** need Apple and Google developer accounts.
- **Screenshots** are 62 MB of the repo; 294 of them exist only because tests rewrite them. Deleting them needs edits to 34 tests; the owner hasn't decided.
- **Open decisions for the owner:** which session owns `main`; whether cancelling a plan gets a grace period; whether passkeys stay visible while two-step is off.

## Where to look

- `HANDOFF.md`: what TribeCode is, how to run and test it, and the code map.
- `docs/CONTEXT.md`: one line per release.
- `CHANGELOG.md`: what each release contains, in user terms.
- `docs/LAUNCH.md` and `docs/ONE-PAGER.md`: what must be true before launch.
- `docs/APP-AUDIT-2026-11-13.md`: holes and ranked next features (a draft).
- Feature docs: `ANY-LLM.md` (agents), `ACCOUNTS.md`, `PREMIUM.md`, `LIGHT-HOSTING.md` (folders and sync), `WEBSITE.md`, `COMPANY.md`, `WORK-BACKEND.md`, `FLINT-TIERS.md`, `FLINT-RESEARCH.md`, `MOBILE-COMPLETE.md`.
