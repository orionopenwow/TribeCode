# Website templates

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
