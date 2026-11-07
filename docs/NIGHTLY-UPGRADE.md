# Nightly self-upgrade (scheduled task)

Create it as a scheduled task in Claude (claude.ai → Code → Scheduled tasks, or ask Claude in a session that allows it):
- **Name:** TribeCode nightly self-upgrade
- **When:** every day at 2:58 am (America/Phoenix)
- **Notifications:** push
- **Prompt:** everything below the line.

---

Nightly self-upgrade run for TribeCode (the owner, Campton, asked for this on 2026-11-07). TribeCode is a self-hosted "multiplayer vibecoding" app: friends, each with their own Claude Code agents, build one app together; one friend's computer hosts; zero-npm-dependency Node server + plain browser JS + a Tauri desktop wrapper. Repo: github.com/orionopenwow/TribeCode.

THE OWNER'S INTENT (optimize for this): "test the main features and upgrade them by understanding the user intent of collaborating easily with other people using LLMs and not disrupt code by working on the same thing, and the automatic Claude Code generator and autopilot GitHub upload, with high-fidelity chat and notification systems, to create a successful app; compare and screenshot your milestone results too."

SETUP
1. Attach the repo with push access (add_repo: owner "orionopenwow", repo "TribeCode", access "push"), clone it, then `git fetch origin dev main && git checkout -B dev origin/dev`.
2. Read HANDOFF.md, docs/CONTEXT.md, docs/FEATURES-NEXT.md, docs/EXPLORER.md, the latest docs/EXPLORE-REPORT.md and docs/milestones/.
3. Tests: Python Playwright with /usr/bin/google-chrome and --no-proxy-server (HANDOFF "How to write tests"); `export TRIBE_NO_DOWNLOAD=1`.

THE RUN
A. Baseline: `npm test`; `npm run explore` (crawls every view/button on desktop, phone and a simulated desktop app; runs the core-intent journeys).
B. Core-intent journeys (score pass/fail, clicks, time, friction):
   - Two humans + two Claude agents on one project: claims/lanes prevent overlapping work, conflict radar flags two branches touching one file, hand-offs work end to end.
   - "Connect your Claude Code" produces a working command; the agent joins, posts a gist, reads chat, appears in the room.
   - Repo autopilot: commits auto-pushed to a mock GitHub (local bare repo) with the right identity; gists and plan update.
   - Chat fidelity: text, reply, reaction, image, voice, file, vote/proposal live for everyone, in order, persisting across a server restart.
   - Notifications: @mention, approval request, vote waiting reach the inbox/bell with right counts; quiet hours; phone parity.
C. Self-heal: fix every failing test and every critical/high finding with a regression test. Never weaken a test.
D. Upgrade: 1–3 improvements that most advance the owner's intent, fully implemented with tests, following docs/DESIGN-SYSTEM.md (flat matte, no glows/gradients, bright white text, few sidebar rows).
E. Milestone evidence: `npm run milestone-report` (before = latest release on main, after = dev) → docs/milestones/<date>.md with before | after screenshots, findings delta, test counts, journey scores. Then `npm run readme-shots` and refresh README.md / site/ if screens changed.

SHIP (the owner's rules)
- Small commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Push only `dev` and `main`: no feature branches on GitHub, no PRs, no force-push, no deleting branches or tags.
- Release only if the full `npm test` passes in one run, no critical/high findings remain, and there are user-facing changes: bump the patch version in package.json, app/package.json, app/src-tauri/tauri.conf.json, app/src-tauri/Cargo.toml, add a CHANGELOG entry, merge dev → main (--no-ff), push, watch the Release workflow (re-run failed jobs once if a platform fails only at upload).
- Don't change Rust unless essential. Don't try to reach the owner's PC.
- Update docs/CONTEXT.md and mirror it to the Project doc claude/TribeCode-Context.md.

REPORT: 5–8 lines: tests before→after, journeys and biggest friction, fixes, upgrades, released version (or why not), path of tonight's milestone report.
