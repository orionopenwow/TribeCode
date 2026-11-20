# Seamless plan: build with friends and your own AI, with nothing to set up

2026-11-19, branch `feat/easy-start` (from v0.41.1). Test: `app/test/e2e_easy_start.py`.

## Summary

1. **The product in one line:** a local app builder with a built-in brain (Flint) that people hook their own AI into and build with friends.
2. **Alone and offline now works end to end.** One sentence on Home makes a first version in the browser or the desktop app, with no tribe to name, no place to choose and nothing to start. Every creator saves on the device and says so.
3. **Three things in the screenshots are fixed:** the server-start failure (a real crash found and fixed, spare ports, a longer first wait, a plain failure screen), "Not saved: This needs the tribe online" in the creators, and the vision template box.
4. **Friends are the weak part.** Today a friend can only join through a computer that is on, reached by a Cloudflare quick tunnel whose address changes and which has no uptime promise. That is the next thing to build properly.
5. **Recommended route for friends:** keep the desktop app as the tribe's home, add browser-to-browser links (WebRTC) for tribes with no computer, and use GitHub as the backup and the "catch up later" copy. No relay we pay for in phase 1.
6. **GitHub stays behind the word "backup":** sign in with a short code, we create the place, saving is automatic, clashes are "Keep mine / Keep theirs".
7. **Hooking in an AI:** one file to double-click for Claude Desktop, one address to paste for claude.ai, one line for Claude Code. All three need the tribe on this computer; only claude.ai needs it reachable from the internet.
8. **Owner decisions:** a stable public address (who pays, or whose account), a GitHub app registered under the project's name, and whether to sign the Windows installer.
9. **Not reproduced here:** the real Windows app. The Rust change was type-checked only for its own logic; the full app could not be compiled in the sandbox.
10. **First batch (4 agents):** carry-on after going online, a stable address for the tribe, the Claude Desktop one-file install, and backup with a short code from a browser tribe.

## What was fixed in this branch

| What | Before | Now |
|---|---|---|
| Desktop: "The tribe server did not start" | With no folder chosen the app passed an empty folder; the server read it as `true` and stopped with a path error. A port held by another program was "reused" and never answered. 30 s wait, then a dead end worded as a server failure | The server ignores empty values; the app fills in its usual folder and leaves empty values out; a port is reused only if a TribeCode answers on it, otherwise the next free one is used; the app also tries three spare ports itself; the first wait is 60 s and says why; a folder that can't be opened is one plain line |
| The failure screen | "Couldn't move it to this computer. The tribe server did not start." with a spinner still turning | "It's still on this device, and it still works", what happened in plain words, the one thing to try, details with Copy, Keep working here, Try again. "Put this tribe online" shows the same screen |
| Creators in a browser tribe | App Creator: "Not saved: This needs the tribe online". Motion Studio: "Not saved". The idea box in a browser tribe: "This needs the tribe online" | App Creator, Motion Studio, the website designer and the Launch kit save on the device and say "Saved on this device". With a tribe that can't be reached they keep the change and send it later |
| Designs when moving online | The website, app and motion graphics made in the browser were left behind and then forgotten | They are sent with the project before the device lets go of its copy; Try again sends them again |
| "Your vision" box | A template (For whom / Done for v1 / Out of scope), category chips, Improve with | One plain box with the sentence. Reached from the dashboard step, Settings > Projects > What you're making, and "set the vision to: ..." with Flint |
| First run | Start your first project > name a tribe > invite step > dashboard > pick a kind | Home asks "What do you want to make?"; the answer is the project |
| Dashboard in a browser tribe | No preview of what was made; first tasks suggested for a game whatever the project | The preview band shows the app or website; first tasks fit the kind |
| Bringing an AI into a browser tribe | "Couldn't open this: This needs the tribe online" | Why, and one button; the invite sheet opens again after the move |

## The newcomer walk (website and desktop simulation)

