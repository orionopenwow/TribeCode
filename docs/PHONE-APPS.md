# Phone apps (plan)

Status: planned, 2026-11-08. Today phones use the web app: open a friend's invite link, then Add to Home Screen.
This plan turns that into a real Android APK first, then an iPhone app, without forking the UI.

## What a phone app is (and isn't)

- **A client, not a host.** The tribe's work lives in its shared GitHub repo, kept online by someone's desktop app or a server. The phone app joins it
  through an invite link, exactly like the web app does today. Nothing is hosted on the phone.
- **The same UI.** `app/ui` already has the phone layout (Discord-mobile flow, bottom rack, one-tap approvals, voice
  notes). The app bundles that folder, so every release of the desktop app ships the phone UI too.
- **What it adds over the web app:** an icon from the store or an APK, real push notifications (Web Push does not work
  inside an app's web view), opening invite links straight in the app, a microphone that keeps working in the
  background for huddles, and no browser chrome.

## Recommended path: Tauri v2 mobile (same stack as the desktop app)

Tauri v2 builds Android and iOS apps from the same `app/src-tauri` project. The phone build leaves out the server
sidecar (`host_start`), so the app is just the UI plus a few native plugins.

| Piece | Android | iPhone |
|---|---|---|
| Build | `tauri android build --apk --aab` on GitHub Actions (Ubuntu, Android SDK + NDK, Java 17) | `tauri ios build` on a macOS runner |
| Signing | an upload keystore kept in repo secrets | Apple Developer account (paid, yearly) + certificates |
| Ship | the signed `.apk` on each GitHub Release (sideload), later the `.aab` on Google Play | TestFlight first, then the App Store |
| Invite links | Android App Links for `tribecode.org/go.html` and the `tribecode://` scheme | Universal Links + the `tribecode://` scheme |
| Push | Firebase Cloud Messaging (FCM) token sent to the host | APNs token sent to the host |
| Updates | the store, or the in-app check against GitHub Releases for sideloaded APKs | the store |

### Phases

1. **Android APK (sideload)**
   - Add `app/src-tauri/gen/android` (`tauri android init`), a `mobile` feature flag that skips the sidecar and the
     desktop-only plugins (window controls, deep-link registration on Windows, the updater).
   - First screen on a phone with no tribe: **Paste an invite link** / **Scan a QR code** (camera plugin). The rest is
     today's phone UI.
   - A `build-android` job in `.github/workflows/release.yml`: builds a signed APK and attaches
     `TribeCode_<version>_android.apk` to the same release. The website's Download menu and the invite page offer it on
     Android phones.
2. **Push notifications**
   - The host gains a small push relay: it already sends Web Push (`server/webpush.js`); add FCM/APNs senders that use
     keys the host provides (or a TribeCode relay later). Approvals keep their one-tap actions.
3. **iPhone via TestFlight**
   - Needs a Mac (or a macOS GitHub runner) and an Apple Developer account. Same app, iOS signing, TestFlight invites
     for friends.
4. **Stores**
   - Google Play (`.aab`, store listing, privacy form: the app sends data only to the tribe's host) and the App Store.

### Quick alternative for Android only: a Trusted Web Activity

Bubblewrap can wrap the hosted web app (`tribecode.org/app/`) into an APK in a day. The catch: a TWA is tied to one
verified website, but tribes live on each host's own address (a Tailscale or Cloudflare link), so friends would see a
browser bar for most tribes and get no native push. Fine as a stopgap, not the long-term app.

## Open questions

- Who holds the Android signing key and the Apple account (they should belong to the project, not one laptop).
- Push: host-provided FCM/APNs keys vs a small TribeCode relay (simpler for friends, but a service someone runs).
- Play Store listing name, icon and screenshots (the pixel flame, the phone screens from `docs/screenshots`).

## Today's phone checklist (web app)

- Every release keeps phone parity: the CHANGELOG's **Phones** line says what changed on phones.
- Phone screens are covered by `e2e_mobile2.py`, `e2e_phone_*`, `e2e_files_code.py` (phone part) and the phone part
  of `e2e_first_run.py` (390 px, no sideways scroll, no clipped text).
