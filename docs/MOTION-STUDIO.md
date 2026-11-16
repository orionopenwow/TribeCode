# Motion Studio

Motion graphics made in the app: UI morph reels, app promos, logo reveals, kinetic type, stats, charts, social posts, product tours, end cards, transitions, lower thirds and captions. The person's guide is [guide/16-motion-studio.md](guide/16-motion-studio.md).

| File | What |
|---|---|
| `app/ui/motionkit.js` | The engine. A pure function of time, shared by the browser, node (tests, the server) and exported pages |
| `app/ui/motionstudio.js/.css` | The editor: preview, transport, beat timeline, states, feel, sound, export, Flint box |
| `server/motionstudio.js` | Saving in the project and the MCP tools |
| `app/ui/sitefx.js`, `sitefx/fx.js` | Kind `motion`: a section of a website that plays a motion doc |
| `app/ui/motionfonts/` | Inter, three subset weights (SIL OFL) |
| `scripts/dev/flint-eval/motion.js` | Flint's motion sentences |
| `app/test/motionkit_test.js`, `e2e_motion_studio.py` | Tests |

## The rules the engine keeps

- **One shape, never cut.** Every state is the same element. Size, corner radius, position and colour are channels; the content swaps with a short blur (`swap.out`, `swap.enter`, `swap.blur`), each side with its own timing so text never overlaps.
- **A pure function of time.** `seek(doc, t)` and `draw(g, doc, t)` keep nothing between frames. No CSS transitions, no timers.
- **Closed-form springs.** `step(tau, k, z)` is a spring's step response (stiffness `k`, damping ratio `z`, clamped to 0.7–1.2, so overshoot is a few percent at most). It is exactly 1 after 3.2 s.
- **Sum of springs.** A channel retargeted many times is the sum of one spring per change (`channel(events, t)`).
- **Direct manipulation.** A drag is a `path` segment: while the cursor is held, the value follows it; on release the channel starts from the release value and springs to its target.
- **Two-edge springs.** Tab indicators and toggle knobs move each edge on its own spring, the leading edge stiffer, so they stretch while moving and land exactly.
- **Perfect loops.** When `loop` is on, every channel also counts the previous cycle's changes, so frame 0 equals the last frame. Periodic wiggles (`I.osc`) use a frequency that divides the loop.
- **The camera** scales so each state fills about `camera.fill` of the frame, by `camera.strength` (0 = still).
- **The cursor** is generated from the acts: it arrives a little before each click, holds during a drag, and stays the same size on screen while the camera zooms.
- **On the beat.** States and acts are placed in beats; `snap(doc)` moves them to the half-beat grid.

## The doc

```json
{
  "v": 1, "name": "Launch reel", "template": "ui-reel", "aspect": "1:1", "size": { "w": 1440, "h": 1440 },
  "bpm": 120, "bars": 7, "beatsPerBar": 4, "offset": 0, "loop": true,
  "themeName": "warm", "theme": { "bg": "#E9E6E1", "ink": "#111111", "paper": "#FFFFFF", "accent": "#F26B1D", "muted": "#8A867F" },
  "spring": { "k": 230, "z": 0.88 }, "swap": { "blur": 10, "enter": 0.2, "out": 0.1 }, "blur": { "n": 4 },
  "camera": { "strength": 0.5, "fill": 0.66 }, "cursor": true, "sounds": true, "feel": "polished",
  "music": { "name": "song.mp3", "src": "/api/uploads/<id>/raw", "by": "Ana" },
  "states": [
    { "kind": "button", "at": 0, "text": "Get started", "acts": [{ "type": "click", "at": 1, "x": 30, "y": 10 }] },
    { "kind": "slider", "at": 11, "v0": 0.4, "acts": [{ "type": "drag", "at": 12, "until": 13.5, "x0": -40, "y0": 0, "x1": 470, "y1": 0 }] }
  ]
}
```

- Coordinates are units of a 1440 frame, with the origin at the shape's centre. `w`, `h`, `r`, `fill` (`ink`, `paper`, `accent`, `none` or a hex), `cx`, `cy` are per state.
- Acts: `click { at, x, y, i? }`, `drag { at, until, x0, y0, x1, y1 }`, `hover` (like drag, no press), `type { at, until }` (the command palette types its `query`), `focus { at }` (the picture tour moves to its next region).
- Kinds and their words: `KINDS` in motionkit.js (button, loader, check, island, player, slider, toggle, tabs, chart, bars, donut, cmdk, toast, card, notif, logo, wordmark, word, list, stat, ring, phone, image, wipe, post, quote, poll, count, lower, caption, badge, scene, appicon, endcard).
- `normalize()` drops unknown kinds and clamps every number; the server runs it on every save.

