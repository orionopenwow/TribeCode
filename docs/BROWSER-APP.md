# TribeCode as a browser app (PWA)

Status: shipped on `feat/appstore`, 2026-11-10. The installable web app, as far as browsers let it go. The phone and
desktop store plans build on it: [APP-STORE.md](APP-STORE.md).

Every piece is progressive: it checks for its API and stays quiet where a browser lacks it. Nothing here changes how the
app looks until it is used.

## What's in it

| Piece | Where | What it does |
|---|---|---|
| Manifest | `app/ui/manifest.webmanifest` | `id`, `scope`, `start_url` (`./?source=pwa`), `display_override` (window-controls-overlay, then standalone), any + maskable + **monochrome** icons, **screenshots** (wide 1280×720 + narrow 390×844, for Chrome's richer install sheet), 4 **shortcuts**, **share_target**, **file_handlers**, **protocol_handlers**, **launch_handler** (`focus-existing`) |
| Shortcuts | `pwa.js` `go()` | Long-press the icon (Android) or right-click it (desktop): **New note** (a note in your docs), **Ask Flint**, **Tasks**, **Chat**. URLs: `./?shortcut=note|flint|tasks|chat` |
| Share target | `sw.js` `shareIn()` + `pwa.js` | Share text, links, pictures and files *into* TribeCode from any app. The service worker keeps the POST on the device (Cache Storage, `tribecode-runtime`), redirects to `./?share-target=1`, and the page shows one calm **incoming sheet**: Send to chat · Save as a note · View · Upload to my files. Read once, then forgotten |
| Share target, no service worker | `server/pwa.js` | The very first share (or a cleared browser) reaches the server: it redirects with the text fields and counts the files (`&dropped=n`) so the sheet says "share again". Nothing is stored on the server |
| File handlers | `pwa.js` (`launchQueue`) | Open `.md`, `.json`, `.glb` and `.png` with the installed app: the same sheet, with **Open as a note** (text) or **View** (the GLB / pixel-art viewers in `viewers.js`) |
| Protocol handler | `pwa.js` `protocol()` | `web+tribecode://open/chat`, `web+tribecode://join?s=<host>&c=<code>`, or `web+tribecode://<invite link>` |
| Launch handler | manifest | A second launch focuses the window you already have instead of opening another |
| Offline | `sw.js` + `offline.html` | See "Caching" below. A page that isn't cached shows a real offline page (what still works, Try again, retries by itself when the connection returns) |
| Background sync | `pwa.js` `mirror()` + `sw.js` `syncOutbox()` | Unsent chat messages (the outbox, `tribe.js`) are mirrored into IndexedDB and a `tribe-outbox` sync is registered. With a window open, that window flushes; with none, the service worker sends them. The server drops repeats by client id, and the app removes what the worker already sent when it next connects |
| Updates | `pwa.js` `webRelease()` + `updater.js` | When the service worker brings a new shell, the **existing** updater pill says **Restart to update** (same pill, same place as the desktop app). Version mismatches with the server are still handled by `selfheal.js` |
| Badging | `pwa.js` `badge()` | The app icon shows unread notifications + unread direct messages (`navigator.setAppBadge`), cleared at zero. Push messages may also carry `badge: n` (`sw.js`) |
| Web Share | `pwa.js` `share()` | **Share…** in a chat message's "…" menu; falls back to copying. Invite sharing already used it (`flow.js`, `mobile2.js`) |
| Wake lock | `pwa.js` `wake()` | The screen stays on while you're in a huddle; released when you leave or switch away, re-taken when you come back |
| Storage | `pwa.js` `mountStorage()` | Settings › **This device** (under Storage & sync): space used of the quota, whether the browser keeps it, and **Keep it on this device** (`navigator.storage.persist()`) |
| Safety | `moderation.js` | Report / Block in chat and profiles, Settings › Privacy & safety, Delete my account. Built for the app stores, live in the browser app too (APP-STORE.md) |
| Legal drafts | `privacy.html`, `terms.html` | Linked from Privacy & safety. Marked "draft, not legal advice" |

## Caching (sw.js)

- **Pages (navigations): network first**, with **navigation preload** so the service worker never delays a page. Each
  fresh app page carries its version (`<meta name="tribe-version">`, stamped by the server). When it changes, the cached
  files of the old version are dropped first, so an old script never runs with a new page. Offline: the cached app page
  (any `?query`), else `offline.html` (served with a `<base>` so its styles and icon come from the cache at any address).
- **Files (scripts, styles, pictures): stale-while-revalidate** on a real address (phones, tunnels, cloud): instant from
  cache, refreshed in the background. **Network first on `localhost`**, where the dev lane's live reload must show an edit
  at once (and the tests run). `sw.js?strategy=swr|network` overrides it.
- **Never cached**: `/api`, `/mcp`, `/ws`, `/play`, `/preview` (sandboxed pages), range requests (media).
- **Precache**: `SHELL` (other features append to it) plus `offline.html`. A file that fails to download no longer leaves
  the whole shell uncached (each file is added on its own). Bump `CACHE` when `SHELL` changes.
- Inside the desktop app (`tauri.localhost`) the worker still unregisters itself, as before.

## The self-check

```
node scripts/dev/pwa-audit.js            # prints each check and a score out of 100; exit 1 under 90 or on a required failure
node scripts/dev/pwa-audit.js --json --url http://localhost:4747   # also checks a live server's content types
```

It checks the manifest fields, that every icon and screenshot exists at the size the manifest says (PNG headers), the
shortcuts' icons, every `SHELL` file, and then runs `sw.js` in a simulated service worker (node:vm, fake caches and
fetch): install, an online navigation, then with the network down: the app page from cache, an uncached page →
`offline.html`, a shared POST → kept and redirected, and the two file strategies. It's in `npm test`, and
`app/test/e2e_pwa.py` runs it against a live server too.

