// Flint held-out batch 4 (v0.31 features): written before any tuning, used by scripts/dev/flint-eval-cases.js as v:'held4'.
// Four labels were aligned after the first run with conventions the tuned sets already use: "i will do X" = task.start (it
// accepts a pending offer), "how do i invite" = invite, "tell everyone" = dm.send to everyone, "add a task … give it to sam" = one task.add.
// [ctx, text, intent (list = several steps, null = needs a model), slots?]
module.exports = [
  // tasks: accept / decline / claim / misc
  ['g', 'accept the logo task', 'task.accept'], ['g', 'ok i will do the menu bug', 'task.start'], ['g', 'yes i take the trailer task', 'task.accept'], ['g', 'decline the trailer task', 'task.decline'],
  ['g', 'i cant do the logo task this week', 'task.decline'], ['g', 'turn down the menu bug, too busy', 'task.decline'], ['g', 'claim the jump bug', 'task.claim'], ['g', 'grab an open task', 'task.claim'],
  ['g', 'give me something to work on', 'task.claim'], ['g', 'what is on my plate', 'task.list'], ['g', 'show the tasks nobody has', 'task.unassigned'], ['g', 'sam should do the trailer', 'task.assign'],
  ['g', 'push the logo task to friday', 'task.due'], ['g', 'the menu bug is finished', 'task.done'], ['g', 'new task fix the save button', 'task.add'], ['g', 'remind the team to playtest on saturday', 'event.add'],
  // design flow kinds
  ['g', 'make a poster for our gig', 'design.new', { kind: 'poster' }], ['g', 'design a logo for ember socks', 'design.new', { kind: 'logo' }], ['g', 'i need a flyer for the bake sale', 'design.new', { kind: 'poster' }],
  ['g', 'start a new design for an app screen', 'design.new', { kind: 'screen' }], ['g', 'make slides for friday', 'deck.new'], ['g', 'new whiteboard', 'nav.whiteboard'], ['g', 'design a mobile app', 'design.new', { kind: 'app' }],
  ['g', 'start designing a game', 'design.new', { kind: 'game' }], ['g', 'make an instagram post graphic', 'design.new', { kind: 'poster' }], ['g', 'open the design flow', 'nav.design'], ['g', 'take me to design', 'nav.design'],
  ['g', 'make a breakout game for my brother', 'site.starter-breakout'], ['g', 'build a little snake game', 'site.starter-snake'], ['g', 'i want a pomodoro app', 'site.starter-pomodoro'], ['g', 'quick budget dashboard please', 'site.starter-dashboard'],
  // website designer v2 (inside the designer)
  ['s', 'add a pricing table', 'site.block.add', { block: 'pricing' }], ['s', 'put some customer quotes on the page', 'site.block.add', { block: 'testimonials' }], ['s', 'i want a photo grid', 'site.block.add', { block: 'gallery' }],
  ['s', 'drop the team part', 'site.block.remove', { block: 'team' }], ['s', 'move the faq above the footer', 'site.block.move', { block: 'faq' }], ['s', 'make it dark', 'site.dark'], ['s', 'use a calmer theme', 'site.theme'],
  ['s', 'change the font to something more playful', 'site.font'], ['s', 'make the main color green', 'site.color', { color: 'green' }], ['s', 'page title for google should be Ember Socks', 'site.seo', { field: 'title' }],
  ['s', 'add a contact page', 'site.page.add'], ['s', 'rename the about page to story', 'site.page.rename'], ['s', 'delete the contact page', 'site.page.delete'], ['s', 'swap the hero picture', 'site.image.replace'],
  ['s', 'make the picture a circle', 'site.image.shape', { shape: 'round' }], ['s', 'show me how it looks on my phone', 'site.device', { dev: 'phone' }], ['s', 'export the whole site as a zip', 'site.export'],
  ['s', 'publish this', 'site.publish'], ['s', 'make the headline shorter', 'site.copy', { field: 'headline' }], ['s', 'the button should go to the shop page', 'site.wire'], ['s', 'fill it in from my project', 'site.autofill'],
  ['s', 'turn the comments into tasks', 'site.comments.tasks'], ['s', 'tighten the spacing', 'site.spacing'], ['s', 'add our socials', 'site.block.add'], ['s', 'put a newsletter signup at the bottom', 'site.block.add', { block: 'newsletter' }],
  ['g', 'link in bio for my pottery', 'site.linkbio'], ['g', 'a site for my food truck', 'site.cafe'], ['g', 'website for my dog grooming business', 'site.service'], ['g', 'make my resume into a website', 'site.resume'],
  ['g', 'i sell stickers online, make me a shop', 'site.merch'], ['g', 'open the website designer', 'site.open'],
  // people / presence
  ['g', 'where is maya right now', 'people.where'], ['g', 'who is online', 'people.online'], ['g', 'whos working on what', 'people.working'], ['g', 'is sam around', 'people.where'],
  ['g', 'what is maya up to', 'people.where'], ['g', 'find someone who knows blender', 'people.find'], ['g', 'anyone here good at music', 'people.find'], ['g', 'who can draw pixel art', 'people.find'],
  ['g', 'message maya', 'dm.open'], ['g', 'dm sam saying the build is up', 'dm.send'], ['g', 'tell everyone lunch is here', 'chat.send'], ['g', 'show people', 'people.online'],
  // company / gigs / abilities
  ['g', 'open the company dashboard', 'nav.company'], ['g', 'turn this project into a company', 'nav.company'], ['g', 'show me the money', 'nav.money'], ['g', 'how much did we make this month', 'nav.money'],
  ['g', 'offer my logo design as a gig', 'gig.self'], ['g', 'i can make music for people', 'gig.self'], ['g', 'add drawing to my skills', 'abilities.edit'], ['g', 'edit my abilities', 'abilities.edit'],
  ['g', 'list what i am good at', 'abilities.edit'], ['g', 'find gigs', 'nav.company'],
  // marketplace
  ['g', 'open the marketplace', 'nav.market'], ['g', 'find a physics library', 'market.search'], ['g', 'search the marketplace for icons', 'market.search'], ['g', 'what have i installed', 'market.installed'],
  ['g', 'show my installed stuff', 'market.installed'], ['g', 'remove the confetti widget', 'market.remove'], ['g', 'uninstall the timer widget', 'market.remove'], ['g', 'whats trending on github', 'trending'],
  ['g', 'add a 3d model of a tree', 'asset.add'], ['g', 'get some free sound effects', 'asset.add'],
  // files
  ['g', 'open my files', 'nav.files'], ['g', 'show my pictures', 'nav.files', { cat: 'pics' }], ['g', 'where are my docs', 'nav.files', { cat: 'docs' }], ['g', 'show all the videos', 'nav.files', { cat: 'media' }],
  ['g', 'new doc about the launch', 'doc.new'], ['g', 'make a spreadsheet for the budget', 'sheet.new'], ['g', 'start a note', 'note.blank'], ['g', 'open the readme', 'doc.open'],
  // demo / tour / lessons
  ['g', 'show me around', 'tour'], ['g', 'start the demo', 'demo.start'], ['g', 'play the demo', 'demo.start'], ['g', 'give me a tour', 'tour'],
  ['g', 'teach me the design canvas', 'lesson'], ['g', 'how do i use the website builder', 'lesson'], ['g', 'how do i invite friends', 'invite'], ['g', 'what can you do for free', 'tiers'],
  // plans / credits / ai
  ['g', 'how many credits do i have', 'premium.open'], ['g', 'see the plans', 'premium.open'], ['g', 'connect claude code', 'connect.ai'], ['g', 'use my own ai', 'connect.ai'],
  ['g', 'turn on the built in brain', 'brain.pick'],
  // settings
  ['g', 'switch to light mode', 'theme.light'], ['g', 'dark mode please', 'theme.dark-mode'], ['g', 'make the text bigger', 'textsize.set'], ['g', 'change language to spanish', 'lang.set'],
  ['g', 'set my accent to teal', 'accent.set'], ['g', 'change my profile picture', 'personalize.open'], ['g', 'open settings', 'nav.settings'], ['g', 'stop showing where i am', 'presence.off'],
  ['g', 'hide my location from others', 'presence.off'], ['g', 'show keyboard shortcuts', 'nav.shortcuts'], ['g', 'reset the sidebar order', 'sidebar.reset'], ['g', 'turn off notifications', 'nav.settings'],
  // nav / misc
  ['g', 'go home', 'nav.home'], ['g', 'open the task board', 'nav.tasks'], ['g', 'open chat', 'nav.chat'], ['g', 'open the calendar', 'nav.calendar'], ['g', 'show the agents', 'nav.agents'],
  ['g', 'open the preview', 'nav.preview'], ['g', 'publish the game', 'publish'], ['g', 'invite a friend', 'invite'], ['g', 'start a huddle', 'huddle.start'], ['g', 'jam mode', 'jam.start'],
  ['g', 'undo that', 'undo'], ['g', 'redo', 'redo'], ['g', 'what time is it', 'time.now'], ['g', 'what is 12 times 9', 'calc'], ['g', 'flip a coin', 'random'],
  // canvas
  ['c', 'make a sign up screen', 'canvas.login'], ['c', 'a pricing page for my app', 'canvas.pricing'], ['c', 'make a profile screen', 'canvas.profile'], ['c', 'checkout page', 'canvas.checkout'],
  ['cs', 'make this dark', 'canvas.dark'], ['cs', 'clean this up', 'canvas.tidy'], ['cs', 'name the layers properly', 'canvas.rename'], ['cs', 'give me a few versions of this button', 'canvas.variants'],
  ['c', 'send this to the app', 'canvas.send'], ['c', 'export as png', 'canvas.export'],
  // preview
  ['p', 'show it on a phone', 'preview.device', { dev: 'phone' }], ['p', 'refresh', 'preview.reload'], ['p', 'let me click to edit', 'preview.edit'], ['p', 'leave a comment here', 'comment.mode'],
  // several steps
  ['g', 'make a poster for the gig then tell everyone', ['design.new', 'dm.send']], ['g', 'add a task to buy cables and give it to sam', 'task.add'],
  ['g', 'new doc called launch plan, then open the calendar', ['doc.new', 'nav.calendar']],
  // needs a model: Flint should not claim these
  ['g', 'write me a short story about a dragon', null], ['g', 'why is my game lagging', null], ['g', 'what do you think of our logo', null], ['g', 'refactor the physics code', null],
];
