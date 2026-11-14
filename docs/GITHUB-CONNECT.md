# Connect GitHub

One flow, the same from every door: **Connect GitHub → sign in → pick or create where the project goes → done**, ending on
"Connected as @name", the link, and when it was last backed up.

This page is the map of the code, what the owner has to do once to switch on one-click sign-in, and a checklist.

## What people see

1. **Sign in.**
   - One-click sign-in **on**: a "Sign in with GitHub" button. It shows a short code, opens github.com, and finishes by
     itself once the person approves.
   - One-click sign-in **off** (today's default): the owner sees one calm line saying what switches it on, with the box to
     paste the GitHub app id right there. Everyone else sees that it isn't on yet. Both can paste a token instead, which
     works the same.
2. **Pick or create.** "Create a new one" (the project's name is filled in, private by default) or "Use one I have" (a
   list of theirs, or type `owner/name`).
3. **Done.** Connected as @name, the link, "Last backup …" or "No backup yet", and Back up now.

A tribe that lives only in a browser (no TribeCode behind the page) has nowhere safe to keep a sign-in, so there the same
block asks for `owner/name` and an optional token that stays on that device.

## What "one click" still needs from the owner

Nothing in the code. One value:

| What | Where it goes | Notes |
| --- | --- | --- |
| **GitHub app id** (the OAuth App's *Client ID*, looks like `Ov23li…`) | Any one of: the box in the Connect GitHub sheet or Settings › GitHub (saved to `.tribe/github.json`); the `TRIBE_GITHUB_CLIENT_ID` environment variable; or `BUILTIN_CLIENT_ID` in `server/github-auth.js` to ship it to everyone | Public value, safe to commit. **No client secret is used.** |

Order of precedence: environment → Settings → built-in. As soon as any of them is set, `GET /api/github` answers
`configured: true` and the button appears for every member, with no code change and no restart for the Settings path.

### Registering the app (once, about two minutes)

1. github.com › Settings › Developer settings › **OAuth Apps** › New OAuth App.
2. Application name: `TribeCode`. Homepage URL: `https://orionopenwow.github.io/TribeCode/`.
3. Authorization callback URL: GitHub requires the field. Sign-in by code never calls it, so any of the URLs below is
   fine; use the one for where TribeCode runs so it is already right if a redirect sign-in is added later.
4. Tick **Enable Device Flow**. (Without it GitHub answers `device_flow_disabled` and the sheet says so.)
5. Copy the **Client ID** into one of the places in the table above.

### Callback URLs, per place TribeCode runs

Not called today (see step 3). Reserved so the registration never has to change:

| Where TribeCode runs | Callback URL to register |
| --- | --- |
| Desktop app | `tribecode://github/callback` (the app already owns the `tribecode://` link type) |
| Self-run (`npm start`) | `http://localhost:4747/api/github/callback` |
| Cloud (Render or your own server) | `https://<your-address>/api/github/callback` |

A GitHub OAuth App takes one callback URL. If all three are ever needed with a redirect sign-in, register one app per
place or move to a GitHub App, which takes several.

### Owner checklist

- [ ] OAuth App registered, **Enable Device Flow** ticked.
- [ ] Client ID pasted in Settings › GitHub (one tribe), or set as `TRIBE_GITHUB_CLIENT_ID` (one server), or put in
      `BUILTIN_CLIENT_ID` (every install; needs a release).
- [ ] Open Connect GitHub as the owner: the button "Sign in with GitHub" shows and the "isn't switched on yet" line is gone.
- [ ] Open it as a second member: the same button shows.
- [ ] Sign in, create a new one, press Back up now, open the link.

## Still off on purpose

Accounts, two-step sign-in and payments stay built but switched off (`docs/ACCOUNTS.md`, `docs/AUTH-PLAN.md`). This flow
does not depend on them and does not turn them on. Signing in to GitHub here is only a saved GitHub sign-in per member; it
is not a TribeCode account.

## Where secrets live

- A member's GitHub sign-in is saved on the computer that runs the tribe, in `.tribe/secrets/<member>.json` (mode 0600).
- It is sent to the server once (the token path) or never touches a browser at all (the code path).
- No answer to a browser carries it. Other members get `signedIn: false` for themselves and cannot list, create or back up
  with someone else's sign-in. Agents cannot sign in. Log lines mask anything shaped like a token.
- `app/test/e2e_github_connect.py` checks all of that against the stand-in GitHub.

## Map of the code

| Piece | File | What it does |
| --- | --- | --- |
| The flow | `app/ui/ghconnect.js` (`TribeGitHubConnect.open`, `.mount`) | The sheet and the inline block: sign in → pick or create → done |
| The sign-in block | `app/ui/github.js` (`TribeGitHub.mount`) | The button, the short code, the app id box, the token box |
| Sign-in on the server | `server/github-auth.js` | `GET /api/github`, `PUT /api/github/config`, `POST/GET/DELETE /api/github/device`, `POST /api/github/token`, `POST /api/github/gh`, `POST /api/github/signout` |
| Pick or create | `server/github-auth.js` | `GET /api/github/repos` (theirs, newest first), `POST /api/github/repos { name, private }` |
| Connecting a project | `server/sync.js` | `PUT /api/projects/:id/sync { kind: 'github', repo, branch }`, `GET` for the status the Done step shows |
| Browser-only tribes | `app/ui/setuplocal.js` (`github.connect`), `app/ui/ghphone.js` | A link and an optional token on that device |

### Every door, and what it opens

| Door | Code | Opens |
| --- | --- | --- |
| Setup › More options › GitHub | `app/ui/tribenew.js` | `TribeGitHubConnect.mount` inline |
| Sharing and backup card › More options › GitHub | `app/ui/livingrepo.js` `where()`, `github()` | `TribeGitHubConnect.open` |
| A project's steps › Connect GitHub | `app/ui/projects.js` `connectGithub()` | `TribeGitHubConnect.open` |
| Ctrl K › Connect GitHub | `app/ui/ghconnect.js` | `TribeGitHubConnect.open` |
| Settings › Projects and backup › GitHub | `app/ui/settings.js` | The sign-in block alone (signing in or out, the app id box) |
| Publish › A link that stays up | `app/ui/publishreal.js` | The sign-in block alone; Publish makes its own place for the published page |
| Browser-only tribe › Sharing and backup › Connect GitHub | `app/ui/offline.js`, `app/ui/setuplocal.js` | The link-and-token path (`TribeGitHubConnect.open` hands over to it) |
| Phone, no server | `app/ui/ghphone.js` | The token sheet on the phone |

Not yet folded in: the older guided sheets inside `setuplocal.js` for a browser-only tribe keep their own screens, and
Publish creates its own place rather than asking. Both use the same sign-in.

## Testing against the stand-in

`app/test/ghmock.py` stands in for both `api.github.com` and `github.com/login/*`. Point the server at it with
`TRIBE_GITHUB_API` and `TRIBE_GITHUB_WEB`. `python app/test/e2e_github_connect.py` covers: one-click off and the token
path, a refused token, create, a taken name, an account that may not create, pick, one-click on with an approved and a
denied sign-in, the secrecy checks, and a 390px phone.
