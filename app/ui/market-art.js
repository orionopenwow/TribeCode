// Marketplace pictures (feat/p10-market): every item that has no screenshot of its own gets a small drawn picture of
// what it really is, built from the item's own data, never a monogram and never someone else's logo:
//   MCP server   TribeCode plugged into it, with the .mcp.json name it adds
//   skill        its folder in .claude/skills with the skill's name
//   library/tool a terminal with its real install line
//   studio       an app window with a canvas and tools
//   widget       the project sidebar with that widget in it
//   starter      a browser window with its own address
//   assets       a grid of tiles
//   playbook / academy   a checklist with its first real steps
//   legal        a document to fill in
//   company      the seats it sets up (from templates/companies.json)
//   app kit      the real screen from App Creator, drawn small (TribeAppCreator.mini), or a phone frame
// Colours come from the tile's kind tint (market.css: currentColor + tokens), so dark and light both work.
// Public: window.TribeMarketArt = { svg(item), html(item) }
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const slug = it => (it.path ? String(it.path).split('/').pop() : String(it.title || it.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || 'skill';
  const T = (x, y, s, cls = 'ma-t', extra = '') => `<text x="${x}" y="${y}" class="${cls}"${extra}>${esc(s)}</text>`;
  const P = (x, y, w, h, r = 8, cls = 'ma-p') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${cls}"/>`;
  const L = (x, y, w, h = 6, cls = 'ma-l') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="${cls}"/>`;
  const dots = (x, y) => [0, 1, 2].map(i => `<circle cx="${x + i * 11}" cy="${y}" r="3.2" class="ma-dot"/>`).join('');
  const wrap = (body, label) => `<svg class="ma" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(label)}">${body}</svg>`;

  const DRAW = {
    connector(it) {
      const name = it.mcp && it.mcp.name ? it.mcp.name : cut(it.title, 14);
      return P(22, 52, 104, 56) + T(74, 85, 'TribeCode', 'ma-t', ' text-anchor="middle"') + P(194, 52, 104, 56, 8, 'ma-p ma-on') + T(246, 85, cut(it.title, 11), 'ma-t', ' text-anchor="middle"')
        + `<path d="M126 80h22M172 80h22" class="ma-s"/><rect x="148" y="68" width="24" height="24" rx="6" class="ma-a"/><path d="M155 74v5M165 74v5M153 79h14v3a7 7 0 0 1-14 0z" class="ma-ink"/>`
        + T(160, 140, `.mcp.json · ${cut(name, 22)}`, 'ma-m', ' text-anchor="middle"');
    },
    skill(it) {
      return P(52, 30, 216, 120) + `<path d="M52 52h216" class="ma-e"/>` + `<path d="M70 41l2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7z" class="ma-a"/>`
        + T(84, 46, 'SKILL.md', 'ma-m') + T(70, 76, cut(it.title, 26)) + L(70, 88, 150) + L(70, 100, 176) + L(70, 112, 120)
        + T(70, 137, `.claude/skills/${cut(slug(it), 22)}`, 'ma-m');
    },
    terminal(it, word) {
      const line = it.install ? String(it.install).split('\n')[0] : it.repo ? `git clone github.com/${it.repo}` : `# ${it.title}`;
      return P(26, 28, 268, 124, 10, 'ma-term') + dots(42, 42) + T(160, 46, cut(it.title, 24), 'ma-m', ' text-anchor="middle"')
        + T(42, 76, `$ ${cut(line, 34)}`, 'ma-code') + T(42, 98, `# ${word}`, 'ma-code ma-dim') + T(42, 120, cut(it.summary, 38), 'ma-code ma-dim') + `<rect x="42" y="130" width="8" height="12" class="ma-a"/>`;
    },
    library(it) { return DRAW.terminal(it, 'a library your agents can use'); },
    tool(it) { return DRAW.terminal(it, 'a tool for the crew'); },
    studio(it) {
      return P(26, 26, 268, 128, 10) + `<path d="M26 46h268M62 46v108" class="ma-e"/>` + dots(40, 36) + T(170, 40, cut(it.title, 22), 'ma-m', ' text-anchor="middle"')
        + [0, 1, 2, 3].map(i => `<rect x="36" y="${56 + i * 22}" width="16" height="16" rx="4" class="${i === 1 ? 'ma-a' : 'ma-l'}"/>`).join('')
        + `<circle cx="140" cy="100" r="28" class="ma-on"/><rect x="176" y="72" width="72" height="56" rx="8" class="ma-a" opacity=".55"/><path d="M96 140l40-30 30 20 26-16 40 26" class="ma-s"/>`;
    },
    widget(it) {
      return P(26, 22, 268, 136, 10) + `<path d="M118 22v136" class="ma-e"/>` + [0, 1, 2, 4].map(i => L(40, 40 + i * 22, i ? 58 : 44)).join('')
        + `<rect x="34" y="102" width="76" height="22" rx="6" class="ma-a"/>` + T(42, 117, cut(it.title, 10), 'ma-t ma-inv')
        + T(134, 48, cut(it.title, 20)) + L(134, 60, 120) + P(134, 74, 144, 66, 8, 'ma-p ma-on') + L(146, 88, 90) + L(146, 102, 110) + L(146, 116, 64);
    },
    'site-template'(it) {
      const addr = host(it.url) || (it.repo ? `${String(it.repo).split('/').pop()}.github.io` : 'your-site');
      return P(26, 22, 268, 136, 10) + `<path d="M26 44h268" class="ma-e"/>` + dots(40, 33) + P(84, 27, 190, 12, 6, 'ma-l') + T(92, 36, cut(addr, 30), 'ma-m ma-sm')
        + T(46, 74, cut(it.title, 24)) + L(46, 84, 150) + `<rect x="46" y="96" width="62" height="16" rx="5" class="ma-a"/>` + [0, 1, 2].map(i => P(46 + i * 80, 122, 70, 26, 6, 'ma-p ma-on')).join('');
    },
    'asset-pack'(it) {
      const cells = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const x = 40 + c * 62, y = 28 + r * 54, k = (r + c) % 3; cells.push(P(x, y, 52, 46, 8, k === 0 ? 'ma-a' : k === 1 ? 'ma-p ma-on' : 'ma-p')); if (k === 2) cells.push(`<circle cx="${x + 26}" cy="${y + 23}" r="11" class="ma-on"/>`); }
      return cells.join('') + T(40, 154, cut(it.title, 30));
    },
    playbook(it) {
      const steps = (it.steps && it.steps.length ? it.steps : [it.summary]).slice(0, 3);
      return P(38, 20, 244, 140) + T(56, 46, cut(it.title, 26)) + steps.map((s, i) => `<rect x="56" y="${60 + i * 30}" width="14" height="14" rx="4" class="${i === 0 ? 'ma-a' : 'ma-box'}"/>${i === 0 ? `<path d="M59 ${67 + i * 30}l3 3 5-6" class="ma-ink"/>` : ''}${T(78, 72 + i * 30, cut(s, 30), 'ma-b')}`).join('');
    },
    academy(it) { return DRAW.playbook(it); },
    legal(it) {
      return P(92, 16, 136, 148) + `<path d="M200 16v22h28" class="ma-e"/>` + T(106, 48, cut(it.title, 15), 'ma-t ma-sm') + [0, 1, 2, 3, 4, 5].map(i => L(106, 60 + i * 13, i % 3 === 2 ? 70 : 104, 5)).join('')
        + `<path d="M106 148h60" class="ma-s"/>` + T(106, 143, 'Fill in', 'ma-m ma-sm');
    },
    'company-template'(it) {
      const seats = (it.seats && it.seats.length ? it.seats : ['CEO', 'Build', 'Grow', 'Run']).slice(0, 5), top = seats[0], rest = seats.slice(1, 5), w = 62, gap = 10, x0 = 160 - (rest.length * w + (rest.length - 1) * gap) / 2;
      return P(118, 22, 84, 32, 8, 'ma-a') + T(160, 43, cut(top, 10), 'ma-t ma-inv', ' text-anchor="middle"') + `<path d="M160 54v18M${x0 + w / 2} 72H${x0 + (rest.length - 1) * (w + gap) + w / 2}" class="ma-s"/>`
        + rest.map((s, i) => { const x = x0 + i * (w + gap); return `<path d="M${x + w / 2} 72v12" class="ma-s"/>` + P(x, 84, w, 30, 7, 'ma-p ma-on') + T(x + w / 2, 104, cut(s, 9), 'ma-b', ' text-anchor="middle"'); }).join('')
        + T(160, 150, cut(it.title, 28), 'ma-t', ' text-anchor="middle"');
    },
    'app-kit'(it) {
      return P(122, 10, 76, 160, 14) + L(146, 18, 28, 4) + T(132, 42, cut(it.title, 11), 'ma-t ma-sm') + [0, 1, 2, 3].map(i => P(132, 52 + i * 26, 56, 20, 5, i === 0 ? 'ma-p ma-on' : 'ma-p')).join('') + L(132, 156, 56, 6, 'ma-a');
    },
  };

  function svg(it) {
    const d = DRAW[it.kind] || DRAW.widget;
    try { return wrap(d(it), it.title || ''); } catch { return wrap(DRAW.widget(it), it.title || ''); }
  }
  // An app kit is drawn from App Creator itself when it is loaded: the kit's real first screen, small.
  function html(it) {
    if (it.kind === 'app-kit' && it.kit) {
      try {
        const Co = window.TribeAppCore, A = window.TribeAppCreator, K = Co && Co.KITS && Co.KITS[it.kit];
        if (K && A && A.mini) { const m = A.mini({ name: it.title, screens: K.screens() }, null, 74); if (m) return `<span class="ma-phone">${m}</span>`; }
      } catch {}
    }
    return svg(it);
  }
  window.TribeMarketArt = { svg, html };
})();