| Step | Website (nothing installed) | Desktop app | Left to fix |
|---|---|---|---|
| Open | Works. Home asks for one sentence | Same | The right panel still says "Start or join a tribe" and "local model on the tribe's host" |
| Type an idea | First version in about two seconds, no questions | Same, nothing is started | A sentence the guesser can't place becomes a business website; it should ask "website, app or game?" once |
| Change it | Click and type; "Saved on this device" | Same | App Creator opens with a lesson offer, comments and a screen map visible: a lot for a first visit (another agent owns that chrome) |
| See it again | Dashboard preview and one next step, also after a reload | Same | The second step is "Add a first task"; "Change it" or "Show a friend" would fit a newcomer better |
| Show a friend | "Works once this tribe is online" + one button, which opens a list of places (computer, GitHub, free cloud) | One button moves it to this computer, then the invite sheet opens | **Website: there is no way for a friend to see it without installing the app or opening a cloud account.** See phase 1 |
| Hook up their AI | Says it needs the tribe online, one button | Works after the move: a picker of twelve tools with text to paste | Still a paste for every tool. See phase 2 |
| Put it online | Publish works from the browser: zip, or GitHub Pages after sign-in | Same plus a quick play link | GitHub sign-in asks for a token on the website when the host has no GitHub app configured |

## What works today, per area

| Area | State | Notes |
|---|---|---|
| Alone, offline: make, change, save, export | Works | Browser storage; a zip or a folder copy on Chrome and Edge |
| Friends on the same Wi-Fi | Partly | Needs the desktop app; the link is this computer's address on the network |
| Friends anywhere | Partly | Cloudflare quick tunnel or Tailscale Funnel from the desktop app; free cloud (Render) with an account |
| Friends with no computer on | Missing | Only the free cloud, which needs an account and a setup code |
| Peer to peer between browsers | Missing | WebRTC is used for huddles only (`huddle.js`) |
| Discovery on the local network, QR pairing | Partly | QR codes exist (`qr.js`); no discovery |
| GitHub sign-in with a short code | Works where the host has a GitHub app id | `server/github-auth.js`; a browser tribe falls back to a token |
| Create the repository for them, save as backup | Partly | Works in a tribe on a computer; a browser tribe mirrors Markdown only |
| Clashes without Git words | Partly | Keep mine / Keep theirs in designers; the Code place still says repository, Ship, Pull |
| GitHub Pages publishing | Works | Including from a phone alone |
| Their own AI | Partly | Twelve tools, each a paste; sign-in for claude.ai is built but untested against the real thing |
| Saying what needs online | Works | One card, one button, and you come back to the view you were in |

## Research

