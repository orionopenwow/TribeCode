# Lantern Run

A small night-time platformer. You are Wick, a little flame. Run, jump and bounce through three short levels,
pick up embers to keep your light alive, and light the lantern at the end of each one.

Plain HTML, JavaScript modules and a canvas. No build step, no dependencies, no image or sound files:
the art is drawn in code and the sounds are made with WebAudio.

## Run it

```
node serve.js            # then open http://localhost:8080
```

Any static server works too (`python -m http.server`, the app preview in TribeCode). Browsers refuse to load
JavaScript modules from a double-clicked `index.html`, so the page tells you this if you try.

Controls: arrows or A/D to run, Space (or W, Up, Z) to jump, M to mute, P to pause. On a phone: the on-screen
buttons.

## Folders are lanes

Each folder belongs to one role. People and their Claude Codes work inside their own lane and hand off
anything outside it (see CLAUDE.md).

| Folder | Lane | What lives there |
|---|---|---|
| `src/player/` | Player | Movement, jump, coyote time, jump buffer, tuning numbers |
| `src/levels/` | Levels | The level JSON files and the loader (tile legend at the top of `loader.js`) |
| `src/art/` | Art | The palette, sprites drawn in code, the night sky, the light and darkness |
| `src/audio/` | Audio | WebAudio sound effects |
| `src/ui/` | UI | Title, HUD, level hint, "lantern lit", pause and win screens |
| `src/core/` + `src/main.js` + `docs/` | Lead | The game loop, input, collision, and the shared docs |

## For tests and agents

`window.__lantern` is a small debug hook: `await __lantern.ready`, `__lantern.start(0)`, `__lantern.manual(true)`
(stop the clock), `__lantern.press('right')`, `__lantern.step(0.5)` (advance half a second), `__lantern.player`.
