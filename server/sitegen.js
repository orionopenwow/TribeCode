// Site generator: the Website builder's "Design it for me" (server/showcase.js holds the state, routes and publishing).
//
// Deterministic first. Six editorial, flat layouts (no gradient hero, no stock photos, no glow): each pairs one
// self-hosted OFL display face with Inter (app/ui/assets/site-fonts, copied next to the page on build), sits on a real
// grid, and uses a restrained palette: one paper, one ink, one primary from the project color (or its sense tags),
// every pair checked for contrast. Sections come from a library (hero, story, features, gallery, play, devlog,
// roadmap, team, FAQ, footer) and are filled from what the project already has: name, bio, VISION.md, project sense,
// milestones, recent commits, Visuals screenshots and the people and agents who build it. With no screenshots the
// art is a flat SVG drawn from a seed (pixel stars, a Swiss grid, contour lines, cut-paper shapes, a dot matrix).
//
// Copy: templates written in a simple, direct, warm voice. "Write it for me" sends the facts and the current copy to
// the tribe's brain (server/llm.js: the host's cloud key, else Ollama/Qwen; or the person's in-browser model, whose
// raw reply comes back here) with a strict style prompt; the answer is parsed as JSON and every field goes through
// clean(): no hype words, no exclamation runs, at most one emoji, length caps. A field that fails keeps the template.
// The design rules are our own, written for TribeCode; they were informed by the general principles in Anthropic's
// public frontend-design skill (Apache-2.0), not copied from it. See docs/WEBSITE-GENERATOR.md.
'use strict';
const crypto = require('node:crypto');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const one = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');

// ---------- color ----------
const okHex = c => /^#[0-9a-fA-F]{6}$/.test(String(c || ''));
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Move `c` toward `to` until it reaches `min` contrast against `bg`.
function reach(c, bg, min, to) { let out = c; for (let t = 0; t <= 1.0001 && ratio(out, bg) < min; t += 0.04) out = mix(c, to, t); return out; }

// ---------- layouts ----------
const FONT_BODY = ['inter-latin-400-normal.woff2', 'inter-latin-600-normal.woff2'];
const FONT_MONO = 'jetbrains-mono-latin-500-normal.woff2';
const LAYOUTS = {
  editorial: { name: 'Editorial', note: 'Serif headlines, numbered sections, thin rules', display: 'Fraunces', file: 'fraunces-latin-700-normal.woff2', weight: 700,
    paper: '#F7F4EE', surface: '#FFFDF8', ink: '#1A1714', muted: '#5A534B', rule: '#DCD4C6', motif: 'rules', primary: '#B4432B', order: ['hero', 'story', 'features', 'gallery', 'play', 'roadmap', 'devlog', 'team', 'faq', 'footer'] },
  swiss: { name: 'Swiss', note: 'A strict grid, a flat color band, big grotesk type', display: 'Space Grotesk', file: 'space-grotesk-latin-700-normal.woff2', weight: 700,
    paper: '#F2F2EF', surface: '#FFFFFF', ink: '#111111', muted: '#4D4D4D', rule: '#CFCFCB', motif: 'grid', primary: '#2F5BEA', order: ['hero', 'features', 'story', 'gallery', 'play', 'roadmap', 'devlog', 'team', 'faq', 'footer'] },
  devlog: { name: 'Devlog', note: 'Monospace, dark, the commit log up front', display: 'JetBrains Mono', file: 'jetbrains-mono-latin-700-normal.woff2', weight: 700,
    paper: '#101215', surface: '#171A1F', ink: '#E9ECEF', muted: '#A2ABB6', rule: '#2A2F37', motif: 'dots', primary: '#7BD88F', order: ['hero', 'devlog', 'story', 'features', 'play', 'gallery', 'roadmap', 'team', 'faq', 'footer'] },
  poster: { name: 'Poster', note: 'Oversized type and cut-paper shapes', display: 'Bricolage Grotesque', file: 'bricolage-grotesque-latin-800-normal.woff2', weight: 800,
    paper: '#FFFCF5', surface: '#FFFFFF', ink: '#15120F', muted: '#514A42', rule: '#E2DACB', motif: 'blocks', primary: '#E4572E', order: ['hero', 'gallery', 'story', 'features', 'play', 'team', 'roadmap', 'devlog', 'faq', 'footer'] },
  journal: { name: 'Journal', note: 'Quiet, centered, a book-like serif', display: 'Instrument Serif', file: 'instrument-serif-latin-400-normal.woff2', weight: 400,
    paper: '#FBF7F0', surface: '#FFFDF9', ink: '#2A2320', muted: '#5F554E', rule: '#E4DACB', motif: 'topo', primary: '#9A5B3C', order: ['hero', 'story', 'gallery', 'features', 'play', 'team', 'roadmap', 'devlog', 'faq', 'footer'] },
  arcade: { name: 'Arcade', note: 'Pixel type, a star field, chunky borders', display: 'Silkscreen', file: 'silkscreen-latin-400-normal.woff2', weight: 400,
    paper: '#14121C', surface: '#1C1928', ink: '#F4F1FF', muted: '#B9B3D1', rule: '#34304A', motif: 'stars', primary: '#FFC23D', order: ['hero', 'play', 'features', 'gallery', 'story', 'roadmap', 'devlog', 'team', 'faq', 'footer'] },
};
const LAYOUT_IDS = Object.keys(LAYOUTS);
const SECTIONS = ['hero', 'story', 'features', 'gallery', 'play', 'devlog', 'roadmap', 'team', 'visit', 'event', 'pricing', 'testimonials', 'contact', 'faq', 'footer'];
// Opt-in sections: no layout or site type starts with them; they show once someone adds them (gen.add, e.g. Flint's
// "add a pricing section") and fill with honest placeholders that say what to write (never made-up prices or quotes).
const EXTRA = ['pricing', 'testimonials'];
const SECTION_NAMES = { hero: 'Hero', story: 'Story', features: 'Features', gallery: 'Gallery', play: 'Play / try it', devlog: 'Devlog', roadmap: 'Roadmap', team: 'Team', visit: 'Visit us', event: 'Event details', pricing: 'Pricing', testimonials: 'Testimonials', contact: 'Contact', faq: 'FAQ', footer: 'Footer' };

// feat/site-builder: the brand kit's font pairs (a display face + Inter), independent of the layout.
const FONTS = {
  fraunces: { name: 'Fraunces', display: 'Fraunces', file: 'fraunces-latin-700-normal.woff2', weight: 700, serif: true, feel: 'Classic' },
  grotesk: { name: 'Space Grotesk', display: 'Space Grotesk', file: 'space-grotesk-latin-700-normal.woff2', weight: 700, feel: 'Modern' },
  mono: { name: 'JetBrains Mono', display: 'JetBrains Mono', file: 'jetbrains-mono-latin-700-normal.woff2', weight: 700, feel: 'Techy' },
  bricolage: { name: 'Bricolage Grotesque', display: 'Bricolage Grotesque', file: 'bricolage-grotesque-latin-800-normal.woff2', weight: 800, feel: 'Playful' },
  instrument: { name: 'Instrument Serif', display: 'Instrument Serif', file: 'instrument-serif-latin-400-normal.woff2', weight: 400, serif: true, feel: 'Elegant' },
  silkscreen: { name: 'Silkscreen', display: 'Silkscreen', file: 'silkscreen-latin-400-normal.woff2', weight: 400, feel: 'Retro' },
};
const FONT_IDS = Object.keys(FONTS);
const LAYOUT_FONT = { editorial: 'fraunces', swiss: 'grotesk', devlog: 'mono', poster: 'bricolage', journal: 'instrument', arcade: 'silkscreen' };
const fontOf = (layout, id) => FONTS[id] || FONTS[LAYOUT_FONT[layout]] || FONTS.fraunces;
// The brand kit's quick picks: 8 calm, flat colors (any hex works; contrast is fixed for the layout either way).
const SWATCHES = ['#B4432B', '#E4572E', '#E0951F', '#4C8C4A', '#2A8C80', '#2F5BEA', '#7A5CC2', '#C2417F'];

// feat/site-builder: the kind of site. Each picks its sections, their order, a layout that suits it and starter copy.
const TYPES = {
  game: { name: 'Game page', icon: '🎮', note: 'Play button, screenshots, devlog', layout: null, order: ['hero', 'play', 'features', 'gallery', 'story', 'devlog', 'roadmap', 'team', 'faq', 'footer'] },
  app: { name: 'App landing', icon: '📱', note: 'What it does, try it, questions', layout: 'swiss', order: ['hero', 'features', 'gallery', 'story', 'play', 'faq', 'contact', 'footer'] },
  portfolio: { name: 'Portfolio', icon: '🖼️', note: 'Selected work, about, contact', layout: 'editorial', order: ['hero', 'gallery', 'features', 'story', 'contact', 'footer'] },
  business: { name: 'Small business', icon: '🏪', note: 'Hours, location, contact', layout: 'journal', order: ['hero', 'story', 'features', 'gallery', 'visit', 'faq', 'footer'] },
  event: { name: 'Event', icon: '📅', note: 'Date, place, RSVP link', layout: 'poster', order: ['hero', 'event', 'story', 'features', 'gallery', 'faq', 'footer'] },
  docs: { name: 'Docs / notes', icon: '📓', note: 'Start here, topics, latest notes', layout: 'devlog', order: ['hero', 'story', 'features', 'devlog', 'roadmap', 'faq', 'footer'] },
};
const TYPE_IDS = Object.keys(TYPES);