## Templates and feels

58 templates in 12 categories (`TEMPLATES`, `CATS`), each a `make(opts)` that returns a doc. Options: `name`, `accent`, `aspect`, `feel`, and for `app-preview` the Launch kit's `screens` (picture URLs), `caption` and `cta`. Thumbnails in the gallery are drawn by the engine at the template's `thumbAt` beat.

54 feel presets (`FEELS`): stiffness, damping, blur between states, enter time, motion-blur subframes and camera strength, each with a name and a one-line description. `applyFeel(doc, id)`.

## Sound

The person picks a song. The browser decodes it, `analyze(samples, rate)` finds the tempo (onset envelope, autocorrelation weighted toward 120 BPM), the beat phase and the downbeat, and `snap` moves every state onto it. With no song there is a click track. UI sounds (click, tick, pop, whoosh) are synthesized and placed by `events(doc)`. Music is never downloaded for the person; the Sound tab says to use music they have the rights to.

## Export

- **MP4**: Mediabunny 1.62.1 (MPL-2.0) from jsdelivr, only when someone exports; frames go in one by one with exact timestamps, with sound rendered offline. Falls back to WebM.
- **WebM**: `MediaRecorder` on the canvas, paced in real time, with sound.
- **GIF**: a small encoder in motionstudio.js (one shared palette, LZW, loops forever), 600 px wide, 20 fps.
- **PNG**: the current frame.
- **HTML**: one file with the engine and the doc inlined. It plays with no network and shows one still frame with reduced motion.
- **Put it on my website**: adds a section to the website designer with `fx: { kind: 'motion', m: <doc> }`. A published or downloaded site carries `motionkit.js` beside `fx.js` (or inside the one-file page). One Undo removes it.
- Motion blur: `blur.n` subframes blended per frame.

## Flint

`flintnlu.js`: anywhere, `motion.new { tpl }` ("make a logo reveal", "lower thirds for my stream"). In the studio (`view: 'motion'`): `motion.feel`, `motion.speed`, `motion.overshoot`, `motion.aspect`, `motion.loop`, `motion.beat`, `motion.song`, `motion.accent`, `motion.theme`, `motion.text`, `motion.add`, `motion.remove`, `motion.camera`, `motion.cursor`, `motion.blur`, `motion.length`, `motion.export`, `motion.play`. `TribeMotionKit.command(doc, step)` applies them (pure); `flintlocal.js` routes them to the studio.

## Saving and the API

- In a project: `motion/<key>.motion.json` (other projects: `projects/<pid>/motion/`).
  - `GET /api/projects/:pid/motion` lists them, `GET|PUT|DELETE /api/projects/:pid/motion/:key`. Spectators can look, not change. Docs up to 6 MB (pictures as data URLs).
  - Changes broadcast `{ type: 'motion', project, key }`; an open studio reloads when someone else saved.
- With no tribe: `localfiles.js` kind `motion`.
- MCP tools for a member's own agent ("Have my AI do it"): `motion_list`, `motion_read { key }`, `motion_write { key, doc }` (or `{ template, name, accent, aspect }` to start from a template).

## For other features

- `TribeMotionStudio.open({ template, screens, name, caption, cta, accent, aspect, pid, key, doc, ask })`. The Launch kit opens `{ template: 'app-preview', screens }`.
- `TribeMotionStudio.exportAs(fmt, { scale, fps })` returns `{ blob, ext }`.
- Suggestions: when `window.TribeSuggest.register` exists, Motion registers a provider with three suggestions. It offers the brand's new accent for the newest piece, a 9:16 clip when the website changed since the last piece, and syncing to a song someone uploaded. Each `apply()` returns an undo.

## Credits

Ideas, not code, from MIT projects: Emil Kowalski's skills, the Animate skill, the HTML animation skill, rossark-motion-skill and anime.js. Remotion is not used: it has its own license that needs a company license in some cases. See [NOTICE](../NOTICE).
