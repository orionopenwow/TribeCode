// {{name}}: a small browser video editor from TribeCode's build kit (templates/buildkit.json › video).
// The edit is a list of clips (source, in, out, title); nothing is re-encoded until Export. Preview draws the current
// clip onto a canvas with its title. Export records the canvas (and the clips' sound) with MediaRecorder, then, when
// Mediabunny can load, converts the recording to MP4 with WebCodecs. Everything stays in the browser.
const $ = id => document.getElementById(id);
const view = $('view'), g = view.getContext('2d');
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const W = view.width, H = view.height;
const fmt = s => { s = Math.max(0, s); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

/** @type {{ id:number, name:string, kind:'file'|'gen', dur:number, in:number, out:number, title:string, video?:HTMLVideoElement, hue?:number }[]} */
let clips = [], sel = null, t = 0, playing = false, rate = 1, nextId = 1;
const total = () => clips.reduce((s, c) => s + (c.out - c.in), 0);
function at(time) {   // which clip plays at timeline time, and where in it
  let start = 0;
  for (const c of clips) { const len = c.out - c.in; if (time < start + len || c === clips[clips.length - 1]) return { c, local: c.in + Math.min(len, time - start), start }; start += len; }
  return null;
}

// ---------- sound: each file clip's audio goes through WebAudio so Export can record it ----------
let ac = null, mix = null;
function audioFor(video) {
  try {
    ac = ac || new AudioContext(); mix = mix || ac.createMediaStreamDestination();
    if (!video._src) { video._src = ac.createMediaElementSource(video); video._src.connect(ac.destination); video._src.connect(mix); }
  } catch {}
}

// ---------- adding clips ----------
function addFile(file) {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file); video.preload = 'auto'; video.playsInline = true; video.crossOrigin = 'anonymous';
  video.addEventListener('loadedmetadata', () => {
    const dur = isFinite(video.duration) ? video.duration : 5;
    clips.push({ id: nextId++, name: file.name.replace(/\.[^.]+$/, ''), kind: 'file', dur, in: 0, out: dur, title: '', video });
    select(clips[clips.length - 1]); render();
  }, { once: true });
  video.addEventListener('error', () => toast(`Couldn't open ${file.name}: this browser can't play that format.`), { once: true });
}
function addSample() {   // generated clips, so the editor works with no files and no internet
  [['Opening', 190, 3], ['The build', 25, 4], ['Ship it', 265, 3]].forEach(([name, hue, dur]) => clips.push({ id: nextId++, name, kind: 'gen', dur, in: 0, out: dur, title: name, hue }));
  select(clips[0]); render();
}
$('files').addEventListener('change', e => { [...e.target.files].forEach(addFile); e.target.value = ''; });
$('sample').addEventListener('click', addSample);
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); [...e.dataTransfer.files].filter(f => /^video\//.test(f.type)).forEach(addFile); });

// ---------- drawing ----------
function drawGen(c, local) {
  g.fillStyle = `hsl(${c.hue} 45% 16%)`; g.fillRect(0, 0, W, H);
  const k = local / c.dur;
  g.fillStyle = `hsl(${c.hue} 70% 55%)`;
  g.fillRect(W * 0.1 + k * W * 0.6, H * 0.62, W * 0.2, H * 0.06);
  g.strokeStyle = `hsl(${c.hue} 40% 30%)`; g.lineWidth = 2;
  for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo((i / 12) * W + (k * 80) % (W / 12), 0); g.lineTo((i / 12) * W - 200 + (k * 80) % (W / 12), H); g.stroke(); }
}
function drawTitle(text, local, c) {
  if (!text) return;
  const fadeIn = Math.min(1, (local - c.in) / 0.4), fadeOut = Math.min(1, (c.out - local) / 0.4);
  g.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
  g.font = `700 ${Math.round(H * 0.075)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.textBaseline = 'bottom'; g.fillStyle = '#fff';
  const x = W * 0.07, y = H * 0.88;   // inside the title-safe margin
  g.fillStyle = 'rgba(0,0,0,.45)'; const w = g.measureText(text).width; g.fillRect(x - 18, y - H * 0.1, w + 36, H * 0.12);
  g.fillStyle = '#fff'; g.fillText(text, x, y - H * 0.012);
  g.fillStyle = css('--accent') || '#F26B1D'; g.fillRect(x - 18, y + 4, 64, 6);
  g.globalAlpha = 1;
}
let shown = null;
function draw() {
  const p = at(t);
  if (!p) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#888'; g.font = '28px system-ui'; g.fillText('Add clips to start', 48, H / 2); return; }
  const { c, local } = p;
  if (c.kind === 'file') {
    const v = c.video;
    if (shown && shown !== v) shown.pause();
    if (!playing && Math.abs(v.currentTime - local) > 0.05) v.currentTime = local;
    if (playing && shown !== v) { v.currentTime = local; v.playbackRate = rate; audioFor(v); v.play().catch(() => {}); }
    shown = v;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const s = Math.min(W / (v.videoWidth || W), H / (v.videoHeight || H)), dw = (v.videoWidth || W) * s, dh = (v.videoHeight || H) * s;
    if (v.readyState >= 2) g.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else { if (shown) { shown.pause(); shown = null; } drawGen(c, local); }
  drawTitle(c.title, local, c);
  document.querySelectorAll('.clip').forEach(el => el.classList.toggle('now', +el.dataset.id === c.id));
}

// ---------- playback loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = (now - last) / 1000; last = now;
  if (playing) {
    const p = at(t);
    if (p && p.c.kind === 'file' && shown === p.c.video && !p.c.video.paused) t = p.start + (p.c.video.currentTime - p.c.in);   // follow the video clock
    else t += dt * rate;
    if (p && t >= p.start + (p.c.out - p.c.in) && p.c.kind === 'file') { p.c.video.pause(); shown = null; }
    if (t >= total()) { t = total(); setPlaying(false); onEnd && onEnd(); }
    if (t < 0) { t = 0; setPlaying(false); }
  }
  draw(); stamp();
}
function stamp() { const T = total(); $('time').textContent = `${fmt(t)} / ${fmt(T)}`; $('scrub').value = T ? Math.round(t / T * 1000) : 0; $('export').disabled = !clips.length; }
function setPlaying(v) { playing = v && clips.length > 0; $('play').textContent = playing ? 'Pause' : 'Play'; if (!playing && shown) { shown.pause(); shown = null; } }
$('play').addEventListener('click', () => { if (t >= total()) t = 0; rate = 1; setPlaying(!playing); });
$('scrub').addEventListener('input', e => { t = total() * e.target.value / 1000; setPlaying(false); });
requestAnimationFrame(loop);

// ---------- timeline + inspector ----------
function render() {
  const T = Math.max(total(), 1), tr = $('track');
  tr.innerHTML = clips.length ? '' : '<p class="dim empty">Your clips line up here, in order. Drop video files anywhere.</p>';
  for (const c of clips) {
    const b = document.createElement('button'); b.className = 'clip' + (c === sel ? ' sel' : ''); b.dataset.id = c.id;
    b.style.width = `${Math.max(64, (c.out - c.in) / T * Math.max(600, tr.clientWidth - 8))}px`;
    b.innerHTML = `<b></b><span class="mono dim">${fmt(c.out - c.in)}</span>`; b.firstChild.textContent = c.title || c.name;
    b.addEventListener('click', () => { select(c); let s = 0; for (const x of clips) { if (x === c) break; s += x.out - x.in; } t = s; setPlaying(false); });
    tr.appendChild(b);
  }
  $('none').hidden = !!sel; $('edit').hidden = !sel;
  if (sel) {
    $('clip-name').textContent = sel.name;
    $('in').value = Math.round(sel.in / sel.dur * 1000); $('out').value = Math.round(sel.out / sel.dur * 1000);
    $('in-v').textContent = fmt(sel.in); $('out-v').textContent = fmt(sel.out); $('title').value = sel.title;
  }
}
function select(c) { sel = c; render(); }
$('in').addEventListener('input', e => { if (!sel) return; sel.in = Math.min(sel.out - 0.2, sel.dur * e.target.value / 1000); render(); });
$('out').addEventListener('input', e => { if (!sel) return; sel.out = Math.max(sel.in + 0.2, sel.dur * e.target.value / 1000); render(); });
$('title').addEventListener('input', e => { if (sel) { sel.title = e.target.value; const el = document.querySelector(`.clip[data-id="${sel.id}"] b`); if (el) el.textContent = sel.title || sel.name; } });
function move(d) { const i = clips.indexOf(sel), j = i + d; if (i < 0 || j < 0 || j >= clips.length) return; [clips[i], clips[j]] = [clips[j], clips[i]]; render(); }
$('left').addEventListener('click', () => move(-1)); $('right').addEventListener('click', () => move(1));
function remove() { if (!sel) return; clips = clips.filter(c => c !== sel); sel = clips[0] || null; t = Math.min(t, total()); render(); }
$('del').addEventListener('click', remove);
function split() {   // split the clip under the playhead in two
  const p = at(t); if (!p || p.local - p.c.in < 0.2 || p.c.out - p.local < 0.2) return;
  const b = { ...p.c, id: nextId++, in: p.local, title: '' }; p.c.out = p.local;
  clips.splice(clips.indexOf(p.c) + 1, 0, b); select(b);
}
addEventListener('keydown', e => {
  if (e.target.closest('input[type=text]')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  else if (k === 'k') setPlaying(false);
  else if (k === 'l') { rate = playing && rate > 0 ? Math.min(4, rate * 2) : 1; setPlaying(true); }
  else if (k === 'j') { t = Math.max(0, t - 2); }
  else if (k === 'i' && sel) { const p = at(t); if (p && p.c === sel) { sel.in = Math.min(p.local, sel.out - 0.2); render(); } }
  else if (k === 'o' && sel) { const p = at(t); if (p && p.c === sel) { sel.out = Math.max(p.local, sel.in + 0.2); render(); } }
  else if (k === 's') split();
  else if (e.key === 'Delete' || e.key === 'Backspace') remove();
});

// ---------- export ----------
let onEnd = null;
function toast(msg, ms = 4000) { const el = $('busy'); el.textContent = msg; el.hidden = false; clearTimeout(toast._t); if (ms) toast._t = setTimeout(() => (el.hidden = true), ms); }
function save(blob, ext) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${document.title || 'video'}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10_000); }
async function toMp4(blob) {   // Mediabunny (WebCodecs): WebM -> MP4, when the browser and the CDN allow it
  if (!('VideoEncoder' in window)) return null;
  const M = await import('mediabunny');
  const input = new M.Input({ source: new M.BlobSource(blob), formats: M.ALL_FORMATS });
  const output = new M.Output({ format: new M.Mp4OutputFormat(), target: new M.BufferTarget() });
  const conv = await M.Conversion.init({ input, output });
  if (!conv.isValid) return null;
  await conv.execute();
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
$('export').addEventListener('click', async () => {
  if (!clips.length || !('MediaRecorder' in window)) return toast('This browser cannot record video. Try Chrome, Edge or Firefox.');
  const stream = view.captureStream(30);
  if (mix) mix.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const type = ['video/webm;codecs=vp9,opus', 'video/webm'].find(x => MediaRecorder.isTypeSupported(x)) || '';
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 }), parts = [];
  rec.ondataavailable = e => e.data.size && parts.push(e.data);
  const done = new Promise(r => (rec.onstop = r));
  t = 0; rate = 1; rec.start(250); setPlaying(true);
  toast('Exporting… it plays through once.', 0);
  await new Promise(r => (onEnd = r)); onEnd = null; rec.stop(); await done;
  const webm = new Blob(parts, { type: 'video/webm' });
  toast('Making an MP4…', 0);
  let mp4 = null; try { mp4 = await toMp4(webm); } catch {}
  if (mp4) { save(mp4, 'mp4'); toast('Exported an MP4.'); } else { save(webm, 'webm'); toast('Exported a WebM (MP4 needs WebCodecs and an internet connection).'); }
});

render();
