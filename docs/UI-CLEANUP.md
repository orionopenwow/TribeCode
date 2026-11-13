# UI clean-up (fix/desk-demo, v0.30.1)

Old versions of the UI kept showing up beside the current one. Two causes: caching (an old script or an old saved
layout preference coming back) and legacy UI that was still reachable next to its replacement. This lists what was
removed or changed, and why. The guard is `app/test/e2e_no_stale.py`: it plants an old version (old caches, old UI
state, an old script in the current cache), loads the current one, and checks a list of legacy selectors on every route
at 1440 and 390.

## Caching

| What | Before | Now |
| --- | --- | --- |
| Service worker activate (`app/ui/sw.js`) | deleted only `tribecode-shell-*` caches | deletes every cache except this version's shell and `tribecode-runtime` (old names like `tribecode-v1`, `tribecode-cache`) |
| Shell code (`.js .css .html .json .webmanifest`) | stale-while-revalidate on a real address (phones, tunnels, Pages): the first load after an update ran the OLD scripts; Pages pages carry no version, so the purge never ran there | network first everywhere; the cache only answers offline. Pictures and fonts stay stale-while-revalidate |
| Install | two install handlers (one `addAll` that failed as a whole on one missing file) | one, file by file |
| Update hand-over (`app/ui/pwa.js`) | `skipWaiting` + `clients.claim`, but the page kept running the old code | a waiting worker is told to skip waiting; on `controllerchange` the page reloads once (not on first install, at most once a minute) |
| Old cache names | stayed forever | `pwa.js` deletes any `tribecode*` cache that isn't `tribecode-shell-vN` or `tribecode-runtime` |
| Desktop app | unchanged: no service worker inside the app (app.js unregisters it and deletes its caches); the bundled files come with each install, and the sidecar server serves `app/ui` with `Cache-Control: no-cache` | |
| Old UI state in localStorage (`app/ui/selfheal.js`, the first script) | kept forever | removed once per clean-up version (`tribecode.uiCleanup` = `0.30.1-ui1`): `tribecode.docs.sort`, `tribecode.docs.view`, `tribecode.files.kind` (the pre-Files Docs center), `tribecode.nav` (the old sidebar), `tribecode.sitegen.*` (the old site builder's level and step). Add keys here and bump `CLEANUP` when a layout is retired |

## Legacy UI removed

| Removed | Why | Now |
| --- | --- | --- |
| `app/ui/sitegen.js`, `app/ui/sitegen.css` (the old site builder: Instant / Guided / Code, mounted in Files › Website as "Site builder · Make the website") | it showed under the website designer's card on the same page: two website builders | the website designer (`sitedesigner.js`) is the one way to make a site. The generator's server API (`server/sitegen.js`, `/api/projects/:id/website/*`, MCP, Flint's "make a website for…") is unchanged; `website.js` already skipped the panel when the module is absent |
| Preview › Website empty card "Make the project's website" with **Make the website** (one-tap draft) and **Pick a look in Files › Website** (the old builder) | a second, older way in that led to the old builder | "Design the project's website" with **Open the website designer** (`data-act="design"`) |
| i18n entry "Send to my AI helper" | no UI uses it any more (the old Flint send path) | |
| Dead CSS: `demowatch.css` (the tour's old huddle and AI-boost cards), `styles.css` (the old onboarding wizard `.ob-*`, `.perks`, `.help-btn`, `.hero-icon`), `hub.css` (the old Home share/invite cards, the Docs search, `.hub-hint`, `.hub-thumb`, the old phone dock `.dc-*`), `filegrid.css` (the old Files grid and quick-action tiles `.fg-grid`, `.fg-start`, `.fg-st`) | rules for classes no script or page makes any more | only rules whose every selector is a dead class were removed |
| `app/ui/friends.js`, `app/ui/friends.css` (the Friends button `#fr-btn` in the bottom-left user bar and its panel) | it duplicated the People panel in the top bar (`peoplepanel.js`) | People › Friends: star a friend, the invite link and the one-time guest pass with Copy (moved in); `TribeFriends.open()` (the phone's Messages with no tribe) and Ctrl K › Friends open that tab (fix/batch-fixes) |
| The tour's chapters on the inspiration board, a pretend huddle, Claude in the Agents Hub, Work gigs and Flint's lesson + AI-boost card | the tour now starts from a blank slate and shows Flint making things (docs/screenshots/demo-blank-*.png) | `demowatch.js` |

## Tests changed

- `e2e_site_builder.py`: the Instant → Guided → Code UI walk became "the Website page has no old builder" (desktop and 390). Every API check stays.
- `e2e_customize.py`: the generator steps that clicked the old builder (`#sg-make`, Shuffle, Write it for me, the section editor, Publish) call the same endpoints directly.
- `e2e_website_button.py`, `e2e_preview_polish.py`: the empty website card's new title.

## Fixed after the merge (fix/batch-fixes)

- The website designer's preview helper is `app/ui/sitedesigner-frame.js`, loaded by src from the app's origin, so click-to-edit works under the desktop CSP (no `'unsafe-inline'`). Starters played on this device run their inline scripts through `app/ui/framerun.js` (blob: scripts made inside the frame). Test: `e2e_desktop_csp.py`.
- Files' empty state fits where you are (a project, a tribe picked in Where, or this device).
- Files › Website lists the project's site design with Open designer (or Start a design).

## Audit clean-up (feat/audit, 2026-11-13)

Found by the app walk and the leftover scan in `docs/APP-AUDIT-2026-11-13.md`.

| Removed or changed | Why | Now |
| --- | --- | --- |
| About 15 KB of CSS in 25 stylesheets: rules whose every selector names a class that no script, page, server file or test mentions (the old assist question chips `.av-*`, the first setup sheet's seats `.su-seat-t`, `.su-seats`, `.su-seg`, the rail's camp button `.camp-*`, the folding sidebar groups `.nest-fold-head/body`, `.pj-nav-legacy`, the old agents grid `.ag-*`, the invite pill, Work's old header `.tl-head`, `.tl-cta`, `.tl-lead`, the preview and canvas Flint boxes' own buttons `.pvf-btns`, `.pvf-honest`, `.cvf-acts`, `.cvf-honest`, Flint's nudges `.fl-nudge(s)`, and about 40 single classes) | leftovers of layouts that were replaced this month | only rules where every selector was dead were removed; a mixed selector list lost just the dead part. `motion.css` and anything built from a prefix in code (`k-*`, `t-*`, `cbg-*`) was left alone |
| `stage.js`: the `#rail-camp` click hook | the rail's camp button is gone; the logo is the way Home | removed |
| `demowatch.js`: the tour pointed at `#wdz-log` | the website designer's own chat log was replaced by Flint's one chat (`#wdz-flint`) | points at Flint's thread in the designer |
| `selfheal.js`, `signupnudge.js`: checks for `#su-start` | the old setup sheet's first step; the create-a-tribe flow (`#tn`) replaced it | check `#tn` |
| The older Notification settings window (`#nf-settings`) as a second front door | Settings › Notifications is the one place; the profile menu, the inbox's gear, the phone's menu and Flint used to open the older window | they open Settings › Notifications (`TribeNotify.settingsTab()`); the older window stays as that tab's **Advanced** (ntfy, away time) |
| `peoplepanel.css`: a second `.ppl-ai` rule | written for the Add tiles, it also turned the small "AI" tag after a name into a 34px box | scoped to `.ppl-add` and `.ic-hubcard` |
| `chatx.js`: icon symbols added a second time | `i-image`, `i-more`… were already in the page's sprite, so the document had duplicate ids | only missing symbols are added |
| `dropzone.js`: `window.TribeFolderHome` / `TribeFolderHomes` | an API that never existed | `TribeHome.folder({ path })` (livingrepo.js), desktop app only |

`e2e_no_stale.py` now also guards: `#wdz-log`, `#su-start`, `.su-seats`, `#rail-camp`, `.camp-btn`, `.nest-fold-head/body`, `.pj-nav-legacy`, `.av-chips`, `.av-qs`, `.fl-nudges`, `.pvf-btns`, `.cvf-acts`, `.ag-grid`, `.invite-pill`, `.tl-head`, `.tl-cta`.

Left in place on purpose (they look old but are in use): `hostpill.js` (the Hosting pop-out opens under the home pill's "Hosting · who can reach you"), `previewflint.js` and `canvas/flintpane.js` (they mount the one Flint chat and add each editor's tools), `setup.js` (the starter row inside a project), the `su-sheet` class (the create-a-tribe sheet reuses its styles).
