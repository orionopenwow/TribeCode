# The Workshop

The Workshop is the tribe's shared library, in its own area apart from projects (`#/workshop`). It holds what people and their Claude Code agents figured out, so nobody builds it twice:

| Kind | What it is |
| --- | --- |
| **Skill** | A Claude Code skill or agent recipe: a folder with a `SKILL.md` (its front matter fills in the summary). |
| **Recipe** | A feature script with a **check** that proves it works, such as "double jump for a 2D platformer" or "web push setup". This is the first step of the Tribe Brain (docs/CONTEXT.md): replay a recipe instead of spending tokens again. |
| **Template** | A project starter, like `templates/starter-game`. |
| **Asset** | GLB/glTF models and animations, sprites, audio, shaders. |
| **Script** | Game scripts and tools, kept as text. |

There are two shelves:

- **Tribe library**: lives in the tribe folder (`workshop/`), shared by every project in the tribe, versioned in git like the rest of the folder.
- **Community shelf**: a public GitHub repo (default `orionopenwow/tribecode-workshop`) served read-only through [jsDelivr](https://www.jsdelivr.com/), a free CDN for open-source projects. Tribes bring items in from it and donate items to it. That's the shared open-source database of everyone's discoveries.

Code: `server/workshop.js` (library, community, donate), `server/mcp-workshop.js` (agent tools), `app/ui/workshop.js` + `workshop.css` (the area), `templates/workshop-repo/` (the community repo scaffold), tests in `app/test/e2e_workshop.py`.

## Flows

**Add to Workshop.** Pick files or a folder in a project (the project's folder on the host), or upload files. Choose a kind, a title and a license. Paths in the item are relative to the common folder of what was picked; files of types that aren't allowed are skipped when you pick a folder and refused when you pick them directly. People publish straight into the library.

**Agents suggest, people approve.** An agent's `workshop_publish` creates a suggestion and a medium-risk approval (server/approvals.js) addressed to its owner. It shows up in the Workshop under "Waiting for you" and in the inbox (phone push, one-tap Approve/Deny). Only on approval does it enter the library. Denied suggestions are deleted. Agents never approve, never donate to the community and never bring community items in.

**Use in project.** Copies an item's files into a folder of a project you are in (default `workshop/<id>/`). The dialog shows the files, the license and the author first, and flags files that already exist (replace them only with an explicit "overwrite"). It **never runs or installs anything**: scripts are files. Every file's sha256 is checked again before copying, so an item edited on disk since publishing is refused. Usage is recorded, so each item shows **Used in** (only projects the viewer can see) and the project chat gets a one-line note.

**New version.** Publishing again with the same id (the "New version" button, or `id` in `workshop_publish`) bumps the version (`1.0.0` → `1.0.1`, or the version you give if it is higher) and keeps a short history. Only the publisher (or their agent) and the host can bump or remove an item; anyone else publishing that title gets a new id.

**Get from the community.** Downloads an item into the tribe library after checking it (see Safety). Then use it like any other item.

**Donate to the community.** People only. It writes a ready-to-upload bundle to `workshop/donations/<id>@<version>/items/<id>/` (the files plus a public `workshop.json` without local data) and an `index-entry.json`, then offers:

- **Open GitHub upload**: `https://github.com/<repo>/upload/main/items/<id>` (GitHub offers to fork if you can't push), with copyable step-by-step instructions;
- **Open a pull request for me**: with the member's GitHub token (Settings → GitHub token, stored on the host in `.tribe/secrets/`, never sent to clients), TribeCode forks the repo, creates a branch `workshop/<id>-<version>`, uploads the files with the contents API and opens the PR. The API base is `TRIBE_GITHUB_API` (default `https://api.github.com`).

The community repo's GitHub Action validates the PR and rebuilds `index.json` after it merges.

## Item format

A folder with a `workshop.json` and the item's files next to it:

```
workshop/items/patrol-bot/
  workshop.json
  bot.glb
  bot-poster.png
```

```json
{
  "schema": 1,
  "id": "patrol-bot",
  "kind": "asset",
  "title": "Patrol bot",
  "summary": "Low-poly bot with walk and idle.",
  "tags": ["glb", "3d"],
  "license": "CC-BY-4.0",
  "author": "Orion",
  "version": "1.0.0",
  "files": [
    { "path": "bot-poster.png", "size": 362, "sha256": "626c0000…", "info": { "w": 96, "h": 72 } },
    { "path": "bot.glb", "size": 296, "sha256": "f64775a0…", "info": { "meshes": 1, "nodes": 2, "materials": 1, "animations": 2, "animationNames": ["Walk", "Idle"] } }
  ],
  "preview": "bot-poster.png",
  "check": { "kind": "test", "run": "npm test -- bot", "note": "walk cycle loops" },
  "created": "2026-11-06T10:00:00.000Z", "updated": "2026-11-06T10:00:00.000Z", "by": "orion-x1y2",
  "history": [{ "version": "1.0.0", "at": "2026-11-06T10:00:00.000Z", "by": "orion-x1y2" }],
  "source": { "type": "project", "project": "pixel-quest" }
}
```

| Field | Rules |
| --- | --- |
| `id` | `^[a-z0-9][a-z0-9-]{1,63}$`, from the title if not given. Same as the folder name. |
| `kind` | `skill`, `recipe`, `template`, `asset`, `script`. |
| `title` | Required, 80 characters. `summary` 400. `tags` up to 12, lowercase-dashes. |
| `license` | **Required**: `CC0-1.0`, `CC-BY-4.0`, `MIT` or `Apache-2.0`. |
| `version` | `major.minor.patch`. |
| `files[]` | `path`, `size`, `sha256` for every file. `info` is derived by the server: image `w`/`h` (and `frames` for a horizontal sprite strip), GLB/glTF stats, text line counts. |
| `preview` | Optional: one of the item's PNG/JPEG/WebP/GIF files. Otherwise the server picks an image named preview/poster/thumb/cover, then any image. |
| `check` | Optional (recipes): `kind` (`test`, `screenshot`, `manual`), `run`, `file`, `note`. Shown to people; **never run automatically**. |
| local only | `created`, `updated`, `by`, `history`, `source`, `approvedBy`. Stripped from community bundles. |

Previews in the app: images are shown as images (pixelated when small), sprite strips are animated with CSS `steps()`, GLB/glTF items show their poster image if they have one, plus mesh/animation counts read from the GLB's JSON chunk, code shows its first lines, audio gets a player. Tribe files load as blobs with the member token in a header (never in a URL); community previews load straight from jsDelivr.

## Safety

The server is reachable from the internet (Tailscale Funnel, cloudflared), and community items come from strangers, so everything in the Workshop is untrusted data.

- **Nothing executes.** No install scripts, no auto-run, no `eval`. "Use in project" copies bytes. Recipe checks are text for a human.
- **Allowlisted types** only: `glb gltf bin png jpg jpeg webp gif svg ogg mp3 wav json md txt js ts lua gd cs py glsl frag vert wgsl`.
- **Served safely.** Every file response has `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`. Code and text are served as `text/plain`, never as JavaScript or HTML. **SVG is download-only** (`application/octet-stream`, `Content-Disposition: attachment`), because an SVG opened as a page can run script. Models and `.bin` are attachments too.
- **Size limits:** 25 MB per file, 100 MB per item, 300 files per item; downloads are cut off as soon as they pass the declared size.
- **Paths:** no absolute paths, `..`, `.git`, control characters, trailing dots/spaces or Windows device names (the host may be Windows); symlinks are refused when picking files, and a "Use in project" destination may not lead outside the project through a symlinked folder. Writes go to a temp folder that is swapped in.
- **sha256** is computed on publish (and must match when an upload declares one), checked again on every use and donation, and checked for every community file against both the item's `workshop.json` and the shelf's `index.json`, together with the exact size. Any mismatch rejects the whole item.
- **Who can do what:**

| | Browse | Publish to the library | Approve suggestions | Use in a project | Get from community | Donate | Remove |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tribe member | ✓ | ✓ | when asked (owner of the agent) | any project | ✓ | ✓ | their items |
| Project-scoped friend | ✓ | from their projects | when asked | **only their projects** | ✓ | ✓ | their items |
| Host | ✓ | ✓ | ✓ | any project | ✓ | ✓ | any item |
| Agent | ✓ (MCP) | suggestion only | never | projects it can see | never | never | never |
| Spectator | ✓ | — | — | — | — | — | — |

## Community shelf

The tribe reads `index.json` from `TRIBE_WORKSHOP_CDN` (default `https://cdn.jsdelivr.net/gh`) as `<cdn>/<owner>/<repo>@main/index.json`, and item files as `<cdn>/<owner>/<repo>@main/items/<id>/<path>`. The repo comes from `TRIBE_WORKSHOP_REPO`, else the host's setting (Workshop → Community → Change repo, stored in `.tribe/workshop.json`), else `orionopenwow/tribecode-workshop`. The index is cached for 5 minutes (Refresh forces it).

If the repo or its index doesn't exist yet (404), the Community tab shows an empty state that explains how to create it from `templates/workshop-repo/`. Offline, the tribe library keeps working. Entries that fail validation are skipped and counted, not shown.

`index.json` schema (written by the community repo's Action):

```json
{
  "schema": 1,
  "repo": "orionopenwow/tribecode-workshop",
  "updated": "2026-11-06T12:00:00.000Z",
  "items": [
    {
      "schema": 1,
      "id": "slime-hop",
      "kind": "asset",
      "title": "Slime hop",
      "summary": "Three-frame slime.",
      "tags": ["sprite", "2d"],
      "license": "CC0-1.0",
      "author": "Ana",
      "version": "1.2.0",
      "files": [{ "path": "slime.png", "size": 206, "sha256": "…64 hex…" }],
      "preview": "slime.png",
      "path": "items/slime-hop",
      "size": 206
    }
  ]
}
```

### Starting the community repo

`templates/workshop-repo/` is ready to commit as the public repo: `README.md`, `CONTRIBUTING.md` (license rules), an empty `index.json`, `items/`, `scripts/validate.js` (zero dependencies, the same rules as the server) and `.github/workflows/validate.yml`, which on every pull request allows changes only under `items/`, rejects files over 25 MB and validates every `workshop.json` (licenses, types, paths, sizes, sha256, no unlisted files, no symlinks), and on `main` rebuilds and commits `index.json`. jsDelivr caches `@main` for up to 12 hours; purge with `https://purge.jsdelivr.net/gh/<owner>/<repo>@main/index.json`.

## Agent tools (MCP)

| Tool | What it does |
| --- | --- |
| `workshop_search` | Search the library (or `community: true` for the shelf) by words and kind. Agents should look here before building. |
| `workshop_publish` | Suggest files/folders from the agent's project (`kind`, `title`, `paths`, `license`, optional `summary`, `tags`, `id`, `preview`, `version`, `check`). Returns an approval id to poll with `check_approval`. |
| `workshop_use` | Copy an item into the agent's project (`id`, optional `dest`, `overwrite`). Returns the files, license and author. |

They are wired through `extraTools` in `server/index.js`; `server/mcp.js` is unchanged.

## HTTP

All under `/api/workshop` with a member token: `GET items?q=&kind=`, `GET items/:id`, `GET items/:id/files/<path>`, `POST items` (`from: { project, paths }` or `files: [{ path, data, sha256? }]`), `POST items/:id/use` (`project`, `dest`, `overwrite`, `dry`), `POST items/:id/donate` (`pr`), `DELETE items/:id`, `GET pending`, `GET pending/:id/files/<path>`, `POST pending/:id/approve|deny`, `GET browse?project=&dir=`, `GET community[?refresh=1]`, `POST community/:id/get`, `GET|PUT config`. Live updates: a tribe-wide `{ type: 'workshop' }` WebSocket event.

## Next

- A small zero-dependency WebGL viewer for GLB previews (today: poster image + stats).
- Recipes in the Tribe Brain: the local brain searches recipes before an agent builds, applies the template and asks a human to run the check; passing recipes rank higher.
- Signed community items (a maintainer key in the index) on top of sha256.
