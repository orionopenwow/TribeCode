// Flint, Motion Studio (feat/motion, app/ui/motionstudio.js): what people say while editing a motion graphic (ctx 'mo' =
// the studio is open) and how they ask for one anywhere ('g'). Used by scripts/dev/flint-eval-cases.js as v:'mo'.
// [ctx, text, intent, slots?]
module.exports = [
  // anywhere: asking for one
  ['g', 'make a motion graphic', 'motion.new', { tpl: 'ui-reel' }], ['g', 'make a motion graphic of my app', 'motion.new', { tpl: 'ui-reel' }], ['g', 'open motion studio', 'motion.new'],
  ['g', 'i want a ui animation reel', 'motion.new', { tpl: 'ui-reel' }], ['g', 'make a dribbble style ui animation', 'motion.new', { tpl: 'ui-reel' }],
  ['g', 'make a logo reveal', 'motion.new', { tpl: 'logo-draw' }], ['g', 'animate our logo', 'motion.new', { tpl: 'logo-draw' }], ['g', 'logo intro for my channel', 'motion.new', { tpl: 'logo-draw' }],
  ['g', 'kinetic typography for my launch', 'motion.new', { tpl: 'type-punch' }], ['g', 'make animated text for a promo', 'motion.new', { tpl: 'type-punch' }],
  ['g', 'make an app preview video', 'motion.new', { tpl: 'app-preview' }], ['g', 'a promo video for my app', 'motion.new', { tpl: 'app-preview' }], ['g', 'make an app store video', 'motion.new', { tpl: 'app-preview' }],
  ['g', 'make an animated stat counter', 'motion.new', { tpl: 'stat-big' }], ['g', 'make an animated chart', 'motion.new', { tpl: 'chart-line' }],
  ['g', 'make a tiktok video for the game', 'motion.new', { tpl: 'social-hook' }], ['g', 'i need a clip for reels', 'motion.new', { tpl: 'social-hook' }],
  ['g', 'i need lower thirds for my stream', 'motion.new', { tpl: 'lower-name' }], ['g', 'make animated captions', 'motion.new', { tpl: 'cap-karaoke' }], ['g', 'make an end card for my video', 'motion.new', { tpl: 'end-remix' }],
  ['g', 'make a before and after video', 'motion.new', { tpl: 'tour-wipe' }], ['g', 'make a product tour video', 'motion.new', { tpl: 'tour-zoom' }], ['g', 'make a countdown animation', 'motion.new', { tpl: 'type-countdown' }],
  ['g', 'create a circle reveal transition', 'motion.new', { tpl: 'trans-circle' }], ['g', 'make an animated video for our launch', 'motion.new', { tpl: 'ui-reel' }],
  // in the studio: feel, tempo, overshoot
  ['mo', 'make it snappier', 'motion.feel', { feel: 'snappier' }], ['mo', 'punchier', 'motion.feel', { feel: 'snappier' }], ['mo', 'a bit snappier please', 'motion.feel', { feel: 'snappier' }],
  ['mo', 'calm it down', 'motion.feel', { feel: 'calmer' }], ['mo', 'make it smoother', 'motion.feel', { feel: 'calmer' }], ['mo', 'make it gentler please', 'motion.feel', { feel: 'calmer' }],
  ['mo', 'make it cinematic', 'motion.feel', { feel: 'cinematic' }], ['mo', 'give it a dreamy feel', 'motion.feel', { feel: 'dreamy' }], ['mo', 'use the playful preset', 'motion.feel', { feel: 'playful' }], ['mo', 'make it feel elegant', 'motion.feel', { feel: 'elegant' }],
  ['mo', 'slower please', 'motion.speed', { dir: 'slower' }], ['mo', 'its too fast', 'motion.speed', { dir: 'slower' }], ['mo', 'slow it down a little', 'motion.speed', { dir: 'slower' }],
  ['mo', 'make it faster', 'motion.speed', { dir: 'faster' }], ['mo', 'speed it up', 'motion.speed', { dir: 'faster' }], ['mo', 'raise the tempo', 'motion.speed', { dir: 'faster' }],
  ['mo', 'less bounce', 'motion.overshoot', { more: false }], ['mo', 'its too bouncy', 'motion.overshoot', { more: false }], ['mo', 'no overshoot', 'motion.overshoot', { more: false }], ['mo', 'a little more bounce', 'motion.overshoot', { more: true }],
  // size, loop, beat, length
  ['mo', 'make it 9:16 for tiktok', 'motion.aspect', { ratio: '9:16' }], ['mo', 'vertical for reels', 'motion.aspect', { ratio: '9:16' }], ['mo', 'make it for youtube shorts', 'motion.aspect', { ratio: '9:16' }],
  ['mo', 'make it 16:9', 'motion.aspect', { ratio: '16:9' }], ['mo', 'landscape for youtube', 'motion.aspect', { ratio: '16:9' }], ['mo', 'make a version for twitter', 'motion.aspect', { ratio: '16:9' }],
  ['mo', 'make it square', 'motion.aspect', { ratio: '1:1' }], ['mo', 'size it for an instagram post', 'motion.aspect', { ratio: '4:5' }],
  ['mo', 'loop it', 'motion.loop', { on: true }], ['mo', 'make it loop seamlessly', 'motion.loop', { on: true }], ['mo', 'play it once', 'motion.loop', { on: false }], ['mo', 'stop looping', 'motion.loop', { on: false }],
  ['mo', 'sync it to the beat', 'motion.beat'], ['mo', 'snap everything to the grid', 'motion.beat'], ['mo', 'line it up with the music', 'motion.beat'], ['mo', 'put everything on the beat', 'motion.beat'],
  ['mo', 'add a song', 'motion.song'], ['mo', 'use my music', 'motion.song'], ['mo', 'make it longer', 'motion.length', { more: true }], ['mo', 'make it shorter', 'motion.length', { more: false }],
  // colour, canvas, words
  ['mo', 'change the accent to teal', 'motion.accent', { color: 'teal' }], ['mo', 'make it pink', 'motion.accent', { color: 'pink' }], ['mo', 'use #38C6B1 as the accent', 'motion.accent', { color: '#38c6b1' }], ['mo', 'brand colour indigo', 'motion.accent', { color: 'indigo' }],
  ['mo', 'make it dark', 'motion.theme', { theme: 'night' }], ['mo', 'dark background please', 'motion.theme', { theme: 'night' }], ['mo', 'light mode', 'motion.theme', { theme: 'warm' }],
  ['mo', 'change the button text to Join now', 'motion.text', { kind: 'button', text: 'Join now' }], ['mo', 'make the headline say Ship it Friday', 'motion.text', { kind: 'word', text: 'Ship it Friday' }], ['mo', 'set the toast to Saved!', 'motion.text', { kind: 'toast' }],
  // states
  ['mo', 'add a toast', 'motion.add', { kind: 'toast' }], ['mo', 'add a toast at the end', 'motion.add', { kind: 'toast' }], ['mo', 'throw in a spinner', 'motion.add', { kind: 'loader' }], ['mo', 'add a bar chart', 'motion.add', { kind: 'bars' }],
  ['mo', 'add a command palette', 'motion.add', { kind: 'cmdk' }], ['mo', 'one more toggle', 'motion.add', { kind: 'toggle' }], ['mo', 'add a phone with screens', 'motion.add', { kind: 'phone' }],
  ['mo', 'remove the chart', 'motion.remove', { kind: 'chart' }], ['mo', 'get rid of the music player', 'motion.remove', { kind: 'player' }], ['mo', 'drop the dynamic island', 'motion.remove', { kind: 'island' }], ['mo', 'delete the slider', 'motion.remove', { kind: 'slider' }],
  // camera, cursor, blur
  ['mo', 'hide the cursor', 'motion.cursor', { on: false }], ['mo', 'show the cursor again', 'motion.cursor', { on: true }], ['mo', 'keep the camera still', 'motion.camera', { on: false }], ['mo', 'zoom in more', 'motion.camera', { more: true }],
  ['mo', 'turn on motion blur', 'motion.blur', { on: true }], ['mo', 'no motion blur', 'motion.blur', { on: false }],
  // export and templates
  ['mo', 'export a gif', 'motion.export', { fmt: 'gif' }], ['mo', 'export it as an mp4', 'motion.export', { fmt: 'mp4' }], ['mo', 'download the video', 'motion.export', { fmt: 'mp4' }], ['mo', 'save it as an html page', 'motion.export', { fmt: 'html' }], ['mo', 'render a png', 'motion.export', { fmt: 'png' }],
  ['mo', 'use the ui reel', 'motion.new', { tpl: 'ui-reel' }], ['mo', 'switch to the logo reveal', 'motion.new', { tpl: 'logo-draw' }], ['mo', 'try lower thirds', 'motion.new', { tpl: 'lower-name' }],
  ['mo', 'play', 'motion.play', { on: true }], ['mo', 'pause', 'motion.play', { on: false }],
  // neighbours that must still mean what they meant
  ['g', 'turn off animations', 'settings.motion'], ['g', 'reduce motion', 'settings.motion'], ['s', 'add a video', 'site.video'], ['s', 'make the background animation slower', 'site.fx'], ['g', 'design a logo for ember socks', 'design.new'],
];
