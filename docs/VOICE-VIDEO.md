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

## Wave 2: huddles (voice calls)

**Research.**
- *Topology:* a mesh (everyone sends to everyone) needs no media server; each person uploads one stream per other
  person, so it stays comfortable up to about 6 people with audio and small video. Bigger calls want an SFU
  (selective forwarding unit) such as mediasoup (ISC), LiveKit (Apache-2.0) or Janus (GPL, so not for us). An SFU is
  a separate native service, which breaks zero npm dependencies and one-file hosting. [webrtcHacks on mesh limits](https://webrtchacks.com/webrtc-beyond-one-one/),
  [mediasoup](https://mediasoup.org/), [LiveKit](https://github.com/livekit/livekit).
- *Signaling:* "perfect negotiation" (polite and impolite peers) avoids offer glare without a lock. [MDN](https://developer.mozilla.org/docs/Web/API/WebRTC_API/Perfect_negotiation).
- *Getting through networks:* STUN finds a public address; when both sides sit behind strict NATs (cellular
  carriers, office firewalls) only a TURN relay works. coturn (BSD-3) is the standard self-hosted TURN server.
  [coturn](https://github.com/coturn/coturn).
- *Reconnects:* `RTCPeerConnection.restartIce()` recovers from Wi-Fi hops and screen locks without a new call.
- *Quality:* `getStats()` gives round-trip time and packet loss for a per-person quality dot.

**Choice.** Our own mesh (`app/ui/huddle.js`), capped at 6 (`MESH_MAX`), perfect negotiation over the tribe
WebSocket, ICE servers from the host (`GET /api/calls/ice`). No SFU: when a call is full TribeCode says so and offers
chat or a voice note.

**Built.**
- `server/calls.js`: ring someone (with a missed-call notice after 30 s), reactions, laser and pen pointers, in-call
  chat and polls, recording on and off (everyone sees it), presenting, lock and knock-to-join, call history
  (`calls/history.jsonl`), relay config (`.tribe/calls.json`, host only; the TURN secret is hidden from others).
- `app/ui/huddle.js`: deafen, raise hand, push to talk (hold Space), mic/camera/speaker choice (`setSinkId` where the
  browser has it), ICE restarts (3 tries), rejoin after a dropped WebSocket (within 2 minutes), lobby when locked.
- `app/ui/call.js`: the call stage (`#/call`): grid or speaker view, faces when there's no video, a speaking ring, a
  quality dot, side panels (chat with `/poll`, today's notes from the Secretary, people with Ring buttons, history),
  record (the mixed audio of everyone, saved to Files), captions, knock banner.
- Flint voice commands, all local: "start a video call", "share my screen", "raise my hand", "mute me", "call Maya",
  "call history", "present TribeCode", "summarize my notes", "what did we decide today", "action items".

### Relays (TURN)

On the same Wi-Fi (or Tailscale), calls connect directly and need nothing else. Across the internet, most home
networks work with STUN alone. Cellular data and strict office networks usually need a relay:

1. Run coturn on any always-on machine (the host computer works): `turnserver --lt-cred-mech --user tribe:<secret> --realm tribe --listening-port 3478`.
   Open UDP/TCP 3478 on its router.
2. As the host, add it: `PUT /api/calls/config` with `{ "turn": [{ "urls": "turn:<host>:3478", "username": "tribe", "credential": "<secret>" }] }`.
3. For LAN-only tribes, `{ "lanOnly": true }` skips public STUN entirely.

When a call still fails after its ICE restarts and no relay is set, TribeCode shows "This call can't connect
directly" with these options (app/ui/nextopts.js), instead of a silent drop.

## Wave 3: video

**Research.**
- *Simulcast:* real simulcast needs an SFU to pick a layer per viewer. In a mesh, each sender can cap its own
  bitrate and resolution per connection with `RTCRtpSender.setParameters` ("simulcast-lite"). [MDN](https://developer.mozilla.org/docs/Web/API/RTCRtpSender/setParameters).
- *Background blur:* needs a person-segmentation model. MediaPipe Selfie Segmentation is Apache-2.0 but ships a
  ~3 MB WASM runtime plus a model from Google's CDN, not jsDelivr, and costs a lot of CPU on phones; Chrome's built-in
  background blur is OS-level and not exposed to pages everywhere. We left blur out rather than load a heavy runtime
  or a non-permitted CDN; the OS camera effects (macOS, Windows Studio Effects, Pixel) still apply.
- *Picture in picture:* `HTMLVideoElement.requestPictureInPicture()` (Chrome, Safari; not Firefox).

**Built.** Camera on/off with front/back flip, per-sender bitrate caps, speaker view, pin, picture in picture,
camera and screen as separate tiles, a face (avatar) when someone has no camera.

## Wave 4: screen share

**Research.** `getDisplayMedia` works on desktop Chrome, Edge, Firefox and Safari. iPhone and iPad Safari can't
start a share at all; Android Chrome can't either. Phones can watch. Tab and system audio can be shared from
Chrome on desktop (`audio: true`).

**Built.** Share with optional sound ("Share sound with my screen"), the share as a big tile and a floating window,
laser (click) and pen (Shift-drag) on the shared screen, "Present TribeCode" (followers move to the screen the
presenter is on). On a phone, Share opens the next-options sheet: share from a laptop (with a QR code to open the
tribe there) or show it with the camera.

## Wave 5: everything you'd expect

Keyboard shortcuts (Ctrl Shift M join/mute, E camera, U stage, H hand on the stage, Space push to talk; listed in the
help sheet), translations of the call and Secretary strings in all eight languages, calendar huddles (server/plan.js
already posts a Join line when an event with a huddle starts), and phone-only tribes: the Secretary's no-AI part
(summary, action items, decisions, questions, notes, ask) now runs right on the phone (app/ui/phonelocal.js), and a
huddle there says it needs a host, with the next options.

**Licenses.** All call, video and Secretary code is our own (MIT, like TribeCode). The only third-party code is
transformers.js 3.0.2 (Apache-2.0) with Whisper tiny weights (MIT), loaded from jsDelivr only after the person opts in.

**Needs real devices.** Web Speech on iPhone and Android; TURN over cellular; Bluetooth headsets and `setSinkId`
(Safari has partial support); the Whisper download on phones; camera flip and picture in picture on phones; echo
cancellation with laptop speakers; a 6-person call's upload on home internet.
