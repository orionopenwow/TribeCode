# Designing a phone app in TribeCode: the guide for AI agents

You are an AI working on a project's phone app design inside TribeCode's App Creator. This file is everything you need: what the design is made of, which tools to call in which order, every step you may propose, how to make the result good, and what you must never do. Follow it even if you have no other context.

The parts between `gen` marks are written from the app's own data by `scripts/dev/ai-guides.js`, so the lists here are always the lists the app accepts.

## 1. What you are working on

An app is **one design** per project: a JSON document of **screens**, each a list of **parts** (blocks). A part has a `type` (header, list, button …), `props` (its words and example data) and `links` (where a tap goes). One **theme** styles every screen. People edit the same design in App Creator: screens on the left, the phone in the middle, the selection and Flint on the right, and they can play it as a prototype. It exports to a phone web app and an Expo project; a person does that.

```json
{
  "name": "Bean and Gone", "platform": "ios", "start": "home",
  "theme": { "accent": "#B4532C", "mode": "light", "radius": "soft", "font": "friendly", "density": "regular",
             "icons": "regular", "motion": "standard", "surface": "warm", "preset": "" },
  "screens": [
    { "id": "home", "name": "Home", "tab": true, "blocks": [
      { "id": "hea-1", "type": "header", "props": { "eyebrow": "Mill Street", "title": "Good morning", "sub": "Order ahead, skip the queue" }, "links": {} },
      { "id": "but-1", "type": "button", "props": { "label": "Start an order", "style": "primary", "icon": "coffee" },
        "links": { "": { "to": "menu", "how": "push" } } }
    ] },
    { "id": "menu", "name": "Menu", "blocks": [] }
  ]
}
```

A link's key is the path of the thing that is tapped: `""` is the part itself (a button), `items.2` is the third entry of a list or tab bar. `how` is the transition: `push` (a new screen slides in), `sheet` (slides up over the screen), `fade` (tabs), `morph` (the tapped thing grows into the next screen).

You never send this document. You send **steps** (ops); TribeCode checks each one, and a person approves the result. The app is also written as files into the project folder (`app-web/`, with `app-web/app-design.json`); those files are output, not the place to edit.

## 2. The tools, in order

| # | Call | Why |
| --- | --- | --- |
| 1 | `project_brief` | What this project is: vision, audience, tone, brand kit, what exists, facts, open tasks, who approves. Read it before you write a word. |
| 2 | `app_catalog` | Every part with the words it holds, the kits, looks, fonts, icons and pictures, the templates, and every step with an example. (The same lists are below.) |
| 3 | `app_read` | The design with ids. `detail: "summary"` gives the structure only; `screen` gives one screen in full. You need the ids for your steps. |
| 4 | `app_view` | Each screen as a person reads it, in plain text, with where every tap goes and which screens nothing leads to. |
| 5 | `app_propose` with `dry_run: true` | Tries your steps on a copy: what each did, what was skipped and why (with a corrected example), the new ids, and what the check would say. Nothing is sent. |
| 6 | `app_propose` | Sends the proposal. A person sees the app before and after and approves; it is one Undo. |
| 7 | `app_check` | What a careful designer would point out: buttons that go nowhere, screens nothing opens, empty parts, colour that does not read. Fix what you can and propose again. |

Rules of the tools:

- **No app yet?** Call `app_propose` with `start: { "template": "<id>" }` or `start: { "blank": true }` plus your steps. Starting is a proposal too.
- **Ids of new things.** A screen or part you add has no id until it exists. Run `dry_run`: its answer lists the screens and parts with their ids. Then send the steps that need them.
- **More than 60 steps** do not fit one call. Call `app_propose` again: while your proposal is still waiting, new steps are added on top of it and the person still sees one request. `fresh: true` starts over instead.
- **Skipped steps** are named with the reason and an example. Fix them and send only the fixed ones.
- **Your access** is the access of the person who invited you, never more, and they can switch designs off for you. A refusal is an answer: do not look for another way in.

## 3. Parts

