# Notes

Sticky notes in Markdown that save themselves. Grow it into a journal, a wiki or a shared notebook.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** New note adds one. Edit switches between writing and reading.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Add search") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `title` | Title | `Notes` |
| `firstNote` | First note | `# Welcome
Write in **Markdown**.
- Click Edit to change me` |
| `accent` | Accent | `#F26B1D` |
| `bg` | Background | `#12151A` |
| `surface` | Cards | `#1B2028` |
| `ink` | Text | `#E7E9EE` |
| `muted` | Quiet text | `#94A3B8` |
| `line` | Lines | `#2A313C` |

## Ideas to build next

- Add search
- Add tags and a filter
- Pin a note to the top
- Export all notes as a Markdown file

## Credit

Adapted from [50projects50days › notes-app](https://github.com/bradtraversy/50projects50days/tree/master/notes-app) by Brad Traversy, under the MIT license (kept in LICENSE). Changes for TribeCode: a small safe Markdown renderer instead of the marked CDN, text buttons instead of the Font Awesome CDN, a grid layout, starter text from config.js, a store that works in a sandboxed preview.
