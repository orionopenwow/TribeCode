// Breakout: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").
// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.
window.CONFIG = {
  ballSpeed: 3,                // Ball speed
  paddleWidth: 75,             // Paddle width
  rows: 3,                     // Brick rows
  columns: 5,                  // Brick columns
  lives: 3,                    // Lives
  brick: "#38C6B1",            // Brick color
  brick2: "#6C7CFF",           // Second brick color
  paddle: "#F26B1D",           // Paddle color
  ball: "#F8FAFC",             // Ball color
  bg: "#12151A",               // Page background
  field: "#1B2028",            // Play field
};
// colors also reach the CSS as variables (--bg, --accent, …)
for (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);
