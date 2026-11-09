// Infographics for the Learn modules (learn.html): one flat diagram per lesson, drawn as inline SVG in the site palette
// (no images to load, crisp at any size, readable by screen readers through each figure's caption).
// window.TribeLearnArt(key) -> '<figure>…</figure>' or '' (key like 'm1-0', 'm3-q').
(function () {
  'use strict';
  const C = { ink: '#F8FAFC', soft: '#C7CED8', dim: '#7C8796', edge: '#2A313C', bg: '#1B2028', raise: '#232A35', ember: '#F26B1D', teal: '#38C6B1', indigo: '#6C7CFF', green: '#3BD16F', rose: '#FF6F8E', gold: '#FABD2F' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // primitives (viewBox 640 x 220)
  const box = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 12}" fill="${o.fill || C.raise}" stroke="${o.stroke || C.edge}" stroke-width="${o.sw || 1.5}"/>`;
  const txt = (x, y, s, o = {}) => `<text x="${x}" y="${y}" fill="${o.c || C.ink}" font-size="${o.size || 14}" font-weight="${o.w || 600}" text-anchor="${o.a || 'middle'}" font-family="${o.mono ? 'JetBrains Mono, ui-monospace, monospace' : 'Inter, system-ui, sans-serif'}">${esc(s)}</text>`;
  const arrow = (x1, y1, x2, y2, c = C.dim) => { const a = Math.atan2(y2 - y1, x2 - x1), h = 8; return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="2" stroke-linecap="round"/><path d="M${x2} ${y2} L${x2 - h * Math.cos(a - .45)} ${y2 - h * Math.sin(a - .45)} L${x2 - h * Math.cos(a + .45)} ${y2 - h * Math.sin(a + .45)}Z" fill="${c}"/>`; };
  const dot = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
  const chip = (x, y, s, c) => `${box(x, y, s.length * 8 + 22, 26, { r: 13, fill: C.bg, stroke: c })}${txt(x + (s.length * 8 + 22) / 2, y + 17, s, { size: 12, c, mono: true })}`;
  const person = (x, y, c, label) => `${dot(x, y, 13, c)}<path d="M${x - 20} ${y + 40} Q${x} ${y + 10} ${x + 20} ${y + 40}Z" fill="${c}"/>${label ? txt(x, y + 58, label, { size: 12, c: C.soft, w: 500 }) : ''}`;
  const bot = (x, y, label) => `${box(x - 18, y - 16, 36, 30, { r: 9, fill: C.bg, stroke: C.teal })}${dot(x - 7, y - 2, 3.5, C.teal)}${dot(x + 7, y - 2, 3.5, C.teal)}<line x1="${x}" y1="${y - 16}" x2="${x}" y2="${y - 26}" stroke="${C.teal}" stroke-width="2"/>${dot(x, y - 28, 3, C.teal)}${label ? txt(x, y + 34, label, { size: 12, c: C.soft, w: 500 }) : ''}`;
  const lines = (x, y, n, w, c = C.dim) => Array.from({ length: n }, (_, i) => `<rect x="${x + (i % 2 ? 14 : 0)}" y="${y + i * 12}" width="${w - (i % 3) * 18 - (i % 2 ? 14 : 0)}" height="5" rx="2.5" fill="${i === 1 ? C.teal : i === 3 ? C.ember : c}"/>`).join('');
  const page = (x, y, w, h) => `${box(x, y, w, h, { r: 10, fill: C.bg })}<rect x="${x}" y="${y}" width="${w}" height="18" rx="10" fill="${C.raise}"/>${dot(x + 12, y + 9, 3, C.rose)}${dot(x + 22, y + 9, 3, C.gold)}${dot(x + 32, y + 9, 3, C.green)}`;
  const phone = (x, y, c = C.edge) => `${box(x, y, 54, 96, { r: 12, fill: C.bg, stroke: c })}<rect x="${x + 20}" y="${y + 6}" width="14" height="4" rx="2" fill="${C.edge}"/>`;
  const check = (x, y, c = C.green) => `${dot(x, y, 14, c)}<path d="M${x - 6} ${y} l4 4 l8 -8" stroke="${C.bg}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const fig = (body, cap) => `<figure class="lx-fig"><svg viewBox="0 0 640 220" role="img" aria-label="${esc(cap)}">${body}</svg><figcaption>${esc(cap)}</figcaption></figure>`;

  const ART = {
    'm1-0': () => fig(
      [['Tap Start', C.ember], ['Load level 1', C.teal], ['Show the player', C.indigo]].map(([s, c], i) => `${box(30 + i * 205, 70, 170, 80, { stroke: c })}${txt(48 + i * 205, 98, String(i + 1), { a: 'start', c, mono: true })}${txt(115 + i * 205, 120, s, { size: 15 })}${i < 2 ? arrow(204 + i * 205, 110, 230 + i * 205, 110) : ''}`).join('') + txt(320, 190, 'Code = the steps, spelled out, in order', { c: C.soft, w: 500, size: 13 }),
      'Code is a list of steps the computer follows exactly: tap Start, load level 1, show the player.'),
    'm1-1': () => fig(
      [['HTML · CSS', 'a web page', C.ember], ['JavaScript', 'things that move', C.gold], ['Python', 'data and AI', C.teal], ['Swift · Kotlin', 'phone apps', C.indigo]].map(([l, o, c], i) => `${chip(24 + i * 154, 40, l, c)}${arrow(80 + i * 154, 76, 80 + i * 154, 112, c)}${box(24 + i * 154, 118, 136, 56, { stroke: c })}${txt(92 + i * 154, 151, o, { size: 13, w: 500, c: C.soft })}`).join(''),
      'Different languages for different things: HTML and CSS for web pages, JavaScript for motion, Python for data, Swift and Kotlin for phones.'),
    'm1-2': () => fig(
      `${box(40, 30, 250, 160, { fill: C.bg })}${txt(60, 60, '📁 my-game/', { a: 'start', mono: true, size: 14 })}` +
      [['index.html', C.ember], ['style.css', C.indigo], ['game.js', C.gold], ['📁 assets/', C.teal]].map(([f, c], i) => `<line x1="72" y1="${72 + i * 28}" x2="72" y2="${88 + i * 28}" stroke="${C.edge}" stroke-width="2"/><line x1="72" y1="${88 + i * 28}" x2="88" y2="${88 + i * 28}" stroke="${C.edge}" stroke-width="2"/>${txt(96, 93 + i * 28, f, { a: 'start', mono: true, size: 13, c, w: 500 })}`).join('') +
      `${arrow(310, 110, 360, 110)}${box(372, 50, 230, 120, { stroke: C.teal })}${txt(487, 82, 'Code repository', { size: 15 })}${[0, 1, 2, 3].map(i => dot(410 + i * 52, 128, 7, i === 3 ? C.ember : C.teal) + (i < 3 ? `<line x1="${417 + i * 52}" y1="128" x2="${455 + i * 52}" y2="128" stroke="${C.edge}" stroke-width="2"/>` : '')).join('')}${txt(487, 158, 'every saved change', { size: 12, c: C.soft, w: 500 })}`,
      'A project is a folder of files. The folder plus every saved change is the code repository.'),
    'm1-3': () => fig(
      `${person(70, 80, C.indigo, 'You')}${box(110, 40, 170, 50, { r: 14, fill: C.bg, stroke: C.indigo })}${txt(195, 70, '“Add a jump button”', { size: 13, w: 500 })}` +
      `${arrow(290, 110, 335, 110)}${bot(370, 110, 'AI helper')}${arrow(405, 110, 450, 110)}${box(460, 60, 150, 100, { fill: C.bg })}${lines(476, 78, 5, 118)}` +
      `${txt(320, 200, 'You decide and check · the AI types', { c: C.soft, w: 500, size: 13 })}`,
      'You describe what you want in plain words; an AI helper writes the code; you check that it works.'),
    'm2-0': () => fig(
      `${box(70, 40, 500, 120, { stroke: C.ember })}${txt(100, 78, 'VISION', { a: 'start', c: C.ember, size: 12, mono: true })}${txt(100, 112, 'A recipe app for our family,', { a: 'start', size: 18, w: 600 })}${txt(100, 140, 'so everyone can add their favorites.', { a: 'start', size: 18, w: 600 })}` +
      `${chip(150, 178, 'what it is', C.teal)}${chip(360, 178, 'who it’s for', C.indigo)}`,
      'A vision is one or two sentences: what it is, and who it is for.'),
    'm2-1': () => fig(
      `${box(30, 70, 180, 80, { stroke: C.ember })}${txt(120, 106, 'Recipe app', { size: 16 })}${txt(120, 128, 'too big to start', { size: 12, c: C.soft, w: 500 })}${arrow(222, 110, 270, 110)}` +
      ['Show the recipes', 'Add a recipe', 'Search by name'].map((s, i) => `${box(285, 30 + i * 58, 220, 46, { stroke: [C.teal, C.indigo, C.gold][i] })}${dot(306, 53 + i * 58, 6, [C.teal, C.indigo, C.gold][i])}${txt(322, 58 + i * 58, s, { a: 'start', size: 14, w: 500 })}`).join('') + `${txt(570, 115, '3 small tasks', { size: 13, c: C.soft, w: 500 })}`,
      'One big idea becomes small tasks that are easy to finish and to share out.'),
    'm2-2': () => fig(
      `${box(40, 80, 160, 60, { stroke: C.indigo })}${txt(120, 116, 'One task', { size: 15 })}${arrow(210, 110, 270, 110)}${bot(305, 110, 'writes · runs · reports')}${arrow(345, 110, 405, 110)}` +
      ['Code written', 'It runs', 'Told you what changed'].map((s, i) => `${check(430, 60 + i * 50)}${txt(454, 65 + i * 50, s, { a: 'start', size: 14, w: 500 })}`).join(''),
      'Give the AI helper one task at a time: it writes the code, runs it, and tells you what changed.'),
    'm2-3': () => fig(
      `${page(150, 25, 340, 170)}${box(180, 70, 130, 30, { r: 8, fill: C.ember, stroke: C.ember })}${txt(245, 90, 'Start', { size: 14, c: '#12151A' })}${lines(180, 120, 4, 260)}` +
      `<path d="M330 92 l0 26 l7 -7 l8 14 l5 -3 l-8 -13 l10 -1z" fill="${C.ink}" stroke="#12151A" stroke-width="1.5"/>${dot(462, 70, 14, C.rose)}${txt(462, 75, '?', { size: 15, c: '#12151A' })}${txt(560, 75, 'Something off?', { size: 12, c: C.soft, w: 500 })}${txt(560, 93, 'Say what you saw', { size: 12, c: C.soft, w: 500 })}`,
      'Try it in the preview like a user would, and say what looks wrong.'),
    'm2-4': () => fig(
      `<line x1="60" y1="110" x2="590" y2="110" stroke="${C.edge}" stroke-width="3"/>` + ['First page', 'Add recipes', 'Search box', 'Fix typo'].map((s, i) => `${dot(100 + i * 150, 110, 10, i === 3 ? C.ember : C.teal)}${box(40 + i * 150, i % 2 ? 130 : 44, 120, 40, { fill: C.bg })}${txt(100 + i * 150, i % 2 ? 155 : 69, s, { size: 12, w: 500 })}`).join(''),
      'Each working step is saved with a short note, so you can always go back.'),
    'm2-5': () => fig(
      `${box(40, 80, 200, 50, { r: 25, stroke: C.teal })}${txt(140, 110, '🔗 your-app.link', { size: 14, mono: true, w: 500 })}` + [0, 1, 2].map(i => `${arrow(250, 105, 360 + i * 85, 80)}${phone(338 + i * 85, 70, [C.indigo, C.ember, C.green][i])}${dot(365 + i * 85, 118, 10, [C.indigo, C.ember, C.green][i])}`).join(''),
      'Share it: one link, and friends open it on their phones.'),
    'm3-0': () => fig(
      `<ellipse cx="320" cy="78" rx="70" ry="16" fill="${C.raise}" stroke="${C.teal}" stroke-width="1.5"/><path d="M250 78 v60 a70 16 0 0 0 140 0 v-60" fill="${C.raise}" stroke="${C.teal}" stroke-width="1.5"/>${txt(320, 120, 'one repository', { size: 13 })}` +
      [[110, 70, C.indigo, 'Maya'], [530, 70, C.ember, 'Jay'], [320, 160, C.green, '']].slice(0, 2).map(([x, y, c, n]) => `${person(x, y, c, n)}${arrow(x < 320 ? x + 30 : x - 30, y + 20, x < 320 ? 240 : 400, 105, c)}`).join('') + `${bot(320, 196)}`,
      'Everyone, people and AI helpers, works from the same code repository: no emailing files around.'),
    'm3-1': () => fig(
      [['Maya', 'Add the title screen', C.indigo, '2m'], ['Jay’s Codex', 'Lantern glow', C.teal, '20m'], ['Rio', 'Footstep sounds', C.ember, '1h']].map(([n, s, c, t], i) => `${box(70, 30 + i * 58, 500, 46, { fill: C.bg })}${dot(98, 53 + i * 58, 11, c)}${txt(120, 51 + i * 58, n, { a: 'start', size: 13 })}${txt(120, 67 + i * 58, s, { a: 'start', size: 12, c: C.soft, w: 500 })}${txt(548, 58 + i * 58, t + ' ago', { a: 'end', size: 12, c: C.dim, mono: true, w: 500 })}`).join(''),
      'Save small and often. The history shows who changed what, and when.'),
    'm3-2': () => fig(
      `<line x1="40" y1="140" x2="600" y2="140" stroke="${C.teal}" stroke-width="4"/>${txt(40, 172, 'main', { a: 'start', mono: true, size: 12, c: C.teal })}` +
      `<path d="M150 140 C200 140 200 70 250 70 L410 70 C460 70 460 140 510 140" fill="none" stroke="${C.ember}" stroke-width="4"/>${txt(330, 56, 'your branch: try things', { size: 12, mono: true, c: C.ember })}` +
      [150, 290, 370, 510].map((x, i) => dot(x, i === 1 || i === 2 ? 70 : 140, 9, i === 1 || i === 2 ? C.ember : C.teal)).join('') + `${txt(510, 172, 'merged ✓', { size: 12, c: C.green })}`,
      'A branch is a side copy for trying things; when it works it is merged back into the main version.'),
    'm3-3': () => fig(
      [['src/levels/', 'Claude', C.teal], ['src/ui/', 'Maya’s Claude', C.indigo], ['src/art/', 'Jay', C.ember], ['src/audio/', 'Rio', C.gold]].map(([f, n, c], i) => `${box(30 + i * 150, 50, 130, 120, { stroke: c })}<rect x="${30 + i * 150}" y="50" width="130" height="6" rx="3" fill="${c}"/>${txt(95 + i * 150, 96, f, { size: 13, mono: true, w: 500 })}${txt(95 + i * 150, 130, n, { size: 13, c })}${txt(95 + i * 150, 152, '🔒 claimed', { size: 11, c: C.dim, w: 500 })}`).join(''),
      'Claim your part. Each person and AI helper stays in its own lane, so changes don’t collide.'),
    'm3-4': () => fig(
      `${box(40, 60, 180, 100, { fill: C.bg })}${txt(130, 88, 'A change', { size: 14 })}${lines(62, 104, 3, 136)}${arrow(232, 110, 290, 110)}` +
      `<ellipse cx="330" cy="110" rx="34" ry="20" fill="none" stroke="${C.ink}" stroke-width="2.5"/>${dot(330, 110, 9, C.indigo)}${txt(330, 150, 'a second look', { size: 12, c: C.soft, w: 500 })}${arrow(372, 110, 430, 110)}${check(470, 110)}${txt(470, 150, 'approved', { size: 12, c: C.green })}${txt(560, 115, 'one tap', { size: 12, c: C.soft, w: 500 })}`,
      'Before a change joins the main version, someone looks at it and approves it.'),
    'm3-5': () => fig(
      `${box(60, 30, 330, 44, { r: 18, fill: C.bg, stroke: C.indigo })}${txt(80, 57, 'Maya: I’m on the title screen now 👋', { a: 'start', size: 13, w: 500 })}` +
      `${box(250, 88, 330, 44, { r: 18, fill: C.bg, stroke: C.ember })}${txt(270, 115, 'Jay: can I touch src/ui/menu.js?', { a: 'start', size: 13, w: 500 })}` +
      `${box(60, 146, 330, 44, { r: 18, fill: C.bg, stroke: C.indigo })}${txt(80, 173, 'Maya: go for it, thanks for asking!', { a: 'start', size: 13, w: 500 })}`,
      'Post what you’re doing, ask before changing someone else’s part, and say thanks.'),
    'm4-0': () => fig(
      `${box(40, 40, 250, 140, { fill: C.bg, stroke: C.ember })}${txt(60, 66, 'HTML · what’s there', { a: 'start', size: 12, mono: true, c: C.ember })}${box(60, 80, 210, 22, { r: 4, fill: 'none', stroke: C.dim, sw: 1 })}${box(60, 110, 140, 22, { r: 4, fill: 'none', stroke: C.dim, sw: 1 })}${box(60, 140, 80, 26, { r: 6, fill: 'none', stroke: C.dim, sw: 1 })}${txt(100, 158, 'button', { size: 11, mono: true, c: C.dim, w: 500 })}` +
      `${arrow(300, 110, 345, 110)}${box(350, 40, 250, 140, { fill: C.bg, stroke: C.indigo })}${txt(370, 66, 'CSS · how it looks', { a: 'start', size: 12, mono: true, c: C.indigo })}<rect x="370" y="80" width="210" height="22" rx="4" fill="${C.ink}"/><rect x="370" y="110" width="140" height="10" rx="3" fill="${C.soft}"/><rect x="370" y="126" width="110" height="10" rx="3" fill="${C.dim}"/><rect x="370" y="142" width="80" height="26" rx="13" fill="${C.ember}"/>${txt(410, 160, 'Start', { size: 12, c: '#12151A' })}`,
      'HTML says what is on the page; CSS says how it looks.'),
    'm4-1': () => fig(
      `${box(80, 70, 140, 60, { r: 30, fill: C.ember, stroke: C.ember })}${txt(150, 106, 'click', { size: 16, c: '#12151A' })}${arrow(232, 100, 290, 100)}${box(300, 60, 150, 80, { fill: C.bg, stroke: C.gold })}${txt(375, 96, 'score + 1', { size: 15, mono: true, c: C.gold })}${txt(375, 120, 'JavaScript', { size: 12, c: C.soft, w: 500 })}${arrow(462, 100, 510, 100)}${txt(560, 112, '42', { size: 40, w: 800 })}`,
      'JavaScript makes pages react: a click adds one to the score.'),
    'm4-2': () => fig(
      `${box(40, 60, 160, 100, { fill: C.bg })}${['Maya', 'Jay', 'Rio'].map((n, i) => txt(120, 92 + i * 24, n, { size: 14, mono: true, w: 500 })).join('')}${arrow(212, 110, 262, 110)}` +
      `${box(272, 70, 150, 80, { fill: C.bg, stroke: C.teal })}${txt(347, 104, 'for name in', { size: 13, mono: true, c: C.teal })}${txt(347, 124, 'friends:', { size: 13, mono: true, c: C.teal })}${arrow(434, 110, 480, 110)}` +
      ['Hi Maya', 'Hi Jay', 'Hi Rio'].map((s, i) => txt(540, 92 + i * 24, s, { size: 14, mono: true, w: 500, c: C.green })).join(''),
      'Python reads almost like English: for each name in a list, say hi.'),
    'm4-3': () => fig(
      `${phone(150, 50, C.indigo)}${txt(177, 106, '', {})}${box(158, 80, 38, 18, { r: 6, fill: C.indigo, stroke: C.indigo })}${txt(177, 175, 'Swift · iPhone', { size: 12, c: C.soft, w: 500 })}` +
      `${phone(310, 50, C.green)}${box(318, 80, 38, 18, { r: 6, fill: C.green, stroke: C.green })}${txt(337, 175, 'Kotlin · Android', { size: 12, c: C.soft, w: 500 })}` +
      `${box(440, 70, 160, 60, { stroke: C.teal })}${txt(520, 98, 'React Native / Flutter', { size: 12 })}${txt(520, 116, 'one code, both', { size: 12, c: C.soft, w: 500 })}`,
      'Swift makes iPhone apps, Kotlin makes Android apps; React Native or Flutter build both from one codebase.'),
    'm4-4': () => fig(
      [['Unity', 'C#', C.indigo], ['Godot', 'GDScript', C.teal], ['Phaser', 'JavaScript', C.gold]].map(([e, l, c], i) => `${box(40 + i * 200, 50, 160, 110, { stroke: c })}<path d="M${88 + i * 200} 92 h64 a14 14 0 0 1 0 28 h-64 a14 14 0 0 1 0 -28z" fill="${C.bg}" stroke="${c}" stroke-width="2"/>${dot(98 + i * 200, 106, 4, c)}${dot(142 + i * 200, 102, 3, c)}${dot(148 + i * 200, 110, 3, c)}${txt(120 + i * 200, 76, e, { size: 15 })}${txt(120 + i * 200, 145, l, { size: 12, mono: true, c, w: 500 })}`).join(''),
      'Game engines and their languages: Unity uses C#, Godot uses GDScript, Phaser uses JavaScript.'),
    'm4-5': () => fig(
      `${box(60, 30, 330, 160, { fill: C.bg })}${['name', 'Chocolate cake', 'Rye bread', 'Chocolate chip cookies', 'Lemon tart'].map((s, i) => `${i ? `<rect x="61" y="${30 + i * 32}" width="328" height="32" fill="${i === 1 || i === 3 ? 'rgba(242,107,29,.16)' : 'none'}"/>` : ''}${txt(80, 52 + i * 32, s, { a: 'start', size: 13, mono: i === 0, c: i === 0 ? C.dim : i === 1 || i === 3 ? C.ember : C.soft, w: 500 })}`).join('')}` +
      `${box(420, 70, 180, 80, { stroke: C.ember })}${txt(510, 100, 'WHERE name', { size: 13, mono: true, c: C.ember })}${txt(510, 122, "LIKE '%chocolate%'", { size: 12, mono: true, c: C.ember, w: 500 })}${arrow(412, 110, 395, 110, C.ember)}`,
      'SQL asks questions of a database: show every recipe with chocolate in it.'),
    'm4-6': () => fig(
      `${box(80, 30, 480, 160, { r: 12, fill: '#0E1116' })}${dot(100, 48, 5, C.rose)}${dot(116, 48, 5, C.gold)}${dot(132, 48, 5, C.green)}` +
      [['$ cd my-game', C.ink], ['$ git status', C.ink], ['On branch main · 2 files changed', C.soft], ['$ claude', C.teal]].map(([s, c], i) => txt(104, 86 + i * 26, s, { a: 'start', mono: true, size: 14, c, w: 500 })).join('') + `<rect x="196" y="160" width="10" height="18" fill="${C.teal}"/>`,
      'The terminal is a text window for commands; AI helpers like Claude Code run there.'),
  };
  const QUIZ = (badge, name) => fig(`${dot(320, 100, 56, C.raise)}<circle cx="320" cy="100" r="56" fill="none" stroke="${C.ember}" stroke-width="3" stroke-dasharray="6 6"/>${txt(320, 116, badge, { size: 44 })}${txt(320, 192, `Earn the ${name} badge`, { size: 14, c: C.soft, w: 500 })}`, `A badge for passing the check: ${name}.`);
  window.TribeLearnArt = (key, mod) => { try { if (/-q$/.test(key) && mod) return QUIZ(mod.badge, mod.bname); const f = ART[key]; return f ? f() : ''; } catch { return ''; } };
})();
