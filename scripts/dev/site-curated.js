#!/usr/bin/env node
// The website templates the gallery offers (site-templates2). Each is a designer config written by hand: its own
// opening, its own rhythm, its own type, and sample words for a clearly invented business.
//
//   node scripts/dev/site-curated.js            prints the list as JSON (scripts/dev/site-gallery.py reads it)
//
// A template: { id, title, summary (one line on who it is for), category, kind, tags, config }.
// Pictures are "illus:<name>": scripts/dev/site-gallery.py draws them with sitecfg.illustration in the site's colours.
// RETIRED maps every template the gallery no longer offers to the closest one it does (catalog.json: retired, alias).
const U = p => ({ kind: 'url', to: 'https://example.com/' + p });
const M = a => ({ kind: 'email', to: a });
const SEC = to => ({ kind: 'section', to });
const B = (label, link) => ({ label, link: link || { kind: '', to: '' } });
const I = n => 'illus:' + n;
const theme = (colors, display, body, radius, more) => ({ preset: 'minimal', mode: more && more.dark ? 'dark' : 'light', colors, fonts: { display, body: body || 'Inter' }, radius, ...(more && more.dw ? { dw: 400 } : {}), ...(more && more.btn ? { btn: more.btn } : {}), ...(more && more.space ? { space: more.space } : {}) });
const K = (bg, ink, muted, card, line, accent) => ({ bg, ink, muted, card, line, accent });
const blk = (id, type, variant, props, style) => ({ id, type, variant, props, ...(style ? { style } : {}) });
const foot = (text, links, variant) => blk('bfoot', 'footer', variant || 'simple', { text, links: links || [] });

const T = [];
const add = (id, title, summary, category, kind, tags, config) => T.push({ id, title, summary, category, kind, tags, config });

// ---------------------------------------------------------------- link in bio
add('linkbio', 'Link in bio', 'For anyone with one link to give: a potter, a baker, a tutor. A photo, a line and a stack of buttons.', 'Link in bio', 'linkbio', ['linktree', 'link tree', 'links', 'social', 'bio', 'instagram', 'tiktok'], {
  name: 'Mara Okafor', seo: { description: 'Mara Okafor makes small-batch ceramics in Tucson. Shop the latest batch, book a wheel class, or write about wholesale.' },
  theme: theme(K('#E7F0EC', '#15302A', '#49635C', '#FFFFFF', '#15302A', '#C4481F'), 'Outfit', 'Inter', 18, { btn: 'pill' }),
  pages: [{ title: 'Home', blocks: [
    blk('blinks', 'links', 'pills', { name: 'Mara Okafor', bio: 'Ceramics from a garage studio in Tucson. Small batches, mostly mugs, some very odd vases.', img: I('still'), alt: 'One of Mara\'s vases beside two pieces of fruit', shape: 'round',
      items: [{ label: 'Shop the November batch', note: 'Opens Friday at 10am', link: U('shop') }, { label: 'Wheel-throwing class, Saturdays', note: '4 spots left', link: U('class') }, { label: 'How I glaze: a 9-minute video', note: '', link: U('video') }, { label: 'Wholesale and cafés', note: 'I answer within two days', link: M('hello@example.com') }],
      socials: [{ label: 'Instagram', link: U('instagram') }, { label: 'TikTok', link: U('tiktok') }, { label: 'YouTube', link: U('youtube') }] }),
    foot('Made in Tucson', [], 'minimal'),
  ] }],
});

add('creator', 'Creator tiles', 'For streamers, musicians and makers with a lot going on: your links as a grid of tiles, the big ones first.', 'Link in bio', 'linkbio', ['creator', 'streamer', 'twitch', 'youtube', 'musician', 'bento', 'links', 'bio'], {
  name: 'Juno Vale', seo: { description: 'Juno Vale streams cosy strategy games four nights a week. The schedule, the newest video, merch and the Discord.' },
  theme: theme(K('#15101F', '#F5F1FF', '#ADA3C9', '#211A31', '#372C50', '#FF6FB1'), 'Bricolage Grotesque', 'Inter', 20, { dark: true }),
  pages: [{ title: 'Home', blocks: [
    blk('blinks', 'links', 'bento', { name: 'Juno Vale', bio: 'Cosy strategy games, four nights a week. Tea in hand, no backseat gaming.', img: I('portrait'), alt: 'Juno Vale', shape: 'round',
      items: [{ label: 'Live tonight at 8pm', note: 'Building the canal city, part 6', link: U('live') }, { label: 'This week\'s schedule', note: 'Tue, Thu, Fri, Sun', link: U('schedule') }, { label: 'Newest video', note: '40 minutes', link: U('video') }, { label: 'Join the Discord', note: '2,300 people, one rule: be kind', link: U('discord') }, { label: 'Merch', note: 'The frog mug is back', link: U('merch') }, { label: 'Work with me', note: '', link: M('juno@example.com') }],
      socials: [{ label: 'Twitch', link: U('twitch') }, { label: 'YouTube', link: U('youtube') }, { label: 'Bluesky', link: U('bluesky') }] }),
    foot('Juno Vale. Be kind in chat.', [], 'minimal'),
  ] }],
});

// ---------------------------------------------------------------- app or project
add('gh-project', 'Open-source project', 'For a tool that lives on GitHub: what it does, how to install it in one line, what changed, where the code is.', 'Projects', 'app', ['github', 'open source', 'project', 'developer', 'cli', 'library', 'readme', 'docs'], {
  name: 'Tidepool', seo: { description: 'Tidepool: a tiny notes app that opens instantly, works offline and keeps your notes as plain files. Free and open source.' },
  theme: theme(K('#0F1419', '#E6EDF3', '#8D9AA7', '#171D24', '#2A323C', '#7EE0C0'), 'JetBrains Mono', 'JetBrains Mono', 4, { dark: true }),
  pages: [{ title: 'Home', blocks: [
    { ...blk('bhero', 'hero', 'aside', { eyebrow: 'Version 1.0, free and open source', title: 'Notes that open before you finish the thought', text: 'Tidepool is a tiny notes app. It starts in under a second, works with no connection and keeps every note as a plain text file you own.', img: '', alt: '', shape: '',
      asideTitle: 'Install', aside: '$ brew install tidepool\n$ tidepool new "shopping list"\n\nWindows and Linux builds are on the releases page.',
      buttons: [B('Download', { kind: 'url', to: 'https://github.com/you/your-project/releases/latest' }), B('View on GitHub', { kind: 'url', to: 'https://github.com/you/your-project' })] }), es: { aside: { f: 'mono' } } },
    blk('bwhy', 'features', 'list', { title: 'Why people use it', items: [{ title: 'Opens in a blink', text: 'No account, no loading screen, no sync spinner. Press the shortcut and type.' }, { title: 'Plain files', text: 'Every note is a .txt file in a folder you choose. Back it up, grep it, move it.' }, { title: 'Works offline', text: 'On a plane, on a train, in the basement. Nothing in it needs the network.' }, { title: 'Small', text: '4 MB to download. It will not ask to update itself every week.' }] }),
    blk('bstart', 'steps', 'stack', { title: 'Get started', items: [{ title: 'Download it', text: 'Pick your computer on the releases page, or use the one-line install above.' }, { title: 'Open it', text: 'No setup. A notes folder is made for you in Documents.' }, { title: 'Write', text: 'Press N for a new note, / to search every note.' }] }),
    blk('bnew', 'list', 'rows', { title: 'What\'s new', items: [{ title: 'Version 1.0', meta: 'This month', text: 'Search across every note, and a dark mode.', link: { kind: 'url', to: 'https://github.com/you/your-project/releases' } }, { title: 'Version 0.9', meta: 'Last month', text: 'Faster start-up, and tags.', link: { kind: 'url', to: 'https://github.com/you/your-project/releases' } }, { title: 'Version 0.8', meta: 'In the spring', text: 'Notes folders on a USB stick or a shared drive.', link: { kind: 'url', to: 'https://github.com/you/your-project/releases' } }] }),
    blk('bhelp', 'cta', 'split', { title: 'Help make it better', text: 'Found a bug or have an idea? Open an issue, or send a fix. First-timers are welcome.', buttons: [B('Open an issue', { kind: 'url', to: 'https://github.com/you/your-project/issues' })] }),
    foot('Tidepool is MIT licensed.', [B('GitHub', { kind: 'url', to: 'https://github.com/you/your-project' }), B('Releases', { kind: 'url', to: 'https://github.com/you/your-project/releases' })]),
  ] }],
});

