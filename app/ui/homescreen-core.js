// Put it on your phone: the shared core (docs/HOMESCREEN-PATH.md). Used by the browser (app/ui/homescreen.js) and the
// server (server/homescreen.js), so the installability check, the phone-and-browser steps and the free limits are written
// once. Plain data and pure functions: no network, no DOM.
//
//   check(files, o)  files: { 'index.html': text, 'manifest.webmanifest': text, … } (text files of the web folder, or what
//                    was fetched from the live link); o = { https, live }. -> { ok, required, items: [{ id, ok, need, label, why, fix }] }
//   manifestOf(files)              -> { path, json, error } | null       the manifest the first page links to
//   detect(ua, o)                  -> { os, browser, inApp, platform, key }   o = { touch, maxTouchPoints }
//   steps(key)                     -> { title, items: [text…], drawings: [id…], note }
//   STAGES, LIMITS, STORE, ASKS, SOURCES, READ                           the guided path's words and facts
//   answer(topic)                  -> { text, stage }                   Flint's no-AI answers ("is it free?", "do I need a Mac?")
// Facts come from the official pages listed in SOURCES, read on READ. No TribeCode prices live here.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TribeHomeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const READ = '2026-11-16';

  // ---------- the official pages behind every fact on the path ----------
  const SOURCES = {
    installCriteria: { title: 'What does it take to be installable? (web.dev)', url: 'https://web.dev/articles/install-criteria' },
    installation: { title: 'Installation (web.dev Learn PWA)', url: 'https://web.dev/learn/pwa/installation' },
    mdnInstallable: { title: 'Making PWAs installable (MDN)', url: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable' },
    maskable: { title: 'Adaptive icon support with maskable icons (web.dev)', url: 'https://web.dev/articles/maskable-icon' },
    safari26: { title: 'News from WWDC25: WebKit in Safari 26 (WebKit)', url: 'https://webkit.org/?p=16993' },
    ios164: { title: 'Web Push for Web Apps on iOS and iPadOS (WebKit)', url: 'https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/' },
    inApp: { title: 'The Pitfalls of In-App Browsers (Frontend Masters)', url: 'https://blog.master.dev/the-pitfalls-of-in-app-browsers/' },
    pages: { title: 'GitHub Pages limits (GitHub Docs)', url: 'https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits' },
    render: { title: 'Deploy for Free (Render Docs)', url: 'https://render.com/docs/free' },
    cfPages: { title: 'Cloudflare Pages limits', url: 'https://developers.cloudflare.com/pages/platform/limits/' },
    netlify: { title: 'Netlify pricing', url: 'https://www.netlify.com/pricing/' },
    expo: { title: 'Expo pricing', url: 'https://expo.dev/pricing' },
    apple: { title: 'Apple Developer Program', url: 'https://developer.apple.com/programs/' },
    testflight: { title: 'TestFlight (Apple Developer)', url: 'https://developer.apple.com/testflight/' },
    playFee: { title: 'Get started with Play Console (Google)', url: 'https://support.google.com/googleplay/android-developer/answer/6112435' },
    playTesting: { title: 'App testing requirements for new personal developer accounts (Google)', url: 'https://support.google.com/googleplay/android-developer/answer/14151465' },
  };

  // ---------- the five stages ----------
  // local: what Flint does here with no AI. ai: what a stronger AI adds (the one prefilled ask is in ASKS).
  const STAGES = [
    { id: 'ready', n: 1, title: 'Make it installable', short: 'Installable',
      line: 'A phone only offers to install a page that tells it the app’s name, its icons and how to open it.',
      why: 'Without these, the page opens as a normal website tab and the phone offers no icon of its own.',
      local: 'Flint checks the page and adds the missing pieces in one tap: the app file (manifest), icons from your Launch kit, an iPhone icon and an offline copy.',
      stuck: 'If the check still shows a cross after the fix, the page may point at its own manifest that has mistakes. Open Files › Code and look at manifest.webmanifest, or ask your AI helper.',
      res: ['installCriteria', 'mdnInstallable', 'maskable'] },
    { id: 'online', n: 2, title: 'Put it online', short: 'Online',
      line: 'Your phone needs a link it can open: a secure https:// address that works when you are not at your computer.',
      why: 'Phones only install pages served over https, and a link that stops when your computer sleeps stops the app too.',
      local: 'Publishing needs no AI: the play link, a free cloud spot and GitHub Pages are all one sheet away.',
      stuck: 'If the link does not open on your phone, check it is https and not a 192.168… or localhost address. Those only work on the same Wi-Fi or this computer.',
      res: ['pages', 'render'] },
    { id: 'open', n: 3, title: 'Open it on your phone', short: 'On your phone',
      line: 'Scan the code with the phone’s camera, or send yourself the link.',
      why: 'The link has to open in the phone’s real browser: Safari on iPhone, Chrome or Samsung Internet on Android.',
      local: 'The code and the text message are made right here, with no AI and no outside service.',
      stuck: 'If the camera does nothing, open the Camera app (not a social app) and hold it still over the code. Or tap Send by text and open the message on the phone.',
      res: ['installation'] },
    { id: 'add', n: 4, title: 'Add it to the home screen', short: 'Home screen',
      line: 'Each phone and browser hides the button in a different place. Pick yours.',
      why: 'iPhones never show an install pop-up; you add the app from the Share menu. Android usually offers Install in the menu.',
      local: 'Flint knows the steps for each phone and browser and can tell you if you are inside an app’s own browser.',
      stuck: 'No Add to Home Screen button? You are probably inside Instagram, TikTok or Messenger. Open the link in Safari or Chrome first.',
      res: ['installation', 'safari26', 'ios164', 'inApp'] },
    { id: 'store', n: 5, title: 'A real store app (optional)', short: 'Store app',
      line: 'Most people stop at the home screen. A store app is for when you want to be found in the App Store or Google Play.',
      why: 'Stores add review, accounts and fees, but also search, payments and trust.',
      local: 'The Launch kit makes the screenshots, icon, store text and checklist with no AI. Phone app mode sets up an Expo project.',
      stuck: 'Store builds are the one step where a stronger AI or a developer friend helps most: signing, build settings and review notes.',
      res: ['expo', 'apple', 'playFee', 'playTesting', 'testflight'] },
  ];
  // One prefilled ask per stage for a stronger AI (sent to the tribe's AI helpers; nothing joins the main copy without a person's OK).
  const ASKS = {
    ready: 'Make my app work offline with a service worker that updates cleanly when I publish a new version, and check the manifest and icons pass Chrome’s install check.',
    online: 'Check that my app still works when it is served from a subfolder (like GitHub Pages): fix absolute paths, the start URL and the service worker scope.',
    open: 'Make my app fit small phones: safe areas around the notch and home bar, tap targets of at least 44 pixels, and no sideways scrolling.',
    add: 'Add a small, polite install hint inside my app: an Install button where the browser allows it, and short Add to Home Screen steps on iPhone.',
    store: 'Prepare an Expo build of this app for the App Store and Google Play: app.json name, icons, splash, bundle identifiers and the EAS build settings.',
  };

  // ---------- free limits that matter, from official pages ----------
  const LIMITS = [
    { id: 'computer', name: 'This computer’s link', cost: 'Free', facts: ['Works while this computer is on and online', 'Phones outside your Wi-Fi need the public link (Settings › Sharing)'], src: null },
    { id: 'cloud', name: 'Free cloud (Render)', cost: 'Free plan', facts: ['Naps after 15 minutes with nobody there and takes about a minute to wake', '750 free hours a month per workspace', 'A nap wipes its files; browsers put them back'], src: 'render' },
    { id: 'pages', name: 'GitHub Pages', cost: 'Free for public projects', facts: ['A site of up to 1 GB', 'A soft limit of 100 GB of traffic a month', 'A soft limit of 10 builds an hour', 'Private projects need a paid GitHub plan'], src: 'pages' },
    { id: 'cf', name: 'Cloudflare Pages', cost: 'Free plan', facts: ['500 builds a month', 'Up to 20,000 files, 25 MiB each'], src: 'cfPages' },
    { id: 'netlify', name: 'Netlify', cost: 'Free plan', facts: ['300 credits a month; traffic and builds use them', 'A site that runs out pauses until next month'], src: 'netlify' },
  ];
  const STORE = [
    { id: 'expo', name: 'Expo builds (EAS)', cost: 'Free plan', facts: ['15 Android and 15 iOS builds a month', 'Low priority queue, 45-minute build limit', '1,000 monthly users for over-the-air updates'], src: 'expo' },
    { id: 'apple', name: 'Apple App Store', cost: '$99 a year (Apple Developer Program)', facts: ['Needed to install on iPhones beyond your own testing and to submit', 'TestFlight: up to 100 internal and 10,000 external testers'], src: 'apple', also: 'testflight' },
    { id: 'google', name: 'Google Play', cost: 'US$25 once', facts: ['New personal accounts: 12 testers opted in for 14 days before going public'], src: 'playFee', also: 'playTesting' },
  ];

  // ---------- reading the web folder ----------
  const low = s => String(s == null ? '' : s).toLowerCase();
  const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? (m[2] != null ? m[2] : m[3] != null ? m[3] : m[4]) : null; };
  const linkTags = html => String(html || '').match(/<link\b[^>]*>/gi) || [];
  function relPath(base, href) {
    href = String(href || '').trim(); if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;
    href = href.split(/[?#]/)[0]; if (href.startsWith('/')) return href.replace(/^\/+/, '');
    const parts = base.split('/'); parts.pop();
    for (const p of href.split('/')) { if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p); }
    return parts.join('/');
  }
  function manifestOf(files) {
    const html = files['index.html']; if (html == null) return null;
    const tag = linkTags(html).find(t => /\brel\s*=\s*["']?manifest\b/i.test(t)); if (!tag) return null;
    const href = attr(tag, 'href'), p = relPath('index.html', href);
    if (p == null) return { path: href, json: null, error: 'outside', href };
    const text = files[p]; if (text == null) return { path: p, json: null, error: 'missing', href };
    try { const j = JSON.parse(text); return j && typeof j === 'object' && !Array.isArray(j) ? { path: p, json: j, error: null, href } : { path: p, json: null, error: 'bad', href }; }
    catch { return { path: p, json: null, error: 'bad', href }; }
  }
  const sizesOf = ic => low(ic && ic.sizes).split(/\s+/).filter(Boolean);
  const raster = ic => !/svg/i.test(String(ic.type || '')) && !/\.svg(?:[?#]|$)/i.test(String(ic.src || ''));
  const hasSize = (icons, n) => icons.some(ic => raster(ic) && sizesOf(ic).some(s => { const m = /^(\d+)x(\d+)$/.exec(s); return !!m && +m[1] === +m[2] && +m[1] >= n; }));
  const purposes = ic => low(ic && ic.purpose || 'any').split(/\s+/);
  function swRegistered(files) {
    for (const [p, t] of Object.entries(files)) if (/\.(html?|m?js)$/i.test(p) && /serviceWorker\s*\.\s*register\s*\(/.test(String(t || ''))) return true;
    return false;
  }

  // ---------- the check ----------
  function check(files, o = {}) {
    files = files || {}; const items = [];
    const add = (id, ok, need, label, why, fix) => items.push({ id, ok: !!ok, need, label, why: ok ? '' : why, fix: ok ? null : fix || null });
    const html = files['index.html'];
    add('page', html != null, 'required', 'Has a first page', 'There is no index.html at the top of the web folder yet. Build a first version first.', null);
    if (html == null) return summary(items);
    const mf = manifestOf(files), j = mf && mf.json;
    add('manifest', !!j, 'required', 'Has an app file (manifest)',
      !mf ? 'The first page does not link a web app manifest, so phones treat it as a plain website.'
        : mf.error === 'missing' ? `The page links ${mf.path}, but that file is not in the folder.`
          : mf.error === 'outside' ? 'The page links a manifest on another site. Phones need it on the same site.'
            : 'The manifest is not valid JSON.', 'manifest');
    const icons = j && Array.isArray(j.icons) ? j.icons.filter(ic => ic && ic.src) : [];
    add('name', !!(j && (String(j.name || '').trim() || String(j.short_name || '').trim())), 'required', 'Has a name', 'The manifest needs a name (or short_name) to show under the icon.', 'manifest');
    add('icons', hasSize(icons, 192) && hasSize(icons, 512), 'required', 'Has 192 and 512 pixel icons', 'Chrome needs a 192 and a 512 pixel picture icon in the manifest before it offers Install.', 'icons');
    add('maskable', icons.some(ic => purposes(ic).includes('maskable')), 'recommended', 'Has a maskable icon for Android', 'Without a maskable icon, Android shows the icon small on a white circle.', 'icons');
    add('start', !!(j && String(j.start_url || '').trim()), 'required', 'Says where it starts', 'The manifest needs a start_url so the icon opens the right page.', 'manifest');
    add('display', !!(j && ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].includes(low(j.display))), 'required', 'Opens like an app', 'Set display to standalone so it opens full screen without the browser bar.', 'manifest');
    add('related', !(j && j.prefer_related_applications === true), 'required', 'Does not send people to a store app', 'prefer_related_applications is true, which tells Chrome to offer a store app instead.', 'manifest');
    const apple = linkTags(html).find(t => /\brel\s*=\s*["']?apple-touch-icon/i.test(t)), appleHref = apple ? low(attr(apple, 'href')) : '';
    add('apple', !!apple && !/\.svg(\?|#|$)/.test(appleHref), 'recommended', 'Has an iPhone icon', apple ? 'The iPhone icon is an SVG. iPhones need a PNG picture (180 pixels or more).' : 'No apple-touch-icon, so an iPhone uses a screenshot of the page as the icon.', 'icons');
    add('viewport', /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html), 'required', 'Fits a phone screen', 'No phone setting (viewport). The page shows tiny on a phone.', 'viewport');
    add('sw', swRegistered(files), 'recommended', 'Opens with no connection', 'No offline copy (service worker). It installs, but shows an error with no signal.', 'sw');
    if (o.live) add('https', !!o.https, 'required', 'Served over https', 'Phones only install pages from a secure https:// address (localhost works only on this computer).', null);
    return summary(items);
  }
  function summary(items) {
    const required = items.filter(x => x.need === 'required');
    return { ok: required.every(x => x.ok), required: required.length, missing: items.filter(x => !x.ok).map(x => x.id), fixable: items.some(x => !x.ok && x.fix), items };
  }

  // ---------- which phone and browser ----------
  const IN_APP = [['Instagram', /Instagram/i], ['Messenger', /\bMessenger|FBAN\/Messenger|MessengerForiOS|FB_IAB\/MESSENGER/i], ['Facebook', /\bFBAN\/|\bFBAV\/|FB_IAB|FBIOS|\[FB/i], ['TikTok', /musical_ly|TikTok|Bytedance|BytedanceWebview|trill_/i],
    ['Snapchat', /Snapchat/i], ['LinkedIn', /LinkedInApp/i], ['X', /\bTwitter(?:Android)?\b/i], ['Line', /\bLine\//], ['Pinterest', /Pinterest/i], ['WeChat', /MicroMessenger/i]];
  function detect(ua, o = {}) {
    ua = String(ua || '');
    const ipadDesk = /Macintosh/.test(ua) && (o.touch || (o.maxTouchPoints || 0) > 1);
    const os = /iPhone|iPad|iPod/.test(ua) || ipadDesk ? 'ios' : /Android/i.test(ua) ? 'android' : /Windows|Macintosh|Linux|CrOS/.test(ua) ? 'desktop' : 'other';
    const hit = IN_APP.find(([, re]) => re.test(ua)), inApp = hit ? hit[0] : (os === 'android' && /; wv\)/.test(ua) ? 'an app' : null);
    let browser = 'other';
    if (os === 'ios') browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : /Safari\//.test(ua) && !inApp ? 'safari' : inApp ? 'inapp' : 'safari';
    else if (os === 'android') browser = /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox\//.test(ua) ? 'firefox' : /EdgA\//.test(ua) ? 'edge' : /Chrome\//.test(ua) ? 'chrome' : 'other';
    else if (os === 'desktop') browser = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
    const key = inApp ? (os === 'android' ? 'inapp-android' : 'inapp-ios')
      : os === 'ios' ? (browser === 'safari' ? 'ios-safari' : 'ios-other')
        : os === 'android' ? (browser === 'samsung' ? 'android-samsung' : browser === 'firefox' ? 'android-firefox' : 'android-chrome')
          : os === 'desktop' ? (browser === 'chrome' || browser === 'edge' ? 'desktop-chromium' : 'desktop-other') : 'ios-safari';
    return { os, browser, inApp, platform: os === 'ios' ? 'iphone' : os === 'android' ? 'android' : 'computer', key, phone: os === 'ios' || os === 'android' };
  }
  // The steps, in plain words, with the drawing for each (homescreen.js draws them). Every list ends with the icon.
  const STEPS = {
    'ios-safari': { tab: 'iphone', title: 'iPhone or iPad, in Safari', items: ['Tap the Share button: the square with an arrow pointing up.', 'Scroll down the list and tap Add to Home Screen.', 'On iOS 26 and later, leave Open as Web App on. Tap Add.', 'The icon is on your home screen. Open it from there, not from Safari.'], drawings: ['share', 'addhome', 'webapp', 'icon'], note: 'iPhones never show an install pop-up. Since iOS 26, every site added to the Home Screen opens as a web app unless you turn that off.', res: ['safari26'] },
    'ios-other': { tab: 'iphone', title: 'iPhone, in Chrome, Edge or Firefox', items: ['Tap the Share button (in Chrome it is next to the address bar).', 'Tap Add to Home Screen. If it is not in the list, tap More or Edit Actions.', 'Tap Add.', 'The icon is on your home screen.'], drawings: ['share', 'addhome', 'webapp', 'icon'], note: 'Other browsers on iPhone can add to the Home Screen since iOS 16.4. If yours cannot, open the link in Safari.', res: ['ios164'] },
    'android-chrome': { tab: 'android', title: 'Android, in Chrome', items: ['Tap the menu: the three dots at the top right.', 'Tap Install app (on some phones it says Add to Home screen).', 'Tap Install.', 'The icon is on your home screen and in your app list.'], drawings: ['dots', 'install', 'confirm', 'icon'], note: 'Chrome may also show an Install banner by itself after you have used the page for a little while.', res: ['installation', 'installCriteria'] },
    'android-samsung': { tab: 'android', title: 'Android, in Samsung Internet', items: ['Tap the install icon in the address bar if you see one, or open the menu (three lines).', 'Tap Add page to, then Home screen (or Install).', 'Tap Add.', 'The icon is on your home screen.'], drawings: ['lines', 'install', 'confirm', 'icon'], note: 'On Samsung phones it installs like a real app; on other phones Samsung Internet makes a shortcut.', res: ['installation'] },
    'android-firefox': { tab: 'android', title: 'Android, in Firefox', items: ['Tap the menu: the three dots.', 'Tap Install (or Add to Home screen).', 'Tap Add.', 'The icon is on your home screen.'], drawings: ['dots', 'install', 'confirm', 'icon'], note: '', res: ['installation'] },
    'desktop-chromium': { tab: 'computer', title: 'A computer, in Chrome or Edge', items: ['Look for the install icon at the right of the address bar (a screen with an arrow).', 'Click it, then click Install.', 'It opens in its own window and gets an icon in your apps.'], drawings: ['bar', 'confirm', 'icon'], note: 'You can also find Install in the browser’s menu.', res: ['installation'] },
    'desktop-other': { tab: 'computer', title: 'A computer, in another browser', items: ['Open the link in Chrome or Edge.', 'Click the install icon at the right of the address bar.', 'Click Install.'], drawings: ['bar', 'confirm', 'icon'], note: 'Firefox on computers does not install web apps.', res: ['installation'] },
    'inapp-ios': { tab: 'iphone', title: 'Inside another app’s browser (iPhone)', items: ['Tap the ••• or the compass button in the corner of that app’s browser.', 'Tap Open in Safari (some apps say Open in external browser).', 'In Safari, follow the iPhone steps: Share, Add to Home Screen.'], drawings: ['more', 'safari', 'share'], note: 'Apps like Instagram, TikTok and Messenger open links in their own small browser, which has no Add to Home Screen. There is no reliable way for a page to jump out on iPhone, so it takes these taps.', res: ['inApp'] },
    'inapp-android': { tab: 'android', title: 'Inside another app’s browser (Android)', items: ['Tap Open in Chrome below, or the ⋮ menu in that app’s browser.', 'Choose Open in Chrome (or Open in browser).', 'In Chrome, follow the Android steps: menu, Install app.'], drawings: ['more', 'chrome', 'dots'], note: 'Apps like Instagram, TikTok and Messenger open links in their own small browser, which cannot install apps.', res: ['inApp'] },
  };
  const steps = key => STEPS[key] || STEPS['ios-safari'];
  // An Android link that asks the phone to open the page in Chrome (the in-app browser escape on Android).
  const intentUrl = url => { try { const u = new URL(url); return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`; } catch { return null; } };

  // ---------- Flint's answers with no AI ----------
  const ANSWERS = {
    path: { stage: 'ready', text: 'Five steps: make it installable, put it online, open the link on your phone, add it to the home screen, and (only if you want the stores) a store app. I can open the guided path and check each step with you.' },
    iphone: { stage: 'add', text: 'iPhones never show an install pop-up. Open the link in Safari, tap Share (the square with an arrow), then Add to Home Screen. If there is no such button you are probably inside Instagram, TikTok or Messenger: open the link in Safari first. Since iOS 26 every site you add opens as a web app.' },
    android: { stage: 'add', text: 'On Android, open the link in Chrome, tap the three dots, then Install app (or Add to Home screen). Chrome only offers Install when the page has an app file, 192 and 512 pixel icons and an https link: the guided path checks and fixes that.' },
    free: { stage: 'online', text: 'The home screen way is free: the page, the icon and the offline copy cost nothing, and GitHub Pages or the free cloud host it for free within their limits. The stores are what cost money: Apple’s developer program is $99 a year and Google Play is US$25 once (from their own pages).' },
    mac: { stage: 'store', text: 'Not for the home screen: any computer works, and the phone does the installing. For an App Store app, the build can run on Expo’s or GitHub’s Mac machines, so you do not need your own Mac, but you do need Apple’s developer membership to put it on other people’s iPhones.' },
    inapp: { stage: 'add', text: 'Instagram, TikTok, Messenger and similar apps open links in their own small browser, which cannot add to the Home Screen. Tap the ••• or compass button and choose Open in Safari (iPhone) or Open in Chrome (Android), then add it from there.' },
    offline: { stage: 'ready', text: 'It opens with no connection once it has an offline copy (a service worker). The installable fix adds one that keeps the app’s own files on the phone and refreshes them when you are online.' },
    store: { stage: 'store', text: 'A store app is optional. The Launch kit makes the screenshots, icon, store text and checklist, and phone app mode sets up an Expo project. Expo’s free plan includes 15 iOS and 15 Android builds a month; Apple charges $99 a year and Google US$25 once.' },
  };
  const answer = topic => ANSWERS[topic] || ANSWERS.path;

  return { READ, SOURCES, STAGES, ASKS, LIMITS, STORE, STEPS, check, manifestOf, detect, steps, intentUrl, answer, ANSWERS };
});
