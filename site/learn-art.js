// Lesson scenes for the Learn modules (learn.html), in the same style as the homepage's hero widget: the pixel night
// scene behind, and a real-looking TribeCode window in front (letter avatars, model chips, timestamps, task cards,
// file trees, colored code, approve buttons). Plain HTML and CSS (styles in learn.html, .lv-*), so it stays sharp,
// scales to phones, and screen readers get the caption.
// window.TribeLearnArt(key, module, lessonTitle) -> '<figure>…</figure>' or ''.
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = { maya: ['M', '#6C7CFF', 'Maya'], jay: ['J', '#F5A35C', 'Jay'], rio: ['R', '#3BD16F', 'Rio'], orion: ['O', '#F26B1D', 'Orion'], you: ['Y', '#38C6B1', 'You'] };
  const AG = { claude: ['✦', '#E58A5E', 'Orion’s Claude', 'Claude Code'], codex: ['◎', '#E4E4E4', 'Maya’s Codex', 'Codex'], gemini: ['✦', '#8AB4F8', 'Jay’s Gemini', 'Gemini CLI'] };
  const nameOf = k => (AG[k] ? AG[k][2] : (P[k] || P.you)[2]);
  const av = (k, sm) => { const a = AG[k]; if (a) return `<i class="lv-av lv-av--agent${sm ? ' sm' : ''}" style="color:${a[1]}">${a[0]}</i>`; const p = P[k] || P.you; return `<i class="lv-av${sm ? ' sm' : ''}" style="background:${p[1]}">${p[0]}</i>`; };
  const who = k => (AG[k] ? `<b style="color:#9BD49B">${AG[k][2]}</b><span class="lv-chip">${AG[k][3]}</span>` : `<b style="color:${(P[k] || P.you)[1]}">${(P[k] || P.you)[2]}</b>`);
  const msg = (k, time, text, extra = '') => `<div class="lv-msg">${av(k)}<div><p class="lv-who">${who(k)}<time>${time}</time></p><p>${text}</p>${extra}</div></div>`;
  const win = (title, body, o = {}) => `<div class="lv-win${o.cls ? ' ' + o.cls : ''}"><div class="lv-bar"><span class="lv-lights"><i></i><i></i><i></i></span><span class="lv-title">${title}</span>${o.right ? `<span class="lv-right">${o.right}</span>` : ''}</div><div class="lv-body">${body}</div></div>`;
  const pill = (t, c = '#3BD16F') => `<span class="lv-pill"><i style="background:${c}"></i>${t}</span>`;
  const file = (n, c, ind = 0, cur) => `<li class="${cur ? 'cur' : ''}" style="padding-left:${8 + ind * 14}px"><span style="color:${c}">${n.endsWith('/') ? '▾' : '•'}</span>${esc(n)}</li>`;
  // tiny syntax colors: comments, strings, keywords, numbers
  const code = src => src.split('\n').map((l, i) => {
    let h = esc(l), cm = '';
    const ci = h.search(/(\/\/|# )/); if (ci >= 0 && !/^\s*#/.test(l.slice(0, 0))) { cm = `<em class="tc">${h.slice(ci)}</em>`; h = h.slice(0, ci); }
    h = h.replace(/(&quot;.*?&quot;|'.*?')/g, '<em class="ts">$1</em>')
      .replace(/\b(const|let|function|for|in|if|return|def|print|SELECT|FROM|WHERE|LIKE|func|var|import|class)\b(?![^<]*<\/em>)/g, '<em class="tk">$1</em>')
      .replace(/(^|[^\w#-])(-?\d+)(?![\w])/g, '$1<em class="tn">$2</em>');
    return `<span class="ln"><i>${i + 1}</i>${h}${cm}${!h && !cm ? ' ' : ''}</span>`;
  }).join('');
  const editor = (name, src, o = {}) => win(`<span class="lv-file">${esc(name)}</span>`, `<pre class="lv-code">${code(src)}</pre>`, { right: o.right || '', cls: 'lv-ed ' + (o.cls || '') });
  const task = (t, tag, c, k, st) => `<div class="lv-card"><span class="lv-tag" style="color:${c};border-color:${c}66">${tag}</span><p>${t}</p><div class="lv-card-f">${k ? av(k, true) : '<span class="lv-un">Unassigned</span>'}${st ? `<span class="lv-st">${st}</span>` : ''}</div></div>`;
  const commit = (k, m, time, hash, on) => `<li class="${on ? 'on' : ''}"><span class="lv-node"></span>${av(k, true)}<span class="lv-cm"><b>${m}</b><small>${nameOf(k)} · ${time}</small></span><code>${hash}</code></li>`;
  // v0.27 company scenes: a seat chip (title, holder) and a charter row
  const seat = (t, c, k) => `<div class="lv-seat" style="--c:${c}"><span class="lv-seat-k">${t}</span><span class="lv-seat-h">${av(k, true)}<small>${nameOf(k)}</small></span></div>`;
  const row = (k, v, cls = '') => `<div class="lv-ch-row"><b>${k}</b><span class="${cls}">${v}</span></div>`;
  const co = (page, c = '#F26B1D') => `${pill('Firefly Studio', c)}<span class="lv-sep">/</span>${page}`;
  let EYEBROW = '';
  const fig = (scene, cap) => `<figure class="lx-fig"><div class="lv" role="img" aria-label="${esc(cap)}"><div class="lv-eyebrow"><i></i>${EYEBROW}</div><div class="lv-stage">${scene}</div></div><figcaption>${esc(cap)}</figcaption></figure>`;

  const ART = {
    'm1-0': () => fig(`${editor('src/start.js', `// when someone taps Start\nstart.onTap(() => {\n  loadLevel(1)       // step 1\n  placePlayer(2, 9)  // step 2\n  showScore(0)       // step 3\n})`, { right: pill('saved') })}
      <div class="lv-phone"><div class="lv-ph-screen lv-ph-game"><span class="lv-ph-hud">LEVEL 1 · ★ 0</span><span class="lv-ph-plat a"></span><span class="lv-ph-plat b"></span><span class="lv-ph-hero">🔥</span></div></div>`,
      'Code spells out the steps in order: when someone taps Start, load level 1, place the player, show the score.'),
    'm1-1': () => fig(`<div class="lv-grid2">${editor('index.html', '<button class="go">\n  Start\n</button>', { cls: 'sm' })}${editor('game.js', 'score = score + 1\nshowScore(score)', { cls: 'sm' })}${editor('tidy.py', 'for name in friends:\n    print("Hi", name)', { cls: 'sm' })}${editor('App.swift', 'Text("Hello, tribe!")\n  .font(.title)', { cls: 'sm' })}</div>`,
      'Each language writes the steps its own way: HTML for pages, JavaScript for what moves, Python for data and tools, Swift for iPhone apps.'),
    'm1-2': () => fig(win(`${pill('Pixel Quest')}<span class="lv-sep">/</span>Files`, `<div class="lv-split"><ul class="lv-tree">${file('pixel-quest/', '#F26B1D')}${file('index.html', '#F26B1D', 1)}${file('style.css', '#6C7CFF', 1)}${file('src/', '#FABD2F', 1)}${file('game.js', '#FABD2F', 2, true)}${file('levels.js', '#FABD2F', 2)}${file('assets/', '#38C6B1', 1)}${file('jump.wav', '#38C6B1', 2)}</ul>
      <div><p class="lv-k">Code repository · every saved change</p><ul class="lv-hist">${commit('maya', 'Add the title screen', '2m', 'a41f2c', true)}${commit('claude', 'Level 2 platforms', '18m', '9be03d')}${commit('jay', 'Lantern art', '1h', '27c8e1')}</ul></div></div>`, { right: '<span class="lv-branch">⎇ main</span>', cls: 'wide' }),
      'A project is a folder of files. The folder plus every saved change, and who made it, is the code repository.'),
    'm1-3': () => fig(win('# general <small>5 members · 4 online</small>', msg('you', '9:41', 'Can you add a jump button for phones?') + msg('claude', '9:42', 'Added a <b>Jump</b> button in the bottom-right corner. It only shows on touch screens.', `<div class="lv-files"><span>src/ui/controls.js <em class="add">+18</em></span><span>style.css <em class="add">+6</em> <em class="del">−1</em></span></div>`) + `<div class="lv-compose"><span>Message the tribe…</span><i>↑</i></div>`, { cls: 'wide lv-chat' }),
      'You say what you want in plain words; the AI helper writes the code and tells you which files it changed.'),
    'm2-0': () => fig(win(`${pill('Family Recipes', '#F26B1D')}<span class="lv-sep">/</span>Vision`, `<p class="lv-k">Vision</p><p class="lv-big">A recipe app for our family, so everyone can add their favorites.</p>
      <div class="lv-row"><span class="lv-tagbig" style="--c:#38C6B1">what it is · a recipe app</span><span class="lv-tagbig" style="--c:#6C7CFF">who it’s for · our family</span></div><p class="lv-saved">${av('maya', true)} Saved by Maya · everyone and every AI helper reads this first</p>`, { cls: 'wide' }),
      'A vision is one or two sentences: what it is, and who it is for. Everyone, and every AI helper, reads it first.'),
    'm2-1': () => fig(win(`${pill('Family Recipes', '#F26B1D')}<span class="lv-sep">/</span>Task Board`, `<div class="lv-cols"><div><p class="lv-col">Backlog <em>2</em></p>${task('Search by name', 'Feature', '#6C7CFF')}${task('Dark mode', 'Look', '#FABD2F')}</div>
      <div><p class="lv-col">In progress <em>1</em></p>${task('Add a recipe form', 'Feature', '#6C7CFF', 'claude', 'working…')}</div><div><p class="lv-col">Done <em>1</em></p>${task('Show the recipe list', 'Feature', '#6C7CFF', 'maya', '✓ done')}</div></div>`, { cls: 'wide' }),
      'One big idea becomes small tasks on the board: easy to finish, easy to share out.'),
    'm2-2': () => fig(win('Agents Hub <small>1 working</small>', `<div class="lv-agent">${av('claude')}<div><p class="lv-who">${who('claude')}<span class="lv-live">● live</span></p><p class="lv-sub">Task · <b>Add a recipe form</b></p>
      <ol class="lv-steps"><li class="lv-yes">Read the vision and the task</li><li class="lv-yes">Wrote src/recipes/new.js</li><li class="lv-yes">Ran it in the preview: it works</li><li class="now">Posting what changed…</li></ol></div></div>`, { cls: 'wide' }),
      'Give an AI helper one task: it reads the plan, writes the code, runs it, and reports what changed.'),
    'm2-3': () => fig(`${win('Preview <small>Family Recipes · live</small>', `<div class="lv-site"><p class="lv-site-h">Family Recipes</p><div class="lv-site-cards"><span>🥧 Grandma’s pie</span><span>🍝 Sunday pasta</span><span class="cut">🍪 Cookies</span></div><span class="lv-site-btn">+ Add a recipe</span></div>`, { right: '<span class="lv-dev">▭ ▯</span>' })}
      <div class="lv-note">${av('jay', true)}<div><b>Jay</b><p>The cookie card is cut off on my phone</p></div></div>`,
      'Try it in the preview like a user would, and say what you saw: “the cookie card is cut off on my phone.”'),
    'm2-4': () => fig(win('History <small>main · 4 saved changes</small>', `<ul class="lv-hist big">${commit('maya', 'Fix the cut-off cookie card on phones', 'just now', 'e7a10b', true)}${commit('claude', 'Add a recipe form', '25m', '5c2f9a')}${commit('maya', 'Show the recipe list', '1h', '1d84e3')}${commit('orion', 'First page', 'yesterday', '0a9b77')}</ul>`, { right: '<span class="lv-branch">⎇ main</span>', cls: 'wide' }),
      'Each working step is saved with a short note, so you can always see what changed and go back.'),
    'm2-5': () => fig(`${win('Invite friends', `<p class="lv-k">One link · no account needed</p><div class="lv-link">🔗 tribe.link/family-recipes<span>Copy</span></div><div class="lv-qr">${Array.from({ length: 49 }, (_, i) => `<i class="${[0, 1, 2, 7, 9, 14, 15, 16, 4, 5, 6, 11, 13, 18, 19, 20, 28, 29, 30, 35, 37, 42, 43, 44, 24, 26, 32, 38, 40, 46, 22, 31].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`)}
      <div class="lv-toasts"><div class="lv-toast">${av('jay', true)}<span><b>Jay</b> joined from his phone</span></div><div class="lv-toast">${av('rio', true)}<span><b>Rio</b> joined · added to Home Screen</span></div></div>`,
      'Share it with one link. Friends tap it on their phones and they are in.'),
    'm3-0': () => fig(win('Code repository', `<div class="lv-repo"><p class="lv-repo-h"><span class="lv-gh">⬢</span><b>orion / pixel-quest</b><span class="lv-pub">Public</span></p><p class="lv-sub">A cozy pixel platformer · ⎇ main · 128 saved changes</p>
      <div class="lv-stack">${av('maya', true)}${av('jay', true)}${av('rio', true)}${av('claude', true)}${av('codex', true)}<span>5 people and AI helpers work here</span></div><ul class="lv-hist">${commit('codex', 'Footstep sounds', '4m', 'b1e2f0', true)}</ul></div>`, { cls: 'wide' }),
      'Everyone, people and AI helpers, works from the same code repository on GitHub. No files emailed around.'),
    'm3-1': () => fig(win('# general', msg('maya', '10:02', 'Saved: <b>title screen</b> ✓', `<div class="lv-files"><span>src/ui/title.js <em class="add">+42</em></span></div>`) + msg('codex', '10:09', 'Saved: <b>lantern glow</b>', `<div class="lv-files"><span>src/art/glow.js <em class="add">+17</em> <em class="del">−3</em></span></div>`) + msg('rio', '10:15', 'Saved: footsteps 🎧 small and easy to undo'), { cls: 'wide lv-chat' }),
      'Save small and often, with a note. The history shows who changed what, and when.'),
    'm3-2': () => fig(`<div class="lv-graph"><svg viewBox="0 0 560 120" aria-hidden="true"><line x1="20" y1="90" x2="540" y2="90" stroke="#38C6B1" stroke-width="4" stroke-linecap="round"/><path d="M120 90 C170 90 170 30 220 30 L350 30 C400 30 400 90 450 90" fill="none" stroke="#F26B1D" stroke-width="4"/>
      ${[[60, 90, '#38C6B1'], [120, 90, '#38C6B1'], [240, 30, '#F26B1D'], [320, 30, '#F26B1D'], [450, 90, '#38C6B1'], [510, 90, '#38C6B1']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="8" fill="#12151A" stroke="${c}" stroke-width="3"/>`).join('')}</svg>
      <span class="lv-gl" style="left:2%;top:84%">⎇ main</span><span class="lv-gl o" style="left:36%;top:0">⎇ jay/boss-fight</span></div>${win('Merge request', `<p><b>Boss fight on level 3</b></p><p class="lv-sub">jay/boss-fight → main · 3 changes</p><div class="lv-row"><span class="lv-ok">✓ preview works</span><span class="lv-ok">✓ Maya approved</span></div>`, { cls: 'sm' })}`,
      'A branch is your own copy for trying things. When it works and someone approves, it is merged back into main.'),
    'm3-3': () => fig(win('Agents Hub <small>lanes</small>', `<div class="lv-lanes">${[['src/levels/', 'claude', 'Level 2 platforms'], ['src/ui/', 'codex', 'Title screen'], ['src/art/', 'jay', 'Lantern art'], ['src/audio/', 'rio', 'Footsteps']].map(([f, k, t]) => `<div class="lv-lane"><code>${f}</code>${av(k, true)}<span>${nameOf(k)}</span><small>${t}</small><em>🔒</em></div>`).join('')}</div>
      <p class="lv-sub lv-gap">Maya’s Codex asks Orion’s Claude before touching <code>src/levels/</code>. One click hands it over.</p>`, { cls: 'wide' }),
      'Claim your part. Each person and AI helper stays in its own lane, so changes never collide.'),
    'm3-4': () => fig(`<div class="lv-phone lv-phone--big"><div class="lv-ph-screen lv-ph-app"><p class="lv-k">Needs you</p><p class="lv-ph-t">${av('claude', true)} Merge “Boss fight” into main?</p><p class="lv-sub">3 files · preview works · Maya approved</p><div class="lv-yn"><span class="y">Approve</span><span class="n">Deny</span></div><p class="lv-ph-c">Add a comment…</p></div></div>
      ${win('Review · boss-fight', `<pre class="lv-code lv-diff"><span class="ln"><i>12</i>const boss = makeBoss(<em class="tn">3</em>)</span><span class="ln add"><i>13</i>+ boss.hp = <em class="tn">12</em></span><span class="ln add"><i>14</i>+ boss.onHit(shake)</span><span class="ln del"><i>15</i>− boss.hp = <em class="tn">99</em></span></pre>`, { cls: 'sm' })}`,
      'Before a change joins main, someone looks at it and approves. From a phone, that is one tap.'),
    'm3-5': () => fig(win('# general', msg('maya', '11:20', 'I’m on the title screen now 👋') + msg('jay', '11:21', 'Can I touch <code>src/ui/menu.js</code> for the pause button?') + msg('maya', '11:21', 'Go for it, thanks for asking!', '<div class="lv-reacts"><span>👍 2</span><span>❤️ 1</span></div>'), { cls: 'wide lv-chat' }),
      'Post what you are doing, ask before changing someone else’s part, and say thanks.'),
    'm4-0': () => fig(`${editor('index.html', '<h1>Pixel Quest</h1>\n<p>Jump together.</p>\n<button class="go">Start</button>', { cls: 'sm' })}<div class="lv-site lv-site--card"><p class="lv-site-h">Pixel Quest</p><p class="lv-sub">Jump together.</p><span class="lv-site-btn">Start</span><code class="lv-css">.go { background: orange }</code></div>`,
      'HTML says what is on the page (a heading, a button); CSS says how it looks (colors, sizes, layout).'),
    'm4-1': () => fig(`${editor('game.js', 'let score = 41\nbutton.onclick = () => {\n  score = score + 1\n  show(score)\n}', { cls: 'sm' })}<div class="lv-counter"><span class="lv-site-btn">+1</span><b>42</b><small>runs each time you click</small></div>`,
      'JavaScript makes a page react: a click adds one to the score.'),
    'm4-2': () => fig(`${editor('hello.py', 'friends = ["Maya", "Jay", "Rio"]\nfor name in friends:\n    print("Hi", name)', { cls: 'sm' })}<div class="lv-term"><p><em>$</em> python hello.py</p><p>Hi Maya</p><p>Hi Jay</p><p>Hi Rio</p></div>`,
      'Python reads almost like English: for each name in the list, say hi.'),
    'm4-3': () => fig(`<div class="lv-phone"><div class="lv-ph-screen lv-ph-app"><p class="lv-k">iPhone · Swift</p><p class="lv-ph-t">Hello, tribe!</p><span class="lv-site-btn">Join</span></div></div><div class="lv-phone"><div class="lv-ph-screen lv-ph-app"><p class="lv-k">Android · Kotlin</p><p class="lv-ph-t">Hello, tribe!</p><span class="lv-site-btn g">Join</span></div></div>${editor('App.swift', 'Text("Hello, tribe!")\n  .font(.title)', { cls: 'sm' })}`,
      'Swift makes iPhone apps and Kotlin makes Android apps. React Native or Flutter build both from one codebase.'),
    'm4-4': () => fig(`${editor('player.gd', 'func _on_jump():\n    velocity.y = -400\n    $Sound.play()', { cls: 'sm', right: '<span class="lv-chip">Godot</span>' })}<div class="lv-engines"><span><b>Unity</b><small>C#</small></span><span class="on"><b>Godot</b><small>GDScript</small></span><span><b>Phaser</b><small>JavaScript</small></span></div>`,
      'Game engines and their languages: Unity uses C#, Godot uses GDScript, Phaser uses JavaScript.'),
    'm4-5': () => fig(`${editor('find.sql', "SELECT name FROM recipes\nWHERE name LIKE '%chocolate%'", { cls: 'sm' })}<div class="lv-table"><p class="lv-k">2 matching rows</p><table><tr><th>name</th><th>by</th></tr><tr class="hit"><td>Chocolate cake</td><td>Maya</td></tr><tr><td>Rye bread</td><td>Jay</td></tr><tr class="hit"><td>Chocolate chip cookies</td><td>Rio</td></tr><tr><td>Lemon tart</td><td>Orion</td></tr></table></div>`,
      'SQL asks questions of a database: show every recipe with chocolate in its name.'),
    'm4-6': () => fig(`<div class="lv-term lv-term--big"><p class="lv-tbar"><i></i><i></i><i></i>terminal</p><p><em>$</em> cd pixel-quest</p><p><em>$</em> git status</p><p class="dim">On branch main · 2 files changed</p><p><em>$</em> claude</p><p class="t">✦ Claude Code · ready. What should we build?</p><p><em>›</em> <span class="caret"></span></p></div>`,
      'The terminal is a text window for commands. AI helpers like Claude Code run there.'),
    'm5-0': () => fig(win(co('Company'), `<p class="lv-k">Mission</p><p class="lv-big">Cozy pixel games that friends play together.</p>
      <div class="lv-seats">${seat('CEO', '#F26B1D', 'orion')}${seat('Build', '#38C6B1', 'claude')}${seat('Grow', '#FABD2F', 'codex')}${seat('Run', '#94A3B8', 'maya')}</div>`, { cls: 'wide' }),
      'A company is a project with a mission and seats. Here Orion is CEO, two AI helpers hold Build and Grow, and Maya runs things.'),
    'm5-1': () => fig(win(co('Seat · Grow', '#FABD2F'), `<div class="lv-charter">${row('Held by', `${av('codex', true)} Maya’s Codex`)}${row('Goal this month', '200 people on the waiting list')}${row('Looks after', 'the website · growth tasks')}${row('May do alone', 'draft posts · sort feedback · suggest ideas', 'lv-yes')}${row('Needs an OK', 'publish · spend money · email customers', 'lv-no')}</div>`, { cls: 'wide', right: '<span class="lv-dev">charter</span>' }),
      'A charter is a few lines: the seat’s goal, what it looks after, what it may do alone, and what needs a person’s OK.'),
    'm5-2': () => fig(`<div class="lv-phone lv-phone--big"><div class="lv-ph-screen lv-ph-app"><p class="lv-k">Needs you</p><p class="lv-ph-t">${av('codex', true)} Grow wants to publish a post</p><p class="lv-sub">Demo day post · 1 picture</p><div class="lv-yn"><span class="y">Approve</span><span class="n">Deny</span></div><p class="lv-ph-c">Add a comment…</p></div></div>
      ${win('Grow · what it may do', `<ul class="lv-may"><li class="lv-yes">Draft posts</li><li class="lv-yes">Sort feedback</li><li class="lv-yes">Suggest ideas</li><li class="lv-no">Publish</li><li class="lv-no">Spend money</li><li class="lv-no">Email customers</li></ul>`, { cls: 'sm' })}`,
      'An AI helper in a seat drafts and suggests on its own. Publishing, spending or emailing customers waits for a person’s tap.'),
    'm5-3': () => fig(win('# company <small>standup · Monday</small>', msg('claude', '9:00', '<b>Build:</b> the sign-up page works on the test site. Next: password reset. Nothing stuck.') + msg('codex', '9:00', '<b>Grow:</b> three post drafts are ready. Next: a better landing page. <b>Needs you:</b> pick a draft.') + msg('maya', '9:14', '<b>Run:</b> backups checked ✓ Picking draft 2 now.'), { cls: 'wide lv-chat' }),
      'A standup is a few lines from each seat: what got done, what’s next, and what needs a person.'),
    'm5-4': () => fig(win(co('Money'), `<table class="lv-mt"><tr><th>number</th><th>this month</th><th>from</th></tr><tr><td>Sign-ups</td><td>48</td><td><span class="lv-src">Plausible</span></td></tr><tr><td>Income</td><td>$120</td><td><span class="lv-src">Stripe</span></td></tr><tr><td>Hosting</td><td>$6</td><td><span class="lv-src">${av('maya', true)} typed by Maya</span></td></tr><tr class="off"><td>Ad spend</td><td>·</td><td>no source yet, so it’s hidden</td></tr></table><p class="lv-sub lv-gap">Pretend numbers, just for this lesson.</p>`, { cls: 'wide' }),
      'Every number in the Money view says where it came from. No source, no number.'),
    'm5-5': () => fig(`${win('Legal · starting points', `<ul class="lv-docs"><li><span>📄</span>Privacy policy<em>draft</em></li><li><span>📄</span>Terms of use<em>draft</em></li><li><span>📄</span>Co-founder agreement<em>draft</em></li></ul><p class="lv-sub lv-gap">Starting points, not legal advice. Check with a professional where you live.</p>`, { cls: 'sm' })}
      ${win('Work', `<ul class="lv-docs"><li><span>🔎</span>Find vibecoding work</li><li><span>🤝</span>Invite a builder</li><li><span>⏱️</span>Trade time</li></ul>`, { cls: 'sm' })}`,
      'Legal drafts give you a head start to check with a professional. The Work area helps you find work and more hands.'),
  };
  const QUIZ = (badge, name) => fig(`<div class="lv-badge"><span>${badge}</span><b>${esc(name)}</b><small>Get two of three right to earn it</small></div>`, `A badge for passing the check: ${name}.`);
  window.TribeLearnArt = (key, mod, title) => {
    try {
      const [mm, ll] = key.split('-');
      EYEBROW = ll === 'q' ? `Module ${mm.slice(1)} · quick check` : `Lesson ${mm.slice(1)}.${Number(ll) + 1}${title ? ' · ' + esc(title) : ''}`;
      if (ll === 'q' && mod) return QUIZ(mod.badge, mod.bname);
      const f = ART[key]; return f ? f() : '';
    } catch (e) { return ''; }
  };
})();
