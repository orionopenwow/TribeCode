# Building apps: common questions

Short answers to the questions people ask while making a phone or web app, with what TribeCode does about each one today. Flint answers from this page with no AI. Sources were read on 2026-11-16; the research notes are in FLINT-APP-KNOWLEDGE.md (internal). "Feature" below means one of the 48 working features Flint adds with no AI: say "what features can you add?".

## What is the difference between a web app, a PWA and a native app?

A web app runs in the browser from a link. A PWA (progressive web app) is a web app with a manifest and usually a service worker, so it can be installed to the Home Screen and work offline. A native app is built for iOS or Android and installed from a store. TribeCode's App Creator exports a PWA; Expo export makes a native project.

Read more: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps

## Should I use a PWA, Expo or Capacitor?

Start with a PWA: one link, no store, works on every phone. Choose Expo (React Native) when you need the stores or native features; choose Capacitor to wrap the web app you already have in a native shell. In TribeCode: App Creator exports a PWA and an Expo project; phone app mode sets up Expo, Capacitor or Tauri.

Read more: https://docs.expo.dev/ and https://capacitorjs.com/docs

## What is Expo?

Expo is an open-source (MIT) set of tools around React Native that builds iPhone and Android apps from JavaScript, with Expo Go for testing on a phone by scanning a QR code. In TribeCode: App Creator › Export › Expo project writes app-expo/, and phone app mode shows the Expo Go QR while it runs.

Read more: https://docs.expo.dev/

## Which Expo template should I start from?

create-expo-app offers default (several screens with Expo Router and TypeScript), blank, blank-typescript, tabs (tab navigation) and bare-minimum (with native folders). For most apps the default or tabs template fits. TribeCode's Expo export draws the screens you designed instead of a template.

Read more: https://docs.expo.dev/more/create-expo/

## What is Capacitor?

Capacitor (MIT, from the Ionic team) puts a web app inside a native iOS or Android shell and gives it plugins for the camera, files, notifications and more. It suits teams who already have a working web app. In TribeCode: phone app mode can set up a Capacitor project.

Read more: https://capacitorjs.com/docs

## What is Tauri?

Tauri (MIT or Apache-2.0) builds small desktop apps, and now mobile apps, from a web front end with a Rust core. TribeCode's own desktop app is built with Tauri v2. For a phone app, Expo or a PWA is usually simpler.

Read more: https://v2.tauri.app/

## What does a web app need to be installable?

A web app manifest linked from the page with a name, icons (192 and 512 pixels), a start URL and a display mode, served over HTTPS (localhost is fine while testing). A service worker isn't required to install but gives offline use. App Creator's export includes all of these.

Read more: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable

## What is a web app manifest?

A small JSON file (manifest.webmanifest) that tells the phone the app's name, icon, colours, start page and how to open it (standalone hides the browser bars). It is what makes Add to Home Screen look like a real app. App Creator writes one for you.

Read more: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest

## What is a service worker?

A script the browser runs in the background for your site. It can keep the app's files so it opens offline, and it is needed for web push. App Creator's export includes a simple one that caches the app's own files. Workbox (MIT) is a popular library for bigger caching needs.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

## How do I put my app on my Home Screen?

On iPhone, open the app's link, tap Share, then Add to Home Screen (Safari, and since iOS 16.4 also Chrome, Edge and Firefox). On Android, Chrome offers Install app from its menu or a prompt. Add the Install button feature and Flint shows the right steps on each phone.

Read more: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable

## Why is there no install button on iPhone?

iPhones don't support the beforeinstallprompt event, so a web page can't show its own install prompt. People install from the Share menu instead. The Install button feature explains those steps on iPhone and shows a real prompt on Android and computers.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event

## How do apps work offline?

The app's own files are kept by a service worker, and the person's data is saved on the phone (localStorage for small things, IndexedDB for more). App Creator exports work offline; add the Remember everything feature so ticks and typed text survive closing the app.

Read more: https://web.dev/learn/pwa/offline-data

## How do I store data in my app?

For a few settings or a short list, localStorage is enough; for larger or structured data use IndexedDB (libraries like idb or localForage make it easier). Data shared between people needs a server. In TribeCode: the Remember everything, Add to a list and Favourites features save on the phone with no AI.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB

## What is the difference between localStorage and IndexedDB?

localStorage stores small strings, is simple and synchronous, and holds a few megabytes. IndexedDB stores structured data and files, is asynchronous, and can hold much more. Both stay on one device and browser, and private windows clear them when closed.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API

