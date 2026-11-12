# Accounts

TribeCode has always signed people in with a per-tribe member key (an invite link, Discord/GitHub/Google, a device link or, on the host computer, a reclaim). This adds the front end of real accounts on top of that, a scaffold for the server side, and a clean-up script for the data, so launch is a matter of finishing the TODO list below.

## On this device (app/ui/accounts.js)

- **Log out**: in the profile menu (user bar) and in Settings › Account. It clears this device's session: the tribe key, the HttpOnly sign-in cookie (`DELETE /api/session`), device-link and media keys and the tab's place. **Also forget this device's tribes** also drops the saved tribe address and this device's copies of chat, pins, recents, drafts and the unsent outbox. Nothing is deleted from the tribe itself. You land on a signed-out Home with **Log in** and **Continue as guest**.
- **Log in**: a sheet with the accounts saved on this device (one click), the existing providers (`oauth.js`, only where the host turned them on), **Sign in on this computer** (the host reclaim, on the host machine only), **Join with an invite link**, and **Continue as guest**.
- **Account switcher**: the profile menu lists the other accounts on this device, plus **Add account**. Switching keeps each account's key, so switching back needs no new sign-in.
- **Modes** (`localStorage['tribecode.accounts.v1'].mode`): `signedin`, `signedout`, `guest`, `test`. Anything but `signedin` stops the automatic sign-ins (`tribe.js ensureMember`: the boot's auto-claim, the sign-in cookie and the host reclaim). A person's own click (Start your first project, Log in) still signs in. Until someone logs out, picks guest or turns on test accounts, there is no mode and the app behaves exactly as before.

## TEST accounts

Settings › More settings › **Test accounts**, or open the app with `?accounts=test`. Four local guest accounts are mounted: **Orion** (Pixel Quest crew, Bake Sale Club), **Maya** (Pixel Quest crew), **Jay** (Lantern Run) and **Guest** (no tribes). Each is labelled **TEST** in the user bar, the menu, Log in, Settings and on Home. Signing in to one sets the name, color and avatar the whole UI shows; its tribes are listed on Home and in the switcher. They live only in this browser and never reach a server. Turning the switch off removes them (and signs out if one was active).

## Server scaffold (server/accounts.js)

Off by default. `TRIBE_ACCOUNTS=1` turns the routes on; they answer only requests from this computer (like `/api/host/reclaim`) and are signup and login are rate-limited (30 a minute per address, their own bucket).

| Route | Body | Answer |
| --- | --- | --- |
| `POST /api/accounts/signup` | `{ username, displayName?, password?, guest? }` | `{ account, token }` |
| `POST /api/accounts/login` | `{ username, password? }` | `{ account, token }` |
| `POST /api/accounts/logout` | Bearer `tca_…` | `{ ok }` (ends this session) |
| `GET /api/accounts/me` | Bearer `tca_…` | `{ account }` |
| `GET /api/accounts/sessions` | Bearer `tca_…` | `{ sessions }`; `DELETE /api/accounts/sessions/<id>` ends one |
| `POST /api/accounts/signup` + `link: true` | the member's own tribe key as Bearer | claims the account that member was mapped to (if it has no password yet): new username + password, `{ account, token, linked }` |
| `GET /api/account` | the member's tribe key | `{ canDelete, keeps, account? }` (the host: `canDelete: false`) |
| `DELETE /api/account` | `{ confirm: "DELETE" }`, the member's tribe key | removes the member and their agents, device links, project seats, linked accounts and sessions, files named by their id; every `"<member id>"` in the tribe's JSON/JSONL becomes `"deleted-…"` |

**Login signs the member in.** When the account has a password and belongs to a member of this tribe, `login` also
answers `{ member, memberToken }`: a device link for that member, redeemed at once (the same mechanism as phone device
links, so it shows up and can be revoked like one). Passwordless accounts (the auto-mapped ones) never get a member key.

Store: `.tribe/accounts.json` = `{ version: 1, accounts: [{ id, username, usernameKey, displayName, created, status: active | guest | disabled, providers: [], password?, sessions: [{ id, tokenHash, created, lastSeen, expires, device }], members: [memberId] }] }`.

- **Usernames**: NFC, trimmed, inner spaces collapsed, 2 to 32 letters, digits, spaces, `.`, `-`, `_`; unique case-insensitively (`usernameKey`), with ` 2`, ` 3` suffixes when the clean-up maps names that collide.
- **Sessions**: tokens are shown once (`tca_` + 32 random characters); only their sha256 is stored. 30 days (guests: 1 day), at most 20 live per account.
- **Passwords**: optional while local-only; when given they are hashed with scrypt (N=16384, r=8, p=1, 16-byte salt) and checked in constant time. Login answers the same for a wrong name and a wrong password.
- **Members**: every person in `members.json` gets an account mapped by member id (`account.members`). Member keys are never changed, so every link, device and agent key that works today keeps working.

## Refresh the username database / clean the backend

```
node scripts/dev/clean-accounts.js --dir ~/TribeCode --dry-run   # what it would do
node scripts/dev/clean-accounts.js --dir ~/TribeCode             # do it (stop the server first)
```

One-shot and idempotent. It normalizes names and usernames (trim, collapse spaces, NFC, case-insensitive uniqueness with suffixes), removes expired guest passes (and their agents and device keys) and dead invites, removes orphan sessions, device keys and agents, dedupes members by id, and maps every person to an account. It copies every file it will change to `.tribe/backups/<timestamp>/` (with a `CHANGES.json`) before writing, writes atomically, and never touches chat, docs, tasks or code.

## TODO for launch

1. **Passwords required** for non-guest accounts, with a strength check; keep scrypt and raise N as hardware allows. Add a reset flow.
2. **Email verification**: an optional, verified email per account (signup sends a one-time code; unverified accounts stay `guest`).
3. **OAuth linking**: move Discord/GitHub/Google links from members (`server/oauth.js`) to accounts, so one account signs in to every tribe it belongs to.
4. ~~Account deletion~~ (done: `DELETE /api/account`) and **export** (a JSON of the account, its sessions and its member records).
5. **Remote access**: lift the local-only rule behind HTTPS, add CSRF protection for cookie sessions, and per-account rate limits.
6. ~~Front end~~ (done): with `GET /api/accounts/me` answering 401 (on) instead of 404 (off), the Log in sheet has a
   username + password form (Log in, Create account), Log out ends the account session, and Delete my account uses
   `/api/account`. With the flag off nothing changes: TEST accounts and the local behaviour stay.
7. ~~Session management UI~~ (done): Settings › Account › Signed in on, from `/api/accounts/sessions`, with End.
