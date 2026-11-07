# TribeCode Game Studio: build plan

*Status: research and plan (branch `feat/game-research`, 2026-11-06). No code yet. Sketches below show the idea, not finished code.*

Game Studio lets a tribe build a multiplayer browser game live in a huddle. Everyone plays the same running build, and the world keeps going while agents and people change its code. Work is split into **lanes** (art, combat, movement, levels...) so people and their Claude Code agents don't edit the same files. Tuning, bug pins and huddle decisions are written to session notes automatically.

---

## 1. Recommendation in one screen

| Decision | Choice | Why |
| --- | --- | --- |
| Where the game runs | A **Vite dev server on the host**, opened in an iframe through a new **`/play/` reverse proxy in the TribeCode server** (HTTP and WebSocket) | Uses the host's existing single address (localhost, LAN, Tailscale Funnel or cloudflared), so friends on phones or other networks reach it with nothing extra. HMR travels over the same tunnel. |
| Engine | **Starter template A:** Three.js + Miniplex (3D). **Starter template B:** KAPLAY (2D). Both MIT. | Large LLM training coverage, flat data-oriented code, and systems that are easy to swap. Phaser 4 (MIT) is a fine 2D alternative. |
| Multiplayer sync | **A plain WebSocket relay built into the TribeCode server** (`game-*` messages on the existing `/ws`), with the room snapshot held on the server | No extra dependency or process, works through every tunnel, and fits a friends-only trust model. Upgrade to **Colyseus** (MIT, self-hostable) only if the game later needs server-authoritative physics. |
| Hot reload | **World state lives outside systems.** Systems self-register and self-accept HMR, with a quarantine for systems that throw. The room snapshot on the server survives even full reloads. | An agent's edit replaces the logic and nobody's position resets. |
| Role split | **Lanes:** a named, durable set of path globs plus an owner and that owner's agents, built on the existing soft file claims, with a git pre-commit guard and MCP tools that are aware of lanes | Turns "art person + combat person + agents" into rules the software enforces. |
| Watching each other | Spectating renders **world state, not video**: follow-cam and a picture-in-picture view drawn from a teammate's camera pose. **Video** uses `canvas.captureStream()` on the existing huddle WebRTC, which also works from phones. Replays come from the server's state log. | Costs almost no bandwidth and works on phones. Video is there for the cases that need it. |
| Notes | A **session journal** that subscribes to the server bus (tuning commits, bug pins, `/decide`, lane hand-offs, builds played) and writes into a `Playtest · <date>` doc. The existing captions-to-meeting-notes path adds the summary. | Reuses features that are already shipped. |

**Rejected:** PlayroomKit (a hosted service with no self-hosting option in its docs) and PartyKit (development moved to `cloudflare/partykit`, which runs on Cloudflare Durable Objects). Yjs is good but not needed for game state; section 5 explains why.

---

## 2. What TribeCode already gives us (reuse map)

Found in this repo's code:

| Existing piece | File(s) | Game Studio use |
| --- | --- | --- |
| Zero-dep RFC 6455 WebSocket, one `/ws` endpoint, text frames up to 1 MiB | `server/ws.js`, `server/index.js` | Game relay (`game-state`, `game-input`, `game-tuning` messages). Binary frames are not supported yet; JSON is fine for 6 players at 15 to 20 Hz. |
| Public https share (Tailscale Funnel → cloudflared fallback, auto-download) | `server/share.js` | One address for the app **and** `/play/`. No second tunnel in v0. |
| Soft file claims with folder overlap, 4 h TTL, hand-off | `server/claims.js` | Base for lanes (a lane is a durable named group of claims). |
| MCP endpoint with 14+ tools, plus extra tools from chatx, visuals and repo | `server/mcp.js`, `repo.js`, `visuals.js` | Add lane, tuning, game-state and pin tools. |
| Bug inbox (dedupe, triage, crash capture, Ctrl+Shift+B) | `server/bugs.js`, `app/ui/bugs.js` | Alt+click pins land here (add area `game`). |
| Huddle WebRTC mesh with screen share (`getDisplayMedia`, 15 fps), perfect negotiation | `app/ui/huddle.js` | Add a "Share game view" track (`canvas.captureStream`). |
| Captions → meeting transcript → brain notes → tasks; capture-to-notes | `server/voice.js`, `app/ui/captions.js`, `capture.js` | Session journal. Decisions spoken in the huddle land in playtest notes. |
| Visual compare (screenshots by screen name, % diff, notify above 5%) | `server/visuals.js` | Model thumbnails over time; before and after shots of a level. |
| Repo autopilot, temp-worktree checks, integrator, drift radar | `server/repo.js`, `integrator.js`, `drift.js` | Branch previews and lane-branch merges. |
| Approval board, `/decide`, decision log | `server/board.js`, `approvals.js` | "Play proposal", tuning commits that need approval. |
| Follow a teammate (UI), spectator invite role | `app/ui/app.js`, `server/index.js` | Follow carries into the game (follow-cam). Spectators watch the game without input. |
| Floating quick looks | `app/ui/float.js` | Picture-in-picture panel for a teammate's view. |
| Bus + notify (ntfy, Web Push, desktop) | `server/bus.js`, `notify.js` | "Combat lane pushed a change", "build broken". |

