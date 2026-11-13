// Flint held-out batch 5: written after tuning batch 4, never tuned against (the honest measure for fresh phrasings).
// [ctx, text, intent (list = several steps, null = needs a model), slots?]
module.exports = [
  ['g', 'accept the poster task', 'task.accept'], ['g', 'i will pass on the trailer task, sorry', 'task.decline'], ['g', 'say no to the menu bug', 'task.decline'], ['g', 'claim an unassigned task', 'task.claim'],
  ['g', 'maya can take the logo', 'task.assign'], ['g', 'which tasks have no owner', 'task.unassigned'],
  ['g', 'make a flyer for the open mic', 'design.new', { kind: 'poster' }], ['g', 'i want a logo for my band', 'design.new', { kind: 'logo' }], ['g', 'design a banner for the stream', 'design.new', { kind: 'poster' }],
  ['g', 'mock up an app screen for a gym', 'design.new', { kind: 'screen' }], ['g', 'start a new whiteboard', 'nav.whiteboard'], ['g', 'make a mood board', 'design.new', { kind: 'whiteboard' }],
  ['g', 'is maya online', 'people.where'], ['g', 'where did sam go', 'people.where'], ['g', 'anyone around who knows godot', 'people.find'], ['g', 'chat with sam', 'dm.open'],
  ['g', 'update my skills', 'abilities.edit'], ['g', 'put animation on my skills', 'abilities.edit'], ['g', 'offer my editing as a service', 'gig.self'],
  ['g', 'show the company report', 'nav.company'], ['g', 'browse gigs', 'nav.company'], ['g', 'what did we spend this month', 'nav.money'],
  ['g', 'list my installed widgets', 'market.installed'], ['g', 'uninstall the confetti pack', 'market.remove'], ['g', 'find a charting library', 'market.search'],
  ['g', 'open my photos', 'nav.files', { cat: 'pics' }], ['g', 'show my spreadsheets', 'nav.files', { cat: 'sheets' }], ['g', 'where are my recordings', 'nav.files', { cat: 'media' }],
  ['g', 'run the demo', 'demo.start'], ['g', 'watch the demo tribe', 'demo.start'], ['g', 'compare plans', 'premium.open'], ['g', 'my credits', 'premium.open'],
  ['g', 'appear offline', 'presence.off'], ['g', 'show where i am again', 'presence.on'], ['g', 'put the sidebar back to normal', 'sidebar.reset'], ['g', 'mute notifications', 'nav.settings'],
  ['g', 'teach me the marketplace', 'lesson'], ['g', 'how does the people panel work', 'lesson'], ['g', 'what is 8 times 7', 'calc'],
  ['s', 'put a faq at the end', 'site.block.add', { block: 'faq' }], ['s', 'move the team section to the top', 'site.block.move', { block: 'team' }], ['s', 'rename the home page to welcome', 'site.page.rename'],
  ['s', 'add my social links', 'site.block.add', { block: 'links' }], ['c', 'a checkout page for the shop', 'canvas.checkout'],
  ['g', 'remind everyone to vote on friday', 'event.add'], ['g', 'new doc about the jam rules', 'doc.new'],
  ['g', 'write a song about our cat', null], ['g', 'why does the build keep failing', null],
];
