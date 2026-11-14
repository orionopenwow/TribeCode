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
| Computer app | Windows, Mac (Apple chip) and Linux installers built in their GitHub account, unsigned | the link that stays up |

A tribe that lives on a phone alone gets the same sheet: see "From a phone alone" below.

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

- `.github/workflows/tribecode-android.yml`: runs on each publish and by hand.
- `android/`: a tiny Gradle project written by TribeCode (`settings.gradle`, `build.gradle`, `app/build.gradle`,
  `app/src/main/AndroidManifest.xml`, `res/values/strings.xml`, the 512 icon, `app.json`). It has no code of its own:
  the one activity is `LauncherActivity` from Google's android-browser-helper (Apache-2.0), which opens the live link
  as a Trusted Web Activity.
- `android/assetlinks.template.json`, `android/README.md`.

The build: JDK 17, Gradle 8.10.2 (`gradle/actions/setup-gradle`), Android Gradle plugin 8.7.3, compile and target
SDK 35, `gradle assembleRelease` (and `bundleRelease` with the person's own key), then `gh release create` with
`app.apk` and `assetlinks.json` (and `app.aab`).

**Why not Bubblewrap.** The first version used Google's Bubblewrap CLI. Its own README says the first run "will offer
to automatically download and install external dependencies", and that on the first build you must "read and accept
the license agreement before proceeding"; it documents no way to answer those without a person. A build on GitHub
has nobody to answer, so the project is written out directly instead: plain Gradle asks nothing.

Signing: with no secrets the build makes a throwaway test key (fine for installing by hand). For Google Play the
person adds `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` (key alias `app`) as secrets in **their** GitHub
project. Secrets reach the steps only through `env`. **TribeCode never holds, sees or stores a signing key.**

Address bar: Android hides it only when `https://<login>.github.io/.well-known/assetlinks.json` lists the app's
fingerprint. That file belongs in the person's `<login>.github.io` project, not in the page's project, so until they
add it the app shows a slim address bar. Each release carries the ready `assetlinks.json`.

Play listing in plain words: a Play developer account, `app.aab` from the release, a name, a description, two
screenshots and an icon. See `docs/APP-STORE.md`.

Checked against (read on 2026-11-13):

- Bubblewrap CLI README (commands, flags, the prompts): https://unpkg.com/@bubblewrap/cli@1.24.1/README.md
- Trusted Web Activity integration guide (the dependency, `LauncherActivity`, `DEFAULT_URL`, `asset_statements`,
  the two intent filters, Java 8 compile options): https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide
- android-browser-helper README (version 2.4.0): https://android.googlesource.com/platform/external/android-browser-helper/+/refs/tags/android-17.0.0_r1
- Android Gradle plugin and Gradle versions (8.7 needs Gradle 8.9 or newer): https://developer.android.com/build/releases/about-agp
- `setup-gradle` (`gradle-version` puts that Gradle on the PATH, no wrapper needed): https://community.gradle.org/github-actions/docs/setup-gradle
- GitHub's Ubuntu 24.04 image (Java 17 is the default; platform android-35 is installed): https://newreleases.io/project/github/actions/runner-images/release/ubuntu24%2F20260804.265

Dry run here: the files were generated from `pubcore.js`; the manifest and strings pass `xmllint`; the workflow
parses as YAML; local Gradle 8.14 read `settings.gradle` and reached the plugin line in `build.gradle`, then stopped
because Google's Maven site is blocked in the build sandbox. **Not run:** resolving the Android plugin, compiling,
signing, the release step. The first real build in a real GitHub account is still the proof. Two things to watch
there: that the image still has build-tools the plugin accepts (it installs missing ones when licences are already
accepted, which they are on GitHub's images), and that android-browser-helper 2.4.0 builds against SDK 35.

## Computer app

Turning it on adds:

- `.github/workflows/tribecode-desktop.yml`: one job makes the release, then Windows, Mac (Apple chip) and Linux
  jobs build and attach their installers (`.exe`/`.msi`, `.dmg`, `.deb`/`.rpm`/`.AppImage`).
- `desktop/src-tauri/`: a tiny Tauri v2 project (MIT / Apache-2.0): `tauri.conf.json` with `build.frontendDist` set
  to the live link, `Cargo.toml`, `build.rs`, `src/main.rs`. `desktop/app-icon.png` is turned into every icon size by
  `tauri icon` during the build. `desktop/README.md` says how to open an unsigned app.

It is a window onto the live page: it needs a connection and always shows the newest publish. **The builds are not
signed.** Windows shows "Windows protected your PC" (More info, Run anyway); a Mac needs Open Anyway in System
Settings. Removing those warnings needs the person's own Windows certificate and Apple developer account; TribeCode
never holds them. No Intel Mac build yet.

Checked against (read on 2026-11-13):

- Tauri v2 config (`identifier` rules, `build.frontendDist` may be "an external URL that should be used as the
  default application URL", `bundle.active`, `bundle.targets`, `bundle.icon`): https://v2.tauri.app/reference/config/
- Tauri's GitHub pipeline guide (the Linux packages, the runner list, `contents: write`): https://v2.tauri.app/es/distribute/pipelines/github/

Dry run here: `tauri icon` (CLI 2.12.4) made the full icon set from the 512 icon; `tauri build` accepted
`tauri.conf.json` and started compiling; `cargo` resolved and compiled Tauri 2.12 up to the GTK system libraries,
which this sandbox does not have. **Not run:** the link step, the bundlers (NSIS, WiX, DMG, AppImage), the
Windows and Mac jobs, the release upload.

## From a phone alone

A tribe that lives only on a phone (`offline.js` solo mode) has no computer to answer `/api/publish/real`, so
`app/ui/publishphone.js` answers the same paths in the browser with the same `pubcore.js`. Same sheet, same rows.

- Files: the project's files on the phone (Files > Code), text files only.
- Download and itch.io: the zip is made on the phone.
- A link that stays up: sent from the phone straight to GitHub with the token from `ghphone.js`. The token stays
  on the phone and goes only to `api.github.com`. To make a new project the token needs all-projects access with
  Administration, Contents, Pages and Workflows set to Read and write; the sheet says so when GitHub refuses.
- A small secrets check (`pubcore.secrets`) stands in for the computer's fuller safety check.
- No play link: that needs the tribe on a computer, and the sheet says so.

## iPhone app

Honest: Apple needs a Mac and a paid Apple developer account. The sheet says so and points at Install on phones,
which works on iPhone today. "Add the prepared iPhone build" adds `.github/workflows/tribecode-ios.yml` (Capacitor,
MIT). It stops with a clear message until the person adds `IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`,
`IOS_PROFILE_BASE64`, `IOS_TEAM_ID` (and optionally the App Store Connect key) as secrets.

## For other features

- `TribePublish.status(projectId)` → `{ kind, checks, dest, next, github, canSend, … }`; `next` is one of
  `build | fix | publish | pages | app | share` (labels in `TribePublishReal.NEXT`).
- `TribePublish.open(projectId?, focus?)` with focus `zip | pages | itch | install | android | ios | desktop`.
- Flint: "publish my site", "put my game on itch", "make an Android app from this" (`publish.to`).
- Academy: Build track, lessons 7 to 9.

## Not proven from the build sandbox

Tested against a stand-in for GitHub (`app/test/e2e_publish_real.py`, `app/test/security9_test.py`), not the real one:

- a real GitHub Pages publish and the minute it takes to go live;
- the Android, computer and iPhone builds: none has run on GitHub. What was and was not run locally is listed
  under each one above;
- a real itch.io upload; installing on a real phone; a real fine-grained token from a phone.
