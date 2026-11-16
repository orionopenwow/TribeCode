// TribeCode font library (feat/asset-libs2): one list of open-licence font pairs for the site editor, App Creator,
// the Launch kit and the design library.
//
//   BUNDLED   families shipped in app/ui/assets/site-fonts (they work offline and inside exports)
//   GFONT     { family: [weights, fallback stack] } more SIL OFL families, loaded from Google Fonts when online.
//             Nothing is bundled; offline (or when a site blocks it) the fallback stack is used.
//   PAIRS     { id: { name, display, body, dw, mood } } 50+ pairs; mood is calm | bold | playful | serious | elegant | tech | retro | hand
//   href(fams)  the Google Fonts css2 address for the families that need it ('' when none do)
//   stack(f)    the CSS font-family value with its fallback
//   load(fams)  adds the stylesheet link to this page once (browser only), so canvases can draw with the fonts
//   info(id)    { licence, source, preview } for one pair
//   calmer(id) / bolder(id)  the next pair in that direction
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFontLib = api; })(typeof self !== 'undefined' ? self : this, function () {
  const SERIF = 'Georgia, "Times New Roman", serif', SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace', HAND = '"Segoe Print", "Bradley Hand", cursive';
  const BUNDLED = ['Fraunces', 'Instrument Serif', 'Space Grotesk', 'Bricolage Grotesque', 'JetBrains Mono', 'Silkscreen', 'Inter', 'DM Serif Display', 'Outfit'];
  const two = '400;700', one = '400';
  const G = (list, w, fb) => list.map(f => [f, [w, fb]]);
  const GFONT = Object.fromEntries([
    ...G(['Playfair Display', 'Lora', 'Merriweather', 'Libre Baskerville', 'Cormorant Garamond', 'EB Garamond', 'Crimson Pro', 'Spectral', 'Source Serif 4', 'Bitter', 'Zilla Slab', 'Arvo', 'IBM Plex Serif', 'Bodoni Moda', 'Cinzel', 'Literata', 'Newsreader'], two, SERIF),
    ...G(['Young Serif', 'Gloock', 'Abril Fatface', 'Alfa Slab One'], one, SERIF),
    ...G(['Oswald', 'Archivo', 'Work Sans', 'Manrope', 'Plus Jakarta Sans', 'DM Sans', 'IBM Plex Sans', 'Fira Sans', 'Karla', 'Rubik', 'Nunito', 'Quicksand', 'Poppins', 'Montserrat', 'Raleway', 'Lato', 'Josefin Sans', 'Syne', 'Sora', 'Lexend', 'Figtree', 'Unbounded', 'Barlow', 'Libre Franklin', 'Public Sans', 'Red Hat Display', 'Red Hat Text', 'Epilogue', 'Instrument Sans', 'Comfortaa', 'Fredoka', 'Atkinson Hyperlegible', 'Schibsted Grotesk', 'Hanken Grotesk', 'Chivo', 'Baloo 2', 'Source Sans 3'], two, SANS),
    ...G(['Bebas Neue', 'Anton', 'Archivo Black', 'Righteous', 'Shrikhand', 'Monoton'], one, SANS),
    ...G(['IBM Plex Mono', 'Space Mono', 'Fira Code'], two, MONO),
    ...G(['Press Start 2P', 'VT323'], one, MONO),
    ...G(['Caveat', 'Kalam'], two, HAND),
    ...G(['Pacifico', 'Lobster'], one, HAND),
  ]);
  // the ten pairs the site editor always had (bundled), then the Google Fonts pairs
  const P = (name, display, body, dw, mood) => ({ name, display, body, dw, mood });
  const PAIRS = {
    classic: P('Classic serif', 'Fraunces', 'Inter', 700, 'serious'), editorial: P('Editorial', 'Instrument Serif', 'Inter', 400, 'elegant'), modern: P('Modern grotesk', 'Space Grotesk', 'Inter', 700, 'tech'),
    loud: P('Loud display', 'Bricolage Grotesque', 'Inter', 800, 'bold'), plain: P('Plain sans', 'Inter', 'Inter', 700, 'calm'), code: P('Code', 'JetBrains Mono', 'JetBrains Mono', 700, 'tech'), pixel: P('Pixel', 'Silkscreen', 'Inter', 400, 'retro'),
    book: P('Book', 'Fraunces', 'System serif', 700, 'calm'), elegant: P('Elegant serif', 'DM Serif Display', 'Inter', 400, 'elegant'), friendly: P('Friendly round', 'Outfit', 'Inter', 700, 'playful'),
  };
  [['playfair', 'Playfair Display', 'Lato', 700, 'elegant'], ['lora', 'Lora', 'Karla', 700, 'calm'], ['merriweather', 'Merriweather', 'Work Sans', 700, 'calm'], ['baskerville', 'Libre Baskerville', 'Raleway', 700, 'elegant'],
    ['cormorant', 'Cormorant Garamond', 'Montserrat', 700, 'elegant'], ['garamond', 'EB Garamond', 'Figtree', 700, 'calm'], ['crimson', 'Crimson Pro', 'IBM Plex Sans', 700, 'calm'], ['spectral', 'Spectral', 'Manrope', 700, 'calm'],
    ['sourceserif', 'Source Serif 4', 'Public Sans', 700, 'serious'], ['bitter', 'Bitter', 'Chivo', 700, 'serious'], ['zilla', 'Zilla Slab', 'Hanken Grotesk', 700, 'serious'], ['arvo', 'Arvo', 'Lato', 700, 'retro'],
    ['abril', 'Abril Fatface', 'Poppins', 400, 'bold'], ['alfaslab', 'Alfa Slab One', 'Rubik', 400, 'bold'], ['bebas', 'Bebas Neue', 'DM Sans', 400, 'bold'], ['anton', 'Anton', 'Barlow', 400, 'bold'],
    ['oswald', 'Oswald', 'Source Sans 3', 700, 'bold'], ['archivo', 'Archivo Black', 'Archivo', 400, 'bold'], ['jakarta', 'Plus Jakarta Sans', 'Plus Jakarta Sans', 700, 'tech'], ['manrope', 'Manrope', 'Inter', 700, 'tech'],
    ['plex', 'IBM Plex Sans', 'IBM Plex Serif', 700, 'serious'], ['plexmono', 'IBM Plex Mono', 'IBM Plex Sans', 700, 'tech'], ['spacemono', 'Space Mono', 'IBM Plex Sans', 700, 'tech'], ['firacode', 'Fira Code', 'Fira Sans', 700, 'tech'],
    ['rubik', 'Rubik', 'Karla', 700, 'playful'], ['nunito', 'Nunito', 'Nunito', 700, 'calm'], ['quicksand', 'Quicksand', 'Nunito', 700, 'calm'], ['poppins', 'Poppins', 'Inter', 700, 'tech'],
    ['montserrat', 'Montserrat', 'Merriweather', 700, 'serious'], ['raleway', 'Raleway', 'Lora', 700, 'elegant'], ['josefin', 'Josefin Sans', 'Lato', 700, 'retro'], ['syne', 'Syne', 'Inter', 700, 'bold'],
    ['sora', 'Sora', 'DM Sans', 700, 'tech'], ['lexend', 'Lexend', 'Lexend', 700, 'calm'], ['unbounded', 'Unbounded', 'Figtree', 700, 'bold'], ['righteous', 'Righteous', 'Nunito', 400, 'retro'],
    ['pacifico', 'Pacifico', 'Quicksand', 400, 'playful'], ['caveat', 'Caveat', 'Karla', 700, 'hand'], ['lobster', 'Lobster', 'Lato', 400, 'retro'], ['arcade', 'Press Start 2P', 'Space Mono', 400, 'retro'],
    ['terminal', 'VT323', 'IBM Plex Mono', 400, 'retro'], ['epilogue', 'Epilogue', 'Inter', 700, 'tech'], ['youngserif', 'Young Serif', 'Instrument Sans', 400, 'calm'], ['gloock', 'Gloock', 'Hanken Grotesk', 400, 'elegant'],
    ['bodoni', 'Bodoni Moda', 'Figtree', 700, 'elegant'], ['cinzel', 'Cinzel', 'Lato', 700, 'elegant'], ['comfortaa', 'Comfortaa', 'Nunito', 700, 'calm'], ['fredoka', 'Fredoka', 'Nunito', 700, 'playful'],
    ['atkinson', 'Atkinson Hyperlegible', 'Atkinson Hyperlegible', 700, 'calm'], ['literata', 'Literata', 'Literata', 700, 'calm'], ['newsreader', 'Newsreader', 'Inter', 700, 'serious'], ['schibsted', 'Schibsted Grotesk', 'Source Serif 4', 700, 'serious'],
    ['shrikhand', 'Shrikhand', 'Rubik', 400, 'playful'], ['monoton', 'Monoton', 'Barlow', 400, 'retro'], ['kalam', 'Kalam', 'Karla', 700, 'hand'], ['redhat', 'Red Hat Display', 'Red Hat Text', 700, 'tech'],
    ['baloo', 'Baloo 2', 'Nunito', 700, 'playful'], ['librefranklin', 'Libre Franklin', 'Libre Baskerville', 700, 'serious']]
    .forEach(([id, d, b, dw, mood]) => { PAIRS[id] = P(d === b ? d : `${d} + ${b}`, d, b, dw, mood); });

  const isG = f => !!GFONT[f] && !BUNDLED.includes(f);
  const fb = f => GFONT[f] ? GFONT[f][1] : /mono|code/i.test(f || '') ? MONO : /serif/i.test(f || '') && !/sans/i.test(f || '') ? SERIF : SANS;
  const stack = f => !f || /^system/i.test(f) ? fb(f) : `'${f}', ${fb(f)}`;
  function href(fams) {
    const need = [...new Set((fams || []).filter(isG))].sort();
    if (!need.length) return '';
    return 'https://fonts.googleapis.com/css2?' + need.map(f => 'family=' + f.replace(/ /g, '+') + (GFONT[f][0] === '400' ? '' : ':wght@' + GFONT[f][0])).join('&') + '&display=swap';
  }
  const loaded = new Set();
  function load(fams) {
    const u = href(fams); if (!u || typeof document === 'undefined' || loaded.has(u)) return u;
    loaded.add(u);
    try { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.dataset.tribeFonts = '1'; l.onerror = () => l.remove(); document.head.appendChild(l); } catch {}
    return u;
  }
  const pairFams = id => { const p = PAIRS[id]; return p ? [p.display, p.body] : []; };
  function info(id) {
    const p = PAIRS[id]; if (!p) return null;
    const g = pairFams(id).some(isG);
    return { licence: 'OFL-1.1', source: g ? 'Google Fonts (SIL Open Font License), loaded when online' : 'SIL Open Font License fonts shipped with TribeCode', online: g, preview: 'The quick brown fox jumps over the lazy dog' };
  }
  // calmer / bolder: a different pair with that mood (bundled ones first, so it works offline)
  const byMood = (mood, id) => { const ids = Object.keys(PAIRS).filter(k => PAIRS[k].mood === mood && k !== id); return ids.find(k => !pairFams(k).some(isG)) || ids[0] || id; };
  return { BUNDLED, GFONT, PAIRS, isG, stack, href, load, info, pairFams, calmer: id => byMood('calm', id), bolder: id => byMood('bold', id) };
});
