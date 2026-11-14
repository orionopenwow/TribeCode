# The free toolbox: licences and sources

The website's toolbox page (`site/toolbox.html`) lists open-source tools that TribeCode's Workshop points to. TribeCode
does not bundle or redistribute any of them; each installs from its own site.

## Pictures

A real screenshot is used only where the project's own terms clearly allow reuse on someone else's site. Today that
is two tools. Each picture is shown whole, only resized and recompressed (no crop, no retouching, nothing removed),
with its credit under it on the page and in the app's Workshop. The same records, machine-readable, are in
`credits.json` next to this file (generated from `templates/studio-shots.json`).

| Tool | Files | Author | Licence | Source | Terms read | Fetched | Attribution shown |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Godot | `godot-640.webp/.jpg`, `godot-1280.webp/.jpg` | Godot Engine contributors | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://github.com/godotengine/godot-design/blob/master/screenshots/editor_tps_demo_1920x1080.jpg | The repository's README: "Unless otherwise specified, files contained in this repository are licensed under CC BY 4.0 International"; `LICENSE` | 2026-11-14 | Screenshot: Godot Engine contributors, CC BY 4.0 (both linked) |
| Penpot | `penpot-640.webp/.jpg`, `penpot-1066.webp/.jpg` | Penpot contributors | [MPL-2.0](https://www.mozilla.org/MPL/2.0/) | https://github.com/penpot/penpot-docs/blob/main/img/inspect/inspect-workspace.webp | The docs repository's `LICENSE` (MPL-2.0) covers the files in it | 2026-11-14 | Screenshot: Penpot contributors, MPL-2.0 (both linked) |

Changes made to both: resized and recompressed. Nothing else.

Every other picture on the page is an original flat drawing made for TribeCode (`site/toolbox.js`). No project's
logo or wordmark is used anywhere, and no watermark was removed from anything.

Why the others are still drawings (the request to send, or what to verify, is in `docs/SCREENSHOT-PERMISSIONS.md`):

- ArtCraft: its screenshots live in a separate media repository (`storytold/github-media`) with no licence file, and
  its `NOTICE` says the name, wordmark and logos are trademarks not covered by the code licence.
- Pixelorama: the code is MIT but the repository holds no screenshots; its docs repository has no licence file.
- Krita: a press kit is offered, but no reuse terms are stated for it.
- OBS Studio: no terms found for its screenshots.
- Blender, Kdenlive, Audacity: their manuals are believed to be under Creative Commons licences, but that could not
  be read from the build sandbox, so nothing was used.

Names appear in plain text only, to say which tool is meant.

To refresh the files: `python3 -I scripts/dev/toolbox-shots.py`, then `node scripts/dev/site-toolbox.js`.
`npm test` runs both with `--check`.

## Licences

Read from each project's own licence file in its repository on 2026-11-14.

| Tool | Licence | Licence file read | Source |
| --- | --- | --- | --- |
| ArtCraft | MIT or Apache-2.0, at your option | `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE` | https://github.com/storytold/artcraft |
| Blender | GPL-3.0 as a whole ("Blender as a whole is licensed under the GNU General Public License, Version 3") | `COPYING`, `README.md` | https://github.com/blender/blender |
| Krita | GPL-3.0 | `COPYING`, `README.md` | https://github.com/KDE/krita |
| Godot | MIT | `LICENSE.txt` | https://github.com/godotengine/godot |
| Kdenlive | GPL-3.0 | `COPYING` | https://github.com/KDE/kdenlive |
| Audacity | GPL-3.0 | `LICENSE.txt` | https://github.com/audacity/audacity |
| Penpot | MPL-2.0 | `LICENSE` | https://github.com/penpot/penpot |
| Pixelorama | MIT | `LICENSE` | https://github.com/Orama-Interactive/Pixelorama |
| OBS Studio | GPL-2.0 | `COPYING` | https://github.com/obsproject/obs-studio |

Each repository was confirmed to exist. The download links (each project's own site) come from
`templates/studios.json`, the list the app's Workshop uses; they were not fetched from the build sandbox.

TribeCode is an independent project and is not affiliated with any of these tools.
