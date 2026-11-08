# Security

## Reporting a problem

Please report security issues privately through GitHub's **Report a vulnerability** button on the repository's
Security tab (github.com/orionopenwow/TribeCode/security/advisories/new). If that isn't available to you, open an issue
that says only "security report, please contact me" and we'll reach out. Please don't post details or exploit code in
public issues, chat or Discussions. We aim to answer within a week.

## Supported versions

TribeCode is young and moves fast. Security fixes go into the latest release only. The desktop app updates itself
("Restart to update"), so staying current is the best protection.

## What TribeCode protects

- **Where your data lives.** Everything a tribe makes (chat, docs, tasks, files, project repos) is plain files in one
  folder on the host's computer (`~/TribeCode` by default). There is no TribeCode server or cloud database.
- **Who gets in.** Joining needs an invite link. Invites expire and have a use limit; guest passes stop working after
  their time (and so do the guest's connected agents). Sign-in keys, device links and agent keys are random and stored
  only as SHA-256 hashes. Roles (host, admin, mod, builder, spectator) decide who can do what, and people invited to one
  project only see that project.
- **The host's computer.** Things that touch the host's computer (running programs, installing packages, local folders,
  Open Space, special connections, sign-in setup) are host-only and only work from the host computer itself: requests
  through a public tunnel, from another site, from a sandboxed preview or from another program's page on localhost are
  refused.
- **Secrets.** AI keys, the GIPHY key and GitHub tokens live in `.tribe/secrets/` (file mode 0600 where the OS supports
  it). They are never sent to a browser, over the WebSocket, to agents, or into a backup. Sign-in client secrets
  (`.tribe/oauth.json`) are left out of backups too.
- **Previews and uploads.** The app preview runs in a sandbox with its own opaque origin, behind short-lived signed links,
  so code in a project can't read your TribeCode session. Uploaded files are served with `nosniff` and a sandbox policy;
  SVGs and unknown types download instead of rendering.
- **Link previews.** The host's server fetches previews with SSRF protection: public addresses only (no localhost, home
  network, Tailscale or cloud metadata addresses), checked again on every redirect.
- **Agents.** Connected agents (Claude Code, Codex, Gemini CLI, Cursor, any MCP client) act for their owner and never above
  builder. Through TribeCode they can chat, write docs and tasks, claim files and propose. They can't vote, approve,
  invite, change roles, publish the website, run programs on the host, or merge into main without a person approving.
  Only the host's integrator agent runs the repo's checks.

## What it doesn't protect (know this before you share a link)

- **The public link is public.** With Tailscale Funnel or a Cloudflare quick tunnel on, anyone who has the address can
  reach your tribe's sign-in and join pages. Your invite links are the keys: share them only with people you trust, and
  revoke ones you don't need. With Tailscale Funnel the https connection ends on your computer; with a Cloudflare quick
  tunnel it ends at Cloudflare, which relays (and can see) the traffic.
- **Friends are trusted with what you give them.** A builder can read and write everything in the projects they're in.
  Code friends and their agents write is real code: running it (tests, the integrator's checks, `npm install` with
  scripts, a dev server) runs it on that computer. Review before you run or merge.
- **Agents can be tricked.** An agent that reads a web page, a doc or a chat message can be steered by text hidden in it
  (prompt injection). TribeCode keeps risky actions behind a person's approval, but an agent with shell access on a
  computer can do anything that computer's user can, outside TribeCode. Keep your agent's own permissions tight,
  especially on the host computer.
- **AI providers see what you send them.** Each person's agent sends what it reads (chat, docs, tasks) to that agent's
  provider. If the host sets a cloud AI key, Flint, `@ai` and summaries send their prompt to that provider. Ollama on the
  host and the in-browser model keep it on the device.
- **Other services you turn on.** Link previews make the host's server visit the linked site. GIF search goes to GIPHY.
  The Workshop's community shelf comes from GitHub through jsDelivr. The in-browser AI model and the 3D viewer download
  pinned code from jsDelivr when you first use them. ntfy notifications (off until you set them up) go through the ntfy
  server you pick. Web Push goes through your browser maker's push service, encrypted. Live captions and voice-note
  transcripts use your browser's speech recognition, which in Chrome and Edge runs on Google's or Microsoft's servers.
  Huddle audio flows peer to peer, using Google's public STUN servers to find a route.
- **Media links carry your key.** Pictures, voice notes and downloads in the app load with your sign-in key in the link.
  Don't paste those links elsewhere. If one leaks, sign that device out in Settings.
- **The host's computer is the tribe.** Anyone with access to the host's account or tribe folder has the whole tribe.
  Backups contain all chat, files and project history: keep them as private as the folder itself.

## For developers

`app/test/security_test.py` and `app/test/security2_test.py` are the regression tests for past security fixes; both run in
`npm test`. The server and web app have zero npm dependencies. The desktop app is a Tauri v2 wrapper; its updates are
signed and checked against the public key built into the app.
