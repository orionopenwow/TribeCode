// Website: the project's own public page (Docs & Files › Website, #/docs/website).
// Left: the page's text, which sections show, "Keep it updated automatically", Build, and the team's suggestions
// (the host or the project lead approves or declines; everyone else sees "Suggest an edit").
// Right (below on phones): the built page in a sandboxed iframe (no scripts, its own opaque origin, a signed preview
// link instead of the member's key). Server: server/showcase.js (/api/projects/:id/website).
//   window.TribeWebsite = { open(), load(), overviewLink(project) }
(function () {
  const C = window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const NAME = 'website';
  const pid = () => (window.TribeProjects && window.TribeProjects.current()) || (C.project && C.project()) || '';
  const api = (p, o) => C.api(`/projects/${encodeURIComponent(pid())}/website${p || ''}`, o);
  const SEC = { about: 'About', shots: 'Screens', play: 'Play / Try it', palette: 'Colors', news: "What's new", credits: 'Credits', repo: 'Code link' };
  const FIELDS = [['headline', 'Headline', 'input', 80], ['tagline', 'Tagline', 'input', 160], ['about', 'About', 'textarea', 2000], ['footer', 'Footer line', 'input', 160], ['playUrl', 'Play link (optional, https)', 'input', 300]];
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };

  let open = false, data = null, drawnFor = null, dirty = false, device = 'desktop';
  function section() {
    let s = document.getElementById('view-' + NAME);
    if (!s) { const main = $('#main') || $('.main'); if (!main) return null; s = document.createElement('section'); s.id = 'view-' + NAME; s.className = 'hidden'; s.setAttribute('aria-label', 'Website'); main.appendChild(s); }
    return s;
  }

  // ---------- view mounting (beside app.js views, like agentshub.js) ----------
  function show() {
    const sec = section(); if (!sec) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    document.querySelectorAll('[data-nav].on, [data-go].on').forEach(b => b.classList.remove('on'));
    try { C.sendActivity && C.sendActivity('Website'); } catch {}
    load();
  }
  function hide() { const sec = section(); if (sec) sec.classList.add('hidden'); open = false; }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  if (C && C.on) {
    C.on('ws', m => { if (m && m.type === 'website' && m.project === pid()) { if (open) load(true); overviewLink(); } });
    C.on('project', () => { drawnFor = null; dirty = false; if (open) load(); });
    C.on('hello', () => { if (open) load(true); });
  }

  async function load(quiet) {
    const sec = section(); if (!sec) return;
    if (!pid()) { drawnFor = null; sec.innerHTML = `<div class="wb-wait wb-nopj"><span class="eyebrow">Website</span><h2>Open a project first</h2><p>Each project has its own website. Pick one, or start one on Home.</p><button class="btn primary" id="wb-home">Go to Home</button></div>`; const h = $('#wb-home'); if (h) h.onclick = () => (window.TribeHub ? window.TribeHub.open('home') : window.TribeApp && window.TribeApp.show('hub')); return; }   // feat/tasks-company: never a blank page
    if (!quiet && drawnFor !== pid()) sec.innerHTML = '<div class="wb-wait">Loading…</div>';
    try { data = (await api('')).website; } catch (e) { sec.innerHTML = `<div class="wb-wait">${esc(e.message)}</div>`; return; }
    if (drawnFor !== pid() || !$('#wb-root')) { draw(); drawnFor = pid(); dirty = false; const vb = $('#wb-versions'); if (vb && window.TribeSiteShelf) window.TribeSiteShelf.render(vb, pid(), { head: false }); const ip = $('#wb-inpv'); if (ip) ip.onclick = async () => { if (!window.TribePreview) return; await window.TribePreview.open(); window.TribePreview.setSource('site'); }; }
    else { if (!dirty) fill(); drawToggles(); drawStatus(); drawSugs(); drawStarted(); const ae = document.activeElement; if (!(ae && ae.closest && ae.closest('#wb-gen') && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) drawGen(); drawPreview(); }
  }
  // feat/customize: the generator panel (app/ui/sitegen.js) and the Draft / Live preview switch
  let pvMode = null;
  function drawGen() {
    const box = $('#wb-gen'); if (!box || !window.TribeSiteGen) { if (box) box.remove(); return; }
    window.TribeSiteGen.draw(box, data, { api, toast, set: w => { data = w; if (w.gen && w.gen.draft && w.gen.unpublished) pvMode = 'draft'; drawGen(); drawStatus(); drawPreview(); overviewLink(); } });
  }

  // feat/tasks-company: the team already started a website that isn't a builder draft: say where it is and open it
  function drawStarted() {
    const box = $('#wb-started'), sd = data && data.started; if (!box) return;
    const show = !!sd && sd.kind !== 'draft' && !(data.gen && data.gen.draft);
    box.classList.toggle('hidden', !show); if (!show) { box.innerHTML = ''; return; }
    const html = `<div class="sec-head"><span class="eyebrow">Already started</span><h2>Your team's website</h2></div>
      <p class="wb-note">It's in <code>${esc(sd.path)}</code> (${esc(sd.label)})${sd.at ? `, changed ${esc(ago(sd.at))}` : ''}. Keep going from there${sd.kind === 'built' ? ': edit the text below and build it again, or look at it now' : sd.kind === 'repo' ? '. The builder below makes a separate page in site/, so only use it if you want a fresh one' : ''}.</p>
      <div class="wb-acts">${sd.kind === 'built' && data.previewUrl ? '<button class="btn primary" id="wb-st-show">Show the website</button>' : ''}${sd.kind === 'repo' ? '<button class="btn primary" id="wb-st-code">Open the code</button>' : ''}</div>`;
    if (box.innerHTML !== html) box.innerHTML = html;
    const sh = $('#wb-st-show'); if (sh) sh.onclick = async () => { if (!window.TribePreview) return window.open(data.previewUrl, '_blank', 'noopener'); await window.TribePreview.open(); window.TribePreview.setSource('site'); };
    const cd = $('#wb-st-code'); if (cd) cd.onclick = () => { if (window.TribeShell) window.TribeShell.go('docs-files'); setTimeout(() => { try { window.TribeCodeFiles && window.TribeCodeFiles.set('code'); } catch {} }, 120); };
  }

  // ---------- drawing ----------
  // fix/batch-fixes: Files › Website lists the project's site design (the designer keeps one per project) with Open designer
  async function designs() {
    const box = $('#wb-designs'), p = pid(); if (!box || !p) return;
    let r = null; try { r = await C.api(`/projects/${encodeURIComponent(p)}/site-config`); } catch {}
    if (p !== pid() || !box.isConnected) return;
    const c = r && r.config, btn = $('#wb-design');
    if (btn) btn.textContent = c ? 'Open the designer' : 'Start a design';
    if (!c) { box.innerHTML = '<p class="wb-hint">No design yet: pick a template and Flint fills it in from the project.</p>'; return; }
    const n = (c.pages || []).length, when = r.savedAt ? ago(r.savedAt) : '';
    box.innerHTML = `<button type="button" class="wb-dsg" id="wb-dsg-open" aria-label="Open ${esc(c.name || 'the website')} in the designer"><b>${esc(c.name || 'Untitled website')}</b><small>${n} page${n === 1 ? '' : 's'}${c.template ? ' · ' + esc(c.template) : ''}${when ? ' · saved ' + esc(when) + (r.savedBy ? ' by ' + esc(r.savedBy) : '') : ''}</small><span class="wb-dsg-go">Open designer</span></button>`;
    $('#wb-dsg-open').onclick = () => window.TribeSiteDesigner && window.TribeSiteDesigner.open({ pid: pid() });
  }
  let dsgT = 0; addEventListener('tribe:site-draft', e => { if (e.detail && !e.detail.dirty && e.detail.pid === pid()) { clearTimeout(dsgT); dsgT = setTimeout(designs, 300); } });
  function draw() {
    const d = data, m = d.canManage;
    section().innerHTML = `<div class="wb" id="wb-root">
      <div class="wb-edit">
        <section class="wb-sec wb-started hidden" id="wb-started" aria-live="polite"></section>
        <section class="wb-sec wb-designer" id="wb-designer"><div class="sec-head"><span class="eyebrow">Website designer</span><h2>Design it block by block</h2></div>
          <p class="wb-hint">Templates, pages, buttons that go somewhere, pictures, a real dark mode, Undo, and Download HTML. Flint edits it with you, free.</p>
          <div class="wb-designs" id="wb-designs" aria-live="polite"></div>
          <div class="wb-acts"><button class="btn primary" id="wb-design" type="button">Open the designer</button></div></section>
        <section class="wb-sec wb-gen" id="wb-gen"></section>
        <section class="wb-sec">
          <div class="sec-head"><span class="eyebrow">Page text</span><h2>What it says</h2></div>
          ${m ? '' : '<p class="wb-note">The host or the project lead edits the page. Suggest a change below.</p>'}
          <div class="wb-fields">${FIELDS.map(([k, label, kind, max]) => `<label class="wb-field"><span>${esc(label)}</span>${kind === 'textarea'
            ? `<textarea class="input wb-in" id="wb-${k}" data-f="${k}" rows="5" maxlength="${max}" ${m ? '' : 'readonly'}></textarea>`
            : `<input class="input wb-in" id="wb-${k}" data-f="${k}" maxlength="${max}" autocomplete="off" ${m ? '' : 'readonly'}>`}</label>`).join('')}</div>
        </section>
        <section class="wb-sec">
          <div class="sec-head"><span class="eyebrow">On the page</span><h2>Sections</h2></div>
          <div class="wb-chips" id="wb-secs"></div>
          <div id="wb-shots"></div>
        </section>
        <section class="wb-sec">
          <div class="sec-head"><span class="eyebrow">Publishing</span><h2>Build and keep fresh</h2></div>
          <button class="toggle wb-auto" id="wb-auto" role="switch" aria-checked="false" ${m ? '' : 'disabled'}><span>Keep it updated automatically<small>Rebuilds when the bio, picture, vision, screenshots, people or saved changes change${d.inRepo ? '; the autopilot commits site/' : ''}.</small></span><span class="switch"></span></button>
          <div class="wb-acts">${m ? '<button class="btn" id="wb-save">Save</button>' : ''}<button class="btn primary" id="wb-build" ${data.canSuggest || m ? '' : 'disabled'}>Build the site</button><button class="btn" id="wb-tpl" title="16 ready-made website templates you customize in a short form">Start from a template</button></div>
          <p class="wb-status" id="wb-status"></p>
          <p class="wb-hint" id="wb-hint"></p>
        </section>
        <section class="wb-sec" id="wb-sugs-sec">
          <div class="sec-head"><span class="eyebrow">Suggestions</span><h2 id="wb-sugs-title">Ideas from the team</h2></div>
          ${!m && d.canSuggest ? `<div class="wb-suggest" id="wb-suggest"><span class="wb-lbl">Suggest an edit</span>
            <select class="input" id="wb-sug-field">${Object.entries(d.suggestable).map(([k, l]) => `<option value="${esc(k)}">${esc(l[0].toUpperCase() + l.slice(1))}</option>`).join('')}</select>
            <textarea class="input" id="wb-sug-text" rows="3" maxlength="2000" placeholder="Your wording"></textarea>
            <button class="btn primary" id="wb-sug-send">Send suggestion</button></div>` : ''}
          <div class="wb-sugs" id="wb-sugs"></div>
        </section>
        <section class="wb-sec wb-versions" id="wb-versions-sec">
          <div class="sec-head"><span class="eyebrow">Website</span><h2>Saved designs</h2></div>
          <div id="wb-versions"></div>
        </section>
      </div>
      <section class="hero-card wb-preview" aria-label="Preview">
        <div class="wb-pv-head"><span class="eyebrow">Preview</span>
          <div class="wb-dev wb-pvm hidden" id="wb-pvm" role="group" aria-label="Which page"><button class="wb-devb" data-pvm="draft">Draft</button><button class="wb-devb" data-pvm="live">Live</button></div>
          <div class="wb-dev" role="group" aria-label="Preview width"><button class="wb-devb" data-dev="desktop">Desktop</button><button class="wb-devb" data-dev="phone">Phone</button></div>
          <a class="linkish wb-open hidden" id="wb-open" target="_blank" rel="noopener noreferrer">Open</a><button type="button" class="linkish" id="wb-inpv" title="Open it in the preview: click anything and tell Flint what to change">Edit in the preview</button></div>
        <div class="wb-frame-box" id="wb-frame-box"></div>
      </section>
    </div>`;
    fill(); drawToggles(); drawStatus(); drawSugs(); drawGen(); drawPreview(); drawStarted();
    const root = $('#wb-root');
    root.querySelectorAll('[data-pvm]').forEach(b => b.onclick = () => { pvMode = b.dataset.pvm; drawPreview(); });
    root.addEventListener('input', e => { if (e.target.closest('.wb-in')) dirty = true; });
    $('#wb-auto').onclick = async () => {
      const on = $('#wb-auto').getAttribute('aria-checked') !== 'true';
      $('#wb-auto').setAttribute('aria-checked', String(on));
      try { data = (await api('', { method: 'PUT', body: { auto: on } })).website; toast(on ? 'The website now keeps itself up to date' : 'Automatic updates are off'); drawStatus(); drawPreview(); }
      catch (e) { toast(e.message); $('#wb-auto').setAttribute('aria-checked', String(!on)); }
    };
    if ($('#wb-save')) $('#wb-save').onclick = () => save().then(ok => ok && toast('Saved'));
    const wd = $('#wb-design'); if (wd) wd.onclick = () => window.TribeSiteDesigner && window.TribeSiteDesigner.open({ pid: pid() });   // feat/flint-site: the website designer
    designs();
    const wt = $('#wb-tpl'); if (wt) wt.onclick = () => window.TribeSiteLib && window.TribeSiteLib.open();   // website templates (sitelib.js)
    $('#wb-build').onclick = async () => {
      const b = $('#wb-build'); b.disabled = true; b.textContent = 'Building…';
      try {
        if (data.canManage && !(await save())) return;
        const r = await api('/build', { method: 'POST' }); data = r.website;
        toast(r.changed ? 'The website is built' : 'Already up to date'); drawStatus(); drawPreview(); overviewLink();
      } catch (e) { toast(e.message); }
      finally { b.disabled = false; b.textContent = 'Build the site'; }
    };
    const send = $('#wb-sug-send');
    if (send) send.onclick = async () => {
      const text = $('#wb-sug-text').value.trim(); if (!text) { $('#wb-sug-text').focus(); return; }
      send.disabled = true;
      try { await api('/suggest', { method: 'POST', body: { field: $('#wb-sug-field').value, text } }); $('#wb-sug-text').value = ''; toast('Suggestion sent'); load(true); }
      catch (e) { toast(e.message); } finally { send.disabled = false; }
    };
    root.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => { device = b.dataset.dev; drawPreview(); });
  }
  function fill() {
    for (const [k] of FIELDS) {
      const el = $(`#wb-${k}`); if (!el) continue;
      el.value = data.fields[k] || '';
      el.placeholder = k === 'playUrl' ? 'https://… (else the app\'s own index.html)' : (k === 'about' ? (data.defaults[k] || '').slice(0, 400) : (data.defaults[k] || '').replace(/\s+/g, ' ').slice(0, 140)) || (k === 'tagline' ? 'One line: what is it?' : '');
    }
  }
  function drawToggles() {
    const m = data.canManage, box = $('#wb-secs'); if (!box) return;
    box.innerHTML = data.sectionList.map(k => `<label class="wb-chip"><input type="checkbox" data-sec="${esc(k)}" ${data.sections[k] !== false ? 'checked' : ''} ${m ? '' : 'disabled'}><span>${esc(SEC[k] || k)}</span></label>`).join('');
    const sh = $('#wb-shots');
    const picked = Array.isArray(data.shots) ? data.shots : data.screens.slice(0, 3).map(s => s.slug);
    sh.innerHTML = data.screens.length ? `<span class="wb-lbl">Featured screenshots</span><div class="wb-chips">${data.screens.slice(0, 12).map(s => `<label class="wb-chip"><input type="checkbox" data-shot="${esc(s.slug)}" ${picked.includes(s.slug) ? 'checked' : ''} ${m ? '' : 'disabled'}><span>${esc(s.name)}</span></label>`).join('')}</div>`
      : '<p class="wb-note">No screenshots yet. Post some in Visuals (or let your agent call add_visual) to feature them.</p>';
    box.parentElement.querySelectorAll('input[type=checkbox]').forEach(i => i.onchange = () => { dirty = true; });
    const a = $('#wb-auto'); if (a) a.setAttribute('aria-checked', String(!!data.auto));
  }
  function drawStatus() {
    const s = $('#wb-status'); if (!s) return;
    const b = data.built;
    s.innerHTML = data.exists && b ? `Built ${esc(ago(b.at))}${b.auto ? ' automatically' : ''} · <code>${esc(data.path)}</code>${data.auto ? ` · <span class="wb-live">auto</span>${data.inRepo && !data.autopilot ? ' (turn on the autopilot to save it to the code)' : ''}` : ''}`
      : `Not built yet. It goes to <code>${esc(data.path)}</code>.`;
    $('#wb-hint').textContent = data.hint || '';
    const a = $('#wb-auto'); if (a) a.setAttribute('aria-checked', String(!!data.auto));
  }
  function drawSugs() {
    const box = $('#wb-sugs'); if (!box) return;
    const list = data.suggestions || [];
    $('#wb-sugs-title').textContent = data.open ? `${data.open} waiting` : 'Ideas from the team';
    box.innerHTML = list.length ? list.map(s => `<div class="wb-sug ${esc(s.status)}" data-sug="${esc(s.id)}">
        <div class="wb-sug-top"><b>${esc(s.byName)}</b><span class="faint">${esc(s.label)} · ${esc(ago(s.at))}</span>${s.status !== 'open' ? `<span class="wb-st">${esc(s.status)}${s.decidedByName ? ` by ${esc(s.decidedByName)}` : ''}</span>` : ''}</div>
        <p class="wb-sug-text">${esc(s.text)}</p>
        ${s.status === 'open' && data.canManage ? `<div class="wb-sug-acts"><button class="btn sm wb-approve" data-ok="${esc(s.id)}">Approve</button><button class="btn sm wb-decline" data-no="${esc(s.id)}">Decline</button></div>` : ''}</div>`).join('')
      : `<p class="wb-note">${data.canManage ? 'When someone suggests new wording, it shows up here for you to approve.' : 'Nothing suggested yet.'}</p>`;
    box.querySelectorAll('[data-ok], [data-no]').forEach(b => b.onclick = async () => {
      b.disabled = true; const ok = !!b.dataset.ok, id = b.dataset.ok || b.dataset.no;
      try { data = (await api(`/suggestions/${encodeURIComponent(id)}/${ok ? 'approve' : 'decline'}`, { method: 'POST' })).website; toast(ok ? 'Approved: the page is rebuilt' : 'Declined'); if (!dirty) fill(); drawSugs(); drawStatus(); drawPreview(); }
      catch (e) { toast(e.message); b.disabled = false; }
    });
  }
  function drawPreview() {
    const box = $('#wb-frame-box'); if (!box) return;
    document.querySelectorAll('.wb-devb').forEach(b => b.classList.toggle('on', b.dataset.dev === device));
    const open = $('#wb-open');
    const G = data.gen || {}, hasDraft = !!(G.draft && G.draftUrl), hasLive = !!(data.exists && data.previewUrl);
    if (!pvMode) pvMode = hasDraft && (G.unpublished || !hasLive) ? 'draft' : 'live';
    if (pvMode === 'draft' && !hasDraft) pvMode = 'live';
    if (pvMode === 'live' && !hasLive && hasDraft) pvMode = 'draft';
    const pvm = $('#wb-pvm'); if (pvm) { pvm.classList.toggle('hidden', !(hasDraft && hasLive)); pvm.querySelectorAll('[data-pvm]').forEach(b => b.classList.toggle('on', b.dataset.pvm === pvMode)); }
    if (pvMode === 'draft' && hasDraft) {
      const src = `${G.draftUrl}&v=${encodeURIComponent(G.draft.updated || '')}`;
      open.href = src; open.classList.remove('hidden');
      let f = $('#wb-frame');
      if (!f) { box.innerHTML = '<iframe id="wb-frame" class="wb-frame" title="Website preview" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" loading="lazy"></iframe>'; f = $('#wb-frame'); }
      box.classList.toggle('phone', device === 'phone');
      const key = 'draft:' + src.replace(/pt=[^&]+&?/, '');
      if (f.dataset.key !== key) { f.dataset.key = key; f.src = src; }
      return;
    }
    if (!data.exists || !data.previewUrl) {
      box.innerHTML = `<div class="wb-empty"><b>No page yet</b><span>Press <i>Build the site</i>: it uses the name, bio, picture, vision, screenshots and the people who built it.</span></div>`;
      open.classList.add('hidden'); return;
    }
    const src = `${data.previewUrl}&v=${encodeURIComponent((data.built && data.built.hash) || '')}`;
    open.href = src; open.classList.remove('hidden');
    let f = $('#wb-frame');
    if (!f) { box.innerHTML = '<iframe id="wb-frame" class="wb-frame" title="Website preview" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" loading="lazy"></iframe>'; f = $('#wb-frame'); }
    box.classList.toggle('phone', device === 'phone');
    const key = src.replace(/pt=[^&]+&?/, '');
    if (f.dataset.key !== key) { f.dataset.key = key; f.src = src; }
  }

  async function save() {
    const fields = {}; for (const [k] of FIELDS) { const el = $(`#wb-${k}`); if (el) fields[k] = el.value; }
    const sections = {}; document.querySelectorAll('#wb-secs [data-sec]').forEach(i => { sections[i.dataset.sec] = i.checked; });
    const shotBoxes = [...document.querySelectorAll('#wb-shots [data-shot]')];
    const body = { fields, sections, ...(shotBoxes.length ? { shots: shotBoxes.filter(i => i.checked).map(i => i.dataset.shot) } : {}) };
    try { data = (await api('', { method: 'PUT', body })).website; dirty = false; drawStatus(); return true; }
    catch (e) { toast(e.message); return false; }
  }

  // A small "Website" link on the project overview when the page exists (projects.js leaves #pj-site-slot for it).
  let olTimer = null;
  function overviewLink() {
    clearTimeout(olTimer);
    olTimer = setTimeout(async () => {
      const slot = $('#pj-site-slot'); if (!slot || !pid()) return;
      let d; try { d = (await api('')).website; } catch { return; }
      slot.innerHTML = d.exists ? ' · <button class="linkish pj-site" id="pj-site">Website</button>' : '';
      const b = $('#pj-site'); if (b) b.onclick = () => (window.TribeShell ? window.TribeShell.go('website') : show());
    }, 80);
  }

  window.TribeWebsite = { open: show, load, overviewLink };
})();
