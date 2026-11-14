# Make an app: Production

Checklists for an app with real users. Adjust to your platform and rules where you live.

## Product and roles

- [ ] A one-page brief: who it is for, the main job, what is out of scope
- [ ] Named owners: Product, Design, Engineering, QA, Release, Support
- [ ] A reviewer who did not write the change approves each one

## Build pipeline

- [ ] Every change is a task, reviewed, and tested before it goes in
- [ ] Automated tests run on every change; the main line always works
- [ ] Separate places for development, testing and live, with separate data
- [ ] Secrets stored outside the code and rotated

## Versioning and release

- [ ] Version numbers follow one rule (for example major.minor.patch) and each has a change note
- [ ] Staged rollout: a small group first, then everyone
- [ ] A written way to roll back, tried at least once

## Performance budget

- [ ] First load under 3 seconds on a mid-range phone on mobile data
- [ ] Pictures sized and compressed; code size agreed per screen
- [ ] Taps respond within 100 ms; long work shows progress
- [ ] Works offline or fails kindly, and recovers when the connection returns

## Accessibility

- [ ] Contrast 4.5 to 1; text scales to 200 percent without breaking
- [ ] Screen reader labels on every control; logical focus order
- [ ] Targets at least 44 px; nothing depends on color alone
- [ ] Reduced motion respected

## Security and privacy

- [ ] Sign-in, sessions and permissions reviewed; input checked on the server
- [ ] Privacy statement matches what the app collects; export and delete paths exist
- [ ] Dependencies and licences listed and kept current
- [ ] Backups made and a restore tested

## Store submission

- [ ] **Install on phones** checked first: name, icon, offline copy, on a real Android phone and iPhone
- [ ] **Google Play**: Play developer account; the release's `app.aab` signed with your own key, kept as secrets in your GitHub project; name, description, two or more screenshots, icon, privacy answers, age rating, a test account for reviewers
- [ ] **Android address bar**: the release's `assetlinks.json` added to your own site so the app opens full screen
- [ ] **iPhone (TestFlight)**: a Mac and a paid Apple developer account; Publish prepares the build file, you upload it and invite testers
- [ ] **Computer app**: installers are unsigned; sign them or explain the warning
- [ ] Each store's rules read; time allowed for review and a rejected first try

## After launch

- [ ] Error and crash reports watched; a support address answered
