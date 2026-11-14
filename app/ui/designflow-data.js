// The Design flow's content (feat/design-flow, app/ui/designflow.js): what you can make, the templates for each kind,
// and a recommended process (the plan) for each. Plain data, no logic, so the words are easy to change.
//   window.TribeDesignData = { KINDS, PLANS, SCREENS, SLIDES, POSTERS, LOGOS, BOARDS, SITES }
// A plan step: { id, t: title, d: one line, act: { k, q?, label } }. act.k is one of
//   open (the design itself) · play (run the app or game) · tweak (its knobs) · inspo (inspiration board, q = search)
//   canvas (a mockup on the design canvas) · whiteboard (a board to think on) · flint (ask Flint, q = the prompt)
//   tribe (share it with the tribe: chat or invite) · tasks (the plan as tasks) · publish (put it online or download it)
(function () {
  'use strict';
  const KINDS = [
    { id: 'website', t: 'Website', d: 'Pages with working buttons, themes and a dark mode', icon: 'globe' },
    { id: 'app', t: 'App', d: 'A web app to grow: to-do, notes, kanban, dashboard and more', icon: 'app' },
    { id: 'game', t: 'Game', d: 'Play-in-the-browser games: platformer, breakout, puzzle, runner', icon: 'gamepad' },
    { id: 'screen', t: 'Screen / UI mockup', d: 'App screens and flows on the design canvas', icon: 'screen' },
    { id: 'slides', t: 'Slides', d: 'A deck to pitch, teach or recap, presented full screen', icon: 'slides' },
    { id: 'poster', t: 'Poster / graphic', d: 'Posters, social posts and flyers', icon: 'poster' },
    { id: 'whiteboard', t: 'Whiteboard', d: 'Sticky notes, arrows and sketches to think together', icon: 'whiteboard' },
    { id: 'logo', t: 'Logo / brand kit', d: 'A mark, a wordmark, colors and type', icon: 'brand' },
  ];
  const s = (id, t, d, k, q, label) => ({ id, t, d, act: k ? { k, q: q || '', label: label || '' } : null });
  const PLANS = {
    game: [
      s('idea', 'Idea', 'One sentence: who you play, what you do, why it is fun.', 'flint', 'help me write a one-line pitch for my game', 'Ask Flint'),
      s('loop', 'Core loop', 'The 10 seconds you repeat: move, jump, collect, avoid. Tune it with the knobs.', 'tweak', '', 'Open the knobs'),
      s('art', 'Art style', 'Collect 6 to 10 pictures on an inspiration board and pick a palette.', 'inspo', 'pixel art game', 'Inspiration board'),
      s('proto', 'Prototype', 'Make one level that is fun with boxes before any art.', 'play', '', 'Play it'),
      s('playtest', 'Playtest with the tribe', 'Watch two friends play without helping. Note where they get stuck.', 'tribe', '', 'Share with the tribe'),
      s('polish', 'Polish', 'Sound, a title screen, screen shake, a best score.', 'flint', 'add a title screen and a best score', 'Ask Flint'),
      s('publish', 'Publish', 'Put it online and send the link.', 'publish', '', 'Publish'),
    ],
    app: [
      s('problem', 'Problem and people', 'Who is it for and what does it save them? Write it in two lines.', 'flint', 'help me describe who my app is for', 'Ask Flint'),
      s('screens', 'Core screens', 'Sketch the 2 or 3 screens people use most.', 'canvas', '', 'Sketch screens'),
      s('look', 'Look and feel', 'Pick colors and type from apps you like.', 'inspo', 'app ui design', 'Inspiration board'),
      s('first', 'First version', 'Start from the starter, set the knobs, change the words.', 'tweak', '', 'Open the knobs'),
      s('try', 'Try it with people', 'Give it to two people and watch. What did they look for first?', 'tribe', '', 'Share with the tribe'),
      s('polish', 'Polish', 'Empty states, errors, a phone check, a dark mode.', 'play', '', 'Check it'),
      s('ship', 'Ship', 'Put it online and tell people.', 'publish', '', 'Publish'),
    ],
    website: [
      s('goal', 'Goal and audience', 'What should a visitor do after 10 seconds? Book, buy, join or read.', 'flint', 'help me write the goal of my website', 'Ask Flint'),
      s('pages', 'Pick the pages', 'Home plus at most three more. Every page earns its place.', 'open', '', 'Open the designer'),
      s('words', 'Words first', 'A headline, one line under it, and the button. Then the rest.', 'open', '', 'Edit the words'),
      s('look', 'Look', 'Pick a theme from sites you like.', 'inspo', 'website design', 'Inspiration board'),
      s('phone', 'Check on a phone', 'Most visitors will be on a phone. Tap every button.', 'open', '', 'Preview'),
      s('feedback', 'Feedback', 'Ask the tribe what the site is about after a 5-second look.', 'tribe', '', 'Share with the tribe'),
      s('publish', 'Publish', 'Download the HTML or publish with the project.', 'publish', '', 'Publish'),
    ],
    screen: [
      s('goal', 'Goal', 'What is this screen for, and what is the one main action?', 'flint', 'help me define the main action of this screen', 'Ask Flint'),
      s('flow', 'Flow', 'Map the steps before and after this screen.', 'whiteboard', '', 'Open a whiteboard'),
      s('wire', 'Wireframe', 'Boxes and words only. Get the order right.', 'open', '', 'Open the canvas'),
      s('style', 'Style', 'Pick colors, type and corner radius from references.', 'inspo', 'mobile app ui', 'Inspiration board'),
      s('hifi', 'High fidelity', 'Real words, real pictures, every state (empty, loading, error).', 'open', '', 'Open the canvas'),
      s('review', 'Review', 'Wire the buttons and click through it with the tribe.', 'tribe', '', 'Share with the tribe'),
      s('handoff', 'Hand off to code', 'Send the frame to the app as code.', 'open', '', 'Open the canvas'),
    ],
    slides: [
      s('message', 'Audience and one message', 'Who is watching, and the one thing they should remember.', 'flint', 'help me find the one message of my talk', 'Ask Flint'),
      s('outline', 'Outline', 'One idea per slide, 6 to 10 slides.', 'open', '', 'Open the slides'),
      s('draft', 'Draft', 'Short titles that say the point. Bullets of a few words.', 'open', '', 'Open the slides'),
      s('visuals', 'Visuals', 'A picture or a number on every other slide.', 'inspo', 'presentation design', 'Inspiration board'),
      s('rehearse', 'Rehearse', 'Present it once out loud with a timer.', 'open', '', 'Present'),
      s('share', 'Share', 'Send it to the tribe or download it.', 'tribe', '', 'Share with the tribe'),
    ],
    poster: [
      s('message', 'Message and place', 'What, when, where, and where the poster will hang or post.', 'flint', 'help me write a poster headline', 'Ask Flint'),
      s('format', 'Size and format', 'Print (A3 or letter) or social (square or story).', 'open', '', 'Open the canvas'),
      s('inspo', 'Inspiration', 'Find 5 posters you like and say why.', 'inspo', 'event poster design', 'Inspiration board'),
      s('layout', 'Layout', 'One big thing, then the details. Readable from three steps away.', 'open', '', 'Open the canvas'),
      s('type', 'Type and color', 'Two fonts at most, one strong color.', 'open', '', 'Open the canvas'),
      s('feedback', 'Feedback', 'Show it to the tribe for five seconds: what did they read?', 'tribe', '', 'Share with the tribe'),
      s('export', 'Export', 'Export a PNG or SVG from the canvas.', 'publish', '', 'Export'),
    ],
    whiteboard: [
      s('question', 'The question', 'Write the question in the middle of the board.', 'open', '', 'Open the board'),
      s('diverge', 'Everyone adds notes', 'Five minutes, one idea per sticky, no judging.', 'tribe', '', 'Invite the tribe'),
      s('group', 'Group', 'Move similar notes together and name each group.', 'open', '', 'Open the board'),
      s('vote', 'Vote', 'Everyone marks their top three.', 'open', '', 'Open the board'),
      s('decide', 'Decide', 'Write down what you will do and who does it.', 'flint', 'summarize what we decided', 'Ask Flint'),
      s('tasks', 'Turn it into tasks', 'Each decision becomes a task with a name on it.', 'tasks', '', 'Add as tasks'),
    ],
    logo: [
      s('brief', 'Brief', 'The name, three words for the feeling, and where the logo will live.', 'flint', 'help me write a brief for my logo', 'Ask Flint'),
      s('inspo', 'Inspiration board', 'Collect marks and wordmarks you like (and some you don\'t).', 'inspo', 'minimal logo design', 'Inspiration board'),
      s('sketch', 'Sketch ten marks', 'Quick and rough. Letters, shapes, a symbol.', 'open', '', 'Open the canvas'),
      s('pick', 'Pick two', 'Show the tribe and keep the two that read best.', 'tribe', '', 'Share with the tribe'),
      s('color', 'Color and type', 'One main color, one neutral, one typeface.', 'open', '', 'Open the canvas'),
      s('test', 'Test small and dark', 'Does it work at 16px and on a dark background?', 'open', '', 'Open the canvas'),
      s('kit', 'Brand kit', 'Export the mark, the wordmark and the colors.', 'publish', '', 'Export'),
    ],
  };

  // Screen templates: Flint's free canvas templates (templates/canvas/*.json), asked for in plain words
  const SCREENS = [
    { id: 'login', t: 'Log in', d: 'Email, password, sign-up link', ask: 'a login screen' },
    { id: 'onboarding', t: 'Onboarding', d: 'Welcome steps for new people', ask: 'an onboarding screen' },
    { id: 'home', t: 'App home', d: 'A mobile home with cards', ask: 'a home screen' },
    { id: 'dashboard', t: 'Dashboard', d: 'Stats, a chart and a list', ask: 'a dashboard screen' },
    { id: 'pricing', t: 'Pricing', d: 'Plans side by side', ask: 'a pricing section' },
    { id: 'profile', t: 'Profile', d: 'A person and their things', ask: 'a profile screen' },
    { id: 'settings', t: 'Settings', d: 'Grouped switches and rows', ask: 'a settings screen' },
    { id: 'checkout', t: 'Checkout', d: 'Cart, total and pay', ask: 'a checkout screen' },
  ];
  // Slides: a Markdown deck (deck.js). {{title}} and {{sub}} come from the prompt.
  const SLIDES = [
    { id: 'pitch', t: 'Pitch', d: 'Problem, idea, demo, ask', theme: 'ember', body: '# {{title}}\n\n{{sub}}\n\n---\n\n## The problem\n\n- Who has it\n- How they cope today\n\n---\n\n## Our idea\n\n- What it does in one line\n- Why now\n\n---\n\n## Demo\n\n- Show the one moment that matters\n\n---\n\n## The ask\n\n- What we need from you\n' },
    { id: 'update', t: 'Project update', d: 'Done, next, blocked', theme: 'campfire', body: '# {{title}}\n\n{{sub}}\n\n---\n\n## Done this week\n\n- \n\n---\n\n## Next\n\n- \n\n---\n\n## Blocked\n\n- \n' },
    { id: 'jam', t: 'Game jam recap', d: 'Theme, what we made, what we learned', theme: 'campfire', body: '# {{title}}\n\n{{sub}}\n\n---\n\n## The theme\n\n- \n\n---\n\n## What we made\n\n- \n\n---\n\n## What we learned\n\n- \n\n---\n\n## Play it\n\n- The link\n' },
    { id: 'lesson', t: 'Lesson', d: 'Goal, three ideas, a quiz', theme: 'paper', body: '# {{title}}\n\n{{sub}}\n\n---\n\n## Today you will learn\n\n- \n\n---\n\n## Idea one\n\n- \n\n---\n\n## Idea two\n\n- \n\n---\n\n## Quick quiz\n\n- \n' },
  ];
  // Canvas templates for posters and logos: plain nodes (server/canvas.js), placed at 0,0. {{title}}, {{sub}}, {{accent}}
  const P = (id, t, x, y, w, h, o) => Object.assign({ id, t, x, y, w, h }, o || {});
  const TX = (c, s, wt, col, o, al) => Object.assign({ tx: { c, f: 'Inter', s, wt, lh: 1.15, al: al || 'left', col } }, o || {});
  // feat/design-site2: posters and logos, redrawn. Colours: {{accent}} (the brand kit's or the prompt's), {{soft}} (a light
  // tint of it), {{deep}} (a dark shade), {{on}} (readable words on the accent). Words sit in auto-layout frames (F), so a
  // long title pushes the lines under it down instead of running over them. `in` names the frame a layer sits in.
  const F = (id, x, y, w, h, lay, o) => Object.assign({ id, t: 'frame', x, y, w, h, fill: '', lay: Object.assign({ d: 'col', g: 12, p: [0, 0, 0, 0], ai: 'start', jc: 'start' }, lay) }, o || {});
  const IN = (parent, n, sz) => Object.assign(n, { in: parent, sz: sz || (n.t === 'text' ? { h: 'fill', v: 'hug' } : { h: 'fill', v: 'hug' }) });
  const HUG = { h: 'hug', v: 'hug' };
  const T = (id, c, size, wt, col, name, extra) => P(id, 'text', 0, 0, 200, 30, TX(c, size, wt, col, Object.assign({ name }, extra || {})));
  const fact = (id, into, label, value, lc, vc) => [IN(into, F(id, 0, 0, 150, 50, { g: 4 }, { name: label }), HUG), IN(id, T(id + 'l', label.toUpperCase(), 12, 700, lc, label + ' label', { mono: true }), HUG), IN(id, T(id + 'v', value, 19, 700, vc, label), HUG)];
  const POSTERS = [
    { id: 'event', t: 'Event poster', d: 'Portrait, a night scene, date and place', w: 600, h: 848, fill: '#12151A', nodes: [
      P('sun', 'ellipse', 250, -150, 500, 500, { fill: '{{accent}}', name: 'Sun' }),
      P('moon', 'ellipse', 48, 150, 140, 140, { fill: '{{soft}}', name: 'Moon' }),
      P('hill', 'ellipse', -220, 320, 680, 320, { fill: '{{deep}}', name: 'Hill' }),
      P('floor', 'rect', 0, 440, 600, 408, { fill: '#12151A', name: 'Ground' }),
      F('body', 0, 440, 600, 408, { g: 14, p: [36, 40, 40, 40], jc: 'between' }, { name: 'Words' }),
      IN('body', F('top', 0, 0, 520, 200, { g: 12 }, { name: 'Title block' })),
      IN('top', T('eb', 'LIVE · ONE NIGHT ONLY', 15, 700, '{{accent}}', 'Eyebrow', { mono: true })),
      IN('top', T('ttl', '{{title}}', 60, 800, '#F8FAFC', 'Title')),
      IN('top', T('sub', '{{sub}}', 21, 500, '#94A3B8', 'Details')),
      IN('body', F('info', 0, 0, 520, 60, { d: 'row', g: 24, jc: 'between' }, { name: 'When and where' })),
      ...fact('f1', 'info', 'When', 'Sat 21 Nov', '#94A3B8', '#F8FAFC'), ...fact('f2', 'info', 'Doors', '7 pm', '#94A3B8', '#F8FAFC'), ...fact('f3', 'info', 'Where', 'The Old Hall', '#94A3B8', '#F8FAFC') ] },
    { id: 'social', t: 'Social square', d: '1080 square for a post', w: 540, h: 540, fill: '{{accent}}', nodes: [
      P('ring', 'ellipse', 290, -150, 400, 400, { fill: '{{deep}}', name: 'Big circle' }),
      P('dot', 'ellipse', 400, 90, 96, 96, { fill: '{{soft}}', name: 'Small circle' }),
      F('body', 0, 0, 540, 540, { g: 14, p: [40, 40, 40, 40], jc: 'end' }, { name: 'Words' }),
      IN('body', T('eb', 'NEW', 14, 700, '{{on}}', 'Tag', { mono: true }), HUG),
      IN('body', T('ttl', '{{title}}', 54, 800, '{{on}}', 'Title')),
      IN('body', T('sub', '{{sub}}', 20, 500, '{{on}}', 'Line')),
      IN('body', F('foot', 0, 0, 460, 24, { d: 'row', g: 12, ai: 'center' }, { name: 'Footer' })),
      IN('foot', P('bar', 'rect', 0, 0, 48, 6, { fill: '{{on}}', name: 'Bar' }), { h: 'fixed', v: 'fixed' }),
      IN('foot', T('at', '@yourname', 15, 700, '{{on}}', 'Handle'), HUG) ] },
    { id: 'flyer', t: 'Flyer', d: 'Letter-size announcement', w: 600, h: 776, fill: '#F8FAFC', nodes: [
      P('top', 'rect', 0, 0, 600, 250, { fill: '{{accent}}', name: 'Band' }),
      P('c1', 'ellipse', 400, -80, 260, 260, { fill: '{{deep}}', name: 'Big circle' }),
      P('c2', 'ellipse', 470, 140, 150, 150, { fill: '{{soft}}', name: 'Small circle' }),
      P('eb', 'text', 40, 40, 300, 24, TX('ANNOUNCEMENT', 15, 700, '{{on}}', { name: 'Eyebrow', mono: true })),
      F('body', 0, 250, 600, 526, { g: 16, p: [36, 40, 40, 40], jc: 'between' }, { name: 'Words' }),
      IN('body', F('tb', 0, 0, 520, 300, { g: 14 }, { name: 'Title block' })),
      IN('tb', T('ttl', '{{title}}', 50, 800, '#12151A', 'Title')),
      IN('tb', T('sub', '{{sub}}', 20, 400, '#475569', 'Text')),
      IN('tb', T('d1', 'When    Saturday 21 November, 7 pm', 17, 600, '#12151A', 'When')),
      IN('tb', T('d2', 'Where   The Old Hall, 12 Main Street', 17, 600, '#12151A', 'Where')),
      IN('tb', T('d3', 'Bring   A friend', 17, 600, '#12151A', 'Bring')),
      IN('body', F('box', 0, 0, 520, 64, { d: 'row', p: [20, 24, 20, 24], jc: 'between', ai: 'center' }, { fill: '#E2E8F0', r: 12, name: 'Contact box' })),
      IN('box', T('ct', 'hello@example.com', 17, 700, '#12151A', 'Email'), HUG), IN('box', T('ws', 'example.com', 17, 700, '#12151A', 'Website'), HUG) ] },
    { id: 'quote', t: 'Quote card', d: 'A line worth sharing, 4:5', w: 540, h: 675, fill: '#F8FAFC', nodes: [
      P('blob', 'ellipse', 330, -120, 330, 330, { fill: '{{soft}}', name: 'Circle' }),
      P('q', 'text', 36, 10, 200, 190, TX('“', 200, 800, '{{accent}}', { name: 'Quote mark' })),
      F('body', 0, 0, 540, 675, { g: 20, p: [40, 40, 44, 40], jc: 'end' }, { name: 'Words' }),
      IN('body', T('ttl', '{{title}}', 42, 700, '#12151A', 'Quote')),
      IN('body', P('bar', 'rect', 0, 0, 64, 6, { fill: '{{accent}}', name: 'Bar' }), { h: 'fixed', v: 'fixed' }),
      IN('body', T('sub', '{{sub}}', 18, 600, '#475569', 'Who said it')) ] },
    { id: 'offer', t: 'Offer', d: 'A sale or a launch with one big number', w: 600, h: 848, fill: '{{soft}}', nodes: [
      P('disc', 'ellipse', 80, 60, 440, 440, { fill: '{{accent}}', name: 'Disc' }),
      P('num', 'text', 80, 190, 440, 180, TX('20%', 150, 800, '{{on}}', { name: 'Big number' }, 'center')),
      P('off', 'text', 80, 370, 440, 40, TX('OFF THIS WEEK', 18, 700, '{{on}}', { name: 'Under the number', mono: true }, 'center')),
      F('body', 0, 520, 600, 328, { g: 14, p: [20, 40, 40, 40], jc: 'end' }, { name: 'Words' }),
      IN('body', T('ttl', '{{title}}', 48, 800, '#12151A', 'Title')),
      IN('body', T('sub', '{{sub}}', 20, 500, '#334155', 'Line')),
      IN('body', F('btn', 0, 0, 160, 48, { d: 'row', p: [13, 22, 13, 22], ai: 'center' }, { fill: '#12151A', r: 24, name: 'Button' }), HUG),
      IN('btn', T('bl', 'Shop now', 17, 700, '#FFFFFF', 'Button label'), HUG) ] },
  ];
  const mark = (id, x, y, size, onDark) => [
    P(id, 'rect', x, y, size, size, { fill: '{{accent}}', r: Math.round(size * 0.28), name: 'Mark', logo: true }),
    P(id + 'i', 'ellipse', x + size * 0.3, y + size * 0.3, size * 0.4, size * 0.4, { fill: onDark ? '#12151A' : '#FFFFFF', name: 'Mark detail', noLogo: true })];
  const LOGOS = [
    { id: 'kit', t: 'Brand kit', d: 'Mark, wordmark, colors and type on one sheet', w: 800, h: 560, fill: '#F8FAFC', nodes: [
      P('lt', 'rect', 40, 40, 352, 170, { fill: '#FFFFFF', stroke: '#E2E8F0', sw: 1, r: 16, name: 'On light' }),
      ...mark('mk', 68, 93, 64, false),
      P('wm', 'text', 150, 104, 226, 44, TX('{{title}}', 30, 800, '#12151A', { name: 'Wordmark', head: true })),
      P('dk', 'rect', 408, 40, 352, 170, { fill: '#12151A', r: 16, name: 'On dark' }),
      ...mark('mk2', 436, 93, 64, true),
      P('wm2', 'text', 518, 104, 226, 44, TX('{{title}}', 30, 800, '#F8FAFC', { name: 'Wordmark on dark', head: true })),
      P('cl', 'text', 40, 238, 300, 18, TX('COLORS', 12, 700, '#64748B', { name: 'Colors label', mono: true })),
      P('c1', 'rect', 40, 264, 220, 96, { fill: '{{accent}}', r: 12, name: 'Main color' }),
      P('c1t', 'text', 54, 332, 190, 18, TX('Main', 13, 700, '{{on}}', { name: 'Main label' })),
      P('c2', 'rect', 272, 264, 112, 96, { fill: '{{deep}}', r: 12, name: 'Deep' }),
      P('c3', 'rect', 396, 264, 112, 96, { fill: '{{soft}}', r: 12, name: 'Soft' }),
      P('c4', 'rect', 520, 264, 112, 96, { fill: '#12151A', r: 12, name: 'Ink' }),
      P('c5', 'rect', 644, 264, 116, 96, { fill: '#E2E8F0', r: 12, name: 'Neutral' }),
      P('tl', 'text', 40, 388, 300, 18, TX('TYPE', 12, 700, '#64748B', { name: 'Type label', mono: true })),
      P('aa', 'text', 40, 408, 110, 80, TX('Aa', 64, 800, '#12151A', { name: 'Type sample' })),
      P('th', 'text', 160, 420, 600, 30, TX('Headings in {{fontName}}, bold', 22, 700, '#12151A', { name: 'Heading sample', head: true })),
      P('tb', 'text', 160, 454, 600, 26, TX('Body text in Inter. Clear, calm and easy to read.', 16, 400, '#475569', { name: 'Body sample' })),
      P('nt', 'text', 40, 516, 720, 22, TX('{{sub}}', 14, 500, '#64748B', { name: 'Note' })) ] },
    { id: 'lockup', t: 'Logo with name', d: 'The mark beside the name, on light and on dark', w: 800, h: 400, fill: '#FFFFFF', nodes: [
      P('dk', 'rect', 400, 0, 400, 400, { fill: '#12151A', name: 'Dark half' }),
      ...mark('mk', 48, 160, 80, false),
      P('wm', 'text', 144, 181, 240, 40, TX('{{title}}', 30, 800, '#12151A', { name: 'Name', sz: HUG })),
      ...mark('mk2', 448, 160, 80, true),
      P('wm2', 'text', 544, 181, 240, 40, TX('{{title}}', 30, 800, '#F8FAFC', { name: 'Name on dark', sz: HUG })) ] },
    { id: 'monogram', t: 'Monogram', d: 'One letter in a shape', w: 500, h: 500, fill: '#12151A', nodes: [
      P('rg', 'ellipse', 80, 80, 340, 340, { fill: '{{deep}}', name: 'Ring' }),
      P('bg', 'ellipse', 100, 100, 300, 300, { fill: '{{accent}}', name: 'Circle' }),
      P('ch', 'text', 100, 158, 300, 184, TX('{{initial}}', 160, 800, '{{on}}', { name: 'Letter' }, 'center')) ] },
    { id: 'badge', t: 'Badge', d: 'A round stamp with the name', w: 500, h: 500, fill: '#F8FAFC', nodes: [
      P('ring', 'ellipse', 60, 60, 380, 380, { fill: '#12151A', name: 'Ring' }),
      P('in', 'ellipse', 84, 84, 332, 332, { fill: '{{accent}}', name: 'Inside' }),
      F('body', 84, 84, 332, 332, { g: 10, p: [0, 44, 0, 44], ai: 'center', jc: 'center' }, { name: 'Words' }),
      IN('body', T('st', '★', 22, 700, '{{on}}', 'Star'), HUG),
      IN('body', P('nm', 'text', 0, 0, 244, 50, TX('{{title}}', 38, 800, '{{on}}', { name: 'Name' }, 'center'))),
      IN('body', T('yr', 'EST. 2026', 15, 700, '{{on}}', 'Year', { mono: true }), HUG) ] },
  ];
  // Whiteboard templates: sticky notes (server/whiteboard.js elements). {{q}} is the question from the prompt.
  const st = (id, x, y, text, fill) => ({ id, t: 'sticky', x, y, w: 180, h: 140, text, fill: fill || '#FFB86B', size: 18 });
  const tx = (id, x, y, text, size) => ({ id, t: 'text', x, y, w: 520, h: 40, text, size: size || 28, color: '#F8FAFC' });
  const BOARDS = [
    { id: 'brainstorm', t: 'Brainstorm', d: 'A question in the middle, ideas around it', els: [tx('q', 260, 40, '{{q}}', 32), st('a', 60, 140, 'Idea'), st('b', 280, 140, 'Idea', '#9AE6B4'), st('c', 500, 140, 'Idea', '#90CDF4'), st('d', 170, 320, 'Idea', '#FBB6CE'), st('e', 390, 320, 'Idea', '#FAF089')] },
    { id: 'retro', t: 'Retro', d: 'Went well, could be better, try next', els: [tx('h1', 40, 40, 'Went well', 24), tx('h2', 300, 40, 'Could be better', 24), tx('h3', 560, 40, 'Try next', 24), st('a', 40, 100, '', '#9AE6B4'), st('b', 300, 100, '', '#FBB6CE'), st('c', 560, 100, '', '#90CDF4')] },
    { id: 'flow', t: 'User flow', d: 'Steps from start to done', els: [tx('q', 40, 40, '{{q}}', 28), st('a', 40, 120, 'Start', '#90CDF4'), { id: 'ar1', t: 'arrow', pts: [[230, 190], [290, 190]], color: '#F8FAFC', sw: 2 }, st('b', 300, 120, 'Step'), { id: 'ar2', t: 'arrow', pts: [[490, 190], [550, 190]], color: '#F8FAFC', sw: 2 }, st('c', 560, 120, 'Done', '#9AE6B4')] },
  ];
  // Website templates: the website designer's 16 (app/ui/sitecfg.js); thumbnails from templates/sites/<id>/thumb.png
  const SITES = [
    ['linkbio', 'Link in bio', 'All your links on one page'], ['cafe', 'Café', 'Menu, hours and where to find you'], ['band', 'Band', 'Tour dates, music, booking'], ['merch', 'Merch shop', 'Products and a buy button'],
    ['portfolio', 'Portfolio', 'Your work with the story'], ['creator', 'Creator', 'Stream schedule and links'], ['service', 'Local business', 'Prices, booking, reviews'], ['wedding', 'Event', 'Date, place, RSVP'],
    ['podcast', 'Podcast', 'Episodes and where to listen'], ['blog', 'Blog', 'Posts and a newsletter'], ['saas', 'Product', 'A startup or app page'], ['gamepage', 'Game page', 'Screens, trailer, wishlist'],
    ['resume', 'Resume', 'Who you are and what you did'], ['nonprofit', 'Nonprofit', 'Mission and a donate button'], ['photography', 'Photography', 'A gallery first'], ['comingsoon', 'Coming soon', 'A waitlist'],
    ['conference', 'Conference', 'Schedule, speakers, tickets'], ['menu', 'Restaurant menu', 'The menu first, with prices'], ['course', 'Class or course', 'What you learn, weeks, sign-up'], ['club', 'Club or group', 'When you meet and how to join'],
  ].map(([id, t, d]) => ({ id, t, d }));

  window.TribeDesignData = { KINDS, PLANS, SCREENS, SLIDES, POSTERS, LOGOS, BOARDS, SITES };
})();
