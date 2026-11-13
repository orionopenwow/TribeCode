# Launch guide

What has to be true before TribeCode is called launched, what is done, and what is left. Owners: **you** (needs a person, an account or money), **agents** (can be built and tested here). Kept current at every milestone, alongside `HANDOFF.md` and `docs/CONTEXT.md`.

Last updated: 2026-11-13 (the app audit, `docs/APP-AUDIT-2026-11-13.md`: every route walked in four roles at two sizes; what it changes here is marked *audit*). Before that: 2026-11-12 (v0.31.0: Design flow and starters, website designer v2, presence and People, Company v2 and gigs, Marketplace v2, the desktop demo; the v0.29 review items still open are listed under Backend).

## 1. The product works end to end (no dead ends, no bugs)

| Loop | State | Proof |
| --- | --- | --- |
| Open the app fresh → empty Home → start a project instantly (on this device) | done | `e2e_fresh_open`, `e2e_setup_local` |
| Choose where it lives (this computer · GitHub · free cloud · phone), any time later | done | `e2e_setup_local` |
| Invite a friend → they join on phone or desktop | done | `e2e_friend_flow`, `e2e_friend` |
| Chat, files (notes, docs, sheets, whiteboard, design, uploads), tasks, approvals | done | many suites; `e2e_files_local` with no tribe |
| Connect your AI agent (Claude Code, Codex, Gemini CLI, Cursor, Qwen) and see it work | done | `e2e_fleet`, `e2e_any_llm` |
| Preview: app and website, edit the website by sentence, save versions, phone | done | `e2e_preview_polish` |
| Work: post → match → assign → track → review → credit | done | `e2e_work_complete` |
| Company: templates (guided / advanced / ✦), standups and rituals | done | `e2e_templates_guided` |
| Flint can do every step by himself and export proof-of-work ZIPs | done | `e2e_flint_runthrough` |
| Every screen reaches the backend without errors; chat stays light | done | `e2e_truth` → `docs/TRUTH-TEST.md` |
| Log in / log out / switch accounts | front end done; real backend behind `TRIBE_ACCOUNTS=1` | `e2e_accounts` |
| Every route, Settings tab and sheet opens and survives a click on every button, as host, member, spectator and with no tribe, at 1280 and 390 | done *audit* | `app/test/audit_walk.py` (a report), `e2e_audit_fixes` |
| Esc closes every sheet; one place for notification settings | done *audit* | `e2e_audit_fixes` |
| A project on this device: nothing crashes | done *audit*; the Guide, website templates and Versions are not available there yet (audit › Holes 6) | `e2e_audit_fixes` |
| Drag-and-drop: files, folders, "Make it the project's folder" (desktop app) | done; the native folder drop is only tested with a stand-in *audit* | `e2e_dropzone` |
| Invite a person: one clear way | **open** *audit*: eight ways today (audit › Holes 3, build plan wave 1) | |
| One Claude per person | **open** *audit*: Connect your AI and Invite your Claude each make one (wave 1) | |

Gate: `npm test` green on `dev`, `e2e_truth` green, and a manual click-through on Windows + an iPhone. *audit*: `e2e_truth` and `e2e_work_v2` were failing on `integ6` and pass again (a sheet that ignored Esc; a late answer that pulled people back to Home). The full `npm test` has not been run on the merged branch yet. Add to the click-through: Sign out other devices with two browsers open, a folder dropped on the desktop app, and opening Work straight after a slow start.

## 2. The backend is real and safe

