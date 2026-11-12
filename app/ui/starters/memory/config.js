// Memory cards: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").
// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.
window.CONFIG = {
  title: "Memory cards",       // Title
  pairs: 8,                    // Pairs
  flipBackMs: 700,             // How long a wrong pair stays up (ms)
  symbols: "★ ♥ ♦ ♣ ♠ ☀ ☾ ♪ ⚑ ✿ ☂ ⚓", // Card faces: separated by spaces; emoji work too
  back: "#F26B1D",             // Card back
  face: "#F8FAFC",             // Card face
  symbol: "#12151A",           // Symbol color
  table: "#1B2028",            // Buttons
  bg: "#12151A",               // Table
};
// colors also reach the CSS as variables (--bg, --accent, …)
for (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);
