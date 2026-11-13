# Pomodoro timer

Focus and break rounds with a progress ring, a round counter and a soft beep. A base for any timer or habit app.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Start, Pause, Reset and Skip.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Add a task list beside the timer") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `title` | Title | `Pomodoro` |
| `focusMin` | Focus minutes | `25` |
| `breakMin` | Break minutes | `5` |
| `longBreakMin` | Long break minutes | `15` |
| `roundsBeforeLong` | Rounds before a long break | `4` |
| `autoStart` | Start the next round by itself | `false` |
| `rest` | Break color | `#38C6B1` |
| `accent` | Accent | `#F26B1D` |
| `bg` | Background | `#12151A` |
| `surface` | Cards | `#1B2028` |
| `ink` | Text | `#E7E9EE` |
| `muted` | Quiet text | `#94A3B8` |
| `line` | Lines | `#2A313C` |

## Ideas to build next

- Add a task list beside the timer
- Show a week of focus rounds
- Add ambient sounds
- Share a timer with the tribe

## Credit

Written for TribeCode and released under the MIT license (see LICENSE). Inspired by the Pomodoro Technique by Francesco Cirillo.