add('app-download', 'App download page', 'For a phone or desktop app: one claim on a band of colour, the store buttons, a look inside, and the questions people ask.', 'Projects', 'app', ['app', 'download', 'app store', 'google play', 'iphone', 'android', 'mobile'], {
  name: 'Pocket Plant', seo: { description: 'Pocket Plant reminds you when each plant needs water and tells you what the yellow leaves mean. Free on iPhone and Android.' },
  theme: theme(K('#F4F8F2', '#12261A', '#4A6152', '#FFFFFF', '#D3E2D5', '#1B7F45'), 'Outfit', 'Inter', 22, { btn: 'pill' }),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'accent', { eyebrow: 'Free on iPhone and Android', title: 'Never forget the ferns again', text: 'Pocket Plant reminds you when each plant needs water, and tells you what the yellow leaves mean.', img: I('phone'), alt: 'Pocket Plant on a phone, showing today\'s plants to water', shape: '', buttons: [B('Get it on the App Store', U('app-store')), B('Get it on Google Play', U('google-play'))] }),
    blk('bwhat', 'features', 'ticks', { title: 'What it does', items: [{ title: 'Reminders that learn your home', text: 'A sunny sill dries out faster than a bathroom shelf. It notices.' }, { title: 'A care card for 900 plants', text: 'Light, water, soil and what usually goes wrong.' }, { title: 'Share the watering', text: 'Everyone in the house sees what is done and what is thirsty.' }, { title: 'A holiday list', text: 'One page for the neighbour, with photos of each pot.' }] }),
    blk('blook', 'gallery', 'strip', { title: 'A look inside', items: [{ img: I('phone'), alt: 'The Today screen with three plants to water', caption: 'Today: three to water' }, { img: I('garden'), alt: 'Young plants in two raised beds', caption: 'Your plants, room by room' }, { img: I('notebook'), alt: 'A care card with a tick beside watering', caption: 'A care card for each one' }] }),
    blk('bfaq', 'faq', 'columns', { title: 'Questions', items: [{ q: 'Is it really free?', a: 'Yes, for up to 20 plants. More than that is $2 a month, and that pays for the two of us who make it.' }, { q: 'Do I need an account?', a: 'No. Your plants stay on your phone unless you turn on sharing.' }, { q: 'Does it work for a garden?', a: 'Pots and house plants are what it knows best. Vegetable beds are coming next spring.' }, { q: 'My plant is not in the list.', a: 'Add it with a photo and a watering guess. We add the most requested ones each month.' }] }),
    blk('bget', 'cta', 'accent', { title: 'Your plants are thirsty', text: 'It takes two minutes to add the first five.', buttons: [B('Get it on the App Store', U('app-store')), B('Get it on Google Play', U('google-play'))] }),
    foot('© Pocket Plant', [B('Privacy', U('privacy')), B('Write to us', M('hello@example.com'))]),
  ] }],
});

add('saas', 'Product page', 'For a web product with plans: the real screen up front, what it does in uneven tiles, what it does not do yet, prices.', 'Projects', 'app', ['startup', 'saas', 'product', 'software', 'pricing', 'landing page', 'app'], {
  name: 'Ledgerly', seo: { description: 'Ledgerly turns the receipts in your inbox and camera roll into a tidy sheet your accountant will actually accept.' },
  theme: theme(K('#FFFFFF', '#101828', '#586273', '#F4F6FA', '#E1E5EE', '#2F5BFF'), 'Space Grotesk', 'Inter', 12),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'center', { eyebrow: 'For freelancers and shops of one', title: 'Your receipts, already sorted', text: 'Ledgerly reads the receipts in your inbox and camera roll and turns them into one tidy sheet your accountant will accept.', img: I('dashboard'), alt: 'Ledgerly showing this quarter\'s spending as a chart and a list of receipts', shape: '', buttons: [B('Try it with your inbox', U('start')), B('See the prices', SEC('pricing'))] }),
    blk('bwhat', 'features', 'bento', { title: 'What it does', items: [{ title: 'Finds receipts on its own', text: 'Forward nothing. It looks for receipts and invoices in the inbox you connect, and only those.', icon: 'inbox' }, { title: 'Reads photos', text: 'Crumpled, sideways, in Portuguese.', icon: 'camera' }, { title: 'Fills in the boring columns', text: 'Date, seller, amount, tax and category.', icon: 'chart-bar' }, { title: 'Exports the way your accountant wants', text: 'CSV, a spreadsheet or a PDF with every receipt attached, by quarter or by year.', icon: 'download' }] }),
    blk('bnot', 'text', 'highlight', { title: 'What it does not do yet', text: 'It does not file your taxes, send invoices or connect to your bank. If you need those today, it is not the right tool. We would rather you knew now.' }),
    blk('bprice', 'pricing', 'cards', { title: 'Prices', note: 'No card needed for the free plan. Cancel from the settings page, no email required.', plans: [{ name: 'Shoebox', price: '$0', per: '', features: ['30 receipts a month', 'CSV export', 'One inbox'], button: B('Start free', U('start')) }, { name: 'Solo', price: '$9', per: '/ month', hot: true, tag: 'Most people', features: ['Unlimited receipts', 'Spreadsheet and PDF export', 'Three inboxes', 'Photo receipts'], button: B('Choose Solo', U('start')) }, { name: 'Studio', price: '$24', per: '/ month', features: ['Everything in Solo', 'Five people', 'A login for your accountant'], button: B('Choose Studio', U('start')) }] }),
    blk('bfaq', 'faq', 'list', { title: 'Questions', items: [{ q: 'Can you read my other email?', a: 'No. Ledgerly asks only for messages that look like receipts, and you can see the exact search it runs.' }, { q: 'What happens to my receipts if I leave?', a: 'Export everything in one click, then delete the account. We remove the copies within 30 days.' }, { q: 'Which countries does it work in?', a: 'Receipts in English, Spanish, Portuguese, French and German. Tax columns for the US, UK, Canada and the EU.' }] }),
    foot('© Ledgerly', [B('Changelog', U('changelog')), B('Privacy', U('privacy')), B('hello@example.com', M('hello@example.com'))]),
  ] }],
});

add('gamepage', 'Indie game page', 'For a game: the key art edge to edge with the title on it, the facts press ask for, screenshots and a devlog.', 'Projects', 'app', ['game', 'indie', 'steam', 'itch', 'wishlist', 'press kit', 'devlog', 'pixel'], {
  name: 'Lantern Run', seo: { description: 'Lantern Run is a tiny platformer about carrying a light through a cave that rearranges every time the flame goes out.' },
  theme: theme(K('#10142A', '#F2F0E6', '#A5AAC6', '#1A2040', '#2D3462', '#FFC857'), 'Silkscreen', 'Inter', 0, { dark: true, dw: true }),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'full', { eyebrow: 'Out this spring on PC and Switch', title: 'Lantern Run', text: 'Carry a light through a cave that rearranges itself every time the flame goes out.', img: I('lantern'), alt: 'Key art: a small figure with a lantern on blocky hills under a pixel moon', shape: '', buttons: [B('Wishlist on Steam', U('steam')), B('Play the demo', U('demo'))] }),
    blk('bfacts', 'stats', 'bar', { title: '', items: [{ value: '4 hrs', label: 'to finish the story' }, { value: '1-2', label: 'players, same sofa' }, { value: '$12', label: 'at launch' }, { value: '2', label: 'people made it' }] }),
    blk('bshots', 'gallery', 'masonry', { title: 'Screenshots', items: [{ img: I('lantern'), alt: 'The first cave, with the lantern lit', caption: 'The Low Caves' }, { img: I('city'), alt: 'A sunken city at night', caption: 'The Drowned Quarter' }, { img: I('mountains'), alt: 'The surface, above the cave mouth', caption: 'The way out' }] }),
    blk('bpress', 'features', 'list', { title: 'For press', items: [{ title: 'Developer', text: 'Two Moths, a two-person studio in Leeds.' }, { title: 'Release', text: 'Spring, on Steam and Nintendo Switch. Mac a little later.' }, { title: 'Languages', text: 'English, French, German, Japanese, Brazilian Portuguese.' }, { title: 'Keys', text: 'Write to press@example.com and say where you publish.' }] }),
    blk('bdev', 'list', 'rows', { title: 'Devlog', items: [{ title: 'The cave that rebuilds itself', meta: '3 March', text: 'How we shuffle rooms without making a dead end.', link: U('devlog/caves') }, { title: 'Co-op, and why one lantern is enough', meta: '10 February', text: 'Two players, one light, a lot of shouting.', link: U('devlog/coop') }, { title: 'We cut the boss', meta: '21 January', text: 'It was not fun. The game is better for it.', link: U('devlog/boss') }] }),
    blk('bwish', 'cta', 'accent', { title: 'Keep the flame lit', text: 'Wishlists tell the store the game exists. It is the kindest free thing you can do.', buttons: [B('Wishlist on Steam', U('steam'))] }),
    foot('© Two Moths', [B('Press kit', U('press')), B('Discord', U('discord'))]),
  ] }],
});

