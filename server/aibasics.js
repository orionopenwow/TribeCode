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
const localdoc = require('../app/ui/localdoc.js');   // feat/flint-runthrough: summarize, key points, titles, tags, reading time, glossary

const KINDS = core.PROMPTS;   // polish: the prompts live in aibasics-core.js, shared with the in-browser model (app/ui/aibasics.js)

module.exports = function aibasics({ llm, base, P, str }) {
  const SYSTEM = core.SYSTEM;
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  const tagFile = pid => base.p('.tribe', 'aitags', `${String(pid || 'local').replace(/[^a-z0-9-]/gi, '')}.json`);
  const loadTags = pid => { try { return JSON.parse(fs.readFileSync(tagFile(pid), 'utf8')); } catch { return {}; } };

  async function refine({ kind, input, draft, me }) {
    const k = KINDS[kind]; if (!k) return { error: 'unknown kind', status: 400 };
    const st = llm.status ? llm.status() : {};
    if (!st.online) return { error: 'no AI is on: the basic answer stands', status: 503, basic: true };
    const prompt = core.promptFor(kind, input, draft);
    let out; try { out = await llm.stream({ system: SYSTEM, prompt, maxTokens: k[1], temperature: 0.3, timeoutMs: 60_000, me }); }
    catch (e) { return { error: 'the AI did not answer: the basic answer stands', status: 503, basic: true }; }
    const text = String(out.text || '').trim(); if (!text) return { error: 'the AI had nothing to add', status: 502, basic: true };
    return { text, parsed: /^doc.(summary|points|title|tags|read|glossary)$/.test(kind) ? localdoc.parse(kind, text) : core.parse(kind, text), via: out.via || st.via || st.model || 'AI' };
  }

  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (b === 'basic' && m === 'GET') { const st = llm.status ? llm.status() : {}; return send(res, 200, { online: !!st.online, via: st.via || st.model || '', cloud: !!st.cloud, provider: st.provider || '' }); }   // cloud + provider: the device asks before data first goes to a cloud AI (app/ui/aiconsent.js)
    if (b === 'refine' && m === 'POST') {
      if (me.role === 'agent') return fail(res, 403, 'agents have their own model');
      const body = await readBody(req, 256 * 1024);
      const r = await refine({ kind: String(body.kind || ''), input: body.input, draft: body.draft, me });
      return r.error ? send(res, r.status || 400, { error: r.error, basic: !!r.basic }) : send(res, 200, r);
    }
    if (b === 'extract' && m === 'GET') {   // feat/flint-runthrough: a repo file's text (txt, md, html, pdf, json) for the local summarizer
      const p = P && P.get && P.get(String((url && url.searchParams.get('project')) || (P.current && P.current()) || (P.defaultId && P.defaultId()) || ''));
      if (!p || !p.repo || (P.canSee && !P.canSee(me, p.id))) return fail(res, 404, 'this project has no files yet');
      const rel = String((url && url.searchParams.get('path')) || '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!rel || rel.split('/').some(x => x === '..' || x.startsWith('.')) || /(^|\/)(node_modules)(\/|$)|\.(pem|key|p12|pfx|env)$|(^|\/)(id_rsa|credentials|secrets?)(\.|$)/i.test(rel)) return fail(res, 400, 'not that file');
      if (!/\.(md|markdown|txt|text|pdf|html?|json|csv|tsv|rst|org)$/i.test(rel)) return fail(res, 415, 'I read text, Markdown, HTML, JSON, CSV and PDF files');
      let root, full; try { root = fs.realpathSync(p.repo); full = fs.realpathSync(path.join(root, ...rel.split('/'))); } catch { return fail(res, 404, 'no such file'); }
      if (!full.startsWith(root + path.sep)) return fail(res, 404, 'no such file');
      const st = fs.statSync(full); if (!st.isFile() || st.size > 12 * 1024 * 1024) return fail(res, 413, 'that file is too big to read here');
      const text = await localdoc.extract(rel, new Uint8Array(fs.readFileSync(full)), d => require('node:zlib').inflateSync(Buffer.from(d)));
      return send(res, 200, { path: rel, text: String(text).slice(0, 400_000), words: localdoc.wordCount(text) });
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
