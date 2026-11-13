# Promo videos (not part of the website)

Self-contained pages that the TribeCode ads are rendered from. They live outside `site/` so they are not published on
tribecode.org. Each page draws every frame from a time: open `promo/ad-type.html?t=12.5` from the repo root over a local
server, or call `window.adSeek(t)`. Shared fonts and brand files come from `../site/assets/`.

| Page | What it is |
|---|---|
| `ad-type.html` | 41 s kinetic-type ad, full-frame feature scenes (the chosen style). Sound: `promo/sound/ad-type-sound.py` |
| `ad-slow.html` | 33 s campfire ad, deliberate cut. Sound: `promo/sound/ad-soundtrack.py` |
| `ad-launch.html` | 75 s "Introducing TribeCode" launch film. Sound: `promo/sound/ad-launch-sound.py` |
| `ad30.html` | 34 s campsite-to-real-app ad |
| `ad.html` | 20 s pixel ad (Camp at the campfire) |

How to pace and frame them: `docs/AD-PLAYBOOK.md`. Rendering: Playwright frames (JPEG q92, 30 fps) + ffmpeg H.264.
