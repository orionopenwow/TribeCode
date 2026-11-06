# TribeCode on phones

## Today: the installable web app (iPhone, iPad, Android)

No App Store needed. Your friend's phone gets the same TribeCode, laid out for a phone: bottom tab bar, chat tab, swipeable task board, tap-to-move tasks.

1. On your PC: **Invite friends**. The window shows a link and a **QR code** that point at your PC's network address.
2. Your friend points the iPhone camera at the QR code and opens the link, picks a name, and is in.
3. In Safari: **Share → Add to Home Screen**. TribeCode now opens full screen from its own icon, like an app (the app shows this hint too).

### Reaching your PC
- **Same Wi-Fi:** works right away (the QR uses your Wi-Fi address).
- **Anywhere else:** install [Tailscale](https://tailscale.com) on the PC and the phone (free for personal use), sign both in, and TribeCode automatically puts the Tailscale address in the invite.
- **Voice huddles on a phone** need HTTPS (browsers block the mic on plain `http://` addresses). Run `tailscale serve 4747` on the PC once and share the `https://…ts.net` address it prints. Everything, including voice, then works on the phone.

## Next: native iOS app (App Store / TestFlight)

TribeCode's desktop app is built with Tauri 2, which also builds iOS apps from the same code. Steps once a Mac is available:

| Step | What | Needs |
| --- | --- | --- |
| 1 | `cd app && npx tauri ios init` (creates the Xcode project) | Mac with Xcode 15+ |
| 2 | Point the iOS app at a tribe: it opens the join screen (scan QR / paste link) instead of hosting | small UI change, already supported by the in-app join flow |
| 3 | `npx tauri ios build`, upload to App Store Connect | Apple Developer account ($99/year) |
| 4 | Invite your friend through **TestFlight** (no App Store review needed for testers) | your friend's Apple ID email |

What the native app adds over the web app: push notifications when the app is closed, the mic without HTTPS, and a real App Store listing. Hosting a tribe stays on desktop: phones join.
