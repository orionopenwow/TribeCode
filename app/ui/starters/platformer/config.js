// Tiny platformer: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").
// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.
window.CONFIG = {
  gravity: 6,                  // Gravity: higher falls faster
  speed: 15,                   // Run speed: tiles per second
  jump: 1500,                  // Jump power
  player: "#ECD078",           // Player color
  brick: "#D95B43",            // Brick color
  monster: "#53777A",          // Monster color
  gold: "#FFD700",             // Gold color
  bg: "#111111",               // Page background
};
// colors also reach the CSS as variables (--bg, --accent, …)
for (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);
