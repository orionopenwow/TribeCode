// Flint, grown up (v0.27.1). Flint is TribeCode's own helper; this file adds what makes him the tribe's central AI,
// on top of his intent router (flint.js) and the host side (server/flintmem.js):
//   • Remembers you: "remember I'm learning CSS", "call me Camp", "what do you know about me?", "forget everything".
//     Notes are yours only (the host keeps them per person, never in anyone else's copy); see, edit and delete them in
//     Settings › Flint. He uses them to greet you ("Morning Camp…") and, with a brain, to fit his answers to you.
//   • Teaches your way: "teach me what a function is" → a short lesson as a picture, an analogy, code or steps, with
//     "Another way" and "Quiz me lightly". The style you pick is remembered. With a brain, any topic.
//   • Writes your docs: "write the launch doc" (README, meeting notes, changelog) → a real doc in Files, built from the
//     vision, tasks, decisions and chat, marked as a Flint draft.
//   • Builds anything: "build me a habit tracker" → writes the vision, starts a first version you can run, and hands the
//     brief to your AI helpers; he says exactly what he did and what he still needs.
//   • Learns the tribe: repeat a few Flint commands and he offers "Make this a skill?"; skills are shared, run by name
//     ("/ship-friday"), and edited in Settings › Flint. He also knows the project's own words ("what are batches?").
//   • A morning brief: "hi" / "brief me" greets you by name with what changed and what's next (Recommended next).
// Public: window.TribeFlintMem = { route(text), log(text), act(arg), brief(), mountSettings(el), lessons }.
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const F = () => window.TribeFlint;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const act = (label, name, arg) => ({ label, act: name, arg: arg == null ? '' : String(arg) });
  const on = () => !!(C.connected && C.connected());
  const meId = () => ((C.state && C.state().me) || {}).id;
  const first = n => String(n || '').split(/\s+/)[0];

  // ---------- state ----------
  let mem = { notes: [], style: '' }, skills = [], canCreate = false, words = [], loaded = 0;
  const FF = () => window.TribeFlintFly && window.TribeFlintFly.enabled() ? window.TribeFlintFly : null;   // v0.27.2 Flint at work
  const seen = q => { const e = document.querySelector(q); return e && e.offsetParent !== null ? e : null; };
  async function load(force) {
    if (!on() || (!force && Date.now() - loaded < 30000)) return;
    loaded = Date.now();
    try { mem = await C.api('/flint/memory'); } catch {}
    try { const r = await C.api('/flint/skills'); skills = r.skills || []; canCreate = !!r.canCreate; } catch {}
    try { words = (await C.api('/flint/vocab')).words || []; } catch {}
  }
  if (C.on) C.on('ws', m => { if (m && m.type === 'flint-skills') { loaded = 0; load(true).then(drawSettings); } });
  const nameNote = () => { const n = mem.notes.find(x => x.kind === 'name'); if (!n) return ''; const m = /(?:my name is|call me|i'?m called)\s+(.+)$/i.exec(n.text); return (m ? m[1] : n.text).replace(/[.!]+$/, '').trim(); };
  const myName = () => nameNote() || first(((C.state && C.state().me) || {}).name);
  function brief() {
    if (!mem.notes.length && !mem.style) return '';
    return `\n\nAbout ${myName() || 'them'} (notes they asked Flint to remember):\n${mem.notes.slice(-12).map(n => '- ' + n.text).join('\n')}${mem.style ? `\n- Likes to learn with ${STYLE_NAME[mem.style]}.` : ''}`;
  }

  // ---------- lessons (built in, no model needed) ----------
  const STYLES = ['picture', 'analogy', 'code', 'steps'];
  const STYLE_NAME = { picture: 'pictures', analogy: 'analogies', code: 'code examples', steps: 'step-by-step instructions' };
  const STYLE_LABEL = { picture: 'As a picture', analogy: 'As an analogy', code: 'As code', steps: 'Step by step' };
  const L = {
    function: { title: 'a function', alias: /^functions?$|^func$|^method$/,
      picture: '📥 inputs ➜ [ 🧰 the function: the same steps every time ] ➜ 📤 an answer\n\nLike a box with a slot on top and a chute at the bottom.',
      analogy: 'A function is a recipe. You write it once ("make pancakes: flour, eggs, milk, stir, fry"), give it a name, and then just say "make pancakes" whenever you want them. The ingredients you hand it are the inputs; the pancakes are the answer.',
      code: '```\nfunction greet(name) {\n  return "Hi, " + name + "!";\n}\n\ngreet("Maya");   // "Hi, Maya!"\n```\n`name` is the input, `return` sends the answer back.',
      steps: '1. Give a set of steps a name.\n2. Say what it needs (its inputs).\n3. Say what it hands back (its answer).\n4. Call it by name whenever you need those steps.',
      quiz: ['Why put steps in a function?', ['So you can reuse them by name', 'To make the code run faster'], 0] },
    variable: { title: 'a variable', alias: /^variables?$|^var$|^const$|^let$/,
      picture: '🏷️ score ➜ [ 42 ]\n\nA labelled box. The label stays the same; what\'s inside can change.',
      analogy: 'A variable is a labelled jar in the kitchen. The label says "sugar"; you can fill it, use some, refill it. Everyone knows where to look because of the label.',
      code: '```\nlet score = 0;\nscore = score + 10;   // now 10\nconst name = "Jay";   // const: this one never changes\n```',
      steps: '1. Pick a clear name (score, playerName).\n2. Put a value in it.\n3. Use the name anywhere you need that value.\n4. Change it when things change.',
      quiz: ['What does a variable hold?', ['A value you can name and change', 'A whole program'], 0] },
    loop: { title: 'a loop', alias: /^loops?$|^for loop$|^while loop$|^iteration$/,
      picture: '🔁 [ do this ] ➜ again ➜ again ➜ … ➜ ✋ stop when done',
      analogy: 'A loop is "do ten push-ups". You don\'t write push-up ten times; you say the move once and how many times (or until when).',
      code: '```\nfor (let i = 1; i <= 3; i++) {\n  console.log("Lap " + i);\n}\n// Lap 1, Lap 2, Lap 3\n```',
      steps: '1. Say what to repeat.\n2. Say when to stop (a count, or a condition).\n3. Let the computer do the boring part.',
      quiz: ['What must every loop have?', ['A way to stop', 'A picture'], 0] },
    condition: { title: 'an if (a condition)', alias: /^if$|^ifs?$|^if statements?$|^conditions?$|^conditionals?$|^else$/,
      picture: '❓ is it raining? ── yes ➜ ☂️ take an umbrella\n                └─ no ➜ 😎 sunglasses',
      analogy: 'An if is a fork in the road with a sign: "If you\'re hungry, turn left to the café; otherwise keep walking."',
      code: '```\nif (lives === 0) {\n  showGameOver();\n} else {\n  keepPlaying();\n}\n```',
      steps: '1. Ask a yes/no question.\n2. Say what happens on yes.\n3. Optionally, say what happens on no.',
      quiz: ['An if statement chooses between…', ['Paths, based on a yes/no question', 'Colors'], 0] },
    array: { title: 'a list (an array)', alias: /^arrays?$|^lists?$/,
      picture: '📋 [ 🍋 lemon, 🍓 berry, 🌿 mint ]\n      0         1        2   ← positions start at 0',
      analogy: 'An array is a numbered shelf. Each slot holds one thing, and you find things by their slot number.',
      code: '```\nconst flavors = ["lemon", "berry", "mint"];\nflavors[0];          // "lemon"\nflavors.push("ginger");   // add one\n```',
      steps: '1. Put related things in one list.\n2. Get one by its position (starting at 0).\n3. Add, remove or loop over them.',
      quiz: ['In most languages, the first item is at position…', ['0', '1'], 0] },
    object: { title: 'an object', alias: /^objects?$|^dictionary$|^dict$|^json$/,
      picture: '🧾 player = { name: "Maya", score: 12, lives: 3 }',
      analogy: 'An object is a contact card: one person, many labelled fields (name, phone, birthday).',
      code: '```\nconst batch = { flavor: "ginger", day: 4, ready: false };\nbatch.day;          // 4\nbatch.ready = true;\n```',
      steps: '1. Group facts about one thing.\n2. Give each fact a label (a key).\n3. Read or change a fact by its label.',
      quiz: ['An object stores…', ['Labelled facts about one thing', 'Only numbers'], 0] },
    api: { title: 'an API', alias: /^apis?$|^endpoints?$|^rest$/,
      picture: '📱 your app ── "menu, please" ➜ 🍽️ the API (the waiter) ➜ 👩‍🍳 the server\n📱 your app ⟵── 🍝 here you go ───────────────┘',
      analogy: 'An API is a waiter. You don\'t walk into the kitchen; you order from a menu, and the waiter brings back what you asked for.',
      code: '```\nconst res = await fetch("/api/orders");\nconst orders = await res.json();\n```\nYou ask a URL, you get data back.',
      steps: '1. Find the menu (the API\'s docs).\n2. Ask for one thing (a request).\n3. Get an answer back (a response, often JSON).',
      quiz: ['An API is mostly…', ['A menu of things one program can ask another for', 'A kind of database'], 0] },
    database: { title: 'a database', alias: /^databases?$|^db$|^sql$|^tables?$/,
      picture: '🗄️ orders\n| id | flavor | who      |\n| 1  | ginger | Café     |\n| 2  | lemon  | Farmers  |',
      analogy: 'A database is a very organised filing cabinet that never forgets and can find any folder in an instant.',
      code: '```\nSELECT flavor, who FROM orders WHERE day = \'Saturday\';\n```',
      steps: '1. Decide what you keep (orders, people…).\n2. Store each as a row with the same columns.\n3. Ask questions to find, add or change rows.',
      quiz: ['A database is for…', ['Keeping and finding data', 'Drawing the screen'], 0] },
    html: { title: 'HTML', alias: /^html$|^markup$/,
      picture: '🏠 HTML = the walls and rooms\n🎨 CSS = the paint\n⚙️ JavaScript = the lights and doors that move',
      analogy: 'HTML is the skeleton of a page: headings, paragraphs, buttons, pictures, in order.',
      code: '```\n<h1>Saturday Bake Sale</h1>\n<p>Oak Street Park, 9am</p>\n<button>Reserve a box</button>\n```',
      steps: '1. Wrap each piece in a tag (<h1>, <p>, <button>).\n2. Put them in the order you want.\n3. Open it in a browser.',
      quiz: ['HTML describes…', ['What\'s on the page', 'How the page looks'], 0] },
    css: { title: 'CSS', alias: /^css$|^styles?$|^stylesheets?$/,
      picture: '🎨 h1 { color: rose; size: big }  ➜  the headline turns big and rose',
      analogy: 'CSS is the outfit and makeup for your HTML: colors, sizes, spacing, layout.',
      code: '```\nh1 { color: #C2410C; font-size: 48px; }\nbutton { border-radius: 999px; }\n```',
      steps: '1. Pick what to style (h1, .card, #menu).\n2. Say how (color, size, spacing).\n3. Refresh and adjust.',
      quiz: ['CSS controls…', ['How things look', 'What data is saved'], 0] },
    javascript: { title: 'JavaScript', alias: /^javascript$|^js$|^typescript$|^ts$/,
      picture: '👆 click ➜ ⚙️ JavaScript runs ➜ ✨ the page changes',
      analogy: 'If HTML is the house and CSS the paint, JavaScript is the electricity: things switch on, open and react.',
      code: '```\ndocument.querySelector("button").onclick = () => {\n  alert("Box reserved!");\n};\n```',
      steps: '1. Find a thing on the page.\n2. Say what should happen when something occurs (a click).\n3. Change the page in response.',
      quiz: ['JavaScript is what makes a page…', ['React and change', 'Exist at all'], 0] },
    git: { title: 'Git and commits', alias: /^git$|^commits?$|^version control$|^github$|^pushing$|^push$/,
      picture: '💾 commit ── 💾 commit ── 💾 commit   ← save points you can go back to\n                └── 🌿 a branch to try something',
      analogy: 'Git is save points in a video game for your code. A commit is one save; a branch is a side quest you can merge back.',
      code: '```\ngit add .\ngit commit -m "Add the reserve button"\ngit push\n```',
      steps: '1. Make a change.\n2. Commit it with a short message (a save point).\n3. Push it so the tribe gets it. TribeCode\'s autopilot can do this for you.',
      quiz: ['A commit is…', ['A save point with a message', 'A deleted file'], 0] },
    bug: { title: 'a bug (and debugging)', alias: /^bugs?$|^debugging$|^debug$|^errors?$/,
      picture: '🐞 expected: "Reserve" works ➜ got: nothing ➜ 🔍 narrow it down ➜ 🛠️ fix ➜ ✅',
      analogy: 'Debugging is detective work: what did you expect, what happened instead, and where do the clues point?',
      code: '```\nconsole.log("orders:", orders);   // look before you guess\n```',
      steps: '1. Say what you expected and what happened.\n2. Make it happen again on purpose.\n3. Shrink the problem until the cause is obvious.\n4. Fix it, then check nothing else broke. (Ctrl Shift B reports a bug with the logs attached.)',
      quiz: ['The first step in fixing a bug is…', ['Making it happen again on purpose', 'Rewriting everything'], 0] },
    server: { title: 'a server (front end vs back end)', alias: /^servers?$|^backend$|^back end$|^frontend$|^front end$|^hosting$/,
      picture: '🖥️ front end (what you see, in the browser) ⇄ 🏭 back end (a server that keeps data and does the work)',
      analogy: 'The front end is the shop floor customers walk around; the back end is the stockroom and the till.',
      code: '```\n// back end (Node)\nserver.get("/api/orders", (req, res) => res.json(orders));\n```',
      steps: '1. The browser shows the page (front end).\n2. It asks the server for data (back end).\n3. The server answers; the page updates.',
      quiz: ['Saved data usually lives on…', ['The back end', 'The CSS'], 0] },
  };
  const lessonKey = topic => { const t = String(topic || '').toLowerCase().replace(/^(an?|the)\s+/, '').replace(/[?.!]+$/, '').trim(); for (const [k, v] of Object.entries(L)) if (k === t || v.alias.test(t)) return k; return ''; };
  function lessonReply(key, style) {
    const l = L[key], s = STYLES.includes(style) ? style : (mem.style || 'analogy');
    const next = STYLES[(STYLES.indexOf(s) + 1) % STYLES.length];
    return { text: `**${l.title[0].toUpperCase() + l.title.slice(1)}**, ${STYLE_NAME[s]} edition:\n\n${l[s]}`, acts: [act('Another way', 'flintmem', `teach:${key}:${next}`), act('Quiz me lightly', 'flintmem', `quiz:${key}`), act('Open the Academy', 'flintmem', 'academy')] };
  }
  async function setStyle(s) { mem.style = s; if (on()) try { mem = await C.api('/flint/memory/style', { method: 'POST', body: { style: s } }); } catch {} }

  // ---------- skills: notice repeats, offer to save, run by name ----------
  const LOG = 'tribecode.flint.log', OFFERED = 'tribecode.flint.offered';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const norm = t => String(t || '').toLowerCase().replace(/[^\w\s/'-]/g, '').replace(/\s+/g, ' ').trim();
  let running = 0, lastSeq = null;
  function log(text) {
    if (running) return;
    const t = norm(text); if (!t || t.startsWith('/') || /^(save|make) (that|this|it)/.test(t)) return;
    const l = ls.get(LOG, []).concat([{ t: text.trim().slice(0, 200), at: Date.now() }]).slice(-40); ls.set(LOG, l);
    // a run of 2–4 commands that appeared before, in the same order, within the last 40 → offer once
    const n = l.length;
    for (const k of [3, 2]) {
      if (n < k * 2) continue;
      const tail = l.slice(-k).map(x => norm(x.t)), key = tail.join(' → ');
      if (new Set(tail).size < k) continue;
      for (let i = 0; i + k <= n - k; i++) {
        if (l.slice(i, i + k).every((x, j) => norm(x.t) === tail[j])) {
          const offered = ls.get(OFFERED, []); if (offered.includes(key)) return;
          ls.set(OFFERED, offered.concat([key]).slice(-50));
          lastSeq = l.slice(-k).map(x => x.t);
          const name = suggestName(lastSeq);
          setTimeout(() => F() && F().say(`You've done these ${k} together before: ${lastSeq.map(s => `“${(s)}”`).join(' → ')}. Want me to make it a skill? Then anyone can run it with **/${name}**.`,
            [act(`Make it /${name}`, 'flintmem', `save:${name}`), act('Not now', 'flintmem', 'noop')]), 500);
          return;
        }
      }
    }
  }
  const suggestName = steps => (norm(steps[0]).replace(/^(open|show|add|make|write|what'?s|what is|go to|please)\s+/, '').split(' ').filter(w => w.length > 2 && !['the', 'and', 'for', 'our', 'new'].includes(w)).slice(0, 2).join('-') || 'my-routine').slice(0, 24);
  async function saveSkill(name, steps) {
    if (!canCreate) return { text: 'Only builders and up can save tribe skills. Ask a host or admin to save this one.' };
    try { const r = await C.api('/flint/skills', { method: 'POST', body: { name, steps } }); skills.push(r.skill);
      return { text: `Saved **/${r.skill.name}** for the whole tribe: ${r.skill.steps.map(s => `“${(s)}”`).join(' → ')}. Type /${r.skill.name} to run it; rename or edit it in Settings › Flint.`, acts: [act(`Run /${r.skill.name}`, 'ask', `/${r.skill.name}`), act('Edit skills', 'flintmem', 'settings')] }; }
    catch (e) { return { text: `I couldn't save it: ${(e.message)}` }; }
  }
  async function runSkill(sk) {
    if (running > 2) return { text: 'That skill calls itself, so I stopped.' };
    F().say(`Running **/${sk.name}**: ${sk.steps.length} step${sk.steps.length > 1 ? 's' : ''}. Anything outward or costly still asks you first.`);
    running++;
    try { let i = 0; for (const st of sk.steps) { i++; const th = seen('#flint .fl-thread') || seen('.ff-thread'); if (FF() && th) FF().to(th, `/${sk.name} · ${i}/${sk.steps.length}`); await new Promise(r => setTimeout(r, 450)); await F().step(st); } }
    finally { running--; }
    try { await C.api(`/flint/skills/${encodeURIComponent(sk.id)}/ran`, { method: 'POST', body: {} }); } catch {}
    return true;
  }

  // ---------- docs, build, brief ----------
  const DOCK = { launch: /launch (doc|plan)|launch$|go-?live plan/, readme: /read ?me/, notes: /meeting notes|notes from (today|the meeting|the call)|minutes/, changelog: /change ?log|what('?s| has) changed (doc|log)|release notes/ };
  async function draft(kind, t) {
    if (!on()) return { text: 'Connect to your tribe first, then I can write it into Files.' };
    F().say(`Writing the ${kind === 'readme' ? 'README' : kind === 'notes' ? 'meeting notes' : kind === 'changelog' ? 'changelog' : 'launch doc'} from your vision, tasks, decisions and chat…`);
    const fd = seen('#nest-docs') || seen('#view-docs') || seen('#flint .fl-thread'); if (FF() && fd) FF().work(fd, 'Writing…');
    try { const r = await C.api('/flint/draft', { method: 'POST', body: { kind, ask: t } }); const pid = C.project && C.project(); if (FF() && fd) FF().done(fd, 'Saved to Files ✓');
      return { text: `Done: **${(r.title)}** is in Files, marked as a Flint draft${r.basic ? ' (written from a template and your project; give me a brain and I write it in full)' : ` (written with ${(r.via || 'the tribe\'s AI')})`}. Read it over before you share it.`, acts: [act('Open it', 'doc', `${pid}|${r.slug}`)] }; }
    catch (e) { if (FF()) FF().home(); return { text: `I couldn't write it: ${(e.message)}` }; }
  }
  async function build(what) {
    if (!on()) return { text: 'Connect to your tribe first, then I can start it.' };
    // a phone-only tribe has no code repository: build from a starter in the Design flow, which runs on this phone
    if (window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo() && window.TribeDesignFlow && window.TribeDesignFlow.catalog) {
      try {
        const cat = await window.TribeDesignFlow.catalog(), t = ' ' + String(what || '').toLowerCase() + ' ';
        const score = s => (s.tags || []).concat([s.id, s.title || '']).reduce((n, k) => n + (t.includes(' ' + String(k).toLowerCase()) ? 2 + String(k).length / 20 : 0), 0);
        let pick = cat.map(s => ({ s, n: score(s) })).sort((a, b) => b.n - a.n)[0];
        pick = pick && pick.n > 0 ? pick.s : cat.find(s => s.id === (/\b(game|play|level|3d|arcade)\b/.test(t) ? 'platformer' : 'todo'));
        if (pick && await window.TribeDesignFlow.fromFlint(pick.id, what)) {
          const near = /\b3d\b/.test(t) && pick.kind === 'game' ? ' 3D games need a computer for now, so I started the closest 2D one.' : '';
          return { text: `On it: “${what}”. I started the ${pick.title || pick.id} starter on this phone; it runs right here, no AI needed.${near} Tell me what to change, or move to a host when your AI helpers should build more.`, acts: [act('Open Design', 'nav', 'canvas')] };
        }
      } catch {}
    }
    const pid = C.project(), done = [], need = [];
    const bt = seen('#pvw') || seen('#nest-preview-slot') || seen('#view-home') || seen('#main'); if (FF() && bt) FF().work(bt, 'Building');
    // Flint's free tier first (server/flintfree.js): a recipe from the build kit, no AI needed; or an honest "this needs a stronger AI"
    let tier = null; try { tier = await C.api('/flint/tier', { method: 'POST', body: { ask: 'build ' + what } }); } catch {}
    try { const v = await C.api('/vision'); if (!String(v.text || '').trim()) { const name = ((C.state().projects || []).find(p => p.id === pid) || {}).name || 'Our project'; await C.api('/vision', { method: 'PUT', body: { text: `# ${name}\n\n${what}\n` } }); done.push('wrote it down as the project vision'); } } catch {}
    let made = false, free = null;
    if (tier && tier.tier === 'recipe') {
      try { free = await C.api(`/projects/${encodeURIComponent(pid)}/flint/build`, { method: 'POST', body: { ask: 'build ' + what } }); } catch (e) { need.push(`the code repository (${e.message})`); }
      if (free && free.built) { made = true; done.push(`built a ${free.title} for free from the open-source build kit${free.dir ? ` in \`${free.dir}/\`` : ''}, with no AI`); }
      else if (free && free.exists) { made = true; done.push(`found the ${free.title} already in \`${free.dir}/\``); }
      if (made && window.TribePreview) setTimeout(() => { window.TribePreview.open(); if (free.href && window.TribePreview.show) setTimeout(() => window.TribePreview.show(free.href), 500); }, 300);
    }
    if (!made) { try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/setup/starter`, { method: 'POST', body: {} }); made = !!(r.written && r.written.length); } catch {} if (made) done.push('started a first version you can run in the Preview'); }
    const agents = (C.state().members || []).filter(m => m.role === 'agent' && (!m.project || m.project === pid));
    // a free build stands on its own; hand it on only when an AI helper is here to take it further, or when it needs one
    if (!(free && free.built && !agents.length)) {
      const ask = `please build this in the project's code so it runs in TribeCode's preview (index.html at the top folder, relative paths): ${what}${made ? ` A first version is already in the repo${free && free.dir ? ` at ${free.dir}/` : ''}; build on it.` : ''}`;
      let asked = false; try { await C.api('/agents/channel', { method: 'POST', body: { text: '@agents ' + ask } }); asked = true; } catch { try { await C.api('/chat/general', { method: 'POST', body: { text: 'Claude, ' + ask } }); asked = true; } catch {} }
      if (asked) done.push(agents.length ? `handed the brief to ${agents.length === 1 ? agents[0].name : agents.length + ' AI helpers'}` : 'posted the brief for your AI helpers');
      if (!agents.length) need.push(tier && tier.tier === 'agent' ? 'a stronger AI for this one (it needs real engineering): connect Claude Code, Codex or Gemini, or the host can add an AI key' : 'an AI helper to build the rest: connect Claude Code, Codex or Gemini (I can open that)');
    }
    if (FF()) FF().done(seen('#pvw') || bt, made ? 'First version ✓' : 'Brief sent ✓');
    const tail = need.length ? ` Still needed: ${need.join('; ')}.` : free && free.built ? ' It\'s in the Preview now. Pick anything there and tell me what to change: words, colors, size and spacing are free too.' : ' It refreshes in the Preview as they work.';
    return { text: `On it: “${(what)}”. I ${done.length ? done.join(', ') : 'tried, but couldn\'t reach the project'}.${tail}`,
      acts: [act('Open the Preview', 'preview'), ...(agents.length || (free && free.built) ? [] : [act('Connect my AI', 'connect')])] };
  }
  async function morning() {
    const h = new Date().getHours(), hi = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening', nm = myName();
    const bits = [];
    if (on()) {
      try { const tasks = (await C.api('/tasks')).tasks || []; const mine = tasks.filter(t => t.assignee === meId() && t.status !== 'done'); const fresh = tasks.filter(t => Date.now() - Date.parse(t.updated || t.created || 0) < 864e5);
        if (mine.length) bits.push(`${mine.length} task${mine.length > 1 ? 's' : ''} on you (first: “${(mine[0].title)}”)`); if (fresh.length) bits.push(`${fresh.length} task update${fresh.length > 1 ? 's' : ''} today`); } catch {}
      const working = mem.notes.find(n => n.kind === 'working'); if (working) bits.push(`last time you were ${(working.text.replace(/^i'?m\s+|^i am\s+/i, ''))}`);
    }
    let acts = [];
    try { const pid = C.project && C.project(); if (pid && window.TribeReco) { const r = await window.TribeReco.list(pid); recoCache = r; if (r[0]) bits.push(`next up: ${(r[0].t.toLowerCase())}`); acts = r.slice(0, 2).map(x => act(x.b, 'flintmem', `reco:${x.id}`)); } } catch {}
    if (FF()) setTimeout(() => { const last = seen('#flint .fl-thread .fl-msg:last-child') || seen('.ff-thread .fl-msg:last-child'); if (last) FF().done(last, 'Your brief'); }, 120);
    return { text: `${hi}${nm ? ' ' + nm : ''}. ${bits.length ? bits.join('; ') + '.' : 'All quiet. Want to start something?'}`, acts: acts.length ? acts : [act('What\'s happening?', 'ask', 'What\'s happening?')] };
  }
  let recoCache = [];

  // ---------- the router (called first by flint.js; return null to let Flint carry on) ----------
  async function route(raw) {
    const text = String(raw || '').trim(), t = text.toLowerCase().replace(/[?!.]+$/, '').trim();
    let m;
    await load();
    // run a skill by name
    if ((m = /^\/([a-z0-9-]{1,32})$/.exec(t)) || (m = /^run (?:the )?([a-z0-9 -]{1,32}?) skill$/.exec(t))) {
      const sk = skills.find(s => s.name === m[1].replace(/\s+/g, '-')); if (sk) return runSkill(sk);
      if (t.startsWith('/')) return { text: `There's no /${(m[1])} yet. ${skills.length ? 'Skills: ' + skills.map(s => '/' + s.name).join(', ') + '.' : 'Do a few things with me and I\'ll offer to save them as a skill.'}` };
    }
    if ((m = /^(?:save|make|turn) (?:that|this|it|those|these)(?: into| as)? (?:a )?skill(?: called| named)? ?([a-z0-9 -]{0,32})$/.exec(t))) {
      const l = ls.get(LOG, []).slice(-3).map(x => x.t); if (!l.length) return { text: 'Do a few things with me first, then say "save that as a skill".' };
      return saveSkill(m[1] ? m[1].trim().replace(/\s+/g, '-') : suggestName(l), l);
    }
    if (/^(list|show|what are)( (my|our|the))? (flint )?skills$/.test(t)) return { text: skills.length ? `The tribe's skills: ${skills.map(s => `**/${s.name}** (${s.steps.length} steps)`).join(', ')}.` : 'No skills yet. Repeat a few things and I\'ll offer to save them, or say "save that as a skill".', acts: [act('Edit skills', 'flintmem', 'settings')] };
    // memory
    if ((m = /^(?:my name is|call me|i'?m called)\s+([a-z][\w' -]{0,30})$/i.exec(text.replace(/[.!]+$/, '')))) return rememberIt(`My name is ${m[1].trim()}`, 'name', `Nice to meet you, ${(m[1].trim())}. I'll remember that.`);
    if ((m = /^(?:please\s+)?remember\s+(?:that\s+)?((?:i|i'?m|i am|my|me)\b[\s\S]{2,280})$/i.exec(text))) return rememberIt(m[1].replace(/[.!]+$/, ''));
    if (/^(what do you (know|remember) about me|who am i|what have you remembered|my memory|show (me )?my notes from flint)$/.test(t)) {
      if (!mem.notes.length && !mem.style) return { text: 'I don\'t know anything about you yet. Tell me things like "remember I\'m learning CSS" or "call me Camp". Only you can see what I remember.', acts: [act('Open Settings › Flint', 'flintmem', 'settings')] };
      return { text: `Here's what you asked me to remember (only you can see it):\n${mem.notes.map(n => '• ' + n.text).join('\n')}${mem.style ? `\n• You like to learn with ${STYLE_NAME[mem.style]}.` : ''}`, acts: [act('Edit in Settings', 'flintmem', 'settings'), act('Forget everything', 'flintmem', 'forget')] };
    }
    if (/^forget (everything|all|it all|what you know)( about me)?$/.test(t)) return { text: 'Forget everything I remember about you? This can\'t be undone.', acts: [act('Yes, forget it all', 'flintmem', 'forget!'), act('Keep it', 'flintmem', 'noop')] };
    // teaching style
    if ((m = /^(?:teach me|explain things|i learn best|i like to learn|i prefer to learn)(?: things)? (?:with|using|by|through|in|as) (pictures?|a picture|diagrams?|analog(?:y|ies)|an analogy|code|examples|code examples|steps?|step[- ]by[- ]step)$/.exec(t))) {
      const s = /pic|diagram/.test(m[1]) ? 'picture' : /analog/.test(m[1]) ? 'analogy' : /code|example/.test(m[1]) ? 'code' : 'steps'; await setStyle(s);
      return { text: `Got it: I'll teach you with ${STYLE_NAME[s]}. Try "teach me what an API is".` };
    }
    // teach
    if ((m = /^(?:teach me|explain|explain to me|help me understand|what(?:'s| is) an?|what are)\s+(?:about\s+|what\s+)?(?:an?\s+|the\s+)?(.+?)(?:\s+(?:is|are))?(?:\s+(?:with|as|using|in)\s+(pictures?|a picture|analog(?:y|ies)|an analogy|code|steps?|step by step))?$/.exec(t))) {
      const key = lessonKey(m[1]), want = m[2] ? (/pic/.test(m[2]) ? 'picture' : /analog/.test(m[2]) ? 'analogy' : /code/.test(m[2]) ? 'code' : 'steps') : '';
      if (want && want !== mem.style) await setStyle(want);
      if (key) return lessonReply(key, want || mem.style);
      // the project's own words: "what are batches?"
      const stem = w => w.replace(/'s$/, '').replace(/(ch|sh|x|ss)es$/, '$1').replace(/ies$/, 'y').replace(/([^s])s$/, '$1'); const w = words.find(x => x.term === stem(m[1]) || x.term === m[1]);
      if (w && /^what/.test(t)) return { text: `In this project, **${(w.term)}** comes up a lot: “${(w.hint)}”` };
      if (/^teach me|^explain|^help me understand/.test(t)) {
        const s = want || mem.style || 'analogy';
        if (F().think) { const ok = await F().think(`Teach me ${m[1]} in a very short lesson using ${STYLE_NAME[s]} (three short parts, plain words).`); if (ok) return true; }
        return { text: `I don't have a built-in lesson on “${(m[1])}” yet. I know functions, variables, loops, ifs, lists, objects, APIs, databases, HTML, CSS, JavaScript, Git and bugs. Give me a brain and I can teach anything, or try the Academy for business topics.`, acts: [act('Give Flint a brain', 'brain'), act('Teach me functions', 'ask', 'teach me what a function is'), act('Open the Academy', 'flintmem', 'academy')] };
      }
    }
    // docs
    if (/^(?:please\s+|can you\s+)?(?:write|draft|make|create|put together)\s+(?:me\s+|us\s+)?(?:a|an|the|our)?\s*/.test(t)) for (const [k, rx] of Object.entries(DOCK)) if (rx.test(t)) return draft(k, text);
    // build
    if ((m = /^(?:please\s+|can you\s+|could you\s+)?(?:make|create|start|give me|set up)\s+(?:me\s+|us\s+)?(?:an?\s+|the\s+|our\s+)?((?:[\w'-]+\s+){0,4}?(?:3d game|three\.?js game|game|platformer|to-?do (?:list|app)|todo app|checklist app|video editor|video editing app)\b.{0,160})$/.exec(t)) && !/^(?:[\w'-]+\s+){0,2}?(?:doc|document|sheet|spreadsheet|slides?|deck|presentation)\b/.test(m[1])) return build(text.replace(/^(?:please\s+|can you\s+|could you\s+)?(?:make|create|start|give me|set up)\s+(?:me\s+|us\s+)?/i, ''));
    if ((m = /^(?:please\s+|can you\s+|could you\s+)?build\s+(?:me\s+|us\s+)?(?:an?\s+|the\s+|our\s+)?(.{3,200})$/.exec(t)) && !/\b(doc|document|sheet|spreadsheet|slides?|deck|presentation|web ?site|home ?page|landing page)\b/.test(m[1])) return build(text.replace(/^(?:please\s+|can you\s+|could you\s+)?build\s+(?:me\s+|us\s+)?/i, ''));
    // morning brief
    if (/^(hi|hey|hello|hiya|yo|morning|good (morning|afternoon|evening)|brief me|daily brief|my brief|catch me up on me)( flint)?$/.test(t) && (myName() || on())) return morning();
    if (/^(what should i do( next)?|what'?s next for me|what next)$/.test(t) && window.TribeReco && C.project && C.project()) {
      const r = await window.TribeReco.list(C.project()); recoCache = r;
      if (r.length) return { text: `Here's what I'd do next:\n${r.map((x, i) => `${i + 1}. **${(x.t)}**: ${(x.why)}`).join('\n')}`, acts: r.map(x => act(x.b, 'flintmem', `reco:${x.id}`)) };
    }
    return null;
  }
  async function rememberIt(textIn, kind, reply) {
    if (!on()) return { text: 'Connect to your tribe first, then I can remember things for you.' };
    try { const r = await C.api('/flint/memory', { method: 'POST', body: { text: textIn, kind } }); loaded = 0; await load(true); drawSettings();
      if (FF()) setTimeout(() => { const at = seen('#set-flintmem') || seen('#flint .fl-thread .fl-msg:last-child') || seen('.ff-thread .fl-msg:last-child') || seen('#flint'); if (at) FF().done(at, 'Remembered ✓'); }, 150);
      return { text: r.same ? 'I already remember that.' : (reply || `Okay, I'll remember: “${(r.note.text)}”. Only you can see it, in Settings › Flint.`), acts: [act('What do you know about me?', 'ask', 'What do you know about me?')] }; }
    catch (e) { return { text: `I couldn't save that: ${(e.message)}` }; }
  }

  // ---------- act buttons in Flint's replies ----------
  async function doAct(arg) {
    const [k, a, b] = String(arg || '').split(':');
    const say = (r) => { if (r && r !== true) F().say(r.text, r.acts || []); };
    if (k === 'noop') return;
    if (k === 'settings') { if (!window.TribeSettings) return; await window.TribeSettings.open(); return setTimeout(() => { const el = document.getElementById('set-flint'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 300); }
    if (k === 'academy') return window.TribeAcademy && window.TribeAcademy.open({});
    if (k === 'teach') { if (STYLES.includes(b)) await setStyle(b); return say(lessonReply(a, b)); }
    if (k === 'quiz') { const q = L[a] && L[a].quiz; if (!q) return; return F().say(`Quick one: ${q[0]}`, q[1].map((o, i) => act(o, 'flintmem', `ans:${a}:${i}`))); }
    if (k === 'ans') { const q = L[a] && L[a].quiz; if (!q) return; return F().say(+b === q[2] ? '✓ Right. Nicely done.' : `Not quite: it's “${q[1][q[2]]}”. Want it another way?`, +b === q[2] ? [act('Teach me another one', 'ask', 'teach me what an API is')] : [act('Another way', 'flintmem', `teach:${a}:${STYLES[(STYLES.indexOf(mem.style || 'analogy') + 1) % 4]}`)]); }
    if (k === 'save') { const steps = lastSeq || ls.get(LOG, []).slice(-3).map(x => x.t); return say(await saveSkill(a, steps)); }
    if (k === 'forget!') { try { await C.api('/flint/memory', { method: 'DELETE' }); mem = { notes: [], style: '' }; drawSettings(); F().say('Done. I\'ve forgotten everything about you.'); } catch (e) { F().say(e.message); } return; }
    if (k === 'forget') return say({ text: 'Forget everything I remember about you? This can\'t be undone.', acts: [act('Yes, forget it all', 'flintmem', 'forget!'), act('Keep it', 'flintmem', 'noop')] });
    if (k === 'reco') { const x = recoCache.find(r => r.id === a); if (x) { if (x.unlock && window.TribeMode && window.TribeMode.unlock && !window.TribeMode.allowsKey(x.unlock)) window.TribeMode.unlock(x.unlock); x.run(); } }
  }

  // ---------- Settings › Flint ----------
  let setEl = null;
  function drawSettings() {
    if (!setEl || !document.body.contains(setEl)) return;
    const mine = meId(), boss = ((C.state().me || {}).role === 'host') || ((C.state().me || {}).role === 'admin');
    const flyOn = !window.TribeFlintFly || window.TribeFlintFly.enabled();
    setEl.innerHTML = `<div class="fm">
      ${window.TribeFlintFly ? `<label class="fm-fly"><input type="checkbox" id="fm-fly" ${flyOn ? 'checked' : ''}><span><b>Show Flint moving around</b><small>When Flint changes something, a small flame flies there so you can see what he's doing. Just on this device.</small></span></label>` : ''}
      <section class="fm-sec"><h4>What Flint remembers about you</h4><p class="fm-hint">Only you can see these. Tell Flint “remember I'm learning CSS” or edit them here.</p>
        <ul class="fm-notes">${mem.notes.length ? mem.notes.map(n => `<li data-id="${(n.id)}"><span class="fm-kind">${(n.kind)}</span><input class="input fm-in" value="${(n.text)}" maxlength="300" aria-label="Note"><button class="btn sm fm-save">Save</button><button class="btn sm ghost fm-del" aria-label="Delete note">Delete</button></li>`).join('') : '<li class="fm-empty">Nothing yet.</li>'}</ul>
        <form class="fm-add"><input class="input" name="t" placeholder="Add a note, e.g. I like code examples" maxlength="300" aria-label="New note"><button class="btn sm">Add</button></form>
        <label class="fm-style">How you like to learn <select class="input" id="fm-style"><option value="">Flint picks</option>${STYLES.map(s => `<option value="${s}" ${mem.style === s ? 'selected' : ''}>${STYLE_LABEL[s]}</option>`).join('')}</select></label>
        ${mem.notes.length ? '<button class="btn sm ghost fm-forget">Forget everything</button>' : ''}</section>
      <section class="fm-sec"><h4>Tribe skills</h4><p class="fm-hint">Named sequences of Flint commands anyone in the tribe can run, like /ship-friday. Flint offers to make one when you repeat yourself.</p>
        <ul class="fm-skills">${skills.length ? skills.map(s => { const edit = canCreate && (s.by === mine || boss); return `<li data-id="${(s.id)}"><b>/${(s.name)}</b><span class="fm-runs">${s.runs || 0} runs</span>${edit ? `<textarea class="input fm-steps" rows="${Math.min(6, s.steps.length + 1)}" aria-label="Steps, one per line">${(s.steps.join('\n'))}</textarea><div class="fm-row"><button class="btn sm fm-ssave">Save steps</button><button class="btn sm ghost fm-sdel">Remove</button></div>` : `<ol>${s.steps.map(x => `<li>${(x)}</li>`).join('')}</ol>`}</li>`; }).join('') : '<li class="fm-empty">No skills yet.</li>'}</ul>
        ${canCreate ? `<form class="fm-newskill"><input class="input" name="n" placeholder="Name, e.g. ship-friday" maxlength="32" aria-label="Skill name"><textarea class="input" name="s" rows="3" placeholder="One Flint command per line, e.g.&#10;what's new&#10;open the preview" aria-label="Steps"></textarea><button class="btn sm">Save skill</button></form>` : '<p class="fm-hint">Builders and up can save skills.</p>'}</section></div>`;
    const q = s => setEl.querySelector(s), qa = s => setEl.querySelectorAll(s);
    qa('.fm-notes li[data-id]').forEach(li => {
      li.querySelector('.fm-save').onclick = async () => { try { await C.api(`/flint/memory/${li.dataset.id}`, { method: 'PUT', body: { text: li.querySelector('.fm-in').value } }); loaded = 0; await load(true); drawSettings(); } catch (e) { alertish(e); } };
      li.querySelector('.fm-del').onclick = async () => { try { await C.api(`/flint/memory/${li.dataset.id}`, { method: 'DELETE' }); loaded = 0; await load(true); drawSettings(); } catch (e) { alertish(e); } };
    });
    const add = q('.fm-add'); if (add) add.onsubmit = async e => { e.preventDefault(); const v = add.t.value.trim(); if (!v) return; try { await C.api('/flint/memory', { method: 'POST', body: { text: v } }); loaded = 0; await load(true); drawSettings(); } catch (er) { alertish(er); } };
    const st = q('#fm-style'); if (st) st.onchange = async () => { await setStyle(st.value); };
    const fy = q('#fm-fly'); if (fy) fy.onchange = () => window.TribeFlintFly.setEnabled(fy.checked);
    const fg = q('.fm-forget'); if (fg) fg.onclick = () => doAct('forget!');
    qa('.fm-skills > li[data-id]').forEach(li => {
      const sv = li.querySelector('.fm-ssave'), dl = li.querySelector('.fm-sdel');
      if (sv) sv.onclick = async () => { try { await C.api(`/flint/skills/${li.dataset.id}`, { method: 'PUT', body: { steps: li.querySelector('.fm-steps').value.split('\n') } }); loaded = 0; await load(true); drawSettings(); } catch (e) { alertish(e); } };
      if (dl) dl.onclick = async () => { try { await C.api(`/flint/skills/${li.dataset.id}`, { method: 'DELETE' }); loaded = 0; await load(true); drawSettings(); } catch (e) { alertish(e); } };
    });
    const ns = q('.fm-newskill'); if (ns) ns.onsubmit = async e => { e.preventDefault(); try { await C.api('/flint/skills', { method: 'POST', body: { name: ns.n.value, steps: ns.s.value.split('\n') } }); loaded = 0; await load(true); drawSettings(); } catch (er) { alertish(er); } };
  }
  const alertish = e => { const t = window.TribeApp && window.TribeApp.toast; if (t) t(e.message); };
  async function mountSettings(el) { setEl = el; el.innerHTML = '<p class="fm-hint">Loading…</p>'; loaded = 0; await load(true); drawSettings(); }

  window.TribeFlintMem = { route, log, act: doAct, brief, mountSettings, lessons: L, load };
})();
