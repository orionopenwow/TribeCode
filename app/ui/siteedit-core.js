// Flint's local website edits: plain sentences -> edit operations on the project website draft, with no AI.
// "Basic features, supercharged by AI" (docs/DESIGN-SYSTEM.md §11): this is the basic half. The server
// (server/siteflint.js) applies the operations, keeps an undo stack and a version for every change; with an AI on, a
// sentence these rules don't understand is turned into the same operations by the model (and checked the same way).
// Shared like aibasics-core.js: window.TribeSiteEditCore in the browser, require() on the server and in tests.
//   parse(text, { pick })  -> { ops: [op...], say } | null
//   op = { op: 'copy', section, field, value }        "make the headline say Fresh bread daily"
//        { op: 'text', before, after }                a picked element + "change it to …"
//        { op: 'primary' | 'accent', color, name }    "change the accent to teal"
//        { op: 'add' | 'remove', section }            "add a pricing section", "remove the testimonials"
//        { op: 'move', section, to: 'up'|'down'|'top'|'bottom' }
//        { op: 'theme', theme } { op: 'layout', layout } { op: 'font', font }   "swap to the Studio template"
//        { op: 'logo' }                               "add my logo" (the browser asks for the file)
//        { op: 'undo' } { op: 'save', note }          "undo", "save this version as before launch"
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TribeSiteEditCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // site colors (not TribeCode's UI palette): readable mid tones; the server still fixes contrast per layout
  const COLORS = { red: '#C8372D', orange: '#E4572E', amber: '#E0951F', yellow: '#E0B21F', gold: '#C9A227', green: '#4C8C4A', lime: '#7AA83A', mint: '#3FA88A',
    teal: '#2A8C80', cyan: '#1F8FA8', blue: '#2F5BEA', navy: '#1E3A8A', sky: '#3A8DDE', indigo: '#4F5BD5', purple: '#7A5CC2', violet: '#7A5CC2', lavender: '#9C88D9',
    pink: '#C2417F', magenta: '#B23A8C', rose: '#D9536F', brown: '#8A5A3B', coral: '#E06A50', black: '#15120F', charcoal: '#2B2B2B', gray: '#6B7280', grey: '#6B7280' };
  const THEMES = { cozy: 'cozy', bold: 'bold', minimal: 'minimal', retro: 'retro', 'retro pixel': 'retro', pixel: 'retro', night: 'night', dark: 'night', paper: 'paper',
    bakery: 'bakery', 'bakery warm': 'bakery', warm: 'bakery', studio: 'studio', garden: 'garden', ocean: 'ocean' };
  const LAYOUTS = { editorial: 'editorial', swiss: 'swiss', devlog: 'devlog', poster: 'poster', journal: 'journal', arcade: 'arcade' };
  const FONTS = { classic: 'fraunces', serif: 'fraunces', fraunces: 'fraunces', modern: 'grotesk', grotesk: 'grotesk', 'space grotesk': 'grotesk', elegant: 'instrument', instrument: 'instrument',
    techy: 'mono', mono: 'mono', monospace: 'mono', code: 'mono', playful: 'bricolage', bricolage: 'bricolage', fun: 'bricolage', retro: 'silkscreen', silkscreen: 'silkscreen' };
  // words people use for each section
  const SECTION_WORDS = [
    ['pricing', /\b(pricing|prices?|plans?|price list|tiers?)\b/],
    ['testimonials', /\b(testimonials?|reviews?|quotes?|what people say|kind words)\b/],
    ['faq', /\b(faqs?|questions|q ?& ?a)\b/],
    ['features', /\b(features?|what it does|what you get)\b/],
    ['gallery', /\b(gallery|screenshots?|screens|photos|pictures)\b/],
    ['story', /\b(story|about( us)?|the idea)\b/],
    ['team', /\b(team|made by|people|credits)\b/],
    ['roadmap', /\b(roadmap|milestones?)\b/],
    ['devlog', /\b(devlog|news|updates|changelog|lately)\b/],
    ['contact', /\b(contact|get in touch)\b/],
    ['visit', /\b(visit( us)?|hours|opening hours|location|address)\b/],
    ['event', /\b(event( details)?|rsvp)\b/],
    ['play', /\b(play( it)?|try it|demo)\b/],
    ['footer', /\bfooter\b/],
  ];
  const FIELD_WORDS = [
    [['hero', 'title'], /\b(headline|heading|main title|big title|hero title|title)\b/],
    [['hero', 'dek'], /\b(tagline|subtitle|sub ?heading|pitch|one[- ]liner|intro line|subhead)\b/],
    [['hero', 'kicker'], /\b(kicker|small line|eyebrow|label above)\b/],
    [['hero', 'cta'], /\b(button|cta|call to action)\b/],
    [['footer', 'text'], /\bfooter( line| text)?\b/],
  ];
  const sectionOf = t => { for (const [k, re] of SECTION_WORDS) if (re.test(t)) return k; return null; };
  const unq = s => String(s || '').trim().replace(/^[:\s]+/, '').replace(/^["“'‘]+|["”'’.!]+$/g, '').trim();
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  function colorOf(t) {
    const h = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(t);
    if (h) { const x = h[1].length === 3 ? h[1].split('').map(c => c + c).join('') : h[1]; return { color: '#' + x.toUpperCase(), name: '#' + x.toUpperCase() }; }
    const words = Object.keys(COLORS).sort((a, b) => b.length - a.length);
    for (const w of words) if (new RegExp(`\\b${w}\\b`).test(t)) return { color: COLORS[w], name: w };
    return null;
  }

  function parse(text, ctx = {}) {
    const raw = String(text || '').trim().slice(0, 600); if (!raw) return null;
    const t = raw.toLowerCase().replace(/\s+/g, ' ');
    const pick = ctx.pick && ctx.pick.text ? ctx.pick : null;
    const one = (op, say) => ({ ops: [op], say });

    if (/^(undo|undo (that|it|this|the last (change|edit))|go back|revert( that)?)\.?$/.test(t)) return one({ op: 'undo' }, 'Undid the last change.');
    let m = /^(?:save|keep|snapshot|bookmark)\b(?: (?:this|it|the site|a))?(?: version| snapshot| one)?(?: (?:as|called|named|:)\s*(.+))?$/i.exec(raw);
    if (m && /^(save|keep|snapshot|bookmark)/i.test(raw) && !/\b(section|color|accent)\b/.test(t)) return one({ op: 'save', note: unq(m[1] || '') }, 'Saved this version to the shelf.');

    // the logo
    if (/\b(add|use|upload|put|set|change|swap|replace)\b.*\b(my |our |a |the |new )?logo\b/.test(t)) return one({ op: 'logo' }, 'Pick your logo file (PNG, JPG or SVG, under 200 KB).');
    if (/\b(remove|delete|drop|hide)\b.*\blogo\b/.test(t)) return one({ op: 'logo', clear: true }, 'Took the logo off.');

    // templates / themes / layouts / fonts
    m = /([a-z]+(?: [a-z]+)?)\s+(template|theme|look|style|layout|font|fonts|typeface)\b/.exec(t) || /\b(template|theme|look|style|layout|font|typeface)\b\s*(?:to|:)\s*([a-z ]{3,20})$/.exec(t);
    if (m && /\b(swap|switch|change|go|use|try|apply|make|set|pick|want)\b|^(template|theme|layout|font)\b/.test(t)) {
      const two = /^(template|theme|look|style|layout|font|typeface)$/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
      const words = String(two[0]).trim().split(' '), kind = two[1];
      const cands = [words.join(' '), words[words.length - 1]];
      for (const n of cands) {
        if (/font|typeface/.test(kind)) { if (FONTS[n]) return one({ op: 'font', font: FONTS[n] }, `Switched the headline font to ${cap(n)}.`); continue; }
        if (kind === 'layout' && LAYOUTS[n]) return one({ op: 'layout', layout: LAYOUTS[n] }, `Switched to the ${cap(n)} layout.`);
        if (THEMES[n]) return one({ op: 'theme', theme: THEMES[n] }, `Swapped to the ${cap(n.replace(/ warm$/, ''))} look: its colors, fonts and layout.`);
        if (LAYOUTS[n]) return one({ op: 'layout', layout: LAYOUTS[n] }, `Switched to the ${cap(n)} layout.`);
      }
    }

    // colors: "change the accent to teal", "make the main color blue", "use #2A8C80 for the brand color"
    if (/\b(accent|highlight|second(ary)? colou?r)\b/.test(t)) { const c = colorOf(t); if (c) return one({ op: 'accent', ...c }, `Changed the accent to ${c.name}.`); }
    if (/\b(main|brand|primary|base|site|page|theme)?\s*colou?rs?\b/.test(t) && (!pick || /\b(main|brand|primary|site|page|theme)\b/.test(t))) { const c = colorOf(t); if (c && /\b(colou?r|make|change|set|use|turn|switch)\b/.test(t)) return one({ op: 'primary', ...c }, `Changed the main color to ${c.name}.`); }

    // sections: add / remove / move
    m = /^(?:please )?(?:add|include|put in|insert|show|bring back|turn on)\b\s*(?:a |an |the |some |my |our )?(.+)$/.exec(t);
    if (m) { const k = sectionOf(m[1]); if (k && k !== 'footer') return one({ op: 'add', section: k }, `Added the ${k === 'faq' ? 'FAQ' : k} section.`); }
    m = /^(?:please )?(?:remove|delete|drop|hide|take out|get rid of|turn off|lose)\b\s*(?:the |a |an |that |this |my |our )?(.+)$/.exec(t);
    if (m) {
      const k = sectionOf(m[1]);
      if (k && k !== 'hero') return one({ op: 'remove', section: k }, `Took out the ${k === 'faq' ? 'FAQ' : k} section. Say “undo” to bring it back.`);
    }
    m = /^(?:move|put|bring)\b\s*(?:the )?(.+?)\s+(up|down|to the top|to the bottom|first|last|higher|lower)$/.exec(t);
    if (m) { const k = sectionOf(m[1]); if (k && !['hero', 'footer'].includes(k)) { const to = /up|higher/.test(m[2]) ? 'up' : /down|lower/.test(m[2]) ? 'down' : /top|first/.test(m[2]) ? 'top' : 'bottom'; return one({ op: 'move', section: k, to }, `Moved the ${k} section ${to === 'up' || to === 'down' ? to : 'to the ' + to}.`); } }

    // words: "make the headline say …", "change the tagline to …", "headline: …", "rename the FAQ to …"
    const SAY = /^(?:please )?(?:make|change|set|update|rename|replace|edit|have|let)?\s*(?:the |our |my )?(.+?)\s+(?:say|says|read|reads|to say|to read|to|=|into)\s+(.+)$/i;
    m = SAY.exec(raw) || /^(?:the )?([a-z ]{3,30}?)\s*:\s*(.+)$/i.exec(raw);
    if (m) {
      const what = m[1].toLowerCase(), val = unq(m[2]);
      if (val && !colorOf(val.toLowerCase()) || (val && /\b(say|says|read|reads)\b/i.test(raw))) {
        if (/^(it|this|that|the text|this text|the words)$/.test(what.trim()) && pick) return one({ op: 'text', before: pick.text, after: val }, 'Changed the words.');
        for (const [[sec, field], re] of FIELD_WORDS) if (re.test(what) && !(field === 'title' && sectionOf(what) && !/headline|hero|main title|big title/.test(what))) return one({ op: 'copy', section: sec, field, value: val }, `Changed the ${field === 'dek' ? 'tagline' : field === 'cta' ? 'button' : field === 'title' ? 'headline' : field === 'kicker' ? 'small line' : 'footer'} to “${val}”.`);
        const k = sectionOf(what);
        if (k && /\b(title|heading|name)\b|^(the )?\w+ section$|^(the )?\w+$/.test(what)) return one({ op: 'copy', section: k, field: k === 'footer' ? 'text' : 'title', value: val }, `Renamed the ${k} section to “${val}”.`);
      }
    }
    // a picked element and plain new words: "Fresh bread daily" after picking the headline is ambiguous: leave it to the AI
    return null;
  }

  return { parse, COLORS, THEMES, LAYOUTS, FONTS, sectionOf, colorOf };
});
