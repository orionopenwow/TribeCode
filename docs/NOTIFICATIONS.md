# Notifications for each project, channel and DM

TribeCode follows Discord's rules. Each person picks their own settings. The settings live on the tribe server, so every device you use follows them, and a copy stays on each device so the menus still work offline. Changes made offline are sent when the tribe is back.

Code: `server/notify.js` (`groupVerdict`, `cleanPrefs`, the hub), `app/ui/notifgroups.js` (menus, sheet, settings list, what the app draws). Tests: `app/test/notif_groups_test.js`, `app/test/e2e_notif_settings.py`.

## Where you set them

| Where | Desktop | Phone |
| --- | --- | --- |
| A project circle in the rail | Right-click | Long-press |
| A channel or DM in the conversation list (`# general ▾`) | Right-click | Long-press |
| The bell in the chat header | Click | Tap |
| Settings › Notifications › Projects and channels | Every project in one list | Same |

The project menu has **Mark as read**, **Notification settings ›**, **Mute project ›** (or **Unmute project**), **Invite people** and **Project settings**, then Pin to the top, History, Customize and Reset order. There is no Leave yet, because TribeCode has no way to leave a project on your own.

On desktop, a row with › opens a submenu when you hover it, press →, or press Enter. ← or Esc closes the submenu. Esc closes the menu and focus goes back to the circle or channel you opened it from. ↑ and ↓ move between rows, and Home and End jump to the first and last row. On phones the same menu is a bottom sheet: tapping a row with › opens that list inside the sheet, with a back button.

## The settings

**Notification settings** for a project is a choice of three:
- All messages
- Only @mentions
- Nothing

It also has four switches:
- Suppress @everyone and @here
- Suppress role mentions (shown only when the tribe has admins or mods)
- Mobile push notifications
- Mute new channels

**Notification settings** for a channel is one of: Use project default, All messages, Only @mentions, or Nothing.

**Mute** lasts 15 minutes, 1 hour, 3 hours, 8 hours, 24 hours, or until you turn it back on. A timed mute ends by itself. A DM has Mute only.

**Default:** a project with 5 people or fewer starts on All messages. A bigger project starts on Only @mentions. The default follows the project's size until you pick a setting yourself.

## The rules

What counts as a **mention**: you by name (`@maya`), `@everyone` / `@here` / `@tribe`, your role (`@admins`, `@mods`, `@builders`, `@host`), and things addressed to you: a task assigned to you, a reply to your comment, a reminder, a meeting reminder. Everything else counts as a **plain message**: chat messages, releases, huddles starting, proposals, repository activity.

| Setting | Plain message | Mention | Unread dot |
| --- | --- | --- | --- |
| All messages | notifies | notifies | shows |
| Only @mentions | silent | notifies | shows |
| Nothing | silent | silent ("Nothing" means nothing, mentions too) | shows |
| Muted (any level except Nothing) | silent | notifies, and the circle's red count still shows | hidden |
| Muted + Nothing | silent | silent | hidden |

Three more rules:
- **A channel's own setting wins over the project's.** A channel's mute adds to the project's mute: if either one is muted, plain messages stay silent.
- **Suppress @everyone and @here** and **Suppress role mentions** turn those mentions into plain messages. In a muted project, or one on Only @mentions, they then stay silent.
- **DMs always notify unless that DM is muted.** Project settings never apply to DMs.

Two exceptions:
- **Approvals** always come through, because something is waiting on you.
- **Mobile push notifications off** keeps everything in the app (the inbox, pop-ups, sound, desktop notifications) but sends nothing to your phone for that project.
- **Mute new channels** mutes, for you, every channel made in that project after you turned it on, unless you give that channel its own setting.

On top of these, your global settings still apply: quiet hours, do not disturb, Desktop notifications on or off, Sound on or off, Pop-ups on or off, and which kinds of notification you get. Sound and pop-ups follow you to every device.

## Where the rules are enforced

- **Server** (`server/notify.js` `handle`): every notification goes through `groupVerdict` before it reaches the inbox, the open app, a desktop notification, Web Push, ntfy or email. That includes plain chat messages, @mentions, DMs, tasks, reminders, and anything another feature sends with `bus.notify(...)`, such as meeting reminders. To get the project and channel rules, a feature only needs to set `project` or `ref` (the channel). Plain chat messages reach only the people whose setting is All messages. They never land in the inbox: they make a sound in the app (unless you are looking at that channel), and they push to your phone when you are away. Like every kind of push, they are rate-limited.
- **App** (`app/ui/notifgroups.js`): the circles' unread pill, muted look and red mention count; the channel and DM dots in the conversation list; the window title's `(3)`; sounds and pop-ups. All of them use the same rules, mirrored from the server.

## API

- `GET /api/notify/prefs` returns `prefs.groups = { projects: { <pid>: { level, until, noEveryone, noRoles, push, muteNew, muteNewAt } }, channels: { <ref>: { level, until } } }`, `prefs.app = { sound, toasts }`, `defaults` (each project's default level), and `now` (the server's clock).
- `PUT /api/notify/prefs` with `{ groups: { projects: { <pid>: { level: 'all'|'mentions'|'none'|'default', mute: '15m'|'1h'|'3h'|'8h'|'24h'|'forever'|null, noEveryone, noRoles, push, muteNew } }, channels: { <ref>: { level, mute } | null } }, app: { sound, toasts } }`. Your other devices get a `notify-prefs` socket message right away.
- `POST /api/notify/read` with `{ project }` marks only that project's inbox items as read.
- `POST /api/notify/clock` with `{ skewMs }` moves the clock in tests, so a timed mute can run out. It works only when `TRIBE_TEST=1`.
