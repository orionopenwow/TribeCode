# Building a website in TribeCode: the guide for AI agents

You are an AI working on a project's website inside TribeCode. This file is everything you need: what the website is made of, which tools to call in which order, every step you may propose, how to make the result good, and what you must never do. Follow it even if you have no other context.

The parts between `gen` marks are written from the app's own data by `scripts/dev/ai-guides.js`, so the lists here are always the lists the app accepts.

## 1. What you are working on

A TribeCode website is **one design** per project: a JSON document of pages, each page a list of **sections** (also called blocks). A section has a `type` (hero, features, list …), a `variant` (its layout), and `props` (its words). One **theme** styles the whole site. People edit the same design in the website designer: a list of blocks on the left, the page in the middle, and Edit / Ideas / Style / Check tabs on the right. Your proposal arrives there as a suggested change with a before and an after.

```json
{
  "name": "Bean and Gone",
  "theme": { "preset": "paper", "mode": "light", "colors": { "bg": "#F1EADB", "ink": "#2B241C", "accent": "#B4532C" },
             "fonts": { "display": "Instrument Serif", "body": "System sans" }, "radius": 10, "space": "normal" },
  "pages": [
    { "id": "p1", "slug": "index", "title": "Home", "blocks": [
      { "id": "b1", "type": "hero", "variant": "split",
        "props": { "eyebrow": "Mill Street", "title": "Coffee roasted next door", "text": "Open every day from 7.",
                   "img": "", "alt": "", "buttons": [ { "label": "See the menu", "link": { "kind": "section", "to": "b2" } } ] } },
      { "id": "b2", "type": "list", "variant": "menu", "style": { "bg": "card" },
        "props": { "title": "Menu", "items": [ { "title": "Flat white", "meta": "$4", "text": "" } ] } }
    ] }
  ],
  "seo": { "title": "", "description": "" }
}
```

You never send this document. You send **steps** (ops), TribeCode applies them to the design, checks each one, and a person approves the result. The design is also written as real files into the project folder (`site/index.html`, `site/site.json` …) a moment after every save; those files are output, not the place to edit.

## 2. The tools, in order

| # | Call | Why |
| --- | --- | --- |
| 1 | `project_brief` | What this project is: vision, audience, tone, brand kit, what exists, facts, open tasks and comments, who approves. Read it before you write a word. |
| 2 | `site_catalog` | Every section type with its layouts and the words it holds, the looks, the font pairs, the illustrations, and every step with an example. (The same lists are below.) |
| 3 | `site_read` | The design with ids. `detail: "summary"` gives the structure only; `page` gives one page in full. You need the ids for your steps. |
| 4 | `site_view` | The page as a person reads it, in plain text. `device: "phone"` shows what a phone hides and how long things get. |
| 5 | `site_propose` with `dry_run: true` | Tries your steps on a copy and tells you what each did, what was skipped and why (with a corrected example), and what Check would say. Nothing is sent. |
| 6 | `site_propose` | Sends the proposal. A person sees before and after and approves; it is one Undo. |
| 7 | `site_check` with `proposed: true` | "Check my site" on your proposal: what to fix (links, forms, contrast, empty parts, example words) and tips. Fix what you can with more steps. |
| 8 | `site_comments` | What people asked to change, by section. Answer them in your steps. |

Rules of the tools:

- **No website yet?** Call `site_propose` with `start: { "template": "<id>" }` or `start: { "blank": true }` plus your steps. `site_catalog` lists the templates. Starting is a proposal too.
- **Ids of new things.** A section you add gets its id when the proposal is sent, and the answer lists every section with its id. Put everything a new section needs into its `add` step's `props`; to change it further, send the proposal, read the ids from the answer, and send more steps (they join the same proposal). Ids in a dry run's answer are examples only.
- **Your waiting proposal** is not the saved site yet. `site_read`, `site_view` and `site_check` take `proposed: true` to look at the site as it will be if your proposal is approved. Check that, not the old site.
- **More than 60 steps** do not fit one call. Call `site_propose` again: while your proposal is still waiting, new steps are added on top of it and the person still sees one request. `fresh: true` starts over instead.
- **Skipped steps** are named with the reason and an example. Fix them and send only the fixed ones.
- **Your access** is the access of the person who invited you, never more, and they can switch the website off for you. A refusal is an answer: do not look for another way in.

