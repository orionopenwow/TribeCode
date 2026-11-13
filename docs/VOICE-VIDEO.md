# Voice, video and the Secretary: how it works locally

TribeCode's calls and voice notes run on the tribe's own host. Audio and video flow peer to peer (WebRTC);
the host only relays signaling over its WebSocket. Nothing needs a cloud service or an AI. Each area below was
built in a wave: research, build, polish, close the loops, phone, tests.

## Wave 1: voice notes and the Secretary (no AI)

**Research.**
- *Live transcripts:* the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) works in Chrome, Edge
  and Safari (iOS 14.5+), not in Firefox. Recent Chrome and Safari run it on the device; Chrome may still use a
  server for some languages. [MDN](https://developer.mozilla.org/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API),
  [web-features](https://web-platform-dx.github.io/web-features-explorer/features/speech-recognition),
  [Chrome on-device intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM/m/cz7ZnL59AAAJ).
- *Transcripts of a recording (after the fact):* Web Speech can't read a file. On-device options: Whisper tiny
  through transformers.js (Apache-2.0; the Whisper weights are MIT), whisper.cpp WASM (MIT), Vosk-browser
  (Apache-2.0). [Whisper tiny in the browser](https://alphasignal.ai/news/xenova-s-whisper-tiny-brings-free-speech-recognition-to-any-browser),
  [vosk-browser](https://npmjs.com/package/vosk-browser).
- *Voice activity detection:* @ricky0123/vad-web (ISC) uses an ONNX model; for speaking rings and silence a plain
  energy meter (Web Audio `AnalyserNode`) is enough, so no library. [vad-web](https://npmjs.com/package/@ricky0123/vad-web).
- *Summaries without an LLM:* extractive methods: TextRank (sentences ranked by shared words, PageRank-style),
  plus rules for action items, decisions, dates and names. Small, deterministic and explainable.

**Choice.** Web Speech for live transcripts where the browser has it. Opt-in on-device Whisper tiny
(transformers.js 3.0.2 from jsDelivr, model cached by the browser, about 40 MB) for recordings with no transcript;
it asks first and says what it downloads. Our own TextRank and rules in `app/ui/secsum.js` (no third-party code),
shared by the browser and the server.

**Built.**
- `app/ui/voicenote.js`: a recorder sheet (pause, resume, delete, done, live waveform, live transcript, Esc to
  throw away, 5-minute cap) used by Docs ("Voice note" in the doc toolbar), the task drawer (into the notes) and
  the Secretary ("Voice note to the Secretary"). Audio goes to Files (project scope); a quote block with the
  transcript and a "listen" link goes into the doc or task.
- Chat and DM voice notes (chatx.js): playback speed 1×, 1.5×, 2× and tap the waveform to jump.
- `app/ui/secsum.js`: TextRank summary, action items with an owner (@name, "Maya can you…", "I'll…" = the speaker,
  "Sam needs to…") and a due date (today, tomorrow, Friday, next week, this weekend, the 21st, ISO dates), decisions,
  questions, people mentioned, links.
- The Secretary (server/secretary.js): huddle captions are now read into the journal (only the meeting's project);
  the journal gets Summary, Action items, People mentioned and Links; `GET /api/secretary/summary` builds today's
  notes straight from chat even when the Secretary is off; `POST /api/secretary/actions/:id/task|dismiss` makes an
  action a task (assignee and due date filled in, one tap, idempotent). The view has "Notes from today's talk".
- DMs stay private: the Secretary only reads project chat, captions people chose to share, and notes handed to it.

**Needs real devices.** Web Speech on iPhone Safari and Android Chrome; the Whisper download on a phone (size,
battery); the fake microphone in tests records a tone, not words.
