# Web app and desktop app: what's the same, what's different

The browser app (tribecode.org/app, or any tribe's own address) and the desktop app run the **same app**: the same files in `app/ui`. Once you're in a tribe, everything works the same way:
- chat, DMs, voice calls and screen share;
- the dashboard, tasks, docs, sheets and slides;
- the Agents Hub, Flint, approvals and votes;
- Ship it, profiles, notifications and the outbox.

The differences come from what a web page is allowed to do.

| Feature | Desktop app | Browser |
| --- | --- | --- |
| Host a tribe on this computer | ✅ The Host switch | ❌ A page can't run a server. Use the desktop app, `npm start`, or a free cloud tribe (docs/CLOUD.md) |
| Join a tribe from a link | ✅ | ✅ |
| Stay signed in | ✅ The app's storage, plus host reclaim on the host computer | ✅ Browser storage plus the sign-in cookie (v0.19.6) |
| Notifications | ✅ System notifications | ✅ Web Push, after you allow it (on iPhone, add to Home Screen first) |
| Voice calls | ✅ | ✅ Over https or localhost |
| Screen share | ✅ | ✅ On a computer; phones can join and watch |
| Pick a folder on disk (link a project folder) | ✅ | ❌ Browsers can't open folders by path. Use the code repository or GitHub instead |
| Start at log-in, tray, auto-update | ✅ | Not needed: a page is always the newest version |
| Open `tribecode://` links | ✅ | Opens in the browser instead |
| Offline | ✅ The app files are local, and the outbox queues actions | ✅ The service worker keeps the app files, and the outbox queues actions |

**Rule of thumb:** if a feature needs the computer itself (running a server, reading folders, starting at log-in), it's desktop-only. Everything that happens inside a tribe works in both. When a browser can't do something, the app says why and offers the nearest option instead of failing quietly.
