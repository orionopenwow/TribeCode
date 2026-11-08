// feat/captures: a small, dependency-free HTML reader for the link reader (server/captures.js, docs/LINK-READER.md).
//   decodeBody(buffer, contentType)  -> text, with the charset taken from the header, a BOM, <meta charset> or a guess
//   parse(html)                      -> a light DOM: { tag, attrs, children } elements and { text } nodes
//   extract(html, url)               -> { title, author, published, site, image, lang, text, paragraphs, words, robots, paywalled }
// The article finder is our own Readability-style scorer (written from scratch, not a port): it drops scripts, menus,
// ads and share bars, scores blocks by text length, commas and class/id hints, penalizes link-heavy blocks, then keeps
// the best block and its strong siblings. Output is plain text only: nothing from the page is ever rendered as HTML.
'use strict';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template', 'xmp', 'iframe', 'noembed', 'noframes']);
// Elements that close an open <p> (and similar implicit-end rules, simplified).
const CLOSES_P = new Set(['address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul', 'figure']);
const MAX_NODES = 60000, MAX_DEPTH = 400;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', ccedil: 'ç', ntilde: 'ñ', iacute: 'í', oacute: 'ó', uacute: 'ú', euro: '€', pound: '£', times: '×', deg: '°' };
function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,8});?/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    const v = ENT[e.toLowerCase()]; return v === undefined ? all : v;
  });
}

// ---------- charset ----------
function normCharset(cs) {
  const c = String(cs || '').trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (!c) return '';
  if (/^(utf-?8|unicode-1-1-utf-8)$/.test(c)) return 'utf-8';
  if (/^(iso-?8859-?1|latin-?1|us-ascii|ascii|cp1252|windows-1252)$/.test(c)) return 'windows-1252';
  return c;
}
function tryDecode(buf, cs, fatal) { try { return new TextDecoder(cs, { fatal: !!fatal }).decode(buf); } catch { return null; } }
function decodeBody(buf, contentType) {
  buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || '');
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return tryDecode(buf.subarray(3), 'utf-8') || '';
  if (buf[0] === 0xff && buf[1] === 0xfe) return tryDecode(buf.subarray(2), 'utf-16le') || '';
  if (buf[0] === 0xfe && buf[1] === 0xff) return tryDecode(buf.subarray(2), 'utf-16be') || '';
  const fromHeader = normCharset((/charset\s*=\s*([^;\s]+)/i.exec(String(contentType || '')) || [])[1]);
  const head = buf.subarray(0, 4096).toString('latin1');
  const fromMeta = normCharset((/<meta[^>]+charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(head) || [])[1]);
  for (const cs of [fromHeader, fromMeta]) {
    if (!cs) continue;
    if (cs === 'utf-8') { const t = tryDecode(buf, 'utf-8', true); if (t !== null) return t; continue; }   // a page that says UTF-8 but is not: guess below
    const t = tryDecode(buf, cs); if (t !== null) return t;
  }
  const utf = tryDecode(buf, 'utf-8', true); if (utf !== null) return utf;
  return tryDecode(buf, 'windows-1252') || buf.toString('latin1');
}

