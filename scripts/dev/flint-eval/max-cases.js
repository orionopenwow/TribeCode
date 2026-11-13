// feat/flint-max: the tuning batch for the new no-AI moves (design intelligence, copy, sheets, docs, slides, canvas
// recipes, pronouns, several steps at once). [ctx, text, intent (or a list), slots]. ctx: s · c · cs · sh · d · sl · g
module.exports = [
  // palettes and contrast (designer)
  ['s', 'warm autumn palette', 'site.palette', { mood: 'autumn' }], ['s', 'use an ocean color palette', 'site.palette', { mood: 'ocean' }], ['s', 'make a palette from #2a8c80', 'site.palette', { color: '#2a8c80' }],
  ['s', 'give me a forest colour scheme', 'site.palette', { mood: 'forest' }], ['s', 'neon palette pls', 'site.palette', { mood: 'neon' }], ['s', 'colors inspired by the beach', 'site.palette', { mood: 'ocean' }],
  ['s', 'try a pastel palette', 'site.palette', { mood: 'pastel' }], ['s', 'a cozy coffee shop palette', 'site.palette', { mood: 'coffee' }], ['s', 'switch to a midnight color scheme', 'site.palette', { mood: 'midnight' }],
  ['s', 'palete for a wedding', 'site.palette', { mood: 'romantic' }], ['s', 'generate a color scheme around #ff6f8e', 'site.palette', { color: '#ff6f8e' }], ['s', 'retro palette', 'site.palette', { mood: 'retro' }],
  ['s', 'fix the contrast', 'site.contrast'], ['s', 'is the text readable on this background', 'site.contrast'], ['s', 'check accessibility', 'site.contrast'], ['s', 'does it pass wcag', 'site.contrast'],
  ['s', 'the grey text is hard to read on the background', 'site.contrast'], ['s', 'make sure the colours are accessible', 'site.contrast'],
  // type and style
  ['s', 'pick fonts that feel elegant', 'site.fontpair', { mood: 'elegant' }], ['s', 'fonts for a friendly bakery', 'site.fontpair', { mood: 'friendly' }], ['s', 'professional fonts please', 'site.fontpair', { mood: 'professional' }],
  ['s', 'modern typography', 'site.fontpair', { mood: 'modern' }], ['s', 'retro fonts', 'site.fontpair', { mood: 'retro' }], ['s', 'playful font pairing', 'site.fontpair', { mood: 'playful' }],
  ['s', 'make this more professional', 'site.style', { style: 'professional' }], ['s', 'make it look more corporate', 'site.style', { style: 'professional' }], ['s', 'more elegant', 'site.style', { style: 'elegant' }],
  ['s', 'brutalist', 'site.style', { style: 'brutalist' }], ['s', 'give it a luxury feel', 'site.style', { style: 'luxury' }], ['s', 'make the site feel friendlier', 'site.style'], ['s', 'make it feel calm', 'site.style', { style: 'calm' }],
  ['s', 'go retro', 'site.style', { style: 'retro' }], ['s', 'make it more modern', 'site.style', { style: 'modern' }], ['s', 'techy vibe', 'site.style', { style: 'techy' }],
  // layout
  ['s', 'tidy this up', 'site.tidy'], ['s', 'make it look balanced', 'site.tidy'], ['s', 'fix the spacing', 'site.tidy'], ['s', 'align everything', 'site.tidy'], ['s', 'it looks cluttered', 'site.tidy'], ['s', 'neaten the layout', 'site.tidy'],
  // copy
  ['s', 'give me headline ideas', 'site.headlines'], ['s', 'suggest a headline', 'site.headlines'], ['s', 'other tagline options', 'site.headlines'], ['s', 'brainstorm some titles', 'site.headlines'],
  ['s', 'suggest a better call to action', 'site.cta'], ['s', 'what should the button say', 'site.cta'], ['s', 'better button text ideas', 'site.cta'],
  ['s', 'how readable is this', 'site.readability'], ['s', 'readability score', 'site.readability'], ['s', 'is it easy to read', 'site.readability'], ['s', 'what grade level is the copy', 'site.readability'],
  ['s', 'fix the capitalization', 'site.titlecase'], ['s', 'title case the headings', 'site.titlecase'], ['s', 'capitalise the titles', 'site.titlecase'],
  // pricing, pronouns, several steps
  ['s', 'add a pricing section with three plans', 'site.price.plans', { n: 3 }], ['s', 'pricing with two tiers', 'site.price.plans', { n: 2 }], ['s', 'i need 4 plans in the pricing', 'site.price.plans', { n: 4 }],
  ['s', 'make the middle one highlighted', 'site.price.highlight', { which: 'middle' }], ['s', 'highlight the middle plan', 'site.price.highlight', { which: 'middle' }], ['s', 'make the pro plan stand out', 'site.price.highlight', { which: 'pro' }],
  ['s', 'mark the last tier as most popular', 'site.price.highlight', { which: 'last' }], ['s', 'recommended plan should be the second one', 'site.price.highlight', { which: 'second' }],
  ['s', 'make it bigger', 'site.size', { dir: 'bigger' }], ['s', 'make this a bit smaller', 'site.size', { dir: 'smaller' }], ['s', 'bigger', 'site.size', { dir: 'bigger' }],
  ['s', 'do the same on the about page', 'site.same', { page: 'about' }], ['s', 'same on contact', 'site.same', { page: 'contact' }], ['s', 'do that on the about page too', 'site.same', { page: 'about' }], ['s', 'repeat that for the shop page', 'site.same', { page: 'shop' }],
  ['s', 'undo that', 'undo'],
  ['s', 'add a pricing section with three plans, make the middle one highlighted, then switch to dark mode', ['site.price.plans', 'site.price.highlight', 'site.dark']],
  ['s', 'warm autumn palette then pick elegant fonts', ['site.palette', 'site.fontpair']], ['s', 'make it more professional and then fix the contrast', ['site.style', 'site.contrast']],
  ['s', 'add a faq, tidy this up', ['site.block.add', 'site.tidy']],
  // canvas
  ['c', 'add a navbar', 'canvas.recipe', { kind: 'navbar' }], ['c', 'put a navigation bar at the top', 'canvas.recipe', { kind: 'navbar' }], ['c', 'add a footer', 'canvas.recipe', { kind: 'footer' }],
  ['c', 'make a card grid', 'canvas.recipe', { kind: 'cardgrid' }], ['cs', 'turn this into a card grid', 'canvas.recipe', { kind: 'cardgrid' }], ['cs', 'arrange these as cards', 'canvas.recipe', { kind: 'cardgrid' }],
  ['c', 'add a sign up form', 'canvas.recipe', { kind: 'form' }], ['c', 'add a sidebar', 'canvas.recipe', { kind: 'sidebar' }], ['c', 'drop in a tab bar', 'canvas.recipe', { kind: 'tabbar' }],
  ['c', 'add a confirm dialog', 'canvas.recipe', { kind: 'modal' }], ['c', 'add a hero section', 'canvas.recipe', { kind: 'hero' }], ['c', 'insert a header bar', 'canvas.recipe', { kind: 'navbar' }],
  ['c', 'apply a sunset palette', 'canvas.palette', { mood: 'sunset' }], ['c', 'recolor it all with a forest palette', 'canvas.palette', { mood: 'forest' }], ['c', 'color scheme from #3b82f6', 'canvas.palette', { color: '#3b82f6' }],
  ['c', 'make a login screen', 'canvas.login'],
  // sheets
  ['sh', 'sum this column', 'sheet.sum', { fn: 'sum' }], ['sh', 'what is the total of column D', 'sheet.sum', { col: 'D' }], ['sh', 'add up the sales', 'sheet.sum', { col: 'sales' }], ['sh', 'average of the price column', 'sheet.sum', { fn: 'average', col: 'price' }],
  ['sh', 'whats the highest amount', 'sheet.sum', { fn: 'max' }], ['sh', 'how many rows have a cost', 'sheet.sum', { fn: 'count' }],
  ['sh', 'make a chart of sales by month', 'sheet.chart', { y: 'sales', x: 'month' }], ['sh', 'chart this', 'sheet.chart'], ['sh', 'line chart of cost by week', 'sheet.chart', { type: 'line' }], ['sh', 'visualize the data', 'sheet.chart'],
  ['sh', 'sort by amount', 'sheet.sort', { col: 'amount' }], ['sh', 'sort by name a to z', 'sheet.sort', { dir: 'asc' }], ['sh', 'order it by price, highest first', 'sheet.sort', { dir: 'desc' }], ['sh', 'sort descending by date', 'sheet.sort', { dir: 'desc' }],
  ['sh', 'format as currency', 'sheet.format', { fmt: 'currency' }], ['sh', 'show the prices in euros', 'sheet.format', { sym: '€' }], ['sh', 'make column C dollars', 'sheet.format', { col: 'C' }], ['sh', 'format the rate as percent', 'sheet.format', { fmt: 'percent' }],
  ['sh', 'add a total row', 'sheet.total'], ['sh', 'totals at the bottom please', 'sheet.total'], ['sh', 'add totals', 'sheet.total'],
  ['sh', 'sort by amount then add a total row', ['sheet.sort', 'sheet.total']],
  // docs
  ['d', 'make a table of contents', 'doc.toc'], ['d', 'add a toc', 'doc.toc'], ['d', 'turn this into a checklist', 'doc.checklist'], ['d', 'make it a to do list', 'doc.checklist'],
  ['d', 'summarize', 'doc.summary'], ['d', 'add a tldr at the top', 'doc.summary'], ['d', 'sum this up', 'doc.summary'], ['d', 'fix capitalization', 'doc.caps'], ['d', 'title case the headings', 'doc.caps', { mode: 'title' }],
  ['d', 'readability score', 'doc.readability'], ['d', 'whats the reading level', 'doc.readability'], ['d', 'add a table of contents and fix capitalization', ['doc.toc', 'doc.caps']],
  // slides
  ['sl', 'make a 5-slide pitch from the vision doc', 'deck.pitch', { n: 5, from: 'vision' }], ['g', 'make a 5-slide pitch from the vision doc', 'deck.pitch', { n: 5 }], ['g', 'turn the vision into slides', 'deck.pitch', { from: 'vision' }],
  ['g', 'build a pitch deck from our readme', 'deck.pitch', { from: 'readme' }], ['d', 'turn this doc into a presentation', 'deck.pitch'], ['sl', 'make slides from the launch plan', 'deck.pitch', { from: 'launch plan' }],
  // anywhere
  ['g', 'palette for warm autumn', 'design.palette', { mood: 'autumn' }], ['g', 'show me an ocean palette', 'design.palette', { mood: 'ocean' }], ['g', 'make me a color palette from #6c7cff', 'design.palette', { color: '#6c7cff' }],
  ['g', 'which fonts pair well for a law firm', 'design.fonts'], ['g', 'fonts that feel playful', 'design.fonts', { mood: 'playful' }],
  ['g', 'title case: how to train your dragon', 'copy.titlecase', { text: 'how to train your dragon' }], ['g', 'headline ideas for my bakery', 'copy.headlines', { about: 'bakery' }], ['g', 'cta ideas for a yoga studio', 'copy.cta'],
  ['g', 'how readable is: we utilize synergies to facilitate outcomes', 'copy.readability'],
  // the old meanings stay
  ['s', 'make it more playful', 'site.theme', { preset: 'playful' }], ['s', 'make the accent teal', 'site.color'], ['s', 'add a pricing section', 'site.block.add', { block: 'pricing' }], ['g', 'build a pitch deck for investors', 'deck.new'],
];
