# TribeCode brand

<p align="center"><img src="../assets/brand/icon-512.png" width="128" alt="TribeCode icon"></p>

## The mark

A solid orange flame between two white code brackets `< >`, on a deep navy rounded square. Flat, geometric, no gradients, so it stays sharp from a 16 px taskbar icon up to a store listing.

- **The fire** is the campfire the tribe gathers around: warm and casual, not an enterprise dashboard.
- **The brackets** say *code* at a glance.

## Files

| File | Use |
| --- | --- |
| `assets/brand/icon.svg` | Master app icon (vector) |
| `assets/brand/icon-512.png` | README, store listings, installers |
| `assets/brand/icon.ico` | Windows `.exe` / taskbar (16, 32, 48, 256 px) |
| `assets/brand/logo-wordmark.svg` / `.png` | Wordmark on light backgrounds |
| `assets/brand/logo-wordmark-dark.svg` / `.png` | Wordmark on dark backgrounds |

## Color

| Token | Hex | Use |
| --- | --- | --- |
| Ember | `#EE6F22` | The flame. Primary accent, "Code" in the wordmark, buttons, selection |
| Navy | `#171B26` | Icon background, "Tribe" in the light wordmark |
| Lagoon | `#3DD6D0` | Success, in sync, embers, presence |
| Rose | `#FF6F8E` | Alerts, drift, unread dots |
| Amber | `#FFB86B` | Review, warnings, flame tip |
| Graphite | `#15171D` → `#0B0C10` → `#050608` | Dark background: near-black gradient with a fine grain texture and faint ember/teal glows in opposite corners |
| Paper | `#F1F2F5` → `#D6D9E0` | Light background: cool grey gradient with the same grain |

The flame is one flat color; never add a gradient to it.

## Type

- **Wordmark:** "TribeCode" on one line in squared, geometric heavy letters. "Tribe" is white on dark (navy on light); "Code" is always the flame orange. The letters are drawn as vector shapes by `scripts/wordmark.js`, so no font is needed: `assets/brand/logo-wordmark*.svg`/`.png` (icon + text) and `logo-text*.svg`/`.png` (text only).
- Interface text is Inter, bundled with the app (`app/ui/assets/fonts`, SIL OFL), so every computer and phone renders the same.
- **Inter** for UI text, 13–15 px.
- A monospace (JetBrains Mono or system mono) for branches, tags and code.

## UI rules

- Surfaces are near-solid (window ~94% opaque, cards fully opaque `#15181F` / `#1C2029`) so content stands out; the glass effect is limited to a light blur and 1 px edge highlights.
- Cards get a crisp 1 px edge (`rgba(255,255,255,0.14)`) and a soft drop shadow. Orange is for actions only, never for large areas.
- Radii: 9–14 px controls and cards, 22 px windows, 26 px dialogs.
- Icons: Lucide-style 1.6 px line icons. Fill only status dots and avatars.
- Color carries meaning: teal = good/in sync, amber = review/behind, ember = drift/alert, violet = action.
- Dark mode is the default; light mode uses the same layout and tokens on the Paper background.

## Don'ts

- Don't recolor the flame or add gradients; keep the brackets white on navy.
- Don't put the icon on a busy photo; use the Graphite or Paper backgrounds.
- Don't stretch the wordmark, set it in all caps, or color "Code" anything but the flame orange.
