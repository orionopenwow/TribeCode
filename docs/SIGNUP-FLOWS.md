# Sign-up flows: every way in, and what happens when it fails

This is the map of every path into TribeCode after the tour with Flint, and how each one ends. Each path ends with a next step and never at a dead end.
The code is in `app/ui/signupnudge.js` (the pop-up after the tour), `app/ui/signup.js` (the sign-up sheet), `app/ui/accounts.js` (Log in, guest, switcher), `app/ui/oauth.js` + `app/ui/signin.html` (providers), `app/ui/auth2.js` (the steps after a provider or an email link, the desktop sign-in, Settings › Account › Sign-in methods), `server/accounts.js`, `server/oauth.js` and `server/smtp.js`.
Tests: `e2e_signup_nudge.py`, `e2e_signup.py`, `e2e_accounts.py`, `e2e_oauth.py`, `e2e_auth2.py`, `security5_test.py`, `e2e_demo_intro.py`.

## What a host can turn on

| Way in | Turned on by | Notes |
| --- | --- | --- |
| Continue as guest | always | Local to this device (`accounts.js guest()`). |
| Create an account (username + password, optional email) | `TRIBE_ACCOUNTS=1` | From any browser that reaches the host (a tunnel, the cloud). The admin routes stay on the host computer. With email on, the address gets a confirm link; without it, it is kept as "verify later". |
| Open sign-up | Settings › Account › **Who can sign up** (default on; `TRIBE_OPEN_SIGNUP=0` makes the default off) | Off: a new person needs an invite code (the sign-up form, the provider step and email sign-up all ask for it). The host computer can always make accounts. |
| Discord, GitHub, Google | the host pastes a client id and secret in Settings › Sign-in, or sets `TRIBE_OAUTH_<P>_ID/SECRET` | They join a tribe from an invite, sign a linked member back in, link to a member and, with accounts on, make or sign in to an **account**. |
| Apple | the same, plus a Services ID | Hidden until it's configured. On iPhone builds, Discord and Google hide until Apple is on (App Store 4.8). |
| Email links (sign in, sign up, reset, confirm) | Settings › Account › **Email**: an SMTP server (host, port, STARTTLS/TLS, user, password, from) and **Send test email** | Off (the default): TribeCode sends no email, and says so. Password resets use the one-time code the host makes. |

## After the tour: "Ready to make your own?"

| Entry | Steps | Success | Failure handling | Where they land |
| --- | --- | --- | --- | --- |
| The tour ends (Your turn card, Skip to end, or Exit after chapter 3) | A 5 s beat (sooner after the first click or key in the real app), then the pop-up. Never while the tour plays or while another sheet is open. | The pop-up offers each configured way in, plus Continue as guest, Not now and "Have an account? Log in". | Esc and X close it (once per session). Not now snoozes it for 7 days. | Inside the demo, every choice first leaves the demo (Exit cleans up) and then runs in the real app (`signupNudge.then`), so a sign-in never lands in the pretend tribe. |
| Signed-in user (an account, or a full member key on this device) | none | none | none | The pop-up never shows. |
| Automated browser | none | none | none | Never shows, unless `localStorage['tribecode.test.nudge'] = '1'`. |

## Each path

