# Office Space

Office Space is the office drawn as a top-down pixel floor, in the art of Pixel Agents. It is the top of **Agents &
office**, the one page for people and AI helpers (see below). The desks are always there; the pixel floor is one switch
per tribe (the host or an admin turns it on, from the line above the desks or Settings), and anyone can hide the office
for themselves. On a computer with the floor on it opens as the floor, with a list of who's here under it, and **Desks**
switches back to the calm list. Phones always get the list.

## Agents & office (one view)

The sidebar's **Agents & office** (key `ws-agents`, also `TribeShell.go('agents')`), Home's row of the same name, Settings,
the phone's Agents tab, Flint and "Your AI tools"' back link all open one page in the main area (`app/ui/agentsoffice.js`
draws the shared parts, `agentsdash.js` paints a project's page, `agentshub.js` Home's page for every project):

1. **The office**: the floor or the desks. A click on someone at a desk, on the floor or in the list opens the same card
   (`TribeOffice.openCard`: Message, Call, Give a task, Open what they're working on, Profile; for AI helpers Approve /
   Ask for changes, Pause, its page). A task given to an AI helper goes through the fleet's route, so it hears at once.
2. **The agents' state**: with no AI helper yet, **Add an AI helper** (Claude, ChatGPT, Codex, Gemini, Cursor, a model on
   this computer, a free AI in your browser, another tool), each opening the one setup in the invite sheet; nothing is
   made until you copy it there. Once one has connected: the next step, what needs you, one row per agent, #agents.
3. **Get set up**: four cards, one button each. Bring a friend (the one invite sheet: link, QR for a phone, code). Where
   your tribe runs (the words from `tribestatus.js`, then this computer, a friend's computer connected directly over
   Tailscale, a shared folder, free cloud). What's private (only true lines; `docs/CLAIMS.md`). Back up to GitHub (Connect
   GitHub, with a link to make a free account for someone who has none; then "Linked to … · backed up …" and Back up now).

Test: `app/test/e2e_agents_office.py`.

The floor starts as Pixel Agents' default office: a wood work room with two desks and a meeting table, a blue lounge with
sofas around a coffee table, a checker corner, bookshelves, plants, a clock and paintings on navy walls. A whiteboard
stands in for the task board. Bigger tribes get a wider work room (two more desks for every four columns, up to 40
columns); if there are still more people than seats, a desk, a computer and a stool appear on free floor. The floor is
drawn at a whole-number pixel zoom that fills the panel (+ and − zoom further, drag to pan).

Everyone has a character:

- **People** choose their character in **Your look** (`app/ui/officelooks.js`), a creator with a large live preview
  (standing, walking, seated or typing, turned to face each way) and ten tabs: Body & skin, Face, Hair, Facial hair, Top
  (with whole outfits), Jacket, Bottoms, Shoes, Accessories and Hat. Every choice is a swatch of the real part drawn on a
  plain character, with colours for each part, and **Randomize**, **Undo**, **Reset** and **Save**. Arrow keys move along
  the tabs and choices. On phones it is a sheet with 40px targets. Until someone saves, their look is picked from their id.
- **What there is:** 95 parts (2 bodies, 5 eye styles, 23 hairstyles including bald, 11 tops, 4 whole outfits, 9 bottoms,
  4 shoes, 7 jackets, 8 beards, 7 hats, and 15 accessories: glasses, sunglasses, shades on the head, a tie, a bow tie, a
  scarf, headphones, earrings, studs, two necklaces, three watches and a lanyard) and 77 colours: 12 skin tones from
  porcelain to the deepest browns, 20 hair colours (13 natural, 7 bright), 24 clothing colours chosen to sit on the
  office's wood and navy, 8 eye colours, 5 metals and 8 frame colours. Clashes give way to what you just chose: a hat
  takes off shades worn on the head, buns and a mohawk don't go under a hat, a tie needs a collar.
- **AI helpers** (Claude Code, Cursor, Codex, the tribe's own AI) wear a long-sleeved teal shirt, a lanyard and a badge
  cap in their tool's colour (Claude orange, Cursor white, Codex green), and their name tag carries an **AI** mark. The
  helper's owner (or the host or an admin) can change it from the helper's card: **Change its look** opens the same
  creator, and **Reset** there goes back to the tool's colours.
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
  built from the layered parts in Pixel Agents' order (`app/ui/officelooks-core.js`, shared by the browser, the server's
  look check, the contact sheets and the tests). The read frames hold a page (the art's own prop) so the hands show.
- Colours are a palette swap, not a tint: every distinct colour of a part is a shade of its ramp, and each keeps its
  place on the ramp (its lightness step from the part's reference shade in OKLab; for coloured sources its chroma ratio
  and hue offset too). Grey sources get hand-made style hue shifts: shadows cooler, highlights warmer. Near-black
  outlines, lenses, badges and shirt whites are kept, the body's outline stays dark on light skin, and the number of
  distinct shades never changes. Each look is recoloured and composed once into a cached canvas (and mirrored once for
  facing left), so a floor of 20 people draws 20 cached pictures a frame.
- Looks are numbers (`{ v: 2, body, skin, hair, hairColor, ... }`, lists append-only); a look saved before v2 still reads
  as it did.
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
look (people only); `{look, for: helperId}` sets an AI helper's, for its owner, the host or an admin. The server checks every value: known tile names, furniture ids in capitals only, sizes clamped,
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

**Checking the characters.** `node scripts/dev/office-looks-sheet.js [dir]` draws contact sheets with the app's own
rules: every part in every colour, every part's frames (front, back, side, walking, seated), 60 random characters, every
skin tone with every hair colour, every frame of a few looks, and characters on the office floor by the furniture.
`python3 scripts/dev/office-looks-parts.py` remakes the 31 derived parts. `node app/test/office_looks_test.js` checks
that every part keeps the 16×32 frame grid, stays within 4px of the body, moves with the head (no jitter), keeps every
shade when recoloured, and that random characters have no holes or clashes.

Files: `app/ui/officelooks-core.js` (parts, palettes, the palette swap, look rules), `app/ui/officelooks.js` and
`officelooks.css` (Your look), `app/ui/agentsoffice.js` (Agents & office), `app/ui/officespace.js` (the floor, characters, wardrobe, editor; the card's body is office.js's), `app/ui/officespace-art.js` (loading and
drawing the art), `app/ui/officespace-sets.js` (sets and starting looks), `app/ui/officespace.css`, `app/ui/office.js`
(the office and the Floor/Desks switch), `server/office.js`. Test: `app/test/e2e_office_space.py`.
