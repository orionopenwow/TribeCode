// Office looks, the shared core (browser and Node): what a character can wear, the colour palettes, and the palette
// swap that recolours a part. The browser draws with it (officespace-art.js, officelooks.js); the server checks looks
// with it (server/office.js); the contact sheets and tests read the same rules (scripts/dev/office-looks-sheet.js,
// app/test/office_looks_test.js).
//
// A look is plain numbers ({ v: 2, body: 0, skin: 3, hair: 5, hairColor: 2, ... }). Each part field indexes a list
// below (append-only, so saved looks keep meaning); each colour field indexes a palette.
//
// Recolouring is a palette swap, never a tint: every distinct colour of a part is one shade of its ramp. A shade keeps
// its place on the ramp: its lightness offset from the part's reference shade (in OKLab), and for coloured sources its
// chroma ratio and hue offset. Grey sources get hand-made style hue shifts (shadows cooler, highlights warmer). Near-black
// outlines and fixed details (lenses, badges, shirt whites) are kept. The number of distinct shades never changes.
//   TribeOfficeLooksCore = { PAL, PARTS, FIELDS, TABS, migrate, normalize, layers, files, recolor, composite, random,
//     seed, agent, describe, label, colourHex, conflicts }
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeOfficeLooksCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- colour (sRGB <-> OKLab / OKLCH) ----------
  const hex2 = v => v.toString(16).padStart(2, '0');
  const rgbOf = h => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hexOf = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const gam = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
  function toLab(hex) {
    const [r, g, b] = rgbOf(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function labRgb(L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
  }
  const lch = hex => { const [L, a, b] = toLab(hex); return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; };
  // OKLCH -> hex, lowering chroma until it fits in sRGB
  function fromLch(L, C, H) {
    L = Math.max(0, Math.min(1, L));
    for (let c = Math.max(0, C); ; c *= 0.92) {
      const h = H * Math.PI / 180, rgb = labRgb(L, c * Math.cos(h), c * Math.sin(h));
      if (rgb.every(v => v >= -0.5 && v <= 255.5) || c < 0.002) return hexOf(...rgb.map(v => Math.max(0, Math.min(255, Math.round(v)))));
    }
  }
  const hueToward = (h, to, deg) => { let d = ((to - h + 540) % 360) - 180; const step = Math.sign(d) * Math.min(Math.abs(d), deg); return (h + step + 360) % 360; };

  // ---------- palettes ----------
  // Skin: a realistic, inclusive range from porcelain to the deepest browns, with cool, neutral, golden and olive undertones.
  const P = (list) => list.map(([id, name, hex]) => ({ id, name, hex }));
  const PAL = {
    skin: P([['porcelain', 'Porcelain', '#f5d5c2'], ['fair', 'Fair', '#f2c4a6'], ['light', 'Light', '#e9a384'], ['golden-light', 'Golden light', '#e8b07a'],
      ['olive', 'Olive', '#c9a074'], ['medium', 'Medium', '#c98a5e'], ['tan', 'Tan', '#b67352'], ['golden-brown', 'Golden brown', '#a56a3c'],
      ['brown', 'Brown', '#8a5638'], ['deep-brown', 'Deep brown', '#6e412b'], ['deep', 'Deep', '#573628'], ['ebony', 'Ebony', '#42291e']]),
    hair: P([['black', 'Black', '#2b2525'], ['soft-black', 'Soft black', '#3d322d'], ['dark-brown', 'Dark brown', '#523625'], ['brown', 'Brown', '#704b2e'],
      ['chestnut', 'Chestnut', '#85482a'], ['auburn', 'Auburn', '#96402a'], ['ginger', 'Ginger', '#c56a2d'], ['strawberry', 'Strawberry blonde', '#d9966a'],
      ['dark-blonde', 'Dark blonde', '#a7834c'], ['blonde', 'Blonde', '#d9b66e'], ['platinum', 'Platinum', '#ebe0c6'], ['grey', 'Grey', '#8e8b89'],
      ['silver', 'Silver', '#cfcdd0'], ['red', 'Red', '#c8323e'], ['pink', 'Pink', '#ec84b0'], ['purple', 'Purple', '#8457c9'], ['blue', 'Blue', '#3d6fd8'],
      ['teal', 'Teal', '#2a9e98'], ['green', 'Green', '#4fae5b'], ['lilac', 'Lilac', '#b9a1ea']]),
    // Clothes: muted enough to sit on Pixel Agents' wood, navy walls and blue lounge, with a few brights.
    cloth: P([['white', 'White', '#e8e6e1'], ['cream', 'Cream', '#e6d8b8'], ['sand', 'Sand', '#c9b48e'], ['light-grey', 'Light grey', '#b4b8bf'],
      ['grey', 'Grey', '#80858d'], ['charcoal', 'Charcoal', '#4a4e57'], ['black', 'Black', '#2a2a30'], ['navy', 'Navy', '#2d3b6b'],
      ['denim', 'Denim', '#4069a8'], ['sky', 'Sky', '#7fb0de'], ['teal', 'Teal', '#2f8f88'], ['mint', 'Mint', '#8ccfae'],
      ['forest', 'Forest', '#2e6b47'], ['olive', 'Olive', '#6f7a38'], ['mustard', 'Mustard', '#d8a637'], ['orange', 'Orange', '#e2792f'],
      ['rust', 'Rust', '#a5492b'], ['coral', 'Coral', '#e8705e'], ['red', 'Red', '#c63b3b'], ['maroon', 'Maroon', '#7c2638'],
      ['pink', 'Pink', '#e98aa8'], ['lavender', 'Lavender', '#a898db'], ['purple', 'Purple', '#6b4aa0'], ['brown', 'Brown', '#74502f']]),
    eye: P([['brown', 'Brown', '#6a4126'], ['dark', 'Dark brown', '#3b281c'], ['hazel', 'Hazel', '#8a6a32'], ['amber', 'Amber', '#b07a28'],
      ['green', 'Green', '#3f8050'], ['blue', 'Blue', '#3d72b8'], ['grey', 'Grey', '#727d88'], ['violet', 'Violet', '#7a5aa8']]),
    metal: P([['gold', 'Gold', '#d9a83a'], ['silver', 'Silver', '#bcc3ca'], ['rose', 'Rose gold', '#d48b7a'], ['bronze', 'Bronze', '#b07a45'], ['black', 'Black', '#3a3a3e']]),
    frame: P([['black', 'Black', '#1c1c20'], ['tortoise', 'Tortoise', '#6b4026'], ['gold', 'Gold', '#c49a42'], ['silver', 'Silver', '#9aa3ad'],
      ['red', 'Red', '#b5313a'], ['blue', 'Blue', '#3d5fb0'], ['pink', 'Pink', '#e07aa0'], ['white', 'White', '#e6e6e6']]),
  };

  // ---------- parts ----------
  // Each entry: id, label, file (under characters/), how it recolours: pal (palette), ref (the source shade that becomes the
  // chosen colour), only (recolour just these source colours), keep (never recolour these), fixed (always this colour),
  // shift (a lightness offset for the whole part). null is "none".
  const G = '#6e6e6e', HAIR_REF = '#7b7b7b';
  const SKIN_LINE = ['#493e38', '#403632', '#5e514c'];   // the body's outline stays dark on light skin
  const CREAM = { '#f0f0f0': '#ece8de', '#d0d0d0': '#cbc3b4' };
  const GOLD_TRIM = { '#c9c9c9': '#e0a83a', '#ebebeb': '#ffdf8a', '#858585': '#e0a83a', '#a2a2a2': '#ffdf8a' };
  const cl = (id, label, dir, extra) => Object.assign({ id, label, file: `${dir}/${id}.png`, pal: 'cloth', ref: G }, extra || {});
  const hr = (id, label, extra) => Object.assign({ id, label, file: `hair/${id}.png`, pal: 'hair', ref: HAIR_REF }, extra || {});
  const PARTS = {
    body: [{ id: 'flat', label: 'Straight', file: 'body/flat.png', pal: 'skin', ref: '#e9a384', eyes: 'plain', outline: SKIN_LINE, outlineMax: 0.44 },
      { id: 'bust', label: 'Curvy', file: 'body/bust.png', pal: 'skin', ref: '#e9a384', eyes: 'lashes', outline: SKIN_LINE, outlineMax: 0.44 }],
    // Eyes: whites and iris (the iris takes the eye colour), lashes on top; brows take the hair colour.
    eyes: [null,
      { id: 'plain', label: 'Round', whites: 'plain', iris: 'plain', lashes: 'plain' },
      { id: 'lashes', label: 'Lashes', whites: 'lashes', iris: 'lashes', lashes: 'lashes' },
      { id: 'lidded', label: 'Sleepy', whites: 'plain', iris: 'plain', lashes: 'lidded' },
      { id: 'stern', label: 'Brows', whites: 'plain', iris: 'plain', lashes: 'stern' },
      { id: 'happy', label: 'Smiling', whites: null, iris: null, lashes: 'closed-stern' }],
    hair: [hr('short', 'Short'), hr('spiky', 'Spiky'), hr('parted', 'Parted'), hr('side_swept', 'Side-swept'), hr('mop', 'Mop'), hr('bowl_cut', 'Bowl cut'),
      hr('slicked_back', 'Slicked back'), hr('bob', 'Bob'), hr('shoulder_length', 'Shoulder-length'), hr('long', 'Long'), hr('long_waves', 'Long waves'),
      hr('long_bangs', 'Long with bangs'), hr('high_ponytail', 'High ponytail'), hr('low_ponytail', 'Low ponytail')],
    top: [cl('tshirt', 'T-shirt', 'top'), cl('long_sleeved_shirt', 'Long sleeves', 'top'), cl('turtleneck', 'Turtleneck', 'top'), cl('tank_top', 'Tank top', 'top'), cl('tank_long', 'Long tank', 'top')],
    pants: [cl('jeans', 'Jeans', 'pants'), cl('low_cut_jeans', 'Low-cut jeans', 'pants'), cl('shorts', 'Shorts', 'pants'), cl('fitted_shorts', 'Loose shorts', 'pants'),
      cl('skirt', 'Skirt', 'pants'), cl('short_skirt', 'Short skirt', 'pants'), cl('long_skirt', 'Long skirt', 'pants')],
    shoes: [cl('sneakers', 'Shoes', 'shoes'), cl('boots', 'Boots', 'shoes')],
    jacket: [null, cl('open_shirt', 'Open shirt', 'jacket'), cl('vest', 'Vest', 'jacket'), cl('blazer', 'Blazer', 'jacket'), cl('bomber', 'Bomber', 'jacket'), cl('long_coat', 'Long coat', 'jacket')],
    full: [null, cl('business_suit', 'Suit', 'full', { only: ['#071c2e', '#0f406a', '#114978', '#1164a9'], ref: '#114978' }),
      cl('suit_and_tie', 'Suit and tie', 'full', { only: ['#040404', '#1a3142', '#234d6b'], ref: '#234d6b', tie: true }),
      cl('dress', 'Dress', 'full'), cl('fitted_dress', 'Fitted dress', 'full')],
    beard: [null, ...['stubble', 'moustache', 'goatee', 'full_beard', 'long_beard'].map((id, i) => ({ id, label: ['Stubble', 'Moustache', 'Goatee', 'Full beard', 'Long beard'][i], file: `beard/${id}.png`, pal: 'hair', ref: '#5a3a26' }))],
    hat: [null, cl('plain_cap', 'Beanie', 'hat'), cl('flap_cap', 'Flap cap', 'hat', { fixed: GOLD_TRIM }), cl('badge_cap', 'Badge cap', 'hat', { fixed: GOLD_TRIM })],
    eyewear: [null, { id: 'glasses', label: 'Glasses', file: 'shades/glasses.png', pal: 'frame', only: ['#161616'], ref: '#161616' },
      { id: 'shades', label: 'Sunglasses', file: 'shades/shades.png', pal: 'frame', only: ['#161616'], ref: '#161616' },
      { id: 'hairshades', label: 'Shades on head', file: 'hairshades/hairshades.png', pal: 'frame', only: ['#161616'], ref: '#161616' }],
    earrings: [null, { id: 'earrings', label: 'Earrings', file: 'earrings/earrings.png', pal: 'metal', ref: '#d9a83a' }],
    necklace: [null, { id: 'necklace', label: 'Coin necklace', file: 'necklace/necklace.png', pal: 'metal', ref: '#d9a83a' },
      { id: 'necklace_chain', label: 'Chain', file: 'necklace/necklace_chain.png', pal: 'metal', ref: '#d9a83a' }],
    watch: [null, ...[['watch', 'Watch'], ['watch_right', 'Watch, right'], ['watch_both', 'Two watches']].map(([id, label]) => ({ id, label, file: `watch/${id}.png`, pal: 'metal', ref: '#d9a83a' }))],
    lanyard: [null, cl('lanyard', 'Lanyard', 'lanyard', { ref: '#626262' })],
    neck: [null, { id: 'tie', label: 'Tie', file: 'tie/suit_and_tie.png', pal: 'cloth', only: ['#4b6a81'], ref: '#4b6a81' }],
    headphones: [null],
  };
  // Parts made from the shipped ones (scripts/dev/office-looks-parts.py) are appended here, so old looks keep their meaning.
  const EXTRA = {
    hair: [hr('parted_left', 'Parted left'), hr('swept_left', 'Swept left'), hr('top_bun', 'Top bun'), hr('space_buns', 'Space buns'), hr('afro', 'Afro'),
      hr('curly_long', 'Curly long'), hr('buzz', 'Buzz cut'), hr('mohawk', 'Mohawk'), { id: 'bald', label: 'Bald', file: null }],
    top: [cl('striped_tee', 'Striped tee', 'top', { fixed: CREAM }), cl('pocket_tee', 'Pocket tee', 'top'), cl('polo', 'Polo', 'top'),
      cl('ringer_tee', 'Ringer tee', 'top', { fixed: CREAM }), cl('hoodie', 'Hoodie', 'top'), cl('striped_long', 'Striped long sleeves', 'top', { fixed: CREAM })],
    pants: [cl('cuffed_jeans', 'Cuffed jeans', 'pants'), cl('pleated_skirt', 'Pleated skirt', 'pants')],
    shoes: [cl('high_tops', 'High-tops', 'shoes', { fixed: CREAM }), cl('white_soles', 'Sneakers', 'shoes', { fixed: CREAM })],
    jacket: [cl('cardigan', 'Cardigan', 'jacket'), cl('zip_hoodie', 'Zip hoodie', 'jacket')],
    beard: [{ id: 'chin_strap', label: 'Chin strap', file: 'beard/chin_strap.png', pal: 'hair', ref: '#5a3a26' }, { id: 'soul_patch', label: 'Soul patch', file: 'beard/soul_patch.png', pal: 'hair', ref: '#5a3a26' },
      { id: 'handlebar', label: 'Handlebar', file: 'beard/handlebar.png', pal: 'hair', ref: '#5a3a26' }],
    hat: [cl('beanie', 'Knit beanie', 'hat'), cl('bucket_hat', 'Bucket hat', 'hat'), cl('headband', 'Headband', 'hat'), cl('ball_cap', 'Ball cap', 'hat')],
    neck: [{ id: 'bow_tie', label: 'Bow tie', file: 'tie/bow_tie.png', pal: 'cloth', ref: G }, { id: 'scarf', label: 'Scarf', file: 'tie/scarf.png', pal: 'cloth', ref: G }],
    headphones: [{ id: 'headphones', label: 'Headphones', file: 'headphones/headphones.png', pal: 'cloth', ref: G }],
    earrings: [{ id: 'studs', label: 'Studs', file: 'earrings/studs.png', pal: 'metal', ref: '#d9a83a' }],
  };
  for (const [k, list] of Object.entries(EXTRA)) PARTS[k].push(...list);

  // Look fields: part fields index PARTS, colour fields a palette. beardColor 0 means "same as hair".
  const COLOR = { skin: 'skin', eyeColor: 'eye', hairColor: 'hair', beardColor: 'hair+', topColor: 'cloth', pantsColor: 'cloth', shoesColor: 'cloth',
    jacketColor: 'cloth', fullColor: 'cloth', hatColor: 'cloth', frameColor: 'frame', metalColor: 'metal', lanyardColor: 'cloth', neckColor: 'cloth', headphonesColor: 'cloth' };
  const FIELDS = { v: 3 };
  for (const k of Object.keys(PARTS)) FIELDS[k] = PARTS[k].length;
  for (const [k, p] of Object.entries(COLOR)) FIELDS[k] = p === 'hair+' ? PAL.hair.length + 1 : PAL[p].length;

  // The creator's tabs: which fields each shows, and the order parts appear in.
  const TABS = [
    { id: 'body', label: 'Body & skin', parts: [['body']], colors: [['skin', 'Skin']] },
    { id: 'face', label: 'Face', parts: [['eyes', 'Eyes']], colors: [['eyeColor', 'Eye colour']] },
    { id: 'hair', label: 'Hair', parts: [['hair']], colors: [['hairColor', 'Hair colour']] },
    { id: 'beard', label: 'Facial hair', parts: [['beard']], colors: [['beardColor', 'Colour']] },
    { id: 'top', label: 'Top', parts: [['top', 'Tops'], ['full', 'Whole outfits']], colors: [['topColor', 'Top colour'], ['fullColor', 'Outfit colour']] },
    { id: 'jacket', label: 'Jacket', parts: [['jacket']], colors: [['jacketColor', 'Jacket colour']] },
    { id: 'pants', label: 'Bottoms', parts: [['pants']], colors: [['pantsColor', 'Bottoms colour']] },
    { id: 'shoes', label: 'Shoes', parts: [['shoes']], colors: [['shoesColor', 'Shoes colour']] },
    { id: 'acc', label: 'Accessories', parts: [['eyewear', 'Glasses'], ['neck', 'Tie and scarf'], ['headphones', 'Headphones'], ['earrings', 'Earrings'], ['necklace', 'Necklace'], ['watch', 'Watch'], ['lanyard', 'Lanyard']],
      colors: [['frameColor', 'Frame colour'], ['neckColor', 'Tie colour'], ['headphonesColor', 'Headphones colour'], ['metalColor', 'Metal'], ['lanyardColor', 'Lanyard colour']] },
    { id: 'hat', label: 'Hat', parts: [['hat']], colors: [['hatColor', 'Hat colour']] },
  ];

  // ---------- rules: what can't be worn together ----------
  // Each rule: [field a, test a, field b, test b, which one gives way when the other is chosen].
  const id = (k, i) => { const L = PARTS[k] || []; const p = L[((i | 0) % L.length + L.length) % L.length]; return p ? p.id : null; };
  const conflicts = [
    { a: 'hat', b: 'eyewear', when: (L) => id('hat', L.hat) && id('eyewear', L.eyewear) === 'hairshades', why: 'Shades on your head sit under a hat' },
    { a: 'hat', b: 'headphones', when: (L) => id('hat', L.hat) && !['headband'].includes(id('hat', L.hat)) && id('headphones', L.headphones), why: 'Headphones go over a hat' },
    { a: 'headphones', b: 'eyewear', when: (L) => id('headphones', L.headphones) && id('eyewear', L.eyewear) === 'hairshades', why: 'Headphones and shades on your head' },
    { a: 'full', b: 'neck', when: (L) => ['suit_and_tie', 'dress', 'fitted_dress'].includes(id('full', L.full)) && id('neck', L.neck) && id('neck', L.neck) !== 'scarf', why: 'This outfit has its own neckline' },
    { a: 'top', b: 'neck', when: (L) => !id('full', L.full) && ['turtleneck', 'tank_top', 'tank_long', 'hoodie'].includes(id('top', L.top)) && ['tie', 'bow_tie'].includes(id('neck', L.neck)), why: 'A tie needs a collar' },
    { a: 'hair', b: 'hat', when: (L) => ['top_bun', 'space_buns', 'mohawk', 'high_ponytail'].includes(id('hair', L.hair)) && id('hat', L.hat) && id('hat', L.hat) !== 'headband', why: 'This hairstyle sits above a hat' },
  ];

  // ---------- looks: migrate, normalise, describe ----------
  const OLD = {   // v1 looks (pass 11b): colour numbers were swatches of wardrobe.json
    cloth: ['#c02126', '#b24737', '#ac9082', '#f67d20', '#e58700', '#80c223', '#23c23e', '#366040', '#23c2ad', '#114978', '#247cc6', '#49557e', '#2323c2', '#8023c2', '#c22380', '#d4d4d4', '#252525'],
    hair: ['#8d2d27', '#b04e26', '#342218', '#be7743', '#57351a', '#cc741d', '#8f6439', '#a59231', '#75a531', '#31a544', '#31a595', '#3167a5', '#3131a5', '#7531a5', '#a53175', '#daccc9', '#464646', '#221e1e'],
    skin: [0, 2, 6, 10], acc: [null, ['eyewear', 1], ['eyewear', 2], ['earrings', 1], ['necklace', 1], ['watch', 1], ['lanyard', 1], ['eyewear', 3]],
  };
  const near = (pal, hex) => { const t = toLab(hex); let best = 0, bd = 1e9; PAL[pal].forEach((e, i) => { const q = toLab(e.hex), d = (q[0] - t[0]) ** 2 + (q[1] - t[1]) ** 2 + (q[2] - t[2]) ** 2; if (d < bd) { bd = d; best = i; } }); return best; };
  function migrate(look) {
    const L = Object.assign({}, look || {});
    if (L.v === 2) return L;
    const out = { v: 2 };
    for (const k of ['body', 'hair', 'top', 'pants', 'shoes', 'jacket', 'full', 'beard', 'hat']) if (Number.isInteger(L[k])) out[k] = L[k];
    if (Number.isInteger(L.skin)) out.skin = OLD.skin[L.skin] ?? 2;
    if (Number.isInteger(L.hairColor) && OLD.hair[L.hairColor]) out.hairColor = near('hair', OLD.hair[L.hairColor]);
    for (const k of ['topColor', 'pantsColor', 'shoesColor', 'jacketColor', 'fullColor', 'hatColor']) if (Number.isInteger(L[k]) && OLD.cloth[L[k]]) out[k] = near('cloth', OLD.cloth[L[k]]);
    for (const a of [L.acc, L.extra]) { const m = Number.isInteger(a) && OLD.acc[a]; if (m) out[m[0]] = m[1]; }
    return out;
  }
  const DEF = { v: 2, body: 0, skin: 2, eyes: 0, eyeColor: 0, hair: 0, hairColor: 3, beard: 0, beardColor: 0, top: 0, topColor: 8, full: 0, fullColor: 7,
    pants: 0, pantsColor: 7, shoes: 0, shoesColor: 6, jacket: 0, jacketColor: 5, hat: 0, hatColor: 18, eyewear: 0, frameColor: 0, earrings: 0, necklace: 0,
    watch: 0, metalColor: 0, lanyard: 0, lanyardColor: 10, neck: 0, neckColor: 18, headphones: 0, headphonesColor: 6 };
  // A complete, valid look: every field in range, clashes removed (the field named in `prefer` wins a clash).
  function normalize(look, prefer) {
    const L = Object.assign({}, DEF, migrate(look));
    for (const [k, n] of Object.entries(FIELDS)) { if (k === 'v') continue; const v = L[k] | 0; L[k] = ((v % n) + n) % n; }
    L.v = 2;
    for (const r of conflicts) if (r.when(L)) { const lose = prefer === r.a ? r.b : prefer === r.b ? r.a : r.b; L[lose] = 0; }
    return L;
  }
  // Only the fields that differ from the default (what the server stores).
  function compact(look) { const L = normalize(look), out = { v: 2 }; for (const k of Object.keys(FIELDS)) if (k !== 'v' && L[k] !== DEF[k]) out[k] = L[k]; return out; }
  const part = (k, i) => { const L = PARTS[k]; return L[((i | 0) % L.length + L.length) % L.length]; };
  const label = (k, i) => { const p = part(k, i); return p ? p.label : 'None'; };
  function colourOf(field, i) { const p = COLOR[field]; if (p === 'hair+') return i ? PAL.hair[(i - 1) % PAL.hair.length] : null; return PAL[p][((i | 0) % PAL[p].length + PAL[p].length) % PAL[p].length]; }
  const colourHex = (field, i) => { const c = colourOf(field, i); return c ? c.hex : null; };
  function describe(look) {
    const L = normalize(look), bits = [];
    bits.push(`${colourOf('skin', L.skin).name} skin`);
    const h = part('hair', L.hair); bits.push(h && h.file ? `${colourOf('hairColor', L.hairColor).name.toLowerCase()} ${h.label.toLowerCase()} hair` : 'no hair');
    if (L.beard) bits.push(part('beard', L.beard).label.toLowerCase());
    if (L.full) bits.push(`${colourOf('fullColor', L.fullColor).name.toLowerCase()} ${part('full', L.full).label.toLowerCase()}`);
    else bits.push(`${colourOf('topColor', L.topColor).name.toLowerCase()} ${part('top', L.top).label.toLowerCase()}`, `${colourOf('pantsColor', L.pantsColor).name.toLowerCase()} ${part('pants', L.pants).label.toLowerCase()}`);
    if (L.jacket) bits.push(`${colourOf('jacketColor', L.jacketColor).name.toLowerCase()} ${part('jacket', L.jacket).label.toLowerCase()}`);
    if (L.hat) bits.push(`${colourOf('hatColor', L.hatColor).name.toLowerCase()} ${part('hat', L.hat).label.toLowerCase()}`);
    for (const k of ['eyewear', 'neck', 'headphones', 'earrings', 'necklace', 'watch', 'lanyard']) if (L[k]) bits.push(part(k, L[k]).label.toLowerCase());
    return bits.join(', ');
  }

  // ---------- layers (Pixel Agents' order) ----------
  const ORDER = ['body', 'whites', 'iris', 'lashes', 'pants', 'top', 'full', 'neck', 'jacket', 'lanyard', 'necklace', 'watch', 'shoes', 'paper', 'hair', 'earrings', 'beard', 'eyewear', 'headphones', 'hat'];
  // look -> [{ slot, file, cfg, color (hex), rows?, cols? }] bottom to top. rows/cols limit where a layer draws.
  function layers(look) {
    const L = normalize(look), out = [];
    const add = (slot, p, color, extra) => { if (p && p.file) out.push(Object.assign({ slot, file: p.file, cfg: p, color }, extra || {})); };
    const body = part('body', L.body), eyes = part('eyes', L.eyes) || PARTS.eyes.find(e => e && e.id === body.eyes);
    const hairCol = colourHex('hairColor', L.hairColor), beardCol = L.beardColor ? colourHex('beardColor', L.beardColor) : hairCol;
    const earrings = part('earrings', L.earrings);
    const ear = earrings && earrings.file ? { slot: 'earrings', file: earrings.file, cfg: earrings, color: colourHex('metalColor', L.metalColor) } : null;
    for (const slot of ORDER) {
      if (slot === 'body') { add('body', body, colourHex('skin', L.skin)); if (ear) out.push(Object.assign({}, ear, { rows: [1] })); }
      else if (slot === 'whites' && eyes.whites) add('whites', { file: `eyes/${eyes.whites}/whites.png` }, null);
      else if (slot === 'iris' && eyes.iris) add('iris', { file: `eyes/${eyes.iris}/iris.both.png`, pal: 'eye', only: ['#4f4f4f'], ref: '#4f4f4f' }, colourHex('eyeColor', L.eyeColor));
      else if (slot === 'lashes') add('lashes', { file: `eyes/${eyes.lashes}/lashes.png`, pal: 'hair', only: ['#6a4630'], ref: '#6a4630', shift: -0.1 }, hairCol);
      else if (slot === 'pants' && !L.full) add('pants', part('pants', L.pants), colourHex('pantsColor', L.pantsColor));
      else if (slot === 'top' && !L.full) add('top', part('top', L.top), colourHex('topColor', L.topColor));
      else if (slot === 'full' && L.full) { const f = part('full', L.full); add('full', f, colourHex('fullColor', L.fullColor)); }
      else if (slot === 'neck') {
        const f = L.full ? part('full', L.full) : null;
        if (f && f.tie && !L.neck) add('neck', PARTS.neck[1], colourHex('neckColor', L.neckColor));
        else add('neck', part('neck', L.neck), colourHex('neckColor', L.neckColor));
      }
      else if (slot === 'jacket') add('jacket', part('jacket', L.jacket), colourHex('jacketColor', L.jacketColor));
      else if (slot === 'lanyard') add('lanyard', part('lanyard', L.lanyard), colourHex('lanyardColor', L.lanyardColor));
      else if (slot === 'necklace') add('necklace', part('necklace', L.necklace), colourHex('metalColor', L.metalColor));
      else if (slot === 'watch') add('watch', part('watch', L.watch), colourHex('metalColor', L.metalColor));
      else if (slot === 'shoes') add('shoes', part('shoes', L.shoes), colourHex('shoesColor', L.shoesColor));
      else if (slot === 'paper') add('paper', { file: 'props/paper.png' }, null, { cols: [5, 6] });   // the read pose holds a page (its hands are on it)
      else if (slot === 'hair') { add('hair', part('hair', L.hair), hairCol); if (ear) out.push(Object.assign({}, ear, { rows: [0, 2] })); }
      else if (slot === 'beard') add('beard', part('beard', L.beard), beardCol);
      else if (slot === 'eyewear') add('eyewear', part('eyewear', L.eyewear), colourHex('frameColor', L.frameColor));
      else if (slot === 'headphones') add('headphones', part('headphones', L.headphones), colourHex('headphonesColor', L.headphonesColor));
      else if (slot === 'hat') add('hat', part('hat', L.hat), colourHex('hatColor', L.hatColor));
    }
    return out;
  }
  const files = look => [...new Set(layers(look).map(l => l.file))];

  // ---------- the palette swap ----------
  const LMIN = 0.17, LMAX = 0.975, SHADOW_H = 268, LIGHT_H = 80;
  const GREY_C = 0.02;
  // source colours (hex list) -> Map(source hex -> target hex) for one part in one colour
  function recolor(src, cfg, target) {
    const map = new Map(); cfg = cfg || {};
    const fixed = cfg.fixed || {}, keep = new Set((cfg.keep || []).map(s => s.toLowerCase())), only = cfg.only ? new Set(cfg.only.map(s => s.toLowerCase())) : null;
    const ramp = [];
    for (const h0 of src) {
      const h = h0.toLowerCase();
      if (fixed[h]) { map.set(h, fixed[h]); continue; }
      if (!target || keep.has(h) || (only && !only.has(h))) { map.set(h, h); continue; }
      if (!only && lch(h)[0] < 0.2) { map.set(h, h); continue; }   // near-black outlines stay
      ramp.push(h);
    }
    if (!ramp.length) return map;
    const [Lr, Cr, Hr] = lch(cfg.ref || G), [Lb, Cb, Hb] = lch(target), coloured = Cr > 0.03, k = cfg.contrast || 1, shift = cfg.shift || 0;
    const items = ramp.map(h => { const [L, C, H] = lch(h); return { h, L, C, H, dL: L - Lr }; }).sort((a, b) => a.L - b.L);
    // lightness: offset from the base, then squeezed (separately above and below the base) to stay inside [lo, hi]
    const base = Math.max(LMIN + 0.04, Math.min(LMAX - 0.02, Lb + shift));
    const lo = Math.min(LMIN, base - 0.08), hi = Math.max(LMAX, base + 0.02);
    const tl = items.map(it => base + it.dL * k), minT = Math.min(...tl), maxT = Math.max(...tl);
    const sDown = minT < lo ? (base - lo) / (base - minT) : 1, sUp = maxT > hi ? (hi - base) / (maxT - base) : 1;
    const used = new Set();
    items.forEach((it, i) => {
      const d = tl[i] - base;
      let L = base + d * (d < 0 ? sDown : sUp);
      if (cfg.outline && cfg.outline.includes(it.h)) L = Math.min(L, cfg.outlineMax || 1);
      let C, H;
      if (coloured) { C = Cb * (it.C / Cr); H = (Hb + (it.H - Hr) + 360) % 360; }
      else {
        const dl = it.dL;
        C = Cb * (dl < 0 ? 1 + dl * 0.5 : 1 - dl * 1.4); H = Hb;
        if (Cb < GREY_C) { H = dl < 0 ? SHADOW_H : LIGHT_H; C = Math.max(C, Math.abs(dl) * (dl < 0 ? 0.05 : 0.02)); }
        else H = hueToward(Hb, dl < 0 ? SHADOW_H : LIGHT_H, Math.abs(dl) * (dl < 0 ? 60 : 45));
      }
      let out = fromLch(L, Math.max(0, C), H), n = 0;
      while (used.has(out) && n < 40) { n++; out = fromLch(L + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.006, C, H); }
      used.add(out); map.set(it.h, out);
    });
    return map;
  }

  // ---------- compose a sheet (128x96 RGBA) ----------
  const W = 128, H = 96;
  const colours = px => { const s = new Set(); for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 1) s.add(hexOf(px[i], px[i + 1], px[i + 2])); return [...s]; };
  // get(file) -> { width, height, data } or null. mapCache (optional Map) keeps recolour maps between calls.
  function composite(look, get, mapCache) {
    const out = new Uint8ClampedArray(W * H * 4), missing = [];
    for (const l of layers(look)) {
      const img = get(l.file); if (!img) { missing.push(l.file); continue; }
      if (img.width !== W || img.height !== H) continue;
      const src = img.data;
      let map = null;
      if (l.color || (l.cfg && l.cfg.fixed)) {
        const key = l.file + '|' + l.color + '|' + (l.cfg.shift || 0);
        map = mapCache && mapCache.get(key);
        if (!map) { map = recolor(colours(src), l.cfg, l.color); if (mapCache) mapCache.set(key, map); }
      }
      for (let i = 0; i < src.length; i += 4) {
        if (src[i + 3] < 2) continue;
        const p = i >> 2, x = p % W, y = (p / W) | 0;
        if (l.rows && !l.rows.includes((y / 32) | 0)) continue;
        if (l.cols && !l.cols.includes((x / 16) | 0)) continue;
        let r = src[i], g = src[i + 1], b = src[i + 2];
        if (map) { const m = map.get(hexOf(r, g, b)); if (m) { const c = rgbOf(m); r = c[0]; g = c[1]; b = c[2]; } }
        const a = src[i + 3];
        if (a > 253 || out[i + 3] < 2) { out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a; }
        else { const k = a / 255; out[i] = r * k + out[i] * (1 - k); out[i + 1] = g * k + out[i + 1] * (1 - k); out[i + 2] = b * k + out[i + 2] * (1 - k); out[i + 3] = Math.max(a, out[i + 3]); }   // stubble is a see-through shadow over the skin
      }
    }
    return { data: out, width: W, height: H, missing };
  }

  // ---------- random, seeded and AI helper looks ----------
  function rng(seed) { let h = 2166136261; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // A believable random look. r: a function returning 0-1 (Math.random by default).
  function random(r) {
    r = r || Math.random;
    const n = k => Math.floor(r() * FIELDS[k]), chance = p => r() < p, any = (k, from = 1) => from + Math.floor(r() * (FIELDS[k] - from));
    const L = { v: 2, body: n('body'), skin: n('skin'), eyes: chance(0.5) ? 0 : any('eyes'), eyeColor: n('eyeColor'), hair: n('hair'), top: n('top'), pants: n('pants'), shoes: n('shoes') };
    // natural hair most of the time; fun colours now and then
    L.hairColor = chance(0.82) ? Math.floor(r() * 13) : 13 + Math.floor(r() * 7);
    if (chance(0.06)) L.hair = PARTS.hair.findIndex(p => p.id === 'bald');
    const cloth = () => Math.floor(r() * PAL.cloth.length);
    L.topColor = cloth(); L.pantsColor = [6, 7, 8, 5, 2, 1, 4, 23, 13][Math.floor(r() * 9)]; L.shoesColor = [6, 0, 23, 5, 2, 18, 8][Math.floor(r() * 7)];
    if (chance(0.14)) { L.full = any('full'); L.fullColor = [6, 7, 5, 4, 19, 12, 22, 18, 0][Math.floor(r() * 9)]; }
    if (chance(0.32)) { L.jacket = any('jacket'); L.jacketColor = cloth(); }
    if (L.body === 0 && chance(0.32)) { L.beard = any('beard'); L.beardColor = 0; }
    if (chance(0.22)) { L.hat = any('hat'); L.hatColor = cloth(); }
    if (chance(0.3)) { L.eyewear = any('eyewear'); L.frameColor = n('frameColor'); }
    if (chance(0.12)) { L.neck = any('neck'); L.neckColor = cloth(); }
    if (chance(0.1)) { L.headphones = any('headphones'); L.headphonesColor = cloth(); }
    if (chance(0.2)) L.earrings = any('earrings');
    if (chance(0.12)) L.necklace = any('necklace');
    if (chance(0.15)) L.watch = any('watch');
    if (chance(0.08)) { L.lanyard = 1; L.lanyardColor = cloth(); }
    L.metalColor = n('metalColor');
    return normalize(L);
  }
  const seed = id => random(rng('look:' + id));
  // AI helpers: a teal shirt, navy jeans, and a badge cap and lanyard in their tool's colour.
  const TOOL = { claude: 15, cursor: 0, codex: 12, gemini: 8, qwen: 22, chatgpt: 10, ollama: 2 };
  function agent(id, kind) {
    const L = seed('agent:' + id), c = TOOL[String(kind || '').toLowerCase()] ?? 10;
    return normalize(Object.assign(L, { top: 1, topColor: 10, full: 0, pants: 0, pantsColor: 7, jacket: 0, hat: 3, hatColor: c, lanyard: 1, lanyardColor: c, beard: 0, headphones: 0, eyewear: L.eyewear === 3 ? 0 : L.eyewear, neck: 0 }));
  }

  return { PAL, PARTS, FIELDS, COLOR, TABS, DEF, ORDER, conflicts, migrate, normalize, compact, layers, files, recolor, composite, colours, random, rng, seed, agent, describe,
    label, part, colourOf, colourHex, lch, toLab, fromLch, hexOf, rgbOf, W, H };
});
