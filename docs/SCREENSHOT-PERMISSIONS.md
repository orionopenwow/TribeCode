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
| Fyrox | The editor, from `FyroxEngine/Fyrox` (`pics/editor.png`) | MIT |
| Material Maker | The main window, from `RodZill4/material-maker` (its documentation pictures) | MIT |
| Pyxel | The image editor, from `kitao/pyxel` (its documentation pictures) | MIT |

## Ask for permission

No terms we could find allow reuse. Each has a short note the owner can send. Fill in the name and send it from the
project's own address.

### ArtCraft

Its screenshots are in `storytold/github-media`, which has no licence file; `NOTICE` reserves the name and logos.
Since 2026-11-16 the toolbox shows **our own screenshot** of the app (taken on the project owner's computer, kept at
`templates/studio-shots/artcraft.png`), not one of theirs, so no permission from their media repository is needed. The
note below still applies if we ever want their pictures.
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

## Fetch on a normal network

The licence was read (2026-11-14) and allows reuse with credit, but the pictures could not be downloaded from the
build sandbox: the sites are blocked for downloads there and no mirror of the manuals is reachable by git. On a normal
network: open the page, pick the picture, add a record to `templates/studio-shots.json` (copy the Godot one), put the
file where `python3 -I scripts/dev/toolbox-shots.py --from DIR` can find it or let the script download it, then run
`node scripts/dev/site-toolbox.js`. A share-alike picture (CC BY-SA) must be shown whole, changed only by resizing,
and credited with the licence link, which is what the cards already do.

| Tool | Licence, in the project's words | Picture to take | Credit line to show |
| --- | --- | --- | --- |
| Blender | CC BY-SA 4.0. https://docs.blender.org/manual/en/latest/copyright.html : "Except where otherwise noted, the content of the Blender Manual is available under a Creative Commons Attribution-ShareAlike 4.0 International License or any later version. Excluded from the CC-BY-SA license are any logos, trademarks, icons, source code and Python scripts used in this manual." It asks to "attribute the 'Blender Documentation Team' and include a hyperlink" to the manual. | The default screen on https://docs.blender.org/manual/en/latest/interface/window_system/introduction.html (expected file: `https://docs.blender.org/manual/en/latest/_images/interface_window-system_introduction_default-startup.png`; confirm the name on the page). Do not use the splash screen: it is artwork with its own terms and shows the logo. | Screenshot: The Blender Manual, by the Blender Documentation Team, CC BY-SA 4.0 (link the manual and https://creativecommons.org/licenses/by-sa/4.0/) |
| Kdenlive | CC BY-SA 4.0. The footer of https://docs.kdenlive.org/en/ : "licensed under the Creative Commons License SA 4.0 unless stated otherwise". The wording is loose ("SA 4.0"), so check that the page or its repository (invent.kde.org/documentation/docs-kdenlive-org) names CC BY-SA 4.0 before using a picture. | A picture of the whole window from the manual's user interface chapter (https://docs.kdenlive.org/en/user_interface/ ; the picture's address is under `https://docs.kdenlive.org/en/_images/`). The app-store pictures at https://cdn.kde.org/screenshots/kdenlive/ have no stated terms: do not use those. | Screenshot: The Kdenlive Manual, KDE, CC BY-SA 4.0 (link the manual and the licence) |
| Audacity | CC BY 3.0 for the manual's pages. The footer of https://manual.audacityteam.org/ : "Pages in this Manual are available under the terms of the Creative Commons Attribution 3.0 license." It names pages, not pictures, so this is the weakest of the three: use a picture that is plainly part of a manual page. | The dark theme window on https://manual.audacityteam.org/man/audacity_tour_guide.html : `https://manual.audacityteam.org/m/images/f/f4/theme_dark_3_6_0.png` | Screenshot: The Audacity Manual, the Audacity Team, CC BY 3.0 (link the manual and https://creativecommons.org/licenses/by/3.0/) |

If a licence turns out not to cover the pictures, move the tool to "Ask for permission".

## The other tools in the Workshop

Checked briefly on 2026-11-14 (they are in the app's Workshop, not on the website's toolbox page). A picture was taken
only when it is a file in the project's own repository and the repository's licence covers its files.

| Tool | Result |
| --- | --- |
| Fyrox | In use: `pics/editor.png`, MIT (`LICENSE.md`) |
| Material Maker | In use: `material_maker/doc/images/screenshot.png`, MIT (`LICENSE.md`) |
| Pyxel | In use: the first frame of `docs/images/image_editor.gif`, MIT (`LICENSE`) |
| TIC-80 | Drawn tile. The repository (MIT) holds only icons, no screenshot of the app. |
| LMMS, Shotcut, Twine | Drawn tiles. GPL code; no screenshot with stated terms was found in a quick look. Ask the project (their GitHub discussions or forum) before using one from their sites. |
| BeepBox, GDevelop, LÖVE, raylib, Bevy, Stride | Drawn tiles. Not checked file by file: their repositories mix code with example art under other terms, so a picture needs a closer look than this pass gave. |
