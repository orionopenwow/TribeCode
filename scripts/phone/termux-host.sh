#!/data/data/com.termux/files/usr/bin/bash
# Host a TribeCode tribe on an Android phone with Termux (docs/PHONE-HOSTING.md).
# One line in Termux (from F-Droid or GitHub, not the old Play Store build):
#   curl -fsSL https://raw.githubusercontent.com/orionopenwow/TribeCode/main/scripts/phone/termux-host.sh | bash
# It installs Node.js, Git and cloudflared, gets TribeCode (or updates it), keeps the phone awake while it runs,
# starts the tribe and prints an invite link that works from anywhere. Open http://localhost:4747 in Chrome on this
# phone to use the app as the host. Stop with Ctrl+C, or close the Termux notification.
set -e
DIR="${TRIBECODE_DIR:-$HOME/TribeCode}"
PORT="${TRIBE_PORT:-4747}"
say() { printf '\n  %s\n' "$*"; }

if [ -z "$PREFIX" ] || [ ! -d "$PREFIX" ]; then
  say "This script is for Termux on Android. On a computer, run: npm start"; exit 1
fi

say "Installing what TribeCode needs (Node.js, Git, cloudflared)..."
pkg update -y >/dev/null 2>&1 || true
pkg install -y nodejs-lts git cloudflared >/dev/null 2>&1 || pkg install -y nodejs git cloudflared
command -v termux-wake-lock >/dev/null 2>&1 || pkg install -y termux-api >/dev/null 2>&1 || true

if [ -f "$DIR/server/index.js" ]; then
  say "Getting the latest TribeCode..."; git -C "$DIR" pull --ff-only --quiet || true
else
  say "Downloading TribeCode..."; git clone --depth 1 https://github.com/orionopenwow/TribeCode.git "$DIR"
fi

# Keep the CPU awake while the tribe runs (Android stops sleeping apps). Released when this script ends.
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
trap 'command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock; pkill -f "scripts/live.js" 2>/dev/null; say "Tribe stopped."' EXIT

cd "$DIR"
say "Starting your tribe and making an invite link..."
node scripts/invite-friend.js --cloudflare --port "$PORT" || say "No public link right now. Friends on the same Wi-Fi can still join from the app."
say "Your tribe is running. Open http://localhost:$PORT in Chrome on this phone to use it as the host."
say "Keep Termux open (and the phone charging for long sessions). Ctrl+C stops the tribe."
LOG="${TMPDIR:-$PREFIX/tmp}/tribecode-server.log"
touch "$LOG"; tail -n 5 -f "$LOG"
