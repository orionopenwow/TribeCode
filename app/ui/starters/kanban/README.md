# Kanban board

Columns and cards you drag between them, saved in the browser. The base for a task tracker, a CRM or a content calendar.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Drag cards between columns (arrow keys on a focused card; tap on a phone moves it on). Double-click renames.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Add a column for Review") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `title` | Title | `Board` |
| `columns` | Columns (separated by |) | `To do|Doing|Done` |
| `accent` | Accent | `#F26B1D` |
| `bg` | Background | `#12151A` |
| `surface` | Cards | `#1B2028` |
| `ink` | Text | `#E7E9EE` |
| `muted` | Quiet text | `#94A3B8` |
| `line` | Lines | `#2A313C` |

## Ideas to build next

- Add a column for Review
- Add colored labels
- Add who is on each card
- Add due dates and a calendar view

## Credit

Written for TribeCode and released under the MIT license (see LICENSE). Inspired by Trello-style boards.
