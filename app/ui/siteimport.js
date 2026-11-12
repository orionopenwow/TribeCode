// HTML → website designer config (feat/site-v2). Reads a landing page, portfolio or link-in-bio page and turns it into
// sitecfg blocks (app/ui/sitecfg.js), so an imported page is editable, wireable and exportable like our own templates.
// Used two ways: scripts/dev/site-gallery.py runs it on open-source templates (in a real browser, with computed styles
// for colors and fonts), and the designer's "Import HTML" runs it on a file the person picks (DOMParser, no styles).
//   window.TribeSiteImport = { fromDocument(doc, { styles, name }) -> { cfg, report: [lines] }, fromHtml(text, opts) }
// Heuristics, no AI: sections are header/section/footer/article (and the usual wrappers); each is classified by what it
// holds: a big heading and buttons (hero), a form (contact or newsletter), repeated cards (features, team, stats,
// pricing), quotes (testimonials), many pictures (gallery), a list of dated rows (list), links in a column (links), or
// text. Pictures are left empty (the template's own art is added by the gallery script); words, order and colors stay.
(function (root) {
  'use strict';
  const S = () => root.TribeSiteCfg;
  const T = el => (el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const L = (label, kind, to) => ({ label, link: { kind: kind || '', to: to || '' } });
  const SEC = 'header, section, footer, article, .masthead, #banner, #header, #footer, #intro, #main > .inner > section, .wrapper, .spotlight, .features, .tiles, .posts, .page-section, .content-section, .callout, .showcase, .testimonials, .cta, .bg-light, .bg-dark';
  const SKIP = 'nav, script, style, noscript, template, svg, .modal, [aria-hidden="true"], #menu, .menu, .navbar, .portfolio-modal';
  const hx = el => el && el.querySelector('h1, h2, h3, h4, header h2, .masthead-heading, .display-1, .display-2, .display-3, .display-4, .display-5');
  const words = el => T(el).split(' ').filter(Boolean).length;
  const btnsOf = el => [...el.querySelectorAll('a.btn, a.button, a[class*="btn"], a[class*="button"], button:not([type="submit"]), a.primary, ul.actions a, .actions a')].filter(a => T(a) && T(a).length < 40 && !a.closest('form, nav, footer, .modal')).slice(0, 2);
  const hrefOf = a => { const h = (a && a.getAttribute && a.getAttribute('href')) || ''; if (/^mailto:/i.test(h)) return { kind: 'email', to: h.slice(7) }; if (/^https:\/\//i.test(h) && !/startbootstrap|html5up|tailwindtoolbox|unsplash|github\.com\/(StartBootstrap|tailwindtoolbox)/i.test(h)) return { kind: 'url', to: h }; return { kind: '', to: '' }; };
  const texts = el => [...el.querySelectorAll('p, .lead, .subheading, .masthead-subheading')].filter(p => !p.closest(SKIP + ', form') && T(p).length > 8).map(T);
  function blocksIn(doc) {
    const pick = sel => [...doc.querySelectorAll(sel)].filter(el => !el.closest(SKIP) && words(el) > 1 && !(/^(HEADER|FOOTER)$/.test(el.tagName) && el.parentElement && el.parentElement.closest('section, article')));
    let all = pick(SEC);
    const tops = list => { let top = list.filter(el => !list.some(o => o !== el && o.contains(el)));
      const expand = l => l.flatMap(el => { const kids = list.filter(o => o !== el && el.contains(o) && !list.some(x => x !== o && x !== el && el.contains(x) && x.contains(o))); return kids.length >= 2 && el.tagName !== 'HEADER' ? expand(kids) : [el]; });
      return expand(top); };
    let top = tops(all);
    // too few sections (pages built from plain divs): any block that holds its own heading counts
    if (top.filter(el => el.tagName !== 'FOOTER').length < 3) { all = all.concat(pick('main > div, body > div > div, body > div, .container > .row, .container > div, main > section, [class*="py-"], [class*="mb-"]').filter(el => el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > div > h1, :scope > div > h2, :scope > div > h3, :scope > div > div > h2') && words(el) > 6)); top = tops([...new Set(all)]); }
    // three or more sibling articles/cards are one block of cards, not one block each
    const out = [];
    for (let i = 0; i < top.length; i++) {
      const el = top[i], par = el.parentElement; let j = i;
      while (j + 1 < top.length && top[j + 1].parentElement === par && top[j + 1].tagName === el.tagName) j++;
      if (j - i >= 2 && par && par !== doc.body && el.tagName !== 'SECTION' && top.slice(i, j + 1).every(x => words(x) < 160)) { out.push(par); i = j; } else out.push(el);
    }
    return out.length ? out : [doc.body];
  }
  function repeated(el) {   // the biggest set of sibling elements that each hold a heading (cards)
    let best = [];
    el.querySelectorAll('*').forEach(p => { if (p.closest(SKIP)) return; const k = [...p.children].filter(c => c.querySelector('h3, h4, h5, h2, .card-title, strong, b') && words(c) >= 2 && words(c) < 140); if (k.length >= 2 && k.length > best.length && k.length <= 12) best = k; });
    return best;
  }
  function classify(el, i, n, name) {
    const h = hx(el), title = T(h), ps = texts(el), tag = el.tagName;
    const imgs = [...el.querySelectorAll('img')].filter(im => !im.closest(SKIP));
    const form = el.querySelector('form');
    const q = el.querySelectorAll('blockquote, .testimonial, .quote');
    if (tag === 'FOOTER' || /\bfooter\b/i.test(el.id + ' ' + el.className) || (i === n - 1 && words(el) < 40 && /©|copyright|&copy;/i.test(T(el)))) {
      const socials = [...el.querySelectorAll('a')].map(a => ({ label: (a.getAttribute('aria-label') || T(a) || (a.className.match(/(twitter|facebook|instagram|github|linkedin|dribbble|youtube|tiktok|email|envelope)/i) || [])[1] || '').replace(/^envelope$/i, 'Email').slice(0, 30), link: hrefOf(a) })).filter(x => x.label && x.label.length > 1).slice(0, 5);
      const ct = (T(el).match(/(?:©|copyright)[^.|]*/i) || [''])[0].replace(/\s+/g, ' ').trim();
      return { type: 'footer', variant: socials.length > 3 ? 'columns' : 'simple', props: { text: ct.replace(/your website|company name|your company|Start Bootstrap|Tailwind ?Toolbox/gi, name).slice(0, 80) || `© ${name}`, links: socials.map(s => ({ label: s.label.charAt(0).toUpperCase() + s.label.slice(1), link: s.link })) } };
    }
    if (form) {
      const ta = form.querySelector('textarea'), em = form.querySelector('input[type="email"], input[name*="mail" i]');
      if (!ta && em) return { type: 'newsletter', variant: i === 0 ? 'card' : 'inline', props: { title: title || 'Stay in the loop', text: ps[0] || '', action: '', button: T(form.querySelector('button, input[type="submit"]')) || form.querySelector('input[type="submit"]')?.value || 'Subscribe' } };
      if (ta) return { type: 'contact', variant: 'form', props: { title: title || 'Get in touch', text: ps[0] || 'Write a line and we will answer soon.', email: '', action: '', button: T(form.querySelector('button')) || 'Send' } };
    }
    if (i === 0 || (el.querySelector('h1') && i < 2)) {
      const b = btnsOf(el), big = imgs.find(im => (+im.getAttribute('width') || im.naturalWidth || 0) > 200 || /img-fluid|image|masthead|hero|avatar|profile/i.test(im.className + im.parentNode.className));
      const lead = ps.find(p => p !== title) || '';
      const avatar = imgs.find(im => /avatar|profile|rounded-circle|me\b/i.test(im.className + ' ' + (im.getAttribute('src') || '') + im.parentNode.className));
      const linkish = [...el.querySelectorAll('a')].filter(a => !a.closest(SKIP) && T(a).length > 2 && T(a).length < 40);
      if (avatar && linkish.length >= 2 && words(el) < 120) return { type: 'links', variant: 'stack', props: { name: title || name, bio: lead, img: '', alt: title || name, shape: 'round', items: linkish.slice(0, 6).map(a => ({ label: T(a), note: '', link: hrefOf(a) })), socials: [] } };
      const eyebrow = T(el.querySelector('.masthead-subheading, .subheading, .eyebrow, .badge, .text-uppercase:not(h1):not(h2)')).slice(0, 60);
      return { type: 'hero', variant: big ? (imgs.length && el.querySelector('.row, .col-lg-6, .col-md-6, .split, .grid') ? 'split' : 'center') : (words(el) < 30 ? 'minimal' : 'center'), props: { eyebrow: eyebrow !== title ? eyebrow : '', title: title || name, text: lead.slice(0, 280), img: '', alt: big ? (big.getAttribute('alt') || title) : '', shape: avatar ? 'round' : '', buttons: b.length ? b.map((a, k) => L(T(a), hrefOf(a).kind, hrefOf(a).to)) : [L('Get in touch')] } };
    }
    if (q.length) return { type: 'testimonials', variant: q.length === 1 ? 'spotlight' : 'cards', props: { title: title || 'What people say', items: [...q].slice(0, 6).map(x => { const fig = x.closest('figure, .card, .testimonial-item, .col-lg-4, .col-md-4, div') || x; return { quote: T(x.querySelector('p') || x).replace(/^["“]|["”]$/g, '').slice(0, 300), name: T(fig.querySelector('cite, .name, h5, h6, strong, figcaption')).slice(0, 60) || 'A happy customer', role: '' }; }) } };
    const cards = repeated(el);
    if (/\$|€|£/.test(T(el)) && cards.length >= 2 && cards.some(c => /\$\s?\d|€\s?\d|£\s?\d|\d\s?(?:\/|per)\s?mo/i.test(T(c)))) return { type: 'pricing', variant: 'cards', props: { title: title || 'Pricing', note: '', plans: cards.slice(0, 4).map(c => ({ name: T(c.querySelector('h3, h4, h5, .card-title, .text-uppercase')).slice(0, 40) || 'Plan', price: (T(c).match(/[$€£]\s?\d+(?:[.,]\d+)?/) || ['$0'])[0], per: /mo|month/i.test(T(c)) ? '/ month' : '', features: [...c.querySelectorAll('li')].map(T).filter(Boolean).slice(0, 6), button: L(T(c.querySelector('a, button')) || 'Choose') })) } };
    if (cards.length >= 2 && cards.every(c => /^\s*[\d,.]+[k+%]?\s*$/i.test(T(c.querySelector('h2, h3, h4, strong, b, .count')) || ''))) return { type: 'stats', variant: 'grid', props: { title, items: cards.slice(0, 6).map(c => ({ value: T(c.querySelector('h2, h3, h4, strong, b, .count')), label: T(c).replace(T(c.querySelector('h2, h3, h4, strong, b, .count')), '').trim().slice(0, 60) })) } };
    if (cards.length >= 2 && cards.filter(c => c.querySelector('img')).length >= 2 && cards.every(c => words(c) < 30) && /team|people|staff|who we are|about us|crew/i.test(title + ' ' + el.id + ' ' + el.className)) return { type: 'team', variant: 'grid', props: { title: title || 'Our team', items: cards.slice(0, 8).map(c => ({ name: T(c.querySelector('h3, h4, h5, strong')).slice(0, 40), role: T(c.querySelector('p, .text-muted, small')).slice(0, 60), img: '', alt: '' })) } };
    if (imgs.length >= 3 && words(el) < imgs.length * 18 + 20) return { type: 'gallery', variant: imgs.length >= 5 ? 'masonry' : 'grid', props: { title: title || 'Gallery', items: imgs.slice(0, 9).map(im => ({ img: '', alt: im.getAttribute('alt') || title || 'A picture', caption: T(im.closest('figure, .card, a, div') && im.closest('figure, .card, a, div').querySelector('figcaption, .caption, h3, h4, .portfolio-caption-heading, .project-name')).slice(0, 80) })) } };
    if (el.querySelector('iframe[src*="youtube"], iframe[src*="vimeo"], video')) return { type: 'embed', variant: 'wide', props: { title, url: (el.querySelector('iframe') || {}).src || '', caption: ps[0] || '' } };
    const rows = [...el.querySelectorAll('.resume-item, .timeline > li, .timeline-item, .d-flex.flex-column.flex-md-row, li.list-group-item, .post-preview, article.post, .post')].filter(r => !r.closest(SKIP));
    if (rows.length >= 2) return { type: 'list', variant: /post|blog/i.test(rows[0].className) ? 'cards' : 'rows', props: { title: title || 'Recent', items: rows.slice(0, 8).map(r => ({ title: T(r.querySelector('h2, h3, h4, .post-title, .timeline-heading h4')).slice(0, 90) || T(r).slice(0, 60), meta: T(r.querySelector('.text-primary, .resume-date, .date, time, .post-meta, small, .subheading')).slice(0, 50), text: T(r.querySelector('p:not(.post-meta), .post-subtitle, .timeline-body p')).slice(0, 220), link: { kind: '', to: '' } })) } };
    if (cards.length >= 2) return { type: 'features', variant: cards.length >= 4 ? 'grid' : cards.some(c => c.querySelector('img')) ? 'alternating' : 'grid', props: { title, items: cards.slice(0, 6).map(c => ({ title: T(c.querySelector('h3, h4, h5, h2, .card-title, strong, b')).slice(0, 60), text: T(c.querySelector('p')).slice(0, 220) })).filter(x => x.title) } };
    const b = btnsOf(el);
    if (b.length && words(el) < 60 && title) return { type: 'cta', variant: el.matches('.bg-primary, .bg-dark, .callout, .cta, .style1, .accent1, .alt') ? 'accent' : 'simple', props: { title, text: ps[0] || '', buttons: b.map(a => L(T(a), hrefOf(a).kind, hrefOf(a).to)) } };
    const img = imgs[0];
    if (img && ps.length && words(el) < 160) return { type: 'image', variant: 'side', props: { title, text: ps.join(' ').slice(0, 500), img: '', alt: img.getAttribute('alt') || title, shape: '' } };
    if (!title && !ps.length) return null;
    return { type: 'text', variant: ps.join(' ').length > 400 ? 'two' : 'plain', props: { title: title || 'About', text: ps.join('\n\n').slice(0, 1400) } };
  }
  // colors from computed styles (a real browser): the page background, the text, a muted text, cards and the accent
  // (the first saturated button or link background)
  const rgb = s => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(s || ''); return m && (m[4] === undefined || +m[4] > 0.5) ? '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase() : null; };
  const sat = h => { const n = parseInt(h.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
  function colorsOf(doc) {
    const W = doc.defaultView; if (!W || !W.getComputedStyle) return null;
    const cs = el => W.getComputedStyle(el);
    let bg = rgb(cs(doc.body).backgroundColor) || rgb(cs(doc.documentElement).backgroundColor) || '#FFFFFF';
    const main = doc.querySelector('main, #main, #wrapper, .page-wrapper'); const mbg = main && rgb(cs(main).backgroundColor); if (mbg) bg = mbg;
    const ink = rgb(cs(doc.querySelector('p') || doc.body).color) || '#111111';
    let accent = null;
    for (const el of doc.querySelectorAll('a.btn-primary, .btn-primary, a.button.primary, .button.primary, .btn, a.button, button, .bg-primary, .text-primary, a')) { for (const c of [rgb(cs(el).backgroundColor), rgb(cs(el).color), rgb(cs(el).borderColor)]) if (c && sat(c) > 0.35) { accent = c; break; } if (accent) break; }
    const head = doc.querySelector('h1, h2'), display = head ? cs(head).fontFamily : '', body = cs(doc.body).fontFamily;
    return { bg, ink, accent, display, body };
  }
  const FONTMAP = [[/playfair|lora|merriweather|georgia|serif(?!.*sans)|fraunces|libre baskerville|crimson|garamond/i, 'Fraunces'], [/mono|courier|source code/i, 'JetBrains Mono'], [/montserrat|poppins|raleway|kanit|catamaran|varela|sora|outfit|work sans|space grotesk/i, 'Space Grotesk'], [/bricolage|lobster|pacifico|oswald|anton|bebas/i, 'Bricolage Grotesque'], [/./, 'Inter']];
  const font = f => (FONTMAP.find(([rx]) => rx.test(f || '')) || [0, 'Inter'])[1];
  function fromDocument(doc, o = {}) {
    const report = [], name = o.name || T(doc.querySelector('.navbar-brand, #logo, .logo, header h1, title')).slice(0, 60) || 'My site';
    const els = blocksIn(doc);
    const blocks = [];
    els.forEach((el, i) => { const b = classify(el, i, els.length, name); if (!b) return; if (b.type === 'hero' && blocks.some(x => x.type === 'hero')) b.type = 'text', b.props = { title: b.props.title, text: b.props.text }, b.variant = 'plain'; blocks.push(b); report.push(`${(el.tagName || '').toLowerCase()}${el.id ? '#' + el.id : ''} → ${b.type}/${b.variant}`); });
    if (!blocks.length || blocks[0].type !== 'hero' && blocks[0].type !== 'links') blocks.unshift({ type: 'hero', variant: 'minimal', props: { eyebrow: '', title: name, text: '', img: '', alt: '', shape: '', buttons: [] } });
    if (!blocks.some(b => b.type === 'footer')) blocks.push({ type: 'footer', variant: 'simple', props: { text: `© ${name}`, links: [] } });
    const k = o.styles !== false ? colorsOf(doc) : null;
    const theme = { preset: 'minimal', mode: 'light' };
    if (k) {
      const C = S(), dark = C.contrast(k.bg, '#000000') < C.contrast(k.bg, '#FFFFFF');
      const mixh = (a, b, t) => { const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
      const ink = C.contrast(k.ink, k.bg) >= 4.5 ? k.ink : dark ? '#F4F4F4' : '#161616';
      theme.colors = { bg: k.bg, ink, muted: mixh(ink, k.bg, 0.35), card: mixh(k.bg, dark ? '#FFFFFF' : '#000000', 0.04), line: mixh(k.bg, dark ? '#FFFFFF' : '#000000', 0.12), accent: k.accent || (dark ? '#7DD3FC' : '#2C5BE0') };
      theme.fonts = { display: font(k.display), body: /serif/i.test(k.body) && !/sans/i.test(k.body) ? 'System serif' : 'Inter' };
      theme.mode = dark ? 'dark' : 'light'; theme.radius = 6;
    }
    const cfg = { v: 1, name, theme, pages: [{ title: 'Home', blocks: blocks.map(b => ({ type: b.type, variant: b.variant, props: b.props })) }] };
    return { cfg: S() ? S().normalize(cfg) : cfg, report };
  }
  function fromHtml(text, o = {}) { const doc = new DOMParser().parseFromString(String(text || ''), 'text/html'); return fromDocument(doc, { ...o, styles: false }); }
  root.TribeSiteImport = { fromDocument, fromHtml };
})(typeof self !== 'undefined' ? self : this);
