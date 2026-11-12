# Website templates

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
