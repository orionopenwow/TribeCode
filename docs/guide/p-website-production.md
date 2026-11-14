# Make a website: Production

A checklist for sites that carry real traffic, a brand or sales. Copy it into a doc and tick it off per release.

## Content and structure

- [ ] Every page has a unique title (under 60 characters) and a description (under 160)
- [ ] One H1 per page, headings in order, no skipped levels
- [ ] A share picture (1200 x 630) and a favicon are set
- [ ] A custom "not found" page links back home
- [ ] Privacy and terms pages exist if you collect anything

## Performance budget

- [ ] First screen under 200 KB of pictures; whole page under 1.5 MB
- [ ] Pictures sized to their slot, saved as WebP or AVIF, lazy loaded below the first screen
- [ ] No more than two font families, four weights in total
- [ ] Largest element on screen in under 2.5 seconds on a mid-range phone
- [ ] Layout does not jump while loading (set width and height on pictures)

## Accessibility

- [ ] Text contrast of at least 4.5 to 1 (3 to 1 for large text)
- [ ] Every picture has a description, or is marked as decoration
- [ ] Everything works with the keyboard alone, with a visible focus ring
- [ ] Tap targets at least 44 px; forms have labels and clear errors
- [ ] Motion respects the "reduce motion" setting

## Release pipeline

- [ ] Changes are tasks with an owner and a reviewer
- [ ] Review on the preview at 390, 768 and 1280 px wide
- [ ] Check my site is clean; Publish's safety check passes
- [ ] Version noted with what changed; the last good version is known for rollback
- [ ] Links, forms and the buy flow tested on the live link after publishing

## Roles

Owner (decides), Writer, Designer, Builder, Reviewer. One person can hold several, but the reviewer should not be the builder.
