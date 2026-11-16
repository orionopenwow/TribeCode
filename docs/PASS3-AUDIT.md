# Pass 3 audit: the creator area

2026-11-16, on `fix/pass3-holes` (from `integ9` at 63f7a1a3, v0.39.0 ready). A beginner's walk through Design, the website designer, App Creator, Motion Studio, Share a clip, the Launch kit, Suggestions, the design library, Learn and the new site page, in a real browser at 1440 and 390 px, in English and Spanish. Tools: a crawler that opens each surface and measures it (console errors, sideways overflow, tap targets, plain-language words, emoji in chrome, English left in Spanish, open time, Escape), plus probes for lost work, keyboard focus and who may change what on the server.

Severity: **high** loses work or blocks a task; **medium** confuses or hides something; **low** polish.

## Issues

| # | Where | What | Severity | Status |
|---|---|---|---|---|
| 1 | App Creator, Motion Studio, Launch kit | A change made in the last half-second before the tab reloaded or closed was lost (saves wait 500–600 ms) | high | Fixed: pending saves go out with `keepalive` on hide or close, as the website designer already did. Test: `e2e_app_creator` types, reloads at once, finds the words on the server |
| 2 | App Creator, from the Design gallery | Picking a template when the project already had an app replaced it and saved over it at once; Undo only lasted until App Creator closed | high | Fixed: the gallery asks "Start over from this template?" with Keep my app / Start over. Test in `e2e_app_creator` |
| 3 | Quick guides "Make a phone app" and "Link screens and play them" | Show me went nowhere: `go: 'design'` is not a place in the shell, so the App tile was never ringed | medium | Fixed in `quickguides.js`. Test in `e2e_learn` |
| 4 | Ctrl K / Flint "Design" | Opened an empty canvas, while the sidebar row opens the Design creation flow (two ways, two results) | medium | Fixed: the `canvas` place opens the flow inside a project, like the row. Test in `e2e_learn` |
| 5 | Website designer panel | The tabs scrolled sideways with a hidden scrollbar; in a 320 px panel **Check** was off the edge and unreachable with a mouse | medium | Fixed: the tabs wrap. Test in `e2e_site_studio` (fails without the fix) |
| 6 | Design library | The kind tabs did the same with a mouse; in Spanish the last kind ran past 1440 px | medium | Fixed: they wrap where the pointer is a mouse; phones keep the swipe row. Test in `e2e_asset_lib` |
| 7 | App Creator | Tab walked out of the full-screen editor into the app behind it (sidebar, rail) | medium | Fixed: the app behind is `inert` while App Creator is open and comes back on close. Tests in `e2e_app_creator` |
| 8 | Translation runtime | A pattern like "Add {what}" turned untranslated English into half-Spanish ("Añadir a link for…") | medium | Fixed in `i18n.js`: a word slot filled with several untranslated words no longer matches; quoted slots (somebody's words) still do. Tests in `i18n_runtime_test` |
| 9 | Design flow and website designer chrome | 36 strings (kinds, gallery, panel help, Flint chips, the template credit line) were English in every language | medium | Fixed: rows in all seven languages |
| 10 | Phone tap targets (390 px) | Under 36 px: website designer panel tabs (32), page tabs (30), undo/redo (34 wide); Flint chips (32), clear (24), composer buttons (30/26); App Creator and Motion name fields (25/27), Motion's Flint box (20); Share a clip tab "X" (33 wide); the shared sheet close (32); Design's "All kinds" (24); dashboard gear/bell (32) and idea dismiss (26) | medium | Fixed with sizes or 36–40 px hit areas that keep the look |
| 11 | Dashboard Getting started | Emoji in chrome (🚀 eyebrow, ✨ on Help me write, emoji step icons) against the design rules | low | Fixed: stroke icons from `icons.js` |
| 12 | App Creator | Selection ring and floating toolbar used palette hex, so they stayed dark in the light theme | low | Fixed: tokens |
| 12b | Flint, "show me an ocean palette" | Since the design library, a named palette came back as bare hex text: the swatches and contrast line were gone | medium | Fixed in `flintmax.js` (swatches back, "Ocean palette: …"). `e2e_flint_max` passes again |
| 12c | Add-on shelf | `app/ui/market-catalog.json` was out of date after the shelf colour packs, failing `market-catalog --check` and `e2e_market_v2` | low | Regenerated |
| 12d | Tests | `e2e_publish_phone` and `e2e_site_flint` still expected the publish rows and site menu from before Share a clip and the Apps, clips and store pages page | low | Updated |
| 13 | App Creator | "Undo brings back your earlier design" toast | low | Correct as written (it only shows when there was an earlier design); now rarer because of #2 |
| 14 | Plain words | "Code repository" / "No code repository yet" / "Set up the code repository" on the dashboard, the Code page title and Flint's names | medium | Not fixed: it is the name of a whole place (shell, Flint, Guide); renaming it is a product decision. Suggest "Code" |
| 15 | Website designer templates | 45 template one-line descriptions are English in every language | low | Not fixed (the known ~1,250 untranslated strings) |
| 16 | Website designer | Using a template over an existing site: same question as #2 is worth having | low | Not checked deeply; drafts and Undo exist there |
| 17 | Roles on the server | App, motion, launch kit, suggestions, site and brand routes all refuse spectators and require a member; group-style permissions (`site.edit`) are not applied inside the new tools | medium | Left for CW (co-work and roles) |
| 18 | Website hero/home (site/index.html) | The animated mock chat says "We ship the demo on Friday" / "Ship it" | low | Left: it is example chat between people, not UI |

Checked and fine: every script and stylesheet in `index.html` is in the service worker's `SHELL`, and every `SHELL` file exists; NOTICE credits three.js, ThreeUI, Inter, the site templates and the starters; open times are under 0.6 s for every tool; no console errors inside the tools; Escape closes each tool and the sheets; reduced motion is respected in App Creator, Motion Studio, Share a clip and the Launch kit; site numbers match `site/facts.json`.

## Features to suggest (ranked by impact for beginners)

1. **One "Make" button that remembers.** Design, App, Motion and Launch each open their own way; a single Make sheet with "Continue where you left off" would cut the first-week confusion most.
2. **Versions for designs.** Apps, sites and motion graphics keep only the latest copy on the server. A short history (last 20 saves, restore) would make #2-style mistakes painless everywhere.
3. **Rename "Code repository" to "Code"** across the shell, Flint and the Guide (#14).
4. **Translate the template blurbs** (#15) and the rest of the dashboard; Spanish users meet English on the first screen.
5. **"Show me" for every quick guide that points at a place**, checked by a test that walks all of them (this pass found two that went nowhere).
6. **A visible scroll cue** for the remaining swipe rows on phones (Launch kit starters, library kinds): a fade at the edge.
7. **Ask before replace** in the website designer too (#16).
8. **Group-style permissions inside the editors** (#17), so a council's "Change the website" rule holds in App Creator and Motion Studio as well.
