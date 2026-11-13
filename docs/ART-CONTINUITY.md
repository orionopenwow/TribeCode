# Art continuity: the website against the app

Checked 2026-11-12 against v0.31.2 (the showcase demo at 1440×900 and 390×844). The website's pictures of the app should look like the app people download. When the app's shell or icons change, rerun this pass: screenshot the app, screenshot the site's mocks, compare, adjust.

`node scripts/dev/site-icons.js` regenerates `site/app-icons.css` from `app/ui/icons.js` (and the `<symbol>` icons in `app/ui/index.html`), so every mock icon on the site is the app's own line icon. `npm test` runs it with `--check` and fails when the two drift.

| Site art | App source | Status before | Change made |
| --- | --- | --- | --- |
| Logo mark, wordmark, favicons, app icons (`site/assets/brand/*`) | `app/ui/assets/*` | Byte-identical | None |
| Flint mascot (`assets/brand/flint.svg`, the big Flint on the Flint page, the flier, the panel button) | `app/ui/assets/flint.svg` | Same file and the same two colors (Ember body, dark eyes) everywhere | None |
| Illustrations (`assets/illustrations/*`) | `app/ui/assets/illustrations/*` | Identical | None |
| Site palette (`site/styles.css` `:root`) | The app's default Campfire theme (`app/ui/themes.css`) | Matches Campfire | None |
| Hero mock icons (sidebar rows, chat header actions) | `app/ui/icons.js` line icons | CSS-drawn squares and circles standing in for icons | Masks of the app's icons (`site/app-icons.css`) |
| Hero mock rail | `app/ui/rail.css`: rounded-square tiles, accent bar on the active one, a Workshop wrench tile | Round circles, no Workshop tile | Rounded-square tiles, wrench tile added |
| Hero mock sidebar footer | v0.31 `sidefoot.js`: Preview and Invite friends as plain rows, small faces | Two bordered buttons with emoji | Plain rows: preview icon, faces stack |
| Hero mock you-bar | `userbar.js`: bell and settings icons | Name only | Bell and gear icons |
| Hero mock top bar | v0.31 People button | Help only | People icon before Help |
| Flint page mock (rail, top bar, you-bar, chat header, Design row icon) | Same as above | Same drift, Design used the whiteboard icon | Same fixes; Design uses the app's design icon |
| "Whole studio" Docs mock file tree | `filesview.js` line icons | Emoji per file | App line icons (docs, checklist, notes, sheets, slides, whiteboard, spark) |
| Widgets tab count | Marketplace v2: 553 items | "575 add-ons" | "550+ add-ons" (the Docs page now says 553 from the docs pass) |
| Flint chat panel and button on the site | Flat matte rule (no shadows) | Drop shadows | Shadows removed |
| Social card (`assets/og-image.png`) | Current app shell and the site's headline | v0.2x app (bordered footer buttons) and the old "Each with your own Claude" line | Rebuilt from a current app screenshot with the current headline; `scripts/readme-shots.py` writes the same layout next time |
| Phone mock rack (Home · Chat · Docs · Tasks · Agents) | `mobile2.js` rack | Matches | None |
| Design section mock (canvas Simple mode, Flint pane) | v0.28 canvas + Flint pane | Matches the canvas; v0.31 adds the Design creation flow before it | None (the flow's first step could get its own mock later) |
| Company mock (Lantern Games seats and standup) | v0.31 Company report | Same seats and charter idea; the report layout differs | None (a later pass can show the one-page report) |
| Pixel characters, campfire scene, starter thumbnails, template thumbnails | Site-only art (the app's demo uses the same characters) | Consistent pixel scale | None |
