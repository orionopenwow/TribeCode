# Tavern 3D · The Crooked Kettle

A small 3D test scene: a cozy tavern on a rainy night with a handful of patrons who wander, sit, chat with each
other and react when you come close. Every patron is a bot, labelled as one over their head and in the Patrons
panel, and takes three simple orders: **Follow me**, **Stay**, **Go to your spot**.

three.js comes from a pinned CDN version (`three@0.170.0` on jsDelivr, see the import map in `index.html`).
No install, no build step, no model files: everything is built from simple shapes.

## Run it

```
node serve.js            # then open http://localhost:8081
```

Any static server works too (`python -m http.server`, the app preview in TribeCode). It needs an internet
connection the first time (three.js from the CDN).

Controls: click to look around, **WASD** to move, **Shift** to walk faster, arrow keys to turn, **E** to talk to the
patron in front of you, **Tab** (or the button) for the Patrons panel, **Esc** to free the mouse.

## Folders are lanes

| Folder | Lane | What lives there |
|---|---|---|
| `src/scene/` | Scene | The room, furniture, lights, colliders, named spots and seats |
| `src/npcs/` | NPCs | Patrons: `patrons.json` (names, roles, lines), behaviour, looks |
| `src/player/` | Player | First-person controls and collision |
| `src/ui/` | UI | BOT name tags, speech bubbles, the Patrons panel, styles |
| `src/main.js` + `docs/` | Lead | Setup, the loop, the shared docs |

Add a patron without touching code: copy an entry in `src/npcs/patrons.json`.

## For tests and agents

`window.__tavern`: `await __tavern.ready` (number of patrons), `__tavern.manual(true)` then `__tavern.step(2)`
(advance two seconds), `__tavern.patrons[0].order('follow')`, `__tavern.player`. Add `?seed=42` to the address
to replay the same evening.
