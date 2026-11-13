# Accounts

TribeCode has always signed people in with a per-tribe member key (an invite link, Discord/GitHub/Google, a device link or, on the host computer, a reclaim). This adds the front end of real accounts on top of that, a scaffold for the server side, and a clean-up script for the data, so launch is a matter of finishing the TODO list below.

## On this device (app/ui/accounts.js)

- **Log out**: in the profile menu (user bar) and in Settings › Account. It clears this device's session: the tribe key, the HttpOnly sign-in cookie (`DELETE /api/session`), device-link and media keys and the tab's place. **Also forget this device's tribes** also drops the saved tribe address and this device's copies of chat, pins, recents, drafts and the unsent outbox. Nothing is deleted from the tribe itself. You land on a signed-out Home with **Log in** and **Continue as guest**.
- **Log in**: a sheet with the accounts saved on this device (one click), the existing providers (`oauth.js`, only where the host turned them on), **Sign in on this computer** (the host reclaim, on the host machine only), **Join with an invite link**, and **Continue as guest**.
- **Account switcher**: the profile menu lists the other accounts on this device, plus **Add account**. Switching keeps each account's key, so switching back needs no new sign-in.
- **Modes** (`localStorage['tribecode.accounts.v1'].mode`): `signedin`, `signedout`, `guest`, `test`. Anything but `signedin` stops the automatic sign-ins (`tribe.js ensureMember`: the boot's auto-claim, the sign-in cookie and the host reclaim). A person's own click (Start your first project, Log in) still signs in. Until someone logs out, picks guest or turns on test accounts, there is no mode and the app behaves exactly as before.

## Sign up (app/ui/signup.js)

One sheet, three ways in, in this order: **Continue as guest** (instant, local), **Create an account**, and **Continue with**
the providers the host turned on (Apple stays hidden until it is configured). Open it from the signed-out Home banner,
Log in › *New here? Create an account*, or a link: `/?signup=1` (the sheet) or `/?signup=create` (straight to the form).
With the flag off, *Create an account* says accounts aren't on for this TribeCode; guest and providers still work.

- **Create an account**: username (checked as you type with `GET /api/accounts/check`, normalized like the server, with
  free suggestions when taken), display name (follows the username until you edit it), password with a strength meter
  (the server's rule plus "okay" or better; `autocomplete="new-password"` and `passwordrules` for iOS autofill), and an
  optional email for recovery. Errors are inline; **Create account** stays disabled until the form is valid. Rate limits
  answer in plain words.
- **After sign-up**: Make it yours (personalize.js, Skip works), then Home with the next step (start your first project,
  or invite a friend) and "Email: verify later". There is no email yet (TODO(email) in server/accounts.js).
- **Save your work**: guests, TEST accounts, guest passes and projects kept only on this device get one calm,
  dismissible nudge per moment, only when the server has accounts on: after the first project (a corner card), in the
  invite sheet (one line) and in Log out. Also in the profile menu. Never blocking. Upgrading keeps everything on this
  device; a member key on this device is linked to the new account (signup with `link: true`).
- **Mode `account`**: signed in to an account that has no tribe on this device yet. Like every mode but `signedin`, it
  stops the automatic sign-ins. The user bar and profile menu say **Signed in as …**.
- **Recent accounts**: Log in lists the six most recent on this device. A signed-out account fills in its username and
  focuses the password.
- **Forgot password** (Log in, under the password): asks with `POST reset/request`. The host sees it in **Settings ›
  Account › Password resets**, clicks **Make reset code** and gives the one-time code over. The person types it with a new
  password (`reset/complete`) and is signed in. Every other session ends.

## TEST accounts

Settings › More settings › **Test accounts**, or open the app with `?accounts=test`. Four local guest accounts are mounted: **Orion** (Pixel Quest crew, Bake Sale Club), **Maya** (Pixel Quest crew), **Jay** (Lantern Run) and **Guest** (no tribes). Each is labelled **TEST** in the user bar, the menu, Log in, Settings and on Home. Signing in to one sets the name, color and avatar the whole UI shows; its tribes are listed on Home and in the switcher. They live only in this browser and never reach a server. Turning the switch off removes them (and signs out if one was active).

## Server scaffold (server/accounts.js)

Off by default. `TRIBE_ACCOUNTS=1` turns the routes on. Since feat/auth2 they answer remote browsers too (a friend's browser, a tunnel, the cloud); the host's routes (`resets`, `admin/*`) answer only the host on this computer. Every POST/PUT/DELETE must be same-origin JSON (CSRF). Signup, login and reset are rate-limited (30 a minute per client address, their own bucket); see feat/auth2 below for the rest.

| Route | Body | Answer |
| --- | --- | --- |
| `POST /api/accounts/signup` | `{ username, displayName?, password?, email?, guest? }` | `{ account, token }` |
| `POST /api/accounts/login` | `{ username, password? }` | `{ account, token }` |
| `POST /api/accounts/logout` | Bearer `tca_…` | `{ ok }` (ends this session) |
| `GET /api/accounts/me` | Bearer `tca_…` | `{ account }` |
| `GET /api/accounts/sessions` | Bearer `tca_…` | `{ sessions }`; `DELETE /api/accounts/sessions/<id>` ends one |
| `GET /api/accounts/check?username=` | | `{ username, valid, available, suggestions? }`: availability only (own bucket, 60 a minute); a member's own mapped name counts as free for them |
| `POST /api/accounts/reset/request` | `{ username }` | `{ ok, via: 'host' }`, the same for every name |
| `GET /api/accounts/resets` | the host's member key | `{ resets }`; `POST resets/<id>` → `{ code }` (shown once), `DELETE resets/<id>` dismisses |
| `POST /api/accounts/reset/complete` | `{ username, code, password }` | `{ account, token }`; ends every other session |
| `POST /api/accounts/link` | Bearer `tca_…`, `{ member: <member key> }` | `{ account, linked }`: that member joins the account (a passwordless placeholder is dropped) |
| `POST /api/accounts/signup` + `link: true` | the member's own tribe key as Bearer | claims the account that member was mapped to (if it has no password yet): new username + password, `{ account, token, linked }` |
| `GET /api/accounts/config` | | `{ on, openSignup, email }` (public) |
| `GET/PUT /api/accounts/admin/settings` | the host's member key, on this computer | `{ openSignup, smtp: { host, port, secure, user, from, hasPass, on } }`; PUT `{ openSignup?, smtp?: {…} \| null }` |
| `POST /api/accounts/admin/smtp-test` | the host, on this computer, `{ to }` | `{ ok }` or `502` with the SMTP server's answer |
| `POST /api/accounts/oauth/confirm` | `{ ticket, username, displayName?, invite? }` | `{ account, token, member?, memberToken? }`; `403 invite`, `409 taken` (+ suggestions), `409 link`, `410` |
| `POST /api/accounts/oauth/link` | Bearer `tca_…`, `{ ticket }` | `{ account, linked }` |
| `POST /api/accounts/email/request` | `{ email, invite? }` | `{ ok, via: 'email' }` for every address; `400 no-email` when email is off |
| `POST /api/accounts/email/complete` | `{ token, username? }` | sign-in: `{ account, token, … }`; sign-up without a username: `{ need: 'username', email, suggested }`; verify: `{ ok, verified }` |
| `POST /api/accounts/reset/complete` | `{ token, password }` (the emailed link) | `{ account, token, … }`; every other session ends |
| `GET /api/accounts/methods` | Bearer `tca_…` | `{ methods: [{ id: password \| email \| provider:<p>, … }], email }`; `DELETE methods/<id>` (`409 last`) |
| `POST /api/accounts/password` | Bearer `tca_…`, `{ password, current? }` | sets or changes the password (the current one when there is one) |
| `POST /api/oauth/<p>/start` + `mode: 'account'` | Bearer `tca_…` | links the provider to the account (the same account must finish) |
| `POST /api/oauth/<p>/start` + `desktop: { challenge }` | the app's PKCE S256 challenge | the callback hands back `/signin.html#desktop=<code>&short=<6>` instead of a result |
| `POST /api/oauth/desktop/exchange` | `{ code \| short, verifier }` | the same outcome as `oauth/finish`; 2 minutes, once, three wrong verifiers kill it |
| `GET /api/account` | the member's tribe key | `{ canDelete, keeps, account? }` (the host: `canDelete: false`) |
| `DELETE /api/account` | `{ confirm: "DELETE" }`, the member's tribe key | removes the member and their agents, device links, project seats, linked accounts and sessions, files named by their id; every `"<member id>"` in the tribe's JSON/JSONL becomes `"deleted-…"` |

**Login signs the member in.** When the account has a password and belongs to a member of this tribe, `login` also
answers `{ member, memberToken }`: a device link for that member, redeemed at once (the same mechanism as phone device
links, so it shows up and can be revoked like one). Passwordless accounts (the auto-mapped ones) never get a member key.

Store: `.tribe/accounts.json` = `{ version: 1, accounts: [{ id, username, usernameKey, displayName, created, status: active | guest | disabled, providers: [], password?, email?, resets?: [{ id, requested, expires, status, codeHash?, codeExpires?, tries? }], sessions: [{ id, tokenHash, created, lastSeen, expires, device }], members: [memberId] }] }`.

- **Usernames**: NFC, trimmed, inner spaces collapsed, 2 to 32 letters, digits, spaces, `.`, `-`, `_`; unique case-insensitively (`usernameKey`), with ` 2`, ` 3` suffixes when the clean-up maps names that collide.
- **Sessions**: tokens are shown once (`tca_` + 32 random characters); only their sha256 is stored. 30 days (guests: 1 day), at most 20 live per account.
- **Passwords**: at least 8 characters, not on the common list, not one repeated character or a straight run, and without the
  username (`weakPassword`, the same rule in signup.js). Still optional on the API while local-only (the sign-up sheet asks for one); when given they are hashed with scrypt (N=16384, r=8, p=1, 16-byte salt) and checked in constant time. Login answers the same for a wrong name and a wrong password.
- **No login on a username alone** (review 2026-11-11, #4): an account with a password logs in only with it. Real
  accounts must set a password at sign-up (`400` otherwise). A guest account (`guest: true`) has none: its sign-up answers
  a `deviceKey` (`tcd_…`, shown once, only its sha256 kept), and `login` with `{ username, deviceKey }` is the only way
  back in, so only that device gets back in. Accounts mapped from members have no password and can't log in here: they sign in with their tribe key
  or a provider until they claim the account (signup `link: true`, with a password). Every route stays local-only.
- **Email**: optional, `email: { address, verified: false, added }`. Nothing is sent yet, so it stays unverified.
- **Reset codes**: a request lasts 24 hours (one open per account). The host's code is 8 characters, shown once, kept as a
  sha256, good for 30 minutes and 5 tries. The rate-limited bucket covers signup, login and reset.
- **Members**: every person in `members.json` gets an account mapped by member id (`account.members`). Member keys are never changed, so every link, device and agent key that works today keeps working.

## feat/auth2: open sign-up, remote access, providers, email

- **Open sign-up** (`.tribe/auth.json` `openSignup`, default on; `TRIBE_OPEN_SIGNUP=0` flips the default). Off: password
  sign-up, provider sign-up and email sign-up need an invite code (`invite`), which also makes the person a member of the
  tribe. The host computer can always make accounts.
- **Providers make accounts.** With accounts on, a provider identity no member has linked goes to accounts
  (`oauthOutcome` in server/accounts.js): an account with that identity signs in; an account whose **verified** email
  equals the provider's **verified** email gets a link offer (sign in to it, then `oauth/link`; no duplicate); otherwise a
  ticket (10 minutes, once, kept as a sha256 in memory) for the username step. Accounts keep
  `providers: [{ provider, subject, name, linked }]`. Scopes now ask for the email (Discord `identify email`, GitHub
  `read:user user:email` with `/user/emails`, Google `openid profile email`).
- **Desktop handoff**: see docs/SIGNUP-FLOWS.md › Platforms. The app keeps the PKCE verifier; the browser only ever sees a
  one-time code.
- **Email** (`server/smtp.js`, Node's net and tls): STARTTLS (587) or TLS (465), certificates always checked; plain only to
  a relay on this computer; AUTH PLAIN/LOGIN only over TLS or locally; CR/LF stripped from every header; dot-stuffing.
  Links: sign-in and sign-up (`#magic=`, 15 minutes), reset (`#reset=`, 15 minutes), confirm (`#verify=`, 24 hours), all
  once, kept as a sha256 in memory, in the URL **fragment** (cleared by signin.html at once). Only verified addresses get
  sign-in links or link offers. At most 5 mails per address per 15 minutes, and 5 requests a minute per client.
- **Lockout**: 10 wrong passwords for one username within 15 minutes lock it for 15 minutes (`429 locked`). Unknown
  usernames are counted the same way, so a lockout reveals nothing.
- **No enumeration**: login, `email/request` and `reset/request` answer the same for known and unknown names and
  addresses (`via` depends only on whether the host set up email).
- **Mail links** point only at an allowed origin (the public URL, `http://localhost:<port>`, the home network), never at
  a request's `Host`.

## feat/auth3: two-step sign-in and passkeys

Code: `server/auth3.js` (with `server/cbor.js` and `server/sealbox.js`), `app/ui/auth3.js`. Tests: `e2e_auth3.py`,
`security8_test.py`. No dependencies: TOTP is HMAC-SHA1, WebAuthn is checked with Node's crypto.

**Two-step sign-in is off by default** (the owner turns it on later). Turn it on with `TRIBE_TWO_STEP=1`, or on the host
computer with `PUT /api/accounts/admin/settings { "twoStep": true }` (kept in `.tribe/auth.json`; there is no switch in
the app while it is off). While it is off: nobody is asked for a code, enrolled or not; the rule for admins does
nothing; every `two-step` route answers `404 { code: 'off' }`; Settings shows **Passkeys** only; `GET
/api/accounts/config` has no `twoStep`. An enrolment made while it was on is kept and counts again when it comes back.
Passkeys work either way, as a normal sign-in method. Everything below about codes describes it turned on.

- **One gate.** Every account sign-in that proves who you are (password, provider, email link, password reset, the
  desktop handoff, and a provider that signs a tribe member back in) passes one gate before a session exists. With
  two-step on, the answer is `{ need: 'two-step', ticket, methods }` and no token. `POST /api/accounts/two-step
  { ticket, code | recovery | trust, remember? }` trades the ticket for the sign-in it stood for. A ticket lasts 5
  minutes, works once and dies after 5 wrong codes; 10 wrong codes for one account in 15 minutes lock its second step
  for 15 minutes (`429 locked`).
- **Codes**: 6 digits, 30 seconds, the step before and after accepted; a step that was used is never accepted again.
- **Recovery codes**: ten, shown once (copy or download), each works once. New ones need a current code.
- **Trust this device for 30 days**: a token only that device keeps (`tribecode.trust.v1`); a reset or a new password
  forgets every trusted device.
- **Turning it off** needs a current code (or a recovery code).
- **Required for admins** (the host, on the host computer: Settings › Tribe & admin › Sign-in rules, `PUT
  admin/settings { twoStepAdmins }`): an admin's account sign-in without two-step gets the account session but no
  tribe key (`twoStep: { required: true }`); the app asks them to turn it on, and `two-step/confirm` hands the key
  over. A passkey sign-in counts. Sign-ins on the host computer are not held back, and member keys already on a
  device (invite links, device links) keep working: this gates account sign-ins.
- **Passkeys**: add, rename and remove in Settings › Account & sign-in; **Sign in with a passkey** on the Log in sheet
  and `signin.html` (discoverable, user verification preferred); also offered as the second step. A passkey sign-in
  counts as two-step. The relying party id is the host name of the page: `localhost`, `tauri.localhost` (the desktop
  app on Windows) or the public https name; a passkey works only where it was made. Plain http on a network address,
  an IP address (`127.0.0.1` too) and the `tauri://` scheme (the desktop app on macOS and Linux) can't have passkeys,
  and the app says so in one line. Checked on every ceremony: the challenge (ours, single use, 5 minutes), the origin
  it was issued for, the rpIdHash, user presence, the signature (ES256 or RS256) and the counter. Attestation is
  never required (`none` passes, `packed` is verified when present). A passkey is a sign-in method: the last way in
  can't be removed (`409 last`).
- **At rest**: `.tribe/auth3.json` (0600). TOTP secrets are sealed with AES-256-GCM (the key is `.tribe/secret.key`,
  0600: losing it means setting two-step up again); recovery codes, trust tokens, tickets and challenges are kept only
  as sha256; passkeys are public keys.

| Route (under `/api/accounts`) | Body | Answer |
| --- | --- | --- |
| `GET two-step` | Bearer `tca_…` | `{ on, since, recoveryLeft, trusted, passkeys, required }` |
| `POST two-step/setup`, `two-step/confirm` | Bearer; `{ code }` | `{ secret, uri }`; `{ ok, recovery: [10] }` |
| `POST two-step/disable`, `two-step/recovery`; `DELETE two-step/trusted` | Bearer; `{ code }` | `{ ok }`; `{ recovery }` |
| `POST two-step` | `{ ticket, code \| recovery \| trust, remember? }` | the sign-in (`+ trust`); `401 wrong \| replay \| untrusted`, `410`, `429 locked` |
| `GET passkeys`, `POST passkeys/options`, `POST passkeys`, `PUT/DELETE passkeys/<id>` | Bearer | list, registration options, the new passkey; `409 last` |
| `POST passkey/start`, `passkey/finish` | `{ ticket? }`; `{ credential, ticket?, remember? }` | options; the sign-in |

## Refresh the username database / clean the backend

```
node scripts/dev/clean-accounts.js --dir ~/TribeCode --dry-run   # what it would do
node scripts/dev/clean-accounts.js --dir ~/TribeCode             # do it (stop the server first)
```

One-shot and idempotent. It normalizes names and usernames (trim, collapse spaces, NFC, case-insensitive uniqueness with suffixes), removes expired guest passes (and their agents and device keys) and dead invites, removes orphan sessions, device keys and agents, dedupes members by id, and maps every person to an account. It copies every file it will change to `.tribe/backups/<timestamp>/` (with a `CHANGES.json`) before writing, writes atomically, and never touches chat, docs, tasks or code.

## TODO for launch

1. **Passwords required** on the API for non-guest accounts (the sheet already requires one and checks strength); keep
   scrypt and raise N as hardware allows. ~~Reset flow~~ (done, host-completed: `reset/*`, Settings › Account).
2. ~~Email verification and sending~~ (done, feat/auth2, when the host sets up SMTP): confirm links, sign-in links, reset links.
   Without SMTP nothing is sent and the host's code path stays.
3. ~~OAuth linking~~ (done, feat/auth2): providers make, sign in to and link to accounts (Settings › Account › Sign-in
   methods). Member-level links (`identities` on members) still work for tribes without accounts.
4. ~~Account deletion~~ (done: `DELETE /api/account`) and **export** (a JSON of the account, its sessions and its member records).
5. ~~Remote access~~ (done, feat/auth2): sign-up and sign-in answer remote browsers, admin routes stay local, same-origin
   JSON only, per-client limits and the per-username lockout. With a public https URL set, remote account routes over plain
   http answer `403 { code: 'https', secure }` (feat/harden). Pending email links, sign-up tickets and desktop codes
   survive a restart (`.tribe/pending-*.json`, hashes only, 0600), and `tribe_s` holds only member keys, never `tca_…`.
   Not built: a desktop loopback fallback (it needs Rust in `app/src-tauri`). See docs/REVIEW-2026-11-12.md.
6. ~~Front end~~ (done): with `GET /api/accounts/me` answering 401 (on) instead of 404 (off), the Log in sheet has a
   username + password form (Log in, Create account), Log out ends the account session, and Delete my account uses
   `/api/account`. With the flag off nothing changes: TEST accounts and the local behaviour stay.
7. ~~Session management UI~~ (done): Settings › Account › Signed in on, from `/api/accounts/sessions`, with End.
