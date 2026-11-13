# Snake

Eat, grow, don't bite yourself. A full Snake with modes, a high score and an on-screen pad for phones.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Arrow keys or WASD steer, Space pauses. On a phone: the pad in the corner.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Make it faster") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `stepMs` | Milliseconds per move (lower is faster) | `75` |
| `growth` | Growth per bite | `5` |
| `snake` | Snake color | `#38C6B1` |
| `food` | Food color | `#F26B1D` |
| `field` | Field color | `#1B2028` |
| `bg` | Page background | `#12151A` |

## Ideas to build next

- Make it faster
- Add walls that appear as you grow
- Add a second snake for two players
- Make the food a pixel-art apple

## Credit

Adapted from [JavaScript-Snake](https://github.com/patorjk/JavaScript-Snake) by Patrick Gillespie and contributors, under the MIT license (kept in LICENSE). Changes for TribeCode: one flat theme with colors from config.js instead of the theme picker and its fonts and images, the speed and growth read config.js, a high score store that works in a sandboxed preview, no console logging.
