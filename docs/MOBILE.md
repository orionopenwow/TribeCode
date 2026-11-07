# TribeCode on phones

## One click: invite a friend

Double-click **`TribeCode-Invite-Friend.bat`** (Windows) or **`tribecode-invite-friend.command`** (Mac), or run `npm run invite`. It:

1. starts TribeCode if it isn't running (and makes you the host on first run),
2. turns on a public https address with Tailscale Funnel or cloudflared when either is installed,
3. creates an invite (3 people, 48 hours), copies the link, and opens a page with a big QR code.

Your friend scans or taps the link, types a name, taps **Join**, then **Share → Add to Home Screen**. That's it.

## Today: the installable web app (iPhone, iPad, Android)

No App Store needed. Your friend's phone gets the same TribeCode, laid out for a phone: bottom tab bar, chat tab, swipeable task board, tap-to-move tasks.

1. On your PC: **Invite friends**. The window shows a link and a **QR code** that point at your PC's network address.
2. Your friend points the iPhone camera at the QR code and opens the link, picks a name, and is in.
3. After joining, the phone opens a private link (`/m/<key>/`) and shows a guided sheet: **Share → Add to Home Screen**. The installed app opens full screen from its own icon, already signed in (iPhone Home Screen apps don't share storage with Safari, so the key in the link signs them in). Sign a phone out any time from **Settings → Devices & desktop app**.

### Reaching your PC
- **Easiest:** as the host, turn on **Invite friends → Share beyond my Wi-Fi** for a public https address (Tailscale Funnel or a Cloudflare tunnel). See [HOSTING.md](HOSTING.md).
- **Same Wi-Fi:** works right away (the QR uses your Wi-Fi address).
- **Anywhere else:** install [Tailscale](https://tailscale.com) on the PC and the phone (free for personal use), sign both in, and TribeCode automatically puts the Tailscale address in the invite.
- **Voice huddles on a phone** need HTTPS (browsers block the mic on plain `http://` addresses). Run `tailscale serve 4747` on the PC once and share the `https://…ts.net` address it prints. Everything, including voice, then works on the phone.

## The phone layout

Below 820px wide the same app switches to a phone layout (`app/ui/mobile2.js` + `mobile2.css`, ported from the demo's phone screens). Desktop is untouched.

- **No header outside Chat.** A bare project line (the project's circle and name) sits at the top. Tap it, or **swipe from the left edge**, for the Discord-style panel: the project circles in a column on the left, the section list (New, Search, Chat, Docs & files, Updates, Tasks, Huddle, More, Pinned, Recents) beside it. Swipe back to close.
- **The rack** at the bottom: your avatar (your profile) · Chat · Docs · Updates · Tasks · the orange action (New task on Tasks, New doc on Docs, the New menu elsewhere). Badges show unread chat and things waiting on you.
- **In Chat** the composer owns the bottom, so the rack's icons move into a compact top bar, with **Talk to…** on the right: my Claude (your Claude Code's private chat), Qwen brain (`@brain` in #general), my desktop (hand a change to a computer that can push), #agents, #general and direct messages (friends first).
- **The composer:** `+` (photo, file, task, and Start a vote when votes are available) · the message · the mic, which turns into the orange send arrow as you type. One tap on the mic records a voice note: pause/resume, stop to preview and play it back, delete, or send.
- **Updates:** approvals that need you come first as the hero, each with an optional comment and big Approve / Deny buttons, then what happened, then what was decided.
- **Docs:** the pinned repo hero (with its picture: README art, the latest screenshot, or a tile), the living notes journal, files, then screenshots.
- **Tasks and Home:** a short **Suggested** list from today's plan (or open tasks nobody has) with Take it / Give to Claude, and a "Suggest a task" box.
- **Profiles:** tap your avatar, a person in Talk to…, or an avatar in chat. Add friend (kept on this phone), Network (their agents, projects and people), Message, Ask their Claude (in #agents).
- **Links opened inside Messenger, Instagram, Facebook, TikTok and similar apps** show a banner on the join pages: on Android it opens Chrome directly; on iPhone it copies the link and says to tap ••• → Open in Safari (those in-app browsers can't add TribeCode to the Home Screen or keep you signed in).

## Next: native iOS app (App Store / TestFlight)

TribeCode's desktop app is built with Tauri 2, which also builds iOS apps from the same code. Steps once a Mac is available:

| Step | What | Needs |
| --- | --- | --- |
| 1 | `cd app && npx tauri ios init` (creates the Xcode project) | Mac with Xcode 15+ |
| 2 | Point the iOS app at a tribe: it opens the join screen (scan QR / paste link) instead of hosting | small UI change, already supported by the in-app join flow |
| 3 | `npx tauri ios build`, upload to App Store Connect | Apple Developer account ($99/year) |
| 4 | Invite your friend through **TestFlight** (no App Store review needed for testers) | your friend's Apple ID email |

What the native app adds over the web app: push notifications when the app is closed, the mic without HTTPS, and a real App Store listing. Hosting a tribe stays on desktop: phones join.
