// Chat UI: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").
// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.
window.CONFIG = {
  channel: "#general",         // Channel name
  friend: "Maya",              // Friend's name
  greeting: "Hey! The build is up, have a look", // First message
  replies: "Ooh, nice!|Show me when it works|I can take that one|Ha, same|Let's try it tonight", // Pretend replies: separated by |
  replyMs: 900,                // Reply delay (ms)
  mine: "#3A2416",             // My bubbles
  peer: "#6C7CFF",             // Names
  online: "#3BD16F",           // Online dot
  accent: "#F26B1D",           // Accent
  bg: "#12151A",               // Background
  surface: "#1B2028",          // Cards
  ink: "#E7E9EE",              // Text
  muted: "#94A3B8",            // Quiet text
  line: "#2A313C",             // Lines
};
// colors also reach the CSS as variables (--bg, --accent, …)
for (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);
