# TribeCode in the App Store and Google Play: the plan

Status: plan + first pieces built, 2026-11-10 (`feat/appstore`). Built so far: the browser app ([BROWSER-APP.md](BROWSER-APP.md)),
report / block / word filter / delete-account entry point (`app/ui/moderation.js`, `server/moderation.js`), draft privacy
policy and terms (`app/ui/privacy.html`, `app/ui/terms.html`), the Android TWA scaffold (`mobile/android/`) and the
iPhone plan (`mobile/ios/README.md`). Earlier plan: [PHONE-APPS.md](PHONE-APPS.md). Nothing has been submitted yet.

The guidance below is paraphrased from Apple's and Google's own pages, read on 2026-11-10 (sources at the end). Store
rules change; re-read them before each submission.

## The short answer

- **iPhone: Tauri v2 mobile**, the same `app/src-tauri` project as the desktop app, with native pieces that a website
  can't do: APNs push with Approve / Deny on the lock screen, a share extension, widgets, haptics, the camera for invite QR
  codes, a microphone that keeps a huddle going with the screen off, and Face ID lock. One app per tribe member, never a host.
- **Android: a Trusted Web Activity first** (Bubblewrap, days of work, `mobile/android/`), then **the same Tauri app** as
  an update of the same package (`org.tribecode.app`) once the iPhone build exists. The TWA gets TribeCode onto Google Play
  early; the Tauri build fixes its limits (one verified website, no native push, no share-sheet into any tribe).
- **Before submitting**: the host side of account deletion, Sign in with Apple (or hiding third-party sign-in on iOS), a
  consent sheet before data first goes to a cloud AI, the reviewer's demo tribe, and the store assets below.

## What the stores care about, in our words

### Apple: App Review Guidelines

- **4.2 Minimum functionality.** An app has to be more than a repackaged website: useful, "app-like", with lasting value.
  4.2.2 rules out apps that are mainly web clippings or a collection of links. 4.2.3: it must work on its own, and if it
  downloads extra resources on first launch it must say how big they are and ask first. A thin web wrapper is the classic
  rejection, so the iPhone app leans on native features (below) and bundles its own UI.
- **2.5.2 Software requirements.** An app must be self-contained and must not download, install or run code that adds
  or changes its features. Apps built to teach or develop code may download code in limited cases, but the user must be
  able to see and edit all of it.
- **4.7 Mini apps and games.** HTML5 / JavaScript mini apps and games that aren't in the binary are allowed, but the app is
  responsible for them: they must follow the privacy rules, have filtering, reporting and blocking, use in-app purchase
  for digital goods, not reach native APIs without permission, and have an age-rating mechanism.
- **1.2 User-generated content.** Apps where people post must have: a way to filter objectionable material, a way to
  report content with timely responses, a way to block abusive users, and published contact information. Apps used mainly
  for random or anonymous chat don't belong on the store.
- **3.1 Payments.** Unlocking features or digital content in the app needs in-app purchase; license keys and similar
  side doors aren't allowed. Physical goods and services used outside the app must *not* use in-app purchase.
- **4.8 Login services.** If a third-party or social login (Google, Facebook, X…) sets up or signs in to the user's main
  account, the app must also offer an equivalent login that collects only name and email, lets people hide their email,
  and doesn't track them for ads (Sign in with Apple is the usual answer). Not needed when the app only uses its own
  account system, among other exceptions.
