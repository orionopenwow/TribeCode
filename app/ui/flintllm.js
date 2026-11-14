// Flint's local model, tier 2 (feat/flint-local): one small interface over a language model that runs on hardware you
// control, opt-in. Three backends behind the same chat() call:
//   device   an OpenAI-compatible server on THIS computer (Ollama, LM Studio, llama.cpp, Jan), reached straight from the
//            page. Only loopback addresses are accepted. On the website the server must allow this page's origin
//            (Ollama: OLLAMA_ORIGINS); the picker says so when the server is there but refuses.
//   host     the same kind of server on the tribe's HOST computer, reached through the host (server/flintllm.js, which
//            itself only talks to loopback). This is the path in the desktop app, where the host is this computer.
//   browser  the built-in model in this browser on WebGPU (brainpick.js + brainworker.js: WebLLM, fetched from its
//            official CDN only after the person presses Download there, pinned and integrity-checked, in a worker).
//            Nothing of it is in the repo. It cannot run where there is no WebGPU; the picker says where that is.
// The model NEVER executes anything. For a request Flint's rules did not recognise it returns JSON: either
//   { "ops": [{ "say": "<one of Flint's own commands, in plain words>" }] }   or   { "text": "…" }
// validate() checks that shape strictly, re-reads every "say" with flintnlu.js (it must be exactly one known command,
// sure, with nothing missing), refuses commands a model may never start (hosting, invites, payments, publishing…) and
// turns outbound or destructive ones into a button the person presses. What passes runs through flintlocal.js, one Undo
// entry per op. Writing tasks (summaries, rewrites in a tone, drafts, explanations, names) come back as streamed text.
// Pure part (browser + Node): isLoopback, parseReply, validate, sysOps, kindOf.
//   window.TribeFlintLLM = { config(), set(), ready(), detect(), chat(), handle(text, H), cancel(), speed(), open(), label() }
(function (root, factory) { const api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFlintLLM = api; })(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  function isLoopback(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(x.hostname) && !x.username && !x.password ? x.origin : null; } catch { return null; } }
  // a model may never start these on its own…
  const NEVER = /^(?:host\.|invite$|premium\.|publish$|connect\.ai$|github\.|market\.(?:add|remove)|teach$|unteach$|meant$|flint\.clear$|helper\.toggle$|brain\.pick$|demo\.start$|capture\.toggle$|checks\.run$|canvas\.send$|gig\.)/;
  // …and these wait for the person to press the button (they reach other people, or delete)
  const CONFIRM = /^(?:dm\.send|chat\.send|task\.delete|preview\.share|call\.|huddle\.|jam\.start|event\.add|site\.page\.delete|chat\.pin|chat\.react)/;
  function parseReply(raw) {
    let t = String(raw || '').replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  }
  // -> { ok, kind: 'ops' | 'text', steps: [{ say, intent, confirm }], text, why }
  function validate(obj, N, ctx) {
    const bad = why => ({ ok: false, why });
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return bad('not an object');
    const keys = Object.keys(obj);
    if (keys.some(k => k !== 'ops' && k !== 'text')) return bad(`unknown field “${keys.find(k => k !== 'ops' && k !== 'text')}”`);
    if (obj.ops === undefined) { if (typeof obj.text !== 'string' || !obj.text.trim()) return bad('neither ops nor text'); return { ok: true, kind: 'text', text: obj.text.trim().slice(0, 4000), steps: [] }; }
    if (!Array.isArray(obj.ops) || !obj.ops.length || obj.ops.length > 5) return bad('ops must be a list of 1 to 5');
    const steps = [];
    for (const op of obj.ops) {
      if (!op || typeof op !== 'object' || Array.isArray(op)) return bad('an op is not an object');
      if (Object.keys(op).some(k => k !== 'say' && k !== 'intent')) return bad('an op has a field I do not know');
      if (typeof op.say !== 'string' || op.say.length < 2 || op.say.length > 200 || /[\n\r<>{}`]/.test(op.say)) return bad('an op has no plain “say” sentence');
      if (op.intent !== undefined && typeof op.intent !== 'string') return bad('an op’s intent is not a string');
      const P = N.parse(op.say, ctx || {}), s = P.steps[0];
      if (P.steps.length !== 1 || !s || !s.intent || s.conf < 0.6) return bad(`“${op.say}” is not one of my commands`);
      if (s.intent === 'help.kb' || s.intent === 'hello' || s.intent === 'undo' || s.intent === 'redo') return bad(`“${op.say}” is not an edit`);
      if (s.ask) return bad(`“${op.say}” is missing a detail`);
      if (op.intent && op.intent !== s.intent) return bad(`“${op.say}” does not mean ${op.intent}`);
      if (NEVER.test(s.intent)) return bad(`a model may not start “${s.intent}”`);
      steps.push({ say: op.say.trim(), intent: s.intent, confirm: CONFIRM.test(s.intent) });
    }
    return { ok: true, kind: 'ops', steps, text: typeof obj.text === 'string' ? obj.text.slice(0, 600) : '' };
  }
  // the instruction for turning a request into ops: the few commands nearest to the request, by Flint's own index
  function sysOps(text, N, ctx, facts) {
    const cat = N.catalog().filter(c => !NEVER.test(c.id) && !/^(?:help\.kb|hello|undo|redo|calc|convert|random|time\.now|date\.calc)$/.test(c.id));
    const idx = N.index(cat.map((c, i) => ({ id: i, text: `${c.label || ''} ${c.examples.join(' ')}` }))), near = N.search(idx, text, 14).map(h => cat[h.doc.id]);
    const core = ['task.add', 'note.add', 'doc.new', 'sheet.new', 'event.add', 'find'].map(id => cat.find(c => c.id === id)).filter(Boolean);
    const list = [...new Map([...near, ...core].map(c => [c.id, c])).values()].slice(0, 18);
    return `You turn a person's request into commands for Flint, a helper inside the TribeCode app. You cannot do anything yourself; you only choose commands.\n` +
      `Reply with JSON only. Either {"ops":[{"say":"<command>"}]} with 1 to 5 commands written like the examples below (plain words, real names and dates from the request), or {"text":"<a short answer>"} when the request is a question or cannot be done with these commands.\n` +
      `Commands (examples):\n${list.map(c => `- ${c.examples[0]}`).join('\n')}${facts || ''}${ctx && ctx.members && ctx.members.length ? `\nPeople: ${ctx.members.map(m => m.name).slice(0, 12).join(', ')}` : ''}`;
  }
  // which writing job is it, if any
  function kindOf(text) {
    const t = String(text || '').trim(); let m;
    if ((m = /^(?:please\s+)?(?:rewrite|reword|rephrase|make)\s+(?:this|that|it|the following)?\s*(?:to (?:be|sound)\s+|sound\s+|in an?\s+|more\s+)?(friendly|formal|professional|playful|confident|casual|shorter|simpler|warmer|polite|persuasive)(?:\s+(?:tone|voice|way))?\s*[:\-–]\s*([\s\S]{3,})$/i.exec(t))) return { kind: 'rewrite', tone: m[1].toLowerCase(), input: m[2] };
    if ((m = /^(?:please\s+)?(?:summari[sz]e|sum up|tl;?dr)\s*(?:this|that|the following)?\s*[:\-–]\s*([\s\S]{20,})$/i.exec(t))) return { kind: 'summary', input: m[1] };
    if (/^(?:please\s+)?(?:summari[sz]e|sum up|tl;?dr)\b.*\b(?:doc|document|page|note)\b/i.test(t) || /^(?:a\s+)?(?:real|proper|better)\s+summary\b/i.test(t)) return { kind: 'summary', input: '' };
    if ((m = /^(?:please\s+)?explain\s+(?:this\s+)?(?:error|code|bug|message|stack ?trace)?\s*[:\-–]?\s*([\s\S]{6,})$/i.exec(t))) return { kind: 'explain', input: m[1] };
    if (/^(?:please\s+)?(?:come up with|suggest|give me|brainstorm|think of)\s+(?:a\s+|some\s+|a few\s+|\d+\s+)?(?:good\s+|catchy\s+)?names?\b/i.test(t) || /^(?:name ideas|what should we (?:call|name))\b/i.test(t)) return { kind: 'name', input: t };
    if (/^(?:please\s+)?(?:write|draft|compose)\s+(?:me\s+|us\s+)?(?:an?\s+|the\s+|some\s+)?(?!task|note\b)/i.test(t)) return { kind: 'draft', input: t };
    return null;
  }
  const WRITE = {
    summary: () => 'Summarize the text in at most four short sentences. Keep every date, number, name and decision. Plain text, no preamble.',
    rewrite: k => `Rewrite the text so it sounds ${k.tone}. Keep the meaning and every fact. Reply with the rewritten text only.`,
    explain: () => 'Explain this to a beginner in three or four short sentences: what it means, the most likely cause, and one thing to try. Plain text.',
    name: () => 'Suggest six short names. One per line, no numbering, no explanations.',
    draft: () => 'Write what is asked, briefly (under 180 words), in plain friendly language. Use the project facts when they fit. Never invent dates, prices or names that are not given.',
  };
  const pure = { isLoopback, parseReply, validate, sysOps, kindOf, NEVER, CONFIRM, version: 1 };
  if (typeof document === 'undefined') return pure;

  // ---------- in the app ----------
  const C = root.TribeClient, KEY = 'tribecode.flintllm';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => root.TribeApp && root.TribeApp.toast && root.TribeApp.toast(m);
  const connected = () => !!(C && C.connected && C.connected());
  const config = () => { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && typeof c === 'object' ? c : { backend: 'off' }; } catch { return { backend: 'off' }; } };
  const set = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} try { document.dispatchEvent(new CustomEvent('flintllm', { detail: c })); } catch {} };
  const B = () => root.TribeBrain;
  const ready = () => { const c = config(); return c.backend === 'device' ? !!(isLoopback(c.url) && c.model) : c.backend === 'host' ? !!(connected() && isLoopback(c.url) && c.model) : c.backend === 'browser' ? !!(B() && B().browserReady && B().browserReady()) : false; };
  const label = () => { const c = config(); return c.backend === 'device' ? `${c.model} on this device` : c.backend === 'host' ? `${c.model} on your tribe’s host` : c.backend === 'browser' ? 'the built-in model in this browser' : 'off'; };
  const DEVICE = [['http://localhost:11434', 'Ollama'], ['http://localhost:1234', 'LM Studio'], ['http://localhost:8080', 'llama.cpp'], ['http://localhost:1337', 'Jan']];
  async function probe(origin, ms = 1200) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(origin + '/v1/models', { signal: ctl.signal, credentials: 'omit', cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return Array.isArray(j.data) ? j.data.map(x => String((x && x.id) || '')).filter(Boolean).slice(0, 60) : null; } catch { return null; } finally { clearTimeout(t); }
  }
  // what is on this computer and on the host; nothing but loopback (and the tribe's own host) is contacted
  async function detect(extraUrl) {
    const out = [], list = DEVICE.slice(); const ex = extraUrl && isLoopback(extraUrl); if (ex && !list.some(l => l[0] === ex)) list.unshift([ex, 'Local server']);
    await Promise.all(list.map(async ([url, kind]) => { const models = await probe(url); if (models) out.push({ where: 'device', url, kind, models }); }));
    let host = null; if (connected()) { try { host = await C.api('/flint/llm'); } catch {} }
    for (const s of (host && host.servers) || []) out.push({ where: 'host', url: s.url, kind: s.kind, models: s.models });
    return { servers: out, hostCan: !!(host && host.can), share: !!(host && host.share) };
  }
  let current = null;   // the request in flight: { ctl, cancelled }
  const cancel = () => { if (current) { current.cancelled = true; try { current.ctl.abort(); } catch {} } };
  // chat(messages, { json, onText, max, timeoutMs }) -> the whole reply. Streams through onText(soFar). Throws on timeout/cancel.
  async function chat(messages, o = {}) {
    const c = config(), ctl = new AbortController(), me = current = { ctl, cancelled: false };
    const limit = o.timeoutMs || c.timeoutMs || 45000; let out = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, limit);
    try {
      if (c.backend === 'browser') {
        if (!B() || !B().askBrowser) throw new Error('The built-in model is not set up in this browser.');
        const r = await Promise.race([B().askBrowser(messages, t => { if (!me.cancelled && !timedOut) { out = t; if (o.onText) o.onText(out); } }), new Promise((_, rej) => ctl.signal.addEventListener('abort', () => rej(new Error('aborted'))))]);
        return (r && r.text) || out;
      }
      const origin = isLoopback(c.url); if (!origin) throw new Error('The local model’s address is not on this computer.');
      let res;
      if (c.backend === 'host') {
        if (!connected()) throw new Error('Not connected to the host.');
        const tok = ((root.TribeStore.get() || {}).server || {}).token || '';
        res = await fetch(C.base() + '/api/flint/llm/chat', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify({ url: origin, model: c.model, messages, json: !!o.json, max: o.max || 400 }) });
        if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `The host’s local model did not answer (${res.status}).`); }
        const rd = res.body.getReader(), dec = new TextDecoder();
        for (;;) { const { value, done } = await rd.read(); if (done) break; out += dec.decode(value, { stream: true }); if (o.onText) o.onText(out); }
        return out;
      }
      res = await fetch(origin + '/v1/chat/completions', { method: 'POST', signal: ctl.signal, credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: c.model, messages, stream: true, temperature: 0.2, max_tokens: o.max || 400, ...(o.json ? { response_format: { type: 'json_object' } } : {}) }) });
      if (!res.ok || !res.body) throw new Error(`The local model said ${res.status}.`);
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') continue; try { const t = JSON.parse(d).choices[0].delta.content; if (t) { out += t; if (o.onText) o.onText(out); } } catch {} }
      }
      return out;
    } catch (e) {
      if (me.cancelled) { const err = new Error('cancelled'); err.cancelled = true; throw err; }
      if (timedOut) { const err = new Error(`The local model took longer than ${Math.round(limit / 1000)} seconds.`); err.timeout = true; throw err; }
      throw e;
    } finally { clearTimeout(timer); if (current === me) current = null; }
  }
  // a rough speed number for the device panel: tokens are counted as characters / 4
  async function speed() {
    if (!ready()) return null; const t0 = performance.now(); let first = 0;
    const out = await chat([{ role: 'user', content: 'Count from 1 to 30, separated by spaces.' }], { max: 120, timeoutMs: 30000, onText: () => { if (!first) first = performance.now(); } });
    const dt = (performance.now() - (first || t0)) / 1000, toks = Math.max(1, Math.round(out.length / 4));
    return { tokensPerSec: Math.round(toks / Math.max(0.05, dt) * 10) / 10, firstMs: Math.round((first || performance.now()) - t0), tokens: toks };
  }
  const clean = s => String(s || '').replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trimStart();
  // Flint's chat hands over a request his rules did not recognise. true = handled here; false = fall back to tier 0/1.
  async function handle(text, H) {
    if (!ready()) return false;
    const N = root.TribeNLU, FL = root.TribeFlintLocal, FX = root.TribeFlintFacts; if (!N || !FL) return false;
    const via = label(), facts = FX && FX.brief ? FX.brief() : '';
    const msg = H.say('Thinking on this device…', [H.act('Cancel', 'llmcancel', '')], { streaming: true, via }) || {};
    const end = (t, acts) => { msg.text = t; msg.acts = acts || []; delete msg.streaming; H.redraw(); };
    try {
      const k = kindOf(text);
      if (k) {
        let input = k.input;
        if (k.kind === 'summary' && !input) { const D = root.TribeDocs, d = D && D.current && D.current(), ta = document.querySelector('#doc-body'); input = (ta && ta.value) || (d && d.body) || ''; if (input.length < 40) { end('Open the doc you want summed up, or paste the text after “summarize:”.'); return true; } }
        const out = clean(await chat([{ role: 'system', content: WRITE[k.kind](k) + facts }, { role: 'user', content: String(input).slice(0, 8000) }], { max: 500, onText: t => { msg.text = clean(t) || '…'; H.drawLast(); } })).trim();
        if (!out) throw new Error('empty');
        end(out, [H.act('Copy', 'copytext', out)]); return true;
      }
      const ctx = FL.ctx(), raw = await chat([{ role: 'system', content: sysOps(text, N, ctx, facts) }, { role: 'user', content: text }], { json: true, max: 300, onText: t => { msg.text = `Thinking on this device… ${'·'.repeat(1 + (t.length >> 4) % 6)}`; H.drawLast(); } });
      const v = validate(parseReply(raw), N, ctx);
      if (!v.ok) { end(`My local model answered with something I can’t safely apply (${v.why}), so I changed nothing.`); return false; }
      if (v.kind === 'text') { end(v.text); return true; }
      const lines = [], acts = []; let ran = 0;
      for (const s of v.steps) {
        if (s.confirm) { lines.push(`“${s.say}” (press to do it)`); acts.push(H.act(s.say.slice(0, 60), 'ask', s.say)); continue; }
        msg.text = `Doing: ${s.say}…`; H.drawLast();
        const r = await FL.runSay(s.say, `local model: ${s.say}`.slice(0, 80));
        if (r && r.ok) { ran++; lines.push(`${(r.text || s.say).replace(/\s+/g, ' ').slice(0, 140)} ✓`); } else lines.push(`“${s.say}” didn’t work${r && r.text ? `: ${r.text}` : ''}`);
      }
      if (ran) acts.unshift(H.act('Undo', 'ask', 'undo'));
      end(`I read that as ${v.steps.length === 1 ? 'one step' : `${v.steps.length} steps`}:\n${lines.map(l => `· ${l}`).join('\n')}`, acts);
      return true;
    } catch (e) {
      if (e.cancelled) { end('Stopped. Nothing changed.'); return true; }
      end(e.timeout ? `${e.message} I stopped waiting and changed nothing.` : 'My local model didn’t answer, so I’m carrying on without it.');
      return false;
    }
  }

  // ---------- the picker ("Flint's local model") ----------
  let sheet = null, lastFocus = null;
  function close() { if (!sheet) return; sheet.remove(); sheet = null; if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch {} }
  async function open() {
    lastFocus = document.activeElement; if (sheet) sheet.remove();
    sheet = document.createElement('div'); sheet.id = 'flint-llm'; sheet.className = 'fmd fll'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Flint’s local model');
    document.body.appendChild(sheet); sheet.onclick = e => { if (e.target === sheet) close(); }; sheet.onkeydown = e => { if (e.key === 'Escape') close(); };
    sheet.innerHTML = '<div class="fmd-card"><p class="faint">Looking on this computer…</p></div>';
    await draw();
  }
  async function draw(note) {
    if (!sheet) return; const c = config(), d = await detect(c.url), g = B() && B().gpu ? await B().gpu().catch(() => ({ ok: false })) : { ok: false, why: '' }; if (!sheet) return;
    const row = (s, m) => { const on = c.backend === s.where && c.url === s.url && c.model === m; return `<li><button type="button" class="fll-pick${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-where="${s.where}" data-url="${esc(s.url)}" data-model="${esc(m)}"><span class="bp-dot" aria-hidden="true"></span><b>${esc(m)}</b><small>${esc(s.kind)} · ${s.where === 'device' ? 'this device' : 'your tribe’s host'}</small></button></li>`; };
    const rows = d.servers.flatMap(s => s.models.slice(0, 12).map(m => row(s, m)));
    sheet.innerHTML = `<div class="fmd-card fll-card">
      <header class="fmd-head"><div><span class="eyebrow">Flint · level 2</span><h2>Local model</h2></div><button type="button" class="btn ghost" id="fll-x" aria-label="Close">✕</button></header>
      <p class="fmd-lead">A small language model on a computer you control. With it Flint understands requests his rules miss, writes real summaries, rewrites text in a tone, drafts from your project’s facts, explains errors and suggests names. It only ever hands back text or Flint’s own commands, which are checked before they run and can be undone.</p>
      <section aria-label="Models found"><h3 class="eyebrow">Found on your computers</h3>
        ${rows.length ? `<ul class="fll-list" role="radiogroup" aria-label="Local models">${rows.join('')}</ul>` : `<p class="fmd-hint" id="fll-none">No local model server answered on this computer${connected() ? ' or on the host' : ''}. Install <b>Ollama</b> (ollama.com) and run <code>ollama pull qwen3:1.7b</code>, or start LM Studio’s or llama.cpp’s server, then press Look again.${/^https:/.test(location.protocol) ? ' On the website the server must also allow this page: for Ollama, set OLLAMA_ORIGINS to this site’s address.' : ''}</p>`}
        <form class="fmd-row" id="fll-url" autocomplete="off"><input class="input" id="fll-u" spellcheck="false" placeholder="http://localhost:11434 (another port on this computer)" aria-label="A local server address" value="${esc(c.url && !DEVICE.some(x => x[0] === c.url) ? c.url : '')}"><button class="btn sm">Look again</button></form></section>
      <section aria-label="In this browser"><h3 class="eyebrow">In this browser · WebGPU</h3>
        <div class="fll-web"><button type="button" class="fll-pick${c.backend === 'browser' ? ' on' : ''}" role="radio" aria-checked="${c.backend === 'browser'}" data-where="browser"${g.ok ? '' : ' disabled'}><span class="bp-dot" aria-hidden="true"></span><b>${esc(g.ok ? g.label : 'Built-in model')}</b><small>${g.ok ? `${esc(g.size)} one-time download, kept in this browser` : 'not available here'}</small></button>
        <p class="fmd-hint">${g.ok ? 'Its runtime (WebLLM) and the model are fetched from their publishers only when you press Download in Flint’s brain; neither is part of TribeCode’s files.' : esc(g.why || 'This browser has no WebGPU, so a model can’t run inside it. A local server above works without it.')} <button type="button" class="linkish" id="fll-brain">Open Flint’s brain</button></p></div></section>
      ${note ? `<p class="fmd-hint" id="fll-note" role="status">${esc(note)}</p>` : ''}
      <div class="fmd-state${ready() ? ' on' : ''}" id="fll-state"><b>${ready() ? 'On' : c.backend === 'off' ? 'Off' : 'Chosen, not ready'}</b><span>${ready() ? esc(label()) : c.backend === 'browser' ? 'Download the built-in model in Flint’s brain first.' : 'Flint works as before, with no model.'}</span></div>
      <div class="fmd-acts"><button type="button" class="btn sm" id="fll-test"${ready() ? '' : ' disabled'}>Test it</button><button type="button" class="btn sm" id="fll-off"${c.backend === 'off' ? ' disabled' : ''}>Turn off</button><button type="button" class="btn ghost sm" id="fll-done">Done</button></div>
      <p class="fmd-foot">Only addresses on this computer (localhost) are accepted, and the host only talks to its own. What you ask goes to that model and nowhere else.</p>
    </div>`;
    const $ = s => sheet.querySelector(s);
    $('#fll-x').onclick = close; $('#fll-done').onclick = close;
    $('#fll-brain').onclick = () => { close(); if (root.TribeFlintPage) root.TribeFlintPage.close(); if (B() && B().open) B().open(); };
    $('#fll-url').onsubmit = e => { e.preventDefault(); const u = $('#fll-u').value.trim(); if (u && !isLoopback(u)) return draw('That address is not on this computer. Only localhost is accepted here.'); if (u) set({ ...config(), url: isLoopback(u) }); draw(); };
    sheet.querySelectorAll('.fll-pick').forEach(b => b.onclick = () => { if (b.disabled) return; if (b.dataset.where === 'browser') set({ backend: 'browser' }); else set({ backend: b.dataset.where, url: b.dataset.url, model: b.dataset.model }); draw(ready() ? `Flint now uses ${label()}.` : ''); });
    $('#fll-off').onclick = () => { set({ backend: 'off' }); draw('Off. Flint works as before.'); };
    $('#fll-test').onclick = async () => { const b = $('#fll-test'); b.disabled = true; b.textContent = 'Testing…'; try { const s = await speed(); draw(s ? `Works: about ${s.tokensPerSec} tokens a second, first word after ${s.firstMs} ms.` : 'Not ready.'); } catch (e) { draw(`It didn’t answer: ${e.message}`); } };
    setTimeout(() => { const f = sheet && (sheet.querySelector('.fll-pick.on') || sheet.querySelector('.fll-pick:not([disabled])') || sheet.querySelector('#fll-u')); if (f) f.focus(); }, 30);
  }
  return { ...pure, config, set, ready, label, detect, chat, cancel, speed, handle, open, close };
});
