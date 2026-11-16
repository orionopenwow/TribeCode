// Flint and the lesson tracks (pass 4, app/ui/lessons.js; the tracks are in templates/quickguides.json): starting a
// lesson by what it teaches, listing them, the next one, pausing. The three-line feature lessons ("teach me the
// website designer") keep their own intent, so a few of those are here to hold the line between the two.
// Used by scripts/dev/flint-eval-cases.js as v:'ls'. [ctx, text, intent, slots?]
module.exports = [
  ['g', 'teach me to make a website', 'learn.track', { track: 'first-site' }], ['g', 'teach me how to build a website', 'learn.track', { track: 'first-site' }],
  ['g', 'i want to learn to make a website step by step', 'learn.track', { track: 'first-site' }], ['g', 'the website lesson', 'learn.track', { track: 'first-site' }],
  ['g', 'start the website lesson', 'learn.track', { track: 'first-site' }], ['g', 'teach me to create a landing page', 'learn.track', { track: 'first-site' }],
  ['g', 'help me learn to build a site from scratch', 'learn.track', { track: 'first-site' }], ['g', 'teach me my first website', 'learn.track', { track: 'first-site' }],
  ['g', 'teach me to make an app', 'learn.track', { track: 'first-app' }], ['g', 'teach me how to build an app step by step', 'learn.track', { track: 'first-app' }],
  ['g', 'app lesson', 'learn.track', { track: 'first-app' }], ['g', 'take the phone app lesson', 'learn.track', { track: 'first-app' }],
  ['g', 'i want to learn to design an app', 'learn.track', { track: 'first-app' }], ['g', 'walk me through my first app', 'learn.track', { track: 'first-app' }],
  ['s', 'teach me to make an app', 'learn.track', { track: 'first-app' }],
  ['g', 'teach me to work with friends', 'learn.track', { track: 'together' }], ['g', 'take the teamwork lesson', 'learn.track', { track: 'together' }],
  ['g', 'teach me to build together with a friend', 'learn.track', { track: 'together' }], ['g', 'the working together lesson', 'learn.track', { track: 'together' }],
  ['g', 'teach me to put it online', 'learn.track', { track: 'online' }], ['g', 'teach me to publish my site', 'learn.track', { track: 'online' }],
  ['g', 'teach me how to get a public address', 'learn.track', { track: 'online' }], ['g', 'do the publishing lesson', 'learn.track', { track: 'online' }],
  ['g', 'teach me to host it on github', 'learn.track', { track: 'online' }],
  ['g', 'power tools lesson', 'learn.track', { track: 'power' }], ['g', 'start the advanced lesson', 'learn.track', { track: 'power' }],
  ['g', 'lessons', 'learn.track', { track: 'list' }], ['g', 'show me the lessons', 'learn.track', { track: 'list' }], ['g', 'what lessons are there?', 'learn.track', { track: 'list' }],
  ['g', 'what is my next lesson', 'learn.track', { track: 'next' }], ['g', 'next lesson', 'learn.track', { track: 'next' }], ["g", "what's the next lesson?", 'learn.track', { track: 'next' }],
  ['g', 'stop the lesson', 'learn.track', { track: 'stop' }], ['s', 'pause this lesson', 'learn.track', { track: 'stop' }], ['g', 'close the lesson', 'learn.track', { track: 'stop' }],
  // the line between a track and a three-line feature lesson
  ['g', 'teach me the website designer', 'lesson', { feature: 'site' }], ['g', 'teach me how to wire buttons', 'lesson', { feature: 'site' }],
  ['g', 'lesson on the canvas', 'lesson', { feature: 'canvas' }], ['g', 'how do i make a website', 'lesson', { feature: 'site' }],
];
