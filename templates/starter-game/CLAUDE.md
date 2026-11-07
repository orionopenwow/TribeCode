# Pixel Quest: notes for Claude

A tiny browser platformer built by a few friends and their Claude agents in TribeCode.

- Open `index.html` through any static server (e.g. `npx serve` or `python -m http.server`).
- One mechanic per file in `src/systems/`; drawing lives in `src/art/`; game feel numbers live in `src/data/tuning.js`.
- **Stay in your lane.** `LANES.json` says who owns which files. Before editing, call the TribeCode MCP tool `my_lane` and `claim_file`. If you need a change in someone else's lane, use `handoff` or `message_agent` instead of editing it.
- Keep systems small and pure: `system(world, dt, tuning)`. A system that throws is logged and skipped, never fatal.
- No build step and no dependencies.
- When you finish something, call `request_review` and post a short note in chat.
