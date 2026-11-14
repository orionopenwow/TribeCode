// Flint, the website editor's element tools (feat/site-editor2): the selected words, button, picture or entry of a list,
// screen sizes, every button at once, an opening time, and what the tribe said. Used by scripts/dev/flint-eval-cases.js as v:'e2'.
// ctx 'se' = the website designer with words selected that sit in a list (app/test/flint_eval_test.js); 's' = nothing selected.
// [ctx, text, intent, slots?]
module.exports = [
  // the selected thing
  ['se', 'make this bold', 'site.el.weight', { b: true }], ['se', 'bold this', 'site.el.weight', { b: true }], ['se', 'make it not bold', 'site.el.weight', { b: false }], ['se', 'make this italic', 'site.el.weight', { i: true }],
  ['se', 'change this to Opens Saturday at 9am', 'site.el.text', { text: 'Opens Saturday at 9am' }], ['se', 'make it say Fresh bread daily', 'site.el.text', { text: 'Fresh bread daily' }], ['se', 'change it to Back soon', 'site.el.text', { text: 'Back soon' }], ['se', 'rename this to Shop', 'site.el.text', { text: 'Shop' }],
  ['se', 'make this the main colour', 'site.el.color', { col: 'accent' }], ['se', 'make it quieter', 'site.el.color', { col: 'muted' }], ['se', 'turn this grey', 'site.el.color', { col: 'muted' }],
  ['se', 'center this', 'site.el.align', { align: 'center' }], ['se', 'align this to the right', 'site.el.align', { align: 'right' }], ['se', 'put it on the left', 'site.el.align', { align: 'left' }],
  ['se', 'move this up', 'site.el.item', { op: 'up' }], ['se', 'move it down', 'site.el.item', { op: 'down' }], ['se', 'bump this to the top', 'site.el.item', { op: 'up' }], ['se', 'duplicate this', 'site.el.item', { op: 'dup' }], ['se', 'copy it', 'site.el.item', { op: 'dup' }],
  ['se', 'add another', 'site.el.item', { op: 'add' }], ['se', 'add one more', 'site.el.item', { op: 'add' }], ['se', 'remove this', 'site.el.item', { op: 'del' }], ['se', 'delete it', 'site.el.item', { op: 'del' }], ['se', 'get rid of this', 'site.el.item', { op: 'del' }],
  // screen sizes
  ['se', 'hide this on phones', 'site.el.show', { dev: 'phone', mode: 'hide' }], ['se', 'hide it on mobile', 'site.el.show', { dev: 'phone', mode: 'hide' }], ['se', 'show this on phones again', 'site.el.show', { dev: 'phone', mode: 'show' }], ['se', 'only show this on computers', 'site.el.show', { dev: 'desktop', mode: 'only' }],
  ['s', 'hide the gallery on phones', 'site.el.show', { dev: 'phone', mode: 'hide', block: 'gallery' }], ['s', 'hide the pricing section on tablets', 'site.el.show', { dev: 'tablet', mode: 'hide', block: 'pricing' }], ['s', 'only show the faq on desktop', 'site.el.show', { dev: 'desktop', mode: 'only', block: 'faq' }],
  ['s', 'show me the phone size', 'site.device', { dev: 'phone' }],
  // every button, width, entrance
  ['s', 'make all buttons rounder', 'site.buttons', { style: 'pill' }], ['s', 'make every button outlined', 'site.buttons', { style: 'outline' }], ['s', 'make the buttons solid', 'site.buttons', { style: 'solid' }], ['s', 'make all the buttons pill shaped', 'site.buttons', { style: 'pill' }],
  ['s', 'make the pricing section narrower', 'site.width', { w: 'narrow', block: 'pricing' }], ['s', 'make this section wider', 'site.width', { w: 'wide' }], ['s', 'fade this section in', 'site.entrance', { anim: 'fade' }], ['s', 'make the gallery rise in as you scroll', 'site.entrance', { anim: 'rise', block: 'gallery' }], ['s', 'no animation on this section', 'site.entrance', { anim: '' }],
  // an opening time
  ['s', 'change the opening time to Saturday 9am', 'site.time', { when: 'Saturday 9am' }], ['s', 'we open at 9 on saturday now', 'site.time'], ['s', 'set the opening hours to 10am', 'site.time', { when: '10am' }], ['s', 'update the opening day to Sunday 11am', 'site.time'],
  // what the tribe said
  ['s', 'what should we update on the site?', 'site.suggest', { do: 'list' }], ['s', 'any suggestions for the site', 'site.suggest', { do: 'list' }], ['s', 'what did the tribe say about this', 'site.suggest', { do: 'list' }], ['s', 'is the website up to date', 'site.suggest', { do: 'list' }],
  ['s', 'apply what we decided in chat', 'site.suggest', { do: 'apply' }], ['s', 'apply the suggestions', 'site.suggest', { do: 'apply' }], ['s', 'update the site from the chat', 'site.suggest', { do: 'apply' }], ['s', 'do what the team agreed', 'site.suggest', { do: 'apply' }],
  // unchanged neighbours: these must still mean what they meant
  ['s', 'undo that', 'undo'], ['s', 'add a pricing section', 'site.block.add', { block: 'pricing' }], ['s', 'hide this section', 'site.block.hide'], ['s', 'rounder corners', 'site.radius', { size: 'more' }], ['p', 'show it on a phone', 'preview.device', { dev: 'phone' }],
];
