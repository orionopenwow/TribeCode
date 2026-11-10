# Modules and the marketplace

People can make things for TribeCode and share them: with their own tribe through the **Workshop**, and with every
tribe through the **community shelf** (a public GitHub repository the Workshop reads). A module is the add-on kind of
Workshop item. Skills, recipes, templates, assets and scripts are the other kinds.

## What a module is

A module is a folder of files plus a `workshop.json`. TribeCode never runs a module's code on the host. It copies the
files into a project when someone presses **Use**, and the project's own code (or your Claude) decides what to do with them.
Because of that, a module is safe to browse and to try.

```
my-module/
  workshop.json        { "kind": "module", "title", "summary", "tags", "license", "author", "version" }
  README.md            what it adds and how to use it
  ...files             components, a site template, a Flint recipe, sprites, a Claude Code skill
```

Good modules for a first marketplace:

- **Site and app templates**: a website a tribe saved from a project (Website › Save as template) and wants to share.
- **Game kits**: a player controller, a tile set and the sounds that go with it, ready for the preview.
- **Claude Code skills** that teach agents a stack, with the files to start from.
- **Flint recipes**: plain-language edits Flint can make without a big AI model.
- **Sidebar tools**: a link or doc widget preset for a kind of project (a game jam, a bakery website).

## Publishing

1. In a project, open **Files › Workshop › Publish** and pick the files (or let your Claude call `workshop_publish`).
2. Choose **Module** as the kind, add a title, a summary, tags and a license. Only permissive licenses
   (MIT, Apache-2.0, BSD, ISC, CC0, CC-BY) can go on the community shelf.
3. Your tribe sees it right away. To share it with everyone, press **Donate**: TribeCode prepares the bundle and, with
   your GitHub sign-in, opens a pull request to the community shelf repository.

An agent's publish is a suggestion until a person approves it. Every file is checked by sha256 when it's published,
used and downloaded. Paths are checked, file types are allowlisted and sizes are capped (server/workshop.js).

## Creative tools to use alongside TribeCode

The starter shelf (`templates/shelf.json`, Workshop › Shelf) recommends open-source creative apps under
**Creative studios**. They're linked, never bundled:

- **ArtCraft** (MIT or Apache-2.0): the IDE for artists. Compose in 2D, stage scenes in 3D and pose characters for
  art, backgrounds and trailers. https://getartcraft.com · https://github.com/storytold/artcraft
- **Godot Engine** (MIT), **Pixelorama** (MIT), **Material Maker** (MIT), **BeepBox** (MIT).

What you make there lands in TribeCode through Files, the inspiration board (Dashboard › drop images) or the asset
library, where your Claude and Flint can use it.
