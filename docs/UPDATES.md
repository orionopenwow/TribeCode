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
| Server stop | `host_stop` and `host_kill_stale` in `app/src-tauri/src/main.rs` | A running `tribecode-server.exe` is locked on Windows, so it's stopped before installing. |
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
