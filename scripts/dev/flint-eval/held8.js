// held-out batch 8 (feat/flint-local): written AFTER the upgrades were built, scored once and never tuned against.
// It is the fairer "after" number: batch 7's misses were in view while the upgrades were written, these were not.
// (Still written by the same hand that wrote the code, knowing how the code works.) Same shapes as held7.js.
'use strict';
module.exports = {
  cmd: [
    ['g', 'jot a todo to renew the domain', 'task.add'], ['g', 'can you put water the plants on my list', 'task.add'], ['g', 'the banner task can go to review', 'task.review'],
    ['g', 'who has nothing to do', 'people.working'], ['g', 'ping sam that the poster is printed', 'dm.send'], ['g', 'let the team know standup moved to 10', 'chat.send'],
    ['g', 'pencil in a retro for thursday at 4pm', 'event.add'], ['g', 'do i have anything on tomorrow', 'cal.show'], ['g', 'wake me in 45 minutes', 'timer'],
    ['g', 'make everything spanish', 'lang.set'], ['g', 'lights off please', 'theme.dark-mode'], ['g', 'a notes app would be nice', 'site.starter-notes'],
    ['g', 'i run a dog grooming shop and need a website', 'site.service'], ['g', 'new deck about our roadmap', 'deck.new'], ['g', 'how many days until december 24', 'date.calc'],
    ['s', 'pick colours that feel like autumn', 'site.palette', { mood: 'autumn' }], ['s', 'does this pass contrast rules', 'site.contrast'], ['s', 'the page feels cluttered, fix the spacing', 'site.tidy'],
    ['s', 'add a contact page', 'site.page.add', { name: 'Contact' }], ['s', 'what could the call to action be', 'site.cta'],
    ['c', 'sketch a settings screen', 'canvas.settings'], ['cs', 'space these out evenly', 'canvas.distribute'],
    ['d', 'give me a short summary at the top', 'doc.tldr'], ['d', 'fix the capital letters', 'doc.caps'],
    ['sh', 'whats the average of the score column', 'sheet.avg'], ['sh', 'show the totals at the bottom', 'sheet.total'],
  ],
  follow: [
    [['g', 'add a task to email the printer', 'task.add'], ['g', 'give it to sam', 'task.assign', { who: 'Sam Ortiz', ref: 'Email the printer' }], ['g', 'due next monday', 'task.due', { ref: 'Email the printer' }]],
    [['g', 'tell sam the tickets sold out', 'dm.send'], ['g', 'let maya know too', 'dm.send', { who: 'Maya Lee', msg: 'the tickets sold out' }]],
    [['g', 'add a task to clean the kitchen', 'task.add'], ['g', 'one more to take out the bins', 'task.add', { title: 'Take out the bins' }]],
    [['g', 'switch to nordic theme', 'theme.nordic'], ['g', 'no, light', 'theme.light']],
    [['c', 'make a profile screen', 'canvas.profile'], ['c', 'also a checkout one', 'canvas.checkout']],
    [['g', 'set a timer for 5 minutes', 'timer'], ['g', 'actually 8', 'timer', { minutes: 8 }]],
    [['g', 'add a task to draft the invite', 'task.add'], ['g', 'scrap that', 'task.delete', { ref: 'Draft the invite' }]],
    [['g', 'make a doc for the menu', 'doc.new'], ['g', 'and a sheet as well', 'sheet.new']],
    [['g', 'change the accent color to pink', 'accent.set'], ['g', 'make it blue', 'accent.set', { color: 'blue' }]],
  ],
  dym: [
    ['clear that chore off the board', ['task.delete', 'task.done']], ['who is doing what', ['people.working', 'status', 'task.list']], ['broadcast that the cake is here', ['chat.send']],
    ['lets hop into a voice room', ['huddle.start']], ['add my brother to the tribe', ['invite']], ['shorten the chat for me', ['chat.summarize']],
    ['oops, reverse that', ['undo']], ['make the site public', ['publish']], ['the words are too tiny', ['textsize.set']], ['a grid for our scores', ['sheet.new']],
  ],
  help: [
    ['how do i add someone to my project', /invite|projects-and-invites|start-here/i], ['how does my ai agent join', /connect-claude|agents|ANY-LLM/i], ['does it work on android', /phone|mobile/i],
    ['how do i keep the server running at home', /hosting/i], ['how do i undo a bad push', /versions|repos|troubleshoot/i], ['can flint build things for free', /flint-tiers/i],
    ['how do i sell my skills to other tribes', /work-and-hiring/i], ['what is company mode', /company/i],
  ],
  search: {
    corpus: [
      ['d1', 'Doc', 'Venue shortlist: the scout hall, the library room, the cafe upstairs'], ['d2', 'Doc', 'Sponsor list: the bakery gave fifty dollars, the bike shop gave prizes'],
      ['d3', 'Doc', 'Retro notes: builds were slow, reviews piled up, we agreed to pair on Fridays'], ['t1', 'Task', 'Repair the broken link on the about page'], ['t2', 'Task', 'Compose the thank-you letters'],
      ['t3', 'Task', 'Pick up the trophies from the engraver'], ['c1', 'Chat', 'the wifi at the hall keeps dropping'], ['c2', 'Chat', 'can someone drive the speakers over on saturday'],
      ['c3', 'Chat', 'the login page logs me out every few minutes'], ['f1', 'File', 'assets/audio/theme-song.mp3'], ['v1', 'Version', 'Added the leaderboard and fixed the score rounding'],
    ],
    q: [['where could we hold it', 'd1'], ['who gave us money', 'd2'], ['what did we agree after the sprint', 'd3'], ['dead url', 't1'], ['notes of gratitude', 't2'], ['internet problems', 'c1'],
      ['transport for the sound gear', 'c2'], ['session keeps expiring', 'c3'], ['the music file', 'f1'], ['when did rankings ship', 'v1']],
  },
  summary: [
    ['The choir concert is on Sunday 7 December at St Mark’s. Doors open at six. We sold 140 of 200 tickets so far. The soloist has a cold, so Ana will cover the second piece. Parking is free behind the church. I had a nice sandwich earlier.', ['7 December', '140', 'Ana'], 40],
    ['Sprint review: the checkout flow shipped on Tuesday. Page speed went from 4.1 to 2.3 seconds. Three bugs are still open in search. We agreed to freeze new features until the search bugs are fixed. The office plant is thriving.', ['2.3 seconds', 'search', 'freeze'], 40],
    ['The garden club has 38 members. Dues are twelve dollars a year and half the members have not paid. We need a new treasurer by March because Lin is moving away. The seed swap is on 22 February in the community hall.', ['treasurer', '22 February', 'twelve dollars'], 40],
  ],
  tone: [
    ['hey, thanks a bunch for the awesome help!', 'professional', ['excellent'], ['hey', '!']], ['We do not utilize cookies.', 'friendly', ["don't", 'use'], ['utilize']],
    ['Maybe we could try to improve your sales.', 'confident', ['improve'], ['Maybe', 'try to']], ['This is a good plan.', 'playful', ['great'], []],
    ['Please be advised that the office will be closed on Monday.', 'friendly', ['closed'], ['Please be advised']], ['yo the update is live, go check it out', 'professional', ['update'], ['yo']],
  ],
  gen: [
    ['a portfolio site for my photos', 'build'], ['build us a pomodoro timer', 'build'], ['a tracker sheet for volunteer hours', 'build'],
    ['get everything ready for our album release by the 12th', 'plan'], ['organise a charity fun run in may', 'plan'], ['plan a hackathon for next month', 'plan'], ['help us launch the newsletter', 'plan'],
    ['prepare for the school science fair', 'plan'], ['a poster for the gig by saturday', 'plan'],
    ['write a haiku about deadlines', 'write'], ['draft a polite reminder about unpaid dues', 'write'], ['explain what a merge conflict is', 'write'],
  ],
  dup: [
    ['Pick up trophies', ['Collect the trophies from the engraver', 'Book the hall'], 0], ['Send thank you letters', ['Compose the thank-you letters', 'Order the cake'], 0], ['Book the DJ', ['Book the hall', 'Email the DJ a contract'], -1],
    ['Fix login logout bug', ['Fix the bug where login logs people out', 'Fix the about page link'], 0], ['Water the plants', ['Buy plants', 'Paint the fence'], -1],
  ],
};
