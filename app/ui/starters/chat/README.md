# Chat UI

Chat bubbles, names, times, a typing indicator and a pretend friend who answers. Wire it to a socket to make it real.

## Run it

Open `index.html` in a browser. No install, no build step.

**Controls:** Type and press Enter.

## Tweak it

Every knob is in `config.js`. Ask Flint ("Add emoji reactions") or change a value and reload.

| Knob | What it does | Default |
| --- | --- | --- |
| `channel` | Channel name | `#general` |
| `friend` | Friend's name | `Maya` |
| `greeting` | First message | `Hey! The build is up, have a look` |
| `replies` | Pretend replies (separated by |) | `Ooh, nice!|Show me when it works|I can take that one|Ha, same|Let's try it tonight` |
| `replyMs` | Reply delay (ms) | `900` |
| `mine` | My bubbles | `#3A2416` |
| `peer` | Names | `#6C7CFF` |
| `online` | Online dot | `#3BD16F` |
| `accent` | Accent | `#F26B1D` |
| `bg` | Background | `#12151A` |
| `surface` | Cards | `#1B2028` |
| `ink` | Text | `#E7E9EE` |
| `muted` | Quiet text | `#94A3B8` |
| `line` | Lines | `#2A313C` |

## Ideas to build next

- Add emoji reactions
- Add channels in a sidebar
- Make it real with a WebSocket server
- Add image messages

## Credit

Written for TribeCode and released under the MIT license (see LICENSE). Inspired by TribeCode's own chat bubbles (docs/DESIGN-SYSTEM.md › Chat).
