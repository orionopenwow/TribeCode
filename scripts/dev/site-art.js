#!/usr/bin/env node
// Placeholder pictures for the website templates (templates/sites/<id>/img/*.svg). Flat, quiet compositions in each
// template's own colors, so a fresh site looks finished and clearly says "your photo goes here". Original work made
// for TribeCode (no third-party art). Re-run after changing a palette: node scripts/dev/site-art.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const LIB = path.join(__dirname, '..', '..', 'templates', 'sites');

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const grain = (id, o = 0.07) => `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${o} 0"/></filter>`;
const svg = (w, h, body, g = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"><defs>${g ? grain('g') : ''}</defs>${body}${g ? `<rect width="${w}" height="${h}" filter="url(#g)"/>` : ''}</svg>`;

const M = {
  // rolling hills under a low sun
  landscape(c, seed, w = 1200, h = 800) {
    const r = rng(seed); let b = `<rect width="${w}" height="${h}" fill="${c[0]}"/><circle cx="${w * (0.25 + r() * 0.5)}" cy="${h * 0.42}" r="${h * 0.13}" fill="${c[1]}"/>`;
    [2, 3, 4].forEach((k, i) => { const y = h * (0.55 + i * 0.13); let d = `M0 ${y}`; for (let x = 0; x <= w; x += w / 6) d += ` Q${x + w / 12} ${y - h * (0.05 + r() * 0.1)} ${x + w / 6} ${y + (r() - 0.5) * h * 0.04}`; b += `<path d="${d} V${h} H0Z" fill="${c[k] || c[c.length - 1]}"/>`; });
    return svg(w, h, b);
  },
  // a still life on a table
  still(c, seed, w = 1000, h = 1200) {
    const r = rng(seed);
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><rect y="${h * 0.66}" width="${w}" height="${h * 0.34}" fill="${c[1]}"/>
      <rect x="${w * 0.18}" y="${h * 0.36}" width="${w * 0.2}" height="${h * 0.32}" rx="${w * 0.02}" fill="${c[2]}"/>
      <ellipse cx="${w * 0.28}" cy="${h * 0.36}" rx="${w * 0.1}" ry="${h * 0.02}" fill="${c[3]}"/>
      <circle cx="${w * 0.6}" cy="${h * 0.6}" r="${w * 0.11}" fill="${c[3]}"/><circle cx="${w * 0.74}" cy="${h * 0.63}" r="${w * 0.07}" fill="${c[4] || c[2]}"/>
      <rect x="${w * (0.45 + r() * 0.05)}" y="${h * 0.2}" width="${w * 0.03}" height="${h * 0.3}" fill="${c[4] || c[2]}" opacity=".8"/>`);
  },
  // a head-and-shoulders silhouette (for an avatar or a portrait)
  portrait(c, seed, w = 800, h = 800) {
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><circle cx="${w / 2}" cy="${h * 0.4}" r="${w * 0.17}" fill="${c[1]}"/><path d="M${w * 0.18} ${h} C${w * 0.2} ${h * 0.7} ${w * 0.35} ${h * 0.62} ${w / 2} ${h * 0.62} S${w * 0.8} ${h * 0.7} ${w * 0.82} ${h}Z" fill="${c[2]}"/><rect x="${w * 0.12}" y="${h * 0.1}" width="${w * 0.1}" height="${w * 0.1}" fill="${c[3] || c[1]}" opacity=".6"/>`);
  },
  // product shots on a plain backdrop
  sock(c, seed, w = 900, h = 1100) {
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><ellipse cx="${w / 2}" cy="${h * 0.9}" rx="${w * 0.3}" ry="${h * 0.025}" fill="#000" opacity=".12"/>
      <path d="M${w * 0.38} ${h * 0.12} h${w * 0.24} v${h * 0.45} c0 ${h * 0.08} ${w * 0.02} ${h * 0.12} ${w * 0.12} ${h * 0.16} c${w * 0.1} ${h * 0.04} ${w * 0.08} ${h * 0.14} -${w * 0.04} ${h * 0.14} h-${w * 0.2} c-${w * 0.14} 0 -${w * 0.24} -${h * 0.06} -${w * 0.24} -${h * 0.2}Z" fill="${c[1]}"/>
      <rect x="${w * 0.38}" y="${h * 0.12}" width="${w * 0.24}" height="${h * 0.06}" fill="${c[2]}"/><rect x="${w * 0.38}" y="${h * 0.3}" width="${w * 0.24}" height="${h * 0.03}" fill="${c[2]}"/><rect x="${w * 0.38}" y="${h * 0.36}" width="${w * 0.24}" height="${h * 0.03}" fill="${c[3] || c[2]}"/>`);
  },
  tee(c, seed, w = 900, h = 1100) {
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><path d="M${w * 0.32} ${h * 0.2} l-${w * 0.18} ${h * 0.1} ${w * 0.06} ${h * 0.14} ${w * 0.1} -${h * 0.04} v${h * 0.46} h${w * 0.4} v-${h * 0.46} l${w * 0.1} ${h * 0.04} ${w * 0.06} -${h * 0.14} -${w * 0.18} -${h * 0.1} c-${w * 0.04} ${h * 0.05} -${w * 0.32} ${h * 0.05} -${w * 0.36} 0Z" fill="${c[1]}"/><circle cx="${w / 2}" cy="${h * 0.45}" r="${w * 0.08}" fill="${c[2]}"/>`);
  },
  tote(c, seed, w = 900, h = 1100) {
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><path d="M${w * 0.38} ${h * 0.34} v-${h * 0.08} a${w * 0.12} ${w * 0.12} 0 0 1 ${w * 0.24} 0 v${h * 0.08}" fill="none" stroke="${c[2]}" stroke-width="${w * 0.03}"/><rect x="${w * 0.26}" y="${h * 0.32}" width="${w * 0.48}" height="${h * 0.5}" fill="${c[1]}"/><text x="${w / 2}" y="${h * 0.6}" font-family="Georgia,serif" font-size="${w * 0.06}" text-anchor="middle" fill="${c[2]}">hello</text>`, true);
  },
  mug(c, seed, w = 900, h = 1100) {
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><path d="M${w * 0.66} ${h * 0.45} h${w * 0.06} a${w * 0.08} ${w * 0.08} 0 0 1 0 ${w * 0.16} h-${w * 0.06}" fill="none" stroke="${c[1]}" stroke-width="${w * 0.04}"/><rect x="${w * 0.3}" y="${h * 0.38}" width="${w * 0.36}" height="${h * 0.36}" rx="${w * 0.03}" fill="${c[1]}"/><rect x="${w * 0.3}" y="${h * 0.5}" width="${w * 0.36}" height="${h * 0.05}" fill="${c[2]}"/>`);
  },
  cap(c, seed, w = 900, h = 1100) {
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><path d="M${w * 0.24} ${h * 0.56} a${w * 0.26} ${w * 0.26} 0 0 1 ${w * 0.52} 0Z" fill="${c[1]}"/><path d="M${w * 0.5} ${h * 0.56} h${w * 0.36} c0 ${h * 0.04} -${w * 0.06} ${h * 0.06} -${w * 0.16} ${h * 0.06} h-${w * 0.2}Z" fill="${c[2]}"/><circle cx="${w / 2}" cy="${h * 0.32}" r="${w * 0.02}" fill="${c[2]}"/>`);
  },
  // food from above
  plate(c, seed, w = 1000, h = 800) {
    const r = rng(seed); let dots = '';
    for (let i = 0; i < 7; i++) dots += `<circle cx="${w * (0.4 + r() * 0.2)}" cy="${h * (0.38 + r() * 0.24)}" r="${w * (0.02 + r() * 0.03)}" fill="${c[3 + (i % 2)] || c[3]}"/>`;
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.36}" fill="${c[1]}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.26}" fill="${c[2]}"/>${dots}<rect x="${w * 0.84}" y="${h * 0.15}" width="${w * 0.02}" height="${h * 0.7}" rx="${w * 0.01}" fill="${c[1]}"/>`);
  },
  // a stage with lights
  stage(c, seed, w = 1400, h = 800) {
    const r = rng(seed); let beams = '';
    for (let i = 0; i < 5; i++) { const x = w * (0.1 + i * 0.2); beams += `<path d="M${x} 0 L${x - w * 0.08 + r() * w * 0.04} ${h * 0.75} H${x + w * 0.08} Z" fill="${c[1]}" opacity="${0.12 + r() * 0.12}"/>`; }
    let crowd = ''; for (let x = 0; x < w; x += w / 28) crowd += `<circle cx="${x + r() * 20}" cy="${h * (0.86 + r() * 0.04)}" r="${h * 0.05}" fill="${c[3] || '#000'}"/>`;
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/>${beams}<rect y="${h * 0.72}" width="${w}" height="${h * 0.04}" fill="${c[2]}"/><rect x="${w * 0.46}" y="${h * 0.45}" width="${w * 0.08}" height="${h * 0.27}" fill="${c[2]}"/>${crowd}<rect y="${h * 0.9}" width="${w}" height="${h * 0.1}" fill="${c[3] || '#000'}"/>`);
  },
  // an interior: a window and a chair
  room(c, seed, w = 1200, h = 900) {
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><rect y="${h * 0.74}" width="${w}" height="${h * 0.26}" fill="${c[1]}"/><rect x="${w * 0.12}" y="${h * 0.14}" width="${w * 0.3}" height="${h * 0.44}" fill="${c[2]}"/><path d="M${w * 0.27} ${h * 0.14} v${h * 0.44} M${w * 0.12} ${h * 0.36} h${w * 0.3}" stroke="${c[0]}" stroke-width="${w * 0.01}"/><rect x="${w * 0.58}" y="${h * 0.5}" width="${w * 0.2}" height="${h * 0.06}" fill="${c[3]}"/><rect x="${w * 0.58}" y="${h * 0.32}" width="${w * 0.04}" height="${h * 0.42}" fill="${c[3]}"/><rect x="${w * 0.74}" y="${h * 0.56}" width="${w * 0.04}" height="${h * 0.18}" fill="${c[3]}"/><circle cx="${w * 0.86}" cy="${h * 0.34}" r="${w * 0.05}" fill="${c[4] || c[3]}"/>`);
  },
  // blocks for a screenshot of an app
  screen(c, seed, w = 1400, h = 900) {
    const r = rng(seed); let rows = '';
    for (let i = 0; i < 6; i++) rows += `<rect x="${w * 0.27}" y="${h * (0.2 + i * 0.1)}" width="${w * (0.3 + r() * 0.3)}" height="${h * 0.04}" rx="6" fill="${i === 1 ? c[3] : c[2]}"/>`;
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/><rect width="${w * 0.22}" height="${h}" fill="${c[1]}"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${w * 0.03}" y="${h * (0.12 + i * 0.07)}" width="${w * 0.14}" height="${h * 0.03}" rx="5" fill="${c[2]}"/>`).join('')}${rows}<rect x="${w * 0.75}" y="${h * 0.2}" width="${w * 0.2}" height="${h * 0.5}" rx="10" fill="${c[1]}"/>`, false);
  },
  // a pixel scene for a game
  pixel(c, seed, w = 320, h = 180) {
    const r = rng(seed); let px = `<rect width="${w}" height="${h}" fill="${c[0]}"/>`;
    for (let i = 0; i < 40; i++) px += `<rect x="${Math.floor(r() * w)}" y="${Math.floor(r() * h * 0.5)}" width="2" height="2" fill="${c[1]}"/>`;
    let x = 0; while (x < w) { const hh = 20 + Math.floor(r() * 50); px += `<rect x="${x}" y="${h - hh}" width="16" height="${hh}" fill="${c[2]}"/><rect x="${x}" y="${h - hh}" width="16" height="4" fill="${c[3]}"/>`; x += 16; }
    px += `<rect x="${w * 0.3}" y="${h - 92}" width="8" height="12" fill="${c[4] || c[1]}"/><rect x="${w * 0.3 + 2}" y="${h - 96}" width="4" height="4" fill="${c[4] || c[1]}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 4}" height="${h * 4}" shape-rendering="crispEdges" role="img">${px}</svg>`;
  },
  // a cover square (podcast, album, book)
  cover(c, seed, w = 800, h = 800) {
    const r = rng(seed), k = Math.floor(r() * 3);
    const shapes = [`<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${w * 0.3}" fill="${c[1]}"/><circle cx="${w * 0.5}" cy="${h * 0.5}" r="${w * 0.08}" fill="${c[0]}"/>`,
      `<rect x="${w * 0.15}" y="${h * 0.15}" width="${w * 0.7}" height="${h * 0.35}" fill="${c[1]}"/><rect x="${w * 0.15}" y="${h * 0.56}" width="${w * 0.45}" height="${h * 0.29}" fill="${c[2]}"/>`,
      `<path d="M0 ${h} L${w * 0.5} ${h * 0.2} L${w} ${h}Z" fill="${c[1]}"/><circle cx="${w * 0.75}" cy="${h * 0.25}" r="${w * 0.08}" fill="${c[2]}"/>`][k];
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${c[0]}"/>${shapes}`);
  },
};