add('comingsoon', 'Coming soon', 'For something not open yet: one card that says what is coming and when, and a way to hear about it.', 'Projects', 'app', ['coming soon', 'waitlist', 'launch', 'pre-launch', 'under construction', 'sign up'], {
  name: 'Okra Studio', seo: { description: 'Okra Studio is a small type foundry opening in the spring. Three typefaces, drawn slowly. Leave your email to hear when.' },
  theme: theme(K('#F2EEF8', '#231B36', '#5D5473', '#FFFFFF', '#D8CFEA', '#6B45C4'), 'Fraunces', 'Inter', 14),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'card', { eyebrow: 'Opening 2 May', title: 'Okra Studio', text: 'A small type foundry. Three typefaces, drawn slowly, licensed simply. The doors open in the spring.', img: '', alt: '', shape: '', buttons: [B('Tell me when it opens', SEC('newsletter'))] }),
    blk('bwhat', 'features', 'ticks', { title: 'What is coming', items: [{ title: 'Okra Text', text: 'A reading face in eight weights, with real italics.' }, { title: 'Okra Mono', text: 'For code and tables. Friendly zeros.' }, { title: 'Gumbo', text: 'A loud display face for posters and jam jars.' }, { title: 'One licence', text: 'Web, print and apps for one price. No pageview counting.' }] }),
    blk('bnews', 'newsletter', 'card', { title: 'One email, on opening day', text: 'We will write once, on 2 May, with a discount for the first week. Then never again unless you ask.', action: '', button: 'Tell me' }),
    foot('Okra Studio, Lisbon', [B('Instagram', U('instagram'))], 'minimal'),
  ] }],
});

add('docs', 'Docs or handbook', 'For instructions people come back to: a guide, a handbook, a manual. The contents stay down the side; pages for each part.', 'Projects', 'app', ['docs', 'documentation', 'guide', 'handbook', 'manual', 'wiki', 'help', 'knowledge base'], {
  name: 'Paperboat', nav: 'side', seo: { description: 'The Paperboat handbook: turn a folder of text files into a website. Install it, write a page, publish.' },
  theme: theme(K('#FBFBF8', '#1A1D1F', '#596066', '#F0F0EA', '#DCDCD3', '#0B6E99'), 'Space Grotesk', 'Inter', 6),
  pages: [
    { title: 'Start here', blocks: [
      blk('dintro', 'text', 'plain', { h1: true, title: 'Start here', text: 'Paperboat turns a folder of text files into a website. This handbook gets you from nothing to a published page in about ten minutes, then explains each part properly.' }),
      blk('dsteps', 'steps', 'stack', { title: 'Your first site', items: [{ title: 'Install it', text: 'Download Paperboat for your computer and open it once. There is nothing to configure.' }, { title: 'Make a folder', text: 'Any folder. Put a file called index.txt in it and write a sentence.' }, { title: 'Press Build', text: 'Paperboat makes a site folder beside yours. Open index.html to see it.' }, { title: 'Publish', text: 'Drag the site folder to any web host. The Publishing page lists five free ones.' }] }),
      blk('dkeys', 'features', 'list', { title: 'Words used in this handbook', items: [{ title: 'Page', text: 'One text file. Its name becomes its address.' }, { title: 'Layout', text: 'The frame around every page: the menu, the footer, the fonts.' }, { title: 'Build', text: 'Turning your folder into the finished site. It takes a second or two.' }] }),
      foot('Paperboat handbook, version 2.4'),
    ] },
    { title: 'Writing pages', blocks: [
      blk('wintro', 'text', 'plain', { h1: true, title: 'Writing pages', text: 'A page is a text file. The first line is its title. Leave an empty line between paragraphs.\n\n## Headings and lists\n\nStart a line with ## for a heading and with - for a list item.\n\n- Two stars around words make them **bold**\n- One star makes them *slanted*\n\n## Pictures\n\nPut the picture in the same folder and write its file name on a line of its own.' }),
      blk('wfaq', 'faq', 'list', { title: 'Things people trip over', items: [{ q: 'My page has no title.', a: 'The first line of the file is the title. If the file starts with an empty line, there is none.' }, { q: 'A picture does not show.', a: 'Check the file name matches exactly, capitals included. photo.JPG and photo.jpg are different files.' }, { q: 'Can I write in Markdown?', a: 'Yes. Name the file .md instead of .txt and all of Markdown works.' }] }),
      foot('Paperboat handbook, version 2.4'),
    ] },
    { title: 'Publishing', blocks: [
      blk('pintro', 'text', 'plain', { h1: true, title: 'Publishing', text: 'The site folder is plain files. Anything that can serve files can host it, and most places do it for free.' }),
      blk('phosts', 'list', 'rows', { title: 'Places that host it free', items: [{ title: 'GitHub Pages', meta: 'Free', text: 'Good if the folder is already on GitHub.', link: U('hosts/github-pages') }, { title: 'Netlify', meta: 'Free', text: 'Drag the folder onto their page. Done.', link: U('hosts/netlify') }, { title: 'Cloudflare Pages', meta: 'Free', text: 'Fast everywhere, a little more setup.', link: U('hosts/cloudflare') }, { title: 'Your own computer', meta: 'Free', text: 'For a home network or a classroom.', link: U('hosts/local') }] }),
      foot('Paperboat handbook, version 2.4'),
    ] },
  ],
});

// ---------------------------------------------------------------- business and local
add('service', 'Local service', 'For a trade that comes to you: plumber, electrician, cleaner, gardener. The phone number first, prices in a table, where you work.', 'Business', 'business', ['plumber', 'electrician', 'cleaner', 'gardener', 'handyman', 'local', 'service', 'trade', 'repair', 'quote'], {
  name: 'Harlow Plumbing', seo: { description: 'Harlow Plumbing: a family plumber in East Bristol since 1998. Same-day call-outs, fixed prices, no call-out fee.' },
  theme: theme(K('#FFFFFF', '#0F2233', '#4F5F6E', '#F1F5F9', '#D6E0EA', '#0B63CE'), 'Inter', 'Inter', 6),
  pages: [{ title: 'Home', blocks: [
    blk('bbar', 'banner', 'bar', { text: 'Burst pipe? We answer the phone until 10pm.', button: B('Call 0117 496 0123', { kind: 'url', to: 'tel:+441174960123' }) }),
    blk('bhero', 'hero', 'split', { eyebrow: 'East Bristol, since 1998', title: 'A plumber who turns up when they said', text: 'Leaks, boilers, bathrooms and blocked drains. Fixed prices agreed before we start, and we tidy up after.', img: I('tools'), alt: 'The Harlow Plumbing van parked outside a house', shape: '', buttons: [B('Call 0117 496 0123', { kind: 'url', to: 'tel:+441174960123' }), B('See the prices', SEC('pricing'))] }),
    blk('bwhy', 'features', 'ticks', { title: 'What you can count on', items: [{ title: 'No call-out fee', text: 'You pay for the job, not for the drive.' }, { title: 'A price before we start', text: 'Written down. It does not grow.' }, { title: 'Gas Safe registered', text: 'Number 512345, check it on the register.' }, { title: 'Guaranteed for a year', text: 'If it leaks again, we come back free.' }] }),
    blk('bprice', 'pricing', 'table', { title: 'Common jobs', note: 'Parts included. Anything unusual, we quote on the phone.', plans: [{ name: 'Fix a leaking tap', price: '£65', per: '', features: ['About 40 minutes'] }, { name: 'Unblock a sink or toilet', price: '£80', per: '', features: ['About an hour'] }, { name: 'Boiler service', price: '£90', per: '', features: ['With a written report'] }, { name: 'Fit a new radiator', price: '£180', per: '', features: ['Half a day'] }] }),
    blk('bsay', 'testimonials', 'quotes', { title: '', items: [{ quote: 'Came at 7am, fixed it by 8, charged what he said on the phone.', name: 'Priya S.', role: 'Easton' }] }),
    blk('bwhere', 'info', 'columns', { title: 'Where and when', items: [{ label: 'We cover', text: 'Easton, St George, Fishponds,\nRedfield and Kingswood' }, { label: 'Hours', text: 'Mon to Sat: 7am to 6pm\nEmergencies until 10pm' }, { label: 'Phone', text: '0117 496 0123' }], button: B('Write to us instead', SEC('contact')) }),
    blk('bcontact', 'contact', 'form', { title: 'Ask for a quote', text: 'Say what is wrong and where you are. We answer the same day.', email: 'jobs@example.com', action: '', button: 'Send' }),
    foot('© Harlow Plumbing Ltd, 14 Bell Hill Road, Bristol'),
  ] }],
});

