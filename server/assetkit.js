// The built-in part of the asset library (templates/assets.json, "how": "built-in"): things TribeCode makes on the spot,
// with no download and no license worries (CC0, made by TribeCode).
//   sfx(name, seed)    -> a small 16-bit mono .wav (Buffer): retro game sounds from a tiny synth (square/saw/sine/noise,
//                         pitch slides, vibrato, arpeggio, an attack/sustain/decay envelope). A seed gives a variation.
//                         The parameter ideas follow the classic sfxr generator's presets; the code is our own.
//   sprite(name, opts) -> crisp pixel art as SVG (one <rect> per run of pixels, shape-rendering crispEdges)
//   motionCss()        -> one CSS file of calm animation presets with prefers-reduced-motion built in
'use strict';

// ---------- sound effects ----------
const RATE = 22050;
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
// wave: 0 square, 1 saw, 2 sine, 3 noise. f0/f1 Hz (slide), a/s/d seconds, duty for square, vib [depth, Hz], arp [time s, ratio]
const PRESETS = {
  jump:      r => ({ wave: 0, f0: 260 + r() * 80, f1: 620 + r() * 160, a: 0, s: 0.05, d: 0.18, duty: 0.5 - r() * 0.2 }),
  coin:      r => ({ wave: 0, f0: 880 + r() * 120, f1: 880, a: 0, s: 0.04, d: 0.22, duty: 0.5, arp: [0.06, 1.5 + r() * 0.2] }),
  hit:       r => ({ wave: 3, f0: 900 + r() * 300, f1: 120, a: 0, s: 0.02, d: 0.14 }),
  explosion: r => ({ wave: 3, f0: 400 + r() * 200, f1: 40, a: 0, s: 0.08, d: 0.65 + r() * 0.2 }),
  powerup:   r => ({ wave: 0, f0: 300 + r() * 60, f1: 1100, a: 0, s: 0.12, d: 0.3, duty: 0.4, vib: [0.06, 14] }),
  laser:     r => ({ wave: 1, f0: 1300 + r() * 400, f1: 180, a: 0, s: 0.03, d: 0.16 }),
  click:     r => ({ wave: 0, f0: 1200 + r() * 200, f1: 1100, a: 0, s: 0.005, d: 0.03, duty: 0.5 }),
  select:    r => ({ wave: 2, f0: 660, f1: 660, a: 0, s: 0.04, d: 0.09, arp: [0.04, 1.25 + r() * 0.1] }),
  blip:      r => ({ wave: 0, f0: 520 + r() * 300, f1: 520, a: 0, s: 0.02, d: 0.06, duty: 0.25 }),
  hurt:      r => ({ wave: 1, f0: 420 + r() * 80, f1: 140, a: 0, s: 0.04, d: 0.22, vib: [0.1, 30] }),
  pickup:    r => ({ wave: 2, f0: 520, f1: 1040 + r() * 200, a: 0, s: 0.03, d: 0.12 }),
  door:      r => ({ wave: 3, f0: 160 + r() * 40, f1: 60, a: 0.01, s: 0.12, d: 0.3 }),
};
function synth(p, seed) {
  const r = rng(seed * 7919 + 13), n = Math.max(1, Math.round((p.a + p.s + p.d) * RATE));
  const out = new Int16Array(n); let phase = 0, noise = 0, nPhase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, k = i / n;
    let f = p.f0 * Math.pow(p.f1 / p.f0, k);                       // exponential slide
    if (p.arp && t > p.arp[0]) f *= p.arp[1];
    if (p.vib) f *= 1 + p.vib[0] * Math.sin(2 * Math.PI * p.vib[1] * t);
    phase = (phase + f / RATE) % 1;
    let v;
    if (p.wave === 0) v = phase < (p.duty || 0.5) ? 1 : -1;
    else if (p.wave === 1) v = 2 * phase - 1;
    else if (p.wave === 2) v = Math.sin(2 * Math.PI * phase);
    else { nPhase += f / RATE; if (nPhase >= 1) { nPhase -= 1; noise = r() * 2 - 1; } v = noise; }
    const env = t < p.a ? t / p.a : t < p.a + p.s ? 1 : Math.max(0, 1 - (t - p.a - p.s) / p.d);
    out[i] = Math.round(v * env * env * 0.42 * 32767);
  }
  return out;
}
function wav(samples) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
function sfx(name, seed = 1) {
  const pre = PRESETS[name]; if (!pre) return null;
  return wav(synth(pre(rng(seed)), seed));
}