// [template, file, motif, colors, seed]
const ART = [
  ['linkbio', 'avatar.svg', 'portrait', ['#E9DFC9', '#C6623A', '#2F3B2C', '#E3A33B'], 3],
  ['merch', 'socks-ember.svg', 'sock', ['#ECE8E1', '#D9472B', '#1E1E1E', '#F3B23A'], 1],
  ['merch', 'socks-moss.svg', 'sock', ['#E4E8DF', '#5D7A4E', '#F2EDE2', '#1E1E1E'], 2],
  ['merch', 'tee.svg', 'tee', ['#E9E6EF', '#1E1E1E', '#D9472B'], 3],
  ['merch', 'tote.svg', 'tote', ['#EFE7DA', '#D8C7A8', '#1E1E1E'], 4],
  ['merch', 'mug.svg', 'mug', ['#E2E7EC', '#F4F1EA', '#D9472B'], 5],
  ['merch', 'cap.svg', 'cap', ['#EDE5DD', '#2B3A55', '#D9472B'], 6],
  ['portfolio', 'work-1.svg', 'room', ['#D9CBB6', '#A8896A', '#F2EBDD', '#3D2C22', '#B4552E'], 11],
  ['portfolio', 'work-2.svg', 'screen', ['#F3EFE7', '#E5DDCF', '#CDBFAA', '#B4552E'], 12],
  ['portfolio', 'work-3.svg', 'still', ['#E8D9C4', '#BFA382', '#3D2C22', '#B4552E', '#7C8C6E'], 13],
  ['portfolio', 'work-4.svg', 'cover', ['#2F2621', '#B4552E', '#E8D9C4'], 14],
  ['creator', 'video-1.svg', 'screen', ['#17121F', '#241C30', '#3A2F4A', '#C8F04B'], 21],
  ['creator', 'video-2.svg', 'pixel', ['#1B1530', '#F5E7A1', '#3D2F5C', '#C8F04B', '#FF7A59'], 22],
  ['creator', 'video-3.svg', 'room', ['#2A2236', '#1F1829', '#C8F04B', '#4B3D5E', '#FF7A59'], 23],
  ['creator', 'face.svg', 'portrait', ['#C8F04B', '#2A2236', '#17121F', '#FF7A59'], 24],
  ['band', 'stage.svg', 'stage', ['#0F0F0F', '#F7D13D', '#2A2A2A', '#050505'], 31],
  ['band', 'album-1.svg', 'cover', ['#F7D13D', '#0F0F0F', '#E2462C'], 32],
  ['band', 'album-2.svg', 'cover', ['#E2462C', '#F7D13D', '#0F0F0F'], 34],
  ['cafe', 'plate-1.svg', 'plate', ['#E9DDC7', '#F7F1E6', '#D9B98A', '#5E7B52', '#B3532D'], 41],
  ['cafe', 'plate-2.svg', 'plate', ['#294234', '#EFE6D3', '#C79A5C', '#8A3B22', '#EAD9B5'], 42],
  ['cafe', 'room.svg', 'room', ['#EFE6D3', '#B88E61', '#C9D6C3', '#294234', '#B3532D'], 43],
  ['service', 'van.svg', 'landscape', ['#DCE8F3', '#F5C342', '#9DB8D1', '#5F88AE', '#1F4E79'], 51],
  ['wedding', 'venue.svg', 'landscape', ['#F1E9DF', '#E8C9A6', '#C9D3BE', '#A7B597', '#7A8C6A'], 61],
  ['wedding', 'couple.svg', 'still', ['#EFE4D6', '#D8C6AE', '#8C9C7A', '#C99A8A', '#F7F1E8'], 62],
  ['podcast', 'cover.svg', 'cover', ['#1E1B16', '#E8B33C', '#F2EDE2'], 71],
  ['podcast', 'host.svg', 'portrait', ['#E8B33C', '#1E1B16', '#3A342A', '#F2EDE2'], 72],
  ['blog', 'post-1.svg', 'landscape', ['#E7E2D6', '#C45B3C', '#B9B39F', '#8F8A76', '#5F5B4C'], 81],
  ['blog', 'post-2.svg', 'still', ['#EDE8DC', '#CFC6B2', '#4A4636', '#C45B3C', '#8F8A76'], 82],
  ['saas', 'app.svg', 'screen', ['#FFFFFF', '#F1F2F4', '#E1E4E8', '#1F4BFF'], 91],
  ['gamepage', 'shot-1.svg', 'pixel', ['#13233F', '#F4E9C8', '#2E4A3B', '#7FBF5A', '#FF6B8B'], 101],
  ['gamepage', 'shot-2.svg', 'pixel', ['#2B1640', '#FFD27A', '#4A2C5E', '#9B6BD6', '#FF6B8B'], 102],
  ['gamepage', 'shot-3.svg', 'pixel', ['#0E2F2C', '#E6F7D3', '#1F4D45', '#55C2A2', '#FFB347'], 103],
  ['resume', 'me.svg', 'portrait', ['#DDE3E8', '#8796A5', '#2C3A47', '#B5432F'], 111],
  ['nonprofit', 'field.svg', 'landscape', ['#F3EDDC', '#E9B44C', '#A9BF84', '#6F9256', '#3E5E34'], 121],
  ['nonprofit', 'hands.svg', 'still', ['#EAE2CF', '#D5C7A6', '#3E5E34', '#E9B44C', '#B4613B'], 122],
  ['photography', 'p-1.svg', 'landscape', ['#1D2228', '#D9C7A1', '#39424C', '#2A3038', '#14181C'], 131],
  ['photography', 'p-2.svg', 'still', ['#2B2622', '#45403A', '#D9C7A1', '#8C5A3C', '#6B7A6A'], 132],
  ['photography', 'p-3.svg', 'room', ['#3A3F45', '#24282D', '#BFB6A3', '#15181B', '#8C5A3C'], 133],
  ['photography', 'p-4.svg', 'landscape', ['#C9D2D6', '#F1E6CC', '#9AA8AE', '#6E7E86', '#3F4B52'], 134],
  ['photography', 'p-5.svg', 'portrait', ['#2A2D31', '#BFB6A3', '#15181B', '#8C5A3C'], 135],
  ['photography', 'p-6.svg', 'plate', ['#1E2124', '#3A3F45', '#D9C7A1', '#8C5A3C', '#6B7A6A'], 136],
  ['comingsoon', 'object.svg', 'still', ['#E9E4F2', '#D2CAE3', '#2D2546', '#F25C3B', '#9B8FC2'], 141],
];

for (const [id, file, motif, colors, seed] of ART) {
  const dir = path.join(LIB, id, 'img'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), M[motif](colors, seed));
}
console.log(`wrote ${ART.length} pictures`);