add('cafe', 'Café or restaurant', 'For a place people walk into: a picture across the top, the menu in two columns, a map beside the hours.', 'Food & drink', 'business', ['cafe', 'café', 'coffee', 'restaurant', 'bakery', 'bar', 'food', 'menu', 'hours', 'map'], {
  name: 'Marigold', seo: { description: 'Marigold is a corner café in Leith: coffee roasted on the street, bread from next door, open every day from seven.' },
  theme: theme(K('#F1F0E4', '#1E2A22', '#55625A', '#FBFAF3', '#CDD2C2', '#9A5A12'), 'Instrument Serif', 'Inter', 2, { dw: true }),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'cover', { eyebrow: '', title: 'Coffee, bread, and a table by the window', text: 'A corner café in Leith. Open every day from seven. No laptops at the weekend, sorry.', img: I('cafe'), alt: 'A cup of coffee steaming on a table at Marigold', shape: '', buttons: [B('See the menu', SEC('bmenu')), B('Find us', SEC('bvisit'))] }),
    blk('bmenu', 'list', 'menu', { title: 'The menu', items: [{ title: 'Flat white', meta: '3.40' }, { title: 'Filter, bottomless', meta: '3.00' }, { title: 'Pot of tea', meta: '2.80' }, { title: 'Hot chocolate, real', meta: '3.80' }, { title: 'Cardamom bun', meta: '3.20' }, { title: 'Toast, butter, marmalade', meta: '3.50' }, { title: 'Eggs on sourdough', meta: '7.50' }, { title: 'Soup and bread', meta: '6.50' }, { title: 'Cheese toastie with pickle', meta: '7.00' }, { title: 'Cake of the day', meta: '3.90' }] }, { w: 'wide' }),
    blk('bstory', 'text', 'two', { title: 'Who is behind the counter', text: 'Isla and Tomasz opened Marigold in 2019 in what used to be a key cutter. The beans come from the roaster four doors down, the bread from the bakery next door. We know most of you by your order.' }),
    blk('bvisit', 'info', 'map', { title: 'Find us', img: I('map'), alt: 'A map with a pin on the corner of Constitution Street', items: [{ label: 'Address', text: '41 Constitution Street\nLeith, Edinburgh' }, { label: 'Hours', text: 'Mon to Fri: 7 to 4\nSat and Sun: 8 to 5' }, { label: 'Phone', text: '0131 496 0142' }], button: B('Get directions', U('map')) }),
    foot('Marigold, Leith. Dogs welcome.', [B('Instagram', U('instagram'))]),
  ] }],
});

add('menu', 'Menu card', 'For a restaurant that only needs its menu online: courses and prices like a printed card, then hours and how to book.', 'Food & drink', 'business', ['menu', 'restaurant', 'prices', 'price list', 'dinner', 'bistro', 'takeaway', 'bar'], {
  name: 'Osteria Lupo', nav: 'centered', seo: { description: 'The dinner menu at Osteria Lupo, a twenty-seat Italian kitchen in Ancoats. Open Wednesday to Sunday from six.' },
  theme: theme(K('#1F1513', '#F5EBDD', '#C3AE9A', '#2B1E1B', '#4A352E', '#E3A857'), 'DM Serif Display', 'Inter', 0, { dark: true, dw: true }),
  pages: [{ title: 'Home', blocks: [
    blk('bintro', 'text', 'plain', { h1: true, title: 'Dinner at Osteria Lupo', text: 'Twenty seats, one small kitchen, a menu that changes on Wednesdays. This is this week\'s.' }, { al: 'center', w: 'narrow' }),
    blk('bfirst', 'list', 'menu', { title: 'To start', items: [{ title: 'Bread, oil, salt', meta: '4' }, { title: 'Burrata, blood orange, fennel', meta: '11' }, { title: 'Fried artichokes, lemon', meta: '9' }, { title: 'Cured beef, rocket, parmesan', meta: '12' }] }, { w: 'narrow' }),
    blk('bpasta', 'list', 'menu', { title: 'Pasta, made this morning', items: [{ title: 'Cacio e pepe', meta: '13' }, { title: 'Pappardelle, slow beef shin', meta: '17' }, { title: 'Ravioli, squash, brown butter', meta: '15' }, { title: 'Linguine, clams, chilli', meta: '18' }] }, { w: 'narrow' }),
    blk('bsweet', 'list', 'menu', { title: 'After', items: [{ title: 'Tiramisu', meta: '8' }, { title: 'Olive oil cake, mascarpone', meta: '7' }, { title: 'Affogato', meta: '6' }, { title: 'Three cheeses, honey', meta: '11' }] }, { w: 'narrow' }),
    blk('bbook', 'info', 'card', { title: 'Hours and booking', items: [{ label: 'Open', text: 'Wed to Sat: 6 to 10.30\nSunday lunch: 12 to 4' }, { label: 'Where', text: '8 Cotton Yard\nAncoats, Manchester' }, { label: 'Tables', text: '0161 496 0177\nWe hold half for walk-ins' }], button: B('Book by email', M('tavolo@example.com')) }),
    foot('Osteria Lupo. Tell us about allergies when you book.', [], 'minimal'),
  ] }],
});

add('merch', 'Store front', 'For selling a handful of things: the products first with their prices, how delivery works, and one honest way to order.', 'Shop', 'business', ['shop', 'store', 'merch', 'products', 'sell', 'ecommerce', 'prints', 't-shirts', 'handmade'], {
  name: 'Ember Goods', seo: { description: 'Ember Goods prints shirts, bags, mugs and posters by hand in Glasgow, in runs of fifty. When they are gone, they are gone.' },
  theme: theme(K('#F6F5F2', '#111111', '#55524D', '#FFFFFF', '#111111', '#D93A1E'), 'Space Grotesk', 'Inter', 0),
  pages: [{ title: 'Home', blocks: [
    blk('bbar', 'banner', 'ribbon', { text: 'Free UK delivery over £40. Winter run: 50 of each.', button: B('How to order', SEC('border')) }),
    blk('bshop', 'gallery', 'shop', { h1: true, title: 'Printed by hand, fifty at a time', text: 'Four things this season. When a run sells out it does not come back.', items: [{ img: I('tee'), alt: 'A white T-shirt with a red sun printed on the chest', caption: 'Sun shirt, heavy cotton', price: '£28' }, { img: I('tote'), alt: 'A canvas tote bag with a square print', caption: 'Market tote', price: '£16' }, { img: I('mug'), alt: 'A red enamel mug on a shelf', caption: 'Enamel camp mug', price: '£14' }, { img: I('print'), alt: 'A framed print of a sun over hills', caption: 'Hills print, A3', price: '£32' }] }, { w: 'wide' }),
    blk('bhow', 'features', 'list', { title: 'Good to know', items: [{ title: 'Delivery', text: 'Posted on Tuesdays and Fridays. UK 2 to 3 days, Europe about a week.' }, { title: 'Sizes', text: 'Shirts run large. If you are between sizes, go down.' }, { title: 'Returns', text: '30 days, unworn. We pay the postage if we got it wrong.' }] }),
    blk('babout', 'text', 'two', { title: 'Two people and a press', text: 'Ember Goods is Kit and Rowan in a railway arch in Glasgow. We draw, mix the ink and pull every print ourselves, which is why there are only fifty.' }),
    blk('border', 'cta', 'split', { title: 'To order, write to us', text: 'Say what you want and where it is going. We send a payment link and post it on the next Tuesday or Friday.', buttons: [B('Order by email', M('orders@example.com'))] }, { bg: 'ink' }),
    foot('© Ember Goods, Arch 12, Glasgow', [B('Instagram', U('instagram')), B('Stockists', U('stockists'))]),
  ] }],
});

