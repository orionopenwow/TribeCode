#!/usr/bin/env node
// Writes app/test/flint_eval.json: Flint's evaluation set for websites, the design canvas, preview edits, lessons and
// the app's global commands (feat/flint-site). Realistic phrasings: typos, slang, tangential and indirect wording.
// Each case: [text, intent, slots?, ctx?]. ctx: 's' website designer · 'c' canvas · 'cs' canvas with a selection ·
// 'p' the preview (Website mode) · 'g' anywhere else. Checked by app/test/flint_eval_test.js (no AI, ≥95%).
//   node scripts/dev/flint-eval-cases.js
'use strict';
const fs = require('fs'), path = require('path');
const C = [];
const add = (ctx, rows) => rows.forEach(r => C.push({ t: r[0], i: r[1], s: r[2] || undefined, ctx: r[3] || ctx }));

// ---- templates by name, slang and meaning (anywhere: Flint builds or opens the designer with it) ----
add('g', [
  ['link tree website', 'site.linkbio'], ['linktree', 'site.linkbio'], ['bio link page', 'site.linkbio'], ['make me a linktree', 'site.linkbio'],
  ['link in bio for my insta', 'site.linkbio'], ['i need one link for my instagram bio with all my stuff', 'site.linkbio'], ['a page with all my links', 'site.linkbio'],
  ['lnik tree site pls', 'site.linkbio'], ['links page for my tiktok', 'site.linkbio'], ['make a linkinbio called mara makes', 'site.linkbio', { name: 'mara makes' }],
  ['something for my band', 'site.band'], ['a website for my band', 'site.band'], ['we are a band and need a site with tour dates', 'site.band'], ['site for my dj gigs', 'site.band'],
  ['make a band page for the night owls', 'site.band', { name: 'the night owls' }], ['musician website', 'site.band'], ['bnad website', 'site.band'],
  ['a website for my bakery', 'site.cafe'], ['site for our coffee shop', 'site.cafe'], ['restaurant website with the menu', 'site.cafe'], ['my food truck needs a page', 'site.cafe'],
  ['something for my cafe', 'site.cafe'], ['menu page for a pizza place', 'site.cafe'],
  ['i sell candles online', 'site.merch'], ['online store for my t shirts', 'site.merch'], ['make a merch store for ember socks', 'site.merch', { name: 'ember socks' }], ['shop page to sell my prints', 'site.merch'],
  ['ecomerce site', 'site.merch'],
  ['portfolio', 'site.portfolio'], ['show off my design work', 'site.portfolio'], ['a site to show my case studies', 'site.portfolio'], ['make my portfolio site', 'site.portfolio'], ['portfollio pls', 'site.portfolio'],
  ['i stream on twitch, need a page', 'site.creator'], ['youtuber site', 'site.creator'], ['creator page with my schedule', 'site.creator'],
  ['website for my plumbing business', 'site.service'], ['a page for my hair salon', 'site.service'], ['local business site for my cleaning company', 'site.service'], ['handyman website', 'site.service'],
  ['we are getting married, need an rsvp site', 'site.wedding'], ['wedding website', 'site.wedding'], ['save the date page', 'site.wedding'], ['birthday party invite page', 'site.wedding'],
  ['podcast site', 'site.podcast'], ['a page for my podcast episodes', 'site.podcast'], ['something for our show', 'site.podcast'],
  ['i write a newsletter', 'site.blog'], ['blog', 'site.blog'], ['make a blog for my travel stories', 'site.blog'], ['devlog site', 'site.blog'],
  ['startup landing site', 'site.saas'], ['website for my app', 'site.saas'], ['product site for our saas', 'site.saas'], ['site for my startup', 'site.saas'],
  ['steam page for my indie game', 'site.gamepage'], ['press kit for our game', 'site.gamepage'], ['website for my game', 'site.gamepage'],
  ['my resume as a website', 'site.resume'], ['cv page', 'site.resume'], ['personal website', 'site.resume'], ['online resume pls', 'site.resume'],
  ['donation page for our charity', 'site.nonprofit'], ['nonprofit site', 'site.nonprofit'], ['fundraiser page for the animal shelter', 'site.nonprofit'],
  ['photo gallery site', 'site.photography'], ['i am a photographer, need a site', 'site.photography'], ['photography portfolio', 'site.photography'],
  ['coming soon page', 'site.comingsoon'], ['waitlist page to collect emails', 'site.comingsoon'], ['were launching soon, need a teaser page', 'site.comingsoon'],
  ['open the website designer', 'site.open'], ['edit my website', 'site.open'], ['website builder', 'nav.website'], ['design my site', 'site.open'],
  ['show me the website templates', 'site.gallery'],
]);
// ---- the website designer ----
add('s', [
  // wiring buttons and links
  ['make the buttons work', 'site.wire'], ['wire the buttons', 'site.wire'], ['functional buttons', 'site.wire'], ['buttons dont do anything', 'site.wire'],
  ['hook up the buttons', 'site.wire'], ['make the links work', 'site.wire'], ['make all the buttons clickable', 'site.wire'], ['the buttons should go somewhere', 'site.wire'],
  ['link this button to the contact page', 'site.wire', { kind: 'page', to: 'contact' }], ['wire this button to the about page', 'site.wire', { kind: 'page', to: 'about' }],
  ['make the get started button go to pricing', 'site.wire', { to: 'pricing' }], ['point the button at the faq', 'site.wire', { to: 'faq' }],
  ['link the button to https://shop.example.com', 'site.wire', { kind: 'url', to: 'https://shop.example.com' }], ['button should open hello@mara.studio', 'site.wire', { kind: 'email', to: 'hello@mara.studio' }],
  ['make it email me at sam@band.com', 'site.wire', { kind: 'email', to: 'sam@band.com' }], ['link it to my instagram', 'site.wire', { kind: 'url' }], ['send the button to the gallery section', 'site.wire', { to: 'gallery' }],
  ['wire teh button to contact', 'site.wire', { to: 'contact' }], ['conect the buttons to the pages', 'site.wire'], ['have the cta scroll to the signup form', 'site.wire', { to: 'contact' }],
  ['this button should go to the shop page', 'site.wire', { kind: 'page', to: 'shop' }], ['link the second button to the menu', 'site.wire', { to: 'menu' }],
  // pages
  ['add a page', 'site.page.add'], ['new page called about', 'site.page.add', { name: 'About' }], ['add an about page', 'site.page.add', { name: 'About' }], ['make a contact page', 'site.page.add', { name: 'Contact' }],
  ['i need a page for my shop', 'site.page.add', { name: 'Shop' }], ['create another page named Tour Dates', 'site.page.add', { name: 'Tour Dates' }], ['add a pricing page', 'site.page.add', { name: 'Pricing' }],
  ['ad a page called team', 'site.page.add', { name: 'Team' }], ['new page', 'site.page.add'], ['can we get a faq page too', 'site.page.add', { name: 'FAQ' }], ['add a second page', 'site.page.add'],
  ['rename this page to Work', 'site.page.rename', { name: 'Work' }], ['call this page Services', 'site.page.rename', { name: 'Services' }], ['change the page name to Our Story', 'site.page.rename', { name: 'Our Story' }],
  ['delete this page', 'site.page.delete'], ['remove the about page', 'site.page.delete', { name: 'about' }], ['get rid of the contact page', 'site.page.delete', { name: 'contact' }], ['i dont need the pricing page', 'site.page.delete', { name: 'pricing' }],
  // images
  ['replace the image', 'site.image.replace'], ['use my photo', 'site.image.replace', { source: 'upload' }], ['swap the picture', 'site.image.replace'], ['change the photo', 'site.image.replace'],
  ['upload a new picture', 'site.image.replace', { source: 'upload' }], ['use a picture from my inspiration board', 'site.image.replace', { source: 'board' }], ['put my moodboard pic there', 'site.image.replace', { source: 'board' }],
  ['use https://example.com/me.jpg as the image', 'site.image.replace', { source: 'url' }], ['replace teh pic with my own', 'site.image.replace', { source: 'upload' }], ['different image please', 'site.image.replace'],
  ['make the picture round', 'site.image.shape', { shape: 'round' }], ['round photo', 'site.image.shape', { shape: 'round' }], ['make my avatar a circle', 'site.image.shape', { shape: 'round' }], ['crop it into a circle', 'site.image.shape', { shape: 'round' }],
  ['make the image square', 'site.image.shape', { shape: 'square' }], ['square crop', 'site.image.shape', { shape: 'square' }], ['no rounded image', 'site.image.shape', { shape: 'square' }],
  ['add alt text', 'site.image.alt'], ['set the alt text to Mara at the wheel', 'site.image.alt', { alt: 'Mara at the wheel' }], ['describe the image for screen readers', 'site.image.alt'],
  ['edit this image', 'site.image.replace'],
  // dark mode, themes, colors
  ['dark mode', 'site.dark', { mode: 'dark' }], ['make a dark mode', 'site.dark', { mode: 'dark' }], ['make it darker', 'site.dark', { mode: 'dark' }], ['night theme', 'site.dark', { mode: 'dark' }],
  ['dark version of the site', 'site.dark', { mode: 'dark' }], ['go dark', 'site.dark', { mode: 'dark' }], ['make the site dark', 'site.dark', { mode: 'dark' }], ['drak mode', 'site.dark', { mode: 'dark' }],
  ['light mode', 'site.dark', { mode: 'light' }], ['make it light again', 'site.dark', { mode: 'light' }], ['too dark, brighten it up', 'site.dark', { mode: 'light' }], ['black background', 'site.dark', { mode: 'dark' }],
  ['use the night theme', 'site.dark', { mode: 'dark' }],
  ['use the paper theme', 'site.theme', { preset: 'paper' }], ['switch the theme to swiss', 'site.theme', { preset: 'swiss' }], ['try the terminal look', 'site.theme', { preset: 'terminal' }], ['make it look more editorial', 'site.theme', { preset: 'editorial' }],
  ['another theme', 'site.theme'], ['change the style', 'site.theme'], ['make it more playful', 'site.theme', { preset: 'playful' }], ['minimal look please', 'site.theme', { preset: 'minimal' }],
  ['make the accent teal', 'site.color', { color: 'teal' }], ['change the main color to #2A8C80', 'site.color', { color: '#2a8c80' }], ['make it purple', 'site.color', { color: 'purple' }], ['brand color green', 'site.color', { color: 'green' }],
  ['use pink for the buttons', 'site.color', { color: 'pink' }],
  // blocks
  ['add a gallery', 'site.block.add', { block: 'gallery' }], ['add a pricing section', 'site.block.add', { block: 'pricing' }], ['put some testimonials in', 'site.block.add', { block: 'testimonials' }],
  ['add a faq', 'site.block.add', { block: 'faq' }], ['add a contact form', 'site.block.add', { block: 'contact' }], ['add a team section', 'site.block.add', { block: 'team' }], ['add a video', 'site.block.add', { block: 'embed' }],
  ['embed my youtube video', 'site.block.add', { block: 'embed' }], ['add some features', 'site.block.add', { block: 'features' }], ['add a links list', 'site.block.add', { block: 'links' }], ['add a footer', 'site.block.add', { block: 'footer' }],
  ['i want people to be able to email me', 'site.block.add', { block: 'contact' }], ['show reviews from customers', 'site.block.add', { block: 'testimonials' }], ['add a photo grid', 'site.block.add', { block: 'gallery' }],
  ['add a section with prices', 'site.block.add', { block: 'pricing' }], ['questions and answers section', 'site.block.add', { block: 'faq' }], ['add a hero', 'site.block.add', { block: 'hero' }], ['ad a galery', 'site.block.add', { block: 'gallery' }],
  ['add a text section', 'site.block.add', { block: 'text' }], ['add my spotify embed', 'site.block.add', { block: 'embed' }], ['who we are section', 'site.block.add', { block: 'team' }],
  ['remove the faq', 'site.block.remove', { block: 'faq' }], ['delete the pricing section', 'site.block.remove', { block: 'pricing' }], ['get rid of the testimonials', 'site.block.remove', { block: 'testimonials' }], ['no gallery', 'site.block.remove', { block: 'gallery' }],
  ['move the faq to the top', 'site.block.move', { block: 'faq', dir: 'top' }], ['move the gallery up', 'site.block.move', { block: 'gallery', dir: 'up' }], ['put pricing at the bottom', 'site.block.move', { block: 'pricing', dir: 'bottom' }],
  ['move testimonials down', 'site.block.move', { block: 'testimonials', dir: 'down' }], ['put the contact form last', 'site.block.move', { block: 'contact', dir: 'bottom' }],
  ['change the hero layout', 'site.layout', { block: 'hero' }], ['try a different layout for the gallery', 'site.layout', { block: 'gallery' }], ['make the hero split', 'site.layout', { block: 'hero', variant: 'split' }], ['center the hero', 'site.layout', { block: 'hero', variant: 'center' }],
  ['show the pricing as a table', 'site.layout', { block: 'pricing', variant: 'table' }], ['masonry gallery', 'site.layout', { block: 'gallery', variant: 'masonry' }],
  // words
  ['change the headline to Fresh bread daily', 'site.text', { field: 'headline', text: 'Fresh bread daily' }], ['make the title say We play loud', 'site.text', { field: 'headline', text: 'We play loud' }],
  ['the button should say Book now', 'site.text', { field: 'button', text: 'Book now' }], ['change the tagline to Small batches, mostly mugs', 'site.text', { field: 'tagline', text: 'Small batches, mostly mugs' }],
  ['rename the site to Night Owls', 'site.text', { field: 'name', text: 'Night Owls' }],
  // export
  ['download the html', 'site.export', { fmt: 'html' }], ['export my site', 'site.export'], ['export as html', 'site.export', { fmt: 'html' }], ['give me a zip', 'site.export', { fmt: 'zip' }],
  ['download it as a zip with all the pages', 'site.export', { fmt: 'zip' }], ['can i get the code for this', 'site.export'], ['save it as a webpage file', 'site.export', { fmt: 'html' }], ['exprot html', 'site.export', { fmt: 'html' }],
  // undo/redo, templates from inside the designer
  ['undo', 'undo'], ['undo that', 'undo'], ['oops go back', 'undo'], ['redo', 'redo'], ['redo that', 'redo'], ['put it back', 'redo'],
  ['start over from the band template', 'site.band'], ['switch to the link in bio template', 'site.linkbio'], ['use the cafe template instead', 'site.cafe'],
]);
// ---- the preview (Website mode): the same words reach the site ----
add('p', [
  ['make the buttons work', 'site.wire'], ['link this button to the contact page', 'site.wire', { kind: 'page', to: 'contact' }], ['replace the image', 'site.image.replace'], ['make the picture round', 'site.image.shape', { shape: 'round' }],
  ['dark mode', 'site.dark', { mode: 'dark' }], ['make it darker', 'site.dark', { mode: 'dark' }], ['add a page called about', 'site.page.add', { name: 'About' }], ['add a gallery', 'site.block.add', { block: 'gallery' }],
  ['download the html', 'site.export', { fmt: 'html' }], ['open the designer', 'site.open'], ['show it on a phone', 'preview.device', { dev: 'phone' }], ['reload the preview', 'preview.reload'],
  ['make the headline say Open late on fridays', 'site.text', { field: 'headline', text: 'Open late on fridays' }],
]);
// ---- the design canvas ----
add('c', [
  ['link tree website', 'site.linkbio'], ['something for my band', 'site.band'], ['a website for my bakery', 'site.cafe'],
  ['functional buttons', 'canvas.wire'], ['make the buttons work', 'canvas.wire'], ['wire the buttons', 'canvas.wire'], ['hook the buttons up to screens', 'canvas.wire'],
  ['make a dark mode', 'canvas.dark', { mode: 'dark' }], ['dark mode', 'canvas.dark', { mode: 'dark' }], ['make it darker', 'canvas.dark', { mode: 'dark' }], ['night theme', 'canvas.dark', { mode: 'dark' }],
  ['dark mode version', 'canvas.dark', { mode: 'dark' }], ['light mode', 'canvas.dark', { mode: 'light' }],
  ['add a page', 'canvas.page'], ['add a screen', 'canvas.page'], ['new screen called settings', 'canvas.page', { name: 'Settings' }], ['add another page called pricing', 'canvas.page', { name: 'Pricing' }],
  ['new frame', 'canvas.page'], ['add an about page', 'canvas.page', { name: 'About' }],
  ['make a login screen', 'canvas.login'], ['a pricing section', 'canvas.pricing'], ['tidy up', 'canvas.tidy'], ['rename layers', 'canvas.rename'],
  ['open this in the website designer', 'site.open'], ['turn this into a real website', 'site.open'], ['make this a website i can publish', 'site.open'],
]);
add('cs', [
  ['wire this button to the login screen', 'canvas.wire', { to: 'login' }], ['link this to the pricing page', 'canvas.wire', { to: 'pricing' }], ['make this button go to settings', 'canvas.wire', { to: 'settings' }],
  ['link this button to https://ember.shop', 'canvas.wire', { kind: 'url', to: 'https://ember.shop' }], ['make this clickable', 'canvas.wire'],
  ['edit this image', 'canvas.image'], ['replace the image', 'canvas.image', { action: 'replace' }], ['use my photo', 'canvas.image', { action: 'replace' }], ['make the picture round', 'canvas.image', { action: 'round' }],
  ['make the image square', 'canvas.image', { action: 'square' }], ['use a picture from my board', 'canvas.image', { action: 'replace', source: 'board' }], ['round photo', 'canvas.image', { action: 'round' }],
  ['make a dark mode', 'canvas.dark', { mode: 'dark' }], ['dark mode version of this frame', 'canvas.dark', { mode: 'dark' }], ['make variants', 'canvas.variants'], ['make it bigger', 'edit.picked'],
]);
// ---- lessons ----
add('g', [
  ['teach me the website designer', 'lesson', { feature: 'site' }], ['how do i make a website', 'lesson', { feature: 'site' }], ['how does the site builder work', 'lesson', { feature: 'site' }],
  ['teach me the canvas', 'lesson', { feature: 'canvas' }], ['how do i use the design canvas', 'lesson', { feature: 'canvas' }], ['show me how design works', 'lesson', { feature: 'canvas' }],
  ['teach me the preview', 'lesson', { feature: 'preview' }], ['how does the preview work', 'lesson', { feature: 'preview' }],
  ['teach me tasks', 'lesson', { feature: 'tasks' }], ['how do tasks work', 'lesson', { feature: 'tasks' }], ['how do i use the task board', 'lesson', { feature: 'tasks' }],
  ['teach me work', 'lesson', { feature: 'work' }], ['how do gigs work', 'lesson', { feature: 'work' }],
  ['teach me templates', 'lesson', { feature: 'templates' }], ['how do website templates work', 'lesson', { feature: 'templates' }],
  ['teach me files', 'lesson', { feature: 'files' }], ['how do i upload files', 'lesson', { feature: 'files' }],
  ['teach me chat', 'lesson', { feature: 'chat' }], ['how does chat work', 'lesson', { feature: 'chat' }],
  ['teach me huddles', 'lesson', { feature: 'huddles' }], ['how do i start a voice call', 'lesson', { feature: 'huddles' }],
  ['teach me agents', 'lesson', { feature: 'agents' }], ['how do ai helpers work', 'lesson', { feature: 'agents' }],
  ['teach me company mode', 'lesson', { feature: 'company' }], ['how does the company work', 'lesson', { feature: 'company' }],
  ['teach me the inspiration board', 'lesson', { feature: 'inspo' }], ['how do i use a moodboard', 'lesson', { feature: 'inspo' }],
  ['teach me export', 'lesson', { feature: 'export' }], ['how do i export my site as html', 'lesson', { feature: 'export' }],
  ['teach me premium', 'lesson', { feature: 'premium' }], ['how do credits work', 'lesson', { feature: 'premium' }], ['what is premium', 'lesson', { feature: 'premium' }],
  ['lesson on the canvas', 'lesson', { feature: 'canvas' }], ['tutorial for tasks', 'lesson', { feature: 'tasks' }], ['teach me how to wire buttons', 'lesson', { feature: 'site' }],
  ['tech me the website designer', 'lesson', { feature: 'site' }], ['walk me through huddles', 'lesson', { feature: 'huddles' }],
]);
// ---- the app's global commands, near the new words (must keep their meaning) ----
add('g', [
  ['dark mode', 'theme.dark-mode'], ['make it darker', 'theme.dark-mode'], ['switch to dark mode', 'theme.dark-mode'], ['night mode', 'theme.dark-mode'], ['light mode', 'theme.light'],
  ['switch to campfire', 'theme.campfire'], ['add a task to fix the contact page', 'task.add', { title: 'Fix the contact page' }], ['open the website', 'nav.website'], ['open the design canvas', 'nav.design'],
  ['make a landing page for sunrise bakery', 'build.landing'], ['undo', 'undo'], ['tell maya the site is live', 'dm.send'], ['add a page to the docs about rules', 'doc.new'],
  ['open files', 'nav.files'], ['what can you do', 'tiers'], ['publish it', 'publish'], ['make a 3d game called orb run', 'build.3d'], ['change the accent color to teal', 'accent.set', { color: 'teal' }],
  ['open the inspiration board', 'nav.inspo'], ['open my moodboard', 'nav.inspo'], ['buy credits', 'premium.open'], ['get premium', 'premium.open'], ['upgrade', 'premium.open'],
  ['connect my ai', 'connect.ai'], ['use my own ai', 'connect.ai'], ['write a poem about the sea', null], ['make the backend scale to a million users', null],
  ['make a band page, then tell everyone', ['site.band', 'dm.send']], ['add a gallery page', 'doc.new'],
]);

