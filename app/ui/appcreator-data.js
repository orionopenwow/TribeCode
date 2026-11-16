// App Creator content (docs/APP-CREATOR.md): the stroke icons an app can use, the twelve full-app templates and the kits
// (screens you stack onto any app: settings, onboarding, a paywall layout…). Plain data, no DOM. Shared like
// appcreator-core.js: window.TribeAppData in the browser, require() on the server and in tests.
//   ICONS   name -> SVG inner markup on a 24-unit grid (drawn for TribeCode, stroke only, round caps)
//   TEMPLATES  [{ id, title, summary, icon, accent, font, build() -> doc }]
//   KITS       { id: { title, summary, icon, screens() -> [screen] , tab? } }
// A doc is { v, name, platform, theme, screens: [{ id, name, tab, icon, blocks: [{ type, props, links }] }], start }.
// Links name a screen by its id; appcreator-core.js normalize() gives every block an id and checks every link.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TribeAppData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ICONS = {
    home: '<path d="M4 11l8-7 8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.8 4-5.6 7.5-5.6s6.3 1.8 7.5 5.6"/>',
    users: '<circle cx="9" cy="9" r="3.4"/><path d="M3 19c.9-3.2 3.2-4.8 6-4.8s5.1 1.6 6 4.8"/><path d="M15.5 5.8a3.2 3.2 0 0 1 0 6.3M18 14.6c1.4.7 2.5 2.1 3 4.2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
    heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/>',
    chat: '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    cart: '<path d="M3.5 4.5h2.3l2 10.5h10.4l1.8-7.5H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    chart: '<path d="M4 20h16"/><path d="M7 16v-4M11.5 16V8M16 16v-6.5"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
    star: '<path d="M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.3 7.2 18.8l1-5.4-4-3.7 5.4-.7z"/>',
    book: '<path d="M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z"/><path d="M5 16.5a3 3 0 0 1 3-3h10"/>',
    pin: '<path d="M12 20.5s6-5.6 6-10.5a6 6 0 0 0-12 0c0 4.9 6 10.5 6 10.5z"/><circle cx="12" cy="10" r="2.2"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    flame: '<path d="M12 20.5c3.6 0 6-2.5 6-5.8 0-3.7-3-5.6-3.6-9.2-2.2 1.3-3.3 3.5-3.4 5.6C9.9 10 9.2 8.8 9 7.6 7.3 9.2 6 11.5 6 14.7c0 3.3 2.4 5.8 6 5.8z"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-12.5 14z"/><path d="M5 19l7-7"/>',
    dumbbell: '<path d="M3.5 10v4M20.5 10v4M6.5 7.5v9M17.5 7.5v9M6.5 12h11"/>',
    wallet: '<rect x="3.5" y="6" width="17" height="13" rx="2"/><path d="M3.5 9.5h17M16 14h1.5"/>',
    music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.8" cy="17.5" r="2.2"/><circle cx="16.8" cy="15.5" r="2.2"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
    back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    chevron: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
    more: '<circle cx="6" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="18" cy="12" r=".9"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3.5 9h17M12 9v11M12 9c-2-4-6-3.5-5.5-1S12 9 12 9zm0 0c2-4 6-3.5 5.5-1S12 9 12 9z"/>',
    list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r=".9"/><circle cx="5" cy="12" r=".9"/><circle cx="5" cy="17" r=".9"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    bookmark: '<path d="M7 4.5h10v15l-5-3.5-5 3.5z"/>',
    share: '<path d="M12 4v11M8 8l4-4 4 4"/><path d="M5 13v5.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    camera: '<path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.3"/>',
    trophy: '<path d="M8 4.5h8V10a4 4 0 0 1-8 0z"/><path d="M8 6.5H5a3 3 0 0 0 3 3.5M16 6.5h3a3 3 0 0 1-3 3.5M12 14v3.5M8.5 20h7"/>',
    game: '<rect x="3" y="8" width="18" height="9.5" rx="4.5"/><path d="M7.5 11v3.5M5.8 12.75h3.4"/><circle cx="15.5" cy="12" r=".9"/><circle cx="17.8" cy="14" r=".9"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
    send: '<path d="M4.5 12L20 4.5 16 20l-4-6.5z"/><path d="M12 13.5L20 4.5"/>',
    mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
    globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.4 3.4 5 3.4 8s-1 5.6-3.4 8c-2.4-2.4-3.4-5-3.4-8s1-5.6 3.4-8z"/>',
    coffee: '<path d="M5 9.5h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v3M12 3.5v3"/>',
    food: '<path d="M7 3.5v7a2 2 0 0 0 2 2V20.5M5 3.5v5M9 3.5v5M16.5 20.5V3.5c-2 1.2-3 3.4-3 7h3"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    tag: '<path d="M4 12.5V5a1 1 0 0 1 1-1h7.5l8 8-8.5 8.5z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
    bolt: '<path d="M13 3.5L5.5 13H12l-1 7.5 7.5-9.5H12z"/>',
    sparkle: '<path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"/>',
    note: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 16h4"/>',
    plane: '<path d="M3.5 13.5l17-7-4 13-4.5-4.5z"/><path d="M12 15l-2.5 4.5"/>',
    house: '<path d="M4.5 11L12 4.5l7.5 6.5V20h-15z"/><path d="M10 20v-5h4v5"/>',
    ticket: '<path d="M4 7h16v3.2a1.8 1.8 0 0 0 0 3.6V17H4v-3.2a1.8 1.8 0 0 0 0-3.6z"/><path d="M14.5 7v10" stroke-dasharray="2 2"/>',
    soup: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 7.5c-1-1.2 1-2 0-3.5M13 7.5c-1-1.2 1-2 0-3.5"/>',
    fish: '<path d="M3.5 12c3-4.5 9.5-4.5 13 0-3.5 4.5-10 4.5-13 0z"/><path d="M16.5 12l4-3v6z"/><circle cx="8" cy="11.3" r=".8"/>',
    mountain: '<path d="M3 19l6.5-11 4 6.5 2-3L21 19z"/><path d="M8 10.5l1.5 1.5 1.5-1.5"/>',
    car: '<path d="M5 16V12l2-4.5h10L19 12v4z"/><path d="M5 12h14"/><circle cx="8" cy="16.5" r="1.6"/><circle cx="16" cy="16.5" r="1.6"/>',
    wave: '<path d="M3 9c3-2.5 6 2.5 9 0s6 2.5 9 0M3 14c3-2.5 6 2.5 9 0s6 2.5 9 0"/>',
  };
  const ICON_NAMES = Object.keys(ICONS);

  // ---------- builders ----------
  const b = (type, props, links) => ({ type, props: props || {}, links: links || {} });
  const scr = (id, name, blocks, opts) => ({ id, name, blocks, ...(opts || {}) });
  const go = (to, how) => ({ to, how: how || 'push' });
  const tabs = (items, on) => b('tabs', { items: items.map(([label, icon]) => ({ label, icon })), on: on || 0 }, Object.fromEntries(items.map(([, , to], i) => [`items.${i}`, go(to, 'fade')]).filter(([, l]) => l.to)));
  const doc = (name, theme, screens, extra) => ({ v: 1, name, platform: 'ios', theme: { accent: '#F26B1D', mode: 'light', radius: 'soft', font: 'clean', density: 'regular', icons: 'regular', motion: 'standard', ...theme }, screens, start: screens[0].id, ...(extra || {}) });

  // ---------- the twelve templates ----------
  const TEMPLATES = [
    { id: 'habits', cat: 'Health', sweet: true, title: 'Habit tracker', summary: 'Daily habits, streaks and a weekly chart', icon: 'target', accent: '#2F9E6E', font: 'friendly', build: () => {
      const T = [['Today', 'check', 'today'], ['Stats', 'chart', 'stats'], ['Profile', 'user', 'me']];
      return doc('Daily Habits', { accent: '#2F9E6E', font: 'friendly', radius: 'round' }, [
        scr('today', 'Today', [
          b('header', { eyebrow: 'Tuesday, March 4', title: 'Good morning, Maya', sub: '3 of 5 habits done' }),
          b('stats', { tiles: [{ n: '12', label: 'Day streak' }, { n: '60%', label: 'Today' }, { n: '84', label: 'Total check-ins' }] }),
          b('checklist', { title: 'Today', items: [{ title: 'Drink water', sub: '8 glasses', icon: 'leaf', done: true, streak: '12' }, { title: 'Read 20 pages', sub: 'The Overstory', icon: 'book', done: true, streak: '6' }, { title: 'Walk outside', sub: '30 minutes', icon: 'sun', done: true, streak: '4' }, { title: 'Stretch', sub: '10 minutes', icon: 'dumbbell', done: false, streak: '2' }, { title: 'No phone after 10', sub: 'Evening', icon: 'moon', done: false, streak: '0' }] }),
          b('button', { label: 'Add a habit', style: 'secondary', icon: 'plus' }, { '': go('add', 'sheet') }),
          tabs(T, 0),
        ], { tab: true, icon: 'check' }),
        scr('add', 'New habit', [
          b('nav', { title: 'New habit', back: true, action: '' }),
          b('form', { fields: [{ label: 'Name', placeholder: 'Meditate' }, { label: 'How often', placeholder: 'Every day' }, { label: 'Reminder', placeholder: '8:00 AM' }], button: 'Save habit' }, { button: go('today', 'fade') }),
        ]),
        scr('stats', 'Stats', [
          b('header', { eyebrow: 'This week', title: 'Your progress', sub: 'Best week this month' }),
          b('chart', { kind: 'bar', title: 'Check-ins', big: '27', values: [3, 4, 5, 4, 5, 3, 3], labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] }),
          b('list', { title: 'Longest streaks', items: [{ title: 'Drink water', sub: '12 days', icon: 'leaf', meta: '' }, { title: 'Read 20 pages', sub: '6 days', icon: 'book', meta: '' }, { title: 'Walk outside', sub: '4 days', icon: 'sun', meta: '' }] }),
          tabs(T, 1),
        ], { tab: true, icon: 'chart' }),
        scr('me', 'Profile', [
          b('profile', { name: 'Maya Lee', handle: 'Member since January', bio: 'Small steps, every day.', stats: [{ n: '5', label: 'Habits' }, { n: '84', label: 'Check-ins' }, { n: '12', label: 'Best streak' }], button: 'Edit profile' }),
          b('settings', { title: 'Reminders', items: [{ label: 'Morning reminder', kind: 'toggle', on: true }, { label: 'Evening check-in', kind: 'toggle', on: false }, { label: 'Week starts on', kind: 'value', value: 'Monday' }] }),
          tabs(T, 2),
        ], { tab: true, icon: 'user' }),
      ]);
    } },
    { id: 'notes', cat: 'Productivity', title: 'Notes', summary: 'Folders, a note list and a writing screen', icon: 'note', accent: '#E0951F', font: 'editorial', build: () => doc('Field Notes', { accent: '#C9821A', font: 'editorial', radius: 'soft' }, [
      scr('home', 'Notes', [
        b('header', { eyebrow: '', title: 'Notes', sub: '24 notes' }),
        b('search', { placeholder: 'Search notes', chips: ['All', 'Ideas', 'Journal', 'Work'] }),
        b('list', { title: 'Pinned', items: [{ title: 'Trip packing list', sub: 'Passport, charger, the blue jacket…', icon: 'bookmark', meta: 'Mon' }, { title: 'Book ideas', sub: 'A lighthouse keeper who collects…', icon: 'sparkle', meta: 'Sun' }] }, { 'items.0': go('note'), 'items.1': go('note') }),
        b('list', { title: 'Recent', items: [{ title: 'Garden plan', sub: 'Tomatoes along the south fence', icon: 'leaf', meta: '9:41' }, { title: 'Meeting with Sam', sub: 'Launch dates and the poster', icon: 'note', meta: 'Yesterday' }, { title: 'Recipes to try', sub: 'Miso soup, lemon pasta', icon: 'food', meta: 'Mar 1' }] }, { 'items.0': go('note'), 'items.1': go('note'), 'items.2': go('note') }),
        b('button', { label: 'New note', style: 'primary', icon: 'edit' }, { '': go('note', 'morph') }),
      ]),
      scr('note', 'Note', [
        b('nav', { title: 'Garden plan', back: true, action: 'share' }),
        b('text', { text: 'Tomatoes along the south fence, basil between them. Beans on the trellis by the shed.\n\nOrder seeds before the 15th. Ask Sam about the old rain barrel.' }),
        b('image', { illus: 'leaf', caption: 'Sketch of the beds' }),
      ]),
    ]) },
    { id: 'workout', cat: 'Health', title: 'Workout', summary: 'Plans, a workout timer and progress', icon: 'dumbbell', accent: '#E4572E', font: 'bold', build: () => {
      const T = [['Train', 'dumbbell', 'plans'], ['Progress', 'chart', 'progress'], ['Profile', 'user', 'me']];
      return doc('Lift Log', { accent: '#E4572E', font: 'bold', mode: 'dark', radius: 'soft' }, [
        scr('plans', 'Train', [
          b('header', { eyebrow: 'Week 3 of 8', title: 'Ready, Alex?', sub: 'Upper body today' }),
          b('card', { title: 'Push day', sub: '6 exercises · 45 min', meta: 'Today', button: 'Start workout', illus: 'dumbbell' }, { button: go('timer', 'morph') }),
          b('list', { title: 'This week', items: [{ title: 'Pull day', sub: '5 exercises · 40 min', icon: 'dumbbell', meta: 'Thu' }, { title: 'Legs', sub: '6 exercises · 50 min', icon: 'dumbbell', meta: 'Sat' }, { title: 'Easy run', sub: '5 km', icon: 'bolt', meta: 'Sun' }] }),
          tabs(T, 0),
        ], { tab: true, icon: 'dumbbell' }),
        scr('timer', 'Workout', [
          b('nav', { title: 'Push day', back: true, action: '' }),
          b('timer', { time: '00:45', label: 'Bench press · set 2 of 4', sub: 'Next: 10 reps at 60 kg', button: 'Done with set' }),
          b('list', { title: 'Up next', items: [{ title: 'Overhead press', sub: '3 × 8', icon: 'dumbbell', meta: '' }, { title: 'Dips', sub: '3 × 10', icon: 'dumbbell', meta: '' }] }),
        ]),
        scr('progress', 'Progress', [
          b('header', { eyebrow: 'Last 8 weeks', title: 'Getting stronger', sub: 'Bench press, best set' }),
          b('chart', { kind: 'line', title: 'Bench press (kg)', big: '62.5', values: [45, 47.5, 50, 50, 55, 57.5, 60, 62.5], labels: ['1', '2', '3', '4', '5', '6', '7', '8'] }),
          b('stats', { tiles: [{ n: '18', label: 'Workouts' }, { n: '14h', label: 'Time' }, { n: '+17%', label: 'Strength' }] }),
          tabs(T, 1),
        ], { tab: true, icon: 'chart' }),
        scr('me', 'Profile', [
          b('profile', { name: 'Alex Kim', handle: '@alexlifts', bio: 'Three days a week, no excuses.', stats: [{ n: '18', label: 'Workouts' }, { n: '3', label: 'PRs' }, { n: '21', label: 'Streak' }], button: 'Edit profile' }),
          b('settings', { title: 'Settings', items: [{ label: 'Units', kind: 'value', value: 'kg' }, { label: 'Rest timer sound', kind: 'toggle', on: true }, { label: 'Apple Health', kind: 'chevron' }] }),
          tabs(T, 2),
        ], { tab: true, icon: 'user' }),
      ]);
    } },
    { id: 'recipes', cat: 'Food', sweet: true, title: 'Recipes', summary: 'A recipe feed, a recipe and saved dishes', icon: 'food', accent: '#C2417F', font: 'elegant', build: () => {
      const T = [['Discover', 'home', 'home'], ['Search', 'search', 'search'], ['Saved', 'bookmark', 'saved']];
      return doc('Supper Club', { accent: '#B84A3C', font: 'elegant', radius: 'round' }, [
        scr('home', 'Discover', [
          b('header', { eyebrow: 'What to cook tonight', title: 'Supper Club', sub: '' }),
          b('cards', { title: 'Quick and easy', items: [{ title: 'Lemon pasta', sub: '20 min · Vegetarian', illus: 'food', meta: '4.8' }, { title: 'Miso salmon', sub: '25 min · High protein', illus: 'fish', meta: '4.9' }, { title: 'Tomato soup', sub: '30 min · Cozy', illus: 'soup', meta: '4.7' }] }, { 'items.0': go('recipe', 'morph'), 'items.1': go('recipe', 'morph'), 'items.2': go('recipe', 'morph') }),
          b('list', { title: 'This week', items: [{ title: 'Sunday roast chicken', sub: '1 h 30 min', icon: 'flame', meta: '' }, { title: 'Spring risotto', sub: '45 min', icon: 'leaf', meta: '' }] }, { 'items.0': go('recipe'), 'items.1': go('recipe') }),
          tabs(T, 0),
        ], { tab: true, icon: 'home' }),
        scr('recipe', 'Recipe', [
          b('nav', { title: 'Lemon pasta', back: true, action: 'bookmark' }),
          b('image', { illus: 'food', caption: '' }),
          b('header', { eyebrow: '20 min · Serves 2', title: 'Lemon pasta', sub: 'Bright, buttery and ready before the water boils twice.' }),
          b('checklist', { title: 'Ingredients', items: [{ title: '200 g spaghetti', sub: '', icon: '', done: false, streak: '' }, { title: '1 lemon, zest and juice', sub: '', icon: '', done: false, streak: '' }, { title: '40 g butter', sub: '', icon: '', done: false, streak: '' }, { title: 'Parmesan and black pepper', sub: '', icon: '', done: false, streak: '' }] }),
          b('button', { label: 'Start cooking', style: 'primary', icon: 'play' }),
        ]),
        scr('search', 'Search', [
          b('header', { eyebrow: '', title: 'Search', sub: '' }),
          b('search', { placeholder: 'Ingredients, dishes, cuisines', chips: ['Vegetarian', 'Under 30 min', 'Soup', 'Dessert'] }),
          b('grid', { title: 'Popular', items: [{ title: 'Pancakes', price: '15 min', illus: 'food' }, { title: 'Ramen', price: '40 min', illus: 'soup' }, { title: 'Tacos', price: '25 min', illus: 'food' }, { title: 'Brownies', price: '35 min', illus: 'cake' }] }, { 'items.0': go('recipe'), 'items.1': go('recipe'), 'items.2': go('recipe'), 'items.3': go('recipe') }),
          tabs(T, 1),
        ], { tab: true, icon: 'search' }),
        scr('saved', 'Saved', [
          b('header', { eyebrow: '', title: 'Saved', sub: '6 recipes' }),
          b('list', { title: '', items: [{ title: 'Lemon pasta', sub: '20 min', icon: 'bookmark', meta: '' }, { title: 'Miso salmon', sub: '25 min', icon: 'bookmark', meta: '' }, { title: 'Brownies', sub: '35 min', icon: 'bookmark', meta: '' }] }, { 'items.0': go('recipe'), 'items.1': go('recipe'), 'items.2': go('recipe') }),
          tabs(T, 2),
        ], { tab: true, icon: 'bookmark' }),
      ]);
    } },
    { id: 'budget', cat: 'Money', title: 'Budget', summary: 'Balance, spending by category and a new expense', icon: 'wallet', accent: '#2F5BEA', font: 'tech', build: () => {
      const T = [['Home', 'home', 'home'], ['Spending', 'chart', 'spend'], ['Settings', 'settings', 'settings']];
      return doc('Pocket', { accent: '#2F5BEA', font: 'tech', radius: 'soft' }, [
        scr('home', 'Home', [
          b('header', { eyebrow: 'March', title: '$1,284.50', sub: 'Left to spend this month' }),
          b('stats', { tiles: [{ n: '$2,400', label: 'Budget' }, { n: '$1,115', label: 'Spent' }, { n: '18', label: 'Days left' }] }),
          b('list', { title: 'Recent', items: [{ title: 'Groceries', sub: 'Market Street', icon: 'cart', meta: '−$64.20' }, { title: 'Coffee', sub: 'Blue Door', icon: 'coffee', meta: '−$4.50' }, { title: 'Salary', sub: 'Acme Inc.', icon: 'wallet', meta: '+$2,100' }, { title: 'Bus pass', sub: 'Monthly', icon: 'tag', meta: '−$45.00' }] }),
          b('button', { label: 'Add expense', style: 'primary', icon: 'plus' }, { '': go('add', 'sheet') }),
          tabs(T, 0),
        ], { tab: true, icon: 'home' }),
        scr('add', 'New expense', [
          b('nav', { title: 'New expense', back: true, action: '' }),
          b('form', { fields: [{ label: 'Amount', placeholder: '$0.00' }, { label: 'What for', placeholder: 'Lunch' }, { label: 'Category', placeholder: 'Food' }], button: 'Save' }, { button: go('home', 'fade') }),
        ]),
        scr('spend', 'Spending', [
          b('header', { eyebrow: 'This month', title: 'Where it went', sub: '' }),
          b('chart', { kind: 'bar', title: 'By category', big: '$1,115', values: [420, 260, 180, 140, 115], labels: ['Food', 'Home', 'Fun', 'Travel', 'Other'] }),
          b('list', { title: 'Categories', items: [{ title: 'Food', sub: '38%', icon: 'food', meta: '$420' }, { title: 'Home', sub: '23%', icon: 'home', meta: '$260' }, { title: 'Fun', sub: '16%', icon: 'star', meta: '$180' }] }),
          tabs(T, 1),
        ], { tab: true, icon: 'chart' }),
        scr('settings', 'Settings', [
          b('header', { eyebrow: '', title: 'Settings', sub: '' }),
          b('settings', { title: 'Budget', items: [{ label: 'Monthly budget', kind: 'value', value: '$2,400' }, { label: 'Currency', kind: 'value', value: 'USD' }, { label: 'Spending alerts', kind: 'toggle', on: true }, { label: 'Face ID lock', kind: 'toggle', on: false }] }),
          tabs(T, 2),
        ], { tab: true, icon: 'settings' }),
      ]);
    } },
    { id: 'chat', cat: 'Social', title: 'Chat', summary: 'Conversations and a chat screen', icon: 'chat', accent: '#4F5BD5', font: 'clean', build: () => {
      const T = [['Chats', 'chat', 'home'], ['People', 'users', 'people'], ['Settings', 'settings', 'settings']];
      return doc('Hello', { accent: '#4F5BD5', font: 'clean', radius: 'round' }, [
        scr('home', 'Chats', [
          b('header', { eyebrow: '', title: 'Chats', sub: '' }),
          b('search', { placeholder: 'Search', chips: [] }),
          b('list', { title: '', items: [{ title: 'Sam Ortiz', sub: 'See you at 7!', icon: 'user', meta: '9:41' }, { title: 'Weekend crew', sub: 'Priya: who has the tent?', icon: 'users', meta: '9:12' }, { title: 'Maya Lee', sub: 'Photo', icon: 'user', meta: 'Mon' }, { title: 'Mom', sub: 'Call me when you can', icon: 'heart', meta: 'Sun' }] }, { 'items.0': go('thread'), 'items.1': go('thread'), 'items.2': go('thread'), 'items.3': go('thread') }),
          tabs(T, 0),
        ], { tab: true, icon: 'chat' }),
        scr('thread', 'Sam Ortiz', [
          b('nav', { title: 'Sam Ortiz', back: true, action: 'more' }),
          b('chat', { messages: [{ who: 'them', text: 'Are we still on for dinner?' }, { who: 'me', text: 'Yes! 7 at the noodle place?' }, { who: 'them', text: 'Perfect. I’ll book a table.' }, { who: 'me', text: 'See you then' }, { who: 'them', text: 'See you at 7!' }], placeholder: 'Message' }),
        ]),
        scr('people', 'People', [
          b('header', { eyebrow: '', title: 'People', sub: '128 contacts' }),
          b('list', { title: 'Favorites', items: [{ title: 'Sam Ortiz', sub: 'Online', icon: 'user', meta: '' }, { title: 'Maya Lee', sub: 'Last seen today', icon: 'user', meta: '' }] }, { 'items.0': go('thread'), 'items.1': go('thread') }),
          tabs(T, 1),
        ], { tab: true, icon: 'users' }),
        scr('settings', 'Settings', [
          b('profile', { name: 'Jordan Reyes', handle: '@jordan', bio: '', stats: [], button: 'Edit profile' }),
          b('settings', { title: 'Settings', items: [{ label: 'Notifications', kind: 'toggle', on: true }, { label: 'Read receipts', kind: 'toggle', on: true }, { label: 'Privacy', kind: 'chevron' }, { label: 'Chat backup', kind: 'chevron' }] }),
          tabs(T, 2),
        ], { tab: true, icon: 'settings' }),
      ]);
    } },
    { id: 'social', cat: 'Social', sweet: true, title: 'Social feed', summary: 'A feed, a post and profiles', icon: 'heart', accent: '#D9536F', font: 'friendly', build: () => {
      const T = [['Home', 'home', 'feed'], ['Explore', 'search', 'explore'], ['Alerts', 'bell', 'alerts'], ['Me', 'user', 'me']];
      return doc('Moments', { accent: '#D9536F', font: 'friendly', radius: 'round' }, [
        scr('feed', 'Home', [
          b('header', { eyebrow: '', title: 'Moments', sub: '' }),
          b('feed', { author: 'Priya Shah', time: '2h', text: 'First swim of the year. Cold, but worth it.', illus: 'wave', likes: '128', comments: '14' }, { '': go('post') }),
          b('feed', { author: 'Leo Martin', time: '5h', text: 'New mural on 5th street is finished!', illus: 'art', likes: '342', comments: '41' }, { '': go('post') }),
          tabs(T, 0),
        ], { tab: true, icon: 'home' }),
        scr('post', 'Post', [
          b('nav', { title: 'Post', back: true, action: 'share' }),
          b('feed', { author: 'Priya Shah', time: '2h', text: 'First swim of the year. Cold, but worth it.', illus: 'wave', likes: '128', comments: '14' }),
          b('chat', { messages: [{ who: 'them', text: 'So brave!!' }, { who: 'them', text: 'Which beach is this?' }, { who: 'me', text: 'North cove, before the crowds' }], placeholder: 'Add a comment' }),
        ]),
        scr('explore', 'Explore', [
          b('search', { placeholder: 'Search people and places', chips: ['Trending', 'Food', 'Art', 'Outdoors'] }),
          b('grid', { title: 'Trending', items: [{ title: 'Sunrise hikes', price: '2.1k posts', illus: 'mountain' }, { title: 'Street food', price: '980 posts', illus: 'food' }, { title: 'Murals', price: '640 posts', illus: 'art' }, { title: 'Cold swims', price: '410 posts', illus: 'wave' }] }),
          tabs(T, 1),
        ], { tab: true, icon: 'search' }),
        scr('alerts', 'Alerts', [
          b('header', { eyebrow: '', title: 'Notifications', sub: '' }),
          b('list', { title: 'Today', items: [{ title: 'Leo liked your photo', sub: '12 min ago', icon: 'heart', meta: '' }, { title: 'Sam started following you', sub: '1 h ago', icon: 'user', meta: '' }, { title: 'Priya commented: “so good”', sub: '3 h ago', icon: 'chat', meta: '' }] }),
          tabs(T, 2),
        ], { tab: true, icon: 'bell' }),
        scr('me', 'Me', [
          b('profile', { name: 'Jordan Reyes', handle: '@jordan', bio: 'Photos of small good things.', stats: [{ n: '86', label: 'Posts' }, { n: '1.2k', label: 'Followers' }, { n: '310', label: 'Following' }], button: 'Edit profile' }),
          b('grid', { title: 'Posts', items: [{ title: 'Morning', price: '', illus: 'sun' }, { title: 'Market', price: '', illus: 'food' }, { title: 'Coast', price: '', illus: 'wave' }, { title: 'City', price: '', illus: 'art' }] }),
          tabs(T, 3),
        ], { tab: true, icon: 'user' }),
      ]);
    } },
    { id: 'shop', cat: 'Shopping', title: 'Shop', summary: 'Products, a product page and a cart', icon: 'cart', accent: '#15120F', font: 'clean', build: () => {
      const T = [['Shop', 'home', 'home'], ['Search', 'search', 'search'], ['Cart', 'cart', 'cart'], ['Me', 'user', 'me']];
      return doc('Common Goods', { accent: '#2B2B2B', font: 'clean', radius: 'soft' }, [
        scr('home', 'Shop', [
          b('header', { eyebrow: 'Spring collection', title: 'Common Goods', sub: 'Made to last, priced fairly' }),
          b('search', { placeholder: 'Search products', chips: ['New', 'Home', 'Kitchen', 'Outdoor'] }),
          b('grid', { title: 'New this week', items: [{ title: 'Linen tote', price: '$38', illus: 'bag' }, { title: 'Stoneware mug', price: '$24', illus: 'coffee' }, { title: 'Wool throw', price: '$96', illus: 'leaf' }, { title: 'Field journal', price: '$18', illus: 'book' }] }, { 'items.0': go('product', 'morph'), 'items.1': go('product', 'morph'), 'items.2': go('product', 'morph'), 'items.3': go('product', 'morph') }),
          tabs(T, 0),
        ], { tab: true, icon: 'home' }),
        scr('product', 'Product', [
          b('nav', { title: '', back: true, action: 'heart' }),
          b('image', { illus: 'bag', caption: '' }),
          b('header', { eyebrow: '$38', title: 'Linen tote', sub: 'Heavy linen, leather handles, an inside pocket for keys.' }),
          b('search', { placeholder: '', chips: ['Natural', 'Charcoal', 'Olive'] }),
          b('button', { label: 'Add to cart', style: 'primary', icon: 'cart' }, { '': go('cart', 'sheet') }),
        ]),
        scr('search', 'Search', [
          b('search', { placeholder: 'Search products', chips: ['Under $25', 'Gifts', 'Bestsellers'] }),
          b('list', { title: 'Popular searches', items: [{ title: 'Mugs', sub: '', icon: 'search', meta: '' }, { title: 'Candles', sub: '', icon: 'search', meta: '' }, { title: 'Totes', sub: '', icon: 'search', meta: '' }] }),
          tabs(T, 1),
        ], { tab: true, icon: 'search' }),
        scr('cart', 'Cart', [
          b('header', { eyebrow: '', title: 'Your cart', sub: '2 items' }),
          b('list', { title: '', items: [{ title: 'Linen tote', sub: 'Natural · 1', icon: 'tag', meta: '$38.00' }, { title: 'Stoneware mug', sub: 'Sage · 1', icon: 'tag', meta: '$24.00' }] }),
          b('stats', { tiles: [{ n: '$62.00', label: 'Subtotal' }, { n: 'Free', label: 'Shipping' }] }),
          b('button', { label: 'Check out', style: 'primary', icon: 'lock' }, { '': go('done', 'fade') }),
          tabs(T, 2),
        ], { tab: true, icon: 'cart' }),
        scr('done', 'Order placed', [
          b('empty', { icon: 'check', title: 'Thank you!', text: 'This is a design: no payment was taken. Connect a payment provider when the app is built for real.', button: 'Keep shopping' }, { button: go('home', 'fade') }),
        ]),
        scr('me', 'Me', [
          b('profile', { name: 'Jordan Reyes', handle: 'jordan@example.com', bio: '', stats: [{ n: '4', label: 'Orders' }, { n: '7', label: 'Saved' }], button: 'Edit profile' }),
          b('settings', { title: 'Account', items: [{ label: 'Orders', kind: 'chevron' }, { label: 'Addresses', kind: 'chevron' }, { label: 'Sale alerts', kind: 'toggle', on: true }] }),
          tabs(T, 3),
        ], { tab: true, icon: 'user' }),
      ]);
    } },
    { id: 'booking', cat: 'Business', title: 'Booking', summary: 'Services, a time picker and a confirmation', icon: 'calendar', accent: '#2A8C80', font: 'clean', build: () => {
      const T = [['Book', 'calendar', 'home'], ['Visits', 'clock', 'visits'], ['Profile', 'user', 'me']];
      return doc('Fern Studio', { accent: '#2A8C80', font: 'elegant', radius: 'round' }, [
        scr('home', 'Book', [
          b('header', { eyebrow: 'Fern Studio · Yoga and massage', title: 'Book a session', sub: 'Open today until 8 PM' }),
          b('list', { title: 'Services', items: [{ title: 'Morning flow yoga', sub: '60 min', icon: 'leaf', meta: '$22' }, { title: 'Deep tissue massage', sub: '50 min', icon: 'heart', meta: '$70' }, { title: 'Breathwork', sub: '30 min', icon: 'sparkle', meta: '$15' }] }, { 'items.0': go('time'), 'items.1': go('time'), 'items.2': go('time') }),
          b('map', { label: '14 Fern Lane, Riverside', pins: 1 }),
          tabs(T, 0),
        ], { tab: true, icon: 'calendar' }),
        scr('time', 'Pick a time', [
          b('nav', { title: 'Morning flow yoga', back: true, action: '' }),
          b('calendar', { title: 'March', days: ['Mon 3', 'Tue 4', 'Wed 5', 'Thu 6', 'Fri 7'], on: 1, slots: ['8:00', '9:30', '11:00', '12:30', '17:00', '18:30'], pick: 1 }),
          b('button', { label: 'Book 9:30 on Tuesday', style: 'primary', icon: 'check' }, { '': go('done', 'fade') }),
        ]),
        scr('done', 'Booked', [
          b('empty', { icon: 'check', title: 'You’re booked', text: 'Morning flow yoga, Tuesday at 9:30. We’ll remind you an hour before.', button: 'See my visits' }, { button: go('visits', 'fade') }),
        ]),
        scr('visits', 'Visits', [
          b('header', { eyebrow: '', title: 'Your visits', sub: '' }),
          b('list', { title: 'Upcoming', items: [{ title: 'Morning flow yoga', sub: 'Tue 4 · 9:30', icon: 'clock', meta: '' }] }),
          b('list', { title: 'Past', items: [{ title: 'Deep tissue massage', sub: 'Feb 21', icon: 'check', meta: '' }, { title: 'Breathwork', sub: 'Feb 14', icon: 'check', meta: '' }] }),
          tabs(T, 1),
        ], { tab: true, icon: 'clock' }),
        scr('me', 'Profile', [
          b('profile', { name: 'Sam Ortiz', handle: 'Member', bio: '', stats: [{ n: '12', label: 'Visits' }, { n: '3', label: 'Credits' }], button: 'Edit profile' }),
          b('settings', { title: 'Settings', items: [{ label: 'Reminders', kind: 'toggle', on: true }, { label: 'Payment', kind: 'chevron' }, { label: 'Help', kind: 'chevron' }] }),
          tabs(T, 2),
        ], { tab: true, icon: 'user' }),
      ]);
    } },
    { id: 'meditation', cat: 'Health', sweet: true, title: 'Meditation', summary: 'Sessions, a calm player and your minutes', icon: 'moon', accent: '#7A5CC2', font: 'friendly', build: () => {
      const T = [['Today', 'sun', 'home'], ['Sessions', 'list', 'sessions'], ['Me', 'user', 'me']];
      return doc('Stillwater', { accent: '#7A5CC2', font: 'friendly', mode: 'dark', radius: 'pill', motion: 'calm' }, [
        scr('home', 'Today', [
          b('header', { eyebrow: 'Good evening', title: 'Take a breath', sub: 'Your daily calm: 10 minutes' }),
          b('card', { title: 'Evening wind-down', sub: 'Guided · 10 min', meta: 'Today', button: 'Begin', illus: 'moon' }, { button: go('player', 'morph') }),
          b('stats', { tiles: [{ n: '7', label: 'Day streak' }, { n: '214', label: 'Minutes' }] }),
          tabs(T, 0),
        ], { tab: true, icon: 'sun' }),
        scr('player', 'Session', [
          b('nav', { title: '', back: true, action: '' }),
          b('player', { title: 'Evening wind-down', artist: 'With Ana · 10 min', progress: 35, illus: 'moon' }),
          b('text', { text: 'Let your shoulders drop. Breathe in for four, out for six.' }),
        ]),
        scr('sessions', 'Sessions', [
          b('header', { eyebrow: '', title: 'Sessions', sub: '' }),
          b('search', { placeholder: 'Search sessions', chips: ['Sleep', 'Focus', 'Anxiety', 'Walking'] }),
          b('list', { title: 'For sleep', items: [{ title: 'Body scan', sub: '15 min', icon: 'moon', meta: '' }, { title: 'Rain on the roof', sub: '30 min', icon: 'music', meta: '' }, { title: 'Counting down', sub: '8 min', icon: 'clock', meta: '' }] }, { 'items.0': go('player'), 'items.1': go('player'), 'items.2': go('player') }),
          tabs(T, 1),
        ], { tab: true, icon: 'list' }),
        scr('me', 'Me', [
          b('profile', { name: 'Ana Silva', handle: 'Since November', bio: '', stats: [{ n: '214', label: 'Minutes' }, { n: '31', label: 'Sessions' }], button: 'Edit profile' }),
          b('settings', { title: 'Settings', items: [{ label: 'Bedtime reminder', kind: 'toggle', on: true }, { label: 'Session length', kind: 'value', value: '10 min' }, { label: 'Sounds', kind: 'chevron' }] }),
          tabs(T, 2),
        ], { tab: true, icon: 'user' }),
      ]);
    } },
    { id: 'todo', cat: 'Productivity', title: 'To-do', summary: 'Lists, tasks and a new task sheet', icon: 'check', accent: '#F26B1D', font: 'clean', build: () => doc('Done Today', { accent: '#F26B1D', font: 'clean', radius: 'soft' }, [
      scr('home', 'Today', [
        b('header', { eyebrow: 'Wednesday', title: 'Today', sub: '4 tasks left' }),
        b('checklist', { title: 'Tasks', items: [{ title: 'Send the invoice', sub: 'Work · 10:00', icon: '', done: true, streak: '' }, { title: 'Call the dentist', sub: 'Personal', icon: '', done: false, streak: '' }, { title: 'Pick up the bike', sub: 'Errands · 17:30', icon: '', done: false, streak: '' }, { title: 'Plan Saturday', sub: 'Family', icon: '', done: false, streak: '' }, { title: 'Water the plants', sub: 'Home', icon: '', done: false, streak: '' }] }),
        b('list', { title: 'Lists', items: [{ title: 'Work', sub: '6 tasks', icon: 'list', meta: '' }, { title: 'Groceries', sub: '9 items', icon: 'cart', meta: '' }, { title: 'Someday', sub: '14 ideas', icon: 'sparkle', meta: '' }] }, { 'items.0': go('list'), 'items.1': go('list'), 'items.2': go('list') }),
        b('button', { label: 'New task', style: 'primary', icon: 'plus' }, { '': go('new', 'sheet') }),
      ]),
      scr('list', 'List', [
        b('nav', { title: 'Groceries', back: true, action: 'more' }),
        b('checklist', { title: '', items: [{ title: 'Oat milk', sub: '', icon: '', done: false, streak: '' }, { title: 'Bananas', sub: '', icon: '', done: true, streak: '' }, { title: 'Coffee beans', sub: '', icon: '', done: false, streak: '' }, { title: 'Bread', sub: '', icon: '', done: false, streak: '' }] }),
      ]),
      scr('new', 'New task', [
        b('nav', { title: 'New task', back: true, action: '' }),
        b('form', { fields: [{ label: 'Task', placeholder: 'What needs doing?' }, { label: 'When', placeholder: 'Today' }, { label: 'List', placeholder: 'Personal' }], button: 'Add task' }, { button: go('home', 'fade') }),
      ]),
    ]) },
    { id: 'gamemenu', cat: 'Games', sweet: true, title: 'Game menu', summary: 'A title screen, levels, settings and a shop', icon: 'game', accent: '#38C6B1', font: 'pixel', build: () => doc('Lantern Run', { accent: '#38C6B1', font: 'pixel', mode: 'dark', radius: 'sharp', motion: 'snappy' }, [
      scr('title', 'Title', [
        b('image', { illus: 'lantern', caption: '' }),
        b('header', { eyebrow: 'A game by the Ember crew', title: 'Lantern Run', sub: 'Light the way home.' }),
        b('button', { label: 'Play', style: 'primary', icon: 'play' }, { '': go('levels', 'morph') }),
        b('button', { label: 'Settings', style: 'secondary', icon: 'settings' }, { '': go('settings', 'sheet') }),
        b('button', { label: 'Shop', style: 'secondary', icon: 'gift' }, { '': go('shop', 'push') }),
      ]),
      scr('levels', 'Levels', [
        b('nav', { title: 'World 1', back: true, action: '' }),
        b('grid', { title: 'Pick a level', items: [{ title: '1 · Meadow', price: '3 stars', illus: 'leaf' }, { title: '2 · Woods', price: '2 stars', illus: 'mountain' }, { title: '3 · River', price: '1 star', illus: 'wave' }, { title: '4 · Caves', price: 'Locked', illus: 'lantern' }] }),
        b('stats', { tiles: [{ n: '6', label: 'Stars' }, { n: '1,240', label: 'Coins' }] }),
      ]),
      scr('settings', 'Settings', [
        b('nav', { title: 'Settings', back: true, action: '' }),
        b('settings', { title: '', items: [{ label: 'Music', kind: 'toggle', on: true }, { label: 'Sound effects', kind: 'toggle', on: true }, { label: 'Vibration', kind: 'toggle', on: false }, { label: 'Language', kind: 'value', value: 'English' }] }),
      ]),
      scr('shop', 'Shop', [
        b('nav', { title: 'Shop', back: true, action: '' }),
        b('grid', { title: 'Lantern skins', items: [{ title: 'Copper', price: '200 coins', illus: 'lantern' }, { title: 'Jade', price: '450 coins', illus: 'lantern' }, { title: 'Starlight', price: '900 coins', illus: 'sparkle' }, { title: 'Ember', price: 'Owned', illus: 'flame' }] }),
      ]),
    ]) },
  ];

  // ---------- kits: screens you add to any app ----------
  const KITS = {
    settings: { title: 'Settings screen', summary: 'Account, notifications and help rows with switches', icon: 'settings', tab: 'settings', screens: () => [scr('settings', 'Settings', [
      b('header', { eyebrow: '', title: 'Settings', sub: '' }),
      b('settings', { title: 'Account', items: [{ label: 'Name', kind: 'value', value: 'Jordan' }, { label: 'Email', kind: 'value', value: 'jordan@example.com' }, { label: 'Password', kind: 'chevron' }] }),
      b('settings', { title: 'Preferences', items: [{ label: 'Notifications', kind: 'toggle', on: true }, { label: 'Dark mode', kind: 'toggle', on: false }, { label: 'Language', kind: 'value', value: 'English' }] }),
      b('settings', { title: 'Support', items: [{ label: 'Help center', kind: 'chevron' }, { label: 'Privacy policy', kind: 'chevron' }, { label: 'Sign out', kind: 'chevron' }] }),
    ], { icon: 'settings' })] },
    onboarding: { title: 'Onboarding', summary: 'Three welcome pages with a Get started button', icon: 'sparkle', screens: () => [scr('welcome', 'Welcome', [
      b('onboarding', { pages: [{ title: 'Welcome', text: 'Everything you need, in one calm place.', illus: 'sparkle' }, { title: 'Stay on track', text: 'Gentle reminders, never noise.', illus: 'target' }, { title: 'Yours to keep', text: 'Your data stays on your phone.', illus: 'lock' }], button: 'Get started', skip: 'Skip' }),
    ], { icon: 'sparkle', first: true })] },
    paywall: { title: 'Paywall layout', summary: 'Plans, features and a trial button. Payments are not connected', icon: 'star', screens: () => [scr('premium', 'Premium', [
      b('nav', { title: '', back: true, action: '' }),
      b('paywall', { title: 'Go Premium', sub: 'Unlock everything and support the makers.', features: ['Unlimited items', 'Sync across devices', 'Themes and icons', 'Priority help'], plans: [{ name: 'Yearly', price: '$29.99', per: 'per year', badge: 'Best value' }, { name: 'Monthly', price: '$3.99', per: 'per month', badge: '' }], pick: 0, button: 'Start free trial', fine: 'Cancel anytime.' }),
    ], { icon: 'star' })] },
    profile: { title: 'Profile', summary: 'A profile header, stats and account rows', icon: 'user', tab: 'profile', screens: () => [scr('profile', 'Profile', [
      b('profile', { name: 'Jordan Reyes', handle: '@jordan', bio: 'Making things with friends.', stats: [{ n: '42', label: 'Posts' }, { n: '1.2k', label: 'Followers' }, { n: '180', label: 'Following' }], button: 'Edit profile' }),
      b('list', { title: 'Activity', items: [{ title: 'Saved', sub: '12 items', icon: 'bookmark', meta: '' }, { title: 'History', sub: 'Last 30 days', icon: 'clock', meta: '' }] }),
    ], { icon: 'user' })] },
    signin: { title: 'Sign in', summary: 'Sign in and create-account screens', icon: 'lock', screens: () => [scr('signin', 'Sign in', [
      b('signin', { title: 'Welcome back', sub: 'Sign in to keep going.', email: 'Email', password: 'Password', button: 'Sign in', alt: 'New here? Create an account' }, { alt: go('signup') }),
    ], { icon: 'lock' }), scr('signup', 'Create account', [
      b('nav', { title: 'Create account', back: true, action: '' }),
      b('form', { fields: [{ label: 'Name', placeholder: 'Your name' }, { label: 'Email', placeholder: 'you@example.com' }, { label: 'Password', placeholder: 'At least 8 characters' }], button: 'Create account' }),
    ])] },
    chat: { title: 'Chat', summary: 'A conversation list and a chat screen', icon: 'chat', screens: () => [scr('messages', 'Messages', [
      b('header', { eyebrow: '', title: 'Messages', sub: '' }),
      b('list', { title: '', items: [{ title: 'Sam Ortiz', sub: 'Sounds good!', icon: 'user', meta: '9:41' }, { title: 'Team', sub: 'Maya: shipped it', icon: 'users', meta: 'Mon' }] }, { 'items.0': go('conversation'), 'items.1': go('conversation') }),
    ], { icon: 'chat' }), scr('conversation', 'Conversation', [
      b('nav', { title: 'Sam Ortiz', back: true, action: '' }),
      b('chat', { messages: [{ who: 'them', text: 'Did you see the new design?' }, { who: 'me', text: 'Love it. Shipping tonight?' }, { who: 'them', text: 'Sounds good!' }], placeholder: 'Message' }),
    ])] },
    shop: { title: 'Shop', summary: 'A product grid, a product page and a cart', icon: 'cart', screens: () => [scr('store', 'Store', [
      b('header', { eyebrow: '', title: 'Store', sub: '' }),
      b('grid', { title: 'Popular', items: [{ title: 'Sticker pack', price: '$6', illus: 'sparkle' }, { title: 'Tote bag', price: '$22', illus: 'bag' }] }, { 'items.0': go('item'), 'items.1': go('item') }),
    ], { icon: 'cart' }), scr('item', 'Item', [
      b('nav', { title: '', back: true, action: '' }),
      b('image', { illus: 'bag', caption: '' }),
      b('header', { eyebrow: '$22', title: 'Tote bag', sub: 'Sturdy cotton, printed by hand.' }),
      b('button', { label: 'Add to cart', style: 'primary', icon: 'cart' }),
    ])] },
    charts: { title: 'Stats', summary: 'A big number, a chart and stat tiles', icon: 'chart', screens: () => [scr('insights', 'Insights', [
      b('header', { eyebrow: 'Last 7 days', title: 'Insights', sub: '' }),
      b('chart', { kind: 'line', title: 'Activity', big: '1,284', values: [12, 18, 15, 22, 28, 26, 34], labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] }),
      b('stats', { tiles: [{ n: '+12%', label: 'This week' }, { n: '34', label: 'Best day' }, { n: '7', label: 'Streak' }] }),
    ], { icon: 'chart' })] },
    empty: { title: 'Empty state', summary: 'A friendly first screen when there is nothing yet', icon: 'sparkle', screens: () => [scr('empty', 'Nothing yet', [
      b('empty', { icon: 'sparkle', title: 'Nothing here yet', text: 'Add your first one and it will show up here.', button: 'Add the first one' }),
    ], { icon: 'sparkle' })] },
    player: { title: 'Media player', summary: 'A now-playing screen with a progress bar', icon: 'music', screens: () => [scr('playing', 'Now playing', [
      b('nav', { title: 'Now playing', back: true, action: 'more' }),
      b('player', { title: 'Golden Hour', artist: 'The Lanterns', progress: 42, illus: 'music' }),
    ], { icon: 'music' })] },
  };

  // what a component starts as when you add it from the library (appcreator-core.js BLOCKS uses these)
  const DEFAULTS = {
    nav: { title: 'Title', back: true, action: '' },
    header: { eyebrow: 'Eyebrow', title: 'A clear title', sub: 'One line that says what this screen is for.' },
    tabs: { items: [{ label: 'Home', icon: 'home' }, { label: 'Search', icon: 'search' }, { label: 'Profile', icon: 'user' }], on: 0 },
    list: { title: 'List', items: [{ title: 'First item', sub: 'A short detail', icon: 'star', meta: '' }, { title: 'Second item', sub: 'A short detail', icon: 'heart', meta: '' }, { title: 'Third item', sub: 'A short detail', icon: 'bookmark', meta: '' }] },
    cards: { title: 'Cards', items: [{ title: 'Card one', sub: 'A short detail', illus: 'sparkle', meta: '' }, { title: 'Card two', sub: 'A short detail', illus: 'leaf', meta: '' }] },
    card: { title: 'Featured', sub: 'Something worth a tap', meta: 'New', button: 'Open', illus: 'sparkle' },
    form: { fields: [{ label: 'Name', placeholder: 'Your name' }, { label: 'Email', placeholder: 'you@example.com' }], button: 'Save' },
    search: { placeholder: 'Search', chips: ['All', 'Recent', 'Saved'] },
    chat: { messages: [{ who: 'them', text: 'Hi! How is it going?' }, { who: 'me', text: 'Great, thanks!' }], placeholder: 'Message' },
    feed: { author: 'Priya Shah', time: '1h', text: 'A post with a picture.', illus: 'sun', likes: '24', comments: '3' },
    profile: { name: 'Your name', handle: '@you', bio: 'A short bio.', stats: [{ n: '12', label: 'Posts' }, { n: '340', label: 'Followers' }], button: 'Edit profile' },
    settings: { title: 'Settings', items: [{ label: 'Notifications', kind: 'toggle', on: true }, { label: 'Language', kind: 'value', value: 'English' }, { label: 'Help', kind: 'chevron' }] },
    onboarding: { pages: [{ title: 'Welcome', text: 'A line about what the app does.', illus: 'sparkle' }, { title: 'One more thing', text: 'A second reason to love it.', illus: 'heart' }], button: 'Get started', skip: 'Skip' },
    signin: { title: 'Welcome back', sub: 'Sign in to continue.', email: 'Email', password: 'Password', button: 'Sign in', alt: 'Create an account' },
    empty: { icon: 'sparkle', title: 'Nothing here yet', text: 'When there is something, it shows up here.', button: 'Add one' },
    paywall: { title: 'Go Premium', sub: 'Everything, unlocked.', features: ['Unlimited use', 'All themes'], plans: [{ name: 'Yearly', price: '$29.99', per: 'per year', badge: 'Best value' }, { name: 'Monthly', price: '$3.99', per: 'per month', badge: '' }], pick: 0, button: 'Start free trial', fine: 'Cancel anytime.' },
    chart: { kind: 'bar', title: 'This week', big: '128', values: [4, 7, 5, 9, 6, 8, 10], labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] },
    player: { title: 'Song title', artist: 'Artist', progress: 30, illus: 'music' },
    map: { label: 'A place on the map', pins: 3 },
    button: { label: 'Continue', style: 'primary', icon: '' },
    text: { text: 'A paragraph of words. Click to edit.' },
    image: { illus: 'sparkle', caption: '' },
    stats: { tiles: [{ n: '12', label: 'Done' }, { n: '3', label: 'Left' }, { n: '80%', label: 'Progress' }] },
    checklist: { title: 'Checklist', items: [{ title: 'First thing', sub: '', icon: '', done: true, streak: '' }, { title: 'Second thing', sub: '', icon: '', done: false, streak: '' }] },
    timer: { time: '05:00', label: 'Focus', sub: 'Stay with it', button: 'Start' },
    grid: { title: 'Grid', items: [{ title: 'One', price: '$10', illus: 'sparkle' }, { title: 'Two', price: '$12', illus: 'leaf' }, { title: 'Three', price: '$8', illus: 'heart' }, { title: 'Four', price: '$15', illus: 'star' }] },
    calendar: { title: 'Pick a day', days: ['Mon 3', 'Tue 4', 'Wed 5', 'Thu 6'], on: 0, slots: ['9:00', '10:30', '13:00', '15:30'], pick: 0 },
  };

  return { ICONS, ICON_NAMES, TEMPLATES, KITS, DEFAULTS };
});
