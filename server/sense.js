// Project sense: what is this project, really? A game, an app, a website, a bot…, plus a few tags (platformer, pixel
// art, cozy, multiplayer, portfolio, e-commerce, dashboard…), who it is for and its tone. Worked out deterministically
// (no model needed) from the project's name, bio, VISION.md, the pinned repo (README, package.json, file types), its
// task titles and recent chat (recent messages count more; old ones fade). The Preview row, the Dashboard's
// Inspiration card and Flint's quiet chat notes all follow it.
//
//   GET  /api/projects/:id/sense            { kind, label, tags, audience, tone, summary, confidence, sensed, override,
//                                            notes, canEdit, signals: [{ from, text }], inspiration: [...] }
//   PUT  /api/projects/:id/sense            { kind?: 'game'|…|'' (''= sense it), notes?: bool }   host and builders
//   POST /api/projects/:id/sense/dismiss    { id }   hide one inspiration card for you (kept per person)
//
// Recomputed cheaply after events (chat, tasks, the bio, repo changes), debounced; saved in .tribe/sense.json (one
// entry per project); a meaningful change (the kind, or a new top tag) is broadcast as { type: 'sense', project }.
// When the tribe's brain is on (server/llm.js), one short structured prompt refines it, at most once per 10 minutes
// per project. Never required. When the change came from chat, Flint drops one quiet note with a few ideas (at most
// once every few hours per project; host/builders can turn notes off from the Dashboard card).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KINDS = ['game', '3d', 'app', 'site', 'tool', 'bot', 'api', 'notes', 'other'];
const NOUN = { game: 'game', '3d': '3D scene', app: 'app', site: 'website', tool: 'tool', bot: 'bot', api: 'API', notes: 'notes', other: 'project' };
const PREVIEW = { game: 'Preview game', '3d': 'Preview 3D scene', app: 'Preview app', site: 'Preview site', tool: 'Try the tool', bot: 'Try the bot', api: 'Preview API', notes: 'Preview', other: 'Preview' };

