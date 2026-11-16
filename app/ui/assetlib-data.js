// The design library's own content (feat/asset-libs): named colour palettes and short UI sounds, both made for TribeCode
// (CC0: use them anywhere, no credit needed), plus catalog(), which gathers every design asset the app already ships into
// one list with its licence and source: icons (a Lucide subset, ISC), font pairs (SIL OFL), pictures, motion feels,
// moving backgrounds (some ported from ThreeUI Community by Meng To, MIT), App Creator parts and screens, website sections.
// Plain data and functions, no DOM: window.TribeAssetData in the browser, require() on the server and in tests.
//   PALETTES  [{ id, name, mood, colors: { accent, ink, bg, more: [hex, hex] } }]      (56)
//   SOUNDS    [{ id, name, use, notes: [[freq Hz, start s, length s, wave, gain]], sweep? }]   (52) drawn with WebAudio, no files
//   catalog(mods) -> [{ kind, id, name, tags, license, source }]   mods = { site, app, appParts, fx, motion } (any may be missing)
//   KINDS     [{ id, name }] in the order the picker shows them
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TribeAssetData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const P = (id, name, mood, accent, ink, bg, a, b) => ({ id, name, mood, colors: { accent, ink, bg, more: [a, b] } });
  const PALETTES = [
    P('ember', 'Ember', 'warm bold', '#F26B1D', '#1B1F24', '#FBF8F4', '#FFD3B5', '#7A3410'),
    P('sunset', 'Sunset', 'warm soft', '#F0614F', '#2B1A1E', '#FFF6F0', '#F9B27A', '#8E3B5E'),
    P('apricot', 'Apricot', 'warm soft', '#F49B4A', '#2A2218', '#FFF8EF', '#FCD9AE', '#9A5A1C'),
    P('terracotta', 'Terracotta', 'earthy', '#C8603A', '#2E2420', '#F7F1EA', '#E7C3A6', '#6B3A2A'),
    P('clay', 'Clay', 'earthy calm', '#B5714F', '#2F2925', '#F4EEE8', '#DCC6B6', '#5E4337'),
    P('desert', 'Desert', 'earthy warm', '#D98B48', '#3A2E22', '#FAF3E7', '#EBCFA6', '#8B5E34'),
    P('olive', 'Olive', 'earthy calm', '#7C8B3A', '#262A1C', '#F6F6EE', '#D3D9B0', '#4A5321'),
    P('moss', 'Moss', 'nature calm', '#4F7D4B', '#1E2A20', '#F2F6F0', '#BFD6BA', '#2D4A2A'),
    P('forest', 'Forest', 'nature dark', '#5FB37A', '#E8F1EA', '#13201A', '#244233', '#A9D9B7'),
    P('mint', 'Mint', 'fresh soft', '#2FBF8F', '#17302A', '#F1FBF7', '#B5EBD7', '#1F7A5D'),
    P('teal', 'Teal', 'fresh', '#38C6B1', '#14272A', '#F0FBF9', '#AEE9E0', '#1D7A6D'),
    P('lagoon', 'Lagoon', 'fresh cool', '#1FA2B8', '#122A31', '#EEF8FB', '#A6DCE6', '#0F6475'),
    P('ocean', 'Ocean', 'cool deep', '#2F6FDE', '#0F1C33', '#F2F6FD', '#B4CBF5', '#1B3F85'),
    P('sky', 'Sky', 'cool soft', '#4CA3F0', '#13263A', '#F2F8FE', '#BCDDFA', '#21609A'),
    P('indigo', 'Indigo', 'cool bold', '#6C7CFF', '#181B33', '#F4F5FF', '#C5CBFF', '#3742A8'),
    P('iris', 'Iris', 'cool soft', '#8B6CF0', '#1F1835', '#F7F4FE', '#D4C7FA', '#4D3399'),
    P('grape', 'Grape', 'bold', '#A04ACB', '#25162D', '#FBF4FE', '#E0BDF0', '#5E2678'),
    P('orchid', 'Orchid', 'soft', '#D46AB6', '#2D1828', '#FEF4FA', '#F2C3E3', '#83346C'),
    P('rose', 'Rose', 'warm soft', '#E5577D', '#2E1820', '#FFF4F7', '#F7BCCB', '#8F2E4A'),
    P('cherry', 'Cherry', 'bold', '#D7263D', '#2A1316', '#FFF5F5', '#F4B1B9', '#7E1422'),
    P('coral', 'Coral', 'warm fresh', '#FF7A59', '#2D1D18', '#FFF7F3', '#FFC9B8', '#A2402A'),
    P('lemon', 'Lemon', 'bright', '#E8C21C', '#2A2610', '#FFFCEB', '#F6E58F', '#7E6A08'),
    P('honey', 'Honey', 'warm', '#E3A21A', '#2C2311', '#FFF9EB', '#F3D58C', '#8A5E07'),
    P('lime', 'Lime', 'bright fresh', '#8AC926', '#1E2A10', '#F7FCEE', '#CFEA9C', '#4E7712'),
    P('neon', 'Neon night', 'dark bold', '#3CFF9E', '#E9FFF4', '#0B0F0D', '#1C2E25', '#0FAF66'),
    P('midnight', 'Midnight', 'dark calm', '#7C8CFF', '#E6E8F5', '#0F1222', '#1E2340', '#B9C1FF'),
    P('graphite', 'Graphite', 'dark plain', '#F2F2F2', '#E6E6E6', '#141518', '#2A2C31', '#8A8D94'),
    P('carbon', 'Carbon', 'dark warm', '#F26B1D', '#ECE7E2', '#12151A', '#1E242D', '#9A6A4E'),
    P('aurora', 'Aurora', 'dark fresh', '#38C6B1', '#E3F4F1', '#0D1A1C', '#16302F', '#6C7CFF'),
    P('plum', 'Plum night', 'dark soft', '#D67AE6', '#F3E6F6', '#1A1220', '#2C2035', '#8A5CA0'),
    P('ink', 'Ink', 'plain', '#1F2937', '#111827', '#FFFFFF', '#E5E7EB', '#6B7280'),
    P('paper', 'Paper', 'plain warm', '#2B2B2B', '#1C1C1C', '#F7F3EC', '#E6DED0', '#7A7368'),
    P('newsprint', 'Newsprint', 'plain', '#C2410C', '#1A1A1A', '#F5F2EA', '#DDD6C6', '#57534E'),
    P('mono', 'Mono', 'plain', '#000000', '#0A0A0A', '#FFFFFF', '#D4D4D4', '#737373'),
    P('stone', 'Stone', 'calm', '#78716C', '#1C1917', '#FAFAF9', '#D6D3D1', '#44403C'),
    P('slate', 'Slate', 'calm cool', '#475569', '#0F172A', '#F8FAFC', '#CBD5E1', '#1E293B'),
    P('fog', 'Fog', 'soft calm', '#7A8B99', '#1F272E', '#F4F6F8', '#D2DAE1', '#46525D'),
    P('sage', 'Sage', 'nature soft', '#8BA888', '#232B22', '#F5F8F4', '#D3E0D1', '#506B4D'),
    P('lavender', 'Lavender', 'soft', '#9D8DF1', '#221E33', '#F8F6FF', '#DCD5FB', '#5A4BB0'),
    P('blush', 'Blush', 'soft warm', '#E8A0A9', '#2E2023', '#FFF7F8', '#F6D3D8', '#9A5560'),
    P('peach', 'Peach', 'soft warm', '#FFAE88', '#2E2219', '#FFF8F3', '#FFDCC9', '#A8633F'),
    P('candy', 'Candy', 'playful', '#FF5DA2', '#2B1530', '#FFF5FB', '#7BDFF2', '#B2F7EF'),
    P('arcade', 'Arcade', 'playful dark', '#FFCC00', '#F4F1FF', '#1B1340', '#FF3EA5', '#00D1FF'),
    P('pixel', 'Pixel', 'playful', '#2DA44E', '#1B1F23', '#F6F8FA', '#FFD33D', '#E36209'),
    P('toybox', 'Toy box', 'playful bright', '#3A86FF', '#1E1E24', '#FFFDF7', '#FFBE0B', '#FB5607'),
    P('retro', 'Retro', 'warm playful', '#E76F51', '#264653', '#FFF8EE', '#E9C46A', '#2A9D8F'),
    P('nordic', 'Nordic', 'calm cool', '#5E81AC', '#2E3440', '#ECEFF4', '#88C0D0', '#BF616A'),
    P('matcha', 'Matcha', 'nature calm', '#7DA453', '#26301D', '#F7F9F2', '#D7E5C2', '#4B6B2C'),
    P('espresso', 'Espresso', 'warm dark', '#C68B59', '#F2E8DE', '#1E1611', '#3A2B21', '#E4C4A1'),
    P('berry', 'Berry', 'bold', '#B83280', '#2A1424', '#FDF4F9', '#F1BEDB', '#6B1C4B'),
    P('glacier', 'Glacier', 'cool soft', '#5BC0EB', '#132530', '#F3FAFD', '#C6E8F7', '#2A7EA3'),
    P('volcano', 'Volcano', 'dark warm', '#FF5A36', '#F5E9E4', '#1A0F0D', '#33201B', '#FFB199'),
    P('meadow', 'Meadow', 'nature bright', '#58B368', '#1F2A20', '#FAFDF6', '#F2D76B', '#2F7A3E'),
    P('harbor', 'Harbor', 'cool calm', '#2D6A8E', '#14232E', '#F3F7FA', '#A9C9DC', '#E07A5F'),
    P('saffron', 'Saffron', 'warm bright', '#F4A300', '#2C2210', '#FFFAEE', '#FFD98A', '#C1440E'),
    P('bubblegum', 'Bubblegum', 'playful soft', '#FF8FC7', '#2E1B28', '#FFF6FB', '#B8F2E6', '#7C5CFF'),
  ];
  // short sounds, drawn with WebAudio each time (no files to fetch, nothing to license): notes = [freq, start, len, wave, gain]
  const S = (id, name, use, notes, sweep) => ({ id, name, use, notes, ...(sweep ? { sweep } : {}) });
  const SOUNDS = [
    S('click', 'Click', 'a button press', [[1800, 0, 0.018, 'square', 0.18]]),
    S('tap', 'Soft tap', 'a light tap', [[880, 0, 0.04, 'sine', 0.3]]),
    S('tick', 'Tick', 'a slider step', [[2400, 0, 0.012, 'triangle', 0.2]]),
    S('pop', 'Pop', 'something appears', [[520, 0, 0.07, 'sine', 0.35]], 1.8),
    S('bubble', 'Bubble', 'a new message', [[700, 0, 0.09, 'sine', 0.3]], 2.2),
    S('toggle-on', 'Switch on', 'a switch turns on', [[660, 0, 0.05, 'sine', 0.3], [990, 0.05, 0.06, 'sine', 0.25]]),
    S('toggle-off', 'Switch off', 'a switch turns off', [[990, 0, 0.05, 'sine', 0.25], [660, 0.05, 0.06, 'sine', 0.3]]),
    S('success', 'Success', 'it worked', [[523, 0, 0.09, 'sine', 0.3], [659, 0.08, 0.09, 'sine', 0.3], [784, 0.16, 0.16, 'sine', 0.3]]),
    S('error', 'Error', 'something went wrong', [[220, 0, 0.12, 'square', 0.12], [180, 0.12, 0.16, 'square', 0.12]]),
    S('warning', 'Warning', 'look at this', [[440, 0, 0.1, 'triangle', 0.25], [440, 0.16, 0.1, 'triangle', 0.25]]),
    S('notify', 'Notify', 'a notification', [[880, 0, 0.08, 'sine', 0.25], [1320, 0.09, 0.14, 'sine', 0.22]]),
    S('chime', 'Chime', 'a gentle reminder', [[1047, 0, 0.5, 'sine', 0.2], [1568, 0, 0.5, 'sine', 0.1]]),
    S('bell', 'Bell', 'a timer is done', [[880, 0, 0.9, 'sine', 0.22], [1760, 0, 0.6, 'sine', 0.08], [2640, 0, 0.3, 'sine', 0.05]]),
    S('whoosh', 'Whoosh', 'a page slides in', [[300, 0, 0.25, 'sawtooth', 0.06]], 0.35),
    S('swipe', 'Swipe', 'a card is swiped', [[900, 0, 0.12, 'triangle', 0.15]], 0.4),
    S('send', 'Send', 'a message goes', [[600, 0, 0.12, 'sine', 0.28]], 2.6),
    S('receive', 'Receive', 'a message arrives', [[1200, 0, 0.12, 'sine', 0.24]], 0.6),
    S('coin', 'Coin', 'points earned', [[988, 0, 0.06, 'square', 0.15], [1319, 0.06, 0.2, 'square', 0.15]]),
    S('level-up', 'Level up', 'a reward', [[523, 0, 0.08, 'square', 0.14], [659, 0.08, 0.08, 'square', 0.14], [784, 0.16, 0.08, 'square', 0.14], [1047, 0.24, 0.2, 'square', 0.14]]),
    S('jump', 'Jump', 'a game jump', [[300, 0, 0.15, 'square', 0.15]], 2.4),
    S('hit', 'Hit', 'a game hit', [[160, 0, 0.12, 'sawtooth', 0.18]], 0.4),
    S('laser', 'Laser', 'a game shot', [[1400, 0, 0.18, 'sawtooth', 0.12]], 0.2),
    S('power-up', 'Power up', 'a boost', [[220, 0, 0.35, 'square', 0.12]], 4),
    S('typing', 'Key press', 'typing', [[1500, 0, 0.01, 'square', 0.1], [1100, 0.03, 0.01, 'square', 0.08]]),
    S('camera', 'Shutter', 'a photo is taken', [[2000, 0, 0.02, 'square', 0.15], [1200, 0.05, 0.03, 'square', 0.12]]),
    S('delete', 'Delete', 'something is removed', [[400, 0, 0.14, 'triangle', 0.22]], 0.45),
    S('undo', 'Undo', 'a step back', [[700, 0, 0.06, 'sine', 0.22], [500, 0.06, 0.08, 'sine', 0.22]]),
    S('lock', 'Lock', 'locked', [[300, 0, 0.03, 'square', 0.18], [200, 0.04, 0.05, 'square', 0.18]]),
    S('unlock', 'Unlock', 'unlocked', [[200, 0, 0.03, 'square', 0.18], [420, 0.05, 0.06, 'square', 0.18]]),
    S('heartbeat', 'Heartbeat', 'a like', [[90, 0, 0.09, 'sine', 0.5], [90, 0.16, 0.09, 'sine', 0.4]]),
    S('ping', 'Ping', 'a mention', [[1760, 0, 0.25, 'sine', 0.2]]),
    S('ding', 'Ding', 'an answer arrives', [[1318, 0, 0.4, 'sine', 0.22], [2637, 0, 0.2, 'sine', 0.06]]),
    S('doorbell', 'Doorbell', 'someone joined', [[784, 0, 0.3, 'sine', 0.25], [622, 0.3, 0.45, 'sine', 0.25]]),
    S('alarm', 'Alarm', 'time is up', [[880, 0, 0.1, 'square', 0.12], [880, 0.15, 0.1, 'square', 0.12], [880, 0.3, 0.1, 'square', 0.12]]),
    S('buzz', 'Buzz', 'not allowed', [[110, 0, 0.18, 'sawtooth', 0.14]]),
    S('pluck', 'Pluck', 'a string note', [[392, 0, 0.3, 'triangle', 0.3]], 0.98),
    S('drop', 'Drop', 'something lands', [[900, 0, 0.12, 'sine', 0.3]], 0.3),
    S('blip', 'Blip', 'a small signal', [[1200, 0, 0.03, 'square', 0.12]]),
    S('select', 'Select', 'an item is picked', [[740, 0, 0.04, 'triangle', 0.25], [1110, 0.04, 0.05, 'triangle', 0.2]]),
    S('back', 'Back', 'going back', [[880, 0, 0.05, 'triangle', 0.22], [660, 0.05, 0.06, 'triangle', 0.22]]),
    S('open', 'Open', 'a sheet opens', [[400, 0, 0.14, 'sine', 0.25]], 1.8),
    S('close', 'Close', 'a sheet closes', [[720, 0, 0.12, 'sine', 0.25]], 0.55),
    S('refresh', 'Refresh', 'pull to refresh', [[500, 0, 0.08, 'sine', 0.2], [750, 0.08, 0.08, 'sine', 0.2], [1000, 0.16, 0.1, 'sine', 0.2]]),
    S('complete', 'Complete', 'a task is done', [[659, 0, 0.08, 'triangle', 0.25], [988, 0.08, 0.22, 'triangle', 0.25]]),
    S('reward', 'Reward', 'a badge earned', [[784, 0, 0.08, 'sine', 0.22], [988, 0.08, 0.08, 'sine', 0.22], [1175, 0.16, 0.08, 'sine', 0.22], [1568, 0.24, 0.3, 'sine', 0.2]]),
    S('fail', 'Fail', 'a game over', [[392, 0, 0.15, 'square', 0.13], [330, 0.15, 0.15, 'square', 0.13], [262, 0.3, 0.3, 'square', 0.13]]),
    S('countdown', 'Countdown beep', 'a count of three', [[880, 0, 0.08, 'sine', 0.25], [880, 0.5, 0.08, 'sine', 0.25], [1760, 1, 0.2, 'sine', 0.25]]),
    S('magic', 'Magic', 'something appears from nowhere', [[1047, 0, 0.06, 'sine', 0.15], [1319, 0.05, 0.06, 'sine', 0.15], [1568, 0.1, 0.06, 'sine', 0.15], [2093, 0.15, 0.25, 'sine', 0.12]]),
    S('snap', 'Snap', 'a thing clicks into place', [[2600, 0, 0.015, 'square', 0.2], [900, 0.015, 0.03, 'triangle', 0.15]]),
    S('zip', 'Zip', 'a fast slide', [[400, 0, 0.1, 'sawtooth', 0.08]], 4),
    S('boing', 'Boing', 'a playful bounce in a game', [[200, 0, 0.3, 'sine', 0.3]], 3),
    S('scroll', 'Scroll tick', 'a list scrolls', [[3000, 0, 0.008, 'square', 0.08]]),
  ];
  const KINDS = [
    { id: 'palette', name: 'Colours' }, { id: 'font', name: 'Fonts' }, { id: 'icon', name: 'Icons' }, { id: 'picture', name: 'Pictures' },
    { id: 'sound', name: 'Sounds' }, { id: 'motion', name: 'Motion' }, { id: 'background', name: 'Backgrounds' },
    { id: 'part', name: 'App parts' }, { id: 'screen', name: 'App screens' }, { id: 'section', name: 'Website sections' },
  ];
  const OWN = { license: 'CC0-1.0', source: 'Made for TribeCode' };
  // mods: { site: TribeSiteCfg, app: TribeAppCore, fx: TribeSiteFx, motion: TribeMotionKit }
  function catalog(mods) {
    const m = mods || {}, out = [];
    const add = (kind, id, name, tags, lic) => out.push({ kind, id: String(id), name: String(name || id), tags: tags || '', ...(lic || OWN) });
    PALETTES.forEach(p => add('palette', p.id, p.name, p.mood));
    SOUNDS.forEach(s => add('sound', s.id, s.name, s.use));
    if (m.site) {
      const S2 = m.site;
      (S2.ICON_NAMES || []).forEach(n => add('icon', 'site:' + n, n.replace(/-/g, ' '), 'website', { license: 'ISC', source: 'Lucide (lucide.dev), a subset inlined by TribeCode' }));
      const FLi = m.fonts || (typeof self !== 'undefined' && self.TribeFontLib) || (typeof module === 'object' && module.exports ? (() => { try { return require('./fontlib.js'); } catch { return null; } })() : null);
      Object.entries(S2.FONT_PAIRS || {}).forEach(([id, f]) => { const i = FLi && FLi.info(id), mood = FLi && FLi.PAIRS[id] ? FLi.PAIRS[id].mood : ''; add('font', id, f.name, `${f.display} ${f.body} ${mood}`, { license: 'OFL-1.1', source: i && i.online ? 'Google Fonts (SIL Open Font License), loaded when online' : 'SIL Open Font License fonts shipped with TribeCode' }); });
      Object.keys(S2.ILLUS || {}).forEach(n => add('picture', 'site:' + n, n, 'website'));
      (S2.TYPES || []).forEach(t => ((S2.BLOCKS[t] || {}).variants || []).forEach(v => add('section', `${t}:${v}`, `${(S2.BLOCKS[t] || {}).label || t}: ${v}`, t)));
    }
    if (m.app) {
      const A = m.app;
      (A.ICON_NAMES || []).forEach(n => add('icon', 'app:' + n, n, 'app'));
      (A.ILL_NAMES || []).forEach(n => add('picture', 'app:' + n, n, 'app'));
      (A.BLOCK_TYPES || []).forEach(t => add('part', t, (A.BLOCKS[t] || {}).label || t, (A.BLOCKS[t] || {}).group || ''));
      Object.entries(A.KITS || {}).forEach(([id, k]) => add('screen', id, k.title, k.summary || ''));
    }
    if (m.fx) (m.fx.LIST || []).forEach(k => add('background', k, (m.fx.KINDS[k] || {}).name, (m.fx.KINDS[k] || {}).about || '', { license: 'MIT', source: /^(dots|horizon|ribbons|streams|rings|orb|arc|drops)$/.test(k) ? 'Ported from ThreeUI Community by Meng To (MIT)' : 'Made for TribeCode' }));
    if (m.motion) (m.motion.FEEL_LIST || []).forEach(id => { const f = m.motion.FEELS[id] || {}; add('motion', id, f.name || id, f.about || ''); });
    return out;
  }
  // the nearest named palette to a colour (photos, the brand kit): plain RGB distance on the accent
  function nearest(hex) {
    const rgb = h => { const n = parseInt(String(h || '').replace('#', '').slice(0, 6), 16); return isFinite(n) ? [n >> 16 & 255, n >> 8 & 255, n & 255] : null; };
    const a = rgb(hex); if (!a) return null; let best = null, bd = Infinity;
    for (const p of PALETTES) { const b = rgb(p.colors.accent), d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  const palette = id => PALETTES.find(p => p.id === id || p.name.toLowerCase() === String(id || '').toLowerCase()) || null;
  return { PALETTES, SOUNDS, KINDS, catalog, nearest, palette };
});
