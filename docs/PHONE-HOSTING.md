# Hosting a tribe from a phone

A tribe needs a host: something that keeps it online so friends and agents can reach it. Phones are bad at that job (iOS and
Android pause apps in the background, and phones don't ship Node.js), so TribeCode gives a phone four honest options. The
phone picks one in **Where should your tribe live?** (the "+" on the phone's Home with no tribe yet, `app/ui/phonehost.js`).

| Option | Friends can join | Needs | Good for |
|---|---|---|---|
| **This phone** | Not yet | Nothing | Starting right now: ideas, tasks, notes, chat with Flint |
| **Free cloud** | Yes, from anywhere | A free Render account | A tribe that stays up without anyone's computer |
| **My Android** | Yes, from anywhere | Termux | Hosting from an Android phone you keep charged |
| **A computer** | Yes | The desktop app on a PC or Mac | The everyday setup |

## This phone (instant)

A own tribe that lives in this phone's browser (the PWA): you, Flint and an empty first project. Tasks, docs, the vision and chat
are kept on the phone (localStorage and IndexedDB) and survive reloads and restarts. It runs on the same in-browser backend as the
offline demo (`app/ui/offline.js`, `mode: 'solo'`), without the pretend people or demo data. Flint answers from its built-in
intent router, and from the in-browser model if you turned that on.

What it can't do: invites, other people, agents, GitHub, huddles. The pill says **On this phone · move to a host for friends**.

**Move to a host.** When there's a host (any of the options below), open the pill › **Move to a host**, paste an invite link to it
and tap **Move**. The phone joins that tribe with your name, sends everything in one call (`POST /api/import/solo`,
`server/soloimport.js`; anyone allowed to start projects there can do it), and signs in to the host. Each phone project becomes a
project on the host with its tasks, docs, vision and chat. Then the phone copy is deleted.

## Free cloud (Render)

Opens Render's one-click deploy for this repo (see `docs/CLOUD.md`). Render makes a setup code; open the new address, enter the
code and your name, and you're the host. The free plan sleeps after 15 minutes with nobody around and cloud save brings the tribe
back when it wakes.

## My Android (Termux)

Install **Termux** from F-Droid or its GitHub releases (not the old Play Store build), open it and paste:

```
curl -fsSL https://raw.githubusercontent.com/orionopenwow/TribeCode/main/scripts/phone/termux-host.sh | bash
```

`scripts/phone/termux-host.sh` installs Node.js, Git and cloudflared, gets TribeCode, takes a wake lock, starts the tribe and
prints an invite link (a Cloudflare quick tunnel, copied with `termux-clipboard-set` when Termux:API is installed). Open
`http://localhost:4747` in Chrome on the same phone to use the app as the host.

Honest limits:
- Keep Termux open. Android can still stop it to save battery: allow Termux to run unrestricted in the battery settings.
- Keep the phone charging for long sessions; a tribe server keeps the CPU and network busy.
- The quick-tunnel address changes each time it starts, so invite links from an earlier run stop working.
- iPhones can't do this (no background Node). Use This phone, Free cloud or a computer.

## A computer

The existing flow: send yourself the download link, install the desktop app, and it hosts when you make your first project. Or
ask a friend with a computer to host and send you the invite.
