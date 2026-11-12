# Form and survey

A step-by-step form with a progress bar, choices, a rating scale and validation, ending with the answers as JSON.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Answer and press Next or Enter.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Send the answers to a spreadsheet") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `title` | Title | `Quick survey` |
| `scaleQuestion` | Rating question | `How likely are you to tell a friend?` |
| `scaleMax` | Rating scale up to | `10` |
| `thanks` | Thank-you line | `Thank you! Here is what you sent:` |
| `bad` | Error color | `#FF6F8E` |
| `accent` | Accent | `#F26B1D` |
| `bg` | Background | `#12151A` |
| `surface` | Cards | `#1B2028` |
| `ink` | Text | `#E7E9EE` |
| `muted` | Quiet text | `#94A3B8` |
| `line` | Lines | `#2A313C` |

## Ideas to build next

- Send the answers to a spreadsheet
- Add a question that only shows for some answers
- Make it a quiz with a score
- Add a file upload

## Credit

Written for TribeCode and released under the MIT license (see LICENSE). Inspired by Typeform-style one-question-at-a-time forms (no code copied).
