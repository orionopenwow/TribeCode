// The website designer's model (feat/flint-site), shared by the browser (window.TribeSiteCfg) and the server (require).
// One JSON site config is the source of truth, after OpenPage (github.com/buildingopen/openpage, MIT; reimplemented in
// plain JS, no code copied, see NOTICE): blocks with layout variants, theme presets with a real dark variant, pages,
// links that go somewhere, and a standalone HTML export.
//   cfg = { v: 1, name, theme: { preset, mode: 'light'|'dark', colors: {bg, ink, muted, card, line, accent}, fonts: {display, body}, radius },
//           pages: [{ id, slug, title, blocks: [{ id, type, variant, props }] }] }
//   BLOCKS[type] = { label, variants, make(name) -> props }      PRESETS[id] = { name, colors, fonts, radius }
//   blank(name) · fromTemplate(id, siteJson, img(rel) -> url) · normalize(cfg) · colors(cfg) (the mode applied)
//   render(cfg, { page, edit, mode: 'single'|'pages', fonts }) -> HTML     exportFiles(cfg) -> { 'index.html': text, … , images: [...] }
//   ops: addPage, renamePage, deletePage, addBlock, removeBlock, moveBlock, setVariant, setProp, setTheme, setMode, setColor,
//        setLink, autoWire, setImage, imageShape, imageAlt, setText — each returns a NEW cfg (undo keeps the old one)
//   command(cfg, step, at) -> { cfg?, say, need?, boost? }   runs one step from Flint's local brain (app/ui/flintnlu.js)
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeSiteCfg = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  let seq = 0;
  const uid = p => (p || 'b') + Date.now().toString(36).slice(-4) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
  const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'page';
  const L = (label, kind, to) => ({ label, link: { kind: kind || '', to: to || '' } });

  // ---------- color ----------
  const hex = h => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); return isNaN(n) ? [0, 0, 0] : [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = a => '#' + a.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = h => { const c = hex(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const isDark = c => lum(c.bg) < 0.2;
  function readable(accent, bg) { let a = accent; for (let i = 0; i < 8 && contrast(a, bg) < 3; i++) a = mix(a, lum(bg) < 0.2 ? '#FFFFFF' : '#000000', 0.18); return a; }
  // the other mode of a palette: a real variant, not a filter (paper stays warm, night stays tinted by the accent)
  function flip(c, toDark) {
    if (toDark) { const bg = mix('#121316', c.accent, 0.05); return { bg, card: mix(bg, '#FFFFFF', 0.06), ink: mix('#F3F0EA', c.bg, 0.1), muted: mix('#A8A39A', c.bg, 0.1), line: mix(bg, '#FFFFFF', 0.14), accent: readable(c.accent, bg) }; }
    const bg = mix('#FAF8F4', c.accent, 0.03); return { bg, card: '#FFFFFF', ink: mix('#1B1A17', c.bg, 0.1), muted: '#625E57', line: mix(bg, '#000000', 0.1), accent: readable(c.accent, bg) };
  }
  const FONT = { 'Fraunces': ['fraunces-latin-700-normal', 700, 'Georgia, serif'], 'Instrument Serif': ['instrument-serif-latin-400-normal', 400, 'Georgia, serif'], 'Space Grotesk': ['space-grotesk-latin-700-normal', 700, 'system-ui, sans-serif'], 'Bricolage Grotesque': ['bricolage-grotesque-latin-800-normal', 800, 'system-ui, sans-serif'], 'JetBrains Mono': ['jetbrains-mono-latin-700-normal', 700, 'ui-monospace, monospace'], 'Silkscreen': ['silkscreen-latin-400-normal', 400, 'ui-monospace, monospace'], 'Inter': ['inter-latin-400-normal', 400, 'system-ui, sans-serif'] };
  const stack = f => FONT[f] ? `'${f}', ${FONT[f][2]}` : /mono/i.test(f || '') ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : /serif/i.test(f || '') && !/sans/i.test(f || '') ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // ---------- theme presets ----------
  const PRESETS = {
    paper: { name: 'Paper', colors: { bg: '#F1EADB', ink: '#2B241C', muted: '#6E604E', card: '#FBF7EE', line: '#D8CDB8', accent: '#B4532C' }, fonts: { display: 'Instrument Serif', body: 'System sans' }, radius: 10 },
    swiss: { name: 'Swiss', colors: { bg: '#F6F5F2', ink: '#111111', muted: '#55524D', card: '#FFFFFF', line: '#111111', accent: '#E2361B' }, fonts: { display: 'Space Grotesk', body: 'Inter' }, radius: 0 },
    editorial: { name: 'Editorial', colors: { bg: '#F7F4EE', ink: '#1F1A15', muted: '#6A6157', card: '#FFFFFF', line: '#D9D0C2', accent: '#8C3B22' }, fonts: { display: 'Fraunces', body: 'Inter' }, radius: 4 },
    terminal: { name: 'Terminal', colors: { bg: '#0E1110', ink: '#D7F5DD', muted: '#86A58C', card: '#151A18', line: '#26302B', accent: '#5BE37D' }, fonts: { display: 'JetBrains Mono', body: 'JetBrains Mono' }, radius: 2 },
    playful: { name: 'Playful', colors: { bg: '#FFF6E9', ink: '#24163A', muted: '#5E5170', card: '#FFFFFF', line: '#24163A', accent: '#FF5A4E' }, fonts: { display: 'Bricolage Grotesque', body: 'Inter' }, radius: 18 },
    minimal: { name: 'Minimal', colors: { bg: '#FFFFFF', ink: '#16181D', muted: '#62666E', card: '#F6F6F4', line: '#E4E4E0', accent: '#2C5BE0' }, fonts: { display: 'Inter', body: 'Inter' }, radius: 8 },
    bold: { name: 'Bold', colors: { bg: '#111111', ink: '#F4F1E8', muted: '#A39F94', card: '#1C1C1C', line: '#2E2E2E', accent: '#F7D13D' }, fonts: { display: 'Bricolage Grotesque', body: 'Inter' }, radius: 0 },
    soft: { name: 'Soft', colors: { bg: '#F3F0F7', ink: '#2A2438', muted: '#685F7A', card: '#FFFFFF', line: '#DDD6E8', accent: '#7A5CCB' }, fonts: { display: 'Fraunces', body: 'Inter' }, radius: 16 },
  };

  // ---------- blocks: what tribecode.org's own site has, each with layout variants ----------
  const BLOCKS = {
    hero: { label: 'Hero', variants: ['center', 'split', 'minimal'], make: n => ({ eyebrow: '', title: n || 'Say what it is in one line', text: 'One or two sentences on who it is for and why it helps.', img: '', alt: '', shape: '', buttons: [L('Get in touch'), L('See the work')] }) },
    features: { label: 'Features', variants: ['grid', 'list', 'stats'], make: () => ({ title: 'What you get', items: [{ title: 'Made by hand', text: 'Say one plain thing people get.' }, { title: 'Close to home', text: 'A second, specific reason.' }, { title: 'Fair prices', text: 'A third, with a real detail.' }] }) },
    gallery: { label: 'Gallery', variants: ['grid', 'masonry', 'strip'], make: () => ({ title: 'Gallery', items: [{ img: '', alt: 'A picture', caption: '' }, { img: '', alt: 'A picture', caption: '' }, { img: '', alt: 'A picture', caption: '' }] }) },
    pricing: { label: 'Pricing', variants: ['cards', 'table'], make: () => ({ title: 'Prices', note: 'Set your real prices here.', plans: [{ name: 'Basic', price: '$0', per: '', features: ['The essentials'], button: L('Start') }, { name: 'Plus', price: '$12', per: '/ month', features: ['Everything in Basic', 'One more thing'], button: L('Choose Plus') }] }) },
    testimonials: { label: 'Testimonials', variants: ['cards', 'quotes'], make: () => ({ title: 'What people say', items: [{ quote: 'Add a real quote from a real customer here.', name: 'Their name', role: 'Where they are from' }] }) },
    faq: { label: 'FAQ', variants: ['list', 'columns'], make: () => ({ title: 'Questions', items: [{ q: 'A question people ask?', a: 'A short, honest answer.' }, { q: 'Another one?', a: 'Another answer.' }] }) },
    team: { label: 'Team', variants: ['grid', 'list'], make: () => ({ title: 'Who we are', items: [{ name: 'A name', role: 'What they do', img: '', alt: '' }, { name: 'Another name', role: 'What they do', img: '', alt: '' }] }) },
    links: { label: 'Links (link in bio)', variants: ['stack', 'cards', 'pills'], make: n => ({ name: n || 'Your name', bio: 'A line about you.', img: '', alt: '', shape: 'round', items: [{ label: 'My shop', note: '', link: { kind: 'url', to: 'https://example.com' } }, { label: 'Latest video', note: '', link: { kind: '', to: '' } }], socials: [] }) },
    list: { label: 'List (menu, dates, episodes)', variants: ['rows', 'cards', 'menu'], make: () => ({ title: 'Coming up', items: [{ title: 'Something', meta: 'Date or price', text: '', link: { kind: '', to: '' } }] }) },
    contact: { label: 'Contact form', variants: ['form', 'simple'], make: () => ({ title: 'Get in touch', text: 'Write a line and we will answer within a day.', email: '', action: '', button: 'Send' }) },
    embed: { label: 'Video / embed', variants: ['wide', 'inline'], make: () => ({ title: '', url: '', caption: 'Paste a YouTube, Vimeo, Spotify or SoundCloud link.' }) },
    text: { label: 'Text', variants: ['plain', 'two'], make: () => ({ title: 'Our story', text: 'Tell it in a few honest sentences.' }) },
    footer: { label: 'Footer', variants: ['simple', 'columns'], make: n => ({ text: `© ${n || 'Us'}`, links: [] }) },
  };
  const TYPES = Object.keys(BLOCKS);
  const block = (type, props, variant) => ({ id: uid('b'), type, variant: variant || BLOCKS[type].variants[0], props: props || BLOCKS[type].make() });
  const page = (title, blocks) => ({ id: uid('p'), slug: slugify(title) === 'home' ? 'index' : slugify(title), title, blocks: blocks || [] });

  function blank(name) {
    name = name || 'My site';
    return normalize({ v: 1, name, theme: { preset: 'minimal', mode: 'light', ...clone(PRESETS.minimal) }, pages: [page('Home', [block('hero', BLOCKS.hero.make(name)), block('features'), block('contact'), block('footer', BLOCKS.footer.make(name))])] });
  }
  function normalize(c) {
    c = c && typeof c === 'object' ? c : {};
    c.v = 1; c.name = String(c.name || 'My site').slice(0, 80);
    const t = c.theme || {}, p = PRESETS[t.preset] || PRESETS.minimal;
    c.theme = { preset: t.preset || 'minimal', mode: t.mode === 'dark' ? 'dark' : 'light', colors: { ...p.colors, ...(t.colors || {}) }, fonts: { ...p.fonts, ...(t.fonts || {}) }, radius: Number.isFinite(+t.radius) ? +t.radius : p.radius };
    c.theme.base = t.base || (isDark(c.theme.colors) ? 'dark' : 'light');
    if (!Array.isArray(c.pages) || !c.pages.length) c.pages = [page('Home')];
    const seen = new Set();
    c.pages.forEach((pg, i) => { pg.id = pg.id || uid('p'); pg.title = String(pg.title || 'Page').slice(0, 40); pg.slug = i === 0 ? 'index' : (pg.slug && pg.slug !== 'index' ? pg.slug : slugify(pg.title)); while (seen.has(pg.slug)) pg.slug += '-2'; seen.add(pg.slug); pg.blocks = (pg.blocks || []).filter(b => b && BLOCKS[b.type]).map(b => ({ id: b.id || uid('b'), type: b.type, variant: BLOCKS[b.type].variants.includes(b.variant) ? b.variant : BLOCKS[b.type].variants[0], props: b.props || BLOCKS[b.type].make() })); });
    return c;
  }
  function colors(c) { const t = c.theme; return t.mode === t.base ? t.colors : (t.alt && t.alt[t.mode]) || flip(t.colors, t.mode === 'dark'); }

  // ---------- templates: the 16 in templates/sites/<id>/site.json, as configs ----------
  const pick = (a, n) => (Array.isArray(a) ? a.slice(0, n || 12) : []);
  const lk = u => { u = String(u || ''); return !u ? { kind: '', to: '' } : /^mailto:/i.test(u) ? { kind: 'email', to: u.slice(7) } : /@/.test(u) && !/\//.test(u) ? { kind: 'email', to: u } : { kind: 'url', to: u }; };
  const TPL = {
    linkbio: (d, I) => [[block('links', { name: d.name, bio: [d.handle, d.bio].filter(Boolean).join(' · '), img: I(d.avatar), alt: `${d.name}`, shape: 'round', items: pick(d.links).map(x => ({ label: x.label, note: x.note || '', link: lk(x.url) })), socials: pick(d.socials).map(x => ({ label: x.label, link: lk(x.url) })) }), block('footer', { text: d.footer || '', links: [] })]],
    band: (d, I) => [[block('hero', { eyebrow: 'On tour', title: d.name, text: d.tagline, img: I(d.hero), alt: 'The band on stage', shape: '', buttons: [L('Tour dates', 'section', 'list'), L('Booking', 'email', d.booking)] }, 'split'), block('list', { title: 'Tour dates', items: pick(d.shows).map(s => ({ title: `${s.city} · ${s.venue}`, meta: s.date, text: s.status || '', link: lk(s.url) })) }), block('gallery', { title: 'Records', items: pick(d.releases).map(r => ({ img: I(r.img), alt: r.title, caption: `${r.title} · ${r.kind} ${r.year}` })) }), block('text', { title: 'About', text: d.bio }), block('contact', { title: 'Booking', text: 'Shows, press and festivals.', email: d.booking, action: '', button: 'Send' }), block('footer', { text: d.name, links: pick(d.socials).map(x => ({ label: x.label, link: lk(x.url) })) })]],
    cafe: (d, I) => [[block('hero', { eyebrow: 'Open today', title: d.name, text: d.tagline, img: I(d.photo), alt: 'Inside the café', shape: '', buttons: [L('See the menu', 'page', 'menu'), L('Reserve', 'url', d.reserve)] }, 'split'), block('list', { title: 'Hours', items: pick(d.hours).map(h => ({ title: h.d, meta: h.h, text: '' })) }, 'rows'), block('gallery', { title: 'The room', items: pick(d.gallery).map(g => ({ img: I(g.img), alt: g.alt, caption: '' })) }), block('contact', { title: 'Find us', text: `${d.address} · ${d.phone}`, email: '', action: '', button: 'Send' }, 'simple'), block('footer', { text: d.name, links: [] })],
      ['Menu', pick(d.menu).map(m => block('list', { title: m.section, items: pick(m.items, 20).map(it => ({ title: it.name || it.n || it.t || '', meta: it.price || it.p || '', text: it.note || it.d || '' })) }, 'menu'))]],
    merch: (d, I) => [[block('hero', { eyebrow: 'New batch', title: d.name, text: d.tagline, img: I((d.products[0] || {}).img), alt: (d.products[0] || {}).name || '', shape: '', buttons: [L('Shop', 'section', 'gallery'), L('Questions', 'section', 'faq')] }, 'split'), block('gallery', { title: 'Shop', items: pick(d.products).map(p => ({ img: I(p.img), alt: p.name, caption: `${p.name} · ${d.currency || '$'}${p.price}` })) }), block('features', { title: 'How we make them', items: pick(d.facts).map(f => ({ title: f.title, text: f.text })) }), block('faq', { title: 'Questions', items: pick(d.faq).map(f => ({ q: f.q, a: f.a })) }), block('contact', { title: 'Write to us', text: d.intro || '', email: d.contact, action: '', button: 'Send' }), block('footer', { text: d.name, links: [] })]],
    portfolio: (d, I) => [[block('hero', { eyebrow: d.role, title: d.name, text: d.statement, img: '', alt: '', shape: '', buttons: [L('Selected work', 'section', 'gallery'), L('Email', 'email', d.email)] }, 'minimal'), block('gallery', { title: 'Selected work', items: pick(d.work).map(w => ({ img: I(w.img), alt: w.title, caption: `${w.title} · ${w.client}, ${w.year}` })) }, 'masonry'), block('features', { title: 'Services', items: pick(d.services).map(s => ({ title: s.s || s, text: '' })) }, 'list'), block('contact', { title: 'Work with me', text: 'Tell me about the room.', email: d.email, action: '', button: 'Send' }), block('footer', { text: d.name, links: [] })], ['About', [block('text', { title: 'About', text: d.about })]]],
    creator: (d, I) => [[block('hero', { eyebrow: d.next, title: d.name, text: d.tagline, img: I(d.face), alt: d.name, shape: 'round', buttons: [L('Watch live', 'url', d.watch), L('Schedule', 'section', 'list')] }, 'split'), block('list', { title: 'Schedule', items: pick(d.schedule).map(s => ({ title: s.day, meta: s.time, text: s.what })) }, 'cards'), block('gallery', { title: 'Videos', items: pick(d.videos).map(v => ({ img: I(v.img), alt: v.title, caption: `${v.title} · ${v.len}` })) }), block('features', { title: 'By the numbers', items: pick(d.stats).map(s => ({ title: s.n, text: s.t })) }, 'stats'), block('contact', { title: 'Business', text: 'Sponsorships and collabs.', email: d.email, action: '', button: 'Send' }), block('footer', { text: d.name, links: pick(d.socials).map(x => ({ label: x.label, link: lk(x.url) })) })]],
    service: (d, I) => [[block('hero', { eyebrow: d.phone, title: d.headline || d.name, text: d.tagline, img: '', alt: '', shape: '', buttons: [L('Book a visit', 'url', d.book), L('Prices', 'section', 'pricing')] }, 'center'), block('features', { title: 'Why us', items: pick(d.badges).map(b => ({ title: b.t, text: '' })) }, 'list'), block('pricing', { title: 'Prices', note: `We work in ${d.area}.`, plans: pick(d.services).map(s => ({ name: s.name, price: s.price, per: s.time ? `· ${s.time}` : '', features: [s.desc].filter(Boolean), button: L('Book', 'url', d.book) })) }, 'table'), block('testimonials', { title: 'Reviews', items: [{ quote: d.reviewsNote || 'Real reviews go here.', name: '', role: '' }] }), block('contact', { title: 'Call or write', text: d.phone, email: '', action: d.book, button: 'Book' }), block('footer', { text: d.name, links: [] })]],
    wedding: (d, I) => [[block('hero', { eyebrow: d.date, title: d.name, text: `${d.place}. ${d.note || ''}`.trim(), img: I(d.photo), alt: 'The venue', shape: '', buttons: [L('RSVP', 'section', 'contact'), L('Schedule', 'section', 'list')] }, 'center'), block('list', { title: 'The day', items: pick(d.schedule).map(s => ({ title: s.what, meta: s.time, text: s.where })) }), block('features', { title: 'Getting there', items: pick(d.travel).map(t => ({ title: t.t, text: t.d })) }), block('faq', { title: 'Questions', items: pick(d.faq).map(f => ({ q: f.q, a: f.a })) }), block('contact', { title: 'RSVP', text: d.rsvp && d.rsvp.by ? `Please answer by ${d.rsvp.by}.` : '', email: '', action: (d.rsvp || {}).url || '', button: 'Send RSVP' }), block('footer', { text: d.name, links: [] })]],
    podcast: (d, I) => [[block('hero', { eyebrow: 'A podcast', title: d.name, text: d.tagline, img: I(d.cover), alt: 'Show cover', shape: '', buttons: pick(d.listen, 2).map(x => L(x.label, 'url', x.url)) }, 'split'), block('list', { title: 'Episodes', items: pick(d.episodes).map(e => ({ title: `${e.no}. ${e.title}`, meta: `${e.date} · ${e.len}`, text: e.notes, link: lk(e.url) })) }), block('team', { title: 'Hosts', items: pick(d.hosts).map(h => ({ name: h.name, role: h.bio, img: '', alt: '' })) }, 'list'), block('contact', { title: 'Mailbag', text: 'Send us a question for the show.', email: d.ask, action: '', button: 'Send' }), block('footer', { text: d.name, links: [] })]],
    blog: (d, I) => [[block('hero', { eyebrow: `By ${d.author}`, title: d.name, text: d.tagline, img: '', alt: '', shape: '', buttons: [L('Subscribe', 'section', 'contact'), L('Read the latest', 'page', 'post')] }, 'minimal'), block('list', { title: 'Letters', items: pick(d.posts).map(p => ({ title: p.title, meta: p.date, text: p.dek, link: { kind: 'page', to: 'post' } })) }, 'cards'), block('contact', { title: 'Subscribe', text: (d.subscribe || {}).note || '', email: '', action: (d.subscribe || {}).url || '', button: 'Subscribe' }), block('footer', { text: d.author, links: [] })], ['Post', [block('text', { title: (d.post || {}).title || 'A post', text: String((d.post || {}).body || '').replace(/<[^>]+>/g, '') })]]],
    saas: (d, I) => [[block('hero', { eyebrow: 'Now in beta', title: d.name, text: d.tagline, img: I(d.shot), alt: 'The app', shape: '', buttons: [L((d.cta || {}).label || 'Try it', 'url', (d.cta || {}).url), L('Pricing', 'section', 'pricing')] }, 'split'), block('features', { title: 'What it does', items: pick(d.does).map(x => ({ title: x.t, text: x.d })) }), block('features', { title: 'What it does not do yet', items: pick(d.notyet).map(x => ({ title: x.t, text: '' })) }, 'list'), block('pricing', { title: 'Plans', note: '', plans: pick(d.plans).map(p => ({ name: p.name, price: p.price, per: p.per || '', features: [].concat(p.what || []), button: L('Choose', 'url', (d.cta || {}).url) })) }), block('list', { title: 'Changelog', items: pick(d.changelog).map(x => ({ title: x.t, meta: x.date, text: '' })) }), block('footer', { text: d.name, links: [] })]],
    gamepage: (d, I) => [[block('hero', { eyebrow: 'An indie game', title: d.name, text: d.tagline, img: I((d.shots[0] || {}).img), alt: (d.shots[0] || {}).alt || '', shape: '', buttons: [L((d.play || {}).label || 'Play', 'url', (d.play || {}).url), L('Press kit', 'page', 'press')] }, 'split'), block('embed', { title: 'Trailer', url: d.trailer, caption: '' }), block('gallery', { title: 'Screenshots', items: pick(d.shots).map(s => ({ img: I(s.img), alt: s.alt, caption: '' })) }, 'strip'), block('features', { title: 'Features', items: pick(d.features).map(f => ({ title: f.t, text: f.d })) }), block('list', { title: 'Devlog', items: pick(d.devlog).map(x => ({ title: x.t, meta: x.date, text: '' })) }), block('footer', { text: d.name, links: [] })],
      ['Press', [block('list', { title: 'Facts', items: pick(d.facts).map(f => ({ title: f.k, meta: f.v, text: '' })) }, 'rows'), block('contact', { title: 'Press', text: 'Keys and interviews.', email: d.press, action: '', button: 'Send' }, 'simple')]]],
    resume: (d, I) => [[block('hero', { eyebrow: d.where, title: d.name, text: `${d.role}. ${d.summary}`, img: I(d.photo), alt: d.name, shape: 'round', buttons: [L('Email me', 'email', d.email), ...pick(d.links, 1).map(x => L(x.label, 'url', x.url))] }, 'split'), block('list', { title: 'Experience', items: pick(d.jobs).map(j => ({ title: `${j.title} · ${j.org}`, meta: j.when, text: j.did })) }), block('features', { title: 'Skills', items: pick(d.skills).map(s => ({ title: s.s || s, text: '' })) }, 'list'), block('list', { title: 'Education', items: pick(d.school).map(s => ({ title: s.what, meta: s.when, text: s.where })) }), block('footer', { text: d.name, links: [] })]],
    nonprofit: (d, I) => [[block('hero', { eyebrow: d.name, title: d.mission, text: '', img: I(d.photo), alt: 'Our work', shape: '', buttons: [L((d.donate || {}).label || 'Donate', 'url', (d.donate || {}).url), L('Ways to help', 'section', 'features')] }, 'split'), block('features', { title: 'This year', items: pick(d.impact).map(x => ({ title: x.n, text: x.t })) }, 'stats'), block('text', { title: 'Our story', text: d.story }), block('features', { title: 'Ways to help', items: pick(d.ways).map(w => ({ title: w.t, text: w.d })) }), block('contact', { title: 'Write to us', text: (d.donate || {}).note || '', email: d.email, action: '', button: 'Send' }), block('footer', { text: d.name, links: [] })]],
    photography: (d, I) => [[block('hero', { eyebrow: 'Photography', title: d.name, text: d.tagline, img: '', alt: '', shape: '', buttons: [L('Prints and commissions', 'section', 'contact')] }, 'minimal'), block('gallery', { title: 'Recent', items: pick(d.photos).map(p => ({ img: I(p.img), alt: p.title, caption: `${p.title} · ${p.place}` })) }, 'masonry'), block('text', { title: 'About', text: d.about }), block('contact', { title: 'Contact', text: '', email: d.email, action: '', button: 'Send' }), block('footer', { text: d.name, links: [] })]],
    comingsoon: (d, I) => [[block('hero', { eyebrow: `Opening ${d.launchText}`, title: d.name, text: d.tagline, img: I(d.object), alt: '', shape: '', buttons: [L('Join the waitlist', 'section', 'contact')] }, 'split'), block('contact', { title: 'Join the waitlist', text: (d.waitlist || {}).note || '', email: '', action: (d.waitlist || {}).url || '', button: 'Join' }, 'simple'), block('footer', { text: d.name, links: [] })]],
  };
  const TPL_PRESET = { linkbio: 'paper', band: 'bold', cafe: 'paper', merch: 'swiss', portfolio: 'editorial', creator: 'playful', service: 'minimal', wedding: 'editorial', podcast: 'paper', blog: 'editorial', saas: 'minimal', gamepage: 'terminal', resume: 'minimal', nonprofit: 'paper', photography: 'bold', comingsoon: 'soft' };
  const TEMPLATES = Object.keys(TPL);
  function fromTemplate(id, d, I) {
    I = I || (x => x || ''); d = d || {};
    const pages = (TPL[id] || TPL.saas)(d, I);
    const th = d.theme || {}, p = PRESETS[TPL_PRESET[id]] || PRESETS.minimal, col = th.colors || {};
    const colors = { bg: col.bg || p.colors.bg, ink: col.ink || p.colors.ink, muted: col.muted || p.colors.muted, card: col.card || col.panel || col.soft || mix(col.bg || p.colors.bg, isDark({ bg: col.bg || '#fff' }) ? '#FFFFFF' : '#000000', 0.04), line: col.line || p.colors.line, accent: col.accent || p.colors.accent };
    const fonts = { display: (th.fonts || {}).display || p.fonts.display, body: (th.fonts || {}).body || p.fonts.body };
    const cfg = { v: 1, name: d.name || 'My site', template: id, theme: { preset: TPL_PRESET[id], mode: isDark(colors) ? 'dark' : 'light', colors, fonts, radius: p.radius }, pages: pages.map((x, i) => i === 0 ? page('Home', x) : page(x[0], x[1])) };
    return autoWire(normalize(cfg), null, { quiet: true }).cfg;
  }

  // ---------- links ----------
  const findPage = (c, to) => { const t = String(to || '').toLowerCase().trim(); return c.pages.find(p => p.slug === slugify(t) || p.title.toLowerCase() === t || p.id === to) || (t === 'home' ? c.pages[0] : null); };
  const findBlock = (pg, to) => { const t = String(to || '').toLowerCase().trim(); return (pg.blocks || []).find(b => b.id === to || b.type === t || String(b.props.title || '').toLowerCase() === t) || null; };
  function href(c, link, here, mode) {
    if (!link || !link.to) return '';
    const k = link.kind, to = String(link.to);
    if (k === 'email') return 'mailto:' + to.replace(/^mailto:/i, '');
    if (k === 'url') return /^(https?:|mailto:|tel:)/i.test(to) ? to : /^www\./i.test(to) ? 'https://' + to : /^[\w-]+\.[a-z]{2,}/i.test(to) ? 'https://' + to : '';
    const pageUrl = p => mode === 'pages' ? (p.slug === 'index' ? 'index.html' : p.slug + '.html') : '#p-' + p.slug;
    if (k === 'page') { const p = findPage(c, to); return p ? pageUrl(p) : ''; }
    if (k === 'section') {
      for (const p of [here, ...c.pages]) { if (!p) continue; const b = findBlock(p, to); if (b) return p === here ? '#b-' + b.id : mode === 'pages' ? pageUrl(p) + '#b-' + b.id : pageUrl(p); }
      return '';
    }
    return '';
  }
  // every button in a page: [{ block, path, label, link }] (path = props path to the { label, link } object or link holder)
  function buttons(pg) {
    const out = [];
    (pg.blocks || []).forEach(b => {
      const P = b.props || {};
      if (b.type === 'hero') (P.buttons || []).forEach((x, i) => out.push({ block: b, path: `buttons.${i}`, label: x.label, link: x.link }));
      if (b.type === 'pricing') (P.plans || []).forEach((x, i) => x.button && out.push({ block: b, path: `plans.${i}.button`, label: x.button.label, link: x.button.link }));
      if (b.type === 'links') (P.items || []).forEach((x, i) => out.push({ block: b, path: `items.${i}`, label: x.label, link: x.link }));
      if (b.type === 'footer') (P.links || []).forEach((x, i) => out.push({ block: b, path: `links.${i}`, label: x.label, link: x.link }));
    });
    return out;
  }
  const getAt = (o, path) => String(path).split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setAt = (o, path, v) => { const ks = String(path).split('.'), last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] == null ? (/^\d+$/.test(k) ? [] : {}) : a[k]), o); t[last] = v; };
  // which section or page a button's words point at
  const GUESS = [[/contact|touch|email|write|book|reserve|rsvp|hire|call|join|waitlist|sign ?up|subscribe|quote|enquir|inquir|send|ask/i, ['contact']], [/price|pricing|plan|buy|order|shop|store|cart|get it/i, ['pricing', 'gallery']], [/work|portfolio|gallery|photos|see|look|records|shots|videos/i, ['gallery', 'list']], [/menu|dates|tour|shows|episodes|schedule|events|listen|letters|read/i, ['list', 'embed']], [/watch|trailer|video|play/i, ['embed', 'gallery']], [/about|story|who|team|us\b/i, ['text', 'team']], [/question|faq|help/i, ['faq']], [/feature|how it works|learn more|more|start|get started|try/i, ['features', 'pricing', 'contact']]];
  function guess(c, pg, label) {
    const lab = String(label || '');
    const pgHit = c.pages.find(p => p !== pg && p.slug !== 'index' && new RegExp(`\\b${p.title.replace(/[^\w ]/g, '')}\\b`, 'i').test(lab)); if (pgHit) return { kind: 'page', to: pgHit.slug };
    for (const [rx, types] of GUESS) if (rx.test(lab)) for (const t of types) { const b = (pg.blocks || []).find(x => x.type === t); if (b) return { kind: 'section', to: b.id }; for (const p of c.pages) { const bb = (p.blocks || []).find(x => x.type === t); if (bb) return { kind: 'section', to: bb.id }; } }
    return null;
  }
  // "make the buttons work": every unwired button goes somewhere real; a contact form is added when nothing else fits
  function autoWire(c, pageId, opts = {}) {
    c = clone(c); let n = 0; const made = [];
    for (const pg of pageId ? c.pages.filter(p => p.id === pageId) : c.pages) {
      for (const b of buttons(pg)) {
        if (b.link && b.link.to && href(c, b.link, pg, 'single')) continue;
        let t = guess(c, pg, b.label);
        if (!t && !opts.quiet) { let cb = (pg.blocks || []).find(x => x.type === 'contact'); if (!cb) { cb = block('contact'); const fi = pg.blocks.findIndex(x => x.type === 'footer'); pg.blocks.splice(fi < 0 ? pg.blocks.length : fi, 0, cb); made.push('a contact form'); } t = { kind: 'section', to: cb.id }; }
        if (!t) continue;
        const holder = getAt(b.block.props, b.path); if (holder && typeof holder === 'object') { holder.link = t; n++; }
      }
    }
    return { cfg: c, n, made };
  }

  // ---------- ops (each returns a new cfg) ----------
  const pageOf = (c, id) => c.pages.find(p => p.id === id) || c.pages[0];
  function addPage(c, title, at) {
    c = clone(c); title = String(title || '').trim() || `Page ${c.pages.length + 1}`;
    const kind = /contact/i.test(title) ? ['hero', 'contact'] : /about|story/i.test(title) ? ['hero', 'text', 'team'] : /price|pricing/i.test(title) ? ['hero', 'pricing', 'faq'] : /faq|question/i.test(title) ? ['hero', 'faq'] : /gallery|work|photos|portfolio/i.test(title) ? ['hero', 'gallery'] : /shop|store/i.test(title) ? ['hero', 'gallery', 'pricing'] : /team/i.test(title) ? ['hero', 'team'] : /menu|tour|dates|events|episodes/i.test(title) ? ['hero', 'list'] : ['hero', 'text'];
    const p = page(title, kind.map(t => t === 'hero' ? block('hero', { eyebrow: c.name, title, text: '', img: '', alt: '', shape: '', buttons: [] }, 'minimal') : block(t)));
    const foot = c.pages[0].blocks.find(b => b.type === 'footer'); if (foot) p.blocks.push(block('footer', clone(foot.props), foot.variant));
    c.pages.splice(at == null ? c.pages.length : at, 0, p);
    return { cfg: normalize(c), page: c.pages.find(x => x.title === title && x.blocks.length === p.blocks.length) || p };
  }
  function renamePage(c, id, title) { c = clone(c); const p = pageOf(c, id); p.title = String(title).slice(0, 40); if (p.slug !== 'index') p.slug = slugify(title); return normalize(c); }
  function deletePage(c, id) { c = clone(c); const i = c.pages.findIndex(p => p.id === id); if (i <= 0) return null; const gone = c.pages[i]; c.pages.splice(i, 1); c.pages.forEach(p => buttons(p).forEach(b => { if (b.link && b.link.kind === 'page' && findPage({ pages: [gone] }, b.link.to)) b.link.to = ''; })); return normalize(c); }
  function addBlock(c, pageId, type, variant, at) { c = clone(c); const p = pageOf(c, pageId), b = block(type, BLOCKS[type].make(c.name), variant); const fi = p.blocks.findIndex(x => x.type === 'footer'); p.blocks.splice(at != null ? at : fi < 0 ? p.blocks.length : fi, 0, b); return { cfg: c, block: b }; }
  function removeBlock(c, pageId, id) { c = clone(c); const p = pageOf(c, pageId); p.blocks = p.blocks.filter(b => b.id !== id); return c; }
  function moveBlock(c, pageId, id, to) { c = clone(c); const p = pageOf(c, pageId), i = p.blocks.findIndex(b => b.id === id); if (i < 0) return c; const [b] = p.blocks.splice(i, 1); let j = to === 'top' ? 0 : to === 'bottom' ? p.blocks.length : to === 'up' ? i - 1 : to === 'down' ? i + 1 : +to; j = Math.max(0, Math.min(p.blocks.length, j)); p.blocks.splice(j, 0, b); return c; }
  function setVariant(c, pageId, id, v) { c = clone(c); const b = pageOf(c, pageId).blocks.find(x => x.id === id); if (b) { const vs = BLOCKS[b.type].variants; b.variant = vs.includes(v) ? v : vs[(vs.indexOf(b.variant) + 1) % vs.length]; } return c; }
  function setProp(c, pageId, id, path, v) { c = clone(c); const b = pageOf(c, pageId).blocks.find(x => x.id === id); if (b) setAt(b.props, path, v); return c; }
  function setTheme(c, preset) { c = clone(c); const p = PRESETS[preset]; if (!p) return c; const mode = c.theme.mode; c.theme = { preset, mode: 'light', ...clone(p) }; c.theme.base = isDark(p.colors) ? 'dark' : 'light'; c.theme.mode = mode; return normalize(c); }
  function setMode(c, mode) { c = clone(c); c.theme.mode = mode === 'dark' ? 'dark' : 'light'; return c; }
  function setColor(c, hexv) { c = clone(c); c.theme.colors.accent = readable(hexv, c.theme.colors.bg); return c; }
  function setLink(c, pageId, id, path, link) { c = clone(c); const b = pageOf(c, pageId).blocks.find(x => x.id === id); const h = b && getAt(b.props, path); if (h && typeof h === 'object') h.link = link; return c; }
  function images(pg) { const out = []; (pg.blocks || []).forEach(b => { if ('img' in b.props) out.push({ block: b, path: '' }); ['items'].forEach(k => (b.props[k] || []).forEach((x, i) => { if (x && 'img' in x) out.push({ block: b, path: `${k}.${i}.` }); })); }); return out; }
  function setImage(c, pageId, id, path, src, alt) { c = clone(c); const b = pageOf(c, pageId).blocks.find(x => x.id === id); if (b) { setAt(b.props, path + 'img', src); if (alt != null) setAt(b.props, path + 'alt', alt); } return c; }
  function imageShape(c, pageId, id, path, shape) { c = clone(c); const b = pageOf(c, pageId).blocks.find(x => x.id === id); if (b) setAt(b.props, path + 'shape', shape === 'round' ? 'round' : 'square'); return c; }

  // ---------- Flint: one understood step -> a change ----------
  // at = { page: id, sel: { block, path } }. Returns { cfg?, say, page?, sel?, need? ('upload'|'board'|'pick'), boost? }
  const TYPEW = { gallery: 'gallery', pricing: 'pricing', testimonials: 'testimonials', faq: 'faq', contact: 'contact', team: 'team', embed: 'embed', features: 'features', links: 'links', footer: 'footer', hero: 'hero', text: 'text' };
  function command(c, s, at) {
    at = at || {}; const sl = s.slots || {}, id = s.intent, pg = pageOf(c, at.page), sel = at.sel || {};
    const selBlock = sel.block && pg.blocks.find(b => b.id === sel.block);
    const blk = t => (selBlock && (!t || selBlock.type === t) ? selBlock : pg.blocks.find(b => b.type === t)) || (t ? c.pages.map(p => p.blocks.find(b => b.type === t)).find(Boolean) : null);
    if (id === 'site.wire') {
      const target = sl.to ? (() => {
        if (sl.kind === 'url' || sl.kind === 'email') return { kind: sl.kind, to: sl.kind === 'url' && !/^https?:|^www\./.test(sl.to) ? `https://${sl.to}.com` : sl.to };
        const p = findPage(c, sl.to); if (p) return { kind: 'page', to: p.slug };
        const b = c.pages.map(x => findBlock(x, TYPEW[sl.to] || sl.to)).find(Boolean); if (b) return { kind: 'section', to: b.id };
        return { kind: 'newpage', to: sl.to };
      })() : null;
      if (!target) { const r = autoWire(c, pg.id); return r.n ? { cfg: r.cfg, say: `Wired ${r.n} button${r.n === 1 ? '' : 's'} on ${pg.title} to the right sections${r.made.length ? `, and added ${r.made.join(', ')} so they have somewhere to go` : ''}. Click one in the preview to see where it goes.` } : { say: `Every button on ${pg.title} already goes somewhere. Pick one and say "link this to the contact page" to change it.` }; }
      let cfg = c, t = target, extra = '';
      if (t.kind === 'newpage') { const r = addPage(c, titleCase(t.to)); cfg = r.cfg; t = { kind: 'page', to: r.page.slug }; extra = ` I made the ${r.page.title} page for it.`; }
      const btn = sel.path && selBlock ? { block: selBlock, path: sel.path } : (() => { const bs = buttons(pageOf(cfg, pg.id)); return bs.find(b => !b.link || !b.link.to) || bs[0]; })();
      if (!btn) return { say: 'This page has no buttons yet. Say "add a hero" and it comes with two.' };
      cfg = setLink(cfg, pg.id, btn.block.id, btn.path, t);
      const label = (getAt(btn.block.props, btn.path) || {}).label || 'The button';
      return { cfg, say: `“${label}” now goes to ${t.kind === 'email' ? `an email to ${t.to}` : t.kind === 'url' ? t.to : t.kind === 'page' ? `the ${findPage(cfg, t.to).title} page` : `the ${(c.pages.map(x => findBlock(x, t.to)).find(Boolean) || {}).type || ''} section`}.${extra}` };
    }
    if (id === 'site.page.add') { const r = addPage(c, sl.name); return { cfg: r.cfg, page: r.page.id, say: `Added the ${r.page.title} page with a starter layout, and it is in the menu. Wire a button to it with "link this button to the ${r.page.title.toLowerCase()} page".` }; }
    if (id === 'site.page.rename') { if (!sl.name) return { say: 'What should the page be called?' }; return { cfg: renamePage(c, pg.id, sl.name), say: `Renamed the page to ${sl.name}. Links to it still work.` }; }
    if (id === 'site.page.delete') { const p = sl.name ? findPage(c, sl.name) : pg; if (!p) return { say: `There is no ${sl.name} page.` }; if (p === c.pages[0]) return { say: 'The home page stays. Delete another page, or empty this one.' }; return { cfg: deletePage(c, p.id), page: c.pages[0].id, say: `Deleted the ${p.title} page. Buttons that pointed at it now need a new place: say "make the buttons work".` }; }
    if (/^site\.image\./.test(id)) {
      const img = sel.block && selBlock && ('img' in selBlock.props || /\.$/.test(sel.path || '')) ? { block: selBlock, path: /\.$/.test(sel.path || '') ? sel.path : '' } : images(pg)[0];
      if (!img) return { say: 'This page has no picture yet. Say "add a gallery", or add a hero with a picture.' };
      if (id === 'site.image.shape') return { cfg: imageShape(c, pg.id, img.block.id, img.path, sl.shape), sel: { block: img.block.id, path: img.path }, say: `Made the picture ${sl.shape === 'square' ? 'square' : 'round'}.` };
      if (id === 'site.image.alt') { if (!sl.alt) return { need: 'alt', sel: { block: img.block.id, path: img.path }, say: 'Type what the picture shows, for people using screen readers.' }; return { cfg: setImage(c, pg.id, img.block.id, img.path, getAt(img.block.props, img.path + 'img'), sl.alt), say: `Alt text set: “${sl.alt}”.` }; }
      return { need: sl.source === 'board' ? 'board' : 'upload', sel: { block: img.block.id, path: img.path }, say: sl.source === 'board' ? 'Pick a picture from your inspiration board.' : 'Choose a picture from your computer. It is copied into the site, so the export works on its own.' };
    }
    if (id === 'site.dark') { const m = sl.mode === 'light' ? 'light' : 'dark'; if (c.theme.mode === m) return { say: `It is already in ${m} mode.` }; return { cfg: setMode(c, m), say: `Switched the site to its ${m} variant: the same ${PRESETS[c.theme.preset] ? PRESETS[c.theme.preset].name : ''} design with ${m} colors, checked for contrast. Say "light mode" to switch back.`.replace('  ', ' ') }; }
    if (id === 'site.theme') { const keys = Object.keys(PRESETS), p = sl.preset && PRESETS[sl.preset] ? sl.preset : keys[(keys.indexOf(c.theme.preset) + 1) % keys.length]; return { cfg: setTheme(c, p), say: `Using the ${PRESETS[p].name} theme (${PRESETS[p].fonts.display} headings).` }; }
    if (id === 'site.color') { const h = sl.color && sl.color.hex; if (!h) return { say: 'Which color?' }; const cfg = setColor(c, h); return { cfg, say: `The accent is ${sl.color.name || h} now${cfg.theme.colors.accent.toUpperCase() !== h.toUpperCase() ? ', a touch deeper so it reads on this background' : ''}.` }; }
    if (id === 'site.block.add') { const t = TYPEW[sl.block] || 'text'; const r = addBlock(c, pg.id, t); return { cfg: r.cfg, sel: { block: r.block.id }, say: `Added ${BLOCKS[t].label.toLowerCase().replace(/ \(.*/, '')} to ${pg.title}. Click its words in the preview to change them.` }; }
    if (id === 'site.block.remove') { const b = blk(TYPEW[sl.block]); if (!b) return { say: `There is no ${sl.block} on this page.` }; return { cfg: removeBlock(c, pg.id, b.id), say: `Removed the ${BLOCKS[b.type].label.toLowerCase()}. Undo brings it back.` }; }
    if (id === 'site.block.move') { const b = blk(TYPEW[sl.block]); if (!b) return { say: `There is no ${sl.block} on this page.` }; return { cfg: moveBlock(c, pg.id, b.id, sl.dir || 'up'), say: `Moved the ${BLOCKS[b.type].label.toLowerCase()} ${sl.dir === 'top' ? 'to the top' : sl.dir === 'bottom' ? 'to the bottom' : sl.dir || 'up'}.` }; }
    if (id === 'site.layout') { const b = blk(TYPEW[sl.block]); if (!b) return { say: 'Which section? Click it in the preview first.' }; const cfg = setVariant(c, pg.id, b.id, sl.variant); const nb = pageOf(cfg, pg.id).blocks.find(x => x.id === b.id); return { cfg, sel: { block: b.id }, say: `The ${BLOCKS[b.type].label.toLowerCase()} uses the ${nb.variant} layout now (${BLOCKS[b.type].variants.join(', ')}).` }; }
    if (id === 'site.text') {
      if (sl.field === 'name') { const cfg = clone(c); cfg.name = sl.text; return { cfg, say: `The site is called ${sl.text} now.` }; }
      const hero = blk('hero') || pg.blocks.find(b => b.type === 'links');
      if (!hero) return { say: 'This page has no hero. Click the words you want to change and type over them.' };
      if (sl.field === 'button') { const p = hero.type === 'hero' ? 'buttons.0.label' : 'items.0.label'; return { cfg: setProp(c, pg.id, hero.id, p, sl.text), say: `The button says “${sl.text}”.` }; }
      return { cfg: setProp(c, pg.id, hero.id, sl.field === 'tagline' ? (hero.type === 'hero' ? 'text' : 'bio') : (hero.type === 'hero' ? 'title' : 'name'), sl.text), say: `The ${sl.field} says “${sl.text}”.` };
    }
    if (id === 'site.export') return { need: sl.fmt === 'zip' ? 'zip' : 'html', say: sl.fmt === 'zip' ? 'Downloading a zip: one HTML file per page, the pictures in assets/, the fonts and their licenses.' : 'Downloading index.html: one standalone file with every page, the pictures inside it, and no scripts.' };
    if (/^site\./.test(id) && TEMPLATES.includes(id.slice(5))) return { need: 'template', template: id.slice(5), say: `Starting from the ${id.slice(5)} template. Your current design is one Undo away.` };
    return null;
  }
  const titleCase = s => String(s || '').trim().replace(/\b[a-z]/g, ch => ch.toUpperCase());

  // ---------- render ----------
  const embedUrl = u => { u = String(u || ''); let m; if ((m = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(u))) return `https://www.youtube-nocookie.com/embed/${m[1]}`; if ((m = /vimeo\.com\/(\d+)/.exec(u))) return `https://player.vimeo.com/video/${m[1]}`; if ((m = /open\.spotify\.com\/(track|album|playlist|episode|show)\/(\w+)/.exec(u))) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`; return ''; };
  const ph = (alt, w, h) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#8885"/><path d="M0 ${h * 0.75} L${w * 0.35} ${h * 0.45} L${w * 0.6} ${h * 0.68} L${w * 0.78} ${h * 0.55} L${w} ${h * 0.75} V${h} H0Z" fill="#8886"/><circle cx="${w * 0.72}" cy="${h * 0.3}" r="${h * 0.09}" fill="#8887"/></svg>`)}`;
  function css(c, fontsBase) {
    const k = colors(c), t = c.theme, r = t.radius, on = lum(k.accent) > 0.45 ? '#111111' : '#FFFFFF';
    const fsrc = f => (typeof fontsBase === 'function' ? fontsBase(FONT[f][0]) : fontsBase ? `${fontsBase}${FONT[f][0]}.woff2` : '');   // a base URL, or (file) -> data: URL (the sandboxed preview has no origin)
    const faces = fontsBase ? [t.fonts.display, t.fonts.body].filter((f, i, a) => FONT[f] && a.indexOf(f) === i && fsrc(f)).map(f => `@font-face{font-family:'${f}';src:url('${fsrc(f)}') format('woff2');font-weight:${FONT[f][1]};font-display:swap}`).join('') : '';
    return `${faces}:root{--bg:${k.bg};--ink:${k.ink};--muted:${k.muted};--card:${k.card};--line:${k.line};--accent:${k.accent};--on:${on};--r:${r}px;--display:${stack(t.fonts.display)};--body:${stack(t.fonts.body)};color-scheme:${t.mode}}
