# Launch guide

What has to be true before TribeCode is called launched, what is done, and what is left. Owners: **you** (needs a person, an account or money), **agents** (can be built and tested here). Kept current at every milestone, alongside `HANDOFF.md` and `docs/CONTEXT.md`.

Last updated: 2026-11-11 (after the v0.29 integration: router, accounts, local setup, Flint everywhere, preview editing, Work loop, templates, premium, run-through).

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

Gate: `npm test` green on `dev`, `e2e_truth` green, and a manual click-through on Windows + an iPhone.

## 2. The backend is real and safe

- **Accounts** (`server/accounts.js`, `docs/ACCOUNTS.md`): turn on `TRIBE_ACCOUNTS=1` for launch. Before that: email verification, password reset, OAuth linking, export and delete (`GET/DELETE /api/account`). *agents*
- **Clean data**: run `node scripts/dev/clean-accounts.js --dry-run`, then for real, on every tribe you keep. It backs up first. *you, one command*
- **Hosting**: local-first. The tribe lives on a member's computer or a free cloud, GitHub is the shared truth (`docs/LIGHT-HOSTING.md`). For a public relay, pick a host (Render free tier is documented in `docs/CLOUD.md`). *you*
- **Security**: `SECURITY.md` and the three security suites pass. Do a fresh outside review before charging money. *you, optionally a paid reviewer*
- **AI**: works with no AI. Cloud AI asks for consent once per provider. Keys stay on the host. *done or in the polish wave*

## 3. Money (Premium)

- The model is in `docs/PREMIUM.md`: everything local, open source and your-own-AI is free forever. Premium is the hosted relay and cloud, AI credits, bigger teams, premium templates and priority builds.
- Gates are soft (`TribePremium.gate`), with "Not now" always available.
- To charge: create a Stripe or Paddle account, then an agent fills in `checkout()` (`TODO(payments)`) and a webhook. *you: the account and prices; agents: the wiring*

## 4. Stores (iPhone and Android)

The full plan is in `docs/APP-STORE.md`. Short version:

- **Android**: a Trusted Web Activity first (`mobile/android/`), then Tauri. You need a Google Play developer account ($25 once), then put the signing fingerprints into `app/ui/.well-known/assetlinks.json`. *you*
- **iPhone**: Tauri v2 iOS build on a Mac. You need an Apple Developer account ($99/yr), a Services ID for Sign in with Apple, and TestFlight. *you + a Mac*
- **Store requirements**:
  - Report and block (done).
  - Account deletion in the app (done) and on the web (in the polish wave).
  - Privacy and terms (drafts; get them reviewed).
  - AI consent (polish wave).
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
