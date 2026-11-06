// Voice huddles: peer-to-peer WebRTC audio (+ screen share) for small groups, signaled over the
// tribe WebSocket. Uses the "perfect negotiation" pattern so either side can add tracks any time.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  let inCall = false, confirmed = false, muted = false, local = null, screen = null, roster = [], audioCtx = null;
  const peers = new Map(); // memberId -> { pc, polite, makingOffer, ignoreOffer, audio, video, level }

  const meId = () => (C.state().me || {}).id;
  const nameOf = id => ((C.state().members || []).find(m => m.id === id) || {}).name || 'someone';
  const colorOf = id => ((C.state().members || []).find(m => m.id === id) || {}).color || '#6C7CFF';
  const initials = n => n.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // ---------- speaking detection ----------
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
  function setLevel(id, l) { const was = (levels.get(id) || 0) > 0.04; levels.set(id, l); if (was !== l > 0.04) renderBar(); }

  // ---------- peer connections ----------
  function peer(id) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { pc, polite: meId() > id, makingOffer: false, ignoreOffer: false, audio: null, video: null, stopMeter: null };
    peers.set(id, p);
    for (const t of local.getTracks()) pc.addTrack(t, local);
    if (screen) for (const t of screen.getTracks()) pc.addTrack(t, screen);
    pc.onnegotiationneeded = async () => {
      try { p.makingOffer = true; await pc.setLocalDescription(); C.send({ type: 'rtc', to: id, data: { description: pc.localDescription } }); }
      catch (e) { console.warn('negotiation', e); } finally { p.makingOffer = false; }
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) C.send({ type: 'rtc', to: id, data: { candidate } }); };
    pc.ontrack = ({ track, streams }) => {
      if (track.kind === 'audio') {
        if (!p.audio) { p.audio = new Audio(); p.audio.autoplay = true; p.audio.dataset.peer = id; $('#huddle-audio').appendChild(p.audio); }
        p.audio.srcObject = streams[0] || new MediaStream([track]);
        p.audio.play().catch(() => {});
        if (p.stopMeter) p.stopMeter(); p.stopMeter = meter(p.audio.srcObject, l => setLevel(id, l));
      } else if (track.kind === 'video') {
        p.video = streams[0] || new MediaStream([track]); showScreen(id, p.video);
        track.onended = () => { p.video = null; hideScreen(id); };
        streams[0] && (streams[0].onremovetrack = () => { p.video = null; hideScreen(id); });
      }
    };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) drop(id); renderBar(); };
    return p;
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
    if (p.audio) p.audio.remove(); if (p.stopMeter) p.stopMeter(); hideScreen(id);
    peers.delete(id); levels.delete(id);
  }

  // Connect to everyone in the huddle; the one with the smaller id starts, avoiding double offers.
  function sync(list) {
    roster = list || [];
    if (inCall) {
      const ids = roster.map(m => m.id).filter(id => id !== meId());
      for (const id of [...peers.keys()]) if (!ids.includes(id)) drop(id);
      for (const id of ids) if (!peers.has(id) && meId() < id) peer(id);
      const listed = roster.some(m => m.id === meId());
      if (listed) confirmed = true;
      else if (confirmed) leave(true);          // removed by the server (e.g. joined from another tab)
    }
    renderBar(); window.TribeApp && window.TribeApp.refreshRoom && window.TribeApp.refreshRoom();
  }

  // ---------- actions ----------
  async function join() {
    if (inCall) return;
    if (!C.connected()) return window.TribeApp.openInvite();
    if (!window.isSecureContext || !navigator.mediaDevices) {
      return window.TribeApp.toast('Voice needs the desktop app or an https:// link (e.g. Tailscale Serve). Browsers block the mic on plain http:// LAN addresses.');
    }
    try { local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (e) { return window.TribeApp.toast(e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it and try again.' : 'No microphone found.'); }
    inCall = true; confirmed = false; muted = false;
    local.stopMeter = meter(local, l => setLevel(meId(), muted ? 0 : l));
    C.send({ type: 'huddle-join', muted });
    sync(roster);
  }

  function leave(fromServer = false) {
    if (!inCall) return;
    inCall = false; confirmed = false;
    for (const id of [...peers.keys()]) drop(id);
    if (local) { if (local.stopMeter) local.stopMeter(); local.getTracks().forEach(t => t.stop()); local = null; }
    stopShare(true);
    if (!fromServer) C.send({ type: 'huddle-leave' });
    levels.clear(); renderBar();
  }

  function toggleMute() {
    if (!inCall) return;
    muted = !muted; local.getAudioTracks().forEach(t => (t.enabled = !muted));
    C.send({ type: 'huddle-state', muted, sharing: !!screen }); renderBar();
  }

  async function share() {
    if (!inCall) return;
    if (screen) return stopShare();
    try { screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }); }
    catch { return; }
    const [track] = screen.getVideoTracks(); track.onended = () => stopShare();
    for (const [, p] of peers) p.pc.addTrack(track, screen);
    C.send({ type: 'huddle-state', muted, sharing: true }); renderBar();
  }
  function stopShare(silent) {
    if (!screen) return;
    const tracks = screen.getTracks(); tracks.forEach(t => t.stop());
    for (const [, p] of peers) for (const s of p.pc.getSenders()) if (s.track && tracks.includes(s.track)) { try { p.pc.removeTrack(s); } catch {} }
    screen = null; if (!silent) C.send({ type: 'huddle-state', muted, sharing: false }); renderBar();
  }

  // ---------- UI ----------
  function showScreen(id, stream) {
    let w = document.querySelector(`.screen-win[data-peer="${id}"]`);
    if (!w) {
      w = document.createElement('div'); w.className = 'screen-win'; w.dataset.peer = id;
      w.innerHTML = `<div class="sw-head"><span>${esc(nameOf(id))}'s screen</span><button class="btn ghost" data-max title="Bigger">⤢</button><button class="btn ghost" data-x title="Hide">✕</button></div><video autoplay playsinline muted></video>`;
      document.body.appendChild(w);
      w.querySelector('[data-x]').onclick = () => w.remove();
      w.querySelector('[data-max]').onclick = () => w.classList.toggle('big');
      dragWin(w);
    }
    w.querySelector('video').srcObject = stream;
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
      return `<div class="hface ${speaking ? 'speaking' : ''}" title="${esc(nameOf(m.id))}${m.muted ? ' (muted)' : ''}${m.sharing ? ' · sharing screen' : ''}" style="background:${esc(colorOf(m.id))}">${esc(initials(nameOf(m.id)))}${m.muted ? '<i class="mute">🔇</i>' : ''}${m.sharing ? '<i class="shr">🖥</i>' : ''}</div>`;
    }).join('');
    box.innerHTML = inCall ? `
        <div class="hrow">${faces}</div>
        <div class="hctl">
          <button class="hbtn ${muted ? 'on' : ''}" id="h-mute" title="Mute (Ctrl Shift M)">${muted ? '🔇' : '🎙️'}</button>
          <button class="hbtn ${screen ? 'on' : ''}" id="h-share" title="Share your screen">🖥</button>
          <button class="hbtn leave" id="h-leave" title="Leave huddle">Leave</button>
        </div>`
      : `<button class="item" id="h-join"><svg class="i" style="width:16px;height:16px;color:var(--accent-2)"><use href="#i-mic"/></svg>${n ? 'Join huddle' : 'Start a huddle'}<span class="n">${n ? n + ' in' : ''}</span></button>${n ? `<div class="hrow small">${faces}</div>` : ''}`;
    const q = s => box.querySelector(s);
    if (q('#h-join')) q('#h-join').onclick = join;
    if (q('#h-mute')) q('#h-mute').onclick = toggleMute;
    if (q('#h-share')) q('#h-share').onclick = share;
    if (q('#h-leave')) q('#h-leave').onclick = () => leave();
  }

  C.on('huddle', sync);
  C.on('rtc', onSignal);
  C.on('status', s => { if (s.status !== 'online' && inCall) leave(true); });
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); inCall ? toggleMute() : join(); } });
  addEventListener('beforeunload', () => leave());
  document.addEventListener('DOMContentLoaded', renderBar);
  setTimeout(renderBar, 0);

  window.TribeHuddle = { join, leave, toggleMute, share, inCall: () => inCall, roster: () => roster,
    debug: () => [...peers].map(([id, p]) => ({ id, state: p.pc.connectionState, audio: !!(p.audio && p.audio.srcObject && p.audio.srcObject.getAudioTracks().length) })) };
})();