## 3. Sections and their layouts

<!-- gen:site:blocks -->
| type | What it is | Layouts (variant) | Words it holds (props) |
| --- | --- | --- | --- |
| `hero` | Hero | center, split, minimal, accent, cover | eyebrow, title, text, img, alt, shape, buttons[label] |
| `features` | Features | grid, list, stats, alternating, icons, ticks | title, items[title, text] |
| `gallery` | Gallery | grid, masonry, strip | title, items[img, alt, caption] |
| `pricing` | Pricing | cards, table | title, note, plans[name, price, per, features, button] |
| `testimonials` | Testimonials | cards, quotes, spotlight | title, items[quote, name, role] |
| `faq` | FAQ | list, columns | title, items[q, a] |
| `team` | Team | grid, list | title, items[name, role, img, alt] |
| `links` | Links (link in bio) | stack, cards, pills | name, bio, img, alt, shape, items[label, note], socials[words] |
| `list` | List (menu, dates, episodes) | rows, cards, menu | title, items[title, meta, text] |
| `contact` | Contact form | form, simple | title, text, email, action, button |
| `embed` | Video / embed | wide, inline | title, url, caption |
| `text` | Text | plain, two, highlight | title, text |
| `footer` | Footer | simple, columns, minimal | text, links[words] |
| `newsletter` | Newsletter | inline, card | title, text, action, button |
| `cta` | Call to action | simple, split, accent | title, text, buttons[label] |
| `stats` | Stats | grid, bar, big | title, items[value, label] |
| `logos` | Logo cloud | row, grid | title, items[name, img, alt] |
| `banner` | Banner | bar, ribbon | text, button{label} |
| `divider` | Divider | line, space, dots |  |
| `image` | Image | wide, side, framed | title, text, img, alt, shape |
| `steps` | Steps (how it works) | row, stack | title, items[title, text] |
| `info` | Visit us (address, hours, phone) | columns, card | title, items[label, text], button{label} |
| `go` | Send visitors on (redirect) | card, plain | title, text, to, wait, button |
| `timeline` | Timeline (story, experience) | line, cards | title, items[when, title, text] |
<!-- /gen -->

`props` in an `add` step may only use the keys in the last column, with the same kind of value (words stay words, lists stay lists). Pictures (`img`) cannot be set by you.

## 4. Looks, fonts, illustrations

A look sets colours, fonts and corners at once (`theme`). `palette` takes only its colours. Every look has a light and a dark version (`mode`).

<!-- gen:site:looks -->
| preset | Name | Mode | Accent | Fonts | Corners |
| --- | --- | --- | --- | --- | --- |
| `paper` | Paper | light | #B4532C | Instrument Serif + System sans | 10 |
| `swiss` | Swiss | light | #E2361B | Space Grotesk + Inter | 0 |
| `editorial` | Editorial | light | #8C3B22 | Fraunces + Inter | 4 |
| `terminal` | Terminal | dark | #5BE37D | JetBrains Mono + JetBrains Mono | 2 |
| `playful` | Playful | light | #FF5A4E | Bricolage Grotesque + Inter | 18 |
| `minimal` | Minimal | light | #2C5BE0 | Inter + Inter | 8 |
| `bold` | Bold | dark | #F7D13D | Bricolage Grotesque + Inter | 0 |
| `soft` | Soft | light | #7A5CCB | Fraunces + Inter | 16 |
| `night` | Dark Minimal | dark | #22C55E | Space Grotesk + Inter | 8 |
| `ivory` | Ivory | light | #4F46E5 | Space Grotesk + Inter | 10 |
| `clean` | Clean | light | #1C7ED6 | Inter + Inter | 8 |
| `sand` | Sand | light | #B45309 | Bricolage Grotesque + Inter | 10 |
| `amber` | Amber | dark | #E8A838 | Bricolage Grotesque + Inter | 6 |
| `ocean` | Ocean | dark | #60A5FA | Space Grotesk + Inter | 8 |
| `rose` | Rosé | dark | #F472B6 | Fraunces + Inter | 12 |
| `haze` | Purple Haze | dark | #A78BFA | Space Grotesk + Inter | 10 |
| `slate` | Slate | dark | #06B6D4 | Space Grotesk + Inter | 6 |
| `forest` | Forest | dark | #10B981 | Inter + Inter | 8 |
<!-- /gen -->