// feat/site-builder: one-tap themes (a palette + a font pair + a layout). Contrast is still fixed for the layout.
const THEMES = {
  cozy: { name: 'Cozy', primary: '#C0653A', accent: '#4C8C4A', font: 'instrument', layout: 'journal', note: 'Warm and calm' },
  bold: { name: 'Bold', primary: '#E4572E', accent: '', font: 'bricolage', layout: 'poster', note: 'Big type, bright color' },
  minimal: { name: 'Minimal', primary: '#2F5BEA', accent: '', font: 'grotesk', layout: 'swiss', note: 'A grid and one blue' },
  retro: { name: 'Retro pixel', primary: '#FFC23D', accent: '#7BD88F', font: 'silkscreen', layout: 'arcade', note: 'Pixel type on a night sky' },
  night: { name: 'Night', primary: '#7BD88F', accent: '#FFC23D', font: 'mono', layout: 'devlog', note: 'Dark, monospace' },
  paper: { name: 'Paper', primary: '#B4432B', accent: '', font: 'fraunces', layout: 'editorial', note: 'Like a printed page' },
  bakery: { name: 'Bakery warm', primary: '#B86B2E', accent: '#C2417F', font: 'fraunces', layout: 'journal', note: 'Crust brown and berry' },
  studio: { name: 'Studio', primary: '#7A5CC2', accent: '', font: 'grotesk', layout: 'editorial', note: 'Quiet, for showing work' },
  garden: { name: 'Garden', primary: '#4C8C4A', accent: '#E0951F', font: 'instrument', layout: 'editorial', note: 'Green and gold' },
  ocean: { name: 'Ocean', primary: '#2A8C80', accent: '', font: 'grotesk', layout: 'swiss', note: 'Teal and clean' },
};
const THEME_IDS = Object.keys(THEMES);
// What suits each kind of site, before a tribe has picked anything (the starting order of the theme list).
const KIND_THEMES = { game: ['retro', 'bold', 'night'], app: ['minimal', 'ocean', 'studio'], portfolio: ['studio', 'paper', 'minimal'], business: ['bakery', 'cozy', 'garden'], event: ['bold', 'cozy', 'paper'], docs: ['night', 'paper', 'minimal'] };

// Self-evolving, kept local and explainable: picks = { project: { theme: {id: n}, skip: {id: n}, type: {id: n}, font: {id: n} }, tribe: same shape }
function rankThemes(type, picks = {}) {
  const mine = picks.project || {}, tribe = picks.tribe || {}, kind = KIND_THEMES[type] || [];
  const score = id => ((mine.theme || {})[id] || 0) * 4 + ((tribe.theme || {})[id] || 0) * 2 - ((mine.skip || {})[id] || 0) * 3 - ((tribe.skip || {})[id] || 0) + (kind.includes(id) ? 3 - kind.indexOf(id) : 0);
  return THEME_IDS.map((id, i) => ({ id, s: score(id), i })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.id);
}
function why(id, type, picks = {}) {
  const t = THEMES[id]; if (!t) return '';
  if (((picks.project || {}).theme || {})[id]) return `Suggested because you picked ${t.name} before.`;
  if (((picks.tribe || {}).theme || {})[id]) return `Suggested because your tribe picked ${t.name} on another project.`;
  if ((KIND_THEMES[type] || []).includes(id)) return `Suggested because ${t.name} suits a ${TYPES[type].name.toLowerCase()}.`;
  return `${t.name}: ${t.note.toLowerCase()}.`;
}
// "Suggest for me" without a model: rules from the project's sense and what this tribe picked before.
function suggestRules(g, picks = {}, hint = '') {
  const type = guessType(g.sense, g.p, hint), theme = rankThemes(type, picks)[0], T = THEMES[theme];
  const s = g.sense || {}, tagline = one(g.p.bio || s.summary || '', 160);
  return { type, theme, primary: T.primary, accent: T.accent || '', font: T.font, layout: T.layout, order: TYPES[type].order.slice(), tagline: tagline && !hasHype(tagline) ? clean(tagline, 160) : '', why: why(theme, type, picks), via: 'rules' };
}
function suggestPrompt(g, type, picks = {}) {
  const s = g.sense || {};
  const facts = [`Name: ${g.p.name}`, g.p.bio ? `Bio: ${g.p.bio}` : '', s.label ? `It is: ${s.label}` : '', (s.tags || []).length ? `Tags: ${s.tags.join(', ')}` : '', type ? `Site type so far: ${type}` : '',
    g.vision ? `Vision:\n${String(g.vision).slice(0, 1200)}` : ''].filter(Boolean).join('\n');
  const liked = Object.entries((picks.project || {}).theme || {}).concat(Object.entries((picks.tribe || {}).theme || {})).map(x => x[0]);
  return { system: STYLE.replace('You edit the words on a small indie project website.', 'You help a small team pick the look of their project website.'),
    prompt: `WEBSITE LOOK\nFacts:\n${facts}\n${liked.length ? `They liked these themes before: ${[...new Set(liked)].join(', ')}\n` : ''}\nPick from these options only.\nthemes: ${THEME_IDS.join(', ')}\ntypes: ${TYPE_IDS.join(', ')}\nfonts: ${FONT_IDS.join(', ')}\nsections: ${SECTIONS.join(', ')}\n\nReply with JSON: {"theme": "", "type": "", "primary": "#RRGGBB", "accent": "#RRGGBB or empty", "font": "", "order": ["hero", ...], "tagline": "one plain sentence under 20 words", "why": "one short sentence"}` };
}
// Parse a model's suggestion and keep only valid, clean parts on top of the rules suggestion.
function parseSuggest(reply, base) {
  let j = null; try { j = JSON.parse((String(reply || '').replace(/<think>[\s\S]*?<\/think>/g, '').match(/\{[\s\S]*\}/) || [''])[0]); } catch {}
  if (!j || typeof j !== 'object') return null;
  const out = { ...base, via: 'brain' };
  if (TYPES[j.type]) { out.type = j.type; out.order = TYPES[j.type].order.slice(); }
  if (THEMES[j.theme]) { const T = THEMES[j.theme]; Object.assign(out, { theme: j.theme, primary: T.primary, accent: T.accent || '', font: T.font, layout: T.layout }); }
  if (okHex(j.primary)) out.primary = j.primary.toUpperCase();
  if (j.accent === '' || okHex(j.accent)) out.accent = j.accent ? j.accent.toUpperCase() : '';
  if (FONTS[j.font]) out.font = j.font;
  if (Array.isArray(j.order)) { const allowed = TYPES[out.type].order, o = j.order.filter(k => allowed.includes(k)).filter((k, i, a) => a.indexOf(k) === i); if (o.length >= 3 && o[0] === 'hero') out.order = [...o.filter(k => k !== 'footer'), 'footer']; }
  if (typeof j.tagline === 'string') { const t = clean(j.tagline, 160).replace(/\n/g, ' '); if (t.length >= 4 && !hasHype(t)) out.tagline = t; }
  if (typeof j.why === 'string') { const w = clean(j.why, 160).replace(/\n/g, ' '); if (w && !hasHype(w)) out.why = w; }
  return out;
}
// Business and event facts (typed in the Guided builder). Plain text, capped; links must be https.
const INFO = { hours: 300, address: 200, phone: 40, email: 120, link: 300, date: 60, time: 40, place: 200, rsvp: 300 };
const okHttps = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || ''));
const okEmail = e => /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(String(e || ''));
function cleanInfo(body) {
  const out = {};
  for (const [k, n] of Object.entries(INFO)) {
    if (body[k] === undefined) continue;
    const v = k === 'hours' ? String(body[k] ?? '').replace(/\r/g, '').split('\n').map(l => one(l, 80)).filter(Boolean).slice(0, 8).join('\n') : one(body[k], n);
    if (!v) { out[k] = ''; continue; }
    if ((k === 'link' || k === 'rsvp') && !okHttps(v)) throw Object.assign(new Error(k === 'rsvp' ? 'the RSVP link must start with https://' : 'the link must start with https://'), { status: 400 });
    if (k === 'email' && !okEmail(v)) throw Object.assign(new Error('that email does not look right'), { status: 400 });
    out[k] = clean(v, n);
  }
  return out;
}
// One tap: which kind of site fits (a hint like "a site for my bakery" wins, then the project's sense).
function guessType(sense, p, hint) {
  const words = t => {
    if (/\b(bakery|bakeries|cafe|café|coffee|restaurant|shop|store|salon|barber|bar|pub|florist|gym|clinic|plumber|repair|boutique|market|deli|pizzeria|food truck|business|bookshop)\b/.test(t)) return 'business';
    if (/\b(event|party|wedding|meetup|conference|festival|birthday|hackathon|concert|reunion|gala|rsvp)\b/.test(t)) return 'event';
    if (/\b(portfolio|my work|resume|résumé|cv)\b/.test(t)) return 'portfolio';
    if (/\b(docs|documentation|notes|wiki|handbook|notebook)\b/.test(t)) return 'docs';
    if (/\b(game|platformer|arcade|rpg|puzzle game)\b/.test(t)) return 'game';
    if (/\b(app|tool|saas|startup|product)\b/.test(t)) return 'app';
    return null;
  };
  const h = words(String(hint || '').toLowerCase().replace(/\b(web ?site|site|page|landing page|home ?page)\b/g, ' ')); if (h) return h;
  const s = sense || {}, tags = new Set(s.tags || []), kind = s.kind;
  if (kind === 'game' || kind === '3d') return 'game';
  if (kind === 'notes') return 'docs';
  if (tags.has('portfolio')) return 'portfolio';
  if (tags.has('e-commerce')) return 'business';
  const w = words(`${(p && p.name) || ''} ${(p && p.bio) || ''}`.toLowerCase()); if (w) return w;
  if (/\b(play|level|quest)\b/i.test(`${(p && p.name) || ''} ${(p && p.bio) || ''}`)) return 'game';
  return 'app';
}
const NOUN = { game: 'game', '3d': '3D world', app: 'app', site: 'website', tool: 'tool', bot: 'bot', api: 'API', notes: 'notebook', other: 'project' };
const TAG_HUE = { cozy: '#C0653A', spooky: '#7A5CC2', retro: '#D9482B', 'pixel art': '#D9482B', minimal: '#2F5BEA', saas: '#2F5BEA', farming: '#4C8C4A', music: '#C2417F', education: '#2A8C80', kids: '#E0951F', story: '#8A4FA3', portfolio: '#1F6F8B', 'e-commerce': '#1F6F8B' };
const TAG_LINES = {
  platformer: ['Run and jump', 'Tight controls that feel good on a keyboard or a pad.'], 'pixel art': ['Pixel art', 'Every sprite drawn by hand, one pixel at a time.'],
  cozy: ['A cozy pace', 'No timers and no stress. Play at your own speed.'], multiplayer: ['Play together', 'Bring a friend and play side by side.'],
  retro: ['A retro feel', 'A nod to the games we grew up with.'], puzzle: ['Small puzzles', 'Short rooms with a clever twist.'],
  rpg: ['Grow your party', 'Quests, items and a story that remembers you.'], roguelike: ['New every run', 'The levels change each time you play.'],
  spooky: ['A little spooky', 'Lights low, sound on.'], racing: ['Fast laps', 'Drift, boost and beat your best time.'], farming: ['Grow things', 'Plant, wait, harvest, repeat.'],
  story: ['A story to follow', 'Characters and moments worth staying for.'], portfolio: ['Selected work', 'A few projects, told properly.'],
  'e-commerce': ['Simple checkout', 'Find it, buy it, done.'], saas: ['Clear plans', 'Know what you pay for, and why.'], 'landing page': ['One clear page', 'Everything you need to know in one scroll.'],
  blog: ['Notes and posts', 'Writing about what we learn as we build.'], dashboard: ['At a glance', 'The numbers that matter, on one screen.'],
  social: ['Friends first', 'Follow people, not feeds.'], productivity: ['Stay on track', 'Small habits, tracked without fuss.'], music: ['Made for sound', 'Beats, loops and songs to play with.'],
  education: ['Learn by doing', 'Short lessons you can try right away.'], ai: ['A helpful brain', 'Smart where it helps, quiet where it does not.'],
  minimal: ['Nothing extra', 'Only what you need, nothing in the way.'], kids: ['Kid friendly', 'Bright, simple and safe to explore.'], '3d': ['In three dimensions', 'Walk around and look closer.'],
};

