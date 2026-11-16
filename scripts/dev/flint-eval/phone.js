// Flint and Put it on your phone (app/ui/homescreen.js): the guided path to an icon on the home screen, and the no-AI
// answers about iPhones, Android, costs, Macs, in-app browsers, offline and the stores. Used by
// scripts/dev/flint-eval-cases.js as v:'hs'. [ctx, text, intent, slots?]
module.exports = [
  ['g', 'how do i put my app on my phone', 'phone.path'], ['g', 'how can i get my game on my android phone', 'phone.path'], ['g', 'how do i put my website on my iphone', 'phone.path'],
  ['g', 'help me put my app on my phone', 'phone.path'], ['g', 'i want to put my app on my iphone', 'phone.path'], ['g', 'can i put this on my phone', 'phone.path'],
  ['g', 'install my app on my iphone', 'phone.path'], ['g', 'put my game on my phone', 'phone.path'], ['g', 'get my app on my android', 'phone.path'],
  ['g', 'add it to my home screen', 'phone.path', { stage: 'add' }], ['g', 'add my app to my home screen', 'phone.path', { stage: 'add' }], ['g', 'add to home screen', 'phone.path', { stage: 'add' }],
  ['g', 'how do i add an icon to my home screen', 'phone.path', { stage: 'add' }], ['g', 'pin my app to the home screen', 'phone.path', { stage: 'add' }],
  ['g', 'make my app installable', 'phone.path', { stage: 'ready' }], ['g', 'make it installable', 'phone.path', { stage: 'ready' }], ['g', 'is my app installable', 'phone.path', { stage: 'ready' }],
  ['g', 'why isnt my app installable', 'phone.path', { stage: 'ready' }], ['g', 'make my site installable on phones', 'phone.path', { stage: 'ready' }],
  ['g', 'open the put it on my phone guide', 'phone.path'], ['g', 'phone install guide', 'phone.path'], ['g', 'how do i turn my site into an app on my phone', 'phone.path'],
  ['g', 'how to get my app on my home screen', 'phone.path'],
  ['g', 'why cant i install it on my iphone', 'phone.ask', { topic: 'iphone' }], ["g", "why can't i install my app on iphone", 'phone.ask', { topic: 'iphone' }],
  ['g', 'there is no install button on my iphone', 'phone.ask', { topic: 'iphone' }], ['g', 'no add to home screen option on my iphone', 'phone.ask', { topic: 'iphone' }],
  ['g', 'iphone wont let me install it', 'phone.ask', { topic: 'iphone' }],
  ['g', 'how do i install it on android', 'phone.ask', { topic: 'android' }], ['g', 'install my app on an android phone', 'phone.ask', { topic: 'android' }], ['g', 'why wont chrome let me install it', 'phone.ask', { topic: 'android' }],
  ['g', 'is it free to put my app on my phone', 'phone.ask', { topic: 'free' }], ['g', 'does it cost money to put my app on my phone', 'phone.ask', { topic: 'free' }],
  ['g', 'is putting my app on my phone free', 'phone.ask', { topic: 'free' }], ['g', 'how much does the app store cost', 'phone.ask', { topic: 'free' }],
  ['g', 'how much does google play cost', 'phone.ask', { topic: 'free' }], ['g', 'is it free to add my app to my home screen', 'phone.ask', { topic: 'free' }],
  ['g', 'do i need a mac', 'phone.ask', { topic: 'mac' }], ['g', 'do i need a mac to make an iphone app', 'phone.ask', { topic: 'mac' }], ['g', 'can i make an iphone app without a mac', 'phone.ask', { topic: 'mac' }],
  ['g', 'do i need a mac to publish on the app store', 'phone.ask', { topic: 'mac' }],
  ['g', 'why cant i install it from instagram', 'phone.ask', { topic: 'inapp' }], ['g', 'it wont install from tiktok', 'phone.ask', { topic: 'inapp' }],
  ['g', 'add to home screen is missing in messenger', 'phone.ask', { topic: 'inapp' }], ['g', 'why cant i add it from facebook', 'phone.ask', { topic: 'inapp' }],
  ['g', 'will my app work offline', 'phone.ask', { topic: 'offline' }], ['g', 'does it work without internet on my phone', 'phone.ask', { topic: 'offline' }],
  ['g', 'do i need the app store', 'phone.ask', { topic: 'store' }], ['g', 'should i put my app in the app store', 'phone.ask', { topic: 'store' }],
];