Note: the README says live doc sync uses Yjs, but the code uses a home-grown, server-authoritative OT (`server/ot.js`, `live.js`). Game Studio follows the same in-house, zero-dep approach.

---

## 3. Shared playable canvas

### 3.1 Topology

```
Friend's phone / laptop                     Host PC
┌──────────────────────────┐   https    ┌────────────────────────────────────────────┐
│ TribeCode UI             │──Funnel/──▶│ TribeCode server :4747                     │
│  └ <iframe src=/play/main/>  cloudflared│  ├ /api, /ws, /mcp (existing)              │
│      game client + HMR ws │            │  ├ /play/<name>/*  ──proxy──▶ Vite :5173   │  (HTTP + WS upgrade)
└──────────────────────────┘            │  ├ /play/b/<branch>/* ─static─▶ previews/  │
                                        │  └ game relay + room snapshot (in /ws)     │
                                        └────────────────────────────────────────────┘
```

* **Host button "Start game server".** It spawns `npm run dev -- --port 5173 --strictPort` in the project repo (`--repo`), the same way `share.js` spawns cloudflared. It is host-only and shows logs in the Game tab.
* **Proxy.** `/play/main/*` is piped to `127.0.0.1:5173`, keeping the path. Vite runs with `base: '/play/main/'`. The proxy rewrites `Host` to `localhost:5173`. Vite's `server.allowedHosts` only allows localhost and IP addresses by default to block DNS rebinding, so the rewrite lets proxied requests through without opening `allowedHosts` to tunnel domains. The `upgrade` handler, which today only accepts `/ws`, gains a branch that pipes `/play/*` sockets raw to Vite, so HMR works.
* **Why proxy instead of a second tunnel.** Tailscale Funnel only listens on ports 443, 8443 and 10000. A cloudflared quick tunnel gives a new random URL on every start. Both are awkward for a second service. One origin also keeps a single invite link and QR code.
* **HMR client port.** Vite's docs say a WebSocket-capable reverse proxy needs no extra setup; otherwise the client falls back to connecting to Vite directly. With no `clientPort` set, the HMR client should connect to the page's own host and port, which is the proxy. **Spike item #1:** confirm this through Funnel and through cloudflared. If it fails, set `server.ws.clientPort` from an env var per address. Newer Vite docs move `server.hmr.{clientPort,path,...}` to `server.ws`, so the starter should pin a Vite major version.
* **Quick-tunnel limits.** TryCloudflare caps a tunnel at 200 in-flight requests (HTTP 429 above that), does not support SSE, and is meant for testing. Vite dev serves source files one module at a time, so a phone's first load can make many requests. Mitigations: pre-bundle dependencies with `optimizeDeps`, keep the starter's module count small, and offer phones a **watch build** (`vite build --watch` served statically, with a full reload plus state restore on change) instead of live HMR. Funnel has bandwidth limits that can't be configured. Keep assets compressed (section 6.2).

### 3.2 Auth and sandboxing