// ---------- the voice ----------
const HYPE = ['revolutionary', 'revolutionize', 'game-changing', 'game changer', 'game-changer', 'cutting-edge', 'cutting edge', 'next-gen', 'next-level', 'seamless', 'seamlessly',
  'unleash', 'supercharge', 'elevate', 'empower', 'synergy', 'leverage', 'disrupt', 'world-class', 'best-in-class', 'blazing', 'effortless', 'effortlessly', 'robust',
  'innovative', 'harness', 'unlock', 'transformative', 'delve', 'ultimate', 'state-of-the-art', 'ai-powered', 'magical', 'groundbreaking', 'unparalleled', 'reimagine',
  'redefine', 'paradigm', 'turbocharge', 'skyrocket', 'epic', 'insane', 'mind-blowing', 'stunning', 'breathtaking', 'immersive', 'elevated', 'curated'];
const HYPE_RX = new RegExp(`(^|[^a-z])(${HYPE.map(w => w.replace(/[-\s]/g, '[-\\s]?')).join('|')})(?=$|[^a-z])`, 'i');
const EMOJI_RX = /\p{Extended_Pictographic}/gu;
const hasHype = s => HYPE_RX.test(String(s || ''));
// One field, cleaned: spaces collapsed, "!!!" calmed, at most one emoji, no markdown marks, capped.
function clean(s, max = 400) {
  let t = String(s ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').replace(/\r/g, '');
  t = t.replace(/[*_`#>]+/g, '').replace(/!{2,}/g, '.').replace(/\?{2,}/g, '?');
  let n = 0; t = t.replace(EMOJI_RX, m => (++n > 1 ? '' : m));
  return t.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}
const STYLE = 'You edit the words on a small indie project website. Write simple, direct, warm sentences a friend would say. Use only the facts given; never invent features, numbers, prices, dates or people. ' +
  `Never use these words: ${HYPE.slice(0, 30).join(', ')}. No exclamation marks. No emoji. No marketing clichés. Headlines under 8 words. Body text under 60 words. Keep names exactly as given. Reply with one JSON object only, no prose around it.`;

// ---------- seeded randomness ----------
function rng(seed) { let a = parseInt(crypto.createHash('sha1').update(String(seed)).digest('hex').slice(0, 8), 16) >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The layout that suits the project best (game + pixel → Arcade, cozy/story → Journal, tools and APIs → Devlog…).
function pickLayout(sense, seed) {
  const s = sense || {}, tags = new Set(s.tags || []), kind = s.kind || 'other';
  if (kind === 'game' && (tags.has('pixel art') || tags.has('retro'))) return 'arcade';
  if (tags.has('cozy') || tags.has('story') || kind === 'notes') return 'journal';
  if (['tool', 'api', 'bot'].includes(kind)) return 'devlog';
  if (tags.has('portfolio') || tags.has('blog')) return 'editorial';
  if (tags.has('saas') || tags.has('landing page') || tags.has('dashboard') || kind === 'app') return 'swiss';
  if (kind === 'game' || kind === '3d') return 'poster';
  return LAYOUT_IDS[Math.floor(rng(seed)() * LAYOUT_IDS.length)];
}
const nextLayout = cur => LAYOUT_IDS[(LAYOUT_IDS.indexOf(cur) + 1) % LAYOUT_IDS.length];

// ---------- copy from project data (deterministic) ----------
function visionParts(text) {
  const bullets = [], body = [];
  for (const l of String(text || '').split('\n')) { const m = l.trim().match(/^[-*•]\s+(.*)$/); if (m) bullets.push(m[1].trim()); else body.push(l); }
  return { bullets, body: body.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}
function draftCopy(g, seed = 0, type = null, info = {}) {
  const pickR = rng(`${g.p.id}:copy:${seed}`), pick = arr => (seed ? arr[Math.floor(pickR() * arr.length)] : arr[0]);
  const p = g.p, f = (g.st && g.st.fields) || {}, s = g.sense || {}, kind = s.kind || (g.looksGame ? 'game' : 'other'), noun = NOUN[kind] || 'project';
  const tags = (s.tags || []).filter(t => t !== kind).slice(0, 4), game = kind === 'game' || g.looksGame;
  const vp = visionParts(f.about || g.vision);
  const dek = one(f.tagline || p.bio || s.summary || `A ${noun} made by a few friends.`, 200);
  const cta = g.play ? (game ? 'Play it' : 'Try it') : g.repoUrl ? 'See the code' : '';
  let items = vp.bullets.slice(0, 6).map(b => { const m = b.match(/^(.{2,48}?)\s*(?::|—| - )\s*(.+)$/); return m ? { title: one(m[1], 60), body: cap(one(m[2], 160)) } : { title: one(b, 60), body: '' }; });
  if (items.length < 3) for (const t of s.tags || []) { if (items.length >= 4) break; const l = TAG_LINES[t]; if (l && !items.some(i => i.title === l[0])) items.push({ title: l[0], body: l[1] }); }
  const people = g.people || [], agents = g.agents || [];
  const names = people.map(x => x.name.split(' ')[0]);
  const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join(' and ');
  const audience = s.audience || (game ? 'players' : 'anyone curious');
  const faq = [{ q: `What is ${p.name}?`, a: dek }, { q: 'Who is it for?', a: `Made for ${audience}${s.tone ? `, with a ${s.tone} feel` : ''}.` }];
  if (g.play) faq.push({ q: game ? 'Can I play it?' : 'Can I try it?', a: `Yes. Press ${cta} at the top. It runs in your browser, no install.` });
  if (g.repoUrl) faq.push({ q: 'Is the code open?', a: 'The code is on GitHub. Have a look, star it or open an issue.' });
  faq.push({ q: 'How is it made?', a: `${list || 'A small team'}${agents.length ? ` and ${agents.length === 1 ? 'an AI agent' : `${agents.length} AI agents`}` : ''} build it together in TribeCode, one commit at a time.` });
  const base = {
    hero: { kicker: one([cap(noun), ...tags.slice(0, 2)].join(' · '), 80), title: one(f.headline || p.name, 80), dek, cta },
    story: { title: game ? pick(['The idea', 'Why we are making it', 'How it started']) : kind === 'site' ? pick(['Why it exists', 'The idea', 'What it is for']) : kind === 'tool' || kind === 'api' ? pick(['What it does', 'Why we built it']) : pick(['The idea', 'What it is', 'Why it exists']), body: clean(vp.body || [p.bio, s.summary].filter(Boolean).join('\n\n'), 1600) },
    features: { title: game ? pick(['What you can do', 'In the game', 'What to expect']) : pick(['What it does', 'What you get', 'The good parts']), items },
    gallery: { title: game ? pick(['Screenshots', 'A look inside', 'From the game']) : pick(['A look inside', 'Screens', 'How it looks']) },
    play: { title: game ? 'Play it in your browser' : 'Try it', body: g.play && !/^https:/.test(g.play) ? 'It runs right here on the page. No install, no account.' : 'It opens in a new tab. No install, no account.' },
    devlog: { title: pick(['Devlog', 'Lately', 'Recent work']) },
    roadmap: { title: pick(['Roadmap', 'What is next', 'Milestones']) },
    team: { title: 'Made by', body: `${people.length} ${people.length === 1 ? 'person' : 'people'}${agents.length ? ` and ${agents.length} AI ${agents.length === 1 ? 'agent' : 'agents'}` : ''} ${people.length + agents.length === 1 ? 'builds' : 'build'} ${p.name} together.` },
    faq: { title: pick(['Questions', 'Good to know', 'FAQ']), items: faq.slice(0, 6) },
    footer: { text: one(f.footer || `${p.name}, made by ${list || 'friends'} with TribeCode.`, 160) },
    visit: { title: 'Visit us', body: '' },
    event: { title: 'The details', body: '' },
    contact: { title: 'Get in touch', body: 'Write any time. We read everything.' },
    pricing: { title: 'Pricing', body: 'Placeholder prices: set your own before you publish.', items: [{ name: 'Free', price: '$0', body: 'Everything you need to try it.' }, { name: 'Plus', price: 'Set a price', body: 'Say what the paid plan adds.' }] },
    testimonials: { title: 'What people say', items: [{ quote: 'Paste a real quote from someone who used it here.', who: 'Their name' }] },
  };
  return typeCopy(base, g, type, info || {}, dek);
}
// feat/site-builder: the same facts, said the way each kind of site would say them.
function typeCopy(c, g, type, info, dek) {
  const p = g.p, name = p.name;
  if (['business', 'event', 'portfolio'].includes(type)) c.faq.items = c.faq.items.filter(x => !/^(How is it made|Is the code open|Can I (play|try) it)/.test(x.q));
  if (type === 'app') { c.hero.cta = g.play ? 'Try it' : g.repoUrl ? 'See the code' : ''; c.features.title = 'What it does'; c.contact.body = 'Questions, ideas or a bug? Tell us.'; }
  if (type === 'portfolio') {
    Object.assign(c.hero, { kicker: 'Portfolio', cta: info.email || info.link || info.phone ? 'Get in touch' : '' });
    c.gallery.title = 'Selected work'; c.features.title = 'What I do'; c.story.title = 'About'; c.contact.body = 'Open to new work and good conversations.';
    c.footer.text = one(`${name}. Thanks for looking.`, 160);
  }
  if (type === 'business') {
    Object.assign(c.hero, { kicker: one(info.address ? info.address.split(',').slice(-1)[0] : 'Local business', 80), cta: 'Visit us' });
    c.story.title = 'Our story'; c.features.title = 'What we offer'; c.gallery.title = 'A look inside'; c.faq.title = 'Good to know';
    if (!c.story.body) c.story.body = clean(dek, 1600);
    const q = []; if (info.hours) q.push({ q: 'When are you open?', a: info.hours.replace(/\n/g, ', ') });
    if (info.address) q.push({ q: 'Where are you?', a: info.address });
    if (info.phone || info.email) q.push({ q: 'How do I reach you?', a: [info.phone && `Call ${info.phone}`, info.email && `email ${info.email}`].filter(Boolean).join(' or ') + '.' });
    c.faq.items = [...q, ...c.faq.items.filter(x => /^What is/.test(x.q))].slice(0, 6);
    c.footer.text = one(`${name}${info.address ? `, ${info.address}` : ''}.`, 160);
  }
  if (type === 'event') {
    Object.assign(c.hero, { kicker: one([info.date, info.place].filter(Boolean).join(' · ') || 'Event', 80), cta: info.rsvp ? 'RSVP' : 'The details' });
    c.story.title = 'What it is'; c.features.title = 'What to expect';
    if (!c.story.body) c.story.body = clean(dek, 1600);
    const q = []; if (info.date) q.push({ q: 'When is it?', a: [info.date, info.time].filter(Boolean).join(', ') + '.' });
    if (info.place) q.push({ q: 'Where is it?', a: info.place });
    if (info.rsvp) q.push({ q: 'How do I say I am coming?', a: 'Press RSVP at the top. It opens the sign-up page.' });
    c.faq.items = [...q, ...c.faq.items.filter(x => /^(What is|Who is it for)/.test(x.q))].slice(0, 6);
    c.footer.text = one(`${name}${info.date ? `, ${info.date}` : ''}. See you there.`, 160);
  }
  if (type === 'docs') { c.hero.kicker = 'Notes'; c.story.title = 'Start here'; c.features.title = 'Topics'; c.devlog.title = 'Latest notes'; c.roadmap.title = 'What is next'; }
  return c;
}
// Fresh template copy, keeping every section someone edited by hand.
function mergeCopy(fresh, prev, edited) { const out = { ...fresh }; for (const k of Object.keys(edited || {})) if (edited[k] && prev && prev[k]) out[k] = prev[k]; return out; }

// Which sections have something to show.
function available(g, gen) {
  const c = gen.copy || {}, i = gen.info || {};
  return { hero: true, story: !!(c.story && c.story.body), features: !!(c.features && (c.features.items || []).length >= 2), gallery: (g.shots || []).length > 0, play: !!g.play,
    devlog: (g.commits || []).length + (g.news || []).length > 0, roadmap: (g.milestones || []).length > 0, team: (g.people || []).length + (g.agents || []).length > 0, faq: !!(c.faq && (c.faq.items || []).length), footer: true,
    visit: !!(i.hours || i.address || i.phone || i.email), event: !!(i.date || i.place || i.rsvp), contact: !!(i.email || i.link || i.phone),
    pricing: (gen.add || []).includes('pricing') && !!(c.pricing && (c.pricing.items || []).length), testimonials: (gen.add || []).includes('testimonials') && !!(c.testimonials && (c.testimonials.items || []).length) };
}

// ---------- palette ----------
function palette(L, g, brand) {
  const s = g.sense || {}, pc = okHex(g.p.color) ? g.p.color.toUpperCase() : '', b = brand || {};
  const tagHue = (s.tags || []).map(t => TAG_HUE[t]).find(Boolean);
  let primary = okHex(b.primary) ? b.primary.toUpperCase() : pc && pc !== '#F26B1D' ? pc : tagHue || L.primary;
  const dark = lum(L.paper) < 0.2;
  // Fill: shapes and the hero band. On a dark paper it must stand out (3:1); on light paper it can be deep.
  primary = reach(primary, L.paper, 3, dark ? '#FFFFFF' : L.ink);
  const onPrimary = ratio(primary, '#FFFFFF') >= ratio(primary, '#111111') ? '#FFFFFF' : '#111111';
  const btn = reach(primary, onPrimary, 4.5, onPrimary === '#FFFFFF' ? '#000000' : '#FFFFFF');
  const link = reach(primary, L.paper, 4.5, dark ? '#FFFFFF' : L.ink);
  const tint = mix(L.paper, primary, dark ? 0.16 : 0.12);
  const muted = reach(L.muted, L.surface, 4.5, L.ink);
  const accent = okHex(b.accent) ? reach(reach(b.accent.toUpperCase(), L.surface, 4.5, dark ? '#FFFFFF' : L.ink), L.paper, 4.5, dark ? '#FFFFFF' : L.ink) : muted;
  return { paper: L.paper, surface: L.surface, ink: L.ink, muted, rule: L.rule, primary, onPrimary, btn, link, tint, accent, dark };
}
// feat/site-builder: what the contrast check changed, in plain words, for the brand kit.
function brandNotes(layout, brand, g) {
  const L = LAYOUTS[layout] || LAYOUTS.editorial, b = brand || {}, pal = palette(L, g || { p: {}, sense: null }, b), out = [];
  if (okHex(b.primary)) {
    const want = b.primary.toUpperCase();
    if ([pal.primary, pal.link, pal.btn].some(x => x !== want)) out.push({ which: 'primary', from: want, to: pal.link, text: `Adjusted so text stays readable on the ${L.name} layout: links use ${pal.link}${pal.btn !== pal.link ? `, buttons ${pal.btn}` : ''}${pal.primary !== want && pal.primary !== pal.link ? `, shapes ${pal.primary}` : ''}.` });
  }
  if (okHex(b.accent) && pal.accent !== b.accent.toUpperCase()) out.push({ which: 'accent', from: b.accent.toUpperCase(), to: pal.accent, text: `The accent is shown as ${pal.accent} so small text stays readable.` });
  return out;
}

// ---------- flat SVG art (seeded; no gradients, no filters) ----------
function art(motif, pal, seed, w = 1200, h = 720, label = '') {
  const r = rng(seed + motif), R = n => Math.floor(r() * n), out = [];
  const bg = motif === 'stars' || motif === 'dots' ? pal.surface : pal.tint;
  if (motif === 'stars') {
    for (let i = 0; i < 140; i++) { const s = r() < 0.12 ? 8 : 4; out.push(`<rect x="${R(w / 4) * 4}" y="${R(h / 4) * 4}" width="${s}" height="${s}" fill="${r() < 0.18 ? pal.primary : pal.ink}" opacity="${(0.35 + r() * 0.65).toFixed(2)}"/>`); }
    const px = [[0, 1, 0], [1, 1, 1], [0, 1, 0]]; const ox = w * 0.62, oy = h * 0.28, z = 28;
    px.forEach((row, y) => row.forEach((v, x) => v && out.push(`<rect x="${ox + x * z}" y="${oy + y * z}" width="${z}" height="${z}" fill="${pal.primary}"/>`)));
    out.push(`<rect x="0" y="${h - 96}" width="${w}" height="96" fill="${pal.rule}"/>`);
    for (let x = 0; x < w; x += 48) out.push(`<rect x="${x}" y="${h - 96}" width="24" height="24" fill="${pal.paper}" opacity=".35"/>`);
  } else if (motif === 'grid') {
    const n = 8, cw = w / n, ch = h / 5;
    for (let x = 0; x < n; x++) for (let y = 0; y < 5; y++) { const k = r(); if (k < 0.16) out.push(`<rect x="${x * cw}" y="${y * ch}" width="${cw}" height="${ch}" fill="${pal.primary}"/>`); else if (k < 0.24) out.push(`<rect x="${x * cw}" y="${y * ch}" width="${cw}" height="${ch}" fill="${pal.ink}"/>`); }
    for (let x = 0; x <= n; x++) out.push(`<line x1="${x * cw}" y1="0" x2="${x * cw}" y2="${h}" stroke="${pal.ink}" stroke-opacity=".18" stroke-width="2"/>`);
    for (let y = 0; y <= 5; y++) out.push(`<line x1="0" y1="${y * ch}" x2="${w}" y2="${y * ch}" stroke="${pal.ink}" stroke-opacity=".18" stroke-width="2"/>`);
    out.push(`<circle cx="${cw * (2 + R(4))}" cy="${ch * 2.5}" r="${ch * 1.6}" fill="none" stroke="${pal.ink}" stroke-width="10"/>`);
  } else if (motif === 'topo') {
    const cx = w * (0.35 + r() * 0.3), cy = h * (0.4 + r() * 0.2);
    for (let k = 1; k <= 11; k++) {
      const pts = []; for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2, rad = k * 34 * (1 + 0.18 * Math.sin(t * 3 + k * 0.7) + 0.08 * Math.cos(t * 5 + seed.length)); pts.push(`${(cx + Math.cos(t) * rad * 1.5).toFixed(1)},${(cy + Math.sin(t) * rad).toFixed(1)}`); }
      out.push(`<polygon points="${pts.join(' ')}" fill="none" stroke="${k === 4 ? pal.primary : pal.ink}" stroke-opacity="${k === 4 ? 1 : 0.28}" stroke-width="${k === 4 ? 4 : 2}"/>`);
    }
  } else if (motif === 'blocks') {
    out.push(`<rect x="${w * 0.08}" y="${h * 0.14}" width="${w * 0.42}" height="${h * 0.62}" fill="${pal.primary}"/>`);
    out.push(`<circle cx="${w * (0.62 + r() * 0.1)}" cy="${h * 0.42}" r="${h * 0.3}" fill="${pal.ink}"/>`);
    out.push(`<rect x="${w * 0.44}" y="${h * 0.56}" width="${w * 0.4}" height="${h * 0.18}" fill="${pal.surface}" stroke="${pal.ink}" stroke-width="6"/>`);
    out.push(`<path d="M${w * 0.12} ${h * 0.9} Q ${w * 0.5} ${h * (0.7 + r() * 0.15)} ${w * 0.9} ${h * 0.88}" fill="none" stroke="${pal.ink}" stroke-width="8" stroke-linecap="round"/>`);
  } else if (motif === 'dots') {
    const gap = 30; const path = new Set(); let y = R(Math.floor(h / gap));
    for (let x = 0; x < Math.ceil(w / gap); x++) { path.add(`${x},${y}`); if (r() < 0.35) y = Math.max(1, Math.min(Math.floor(h / gap) - 2, y + (r() < 0.5 ? -1 : 1))); }
    for (let x = 0; x < Math.ceil(w / gap); x++) for (let yy = 0; yy < Math.ceil(h / gap); yy++) { const on = path.has(`${x},${yy}`); out.push(`<circle cx="${x * gap + gap / 2}" cy="${yy * gap + gap / 2}" r="${on ? 6 : 2.5}" fill="${on ? pal.primary : pal.ink}" opacity="${on ? 1 : 0.22}"/>`); }
  } else {   // rules
    for (let i = 0; i < 9; i++) out.push(`<line x1="0" y1="${60 + i * 70}" x2="${w}" y2="${60 + i * 70}" stroke="${pal.ink}" stroke-opacity=".22" stroke-width="2"/>`);
    out.push(`<circle cx="${w * (0.66 + r() * 0.12)}" cy="${h * 0.42}" r="${h * 0.26}" fill="${pal.primary}"/>`);
    out.push(`<rect x="${w * 0.1}" y="${h * 0.46}" width="${w * 0.34}" height="${h * 0.34}" fill="none" stroke="${pal.ink}" stroke-width="6"/>`);
  }
  return `<svg class="art" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label || 'Illustration')}" preserveAspectRatio="xMidYMid slice"><rect width="${w}" height="${h}" fill="${bg}"/>${out.join('')}</svg>`;
}

// ---------- HTML ----------
const date = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; };
const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join('').toUpperCase();
function paras(text) { return String(text || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => `<p>${esc(b).replace(/\n/g, '<br>')}</p>`).join(''); }

