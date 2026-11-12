// Rituals (feat/work-company): recurring company check-ins built on the calendar (server/plan.js) and the doc templates
// (app/ui/doctpl.js). "Run standup every weekday at 9" makes ONE calendar event with repeat: 'weekdays' and
// ritual: 'standup'. When it starts, plan.js calls back here: the ritual posts a short prompt in the project chat,
// collects each member's answers (from the card in the app, or typed as "/standup did … | next … | stuck …"), posts
// them in chat under the member's name and keeps one doc in Files up to date ("Standup · 2026-11-11"). No AI needed.
//   GET  /api/rituals                         { events: [ritual events], runs: [recent runs], kinds }
//   POST /api/rituals { kind, start, repeat?, title?, attendees? }  -> { event }   (start: ISO of the first occurrence)
//   POST /api/rituals/run { kind }            start a run now (also what the calendar does)  -> { run }
//   POST /api/rituals/runs/:id/answer { answers: { <key>: text } }  -> { run, doc }
// Broadcast: { type: 'ritual', run }.
'use strict';

const KINDS = {
  standup: { title: 'Standup', emoji: '🌅', qs: [['done', 'What did you get done?'], ['next', 'What\'s next?'], ['blocked', 'Anything stuck?']] },
  'weekly-review': { title: 'Weekly review', emoji: '🗓️', qs: [['wins', 'Best thing that happened this week?'], ['missed', 'What slipped?'], ['next', 'One focus for next week?']] },
  retro: { title: 'Retro', emoji: '🔁', qs: [['good', 'What went well?'], ['bad', 'What didn\'t?'], ['try', 'What should we try next time?']] },
};
const REPEATS = ['weekdays', 'daily', 'weekly'];

