# A tribe server in the cloud (free)

Run a TribeCode tribe on a free cloud host, so you and your friends can join from anywhere without keeping your own computer on.

## One click on Render (free)

1. Open https://render.com/deploy?repo=https://github.com/orionopenwow/TribeCode and sign in to Render (GitHub sign-in works).
2. Render reads `render.yaml`: one free web service named `tribecode`, built from the `Dockerfile`. Click **Apply** and wait for the build (a few minutes the first time).
3. In the service's **Environment** tab, copy `TRIBE_SETUP_CODE`. Render made it for you.
4. Open your service's address (something like `https://tribecode-xxxx.onrender.com`). TribeCode asks for the setup code and your name. The first person with the code becomes the host.
5. Invite friends from the app as usual. Invite links use your cloud address automatically.
6. Connect GitHub from the dashboard's Getting started steps, so your code lives in your GitHub repository.

## What to know about the free plan

- It sleeps after 15 minutes with nobody connected, and takes about a minute to wake up. **Keep-awake:** for 3 hours after real use, the server visits its own address every 10 minutes, so an evening's chat doesn't nap (`TRIBE_KEEP_AWAKE_HOURS`, 0 turns it off). It uses free hours; one service all month fits in Render's 750.
- Its files are wiped when it sleeps, restarts or redeploys. **Cloud save brings them back:** every member's browser keeps a sealed copy of what that member can see (messages, members, tasks, docs, invites), refreshed about once a minute and after new messages. When the server wakes up empty, the first member who opens TribeCode puts the tribe back from their copy, and everyone stays signed in. Later arrivals add what they have, such as their own DMs and newer messages. If someone opens it before anyone with a copy, they see "The tribe is waking up" and wait.
- The seals use a key made from `TRIBE_SETUP_CODE`, so nobody can edit a copy to give themselves more power. Each copy holds only what that person could already see: no one else's DMs, and no server secrets.
- Copies hold the last 1,500 messages per channel and stay under about 2 MB. **Your code is safest on GitHub.**
- 750 free hours a month per Render workspace.
- **Phone notifications after a sleep.** Push keys and phone subscriptions are server secrets, so cloud save never copies them. To keep push working, give the server fixed keys: on any computer with Node run `node scripts/dev/vapid-keys.js`, then paste the two lines into the service's **Environment** as `TRIBE_VAPID_PUBLIC` and `TRIBE_VAPID_PRIVATE` (render.yaml lists both). Each phone that already turned notifications on sends its subscription again by itself the next time it connects, so nobody has to switch push back on. Without the keys the server makes new ones after a wipe and phones quietly re-subscribe on their next visit.
- **Live updates.** Everything live (chat, tasks, the preview reloading itself) works over the cloud address. On a Cloudflare quick-tunnel link, which doesn't stream Server-Sent Events, the preview falls back to checking every few seconds.

## Sign in with GitHub (accounts that follow you to any device)

Without this, each device remembers its own sign-in. With it, you and friends can **Sign in with GitHub** to join from an invite, and sign back in on a new phone or laptop.

1. On GitHub: Settings › Developer settings › OAuth Apps › **New OAuth App**.
   - Homepage URL: your Render address, e.g. `https://tribecode-xxxx.onrender.com`
   - Authorization callback URL: `https://tribecode-xxxx.onrender.com/api/oauth/github/callback`
2. Copy the **Client ID**, then click **Generate a new client secret** and copy it.
3. In Render, open the service › **Environment** › add `TRIBE_OAUTH_GITHUB_ID` and `TRIBE_OAUTH_GITHUB_SECRET` › **Save**. Render restarts the service, and cloud save brings the tribe back.
4. In TribeCode: open your profile › Sign-in › **Link GitHub**, so your account is tied to it. Invite links now show "Sign in with GitHub".

Discord and Google work the same way, with `TRIBE_OAUTH_DISCORD_ID` / `_SECRET` and `TRIBE_OAUTH_GOOGLE_ID` / `_SECRET`.

## Other hosts

The `Dockerfile` works on any host that runs containers (Koyeb, Fly.io, Railway, a small VPS). Set these:

| Setting | What it does |
| --- | --- |
| `PORT` | The port to listen on (most hosts set it for you). |
| `TRIBE_CLOUD=1` | Cloud mode: the first person claims the tribe with the setup code. |
| `TRIBE_SETUP_CODE` | The code to claim the tribe. If it's missing, one is made at start and printed in the log. |
| `TRIBE_PUBLIC_URL` | Your public address, used in invite links (Render's is detected automatically). |
| `TRIBE_DIR` | Where the tribe's files live (`/data` in the image). Mount a disk there to keep them. |

## Safety

- Nobody can become host without the setup code. It's checked in constant time and rate-limited, and once a host exists, claiming is closed.
- Features that only make sense on the host's own computer (the GitHub command-line login, opening folders on your PC) are off in the cloud. Sign in to GitHub with Connect GitHub instead.
