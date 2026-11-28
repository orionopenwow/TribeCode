// Call Notes (live captions + the meeting transcript). Nothing is transcribed until someone in the call turns Notes
// on; then everyone in it sees "Notes on", each person's own mic is transcribed on their own device (labelled with
// their name; "Speaker" for a mic several people share) and anyone can pause theirs. Everyone in the call sees the
// last two lines with the speaker's name. The server merges everyone's lines into one transcript and saves the
// meeting notes (Files) when the call ends, Notes is turned off, or someone presses "End & summarize".
//   window.TribeCaptions = { decorate, state, lines, toggle, pause, setShared, rename }
(function () {
  const C = window.TribeClient, SP = () => window.TribeSpeech;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cs = { on: false, sharing: [], paused: [], shared: [], notes: [], by: null, meeting: null, dm: false };
  let lines = [], mine = '', lastBox = null, inCallNow = false;

  const meId = () => (C.state().me || {}).id;
  const nameOf = id => ((C.state().members || []).find(m => m.id === id) || {}).name || 'someone';
  const huddleIds = () => (C.state().huddle || []).map(h => h.id);
  const sharingMe = () => cs.on && cs.sharing.includes(meId());

  // Transcribe my own mic only while captions are on, I'm in the call, and I agreed to share.
  function syncListening() {
    const sp = SP(); if (!sp) return;
    const H = window.TribeHuddle, me = H && H.me ? H.me() : {};
    const want = (H && H.inCall ? H.inCall() : inCallNow) && sharingMe() && sp.supported() && !me.muted && !me.deaf;   // muted = not transcribed either
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
    const shown = lines.slice(-2).map(l => `<div class="cap-line"><b>${esc(l.name)}</b><span>${esc(l.text)}</span></div>`);   // the speaker's name on every line
    if (mine) shown.push(`<div class="cap-line interim"><b>${esc(nameOf(meId()))}</b><span>${esc(mine)}</span></div>`);
    return shown.slice(-2).join('') || '<div class="cap-line empty">Captions appear here as people talk.</div>';
  }
  function drawLines() { const el = lastBox && lastBox.querySelector('.cap-lines'); if (el) el.innerHTML = linesHtml(); }

  function pillHtml() {
    const inH = new Set(huddleIds()), out = [];
    if (cs.on) {
      const who = cs.sharing.filter(id => inH.has(id)).map(nameOf);
      out.push(`<span class="vpill" title="Notes is on: these people's mics are transcribed for the meeting notes">${'<span class="rec-dot"></span>'}Notes on${who.length ? ' · ' + esc(who.join(', ')) : ' · everyone paused'}</span>`);
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
    cc.title = cs.on ? 'Turn Notes off and save the meeting notes' : 'Turn on Notes: live captions and meeting notes (everyone in the call is told and can pause theirs)';
    cc.setAttribute('aria-pressed', cs.on);
    cc.onclick = () => C.send({ type: 'captions', on: !cs.on });
    ctl.insertBefore(cc, ctl.querySelector('#h-leave'));
    if (!cs.on) { if (pills) ctl.insertAdjacentHTML('beforebegin', `<div class="cap-pills">${pills}</div>`); return; }

    const strip = document.createElement('div');
    strip.className = 'cap-strip'; strip.id = 'cap-strip';
    const share = !can ? `<span class="cap-hint" title="${esc(sp ? sp.HINT : '')}">This browser can't transcribe; you still see captions.</span>`
      : sharingMe() ? `<button class="cap-btn" id="cap-share" title="Stop transcribing your mic">Pause mine</button>`
        : `<button class="cap-btn primary" id="cap-share" title="Your speech is transcribed on this device for the meeting notes">Resume mine</button>`;
    strip.innerHTML = `<div class="cap-pills">${pills}</div><div class="cap-lines" aria-live="polite">${linesHtml()}</div>
      <div class="cap-actions">${share}<button class="cap-btn" id="cap-end" title="Write meeting notes from the transcript now">End &amp; summarize</button></div>${summaryHtml()}`;
    ctl.parentNode.insertBefore(strip, ctl);
    const sb = strip.querySelector('#cap-share');
    if (sb) sb.onclick = () => C.send({ type: 'caption-share', on: !sharingMe() });
    const sum = strip.querySelector('#h-summary');
    if (sum) sum.onchange = () => setSummary(sum.checked, sum);
    strip.querySelector('#cap-end').onclick = () => { C.send({ type: 'meeting-end' }); window.TribeApp && window.TribeApp.toast('Writing meeting notes… they show up in Files.'); };
  }
  // "Post a summary after each huddle" (server/huddlesum.js): a project setting the host or the project's lead switches
  // here; everyone else sees that it is on. The summary and the mood go to the project's chat and, with a code repository, notes/huddles/.
  const project = () => (window.TribeProjects && window.TribeProjects.cur && window.TribeProjects.cur()) || null;
  const canSetSummary = p => !!p && ((C.state().me || {}).role === 'host' || p.role === 'host');
  function summaryHtml() {
    const p = project(); if (!p) return '';
    if (canSetSummary(p)) return `<label class="cap-check cap-sum" title="When the huddle ends: a short summary and the overall mood in ${esc(p.name)}'s chat${p.hasRepo ? ', and notes/huddles/ in its code repository' : ''}"><input type="checkbox" id="h-summary" ${p.huddleSummary ? 'checked' : ''}> Post a summary after the huddle</label>`;
    return p.huddleSummary ? `<div class="cap-check cap-sum">A summary is posted after the huddle</div>` : '';
  }
  async function setSummary(on, el) {
    const p = project(); if (!p) return;
    try {
      await C.api(`/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { huddleSummary: !!on } });
      p.huddleSummary = !!on;
      if (window.TribeProjects.refresh) window.TribeProjects.refresh();
      window.TribeApp && window.TribeApp.toast(on ? `A summary goes to ${p.name} after the huddle.` : 'No summary after the huddle.');
    } catch (e) { if (el) el.checked = !on; window.TribeApp && window.TribeApp.toast(e.message); }
  }

  C.on('ws', m => {
    if (m.type === 'captions') {
      const wasOn = cs.on;
      cs = { on: !!m.on, sharing: m.sharing || [], paused: m.paused || [], shared: m.shared || [], notes: m.notes || [], by: m.by, meeting: m.meeting, dm: !!m.dm };
      if (!cs.on) { mine = ''; if (wasOn) lines = []; }
      if (cs.on && !wasOn && m.by !== meId() && huddleIds().includes(meId())) window.TribeApp && window.TribeApp.toast(`${nameOf(m.by)} turned on Notes. What you say is transcribed for the meeting notes; pause yours any time.`);
      redraw(); document.dispatchEvent(new CustomEvent('tribe:notes'));
    }
    if (m.type === 'caption') {
      let i = lines.length; while (i > 0 && lines[i - 1].at > m.at) i--;   // everyone's lines, in the order they were said
      lines.splice(i, 0, { n: m.n, at: m.at, by: m.by, name: m.name, mic: m.mic || '', text: m.text }); lines = lines.slice(-200);
      if (m.by === meId()) mine = ''; drawLines(); document.dispatchEvent(new CustomEvent('tribe:notes'));
    }
    if (m.type === 'caption-renamed') { const l = lines.find(x => x.n === m.n); if (l) { l.name = m.name; drawLines(); document.dispatchEvent(new CustomEvent('tribe:notes')); } }
  });
  C.on('hello', () => C.send({ type: 'voice-sync' }));
  C.on('huddle', () => setTimeout(syncListening, 0));
  document.addEventListener('tribe:call', e => { if (e.detail && (e.detail.name === 'state' || e.detail.name === 'leave')) syncListening(); });

  // Ask huddle.js to draw again (its renderBar runs on every huddle event and calls decorate).
  function redraw() {
    syncListening();
    if (window.TribeHuddle && typeof window.TribeHuddle.render === 'function') window.TribeHuddle.render();
  }

  window.TribeCaptions = { decorate, state: () => cs, lines: () => lines.slice(), mine: () => mine,
    toggle: on => C.send({ type: 'captions', on: on == null ? !cs.on : !!on }),
    pause: paused => C.send({ type: 'caption-share', on: !paused }),
    setShared: shared => C.send({ type: 'caption-mic', shared: !!shared }),
    rename: (n, name) => C.send({ type: 'caption-rename', n, name }),
    supported: () => !!(SP() && SP().supported()) };
})();