- **Accounts** (`server/accounts.js`, `docs/ACCOUNTS.md`): turn on `TRIBE_ACCOUNTS=1` for launch. Before that: email verification, password reset, OAuth linking, and a data export. Delete is built (`GET/DELETE /api/account`, flag-gated); `GET /api/account` does not export anything yet. Accounts with no password log in with the username alone (local-only today): require a password or a provider before turning the flag on (docs/REVIEW-2026-11-11.md). *agents*
- **Clean data**: run `node scripts/dev/clean-accounts.js --dry-run`, then for real, on every tribe you keep. It backs up first. *you, one command*
- **Hosting**: local-first. The tribe lives on a member's computer or a free cloud, GitHub is the shared truth (`docs/LIGHT-HOSTING.md`). For a public relay, pick a host (Render free tier is documented in `docs/CLOUD.md`). *you*
- **Security**: `SECURITY.md` and the six security suites pass (*audit*: re-run 2026-11-13, all six). *audit* fixed: Sign out other devices now ends every other live connection (another browser on the same key used to stay connected); Flint's help answers no longer index internal documents. Passkeys are on. Two-step sign-in (TOTP, recovery codes, required for admins) is built but **off by default**: turn it on with `TRIBE_TWO_STEP=1` when you want it (`e2e_auth3`, `security7_test`; docs/ACCOUNTS.md › feat/auth3). Still open before charging: OAuth for the claude.ai connector (the key is in the URL today), the desktop loopback fallback. Do a fresh outside review before charging money. *you, optionally a paid reviewer*
- **AI**: works with no AI. Cloud AI asks for consent once per provider. Keys stay on the host. *done* (`app/ui/aiconsent.js`)

## 3. Money (Premium)

- The model is in `docs/PREMIUM.md`: everything local, open source and your-own-AI is free forever. Premium is the hosted relay and cloud, AI credits, bigger teams, premium templates and priority builds.
- Gates are soft (`TribePremium.gate`), with "Not now" always available.
- **Payments are wired but hidden** (Stripe; `e2e_payments`, `security7_test`). Until you open them (`TRIBE_PAYMENTS=1`, or `PUT /api/premium/admin { "enabled": true }` on the host computer) the plans pop-out is information only ("Paid plans are coming"), there is no checkout, billing or receipts anywhere, and the webhook answers 404. Opened: the buttons open Checkout, a signed webhook changes plans and credits, Manage billing opens Stripe's portal, Settings › Plan & AI shows receipts. Plans are per account where a person has one, per tribe otherwise; credits are priced by the size of the answer (docs/PREMIUM.md › What a credit buys).
- **To go live** *you*: in Stripe, make the two recurring prices (Premium Hosted $6, Premium Tribe $24 a month) and the three one-time prices (1,000 credits $10, 2,500 $25, 5,000 $50); add the webhook `https://<your public address>/api/premium/webhook` with the eight events listed in docs/PREMIUM.md › Payments; turn on the customer portal; then give the server `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the five `STRIPE_PRICE_…` ids, and set `TRIBE_PAYMENTS=1` last, when you are ready to receive. Try it with test keys first.
- Not built: tax (Stripe Tax), invoices by email beyond Stripe's own, the weekly credit refill that the Tribe plan's copy promises, and seat-based plans.

## 4. Stores (iPhone and Android)

The full plan is in `docs/APP-STORE.md`. Short version:

- **Android**: a Trusted Web Activity first (`mobile/android/`), then Tauri. You need a Google Play developer account ($25 once), then put the signing fingerprints into `app/ui/.well-known/assetlinks.json`. *you*
- **iPhone**: Tauri v2 iOS build on a Mac. You need an Apple Developer account ($99/yr), a Services ID for Sign in with Apple, and TestFlight. *you + a Mac*
- **Store requirements**:
  - Report and block (done).
  - Account deletion in the app (done, behind `TRIBE_ACCOUNTS=1`) and on the web (done: `delete-account.html` explains how and gives the support address).
  - Privacy and terms (drafts; get them reviewed).
  - AI consent (done: asks once per device and provider).
  - A support contact. The placeholder is `support@tribecode.org`; set up the mailbox. *you*

## 5. Website and launch moment

- tribecode.org deploys with every main release. The demo and the "Watch Flint build" run-through are the best things to show.
- **Launch kit**: record the run-through, take store screenshots with `scripts/dev/shots.py`, and use the ad playbook in `docs/AD-PLAYBOOK.md`. *you + agents*

## 6. How a change ships (unchanged)

1. Feature branches → `dev`.
2. Test on your PC with `Start-Working.bat`.
3. Merge to `main` with a version bump in the four version files.
4. The release, the installers, auto-update and the website all go out together.

For quick local edits before a release: `Tools\Clean-Slate-Dev.bat` (a guest, all local, wiped each run).
