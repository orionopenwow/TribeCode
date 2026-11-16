// Flint in App Creator (app/ui/appcreator.js): making an app from a sentence anywhere ('g'), and, with App Creator open
// ('a' = ctx.view 'appcreator', app/test/flint_eval_test.js), kits, parts, links, the look, play and export.
// Used by scripts/dev/flint-eval-cases.js as v:'ac'. [ctx, text, intent, slots?]
module.exports = [
  // make an app, from anywhere
  ['g', 'make me a habit tracker app', 'app.make', { template: 'habits' }], ['g', 'build a workout app', 'app.make', { template: 'workout' }], ['g', 'create a recipe app called Supper', 'app.make', { template: 'recipes', name: 'Supper' }],
  ['g', 'make a budget app in blue', 'app.make', { template: 'budget' }], ['g', 'design a meditation app', 'app.make', { template: 'meditation' }], ['g', 'i want a travel planner app', 'app.make', { template: 'trip' }],
  ['g', 'make a notes phone app', 'app.make', { template: 'notes' }], ['g', 'build a todo mobile app', 'app.make', { template: 'todo' }], ['g', 'make a podcast app', 'app.make', { template: 'podcast' }],
  ['g', 'create a pet care app', 'app.make', { template: 'pets' }], ['g', 'a sleep tracker app', 'app.make', { template: 'sleep' }], ['g', 'make me a grocery list app', 'app.make', { template: 'grocery' }],
  ['g', 'build a music player app', 'app.make', { template: 'music' }], ['g', 'make an invoice app', 'app.make', { template: 'invoices' }], ['g', 'make a language flashcards app', 'app.make', { template: 'flashcards' }],
  // unchanged neighbours
  ['g', 'make a notes app', 'site.starter-notes'], ['g', 'build a chat app', 'site.starter-chat'], ['g', 'design a mobile app', 'design.new', { kind: 'app' }], ['g', 'make an iphone app', 'publish.to'],
  ['g', 'make a site for my mobile app', 'site.start', { kind: 'app' }],
  // kits and screens
  ['a', 'add a settings screen', 'app.kit', { kit: 'settings' }], ['a', 'add onboarding', 'app.kit', { kit: 'onboarding' }], ['a', 'add a paywall', 'app.kit', { kit: 'paywall' }], ['a', 'add a login screen', 'app.kit', { kit: 'signin' }],
  ['a', 'add sign in', 'app.kit', { kit: 'signin' }], ['a', 'add a profile page', 'app.kit', { kit: 'profile' }], ['a', 'i need a checkout flow', 'app.kit', { kit: 'checkout' }], ['a', 'add a notifications screen', 'app.kit', { kit: 'notifications' }],
  ['a', 'add a search screen', 'app.kit', { kit: 'search' }], ['a', 'add a leaderboard', 'app.kit', { kit: 'leaderboard' }], ['a', 'add welcome screens', 'app.kit', { kit: 'onboarding' }], ['a', 'put in a help page', 'app.kit', { kit: 'help' }],
  ['a', 'add a new screen', 'app.screen'], ['a', 'add a screen called Rewards', 'app.screen', { name: 'Rewards' }], ['a', 'add a tab bar', 'app.tabbar'], ['a', 'give it bottom tabs', 'app.tabbar'],
  // parts
  ['a', 'add a chart', 'app.block', { type: 'chart' }], ['a', 'add a button', 'app.block', { type: 'button' }], ['a', 'add a list', 'app.block', { type: 'list' }], ['a', 'put a map here', 'app.block', { type: 'map' }],
  ['a', 'add a search bar', 'app.block', { type: 'search' }], ['a', 'add a picture', 'app.block', { type: 'image' }], ['a', 'add stat tiles', 'app.block', { type: 'stats' }], ['a', 'add a checklist', 'app.block', { type: 'checklist' }],
  ['a', 'add a date picker', 'app.block', { type: 'calendar' }], ['a', 'add a form', 'app.block', { type: 'form' }], ['a', 'insert a feed post', 'app.block', { type: 'feed' }],
  // links
  ['a', 'link this button to the profile screen', 'app.link', { to: 'profile' }], ['a', 'link it to settings as a sheet', 'app.link', { to: 'settings', how: 'sheet' }], ['a', 'make this go to the cart', 'app.link', { to: 'cart' }],
  ['a', 'when tapped go to stats', 'app.link', { to: 'stats' }], ['a', 'connect this to the home screen', 'app.link', { to: 'home' }],
  // the look
  ['a', 'make it dark', 'app.theme', { mode: 'dark' }], ['a', 'dark mode', 'app.theme', { mode: 'dark' }], ['a', 'make it light', 'app.theme', { mode: 'light' }], ['a', 'rounder', 'app.theme', { radius: 'more' }],
  ['a', 'make the corners sharper', 'app.theme', { radius: 'less' }], ['a', 'pill buttons', 'app.theme', { radius: 'pill' }], ['a', 'more space', 'app.theme', { density: 'roomy' }], ['a', 'make it more compact', 'app.theme', { density: 'compact' }],
  ['a', 'snappier', 'app.theme', { motion: 'snappy' }], ['a', 'calmer motion', 'app.theme', { motion: 'calm' }], ['a', 'thin icons', 'app.theme', { icons: 'thin' }], ['a', 'warm background', 'app.theme', { surface: 'warm' }],
  ['a', 'make it teal', 'app.theme'], ['a', 'change the color to purple', 'app.theme'], ['a', 'swap the font', 'app.theme', { font: 'next' }], ['a', 'use a serif font', 'app.theme', { font: 'editorial' }], ['a', 'mono font', 'app.theme', { font: 'mono' }],
  ['a', 'use the iOS look', 'app.platform', { platform: 'ios' }], ['a', 'make it look like android', 'app.platform', { platform: 'android' }], ['a', 'use the midnight look', 'app.preset', { preset: 'midnight' }], ['a', 'switch to the paper theme', 'app.preset', { preset: 'paper' }],
  // play, export, the AI, undo
  ['a', 'play it', 'app.play'], ['a', 'try the prototype', 'app.play'], ['a', 'export the app', 'app.export', { kind: 'pwa' }], ['a', 'make an expo project', 'app.export', { kind: 'expo' }], ['a', 'have my ai build it', 'app.export', { kind: 'ai' }],
  ['a', 'undo', 'app.undo'], ['a', 'rename the app to Pocket', 'app.rename'], ['a', 'make me a shop app', 'app.make', { template: 'shop' }],
];
