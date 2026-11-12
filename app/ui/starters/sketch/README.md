# Sketch pad

Draw with a mouse, pen or finger, change the brush and color, save a PNG. A base for a doodle game or a whiteboard.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Draw with the mouse, a pen or a finger. − and + change the brush.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Add an eraser") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `brush` | Brush size | `10` |
| `ink2` | Starting ink | `#12151A` |
| `paper` | Paper | `#F8FAFC` |
| `fileName` | Saved file name | `sketch` |
| `accent` | Accent | `#F26B1D` |
| `bg` | Background | `#12151A` |
| `surface` | Cards | `#1B2028` |
| `ink` | Text | `#E7E9EE` |
| `muted` | Quiet text | `#94A3B8` |
| `line` | Lines | `#2A313C` |

## Ideas to build next

- Add an eraser
- Add undo
- Add stickers
- Make it multiplayer with the tribe

## Credit

Adapted from [50projects50days › drawing-app](https://github.com/bradtraversy/50projects50days/tree/master/drawing-app) by Brad Traversy and Florin Pop, under the MIT license (kept in LICENSE). Changes for TribeCode: pointer events for mouse, pen and touch, the canvas scales to the screen, Save PNG, brush and colors from config.js, the flat look.