Font pairs (`fonts`): 
<!-- gen:site:fonts -->
`classic` (Fraunces + Inter), `editorial` (Instrument Serif + Inter), `modern` (Space Grotesk + Inter), `loud` (Bricolage Grotesque + Inter), `plain` (Inter), `code` (JetBrains Mono), `pixel` (Silkscreen + Inter), `book` (Fraunces + System serif), `elegant` (DM Serif Display + Inter), `friendly` (Outfit + Inter), `playfair` (Playfair Display + Lato), `lora` (Lora + Karla), `merriweather` (Merriweather + Work Sans), `baskerville` (Libre Baskerville + Raleway), `cormorant` (Cormorant Garamond + Montserrat), `garamond` (EB Garamond + Figtree), `crimson` (Crimson Pro + IBM Plex Sans), `spectral` (Spectral + Manrope), `sourceserif` (Source Serif 4 + Public Sans), `bitter` (Bitter + Chivo), `zilla` (Zilla Slab + Hanken Grotesk), `arvo` (Arvo + Lato), `abril` (Abril Fatface + Poppins), `alfaslab` (Alfa Slab One + Rubik), `bebas` (Bebas Neue + DM Sans), `anton` (Anton + Barlow), `oswald` (Oswald + Source Sans 3), `archivo` (Archivo Black + Archivo), `jakarta` (Plus Jakarta Sans), `manrope` (Manrope + Inter), `plex` (IBM Plex Sans + IBM Plex Serif), `plexmono` (IBM Plex Mono + IBM Plex Sans), `spacemono` (Space Mono + IBM Plex Sans), `firacode` (Fira Code + Fira Sans), `rubik` (Rubik + Karla), `nunito` (Nunito), `quicksand` (Quicksand + Nunito), `poppins` (Poppins + Inter), `montserrat` (Montserrat + Merriweather), `raleway` (Raleway + Lora), `josefin` (Josefin Sans + Lato), `syne` (Syne + Inter), `sora` (Sora + DM Sans), `lexend` (Lexend), `unbounded` (Unbounded + Figtree), `righteous` (Righteous + Nunito), `pacifico` (Pacifico + Quicksand), `caveat` (Caveat + Karla), `lobster` (Lobster + Lato), `arcade` (Press Start 2P + Space Mono), `terminal` (VT323 + IBM Plex Mono), `epilogue` (Epilogue + Inter), `youngserif` (Young Serif + Instrument Sans), `gloock` (Gloock + Hanken Grotesk), `bodoni` (Bodoni Moda + Figtree), `cinzel` (Cinzel + Lato), `comfortaa` (Comfortaa + Nunito), `fredoka` (Fredoka + Nunito), `atkinson` (Atkinson Hyperlegible), `literata` (Literata), `newsreader` (Newsreader + Inter), `schibsted` (Schibsted Grotesk + Source Serif 4), `shrikhand` (Shrikhand + Rubik), `monoton` (Monoton + Barlow), `kalam` (Kalam + Karla), `redhat` (Red Hat Display + Red Hat Text), `baloo` (Baloo 2 + Nunito), `librefranklin` (Libre Franklin + Libre Baskerville)
<!-- /gen -->

Illustrations for empty picture slots (`illustration`), drawn in the site's own colours: 
<!-- gen:site:pictures -->
`hills` (hills and sun), `cafe` (coffee cup), `desk` (desk and laptop), `shop` (shop front), `phone` (phone app), `people` (two people), `rocket` (rocket), `stage` (stage and mic)
<!-- /gen -->

## 5. The steps (ops)

Each step is `{ "op": …, … }`. `block` is always a section id from `site_read`. `path` names words inside a section: `title`, `text`, `items.0.title`, `buttons.1.label`, `plans.0.price`.