<!-- gen:app:parts -->
| Group | Parts (type: what it is) |
| --- | --- |
| Navigation | `nav` top bar, `tabs` tab bar, `segmented` segmented control |
| Text | `header` big title, `text` paragraph, `quote` quote, `alert` notice, `label` section label |
| Content | `list` list, `cards` card row, `card` feature card, `settings` settings rows, `checklist` checklist, `grid` tile grid, `accordion` questions, `kanban` board columns |
| Input | `form` form, `search` search and chips, `button` button, `calendar` day and time picker, `toggles` switch rows, `slider` slider, `stepper` number stepper, `tags` tags, `keypad` number pad, `swatches` colour picker |
| Social | `chat` chat, `feed` feed post, `profile` profile header, `rating` rating, `stories` story circles, `contact` contact card, `comments` comments, `notice` notification card, `poll` poll |
| Flows | `onboarding` welcome pages, `signin` sign in, `empty` empty state, `paywall` paywall layout, `steps` steps, `otp` code boxes |
| Data | `chart` chart, `stats` stat tiles, `timer` timer, `progress` progress bar, `weather` weather card, `countdown` countdown, `rings` activity rings, `table` table |
| Media | `player` media player, `map` map, `image` picture, `carousel` picture carousel, `voice` voice note, `video` video player, `hero` big picture header |
| Commerce | `product` product card, `receipt` receipt, `tracker` order tracker, `wallet` card picture, `coupon` coupon |
<!-- /gen -->

`app_catalog` gives the words each part holds (its `props`). A part is added with example content; change it with `text` steps.

## 4. Kits: ready-made screens and flows

A kit adds one or more finished screens (`{ "op": "kit", "kit": "settings" }`). Use one before you build a screen by hand, then rewrite its words for this project.

<!-- gen:app:kits -->
`settings`, `onboarding`, `paywall`, `profile`, `signin`, `chat`, `shop`, `charts`, `empty`, `player`, `search`, `notifications`, `checkout`, `detail`, `feed`, `calendar`, `timer`, `map`, `help`, `about`, `leaderboard`, `achievements`, `invite`, `permissions`, `order-tracking`, `product-page`, `reviews`, `verify-code`, `send-money`, `my-cards`, `weather`, `activity`, `countdown`, `poll`, `stories`, `voice-notes`, `lesson`, `board`, `coupon`, `interests`, `booking-details`, `help-center`, `offline`, `settings-notify`, `theme-picker`, `notifications2`, `event-page`, `goal-setup`, `team-contacts`, `faq`, `whats-new`
<!-- /gen -->

## 5. Looks, fonts, pictures

A look (`preset`) sets accent, mode, type, corners, spacing, surface, motion and icon weight at once. Single controls are changed with `theme`.

<!-- gen:app:looks -->
Light: `ember`, `meadow`, `harbor`, `paper`, `bloom`, `citrus`, `lavender`, `slate`, `terracotta`, `lagoon`, `sunbeam`, `mono`, `coral`, `mint`, `cobalt`, `rosewater`, `orchard`, `glacier`, `studio`, `playground`, `zen`, `candy`, `sandstone`, `ledger`, `gallery`, `nursery`, `clinic`, `festival`, `picnic`, `library`, `pixel-day`, `fieldnotes`, `pop`, `system-ios`

Dark: `campfire`, `forest`, `midnight`, `ink`, `velvet`, `arcade`, `dusk`, `graphite`, `espresso`, `deepsea`, `noir`, `neon`, `ember-pro`, `cinema`, `stormy`, `retro`, `aurora`, `sport`, `bank`, `blueprint`, `lunar`, `system-dark`
<!-- /gen -->

