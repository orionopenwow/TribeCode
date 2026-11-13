// Dashboard: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").
// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.
window.CONFIG = {
  title: "Dashboard",          // Title
  baseVisits: 400,             // Mock visits per day
  seed: 42,                    // Mock data seed
  good: "#3BD16F",             // Up color
  bad: "#FF6F8E",              // Down color
  accent: "#F26B1D",           // Accent
  bg: "#12151A",               // Background
  surface: "#1B2028",          // Cards
  ink: "#E7E9EE",              // Text
  muted: "#94A3B8",            // Quiet text
  line: "#2A313C",             // Lines
};
// colors also reach the CSS as variables (--bg, --accent, …)
for (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);