// ---- held out: written after tuning, never tuned against; reported on their own ----
const H0 = C.length;
add('g', [['can u make me one of those link pages for my bio', 'site.linkbio'], ['website for my sourdough micro bakery', 'site.cafe'], ['our jazz trio needs a site', 'site.band'], ['site where i sell my zines', 'site.merch'],
  ['page for my yoga classes', 'site.service'], ['we got engaged!! need a page for the guests', 'site.wedding'], ['make a site for my mobile app', 'site.saas'], ['teach me the inspo board', 'lesson', { feature: 'inspo' }],
  ['how do i use huddles', 'lesson', { feature: 'huddles' }], ['tutorial on exporting', 'lesson', { feature: 'export' }], ['night theme', 'theme.dark-mode']]);
add('s', [['the signup button goes nowhere', 'site.wire'], ['make the order button link to the menu page', 'site.wire', { to: 'menu' }], ['new page: Workshops', 'site.page.add', { name: 'Workshops' }],
  ['swap in a photo from my board', 'site.image.replace', { source: 'board' }], ['circle crop the headshot', 'site.image.shape', { shape: 'round' }], ['flip it to dark', 'site.dark', { mode: 'dark' }],
  ['dark theme for the site pls', 'site.dark', { mode: 'dark' }], ['add customer reviews', 'site.block.add', { block: 'testimonials' }], ['add a map', 'site.block.add', { block: 'embed' }], ['ditch the footer', 'site.block.remove', { block: 'footer' }],
  ['move the team section above the faq', 'site.block.move', { block: 'team' }], ['download a zip', 'site.export', { fmt: 'zip' }], ['change the headline to Hand thrown in Tucson', 'site.text', { field: 'headline', text: 'Hand thrown in Tucson' }],
  ['make the accent orange', 'site.color', { color: 'orange' }], ['add an faq section', 'site.block.add', { block: 'faq' }], ['rename this page Menu', 'site.page.rename', { name: 'Menu' }]]);
