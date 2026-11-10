#!/usr/bin/env node
// Builds docs/design-tokens.json, the machine-readable copy of the design system that AI agents
// (Claude Code, Cursor, a member's own agent) read before writing UI. The CSS is the source of truth:
// colors/radii/fonts come from app/ui/styles.css (:root = dark, body.light = light) and motion from
// app/ui/motion.css. Format: W3C Design Tokens (DTCG) style, `$value` + `$type`, one value per mode.
//   node scripts/dev/design-tokens.js          write the file
//   node scripts/dev/design-tokens.js --check  exit 1 if the file is out of date (used by npm test)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const OUT = path.join(ROOT, 'docs', 'design-tokens.json');

function block(css, selector) {
  const out = {};
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  let m;
  while ((m = re.exec(css))) {
    const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
    for (const decl of body.split(';')) {
      const d = decl.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/);
      if (d) out[d[1]] = d[2].replace(/\s+/g, ' ');
    }
  }
  return out;
}
const typeOf = (name, v) => /^--(dur)/.test(name) ? 'duration' : /^--ease/.test(name) ? 'cubicBezier'
  : /^--(font|display|mono)$/.test(name) ? 'fontFamily' : /^--(r|r-|rise)/.test(name) ? 'dimension'
  : /^(#|rgba?\()/.test(v) ? 'color' : 'other';

// What each token is for, in a few words, so an agent picks the right one.
const ROLE = {
  '--canvas': 'app background', '--surface': 'cards and panels', '--surface-2': 'raised: inputs, hover rows', '--surface-3': 'pressed / selected',
  '--border': '1px borders', '--edge-pop': 'focused or hovered border', '--text': 'primary text', '--muted': 'secondary text', '--faint': 'captions, meta',
  '--accent': 'Ember: the one primary action per screen', '--accent-2': 'Teal: live, agents, AI at work', '--peer': 'Indigo: people and peers',
  '--online': 'success, approve', '--ember': 'rose: errors, deny, alerts', '--amber': 'warnings, waiting',
  '--accent-ink': 'Ember text on dark tints', '--live-ink': 'Teal text', '--peer-ink': 'Indigo text', '--chip': 'Ember tint background',
  '--live-tint': 'Teal tint background', '--peer-tint': 'Indigo tint background', '--scrim': 'behind sheets and drawers',
  '--r-sm': 'controls', '--r': 'cards', '--r-lg': 'panels and sheets',
  '--dur-instant': 'press feedback', '--dur-quick': 'hover, toggles, section cross-fade', '--dur-base': 'drawers, sheets, toasts, menus', '--dur-slow': 'large panels',
  '--ease-out': 'things arriving', '--ease-in': 'things leaving', '--ease-in-out': 'moving A to B', '--rise': 'entrance distance',
};
const SKIP = /^--(shadow|card-shadow|grain|grain-filter|brand|live|alert|win|page|stroke|edge|on-live|amber-ink|ember-ink|amber-tint|ember-tint|ease)$/;

function build() {
  const styles = read('app/ui/styles.css');
  const dark = { ...block(styles, ':root'), ...block(styles, 'body.dark') };
  const light = block(styles, 'body.light');
  const motion = block(read('app/ui/motion.css'), ':root');
  const group = {};
  const put = (cat, name, v, modes) => {
    const t = { $type: typeOf(name, v), $value: v };
    if (modes) t.$extensions = { 'tribecode.modes': modes };
    if (ROLE[name]) t.$description = ROLE[name];
    t.css = `var(${name})`;
    (group[cat] = group[cat] || {})[name.slice(2)] = t;
  };
  for (const [name, v] of Object.entries(dark)) {
    if (SKIP.test(name)) continue;
    const ty = typeOf(name, v);
    const cat = ty === 'color' ? 'color' : ty === 'fontFamily' ? 'font' : ty === 'dimension' ? 'radius' : null;
    if (!cat) continue;
    put(cat, name, v, light[name] && light[name] !== v ? { dark: v, light: light[name] } : null);
  }
  for (const [name, v] of Object.entries(motion)) put('motion', name, v);
  return {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    $description: 'TribeCode design tokens. Generated from app/ui/styles.css and app/ui/motion.css by scripts/dev/design-tokens.js; edit the CSS, then rerun. Rules: docs/DESIGN-SYSTEM.md.',
    rules: [
      'Flat matte: 1px borders, depth only from luminance steps (canvas → surface → surface-2 → surface-3). No glows, shadows, blur or gradients.',
      'Use var(--token) in CSS; never hardcode a palette hex or a duration.',
      'One Ember (--accent) primary action per screen. Teal means live / AI at work. Indigo means people.',
      'Animate named properties (never `transition: all`) with --dur-* and --ease-*, opacity-led, 2–8px of movement; honor prefers-reduced-motion.',
      'Each section: a mono eyebrow, a clear title, one hero card. Long text: line-height 1.6, about 65 characters per line.',
      'Phones: design the 390px layout on purpose, no horizontal scroll, tap targets at least 44px.',
    ],
    ...group,
  };
}

const json = JSON.stringify(build(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== json) { console.error('docs/design-tokens.json is out of date: run node scripts/dev/design-tokens.js'); process.exit(1); }
  console.log('design tokens up to date');
} else {
  fs.writeFileSync(OUT, json);
  console.log('wrote docs/design-tokens.json');
}