add('nonprofit', 'Nonprofit or cause', 'For a charity or a campaign: the mission in very large type, three real numbers, what the money does, how to help.', 'Community', 'business', ['nonprofit', 'charity', 'donate', 'cause', 'campaign', 'volunteer', 'fundraiser', 'community'], {
  name: 'Riverbend Garden', seo: { description: 'Riverbend Garden grows vegetables on a former car park in Hull and gives every one of them away. Come dig, or chip in.' },
  theme: theme(K('#FFFDF5', '#1C2A1E', '#536157', '#F2F0E2', '#D7D6C3', '#2B6A3C'), 'Anton', 'Inter', 4),
  css: 'h1,h2{text-transform:uppercase;letter-spacing:.01em}',
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'minimal', { eyebrow: '', title: 'We turned a car park into four tonnes of free vegetables', text: 'Riverbend is a volunteer garden in east Hull. Everything we grow goes to neighbours and the food bank on Holderness Road.', img: '', alt: '', shape: '', buttons: [B('Give £5 a month', U('donate')), B('Come and dig', SEC('bhelp'))] }, { sz: 'l' }),
    blk('bnum', 'stats', 'big', { title: '', items: [{ value: '4.1 t', label: 'of food given away last year' }, { value: '212', label: 'neighbours who dug, sowed or carried' }, { value: '£0', label: 'charged for a single carrot' }] }, { bg: 'accent' }),
    blk('bwork', 'features', 'alternating', { title: 'Where the money goes', items: [{ title: 'Seeds, compost, water', text: '£5 buys the seed for a 3-metre bed of beans. £40 fills a bed with compost for the year.', img: I('garden'), alt: 'Raised beds with young bean plants' }, { title: 'Saturday cooking club', text: 'Thirty kids a week learn to cook what they picked. £12 covers one child for a month.', img: I('people'), alt: 'Two volunteers talking at the garden' }, { title: 'The tool shed', text: 'Spades wear out. So do wheelbarrow tyres. We fix what we can and replace what we cannot.', img: I('hills'), alt: 'The garden on a sunny morning' }] }),
    blk('bhelp', 'steps', 'row', { title: 'Three ways to help', items: [{ title: 'Dig', text: 'Saturdays from 10. Gloves and tea provided, no experience needed.' }, { title: 'Give', text: '£5 a month keeps one bed growing all year.' }, { title: 'Lend', text: 'A van for an afternoon, or an hour of bookkeeping.' }] }),
    blk('bgive', 'cta', 'split', { title: 'One bed costs £60 a year', text: 'Twelve people giving £5 a month pay for it. Be one of them.', buttons: [B('Give £5 a month', U('donate')), B('Give once', U('donate-once'))] }),
    blk('bcontact', 'contact', 'simple', { title: 'Find us', text: 'Behind the old Co-op on Marfleet Lane, Hull. The gate is open Wednesdays and Saturdays, 10 to 3.', email: 'hello@example.com', action: '', button: 'Write to us' }),
    foot('Riverbend Garden is a registered charity, number 1234567'),
  ] }],
});

add('club', 'Club or group', 'For a running club, a choir, a book group: when you next meet, set out like a timetable, and how a newcomer joins.', 'Community', 'business', ['club', 'group', 'community', 'meetup', 'society', 'team', 'choir', 'running', 'cycling', 'join'], {
  name: 'Low Gear', seo: { description: 'Low Gear is a no-drop cycling club in Sheffield. Three rides a week, nobody left behind, cake at the end.' },
  theme: theme(K('#FFF4E8', '#24163A', '#5C4F6E', '#FFFFFF', '#24163A', '#D83A45'), 'Bricolage Grotesque', 'Inter', 18),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'split', { eyebrow: 'A cycling club in Sheffield', title: 'Nobody gets dropped', text: 'Three rides a week at a pace you can talk at. We wait at the top of every hill, and there is always cake.', img: I('bikes'), alt: 'Two bicycles on a road under the hills', shape: 'round', buttons: [B('Come on Sunday', SEC('brides')), B('How to join', SEC('bjoin'))] }),
    blk('brides', 'list', 'schedule', { title: 'This week\'s rides', items: [{ meta: 'Tue 6.30pm', title: 'Evening loop', text: '25 km, flat-ish. Meet at Endcliffe Park café. Lights needed.' }, { meta: 'Thu 7am', title: 'Before-work hills', text: '18 km, three climbs, back by 8.15.' }, { meta: 'Sun 9am', title: 'The long one', text: '60 km to Hathersage and back, with a café stop. Beginners ride with Sam at the back.' }] }),
    blk('bjoin', 'steps', 'row', { title: 'How to join', items: [{ title: 'Turn up', text: 'Your first three rides are free. Any bike that works is fine.' }, { title: 'Say hello to Sam', text: 'Red jacket, usually late. Sam pairs you with a ride buddy.' }, { title: 'Pay your subs', text: '£20 a year. It covers insurance and the Christmas curry.' }] }),
    blk('bfaq', 'faq', 'columns', { title: 'Before your first ride', items: [{ q: 'How fast do you go?', a: 'About 20 km an hour on the flat. Slower uphill, and we regroup at every top.' }, { q: 'Do I need a road bike?', a: 'No. Hybrids and gravel bikes come every week. E-bikes are welcome.' }, { q: 'What if it rains?', a: 'We ride. If it is icy we go to the café and call it planning.' }, { q: 'Can under-18s come?', a: 'From 14 with an adult, on the Sunday ride.' }] }),
    blk('bcontact', 'contact', 'simple', { title: 'Questions?', text: 'Write to Sam, the club secretary. Replies come in the evening.', email: 'sam@example.com', action: '', button: 'Write to Sam' }),
    foot('Low Gear Cycling Club, Sheffield', [B('Strava', U('strava')), B('Instagram', U('instagram'))]),
  ] }],
});

// ---------------------------------------------------------------- portfolio and personal
add('portfolio', 'Portfolio', 'For designers, illustrators and studios: one sentence about what you do, then each project with its picture and its story.', 'Portfolio', 'portfolio', ['portfolio', 'designer', 'illustrator', 'studio', 'agency', 'case study', 'work', 'freelance', 'creative'], {
  name: 'Ines Castellano', seo: { description: 'Ines Castellano designs identities and packaging for small food and drink makers. Selected work, and how to hire her.' },
  theme: theme(K('#FAFAF6', '#171717', '#5B5B55', '#EFEEE7', '#DAD8CD', '#1F4BD8'), 'Instrument Serif', 'Inter', 0, { dw: true, space: 'roomy' }),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'minimal', { eyebrow: '', title: 'I design the labels, boxes and signs of small food makers, so the outside is as good as what is inside.', text: 'Ines Castellano, independent designer in Porto. Eleven years, about ninety jars.', img: '', alt: '', shape: '', buttons: [B('See the work', SEC('bwork')), B('Hire me', SEC('bhire'))] }),
    blk('bwork', 'features', 'alternating', { title: 'Selected work', items: [{ title: 'Casa Brava hot sauce', text: 'A name, a label and a shipping box for a two-person sauce company. Sales tripled in the first season, mostly because people could finally find it on the shelf.', img: I('still'), alt: 'The Casa Brava bottle beside two pieces of fruit' }, { title: 'Mar Alto tinned fish', text: 'Twelve tins, twelve illustrations of the boats that caught them. Printed in two colours to keep the cost of each tin under a cent.', img: I('print'), alt: 'A framed print from the Mar Alto series' }, { title: 'Padaria Sol', text: 'A sign, a paper bag and a rubber stamp for a neighbourhood bakery. The stamp does most of the work.', img: I('shop'), alt: 'The shop front of Padaria Sol with its striped awning' }] }),
    blk('bsay', 'testimonials', 'spotlight', { title: '', items: [{ quote: 'She asked what the sauce tasted like before she asked about the logo.', name: 'Rui Brava', role: 'Casa Brava' }] }),
    blk('bhire', 'cta', 'split', { title: 'Taking two projects this autumn', text: 'A label from €1,800, a full identity from €4,500. Write a few lines about what you make.', buttons: [B('ines@example.com', M('ines@example.com'))] }),
    foot('© Ines Castellano, Porto', [B('Instagram', U('instagram')), B('Are.na', U('arena'))]),
  ] }],
});

