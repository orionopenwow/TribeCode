// feat/captures: Captures, the link reader and voice notes (docs/LINK-READER.md). Drop a link or record a voice note and
// it becomes data the tribe can use: clean text or a timestamped transcript, a short summary, key points, action items,
// decisions and tags, saved as files/captures/<date>-<slug>.md + .json in the project, shown as a chat card and in
// Files › Captures, readable by Flint and every agent (MCP).
//
//   GET    /api/captures[?q=]                 list (DM captures only for that DM's two members)
//   POST   /api/captures {url, channel?, message?, recipe?, refresh?}     read a link (dedupes the same URL per project)
//   POST   /api/captures/voice {data, mime, dur, transcript?, lines?, recipe?, title?} | {channel, message}
//   GET    /api/captures/:id                  the whole capture
//   PATCH  /api/captures/:id {title, summary, points, actions, decisions, transcript, recipe}   edits are kept; deleting
//          or editing AI points teaches the scorer (.tribe/captures-weights.json)
//   DELETE /api/captures/:id
//   POST   /api/captures/:id/tasks {items:[i]}   people only (agents and spectators can't make tasks)
//   POST   /api/captures/:id/summarize {depth:'quick'|'model'}   quick = the deterministic scorer again, model = plain-words rewrite
//   POST   /api/captures/:id/transcribe       video captions (yt-dlp pack) or local whisper.cpp; host turns these on
//   POST   /api/captures/:id/doc              copy the notes into Docs (the doc editor)
//   GET    /api/captures/:id/thumb | /audio   the cached thumbnail (never SVG) / the voice note's audio
//   GET    /api/captures/ask?q=               "what did we decide about X": quotes with timestamps from captures + docs
//   GET    /api/captures/recipes  · POST /api/captures/recipes/:id/approve · DELETE /api/captures/recipes/:id
//   GET    /api/captures/weights  · DELETE /api/captures/weights (host/admin reset)
//   GET    /api/captures/settings · PATCH /api/captures/settings {auto, videoTools}   host only
// Safety: every fetch goes through server/embeds.js (SSRF checks, DNS pinning, redirect re-checks, size and time caps);
// extracted text is plain text (escaped when written as Markdown); thumbnails are PNG/JPEG/GIF/WebP/AVIF only; packs
// run with argument arrays only; DM captures stay inside the DM; agents can capture but never make tasks.
'use strict';
const DC = require('./diskcap');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const H = require('./capture-html');
const SUM = require('./capture-sum');
const RECIPES = require('./capture-recipes');