add('cs', [['link this one to the checkout screen', 'canvas.wire', { to: 'checkout' }], ['make the photo a circle', 'canvas.image', { action: 'round' }], ['dark version', 'canvas.dark', { mode: 'dark' }]]);
add('c', [['another screen for settings', 'canvas.page'], ['buttons should actually work', 'canvas.wire']]);
for (let i = H0; i < C.length; i++) C[i].v = 'h1';   // held-out batch 1: 22/32 (68.8%) when first run, then tuned
// ---- held out, batch 2: written last and never tuned against ----
const H2 = C.length;
add('g', [['i do pottery and want a page with my shop + classes links', 'site.linkbio'], ['site for our church choir', 'site.band'], ['a page for my dog grooming biz', 'site.service'], ['site for the bake sale fundraiser', 'site.nonprofit'],
  ['teach me how the canvas works', 'lesson', { feature: 'canvas' }], ['how do i invite a friend', 'invite']]);
add('s', [['make every button go to the right page', 'site.wire'], ['add a page for events', 'site.page.add', { name: 'Events' }], ['kill the pricing section', 'site.block.remove', { block: 'pricing' }],
  ['upload my logo as the picture', 'site.image.replace', { source: 'upload' }], ['make it look like night time', 'site.dark', { mode: 'dark' }], ['swap the gallery to masonry', 'site.layout', { block: 'gallery', variant: 'masonry' }],
  ['export to html please', 'site.export', { fmt: 'html' }], ['bring back what i undid', 'redo']]);
