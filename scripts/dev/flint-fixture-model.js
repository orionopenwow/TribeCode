#!/usr/bin/env node
// A small FIXTURE model for Flint's local helper (app/ui/flintembed.js), in the same two-file format a published
// Model2Vec model uses (model.safetensors + tokenizer.json). It is not a trained language model: it exists so the
// loader, the opt-in flow and the tests have a real file to work with on a machine that can't download one.
//
// How its vectors are made (deterministic, seeded):
//   1. Words come from Flint's own example phrases (flintnlu.js catalog) and the Guide and help docs.
//   2. Random indexing: each word has a fixed random "index" vector; a word's meaning vector is the sum of the index
//      vectors of the words it appears next to (window 3), so words used in the same places end up close.
//   3. A short hand-written list of synonym groups (GROUPS below) pulls everyday synonyms together, because a corpus
//      this small never sees "purchase" next to what "buy" sits next to.
//   node scripts/dev/flint-fixture-model.js   ->  app/test/fixtures/flint-model/{model.safetensors,tokenizer.json,config.json}
'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'app/ui/flintembed.js')), N = require(path.join(ROOT, 'app/ui/flintnlu.js'));
const OUT = path.join(ROOT, 'app/test/fixtures/flint-model'), DIM = 64, MAX_VOCAB = 3200;

const GROUPS = `buy purchase order shop shopping groceries
car automobile vehicle
picture image photo photograph screenshot pic
teammate friend colleague buddy coworker
remove delete erase trash discard
make create build new add
meeting call huddle standup sync
money budget cost price pricing pay payment fee
bug issue problem error crash broken defect glitch
fix repair solve mend patch
ship deploy release publish launch
doc document page note writeup
task todo ticket chore job item
calendar schedule event appointment agenda
invite bring join welcome
theme appearance look style colors colours
dark night dim black
light bright day white
website site webpage homepage landing
summary summarize summarise recap tldr digest overview
remind reminder nudge alert alarm
timer countdown stopwatch clock
message tell text ping dm say
people person members team tribe folks everyone
help guide tutorial howto instructions explain
search find lookup locate where
open show view display see
finish done complete completed finished close
start begin kick launch
big large huge bigger larger
small tiny little smaller
quick fast speedy rapid
slow sluggish laggy
checks tests test testing lint build
passing green ok okay succeeded
failing red failed broke
font typeface typography lettering
heading headline title header
button cta
palette colors scheme swatch
chart graph plot diagram
total sum add tally
average mean avg
sort order arrange rank
preview demo try play run
undo revert back
assign give hand delegate
due deadline by
gig job work hire freelance
game level sprite player boss
music sound audio song track
idea proposal suggestion pitch plan
backup save copy export download
password login signin sign account
phone mobile iphone android
computer laptop desktop pc
cat kitten feline
dog puppy canine
food meal dinner lunch recipe cook
travel trip journey flight vacation holiday
weather rain sunny forecast temperature
happy glad joyful cheerful
sad unhappy gloomy`.split('\n').map(l => l.trim().split(/\s+/).filter(Boolean));

// seeded numbers
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const indexVec = w => { const r = rng(hash(w)), v = new Float32Array(DIM); for (let k = 0; k < DIM; k++) v[k] = (r() + r() + r() - 1.5); return v; };
const unit = v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return v.map(x => x / s); };

// the corpus
const texts = [];
for (const c of N.catalog()) for (const e of c.examples) texts.push(e, e, `${c.label || ''} ${e}`);
for (const dir of ['docs/guide', 'docs']) { const d = path.join(ROOT, dir); for (const f of fs.readdirSync(d).filter(f => /\.md$/.test(f)).sort()) { if (dir === 'docs' && !/^(WEBSITE|PROJECTS|HOSTING|MOBILE|ACCOUNTS|PREMIUM|FLINT-TIERS|COMPANY|ASSETS|EXPORT)\.md$/.test(f)) continue; texts.push(...fs.readFileSync(path.join(d, f), 'utf8').replace(/```[\s\S]*?```/g, ' ').split(/\n+/)); } }
const STOP = new Set('a an the to of in on at for and or is are be it this that with as by from your you i we our my me so if do does not no can will its their they he she his her them us was were been has have had but than then there here what which who when how why all any each'.split(' '));
const tok = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w && w.length < 24);
const freq = new Map(), sents = texts.map(tok).filter(s => s.length);
for (const s of sents) for (const w of s) freq.set(w, (freq.get(w) || 0) + 1);
const groupWords = new Set(GROUPS.flat());
const vocabWords = [...new Set([...groupWords, ...[...freq.entries()].filter(([w]) => !/^\d+$/.test(w)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([w]) => w)])].slice(0, MAX_VOCAB);
const inVocab = new Set(vocabWords);