// ---------- the lexicon: words that say what a project is ----------
// [kind, regex, weight]. Weights are per hit; a word counts at most 3 times per source.
const KIND_WORDS = [
  ['game', /\b(games?|gameplay|platformers?|rpg|roguelike|arcade|sprites?|boss(es)?|enem(y|ies)|npcs?|quests?|levels?|power-?ups?|high ?scores?|hit ?points|hp bar|jump(ing|s)?|dungeons?|phaser|godot|unity|pico-?8|kaplay|littlejs|players?)\b/gi, 2],
  ['3d', /\b(3d|three\.?js|webgl|babylon(\.js)?|first[- ]person|fps|meshes|mesh|gltf|glb|shaders?|voxels?)\b/gi, 2.5],
  ['app', /\b(mobile app|ios|android|react native|expo|flutter|swiftui|onboarding|push notifications?|home screen|desktop app|tauri|electron|pwa)\b/gi, 2.5],
  ['app', /\b(apps?|screens?|tabs? bar|settings page|log ?in screen)\b/gi, 1],
  ['site', /\b(landing pages?|home ?page|portfolio|blog|pricing( page| table)?|sign[- ]?ups?|hero section|seo|newsletter|contact form|testimonials|call to action|cta|astro|next\.?js|hugo|jekyll|e-?commerce|checkout|shopping cart|storefront|product pages?)\b/gi, 3],
  ['site', /\b(websites?|site|web ?page|pages?|footer|navbar|header)\b/gi, 1.2],
  ['tool', /\b(cli|command[- ]line|scripts?|automat(e|ion|es|ing)|utility|utilities|plugins?|browser extension|converter|generator|tooling|tool)\b/gi, 1.6],
  ['bot', /\b(bots?|discord bot|slack bot|telegram|chat ?bot|slash commands?|discord\.js|discord)\b/gi, 2.5],
  ['api', /\b(apis?|endpoints?|rest|graphql|backend|webhooks?|express|fastify|flask|fastapi|database|postgres|sqlite|json responses?)\b/gi, 1.6],
  ['notes', /\b(notes|research|wiki|study|reading list|journal|knowledge base|lecture|summar(y|ies))\b/gi, 1.4],
];
// [tag, regex, kind it hints (or ''), weight]
const TAG_WORDS = [
  ['platformer', /\b(platformers?|jump(ing|s)?|double jump|wall jump|run and jump|side-?scroll(er|ing))\b/gi, 'game'],
  ['pixel art', /\b(pixel( art)?|8-?bit|16-?bit|sprites?|tilesets?|piskel|aseprite)\b/gi, 'game'],
  ['cozy', /\b(cozy|cosy|chill|relaxing|wholesome|comfy|calm)\b/gi, ''],
  ['multiplayer', /\b(multiplayer|co-?op|online play|lobby|lobbies|pvp|netcode|matchmaking|other players)\b/gi, 'game'],
  ['retro', /\b(retro|arcade|nes|snes|gameboy|crt|old-?school)\b/gi, ''],
  ['puzzle', /\b(puzzles?|match-?3|sokoban|riddles?)\b/gi, 'game'],
  ['rpg', /\b(rpg|inventory|quests?|dialogue tree|xp|level up|party members?)\b/gi, 'game'],
  ['roguelike', /\b(rogue-?(like|lite)|permadeath|procedural(ly)? generat\w*)\b/gi, 'game'],
  ['spooky', /\b(horror|spooky|creepy|haunted|ghosts?|zombies?)\b/gi, ''],
  ['racing', /\b(racing|race track|karts?|drift(ing)?)\b/gi, 'game'],
  ['farming', /\b(farm(ing)?|crops?|harvest|garden(ing)?)\b/gi, ''],
  ['story', /\b(story|narrative|visual novel|cutscenes?|lore)\b/gi, ''],
  ['portfolio', /\b(portfolio|my work|case stud(y|ies)|resume|cv)\b/gi, 'site'],
  ['e-commerce', /\b(e-?commerce|shop|store(front)?|checkout|shopping cart|cart|product pages?|stripe)\b/gi, 'site'],
  ['saas', /\b(saas|subscriptions?|pricing|plans|free trial|sign[- ]?ups?|waitlist)\b/gi, 'site'],
  ['landing page', /\b(landing pages?|hero section|call to action|cta|above the fold)\b/gi, 'site'],
  ['blog', /\b(blog|posts?|rss|articles?)\b/gi, 'site'],
  ['dashboard', /\b(dashboards?|analytics|charts?|metrics|kpis?|graphs?)\b/gi, 'app'],
  ['video', /\b(video (editor|editing|clips?)|edit(ing)? videos?|clips?|timeline|trim(ming)?|montage|reels?|vlogs?|motion graphics|webcodecs|ffmpeg)\b/gi, 'app'],
  ['social', /\b(feed|followers|likes|profiles?|friends list|social)\b/gi, 'app'],
  ['productivity', /\b(to-?do|habits?|tracker|planner|reminders?|calendar|focus timer|pomodoro)\b/gi, 'app'],
  ['music', /\b(music|audio|beats?|synth|songs?|playlist)\b/gi, ''],
  ['education', /\b(learn(ing)?|lessons?|quiz(zes)?|students?|teach(ing)?|flashcards?|course)\b/gi, ''],
  ['ai', /\b(ai|llm|gpt|claude|chat ?gpt|machine learning|embeddings?)\b/gi, ''],
  ['minimal', /\b(minimal(ist)?|clean|simple|bare)\b/gi, ''],
  ['kids', /\b(kids|children|family|for my (son|daughter))\b/gi, ''],
  ['3d', /\b(3d|three\.?js|webgl|first[- ]person)\b/gi, '3d'],
];
const AUDIENCE_WORDS = [
  ['kids and families', /\b(kids|children|family|parents)\b/gi],
  ['students', /\b(students?|classmates|school|class)\b/gi],
  ['developers', /\b(developers?|devs|programmers?|engineers?)\b/gi],
  ['customers', /\b(customers?|clients?|shoppers?|buyers?|small business(es)?)\b/gi],
  ['players', /\b(players?|gamers?|speedrunners?)\b/gi],
  ['the crew', /\b(our team|the team|ourselves|internal|just us)\b/gi],
];
const AUDIENCE_BY_KIND = { game: 'players', '3d': 'players', app: 'everyday users', site: 'visitors', tool: 'developers', bot: 'server members', api: 'developers', notes: 'the crew', other: 'the crew' };
const TONE_BY_TAG = { cozy: 'cozy and warm', spooky: 'spooky', retro: 'retro and playful', kids: 'playful and bright', minimal: 'calm and minimal', saas: 'clear and trustworthy', 'e-commerce': 'clear and trustworthy', portfolio: 'personal and polished', 'pixel art': 'playful', story: 'story-driven' };

// npm dependencies that settle the question
const DEPS = { phaser: 'game', kaplay: 'game', kaboom: 'game', littlejs: 'game', 'pixi.js': 'game', excalibur: 'game', three: '3d', '@react-three/fiber': '3d', 'babylonjs': '3d', '@babylonjs/core': '3d',
  'react-native': 'app', expo: 'app', '@capacitor/core': 'app', '@tauri-apps/api': 'app', electron: 'app', astro: 'site', next: 'site', gatsby: 'site', '@11ty/eleventy': 'site', hugo: 'site',
  'discord.js': 'bot', telegraf: 'bot', '@slack/bolt': 'bot', express: 'api', fastify: 'api', koa: 'api', hono: 'api', commander: 'tool', yargs: 'tool', zx: 'tool', 'chart.js': 'app', recharts: 'app' };
const EXT = { '.gd': 'game', '.tscn': 'game', '.unity': 'game', '.p8': 'game', '.glb': '3d', '.gltf': '3d', '.obj': '3d', '.swift': 'app', '.kt': 'app', '.dart': 'app', '.astro': 'site', '.mdx': 'site', '.ipynb': 'notes' };