Fonts (`theme`, `font`): 
<!-- gen:app:fonts -->
`system` (System), `clean` (Clean (Inter)), `friendly` (Friendly (Outfit + Inter)), `bold` (Bold (Bricolage Grotesque + Inter)), `tech` (Tech (Space Grotesk + Inter)), `editorial` (Editorial (Fraunces + Inter)), `elegant` (Elegant (DM Serif Display + Inter)), `classic` (Classic (Instrument Serif + Inter)), `mono` (Mono (JetBrains Mono + Inter)), `pixel` (Pixel (Silkscreen + JetBrains Mono)), `playfair` (Playfair Display + Lato), `lora` (Lora + Karla), `merriweather` (Merriweather + Work Sans), `baskerville` (Libre Baskerville + Raleway), `cormorant` (Cormorant Garamond + Montserrat), `garamond` (EB Garamond + Figtree), `crimson` (Crimson Pro + IBM Plex Sans), `spectral` (Spectral + Manrope), `sourceserif` (Source Serif 4 + Public Sans), `bitter` (Bitter + Chivo), `zilla` (Zilla Slab + Hanken Grotesk), `arvo` (Arvo + Lato), `abril` (Abril Fatface + Poppins), `alfaslab` (Alfa Slab One + Rubik), `bebas` (Bebas Neue + DM Sans), `anton` (Anton + Barlow), `oswald` (Oswald + Source Sans 3), `archivo` (Archivo Black + Archivo), `jakarta` (Plus Jakarta Sans), `manrope` (Manrope + Inter), `plex` (IBM Plex Sans + IBM Plex Serif), `plexmono` (IBM Plex Mono + IBM Plex Sans), `spacemono` (Space Mono + IBM Plex Sans), `firacode` (Fira Code + Fira Sans), `rubik` (Rubik + Karla), `nunito` (Nunito), `quicksand` (Quicksand + Nunito), `poppins` (Poppins + Inter), `montserrat` (Montserrat + Merriweather), `raleway` (Raleway + Lora), `josefin` (Josefin Sans + Lato), `syne` (Syne + Inter), `sora` (Sora + DM Sans), `lexend` (Lexend), `unbounded` (Unbounded + Figtree), `righteous` (Righteous + Nunito), `pacifico` (Pacifico + Quicksand), `caveat` (Caveat + Karla), `lobster` (Lobster + Lato), `arcade` (Press Start 2P + Space Mono), `terminal` (VT323 + IBM Plex Mono), `epilogue` (Epilogue + Inter), `youngserif` (Young Serif + Instrument Sans), `gloock` (Gloock + Hanken Grotesk), `bodoni` (Bodoni Moda + Figtree), `cinzel` (Cinzel + Lato), `comfortaa` (Comfortaa + Nunito), `fredoka` (Fredoka + Nunito), `atkinson` (Atkinson Hyperlegible), `literata` (Literata), `newsreader` (Newsreader + Inter), `schibsted` (Schibsted Grotesk + Source Serif 4), `shrikhand` (Shrikhand + Rubik), `monoton` (Monoton + Barlow), `kalam` (Kalam + Karla), `redhat` (Red Hat Display + Red Hat Text), `baloo` (Baloo 2 + Nunito), `librefranklin` (Libre Franklin + Libre Baskerville)
<!-- /gen -->

<!-- gen:app:pictures -->
Pictures (op illus): `sparkle`, `leaf`, `sun`, `moon`, `food`, `fish`, `soup`, `cake`, `wave`, `art`, `mountain`, `bag`, `coffee`, `book`, `dumbbell`, `music`, `lantern`, `flame`, `target`, `lock`, `heart`, `star`, `plane`, `city`, `paw`, `house`, `car`, `pill`, `code`, `camera`, `ticket`, `globe`, `baby`, `chart`, `plant`, `gift`, `game`, `bolt`, `chat`, `users`, `play`, `check`, `note`

Icons (op icon): `home`, `search`, `plus`, `user`, `users`, `settings`, `heart`, `chat`, `bell`, `cart`, `calendar`, `chart`, `check`, `play`, `pause`, `star`, `book`, `pin`, `clock`, `flame`, `leaf`, `dumbbell`, `wallet`, `music`, `image`, `back`, `chevron`, `more`, `close`, `lock`, `mail`, `gift`, `list`, `grid`, `sun`, `moon`, `bookmark`, `share`, `filter`, `camera`, `trophy`, `game`, `edit`, `trash`, `send`, `mic`, `globe`, `coffee`, `food`, `target`, `tag`, `bolt`, `sparkle`, `note`, `plane`, `house`, `ticket`, `soup`, `fish`, `mountain`, `car`, `wave`, `sliders`, `phone`, `cloud`
<!-- /gen -->

Templates (for `start`), by group:

<!-- gen:app:templates -->
- Health: `habits`, `workout`, `meditation`, `water`, `sleep`, `meds`, `running`
- Productivity: `notes`, `todo`, `planner`, `focus`, `kanban`, `journal`
- Food: `recipes`, `noodles`, `coffee`, `mealprep`
- Money: `budget`, `split`, `savings`, `subs`
- Social: `chat`, `social`, `events`, `bookclub`, `neighbors`
- Shopping: `shop`, `grocery`, `swap`, `drops`
- Business: `booking`, `crm`, `invoices`, `stock`
- Games: `gamemenu`, `puzzle`, `racing`, `party`
- Travel: `trip`, `hotel`, `cityguide`
- Learning: `flashcards`, `course`, `trivia`
- Creator tools: `podcast`, `music`, `creator`
- Family: `chores`, `baby`, `pets`
- Utilities: `weather`, `plants`, `parking`, `converter`
<!-- /gen -->

## 6. The steps (ops)

