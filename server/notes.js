// The top of Docs: "Create a repo for <project>?" and the notes catalog.
//
// REPO START (no repo yet): one hero card with sensible defaults, all on: push to a private GitHub repo when a
// token or the gh CLI is there (else local, with a "Connect GitHub" chip), auto-commit, autopilot, and a folder
// per person. Creating reuses server/flow.js (createRepo: starter files, git init, GitHub). Every human member
// gets people/<member-slug>/README.md (now, and when they join later), and they and their agents get that
// folder as a coord lane. Only the tribe host creates (git runs on the host); others can nudge the host.
//
// CATALOG: people type quick lines like chat. Each raw line is stored at once (.tribe/notes/<project>.jsonl in
// the tribe folder) and shown live to everyone in the project. Then, in the background, the local model
// (server/brain.js tidyNote) fixes typos, titles, tags and files it into a topic doc ("Gameplay ideas", "Art &
// sound", "Bugs to look at"…) with [[links]] to related topics; without a model, plain rules do it and mark it
// "tidy later". The cleaned result goes to .tribe/notes/<project>.clean.jsonl, the topic doc in Docs, the
// Secretary's journal (secretary.ingest) and, when the project has a repo, notes/catalog/<topic>.md in the
// repo (committed when auto-commit is on, pushed when it has a remote).
//
// HTTP (project-scoped: every request already runs inside one project the caller can see):
//   GET  /api/dstart                 { hasRepo, canCreate, host, github, people, roles, settings }
//   POST /api/dstart/create          host only: { github, autoCommit, autopilot, folders } -> { steps, github }
//   POST /api/dstart/github          host only: { token? } -> push the new repo to GitHub now
//   POST /api/dstart/nudge           ask the host to create the repo (rate limited)
//   GET  /api/notes                  { entries: [{ id, at, by, text, clean }] }
//   POST /api/notes                  { text } -> { entry }        (people only; spectators and agents read)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./gitutil');

// Topics the rules know. The model may pick one of these, an existing topic doc, or name a new one.
const TOPICS = [
  ['Bugs to look at', /\b(bugs?|crash\w*|broken|glitch\w*|errors?|freez\w*|stuck|lag\w*|fix(es|ed)?|wrong|fails?|issue)\b/i],
  ['Art & sound', /\b(art|sprites?|colou?rs?|music|sounds?|sfx|fonts?|logo|animations?|pixel|palette|style|icons?|draw\w*|mockups?|theme)\b/i],
  ['Gameplay ideas', /\b(jumps?|levels?|enem(y|ies)|boss(es)?|player|power-?ups?|coins?|scores?|game\w*|mechanics?|quests?|items?|weapons?|controls?|world|npc|puzzles?)\b/i],
  ['Tech notes', /\b(server|api|database|db|deploy\w*|build|code|performance|tests?|refactor|library|framework|auth|sync|cache)\b/i],
  ['Plans & decisions', /\b(decid\w*|plan(s|ned)?|deadline|release|launch|milestone|todo|roadmap|should we|let'?s|next week|priority)\b/i],
];
const LOOSE = 'Loose notes';
const STOP = new Set('a an the and or but so to of in on at for with from by is are was were be been it its this that these those i we you they he she me my our your their just really maybe also very can could should would will about like into than then them some more most much need needs want wants make made get got do does did have has had not no yes ok okay'.split(' '));
const TYPOS = { teh: 'the', dont: "don't", cant: "can't", wont: "won't", im: "I'm", ive: "I've", isnt: "isn't", doesnt: "doesn't", didnt: "didn't", thats: "that's", lets: "let's", wierd: 'weird', recieve: 'receive', seperate: 'separate', definately: 'definitely', alot: 'a lot', untill: 'until', becuase: 'because', becasue: 'because', thier: 'their', freind: 'friend', sould: 'should', shoudl: 'should', shoud: 'should', woudl: 'would', coudl: 'could', jsut: 'just', taht: 'that', adn: 'and', u: 'you', ur: 'your', pls: 'please', plz: 'please', tho: 'though' };
const one = (s, n = 200) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const words = s => (String(s || '').toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || []).filter(w => !STOP.has(w));

module.exports = function notes({ P, base, docs, brain, secretary, flow, hubFor, W, coord, getMembers, nameOf, broadcast, bus, slug, id, str }) {
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const human = m => !!m && m.role !== 'agent' && m.role !== 'spectator';
  const pidNow = () => P.current() || P.defaultId();
  fs.mkdirSync(base.p('.tribe', 'notes'), { recursive: true });
  const rawRel = pid => `.tribe/notes/${pid}.jsonl`, cleanRel = pid => `.tribe/notes/${pid}.clean.jsonl`, peopleRel = pid => `.tribe/notes/${pid}.people.json`;

  // ---------- people/<member>/ ----------
  // Humans in the project (spectators read, agents follow their owner): who gets a folder.
  function humansOf(pid) {
    const p = P.get(pid); if (!p) return [];
    return Object.entries(p.members || {}).filter(([, role]) => role !== 'spectator').map(([mid]) => member(mid)).filter(human);
  }
  // A stable folder name per person and project (two Sams get sam/ and sam-2/).
  function folderMap(pid) {
    const map = base.readJSON(peopleRel(pid), {}) || {};
    let changed = false;
    for (const m of humansOf(pid)) {
      if (map[m.id]) continue;
      const taken = new Set(Object.values(map)); const b = slug(m.name).slice(0, 32) || 'person'; let s = b, n = 2;
      while (taken.has(s)) s = `${b}-${n++}`;
      map[m.id] = s; changed = true;
    }
    if (changed) base.writeJSON(peopleRel(pid), map);
    return map;
  }
  const readme = m => `# ${m.name}'s space\n\n${m.name}'s space: drafts, experiments, notes. ${m.name} and their agents work here; everyone else hands off instead of editing.\n`;
  function writePeople(pid, dir) {
    const map = folderMap(pid), made = [];
    for (const m of humansOf(pid)) {
      const d = path.join(dir, 'people', map[m.id]); if (!path.resolve(d).startsWith(path.resolve(dir) + path.sep)) continue;
      fs.mkdirSync(d, { recursive: true });
      const f = path.join(d, 'README.md'); if (!fs.existsSync(f)) { fs.writeFileSync(f, readme(m)); made.push(`people/${map[m.id]}/README.md`); }
    }
    return made;
  }
  // Each person (and their agents) owns people/<them>/ in coord ownership.
  function syncLanes(pid) {
    const map = folderMap(pid);
    P.inProject(pid, () => {
      for (const m of humansOf(pid)) for (const who of [m, ...getMembers().filter(a => a.role === 'agent' && a.owner === m.id)]) {
        try { coord.addLane({ area: `people/${map[m.id]}/`, owner: who.id, note: `${m.name}'s folder · person lane` }, m); } catch {}
      }
    });
  }
  // Someone joined (index.js wraps P.addMember): their folder appears in the repo when the project folds people in.
  function memberJoined(pid, mid) {
    const p = P.get(pid), m = member(mid); if (!p || !human(m) || !p.repo || !W.isRepo(p.repo)) return;
    const cfg = state(pid); if (!cfg.folders) return;
    const made = writePeople(pid, p.repo); syncLanes(pid);
    if (made.length) commitSoon(pid, `TribeCode: a folder for ${one(m.name, 40)}`);
  }

  // ---------- per-project start settings (what the card chose) ----------
  const stateRel = pid => `.tribe/notes/${pid}.start.json`;
  const state = pid => base.readJSON(stateRel(pid), null) || { folders: true };

  // ---------- commits: notes/ and people/ (auto-commit), pushed when there is a remote ----------
  const chains = new Map(), timers = new Map();
  function autoCommitOn(pid) { try { const s = hubFor(pid).settings(); return !!(s.autopilot && s.autopilot.autoCommit); } catch { return false; } }
  function commitSoon(pid, message, delay = 1500) {
    clearTimeout(timers.get(pid));
    timers.set(pid, setTimeout(() => { timers.delete(pid); commitNow(pid, message).catch(e => console.error('notes commit:', e.message)); }, delay));
  }
  function commitNow(pid, message) {
    const p = P.get(pid); if (!p || !p.repo || !W.isRepo(p.repo) || !autoCommitOn(pid)) return Promise.resolve(null);
    const prev = chains.get(pid) || Promise.resolve();
    const next = prev.then(async () => {
      const paths = ['notes', 'people', 'VISION.md'].filter(x => fs.existsSync(path.join(p.repo, x)));
      if (!paths.length) return null;
      const g = (a, o) => W.git(a, p.repo, o);
      await g(['add', '--', ...paths]);
      if ((await g(['diff', '--cached', '--quiet', '--', ...paths])).code === 0) return null;
      const c = await g(['-c', 'user.name=TribeCode', '-c', 'user.email=notes@users.noreply.tribecode', 'commit', '-q', '-m', message || 'TribeCode: notes', '--', ...paths]);
      if (c.code) throw new Error(c.err || 'commit failed');
      // Push only what is ours to push: main, fast-forward, with a saved token when there is one.
      if (await W.remoteOf(p.repo)) {
        const owner = getMembers().find(m => m.role === 'host' && W.hasToken(m.id));
        const { args, env } = owner ? W.pushEnv(owner.id) : { args: [], env: {} };
        const br = (await g(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'main';
        if (br === 'main') await g([...args, 'push', '--quiet', 'origin', 'HEAD:main'], { env, timeout: 60_000 });
      }
      return true;
    });
    chains.set(pid, next.catch(() => {}));
    return next;
  }

  // ---------- the card ----------
  const hostOf = () => getMembers().find(m => m.role === 'host') || null;
  async function startView(pid, me) {
    const p = P.get(pid), hasRepo = !!(p && p.repo && W.isRepo(p.repo));
    const map = folderMap(pid), fl = flow.load(pid), host = hostOf();
    const gh = me.role === 'host' && !hasRepo ? await flow.githubReady(me) : { ready: false, via: null };
    let settings = null; try { settings = hasRepo ? hubFor(pid).settings().autopilot : null; } catch {}
    return {
      project: { id: pid, name: p ? p.name : pid }, hasRepo, canCreate: me.role === 'host', host: host ? { id: host.id, name: host.name } : null,
      github: { ready: gh.ready, via: gh.via, repo: flow.githubState(pid) },
      people: humansOf(pid).map(m => ({ id: m.id, name: m.name, color: m.color, folder: `people/${map[m.id]}/` })),
      roles: fl ? fl.roles.flatMap(r => r.folders.map(f => ({ path: f.path, label: f.label, role: r.name, color: flow.PALETTE[r.color] || r.color }))) : [],
      settings, notes: noteCount(pid),
    };
  }
  async function createRepo(pid, me, body) {
    if (me.role !== 'host') throw err(403, 'only the host creates the repo (git runs on the host machine)');
    const p = P.get(pid); if (!p) throw err(404, 'project not found');
    if (p.repo && W.isRepo(p.repo)) throw err(409, 'this project already has a repo');
    const want = { github: body.github !== false, autoCommit: body.autoCommit !== false, autopilot: body.autopilot !== false, folders: body.folders !== false };
    base.writeJSON(stateRel(pid), { folders: want.folders, by: me.id, at: new Date().toISOString() });
    if (want.github && !(await flow.githubReady(me)).ready) want.github = false;
    const r = await flow.createRepo(pid, me, { github: want.github, extra: dir => {
      if (want.folders) writePeople(pid, dir);
      const nd = path.join(dir, 'notes', 'catalog'); fs.mkdirSync(nd, { recursive: true });
      const f = path.join(dir, 'notes', 'README.md');
      if (!fs.existsSync(f)) fs.writeFileSync(f, `# Notes\n\nThe living notes. Quick lines typed into Docs are tidied by the local model and filed by topic into \`notes/catalog/\`.\n`);
      // Notes typed before the repo existed come along.
      for (const t of topicDocs(pid)) try { fs.writeFileSync(path.join(nd, `${t.slug}.md`), mirrorText(t)); } catch {}
    } });
    if (r.steps.repo.s !== 'ok') return r;
    try { hubFor(pid).setSettings({ autopilot: { enabled: want.autopilot, autoCommit: want.autoCommit, commitContext: want.autoCommit } }); } catch (e) { console.error('notes settings:', e.message); }
    if (want.folders) syncLanes(pid);
    broadcast({ type: 'dstart', project: pid, hasRepo: true });
    return { ...r, settings: hubFor(pid).settings().autopilot };
  }
  const nudged = new Map();
  function nudge(pid, me) {
    if (!human(me)) throw err(403, 'people nudge the host');
    const host = hostOf(); if (!host) throw err(404, 'this tribe has no host');
    const k = `${pid}|${me.id}`;
    if (Date.now() - (nudged.get(k) || 0) < 60_000) return { ok: true, again: true };
    nudged.set(k, Date.now());
    const p = P.get(pid);
    bus.notify({ type: 'nudge', to: [host.id], from: me.id, project: pid, priority: 'normal', title: `${me.name} asks for a repo for ${p ? p.name : 'this project'}`, body: 'Open Docs and press Create repo: folders for everyone, auto-commit and autopilot.', view: 'docs' });
    return { ok: true };
  }

  // The + starter's "What are you making?" lines: they start VISION.md (tribe folder, and the repo when there is
  // one) and become the flow's first note, which "Start the flow" turns into the plan.
  function seedVision(pid, lines, me) {
    if (!human(me)) throw err(403, 'people describe the project');
    const L = (Array.isArray(lines) ? lines : []).map(l => one(l, 400)).filter(Boolean).slice(0, 20);
    if (!L.length) throw err(400, 'no lines');
    const p = P.get(pid), ps = P.scopedStore(() => pid);
    const block = `## What we are making\n\n${L.map(l => `- ${l}`).join('\n')}\n`;
    const put = file => { let t = ''; try { t = fs.readFileSync(file, 'utf8'); } catch {} if (t.includes('## What we are making')) t = t.replace(/## What we are making\n[\s\S]*?(?=\n## |$)/, block); else t = `${t ? t.trimEnd() + '\n\n' : `# ${p ? p.name : 'Vision'}\n\n`}${block}`; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, t); };
    put(ps.p('VISION.md'));
    if (p && p.repo && W.isRepo(p.repo)) { put(path.join(p.repo, 'VISION.md')); commitSoon(pid, 'TribeCode: what we are making'); }
    let flowNote = false;
    if (flow.load(pid)) try { flow.addNote(pid, { name: 'What we are making.md', text: `# What we are making\n\n${L.map(l => `- ${l}`).join('\n')}\n` }, me); flowNote = true; } catch (e) { console.error('notes vision:', e.message); }
    return { ok: true, lines: L.length, flowNote };
  }

  // ---------- catalog ----------
  function entries(pid, n = 200) {
    const clean = new Map(base.readJSONL(cleanRel(pid), 2000).map(c => [c.id, c]));
    return base.readJSONL(rawRel(pid), n).map(e => ({ ...e, clean: clean.get(e.id) || null }));
  }
  const noteCount = pid => { try { return fs.readFileSync(base.p(rawRel(pid)), 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  const queues = new Map();
  function add(pid, text, me) {
    if (!human(me)) throw err(403, me && me.role === 'agent' ? 'agents read the notes; their human types them' : 'spectators can read the notes but not add');
    const t = String(text || '').replace(/\r/g, '').trim().slice(0, 2000); if (!t) throw err(400, 'empty note');
    const e = { id: 'n-' + id(8).toLowerCase().replace(/[^a-z0-9]/g, 'x'), at: new Date().toISOString(), by: me.id, text: t };
    base.appendJSONL(rawRel(pid), e);
    broadcast({ type: 'note', project: pid, entry: { ...e, clean: null } });
    const q = (queues.get(pid) || Promise.resolve()).then(() => P.inProject(pid, () => tidy(pid, e))).catch(x => console.error('notes tidy:', x.message));
    queues.set(pid, q);
    return { ...e, clean: null };
  }
  // The topic docs the catalog made (front-matter catalog: true), plus any doc whose title matches a rule topic.
  function topicDocs(pid) {
    return P.inProject(pid, () => docs.list()).filter(d => d.catalog || TOPICS.some(([t]) => t === d.title) || d.title === LOOSE).map(d => P.inProject(pid, () => docs.read(d.slug))).filter(Boolean);
  }
  const mirrorText = d => `# ${d.title}\n\n${String(d.body || '').trim()}\n`;
  function rules(text) {
    let t = one(text, 2000).replace(/\b([A-Za-z]+)\b/g, w => { const r = TYPOS[w.toLowerCase()]; return r ? (w[0] === w[0].toUpperCase() && w.length > 1 ? cap(r) : r) : w; }).replace(/\bi\b/g, 'I').replace(/\s+([,.!?])/g, '$1');
    t = cap(t); if (!/[.!?…)]$/.test(t)) t += '.';
    const hit = TOPICS.find(([, re]) => re.test(t));
    const topic = hit ? hit[0] : LOOSE;
    const tags = hit ? [...new Set((t.match(new RegExp(hit[1].source, 'gi')) || []).map(x => x.toLowerCase().replace(/[^a-z0-9-]/g, '')))].slice(0, 3) : [];
    const ws = t.replace(/[.!?…]+$/, '').split(/\s+/);
    const keep = ws.filter(w => !STOP.has(w.toLowerCase().replace(/[^a-z']/g, ''))).slice(0, 5);
    const title = cap((keep.length >= 2 ? keep : ws.slice(0, 5)).join(' ').replace(/[,;:]+$/, '').replace(/[,;:.]+(?=\s|$)/g, '')).slice(0, 60);
    return { title, text: t, topic, tags, related: [] };
  }
  async function tidy(pid, e) {
    const prior = entries(pid, 60).filter(x => x.clean && x.id !== e.id);
    const known = [...new Set([...topicDocs(pid).map(d => d.title), ...prior.map(x => x.clean.topic)])];
    let out = null, via = 'brain';
    try { out = await Promise.race([brain.tidyNote(e.text, { topics: known, recent: prior.slice(-8).map(x => x.clean.title) }), new Promise(r => setTimeout(() => r(null), 30_000).unref())]); } catch { out = null; }
    if (!out) { out = rules(e.text); via = 'rules'; }
    // Prefer an existing topic with the same name (any case) so docs don't split.
    const same = known.find(k => k.toLowerCase() === out.topic.toLowerCase()); if (same) out.topic = same;
    // Related topics: other notes sharing a tag or two meaningful words, plus what the model named.
    const mine = new Set([...out.tags, ...words(out.text)]);
    const relTopics = new Set();
    for (const x of prior) {
      if (x.clean.topic === out.topic) continue;
      const theirs = [...(x.clean.tags || []), ...words(x.clean.text)];
      const shared = theirs.filter(w => mine.has(w));
      if ((x.clean.tags || []).some(t => out.tags.includes(t)) || new Set(shared).size >= 2 || (out.related || []).includes(x.clean.title)) relTopics.add(x.clean.topic);
    }
    const related = [...relTopics].slice(0, 3);
    const doc = fileInto(pid, out, e, related);
    const c = { id: e.id, at: new Date().toISOString(), title: out.title, text: out.text, topic: out.topic, tags: out.tags, related, doc: doc ? doc.slug : null, docTitle: doc ? doc.title : out.topic, via, tidyLater: via === 'rules' };
    base.appendJSONL(cleanRel(pid), c);
    broadcast({ type: 'note-clean', project: pid, clean: c });
    try { secretary.ingest(pid, { kind: 'note', by: e.by, text: `${out.title}: ${out.text}`, ref: doc ? { type: 'doc', id: doc.slug, label: doc.title } : null }); } catch (x) { console.error('notes secretary:', x.message); }
    return c;
  }
  // Append the note to its topic doc (made on first use), then mirror the doc into the repo.
  function fileInto(pid, out, e, related) {
    const who = (member(e.by) || {}).name || nameOf(e.by);
    const day = new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const meta = [who, day, ...out.tags.map(t => `#${t}`)].join(' · ');
    const section = `### ${out.title}\n${out.text}\n\n<small>${meta}${related.length ? ` · related: ${related.map(r => `[[${r}]]`).join(', ')}` : ''}</small>\n`;
    let r = null;
    for (let i = 0; i < 3 && !(r && r.doc); i++) {
      const d = docs.find(out.topic);
      if (!d) r = docs.upsert({ name: out.topic, body: `> Notes filed from the catalog: typed quickly, tidied by the local brain. Newest at the bottom.\n\n${section}`, by: e.by });
      else r = docs.upsert({ name: d.slug, body: `${String(d.body || '').trimEnd()}\n\n${section}`, baseVersion: d.version, by: e.by });
    }
    let doc = r && r.doc;
    if (!doc) return null;
    if (!doc.catalog) { const full = docs.read(doc.slug); if (full) doc = docs.save({ ...full, catalog: true }) || doc; }
    const p = P.get(pid);
    if (p && p.repo && W.isRepo(p.repo)) {
      try { const nd = path.join(p.repo, 'notes', 'catalog'); fs.mkdirSync(nd, { recursive: true }); fs.writeFileSync(path.join(nd, `${doc.slug}.md`), mirrorText(docs.read(doc.slug) || doc)); commitSoon(pid, `TribeCode: note "${one(out.title, 50)}" in ${one(doc.title, 40)}`); } catch (x) { console.error('notes mirror:', x.message); }
    }
    return doc;
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, a, b, me, readBody, send, fail }) {
    const pid = pidNow();
    try {
      if (a === 'dstart') {
        if (m === 'GET' && !b) { if (P.get(pid) && P.get(pid).repo && state(pid).folders) syncLanes(pid); return send(res, 200, await startView(pid, me)); }
        if (m === 'POST' && b === 'create') return send(res, 200, await createRepo(pid, me, await readBody(req)));
        if (m === 'POST' && b === 'nudge') return send(res, 200, nudge(pid, me));
        if (m === 'POST' && b === 'vision') { const x = await readBody(req, 64 * 1024); return send(res, 200, seedVision(pid, x.lines, me)); }
        if (m === 'POST' && b === 'github') {
          if (me.role !== 'host') return fail(res, 403, 'only the host connects the repo to GitHub');
          const x = await readBody(req); const t = str(x.token, 400);
          if (t) { if (!/^[\w-]{20,400}$/.test(t)) return fail(res, 400, 'that token does not look right'); W.writeSecret(me.id, { ...W.readSecret(me.id), githubToken: t }); }
          const p = P.get(pid); if (!p || !p.repo || !W.isRepo(p.repo)) return fail(res, 409, 'create the repo first');
          return send(res, 200, { step: await flow.connectGithub(pid, me), github: flow.githubState(pid) });
        }
        return null;
      }
      if (a === 'notes') {
        if (m === 'GET' && !b) return send(res, 200, { entries: entries(pid, Math.min(Number(new URL(req.url, 'http://x').searchParams.get('limit')) || 200, 1000)) });
        if (m === 'POST' && !b) { const x = await readBody(req, 64 * 1024); return send(res, 200, { entry: add(pid, x.text, me) }); }
        return null;
      }
    } catch (e) { return fail(res, e.status || 500, e.status ? e.message : 'server error'); }
    return null;
  }

  return { route, add, entries, memberJoined, startView, createRepo, nudge, rules, idle: pid => queues.get(pid) || Promise.resolve(), commitNow };
};
module.exports.TOPICS = TOPICS.map(([t]) => t);
