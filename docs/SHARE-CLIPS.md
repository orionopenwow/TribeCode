# Share a clip, social posts and the website's creator demos

Built on branch `feat/site-demos` (wave 2), on top of Motion Studio (`docs/MOTION-STUDIO.md`).

## Share a clip (`app/ui/shareclip.js`, `shareclip-core.js`, `shareclip.css`)

One sheet turns a project into a short clip for a feed, with the words to post beside it.

- **What to show:** the App Creator's screens (`TribeAppCreator.screens(pid)`), a screenshot from Visuals (the website, the
  game, the preview's camera button, or one an AI helper posted with `add_visual`), a timelapse of one screen's versions or
  of every screen from oldest to newest (up to ten pictures), or pictures you add. Every picture is shrunk to a small JPEG
  data URL so the clip saves with the project.
- **Size:** 9:16 (TikTok, Reels, Shorts), 1:1 (feeds) or 16:9 (X and YouTube). The choice picks one of the nine
  **Share clips** templates: `share-app-*`, `share-site-*`, `share-timelapse-*` with `916`, `11` or `169`.
- **First words on screen** and a **"Made with TribeCode · Remix"** end card, on by default. Turning it off also takes
  "Made with TribeCode." out of the captions.
- **Live preview:** drawn by the same engine as Motion Studio, at 240 px. A still frame with reduced motion.
- **Captions** for X (280 characters), TikTok and Instagram (2,200 each), drafted with no AI from the project's name, what
  it is (`/sense`), tasks done this week and its published link. At most one hashtag on X and two elsewhere, no emoji,
  never a number or claim the project did not give us. The checks flag going over the limit, too many hashtags and big
  claims ("best", "#1"). **Better wording** asks the tribe's AI (`TribeAIBasics.ask('share.caption')`) when one is on.
- **Open in Motion Studio** builds the clip and opens it there. Motion Studio is the one place that renders and exports
  (WebM, MP4, GIF, PNG, HTML, a website section).

Entry points: Publish › Where it goes › Share a clip (`publishreal.js`, every kind of project), Motion Studio's Export
tab, Ctrl K and Flint (`share.clip`: "make a clip for tiktok", "share this", "share my game on x"; `share.timelapse`:
"make a timelapse"), the Learn quick guide `share-clip`, and the tribe's suggestions: the `share` provider suggests
"Make a clip of today's changes" when screens got new pictures today (Apply opens the sheet, Undo closes it).

Public: `window.TribeShareClip = { open({ pid, source, aspect, platform }), close(), state(), build(), captions(), suggestProvider }`.

## Social posts (`app/ui/motionsocial.js`)

61 more templates in Motion Studio's **Social posts** category (69 with the eight that were there) and the nine **Share
clips**, added through the engine's extension point: `TribeMotionKit.define(id, cat, name, about, base, states)`,
`addCat(id, name)` and `helpers` (`motionkit.js`). Each is a different shape of post: hooks (POV, hot take, question,
myth and fact), launches (launch day, feature drop, release notes, teaser, beta call, event invite), proof (before and
after, day 1 and day 30, built in a weekend, milestone, weekly recap, speedrun, streak, leaderboard), conversation (polls,
Q and A, quote, reply, shoutout, thank you), the product (screen spotlight, click to edit, search reveal, dark mode, tabs
tour, notification, soundtrack, remix, step by step, link in bio, shop demo, onboarding, ask Flint) and live or behind the
scenes (going live, stream overlay, bug fixed, roadmap, jam recap, tutorial intro, collab, thread opener, trailer title,
carousel, team update, greeting). Sizes follow each feed: 9:16, 4:5, 1:1 and 16:9. `e2e_share_clip` checks that every
social layout looks different at three moments and that share clips loop. The server loads the same file
(`server/motionstudio.js`), so an AI helper's `motion_write` can use every template.

`python3 scripts/dev/motion-sheet.py out.png social` draws a contact sheet of a category for checking by eye.

## The website's creator demos

- `site/create.html` ("Apps, clips and store pages"): App Creator with the seven standout demo apps in a sideways strip,
  Motion Studio with four social clips, Share a clip, the Launch kit with a before-and-after slider, Suggestions.
- The home page's `#create` section: the UI morph reel and four cards that link into the page.
- The Features menu (Build) and the footer link to it.
- Every clip and picture comes from `python3 scripts/dev/site-demos.py`: the clips are drawn frame by frame by the real
  engine and encoded with ffmpeg to WebM (VP9) and MP4 (H.264) with a WebP poster; the store screenshot is drawn by the
  Launch kit's own renderer. About 1.6 MB for the whole folder (`e2e_site_create` keeps it under 3 MB).
- `site/create.js` adds a clip's video only when it scrolls into view and pauses it out of view; with reduced motion or
  data saver only the poster shows.
- Numbers on the page are counted by `scripts/dev/site-facts.js` (apps, looks, parts, screens, motion templates, social
  layouts, feels, screenshot styles, icon styles, paywalls, checklist steps). Claims are in `docs/CLAIMS.md`.

## Not done

- MP4 export from the app depends on Mediabunny from a CDN, which this sandbox cannot load; WebM is what the tests export.
- Captions are drafted in English; Better wording answers in the language of the input.
- Timelapses use Visuals, so they need screenshots taken over time (the preview's camera button, or an AI helper's
  `add_visual`). There is no automatic capture of the preview yet.
- The demo reel is silent: the sandbox cannot download a song, and the site plays clips muted anyway.
