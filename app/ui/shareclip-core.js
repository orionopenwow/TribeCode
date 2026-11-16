// Share a clip, the parts with no screen (feat/site-demos, docs/SHARE-CLIPS.md): the caption drafts for X, TikTok and
// Instagram, their limits and checks, and which Motion Studio template a clip uses. Plain data and functions, no DOM:
// window.TribeShareCore in the browser, require() in tests.
//   LIMITS                         { x: 280, tiktok: 2200, instagram: 2200 }   characters each platform allows
//   PLATFORMS                      [[id, name, aspect]]   the three captions, and the size each feed suits best
//   template(source, aspect)       -> a Motion Studio template id ('share-app-916', 'share-site-11', 'share-timelapse-169')
//   options(o)                     -> the options that template takes: { screens, images, hook, title, cta, end }
//   captions(info)                 -> { x, tiktok, instagram }   info = { name, kind, what, changes: [..], link, credit, people }
//   check(platform, text)          -> { len, max, over, tags, problems: [plain sentences] }
//   hook(info)                     -> the words on the first frame
// Rules for the drafts: plain words from what the tribe already wrote, never a number or a claim we did not get from
// the project, at most one hashtag on X and two elsewhere, no emoji, and "Made with TribeCode" only when the end card is on.
(function (root) {
  'use strict';
  const LIMITS = { x: 280, tiktok: 2200, instagram: 2200 };
  const PLATFORMS = [['x', 'X', '16:9'], ['tiktok', 'TikTok', '9:16'], ['instagram', 'Instagram', '9:16']];
  const SFX = { '9:16': '916', '1:1': '11', '16:9': '169' };
  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const KIND = { game: 'game', app: 'app', site: 'website', website: 'website', project: 'project', tool: 'tool' };

  function template(source, aspect) {
    const a = SFX[aspect] ? aspect : '9:16';
    const kind = source === 'app' || source === 'upload-phone' ? 'app' : source === 'timelapse' ? 'timelapse' : 'site';
    return `share-${kind}-${SFX[a]}`;
  }
  function options(o = {}) {
    const out = { hook: clean(o.hook).slice(0, 80) || undefined, end: o.end !== false };
    if (o.screens && o.screens.length) out.screens = o.screens.slice(0, 6);
    if (o.images && o.images.length) out.images = o.images.slice(-10);
    if (o.title) out.title = clean(o.title).slice(0, 60);
    if (o.cta) out.cta = clean(o.cta).slice(0, 60);
    return out;
  }
  function hook(info = {}) {
    const k = KIND[info.kind] || 'project', n = clean(info.name);
    if (info.people > 1) return `We made this ${k} together`;
    return n ? `Meet ${n}` : `Made this ${k} with friends`;
  }
  // hashtags that fit the kind of project; never more than the platform's share
  function tags(kind, n) {
    const t = kind === 'game' ? ['#gamedev', '#indiegame'] : kind === 'site' || kind === 'website' ? ['#webdesign', '#buildinpublic'] : ['#buildinpublic', '#appdev'];
    return t.slice(0, n);
  }
  function captions(info = {}) {
    const name = clean(info.name) || 'our project', k = KIND[info.kind] || 'project', what = clean(info.what).replace(/[.!]+$/, '');
    const ch = (info.changes || []).map(clean).filter(Boolean).slice(0, 3);
    const link = clean(info.link), credit = info.credit !== false, together = info.people > 1;
    const desc = what ? (/^(?:an?|the)\s/i.test(what) ? what : `${a(k)} ${k} ${lead(what)}`) : `${a(k)} ${k}`;
    const intro = together ? `We made ${name} together: ${desc}.` : `I made ${name}: ${desc}.`;
    const newest = ch.length ? `New: ${ch.slice(0, 2).map(x => x.replace(/[.!]+$/, '')).join(', ')}.` : '';
    const made = credit ? 'Made with TribeCode.' : '';
    // X: one short paragraph that fits 280 with the link
    let x = [intro, newest, link ? `Try it: ${link}` : '', made].filter(Boolean).join(' ');
    const xt = tags(info.kind, 1);
    if ((x + ' ' + xt.join(' ')).length <= LIMITS.x) x += ' ' + xt.join(' ');
    while (x.length > LIMITS.x && ch.length) { ch.pop(); x = [intro, ch.length ? `New: ${ch.join(', ')}.` : '', link ? `Try it: ${link}` : '', made].filter(Boolean).join(' '); }
    if (x.length > LIMITS.x) x = x.slice(0, LIMITS.x - 1).replace(/\s+\S*$/, '') + '…';
    // TikTok: a hook line, what it is, then two tags
    const tk = [together ? `POV: your friends and you just shipped ${name}` : `Watch ${name} come together`, what ? cap1(what) + '.' : '', ch.length ? `What changed: ${ch.join(', ')}.` : '', link ? 'Link in bio.' : '', made, tags(info.kind, 2).join(' ')].filter(Boolean).join('\n');
    // Instagram: a first line that reads in the feed, a short story, link in bio, two tags
    const ig = [`${cap1(name)}${what ? `: ${what}` : ''}.`, together ? 'Built together, one link, everyone brought their own AI.' : '', ch.length ? `New this week:\n${ch.map(x => '- ' + x.replace(/[.!]+$/, '')).join('\n')}` : '', link ? 'Link in bio.' : '', made, tags(info.kind, 2).join(' ')].filter(Boolean).join('\n\n');
    return { x, tiktok: tk.slice(0, LIMITS.tiktok), instagram: ig.slice(0, LIMITS.instagram) };
  }
  function a(word) { return /^[aeiou]/i.test(word) ? 'an' : 'a'; }
  function lead(what) { return /^(for|that|to|where|with|about)\b/i.test(what) ? what : `for ${what.replace(/^an?\s+/i, '')}`; }
  function check(platform, text) {
    const max = LIMITS[platform] || 2200, t = String(text || ''), len = [...t].length, tagList = t.match(/(^|\s)#[\p{L}\d_]+/gu) || [];
    const problems = [];
    if (len > max) problems.push(`${len - max} characters over the limit`);
    const cap = platform === 'x' ? 1 : 2;
    if (tagList.length > cap) problems.push(`${tagList.length} hashtags: ${cap === 1 ? 'one is plenty on X' : 'two is plenty'}`);
    if (/\b(?:best|#1|number one|guaranteed|revolutionary)\b/i.test(t)) problems.push('A big claim ("best", "#1"): say what it does instead');
    if (/\p{Extended_Pictographic}/u.test(t)) problems.push('Emoji in the caption: fine if you want them, the drafts leave them out');
    return { len, max, over: len > max, tags: tagList.length, problems };
  }
  const api = { LIMITS, PLATFORMS, template, options, captions, check, hook, tags };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeShareCore = api;
})(typeof self !== 'undefined' ? self : this);
