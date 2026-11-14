# Real-device check (about 15 minutes)

Everything below is marked **Real-device-only** in `docs/CLAIMS.md`: it passes on simulated phones and mocked services,
and nobody has confirmed it on real hardware. The website shows a small **beta** tag on these until this page is ticked.

You need: the Windows desktop app (latest), an iPhone, an Android phone, and Tailscale signed in on the computer.
Write Pass or Fail next to each line, with one sentence when it fails. When a line passes on both phones, change its
row in `docs/CLAIMS.md` to Proven and remove the beta tag next to that claim on the site.

## 1. Desktop (3 minutes)

| # | Do this | It should |
|---|---|---|
| 1 | Open the installed app when a newer release exists | Show "Restart to update", then come back on the new version (the claim "the app keeps itself up to date") |
| 2 | Start a project, press Invite, turn on the public link | Give an https link (Tailscale Funnel). Keep it for the phones |
| 3 | Pick a folder for the project with the folder picker, then drag a file onto Files | Use that folder; the file appears |

## 2. iPhone, in Safari (5 minutes)

| # | Do this | It should |
|---|---|---|
| 4 | Open the link, type a name, tap Join | Land in the project chat |
| 5 | Share → Add to Home Screen, then open it from the Home Screen | Open full screen with its own icon ("Home Screen app") |
| 6 | Allow notifications when asked; from the desktop, mention the phone's name in chat | A notification arrives on the lock screen ("Web Push") |
| 7 | From the desktop, have an AI helper ask for an approval (or use the demo approval) | The phone shows Approve and Deny; one tap answers it |
| 8 | Hold the microphone in chat, say a sentence, send | A voice note plays on the desktop |
| 9 | Start a call from the desktop and join it on the phone, on Wi-Fi and then on mobile data | Both sides hear each other on Wi-Fi. On mobile data it may not connect: note which ("voice calls") |
| 10 | Dictate into a doc with the microphone button | The words appear |
| 11 | Turn on Airplane mode and open the app from the Home Screen | It opens, and Flint still answers "add a task to buy milk" ("works with no signal") |
| 12 | Open the link inside Messenger or Instagram's browser | A banner offers to open it in Safari |

## 3. Android, in Chrome (5 minutes)

| # | Do this | It should |
|---|---|---|
| 13 | Repeat 4 to 11 | Same results; Chrome offers "Install app" |
| 14 | With no tribe yet, open tribecode.org/app and choose to start one on this phone | A tribe starts in the browser with chat, tasks and docs |
| 15 | Optional, 10 more minutes: install Termux, run the one command the app shows | The server starts on the phone and prints a friend link ("an Android phone can run it") |

## 4. Not checkable from a phone

- **A free cloud spot** (`docs/HOSTING.md`): start the server on a small cloud machine and join from the phone. Needs an
  account with a cloud provider.
- **The downloadable wrappers** (Android APK and desktop wrapper builds): the build workflows have never run for real.
  They need one run on a throwaway branch.
- **The remix list's licences**: the sandbox could not read those GitHub pages. Open each "by …" link in the remix
  section of the home page and confirm the licence shown there (MIT, or CC0 for Kenney).