// ---------- inspiration: gentle, useful cards (deterministic templates; the brain adds a few when it's on) ----------
// type: palette | idea | reference | task | tool. `when`: a tag or a kind (or '*'). `task`: the title "Make it a task" uses.
const P = (id, when, name, colors) => ({ id: `pal-${id}`, when, type: 'palette', emoji: '🎨', title: `Palette: ${name}`, text: 'Flat colors that fit. Use them as CSS variables so agents keep to them.', colors, task: `Set up the ${name.toLowerCase()} palette (${colors.join(', ')})` });
const I = (id, when, emoji, title, text, task) => ({ id, when, type: 'idea', emoji, title, text, task: task || title });
const R = (id, when, title, text) => ({ id, when, type: 'reference', emoji: '👀', title, text });
const T = (id, when, title, text) => ({ id, when, type: 'task', emoji: '📝', title, text, task: title });
const LIBRARY = [
  // tags first (most specific)
  I('mp-lobby', 'multiplayer', '🛋️', 'A lobby screen', 'Show who is in, a ready button and a "copy invite link". Friends find each other before the round starts.'),
  I('mp-names', 'multiplayer', '🏷️', 'Name tags over players', 'A small label over each player so friends know who is who. Hide it with a key.'),
  I('mp-sync', 'multiplayer', '🔁', 'Decide what the host owns', 'Write down which state the host owns (positions, score) and what each player sends. Saves a week of bugs.', 'Write down what the host owns in multiplayer'),
  I('plat-coyote', 'platformer', '🦘', 'Coyote time and jump buffering', 'Let a jump work a few frames after leaving a ledge, and remember a jump pressed just before landing. It feels fair.', 'Add coyote time and jump buffering'),
  I('plat-checkpoints', 'platformer', '🚩', 'Checkpoints', 'A flag mid-level so a fall costs ten seconds, not the whole run.', 'Add checkpoints'),
  R('plat-ref', 'platformer', 'Look at: Celeste, Super Mario Bros. 3', 'How the first screen teaches the jump without any text.'),
  P('pixel', 'pixel art', 'Pixel dusk', ['#1B1E2B', '#3B4A6B', '#E07A5F', '#F2CC8F', '#81B29A']),
  I('pixel-scale', 'pixel art', '🔍', 'Crisp pixel scaling', 'Draw at a small size and scale by whole numbers with image-rendering: pixelated, so pixels stay square.', 'Scale the canvas by whole numbers (crisp pixels)'),
  P('cozy', 'cozy', 'Campfire cozy', ['#3E4A3D', '#8FB996', '#E8C9A0', '#C97C5D', '#F4EBD9']),
  I('cozy-sound', 'cozy', '🎶', 'Soft ambient sound', 'A quiet loop (rain, fire, birds) with a mute button. Cozy is half sound.'),
  R('cozy-ref', 'cozy', 'Look at: Stardew Valley, A Short Hike', 'Slow pace, warm colors, nothing punishes you for wandering.'),
  P('retro', 'retro', 'Arcade night', ['#0F0F1B', '#2D2B55', '#FF5E7E', '#FFD166', '#3BCEAC']),
  P('spooky', 'spooky', 'Candlelight', ['#121015', '#2E2633', '#6B4E71', '#C9A227', '#E8E3D9']),
  I('rpg-save', 'rpg', '💾', 'Save and load', 'One save slot in localStorage first. Players forgive a lot if they keep their progress.', 'Add save and load'),
  I('puzzle-undo', 'puzzle', '↩️', 'Undo and restart', 'A one-key undo and a restart. Puzzles feel kind when mistakes are cheap.', 'Add undo and restart'),
  I('rogue-seed', 'roguelike', '🎲', 'Seeded runs', 'Show the run\'s seed so friends can play the same map.', 'Add seeded runs'),
  I('story-dialog', 'story', '💬', 'A dialogue box', 'Name, portrait, text that types itself out, and a key to skip.', 'Add a dialogue box'),
  I('kids-big', 'kids', '🧸', 'Big, friendly controls', 'Large tap targets, no reading needed to start, and nothing scary on fail.'),
  P('saas', 'saas', 'Trustworthy blue', ['#0F172A', '#1E3A8A', '#3B82F6', '#E2E8F0', '#F59E0B']),
  I('saas-pricing', 'saas', '💳', 'A three-plan pricing table', 'Free, Pro, Team. Mark one "most popular", list 4–5 features each, one button per plan.', 'Build a three-plan pricing table'),
  I('saas-signup', 'saas', '✉️', 'A one-field signup', 'Email only, then a "check your inbox" screen. Ask for the rest later.', 'Make signup a single email field'),
  R('saas-ref', 'saas', 'Look at: Stripe, Linear', 'One clear headline, one call to action, a product shot right under it.'),
  I('landing-hero', 'landing page', '🦸', 'Headline, one line, one button', 'Say what it is in under 8 words, who it is for in one line, and one button. Everything else goes below.', 'Write the hero: headline, one line, one button'),
  I('landing-proof', 'landing page', '⭐', 'Social proof strip', 'Three short quotes or a row of logos right under the hero.', 'Add a social proof strip under the hero'),
  P('portfolio', 'portfolio', 'Gallery white', ['#FAFAF7', '#1C1C1C', '#6B6B6B', '#E4572E', '#DADAD3']),
  I('portfolio-cases', 'portfolio', '🗂️', 'Three case studies', 'Fewer, deeper: the problem, what you did, a picture, the result. One page each.', 'Write three short case studies'),
  I('shop-cart', 'e-commerce', '🛒', 'A cart that stays', 'Keep the cart in localStorage and show the count in the header.', 'Keep the cart in localStorage'),
  R('shop-ref', 'e-commerce', 'Look at: Shopify\'s Dawn theme', 'Big product photos, price close to the button, a calm checkout.'),
  I('dash-empty', 'dashboard', '📊', 'Good empty states', 'Every chart says what will show up there and how to get data in.', 'Add empty states to every chart'),
  R('dash-ref', 'dashboard', 'Look at: Plausible, Linear Insights', 'Few numbers, big and clear, a date range picker, nothing else.'),
  I('prod-streak', 'productivity', '🔥', 'Streaks', 'A small streak counter. Kind on misses: show the best streak too.', 'Add a streak counter'),
  I('edu-quiz', 'education', '❓', 'A quick quiz', 'Three questions at the end of each lesson, with the answer explained.', 'Add a three-question quiz'),
  I('music-mute', 'music', '🔈', 'Volume and mute', 'A volume slider and a mute that is remembered.', 'Add volume and mute'),
  I('blog-rss', 'blog', '📡', 'An RSS feed', 'One feed.xml so people can follow along.', 'Add an RSS feed'),
  I('min-type', 'minimal', '🔤', 'One typeface, two weights', 'Minimal reads best with one font, two weights and plenty of space.'),
  // kinds
  T('game-title', 'game', 'Add a title screen', 'Name, a "Press start" and the controls. It makes it feel like a real game.'),
  I('game-juice', 'game', '✨', 'Add some juice', 'Screen shake on hits, a little squash on landing, a sound on every action.', 'Add game feel: shake, squash, sounds'),
  I('game-pause', 'game', '⏸️', 'A pause menu', 'Esc pauses with Resume, Restart and Volume.', 'Add a pause menu'),
  P('game', 'game', 'Bright arcade', ['#14141F', '#2B2D42', '#EF476F', '#FFD166', '#06D6A0']),
  T('3d-orbit', '3d', 'Add orbit controls and a ground plane', 'So everyone can look around the scene from the first commit.'),
  I('3d-light', '3d', '💡', 'One warm light, one cool fill', 'Two lights make a scene read as 3D. Add soft fog for depth.', 'Light the scene: warm key, cool fill, fog'),
  T('app-screens', 'app', 'Sketch the first three screens', 'Home, the main thing, settings. Agree on them before building.'),
  I('app-offline', 'app', '📶', 'Works offline', 'Keep the last data around so the app opens instantly with no signal.', 'Make it open offline'),
  P('app', 'app', 'Calm app', ['#101418', '#1F2933', '#38C6B1', '#E4E7EB', '#F5A623']),
  T('site-hero', 'site', 'Write the hero headline and one call to action', 'The first thing visitors see. Short, specific, one button.'),
  I('site-meta', 'site', '🔗', 'Share previews', 'A title, description and an image for link previews, so it looks good when texted.', 'Add share previews (title, description, image)'),
  I('site-mobile', 'site', '📱', 'Check it at phone width', 'Most visitors arrive on a phone. 390px wide, no sideways scroll.', 'Check every page at phone width'),
  P('site', 'site', 'Clean paper', ['#FFFFFF', '#111827', '#6B7280', '#2563EB', '#F3F4F6']),
  T('tool-help', 'tool', 'Write a --help that shows one real example', 'People copy the example first. Make it work as-is.'),
  R('tool-ref', 'tool', 'Look at: ripgrep, fzf', 'Fast, one job, great defaults, friendly errors.'),
  T('bot-help', 'bot', 'Add a /help command', 'Lists every command with one example each.'),
  I('bot-rate', 'bot', '⏱️', 'Rate limits and cooldowns', 'Keep one person from spamming a command.', 'Add command cooldowns'),
  T('api-health', 'api', 'Add a /health endpoint', 'Returns ok and the version. Every monitor and agent will use it.'),
  I('api-errors', 'api', '🧯', 'One error shape', 'Every error is { error, code }. Clients get simpler overnight.', 'Use one error shape everywhere'),
  T('notes-index', 'notes', 'Make an index page linking every note', 'One page to start from, grouped by topic.'),
  // anything
  T('any-readme', '*', 'Write a two-line README', 'What it is and how to run it. Agents read it first.'),
  I('any-vision', '*', '🧭', 'Write the vision in three lines', 'Who it is for, what it does, what it will never do.', 'Write the vision in three lines'),
];