## Why does my app lose its data when I reload?

The data only lived in memory. Save it on the phone (localStorage or IndexedDB) and load it when the app opens. Ask Flint "add offline storage to my app": the Remember everything feature keeps ticks, switches and typed text with no AI.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage

## Can data be shared between my phone and my friend's phone?

Not with storage on the phone alone: shared data needs a server or a database service (for example Supabase or Firebase). That is a job for a stronger AI helper, and someone approves what it builds. TribeCode's own tribe data already syncs between members through the tribe's computer.

Read more: https://supabase.com/docs

## How do I add login to my app?

Real accounts need a server that checks passwords or sends sign-in links (services like Supabase Auth or Firebase Authentication do this). App Creator has a sign-in screen to design it, and the Demo sign-in feature remembers a name on one phone to try the flow. For real accounts, ask a stronger AI.

Read more: https://supabase.com/docs/guides/auth

## Is the demo sign-in secure?

No. It only keeps a name on that phone, checks nothing and protects nothing; it exists so you can try the sign-in flow. Real sign-in needs a server, passwords stored safely (or sign-in links and passkeys), and HTTPS. Flint says so when you add it.

Read more: https://supabase.com/docs/guides/auth

## What are passkeys?

Passkeys replace passwords with a key kept on the phone and unlocked by Face ID, a fingerprint or the PIN. They resist phishing. Using them needs a server that supports WebAuthn, often through an auth service. Ask a stronger AI to set them up.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API

## What is Supabase?

An open-source backend (Postgres database, auth, file storage, realtime) you can use as a hosted service or run yourself. It is a common choice when an app needs accounts and shared data. Connecting one is work for a stronger AI helper; TribeCode keeps the keys on the host.

Read more: https://supabase.com/docs

## What is Firebase?

Google's hosted backend for apps: authentication, a realtime database, file storage, hosting and push messaging (Firebase Cloud Messaging). It has free limits and paid use beyond them. Wiring it in is work for a stronger AI helper.

Read more: https://firebase.google.com/docs

## How do push notifications work on iPhone?

Since iOS 16.4, a web app added to the Home Screen can ask for notification permission after a tap, and a server sends the pushes. Without a server, a web app can only notify while it is open. The Reminders feature does that with no AI; push from a server needs a stronger AI.

Read more: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

## Can my app send a reminder when it is closed?

A web app can't wake itself up; it needs a push server to send the notification. While the app is open, the Reminders feature shows the notification at the time you set. For reminders when it's closed, use push from a server (a stronger AI) or a native app.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Push_API

## How do I ask for notification permission the right way?

Ask only after the person taps something that makes the reason clear (for example "Remind me"), never on first open. Browsers, and iPhones in particular, require a tap before asking. The Reminders feature asks only when someone saves their first reminder.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API

## How do I use the camera in a web app?

A file input with accept="image/*" and capture opens the camera on phones (capture="environment" for the back camera); on a computer it opens a file picker. For live video, getUserMedia needs HTTPS and permission. The Take a photo feature does the simple version with no AI.

Read more: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture

## How do I add a map?

App Creator has a map part for the design. A working map needs map tiles: OpenStreetMap is free with attribution, and Leaflet (BSD-2) is a small library to show it. The Map feature links to OpenStreetMap with no AI; an interactive map with markers is a job for a stronger AI.

Read more: https://www.openstreetmap.org/copyright

## How do I get the phone's location?

navigator.geolocation asks the person for permission and returns the position; it needs HTTPS. Tracking in the background needs a native app. The Where am I feature shows the location and a map link after the person agrees.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API

## How do I add a share button?

The Web Share API (navigator.share) opens the phone's share sheet; it needs HTTPS and a tap, and isn't in every browser, so copy the link as a fallback. The Share button feature does both with no AI.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API

## How do I keep the screen on?

The Screen Wake Lock API keeps the screen from sleeping while the page is visible (HTTPS needed). It's handy for recipes, workouts and timers. The Keep the screen on feature adds a switch for it.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API

## Can a web app vibrate the phone?

navigator.vibrate works on most Android browsers but not in Safari on iPhone. Use it only for short feedback. The Buzz on tap feature adds a light vibration where it is allowed.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API

## How do I add dark mode?

Two parts: colours that work in both modes, and either following the phone's setting (prefers-color-scheme) or a switch. In App Creator, say "make it dark" for the design, or add the Dark mode switch feature so people choose and the app remembers it.

Read more: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme

## How do I respect people who want less motion?