module.exports = function rituals({ store, docs, plan, postChat, broadcast, getMembers, nameOf, str }) {
  const FILE = '.tribe/rituals.json';
  const load = () => { const d = store.readJSON(FILE, {}); return { runs: Array.isArray(d.runs) ? d.runs : [] }; };
  const saveAll = d => store.writeJSON(FILE, { runs: d.runs.slice(-60) });
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const iso = () => new Date().toISOString();
  const humans = () => getMembers().filter(m => m.role !== 'agent' && m.role !== 'spectator');
  const localDay = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function docBody(run) {
    const k = KINDS[run.kind], out = [`# ${k.title} · ${run.day}`, '', `_Collected in chat by TribeCode. ${Object.keys(run.answers).length} of ${run.expected || '?'} answered._`, ''];
    for (const [mid, a] of Object.entries(run.answers)) {
      out.push(`## ${nameOf(mid)}`, '');
      for (const [key, q] of k.qs) out.push(`- **${q}** ${a[key] ? a[key] : '_skipped_'}`);
      out.push('');
    }
    const stuck = Object.entries(run.answers).filter(([, a]) => a.blocked && !/^(no|nope|none|nothing|-|n\/a)\.?$/i.test(a.blocked.trim()));
    if (run.kind === 'standup') out.push('## Needs help', '', stuck.length ? stuck.map(([mid, a]) => `- ${nameOf(mid)}: ${a.blocked}`).join('\n') : '- Nothing is stuck.', '');
    return out.join('\n');
  }
  function writeDoc(run, by) {
    const body = docBody(run), now = iso();
    const d = run.doc && docs.read(run.doc);
    if (d) return docs.save({ ...d, body, version: Number(d.version || 1) + 1, updated: now, updatedBy: by || 'tribecode' });
    const made = docs.create({ title: `${KINDS[run.kind].title} · ${run.day}`, body, by: by || 'tribecode' });
    run.doc = made.slug;
    return docs.save({ ...made, source: `ritual:${run.kind}` });
  }

  function start(kind, when = Date.now(), evId = null) {
    if (!KINDS[kind]) throw err(400, 'unknown ritual');
    const d = load(), day = localDay(when);
    let run = d.runs.find(r => r.kind === kind && r.day === day);
    if (!run) {
      run = { id: 'rr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, day, at: iso(), event: evId, answers: {}, expected: humans().length, doc: null };
      d.runs.push(run); writeDoc(run); saveAll(d);
      const k = KINDS[kind];
      postChat('general', 'tribecode', `${k.emoji} **${k.title}** time. Three quick lines each: ${k.qs.map(q => q[1].toLowerCase().replace(/\?$/, '')).join(' · ')}. Answer from the card, or type \`/${kind === 'standup' ? 'standup' : kind} ${k.qs.map(q => q[0] + ' …').join(' | ')}\`.`, { ritual: run.id });
    }
    broadcast({ type: 'ritual', run: view(run) });
    return run;
  }
  const view = r => ({ ...r, title: KINDS[r.kind].title, questions: KINDS[r.kind].qs.map(([key, q]) => ({ key, q })), answered: Object.keys(r.answers) });

  function answer(runId, body, me) {
    if (!me || me.role === 'spectator') throw err(403, 'spectators can\'t answer');
    const d = load(), run = d.runs.find(r => r.id === runId); if (!run) throw err(404, 'no such ritual');
    const k = KINDS[run.kind], a = {}, src = (body && body.answers) || {};
    for (const [key] of k.qs) { const v = str(src[key] || '', 600); if (v) a[key] = v; }
    if (!Object.keys(a).length) throw err(400, 'answer at least one question');
    run.answers[me.id] = { ...a, at: iso() };
    const saved = writeDoc(run, me.id); saveAll(d);
    postChat('general', me.id, `**${k.title}** · ${k.qs.filter(([key]) => a[key]).map(([key, q]) => `${q.replace(/\?$/, '')}: ${a[key]}`).join(' · ')}`);
    broadcast({ type: 'ritual', run: view(run) });
    return { run: view(run), doc: saved ? { slug: saved.slug, title: saved.title } : null };
  }

  // "/standup did the menu | next the shop | stuck nothing"  (also "/retro", "/weekly-review"); labels are optional.
  function onCommand(channel, member, text) {
    const m = /^\/(standup|retro|weekly-review)\b\s*([\s\S]*)$/i.exec(String(text || '').trim()); if (!m || !member) return false;
    const kind = m[1].toLowerCase(), k = KINDS[kind], parts = m[2].split('|').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return false;
    const answers = {};
    parts.forEach((p, i) => {
      const lab = /^(did|done|next|stuck|blocked|wins?|missed|good|bad|try)\b[:\s]*/i.exec(p);
      const map = { did: 'done', done: 'done', next: 'next', stuck: 'blocked', blocked: 'blocked', win: 'wins', wins: 'wins', missed: 'missed', good: 'good', bad: 'bad', try: 'try' };
      const key = lab && k.qs.some(q => q[0] === map[lab[1].toLowerCase()]) ? map[lab[1].toLowerCase()] : (k.qs[i] || [])[0];
      if (key) answers[key] = lab && key === map[lab[1].toLowerCase()] ? p.slice(lab[0].length) : p;
    });
    const run = start(kind);
    try { answer(run.id, { answers }, member); } catch (e) { postChat(channel, 'tribecode', e.message); }
    return true;
  }

  plan.onRitual((ev, t) => { if (KINDS[ev.ritual]) start(ev.ritual, t, ev.id); });

  async function route(req, res, { m, b, c, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    try {
      if (!b && m === 'GET') return send(res, 200, { events: plan.all().filter(e => e.ritual), runs: load().runs.slice(-14).reverse().map(view), kinds: Object.entries(KINDS).map(([id, k]) => ({ id, title: k.title, questions: k.qs.map(([key, q]) => ({ key, q })) })) });
      if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
      if (!b && m === 'POST') {
        const body = await readBody(req) || {}, kind = String(body.kind || '');
        if (!KINDS[kind]) return fail(res, 400, 'unknown ritual');
        const repeat = REPEATS.includes(body.repeat) ? body.repeat : 'weekdays';
        const r = plan.create({ title: str(body.title || '', 120) || KINDS[kind].title, start: body.start, duration: 15, repeat, ritual: kind, remind: 0, attendees: Array.isArray(body.attendees) ? body.attendees : humans().map(x => x.id) }, me.id);
        return r.error ? fail(res, 400, r.error) : send(res, 200, r);
      }
      if (b === 'run' && m === 'POST') { const body = await readBody(req) || {}; return send(res, 200, { run: view(start(String(body.kind || 'standup'))) }); }
      if (b === 'runs' && c && parts[3] === 'answer' && m === 'POST') return send(res, 200, answer(c, await readBody(req) || {}, me));
      return fail(res, 404, 'no such rituals route');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, start, answer, onCommand, KINDS };
};
