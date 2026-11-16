// Flint and the tribe's suggestion engine (app/ui/suggest.js, docs/SUGGESTIONS.md): asking for ideas, turning them down,
// muting one kind and asking why. Used by scripts/dev/flint-eval-cases.js as v:'sg'. [ctx, text, intent, slots?]
module.exports = [
  ['g', 'what do you suggest?', 'suggest.list'], ['g', 'what would you suggest', 'suggest.list'], ['g', 'anything you recommend?', 'suggest.list'], ['g', 'any ideas?', 'suggest.list'],
  ['g', 'got any ideas', 'suggest.list'], ['g', 'give me some ideas', 'suggest.list'], ['g', 'show me the suggestions', 'suggest.list'], ['g', 'open suggestions', 'suggest.list'],
  ['g', 'any ideas for the app?', 'suggest.list', { about: 'app' }], ['g', 'ideas for my website', 'suggest.list', { about: 'website' }], ['g', 'any suggestions about the photos', 'suggest.list', { about: 'photos' }],
  ['g', 'what do you suggest for the brand', 'suggest.list', { about: 'brand' }], ['g', 'suggest something', 'suggest.list'], ['g', 'i am out of ideas', 'suggest.list'], ['g', 'what could we improve', 'suggest.list'],
  ['g', 'what would make it better', 'suggest.list'], ['g', 'inspire me', 'suggest.list'], ['g', 'whats your suggestions', 'suggest.list'], ['g', 'any sugestions?', 'suggest.list'],
  ['g', 'suggest less', 'suggest.less'], ['g', 'fewer suggestions please', 'suggest.less'], ['g', 'too many ideas', 'suggest.less'], ['g', 'calm down with the suggestions', 'suggest.less'], ['g', 'tone down the suggestions', 'suggest.less'],
  ['g', 'suggest more often', 'suggest.more'], ['g', 'more suggestions please', 'suggest.more'],
  ['g', 'turn off suggestions', 'suggest.off'], ['g', 'stop suggesting', 'suggest.off'], ['g', 'no more suggestions', 'suggest.off'], ['g', 'suggestions off', 'suggest.off'], ['g', 'i dont want suggestions', 'suggest.off'],
  ['g', 'turn suggestions back on', 'suggest.on', null, true], ['g', 'turn on suggestions', 'suggest.on'], ['g', 'start suggesting again', 'suggest.on'],
  ['g', 'stop suggesting about photos', 'suggest.mute', { about: 'photos' }], ['g', 'no more suggestions about the brand', 'suggest.mute', { about: 'brand' }], ['g', "don't suggest anything about files", 'suggest.mute', { about: 'files' }],
  ['g', 'mute photo suggestions', 'suggest.mute', { about: 'photo' }], ['g', 'stop suggesting things based on my edits', 'suggest.mute', { about: 'edits' }],
  ['g', 'you can suggest about photos again', 'suggest.unmute', { about: 'photos' }], ['g', 'unmute photo suggestions', 'suggest.unmute', { about: 'photo' }],
  ['g', 'why did you suggest that?', 'suggest.why'], ['g', 'why that suggestion', 'suggest.why'], ['g', 'where did that idea come from', 'suggest.why'], ['g', 'why are you suggesting this', 'suggest.why'], ['g', 'explain that suggestion', 'suggest.why'],
].filter(r => !r[4]).map(r => r.slice(0, 4));