Check prefers-reduced-motion and shorten or remove animations when it is set, and offer a switch. TribeCode's own app does this, and the Less motion feature adds it to your app.

Read more: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

## How do I make text bigger for people who need it?

Use relative sizes (rem) so the phone's text size setting applies, keep body text at 16px or more, and offer a bigger-text option. The Bigger text feature adds a switch that is remembered.

Read more: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility

## How big should buttons be on a phone?

Make anything people tap at least 44 by 44 points (Apple) or 48 by 48 dp (Android), with space between. TribeCode's own phone screens use 36 to 44 pixel targets, and App Creator's parts follow the same rule.

Read more: https://developer.apple.com/design/human-interface-guidelines/accessibility

## How do I add search to my app?

Add App Creator's search part to a screen; it filters that screen's rows as you type. To put working search on every screen with a list, ask Flint "add search that works to my app" (the Search feature).

Read more: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/search

## How do I sort a list?

Sort the items in JavaScript (localeCompare sorts words properly in each language) and redraw the list. The Sort A to Z feature adds a button that sorts and reverses with no AI.

Read more: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare

## How do I let people add items to a list?

A text box and an Add button that make a new row and save it. In App Creator, the Add to a list feature puts that box above the first list and saves new rows on the phone.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage

## How do I let people delete items by swiping?

Track the finger on the row and remove it past a threshold, with Undo. The Swipe to remove feature does this; keep a visible delete button too, because swipes are hidden from many people.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Touch_events

## How do I add undo?

Keep the last change and offer an Undo button for a few seconds after it. TribeCode's editors undo every change; the Undo feature adds an undo message to your app after ticks and removals.

Read more: https://www.nngroup.com/articles/user-control-and-freedom/

## What should an empty list show?

A short, kind line saying what goes there and how to add the first one, instead of a blank space. App Creator has an empty state part, and the Friendly empty lists feature shows a message whenever a list or search comes up empty.

Read more: https://www.nngroup.com/articles/empty-state-interface-design/

## How do I show that something is loading?

For short waits, show placeholder shapes (a skeleton) where the content will be; for longer ones, a progress message. The Loading placeholders feature adds them on open.

Read more: https://web.dev/articles/optimize-lcp

## How do I confirm that an action worked?

A short message at the bottom (a toast or snackbar) that disappears on its own, with Undo when it helps. The Little confirmations feature adds them after ticks, likes and switches.

Read more: https://m3.material.io/components/snackbar/overview

## How do I add a timer?

App Creator has a timer part for the design. Ask "make the timer work" for the Countdown timer feature: start, pause, reset, plus and minus a minute, and a beep at zero. There is also a Stopwatch feature with laps.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval

## How do I count a streak?

Save the dates something was done and count back from today while each day is there. The Daily streak feature does this whenever something is ticked.

Read more: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date

## How do I show a progress bar?

Count the ticked items against all items and set the bar's width. App Creator has a progress ring part; the Progress bar feature fills a bar as items are ticked.

Read more: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/progress

## How do I add up numbers in a list?

Read each row's number, add them and show the total under the list. The Totals feature finds money and numbers in each row and keeps the total up to date.

Read more: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat

## How do I draw a chart from my data?

For a small chart, bars sized by each value are enough; for more, libraries like Chart.js (MIT) or uPlot (MIT) are in TribeCode's build kit. The Chart from a list feature draws a bar chart from the first list's numbers.

Read more: https://www.chartjs.org/docs/

## How do I export a list as a spreadsheet?

Write the rows as CSV (commas between values, quotes around text) and download it as a file. The Export as CSV feature does that for the first list; spreadsheets open it directly.

Read more: https://www.rfc-editor.org/rfc/rfc4180

## How do I let people back up their data?

Save everything the app keeps on the phone into a file they can download, and read it back to restore. The Backup and restore feature does this; a backup is the only copy if the phone is lost, so remind people to keep it.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Blob

## How do I add a "start over" button?

Clear only your app's saved data after asking twice, then reload. The Start over feature asks for a second tap before it clears anything.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Storage/removeItem

## How do I show onboarding only the first time?

Remember that the welcome was seen and skip it next time. Add the onboarding kit in App Creator, then the Welcome only once feature.

Read more: https://www.nngroup.com/articles/mobile-app-onboarding/

## How do I ask people to rate my app?

Ask after people have used it a few times, once, and make saying no easy. Store apps have their own rating prompts (StoreKit on iPhone, the in-app review API on Android). The Ask for a rating feature asks after the fifth visit in a web app.