// ---------- tokenizer + tree ----------
function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let m, n = 0;
  while ((m = re.exec(src)) && n++ < 64) { const k = m[1].toLowerCase(); if (!(k in attrs)) attrs[k] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''); }
  return attrs;
}
function parse(html) {
  const s = String(html || '');
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root]; let i = 0, nodes = 0;
  const top = () => stack[stack.length - 1];
  const addText = t => { if (!t) return; const p = top(), last = p.children[p.children.length - 1]; if (last && last.text !== undefined) last.text += t; else { p.children.push({ text: t }); nodes++; } };
  const closeTo = tag => { for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack.length = k; return true; } return false; };
  while (i < s.length && nodes < MAX_NODES) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { addText(decodeEntities(s.slice(i))); break; }
    if (lt > i) addText(decodeEntities(s.slice(i, lt)));
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? s.length : e + 3; continue; }
    if (s[lt + 1] === '!' || s[lt + 1] === '?') { const e = s.indexOf('>', lt); i = e < 0 ? s.length : e + 1; continue; }
    const close = s[lt + 1] === '/';
    const m = /^<\/?([a-zA-Z][a-zA-Z0-9:-]*)/.exec(s.slice(lt, lt + 64));
    if (!m) { addText('<'); i = lt + 1; continue; }
    // find the end of the tag, honoring quotes
    let j = lt + m[0].length, q = null;
    for (; j < s.length; j++) { const c = s[j]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; }
    const tag = m[1].toLowerCase(), inner = s.slice(lt + m[0].length, j); i = j + 1;
    if (close) { if (tag === 'p' && !closeTo('p')) continue; closeTo(tag); continue; }
    if (CLOSES_P.has(tag) && stack.some(x => x.tag === 'p')) closeTo('p');
    if (tag === 'li') { const k = stack.map(x => x.tag).lastIndexOf('li'); if (k > 0 && !stack.slice(k).some(x => x.tag === 'ul' || x.tag === 'ol')) stack.length = k; }
    const el = { tag, attrs: parseAttrs(inner), children: [] }; nodes++;
    top().children.push(el);
    if (VOID.has(tag) || /\/\s*$/.test(inner)) continue;
    if (RAW.has(tag)) {
      const e = s.toLowerCase().indexOf(`</${tag}`, i);
      const raw = s.slice(i, e < 0 ? s.length : e);
      if (tag === 'title' || tag === 'textarea') el.children.push({ text: decodeEntities(raw) });
      else el.raw = raw.length > 200000 ? raw.slice(0, 200000) : raw;   // scripts keep their text only for JSON-LD
      const gt = e < 0 ? s.length : s.indexOf('>', e); i = gt < 0 ? s.length : gt + 1; continue;
    }
    if (stack.length < MAX_DEPTH) stack.push(el);
  }
  return root;
}

// ---------- helpers on the tree ----------
function walk(node, fn, depth = 0) { if (!node || depth > MAX_DEPTH) return; if (fn(node, depth) === false) return; for (const c of node.children || []) walk(c, fn, depth + 1); }
function all(node, pred) { const out = []; walk(node, n => { if (n.tag && pred(n)) out.push(n); }); return out; }
function textOf(node) { let t = ''; walk(node, n => { if (n.text !== undefined) t += n.text; else if (n.tag === 'br') t += '\n'; else if (SKIP.has(n.tag)) return false; }); return t; }
const squash = s => String(s || '').replace(/[ \s]+/g, ' ').trim();
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'iframe', 'object', 'embed', 'canvas', 'video', 'audio', 'select', 'button', 'input', 'textarea', 'form', 'head', 'title', 'meta', 'link']);
const NOISE_TAG = new Set(['nav', 'footer', 'aside', 'header', 'menu', 'dialog']);
const NEG = /(^|[\s_-])(ad|ads|adv|advert\w*|banner|breadcrumbs?|combx|comment\w*|community|cookie\w*|consent|disqus|extra|footer|foot|gdpr|header|legends|masthead|media-?share|menu|meta|modal|more|nav\w*|newsletter|outbrain|pager|pagination|popup|promo\w*|related|remark|rss|scroll|share\w*|shopping|sidebar|skyscraper|social|sponsor\w*|subscribe|supplemental|tags?|taboola|tool(bar|tip)s?|trending|tweet|utility|widget\w*|signup|login|paywall)($|[\s_-])/i;
const POS = /(^|[\s_-])(article|body|content|entry|hentry|h-entry|main|page|post|text|blog|story|prose|markdown|reader|chapter)($|[\s_-])/i;
const BLOCK = new Set(['p', 'pre', 'td', 'blockquote', 'li', 'h2', 'h3', 'h4', 'div', 'section', 'article', 'main', 'dd', 'figcaption']);

function hint(el) { const c = `${el.attrs.class || ''} ${el.attrs.id || ''} ${el.attrs.role || ''}`; let w = 0; if (NEG.test(c)) w -= 25; if (POS.test(c)) w += 25; if (/^(navigation|banner|contentinfo|complementary|dialog|search)$/i.test(el.attrs.role || '')) w -= 30; if (/^(main|article)$/i.test(el.attrs.role || '')) w += 30; return w; }
// Text and link-text lengths, computed once per element (big pages would otherwise walk the tree again and again).
let LEN = new WeakMap();
function lens(el, depth = 0) {
  if (el.text !== undefined) return [el.text.replace(/\s+/g, ' ').length, 0];
  if (!el.tag || SKIP.has(el.tag) || depth > MAX_DEPTH) return [0, 0];
  const hit = LEN.get(el); if (hit) return hit;
  let t = 0, l = 0; for (const c of el.children || []) { const [a, b] = lens(c, depth + 1); t += a; l += b; }
  const out = [t, el.tag === 'a' ? t : l]; LEN.set(el, out); return out;
}
function linkDensity(el) { const [t, l] = lens(el); return t ? l / t : 0; }

