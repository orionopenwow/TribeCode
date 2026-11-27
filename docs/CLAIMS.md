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
| The website designer has 25 templates, each with a layout of its own | docs, README | `app/ui/sitetpl/catalog.json` (the entries without `retired`); `site_variety_test` counts them, checks no two share a structure, and renders all 25 at 1280 and 390 px | Proven | False (said 61, counted with the 38 since retired) |
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
| Every word, picture and button on your site is editable; one small toolbar; right-click; drag to reorder | index | `e2e_site_editable` (every template in the catalog, offered and retired) | Proven | not on the site |
| Suggestions from your tribe: one-tap changes with who said it, nothing changes until Apply, Undo takes it back | index | `e2e_site_suggest`, `sitesuggest_test` | Proven | not on the site |
| Moving backgrounds pause off screen and show a still picture for reduced motion; ten are ThreeUI ports (MIT) | index | `e2e_site_fx`; `docs/SITE-3D.md`, `NOTICE` | Proven | not on the site |
| One lead, a council, everyone equal, or your own roles; the app says who can and offers to ask | index, mission | `e2e_group_styles`, `security10_test` | Proven | site said CEO and C-suite only |
| Learn: quick guides with a button that does it and Show me; lessons under Skills | index | `e2e_learn` (`e2e_help_next` fails today on an unrelated check: one path page is over its word limit) | Proven | not on the site |
| Change language from the ? menu, the first screen or Settings | index | `e2e_i18n_audit`, `i18n_runtime_test` | Proven | not on the site |
| The app's menus are only partly translated | index, docs | `docs/I18N-REPORT.md` (about 1,250 strings per language still English) | Proven | False ("the app comes in" eight languages) |

## App Creator, Motion Studio, Share a clip, Launch kit, Suggestions (create.html, the home page's creator section)

Checked 2026-11-15 on branch `feat/site-demos` (wave 1 merged in `integ9`).

