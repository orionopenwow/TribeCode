// Flint: TribeCode's built-in helper (app/ui/flint.js). The intent router runs in the browser with no model at all;
// this module is only the optional model step for messages no intent matched.
//   GET  /api/flint        -> { model: { online, model, via, cloud } }   (for the "ready" / "basic mode" line)
//   POST /api/flint/ask    { text, history: [{ who: 'me'|'flint', text }], room }   -> the reply, streamed as plain text
//                          chunks; the X-Flint-Via header names who answered ("Gemini 2.5 Flash", "qwen3 on the host").
//                          503 { error, basic: true } when nothing can answer; 403 when the host keeps their cloud key
//                          for themselves (or a friend reached the daily cap); 429 when asking too fast.
// Who answers is the tribe's brain (server/llm.js): the host's chosen provider (their own key, kept on the host),
// then the host's Ollama, then basic mode. A person can also pick the built-in model in their own browser
// (app/ui/brainpick.js, WebLLM); then this route is not used at all.
'use strict';

const SYSTEM = 'You are Flint, the small built-in helper of TribeCode, a self-hosted app where friends and their AI coding agents build one app together. ' +
  'You live in the room. Answer in one to three short, friendly sentences, plain text, no markdown headings. ' +
  'Use only the room facts you are given; if you do not know, say so and suggest the Guide (the ? menu). Never invent people, tasks or commits.';

module.exports = function flint({ brain, str, llm }) {
  const clip = (s, n) => String(s || '').slice(0, n);

  function prompt(body, me, text) {
    const hist = (Array.isArray(body.history) ? body.history : []).slice(-8)
      .map(h => `${h && h.who === 'flint' ? 'Flint' : 'Them'}: ${clip(h && h.text, 400)}`).join('\n');
    const room = clip(typeof body.room === 'string' ? body.room : '', 1500);
    return `Room facts:\n${room || '(none)'}\n\n${hist ? `Conversation so far:\n${hist}\n\n` : ''}${me.name || 'They'} asks Flint: ${text}\n\nFlint:`;
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m === 'GET' && !b) {
      await brain.ollamaRefresh().catch(() => {});
      const st = llm.status();
      return send(res, 200, { model: { online: !!st.online, model: st.model || '', via: st.via || st.model || '', cloud: !!st.cloud } });
    }
    if (m === 'POST' && b === 'ask') {
      if (me.role === 'agent') return fail(res, 403, 'Flint is for people');
      const body = await readBody(req), text = str(body.text, 2000);
      if (!text) return fail(res, 400, 'say something to Flint');
      return llm.streamTo(res, { system: SYSTEM, prompt: prompt(body, me, text), maxTokens: 260, temperature: 0.3, me }, { send });
    }
    return fail(res, 404, 'no such Flint route');
  }
  return { route, SYSTEM };
};
