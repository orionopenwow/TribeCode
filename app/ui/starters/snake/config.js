// Snake: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").
// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.
window.CONFIG = {
  stepMs: 75,                  // Milliseconds per move: lower is faster
  growth: 5,                   // Growth per bite
  snake: "#38C6B1",            // Snake color
  food: "#F26B1D",             // Food color
  field: "#1B2028",            // Field color
  bg: "#12151A",               // Page background
};
// colors also reach the CSS as variables (--bg, --accent, …)
for (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);