add('cs', [['hook this button up to the profile screen', 'canvas.wire', { to: 'profile' }], ['make this image round', 'canvas.image', { action: 'round' }]]);
for (let i = H2; i < C.length; i++) C[i].v = 'held';

// feat/company-gigs: a gig you post for yourself, and finding people by skill
add('g', [['post a gig for me: I\'ll design your logo', 'gig.self', { what: "I'll design your logo" }], ['post a gig for me: i can build a landing page this weekend', 'gig.self'], ['create a gig for myself', 'gig.self'],
  ['offer my skills', 'gig.self'], ['post an offer for me: tutoring in math', 'gig.self', { what: 'tutoring in math' }], ['set up a gig saying i can mix your track', 'gig.self'], ['list a gig', 'gig.self'],
  ['find someone who can draw', 'people.find', { skill: 'draw' }], ['who can do pixel art', 'people.find'], ['anyone who can edit video', 'people.find', { skill: 'edit video' }],
  ['find me someone who knows how to code', 'people.find', { skill: 'code' }], ['i need someone who can write copy', 'people.find', { skill: 'write copy' }], ['find people', 'people.find']]);
// feat/presence: where people are, who's online, who's on what
add('g', [['where is maya', 'people.where'], ["where's Sam right now?", 'people.where'], ['what is maya doing', 'people.where'], ['is sam online', 'people.where'],
  ['who is online right now', 'people.online'], ["show me who's online", 'people.online'], ['anyone online today', 'people.online'],
  ["who's working on the website", 'people.working', { what: 'the website' }], ['who is editing the launch plan', 'people.working', { what: 'the launch plan' }], ['is anyone working on the login task', 'people.working']]);
