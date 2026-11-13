# Auth plan: where real sign-in plugs in

Written 2026-11-12 (feat/mobile-complete). Nothing here is built new; this maps what exists, what is stubbed, and the exact
places real auth connects for phones, hosts and the cloud. **Reminder for Camp: this is the piece to finish so every
feature works for real people on their phones.** Not legal advice.

## What exists today

| Piece | Where | State |
| --- | --- | --- |
| Member keys (invite link, device link, host reclaim) | `server/index.js` `/api/join`, `server/devices.js` | Working. This is what "signed in" means inside a tribe. |
| Sign in with GitHub / Discord / Google (Apple gated) | `server/oauth.js`, `app/ui/oauth.js`, [SIGN-IN.md](SIGN-IN.md) | Working **per host**: each host registers its own OAuth app and pastes the id + secret in Settings › Sign-in. Off until then. |
| Accounts (username + password, recovery codes) | `server/accounts.js`, `app/ui/accounts.js`, `app/ui/signup.js`, [ACCOUNTS.md](ACCOUNTS.md) | **Scaffold, off by default** (`TRIBE_ACCOUNTS=1`), answers only from the host computer. No email yet (`TODO(email)` in `server/accounts.js`). |
| GitHub from a phone with no host | `app/ui/ghphone.js` (`TribeGhPhone.authProvider`) | Working with a **fine-grained personal access token** kept only on the device. |
| GitHub "light home" for local projects | `app/ui/setuplocal.js` (same token key `tribecode.light.ghToken`) | Working with the same token. |

## Why phones can't do OAuth on their own

GitHub's OAuth **device flow** and the **token exchange** endpoints don't send CORS headers, so a web page (the PWA)
can't finish an OAuth sign-in without a server in the middle, and an OAuth client secret must never ship in the app. So:

- **Joined phone** (a host exists): sign-in already goes through the host (`server/oauth.js`). Works once the host
  registered the OAuth app.
- **Phone-only tribe** (no host): today a personal access token. Real "Sign in with GitHub" needs a small TribeCode
  backend (or the host) to do the code exchange.

## The four plug-in points

1. **Phone GitHub token → OAuth**: `TribeGhPhone.authProvider = async () => token` in `app/ui/ghphone.js`. Set it to a
   function that gets a GitHub user token from the future backend (or from the host when the phone is joined).
   Nothing else in ghphone.js changes; the token box stays as the fallback.
2. **Accounts backend**: flip `TRIBE_ACCOUNTS=1` on a host (it answers only from the host computer today), or build a
   hosted accounts service with the same routes that `app/ui/accounts.js` and `signup.js` already call. The front end
   (log in, sign up, switcher, guest upgrade) is built.
3. **Cloud hosts (Render)**: OAuth ids and secrets as environment variables (`TRIBE_OAUTH_<P>_ID`,
   `TRIBE_OAUTH_<P>_SECRET`), because saved settings are wiped when the free service sleeps. Push keys the same way
   (`TRIBE_VAPID_PUBLIC` / `TRIBE_VAPID_PRIVATE`, [CLOUD.md](CLOUD.md)).
4. **Passkeys (later, optional)**: WebAuthn on the accounts backend (`server/accounts.js` login), so phones sign in with
   Face ID / fingerprint. Needs the backend on a stable HTTPS domain (tribecode.org or the host's Funnel address).

## What Camp must do

1. Decide: hosted accounts service (TribeCode-run, needs the backend + privacy policy) **or** per-host only (today).
2. For each host address you use (your Funnel URL, a Render URL): register OAuth apps (GitHub one per host, Discord and
   Google can share) with the callback `<host>/api/oauth/<provider>/callback`. Settings › Sign-in shows it with Copy.
3. Publish TribeCode's privacy policy and terms (Google's consent screen needs them).
4. When the backend exists: set `TribeGhPhone.authProvider`, turn on accounts, add email for recovery.

## Stubs and their markers

- `server/accounts.js`: `TODO(email)`; routes only from this computer until a hosted backend.
- `app/ui/ghphone.js`: `authProvider` is `null` (falls back to the device token).
- `app/ui/premium.js`: plans and credits are planned only; no checkout or prices until the backend exists.
