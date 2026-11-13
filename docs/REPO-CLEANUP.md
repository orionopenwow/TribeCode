# Repository clean-up (2026-11-13)

Branch `feat/repo-clean`. The goal: only what TribeCode needs to run, build, test and ship stays in the repo, and each
thing has one obvious place. Every file under `scripts/`, `Tools/`, `design/`, `promo/`, `mobile/`, `assets/`,
`templates/` and `docs/` was checked against `package.json`, the three workflows, the Dockerfile, the server, the Tauri
build, the tests, the other scripts, the docs and the website. Nothing in `app/ui`, `server`, `app/test` or `site` was
changed.

## Removed (7 files, 0.33 MB)

| File | Size | Why |
|---|---|---|
| `scripts/milestone.sh` | 1 KB | Tagged and pushed a release by hand. Releases are published by CI when the version changes; `npm run dev:release` prepares them. Nothing called it. |
| `scripts/Get-Latest-TribeCode.bat` | 2 KB | Replaced by `scripts/desktop/Stable/Update-and-Open-TribeCode.bat`. The updater deletes old copies of it from a user's Desktop. |
| `design/mockups/app.html`, `render.py` | 35 KB | Mock-ups drawn before the app existed (v0.0.1). Nothing linked to them or to their output. |
| `docs/screenshots/demo-watch-1.png`, `demo-watch-site.png` | 277 KB | No doc, page, test or script names them (the tour test now saves other names). |
| `docs/screenshots/explore/5748fa0cfd.jpg` | 17 KB | An Explorer finding picture that `findings.json` and the report no longer list. |

Everything is still in git history.

## Moved

| From | To | Note |
|---|---|---|
| `TribeCode-Live-Test.bat`, `TribeCode-Invite-Friend.bat`, `TribeCode-Start-Test-Project.bat` (repo root) | `Tools/Live-Test.bat`, `Tools/Invite-Friend.bat`, `Tools/Start-Test-Project.bat` | README never pointed at them; users run the Desktop kit in `scripts/desktop`. Each steps up to the repo root when run from `Tools/`, and still clones the repo when copied somewhere alone. |
| `tribecode-live-test.command`, `tribecode-invite-friend.command`, `tribecode-start-test-project.command` (repo root) | `Tools/Live-Test.command`, `Tools/Invite-Friend.command`, `Tools/Start-Test-Project.command` | Same, for macOS and Linux. |
| `scripts/dev/ad-launch-sound.py`, `ad-soundtrack.py`, `ad-type-sound.py` | `promo/sound/` | They only make the ads' soundtracks; they now sit beside the ads. |
| `scripts/dev/flint-held4.js`, `flint-held5.js`, `flint-held6.js`, `flint-max-cases.js` | `scripts/dev/flint-eval/held4.js`, `held5.js`, `held6.js`, `max-cases.js` | Case batches that `scripts/dev/flint-eval-cases.js` reads. The generated `app/test/flint_eval.json` is byte-identical. |
| `docs/FEATURE_SPEC.md`, `NEXT-PHASE.md`, `FEATURE-ASSESSMENT-SHIP-FLOW.md`, `EASY-EVERYTHING.md`, `PHONE-APPS.md` | `docs/archive/` | Built or replaced plans. `docs/archive/README.md` says where to look now. |

The repo root now holds only the standard files: README, HANDOFF, AGENTS, CLAUDE, CHANGELOG, LICENSE, NOTICE,
SECURITY, package.json, Dockerfile, render.yaml and the dotfiles.

## Other changes