| Path | Entry | Steps | Success | Failure handling | Where they land |
| --- | --- | --- | --- | --- | --- |
| **OAuth, new person** (accounts on) | Continue with GitHub (or Discord, Google) in the pop-up, the sheet, Log in or `/signin.html` | start, the provider (with the `email` scope), `/signin.html#oauth=<rc>`, `POST /api/oauth/finish` → `{ mode: 'new', ticket, suggested, email }`. **Pick your username**: the provider's name, made unique, editable, checked as you type. `POST /api/accounts/oauth/confirm { ticket, username }` | A new account with the provider linked (and the provider's verified email, verified), signed in. Next time the same button signs straight in (`mode: 'account'`). | Taken name: free suggestions. Ticket over (10 min, once): "Start again". | `/` signed in to the account (mode `account`) |
| **OAuth, the email has an account** | the same, when the provider's **verified** email belongs to an account with that email verified | `{ mode: 'link-offer', ticket, username }`: "You already have an account. Sign in to it once and we'll link GitHub." Username + password, then `POST /api/accounts/oauth/link { ticket }` with that session | Linked; either one signs in from now on. No duplicate account (`confirm` answers `409 link`). | Wrong password: plain words plus Forgot your password. | `/` |
| **OAuth, sign-up by invite** (open sign-up off) | the same | `{ mode: 'invite' }`: **Ask for an invite** with an invite-code field and the username | The account, and the code makes them a member of the tribe too (`memberToken`). | A wrong or used code: "that invite code does not work: check it, or ask for a fresh one". | the tribe |
| **OAuth, new person** (accounts off) | as above | as above | none: a provider alone can't make a membership without an invite | `unknown`: "New here? Ask a friend for an invite link and choose Continue with GitHub on it." Also Create an account, Continue as guest and Open the tribe. | signin.html with next steps and the provider buttons to try again |
| **OAuth, returning member** | the same buttons, or `/signin.html` | the same | A new device token, so other devices stay signed in. | `expired`, `mismatch`: "Use the same browser from start to finish", plus try again. `offline`: "The tribe's computer isn't answering." | the tribe (`/`); phones get their device link so Add to Home Screen signs itself in |
| **OAuth cancelled** | the provider's Cancel | The provider sends `#oauth_error=denied`. | none | "Sign-in was cancelled. No problem, nothing was shared." with the buttons again, Create an account and Continue as guest | signin.html |
| **OAuth error** (the provider refuses, rate limits, or the provider was turned off) | none | none | none | Plain words (`ERRS` in oauth.js) plus "Try again in a moment, or pick another way in." | signin.html |
| **Account used with another provider** | GitHub is unknown, but the person signed up with Discord | `unknown` remembers GitHub (`tribecode.oauth.linkNext`); the person signs in with Discord. | After the Discord sign-in: "Link GitHub too?" with Link GitHub (`mode: link`) and "Not now, open the tribe". | `taken` (linked to someone else in this tribe): "Sign in with it instead, or link a different one in Settings › Sign-in." | the tribe; Linked appears in Settings › Sign-in |
| **Guest pass or invite member to provider** | the pop-up when a member key is on this device | `mode: link` attaches the identity to that member. | "Save with GitHub": everything they made stays theirs. They sign back in with one tap. | as above | signin.html "Linked", then the tribe |
| **Create an account** | the pop-up or sheet: Create an account | Username (checked as you type, with suggestions), password strength, optional email | Make it yours (skippable), then Home "Welcome, … Next: start your first project" | Taken name: suggestions. Weak password: a tip. Accounts off: "the host turns them on". Too many tries: "take a breather". | Home |
| **Guest to full account** | the pop-up (upgrade copy "Keep what you made"), "Save your work" nudges, profile menu | The same form. A member key on this device is linked (`signup link: true`). | Projects on this device and tribe memberships are kept. | as above | Home, with the project still there |
| **Email sign-in link** (email on) | Log in › Email me a sign-in link, the sheet, `/signin.html` | `POST /api/accounts/email/request { email }` → always `{ ok, via: 'email' }`. A **verified** address gets a sign-in link; an unknown one gets a sign-up link when sign-up is open (or with an invite). `/signin.html#magic=<token>` (fragment cleared at once) → `POST email/complete` | Signed in (and the member, when the account has one in this tribe). A sign-up link asks for the username first. | Used or older than 15 minutes: "That link has run out", with the email form again. Nothing arrives: "Check spam, or try again in a minute." | `/` |
| **Forgot password** | Forgot password? | Email on: a reset link to the account's address (`#reset=`, 15 minutes, once), new password, every other device signs out. Email off, or no address on the account: the host's one-time code (30 min, 5 tries). | Signed in with the new password | A weak password keeps the link good. Used or old: "Ask for a new link". | `/` |
| **Returning user** | "Have an account? Log in" in the pop-up or the sheet | Recent accounts on this device (one click), username and password, the providers, Join with an invite link | Signed in | Wrong password: plain words plus Forgot password | the tribe |
| **Continue as guest** | the pop-up or sheet | `mode: guest`, local only | A toast with the next step ("Start a project or join one") | none | Home |
| **Not now** | the pop-up | Snoozed for 7 days | none | none | where they were |

## Platforms

| Platform | Strategy |
| --- | --- |
| Web (a friend's host) | Everything above. The provider redirect comes back to the host's public address (`/signin.html` or `/join/<code>`). |
| Phone or PWA | The same pages. After a provider sign-in the phone opens its private device link (`/m/<key>/`), so Add to Home Screen installs an app that signs itself in. The pop-up is a bottom sheet. |
| Desktop app | Provider buttons open the **system browser** (`POST /api/oauth/<p>/start { mode, desktop: { challenge } }`, PKCE S256 from the app). The host's callback shows **Return to TribeCode** (`tribecode://auth?code=…`, a one-time code, never a key) and a **6-character code** to type if the link does nothing. The app trades the code plus its verifier: `POST /api/oauth/desktop/exchange { code \| short, verifier }`. Codes last 2 minutes, work once, die after three wrong verifiers, and the exchange is rate-limited. Linking a provider in Settings › Account works the same way (`mode: 'account'`). |
| The website's demo (GitHub Pages, no server) | No accounts and no providers, so the alternative pop-up shows. |

## A host with accounts off and no providers

The pop-up doesn't offer sign-up. It shows **Host your own** instead: a project on this device (the local setup sheet; on the desktop app, Host here). It also shows **Join a friend**, which opens the invite-link field. On the web, a Get the desktop app link and Not now come with them.

## Offline or solo device

A project that lives only on this device (solo) counts as a guest. The pop-up and "Save your work" offer Create an account once the host answers, and the upgrade keeps the project. With no network, the providers and accounts can't be reached, so the alternative shows. Host your own still works offline.

## Remote browsers (a friend's browser, a tunnel, the cloud)

Sign-up, sign-in, sign-in links, resets and the provider steps answer every browser that reaches the host when accounts are on. The host's routes (`/api/accounts/admin/*`, `/api/accounts/resets`) answer only the host on the host computer. Every account POST must be same-origin JSON (CSRF): a body that isn't `application/json`, an `Origin` that isn't this server's own address, its public URL or the desktop app, or a cross-site fetch is refused with "open TribeCode itself and try again". Rate limits key on the client address a tunnel reports (`CF-Connecting-IP`, the last `X-Forwarded-For` hop). Mail links only ever point at an allowed address (the public URL, this computer, the home network), whatever `Host` a request carried.

## Settings › Account

- **Sign-in methods** (everyone with an account): password, email link (a verified address), each linked provider. Link Discord/GitHub/Google, Set a password, Remove/Unlink. The last way in can't be removed (`409 last`, and the button is disabled).
- **Who can sign up** (the host, on the host computer): the Open sign-up switch.
- **Email** (the host, on the host computer): SMTP server, port, security (STARTTLS, TLS, or none for a relay on this computer), username, password (stored in `.tribe/auth.json`, 0600, never sent back), From, Save, Turn off, **Send test email**.

## Still open

- Apple sign-in has no email (scope-less until the ES256 client secret lands, see `server/oauth.js`), so Apple never triggers the link offer.
- The desktop handoff uses the `tribecode://` deep link and the typed code; there is no loopback (127.0.0.1) listener in the app.
