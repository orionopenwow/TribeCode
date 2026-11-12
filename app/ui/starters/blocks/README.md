# Falling blocks

The falling-blocks puzzle: rotate, slide, clear rows, go faster. Clean, readable code with a next-piece preview.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Arrows: Left and Right move, Up rotates, Down drops. Space starts. On a phone: the buttons under the board.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Start slower") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `dropTime` | Seconds per row at the start (lower is faster) | `0.6` |
| `c1` | I piece | `#38C6B1` |
| `c2` | J piece | `#6C7CFF` |
| `c3` | L piece | `#F26B1D` |
| `c4` | O piece | `#FABD2F` |
| `c5` | S piece | `#3BD16F` |
| `c6` | T piece | `#A78BFA` |
| `c7` | Z piece | `#FF6F8E` |
| `bg` | Page background | `#0E1014` |

## Ideas to build next

- Start slower
- Add a hold piece
- Add a ghost piece that shows where it lands
- Add a high score

## Credit

Adapted from [javascript-tetris](https://github.com/jakesgordon/javascript-tetris) by Jake Gordon and contributors, under the MIT license (kept in LICENSE). Changes for TribeCode: the script and styles moved into game.js and style.css, the drop speed and piece colors read config.js, the FPS stats and background texture are gone, touch buttons and a dark look.
