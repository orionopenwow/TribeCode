# TribeCode brand

<p align="center"><img src="../assets/brand/icon-512.png" width="128" alt="TribeCode icon"></p>

## The mark: "Campfire Brackets"

A flame sits between code brackets `< >`, with three teal embers underneath.

- **The fire** is where a tribe gathers. It's warm and casual, the opposite of an enterprise dashboard.
- **The brackets** say *code* at a glance.
- **The three embers** are the friends (and agents) around the fire.

The app icon places the mark on a deep indigo rounded square (corner radius ≈ 22.6% of the size) with a faint warm glow and a 1 px glass edge. It reads clearly at 16 px in the taskbar and stands out among the many blue developer icons.

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
| Dusk | `#7C5CFF` | Primary accent, "Tribe" in the wordmark, buttons |
| Lagoon | `#3DD6D0` | Success, in sync, embers, presence |
| Ember | `#FF6F8E` | Alerts, drift, unread dots |
| Amber | `#FFB86B` | Review, warnings, flame tip |
| Night | `#120F26` → `#0A1424` | Dark background gradient |
| Mist | `#EDE9FF` → `#E2F4F6` | Light background gradient |

Flame gradient: `#FFC27A` → `#FF6F8E` → `#7C5CFF` (top to bottom).

## Type

- **Inter Display** for headings and the wordmark ("**Tribe**" bold + "Code" regular, −2% tracking).
- **Inter** for UI text, 13–15 px.
- A monospace (JetBrains Mono or system mono) for branches, tags and code.

## UI rules

- Glass panels: 55–85% opacity fill, 30 px backdrop blur, 1 px translucent border.
- Radii: 9–14 px controls and cards, 22 px windows, 26 px dialogs.
- Icons: Lucide-style 1.6 px line icons. Fill only status dots and avatars.
- Color carries meaning: teal = good/in sync, amber = review/behind, ember = drift/alert, violet = action.
- Dark mode is the default; light mode uses the same layout and tokens on the Mist gradient.

## Don'ts

- Don't recolor the flame a single flat color, and don't drop the embers from the app icon.
- Don't put the icon on a busy photo; use the Night or Mist gradients.
- Don't stretch the wordmark or set "TribeCode" in all caps.