<!-- gen:site:steps -->
- `add`: Add a section. props are words only and must use the keys that section has (site_catalog lists them).
  `{"op":"add","type":"list","variant":"menu","after":"<block id>","props":{"title":"Menu","items":[{"title":"Flat white","meta":"$4","text":"Double shot, steamed milk"}]}}`
- `text`: Change words. path is a key of the section (title, text, items.0.title, buttons.0.label, plans.1.price).
  `{"op":"text","block":"<block id>","path":"title","value":"Coffee roasted on Mill Street"}`
- `variant`: Change a section's layout to another of its own variants.
  `{"op":"variant","block":"<block id>","variant":"split"}`
- `style`: A section's background ("" plain, card, accent, ink) and spacing ("" normal, s tight, l roomy).
  `{"op":"style","block":"<block id>","bg":"card","pad":"l"}`
- `move`: Move a section: up, down, top, bottom or a place number from 0.
  `{"op":"move","block":"<block id>","to":"up"}`
- `remove`: Take a section out. Say why in the note.
  `{"op":"remove","block":"<block id>"}`
- `link`: Point a button or entry somewhere. path is the button (buttons.0, button, items.2); kind is page, section, url (https only) or email.
  `{"op":"link","block":"<block id>","path":"buttons.0","kind":"section","to":"<block id of the target>"}`
- `item`: Entries of a list: do is add, dup, del, up or down; path is the list (items, plans, buttons), i the entry.
  `{"op":"item","block":"<block id>","path":"items","i":0,"do":"add"}`
- `illustration`: Fill an empty picture slot with a built-in drawing in the site's colours. path "" for the section's own picture, items.1 for an entry's.
  `{"op":"illustration","block":"<block id>","path":"","name":"cafe"}`
- `alt`: Describe a picture for people who cannot see it.
  `{"op":"alt","block":"<block id>","path":"","value":"The counter at Bean and Gone with the espresso machine"}`
- `show`: Hide a section (or one part of it, with path) on some screen sizes: phone, tablet, desktop. hide "" shows it everywhere.
  `{"op":"show","block":"<block id>","hide":"phone"}`
- `estyle`: One element inside a section: sz s|l|xl, col accent|muted|ink, al left|center|right, b and i true|false.
  `{"op":"estyle","block":"<block id>","path":"title","set":{"sz":"l","al":"center"}}`
- `entrance`: A quiet entrance as the section scrolls in: fade, rise or "" for none.
  `{"op":"entrance","block":"<block id>","value":"fade"}`
- `theme`: The whole look at once: colours, fonts and corners of a named look.
  `{"op":"theme","preset":"paper"}`
- `palette`: Only the colours of a named look; fonts and corners stay.
  `{"op":"palette","preset":"sand"}`
- `accent`: The one main colour (buttons, links). It is adjusted until it reads on the background.
  `{"op":"accent","color":"#B4532C"}`
- `fonts`: A font pair: one display face for headings, one for reading.
  `{"op":"fonts","pair":"editorial"}`
- `mode`: The dark or the light version of the look.
  `{"op":"mode","value":"dark"}`
- `space`: Spacing for the whole site: compact, normal or roomy.
  `{"op":"space","value":"roomy"}`
- `radius`: Corner radius in pixels, 0 to 28.
  `{"op":"radius","value":6}`
- `buttons`: Button shape for the whole site: solid, outline, pill or soft.
  `{"op":"buttons","value":"pill"}`
- `page`: Add a page. Contact, About, Pricing and FAQ titles get fitting sections to start from.
  `{"op":"page","title":"Menu"}`
- `rename`: Rename a page (by its id, slug or title).
  `{"op":"rename","page":"About","title":"Our story"}`
- `name`: The site's name.
  `{"op":"name","value":"Bean and Gone"}`
- `seo`: The title and the sentence search results and link previews show (description up to about 155 characters).
  `{"op":"seo","title":"Bean and Gone · Coffee on Mill Street","description":"Small-batch coffee roasted on Mill Street. Open every day from 7."}`
<!-- /gen -->

A whole section in one step:

```json
{ "op": "add", "type": "info", "variant": "columns", "after": "b2",
  "props": { "title": "Visit us", "items": [
    { "label": "Address", "text": "12 Mill Street" }, { "label": "Hours", "text": "Every day, 7 to 4" } ] } }
```

