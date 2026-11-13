# Settings audit (feat/settings-tabs, 2026-11-12)

Settings is now one calm full window with tabs: a sticky tab list with stroke icons on the left, the tab on the right; on phones the tab list drills into one tab with Back. Search at the top finds any setting in any tab and jumps to it with a short highlight. Deep links: `#/settings/<tab>` and `#/settings/<tab>/<setting id>`, and `TribeSettings.open(tab, settingId)`. The last tab is remembered. Every change saves at once with a small "Saved" tick, and Esc clears the search and then closes.

Code: `app/ui/settings.js` + `settings.css` (the window), `app/ui/prefs.js` + `prefs.css` (personal preferences that change the app), `app/ui/shortcuts.js` (custom shortcuts), `server/mysettings.js` (settings kept on the server), and additions to `server/notify.js` (mutes, email) and `server/accounts.js` (sign out other sessions, deletion and notification mail). Tests: `app/test/e2e_settings_tabs.py` and `app/test/settings_server_test.js`.

For other features: `TribeSettings.addSection(tab, { id, title, render(el) })` puts a section in a tab. The **Projects & sync** tab is the slot for feat/folder-sync (where a project lives, GitHub ship/sync, sharing). `TribePrefs.get().projectHome` holds the default home for new projects (`ask`, `device`, `computer`, `github`, `cloud`) for that flow to read.

## Tabs

