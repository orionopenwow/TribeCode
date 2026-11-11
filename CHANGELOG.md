# Changelog

## Unreleased
- **Start a project instantly, choose where it lives last**: Start your first project makes it right away on this device (name, one line, optional notes, first tasks and Company basics where anything can be "later"); tasks, docs, chat and Company work with no server. "Where should it live?" is the optional last step and stays in the top pill: a GitHub repo (anyone sees the live repo and suggested changes, mirrored as files on a `tribe/suggestions` branch, no server needed to view), this computer, a free cloud or a phone. Moving in is one idempotent call and the device keeps its copy until the host confirms ([docs/LIGHT-HOSTING.md](docs/LIGHT-HOSTING.md)).
- **No server errors before setup**: a fresh install starts no server and never says "didn't start" or "Reconnecting…"; the desktop app hosts only when a tribe exists on that computer and Host is on. After setup, a failed server shows one line with Details, Try again and Keep working offline.
- **All files works without a tribe**: + New makes a note, doc, sheet, whiteboard or design, and Upload keeps any file, all on this device in the same editors projects use; new Sheets, Designs, Whiteboards and Code filters; Move to… puts any of them in a project.
- **Phones**: the + sheet in Files offers the new kinds, the setup sheets are bottom sheets, and the filter chips scroll sideways.

## v0.28.0
- **Design canvas** (a new Design row in every project): frames, shapes and text as real layers, a layers panel and a properties panel, auto layout that is real CSS flex, components with copies that keep their own text and colors, snapping with alignment guides, a rotate handle, align and distribute, selection colors, frame presets, a right-click menu, Figma-familiar shortcuts and live editing with friends (their cursors and drags show as they move). **Send to app** turns a frame into code in your project and the preview updates; **Open in canvas** turns anything in the preview into layers; **Inspect** shows each layer's CSS; export PNG, PNG 2x and SVG.
- **Talk to Flint while you design**: Simple mode is just the canvas and a Flint chat pane ("make a login screen for Ember"), with Show and Undo on every step and a small quick bar on the selection; Advanced (Ctrl Shift \) brings back layers, properties and Inspect with Flint as a tab. 13 screen templates, tidy up into auto layout, rename layers, dark/light versions and variants, all free. Members' Claude Code can read and edit designs through new canvas tools, with its own cursor.
- **Focused workspaces**: Preview and Design open full-window with one slim bar: Back to app, quick jumps to Chat, Tasks, Docs and Code with badges, and a "Back to…" pill. Esc closes the innermost thing first.
- **Flint does more with no AI at all**: a local brain understands about 170 actions across the app with typos, dates, people and colors, runs several steps from one message, asks one tappable question when something is missing, undoes what it did, learns phrases you teach it on your device and answers "how do I…" from the Guide. Free builds from a sentence (3D game, to-do app, video editor, platformer, landing page, any website template), a no-prompt **Properties** panel for whatever you click in the preview, Plan first, queued notes and a version History with restore. Bigger jobs get an honest hand-off to your own AI helper.
- **Website templates**: 16 starter sites, each with its own look: link in bio (four looks), merch shop with a cart and your own checkout link, portfolio, creator, band, café, local service, wedding RSVP, podcast, newsletter, startup, indie game, resume, nonprofit, photography and coming soon. Customize in Easy (a short form), Comfortable (looks, fonts, sections) or Pro (the code).
- **Comment pins** on the live preview and on design layers: threads, @mentions to the Inbox and phone, resolve, filters, follow a friend's view, and tools so members' AI can read and answer feedback.
- **Start a tribe from a phone**: "Where should your tribe live?" This phone (instant, moves to a host in one tap when friends join), free cloud (Render), your Android (one Termux command) or a computer.
- **Make it yours**: a three-step first launch for your name and profile icon (or photo), the look (nine themes, accent, match system) and language and text size, with a live preview. Reopen it from Settings › Personalize.
- **Task Board as a dashboard**: counters that filter (Needs someone, In progress, Review, Done this week, Overdue), full-width rows with one clear next-step button (Assign, Start, Send for review, Approve), Done folded away, and a List | Board switch.
- **Build kit**: Flint and members' agents build with checked open-source stacks per kind of project (three.js with physics for 3D, Phaser and PixiJS for 2D, Mediabunny for video, uPlot, ECharts and D3 for dashboards) and a quality bar; new polished 3D and browser video-editor starters.
- **Marketplace**: a "Trending on GitHub" shelf of permissively licensed repos people are talking about, refreshed daily, plus Astryx, BoardUI, Bencho and our own design tokens and motion pack.
- **Phones**: Design opens full screen with Flint as a bottom sheet and layers and properties as sheets; Preview fills the screen with Flint as a sheet; the Task Board rows get a full-width action button; website templates, comment pins, the phone tribe chooser and Make it yours are built for 390px with no sideways scroll.
- **Also**: Studios with download links for ArtCraft and friends, Publish with play links and a security check, Jam mode, a focused first run, Flint flying to what he edits, an agent-readable design-tokens file and a shared motion module, the offline demo answers every new feature, and the phone Tasks tab no longer repeats the add box.

## v0.27.0
- **Company mode**: turn a project into a small business, alone or with friends. An org chart of seats (CEO, Build, Grow, Run, plus Design, Sales, Support, Money, Legal or your own), each held by a person, an AI helper or both, with a short charter: this month's goal, what it may do alone, what needs your OK, a weekly AI budget. Seven templates. Today's standups, goals with +1 progress, a decision log, one weekly review in your Inbox and a monthly board update in Files. Your Claude gets `my_seat`, `company_brief`, `seat_standup`, `decisions_read` and more; its CEO calls wait for a person.
- **Money**: revenue, costs, net, runway and users, every number with its source: typed in, a Stripe, Plausible or PostHog CSV, or Stripe sync with your own read-only key. Accountant CSV export and AI spend per seat. **Seat autopilot** (Advanced): an AI-held seat works its charter on a schedule; anything outward or costly becomes an approval; pause-all, budget caps, a do-not-contact list and an audit trail.
- **Work**: work profiles, gigs and hiring straight into a seat (outside hires get an invite), a time bank both sides confirm, compute sharing on your own terms, and an opt-in public gig board.
- **Academy**: 62 plain-language lessons in ten tracks (founder basics and every seat), each with something to try in your tribe. **Legal**: ten plain-English starting templates (NDA, contractor, co-founder, IP, privacy, terms, cookies, SOW, volunteer, revenue share) that become docs, always marked "not legal advice". **Offload**: send simple jobs to free models elsewhere and bring the result back into Files.
- **Marketplace**: 515 checked widgets, skills, libraries, connectors, studios, playbooks, asset packs and templates. Hot, Rising, New and Top come from what your tribe uses; one Filters button keeps the screen calm. "+ Add" in the sidebar shows the best picks.
- **Recommended next** on the Dashboard reads what the project is about and where it stands, and suggests three things to do next. **Experience modes** now stack the new features (Beginner: Company, Academy, Marketplace; Intermediate: Money, Work, goals; Advanced: autopilot, connectors, compute), and any one can be turned on early for you.
- **Website**: "Run a company, not just a project", a feedback area that opens a GitHub note (and `scripts/dev/feedback-digest.js` reads and sorts it), a fifth Learn module "From project to business", and a new mission: one place to build, run and work together.
- **Website, round two**: a full Docs page (install to troubleshooting, with a table of contents); "The whole studio, in one app" (Docs that work like Notion, Flint, Widgets, Studios such as ArtCraft, and the asset library); a live Company mock with three animated explainers; a "How vibecoding works" scene where friends build a bake-sale page with their AI; every remix card now has a real picture, six at a time. A new standard in DESIGN-SYSTEM.md: every explainer is built at the detail of the hero widget.
- **Guides**: six new pages in Settings › Guide (Company, Money and autopilot, Work, Academy·Legal·Offload, Marketplace, modes).
- **Fixes**: AI helpers can save code through TribeCode's own tools when their owner may; the desktop app now ships its templates (starters, asset library, Marketplace, Academy, Legal); "Design" no longer turns into "Theme" on English screens; the you-bar no longer covers the Workshop.
- **Phones**: Company, Money, Work, Academy and the Marketplace are built for 390px: stacked cards, sheets instead of side panels, all five Work tabs fit, no sideways scroll.