## 6. How to make it good

### Start from the project

<!-- gen:site:start -->
- Read the project brief first. Decide in one sentence who visits this site and the one thing they should do there (book, buy, visit, sign up, write). Every section either helps that or goes.
- Pick the kind of site from the brief, then a recipe below. Change it to fit: a recipe is a starting order, not a template.
- At least one section must be something only this project has: its menu, its prices, its dates, its hours, its story, its numbers.
<!-- /gen -->

### Choose a layout that fits the kind of site

<!-- gen:site:recipes -->
| Kind of site | Sections, in order (type · layout) | Why |
| --- | --- | --- |
| A place people visit (café, shop, salon, studio) | hero · split → list · menu → info · columns → gallery · grid → testimonials · quotes → cta · accent → footer · columns | People want to know what you sell, when you are open and where you are. |
| A product or an app | hero · split → logos · row → features · alternating → steps · row → pricing · cards → faq · list → cta · accent → footer · columns | Say what it does, show it working, answer the price question. |
| A portfolio or a studio | hero · minimal → gallery · masonry → text · two → testimonials · spotlight → contact · simple → footer · minimal | The work is the page. Words stay short. |
| A service (trades, coaching, freelance) | hero · center → features · ticks → steps · stack → testimonials · cards → pricing · table → contact · form → footer · simple | Trust first, then how it works, then a way to ask. |
| An event, a band, a podcast | hero · cover → list · rows → embed · wide → newsletter · card → footer · simple | What, when, where, then a way to follow. |
| A cause or a community | hero · accent → stats · big → text · highlight → team · grid → cta · split → footer · columns | Why it matters, proof, who is behind it, how to join. |
| A person (résumé, about me) | hero · minimal → timeline · line → features · list → contact · simple → footer · minimal | Who, what they have done, how to reach them. |
| One link for a bio | links · stack | One screen, nothing to scroll past. |
<!-- /gen -->

### The craft

<!-- gen:site:good -->
**Layout**
- Five to eight sections on the home page. More is a second page (op page).
- No two neighbours with the same layout. Alternate: words beside a picture, then a list, then a band of colour.
- Use the layout that fits the content: a menu or dates are a list, not feature cards; numbers are stats; a story is text or a timeline.
- One hero per page. Other pages start with hero minimal.

**Type**
- One font pair for the whole site (op fonts). A serif display face for warm, crafted, food, editorial; a grotesk for products and tools; a loud face only for events and bold brands.
- The brand kit's fonts win when the brief has them.
- Hero title: 3 to 8 words that say what this is, in the project's own words. Hero text: one or two sentences. Section titles: 2 to 5 words.
- A paragraph is at most three sentences. Longer becomes a list, steps or an FAQ.
- Make at most one thing per section bigger or coloured (op estyle). Emphasis everywhere is emphasis nowhere.

**Spacing**
- Set the rhythm once (op space): roomy for few words and big pictures, compact for menus, prices and reference pages.
- Keep section spacing the same down the page. At most one section is tighter or roomier (op style, pad).
- Separate sections with background steps: plain, card, plain. One accent or ink band per page, usually the call to action. Never two loud bands in a row.

**Colour**
- One accent colour. Take it from the brand kit; with none, pick one that fits the trade and leave the rest to the look's neutrals.
- Words need a contrast of 4.5 to 1 on their background, the accent 3 to 1. site_check reports both.
- Choose the look (op theme) for the mood first, then set the accent. Dark looks suit evenings, music, games and tools; light looks suit food, shops, services and anything read in daylight.

**Pictures**
- You cannot upload pictures. Fill an empty picture slot with a built-in illustration (op illustration) or choose a layout that needs none (hero minimal, center or accent).
- Give every picture a description (op alt) that says what is in it.
- In your note, list the pictures the person should add (the shop front, the team, the product).

**Words**
- Write from the brief's facts: the real name, what it sells, where, when, for whom, in the brand kit's voice.
- A fact you do not have (a price, an address, opening hours, a quote) is never made up. Leave the section out, or write plainly what belongs there and name it in your note as something the person fills in.
- Buttons say what happens: "See the menu", "Book a table", "Write to us". Every button is linked (op link).
- No example words left behind. site_check lists sections that still have them.

