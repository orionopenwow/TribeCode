// "Basic features, supercharged by AI" (docs/DESIGN-SYSTEM.md §11): the AI half of every ✦ (app/ui/aibasics.js).
// The browser has already computed the basic answer with no model (app/ui/aibasics-core.js); this route asks the
// tribe's brain (server/llm.js: the host's key, Ollama, or nothing) to make it better, in the same shape.
//   GET  /api/ai/basic                  { online, via }   (is there an AI to refine with?)
//   POST /api/ai/refine { kind, input, draft }  -> { text, parsed, via } | 503 { basic: true } when no AI is on
//   GET  /api/ai/tags?project=          { tags: { <file key>: { description, tags, at } } }    files: describe and tag
//   PUT  /api/ai/tags  { project, key, description, tags }
// The model only ever rewrites text the member could already see; nothing here acts on its own.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('../app/ui/aibasics-core.js');

const KINDS = {
  'chat.summary': ['Summarize this team chat in at most 5 short lines: who talked, what it was about, what was decided, what is still open. Plain text, one line each, no headings.', 400],
  'chat.tasks': ['List the concrete things to do from this team chat. One task per line, each starting with "- ", short and starting with a verb. Add "(Name)" at the end when someone took it. No other text.', 300],
  'task.split': ['Split this task into 3 to 6 small steps someone can tick off. One step per line, each starting with "- ", starting with a verb. No other text.', 260],
  'task.estimate': ['Estimate this task. Answer in exactly three lines:\nSize: S, M, L or XL\nTime: a rough time like "about an hour"\nWhy: one short reason.', 120],
  'task.owner': ['Pick who on the team should own this task, from the people listed. Answer in two lines:\nOwner: the person\'s name exactly as listed\nWhy: one short reason.', 120],
  'doc.tidy': ['Tidy this Markdown document: fix spelling, grammar, capitalization and list formatting, keep the meaning, headings and every fact. Return only the whole tidied Markdown.', 2000],
  'doc.outline': ['Write an outline of this document as a nested Markdown bullet list (at most 12 lines). Return only the list.', 400],
  'doc.continue': ['Continue this document naturally from where it stops, in the same voice and format. Write one or two short paragraphs or list items. Return only the new text.', 500],
  'file.describe': ['Describe this file for a shared project folder. Answer in two lines:\nDescription: one sentence about what it probably is and what it is for\nTags: 3 to 6 short lowercase tags, comma separated.', 140],
  'home.plan': ['Turn this into a short plan for today: at most 5 numbered lines, the most important first, each with a few words on why. Use only the items given.', 300],
  'work.suggest': ['These are suggestions for a small team, made by simple rules from their task board, company seats and open gigs. Rewrite them as at most 5 short, friendly lines, one per line starting with "- ", most useful first. Keep every number, name and seat exactly as given; never add a suggestion that is not supported by the input.', 300],
  'doc.template': ['Draft the empty sections of this company document from the project context given. For each empty section write "## <the exact heading>" and then 2-5 short lines or bullets under it. Use only facts from the input; where a fact is missing, write a short question in [brackets] instead of inventing it. Return only those sections.', 900],
  'seat.charter': ['Write a charter for this company seat. Answer in exactly five lines:\nGoal: one goal for this month\nOwns: 2-3 things, comma separated\nMay do: 2-4 things it does on its own, comma separated\nNeeds a yes: 2-3 things that need a human\'s approval, comma separated\nDone: how we will know it is done.', 260],
};

module.exports = function aibasics({ llm, base, P, str }) {
  const SYSTEM = 'You are Flint, the built-in helper of TribeCode, a self-hosted app where friends build one project together. You improve a draft that simple rules already made. Be concrete and short. Never invent people, facts or numbers that are not in the input.';
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  const tagFile = pid => base.p('.tribe', 'aitags', `${String(pid || 'local').replace(/[^a-z0-9-]/gi, '')}.json`);
  const loadTags = pid => { try { return JSON.parse(fs.readFileSync(tagFile(pid), 'utf8')); } catch { return {}; } };

  async function refine({ kind, input, draft, me }) {
    const k = KINDS[kind]; if (!k) return { error: 'unknown kind', status: 400 };
    const st = llm.status ? llm.status() : {};
    if (!st.online) return { error: 'no AI is on: the basic answer stands', status: 503, basic: true };
    const inp = typeof input === 'string' ? input : JSON.stringify(input || {});
    const prompt = `${k[0]}\n\nInput:\n${clip(inp, 12000)}\n\n${draft ? `A first draft made by simple rules (improve it, keep what is right):\n${clip(typeof draft === 'string' ? draft : JSON.stringify(draft), 4000)}\n\n` : ''}Answer:`;
    let out; try { out = await llm.stream({ system: SYSTEM, prompt, maxTokens: k[1], temperature: 0.3, timeoutMs: 60_000, me }); }
    catch (e) { return { error: 'the AI did not answer: the basic answer stands', status: 503, basic: true }; }
    const text = String(out.text || '').trim(); if (!text) return { error: 'the AI had nothing to add', status: 502, basic: true };
    return { text, parsed: core.parse(kind, text), via: out.via || st.via || st.model || 'AI' };
  }

  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (b === 'basic' && m === 'GET') { const st = llm.status ? llm.status() : {}; return send(res, 200, { online: !!st.online, via: st.via || st.model || '' }); }
    if (b === 'refine' && m === 'POST') {
      if (me.role === 'agent') return fail(res, 403, 'agents have their own model');
      const body = await readBody(req, 256 * 1024);
      const r = await refine({ kind: String(body.kind || ''), input: body.input, draft: body.draft, me });
      return r.error ? send(res, r.status || 400, { error: r.error, basic: !!r.basic }) : send(res, 200, r);
    }
    if (b === 'tags') {
      const pid = String((url && url.searchParams.get('project')) || (P && P.current && P.current()) || 'local').slice(0, 80);
      if (m === 'GET') return send(res, 200, { tags: loadTags(pid) });
      if (m === 'PUT') {
        if (['spectator', 'guest'].includes(me.role)) return fail(res, 403, 'read-only');
        const body = await readBody(req, 64 * 1024), p = String(body.project || pid).slice(0, 80), key = str(body.key, 200);
        if (!key) return fail(res, 400, 'which file?');
        const all = loadTags(p); all[key] = { description: str(body.description, 300), tags: (Array.isArray(body.tags) ? body.tags : []).map(t => str(t, 24).toLowerCase()).filter(Boolean).slice(0, 8), at: new Date().toISOString(), by: me.id };
        const keys = Object.keys(all); if (keys.length > 2000) delete all[keys[0]];
        fs.mkdirSync(path.dirname(tagFile(p)), { recursive: true }); fs.writeFileSync(tagFile(p), JSON.stringify(all));
        return send(res, 200, { ok: true, tag: all[key] });
      }
    }
    return fail(res, 404, 'no such route');
  }
  return { route, refine, KINDS };
};