Install assets (`assets/icon-monochrome.png`, `assets/shortcuts/*.png`, `assets/screens/*.png`) are made by
`python3 scripts/dev/pwa-assets.py` (the screenshots come from the showcase demo; refresh them with the readme shots).

## Support by browser

What each browser does with each piece today (November 2026). "Installed" means the app was installed (Add to Home
Screen, Install app). Our automated tests run in Chromium only; the other columns are from the browsers' documentation
and should be checked on real devices before relying on them.

| Feature | Chrome / Edge (desktop) | Chrome (Android) | Safari (iOS / iPadOS) | Firefox |
|---|---|---|---|---|
| Install | Yes (Install app) | Yes, with the richer sheet (screenshots) | Add to Home Screen | Android: yes. Desktop: no install |
| Offline (service worker), navigation preload | Yes | Yes | Yes | Yes |
| `display_override` window-controls-overlay | Yes (our own title bar) | n/a | No (standalone) | No |
| Shortcuts | Yes (right-click the icon) | Yes (long-press) | No | No |
| Screenshots in the install UI | Yes | Yes | No | No |
| Share target (share *into* TribeCode) | ChromeOS; Windows partly | Yes | No (the iPhone app's share extension will do it) | No |
| File handlers (.md .json .glb .png) | Yes | No | No | No |
| Protocol handler `web+tribecode:` | Yes (asks once) | No | No | Desktop: through `registerProtocolHandler` only |
| Launch handler (focus the open window) | Yes | n/a | No | No |
| Badging (count on the icon) | Yes, installed | No (Android shows a notification dot) | Yes, Home Screen apps (iOS 16.4+) | No |
| Web Share (share *out*) | Windows, ChromeOS, macOS | Yes | Yes | Android: yes. Desktop: no |
| Wake lock in huddles | Yes | Yes | Yes (Home Screen apps on recent iOS) | Yes |
| Persistent storage + quota | Yes (granted by engagement) | Yes | Yes (Safari 17+) | Yes (asks) |
| Background sync (queued messages) | Yes | Yes | No: messages send when the app is next open | No: same |
| Web Push | Yes | Yes | Home Screen apps only (iOS 16.4+) | Yes |

Where a piece is missing nothing breaks: the outbox still sends when the app is open, the badge is just absent, the
share sheet is the phone's own, and Settings › This device says the browser doesn't report its storage.

## Tests

- `app/test/e2e_pwa.py`: the manifest as served, the audit, the service worker controlling the page, shortcuts and
  `web+tribecode:` links, the share target through the worker (text + two files → incoming sheet → Send to chat) and
  through the server, the file-handler sheet, the Badging API and wake lock (stubbed), Settings › This device, the
  updater pill on a new shell, Share… in the message menu, and offline navigation with the server gone. Screenshots:
  `docs/screenshots/pwa-install.png`, `docs/screenshots/offline-page.png`.
- `app/test/e2e_moderation.py`: report, block and the rest of the safety pieces (APP-STORE.md).
