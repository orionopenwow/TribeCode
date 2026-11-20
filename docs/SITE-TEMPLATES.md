# Website templates

> **site-templates2: fewer, better, different.** The website designer's gallery offers **25 templates**, each
> written by hand with its own opening, rhythm and type. The 61 it had before were measured (below): most were one
> layout in other colours. The 38 that are no longer offered stay loadable, so an older design opens exactly as before.

## The 25 the gallery offers

They live in `scripts/dev/site-curated.js` (one designer config each, with sample words for a clearly invented
business) and are built into `app/ui/sitetpl/<id>.json`, `catalog.json` and `thumbs/<id>.webp` by
`python3 scripts/dev/site-gallery.py`. All are original to TribeCode (MIT). Pictures are the flat scenes in
`sitecfg.js` (`ILLUS`), drawn in each site's own colours.

| Template | id | Kind | Opens with | Type | Then |
|---|---|---|---|---|---|
| Link in bio | `linkbio` | Link in bio | a photo and a stack of pill buttons | Outfit (round) | nothing else: one screen |
| Creator tiles | `creator` | Link in bio | a bento grid of link tiles | Bricolage Grotesque | one screen |
| Open-source project | `gh-project` | App or project | a claim beside an install card | JetBrains Mono | why, steps, what's new |
| App download page | `app-download` | App or project | a band of colour with the phone on it | Outfit | ticks, a strip of screens, questions |
| Send people to my app | `app-redirect` | App or project | the card that sends visitors on | Bricolage Grotesque | (unchanged) |
| Product page | `saas` | App or project | centred claim over the real screen | Space Grotesk | bento tiles, what it doesn't do, prices |
| Indie game page | `gamepage` | App or project | key art edge to edge, title on it | Silkscreen (pixel) | facts bar, masonry shots, devlog |
| Docs or handbook | `docs` | App or project | side navigation, three pages | Space Grotesk | steps, definitions, questions |
| Coming soon | `comingsoon` | App or project | one centred card | Fraunces | what's coming, one signup |
| Local service | `service` | Business | a phone bar, then words beside a picture | Inter | ticks, a price table, where and when |
| Café or restaurant | `cafe` | Business | a picture across the top | Instrument Serif | a two-column menu, a map beside the hours |
| Menu card | `menu` | Business | the menu itself, like a printed card | DM Serif Display | courses, hours and booking |
| Store front | `merch` | Business | the products and their prices | Space Grotesk | delivery, about, order by email |
| Club or group | `club` | Business | words beside a round picture | Bricolage Grotesque | a timetable of meets, how to join |
| Nonprofit or cause | `nonprofit` | Business | the mission in very large type | Anton (condensed) | three big numbers, pictures and words in turn |
| Portfolio | `portfolio` | Portfolio | one long sentence in a serif | Instrument Serif | projects with pictures, one quote |
| Photography | `photography` | Portfolio | a mosaic of pictures | Inter | about, what you can ask for |
| Resume | `resume` | Portfolio | name beside a short profile | Fraunces | a timeline, skills, education |
| Personal letter | `letter` | Portfolio | a single column letter, signed | Fraunces + system serif | a few links |
| Band or musician | `band` | Portfolio | the name across a stage picture | Anton | dates as a list, records |
| Wedding or party | `wedding` | Event | an invitation card | DM Serif Display | the day as a timeline, travel, RSVP |
| Conference or meetup | `conference` | Event | the name huge, facts in a bar | Space Grotesk | programme by the hour, speakers, tickets, map |
| Class or course | `course` | Event | a claim beside the next-course card | Outfit | week by week, prices |
| Blog or magazine | `blog` | Blog | a magazine grid: the newest piece large | Fraunces | subscribe, who writes it |
| Podcast | `podcast` | Blog | the cover beside where to listen | JetBrains Mono | a log of episodes |

Blank is the seventh kind on the start screen and is not a template.

**Layouts added for them** (`app/ui/sitecfg.js`, each with a phone layout): hero `full` (a picture edge to edge with
the words on it), `card` (a centred card), `aside` (words beside a card of facts); links `bento`; features `bento`;
list `magazine` and `schedule`; gallery `mosaic` and `shop` (a price beside each caption); text `letter` (a drop cap
and a signature); info `map` (a picture of a map beside the hours); and `nav: 'side'` for the whole site. A wide
`list:menu` section sets its rows in two columns. A section with `props.h1` opens the page, so its heading is the h1.
Twenty more illustrations (map, plate, portrait, mountains, city, still life, app window, terminal, T-shirt, tote,
mug, framed print, flower arch, hall, garden beds, bikes, pixel night, notebook, show cover, van) and one more bundled
font, **Anton** (SIL OFL 1.1, from Fontsource), the condensed poster face.

