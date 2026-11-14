// Moving and 3D backgrounds in the website designer (feat/site-3d): the controls. The model is app/ui/sitefx.js, the
// drawing app/ui/sitefx/fx.js. sitedesigner.js owns the designer and calls in here at three points:
//   picker()            a "3D and motion" group in the section picker: one tile per background; a tile adds an intro
//                       section with that background behind it
//   row(box, api, b)    "Moving background" in the Edit panel of the selected section: which one, speed, amount,
//                       strength, the two colours (from the site's palette) and whether it moves on phones
//   opened(api)         keeps the designer's small api ({ cfg, commit, say, page, select, … }) for the tile clicks
// Every change is one ordinary commit, so Undo takes it back and Flint's "site.fx" steps do the same things by sentence.
//   window.TribeSiteFxUI = { picker(), row(box, api, block), opened(api) }
(function () {
  'use strict';
  const FX = () => window.TribeSiteFx, S = () => window.TribeSiteCfg;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s) : s);
  let api = null;
  const COLNAME = { accent: 'Main colour', ink: 'Text colour', muted: 'Quiet colour' };

  function picker() {
    if (!FX()) return '';
    const tile = k => { const K = FX().KINDS[k]; return `<button type="button" class="wdz-pkb sfx-tile" data-fxadd="${k}" title="${esc(T(K.about))}"><img src="sitefx/thumbs/${k}.jpg" width="72" height="45" alt="" loading="lazy"><small>${esc(T(K.name))}</small></button>`; };
    const flat = FX().LIST.filter(k => !FX().KINDS[k].three), deep = FX().LIST.filter(k => FX().KINDS[k].three);
    return `<p class="wdz-eyebrow">${esc(T('3D and motion'))}</p>
      <div class="wdz-pk"><b>${esc(T('Moving background'))}</b><span class="wdz-pkv">${flat.map(tile).join('')}</span></div>
      <div class="wdz-pk"><b>${esc(T('3D background'))}</b><span class="wdz-pkv">${deep.map(tile).join('')}</span><p class="sfx-note">${esc(T('Adds an intro section with the background behind it. The words on top stay yours to edit.'))} ${esc(T(FX().CREDIT))}</p></div>`;
  }

  function row(box, a, b) {
    if (!FX() || !box || !b || b.type === 'divider') return; api = a || api;
    const f = b.fx ? FX().clean(b.fx) : null, K = FX().KINDS;
    const slider = (key, label, lo, hi, val, low, high) => `<label class="wdz-f sfx-range"><span>${esc(T(label))}</span><input type="range" min="${lo}" max="${hi}" step="0.05" value="${val}" data-sfx="${key}" aria-label="${esc(T(label))}"><small aria-hidden="true"><i>${esc(T(low))}</i><i>${esc(T(high))}</i></small></label>`;
    const colour = (key, label, val) => `<label class="wdz-f"><span>${esc(T(label))}</span><select class="input" data-sfx="${key}">${FX().COLS.map(c => `<option value="${c}"${c === val ? ' selected' : ''}>${esc(T(COLNAME[c]))}</option>`).join('')}</select></label>`;
    const wrap = document.createElement('div'); wrap.className = 'sfx-box'; wrap.id = 'sfx-box';
    wrap.innerHTML = `<p class="wdz-eyebrow">${esc(T('Moving background'))}</p>
      <label class="wdz-f"><span>${esc(T('Behind this section'))}</span><select class="input" data-sfx="kind" id="sfx-kind"><option value="">${esc(T('None'))}</option><optgroup label="${esc(T('Moving background'))}">${FX().LIST.filter(k => !K[k].three).map(k => `<option value="${k}"${f && f.kind === k ? ' selected' : ''}>${esc(T(K[k].name))}</option>`).join('')}</optgroup><optgroup label="${esc(T('3D background'))}">${FX().LIST.filter(k => K[k].three).map(k => `<option value="${k}"${f && f.kind === k ? ' selected' : ''}>${esc(T(K[k].name))}</option>`).join('')}</optgroup></select></label>
      ${f ? `<p class="wdz-hint">${esc(T(K[f.kind].about))}</p>
      ${slider('s', 'Speed', 0.2, 2.5, f.s, 'Slow', 'Fast')}${slider('d', 'Amount', 0.4, 2, f.d, 'Few', 'Many')}${slider('i', 'Strength', 0.2, 1.6, f.i, 'Faint', 'Strong')}
      <div class="sfx-two">${colour('c', 'Colour', f.c)}${colour('c2', 'Second colour', f.c2)}</div>
      <label class="sfx-check"><input type="checkbox" data-sfx="p"${f.p ? ' checked' : ''}> <span>${esc(T('Move on phones too'))}</span></label>
      <p class="wdz-hint">${esc(T('Off: phones show a still picture. People who ask their device for less motion always get the still picture.'))}</p>
      <p class="wdz-row"><button type="button" class="btn sm ghost" data-sfx="off">${esc(T('Remove the moving background'))}</button></p>` : `<p class="wdz-hint">${esc(T('Pick one to put gentle motion behind this section. Or tell Flint: “add a 3D background”.'))}</p>`}`;
    box.appendChild(wrap);
    const set = patch => { const c = api.cfg(), pg = api.page(); api.commit(FX().setFx(c, pg, b.id, patch)); };
    wrap.addEventListener('change', e => {
      const el = e.target.closest('[data-sfx]'); if (!el) return; const k = el.dataset.sfx;
      if (k === 'kind') return set(el.value ? { kind: el.value } : null);
      if (k === 'p') return set({ p: el.checked ? 1 : 0 });
      if (k === 'c' || k === 'c2') return set({ [k]: el.value });
      set({ [k]: +el.value });
    });
    wrap.addEventListener('click', e => { if (e.target.closest('[data-sfx="off"]')) set(null); });
  }

  // a tile in the picker: a new intro section with this background, just above the footer
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-fxadd]'); if (!t || !api || !FX() || !S()) return;
    e.preventDefault(); e.stopPropagation();
    const kind = t.dataset.fxadd, r = S().addBlock(api.cfg(), api.page(), 'hero', 'center'); if (!r || !r.block) return;
    api.commit(FX().setFx(r.cfg, api.page(), r.block.id, { kind }));
    api.select(r.block.id);
    const p = document.getElementById('wdz-picker'); if (p) p.hidden = true;
    api.say(T('Added an intro section with a moving background. Click its words to change them.'));
  }, true);

  window.TribeSiteFxUI = { picker, row, opened: a => { api = a; if (FX()) FX().preload(false); } };
})();