const DIR = 'files/captures';
const PAGE_CAP = 3 * 1024 * 1024, IMG_CAP = 5 * 1024 * 1024, AUDIO_CAP = 25 * 1024 * 1024;
const IMG_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };
const AUDIO_EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac', 'video/webm': 'webm' };
const pad = n => String(n).padStart(2, '0');
const day = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mmss = t => (Number.isFinite(t) && t !== null ? (t >= 3600 ? `${Math.floor(t / 3600)}:` : '') + `${pad(Math.floor(t / 60) % 60)}:${pad(Math.floor(t % 60))}` : '');
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const mdEsc = s => String(s || '').replace(/([\\`*_[\]<>|#])/g, '\\$1');
const rid = () => Math.random().toString(36).slice(2, 8);
const friendly = {
  'private address': 'That link points inside a private network, so I can\'t open it.',
  'only http and https links': 'I can only read http and https links.',
  'links with passwords are not previewed': 'That link has a password in it, so I left it alone.',
  'timed out': 'The site took too long to answer. Try again in a bit.',
  'could not find that site': 'I couldn\'t find that site. Check the link?',
  'could not reach that site': 'I couldn\'t reach that site right now.',
  'too many redirects': 'That link bounced around too many times.',
  'too big': 'That file is too big to read here.',
  'not a link': 'That doesn\'t look like a link.',
  'link too long': 'That link is too long.',
};
const say = e => { const m = String((e && e.message) || e || ''); if (friendly[m]) return friendly[m]; if (/^the site answered (401|402|403)/.test(m)) return 'That page is private or needs a login, so I only kept the link.'; if (/^the site answered 404/.test(m)) return 'That page wasn\'t found (404).'; if (/^the site answered 429/.test(m)) return 'That site asked us to slow down. Try again later.'; if (/^the site answered 5/.test(m)) return 'That site is having trouble right now.'; return m || 'Something went wrong reading that.'; };

// Known video/social hosts: oEmbed first (official, public), yt-dlp only when the host turned it on.
function platformOf(u) {
  let x; try { x = new URL(u); } catch { return null; }
  const h = x.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  if (h === 'youtu.be' || h === 'youtube.com' || h === 'music.youtube.com') return { id: 'youtube', kind: /^\/shorts\//.test(x.pathname) ? 'short' : 'video', site: 'YouTube' };
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return { id: 'tiktok', kind: 'short', site: 'TikTok' };
  if (h === 'instagram.com') return { id: 'instagram', kind: /^\/(reel|reels|tv)\//.test(x.pathname) ? 'short' : 'post', site: 'Instagram' };
  if (h === 'threads.net' || h === 'threads.com') return { id: 'threads', kind: 'post', site: 'Threads' };
  if (h === 'facebook.com' || h === 'fb.watch' || h === 'fb.com') return { id: 'facebook', kind: /\/(videos|watch|reel)\b/.test(x.pathname) || h === 'fb.watch' ? 'video' : 'post', site: 'Facebook' };
  if (h === 'vimeo.com') return { id: 'vimeo', kind: 'video', site: 'Vimeo' };
  return null;
}
// Official oEmbed endpoints (Meta's are tokenless since June 2026 for public posts, 1,000 calls/hour/endpoint).
const OEMBED = {
  youtube: u => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  tiktok: u => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
  instagram: u => `https://graph.facebook.com/v25.0/instagram_oembed?url=${encodeURIComponent(u)}`,
  threads: u => `https://graph.threads.net/v1.0/oembed?url=${encodeURIComponent(u)}`,
  facebook: u => (/\/(videos|watch|reel)\b|fb\.watch/.test(u) ? `https://graph.facebook.com/v26.0/oembed_video?url=${encodeURIComponent(u)}` : `https://graph.facebook.com/v26.0/oembed_post?url=${encodeURIComponent(u)}`),
  vimeo: u => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`,
};
const YTDLP_HOSTS = ['youtube', 'tiktok', 'instagram', 'facebook', 'vimeo', 'threads'];

// Strip tracking bits so the same article dedupes: utm_*, fbclid, gclid, si, igsh…, the #fragment, a trailing slash.
function normUrl(u) {
  try {
    const x = new URL(u); x.hash = ''; x.hostname = x.hostname.toLowerCase();
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|igsh|igshid|si$|ref$|ref_src|s$|feature$)/i.test(k)) x.searchParams.delete(k);
    if (x.pathname.length > 1 && x.pathname.endsWith('/')) x.pathname = x.pathname.replace(/\/+$/, '');
    return x.href;
  } catch { return String(u || ''); }
}

// WebVTT (yt-dlp captions) -> [{ t, text }], merging the rolling duplicates of auto captions.
function parseVtt(vtt) {
  const out = []; let t = null;
  for (const raw of String(vtt || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const tm = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})\s+-->/.exec(line);
    if (tm) { t = (Number(tm[1] || 0) * 3600) + Number(tm[2]) * 60 + Number(tm[3]); continue; }
    if (!line || /^(WEBVTT|Kind:|Language:|NOTE|STYLE)/.test(line) || /^\d+$/.test(line) || t === null) continue;
    const text = H.decodeEntities(line.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim(); if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && (prev.text === text || prev.text.endsWith(text))) continue;
    if (prev && text.startsWith(prev.text)) { prev.text = text; continue; }
    out.push({ t, text });
  }
  // join short caption fragments into sentence-ish lines (about 20 seconds each)
  const merged = [];
  for (const l of out) { const m = merged[merged.length - 1]; if (m && l.t - m.t < 20 && !/[.!?]$/.test(m.text) && m.text.length < 220) m.text += ' ' + l.text; else merged.push({ ...l }); }
  return merged;
}
// whisper.cpp -oj output -> [{ t, text }]
function parseWhisperJson(j, offset = 0) {
  const segs = (j && (j.transcription || j.segments)) || [];
  return segs.map(s => ({ t: Math.round(((s.offsets ? s.offsets.from : (s.start || 0) * 1000) / 1000 + offset) * 10) / 10, text: String(s.text || '').replace(/\s+/g, ' ').trim() })).filter(s => s.text && !/^\[(BLANK_AUDIO|MUSIC|Music)\]$/.test(s.text));
}

module.exports = function captures({ P, store, base, embeds, packs, llm, docs, dms, perms, postChat, broadcast, sendTo = () => {}, createTask, getMembers, nameOf, sense = () => null, log = () => {}, id: mkId }) {
  const TEST = process.env.TRIBE_TEST === '1';
  const OE_TEST = TEST ? String(process.env.TRIBE_TEST_OEMBED || '').replace(/\/+$/, '') : '';
  const SETTINGS = '.tribe/captures-settings.json', WEIGHTS = '.tribe/captures-weights.json';
  const settings = () => Object.assign({ auto: true, videoTools: false }, base.readJSON(SETTINGS, {}) || {});
  const weights = () => (base.readJSON(WEIGHTS, null) || { weights: SUM.DEFAULT_WEIGHTS, signals: 0 });
  const isHuman = me => me && me.role !== 'agent';
  const isHostish = me => me && (me.role === 'host' || me.role === 'admin');
  const canWrite = me => me && me.role !== 'spectator';
  const people = () => getMembers().filter(m => m.role !== 'agent').map(m => m.name.split(/\s+/)[0]).filter(Boolean);
  const lexicon = () => { const S = require('./sense'); return [...(S.TAG_WORDS || []).map(([t, re]) => [t, re]), ...(S.KIND_WORDS || []).map(([k, re]) => [k, re])]; };   // feat/captures: sense.js keywords
  const projectId = () => P.current() || P.defaultId();

  // ---------- storage ----------
  const rel = (cid, ext) => `${DIR}/${cid}.${ext}`;
  const okId = s => /^[a-z0-9][a-z0-9-]{0,90}$/.test(String(s || ''));
  function read(cid) { if (!okId(cid)) return null; return store.readJSON(rel(cid, 'json'), null); }
  function listAll() {
    let names = []; try { names = fs.readdirSync(store.p(DIR)).filter(f => f.endsWith('.json')); } catch { return []; }
    return names.map(f => store.readJSON(`${DIR}/${f}`, null)).filter(c => c && c.id).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  }
  const visible = (c, me) => !!c && (!c.dm || (me && dms.canRead(c.dm, me)));
  function uniqueId(title) {
    const s = (String(title || 'capture').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)) || 'capture';
    let cid = `${day()}-${s}`, n = 2; while (fs.existsSync(store.p(rel(cid, 'json')))) cid = `${day()}-${s}-${n++}`;
    return cid;
  }
  function markdown(c) {
    const lines = [`# ${mdEsc(c.title || 'Capture')}`, ''];
    lines.push(`${c.kind === 'voice' ? '🎙️ Voice note' : '📎 ' + mdEsc(c.site || 'Link')}${c.url ? ` · <${String(c.url).replace(/[<>\s]/g, encodeURIComponent)}>` : ''}${c.author ? ` · ${mdEsc(c.author)}` : ''}${c.published ? ` · ${mdEsc(c.published)}` : ''}`, '');
    if (c.note) lines.push(`> ${mdEsc(c.note)}`, '');
    const sec = s => !c.sections || c.sections.includes(s);
    if (c.summary && sec('summary')) lines.push('## Summary', '', mdEsc(c.summary), '');
    if ((c.points || []).length && sec('points')) lines.push('## Key points', '', ...c.points.map(p => `- ${p.t !== null && p.t !== undefined ? `[${mmss(p.t)}] ` : ''}${mdEsc(p.text)}`), '');
    if ((c.actions || []).length && sec('actions')) lines.push('## Action items', '', ...c.actions.map(a => `- [${a.task ? 'x' : ' '}] ${mdEsc(a.text)}`), '');
    if ((c.decisions || []).length) lines.push('## Decisions', '', ...c.decisions.map(d => `- ${d.t !== null && d.t !== undefined ? `[${mmss(d.t)}] ` : ''}${mdEsc(d.text)}`), '');
    if ((c.transcript || []).length) lines.push('## Full transcript', '', ...c.transcript.map(l => `${l.t !== null && l.t !== undefined ? `[${mmss(l.t)}] ` : ''}${l.who ? `**${mdEsc(l.who)}:** ` : ''}${mdEsc(l.text)}`), '');
    else if (c.text) lines.push('## Article', '', ...String(c.text).split(/\n\s*\n/).map(p => (/^#{2,4}\s/.test(p) ? p.replace(/^(#+\s*)(.*)$/, (a, h, t) => h + mdEsc(t)) : /^- /.test(p) ? '- ' + mdEsc(p.slice(2)) : mdEsc(p)) + '\n'), '');
    return lines.join('\n');
  }
  function save(c) {
    c.updated = new Date().toISOString();
    fs.mkdirSync(store.p(DIR), { recursive: true });
    store.writeJSON(rel(c.id, 'json'), c);
    const { transcript, text, points, actions, decisions, summaryItems, ...meta } = c;
    store.writeMd(rel(c.id, 'md'), { id: c.id, source: c.url || (/^offload:/.test(c.source || '') ? c.source : c.kind === 'voice' ? 'voice note' : ''), kind: c.kind, title: c.title, author: c.author || '', published: c.published || '', duration: c.duration || null, thumbnail: c.thumbnail || null, tags: c.tags || [], created: c.created, by: c.byName || '' }, markdown(c));
    notify({ type: 'capture', project: c.project, id: c.id, status: c.status }, c);
    return c;
  }
  const light = c => ({ id: c.id, title: c.title, kind: c.kind, site: c.site, url: c.url || '', author: c.author || '', created: c.created, updated: c.updated, status: c.status, note: c.note || '', tags: c.tags || [],
    thumb: !!c.thumbnail, summary: clip(c.summary, 280), actions: (c.actions || []).length, recipe: c.recipe, by: c.by, byName: c.byName, dm: !!c.dm, duration: c.duration || null, words: c.words || 0 });
  const card = c => ({ id: c.id, title: c.title, kind: c.kind, site: c.site, url: c.url || '', thumb: !!c.thumbnail, summary: clip(c.summary || c.description || '', 280), actions: (c.actions || []).length, status: c.status, note: c.note || '', emoji: c.kind === 'voice' ? '🎙️' : '📎' });

  // A DM capture's updates reach only that DM's members; everything else goes to the project.
  function notify(msg, c) { if (c.dm) { for (const m of getMembers()) if (dms.canRead(c.dm, m)) sendTo(m.id, { ...msg, dm: true }); } else broadcast(msg); }

  // ---------- recipes ----------
  function customRecipes(sub = '') {
    const dir = base.p('.tribe', 'recipes', sub); let out = [];
    try { out = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => { try { return { ...RECIPES.validate(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))), file: f }; } catch { return null; } }).filter(Boolean); } catch {}
    return out;
  }
  function recipes() {
    const own = customRecipes();
    const merged = RECIPES.BUILTIN.map(r => own.find(x => x.id === r.id) ? { ...r, ...own.find(x => x.id === r.id), builtin: true, custom: true } : r);
    for (const r of own) if (!merged.some(x => x.id === r.id)) merged.push({ ...r, custom: true });
    return merged.map(r => ({ ...r, cues: { ...RECIPES.COMMON, ...Object.fromEntries(Object.entries(r.cues || {}).filter(([, v]) => v && v.length)) } }));
  }
  const recipeFor = (wanted, kind) => { const all = recipes(); return all.find(r => r.id === wanted) || all.find(r => (r.kinds || []).includes(kind)) || all[0]; };

  // ---------- summarizing ----------
  function corpus() { try { return docs.list().slice(0, 60).map(d => (docs.read(d.slug) || {}).body || '').filter(Boolean).flatMap(b => b.split(/\n\s*\n/)).slice(0, 400); } catch { return []; } }
  function fill(c, { keepEdits = true } = {}) {
    const r = recipeFor(c.recipe, c.kind); c.recipe = r.id; c.sections = r.sections;
    const input = (c.transcript || []).length ? { lines: c.transcript } : { text: c.text || c.description || '' };
    if (!(input.lines || input.text)) return c;
    const out = SUM.summarize({ ...input, recipe: r, corpus: corpus(), people: people(), weights: weights().weights, lexicon: lexicon() });
    const ed = c.edited || {};
    if (!keepEdits || !ed.summary) { c.summary = out.summary; c.summaryItems = out.summaryItems; }
    const withIds = list => list.map(x => ({ id: rid(), ...x }));
    if (!keepEdits || !ed.points) c.points = withIds(out.points);
    if (!keepEdits || !ed.actions) c.actions = withIds(out.actions);
    if (!keepEdits || !ed.decisions) c.decisions = withIds(out.decisions);
    if (!keepEdits || !ed.tags) c.tags = out.tags.length ? out.tags : (c.tags || []);
    c.keywords = out.keywords; c.via = 'TribeCode (quick summary, no AI)';
    return c;
  }

  // ---------- fetching (through embeds.safeGet, with retries) ----------
  async function get(url, cap, accept, opts = {}) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 300 * 3 ** (attempt - 1)));
      try { return await embeds.safeGet(url, cap, accept, { timeout: opts.timeout || 8000, truncate: !!opts.truncate, ua: 'TribeCodeLinkReader/1.0 (+https://github.com/orionopenwow/TribeCode)' }); }
      catch (e) { lastErr = e; if (!/timed out|could not reach|answered 5\d\d|answered 429/.test(e.message || '')) break; }
    }
    throw lastErr;
  }
  async function thumbnail(c, url) {
    if (!url) return;
    try {
      const r = await get(url, IMG_CAP, 'image/avif,image/webp,image/png,image/gif,image/jpeg;q=0.9', { timeout: 6000 });
      const type = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase(), ext = IMG_TYPES[type];
      if (!ext || !sniff(r.body, ext)) return;   // never SVG, never a mislabeled file
      fs.mkdirSync(store.p(DIR, 'thumbs'), { recursive: true });
      const name = `${c.id}.${ext}`; fs.writeFileSync(store.p(DIR, 'thumbs', name), r.body); c.thumbnail = name;
      DC.prune(store.p(DIR, 'thumbs'), { keep: name, maxCount: DC.envNum('TRIBE_CAPTURE_THUMBS_MAX', 2000), maxBytes: DC.envNum('TRIBE_CAPTURE_THUMBS_MB', 200) * 1048576 });   // harden: a cache of the page's picture; an old one just shows no picture
    } catch {}
  }
  function sniff(b, ext) {
    if (!b || b.length < 12) return false;
    if (ext === 'png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    if (ext === 'jpg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (ext === 'gif') return b.slice(0, 4).toString('latin1') === 'GIF8';
    if (ext === 'webp') return b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP';
    if (ext === 'avif') return b.slice(4, 12).toString('latin1').startsWith('ftyp');
    return false;
  }
  async function oembed(u, plat) {
    const make = OEMBED[plat.id]; if (!make) return null;
    const endpoint = OE_TEST ? `${OE_TEST}/oembed/${plat.id}?url=${encodeURIComponent(u)}` : make(u);
    try {
      const r = await get(endpoint, 256 * 1024, 'application/json', { timeout: 6000 });
      const j = JSON.parse(H.decodeBody(r.body, r.headers['content-type']));
      if (!j || typeof j !== 'object') return null;
      // Meta returns only embed HTML: read its caption as text, never render it.
      const htmlText = j.html ? H.squash(H.textOf(H.parse(String(j.html).slice(0, 100000)))) : '';
      return { title: H.squash(j.title || '').slice(0, 200), author: H.squash(j.author_name || '').slice(0, 120), thumb: /^https?:\/\//.test(j.thumbnail_url || '') ? String(j.thumbnail_url) : '', caption: htmlText.slice(0, 4000), duration: Number(j.duration) || null, provider: H.squash(j.provider_name || plat.site) };
    } catch { return null; }
  }
  async function readPage(c, url) {
    const r = await get(url, PAGE_CAP, 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,image/*;q=0.5', { truncate: true, timeout: 9000 });
    c.url = r.url && r.url !== url ? r.url : url;
    const type = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const robotsHdr = String(r.headers['x-robots-tag'] || '').toLowerCase();
    if (r.body.length >= PAGE_CAP) c.truncated = true;
    if (IMG_TYPES[type]) { c.kind = 'image'; c.title = c.title || decodeURIComponent(new URL(c.url).pathname.split('/').pop() || 'Picture').slice(0, 120); await thumbnail(c, c.url); c.status = 'metadata'; c.note = 'A picture: saved the link and a small copy.'; return; }
    if (type === 'text/plain') { c.text = H.decodeBody(r.body, r.headers['content-type']).slice(0, 400000); c.title = c.title || clip(c.text.split('\n').find(Boolean) || 'Text', 90); c.kind = 'article'; return; }
    if (!/^(text\/html|application\/xhtml\+xml)$/.test(type)) { c.status = 'metadata'; c.note = type === 'application/pdf' ? 'PDFs aren\'t read yet, so I saved the link.' : 'That\'s not a web page, so I saved the link.'; c.title = c.title || c.url; return; }
    const html = H.decodeBody(r.body, r.headers['content-type']);
    const x = H.extract(html, c.url);
    Object.assign(c, { title: c.title || x.title || c.url, author: c.author || x.author, published: c.published || x.published, site: c.site || x.site, lang: x.lang, description: x.description });
    const robots = `${x.robots} ${robotsHdr}`;
    if (/\b(noarchive|noai|none)\b/.test(robots)) { c.status = 'metadata'; c.note = 'This site asks not to be saved, so I kept only the title, a short description and the link.'; }
    else if (x.paywalled) { c.status = 'metadata'; c.note = 'This page looks like it\'s behind a paywall, so I kept only the title, a short description and the link.'; }
    else { c.text = x.text; c.words = x.words; if (!c.kind || c.kind === 'page') c.kind = 'article'; if (c.truncated) c.note = 'That page is very long, so I read the first part.'; }
    if (!c.thumbnail) await thumbnail(c, x.image);
  }

  // ---------- limits ----------
  const recent = new Map();
  function tooFast(me) {
    const now = Date.now(), win = 5 * 60_000, max = me.role === 'agent' ? 12 : 30;
    const h = (recent.get(me.id) || []).filter(t => now - t < win); if (h.length >= max) { recent.set(me.id, h); return true; }
    h.push(now); recent.set(me.id, h); return false;
  }
  setInterval(() => { const now = Date.now(); for (const [k, h] of recent) if (!h.some(t => now - t < 300_000)) recent.delete(k); }, 60_000).unref();
  const inflight = new Map();   // project|url -> promise (two people pasting the same link at once)

  // ---------- capture a link ----------
  async function captureLink(me, raw, { channel = null, message = null, recipe = '', refresh = false } = {}) {
    const url = String(raw || '').trim();
    let u; try { u = new URL(url); } catch { throw Object.assign(new Error('That doesn\'t look like a link.'), { status: 400 }); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw Object.assign(new Error('I can only read http and https links.'), { status: 400 });
    if (url.length > 2048) throw Object.assign(new Error('That link is too long.'), { status: 400 });
    const dm = channel && dms.isDm(channel) ? channel : null;
    const key = normUrl(url);
    const pid = projectId();
    const existing = !refresh && listAll().find(c => c.key === key && (c.dm || null) === dm && c.status !== 'error');
    if (existing) return { capture: existing, duplicate: true };
    const fk = `${pid}|${dm || ''}|${key}`;
    if (inflight.has(fk)) return inflight.get(fk);
    if (tooFast(me)) throw Object.assign(new Error('That\'s a lot of links at once. Give it a few minutes.'), { status: 429 });
    const job = (async () => {
      const plat = platformOf(url);
      const c = { id: uniqueId(u.hostname.replace(/^www\./, '') + ' ' + (u.pathname.split('/').filter(Boolean).pop() || '')), key, url, source: url, kind: plat ? plat.kind : 'page', site: plat ? plat.site : u.hostname.replace(/^www\./, ''),
        title: '', author: '', published: '', duration: null, thumbnail: null, transcript: [], text: '', summary: '', points: [], actions: [], decisions: [], tags: [],
        recipe: recipe || '', project: pid, dm, links: channel ? { channel, message } : null, by: me.id, byName: me.name, created: new Date().toISOString(), status: 'ready', note: '', edited: {} };
      try {
        if (plat) {
          const oe = await oembed(url, plat);
          if (oe) { Object.assign(c, { title: oe.title || oe.caption.slice(0, 120), author: oe.author, duration: oe.duration }); if (oe.caption && !oe.title) c.description = oe.caption; if (oe.thumb) await thumbnail(c, oe.thumb); if (oe.caption) c.text = oe.caption; }
          else if (!OE_TEST) { try { await readPage(c, url); } catch {} c.kind = plat.kind; c.text = ''; }   // page metadata through the safe fetcher; a video page's HTML is not an article
          c.status = 'metadata';
          c.note = settings().videoTools && packs.ytdlp() && YTDLP_HOSTS.includes(plat.id) ? 'Getting the captions…' : `Only the title and picture are public. ${packs.ytdlp() ? 'The host can turn on video captions in Captures.' : 'Paste the transcript, or the host can add the optional captions tool.'}`;
          if (c.text) { c.status = 'ready'; if (!/Getting the captions/.test(c.note)) c.note = ''; }
        } else await readPage(c, url);
      } catch (e) {
        c.status = 'error'; c.note = say(e); c.title = c.title || url; c.blocked = !!e.blocked;
        if (e.blocked && /private address/.test(e.message)) c.private = true;
      }
      if (!c.title) c.title = c.url;
      // a private-network link is never written to disk; an error is returned but not kept
      if (c.status === 'error') return { capture: c, error: c.note };
      c.id = uniqueId(c.title); if (c.thumbnail) { const ext = path.extname(c.thumbnail); const to = `${c.id}${ext}`; try { fs.renameSync(store.p(DIR, 'thumbs', c.thumbnail), store.p(DIR, 'thumbs', to)); c.thumbnail = to; } catch {} }
      fill(c);
      save(c);
      if (plat && settings().videoTools && packs.ytdlp() && YTDLP_HOSTS.includes(plat.id)) P.inProject(pid, () => transcribeVideo(c.id).catch(e => log('captures: video ' + e.message)));
      return { capture: c };
    })();
    inflight.set(fk, job);
    try { return await job; } finally { inflight.delete(fk); }
  }

  // ---------- video transcripts (optional packs) ----------
  async function tmpdir() { return fs.promises.mkdtemp(path.join(os.tmpdir(), 'tc-cap-')); }
  async function transcribeVideo(cid) {
    const c = read(cid); if (!c || !c.url) return null;
    const plat = platformOf(c.url); if (!plat || !YTDLP_HOSTS.includes(plat.id)) throw Object.assign(new Error('Only video links can get captions.'), { status: 400 });
    const yt = packs.ytdlp(); if (!yt) throw Object.assign(new Error('The captions tool isn\'t installed. The host can add it in Settings › Packs.'), { status: 400 });
    if (!settings().videoTools) throw Object.assign(new Error('The host hasn\'t turned on video captions yet.'), { status: 400 });
    // yt-dlp fetches the page itself: only known public video sites, checked like every other fetch.
    const tmp = await tmpdir(); const common = ['--ignore-config', '--no-cookies', '--no-playlist', '--no-warnings', '--no-progress', '--socket-timeout', '20'];
    c.status = 'working'; c.note = 'Getting the captions…'; save(c);
    try {
      let lines = [];
      try {
        await packs.run(yt, [...common, '--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,en,.*-orig', '--sub-format', 'vtt', '-o', path.join(tmp, 'cap.%(ext)s'), '--', c.url], { timeout: 90_000, cwd: tmp });
        const vtt = fs.readdirSync(tmp).filter(f => f.endsWith('.vtt')).sort((a, b) => (/\.en\./.test(b) - /\.en\./.test(a)))[0];
        if (vtt) lines = parseVtt(fs.readFileSync(path.join(tmp, vtt), 'utf8'));
      } catch (e) { if (/private|sign in|login|members-only|age|unavailable|paywall|premium/i.test(e.message + e.stderr)) throw Object.assign(new Error('This video is private or needs a login, so I only kept the link.'), { status: 400 }); }
      let via = 'published captions';
      if (!lines.length && packs.whisper()) {
        c.note = 'No captions, transcribing the audio on the host…'; save(c);
        await packs.run(yt, [...common, '-f', 'bestaudio[filesize<200M]/bestaudio/best', '--max-filesize', '200M', '-o', path.join(tmp, 'audio.%(ext)s'), '--', c.url], { timeout: 300_000, cwd: tmp });
        const audio = fs.readdirSync(tmp).find(f => /^audio\./.test(f));
        if (audio) { lines = await whisperFile(path.join(tmp, audio), tmp); via = 'local transcript (whisper.cpp)'; }
      }
      const fresh = read(cid) || c;
      if (!lines.length) { fresh.status = 'metadata'; fresh.note = packs.whisper() ? 'This video has no captions and no audio I could read.' : 'This video has no published captions. Add the local transcripts pack, or paste the transcript.'; save(fresh); return fresh; }
      fresh.transcript = lines; fresh.transcriptVia = via; fresh.status = 'ready'; fresh.note = ''; fresh.duration = fresh.duration || Math.round(lines[lines.length - 1].t || 0) || null;
      fill(fresh); save(fresh); return fresh;
    } catch (e) {
      const fresh = read(cid) || c; fresh.status = 'metadata'; fresh.note = e.status ? e.message : `Couldn't get the captions: ${clip(e.message, 140)}`; save(fresh); throw e;
    } finally { fs.rm(tmp, { recursive: true, force: true }, () => {}); }
  }
  // whisper.cpp on one file: convert to 16 kHz WAV and split into 10-minute chunks when ffmpeg is there, then merge
  // the chunks' timestamped segments.
  async function whisperFile(file, tmp) {
    const W = packs.whisper(); if (!W) throw new Error('local transcripts aren\'t installed');
    const ff = packs.ffmpeg(); let chunks = [{ file, offset: 0 }];
    if (ff) {
      const wav = path.join(tmp, 'in.wav');
      await packs.run(ff, ['-nostdin', '-y', '-loglevel', 'error', '-i', file, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { timeout: 300_000 });
      await packs.run(ff, ['-nostdin', '-y', '-loglevel', 'error', '-i', wav, '-f', 'segment', '-segment_time', '600', '-c', 'copy', path.join(tmp, 'chunk%03d.wav')], { timeout: 300_000 });
      const parts = fs.readdirSync(tmp).filter(f => /^chunk\d+\.wav$/.test(f)).sort();
      chunks = (parts.length ? parts : ['in.wav']).map((f, i) => ({ file: path.join(tmp, f), offset: parts.length ? i * 600 : 0 }));
    }
    const out = [];
    for (const [i, ch] of chunks.entries()) {
      const ob = path.join(tmp, `whisper-${i}`);
      await packs.run(W.engine, ['-m', W.model, '-f', ch.file, '-oj', '-of', ob, '-np', '-l', /tiny\.en|base\.en/.test(W.model) ? 'en' : 'auto'], { timeout: 900_000, cwd: tmp });
      let j = null; try { j = JSON.parse(fs.readFileSync(ob + '.json', 'utf8')); } catch {}
      out.push(...parseWhisperJson(j, ch.offset));
    }
    return out;
  }

  // ---------- voice notes ----------
  async function captureVoice(me, body) {
    const pid = projectId();
    let audio = null, mime = '', lines = [], channel = body.channel ? String(body.channel) : null, browserText = '', dur = Math.max(0, Math.min(Number(body.dur) || 0, 4 * 3600)), message = null;
    if (channel === 'general') channel = P.channelOf(pid);
    if (channel && dms.isDm(channel) && !dms.canRead(channel, me)) throw Object.assign(new Error('This conversation is private.'), { status: 403 });
    if (body.message && channel) {   // a voice note already in chat
      const m = store.findJSONL(`chat/${channel}.jsonl`, x => x.id === body.message, `"id":${JSON.stringify(String(body.message))}`);
      if (!m || !m.media || m.media.kind !== 'voice') throw Object.assign(new Error('I couldn\'t find that voice note.'), { status: 404 });
      try { audio = fs.readFileSync(store.p('chat', 'media', path.basename(m.media.file))); mime = m.media.mime || 'audio/webm'; } catch {}
      browserText = String(m.text || ''); dur = m.media.dur || dur; message = m.id;
    } else if (body.data) {
      mime = String(body.mime || '').split(';')[0].trim().toLowerCase();
      if (!AUDIO_EXT[mime]) throw Object.assign(new Error('That audio type isn\'t supported.'), { status: 415 });
      audio = Buffer.from(String(body.data).replace(/^data:[^,]*,/, ''), 'base64');
      if (audio.length > AUDIO_CAP) throw Object.assign(new Error('That recording is too long (25 MB max).'), { status: 413 });
      if (!audio.length) audio = null;
    }
    if (Array.isArray(body.lines)) lines = body.lines.slice(0, 5000).map(l => ({ t: Number.isFinite(Number(l.t)) ? Math.max(0, Number(l.t)) : null, text: String(l.text || '').replace(/\s+/g, ' ').trim().slice(0, 2000), ...(l.who ? { who: String(l.who).slice(0, 40) } : {}) })).filter(l => l.text);
    browserText = browserText || String(body.transcript || '').slice(0, 100000);
    if (!lines.length && browserText.trim()) lines = browserText.split(/(?<=[.!?])\s+|\n+/).map(t => t.trim()).filter(Boolean).map(text => ({ t: null, text }));
    const r = recipeFor(String(body.recipe || 'voice'), 'voice');
    const title = String(body.title || '').trim().slice(0, 120) || `${r.id === 'voice' ? 'Voice note' : r.title} · ${me.name} · ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    const off = /^offload:[a-z0-9-]{1,30}$/.test(String(body.source || '')) ? String(body.source) : null;   // v0.27 company: a result brought back from a free AI tool (server/academy.js)
    const c = { id: uniqueId(title), key: null, url: '', source: off || 'voice note', kind: off ? 'note' : 'voice', site: off ? 'Offload' : 'Voice note', title, author: me.name, published: new Date().toISOString(), duration: dur || null, thumbnail: null,
      transcript: lines, text: '', summary: '', points: [], actions: [], decisions: [], tags: [], recipe: r.id, project: pid, dm: channel && dms.isDm(channel) ? channel : null,
      links: channel ? { channel, message } : null, by: me.id, byName: me.name, created: new Date().toISOString(), status: 'ready', note: '', edited: {}, transcriptVia: off ? 'pasted' : lines.length ? 'your browser' : '', ...(off ? { tags: ['offload'] } : {}) };
    if (audio) { const AMB = DC.envNum('TRIBE_CAPTURE_AUDIO_MB', 2048); if (DC.usage(store.p(DIR, 'audio')).bytes + audio.length > AMB * 1048576) throw Object.assign(new Error(`Voice notes are full (${AMB} MB for the tribe). Delete a few old voice captures, then try again.`), { status: 507 }); }   // harden: voice notes are people's work, so they are never removed for space: new ones wait
    if (audio) { fs.mkdirSync(store.p(DIR, 'audio'), { recursive: true }); c.audio = `${c.id}.${AUDIO_EXT[mime] || 'webm'}`; fs.writeFileSync(store.p(DIR, 'audio', c.audio), audio); c.audioMime = mime; }
    const whisper = audio && packs.whisper();
    if (whisper) { c.status = 'working'; c.note = 'Transcribing on the host…'; }
    else if (!lines.length) { c.status = 'needs-transcript'; c.note = 'Transcript unavailable — type or paste it below.'; }
    if (lines.length) fill(c);
    save(c);
    if (whisper) P.inProject(pid, () => transcribeVoice(c.id).catch(e => log('captures: whisper ' + e.message)));
    return { capture: c };
  }
  async function transcribeVoice(cid) {
    const c = read(cid); if (!c || !c.audio) return null;
    const tmp = await tmpdir();
    try {
      const lines = await whisperFile(store.p(DIR, 'audio', c.audio), tmp);
      const fresh = read(cid) || c;
      if (lines.length) { fresh.transcript = lines.map(l => ({ ...l, ...(fresh.byName ? { who: fresh.byName.split(/\s+/)[0] } : {}) })); fresh.transcriptVia = 'local transcript (whisper.cpp)'; fresh.status = 'ready'; fresh.note = ''; fill(fresh); }
      else if (!(fresh.transcript || []).length) { fresh.status = 'needs-transcript'; fresh.note = 'Transcript unavailable — type or paste it below.'; }
      else { fresh.status = 'ready'; fresh.note = ''; }
      save(fresh); return fresh;
    } catch (e) {
      const fresh = read(cid) || c; fresh.status = (fresh.transcript || []).length ? 'ready' : 'needs-transcript';
      fresh.note = (fresh.transcript || []).length ? 'Kept your browser\'s transcript (the local one failed).' : 'Transcript unavailable — type or paste it below.'; save(fresh); throw e;
    } finally { fs.rm(tmp, { recursive: true, force: true }, () => {}); }
  }

  // ---------- huddle meeting notes in the same format (server/huddlesum.js → voice.js) ----------
  function fromHuddle({ project, started, lines, summary, docTitle }) {
    if (!lines || !lines.length) return null;
    return P.inProject(project || projectId(), () => {
      const t0 = Date.parse(started) || Date.parse(lines[0].at) || Date.now();
      const title = `Huddle · ${new Date(t0).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
      const c = { id: uniqueId(title), key: null, url: '', source: 'huddle', kind: 'voice', site: 'Huddle', title, author: [...new Set(lines.map(l => l.name))].join(', '), published: new Date(t0).toISOString(),
        duration: Math.max(1, Math.round((Date.parse(lines[lines.length - 1].at) - t0) / 1000)) || null, thumbnail: null,
        transcript: lines.map(l => ({ t: Math.max(0, Math.round((Date.parse(l.at) - t0) / 1000)), who: String(l.name || '').split(/\s+/)[0], text: String(l.text || '') })),
        recipe: 'meeting', project: project || projectId(), dm: null, links: docTitle ? { doc: docTitle } : null, by: 'tribecode', byName: 'Huddle', created: new Date().toISOString(), status: 'ready', note: '', edited: {}, transcriptVia: 'huddle captions' };
      fill(c);
      if (summary && summary.summary && /model|AI/.test(summary.by || '')) { c.summary = String(summary.summary).replace(/^- /gm, '').replace(/\n/g, ' '); c.via = summary.by; }
      return save(c);
    });
  }

  // ---------- chat ----------
  function postCard(c, channel, again) {
    try { return postChat(channel, 'tribecode', `${c.kind === 'voice' ? '🎙️' : '📎'} **${mdEsc(c.title)}**${again ? ' (already saved)' : ''}`, { capture: card(c) }); } catch (e) { log('captures: card ' + e.message); return null; }
  }
  const BARE = /^https?:\/\/[^\s<>"'`]+$/i, IMG = /\.(png|jpe?g|gif|webp|avif|svg)(\?[^#]*)?(#.*)?$/i;
  function onChat(channel, me, text, msg) {
    if (!settings().auto || !me || me.role === 'spectator' || me.role === 'agent') return;
    const t = String(text || '').trim();
    if (!BARE.test(t) || IMG.test(t) || /giphy\.com|tenor\.com/i.test(t)) return;
    const pid = projectId();
    P.inProject(pid, () => captureLink(me, t, { channel, message: msg && msg.id })).then(r => {
      if (r && r.capture && !r.error) P.inProject(pid, () => postCard(r.capture, channel, r.duplicate));
    }).catch(e => log('captures: auto ' + e.message));
  }

  // ---------- keep / discard ----------
  function learnFrom(prev, next) {
    const signals = [];
    for (const k of ['points', 'actions', 'decisions']) {
      if (!Array.isArray(next[k])) continue;
      const after = new Map(next[k].filter(x => x && x.id).map(x => [x.id, x]));
      for (const p of prev[k] || []) {
        if (!p.features || !p.features.length || p.human) continue;
        const n = after.get(p.id);
        if (!n) signals.push({ features: p.features, kept: false });
        else signals.push({ features: p.features, kept: true, edited: String(n.text || '').trim() !== String(p.text || '').trim() });
      }
    }
    if (!signals.length || !signals.some(s => !s.kept || s.edited)) return 0;   // nothing deleted or edited: no news
    const cur = weights(), r = SUM.learn(cur.weights, signals);
    base.writeJSON(WEIGHTS, { weights: r.weights, signals: (cur.signals || 0) + signals.length, updated: new Date().toISOString() });
    return signals.length;
  }

  // ---------- model rewrite (optional, server/llm.js) ----------
  async function rewrite(c, me) {
    const r = recipeFor(c.recipe, c.kind);
    const src = (c.transcript || []).length ? c.transcript.map(l => `${l.t !== null && l.t !== undefined ? `[${mmss(l.t)}] ` : ''}${l.who ? l.who + ': ' : ''}${l.text}`).join('\n') : (c.text || c.description || '');
    if (!src.trim()) throw Object.assign(new Error('There\'s nothing to rewrite yet.'), { status: 400 });
    const system = 'You write short, plain notes for a small team of friends. Use simple words and short sentences. Only use facts from the text. Never add facts, opinions, hype, emoji or markdown headings beyond the format asked.';
    const prompt = `${r.prompt}\n\nPeople on the team: ${people().join(', ') || 'unknown'}.\n\nText:\n${src.slice(0, 14000)}\n\nReply in exactly this format:\nSUMMARY: <2 to 4 plain sentences>\nPOINTS:\n- <up to 7 short points>\nACTIONS:\n- <Name: what to do> (or "- none")`;
    const out = await llm.generate(prompt, { system, maxTokens: 600, temperature: 0.2, timeoutMs: 90_000 });
    if (!out) throw Object.assign(new Error('No AI is set up for the tribe right now. The quick summary is still here.'), { status: 503 });
    const text = String(out).replace(/<think>[\s\S]*?<\/think>/g, '');
    const sum = (/SUMMARY:\s*([\s\S]*?)(?:\n\s*POINTS:|$)/i.exec(text) || [])[1];
    const pts = ((/POINTS:\s*([\s\S]*?)(?:\n\s*ACTIONS:|$)/i.exec(text) || [])[1] || '').split('\n').map(s => s.replace(/^\s*[-*•\d.)]+\s*/, '').trim()).filter(s => s && !/^none\.?$/i.test(s)).slice(0, 8);
    const acts = ((/ACTIONS:\s*([\s\S]*)$/i.exec(text) || [])[1] || '').split('\n').map(s => s.replace(/^\s*[-*•\d.)]+\s*/, '').trim()).filter(s => s && !/^none\.?$/i.test(s)).slice(0, 10);
    if (!sum || !sum.trim()) throw Object.assign(new Error('The AI answer didn\'t fit the notes format. The quick summary is still here.'), { status: 502 });
    c.summary = clip(sum, 1400); c.points = pts.map(t => ({ id: rid(), text: clip(t, 240), t: null, human: false }));
    c.actions = acts.map(t => { const m = /^([^:]{1,30}):\s*(.+)$/.exec(t); return { id: rid(), text: clip(t, 200), owner: m ? m[1].trim() : '', t: null }; });
    const st = llm.status ? llm.status() : {}; c.via = st.via || st.model || 'the tribe\'s AI'; c.edited = { ...(c.edited || {}), summary: false, points: false, actions: false };
    return c;
  }

  // ---------- search + "what did we decide" ----------
  const T = SUM.terms;
  function search(me, q, limit = 20) {
    const want = [...new Set(T(q))]; const all = listAll().filter(c => visible(c, me));
    if (!want.length) return all.slice(0, limit).map(c => ({ c, score: 0 }));
    return all.map(c => {
      const hay = (s, w) => { const ts = new Set(T(s)); return want.filter(x => ts.has(x)).length * w; };
      const score = hay(c.title, 4) + hay(c.summary, 3) + hay((c.tags || []).join(' '), 3) + hay((c.points || []).map(p => p.text).join(' '), 2) + hay((c.decisions || []).map(p => p.text).join(' '), 3)
        + Math.min(6, hay((c.transcript || []).map(l => l.text).join(' ') + ' ' + String(c.text || '').slice(0, 20000), 0.5));
      return { c, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  function ask(me, q) {
    const topic = String(q || '').replace(/^.*?\b(?:decide|decided|agree|agreed|say|said|plan|planned|settle|settled)\b\s*(?:on|about|for|with|regarding)?\s*/i, '').replace(/[?.!]+$/, '').trim() || String(q || '');
    const want = [...new Set(T(topic))]; if (!want.length) return { topic, quotes: [] };
    const exact = [...new Set(String(topic).toLowerCase().match(/[\p{L}\p{N}']+/gu) || [])].filter(w => w.length > 2);
    const quotes = [];
    const consider = (text, meta, boost) => { const ts = new Set(T(text)); const hits = want.filter(w => ts.has(w)).length; if (!hits) return; const raw = new Set(String(text).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []); boost += exact.filter(w => raw.has(w)).length + (meta.title && T(meta.title).some(w => want.includes(w)) ? 1 : 0); const dec = /\b(decid|agree|settled|going with|go with|we'll|we will|plan is|lock)/i.test(text); quotes.push({ text: clip(text, 280), score: hits * 3 + (dec ? 5 : 0) + boost, ...meta }); };
    for (const c of listAll().filter(x => visible(x, me))) {
      const meta = l => ({ capture: c.id, title: c.title, when: c.published || c.created, kind: c.kind, t: l && Number.isFinite(l.t) ? l.t : null, at: l && Number.isFinite(l.t) ? mmss(l.t) : '', who: (l && l.who) || '' });
      for (const d of c.decisions || []) consider(d.text, meta(d), 4);
      for (const l of c.transcript || []) consider(l.text, meta(l), 0);
      for (const p of c.points || []) consider(p.text, meta(p), 1);
      if (!(c.transcript || []).length) for (const para of String(c.text || '').split(/\n\s*\n/).slice(0, 400)) consider(para, meta(null), 0);
    }
    try { for (const d of docs.list().slice(0, 80)) { const full = docs.read(d.slug); if (!full) continue; for (const para of String(full.body || '').split(/\n\s*\n/).slice(0, 300)) consider(para.replace(/^#+\s*/, ''), { doc: d.slug, title: d.title, when: d.updated, kind: 'doc', t: null, at: '', who: '' }, 0); } } catch {}
    quotes.sort((a, b) => b.score - a.score);
    const seen = new Set(); const out = [];
    for (const x of quotes) { const k = x.text.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(x); if (out.length >= 3) break; }
    return { topic, quotes: out };
  }

  // ---------- tasks from action items (people only) ----------
  function makeTasks(me, c, items) {
    const made = [];
    for (const i of (Array.isArray(items) ? items : []).slice(0, 20)) {
      const a = (c.actions || [])[Number(i)]; if (!a || a.task) continue;
      const t = createTask({ title: clip(a.text, 200), by: me.id, source: 'capture', body: `From the capture **${mdEsc(c.title)}**${a.t !== null && a.t !== undefined ? ` at ${mmss(a.t)}` : ''}.${c.url ? `\n\n${c.url}` : ''}` });
      a.task = t.id; made.push(t);
    }
    if (made.length) save(c);
    return made;
  }

  // ---------- routes ----------
  const err = (res, fail, e) => fail(res, e.status || 500, e.status ? e.message : say(e));
  async function route(req, res, { m, b, c: sub, parts, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    try {
      if (!b) {
        if (m === 'GET') { const q = String(url.searchParams.get('q') || '').trim(); const list = q ? search(me, q, 50).map(x => x.c) : listAll().filter(x => visible(x, me)); return send(res, 200, { captures: list.slice(0, 200).map(light), canWrite: canWrite(me), settings: settings() }); }
        if (m === 'POST') {
          if (!canWrite(me)) return fail(res, 403, 'Spectators can read captures but not add them.');
          const body = await readBody(req);
          let channel = body.channel ? String(body.channel) : null; if (channel === 'general') channel = P.channelOf(projectId());
          if (channel && dms.isDm(channel) && !dms.canRead(channel, me)) return fail(res, 403, 'This conversation is private.');
          const r = await captureLink(me, body.url, { channel, message: body.message ? String(body.message).slice(0, 40) : null, recipe: String(body.recipe || ''), refresh: !!body.refresh });
          if (r.error) return send(res, 422, { error: r.error, blocked: !!r.capture.blocked });
          if (channel && body.post !== false) postCard(r.capture, channel, r.duplicate);
          return send(res, 200, { capture: r.capture, duplicate: !!r.duplicate });
        }
        return fail(res, 405, 'GET or POST');
      }
      if (b === 'voice' && m === 'POST') { if (!canWrite(me)) return fail(res, 403, 'Spectators can read captures but not add them.'); const body = await readBody(req, 36 * 1024 * 1024); const r = await captureVoice(me, body); if (body.channel && body.post) postCard(r.capture, r.capture.links.channel); return send(res, 200, r); }
      if (b === 'ask' && m === 'GET') return send(res, 200, ask(me, url.searchParams.get('q')));
      if (b === 'settings') {
        if (m === 'GET') return send(res, 200, { settings: settings(), host: me.role === 'host' });
        if (m === 'PATCH') { if (me.role !== 'host') return fail(res, 403, 'Only the host can change this.'); const body = await readBody(req); const s = settings(); for (const k of ['auto', 'videoTools']) if (typeof body[k] === 'boolean') s[k] = body[k]; base.writeJSON(SETTINGS, s); return send(res, 200, { settings: s }); }
      }
      if (b === 'weights') {
        if (m === 'GET') return send(res, 200, weights());
        if (m === 'DELETE') { if (!isHostish(me)) return fail(res, 403, 'Only the host or an admin can reset this.'); base.remove(WEIGHTS); return send(res, 200, weights()); }
      }
      if (b === 'recipes') {
        if (m === 'GET' && !sub) return send(res, 200, { recipes: recipes(), pending: customRecipes('pending'), canApprove: isHuman(me) && canWrite(me) });
        if (!isHuman(me) || !canWrite(me)) return fail(res, 403, 'A person approves recipes.');
        const rid2 = String(sub || '').replace(/[^a-z0-9-]/g, ''); if (!rid2) return fail(res, 404, 'no such recipe');
        const pend = base.p('.tribe', 'recipes', 'pending', rid2 + '.json'), live = base.p('.tribe', 'recipes', rid2 + '.json');
        if (m === 'POST' && parts[3] === 'approve') { if (!fs.existsSync(pend)) return fail(res, 404, 'no such recipe'); fs.mkdirSync(path.dirname(live), { recursive: true }); fs.renameSync(pend, live); postChat('general', 'tribecode', `📎 ${mdEsc(me.name)} approved the capture recipe **${mdEsc(rid2)}**.`); return send(res, 200, { recipes: recipes(), pending: customRecipes('pending') }); }
        if (m === 'DELETE') { if (fs.existsSync(pend)) fs.unlinkSync(pend); else if (fs.existsSync(live)) fs.unlinkSync(live); else return fail(res, 404, 'no such recipe'); return send(res, 200, { recipes: recipes(), pending: customRecipes('pending') }); }
        return fail(res, 405, 'not allowed');
      }
      const cap = read(b);
      if (!cap || !visible(cap, me)) return fail(res, 404, 'That capture isn\'t here.');
      if (!sub) {
        if (m === 'GET') return send(res, 200, { capture: cap, recipes: recipes().map(r => ({ id: r.id, title: r.title, emoji: r.emoji })), canWrite: canWrite(me), canTask: isHuman(me) && canWrite(me) });
        if (m === 'PATCH') {
          if (!canWrite(me)) return fail(res, 403, 'Spectators can read captures but not edit them.');
          const body = await readBody(req, 2 * 1024 * 1024); const prev = JSON.parse(JSON.stringify(cap)); let learned = 0;
          cap.edited = cap.edited || {};
          if (typeof body.title === 'string' && body.title.trim()) cap.title = body.title.trim().slice(0, 200);
          if (typeof body.summary === 'string') { cap.summary = body.summary.slice(0, 4000); cap.edited.summary = true; }
          const items = (list, keepOld) => list.slice(0, 40).map(x => { const old = keepOld.find(o => o.id === x.id); const text = String((x && x.text) || '').replace(/\s+/g, ' ').trim().slice(0, 400); if (!text) return null; return { ...(old || { human: true, t: null }), id: old ? old.id : rid(), text }; }).filter(Boolean);
          for (const k of ['points', 'actions', 'decisions']) if (Array.isArray(body[k])) { cap[k] = items(body[k], prev[k] || []); cap.edited[k] = true; }
          if (Array.isArray(body.tags)) { cap.tags = body.tags.map(t => String(t).toLowerCase().trim().slice(0, 30)).filter(Boolean).slice(0, 10); cap.edited.tags = true; }
          if (typeof body.transcript === 'string') { const t = body.transcript.slice(0, 200000); cap.transcript = t.split(/\n+/).map(s => s.trim()).filter(Boolean).map(text => { const tm = /^\[?(\d{1,2}):(\d{2})\]?\s+(.*)$/.exec(text); return tm ? { t: Number(tm[1]) * 60 + Number(tm[2]), text: tm[3] } : { t: null, text }; }); cap.transcriptVia = 'pasted'; cap.status = cap.transcript.length ? 'ready' : cap.status; cap.note = cap.transcript.length ? '' : cap.note; cap.edited = {}; fill(cap, { keepEdits: false }); }
          if (typeof body.recipe === 'string' && body.recipe !== cap.recipe && recipes().some(r => r.id === body.recipe)) { cap.recipe = body.recipe; fill(cap, { keepEdits: false }); cap.edited = {}; }
          learned = learnFrom(prev, body);
          save(cap); return send(res, 200, { capture: cap, learned });
        }
        if (m === 'DELETE') {
          if (!canWrite(me) || me.role === 'agent') return fail(res, 403, 'Only people can delete captures.');
          if (cap.by !== me.id && !perms.can(me, 'files.delete') && me.role !== 'host') return fail(res, 403, 'Only the person who added it (or an admin) can delete it.');
          for (const x of [rel(cap.id, 'json'), rel(cap.id, 'md')]) store.remove(x);
          if (cap.thumbnail) store.remove(`${DIR}/thumbs/${path.basename(cap.thumbnail)}`);
          if (cap.audio) store.remove(`${DIR}/audio/${path.basename(cap.audio)}`);
          notify({ type: 'capture', project: cap.project, id: cap.id, removed: true }, cap);
          return send(res, 200, { ok: true });
        }
        return fail(res, 405, 'GET, PATCH or DELETE');
      }
      if (sub === 'thumb' && m === 'GET') {
        if (!cap.thumbnail) return fail(res, 404, 'no picture');
        const ext = path.extname(cap.thumbnail).slice(1), type = Object.keys(IMG_TYPES).find(k => IMG_TYPES[k] === ext);
        let buf; try { buf = fs.readFileSync(store.p(DIR, 'thumbs', path.basename(cap.thumbnail))); } catch { return fail(res, 404, 'no picture'); }
        if (!type || !sniff(buf, ext)) return fail(res, 415, 'not a picture');
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=86400', 'Access-Control-Allow-Origin': '*' });
        return res.end(buf);
      }
      if (sub === 'audio' && m === 'GET') {
        if (!cap.audio) return fail(res, 404, 'no audio');
        let buf; try { buf = fs.readFileSync(store.p(DIR, 'audio', path.basename(cap.audio))); } catch { return fail(res, 404, 'no audio'); }
        res.writeHead(200, { 'Content-Type': AUDIO_EXT[cap.audioMime] ? cap.audioMime : 'application/octet-stream', 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-cache', 'Access-Control-Allow-Origin': '*' });
        return res.end(buf);
      }
      if (m !== 'POST') return fail(res, 405, 'POST');
      if (!canWrite(me)) return fail(res, 403, 'Spectators can read captures but not change them.');
      if (sub === 'tasks') {
        if (!isHuman(me)) return fail(res, 403, 'Agents can suggest action items, but a person makes them tasks.');
        const body = await readBody(req); const made = makeTasks(me, cap, body.items);
        return send(res, 200, { tasks: made, capture: cap });
      }
      if (sub === 'summarize') {
        const body = await readBody(req);
        if (body.depth === 'model') { await rewrite(cap, me); save(cap); return send(res, 200, { capture: cap }); }
        cap.edited = {}; fill(cap, { keepEdits: false }); save(cap); return send(res, 200, { capture: cap });
      }
      if (sub === 'transcribe') {
        if (cap.kind === 'voice') { if (!cap.audio) return fail(res, 400, 'There\'s no audio to transcribe.'); if (!packs.whisper()) return fail(res, 400, 'Local transcripts aren\'t installed. The host can add them in Settings › Packs.'); return send(res, 200, { capture: await transcribeVoice(cap.id) }); }
        if (me.role === 'agent') return fail(res, 403, 'A person starts video transcripts.');
        return send(res, 200, { capture: await transcribeVideo(cap.id) });
      }
      if (sub === 'doc') {
        const title = `Notes · ${cap.title}`.slice(0, 120); const d = docs.find(title);
        const r = d ? docs.upsert({ name: d.slug, body: markdown(cap), baseVersion: d.version, by: me.id }) : docs.upsert({ name: title, body: markdown(cap), by: me.id });
        if (r.conflict) return fail(res, 409, r.conflict);
        return send(res, 200, { doc: { slug: r.doc.slug, title: r.doc.title }, project: projectId() });
      }
      return fail(res, 404, 'not found');
    } catch (e) { log('captures: ' + (e.stack || e.message)); return err(res, fail, e); }
  }

  // ---------- MCP tools (agents capture and read; they never make tasks or approvals) ----------
  function mcpTools() {
    const text = t => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
    const mErr = t => ({ content: [{ type: 'text', text: t }], isError: true });
    const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
    const str = d => ({ type: 'string', description: d });
    return {
      capture_link: {
        description: 'Read a public web page or video link into the project\'s Captures: clean text (or the public title for videos), a short summary, key points, action items and tags. Dedupes the same URL. Action items stay suggestions: a person turns them into tasks.',
        inputSchema: S({ url: str('An http(s) link'), recipe: str('Optional recipe id: article, video, meeting, idea, playtest, interview, lecture') }, ['url']),
        run: async ({ url: u, recipe }, me) => {
          if (me.role === 'spectator') return mErr('Spectators are read-only.');
          try { const r = await captureLink(me, u, { recipe: recipe || '' }); if (r.error) return mErr(r.error); const c = r.capture; return text({ id: c.id, title: c.title, kind: c.kind, status: c.status, note: c.note || undefined, duplicate: !!r.duplicate, summary: c.summary, points: (c.points || []).map(p => p.text), actions: (c.actions || []).map(a => a.text), tags: c.tags, next: 'capture_read for the full text. Action items become tasks only when a person taps Make tasks in Captures.' }); }
          catch (e) { return mErr(e.message); }
        },
      },
      capture_read: {
        description: 'Read one capture: summary, points, actions, decisions, and the transcript (with timestamps) or article text.',
        inputSchema: S({ id: str('Capture id from captures_search or capture_link'), max_chars: { type: 'number', description: 'Cap the transcript/text (default 12000)' } }, ['id']),
        run: ({ id: cid, max_chars }, me) => {
          const c = read(String(cid || '')); if (!c || !visible(c, me)) return mErr(`No capture ${cid}. Use captures_search.`);
          const cap = Math.min(Math.max(Number(max_chars) || 12000, 500), 60000);
          const body = (c.transcript || []).length ? c.transcript.map(l => `${l.t !== null && l.t !== undefined ? `[${mmss(l.t)}] ` : ''}${l.who ? l.who + ': ' : ''}${l.text}`).join('\n') : String(c.text || '');
          return text({ id: c.id, title: c.title, url: c.url || undefined, kind: c.kind, author: c.author || undefined, published: c.published || undefined, status: c.status, note: c.note || undefined, summary: c.summary, points: (c.points || []).map(p => (p.t !== null && p.t !== undefined ? `[${mmss(p.t)}] ` : '') + p.text), actions: (c.actions || []).map(a => a.text + (a.task ? ` (task ${a.task})` : '')), decisions: (c.decisions || []).map(d => (d.t !== null && d.t !== undefined ? `[${mmss(d.t)}] ` : '') + d.text), tags: c.tags, content: body.slice(0, cap) + (body.length > cap ? '\n…(cut)' : '') });
        },
      },
      captures_search: {
        description: 'Search the project\'s captures (links, videos, voice notes, huddle notes) by words. Returns ids, titles and short summaries.',
        inputSchema: S({ query: str('Words to look for (empty: the newest)') }),
        run: ({ query }, me) => text(search(me, String(query || ''), 15).map(({ c }) => ({ id: c.id, title: c.title, kind: c.kind, created: c.created, summary: clip(c.summary, 200), tags: c.tags }))),
      },
      capture_summarize: {
        description: 'Summarize a capture again. depth "quick" re-runs the fast local scorer; "model" rewrites it in plain words with the tribe\'s AI (local model or the host\'s key).',
        inputSchema: S({ id: str('Capture id'), depth: { type: 'string', enum: ['quick', 'model'] } }, ['id']),
        run: async ({ id: cid, depth }, me) => {
          const c = read(String(cid || '')); if (!c || !visible(c, me)) return mErr(`No capture ${cid}.`);
          if (me.role === 'spectator') return mErr('Spectators are read-only.');
          try { if (depth === 'model') await rewrite(c, me); else { c.edited = {}; fill(c, { keepEdits: false }); } save(c); return text({ id: c.id, summary: c.summary, points: c.points.map(p => p.text), actions: c.actions.map(a => a.text), via: c.via }); }
          catch (e) { return mErr(e.message); }
        },
      },
      capture_recipe_propose: {
        description: 'Propose a better capture recipe (sections, cue phrases, the plain-words prompt). It waits in Captures › Recipes until a person approves it.',
        inputSchema: S({ id: str('Short name, e.g. "standup"'), title: str('Title'), emoji: str('One emoji'), sections: { type: 'array', items: { type: 'string', enum: RECIPES.SECTIONS } }, key: { type: 'array', items: { type: 'string' }, description: 'Cue phrases that mark key sentences' }, decision: { type: 'array', items: { type: 'string' } }, action: { type: 'array', items: { type: 'string' } }, prompt: str('The plain-words rewrite prompt') }, ['id']),
        run: (a, me) => {
          if (me.role === 'spectator') return mErr('Spectators are read-only.');
          let r; try { r = RECIPES.validate({ ...a, cues: { key: a.key, decision: a.decision, action: a.action } }); } catch (e) { return mErr(e.message); }
          const dir = base.p('.tribe', 'recipes', 'pending'); fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, r.id + '.json'), JSON.stringify({ ...r, proposedBy: me.name, proposed: new Date().toISOString() }, null, 2));
          postChat('general', 'tribecode', `📎 ${mdEsc(me.name)} proposed a capture recipe **${mdEsc(r.title)}**. A person can approve it in Files › Captures › Recipes.`);
          return text(`Proposed recipe "${r.id}". A person approves it in Captures before it is used.`);
        },
      },
    };
  }

  return { route, onChat, fromHuddle, rewrite, mcpTools: mcpTools(), captureLink, captureVoice, search, ask, read, list: listAll, parseVtt, parseWhisperJson, normUrl, platformOf };
};
module.exports.parseVtt = parseVtt;
module.exports.parseWhisperJson = parseWhisperJson;
module.exports.normUrl = normUrl;
module.exports.platformOf = platformOf;
