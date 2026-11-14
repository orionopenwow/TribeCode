# Publish for real

One Publish sheet (`app/ui/publish.js`). Under the play link it now holds **Where it goes** (`app/ui/publishreal.js`),
which looks at the project, runs a check list, and offers the places that fit.

| Row | What the person gets | Needs |
| --- | --- | --- |
| Download it | A zip of the finished page | nothing |
| A link that stays up | `https://<login>.github.io/<name>/`, updated on every publish | their own GitHub sign-in |
| itch.io | A zip laid out the way itch wants it + three steps | an itch.io account (they upload) |
| Install on phones | Manifest, icons, offline copy, QR | the link that stays up |
| Android app | An APK built in their GitHub account, download link + QR | the link that stays up |
| iPhone app | A prepared build file | a Mac runner + paid Apple developer account |

A computer app (Windows, Mac, Linux) is **next**, not built: a reliable signed build needs per-platform certificates
we cannot prove from here. The link opens in any browser there.

## How it works

- `app/ui/pubcore.js` is shared by the server and the browser (same pattern as `secsum.js`). It senses the kind
  (site, game, app), runs the check list, finishes the bundle (title, description, phone setting, icon, and when asked
  the installable files), builds the itch layout, writes the wrapper files, and talks to GitHub.
- `server/publishreal.js` serves `/api/publish/real` (status, zip, pages, wrapper, build) and remembers the choice per
  project in `.tribe/publish-real.json`. No token is ever stored there.
- The check list reuses the existing safety check: anything it blocks also blocks every row here.
- Finishing never changes the project's own files. The installable files exist only in what goes out.

## GitHub Pages

- The page gets its **own small GitHub project** `<login>/<name>` (public, branch `main`, page served from the top).
  This keeps it apart from the project's code and lets build files run.
- Every publish replaces the whole tree (Git Data API: blobs, tree, commit, ref). A marker file `.tribecode.json`
  says the project is ours; a same-named project without it is never touched (the sheet asks for another name).
- Pages is turned on through the API. If the sign-in is not allowed to, the sheet shows the two-click settings step.
- The token is the member's own (`server/github-auth.js`). It is used for that member's request only, never logged,
  never broadcast, never returned by any route. Spectators and agents cannot publish.

## Installable (PWA)

Added to the output when "Make it installable" is on (default for games and apps): `manifest.webmanifest`,
`sw.js` (offline copy, cache name carries the version), `icon.svg`, `icons/icon-192.png`, `icons/icon-512.png`.
Icons come from the project's own icon when there is one, else from the name and color.

## Android app

Turning it on adds to the person's GitHub project:

- `.github/workflows/tribecode-android.yml`: runs on each publish and by hand. Uses Bubblewrap (Apache-2.0, Google)
  to wrap the live link as a Trusted Web Activity, builds `app.apk` (and `.aab`), and attaches them to a release.
- `android/twa-manifest.json`, `android/assetlinks.template.json`, `android/README.md`.

Signing: with no secrets the build makes a throwaway test key (fine for installing by hand). For Google Play the
person adds `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` as secrets in **their** GitHub project.
**TribeCode never holds, sees or stores a signing key.**

Address bar: Android hides it only when `https://<login>.github.io/.well-known/assetlinks.json` lists the app's
fingerprint. That file belongs in the person's `<login>.github.io` project, not in the page's project, so until they
add it the app shows a slim address bar. Each release carries the ready `assetlinks.json`.

Play listing in plain words: a Play developer account, the `.aab` from the release, a name, a description, two
screenshots and an icon. See `docs/APP-STORE.md`.

## iPhone app

Honest: Apple needs a Mac and a paid Apple developer account. The sheet says so and points at Install on phones,
which works on iPhone today. "Add the prepared iPhone build" adds `.github/workflows/tribecode-ios.yml` (Capacitor,
MIT). It stops with a clear message until the person adds `IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`,
`IOS_PROFILE_BASE64`, `IOS_TEAM_ID` (and optionally the App Store Connect key) as secrets.

## For other features

- `TribePublish.status(projectId)` → `{ kind, checks, dest, next, github, canSend, … }`; `next` is one of
  `build | fix | publish | pages | app | share` (labels in `TribePublishReal.NEXT`).
- `TribePublish.open(projectId?, focus?)` with focus `zip | pages | itch | install | android | ios`.
- Flint: "publish my site", "put my game on itch", "make an Android app from this" (`publish.to`).
- Academy: Build track, lessons 7 to 9.

## Not proven from the build sandbox

Tested against a stand-in for GitHub (`app/test/e2e_publish_real.py`), not the real one:

- a real GitHub Pages publish and the minute it takes to go live;
- the Android build (never run; the file is checked for shape only, and the Bubblewrap steps follow its
  documented command line);
- the iPhone build (never run);
- a real itch.io upload; installing on a real phone.
