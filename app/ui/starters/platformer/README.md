# Tiny platformer

Run, jump, grab the gold and stomp the monsters. A whole platformer in one small file with a tile level you can redraw.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Left and Right to run, Space to jump. On a phone: hold the left or right third, tap the middle to jump.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Make the jumps floatier") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `gravity` | Gravity (higher falls faster) | `6` |
| `speed` | Run speed (tiles per second) | `15` |
| `jump` | Jump power | `1500` |
| `player` | Player color | `#ECD078` |
| `brick` | Brick color | `#D95B43` |
| `monster` | Monster color | `#53777A` |
| `gold` | Gold color | `#FFD700` |
| `bg` | Page background | `#111111` |

## Ideas to build next

- Make the jumps floatier
- Add a second level
- Add a timer and a best time
- Give the player a pixel-art sprite

## Credit

Adapted from [javascript-tiny-platformer](https://github.com/jakesgordon/javascript-tiny-platformer) by Jake Gordon and contributors, under the MIT license (kept in LICENSE). Changes for TribeCode: the physics and colors read config.js, the level ships as level.js (no fetch, so it runs in a sandboxed preview), the FPS meter is gone, touch controls added, the page fits any screen.