Read more: https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews

## How do I translate my app into other languages?

Keep every word in a table per language and swap them at start; let the phone's language pick the default. The More languages feature adds a switch and collects the screen's words for you to translate (an AI can fill in the table).

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Intl

## How do I add text to speech?

The Web Speech API's speechSynthesis reads text aloud with the phone's own voices, no service needed. The Read aloud feature adds a button for the current screen.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

## How do I let people type by speaking?

SpeechRecognition (webkitSpeechRecognition in some browsers) turns speech into text in Chrome and Safari; some browsers send audio to their own service. The Speak to type feature adds a microphone next to the first text box where it is supported.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

## How do I add keyboard shortcuts?

Listen for keydown, skip it while someone is typing in a box, and keep to familiar keys (slash for search, Escape to close). The Keyboard shortcuts feature adds those plus arrow keys through rows.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event

## How do I lock my app with a PIN?

A PIN in a web app is a light lock: it keeps out a curious friend, not someone determined, because the data isn't encrypted. The PIN lock feature does that; real protection needs encryption or the phone's own lock, which a stronger AI can help with.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API

## How do I take payments in my app?

Payments need a payment provider (for example Stripe) and a server, and phone store apps selling digital things must usually use the store's in-app purchase. App Creator's paywall screens are designs only; payments aren't connected. Ask a stronger AI to connect a provider.

Read more: https://docs.stripe.com/

## What are in-app purchases?

Buying digital content or subscriptions inside a store app, handled by Apple (StoreKit) or Google Play Billing, which take a share. Store rules usually require them for digital goods in native apps. Setting them up is work for a stronger AI and a developer account.

Read more: https://developer.apple.com/in-app-purchase/

## How do I publish my web app?

Put its files on any host with HTTPS. In TribeCode: Publish › a stay-up link on your own GitHub (GitHub Pages), a download, or an itch.io zip; App Creator's export lands in app-web/ for that. The free cloud also serves it while the tribe is online.

Read more: https://docs.github.com/en/pages

## How do I get my app into the App Store or Google Play?