- `.gitignore` is grouped by purpose and now also covers `_site/`, Python and test caches, editor folders,
  `tribe-data/` (the Working launchers' test tribe), `*.pem` and `*.key`. No tracked file matches it.
- `package.json`: no change was needed. Every script's file exists, and every test in `app/test` is in `npm test`.
- `HANDOFF.md`: launcher names, the map of the code, and the owner's Windows user folder written as `%USERPROFILE%`.
- Nothing sensitive is tracked: no `.env`, keys or tokens. The token-shaped strings in `app/test` are fixtures, and the
  updater key in `tauri.conf.json` is a placeholder that CI fills in.

## Kept, though unsure

| What | Size | Why it stayed |
|---|---|---|
| `docs/screenshots/` (341 files) | 62 MB | 47 files (6.5 MB) are shown in a doc, the README or the website. The other 294 (55 MB) are written by a test (`--shots`) or a shot script and are the visual record of each feature. Deleting them is safe for the app, but it is the owner's call: see below. |
| `docs/REVIEW-2026-11-11.md` | 12 KB | Historic, but `app/test/security4_test.py` and `docs/REVIEW-2026-11-12.md` cite its path. |
| `docs/FEATURES-NEXT.md` | 16 KB | Old (v0.4), but README links it and `scripts/explore.py` reads it. |
| `docs/TEST-REPORT.md`, `PHONE-REPORT.md`, `TRUTH-TEST.md`, `EXPLORE-REPORT.md` | 40 KB | Stale dates, but each is rewritten by a test or script at that path. |
| `docs/milestones/` | 0.7 MB | One report from 2026-11-07; it is where `npm run milestone-report` writes. |
| `docs/MOBILE-TRIBES.md`, `GROK-SCOPE.md`, `STUDIO-SCOPING.md`, `RESEARCH-2026-11.md` | 0.1 MB | Plans and research that VISION, HANDOFF or server comments still cite. |
| `design/inspiration/` (9 pictures) | 2.9 MB | Reference pictures named in `docs/DESIGN-SYSTEM.md` and in comments in `hub.js` and `bubbles.css`. `home-ref.png` alone is 1.4 MB. |
| `promo/` (5 ad pages, 21 stills, 3 sound scripts) | 4.7 MB | Source of the ads. Not published and not needed to run the app. |
| `scripts/campton-portrait.py` | 5 KB | Made `site/assets/creator/campton-at-work.*`; needs a source picture that is not in the repo. |
| `scripts/site-fire.py` | 6 KB | Draws the website's corner fire, which is switched off (`e2e_site2.py` checks it is absent). |
| `scripts/dev/feedback-digest.js`, `nlu-try.js`, `site-links.py` | 16 KB | Working dev tools that no doc or script mentions. |
| `assets/brand/logo-text*.{svg,png}`, `frames/` | 50 KB | Output and input of the brand scripts (`wordmark.js`, `render-icons.py`, `render-logo-gif.py`, `make-installer-art.py`). |

### Screenshots: the one large decision left

`docs/screenshots` is 62 MB of the repo's 106 MB. Tests may not be edited on this branch, so the folder stays as it is.
Two facts for whoever decides:

- About 87 tests write there only with `--shots`. These 34 appear to write on every run (no switch found), so their pictures
  change in every `npm test`: `e2e_assist`, `e2e_auth2`, `e2e_bubbles`, `e2e_captures`, `e2e_chat2`, `e2e_company_v2`,
  `e2e_company_widget`, `e2e_crafts`, `e2e_fleet`, `e2e_friend`, `e2e_gigs_self`, `e2e_github_setup`,
  `e2e_invite_claude`, `e2e_market_v2`, `e2e_moderation`, `e2e_notify`, `e2e_overview2`, `e2e_polish_wave`,
  `e2e_premium`, `e2e_pwa`, `e2e_richtext`, `e2e_secretary`, `e2e_shell_polish`, `e2e_ship_sync`, `e2e_site`,
  `e2e_tasks_accept`, `e2e_templates_guided`, `e2e_themes`, `e2e_tribe_flow`, `e2e_updater`, `e2e_versions`,
  `e2e_welcome`, `e2e_work_complete`, `e2e_work_v2`.
- A clean split would be: keep the 47 pictures that docs and the README show, point the tests at an ignored folder
  (for example `.shots/`), and delete the rest. That removes about 55 MB from every future checkout; history keeps
  its size unless it is rewritten.

## Found, not fixed here

- `npm run dev:release -- --check` fails its smoke subset: `app/test/e2e_guide.py` wants every Guide page under 480
  words and `docs/guide/03-connect-claude-code.md` has 536. This was already so before this branch.
- `server/flintkb.js` indexes every `.md` at the top of `docs/` for Flint's answers, minus a skip list. This file and
  other internal notes (the reviews, the audits) are not on that list.
- `scripts/desktop/Tools/tribecode-update.ps1` still removes the old root launcher names from old installs. That is
  right for old copies and needs no change.

## What lives where

| Path | What it is | Needed for |
|---|---|---|
| `server/` | The Node server, no dependencies | running |
| `app/ui/` | The web app (also the desktop and phone UI) | running, the Pages site |
| `app/src-tauri/` | The desktop wrapper (Tauri) | desktop builds in CI |
| `app/test/` | Every test; all are in `npm test` | testing |
| `templates/` | Starters, website templates, the marketplace and company catalogs the server reads | running |
| `site/` | The marketing website (the front page on Pages) | the Pages site |
| `assets/brand/` | Master logo and icon files | brand scripts, the Tauri icon |
| `docs/` | Current docs; `guide/` ships in the app; `screenshots/`, `milestones/`, `infographic/` are pictures and reports; `archive/` is history | Guide and Flint's answers at run time |
| `scripts/` | Run and build: `live.js`, `invite-friend.js`, `mcp-stdio.js` (in the Docker image), `build-sidecar.js`, `bundle-server.js`, `setup-release.js`, `check-tauri-config.py`, demo and test-project starters, `explore.py`, shot and brand generators | running, CI, releases |
| `scripts/dev/` | Developer tools behind `npm run dev:*`, the catalog and thumbnail generators, `flint-eval/` case batches | development, four steps of `npm test` |
| `scripts/desktop/` | The Windows Desktop kit users get (Working, Stable, Tools) | users on Windows |
| `scripts/pages-compat/` | Redirect pages for old links | the Pages workflow |
| `scripts/phone/` | The Termux host script | hosting from a phone |
| `scripts/starter-shots/` | Small pages photographed for the website's starter cards | `starter-shots.py` |
| `Tools/` | Double-click launchers for a source checkout: Clean-Slate-Dev, Live-Test, Invite-Friend, Start-Test-Project | development |
| `mobile/` | Store packaging notes and the Android TWA manifest | phone apps |
| `promo/` | Ad pages, stills and soundtrack scripts | marketing only |
| `design/inspiration/` | Reference pictures | design only |
| `.explore/findings.json` | The Explorer's last findings, read by Insights | running (Insights) |
| `.github/` | CI, Pages and Release workflows; issue forms | CI |
