# Screenshots of other people's tools: what we may use, and who to ask

The Workshop and the website's free toolbox show a real screenshot of a tool only when that project's own terms
clearly allow reuse on someone else's site. Everything else stays a TribeCode drawing until its makers say yes.
Checked on 2026-11-14. Records for the pictures in use: `templates/studio-shots.json` and
`site/assets/toolbox/CREDITS.md`.

Rules that always hold: never a logo as the picture, never remove a watermark, show the picture whole, credit it
where it is shown.

## In use

| Tool | Picture | Licence |
| --- | --- | --- |
| Godot | The editor with the third-person shooter demo, from `godotengine/godot-design` | CC BY 4.0 |
| Penpot | Inspect mode, from `penpot/penpot-docs` | MPL-2.0 |

## Ask for permission

No terms we could find allow reuse. Each has a short note the owner can send. Fill in the name and send it from the
project's own address.

### ArtCraft

Its screenshots are in `storytold/github-media`, which has no licence file; `NOTICE` reserves the name and logos.
Contact: open an issue at https://github.com/storytold/artcraft/issues, or use the contact on https://getartcraft.com/.

> Hi! TribeCode is a free, open-source app that lists ArtCraft first in its Workshop and on its free toolbox page
> (https://tribecode.org/toolbox.html), linking to your site for downloads. May we show one or two of your screenshots there,
> unchanged except for resizing, credited to ArtCraft with a link? If yes, which ones, and what credit line would you like?

### Pixelorama

The code is MIT, but the repository has no screenshots and the docs repository has no licence file.
Contact: https://github.com/Orama-Interactive/Pixelorama/discussions, or the contact on https://orama-interactive.itch.io/pixelorama.

> Hi! TribeCode is a free, open-source app that recommends Pixelorama for pixel art in its Workshop and on its free
> toolbox page, linking to your download page. May we show one screenshot of Pixelorama there, unchanged except for
> resizing, credited to Orama Interactive with a link? If yes, which one, and under what licence or credit line?

### Krita

A press kit exists (linked from https://krita.org/en/about/press/), but no reuse terms are stated for it.
Contact: the address given on the press page (the Krita Foundation; confirm it there before sending), or the Krita section of the KDE forum.

> Hi! TribeCode is a free, open-source app that recommends Krita in its Workshop and on its free toolbox page, linking
> to krita.org for downloads. May we show one screenshot from your press kit there, unchanged except for resizing,
> credited to the Krita Foundation and the artist? If yes, what credit line and licence should we state?

### OBS Studio

No terms found for screenshots of the app.
Contact: the contact on https://obsproject.com/, or https://github.com/obsproject/obs-studio/discussions.

> Hi! TribeCode is a free, open-source app that recommends OBS Studio in its Workshop and on its free toolbox page,
> linking to obsproject.com for downloads. May we show one screenshot of OBS Studio there, unchanged except for
> resizing, credited to the OBS Project with a link? If yes, which one, and what credit line would you like?

## Needs checking and fetching from a normal network

These probably have a usable picture, but the licence text could not be read from the build sandbox (those sites are
blocked there), so nothing was used. On a normal network: open the page, confirm the licence in the project's own
words, then add a record to `templates/studio-shots.json` and run `python3 -I scripts/dev/toolbox-shots.py`.
A share-alike picture (CC BY-SA) must be shown unmodified apart from resizing and credited with the licence link,
which is what the cards already do.

| Tool | Where to look | Believed licence (not verified) |
| --- | --- | --- |
| Blender | The Blender Manual, https://docs.blender.org/manual/en/latest/copyright.html (pictures of the interface in the manual) | CC BY-SA 4.0 |
| Kdenlive | The Kdenlive manual, https://docs.kdenlive.org/ (licence in its footer); app screenshots at https://cdn.kde.org/screenshots/kdenlive/ have no stated terms | CC BY-SA 4.0 for the manual |
| Audacity | The Audacity manual, https://manual.audacityteam.org/ (licence in its footer) | CC BY 3.0 |

If a licence turns out different from the one believed here, or does not cover the pictures, move the tool to
"Ask for permission".

## The other tools in the Workshop

LMMS, Material Maker, BeepBox, Shotcut, GDevelop, LÖVE, raylib, Bevy, Fyrox, Stride, Pyxel, TIC-80 and Twine keep
their drawn tiles. They are not on the website's toolbox page and were not checked in this pass.
