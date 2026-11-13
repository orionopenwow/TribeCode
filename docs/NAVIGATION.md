# Navigation

Where every button goes, and the one router that keeps it continuous on desktop and phones. Code: `app/ui/router.js` (where you are, history, dead ends, stale panes), `app/ui/shell.js` (the destination registry `DEST`, the sidebar, tabs, breadcrumbs, palette), `app/ui/hub.js` (Home, Files, Design, Code), `app/ui/filesview.js` (the one Files dashboard, Home's and a project's), `app/ui/app.js` (project views). Test: `app/test/e2e_nav.py`.

## Two places

| Place | What is on screen | Sidebar |
| --- | --- | --- |
| **Global** (your dashboard) | Home (updates), Files, Design, Code, Work, Agent fleet | The rows, no heading: Home · Files · Design · Code · Work · Agent fleet |
| **Project** (inside a tribe) | Dashboard, Messages, Files, Design, Task Board (tabs), Agents Hub (tabs), Company… | The project's rows, under its header |

`TribeRouter.where()` says which (or `{ place: 'workshop' }` while the Workshop is on screen): `{ place: 'global', section: 'home' | 'docs' | 'design' | 'repos' | 'work' | 'fleet', key }` or `{ place: 'project', project, view, key }`. The global sections only change the main pane; they never draw the project nest. With no tribe on the device, a project place is never shown: Home opens with a toast that says what to do.

## Route table

| Entry point | Goes to | Place | Hash |
| --- | --- | --- | --- |
| Rail: logo (`#rail-logo`) | Home (your updates dashboard), closing Workshop/Guide/menus | global | `#/hub` |
| Rail: tribe circles (`#pj-rail [data-pj-open]`) | That project's Dashboard (`TribeProjects.switchTo(id, 'home')`) | project | none |
| Rail: right-click a circle | Open dashboard · Messages · Pin · Invite · Project settings · Customize | project | |
| Rail: `+` (`#pj-plus`) | Create / join a project sheet (always has a close X; Esc closes) | sheet | |
| Rail: Workshop (`#rail-workshop`, wrench) | The Workshop and its Marketplace in the main area (the rail and sidebar stay); the wrench is lit like a tribe; Back leaves. Its content renders into `TribeWorkshop.container()` | workshop | `#/workshop` |
| Global: Home (`#nest-hub`) | `TribeHub.open('home')` | global | `#/hub` |
| Global: Files (`#nest-docs-all`, key `docs-all` kept) | `TribeHub.open('docs')`: your files everywhere, Where = Mine · Everything · each tribe | global | `#/hub/docs` |
| Global: Design (`#nest-design-all`) | `TribeHub.open('design')`: every canvas and whiteboard, on this device and in your tribes | global | `#/hub/design` |
| Global: Code (`#nest-repos-all`, key `repos-all` kept) | `TribeHub.open('repos')`: the repos you're in, then your code files | global | `#/hub/repos` |
| Global: Work (`#nest-work`) | `TribeTalent.open()`; with no tribe, its empty state (Start your first project · Join with a link · Back to Home) | global | `#/hub/work` |
| Global: Agent fleet (`#nest-fleet`) | `TribeAgentsHub.open({ global: true })` | global | `#/fleet` |
| Project: Dashboard (`#nest-overview`) | `App.show('home')` | project | |
| Project: Messages (`#nest-chat`), streams | `App.show('chat')`, DMs, channels | project | |
| Project: Files (`#nest-docs`) | Files tabs (stroke icons): Files · Code · Docs · Website · Captures · Academy; the Files tab is the shared Files dashboard | project | `#/docs/<tab>` |
| Project: Design (`#nest-canvas`) | The design canvas | project | |
| Project: Task Board (`#nest-ws-tasks`) | Last tab: Board · Bugs · Proposals · Milestones · Calendar · Code repository · Visuals (· Roles · Requests) | project | `#/tasks/<tab>` |
| Project: Agents Hub (`#nest-ws-agents`) | Dashboard + pinned tabs (Your agents, MCP, Ownership, Conflicts, Hand-offs, Reviews, Daily plan, Secretary) | project | `#/agents/<tab>` |
| Project: Code row (`#pin-repo`) | `App.show('repo')` | project | |
| Breadcrumb (`#crumb-section`) | The same rows as the sidebar, then each workspace's tabs | either | |
| Switcher (`#side-switch`, `#ws-name`) | Tribe Home, project views, pinned/rooms/personal projects, Workshop, scratchpad, new, join | either | |
| User bar (`#userbar`) | Profile menu (`#pf-btn`), bell, Friends, Settings gear | menu | |
| Profile menu | Profile, status, Personalize, Connect your AI, Your agents, Invite, Notifications, Settings, Guide, updates, **Switch account**, **Add account / Log in**, **Log out** | menu | |
| Palette (Ctrl K) | Every `DEST` entry once, through `TribeShell.go(key)`; Marketplace (wrench) | either | |
| Phone Home rack | Home · Messages · Files · Agents · Projects sheet | global | as above |
| Phone project rack | Home · Chat · Docs · Updates · Tasks | project | |
| Phone side panel (`#menu-btn`, swipe) | The same sidebar rows | either | |
| Deep links | `#/hub`, `#/hub/docs`, `#/hub/design`, `#/hub/repos`, `#/hub/work`, `#/fleet`, `#/tasks/<tab>`, `#/agents/<tab>`, `#/docs/<tab>`, `#/workshop`, `#/market`, `#/studios` | | |

## Rules the router keeps

- **One way in.** Sidebar rows, tabs, breadcrumbs, the palette and Back all end in `TribeShell.go(key)` (or a module's `open()` that it calls). `TribeShell.go` asks the router first, so a project place asked for with no tribe lands on Home instead of an empty page.
- **Back works.** Each settled move is one `history.pushState` entry carrying `{ tribeRoute }`, across projects too. Modules that rewrite only their hash (`replaceState(null, …)`) keep the route on the entry. Popstate restores the place (switching project first if needed) and closes Workshop, Guide and the profile menu. In the desktop app, Alt+← / Alt+→ and the mouse's back/forward buttons do the same.
- **Esc closes the top layer** (palette, popover, menu, sheet, modal, Workshop, Guide, preview), never the place underneath. Back moves between places.
- **No dead ends.** Every view keeps a visible way back: the logo (always Home), the sidebar rows, and on empty states a "Back to Home" button. The create/join sheet always has a close X.
- **No stale panes.** After every move exactly one `.main > section[id^="view-"]` is visible, and `body.global` matches the place, so a page from the previous dashboard can't stay mounted under the new one.
- **Home is obvious.** On any global page the rail logo is lit (`#rail-logo.on`, `aria-current="page"`: a pressed tile plus the Ember pill on the rail's left edge, the same as an open tribe; `app/ui/rail.css`), the sidebar starts straight with the rows (the "Your Dashboard" heading was removed in v0.31.2), each page starts with a "Home ›" breadcrumb (`.hub-crumb`, and `#crumb-home` in the title bar), and Home's top card is a band across the whole content area.
- **Active state.** The lit row is the destination on screen (`TribeShell.current()`): a global section lights its global row, a workspace tab lights its workspace row.
- **Your own order.** The rail (projects and the wrench, under the Home logo) and the sidebar rows (Home's and each project's) can be dragged into a new order, or moved with Alt+↑ / Alt+↓ on a focused item (`app/ui/reorder.js`). Saved per person (localStorage, and the member's prefs on the server), per tribe for the rail and Home, per project for a project's rows; new items join the end. Reset: right-click › Reset order, or Settings › Sidebar order.
