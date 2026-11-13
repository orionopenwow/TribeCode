// Calls ("huddles"): peer-to-peer WebRTC for small groups, signaled over the tribe WebSocket, using the
// "perfect negotiation" pattern so anyone can add or drop tracks at any time. Audio, camera and screen.
// A mesh (everyone connects to everyone) keeps it serverless and private; it works up to about six people.
// The call stage, side panels, reactions, polls and recording live in call.js on top of this core.
//   window.TribeHuddle = { join, leave, toggleMute, toggleDeaf, toggleHand, toggleCamera, flipCamera, share,
//     setPtt, pttDown, pttUp, setDevice, devices, inCall, roster, render, peers, local, streamsOf, quality, debug }
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, k) => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m, k) : console.log(m);
  const MESH_MAX = 6;
  const LS = k => 'tribecode.call.' + k;
  const pref = (k, d) => { try { const v = localStorage.getItem(LS(k)); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch {} };
  let ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
  let inCall = false, confirmed = false, muted = false, deaf = false, hand = false, local = null, cam = null, screen = null, roster = [], audioCtx = null;
  let ptt = pref('ptt', false), pttHeld = false, facing = 'user', rejoin = 0, lobby = false;
  const peers = new Map(); // memberId -> { pc, polite, makingOffer, ignoreOffer, audio, streams: Map(id -> MediaStream), stopMeter, restarts }

  const meId = () => (C.state().me || {}).id;
  const nameOf = id => ((C.state().members || []).find(m => m.id === id) || {}).name || 'someone';
  const colorOf = id => ((C.state().members || []).find(m => m.id === id) || {}).color || '#6C7CFF';
  const initials = n => n.trim().split(/\s+/).map(w => [...w][0]).slice(0, 2).join('').toUpperCase();
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent('tribe:call', { detail: { name, ...(detail || {}) } }));

  // ---------- speaking detection (an energy meter; no model needed) ----------
  function meter(stream, onLevel) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream), an = audioCtx.createAnalyser(); an.fftSize = 512; src.connect(an);
      const buf = new Uint8Array(an.fftSize); let stop = false;
      (function tick() { if (stop) return; an.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) sum += (v - 128) ** 2; onLevel(Math.sqrt(sum / buf.length) / 128); setTimeout(tick, 120); })();
      return () => { stop = true; try { src.disconnect(); } catch {} };
    } catch { return () => {}; }
  }
  const levels = new Map();
  function setLevel(id, l) { const was = (levels.get(id) || 0) > 0.04; levels.set(id, l); if (was !== l > 0.04) { renderBar(); emit('levels'); } }

  // ---------- media senders: keep each peer's senders in line with what we share ----------
  const outgoing = () => [...(local ? local.getTracks().map(t => [t, local]) : []), ...(cam ? cam.getTracks().map(t => [t, cam]) : []), ...(screen ? screen.getTracks().map(t => [t, screen]) : [])];
  function syncSenders(p) {
    const want = outgoing(), wantTracks = want.map(([t]) => t);
    for (const s of p.pc.getSenders()) if (s.track && !wantTracks.includes(s.track)) { try { p.pc.removeTrack(s); } catch {} }
    const have = p.pc.getSenders().map(s => s.track).filter(Boolean);
    for (const [t, st] of want) if (!have.includes(t)) { try { p.pc.addTrack(t, st); } catch (e) { console.warn('addTrack', e); } }
    tuneVideo(p);
  }
  // simulcast-lite: fewer pixels and bits per camera as the call grows (screens keep detail, lower frame rate)
  function tuneVideo(p) {
    const n = Math.max(1, roster.length - 1), camTracks = cam ? cam.getVideoTracks() : [];
    for (const s of p.pc.getSenders()) {
      if (!s.track || s.track.kind !== 'video' || !s.getParameters) continue;
      try {
        const prm = s.getParameters(); if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}];
        if (camTracks.includes(s.track)) { prm.encodings[0].maxBitrate = n <= 1 ? 900_000 : n <= 3 ? 450_000 : 250_000; prm.encodings[0].scaleResolutionDownBy = n <= 1 ? 1 : n <= 3 ? 1.5 : 2; }
        else { prm.encodings[0].maxBitrate = 1_500_000; prm.encodings[0].maxFramerate = 15; }
        s.setParameters(prm).catch(() => {});
      } catch {}
    }
  }
  function syncAll() { for (const [, p] of peers) syncSenders(p); }

  // ---------- peer connections ----------
  function peer(id) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { pc, polite: meId() > id, makingOffer: false, ignoreOffer: false, audio: null, streams: new Map(), stopMeter: null, restarts: 0 };
    peers.set(id, p);
    syncSenders(p);
    pc.onnegotiationneeded = async () => {
      try { p.makingOffer = true; await pc.setLocalDescription(); C.send({ type: 'rtc', to: id, data: { description: pc.localDescription } }); }
      catch (e) { console.warn('negotiation', e); } finally { p.makingOffer = false; }
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) C.send({ type: 'rtc', to: id, data: { candidate } }); };
    pc.ontrack = ({ track, streams }) => {
      const st = streams[0] || new MediaStream([track]);
      if (track.kind === 'audio') {
        const scr = (roster.find(m => m.id === id) || {}).scr;
        if (scr && scr === st.id) {   // screen audio rides its own stream: a second element so voice and screen are both heard
          if (!document.querySelector(`#huddle-audio audio[data-scr="${CSS.escape(st.id)}"]`)) { const a = new Audio(); a.autoplay = true; a.dataset.peer = id; a.dataset.scr = st.id; a.srcObject = st; a.muted = deaf; $('#huddle-audio').appendChild(a); applySink(a); a.play().catch(() => {}); }
        } else {
          if (!p.audio) { p.audio = new Audio(); p.audio.autoplay = true; p.audio.dataset.peer = id; $('#huddle-audio').appendChild(p.audio); applySink(p.audio); }
          if (!p.audio.srcObject || p.audio.srcObject.id !== st.id) {
            p.audio.srcObject = st; p.audio.muted = deaf; p.audio.play().catch(() => {});
            if (p.stopMeter) p.stopMeter(); p.stopMeter = meter(st, l => setLevel(id, l));
          }
        }
      }
      if (track.kind === 'video') {
        p.streams.set(st.id, st);
        const gone = () => { if (!st.getVideoTracks().some(t => t.readyState === 'live')) { p.streams.delete(st.id); placeVideo(id); } };
        track.onended = gone; st.onremovetrack = gone; track.onmute = () => placeVideo(id); track.onunmute = () => placeVideo(id);
        placeVideo(id);
      }
    };
    pc.onconnectionstatechange = () => {
      // reconnect: try an ICE restart a few times before giving up on this peer (Wi-Fi hops, phone screen-lock)
      if (pc.connectionState === 'failed' && p.restarts < 3 && inCall) { p.restarts++; try { pc.restartIce(); } catch {} }
      else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // still failing after the restarts and no relay configured: most likely cellular or a strict NAT
        if (pc.connectionState === 'failed' && inCall && !ICE.some(s => [].concat(s.urls || s.url || []).some(u => /^turns?:/.test(u)))) { emit('relay-needed', { id }); if (window.TribeNextOpts) window.TribeNextOpts.nudge('relay'); }
        drop(id);
      }
      if (pc.connectionState === 'connected') p.restarts = 0;
      renderBar(); emit('peer', { id, state: pc.connectionState });
    };
    return p;
  }

  // Which of a peer's video streams is their camera and which their screen (they tell us the stream ids).
  function streamsOf(id) {
    if (id === meId()) return { cam: cam || null, screen: screen || null };
    const p = peers.get(id), m = roster.find(x => x.id === id) || {};
    if (!p) return { cam: null, screen: null };
    const live = s => s && s.getVideoTracks().some(t => t.readyState === 'live' && !t.muted);
    let c = m.cam ? p.streams.get(m.cam) : null, s = m.scr ? p.streams.get(m.scr) : null;
    if (!c && !s) for (const [sid, st] of p.streams) { if (m.sharing && !m.video) s = st; else if (!m.sharing) c = st; else if (sid !== m.scr) c = st; }
    return { cam: live(c) ? c : null, screen: live(s) ? s : null };
  }
  function placeVideo(id) {
    const { screen: s } = streamsOf(id);
    if (s) showScreen(id, s); else hideScreen(id);
    emit('video', { id });
  }

  async function onSignal({ from, data }) {
    if (!inCall) return;
    const p = peer(from), pc = p.pc;
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') { await pc.setLocalDescription(); C.send({ type: 'rtc', to: from, data: { description: pc.localDescription } }); }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!p.ignoreOffer) throw e; }
      }
    } catch (e) { console.warn('signal', e); }
  }

  function drop(id) {
    const p = peers.get(id); if (!p) return;
    try { p.pc.close(); } catch {}
    if (p.audio) p.audio.remove(); document.querySelectorAll(`#huddle-audio audio[data-peer="${CSS.escape(id)}"]`).forEach(a => a.remove());
    if (p.stopMeter) p.stopMeter(); hideScreen(id);
    peers.delete(id); levels.delete(id); emit('video', { id });
  }

  // Connect to everyone in the call; the one with the smaller id starts, avoiding double offers.
  function sync(list) {
    roster = list || [];
    if (inCall) {
      const ids = roster.map(m => m.id).filter(id => id !== meId());
      for (const id of [...peers.keys()]) if (!ids.includes(id)) drop(id);
      for (const id of ids) if (!peers.has(id) && meId() < id) peer(id);
      for (const id of ids) if (peers.has(id)) { tuneVideo(peers.get(id)); placeVideo(id); }
      const listed = roster.some(m => m.id === meId());
      if (listed) { confirmed = true; lobby = false; }
      else if (confirmed) leave(true);          // removed by the server (e.g. joined from another tab)
    }
    renderBar(); emit('roster'); window.TribeApp && window.TribeApp.refreshRoom && window.TribeApp.refreshRoom();
  }
  const sendState = (extra = {}) => C.send({ type: 'huddle-state', muted: muted || deaf, sharing: !!screen, deaf, video: !!cam, cam: cam ? cam.id : '', scr: screen ? screen.id : '', ...extra });

  // ---------- actions ----------
  async function micStream(deviceId) {
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }, video: false });
  }
  async function join(opts = {}) {
    if (inCall) return;
    if (!C.connected()) return window.TribeApp.openInvite();
    if (!window.isSecureContext || !navigator.mediaDevices) {
      return toast('Voice needs the desktop app or an https:// link (e.g. Tailscale Serve). Browsers block the mic on plain http:// LAN addresses.');
    }
    if (roster.length >= MESH_MAX && !roster.some(m => m.id === meId())) {
      return toast(`Calls connect everyone to everyone, which works up to ${MESH_MAX} people. This one is full; use chat or a voice note for now.`, 'warn');
    }
    try { const r = await C.api('/calls/ice'); if (r && Array.isArray(r.iceServers)) ICE = r.iceServers; } catch {}
    try { local = await micStream(pref('mic', '')); }
    catch (e) {
      try { if (pref('mic', '')) local = await micStream(''); else throw e; }
      catch (e2) { return toast(e2.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it and try again.' : 'No microphone found.'); }
    }
    inCall = true; confirmed = false; muted = ptt; deaf = false; hand = false; rejoin = 0;
    local.getAudioTracks().forEach(t => (t.enabled = !muted));
    local.stopMeter = meter(local, l => setLevel(meId(), muted ? 0 : l));
    C.send({ type: 'huddle-join', muted });
    // a tribe that lives only on this phone has nobody to call yet (offline.js solo mode): say what would help
    try { if (window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo() && window.TribeNextOpts) setTimeout(() => window.TribeNextOpts.nudge('huddle'), 600); } catch {}
    sync(roster);
    if (opts.video) toggleCamera();
    emit('join');
  }

  function leave(fromServer = false) {
    if (!inCall) return;
    inCall = false; confirmed = false; lobby = false;
    for (const id of [...peers.keys()]) drop(id);
    if (local) { if (local.stopMeter) local.stopMeter(); local.getTracks().forEach(t => t.stop()); local = null; }
    if (cam) { cam.getTracks().forEach(t => t.stop()); cam = null; }
    stopShare(true);
    if (!fromServer) C.send({ type: 'huddle-leave' });
    levels.clear(); hand = false; renderBar(); emit('leave');
  }

  function setMuted(v) {
    muted = v; if (local) local.getAudioTracks().forEach(t => (t.enabled = !muted && !deaf));
    sendState(); renderBar(); emit('state');
  }
  function toggleMute() { if (!inCall) return; if (deaf) { toggleDeaf(); return; } setMuted(!muted); }
  function toggleDeaf() {
    if (!inCall) return;
    deaf = !deaf;
    document.querySelectorAll('#huddle-audio audio').forEach(a => (a.muted = deaf));
    if (local) local.getAudioTracks().forEach(t => (t.enabled = !muted && !deaf));
    sendState(); renderBar(); emit('state');
  }
  function toggleHand() { if (!inCall) return; hand = !hand; sendState({ hand }); renderBar(); emit('state'); }

  // push to talk: hold Space (outside text fields) or the talk button
  function setPtt(v) { ptt = !!v; setPref('ptt', ptt); if (inCall) setMuted(ptt); emit('state'); }
  function pttDown() { if (!inCall || !ptt || pttHeld) return; pttHeld = true; setMuted(false); }
  function pttUp() { if (!pttHeld) return; pttHeld = false; setMuted(true); }
  const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('keydown', e => { if (e.code === 'Space' && ptt && inCall && !e.repeat && !typing(document.activeElement)) { e.preventDefault(); pttDown(); } });
  document.addEventListener('keyup', e => { if (e.code === 'Space' && pttHeld) { e.preventDefault(); pttUp(); } });
  addEventListener('blur', pttUp);

  async function camStream(deviceId) {
    return navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: facing }) }, audio: false });
  }
  async function toggleCamera() {
    if (!inCall) return;
    if (cam) { cam.getTracks().forEach(t => t.stop()); cam = null; syncAll(); sendState(); renderBar(); emit('video', { id: meId() }); return; }
    try { cam = await camStream(pref('cam', '')); }
    catch (e) { try { cam = await camStream(''); } catch (e2) { return toast(e2.name === 'NotAllowedError' ? 'Camera access was blocked.' : 'No camera found.', 'warn'); } }
    cam.getVideoTracks()[0].onended = () => { if (cam) toggleCamera(); };
    syncAll(); sendState(); renderBar(); emit('video', { id: meId() });
  }
  // phones: front <-> back camera (swaps the track in place, no renegotiation)
  async function flipCamera() {
    if (!cam) return;
    facing = facing === 'user' ? 'environment' : 'user';
    let next; try { next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: facing } }, audio: false }); } catch { facing = facing === 'user' ? 'environment' : 'user'; return toast('This device has one camera.'); }
    const [nt] = next.getVideoTracks(), [ot] = cam.getVideoTracks();
    for (const [, p] of peers) for (const s of p.pc.getSenders()) if (s.track === ot) await s.replaceTrack(nt);
    cam.removeTrack(ot); ot.stop(); cam.addTrack(nt); nt.onended = () => { if (cam) toggleCamera(); };
    emit('video', { id: meId() });
  }

  const canShare = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  async function share(opts = {}) {
    if (!inCall) return;
    if (screen) return stopShare();
    if (!canShare()) {   // phones (iPhones never) can't start a share: the next-options sheet, not a dead button
      emit('cant-share');
      if (window.TribeNextOpts) return window.TribeNextOpts.sheet('screenshare');
      return toast('Screen sharing needs a computer: phones can watch a share but not start one. Open TribeCode on a laptop to present.', 'warn');
    }
    try { screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: !!(opts.audio ?? pref('shareAudio', false)) }); }
    catch { return; }
    const [track] = screen.getVideoTracks(); track.onended = () => stopShare();
    try { track.contentHint = 'detail'; } catch {}
    syncAll(); sendState(); renderBar(); emit('video', { id: meId() }); emit('share', { on: true });
  }
  function stopShare(silent) {
    if (!screen) return;
    screen.getTracks().forEach(t => t.stop());
    screen = null; syncAll();
    if (!silent) sendState(); renderBar(); emit('video', { id: meId() }); emit('share', { on: false });
  }

  // ---------- devices ----------
  async function devices() {
    try { const l = await navigator.mediaDevices.enumerateDevices(); return { mic: l.filter(d => d.kind === 'audioinput'), cam: l.filter(d => d.kind === 'videoinput'), out: l.filter(d => d.kind === 'audiooutput'), canPickOut: 'setSinkId' in HTMLMediaElement.prototype }; }
    catch { return { mic: [], cam: [], out: [], canPickOut: false }; }
  }
  function applySink(el) { const id = pref('out', ''); if (id && el.setSinkId) el.setSinkId(id).catch(() => {}); }
  async function setDevice(kind, deviceId) {
    setPref(kind, deviceId || '');
    if (kind === 'out') { document.querySelectorAll('#huddle-audio audio').forEach(applySink); return; }
    if (!inCall) return;
    if (kind === 'mic' && local) {
      const next = await micStream(deviceId), [nt] = next.getAudioTracks(), [ot] = local.getAudioTracks();
      nt.enabled = !muted && !deaf;
      for (const [, p] of peers) for (const s of p.pc.getSenders()) if (s.track === ot) await s.replaceTrack(nt);
      local.removeTrack(ot); ot.stop(); local.addTrack(nt);
      if (local.stopMeter) local.stopMeter(); local.stopMeter = meter(local, l => setLevel(meId(), muted ? 0 : l));
    }
    if (kind === 'cam' && cam) {
      const next = await camStream(deviceId), [nt] = next.getVideoTracks(), [ot] = cam.getVideoTracks();
      for (const [, p] of peers) for (const s of p.pc.getSenders()) if (s.track === ot) await s.replaceTrack(nt);
      cam.removeTrack(ot); ot.stop(); cam.addTrack(nt); emit('video', { id: meId() });
    }
  }

  // ---------- quality: round-trip time and packet loss from getStats, per peer ----------
  async function quality(id) {
    const p = peers.get(id); if (!p) return null;
    try {
      const st = await p.pc.getStats(); let rtt = null, lost = 0, got = 0;
      st.forEach(r => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated && r.currentRoundTripTime != null) rtt = Math.round(r.currentRoundTripTime * 1000);
        if (r.type === 'inbound-rtp' && r.kind === 'audio') { lost += r.packetsLost || 0; got += r.packetsReceived || 0; }
      });
      const loss = got + lost ? lost / (got + lost) : 0;
      return { rtt, loss, level: rtt == null ? 'unknown' : rtt < 150 && loss < 0.02 ? 'good' : rtt < 400 && loss < 0.08 ? 'ok' : 'poor' };
    } catch { return null; }
  }

  // ---------- UI: the sidebar box (call.js draws the full call stage) ----------
  function showScreen(id, stream) {
    let w = document.querySelector(`.screen-win[data-peer="${id}"]`);
    if (!w) {
      w = document.createElement('div'); w.className = 'screen-win'; w.dataset.peer = id;
      w.innerHTML = `<div class="sw-head"><span>${esc(nameOf(id))}'s screen</span><button class="btn ghost" data-max title="Bigger">⤢</button><button class="btn ghost" data-x title="Hide">✕</button></div><div class="sw-body"><video autoplay playsinline muted></video><canvas class="sw-ink" aria-hidden="true"></canvas></div>`;
      document.body.appendChild(w);
      w.querySelector('[data-x]').onclick = () => w.remove();
      w.querySelector('[data-max]').onclick = () => w.classList.toggle('big');
      dragWin(w);
      emit('screen-win', { id, el: w });
    }
    const v = w.querySelector('video'); if (v.srcObject !== stream) v.srcObject = stream;
  }
  function hideScreen(id) { const w = document.querySelector(`.screen-win[data-peer="${id}"]`); if (w) w.remove(); }
  function dragWin(w) {
    const h = w.querySelector('.sw-head'); let sx, sy, ox, oy;
    h.onpointerdown = e => { if (e.target.closest('button')) return; sx = e.clientX; sy = e.clientY; const r = w.getBoundingClientRect(); ox = r.left; oy = r.top; h.setPointerCapture(e.pointerId);
      h.onpointermove = ev => { w.style.left = ox + ev.clientX - sx + 'px'; w.style.top = oy + ev.clientY - sy + 'px'; w.style.right = 'auto'; w.style.bottom = 'auto'; };
      h.onpointerup = () => { h.onpointermove = null; }; };
  }

  function renderBar() {
    const box = $('#huddle-box'); if (!box) return;
    const n = roster.length;
    const faces = roster.map(m => {
      const speaking = (levels.get(m.id) || 0) > 0.04 && !m.muted;
      return `<div class="hface ${speaking ? 'speaking' : ''}" title="${esc(nameOf(m.id))}${m.muted ? ' (muted)' : ''}${m.sharing ? ' · sharing screen' : ''}${m.hand ? ' · hand raised' : ''}" style="background:${esc(colorOf(m.id))}">${esc(initials(nameOf(m.id)))}${m.muted ? '<i class="mute">🔇</i>' : ''}${m.sharing ? '<i class="shr">🖥</i>' : ''}${m.hand ? '<i class="hand">✋</i>' : ''}</div>`;
    }).join('');
    box.innerHTML = inCall ? `
        <div class="hrow">${faces}</div>
        <div class="hctl">
          <button class="hbtn ${muted || deaf ? 'on' : ''}" id="h-mute" title="${ptt ? 'Push to talk: hold Space' : 'Mute (Ctrl Shift M)'}" aria-pressed="${muted || deaf}">${muted || deaf ? '🔇' : '🎙️'}</button>
          <button class="hbtn ${cam ? 'on' : ''}" id="h-cam" title="Camera (Ctrl Shift E)" aria-pressed="${!!cam}">📷</button>
          <button class="hbtn ${screen ? 'on' : ''}" id="h-share" title="Share your screen" aria-pressed="${!!screen}">🖥</button>
          <button class="hbtn" id="h-stage" title="Open the call (Ctrl Shift U)">⤢</button>
          <button class="hbtn leave" id="h-leave" title="Leave the call">Leave</button>
        </div>`
      : `<button class="item" id="h-join"><svg class="i" style="width:16px;height:16px;color:var(--accent-2)"><use href="#i-mic"/></svg>${n ? 'Join huddle' : 'Start a huddle'}<span class="n">${n ? n + ' in' : ''}</span></button>${n ? `<div class="hrow small">${faces}</div>` : ''}`;
    const q = s => box.querySelector(s);
    if (q('#h-join')) q('#h-join').onclick = () => join();
    if (q('#h-mute')) q('#h-mute').onclick = toggleMute;
    if (q('#h-cam')) q('#h-cam').onclick = toggleCamera;
    if (q('#h-share')) q('#h-share').onclick = () => share();
    if (q('#h-stage')) q('#h-stage').onclick = () => window.TribeCall && window.TribeCall.open();
    if (q('#h-leave')) q('#h-leave').onclick = () => leave();
    if (window.TribeCaptions) window.TribeCaptions.decorate(box, inCall);   // captions strip + controls (captions.js)
  }

  C.on('huddle', sync);
  C.on('rtc', onSignal);
  C.on('ws', m => { if (m.type === 'call-lobby') { if (inCall) leave(true); lobby = true; emit('lobby'); } if (m.type === 'call-admitted' && lobby) { lobby = false; join(); } });
  // reconnect: a dropped connection takes you out; when the tribe connection comes back within two minutes, you rejoin
  C.on('status', s => { if (s.status !== 'online' && inCall) { rejoin = Date.now(); leave(true); } });
  C.on('hello', () => { if (rejoin && Date.now() - rejoin < 120_000) { rejoin = 0; setTimeout(() => join(), 400); } });
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'm') { e.preventDefault(); inCall ? toggleMute() : join(); }
    else if (k === 'e' && inCall) { e.preventDefault(); toggleCamera(); }
  });
  addEventListener('beforeunload', () => leave());
  document.addEventListener('DOMContentLoaded', renderBar);
  setTimeout(renderBar, 0);

  window.TribeHuddle = { join, leave, toggleMute, toggleDeaf, toggleHand, toggleCamera, flipCamera, share, stopShare, setPtt, pttDown, pttUp, setDevice, devices, canShare,
    inCall: () => inCall, inLobby: () => lobby, roster: () => roster, render: renderBar, streamsOf, quality, level: id => levels.get(id) || 0,
    me: () => ({ id: meId(), muted, deaf, hand, ptt, video: !!cam, sharing: !!screen }),
    localAudio: () => local, remoteAudio: () => [...document.querySelectorAll('#huddle-audio audio')].map(a => a.srcObject).filter(Boolean),
    debug: () => [...peers].map(([id, p]) => ({ id, state: p.pc.connectionState, audio: !!(p.audio && p.audio.srcObject && p.audio.srcObject.getAudioTracks().length), videos: p.streams.size })) };
})();
