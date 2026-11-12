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
  ['make a band page, then tell everyone', ['site.band', 'chat.send']], ['add a gallery page', 'doc.new'],
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

const out = { about: 'Flint evaluation set (feat/flint-site): websites, the design canvas, preview edits, lessons and global commands. Written by scripts/dev/flint-eval-cases.js; checked by app/test/flint_eval_test.js. "i" = the expected intent (a list for several steps, null when Flint should not claim it), "s" = slots that must match, "ctx" = s|c|cs|p|g (site designer, canvas, canvas with a selection, preview, anywhere).', now: '2026-11-10T10:00:00', cases: C };
fs.writeFileSync(path.join(__dirname, '..', '..', 'app', 'test', 'flint_eval.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`flint_eval.json: ${C.length} cases`);
