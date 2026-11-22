# Office Space

Office Space is the office drawn as a top-down pixel floor, in the art of Pixel Agents. It is the top of **Agents &
office**, the one page for people and AI helpers (see below). The desks are always there; the pixel floor is one switch
per tribe (the host or an admin turns it on, from the line above the desks or Settings), and anyone can hide the office
for themselves. On a computer with the floor on it opens as the floor, with who's here as avatars in the head line, and **Desks**
switches back to the calm list. Phones always get the list.

## Agents & office (one view)

The sidebar's **Agents & office** (key `ws-agents`, also `TribeShell.go('agents')`), Home's row of the same name, Settings,
the phone's Agents tab, Flint and "Your AI tools"' back link all open one page in the main area (`app/ui/agentsoffice.js`
draws the shared parts, `agentsdash.js` paints a project's page, `agentshub.js` Home's page for every project):

In a project the page is the office, full size (`app/ui/officefull.js`):

1. **The head**: one line: "Agents & office · 2 people online · 1 AI helper working", who is here as small avatars, and
   **Add an AI helper** / **Invite a friend**.
2. **The office** fills the page: the floor or the desks. A slim toolbar on its top edge has Floor | Desks, − + and one
   **⋯** menu: Fit, Your look, the office's set, Edit layout (host), Sound, Hide the office for me, Where your tribe runs,
   What's private and Back up to GitHub. A click on someone at a desk, on the floor or on an avatar opens the same card
   (`TribeOffice.openCard`: Message, Call, Give a task, Open what they're working on, Profile; for AI helpers Approve /
   Ask for changes, Pause, its page). A task given to an AI helper goes through the fleet's route, so it hears at once.
3. **The side panel** (folds to an icon rail; a bottom sheet on phones): **Working on** in one order: Needs you
   (approvals and other asks, with Approve right there; only when there are any), Working now (one line per person or AI
   helper: "Claude  yours", what it is doing in plain words, a live dot; a click opens it with its task, files and
   actions), Up next (tasks in progress, or the next one) and Here (who is online). With no AI helper yet: Add an AI
   helper and the four loops (a friend, where it runs, what's private, GitHub). **Preview** (the project's app and
   website, live, in tabs) and **Updates** (what happened, newest first, with #agents). How AI helpers work is in ⋯.
4. **The box**: the Messages composer (same shape, size and buttons), floating over the bottom of the floor. Plain words go to #general (they show in Messages);
   "@claude do X" gives that AI helper a task; "@agents …" writes to #agents; "/" lists the commands (/task, /ai, /invite,
   /flint, /look, /where); "add claude" opens Claude's one setup; a request Flint knows ("invite a friend", "make the
   website darker", "what's everyone doing?") runs in Flint, with no AI needed. Replies show above it for a moment.

Home with no project shows the same parts for every project (`agentshub.js`).

Tests: `app/test/e2e_agents_office.py`, `app/test/e2e_office_full.py`.

The floor starts as Pixel Agents' default office: a wood work room with two desks and a meeting table, a blue lounge with
sofas around a coffee table, a checker corner, bookshelves, plants, a clock and paintings on navy walls. A whiteboard
stands in for the task board. Bigger tribes get a wider work room (two more desks for every four columns, up to 40
columns); if there are still more people than seats, a desk, a computer and a stool appear on free floor. The floor is
drawn at a whole-number pixel zoom. In Agents & office the camera picks the biggest zoom that keeps everyone in view and
looks where people are, and more building (hall floor) is drawn around the office so the art reaches every edge; + and −
zoom, drag looks around, and Fit in ⋯ puts it back.

