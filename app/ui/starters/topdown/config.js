// Top-down arena: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").
// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.
window.CONFIG = {
  speed: 3,                    // Hero speed
  hearts: 3,                   // Hearts
  foeSpeed: 1.2,               // Slime speed
  foesPerWave: 3,              // Slimes in the first wave
  bulletSpeed: 9,              // Shot speed
  hero: "#F26B1D",             // Hero color
  foe: "#3BD16F",              // Slime color
  bullet: "#FABD2F",           // Shot color
  floor: "#1B2028",            // Floor
  grid: "#222833",             // Floor lines
  bg: "#12151A",               // Page background
};
// colors also reach the CSS as variables (--bg, --accent, …)
for (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);
