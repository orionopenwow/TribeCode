# Updates

How TribeCode updates itself, for people using it and for whoever maintains it.

## For users

**Nothing to do.** TribeCode checks for a new version when it opens, when you come back to the window and every 30 minutes.

- **Download updates in the background** (Settings, on by default). New versions download quietly. You see nothing until the update is fully downloaded and its signature checked. Then a small **Restart to update** pill appears next to the bell.
- **Restart to update.** One click. TribeCode saves your work, tells friends who are online that you'll be back in a few seconds, stops the tribe server, installs, and opens the new version where you left off (same view, same project). On Windows there's no installer window.
- **Close the app with an update ready.** It installs while TribeCode closes, also without a window.
- **Background downloads switched off.** You see **Update available** instead. Click it to download (progress shows in the pill). Then it turns into Restart to update.
- **Want the details first?** Right-click the pill for what's new, hand-offs (give your file claims to a friend) and **Later** (in 1 hour, tonight, next launch). The profile menu has the same one-click restart.
- **Check now:** Ctrl K, then "Check for updates", or the profile menu.

### The Windows helper (TribeCode.bat)

`Desktop\TribeCode\TribeCode.bat` installs TribeCode the first time and updates it on every start. It prints one calm line per step and ends with `TribeCode is up to date (vX)`:

```
  TribeCode

  - Tidying up old files          done
  - Checking for updates          v0.7.5 -> v0.7.6
  - Downloading v0.7.6            14 MB
  - Installing quietly            done

  TribeCode is up to date (v0.7.6)

  Opening TribeCode...
```

The installer runs silently (`/S`): no wizard. `Tools\Turn-On-Auto-Update.bat` runs the same script at log-in and at 4 am, and never while TribeCode is open.

## For maintainers

### The pieces

| Piece | Where | What it does |
|---|---|---|
| Release build | `.github/workflows/release.yml` | Runs when the version in `app/src-tauri/tauri.conf.json` changes on main. Builds the Windows, macOS (Apple Silicon) and Linux installers and a signed `latest.json`. |
| Update endpoint | `plugins.updater.endpoints` in `tauri.conf.json` | `releases/latest/download/latest.json` |
| Install mode | `plugins.updater.windows.installMode` | `"quiet"`: the NSIS installer runs with `/S /UPDATE /R`. No window, and it relaunches the app (`/R`). The install is per user (`bundle.windows.nsis.installMode: "currentUser"`), so it never needs admin rights. |
| In-app logic | `app/ui/updater.js` | Check, background download, the pill, restart, install on close |
| Setting | `startup.autoUpdate` in `app/ui/store.js` | "Download updates in the background" (Settings) |
| Server stop | `host_stop`, `host_shutdown` and `host_kill_stale` in `app/src-tauri/src/main.rs` | A running `tribecode-server.exe` is locked on Windows, so it's stopped (and its port waited for) before installing. |
| Windows helper | `scripts/desktop/Tools/tribecode-update.ps1`, `scripts/desktop/TribeCode.bat` | Install, update, tidy up, launch |

### Keeping updates clean (v0.17.5)

- **One Windows installer.** `bundle.targets` builds only the per-user NSIS setup on Windows (no `.msi`). Before, `latest.json` pointed Windows at the per-machine `.msi` while the Download button gave the setup `.exe`, so "Restart to update" could install a second copy beside the first.
- **Old `.msi` copies are removed.** `app/src-tauri/installer/hooks.nsh` (`NSIS_HOOK_PREINSTALL`) finds a TribeCode installed by Windows Installer and uninstalls it (`msiexec /x … /passive`) before installing. Windows may ask once for permission, since that copy was installed for all users.
- **No half-built releases.** The workflow creates the release as a draft; the `publish` job makes it the latest only after Windows, macOS and Linux all built, so `latest.json` always lists every platform. `tauri-action` retries the build up to 3 times when a tool download fails.
- **The Windows helper** (`tribecode-update.ps1`) installs the newest published release that has the setup `.exe`.

### The flow in `updater.js`