// opts: { fontUrl: file -> url (default 'fonts/<file>'), preview: bool }
// opts: { fontUrl: file -> url (default 'fonts/<file>'), split: true -> { html, css } (the published files), logoUrl }
function render(g, gen, opts = {}) {
  const L = LAYOUTS[gen.layout] || LAYOUTS.editorial, id = LAYOUTS[gen.layout] ? gen.layout : 'editorial', p = g.p;
  const brand = gen.brand || (g.st && g.st.brand) || {}, F = fontOf(id, brand.font), pal = palette(L, g, brand), info = gen.info || {}, T = TYPES[gen.type] ? gen.type : null;
  const c = gen.copy || draftCopy(g, 0, T, info), cc = k => c[k] || {};
  const fontUrl = opts.fontUrl || (f => `fonts/${f}`), seed = `${p.id}:${gen.seed || 0}`;
  const add = (gen.add || []).filter(k => EXTRA.includes(k)), avail = available(g, { copy: c, info, add }), off = gen.off || {};
  const base = T ? TYPES[T].order : L.order;
  const order = (Array.isArray(gen.order) && gen.order.length ? gen.order : base).filter(k => SECTIONS.includes(k) && (!T || base.includes(k) || add.includes(k)));
  for (const k of base) if (!order.includes(k)) order.splice(Math.max(0, order.length - 1), 0, k);
  for (const k of add) if (!order.includes(k)) { const at = ['faq', 'contact', 'footer'].map(x => order.indexOf(x)).filter(i => i >= 0); order.splice(at.length ? Math.min(...at) : order.length, 0, k); }
  if (order.includes('footer')) order.push(...order.splice(order.indexOf('footer'), 1));
  const shown = order.filter(k => avail[k] && !off[k]);
  let n = 0; const num = () => String(++n).padStart(2, '0');
  const eyebrow = (k, label) => id === 'editorial' || id === 'poster' ? num() : id === 'devlog' ? `// ${label.toLowerCase()}` : id === 'arcade' ? `Stage ${++n}` : id === 'journal' ? '§' : label;
  const head = (k, title) => `<header class="sh"><span class="eb">${esc(eyebrow(k, SECTION_NAMES[k]))}</span><h2>${esc(title)}</h2></header>`;
  const playIsLocal = g.play && !/^https:/.test(g.play);
  const hero0 = g.shots && g.shots[0];
  const heroImg = hero0 ? `<img class="art" src="shots/${esc(hero0.slug)}.png" alt="${esc(hero0.name)}">` : art(L.motif, pal, seed, 1200, 720, `${p.name} illustration`);
  // The hero button goes where this kind of site needs it: the visit card, the RSVP page, contact, else Play / the code.
  let to = null, ext = false;
  if (T === 'business') to = shown.includes('visit') ? '#visit' : null;
  else if (T === 'event') { if (okHttps(info.rsvp)) { to = info.rsvp; ext = true; } else if (shown.includes('event')) to = '#event'; }
  else if (T === 'portfolio') to = shown.includes('contact') ? '#contact' : null;
  else if (g.play) { to = playIsLocal && shown.includes('play') ? '#play' : g.play; ext = !playIsLocal; }
  else if (g.repoUrl) { to = g.repoUrl; ext = true; }
  const cta = c.hero.cta && to ? `<a class="btn primary" href="${esc(to)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(c.hero.cta)}</a>` : '';
  const code = g.repoUrl && g.play && !['business', 'event', 'portfolio'].includes(T) ? `<a class="btn" href="${esc(g.repoUrl)}" target="_blank" rel="noopener noreferrer">Code</a>` : '';
  const word = one(brand.wordmark || p.name, 60);
  const logoSrc = brand.logo && brand.logo.type ? (opts.logoUrl || `logo.${brand.logo.type}`) : null;
  const logo = logoSrc ? `<img class="logo" src="${esc(logoSrc)}" alt="${esc(word)}" height="40">`
    : p.image ? `<img class="mark" src="${esc(p.image)}" alt="" width="36" height="36">` : `<span class="mark" aria-hidden="true">${esc(p.emoji || initials(word))}</span>`;
  const stats = [[(g.commits || []).length ? `${(g.commits || []).length}+` : '', 'commits'], [String((g.people || []).length), (g.people || []).length === 1 ? 'person' : 'people'], [(g.agents || []).length ? String(g.agents.length) : '', (g.agents || []).length === 1 ? 'agent' : 'agents']].filter(x => x[0] && x[0] !== '0');

  const S = {
    hero: () => `<section class="hero" id="top"><div class="wrap hero-in">
      <div class="hero-txt">${c.hero.kicker ? `<p class="kicker">${esc(c.hero.kicker)}</p>` : ''}<h1>${esc(c.hero.title)}</h1>${c.hero.dek ? `<p class="dek">${esc(c.hero.dek)}</p>` : ''}
      ${cta || code ? `<p class="acts">${cta}${code}</p>` : ''}${id === 'devlog' && stats.length ? `<ul class="stats">${stats.map(([v, l]) => `<li><b>${esc(v)}</b> ${esc(l)}</li>`).join('')}</ul>` : ''}</div>
      <figure class="hero-art">${heroImg}</figure></div></section>`,
    story: () => `<section class="sec story" id="story"><div class="wrap">${head('story', c.story.title)}<div class="prose">${paras(c.story.body)}</div></div></section>`,
    features: () => `<section class="sec features" id="features"><div class="wrap">${head('features', c.features.title)}<ol class="feat">${c.features.items.map((x, i) => `<li><span class="fn">${String(i + 1).padStart(2, '0')}</span><h3>${esc(x.title)}</h3>${x.body ? `<p>${esc(x.body)}</p>` : ''}</li>`).join('')}</ol></div></section>`,
    gallery: () => `<section class="sec gallery" id="gallery"><div class="wrap">${head('gallery', c.gallery.title)}<div class="gal">${g.shots.map(x => `<figure><img src="shots/${esc(x.slug)}.png" alt="${esc(x.name)}" loading="lazy"><figcaption>${esc(x.name)}</figcaption></figure>`).join('')}</div></div></section>`,
    play: () => `<section class="sec play" id="play"><div class="wrap">${head('play', c.play.title)}${c.play.body ? `<p class="lede">${esc(c.play.body)}</p>` : ''}
      ${playIsLocal ? `<div class="frame"><iframe src="${esc(g.play)}" title="${esc(p.name)}" loading="lazy" allow="fullscreen; gamepad"></iframe></div><p class="acts"><a class="btn" href="${esc(g.play)}">Open full screen</a></p>`
        : `<p class="acts"><a class="btn primary" href="${esc(g.play)}" target="_blank" rel="noopener noreferrer">${esc(c.hero.cta || 'Open it')}</a></p>`}</div></section>`,
    devlog: () => { const items = [...(g.news || []).map(x => ({ ...x, kind: 'note' })), ...(g.commits || []).map(x => ({ ...x, kind: 'commit' }))].filter((x, i, a) => a.findIndex(y => y.title === x.title) === i).slice(0, 8);
      return `<section class="sec devlog" id="devlog"><div class="wrap">${head('devlog', c.devlog.title)}<ol class="log">${items.map(x => `<li><time datetime="${esc(date(x.at))}">${esc(date(x.at))}</time><span>${esc(x.title)}</span></li>`).join('')}</ol></div></section>`; },
    roadmap: () => `<section class="sec roadmap" id="roadmap"><div class="wrap">${head('roadmap', c.roadmap.title)}<ol class="road">${g.milestones.slice(0, 8).map(m => `<li class="st-${esc(m.status || 'planned')}"><b>${esc(m.version || '')}</b><span>${esc(m.title)}</span><em>${esc(m.status === 'released' ? 'shipped' : m.status || 'planned')}</em></li>`).join('')}</ol></div></section>`,
    team: () => `<section class="sec team" id="team"><div class="wrap">${head('team', c.team.title)}${c.team.body ? `<p class="lede">${esc(c.team.body)}</p>` : ''}<ul class="ppl">
      ${(g.people || []).map((x, i) => `<li><span class="av" style="background:${i % 2 ? pal.ink : pal.primary};color:${i % 2 ? pal.paper : pal.onPrimary}" aria-hidden="true">${esc(initials(x.name))}</span><b>${esc(x.name)}</b>${x.roles && x.roles.length ? `<small>${esc(x.roles.join(' · '))}</small>` : ''}</li>`).join('')}
      ${(g.agents || []).map(a => `<li class="agent"><span class="av" aria-hidden="true">AI</span><b>${esc(a)}</b><small>Agent</small></li>`).join('')}
      ${(g.authors || []).slice(0, 8).map(a => `<li><span class="av" aria-hidden="true">${esc(initials(a))}</span><b>${esc(a)}</b><small>Commits</small></li>`).join('')}</ul></div></section>`,
    visit: () => { const i = info, map = i.address ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(i.address)}` : '';
      return `<section class="sec visit" id="visit"><div class="wrap">${head('visit', cc('visit').title || 'Visit us')}${cc('visit').body ? `<p class="lede">${esc(cc('visit').body)}</p>` : ''}
      <dl class="facts">${i.hours ? `<div><dt>Hours</dt><dd>${esc(i.hours).replace(/\n/g, '<br>')}</dd></div>` : ''}${i.address ? `<div><dt>Where</dt><dd>${esc(i.address)}<br><a href="${esc(map)}" target="_blank" rel="noopener noreferrer">Open the map</a></dd></div>` : ''}${i.phone ? `<div><dt>Call</dt><dd><a href="tel:${esc(i.phone.replace(/[^\d+]/g, ''))}">${esc(i.phone)}</a></dd></div>` : ''}${i.email ? `<div><dt>Email</dt><dd><a href="mailto:${esc(i.email)}">${esc(i.email)}</a></dd></div>` : ''}</dl></div></section>`; },
    event: () => { const i = info;
      return `<section class="sec event" id="event"><div class="wrap">${head('event', cc('event').title || 'The details')}${cc('event').body ? `<p class="lede">${esc(cc('event').body)}</p>` : ''}
      <dl class="facts">${i.date ? `<div><dt>When</dt><dd>${esc(i.date)}${i.time ? `<br>${esc(i.time)}` : ''}</dd></div>` : ''}${i.place ? `<div><dt>Where</dt><dd>${esc(i.place)}</dd></div>` : ''}</dl>
      ${okHttps(i.rsvp) ? `<p class="acts"><a class="btn primary" href="${esc(i.rsvp)}" target="_blank" rel="noopener noreferrer">RSVP</a></p>` : ''}</div></section>`; },
    contact: () => { const i = info;
      return `<section class="sec contact" id="contact"><div class="wrap">${head('contact', cc('contact').title || 'Get in touch')}${cc('contact').body ? `<p class="lede">${esc(cc('contact').body)}</p>` : ''}
      <p class="acts">${i.email ? `<a class="btn primary" href="mailto:${esc(i.email)}">${esc(i.email)}</a>` : ''}${okHttps(i.link) ? `<a class="btn" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">${esc(i.link.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : ''}${i.phone ? `<a class="btn" href="tel:${esc(i.phone.replace(/[^\d+]/g, ''))}">${esc(i.phone)}</a>` : ''}</p></div></section>`; },
    pricing: () => `<section class="sec pricing" id="pricing"><div class="wrap">${head('pricing', cc('pricing').title || 'Pricing')}${cc('pricing').body ? `<p class="lede">${esc(cc('pricing').body)}</p>` : ''}<ul class="plans">${(cc('pricing').items || []).map(x => `<li><h3>${esc(x.name)}</h3><p class="price">${esc(x.price)}</p>${x.body ? `<p>${esc(x.body)}</p>` : ''}</li>`).join('')}</ul></div></section>`,
    testimonials: () => `<section class="sec testimonials" id="testimonials"><div class="wrap">${head('testimonials', cc('testimonials').title || 'What people say')}<div class="quotes">${(cc('testimonials').items || []).map(x => `<figure><blockquote><p>${esc(x.quote)}</p></blockquote>${x.who ? `<figcaption>${esc(x.who)}</figcaption>` : ''}</figure>`).join('')}</div></div></section>`,
    faq: () => `<section class="sec faq" id="faq"><div class="wrap">${head('faq', c.faq.title)}<div class="qa">${c.faq.items.map(x => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}</div></div></section>`,
    footer: () => `<footer class="foot"><div class="wrap foot-in"><p>${esc(c.footer.text)}</p><p class="foot-links">${g.repoUrl ? `<a href="${esc(g.repoUrl)}" target="_blank" rel="noopener noreferrer">Source</a>` : ''}<a href="#top">Back to top</a></p></div></footer>`,
  };
  // Each section starts with a marker comment, so whoever edits the HTML by hand can find their way.
  const mark = k => `<!-- ===== section: ${k} ===== -->`;
  const body = shown.filter(k => k !== 'footer').map(k => `${mark(k)}\n${S[k]()}`).join('\n\n');
  const styles = css(id, L, pal, F, fontUrl);
  const icon = logoSrc ? `<link rel="icon" href="${esc(logoSrc)}">` : p.image ? `<link rel="icon" href="${esc(p.image)}">` : `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${pal.primary}"/><text x="32" y="42" font-family="sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="${pal.onPrimary}">${esc(initials(p.name))}</text></svg>`)}">`;
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="${pal.dark ? 'dark' : 'light'}">
<meta name="theme-color" content="${pal.paper}">
<meta name="description" content="${esc(c.hero.dek || c.hero.title)}">
<meta name="generator" content="TribeCode site generator (${esc(L.name)}${T ? `, ${esc(TYPES[T].name)}` : ''})">
<meta property="og:title" content="${esc(c.hero.title)}">
<meta property="og:description" content="${esc(c.hero.dek || '')}">
<title>${esc(p.name)}${c.hero.dek ? ` · ${esc(one(c.hero.dek, 70))}` : ''}</title>
${icon}
${opts.split ? '<link rel="stylesheet" href="styles.css">' : `<style>\n${styles}</style>`}
</head>
<body class="l-${id}"${T ? ` data-type="${T}"` : ''}>
<a class="skip" href="#main">Skip to content</a>

