# Sign in with Discord, GitHub or Google

Friends can join a tribe from an invite with **Continue with Discord / GitHub / Google** instead of typing a name, and
later sign back in on a new phone or laptop with **Sign in with …** at `/signin.html`, with no fresh invite.
Picking a name still works the same as before. Every provider stays off until the host sets it up.

Code: `server/oauth.js` (flow + API), `app/ui/oauth.js` + `oauth.css` (buttons, Settings › Sign-in),
`app/ui/join.html`, `app/ui/signin.html`. Test: `app/test/e2e_oauth.py`.

## Before you start: pick the address friends use

The provider sends people back to a **redirect URI** that must match exactly what you register:

```
<public base>/api/oauth/<provider>/callback
```

The public base is the tribe's public https link when sharing is on (Invite › Share beyond my Wi-Fi), otherwise the address
the page was opened on. **Turn the public link on first** and use **Tailscale Funnel**: its `https://<machine>.<tailnet>.ts.net`
address never changes. A Cloudflare quick tunnel gets a new random address every start, so you would have to update the
redirect URI at the provider each time. `TRIBE_PUBLIC_URL` / `--public-url` pins it by hand.

Settings › Sign-in shows the exact redirect URI for each provider, with a Copy button. Copy it from there.

## Discord (2 minutes)

1. Open https://discord.com/developers/applications and click **New Application**. Name it after your tribe.
2. Go to **OAuth2**. Under **Redirects**, click **Add Redirect** and paste the Discord redirect URI from Settings › Sign-in. Save.
3. Copy the **Client ID**. Click **Reset Secret** and copy the **Client Secret**.
4. In TribeCode, on the host computer: Settings › Sign-in › Discord. Paste both and click **Save**. The badge turns **On**.

Scope used: `identify` (user id, display name, avatar; no email).

## GitHub (2 minutes)

1. Open https://github.com/settings/developers › **OAuth Apps** › **New OAuth App**.
2. Homepage URL: your tribe's public link. **Authorization callback URL**: paste the GitHub redirect URI from Settings › Sign-in.
3. Click **Register application**, copy the **Client ID**, then **Generate a new client secret** and copy it.
4. Settings › Sign-in › GitHub: paste both and click **Save**.

Scope used: `read:user` (id, login, name, avatar). This is a different OAuth App from the one in Settings › GitHub (which uses
the device flow to push code). You can use the same app for both: add the callback URL and generate a secret.

## Google (2 minutes)

1. Open https://console.cloud.google.com/apis/credentials (create a project if asked).
2. If asked, set up the **OAuth consent screen**: External, an app name, your email. While it is in "Testing", add your friends'
   Google accounts as test users, or click **Publish app**: `openid profile` needs no Google review.
3. **Create credentials › OAuth client ID › Application type: Web application**.
4. Under **Authorized redirect URIs**, paste the Google redirect URI from Settings › Sign-in. Click **Create**.
5. Copy the **Client ID** and **Client secret** into Settings › Sign-in › Google and click **Save**.

Scopes used: `openid profile` (id, name, picture; no email).

## How it works

- **Join**: the join page shows a button for each provider that is on. After the provider approves, the server creates the
  member exactly like `POST /api/join` (same invite checks; the invite use is consumed), named after the provider profile, with
  the provider avatar (https, the provider's own image CDN only) and the identity `{provider, id}` linked to the member. If that
  identity is already linked to someone in the tribe, the person is signed in instead and no duplicate account is created.
- **Sign back in**: `/signin.html` (linked from the join page) issues a **new device token** for the member whose identity matches.
  It does not rotate their existing key. The new sign-in is a device (`server/devices.js`): other devices stay signed in, and it
  shows up in the member's device list where it can be revoked on its own. Rotating would silently sign every other device out.
- **Link / Unlink**: Settings › Sign-in › Linked accounts (in a browser; the desktop app says to use the browser).

Security:

- Authorization code flow with **PKCE (S256)** for all three, plus a random `state` for each flow.
- Flow records live in memory for **10 minutes**. `state`, the launch URL and the result code are each **single use**. A replayed
  callback kills the flow.
- The flow is bound to the browser that started it. The launch step (`/api/oauth/go/<id>`) sets an HttpOnly, SameSite=Lax cookie
  holding a nonce, and the callback refuses to continue without it. A link forwarded to someone else can't be finished.
- The member key is never put in a URL. The callback redirects to the page with a one-time result code in the **fragment**
  (`#oauth=…`), which browsers don't send to servers or put in logs. The page trades it for the key with `POST /api/oauth/finish`
  and removes it from the address bar.
- Only the member who started a link flow can finish it, and an account already linked to someone else can't be linked again.
- Client secrets live in `.tribe/oauth.json` (0600) on the host. API responses only say `hasSecret`. Only the host can view the
  setup, and changing it only works from the host computer (`isLocal`: never through a tunnel).
- Rate limits on every public endpoint. Provider text is cleaned on the server and escaped in the UI.

Test hooks: `TRIBE_OAUTH_DISCORD_BASE`, `TRIBE_OAUTH_GITHUB_BASE`, `TRIBE_OAUTH_GOOGLE_BASE` point a provider at a mock.

## Sign in with Apple (config-gated)

Apple is off and hidden until the host sets an **Apple Services ID** (the client id) and a client secret in Settings ›
Sign-in (or `TRIBE_OAUTH_APPLE_ID` / `TRIBE_OAUTH_APPLE_SECRET`). The flow follows the same code + PKCE pattern as the
others; Apple has no profile endpoint, so the stable user id comes from the token answer's `id_token` (`sub`).

In the iPhone app (the Tauri iOS build, or `?platform=ios` in a browser to try it), Discord and Google sign-in are hidden
while Apple is not configured (App Store 4.8). GitHub stays: it connects repositories.

Still to do before submitting (TODO(appstore) in `server/oauth.js`): make the client secret JWT from the team's `.p8` key
instead of pasting one, ask for `name email` (needs `response_mode=form_post`, so a POST callback), verify the
`id_token` signature against Apple's keys, and use Apple's own button artwork.
