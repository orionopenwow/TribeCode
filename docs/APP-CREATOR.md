# App Creator

Design a phone app screen by screen, click anything to change it, link taps between screens and play it as a
prototype, then export a working phone web app, an Expo project, or a brief for the AI helpers.

## Where an app's screens live (the decision)

An app is **one JSON design per project**, saved on the host like the website designer's config:
`.tribe/appdesign/<project>.json`, through `GET|PUT /api/projects/:id/app-config` (`server/appcreator.js`). With no
tribe it stays on the device (`localStorage`, like the website designer's local design).

It shares the website designer's editing model rather than its file:

- **The same idea of a design.** A site is pages of blocks; an app is screens of blocks. Both are one JSON document,
  normalized on every save, where every change is one Undo and Flint's sentences become the same edits as the toolbar.
- **The same editing feel.** Words are typed in place (`data-e`), one outline and a small toolbar per selection, Esc
  steps out, Delete removes, Ctrl Z / Ctrl Shift Z.
- **The same brand kit.** Look › Brand kit reads and writes `GET|PUT /api/projects/:id/brand`, the kit the website
  designer and the Design canvas already share.
- **The same entry.** Design › App opens App Creator, as Design › Website opens the website designer. The open-source
  code starters stay in the same gallery under "Start from code".

It is a separate document because a phone app is not a web page: screens instead of a scroll, links that move with a
transition, tab bars, sheets, the phone's own look (iPhone or Android), and exports that are apps (an installable web
app, an Expo project) rather than HTML pages. Forcing both into one schema would make each worse.

## Files

| File | What it holds |
| --- | --- |
| `app/ui/appcreator-core.js` | The engine, no DOM: normalize, the 27 components, themes and the 56 named looks, edits (`apply`), the prototype runtime (`AxRun`), the exports (`pwa`, `expo`, `brief`). Shared by the browser, the server and the tests. |
| `app/ui/appcreator-data.js` | Icons, the first 12 templates, the first 10 screen kits, component defaults. |
| `app/ui/appcreator-more.js` | 42 more templates and 14 more screen kits. |
| `app/ui/appcreator.js` / `.css` | The editor: Screens / Add / Look on the left, the phone in the middle, the selection and Flint on the right; a rack of sheets on phones. |
| `server/appcreator.js` | Saving (with a revision so two people never overwrite each other silently) and exporting into the project. |
| `app/test/e2e_app_creator.py` | The end-to-end test. |

## What is in it

- **54 templates** in 13 groups (Health, Productivity, Money, Social, Shopping, Food, Travel, Learning, Games, Creator
  tools, Business, Family, Utilities). Every template has two or more screens, realistic example data, and every screen
  can be reached from the first one. Seven are marked as standouts for demos: Habit tracker, Recipes, Social feed,
  Meditation, Game menu, Trip planner and Music player.
- **27 components** (top bar, big title, tab bar, list, card row, feature card, form, search and chips, chat, feed post,
  profile header, settings rows, welcome pages, sign in, empty state, paywall layout, chart, media player, map, button,
  paragraph, picture, stat tiles, checklist, timer, tile grid, day and time picker) and **24 screen kits** (settings,
  onboarding, paywall, profile, sign-in, chat, shop, stats, empty state, player, search, notifications, cart and checkout,
  detail, feed, booking picker, timer, map, help, about, leaderboard, achievements, invite friends, permission ask).
- **56 named looks.** Each differs from every other in more than colour (light or dark, type, corners, spacing,
  background, motion or icon weight). Every theme control is also there on its own.
- **Prototype.** Links move with Slide, Sheet, Fade or Grow (the tapped element grows into the next screen). Toggles,
  checklists, chips, the day picker, plans, likes, play buttons, the chat box and search filtering work in Play and in
  the export. Reduced motion makes every transition instant.
- **Payments stay off.** Paywall and checkout screens are layouts; the paywall always says "Payments are not connected:
  this is a design", and the shop templates' confirmation screens say no payment was taken.

## Export

Since pass 4 the phone web app is also written by itself: `app-web/` in the project folder follows every save
(`server/designfiles.js`, `docs/WHERE-IT-LIVES.md`), with `app-design.json` beside it. Export never empties a folder:
files a person added to `app-web/` or `app-expo/` stay. A change the tribe has not confirmed is kept on the device
(`tribecode.appcreator.unsent.<project>`) and sent when the tribe can be reached again.

