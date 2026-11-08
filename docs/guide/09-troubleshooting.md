# Troubleshooting

The problems we've actually hit, and what fixes them.

## The app is stuck on "Starting…"

The desktop app couldn't start its server.

1. Home shows what went wrong. Open **Details** to read the log, then tap **Try again**.
2. Something else may be using port 4747. An older TribeCode there is reused; anything else, close it or restart the computer.
3. Still stuck? Run **Stable\\Update-and-Open-TribeCode.bat** from the TribeCode folder on your Desktop. It installs the newest version and tidies up old ones.

## "Something went wrong" or a half-loaded screen

TribeCode reloads once by itself. If the card still shows, tap **Reload**. **Send report** files the error in Bugs.

## Signed out, or "not a member of this tribe"

- Open your invite link again; it signs you back in.
- On a phone, open TribeCode from the **Home Screen icon**, not from Safari. They don't share a sign-in.
- If the host signed your phone out (**Devices & desktop app**), ask for a fresh invite.
- Joining someone else's tribe: **Settings** › **Join another tribe with a link**.

## The invite link doesn't open for my friend

- The invite sheet says where it works. **Same Wi-Fi only** won't work on cellular: tap **Make it work from anywhere**.
- Tailscale asked to allow Funnel: open the link it showed, allow it, then flip **Share beyond my Wi-Fi** again.
- Cloudflare's address changes every restart. Send a fresh invite after the host restarts.
- Links expire after 3 days. Make a new one.

## Your AI can't reach the tribe

- Status stays on **Waiting for Claude Code…** (or **Waiting for it to connect…**): the command was for the wrong place. Pick **Anywhere**, **Same Wi-Fi** or **This computer** to match where Claude Code runs, copy again.
- Made a **New command**? The old one stopped. Paste the new one.
- Remove an old connection with `claude mcp remove tribecode`.

## Updates

- The desktop app updates itself. When **Update ready · vX · Restart** shows in your profile menu, tap it. Your work is saved first.
- **Check for updates** is in the profile menu too.
- A bar saying **TribeCode was updated… Reload to use it**: tap **Reload**.
- Still looks old? Close it fully, then run **Stable\\Update-and-Open-TribeCode.bat**.

## Voice or notifications don't work on a phone

They need an https link. Turn on **Share beyond my Wi-Fi**, send a fresh invite, add it to the Home Screen, then tap **Turn on notifications**.

## Something else

Press **Ctrl Shift B** (or **Report a bug** in the chat's **+**). The recent logs go along with it.