add('photography', 'Photography', 'For photographers: the pictures fill the first screen in a mosaic, the words wait underneath.', 'Portfolio', 'portfolio', ['photography', 'photographer', 'photos', 'gallery', 'wedding photographer', 'pictures', 'images'], {
  name: 'Tomas Reyes', nav: 'centered', seo: { description: 'Tomas Reyes photographs landscapes and the people who work in them. Prints, commissions and a small workshop each June.' },
  theme: theme(K('#0E0E0E', '#F2F2F2', '#A6A6A6', '#181818', '#2C2C2C', '#F2C14E'), 'Inter', 'Inter', 0, { dark: true }),
  pages: [{ title: 'Home', blocks: [
    blk('bwork', 'gallery', 'mosaic', { h1: true, title: 'Land, and the people who work it', items: [{ img: I('mountains'), alt: 'Mountains above a still lake at dawn', caption: 'Picos, 2025' }, { img: I('garden'), alt: 'Young plants in raised beds', caption: '' }, { img: I('city'), alt: 'A city skyline at night', caption: '' }, { img: I('hills'), alt: 'Sun over rolling hills', caption: 'Alentejo' }, { img: I('bikes'), alt: 'Two bicycles on an empty road', caption: '' }, { img: I('still'), alt: 'A vase with stems beside fruit', caption: '' }] }, { w: 'wide', pad: 's' }),
    blk('babout', 'text', 'two', { title: 'About', text: 'I spend about half the year outside with a camera and the other half printing what I found. Most of my work is for magazines and for the farms, vineyards and salt works in the pictures.' }),
    blk('bwhat', 'list', 'rows', { title: 'What you can ask for', items: [{ title: 'Prints', meta: 'from €90', text: 'Any picture here, printed by me on cotton paper, signed.', link: { kind: '', to: '' } }, { title: 'Commissions', meta: 'from €1,200 a day', text: 'Editorial, harvests, portraits at work.', link: { kind: '', to: '' } }, { title: 'June workshop', meta: '€480', text: 'Five days in the Picos with eight people. Bring any camera.', link: { kind: '', to: '' } }] }),
    blk('bcontact', 'contact', 'simple', { title: 'Write to me', text: 'Say which picture, or what you have in mind.', email: 'tomas@example.com', action: '', button: 'Write' }),
    foot('© Tomas Reyes', [B('Instagram', U('instagram'))], 'minimal'),
  ] }],
});

add('resume', 'Resume', 'For job hunting: your name beside a short profile, your experience as a timeline, your skills as a plain list. Prints on one sheet.', 'Personal', 'portfolio', ['resume', 'cv', 'curriculum vitae', 'job', 'personal', 'about me', 'experience', 'career'], {
  name: 'Dana Okafor', seo: { description: 'Dana Okafor, product designer. Nine years making software for clinics and pharmacies easier to use.' },
  theme: theme(K('#FFFFFF', '#1B1F23', '#59616A', '#F5F4EF', '#E1DFD6', '#9A3412'), 'Fraunces', 'Inter', 4),
  pages: [{ title: 'Home', blocks: [
    blk('bprofile', 'text', 'two', { h1: true, title: 'Dana Okafor', text: 'Product designer. Nine years making clinic and pharmacy software less tiring to use. I work best close to the people using the thing: I have sat in on more than 200 pharmacy shifts. Looking for a senior or lead role, in Manchester or remote.' }),
    blk('bwork', 'timeline', 'line', { title: 'Experience', items: [{ when: '2021 to now', title: 'Lead designer, Wellbeck Health', text: 'Led the redesign of the prescribing screen used by 4,000 pharmacists. Cut the average script from 11 clicks to 4.' }, { when: '2018 to 2021', title: 'Senior designer, Tandem Clinics', text: 'Designed the booking system for 60 clinics, and the design system the other three designers built on.' }, { when: '2015 to 2018', title: 'Designer, Northfold Studio', text: 'Agency work for the NHS, two banks and a zoo.' }] }),
    blk('bskills', 'features', 'list', { title: 'Skills', items: [{ title: 'Research', text: 'Shadowing, interviews, usability tests I run myself.' }, { title: 'Design', text: 'Flows, prototypes, design systems. Figma, and paper first.' }, { title: 'Working with engineers', text: 'I read React well enough to review the pull request.' }, { title: 'Accessibility', text: 'WCAG 2.2 AA as a starting point, not a finish line.' }] }),
    blk('bedu', 'list', 'rows', { title: 'Education', items: [{ title: 'MA Interaction Design', meta: '2015', text: 'Manchester School of Art', link: { kind: '', to: '' } }, { title: 'BSc Psychology', meta: '2013', text: 'University of Leeds', link: { kind: '', to: '' } }] }),
    blk('bcontact', 'contact', 'simple', { title: 'Contact', text: 'References and a longer portfolio on request.', email: 'dana@example.com', action: '', button: 'Email me' }),
    foot('Dana Okafor, Manchester', [B('LinkedIn', U('linkedin'))]),
  ] }],
});

add('letter', 'Personal letter', 'For a personal page, an about page or an open letter: one quiet column of writing with a signature, and nothing else in the way.', 'Personal', 'portfolio', ['personal', 'about me', 'letter', 'bio', 'writer', 'one page', 'simple', 'now page'], {
  name: 'Noor Haddad', seo: { description: 'A short letter from Noor Haddad: who I am, what I am working on this year, and how to reach me.' },
  theme: theme(K('#F0F3F5', '#1C2430', '#55606D', '#FFFFFF', '#D3DAE1', '#B0362E'), 'Fraunces', 'System serif', 2),
  pages: [{ title: 'Home', blocks: [
    blk('bletter', 'text', 'letter', { h1: true, title: 'Hello, I\'m Noor.', text: 'I translate novels from Arabic into English, and when the novels are slow I teach. I live in Marseille with a cat who disapproves of both jobs.\n\nThis year I am working on a long book about a family of clockmakers in Aleppo. It is the hardest thing I have tried: every chapter is told by a different clock. It should be out next autumn.\n\nI answer every letter, though not quickly. If you are a publisher, a student, or someone who has found a mistake in one of my translations, I would like to hear from you, especially the last one.', sign: 'Noor' }),
    blk('bmore', 'list', 'rows', { title: 'Elsewhere', items: [{ title: 'The books I have translated', meta: '14 so far', text: '', link: U('books') }, { title: 'Notes on translating', meta: 'monthly', text: '', link: U('notes') }, { title: 'Write to me', meta: 'noor@example.com', text: '', link: M('noor@example.com') }] }, { w: 'narrow' }),
    foot('Marseille, this winter', [], 'minimal'),
  ] }],
});

add('band', 'Band or musician', 'For a band, a DJ, a choir on tour: the name across a stage photo like a gig poster, the dates as a list, the records.', 'Music', 'portfolio', ['band', 'musician', 'music', 'tour', 'gigs', 'dj', 'singer', 'album', 'concert'], {
  name: 'Salt Marsh', seo: { description: 'Salt Marsh are a four-piece from Cardiff. Autumn tour dates, the new record Low Water, and booking.' },
  theme: theme(K('#F1E8D6', '#17130F', '#584E43', '#FAF4E8', '#17130F', '#C92F1C'), 'Anton', 'Inter', 0),
  css: 'h1,h2,h3{text-transform:uppercase;letter-spacing:.01em}.hero-full h1{font-size:clamp(4rem,15vw,11rem);line-height:.9;max-width:none}',
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'full', { eyebrow: 'Low Water, the new record, out now', title: 'Salt Marsh', text: 'Four people from Cardiff playing loud songs about the sea. On tour all autumn.', img: I('stage'), alt: 'A microphone on a stage under a single light', shape: '', buttons: [B('Tour dates', SEC('btour')), B('Listen', U('listen'))] }),
    blk('btour', 'list', 'schedule', { title: 'On tour', items: [{ meta: '3 Oct', title: 'Cardiff, Clwb Ifor Bach', text: 'Home show. With Gull Colony.' }, { meta: '9 Oct', title: 'Bristol, The Louisiana', text: 'Doors 7.30.' }, { meta: '10 Oct', title: 'London, The Lexington', text: 'Nearly sold out.' }, { meta: '17 Oct', title: 'Manchester, YES', text: 'In the basement.' }, { meta: '24 Oct', title: 'Glasgow, Mono', text: 'Last night of the tour.' }] }),
    blk('brec', 'gallery', 'grid', { title: 'Records', items: [{ img: I('cover'), alt: 'The cover of Low Water', caption: 'Low Water, 2026' }, { img: I('mountains'), alt: 'The cover of Spring Tide', caption: 'Spring Tide, 2024' }, { img: I('city'), alt: 'The cover of the Night Ferry EP', caption: 'Night Ferry EP, 2022' }] }),
    blk('bbook', 'cta', 'accent', { title: 'Book us', text: 'Festivals, support slots, your cousin\'s wedding if the cousin likes it loud.', buttons: [B('booking@example.com', M('booking@example.com'))] }),
    foot('© Salt Marsh', [B('Bandcamp', U('bandcamp')), B('Instagram', U('instagram'))]),
  ] }],
});

