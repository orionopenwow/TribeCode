// Flint's local model on the host (feat/flint-local, tier 2): a thin, loopback-only bridge to an OpenAI-compatible
// server running ON THIS MACHINE (Ollama, LM Studio, llama.cpp, Jan…). The browser asks the host; the host asks
// 127.0.0.1. It never contacts any other address: a URL that is not loopback is refused, so nothing typed here can
// leave the host through this module. The model only returns text; app/ui/flintllm.js validates and applies it.
//   GET  /api/flint/llm          -> { servers: [{ url, kind, models: [name] }], share, can }
//   PUT  /api/flint/llm          { share: bool }          host only: let members use this computer's local model
//   POST /api/flint/llm/chat     { url, model, messages, json?, max? }  -> text/plain stream of the reply
// Who may use it: the host and admins; members only when the host turned sharing on (.tribe/flint-llm.json).
'use strict';
const KNOWN = [['http://127.0.0.1:11434', 'Ollama'], ['http://127.0.0.1:1234', 'LM Studio'], ['http://127.0.0.1:8080', 'llama.cpp'], ['http://127.0.0.1:1337', 'Jan']];
const FILE = '.tribe/flint-llm.json';
function loopback(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(x.hostname) && !x.username && !x.password ? x.origin : null; } catch { return null; } }

module.exports = function flintLLM({ base, perms }) {
  const cfg = () => base.readJSON(FILE, {}) || {};
  const extra = () => String(process.env.TRIBE_FLINT_LLM_URLS || '').split(',').map(s => s.trim()).filter(Boolean).map(loopback).filter(Boolean).map(u => [u, 'Local server']);
  const may = me => !!me && me.role !== 'agent' && me.role !== 'spectator' && (me.role === 'host' || (perms && perms.atLeast && perms.atLeast(me, 'admin')) || !!cfg().share);
  async function get(url, ms = 1200) { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms); try { const r = await fetch(url, { signal: ctl.signal, redirect: 'error' }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); } }
  async function detect() {
    const out = [], seen = new Set();
    await Promise.all([...extra(), ...KNOWN].map(async ([origin, kind]) => {
      if (seen.has(origin)) return; seen.add(origin);
      const j = await get(origin + '/v1/models'); const models = j && Array.isArray(j.data) ? j.data.map(x => String(x && x.id || '').slice(0, 120)).filter(Boolean).slice(0, 60) : null;
      if (models) out.push({ url: origin, kind, models });
    }));
    return out.sort((a, b) => a.url.localeCompare(b.url));
  }
  async function route(req, res, { m, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m === 'GET' && !c) return send(res, 200, { servers: may(me) ? await detect() : [], share: !!cfg().share, can: may(me) });
    if (m === 'PUT' && !c) { if (me.role !== 'host') return fail(res, 403, 'only the host shares this computer\'s model'); const body = await readBody(req); base.writeJSON(FILE, { share: !!body.share }); return send(res, 200, { share: !!body.share }); }
    if (m === 'POST' && c === 'chat') {
      if (!may(me)) return fail(res, 403, 'the host has not shared this computer\'s local model');
      const body = await readBody(req, 96 * 1024), origin = loopback(body.url);
      if (!origin) return fail(res, 400, 'only a model server on this computer (localhost) can be used here');
      const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-12).map(x => ({ role: ['system', 'user', 'assistant'].includes(x && x.role) ? x.role : 'user', content: String(x && x.content || '').slice(0, 12000) }));
      if (!messages.length || !body.model) return fail(res, 400, 'a model and a message are needed');
      const ctl = new AbortController(); req.on('close', () => { if (!res.writableEnded) ctl.abort(); });
      let up;
      try { up = await fetch(origin + '/v1/chat/completions', { method: 'POST', signal: ctl.signal, redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: String(body.model).slice(0, 120), messages, stream: true, temperature: 0.2, max_tokens: Math.max(16, Math.min(1200, +body.max || 400)), ...(body.json ? { response_format: { type: 'json_object' } } : {}) }) }); }
      catch (e) { return fail(res, 502, 'the local model server did not answer'); }
      if (!up.ok || !up.body) return fail(res, 502, `the local model server said ${up.status}`);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      const dec = new TextDecoder(); let buf = '';
      try {
        for await (const chunk of up.body) {
          buf += dec.decode(chunk, { stream: true }); let i;
          while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') continue; try { const t = JSON.parse(d).choices[0].delta.content; if (t) res.write(t); } catch {} }
        }
      } catch {}
      return res.end();
    }
    return fail(res, 404, 'not found');
  }
  return { route, detect, loopback };
};
module.exports.loopback = loopback;
