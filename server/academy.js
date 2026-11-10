// v0.27 company: the Role Academy and Offload (templates/academy.json, templates/freemodels.json).
// Short, plain-language lessons for every Company seat (CEO, CTO, Design, Growth, Sales, Support, Ops, Finance, Legal)
// plus "Founder basics", each with a "Try it in your tribe" action, a glossary and vetted free reading. Progress is
// per person (tribe-wide, since learning follows you between projects). Offload recommends verified free AI tools for
// work that doesn't need the tribe's own agents, gives a ready prompt with the project's name and gist (never secrets),
// and brings the result back into Files or Captures, tagged source "offload:<provider>". Educational, not advice.
//   GET  /api/academy                       { tracks (summaries), seat, mine, progress, badges }
//   GET  /api/academy/:track                { track (lessons, glossary, links), progress }
//   POST /api/academy/progress  { track, lesson, done? }      people only
//   GET  /api/academy/offload               { providers, tasks, safety, context: { project, gist } }
//   POST /api/academy/offload/bring { target: 'files'|'captures', provider, task, title?, text }   builders only
// MCP: academy_lesson { track, n } so agents can coach the seat they hold.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TPL = require('./tpldir')();   // v0.27: also works in the desktop app
const KINDS = ['ceo', 'cto', 'design', 'growth', 'sales', 'support', 'ops', 'finance', 'legal'];
const loadJson = f => { try { return JSON.parse(fs.readFileSync(path.join(TPL, f), 'utf8')); } catch (e) { console.error('academy: ' + f + ' ' + e.message); return null; } };
// Anything that looks like a key, token or password is dropped before text leaves the tribe (the offload prompt).
const SECRETISH = /(sk-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|xox[abpr]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.|-----BEGIN|[A-Za-z0-9+/_-]{32,}|\b(password|passwd|secret|token|api[ _-]?key|private key)\b\s*[:=])/i;
function gistOf(md, max = 260) {
  const lines = String(md || '').split('\n').map(l => l.trim()).filter(l => l && !/^#|^```|^>|^\||^---/.test(l) && !SECRETISH.test(l));
  let out = ''; for (const l of lines) { const t = l.replace(/^[-*]\s+/, '').replace(/[*_`]/g, ''); if (!t) continue; out = out ? `${out} ${t}` : t; if (out.length >= max) break; }
  out = out.replace(/\s+/g, ' ').trim();
  return out.length > max ? out.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : out;
}

module.exports = function academy({ P, base, store, docs, captures, nameOf, broadcast }) {
  const A = loadJson('academy.json') || { tracks: [] };
  const F = loadJson('freemodels.json') || { providers: [], tasks: [], safety: [] };
  const byId = id => A.tracks.find(t => t.id === id);
  const PFILE = '.tribe/academy/progress.json';
  const all = () => base.readJSON(PFILE, {}) || {};
  const mine = me => (all()[me.id] || {});
  const err = (status, m) => Object.assign(new Error(m), { status });

  // tiny local helper until Agent A's company.get() lands: which seat this member (or agent) holds in the project
  function seatOf(pid, mid) {
    let c = null; try { c = JSON.parse(fs.readFileSync(base.p('projects', String(pid).replace(/[^a-z0-9-]/gi, ''), 'company.json'), 'utf8')); } catch { return null; }
    if (!c || c.on === false || !Array.isArray(c.seats)) return null;
    const s = c.seats.find(x => x && x.holder && (x.holder.person === mid || x.holder.agent === mid));
    return s ? { id: s.id, kind: KINDS.includes(s.kind) ? s.kind : null, title: String(s.title || s.kind || '').slice(0, 40), company: String(c.name || '').slice(0, 80) } : null;
  }
  function badges(prog) {
    const out = [];
    for (const t of A.tracks) {
      const n = ((prog[t.id] || {}).done || []).length, of = t.lessons.length; if (!n) continue;
      out.push(n >= of ? { id: `${t.id}-grad`, track: t.id, emoji: t.emoji, title: `${t.title} graduate` } : n * 2 >= of ? { id: `${t.id}-half`, track: t.id, emoji: '🌓', title: `Halfway through ${t.title}` } : { id: `${t.id}-start`, track: t.id, emoji: '🌱', title: `Started ${t.title}` });
    }
    const grads = out.filter(b => /-grad$/.test(b.id)).length;
    if (grads >= 3) out.unshift({ id: 'all-rounder', emoji: '🏅', title: 'All-rounder: three tracks finished' });
    return out;
  }
  const summary = (t, prog) => ({ id: t.id, kind: t.kind, title: t.title, emoji: t.emoji, color: t.color, blurb: t.blurb, lessons: t.lessons.length, minutes: t.lessons.reduce((n, l) => n + (l.minutes || 4), 0), done: ((prog[t.id] || {}).done || []).length, last: (prog[t.id] || {}).last || 0 });
  function overview(me, pid) {
    const prog = mine(me), seat = seatOf(pid, me.id);
    return { tracks: A.tracks.map(t => summary(t, prog)), seat, mine: seat && seat.kind && byId(seat.kind) ? seat.kind : 'founder', progress: prog, badges: badges(prog), note: A.note };
  }
  function mark(me, trackId, lessonId, done = true) {
    const t = byId(String(trackId || '')); if (!t) throw err(404, 'no such track');
    const i = t.lessons.findIndex(l => l.id === lessonId); if (i < 0) throw err(404, 'no such lesson');
    const st = all(), p = st[me.id] || (st[me.id] = {}), tp = p[t.id] || (p[t.id] = { done: [] });
    const set = new Set(tp.done || []); done ? set.add(lessonId) : set.delete(lessonId);
    tp.done = t.lessons.map(l => l.id).filter(id => set.has(id)); tp.last = i + 1; tp.at = new Date().toISOString();
    fs.mkdirSync(path.dirname(base.p(PFILE)), { recursive: true }); base.writeJSON(PFILE, st);
    return { progress: p, badges: badges(p), track: summary(t, p) };
  }
  function context(pid) {
    const p = P.get(pid) || {}; let vision = '';
    try { vision = fs.readFileSync(store.p('VISION.md'), 'utf8'); } catch {}
    const g = gistOf(vision) || gistOf(p.bio || '');
    return { project: String(p.name || 'our project').slice(0, 80), gist: g };
  }
  async function bring(me, pid, body) {
    if (!me || ['spectator', 'guest', 'agent'].includes(me.role)) throw err(403, 'only builders can bring results in');
    const prov = F.providers.find(x => x.id === body.provider), task = F.tasks.find(x => x.id === body.task);
    const text = String(body.text || '').replace(/\r\n/g, '\n').trim().slice(0, 200000);
    if (!text) throw err(400, 'paste the result first');
    if (SECRETISH.test(text) && /-----BEGIN|sk-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}/.test(text)) throw err(400, 'that looks like it contains a key or token: take it out first');
    const src = `offload:${prov ? prov.id : 'other'}`;
    const title = String(body.title || '').trim().slice(0, 120) || `${task ? task.title : 'Offload'} · ${prov ? prov.name.replace(/\s*\(.*\)$/, '') : 'a free tool'}`;
    const head = `> Brought in from **${prov ? prov.name : 'a free AI tool'}** (${task ? task.title.toLowerCase() : 'offload'}) by ${nameOf(me.id)} on ${new Date().toISOString().slice(0, 10)}. AI output: check facts and links before relying on it.\n\n`;
    if (body.target === 'captures') {
      if (!captures || !captures.captureVoice) throw err(503, 'Captures are off on this tribe');
      const r = await captures.captureVoice(me, { transcript: text, title, recipe: 'idea', source: src });
      return { capture: { id: r.capture.id, title: r.capture.title }, source: src };
    }
    const d = docs.create({ title, body: head + text, by: me.id });
    const saved = docs.save({ ...d, source: src });   // keep where it came from in the doc's front matter
    broadcast && broadcast({ type: 'offload', project: pid });
    return { doc: { slug: saved.slug, title: saved.title, source: src }, source: src };
  }

  async function route(req, res, { m, b, c, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    try {
      const pid = P.current() || P.defaultId();
      if (!b && m === 'GET') return send(res, 200, overview(me, pid));
      if (b === 'offload' && !c && m === 'GET') return send(res, 200, { ...F, context: context(pid) });
      if (b === 'offload' && c === 'bring' && m === 'POST') return send(res, 200, await bring(me, pid, await readBody(req, 512 * 1024)));
      if (b === 'progress' && m === 'POST') {
        if (me.role === 'agent') return fail(res, 403, 'progress is for people');
        const body = await readBody(req); return send(res, 200, mark(me, body.track, String(body.lesson || ''), body.done !== false));
      }
      if (b && m === 'GET') { const t = byId(b); if (!t) return fail(res, 404, 'no such track'); return send(res, 200, { track: t, progress: mine(me)[t.id] || { done: [] }, seat: seatOf(pid, me.id) }); }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }

  const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
  const text = t => ({ content: [{ type: 'text', text: t }] });
  const mcpTools = {
    academy_lesson: {
      description: 'Read a Role Academy lesson so you can coach the seat you hold (ceo, cto, design, growth, sales, support, ops, finance, legal, or founder for Founder basics). Without n you get the track\'s lesson list, glossary and reading links. Lessons are educational, not legal or financial advice.',
      inputSchema: S({ track: { type: 'string', description: 'Track id: founder, ceo, cto, design, growth, sales, support, ops, finance or legal. Empty: your seat\'s track.' }, n: { type: 'number', description: 'Lesson number, starting at 1' } }),
      run: ({ track, n }, me) => {
        let id = String(track || '').toLowerCase().trim();
        if (!id) { const s = seatOf(P.current() || P.defaultId(), me.id); id = s && s.kind ? s.kind : 'founder'; }
        const t = byId(id); if (!t) return { content: [{ type: 'text', text: `No track "${id}". Tracks: ${A.tracks.map(x => x.id).join(', ')}.` }], isError: true };
        if (!n) return text(`# ${t.title} (${t.lessons.length} lessons)\n${t.blurb}\n\n${t.lessons.map((l, i) => `${i + 1}. ${l.title}`).join('\n')}\n\nGlossary: ${t.glossary.map(g => `${g.term}: ${g.def}`).join(' · ')}\n\nFurther reading: ${t.links.map(l => `${l.title} (${l.by}) ${l.url}`).join(' · ')}\n\nCall academy_lesson with n to read one.`);
        const l = t.lessons[Math.max(1, Math.min(t.lessons.length, Math.round(n))) - 1];
        return text(`# ${t.title} · Lesson ${t.lessons.indexOf(l) + 1}: ${l.title}\n\n${l.body.join('\n\n')}\n\nTry it in your tribe: ${l.try.label} (${l.try.hint})\n\n(Educational, not legal, financial or tax advice.)`);
      },
    },
  };
  return { route, mcpTools, seatOf, gistOf, overview, mark, tracks: () => A.tracks, free: () => F };
};
module.exports.gistOf = gistOf;
module.exports.SECRETISH = SECRETISH;