const NOTE = {
  multiplayer: 'Sounds like it\'s going multiplayer.',
  platformer: 'Sounds like a platformer is taking shape.',
  cozy: 'Sounds like it\'s getting cozy.',
  'e-commerce': 'Sounds like there\'s a shop in this.',
  saas: 'Sounds like there\'s a product to sell.',
  'landing page': 'Sounds like a landing page is coming.',
  dashboard: 'Sounds like there\'s a dashboard in this.',
  'pixel art': 'Sounds like it\'s going pixel art.',
  spooky: 'Sounds like it\'s getting spooky.',
};

// ---------- the engine (pure) ----------
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
function snippet(text, i, len) {
  const a = Math.max(0, i - 28), b = Math.min(text.length, i + len + 28);
  return clip(`${a ? '…' : ''}${text.slice(a, b).replace(/\s+/g, ' ').trim()}${b < text.length ? '…' : ''}`, 90);
}
// sources: [{ from, text, w }]  → scores and signals
function infer(sources, extra = {}) {
  const kind = Object.fromEntries(KINDS.map(k => [k, 0])), tag = {}, aud = {}, tagFromChat = {}, sig = [];
  const hit = (from, text, m, w, what) => { sig.push({ from, text: snippet(text, m.index, m[0].length), w, what }); };
  for (const s of sources) {
    const text = String(s.text || ''); if (!text.trim() || !(s.w > 0)) continue;
    for (const [k, re, w] of KIND_WORDS) {
      re.lastIndex = 0; let m, n = 0;
      while ((m = re.exec(text)) && n < 3) { n++; kind[k] += w * s.w; if (n === 1) hit(s.from, text, m, w * s.w, k); }
    }
    for (const [t, re, hint] of TAG_WORDS) {
      re.lastIndex = 0; let m, n = 0;
      while ((m = re.exec(text)) && n < 3) { n++; tag[t] = (tag[t] || 0) + s.w; if (s.from === 'chat') tagFromChat[t] = (tagFromChat[t] || 0) + s.w; if (hint) kind[hint] += 0.4 * s.w; if (n === 1) hit(s.from, text, m, s.w, t); }
    }
    for (const [a, re] of AUDIENCE_WORDS) { re.lastIndex = 0; let m, n = 0; while ((m = re.exec(text)) && n < 3) { n++; aud[a] = (aud[a] || 0) + s.w; } }
  }
  for (const [k, w, from, text] of extra.kinds || []) { kind[k] += w; sig.push({ from, text, w, what: k }); }
  const ranked = Object.entries(kind).filter(([k]) => k !== 'other').sort((a, b) => b[1] - a[1]);
  const [top, second] = [ranked[0], ranked[1]];
  let k = 'other', confidence = 0;
  if (top[1] >= 2) { k = top[0]; confidence = Math.round(Math.min(1, top[1] / 8) * ((top[1] - second[1]) / top[1]) * 100) / 100; }
  const tags = Object.entries(tag).filter(([, v]) => v >= 1.5).sort((a, b) => b[1] - a[1]).map(([t]) => t).filter(t => t !== k).slice(0, 6);
  const audTop = Object.entries(aud).sort((a, b) => b[1] - a[1])[0];
  const audience = audTop && audTop[1] >= 2 ? audTop[0] : AUDIENCE_BY_KIND[k];
  const tone = (tags.map(t => TONE_BY_TAG[t]).find(Boolean)) || 'friendly';
  const signals = sig.sort((a, b) => b.w - a.w).filter((s, i, arr) => arr.findIndex(x => x.from === s.from && x.what === s.what) === i).slice(0, 6).map(s => ({ from: s.from, text: s.text }));
  return { kind: k, confidence, tags, audience, tone, signals, scores: Object.fromEntries(ranked.filter(r => r[1] > 0).map(([a, b]) => [a, Math.round(b * 10) / 10])), tagFromChat };
}
function summaryOf(s, name) {
  const ADJ = { saas: 'SaaS', 'e-commerce': 'shop', 'pixel art': 'pixel-art', 'landing page': '', blog: '', portfolio: 'portfolio', dashboard: '', social: 'social', productivity: '', education: 'learning', kids: '', story: 'story-driven', '3d': '3D' };
  const desc = s.tags.filter(t => !['multiplayer', 'minimal', 'ai'].includes(t)).map(t => (t in ADJ ? ADJ[t] : t)).filter(Boolean).slice(0, 2).join(' ');
  const mp = s.tags.includes('multiplayer') ? ' multiplayer' : '';
  if (s.kind === 'other') return `${name}: still taking shape. Talk about it in chat and this fills in.`;
  const what = `${mp.trim()} ${desc} ${NOUN[s.kind]}`.replace(/\s+/g, ' ').trim();
  return `${name} looks like ${/^[aeiou3]/i.test(what) ? 'an' : 'a'} ${what} for ${s.audience}.`;
}
function inspire(s, { picks = [], brainIdeas = [] } = {}) {
  const want = [...s.tags, s.kind === 'other' ? '' : s.kind, '*'].filter(Boolean);
  const out = [];
  for (const w of want) for (const it of LIBRARY) if (it.when === w && !out.some(x => x.id === it.id)) out.push(it);
  // one palette near the top, then a mix: idea, reference/task, tool…
  const pal = out.find(x => x.type === 'palette');
  const rest = out.filter(x => x !== pal && !(x.type === 'palette'));
  const tool = picks[0] ? [{ id: `tool-${picks[0].id}`, type: 'tool', emoji: '🧰', title: `Try ${picks[0].title}`, text: picks[0].summary, shelf: picks[0].id, task: `Try ${picks[0].title}` }] : [];
  const mixed = [...brainIdeas, ...rest.slice(0, 2), ...(pal ? [pal] : []), ...tool, ...rest.slice(2)];
  return mixed.slice(0, 14).map(({ when, ...it }) => it);
}

