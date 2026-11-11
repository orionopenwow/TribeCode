# TribeCode for iPhone: plan and first steps on a Mac

Status: plan, 2026-11-10. Needs a Mac with Xcode, an Apple Developer account (paid, yearly) and the steps below. Why
this packaging, the App Review checklist, assets, review notes and timeline: [docs/APP-STORE.md](../../docs/APP-STORE.md).

## What the iPhone app is

A **client** for tribes, built with **Tauri v2 mobile** from the same `app/src-tauri` project as the desktop app. It
bundles `app/ui` (the phone layout already exists) and joins tribes by invite link or QR code, exactly like the web app.
It never hosts a tribe and never downloads code that changes the app (App Store 2.5.2): AI agents run on the host's
computer, and projects you build open in a sandboxed `WKWebView` preview.

To clear **4.2 Minimum Functionality** it adds what a website can't do:

| Native piece | How | Status |
|---|---|---|
| Push notifications (APNs) for approvals, mentions, DMs | a small Swift plugin (or `tauri-plugin-remote-push`) that hands the device token to the host's `server/webpush.js` relay | to build |
| One-tap Approve / Deny from the lock screen | `UNNotificationCategory` actions calling the signed one-time links the host already sends | to build |
| Share extension: share text, links, pictures and files into a tribe | an iOS Share Extension target writing to an App Group; the app opens `?share-target=1` (same flow as the web share target) | to build |
| Home Screen and Lock Screen widgets: "needs you", today's tasks | a WidgetKit target reading a small App Group JSON the app refreshes | to build |
| Haptics on approve, send and huddle join | `tauri-plugin-haptics` | plugin exists |
| Camera: scan an invite QR code, attach pictures | `tauri-plugin-barcode-scanner` | plugin exists |
| Microphone: voice notes and huddles that keep running with the screen off | `AVAudioSession` playAndRecord + the audio background mode | to build |
| Face ID lock (optional) | `tauri-plugin-biometric` | plugin exists |
| Offline: the shell is in the bundle, chat and drafts are cached | already in `app/ui` (outbox, offline copy) | done |
| Universal Links for `tribecode.org/go.html` + the `tribecode://` scheme | `tauri-plugin-deep-link` + `apple-app-site-association` | to build |

## First steps on the Mac

```
# 1. Tools (once)
xcode-select --install                       # then install Xcode from the App Store and open it once
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
brew install cocoapods
npm install -g @tauri-apps/cli@^2            # or use: npx tauri …

# 2. The Rust entry point Tauri mobile needs (see "Code changes" below), then:
cd app
npx tauri ios init                           # creates app/src-tauri/gen/apple (commit it)
npx tauri ios dev                            # runs in the iOS Simulator (pick an iPhone)
npx tauri ios dev --open                     # or open the Xcode project to run on your own iPhone

# 3. Signing (Xcode: Signing & Capabilities › Team), then a build for App Store Connect
npx tauri icon ../assets/brand/icon.png --ios-color '#12151A'
npx tauri ios build --export-method app-store-connect
xcrun altool --upload-app --type ios --file "src-tauri/gen/apple/build/arm64/TribeCode.ipa" \
  --apiKey "$APPLE_API_KEY_ID" --apiIssuer "$APPLE_API_ISSUER"   # key file in ~/.appstoreconnect/private_keys/
```

The upload lands in **TestFlight**; invite friends there before submitting for review.

## Code changes before `tauri ios init` works

1. **`app/src-tauri/src/lib.rs`**: move the builder out of `main.rs` into
   `#[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run()`, and make `main.rs` call `tribecode_lib::run()`.
   In `Cargo.toml` add `[lib] name = "tribecode_lib"` with `crate-type = ["staticlib", "cdylib", "rlib"]`.
2. **Desktop-only pieces behind `#[cfg(desktop)]`**: the server sidecar (`host_start`, `host_log`, `host_stop`), the
   updater, autostart, single-instance, shell and the window controls. A phone never hosts.
3. **`app/src-tauri/tauri.ios.conf.json`** (merged over `tauri.conf.json` on iOS only):
   ```json
   { "identifier": "org.tribecode.app", "bundle": { "iOS": { "minimumSystemVersion": "16.0" } },
     "plugins": { "updater": null }, "app": { "windows": [{ "title": "TribeCode", "decorations": true }] } }
   ```
   `org.tribecode.app` is the same id as the Android package, so both stores carry one name.
4. **`app/ui`**: on `window.__TAURI__` + iOS, the first screen with no tribe is **Paste an invite link / Scan a QR code**
   (the join flow already exists), and `tribe.js` already talks to the saved server instead of the page's origin.
5. **CI**: a `build-ios` job on `macos-latest` that runs step 3 with the signing certificate, provisioning profile and
   App Store Connect key from repo secrets. Only on tags or a manual run (macOS minutes are expensive).

## Before the first review

Go through the checklist in docs/APP-STORE.md: report and block (done in the web app), account deletion (entry point
done; the host-side `DELETE /api/account` is with the accounts work), Sign in with Apple next to Discord/Google, the
privacy nutrition label, the review notes and the demo tribe for the reviewer.
