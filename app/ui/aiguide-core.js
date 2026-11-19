// What an AI needs to design well here (feat/ai-guides, docs/ai/README.md). One source for every path an AI takes:
//   - the master guides in docs/ai/ (scripts/dev/ai-guides.js writes their catalogues and rules from this file),
//   - the MCP tools (server/aiguides.js: get_guide, project_brief, site_catalog, site_view, site_check, app_*),
//   - "Make it beautiful" (the request an agent takes), the copy-and-paste bridge's pack, and Flint's local model.
// No DOM, no network, no dependencies: the browser has it as window.TribeAIGuide, the server and the tests require it.
//
//   RULES[kind]                         the design guidance: good, avoid, checklist, never, recipes ('site' | 'app' | 'motion')
//   OPS[kind]                           the steps an agent may propose, one example each ('site' | 'app')
//   essentials(kind) -> markdown        the guide's core, for a pasted pack (about 60 lines)
//   trimmed(kind) -> text               a few lines for a small local model
//   catalog(kind, lib) -> object        what exists, read from the app's own data (lib = sitecfg | appcreator-core | motionkit)
//   catalogMd(kind, lib, part) -> md    the same as the tables in the guides
//   lint(kind, ops, design, lib)        notes on steps that would be skipped or quietly changed, each with a corrected example
//   hint(kind, op) -> text              the example for one step
//   siteText(cfg, S, o) / appText(doc, A, o)   the design as a person would read it on the page, in plain text
//   siteSummary(cfg, S) / appSummary(doc, A)   the structure with ids, small
//   brief(data, o) -> markdown          the project brief from gathered facts (server/aiguides.js gathers them)
//   request(kind, o) -> text            what an agent is sent: the brief, the ask, the workflow
//   folderBlock(data) / mergeBlock(old, block)   the marked block in a project folder's AGENTS.md
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeAIGuide = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const short = (t, n) => { t = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); return t.length > (n || 80) ? t.slice(0, (n || 80) - 1) + '…' : t; };
  const NAMES = { site: 'website', app: 'app', motion: 'motion' };
  const kindOf = k => (/^(site|website|web)$/i.test(k) ? 'site' : /^(app|phone|mobile)$/i.test(k) ? 'app' : /^motion/i.test(k) ? 'motion' : '');

  // ---------- the tools, in the order to call them ----------
  const TOOLS = {
    site: { brief: 'project_brief', guide: 'get_guide', catalog: 'site_catalog', read: 'site_read', view: 'site_view', check: 'site_check', propose: 'site_propose', comments: 'site_comments' },
    app: { brief: 'project_brief', guide: 'get_guide', catalog: 'app_catalog', read: 'app_read', view: 'app_view', check: 'app_check', propose: 'app_propose' },
    motion: { brief: 'project_brief', guide: 'get_guide', list: 'motion_list', read: 'motion_read', write: 'motion_write' },
  };

  // ---------- the steps (ops), one example each. Ids in <angle brackets> come from site_read / app_read. ----------
  const OPS = {
    site: [
      { op: 'add', what: 'Add a section. props are words only and must use the keys that section has (site_catalog lists them).', ex: { op: 'add', type: 'list', variant: 'menu', after: '<block id>', props: { title: 'Menu', items: [{ title: 'Flat white', meta: '$4', text: 'Double shot, steamed milk' }] } } },
      { op: 'text', what: 'Change words. path is a key of the section (title, text, items.0.title, buttons.0.label, plans.1.price).', ex: { op: 'text', block: '<block id>', path: 'title', value: 'Coffee roasted on Mill Street' } },
      { op: 'variant', what: 'Change a section\'s layout to another of its own variants.', ex: { op: 'variant', block: '<block id>', variant: 'split' } },
      { op: 'style', what: 'A section\'s background ("" plain, card, accent, ink) and spacing ("" normal, s tight, l roomy).', ex: { op: 'style', block: '<block id>', bg: 'card', pad: 'l' } },
      { op: 'move', what: 'Move a section: up, down, top, bottom or a place number from 0.', ex: { op: 'move', block: '<block id>', to: 'up' } },
      { op: 'remove', what: 'Take a section out. Say why in the note.', ex: { op: 'remove', block: '<block id>' } },
      { op: 'link', what: 'Point a button or entry somewhere. path is the button (buttons.0, button, items.2); kind is page, section, url (https only) or email.', ex: { op: 'link', block: '<block id>', path: 'buttons.0', kind: 'section', to: '<block id of the target>' } },
      { op: 'item', what: 'Entries of a list: do is add, dup, del, up or down; path is the list (items, plans, buttons), i the entry.', ex: { op: 'item', block: '<block id>', path: 'items', i: 0, do: 'add' } },
      { op: 'illustration', what: 'Fill an empty picture slot with a built-in drawing in the site\'s colours. path "" for the section\'s own picture, items.1 for an entry\'s.', ex: { op: 'illustration', block: '<block id>', path: '', name: 'cafe' } },
      { op: 'alt', what: 'Describe a picture for people who cannot see it.', ex: { op: 'alt', block: '<block id>', path: '', value: 'The counter at Bean and Gone with the espresso machine' } },
      { op: 'show', what: 'Hide a section (or one part of it, with path) on some screen sizes: phone, tablet, desktop. hide "" shows it everywhere.', ex: { op: 'show', block: '<block id>', hide: 'phone' } },
      { op: 'estyle', what: 'One element inside a section: sz s|l|xl, col accent|muted|ink, al left|center|right, b and i true|false.', ex: { op: 'estyle', block: '<block id>', path: 'title', set: { sz: 'l', al: 'center' } } },
      { op: 'entrance', what: 'A quiet entrance as the section scrolls in: fade, rise or "" for none.', ex: { op: 'entrance', block: '<block id>', value: 'fade' } },
      { op: 'theme', what: 'The whole look at once: colours, fonts and corners of a named look. The site keeps the light or dark version it had: follow with mode to switch.', ex: { op: 'theme', preset: 'paper' } },
      { op: 'palette', what: 'Only the colours of a named look; fonts and corners stay.', ex: { op: 'palette', preset: 'sand' } },
      { op: 'accent', what: 'The one main colour (buttons, links). It is adjusted until it reads on the background.', ex: { op: 'accent', color: '#B4532C' } },
      { op: 'fonts', what: 'A font pair: one display face for headings, one for reading.', ex: { op: 'fonts', pair: 'editorial' } },
      { op: 'mode', what: 'The dark or the light version of the look.', ex: { op: 'mode', value: 'dark' } },
      { op: 'space', what: 'Spacing for the whole site: compact, normal or roomy.', ex: { op: 'space', value: 'roomy' } },
      { op: 'radius', what: 'Corner radius in pixels, 0 to 28.', ex: { op: 'radius', value: 6 } },
      { op: 'buttons', what: 'Button shape for the whole site: solid, outline, pill or soft.', ex: { op: 'buttons', value: 'pill' } },
      { op: 'page', what: 'Add a page. Contact, About, Pricing and FAQ titles get fitting sections to start from.', ex: { op: 'page', title: 'Menu' } },
      { op: 'rename', what: 'Rename a page (by its id, slug or title).', ex: { op: 'rename', page: 'About', title: 'Our story' } },
      { op: 'name', what: 'The site\'s name.', ex: { op: 'name', value: 'Bean and Gone' } },
      { op: 'seo', what: 'The title and the sentence search results and link previews show (description up to about 155 characters).', ex: { op: 'seo', title: 'Bean and Gone · Coffee on Mill Street', description: 'Small-batch coffee roasted on Mill Street. Open every day from 7.' } },
    ],
    app: [
      { op: 'kit', what: 'Add a ready-made screen or flow (settings, onboarding, profile …). The fastest way to a complete screen.', ex: { op: 'kit', kit: 'settings' } },
      { op: 'screen.add', what: 'Add an empty screen.', ex: { op: 'screen.add', name: 'Menu' } },
      { op: 'screen.rename', what: 'Rename a screen.', ex: { op: 'screen.rename', screen: '<screen id>', name: 'Orders' } },
      { op: 'screen.move', what: 'Reorder a screen (place number from 0).', ex: { op: 'screen.move', screen: '<screen id>', to: 1 } },
      { op: 'start', what: 'Which screen the app opens on.', ex: { op: 'start', screen: '<screen id>' } },
      { op: 'block.add', what: 'Add a part to a screen (at = place number; left out, it goes above the tab bar).', ex: { op: 'block.add', screen: '<screen id>', type: 'list' } },
      { op: 'block.move', what: 'Move a part up (-1) or down (1).', ex: { op: 'block.move', block: '<block id>', dir: -1 } },
      { op: 'block.dup', what: 'Copy a part.', ex: { op: 'block.dup', block: '<block id>' } },
      { op: 'block.remove', what: 'Take a part out. Say why in the note.', ex: { op: 'block.remove', block: '<block id>' } },
      { op: 'text', what: 'Change words. path is a key of the part that already holds words (title, sub, label, items.0.title).', ex: { op: 'text', block: '<block id>', path: 'title', value: 'Good morning, Maya' } },
      { op: 'icon', what: 'Change an icon (names: app_catalog).', ex: { op: 'icon', block: '<block id>', path: 'items.0.icon', value: 'coffee' } },
      { op: 'illus', what: 'Change a built-in picture (names: app_catalog).', ex: { op: 'illus', block: '<block id>', path: 'illus', value: 'coffee' } },
      { op: 'item.add', what: 'Entries of a list: item.add, item.dup, item.remove, item.up, item.down. path names the entry.', ex: { op: 'item.add', block: '<block id>', path: 'items.0' } },
      { op: 'item.dup', what: 'Copy an entry.', ex: { op: 'item.dup', block: '<block id>', path: 'items.0' } },
      { op: 'item.remove', what: 'Remove an entry.', ex: { op: 'item.remove', block: '<block id>', path: 'items.1' } },
      { op: 'item.up', what: 'Move an entry up.', ex: { op: 'item.up', block: '<block id>', path: 'items.1' } },
      { op: 'item.down', what: 'Move an entry down.', ex: { op: 'item.down', block: '<block id>', path: 'items.0' } },
      { op: 'link', what: 'A tap goes to a screen. path "" for the part itself (a button), items.2 for one entry. how: push, sheet, fade or morph.', ex: { op: 'link', block: '<block id>', path: '', to: '<screen id>', how: 'push' } },
      { op: 'unlink', what: 'Remove a link.', ex: { op: 'unlink', block: '<block id>', path: '' } },
      { op: 'tabbar', what: 'Add a tab bar across the main screens.', ex: { op: 'tabbar' } },
      { op: 'preset', what: 'A whole named look: colour, mode, type, corners, spacing, motion.', ex: { op: 'preset', id: 'meadow' } },
      { op: 'theme', what: 'Single controls of the look: accent, mode light|dark, radius sharp|soft|round|pill, font, density compact|regular|roomy, icons thin|regular|bold, motion calm|standard|snappy, surface neutral|warm|cool|tinted.', ex: { op: 'theme', set: { mode: 'dark', accent: '#2F9E6E' } } },
      { op: 'rename', what: 'The app\'s name.', ex: { op: 'rename', name: 'Bean and Gone' } },
    ],
  };
  const opOf = (kind, op) => (OPS[kindOf(kind)] || []).find(x => x.op === op) || null;
  const exOf = x => JSON.stringify(x.ex);
  function hint(kind, op) {
    const k = kindOf(kind), x = opOf(k, op);
    if (x) return `Example: ${exOf(x)}`;
    return `Steps are: ${(OPS[k] || []).map(o => o.op).join(', ')}.`;
  }

  // ---------- how to make it good ----------
  // recipes: which sections, in which layout, fit which kind of site. Every [type, variant] is checked against the app's
  // own list by scripts/dev/ai-guides.js --check, so a recipe can never name a layout that is gone.
  const RULES = {
    site: {
      start: [
        'Read the project brief first. Decide in one sentence who visits this site and the one thing they should do there (book, buy, visit, sign up, write). Every section either helps that or goes.',
        'Pick the kind of site from the brief, then a recipe below. Change it to fit: a recipe is a starting order, not a template.',
        'At least one section must be something only this project has: its menu, its prices, its dates, its hours, its story, its numbers.',
      ],
      recipes: [
        { kind: 'A place people visit (café, shop, salon, studio)', why: 'People want to know what you sell, when you are open and where you are.', blocks: [['hero', 'split'], ['list', 'menu'], ['info', 'columns'], ['gallery', 'grid'], ['testimonials', 'quotes'], ['cta', 'accent'], ['footer', 'columns']] },
        { kind: 'A product or an app', why: 'Say what it does, show it working, answer the price question.', blocks: [['hero', 'split'], ['logos', 'row'], ['features', 'alternating'], ['steps', 'row'], ['pricing', 'cards'], ['faq', 'list'], ['cta', 'accent'], ['footer', 'columns']] },
        { kind: 'A portfolio or a studio', why: 'The work is the page. Words stay short.', blocks: [['hero', 'minimal'], ['gallery', 'masonry'], ['text', 'two'], ['testimonials', 'spotlight'], ['contact', 'simple'], ['footer', 'minimal']] },
        { kind: 'A service (trades, coaching, freelance)', why: 'Trust first, then how it works, then a way to ask.', blocks: [['hero', 'center'], ['features', 'ticks'], ['steps', 'stack'], ['testimonials', 'cards'], ['pricing', 'table'], ['contact', 'form'], ['footer', 'simple']] },
        { kind: 'An event, a band, a podcast', why: 'What, when, where, then a way to follow.', blocks: [['hero', 'cover'], ['list', 'rows'], ['embed', 'wide'], ['newsletter', 'card'], ['footer', 'simple']] },
        { kind: 'A cause or a community', why: 'Why it matters, proof, who is behind it, how to join.', blocks: [['hero', 'accent'], ['stats', 'big'], ['text', 'highlight'], ['team', 'grid'], ['cta', 'split'], ['footer', 'columns']] },
        { kind: 'A person (résumé, about me)', why: 'Who, what they have done, how to reach them.', blocks: [['hero', 'minimal'], ['timeline', 'line'], ['features', 'list'], ['contact', 'simple'], ['footer', 'minimal']] },
        { kind: 'One link for a bio', why: 'One screen, nothing to scroll past.', blocks: [['links', 'stack']] },
      ],
      good: {
        Layout: [
          'Five to eight sections on the home page. More is a second page (op page).',
          'No two neighbours with the same layout. Alternate: words beside a picture, then a list, then a band of colour.',
          'Use the layout that fits the content: a menu or dates are a list, not feature cards; numbers are stats; a story is text or a timeline.',
          'One hero per page. Other pages start with hero minimal.',
        ],
        Type: [
          'One font pair for the whole site (op fonts). A serif display face for warm, crafted, food, editorial; a grotesk for products and tools; a loud face only for events and bold brands.',
          'The brand kit\'s fonts win when the brief has them.',
          'Hero title: 3 to 8 words that say what this is, in the project\'s own words. Hero text: one or two sentences. Section titles: 2 to 5 words.',
          'A paragraph is at most three sentences. Longer becomes a list, steps or an FAQ.',
          'Make at most one thing per section bigger or coloured (op estyle). Emphasis everywhere is emphasis nowhere.',
        ],
        Spacing: [
          'Set the rhythm once (op space): roomy for few words and big pictures, compact for menus, prices and reference pages.',
          'Keep section spacing the same down the page. At most one section is tighter or roomier (op style, pad).',
          'Separate sections with background steps: plain, card, plain. One accent or ink band per page, usually the call to action. Never two loud bands in a row.',
        ],
        Colour: [
          'One accent colour. Take it from the brand kit; with none, pick one that fits the trade and leave the rest to the look\'s neutrals.',
          'Words need a contrast of 4.5 to 1 on their background, the accent 3 to 1. site_check reports both.',
          'Choose the look (op theme) for the mood first, then the light or dark version (op mode), then set the accent. Dark looks suit evenings, music, games and tools; light looks suit food, shops, services and anything read in daylight.',
        ],
        Pictures: [
          'You cannot upload pictures. Fill an empty picture slot with a built-in illustration (op illustration) or choose a layout that needs none (hero minimal, center or accent).',
          'Give every picture a description (op alt) that says what is in it.',
          'In your note, list the pictures the person should add (the shop front, the team, the product).',
        ],
        Words: [
          'Write from the brief\'s facts: the real name, what it sells, where, when, for whom, in the brand kit\'s voice.',
          'A fact you do not have (a price, an address, opening hours, a quote) is never made up. Leave the section out, or write plainly what belongs there and name it in your note as something the person fills in.',
          'Buttons say what happens: "See the menu", "Book a table", "Write to us". Every button is linked (op link).',
          'No example words left behind. site_check lists sections that still have them.',
        ],
        Phones: [
          'On a phone everything stacks into one column, so length is the cost. Lists of more than six entries, more than three price plans or a long hero text make a long scroll.',
          'Use pricing cards rather than a table when there are more than four rows. Avoid words longer than about 30 letters.',
          'Hide what is only decoration on phones (op show, hide "phone"). Never hide the way to contact, buy or visit.',
          'Read site_view with device "phone" before you finish.',
        ],
        Access: [
          'Every picture has a description, every button says where it goes, every section has a title.',
          'Set the search title and description (op seo).',
        ],
      },
      avoid: [
        'The generic page: a centred hero, three feature cards, a call to action. If your plan is that, start again from the brief.',
        'Placeholder words: lorem ipsum, "Welcome to our website", "Your tagline here", the example words a new section comes with.',
        'Walls of text, and sections that repeat what the one above said.',
        'More than one accent colour, or a different background on every section.',
        'Invented testimonials, logos, numbers, prices, awards or team members.',
        'Buttons that go nowhere, forms that send nowhere, an empty gallery.',
      ],
      checklist: [
        'site_check returns no "fix" items you can fix (links, forms, descriptions, contrast, empty sections).',
        'No section has example words; no fact is invented; what is missing is named in the note.',
        'The first screen says what this is and has one clear button.',
        'site_view on "phone": nothing important is hidden, no list is endless.',
        'One accent colour, one font pair, an even spacing rhythm.',
        'The search title and description are set.',
        'Your note says in two sentences what you changed and why, then what the person should add.',
      ],
      never: [
        'Publish, download or export the site. A person does that.',
        'Edit the files in the project folder\'s site/ directory while TribeCode is connected: they are written from the design and your edit would be lost or held back. Propose steps instead.',
        'Add scripts, trackers, embeds from addresses the person did not give, or your own CSS.',
        'Work in a project you were not asked about, or copy anything from another project.',
        'Invent facts about the project, or leave a made-up fact for the person to catch.',
        'Approve your own proposal, or propose again and again to get past a "no".',
      ],
    },
    app: {
      start: [
        'Read the project brief first. Say in one sentence what a person does with this app in their first minute. That is the first screen.',
        'Three to six screens make a believable app: where you land, the thing you do, the detail, something about you, settings. Add ready-made flows with op kit before you build a screen by hand.',
        'Every screen must be reachable from the first one, and every button must go somewhere (op link).',
      ],
      recipes: [
        { kind: 'Tracker (habits, fitness, money)', why: 'Today first, then history, then settings.', blocks: [['header'], ['stats'], ['checklist'], ['chart'], ['tabs']] },
        { kind: 'Shop or menu (café, store, booking)', why: 'Browse, look closer, order.', blocks: [['header'], ['search'], ['cards'], ['list'], ['button'], ['tabs']] },
        { kind: 'Feed or community', why: 'What is new, then a way to add to it.', blocks: [['nav'], ['stories'], ['feed'], ['tabs']] },
        { kind: 'Tool (timer, calculator, notes)', why: 'One job on one screen, big controls.', blocks: [['nav'], ['timer'], ['segmented'], ['button']] },
        { kind: 'Settings screen', why: 'Grouped rows people already know.', blocks: [['nav'], ['settings'], ['toggles'], ['button']] },
      ],
      good: {
        Layout: [
          'One job per screen. A screen starts with a top bar or a big title, never both.',
          'One main button per screen, at the bottom, where a thumb reaches. Other actions are quiet.',
          'A tab bar has two to five tabs and only the screens people return to. Settings is a tab or sits behind the profile.',
          'Lists show three to six entries in a design. Put the most telling ones first.',
        ],
        Type: [
          'Pick one font for the app (op theme, font). Rounded and friendly for family, food and health; clean for tools and money; bold for games and events.',
          'Titles are two to four words. Row labels are one line. Nothing a thumb must scroll sideways to read.',
        ],
        Spacing: [
          'Choose density once (op theme, density): roomy for calm and few items, compact for data and lists.',
          'Keep the same corners everywhere (radius). Mixed corners look unfinished.',
        ],
        Colour: [
          'One accent, from the brand kit when there is one. It marks what can be tapped and what is on.',
          'Dark mode is op theme { set: { mode: "dark" } }: one step changes every screen. Check the accent still reads; brighten it if not.',
          'Start from a named look (op preset) that fits the mood, then set the accent.',
        ],
        Pictures: [
          'You cannot upload pictures. Use the built-in pictures and icons (op illus, op icon) and name what the person should replace.',
          'Icons in one row of a list come from the same family of meaning: all food, all actions.',
        ],
        Words: [
          'Fill screens with data that fits this project: its own products, names and numbers from the brief, never "Item 1" or "Lorem".',
          'Example people and amounts must look like examples (Maya, $4.50), not like real customers of the project.',
          'Buttons say what happens: "Add to order", "Start timer".',
        ],
        Flows: [
          'Lists and cards open a detail screen (how: push). Short tasks open a sheet (how: sheet). Tabs fade.',
          'Settings needs a way in (a tab, or a row or icon on the profile) and a way back (a top bar).',
          'Paywall, sign-in and checkout screens are drawings. Never claim a payment or an account works.',
        ],
        Access: [
          'Tap targets are rows and buttons, not single words. Text on the accent must read (contrast 4.5 to 1).',
        ],
      },
      avoid: [
        'A screen nothing leads to, or a button that goes nowhere. app_check lists both.',
        'Ten parts on one screen. Split it.',
        'A tab bar with one tab, or with more than five.',
        'Placeholder data ("Title", "Item", "Lorem ipsum") and parts left exactly as they were added.',
        'Changing the look screen by screen. The look is one setting for the whole app.',
      ],
      checklist: [
        'app_check returns nothing you can fix: every screen is reachable, every button goes somewhere, no part is empty.',
        'The first screen (start) is the one a new person should see.',
        'Words and example data fit the project; nothing claims payments or sign-in work.',
        'One accent, one font, one density; dark mode still reads if you switched it.',
        'Your note says what you changed and why, then what the person should add or decide.',
      ],
      never: [
        'Export, publish or build the app. A person does that.',
        'Remove screens (you cannot), switch between the iPhone and Android look, or add working features: a person does those in App Creator.',
        'Edit the files in the project folder\'s app-web/ directory while TribeCode is connected: they are written from the design.',
        'Work in a project you were not asked about, or copy anything from another project.',
        'Invent facts about the project, real-looking customers or prices nobody gave you.',
        'Approve your own proposal.',
      ],
    },
    motion: {
      start: [
        'Read the project brief first. A motion graphic shows one idea in a few seconds: one product moment, one number, one line.',
        'Start from a template (motion_write with { template }) and change its words and colours. Build states by hand only when no template fits.',
      ],
      recipes: [],
      good: {
        Shape: [
          'Four to eight states. Each state is on screen for at least two beats so it can be read.',
          'One shape morphs through every state; it is never cut. Let neighbouring states differ in size or roundness so the morph shows.',
          'Put states and acts on the beat (whole or half beats). Leave the last state a bar to rest before the loop.',
        ],
        Words: [
          'Words in a state are three to five words. Real names and numbers from the brief; never placeholder text.',
        ],
        Colour: [
          'The theme has five colours: bg, ink, paper, accent, muted. Use the brand kit\'s accent. Fill states with ink or paper and keep accent for the one state that matters.',
        ],
        Feel: [
          'Pick one feel that fits the brand (calm, crisp, playful …) and keep the camera gentle (strength at most 0.6) unless the piece is a bold promo.',
          'Loops must close: keep loop on and end where you began.',
        ],
      },
      avoid: [
        'More than eight states, or states shorter than a beat.',
        'A different colour on every state.',
        'Cursor acts that click nothing: every click or drag lands on the shape of its own state.',
      ],
      checklist: [
        'motion_read after writing: the state count, bars and tempo are what you meant (unknown kinds are dropped silently).',
        'Every word is real and short; the accent is the brand\'s.',
        'The piece loops cleanly and is under about 15 seconds.',
      ],
      never: [
        'Overwrite a motion graphic you were not asked to change: use a new key for a new piece.',
        'Add music or pictures from addresses the person did not give.',
        'Export or publish it. A person does that.',
      ],
    },
  };

  const md = {
    list: a => a.map(x => `- ${x}`).join('\n'),
    good: k => Object.entries(RULES[k].good).map(([h, a]) => `**${h}**\n${md.list(a)}`).join('\n\n'),
  };
  // the guide's core for a pasted pack: enough to do good work, small enough for a free chat
  function essentials(kind) {
    const k = kindOf(kind), R = RULES[k]; if (!R) return '';
    const one = a => a.slice(0, 2);
    return [`## How to make this ${NAMES[k] === 'motion' ? 'motion graphic' : NAMES[k]} good (TribeCode's ${NAMES[k]} guide, in short)`, '',
      md.list(R.start), '',
      ...Object.entries(R.good).map(([h, a]) => `- **${h}:** ${one(a).join(' ')}`), '',
      '**Avoid:** ' + R.avoid.slice(0, 4).join(' '), '',
      '**Before you answer, check:** ' + R.checklist.slice(0, 5).join(' '), '',
      '**Never:** ' + R.never.filter(x => !/folder|Approve|proposal/.test(x)).slice(0, 3).join(' ')].join('\n');
  }
  // a few lines for a small local model that only chooses commands
  function trimmed(kind) {
    const k = kindOf(kind);
    if (k === 'app') return 'Design rules: one job per screen; one main button; every button goes somewhere; one accent colour; words and example data that fit this project, never placeholders; do not invent facts.';
    if (k === 'site') return 'Design rules: say what this is in the first line; one accent colour and one font pair; even spacing; short paragraphs; every button linked; words from the project\'s own facts, never placeholders; do not invent facts.';
    return '';
  }

  // ---------- what exists, from the app's own data ----------
  const keysOf = v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : []);
  function shape(props) {   // { title, items: [{ title, text }] } as "title, items[title, text]"
    return keysOf(props).map(k => { const v = props[k]; if (Array.isArray(v)) { const f = v[0]; return `${k}[${f && typeof f === 'object' ? keysOf(f).filter(x => x !== 'link').join(', ') : 'words'}]`; } if (v && typeof v === 'object') return k === 'link' ? '' : `${k}{${keysOf(v).filter(x => x !== 'link').join(', ')}}`; return k; }).filter(Boolean).join(', ');
  }
  function catalog(kind, lib) {
    const k = kindOf(kind);
    if (k === 'site') {
      const S = lib;
      return {
        blocks: S.TYPES.map(t => ({ type: t, label: S.BLOCKS[t].label, group: (S.CATS || {})[t] || '', variants: S.BLOCKS[t].variants.slice(), props: shape(S.BLOCKS[t].make('')) })),
        looks: Object.entries(S.PRESETS).map(([id, p]) => ({ id, name: p.name, mode: S.contrast(p.colors.bg, '#000000') < 4 ? 'dark' : 'light', accent: p.colors.accent, bg: p.colors.bg, fonts: `${p.fonts.display} + ${p.fonts.body}`, radius: p.radius })),
        fonts: Object.entries(S.FONT_PAIRS).map(([id, f]) => ({ id, name: f.name, display: f.display, body: f.body })),
        illustrations: Object.entries(S.ILLUS || {}).map(([id, i]) => ({ id, name: i.name })),
        icons: (S.ICON_NAMES || []).slice(),
        steps: OPS.site.map(o => ({ op: o.op, what: o.what, example: o.ex })),
      };
    }
    if (k === 'app') {
      const A = lib, B = A.BLOCKS;
      let fresh = {}; try { const d = A.blank('x'); A.BLOCK_TYPES.forEach(t => { try { const r = A.apply(d, { op: 'block.add', screen: d.screens[0].id, type: t }); const b = r.doc.screens[0].blocks.find(x => x.type === t && !d.screens[0].blocks.some(y => y.id === x.id)); if (b) fresh[t] = shape(b.props); } catch {} }); } catch { fresh = {}; }
      return {
        parts: A.BLOCK_TYPES.map(t => ({ type: t, label: B[t].label, group: B[t].group || '', props: fresh[t] || '' })),
        kits: Object.entries(A.KITS).map(([id, x]) => ({ id, title: x.title || id, summary: x.summary || '' })),
        looks: A.PRESETS.map(p => ({ id: p.id, name: p.name, mode: p.theme.mode, accent: p.theme.accent, font: p.theme.font, radius: p.theme.radius, density: p.theme.density })),
        fonts: Object.entries(A.FONTS).map(([id, f]) => ({ id, name: f.name })),
        icons: (A.ICON_NAMES || []).slice(), pictures: (A.ILL_NAMES || []).slice(),
        templates: (A.templateList ? A.templateList() : []).map(t => ({ id: t.id, title: t.title, group: t.cat || '', summary: t.summary || '' })),
        steps: OPS.app.map(o => ({ op: o.op, what: o.what, example: o.ex })),
      };
    }
    if (k === 'motion') {
      const K = lib, list = (K.LIST || []).map(x => (typeof x === 'string' ? x : x.id));
      const cats = {}; list.forEach(id => { const t = (K.TEMPLATES || {})[id] || {}; const c = t.cat || 'other'; (cats[c] = cats[c] || []).push(id); });
      return { kinds: Object.keys(K.KINDS || {}), feels: (K.FEEL_LIST || []).map(x => (typeof x === 'string' ? x : x.id)), templates: list, groups: cats, themes: Object.keys(K.THEMES || {}), aspects: Array.isArray(K.ASPECTS) ? K.ASPECTS.map(x => (typeof x === 'string' ? x : x.id || x.name)) : Object.keys(K.ASPECTS || {}) };
    }
    return {};
  }
  const cell = v => String(v == null ? '' : v).replace(/\|/g, '/').replace(/\n/g, ' ');
  const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n');
  const code = a => a.map(x => '`' + x + '`').join(', ');
  // one catalogue section of a guide, as markdown (part: blocks | looks | fonts | pictures | parts | kits | templates | steps | recipes | …)
  function catalogMd(kind, lib, part) {
    const k = kindOf(kind), C = lib ? catalog(k, lib) : {}, R = RULES[k];
    if (part === 'steps') return (OPS[k] || []).map(o => `- \`${o.op}\`: ${o.what}\n  \`${exOf(o)}\``).join('\n');
    if (part === 'good') return md.good(k);
    if (part === 'start') return md.list(R.start);
    if (part === 'avoid') return md.list(R.avoid);
    if (part === 'checklist') return R.checklist.map(x => `- [ ] ${x}`).join('\n');
    if (part === 'never') return md.list(R.never);
    if (part === 'essentials') return essentials(k);
    if (part === 'recipes') return k === 'site'
      ? table(['Kind of site', 'Sections, in order (type · layout)', 'Why'], R.recipes.map(r => [r.kind, r.blocks.map(b => `${b[0]} · ${b[1]}`).join(' → '), r.why]))
      : table(['Kind of screen', 'Parts, in order', 'Why'], R.recipes.map(r => [r.kind, r.blocks.map(b => b[0]).join(' → '), r.why]));
    if (k === 'site') {
      if (part === 'blocks') return table(['type', 'What it is', 'Layouts (variant)', 'Words it holds (props)'], C.blocks.map(b => [`\`${b.type}\``, b.label, b.variants.join(', '), b.props]));
      if (part === 'looks') return table(['preset', 'Name', 'Mode', 'Accent', 'Fonts', 'Corners'], C.looks.map(l => [`\`${l.id}\``, l.name, l.mode, l.accent, l.fonts, l.radius]));
      if (part === 'fonts') return C.fonts.map(f => `\`${f.id}\` (${f.display === f.body ? f.display : `${f.display} + ${f.body}`})`).join(', ');
      if (part === 'pictures') return C.illustrations.map(i => `\`${i.id}\` (${i.name.toLowerCase()})`).join(', ');
    }
    if (k === 'app') {
      if (part === 'parts') { const g = {}; C.parts.forEach(p => (g[p.group || 'Other'] = g[p.group || 'Other'] || []).push(p)); return table(['Group', 'Parts (type: what it is)'], Object.entries(g).map(([n, a]) => [n, a.map(p => `\`${p.type}\` ${p.label.toLowerCase()}`).join(', ')])); }
      if (part === 'kits') return C.kits.map(x => `\`${x.id}\``).join(', ');
      if (part === 'looks') { const by = { light: [], dark: [] }; C.looks.forEach(l => (by[l.mode] || by.light).push(`\`${l.id}\``)); return `Light: ${by.light.join(', ')}\n\nDark: ${by.dark.join(', ')}`; }
      if (part === 'fonts') return C.fonts.map(f => `\`${f.id}\` (${f.name})`).join(', ');
      if (part === 'pictures') return `Pictures (op illus): ${code(C.pictures)}\n\nIcons (op icon): ${code(C.icons)}`;
      if (part === 'templates') { const g = {}; C.templates.forEach(t => (g[t.group || 'Other'] = g[t.group || 'Other'] || []).push(t)); return Object.entries(g).map(([n, a]) => `- ${n}: ${a.map(t => `\`${t.id}\``).join(', ')}`).join('\n'); }
    }
    if (k === 'motion') {
      if (part === 'kinds') return code(C.kinds);
      if (part === 'feels') return code(C.feels);
      if (part === 'templates') return Object.entries(C.groups).map(([n, a]) => `- ${n}: ${a.map(t => `\`${t}\``).join(', ')}`).join('\n');
      if (part === 'themes') return `Themes: ${code(C.themes)}. Aspects: ${code(C.aspects)}.`;
    }
    return '';
  }

  // ---------- notes on steps before they are tried: what would be skipped or quietly changed, with a corrected example ----------
  function lint(kind, ops, design, lib) {
    const k = kindOf(kind), out = [], known = new Set((OPS[k] || []).map(o => o.op));
    const note = (i, o, why, fix) => out.push({ step: i + 1, op: o && typeof o.op === 'string' ? o.op.slice(0, 20) : '', why, ...(fix ? { example: fix } : {}) });
    if (!Array.isArray(ops)) return [{ step: 0, op: '', why: 'ops must be a list of steps', example: JSON.stringify([(OPS[k] || [{ ex: {} }])[0].ex]) }];
    if (ops.length > 60) out.push({ step: 61, op: '', why: `only the first 60 steps of ${ops.length} are used: send the rest in a second call (it adds to the same proposal)` });
    ops.slice(0, 60).forEach((o, i) => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return note(i, o, 'not a step: each step is an object with an "op"', exOf((OPS[k] || [])[0] || { ex: {} }));
      if (!known.has(o.op)) { const near = [...known].find(x => x.replace(/[^a-z]/g, '') === String(o.op || '').toLowerCase().replace(/[^a-z]/g, '')) || [...known].find(x => String(o.op || '').toLowerCase().includes(x.split('.')[0])); return note(i, o, `"${String(o.op).slice(0, 20)}" is not a step. Steps are: ${[...known].join(', ')}`, near ? exOf(opOf(k, near)) : ''); }
      const ex = exOf(opOf(k, o.op));
      if (k === 'site' && lib && design) {
        const S = lib, blocks = []; (design.pages || []).forEach(p => (p.blocks || []).forEach(b => blocks.push({ b, p })));
        const at = o.block != null ? blocks.find(x => x.b.id === o.block) : null;
        const needs = /^(text|variant|style|move|remove|link|item|illustration|alt|show|estyle|entrance)$/.test(o.op);
        if (needs && !at) return note(i, o, o.block ? `no section has the id "${String(o.block).slice(0, 40)}": ids are in site_read (${blocks.slice(0, 6).map(x => `${x.b.id} ${x.b.type}`).join(', ')}${blocks.length > 6 ? ', …' : ''})` : 'this step needs "block": the id of a section from site_read', ex);
        if (o.op === 'add') {
          if (!S.BLOCKS[o.type]) return note(i, o, `there is no "${String(o.type).slice(0, 20)}" section. Types: ${S.TYPES.join(', ')}`, ex);
          const B = S.BLOCKS[o.type];
          if (o.variant != null && !B.variants.includes(o.variant)) note(i, o, `"${String(o.variant).slice(0, 20)}" is not a layout of ${o.type}, so "${B.variants[0]}" would be used. Layouts: ${B.variants.join(', ')}`);
          if (o.props && typeof o.props === 'object') { const ok = B.make(''), bad = Object.keys(o.props).filter(x => !(x in ok) || typeof o.props[x] !== typeof ok[x] || Array.isArray(o.props[x]) !== Array.isArray(ok[x])); if (bad.length) note(i, o, `${o.type} has no ${bad.map(x => `"${String(x).slice(0, 20)}"`).join(', ')} (or it is the wrong kind of value), so ${bad.length === 1 ? 'it' : 'they'} would be dropped. It holds: ${shape(ok)}`); }
          if (o.page != null && !(design.pages || []).some(p => p.id === o.page || p.slug === o.page || p.title === o.page)) note(i, o, `no page is called "${String(o.page).slice(0, 30)}", so the first page would get it. Pages: ${(design.pages || []).map(p => p.title).join(', ')}. Add a page first with {"op":"page","title":"…"}`);
          if (o.after != null && !blocks.some(x => x.b.id === o.after)) note(i, o, `"after" names no section, so it would go to the end of the page (above the footer)`);
        }
        if (at && o.op === 'variant' && !S.BLOCKS[at.b.type].variants.includes(o.variant)) return note(i, o, `${at.b.type} has no "${String(o.variant).slice(0, 20)}" layout. Its layouts: ${S.BLOCKS[at.b.type].variants.join(', ')}`, JSON.stringify({ op: 'variant', block: at.b.id, variant: S.BLOCKS[at.b.type].variants.find(v => v !== at.b.variant) || at.b.variant }));
        if (at && o.op === 'text') {
          const cur = S.getAt(at.b.props, String(o.path || ''));
          if (!o.path) return note(i, o, `this step needs "path": which words. ${at.b.type} holds: ${shape(at.b.props)}`, JSON.stringify({ op: 'text', block: at.b.id, path: Object.keys(at.b.props).find(x => typeof at.b.props[x] === 'string' && x !== 'img') || 'title', value: '…' }));
          if (cur === undefined) note(i, o, `${at.b.type} has no "${String(o.path).slice(0, 40)}" yet, so this would add a part the page may not show. It holds: ${shape(at.b.props)}${/^\w+\.\d+/.test(o.path) ? '. Add an entry first with {"op":"item","block":"' + at.b.id + '","path":"' + String(o.path).split('.')[0] + '","i":0,"do":"add"}' : ''}`);
          if (typeof o.value !== 'string') return note(i, o, '"value" must be the new words (a string)', ex);
        }
        if (at && o.op === 'link') { const h = S.getAt(at.b.props, String(o.path || '')); if (!h || typeof h !== 'object' || Array.isArray(h)) return note(i, o, `"path" must name a button or an entry (like buttons.0 or items.1). ${at.b.type} holds: ${shape(at.b.props)}`, ex); if (o.kind === 'page' && !(design.pages || []).some(p => p.slug === o.to || p.id === o.to || p.title === o.to)) note(i, o, `no page "${String(o.to).slice(0, 30)}". Pages (use the slug): ${(design.pages || []).map(p => p.slug).join(', ')}`); if (o.kind === 'section' && !blocks.some(x => x.b.id === o.to)) note(i, o, 'for kind "section", "to" is the id of the section to scroll to'); }
        if (o.op === 'theme' || o.op === 'palette') { if (!S.PRESETS[o.preset]) return note(i, o, `no look called "${String(o.preset).slice(0, 20)}". Looks: ${Object.keys(S.PRESETS).join(', ')}`, ex); }
        if (o.op === 'fonts' && !S.FONT_PAIRS[o.pair]) return note(i, o, `no font pair "${String(o.pair).slice(0, 20)}". Pairs: ${Object.keys(S.FONT_PAIRS).slice(0, 14).join(', ')}, … (site_catalog lists all)`, ex);
        if (o.op === 'illustration' && !(S.ILLUS || {})[o.name]) return note(i, o, `illustrations are: ${Object.keys(S.ILLUS || {}).join(', ')}`, ex);
        if (o.op === 'item' && at) { const l = S.getAt(at.b.props, String(o.path || '')); if (!Array.isArray(l)) return note(i, o, `"path" must name a list of ${at.b.type}: ${Object.keys(at.b.props).filter(x => Array.isArray(at.b.props[x])).join(', ') || 'it has none'}`, ex); }
      }
      if (k === 'app' && lib && design) {
        const A = lib, scr = design.screens || [], blocks = []; scr.forEach(s => (s.blocks || []).forEach(b => blocks.push({ b, s })));
        const needsB = /^(text|icon|illus|block\.(remove|move|dup)|item\.|link|unlink)/.test(o.op), at = o.block != null ? blocks.find(x => x.b.id === o.block) : null;
        const sOk = v => scr.some(s => s.id === v || s.name === v);
        if (needsB && !at) return note(i, o, o.block ? `no part has the id "${String(o.block).slice(0, 40)}": ids are in app_read` : 'this step needs "block": the id of a part from app_read', ex);
        if (/^(screen\.(rename|move)|start|block\.add)$/.test(o.op) && !sOk(o.screen)) return note(i, o, `no screen "${String(o.screen == null ? '' : o.screen).slice(0, 30)}". Screens (id: name): ${scr.map(s => `${s.id}: ${s.name}`).join(', ')}`, ex);
        if (o.op === 'block.add' && !A.BLOCKS[o.type]) return note(i, o, `there is no "${String(o.type).slice(0, 20)}" part. Parts: ${A.BLOCK_TYPES.slice(0, 24).join(', ')}, … (app_catalog lists all)`, ex);
        if (o.op === 'kit' && !A.KITS[o.kit]) return note(i, o, `no kit "${String(o.kit).slice(0, 20)}". Kits: ${Object.keys(A.KITS).slice(0, 24).join(', ')}, … (app_catalog lists all)`, ex);
        if (o.op === 'preset' && !A.PRESETS.some(p => p.id === o.id)) return note(i, o, `no look "${String(o.id).slice(0, 20)}". Looks: ${A.PRESETS.slice(0, 20).map(p => p.id).join(', ')}, … (app_catalog lists all)`, ex);
        if (o.op === 'link') { if (!sOk(o.to)) return note(i, o, `"to" must be a screen. Screens (id: name): ${scr.map(s => `${s.id}: ${s.name}`).join(', ')}`, ex); if (o.path == null) note(i, o, 'no "path": "" links the part itself (a button), items.0 links one entry'); }
        if (o.op === 'text' && at) { const cur = A.getPath(at.b.props, String(o.path || '')); if (typeof cur !== 'string') return note(i, o, `"path" must name words the part already has. ${at.b.type} holds: ${shape(at.b.props)}`, JSON.stringify({ op: 'text', block: at.b.id, path: Object.keys(at.b.props).find(x => typeof at.b.props[x] === 'string') || 'title', value: '…' })); }
        if (o.op === 'theme' && (!o.set || typeof o.set !== 'object')) return note(i, o, 'the look goes in "set"', ex);
        if (o.op === 'theme' && o.set && o.set.font && !A.FONTS[o.set.font]) note(i, o, `no font "${String(o.set.font).slice(0, 20)}". Fonts: ${Object.keys(A.FONTS).join(', ')}`);
      }
    });
    return out;
  }
  const lintText = notes => notes.map(n => `- Step ${n.step}${n.op ? ` (${n.op})` : ''}: ${n.why}${n.example ? `\n  Try: ${n.example}` : ''}`).join('\n');

  // ---------- the design as a person reads it, in plain text ----------
  const linkWords = l => (!l || !l.to ? 'nowhere' : l.kind === 'email' ? l.to : l.kind === 'url' ? short(l.to, 40) : `${l.kind} ${l.to}`);
  function siteText(cfg, S, o) {
    o = o || {}; const c = S.normalize(JSON.parse(JSON.stringify(cfg))), dev = /^(phone|tablet)$/.test(o.device) ? o.device : 'desktop', col = S.colors(c);
    const pages = o.page ? c.pages.filter(p => p.id === o.page || p.slug === o.page || p.title === o.page) : c.pages.slice(0, 1);
    if (!pages.length) return `No page "${o.page}". Pages: ${c.pages.map(p => p.title).join(', ')}`;
    const out = [`${c.name} · ${dev} view · look ${c.theme.preset} (${c.theme.mode}), accent ${col.accent} on ${col.bg}, fonts ${c.theme.fonts.display} + ${c.theme.fonts.body}, spacing ${c.theme.space || 'normal'}, corners ${c.theme.radius}px`,
      `Pages: ${c.pages.map(p => `${p.title} (${p.slug})`).join(', ')}`];
    const lines = (v, key, ind) => {
      const pad = '  '.repeat(ind), r = [];
      if (typeof v === 'string') { if (!v) return r; if (/^data:/.test(v)) return r; r.push(`${pad}${key === 'title' || key === 'name' ? '# ' : key === 'eyebrow' ? '^ ' : ''}${short(v, 200)}${/^(title|name|eyebrow|text|bio|quote|a|q|caption)$/.test(key) ? '' : ` (${key})`}`); return r; }
      return r;
    };
    const entry = x => { if (typeof x === 'string') return short(x, 100); const s = []; Object.entries(x || {}).forEach(([k, v]) => { if (k === 'img') s.push(v ? `[picture: ${short(x.alt || 'no description', 40)}]` : '[empty picture slot]'); else if (k === 'link') s.push(`→ ${linkWords(v)}`); else if (k === 'button' && v && typeof v === 'object') s.push(`( ${v.label} → ${linkWords(v.link)} )`); else if (Array.isArray(v)) s.push(v.map(y => (typeof y === 'string' ? short(y, 40) : short(y.label || y.title || '', 40))).join(', ')); else if (typeof v === 'string' && v && !/^(alt|shape)$/.test(k)) s.push(short(v, 90)); }); return s.filter(Boolean).join(' · '); };
    pages.forEach(pg => {
      const vis = pg.blocks.filter(b => !b.hidden && !String((b.style || {}).hide || '').split(',').includes(dev));
      out.push('', `== Page: ${pg.title} · ${vis.length} of ${pg.blocks.length} sections shown on ${dev} ==`);
      pg.blocks.forEach(b => {
        const st = b.style || {}, hid = b.hidden ? 'hidden everywhere' : String(st.hide || '').split(',').includes(dev) ? `hidden on ${dev}` : '';
        const B = S.BLOCKS[b.type]; out.push('', `[${b.id}] ${B.label.replace(/ \(.*/, '').toUpperCase()} · ${b.variant}${st.bg ? ` · ${st.bg} background` : ''}${st.pad ? ` · ${st.pad === 's' ? 'tight' : 'roomy'}` : ''}${hid ? ` · ${hid.toUpperCase()}` : ''}`);
        if (hid) return;
        const P = b.props || {};
        Object.entries(P).forEach(([k, v]) => {
          if (k === 'img') { if (!(b.type === 'hero' && /^(minimal|accent|center)$/.test(b.variant) && !v)) out.push(`  ${v ? `[picture: ${short(P.alt || 'no description', 60)}]` : '[empty picture slot]'}`); return; }
          if (/^(alt|shape|action|wait)$/.test(k)) return;
          if (typeof v === 'string') return out.push(...lines(v, k, 1));
          if (k === 'button' && v && typeof v === 'object') return out.push(`  ( ${v.label} → ${linkWords(v.link)} )`);
          if (k === 'buttons' && Array.isArray(v)) { if (v.length) out.push('  ' + v.map(x => `( ${x.label} → ${linkWords(x.link)} )`).join('  ')); return; }
          if (Array.isArray(v)) { const max = o.full ? 24 : 8; v.slice(0, max).forEach((x, i) => out.push(`  ${i + 1}. ${entry(x)}`)); if (v.length > max) out.push(`  … ${v.length - max} more`); if (!v.length) out.push(`  (no ${k})`); }
        });
        if (dev === 'phone') { const n = (Array.isArray(P.items) ? P.items : Array.isArray(P.plans) ? P.plans : []).length; if (n > 6) out.push(`  ! ${n} entries stack into one long column on a phone`); if (String(P.title || '').length > 60) out.push('  ! the title wraps to four or more lines on a phone'); }
      });
    });
    if (dev === 'phone') out.push('', 'On a phone every section is one column, pictures sit above their words, and the space between sections is about two thirds of the desktop\'s.');
    return out.join('\n');
  }
  function siteSummary(cfg, S) {
    const c = S.normalize(JSON.parse(JSON.stringify(cfg)));
    return { name: c.name, look: c.theme.preset, mode: c.theme.mode, accent: S.colors(c).accent, fonts: `${c.theme.fonts.display} + ${c.theme.fonts.body}`,
      pages: c.pages.map(p => ({ id: p.id, slug: p.slug, title: p.title, sections: p.blocks.map(b => `${b.id} ${b.type}/${b.variant}${b.hidden ? ' (hidden)' : ''}${b.props && b.props.title ? ` “${short(b.props.title, 32)}”` : ''}`) })) };
  }
  function appText(doc, A, o) {
    o = o || {}; const d = A.normalize(doc), t = d.theme;
    const scr = o.screen ? d.screens.filter(s => s.id === o.screen || s.name === o.screen) : d.screens;
    if (!scr.length) return `No screen "${o.screen}". Screens: ${d.screens.map(s => `${s.id}: ${s.name}`).join(', ')}`;
    const nameOf = id => { const s = A.findScreen(d, id); return s ? s.name : id; };
    const out = [`${d.name} · ${d.platform === 'android' ? 'Android' : 'iPhone'} look · ${t.mode} mode, accent ${t.accent}, font ${t.font}, ${t.radius} corners, ${t.density} spacing${t.preset ? `, look ${t.preset}` : ''}`, `Opens on: ${nameOf(d.start)} · ${d.screens.length} screens`];
    const reach = new Set([d.start]); let grew = true; while (grew) { grew = false; d.screens.forEach(s => { if (!reach.has(s.id)) return; s.blocks.forEach(b => Object.values(b.links || {}).forEach(l => { if (l && l.to && !reach.has(l.to)) { reach.add(l.to); grew = true; } })); }); }
    const entry = x => (typeof x === 'string' ? short(x, 80) : Object.entries(x || {}).filter(([k, v]) => typeof v === 'string' && v && !/^(icon|illus|kind)$/.test(k)).map(([, v]) => short(v, 60)).join(' · ') + (x && x.kind === 'toggle' ? ` [switch ${x.on ? 'on' : 'off'}]` : ''));
    scr.forEach(s => {
      out.push('', `== Screen: ${s.name} (${s.id})${s.id === d.start ? ' · first screen' : ''}${s.tab ? ' · a tab' : ''}${reach.has(s.id) ? '' : ' · NOTHING LEADS HERE'} ==`);
      s.blocks.forEach(b => {
        out.push(`[${b.id}] ${A.BLOCKS[b.type].label.toUpperCase()}`);
        Object.entries(b.props || {}).forEach(([k, v]) => {
          if (typeof v === 'string') { if (v && !/^data:|^pic:/.test(v) && !/^(icon|illus|style)$/.test(k)) out.push(`  ${k === 'title' ? '# ' : ''}${short(v, 160)}${k === 'title' || k === 'sub' || k === 'text' || k === 'label' ? '' : ` (${k})`}`); return; }
          if (Array.isArray(v)) { const max = o.full ? 24 : 6; v.slice(0, max).forEach((x, i) => { const l = (b.links || {})[`${k}.${i}`]; out.push(`  ${i + 1}. ${entry(x)}${l ? ` → ${nameOf(l.to)} (${l.how})` : ''}`); }); if (v.length > max) out.push(`  … ${v.length - max} more`); }
        });
        const own = (b.links || {})['']; if (own) out.push(`  → ${nameOf(own.to)} (${own.how})`); else if (b.type === 'button') out.push('  → nowhere');
      });
    });
    return out.join('\n');
  }
  function appSummary(doc, A) {
    const d = A.normalize(doc);
    return { name: d.name, platform: d.platform, start: d.start, look: d.theme.preset || '', mode: d.theme.mode, accent: d.theme.accent, font: d.theme.font,
      screens: d.screens.map(s => ({ id: s.id, name: s.name, ...(s.tab ? { tab: true } : {}), parts: s.blocks.map(b => `${b.id} ${b.type}${Object.keys(b.links || {}).length ? ` →${[...new Set(Object.values(b.links).map(l => l.to))].join(',')}` : ''}`) })) };
  }

  // ---------- the project brief ----------
  //   data = { name, kind, vision, tagline, audience, tone, brand: { name, colors, fonts, voice, logo: bool }, site, app, motion: [names],
  //            facts: [{ kind, key, value }], tasks: [{ id, status, title }], comments: [{ on, where, text, by }],
  //            approve: { site, app, motion: line }, you: { name, owner }, folder: { site, app } }
  function brief(d, o) {
    d = d || {}; o = o || {}; const max = o.max || 9000, out = [];
    const b = d.brand || {}, col = b.colors || {}, cols = [col.accent && `accent ${col.accent}`, col.ink && `ink ${col.ink}`, col.bg && `background ${col.bg}`, ...(Array.isArray(col.more) ? col.more.slice(0, 4) : [])].filter(Boolean).join(', ');
    const fonts = b.fonts ? [b.fonts.display, b.fonts.body].filter(Boolean).join(' + ') : '';
    out.push(`# Project brief: ${d.name || 'this project'}`, '');
    if (d.vision) out.push(`**Vision:** ${short(d.vision, o.short ? 240 : 900)}`); else out.push('**Vision:** not written down yet. Judge from the name and the words already in the designs, and ask the person rather than guess.');
    if (d.tagline) out.push(`**In a line:** ${short(d.tagline, 200)}`);
    out.push(`**What it is:** ${d.kind || 'not stated'}`);
    out.push(`**Audience:** ${d.audience ? short(d.audience, 300) : 'not written down. Infer it from the vision; do not narrow it on your own.'}`);
    out.push(`**Tone:** ${d.tone ? short(d.tone, 300) : 'not written down. Plain, friendly and specific is the safe choice.'}`);
    out.push('', '## Brand kit', cols || fonts || b.voice || b.name
      ? [b.name && `- Name: ${short(b.name, 60)}`, cols && `- Colours: ${cols}`, fonts && `- Fonts: ${fonts}`, b.voice && `- Voice: ${short(b.voice, 300)}`, `- Logo: ${b.logo ? 'yes (the person places it; you cannot)' : 'none saved'}`].filter(Boolean).join('\n')
      : '- None saved yet. Keep the colours and fonts a design already has unless you are asked to change them.');
    if (!o.short) {
      out.push('', '## What exists');
      if (d.site) { out.push(`- **Website** “${short(d.site.name, 40)}”: look ${d.site.look} (${d.site.mode}), accent ${d.site.accent}, fonts ${d.site.fonts}.`); (d.site.pages || []).slice(0, 8).forEach(p => out.push(`  - Page ${p.title}: ${(p.sections || []).map(s => s.split(' ')[1]).join(', ') || 'empty'}`)); if (d.site.problems != null) out.push(`  - Check my site: ${d.site.problems} thing${d.site.problems === 1 ? '' : 's'} to fix, ${d.site.tips || 0} tip${d.site.tips === 1 ? '' : 's'} (site_check).`); }
      else out.push('- **Website:** none yet. site_propose with start can begin one (a person approves it).');
      if (d.app) { out.push(`- **Phone app** “${short(d.app.name, 40)}”: ${d.app.platform === 'android' ? 'Android' : 'iPhone'} look, ${d.app.mode} mode, accent ${d.app.accent}, font ${d.app.font}.`); (d.app.screens || []).slice(0, 12).forEach(s => out.push(`  - Screen ${s.name}${s.id === d.app.start ? ' (first)' : ''}: ${(s.parts || []).map(x => x.split(' ')[1]).join(', ') || 'empty'}`)); }
      else out.push('- **Phone app:** none yet. app_propose with start can begin one (a person approves it).');
      if (d.motion && d.motion.length) out.push(`- **Motion graphics:** ${d.motion.slice(0, 10).map(x => short(x, 30)).join(', ')}`);
      const facts = (d.facts || []).slice(0, o.facts || 24);
      out.push('', '## Facts and decisions (project memory)', facts.length ? facts.map(f => `- ${f.kind && f.kind !== 'fact' ? `(${f.kind}) ` : ''}${short(f.key, 60)}: ${short(f.value, 200)}`).join('\n') : '- Nothing recorded yet. Use only what the vision, the brand kit and the designs say.');
      const tasks = (d.tasks || []).slice(0, 10);
      out.push('', '## Open tasks', tasks.length ? tasks.map(t => `- ${t.id} [${t.status}] ${short(t.title, 110)}`).join('\n') : '- None.');
      const com = (d.comments || []).slice(0, 10);
      out.push('', '## Open comments on the designs', com.length ? com.map(c => `- ${c.on}${c.where ? ` · ${short(c.where, 40)}` : ''}: “${short(c.text, 160)}”${c.by ? ` (${c.by})` : ''}`).join('\n') : '- None.');
    }
    const ap = d.approve || {};
    out.push('', '## Who approves what', [ap.site && `- Website: ${ap.site}`, ap.app && `- App: ${ap.app}`, ap.motion && `- Motion: ${ap.motion}`].filter(Boolean).join('\n') || '- A person approves every change you propose.',
      '- Publishing, exporting and deleting are always a person\'s to do.');
    if (d.you && d.you.owner) out.push(`- You work for ${d.you.owner} with their access and never more.`);
    if (!o.short) out.push('', '## How to work', '- Website: get_guide("website"), then site_read → site_propose (dry_run first) → site_check.', '- App: get_guide("app"), then app_read → app_propose (dry_run first) → app_check.', '- Motion: get_guide("motion"), then motion_list → motion_read → motion_write.');
    let text = out.join('\n');
    if (text.length > max) text = text.slice(0, max - 40).replace(/\n[^\n]*$/, '') + '\n\n(brief cut to fit)';
    return text;
  }
  // one line for a small model
  const briefLine = d => `Project: ${short((d && d.name) || '', 60)}${d && d.vision ? `. ${short(d.vision, 200)}` : ''}${d && d.brand && d.brand.voice ? ` Voice: ${short(d.brand.voice, 100)}` : ''}`.trim();

  // ---------- what an agent is sent ("Make it beautiful", Have my agent do it) ----------
  function request(kind, o) {
    o = o || {}; const k = kindOf(kind) || 'site', T = TOOLS[k], app = k === 'app';
    const ask = String(o.ask || '').trim() || 'Make it more beautiful: a clearer order of what is read first, calmer spacing, colour and type that fit the brand. Keep what it says and what it does.';
    return [
      o.brief ? String(o.brief).trim() : '', o.brief ? '\n---\n' : '',
      `${app ? 'App' : 'Website'} design request${o.from ? ` from ${o.from}` : ''} (made in TribeCode's ${app ? 'App Creator' : 'website designer'}): ${ask}`,
      '',
      'How to do it (the hook contract is docs/CLAUDE-HOOKS.md; the full guide is one call away):',
      `1. Call get_guide("${NAMES[k]}") and follow it. ${o.brief ? 'The project brief is above' : 'Call project_brief for what this project is'}.`,
      `2. Call ${T.read} to get the design with its ids, and ${T.view} to read it as a person would.`,
      `3. Call ${T.propose} with { ops: [...], note: "what you changed and why, in one or two sentences" }. Try it first with dry_run: true.`,
      `4. Call ${T.check} and fix what it lists.`,
      'Do not edit files for this. Nothing changes until a person approves your proposal; they see it before and after, and Undo takes it back. Steps that are not on the list are skipped.',
      o.outline ? `\nThe design now:\n${String(o.outline).slice(0, 2400)}` : '',
    ].filter(x => x !== '').join('\n');
  }

  // ---------- the project folder: AGENTS.md's marked block ----------
  const MARK = { open: '<!-- tribecode:start (TribeCode keeps this block up to date; write outside it) -->', close: '<!-- tribecode:end -->' };
  const MARK_RX = /<!-- tribecode:start[^>]*-->[\s\S]*?<!-- tribecode:end -->/;
  function folderBlock(d) {
    d = d || {}; const f = d.folder || {}, lines = [MARK.open, `## ${d.name || 'This project'} (a TribeCode project)`, ''];
    lines.push(d.vision ? short(d.vision, 500) : 'The vision is not written down yet. Ask the person what this project is before you design for it.');
    if (d.tagline) lines.push('', short(d.tagline, 200));
    const b = d.brand || {}, col = b.colors || {};
    const kit = [col.accent && `accent ${col.accent}`, b.fonts && [b.fonts.display, b.fonts.body].filter(Boolean).join(' + '), b.voice && `voice: ${short(b.voice, 140)}`].filter(Boolean).join('; ');
    if (kit) lines.push('', `Brand: ${kit}.`);
    lines.push('', '### Where the designs are',
      `- Website: \`site/\` (${f.site ? 'pages, pictures, fonts, and `site/site.json`, the design itself' : 'not made yet'}).`,
      `- Phone app: \`app-web/\` (${f.app ? 'the phone web app, and `app-web/app-design.json`, the design itself' : 'not made yet'}).`,
      '- Both folders are written by TribeCode from the design a moment after every save. A file you change there by hand is noticed: TribeCode stops writing and asks the person which version to keep.',
      '', '### How to change them',
      '- **Connected to TribeCode (MCP):** do not edit those files. Call `project_brief`, then `get_guide("website")` or `get_guide("app")`, and propose steps with `site_propose` / `app_propose`. A person approves; Undo takes it back.',
      '- **Not connected:** read `.tribe/ai/WEBSITE.md` or `.tribe/ai/APP.md` first. Change `site/site.json` or `app-web/app-design.json` (the design), never the generated pages, and tell the person to open the project in TribeCode and choose "Keep my files" or "Use the design".',
      '- Never publish, delete pages or screens, or invent facts about this project. Missing facts are questions for the person.',
      '', '### Guides', '- `.tribe/ai/PROJECT.md`: what this project is, what exists, who approves what (kept current).', '- `.tribe/ai/WEBSITE.md`, `.tribe/ai/APP.md`, `.tribe/ai/MOTION.md`: how to build each well.', MARK.close);
    return lines.join('\n');
  }
  // -> the new file text, or null when the file is a person's own (it has text and no block of ours): never overwritten
  function mergeBlock(old, block, title) {
    if (old == null || !String(old).trim()) return `# ${title || 'Notes for AI agents'}\n\n${block}\n`;
    if (MARK_RX.test(old)) return String(old).replace(MARK_RX, () => block);
    return null;
  }

  return { TOOLS, OPS, RULES, NAMES, MARK, MARK_RX, kindOf, hint, opOf, essentials, trimmed, catalog, catalogMd, lint, lintText, shape, siteText, siteSummary, appText, appSummary, brief, briefLine, request, folderBlock, mergeBlock, version: 1 };
});