${mark('header')}
<header class="top"><div class="wrap top-in"><a class="brand" href="#top">${logo}<b${logoSrc ? ' class="sr"' : ''}>${esc(word)}</b></a><nav aria-label="Sections">${shown.filter(k => !['hero', 'footer'].includes(k)).slice(0, 4).map(k => `<a href="#${k}">${esc(k === 'faq' ? 'FAQ' : k === 'visit' ? 'Visit' : k === 'event' ? 'Details' : SECTION_NAMES[k].split(' ')[0])}</a>`).join('')}</nav></div></header>
<main id="main">

${body}

</main>

${shown.includes('footer') ? `${mark('footer')}\n${S.footer()}` : ''}
</body>
</html>
`;
  const html = page.replace(/[ \t]+$/gm, '');
  return opts.split ? { html, css: styles } : html;
}

// A readable stylesheet: the brand tokens first (commented, so a person can restyle by hand), then the rules, one per line.
function prettyCss(src) {
  let out = '', depth = 0, q = null;
  const ind = () => '  '.repeat(depth), last = () => out.replace(/\s+$/, '').slice(-1);
  for (const ch of src) {
    if (q) { out += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
    if (ch === '{') { out = out.replace(/\s+$/, '') + ' {\n'; depth++; out += ind(); continue; }
    if (ch === ';') { out = out.replace(/\s+$/, '') + ';\n' + ind(); continue; }
    if (ch === '}') { const l = last(); out = out.replace(/\s+$/, ''); if (!';{}'.includes(l)) out += ';'; depth = Math.max(0, depth - 1); out += '\n' + ind() + '}\n' + (depth ? '' : '\n') + ind(); continue; }
    if (ch === '\n') { if (!/\s$/.test(out)) out += ' '; continue; }
    out += ch;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function css(id, L, pal, F, fontUrl = f => `fonts/${f}`) {
  F = F || fontOf(id);
  const fam = `'${F.display}',${F.serif ? 'Georgia,serif' : 'system-ui,sans-serif'}`;
  const tokens = `/* ${'='.repeat(64)}
   Brand tokens: change these to restyle the whole site.
   TribeCode checked every color pair for contrast. If you change one,
   keep body text readable (at least 4.5:1 against its background).
   ${'='.repeat(64)} */
