# Hosting a tribe

A tribe lives on **one computer: the host**. That computer runs the tribe server (`npm start`, or the desktop app's **Host a tribe on this computer**), and everything the tribe makes (docs, tasks, chat, proposals, decisions, the brain's notes, members and invites) is plain Markdown and JSON in the host's **tribe folder** (`~/TribeCode` by default).

**GitHub only hosts the app shell and the downloads.** The GitHub Pages site (`app/ui` at the root, the marketing site under `/about/`) and the Releases page never see your tribe's data. Opened from Pages, TribeCode runs on its own (Tasks and Docs saved in the browser) until you open an invite link, which takes you to the host's server.

Friends on the same Wi-Fi can join right away: the invite QR code uses your network address. To reach friends anywhere, pick one of the options below.

## Compare

| | Your PC + Tailscale Funnel | Your PC + Cloudflare quick tunnel | Always-on cloud server |
| --- | --- | --- | --- |
| **Cost** | Free (personal plan) | Free | A small VPS, a few dollars a month |
| **Account** | Tailscale account | None | VPS provider |
| **Address** | `https://your-pc.your-tailnet.ts.net`, **stable** | `https://random-words.trycloudflare.com`, **changes every restart** | Your own domain or IP |
| **HTTPS** (needed for voice on phones) | Yes | Yes | Add a reverse proxy (Caddy) |
| **Online when** | Your PC is on | Your PC is on and the tunnel is running | Always |
| **Where the data lives** | Your PC's tribe folder | Your PC's tribe folder | The server's tribe folder |
| **Best for** | Most tribes (**recommended**) | Trying it out tonight | Teams across time zones |

## In the app: "Share beyond my Wi-Fi"

As the host, open **Invite friends** and turn on **Share beyond my Wi-Fi**. TribeCode tries, in order:

1. **Tailscale Funnel**, if the `tailscale` CLI is installed and signed in: runs `tailscale funnel --bg <port>` and reads the https address from `tailscale funnel status --json`.
2. **Cloudflare quick tunnel**, if `cloudflared` is installed: starts `cloudflared tunnel --url http://localhost:<port>` and keeps it running until you turn sharing off or stop the server.
3. If neither is installed, it tells you what to install. It never installs anything by itself.

While sharing is on, the public address is used for the invite link and QR code, and it comes first in `/api/health` (`lan[0].kind === "public"`). API: `GET/POST/DELETE /api/share/public` (POST/DELETE are host-only; POST takes `{ "provider": "tailscale" | "cloudflare" }` to pick one).

## Option 1: your PC + Tailscale Funnel (recommended)

1. Install Tailscale: <https://tailscale.com/download>, then `tailscale up`.
2. Start the tribe (`npm start` or the desktop app) and turn on **Share beyond my Wi-Fi**. The first time, Tailscale may ask you to allow Funnel for your tailnet: open the link it shows, allow it, and flip the switch again.

The address stays the same across restarts, so invites and Home Screen apps keep working. Manual equivalent: `tailscale funnel --bg 4747`.

## Option 2: your PC + Cloudflare quick tunnel (no account)

1. Install `cloudflared`: Windows `winget install --id Cloudflare.cloudflared`, macOS `brew install cloudflared`, Linux: [downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Turn on **Share beyond my Wi-Fi**.

The `trycloudflare.com` address is new every time the tunnel starts, so send a fresh invite after a restart, and friends' Home Screen apps (which remember the old address) need a new link. Manual equivalent: `cloudflared tunnel --url http://localhost:4747`.

## Option 3: an always-on cloud server

Any small Linux VPS works (the server is Node 20+, zero dependencies):

```bash
git clone https://github.com/orionopenwow/TribeCode && cd TribeCode
TRIBE_DIR=/srv/tribe npm start -- --name "Campfire Crew" --port 4747
```

Put Caddy in front for HTTPS (`caddy reverse-proxy --from tribe.example.com --to localhost:4747`), and keep it running with systemd or `pm2`. The first person to finish setup **on the server itself** becomes the host (bootstrap only works from `localhost`), e.g. over an SSH tunnel: `ssh -L 4747:localhost:4747 you@server`, then open <http://localhost:4747>. Back up `/srv/tribe`: that folder is the tribe.

## Phones: the private device link

When a friend joins from a phone, the join page opens the app at a private link, `https://<host>/m/<key>/`. **Add to Home Screen** from there installs an app whose start address carries that key, so it opens already signed in (an iPhone Home Screen app does not share storage with Safari). Each key is stored hashed in `.tribe/devices.json` and can be signed out any time from **Settings → Devices & desktop app** (or **Signed-in devices** in `Ctrl K`). Signing a device out invalidates its key and every token it was given.

Treat a `/m/<key>/` link like a password: anyone who has it is signed in as you until you sign that device out.
