// First version from the sentence (pass 9, docs/FIRST-PREVIEW.md). Pure and deterministic: no AI, no network, no clock.
// firstlook.js picks the closest template; this file reads the sentence into a brief and then composes on top of the
// template, so "a habit tracker for my running club with streaks and a weekly leaderboard" is about running, a club
// and a leaderboard, not the stock habits sample.
//   brief(idea)                  -> { subject, audience, domain, features: [ids], colors: [names], dark, things: [words] }
//   chips(brief, label)          -> ['Phone app', 'running club', 'Streaks', 'Leaderboard']   (what was understood)
//   app(A, doc, brief, name, tpl)  -> doc    (A = TribeAppCore; words, screens for named features, the look)
//   site(S, cfg, brief, name, tpl) -> cfg    (S = TribeSiteCfg; words, sections for named features, the look)
//   tasks(brief, kind?)          -> ['Set up the leaderboard', 'Let members log a run', …]   (the dashboard's suggestions; a website's
//                                   are website tasks: headline, pictures, phone check, how to reach you, put it online)
//   sig(x)                       -> a short fingerprint of a design without its ids (has the person edited it since?)
// Rules: the same sentence gives the same result; nothing is invented about the person (no sample first names, "You"
// instead); placeholders say they are placeholders; no prices for TribeCode anywhere.
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFirstMake = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const W = s => new RegExp(`(^|[^\\p{L}])(${s})(?=$|[^\\p{L}])`, 'iu');
  const cap = s => String(s || '').replace(/^\p{L}/u, c => c.toUpperCase());
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- the word bank: 30 common subjects ----------
  // [id, words, [one, many], add button, hello, line under it, [three stat labels], [[item, detail] x5], accent, [eyebrow, call to action, [[title, text] x3]]]
  const BANK = [
    ['running', 'run|runs|running|runners?|jog(ging)?|marathon|5k|10k|track club', ['run', 'runs'], 'Log a run', 'Ready to run?', '2 of 4 runs done this week', ['Day streak', 'km this week', 'Runs logged'], [['Easy run', '5 km'], ['Intervals', '6 × 400 m'], ['Long run', '12 km'], ['Stretch', '10 minutes'], ['Rest day', 'Sunday']], '#E8590C', ['Every pace welcome', 'Join a run', [['Runs every week', 'Say when and where you meet.'], ['All paces', 'Say who it is for.'], ['After the run', 'Coffee, stretching or what you do next.']]]],
    ['fitness', 'workouts?|gym|exercise|fitness|lifting|weights|yoga|pilates|crossfit|training', ['workout', 'workouts'], 'Log a workout', 'Ready to train?', '2 of 3 workouts done this week', ['Day streak', 'Minutes this week', 'Workouts'], [['Warm-up', '10 minutes'], ['Strength', '45 minutes'], ['Cardio', '20 minutes'], ['Mobility', '15 minutes'], ['Rest day', 'Sunday']], '#F03E3E', ['Train with us', 'Book a class', [['Classes', 'Say what you teach and when.'], ['Coaches', 'Say who leads them.'], ['First visit', 'Say what a new person should bring.']]]],
    ['team', 'team|league|squad|soccer|football|basketball|baseball|hockey|volleyball|tennis|cricket|rugby|match(es)?|fixtures?', ['match', 'matches'], 'Add a match', 'Game week', 'Next match on Saturday', ['Wins', 'Played', 'Goals'], [['Training', 'Tuesday 6 pm'], ['Home match', 'Saturday 10 am'], ['Kit check', 'Before Saturday'], ['Away match', 'Next week'], ['Team meal', 'After the match']], '#1C7ED6', ['This season', 'See the fixtures', [['Fixtures', 'List the next matches.'], ['The squad', 'Say who plays.'], ['Join us', 'Say how to try out.']]]],
    ['food', 'recipes?|cook(ing)?|meals?|baking|bake|dinner|lunch|breakfast|kitchen|food', ['recipe', 'recipes'], 'Add a recipe', 'What to cook?', '3 recipes saved this week', ['Recipes', 'Cooked this week', 'Favourites'], [['Weeknight pasta', '20 minutes'], ['Sheet-pan dinner', '35 minutes'], ['Big salad', '15 minutes'], ['Soup for later', '45 minutes'], ['Something sweet', '30 minutes']], '#E67700', ['From our kitchen', 'See the recipes', [['Quick dinners', 'Say what you cook most.'], ['Step by step', 'Say how the recipes are written.'], ['New each week', 'Say how often you add one.']]]],
    ['cafe', 'caf[eé]|coffee shop|coffee|bakery|restaurant|bistro|diner|pizzeria|pizza|bar|food truck|tea house', ['order', 'orders'], 'Add an order', 'What can we get you?', 'Open today', ['Orders', 'Regulars', 'On the menu'], [['Coffee', 'Hot or iced'], ['Fresh bread', 'Baked this morning'], ['Lunch plate', 'Changes daily'], ['Something sweet', 'Ask what is new'], ['To take home', 'Beans and jars']], '#A0522D', ['Open today', 'See the menu', [['The menu', 'Say what you serve.'], ['Find us', 'Say where you are and when you open.'], ['Order ahead', 'Say how to order.']]]],
    ['study', 'study|studying|homework|exams?|revision|flashcards?|learn(ing)?|vocabulary|language|spanish|french|notes for class', ['topic', 'topics'], 'Add a topic', 'Ready to study?', '2 of 5 topics done today', ['Day streak', 'Minutes today', 'Topics done'], [['Read the chapter', '25 minutes'], ['Practice questions', '10 questions'], ['Review flashcards', '15 cards'], ['Write a summary', 'Half a page'], ['Take a break', '5 minutes']], '#7048E8', ['Learn a little every day', 'Start studying', [['Short sessions', 'Say how long a session is.'], ['Track progress', 'Say what gets ticked off.'], ['For your class', 'Say who it is for.']]]],
    ['school', 'school|class(room)?|teacher|students?|pupils?|grade|lesson plan|pta', ['lesson', 'lessons'], 'Add a lesson', 'This week in class', '3 lessons planned', ['Lessons', 'Assignments', 'Days to the test'], [['Monday lesson', 'Period 2'], ['Homework due', 'Wednesday'], ['Group project', 'In pairs'], ['Quiz', 'Friday'], ['Reading time', '20 minutes']], '#1971C2', ['For our class', 'See this week', [['This week', 'Say what the class is doing.'], ['Homework', 'Say what is due and when.'], ['Talk to the teacher', 'Say how to get in touch.']]]],
    ['tutoring', 'tutor(ing)?|coach(ing)?|mentor(ing)?|lessons?|course|workshop|teach(ing)?', ['session', 'sessions'], 'Book a session', 'Your next session', '2 sessions this week', ['Sessions', 'Hours', 'Students'], [['First session', 'Getting to know you'], ['Weekly session', '1 hour'], ['Practice task', 'Between sessions'], ['Progress check', 'Every month'], ['Questions', 'Any time']], '#0CA678', ['Learn with a guide', 'Book a session', [['What you learn', 'Say what the sessions cover.'], ['How it works', 'Say how long and how often.'], ['Who it is for', 'Say who gets the most from it.']]]],
    ['money', 'budget|expenses?|spending|money|savings?|bills?|finance|income|invoices?', ['expense', 'expenses'], 'Add an expense', 'This month', 'Left to spend', ['Spent', 'Left', 'Saved'], [['Groceries', 'This week'], ['Rent', 'Monthly'], ['Transport', 'This week'], ['Eating out', 'This week'], ['Savings', 'Monthly']], '#2F9E44', ['Know where it goes', 'See how it works', [['Every expense', 'Say what gets tracked.'], ['A clear month', 'Say what the summary shows.'], ['Shared or solo', 'Say who uses it.']]]],
    ['pets', 'pets?|dogs?|cats?|pupp(y|ies)|kittens?|vet|dog walk(ing|er)?|pet sitting|grooming|aquarium|hamster|rabbit', ['walk', 'walks'], 'Add a walk', 'Time for a walk?', '2 of 3 walks done today', ['Walks today', 'Meals', 'Days since the vet'], [['Morning walk', '20 minutes'], ['Breakfast', 'One scoop'], ['Play time', '15 minutes'], ['Evening walk', '30 minutes'], ['Brush', 'Twice a week']], '#D9480F', ['For good dogs and cats', 'Book a visit', [['Walks', 'Say how long and where.'], ['Visits', 'Say what a visit includes.'], ['Meet first', 'Say how a first meeting works.']]]],
    ['music', 'music|songs?|playlists?|albums?|practice (guitar|piano)|guitar|piano|drums|singing|choir|orchestra', ['song', 'songs'], 'Add a song', 'What to play?', '4 songs on the list', ['Songs', 'Minutes played', 'Day streak'], [['Warm-up scales', '5 minutes'], ['New song', 'First verse'], ['Old favourite', 'Play it through'], ['Tricky part', 'Slow, then faster'], ['Record a take', 'Just one']], '#AE3EC9', ['Listen', 'Hear the music', [['New music', 'Say what is out now.'], ['Live', 'Say where to hear it.'], ['Stay close', 'Say how to follow along.']]]],
    ['band', 'band|gigs?|concerts?|tour|rehearsals?|setlist|dj|singer|musician', ['gig', 'gigs'], 'Add a gig', 'Next gig', 'Rehearsal on Thursday', ['Gigs', 'Songs in the set', 'Days to the next gig'], [['Rehearsal', 'Thursday 7 pm'], ['Setlist', '10 songs'], ['Load in', '5 pm'], ['Sound check', '6 pm'], ['Show', '8 pm']], '#C2255C', ['On tour', 'See the dates', [['Shows', 'List the next dates.'], ['Music', 'Say where to listen.'], ['Booking', 'Say how to book the band.']]]],
    ['podcast', 'podcast|episodes?|show notes|listeners', ['episode', 'episodes'], 'Add an episode', 'Next episode', 'Recording this week', ['Episodes', 'Listeners', 'Days to the next one'], [['Pick the topic', 'One line'], ['Book the guest', 'Send the invite'], ['Record', '45 minutes'], ['Edit', 'Cut the pauses'], ['Publish', 'Friday']], '#F76707', ['New episodes weekly', 'Listen now', [['Latest episode', 'Say what it is about.'], ['Where to listen', 'List the apps.'], ['Be a guest', 'Say how to pitch.']]]],
    ['travel', 'trips?|travel(ling|ing)?|holiday|vacation|itinerary|road trip|camping|hik(e|es|ing)|backpacking|flights?', ['stop', 'stops'], 'Add a stop', 'Where to next?', '3 stops planned', ['Days to go', 'Stops', 'Things packed'], [['Book the stay', 'Two nights'], ['Plan day one', 'Morning and evening'], ['Pack the bag', 'The night before'], ['Tickets', 'Saved offline'], ['First stop', 'On arrival']], '#1098AD', ['The plan', 'See the trip', [['Day by day', 'Say what happens each day.'], ['What to bring', 'List the essentials.'], ['Who is coming', 'Say who is in.']]]],
    ['shop', 'shop|store|sell(ing)?|merch|products?|etsy|handmade|orders?|inventory|catalog(ue)?', ['product', 'products'], 'Add a product', 'New this week', '4 products in the shop', ['Products', 'Orders', 'In the cart'], [['Best seller', 'In stock'], ['New arrival', 'Just added'], ['Small gift', 'Under the till'], ['Bundle', 'Three together'], ['Last few', 'Almost gone']], '#E03131', ['New this week', 'See the shop', [['What we make', 'Say what you sell.'], ['How it ships', 'Say where and how fast.'], ['Made with care', 'Say what makes it yours.']]]],
    ['events', 'events?|meetups?|conference|festival|party|parties|birthday|reunion|game night|potluck', ['event', 'events'], 'Add an event', 'Coming up', '2 events this month', ['Events', 'Going', 'Days to the next one'], [['Pick a date', 'Ask the group'], ['Find a place', 'Two options'], ['Send the invites', 'This week'], ['Food and drinks', 'Who brings what'], ['The day', 'Doors at 7']], '#F59F00', ['Save the date', 'See the details', [['When and where', 'Say the date, time and place.'], ['What to expect', 'Say what happens.'], ['Say you are coming', 'Say how to reply.']]]],
    ['wedding', 'wedding|married|marry|bride|groom|engagement|rsvp', ['guest', 'guests'], 'Add a guest', 'Our day', 'Replies are coming in', ['Days to go', 'Guests', 'Replies'], [['Ceremony', 'The time and place'], ['Dinner', 'After the ceremony'], ['Dancing', 'Until late'], ['Where to stay', 'Nearby rooms'], ['Gifts', 'If you wish']], '#C2255C', ['We are getting married', 'Reply here', [['The day', 'Say when and where.'], ['Getting there', 'Say how to travel and where to stay.'], ['Reply', 'Say how and by when.']]]],
    ['bookings', 'bookings?|appointments?|reservations?|reserve|schedule a|time slots?', ['booking', 'bookings'], 'Add a booking', 'Book a time', '3 bookings this week', ['Bookings', 'Free slots', 'This week'], [['Morning slot', '9:00'], ['Midday slot', '12:00'], ['Afternoon slot', '3:00'], ['Evening slot', '6:00'], ['Waiting list', 'If full']], '#0C8599', ['Book in a minute', 'Book a time', [['Pick a time', 'Say when you are open.'], ['What to expect', 'Say how long it takes.'], ['Change of plans', 'Say how to cancel.']]]],
    ['salon', 'barber|salon|hair(cut|dresser)?|nails?|spa|massage|beauty|tattoo', ['appointment', 'appointments'], 'Book an appointment', 'Book a chair', 'Open today', ['Appointments', 'Free today', 'Regulars'], [['Cut', '30 minutes'], ['Cut and style', '45 minutes'], ['Colour', '90 minutes'], ['Trim', '15 minutes'], ['Walk-ins', 'When there is a chair']], '#862E9C', ['Open today', 'Book a chair', [['What we do', 'List the services.'], ['Who we are', 'Say who is behind the chair.'], ['Find us', 'Say where and when.']]]],
    ['chores', 'chores?|housework|cleaning|laundry|household|roommates?|flatmates?|family tasks', ['chore', 'chores'], 'Add a chore', 'What needs doing?', '3 chores left today', ['Done today', 'Left', 'Day streak'], [['Dishes', 'After dinner'], ['Laundry', 'One load'], ['Bins out', 'Tuesday'], ['Vacuum', 'Living room'], ['Water the plants', 'Twice a week']], '#37B24D', ['A fair share', 'See the list', [['Who does what', 'Say how chores are shared.'], ['Each week', 'Say what repeats.'], ['Done is done', 'Say how to tick one off.']]]],
    ['reading', 'books?|reading|book club|library|novels?|chapters?', ['book', 'books'], 'Add a book', 'What to read?', '2 books on the go', ['Books read', 'Pages this week', 'Day streak'], [['Tonight', '20 pages'], ['This month', 'The club pick'], ['Up next', 'From the list'], ['Finished', 'Add a note'], ['To find', 'At the library']], '#5F3DC4', ['One book a month', 'See what we read', [['This month', 'Say what you are reading.'], ['When we meet', 'Say the date and place.'], ['Join in', 'Say how to join.']]]],
    ['gaming', 'gam(e|es|ing) (night|club|group)|esports|tournament|board games?|d&d|dungeons and dragons|chess|minecraft|speedrun|clan|guild', ['game', 'games'], 'Add a game', 'Game on', 'Next session on Friday', ['Wins', 'Games played', 'Players'], [['Pick the game', 'Vote by Thursday'], ['Set the table', '7 pm'], ['Round one', 'Warm-up'], ['The big one', 'Main game'], ['Scores', 'Write them down']], '#7950F2', ['Game night', 'Join a game', [['What we play', 'List the games.'], ['When', 'Say the day and time.'], ['New players', 'Say how to join.']]]],
    ['community', 'church|community|neighbou?rs?|neighbou?rhood|volunteers?|congregation|youth group|scouts?|association', ['notice', 'notices'], 'Add a notice', 'This week', '3 things happening', ['Members', 'This week', 'Volunteers'], [['Weekly gathering', 'Sunday 10 am'], ['Help needed', 'Two people'], ['Shared meal', 'Bring a dish'], ['Meeting', 'First Tuesday'], ['Say hello', 'To someone new']], '#1C7ED6', ['Everyone welcome', 'See what is on', [['This week', 'Say what is happening.'], ['Get involved', 'Say how to help.'], ['Find us', 'Say where and when.']]]],
    ['nonprofit', 'nonprofit|non-profit|charity|fundrais(er|ing)|donat(e|ions?)|cause|food bank|shelter|rescue', ['donation', 'donations'], 'Add a donation', 'Thank you', 'This month so far', ['Raised', 'Donors', 'Volunteers'], [['Share the cause', 'One post'], ['Thank a donor', 'A short note'], ['Plan the drive', 'Pick a date'], ['Sign up helpers', 'Five needed'], ['Report back', 'What it paid for']], '#0B7285', ['Help us help', 'Give or volunteer', [['What we do', 'Say who you help and how.'], ['Where it goes', 'Say what a gift pays for.'], ['Get involved', 'Say how to volunteer.']]]],
    ['club', 'clubs?|society|members?|membership|group', ['member', 'members'], 'Add a member', 'This week at the club', '3 things coming up', ['Members', 'This week', 'New this month'], [['Weekly meet-up', 'Same time, same place'], ['Welcome new members', 'Say hello'], ['Plan the next one', 'Pick a date'], ['Share photos', 'From last time'], ['Dues', 'If you have them']], '#2B8A3E', ['Everyone welcome', 'Come along', [['When we meet', 'Say the day, time and place.'], ['Who it is for', 'Say who should come.'], ['Join', 'Say how to become a member.']]]],
    ['portfolio', 'portfolio|my work|resume|cv|freelanc(e|er|ing)|designer|developer|illustrat(or|ion)|writer|artist|showreel', ['project', 'projects'], 'Add a project', 'Selected work', '3 projects to show', ['Projects', 'Clients', 'Years'], [['Best project', 'What it was'], ['Recent work', 'This year'], ['A small one', 'Made for fun'], ['Case study', 'How it went'], ['Say hello', 'Get in touch']], '#364FC7', ['Selected work', 'See the work', [['What I do', 'Say it in one line.'], ['Selected work', 'Show three things.'], ['Work with me', 'Say how to get in touch.']]]],
    ['photo', 'photograph(y|er|s)?|photos?|camera|portraits?|photo shoot', ['photo', 'photos'], 'Add a photo', 'Latest shots', '6 photos this week', ['Photos', 'Albums', 'This week'], [['Golden hour', 'Outside'], ['Portrait', 'One person'], ['Detail', 'Up close'], ['Wide shot', 'The whole scene'], ['Edit', 'Pick the best three']], '#495057', ['Recent work', 'See the photos', [['What I shoot', 'Say what kind of photos.'], ['Sessions', 'Say how a session works.'], ['Book a shoot', 'Say how to book.']]]],
    ['realestate', 'real estate|realtor|houses?|apartments?|listings?|rentals?|property|properties|open house', ['listing', 'listings'], 'Add a listing', 'New listings', '3 homes to see', ['Listings', 'Viewings', 'New this week'], [['Two-bedroom flat', 'Near the park'], ['Family house', 'With a garden'], ['Studio', 'In the centre'], ['Viewing', 'Saturday 11 am'], ['Ask a question', 'Any time']], '#1864AB', ['Homes to see', 'See the listings', [['Listings', 'Show what is available.'], ['Viewings', 'Say how to book one.'], ['About us', 'Say who you are.']]]],
    ['newsletter', 'newsletter|blog|writing|essays?|substack|zine|journal(ism)?', ['post', 'posts'], 'Add a post', 'Latest writing', 'A new post each week', ['Posts', 'Readers', 'This month'], [['This week', 'The new post'], ['Draft', 'Half written'], ['Idea', 'One line'], ['From readers', 'A reply'], ['Archive', 'Everything so far']], '#343A40', ['New every week', 'Read the latest', [['What it is about', 'Say it in one line.'], ['How often', 'Say when it arrives.'], ['Subscribe', 'Say how to get it.']]]],
    ['launch', 'launch(ing)?|waitlist|startup|product|saas|beta|early access|landing page', ['signup', 'signups'], 'Add a signup', 'Coming soon', 'Join the list to hear first', ['Signups', 'Days to launch', 'This week'], [['Say what it does', 'One line'], ['Show it', 'One picture'], ['Open the list', 'Collect emails'], ['Tell five people', 'This week'], ['Launch', 'Pick a day']], '#4263EB', ['Coming soon', 'Join the list', [['What it does', 'Say it in one plain line.'], ['Who it is for', 'Say who gets the most from it.'], ['Be first', 'Say what joining the list gets you.']]]],
    ['personal', 'personal|about me|my life|family|diary|gratitude|mood|self[- ]care|wellness', ['entry', 'entries'], 'Add an entry', 'How was today?', '3 entries this week', ['Entries', 'Day streak', 'This month'], [['One good thing', 'From today'], ['Mood', 'In a word'], ['A photo', 'If you took one'], ['Tomorrow', 'One thing to do'], ['Thank someone', 'A short note']], '#9C36B5', ['A little about me', 'Say hello', [['Who I am', 'Say it in a line or two.'], ['What I like', 'List a few things.'], ['Get in touch', 'Say how.']]]],
  ].map(([id, rx, noun, add, hello, sub, stats, items, accent, site]) => ({ id, rx: W(rx), noun, add, hello, sub, stats, items, accent, site: { eye: site[0], cta: site[1], feats: site[2] } }));
  const DOMAIN = Object.fromEntries(BANK.map(d => [d.id, d]));

  // ---------- features a sentence can name ----------
  // [id, words, label, App Creator kit, working features (appfeatures.js), site section, task for the dashboard]
  const FEATS = [
    ['leaderboard', 'leader ?boards?|rankings?|scoreboards?|high ?scores?|top (players|members|scorers)', 'Leaderboard', 'leaderboard', [], 'list', 'Decide what the leaderboard ranks'],
    ['streaks', 'streaks?', 'Streaks', '', ['streak'], '', 'Decide what keeps a streak going'],
    ['chat', 'chat|messages?|messaging|messenger|group chat|dms?', 'Chat', 'chat', [], 'contact', 'Write the first welcome message'],
    ['map', 'maps?|nearby|locations?|routes?|directions|find us', 'Map', 'map', ['map'], 'info', 'Add the real places to the map'],
    ['calendar', 'calendar|schedules?|timetable|agenda|dates', 'Calendar', 'calendar', [], 'timeline', 'Put the real dates in the calendar'],
    ['rsvp', 'rsvp|replies|guest list', 'RSVP', '', [], 'contact', 'Say how guests should reply and by when'],
    ['booking', 'bookings?|appointments?|reservations?|reserve', 'Booking', 'booking-details', [], 'contact', 'Say which times can be booked'],
    ['shop', 'cart|checkout|buy|prices?|pricing|payments?|plans', 'Prices', 'shop', [], 'pricing', 'Set your real prices'],
    ['photos', 'photos?|gallery|pictures?|images|albums?', 'Photos', '', ['camera'], 'gallery', 'Add your own photos'],
    ['timer', 'timers?|stopwatch|countdown|pomodoro', 'Timer', 'timer', ['timer'], '', 'Set how long the timer runs'],
    ['notes', 'notes?|journal|diary|log ?book', 'Notes', '', ['notes'], '', 'Write the first note'],
    ['login', 'log ?in|sign ?in|accounts?|profiles?', 'Profile', 'profile', ['demologin'], '', 'Decide what a profile shows'],
    ['search', 'search|find|filter', 'Search', 'search', ['search'], '', 'Try the search with real words'],
    ['favourites', 'favou?rites?|bookmarks?|saved|wish ?list', 'Favourites', '', ['favorites'], '', 'Mark a first favourite'],
    ['reminders', 'reminders?|notifications?|alerts?|nudges?', 'Reminders', 'notifications', ['reminders'], '', 'Choose when a reminder goes out'],
    ['dark', 'dark ?mode|night mode', 'Dark mode', '', ['darkswitch'], '', ''],
    ['signup', 'sign ?up|waitlist|newsletter|subscribe|mailing list|join form', 'Sign-up form', 'signin', [], 'newsletter', 'Say what people get for signing up'],
    ['faq', 'faqs?|questions|help page', 'Questions', 'faq', [], 'faq', 'Write three real questions and answers'],
    ['reviews', 'testimonials?|reviews?|what people say', 'What people say', 'reviews', [], 'testimonials', 'Ask one real person for a quote'],
    ['contact', 'contact|get in touch|email us|call us', 'Contact', '', [], 'contact', 'Add how to reach you'],
    ['links', 'links?|socials?|instagram|tiktok|youtube', 'Links', '', [], 'links', 'Add your real links'],
    ['team', 'team page|who we are|about us|staff|meet the', 'Who we are', 'team-contacts', [], 'team', 'Add the real names'],
    ['goals', 'goals?|targets?|challenges?', 'Goals', 'goal-setup', ['progress'], 'stats', 'Set the first goal'],
    ['badges', 'badges?|achievements?|trophies|rewards?', 'Badges', 'achievements', ['celebrate'], '', 'Name the first badge'],
    ['poll', 'polls?|vot(e|es|ing)|survey', 'Poll', 'poll', [], '', 'Write the first poll question'],
    ['share', 'share|invite friends|invites?', 'Invite', 'invite', ['share'], '', 'Invite the first person'],
    ['offline', 'offline|no internet|without internet', 'Works offline', '', ['offline'], '', ''],
  ].map(([id, rx, label, kit, fx, sec, task]) => ({ id, rx: W(rx), label, kit, fx, sec, task }));
  const FEAT = Object.fromEntries(FEATS.map(f => [f.id, f]));

  const COLORS = { red: '#E03131', orange: '#F76707', amber: '#F59F00', yellow: '#F59F00', gold: '#E67700', green: '#2F9E44', teal: '#0CA678', mint: '#12B886', blue: '#1C7ED6', navy: '#1864AB', indigo: '#4263EB', purple: '#7048E8', violet: '#7048E8', pink: '#D6336C', rose: '#C2255C', brown: '#A0522D', black: '#212529', gray: '#495057', grey: '#495057', warm: '#E8590C', cool: '#1098AD', earthy: '#8D6E3F', pastel: '#DA77F2', neon: '#F03E3E' };
  const COLOR_RX = W(Object.keys(COLORS).join('|'));
  const STOP = /^(a|an|the|my|our|your|his|her|their|some|simple|small|little|cozy|cosy|new|cool|nice|fun|easy|quick|basic|tiny|mini|good|great|best|own|personal)$/i;

  // ---------- the brief ----------
  function brief(idea) {
    const raw = String(idea || '').replace(/[“”"]/g, ' ').replace(/\s+/g, ' ').trim(), t = ' ' + raw.toLowerCase() + ' ';
    const b = { idea: raw, subject: '', audience: '', domain: null, features: [], colors: [], dark: false, things: [] };
    // who or what it is for: "for my running club", "about our trip to Lisbon", "for dog owners"
    const m = t.match(/\s(?:for|about)\s+((?:(?:my|our|the|a|an|your|his|her|their)\s+)?[\p{L}\d' &-]+?)(?=\s+(?:with|that|where|which|who|and|so|to|using|in|on|,)\s|[.,;!?]|\s*$)/iu);
    if (m) { const words = m[1].trim().split(' ').filter(w => !STOP.test(w)); b.audience = words.slice(0, 4).join(' '); b.mine = /^(my|our)\s/i.test(m[1].trim()); b.about = /^\sabout\s/i.test(m[0]); }
    // what it is: the words before "app", "site", "game", "tracker" …
    const k = t.match(/\s((?:[\p{L}\d'-]+\s){0,3})(?:app|application|web ?site|site|web ?page|page|game|tracker|planner|tool|board)\s/iu);
    if (k) b.things = k[1].trim().split(' ').filter(w => w && !STOP.test(w) && !/^(make|build|create|me|us|i|we|want|need|would|like|to|please|let'?s|phone|mobile|web|of|for)$/i.test(w));
    for (const d of BANK) if (d.rx.test(t)) { b.domain = d.id; break; }
    // "running club" is about running first; a plain "club" only when nothing more specific was said
    for (const f of FEATS) if (f.rx.test(t)) b.features.push(f.id);
    if (b.features.includes('booking') && b.features.includes('calendar')) b.features = b.features.filter(x => x !== 'calendar');
    let c; const crx = new RegExp(COLOR_RX.source, 'giu'); while ((c = crx.exec(t))) { const n = c[2].toLowerCase(); if (!b.colors.includes(n)) b.colors.push(n); }
    b.dark = W('dark|night|black|moody').test(t) && !/dark chocolate/.test(t);
    b.subject = b.audience || b.things.join(' ') || (b.domain ? DOMAIN[b.domain].noun[1] : '');
    return b;
  }
  function chips(b, label) {
    const out = [label].filter(Boolean);
    if (b.subject) out.push(b.subject);
    for (const f of b.features) if (FEAT[f].label && !out.some(x => x.toLowerCase() === FEAT[f].label.toLowerCase())) out.push(FEAT[f].label);
    return out.slice(0, 6);
  }
  const people = b => (/members?|club|team|group|class|students?|friends|family|neighbou?rs?|guests?|customers?|clients?|readers|listeners|players|runners/.exec(b.audience + ' ' + b.idea.toLowerCase()) || [''])[0];
  // What was made decides the words (feat/dash-layout): a website gets website tasks (its headline, pictures, a phone
  // check, how people reach you, putting it online), never an app's nouns ("add an order"); an app keeps its own nouns.
  // kind: 'site' | 'app' | 'game' | '' (guessed from the sentence when not given).
  const SITE_RX = /\b(web ?sites?|sites?|web ?pages?|landing page|home ?page|portfolio|blog|link in bio)\b/i, APP_RX = /\b(apps?|application|tracker|planner)\b/i;
  function siteTasks(b) {
    const D = b.domain ? DOMAIN[b.domain] : null, sec = D && D.site && D.site.feats && D.site.feats[0];
    const feat = b.features.map(f => FEAT[f]).find(f => f.sec && f.task && f.id !== 'contact' && f.id !== 'photos');   // contact and photos are in the list already
    const own = feat ? feat.task : sec && sec[1] && !/^say it in one line/i.test(sec[1]) ? String(sec[1]).replace(/\.$/, '') : '';
    return ['Write your own headline', own, 'Swap in your own pictures', 'Check it on a phone', 'Add how people reach you', 'Put it online'].filter(Boolean);
  }
  function tasks(b, kind) {
    const k = kind || (SITE_RX.test(b.idea || '') && !APP_RX.test(b.idea || '') ? 'site' : '');
    if (k === 'site') return siteTasks(b);
    const out = [], D = b.domain ? DOMAIN[b.domain] : null, who = /club|team|group|society/.test(people(b)) ? 'members' : /class|students?/.test(people(b)) ? 'students' : /friends|family|guests?|customers?|clients?|readers|listeners|players|runners|neighbou?rs?/.test(people(b)) ? people(b).replace(/^(friend|guest|customer|client|neighbou?r|student)$/, '$1s') : '';
    for (const f of b.features) if (FEAT[f].task) out.push(FEAT[f].task);
    if (D) { out.push(who ? `Let ${who} ${D.add.charAt(0).toLowerCase() + D.add.slice(1)}` : `Try it yourself: ${D.add.charAt(0).toLowerCase() + D.add.slice(1)}`); out.push(`Replace the sample ${D.noun[1]} with your own`); }
    if (b.audience && b.mine && (people(b) || /band|mom|mum|dad|wife|husband|kids|brother|sister|partner|boss|coworkers|crew|parents|roommates?|flatmates?/.test(b.audience))) out.push(`Show it to your ${b.audience}`);
    return [...new Set(out)].slice(0, 5);
  }

  // ---------- an app, composed ----------
  // Templates that are a plain list or tracker: their sample items become the subject's own.
  const PLAIN = { habits: ['habit', 'habits'], todo: ['task', 'tasks'], notes: ['note', 'notes'], planner: ['event', 'events'], kanban: ['card', 'cards'], journal: ['entry', 'entries'], focus: ['session', 'sessions'], grocery: ['item', 'items'], chores: ['chore', 'chores'], flashcards: ['card', 'cards'] };
  // Templates whose first title is a made-up brand: the project's own name goes there.
  const BRAND = new Set(['recipes', 'shop', 'gamemenu', 'bookclub', 'noodles', 'trivia', 'puzzle', 'party', 'podcast', 'cityguide', 'neighbors']);
  // Which subject a template is already about (its sample is left alone when the sentence is about the same thing)
  const TPL_DOMAIN = { workout: 'fitness', running: 'running', recipes: 'food', mealprep: 'food', noodles: 'cafe', coffee: 'cafe', budget: 'money', savings: 'money', split: 'money', subs: 'money', invoices: 'money', trip: 'travel', hotel: 'travel', cityguide: 'travel', shop: 'shop', swap: 'shop', drops: 'shop', stock: 'shop', booking: 'bookings', events: 'events', party: 'events', bookclub: 'reading', flashcards: 'study', course: 'tutoring', pets: 'pets', music: 'music', podcast: 'podcast', chores: 'chores', journal: 'personal', neighbors: 'community', trivia: 'gaming', puzzle: 'gaming', racing: 'gaming', gamemenu: 'gaming' };
  const NAMEY = /,\s+\p{Lu}\p{Ll}+(?=[!?.]?$)/u;   // "Good morning, Maya" · "Ready, Alex?" · "¡Hola, Maya!"
  const swapNoun = (s, from, to) => String(s).replace(new RegExp(`\\b(${from[1]}|${from[0]})\\b`, 'gi'), m => { const many = m.toLowerCase() === from[1], w = many ? to[1] : to[0]; return m[0] === m[0].toUpperCase() ? cap(w) : w; });
  const eachString = (o, fn, path = '') => { if (Array.isArray(o)) o.forEach((v, i) => { if (typeof v === 'string') o[i] = fn(v, `${path}.${i}`); else eachString(v, fn, `${path}.${i}`); }); else if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (typeof o[k] === 'string') o[k] = fn(o[k], path ? `${path}.${k}` : k); else eachString(o[k], fn, path ? `${path}.${k}` : k); } };
  const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;

  function app(A, doc, b, name, tpl) {
    doc = clone(doc); tpl = tpl || doc.template || '';
    const D = b.domain ? DOMAIN[b.domain] : null, plain = PLAIN[tpl], rewrite = !!(D && plain && TPL_DOMAIN[tpl] !== D.id), nm = String(name || doc.name || 'My app').slice(0, 48);
    const start = doc.screens.find(s => s.id === doc.start) || doc.screens[0];
    // 1. no sample first names: greetings lose them, the profile is "You"
    for (const s of doc.screens) for (const bk of s.blocks) {
      const p = bk.props || {};
      if (bk.type === 'header' || bk.type === 'hero') for (const k of ['title', 'sub', 'eyebrow']) if (typeof p[k] === 'string' && NAMEY.test(p[k])) p[k] = p[k].replace(NAMEY, '');
      if (bk.type === 'profile') { if (p.name) p.name = 'You'; if (typeof p.handle === 'string' && /^@|@/.test(p.handle)) p.handle = ''; if (typeof p.bio === 'string') p.bio = b.subject ? cap(b.subject) : ''; }
    }
    // 2. the first screen says whose app this is
    let head = start.blocks.find(x => x.type === 'header' || x.type === 'hero');
    if (!head) { head = { id: 'hea-first', type: 'header', props: { eyebrow: '', title: nm, sub: '' }, links: {} }; const at = start.blocks.findIndex(x => x.type === 'nav') + 1; start.blocks.splice(at, 0, head); }
    else if (BRAND.has(tpl)) head.props.title = nm; else head.props.eyebrow = nm;
    if (rewrite) {
      // 3. a plain tracker becomes the subject's own: its words, its items, its numbers
      head.props.title = D.hello; head.props.sub = D.sub;
      for (const s of doc.screens) for (const bk of s.blocks) {
        const p = bk.props || {};
        if (s === start && bk.type === 'stats' && Array.isArray(p.tiles)) p.tiles.forEach((t, i) => { if (D.stats[i]) { t.label = D.stats[i]; t.n = String(t.n).replace(/[^\d.,]/g, '') || '0'; } });
        if ((bk.type === 'checklist' || bk.type === 'list') && Array.isArray(p.items)) p.items.forEach((it, i) => { const d = D.items[i % D.items.length]; if (typeof it.title === 'string') it.title = d[0]; if (typeof it.sub === 'string') it.sub = s === start ? d[1] : it.sub; });
        if (bk.type === 'form' && Array.isArray(p.fields) && p.fields[0] && typeof p.fields[0].placeholder === 'string') p.fields[0].placeholder = D.items[0][0];
        if (bk.type === 'button' && typeof p.label === 'string' && /^(add|new)\b/i.test(p.label)) p.label = D.add;
        if (bk.type === 'chart' && typeof p.title === 'string') p.title = swapNoun(p.title, plain, D.noun);
      }
      for (const s of doc.screens) { s.name = swapNoun(s.name, plain, D.noun); eachString(s.blocks, (v, path) => (/(^|\.)(icon|type|id|to|how|style|img|kind)$/.test(path) ? v : swapNoun(v, plain, D.noun))); }
      head.props.eyebrow = nm;
    } else if (typeof head.props.sub === 'string' || head.props.sub == null) {
      // a template that already does the job keeps its sample; the first screen still says who it is for
      const forWho = b.audience && !b.about ? (b.mine ? `For your ${b.audience}` : `For ${b.audience}`) : b.subject ? cap(b.subject) : '';
      if (forWho) head.props.sub = forWho;
    }
    // the sentence itself, as an About line on the last tab (or the last screen), in the person's own words
    if (b.idea && b.idea.length >= 12) {
      const tabs = doc.screens.filter(x => x.tab), host = tabs[tabs.length - 1] || doc.screens[doc.screens.length - 1];
      if (host && !host.blocks.some(x => x.id === 'lab-about')) { const at = host.blocks.findIndex(x => x.type === 'tabs'), ins = [{ id: 'lab-about', type: 'label', props: { text: 'About', action: '' }, links: {} }, { id: 'tex-about', type: 'text', props: { text: cap(b.idea).replace(/[.!]?$/, '.').slice(0, 200) }, links: {} }]; host.blocks.splice(at < 0 ? host.blocks.length : at, 0, ...ins); }
    }
    // 4. the look: a colour the sentence names, else the subject's own
    const col = b.colors.map(c => COLORS[c]).find(Boolean) || (D && rewrite ? D.accent : '');
    doc.theme = doc.theme || {}; if (col) { doc.theme.accent = col; doc.theme.preset = ''; } if (b.dark) doc.theme.mode = 'dark';
    // 5. a screen for each thing the sentence names, from the parts that exist; working features switch on
    const fx = new Set(doc.features || []); let added = 0;
    for (const id of b.features) {
      const f = FEAT[id]; f.fx.forEach(x => fx.add(x));
      if (!f.kit || added >= 3 || !A || !A.KITS || !A.KITS[f.kit]) continue;
      const has = doc.screens.some(s => s.id === f.kit || new RegExp(`\\b${f.label.split(' ')[0]}`, 'i').test(s.name) || (f.kit === 'chat' && s.blocks.some(x => x.type === 'chat')) || (f.kit === 'map' && s.blocks.some(x => x.type === 'map')) || (f.kit === 'calendar' && s.blocks.some(x => x.type === 'calendar')) || (f.kit === 'timer' && s.blocks.some(x => x.type === 'timer')) || (f.kit === 'search' && s.blocks.some(x => x.type === 'search')) || (f.kit === 'profile' && s.blocks.some(x => x.type === 'profile')));
      if (has) continue;
      const r = A.kit(doc, f.kit); doc = r.doc; added++;
      const sid = r.added && r.added[0] && (r.added[0].id || r.added[0]), sc = sid && doc.screens.find(s => s.id === sid);
      if (!sc) continue;
      if (id === 'leaderboard') for (const bk of sc.blocks) if (bk.type === 'list' && Array.isArray(bk.props.items)) { let n = 0; bk.props.items.forEach(it => { if (it.title !== 'You') it.title = `Member ${++n}`; if (D && typeof it.sub === 'string') it.sub = it.sub.replace(/\bwins?\b/, D.noun[1]); }); if (D && typeof bk.props.title === 'string' && !bk.props.title) bk.props.title = /week/i.test(b.idea) ? 'This week' : ''; }
      if (A.addTab) { try { A.addTab(doc, sc); } catch {} }
    }
    if (fx.size) doc.features = [...fx];
    doc.name = nm;
    return A && A.normalize ? A.normalize(doc) : doc;
  }

  // ---------- a website, composed ----------
  const SITE_DOMAIN = { club: 'running', cafe: 'cafe', menu: 'cafe', band: 'band', 'lb-musician': 'band', wedding: 'wedding', photography: 'photo', podcast: 'podcast', nonprofit: 'nonprofit', course: 'tutoring', merch: 'shop', 'lb-shop': 'shop', portfolio: 'portfolio', resume: 'portfolio', 'sb-freelancer': 'portfolio', blog: 'newsletter', 'tt-minimal-blog': 'newsletter', 'lb-writer': 'newsletter', conference: 'events', 'lb-coach': 'tutoring', 'lb-artist': 'portfolio', 'lb-dev': 'portfolio', gamepage: 'gaming' };
  function site(S, cfg, b, name, tpl) {
    let c = clone(cfg); tpl = tpl || c.template || '';
    const D = b.domain ? DOMAIN[b.domain] : null, own = SITE_DOMAIN[tpl], rewrite = !!(D && own !== D.id && !(D.id === 'club' && own)), home = c.pages[0], first = t => home.blocks.find(x => x.type === t);
    if (rewrite) {
      const h = first('hero'), f = first('features') || first('info') || first('steps');
      if (h) { if (typeof h.props.eyebrow === 'string') h.props.eyebrow = D.site.eye.toUpperCase(); if (Array.isArray(h.props.buttons) && h.props.buttons[0] && typeof h.props.buttons[0].label === 'string') h.props.buttons[0].label = D.site.cta; }
      const l = first('links'); if (l && Array.isArray(l.props.items) && l.props.items[0] && typeof l.props.items[0].label === 'string') l.props.items[0].label = D.site.cta;
      if (f && Array.isArray(f.props.items)) f.props.items.forEach((it, i) => { const d = D.site.feats[i % D.site.feats.length]; if ('title' in it) it.title = d[0]; else if ('label' in it) it.label = d[0]; if ('text' in it) it.text = d[1]; });
      // sections that were about the template's own subject go back to the designer's honest placeholders
      const RESET = new Set(['pricing', 'testimonials', 'faq', 'contact', 'list', 'team', 'stats', 'timeline', 'text', 'cta', 'newsletter', 'banner', 'info', 'steps']);
      if (S && S.BLOCKS) for (const p of c.pages) for (const bk of p.blocks) if (bk !== f && RESET.has(bk.type) && S.BLOCKS[bk.type] && S.BLOCKS[bk.type].make) { try { bk.props = clone(S.BLOCKS[bk.type].make(name || c.name)); } catch {} }
      if (c.seo && typeof c.seo.description === 'string') c.seo.description = b.line ? String(b.line).slice(0, 160) : '';   // the search description was about the template's own business
      if (h && typeof h.props.text === 'string' && h.props.text && !b.line) h.props.text = b.subject ? `A line about ${/^(my|our)\b/.test(b.subject) ? b.subject : 'your ' + b.subject} goes here.` : h.props.text;
    }
    // a section for each thing the sentence names (the designer's own honest placeholders)
    let added = 0;
    for (const id of b.features) {
      const f = FEAT[id]; if (!f.sec || added >= 4 || !S || !S.addBlock || !S.BLOCKS || !S.BLOCKS[f.sec]) continue;
      if (c.pages.some(p => p.blocks.some(x => x.type === f.sec)) && !(id === 'leaderboard')) continue;
      if (first('links') && f.sec === 'links') continue;
      const r = S.addBlock(c, 0, f.sec); c = r.cfg; added++;
      const bk = c.pages[0].blocks.find(x => x.id === r.block.id); if (!bk) continue;
      if (id === 'leaderboard') { bk.props.title = 'Leaderboard'; bk.props.items = [1, 2, 3].map(n => ({ ...clone((bk.props.items || [{}])[0] || {}), title: `Member ${n}`, meta: 'Their score', text: '' })); }
      if (id === 'map' && bk.type === 'info') { bk.props.title = 'Find us'; if (Array.isArray(bk.props.items)) bk.props.items.slice(0, 2).forEach((it, i) => { if ('label' in it) it.label = ['Where', 'When'][i]; if ('text' in it) it.text = ['Your address goes here', 'Your opening times go here'][i]; }); }
      if (id === 'booking' && bk.type === 'contact') { bk.props.title = 'Book a time'; if ('text' in bk.props) bk.props.text = 'Say which days and times work, and we will confirm.'; if ('button' in bk.props && typeof bk.props.button === 'string') bk.props.button = 'Ask for a time'; }
      if (id === 'chat' && bk.type === 'contact') bk.props.title = 'Send a message';
      if (id === 'goals' && bk.type === 'stats' && Array.isArray(bk.props.items)) bk.props.items.forEach((it, i) => { it.value = '0'; it.label = (D ? D.stats[i] : ['Goal', 'So far', 'Days left'][i]) || it.label; });
    }
    // the look: a colour the sentence names, else the subject's own when the template was about something else
    const col = b.colors.map(x => COLORS[x]).find(Boolean) || (rewrite ? D.accent : '');
    if (col && S && S.setColor) c = S.setColor(c, col);
    if (b.dark && S && S.setMode && c.theme && c.theme.base !== 'dark') c = S.setMode(c, 'dark');
    return c;
  }

  // ---------- has the person changed it since? ----------
  function sig(x) {
    const s = JSON.stringify(x, (k, v) => (k === 'id' || k === 'v' || k === 'updatedAt' || k === 'by' || k === 'at' || k === 'rev' ? undefined : typeof v === 'string' && /^(?:[a-z]{3}-[a-z0-9]{4,8}|b[a-z0-9]{6,10})$/.test(v) ? '' : v)) || '';
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36) + ':' + s.length;
  }

  return { brief, chips, tasks, app, site, sig, BANK, DOMAIN, FEATS, COLORS, PLAIN, BRAND, TPL_DOMAIN, SITE_DOMAIN };
});