| Claim | Where | Evidence | Status | Was |
|---|---|---|---|---|
| 54 apps to start from, 56 app looks, 27 app parts and 24 ready-made screens | create, index | counted by `scripts/dev/site-facts.js` from `app/ui/appcreator-core.js`; `e2e_app_creator` | Proven | |
| Click any word to change it, link a button to another screen and press Play | create | `e2e_app_creator` | Proven | |
| Change the look once and every screen follows | create | `e2e_app_creator` | Proven | |
| Flint stacks screens on ("add onboarding", "add a settings screen"); shelf kits drop in | create | `e2e_app_creator`, `flint_eval_test` | Proven | |
| Export a phone web app that works offline | create | `e2e_app_creator` (taps through the export in a browser) | Proven | |
| An Expo project export | create | Written by `server/appcreator.js`; never built or run on a phone | Real-device-only | |
| 128 motion templates, including 69 social post layouts | create, index | counted from `app/ui/motionkit.js` + `app/ui/motionsocial.js`; `motionkit_test`, `e2e_share_clip` (every social layout looks different) | Proven | |
| Every clip on the page was drawn by the app's own engine | create, index | `scripts/dev/site-demos.py` renders them with `motionkit.js` | Proven | |
| One shape that never cuts; the last frame is the first, so it loops | create | `motionkit_test`, `e2e_motion_studio`, `e2e_share_clip` (share clips loop) | Proven | |
| 54 motion feels; "snappier" and "make it 9:16" change it through Flint | create | `motionkit_test`, `flint_eval_test` (motion cases) | Proven | |
| Your own song: the tempo is found in the browser and changes land on the beat | create | `e2e_motion_studio`, `motionkit_test` (analyze) | Proven | |
| Export a video, a GIF, a picture, one web page, or a section of your website | create | `e2e_motion_studio` (WebM, GIF, PNG, HTML, site section); MP4 needs a CDN library this sandbox cannot load | Partly | |
| A clip of your project from app screens, a screenshot, a timelapse or your pictures, in 9:16, square or wide | create, index | `e2e_share_clip` | Proven | |
| Captions for X, TikTok and Instagram with each limit counted | create | `e2e_share_clip`, `shareclip-core.js` | Proven | |
| A "Made with TribeCode · Remix" end card you can turn off | create | `e2e_share_clip` | Proven | |
| 50 screenshot styles and 54 icon styles, at the exact store sizes, with our own frames | create, index | counted from `app/ui/launchkit-core.js`; `e2e_launch_kit`, `launchkit_test` | Proven | |
| 17 paywall designs; payments are not connected and the designs say so | create | `e2e_launch_kit`, `launchkit_test` | Proven | |
| A 24-step checklist for Apple and Google, not legal advice | create | `launchkit_test`; `docs/LAUNCH-KIT.md` sources | Proven | |
| Suggestions: who it came from, nothing changes until Apply, Undo, learns from applies and dismissals | create | `e2e_suggest_engine`, `suggest_core_test` | Proven | |
| Photos are read on your own device and never sent anywhere | create | `e2e_suggest_engine` (palette read in the page at 64px); `docs/SUGGESTIONS.md` | Proven | |
| It works while your computer is idle | create | `e2e_suggest_engine` (idle time, never blocks typing) | Proven | |

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
| Agents & office says what is private and what is not: messages and files are not end-to-end encrypted, and the computer that runs the tribe keeps them as plain files | app (What's private) | `e2e_agents_office` checks the sheet says "not end-to-end encrypted" and never claims encryption that isn't real | Proven | |
| Only the two people in a private message can open it; AI helpers can't read private messages, and DM text never shows on the office | app (What's private) | `e2e_agents_office` (a third member is refused, the office has no DM text), `e2e_invite_agent` (no agent reads DMs), `e2e_office` | Proven | |
| Private messages between two people are end-to-end encrypted: each device makes a P-256 key pair in the browser, and messages are sealed (AES-GCM, a fresh key per message, sealed to each of both people's up to 8 latest devices) before they leave | app (DM header, compare screen), privacy page | `e2e_private_dms` (the stored DM is `text: ''` + `enc`, sealed to exactly the two people) | Proven | Was "not built yet" |
| The host's computer and the server store only ciphertext: no file in the tribe folder or the server log holds the words | privacy page | `e2e_private_dms` searches every file in the tribe folder and the log for the words after each send | Proven | |
| A third member can't read a private message, even given the stored copy | privacy page | `e2e_private_dms` (403 from the server; the third member's device returns "no key" for the stored copy) | Proven | |
| Waiting (offline) private messages are queued as ciphertext | privacy page | `e2e_private_dms` stops the server, sends, checks the outbox and its saved copy have `enc` and no words | Proven | An unsent draft in the composer stays on the writer's device in plain text, as before |
| Notifications, Home's Messages and the in-app toast say "New message", with no words | app, privacy page | `e2e_private_dms` (`/api/notify/inbox`, `/api/hub/inbox`, the toast) | Proven | Push delivery itself is real-device-only |
| Private keys can't be exported, so exports, backups and copies never include them; encrypted DMs in a backup stay ciphertext | privacy page | `e2e_private_dms` (`exportKey` on the private key fails; no key material in the tribe folder; `.tribe/device-keys.json` holds only `d`, `pub`, `at`) | Proven | |
| A new device says plainly that older private messages can't be opened there; moving them from an old device isn't built | app (bubble, compare screen), privacy page | `e2e_private_dms` (a second browser for the same person shows the line; new messages open on both devices) | Proven | |
| "Check it's really Maya": a safety number both people can compare | app | `e2e_private_dms` (10 groups of 5 digits, the same on both sides) | Proven | The number covers both people's active devices, so it changes when a device is added |
| What is not encrypted is listed: channels, names, who talks to whom and when, pictures, voice notes and files, AI helper chats | app (compare screen), privacy page | `e2e_private_dms` checks the list | Proven | |
| An AI helper chat is not encrypted and says the helper and its AI provider can read it | app (DM header) | `e2e_private_dms` (the helper DM is stored as plain text and the header says so) | Proven | |
| Older plain DMs stay readable | app | `e2e_private_dms` | Proven | |
| The connection is encrypted when the address starts with https or goes through Tailscale; on localhost nothing crosses the network | app (What's private) | Worked out from the tribe's address in `app/ui/agentsoffice.js` (`privacyFacts`); `e2e_agents_office` checks the localhost line; https and Tailscale addresses are never served in tests | Partly | |
| Your GitHub sign-in stays on the computer that runs the tribe and never comes back to a browser | app (What's private) | `e2e_github_connect` (no answer to a browser carries the token) | Proven | |

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
