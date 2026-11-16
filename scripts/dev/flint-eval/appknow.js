// Flint and app features with no AI (app/ui/appfeatures.js, feat/flint-appknow): inside App Creator ('a') any feature
// by its words; elsewhere ('g') only when the sentence names the app. Questions stay questions (they get an answer from
// docs/APP-BUILDING.md), and App Creator's own parts keep their meaning ("add a search bar" is a part).
// The second half are held-out phrasings written after the rules, so the words aren't tuned to them.
// Used by scripts/dev/flint-eval-cases.js as v:'ak'. [ctx, text, intent, slots?]
const F = 'app.feature';
module.exports = [
  // inside App Creator
  ['a', 'add offline storage', F, { feature: 'remember' }], ['a', 'make it remember things', F, { feature: 'remember' }], ['a', 'make it work offline', F, { feature: 'remember' }],
  ['a', 'let people add items to the list', F, { feature: 'addlist' }], ['a', 'add swipe to delete', F, { feature: 'swipe' }], ['a', 'add backup and restore', F, { feature: 'backup' }],
  ['a', 'add a start over button', F, { feature: 'reset' }], ['a', 'add export to csv', F, { feature: 'csv' }], ['a', 'add notes on items', F, { feature: 'notes' }],
  ['a', 'add favorites', F, { feature: 'favorites' }], ['a', 'make it searchable', F, { feature: 'search' }], ['a', 'add search that works', F, { feature: 'search' }],
  ['a', 'add a sort button', F, { feature: 'sort' }], ['a', 'filter by tag', F, { feature: 'filterchips' }], ['a', 'add a dark mode toggle', F, { feature: 'darkswitch' }],
  ['a', 'add a bigger text option', F, { feature: 'textsize' }], ['a', 'add haptic feedback', F, { feature: 'haptics' }], ['a', 'add pull to refresh', F, { feature: 'pullrefresh' }],
  ['a', 'add skeleton loading', F, { feature: 'skeleton' }], ['a', 'add toast messages', F, { feature: 'toasts' }], ['a', 'add confetti when finished', F, { feature: 'celebrate' }],
  ['a', 'add an install button', F, { feature: 'install' }], ['a', 'add an offline banner', F, { feature: 'offline' }], ['a', 'add reminders', F, { feature: 'reminders' }],
  ['a', 'use my location', F, { feature: 'location' }], ['a', 'make the map work', F, { feature: 'map' }], ['a', 'keep the screen on', F, { feature: 'wakelock' }],
  ['a', 'make the timer work', F, { feature: 'timer' }], ['a', 'add a stopwatch', F, { feature: 'stopwatch' }], ['a', 'add a daily streak', F, { feature: 'streak' }],
  ['a', 'add a demo login', F, { feature: 'demologin' }], ['a', 'add a pin lock', F, { feature: 'pinlock' }], ['a', 'show onboarding only once', F, { feature: 'onboardonce' }],
  ['a', 'add up the numbers', F, { feature: 'totals' }], ['a', 'add a tap counter', F, { feature: 'counter' }], ['a', 'add a chart from the list', F, { feature: 'chart' }],
  ['a', 'translate the app', F, { feature: 'languages' }], ['a', 'add read aloud', F, { feature: 'readaloud' }], ['a', 'add speech to text', F, { feature: 'dictate' }],
  ['a', 'add keyboard shortcuts', F, { feature: 'shortcuts' }], ['a', 'add an undo button', F, { feature: 'undo' }], ['a', 'remove the pin lock', F, { feature: 'pinlock', off: true }],
  ['a', 'turn off haptics', F, { feature: 'haptics', off: true }],
  // from anywhere, naming the app
  ['g', 'add offline storage to my app', F, { feature: 'remember' }], ['g', 'add a dark mode switch to the app', F, { feature: 'darkswitch' }], ['g', 'add reminders to my app', F, { feature: 'reminders' }],
  ['g', 'add swipe to delete in my app', F, { feature: 'swipe' }], ['g', 'my app loses data on reload', F, { feature: 'remember' }],
  ['g', 'what features can you add', 'app.features'], ['g', 'what can you add to my app', 'app.features'], ['g', 'list the app features', 'app.features'],
  // neighbours that keep their meaning
  ['a', 'add a search bar', 'app.block', { type: 'search' }], ['a', 'add a settings screen', 'app.kit', { kit: 'settings' }], ['a', 'add a login screen', 'app.kit', { kit: 'signin' }],
  ['a', 'make it dark', 'app.theme', { mode: 'dark' }], ['g', 'set a timer for 5 minutes', 'timer'],
  // held out (written after the rules)
  ['a', 'please make it save my data', F, { feature: 'remember' }], ['a', 'could you add swipe left to delete', F, { feature: 'swipe' }], ['a', 'i want people to be able to star items', F, { feature: 'favorites' }],
  ['a', 'give it a light and dark switch', F, { feature: 'darkswitch' }], ['a', 'add a countdown that beeps', F, { feature: 'timer' }], ['a', 'add a wake lock', F, { feature: 'wakelock' }],
  ['a', 'put a share sheet in', F, { feature: 'share' }], ['a', 'add a running total', F, { feature: 'totals' }], ['a', 'add multiple languages', F, { feature: 'languages' }],
  ['a', 'add a passcode lock', F, { feature: 'pinlock' }], ['a', 'let me export my data', F, { feature: 'backup' }], ['a', 'add an offline notice', F, { feature: 'offline' }],
  ['g', 'put a share sheet in my app', F, { feature: 'share' }], ['g', 'add a stopwatch to the app', F, { feature: 'stopwatch' }],
];
