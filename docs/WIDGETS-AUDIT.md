# Widgets audit (feat/widgets-v2, 2026-11-12)

What the "+ Add" picker offered before this pass, checked one widget at a time in a project and on Home: does it render, does every control work, does it update live, does it survive a reload, is it readable at 390px, does it follow the design tokens and icons. Then the fixes, and the widgets this pass added.

Code: `app/ui/widgets.js` (the list, the rows, the picker, the ⋯ menu), `app/ui/wcards.js` + `wcards.css` (the live cards), `server/widgets.js` (lists and the cards' own state), `app/ui/reorder.js` (moving rows and cards). Test: `app/test/e2e_widgets_v2.py` (plus `e2e_sidebar_widgets.py`, `e2e_whiteboard.py`, `e2e_market.py`, `e2e_company_widget.py`, `e2e_shell_polish.py`, all passing).

## 1. What was there

Every built-in widget was a sidebar row that opens an existing view. It rendered, reached teammates live (the `widgets` socket message) and survived a reload. The problems were shared ones, listed once under "All built-in rows".

| widget | works? | issues | fix |
| --- | --- | --- | --- |
| All built-in rows (below) | Yes | The ⋯ menu only had Remove (no Open, no Move up/down). Two drag systems fought each other: widgets.js's HTML5 drag saved the tribe's order, while reorder.js's pointer drag saved a per-person order in localStorage that it re-applied over the tribe's. No keyboard way to move a row for everyone. | One menu: Open, Settings (links and docs), Move up/down, Remove; arrow keys walk it, Esc closes it and gives focus back. The HTML5 drag is gone: reorder.js drives rows and cards and hands the result to widgets.js, which saves the tribe's order (`shared` lists). Only the host and builders can move them. |
| Whiteboard | Yes | The picker's mini drawing used raw hex colors. | Colors from `var(--live)`, `var(--peer)`, `var(--accent)`, `var(--text)`, `var(--canvas)`. |
| Calendar | Yes | Shared issues only. | Shared fixes. |
| Bugs | Yes | Shared issues only. | Shared fixes. |
| Proposals & Board | Yes | Shared issues only. | Shared fixes. |
| Milestones | Yes | Only a link; nothing showed progress. | Shared fixes, plus the new Milestones timeline card. |
| Code repository | Yes | Shared issues only. | Shared fixes, plus the new Ship & sync card. |
| Visuals & screenshots | Yes | Shared issues only. | Shared fixes, plus the new Preview card. |
| Website | Yes | Correctly disabled in the picker once the Website row shows by itself. Status (draft or built, comments) was not visible anywhere in the sidebar. | The new Website status card. |
| Preview | Yes | Correctly disabled (Preview has its own row). | None needed. |
| Workshop | Yes | Shared issues only. | Shared fixes. |
| Daily plan | Yes | Shared issues only. | Shared fixes. |
| Secretary | Yes | Shared issues only. | Shared fixes. |
| Captures | Yes | Shared issues only. | Shared fixes. |
| Asset library | Yes | Shared issues only. | Shared fixes. |
| TribeCode MCP | Yes | Shared issues only. | Shared fixes. |
| Marketplace (built-in row) | Yes | Shared issues only. | Shared fixes. |
| A link (custom) | Partly | The row had no `id`, so reorder.js keyed it as `''` and could not move it. It could not be edited after adding: the only fix for a typo was to remove it and add it again. | Each link row gets an `id` (`wgr-<id>`). ⋯ › Settings edits the emoji, name and URL in place. |
| Pin a doc | Partly | Same as A link. | Same fix. |
| Marketplace link widgets (market.js) | Yes | The strip's "Added" tag didn't match the rest of the picker. It ignored categories. | "Added ✓", and it sits under the Links category. |
| The picker itself | Partly | No categories, no preview, no arrow keys or focus trap. Focus was lost on close. Raw `#fff`, `#000` and `#3a3a3a` in the CSS. Clicking a starter pack or a card closed it with no way to see what you were adding. | Categories (All · Team · Plan · Build · Notes · You · Views · Links), search across all of them, a preview pane (the widget's drawing, what it does, its own Add button, "Added ✓" or "Add another"), arrow keys over the cards and tabs, Tab kept inside, Esc closes and focus returns to + Add. Colors come from tokens. On phones it is a full-width sheet. |
| Home | No | No widgets at all: + Add only worked inside a project. | Home has its own widgets, personal to each member (`GET`/`PUT /api/widgets/home`). The same picker offers the 10 cards that make sense without a project, plus links. |

## 2. Widgets built in this pass (live cards)

Each one was checked against what already existed: none of these was in the picker before. Every card has the same shell: an icon, a title and a ⋯ menu (Settings when it has any, Refresh, Rename, Move up/down, Remove). Below that it shows real data, or a calm empty state with one action, or "Couldn't load this" with Retry. Every card has one width and one header height, text ellipsizes instead of clipping, and the body scrolls past 240px. Cards that write ask the server, and the server checks the role: host and builders edit, any member except spectators votes, and Home cards only answer to their owner. Shared state lives in `.tribe/widget-data.json` and is cleared when its card is removed.

| widget | works? | issues | fix (why it was built and where its data comes from) |
| --- | --- | --- | --- |
| My tasks | Yes | none open | Your open tasks, with Accept on the ones waiting for you (`/api/tasks`, `/tasks/:id/accept`). Live on `task`. |
| Who's here | Yes | none open | Who is online or away, and where (`/api/members`). Live on `presence`. Empty state: Invite friends. Also on Home. |
| Recent activity | Yes | none open | The latest changes from the hub feed (`/api/hub`), filtered to the project. Also on Home. |
| Team clocks | Yes | none open | Each member's local time from their profile's time zone. One button shares yours (`PATCH /api/profile { tz }`). Also on Home. |
| Poll | Yes | none open | A question with up to 4 choices. Tap to vote, tap again to undo. Saving a new question clears the votes. Shared, live. Spectators see it read-only. |
| Milestones timeline | Yes | none open | Each milestone with its version, title and progress bar (`/api/milestones` plus tasks). Live on `milestones` and `task`. |
| Next standup | Yes | none open | A countdown to the next ritual event (`/api/calendar/upcoming`). Empty state: Schedule one. |
| Countdown | Yes | none open | Days and hours to a named date. Asks for the date as soon as it is added. Shared. Also on Home. |
| Checklist | Yes | none open | A short shared list: add, tick, delete, Clear done, "n/m done". Shared, live. Also on Home. |
| Build status | Yes | none open | Build and preview passing or failing, from agents' `POST /api/dash/signal` and CI, read through `/api/dash/band` and `/api/dash/criticals`. Live on `dashband`. The dashboard band itself is unchanged. |
| Ship & sync | Yes | none open | Branch, saved count, unsaved changes, last ship and remote sync (`/api/ship`, which exists on this branch). Hides into "Set one up" when the project has no repo. |
| Preview | Yes | none open | The latest screenshot, else the README picture, else a tile (`/api/thumb?prefer=shot`). Clicking it opens the preview. |
| Website status | Yes | none open | Draft or built, open comments, and a button to the designer (`/api/projects/:id/website`). |
| Quick note | Yes | none open | A shared scratchpad. It saves 600ms after typing stops and on blur, and never overwrites text while someone is typing in it. Also on Home (private there). |
| Bookmarks | Yes | none open | Several links in one card. Paste a link to add it; it opens in a new tab. Shared. Also on Home. |
| Quick docs | Yes | none open | The six latest docs, sheets and decks (`/api/docs`, or `/api/hub/docs` on Home). Clicking one opens it in the preview. |
| Inspiration strip | Yes | none open | Up to 8 pictures from the project's inspiration board (`/api/inspo`). Clicking one opens the board. |
| Flint tip | Yes | none open | One tip a day about a real feature, with Try it and Next tip. Also on Home. |
| Plan & credits | Yes | none open | Your plan and AI credits from `TribePremium` (0 until payments open, which it says), and See plans. Also on Home. |
| Music / ambient player | Not built | There are no licensed sound assets in `app/ui/assets` to play. | Skipped on purpose. Build it once the tribe has openly licensed audio, for example from the inspiration board's sound search. |

Every one of these is a real card with live data or real shared state. None shows fake data.

## 3. How it's tested

`app/test/e2e_widgets_v2.py`:

- **The picker.** It lists all 19 cards and all 16 built-in views, each card with an icon and a one-line description. It checks categories, search, the hover and focus preview, arrow keys, Esc with focus returning, and "Added ✓". Cards that allow only one are disabled once added; cards that allow more are not.
- **Each card.** Each one is added, then used for its main action, then the page is reloaded and the order and state are checked.
- **The ⋯ menu.** Esc closes it. Rename, Settings, Move up and Refresh are each used.
- **Reordering.** Alt+↓ and a pointer drag by the header both save the tribe's order.
- **Errors.** With the network blocked, Refresh shows the error with Retry, and Retry recovers.
- **Two members, live.** Maya accepts her task. Who's here updates. The note syncs, the checklist ticks and the poll vote count reaches the other screen. A failing build shows up.
- **A spectator.** Sees the cards, gets only Refresh in the menu, and can't vote or type.
- **Phones (390px).** No sideways scroll, no card wider than the panel, 36px tap targets, and the picker opens as a sheet.
- **Remove.** Every card is removed from its menu, and its state is cleared on the server.
- **Home.** The picker offers only Home's cards. Home cards persist after a reload, belong to one member only, and don't appear inside a project.

Screenshots: `docs/screenshots/widgets-picker.png`, `docs/screenshots/widgets-sidebar.png`.

## 4. Still open

- The built-in view rows (Calendar, Bugs…) don't show counts. Their cards (Next standup, Milestones timeline, Build status) cover that instead.
- The music / ambient player waits for licensed audio.
- `e2e_first_run.py` and the full `npm test` were not run in this pass, because seven agents share the machine. The widget suites listed at the top were run, one at a time.
