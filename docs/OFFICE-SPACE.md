# Office Space

Office Space is the office drawn as a small top-down pixel floor. It is the same office as before (one switch per
tribe, the host or an admin turns it on, anyone can hide it for themselves). On a computer it opens as the floor, and
**Desks** switches back to the calm list. Phones always get the list.

Everyone has a character:

- **People** are drawn from parts (body, skin, hair, hair colour, top, top colour, an extra). Each person starts with
  a look picked from their id. **Your look** opens the wardrobe, and the look is saved to their profile on the server.
- **AI helpers** (Claude Code, Cursor, Codex, the tribe's own AI) are small robots in Teal, with a coloured accent for
  the tool.
- **Flint** is a flame in Ember, who stays by the coffee.

Characters follow what is really happening:

| What happens | Where they go |
| --- | --- |
| A person or agent is working (an agent claimed a file or is writing) | Walks to their desk, sits and types |
| An agent is reading (listing tasks, the overview, searching) | Sits at the desk and reads |
| Someone just handed work in | Goes to the task board, with a "Done" bubble |
| Waiting on something | The thinking corner |
| Idle, away or paused | The lounge |
| Offline | Walks out of the door |

An agent that asks for an approval gets a **Needs your OK** bubble. Click anyone (or their desk) for a card:

- **People:** Message, Call, Profile, Give a task, recent work, and Open what they are working on.
- **Agents:** who they help, the tool, their task, the files they claimed (each with Open), their last steps, approvals
  they are waiting on with **Approve** or **Ask for changes** right there (only for the people the approval asks),
  Pause/Resume, Message, and a link to their page.
- **Flint:** Ask Flint, What to do next, Polish a design.

The card only uses features TribeCode already has. DM text never appears on the floor or in its data.

## Editing the floor (host and admins)

**Edit layout** opens the editor: move, turn and remove pieces; paint floor, wall, carpet, wood and tiles; place desks,
plants, sofas, thinking seats, coffee, tables, shelves, lamps, rugs and task boards; drag to name an area; pick who a
desk is for. **Save layout** keeps it for the whole tribe. **Back to the default** removes your layout. **Export** gives
a JSON file and **Import** reads one back (save afterwards to keep it). If there are more people than desks, extra desks
appear on free floor.

API: `GET /api/office` returns `layout` (or `null` for the default) and `set`; `PUT /api/office {layout}` (or
`{layout: null}`) and `PUT /api/office {set}` need the host or an admin. `PUT /api/office/look {look}` sets your own
look (people only). The server checks every value: known piece and tile names only, sizes clamped, short names.

Layout JSON:

```json
{ "v": 1, "w": 24, "h": 15,
  "tiles": ["wall", "floor", "carpet", "wood", "tile", "..."],
  "items": [{ "t": "desk", "x": 2, "y": 2, "r": 0, "who": "member-id" }],
  "areas": [{ "name": "Lounge", "x": 15, "y": 9, "w": 8, "h": 5 }] }
```

`tiles` has `w × h` entries, row by row. `r` is the turn (0–3). Sizes: `w` 10–40, `h` 8–28.

## Sets

A set is how the floor looks. Two come with TribeCode: **TribeCode** (the app's matte greys with Ember, Teal and Indigo)
and **Night studio** (a dark blue floor with warm lamps). The host or an admin picks the set; it is saved per tribe.

A set is a small manifest:

```json
{ "id": "night", "name": "Night studio",
  "palette": { "floor": "#151B2B", "wall": "#232B42", "desk": "#3A2E3E", "glow": "#F2C46D", "sofa": "#B5623A" },
  "sprites": { "plant": { "src": "data:image/png;base64,...", "w": 1, "h": 1 } } }
```

- `id`: 2–32 lowercase letters, digits or dashes.
- `palette`: any of the colours in the TribeCode set (`app/ui/officespace-sets.js`). Missing ones fall back to it.
- `sprites` (optional): a picture for a piece, 16 px per tile, `w`/`h` in tiles (1–4). Only `data:image/png` pictures
  are used, never a web address, so a set can't load anything from outside.

Register one in the browser with `TribeOfficeSets.add(manifest)`. Only add art you made or have the rights to.

## Sound and motion

Sound is off by default and is per device: **Sound on** plays one soft chime when someone newly needs your OK. Under
reduced motion, characters appear at their spot straight away: no walking and no blinking.

## Credits

The art is from [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca (MIT, (c) 2026 Pablo
De Lucca): floors, walls, carpets, furniture, the pets and the default office, in `app/ui/officespace/`. The character
parts are based on the [Metro City character pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) by
JIK-A-4 (CC0 1.0). Pixel Agents' ideas (sprite sheets, layer order, colour swaps, wall autotiling, depth sorting) were
ported to plain JavaScript; no TypeScript or React code was copied. Donarg's Office Interior Tileset is not included.
Licence text: NOTICE and `app/ui/officespace/LICENSE.txt`.

Files: `app/ui/officespace.js` (the floor, characters, card, wardrobe, editor), `app/ui/officespace-sets.js` (sets and
drawing), `app/ui/officespace.css`, `app/ui/office.js` (the office and the Floor/Desks switch), `server/office.js`.
Test: `app/test/e2e_office_space.py`.
