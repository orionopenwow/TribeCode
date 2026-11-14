# Mobile, feature complete

What every feature does on a phone, in the three ways a phone uses TribeCode, and what happens when something needs a
computer. Checked 2026-11-12 on v0.31.2 with an iPhone (390x844, Safari user agent, touch) and a Pixel 7 (412x915).
Test: `app/test/e2e_mobile_complete.py`. Crawl of every destination: phone-only tribe.

- **(a) Phone-only**: "This phone" (offline.js solo mode). Everything is kept on the phone (localStorage + IndexedDB) and
  moves to a host in one tap. `app/ui/phonelocal.js` answers the parts that used to say "This needs the tribe online".
- **(b) Joined**: the phone joined a host (desktop app, Render, Android Termux) with an invite link. Everything goes
  through the host.
- **(c) Installed PWA**: (a) or (b) from the Home Screen. Same features, full screen, plus phone notifications (iPhone:
  iOS 16.4+, only from the Home Screen app).

Legend: ✅ works · ◐ partly (note) · ➜ needs a computer or host: shows the next-options card · — not applicable

## The matrix

| Feature | (a) Before | (a) Now | (b) Joined | (c) PWA | Notes |
| --- | --- | --- | --- | --- | --- |
| Home, Files, Docs, notes | ✅ | ✅ | ✅ | ✅ | Uploads kept in IndexedDB on (a), 8 MB a file |
| Chat, DMs | ✅ | ✅ | ✅ | ✅ | On (a) nobody else is there until it moves |
| Task Board (board, tasks, settings) | ◐ settings 404 | ✅ | ✅ | ✅ | Lead/Council mode kept locally |
| Proposals, milestones, drift radar | ◐ radar 404 | ✅ | ✅ | ✅ | Radar explains it needs a repository |
| Calendar | **broken** (crash) | ✅ | ✅ | ✅ | Events, repeats, due tasks, kept locally |
| Design flow (apps, games, screens) | ◐ project builds needed a host | ✅ | ✅ | ✅ | (a) builds on the device and plays in a sandboxed frame |
| Design canvas, Simple mode + Flint | ✅ | ✅ | ✅ | ✅ | |
| Website designer v2 + templates | ◐ config 404 (draft only) | ✅ | ✅ | ✅ | (a) saves to the phone, versions, comments, Download HTML/zip; Publish keeps it on the phone and offers a host for a public link |
| Preview + Flint pane | ◐ | ◐ | ✅ | ✅ | (a) previews designs and starters on the device; a project's own dev server needs a host |
| Flint (no-AI brain, lessons, tour) | ✅ | ✅ | ✅ | ✅ | Bigger jobs hand off to an AI helper (needs a computer) |
| People / presence | ✅ | ✅ | ✅ | ✅ | |
| Company dashboard | ✅ | ✅ | ✅ | ✅ | |
| Money (ledger) | **404** | ✅ | ✅ | ✅ | Entries, summary, runway, CSV on (a); CSV import and Stripe sync need a host |
| Work (profile, gigs) | **404** | ✅ | ✅ | ✅ | Hiring and applying need other people (host) |
| Academy | **404** | ✅ | ✅ | ✅ | Bundled catalog (`app/ui/academy-catalog.json`, a copy of templates/academy.json) |
| Marketplace | ✅ bundled catalog | ✅ | ✅ | ✅ | |
| Studios | ✅ | ✅ | ✅ | ✅ | Downloads are desktop apps |
| Settings, Personalize, storage | ◐ storage 404 | ✅ | ✅ | ✅ | (a) shows this device's usage |
| Comment pins | ✅ | ✅ | ✅ | ✅ | |
| Publish play links | ◐ | ◐ | ✅ | ✅ | (a) Download works; a public link ➜ host |
| Jam mode | ◐ | ◐ | ✅ | ✅ | Needs other people ➜ host |
| Code files (Files › Code) | **404** | ✅ | ✅ | ✅ | (a) files on the phone, edit + save |
| GitHub | ◐ light home only | ✅ | ✅ | ✅ | (a) token: bring a repo in, edit, push commits, pull (`app/ui/ghphone.js`) |
| Code repository view (git, branches, ship) | pretend data | ➜ | ✅ | ✅ | Card offers GitHub from the phone + next options |
| AI helpers / Agents Hub / MCP | raw error | ➜ | ◐ | ◐ | Agents run on a computer; on (b) the phone watches, approves and talks to them |
| Secretary | raw error | ➜ | ✅ | ✅ | Runs on a host that stays on |
| Captures | 404 | ➜ (list empty) | ✅ | ✅ | |
| Voice huddles | ◐ | ➜ | ✅ | ✅ | Cellular needs a TURN relay (not built) |
| Voice dictation (Ctrl Shift D / mic) | ✅ | ✅ | ✅ | ✅ | Browser speech: iPhone needs Safari speech permission |
| Phone notifications (Web Push) | — | — | ◐ | ✅ | iPhone: Home Screen app only |
| Invite friends / tribe link | ◐ | ➜ | ✅ | ✅ | (a) invite opens Move to a host |
| Phone app builds (Expo) | 404 | ➜ | ◐ | ◐ | Expo runs on a computer; the phone opens the app in Expo Go |
| Big local models (Ollama) | — | ➜ | ✅ (host's) | ✅ | Small in-browser model works on (a) with WebGPU |

Before the pass, a crawl of every destination on (a) found 26 screens hitting "This needs the tribe online", one crash
(calendar) and pretend data in the code repository view. Now: 0 raw errors; 9 destinations show the next-options card.

## Next options (one component: `app/ui/nextopts.js`)

When a part truly can't run on the phone alone, the view shows a calm card ("AI helpers need a computer", "The code
repository lives on a computer", …) with **See options**, in this order:

1. **Move to a host**: paste an invite link, everything moves in one tap (phonehost.js).
2. **Free cloud**: Render one-click (docs/CLOUD.md).
3. **My laptop**: the desktop app download + a QR code that opens this page on the laptop.
4. **My Android**: Termux, one command. On an iPhone this row is a plain note: iPhones can't host.

The repository card also offers **Use GitHub from this phone**. Strings go through TribeI18n.

## What still needs a computer or host

Hosting friends, AI helpers (Claude Code, Codex, Gemini CLI), git branches and shipping, the Secretary, captures
processing, voice huddles, Expo builds, Ollama models, Stripe sync / CSV import, public publish links. On an iPhone there
is no self-hosting at all (Apple doesn't allow background servers); on Android, Termux works while it stays open.

## Limits on (a)

- The draft lives in localStorage (about 5 MB on iPhone Safari); GitHub imports are capped at 300 text files / 1.5 MB, and
  pictures and files over 256 KB stay on GitHub. Settings › Storage shows the device's usage.
- Phone-only GitHub uses a personal token. Real "Sign in with GitHub" on a phone needs a backend: see
  [AUTH-PLAN.md](AUTH-PLAN.md).