| Choice | What happens |
| --- | --- |
| Try it in the live preview (was "Save into the project") | `POST /api/projects/:id/app-config/export { kind: 'pwa' }` writes `app-web/` in the project's code: `index.html`, `app.js` (the same runtime as Play), `sw.js` (offline), `manifest.webmanifest`, `icon.svg`, the fonts with their licence files. The live preview finds `app-web/` when the project has no other web root, so it opens on any phone through the preview link. A project with no code folder gets one first. |
| Download the phone web app | The same files as a zip, made in the browser (works with no tribe). |
| Expo project | `app-expo/`: `design.json` (the design as JSON) and an `App.js` that draws it with React Native's own pieces and Expo's icon set. When the project has no phone app yet, phone app mode points at `app-expo/`, so the Phone app card installs dependencies and shows the Expo Go code. |
| Have my AI build it for real | A brief (screens, flows, a first guess at the data, the look) goes to `#agents` addressed to `@agents`. With no AI helper in the project it becomes a build task instead. Nothing joins the main copy until a person says yes. |

### The Expo export, checked (2026-11-15)

Built for real in the cloud sandbox from the habit tracker template (Node 22.23.4, npm 10.9.9):

```
cd app-expo
npm install --ignore-scripts      # 873 packages, expo 52.0.49, react-native 0.76.9, react 18.3.1
npx expo export --platform web    # writes dist/: one web bundle (~911 kB) plus the icon fonts
```

`dist/` was served and opened in Chrome at 390px: no page errors, every screen block drawn (header, stat tiles, the
checklist, the button, the tab bar). The social, music and shop templates were built and opened the same way, and all
54 templates' `App.js` compile with Expo's own Babel preset (`babel-preset-expo`).

Fixed on the way: the versions are now Expo SDK 52's own (from `expo/bundledNativeModules.json`); `react-dom`,
`react-native-web` and `@expo/metro-runtime` are listed so `npm run web` works; `expo-asset` and `expo-font` are listed
because npm otherwise nests them inside `expo`, where Metro cannot find them; stat tiles draw as a row of cards instead
of sharing the chart's code.

Not checked here: a native build on a phone (Expo Go or EAS needs a device or Expo's servers). `npx expo start` and
the Expo Go QR code are the next step on a real computer.

## Flint (no AI)

Anywhere: "make me a habit tracker app", "build a workout app called Lift", "a travel planner app in teal". A word that
already names a code starter ("notes app", "chat app", "weather app") keeps its old meaning unless it says "phone app" /
"mobile app" or App Creator is open.

In App Creator: "add a settings screen", "add onboarding", "add a paywall", "add a login screen", "add a tab bar",
"add a chart", "link this button to the profile screen", "link it to settings as a sheet", "make it dark", "rounder",
"pill buttons", "more space", "snappier", "swap the font", "use a serif font", "use the iOS look", "use the midnight
look", "make it teal", "play it", "export the app", "make an Expo project", "have my AI build it", "undo".

Cases: `scripts/dev/flint-eval/appcreator.js` (ctx `a` is App Creator open).

## What it does: working features (no AI)

Add › What it does lists 48 working features in 9 groups (`app/ui/appfeatures.js`): remember ticks and typed text,
add to a list, swipe to remove, backup, CSV, favourites, search, sort, chip filters, dark mode switch, bigger text,
less motion, reminders, camera, location, keep the screen on, timer, stopwatch, streak, totals, progress, chart, a
demo sign-in and a PIN lock (both clearly this-phone-only), read aloud, speak to type, and more. The design keeps
`features: [id, …]`; the exported phone web app carries the code; the AI brief lists them. Flint adds them by
sentence ("add offline storage", "make the timer work", "remove the pin lock"), and from anywhere with "my app".
Everything stays on the phone. Real accounts, data shared between phones, payments and push when the app is closed
need a server: Flint says so and hands a ready request to a stronger AI. Cases: `scripts/dev/flint-eval/appknow.js`.

## For other features

`window.TribeAppCreator.screens(projectId) -> Promise<[{ id, name, html, css, render(canvas, w, h) -> Promise<canvas> }]>`
gives every screen of a project's app. `html` + `css` show it live; `render` draws it into a canvas (through an SVG
picture, with the phone's own fonts). The Launch kit uses it for store screenshots.

`window.TribeAppCreator.mini(doc, screenId?, width?)` returns a live, scaled picture of a screen (the gallery and the
screen strip use it).

When `window.TribeSuggest` is present, App Creator registers a suggestion provider (`id: 'app'`): an open task or doc
that mentions sign-in, settings, onboarding, a paywall, chat, search, notifications, a profile, stats, a map, a
leaderboard or a cart, when the app has no such screen, becomes "Add a … screen", with where it was said; the brand
kit's colour, when the app does not use it, becomes "Use the brand colour in the app". Applying is one change with an
undo.

## Credits

Everything here is drawn for TribeCode. The bundled fonts are the website designer's (SIL Open Font License, licence
files in `app/ui/assets/site-fonts`). Device frames are generic shapes, not Apple's or Google's artwork. The Expo
export depends on Expo and React Native (MIT) in the exported project only; TribeCode itself stays dependency-free.
