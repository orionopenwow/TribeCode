# To-do list

Add, tick off and delete to-dos, saved in the browser. The smallest useful app to grow from.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Type and press Enter to add. Click to mark done; ✕ or right-click to delete.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Add due dates") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `title` | Title | `To-do` |
| `starterItems` | Starter items (separated by |) | `Sketch the idea|Pick a name|Show the tribe` |
| `accent` | Accent | `#F26B1D` |
| `bg` | Background | `#12151A` |
| `surface` | Cards | `#1B2028` |
| `ink` | Text | `#E7E9EE` |
| `muted` | Quiet text | `#94A3B8` |
| `line` | Lines | `#2A313C` |

## Ideas to build next

- Add due dates
- Add lists for each person
- Sync it with the tribe's task board
- Add a dark and light switch

## Credit

Adapted from [50projects50days › todo-list](https://github.com/bradtraversy/50projects50days/tree/master/todo-list) by Brad Traversy, under the MIT license (kept in LICENSE). Changes for TribeCode: the title and starter items read config.js, a delete button and a "left to do" count, the flat look, a store that works in a sandboxed preview.
