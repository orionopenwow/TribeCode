// Endless runner: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").
// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.
window.CONFIG = {
  title: "Endless runner",     // Game title
  speed: 6,                    // Start speed
  speedUp: 0.002,              // Speed-up per frame
  gravity: 0.7,                // Gravity
  jump: 12,                    // Jump power
  gap: 70,                     // Space between obstacles
  runner: "#F26B1D",           // Runner color
  obstacle: "#FF6F8E",         // Obstacle color
  sky: "#1B2028",              // Sky
  hills: "#222833",            // Hills
  ground: "#2A313C",           // Ground
  bg: "#12151A",               // Page background
};
// colors also reach the CSS as variables (--bg, --accent, …)
for (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);
