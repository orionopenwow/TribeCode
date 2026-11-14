# Make an app: Production

Checklists for an app with real users. Adjust to your platform and rules where you live.

## Product and roles

- [ ] A one-page brief: who it is for, the main job, what is out of scope
- [ ] Named owners: Product, Design, Engineering, QA, Release, Support
- [ ] A reviewer who did not write the change approves each one

## Build pipeline

- [ ] Every change is a task, reviewed, and tested before it is merged
- [ ] Automated tests run on every change; the main line always works
- [ ] Separate places for development, testing and live, with separate data
- [ ] Secrets stored outside the code and rotated

## Versioning and release

- [ ] Version numbers follow one rule (for example major.minor.patch) and each has a change note
- [ ] Staged rollout: a small group first, then everyone
- [ ] A written way to roll back, tried at least once
- [ ] Data changes can run forward and backward

## Performance budget

- [ ] First load under 3 seconds on a mid-range phone on mobile data
- [ ] App code under an agreed size per screen; pictures sized and compressed
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

- [ ] Icons, screenshots per device size, descriptions, keywords
- [ ] Privacy answers, age rating, test account for reviewers
- [ ] Each store's rules read; time allowed for review and a rejected first try

## After launch

- [ ] Error and crash reports watched; a support address answered
- [ ] A regular release rhythm and a list of known problems
