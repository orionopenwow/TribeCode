# Feature assessment: sharing, shipping and working together

Short version: TribeCode already had most of the parts (a live code repository view, branches with conflict hints, an
integrator agent with human approval, reviews, hand-offs, one-tap approvals on phones). What was missing was one clear
"here is what changed, should it go out?" moment, a simple way to share progress, and a calm automatic mode. This batch
(`feat/ship-flow`) adds them.

## What existed

- **Code repository view** (`server/repo.js`, `app/ui/repo.js`): branch, ahead/behind, changed files, recent saved changes, CI
  status, Autopilot (pull main, commit the tribe context), change requests from phones, an activity log.
- **Merging** (`server/integrator.js`): the host's Claude collects branches, dry-runs merges, runs checks, proposes an
  order; people vote on the Board; then it merges into main and pushes. Safe, but only for branches, and only through an agent.
- **GitHub** (`server/github-auth.js`, `server/flow.js`): sign in inside the app; new projects can get a private repository.
- **Agents together** (`server/coord.js`, `server/agentnet.js`): lanes, claims, hand-offs, reviews, delegation, the #agents
  channel, the Agents Hub dashboard with "Needs you".
- **Approvals** (`server/approvals.js`): one-tap Approve / Deny on phones (web push, ntfy), comments, questions.
- **Tasks**: suggested first tasks from the vision (`server/assist.js`), the Task Board.

## What was missing or confusing

1. **No "what changed since the last push" view.** Saved changes on main could sit unpushed, and nobody saw them as one thing
   to approve. The only push paths were Autopilot (context only), the integrator (branches only) and "Push my branch".
2. **No group decision for pushing.** Some tribes want the host to decide; others want everyone to agree.
3. **No calm automatic mode.** Pushing was either manual or a context-only autopilot.
4. **Sharing progress meant screenshots.** There was no "copy where we are" for a chat or a text.
5. **"Who's waiting on whom" was scattered** across hand-offs, reviews and tasks.
6. **Agents couldn't ask "is it OK to ship?"** They could request reviews and integrations, but not see push status.
7. **Big tasks stayed big.** There was no quick way to break one up.

## Ranked plan (built in this batch unless noted)

1. **Ship it** (built): the Ready to ship card at the top of the code repository view.
   - It shows saved changes since the last push, files, line counts, who made them (🧑 people / 🤖 AI helpers), linked
     tasks, branches still waiting to merge, and anything that blocks a push (GitHub is ahead, no GitHub yet).
   - Then 🚀 Ship it (host) or 🙋 Ask to ship.
   - It pushes exactly the reviewed saved change, never forced.
2. **Vote to push** (built): who decides is set to Host (default), Majority or Everyone.
   - People vote with a comment; agents can ask but never vote.
   - Each voter gets a one-tap approval on their phone, and deciding there counts as their vote.
3. **Turbo** (built): off by default. It ships approved work on main by itself at a calm moment:
   - no unsaved edits;
   - a quiet window (default 10 min);
   - no claims touched since the last save;
   - never during a vote;
   - only when the checks pass;
   - at most N pushes an hour (default 4).
   It shows a "⚡ Turbo is on" pill, what it's waiting for, and a log of what it shipped.
4. **Share progress** (built): 📤 copies the project's done / in progress / to-do counts, the latest saved changes, what's
   next, the GitHub link and an invite link. It's on the Ready to ship card, the dashboard's At a glance and Your focus.
5. **Pulse** (built): one line per helper, like "🤖 X is working on…", "⏳ X is waiting on Y…" or "👀 waiting for a review",
   plus "🚀 waiting to ship". It shows in the Agents Hub hero, and a pending ship vote shows under Needs you.
6. **MCP** (built): `ship_status` (is it OK to ship, what blocks it, votes) and `request_ship`.
7. **Split a task** (built): ✂️ on Task Board cards. The local model splits the task when it's on; otherwise simple rules
   split "jump, coins and a score" into three tasks.
8. **Next** (not built):
   - Ship branches straight from the card: approve an integration in the same vote, instead of on the Board.
   - A weekly "what we shipped" note posted to chat and saved to Files.
   - Per-file Turbo rules (for example, never auto-ship `server/`).
   - Pull automatically before shipping when GitHub is ahead and the merge is clean.
   - A share card image for social posts.

## Safety notes

- Pushes are fast-forward only (`git push origin <sha>:<branch>`). A rejected push is reported, never forced.
- Only the saved change that was reviewed ships, even if newer ones landed during the vote.
- Agents never vote and never approve; spectators only watch.
- Turbo respects claims and votes, rate-limits itself, and waits for the checks.

## Where it lives

- `server/ship.js`, with routes under `/api/ship…` and `/api/tasks/:id/split`.
- `app/ui/ship.js` and `app/ui/ship.css`.
- Hooks in `focus.js`, `projects.js`, `agentsdash.js` and `tasks.js`.
- Demo routes in `offline.js`.
- Test: `app/test/e2e_ship_flow.py`.
