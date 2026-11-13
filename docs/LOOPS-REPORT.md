# Loops report (2026-11-12, against v0.31.2)

A pass to close the loops: every core journey works end to end, and the full `npm test` list is green. Journeys
were walked on desktop (1280) and phone (390) through the Playwright suites named below.

## The suite

- Before: 110 of 135 passed when run three at a time. Most of the 25 failures were load or port collisions between
  parallel runs, but 8 were real (below).
- After (on v0.28): all 135 passed when run one at a time. Under parallel load a few long suites can still time out
  (e2e_tribe, e2e_setup_flow, e2e_flint_free, e2e_loops, e2e_agents_dash); they pass alone and in `npm test`, which
  runs one after another.
- Re-checked after merging v0.31.2: e2e_loops, e2e_tribe, e2e_setup_flow, e2e_nav, e2e_sidebar_widgets,
  e2e_offline_demo, e2e_mobile, e2e_hub, e2e_qa_qol2, e2e_shelf, e2e_richtext, e2e_coedit, e2e_notify, e2e_company,
  e2e_showcase, e2e_crafts and e2e_agents_dash pass (crafts and agents_dash needed a second run: timing, not a bug).
- v0.31.2 had already fixed four of the same things independently (the cursor layer drawn once per frame, no autosize
  on the rich editor, slides winning over the build recipe, and the stale company/showcase/agents-dash tests); this
  branch keeps main's versions of those.

## Journeys

| Journey | Covered by | Result |
|---|---|---|
| a. Fresh open → Make it yours → Flint tour → first project → Preview "What should it be?" → Flint free build → Properties edit → Publish play link | e2e_fresh_open, e2e_flint_free, e2e_preview_focus, e2e_publish | works |
| b. Invite a friend (tribe link + one-time) → phone join → chat, DM, task assign → Inbox/push → approvals | e2e_loops, e2e_friend_flow, e2e_notify, e2e_phone_features | works; invite dialog race fixed |
| c. Connect your AI → `claude mcp add` → MCP client takes a task, `code_write` → preview reloads → answers a comment pin | e2e_loops (new), e2e_mcp_directory, e2e_pins | works |
| d. Design: Simple Flint "make a login screen" → Advanced → Send to app → preview → Open in canvas | e2e_canvas_flintpane, e2e_canvas_code, e2e_canvas_ai | works |
| e. Website template: link in bio in Easy → edit → publish | e2e_site_templates (Easy form → preview), e2e_loops (edit → publish → play link) | works |
| f. Phone-only tribe → move to a host | e2e_phone_solo | works |
| g. Repo + sync line; cloud save/restore; settings persist | e2e_repo, e2e_setup_flow (local git remotes, not github.com), e2e_tribe, e2e_personalize, e2e_themes | works locally; real GitHub not exercised |
| h. Company, Money, Marketplace | e2e_company, e2e_ledger, e2e_market | works; company test matched to the current sidebar rule |

## Broken → fixed

- **Phone push on a free cloud host** stopped after every sleep (keys and subscriptions are wiped, and cloud save
  never copies secrets). Now the keys can come from `TRIBE_VAPID_PUBLIC` / `TRIBE_VAPID_PRIVATE`
  (`node scripts/dev/vapid-keys.js` makes a pair; render.yaml lists both; docs/CLOUD.md explains), and every browser
  that already allowed push re-sends its subscription on each connection, re-subscribing if the keys changed.
- **Live preview over Cloudflare quick tunnels**: they don't stream Server-Sent Events. The preview's live channel now
  sends a heartbeat, and the page falls back to asking `?poll=1` every 3 s when the stream fails or goes quiet. (The
  preview was the only Server-Sent Events user; everything else is on the WebSocket, which tunnels carry.)
- **Invite dialog**: closing or replacing the dialog while an invite was still being made threw an error
  (`#inv-link` null). It now just finishes quietly.