:root {
  /* colors */
  --paper: ${pal.paper};        /* page background */
  --surface: ${pal.surface};      /* cards and boxes */
  --ink: ${pal.ink};          /* headlines and body text */
  --muted: ${pal.muted};        /* quieter text */
  --rule: ${pal.rule};         /* thin lines and borders */
  --primary: ${pal.primary};      /* the brand color: shapes and bands */
  --on-primary: ${pal.onPrimary};   /* text on the brand color */
  --btn: ${pal.btn};          /* main button */
  --link: ${pal.link};         /* links */
  --accent: ${pal.accent};       /* small labels */
  --tint: ${pal.tint};         /* a soft wash of the brand color */

  /* fonts */
  --display: ${fam};   /* headlines */
  --body: 'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;   /* everything else */
  --mono: 'JetBrains Mono',ui-monospace,Menlo,monospace;   /* small labels */

  /* spacing */
  --wrap: 1160px;     /* the widest the content gets */
  --gutter: 24px;     /* space at the page edges */
  --section: 72px;    /* space above and below each section */
}
`;
  const faces = [[F.display, F.file, F.weight], ['Inter', FONT_BODY[0], 400], ['Inter', FONT_BODY[1], 600], ['JetBrains Mono', FONT_MONO, 500]]
    .filter((x, i, a) => a.findIndex(y => y[1] === x[1]) === i).map(([f, file, w]) => `@font-face{font-family:'${f}';font-weight:${w};font-display:swap;src:url('${fontUrl(file)}') format('woff2')}`).join('\n');
  return `${tokens}\n/* ===== fonts (self-hosted, in fonts/) ===== */\n${prettyCss(faces)}\n/* ===== layout: ${L.name} ===== */\n${prettyCss(rules(id, L, F))}`;
}
function rules(id, L, F) {
  const base = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 var(--body);overflow-wrap:anywhere}
img,svg{display:block;max-width:100%}a{color:var(--link)}a:focus-visible,summary:focus-visible{outline:2px solid var(--link);outline-offset:3px}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:16px;background:var(--surface);padding:8px 12px;z-index:9}
.wrap{max-width:var(--wrap);margin:0 auto;padding:0 var(--gutter)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.logo{height:40px;width:auto;max-width:180px;object-fit:contain}
.top{border-bottom:1px solid var(--rule)}.top-in{display:flex;align-items:center;gap:20px;min-height:64px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;min-width:0}.brand b{font:600 16px/1.2 var(--body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mark{width:36px;height:36px;display:grid;place-items:center;background:var(--primary);color:var(--on-primary);font:700 15px/1 var(--body);object-fit:cover;flex:none}
nav{margin-left:auto;display:flex;gap:18px;flex-wrap:wrap}nav a{color:var(--muted);text-decoration:none;font:500 13px/1 var(--mono);text-transform:lowercase}nav a:hover{color:var(--ink)}
h1,h2,h3{font-family:var(--display);font-weight:${F.weight};color:var(--ink);margin:0;letter-spacing:-.01em}
.hero{padding:64px 0 56px}.hero-in{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:24px;align-items:end}
.hero-txt{grid-column:1/span 7}.hero-art{grid-column:8/span 5;margin:0}
.hero-art .art{width:100%;height:auto;aspect-ratio:5/3;object-fit:cover;border:1px solid var(--rule)}
.kicker{font:500 13px/1.4 var(--mono);color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin:0 0 18px}
h1{font-size:clamp(44px,7vw,92px);line-height:.98}
.dek{font-size:clamp(18px,2.2vw,22px);color:var(--muted);max-width:34ch;margin:22px 0 0}
.acts{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0 0}
.btn{display:inline-flex;align-items:center;min-height:46px;padding:0 20px;border:1px solid var(--ink);color:var(--ink);background:transparent;text-decoration:none;font:600 15px/1 var(--body)}
.btn.primary{background:var(--btn);border-color:var(--btn);color:var(--on-primary)}
.stats{list-style:none;padding:0;margin:26px 0 0;display:flex;flex-wrap:wrap;gap:8px 22px;font:500 13px/1.4 var(--mono);color:var(--muted)}.stats b{color:var(--ink)}
.sec{padding:var(--section) 0;border-top:1px solid var(--rule)}
.sh{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:24px;margin-bottom:32px;align-items:baseline}
.eb{grid-column:1/span 2;font:500 13px/1.4 var(--mono);color:var(--accent);text-transform:uppercase;letter-spacing:.08em}
.sh h2{grid-column:3/span 10;font-size:clamp(30px,4vw,48px);line-height:1.05}
.prose,.lede,.feat,.gal,.log,.road,.ppl,.qa,.frame,.facts,.plans,.quotes,.sec .acts{margin-left:calc((100% + 24px) / 12 * 2)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;margin-top:0;margin-bottom:0;border-top:1px solid var(--rule);padding-top:20px}
.facts dt{font:500 12px/1.4 var(--mono);color:var(--accent);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.facts dd{margin:0;font-size:18px;line-height:1.5}
.prose{max-width:65ch}.prose p,.lede{margin-top:0;margin-bottom:16px;font-size:19px;line-height:1.65}.lede{max-width:60ch;color:var(--muted)}
.feat{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0;border-top:1px solid var(--rule)}
.feat li{padding:22px 24px 24px 0;border-bottom:1px solid var(--rule)}.fn{font:500 12px/1 var(--mono);color:var(--muted)}
.feat h3{font-size:22px;line-height:1.2;margin:12px 0 8px}.feat p{margin:0;color:var(--muted);max-width:40ch}
.gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}
.gal figure{margin:0}.gal img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;border:1px solid var(--rule)}
figcaption{font:500 13px/1.4 var(--mono);color:var(--muted);margin-top:10px}
.frame{border:1px solid var(--rule);aspect-ratio:16/10;background:var(--surface)}.frame iframe{width:100%;height:100%;border:0;display:block}
.frame-ph{display:grid;place-items:center;height:100%;color:var(--muted);font:500 14px/1.4 var(--mono);padding:20px;text-align:center}
.log,.road{list-style:none;padding:0;border-top:1px solid var(--rule)}
.log li,.road li{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:16px;padding:14px 0;border-bottom:1px solid var(--rule);align-items:baseline}
.log time,.road b{font:500 13px/1.4 var(--mono);color:var(--muted)}.road em{font:500 12px/1 var(--mono);font-style:normal;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.road .st-released em{color:var(--link)}
.ppl{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}
.ppl li{display:grid;grid-template-columns:44px minmax(0,1fr);column-gap:12px;align-items:center}.ppl b{font-weight:600}.ppl small{grid-column:2;color:var(--muted);font-size:14px}
.av{grid-row:span 2;width:44px;height:44px;display:grid;place-items:center;font:700 14px/1 var(--body);background:var(--tint);color:var(--ink)}
.plans{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.plans li{border:1px solid var(--rule);background:var(--surface);padding:22px 24px}.plans h3{font-size:20px}.plans .price{font:600 28px/1.2 var(--display);color:var(--ink);margin:10px 0 8px}.plans p{margin:0;color:var(--muted)}
.quotes{display:grid;gap:16px;max-width:72ch}.quotes figure{margin:0;border-left:3px solid var(--primary);padding:6px 0 6px 20px}.quotes blockquote{margin:0}.quotes p{margin:0;font-size:20px;line-height:1.5;color:var(--ink)}.quotes figcaption{margin-top:8px;font:500 13px/1.4 var(--mono);color:var(--muted)}
.qa{max-width:72ch;border-top:1px solid var(--rule)}details{border-bottom:1px solid var(--rule);padding:16px 0}
summary{cursor:pointer;font-weight:600;font-size:18px;list-style:none}summary::-webkit-details-marker{display:none}summary::after{content:'+';float:right;color:var(--muted);font-family:var(--mono)}details[open] summary::after{content:'–'}
details p{margin:10px 0 0;color:var(--muted)}
.foot{border-top:1px solid var(--rule);padding:36px 0 48px;color:var(--muted);font-size:15px}.foot-in{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between}.foot p{margin:0}
.foot-links{display:flex;gap:18px}
@media (max-width:820px){.hero{padding:40px 0}.hero-txt,.hero-art{grid-column:1/-1}.sh{grid-template-columns:1fr;gap:8px}.eb,.sh h2{grid-column:1}
.prose,.lede,.feat,.gal,.log,.road,.ppl,.qa,.frame,.facts,.plans,.quotes,.sec .acts{margin-left:0}.sec{padding:52px 0}.log li,.road li{grid-template-columns:1fr;gap:4px}nav{display:none}.wrap{padding:0 18px}}`;
  const per = {
    editorial: `h1{font-size:clamp(46px,7.6vw,104px);letter-spacing:-.025em}.sh h2{font-style:normal}.eb{font-size:15px;color:var(--ink)}.hero{border-bottom:1px solid var(--ink)}.sec{border-top-color:var(--ink)}
.feat li{padding-right:32px}.feat h3{font-family:var(--display)}.prose p:first-child::first-letter{font:700 3.4em/0.8 var(--display);float:left;margin:6px 10px 0 0;color:var(--primary)}`,
    swiss: `.hero{background:var(--primary);color:var(--on-primary);border-bottom:0;padding:72px 0}.hero h1,.hero .kicker,.hero .dek{color:var(--on-primary)}.hero .dek{opacity:1}
.hero .btn{border-color:var(--on-primary);color:var(--on-primary)}.hero .btn.primary{background:var(--on-primary);color:var(--primary);border-color:var(--on-primary)}
.hero-art .art{border-color:var(--on-primary)}h1{letter-spacing:-.04em;line-height:.92}.sh h2{letter-spacing:-.03em}.feat{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;border-top:0}.feat li{border-top:4px solid var(--ink);border-bottom:0;padding:16px 0 0}`,
    devlog: `body{font-size:16px}h1{font-size:clamp(34px,5.4vw,64px);line-height:1.05;letter-spacing:-.02em}h1::before{content:'> ';color:var(--primary)}.kicker::before{content:'$ ';color:var(--primary)}
.sh h2{font-size:clamp(24px,3vw,34px)}.btn{font-family:var(--mono);font-weight:500}.feat li h3::before{content:'[x] ';color:var(--primary);font-family:var(--mono)}.feat h3{font-family:var(--mono);font-size:18px}
.log li span{font-family:var(--mono);font-size:15px}.log li span::before{content:'* ';color:var(--primary)}.av{background:var(--surface);color:var(--primary);border:1px solid var(--rule);font-family:var(--mono)}.mark{font-family:var(--mono)}`,
    poster: `.hero{padding:48px 0 64px}.hero-in{align-items:start}.hero-txt{grid-column:1/-1}.hero-art{grid-column:1/-1;margin-top:8px}.hero-art .art{aspect-ratio:2.2/1;border:0}
h1{font-size:clamp(56px,13vw,176px);line-height:.86;letter-spacing:-.045em;text-transform:none;max-width:12ch}.dek{font-size:clamp(20px,2.8vw,28px);max-width:30ch;color:var(--ink)}
.sh h2{font-size:clamp(36px,6vw,72px);letter-spacing:-.035em;line-height:.95}.eb{color:var(--primary);font-size:15px}.feat{gap:20px;border:0}.feat li{background:var(--surface);border:2px solid var(--ink);padding:24px}
.feat li:nth-child(3n+1){background:var(--primary);color:var(--on-primary);border-color:var(--primary)}.feat li:nth-child(3n+1) h3,.feat li:nth-child(3n+1) p,.feat li:nth-child(3n+1) .fn{color:var(--on-primary)}.btn{border-width:2px}`,
    journal: `body{font-size:18px}.hero{text-align:center;padding:80px 0 64px}.hero-in{display:block}.hero-txt{max-width:760px;margin:0 auto}.hero-art{max-width:880px;margin:48px auto 0}.hero .dek{margin:22px auto 0}.hero .acts{justify-content:center}
h1{font-size:clamp(48px,8vw,108px);line-height:1;font-style:italic;letter-spacing:-.01em}.kicker{letter-spacing:.2em}.sh{display:block;text-align:center}.eb{display:block;color:var(--primary);font-size:20px;margin-bottom:6px}
.sh h2{font-size:clamp(34px,5vw,56px);font-weight:400}.prose,.lede,.feat,.gal,.log,.road,.ppl,.qa,.frame,.facts,.plans,.quotes,.sec .acts{margin-left:auto;margin-right:auto}.facts{max-width:860px;text-align:center}.prose,.lede{max-width:62ch}.lede{text-align:center}
.feat{max-width:860px}.feat h3{font-weight:400;font-size:28px}.gal{max-width:980px}.log,.road,.qa{max-width:720px}.ppl{max-width:880px;justify-content:center}.sec{border-top:0}.sec+.sec .sh::before{content:'· · ·';display:block;color:var(--muted);letter-spacing:.4em;margin-bottom:28px}
.frame{max-width:980px}.sec .acts{justify-content:center}`,
    arcade: `body{font-size:16px}h1,h2,h3{text-transform:uppercase;letter-spacing:0;line-height:1.05}h1{font-size:clamp(38px,7vw,84px);color:var(--primary)}.sh h2{font-size:clamp(24px,3.6vw,40px)}
.btn{border:2px solid var(--ink);font-family:var(--display);text-transform:uppercase;font-weight:400;min-height:50px}.btn.primary{border-color:var(--btn)}
.hero-art .art,.gal img,.frame{border:2px solid var(--ink)}.eb{color:var(--primary)}.feat{gap:16px;border:0}.feat li{border:2px solid var(--rule);padding:20px;background:var(--surface)}.feat h3{font-size:18px}
.av{background:var(--surface);color:var(--primary);border:2px solid var(--rule);font-family:var(--display)}.mark{font-family:var(--display);font-weight:400}summary{font-family:var(--display);text-transform:uppercase;font-weight:400;font-size:15px}`,
  };
  return base + '\n' + (per[id] || '');
}

