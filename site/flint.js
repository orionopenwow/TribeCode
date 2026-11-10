/* Meet Flint (v0.27.1): the live try-it chat, the exhibits' beats and the hero's changing line. Everything runs in the
   page with no network. The answers are what Flint really does in TribeCode, scripted for a pretend "Kombucha Empire"
   tribe; the stage on the right shows the app reacting. Reduced motion: no typing delays, exhibits show their last
   frame. Public (for tests): window.FlintTry = { ask(text) }. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const still = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const wait = ms => new Promise(r => setTimeout(r, still ? 0 : ms));

  /* ---------- hero: Flint's line changes ---------- */
  const LINES = ['Morning Camp. 2 new orders came in.', 'Added jump.wav, credited in CREDITS.md.', 'Want me to make that a skill?', 'Here’s an API, as a picture.', 'Wrote the launch doc as a draft.'];
  const said = $('fp-said'); let li = 0;
  if (said && !still) setInterval(() => { if (document.hidden) return; li = (li + 1) % LINES.length; said.style.opacity = 0; setTimeout(() => { said.textContent = LINES[li]; said.style.opacity = 1; }, 220); }, 3200);
  if (said) said.style.transition = 'opacity .2s';

  /* ---------- the try-it chat ---------- */
  const thread = $('ft-thread'), view = $('ft-view'), where = $('ft-where'), chips = $('ft-chips');
  if (!thread) return;
  const mem = { notes: [], style: 'picture' };
  let busy = false;
  function bubble(who, html, acts) {
    const d = document.createElement('div');
    d.className = 'ft-m ft-m--' + who;
    d.innerHTML = who === 'me' ? esc(html) : `<img src="assets/brand/flint.svg" alt="" width="18" height="23"><div><p>${html}</p>${acts && acts.length ? `<div class="ft-acts">${acts.map(a => `<button class="ft-act" type="button" data-ask="${esc(a[1])}">${esc(a[0])}</button>`).join('')}</div>` : ''}</div>`;
    thread.appendChild(d); thread.scrollTop = thread.scrollHeight; return d;
  }
  async function say(text, acts) { const t = bubble('fl', '<span class="ft-dots">•••</span>'); await wait(520); t.remove(); return bubble('fl', md(text), acts); }
  const stage = (place, html) => { where.textContent = 'Kombucha Empire · ' + place; view.innerHTML = html; };

  // a tiny synthesised jump sound (the asset library's CC0 "jump" is made the same way)
  function jump() {
    try { const A = window.AudioContext || window.webkitAudioContext; const a = jump.ctx || (jump.ctx = new A()); const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      o.type = 'square'; o.frequency.setValueAtTime(280, t); o.frequency.exponentialRampToValueAtTime(820, t + .16); g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .22);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + .24); } catch {}
  }
  const LESSON = {
    picture: '📱 your app ── “menu, please” ➜ 🍽️ the API ➜ 👩‍🍳 the server\n📱 ⟵──── here you go ───────────┘',
    analogy: 'An API is a waiter. You don’t walk into the kitchen; you order from a menu and the waiter brings back what you asked for.',
    code: 'const res = await fetch("/api/orders");\nconst orders = await res.json();',
    steps: '1. Find the menu (the API’s docs).\n2. Ask for one thing (a request).\n3. Get an answer back (often JSON).',
  };
  const STYLE = { picture: 'Picture', analogy: 'Analogy', code: 'Code', steps: 'Steps' };
  function lessonStage(s) {
    stage('Flint · lesson', `<p class="fv-k">lesson · an API</p><div class="fv-tabs">${Object.keys(STYLE).map(k => `<button type="button" data-style="${k}" aria-pressed="${k === s}">${STYLE[k]}</button>`).join('')}</div><pre class="fv-pre">${esc(LESSON[s])}</pre><p class="fv-note">📝 Flint remembers you like to learn with ${s === 'picture' ? 'pictures' : s === 'code' ? 'code' : s === 'steps' ? 'steps' : 'analogies'}.</p>`);
    view.querySelectorAll('[data-style]').forEach(b => b.onclick = () => ask(`teach me what an API is as ${b.dataset.style === 'steps' ? 'steps' : b.dataset.style}`));
  }

  const SCRIPT = [
    [/^(hi|hey|hello|morning|good morning|brief me)\b/, async () => {
      stage('Dashboard', `<p class="fv-k">morning brief</p><div class="fv-card"><b>Morning Camp.</b> 2 new orders came in overnight.</div><ul class="fv-list"><li class="ok">Ginger batch is ready to bottle (day 10)</li><li class="wait">2 tasks on you: “Orders page”, “Café list”</li><li class="wait">Next up: fill the Grow seat</li></ul>`);
      return say('Morning Camp. 2 new orders came in; the ginger batch is ready to bottle. 2 tasks on you, and next up is filling the Grow seat.', [['What should I do next?', 'what should I do next?'], ['Teach me what an API is', 'teach me what an API is']]);
    }],
    [/jump sound|add a sound|sound effect/, async () => {
      stage('Files › Assets', `<p class="fv-k">asset library · added to the project</p><div class="fv-card"><div class="fv-row"><span class="fv-wave">${[6, 14, 22, 30, 24, 16, 10, 20, 28, 18, 8].map(h => `<i style="height:${h}px"></i>`).join('')}</span><b>jump.wav</b><button class="fv-play" type="button" data-jump>▶ Play</button></div><p style="margin:8px 0 0">assets/sounds/jump.wav · CC0 · credited in assets/CREDITS.md</p></div>`);
      view.querySelector('[data-jump]').onclick = jump; jump();
      return say('Added a jump sound: `assets/sounds/jump.wav` (credits in `assets/CREDITS.md`). Want more?', [['Make the title bigger', 'make the title bigger']]);
    }],
    [/title bigger|bigger title|make .*bigger/, async () => {
      stage('Preview', `<p class="fv-k">preview · live</p><div class="fv-pv"><h5 id="fv-title" style="font-size:18px">Kombucha Empire</h5><p style="margin:6px 0 0;color:#94A3B8">6 batches brewing · 23 orders this week</p></div>`);
      await wait(250); const h = $('fv-title'); if (h) h.style.fontSize = '34px';
      return say('Made the title bigger in the preview (18px → 34px). Undo is one tap.', [['Undo', 'undo'], ['Write the launch doc', 'write the launch doc']]);
    }],
    [/^undo/, async () => { const h = $('fv-title'); if (h) h.style.fontSize = '18px'; return say('Undone.'); }],
    [/teach me|explain|what('?s| is) an? api/, async (t) => {
      const s = /analog/.test(t) ? 'analogy' : /code/.test(t) ? 'code' : /step/.test(t) ? 'steps' : /pic/.test(t) ? 'picture' : mem.style;
      mem.style = s; lessonStage(s);
      const next = { picture: 'analogy', analogy: 'code', code: 'steps', steps: 'picture' }[s];
      return say(`**An API**, ${s === 'picture' ? 'as a picture' : s === 'analogy' ? 'as an analogy' : s === 'code' ? 'as code' : 'step by step'}:\n\n${LESSON[s]}`, [['Another way', `teach me what an API is as ${next}`], ['Quiz me lightly', 'quiz me']]);
    }],
    [/^quiz/, async () => say('Quick one: an API is mostly…', [['A menu of things to ask for', 'answer a'], ['A kind of database', 'answer b']])],
    [/^answer a/, async () => say('✓ Right. Nicely done.')],
    [/^answer b/, async () => say('Not quite: it’s a menu of things one program can ask another for. Want it another way?', [['Another way', 'teach me what an API is as analogy']])],
    [/launch doc|launch plan|readme|meeting notes|changelog/, async (t) => {
      const title = /readme/.test(t) ? 'README' : /notes/.test(t) ? 'Meeting notes' : /changelog/.test(t) ? 'Changelog' : 'Launch plan';
      stage('Files › ' + title, `<div class="fv-doc"><p class="fv-flag">✦ Flint draft · from your vision, tasks, decisions and chat · review it before you share it</p><h5>${title}</h5></div>`);
      const doc = view.querySelector('.fv-doc');
      for (const line of ['<b>What we’re launching</b><br>Track every kombucha batch from brewing to bottling.', '<b>Done</b><br>Batch counter · Orders page · Café list', '<b>Still to do</b><br>☐ Delivery routes (Jay) ☐ Flavor photos (Maya)', '<b>Launch checklist</b><br>☐ Works on a phone ☐ Someone outside tried it ☐ Post written']) { await wait(380); const p = document.createElement('p'); p.innerHTML = line; doc.appendChild(p); }
      return say(`Done: **${title}** is in Files, marked as a Flint draft. Read it over before you share it.`, [['Open it', 'open files']]);
    }],
    [/^remember|^call me|^my name is/, async (t) => {
      const note = t.replace(/^remember (that )?/, '').replace(/^call me (.+)/, 'my name is $1'); mem.notes.push(note.charAt(0).toUpperCase() + note.slice(1));
      stage('Settings › Flint', `<p class="fv-k">what flint remembers about you · only you can see these</p>${mem.notes.map(n => `<div class="fv-note">📝 ${esc(n)}</div>`).join('')}<p style="margin:0;color:#94A3B8">Edit or delete any note here, any time.</p>`);
      return say(`Okay, I’ll remember: “${note}”. Only you can see it, in Settings › Flint.`, [['What do you know about me?', 'what do you know about me?']]);
    }],
    [/know about me|who am i/, async () => {
      const notes = mem.notes.length ? mem.notes : ['My name is Camp'];
      stage('Settings › Flint', `<p class="fv-k">what flint remembers about you</p>${notes.map(n => `<div class="fv-note">📝 ${esc(n)}</div>`).join('')}<div class="fv-note">🎨 You like to learn with ${mem.style === 'picture' ? 'pictures' : mem.style}</div>`);
      return say(`Here’s what you asked me to remember (only you can see it):\n${notes.map(n => '• ' + n).join('\n')}\n• You like to learn with ${mem.style === 'picture' ? 'pictures' : mem.style}.`, [['Forget everything', 'forget everything']]);
    }],
    [/^forget/, async () => { mem.notes = []; stage('Settings › Flint', '<p class="fv-k">what flint remembers about you</p><p>Nothing yet.</p>'); return say('Done. I’ve forgotten everything about you.'); }],
    [/^build( me)?/, async (t) => {
      const what = t.replace(/^build( me| us)?\s*(an?\s+)?/, '') || 'a habit tracker';
      stage('Preview', `<p class="fv-k">building · ${esc(what)}</p><ul class="fv-list" id="fv-b"></ul>`);
      const ul = $('fv-b');
      for (const s of ['Wrote it down as the project vision', 'Started a first version you can run', 'Handed the brief to Orion’s Claude']) { await wait(520); const li2 = document.createElement('li'); li2.className = 'ok'; li2.textContent = s; ul.appendChild(li2); }
      await wait(400); const pv = document.createElement('div'); pv.className = 'fv-pv'; pv.innerHTML = '<h5 style="font-size:20px">Flat habits</h5><p style="margin:6px 0 0;color:#94A3B8">☑ Bins out · ☑ Plants watered · ☐ Dishes</p>'; view.appendChild(pv);
      return say(`On it: “${what}”. I wrote it down as the vision, started a first version in the Preview, and handed the brief to Orion’s Claude. It refreshes as they work.`);
    }],
    [/whiteboard/, async () => {
      stage('Whiteboard', '<p class="fv-k">whiteboard · live with the tribe</p><div class="fv-board"><i style="--x:8%;--y:14%;--c:#FABD2F">Farmers market Saturday!</i><i style="--x:48%;--y:44%;--c:#38C6B1;--r:2deg">New flavor: hibiscus</i></div>');
      return say('Whiteboard lives here. Opened it for you.');
    }],
    [/^\/ship-friday|ship friday/, async () => {
      stage('Flint · skill', '<p class="fv-k">running /ship-friday · 3 steps</p><ul class="fv-list" id="fv-s"></ul>');
      await say('Running **/ship-friday**: 3 steps. Anything outward or costly still asks you first.');
      const ul = $('fv-s');
      for (const s of ['what’s new: 2 orders, 1 task done', 'write the changelog: drafted in Files', 'open the preview: opened']) { await wait(600); const li2 = document.createElement('li'); li2.className = 'ok'; li2.textContent = s; ul.appendChild(li2); }
      return say('All 3 steps done.');
    }],
    [/what('?s| is) new|what changed|catch me up/, async () => {
      stage('Dashboard', '<p class="fv-k">what’s new · today</p><ul class="fv-list"><li class="ok">Maya’s Codex added Today’s orders</li><li class="ok">Jay finished “Delivery routes”</li><li class="wait">1 approval waiting for you</li></ul>');
      const n = (whatsNew = (whatsNew || 0) + 1);
      const r = await say('3 changes today: Maya’s Codex added Today’s orders, Jay finished delivery routes, and 1 approval is waiting for you.', [['Write the changelog', 'write the changelog']]);
      if (n === 2) await say('You’ve done “what’s new” → “write the changelog” before. Want me to make it a skill? Then anyone can run it with **/ship-friday**.', [['Make it /ship-friday', '/ship-friday']]);
      return r;
    }],
    [/what should i do|what next|next up/, async () => {
      stage('Dashboard › Recommended next', '<p class="fv-k">recommended next · picked for this project</p><ul class="fv-list"><li>🪑 Fill the Grow seat</li><li>💵 Track the money</li><li>🧩 Find add-ons for this project</li></ul>');
      return say('Here’s what I’d do next:\n1. **Fill the Grow seat**: give it to a friend, hire through Work, or let an AI helper hold it.\n2. **Track the money**: import a Stripe CSV in a minute.\n3. **Find add-ons** for this project.');
    }],
    [/open files|^files/, async () => { stage('Files', '<p class="fv-k">files</p><ul class="fv-list"><li>📄 Launch plan <span style="color:#6C7CFF">· Flint draft</span></li><li>📊 Budget</li><li>✨ Vision</li></ul>'); return say('Opened Files.'); }],
  ];
  let whatsNew = 0;
  const CHIPS = [['Hi Flint', 'hi'], ['Add a jump sound', 'add a jump sound'], ['Teach me what an API is', 'teach me what an API is'], ['Write the launch doc', 'write the launch doc'], ['Remember I like code examples', 'remember I like code examples'], ['Build me a habit tracker', 'build me a habit tracker'], ['What’s new?', "what's new?"], ['Open the whiteboard', 'open the whiteboard']];
  chips.innerHTML = CHIPS.map(c => `<button class="ft-chip" type="button" data-ask="${esc(c[1])}">${esc(c[0])}</button>`).join('');

  async function ask(text) {
    text = String(text || '').trim(); if (!text || busy) return; busy = true;
    try {
      bubble('me', text);
      const t = text.toLowerCase().replace(/[?!.]+$/, '');
      const hit = SCRIPT.find(([rx]) => rx.test(t));
      if (hit) await hit[1](t);
      else await say('Here I can show a few things Flint does in the app. In your own tribe, Flint answers anything with a brain, and the everyday things without one. Try one of these:', [['Add a jump sound', 'add a jump sound'], ['Teach me what an API is', 'teach me what an API is'], ['Build me a habit tracker', 'build me a habit tracker']]);
    } finally { busy = false; }
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (b && b.closest('[data-try]')) ask(b.dataset.ask); });
  $('ft-form').addEventListener('submit', e => { e.preventDefault(); const i = $('ft-in'); const v = i.value; i.value = ''; ask(v); });
  stage('Dashboard', '<p class="fv-k">kombucha empire · dashboard</p><div class="fv-card"><b>6 batches brewing</b> · 148 bottles ready · 23 orders this week</div><p style="margin:0;color:#94A3B8">Ask Flint something on the left and watch this change.</p>');
  bubble('fl', md('Hi, I’m **Flint**. I live in every tribe. Press a suggestion below, or type your own.'));
  window.FlintTry = { ask };

  /* ---------- exhibits: play their beats once they're on screen ---------- */
  const ex = [...document.querySelectorAll('[data-fx]')];
  if (still || !('IntersectionObserver' in window)) { ex.forEach(x => x.querySelectorAll('[data-b]').forEach(b => b.classList.add('is-on'))); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting || e.target.dataset.played) return; e.target.dataset.played = '1';
    const x = e.target; x.classList.add('is-play');
    const steps = [...x.querySelectorAll('[data-b]')], max = Math.max(...steps.map(s => +s.dataset.b));
    for (let n = 1; n <= max; n++) setTimeout(() => steps.filter(s => +s.dataset.b === n).forEach(s => s.classList.add('is-on')), 250 + (n - 1) * 750);
  }), { threshold: .35 });
  ex.forEach(x => io.observe(x));
})();