You need a developer account (Apple's is paid yearly, Google's is a one-time fee), a native build (Expo's EAS Build or Xcode and Android Studio), screenshots, an icon, a privacy policy and review. TribeCode's Launch kit makes the screenshots, icon and store text and lists every step.

Read more: https://docs.expo.dev/submit/introduction/

## Can I put a web app in the stores?

Sometimes. Google Play accepts PWAs wrapped as a Trusted Web Activity (PWABuilder or Bubblewrap make one). Apple asks for more than a wrapped website (guideline 4.2), so a native project such as the Expo export is the safer path.

Read more: https://docs.pwabuilder.com/

## What is EAS Build?

Expo Application Services builds your Expo app in the cloud into files you can install or send to the stores, without a Mac for iPhone builds. It has a free tier with limits. Connecting it uses your Expo account; ask a stronger AI or follow Expo's guide.

Read more: https://docs.expo.dev/build/introduction/

## How do I test my app on my phone?

For a web app, open its link on the phone (the tribe's invite link or a published page). For Expo, run the project and scan the QR code with Expo Go. In TribeCode: Preview › Open on my phone, and phone app mode shows the Expo Go QR.

Read more: https://docs.expo.dev/get-started/expo-go/

## How do I make app icons?

You need a square image (1024 pixels for the App Store), Android adaptive icon layers, and 192 and 512 pixel icons for a web app. The Launch kit makes every size from a shape, a symbol and your colours.

Read more: https://developer.apple.com/design/human-interface-guidelines/app-icons

## What screenshots do the stores need?

Apple wants screenshots for the largest iPhone size (and iPad if you support it); Google Play wants at least two phone screenshots and a 1024 by 500 feature graphic. The Launch kit renders them at the exact sizes with your screens and captions.

Read more: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications

## Do I need a privacy policy?

Yes for the stores, and it's good practice for any app that keeps personal data. Say what you collect, why, where it goes and how to delete it. If everything stays on the phone, say that. The Launch kit's checklist covers it (not legal advice).

Read more: https://developer.apple.com/app-store/review/guidelines/#privacy

## What is React Native?

A framework (MIT) for building native iPhone and Android apps with JavaScript and React. Expo is the usual way to start one. TribeCode's Expo export is a React Native project that draws your App Creator screens.

Read more: https://reactnative.dev/docs/getting-started

## What is Expo Router?

File-based navigation for Expo apps: each file in the app folder becomes a screen, and folders make tabs and stacks. The default and tabs templates use it.

Read more: https://docs.expo.dev/router/introduction/

## What is shadcn/ui?

A collection of accessible React components you copy into your own code and edit, rather than a package you install. It's popular for web apps. TribeCode's App Creator has its own parts and doesn't need it.

Read more: https://ui.shadcn.com/docs

## What is Radix?

Radix Primitives (MIT) are unstyled, accessible React building blocks (dialogs, menus, tabs) that many component sets build on. Useful when a React app needs accessible pieces.

Read more: https://www.radix-ui.com/primitives/docs/overview/introduction

## What is Ionic?

Ionic Framework (MIT) gives web apps phone-style components that look at home on iOS and Android, and pairs with Capacitor for native builds.

Read more: https://ionicframework.com/docs

## What is Workbox?

A set of libraries from the Chrome team for service workers: caching strategies, precaching and offline pages. Good when a web app grows beyond a simple cache.

Read more: https://developer.chrome.com/docs/workbox

## What is PWABuilder?

A free tool from Microsoft that checks a web app and packages it for app stores (Microsoft Store and Google Play, with notes on iOS).

Read more: https://docs.pwabuilder.com/

## What should a to-do app have?

A list with tick boxes, a box to add items, filters (all, to do, done), clear done, and saving on the phone. Say "make a to-do app" for the free recipe, or pick the to-do template in App Creator, then add Remember everything and Swipe to remove.

Read more: https://todomvc.com/

## What should a habit tracker have?

Today's habits with tick boxes, a streak per habit, a weekly view and reminders. App Creator's habit tracker template has the screens; add the Daily streak, Reminders and Remember everything features to make them work on the phone.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage

## What should a notes app have?

A list of notes with search, a writing screen that saves as you type, and folders or tags. App Creator's notes template plus the Search and Remember everything features cover the basics on one phone; notes on every device need sync from a stronger AI.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

## What should a budget app have?

Income and spending rows, a total, categories, a chart and an export. App Creator's budget template plus the Totals, Chart from a list and Export as CSV features work on the phone with no AI.

Read more: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat

## What should a workout app have?

A plan, a timer with rest periods, a log of sets and progress. App Creator's workout template plus the Countdown timer, Keep the screen on and Remember everything features.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API

## What should a recipe app have?

A recipe list with search and favourites, a recipe screen with ingredients and steps, a timer and the screen kept on while cooking. App Creator's recipes template plus Search, Favourites, Countdown timer and Keep the screen on.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API

## What should a chat app have?

Conversations, messages that arrive live, sending, and notifications. A design is easy (App Creator's chat template); real chat between people needs a server for messages and accounts, which is work for a stronger AI.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API

## What should a shop app have?

Products, a product page, a cart and checkout. App Creator's shop template designs it; real checkout needs a payment provider and a server (a stronger AI), and store apps selling digital goods use in-app purchase.

Read more: https://docs.stripe.com/payments/checkout

## What should a booking app have?

Services, available times, a booking form and confirmations. App Creator's booking template designs it; real availability shared between people needs a server or a booking service, which a stronger AI can connect.

Read more: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/datetime-local

## How do I make my app feel fast?

Show something right away (placeholders), keep animations short (150 to 300 ms), respond to taps instantly, and load big things only when needed. TribeCode's motion settings (calm, standard, snappy) apply to App Creator apps.

Read more: https://web.dev/explore/fast

## How do screen transitions work in an app?

Moving deeper slides in from the side, sheets slide up from the bottom, and related things can morph from one into the other. App Creator links have push, sheet, fade and morph transitions; play them with Play.

Read more: https://developer.apple.com/design/human-interface-guidelines/motion

## What is a tab bar and when should I use one?

A bar at the bottom with three to five main sections, always visible. Use it when the app has a few top-level places people switch between often. Say "add a tab bar" in App Creator.

Read more: https://developer.apple.com/design/human-interface-guidelines/tab-bars

## What is the difference between iPhone and Android design?

They share most ideas but differ in details: iPhone uses a centred title, back on the left and a tab bar; Android (Material) uses a top app bar, floating action buttons and navigation bars. App Creator switches between the iPhone and Android looks.

Read more: https://m3.material.io/

## How do I make my app accessible?

Real buttons and labels, enough contrast (4.5 to 1 for text), big tap targets, text that grows with the phone's setting, and alt text on pictures. App Creator checks colour contrast in its looks; screen reader testing on a real phone is still worth doing.

Read more: https://www.w3.org/WAI/standards-guidelines/wcag/

## How do I check my app works on a real phone?

Open it on an iPhone and an Android phone, install it to the Home Screen, try it offline, rotate it, make the text bigger and use it with one hand. TribeCode's docs/REAL-DEVICE-CHECK.md is a 15-minute script for TribeCode itself that you can copy.

Read more: https://web.dev/learn/pwa/

## Is my app's data private?

With TribeCode's features, everything stays on the phone: nothing is sent anywhere. Data in a private window is cleared when it closes, and clearing the browser's data clears the app's. Anything that sends data to a server needs a privacy policy that says so.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

## How much can a web app store on a phone?

It depends on the browser and free space: usually many megabytes, and IndexedDB can hold far more than localStorage. Browsers may clear data from sites not used for a while unless the app asks for persistent storage.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

## Why does my app need HTTPS?

Installing, service workers, the camera, location, sharing, wake lock and notifications all need a secure page. Local testing on localhost is allowed. GitHub Pages and TribeCode's public links use HTTPS.

Read more: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts

## What does "native features" mean?

Phone abilities beyond the web: Bluetooth, NFC, health data, background tracking, widgets, Siri shortcuts and deep system settings. A web app can't reach most of them; a native app (Expo or Capacitor plus plugins) can. That work goes to a stronger AI.

Read more: https://docs.expo.dev/versions/latest/

## What can Flint do for my app with no AI?

Make an app from 54 App Creator templates, change its look, add screens and kits, link screens, and add 48 working features (storage, search, reminders, timers, sharing, totals and more), then export it. Real accounts, payments and syncing between phones need a stronger AI.

Read more: https://github.com/orionopenwow/TribeCode

## When do I need a stronger AI for my app?

When it needs a server or native code: real accounts, data shared between people, payments, push when the app is closed, phone hardware, or changes across many files. Flint says so and hands your request to your own Claude Code, Codex or Gemini, and a person approves what comes back.

Read more: https://github.com/orionopenwow/TribeCode

## How do I give my AI helper a good request?

Say what the app should do in plain words, who uses it, what it must not break, and how you'll check it worked. App Creator's "Have my AI build it" writes that brief for you, including the screens, the features already working on the phone and the data to store.

Read more: https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview

## Can several people build one app together?

Yes: that's what a tribe is. Everyone edits the same App Creator design, each person's AI helper works in its own corner, and changes reach the main copy when someone with permission approves them.

Read more: https://github.com/orionopenwow/TribeCode

## What is GitHub and why does my app need it?

GitHub keeps your code's history online and can host your web app for free (GitHub Pages). TribeCode can connect your GitHub account so the code lives in your own repository and a stay-up link works without your computer.

Read more: https://docs.github.com/en/get-started

## What is a QR code for, when testing apps?

It carries a link to a phone's camera, so you don't type it. Expo Go uses one to open a running project; TribeCode's invite and preview links have QR codes too.

Read more: https://docs.expo.dev/get-started/expo-go/

## How do I add a feedback button?

A button that opens an email with the app name in the subject is the simplest; a form needs somewhere to send it. The Send feedback feature opens the phone's email app; put your address in the page's data-email attribute.

Read more: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#linking_to_an_email_address

## How do I show when the phone is offline?

Listen for the online and offline events and show a small banner, and keep saving on the phone meanwhile. The Offline notice feature does this.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine

## How do I add pull to refresh?

Watch for a downward pull at the top of the screen, show a spinner, then reload. Phones' browsers sometimes do it for you on normal pages; installed apps don't. The Pull to refresh feature adds it.

Read more: https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior

## How do I add favourites?

A star on each item, saved on the phone, and a filter for starred items. The Favourites feature does both.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage

## How do I add a tap counter?

A big number with plus and minus buttons, saved on the phone. The Tap counter feature adds one; it suits water glasses, reps or people at a door.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage

## How do I let people set their name and picture?

Ask once, keep it on the phone and show it where the design has an avatar. The Your name and picture feature does that; a profile that follows people to other phones needs accounts from a stronger AI.

Read more: https://developer.mozilla.org/en-US/docs/Web/API/FileReader

## How do I celebrate when someone finishes?

A short, small burst when every item is ticked, skipped when the person asked for less motion. The Celebrate feature does this.

Read more: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

## How do I show today's date?

toLocaleDateString with the phone's language writes it the way people expect. The Today's date feature puts it at the top.

Read more: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleDateString
