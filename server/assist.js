// Assist: help write the vision and suggest tasks (app/ui/assist.js).
//   GET  /api/assist/vision                 guided-prompt guesses (name, bio, template, README, chat, tasks, docs) + who can draft
//   POST /api/assist/vision {answers, helper: 'flint'|'claude'|'other', agent?}
//        flint  -> { draft, by: 'model'|'basic' }   (the local model when it's on, else a solid template from the answers)
//        claude/other -> { request, channel, agent } (the ask goes to your own agent in your private chat with it; its reply fills the composer)
//   POST /api/assist/complete {text}        -> { phrases }  (short completions from the local model; [] when it's off)
//   GET  /api/assist/tasks[?more=1]         -> { suggestions: [{ id, title, why, src }], model }   (no duplicates of existing tasks, minus dismissed)
//   POST /api/assist/tasks/dismiss {id, title}  remembered per person per project
// People only (no agents, no spectators for writes). Nothing leaves the machine except the host's own Ollama
// (server/brain.js) or the person's own Claude (their DM with it).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STOP = new Set('a an the and or of to for in on at with by is are be it its this that we our us you your from as into up out new first add make set get do one some more just'.split(' '));
const TEMPLATE_TASKS = {
  game: [['Add a title screen with a Start button', 'every game needs a front door'], ['Show a score and lives on screen', 'players like to see progress'], ['Add jump and coin sounds', 'sound makes it feel alive'],
    ['Build a second level', 'more to play'], ['Add a simple boss at the end', 'a goal for the first world'], ['Add touch controls for phones', 'friends will open it on their phones']],
  site: [['Write the home page headline and one-line pitch', 'the first thing people read'], ['Add an About page', 'who is behind it'], ['Make every page look good on phones', 'most visits are on phones'],
    ['Add a contact or sign-up link', 'a way to reach you'], ['Add a favicon and page titles', 'small polish that shows']],
  app: [['Sketch the main screen', 'the screen people use most'], ['Save data between sessions', 'nothing lost on reload'], ['Add a settings screen', 'a home for preferences'],
    ['Make it work offline', 'phones lose signal'], ['Add an empty state for first use', 'the first minute matters']],
  tool: [['Write usage examples in the README', 'how people learn it'], ['Add a --help flag', 'self-explaining'], ['Handle bad input with clear errors', 'friendlier failures']],
  notes: [['Outline the topics', 'a map before the pages'], ['Write the first page', 'get something down'], ['Add an index page that links everything', 'easy to find']],
  '3d': [['Set up the camera and controls', 'move around the scene'], ['Add lighting to the scene', 'mood and depth'], ['Load a first model', 'something to look at']],
  any: [['Write a README: what it is and how to run it', 'helps every new friend and agent'], ['Decide the first milestone', 'a target to aim for'], ['Add a first automated test', 'catch breaks early'],
    ['Invite a friend to try it and give feedback', 'fresh eyes']],
};
const GUESS = {
  game: { what: n => `${n}: a small browser game we build together`, who: 'Friends who like short levels and silly bosses', fun: 'Quick to pick up, easy to share, a little bit silly', done: '3 levels, a boss and a score, playable in the browser', out: 'Online multiplayer, accounts and app stores (for now)' },
  site: { what: n => `${n}: a website that says what we do`, who: 'People who find us and want to know more', fun: 'Clear, fast and good-looking on a phone', done: 'A home page, an About page and a contact link, live on the web', out: 'Logins, payments and a blog (for now)' },
  app: { what: n => `${n}: an app we build together`, who: 'Us and our friends, on our phones', fun: 'Does one thing well and is quick to open', done: 'The main screen works and saves your data', out: 'Accounts, payments and app stores (for now)' },
  tool: { what: n => `${n}: a small tool that saves us time`, who: 'Us, and anyone with the same chore', fun: 'One command does the boring part', done: 'It runs on our machines with a README and a test', out: 'A graphical interface (for now)' },
  notes: { what: n => `${n}: notes and research we keep together`, who: 'The tribe, and whoever joins later', fun: 'Easy to find things and add to them', done: 'An outline and the first pages written', out: 'Publishing it publicly (for now)' },
  any: { what: n => `${n}: something we build together`, who: 'Us and our friends', fun: 'Small, playable early, easy to share', done: 'A first version friends can try', out: 'Accounts, payments and big features (for now)' },
};
const QUESTIONS = [
  { k: 'what', q: 'What are you making?' }, { k: 'who', q: 'Who is it for?' }, { k: 'fun', q: 'What makes it fun or useful?' },
  { k: 'done', q: 'What does "done" look like for v1?' }, { k: 'out', q: 'What is out of scope?' },
];

module.exports = function assist({ P, store, brain, docs, loadTasks, getMembers, presenceFor, postChat, coord, shelf, str, nameOf }) {
  const FILE = '.tribe/assist.json';
  const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const first = n => String(n || 'someone').split(/\s+/)[0];
  const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
  const keyOf = t => words(t).join(' ');
  const idOf = t => 's-' + crypto.createHash('sha1').update(keyOf(t)).digest('hex').slice(0, 10);
  const pid = () => P.current() || P.defaultId();
  const proj = () => P.get(pid()) || {};
  const repoDir = p => { if (!p || !p.repo) return null; try { return fs.realpathSync(p.repo); } catch { return null; } };
  const read = (dir, f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const typesOf = p => { try { return (shelf.view(p).types || []); } catch { return []; } };
  const kindOf = types => ['game', 'site', 'app', 'tool', 'notes', '3d'].find(t => types.includes(t)) || 'any';
  const readVision = () => { let v = ''; try { v = fs.readFileSync(store.p('VISION.md'), 'utf8'); } catch {} return /Replace these lines together/.test(v) ? '' : v; };
  const chatLines = () => { try { return store.readJSONL('chat/general.jsonl', 400).filter(m => !m.deleted && m.by !== 'tribecode' && m.text); } catch { return []; } };

  function readme(dir) {
    if (!dir) return '';
    const t = read(dir, 'README.md') || read(dir, 'readme.md');
    const para = t.split(/\n\s*\n/).map(x => x.trim()).find(x => x && !x.startsWith('#') && !/^\[?!\[/.test(x) && !x.startsWith('<'));
    return clip(para || '', 240);
  }

  // ---------- the vision ----------
  function helpers(me) {
    const live = new Map(presenceFor(me).map(m => [m.id, !!m.online]));
    const mine = getMembers().filter(m => m.role === 'agent' && m.owner === me.id && m.tokenHash);
    const claude = mine.find(a => !a.label) || mine.find(a => (a.kind || 'claude-code') === 'claude-code') || null;
    const view = a => ({ id: a.id, name: a.name, online: !!live.get(a.id), kind: a.kind || 'claude-code' });
    return { claude: claude ? view(claude) : null, others: mine.filter(a => a !== claude).map(view) };
  }
  function guesses(me) {
    const p = proj(), types = typesOf(p), kind = kindOf(types), g = GUESS[kind] || GUESS.any;
    const name = p.name || 'This project', rd = readme(repoDir(p));
    const tasks = loadTasks().filter(t => t.status !== 'done').slice(0, 3).map(t => t.title);
    const chat = chatLines().slice(0, 6).map(m => clip(m.text, 140)).find(t => t.length > 24 && !t.startsWith('/'));
    return {
      name, bio: p.bio || '', types, kind, readme: rd, docs: docs.list().slice(0, 6).map(d => d.title), tasks, chat: chat || '',
      answers: {
        what: p.bio ? `${name}: ${p.bio}` : rd ? `${name}: ${rd.replace(/\.$/, '')}` : g.what(name),
        who: g.who, fun: g.fun,
        done: tasks.length ? tasks.join(', ') : g.done,
        out: g.out,
      },
    };
  }
  const listOf = s => String(s || '').split(/\s*(?:,|;|\n|\band\b)\s*/i).map(x => x.trim().replace(/\.$/, '')).filter(Boolean);
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function template(a) {
    const out = [];
    if (a.what) out.push(`${clip(a.what, 300).replace(/\.$/, '')}.`);
    if (a.who) out.push(`For ${clip(a.who, 200).replace(/^for\s+/i, '').replace(/\.$/, '')}.`);
    if (a.fun) out.push(`What makes it good: ${clip(a.fun, 240).replace(/\.$/, '')}.`);
    const done = listOf(a.done), no = listOf(a.out);
    if (done.length) out.push('', '## Done for v1', ...done.slice(0, 8).map(x => `- ${cap(x)}`));
    if (no.length) out.push('', '## Out of scope', ...no.slice(0, 6).map(x => `- ${cap(x)}`));
    return out.join('\n').trim();
  }
  const answersFrom = b => Object.fromEntries(QUESTIONS.map(({ k }) => [k, clip(b && b.answers && b.answers[k], 400)]));
  const askText = (a, name) => `Help me write the vision for ${name} (it becomes VISION.md, which the plan, the board and every agent read). ` +
    `My answers:\n${QUESTIONS.map(({ k, q }) => `- ${q} ${a[k] || '(not sure yet)'}`).join('\n')}\n\n` +
    'Reply here with just the vision: 3 to 6 short lines, then "## Done for v1" and "## Out of scope" as short bullet lists. No title line, no preamble.';

  async function draft(body, me) {
    const a = answersFrom(body), p = proj(), name = p.name || 'the project', helper = body.helper || 'flint';
    if (helper === 'flint') {
      const basic = template(a);
      const st = brain.status && brain.status();
      if (st && st.online) {
        try {
          const ctx = `Project: ${name}${p.bio ? ` (${p.bio})` : ''}\nTasks: ${loadTasks().slice(0, 8).map(t => t.title).join('; ') || '(none)'}\n`;
          const out = await brain.generate(`${ctx}\n${askText(a, name)}`, { system: 'You help a small group of friends write a short, concrete project vision. Plain markdown. Use only what they told you.', maxTokens: 400, timeoutMs: 45000 });
          if (out && out.trim().length > 30) return { draft: out.replace(/^#\s+.*\n+/, '').trim().slice(0, 6000), by: 'model' };
        } catch {}
      }
      return { draft: basic, by: 'basic' };
    }
    const h = helpers(me);
    const ag = helper === 'claude' ? h.claude : h.others.find(x => x.id === body.agent) || h.others[0];
    if (!ag) throw Object.assign(new Error(helper === 'claude' ? 'connect your Claude Code first' : 'no other agent is connected'), { status: 409 });
    const ch = 'dm-' + [me.id, ag.id].sort().join('-');
    const msg = postChat(ch, me.id, `✍️ ${askText(a, name)}`);
    try { coord.tell(ag.id, 'ask', `${me.name} asked you to draft the vision for ${name} in your private chat with them. Read it (check your messages) and answer with reply.`, me.id); } catch {}
    return { request: msg.id, channel: ch, agent: ag, at: msg.at };
  }

  async function complete(body) {
    const text = clip(body && body.text, 3000);
    const st = brain.status && brain.status();
    if (!text || text.length < 12 || !st || !st.online) return { phrases: [] };
    try {
      const out = await brain.generate(`A project vision being written:\n${text}\n\nSuggest 2 short phrases (at most 8 words each) that would make it clearer: who it is for, a first milestone or what is out of scope. Reply with a JSON array of strings only.`,
        { system: 'You suggest short additions to a project vision. JSON only.', maxTokens: 80, timeoutMs: 12000 });
      const j = JSON.parse((String(out || '').match(/\[[\s\S]*\]/) || ['[]'])[0]);
      return { phrases: (Array.isArray(j) ? j : []).map(x => clip(x, 70)).filter(Boolean).slice(0, 2) };
    } catch { return { phrases: [] }; }
  }

  // ---------- suggested tasks ----------
  function repoIdeas(dir) {
    if (!dir) return [];
    const out = [];
    let names = []; try { names = fs.readdirSync(dir); } catch { return []; }
    if (!names.some(n => /^readme(\.md)?$/i.test(n))) out.push(['Write a README: what it is and how to run it', 'the repo has no README']);
    const testy = n => /(^|[._-])(test|tests|spec|__tests__)([._-]|$)/i.test(n);
    let files = 0; const todos = []; let hasTests = names.some(testy);
    const walk = (d, depth) => {
      if (depth > 3 || files > 400) return;
      let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'build') continue;
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (testy(e.name)) hasTests = true; walk(f, depth + 1); continue; }
        if (testy(e.name)) hasTests = true;
        if (!/\.(js|ts|jsx|tsx|py|rs|go|gd|lua|html|css|md)$/i.test(e.name) || ++files > 400) continue;
        if (todos.length >= 3) continue;
        let s = ''; try { const st = fs.statSync(f); if (st.size > 200_000) continue; s = fs.readFileSync(f, 'utf8'); } catch { continue; }
        const m = s.match(/(?:\/\/|#|<!--|\/\*)\s*(?:TODO|FIXME)[:\s]+([^\n*]{6,90})/);
        if (m) todos.push([m[1].replace(/-->|\*\/$/, '').trim(), path.relative(dir, f)]);
      }
    };
    walk(dir, 0);
    for (const [t, f] of todos) out.push([`${cap(t)}`.slice(0, 120), `TODO in ${f}`]);
    if (!hasTests) out.push(['Add a first automated test', 'the repo has no tests yet']);
    return out;
  }
  function visionIdeas(v) {
    if (!v) return [];
    const out = [], sec = v.split(/^##\s+/m);
    const done = sec.find(s => /^(done|v1|milestone|first)/i.test(s));
    const items = done ? done.split('\n').slice(1).filter(l => /^\s*[-*]\s+/.test(l)).map(l => l.replace(/^\s*[-*]\s+/, '').trim())
      : listOf(((v.match(/done[^:\n]*:\s*([^\n]+)/i) || [])[1]) || '');
    for (const it of items.slice(0, 6)) {
      const t = clip(it, 110).replace(/\.$/, ''); if (!t) continue;
      const verb = /^(add|build|make|write|ship|create|design|set|fix|draw|put|let|support|show)\b/i.test(t);
      const pm = t.match(/^(\d+|two|three|four|five|six)\s+(.+)/i), plural = pm && `${pm[1].toLowerCase()} ${pm[2]}`;
      out.push([verb ? cap(t) : plural ? `Build the first of ${plural}` : `Build ${t.replace(/^(a|an|the)\s+/i, 'the ')}`, 'from the vision']);
    }
    return out;
  }
  function chatIdeas() {
    const out = [];
    for (const m of chatLines().slice(-80).reverse()) {
      const x = String(m.text).match(/\b(?:we should|let'?s|todo:?|need to|we need to|can we|could we)\s+([^.?!\n]{8,90})/i);
      if (x) out.push([cap(x[1].trim().replace(/^(also|maybe)\s+/i, '')), `from chat · ${first(nameOf(m.by))}`]);
      if (out.length >= 2) break;
    }
    return out;
  }
  const dkey = me => `${pid()}:${me.id}`;
  function dismissed(me) { const db = store.readJSON(FILE, {}); return new Set((db.dismissed && db.dismissed[dkey(me)]) || []); }
  function similar(a, b) {
    const x = new Set(words(a)), y = new Set(words(b)); if (!x.size || !y.size) return false;
    let n = 0; for (const w of x) if (y.has(w)) n++;
    return n / Math.min(x.size, y.size) >= 0.6;
  }
  function pool(me) {
    const p = proj(), vtext = readVision();
    let kind = kindOf(typesOf(p));
    if (kind === 'any' || kind === '3d') {   // no starter picked yet: read the kind off the vision ("a cozy pixel game…")
      const v = String(vtext || '').toLowerCase();
      kind = /\b(game|platformer|puzzle|level|player|rpg|arcade)\b/.test(v) ? 'game' : /\b(website|site|landing page|portfolio|blog|shop page)\b/.test(v) ? 'site'
        : /\b(app|mobile|phone|ios|android|tracker|planner)\b/.test(v) ? 'app' : /\b(tool|script|bot|cli|dashboard|automat\w*)\b/.test(v) ? 'tool' : kind;
      if (!TEMPLATE_TASKS[kind]) kind = 'any';
    }
    const raw = [
      ...visionIdeas(vtext).map(x => [...x, 'vision']),
      ...chatIdeas().map(x => [...x, 'chat']),
      ...(kind !== 'any' ? TEMPLATE_TASKS[kind] : []).map(([t, w]) => [t, `${kind} starter · ${w}`, 'template']),
      ...repoIdeas(repoDir(p)).map(x => [...x, 'repo']),
      ...(!docs.list().length ? [['Write a short design note in Files', 'no docs yet', 'docs']] : []),
      ...TEMPLATE_TASKS.any.map(([t, w]) => [t, w, 'starter']),
    ];
    const tasks = loadTasks().map(t => t.title), gone = dismissed(me), seen = [];
    const out = [];
    for (const [title, why, src] of raw) {
      const id = idOf(title);
      if (!keyOf(title) || gone.has(id) || tasks.some(t => similar(t, title)) || seen.some(s => similar(s, title))) continue;
      seen.push(title); out.push({ id, title, why, src });
    }
    return out;
  }
  async function suggestTasks(me, more) {
    const list = pool(me);
    if (!more) return { suggestions: list.slice(0, 5), model: !!(brain.status && brain.status().online) };
    const st = brain.status && brain.status();
    if (st && st.online) {
      try {
        const p = proj(), v = readVision();
        const out = await brain.generate(`Project: ${p.name}${p.bio ? ` (${p.bio})` : ''}\nVision:\n${clip(v, 1500) || '(none)'}\nExisting tasks: ${loadTasks().map(t => t.title).slice(0, 30).join('; ') || '(none)'}\n\nSuggest 5 new, small, concrete next tasks that are not already on the list. Reply with a JSON array of short task titles only.`,
          { system: 'You suggest small next tasks for a team of friends building software. JSON only.', maxTokens: 220, timeoutMs: 30000 });
        const j = JSON.parse((String(out || '').match(/\[[\s\S]*\]/) || ['[]'])[0]);
        const tasks = loadTasks().map(t => t.title), gone = dismissed(me), got = [];
        for (const t of (Array.isArray(j) ? j : []).map(x => clip(x, 120)).filter(Boolean)) {
          const id = idOf(t); if (gone.has(id) || tasks.some(x => similar(x, t)) || got.some(g => similar(g.title, t))) continue;
          got.push({ id, title: cap(t), why: 'idea from the local model', src: 'model' });
        }
        if (got.length) return { suggestions: got.slice(0, 5), model: true, by: 'model' };
      } catch {}
    }
    return { suggestions: list.slice(5, 10), model: false, by: 'basic' };
  }
  function dismiss(me, body) {
    const sid = str(body.id, 20) || (body.title ? idOf(str(body.title, 200)) : '');
    if (!/^s-[0-9a-f]{10}$/.test(sid)) throw Object.assign(new Error('which suggestion?'), { status: 400 });
    const db = store.readJSON(FILE, {}); db.dismissed = db.dismissed || {};
    db.dismissed[dkey(me)] = [...new Set([...(db.dismissed[dkey(me)] || []), sid])].slice(-300);
    store.writeJSON(FILE, db);
    return { ok: true, id: sid };
  }

  async function route(req, res, { m, b, c, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role === 'agent') return fail(res, 403, 'assist is for people');
    if (!P.canSee(me, pid())) return fail(res, 403, 'you are not in that project');
    const writer = me.role !== 'spectator';
    try {
      if (b === 'vision' && m === 'GET') {
        const st = brain.status ? brain.status() : {};
        return send(res, 200, { ...guesses(me), questions: QUESTIONS, vision: readVision(), model: { online: !!st.online, model: st.model || '' }, helpers: helpers(me) });
      }
      if (!writer) return fail(res, 403, 'spectators are read-only');
      if (b === 'vision' && m === 'POST') return send(res, 200, await draft(await readBody(req), me));
      if (b === 'complete' && m === 'POST') return send(res, 200, await complete(await readBody(req)));
      if (b === 'tasks' && !c && m === 'GET') return send(res, 200, await suggestTasks(me, url.searchParams.get('more') === '1'));
      if (b === 'tasks' && c === 'dismiss' && m === 'POST') return send(res, 200, dismiss(me, await readBody(req)));
      return fail(res, 404, 'no such assist route');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, template, pool, QUESTIONS };
};
