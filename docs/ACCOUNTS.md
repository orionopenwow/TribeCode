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

Off by default. `TRIBE_ACCOUNTS=1` turns the routes on; they answer only requests from this computer (like `/api/host/reclaim`) and are signup and login are rate-limited (30 a minute per address, their own bucket).

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

## Refresh the username database / clean the backend

```
node scripts/dev/clean-accounts.js --dir ~/TribeCode --dry-run   # what it would do
node scripts/dev/clean-accounts.js --dir ~/TribeCode             # do it (stop the server first)
```

One-shot and idempotent. It normalizes names and usernames (trim, collapse spaces, NFC, case-insensitive uniqueness with suffixes), removes expired guest passes (and their agents and device keys) and dead invites, removes orphan sessions, device keys and agents, dedupes members by id, and maps every person to an account. It copies every file it will change to `.tribe/backups/<timestamp>/` (with a `CHANGES.json`) before writing, writes atomically, and never touches chat, docs, tasks or code.

## TODO for launch

1. **Passwords required** on the API for non-guest accounts (the sheet already requires one and checks strength); keep
   scrypt and raise N as hardware allows. ~~Reset flow~~ (done, host-completed: `reset/*`, Settings › Account).
2. **Email verification** and sending (the welcome mail and the reset mail; TODO(email) in server/accounts.js): an optional, verified email per account (signup sends a one-time code; unverified accounts stay `guest`).
3. **OAuth linking**: move Discord/GitHub/Google links from members (`server/oauth.js`) to accounts, so one account signs in to every tribe it belongs to.
4. ~~Account deletion~~ (done: `DELETE /api/account`) and **export** (a JSON of the account, its sessions and its member records).
5. **Remote access**: lift the local-only rule behind HTTPS, add CSRF protection for cookie sessions, and per-account rate limits.
6. ~~Front end~~ (done): with `GET /api/accounts/me` answering 401 (on) instead of 404 (off), the Log in sheet has a
   username + password form (Log in, Create account), Log out ends the account session, and Delete my account uses
   `/api/account`. With the flag off nothing changes: TEST accounts and the local behaviour stay.
7. ~~Session management UI~~ (done): Settings › Account › Signed in on, from `/api/accounts/sessions`, with End.
