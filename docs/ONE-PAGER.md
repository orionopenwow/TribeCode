# TribeCode: your one-page plan to a working product

**Goal:** a product that works start to finish, a real backend, every loop closed, no known bugs, and a preview that feels obvious to a first-time user. Agents do the building. These are the steps that need you.

## This week
1. **Try the new build.** Run `Stable\Update-and-Open-TribeCode.bat`, then try these:
   - Start a project from **+**.
   - Open **Files › + Create › Website**, pick a template, say "make the buttons work" and "dark mode", then **Download HTML**.
   - Assign a task to a friend (they Accept), and try **Council** mode where anyone claims.
   - Open **Help › See how TribeCode works** and watch the two-minute tour.
   - Ask Flint "teach me the website designer".
   - On your phone, open the friend link and do the same.

   Tell me anything that feels off. A screenshot plus one sentence is enough.
2. **Edit small things safely.** Use `Tools\Clean-Slate-Dev.bat`. It runs a separate copy as a guest, everything stays local and it's wiped on each run.
3. **Pick one public host** for the always-on relay. The Render free tier is the easy start (`docs/CLOUD.md`). Say "go" and an agent wires it.

## Before you charge money
4. **Set up a support mailbox.** `support@tribecode.org` is the placeholder. Create it, or tell me the address you'd rather use.
5. **Open a Stripe or Paddle account** and decide prices. `docs/PREMIUM.md` has a starting point. An agent then connects checkout.
6. **Get privacy and terms looked at.** The drafts are `privacy.html` and `terms.html`, and they aren't legal advice.

## Before the app stores
7. **Google Play.** Make the developer account ($25), create the app, and send me the signing fingerprints.
8. **Apple.** Get the developer account ($99/yr) and a Services ID for Sign in with Apple. The iPhone build needs a Mac. `mobile/ios/README.md` has the steps.

## What the agents keep doing
- Every change is tested (150+ test suites). The truth test checks that every screen talks to the backend and that chat stays light.
- Each release refreshes the README, `HANDOFF.md`, `docs/CONTEXT.md`, this page and `docs/LAUNCH.md`.
- Next on their list:
  - turn the accounts backend on for real (email verification, reset, delete);
  - Flint's creator skills (Blender first, `docs/FLINT-CREATORS.md`);
  - the Game Studio MVP (`docs/GAME-STUDIO.md`).

**Rule of thumb:** if a step needs an account, money, a device or a decision, it's yours. Everything else, say "go".
