# Claims ledger

Every factual or capability claim the website, the README and the first-run text make, with the evidence for it.
Checked 2026-11-14 on the v0.38 work (branch `integ7`). Tests named here were run that day, one at a time, and passed
unless the row says otherwise.

- **Proven**: a test or a count in this repository shows it.
- **Partly**: true with a limit; the limit is stated on the site.
- **Real-device-only**: passes on simulated phones or mocked services; nobody has confirmed it on real hardware. The
  site shows a small **beta** tag. `docs/REAL-DEVICE-CHECK.md` is the 15-minute script that settles these.
- **Unproven**: no evidence found from this sandbox.
- **False**: not true. `app/test/site_facts_test.js` fails while any row says False, so reword the claim or fix the
  product first.

Numbers are not kept here. `scripts/dev/site-facts.js` counts them from the real sources into `site/facts.json` and
stamps every place that quotes one.

"Was" is the status before this pass, when it changed.

## Numbers

| Claim | Where | Evidence | Status | Was |
|---|---|---|---|---|
| Flint understands about 220 everyday actions with no AI | index, flint, docs, README, Guide | 225 ids in `TribeNLU.catalog()`; `flint_nlu_test`, `flint_eval_test` | Proven | Partly (said 170) |
| 553 checked add-ons / 550+ add-ons | index, docs, Guide | `templates/marketplace.json`; `e2e_market` ("553 items") | Proven | False in places (500+, 575 in translations) |
| 65 lessons in ten tracks | index, docs, Guide | `templates/academy.json`; `e2e_academy` | Proven | False (said 62) |
| 16 website templates | index, flint, docs | `templates/sites`; `e2e_site_templates` | Proven | |
| The website designer has 52 templates | docs, README | `app/ui/sitetpl/catalog.json`; `e2e_site_editable` walks all 52 | Proven | False (said 48) |
| 13 screen templates on the design canvas | index, flint, docs | `templates/canvas`; `e2e_canvas_flint2` | Proven | |
| Seven company templates | docs | `templates/companies.json` (eight entries, one is Blank); `e2e_company_v2` | Proven | |
| 51 quick guides | index | `templates/quickguides.json`; `e2e_learn` | Proven | not on the site |
| 13 moving backgrounds | index | `app/ui/sitefx.js`; `e2e_site_fx` | Proven | not on the site |
| Flint works in eight languages | flint, index, docs | `app/ui/flintnlu.js` command words; `flint_lang_test` | Partly | Partly, unstated |
| The Connect your AI page lists 15 tools | README | `DIRECTORY` in `app/ui/connectai.js` (counted) | Proven | |
| 13 projects in the remix list | index | counted from the page | Proven | |

## What you can make and do