Each step is `{ "op": …, … }`. `block` is a part id and `screen` a screen id from `app_read`.

<!-- gen:app:steps -->
- `kit`: Add a ready-made screen or flow (settings, onboarding, profile …). The fastest way to a complete screen.
  `{"op":"kit","kit":"settings"}`
- `screen.add`: Add an empty screen.
  `{"op":"screen.add","name":"Menu"}`
- `screen.rename`: Rename a screen.
  `{"op":"screen.rename","screen":"<screen id>","name":"Today"}`
- `screen.move`: Reorder a screen (place number from 0).
  `{"op":"screen.move","screen":"<screen id>","to":1}`
- `start`: Which screen the app opens on.
  `{"op":"start","screen":"<screen id>"}`
- `block.add`: Add a part to a screen (at = place number; left out, it goes above the tab bar).
  `{"op":"block.add","screen":"<screen id>","type":"list"}`
- `block.move`: Move a part up (-1) or down (1).
  `{"op":"block.move","block":"<block id>","dir":-1}`
- `block.dup`: Copy a part.
  `{"op":"block.dup","block":"<block id>"}`
- `block.remove`: Take a part out. Say why in the note.
  `{"op":"block.remove","block":"<block id>"}`
- `text`: Change words. path is a key of the part that already holds words (title, sub, label, items.0.title).
  `{"op":"text","block":"<block id>","path":"title","value":"Good morning, Maya"}`
- `icon`: Change an icon (names: app_catalog).
  `{"op":"icon","block":"<block id>","path":"items.0.icon","value":"coffee"}`
- `illus`: Change a built-in picture (names: app_catalog).
  `{"op":"illus","block":"<block id>","path":"illus","value":"coffee"}`
- `item.add`: Entries of a list: item.add, item.dup, item.remove, item.up, item.down. path names the entry.
  `{"op":"item.add","block":"<block id>","path":"items.0"}`
- `item.dup`: Copy an entry.
  `{"op":"item.dup","block":"<block id>","path":"items.0"}`
- `item.remove`: Remove an entry.
  `{"op":"item.remove","block":"<block id>","path":"items.1"}`
- `item.up`: Move an entry up.
  `{"op":"item.up","block":"<block id>","path":"items.1"}`
- `item.down`: Move an entry down.
  `{"op":"item.down","block":"<block id>","path":"items.0"}`
- `link`: A tap goes to a screen. path "" for the part itself (a button), items.2 for one entry. how: push, sheet, fade or morph.
  `{"op":"link","block":"<block id>","path":"","to":"<screen id>","how":"push"}`
- `unlink`: Remove a link.
  `{"op":"unlink","block":"<block id>","path":""}`
- `tabbar`: Add a tab bar across the main screens.
  `{"op":"tabbar"}`
- `preset`: A whole named look: colour, mode, type, corners, spacing, motion.
  `{"op":"preset","id":"meadow"}`
- `theme`: Single controls of the look: accent, mode light|dark, radius sharp|soft|round|pill, font, density compact|regular|roomy, icons thin|regular|bold, motion calm|standard|snappy, surface neutral|warm|cool|tinted.
  `{"op":"theme","set":{"mode":"dark","accent":"#2F9E6E"}}`
- `rename`: The app's name.
  `{"op":"rename","name":"Bean and Gone"}`
<!-- /gen -->

## 7. How to make it good

### Start from the project

<!-- gen:app:start -->
- Read the project brief first. Say in one sentence what a person does with this app in their first minute. That is the first screen.
- Three to six screens make a believable app: where you land, the thing you do, the detail, something about you, settings. Add ready-made flows with op kit before you build a screen by hand.
- Every screen must be reachable from the first one, and every button must go somewhere (op link).
<!-- /gen -->

### Screens that work

<!-- gen:app:recipes -->
| Kind of screen | Parts, in order | Why |
| --- | --- | --- |
| Tracker (habits, fitness, money) | header → stats → checklist → chart → tabs | Today first, then history, then settings. |
| Shop or menu (café, store, booking) | header → search → cards → list → button → tabs | Browse, look closer, order. |
| Feed or community | nav → stories → feed → tabs | What is new, then a way to add to it. |
| Tool (timer, calculator, notes) | nav → timer → segmented → button | One job on one screen, big controls. |
| Settings screen | nav → settings → toggles → button | Grouped rows people already know. |
<!-- /gen -->

### The craft

