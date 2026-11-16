// Flint, the design library and the 50+ examples (feat/asset-libs): the newer moving backgrounds in the website designer
// (ctx 's'), the new App Creator parts, screens and tap sounds (ctx 'a'), and the library itself anywhere ('g').
// Used by scripts/dev/flint-eval-cases.js as v:'as'.   [ctx, text, intent, slots?]
module.exports = [
  // the website designer: backgrounds named by what they look like
  ['s', 'add a sparkle background', 'site.fx', { op: 'add', kind: 'sparkle' }], ['s', 'put sparkles behind the header', 'site.fx', { op: 'add', kind: 'sparkle', block: 'header' }],
  ['s', 'add a snow background', 'site.fx', { op: 'add', kind: 'snow' }], ['s', 'make it snow in the background', 'site.fx', { op: 'add', kind: 'snow' }],
  ['s', 'put confetti behind the header', 'site.fx', { op: 'add', kind: 'confetti', block: 'header' }], ['s', 'confetti background please', 'site.fx', { op: 'add', kind: 'confetti' }],
  ['s', 'use the aurora background', 'site.fx', { op: 'add', kind: 'aurora' }], ['s', 'northern lights behind the hero', 'site.fx', { op: 'add', kind: 'aurora', block: 'hero' }],
  ['s', 'add a rain background', 'site.fx', { op: 'add', kind: 'rain' }], ['s', 'add fireflies behind the footer', 'site.fx', { op: 'add', kind: 'fireflies', block: 'footer' }],
  ['s', 'add bubbles to the background', 'site.fx', { op: 'add', kind: 'bubbles' }], ['s', 'put code rain behind the hero', 'site.fx', { op: 'add', kind: 'coderain', block: 'hero' }],
  ['s', 'matrix style background', 'site.fx', { op: 'add', kind: 'coderain' }], ['s', 'add a synthwave grid background', 'site.fx', { op: 'add', kind: 'grid' }],
  ['s', 'add a retro grid behind the header', 'site.fx', { op: 'add', kind: 'grid', block: 'header' }], ['s', 'add a contour lines background', 'site.fx', { op: 'add', kind: 'contour' }],
  ['s', 'lava lamp blobs in the background', 'site.fx', { op: 'add', kind: 'blobs' }], ['s', 'add wave lines behind the hero', 'site.fx', { op: 'add', kind: 'waves', block: 'hero' }],
  ['s', 'add a pool light background', 'site.fx', { op: 'add', kind: 'caustics' }], ['s', 'underwater light behind the contact section', 'site.fx', { op: 'add', kind: 'caustics', block: 'contact' }],
  ['s', 'add a halftone background', 'site.fx', { op: 'add', kind: 'halftone' }], ['s', 'add sliding stripes behind the cta', 'site.fx', { op: 'add', kind: 'stripes', block: 'cta' }],
  ['s', 'add a sunburst background', 'site.fx', { op: 'add', kind: 'sunburst' }], ['s', 'add a spiral background', 'site.fx', { op: 'add', kind: 'spiral' }],
  ['s', 'add a tunnel background', 'site.fx', { op: 'add', kind: 'tunnel' }], ['s', 'desert dunes in the background', 'site.fx', { op: 'add', kind: 'dunes' }],
  ['s', 'add clouds to the background', 'site.fx', { op: 'add', kind: 'clouds' }], ['s', 'add an ink background', 'site.fx', { op: 'add', kind: 'ink' }],
  ['s', 'add a marble background', 'site.fx', { op: 'add', kind: 'marble' }], ['s', 'add scanlines behind the hero', 'site.fx', { op: 'add', kind: 'scanlines', block: 'hero' }],
  ['s', 'add a honeycomb background', 'site.fx', { op: 'add', kind: 'hexes' }], ['s', 'add a pencil hatch background', 'site.fx', { op: 'add', kind: 'hatch' }],
  ['s', 'add a checkerboard background', 'site.fx', { op: 'add', kind: 'checker' }], ['s', 'add a mesh gradient background', 'site.fx', { op: 'add', kind: 'colorfield' }],
  ['s', 'add ridge lines behind the hero', 'site.fx', { op: 'add', kind: 'ridges', block: 'hero' }], ['s', 'add a radar background', 'site.fx', { op: 'add', kind: 'radar' }],
  ['s', 'add a bokeh background', 'site.fx', { op: 'add', kind: 'bokeh' }], ['s', 'add film grain to the background', 'site.fx', { op: 'add', kind: 'grain' }],
  ['s', 'add chevrons to the background', 'site.fx', { op: 'add', kind: 'zigzag' }], ['s', 'add a circuit board background', 'site.fx', { op: 'add', kind: 'circuit' }],
  ['s', 'add light beams behind the header', 'site.fx', { op: 'add', kind: 'beams', block: 'header' }], ['s', 'add an equalizer background', 'site.fx', { op: 'add', kind: 'equalizer' }],
  ['s', 'add orbits to the background', 'site.fx', { op: 'add', kind: 'orbits' }], ['s', 'add a pendulum background', 'site.fx', { op: 'add', kind: 'pendulum' }],
  ['s', 'add a flow field background', 'site.fx', { op: 'add', kind: 'flow' }], ['s', 'add a looping curve background', 'site.fx', { op: 'add', kind: 'lissajous' }],
  // the older ones keep their words
  ['s', 'add a 3d globe behind the hero', 'site.fx', { op: 'add', kind: 'sphere', block: 'hero' }], ['s', 'add water drops to the background', 'site.fx', { op: 'add', kind: 'drops' }],
  // App Creator: the new parts
  ['a', 'add a weather card', 'app.block', { type: 'weather' }], ['a', 'add a countdown', 'app.block', { type: 'countdown' }], ['a', 'add a segmented control', 'app.block', { type: 'segmented' }],
  ['a', 'add a slider', 'app.block', { type: 'slider' }], ['a', 'add a star rating', 'app.block', { type: 'rating' }], ['a', 'add a progress bar', 'app.block', { type: 'progress' }],
  ['a', 'add story circles', 'app.block', { type: 'stories' }], ['a', 'add a quote', 'app.block', { type: 'quote' }], ['a', 'add a notice', 'app.block', { type: 'alert' }],
  ['a', 'add an accordion', 'app.block', { type: 'accordion' }], ['a', 'add a photo carousel', 'app.block', { type: 'carousel' }], ['a', 'add a product card', 'app.block', { type: 'product' }],
  ['a', 'add a receipt', 'app.block', { type: 'receipt' }], ['a', 'add an order tracker', 'app.block', { type: 'tracker' }], ['a', 'add activity rings', 'app.block', { type: 'rings' }],
  ['a', 'add a table', 'app.block', { type: 'table' }], ['a', 'add tags', 'app.block', { type: 'tags' }], ['a', 'add a contact card', 'app.block', { type: 'contact' }],
  ['a', 'add code boxes', 'app.block', { type: 'otp' }], ['a', 'add a number pad', 'app.block', { type: 'keypad' }], ['a', 'add a color picker', 'app.block', { type: 'swatches' }],
  ['a', 'add comments', 'app.block', { type: 'comments' }], ['a', 'add a notification card', 'app.block', { type: 'notice' }], ['a', 'add a coupon', 'app.kit', { kit: 'coupon' }],
  ['a', 'add a poll', 'app.block', { type: 'poll' }], ['a', 'add a voice note', 'app.block', { type: 'voice' }], ['a', 'add a video player', 'app.block', { type: 'video' }],
  ['a', 'add kanban columns', 'app.block', { type: 'kanban' }], ['a', 'add a hero image', 'app.block', { type: 'hero' }], ['a', 'add switch rows', 'app.block', { type: 'toggles' }],
  // App Creator: the new ready-made screens
  ['a', 'add an order tracker screen', 'app.kit', { kit: 'order-tracking' }], ['a', 'add a product page', 'app.kit', { kit: 'product-page' }], ['a', 'add a reviews screen', 'app.kit', { kit: 'reviews' }],
  ['a', 'add a verify code screen', 'app.kit', { kit: 'verify-code' }], ['a', 'add a send money screen', 'app.kit', { kit: 'send-money' }], ['a', 'add a weather screen', 'app.kit', { kit: 'weather' }],
  ['a', 'add an activity screen', 'app.kit', { kit: 'activity' }], ['a', 'add a poll screen', 'app.kit', { kit: 'poll' }], ['a', 'add a task board screen', 'app.kit', { kit: 'board' }],
  ['a', 'add a help center', 'app.kit', { kit: 'help-center' }], ['a', 'add an offline screen', 'app.kit', { kit: 'offline' }], ['a', 'add an appearance screen', 'app.kit', { kit: 'theme-picker' }],
  ['a', 'add an event page', 'app.kit', { kit: 'event-page' }], ['a', 'add a set a goal screen', 'app.kit', { kit: 'goal-setup' }], ['a', "add a what's new screen", 'app.kit', { kit: 'whats-new' }],
  ['a', 'add notification settings', 'app.kit', { kit: 'settings-notify' }], ['a', 'add a video lesson screen', 'app.kit', { kit: 'lesson' }], ['a', 'add a team contacts screen', 'app.kit', { kit: 'team-contacts' }],
  // App Creator: a sound on every tap
  ['a', 'play a click sound on tap', 'app.theme', { sound: 'click' }], ['a', 'make buttons pop when you tap them with a sound', 'app.theme', { sound: 'pop' }],
  ['a', 'add a tap sound to the buttons', 'app.theme', { sound: 'tap' }], ['a', 'no tap sounds', 'app.theme', { sound: '' }], ['a', 'turn off the button sounds', 'app.theme', { sound: '' }],
  // the library, anywhere
  ['g', 'open the design library', 'library.open'], ['g', 'design library', 'library.open'], ['g', 'show me the library', 'library.open'],
  ['g', 'show me the icons in the library', 'library.open', { kind: 'icons' }], ['g', 'browse the backgrounds in the library', 'library.open', { kind: 'backgrounds' }],
  ['g', 'show me the colours in the library', 'library.open', { kind: 'colours' }], ['g', 'play a click sound', 'library.open', { q: 'click' }], ['g', 'play the success sound', 'library.open', { q: 'success' }],
  ['g', 'use the sunset palette', 'design.palette', { mood: 'sunset' }], ['g', 'find a rocket icon', 'asset.add', { kind: 'icon' }],
  ['s', 'add a pricing section', 'site.block.add', { block: 'pricing' }], ['a', 'add a profile screen', 'app.kit', { kit: 'profile' }],
];
