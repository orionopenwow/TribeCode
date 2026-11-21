# Online and offline, in plain words

A person should never have to understand a "mode" to keep working. This page is the one list of states a person can
actually be in, the one word for each, and where it shows. Code: `app/ui/tribestatus.js` (`describe()` decides the
words, `app/test/tribestatus_test.js` checks them).

## What was confusing (before p10)

- Four different things spoke about it, each with its own words: the line under your name ("On this computer",
  "Online", "Reconnecting…", "Just you for now"), the top pill ("Waking up the tribe…", "Offline · 3 waiting"), the
  hosting pill ("Hosting"), and the line above the message box ("Your tribe is offline").
- A friend on a free-cloud tribe could be told "Camp's computer is off", though no computer of Camp's was involved.
- Some places showed a dead box with the raw error ("Couldn't open this: This needs the tribe online"), with no reason
  in plain words and no way on. The invite sheet's AI helper part did this.
- Running your own always-on server was only in `docs/HOSTING.md`; nothing in the app said how.

## The states, and the one word for each

| What is true | Words people see | Dot |
| --- | --- | --- |
| The offline demo | **Demo** · Nothing leaves this browser | grey |
| A tribe kept only in this browser | **Only on this device** · Put it online to invite friends | grey |
| No tribe yet | **Just you for now** | grey |
| This computer runs the tribe, connected | **On this computer** | green |
| A friend's computer runs it, connected | **On Camp's computer** (first name) | green |
| A free cloud server runs it (Render) | **Free cloud** | green |
| Your own server that stays on | **Always-on server** | green |
| Connected, messages still sending | (same place) · **Sending 2…** | green |
| A moment after a drop (under 8 s) | **Connecting…** | amber |
| A napping free cloud server waking (about a minute) | **Free cloud · waking up** | amber |
| Can't be reached | **Offline** or **Offline · 3 waiting**, with why: "Camp's computer is off or asleep", "The free cloud server isn't answering", "Your server isn't answering", or "Your tribe can't be reached right now" | red |

The rule behind them: messages, tasks and edits made while offline **wait and send by themselves** when the tribe is
back (the outbox in `tribe.js`). There is no switch to flip.

## Where it shows

- **The line under your name** (bottom left, `userbar.js`): always there, always the state above. Tap it for a small
  card that says what it means and the one or two things to do: Try again now, Invite a friend, Put it online, Where it
  lives, Who can reach you (on the computer that runs it), Run your own server.
- **The top pill** (`healthpill.js`): only while something needs attention (connecting, offline, messages waiting).
  Same words. Tap to try again.
- **The pill on the computer that runs it** (`hostpill.js`): "On this computer"; tap for who can reach you.
- **Above the message box** (`offlinechat.js`): the same reason, and how many messages are waiting.
- **Settings › Projects and backup › Where your tribe runs**: the same words, and Run your own server.
- **Where it lives** (step 2): the same words, and Run your own server.

## Things that can't work offline

Each says why in one line and offers the one fix, never a raw error. Inviting someone while the tribe can't be reached:
"Your tribe can't be reached right now", with Try again (and the tribe's address to copy when there is a public one).
In the demo: "The demo can't invite real people", with Make my own tribe.

## Run your own server (advanced)

Settings › Projects and backup › Run your own server (also Where it lives, the status card and Ctrl K). Code:
`app/ui/ownserver.js`.

1. **On a computer that stays on** (a home PC, a Raspberry Pi, a small server). Copy one command:
   - Docker (restarts by itself, keeps the tribe in a volume):
     ```
     git clone https://github.com/orionopenwow/TribeCode.git && cd TribeCode
     docker build -t tribecode .
     docker run -d --name tribecode --restart unless-stopped -p 4747:4747 -v tribecode-data:/data -e TRIBE_SETUP_CODE=<code> tribecode
     ```
   - Node 22 and git:
     ```
     git clone https://github.com/orionopenwow/TribeCode.git && cd TribeCode
     TRIBE_CLOUD=1 TRIBE_SETUP_CODE=<code> npm start
     ```
   The app makes a long random setup code and puts it in the command. Then paste the server's address and the code:
   `TribeCloudHome.connect()` claims the empty server (`POST /api/bootstrap`), the same step as Free cloud. A tribe
   kept only on this device moves there; a tribe that is already shared opens the new one beside it. `TRIBE_CLOUD=1`
   is what allows claiming from another device with the code (`server/index.js`).
2. **Peer to peer over Tailscale.** Tailscale links devices directly and privately (WireGuard). Friends you add to your
   Tailscale network open this computer's Tailscale address (shown with Copy when Tailscale runs, from
   `/api/health` `lan[].kind === 'tailscale'`). No cloud in between.

### What is real and what is not built

- **Works today:** an always-on server you run (Docker or Node), claimed from the app; friends connecting straight to
  your computer over Tailscale; a public https address through Tailscale Funnel or a Cloudflare quick tunnel
  (Share beyond my Wi-Fi, `server/share.js`).
- **Not built:** every friend's app keeping a full copy of the tribe and syncing directly with the others (true
  multi-copy peer to peer). Today one computer or server runs the tribe and the others connect to it, so it has to be
  on. Calls already connect people directly (WebRTC), but the tribe's data does not travel that way.

## GitHub, one status everywhere

`TribeGitHubConnect.status()` and `.chip(el)` (`app/ui/ghconnect.js`): "GitHub · Connected as @name" or
"GitHub · Not connected" with **Connect**, which always opens the one Connect GitHub sheet. A tribe kept only in this
browser says "Copy on GitHub" when it has one. Shown in Where it lives (step 3); Settings keeps the full sign-in block.
