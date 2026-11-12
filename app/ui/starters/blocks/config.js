// Falling blocks: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").
// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.
window.CONFIG = {
  dropTime: 0.6,               // Seconds per row at the start: lower is faster
  c1: "#38C6B1",               // I piece
  c2: "#6C7CFF",               // J piece
  c3: "#F26B1D",               // L piece
  c4: "#FABD2F",               // O piece
  c5: "#3BD16F",               // S piece
  c6: "#A78BFA",               // T piece
  c7: "#FF6F8E",               // Z piece
  bg: "#0E1014",               // Page background
};
// colors also reach the CSS as variables (--bg, --accent, …)
for (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);