// ---------------------------------------------------------------- events and learning
add('wedding', 'Wedding or party', 'For a wedding, a big birthday, a reunion: an invitation card, the day as a timeline, travel notes and an RSVP form.', 'Events', 'event', ['wedding', 'rsvp', 'party', 'birthday', 'invitation', 'anniversary', 'reunion', 'event'], {
  name: 'Leila & Sam', seo: { description: 'Leila and Sam are getting married on Saturday 14 June at Hollin Barn. The day, how to get there, and where to RSVP.' },
  theme: theme(K('#EDF1E9', '#26302A', '#5A665E', '#FFFFFF', '#C9D2C6', '#7A5A2B'), 'DM Serif Display', 'Inter', 2, { dw: true }),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'card', { eyebrow: 'Saturday 14 June', title: 'Leila & Sam', text: 'are getting married at Hollin Barn, near Hebden Bridge, and would love you to be there.', img: '', alt: '', shape: '', buttons: [B('RSVP by 1 May', SEC('contact'))] }),
    blk('bday', 'timeline', 'line', { title: 'The day', items: [{ when: '1.30pm', title: 'Arrive', text: 'A drink in the orchard. Flat shoes, the grass is soft.' }, { when: '2pm', title: 'Ceremony', text: 'Under the big oak if it is dry, in the barn if it is Yorkshire.' }, { when: '4pm', title: 'Dinner', text: 'Long tables. Leila\'s mum is in charge of the rice.' }, { when: '7.30pm', title: 'Dancing', text: 'Sam\'s brother has a playlist and will not be stopped.' }, { when: 'Midnight', title: 'Carriages', text: 'Two minibuses back to Hebden Bridge.' }] }, { w: 'narrow' }),
    blk('btravel', 'info', 'columns', { title: 'Getting there and staying', items: [{ label: 'By train', text: 'Hebden Bridge station, then our\nminibus at 1pm and 1.15pm' }, { label: 'By car', text: 'Hollin Barn, HX7 8PL\nParking in the lower field' }, { label: 'Staying', text: 'Rooms held at the White Lion\nuntil 1 April: say our names' }] }),
    blk('bfaq', 'faq', 'list', { title: 'Things people ask', items: [{ q: 'Can I bring the children?', a: 'Yes, please do. There is a quiet room and a box of Lego.' }, { q: 'What should I wear?', a: 'Whatever you would wear to a nice dinner. Bring a jumper for the evening.' }, { q: 'Presents?', a: 'Truly, just come. If you insist, there is a honeymoon jar at the bar.' }] }, { w: 'narrow' }),
    blk('brsvp', 'contact', 'form', { title: 'RSVP', text: 'Tell us who is coming and anything you cannot eat. By 1 May, please.', email: 'rsvp@example.com', action: '', button: 'Send our reply', lMessage: 'Who is coming, and any food to avoid' }),
    foot('With love, L & S', [], 'minimal'),
  ] }],
});

add('conference', 'Conference or meetup', 'For a conference, a meetup, a festival day: the name huge, date and place under it, the programme by the hour, speakers, tickets.', 'Events', 'event', ['conference', 'meetup', 'summit', 'festival', 'event', 'speakers', 'schedule', 'tickets', 'agenda'], {
  name: 'Small Web Summit', seo: { description: 'Small Web Summit: one day in Rotterdam about websites made by one or two people. 9 October, 180 seats.' },
  theme: theme(K('#101B3B', '#F3F5FF', '#AAB4D8', '#18264F', '#2C3C6C', '#FF8A3D'), 'Space Grotesk', 'Inter', 8, { dark: true }),
  css: '.hero-minimal h1{font-size:clamp(3rem,11.5vw,9rem);letter-spacing:-.045em;line-height:.95}',
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'minimal', { eyebrow: '', title: 'Small Web Summit', text: 'One day about websites made by one or two people. Eight talks, a long lunch, no sponsors on stage.', img: '', alt: '', shape: '', buttons: [B('Get a ticket', SEC('pricing')), B('See the programme', SEC('bprog'))] }, { sz: 'l' }),
    blk('bfacts', 'stats', 'bar', { title: '', items: [{ value: '9 Oct', label: 'a Friday' }, { value: '1 day', label: 'in Rotterdam, at the Maassilo' }, { value: '180', label: 'seats, one room' }, { value: '€140', label: 'lunch included' }] }),
    blk('bprog', 'list', 'schedule', { title: 'Programme', items: [{ meta: '09.30', title: 'Doors and coffee', text: '' }, { meta: '10.00', title: 'A shop with no cart', text: 'Wen Li on selling 4,000 zines a year by email.' }, { meta: '10.45', title: 'Fifteen years on one server', text: 'Okke Bakker and the box under the stairs.' }, { meta: '11.30', title: 'Your site is a garden, not a product', text: 'Amara Diallo.' }, { meta: '12.30', title: 'A long lunch', text: 'Ninety minutes, on purpose.' }, { meta: '14.00', title: 'Show and tell', text: 'Five minutes each. Sign up on the day.' }, { meta: '16.30', title: 'Drinks on the quay', text: '' }] }),
    blk('bspeak', 'team', 'grid', { title: 'Speakers', items: [{ name: 'Wen Li', role: 'Zine maker, Taipei', img: I('portrait'), alt: 'Wen Li' }, { name: 'Okke Bakker', role: 'Runs one server, Delft', img: I('terminal'), alt: 'Okke Bakker\'s terminal' }, { name: 'Amara Diallo', role: 'Writer and gardener, Dakar', img: I('garden'), alt: 'Amara Diallo\'s garden' }] }),
    blk('btix', 'pricing', 'cards', { title: 'Tickets', note: 'Refunds until 1 September. After that you can give your ticket to a friend.', plans: [{ name: 'Standard', price: '€140', per: '', features: ['All talks', 'Lunch and coffee', 'Drinks after'], button: B('Buy a ticket', U('tickets')) }, { name: 'Student or between jobs', price: '€60', per: '', features: ['The same day', 'No proof asked'], button: B('Buy a ticket', U('tickets')) }] }),
    blk('bvenue', 'info', 'map', { title: 'The venue', img: I('map'), alt: 'A map with a pin on the Maassilo, by the river', items: [{ label: 'Where', text: 'Maassilo, Maashaven Zuidzijde 1\nRotterdam' }, { label: 'Getting there', text: 'Metro D or E to Maashaven,\nthen two minutes on foot' }], button: B('Open the map', U('map')) }),
    foot('Small Web Summit is run by four volunteers', [B('Code of conduct', U('conduct')), B('hello@example.com', M('hello@example.com'))]),
  ] }],
});

add('course', 'Class or course', 'For teaching something: a workshop, evening classes, an online course. The next start date in a card, week by week, the price.', 'Learning', 'event', ['course', 'class', 'workshop', 'lessons', 'teacher', 'tutor', 'school', 'learn', 'training'], {
  name: 'Sourdough at Home', seo: { description: 'Sourdough at Home: six Tuesday evenings in a real bakery in Hackney. Leave with a starter, a method and a loaf each week.' },
  theme: theme(K('#FFF8EC', '#2A2118', '#63584B', '#FFFFFF', '#E6D9C3', '#B4530A'), 'Outfit', 'Inter', 16),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'aside', { eyebrow: 'Six evenings in a real bakery', title: 'Learn to bake bread you would pay for', text: 'A small class for people who have killed at least one starter. You bake every week and take the loaf home.', img: '', alt: '', shape: '', asideTitle: 'Next course', aside: 'Starts Tuesday 13 January\n6.30 to 9pm, six weeks\nE5 Bakehouse, Hackney\n8 places, 3 left\n£240, flour included', buttons: [B('Book a place', SEC('pricing')), B('See the six weeks', SEC('bweeks'))] }),
    blk('bweeks', 'timeline', 'cards', { title: 'Week by week', items: [{ when: 'Week 1', title: 'Your starter', text: 'Make one, feed it, name it. Why the last one died.' }, { when: 'Week 2', title: 'A plain loaf', text: 'Mixing, folding, shaping. Your first bake.' }, { when: 'Week 3', title: 'Reading the dough', text: 'Too wet, too tight, too slow: fixing each.' }, { when: 'Week 4', title: 'Seeds and wholemeal', text: 'Heavier flours and how to keep them light.' }, { when: 'Week 5', title: 'Fitting it in a week', text: 'A timetable for people with jobs.' }, { when: 'Week 6', title: 'Your own loaf', text: 'Bake your recipe. We eat everyone\'s.' }] }),
    blk('bwho', 'text', 'two', { title: 'Who teaches it', text: 'Marta Kowalczyk has baked the morning shift here for eight years. She has taught this class 31 times and still gets excited about a good crumb.' }),
    blk('bprice', 'pricing', 'cards', { title: 'Book a place', note: 'A full refund until a week before. After that, a place on the next course.', plans: [{ name: 'The full course', price: '£240', per: 'six evenings', features: ['Flour, starter and a banneton to keep', 'A loaf to take home each week', 'Marta\'s phone number for emergencies'], button: B('Book by email', M('classes@example.com')) }, { name: 'Two friends', price: '£420', per: 'for both', features: ['Everything above, twice', 'A bench side by side'], button: B('Book by email', M('classes@example.com')) }] }),
    blk('bfaq', 'faq', 'list', { title: 'Questions', items: [{ q: 'I have never baked anything.', a: 'Good. You have no bad habits yet.' }, { q: 'What if I miss a week?', a: 'Come 30 minutes early the next week and Marta will catch you up.' }, { q: 'Is it suitable for coeliacs?', a: 'No, sorry. The room is full of wheat flour.' }] }),
    foot('Sourdough at Home, Hackney', [B('Instagram', U('instagram'))]),
  ] }],
});

