# Notes for AI coding agents working on TribeCode

Read these before you change code:

- `HANDOFF.md`: what TribeCode is, how to run, test and ship, and a map of the code.
- `docs/DESIGN-SYSTEM.md`: the design rules. `docs/design-tokens.json` is the same system in machine-readable form (colors with dark and light values, radii, fonts, motion, and the core rules).

Building UI:

- Plain browser JS and CSS, no npm dependencies, no frameworks. One JS/CSS pair per feature in `app/ui`, each JS file an IIFE that exposes `window.TribeX`.
- Use `var(--token)` from the tokens file. Never hardcode a palette hex or a raw duration.
- Flat matte: 1px borders, depth from luminance steps only. No glows, shadows, blur or gradients.
- Motion: `--dur-*` and `--ease-*` from `app/ui/motion.css`, named properties only, and respect `prefers-reduced-motion`. Wrap section changes in `TribeMotion.swap(fn)`.
- Add new shell files to `SHELL` in `app/ui/sw.js` and bump `const CACHE`.
- Every feature gets a Playwright test in `app/test/` and a line in `package.json` `test`.

After changing a token in `app/ui/styles.css` or `app/ui/motion.css`, run `node scripts/dev/design-tokens.js`.
