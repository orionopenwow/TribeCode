# GitHub sign-in, Desktop folders and Home Screen apps

Three things that make a project feel like yours, with no terminal and no token pasting.

## 1. Sign in to GitHub (once)

**Settings › GitHub › Sign in with GitHub.** TribeCode shows a short code (already copied), opens
github.com/login/device, you paste the code and approve, and TribeCode finishes on its own: it shows
`@you` and from then on everything pushes by itself:

- a new project's private GitHub repo and first push (the one-click flow),
- "Push my branch",
- the repo autopilot and the integrator (they use the host's sign-in).

If the project was waiting for GitHub ("Connect GitHub"), signing in finishes that step straight away.

The token stays on the host computer (`.tribe/secrets/<you>.json`, readable only by the host's user). It
never goes to a browser, isn't in backups, and isn't logged. **Sign out** removes it from TribeCode. To revoke
it on GitHub as well, go to GitHub › Settings › Applications › Authorized OAuth Apps.

Other ways to sign in:
- **Use my GitHub CLI login.** Shown on the host computer when `gh` is installed and signed in.
- **Paste a token instead.** A classic token with the `repo` scope, or a fine-grained token with Contents
  read/write and Administration (to create repos). TribeCode checks it with GitHub before saving it.

### One-time setup: register the OAuth App (the host, about 2 minutes)

The device flow needs a GitHub OAuth App client id. It isn't a secret, so no client secret is needed.

1. On github.com: your picture › **Settings › Developer settings › OAuth Apps › New OAuth App**
   (direct link: https://github.com/settings/applications/new).
2. Fill it in:
   - Application name: `TribeCode`
   - Homepage URL: `https://orionopenwow.github.io/TribeCode/` (any URL works)
   - Authorization callback URL: `http://localhost:4747` (the device flow doesn't use it, but GitHub asks for one)
3. Click **Register application**.
4. On the app's page, tick **Enable Device Flow** and click **Update application**.
5. Copy the **Client ID** (it looks like `Ov23li…`).
6. In TribeCode: **Settings › GitHub**, paste it into "Client id" and click **Save**. "Sign in with GitHub" appears.

You can also set it with the environment variable `TRIBE_GITHUB_CLIENT_ID`, which takes precedence. It's
stored in `.tribe/github.json` in the tribe folder. Everyone in the tribe signs in with the same app, each
with their own GitHub account.

## 2. The project as a folder on your Desktop (host computer)

On the pinned repo (Docs), click **Folder**:

- **Export a copy.** Files go to `Desktop/TribeCode Projects/<Project name>/`, and the folder opens afterwards.
  - *Just the files*: everything in the project that git doesn't ignore, including new files that aren't
    committed yet. No `.git` folder. Ready to zip or hand over.
  - *With history*: a git clone. Its `origin` is the project's GitHub repo, so you can keep working there
    and push.
  - If the folder already exists, the next one is `<Project name> 2`, and so on. Nothing is overwritten.
- **Keep a copy on my Desktop.** A git clone that follows the project. After every push, merge or autopilot
  commit, it fast-forwards a few seconds later. If you edit files in the copy, it stops updating until you
  commit or undo them, so your work is never overwritten. Turning it off leaves the folder in place.
  Remotes: `tribe` is the project on this computer and `origin` is GitHub.

These options only work from the host computer itself. A friend's browser, or anything coming through the
public link, gets "only on the host computer".

## 3. The app on a Home Screen or the Desktop

Each project has a stable, private app address: `/app/<key>/`. It opens the live app full screen, with
the project's name, picture (or its initials on the project color) and theme color, and it reloads as the
tribe builds.

- **Phone:** Docs › pinned repo › **Home Screen** (or the preview's phone button). Tap **Open the app**, then
  Share › **Add to Home Screen** (iPhone) or ⋮ › **Add to Home screen** (Android). The app page shows the
  same tip until it's installed.
- **Desktop (host computer):** **Shortcut** › **Create desktop shortcut**. This writes `<Project name>.url`
  (Windows), `.webloc` (Mac) or `.desktop` (Linux) on the Desktop, with the project's icon. To put the app on
  your phone, scan the QR code in the same sheet.

The key isn't your sign-in. It only opens this one project's app preview, which runs sandboxed and can't
reach TribeCode's API. Each launch checks again that you're still in the project. **Turn it off** in the
same sheet makes old icons stop working, and the next link you make is a new one.

## For developers

- Server: `server/github-auth.js` (device flow, gh CLI, token check, `pushAuth()` for the autopilot),
  `server/export.js` (export, live copy, shortcut files), `server/applink.js` (`/app/<key>/`, manifest, icons).
- UI: `app/ui/github.js`, `app/ui/folders.js`, `app/ui/folders.css`.
- Test: `app/test/e2e_export.py` mocks GitHub (device flow, REST and git smart HTTP) and checks that the
  push is authenticated with the signed-in token.
- Environment variables: `TRIBE_GITHUB_CLIENT_ID`, `TRIBE_GITHUB_API`, `TRIBE_GITHUB_WEB`, `TRIBE_DESKTOP_DIR`,
  `TRIBE_NO_REVEAL`, `TRIBE_MIRROR_POLL_MS`, `TRIBE_MIRROR_DEBOUNCE_MS`, `TRIBE_SHORTCUT_KIND`, `TRIBE_APPLINK_TTL_MS`.