// Remove scripts, hidden things and obvious page chrome; returns the cleaned body.
function clean(node) {
  const keep = n => {
    if (!n.tag) return true;
    if (SKIP.has(n.tag) || NOISE_TAG.has(n.tag)) return false;
    if (n.attrs.hidden !== undefined || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attrs.style || '') || n.attrs['aria-hidden'] === 'true') return false;
    const c = `${n.attrs.class || ''} ${n.attrs.id || ''}`;
    if (NEG.test(c) && !POS.test(c) && n.tag !== 'body' && n.tag !== 'article' && n.tag !== 'main' && squash(textOf(n)).length < 2000) return false;
    return true;
  };
  const rec = n => { if (n.children) n.children = n.children.filter(keep).map(c => { rec(c); return c; }); };
  rec(node); return node;
}

function score(body) {
  const scores = new Map();
  const add = (el, v) => { if (!el || !el.tag || el.tag === '#root') return; if (!scores.has(el)) scores.set(el, hint(el) + ({ div: 5, article: 25, main: 20, section: 3, pre: 3, td: 3, blockquote: 3 }[el.tag] || 0)); scores.set(el, scores.get(el) + v); };
  // parents: built once
  const parent = new Map(); walk(body, n => { for (const c of n.children || []) if (c.tag) parent.set(c, n); });
  for (const p of all(body, n => n.tag === 'p' || n.tag === 'pre' || n.tag === 'td' || n.tag === 'blockquote' || (n.tag === 'div' && !(n.children || []).some(c => c.tag && BLOCK.has(c.tag))))) {
    const t = squash(textOf(p)); if (t.length < 25) continue;
    const v = 1 + (t.split(/[,，、]/).length - 1) + Math.min(3, Math.floor(t.length / 100));
    const par = parent.get(p), gp = par && parent.get(par), ggp = gp && parent.get(gp);
    add(par, v); add(gp, v / 2); add(ggp, v / 3);
  }
  let best = null, bestScore = 0;
  for (const [el, s0] of scores) { const s = s0 * (1 - linkDensity(el)); scores.set(el, s); if (s > bestScore) { best = el; bestScore = s; } }
  return { best, bestScore, scores, parent };
}

// Element -> Markdown-ish plain text: headings "## ", list items "- ", paragraphs separated by blank lines.
function toText(el) {
  const out = []; let line = '';
  const flush = () => { const t = squash(line); if (t) out.push(t); line = ''; };
  const rec = (n, depth) => {
    if (depth > MAX_DEPTH) return;
    if (n.text !== undefined) { line += n.text; return; }
    if (!n.tag || SKIP.has(n.tag)) return;
    if (n.tag === 'br') { line += ' '; return; }
    if (n.tag === 'img' || n.tag === 'picture' || n.tag === 'figure' && !squash(textOf(n))) return;
    const block = /^(p|div|section|article|main|blockquote|pre|ul|ol|table|tr|dl|dd|dt|figcaption|figure|h[1-6]|li|hr)$/.test(n.tag);
    if (block) flush();
    if (/^h[1-6]$/.test(n.tag)) { const t = squash(textOf(n)); if (t) out.push(`${'#'.repeat(Math.min(4, Math.max(2, Number(n.tag[1]))))} ${t}`); return; }
    if (n.tag === 'li') { const t = squash(textOf(n)); if (t) out.push(`- ${t}`); return; }
    for (const c of n.children || []) rec(c, depth + 1);
    if (block) flush();
  };
  rec(el, 0); flush();
  return out;
}

function meta(doc) {
  const m = {}, head = all(doc, n => n.tag === 'meta');
  for (const x of head) { const k = (x.attrs.property || x.attrs.name || x.attrs.itemprop || '').toLowerCase(); if (k && x.attrs.content !== undefined && m[k] === undefined) m[k] = squash(x.attrs.content); if (x.attrs['http-equiv'] && /x-robots-tag/i.test(x.attrs['http-equiv'])) m['x-robots-tag'] = squash(x.attrs.content); }
  return m;
}
function jsonLd(doc) {
  const out = [];
  for (const s of all(doc, n => n.tag === 'script' && /ld\+json/i.test(n.attrs.type || ''))) {
    try { const v = JSON.parse(String(s.raw || '').trim()); (Array.isArray(v) ? v : v && v['@graph'] ? v['@graph'] : [v]).forEach(x => x && typeof x === 'object' && out.push(x)); } catch {}
    if (out.length > 30) break;
  }
  return out;
}

