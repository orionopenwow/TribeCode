# Making a motion graphic in TribeCode: the guide for AI agents

You are an AI working on a motion graphic in TribeCode's Motion Studio: a few seconds of animated interface, type or numbers for a launch post, a product page or a store listing. This file is everything you need. Follow it even if you have no other context.

The parts between `gen` marks are written from the app's own data by `scripts/dev/ai-guides.js`.

## 1. What you are working on

A motion graphic is **one JSON document** saved in the project under a key (`launch-reel`). It is a list of **states** on a beat grid. One shape morphs from state to state (it is never cut); each state has a `kind` (button, slider, stat, word …), a place on the timeline (`at`, in beats), its words, and **acts** the cursor performs on it (click, drag, hover, type).

```json
{
  "v": 1, "name": "Launch reel", "aspect": "1:1", "bpm": 120, "bars": 4, "beatsPerBar": 4, "loop": true,
  "themeName": "warm", "theme": { "bg": "#E9E6E1", "ink": "#111111", "paper": "#FFFFFF", "accent": "#B4532C", "muted": "#8A867F" },
  "feel": "polished", "camera": { "strength": 0.5, "fill": 0.66 }, "cursor": true, "sounds": true,
  "states": [
    { "kind": "button", "at": 0, "text": "Order ahead", "acts": [ { "type": "click", "at": 1, "x": 30, "y": 10 } ] },
    { "kind": "loader", "at": 2 },
    { "kind": "check", "at": 4, "fill": "accent" },
    { "kind": "stat", "at": 6, "value": "7am", "label": "Open every day" }
  ]
}
```

- Time is in beats: at 120 BPM a beat is half a second, `bars × beatsPerBar` beats in all.
- Coordinates are units of a 1440 frame with the origin at the shape's centre. Per state: `w`, `h`, `r` (corner radius), `fill` (`ink`, `paper`, `accent`, `none` or a hex), `cx`, `cy`. Leave them out and the kind's own size is used.
- Acts: `click { at, x, y }`, `drag { at, until, x0, y0, x1, y1 }`, `hover` (like drag, no press), `type { at, until }`, `focus { at }`.
- Saving normalizes the document: unknown kinds are dropped and numbers are clamped, without an error. Read it back.

## 2. The tools, in order

| # | Call | Why |
| --- | --- | --- |
| 1 | `project_brief` | What this project is, its brand colours and voice. |
| 2 | `motion_list` | The motion graphics in the project, and the templates, feels and kinds that exist. |
| 3 | `motion_read` | One motion graphic as JSON. Read a template's result to learn a kind's words. |
| 4 | `motion_write` | Saves a whole document under a key. `{ "template": "<id>", "name": …, "accent": "#…", "aspect": "9:16" }` starts from a template. |

Rules of the tools:

- `motion_write` replaces the whole document. To change one, `motion_read` it, change what you mean to, and write all of it back.
- A new piece gets a new key (lowercase words with dashes). Never write over a key you were not asked to change.
- When the person's role needs an OK for motion graphics, your write becomes a change request and the answer says who approves. Nothing changes until they do.
- There is no dry run and no check tool here: `motion_read` after writing is your check.

## 3. What exists

Kinds of state:

<!-- gen:motion:kinds -->
`button`, `loader`, `check`, `island`, `player`, `slider`, `toggle`, `tabs`, `chart`, `bars`, `donut`, `cmdk`, `toast`, `card`, `notif`, `logo`, `wordmark`, `word`, `list`, `stat`, `ring`, `phone`, `image`, `wipe`, `post`, `quote`, `poll`, `count`, `lower`, `caption`, `badge`, `scene`, `appicon`, `endcard`
<!-- /gen -->

Templates, by group:

<!-- gen:motion:templates -->
- ui: `ui-reel`, `ui-checkout`, `ui-player`, `ui-controls`, `ui-command`, `ui-notify`, `ui-onboard`, `ui-island`
- promo: `app-preview`, `app-features`, `app-icon`, `app-whatsnew`, `app-carousel`, `app-download`
- logo: `logo-draw`, `logo-stagger`, `logo-morph`, `logo-type`, `logo-icon`
- type: `type-punch`, `type-quote`, `type-question`, `type-list`, `type-countdown`, `type-stack`
- stat: `stat-big`, `stat-trio`, `stat-ring`, `stat-compare`
- chart: `chart-line`, `chart-bars`, `chart-donut`, `chart-board`, `chart-story`
- social: `social-post`, `social-hook`, `social-carousel`, `social-launch`, `social-quote`, `social-poll`, `social-milestone`, `social-live`, `soc-pov`, `soc-hot-take`, `soc-myth-fact`, `soc-three-words`, `soc-question-hook`, `soc-top-text`, `soc-one-liner`, `soc-stacked`, `soc-launch-916`, `soc-feature-drop`, `soc-release-notes`, `soc-teaser`, `soc-download`, `soc-beta-call`, `soc-coming-soon-916`, `soc-event-invite`, `soc-before-after-916`, `soc-day1-day30`, `soc-hours-built`, `soc-milestone-night`, `soc-weekly-recap`, `soc-highlight-4x5`, `soc-speedrun`, `soc-streak`, `soc-leaderboard`, `soc-split-compare`, `soc-new-look`, `soc-poll-916`, `soc-feedback-poll`, `soc-qa`, `soc-quote-4x5`, `soc-reply-card`, `soc-shoutout`, `soc-thank-you-4x5`, `soc-screen-spotlight`, `soc-click-to-edit`, `soc-search-reveal`, `soc-dark-mode`, `soc-tabs-tour`, `soc-notification`, `soc-island-music`, `soc-remix-this`, `soc-step-by-step-916`, `soc-link-in-bio`, `soc-live-916`, `soc-stream-169`, `soc-bts`, `soc-bug-fixed`, `soc-roadmap`, `soc-jam-recap`, `soc-tutorial-intro`, `soc-collab`, `soc-thread-opener`, `soc-countdown-169`, `soc-carousel-steps`, `soc-linkedin-update`, `soc-checkout-demo`, `soc-onboarding-916`, `soc-ask-flint`, `soc-stat-donut`, `soc-greeting`
- tour: `tour-zoom`, `tour-wipe`, `tour-spot`, `tour-devices`
- end: `end-remix`, `end-follow`, `end-cta`
- trans: `trans-circle`, `trans-pill`, `trans-stack`
- lower: `lower-name`, `lower-place`, `lower-live`
- caption: `cap-karaoke`, `cap-pill`, `cap-outline`
- share: `share-app-916`, `share-site-916`, `share-timelapse-916`, `share-app-11`, `share-site-11`, `share-timelapse-11`, `share-app-169`, `share-site-169`, `share-timelapse-169`
<!-- /gen -->

Feels (how the springs, blur and camera behave):

<!-- gen:motion:feels -->
`crisp`, `snappy`, `calm`, `smooth`, `gentle`, `brisk`, `silky`, `steady`, `precise`, `lively`, `relaxed`, `firm`, `soft`, `swift`, `measured`, `breezy`, `tight`, `loose`, `polished`, `studio`, `launch`, `keynote`, `documentary`, `playful`, `elegant`, `minimal`, `bold`, `punchy`, `dreamy`, `cinematic`, `sharp`, `fluid`, `liquid`, `weighty`, `light`, `feather`, `glide`, `tactile`, `hushed`, `energetic`, `rapid`, `reveal`, `easygoing`, `confident`, `cleancut`, `velvet`, `metronome`, `heartbeat`, `paper`, `closeup`, `wide`, `social`, `demo`, `ambient`
<!-- /gen -->

<!-- gen:motion:themes -->
Themes: `warm`, `night`, `paper`, `ink`. Aspects: `1:1`, `9:16`, `16:9`, `4:5`.
<!-- /gen -->

## 4. How to make it good

<!-- gen:motion:start -->
- Read the project brief first. A motion graphic shows one idea in a few seconds: one product moment, one number, one line.
- Start from a template (motion_write with { template }) and change its words and colours. Build states by hand only when no template fits.
<!-- /gen -->

<!-- gen:motion:good -->
**Shape**
- Four to eight states. Each state is on screen for at least two beats so it can be read.
- One shape morphs through every state; it is never cut. Let neighbouring states differ in size or roundness so the morph shows.
- Put states and acts on the beat (whole or half beats). Leave the last state a bar to rest before the loop.

**Words**
- Words in a state are three to five words. Real names and numbers from the brief; never placeholder text.

**Colour**
- The theme has five colours: bg, ink, paper, accent, muted. Use the brand kit's accent. Fill states with ink or paper and keep accent for the one state that matters.

**Feel**
- Pick one feel that fits the brand (calm, crisp, playful …) and keep the camera gentle (strength at most 0.6) unless the piece is a bold promo.
- Loops must close: keep loop on and end where you began.
<!-- /gen -->

### What to avoid

<!-- gen:motion:avoid -->
- More than eight states, or states shorter than a beat.
- A different colour on every state.
- Cursor acts that click nothing: every click or drag lands on the shape of its own state.
<!-- /gen -->

## 5. Before you say it is done

<!-- gen:motion:checklist -->
- [ ] motion_read after writing: the state count, bars and tempo are what you meant (unknown kinds are dropped silently).
- [ ] Every word is real and short; the accent is the brand's.
- [ ] The piece loops cleanly and is under about 15 seconds.
<!-- /gen -->

Then tell the person where it is (Motion Studio, by its name) and that exporting it (MP4, GIF, a section on the website) is theirs to do.

## 6. What you must never do

<!-- gen:motion:never -->
- Overwrite a motion graphic you were not asked to change: use a new key for a new piece.
- Add music or pictures from addresses the person did not give.
- Export or publish it. A person does that.
<!-- /gen -->