**Sameness, measured** (`node scripts/dev/site-variety.js`; the "before" column was taken at v0.41.1: a signature is the opening composition plus the
sections after it, never colours or words):

| | Before (61) | After (25) |
|---|---|---|
| Opening compositions | 8 (43 of 61 were `hero:split` or `hero:minimal`) | 17 (none used more than three times) |
| Type characters | 6 (34 grotesk, 17 serif) | 7 (serif, grotesk, round, mono, condensed, sans, pixel) |
| Loosely alike (same opening, 60% the same kinds of section) | 20 pairs, 23 templates | 0 |
| The same first screen as another template | 43 templates in 13 groups | 4 templates in 2 groups |
| A headline over a row of feature cards | 15 | 0 |

`app/test/site_variety_test.js` keeps it that way: no two offered templates share a signature, at least 12 openings
and 6 type characters, every one renders at 1280 and 390 px with nothing sticking out, passes Check, exports with no
script, and carries no placeholder words.

**Retired templates.** `catalog.json` keeps an entry for each of the 38 with `retired: true` and `alias` (the closest
offered template). Their `<id>.json` files stay, without thumbnails and outside the offline shell. A new site asked
for by a retired id gets the alias (`templateCfg` in `sitedesigner.js`, `template()` in `server/sitedesign.js`); the
very file is still served with `GET /api/site-designer/template/<id>?exact=1`. A site someone already made carries its
own design and is not touched. Retired: the six `lb-*` link pages and everything imported (`sb-*`, `tt-*`, `h5-*`).
The sections below describe how those older templates were made.

---

## The older customizer (templates/sites)


> feat/site-v2: the website designer's gallery has **48 templates**: the 16 below and 32 imported open-source ones (end of this page), with thumbnails, categories, search, Peek and Use this. They load from `app/ui/sitetpl/` with no server, so they work with no tribe and offline.