// ---------- pixel sprites (12x12, TribeCode palette) ----------
const PAL = { k: '#12151A', w: '#F8FAFC', e: '#F26B1D', y: '#FABD2F', t: '#38C6B1', T: '#1F8A7A', i: '#6C7CFF', I: '#4452C9', g: '#3BD16F', G: '#24914A',
  r: '#FF6F8E', R: '#C2405E', b: '#8B5A2B', B: '#5C3A1A', s: '#9AA4B2', S: '#5B6573', p: '#F2B48C', c: '#DDE3EA' };
const SPRITES = {
  hero:    ['....kkkk....', '...kBBBBk...', '..kBBBBBBk..', '..kppppppk..', '..kpkppkpk..', '..kppppppk..', '...kppppk...', '..kiiiiiik..', '.kpiiiiiipk.', '..kiiiiiik..', '..kkk..kkk..', '..kBk..kBk..'],
  slime:   ['............', '............', '....kkkk....', '...kggggk...', '..kggggggk..', '.kggwkgwkgk.', '.kggkkgkkgk.', '.kggggggggk.', 'kgggggggggGk', 'kGGGGGGGGGGk', '.kkkkkkkkkk.', '............'],
  coin:    ['....kkkk....', '...kyyyyk...', '..kywyyyyk..', '.kywyykyyyk.', '.kyyykkyyyk.', '.kyyyykyyyk.', '.kyyyykyyyk.', '.kyyykkkyyk.', '..kyyyyyyk..', '...keeeek...', '....kkkk....', '............'],
  heart:   ['............', '.kkk...kkk..', 'krrrk.krrrk.', 'krwrrkrrrrk.', 'krwrrrrrrrk.', 'krrrrrrrrrk.', '.krrrrrrrk..', '..krrrrRk...', '...krrRk....', '....kRk.....', '.....k......', '............'],
  gem:     ['............', '...kkkkkk...', '..kiwiiiik..', '.kiwiiiiiik.', 'kkkkkkkkkkkk', 'kiwiiiiiiIIk', '.kiiiiiiIIk.', '..kiiiiIIk..', '...kiiIIk...', '....kiIk....', '.....kk.....', '............'],
  key:     ['............', '..kkkk......', '.kyyyyk.....', 'kyykkyyk....', 'kyk..kykkkkk', 'kyykkyyyyyyk', '.kyyyykkykyk', '..kkkk.kk.kk', '............', '............', '............', '............'],
  chest:   ['............', '..kkkkkkkk..', '.kbbbbbbbbk.', 'kbbbbbbbbbbk', 'kBBBBkkBBBBk', 'kkkkkyykkkkk', 'kbbbbyybbbbk', 'kbbbbkkbbbbk', 'kbbbbbbbbbbk', 'kBBBBBBBBBBk', '.kkkkkkkkkk.', '............'],
  lantern: ['.....kk.....', '....k..k....', '...kkkkkk...', '...kSSSSk...', '..kyyyyyyk..', '..kyeyyeyk..', '..kyyeeyyk..', '..kyyeeyyk..', '..kyyyyyyk..', '...kSSSSk...', '...kkkkkk...', '............'],
  flame:   ['.....k......', '....kek.....', '....keek....', '...keeek....', '...keeeek...', '..keeyeek...', '..keyyyeek..', '.keeyyyyek..', '.keyywyyyek.', '.keyyyyyyek.', '..keeeeeek..', '...kkkkkk...'],
  star:    ['.....kk.....', '....kyyk....', '....kyyk....', 'kkkkkyykkkkk', 'kyyyyyyyyyyk', '.kyywyyyyyk.', '..kyyyyyyk..', '..kyyyyyyk..', '.kyyykkyyyk.', '.kyyk..kyyk.', 'kkkk....kkkk', '............'],
  sword:   ['..........kk', '.........kck', '........kcsk', '.......kcsk.', '......kcsk..', '..k..kcsk...', '..kkkcsk....', '...kbsk.....', '..kbkkk.....', '.kbk..k.....', 'kkk.........', '............'],
  potion:  ['....kkkk....', '....kcck....', '....kkkk....', '...kccsck...', '..kccccccck.', '.kcrrrrrrrk.', '.krwrrrrrrk.', '.krwrrrrrrk.', '.krrrrrrRRk.', '..krrrrRRk..', '...kkkkkk...', '............'],
  tree:    ['....kkkk....', '...kggggk...', '..kgggwggk..', '.kggggggggk.', '.kgGgggggGk.', 'kggggggGgggk', 'kgGgggggggGk', '.kGGgggGGGk.', '..kkkbbkkk..', '....kbbk....', '....kBBk....', '...kkkkkk...'],
  cloud:   ['............', '............', '....kkkk....', '...kwwwwk...', '.kkwwwwwwkk.', 'kwwwwwwwwwwk', 'kwwwwwwwwcck', 'kccwwwwwccck', '.kkkkkkkkkk.', '............', '............', '............'],
  door:    ['..kkkkkkkk..', '.kbbbbbbbbk.', 'kbBbbbbbbBbk', 'kbBbbbbbbBbk', 'kbBbbbbbbBbk', 'kbBbbbbbybbk', 'kbBbbbbbbBbk', 'kbBbbbbbbBbk', 'kbBbbbbbbBbk', 'kbBbbbbbbBbk', 'kkkkkkkkkkkk', '............'],
  block:   ['kkkkkkkkkkkk', 'keeyeeeeeeek', 'keyeeeeeeeBk', 'keeeeeeeeeBk', 'keeeekkeeeBk', 'keeeekkeeeBk', 'keeeeeeeeeBk', 'keeeeeeeeeBk', 'keeeeeeeeeBk', 'keBBBBBBBBBk', 'kkkkkkkkkkkk', '............'],
};
function sprite(name, { scale = 8 } = {}) {
  const rows = SPRITES[name]; if (!rows) return null;
  const h = rows.length, w = rows[0].length; let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < w;) {
      const ch = row[x]; if (ch === '.' || !PAL[ch]) { x++; continue; }
      let n = 1; while (x + n < w && row[x + n] === ch) n++;
      rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${PAL[ch]}"/>`; x += n;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges"><title>${name}</title>${rects}</svg>\n`;
}

// ---------- motion presets ----------
function motionCss() {
  return `/* TribeCode motion presets (CC0). Add a class: .fx-fade-up, .fx-pop, .fx-float, .fx-wiggle, .fx-pulse, .fx-slide-in,
   .fx-spin, .fx-caret. Delay with style="--fx-delay: .2s". Everything stops for people who ask for reduced motion. */
:root { --fx-ease: cubic-bezier(.2, .7, .2, 1); --fx-time: .6s; }
.fx-fade-up  { animation: fx-fade-up var(--fx-time) var(--fx-ease) both; animation-delay: var(--fx-delay, 0s); }
.fx-pop      { animation: fx-pop .45s var(--fx-ease) both; animation-delay: var(--fx-delay, 0s); }
.fx-slide-in { animation: fx-slide-in var(--fx-time) var(--fx-ease) both; animation-delay: var(--fx-delay, 0s); }
.fx-float    { animation: fx-float 3.2s ease-in-out infinite; }
.fx-wiggle   { animation: fx-wiggle .5s ease-in-out 2; }
.fx-pulse    { animation: fx-pulse 1.8s ease-in-out infinite; }
.fx-spin     { animation: fx-spin 1.2s linear infinite; }
.fx-caret::after { content: ""; display: inline-block; width: .08em; height: 1em; margin-left: .08em; vertical-align: -.12em; background: currentColor; animation: fx-blink 1s steps(1) infinite; }
@keyframes fx-fade-up  { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes fx-pop      { 0% { opacity: 0; transform: scale(.85); } 70% { transform: scale(1.04); } 100% { opacity: 1; transform: none; } }
@keyframes fx-slide-in { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes fx-float    { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes fx-wiggle   { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-4deg); } 75% { transform: rotate(4deg); } }
@keyframes fx-pulse    { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes fx-spin     { to { transform: rotate(360deg); } }
@keyframes fx-blink    { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { [class*="fx-"], [class*="fx-"]::after { animation: none !important; } }
`;
}

module.exports = { sfx, sprite, motionCss, SFX_NAMES: Object.keys(PRESETS), SPRITE_NAMES: Object.keys(SPRITES) };
