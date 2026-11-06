# TribeCode design system

**Tactile Matte Developer UI × Editorial Flat Vector.** Clean, high-craft precision. TribeCode deliberately rejects the usual "AI-generated / vibecoded" tropes: no neon outer glows, no glassmorphism or backdrop blur, no chaotic multi-stop gradients.

## 1. Style

- **Zero-gloss flat matte surfaces.** Every element (brand mark, cards, buttons) is unshaded solid geometry: no specular highlights, no drop-shadow bloat. Depth comes only from **background luminance steps** and **crisp 1px borders**. A barely visible matte grain on the canvas is allowed; glowing radial gradients are not.
- **Faceted geometric silhouette.** Icons (the flame, the brackets) use sharp, intentional angular cuts that suggest structure and code, with no internal 3D facets. Organic warmth (the campfire) meets the rigid precision of syntax.
- **Editorial spot illustrations.** Flat, minimalist mid-century/editorial vector: people and objects built from clean, overlapping matte shapes. No tech renders, no 3D, no gradients.
- **Utilitarian bento architecture.** A disciplined modular bento grid with hairline borders, a geometric + monospaced type pairing, and generous negative space. It should feel like a native desktop IDE.

## 2. Palette: "Warm Hearth in a Dark Terminal"

Thermal contrast and semantic clarity: a deep, low-fatigue obsidian environment with warm, human accents. No cold cyberpunk blues, no purple AI gradients.

| Token | Name | Hex | Use |
| --- | --- | --- | --- |
| `--canvas` | Obsidian Slate | `#12151A` | App and page background. Zero-glare, low eye strain. |
| `--surface` | Charcoal Card | `#1B2028` | Bento cards, sidebars, code panes: hierarchy without shadows. |
| `--surface-2` | (step up) | `#222833` | Inputs, hovered rows, nested panels. |
| `--border` | Muted Steel | `#2A313C` | Every 1px boundary. |
| `--brand` | Ember Orange | `#F26B1D` | Primary CTAs, the flame, AI sparks, "Code" in the wordmark, active inline links ("Invite →"). |
| `--live` | Signal Teal | `#38C6B1` | Live state: connected pills, progress bars, local-brain nodes, active mic rings. |
| `--peer` | Huddle Indigo | `#6C7CFF` | Secondary peers and presence avatars, distinct from the host. |
| `--white` | Stark White | `#F8FAFC` | Headlines, the `< >` brackets, high-contrast text. |
| `--body` | Cool Slate | `#94A3B8` | Body copy and secondary labels. |
| `--online` | | `#3BD16F` | The small "online" dot and word only. |
| `--alert` | | `#FF6F8E` | Errors, drift and destructive actions. Use sparingly. |

Light mode mirrors the same rules: paper canvas `#F4F5F7`, white cards, `#DADFE6` hairlines, ink `#12151A`, the same brand/live/peer accents.

## 3. Rules for building

- **No** `backdrop-filter`, **no** glow `box-shadow`, **no** gradient fills on surfaces or text. A flat `box-shadow: 0 0 0 1px var(--border)` hairline is fine. Popovers and modals sit on a flat scrim and get a border, not a shadow.
- **Strict two-color pairing per component.**
  - Primary button or badge: solid `#F26B1D` fill + `#FFFFFF` text.
  - Secondary button (e.g. "Read Docs"): `#1B2028` fill + `#2A313C` border + white text.
  - Live pill: `#1B2028` fill + teal dot/text.
- **Typography:** headlines in Stark White (Inter Display ExtraBold, tight tracking); body in Cool Slate (Inter); labels, eyebrows, stats, paths and code in monospace (`JetBrains Mono`, `Cascadia Code`, `SF Mono`, `ui-monospace`). Ember Orange in text is reserved for the brand compound word ("Code") and active inline links.
- **Radii:** 8px controls, 12px cards, 16px panels/windows. Corners on the brand mark stay sharp.
- **Motion:** short and functional (120–220 ms ease-out), opacity/translate only. Respect `prefers-reduced-motion`. A speaking indicator is a solid teal ring, not a halo.
- **Icons:** 1.6px line icons (Lucide style); only status dots, avatars and the flame are filled.

Tokens live in [`app/ui/tokens.css`](../app/ui/tokens.css) (app) and at the top of `site/styles.css` (website).