| Claim | Where | Evidence | Status | Was |
|---|---|---|---|---|
| Describe an app, game or website and a first version runs right away | index, flint | `e2e_flint_free`, `e2e_build_loop` | Proven | |
| A landing page with a sign-up form that reaches your tribe | index, docs | `e2e_site_suggest` posts a form and finds it in the project chat. Works only while the tribe's computer is online, and the docs say so | Partly | False ("takes sign-ups", with no delivery) |
| A small shop that checks out through your own payment link | index, docs | `templates/sites/merch/shop.js` (cart in the browser, hand-off to your Stripe, Shopify or Gumroad link); `e2e_site_templates` builds the merch site | Proven | False ("an online store", "a booking page that takes payments") |
| Payments inside TribeCode | pricing | Built and switched off (`e2e_payments` with the switch on). The site promises nothing today | Proven | |
| A merch shop with a cart | index | `templates/sites/merch/shop.js`; `e2e_site_templates` | Proven | |
| Design canvas: real layers, auto layout as CSS flex, send to app as HTML and CSS | index, docs | `e2e_canvas`, `e2e_canvas_code` | Proven | |
| Inspect any layer's CSS, export PNG or SVG | index, docs | `e2e_canvas_code` | Proven | |
| Flint designs a screen from a sentence with no AI | index, flint | `e2e_canvas_flint2`, `e2e_canvas_flintpane` | Proven | |
| Docs like Notion: pages in pages, to-do lists, tables, templates, comments | index, docs | `e2e_doc_editor`, `e2e_richtext` | Proven | |
| Page history | index, docs | `e2e_versions` | Proven | |
| Sheets with formulas, slides | index, docs | `e2e_crafts`, `e2e_ledger` | Proven | |
| A shared whiteboard | index, docs | `e2e_whiteboard` | Proven | |
| Everyone edits live | index, docs | `e2e_coedit`, `e2e_cursors` | Proven | |
| Dictate instead of typing | index, docs | `e2e_voice` with a mocked speech service | Real-device-only | |
| Voice notes | index | `e2e_voice_notes` with a mocked microphone | Real-device-only | |
| Voice calls | index, docs | `e2e_huddle`, `e2e_phone_calls` on one machine; never on two real devices or on mobile data | Real-device-only | Unproven |
| Pin Stripe, your analytics, Discord or Figma to the sidebar as shortcuts | index | `templates/marketplace.json` (each is a link shortcut); `e2e_sidebar_widgets`, `e2e_widgets_v2` | Proven | False ("widgets": they open the tool, they do not show its data) |
| A daily Trending on GitHub shelf | index, docs | `e2e_market`, `e2e_shelf` | Proven | |
| Free asset library, added in one click with credits written for you | index, docs | `e2e_assets` | Proven | |
| Flint handles typos and several steps in one message | flint, docs | `flint_nlu_test`, `flint_eval_test` | Proven | |
| Flint answers how-to questions from the Guide and names the source | flint, docs | `flintkb_test`, `e2e_flint_guide` | Proven | |
| Flint learns the phrases you teach him | flint | `e2e_flint_local` | Proven | |
| Flint remembers only what you ask, and only you can read it | flint | `e2e_flint_memory`, `security4_test` | Proven | |
| Flint works on a phone with no signal | flint | `e2e_offline_demo`, `e2e_mobile_complete` on a simulated phone | Real-device-only | |
| Proof of work: a ZIP with every file and the timeline | index | `e2e_flint_runthrough` ("project ZIP 354 KB") | Proven | |
| Each friend's AI sits in the same chat and waits for a person's vote | index | `e2e_votes`, `e2e_any_llm`, `e2e_coord` | Proven | |
| Everyone gets their own corner; hand-offs with a note | index | `e2e_coord` | Proven | |
| Nothing goes into the main copy until a person says yes | index | `e2e_ship_flow`, `security10_test` | Proven | |
| Anything outward or costly waits for a person's OK | index, flint, mission | `e2e_notify`, `security10_test` | Proven | |

## New in v0.38

| Claim | Where | Evidence | Status | Was |
|---|---|---|---|---|
| Every word, picture and button on your site is editable; one small toolbar; right-click; drag to reorder | index | `e2e_site_editable` (all 52 templates) | Proven | not on the site |
| Suggestions from your tribe: one-tap changes with who said it, nothing changes until Apply, Undo takes it back | index | `e2e_site_suggest`, `sitesuggest_test` | Proven | not on the site |
| Moving backgrounds pause off screen and show a still picture for reduced motion; ten are ThreeUI ports (MIT) | index | `e2e_site_fx`; `docs/SITE-3D.md`, `NOTICE` | Proven | not on the site |
| One lead, a council, everyone equal, or your own roles; the app says who can and offers to ask | index, mission | `e2e_group_styles`, `security10_test` | Proven | site said CEO and C-suite only |
| Learn: quick guides with a button that does it and Show me; lessons under Skills | index | `e2e_learn` (`e2e_help_next` fails today on an unrelated check: one path page is over its word limit) | Proven | not on the site |
| Change language from the ? menu, the first screen or Settings | index | `e2e_i18n_audit`, `i18n_runtime_test` | Proven | not on the site |
| The app's menus are only partly translated | index, docs | `docs/I18N-REPORT.md` (about 1,250 strings per language still English) | Proven | False ("the app comes in" eight languages) |

## Company and work

