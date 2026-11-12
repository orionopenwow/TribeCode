# Memory cards

Flip two, keep the pairs. A tidy card-game base (deck, shuffle, turns, score) to grow into Snap, Go Fish or solitaire.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Click or tap two cards. New game deals again.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Use our team's faces as the cards") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `title` | Title | `Memory cards` |
| `pairs` | Pairs | `8` |
| `flipBackMs` | How long a wrong pair stays up (ms) | `700` |
| `symbols` | Card faces (separated by spaces; emoji work too) | `★ ♥ ♦ ♣ ♠ ☀ ☾ ♪ ⚑ ✿ ☂ ⚓` |
| `back` | Card back | `#F26B1D` |
| `face` | Card face | `#F8FAFC` |
| `symbol` | Symbol color | `#12151A` |
| `table` | Buttons | `#1B2028` |
| `bg` | Table | `#12151A` |

## Ideas to build next

- Use our team's faces as the cards
- Add a timer and a leaderboard
- Make it two players taking turns
- Turn it into Snap

## Credit

Written for TribeCode and released under the MIT license (see LICENSE). Inspired by the traditional Concentration card game.
