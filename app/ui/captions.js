// Huddle captions. Anyone in the huddle can turn captions on; each person then chooses whether to share
// their own (off until they agree). Sharing people transcribe their own mic in the browser and send final
// lines; everyone in the huddle sees the last two in a strip above the controls. The server keeps the
// transcript and turns it into meeting notes when the huddle ends or someone presses "End & summarize".
(function () {
  const C = window.TribeClient, SP = () => window.TribeSpeech;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cs = { on: false, sharing: [], notes: [], by: null, meeting: null };
  let lines = [], mine = '', lastBox = null, inCallNow = false;

  const meId = () => (C.state().me || {}).id;
  const nameOf = id => ((C.state().members || []).find(m => m.id === id) || {}).name || 'someone';
  const huddleIds = () => (C.state().huddle || []).map(h => h.id);
  const sharingMe = () => cs.on && cs.sharing.includes(meId());

  // Transcribe my own mic only while captions are on, I'm in the call, and I agreed to share.
  function syncListening() {
    const sp = SP(); if (!sp) return;
    const want = inCallNow && sharingMe() && sp.supported();
    const has = sp.active().includes('captions');
    if (want && !has) sp.use('captions', {
      label: 'captions',
      onFinal: text => { mine = ''; C.send({ type: 'caption', text, at: new Date().toISOString() }); },
      onInterim: text => { mine = text; drawLines(); },
      onStop: () => { C.send({ type: 'caption-share', on: false }); },
    });
    else if (!want && has) { sp.release('captions'); mine = ''; }
  }

  function linesHtml() {
    const shown = lines.slice(-2).map(l => `<div class="cap-line"><b>${esc(l.name)}</b><span>${esc(l.text)}</span></div>`);
    if (mine) shown.push(`<div class="cap-line interim"><b>${esc(nameOf(meId()))}</b><span>${esc(mine)}</span></div>`);
    return shown.slice(-2).join('') || '<div class="cap-line empty">Captions appear here as people talk.</div>';
  }
  function drawLines() { const el = lastBox && lastBox.querySelector('.cap-lines'); if (el) el.innerHTML = linesHtml(); }

  function pillHtml() {
    const inH = new Set(huddleIds()), out = [];
    if (cs.on) {
      const who = cs.sharing.filter(id => inH.has(id)).map(nameOf);
      out.push(`<span class="vpill" title="These people's speech is being transcribed for the huddle">${'<span class="rec-dot"></span>'}captions${who.length ? ' · ' + esc(who.join(', ')) : ' · nobody yet'}</span>`);
    }
    const notes = cs.notes.filter(id => inH.has(id)).map(nameOf);
    if (notes.length) out.push(`<span class="vpill" title="Capturing their own speech to personal notes"><span class="rec-dot"></span>notes · ${esc(notes.join(', '))}</span>`);
    return out.join('');
  }

  // Called by huddle.js after every render of the huddle box.
  function decorate(box, inCall) {
    lastBox = box; inCallNow = !!inCall;
    syncListening();
    const pills = pillHtml();
    if (!inCall) {
      if (pills) box.insertAdjacentHTML('beforeend', `<div class="cap-pills">${pills}</div>`);
      return;
    }
    const ctl = box.querySelector('.hctl'); if (!ctl) return;
    const sp = SP(), can = sp && sp.supported();
    // CC toggle in the controls
    const cc = document.createElement('button');
    cc.className = 'hbtn cc ' + (cs.on ? 'on' : ''); cc.id = 'h-cc'; cc.textContent = 'CC';
    cc.title = cs.on ? 'Turn captions off for the huddle' : 'Turn on captions for the huddle (each person chooses whether to share theirs)';
    cc.setAttribute('aria-pressed', cs.on);
    cc.onclick = () => C.send({ type: 'captions', on: !cs.on });
    ctl.insertBefore(cc, ctl.querySelector('#h-leave'));
    if (!cs.on) { if (pills) ctl.insertAdjacentHTML('beforebegin', `<div class="cap-pills">${pills}</div>`); return; }

    const strip = document.createElement('div');
    strip.className = 'cap-strip'; strip.id = 'cap-strip';
    const share = sharingMe()
      ? `<button class="cap-btn" id="cap-share" title="Stop transcribing your mic">Stop sharing mine</button>`
      : can ? `<button class="cap-btn primary" id="cap-share" title="Your speech is transcribed on this device and shared with the huddle">Share my captions</button>`
        : `<span class="cap-hint" title="${esc(sp ? sp.HINT : '')}">This browser can't transcribe; you still see captions.</span>`;
    strip.innerHTML = `<div class="cap-pills">${pills}</div><div class="cap-lines" aria-live="polite">${linesHtml()}</div>
      <div class="cap-actions">${share}<button class="cap-btn" id="cap-end" title="Write meeting notes from the transcript now">End &amp; summarize</button></div>`;
    ctl.parentNode.insertBefore(strip, ctl);
    const sb = strip.querySelector('#cap-share');
    if (sb) sb.onclick = () => C.send({ type: 'caption-share', on: !sharingMe() });
    strip.querySelector('#cap-end').onclick = () => { C.send({ type: 'meeting-end' }); window.TribeApp && window.TribeApp.toast('Writing meeting notes… they show up in Docs.'); };
  }
  C.on('ws', m => {
    if (m.type === 'captions') {
      const wasOn = cs.on;
      cs = { on: !!m.on, sharing: m.sharing || [], notes: m.notes || [], by: m.by, meeting: m.meeting };
      if (!cs.on) { mine = ''; if (wasOn) lines = []; }
      if (cs.on && !wasOn && m.by !== meId() && huddleIds().includes(meId())) window.TribeApp && window.TribeApp.toast(`${nameOf(m.by)} turned on captions. Yours stay private unless you choose "Share my captions".`);
      redraw();
    }
    if (m.type === 'caption') { lines.push({ by: m.by, name: m.name, text: m.text }); lines = lines.slice(-20); if (m.by === meId()) mine = ''; drawLines(); }
  });
  C.on('hello', () => C.send({ type: 'voice-sync' }));
  C.on('huddle', () => setTimeout(syncListening, 0));

  // Ask huddle.js to draw again (its renderBar runs on every huddle event and calls decorate).
  function redraw() {
    syncListening();
    if (window.TribeHuddle && typeof window.TribeHuddle.render === 'function') window.TribeHuddle.render();
  }

  window.TribeCaptions = { decorate, state: () => cs, lines: () => lines.slice() };
})();