* The iframe is same-origin with TribeCode in v0, so the game can use the member's session. **Risk:** game code written by agents runs with the member's TribeCode token. This is acceptable for a friends-only tribe, because the dev server already runs repo code on the host. Mitigation for v1: issue a **scoped play token** that only allows game-room messages, give it to the iframe with `postMessage`, and serve `/play/` on a **separate origin** (Funnel's second port 8443, or a second cloudflared tunnel). Then `sandbox="allow-scripts allow-pointer-lock"` can drop same-origin access.
* Spectator-role members can load `/play/`, but the relay ignores their input messages.

---

## 4. Hot reload that keeps the world

### 4.1 Rules (from the Vite HMR API)

* `import.meta.hot.accept()` must appear literally in the source so Vite can find it by static analysis. A self-accepting module re-runs when it changes. After a syntax error the callback receives `undefined`.
* `hot.data` is a per-module object that survives updates. Mutate its properties; don't reassign it.
* `hot.dispose` cleans up side effects (timers, listeners, meshes) before the new copy runs.

### 4.2 Pattern: registry + self-accepting systems + quarantine

```ts
// src/core/systems.ts  (engine core, owned by the "core" lane; rarely edited)
type System = (w: World, dt: number) => void;
const reg: Map<string, { fn: System; order: number; broken?: string }> =
  (import.meta.hot?.data.reg) ?? new Map();
if (import.meta.hot) import.meta.hot.data.reg = reg;

export function registerSystem(name: string, fn: System, order = 100) {
  reg.set(name, { fn, order });                      // re-registering replaces the logic, keeps the world
  tribe.emit('system-swapped', { name });            // shows as a toast and in the session journal
}
export function runSystems(w: World, dt: number) {
  for (const [name, s] of [...reg].sort((a, b) => a[1].order - b[1].order)) {
    if (s.broken) continue;
    try { s.fn(w, dt); }
    catch (e) { s.broken = String(e); tribe.reportCrash(name, e); }   // quarantine: the game keeps running
  }
}
```

```ts
// src/systems/combat.ts  (combat lane; one file per mechanic)
import { registerSystem } from '../core/systems';
import { tuning } from '../core/tuning';
export function combat(world, dt) {
  for (const e of world.with('attacker', 'position')) { /* uses tuning.combat.swordCooldown */ }
}
registerSystem('combat', combat, 50);
if (import.meta.hot) import.meta.hot.accept();       // literal call: the edited file re-runs and re-registers
```

```ts
// src/core/world.ts  (Miniplex world survives edits to this file too)
import { World } from 'miniplex';
export const world: World<Entity> = import.meta.hot?.data.world ?? new World<Entity>();
if (import.meta.hot) { import.meta.hot.data.world = world; import.meta.hot.accept(); }
```

* **Second line of defence:** the server keeps the room snapshot. A full page reload (for example after an edit to `main.ts` or `vite.config`) rejoins and restores every entity from the server, so nothing is lost.
* **KAPLAY:** KAPLAY's `onUpdate` callbacks keep a reference to the old code. Route them through the registry instead (`onUpdate(() => runSystems(world, dt()))`) and rebuild KAPLAY objects from the world store when a scene changes.
* **Prefabs as data:** keep entity archetypes in `src/prefabs/*.json`. Agents add a component file and a JSON entry, and the art lane edits prefabs without touching system code.
* The blueprint's figure of "sub-50 ms swaps" is not verified. Plan for a few hundred ms over a tunnel and measure it in the spike.

---

## 5. Multiplayer sync compared

| Option | License / hosting (as verified) | Fit for TribeCode |
| --- | --- | --- |
| **Plain WS relay in the TribeCode server** | Ours (MIT); no new dependency | **Recommended for MVP and v1.** Clients own their avatar and send transforms and inputs at about 15 Hz. The host client (or the server) owns NPCs. The server stores the latest snapshot per room in `.tribe/game/<room>.json`, rebroadcasts updates and appends to a replay log. Same port, same auth and same tunnel as everything else. |
| Yjs (+ `@y/websocket-server`) | MIT; self-hosted. The y-websocket README says the server now lives in a separate, forkable repo. | Good for shared documents and settings. For entity transforms at 15 to 20 Hz, CRDT history is overhead, and it adds a dependency to a zero-dependency server. Optional later for collaborative level editing. |
| Colyseus 0.18 | MIT, free to self-host; paid Colyseus Cloud funds the project | **Graduation path.** Server-authoritative schema state with binary delta patches. Needs a second Node process (and for the game repo to own a server). Proxy it through `/play-rt/` like Vite. nj-mmo is a working reference built on it. |
| PlayroomKit | Hosted service. Its migration guide says you don't write or host a server and lists no authoritative backend. No self-hosting statement found. | **Reject:** not self-hosted, and the SDK license is unverified. |
| PartyKit | `partykit/partykit` is MIT but says development moved to `cloudflare/partykit` (ISC), which runs on Cloudflare Durable Objects | **Reject:** needs Cloudflare infrastructure, not a home PC. |
| Matchbox + GGRS (P2P rollback) | MIT/Apache-2.0; Rust/WASM | Out of scope for a JS stack. Only interesting for a future fighting game written in Rust. |

**Relay message sketch** (JSON over the existing `/ws`):

```js
{ type: 'game-join',  room: 'main' }                                  // → server replies game-snapshot
{ type: 'game-state', room, ents: { p_riley: { p:[x,y,z], r:[...], a:'run' } }, t }   // ~15 Hz, deltas only
{ type: 'game-event', room, ev: 'hit', data: {...} }                  // reliable, ordered
{ type: 'game-tuning', room, key: 'combat.swordCooldown', value: 0.35, by }          // live slider
{ type: 'game-cam',   room, pose: [...] }                             // ~10 Hz, for spectate/PiP
```

Interpolate remote entities about 100 ms behind. Server-side per-room rate limits and a size cap reuse `MAX_FRAME`.

---

## 6. Role lanes

### 6.1 Lane contract (`game/LANES.json` in the game repo, editable in the UI)

```json
{
  "lanes": {
    "art":      { "owner": "maya",  "paths": ["assets/**", "src/prefabs/*.json"], "budget": { "glbMB": 4, "tris": 30000 } },
    "combat":   { "owner": "riley", "paths": ["src/systems/combat*.ts", "src/components/combat/**", "src/data/tuning.combat.json"] },
    "movement": { "owner": "sam",   "paths": ["src/systems/movement.ts", "src/systems/camera.ts", "src/data/tuning.move.json"] },
    "core":     { "owner": "host",  "paths": ["src/core/**", "vite.config.*", "package.json"], "approval": true }
  }
}
```

* **How lanes work on the server.** On session start, each lane becomes durable claims for its owner and the owner's agents (the existing `claims.js`, with no TTL for lane claims). Claims already understand folder prefixes. Add glob support.
* **Hand-off.** Uses the existing claim hand-off: "pass the combat lane to Sam for an hour".
* **Hard guard.** Claims are soft today. Add a **pre-commit hook** in the game repo (installed by the starter) that rejects staged files outside the committer's lane. The integrator's check step runs the same rule on lane branches. The `core` lane requires an approval (`request_approval` already exists).
* **Split tuning files per lane** (`tuning.combat.json`, `tuning.move.json`) so slider commits never collide.

### 6.2 Art / 3D lane pipeline

1. **Drop zone → Assets tab.** Drag a `.glb` or `.gltf` onto TribeCode. It uploads to the host as `assets/models/<name>.glb` (art lane path). An asset manifest `assets/manifest.json` gets an entry with author, version and source `.blend` name.
2. **Inspect and optimize.** If the `gltf-transform` CLI is installed (MIT; commands include `inspect`, `validate`, `optimize`, `prune`, `dedup`, `weld`, `simplify`, `draco`, `meshopt`, `resize`, `etc1s`, `uastc`), the server spawns it, the same opt-in pattern `share.js` uses for cloudflared. The server stays zero-dep. It reports triangles, textures, file size and budget pass/fail, and writes `<name>.opt.glb`. Without the CLI the asset is still accepted, with a warning.
3. **Preview.** A `<model-viewer>` (Apache-2.0) card in the Assets tab, or the game's own Three.js viewer route `/play/main/?viewer=<asset>`, so lighting matches the game. Each new version's thumbnail goes to **visual compare** (`visuals/asset-<name>/`), so diffs between versions are automatic.
4. **Live swap in the running game.** A small Vite plugin in the starter watches `assets/` and sends a custom HMR event (`tribe:asset`). The game reloads that GLTF and replaces meshes on entities that use it, without a reload.
5. **Blender hand-off checklist** (Blender's bundled glTF 2.0 exporter): export a `.glb`; apply transforms; use Principled BSDF for metallic/roughness PBR; name actions for animation clips; enable Custom Properties so they export as glTF **extras**, which the starter reads as prefab components (for example `collider: "box"`, `spawn: "enemy"`). Use Draco in Blender or meshopt in gltf-transform, not both. Keep `.blend` sources in `art-src/` (Git LFS optional), outside the game bundle.

### 6.3 Mechanics lanes and agents per lane

* **One file per system** (`src/systems/<mechanic>.ts`), one component folder per mechanic, one tuning file per lane.
* **Agent scoping has three layers:**
  1. **Contract in the repo.** The root `AGENTS.md` and `CLAUDE.md` describe the engine rules (register systems, never touch `core/` without approval, use tuning files). Each lane folder gets its own `CLAUDE.md` (for example `src/systems/combat/CLAUDE.md`) with lane rules. The starter generates these from `LANES.json`.
  2. **MCP.** The agent's key is bound to a member and lane. `tribe_overview` returns *your lane and its paths*, and `claim_file` refuses paths outside the lane. **Correction to the blueprint:** a server cannot add text to a running Claude Code agent's system prompt. Lane awareness comes from repo instruction files, MCP tool results and hooks.
  3. **Hook.** A Claude Code `PreToolUse` hook (shipped in the starter's `.claude/settings.json`) asks TribeCode before an edit (`GET /api/game/lane-check?path=`) and blocks edits outside the lane with a clear message.
* **Remote friends' agents and the live build.** A friend's Claude Code edits the friend's own clone, but HMR runs on the host's working tree. Options:
  * **v0:** the friend pushes to `lane/<name>`, and the host's autopilot pulls and checks out only that lane's paths into the live tree (`git checkout lane/combat -- <lane paths>`). Latency is seconds. Lanes never overlap, so this is safe.
  * **v1:** add an MCP tool `sync_lane_files`. The agent (or a `PostToolUse` hook) uploads changed files inside its lane, and the host writes them into the live tree, so HMR fires within about a second. Every write is logged to the journal and auto-committed to `lane/<name>` at session end.
* **New MCP tools:** `get_lane`, `list_lanes`, `sync_lane_files`, `game_snapshot` (entities near a point, for debugging), `read_tuning` / `propose_tuning`, `list_game_bugs` (with world position, tuning snapshot and sha), `screenshot_game` (asks a connected client to capture and stores it in visuals).

---

## 7. Watching and spectating

| Feature | How | Cost |
| --- | --- | --- |
| **Everyone plays the same live build** | Each client loads `/play/main/` and joins room `main`. The "shared screen" is a shared world. | Low |
| **Spectate / follow a player** | Click a person in the room panel while the Game tab is open. The camera attaches to their entity and their streamed `game-cam` pose, extending the existing follow mode. Spectator invites start here. | Very low (state, not video) |
| **PiP of a teammate's view** | Render the local world a second time from the teammate's camera pose into a small corner viewport (scissor or render target) inside the game. A pop-out version uses `float.js`. | GPU cost of a second, smaller render; turn it off on phones |
| **True video of someone's screen** | The existing huddle screen share (`getDisplayMedia`, desktop only). MDN lists `getDisplayMedia` as limited availability; assume phones can't share their screen. | Mesh WebRTC, up to about 6 people |
| **Share game view (any device)** | `canvas.captureStream(15)` gives a MediaStream from the game canvas. Add it as a video track on the existing huddle peer connections. Works where screen share doesn't, and shows only the game. | Encoder load on the sender |
| **Replay clips** | The server appends relay traffic to `.tribe/game/replays/<session>.jsonl`. A replay is played back as state in the game's replay mode, with a scrubber. Bug pins attach the last 10 s. Video export later (MediaRecorder on `captureStream`). | Tiny files |

**Network risk:** huddles use Google STUN only, with no TURN. Peers behind carrier-grade or symmetric NAT (phones on cellular) may fail to connect. Mitigations: friends on the same tailnet, an optional coturn (open-source TURN/STUN server) setting for the host, or relaying the game view as state, which always works because it goes over the WebSocket.

---

## 8. Notes gathering: the session journal

Turning on the **Game Studio session** (or starting a huddle while the Game tab is open) creates `Playtest · <date>` in Docs. A server module subscribes to `bus` events and appends dated lines:

* **Decisions:** `/decide` messages, approvals, and the captioned huddle's meeting notes plus action items (existing `voice.js` path). Tasks are created as today.
* **Tuning:** `combat.swordCooldown 0.5 → 0.35 (Riley, committed a1b2c3)`, including slider changes nobody committed ("tried gravity 1400, reverted").
* **Bug pins:** a link to the bug, the world position and a thumbnail.
* **Lanes:** hand-offs, `sync_lane_files` batches ("combat: 3 files"), systems quarantined or recovered.
* **Builds played:** main sha, branch previews opened, who played.
* **Assets:** new or updated models, with budget results and visual-diff links.

When the session ends, the local brain writes a TL;DR at the top: what changed, what felt better, open bugs, next tasks. This uses the existing standup and meeting-note code. The journal is Markdown in the repo, so agents read it with `read_doc`.

---

## 9. Tuning, branch previews and bug pins

**Tuning sliders.** Each `src/data/tuning.*.json` holds plain values. Slider ranges live in a sidecar file, `tuning.meta.json` (`{ "combat.swordCooldown": { "min": 0.05, "max": 2, "step": 0.05 } }`). Without metadata, ranges are guessed (0 to 4 times the value).
* Dragging sends a `game-tuning` message. Every client applies it to an in-memory overlay immediately (no file write, no reload). The game reads `tuning.x` from a live store, not from a static import.
* **Commit** writes the lane's tuning file on the host and commits it (`tune(combat): swordCooldown 0.35`). It's allowed for the lane owner; anyone else creates a one-click approval for the owner. The JSON file self-accepts HMR so a commit doesn't reload. Tweakpane (MIT) is an option inside the game; the sidebar uses TribeCode's own controls to match the design system.

**Branch previews ("Play proposal").** A proposal or lane branch builds in a temporary worktree, using the integrator's existing pattern: `vite build --base /play/b/<branch>/` → `.tribe/previews/<branch>/`, served statically, joining room `<branch>` so it never changes the main world. Keep 3 to 5 previews (least recently used). A preview builds when a proposal opens or someone clicks Play. The approval-board card gets a **Play** button, and the drift radar shows "preview stale". A live HMR preview (a second Vite on a port pool) can come later.

**Diegetic bug pins.** Alt+click (long-press on touch) in the game: the starter's `tribe-game-sdk` raycasts and collects the world position, the entity under the cursor and its components, the camera pose, the tuning overlay, the last 50 console lines, the git sha, the active lanes and a canvas snapshot taken right after a render. It sends these to the parent with `postMessage`, and the parent calls the existing bug report API with `area: 'game'` (added to `AREAS`) and a `pin` block. The screenshot goes to visuals. A marker appears in the world for everyone, and clicking it moves the camera there. When the linked task is done the bug resolves, which already happens, and the marker disappears. Duplicate pins near the same spot merge, extending the existing dedupe with a distance check.

---

## 10. Phones (iPhone first)

* **Join and play** through the installed PWA (`/m/<key>/`), which already handles sign-in. The Game tab shows the iframe full screen. caniuse rates the Fullscreen API as only partly supported on iOS Safari, so rely on the PWA's standalone mode instead.
* **Touch controls** live in the starter: a virtual stick plus buttons drawn in the game, generated from an `input.map.json`, so a lane can change bindings. iPhone has no pointer lock, so use drag-to-look. Long-press is the bug pin.
* **Performance budget:** cap `devicePixelRatio` at 2, target 30 fps on phones, use KTX2/Basis textures (`etc1s`/`uastc`) and meshopt geometry, and stay under 50k triangles on screen. PiP is off on phones. Keep a WebGL2 path even though iOS 26 is reported to support WebGPU; the threejs-agent-game-starter takes the same WebGPU-first, WebGL2-fallback approach.
* **Spectating** on a phone uses state-based follow-cam (cheap). Phones can also send their game view with `captureStream`.
* **Audio:** unlock the AudioContext on first tap, and test huddle audio alongside game audio together on iOS (spike item).
* **Dev-server load:** phones get the watch build (section 3.1) by default, with "Live HMR" as an option.

---

## 11. Blueprint claims checked

| Blueprint item | Verdict |
| --- | --- |
| `bandinopla/threejs-agent-game-starter` | **Exists, MIT.** Three.js WebGPU with WebGL2 fallback, Rapier, Vite, root `AGENTS.md`, skills `$dry-run` / `$add-character` / `$optimize-asset`, typed event dispatcher. Matches the description, but it is tiny (4 commits, 0 stars when checked). Use it as a reference. "Pioneers the AGENTS.md contract" is overstated, since AGENTS.md is a convention shared across tools. |
| `tech-leads-club/nj-mmo` | **Exists, MIT.** Three.js + Colyseus + Vite + SQLite/Drizzle in an Nx monorepo. Its claim of being written entirely by agents (planner, implementer and verifier loop, test gates in AGENTS.md) is the project's own and unverified. Good Colyseus reference. |
| VibeGame | **Exists** (`dylanebert/VibeGame`, MIT, with a Hugging Face Space demo). Declarative XML-like tags, ECS on bitECS, Three.js and Rapier. "Hugging Face Research" is loose wording: it's a project by a Hugging Face developer. |
| `Roblox/studio-rust-mcp-server` | **Misgrouped.** It's an MCP server that connects Claude/Cursor to Roblox Studio, not a game engine, and the GitHub page shows it **archived (April 2026)**. |
| `kaplayjs/kaplay` | **Exists, MIT,** about 1.8k stars, JS/TS. Its repo topics point to the Kaboom lineage. "Designed specifically for AI code generation" isn't stated by the project, so treat it as unverified. |
| `hmans/miniplex` | **Exists, MIT.** The `world.with(...)` / `.without(...)` / `.where(...)` queries are as described. |
| `NateTheGreatt/bitECS` | **Exists, MPL-2.0, not MIT.** That's fine as an unmodified dependency, but note it. |
| Phaser / PlayCanvas | **Both MIT and active.** Phaser is now **v4** (new renderer, breaking changes from v3). |
| `yjs/yjs` | **Exists, MIT,** single maintainer. The y-websocket server moved to a separate package. `y-crdt` was not opened here, so it is unverified. |
| `colyseus/colyseus` | **Exists, MIT,** 0.18, free to self-host, paid cloud. Accurate. |
| `asadm/playroom-docs` | **Exists, but it's the docs site** (Nextra), not the SDK. PlayroomKit is a hosted service with no self-hosting described. `insertCoin` / `useMultiplayerState` are PlayroomKit APIs, not PartyKit ones. |
| `partykit/partykit` | **Exists, MIT,** but development **moved to `cloudflare/partykit`** (ISC; PartyServer / y-partyserver on Durable Objects). |
| `AmbientRun/Ambient` | **Exists (MIT/Apache-2.0), but work is paused indefinitely** per its README. Reference only. |
| `d-bucur/awesome-bevy` | **A curated list,** not a tool. Matchbox (MIT/Apache, Rust/WASM WebRTC P2P with a GGRS feature) is real. "Hot-reloadable entity prefabs" doesn't come from these. Not relevant to a JS stack. |
| "~500 lines of glue", "sub-50 ms HMR" | **Unverified estimates.** Section 13 has our own estimates. |
| "Append DO-NOT-MODIFY to other agents' system prompts" | **Not possible as written.** Use the lane instruction files, MCP results and hooks from section 6.3. |
| `import.meta.hot.accept('./systems/x.ts', cb)` inside the loop | Works as a dependency accept, but needs one literal path per file. The self-accept registry in section 4.2 scales better and lets agents add systems without editing `main.ts`. |

---

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| HMR WebSocket through Funnel or cloudflared misbehaves | Spike item #1. Fallback: watch build plus state restore, which works over plain HTTP. |
| Quick-tunnel 200-request cap or Funnel bandwidth limits on first load | `optimizeDeps`, a small module graph, a watch build for phones, compressed assets. |
| Agent-written game code runs with TribeCode credentials (same origin) | v1: scoped play token, separate origin and a sandboxed iframe (section 3.2). The host already runs repo code, so trust stays inside the tribe. |
| A broken system crashes the game for everyone | Registry quarantine plus crash reports to the bug inbox. The world snapshot lives on the server. |
| Lanes are only advisory | Pre-commit guard, `PreToolUse` hook, integrator check, approval for `core`. |
| WebRTC fails on cellular (no TURN) | State-based spectating (always works), optional coturn, Tailscale. |
| The host's machine does everything (Vite, proxy, builds, gltf-transform) | Cap concurrent preview builds; optimize assets in the background at low priority. An always-on VPS host is in `HOSTING.md`. |
| Licenses | Everything recommended is MIT or Apache-2.0 (Three.js, Miniplex, KAPLAY, Phaser, Colyseus, glTF-Transform, Tweakpane, model-viewer). bitECS is MPL-2.0 (fine as a dependency). The game repo is the tribe's own and can choose its license. TribeCode itself stays MIT and zero-dep: game libraries live in the game repo, not in `server/`. |
| iOS quirks (fullscreen, audio, WebGPU) | PWA standalone, AudioContext unlock, WebGL2 fallback, a real-device test pass. |

---

## 13. Phased roadmap and effort

Estimates assume one developer working with Claude Code on this codebase. LOC means new lines of code, approximate.

### MVP: the weekend slice (2 to 3 days)
*Goal: three friends, one on an iPhone over Funnel, run around the same world while an agent edits `combat.ts`. Nobody's position resets. A slider changes jump height for everyone. Alt+click files a bug.*

| Item | Where | Est. |
| --- | --- | --- |
| `/play/main/` HTTP + WS proxy, host "Start game server" (spawn and log Vite) | `server/game.js` (new), `index.js` hooks | 0.5 d, ~200 LOC |
| Game tab: iframe, room roster, start/stop, open-in-new-tab | `app/ui/game.js` | 0.5 d |
| Starter template (Three.js + Miniplex): registry, self-accepting systems, quarantine, `tribe-game-sdk` (join, state, tuning, pin), touch stick | new repo `tribecode-game-starter` | 1 d, ~400 LOC |
| Relay: `game-join/state/event/tuning`, snapshot per room | `server/game.js` | 0.3 d, ~120 LOC |
| Live tuning sliders, plus commit to the repo (host only in MVP) | UI + server | 0.3 d |
| Alt+click pin → bug inbox (`area: game`) with screenshot | SDK + `bugs.js` | 0.3 d |

### v1 (about 3 to 4 weeks)
* **Lanes:** `LANES.json`, lane claims, a lane panel, pre-commit guard, `PreToolUse` hook, per-lane `CLAUDE.md` generation, lane MCP tools, `sync_lane_files` (1 to 1.5 wk).
* **Art pipeline:** Assets tab, upload, gltf-transform inspect/optimize (opt-in CLI), budgets, model-viewer preview, visual-compare thumbnails, live asset swap (1 wk).
* **Spectate:** follow-cam, PiP viewport, "Share game view" via `captureStream` in huddles (0.5 to 1 wk).
* **Session journal:** `Playtest` doc, bus subscribers, end-of-session brain summary (3 d).
* **Branch previews:** "Play proposal", LRU previews, rooms per branch (4 d).
* **Security:** scoped play token, separate origin on Funnel port 8443 (3 d).
* KAPLAY 2D starter variant (2 d).

### Later
* State-log replays with a scrubber, then video export; replay attached to bug pins.
* A Colyseus "authoritative mode" template for physics-heavy games (proxied `/play-rt/`).
* Collaborative level editor (Yjs or our OT on `levels/*.json`), drag prefabs into the world.
* Optional TURN (coturn) setting; binary WS frames for larger rooms.
* Live HMR branch previews (Vite port pool), "A/B feel test" (two tuning sets, everyone votes).
* Native iOS shell (Tauri iOS, already planned in `MOBILE.md`) for better audio and fullscreen.

### Spike list (do first, half a day)
1. Vite HMR through the `/play/` proxy over Tailscale Funnel **and** a cloudflared quick tunnel, on an iPhone.
2. First-load request count of the starter, compared with the 200 in-flight cap.
3. `canvas.captureStream` track added to the existing huddle peer connection on Safari and Chrome.
4. The iOS PWA iframe: touch, audio unlock, frame rate on a mid-range iPhone.

---

## Sources (opened while researching)

* https://github.com/bandinopla/threejs-agent-game-starter
* https://github.com/tech-leads-club/nj-mmo
* https://github.com/dylanebert/vibegame
* https://huggingface.co/spaces/dylanebert/VibeGame/raw/main/llms.txt
* https://github.com/Roblox/studio-rust-mcp-server
* https://github.com/kaplayjs/kaplay
* https://github.com/hmans/miniplex
* https://github.com/NateTheGreatt/bitECS
* https://github.com/phaserjs/phaser
* https://github.com/playcanvas/engine
* https://github.com/mrdoob/three.js
* https://github.com/yjs/yjs
* https://github.com/yjs/y-websocket
* https://github.com/colyseus/colyseus
* https://docs.colyseus.io/
* https://github.com/asadm/playroom-docs
* https://docs.joinplayroom.com/
* https://docs.joinplayroom.com/migration-guides/hathora
* https://github.com/partykit/partykit
* https://github.com/cloudflare/partykit
* https://github.com/AmbientRun/Ambient
* https://github.com/d-bucur/awesome-bevy
* https://github.com/johanhelsing/matchbox
* https://vite.dev/guide/api-hmr
* https://vite.dev/config/server-options
* https://tailscale.com/kb/1223/funnel
* https://tailscale.com/kb/1311/tailscale-funnel
* https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
* https://github.com/donmccurdy/glTF-Transform
* https://gltf-transform.dev/cli
* https://github.com/google/model-viewer
* https://github.com/cocopon/tweakpane
* https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html
* https://github.com/coturn/coturn
* https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
* https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
* https://bugs.webkit.org/show_bug.cgi?id=186294
* https://caniuse.com/fullscreen
* https://appdevelopermagazine.com/WebGPU-in-iOS-26/

Not opened (named in the blueprint but not verified here): `y-crdt/y-crdt`, `gschup/ggrs`, Renet, and the PlayroomKit SDK's npm license (the npm page failed to load).