1. `check()` calls the plugin's `check()`. If there's a newer version, it keeps that `Update` object in `pending`.
2. If background downloads are on, `download()` runs `Update.download()` with no progress shown. The plugin keeps the bytes and verifies the signature. Only then is `pending.ready` set, and the pill appears.
3. Clicking the pill calls `restartNow()`, which runs these steps in order:
   1. `TribeApp.saveAll()`, capped at 2.5 s.
   2. A short "back in a few seconds" note to friends who are online.
   3. Your view is saved to `localStorage['tribecode.restoreAfterUpdate']`.
   4. `host_stop`, then `host_kill_stale`.
   5. `Update.install()`, then `process.relaunch()`.

   On Windows, `install()` starts the installer and exits the app, and the installer reopens it. On macOS and Linux, `install()` swaps the app and `relaunch()` opens it.
4. On the next start, `welcomeBack()` reads the restore record and reopens your view. app.js skips the Home hub on that launch.
5. `beforeClose()` (from the window's close button, in app.js) does the same save, stop and install without relaunching.

**One download per update.** `download()` caches its promise on `pending`. Later checks (window focus, the timer, the palette) see the update is downloading or ready and stop there. `install()` uses the bytes that `download()` already fetched.

### Testing without a desktop build

- `?simulateUpdate=0.9.0` fakes a release in a browser. A restart just reloads the page.
- `app/test/e2e_updater.py` mocks `window.__TAURI__` and covers:
  - the quiet background download
  - the pill
  - the call order: save, `host_stop`, `host_kill_stale`, `install`, `relaunch`
  - no second download
  - the view restored after the relaunch
  - Update available when background downloads are off
  - a failed download and its retry
  - installing on close
  - the Settings switch
- `python3 scripts/check-tauri-config.py` checks `tauri.conf.json` against Tauri v2's config schema, plus the installer images and the install mode. The Rust side only builds in CI.

### The installer look

The Windows installers use flat matte art: canvas `#12151A`, the fire logo, one thin Ember line, no gradients.

- **NSIS:**
  - `installer/nsis-header.bmp` (150×57) and `installer/nsis-sidebar.bmp` (164×314)
  - the app icon as the installer icon
  - no language selector
- **MSI (WiX):** `installer/wix-banner.bmp` (493×58) and `installer/wix-dialog.bmp` (493×312). Their right and left sides stay white because WiX draws black text over them.

To redraw them, run `python3 scripts/make-installer-art.py` (needs Pillow). They're built from `app/ui/assets/icon-512.png` and `assets/brand/logo-text-dark.png`.

### Known limits

- On Windows the installer always reopens TribeCode after an update, including one installed on close. That's the updater plugin's default (`restart_after_install`), and the JS API can't change it per call.
- An update that was ready but never installed (the app crashed or was killed) downloads again on the next start. The downloaded bytes live only in memory.
- Release signing needs `TAURI_SIGNING_PRIVATE_KEY`. Without it, installers still build but `latest.json` isn't published. See `scripts/setup-release.js`.

## Making sure an update really lands (fix/p15-updates)

An update changes three things that must match: the **app** (the desktop window and its bundled screens), the
**server** (the program that keeps your tribe, a sidecar inside the app or `npm start`), and the **screens** every
browser and phone has stored. When people said "I updated but nothing changed" (or only some of it changed), one of the
three was still the old one. From the release after v0.49.1, each of them carries the same **build id** and checks the others.

### The build id

`scripts/dev/release.js` stamps one id per release (UTC time + git commit, e.g. `20261127T101500Z-1a2b3c4`) with
`scripts/dev/buildid.js` into:

| Where | What reads it |
| --- | --- |
| `package.json`, `app/package.json` → `"tribeBuild"` | the server (`/api/health` → `build`, the websocket `hello` → `build`); the desktop sidecar bundle bakes it in |
| `app/ui/index.html` → `<meta name="tribe-build">` | the page (`selfheal.js`), the desktop app (Rust reads its bundled copy), the service worker |

The server never rewrites the page's build id, so a server that kept running after its files were updated shows up as a
mismatch. `/api/health` also says `uiBuild`: the build of `index.html` on disk right now. `node scripts/dev/buildid.js
--check` (also run by `stamp-ui.js --check`) fails when the places disagree.

### The paths an old version used to survive, and what stops each one now

1. **An old server kept the port** (most common). The desktop app reused *any* TribeCode server on port 4747, so after
   an update an old sidecar, or `npm start` from an older checkout, kept serving old screens and old server code.
   Now `host_start` (`app/src-tauri/src/main.rs`) reuses a server only when its version **and** build equal the app's.
   Otherwise it asks it to stop (`POST /api/admin/shutdown`, below), then stops an old sidecar by name, waits for the
   port, and starts its own. If it still won't stop, it starts on the next free port and says so in the server log
   (lines starting `[tribecode]`, shown under Details when a start fails).
2. **The installer couldn't replace a running `tribecode-server.exe`** (Windows locks running programs): new screens,
   old server. Restart to update now stops the server cleanly and waits until its port is free before installing
   (`updater.js` → `host_stop`, `host_shutdown`, `host_kill_stale`). If one still slips through, (1) catches it on the
   next start.
3. **A stored copy of the page** (service worker, web view cache, an open tab). The page compares its build with the
   server's on start: on a mismatch it drops the stored files and service worker and reloads once with fresh files. If
   it still doesn't match, the server is the old one: **Finish updating · Restart TribeCode**. A sessionStorage counter
   per server build means it never loops.
4. **Friends' pages after the tribe updated.** The websocket `hello` carries the server's build. A friend whose page is
   older sees **TribeCode was updated · Reload**; it reloads by itself once they stop typing.
5. **Running from source** (`git clone` + the `.bat` files). `git pull --ff-only --quiet` failed silently on any local
   edit, and an already-running server kept the old code. The `.bat` files now run
   `node scripts/update-from-source.js`: your own edits are set aside with `git stash` (never lost: `git stash pop`
   brings them back), commits of your own that aren't on GitHub stop it with a clear message, otherwise it moves to
   exactly `origin/<branch>`, stops an older server still on the port, and prints the version and build it is on.
   `--serve` runs the server and restarts it when it asks (exit code 75), which is what Repair install uses.
6. **The service worker.** Pages and the app's own code are network first (the cache is only the offline copy); `/api`
   never goes through it. Even `?v=`-stamped files are not cache-first: a host running from source changes files
   without changing the stamp. A new build (not only a new version) drops the old files; activating a new worker
   deletes every other `tribecode-shell-*` cache; `pwa.js` reloads a page once when a new worker takes it (at most once a
   minute). The server sends `Cache-Control: no-cache` with an `ETag` for every app file, so checking costs a 304.

### The local admin door

`server/admin.js`. The desktop app, its sidecar and `update-from-source.js` share a per-install secret in
`~/.tribecode/admin-secret` (`TRIBECODE_HOME` overrides the folder; made once with mode 600 by whichever starts
first). Requests say it in `X-Tribe-Admin`.

- `POST /api/admin/shutdown`: the right secret, from this computer only → the server writes pending edits and exits.
- `POST /api/admin/restart`: the secret or the host signed in on this computer → exit code 75 when a supervisor runs
  it (`TRIBE_SUPERVISED=1`, set by `update-from-source.js --serve`), else `409` and the page says to close and reopen.

"From this computer" is the same `isLocal()` check as everywhere else: a loopback address, no proxy headers, a
`localhost` Host and no other site's Origin. A tunnel (Tailscale Funnel, Cloudflare) arrives with proxy headers and is
refused even with the secret. Each server also writes `~/.tribecode/servers/<port>.json` (pid, version, build, folder)
and removes it on exit.

### Diagnosing

- **Settings › About › This install** shows app version, server version, build, screens build and whether they match.
  **Repair install** drops the stored files and service worker, restarts this computer's server (the desktop app
  restarts itself with its web cache emptied) and reloads. Sign-in, settings, drafts and unsent messages stay.
- `curl http://localhost:4747/api/health` → `version`, `build`, `uiBuild`. `build` ≠ `uiBuild`: the files were updated
  but this server process is old; restart it.
- `cat ~/.tribecode/servers/4747.json` says which process holds the port.
- Desktop: when a start fails, Home shows the server log under Details; `[tribecode] stopped an older TribeCode server …` or
  `… would not stop` explain what happened at start.

### Tests

`app/test/e2e_update_robust.py` (old server + new page, the service worker swap, the hello banner, the admin door,
Repair install) and `app/test/update_scripts_test.js` (build-id stamping, `update-from-source.js`).
