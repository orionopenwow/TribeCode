# Phone app mode (iOS / Android)

A per-project switch for tribes that want to build an iPhone and Android app. It is off by default.

## Turn it on

Project settings → **Phone app mode (iOS / Android)**. Any builder in the project can switch it. The project
overview then shows a **Phone app** card.

## Pick a stack

| Stack | Why |
|---|---|
| **Expo (React Native)**, recommended | The easy start: one JavaScript app for iPhone and Android, on your phone in seconds with Expo Go. |
| **Capacitor** | Already have a web app? It wraps it as real iPhone and Android apps. |
| **Tauri mobile** | For a Tauri desktop app or Rust: small and fast, but needs Rust, Xcode or Android Studio. |

## Set it up

**Set it up** writes a starter into the project's repo and commits it as you ("TribeCode: phone app starter"):

- at the repo root when the repo is empty (only a README, licence, TribeCode files…). The repo's own README and
  `.gitignore` keep their text and get the starter's lines added.
- in a `mobile/` folder when the repo already has code. An existing, non-empty `mobile/` is never touched.

The Expo starter: `package.json` (expo ~58.0.23, expo-status-bar ~58.0.4, react 19.3.0, react-native 0.88.1),
`app.json`, `index.js`, `App.js`, `.gitignore` and a README (`npx expo start`, Expo Go, `--tunnel`). Capacitor
(8.6.0) and Tauri (2.12.4) starters come with their config and a README with the next steps. The stack's tools go in
the project's Toolbox (TOOLBOX.md in the repo + the Toolbox doc) and the commit.

## Install dependencies (host computer only)

**Install dependencies** runs `npm install --no-audit --no-fund --ignore-scripts` in that folder, on the host's
computer, and streams a short log into the card. Tick **allow install scripts** to drop `--ignore-scripts` (some
native packages need their install scripts). Only the host can press it, and only from TribeCode on the host computer
(the same rule as Open Space): friends and proxied calls get 403. The command is fixed: nothing from chat or from a
request is ever run.

## Open it on a phone

With Expo: run `npx expo start` in that folder on the host. While it runs, the project's **Preview** pane shows a
QR code (`exp://<host's Wi-Fi address>:8081`) for **Expo Go**: scan it with the iPhone Camera app, or from inside
Expo Go on Android. The phone must be on the same Wi-Fi as the host. On cellular or another network use
`npx expo start --tunnel` and scan the code it prints. Capacitor and Tauri run from Android Studio or Xcode; the
Preview pane says how.

## API (server/phoneapp.js)

- `GET /api/phoneapp`: the project's mode, stack, folder, install state and log, whether Expo is running (+ links).
- `PUT /api/phoneapp { on?, stack? }`: builders.
- `POST /api/phoneapp/setup { stack? }`: builders. 409 once it is set up.
- `POST /api/phoneapp/install { scripts? }`: the host, from the host computer.

Settings live in `.tribe/phoneapp.json` in the tribe folder. The starters are in `server/phoneapp-templates.js`
(code, so the desktop app's bundled server has them). Tests: `app/test/e2e_phoneapp.py` replaces npm with
`TRIBE_PHONEAPP_NPM` and Metro with a mock on `TRIBE_PHONEAPP_METRO_PORT`.