**Peer to peer between browsers (WebRTC).** Two browsers can talk directly, but they first need a third party to introduce them, and some pairs never connect directly. Published figures for direct connections cluster around 75 to 85 percent, with phone networks worse; none measures phone-to-home exactly ([survey of sources](https://sover-docs.pages.dev/annex-webrtc-p2p-direct-connection-rates-mobile-home-nat)). So a browser-only design needs an introduction service and a relay for roughly one pair in five. What that means for us: the introduction can be a few hundred bytes passed through any shared place (a GitHub issue comment, a copied code, a QR), which costs nothing; the relay is the part that costs money.

**iroh.** Its own FAQ says about nine in ten connections go direct and the relay carries the rest; its public relays are free for development and testing and rate-limited, traffic is end-to-end encrypted, and it is a Rust library with bindings for other languages ([iroh FAQ](https://docs.iroh.computer/about/faq)). The FAQ contradicts itself on whether it runs in a browser. It fits the Tauri app (Rust) and not the web app or phones-as-web-apps, so it would be a desktop-to-desktop link only.

**Cloudflare quick tunnels (what the app uses today).** No account needed, but: at most 200 requests in flight, no Server-Sent Events, no uptime guarantee, meant for testing, and the address changes every time ([Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)). For us: fine for "show a friend tonight", wrong for an invite link that should work next week or an AI connector that stores the address.

**Tailscale Funnel (also in the app).** Visitors need nothing installed; the host needs a Tailscale account with MagicDNS and HTTPS on; only ports 443, 8443 and 10000; bandwidth is limited and not configurable; a new address can take up to ten minutes to resolve; still in beta ([Tailscale docs](https://tailscale.com/kb/1223/funnel)). A stable address, but an account and several switches: not for newcomers.

**Local-first data (Automerge, Yjs).** Both merge edits made apart without a server. Not verified this session: their licences and browser sizes (the pages could not be opened). The app already has its own merge for docs (`ot.js`) and whole-design saves with Keep mine / Keep theirs; a design is one JSON file, so merging per screen or per block by a small home-grown rule is realistic without either library.

**GitHub for people who don't know Git.** The short-code sign-in needs only an app id, no secret: the app shows an eight-character code, the person types it at github.com/login/device, the app polls; codes last 15 minutes and the feature must be switched on in the GitHub app's settings ([GitHub docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)). No secret means it can run from the desktop app and from a tribe's server; from a plain web page it probably needs a small helper: whether GitHub's sign-in addresses answer a page on another site was not checked this session (its data API does, per `ghphone.js`). Free limits for Pages are in `docs/HOMESCREEN-PATH.md`.

**Their own AI (Claude).** Three paths, from the official pages:
- *Claude Desktop, one file.* A `.mcpb` file is a zip with a local helper and a manifest; double-click or drag it in, review, Install. Node comes with Claude Desktop on Mac and Windows, it works offline and needs no sign-in; the manifest can ask for settings such as an address and a key ([MCPB docs](https://claude.com/docs/connectors/building/mcpb)). The app already has a stdio helper (`scripts/mcp-stdio.js`), so TribeCode can hand out "TribeCode for Claude.mcpb" with the tribe's address and the person's key filled in.
- *claude.ai, one address.* Customize > Connectors > Add custom connector, paste the address, sign in; available on every plan, one custom connector on Free. Claude reaches the address through Anthropic's servers, so it must be on the public internet over HTTPS ([connector docs](https://claude.com/docs/connectors/custom/add-unlisted)). With a quick tunnel the address dies at the next restart.
- *Claude Code, one line.* Already in the invite sheet.

What the app can detect: on the desktop it can see whether Claude Desktop or the `claude` command is installed and offer only that path first. Not verified: other tools' current setup screens (the table in `docs/ANY-LLM.md` has the dates checked).

## The target, as a short story

Maya opens tribecode.org and types "a page for our band". A page appears; she changes the name and a photo. She taps **Show a friend** and sends Jay the link from her phone. Jay opens it and sees the page; he changes the headline and Maya sees it change. Nobody installed anything. Later Maya taps **Keep a backup**, types a short code on GitHub, and from then on every change is saved there; when Jay opens the link while Maya is asleep he gets the last saved copy and his edits wait in his browser until one of them is back, with "Keep mine / Keep theirs" if they changed the same block. On her laptop Maya installs the app, drags one file into Claude, and Claude's suggestions arrive as changes she approves. **Put it online** gives the band a page that stays up.

## Phases

Sizes: S = a day for one agent, M = two or three days, L = a week.

**Phase 1: friends without a computer that stays on (browser to browser).**
- 1a. "Show a friend" from a browser tribe: a read-only link that carries the design in the link itself for small projects, or through GitHub Pages once backup is on. **S.** No server, no risk.
- 1b. Live together: a WebRTC data channel between two browsers, introduced by a code or QR on the same network and by a tiny rendezvous otherwise. One device is "the one keeping it"; the other gets a copy and both merge per block. **L.** Risk: about one pair in five will not connect directly; without a relay those pairs fall back to 1a plus backup.
- 1c. Catch up later: with backup on, a friend who opens the link when nobody is there loads the last backup and queues edits. **M.**

**Phase 2: their own AI in two clicks.**
- 2a. `.mcpb` for Claude Desktop made by the tribe's server with the address and key inside; "Connect Claude" detects Claude Desktop and offers it first. **M.** Risk: untested against the real Claude Desktop from the sandbox.
- 2b. A stable address for the tribe so claude.ai and ChatGPT connectors keep working (see decisions). **M.**
- 2c. One row per tool showing only the tool found on this computer; the other eleven behind "Another tool". **S.**

**Phase 3: GitHub as backup, never as Git.**
- 3a. Short-code sign-in from a browser tribe through a tiny helper, or through the desktop app. **M.**
- 3b. A browser tribe's backup holds the real design files, not only Markdown, so 1a and 1c can read them. **M.**
- 3c. The Code place in plain words (backup, save, get the latest). **M.** A product decision more than work.

**Phase 4: the desktop app that never fails to start.**
- 4a. Run the walk on a real Windows machine (`docs/REAL-DEVICE-CHECK.md`), including a path with spaces and non-English letters, antivirus on, and a second copy running. **S, owner or a tester.**
- 4b. Remember the port that worked; show the folder in Settings with "Use the usual folder". **S.**
- 4c. Sign the Windows installer so antivirus stops holding the helper on first start. Cost is in the decisions.

## Risks

- A relay is the only sure cure for pairs that cannot connect directly. Without one, be honest in the UI: "Couldn't connect you two directly. Use backup to share."
- Browser storage can be cleared by the browser. Until backup is on, the dashboard should keep saying where it is saved (it does) and offer a download.
- Quick-tunnel addresses change; anything that stores an address (an AI connector, an old invite) breaks. Do not build phase 2b on quick tunnels.
- Two "next step" lists exist on the dashboard (the five setup steps, then the journey). They never show together, but the first should be reworked for newcomers: change it, show a friend, back it up, bring an AI.

## What the owner must decide

1. **A stable public address for a tribe.** Options: the person's own Tailscale (free for them, several switches), a Cloudflare account of the project's with named tunnels (free tier, but the project carries every tribe's traffic and abuse reports), or none (friends only while a quick tunnel is up, AI connectors on the same computer only).
2. **A relay for the one pair in five.** None in phase 1 is the recommendation. A small relay later means a monthly bill that grows with use.
3. **One GitHub app under the TribeCode name** with device flow switched on, so nobody ever sees a token. Needs the owner's GitHub account.
4. **Windows code signing.** A certificate is a yearly cost and an identity check; it is the likeliest cure for "antivirus blocked it".
5. **The second dashboard step.** Keep "Add a first task", or change the five steps to the newcomer order above.

## Not reproduced, and not verified

- The Tauri app was not built or run: no Windows machine and no crates in the sandbox. The port and health-check logic from `main.rs` was compiled and run on its own against a TribeCode server, another program on the port, and a free port. `host_start` itself, the sidecar launch, antivirus, the firewall prompt and paths with spaces or non-English letters are unverified.
- Whether the empty-folder crash is what the owner saw is not known; it is a crash that happens every time the folder setting is empty, and the screenshot's Details were not available.
- Claude Desktop's `.mcpb` install and claude.ai's connector sign-in were read from the documentation, not run.
- Automerge and Yjs licences, and how WebRTC introduces two browsers, are from general knowledge; the pages could not be opened this session.

## First batch to build next (3 or 4 agents)

1. **Carry on after going online** (S, `sharecard.js`, `inviteone.js`, `nextstep.js`): remember the exact thing that asked (invite a friend, bring an AI, publish) and open it again after the move, on the desktop and on a served page; reorder the five dashboard steps for newcomers if the owner agrees.
2. **Show a friend from a browser tribe** (S to M, new `showlink.js` + a viewer page): the read-only link from phase 1a, with a QR, and "Make a copy" for the friend.
3. **Claude Desktop in one file** (M, `server/agentshub.js`, `server/inviteagent.js`, `app/ui/inviteagent.js`): build the `.mcpb` with the address and key inside, detect Claude Desktop and the `claude` command, offer the found one first.
4. **Backup with a short code from anywhere** (M, `ghconnect.js`, `ghphone.js`, `publishphone.js`): device-flow sign-in for a browser tribe, real design files in the backup, "Backed up a minute ago" on the Sharing and backup card.
