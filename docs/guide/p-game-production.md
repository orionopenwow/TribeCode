# Make a game: Production

Checklists for a game heading to a store or a large audience. Adjust the numbers to your platform.

## Pipeline and milestones

- [ ] Milestones are named and dated: prototype, vertical slice, alpha (all features), beta (all content), release candidate, launch
- [ ] Each milestone has exit rules written before work starts
- [ ] Every change is a task with an owner and a reviewer; builds are numbered
- [ ] One line of work is always playable from start to finish

## Asset budgets

- [ ] A written budget per platform: download size, memory, texture sizes, sound length
- [ ] Naming rules and folder layout agreed and followed
- [ ] Source files kept beside exported files; every asset has a licence note
- [ ] Sprite sheets or atlases for 2D; triangle and material limits per model for 3D

## Performance

- [ ] Target frame rate set per device (60 on phones and desktop is a good default) and measured on the weakest target
- [ ] Load to first play under 5 seconds on the web, with a loading screen
- [ ] No frame spikes from loading or memory clean-up during play
- [ ] Battery and heat checked on a phone for a 15-minute session

## Accessibility and comfort

- [ ] Remappable controls; touch, keyboard and controller where they apply
- [ ] Subtitles, readable text size, color-blind safe signals
- [ ] Options for screen shake, flashes and motion
- [ ] Difficulty or assist options

## Quality

- [ ] A test plan per build; bugs have steps, severity and an owner
- [ ] Crash and save-data tests; play on every target device
- [ ] Outside playtests at alpha and beta, with notes turned into tasks

## Store submission

- [ ] **itch.io**: the itch zip from Publish uploaded as an HTML game; page with cover, screenshots, controls and credits
- [ ] **Google Play**: a Play developer account; the release's `app.aab` signed with your own key (added as secrets in your GitHub project); name, description, two or more screenshots, icon, privacy answers, age rating
- [ ] **iPhone (TestFlight)**: needs a Mac and a paid Apple developer account; Publish prepares the build file, you upload and invite testers
- [ ] **Computer app**: installers for Windows, Mac and Linux are unsigned; say so on the download page, or sign them yourself
- [ ] Each store's rules read; test builds sent early; time allowed for a rejected first try
- [ ] Launch day plan, a patch plan, and a way for players to report problems

## Team roles

Director, Producer, Design, Programming, Art, Audio, QA, Release. Write down who decides what.
