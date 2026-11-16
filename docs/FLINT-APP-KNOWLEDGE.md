# Flint's app-building knowledge: what was read, and what it became

Research for feat/flint-appknow, 2026-11-16. Goal: Flint does as much app building as it can on the device, with no AI, before anyone needs Claude or another stronger AI. This is an internal record (not indexed by Flint's knowledge base); the user-facing answers are in [APP-BUILDING.md](APP-BUILDING.md).

## How it was done

The sandbox's GitHub API can't read other people's repositories, so the research used public documentation pages (web fetch) plus long-standing knowledge of the projects. Pages actually opened on 2026-11-16 are marked **read**; the rest are named from knowledge and marked so. Patterns and vocabulary were learned; **no code was copied** from any of them. All 48 features in `app/ui/appfeatures.js` are written from scratch for TribeCode.

## Sources

| Project or page | What it taught | Licence | Status |
| --- | --- | --- | --- |
| [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) | Manifest fields Chromium needs (name, 192 and 512 icons, start_url, display), HTTPS, no service worker needed to install; iOS 16.4+ installs from Share in several browsers; no beforeinstallprompt on iOS; WebAPK on Android | CC-BY-SA (MDN content) | read |
| [WebKit: Web Push for web apps on iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) | iOS/iPadOS 16.4; Home Screen web app with standalone display; permission only after a tap | page | read |
| [Expo: create-expo](https://docs.expo.dev/more/create-expo/) | Templates: default (Expo Router + TypeScript), blank, blank-typescript, tabs, bare-minimum | MIT (Expo) | read |
| [MDN: Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) | Secure context, transient activation, web-share permissions policy, limited availability (needs a fallback) | CC-BY-SA | read |
| [MDN: Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) | Secure context, visible page only, re-request on visibilitychange, Baseline 2025 | CC-BY-SA | read |
| [MDN: Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) | Structured, large, offline storage; private windows keep data in memory only | CC-BY-SA | read |
| [MDN: capture attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture) | capture="user"/"environment" with accept; desktop shows a file picker | CC-BY-SA | read |
| [Supabase Auth](https://supabase.com/docs/guides/auth) | Methods (password, magic link, OTP, social, SSO, passkeys, anonymous, MFA); needs a Supabase project | Apache-2.0 (Supabase) | read |
| [shadcn/ui docs](https://ui.shadcn.com/docs) | Copy-in components, "not a component library" | MIT (repo) | read (licence from the repo, not the page) |
| [Capacitor docs](https://capacitorjs.com/docs) | Native shell for web apps, from the Ionic team | MIT | read (licence from knowledge) |
| [Workbox](https://developer.chrome.com/docs/workbox) | Service worker libraries for caching and routing | MIT | read (licence from knowledge) |
| React Native, Expo Router, EAS Build | Native apps from JavaScript; file-based routes; cloud builds with a free tier | MIT | from knowledge |
| Ionic Framework, Radix Primitives, Tauri | Phone-style web components; accessible primitives; desktop and mobile shells | MIT; MIT; MIT/Apache-2.0 | from knowledge |
| localForage, idb | Simpler wrappers over IndexedDB | Apache-2.0; ISC | from knowledge |
| PWABuilder, Bubblewrap | Store packages for PWAs (Trusted Web Activity) | MIT; Apache-2.0 | from knowledge |
| TodoMVC | The standard to-do app shape: add, tick, filter, clear done, persist | MIT | from knowledge |
| Firebase | Hosted auth, database, storage, messaging | proprietary service, Apache-2.0 SDKs | from knowledge |
| Leaflet, OpenStreetMap | Small map library; free tiles with attribution | BSD-2; ODbL data | from knowledge |
| Chart.js, uPlot | Charts (already in TribeCode's build kit) | MIT | from knowledge |

## Patterns that recur in popular app starters

1. **Storage on the device first.** Starters keep state in memory, then add localStorage or IndexedDB so it survives a reload. Losing data on reload is the most common beginner bug → the *Remember everything* feature and the answer "Why does my app lose its data when I reload?".
2. **Lists with add, tick, filter, sort, search, empty state, undo.** TodoMVC and most template apps → *Add to a list*, *Swipe to remove*, *Sort*, *Search*, *Filter with chips*, *Friendly empty lists*, *Undo*.
3. **Install and offline as a pair.** Manifest + service worker + an install hint; iPhone needs instructions instead of a prompt → *Install button*, *Offline notice* (App Creator's export already has the manifest and service worker).
4. **Phone abilities behind a tap and HTTPS.** Share, camera, location, wake lock, notifications all need a secure page and a user gesture → those features only act on a button press and say what they need.
5. **Accounts and shared data mean a server.** Supabase/Firebase-style backends appear the moment data is shared or accounts must follow people → Flint's honest line: real accounts, sync, payments and push-from-a-server go to a stronger AI (`server/flintfree.js` REAL), with a prefilled request.
6. **Light polish that apps copy from each other.** Toasts, skeletons, pull to refresh, haptics, celebration, dark mode switch, bigger text, less motion → one feature each, all respecting reduced motion.
7. **Numbers in lists.** Budgets, habit counts, workouts → *Totals*, *Progress bar*, *Chart from a list*, *Tap counter*, *Daily streak*.

## What it became

- **48 features** (`app/ui/appfeatures.js`) in 9 groups, working in App Creator's exported phone web app and in code apps (`tribe-features/features.js`), with no AI and nothing sent anywhere.
- **107 answers** in [APP-BUILDING.md](APP-BUILDING.md), indexed by Flint's knowledge base at a slightly lower weight than TribeCode's own Guide.
- **Understanding**: `app.feature` and `app.features` in `app/ui/flintnlu.js`; eval cases in `scripts/dev/flint-eval/appknow.js` (v:'ak'), including a held-out batch written after the rules (13 of 14 on its first run).
- **Honest tiers**: `classify` answers *recipe* for a feature, *agent* with a prefilled request for real accounts, sync, payments, push from a server, native hardware and encryption.

## Not done

- No interactive map tiles (the Map feature links to OpenStreetMap); no IndexedDB-backed storage for large data (localStorage only); features don't run inside App Creator's Play mode, only in the exported app and in code apps.
- Feature descriptions in App Creator are English; titles and groups are translated.