- **5.1.1 Privacy.** (i) A privacy policy linked in App Store Connect *and* easy to reach inside the app, saying what is
  collected, how, why, who it is shared with, how long it is kept and how to delete it. (v) If the app lets people create
  an account, it must let them delete it from inside the app. Apple's account-deletion page adds: delete the whole account
  and its personal data (deactivating isn't enough), including content shared with others and automatically created
  accounts; it may take time if you say how long; a web page is fine only if the app links straight to it; no "email us"
  flows outside regulated industries.
- **5.1.2 Data use and sharing.** Ask before using or sharing personal data, and say clearly when it goes to third
  parties, **including third-party AI**, with explicit permission first. The app can't make features depend on turning on
  notifications or other system features.
- **Privacy "nutrition label" (App Privacy details).** Declared in App Store Connect for every data type the developer or
  its partners can access beyond the moment of a request: contact info, user content (messages, photos, audio), identifiers,
  diagnostics… each marked linked to the user or not, and used for tracking or not. Data processed only on the device, or
  sent and not kept, isn't "collected".

### Google Play

- **Target API level.** From **31 August 2026** new apps and updates must target **Android 16 (API 36)** (extensions to
  1 November 2026 on request). Bubblewrap and Tauri templates follow it; check each release.
- **Data safety form.** Every app on any testing track or in production fills it in, even if it collects nothing, with a
  privacy policy. Declare data sent off the device (including by libraries and web views the app controls), what is
  shared with third parties (user-initiated transfers the user expects don't count), whether each type is required or
  optional, whether **all** of it is encrypted in transit, and whether people can ask for deletion.
- **Account deletion.** An app with accounts needs an in-app path to delete the account and its data **and** a working
  web page (linked in the Data safety form) where someone who has uninstalled the app can ask for deletion, naming the app
  as the store listing does. Say what is kept and why.
- **User-generated content.** Terms that ban objectionable content, in-app reporting, blocking, and moderation that acts
  on reports.
- **Trusted Web Activities.** The app and the website prove they belong together with **Digital Asset Links**:
  `https://<host>/.well-known/assetlinks.json` (no redirects, `application/json`) listing the package name and the SHA-256
  fingerprints of the signing keys (with Play App Signing: Google's app-signing key *and* the upload key). If
  verification fails the app still opens, but with a browser bar. The site should meet the installable-PWA bar first.

## Recommended packaging

| | Tauri v2 mobile | Capacitor 8 | Trusted Web Activity (Bubblewrap) | Rewrite in Expo / React Native |
|---|---|---|---|---|
| Reuses `app/ui` as is | Yes (bundled) | Yes (bundled) | Yes (loaded from tribecode.org) | No |
| Same project as the desktop app | **Yes** (`app/src-tauri`, CI already builds Rust) | No (a second native shell) | No | No |
| iPhone | Yes | Yes | No | Yes |
| Any tribe's address (Tailscale, Cloudflare, LAN) | Yes: the UI talks to the saved server, like the desktop app | Yes | Only tribecode.org without a browser bar | Yes |
| Push (APNs / FCM) | Community plugin or ~150 lines of Swift / Kotlin | Official plugin | Web Push through Chrome (Android only) | Official |
| Share extension, widgets | Swift / Kotlin targets (same in every option) | Same | No | Same |
| Haptics, QR scanner, biometrics, deep links | Official plugins | Official / community plugins | No | Yes |
| Clears App Store 4.2 | Yes, with the native pieces below | Yes, same | n/a | Yes |
| Effort to first store build | Weeks | Weeks | **Days** | Months |

**Pick: Tauri v2 mobile for the iPhone and the full Android app; the TWA as Android's first step.** Capacitor is just as
able to pass review (and its push plugin is first-party), but it would be a second native shell beside Tauri for no
review benefit; TribeCode already ships, signs and updates a Tauri app. If the Tauri push plugin turns out to be the
blocker, swapping the iPhone shell to Capacitor costs little because `app/ui` stays the same; that is the fallback.

### What makes the iPhone app more than the website (4.2)

1. **Push with actions**: approvals, mentions and DMs arrive when the app is closed; Approve / Deny from the lock screen
   (the host already makes signed one-time links for Web Push).
2. **Share extension**: share a link, a screenshot or a file from any app straight into a tribe's chat or your notes.
3. **Widgets**: "Needs you" (approvals waiting) and today's tasks on the Home Screen and Lock Screen.
4. **Huddles that keep going** with the screen locked (the audio background mode, used only during a huddle).
5. **QR join with the camera**, haptics on approve and send, Face ID lock for the app.
6. **Offline**: the whole UI is in the bundle; the outbox, drafts and notes work with no connection.

## Checklist mapped to the rules

Legend: ✅ done · 🟡 part done · ⬜ to do. "Store build" = the Tauri phone app; most items apply to the TWA too.

| Rule | What TribeCode does | Status | Risk and what to do |
|---|---|---|---|
| 4.2 minimum functionality | Native pieces above; UI bundled, not a remote page | ⬜ | Submitting the TWA-like wrapper to Apple would fail. Ship at least push + share extension + QR + offline in v1 |
| 4.2.3(ii) first-launch downloads | Flint's in-browser model is optional and large | 🟡 | Keep "Built in" off by default in store builds; show the download size and ask before it starts (it already asks in Flint's brain picker; check the wording shows MB) |
| 2.5.2 no downloaded code | The app's own code is in the bundle. **AI agents run on the host's computer**, not the phone; the phone only shows their results and asks you to approve | 🟡 | Store build must never load `app/ui` from the host (`tauri.conf` uses bundled files; the host's version check must not reload into the host's page). Project **previews** (your tribe's own app or game) open in a sandboxed web view with no bridge to native APIs, and their source is visible in Files · Code: the "develop code" allowance |
| 4.7 mini apps / games | Previews and `/play/` links are web games your tribe made | 🟡 | v1: previews only for projects in your own tribe (no public catalog in the iPhone app), no native API access from previews, report/block covers them. Public play links open in Safari |
| 1.2 filter | Host's word filter masks words as messages are posted (`server/moderation.js`) | ✅ | Store builds: ship a default word list on, editable by the host |
| 1.2 report + timely response | Report on any message or person, with reason and note; host and mods are notified and see Reports in Settings › Privacy & safety; Resolved / Dismiss | ✅ | Tribes are self-hosted, so the *host* responds. State in the terms (done) and review notes that hosts get every report instantly; for tribes TribeCode runs (the demo / featured tribes) we answer within 24 hours |
| 1.2 block | Block from a message or profile: their messages hidden for you everywhere, no notifications from them; Unblock in Settings | ✅ | DMs from a blocked person: hidden in the thread today; also refuse them on the server (small follow-up in `dm.js`) |
| 1.2 contact info | Terms + privacy link GitHub issues | 🟡 | Add a real support email and a support page before submitting |
| 1.2 not random chat | Invite-only tribes, no strangers matching | ✅ | Say so in the review notes |
| 3.1 payments | TribeCode is free; nothing is sold in the app. Money / ledger is bookkeeping; the Marketplace is a free catalog | ✅ | Don't add purchase links in store builds. Bring-your-own AI keys: no "buy credits" links inside the iOS app |
| 4.8 login services | Invite links are TribeCode's own accounts; Discord, GitHub and Google sign-in are optional | ⬜ | iOS v1: **hide Discord/Google sign-in** (invite links + "This phone" need no login). GitHub stays as a connection to repos, not the main account. Later: Sign in with Apple through the host |
| 5.1.1(i) privacy policy | `privacy.html` (draft), linked in Settings › Privacy & safety and in the store metadata | 🟡 | Have it reviewed; host it at tribecode.org/privacy |
| 5.1.1(v) account deletion | Settings › Privacy & safety › **Delete my account**: calls `DELETE /api/account` when the server has it, otherwise explains where the account lives and deletes this device's data | 🟡 | **Blocker**: the host side. Contract for the accounts work below. Must also delete guest accounts and what the person posted |
| 5.1.2 third-party AI | Questions go to the AI the tribe chose (local, a teammate's Claude, or a cloud key) | ⬜ | Store builds: a one-time consent sheet naming the provider before your messages first go to a cloud model, and a line in the privacy policy (written) |
| 5.1.2 no forced permissions | Mic, camera, notifications are asked when used and everything else works without them | ✅ | Keep the purpose strings honest (below) |
| Privacy label / Data safety | See "What to declare" below | ⬜ | Fill both from one table |
| Permissions (iOS) | `NSMicrophoneUsageDescription`, `NSCameraUsageDescription`, `NSFaceIDUsageDescription`, `NSLocalNetworkUsageDescription` (reaching a host on Wi-Fi), audio background mode | ⬜ | App Transport Security blocks plain `http://`: allow local networking only; tunnels and Tailscale `https` work as is |
| Android target API | `targetSdkVersion` 36 in `twa-manifest.json` | ✅ | Recheck each August |
| Android foreground service | Huddles on Android 14+ need a `microphone` foreground service type, declared in Play Console | ⬜ | Tauri build only |
| Android photos | Use the system photo picker, not `READ_MEDIA_IMAGES` | ⬜ | Tauri build only |
| Play account deletion web link | `privacy.html#delete` explains the in-app path | ⬜ | A real web form that reaches the host (or us for tribes we run) |
| Digital Asset Links | `app/ui/.well-known/assetlinks.json` template; `pages.yml` copies it to the domain root | 🟡 | Fill in both fingerprints after the first Play upload |
| Encryption in transit (Play) | Tunnels and Tailscale serve https; a host on the same Wi-Fi is plain http | ⬜ | Answer honestly ("not all"), or require https in store builds. Prefer https: Android blocks cleartext by default anyway |

### What to declare (App Privacy + Data safety)

Self-hosted tribes keep data on the host's machine, which the developer can't access, so strictly much of it isn't
"collected" by us. But TribeCode will run a push relay and the demo / featured tribes, so declare conservatively:

| Data | Linked to you | Purpose | Shared |
|---|---|---|---|
| Name, (email if signed in with GitHub) | Yes | App functionality | No |
| User content: messages, photos, audio (voice notes), files | Yes | App functionality | Only with the AI provider your tribe chose, when you ask it |
| User ID, device push token | Yes | App functionality | No |
| Crash data | Yes | App functionality (the tribe's bug inbox) | No |
| Tracking | None | | |

## The host side of account deletion (for the accounts work)

The client (`moderation.js`) already calls:

- `GET /api/account` → `{ canDelete: true, keeps?: "one sentence about what is kept and why" }` (404 = not supported yet,
  the client then explains and clears the device)
- `DELETE /api/account { confirm: "DELETE" }` → removes the member, their tokens, devices, OAuth links, profile, private
  notes, blocks and reports they made, and either deletes or anonymises ("deleted member") their messages, uploads and
  docs. The host can't delete themselves this way (Start fresh covers that). Guests and auto-created phone accounts the
  same. Then `DELETE /api/session` (already added) clears the sign-in cookie.

## Assets

| Asset | App Store | Google Play |
|---|---|---|
| App icon | 1024×1024 PNG, no transparency (from `assets/brand/icon-512.png` re-rendered at 1024) | 512×512 PNG; adaptive icon foreground + background (maskable art exists) |
| Screenshots | iPhone 6.9" (1320×2868 portrait), 3 to 10; iPad 13" only if iPad is supported | Phone: 2 to 8, 9:16; 7" and 10" tablet optional |
| Feature graphic | n/a | 1024×500 |
| Preview video | Optional, 15 to 30 s | Optional YouTube link |
| Text | Name (30), subtitle (30), keywords (100), description, promotional text, what's new | Title (30), short description (80), full description (4000) |
| URLs | Privacy policy, support, marketing | Privacy policy, account deletion web page, website |
| Ratings | Age rating questionnaire (user-generated content and unrestricted chat raise it) | IARC questionnaire |
| Other | App Privacy details, export compliance (standard HTTPS only), review notes, demo access | Data safety, content rating, target audience (13+), ads: none |

Screenshot story (real screens, as the design rules ask): 1. chat with friends and their AIs; 2. an approval on the lock
screen; 3. tasks; 4. the share sheet sending a screenshot into a tribe; 5. the widget; 6. a huddle.

## Review notes template

```
TribeCode is a group workspace for friends who build software together. Each friend may have their own AI coding
assistant running on their own computer; the phone app is how they chat, approve the AI's proposed changes, take tasks
and talk in voice huddles. Tribes are private and invite-only (no random or anonymous chat).

How to review
1. Open the app and tap "Join with a link". Paste: <REVIEWER INVITE LINK>  (or scan the QR code attached as a screenshot)
2. You join "Review Tribe" as a member. It has sample messages from other members and an AI assistant.
   No sign-in with a third-party account is needed.
3. Things to try: send a message, approve a pending change from Updates, take a task, start a huddle,
   share a photo into the app from Photos (share extension), add the "Needs you" widget.

User-generated content (1.2): long-press any message or tap a profile's "…" for Report and Block. Reports reach the
tribe's host and moderators immediately (Settings > Privacy & safety > Reports). Hosts can filter words. Terms:
<URL>/terms. For tribes run by us (including this review tribe) we act on reports within 24 hours.

Code (2.5.2): the app does not download or run code. AI assistants run on members' own computers; the app shows their
proposals and the user approves them. Project previews are the tribe's own web pages shown in a sandboxed web view.

Account deletion (5.1.1(v)): Settings > Privacy & safety > Delete my account.
Privacy policy: <URL>/privacy (also in Settings > Privacy & safety).
Contact: <support email>
```

## Demo account plan

- A **Review Tribe** on a free cloud host (the existing Render setup, `render.yaml`), seeded from the demo tribe
  (`scripts/start-demo-tribe.js`): a few members, an AI agent's messages, a pending approval, tasks, a sample project with a
  preview, and a message the reviewer can report.
- A **reusable reviewer invite** (many uses, no expiry, builder role) in the review notes, plus its QR code as an attached
  screenshot. A nightly reset puts the tribe back to its seed so every review sees the same thing.
- **"This phone"** mode (solo tribe in the app, no server) as a backup if the server is down during review: the notes say so.
- Someone watches the Review Tribe's reports and keeps the server awake during the review window.

## Timeline

| Week | Work |
|---|---|
| 1 | ✅ Browser app (this branch), report / block / filter, delete-account entry, legal drafts, TWA scaffold. Next: the host's `DELETE /api/account` (accounts work), a support page and email |
| 2 | TWA: Play Console account, keystore + Play App Signing, assetlinks fingerprints, internal testing track, Data safety form, deletion web page |
| 3–4 | Tauri mobile: `lib.rs` entry point, desktop-only code behind `cfg(desktop)`, `tauri ios init` / `android init` on a Mac, join-by-link/QR first screen, bundled UI only. TestFlight build for the tribe |
| 5–6 | Native pieces: APNs/FCM push + lock-screen Approve/Deny, share extension, QR scanner, haptics, background audio for huddles. Hide third-party sign-in on iOS. AI consent sheet |
| 7 | Widgets, Face ID lock, the Review Tribe + nightly reset, store assets and texts, privacy label |
| 8 | Submit to App Review (expect one round of questions on 4.2 / 2.5.2 / 1.2; answers are in the notes above). Android: the Tauri build replaces the TWA as an update of `org.tribecode.app` |

## Sources (read 2026-11-10)

- Apple, App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple, Offering account deletion in your app: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple, App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Tauri, App Store distribution: https://v2.tauri.app/distribute/app-store/
- Google, Target API level requirements: https://developer.android.com/google/play/requirements/target-sdk
- Google Play, Data safety section: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play, Account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111
- Chrome, Trusted Web Activities: https://developer.chrome.com/docs/android/trusted-web-activity/
- Android, Verify App Links / Digital Asset Links: https://developer.android.com/training/app-links/verify-android-applinks
- Tauri push plugins (community): https://github.com/yanqianglu/tauri-plugin-mobile-push, https://docs.rs/crate/tauri-plugin-remote-push/latest
