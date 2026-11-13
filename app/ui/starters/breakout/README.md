# Breakout

Bounce the ball, break every brick. The classic MDN canvas tutorial game, ready to restyle and extend.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Mouse, a finger or the arrow keys move the paddle. Space or a tap restarts.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Make the ball faster") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `ballSpeed` | Ball speed | `3` |
| `paddleWidth` | Paddle width | `75` |
| `rows` | Brick rows | `3` |
| `columns` | Brick columns | `5` |
| `lives` | Lives | `3` |
| `brick` | Brick color | `#38C6B1` |
| `brick2` | Second brick color | `#6C7CFF` |
| `paddle` | Paddle color | `#F26B1D` |
| `ball` | Ball color | `#F8FAFC` |
| `bg` | Page background | `#12151A` |
| `field` | Play field | `#1B2028` |

## Ideas to build next

- Make the ball faster
- Add power-ups that widen the paddle
- Add levels with brick patterns
- Add sound when a brick breaks

## Credit

Adapted from [Gamedev-Canvas-workshop (MDN 2D breakout tutorial)](https://github.com/end3r/Gamedev-Canvas-workshop) by Andrzej Mazur and Mozilla contributors, under the CC0-1.0 license (kept in LICENSE). Changes for TribeCode: the numbers and colors read config.js, touch controls, an on-canvas win and game-over message instead of alert(), bricks fill the width.
