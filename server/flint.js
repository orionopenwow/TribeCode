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

  // ---------- Flint writes docs, sheets and slides (feat/crafts) ----------
  const FORMAT = {
    doc: 'Write a clear Markdown document. Start with "# " and a short title. Use ## headings, short paragraphs, bullet lists and tables where they help. Return only the Markdown.',
    sheet: 'Return ONLY one Markdown table and nothing else: no prose, no code fences. Row 1 holds the column names. Fill in realistic example rows. Where totals or math help, use spreadsheet formulas that start with = and use A1 cell references (row 1 is the header row), such as =SUM(B2:B6), =AVERAGE(C2:C6), =B2*C2, =IF(D2>100,"over","ok"). Supported functions: SUM AVERAGE MIN MAX COUNT COUNTA MEDIAN PRODUCT IF AND OR NOT ROUND ABS SQRT LEN UPPER LOWER CONCAT TODAY SUMIF COUNTIF.',
    deck: 'Return ONLY Markdown slides, separated by a line with just ---. No code fences. Slide 1: "# " and the title, then one short subtitle line. Every other slide: "## " and a short heading, then 3 to 5 short bullet points (under 12 words each). Optionally end a slide with a line "Notes: " and one or two sentences for the speaker. Make 5 to 8 slides unless asked otherwise.',
  };
  const NAME = { doc: 'document', sheet: 'spreadsheet', deck: 'slide deck' };
  const unfence = t => String(t || '').trim().replace(/^```[a-z]*\s*\n/i, '').replace(/\n```\s*$/, '').trim();
  const titleFrom = ask => { const t = String(ask || '').replace(/^(please\s+)?(make|write|create|draft|build|give me|start)\s+(me\s+)?(a|an|the|some)?\s*(new\s+)?(doc(ument)?|sheet|spreadsheet|table|slides?|deck|presentation|pitch deck)?\s*(about|for|on|of|with|called)?\s*/i, '').replace(/[.?!]+$/, '').trim(); return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 80) || 'Untitled'; };
  // with no brain at all, a useful starting template so the button still does something
  function template(kind, ask) {
    const title = titleFrom(ask), t = String(ask || '').toLowerCase();
    if (kind === 'sheet') {
      if (/budget|cost|expense|spend|money|price/.test(t)) return `| Item | Category | Cost | Paid |\n| --- | --- | --- | --- |\n| Example item | General | 25 | yes |\n| Another item | General | 40 | no |\n| | | | |\n| Total | | =SUM(C2:C4) | |\n`;
      if (/rota|chore|schedule|shift|week/.test(t)) return `| Task | Mon | Tue | Wed | Thu | Fri |\n| --- | --- | --- | --- | --- | --- |\n| Example task | | | | | |\n| Another task | | | | | |\n`;
      if (/score|leader|game|points/.test(t)) return `| Player | Round 1 | Round 2 | Round 3 | Total |\n| --- | --- | --- | --- | --- |\n| Player 1 | 0 | 0 | 0 | =SUM(B2:D2) |\n| Player 2 | 0 | 0 | 0 | =SUM(B3:D3) |\n`;
      return `| Name | Owner | Status | Due |\n| --- | --- | --- | --- |\n| ${title} | | Not started | |\n| | | | |\n`;
    }
    if (kind === 'deck') return `<!-- theme: campfire -->\n\n# ${title}\n\nWhat we're making and why\n\n---\n\n## The idea\n\n- What it is, in one line\n- Who it's for\n\n---\n\n## How it works\n\n- Step one\n- Step two\n- Step three\n\n---\n\n## Who's doing what\n\n- Person: part\n- Agent: part\n\n---\n\n## Next steps\n\n- The first thing to ship\n- When we'll show it\n`;
    return `# ${title}\n\n## Goal\n\nWhat this is for, in a sentence or two.\n\n## Notes\n\n- \n\n## Next steps\n\n- [ ] \n`;
  }
  async function make({ kind, ask, body, title, me }) {
    if (!FORMAT[kind]) return { error: 'kind must be doc, sheet or deck', status: 400 };
    if (!ask) return { error: 'tell Flint what to write', status: 400 };
    const system = `You are Flint, the built-in helper of TribeCode, writing a ${NAME[kind]} for a group of friends. ${FORMAT[kind]}`;
    const prompt = body
      ? `Here is the current ${NAME[kind]}${title ? ` called "${title}"` : ''}:\n\n${body}\n\nChange it as asked, keep everything else, and return the whole updated ${NAME[kind]} in the same format.\nAsked: ${ask}`
      : `Write a ${NAME[kind]} for this request: ${ask}`;
    let out;
    try { out = await llm.stream({ system, prompt, maxTokens: kind === 'doc' ? 2200 : 1800, temperature: 0.4, timeoutMs: 120_000, me }); }
    catch (e) {
      if (body) return { error: 'Flint needs a brain to change this. The host can pick one in Settings › Flint\'s brain.', status: 503 };
      return { kind, title: titleFrom(ask), body: template(kind, ask), basic: true, note: 'Flint is in basic mode, so he started you from a template. Give him a brain and he writes the whole thing.' };
    }
    let text = unfence(out.text);
    if (kind === 'sheet' && !/\|\s*-{2,}/.test(text)) { const m = /(\|[^\n]*\|\s*\n\|\s*:?-{2,}[\s\S]*)/.exec(text); text = m ? m[1].trim() : ''; }
    if (kind === 'deck' && !/^\s*<!--\s*theme:/i.test(text)) text = `<!-- theme: campfire -->\n\n${text}`;
    if (!text) return body ? { error: 'Flint\'s answer was not a table. Try asking again in other words.', status: 502 } : { kind, title: titleFrom(ask), body: template(kind, ask), basic: true, note: 'Flint\'s answer was not usable, so he started you from a template.' };
    const h = /^#\s+(.+)$/m.exec(text);
    return { kind, title: title || (kind !== 'sheet' && h ? h[1].trim().slice(0, 80) : titleFrom(ask)), body: text + '\n', via: out.via };
  }

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
    if (m === 'POST' && b === 'make') {   // feat/crafts: Flint writes a doc, a sheet or slides (new, or a change to `body`)
      if (me.role === 'agent') return fail(res, 403, 'agents write files with write_doc');
      const body = await readBody(req, 1024 * 1024);
      const r = await make({ kind: body.kind, ask: str(body.ask, 2000), body: typeof body.body === 'string' ? body.body.slice(0, 120_000) : '', title: str(body.title, 120), me });
      return r.error ? fail(res, r.status || 400, r.error) : send(res, 200, r);
    }
    return fail(res, 404, 'no such Flint route');
  }
  return { route, SYSTEM, make };
};
