> Archived 2026-11-12: the plan written after v0.25. Most of it shipped in v0.26–v0.31; the current next steps are in HANDOFF.md and docs/CONTEXT.md.

# TribeCode: next phase plan (after v0.25)

Written 2026-11-09. v0.23.0 and v0.24.0 are released (v0.24 with all three installers). v0.25 is on `next/v0.25`, not released yet. No prices in this doc; the money plan stays private on Camp's machine.

## What v0.25 adds (on the branch)
- **Asset library:** built-in sounds (synth), pixel sprites and motion CSS; icons, fonts, glTF and rigged models; Poly Haven textures and HDRIs. Everything is credited in `assets/CREDITS.md`. It's in Files › Assets, Flint can use it, and agents get the `find_assets` and `add_assets` tools.
- **Inspiration board:** drop pictures, Pinterest or any other links, or fonts. Colours and fonts are pulled out without AI, and "Dress it up" applies them to the website and `design/inspiration.css`.
- **Website editing in the preview:** double-click to edit text, or pick an element and ask Flint. Edits are checked, and scripts are refused.
- **Site templates:** save any website as a template, then start new projects from it in setup.
- **Learn:** lesson scenes in the hero widget's style.
- **Language picker on the site:** 8 languages.
- **Demo tour:** waits for Next. Fixed the phone game preview.
- **Design passes:**
  - the dashboard (colour-coded At a glance)
  - the Task Board
  - Settings, Edit profile and the Inbox
  - a colour pass on every theme, with a themed logo
- **About section:** "An app by Campton", with an animated portrait.
- **Fixed:** the `TribeMobile.askAi` crash from a real bug report.

## Deeper research to do next
1. **Asset licenses, by hand.** Open each Khronos model's README and confirm the license and its `glTF-Binary` path. The session's GitHub reads were blocked, so these come from the Models list. Confirm the 0x72 dungeon tileset license before listing it.
2. **Skills Flint can learn from.** List the Apache-2.0 skills in anthropics/skills one by one: frontend-design, canvas-design, algorithmic-art, theme-factory, web-artifacts-builder and webapp-testing are candidates. Fold their principles into Flint's rules, with credit; don't copy them. Add the useful ones to the starter shelf so Claude Code can load them.
3. **Pinterest and Instagram reading.** Public boards serve pin images in the HTML today, but private boards and Instagram need a sign-in. Decide: point people at "save the pictures and drop them", or offer an optional Pinterest connector with OAuth.
4. **Palette quality.** Test the rules on 30 real moodboards (pastel, neon, earthy, monochrome, high contrast) and tune the bg/accent picks. Consider "lock a colour" and three palette variations to choose from.
5. **What people expect from a "vibe-coding" app.** Compare TribeCode with Lovable, Bolt, Replit Agent, v0 and Cursor. Check onboarding time, template galleries, one-click deploy, visual editing and pricing shape, then note the gaps.

## Missing features worth building (ranked)
1. **One-click tribe that follows your account.**
   - Today the desktop installer already contains the server (the exe hosts the tribe), and phones join with a link.
   - **Next:**
     - "Sign in with GitHub" once on the desktop; the same sign-in on phone and browser lists your tribes.
     - The tribe address is kept on your account (GitHub gist or app storage), so any device finds it.
     - A **Host kit** in the release for people who want it always on: a Docker image and a one-command installer for a small server, plus a "Move my tribe to a server" button.
2. **Visual editor for apps (not just sites).** Same click-to-edit as the preview, for the starter apps' text, colours and images.
3. **Template gallery with screenshots,** fed by site templates and by the community (opt-in, permissive licenses only).
4. **Asset browser previews for 3D:** spin the .glb in `<model-viewer>`, play the Fox's animations, hear sounds before adding them.
5. **Inspiration → whole design system:** spacing, corner radius and button style from the board, not only colours and fonts.
6. **Flint without AI, wider:** more deterministic intents (rename the project, move a task, start a branch, publish).
7. **Undo for Flint's edits** (one tap reverts the last preview edit, using git).

## Polish backlog
- Run every screen at 1280 px wide with the right panel open (the narrow case caused most cramming). Apply container queries everywhere, as on the dashboard.
- Settings: group the rows (You · Look · AI · Connections · Data) with section headers.
- Empty states everywhere should say what to do and offer one button (as in the Inbox now).
- Phone pass on the new parts: inspiration board, asset library, preview editing.

## Security pass (do before v0.25 ships)
- Preview editing:
  - Fuzz `find`/`replace` and `before`/`after` with HTML and JS payloads.
  - Confirm edits only touch HTML and CSS inside the web root.
  - Confirm a spectator or a guest preview token can't edit.
- Asset library:
  - Make sure redirects off the allowlist are refused.
  - Make sure a malicious `.svg` icon is served with `default-src 'none'`. It is in the preview route; check every place it's shown.
  - Add a size and time limit for Poly Haven includes.
- Inspiration board:
  - The SSRF fetcher has been reviewed before. Add tests for redirects to private IPs and for DNS rebinding.
  - Thumbnails must be data URLs of images only (svg is refused).
- Site templates: secrets must never be copied (.env, keys). Add a test that plants `.env` in a site and saves it as a template.
- Re-run the existing security suites 1–3 and add these cases to them.

## Website, as a senior engineer would review it
- **Performance:** measure LCP on a phone. The hero stage is heavy (SVG plus animations), so lazy-load the lower sections' images and the Learn scenes. Check total JS (main.js plus i18n.js).
- **Accessibility:**
  - The language picker is keyboard-ready.
  - Check contrast on the maker section's night palette.
  - Every animated thing respects reduced motion (the sky does).
- **SEO:** hreflang can't apply yet because the languages are client-side. If translations matter for search, generate `/es/`, `/ja/` and other static copies at build time.
- **Content:** add 2–3 real screenshots or short videos of the app per feature section (real ones only, no mockups pretending to be real).

## The "you and me in the chat" end-to-end test
Feasible.
- **Same session as now:** this session runs in the cloud, so it can't reach your computer, and its network only allows a few hosts. It can still connect to your tribe as an AI agent (MCP), but only if your tribe has a public link (Tailscale Funnel or a cloudflared tunnel) and the session's network allows that host.
- **Simplest:** run Claude Code on your own computer with the `claude mcp add …` line from the Agents Hub. It joins your tribe's chat, you type to it there, and it builds in the project's repo.
- **What the test covers:** you message it, it answers in the chat, takes a task, edits the repo, posts what changed, and you approve from your phone. That's the same loop as here, inside TribeCode.
- **Next step:** a scripted version of that loop is already in the automated tests (an agent through MCP: claim, post, finish). The live version with you is a 20-minute session once your tribe has a public link.