// ---- site v2 (feat/site-v2): 170 more website phrasings, written before tuning (before: see CHANGELOG) ----
const V2 = C.length;
add('g', [
  ['make me a link tree website', 'site.linkbio'], ['i want a linktree thing for my insta', 'site.linkbio'], ['one page with all my socials', 'site.linkbio'], ['link in bio site called june bakes', 'site.linkbio', { name: 'june bakes' }],
  ['tour dates page for our band', 'site.band'], ['a site for my rapper friend with his songs', 'site.band'], ['website for our choir concerts', 'site.band'],
  ['menu website for my taco truck', 'site.cafe'], ['our bistro needs a website with reservations', 'site.cafe'], ['make a site for my coffee cart', 'site.cafe'],
  ['i make jewelry and want to sell it online', 'site.merch'], ['store for our band merch', 'site.merch'], ['sell my stickers on a website', 'site.merch'],
  ['website to show my illustration work', 'site.portfolio'], ['architecture portfolio site', 'site.portfolio'], ['a portfolio for my ux work', 'site.portfolio'],
  ['page for my youtube channel', 'site.creator'], ['twitch streamer website with my schedule', 'site.creator'], ['a site for my tiktok creator brand', 'site.creator'],
  ['website for my landscaping business', 'site.service'], ['a booking site for my nail salon', 'site.service'], ['site for my dog walking service', 'site.service'],
  ['rsvp page for our wedding in june', 'site.wedding'], ['website for our engagement party', 'site.wedding'], ['event page for the summer meetup', 'site.wedding'],
  ['website for our true crime podcast', 'site.podcast'], ['podcast landing page with episodes', 'site.podcast'], ['page for my audio show', 'site.podcast'],
  ['i want to start a blog about gardening', 'site.blog'], ['newsletter website with a subscribe box', 'site.blog'], ['a site for my essays', 'site.blog'],
  ['landing page for our b2b software', 'site.saas'], ['marketing site for my ios app', 'site.saas'], ['website for our ai startup', 'site.saas'],
  ['website for our steam game', 'site.gamepage'], ['a page to get wishlists for my game', 'site.gamepage'], ['presskit page for my game jam entry', 'site.gamepage'],
  ['online resume', 'site.resume'], ['personal website with my cv', 'site.resume'], ['a page about me for job hunting', 'site.resume'],
  ['donation site for our animal shelter', 'site.nonprofit'], ['charity website for the food bank', 'site.nonprofit'], ['fundraising page for our school club', 'site.nonprofit'],
  ['website for my wedding photography', 'site.photography'], ['photo portfolio for my street shots', 'site.photography'], ['gallery website for my photos', 'site.photography'],
  ['coming soon site for our launch', 'site.comingsoon'], ['a waitlist landing page', 'site.comingsoon'], ['prelaunch signup page for the app', 'site.comingsoon'],
  ['open the website templates', 'site.gallery'], ['browse website templates', 'site.gallery'],
  ['edit our website', 'site.open'], ['open the site designer', 'site.open'],
  ['build the website into the repo', 'site.repo'], ['put the website in our repo as code', 'site.repo'],
  ['make the headline on our website punchier', 'site.copy', { field: 'headline' }], ['add our opening hours to the website', 'site.hours'], ['publish our website', 'site.publish'],
  ['turn the website comments into tasks', 'site.comments.tasks'], ['fill the website in from our project', 'site.autofill'],
]);
add('s', [
  // copy changes
  ['make the headline punchier', 'site.copy', { field: 'headline', tone: 'punchy' }], ['punch up the headline', 'site.copy', { field: 'headline', tone: 'punchy' }], ['the headline is boring', 'site.copy', { field: 'headline', tone: 'punchy' }],
  ['make the tagline shorter', 'site.copy', { field: 'tagline', tone: 'shorter' }], ['shorten the intro text', 'site.copy', { field: 'tagline', tone: 'shorter' }], ['make the copy friendlier', 'site.copy', { tone: 'friendlier' }],
  ['make the text more professional', 'site.copy', { tone: 'formal' }], ['tighten up the words', 'site.copy', { tone: 'shorter' }], ['rewrite the headline', 'site.copy', { field: 'headline' }],
  ['change the button to say Book now', 'site.text', { field: 'button', text: 'Book now' }], ['the main button should say Order online', 'site.text', { field: 'button', text: 'Order online' }],
  ['button text: Reserve a table', 'site.text', { field: 'button', text: 'Reserve a table' }], ['make the cta say Join the waitlist', 'site.text', { field: 'button', text: 'Join the waitlist' }],
  ['change the headline to Fresh bread every morning', 'site.text', { field: 'headline', text: 'Fresh bread every morning' }], ['headline: We fix bikes', 'site.text', { field: 'headline', text: 'We fix bikes' }],
  ['set the subtitle to Open late on fridays', 'site.text', { field: 'tagline', text: 'Open late on fridays' }], ['rename the site to Ember Socks', 'site.text', { field: 'name', text: 'Ember Socks' }],
  // hours, info
  ['add our opening hours', 'site.hours'], ['put the hours on the site', 'site.hours'], ['show when we are open', 'site.hours'], ['add business hours', 'site.hours'], ['our hours are wrong, update them', 'site.hours'],
  // SEO, favicon, publish
  ['set the page title to Ember Socks | Warm socks', 'site.seo', { field: 'title', text: 'Ember Socks | Warm socks' }], ['change the seo title to Mara Makes Pottery', 'site.seo', { field: 'title', text: 'Mara Makes Pottery' }],
  ['set the meta description to Hand thrown mugs from Leeds', 'site.seo', { field: 'description', text: 'Hand thrown mugs from Leeds' }], ['seo description: Bikes fixed same day', 'site.seo', { field: 'description', text: 'Bikes fixed same day' }],
  ['improve the seo', 'site.seo'], ['what shows up on google', 'site.seo'], ['add a description for search engines', 'site.seo', { field: 'description' }], ['set the share image', 'site.seo', { field: 'image' }],
  ['use our logo as the favicon', 'site.favicon'], ['add a favicon', 'site.favicon'], ['change the tab icon', 'site.favicon'], ['set the browser icon to our logo', 'site.favicon'],
  ['publish it', 'site.publish'], ['put the site live', 'site.publish'], ['publish the website to the project', 'site.publish'], ['ship the site', 'site.publish'], ['make it live', 'site.publish'],
  ['download the html', 'site.export', { fmt: 'html' }], ['export as a zip', 'site.export', { fmt: 'zip' }], ['give me the files', 'site.export'], ['export the site', 'site.export'],
  // fonts
  ['use a serif font', 'site.font', { font: 'serif' }], ['change the font to space grotesk', 'site.font', { font: 'space grotesk' }], ['make the headings monospace', 'site.font', { font: 'mono' }],
  ['use fraunces for the headings', 'site.font', { font: 'fraunces' }], ['different font pairing', 'site.font'], ['the fonts look boring', 'site.font'], ['use a pixel font', 'site.font', { font: 'pixel' }], ['use a cleaner font', 'site.font', { font: 'sans' }],
  // colors, theme
  ['make the accent teal', 'site.color', { color: 'teal' }], ['use #2A8C80 for the buttons', 'site.color', { color: '#2a8c80' }], ['brand color should be orange', 'site.color', { color: 'orange' }], ['change the main color to navy', 'site.color', { color: 'navy' }],
  ['use the forest theme', 'site.theme', { preset: 'forest' }], ['switch to the ocean look', 'site.theme', { preset: 'ocean' }], ['try the ivory theme', 'site.theme', { preset: 'ivory' }], ['make it look editorial', 'site.theme', { preset: 'editorial' }],
  ['dark mode please', 'site.dark', { mode: 'dark' }], ['too dark, go light', 'site.dark', { mode: 'light' }],
  // sections: add, remove, hide, duplicate, move, layout
  ['add a newsletter signup', 'site.block.add', { block: 'newsletter' }], ['add a call to action at the end', 'site.block.add', { block: 'cta' }], ['add some stats', 'site.block.add', { block: 'stats' }], ['add a logo cloud', 'site.block.add', { block: 'logos' }],
  ['add a banner announcing the sale', 'site.block.add', { block: 'banner' }], ['put a divider between sections', 'site.block.add', { block: 'divider' }], ['add a big image section', 'site.block.add', { block: 'image' }], ['add a team section', 'site.block.add', { block: 'team' }],
  ['add a pricing table', 'site.block.add', { block: 'pricing' }], ['add testimonials', 'site.block.add', { block: 'testimonials' }], ['add a faq', 'site.block.add', { block: 'faq' }], ['add a map', 'site.block.add', { block: 'embed' }],
  ['remove the pricing', 'site.block.remove', { block: 'pricing' }], ['get rid of the testimonials', 'site.block.remove', { block: 'testimonials' }], ['delete the newsletter section', 'site.block.remove', { block: 'newsletter' }],
  ['hide the faq for now', 'site.block.hide', { block: 'faq' }], ['hide this section', 'site.block.hide'], ['hide the pricing until launch', 'site.block.hide', { block: 'pricing' }], ['show the faq again', 'site.block.show', { block: 'faq' }], ['unhide the pricing', 'site.block.show', { block: 'pricing' }],
  ['duplicate this section', 'site.block.dup'], ['copy the pricing section', 'site.block.dup', { block: 'pricing' }], ['make another one of these', 'site.block.dup'], ['clone the features block', 'site.block.dup', { block: 'features' }],
  ['move the faq to the top', 'site.block.move', { block: 'faq', dir: 'top' }], ['put the gallery below the hero', 'site.block.move', { block: 'gallery', dir: 'down' }], ['move testimonials up', 'site.block.move', { block: 'testimonials', dir: 'up' }],
  ['make the hero split', 'site.layout', { block: 'hero', variant: 'split' }], ['show the gallery as masonry', 'site.layout', { block: 'gallery', variant: 'masonry' }], ['pricing as a table', 'site.layout', { block: 'pricing', variant: 'table' }], ['center the hero', 'site.layout', { block: 'hero', variant: 'center' }],
  ['alternate the features left and right', 'site.layout', { block: 'features', variant: 'alternating' }], ['make the testimonials a spotlight', 'site.layout', { block: 'testimonials', variant: 'spotlight' }],
  // spacing and backgrounds
  ['more space between sections', 'site.spacing', { size: 'more' }], ['tighter spacing', 'site.spacing', { size: 'less' }], ['the hero needs more breathing room', 'site.spacing', { size: 'more' }], ['less padding', 'site.spacing', { size: 'less' }], ['make it more compact', 'site.spacing', { size: 'less' }],
  ['make the pricing background dark', 'site.bg', { block: 'pricing', bg: 'ink' }], ['give this section the accent color as background', 'site.bg', { bg: 'accent' }], ['use a light gray background for the features', 'site.bg', { block: 'features', bg: 'card' }], ['remove the section background', 'site.bg', { bg: 'none' }],
  // images
  ['replace the hero image', 'site.image.replace'], ['use a picture from my board', 'site.image.replace', { source: 'board' }], ['upload my own photo', 'site.image.replace', { source: 'upload' }], ['make the photo round', 'site.image.shape', { shape: 'round' }], ['alt text: Mara at the wheel', 'site.image.alt', { alt: 'Mara at the wheel' }],
  ['add our logo', 'site.logo'], ['put our logo in the header', 'site.logo'], ['use the project logo', 'site.logo'],
  // wiring, pages
  ['make the buttons work', 'site.wire'], ['link the book button to the contact page', 'site.wire', { to: 'contact' }], ['the order button goes nowhere', 'site.wire'], ['add a page called Menu', 'site.page.add', { name: 'Menu' }], ['rename this page to Work', 'site.page.rename', { name: 'Work' }],
  // devices
  ['show me the phone version', 'site.device', { dev: 'phone' }], ['tablet preview', 'site.device', { dev: 'tablet' }], ['how does it look on mobile', 'site.device', { dev: 'phone' }], ['back to desktop view', 'site.device', { dev: 'desktop' }],
  // comments, autofill
  ['turn these comments into tasks', 'site.comments.tasks'], ['flint summarize the comments', 'site.comments.tasks'], ['make tasks from the feedback', 'site.comments.tasks'], ['what did people comment', 'site.comments'], ['show the comments', 'site.comments'],
  ['fill it in from our project', 'site.autofill'], ['use our team and hours from the project', 'site.autofill'], ['autofill the site', 'site.autofill'], ['start blank instead', 'site.blank'],
  ['undo that', 'undo'],
]);
add('p', [
  ['make the headline punchier', 'site.copy', { field: 'headline', tone: 'punchy' }], ['add our opening hours', 'site.hours'], ['change the button to say Book now', 'site.text', { field: 'button', text: 'Book now' }],
  ['use a serif font', 'site.font', { font: 'serif' }], ['hide the faq', 'site.block.hide', { block: 'faq' }], ['add a favicon', 'site.favicon'], ['publish it', 'site.publish'], ['add a newsletter signup', 'site.block.add', { block: 'newsletter' }],
]);
for (let i = V2; i < C.length; i++) C[i].v = 'v2';

