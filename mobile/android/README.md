# TribeCode for Android: the Trusted Web Activity (phase 0)

Status: scaffold, 2026-11-10. Nothing here is built in CI yet. The full plan and the store checklist are in
[docs/APP-STORE.md](../../docs/APP-STORE.md); the web app it wraps is described in [docs/BROWSER-APP.md](../../docs/BROWSER-APP.md).

A Trusted Web Activity (TWA) opens `https://tribecode.org/app/` full screen in Chrome's engine, with no browser bar,
inside a real Android app with its own icon and Play listing. It is the quickest way onto Google Play. Its limit: it is
tied to **one verified website**. Tribes that live on another address (a host's Tailscale or Cloudflare link) still work
through invite links, but open with a slim Custom Tab bar. The long-term Android app is the Tauri build
(docs/APP-STORE.md, "Recommended packaging"), shipped as an update of **the same package** (`org.tribecode.app`, same
signing key), so people who installed the TWA move over without reinstalling.

## Files

| File | What it is |
|---|---|
| `twa-manifest.json` | Bubblewrap's project file: package id, colors, icons, shortcuts, share target, file and protocol handlers, `targetSdkVersion` 36 |
| `../../app/ui/.well-known/assetlinks.json` | The Digital Asset Links template. `.github/workflows/pages.yml` copies it to `https://tribecode.org/.well-known/assetlinks.json` |

## Build it (needs a computer with Node 20+, JDK 17 and the Android SDK; Bubblewrap can install the last two)

```
npm i -g @bubblewrap/cli
cd mobile/android
bubblewrap init --manifest https://tribecode.org/app/manifest.webmanifest   # once; accept the values from twa-manifest.json
bubblewrap build                                                         # app-release-bundle.aab + app-release-signed.apk
bubblewrap fingerprint add <SHA-256 of the upload key>                   # or copy it from `keytool -list -v -keystore android.keystore`
```

1. **Signing.** `bubblewrap init` creates `android.keystore` (alias `tribecode`). Keep it out of git (it is the project's
   upload key: store it in the repo's secrets as `ANDROID_KEYSTORE_BASE64` + `ANDROID_KEYSTORE_PASSWORD`) and turn on
   **Play App Signing** in Play Console.
2. **Digital Asset Links.** Put **both** SHA-256 fingerprints in `app/ui/.well-known/assetlinks.json`: the upload key and
   the *app signing key* Play Console shows under Setup › App signing. Replace the two `REPLACE_WITH_…` lines, push to
   `main`, and check `https://tribecode.org/.well-known/assetlinks.json` returns JSON (no redirect). If verification fails,
   the app still opens but shows a browser bar: that is the tell.
3. **Check on a phone.** `adb install app-release-signed.apk`, then
   `adb shell pm get-app-links org.tribecode.app` should say `verified` for tribecode.org.
4. **Upload** `app-release-bundle.aab` to an internal testing track first. Fill in the Data safety form and the
   account-deletion link (docs/APP-STORE.md has the answers).

## Keep in step with the web app

- `targetSdkVersion` must meet Google Play's current minimum (API 36 for new apps and updates from 31 August 2026).
  Bubblewrap's template follows it; run `bubblewrap update` before each release.
- Shortcuts, share target and file handlers mirror `app/ui/manifest.webmanifest`. Change both together.
- The web app must keep passing `node scripts/dev/pwa-audit.js` (a TWA is only as good as its PWA).
