# Dashboard

KPI tiles, a line chart, top pages and a table from mock data, all plain SVG. Point it at a real API when you have one.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** The range picker redraws everything.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Load the numbers from a JSON file") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `title` | Title | `Dashboard` |
| `baseVisits` | Mock visits per day | `400` |
| `seed` | Mock data seed | `42` |
| `good` | Up color | `#3BD16F` |
| `bad` | Down color | `#FF6F8E` |
| `accent` | Accent | `#F26B1D` |
| `bg` | Background | `#12151A` |
| `surface` | Cards | `#1B2028` |
| `ink` | Text | `#E7E9EE` |
| `muted` | Quiet text | `#94A3B8` |
| `line` | Lines | `#2A313C` |

## Ideas to build next

- Load the numbers from a JSON file
- Add a date picker
- Add a map of visitors
- Add a dark and light switch

## Credit

Written for TribeCode and released under the MIT license (see LICENSE). Inspired by analytics dashboards like Plausible (no code copied).