| Tab | What's in it |
| --- | --- |
| Profile & look | Live preview, Edit profile (avatar, name color, bio, status, profile icon), Name, Color, Personalize, Theme + Match system, Density, Text size, Look (accent, background, the tribe's name and icon), Language |
| Account & sign-in | Account (Switch, Log out), Sign-in methods, Sign in with Discord/GitHub/Google, Signed in on (account sessions), Sync my settings, Test accounts, Devices (each device link, End, **Sign out other devices**), Start a new tribe, Join another tribe, **Delete my account** (7-day grace period, undo) |
| Plan & AI | Plan (the plans pop-out), Flint's brain, Connect your AI (Your agents), TribeCode MCP, Friends can ask my AI, Agents in chat, Free AI tools (Offload), Flint memory, Flint's tips, Flint reads aloud, Allowed cloud AIs (per provider, Revoke) |
| Notifications | Pop-ups, Sound, Desktop, Phone push, Email, When (away/always), one switch per kind (mentions, DMs, tasks, approvals, comments, ships, huddles, reminders, proposals, critical bugs, meeting notes, repository, visual changes), Quiet hours (from/to), Digest (how often, at a time), per channel and per project (Everything / Mentions only / Nothing), Send a test, Advanced (ntfy) |
| Privacy & presence | Show where I am, Appear away, Who can DM me, Send typing indicators, Show typing indicators, Read ticks, Blocked people (Unblock), Download my data, Crash reports, Privacy & safety (the full panel), Privacy and terms |
| Workspace | Experience, Default home page, Sidebar order (reset), Open at login (desktop), Keyboard shortcuts (change, reset), Chat extras, Spellcheck, Autosave (always on) |
| Projects & sync | Default home for new projects, Storage & sync, Folder (desktop), GitHub, and sections other features add |
| Tribe & admin (host and admins only) | Who can sign up and SMTP email, Password resets, Invites, Roles & privileges, Starting modes, Moderation (reports, word filter), Host on this computer, Server address, Freesound key, Backup, Danger zone (Start fresh) |
| Accessibility | Increase contrast, High contrast theme, Text size, Readable font, Focus rings, Reduce motion, Captions in huddles, Announce notifications (screen readers) |
| Storage & data | This device (offline copy, space), Space used, Fix problems (clear caches), Packs (host), Export settings, Import settings, Reset settings, Save a copy |
| About & help | Version, Updates (Check for updates, Restart to update when ready), Download updates in the background, Changelog, Guide, Tour with Flint, Demo, Keyboard shortcuts sheet, Report a bug, Send feedback, Support, Privacy/Terms/Delete on the web, Licenses and NOTICE |

## Mapping: every setting before the tabs, and where it is now

Nothing was dropped. `e2e_settings_tabs.py` searches for each of these and checks it opens in its tab.

| Before | Now |
| --- | --- |
| Account (Switch account, Log out) | Account & sign-in › Account |
| Signed in on (account sessions) | Account & sign-in › Account |
| Sign-in methods (auth2) | Account & sign-in › Account |
| Who can sign up, SMTP email (auth2) | Tribe & admin › Sign-up and email |
| Password resets | Tribe & admin › Sign-up and email |
| Plan | Plan & AI › Plan |
| Personalize | Profile & look › Your profile |
| Profile | Profile & look › Your profile |
| Show where I am, Appear away | Privacy & presence › Presence |
| Experience | Workspace › How it works for you |
| Name, Color | Profile & look › Your profile |
| Language | Profile & look › Look |
| Theme, Match system | Profile & look › Look |
| Sidebar order | Workspace |
| Look (Customize) | Profile & look › Look |
| Storage & sync | Projects & sync |
| This device (pwa) | Storage & data › This device |
| Folder | Projects & sync |
| Flint (memory) | Plan & AI › Flint |
| Flint's brain / Local brain | Plan & AI › Your AI |
| Host on this computer | Tribe & admin › Hosting |
| Open at login | Workspace |
| Download updates in the background | About & help |
| Friends can ask my AI | Plan & AI › Your AI |
| GitHub | Projects & sync › GitHub |
| Save a copy | Storage & data › Copies |
| TribeCode MCP | Plan & AI › Your AI |
| Chat (previews, GIFs, backgrounds) | Workspace › Chat and editor |
| Sign-in (Discord, GitHub, Google) | Account & sign-in › Account |
| Start fresh | Tribe & admin › Danger zone |
| Fix problems | Storage & data › This device |
| Crash reports | Privacy & presence › Your data |
| Agents in chat | Plan & AI › Your AI |
| Starting modes | Tribe & admin › People |
| Roles & privileges | Tribe & admin › People |
| Packs | Storage & data › This device |
| Backup | Tribe & admin › Backups |
| Freesound sounds | Tribe & admin › Hosting |
| Test accounts | Account & sign-in › Account |
| Privacy & safety | Privacy & presence › Your data |
| Tour with Flint, Demo, Guide | About & help › Help |
| Start a new tribe, Join another tribe | Account & sign-in › Tribes |

## 1. What already existed

Account, sign-in methods and providers, account sessions, test accounts, plan chip, personalize, profile, presence privacy, experience levels, name, color, language, themes, look (accent, background, density, font size), sidebar order, storage and sync, the device panel, folder, Flint memory and brain, hosting, open at login, background updates, ask-my-AI policy, GitHub, save a copy, MCP, chat extras, start fresh, refresh, crash reports, agents in chat, role modes, roles, packs, backup, Freesound key, Privacy & safety (blocked people, reports, word filter, cloud AI consents, delete account). The notification server already had per-kind switches, quiet hours, a digest, Web Push, ntfy and desktop channels; they were reachable only from the bell's own sheet.

## 2. Missing compared with Discord, Slack, Linear and Figma

- One searchable settings window with sections, deep links and a phone layout
- Notifications in Settings: per kind, per channel and per project, sound, quiet hours, digest, email
- Sessions and devices with remote sign-out
- Who can DM me, typing indicators, read ticks, blocked people in Settings
- Custom keyboard shortcuts and a shortcuts reference
- Accessibility: contrast, focus rings, readable font, reduced motion, captions, screen-reader announcements
- Settings sync across devices, export and import of settings, reset
- Download my data (a data export of what you made)
- Account deletion with a grace period and undo
- Default home page, spellcheck, version and Check for updates, licenses
- Two-factor sign-in (TOTP), passkeys
- Human read receipts (TribeCode only has receipts for your own agent's chat)
- Time zone and date/time format, per-device notification settings, scheduled status, streamer mode
- Connected apps and personal API tokens in one list, an admin audit log view, data retention rules
- SSO (SAML/OIDC), billing management, phone number / SMS

## 3. Built now vs later

### Built now

| Gap | How |
| --- | --- |
| Tabbed Settings, search, deep links, phone drill-in, Saved tick, Esc | `settings.js`, `settings.css` |
| Notifications in Settings: per kind, channels, when | uses `/api/notify/prefs` |
| Per-channel and per-project overrides | `prefs.mutes` in `server/notify.js`: Nothing silences a place, Mentions only lets mentions, DMs and approvals through; approvals always pass |
| Notification sound and pop-ups | `prefs.js` (a soft two-tone chime, no file) |
| Quiet hours | server (pushes wait for the digest) and this device (no sound or pop-up) |
| Digest | how often or at a time of day |
| Email notifications | a new `email` channel; mails the account's confirmed email through the host's SMTP (`accounts.mailMember`), rate-limited per address |
| Sessions and devices, Sign out other devices | `POST /api/me/signout-others`: ends every device link, replaces the member key (this device gets the new one), closes the other sockets, and ends the account's other sessions (`DELETE /api/accounts/sessions/others`) |
| Who can DM me | `PUT /api/me/privacy` `dm`: everyone, people I've written to, or only the host and mods; your own agents and staff always can, blocked people never; enforced on every DM post |
| Typing indicators | sending off is enforced by the server; showing off and read ticks are display settings |
| Blocked people | listed with Unblock (`/api/moderation/block`) |
| Download my data | `GET /api/me/export` → a .zip: messages you wrote (every project and DM), tasks you made or own, docs you made, your uploads (inline up to 8 MB), profile and preferences; never key hashes or other people's messages |
| Account deletion with a grace period | `POST/DELETE /api/me/deletion` (7 days, `TRIBE_DELETE_GRACE_MS` for tests); a timer carries it out with the same removal as before (`accounts.removeMember`); not the host |
| Settings sync across devices | `GET/PUT /api/me/settings` (whitelisted keys, 64 KB); a new device signed in to the same member picks it up |
| Export / import / reset settings | JSON file, validated keys only; reset keeps you signed in |
| Custom keyboard shortcuts and a reference | `shortcuts.js`: ten app-wide actions, Change/Reset, clash check; the full sheet stays on Ctrl / |
| Default home page | applied on start unless a deep link says otherwise |
| Density, text size | on Profile & look and Accessibility |
| Accessibility pack | Increase contrast, High contrast theme, Strong focus rings, Readable font (a wider system face with more spacing), Reduce motion (overrides the system), Captions on when you join a huddle, screen-reader announcements for notifications |
| Spellcheck | everywhere you type |
| Flint preferences | Flint's tips on/off, Flint reads aloud (the device's voice) |
| Check for updates, version, Restart to update, licenses | About & help |
| Default home for new projects | stored for the folder-sync flow |

### Later, and why

| Gap | Why not now |
| --- | --- |
| Push to closed apps on iPhone and Android beyond Web Push | needs Apple/Google push services (APNs, FCM) and their keys |
| Email when the host has no SMTP | needs an outside mail service; TribeCode only uses the host's own SMTP |
| SMS / phone number sign-in | needs an SMS provider |
| Billing management (cards, invoices) | needs a payment processor; the plans pop-out stays informational |
| SSO (SAML / company OIDC) | needs an outside identity provider to test against |
| A bundled dyslexia font (OpenDyslexic, OFL) | it is license-compatible but adds ~300 KB of fonts to the offline shell; the Readable font setting uses wide system faces instead and needs no download |
| Two-factor sign-in (TOTP) and passkeys | buildable without outside services, but they change the sign-in flow that feat/auth2 owns and deserve their own security review; next in line |
| Human read receipts | a new chat feature (who read what), not a setting; the toggle covers the agent ticks that exist |
| Time zone and date format, per-device notification settings, scheduled status, streamer mode, connected apps list, admin audit log view, data retention | buildable; lower value than the list above, left for a follow-up |