<!-- gen:app:good -->
**Layout**
- One job per screen. A screen starts with a top bar or a big title, never both.
- One main button per screen, at the bottom, where a thumb reaches. Other actions are quiet.
- A tab bar has two to five tabs and only the screens people return to. Settings is a tab or sits behind the profile.
- Lists show three to six entries in a design. Put the most telling ones first.

**Type**
- Pick one font for the app (op theme, font). Rounded and friendly for family, food and health; clean for tools and money; bold for games and events.
- Titles are two to four words. Row labels are one line. Nothing a thumb must scroll sideways to read.

**Spacing**
- Choose density once (op theme, density): roomy for calm and few items, compact for data and lists.
- Keep the same corners everywhere (radius). Mixed corners look unfinished.

**Colour**
- One accent, from the brand kit when there is one. It marks what can be tapped and what is on.
- Dark mode is op theme { set: { mode: "dark" } }: one step changes every screen. Check the accent still reads; brighten it if not.
- Start from a named look (op preset) that fits the mood, then set the accent.

**Pictures**
- You cannot upload pictures. Use the built-in pictures and icons (op illus, op icon) and name what the person should replace.
- Icons in one row of a list come from the same family of meaning: all food, all actions.

**Words**
- Fill screens with data that fits this project: its own products, names and numbers from the brief, never "Item 1" or "Lorem".
- Example people and amounts must look like examples (Maya, $4.50), not like real customers of the project.
- Buttons say what happens: "Add to order", "Start timer".

**Flows**
- Lists and cards open a detail screen (how: push). Short tasks open a sheet (how: sheet). Tabs fade.
- Settings needs a way in (a tab, or a row or icon on the profile) and a way back (a top bar).
- Paywall, sign-in and checkout screens are drawings. Never claim a payment or an account works.

**Access**
- Tap targets are rows and buttons, not single words. Text on the accent must read (contrast 4.5 to 1).
<!-- /gen -->

### What to avoid

<!-- gen:app:avoid -->
- A screen nothing leads to, or a button that goes nowhere. app_check lists both.
- Ten parts on one screen. Split it.
- A tab bar with one tab, or with more than five.
- Placeholder data ("Title", "Item", "Lorem ipsum") and parts left exactly as they were added.
- Changing the look screen by screen. The look is one setting for the whole app.
<!-- /gen -->

## 8. Before you say it is done

<!-- gen:app:checklist -->
- [ ] app_check returns nothing you can fix: every screen is reachable, every button goes somewhere, no part is empty.
- [ ] The first screen (start) is the one a new person should see.
- [ ] Words and example data fit the project; nothing claims payments or sign-in work.
- [ ] One accent, one font, one density; dark mode still reads if you switched it.
- [ ] Your note says what you changed and why, then what the person should add or decide.
<!-- /gen -->

Then tell the person, in plain words: what you proposed, where to approve it (Requests in App Creator, or their inbox), and what only they can do (pictures, the iPhone or Android look, working features, export).

## 9. What you must never do

<!-- gen:app:never -->
- Export, publish or build the app. A person does that.
- Remove screens (you cannot), switch between the iPhone and Android look, or add working features: a person does those in App Creator.
- Edit the files in the project folder's app-web/ directory while TribeCode is connected: they are written from the design.
- Work in a project you were not asked about, or copy anything from another project.
- Invent facts about the project, real-looking customers or prices nobody gave you.
- Approve your own proposal.
<!-- /gen -->

## 10. A worked example: a settings screen and dark mode

1. `project_brief`, then `app_read` with `detail: "summary"`: three screens, a tab bar on Home (`tab-1`) with Home and Orders, light mode, accent `#B4532C`.
2. `app_propose` with `dry_run: true`:

```json
{ "note": "Adds a Settings screen from the kit and switches the app to dark mode.",
  "ops": [ { "op": "kit", "kit": "settings" }, { "op": "theme", "set": { "mode": "dark" } } ] }
```

3. The answer lists the new screen (`settings`) and its parts. The kit made Settings a tab, so it is reachable. Its rows still say "Jordan" and "jordan@example.com": rewrite the ones this project would not have with `text` steps (`items.0.value`), and remove a group that does not apply with `block.remove`.
4. `app_check`: every screen is reachable; the accent still reads on the dark background. If it did not: `{ "op": "theme", "set": { "accent": "#E08A5B" } }`.
5. Send without `dry_run`. Tell the person: approve it under Requests; the Dark mode row is a drawing of a switch, and a working light and dark switch is a feature they add in App Creator.
