# The design library

One place to find everything that makes a project look and sound like itself, with the licence and source of each item. Open it from Files › Assets (Design library), from Flint ("open the design library", "show me the icons in the library", "play a click sound"), or from the Library buttons in the website designer (Style › Brand kit), App Creator (Look) and Motion Studio (Edit). Code: `app/ui/assetlib.js`, `app/ui/assetlib-data.js`, `app/ui/assetlib.css`.

## What is in it

| Kind | Count | Where it lives | Licence |
|---|---|---|---|
| Colour palettes | 56 (+24 from the shelf's four colour packs) | `assetlib-data.js` | CC0, made for TribeCode |
| UI sounds | 52 | `assetlib-data.js`, drawn with WebAudio, no files | CC0, made for TribeCode |
| Icons | 153 | website designer (a Lucide subset, ISC) and App Creator (drawn for TribeCode) | ISC / CC0 |
| Font pairs | 10 | the website designer's pairs of the OFL fonts TribeCode ships | OFL-1.1 |
| Pictures | 51 | website designer and App Creator illustrations | CC0 |
| Motion feels | 54 | Motion Studio | CC0 |
| Moving backgrounds | 55 | `app/ui/sitefx/` (eight are ports of ThreeUI Community by Meng To, MIT) | MIT |
| App Creator parts | 61 | `appcreator-core.js` + `appcreator-parts.js` | CC0 |
| App Creator ready-made screens | 51 | `appcreator-data.js`, `appcreator-more.js`, `appcreator-parts.js` | CC0 |
| Website sections | 63 | the website designer's section layouts | CC0 |

Only CC0, MIT, ISC, Apache-2.0, BSD, OFL-1.1 and CC-BY-4.0 (with credit) are accepted, also for shelf packs. Files that come from outside (3D models, music, big icon sets) stay in the Assets panel (`assets.js`), which links here.

## How choices are applied

Colours and fonts go into the project's brand kit (`brandkit.js`, `GET|PUT /api/projects/:id/brand`). The website designer, App Creator, Motion Studio and the Launch kit already read the brand kit, so one pick changes the look everywhere. The buttons inside App Creator and Motion Studio also apply the palette to the open design straight away.

## Shelf packs

An add-on shelf item of kind `asset-pack` with a `lib` list (`[{ kind, id, name, tags, license, source, palette? }]`) installs into the library on this device (`TribeAssetLib.installPack`). The four colour packs: pastel, dark mode, earth tones, brights.

## Suggestions

The library registers a `library` provider with the tribe's suggestions: a brand colour close to a named palette offers that whole palette, and a newly installed pack offers a look at what came with it.

## App Creator tap sounds

`theme.sound` (`click`, `tap`, `tick`, `pop`, `bubble`, `typing`) plays a short sound on every tap in the prototype and in the exported web app. Flint: "play a click sound on tap", "no tap sounds".
