# Sign-up flows: every way in, and what happens when it fails

This is the map of every path into TribeCode after the tour with Flint, and how each one ends. Each path ends with a next step and never at a dead end.
The code is in `app/ui/signupnudge.js` (the pop-up after the tour), `app/ui/signup.js` (the sign-up sheet), `app/ui/accounts.js` (Log in, guest, switcher), `app/ui/oauth.js` + `app/ui/signin.html` (providers), `server/accounts.js` and `server/oauth.js`.
Tests: `e2e_signup_nudge.py`, `e2e_signup.py`, `e2e_accounts.py`, `e2e_oauth.py`, `e2e_demo_intro.py`.

## What a host can turn on

| Way in | Turned on by | Notes |
| --- | --- | --- |
| Continue as guest | always | Local to this device (`accounts.js guest()`). |
| Create an account (username + password, optional email) | `TRIBE_ACCOUNTS=1` | Answered on the host computer (local-only routes). The email is kept and marked "verify later". |
| Discord, GitHub, Google | the host pastes a client id and secret in Settings › Sign-in, or sets `TRIBE_OAUTH_<P>_ID/SECRET` | They join a tribe from an invite, sign a linked member back in, or link to a member. |
| Apple | the same, plus a Services ID | Hidden until it's configured. On iPhone builds, Discord and Google hide until Apple is on (App Store 4.8). |
| Email magic link | **not available** | TribeCode sends no email yet (`TODO(email)` in `server/accounts.js`). Password resets use a one-time code the host makes. |

## After the tour: "Ready to make your own?"

| Entry | Steps | Success | Failure handling | Where they land |
| --- | --- | --- | --- | --- |
| The tour ends (Your turn card, Skip to end, or Exit after chapter 3) | A 5 s beat (sooner after the first click or key in the real app), then the pop-up. Never while the tour plays or while another sheet is open. | The pop-up offers each configured way in, plus Continue as guest, Not now and "Have an account? Log in". | Esc and X close it (once per session). Not now snoozes it for 7 days. | Inside the demo, every choice first leaves the demo (Exit cleans up) and then runs in the real app (`signupNudge.then`), so a sign-in never lands in the pretend tribe. |
| Signed-in user (an account, or a full member key on this device) | none | none | none | The pop-up never shows. |
| Automated browser | none | none | none | Never shows, unless `localStorage['tribecode.test.nudge'] = '1'`. |

## Each path

| Path | Entry | Steps | Success | Failure handling | Where they land |
| --- | --- | --- | --- | --- | --- |
| **OAuth, new person** | Continue with GitHub (or Discord, Google) in the pop-up or sheet | `POST /api/oauth/<p>/start {mode: signin}`, then the provider, then `/signin.html#oauth=<rc>`, then `POST /api/oauth/finish` | none: a provider alone can't make a membership without an invite | `unknown`: "New here? Ask a friend for an invite link and choose Continue with GitHub on it." Also Create an account, Continue as guest and Open the tribe. | signin.html with next steps and the provider buttons to try again |
| **OAuth, returning member** | the same buttons, or `/signin.html` | the same | A new device token, so other devices stay signed in. | `expired`, `mismatch`: "Use the same browser from start to finish", plus try again. `offline`: "The tribe's computer isn't answering." | the tribe (`/`); phones get their device link so Add to Home Screen signs itself in |
| **OAuth cancelled** | the provider's Cancel | The provider sends `#oauth_error=denied`. | none | "Sign-in was cancelled. No problem, nothing was shared." with the buttons again, Create an account and Continue as guest | signin.html |
| **OAuth error** (the provider refuses, rate limits, or the provider was turned off) | none | none | none | Plain words (`ERRS` in oauth.js) plus "Try again in a moment, or pick another way in." | signin.html |
| **Account used with another provider** | GitHub is unknown, but the person signed up with Discord | `unknown` remembers GitHub (`tribecode.oauth.linkNext`); the person signs in with Discord. | After the Discord sign-in: "Link GitHub too?" with Link GitHub (`mode: link`) and "Not now, open the tribe". | `taken` (linked to someone else in this tribe): "Sign in with it instead, or link a different one in Settings › Sign-in." | the tribe; Linked appears in Settings › Sign-in |
| **Guest pass or invite member to provider** | the pop-up when a member key is on this device | `mode: link` attaches the identity to that member. | "Save with GitHub": everything they made stays theirs. They sign back in with one tap. | as above | signin.html "Linked", then the tribe |
| **Create an account** | the pop-up or sheet: Create an account | Username (checked as you type, with suggestions), password strength, optional email | Make it yours (skippable), then Home "Welcome, … Next: start your first project" | Taken name: suggestions. Weak password: a tip. Accounts off: "the host turns them on". Too many tries: "take a breather". | Home |
| **Guest to full account** | the pop-up (upgrade copy "Keep what you made"), "Save your work" nudges, profile menu | The same form. A member key on this device is linked (`signup link: true`). | Projects on this device and tribe memberships are kept. | as above | Home, with the project still there |
| **Email: link expired, wrong email** | none | none | none | No mail is sent yet, so there is no link to expire. Forgot password asks the host for a one-time code (30 min, 5 tries). A wrong or old code says so and keeps the form. A wrong email is only stored ("verify later"), so it can't lock anyone out. | Log in |
| **Returning user** | "Have an account? Log in" in the pop-up or the sheet | Recent accounts on this device (one click), username and password, the providers, Join with an invite link | Signed in | Wrong password: plain words plus Forgot password | the tribe |
| **Continue as guest** | the pop-up or sheet | `mode: guest`, local only | A toast with the next step ("Start a project or join one") | none | Home |
| **Not now** | the pop-up | Snoozed for 7 days | none | none | where they were |

## Platforms

| Platform | Strategy |
| --- | --- |
| Web (a friend's host) | Everything above. The provider redirect comes back to the host's public address (`/signin.html` or `/join/<code>`). |
| Phone or PWA | The same pages. After a provider sign-in the phone opens its private device link (`/m/<key>/`), so Add to Home Screen installs an app that signs itself in. The pop-up is a bottom sheet. |
| Desktop app | The desktop app usually is the host and signed in as the host, so the pop-up doesn't show. When it does (a joined tribe without an account), it offers Create an account (talks to the server directly) and says "GitHub, Google and Discord sign-in work from TribeCode in your browser". A provider redirect can't come back into the app window, and handing a key over a `tribecode://` link is not done on purpose. Linking lives in Settings › Sign-in in the browser. |
| The website's demo (GitHub Pages, no server) | No accounts and no providers, so the alternative pop-up shows. |

## A host with accounts off and no providers

The pop-up doesn't offer sign-up. It shows **Host your own** instead: a project on this device (the local setup sheet; on the desktop app, Host here). It also shows **Join a friend**, which opens the invite-link field. On the web, a Get the desktop app link and Not now come with them.

## Offline or solo device

A project that lives only on this device (solo) counts as a guest. The pop-up and "Save your work" offer Create an account once the host answers, and the upgrade keeps the project. With no network, the providers and accounts can't be reached, so the alternative shows. Host your own still works offline.

## Known gaps (not fixed here)

- OAuth links live on tribe members, not on accounts (docs/ACCOUNTS.md › TODO 3). A provider alone can't create an account. New people join with an invite, or with a username and password.
- Account routes answer only on the host computer, so Create an account from a friend's browser says accounts are off. That's the same rule as before.
- No email: no magic link, no verification and no reset mail.
