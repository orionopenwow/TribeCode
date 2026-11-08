// feat/captures: unit tests for the link reader's pieces (no server, no network):
//   the HTML reader (noise removal, metadata, charsets, weird HTML), the deterministic summarizer measured against the
//   evaluation fixtures in app/test/fixtures/captures (reference summaries + actions), keep/discard learning, VTT and
//   whisper parsing, URL dedupe.  Usage: node app/test/captures_test.js
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert');
const root = path.resolve(__dirname, '..', '..');
const H = require(path.join(root, 'server', 'capture-html'));
const SUM = require(path.join(root, 'server', 'capture-sum'));
const REC = require(path.join(root, 'server', 'capture-recipes'));
const CAP = require(path.join(root, 'server', 'captures'));
const SENSE = require(path.join(root, 'server', 'sense'));
const FIX = path.join(__dirname, 'fixtures', 'captures');
const lexicon = [...SENSE.TAG_WORDS.map(([t, re]) => [t, re]), ...SENSE.KIND_WORDS.map(([k, re]) => [k, re])];
const recipe = id => { const r = REC.BUILTIN.find(x => x.id === id) || REC.BUILTIN[0]; return r; };
let n = 0; const ok = (c, msg) => { assert.ok(c, msg); n++; };

// ---------- HTML reader ----------
{
  const html = fs.readFileSync(path.join(FIX, 'article-pixel.html'), 'utf8');
  const spec = JSON.parse(fs.readFileSync(path.join(FIX, 'article-pixel.json'), 'utf8')).expect;
  const x = H.extract(html, 'https://blog.example/pixel');
  ok(x.title === spec.title, 'title: ' + x.title);
  ok(x.author === spec.author, 'author: ' + x.author);
  ok(x.published === '2026-10-02', 'published');
  ok(x.image === 'https://blog.example/thumb.png', 'image resolved: ' + x.image);
  for (const s of spec.contains) ok(x.text.includes(s), 'keeps: ' + s);
  for (const s of spec.excludes) ok(!x.text.toLowerCase().includes(s.toLowerCase()), 'drops noise: ' + s + '\n' + x.text);
  ok(/^## Turn off smoothing/m.test(x.text), 'headings kept');
  ok(/^- Pick one base resolution early\./m.test(x.text), 'list items kept');
}
{ // charsets: windows-1252 page without a header, Shift_JIS from <meta>, a BOM, a page that lies about UTF-8
  const latin = Buffer.concat([Buffer.from('<html><head><title>Caf'), Buffer.from([0xe9]), Buffer.from(' cr'), Buffer.from([0xe8]), Buffer.from('me</title></head><body><p>na'), Buffer.from([0xef]), Buffer.from('ve</p></body></html>')]);
  ok(H.decodeBody(latin, 'text/html').includes('Café crème'), 'windows-1252 guessed');
  ok(H.decodeBody(latin, 'text/html; charset=utf-8').includes('Café crème'), 'lying utf-8 header falls back');
  const sjis = Buffer.concat([Buffer.from('<meta charset="shift_jis"><p>'), Buffer.from([0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd]), Buffer.from('</p>')]);
  ok(H.decodeBody(sjis, 'text/html').includes('こんにちは'), 'shift_jis from meta: ' + H.decodeBody(sjis, ''));
  ok(H.decodeBody(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hé')]), '') === 'hé', 'bom');
}
{ // weird HTML never throws: unclosed tags, stray <, huge nesting, entities, script with </ inside
  const weird = '<p>a < b & c &#x1F600; &bogus; <b>bold <i>both</b> <div><div><div>' + '<span>'.repeat(5000) + 'deep' + '</span>'.repeat(10) + '<script>var s="</div>";</script><p>' + 'word '.repeat(60) + '<!-- unclosed';
  const x = H.extract(weird, 'http://x.test/');
  ok(typeof x.text === 'string', 'weird html parsed');
  ok(!x.text.includes('var s'), 'script text dropped');
  ok(H.decodeEntities('&lt;script&gt;&#0;&#xD800;') === '<script>', 'entities decode safely');
  const t0 = Date.now(); const big = '<html><body>' + Array.from({ length: 20000 }, (_, i) => `<div class="row"><p>Some filler text number ${i}, with commas, that keeps going and going for a while.</p><a href="#">link</a></div>`).join('') + '</body></html>';
  const xb = H.extract(big, 'http://x.test/'); ok(Date.now() - t0 < 8000, 'a 2 MB page reads in time: ' + (Date.now() - t0) + 'ms'); ok(xb.words > 100, 'big page has text');
}
{ // robots + paywall signals
  const x = H.extract('<head><meta name="robots" content="noarchive"><script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false,"headline":"Paid"}</script></head><body><p>x</p></body>', 'http://p.test/');
  ok(/noarchive/.test(x.robots) && x.paywalled && x.title === 'Paid', 'robots + paywall seen');
}

// ---------- summarizer vs. the evaluation set ----------
const results = [];
for (const f of fs.readdirSync(FIX).filter(f => f.endsWith('.json'))) {
  const fx = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
  const input = fx.html ? { text: H.extract(fs.readFileSync(path.join(FIX, fx.html), 'utf8'), 'https://blog.example/').text } : { lines: fx.lines };
  const out = SUM.summarize({ ...input, recipe: recipe(fx.recipe), people: fx.people, lexicon, corpus: ['Our game is a cozy platformer with pixel art.', 'Tasks: fix bugs, add sounds, ship the demo.'] });
  const ev = SUM.evaluate(out, fx.reference);
  results.push({ id: fx.id, ...ev });
  ok(out.summary.length > 20, fx.id + ': has a summary');
  ok(out.points.length >= 2, fx.id + ': has points');
  if (fx.lines) ok(out.points.every(p => p.t === null || Number.isFinite(p.t)), fx.id + ': points keep timestamps');
  if ((fx.reference.decisions || []).length) ok(out.decisions.some(d => SUM.terms(d.text).some(w => SUM.terms(fx.reference.decisions[0]).includes(w))), fx.id + ': finds the decision');
  if (fx.id === 'meeting-boss') {
    ok(out.actions.some(a => /^Maya: record a creak sound/i.test(a.text)), 'owner from "I\'ll": ' + JSON.stringify(out.actions.map(a => a.text)));
    ok(out.actions.some(a => /^Sam: tune the boss health/i.test(a.text)), 'owner from "Sam will"');
    ok(out.actions.find(a => /creak/.test(a.text)).t === 33, 'action keeps its timestamp');
  }
  if (fx.id === 'article-pixel') ok(out.tags.includes('pixel art'), 'tags from sense keywords: ' + out.tags);
}
const avg = k => results.reduce((a, r) => a + r[k], 0) / results.length;
console.table(results);
ok(avg('recall') >= 0.45, 'average summary recall ' + avg('recall'));
ok(avg('actionRecall') >= 0.6, 'average action recall ' + avg('actionRecall'));

// ---------- keep / discard learning ----------
{
  const w0 = SUM.mergeWeights(null);
  const { weights: w1, changed } = SUM.learn(w0, [{ features: ['pos:late', 'key:because'], kept: false }, { features: ['pos:lead'], kept: true }]);
  ok(changed === 3 && w1.pos.late < w0.pos.late && w1.cue['key:because'] < 1 && w1.pos.lead > w0.pos.lead, 'weights move: ' + JSON.stringify(w1));
  let w = w0; for (let i = 0; i < 200; i++) w = SUM.learn(w, [{ features: ['pos:late'], kept: false }]).weights;
  ok(w.pos.late === 0.2, 'weights are clamped');
  // a scorer that learned to dislike "late" sentences picks fewer of them
  const fx = JSON.parse(fs.readFileSync(path.join(FIX, 'lecture-physics.json'), 'utf8'));
  const base = SUM.summarize({ lines: fx.lines, recipe: recipe('lecture') }), tuned = SUM.summarize({ lines: fx.lines, recipe: recipe('lecture'), weights: w });
  const late = o => o.summaryItems.filter(x => x.features.includes('pos:late')).length;
  ok(late(tuned) <= late(base), 'learned weights change the picks');
}

// ---------- parsers + helpers ----------
{
  const vtt = 'WEBVTT\nKind: captions\n\n00:00:01.000 --> 00:00:03.000\nwe decided the boss\n\n00:00:02.000 --> 00:00:04.000\nwe decided the boss\ngets two phases.\n\n00:01:10.500 --> 00:01:12.000\n<c>next</c> we add a checkpoint &amp; a flag.\n';
  const lines = CAP.parseVtt(vtt);
  ok(lines.length === 2 && lines[0].t === 1 && /two phases/.test(lines[0].text) && lines[1].t === 70 && lines[1].text === 'next we add a checkpoint & a flag.', 'vtt: ' + JSON.stringify(lines));
  const w = CAP.parseWhisperJson({ transcription: [{ offsets: { from: 1500, to: 3000 }, text: ' hello there' }, { offsets: { from: 4000 }, text: ' [BLANK_AUDIO]' }] }, 600);
  ok(w.length === 1 && w[0].t === 601.5 && w[0].text === 'hello there', 'whisper json + chunk offset');
  ok(CAP.normUrl('https://Example.com/a/?utm_source=x&id=2#top') === 'https://example.com/a?id=2', 'normUrl: ' + CAP.normUrl('https://Example.com/a/?utm_source=x&id=2#top'));
  ok(CAP.platformOf('https://www.youtube.com/shorts/abc').kind === 'short' && CAP.platformOf('https://www.tiktok.com/@a/video/1').id === 'tiktok' && CAP.platformOf('https://www.threads.com/@a/post/1').id === 'threads' && !CAP.platformOf('https://example.com'), 'platforms');
  ok(REC.validate({ title: 'Stand Up!', cues: { key: ['blocked', 42] }, sections: ['summary', 'evil'] }).sections.join() === 'summary', 'recipe validation');
  assert.throws(() => REC.validate({}), /name/); n++;
}
// ---------- huddle meeting notes become captures (huddlesum.toCapture -> captures.fromHuddle) ----------
{
  const os = require('node:os');
  const { Store } = require(path.join(root, 'server', 'store'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-cap-unit-')), st = new Store(dir);
  const sent = [];
  const P = { current: () => 'p1', defaultId: () => 'p1', inProject: (pid, fn) => fn(), channelOf: () => 'general' };
  const cap = CAP({ P, store: st, base: st, embeds: {}, packs: { ytdlp: () => null, whisper: () => null }, llm: {}, docs: { list: () => [], read: () => null }, dms: { isDm: () => false, canRead: () => true },
    perms: { can: () => false }, postChat: () => null, broadcast: m => sent.push(m), createTask: () => ({}), getMembers: () => [{ id: 'maya-1', name: 'Maya', role: 'builder' }, { id: 'sam-1', name: 'Sam', role: 'builder' }], nameOf: () => '' });
  const hs = require(path.join(root, 'server', 'huddlesum'))({ P: { get: () => ({}) }, brain: {}, postChat: () => null, nameOf: () => '' });
  hs.setSink(x => cap.fromHuddle(x));
  const t0 = Date.parse('2026-11-08T18:00:00Z');
  const c = hs.toCapture({ project: 'p1', started: new Date(t0).toISOString(), lines: [
    { at: new Date(t0 + 4000).toISOString(), name: 'Maya Lee', text: 'We decided the boss gets two phases.' },
    { at: new Date(t0 + 65000).toISOString(), name: 'Sam', text: 'Sam will tune the boss health tonight.' }] });
  ok(c && c.kind === 'voice' && c.site === 'Huddle' && c.recipe === 'meeting', 'huddle capture made');
  ok(c.transcript[0].t === 4 && c.transcript[0].who === 'Maya' && c.transcript[1].t === 65, 'huddle timestamps relative to the start');
  ok(c.decisions.some(d => /two phases/.test(d.text)) && c.actions.some(a => /^Sam: tune the boss health/.test(a.text)), 'huddle notes: decisions + actions');
  ok(fs.existsSync(st.p('files', 'captures', c.id + '.md')) && fs.existsSync(st.p('files', 'captures', c.id + '.json')), 'huddle capture files');
  ok(sent.some(m => m.type === 'capture' && m.id === c.id), 'broadcast');
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`captures_test: OK (${n} checks)`);
