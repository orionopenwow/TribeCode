// Voice notes outside the chat composer: a small recorder sheet (pause, resume, delete, done) with a live
// waveform and a live transcript where the browser can do speech (Web Speech), used by Docs, the Task drawer
// and the Secretary. Chat and DMs keep their hold-the-mic recorder (chatx.js), which shares the player below.
//   TribeVoiceNote.record({ title }) -> Promise<{ blob, mime, dur, wave, transcript } | null>
//   TribeVoiceNote.upload(rec)       -> Promise<{ id, url }>  (Files, project scope: server/uploads.js)
//   TribeVoiceNote.markdown(rec, url) -> a quote block for a doc or a task
//   TribeVoiceNote.transcribe(blob)  -> Promise<string>  on-device Whisper, opt-in (transformers.js from jsDelivr)
// Everything stays on the tribe's host: no cloud speech service is called by TribeCode. Web Speech is the
// browser's own engine (on-device in recent Chrome and Safari; Chrome may use Google's service for some languages).
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, k) => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m, k) : console.log(m));
  const pad = n => String(n).padStart(2, '0');
  const dur = s => { s = Math.round(Number(s) || 0); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const MAX = 5 * 60;   // seconds
  const pickMime = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  const extOf = mime => /mp4|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';

  let sheet = null;
  function record(opts = {}) {
    if (sheet) return Promise.resolve(null);
    if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast(window.isSecureContext ? 'This browser can’t record audio.' : 'Recording needs the desktop app or an https:// link.', 'warn'); return Promise.resolve(null); }
    return new Promise(async resolve => {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch (e) { toast(e.name === 'NotAllowedError' ? 'Microphone access was blocked.' : 'No microphone found.', 'warn'); return resolve(null); }
      const mime = pickMime(), r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const st = { chunks: [], levels: [], words: [], interim: '', elapsed: 0, last: Date.now(), paused: false, done: false };
      r.ondataavailable = e => { if (e.data && e.data.size) st.chunks.push(e.data); };
      let ctx = null, an = null, buf = null;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); const src = ctx.createMediaStreamSource(stream); an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an); buf = new Uint8Array(an.fftSize); } catch {}
      const SP = window.TribeSpeech, speech = !!(SP && SP.supported());
      const listen = () => { if (speech) SP.use('voicenote-sheet', { label: 'recording', onFinal: t => { st.words.push(t); st.interim = ''; draw(); }, onInterim: t => { st.interim = t; draw(); } }); };
      sheet = document.createElement('div');
      sheet.className = 'vrec-scrim'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Record a voice note');
      sheet.innerHTML = `<div class="vrec">
        <div class="vrec-h"><span class="eyebrow">Voice note</span><b>${esc(opts.title || 'Record a voice note')}</b></div>
        <div class="vrec-wave" aria-hidden="true"></div>
        <div class="vrec-row"><span class="vrec-dot"></span><span class="vrec-t">0:00</span><span class="vrec-max">of ${dur(MAX)}</span></div>
        <p class="vrec-tx" aria-live="polite">${speech ? 'Listening… what you say shows here.' : 'Recording. A transcript isn’t available in this browser; you can make one on this device later.'}</p>
        <div class="vrec-ctl">
          <button type="button" class="btn ghost" data-vr="del">Delete</button>
          <button type="button" class="btn" data-vr="pause">Pause</button>
          <button type="button" class="btn primary" data-vr="done">Done</button>
        </div></div>`;
      document.body.appendChild(sheet);
      const wave = sheet.querySelector('.vrec-wave');
      for (let i = 0; i < 40; i++) wave.appendChild(document.createElement('i'));
      const draw = () => {
        if (!sheet) return;
        sheet.querySelector('.vrec-t').textContent = dur(st.elapsed);
        const said = [...st.words, st.interim].filter(Boolean).join(' ');
        if (said) sheet.querySelector('.vrec-tx').textContent = said;
        const L = st.levels.slice(-40), bars = wave.children;
        for (let i = 0; i < bars.length; i++) bars[i].style.height = `${8 + Math.round(Math.min(1, (L[i - (40 - L.length)] || 0) * 6) * 92)}%`;
        sheet.querySelector('[data-vr="pause"]').textContent = st.paused ? 'Resume' : 'Pause';
        sheet.classList.toggle('paused', st.paused);
      };
      const tick = setInterval(() => {
        if (!st.paused) { st.elapsed += (Date.now() - st.last) / 1000; if (an) { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) ** 2; st.levels.push(Math.sqrt(s / buf.length) / 128); } }
        st.last = Date.now(); draw();
        if (st.elapsed >= MAX) finish(true);
      }, 100);
      async function finish(keep) {
        if (st.done) return; st.done = true;
        clearInterval(tick);
        const stopped = new Promise(res => { r.onstop = res; });
        try { r.stop(); } catch {}
        await stopped;
        if (speech) { await new Promise(x => setTimeout(x, keep ? 300 : 0)); SP.release('voicenote-sheet'); }
        stream.getTracks().forEach(t => t.stop()); if (ctx) ctx.close().catch(() => {});
        sheet.remove(); sheet = null; document.removeEventListener('keydown', key, true);
        if (!keep || st.elapsed < 0.7) { if (keep) toast('That was too short to keep.'); return resolve(null); }
        const blob = new Blob(st.chunks, { type: r.mimeType || mime || 'audio/webm' });
        const n = 32, L = st.levels, mx = Math.max(0.02, ...L);
        const w = Array.from({ length: n }, (_, i) => { const seg = L.slice(Math.floor(i * L.length / n), Math.floor((i + 1) * L.length / n)); return Math.round(1 + 8 * (seg.length ? Math.max(...seg) : 0) / mx); });
        resolve({ blob, mime: blob.type, dur: Math.round(st.elapsed), wave: w, transcript: [...st.words, st.interim].filter(Boolean).join(' ').trim() });
      }
      const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); toggle(); } };
      document.addEventListener('keydown', key, true);
      function toggle() {
        if (st.paused) { try { r.resume(); } catch {} st.paused = false; listen(); }
        else { try { r.pause(); } catch {} st.paused = true; if (speech) SP.release('voicenote-sheet'); }
        st.last = Date.now(); draw();
      }
      sheet.addEventListener('click', e => {
        const b = e.target.closest('[data-vr]'); if (!b) return;
        if (b.dataset.vr === 'pause') toggle();
        else finish(b.dataset.vr === 'done');
      });
      r.start(250); listen(); draw();
      sheet.querySelector('[data-vr="done"]').focus();
    });
  }

  async function upload(rec, name) {
    const fn = name || `voice-note-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${extOf(rec.mime)}`;
    const t = ((window.TribeStore && window.TribeStore.get().server) || {}).token, pid = C && C.project && C.project();
    const res = await fetch((C && C.base ? C.base() : '') + '/api/uploads?scope=project&name=' + encodeURIComponent(fn), { method: 'POST', body: rec.blob,
      headers: { 'Content-Type': 'application/octet-stream', ...(t ? { Authorization: 'Bearer ' + t } : {}), ...(pid ? { 'X-Project': pid } : {}) } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'upload failed');
    const { file } = await res.json();
    return { id: file.id, url: `/api/uploads/${encodeURIComponent(file.id)}/raw` };
  }
  const markdown = (rec, url) => `> 🎙 **Voice note** · ${dur(rec.dur)}${url ? ` · [listen](${url})` : ''}\n> ${(rec.transcript || '_No transcript yet._').replace(/\n+/g, ' ')}\n`;

  // ---------- on-device transcription (opt-in): Whisper tiny via transformers.js (Apache-2.0) ----------
  // Loaded from jsDelivr at a pinned version only when someone asks; the model (~40 MB) is cached by the browser.
  const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
  let asr = null;
  async function transcribe(blob) {
    if (!asr) {
      const ok = window.confirm('Make a transcript on this device? The first time downloads a small speech model (about 40 MB) and uses some battery. Nothing leaves your device.');
      if (!ok) return '';
      const mod = await import(/* webpackIgnore: true */ TJS);
      asr = await mod.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    }
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 16000 * 1, 16000);
    const ab = await blob.arrayBuffer();
    const decoded = await new Promise((res, rej) => ctx.decodeAudioData(ab.slice(0), res, rej));
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000), src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const out = await asr(pcm, { chunk_length_s: 30 });
    return String((out && out.text) || '').trim();
  }

  // ---------- where the recorder shows up ----------
  const MIC = '<svg class="i" aria-hidden="true"><use href="#i-mic"/></svg>';
  async function intoDoc() {
    const rec = await record({ title: 'Voice note for this doc' }); if (!rec) return;
    let url = ''; try { url = (await upload(rec)).url; } catch (e) { toast('Saved the transcript; the audio didn’t upload: ' + e.message, 'warn'); }
    const el = document.getElementById('doc-body');
    if (el && window.TribeSpeech) window.TribeSpeech.insertText(el, '\n' + markdown(rec, url));
    toSecretary(rec, 'doc');
  }
  async function intoTask() {
    const rec = await record({ title: 'Voice note for this task' }); if (!rec) return;
    let url = ''; try { url = (await upload(rec)).url; } catch (e) { toast('The audio didn’t upload: ' + e.message, 'warn'); }
    const ta = document.getElementById('tkd-notes'); if (!ta) return;
    ta.hidden = false; ta.value = (ta.value ? ta.value.replace(/\s*$/, '\n\n') : '') + markdown(rec, url);
    ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new Event('change', { bubbles: true }));
    toast('Voice note added to the task notes');
  }
  async function toSecretary(rec, where) {
    if (!rec || !rec.transcript || !C || !C.connected || !C.connected()) return;
    try { await C.api('/secretary/note', { method: 'POST', body: { text: rec.transcript, kind: 'voice', ref: { type: where || 'voice', id: '' } } }); } catch {}
  }
  async function forSecretary() {
    const rec = await record({ title: 'A note for the Secretary' }); if (!rec) return;
    let text = rec.transcript;
    if (!text) { try { text = await transcribe(rec.blob); } catch (e) { toast('Couldn’t make a transcript on this device: ' + e.message, 'warn'); } }
    if (!text) return toast('No words to keep. Try again where speech works, or type the note.', 'warn');
    try { await C.api('/secretary/note', { method: 'POST', body: { text, kind: 'voice' } }); toast('The Secretary has your voice note'); } catch (e) { toast(e.message, 'warn'); }
  }
  function mount() {
    const bar = document.querySelector('#doc-pane .doc-toolbar');
    if (bar && !bar.querySelector('[data-vnote]')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mic-btn ghost'; b.dataset.vnote = 'doc';
      b.title = 'Record a voice note into this doc'; b.innerHTML = MIC + '<span>Voice note</span>'; b.onmousedown = e => e.preventDefault(); b.onclick = intoDoc;
      bar.insertBefore(b, bar.querySelector('#doc-del'));
    }
    const notes = document.getElementById('tkd-notes');
    if (notes && !document.querySelector('[data-vnote="task"]')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ghost tkd-vn'; b.dataset.vnote = 'task';
      b.innerHTML = MIC + '<span>Voice note</span>'; b.title = 'Record a voice note into the notes'; b.onclick = intoTask;
      notes.parentElement.insertBefore(b, notes);
    }
    const sec = document.querySelector('#view-secretary:not(.hidden) .sy-vn-row');
    if (sec && !document.querySelector('[data-vnote="secretary"]')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm sy-vn'; b.dataset.vnote = 'secretary';
      b.innerHTML = MIC + '<span>Voice note to the Secretary</span>'; b.onclick = forSecretary;
      sec.appendChild(b);
    }
  }
  let soon = null;
  new MutationObserver(() => { clearTimeout(soon); soon = setTimeout(mount, 60); }).observe(document.documentElement, { childList: true, subtree: true });

  window.TribeVoiceNote = { record, upload, markdown, transcribe, toSecretary, dur };
})();
