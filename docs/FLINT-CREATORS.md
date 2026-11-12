# Flint for creators: driving Blender, Photoshop and friends

A plan for the next step of Flint: a lightweight local "creators" helper that controls creative apps (Blender, Photoshop,
GIMP, Krita, Figma, DaVinci Resolve and more) with a fixed set of free, offline actions, a small local model that turns a
request into tool calls, and Claude or another cloud AI as the booster. The same rule as everywhere in TribeCode
([DESIGN-SYSTEM.md §11](DESIGN-SYSTEM.md#11-basic-features-supercharged-by-ai)): **the basic version works with no AI;
an AI makes it effortless.**

Researched November 11, 2026. Everything below is paraphrased; the sources are listed at the end.

## What exists today

| App | How an LLM controls it today | What it can do | What to watch |
|---|---|---|---|
| **Blender** | [blender-mcp](https://github.com/ahujasid/blender-mcp) (MIT, community): an add-on inside Blender runs a small socket server; a separate MCP server talks to it with JSON over TCP | About nine tools: run Python in the live session, describe the scene, render a look at it, search and import Poly Haven / Sketchfab assets, generate 3D models through outside services | The run-Python tool can do anything; the README calls it potentially dangerous and says to save first. The socket has no authentication, so it must stay on localhost. A "safe mode" checks scripts and blocks file, network and process access. Light anonymous telemetry is on unless turned off |
| **Photoshop, InDesign, Premiere** | [adb-mcp](https://mikechambers.com/blog/post/2025-06-06-exploring-ai-integration-with-adobe-photoshop-indesign-and-premiere-pro) (a proof of concept by an Adobe developer, not an Adobe product): MCP server ↔ a Node relay ↔ a UXP plugin inside each app | Photoshop has the most: rename and tidy layers, describe a file, build layered designs from a prompt. Premiere and InDesign only basics | UXP plugins can only dial out, so a relay is required. Images move through files, not the socket. The AI can't see the result unless it is exported. One tool per API makes the server large |
| **GIMP 3** | [gimp-mcp](https://glama.ai/mcp/servers/@maorcc/gimp-mcp/blob/9d3b347ef9616061691630bc7b0a352ce328abb4/CLAUDE.md): a Python plug-in opens a localhost socket; the MCP server forwards to it | One tool that runs Python-Fu (GIMP 3's PyGObject API) with state kept between calls | Arbitrary code with GIMP's rights and no authentication; localhost only |
| **Krita** | Krita has built-in Python scripting (the Scripter and the `krita` module). Community MCP servers exist ([Glama's Krita list](https://glama.ai/mcp/servers/integrations/krita), [krita-mcp on PyPI](https://pypi.org/project/iflow-mcp_maryfellowes-krita-mcp/)); [Krita AI Diffusion](https://github.com/Acly/krita-ai-diffusion) adds image generation inside Krita | Canvas and layer operations through the scripting API | Same pattern and the same risks as GIMP: a plug-in that executes what it is sent |
| **Figma** | Figma's own [MCP server](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts) ([guide](https://github.com/figma/mcp-server-guide)): a recommended remote server plus a desktop one | Read tools (design context and code for a selection, variables and styles, screenshots, assets, Code Connect) and, on the remote server, write tools that create and edit layers, turn HTML or live web UI into layers, upload assets and make FigJam diagrams | Most write tools are remote-only, so they need a Figma account and the cloud; some tools need paid seats |
| **DaVinci Resolve** | [davinci-resolve-mcp](https://github.com/samuelgursky/davinci-resolve-mcp): Resolve's official Scripting API through an MCP server | 37 grouped tools (or 390 granular, one per API method): timeline and conform, media pool and ingest, render and deliver, color, Fusion, audio, markers; plus an offline server that edits project files without Resolve running | External scripting needs Resolve Studio; the free edition only works through a bridge script that Blackmagic could close (and 21.1 moved Python scripting to Studio) |

**Small local models that call tools.** Ollama's [tool calling](https://docs.ollama.com/capabilities/tool-calling) takes a
`tools` list (a name, a description and a JSON schema per function) on `/api/chat`, answers with `tool_calls`, and loops:
run the tool, send back a `tool` message, ask again; it supports several calls at once and streaming, and its examples use
Qwen3. A July 2026 survey of [local agent models](https://d-central.tech/local-llm-agent-capability/) says reliability drops
sharply below about 4B parameters: Qwen3-4B-Instruct-2507 is the smallest Qwen that drives tools well, 8B and up is
recommended, 1.7B and smaller are unreliable unless fine-tuned for one job (there are tool-router fine-tunes of Qwen3
0.6B and 1.7B, and FunctionGemma-270M). Two practical rules from it: constrain the output to the JSON schema with a
grammar for models under 8B, and strip `<think>` blocks before parsing tool calls.

**The common shape.** Every bridge above is the same three parts: a plug-in inside the app that can execute things, a
local socket or relay, and an MCP server that names the tools. The danger is also the same: a "run any code" tool with no
authentication. The useful part is a handful of well-named, specific tools.

## TribeCode's design

```
 you ─► Flint (rules + NLU, free) ─► a creator skill's stock action ─► the app's bridge ─► Blender / Photoshop / …
              │                           ▲
              ├─ small local model ───────┘  (intent → tool calls, when the rules aren't sure)
              └─ Claude / cloud AI ──────────  (plans many steps, writes new scripts: always shown, always confirmed)
```

1. **Creator skills are MCP tool bridges.** Each app gets a skill folder (`skills/creators/<app>/`): a `SKILL.md` that says
   what it can do, the stock actions as named tools with JSON schemas, and the bridge (an add-on, a UXP plugin or a
   script). Where a good open-source bridge exists (blender-mcp, gimp-mcp, davinci-resolve-mcp, Figma's server), the skill
   wraps it instead of rewriting it, and TribeCode's MCP directory (`app/ui/mcpdir.js`) lists it with setup steps. Any
   member's own Claude Code, Codex or Gemini can then use the same tools.
2. **Stock actions, offline and deterministic.** The free tier is a fixed set of small, well-tested scripts that need no
   model and do one thing each. They are the only things the free tier runs:
   - Blender: **turntable render** (shipped as a stub, below), export to GLB/FBX/OBJ, decimate for the web, apply a
     material palette from the inspiration board, render a thumbnail for the project card.
   - Photoshop / GIMP / Krita: export all layers or artboards as PNG/WebP, resize to a preset list (app icons, social
     cards, store screenshots), batch rename layers from a pattern, apply the project's palette to swatches, flatten and
     save a copy.
   - Resolve: render with a preset (web 1080p, vertical 9:16), add the project's title card, export the timeline as EDL.
   - Any app: batch rename files, convert image formats, make a contact sheet.
   Each action is a template plus parameters checked against a schema, so Flint's local brain (`app/ui/flintnlu.js`)
   can fill it from "render a turntable of hero.glb at 1080" with no model at all.
3. **A lightweight local model for intent → tool calls.** When the rules aren't sure, a small model picks the action and
   fills its parameters: Qwen3-4B-Instruct (or a tool-router fine-tune) through Ollama's `tools` API on the host, or in
   the browser with WebGPU. Its output is grammar-constrained to the tool schemas and only ever selects among stock
   actions; it never writes code. Phones and weak machines skip it and use the rules.
4. **Claude and cloud AI as the booster.** A member's own Claude (or the host's key) plans many steps ("make a 30-second
   trailer from these renders"), writes new scripts for things no stock action covers, and turns a successful new script
   into a new stock action for the tribe. Every generated script is shown to a human before it runs.

## Safety

- **Confirm destructive actions.** Anything that deletes, overwrites, saves over the open file, renders for a long time,
  spends money (paid generators) or sends data out needs a tap on a confirmation card, like approvals today
  (`server/approvals.js`). Stock actions declare `destructive: true|false` in their schema.
- **No arbitrary code from the free tier.** Rules and the small model can only call stock actions with checked
  parameters. Generated code (Claude, cloud) is shown in full first and runs only after a person presses Run.
- **Write files, don't execute (phase 1).** The first bridges produce a script the person runs themselves (today's
  Blender stub). Nothing in TribeCode starts an app or a process.
- **Sandboxing.** Bridges listen on `127.0.0.1` only, with a per-session token (blender-mcp and gimp-mcp have none, so
  TribeCode's wrapper adds one). Prefer each app's own restricted modes (blender-mcp's safe mode; Blender's
  "Auto Run Python Scripts" off for downloaded .blend files). Scripts run in a working folder inside the project
  (`renders/`, `exports/`), never touching other paths; outputs land as new files, never over originals.
- **Agents ask.** An AI helper's creator actions go through the project's roles (`server/perms.js`): builders can run
  stock actions; anything destructive or outward goes to `request_approval` first.
- **Credit and licenses.** Imported assets (Poly Haven is CC0; others vary) are recorded with their license, like the
  inspiration board does.
- **Telemetry off.** Wrapped bridges run with their telemetry turned off by default.

## Phased plan

| Phase | What | Tier |
|---|---|---|
| **0 · now** (this branch) | The **Blender bridge stub**: "make a blender turntable [for model.glb]" writes a reviewed Python script to `<tribe>/exports/blender/<project>-turntable.py`; you run `blender -b -P <script>` yourself. Free · no AI | Free · no AI |
| 1 · stock actions as scripts | 10–15 stock actions across Blender, GIMP/Krita, Photoshop (UXP), Resolve, each a template + schema + test; Flint's NLU learns their phrases; output into `exports/` | Free · no AI |
| 2 · bridges | `skills/creators/<app>/` wrapping blender-mcp, gimp-mcp, davinci-resolve-mcp and Figma's server, listed on the MCP page with setup; a localhost token per session; confirmation cards for destructive actions; actions run in the open app after a tap | Free · no AI |
| 3 · local intent model | Qwen3-4B-class model via Ollama tools (host) or WebGPU (desktop browser), grammar-constrained to stock actions; did-you-mean cards when unsure | Free · small model |
| 4 · boosted | Claude/cloud plans multi-step creative jobs, writes new scripts (shown, then confirmed), and promotes good ones to tribe stock actions; renders and exports flow into the proof-of-work ZIP | A stronger AI |

## What shipped in phase 0

- `server/flintrun.js` → `POST /api/flint/blender { model?, frames?, size?, engine?, name? }` writes the script and returns
  its path and the command to run. TribeCode never starts Blender and never executes the script.
- The script frames whatever meshes are in the scene (or imports `--model`), adds a camera on a circle around them with a
  pivot keyframed through one full turn, a three-point light and a floor, picks EEVEE (Next on 4.2+) or Cycles, renders
  PNG frames and, when Blender has FFmpeg, an MP4. It only adds objects named `TC_*` and never saves the .blend.
- Flint: "make a blender turntable", "make a blender turntable for hero.glb". Test: the end of
  `app/test/e2e_flint_runthrough.py` (the file is written, it parses as Python, it names the model and renders).

## Sources

- ahujasid, blender-mcp (README, November 2026): https://github.com/ahujasid/blender-mcp
- Mike Chambers, "Exploring AI integrations with Adobe Photoshop, InDesign and Premiere Pro" (June 6, 2025): https://mikechambers.com/blog/post/2025-06-06-exploring-ai-integration-with-adobe-photoshop-indesign-and-premiere-pro
- maorcc, gimp-mcp (CLAUDE.md on Glama): https://glama.ai/mcp/servers/@maorcc/gimp-mcp/blob/9d3b347ef9616061691630bc7b0a352ce328abb4/CLAUDE.md
- Glama, Krita MCP servers: https://glama.ai/mcp/servers/integrations/krita · krita-mcp on PyPI: https://pypi.org/project/iflow-mcp_maryfellowes-krita-mcp/ · Acly, Krita AI Diffusion: https://github.com/Acly/krita-ai-diffusion
- Figma, MCP server tools and prompts: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts · guide: https://github.com/figma/mcp-server-guide
- samuelgursky, davinci-resolve-mcp: https://github.com/samuelgursky/davinci-resolve-mcp
- Ollama, tool calling: https://docs.ollama.com/capabilities/tool-calling
- D-Central, "Local LLM agent capability: which open models reliably drive tools" (July 2026): https://d-central.tech/local-llm-agent-capability/
- Tool-router fine-tunes of small Qwen3 models (examples): https://huggingface.co/AryanNsc/qwen3-0.6b-tool-router · https://featherless.ai/models/contextboxai/Qwen3-1.7B-FC
