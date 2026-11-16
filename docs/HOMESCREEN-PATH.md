# Put it on your phone: from a project to an icon on the home screen

One guided path for any project (an App Creator app, a code app, a game, a website). Code: `app/ui/homescreen.js` (the sheet), `app/ui/homescreen-core.js` (the check, the steps per phone and browser, the free limits, Flint's answers; shared with the server), `server/homescreen.js` (the one-tap fix, Undo, the live-link check). Test: `app/test/e2e_homescreen.py`, `app/test/homescreen_test.js`.

Researched 2026-11-16. Every number shown in the app comes from the official pages below, read that day. Limits change; the app says so beside the table.

## The five stages

| Stage | What the person sees | What is checked | With no AI | One ask for a stronger AI |
|---|---|---|---|---|
| 1 Make it installable | The install check, each cross with why | manifest linked and valid, name, 192/512 raster icons, maskable icon, start_url, display, prefer_related_applications, apple-touch-icon (PNG), viewport, service worker | **Make it installable** adds only what is missing (icons from the Launch kit icon), saves a version, **Undo** | Offline service worker that updates cleanly |
| 2 Put it online | Play link, GitHub Pages, free cloud; free limits with sources | **Check it**: the server opens the project's own live link, checks https and runs the same check on what it serves (and its scripts, for the service worker) | Publishing needs no AI | Subfolder-safe paths for GitHub Pages |
| 3 Open it on your phone | QR code, Send by text, Share, Copy | Warns when the link is localhost or a LAN address | QR made locally (`qr.js`) | Small-phone layout and safe areas |
| 4 Add to home screen | Steps per phone and browser with our own drawings; in-app browser warning | Detects the viewer's phone, browser and in-app browser from the user agent | All local | A polite in-app install hint |
| 5 A real store app | Costs and free build limits; Launch kit, Android build, Expo export | — | Launch kit, phone app mode | An Expo build for both stores |

The ask goes to the tribe's AI helpers in #agents (or becomes a task when none is connected). It shows only when the tribe has an AI: the host's key (`/api/flint/tiers` `now.host.online`) or a member's own helper. Without one, the stage says what Flint does here and that a stronger AI can go further.

Roles: the fix and every publish button need the `site.publish` permission (group styles); others get **Ask to publish**.

Entry points: Publish › Where it goes › Put it on your phone (every kind of project); Flint (`phone.path`, and "put it on my phone", which was `publish.to` with `dest: install`); the six phone quick guides (Learn and Ctrl K); and the `phone` provider in Suggestions ("Make X installable on phones", "Add X to your home screen").

## What the research found

### Installing on each platform
- **Chrome's install criteria:** https; a manifest with `name` or `short_name`, 192 and 512 px icons, `start_url`, `display` one of fullscreen/standalone/minimal-ui/window-controls-overlay, and `prefer_related_applications` absent or false; the person has clicked the page and spent 30 seconds on it. A service worker is not listed. ([web.dev: install criteria](https://web.dev/articles/install-criteria))
- **MDN** says the same and adds: every page must link the manifest; https or localhost; a service worker is "not a requirement" but gives the offline experience. ([MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable))
- **Maskable icons:** keep the logo in a centered circle with a radius of 40% of the width; declare `"purpose": "maskable"`; don't combine purposes on one icon. ([web.dev: maskable icons](https://web.dev/articles/maskable-icon))
- **Per platform** ([web.dev Learn PWA: installation](https://web.dev/learn/pwa/installation)): iOS/iPadOS has no install prompt, people use Share › Add to Home Screen; Chrome on Android with Google services mints a WebAPK; Samsung Internet mints on Samsung phones and makes shortcuts elsewhere; desktop Chrome and Edge show an install badge in the address bar.
- **iOS 26 / Safari 26:** "By default, every website added to the Home Screen opens as a web app"; people can turn off "Open as Web App". ([WebKit: News from WWDC25](https://webkit.org/?p=16993))
- **Other browsers on iPhone** can add to the Home Screen from the Share menu since iOS 16.4. ([WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/))
- **In-app browsers** (Instagram, TikTok, Messenger…) are stripped-down; on Android an `intent:` link can open the page in the default browser; on iOS there is no reliable escape, so the page shows "tap ••• › Open in Safari". ([The Pitfalls of In-App Browsers](https://blog.master.dev/the-pitfalls-of-in-app-browsers/), July 2024)

### Free limits that matter
| Where | Free | Source |
|---|---|---|
| GitHub Pages | Public repos; site ≤ 1 GB; soft 100 GB/month traffic; soft 10 builds/hour; private repos need Pro/Team/Enterprise | [GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) |
| Render (free cloud) | Spins down after 15 min idle, ~1 min to wake; 750 free instance hours/month per workspace; ephemeral filesystem | [Render Docs](https://render.com/docs/free) |
| Cloudflare Pages | 500 builds/month, 1 at a time, 20-minute timeout; 20,000 files; 25 MiB per file | [Cloudflare Docs](https://developers.cloudflare.com/pages/platform/limits/) |
| Netlify | 300 credits/month (bandwidth 20 credits/GB, deploys 15 credits each); a site that runs out pauses until next cycle | [Netlify pricing](https://www.netlify.com/pricing/) |

### Store costs and build limits
| What | Number | Source |
|---|---|---|
| Expo EAS free plan | Up to 15 Android and 15 iOS builds a month; low priority; 45-minute timeout; 1,000 MAUs for EAS Update | [Expo pricing](https://expo.dev/pricing) |
| Apple Developer Program | $99 annual membership | [Apple Developer Program](https://developer.apple.com/programs/) |
| TestFlight | Up to 100 internal and 10,000 external testers; up to 100 builds; 30 devices per tester | [TestFlight](https://developer.apple.com/testflight/) |
| Google Play | US$25 one-time registration fee | [Play Console Help](https://support.google.com/googleplay/android-developer/answer/6112435) |
| Google Play, new personal accounts | Closed test with at least 12 testers opted in for 14 days before production | [Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465) |

These are other companies' fees, shown so people can decide. TribeCode's own prices are not in this repo.

## Not verified
- Apple's own support page for Safari "Add to Dock" on Mac and Expo's build docs page could not be opened from the research session, so the app does not describe Mac Safari and words the "no Mac needed" line from Expo's pricing page (which lists free iOS builds on Expo's machines) and TribeCode's own GitHub iPhone build.
- Every step was tested in Chrome with emulated user agents (iPhone Safari, Android Chrome, Instagram). Adding to a real home screen still needs a real phone (docs/REAL-DEVICE-CHECK.md).
