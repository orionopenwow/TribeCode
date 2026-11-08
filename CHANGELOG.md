# Changelog

## v0.9.8

- **New logo lettering everywhere**: "TribeCode" is now set in Inter Bold, tightly spaced, "Tribe" in the theme's text color and "Code" in Ember. It's in the app, the invite and sign-in pages, the website, the README and every brand file. The letters are traced from the font once (scripts/wordmark-glyphs.py), so no font is needed to show them
- **Phones**: Home's top bar uses the new lettering

## v0.9.7

- **Resize the panes**: drag the line between the sidebar and the page, or between the page and the right panel (or the app preview), to make either wider or narrower. Sizes are remembered on this computer. Double-click a line to reset it, or focus it and use ← →. The bottom-left user bar follows the sidebar
- **Phones**: unchanged (the side panes are drawers there)

## v0.9.6

- **Docs edit like Google Docs**: you see real headings, bold, italic, underline, colors, highlights, bullet and numbered lists, clickable checkboxes, quotes, code blocks, tables and dividers while you type, instead of Markdown symbols. Typing shortcuts format as you go (`# ` heading, `- ` bullet, `1. ` numbered, `[] ` checklist, `> ` quote, ``` code, `---` divider, `**bold**`). Enter continues a list, and Enter on an empty item ends it. Live co-editing, comments, history, dictation and Claude's tools all keep working, because docs are still saved as Markdown underneath. Paste brings formatting in safely. Undo never removes a teammate's text. **View Markdown** in the ⋯ / ⋮ menu shows the raw text
- **Phones**: the same rich editing. Tapping a checkbox ticks it without opening the keyboard, and the cursor stays above the format bar

## v0.9.5

- **A cleaner project Overview**, laid out like your mockup:
  - **Living update**: a status pill and four tiles (Lately · Chat · Way forward · Coming up)
  - **Onboarding Checklist**: a green progress bar and five steps that tick themselves (write the vision, the first task, a friend joins, connect your Claude Code, pin the repo). Each step has its button, and the checklist folds or shrinks to "All set" when done. It replaces the "No vision yet" banner and the "Start here" card
  - **Tribe & Agents**: Who is here and your agents
  - **Project Stream**: recent changes and upcoming items
  - **Repo & Tools**: the shared repo, plus today's standup and a drop zone for files
  - **Toolbox picks**: smaller, at the bottom
- **Phones**: the same sections in one column with tight spacing

## v0.9.4

- **Meet Flint**: TribeCode's built-in helper now has a name and its own "Ask Flint…" bar at the bottom of the room panel. Even with no local model it can connect your Claude Code, answer how-to questions from the Guide, capture a note ("note: …"), add a task ("task …"), invite a friend, start or stop hosting, open any section, find docs and tasks, tell you what's happening, and switch the Secretary and repo autopilot. With a local model on, it also answers anything else, streaming its reply. It runs on this computer and nothing you type leaves it. The thread is remembered and folds away; the Helpers row and the ? menu both open it
- **Phones**: Flint is the first row in Talk to…, with a full-screen thread and the same composer

## v0.9.3

- **Hosting lives top left**: the "Hi, you're hosting" banner is gone. While this computer hosts the tribe, a small green **Hosting** pill sits at the top left; when you're not hosting there's nothing. Click it for who can reach you (Wi-Fi, Tailscale or anyone), who's online, the address with a copy button, the Host switch (desktop app), Invite a friend, Share beyond my Wi-Fi and Host settings
- **Phones**: unchanged (Home's identity card already says you're hosting)

## v0.9.2

- **Chat fills from the bottom**: messages stack up from just above the chat bar, like Discord, and the newest is always in view. The "you're hosting" banner no longer pushes the chat under the bar
- **A cleaner chat header**: the channel is a plain bold "# general" with a quiet chevron to switch conversations (no box), the member line under it, and quieter call, screen and info buttons in a single 64px row
- **Phones**: unchanged (the phone chat already filled from the bottom)

## v0.9.1

- **Campfire is the default look**: warm greys with white text. The other 8 themes are still in Settings › Theme. If you never picked a theme you get Campfire; if you picked one, it stays
- **Thicker icons on desktop**: the sidebar, user bar and title bar icons use the same heavier weight as the phone rack, slightly bigger, and the selected row's icon is bolder
- **Help, top right**: a filled ? right of the window buttons opens the Guide (Start here, Connect Claude Code, Phones and friends, Troubleshooting), Keyboard shortcuts (also Ctrl /), Report a bug, Check for updates, What's new, the docs and TribeCode on GitHub, and the version you're on
- **New download site**: modeled on cursor.com, in the Campfire palette. A left-aligned headline, Download for your OS and Try the live demo, then a live TribeCode window that plays on a loop (a friend asks, an agent streams its work, the game builds in the preview, a plan ticks off) over a flat campfire night scene with our characters. Four feature sections with small live mocks, real GitHub stats, and a final download block
- **Phones**: the site keeps the live window's proportions at 390px and collapses the nav to Download and a menu. In the app, phones get Campfire by default too

## v0.9.0

- **A real document editor**: on desktop, Google Docs meets Notion. A top bar with the title, where it lives, save status and who's editing. A sticky toolbar: undo/redo, text styles (Title, Subtitle, Heading 1–3, Quote, Code), bold, italic, underline, strike, code, text color, highlight, link, align, bullet/numbered/check lists, divider, table, clear formatting. Keyboard shortcuts like Google Docs. A left panel with your docs and a live outline of the headings, and a centered page about 720px wide. Ask AI and Share (a link that opens the doc) are in the top bar
- **Breadcrumb**: no more "Files › Files"
- **Phones**: the editor matches Google Docs mobile, to the pixel at 390px. Header: the white ✓ pill, undo, redo, +, comment, Ask AI and ⋮. A format bar that rides on the keyboard: B, I, U, text color, highlighter, align ▾ and list, with A≡ pinned right. A≡ opens Text and Paragraph tabs (styles, colors, indent, line spacing, lists). + inserts a link, table, line, checklist, code block or table of contents. Ask AI can summarize, help write, tidy up, or answer your own question. ⋮ has find and replace, share and export, outline, details, rename and delete. Icons are solid and full size, and it works in every theme

## v0.8.9

- **The logo follows your theme**: "Tribe" is drawn in the theme's text color and "Code" in its accent, everywhere the logo shows (the app, invite and join pages), so it never gets lost white on white
- **Campfire**: pure white text, with neutral greys for secondary text (it was cream). The warm backgrounds stay
- **Phones**: the theme test now also checks that the logo is in each theme's text color, on all 9 themes

## v0.8.8

- **Docs is now Files, and it takes any kind of file**: pictures, audio, video, PDFs, code, 3D models, zips, anything up to 50 MB. Upload to your own files (only you) or to a project (everyone in it), or drag files onto the page on desktop. Chips filter by All, Notes, Docs, Pictures and Other files (remembered). Opening a file shows it right there: pictures, video, audio, PDFs and code, and 3D models open in the 3D viewer. Download and Delete (tap twice) are top right. The sidebar says **All files** next to **All repos**, and a project's section is **Files**
- **Every theme checked on phones**: all 9 themes on 10 phone screens, with a new test that measures text contrast on each one. Fixed the logo on light themes (it was white on white) and Home's small "Open" and "Copy a link" links on Light, Solar Light and Nordic
- **Phones**: the Files + opens a sheet like a files app: New note, Upload a file, or Upload to the project you're in. The rack icon stays the same

## v0.8.7

- **Messages, all in one list**: the speech-bubble button opens every conversation, not Friends. Your Claude, each project's chat (marked in the project's color, unread first) and your direct messages (in each person's color, with a friend tag and unread count). Tap one to jump straight in
- **Phones**: the first rack button is **Home** again, so you can always get back to the dashboard from Docs. Your profile moved to your avatar, top left of Home and inside the docs search pill (like Google Docs), where it opens your profile sheet

## v0.8.6

- **Docs center, docs-app style**: a search pill, sort by last updated or A–Z, list or grid (remembered), and cards with a preview of each doc. Your own notes and your projects' docs sit together, newest first. **New note** (desktop) or the **+** (phones) starts a note
- **The note editor**: a big title, then the page; ✓ Done top left, undo and redo; an empty note you close disappears
- **Phones**: Home's **Projects** button and the **TribeCode ⌄** header both open a list of your projects (tap one to open it, or start a new one). The docs grid fits two columns at 390px, and the editor is full screen

## v0.8.5

- **A full check of the app**: every feature from v0.6.0 on was tried on desktop and phone, and 7 real bugs were fixed:
  - the phone-app card blinked on every redraw, and its switch could stay greyed out
  - phone Docs was cut off at the screen edges
  - the hidden phone menu button still took taps in Chat
  - Settings looked for a local model on a friend's own device
  - Reset-Everything could delete a folder that held a tribe
  - an unreadable members/invites file was silently replaced (it's now kept aside first)
- **Restart loops**: 10 loops of crash and clean restarts with 1,600 checks, no data lost, sign-in and keys intact (`npm run dev:loop`; a short loop runs in `npm test`)
- **Developer tools** (docs/DEV-TOOLS.md): `dev:test`, `dev:shots`, `dev:seed`, `dev:loop`, `dev:reset`, `dev:release`, `dev:doctor`, `dev:infographic`
- **Infographic** (docs/infographic): how TribeCode works, from one host to friends, Claude, lanes, GitHub and releases, with how to reach your Claude from your phone in every section
- Remembered between visits: the Agents Hub and Workshop tabs; an empty note you close doesn't linger
- **New website** (orionopenwow.github.io/TribeCode/about/): a showcase of TribeCode with real screenshots, a 19-second demo of building with friends and Claude, Open the app, Download for your system, the phone flow with a QR, live GitHub stats, a fair comparison with sources, and an FAQ. The README leads with the demo
- **Phones**: Docs fits the screen; Chat's top bar takes only the taps it shows; the website works at 390px

## v0.8.4

- **Pictures you can frame** (like Discord): after you pick a project picture, drag it and zoom (slider, wheel or pinch), see it as the round rail bubble and the rounded square, then Apply. PNG, JPEG, WebP or GIF up to 10 MB and at least 64 px; saved as a crisp 256 px square. Works in the new-project setup and from the overview's picture
- Your bar at the bottom left is now part of the sidebar (flush, no floating card), and Settings is a real gear
- **Desktop folders**: `Working\Start-Working.bat` is the main folder: the newest work opens at once, no .exe to build. `Stable\Update-and-Open-TribeCode.bat` updates the installed app only when you double-click it (or press Restart to update)
- **Phones**: the Agents (robot) button opens "Talk to your Claude": message your Claude on your computer, hand a change to your desktop, ask the AI, or Manage agents

## v0.8.3

- Home's Notes and the docs center now list your notes as soon as they sync (they used to wait for the next redraw)
- **Phones**:
  - An **Agents** button (robot) in both racks. On Home it opens the Agent fleet across every project; in a project, that project's Agents Hub
  - In a project, **Updates moves to the top right**: a bell with its count beside the side-pane button (in Chat it sits right of the tabs). The rack is Home · Chat · Docs · Tasks · Agents

## v0.8.2

- **Home has an identity**: a card at the top with the campfire, your greeting in your color, and three live numbers (projects, friends online, agents working)
- **Notes instead of the scratchpad**: Start a note opens a plain editor (title on the first line) and the note lands straight in your **docs center** (Home › Global docs): your own notes on top, then your projects' most recently updated docs. The right panel has a quiet Start a note too
- **Phones**:
  - Home's top bar works like a social app's: + (start or join) · TribeCode ⌄ (your projects) · the bell
  - Bottom racks are icons only, bigger and bolder, flush with the bottom, and they no longer hide when you scroll. Home: You (your avatar opens your profile) · Messages · Notes (your docs center) · Projects
  - The inbox reads at a comfortable size; the hosting banner stays off Home (the identity card says it)

## v0.8.1

- **Guide**: how to TribeCode in nine short pages (start here, projects and invites, Claude Code, working together, repos and versions, phones, hosting, agents and the Office, troubleshooting). Tucked away: the profile menu, Ctrl K, or "? Guide" at the bottom of Settings; no new sidebar rows
- **The new vision** (docs/VISION.md) from fresh research (docs/RESEARCH-2026-11.md): own the niche of small crews building together with their own Claude, starting with game jams; then one-tap Ship, a repo importer with license checks, a skills catalog, engine packs and a public Workshop
- Chat looks more like a server channel: a big rounded message bar with + on the left, a thin date line, quiet system lines, links as small cards
- **Phones**:
  - Home has no top bar and less empty space. Its rack has five slots that line up with a project's: You (your avatar: tap for your profile) · Messages · Notes · Notifs · Projects
  - In a project: Home · Chat · Docs · Updates · Tasks, centered. The project's picture sits top left, and a pane button top right opens the side pane (who's here, helpers, Claude, scratchpad)
  - No #general pill or profile picture in the chat bar
  - You, Friends and Settings sit flush at the bottom of the side panel
  - The hosting banner stays on one line

## v0.8.0

- **Themes**: nine flat matte themes (TribeCode Dark, Light, Midnight, Nordic, Nightshade, Campfire, Solar Dark, Solar Light, High contrast) with a swatch picker and "Match system" in Settings; every theme passes 4.5:1 text contrast; Ctrl+Shift+L flips your light/dark pair
- **Updates without the fuss**: updates download in the background (Settings switch, on by default); when it's ready, **Restart to update** saves, closes and reopens straight into the new version where you were, with no installer window. The installer and the TribeCode.bat reinstaller got the matte TribeCode look and quiet installs (docs/UPDATES.md)
- **Viewers**: a 3D viewer for GLB/glTF models (orbit, zoom, animations, stats) and a pixel-art animation viewer for sprite sheets, Aseprite sheets and GIFs (fps, zoom, onion skin, scrubber), from Docs › Art & models and from files in chat (docs/VIEWERS.md)
- **Phone app mode (iOS / Android)**: a per-project switch; pick Expo, Capacitor or Tauri mobile, set up a starter in the repo, install dependencies on the host, and open it on your phone with the Expo Go QR in Preview (docs/PHONE-APP-MODE.md)
- **Chat as a list**, like a server channel: avatar, the name in its color with "Today at …", grouped lines, time in the gutter on hover; no bubbles
- **Your bar, bottom left** (desktop): you, the inbox, Friends and Settings in a bar wedged into the corner; the Friends icon matches the bell
- Quick start has its icons back (the project's face, a plus, a link) and a few small matte touches (hosting, Scratchpad, Recent activity)
- **Phones**: themes, viewers (full-screen sheets), the phone-app card and the list-style chat all checked at 390px; phones keep you, the bell and Friends in the top bar

## v0.7.7

- **Calls, chat and Claude Code, smoke-tested end to end** (app/test/e2e_comms_smoke.py, docs/COMMS-SMOKE.md): project chat and DMs live on desktop and phone and after a reload; three-way huddle voice connects and carries audio both ways; captions reach everyone and land in the meeting notes; Claude Code connects with the printed `claude mcp add` line, shows online, reads chat, posts, and answers @ai
- **After-huddle summary** (setting, off by default; host or project lead switches it in the huddle's captions strip): when a captioned huddle ends, a short summary and the overall mood go to the project chat and, with a repo, to `notes/huddles/<date>-<time>.md` (summary only; the transcript stays in Docs)
- Fixes: meeting notes landed in the wrong project when the last person left from another project; Claude Code showed as offline until its first action; @ai answers could land in another project; the Claude Code connection now answers with the protocol version it supports
- **Phones**: chat, DMs, captions and huddles checked at 390px in the same test

## v0.7.6

- **Sign in with Discord, GitHub or Google**: friends can join from an invite with one of these instead of typing a name, and sign back in on a new device without a new invite (`/signin.html`, linked from the join page). Each provider is off until the host adds its app in Settings › Sign-in; the redirect address to register is shown there (use Tailscale Funnel so it stays the same). Signing back in gives that device its own key, so other devices stay signed in. Members link or unlink accounts in Settings › Sign-in (docs/SIGN-IN.md)
- One-time guest passes also work with these sign-ins
- **Phones**: the join and sign-in pages work at 390px

## v0.7.5

- **The Windows desktop app can finally talk to its own tribe.** Its page lives at `http://tauri.localhost`, and the app mistook that for its server: every sign-in and API call went to the app's own files and quietly got nothing back. It now uses its server on port 4747. (This is why Settings › GitHub, the Office and new projects "did nothing".)
- **The server only runs when it should**: on a fresh install nothing starts until you create your first project; Settings has **Host on this computer**, and switching it off stops the server (nothing is deleted)
- **Friends**: a people button right of the bell opens your friends (online first, Message), everyone else in the tribe with Add friend, and two ways to bring someone new: an invite link, or a **one-time guest pass** (one use; the guest's account stops working after a day). Friends are kept on the server, so they follow you to every device
- **Phones**: the Friends panel fits at 390px

## v0.7.4

- **Agent fleet stays on the dashboard**: from Home, Agent fleet keeps Home's sidebar (Home · Global docs · All repos · Agent fleet) instead of jumping to a project's. A project's Agents Hub is still that project's page
- **Open Space has an on/off switch** and leads the Agent fleet page: turning it on the first time downloads, builds and starts it; off stops it. "Open the office" opens it once it's running
- **Phones**: unchanged (the office runs on the host computer)

## v0.7.3

- **Desktop sign-in fix**: the app could reach its own tribe server but not sign in ("A TribeCode server is running here but this app could not sign in to it"). The server now answers the browser engine's private-network check, so creating your tribe and signing back in work inside the app. If sign-in still fails, Home shows the exact reason with Try again (no more pointing at a Settings page that doesn't exist)
- Window buttons: close is now on the right (green and red swapped)
- Getting started, polished: left-aligned band, each way in has an icon, a short line and a clear action
- **Phones**: the Getting started tiles get the same look at 390px

## v0.7.2

- The desktop app no longer sits quietly on "Not in a tribe yet" when its tribe server fails to start: Home says so, shows the reason, and has Try again
- Settings shows the GitHub row before your tribe is running, with what to do first
- **Phones**: unchanged (this is about the desktop host)

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
