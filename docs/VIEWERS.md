# Asset viewers

TribeCode can open 3D models and pixel art right where you see them, so nobody has to download a file to check it.

## Where they open

- **Docs & Files → Art & models**: the list right under the pinned repo hero (Docs on desktop, the Docs hub on phones).
  It shows the repo's GLB/glTF models, GIFs and PNG sprite sheets, models first. Press **View**.
- **Chat**: a shared `.glb`, `.gltf`, `.png` or `.gif` file gets a **View** button next to its download chip.
- **Anywhere else**: any element with `data-view-path="<repo path>"` (or `data-view-src` + `data-view-name`) opens a
  viewer, and code can call `TribeViewers.open({ path })` or `TribeViewers.open({ src, name })`.

On desktop a viewer is a modal. On phones it is a full-screen sheet with 44 px touch controls. Esc closes it.

## 3D model viewer (GLB / glTF)

- Drag to turn, scroll or pinch to zoom, double-click (double-tap) or the reset button to go back to the start view.
- A ground grid under the model, neutral lighting, the matte canvas background (#12151A).
- The info strip: file size, triangles, meshes, materials, animations. With animations: play / pause and a clip picker.
- three.js **0.170.0** (`GLTFLoader`, `OrbitControls`) comes from jsDelivr through an import map that is added only
  when the first 3D viewer opens. Nothing loads before that. Offline, the viewer says it could not load three.js.
- A `.gltf` with separate `.bin` and texture files works for repo files: they load from next to the model.

## Pixel-art animation viewer (PNG sheets, GIFs, Aseprite JSON)

- Plays the animation with a frames-per-second slider, previous / next, a frame scrubber, space to play or pause and
  the arrow keys to step. On phones, swipe the picture left or right to step.
- Zoom 1×, 2×, 4× or 8×, always nearest-neighbor (`image-rendering: pixelated`), on a checkerboard.
- **Onion skin** shows the previous frame faintly under the current one.
- The whole sheet is shown next to the player (under it on phones) with the frame grid. Click a frame to jump to it.
- Frames come from, in order:
  1. an **Aseprite or TexturePacker JSON** next to the PNG (`walk.png` + `walk.json`, frames as an array or a hash).
     Per-frame `duration`s and `frameTags` are used: pick a tag to play just that animation.
  2. otherwise a **grid**: square frames guessed from the image (a strip of `h × h` frames, or 64/48/32/24/16/8 px
     cells). Set the frame width and height, or the columns and rows, by hand. Empty cells at the end are dropped.
  3. a **GIF** is decoded frame by frame (its own delays) by a small built-in decoder.
- No libraries: plain canvas.

## Server and safety

`server/files.js`:

- `GET /api/files` lists the project repo's viewable assets (up to 300, models first).
- `GET /api/files/raw/<path>` sends a file's bytes to members of that project (`Authorization: Bearer` or `?token=`).
  Only asset types are served (`.glb` as `model/gltf-binary`, `.gltf`, `.bin`, `.png`, `.gif`, `.jpg`, `.webp`,
  `.ktx2`, `.json`), never dotfiles, dot folders, `node_modules` or key files, and paths can't leave the repo.
  Every answer has `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`.
- The viewers parse the bytes in the page (GLTFLoader, `Image`, the GIF decoder) and draw them on a canvas.
  File contents are never evaluated or shown as a document.

## Tests

`app/test/e2e_viewers.py` commits small fixtures (made by `app/test/fixtures/make_viewer_fixtures.py`: a GLB cube with
a "Spin" animation, a 4-frame 16×16 sheet, an Aseprite JSON sheet, a GIF) into a temporary repo and checks each viewer,
the info numbers, play / pause, zoom, the chat button, the phone sheet at 390 px and the server's refusals. The sandbox
can't reach the CDN, so the test serves the same pinned three.js from the npm registry tarball, and skips the 3D
render checks with a message if neither is reachable.