// context vectors
const ctx = new Map(vocabWords.map(w => [w, new Float32Array(DIM)]));
const idf = w => Math.log(1 + sents.length / (freq.get(w) || 1));
for (const s of sents) for (let i = 0; i < s.length; i++) {
  const w = s[i]; if (!inVocab.has(w)) continue; const c = ctx.get(w);
  for (let j = Math.max(0, i - 3); j <= Math.min(s.length - 1, i + 3); j++) { if (j === i || STOP.has(s[j])) continue; const iv = indexVec(s[j]), wt = idf(s[j]) / (1 + Math.abs(i - j)); for (let k = 0; k < DIM; k++) c[k] += iv[k] * wt; }
}
const vec = new Map();
for (const w of vocabWords) { const own = unit(indexVec(w)), c = unit(ctx.get(w)), v = new Float32Array(DIM); for (let k = 0; k < DIM; k++) v[k] = own[k] * 0.55 + c[k] * 0.45; vec.set(w, unit(v)); }
// synonym groups: each word moves most of the way to its group's centre
for (const g of GROUPS) {
  const cen = new Float32Array(DIM); for (const w of g) { const iv = unit(indexVec('group:' + g[0])), v = vec.get(w); for (let k = 0; k < DIM; k++) cen[k] += v[k] * 0.3 + iv[k]; }
  const c = unit(cen);
  for (const w of g) { const v = vec.get(w), o = new Float32Array(DIM); for (let k = 0; k < DIM; k++) o[k] = v[k] * 0.35 + c[k] * 0.65; vec.set(w, unit(o)); }
}
// stop words carry little: short vectors, so the mean is about the content words
for (const w of vocabWords) if (STOP.has(w)) vec.set(w, vec.get(w).map(x => x * 0.15));

// write: [PAD], [UNK], then the words
const tokens = ['[PAD]', '[UNK]', ...vocabWords], table = new Float32Array(tokens.length * DIM);
vocabWords.forEach((w, i) => table.set(vec.get(w), (i + 2) * DIM));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'model.safetensors'), E.writeSafetensors(table, tokens.length, DIM, { format: 'pt', note: 'TribeCode test fixture, not a trained model' }));
fs.writeFileSync(path.join(OUT, 'tokenizer.json'), JSON.stringify({ version: '1.0', added_tokens: [{ id: 0, content: '[PAD]', special: true }, { id: 1, content: '[UNK]', special: true }], normalizer: { type: 'BertNormalizer', lowercase: true, strip_accents: true }, pre_tokenizer: { type: 'BertPreTokenizer' },
  model: { type: 'WordPiece', unk_token: '[UNK]', continuing_subword_prefix: '##', max_input_chars_per_word: 100, vocab: Object.fromEntries(tokens.map((t, i) => [t, i])) } }));
fs.writeFileSync(path.join(OUT, 'config.json'), JSON.stringify({ name: 'tribecode-fixture-64', model_type: 'model2vec', normalize: true, license: 'MIT', note: 'A generated test fixture (scripts/dev/flint-fixture-model.js). Not a trained model.' }, null, 2) + '\n');
const size = fs.statSync(path.join(OUT, 'model.safetensors')).size + fs.statSync(path.join(OUT, 'tokenizer.json')).size;
console.log(`fixture model: ${tokens.length} tokens × ${DIM} dims, ${(size / 1024).toFixed(0)} KB -> ${path.relative(ROOT, OUT)}`);