// ---------- the brain pass ----------
function polishPrompt(g, gen) {
  const s = g.sense || {}, c = gen.copy;
  const facts = [`Name: ${g.p.name}`, g.p.bio ? `Bio: ${g.p.bio}` : '', s.label ? `It is: ${s.label}` : '', (s.tags || []).length ? `Tags: ${s.tags.join(', ')}` : '', s.audience ? `For: ${s.audience}` : '', s.tone ? `Tone: ${s.tone}` : '',
    g.vision ? `Vision:\n${String(g.vision).slice(0, 1800)}` : '', (g.commits || []).length ? `Recent work: ${g.commits.slice(0, 6).map(x => x.title).join('; ')}` : '', `People: ${(g.people || []).map(x => x.name).join(', ') || 'a small team'}`].filter(Boolean).join('\n');
  const want = { hero: { kicker: c.hero.kicker, dek: c.hero.dek }, story: { title: c.story.title, body: c.story.body }, features: (c.features.items || []).map(x => ({ title: x.title, body: x.body })),
    play: { body: c.play.body }, faq: (c.faq.items || []).map(x => ({ q: x.q, a: x.a })), footer: c.footer.text };
  return { system: STYLE, prompt: `WEBSITE COPY\nFacts:\n${facts}\n\nCurrent copy (JSON):\n${JSON.stringify(want)}\n\nRewrite the copy so it reads well and sounds human. Keep the same JSON keys and the same number of features and questions. Reply with the JSON only.` };
}
// Apply a brain reply to the draft. Returns { copy, changed: [paths], rejected: [paths] }.
function applyPolish(gen, reply) {
  const out = JSON.parse(JSON.stringify(gen.copy)), edited = gen.edited || {}, changed = [], rejected = [];
  let j = null; try { j = JSON.parse((String(reply || '').replace(/<think>[\s\S]*?<\/think>/g, '').match(/\{[\s\S]*\}/) || [''])[0]); } catch {}
  if (!j || typeof j !== 'object') return { copy: out, changed, rejected: ['reply'], error: 'the brain did not answer with JSON' };
  const put = (path, val, max, obj, key) => {
    if (typeof val !== 'string' || !val.trim()) return;
    const v = clean(val, max);
    if (!v || hasHype(v) || v.length < 2) { rejected.push(path); return; }
    if (obj[key] !== v) { obj[key] = v; changed.push(path); }
  };
  if (j.hero && !edited.hero) { put('hero.kicker', j.hero.kicker, 80, out.hero, 'kicker'); put('hero.dek', j.hero.dek, 220, out.hero, 'dek'); }
  if (j.story && !edited.story) { put('story.title', j.story.title, 60, out.story, 'title'); put('story.body', j.story.body, 1600, out.story, 'body'); }
  if (Array.isArray(j.features) && !edited.features && j.features.length === out.features.items.length) j.features.forEach((x, i) => { if (x) { put(`features.${i}.title`, x.title, 60, out.features.items[i], 'title'); put(`features.${i}.body`, x.body, 180, out.features.items[i], 'body'); } });
  if (j.play && !edited.play) put('play.body', j.play.body, 200, out.play, 'body');
  if (Array.isArray(j.faq) && !edited.faq && j.faq.length === out.faq.items.length) j.faq.forEach((x, i) => { if (x) { put(`faq.${i}.q`, x.q, 120, out.faq.items[i], 'q'); put(`faq.${i}.a`, x.a, 320, out.faq.items[i], 'a'); } });
  if (typeof j.footer === 'string' && !edited.footer) put('footer.text', j.footer, 160, out.footer, 'text');
  return { copy: out, changed, rejected };
}