// ---- held out, batch 3 (feat/site-v2): written after tuning the v2 batch, never tuned against ----
const H3 = C.length;
add('g', [['gimme a linktree for my art account', 'site.linkbio'], ['site for my barbershop', 'site.service'], ['our ramen place needs a website', 'site.cafe'], ['a page to sell my zines', 'site.merch'],
  ['website for my wedding next spring', 'site.wedding'], ['i run a podcast about birds, need a site', 'site.podcast'], ['make a waitlist page for the beta', 'site.comingsoon'], ['portfolio site for my 3d art', 'site.portfolio'],
  ['add the opening hours to our website', 'site.hours'], ['make our website headline snappier', 'site.copy', { field: 'headline' }]]);
add('s', [['the title needs more punch', 'site.copy', { field: 'headline', tone: 'punchy' }], ['make the intro less wordy', 'site.copy', { field: 'tagline', tone: 'shorter' }], ['button should say Get a quote', 'site.text', { field: 'button', text: 'Get a quote' }],
  ['list our hours', 'site.hours'], ['set the google description to Fresh pasta in Brighton', 'site.seo', { field: 'description', text: 'Fresh pasta in Brighton' }], ['make our logo the favicon', 'site.favicon'],
  ['switch the headings to a serif', 'site.font', { font: 'serif' }], ['go live with the site', 'site.publish'], ['add an email signup box', 'site.block.add', { block: 'newsletter' }], ['add a numbers section', 'site.block.add', { block: 'stats' }],
  ['temporarily hide the team section', 'site.block.hide', { block: 'team' }], ['duplicate the pricing block', 'site.block.dup', { block: 'pricing' }], ['give the faq a dark background', 'site.bg', { block: 'faq', bg: 'ink' }], ['add more whitespace', 'site.spacing', { size: 'more' }],
  ['preview it on a tablet', 'site.device', { dev: 'tablet' }], ['turn the pins into tasks', 'site.comments.tasks'], ['use the sand theme', 'site.theme', { preset: 'sand' }], ['make the hero image round', 'site.image.shape', { shape: 'round' }],
  ['put a call to action before the footer', 'site.block.add', { block: 'cta' }], ['pull our team from the project', 'site.autofill']]);
add('p', [['shorten the headline', 'site.copy', { field: 'headline', tone: 'shorter' }], ['add business hours', 'site.hours']]);
for (let i = H3; i < C.length; i++) C[i].v = 'held3';

const out = { about: 'Flint evaluation set (feat/flint-site): websites, the design canvas, preview edits, lessons and global commands. Written by scripts/dev/flint-eval-cases.js; checked by app/test/flint_eval_test.js. "i" = the expected intent (a list for several steps, null when Flint should not claim it), "s" = slots that must match, "ctx" = s|c|cs|p|g (site designer, canvas, canvas with a selection, preview, anywhere).', now: '2026-11-10T10:00:00', cases: C };
fs.writeFileSync(path.join(__dirname, '..', '..', 'app', 'test', 'flint_eval.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`flint_eval.json: ${C.length} cases`);
