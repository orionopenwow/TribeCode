/* The free toolbox (toolbox.html, and the teaser on the homepage). Draws the tools from toolbox-data.json, which
   scripts/dev/site-toolbox.js generates from the app's own Studios list (templates/studios.json), so the site and the
   app never drift. The pictures are original flat drawings in the site's style, not screenshots: each project's own
   images have their own terms (assets/toolbox/CREDITS.md). Names and licences are marked translate="no"; everything
   else is plain English that i18n.js translates. No libraries. */
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BASE = (document.currentScript && document.currentScript.src || location.href).replace(/[^/]*$/, '').replace(/\?.*$/, '');

  // Small drawn cards, 240×120, flat shapes in the tool's own colour (var(--c)) on the page's surfaces.
  const svg = inner => `<svg class="tb-art" viewBox="0 0 240 120" aria-hidden="true" focusable="false">${inner}</svg>`;
  const ART = {
    cube: svg('<path class="a-line" d="M120 22l52 26v38l-52 26-52-26V48z"/><path class="a-fill" d="M120 22l52 26-52 26-52-26z"/><path class="a-line" d="M120 74v38"/><circle class="a-dot" cx="172" cy="48" r="4"/><circle class="a-dot" cx="68" cy="48" r="4"/><circle class="a-dot" cx="120" cy="22" r="4"/>'),
    brush: svg('<path class="a-fill" d="M40 86c18-30 40-34 62-22s42 6 62-26c6 30-12 52-44 56s-52 2-80-8z"/><path class="a-line" d="M150 30l34-14 8 12-30 20z"/><circle class="a-dot" cx="58" cy="40" r="7"/><circle class="a-soft" cx="84" cy="30" r="5"/><circle class="a-soft" cx="106" cy="38" r="4"/>'),
    play: svg('<rect class="a-line" x="38" y="22" width="164" height="76" rx="6"/><path class="a-soft" d="M38 78h164v14a6 6 0 0 1-6 6H44a6 6 0 0 1-6-6z"/><rect class="a-fill" x="66" y="58" width="16" height="20" rx="2"/><rect class="a-line" x="110" y="64" width="34" height="8" rx="2"/><rect class="a-line" x="156" y="50" width="26" height="8" rx="2"/><circle class="a-dot" cx="169" cy="40" r="4"/>'),
    timeline: svg('<rect class="a-line" x="30" y="20" width="180" height="46" rx="5"/><path class="a-fill" d="M112 34l18 9-18 9z"/><rect class="a-fill" x="30" y="76" width="70" height="10" rx="2"/><rect class="a-soft" x="104" y="76" width="50" height="10" rx="2"/><rect class="a-soft" x="30" y="92" width="40" height="10" rx="2"/><rect class="a-fill" x="74" y="92" width="96" height="10" rx="2"/><path class="a-line" d="M130 70v38"/>'),
    wave: svg('<path class="a-fill" d="M30 60h6V44h6v32h6V34h6v52h6V26h6v68h6V40h6v40h6V30h6v60h6V48h6v24h6V36h6v48h6V28h6v64h6V44h6v32h6V52h6v16h6V40h6v40h6V56h6v8h-180z"/><path class="a-line" d="M30 60h180"/>'),
    frames: svg('<rect class="a-line" x="34" y="20" width="60" height="80" rx="6"/><rect class="a-fill" x="42" y="30" width="44" height="18" rx="3"/><rect class="a-soft" x="42" y="54" width="44" height="6" rx="2"/><rect class="a-soft" x="42" y="64" width="30" height="6" rx="2"/><rect class="a-line" x="146" y="20" width="60" height="80" rx="6"/><rect class="a-soft" x="154" y="30" width="44" height="30" rx="3"/><rect class="a-fill" x="154" y="78" width="44" height="12" rx="6"/><path class="a-line" d="M94 60h52M138 54l8 6-8 6"/>'),
    pixels: svg('<g class="a-fill"><rect x="96" y="20" width="16" height="16"/><rect x="128" y="20" width="16" height="16"/><rect x="80" y="36" width="80" height="16"/><rect x="64" y="52" width="32" height="16"/><rect x="112" y="52" width="16" height="16"/><rect x="144" y="52" width="32" height="16"/><rect x="64" y="68" width="112" height="16"/><rect x="80" y="84" width="16" height="16"/><rect x="144" y="84" width="16" height="16"/></g><g class="a-soft"><rect x="96" y="52" width="16" height="16"/><rect x="128" y="52" width="16" height="16"/></g>'),
    record: svg('<rect class="a-line" x="34" y="22" width="120" height="76" rx="6"/><rect class="a-soft" x="44" y="32" width="100" height="40" rx="3"/><rect class="a-line" x="100" y="58" width="44" height="30" rx="3"/><circle class="a-fill" cx="186" cy="60" r="18"/><circle class="a-ring" cx="186" cy="60" r="26"/>'),
  };
  // ArtCraft's feature picture: three flat panels for the three things it is known for (2D layers, a 3D stage, a clip).
  const HERO = `<svg class="tb-hero-art" viewBox="0 0 560 300" aria-hidden="true" focusable="false">
    <rect class="a-panel" x="8" y="8" width="544" height="284" rx="12"/>
    <g transform="translate(28 34)"><rect class="a-line" width="152" height="150" rx="8"/>
      <rect class="a-soft" x="16" y="18" width="96" height="70" rx="4"/><rect class="a-fill" x="34" y="38" width="96" height="70" rx="4"/><rect class="a-line a-bg" x="52" y="60" width="84" height="70" rx="4"/>
      <circle class="a-dot" cx="94" cy="86" r="10"/><path class="a-line" d="M60 122l22-22 16 14 14-12 16 20"/></g>
    <g transform="translate(204 34)"><rect class="a-line" width="152" height="150" rx="8"/>
      <path class="a-soft" d="M16 118l60-22 60 22-60 20z"/><path class="a-line" d="M16 118l60-22 60 22-60 20zM46 107l60 20M106 107l-60 20"/>
      <rect class="a-fill" x="62" y="56" width="18" height="46" rx="9"/><circle class="a-fill" cx="71" cy="44" r="9"/>
      <path class="a-line" d="M112 36h22v16h-22zM134 40l10-6v20l-10-6"/><path class="a-dash" d="M112 50L84 70"/></g>
    <g transform="translate(380 34)"><rect class="a-line" width="152" height="150" rx="8"/>
      <rect class="a-soft" x="16" y="18" width="120" height="76" rx="4"/><path class="a-fill" d="M66 40l28 16-28 16z"/>
      <g class="a-line"><rect x="16" y="108" width="26" height="26" rx="3"/><rect x="48" y="108" width="26" height="26" rx="3"/><rect x="80" y="108" width="26" height="26" rx="3"/><rect x="112" y="108" width="24" height="26" rx="3"/></g>
      <rect class="a-fill" x="48" y="108" width="26" height="26" rx="3"/></g>
    <g class="a-cap"><text x="104" y="216" text-anchor="middle">2D</text><text x="280" y="216" text-anchor="middle">3D</text><text x="456" y="216" text-anchor="middle">MP4</text></g>
    <path class="a-line" d="M186 109h12M362 109h12"/>
    <rect class="a-soft" x="28" y="240" width="504" height="30" rx="6"/><rect class="a-fill" x="36" y="248" width="150" height="14" rx="3"/><rect class="a-line a-bg" x="194" y="248" width="96" height="14" rx="3"/><rect class="a-line a-bg" x="298" y="248" width="60" height="14" rx="3"/>
  </svg>`;

  const li = a => a.map(f => `<li>${esc(f)}</li>`).join('');
  const meta = t => `<p class="tb-meta mono" translate="no"><span>${esc(t.license)}</span><span>${t.platforms.map(esc).join(' · ')}</span></p>`;
  const links = (t, big) => `<p class="tb-links"><a class="btn ${big ? 'btn--light' : 'btn--dark btn--sm'}" href="${esc(t.url)}" rel="noopener">Get it</a><a class="tb-src" href="${esc(t.source)}" rel="noopener">Source code</a></p>`;
  const stands = t => `<p class="tb-kind"><span class="tb-kind__l mono">Stands in for a paid</span><b>${esc(t.kind)}</b></p>`;

  function feature(t) {
    return `<div class="tb-feature__art" style="--c:${esc(t.color)}">${HERO}<p class="tb-note mono">An illustration, not a screenshot</p></div>
      <div class="tb-feature__tx" id="tool-${esc(t.id)}"><p class="eyebrow mono">// featured</p><h2 id="tb-feature-title" translate="no">${esc(t.name)}</h2>${stands(t)}<p class="tb-what">${esc(t.what)}</p>
        <ul class="tb-list tb-list--two">${li(t.features.concat(t.more || []))}</ul>${meta(t)}${links(t, true)}</div>`;
  }
  function card(t) {
    return `<article class="tb-card" id="tool-${esc(t.id)}" style="--c:${esc(t.color)}">${ART[t.art] || ''}
      <h3 translate="no">${esc(t.name)}</h3>${stands(t)}<p class="tb-what">${esc(t.what)}</p><ul class="tb-list">${li(t.features)}</ul>${meta(t)}${links(t)}</article>`;
  }
  function teaser(tools) {
    return tools.slice(0, 6).map(t => `<a class="tbz__tool" href="toolbox.html#tool-${esc(t.id)}" style="--c:${esc(t.color)}"><b translate="no">${esc(t.name)}</b><span>${esc(t.kind)}</span></a>`).join('');
  }

  function draw(data) {
    const tools = data.tools || [];
    const f = document.getElementById('tb-feature'), g = document.getElementById('tb-grid'), z = document.getElementById('tbz-tools');
    if (f && tools[0]) { f.innerHTML = feature(tools[0]); f.id = 'tb-feature'; f.dataset.tool = tools[0].id; }
    if (g) g.innerHTML = tools.slice(1).map(card).join('');
    if (z) z.innerHTML = teaser(tools);
    document.documentElement.dataset.toolbox = String(tools.length);
    if (location.hash && /^#tool-/.test(location.hash)) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
  }
  fetch(BASE + 'toolbox-data.json').then(r => r.json()).then(draw).catch(() => { document.documentElement.dataset.toolbox = '0'; });
})();