**Phones**
- On a phone everything stacks into one column, so length is the cost. Lists of more than six entries, more than three price plans or a long hero text make a long scroll.
- Use pricing cards rather than a table when there are more than four rows. Avoid words longer than about 30 letters.
- Hide what is only decoration on phones (op show, hide "phone"). Never hide the way to contact, buy or visit.
- Read site_view with device "phone" before you finish.

**Access**
- Every picture has a description, every button says where it goes, every section has a title.
- Set the search title and description (op seo).
<!-- /gen -->

### What to avoid

<!-- gen:site:avoid -->
- The generic page: a centred hero, three feature cards, a call to action. If your plan is that, start again from the brief.
- Placeholder words: lorem ipsum, "Welcome to our website", "Your tagline here", the example words a new section comes with.
- Walls of text, and sections that repeat what the one above said.
- More than one accent colour, or a different background on every section.
- Invented testimonials, logos, numbers, prices, awards or team members.
- Buttons that go nowhere, forms that send nowhere, an empty gallery.
<!-- /gen -->

## 7. Before you say it is done

<!-- gen:site:checklist -->
- [ ] site_check returns no "fix" items you can fix (links, forms, descriptions, contrast, empty sections).
- [ ] No section has example words; no fact is invented; what is missing is named in the note.
- [ ] The first screen says what this is and has one clear button.
- [ ] site_view on "phone": nothing important is hidden, no list is endless.
- [ ] One accent colour, one font pair, an even spacing rhythm.
- [ ] The search title and description are set.
- [ ] Your note says in two sentences what you changed and why, then what the person should add.
<!-- /gen -->

Then tell the person, in plain words: what you proposed, where to approve it (Suggested changes in the website designer, or their inbox), and what only they can add (pictures, facts you did not have).

## 8. What you must never do

<!-- gen:site:never -->
- Publish, download or export the site. A person does that.
- Edit the files in the project folder's site/ directory while TribeCode is connected: they are written from the design and your edit would be lost or held back. Propose steps instead.
- Add scripts, trackers, embeds from addresses the person did not give, or your own CSS.
- Work in a project you were not asked about, or copy anything from another project.
- Invent facts about the project, or leave a made-up fact for the person to catch.
- Approve your own proposal, or propose again and again to get past a "no".
<!-- /gen -->

## 9. A worked example: a café site from nothing

1. `project_brief` says: "Bean and Gone, a small coffee roaster on Mill Street. Open every day 7 to 4." Brand accent `#B4532C`, voice "warm, short sentences". No address number, no prices.
2. Kind of site: a place people visit. Recipe: hero split → list menu → info → gallery → testimonials → cta → footer. No prices and no quotes are known, so the menu lists drinks without prices and testimonials are left out.
3. `site_propose` with `dry_run: true`:

```json
{ "start": { "blank": true }, "note": "A first site for Bean and Gone from the vision: what it is, the menu, where and when.",
  "ops": [
    { "op": "theme", "preset": "paper" }, { "op": "accent", "color": "#B4532C" }, { "op": "name", "value": "Bean and Gone" },
    { "op": "add", "type": "list", "variant": "menu", "props": { "title": "On the bar", "items": [ { "title": "Espresso", "meta": "", "text": "Our own roast" } ] } },
    { "op": "add", "type": "info", "variant": "columns", "props": { "title": "Find us", "items": [ { "label": "Where", "text": "Mill Street" }, { "label": "Hours", "text": "Every day, 7 to 4" } ] } },
    { "op": "seo", "title": "Bean and Gone · Coffee on Mill Street", "description": "A small coffee roaster on Mill Street. Open every day from 7 to 4." }
  ] }
```

4. Send it (without `dry_run`). The answer lists every section with its id. A second call (it adds to the same proposal) rewrites the hero with `text` steps, sets its layout with `variant`, links its button to the menu with `link`, fills its picture with `illustration`, and removes the starter sections that do not fit.
5. `site_check` with `proposed: true`: no "fix" left that you can fix. `site_view` with `proposed: true, device: "phone"`: the menu has six entries, nothing is hidden.
6. Tell the person: approve it under Suggested changes; add a photo of the shop, the street number and prices.
