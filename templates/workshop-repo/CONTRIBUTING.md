# Contributing to the Workshop

Thank you for sharing. Everything here is free for anyone to use, so please only donate things you made yourself (or that are already under one of the licenses below) and that you are happy for everyone to reuse.

## Licenses (required)

Every item must carry one of these in `workshop.json` → `license`:

| License | Use it for | What users must do |
| --- | --- | --- |
| `CC0-1.0` | Art, audio, models, data | Nothing. Public domain. |
| `CC-BY-4.0` | Art, audio, models | Credit the author. |
| `MIT` | Code, scripts, skills, recipes, templates | Keep the license notice. |
| `Apache-2.0` | Code (with a patent grant) | Keep the notice. |

No other licenses, no "all rights reserved", no assets ripped from games or stores, no AI output you don't have the right to share. Items without a valid license fail the check.

## One item = one folder

```
items/double-jump/
  workshop.json
  doublejump.js
  README.md          (optional)
```

`workshop.json`:

```json
{
  "schema": 1,
  "id": "double-jump",
  "kind": "recipe",
  "title": "Double jump for 2D platformers",
  "summary": "A second jump while airborne. Reset p.jumps on landing.",
  "tags": ["platformer", "movement"],
  "license": "MIT",
  "author": "Maya",
  "version": "1.0.0",
  "files": [
    { "path": "doublejump.js", "size": 356, "sha256": "dbe90e02…64 hex characters…" }
  ],
  "preview": "preview.png",
  "check": { "kind": "test", "run": "npm test -- doublejump", "note": "A second jump works, a third does not." }
}
```

- `id`: lowercase letters, numbers and dashes, the same as the folder name.
- `kind`: `skill`, `recipe`, `template`, `asset` or `script`.
- `files`: every file in the folder except `workshop.json`, each with its exact `size` in bytes and `sha256`. Nothing may be in the folder that is not listed.
- `preview` (optional): one of the item's PNG, JPEG, WebP or GIF files.
- `check` (recipes): how a person proves it works. Nobody runs it automatically.

## Rules the check enforces

- Allowed file types: `glb gltf bin png jpg jpeg webp gif svg ogg mp3 wav json md txt js ts lua gd cs py glsl frag vert wgsl`. SVG is offered as a download only; code is treated as text.
- 25 MB per file, 100 MB per item, 300 files per item.
- Safe paths only: no `..`, no absolute paths, no `.git`, no symlinks, no Windows device names.
- Sizes and sha256 must match the bytes.
- A pull request may only change files under `items/`. `index.json` is rebuilt by the Action after a merge.

Run the check yourself: `node scripts/validate.js`.

## Updating an item

Change the files, update `files[]` (sizes and hashes) and bump `version` (for example `1.0.0` → `1.0.1`). TribeCode's **Donate to community** does all of this for you.

## For maintainers

- Merge only when the "Validate workshop" check is green **and** the pull request does not touch `.github/` or `scripts/` (the check refuses that, but a pull request can edit the workflow it runs).
- Open a couple of the files. A green check proves the files are what `workshop.json` says, not that they are good or that the license claim is true.