Everyone has a character, with a name tag over their head: a pixel plate at the floor's zoom with a colour notch for
the role (an AI helper's tool, Flint's flame, a person's presence), "Claude" with "Camp's" small for AI helpers, and a
pixel pointer down to the head; tags never overlap.

The characters:

- **People** are dressed from Pixel Agents' wardrobe: body, skin, hair and hair colour, top, bottoms, shoes, a jacket, an
  outfit (suits and dresses), a beard, a hat and an extra (glasses, shades, earrings, a necklace, a watch, a lanyard),
  each in its own colours. Each person starts with a look picked from their id. **Your look** opens the wardrobe, and
  the look is saved to their profile on the server.
- **AI helpers** (Claude Code, Cursor, Codex, the tribe's own AI) wear the Teal shirt, a lanyard and a cap in their
  tool's colour (Claude orange, Cursor white, Codex green), and their name tag carries an **AI** mark.
- **Flint** is a small pixel flame in Ember who stays by the coffee.
- Two office pets, **Claudio** and **Gitcat**, wander between people. Click one for a heart.

Characters follow what is really happening:

| What happens | What they do |
| --- | --- |
| A person or agent is working (an agent claimed a file or is writing) | Walks to their desk, sits and types; their computer screen comes on |
| An agent is reading (listing tasks, the overview, searching) | Sits at the desk and reads |
| Someone just handed work in | Goes to the whiteboard, with a "Done" bubble |
| Waiting on something | Stands at the bookshelves |
| Idle, away or paused | Sits in the lounge |
| Offline | Walks out of the door |

An agent that asks for an approval gets the "…" speech bubble (**Needs your OK** for screen readers). Click anyone (or
their seat or computer) for a card:

- **People:** Message, Call, Profile, Give a task, recent work, and Open what they are working on.
- **Agents:** who they help, the tool, their task, the files they claimed (each with Open), their last steps, approvals
  they are waiting on with **Approve** or **Ask for changes** right there (only for the people the approval asks),
  Pause/Resume, Message, and a link to their page.
- **Flint:** Ask Flint, What to do next, Polish a design.

The card only uses features TribeCode already has. DM text never appears on the floor or in its data.

## How it is drawn

`app/ui/officespace-art.js` loads the art from `app/ui/officespace/` and makes each piece once, then reuses it:

- Floors and walls are grey art, colourised from the set's palette; walls pick one of 16 pieces from their
  north/east/south/west neighbours; carpets are drawn on the corners between tiles (marching squares).
- Furniture comes from `catalog.json` (made from the manifests by `node scripts/dev/officespace-catalog.js`): a view per
  turn (front, side, back, side mirrored), and the computer's three "on" frames.
- A character is a 128×96 sheet (rows: down, up, right; left is mirrored; columns: walk ×3, type ×2, read ×2, seated)
  built from the layered parts in Pixel Agents' order, with its colour swaps and colourise.
- Depth: everything is sorted by its base. Chairs sort by their top row (backs of back-facing chairs go over the person),
  things on a desk sort just above the desk, and characters sort at their feet.
- Walking is 3 tiles a second with 0.15 s steps; typing 0.3 s per frame; reading 0.6 s. Seated characters sit 6 px lower.

## Editing the floor (host and admins)

**Edit layout** opens the editor: move, turn and remove pieces; paint wood, floor, tiles, stone, carpet, wall and
outside; place any of the 25 pieces of furniture (desks and tables, seats, computers, plants, things on the wall);
drag to name an area; click a seat to pick who sits there. **Save layout** keeps it for the whole tribe. **Back to the
default** removes your layout. **Export** gives a JSON file and **Import** reads one back (save afterwards to keep it).

API: `GET /api/office` returns `layout` (or `null` for the default) and `set`; `PUT /api/office {layout}` (or
`{layout: null}`) and `PUT /api/office {set}` need the host or an admin. `PUT /api/office/look {look}` sets your own
look (people only). The server checks every value: known tile names, furniture ids in capitals only, sizes clamped,
short names, and look numbers inside their ranges.

Layout JSON (v2):

```json
{ "v": 2, "w": 20, "h": 12,
  "tiles": ["void", "wall", "wood", "floor", "tile", "stone", "carpet", "..."],
  "items": [{ "t": "DESK", "x": 2, "y": 3, "r": 0 }, { "t": "CUSHIONED_BENCH", "x": 3, "y": 5, "r": 0, "who": "member-id" }],
  "areas": [{ "name": "Lounge", "x": 11, "y": 2, "w": 8, "h": 7 }] }
```

`tiles` has `w × h` entries, row by row. `t` is a furniture id from `app/ui/officespace/catalog.json`. `r` is the turn:
0 front, 1 side, 2 back, 3 side facing left. `who` on a seat keeps it for one person. Sizes: `w` 10–40, `h` 8–28.
Layouts saved before the art (v1, pieces drawn in code) are kept on the server but the floor starts from the new
default until someone saves a new one.

## Sets

A set is how the floor looks. Two come with TribeCode: **Office** (Pixel Agents' own colours, the default) and **Night
studio** (the same art recoloured: a deep blue floor, plum wood and amber rugs). The host or an admin picks the set; it
is saved per tribe. The old set name `tribecode` now means Office.

A set is a small manifest (the format is unchanged):

```json
{ "id": "night", "name": "Night studio",
  "palette": { "floor": "#151B2B", "wood": { "h": 285, "s": 22, "b": -70, "c": -88 }, "wall": "#232B42" },
  "sprites": { "PLANT": { "src": "data:image/png;base64,...", "w": 1, "h": 2 } } }
```

- `id`: 2–32 lowercase letters, digits or dashes.
- `palette`: `floor`, `wood`, `tile`, `stone`, `carpet`, `wall` and `void` (outside). Each is a colour or a colourise
  value `{h, s, b, c}` for the grey art. Missing ones fall back to Office.
- `sprites` (optional): a picture for a furniture id, 16 px per tile, `w`/`h` in tiles (1–4). Only `data:image/png`
  pictures are used, never a web address, so a set can't load anything from outside.

Register one in the browser with `TribeOfficeSets.add(manifest)`. Only add art you made or have the rights to.

## Sound and motion

Sound is off by default and is per device: **Sound on** plays one soft chime when someone newly needs your OK. Under
reduced motion, characters appear at their spot straight away: no walking, no animation frames, still screens and
still pets.

## Credits

The art is from [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca (MIT, (c) 2026 Pablo
De Lucca): floors, walls, carpets, furniture, the pets, the speech bubbles and the default office, in
`app/ui/officespace/`. The character parts are based on the
[Metro City character pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) by JIK-A-4 (CC0 1.0). Pixel
Agents' ideas (sprite sheets, layer order, colour swaps, wall autotiling, depth sorting) were ported to plain
JavaScript; no TypeScript or React code was copied. Flint's flame is TribeCode's own. Donarg's Office Interior Tileset
is not included. Licence text: NOTICE and `app/ui/officespace/LICENSE.txt`.

Files: `app/ui/agentsoffice.js` (Agents & office), `app/ui/officespace.js` (the floor, characters, wardrobe, editor; the card's body is office.js's), `app/ui/officespace-art.js` (loading and
drawing the art), `app/ui/officespace-sets.js` (sets and starting looks), `app/ui/officespace.css`, `app/ui/office.js`
(the office and the Floor/Desks switch), `server/office.js`. Test: `app/test/e2e_office_space.py`.
