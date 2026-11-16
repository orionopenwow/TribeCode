// Flint and the website start screen (p5-start, app/ui/sitedesigner.js showStart): "make a website" opens the kinds,
// "a page for my app / my github project" opens App or project page, "send people to my app" starts the page that
// sends visitors on. The template words still pick a template ("make a link in bio", "a site for my band").
// Used by scripts/dev/flint-eval-cases.js as v:'sk'. [ctx, text, intent, slots?]
module.exports = [
  ['g', 'make a website', 'site.start', { kind: '' }], ['g', 'build me a new site', 'site.start', { kind: '' }], ['g', 'start a website', 'site.start', { kind: '' }],
  ['g', 'new website', 'site.start', { kind: '' }], ['g', 'i want a new website', 'site.start', { kind: '' }], ['g', 'we need a site', 'site.start', { kind: '' }],
  ['g', 'create a web page', 'site.start', { kind: '' }],
  ['g', 'make a page for my app', 'site.start', { kind: 'app' }], ['g', 'build a website for my github project', 'site.start', { kind: 'app' }],
  ['g', 'make a site for our game', 'site.start', { kind: 'app' }], ['g', 'make a homepage for my open source project', 'site.start', { kind: 'app' }],
  ['g', 'make a project page', 'site.start', { kind: 'app' }], ['g', 'build an app page', 'site.start', { kind: 'app' }],
  ['g', 'make a page for my repo', 'site.start', { kind: 'app' }], ['g', 'create a website for my ios app', 'site.start', { kind: 'app' }],
  ['s', 'make a page for my app', 'site.start', { kind: 'app' }],
  ['g', 'send people to my app', 'site.redirect'], ['g', 'make a page that sends people to my app store page', 'site.redirect'],
  ['g', 'redirect visitors to my latest release', 'site.redirect'], ['g', 'make a redirect page', 'site.redirect'],
  ['g', 'forward people to my github', 'site.redirect'], ['g', 'make a redirect to https://example.com/app', 'site.redirect'],
  ['g', 'send everyone straight to the download page', 'site.redirect'], ['s', 'send people to my app', 'site.redirect'],
  ['g', 'make a link in bio', 'site.linkbio'], ['g', 'make a landing page for my game', 'build.landing'], ['g', 'make a site for my band', 'site.band'],
];
