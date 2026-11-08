// Flint: TribeCode's built-in helper (app/ui/flint.js). The intent router runs in the browser with no model at all;
// this module is only the optional local-model step for messages no intent matched.
//   GET  /api/flint        -> { model: { online, model } }   (is the local model on? for the "ready" / "basic mode" line)
//   POST /api/flint/ask    { text, history: [{ who: 'me'|'flint', text }], room }   -> the reply, streamed as plain text
//                          chunks while Ollama writes it (503 { error, basic: true } when there is no local model)
// Nothing leaves the machine: the only call is to the host's own Ollama (server/brain.js `host`).
'use strict';

const SYSTEM = 'You are Flint, the small built-in helper of TribeCode, a self-hosted app where friends and their Claude Code agents build one app together. ' +
  'You live in the room on this computer and run locally. Answer in one to three short, friendly sentences, plain text, no markdown headings. ' +
  'Use only the room facts you are given; if you do not know, say so and suggest the Guide (the ? menu). Never invent people, tasks or commits.';

module.exports = function flint({ brain, str }) {
  const clip = (s, n) => String(s || '').slice(0, n);

  async function ask(res, body, me, send, fail) {
    const text = str(body.text, 2000);
    if (!text) return fail(res, 400, 'say something to Flint');
    let st = brain.status();
    if (!st.online || Date.now() - st.checked > 60_000) st = await brain.refresh();
    if (!st.online) return send(res, 503, { error: 'no local model', basic: true });
    const hist = (Array.isArray(body.history) ? body.history : []).slice(-8)
      .map(h => `${h && h.who === 'flint' ? 'Flint' : 'Them'}: ${clip(h && h.text, 400)}`).join('\n');
    const room = clip(typeof body.room === 'string' ? body.room : '', 1500);
    const prompt = `Room facts:\n${room || '(none)'}\n\n${hist ? `Conversation so far:\n${hist}\n\n` : ''}${me.name || 'They'} asks Flint: ${text}\n\nFlint:`;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 90_000);
    res.on('close', () => ctl.abort());
    let up;
    try {
      up = await fetch(String(brain.host).replace(/\/$/, '') + '/api/generate', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: st.model, prompt, system: SYSTEM, stream: true, think: false, options: { temperature: 0.3, num_predict: 260 } }) });
      if (!up.ok || !up.body) throw new Error(`ollama ${up.status}`);
    } catch (e) { clearTimeout(timer); return send(res, 503, { error: 'the local model did not answer', basic: true }); }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Flint-Model': st.model, 'Access-Control-Allow-Origin': '*' });
    // Ollama streams NDJSON lines ({ response, done }); a model that thinks out loud wraps it in <think>…</think>: skip that part.
    let buf = '', thinking = false, pending = '';
    const emit = chunk => {
      pending += chunk;
      for (;;) {
        if (thinking) { const e = pending.indexOf('</think>'); if (e < 0) { pending = pending.slice(-8); return; } pending = pending.slice(e + 8); thinking = false; continue; }
        const s = pending.indexOf('<think>');
        if (s >= 0) { if (s) res.write(pending.slice(0, s)); pending = pending.slice(s + 7); thinking = true; continue; }
        const keep = pending.lastIndexOf('<'); const safe = keep >= 0 && pending.length - keep < 7 ? pending.slice(0, keep) : pending;
        if (safe) res.write(safe); pending = pending.slice(safe.length); return;
      }
    };
    try {
      const dec = new TextDecoder();
      for await (const part of up.body) {
        buf += dec.decode(part, { stream: true });
        let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (line) { try { const j = JSON.parse(line); if (j.response) emit(j.response); } catch {} } }
      }
      if (buf.trim()) { try { const j = JSON.parse(buf); if (j.response) emit(j.response); } catch {} }
      if (pending && !thinking) res.write(pending);
    } catch {}
    clearTimeout(timer); res.end();
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m === 'GET' && !b) { const st = await brain.refresh().catch(() => brain.status()); return send(res, 200, { model: { online: !!st.online, model: st.model || '' } }); }
    if (m === 'POST' && b === 'ask') {
      if (me.role === 'agent') return fail(res, 403, 'Flint is for people');
      return ask(res, await readBody(req), me, send, fail);
    }
    return fail(res, 404, 'no such Flint route');
  }
  return { route, SYSTEM };
};
