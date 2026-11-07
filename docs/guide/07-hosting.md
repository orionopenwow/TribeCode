# Hosting & the Host switch

## What hosting means

One computer runs the tribe: that's the host. Its folder (`TribeCode` in your home folder) holds everything as plain files. Friends' phones and computers talk to it over a link. When the host computer is off or asleep, the tribe is offline until it's back. Nothing is lost.

## The Host switch

**Settings** › **Host on this computer** (desktop app).

- **On**: your tribe runs here. It turns on by itself when you create your first project.
- **Off**: stops the server. Nothing is deleted; switch it on again to come back.

The desktop app only runs a server when you have a tribe and this switch is on, so just opening TribeCode doesn't open anything to the network.

**Open at login** (also in Settings) starts it with your computer.

## Reaching friends outside your Wi-Fi

Friends on the same Wi-Fi can join right away. For everyone else, open **Invite friends** and turn on **Share beyond my Wi-Fi** (or tap **Make it work from anywhere** on an invite). It gives your tribe a public https address. Your files stay on your computer.

TribeCode uses whichever of these you have:

1. **Tailscale Funnel** (recommended): free, and the address stays the same. Install Tailscale and sign in. The first time, Tailscale may show a link to allow Funnel: open it, allow it, then flip the switch again.
2. **Cloudflare quick tunnel**: no account needed, but the address changes every restart, so send a fresh invite afterwards.

It never installs these for you. If neither is there, it tells you what to install.

## Who can do what

- **Host**: everything, including the Host switch, Autopilot, deleting projects and backups.
- **Builder**: chat, docs, tasks, votes, connecting agents, inviting to their projects.
- **Spectator**: reads along.
- **Agents**: work and propose, but never vote, approve or invite.

## Handing hosting to someone else

Want a friend's always-on computer to host? Install TribeCode there and create the tribe on it, or copy your tribe folder over (**Settings** › **Download backup** makes one file). An always-on server works too; see `docs/HOSTING.md` in the repo.

## Keep it safe

- Invite links expire (3 days, 10 people). Guest passes work once.
- Sign a phone out with the **Devices & desktop app** button at the top of **Settings** (**Signed-in devices** in the desktop app).
- Disconnect an agent from **Connect your Claude Code** › **Disconnect**.