- **Typing in a long doc** took 37–47 ms per key in a 20k-word doc (budget 25). Friends' cursor overlay re-measured the
  text on every keystroke, the editor's autosize forced a full layout, and every paragraph was laid out. Now the cursor
  layer draws once per frame, the rich editor skips autosize (it sizes itself), and offscreen paragraphs skip layout
  (`content-visibility: auto`). 17.7 ms per key.
- **"make slides about our game jam"** started a game build (the word "game" won). Slides, docs and sheets now win
  over the build recipe.
- **Agents Hub**: after your first agent connects, "See all tools" disappeared with the empty state. It now stays on
  the hero card.
- **Sidebar widget text** under 13 px (agent counts and the colour key) is 13 px now.
- **Stale tests** updated to the current UI: the showcase site (docs page title, links, lazy images in closed tabs,
  the phone menu's main Docs link), the empty Dashboard's docs link, the Toolbox heading naming the project's first
  kind, Company starting from Ctrl K, and route teardown races in two tests.

## What remains (needs real devices or accounts)

- Real iPhone: Add to Home Screen, Web Push (iOS 16.4+, only from the Home Screen app), speech, voice in huddles.
- Real Android: Termux host run, push.
- Tailscale Funnel approval on the host PC (one time) and a real friend joining over it.
- A Cloudflare quick tunnel end to end (the polling fallback is tested locally without SSE, not through Cloudflare).
- Render one-click deploy with the two push keys set, a sleep, and a phone still getting a notification.
- GitHub, Discord and Google sign-in with real OAuth apps; a real GitHub repo create/push/pull (tests use local git
  repos as remotes).
- Code signing: Windows and macOS installers are unsigned, so SmartScreen and Gatekeeper warn on first open.
- Stripe sync for Money with a real read-only key.

## v0.32 holes pass (fix/holes-v032)

Suite: first full run 170/185 with two lanes in parallel. Every failure was rerun alone; all 185 now pass.

Real fixes:
- Phone-only Flint: "make a doc/sheet/slides" and launch/readme/notes drafts said "This needs a real tribe". `phonelocal.js` now answers `/flint/make` (the same templates as the server) and `/flint/draft` (from the project's tasks and vision) on the phone. "Build a to-do app / make a website" starts a matching Design starter on the phone. Calls, screen share and invites on a solo tribe open the nextopts sheet instead of a dead "Camera on.". "Connect github" is a new intent (phone: the GitHub sheet; host: Repo).
- "What did we decide today" crashed on a phone (captures returned no quotes); it now needs a topic to go to captures and answers plainly when nothing is found. "Meeting notes from today" was read as a calendar event; NLU fixed. "Clean this up" eval regression fixed. NLU cases 760/768.
- Phone calendar `upcoming` now returns the server's shape (kind, at, due, overdue), which fixed a pageerror in plan.js on the mobile Home.
- i18n: 58 app strings from the call, huddle, voice-note, nextopts, GitHub-phone and Flint merges added in all 7 languages; 20 site strings added to every site/lang file.
- Stale tests: e2e_flint (invite answer moved), e2e_chat2 (chat head buttons), e2e_agents_dash (wait for the repaint before the next tap). e2e_phone_solo now checks phone-only Flint make, draft, decide, build and invite.

Checked and clean: sw.js SHELL covers every file index.html loads and CACHE is intact; call shortcuts and the help sheet agree; offline demo and showcase open all 17 areas at 1280 and 390 with no console errors; fresh desktop, phone-only and joined-phone opens have no console errors.

Flaky only under parallel load (pass alone): e2e_rooms, e2e_preview, e2e_instant, e2e_updater, e2e_overview2, e2e_modes, e2e_openspace, e2e_selfheal, e2e_themes, e2e_first_run.

Not fixed: a 3D build on a phone-only tribe has no 3D starter, so Flint starts the platformer starter and says so.
