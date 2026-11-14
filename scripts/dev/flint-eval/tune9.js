// The tuning set for the built-in word table (feat/flint-meaning). Blends and thresholds in flintmeaning.js,
// flintsem.js and flintnlu.js's meaning fallback were tuned on this file and on batches 7 and 8, never on held9.js.
// Same shapes as held9.js; different wording and a different made-up tribe.
'use strict';
module.exports = {
  para: [
    ['pop buy stamps onto the list', ['task.add']], ['i finished the brochure', ['task.done']], ['i am starting on the costume', ['task.start', 'task.claim']],
    ['let raj handle the tickets', ['task.assign']], ['erase the leftover job', ['task.delete']], ['the report must be handed in by monday', ['task.due']],
    ['what do i still have to do', ['task.list', 'focus', 'status']], ['jobs with nobody on them', ['task.unassigned']], ['mark the banner as top priority', ['task.priority']],
    ['undo the done on that one', ['task.reopen', 'undo']], ['memo: the key is under the mat', ['note.add']], ['tell the whole group dinner is ready', ['chat.send']],
    ['send maya a private note that i am outside', ['dm.send']], ['summarise the chatter', ['chat.summarize', 'secretary.summary']], ['pin this', ['chat.pin']],
    ['who is online', ['people.online']], ['what is sam up to', ['people.working', 'people.where', 'people.find']], ['put lunch with ana on the calendar for noon', ['event.add']],
    ['what is on today', ['cal.show', 'nav.calendar']], ['remind me in ten minutes', ['timer']], ['switch to night colours', ['theme.dark-mode', 'theme.dark', 'theme.midnight']],
    ['make the text larger', ['textsize.set']], ['use french', ['lang.set']], ['less movement on screen please', ['settings.motion']],
    ['turn notifications down', ['settings.notify']], ['mute the app sounds', ['settings.sound', 'settings.notify']], ['start a voice call', ['huddle.start', 'call.video']],
    ['leave the call', ['huddle.leave']], ['turn my camera on', ['call.video']], ['present my screen', ['call.share', 'call.present']],
    ['what were the action items', ['secretary.summary']], ['add a friend to the tribe', ['invite']], ['connect my coding agent', ['connect.ai', 'invite.agent']],
    ['go online so others can join', ['host.start', 'publish']], ['sign in to github', ['github.connect']], ['see the plans', ['premium.open']],
    ['ship the website', ['publish']], ['open the live preview', ['preview.open', 'nav.preview']], ['check it on mobile', ['preview.device']],
    ['run the checks', ['checks.run']], ['make me a 3d game', ['build.3d']], ['create a poster', ['design.new']],
    ['open my files', ['nav.files']], ['go to settings', ['nav.settings']], ['open the handbook', ['nav.guide', 'help.kb']],
    ['see the marketplace', ['nav.market', 'market.search']], ['our company', ['nav.company']], ['show earlier versions', ['nav.versions']],
    ['reverse the last thing', ['undo']], ['give me the tour', ['tour']], ['report a problem', ['feedback']],
    ['how are we doing', ['status']], ['find the budget notes', ['find']], ['flip a coin', ['random']],
  ],
  help: [
    ['how do i add a person to my tribe', /invite|projects-and-invites|start-here|phones/i], ['how does my agent connect', /connect|agents|ANY-LLM/i], ['does it run on a phone', /phone|mobile/i],
    ['how do i publish a site', /website|publish/i], ['how do i restore an old version', /version|repos|troubleshoot/i], ['what is company mode for', /company/i],
    ['how do i find work', /work/i], ['my friend can not join', /troubleshoot|phones|hosting/i],
  ],
  search: {
    corpus: [
      ['d1', 'Doc', 'Budget: hall hire two hundred, catering four fifty, decorations sixty'], ['d2', 'Doc', 'Guest list: forty adults, twelve children, three vegetarians'],
      ['d3', 'Doc', 'Run of show: doors at six, speeches at seven, band at eight'], ['d4', 'Doc', 'Brand guide: navy and cream, rounded type, the fox mascot'],
      ['d5', 'Doc', 'Bug triage: crash on save, wrong score after pause, music stops in level two'], ['d6', 'Doc', 'Supplier contacts: the florist, the baker, the sound engineer'],
      ['t1', 'Task', 'Email the caterer the final numbers'], ['t2', 'Task', 'Print the seating plan'], ['t3', 'Task', 'Replace the dead battery in the microphone'],
      ['t4', 'Task', 'Write the welcome speech'], ['t5', 'Task', 'Make the buttons bigger on phones'], ['t6', 'Task', 'Record the gameplay trailer'],
      ['c1', 'Chat', 'the projector will not turn on'], ['c2', 'Chat', 'who is bringing the folding tables'], ['c3', 'Chat', 'i lost my save file again'],
      ['c4', 'Chat', 'the cake shop needs the order by tuesday'], ['c5', 'Chat', 'parking at the venue is full by five'], ['c6', 'Chat', 'the tutorial is confusing for my little sister'],
      ['f1', 'File', 'photos/venue-entrance.jpg'], ['f2', 'File', 'contracts/band-agreement.pdf'], ['f3', 'File', 'src/audio/level-two-music.ogg'],
      ['v1', 'Version', 'Fixed the crash when saving twice'], ['v2', 'Version', 'Added a colour-blind palette'], ['v3', 'Version', 'Faster loading on slow connections'],
    ],
    q: [
      ['how much are we spending', 'd1'], ['cost of the food', 'd1'], ['who is coming', 'd2'], ['how many kids', 'd2'], ['the timetable for the evening', 'd3'], ['when does the music start', 'd3'],
      ['our logo animal', 'd4'], ['which colours do we use', 'd4'], ['known problems', 'd5'], ['list of defects', 'd5'], ['who supplies the flowers', 'd6'], ['phone number for the bakery', 'd6'],
      ['send the headcount to the food people', 't1'], ['where people sit', 't2'], ['the mic has no power', 't3'], ['prepare the opening remarks', 't4'], ['tap targets too small', 't5'], ['film the promo video', 't6'],
      ['beamer is broken', 'c1'], ['furniture for the hall', 'c2'], ['my progress disappeared', 'c3'], ['deadline for the dessert', 'c4'], ['nowhere to leave the car', 'c5'], ['beginners do not understand the intro', 'c6'],
      ['picture of the front door', 'f1'], ['the musicians contract', 'f2'], ['soundtrack for the second stage', 'f3'], ['when did the saving bug get fixed', 'v1'], ['accessibility colours', 'v2'], ['performance improvements', 'v3'],
    ],
  },
};
