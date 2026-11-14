// held-out batch 7 (feat/flint-local): written BEFORE any of the feat/flint-local upgrades existed (conversation memory,
// the planner, project memory, the tier-1 additions, tier 2), from the intent list and the editors' feature lists only.
// Scored once untuned by scripts/dev/flint-capability.js (the first-run number is in docs/FLINT-CAPABILITY.md), and not
// part of flint_eval.json: it is the capability report's own batch, by skill type.
//   cmd     [ctx, text, intent, slots?]              one command (ctx: g s c cs sh d sl p)
//   follow  [[ctx, text, intent, slots?], ...]       a conversation; every turn after the first is scored
//   dym     [text, [intents that would be right]]    everyday paraphrases: handled directly, or among the three chips
//   help    [question, /source that should answer/]  how-to answers from the Guide and docs
//   search  { corpus: [[id, kind, text]], q: [[query, id]] }   find it without sharing the title's words
//   summary [text, [facts the summary must keep], maxWords]
//   tone    [text, tone, [must contain], [must not contain]]
//   gen     [text, kind]   kind: 'build' a recipe/template result is right · 'plan' a goal with several parts · 'write' open writing
//   dup     [new task title, existing titles, index of the duplicate or -1]
'use strict';
module.exports = {
  cmd: [
    ['g', 'stick buy more glue on the task list', 'task.add'],
    ['g', 'new todo: call the venue about chairs', 'task.add'],
    ['g', 'the poster task is finished', 'task.done'],
    ['g', 'hand the poster task over to sam', 'task.assign'],
    ['g', 'what is still unowned', 'task.unassigned'],
    ['g', 'let everybody know the tickets are live', 'chat.send'],
    ['g', 'message maya that i am running late', 'dm.send'],
    ['g', 'book a rehearsal on saturday at 10am', 'event.add'],
    ['g', 'whats happening this week on the calendar', 'cal.show'],
    ['g', 'start a countdown for 25 minutes', 'timer'],
    ['g', 'go dark', 'theme.dark-mode'],
    ['g', 'make the ui text larger', 'textsize.set'],
    ['g', 'switch everything to french', 'lang.set'],
    ['g', 'i want a site for my yoga studio', 'site.service'],
    ['g', 'build a snake clone', 'site.starter-snake'],
    ['g', 'a spreadsheet to track ticket sales', 'sheet.new'],
    ['g', 'slides for the bake sale pitch', 'deck.new'],
    ['g', 'who is around right now', 'people.online'],
    ['g', 'quiet the notifications for a bit', 'settings.notify'],
    ['g', 'what is 18% of 240', 'calc'],
    ['s', 'use ocean colours on the site', 'site.palette', { mood: 'ocean' }],
    ['s', 'is the text contrast okay', 'site.contrast'],
    ['s', 'suggest a font combo that feels playful', 'site.fontpair'],
    ['s', 'neaten the layout', 'site.tidy'],
    ['s', 'ideas for the main headline', 'site.headlines'],
    ['s', 'add a page called menu', 'site.page.add', { name: 'Menu' }],
    ['s', 'three pricing plans please', 'site.price.plans', { n: 3 }],
    ['c', 'draw me a sign in screen', 'canvas.login'],
    ['c', 'i need a checkout screen', 'canvas.checkout'],
    ['cs', 'line these up on the left', 'canvas.align'],
    ['cs', 'make a night version of this frame', 'canvas.dark'],
    ['d', 'put a contents list at the top', 'doc.toc'],
    ['d', 'turn the bullets into checkboxes', 'doc.checklist'],
    ['d', 'how hard is this to read', 'doc.readability'],
    ['sh', 'add up the price column', 'sheet.sum'],
    ['sh', 'order by date, newest first', 'sheet.sort'],
    ['sh', 'graph revenue per month', 'sheet.chart'],
    ['sl', 'make a 6 slide pitch from the vision', 'deck.pitch'],
  ],
  follow: [
    [['g', 'add a task to design the logo', 'task.add'], ['g', 'assign it to maya', 'task.assign', { who: 'Maya Lee', ref: 'Design the logo' }], ['g', 'and make it urgent', 'task.priority', { ref: 'Design the logo' }], ['g', 'due friday', 'task.due', { ref: 'Design the logo' }]],
    [['g', 'tell maya the build is up', 'dm.send'], ['g', 'tell sam too', 'dm.send', { who: 'Sam Ortiz', msg: 'the build is up' }]],
    [['g', 'add a task to buy flour', 'task.add'], ['g', 'and another one to book the hall', 'task.add', { title: 'Book the hall' }]],
    [['g', 'switch to light theme', 'theme.light'], ['g', 'actually make it midnight', 'theme.midnight']],
    [['c', 'make a login screen', 'canvas.login'], ['c', 'and a pricing one', 'canvas.pricing']],
    [['g', 'add a task to print flyers for sam', 'task.add'], ['g', 'actually give it to maya instead', 'task.assign', { who: 'Maya Lee', ref: 'Print flyers' }]],
    [['g', 'set a timer for 10 minutes', 'timer'], ['g', 'make that 15', 'timer', { minutes: 15 }]],
    [['g', 'change the accent color to teal', 'accent.set'], ['g', 'try orange instead', 'accent.set', { color: 'orange' }]],
    [['g', 'add a task to fix the header', 'task.add'], ['g', 'its due tomorrow', 'task.due', { ref: 'Fix the header' }], ['g', 'and its for sam', 'task.assign', { who: 'Sam Ortiz', ref: 'Fix the header' }]],
    [['g', 'make a sheet for the budget', 'sheet.new'], ['g', 'and a doc too', 'doc.new']],
    [['g', 'add a task to write the press release', 'task.add'], ['g', 'same again for the newsletter', 'task.add', { title: 'Write the newsletter' }]],
    [['g', 'add a task to order balloons', 'task.add'], ['g', 'never mind, delete it', 'task.delete', { ref: 'Order balloons' }]],
    [['g', 'add a task to test the signup form', 'task.add'], ['g', 'start it', 'task.start', { ref: 'Test the signup form' }], ['g', 'ok its done', 'task.done', { ref: 'Test the signup form' }]],
  ],
  dym: [
    ['bin that chore', ['task.delete']], ['whats left for me to do', ['task.list', 'focus']], ['shout to the group that dinner is ready', ['chat.send']],
    ['jump on a quick voice chat', ['huddle.start']], ['get my cousin into this tribe', ['invite']], ['boil the conversation down for me', ['chat.summarize']],
    ['take that back', ['undo']], ['go live with the site', ['publish']], ['bigger letters everywhere', ['textsize.set']],
    ['what did i miss', ['status', 'chat.summarize']], ['a table for our expenses', ['sheet.new']], ['put this computer online as the server', ['host.start']],
    ['top up my credits', ['premium.open']], ['give me the grand tour', ['tour']], ['hunt down the banner image', ['find']],
  ],
  help: [
    ['how do i get a friend into my tribe', /invite|projects-and-invites|start-here/i], ['how do i connect claude code', /connect-claude|ANY-LLM/i],
    ['can i use tribecode on my phone', /phone|mobile/i], ['how do i host on my own computer', /hosting/i],
    ['what happens to my work if the host goes offline', /hosting|troubleshoot|cloud|data|working-together/i], ['how do i go back to an older version', /versions|repos/i],
    ['how do i make a website for my project', /website|site-templates/i], ['what does flint do without ai', /flint-tiers/i],
    ['how do i find someone to help with art', /work-and-hiring|company/i], ['where is the marketplace', /marketplace/i],
  ],
  search: {
    corpus: [
      ['d1', 'Doc', 'Pricing notes: three plans, the middle one at twelve dollars a month, discounts for students'],
      ['d2', 'Doc', 'Launch checklist: press kit, store page, trailer, announcement post'],
      ['d3', 'Doc', 'Meeting notes 4 March: decided to drop multiplayer for the first release'],
      ['t1', 'Task', 'Fix the jump bug on the second level'], ['t2', 'Task', 'Record the trailer voiceover'], ['t3', 'Task', 'Order stickers and shirts for the booth'],
      ['c1', 'Chat', 'the boss fight is way too hard, nobody beat it in the playtest'], ['c2', 'Chat', 'can we make the subscription cheaper for schools'],
      ['c3', 'Chat', 'the server went down again last night around two'], ['f1', 'File', 'assets/sprites/hero-run.png'], ['f2', 'File', 'docs/BUDGET-2026.md: income, costs, runway'],
      ['v1', 'Version', 'Shipped the new title screen and the save system'],
    ],
    q: [['where did we talk about how much it costs', 'd1'], ['what did we cut from v1', 'd3'], ['merch for the stand', 't3'], ['difficulty complaints', 'c1'], ['the outage', 'c3'],
      ['money plan', 'f2'], ['narration for the video', 't2'], ['cheaper for education', 'c2'], ['when did saving games land', 'v1'], ['things to do before release', 'd2']],
  },
  summary: [
    ['We met on Tuesday to plan the bake sale. The sale is on Saturday 14 June at the school gym. Maya will bake forty cupcakes and Sam brings the lemonade. We still need a card reader, and somebody has to print the price signs. The weather was lovely on the walk over. All the money goes to the library fund.', ['14 June', 'card reader', 'library'], 45],
    ['The playtest had twelve players. Nine of them quit at the second boss, which is far too hard. Everyone liked the art and the music. Two people found a bug where the save file is lost after a crash. We decided to make the boss easier and to fix the save bug before the demo on Friday. Lunch was pizza.', ['second boss', 'save', 'Friday'], 45],
    ['Our newsletter has 1,200 readers and grows about five percent a month. Most readers come from the podcast. The open rate dropped from 52 to 41 percent after we moved to sending on Mondays. We will move back to Thursdays and test shorter subject lines. The new logo is nearly done.', ['41 percent', 'Thursdays', 'podcast'], 40],
  ],
  tone: [
    ['Hey folks, we are gonna ship the new stuff soon!', 'professional', ['going to'], ['gonna', 'Hey', '!']],
    ['We utilize premium ingredients. Please contact us to purchase.', 'friendly', ['use', 'buy'], ['utilize', 'purchase']],
    ['We think this might help you save time.', 'confident', ['save time'], ['We think', 'might']],
    ['Our cupcakes are very good.', 'playful', ['super'], ['very']],
    ['Unfortunately we cannot offer refunds at this time, sorry for the trouble.', 'professional', ['refunds'], ['sorry for the trouble']],
    ['Our app is kinda awesome and you guys will love it', 'professional', ['excellent'], ['kinda', 'you guys']],
    ['Buy now.', 'friendly', [], ['Buy now.']],
    ['We would like to inform you that your order has been dispatched.', 'friendly', ['order'], ['We would like to inform you']],
  ],
  gen: [
    ['make a landing page for our bake sale', 'build'], ['a to-do app for the chores', 'build'], ['a 5 slide pitch from the vision doc', 'build'], ['a budget sheet for the trip', 'build'],
    ['launch page for our bake sale by friday', 'plan'], ['get us ready for the demo next week', 'plan'], ['plan the launch of our game', 'plan'], ['set up everything for a new podcast', 'plan'],
    ['organise a team offsite in june', 'plan'], ['kick off the redesign of our website', 'plan'],
    ['write a poem about our tribe', 'write'], ['draft a welcome email for new members', 'write'], ['explain this error: TypeError x is undefined', 'write'], ['come up with a name for our cafe app', 'write'],
  ],
  dup: [
    ['Buy milk and eggs', ['Order stickers', 'Get milk and eggs from the shop', 'Fix the header'], 1], ['Fix header bug', ['Fix the bug in the header', 'Write the press release'], 0],
    ['Record the trailer', ['Order balloons', 'Book the hall'], -1], ['Email the venue about chairs', ['Call the venue about tables', 'Send the venue an email about the chairs'], 1],
    ['Design the logo', ['Design the poster', 'Test the signup form'], -1], ['Write newsletter', ['Write the newsletter for March', 'Print flyers'], 0],
  ],
};
