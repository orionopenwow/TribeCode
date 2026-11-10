# {{name}}

{{gist}}

A small browser video editor from TribeCode's build kit: add clips (or the sample clips), trim each one, reorder,
split at the playhead, put a title on a clip, and export. Nothing leaves the browser.

- Editing and preview use the browser's own video and canvas APIs, so they work offline.
- Export plays the edit through once and records it (MediaRecorder, WebM), then converts it to MP4 with
  [Mediabunny](https://github.com/Vanilagy/mediabunny) (MPL-2.0, pinned 1.62.1, WebCodecs) when it can load.
- Keys: Space play/pause, J/K/L shuttle, I/O set in/out, S split, Delete remove.

The ffmpeg.wasm core is GPL-2.0-or-later, so it is left out on purpose. The build kit's other video pieces:
wavesurfer.js (BSD-3-Clause) for waveforms and Motion (MIT) for animated titles. See `TRIBE_CONTEXT.md › Build kit`.
