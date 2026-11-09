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

- It sleeps after 15 minutes with nobody connected, and takes about a minute to wake up. While anyone has the tribe open, it stays awake.
- Its files are wiped when it sleeps, restarts or redeploys. That includes chat, tasks and members. **Your code is safe once it's on GitHub.** For a tribe that keeps everything, host on your own computer (Tailscale Funnel or Cloudflare, see HOSTING.md) or on a paid cloud plan with a disk.
- 750 free hours a month per Render workspace.

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
