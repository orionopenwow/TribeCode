# Launch kit

Everything a beginner needs to put an app in the App Store and Google Play, built in, free, with no account elsewhere to start. The person-facing page is [guide/16-launch-kit.md](guide/16-launch-kit.md); this page is for builders.

## Where it lives

| Piece | File |
|---|---|
| Workspace (six tabs) | `app/ui/launchkit.js`, `app/ui/launchkit.css` |
| Catalogues, limits, checks, drafts, checklist, suggestions (no drawing; loads in Node too) | `app/ui/launchkit-core.js` |
| Every picture: screenshots, feature graphic, icons, paywalls, stand-in screens, RGB PNG encoder | `app/ui/launchkit-draw.js` |
| Storage: `GET`/`PUT /api/projects/:id/launchkit`, `.tribe/launchkit.json` | `server/launchkit.js` |
| AI prompts `store.listing`, `store.translate` (used only when an AI is on) | `app/ui/aibasics-core.js` |
| Tests | `app/test/launchkit_test.js`, `app/test/e2e_launch_kit.py` |

Entry points: **Publish › Where it goes › Launch kit** (apps and games, `publishreal.js`), the Publish sheet when a project has no code yet (`publish.js`), Ctrl K, Flint (`launch.*` intents in `flintnlu.js`, run in `flintlocal.js`), and two quick guides (`launch-kit`, `store-shots`).

## What it makes

- **Screenshots**: 50 styles. A style is `{ layout, bg, type, frame }` from 18 layouts, 11 backgrounds, 5 type treatments and 5 frames; colors always come from the brand kit, and the unit test checks every two styles differ in at least two of the four parts. Sizes: iPhone 6.9" 1320×2868, 6.5" 1284×2778, 6.1" 1206×2622 (the set Apple needs), iPad 13" 2064×2752, Google Play phone 1080×1920 and tablet 1600×2560, and the 1024×500 feature graphic. Files are true RGB PNGs (color type 2, deflated with the browser's `CompressionStream`), because App Store Connect refuses images with an alpha channel.
- **Icons**: 54 styles from 11 backgrounds × 10 glyphs × 7 plates × 2 weights, the person's letters, one of 20 stroke symbols, or their own picture. The zip holds `ios/AppIcon-1024.png` (no alpha), `android/play-store-512.png`, the adaptive foreground (432, glyph inside the 66% safe circle, transparent) and background, and the web icons with a maskable one (glyph inside 80%), plus `manifest-icons.json`.
- **Store text**: App Store name 30, subtitle 30, keywords 100 bytes, promotional text 170, description and what's new 4,000; Google Play title 30, short description 80, full description 4,000. Checks: over the limit, ranking or download claims, emoji in Play's short description, shouting, tags in the App Store description, keyword spaces, repeats, words already in the name or subtitle, keywords under three characters. The first draft uses only the project's own words (name, vision, sense summary and audience, finished tasks). No search volumes or rankings are ever shown or invented.
- **Paywalls**: 17 layouts drawn as blocks (plan list, cards, features first, Free or Pro, one offer, big picture, tiles, trial timeline, monthly or yearly, checklist, three tiers, what you unlock, bottom sheet, pay once, spotlight, plan chips, last onboarding step). Each also exports as a self-contained HTML screen that says payments are not connected. Example prices belong to the person's own app; TribeCode's own prices never appear.
- **Checklist**: 12 Apple and 12 Google steps in plain words, each with a button to where TribeCode helps (a tab, Publish, the privacy policy template, or the store's page) and a notes box. Saved per project.
- **Preview video**: Apple's sizes and lengths, a check of the Play YouTube link, and the hand-off to Motion Studio.

The words drawn into designs (sample screens, paywall blocks) go through the app's language, and 52 headline starters and 12 second lines are translated in the seven app languages.

## Hooks for other features

Feature-detected; nothing breaks when they are missing.

- **App Creator**: `TribeAppCreator.screens(pid)` → `[{ id, name, image }]` or `[{ id, name, render(w, h) → canvas | dataURL }]` adds screens to the picker. `TribeAppCreator.insertScreen({ name, html, image, kind: 'paywall' })` turns on **Add to my app** on the Paywall tab. `TribeLaunchKit.paywalls()` returns the 17 layouts as `{ id, name, model(), html(model, brand), render(canvas, w, h, model, brand) }` for the App Creator's own template list.
- **Motion Studio**: `TribeMotionStudio.open({ template: 'app-preview', screens: [{ name, image }], size: { w: 886, h: 1920 }, brand, name })`. Without it the button is disabled and the tab says how to record the screen by hand.
- **Suggestions**: when `TribeSuggest.register` exists (also on `tribe:suggest-ready`), the kit registers `{ id: 'launch', title: 'Launch', gather(ctx), suggest(ctx, gathered) }`. Suggestions: new screens in Visuals since the screenshots were made ("Refresh your store screenshots"), release notes in chat ("Draft What's New"), and keywords that repeat the name, subtitle or each other ("Free up N keyword characters"). Each `apply()` saves the change and returns an undo that restores the record exactly.

## Store rules, with sources

Paraphrased from these pages, read 2026-11-15. Not legal advice; the checklist tells people to read them again before submitting.

- [App Store screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/): 6.1" iPhone set required (1179×2556 or 1206×2622), 6.9" and 6.5" optional, 13" iPad when the app runs there; JPEG or PNG with no alpha; 1–10 per size.
- [App Store app preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/): 15–30 seconds, up to 30 fps, up to 500 MB, up to three per size; iPhone 886×1920, iPad 1200×1600.
- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/) and [platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/): name and subtitle 30 characters, promotional text 170, description 4,000, keywords 100 bytes.
- [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151): icon 512×512, feature graphic 1024×500, screenshots 320–3840 px with the long side at most twice the short side, two to eight per device type, 1080×1920 or larger for large-format spots; no ranking or call-to-action wording in the short description.
- [Google Play listing text](https://support.google.com/googleplay/android-developer/answer/13393723): title 30, short description 80, full description 4,000.
- [Testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465): a closed test with at least 12 testers opted in for 14 days in a row.

The App Store icon spec page could not be opened when this was written; the "1024 px, no transparency" rule comes from App Store Connect's long-standing behaviour and should be checked against Apple's current page.

## Design notes

Device frames are our own plain shapes (rounded body, screen, a camera dot), never a maker's artwork or trademark. Store art may use flat color blocks and patterns; app chrome follows the design system (tokens only, 1px borders, no gradients or glows). The references for the bar (AppScreens, The App Launchpad, RocketSim, aso.dev, Astro, Superwall, kickstart.tools) were used for ideas only.
