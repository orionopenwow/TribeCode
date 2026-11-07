# Changelog

## v0.7.1

- **Office (optional, in Your agents)**: [Open Space](https://github.com/Fantomiald/open-space) by Fantomiald, a pixel-art office where several Claude Code sessions work side by side. Install, Start and open, Stop, all from TribeCode. It runs on the host computer on port 4850 with every project repo on its desks, opens in your browser with its pairing link, and installs from a commit we read through without running install scripts (docs/OPEN-SPACE.md)
- **Demo tribe in one command** (`Start-Demo-Tribe.bat` or `npm run demo-tribe`): two original games set up as projects with lanes, a plan, notes, a living doc, a vote, toolbox picks, autopilot and private GitHub repos. **Lantern Run** is a 2D night platformer; **The Crooked Kettle** is a 3D tavern whose patrons are always-labelled bots you can give orders (docs/DEMO-TRIBE.md)
- **A website for every project** (Docs & Files › Website): one plain HTML page in `site/` with the project's colors, logo, about, screenshots, play link, GitHub link, credits and what's new. Preview it at desktop and phone width, keep it updated automatically, and let anyone suggest edits that the lead approves (docs/WEBSITE.md)
- **Live app on your Home Screen or Desktop**: a private link per person and project that opens straight into the live preview, full screen, with the project's icon. Turn it off any time
- **Desktop folders**: export a project to `Desktop\TribeCode Projects` (just the files, or with history), or keep a copy there that updates itself and never touches your own edits
- **Sign in to GitHub** in the app (Settings › GitHub): once signed in, the autopilot and new projects push by themselves. Your GitHub CLI login or a pasted token work too (docs/GITHUB-AND-FOLDERS.md)
- **Starter shelf**: picks for each project's type on its overview (pixelfx, Phaser, KAPLAY, three.js, Tiled…) and 16 game skills from awesome-gamedev-agent-skills. Claude skills are copied into `.claude/skills`, everything else goes in the Toolbox
- A few small matte emoji on internal labels (Helpers, Toolbox, shelf sections, the living update's mood, Local models, Office)
- Fixes: a new member now shows in everyone's project list at once (Shared compute appeared late); the overview's Toolbox no longer errors when the page redraws
- **Phones**: the Home Screen link is on the repo hero, the Website editor stacks above its preview at 390px, and the Office shows its status (it runs on the host)

## v0.7.0

- **Shared compute** (quiet, in a project's Helpers list once it has a repo and more than one person): lend this computer to the tribe for builds, test runs and analysis, and see who else lends. Splitting heavy builds across lenders is the next step (docs/SHARED-COMPUTE.md)
- **Plans**: starting a tribe from a phone and sharing hosting with desktop friends (docs/MOBILE-TRIBES.md: QR pairing, a draft tribe on the phone, links that survive a move, move hosting in one tap, co-hosts with failover)
- **Phone features report** (docs/PHONE-REPORT.md): join, chat (send, react, pin, edit, delete), DMs, docs, tasks, notes, approvals, profile and Home, each checked on the server and after a reload by a new test, plus suggested next edits
- **Phones**: the project overview shows its picture again (tap to change it)

## v0.6.9

- **Fix: "A TribeCode server is already running here with other members"** on your own computer. When the desktop app has lost its sign-in (a reinstall, cleared app data) it now signs you back in as the host. Only the desktop app on that computer can do this; other sites on your computer are refused
- **Delete a project**: Project settings › Delete this project (host only, type the name to confirm). It leaves everyone's list, everyone in it goes back Home, and its chat, docs and tasks move to the tribe's trash folder; the code folder is never touched. The first project stays
- **Phones, Home**: its own bottom rack (Home · Projects · Notes · Activity · **+**) that lines up with the dashboard, slides away as you scroll down and comes back when you scroll up. **+** starts a project, or, before you have a tribe, asks who runs it (your computer, a friend's, or an invite link)
- **The fire logo** goes back to Home in the desktop app too (it was a window-drag area there), and it's a little smaller so it sits inside the top bar
- Home's right panel no longer has Share my hub link / Invite a friend (the hero's Invite a friend does it)
- Fixes found by the new live smoke test: after a delete the project list didn't refresh; a friend invited only to a deleted project got stuck on it
- New test: e2e_smoke_live (create, invite, overview, rename, pin, tasks, chat, phone join, Home rack, delete, host sign-back-in)

## v0.6.8

Phones: Home first, then the project.
- **The fire logo** sits at the top left on phones and opens the projects panel; the search and docs icons are gone from the top right (your profile is there)
- **Home on a phone** has a header with the logo, the two big choices, and **your projects as rows**; there's **no bottom rack on Home**. The rack (Chat · Docs · Updates · Tasks) appears once you open a project
- **Tasks on a phone** are slim horizontal slates grouped by status (title · due · status chip), not swipeable full-screen columns
- **Settings and Invite friends** at the bottom of the sidebar only show inside a project (Settings is always in your profile menu)
- The calendar icon shows again on due dates and Upcoming

## v0.6.7

- **Phones**: the bottom rack is just **Chat · Docs · Updates · Tasks**. Your profile moved to the top right of the top bar; **New task** and **New doc** are back on their own screens (the orange + is gone)

## v0.6.6

Start a project like you'd start a Discord server.
- **The rail +** opens "Create your project": **Create my own**, five **templates** (Game, Website, App, Tool or script, Notes & research), **Bring my code** (a folder or a GitHub repo), and at the bottom **Have an invite already?** with a Join box
- **Customize your project**: a round picture to upload, the name (prefilled from the template), and a one-line bio. Back or Create
- **Invite friends** comes right after: the link is already copied, with QR code, Share and Connect my Claude Code
- A template also seeds the project's notes with a starting idea
- **Phones**: the same three steps fit the screen; Home and the project overview match desktop

## v0.6.5

- **Fix: the desktop app's tribe didn't start** ("Your tribe did not start … SyntaxError … #!/usr/bin/env node"). Windows builds kept the first line of the server file inside the bundled server. The bundle now strips it whatever the line endings, checks that the bundle parses before it can ship, and a new test (bundle_test) builds it from a Windows-style checkout
- **Home is simpler**: one card with two big choices (Getting started: Create your first project · Join a friend's tribe; once you're in: Pick up where you left off · Invite a friend), then Scratchpad and Recent activity. Suggestions live in AI Insights, asking lives in chat (@ai), agents in Agent fleet

## v0.6.4

One source of truth for where you are.
- **The sidebar header card is gone**: the rail (which project) and the breadcrumb (which page) already say it
- **Overview** is the first row of the project's tools, and it's the lit row when you're on the overview. Every page lights exactly one row (the Repo page lights Repo)
- **Pinned links are plain rows** in the tool list (Repo with its branch, Preview app), marked with a small pin, instead of a separate card
- **Hosting status** (uptime, commits today) moved to the bottom of the left rail: it's global, not a project tool

## v0.6.3

Simpler navigation and a living overview for every project.
- **The logo is Home** (your overview of everything); **the rail bubbles are projects**, each opening its own overview. The sidebar's switcher dropdown and the "My Tribe" breadcrumb are gone
- **Right-click a project bubble**: Open overview, Chat, Pin to the top (pinned bubbles come first), Invite to this project, Project settings
- **Each project's overview** now has a one-line **bio** (click to edit), a visible way to **change its picture**, and a **Living update**: one short sentence (written by the local model when it runs) plus Lately, Chat, Way forward and Coming up
- **No vision yet?** The overview suggests writing one in three lines (the host saves VISION.md; others send a suggestion to chat)
- Window buttons also show in app windows without the desktop API (the Working version)

## v0.6.2

A friend with only a phone, from the first tap.
- **"You're in"** on the phone for a friend who joins a fresh project: Ask AI, Voice note, Add an idea and Pick a role, with no setup steps, GitHub or link management in the way
- **@ai, the tribe's AI for anyone**: no Claude Code needed. A question goes to your own Claude if it's on, else a teammate's Claude (the host's first; the owner taps OK, or sets Always or Never in Settings → Friends can ask my Claude), else the host's local model, else onto the board for the next Claude that connects. The answer comes back in the chat
- **Talk to…** on the phone leads with Ask AI and says who would answer right now; "My desktop" only shows if you have a Claude; "Connect Claude Code too" is one quiet line
- The **+** menu offers **Ask AI** when you have no Claude of your own
- A friend joining on a computer sees "No Claude Code? Skip this: type @ai" under the connect command

## v0.6.1

Invite a friend in one tap.
- **Invite a friend** (Home, the rail +, the "you're hosting" banner, or double-click **Invite-A-Friend.bat** on the Desktop): makes a fresh project, turns on the link that works from anywhere, and copies it. Paste it in a text. Share, QR code and Connect my Claude Code are on the same sheet
- **The same link connects everything for your friend**: they tap it, type a name and land in that project. On a computer the app then opens "One line connects your Claude Code" with the command ready to copy; on a phone they get the app (Add to Home Screen)
- If the link is Wi-Fi only, "Make it work from anywhere" turns on Tailscale Funnel or cloudflared right there and copies the new link
- `tribecode://invite` and `?invite=1` start the same thing

## v0.6.0

Home, and an app that checks itself.
- **Home is your command center**: the app opens at Home. Suggestions, Ask (your Claude or the local model), Join or start, a Get started checklist, a scratchpad with "Refine with AI", recent activity across your projects, and a right panel with Share my hub link, Invite friends and AI Insights
- **The rail +** opens one window: Start a new tribe (top) or Paste invite link (bottom)
- **AI Insights**: your own next steps plus what the host notices (Explorer findings, disk and log sizes, no GitHub token, local model down, no backup in 7 days, a newer release) and the Secretary's ideas. Members only see their projects
- **Self-heal**: if the app doesn't start within a few seconds it clears stale caches and reloads once, then shows a calm "Something went wrong" card that can send a report. Pages know their server version and offer "Reload to use it" after an update. Crash reports can be turned off in Settings
- **The Explorer** (npm run explore): a bot that clicks through the whole app on desktop, phone, the desktop app and with no tribe, checks contrast, overflow, dead buttons and console errors, and runs journeys for the core promises: working together without collisions, Connect Claude Code, autopilot to GitHub, chat fidelity and notifications. A quick run is part of npm test
- **Milestone reports** (npm run milestone-report): before/after screenshots against the last release, findings fixed and new, journey scores. First report: docs/milestones/2026-11-07-explorer.md (20 findings fixed, journeys 8/12 → 11/12)
- **Desktop Docs** shows the pinned repo hero again, with a visible Preview app button
- Fixes found by the Explorer: opening Connect Claude Code no longer cuts off a Claude that's already working; chat no longer reloads as plain lines without images or voice notes; phone Settings fits the screen; the phone Updates badge counts the inbox; Approve/Deny on board tasks in Reviews works; switching projects no longer asks for the old project's doc; a refused file claim tells the agent what to do next; brighter text where it was below AA contrast

## v0.5.0

A calmer, faster workspace.
- **Global Hub**: the home screen when no project is open, or before you join a tribe. Quick launch (new project, paste invite link, resume last session, search everything), a live stream across all your projects, an agents & models status bar (your Claudes, local models, background loops), your notes and suggestions. No more dead "Start or join a tribe" box
- **Sidebar in 4 pillars**: Chat & Streams (channels and DMs fold out), Docs & Files, Tasks & Board (tabs: Board, Bugs, Proposals, Milestones, Calendar, Repo, Visuals), Agents Hub (tabs: Agents, Your agents, Ownership, Conflicts, Hand-offs, Reviews, Daily plan, Secretary), with Settings and Invite at the bottom. Deep links like #/tasks/bugs; Ctrl K lists every tab
- **Workspace switcher**: pin favourite projects, collaborative rooms, personal space and scratchpad, project views (Overview, Board, Repo, Timeline)
- **Right panel**: agents and helpers (Secretary, local model, autopilot) are in the room; click an agent for its task, context, hand-offs, conflicts and reviews; a private scratchpad you can move into a project or turn into a task; close it with the X, reopen from the edge
- **Header**: update is a quiet icon with a dot; profile is rightmost; no panel or docs icons
- **Brighter dark theme**: text and icons white, not grey
- Commit gists read "3 files in game/ · +12 −4"
- README and website rewritten with fresh screenshots (npm run readme-shots)

## v0.4.1

Fixes the desktop app showing an old, half-updated layout after updates.
- The phones-only offline cache (service worker) was also installing inside the desktop app, where it served old cached pages: the old sidebar with new chat parts. The app no longer uses it, and removes the old one and its caches on start
- TribeCode.bat clears the app's stale page caches (your settings and sign-in are kept)
- Browsers no longer show "Restart to update": a page already runs the server's current version

## v0.4.0

The big one: everything built since v0.3.3, released together to the desktop app, the GitHub release and the website demo.
- **Chat**: Telegram-style bubbles with Instagram-DM alignment in our palette, grouped messages, replies, reactions and the time inside bubbles, voice-note bubbles, date pills, a chat header (call, screen share, info), one composer pill
- **The + menu**: photo or file, **Propose to the tribe** (a vote that goes to the Board when approved, checklist becomes tasks), quick poll, task, ask my Claude, reminder, note, bug
- **Team votes and reactions**: quick-react bar, double-tap 👍, polls and approvals in chat, Claude can suggest votes (MCP suggest_vote), /vote, decisions log
- **Sidebar**: core (Chat, Docs, Updates, Tasks, Huddle, Capture to notes), Project Hub and Coordinate & Ops groups, Settings and Invite at the bottom; one destination list for the sidebar, breadcrumbs and Ctrl K
- **Top right**: panel, Context, your profile (menu with profile, Claude, agents, invite, notifications, capture, settings, updates), bell, and real red/yellow/green window buttons
- **One-click Create project**: room, invite link, chat, GitHub repo, roles with colors and folders, notes, Start the flow, gists instead of code dumps, a living PLAN.md and assessments
- **People**: click anyone to see what they and their Claude are doing, their commits, prompts, chat and notes, and jump to the moment in chat
- **Preview the app** you're building in the right panel, a browser tab or a friend's phone (signed, sandboxed, live reload, dev-server mode)
- **Workshop**: a community library of skills, recipes, templates and assets, with a community shelf via jsDelivr
- **Solo mode and the Secretary**: an agents hub (Claude Code, Claude Desktop bridge, other MCP agents, local models), and a background secretary that keeps a journal, digest and inspiration board
- **Phones**: the real phone UI (rack, swipe panel, composer with recorder, Talk to, profile sheet, approvals, Docs hub with the repo hero)
- **Quick wins**: share any file in chat, load earlier messages, chat search for agents, one-click backup, rename yourself everywhere, drafts survive a reload, unread count in the tab title, join a second project from an invite, ↑ edits your last message
- **Fixes**: endless reconnect loop, lost binary files, cross-project agent channel access, ghost "online" friends, one bad message crashing the server, and more (docs/DATA.md explains where everything is stored)
- **Desktop**: shows the Working version (newest code, live) in its own window via Try-New-Work.bat or the profile menu; downloaded updates install when you close the app; browser pages fill the window without a fake frame

## v0.3.3

Fixes updates on Windows getting stuck on an old version.
- The bundled server now really exits with the app on Windows (it watched for a parent-process change that Windows never makes, so an old `tribecode-server.exe` kept running, held port 4747, and blocked the installer from replacing it)
- "Restart to update" stops the server before installing
- On launch, if the server on port 4747 is a different version, the app stops it and starts its own; if it's not ours (e.g. a terminal running `npm start`), it says so

## v0.3.2

Security release: please update (Restart to update).
- Only the host's integrator agent can run the repo's check command; a builder could otherwise run code on the host through a crafted change and `run_checks`
- Spectators can't create invites; only the host or the invite's author can revoke one; project-scoped members only see their projects' invites; invite codes are longer
- Forwarding a chat message into a project you're not in is refused
- "Only from this computer" actions (bootstrap, quick invite, local folders, OS user name) refuse requests that arrive through a public tunnel
- Cloning only from https or ssh URLs (no file:// or git://)
- Connect your Claude Code from anywhere: Anywhere (public link) / Same Wi-Fi / This computer, live connected status, one-click Disconnect that revokes the key
- New `app/test/security_test.py`

## v0.3.1

- One-click test project: `TribeCode-Start-Test-Project.bat` creates Pixel Quest (a tiny no-build platformer with lanes, CLAUDE.md and VISION.md), starter tasks, a project-only invite with QR, and the Claude Code command
- Demo: bottom tab bar that moves to the top in chat, motion, profiles and DMs, attach menu, one-tap voice recorder, in-app browser escape (Messenger, Instagram…), section clarity

## v0.3.0

- New shell: project circles on the far left, a calm project sidebar (New, Search, Chat, Docs & files, Updates, Tasks, Huddle, More ⋯, Pinned, Recents), breadcrumbs with a project switcher, a right panel that turns into a preview, Chat as its own view with a docked composer mount
- Zero-step setup: no wizard; name from the OS user, ~/TribeCode, auto color, one Settings page, Join with a link from +
- Coordination: agents panel with pause/stop, ownership map, conflict radar, hand-off queue, review queue, daily plan; MCP my_lane, suggest_task, handoff, request_review
- Agents talk to agents: #agents channel, message_agent, delegate with cross-owner approval, recommend; rate limits and loop protection; agents can never decide approvals
- Bug board: triage columns, repro steps, attachments, give to agent, duplicates, copy as Markdown for Claude

## v0.2.0

- Pocket notifications: inbox, phone push (ntfy, Web Push, desktop), quiet hours, digests, approvals for agents with comments, questions, bulk low-risk approval, always-allow rules, escalation, forward to chat, "While you were away"
- Repo: live status, autopilot, phone-to-desktop change hand-offs, auto-updating TRIBE_CONTEXT.md, master integrator gated by Board approval
- Voice and chat: dictation, huddle captions, capture to notes, meeting notes with action items, DMs, voice notes with transcripts, reply/forward/pin/react/make task, private agent channel, @brain
- Planning: calendar and reminders, task due dates, natural-language quick add, templates, [[links]] and backlinks, comments, history and restore, nested and pinned pages, visual compare, floating quick looks
- Friends: one-click invite (`TribeCode-Invite-Friend.bat`), public https by default (Tailscale Funnel, cloudflared fetched if needed), GitHub Pages friend link with device detection and host-offline page, one-tap notifications in the installed phone app
- Desktop build fix (serde_json); Intel Mac builds paused

## Sprints 2–11

- Project rooms (docs/PROJECTS.md): each project is its own room with its own people, chat, docs, tasks, requests, calendar, bugs, repo, vision and context; sidebar cascade (Overview, Chat, Docs, Tasks, Requests, More ›) with count badges; mobile project switcher; project-only invites; presence per project; MCP `project` argument + `list_projects`; existing tribes migrate into a first project automatically
- Start a project by dropping a repo or folder (desktop path, browser upload, clone when the folder has a remote), pasting a GitHub URL or a host path; "Make it a git repo"; per-project repo autopilot/change requests/integrator; "Give me a branch" worktrees, commits attributed to each member, optional per-member GitHub token kept on the host
- Design system "Tactile Matte Developer UI × Editorial Flat Vector" (docs/DESIGN-SYSTEM.md, app/ui/tokens.css): flat matte surfaces, 1px borders, no glows/blur/gradients, monospace labels; new palette (Obsidian #12151A, Charcoal #1B2028, Ember #F26B1D, Signal Teal #38C6B1, Huddle Indigo #6C7CFF); logo and every icon size recolored
- Live co-editing in Docs: server-authoritative OT (`server/ot.js`, `server/live.js`, `app/ui/coedit.js`), live carets with names, "Editing now" roster, API/agent writes merged live, offline edits replayed on reconnect
- Marketing website in `site/` (static, 716 KB): hero with live demo, four pillars, product rows, Claude Code, phones, pricing, FAQ
- Logo tucked into the window corner and enlarged
- Shared server event bus (`server/bus.js`) for notifications

- Phones: responsive layout under 820 px (bottom tab bar, drawer sidebar, chat tab, swipeable board, tap-to-move tasks, bottom-sheet dialogs, safe areas); installable web app (manifest, Home Screen icons, offline shell); iPhone "Add to Home Screen" hint
- Invite window shows a QR code (built-in encoder, verified against a real decoder) and uses the PC's Wi-Fi or Tailscale address instead of localhost
- Brand: exact squared "TribeCode" wordmark drawn as vectors, Inter fonts bundled, marketing tagline and the four pillars, inspiration sheets in `design/inspiration/`
- Tests: phone end-to-end test (scans the QR from a screenshot, joins on an iPhone-sized screen, chats, moves a task)

- New logo: orange flame between white brackets on navy; app accent color is now the flame orange
- Voice huddles: peer-to-peer WebRTC audio (signaling over the tribe socket), mute, speaking rings, screen share with perfect negotiation, 🎙️ badges in the room, Ctrl+Shift+M
- `TribeCode-Live-Test.bat` / `tribecode-live-test.command` / `npm run live`: checks Node + Git, gets the code, starts a tribe, opens the browser, pulls new commits every 20 s and reloads open tabs
- One-command release setup: `node scripts/setup-release.js`; CI builds installers even before the signing key exists
- Fix: joining a huddle immediately left it again

- Claude Code relay: MCP endpoint at `/mcp` (Streamable HTTP, JSON responses) with 14 tribe tools; "Connect your Claude Code" makes a per-member agent key and the one-line `claude mcp add` command
- Agents are members with role `agent`: they show in the room while active ("using claim file"), can't vote or invite, and their proposals start with zero votes
- Soft file claims (folder-aware, 4 h expiry) for people and agents; shown in the room panel; handed off to a teammate from the update panel
- Follow mode: click a teammate in the room to jump to what they're viewing
- Fixes: background doc loading overwrote your presence; chat didn't stay pinned to the newest message

- Desktop hosting: server bundled into one file (`scripts/bundle-server.js`) and built as a standalone Node SEA sidecar per platform (`scripts/build-sidecar.js`, run in CI); "Host a tribe on this computer" starts it, makes you host and resumes on next launch; server exits with the app
- `tribecode://join?server=…&code=…` deep links, single-instance app (second launch focuses the window and forwards the link), "Open it there" on the join page
- In-app join from any pasted invite link, with a tribe-switch warning
- Server: `--ui` and `--exit-with-parent` flags, clear message when the port is busy
- CI: separate Apple Silicon and Intel macOS builds (each with its own sidecar)

- Drift radar (`--repo`): every branch vs main with behind/ahead, files changed, linked task, and a watch/drifting level; periodic `git fetch`
- Bug inbox: Ctrl+Shift+B capture with recent logs + view + version; automatic crash reports (rate-limited); triage by local brain or rules; duplicates merge with a seen-count; bug → task, and the bug resolves itself when the task is done (reopens if the task does)
- Ctrl+K command palette over actions, views, docs, tasks and people with fuzzy search
- Brain rail button opens the standup card

- Docs: Markdown pages in `docs/`, Notion-style `/` menu (headings, to-dos, lists, quote, code, divider, table, date, summarize), list continuation, Ctrl+B/I/S, Write/Read modes with clickable checklists
- Docs autosave with versioning; live updates for idle readers; conflict banner (use theirs / copy mine / keep mine); drop files to import; works offline on one device
- Local brain via Ollama (`--ollama`, `--model`, prefers Qwen): doc TL;DRs saved as `*.summary.md`, daily standup written to `brain/` and posted to chat, vision check on every new proposal
- Home drop zone imports files into Docs; title bar shows the host's brain model

- Tribe server (`npm start`): zero-dependency Node, serves the UI, hand-rolled WebSocket for presence + chat
- Invite links with expiry, max uses and builder/spectator roles; join page that carries name + color into setup
- Host bootstrap from the host machine only; per-member tokens stored hashed; per-IP rate limits on public endpoints
- Chat with `/task` (creates a task) and `/decide` (writes to `decisions/`)
- Tasks board: drag between columns and reorder, quick add, double-click rename, assign, delete; live sync; works offline on one device
- Everything stored in the tribe folder as Markdown (tasks, decisions) and JSONL (chat)
- Room panel shows who's online and which view they're in; update hand-off uses real online teammates
- Fixes: invite modal crash after the room list rendered; help button no longer covers the chat box
- Approval board: proposals with Markdown template, majority voting (author's vote counts), auto-park when it can't pass, withdraw
- Approval creates the next milestone (v0.x.0), turns `- [ ]` items into tasks, writes a decision record, announces in chat
- VISION.md editable by the host from the board; milestones released by the host get an annotated git tag in `--repo` and are pushed to origin
- Sidebar shortcuts open Tasks and the Board; title bar shows the tribe's real name
- Fixes: friends were told "You're the host" after joining; proposal bodies showed raw Markdown
- Tests: `npm test` runs the UI smoke test and a two-person end-to-end test against the real server

## v0.1.0: Desktop shell (2026-11-06)

- First-run setup for personal preferences (name, color, theme, density, folder, local brain, startup), with no account needed
- 60-second spotlight tour, replayable from the ? button; Getting started checklist on Home
- Auto-update: background download, "Restart to update" pill, save + hand off agents/claims + tell the room, snooze options, welcome-back toast
- Local brain detection via Ollama (prefers Qwen models)
- Tauri v2 wrapper (dialog, updater, process, notification, autostart) and icons for Windows, macOS, Linux
- GitHub Actions release workflow publishing installers + latest.json on version tags
- milestone.sh now bumps the app version; UI smoke test in app/test/ui_smoke.py
- Fix: ?reset=1 no longer wipes settings on every reload

## v0.0.1: Design phase (2026-11-06)

- Feature spec: core requirements, 25 new features, market niche, open-source building blocks, architecture, roadmap
- Brand kit: "Campfire Brackets" app icon, wordmark (light and dark), Windows `.ico`, color tokens
- UI mockups for docs, tasks, approval board and invite screens in dark and light mode
- README, MIT license and the `scripts/milestone.sh` release script