// One section edited by hand (the Website builder's per-section editor, the MCP tool): validated and cleaned.
function editSection(copy, sec, body) {
  if (!SECTIONS.includes(sec)) throw Object.assign(new Error(`sections are: ${SECTIONS.join(', ')}`), { status: 400 });
  const cur = JSON.parse(JSON.stringify(copy[sec] || {})), str = (v, n) => clean(v, n);
  const fields = { hero: { kicker: 80, title: 80, dek: 220, cta: 30 }, story: { title: 60, body: 1600 }, features: { title: 60 }, gallery: { title: 60 }, play: { title: 60, body: 220 }, devlog: { title: 60 }, roadmap: { title: 60 }, team: { title: 60, body: 300 }, faq: { title: 60 }, footer: { text: 160 }, visit: { title: 60, body: 300 }, event: { title: 60, body: 300 }, contact: { title: 60, body: 300 }, pricing: { title: 60, body: 300 }, testimonials: { title: 60 } }[sec];
  for (const [k, n] of Object.entries(fields)) if (typeof body[k] === 'string') { const v = str(body[k], n); if (k === 'title' && !v && sec === 'hero') continue; cur[k] = v; }
  if (sec === 'features' && Array.isArray(body.items)) cur.items = body.items.slice(0, 6).map(x => ({ title: str(x && x.title, 60), body: str(x && x.body, 180) })).filter(x => x.title);
  if (sec === 'pricing' && Array.isArray(body.items)) cur.items = body.items.slice(0, 4).map(x => ({ name: str(x && x.name, 40), price: str(x && x.price, 30), body: str(x && x.body, 180) })).filter(x => x.name);
  if (sec === 'testimonials' && Array.isArray(body.items)) cur.items = body.items.slice(0, 6).map(x => ({ quote: str(x && x.quote, 320), who: str(x && x.who, 60) })).filter(x => x.quote);
  if (sec === 'faq' && Array.isArray(body.items)) cur.items = body.items.slice(0, 8).map(x => ({ q: str(x && x.q, 120), a: str(x && x.a, 320) })).filter(x => x.q && x.a);
  return cur;
}

const fontFiles = (layout, font) => [...new Set([fontOf(LAYOUTS[layout] ? layout : 'editorial', font).file, ...FONT_BODY, FONT_MONO])];

module.exports = { LAYOUTS, LAYOUT_IDS, SECTIONS, EXTRA, SECTION_NAMES, HYPE, pickLayout, nextLayout, draftCopy, mergeCopy, available, render, art, palette, polishPrompt, applyPolish, editSection, clean, hasHype, fontFiles, ratio,
  FONTS, FONT_IDS, LAYOUT_FONT, SWATCHES, TYPES, TYPE_IDS, THEMES, THEME_IDS, INFO, cleanInfo, guessType, brandNotes, rankThemes, why, suggestRules, suggestPrompt, parseSuggest, okHex, okHttps, prettyCss };