// ---------------------------------------------------------------- writing
add('blog', 'Blog or magazine', 'For writing regularly: the newest piece large with its picture, the rest in a column beside it, and a way to subscribe.', 'Blog', 'blog', ['blog', 'magazine', 'newsletter', 'writing', 'articles', 'posts', 'journal', 'news'], {
  name: 'The Long Way Round', seo: { description: 'The Long Way Round: essays on slow travel by Hana Mori. Trains, ferries, walking, and why the detour is the trip.' },
  theme: theme(K('#FFFFFF', '#1A1A1A', '#5C5C5C', '#F6F4EE', '#E2DED3', '#B3261E'), 'Fraunces', 'Inter', 2),
  pages: [{ title: 'Home', blocks: [
    blk('bposts', 'list', 'magazine', { h1: true, title: 'The Long Way Round', items: [{ meta: 'This week', title: 'Thirty-one hours to Istanbul, and I would do it again', text: 'Four trains, one ferry and a border guard who wanted to talk about football. What the slow route costs, and what it gives back.', img: I('mountains'), alt: 'Mountains above a lake, seen from a train window', link: U('istanbul') }, { meta: '12 March', title: 'The case for the night ferry', text: 'A cabin, a bar, the sea. Cheaper than a hotel.', link: U('night-ferry') }, { meta: '26 February', title: 'How to pack for three weeks in one small bag', text: 'A list, and the four things I stopped bringing.', link: U('packing') }, { meta: '9 February', title: 'Lisbon on foot, hill by hill', text: 'A walk that takes a day and avoids every tram queue.', link: U('lisbon') }, { meta: '22 January', title: 'What a missed connection taught me', text: 'Six hours in a town I had never heard of.', link: U('missed') }] }),
    blk('bnews', 'newsletter', 'card', { title: 'A letter every other Sunday', text: 'The new essay, one route worth taking and nothing to buy. 3,100 readers so far.', action: '', button: 'Subscribe' }),
    blk('babout', 'text', 'highlight', { title: 'Who writes this', text: 'Hana Mori has not taken a flight since 2019. She writes from trains, mostly, and pays for every ticket herself.' }),
    foot('© Hana Mori', [B('RSS', U('rss')), B('Write to me', M('hana@example.com'))]),
  ] }],
});

add('podcast', 'Podcast', 'For a show: the cover and where to listen up top, then every episode as a plain running log.', 'Blog', 'blog', ['podcast', 'show', 'episodes', 'audio', 'radio', 'listen', 'interview'], {
  name: 'Night Shift', seo: { description: 'Night Shift is a podcast about people who work while everyone else sleeps. A new episode every other Thursday.' },
  theme: theme(K('#F6F4EC', '#1C1B19', '#5D594F', '#FFFFFF', '#1C1B19', '#1E6F5C'), 'JetBrains Mono', 'Inter', 0),
  pages: [{ title: 'Home', blocks: [
    blk('bhero', 'hero', 'split', { eyebrow: 'Every other Thursday', title: 'Night Shift', text: 'Conversations with people who work while everyone else sleeps: bakers, nurses, lock keepers, a man who repaints the lines on runways.', img: I('cover'), alt: 'The Night Shift cover: sound bars in a dark circle', shape: 'square', buttons: [B('Listen on Apple Podcasts', U('apple')), B('Listen on Spotify', U('spotify'))] }),
    blk('beps', 'list', 'rows', { title: 'Episodes', items: [{ title: '42. The lock keeper of Caen Hill', meta: '38 min', text: 'Twenty-nine locks, one man, and the boats that arrive at 3am.', link: U('42') }, { title: '41. Runway 27 Left', meta: '44 min', text: 'Painting white lines between the last landing and the first.', link: U('41') }, { title: '40. Bread for 6am', meta: '31 min', text: 'A bakery where the day starts at 11 at night.', link: U('40') }, { title: '39. The 2am vet', meta: '36 min', text: 'What gets brought in when nobody else is open.', link: U('39') }, { title: '38. Signal box', meta: '41 min', text: 'One of the last hand-worked boxes on the network.', link: U('38') }] }),
    blk('bwho', 'text', 'two', { title: 'Who makes it', text: 'Recorded and edited by Callum Reid, who worked nights in a hospital laundry for six years and never got his sleep back.' }),
    blk('bnews', 'newsletter', 'inline', { title: 'Know when an episode is out', text: 'One short email, every other Thursday morning.', action: '', button: 'Tell me' }),
    foot('Night Shift is made in Bristol', [B('RSS feed', U('rss')), B('callum@example.com', M('callum@example.com'))]),
  ] }],
});

// every template the gallery no longer offers, and the closest one it does
const RETIRED = {
  'lb-musician': 'creator', 'lb-shop': 'linkbio', 'lb-writer': 'linkbio', 'lb-coach': 'linkbio', 'lb-dev': 'linkbio', 'lb-artist': 'creator', 'tt-profile-card': 'linkbio', 'h5-identity': 'linkbio',
  'sb-agency': 'portfolio', 'sb-business-frontpage': 'service', 'sb-creative': 'portfolio', 'sb-modern-business': 'service', 'sb-small-business': 'service',
  'sb-grayscale': 'saas', 'sb-landing-page': 'saas', 'sb-new-age': 'app-download', 'sb-one-page-wonder': 'saas', 'tt-landing-page': 'saas', 'tt-app-landing': 'app-download', 'h5-photon': 'saas', 'h5-stellar': 'saas', 'h5-landed': 'saas',
  'sb-freelancer': 'portfolio', 'sb-stylish-portfolio': 'portfolio', 'h5-forty': 'photography', 'h5-miniport': 'portfolio',
  'sb-personal': 'letter', 'sb-resume': 'resume', 'h5-dimension': 'letter', 'h5-read-only': 'letter',
  'sb-clean-blog': 'blog', 'tt-ghostwind': 'blog', 'tt-minimal-blog': 'blog', 'h5-massively': 'blog',
  'tt-nordic-store': 'merch', 'sb-business-casual': 'cafe', 'sb-coming-soon': 'comingsoon', 'h5-eventually': 'comingsoon',
};
// kept as it was: the page that sends visitors on (its file is not rewritten)
const AS_IS = [{ id: 'app-redirect', title: 'Send people to my app', summary: 'For a short link you print or post: one small page that sends visitors on to your app store page, a download or any address.', category: 'Projects', kind: 'app', tags: ['redirect', 'short link', 'app store', 'download', 'qr code', 'forward'] }];
// the order the gallery shows them in
const ORDER = ['linkbio', 'creator', 'gh-project', 'app-download', 'app-redirect', 'saas', 'gamepage', 'docs', 'comingsoon', 'service', 'cafe', 'menu', 'merch', 'club', 'nonprofit', 'portfolio', 'photography', 'resume', 'letter', 'band', 'wedding', 'conference', 'course', 'blog', 'podcast'];

module.exports = { templates: T, RETIRED, AS_IS, ORDER };
if (require.main === module) process.stdout.write(JSON.stringify({ templates: T, retired: RETIRED, asIs: AS_IS, order: ORDER }));