| Claim | Where | Evidence | Status | Was |
|---|---|---|---|---|
| Seats with a short charter, held by a friend or an AI helper | index, docs | `e2e_company_v2`, `e2e_company3` | Proven | |
| A standup that seats report into | index, docs | `e2e_company_v2` | Proven | |
| Money view: numbers from a CSV, a connected tool, or typed in, each with its source | index, docs | `e2e_ledger` | Proven | |
| Stripe sync with your own read-only key | docs | Code only (`server/company*.js`); needs a real Stripe key | Unproven | |
| Gigs, and a time bank both sides confirm | index, docs | `e2e_gigs_self`, `e2e_talent` | Proven | |
| Legal starting points, marked as drafts to check with a professional | index, docs | ten files in `templates/legal`; `e2e_academy` | Proven | |

## Where it runs

| Claim | Where | Evidence | Status | Was |
|---|---|---|---|---|
| The work is saved to your own GitHub account | index, mission | `e2e_github_connect`, `e2e_publish_real`, `e2e_repo` against a mock GitHub | Partly | |
| The tribe runs on someone's computer or a small server | index, docs | `npm start` is what every test runs; `docs/HOSTING.md` | Proven | |
| A free cloud spot can run it | index | Instructions only (`docs/HOSTING.md`) | Real-device-only | Unproven, untagged |
| An Android phone can run it | index, docs | Instructions in the app and `docs/MOBILE.md`; never run on a phone | Real-device-only | Unproven, untagged |
| Friends join with one link, from a laptop or a phone | index | `e2e_friend_flow`, `e2e_invite_one` | Proven | |
| Shared through Tailscale Funnel or a Cloudflare tunnel | docs | Code and docs; the tunnels are never started in tests | Real-device-only | |
| The desktop app keeps itself up to date | index, docs | `e2e_updater` with a mocked update; the installed app's updater has not been watched end to end | Real-device-only | |
| Windows, Mac (Apple Silicon) and Linux installers | index, docs | GitHub release v0.36.0 has all of them | Proven | |
| Zero npm dependencies, plain files and git, MIT | index | `package.json` has no dependencies; `LICENSE` | Proven | |
| Chat, docs and code are plain files you can take with you | index | `e2e_export`, `e2e_files_local` | Proven | |

## Phones

| Claim | Where | Evidence | Status | Was |
|---|---|---|---|---|
| Open a friend's link, type a name, join; no app store | index | `e2e_mobile2`, `e2e_friend_flow` on a simulated phone | Proven | |
| Add it to your Home Screen as a full-screen app | index, docs | `e2e_pwa` (manifest and install checks) | Real-device-only | untagged |
| One-tap approvals from a phone | index | `e2e_mobile_complete`, `e2e_notify` | Proven | |
| Web Push notifications | index, docs | `e2e_notify` ("2 pushes recorded") against a mock push service | Real-device-only | untagged |
| Start a tribe right on the phone and move it later | index, docs | `e2e_mobile_complete` (`e2e_phone_solo` fails on one check today: a pretend person answers in solo mode) | Partly | |

## Honesty rules

| Claim | Where | Evidence | Status | Was |
|---|---|---|---|---|
| No prices are shown | pricing | `site_facts_test` (fails on any price); plan cards say "Price soon" | Proven | |
| "No reviews yet"; every review is from a real person | pricing | `site/reviews.json` is empty; `e2e_reviews` | Proven | |
| Remix projects are MIT or CC0 | index | Licences match what each project publishes as far as known; this sandbox could not open those GitHub pages to re-read them | Unproven | |
| Tool names and logos belong to their makers | every page footer, toolbox | `docs/SCREENSHOT-PERMISSIONS.md` | Proven | |
| Open-source numbers box | index | Shows the packaged version; with no answer from GitHub it hides the empty tiles and says where the numbers are | Proven | showed an error sentence |
| Each AI helper uses its owner's own subscription or key | docs | `e2e_any_llm`, `security6_test` | Proven | |
| Secrets and other people's DMs are never in a saved copy | docs | `security4_test`, `security6_test` | Proven | |