## v0.26.0
- **Phones**: the rack's Tasks and Updates badges count up and clear when you look; Updates mark as read when opened, with a dot on each new one; Flint's demo card fits the screen with its recap; the website's Learn panel stacks again.
- **Preview app** is always in the sidebar, above Invite friends: the play button for the code under your app, game or site. With nothing to run yet it opens a "What should it be?" screen: describe it (or tap an idea), press Build it, and you get a first version you can run right away while your Claude and the tribe's agents build the rest, live.
- **+ Add** is always in the sidebar once a project is open, to add tabs (whiteboard, calendar, bugs, links, docs…) to the left pane.
- **Tribe link**: every tribe gets one permanent link, like a Discord server invite (`<your address>/t/<name>`). Anyone with it picks a name and they're in, no AI needed. The host can rename it, renew it, turn it off and show a QR. One-time invites fold underneath.
- **Badges count properly**: the Task Board badge counts task updates from others since you last looked (it used to show the number of open tasks, which never went down) and clears when you open the board; the Inbox clears when you read it and counts back up on the next one; grouped notifications say how many are new; phones' Tasks and Updates badges follow the same rules.
- **Code sync autopilot**: a Sync line in Code repository says where you stand against GitHub (to pull, to push, in sync), with Sync now. Autopilot can now auto-push saved commits on main as well as pull friends' work, never force-pushing and never when GitHub has newer work.
- **Storage & sync** in Settings: where your tribe runs and where its files are, each project's GitHub repository, what this device keeps, and Save a copy / Download backup in one place.
- **Languages in the app**: Settings › Language (the website's eight languages). Menus and buttons switch; what people write stays as they wrote it. The first time, it follows your device's language.
- **Your Claude can use everything**: Claude Code gets `tribe_api` (any feature the app's buttons use, as you, with your role's permissions) and `code_tree` / `code_read` / `code_write` / `code_search` for the project's code repository from any computer.
- **Creative studios** on the shelf: ArtCraft (the open-source IDE for artists), Godot, Pixelorama, Material Maker and BeepBox, recommended beside the asset library and the inspiration board. **Modules** are a new Workshop kind for add-ons people make for TribeCode (docs/MARKETPLACE.md).
- **Demo tour**: Flint's card shows the chapter and a progress bar, what the chapter shows, a separate "On screen" line for clicks and typing, and a bigger recap with what's up next.
- **Website**: "What is vibecoding?" explains the new way to make software in plain words (all eight languages), with "Multiplayer vibecoding" above the headline; Learn modules drop the end quiz (finishing a module earns its badge); the Learn panel stacks properly on phones.
- AI Insights no longer snap shut while you read them; the offline demo's chat no longer shows a stuck "Sending…" copy.

## v0.25.0
- **Phones**: the demo tour's game shows on phones again and Flint's line fits the screen; the Task Board, dashboard tiles and inspiration board stack neatly; the website's language chips sit in the menu.
- **Asset library** (Files › Assets, or ask Flint "add a jump sound"): open sounds made on the spot, a pixel sprite kit, motion presets, icons (Lucide, Tabler, Phosphor, Heroicons, Pixelarticons, Twemoji), self-hosted fonts, 3D models including a rigged, animated fox, and Poly Haven textures and skies. Only open licenses; every file is credited in assets/CREDITS.md. AI agents get find_assets and add_assets.
- **Inspiration board** on the dashboard: drop pictures, paste Pinterest boards, Dribbble shots, any page or a font name. TribeCode pulls out the colors and fonts, and Dress it up puts them on the website and in design/inspiration.css. No AI needed.
- **Edit the website in the preview**: press Edit, double-click text to change it, or pick anything and tell Flint what to change.
- **Site templates**: save a website as a template and start new projects from it in setup.
- **Dashboard**: colour-coded At a glance tiles with a big number, what it means and one action; cards fit when the side panel is open. **Task Board**: columns that fit, each with its colour.
- **Themes**: every theme has its own accent colors and its own logo colors (dark brackets on Light). Theme chips preview the app. Settings, Edit profile and Inbox got a design pass; the Help menu dims the page behind it.
- **Demo tour**: the slides and each chapter wait for Next, at a calmer pace.
- **Website**: Learn lessons open with scenes in the style of the homepage's app picture; a language picker (English, Español, Português, Français, Deutsch, 日本語, 简体中文, 한국어); an "app by Campton" section.
- Fixed a crash when tapping Ask AI from the flow card on some phones.

## v0.24.0
- **Phones**: the setup steps stay as big cards on phones too until all four are done.
- **Website copy**: rewritten in plainer, more human words. New headline ("Build the thing with your friends."), and every section says what it does in one or two specific sentences instead of lists and slogans. The GitHub strip is more distinct (a Star it on GitHub button, bigger numbers) and the download buttons show the system's icon, the kind of file and its size.
- **Avatars**: 36 new pixel icons in six themes (Space, Ocean, Fantasy, Tech, Food, Play) next to the 24 Campfire ones, picked by theme in the profile editor. And **Make one**, a pixel avatar maker: skin, hair, hair color, eyes, mouth, an extra (glasses, cap, headphones, crown, bow, blush) and a shirt, plus 🎲 Surprise me, on any tint.
- **Website**: the Learn panel is clearer and more polished (your path, progress, the course in numbers, numbered modules). Starter cards show real screenshots of real starters instead of pixel sketches, and four of them play right in their thumbnail (▶ Play / Try it), or big with ⤢: the Pixel platformer game, the Habit tracker, the Shared list and the Portfolio. The open-source "Remix a classic" cards show real screenshots from each project (2048, Phaser, LittleJS, KAPLAY, Godot, three.js, TodoMVC); the rest show a plain tile.
- **Setup stays until it's done**: writing the vision (or adding a task) no longer shrinks the dashboard's four setup steps into a small list. The big step cards stay at the top until the vision, a first task, your AI and the code repository are all done, so nobody skips the last two. The fold button tucks them into the compact list if you'd rather.
- Releases no longer wait on GitHub's Mac machines: when the Mac build can't start, Windows and Linux still ship and the Mac installer follows in a later release.

## v0.23.0
- **Phones**: the Code view's editor works on phones too (a full-width box with Save and Lock below it).
- **Edit code in the app**: in Files › Code, open a file and press ✏️ Edit. Save (Ctrl S) writes it and commits it on the checked-out branch with your name and an optional note, and the history updates. Tab indents, Esc cancels.
- **🔒 Lock a file**: Lock puts your name on it; others (people and AI agents) see it and can't save over it until you unlock. Spectators, guests, secret files (.env, keys) and paths outside the repo can't be edited.

## v0.22.0
- **Phones**: project pictures and emoji fill their squares on phones too, and the demo tour plays by itself with Flint's live line above the bar.
- **The demo tour**: three short slides first (what you'll see, what TribeCode is, how it works), then Flint plays the whole tour himself. Nothing to click: a spotlight dims everything but what's happening and follows each click and each typed box, and Flint's line at the bottom says what he's doing ("Clicking Save vision", "Typing the vision") and then what it means. Pause, skip and Try it yourself stay on the bar.
- **Your helpers**: the right panel starts with three short steps: Meet Flint, give Flint an AI (built in, on this computer, or a cloud key, or keep simple rules), and bring your own AI (Claude Code, Codex, Cursor, Gemini). Steps tick themselves when they're already true, and the card goes away once done. Flint's box at the bottom is just the Ask box until you talk to him (no more "basic mode · no model" header). "Pick a brain" is now "Choose Flint's AI".
- **Start fresh** (Settings, host on the desktop app): moves the whole tribe (every account and guest, chat, projects, docs) into a backup folder next to it and starts an empty tribe with you as host, then shows your admin sign-in link once. Nothing is deleted.
- Project faces: emoji and pictures are true squares everywhere (rail, lists, phone), sized from the tile so they never vanish or spill.
- The game starter's page takes your project's name.
- Tests: end-to-end journeys from joining a tribe to a finished game (in the Preview), app (phone starter) and website (published files), plus a TribeCode-style landing page; part of the release gate.

## v0.21.0
- **Phones**: the message box no longer brings up the password-autofill bar; it grows to a few lines, Enter sends (Shift+Enter for a new line), and a slim format strip (bold, italic, strike, code, link, list) rides above it while you type. The newest message always sits just above the box, including when the keyboard opens, and the Add to Home Screen tip never covers the chat.
- **Files**: start anything from the top of Files: a doc, sheet or slides, from a template, by asking Flint, or by uploading files. Cards say exactly what each file is (Sheet, CSV, Slides, Doc) and fit more on screen.
- **Docs**: one title (the page's), Edit and Preview, a clear ✓ Saved, and a Done button that takes you back to all your files (so does tapping Files again). The page fills the width with no frame around it; the side panel button sits in the toolbar. History, pin, pop out, comment and dictate live in ⋯. No more "Live · synced · v1" or word-count lines; problems like being offline still show.
- Reactions you've added have a white outline instead of orange.
- Your focus stays hidden until there's something to focus on (a task, your part of the code, a vote), and its row of unlabeled icons is gone.

## v0.20.0
- **Save a copy**: Settings › Save a copy downloads everything you can see in the tribe (messages, docs, tasks) as one .zip on your phone or computer, so nothing is lost even if the host's computer is. Other members' DMs and sign-in secrets are never in it.
- **Export docs, sheets and slides**: docs to Word (.docx), Markdown, a web page or PDF; sheets to Excel (.xlsx, formulas kept) or CSV; slides to PowerPoint (.pptx). Copy for Google Docs or Sheets puts it on the clipboard with formatting and opens a new Doc or Sheet; Open in Google Slides saves the .pptx to import. On the host computer, Save to Desktop puts the file in the project's Desktop folder. Start one fast from the chat's + menu (Doc, sheet or slides) or Ctrl K. Google Drive linking is planned (docs/EXPORT.md).
- **Start with a prompt**: New project opens on one box, "What do you want to make?". Your sentence becomes the project's vision and bio; the name and emoji are guessed from it ("A website for my friend's bakery" → 🌐 Bakery Website), so the dashboard's vision step is already done and the suggested tasks, starter and site builder follow from it. A blank project, templates and starters are still one tap below.
- **Site builder**: every project gets a brand kit (main and accent color with automatic contrast fixes, a logo or text name, a font pair), six site types (game, app, portfolio, small business, event, docs) and three levels that follow your experience mode: ⚡ Instant (one tap, the type guessed from the project), 🧭 Guided (type, brand, sections, live preview) and 🧑‍💻 Code. Ten one-tap themes, "✨ Suggest for me" that learns what your tribe picks and says why, and Publish writes a plain `site/index.html` and a commented `styles.css` an HTML person can edit. Hand edits are never overwritten without asking. Saying "make a website" to Flint runs Instant.
- **Agents in public chat**: type @ in a channel for a picker of people, agents and @ai. `@my-claude add a jump sound` or `@maya's-claude …` gives that agent a public command: it answers, and posts what it makes, in the channel for everyone. The right panel stays private. A plain @maya is still just Maya. Each owner's "Friends can ask my AI" (ask, always, never) still decides who may use their agent, and admins set the rules in Settings › Agents in chat: on or off, who can command (everyone, builders, admins), which channels, whether finished agent tasks are posted, and a limit per person per hour.
- **Experience modes**: Beginner, Intermediate or Advanced decides how much of TribeCode you see (Settings › Experience). Beginner keeps chat, Flint, templates and shipping; Advanced shows ownership, conflicts, MCP, the agent fleet and Turbo. Your role still decides what you can do. The host picks a starting mode per role (Settings › Starting modes), the welcome's "Have you made an app before?" sets yours, and the choice follows you to every device.
- **Remix a starter**: New project › Remix a starter lists open-source games, apps and sites (2048, the Phaser and melonJS starters, PixiJS open games, HTML5 Boilerplate, plus LittleJS, KAPLAY, Godot, three.js, TodoMVC, Expo, Astro and Kenney's CC0 art to browse). Every one was checked for an MIT or CC0 license and keeps its authors' credit. The website has a matching "Remix a classic" row; its Start from this opens the app with the GitHub box filled in.
- Project settings no longer opens the welcome by mistake when it's opened while the project list is still loading.

Faster-feeling and harder to break: everything you do shows at once, nothing is lost offline, and Learn is a real course.

- **Instant messages, never lost**: your message shows the moment you press Send, faint until the server has it. Offline or while the tribe wakes up, it waits in the outbox and sends by itself, exactly once (each message carries an id, so a resend never doubles). Queued messages survive a reload. If one is refused, it says Not sent with Retry
- **Drafts stay**: what you were typing in a chat stays when you switch channels, DMs or projects, or reload
- **Releases wait for tests**: installers build only after the essential tests pass on GitHub, and the same checks run on every push to work branches
- **Instant votes**: your vote shows right away and rolls back with a note if it didn't save (task moves were already instant)
- **Health pill**: quiet when all is well; shows Reconnecting, Waking up the tribe, Offline or "2 waiting to send" when it matters. Tap to try again. The app also reconnects the moment your network comes back
- **Refresh TribeCode** (Settings › Fix problems): clears the app's stored files and reloads fresh, keeping your sign-in, drafts, unsent messages and the view you were on
- **Instant first screen**: the dashboard and chat draw at once from what this device saw last, then update in place
- **Learn is a course**:
  - Four modules of short lessons, one at a time, with Back and Next (arrow keys work).
  - A three-question check at the end of each module earns its badge.
  - Your progress, a ring and badges show in the sidebar.
  - On the website, Learn is now one compact panel: your progress, a Continue button that picks up at the next unfinished lesson, and the four modules.
- **Chat header buttons all do something**: ⓘ opens "Who's here" (people and AI helpers, online first, invite). Call and screen share explain kindly when a device can't do them
- **Start a tribe from a browser**: the join panel offers a free cloud tribe next to the desktop app; docs/WEB-AND-DESKTOP.md lists what's the same and what's desktop-only
- **Phones**: taps get a soft press instead of the blue flash, and buttons don't select text. Main actions give a tiny haptic tick on Android. The health pill is a chip at the top, and the Learn course stacks into one column

## v0.19.6

- **Stay signed in**: joining or signing in also saves a secure sign-in cookie that pages can't read. If your browser's storage is cleared (iPhone Safari wipes it after a week away, or you open the tribe at another address), TribeCode signs you straight back in. A made-up cookie signs nobody in, and AI helpers' keys never come back this way
- **Joining lands on the dashboard**: a friend who just joined goes straight to the project's dashboard, with a "You're in!" card and a one-tap **👋 Say hi** (and Connect my AI on a computer)
- **Getting started starts folded**: a new project's chat opens with the slim Getting started bar; Open shows the full card
- **Phones**: the message bar rides on the keyboard. While typing, the chat fits the space above the keyboard, the bottom bar steps aside, and the newest message stays in view; your own message always scrolls into view
- Fixed a "repositorysitory" typo in the GitHub step

## v0.19.5

Tonight's fixes for hosting and inviting, together (v0.19.1 to v0.19.4 reached the website and cloud servers but never got a desktop build).

- **A link that works from anywhere, by itself**: opening Invite friends falls back to a Cloudflare tunnel whenever Tailscale sharing isn't approved. The helper is fetched the first time and checked against Cloudflare's published fingerprint. The link turns into an https address with no setup
- **The right Wi-Fi link**: invite links never pick a virtual network adapter (VirtualBox, VMware, Hyper-V, WSL, Docker) that friends can't reach
- **Cloud tribes**:
  - Claiming asks for the setup code and your name, then takes you straight in. Chat works right away with no AI
  - **Cloud save**: every member's browser keeps a sealed copy and brings a napped server back, so nobody rejoins
  - **Keep-awake** for 3 hours after use
  - **Sign in with GitHub** from the host's environment settings (docs/CLOUD.md)
- **Phones**: the invite link works on a friend's phone wherever they are; a phone that joined through a link stays signed in after a cloud restore

## v0.19.0

Code anything, together: the website says what you can make before anything else, Learn guides for newcomers, a review step before code goes to GitHub, and an optional Turbo mode.

- **Ship it**: a "Ready to ship" card in the Code repository view shows everything since the last push to GitHub (saved changes, files, who and which AI helper, linked tasks) before anything moves forward. The host ships, or anyone can ask to ship with a note
- **Vote to push**: each project picks who decides: the host (default), a majority, or everyone. Approve or deny with a comment, on the card or as a one-tap approval on your phone. AI helpers can ask but never vote. Only the reviewed saved change goes out, and nothing is ever forced
- **Turbo mode** (off by default): approved changes ship by themselves at a quiet moment: nobody mid-edit, no new saved changes for a while, no one working in those files, no open vote, the checks passing, at most a few times an hour. A ⚡ pill shows it's on, with a log of what it shipped
- **Share progress**: one click copies the GitHub link, what's done and what's next, and an invite link, ready for a chat or a text
- **Who's waiting on whom**: a live line in the Agents Hub; a waiting ship vote shows under Needs you. Claude can ask "is it OK to ship?" and request a ship through TribeCode's tools
- **Split a task** into 2 to 5 smaller ones from its card
- **Write the vision right in the checklist**, then pick first tasks suggested from it (it can tell a game from an app or a website by what you wrote), or type your own
- **Connect GitHub** from the checklist: the step wears the GitHub mark and signs you in inside the app; once you're signed in, your new code repository goes up to GitHub (private) by itself
- **Flint's welcome teaches**: it asks whether you've made an app before, then shows how an app comes together (with deeper notes if you've built things) and what you'd use, as four small live tiles
- **Website**: "Code anything, together". A new "What you can make" section (apps, games, websites, tools, bots, school projects, open source, your big idea) comes before the six-step story, followed by **Learn**. The new Learn page has guides on what code is, your first app and building together, languages explained simply with a deeper version each, words to know, and a quiz that earns the First Spark badge. Flint on the site answers "What can I make?" and "New to coding?"
- **Free cloud tribe servers**: one click on Render (Deploy to Render in the README, render.yaml and a Dockerfile) makes a TribeCode server in the cloud. The first person with its setup code becomes the host, and invite links use the cloud address. It's free; it sleeps when nobody is connected and its files reset then, so keep your code on GitHub (docs/CLOUD.md)
- **Easier to read, everywhere**: a readability pass over every pane. Labels are at least 12px and captions, hints, status lines, times and inline code at least 12.5px (343 sizes raised across 57 stylesheets), and long text gets a little more line spacing. Avatars, counters and badges keep their compact sizes
- **A calmer right panel**: Your focus is compact (one slim row of quick actions, and only the actions while a project is brand new), Background helpers fold to one line, and Flint opens with a short hello and two suggestions
- **Fixes**: renaming a project keeps its box while you type; a presence update no longer wipes a task you're typing; the ship push, the repository's background check and merges never overlap; a decided ship vote closes the other phone prompts
- **Phones**: the What you can make and Learn cards stack two by two (one column for Learn on narrow phones), the welcome's tiles go two by two, and the Ship card, votes and Share fit one column

## v0.18.0

A big, friendlier version: plain words everywhere, a hands-on guided demo, a simpler dashboard, and a website that explains itself in six steps.

- **Plain words for everyone**: "code repository" instead of "repo", "saved changes" instead of "commits", "AI helpers" where it matters, and "Getting started" instead of "Camp setup". The website drops the heavy role-play words (the Campfire plan is now Hosted, huddles are voice calls, gists are updates)
- **Build an app with Flint**: the demo now starts as a hands-on guided tour. Flint rings the real button, you click it, the app does the step, and Flint says what just happened, one step at a time through making a whole app. "Just watch it" still plays it by itself, and "Explore it myself" stays calm
- **A simpler dashboard**: At a glance (needs you, unread, tasks, new files), Recent changes and Up next, and a slim Add files row with this week's new files. People, AI helpers, the code repository, the standup and tools fold under "More about this project"
- **Approval cards**: each proposal is its own card with a short summary, the vote, big Approve and Deny buttons and a comment box
- **Task Board tabs** get a small emoji each (📋 Board, 🐞 Bugs, 🗳️ Proposals, 🏁 Milestones, 📅 Calendar, 🌿 Code repository, 📸 Visuals)
- **The right panel is the AI section**: "AI helpers" with a color key (teal working, amber reviewing, orange needs you) and a colored edge on each helper; "Background helpers" below; the panel's × sits in the corner
- **Your focus**, at the top of the right panel: what you're working on and what's next, your part of the code (claim one in a click), **Copy a prompt for my AI helper** (your task, your part, a branch name, and what to leave alone, so changes don't collide), and quick actions for a doc, sheet, slides, task, the preview and the code. Flint answers "what should I do next?" and copies the same prompt
- **Notifications you can read at a glance**: green for good news, rose for problems, amber for heads-ups, teal for everything else, each with an icon; the milestone card is green
- **Profiles**: a Showcase section (what you're good at, something you made, "open to helping other tribes"), shown on your profile card. Editing your profile now works in the offline demo too
- **Website**: "How an app comes together", six pixel-art steps near the top; Flint's panel is bigger with an orange frame, a soft shadow and emoji on every question; Show me around includes the new story. Paid plans are written out but hidden until hosting, payments and support are ready; the pricing page shows Free and our promises
- **Phones**: the dashboard tiles go two by two, approval cards stack, the story shows two steps per row, the guided demo works with taps, and toasts sit above the bottom bar

## v0.17.20

- **New pricing, said plainly**: TribeCode is free today with everything in it, and what's free stays free. Planned hosted plans are priced per tribe: Campfire $6 (always-on hosting), Tribe $24 (AI included for up to 8 people, 14-day free trial at launch), Tribe Pro $79 (overnight agents). School & club is free; Studio is $12 a person. Each says "Planned" with a waitlist; nothing is for sale before it works
- **Our promises**, at the top of the pricing page: free stays free, your code is yours (your repo, MIT), we charge only for what costs us money, no surprise bills, no ads or data selling
- **Need a hand right now?** Ask the maker of TribeCode to jump into your tribe (Hire Camp, the start of Triber): a short GitHub form, and you get a time and a quote before any work
- **AI credits in plain cents**: 1 credit is $0.01, shared by the tribe, with a cap
- **Phones**: the promises and plan cards stack in one column; every plan button is full width

## v0.17.19

- **Rate TribeCode**: a small card in Flint's flame menu and the ? menu: pick 1 to 5 stars, say how it went, choose the name to show and whether we may quote you. Sending opens your review on GitHub, so every review is public, real and linked. Flint asks once, gently, after you've used TribeCode on five different days
- **Reviews on the pricing page**: "What tribes say" lists real reviews only, each linked to where it was written (site/reviews.json, docs/REVIEWS.md). Until there are some, it invites the first one. The home page shows one quiet line once there are reviews
- **Free trial, announced**: the pricing page notes a 14-day Team trial with no card when hosted plans open, and a weekend Jam Pass for game jams
- **Phones**: the review card fits a phone screen with big star buttons

## v0.17.18

- **A calmer demo, guided by Flint**: the auto demo now runs at a gentler pace (about four and a half minutes instead of three), and before each chapter Flint flies to the part of the screen it's about, rings it while the rest dims a little, and says in a sentence what it is and what you'd do there. The clock waits while he talks; press "Show me" when you're ready
- **The website page in the demo** stays on screen long enough to read before the tour moves on
- **The website's moving demos are slower**: the Lanes, Room, Phone and Host mocks pause almost twice as long between steps, and text types out more gently
- **Flint says hi on the website**: on a first visit, a bigger card ("Hi, I'm Flint, your guide") offers **Show me around**, a one-minute tour that rings each section of the page with a line about it (Next, Back, arrow keys, Esc). It's also the first chip in Flint's panel
- **Wording**: Flint's website answer no longer says one friend's computer hosts TribeCode; the work lives in your shared GitHub repo
- **Fixed**: stopping the demo and starting it again could leave the old run going in the background
- **Phones**: the website hello shows on phones too (it tucks away after 20 seconds), the tour card sits at the bottom with big buttons, and the phone cut of the demo also gets Flint's introductions

## v0.17.17

- **Sheets in Files**: 📊 Sheet next to ＋ New doc. A light spreadsheet with formulas (=SUM, =AVERAGE, =IF, =SUMIF and more, A1 refs and ranges), a formula bar, a Sum / Average / Count line for what you select, paste straight from Excel or Google Sheets, CSV in and out. Saved as a plain Markdown table, so it reads well on GitHub and agents can edit it
- **Slides in Files**: 🎞️ Slides. Themes (Campfire, Paper, Ember), a slide strip you can drag to reorder, speaker notes, Present full screen with a timer, and download as one web page, as Markdown, or print to PDF. Saved as Markdown split by ---
- **Flint writes docs, sheets and slides**: "make a sheet for our snack budget", "make slides about the jam", "write a doc about the art style", or the new items in his flame menu. Inside a sheet or deck, ✨ Ask Flint changes what's there. With no brain he starts you from a good template
- **Agents too**: `write_doc` takes `kind: sheet` or `deck`; `list_docs` and `read_doc` show the kind and the format
- **Full power when you need it**: docs/CRAFTS.md shows how to link WordCraft, GridCraft and DeckCraft (open source, .docx/.xlsx/.pptx) to your agents and Files, without making the TribeCode download any bigger
- **Phones**: sheets and slides open full width with no sideways scroll; the slide strip scrolls sideways; swipe to move between slides while presenting

## v0.17.16

- **Plainer first run**: Home's AI Insights speak plainly ("Flint is in basic mode" with a Pick a brain button; "Connect GitHub so your code is shared"), and the test robot's notes about TribeCode itself fold away under one line. "All repos" is now "All code"
- **Fewer repeats**: the Getting started pop-out no longer repeats the bar's steps; on the Dashboard, Camp setup is the only list of setup steps; one "Connect your AI" card on Home
- **Empty screens say what to do**: Task Board, Files and Preview point to the next step; the Agents Hub explains what an agent is, and your AI that never connected gets a Connect button
- **Connect your AI**: a short "What's a terminal?" hint (PowerShell or Terminal); MCP explained in one line
- **Settings, tidied**: connections, sign-in, roles, packs and backups fold under "More settings"
- **Invites**: plain choices ("Lasts 24 hours", "Up to 5 people", "They can build"); if a public link can't start, one plain line with the details under "How to fix it"
- **Wording**: the join and friend-link pages no longer say TribeCode runs on a friend's computer; your work lives in the shared GitHub repo
- **Fixed**: dragging the sidebar edge follows the pointer exactly
- **Phones**: the pinned repo's Preview button no longer covers the repo name; "all saved" instead of "clean"; no toast over the invite sheet after you create a project

## v0.17.15

- **Live cursors**: see your friends' pointers, with their names, when you're on the same screen of the same project (like in Figma). Only people in that project see them; agents and spectators don't send any; switch them off with `TribeCursors.set(false)` (a Settings switch is coming)
- **Fixed**: the Agents Hub chapter of the demo tour could stay blank if its first load failed; it now retries
- **Fixed**: "Summarize with AI" in a doc was hidden by the Files tidy-up; the TL;DR box now hides only while the doc is empty
- **Phones**: no live cursors on phones (no pointer); the Summarize fix applies there too

## v0.17.14

- **Clearer about where your work lives**: TribeCode no longer says it "runs on one friend's computer". Your tribe's code lives in your shared GitHub repo; someone can host the tribe on their own computer or a server to make it quicker. Updated in Flint's welcome, Home, New project, the phone drawer, the demo, the website and the docs
- **Flint's welcome**: the hello facts are bigger, plain lines with no boxes
- **Phones**: the same wording in the phone drawer and New project; the welcome's facts scale down on small screens

## v0.17.13

- **Phone apps planned**: docs/PHONE-APPS.md lays out the Android APK (first), push notifications, then the iPhone app via TestFlight, built from the same app with Tauri
- **Phones**: Files shows one emoji tab row (Notes · Code · Docs · Website · Captures) instead of two switches

## v0.17.12

- **Rail**: the "up 0m" uptime line at the bottom of the rail is gone (desktop)
- **Phones**: the uptime and commits line stays in the drawer's footer

## v0.17.11

- **Rail**: the divider under the flame lines up with the top bar's bottom edge, and the project squares sit just below it, a little bigger (44px)
- **Phones**: unchanged (the rail is desktop-only)

## v0.17.10

- **Updates apply by themselves**: when the server updates while TribeCode is open, the page now reloads into the new version on its own (it waits if you're mid-sentence), instead of asking you to click Reload. Your work is saved first
- **One set of window buttons**: in a browser or Edge app window (like the Working version), TribeCode no longer draws its own traffic lights next to the window's real ones; the desktop app keeps them
- **Phones**: updates apply the same way on phones

## v0.17.9

- **Flint's flame is a button**: click the flame in the Ask Flint bar for a small menu: What's new?, Take a note, Make a task, What did we decide?, Show me around, What can Flint do?, and Pick Flint's brain
- **Getting started, tucked away**: in Messages it's a slim bar now. Open shows the card as a pop-out over the chat (invite link, roles, notes, Start the flow) instead of pushing your messages down; it opens by itself right after you create a project
- **Rail**: tighter, like Discord: 40px rounded squares, 8px apart; the idling flame is back at the top (Home), level with the TribeCode wordmark in the top bar
- **Messages**: the composer runs nearly edge to edge and the avatars line up with its + button
- **Window buttons**: minimize (yellow) now sits before maximize (green); your avatar's online dot sits on its edge; the bell, friends and settings icons are evenly spaced and the bell's count sits on its corner
- **Home panel**: no "Your home" card (you're in the bar at the bottom left)
- **Phones**: the friend's "You're in" card on a phone is unchanged; the Flint menu works there too

## v0.17.7

- **Project menu**: Workshop now has a row in the project menu (the circle rail stays as it was)
- **Fixed**: the Quick start tile on Home showed an empty box for projects with an emoji face
- **Phones**: unchanged (the drawer still lists your projects)

## v0.17.5

- **Cleaner updates**: "Restart to update" now installs the same per-user Windows installer as the Download button, so it updates the app in place instead of adding a second copy. The first time, it removes any older copy that came from the .msi (Windows may ask once, since that copy was installed for all users)
- **Complete releases only**: a release goes live only after the Windows, macOS and Linux builds all finish, so the updater never sees a release without your platform (v0.15.0 to v0.17.4 sometimes lacked Windows). Builds retry when a download from GitHub fails
- **Phones**: no change (the web app updates itself on reload)

## v0.17.4

- **Top bar**: the flame and the wordmark sit closer together, the flame a little bigger; the Hosting pill is a rounded rectangle
- Everything from v0.17.3 (its installers didn't build because of a temporary download error on the build servers)
- **Phones**: no change on phones (the top-bar logo is desktop-only)

## v0.17.3

- **Files, tidied**: one emoji tab row (📝 Notes · 💻 Code · 📚 Docs · 🌐 Website · 📎 Captures) instead of two rows of tabs. Files opens on a drive-like grid: each file gets a type chip (DOC, CSV, </>, PDF, IMG) and a thumbnail (the start of the page, the code, or its first picture), with the pinned repo as a strip on top and app screenshots below. In a doc, the side panel starts hidden
- **Top bar**: the idling pixel flame now sits next to the TribeCode wordmark; the rail's top slot is Home, drawn as the camp ⛺
- **Camp setup**: the Dashboard's setup card is called Camp setup, says what the four steps are for, and shows "2 of 4 done"
- **Right panel**: no more "In the room" people list on desktop; it starts with Next steps
- **Fewer test projects**: a project can be hidden (it keeps its data); the built-in first project can fold away once you work in another
- **First-run fixes** (QA pass): after a reload a friend no longer loses the "You're in" card or agent updates; a cloudflared error is no longer mistaken for the invite address; projects with existing code keep their Repo tab; emoji-only names get proper avatars; double clicks don't make two channels or docs; channel names work in any language; Flint says where your words go; "your AI" and "Files" wording throughout
- **Website**: the top bar lists Features, Pricing, Mission and Docs (Download, Star and the Guide live elsewhere); new phone art (the phone beams to the computer); the corner fire is off for now
- **Phones**: Files keeps its Notes · Code · Docs switch and the phone hub; no Ctrl K hint; right-to-left messages read from the right; the "You're in" card shows reliably after a reload

## v0.17.2

- **Safer media links**: pictures, voice notes, screenshots and downloads load through short-lived signed links (about an hour, one file each, read-only) instead of carrying your sign-in key. Signing a device out turns its links off
- **GitHub**: a friend's "Connect GitHub" uses their own token. The host's GitHub account is used only by the host and admins, or after the host approves it for a project
- **Checked outside code**: the in-browser AI model and the 3D viewer's three.js are checked against pinned fingerprints before they run, and the AI model runs in a worker that can't see your sign-in key
- **Stays in its project**: huddles, captions and typing indicators reach only people who can see that project; agents can only check approvals in their own projects. Admins and mods can change the tribe's look
- **Downloads and devices**: the automatic cloudflared download is checked against Cloudflare's published checksum. Device links can have an end date, turn off after 90 days unused, and show when they were last used, with Revoke in Settings › Devices
- **Desktop app**: a strict content security policy, and only the app's own page can call into the app (the Working version needs `Start-Working.bat` run once)
- **App top bar**: the pixel TribeCode wordmark sits at the start of the top bar and goes Home
- **Phones**: the top-bar wordmark stays desktop-only (phones keep their compact header); Settings › Devices with end dates and Revoke fits the phone

## v0.17.1

- **Flint's welcome**: "Open in your browser" on the website now starts with Flint. He helps you make a pretend tribe (kind, emoji, name), shows four things you'll find inside, then asks how you want to see it: the 3-minute auto demo, exploring on your own, or starting your real tribe. The name you pick carries into the demo
- **Desktop installers fixed**: the Windows and Linux builds had been failing since v0.15.0 because the app's files were being flattened into one folder (two files had the same name). The app's folder is now copied as is
- **Website**: a bigger logo and wordmark in the top bar (the menu folds into ☰ a little earlier so it never overflows), and the "Small apps that help" gallery is gone from the Mission page
- **Phones**: Flint's welcome is a full-screen card with the buttons pinned to the bottom; the site's top bar uses a smaller lockup

## v0.17.0

- **Paste a link, get notes**: paste a link in chat, use Files › Captures, + › Read a link, or ask Flint to "summarize <url>". The host reads the page safely, pulls out the article and writes a quick summary with key points, action items, decisions and tags, no AI needed. Each capture is saved in Files › Captures and shows as a card in chat with Make tasks
- **Video and social links**: YouTube, TikTok, Instagram, Threads, Facebook and Vimeo get official embed cards; captions and local transcripts are optional extras the host can add in Settings › Packs
- **Voice notes like Notion**: record from Files › Captures or + › Voice note to notes, with pause and a live transcript, then Summary · Key points · Action items · Decisions · Full transcript, all editable. Templates for meetings, ideas, playtests, interviews and lectures. Any chat voice note can become notes, and captioned huddles are saved too
- **Smarter over time**: an optional plain-words rewrite with your AI, a summarizer that learns from what your tribe keeps and deletes, agent tools to read and search captures, and Flint answering "what did we decide about X?" with the quote
- **Packs**: a small download manager in Settings for optional tools, with sizes shown first and checksums checked
- **Phones**: the Captures list, notes, chat cards and recorder fit the phone; Files gets a 📎 Captures section with Record

## v0.16.1

- **Security**: "only from this computer" actions now accept only TribeCode's own page and the desktop app, so a project's preview, a file:// page or another program on your computer can't create invites or agent keys or turn on sharing. Spectators, agents and muted members can't post through the live connection, and an expired guest's agents stop with the guest. Rate limits behind tunnels apply per visitor. ntfy phone pings are off until you set them up. Backups no longer include sign-in client secrets. Approvals stay inside their project, network addresses are hidden from visitors, and other sites can't frame the app
- **Honest promises**: a new SECURITY.md and a Security & privacy section on the site and README; "no cloud", Flint privacy and tunnel wording now match what the app really does
- **Website**: click into the app window's areas (Dashboard, Files, Task Board, Agents Hub…), a Start from something section, and Flint as a small guide in the corner
- **Phones**: the same security fixes apply to phone links and device pages

## v0.16.0

- **New wordmark**: chunky pixel lettering, white "Tribe" and Ember "Code" with darker shades and a dark outline, so it reads on every theme. It's in the app, the website, the README and the installers
- **Setup in 4 steps**: ✨ Write the vision · 📝 Add a first task · 🤖 Connect your AI · 🌿 Create the repo. Create the repo is one click (a folder, a README, the vision and a first commit), with an optional "Also put it on GitHub?"
- **Vision in two moves**: pick a category (Game, App, Website, Tool, Bot or Something else) and write the gist in a line. A draft fills in as you type, no AI needed; "Improve with Flint or your AI" is optional
- **Shape it, optional**: small role cards for the artist (pick a palette), the engineer (pick an engine or stack), the designer (core loop) and the writer (tagline). Each adds two starter tasks
- **Make the starter**: one click copies a starter game, 3D scene or site into the repo, applies your palette and opens the Preview
- **Simpler Task Board**: task types (Build · Fix · Design · Write · Research) and a "Who?" row on each card: Me, a friend, an agent or Flint. Extra tabs and + Add appear once the project has started
- **Edit the header in place**: click the name, the picture (24 emoji or upload) or the description
- **Inspiration cards**: a colored strip (palettes show their swatches), bold titles and "Make it a task" at the bottom right
- **Phones**: the category chips wrap, role cards sit two per row, and the Who? buttons wrap under each task

## v0.15.0

- **Whiteboard**: a shared, persistent board per project, added from + Add. Draw, add shapes, text and sticky notes, paste pictures, and see everyone's changes and cursors live. Undo is your own; spectators can look; mods can clear. Export PNG or SVG, or send it to Files. Agents can read the board and add sticky notes, and Flint opens it
- **A guided 3-minute tour**: the demo tribe now plays a tour of the real app. Named cursors click real buttons and type into real boxes across 15 chapters: setup, vision, files, chat, the Task Board, the Agents Hub, Flint, a game playing in the Preview, a doc written live, the website builder, a vote that ships a milestone, + Add, and approving from your phone. A chapter bar has Pause, Skip, 2×, Try it yourself and Leave
- **Pixel-art illustrations**: the campfire scenes and the app's pictures are redrawn in the logo's pixel style, with a gently flickering fire, rising embers, twinkling stars and a blinking robot. They stay still with reduced motion
- **Room panel**: Helpers show once a project has started; small text in the panel is now at least 13px
- **Phones**: a 90-second tour with touch dots; the whiteboard draws with one finger and zooms with two

## v0.14.0

- **Chat channels**: the "# general" menu creates and switches channels (emoji, topic, archive), with DMs below. The header is compact with an emoji, the hover highlight spans the whole line, and there's a 📌 Pinned panel
- **Richer messages**: links work, pictures show as a grid with a viewer, link previews (fetched safely by the host), click-to-load YouTube and Vimeo, GIFs (search with a GIPHY key, or your own), backgrounds per channel, and a bigger emoji picker with search, categories, frequent emoji and skin tones
- **Profiles**: pick an avatar (initials, emoji, 24 pixel critters or a photo), a name color that stays readable, pronouns, an About me, a banner, links and a custom status. Presence includes idle, do not disturb and invisible. Click any name for a profile card, and keep private notes or mute someone just for you
- **Roles**: Admin and 🛡️ Mod, with Settings › Roles & privileges to choose what each role can do. Mods can remove messages, mute people and triage. Everything is logged
- **Customize**: tribe accent, backgrounds, spacing and font size; a Dashboard cover (color, pattern, picture or your GitHub repo's preview); per-project themes
- **Website, designed for you**: six editorial layouts filled from your project (story, devlog, roadmap, team, screenshots), with Shuffle, Regenerate and an optional "Write it for me" from your AI or a local Qwen model
- **Files · Code · Docs**: code projects get a folder tree, a branch picker, a code viewer and one list of docs
- **Agents Hub dashboard**: big cards that only show when they matter (agents working, Needs you, who owns what, #agents, today), plus a + to pin extra tabs
- **Simpler start**: the right panel shows big Next steps cards while a project is new, and Flint can do setup steps and take you to any place. The top breadcrumb is gone on desktop. Add context (drop docs) sits right under Set up
- **Phones**: channels, pickers and profile cards open as sheets; the Code view drills down; the Agents dashboard and Customize stack cleanly at 390px

## v0.13.0

- **Set up comes first**: a new project opens with one big "Set up" card. Each step has its own card with a big emoji, one line of help and its buttons, and the next step is highlighted. The Living update appears once the tribe has started (a vision, a task or a friend)
- **Cleaner project header**: a bigger picture and name, a quiet "Add a short description", plain details, and a bigger Invite button
- **Meet Flint**: the first time you click into Ask Flint, a short dimmed guide shows what he does (questions, notes, tasks, asking back), how he learns, and three things to try. Skip any time
- **TribeCode MCP page**: "Use TribeCode inside your tools" lists 15 clients, including VS Code, Windsurf, Zed, Cline, Goose, Continue, and Claude.ai and ChatGPT through your public link, each with a one-tap Connect, plus a Connected tab to remove keys
- **Apps on this computer**: the host can open ArtCraft from TribeCode and watch its export folder, so new renders land in Files with a 🎨 note in chat. "Add a special connection" works for any app
- **Phones**: the Set up cards stack with full-width buttons, Flint's guide fits the screen, and the MCP page is one column

## v0.12.0

- **TribeCode senses what you're making**: it reads the name, bio, vision, repo, tasks and chat, and works out whether it's a game, app, website, tool, bot, API or notes. It keeps updating as people talk. Preview follows it ("Preview site", "Preview game"…), and the host can correct it with "This is a: game · app · site · …"
- **💡 Inspiration**: a small card on the Dashboard with ideas that fit the project: a flat palette, feature ideas, a reference to look at, and a starter task. Use More for others, "Make it a task" to add one, or × to hide it. When the chat settles on something new (say, multiplayer), Flint drops one quiet note with ideas, at most once every few hours, and you can turn that off per project. A brain makes it smarter but is never required
- **+ Add is a gallery now**: search, add a link or pin a doc, tinted "Built into TribeCode" cards with a small preview of each, and starter packs (Game jam, Ship a site, Weekly crew) that add a few at once
- **Bigger top-left logo**: the mark fills its own slate tile, flickers once and grows a touch on hover
- **Flint's spotlight**: whatever Flint points at stays bright while the rest of the screen dims a little
- **Phones**: the Inspiration card shows 2 ideas with the same buttons, and + Add opens as a full-screen sheet

## v0.11.0

- **Bring any coding agent**: Claude Code no longer has to be the only option. Agents Hub › Your agents has one-tap cards for Codex CLI, Gemini CLI, Qwen Code, Cursor, Claude Desktop and any MCP client, as well as Claude Code. Each card makes a key, shows the exact config with Copy, and switches live to "Connected · Maya's Codex". "Connect your Claude Code" is now "Connect your AI" 🔌
- **Give Flint a brain, any brain**: Settings › Flint's brain offers four choices. Built in runs a small Qwen model inside your browser (WebGPU, downloaded only if you pick it). Ollama runs on the host. Cloud uses your own OpenAI, Anthropic, Gemini, OpenRouter, Groq or OpenAI-compatible key. Or pick None. Every Flint feature (Ask, vision help, task ideas, TL;DRs, huddle notes, standups) follows the choice, and each reply says which model it came from
- **Keys stay on the host**: a cloud key lives only on the host's computer, never in any browser. Friends can borrow it through the host if the host allows it, with a daily cap per friend
- **No AI? Ask an agent**: from the composer's + menu, a task card, or Requests, anyone can hand a job to whichever agent is connected. The agent picks it up and the chat shows who took it
- **Phones**: Connect your AI and Flint's brain fit on a phone, and Ask an agent is in the + menu

## v0.10.9

- **One look everywhere**: the app icon (taskbar, dock, installers, home screen, the website and the in-app logo) now sits on the Campfire grey slate instead of navy, so it matches the app around it
- **Preview follows what you're making**: the Preview button says Preview game, Preview 3D scene, Preview app, Preview site or Try the tool, with a matching emoji (🎮 🧊 📱 🌐 🛠️), sensed from the project
- **Project emoji fill their tile**: a project's emoji is now centred and big on a soft tint of its color, with no frame, instead of a small glyph near the top
- **Gentle emoji**: 🤖 by Your agents, and the onboarding checklist gets ✨ vision, 📝 first task, 👋 a friend, 🤖 Claude Code, 🌿 repo (faded once done) and 🎉 when all set
- **Phones**: the same slate icon on the home screen, the filled emoji faces, and the new Preview labels

## v0.10.8

- **Calmer color**: bright orange is now the brand (the logo, Flint, thin "you are here" markers), not every button. Main actions use a deeper burnt rust, which is also easier to read (white on it is 4.9:1, up from 3.05:1). Repeated actions in lists are soft tinted buttons in colors that mean something: indigo for people ("Take it"), teal for agents ("Give to Claude"). Counts and badges are quieter, and links use a warm rust
- **Small pops of color**: a few flat emoji where they help. ✋ Take it, ✨ Give to Claude, 👋 Invite friends, 🎮 Preview game, and 📝 Tasks, 🐞 Bug inbox, 🗳️ Approval board, 🗓️ Calendar and 🌿 Repo by their titles. Gentle, not everywhere
- **Phones**: the same calmer buttons, the ✋ on Take it, and the rust Send button

## v0.10.7

- **Watch a demo tribe**: one tap from the website ("Watch a demo tribe"), the demo page or the app, and "Campfire Crew" plays out the whole workflow by itself in your browser. It has two projects, four friends, Claudes and Flint, a vision, a board, docs, a milestone and a vote. Every few seconds something happens: friends chat, an agent claims a task and the logo flickers, a progress note and a commit land, tasks move Doing → Review → Done, approvals reach your inbox, the vote passes and the milestone fills, then a "v0.2 shipped 🎉" card, and a new season starts. A small pill has Pause, 2×, Restart, Explore quietly and Leave (your real setup comes back exactly). The "Try a demo tribe" entries now offer "Watch it come alive" or "Explore quietly"
- **Phones**: the showcase plays in Chat and on Tasks, with the pill above the rack

## v0.10.6

- **Meet Flint, for real**: Flint is now the logo's own flame, flickering, with two black pixel eyes that blink now and then (the logo itself stays a solid flame). His face is in his chat bar, his replies, the Helpers row, the ? menu and the phone Talk to… row
- **Flint shows you around**: he flies across the screen to what he's explaining, rings it in Ember, says it in a short bubble and leaves a trail of rising pixel embers. A 30-second first-run tour (offered once; replay it from ? › Take the tour with Flint) covers your project's places, invites, connecting your AI, + Add, Ask Flint and the ? menu. Ask him to "open files" and he flies to the Files row first. With reduced motion on he jumps instead, with no embers
- **Fresh screenshots everywhere**: every README and site image was redone from a seeded tribe in the Campfire theme, with new ones for the Dashboard, Files, the doc editor, Flint, the vision helper, the offline demo and phone Messages. The README and Guide use today's names. `npm run dev:shots` regenerates them all
- **Phones**: Flint's own short tour (the rack, switching projects, the bell)

## v0.10.5

- **Try a demo tribe, offline**: from Home, the projects list, the ? menu or Settings, start a pretend tribe that lives only on this device. No host, no network, nothing leaves it. You're the host of "Demo Tribe" with a game project, two pretend friends and a pretend Claude, who answers @claude and picks up the tasks you make. Chat, tasks, docs (with live editing), notes, files, the vision and suggested tasks all work. An invite makes a pretend link, and a pretend friend joins. A small "Offline demo" pill has Reset and Leave; leaving puts your real setup back exactly. It keeps working in airplane mode after the first visit
- **Works offline properly**: the app's offline cache now holds every file the app loads (40 were missing)
- **Fix**: on Home, the right panel's headings no longer draw on top of each other
- **Phones**: the demo starts from the projects sheet too, and its pill floats above the rack

## v0.10.4

- **A clearer project sidebar**: **Dashboard · Messages · Files · Task Board · Agents Hub**, then **Website** once the site is built and any widgets you've added. **+ Add** sits below the Repo row in a bordered button and adds sections for the whole tribe: Calendar, Bugs, Proposals & Board, Milestones, Repo, Visuals, Workshop, Daily plan, Secretary, or a custom link or pinned doc. Remove one from its ⋯, or drag to re-order
- **Preview game / Preview app** has its own button at the bottom of the sidebar, above Invite friends, whenever the project has something to run
- **A calmer room panel**: bigger text (13px and up), one line per person with a dot for online and a "host" pill, Helpers folded into one row of pills, "Connect your Claude Code" only until it's connected, a slim "Start a note", and Flint's suggestions in one scrolling row
- **Website**: a typing line in pixel type next to the logo, very subtle pixel stars in the background
- **Phones**: the same rows in the side panel, with + Add as a sheet and the Preview button at the bottom

## v0.10.3

- **The website is the front page**, and it's ready for **tribecode.org**. The web app moved to **/app/**, one tap away from every page: an "Open the app" button in the bar, "Open in your browser" next to Download, and a "Welcome back. Continue to your tribe" strip for anyone who's used it before. Old links keep working: friend invite links, the demo, /about/, bookmarks to the app, and Home Screen installs (they open straight into the app)
- **A typing line in the hero**: next to the flickering logo, things people ask their tribe type themselves out one after another ("make a website for my game and invite my friends", "connect my Claude and fix the jump physics", "host our tribe from my laptop"…)
- **Friend links** now point at tribecode.org/app/go.html once the domain answers (a fork keeps its github.io address)
- **Phones**: on the site, "Open the app" is the first, biggest button and stays in the top bar; the desktop download comes second

## v0.10.2

- **Write the vision with help**: the checklist's Write button opens a composer. Five short prompts come pre-filled with good guesses from the project's name, bio, README and template (what it is, who it's for, what makes it fun, done for v1, out of scope). Then **Draft with** Flint (on this computer: the local model if it's on, or a solid draft from your answers), **My Claude** (asks your Claude in your private chat; the reply fills the editor, with the logo flickering while it works) or another connected model. Small suggestion chips appear while you type ("Name a first milestone", "Say what's out of scope"). Save writes VISION.md as before
- **Suggested tasks under New task**: 3–5 ideas from the vision's "Done for v1", the repo (no README, no tests, TODOs), recent chat ("we should…") and the project type. Tap to add one, ✕ to dismiss (remembered), More ideas for another batch. They never repeat a task you already have
- **Phones**: the same suggestions in the New task sheet and under Up next on Tasks, and the vision composer full screen

## v0.10.1

- **The ? help** sits left of the window buttons
- **Phones**: the new pixel logo sits beside "TribeCode ⌄" in Home's top bar, and flickers while something is working, like the desktop logo

## v0.10.0

- **The logo comes alive**: the pixel flame flickers, a pixel at the tip and the tongues, still solid orange. The top-left logo flickers whenever something is working (a prompt in flight to Flint, Ask AI, the Secretary or the local model, or an agent in the room at work in the last 20 seconds) and rests otherwise. Hover it to see what's working. Every "Loading…" gets the little flame
- **On the website**: the flickering logo is in the nav, above the headline, in the download block and the footer (GIFs drawn on the site's background), and the browser tab icon flickers too. Reduced-motion settings show the still logo
- **Phones**: "Loading…" spots get the flame too

## v0.9.9

- **A new logo everywhere**: a solid orange pixel-art flame between two white pixel brackets, on deep navy. It's the app icon (Windows, Mac, Linux), the installer art, the top-left logo, the browser tab icon, the phone Home Screen icon, the invite and sign-in pages, the website, the README and the infographic. It's drawn on a pixel grid (scripts/icon.js) so it stays crisp at every size, and the app shows it as a vector
- **Phones**: the Home Screen icon and the project picture fallback use the new logo

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