Sixteen real website templates, each with its own look, in `templates/sites/<id>/`. Pick one from the gallery
(Website › Start from a template, the setup card's "Pick from 16 website templates", or Ctrl K › Website templates),
or just ask Flint: "make me a link in bio", "a merch store for Ember Socks", "a website for my bakery". No AI needed.

| Template | id | Look |
|---|---|---|
| Link in bio | `linkbio` | Four looks: Paper (serif), Night, Blocks (offset color cards), Terminal |
| Merch shop | `merch` | Swiss grid, big product photos, product dialog with sizes, cart drawer, checkout hand-off |
| Portfolio | `portfolio` | Editorial serif, numbered case studies, thin rules |
| Creator / streamer | `creator` | Dark, loud display type, a "next stream" ticker, schedule, videos |
| Band / musician | `band` | Gig poster: huge uppercase name, tour dates with tickets, records |
| Restaurant / café | `cafe` | Warm paper, printed-menu dotted leaders, hours, reservations |
| Local service | `service` | Plain and trustworthy: phone everywhere, prices in a table, real-reviews slot |
| Event / wedding RSVP | `wedding` | A printed invitation: timeline, travel, RSVP form |
| Podcast | `podcast` | List-first show log in a mono face, episodes with notes |
| Newsletter / blog | `blog` | A reading column (about 65 characters), post page with drop cap, subscribe box |
| Startup / app | `saas` | Leads with the real screen, says what it doesn't do yet, plans, changelog |
| Indie game page | `gamepage` | Pixel type, full-bleed art, press kit, devlog |
| Resume / personal | `resume` | One sheet that prints well |
| Nonprofit / donate | `nonprofit` | The mission set large, real numbers, ways to help, donate button |
| Photography gallery | `photography` | Dark masonry with a lightbox |
| Coming soon / waitlist | `comingsoon` | One split screen, countdown, waitlist form |

## In the website designer

Every template also opens in the website designer as a block config (`sitecfg.fromTemplate`, `GET /api/site-designer/template/:id`): its words, pictures (inlined), colors and fonts become blocks with variants you can change, wire and export (docs/WEBSITE.md › The website designer).

## Customize, by skill level

- **Easy**: a short form (name, words, links, photos, the main colors). The preview updates as you type.
- **Comfortable**: also looks (presets), fonts, every color, and sections to hide or reorder. "Edit on the page" opens
  the preview where Flint and the property sheet change anything else, free.
- **Pro**: also the files, with what each is for. Plain HTML, CSS and a little JavaScript; no build step.

Edits save to the site's `site.json` and re-render its pages as you go; Done saves a version (a git commit).

## How a template is made

Each folder has `site.json` (`meta` for the gallery, `form` for Easy mode, the content, `theme` with colors and fonts,
`presets`, `sections`), the pages, a `style.css`, small scripts where needed, and `img/` placeholders.
`templates/sites/_kit/site.js` (copied into every site) fills a page from its embedded data:

- `data-s="key"` for text, `data-s-attr="href:key"` for attributes (`href:mailto:email` adds the prefix),
- `<template data-s-for="list">…</template>` + items + `<!--/s-for-->` for repeated things (`{{field}}`,
  `{{#list}}…{{/list}}`, `{{^empty}}…{{/empty}}`, `{{@n}}` for the number),
- `<main data-s-sections>` with `<section data-section="id">` for order and on/off,
- `<style id="s-theme">` for the CSS variables, `<script type="application/json" id="site-data">` for the data.

`server/sitelib.js` does the same rendering on the HTML text, so the files in a repo are complete static pages that
work with JavaScript off. Rules for new templates: their own typography and layout (not TribeCode's matte look), no
stock AI phrasing ("elevate", "unleash", badge rows, emoji feature grids), specific human example copy for a clearly
invented business, accessible contrast and keyboard use, no sideways scroll at 390 px, and no fake payments, reviews or
form submissions (forms post to a link the owner sets, and say so until they do).

## Art and fonts

The placeholder pictures are original flat compositions made for TribeCode by `scripts/dev/site-art.js`. Fonts are
the SIL OFL 1.1 families in `app/ui/assets/site-fonts` (licenses copied into each site's `fonts/`). Thumbnails:
`node scripts/dev/site-thumbs.js [--sheet out.png] [--phone]`.

## The gallery and the imported open-source templates (feat/site-v2)

`app/ui/sitetpl/catalog.json` lists every template (id, title, category, summary, tags, source, license, thumb);
`app/ui/sitetpl/<id>.json` is each one as a designer config, `app/ui/sitetpl/thumbs/<id>.webp` its 480×360 thumbnail.
Rebuild with `python3 scripts/dev/site-gallery.py [--src /path/to/clones] [--only id,id] [--no-thumbs]`.

How an imported template is made: `app/ui/siteimport.js` reads the page in Chrome and turns each section into a block
(hero, features, gallery, pricing, stats, testimonials, team, list, contact, newsletter, cta, image, text, footer), keeping
the order, the headings, the button labels and the layout idea. Then the script (curation in
`scripts/dev/site-sources.json`):

- sets the template's own colors and a display font from our SIL OFL families (no web fonts are downloaded),
- replaces every photo with original flat art in those colors (no third-party images ship),
- rewrites the hero with plain example words and replaces lorem ipsum and "Bootstrap theme" copy with placeholder lines,
- adds a few blocks where a page was mostly scripts (blog post lists, a shop grid, an app's features),
- and where the conversion came out thin, the sections are written by hand after the original's layout (`replace` in the
  sources file: Small Business, Personal, Dimension, Eventually),
- and for CC BY sources sets `cfg.credit`, which the export prints in the footer: "Design based on <title> by HTML5 UP (CC BY 3.0)".

The same importer is in the designer: **Import HTML…** (gallery or Site panel) turns any page you pick into blocks.

| Template | id | Category | Source | License |
|---|---|---|---|---|
| Agency | `sb-agency` | Business | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-agency) | MIT |
| Business Casual | `sb-business-casual` | Food & drink | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-business-casual) | MIT |
| Business Frontpage | `sb-business-frontpage` | Business | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-business-frontpage) | MIT |
| Clean Blog | `sb-clean-blog` | Blog | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-clean-blog) | MIT |
| Coming Soon | `sb-coming-soon` | Coming soon | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-coming-soon) | MIT |
| Creative | `sb-creative` | Business | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-creative) | MIT |
| Freelancer | `sb-freelancer` | Portfolio | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-freelancer) | MIT |
| Grayscale | `sb-grayscale` | Startup | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-grayscale) | MIT |
| Landing Page | `sb-landing-page` | Startup | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-landing-page) | MIT |
| Modern Business | `sb-modern-business` | Business | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-modern-business) | MIT |
| New Age | `sb-new-age` | Startup | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-new-age) | MIT |
| One Page Wonder | `sb-one-page-wonder` | Startup | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-one-page-wonder) | MIT |
| Personal | `sb-personal` | Personal | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-personal) | MIT |
| Resume | `sb-resume` | Personal | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-resume) | MIT |
| Small Business | `sb-small-business` | Business | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-small-business) | MIT |
| Stylish Portfolio | `sb-stylish-portfolio` | Portfolio | [Start Bootstrap](https://github.com/StartBootstrap/startbootstrap-stylish-portfolio) | MIT |
| Tailwind Landing | `tt-landing-page` | Startup | [Tailwind Toolbox](https://github.com/tailwindtoolbox/Landing-Page) | MIT |
| App Landing | `tt-app-landing` | Startup | [Tailwind Toolbox](https://github.com/tailwindtoolbox/App-Landing-Page) | MIT |
| Ghostwind | `tt-ghostwind` | Blog | [Tailwind Toolbox](https://github.com/tailwindtoolbox/Ghostwind) | MIT |
| Minimal Blog | `tt-minimal-blog` | Blog | [Tailwind Toolbox](https://github.com/tailwindtoolbox/Minimal-Blog) | MIT |
| Nordic Store | `tt-nordic-store` | Shop | [Tailwind Toolbox](https://github.com/tailwindtoolbox/Nordic-Store) | MIT |
| Profile Card | `tt-profile-card` | Link in bio | [Tailwind Toolbox](https://github.com/tailwindtoolbox/Profile-Card) | MIT |
| Identity | `h5-identity` | Link in bio | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/identity) | CC BY 3.0 |
| Photon | `h5-photon` | Startup | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/photon) | CC BY 3.0 |
| Forty | `h5-forty` | Portfolio | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/forty) | CC BY 3.0 |
| Stellar | `h5-stellar` | Startup | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/stellar) | CC BY 3.0 |
| Dimension | `h5-dimension` | Personal | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/dimension) | CC BY 3.0 |
| Eventually | `h5-eventually` | Coming soon | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/eventually) | CC BY 3.0 |
| Miniport | `h5-miniport` | Portfolio | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/miniport) | CC BY 3.0 |
| Read Only | `h5-read-only` | Personal | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/read-only) | CC BY 3.0 |
| Massively | `h5-massively` | Blog | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/massively) | CC BY 3.0 |
| Landed | `h5-landed` | Startup | [HTML5 UP (AJ, @ajlkn)](https://html5up.net/landed) | CC BY 3.0 |

Licenses: Start Bootstrap and Tailwind Toolbox are MIT (their notices are in `NOTICE`); HTML5 UP is Creative Commons
Attribution 3.0 (credit in the footer of every export of those templates, and in `NOTICE`). Not imported: Cruip's free
templates (GPL-3.0, React/Next builds), and HTML5 UP pages whose layout depends on scripts.

## What kind of site first (p5-start)

Starting a website asks one question before the templates: what kind of site. The two main kinds are cards (Link in
bio; App or project page), the others a quiet row (Business or shop, Portfolio, Event, Blog or notes, Blank). A kind
shows its own templates, the best first and at most twelve, with **See all templates** for the whole gallery (search
and categories). Design › Website, the older Website templates, New site and Flint ("make a website", "make a page for
my app") all open this one screen; More › Templates opens it over a site with **Keep my design**.

- The kinds and the best-first order live in `app/ui/designflow-data.js` (`SITE_KINDS`, `SITE_PICKS`); every template
  in `app/ui/sitetpl/catalog.json` carries a `kind`, set by `scripts/dev/site-gallery.py` (`kind_of`).
- Nine templates were added as site types in `scripts/dev/site-types.json`: six link-in-bio pages (musician, shop,
  writer, coach, developer, artist), **GitHub project**, **App download page** and **Send people to my app**.
- **Send visitors on** (`go` in `app/ui/sitecfg.js`) is the section behind "Send people to my app": a heading, a line,
  where it goes shown in full, and a button. The address is fixed in the page, never read from the link someone
  opened, and must be `https://` or `http://` with a real host and no user name. The wait is 2 to 30 seconds. The
  `<meta http-equiv="refresh">` is written only into exported and published pages (`exportFiles`, `render(..., { go:
  true })`), so the editor, previews and change-request pictures never move. Flint: "send people to my app", "make a
  redirect to https://…".
- An App or project page fills in the project's GitHub address and latest version tag when the project's own folder
  has a GitHub `origin` (`gitFacts` in `server/sitedesign.js`: it reads `.git/config` and the tags, with no network
  and no token). With nothing known, the clear placeholder `github.com/you/your-project` stays.
- The design Plan (steps to tick beside a design) is switched off for now: `PLANS_ON` in `app/ui/designflow.js`.

Tests: `app/test/site_kinds_test.js` (no browser) and `app/test/e2e_site_kinds.py`.
