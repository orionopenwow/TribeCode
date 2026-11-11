# Navigation

Where every button goes, and the one router that keeps it continuous on desktop and phones. Code: `app/ui/router.js` (where you are, history, dead ends, stale panes), `app/ui/shell.js` (the destination registry `DEST`, the sidebar, tabs, breadcrumbs, palette), `app/ui/hub.js` (Home, All files, All code), `app/ui/app.js` (project views). Test: `app/test/e2e_nav.py`.

## Two places

| Place | What is on screen | Sidebar |
| --- | --- | --- |
| **Global** (your dashboard) | Home (updates), All files, All code, Work, Agent fleet | The global rows: Home · All files · All code · Work · Agent fleet |
| **Project** (inside a tribe) | Dashboard, Messages, Files, Design, Task Board (tabs), Agents Hub (tabs), Company… | The project's rows, under its header |

`TribeRouter.where()` says which: `{ place: 'global', section: 'home' | 'docs' | 'repos' | 'work' | 'fleet', key }` or `{ place: 'project', project, view, key }`. The global sections only change the main pane; they never draw the project nest. With no tribe on the device, a project place is never shown: Home opens with a toast that says what to do.

## Route table

| Entry point | Goes to | Place | Hash |
| --- | --- | --- | --- |
| Rail: logo (`#rail-logo`) | Home (your updates dashboard), closing Workshop/Guide/menus | global | `#/hub` |
| Rail: tribe circles (`#pj-rail [data-pj-open]`) | That project's Dashboard (`TribeProjects.switchTo(id, 'home')`) | project | none |
| Rail: right-click a circle | Open dashboard · Messages · Pin · Invite · Project settings · Customize | project | |
| Rail: `+` (`#pj-plus`) | Create / join a project sheet (always has a close X; Esc closes) | sheet | |
| Rail: Workshop (`#rail-workshop`, wrench) | Workshop layer over the current place (toggle) | layer | `#/workshop` |
| Global: Home (`#nest-hub`) | `TribeHub.open('home')` | global | `#/hub` |
| Global: All files (`#nest-docs-all`) | `TribeHub.open('docs')` | global | `#/hub/docs` |
| Global: All code (`#nest-repos-all`) | `TribeHub.open('repos')` | global | `#/hub/repos` |
| Global: Work (`#nest-work`) | `TribeTalent.open()`; with no tribe, its empty state (Start your first project · Join with a link · Back to Home) | global | `#/hub/work` |
| Global: Agent fleet (`#nest-fleet`) | `TribeAgentsHub.open({ global: true })` | global | `#/fleet` |
| Project: Dashboard (`#nest-overview`) | `App.show('home')` | project | |
| Project: Messages (`#nest-chat`), streams | `App.show('chat')`, DMs, channels | project | |
| Project: Files (`#nest-docs`) | Files tabs: Notes · Code · Docs · Website · Captures · Academy | project | `#/docs/<tab>` |
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
| Deep links | `#/hub`, `#/hub/docs`, `#/hub/repos`, `#/hub/work`, `#/fleet`, `#/tasks/<tab>`, `#/agents/<tab>`, `#/docs/<tab>`, `#/workshop`, `#/market`, `#/studios` | | |

## Rules the router keeps

- **One way in.** Sidebar rows, tabs, breadcrumbs, the palette and Back all end in `TribeShell.go(key)` (or a module's `open()` that it calls). `TribeShell.go` asks the router first, so a project place asked for with no tribe lands on Home instead of an empty page.
- **Back works.** Each settled move is one `history.pushState` entry carrying `{ tribeRoute }`, across projects too. Modules that rewrite only their hash (`replaceState(null, …)`) keep the route on the entry. Popstate restores the place (switching project first if needed) and closes Workshop, Guide and the profile menu. In the desktop app, Alt+← / Alt+→ and the mouse's back/forward buttons do the same.
- **Esc closes the top layer** (palette, popover, menu, sheet, modal, Workshop, Guide, preview), never the place underneath. Back moves between places.
- **No dead ends.** Every view keeps a visible way back: the logo (always Home), the sidebar rows, and on empty states a "Back to Home" button. The create/join sheet always has a close X.
- **No stale panes.** After every move exactly one `.main > section[id^="view-"]` is visible, and `body.global` matches the place, so a page from the previous dashboard can't stay mounted under the new one.
- **Active state.** The lit row is the destination on screen (`TribeShell.current()`): a global section lights its global row, a workspace tab lights its workspace row.
