# Link reader, voice notes and summaries (plan)

Status: planned, not built. Written 2026-11-08.

Goal: drop any link (TikTok, Instagram, YouTube, a web page) or record a voice note, and TribeCode turns it into **data the tribe can use**: a clean transcript or article, a short summary, key points, action items and tags, saved in Files and readable by Flint and every agent. It should feel like Notion's AI meeting notes: record or paste, get tidy notes back, edit them.

## Principles

- **Local first.** Transcribing and summarizing run on the host (or in the browser) by default. Cloud AI is optional and uses the tribe's own keys.
- **Respect each site's rules.** Use official, public endpoints (oEmbed, published captions) by default. Anything that downloads media from a platform is an opt-in tool the host installs, with a clear note that they are responsible for following that site's terms. Never log in to someone's account, never bypass paywalls or private content.
- **Everything becomes data.** Each capture is one Markdown note plus a JSON sidecar, so people read it and agents query it.
- **No training needed.** "Getting smarter" means better recipes, templates and local models, plus Flint learning which summaries people keep. Nothing is trained on users' content.

## What a capture looks like

`Files/captures/2026-11-08-title-slug.md` with front matter, and the same fields in `.json`:

```
source:    https://www.youtube.com/watch?v=…   (or "voice note", or a web page)
kind:      video | short | post | article | voice
title, author, published, duration, thumbnail (cached locally)
transcript: timestamped lines (video, voice) or clean article text (web)
summary:   3–5 sentences
points:    5–8 bullets
actions:   "Maya: record the creak sound" style items, each one tap to make a task
tags:      from project sense (game, sound, level design…)
links:     where it was shared (chat message id), who added it
```

Captures show as a card in chat (title, thumbnail, 3-line summary, "Open notes", "Make tasks") and in Files under **Captures**.

## Sources and how each is read

| Source | Default (no setup) | Optional, host installs |
|---|---|---|
| Any web page | Server fetch through the existing safe fetcher (server/embeds.js: SSRF checks, size and time caps), then article extraction with a port of Mozilla Readability (Apache-2.0) | — |
| YouTube | oEmbed for title/author/thumbnail; published captions when the video has them | yt-dlp (Unlicense) to fetch captions, or audio for local transcription when there are none |
| TikTok | Official oEmbed (`https://www.tiktok.com/oembed?url=…`): title, author, thumbnail, embed | yt-dlp for audio, then local transcription |
| Instagram, Threads, Facebook | Meta oEmbed (tokenless since June 2026, public posts only): embed and basic fields | yt-dlp for public video audio, then local transcription |
| Voice notes (ours) | Already recorded in chat; transcribed locally | — |
| Uploaded audio or video files | Local transcription | — |

When only metadata is available (no captions, no optional tool), the card says so and offers "Transcribe with the optional tool" (host) or "Paste the transcript".

## Transcription

1. **Browser speech** (exists today for captions) for live voice notes.
2. **whisper.cpp** (MIT) on the host as an optional download: model sizes picked by the download manager (tiny/base for laptops, small/medium with a GPU). Timestamped segments, language detection.
3. **Cloud** (optional): the tribe's own OpenAI, Gemini or other key through server/llm.js.

Long audio is split into chunks; each chunk is transcribed and merged with timestamps.

## Summaries without heavy AI

A layered summarizer, cheapest first (same routing idea as docs/STUDIO-SCOPING.md):

1. **Deterministic** (no model): clean the text, split into sentences, score by position, keyword weight (TF-IDF against the project's own docs) and cue phrases ("we need", "next", "decided", "todo"), pick the top sentences for the summary, turn imperative and "X will…" sentences into action items, tag with project-sense keywords. Works offline, instantly.
2. **Small local model** (Qwen via Ollama or the built-in browser model): rewrite the summary in plain words, merge duplicate points, assign actions to people mentioned. Strict prompt: short, factual, no hype.
3. **Your AI or a cloud key**: for long videos or when people ask "summarize this better".

Each layer keeps the transcript as the source of truth; summaries link back to timestamps.

## Voice and notes like Notion

- **Record** from the composer (exists) or a new **Notes › Record** button: pause/resume, a live transcript while recording (browser speech), a final transcript from whisper.cpp when available.
- **AI notes** appear under the recording: Summary · Key points · Action items · Full transcript (collapsible). Everything is editable like a normal doc (the existing doc editor), and edits are kept.
- **Huddles** already produce meeting notes; they move to the same capture format.
- **Templates**: Meeting, Idea, Playtest feedback, Interview, Lecture. Each template is a recipe that decides the sections and the cue phrases.
- **Ask about it**: "@flint what did we decide about the boss?" searches captures and notes and answers with the quote and timestamp.

## How Flint gets better (no training)

- **Recipes**: each source and template is a small recipe file (sections, cue phrases, prompts). Agents can propose better recipes over MCP; a person approves them. Shared between tribes only if a host opts in (Workshop).
- **Keep/discard signals**: when people edit or delete AI points, Flint records which cue phrases and sentence positions were kept, per tribe, and adjusts the deterministic scorer's weights. Local, inspectable, resettable.
- **Evaluation set**: a small set of public, permissively licensed transcripts with reference summaries in `app/test/fixtures/` so changes to the summarizer are measured.

## Agents and MCP

- `capture_link(url)`, `capture_read(id)`, `captures_search(query)`, `capture_summarize(id, depth)` tools.
- Agents can add a link they found to the project with its summary, and turn action items into tasks (people approve).

## Safety and privacy

- Fetches go through the existing SSRF-safe fetcher; no private network access; size and time caps.
- Media downloads are off by default, host-only, and the optional tool lives in `.tribe/packs` with a checksum (download manager design in docs/STUDIO-SCOPING.md).
- Thumbnails and audio are cached locally and can be cleared; nothing is re-shared publicly.
- Voice notes in DMs stay private to that DM's members, transcripts included.

## Phases

1. **Web reader**: paste a link, get article text, deterministic summary, chat card, Files › Captures. oEmbed cards for TikTok, YouTube and Instagram.
2. **Voice notes like Notion**: Record in Notes, local transcript, AI notes sections, templates, editable.
3. **Video transcripts**: published captions; optional yt-dlp + whisper.cpp packs through the download manager.
4. **Smarter**: local model rewrite layer, keep/discard learning, recipes over MCP, captures search for Flint and agents.

## Sources

- TikTok embed and oEmbed: https://developers.tiktok.com/doc/embed-videos
- Meta tokenless oEmbed (June 2026): https://wpmayor.com/meta-tokenless-oembed-wordpress/
- yt-dlp subtitles: https://wiki.gentoo.org/wiki/Yt-dlp
- Mozilla Readability (Apache-2.0): https://openapps.pro/packages/mozilla-readability
- whisper.cpp licensing (MIT/Expat): https://dfsg-new-queue.debian.org/reviews/whisper.cpp