function extract(html, url) {
  const doc = parse(html);
  const M = meta(doc), LD = jsonLd(doc);
  const article = LD.find(x => /article|posting|report|blog|news/i.test(String(x['@type'] || ''))) || LD[0] || {};
  const pick = (...k) => { for (const x of k) if (M[x]) return M[x]; return ''; };
  const titleEl = all(doc, n => n.tag === 'title')[0];
  const h1 = all(doc, n => n.tag === 'h1')[0];
  let title = pick('og:title', 'twitter:title') || squash(article.headline) || squash(titleEl && textOf(titleEl)) || squash(h1 && textOf(h1));
  const ldAuthor = article.author ? (Array.isArray(article.author) ? article.author : [article.author]).map(a => (typeof a === 'string' ? a : a && a.name)).filter(Boolean).join(', ') : '';
  const author = (pick('author', 'article:author', 'twitter:creator', 'parsely-author', 'dc.creator') || ldAuthor || '').replace(/^https?:\/\/\S+$/, '');
  const timeEl = all(doc, n => n.tag === 'time' && n.attrs.datetime)[0];
  const published = pick('article:published_time', 'og:published_time', 'date', 'pubdate', 'dc.date', 'datepublished') || squash(article.datePublished) || (timeEl ? timeEl.attrs.datetime : '');
  let image = pick('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
  try { image = image ? new URL(image, url).href : ''; if (!/^https?:/.test(image)) image = ''; } catch { image = ''; }
  let site = pick('og:site_name', 'application-name'); if (!site) { try { site = new URL(url).hostname.replace(/^www\./, ''); } catch {} }
  const htmlEl = all(doc, n => n.tag === 'html')[0];
  const lang = (htmlEl && htmlEl.attrs.lang) || pick('og:locale') || '';
  const robots = `${pick('robots')} ${pick('x-robots-tag')}`.toLowerCase();
  const paywalled = LD.some(x => x.isAccessibleForFree === false || x.isAccessibleForFree === 'False' || x.isAccessibleForFree === 'false');

  const bodyEl = all(doc, n => n.tag === 'body')[0] || doc;
  clean(bodyEl); LEN = new WeakMap();
  const { best, bestScore, scores, parent } = score(bodyEl);
  let paragraphs = [];
  if (best && bestScore > 8) {
    const par = parent.get(best), sibs = par ? par.children.filter(c => c.tag) : [best];
    const limit = Math.max(10, bestScore * 0.2);
    for (const s of sibs) {
      if (s === best) { paragraphs.push(...toText(s)); continue; }
      const sc = scores.get(s) || 0, t = squash(textOf(s));
      if (sc >= limit || (s.tag === 'p' && t.length > 80 && linkDensity(s) < 0.25)) paragraphs.push(...toText(s));
    }
  } else paragraphs = toText(bodyEl).filter(t => t.length > 40 || /^#/.test(t));
  // the title often repeats as the first heading; drop very short link-like lines and repeats
  const seen = new Set();
  paragraphs = paragraphs.filter(p => { const k = p.replace(/^#+\s*/, '').toLowerCase(); if (seen.has(k) || (title && k === title.toLowerCase())) return false; seen.add(k); return k.length > 1; });
  const text = paragraphs.join('\n\n').slice(0, 400000);
  if (!title) title = (paragraphs.find(p => !p.startsWith('#')) || '').slice(0, 90);
  const description = pick('og:description', 'twitter:description', 'description');
  return { title: title.slice(0, 200), author: author.slice(0, 120), published: String(published).slice(0, 40), site: site.slice(0, 80), image: image.slice(0, 2048), lang: String(lang).slice(0, 16),
    description: description.slice(0, 500), text, paragraphs: paragraphs.length, words: text.split(/\s+/).filter(Boolean).length, robots, paywalled };
}

module.exports = { decodeBody, parse, extract, textOf, decodeEntities, squash };
