# TribeCode Workshop: community shelf

Open-licensed skills, recipes, templates, assets and scripts, donated by [TribeCode](https://github.com/orionopenwow/TribeCode) tribes and anyone else who builds things with friends and their AI agents.

Every TribeCode app can browse this shelf from **Workshop → Community**. It reads `index.json` and the files through [jsDelivr](https://www.jsdelivr.com/), a free CDN for open-source projects:

```
https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/index.json
https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/items/<id>/<file>
```

Nothing on this shelf ever runs by itself. A TribeCode tribe that brings an item in checks every file's sha256, size, type and path first, and "Use in project" only copies files.

## What's here

| Kind | What it is | Typical license |
| --- | --- | --- |
| `skill` | A Claude Code skill or agent recipe: a folder with a `SKILL.md` | MIT |
| `recipe` | A feature script with a check that proves it works ("double jump", "web push setup") | MIT |
| `template` | A project starter | MIT or Apache-2.0 |
| `asset` | GLB/glTF models, animations, sprites, audio, shaders | CC0-1.0 or CC-BY-4.0 |
| `script` | Game scripts and tools (as text) | MIT |

## Layout

```
index.json                 built by the Action from items/ after every merge (do not edit by hand)
items/<id>/workshop.json   the item's description, license and file hashes
items/<id>/<files>         the item's files
scripts/validate.js        the checks (zero dependencies, Node 20+)
.github/workflows/validate.yml
```

## Contributing

The easy way: in TribeCode, open an item in your Workshop and choose **Donate to community**. It prepares the folder and opens GitHub's upload page (or the pull request itself, if you saved a GitHub token).

By hand: see [CONTRIBUTING.md](CONTRIBUTING.md). Only these licenses are accepted: **CC0-1.0, CC-BY-4.0, MIT, Apache-2.0**.

## Setting this repo up

1. Create a public GitHub repo (TribeCode looks for `orionopenwow/tribecode-workshop` by default; the host can point a tribe at another one in Workshop → Community → Change repo).
2. Copy this folder into it and push to `main`.
3. In Settings → Actions → General, allow the workflow to write (it commits `index.json`).
4. Protect `main`: require the "Validate workshop" check and a review before merging.

jsDelivr caches `@main` for up to 12 hours. To publish a change at once, purge it: `https://purge.jsdelivr.net/gh/<owner>/<repo>@main/index.json`.
