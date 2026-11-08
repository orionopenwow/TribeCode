# TribeCode brand

<p align="center"><img src="../assets/brand/icon-512.png" width="128" alt="TribeCode icon"></p>

## The mark

A solid orange **pixel-art flame** between two white pixel brackets `( )`, on a grey slate rounded square (#282828, the Campfire surface; navy until v0.10.8). It is drawn on a 45 × 45 pixel grid by `scripts/icon.js` (flat, no gradients, crisp edges), and `scripts/render-icons.py` writes every PNG, ICO and ICNS from it, so it stays sharp from a 16 px taskbar icon up to a store listing. The flame is always one solid Ember; nothing is drawn on it.

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

The full system (style rules, tokens, component pairings) is in **[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)**: "Warm Hearth in a Dark Terminal".

| Token | Hex | Use |
| --- | --- | --- |
| Obsidian Slate | `#12151A` | Canvas |
| Charcoal Card | `#1B2028` | Cards, sidebars, code panes |
| Muted Steel | `#2A313C` | 1px borders |
| Ember Orange | `#F26B1D` | The flame, primary CTAs, "Code", active links |
| Signal Teal | `#38C6B1` | Live state: connected, progress, brain nodes, mic rings |
| Huddle Indigo | `#6C7CFF` | Secondary peers and presence |
| Stark White | `#F8FAFC` | Brackets, headlines |
| Cool Slate | `#94A3B8` | Body copy |

## Type

- **Wordmark:** "TribeCode" on one line in **Inter Bold**, tightly spaced (since v0.9.8). "Tribe" takes the theme's text color (white on dark, near-black on light); "Code" is always the flame orange. The letters are Inter Bold outlines traced once by `scripts/wordmark-glyphs.py` into `scripts/wordmark-glyphs.json`, and `scripts/wordmark.js` writes every file from them, so no font is needed: `assets/brand/logo-wordmark*.svg`/`.png` (icon + text) and `logo-text*.svg`/`.png` (text only).
- Interface text is Inter, bundled with the app (`app/ui/assets/fonts`, SIL OFL), so every computer and phone renders the same.
- **Inter** for UI text, 13–15 px.
- A monospace (JetBrains Mono or system mono) for branches, tags and code.

## UI rules

Flat matte surfaces, depth through luminance steps and 1px borders only. No glows, blur, glass or gradients. Strict two-color pairing per component. Details in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Don'ts

- Don't recolor the flame or add gradients; keep the brackets white on the slate.
- Don't put the icon on a busy photo; use the Graphite or Paper backgrounds.
- Don't stretch the wordmark, set it in all caps, or color "Code" anything but the flame orange.