module.exports = function sense({ P: Proj, store, base, broadcast, postChat, loadTasks, readVision, shelf, brain, llm, log = () => {} }) {
  const FILE = '.tribe/sense.json';
  let all = base.readJSON(FILE, {}); if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  let saveT = null; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => base.writeJSON(FILE, all), 400); if (saveT.unref) saveT.unref(); };
  const err = (status, m) => Object.assign(new Error(m), { status });
  const entry = pid => (all[pid] = all[pid] || { override: '', notes: true, dismissed: {} });
  const roleIn = (me, pid) => ((Proj.get(pid) || {}).members || {})[me.id] || me.role;
  const canEdit = (me, pid) => !!me && me.role !== 'agent' && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator';
  const notesAllowed = () => process.env.TRIBE_SENSE_NOTES === '1' || (process.env.TRIBE_SENSE_NOTES !== '0' && process.env.TRIBE_TEST !== '1');
  const NOTE_GAP = Number(process.env.TRIBE_SENSE_NOTE_GAP_MS) || 3 * 3600_000;

  // ---------- the repo: README, package.json, file types (cached a few minutes) ----------
  const repoCache = new Map();
  function scanRepo(p) {
    if (!p || !p.repo) return null;
    const c = repoCache.get(p.id); if (c && Date.now() - c.at < 5 * 60_000 && c.repo === p.repo) return c.v;
    let dir; try { dir = fs.realpathSync(p.repo); } catch { return null; }
    const read = (f, n) => { try { const fd = fs.openSync(path.join(dir, f), 'r'); const b = Buffer.alloc(n); const r = fs.readSync(fd, b, 0, n, 0); fs.closeSync(fd); return b.slice(0, r).toString('utf8'); } catch { return ''; } };
    const readme = read('README.md', 4000) || read('readme.md', 4000) || read('README', 4000);
    let pkg = null; try { pkg = JSON.parse(read('package.json', 64 * 1024)); } catch {}
    const ext = {}; let n = 0;
    (function walk(d, depth) {
      if (depth > 3 || n > 600) return;
      let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of list) {
        if (n > 600) return;
        if (e.name.startsWith('.') || ['node_modules', 'dist', 'build', 'target', 'vendor', '__pycache__', 'venv'].includes(e.name)) continue;
        if (e.isDirectory()) walk(path.join(d, e.name), depth + 1); else { n++; const x = path.extname(e.name).toLowerCase(); ext[x] = (ext[x] || 0) + 1; }
      }
    })(dir, 0);
    const v = { readme, pkg, ext };
    repoCache.set(p.id, { at: Date.now(), repo: p.repo, v });
    return v;
  }

  // ---------- gather the sources for one project ----------
  function gather(pid) {
    const p = Proj.get(pid); if (!p) return null;
    const sources = [], kinds = [];
    sources.push({ from: 'name', text: p.name || '', w: 3 }, { from: 'bio', text: p.bio || '', w: 3 });
    Proj.inProject(pid, () => {
      let vision = ''; try { vision = readVision() || ''; } catch {}
      sources.push({ from: 'vision', text: vision.slice(0, 6000), w: 1.2 });
      let tasks = []; try { tasks = loadTasks(); } catch {}
      tasks.slice(-60).forEach(t => sources.push({ from: 'task', text: t.title || '', w: 1 }));
      let chat = []; try { chat = store.readJSONL('chat/general.jsonl', 150); } catch {}
      const now = Date.now(), human = chat.filter(m => m && !m.deleted && m.by !== 'tribecode' && typeof m.text === 'string');
      human.forEach((m, i) => {
        const ageH = Math.max(0, (now - Date.parse(m.at)) / 3600_000) || 0;
        const recency = 0.5 + 0.5 * ((i + 1) / human.length);   // the newest messages count most…
        const w = Math.pow(0.5, ageH / 72) * recency;           // …and old ones fade (half-life 3 days)
        if (w > 0.05) sources.push({ from: 'chat', text: m.text.slice(0, 600), w });
      });
      sources.humanChat = human.length;
    });
    const r = scanRepo(p);
    if (r) {
      sources.push({ from: 'readme', text: r.readme, w: 1 });
      if (r.pkg) {
        sources.push({ from: 'package.json', text: `${r.pkg.name || ''} ${r.pkg.description || ''} ${(Array.isArray(r.pkg.keywords) ? r.pkg.keywords : []).join(' ')}`, w: 1.5 });
        const deps = Object.keys({ ...(r.pkg.dependencies || {}), ...(r.pkg.devDependencies || {}) });
        deps.filter(d => DEPS[d]).slice(0, 6).forEach(d => kinds.push([DEPS[d], 3, 'package.json', `uses ${d}`]));
      }
      for (const [x, k] of Object.entries(EXT)) if (r.ext[x]) kinds.push([k, Math.min(3, 1 + r.ext[x] * 0.3), 'files', `${r.ext[x]} ${x} file${r.ext[x] === 1 ? '' : 's'}`]);
      const code = Object.keys(r.ext).filter(x => /^\.(js|ts|tsx|jsx|py|go|rs|rb|java|c|cpp|cs|lua)$/.test(x)).length;
      if (r.ext['.html'] && !code) kinds.push(['site', 1, 'files', 'plain HTML and CSS']);
      if (r.ext['.py'] && !r.ext['.html']) kinds.push(['tool', 0.8, 'files', 'Python scripts']);
    }
    let picks = [];
    try { const sv = shelf.view(p); picks = sv.picks || []; (sv.types || []).forEach(t => { const k = t === 'platformer' || t === 'rpg' ? 'game' : t; if (KINDS.includes(k)) kinds.push([k, 1.5, 'template', `looks like a ${t}`]); }); } catch {}
    return { p, sources, kinds, picks, humanChat: sources.humanChat || 0 };
  }

  // ---------- compute + store ----------
  function compute(pid, why = 'event') {
    const g = gather(pid); if (!g) return null;
    const e = entry(pid);
    const s = infer(g.sources, { kinds: g.kinds });
    const sensed = { kind: s.kind, confidence: s.confidence };
    const ref = e.refined && Date.now() - e.refined.at < 24 * 3600_000 ? e.refined : null;
    if (ref && ref.kind && KINDS.includes(ref.kind) && s.confidence < 0.45) { s.kind = ref.kind; s.confidence = 0.6; s.by = 'brain'; }
    if (ref && Array.isArray(ref.tags)) s.tags = [...new Set([...s.tags, ...ref.tags])].slice(0, 6);
    if (e.override && KINDS.includes(e.override)) { s.kind = e.override; s.confidence = 1; s.by = 'host'; }
    const cur = {
      kind: s.kind, label: NOUN[s.kind], tags: s.tags, audience: s.kind === sensed.kind ? s.audience : AUDIENCE_BY_KIND[s.kind], tone: s.tone,
      summary: (ref && ref.summary) || summaryOf(s, g.p.name), confidence: s.confidence, by: s.by || 'words', sensed,
      signals: s.signals, scores: s.scores, at: new Date().toISOString(),
      inspiration: inspire(s, { picks: g.picks, brainIdeas: ref && Array.isArray(ref.ideas) ? ref.ideas : [] }),
    };
    const prev = e.cur;
    e.cur = cur; save();
    const top3 = x => (x ? x.tags.slice(0, 3) : []);
    const newTags = top3(cur).filter(t => !top3(prev).includes(t));
    const kindChanged = !prev || prev.kind !== cur.kind;
    const meaningful = !prev ? cur.kind !== 'other' : kindChanged || newTags.length > 0;
    if (meaningful && why !== 'read') broadcast({ type: 'sense', project: pid });
    if (meaningful && prev && why === 'event') { note(pid, g, cur, prev, newTags, s.tagFromChat); refine(pid, g); }
    else if (why === 'event' && cur.confidence < 0.45 && g.humanChat >= 4) refine(pid, g);
    return cur;
  }

  // ---------- Flint's quiet note in chat ----------
  function note(pid, g, cur, prev, newTags, fromChat) {
    const e = entry(pid);
    if (!notesAllowed() || e.notes === false || g.humanChat < 4) return;
    if (e.lastNote && Date.now() - e.lastNote < NOTE_GAP) return;
    const tag = newTags.find(t => (fromChat[t] || 0) >= 1 && NOTE[t]);
    const kindNew = prev.kind !== cur.kind && cur.kind !== 'other' && cur.confidence >= 0.45 && cur.by !== 'host';
    if (!tag && !kindNew) return;
    const lead = tag ? NOTE[tag] : `Sounds like this is a${/^[aeiou3]/i.test(NOUN[cur.kind]) ? 'n' : ''} ${NOUN[cur.kind]}.`;
    const pool = tag ? LIBRARY.filter(l => l.when === tag) : cur.inspiration;
    const ideas = pool.filter(x => x.type === 'idea' || x.type === 'task').slice(0, 3).map(x => x.title.replace(/\.$/, '').replace(/^(Add|A|An) /, '').replace(/^\w/, c => c.toLowerCase()));
    if (!ideas.length) return;
    e.lastNote = Date.now(); save();
    Proj.inProject(pid, () => postChat('general', 'tribecode', `💡 **Flint:** ${lead} Ideas: ${ideas.join(', ')}. More on the Dashboard.`, { sense: true }));
  }

  // ---------- the brain's optional refinement (at most once per 10 minutes per project) ----------
  const refining = new Set();
  function refine(pid, g) {
    const e = entry(pid);
    if (refining.has(pid) || (e.refineAt && Date.now() - e.refineAt < 10 * 60_000)) return;
    let st = {}; try { st = brain.status() || {}; } catch {}
    if (!st.online) return;
    e.refineAt = Date.now(); refining.add(pid);
    const facts = [`Name: ${g.p.name}`, g.p.bio ? `Bio: ${g.p.bio}` : '', ...g.sources.filter(s => s.from === 'task').slice(-12).map(s => `Task: ${s.text}`),
      ...g.sources.filter(s => s.from === 'chat').slice(-20).map(s => `Chat: ${s.text.slice(0, 200)}`), ...g.sources.filter(s => s.from === 'vision' && s.text).map(s => `Vision: ${s.text.slice(0, 800)}`)].filter(Boolean).join('\n');
    const prompt = `${facts}\n\nWhat is this project? Reply with exactly one line of JSON: {"kind": one of ${JSON.stringify(KINDS)}, "tags": [up to 4 short lowercase tags], "summary": "<one sentence>", "ideas": [{"title": "<short feature idea>", "text": "<one sentence why>"}] (2 ideas)}`;
    const run = () => brain.generate(prompt, { system: 'You classify small software projects from their chat and tasks. JSON only, no prose. Use only the facts given.', maxTokens: 220, timeoutMs: 30_000 });
    Promise.resolve(llm && llm.asCaller ? llm.asCaller(null, run) : run()).then(out => {
      if (!out) return;
      const j = JSON.parse((String(out).match(/\{[\s\S]*\}/) || ['{}'])[0]);
      const s = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
      e.refined = { at: Date.now(), kind: KINDS.includes(j.kind) ? j.kind : '', tags: (Array.isArray(j.tags) ? j.tags : []).map(t => s(t, 24).toLowerCase()).filter(Boolean).slice(0, 4), summary: s(j.summary, 200),
        ideas: (Array.isArray(j.ideas) ? j.ideas : []).slice(0, 3).map((x, i) => ({ id: `brain-${e.refineAt}-${i}`, type: 'idea', emoji: '✨', title: s(x && x.title, 80), text: s(x && x.text, 200), task: s(x && x.title, 120), by: 'brain' })).filter(x => x.title) };
      save(); compute(pid, 'refined');
    }).catch(x => log(`sense: brain refine skipped (${x.message})`)).finally(() => refining.delete(pid));
  }

  // ---------- events → debounced recompute ----------
  const timers = new Map();
  const EVENTS = new Set(['chat', 'task', 'task-removed', 'repo', 'change', 'projects', 'vision']);
  function onEvent(type, pid) {
    if (!EVENTS.has(type)) return;
    if (type === 'repo' || type === 'change') repoCache.delete(pid);
    const ids = pid ? [pid] : type === 'projects' ? Proj.all().map(p => p.id).filter(id => all[id]) : [];
    for (const id of ids) {
      clearTimeout(timers.get(id));
      const t = setTimeout(() => { timers.delete(id); try { if (Proj.get(id)) compute(id, 'event'); } catch (e) { log(`sense: ${e.message}`); } }, Number(process.env.TRIBE_SENSE_DEBOUNCE_MS) || 1500);
      if (t.unref) t.unref(); timers.set(id, t);
    }
  }

  function get(pid) { const e = entry(pid); if (!e.cur || Date.now() - Date.parse(e.cur.at) > 10 * 60_000) compute(pid, e.cur ? 'stale' : 'read'); return e.cur; }
  // What widgets.js asks: the kind, when the sense is sure enough (else '' and it falls back to the shelf's types).
  function kindFor(pid) { try { const c = get(pid); return c && c.kind !== 'other' && c.confidence >= 0.45 ? c.kind : ''; } catch { return ''; } }

  function view(pid, me) {
    const e = entry(pid), c = get(pid) || {}, gone = new Set((e.dismissed || {})[me.id] || []);
    return { kind: c.kind, label: c.label, preview: PREVIEW[c.kind] || 'Preview', tags: c.tags || [], audience: c.audience, tone: c.tone, summary: c.summary, confidence: c.confidence, by: c.by,
      sensed: c.sensed, override: e.override || '', notes: e.notes !== false, canEdit: canEdit(me, pid), kinds: KINDS.filter(k => k !== 'other').map(k => ({ id: k, label: NOUN[k] })),
      signals: c.signals || [], inspiration: (c.inspiration || []).filter(x => !gone.has(x.id)) };
  }

  async function route(req, res, { m, b, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!Proj.get(b) || !Proj.canSee(me, b)) return fail(res, 404, 'project not found');
    const sub = parts[3] || '';
    try {
      if (m === 'GET' && !sub) return send(res, 200, view(b, me));
      if (m === 'POST' && sub === 'dismiss') {
        if (me.role === 'agent') return fail(res, 403, 'agents don\'t get inspiration cards');
        const body = await readBody(req, 8 * 1024), id = String(body.id || '').slice(0, 80);
        if (!/^[a-z0-9-]+$/i.test(id)) throw err(400, 'which card?');
        const e = entry(b), list = new Set((e.dismissed = e.dismissed || {})[me.id] || []); list.add(id);
        e.dismissed[me.id] = [...list].slice(-200); save();
        return send(res, 200, view(b, me));
      }
      if ((m === 'PUT' || m === 'PATCH') && !sub) {
        if (!canEdit(me, b)) return fail(res, 403, 'only the host and builders can say what the project is');
        const body = await readBody(req, 8 * 1024), e = entry(b);
        if (body.kind !== undefined) { const k = String(body.kind || ''); if (k && !KINDS.includes(k)) throw err(400, `unknown kind: ${k.slice(0, 20)}`); e.override = k === 'other' ? '' : k; }
        if (body.notes !== undefined) e.notes = !!body.notes;
        save(); compute(b, 'host'); broadcast({ type: 'sense', project: b }); broadcast({ type: 'widgets', project: b });
        return send(res, 200, view(b, me));
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 404, 'no such sense route');
  }

  return { route, onEvent, get, kindFor, view, compute, PREVIEW, NOUN, KINDS };
};
module.exports.infer = infer;
module.exports.inspire = inspire;
module.exports.KINDS = KINDS;
module.exports.TAG_WORDS = TAG_WORDS;   // feat/captures: capture tags use the same keywords (server/captures.js)
module.exports.KIND_WORDS = KIND_WORDS;