*{box-sizing:border-box}html{scroll-behavior:smooth}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 var(--body);-webkit-text-size-adjust:100%}
a{color:inherit}img{max-width:100%;display:block}.wrap{max-width:1080px;margin:0 auto;padding:0 24px}.skip{position:absolute;left:-999px}.skip:focus{left:12px;top:12px;background:var(--card);padding:8px 12px;z-index:9}
h1,h2,h3{font-family:var(--display);line-height:1.1;margin:0 0 .4em;letter-spacing:-.01em}h1{font-size:clamp(2.2rem,6vw,4rem)}h2{font-size:clamp(1.5rem,3.4vw,2.2rem)}h3{font-size:1.15rem}p{margin:0 0 1em}
.nav{border-bottom:1px solid var(--line)}.nav .wrap{display:flex;align-items:center;gap:20px;min-height:64px;flex-wrap:wrap}.nav b{font-family:var(--display);font-size:1.2rem;margin-right:auto}.nav nav{display:flex;gap:20px;flex-wrap:wrap}.nav a{text-decoration:none;color:var(--muted)}.nav a[aria-current]{color:var(--ink);text-decoration:underline;text-underline-offset:6px}
section{padding:64px 0;border-bottom:1px solid var(--line)}.eyebrow{font:600 .78rem/1.2 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}.lead{font-size:1.15rem;color:var(--muted);max-width:60ch}
.btns{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.btn{display:inline-block;padding:12px 20px;border-radius:var(--r);border:1px solid var(--accent);background:var(--accent);color:var(--on);text-decoration:none;font-weight:600}.btn.alt{background:transparent;color:var(--ink);border-color:var(--line)}.btn:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.hero-split .wrap{display:grid;grid-template-columns:1.1fr 1fr;gap:48px;align-items:center}.hero-center{text-align:center}.hero-center .lead{margin:0 auto}.hero-center .btns{justify-content:center}.hero-center .pic{max-width:720px;margin:40px auto 0}.hero-minimal h1{font-size:clamp(2.4rem,8vw,5.4rem)}
.pic{border-radius:var(--r);overflow:hidden;border:1px solid var(--line);background:var(--card)}.pic img{width:100%;height:100%;object-fit:cover;aspect-ratio:4/3}.pic.round{border-radius:50%;aspect-ratio:1;max-width:320px}.pic.round img{aspect-ratio:1}.pic.square img{aspect-ratio:1}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:20px}.muted{color:var(--muted)}
.f-list .item{display:grid;grid-template-columns:200px 1fr;gap:24px;padding:16px 0;border-top:1px solid var(--line)}.f-stats .card b{display:block;font:700 2.4rem/1 var(--display);color:var(--accent)}
.g-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}.g-masonry{columns:3 240px;column-gap:16px}.g-masonry figure{break-inside:avoid;margin:0 0 16px}.g-masonry img{aspect-ratio:auto}.g-strip{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory}.g-strip figure{flex:0 0 min(80%,420px);scroll-snap-align:start}
figure{margin:0}figcaption{font-size:.9rem;color:var(--muted);margin-top:8px}.g-grid img,.g-strip img{aspect-ratio:4/3;object-fit:cover;width:100%;border-radius:var(--r);border:1px solid var(--line)}.g-masonry img{width:100%;border-radius:var(--r);border:1px solid var(--line)}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}.plan .price{font:700 2rem/1 var(--display);margin:8px 0}.plan ul{padding-left:18px;color:var(--muted)}table.p{width:100%;border-collapse:collapse}table.p td,table.p th{text-align:left;padding:14px 8px;border-top:1px solid var(--line);vertical-align:top}
blockquote{margin:0;font-family:var(--display);font-size:1.3rem;line-height:1.35}.q-quotes blockquote{font-size:1.8rem;max-width:30ch}
details{border-top:1px solid var(--line);padding:14px 0}summary{cursor:pointer;font-weight:600}.faq-columns{display:grid;grid-template-columns:1fr 1fr;gap:0 40px}
.team .who{display:flex;gap:16px;align-items:center}.team .av{width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid var(--line)}
.links{max-width:560px;margin:0 auto;text-align:center}.links .pic{margin:0 auto 16px;max-width:120px}.links .pic img{aspect-ratio:1}.lk{display:block;padding:16px 20px;margin:12px 0;border:1px solid var(--line);border-radius:var(--r);background:var(--card);text-decoration:none;font-weight:600}.lk small{display:block;font-weight:400;color:var(--muted)}.l-cards .lk{border-color:var(--ink)}.l-pills .lk{border-radius:999px}.soc{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-top:16px}
.row p,.card p:last-child{margin:0}.rows .row{display:grid;grid-template-columns:1fr auto;gap:16px;padding:14px 0;border-top:1px solid var(--line)}.menu .row{display:flex;gap:8px;align-items:baseline;padding:8px 0}.menu .row .dots{flex:1;border-bottom:1px dotted var(--muted);transform:translateY(-4px)}
form.cf{display:grid;gap:12px;max-width:560px}form.cf input,form.cf textarea{font:inherit;padding:12px;border-radius:var(--r);border:1px solid var(--line);background:var(--card);color:var(--ink)}form.cf label{font-weight:600;font-size:.92rem}
.embed{aspect-ratio:16/9;width:100%;border:1px solid var(--line);border-radius:var(--r);background:var(--card)}.e-inline .embed{max-width:640px}.t-two .wrap{display:grid;grid-template-columns:1fr 2fr;gap:40px}
footer{padding:40px 0;color:var(--muted)}footer .wrap{display:flex;gap:20px;flex-wrap:wrap;align-items:center}footer nav{display:flex;gap:16px;flex-wrap:wrap;margin-left:auto}
.pg{display:none}.pg-home,.pg:target,.pg:has(:target){display:block}body:has(.pg:not(.pg-home):target) .pg-home,body:has(.pg:not(.pg-home) :target) .pg-home{display:none}
@media (max-width:760px){.hero-split .wrap,.t-two .wrap,.faq-columns{grid-template-columns:1fr}.f-list .item{grid-template-columns:1fr;gap:4px}section{padding:44px 0}}`;
  }
  function renderBlock(c, b, pg, o) {
    const P = b.props || {}, E = (path, tag, txt, cls) => `<${tag}${cls ? ` class="${cls}"` : ''}${o.edit ? ` data-e="${b.id}|${path}" contenteditable="plaintext-only" spellcheck="false"` : ''}>${esc(txt)}</${tag}>`;
    const H = l => href(c, l, pg, o.mode) || (o.edit ? '#' : '');
    const A = (path, lab, l, cls) => { const h = H(l); return `<a class="${cls}"${h ? ` href="${esc(h)}"` : ''}${/^https?:/.test(h) ? ' rel="noopener"' : ''}${o.edit ? ` data-btn="${b.id}|${path}"${h && h !== '#' ? '' : ' data-unwired="1"'}` : ''}>${o.edit ? `<span data-e="${b.id}|${path}.label" contenteditable="plaintext-only" spellcheck="false">${esc(lab)}</span>` : esc(lab)}</a>`; };
    const IMG = (path, src, alt, shape, w, h) => `<div class="pic${shape ? ' ' + shape : ''}"${o.edit ? ` data-img="${b.id}|${path}"` : ''}><img src="${esc(src || ph(alt, w || 800, h || 600))}" alt="${esc(alt || '')}" loading="lazy"></div>`;
    const T = (path, txt, tag = 'h2') => txt || o.edit ? E(path, tag, txt || '') : '';
    switch (b.type) {
      case 'hero': return `<div class="wrap">${b.variant === 'split' ? '<div>' : ''}${P.eyebrow || o.edit ? E('eyebrow', 'p', P.eyebrow, 'eyebrow') : ''}${E('title', 'h1', P.title)}${P.text || o.edit ? E('text', 'p', P.text, 'lead') : ''}<div class="btns">${(P.buttons || []).map((x, i) => A(`buttons.${i}`, x.label, x.link, i ? 'btn alt' : 'btn')).join('')}</div>${b.variant === 'split' ? '</div>' : ''}${b.variant !== 'minimal' && (P.img || o.edit || b.variant === 'split') ? IMG('', P.img, P.alt, P.shape) : ''}</div>`;
      case 'features': return `<div class="wrap">${T('title', P.title)}<div class="${b.variant === 'list' ? '' : 'grid'}">${(P.items || []).map((x, i) => b.variant === 'list' ? `<div class="item">${E(`items.${i}.title`, 'h3', x.title)}${E(`items.${i}.text`, 'p', x.text, 'muted')}</div>` : `<div class="card">${b.variant === 'stats' ? E(`items.${i}.title`, 'b', x.title) : E(`items.${i}.title`, 'h3', x.title)}${E(`items.${i}.text`, 'p', x.text, 'muted')}</div>`).join('')}</div></div>`;
      case 'gallery': return `<div class="wrap">${T('title', P.title)}<div class="g-${b.variant}">${(P.items || []).map((x, i) => `<figure>${IMG(`items.${i}.`, x.img, x.alt, x.shape)}${x.caption || o.edit ? E(`items.${i}.caption`, 'figcaption', x.caption) : ''}</figure>`).join('')}</div></div>`;
      case 'pricing': return `<div class="wrap">${T('title', P.title)}${P.note ? E('note', 'p', P.note, 'muted') : ''}${b.variant === 'table' ? `<table class="p"><tbody>${(P.plans || []).map((x, i) => `<tr><th>${E(`plans.${i}.name`, 'span', x.name)}<div class="muted">${esc((x.features || []).join(' · '))}</div></th><td>${E(`plans.${i}.price`, 'b', x.price)} ${E(`plans.${i}.per`, 'span', x.per, 'muted')}</td><td>${x.button ? A(`plans.${i}.button`, x.button.label, x.button.link, 'btn') : ''}</td></tr>`).join('')}</tbody></table>` : `<div class="plans">${(P.plans || []).map((x, i) => `<div class="card plan">${E(`plans.${i}.name`, 'h3', x.name)}<div class="price">${E(`plans.${i}.price`, 'span', x.price)} ${E(`plans.${i}.per`, 'small', x.per, 'muted')}</div><ul>${(x.features || []).map((f, j) => E(`plans.${i}.features.${j}`, 'li', f)).join('')}</ul>${x.button ? A(`plans.${i}.button`, x.button.label, x.button.link, 'btn') : ''}</div>`).join('')}</div>`}</div>`;
      case 'testimonials': return `<div class="wrap q-${b.variant}">${T('title', P.title)}<div class="${b.variant === 'cards' ? 'grid' : ''}">${(P.items || []).map((x, i) => `<figure class="${b.variant === 'cards' ? 'card' : ''}">${E(`items.${i}.quote`, 'blockquote', x.quote)}<figcaption>${E(`items.${i}.name`, 'b', x.name)} ${E(`items.${i}.role`, 'span', x.role)}</figcaption></figure>`).join('')}</div></div>`;
      case 'faq': return `<div class="wrap">${T('title', P.title)}<div class="faq-${b.variant}">${(P.items || []).map((x, i) => `<details${o.edit ? ' open' : ''}><summary>${E(`items.${i}.q`, 'span', x.q)}</summary>${E(`items.${i}.a`, 'p', x.a, 'muted')}</details>`).join('')}</div></div>`;
      case 'team': return `<div class="wrap team">${T('title', P.title)}<div class="grid">${(P.items || []).map((x, i) => `<div class="who">${o.edit ? `<span data-img="${b.id}|items.${i}."><img class="av" src="${esc(x.img || ph(x.name, 200, 200))}" alt="${esc(x.alt || x.name)}"></span>` : `<img class="av" src="${esc(x.img || ph(x.name, 200, 200))}" alt="${esc(x.alt || x.name)}">`}<div>${E(`items.${i}.name`, 'b', x.name)}<div class="muted">${E(`items.${i}.role`, 'span', x.role)}</div></div></div>`).join('')}</div></div>`;
      case 'links': return `<div class="wrap links l-${b.variant}">${IMG('', P.img, P.alt, P.shape || 'round', 300, 300)}${E('name', 'h1', P.name)}${E('bio', 'p', P.bio, 'muted')}${(P.items || []).map((x, i) => A(`items.${i}`, x.label, x.link, 'lk') + (x.note ? `<small class="muted">${esc(x.note)}</small>` : '')).join('')}<div class="soc">${(P.socials || []).map((x, i) => A(`socials.${i}`, x.label, x.link, '')).join('')}</div></div>`;
      case 'list': return `<div class="wrap">${T('title', P.title)}<div class="${b.variant === 'cards' ? 'grid' : b.variant}">${(P.items || []).map((x, i) => { const h = href(c, x.link, pg, o.mode); const inner = b.variant === 'menu' ? `${E(`items.${i}.title`, 'b', x.title)}<span class="dots"></span>${E(`items.${i}.meta`, 'span', x.meta)}` : `<div>${E(`items.${i}.title`, b.variant === 'cards' ? 'h3' : 'b', x.title)}${x.text || (o.edit && b.variant !== 'menu') ? E(`items.${i}.text`, 'p', x.text, 'muted') : ''}</div>${E(`items.${i}.meta`, 'span', x.meta, 'muted')}`; return `<div class="${b.variant === 'cards' ? 'card' : 'row'}">${inner}${h && !o.edit ? ` <a href="${esc(h)}">→</a>` : ''}</div>`; }).join('')}</div></div>`;
      case 'contact': { const act = P.action && /^https?:/.test(P.action) ? P.action : P.email ? `mailto:${P.email}` : ''; return `<div class="wrap">${T('title', P.title)}${E('text', 'p', P.text, 'lead')}${b.variant === 'simple' ? `${P.email ? `<p><a class="btn" href="mailto:${esc(P.email)}">${esc(P.email)}</a></p>` : act ? `<p><a class="btn" href="${esc(act)}">${esc(P.button || 'Go')}</a></p>` : ''}` : `<form class="cf"${act ? ` action="${esc(act)}" method="${/^mailto:/.test(act) ? 'post" enctype="text/plain' : 'post'}"` : ''}><label for="n-${b.id}">Name</label><input id="n-${b.id}" name="name" autocomplete="name"><label for="e-${b.id}">Email</label><input id="e-${b.id}" name="email" type="email" autocomplete="email"><label for="m-${b.id}">Message</label><textarea id="m-${b.id}" name="message" rows="4"></textarea><button class="btn" type="submit"${act ? '' : ' disabled title="Set an email or a form link first"'}>${esc(P.button || 'Send')}</button>${act ? '' : '<p class="muted">This form needs an email or a form link before it sends anything.</p>'}</form>`}</div>`; }
      case 'embed': { const u = embedUrl(P.url); return `<div class="wrap e-${b.variant}">${T('title', P.title)}${u ? `<iframe class="embed" src="${esc(u)}" title="${esc(P.title || 'Embedded media')}" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>` : P.url ? `<p><a class="btn" href="${esc(P.url)}" rel="noopener">Open it</a></p>` : `<div class="embed" role="img" aria-label="No video yet"></div>`}${P.caption ? E('caption', 'p', P.caption, 'muted') : ''}</div>`; }
      case 'text': return `<div class="wrap t-${b.variant}">${E('title', 'h2', P.title)}<div>${E('text', 'p', P.text, 'lead')}</div></div>`;
      case 'footer': return `<div class="wrap">${E('text', 'span', P.text)}<nav>${(P.links || []).map((x, i) => A(`links.${i}`, x.label, x.link, '')).join('')}</nav></div>`;
    }
    return '';
  }
  function renderPage(c, pg, o) {
    return (pg.blocks || []).map(b => { const tag = b.type === 'footer' ? 'footer' : 'section'; return `<${tag} id="b-${b.id}" class="${b.type}-${b.variant} b-${b.type}"${o.edit ? ` data-block="${b.id}"` : ''}>${renderBlock(c, b, pg, o)}</${tag}>`; }).join('\n');
  }
  function nav(c, pg, o) {
    if (c.pages.length < 2 && !o.edit) return '';
    const links = c.pages.map(p => { const h = o.mode === 'pages' ? (p.slug === 'index' ? 'index.html' : p.slug + '.html') : '#p-' + p.slug; return `<a href="${h}"${p === pg && o.mode !== 'single' ? ' aria-current="page"' : ''}${o.edit ? ` data-page="${p.id}"` : ''}>${esc(p.title)}</a>`; }).join('');
    return `<header class="nav"><div class="wrap"><b>${esc(c.name)}</b>${c.pages.length > 1 ? `<nav aria-label="Pages">${links}</nav>` : ''}</div></header>`;
  }
  // o: { page, edit, mode: 'single' (one file, every page) | 'pages' (this page as its own file), fonts: base url, extraHead }
  function render(cfg, o = {}) {
    const c = normalize(clone(cfg)), mode = o.mode || 'single';
    const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.name)}</title><meta name="generator" content="TribeCode website designer"><style>${css(c, o.fonts || '')}</style>${o.extraHead || ''}</head><body><a class="skip" href="#main">Skip to content</a>`;
    if (mode === 'single' && !o.edit) return `${head}${c.pages.map((p, i) => `<div class="pg${i === 0 ? ' pg-home' : ''}" id="p-${p.slug}">${nav(c, p, { mode })}<main${i === 0 ? ' id="main"' : ''}>${renderPage(c, p, { mode })}</main></div>`).join('\n')}</body></html>`;
    const pg = c.pages.find(p => p.id === o.page || p.slug === o.page) || c.pages[0];
    return `${head}${nav(c, pg, { mode, edit: o.edit })}<main id="main">${renderPage(c, pg, { mode, edit: o.edit })}</main>${o.extraBody || ''}</body></html>`;
  }
  // standalone files: 'single' = { 'index.html' } with every page and the pictures inside; 'zip' = one file per page,
  // pictures in assets/ (data: URLs written out), fonts in fonts/ (paths listed in .fonts for the caller to copy)
  function exportFiles(cfg, kind) {
    const c = normalize(clone(cfg));
    if (kind !== 'zip') return { 'index.html': render(c, { mode: 'single' }) };
    const files = {}, assets = new Map(); let n = 0;
    const out = (src, alt) => { if (!/^data:image\//.test(src || '')) return src; if (!assets.has(src)) { const m = /^data:image\/([a-z+]+)(;base64)?,(.*)$/i.exec(src); const ext = m ? (m[1] === 'svg+xml' ? 'svg' : m[1] === 'jpeg' ? 'jpg' : m[1]) : 'png'; assets.set(src, `assets/${slugify(alt || 'image')}-${++n}.${ext}`); } return assets.get(src); };
    c.pages.forEach(p => p.blocks.forEach(b => { if (b.props.img) b.props.img = out(b.props.img, b.props.alt); (b.props.items || []).forEach(x => { if (x && x.img) x.img = out(x.img, x.alt); }); }));
    const used = new Set([c.theme.fonts.display, c.theme.fonts.body].filter(f => FONT[f]));
    c.pages.forEach(p => { files[p.slug === 'index' ? 'index.html' : p.slug + '.html'] = render(c, { page: p.id, mode: 'pages', fonts: used.size ? 'fonts/' : '' }); });
    files['site.json'] = JSON.stringify(cfg, null, 1);
    files['README.md'] = `# ${c.name}\n\nMade with the TribeCode website designer. Plain HTML and CSS, no build step and no scripts: open index.html, or upload this folder to any static host (GitHub Pages, Netlify, a USB stick).\n\n- ${c.pages.map(p => (p.slug === 'index' ? 'index' : p.slug) + '.html: ' + p.title).join('\n- ')}\n- assets/: the pictures\n- fonts/: the fonts (SIL Open Font License, licenses alongside)\n- site.json: the design, to open again in TribeCode\n`;
    return { files, assets: [...assets].map(([src, path]) => ({ src, path })), fonts: [...used].map(f => ({ file: FONT[f][0] + '.woff2', license: 'LICENSE-' + f.replace(/\s+/g, '') + '.txt' })) };
  }
  const dataToBytes = src => { const m = /^data:[^;,]+(;base64)?,(.*)$/.exec(src || ''); if (!m) return null; if (m[1]) { const bin = typeof atob === 'function' ? atob(m[2]) : Buffer.from(m[2], 'base64').toString('binary'); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; } return new TextEncoder().encode(decodeURIComponent(m[2])); };

  return { BLOCKS, TYPES, PRESETS, TEMPLATES, blank, normalize, colors, fromTemplate, render, exportFiles, dataToBytes, buttons, images, href, autoWire, addPage, renamePage, deletePage, addBlock, removeBlock, moveBlock, setVariant, setProp, setTheme, setMode, setColor, setLink, setImage, imageShape, command, getAt, slugify, contrast };
});
