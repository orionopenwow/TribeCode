// The tribe's brain: one small provider layer for every AI feature on the server (Flint, Ask AI, the vision drafts and
// phrase chips, suggested tasks, doc TL;DRs, huddle notes, standups, the Secretary…). Zero dependencies: plain fetch.
//
//   Providers  ollama (the host's local model, server/brain.js) · openai · anthropic · gemini · openrouter · groq ·
//              custom (any OpenAI-compatible base URL: LM Studio, vLLM, Together…) · none (basic mode)
//   Fallback   the chosen provider → Ollama → basic (null / 503 { basic: true })
//   Streaming  SSE where the provider has it (OpenAI-style, Anthropic, Gemini), Ollama's NDJSON; <think> is stripped
//
// The host's key lives ONLY on the host: .tribe/secrets/llm.json (mode 0600, skipped by backups). It is never logged,
// never put in a URL (Gemini gets it as the x-goog-api-key header), never sent to a browser or over the WebSocket.
// Friends' requests run through this server (a proxy), members only, rate-limited, and only when the host allows it,
// with a soft daily cap per friend.
//
//   GET  /api/llm          what the tribe's brain is (no key, ever) and whether YOU may use it
//   PUT  /api/llm          host only: { provider, model, baseUrl, key?, friends, cap }   (key '' clears it)
//   POST /api/llm/test     host only: one tiny request, { ok, via } or the provider's error (key scrubbed)
//
// server/brain.js keeps working: brain.generate / status / refresh are routed through here (brain.route), so every
// module that already takes `brain` uses the chosen provider without changes. The caller (who asked) comes from an
// AsyncLocalStorage set around each API request (llm.asCaller in server/index.js), so friend rules apply everywhere.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');

const PROVIDERS = {
  ollama:     { label: 'This computer (Ollama)', local: true },
  openai:     { label: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-5-mini', kind: 'openai', key: true, keys: 'https://platform.openai.com/api-keys' },
  anthropic:  { label: 'Anthropic', base: 'https://api.anthropic.com/v1', model: 'claude-haiku-5-5', kind: 'anthropic', key: true, keys: 'https://console.anthropic.com/settings/keys' },
  gemini:     { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', kind: 'gemini', key: true, keys: 'https://aistudio.google.com/apikey' },
  openrouter: { label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', kind: 'openai', key: true, keys: 'https://openrouter.ai/keys' },
  groq:       { label: 'Groq', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', kind: 'openai', key: true, keys: 'https://console.groq.com/keys' },
  custom:     { label: 'OpenAI-compatible (custom URL)', kind: 'openai', key: false, model: '' },
  none:       { label: 'None (basic mode)' },
};
const CLOUD = new Set(['openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'custom']);
const FRIEND_PER_MIN = 12;

// "gemini-2.5-flash" -> "Gemini 2.5 Flash", "claude-haiku-5-5" -> "Claude Haiku 5.5", "gpt-5-mini" -> "GPT-5 Mini"
function pretty(model) {
  const m = String(model || '').split('/').pop().replace(/(\d)-(\d)/g, '$1.$2');
  return m.split(/[-_]+/).filter(Boolean).map(w => /^gpt$/i.test(w) ? 'GPT' : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)).join(' ').replace(/^GPT (\d)/, 'GPT-$1') || 'model';
}

// <think>…</think> filter for streamed text (Qwen3, DeepSeek and friends think out loud).
function thinkFilter(write) {
  let thinking = false, pending = '';
  const feed = chunk => {
    pending += chunk;
    for (;;) {
      if (thinking) { const e = pending.indexOf('</think>'); if (e < 0) { pending = pending.slice(-8); return; } pending = pending.slice(e + 8); thinking = false; continue; }
      const s = pending.indexOf('<think>');
      if (s >= 0) { if (s) write(pending.slice(0, s)); pending = pending.slice(s + 7); thinking = true; continue; }
      const keep = pending.lastIndexOf('<'); const safe = keep >= 0 && pending.length - keep < 7 ? pending.slice(0, keep) : pending;
      if (safe) write(safe); pending = pending.slice(safe.length); return;
    }
  };
  return { feed, end: () => { if (pending && !thinking) write(pending); pending = ''; } };
}

// Lines from a streamed body (SSE "data:" lines or NDJSON).
async function eachLine(body, fn) {
  const dec = new TextDecoder(); let buf = '';
  for await (const part of body) {
    buf += dec.decode(part, { stream: true });
    let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl).replace(/\r$/, ''); buf = buf.slice(nl + 1); if (line.trim()) fn(line); }
  }
  if (buf.trim()) fn(buf);
}
const sseData = line => (line.startsWith('data:') ? line.slice(5).trim() : null);

module.exports = function makeLLM({ brain, store, log = () => {}, canUseHost = () => true }) {   // canUseHost(me): feat/roles ai.use_host_brain
  const als = new AsyncLocalStorage();
  const CFG = '.tribe/llm.json', SECRET = '.tribe/secrets/llm.json';
  let cfg = Object.assign({ provider: 'ollama', model: '', baseUrl: '', friends: true, cap: 50 }, store.readJSON(CFG, {}) || {});
  if (!PROVIDERS[cfg.provider]) cfg.provider = 'ollama';

  // ---------- the key: host only, 0600, never logged ----------
  function readKey() { try { return String(JSON.parse(fs.readFileSync(store.p(SECRET), 'utf8')).key || ''); } catch { return ''; } }
  function writeKey(key) {
    const file = store.p(SECRET), dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); try { fs.chmodSync(dir, 0o700); } catch {}
    if (!key) { try { fs.unlinkSync(file); } catch {} return; }
    fs.writeFileSync(file, JSON.stringify({ key }), { mode: 0o600 }); try { fs.chmodSync(file, 0o600); } catch {}
  }
  const scrub = s => { const k = readKey(); let out = String(s || ''); if (k && k.length >= 4) out = out.split(k).join('••••'); return out.replace(/(sk-[A-Za-z0-9_-]{4})[A-Za-z0-9_-]{8,}/g, '$1••••').replace(/(AIza[0-9A-Za-z_-]{2})[0-9A-Za-z_-]{10,}/g, '$1••••').slice(0, 300); };
  const save = () => store.writeJSON(CFG, cfg);

  const P = () => PROVIDERS[cfg.provider] || PROVIDERS.none;
  const modelId = () => cfg.model || P().model || '';
  const baseUrl = () => String(cfg.provider === 'custom' ? cfg.baseUrl : P().base || '').replace(/\/+$/, '');
  const cloudReady = () => CLOUD.has(cfg.provider) && !!baseUrl() && !!modelId() && (!P().key || !!readKey());
  const cloudLabel = () => (cfg.provider === 'custom' ? `${modelId() || 'model'} (custom)` : pretty(modelId()));

  // ---------- who is asking (set around each API request) ----------
  const caller = () => als.getStore() || null;
  const isFriend = me => !!me && me.role !== 'host';
  const today = () => new Date().toISOString().slice(0, 10);
  let usage = { day: today(), by: {} };
  const minute = new Map();   // member id -> [timestamps] (Flint asks)
  const used = mid => (usage.day === today() ? usage.by[mid] || 0 : 0);
  function count(me) {
    if (!isFriend(me)) return;
    if (usage.day !== today()) usage = { day: today(), by: {} };
    usage.by[me.id] = (usage.by[me.id] || 0) + 1;
  }
  // May this person use the host's cloud provider right now? '' = yes, else the reason.
  function cloudBlock(me) {
    if (!isFriend(me)) return '';
    if (!canUseHost(me)) return 'Your role in this tribe doesn\'t include the host\'s AI brain.';
    if (!cfg.friends) return 'The host keeps the shared AI for themselves right now.';
    if (cfg.cap > 0 && used(me.id) >= cfg.cap) return `You reached today's limit of ${cfg.cap} questions on the host's AI. It resets tomorrow.`;
    return '';
  }
  function tooFast(me) {
    if (!me) return false;
    const now = Date.now(), h = (minute.get(me.id) || []).filter(t => now - t < 60_000); h.push(now); minute.set(me.id, h);
    return isFriend(me) && h.length > FRIEND_PER_MIN;
  }
  setInterval(() => { const now = Date.now(); for (const [k, h] of minute) if (!h.length || now - h[h.length - 1] > 60_000) minute.delete(k); }, 60_000).unref();

  // ---------- adapters: each streams text chunks to onText and resolves when done ----------
  async function http(url, headers, body, signal) {
    const res = await fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) {
      let detail = ''; try { const t = await res.text(); try { const j = JSON.parse(t); detail = (j.error && (j.error.message || j.error)) || j.message || t; } catch { detail = t; } } catch {}
      throw Object.assign(new Error(`${P().label} answered ${res.status}${detail ? ': ' + scrub(typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`), { status: res.status });
    }
    return res;
  }
  const ADAPTERS = {
    async openai({ system, messages, maxTokens, temperature, signal }, onText) {
      const key = readKey(), official = cfg.provider === 'openai';
      const body = { model: modelId(), stream: true, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages] };
      if (official) body.max_completion_tokens = Math.max(maxTokens, 400);   // newer OpenAI models think first and reject max_tokens/temperature
      else { body.max_tokens = maxTokens; body.temperature = temperature; }
      const headers = key ? { Authorization: 'Bearer ' + key } : {};
      if (cfg.provider === 'openrouter') { headers['X-Title'] = 'TribeCode'; headers['HTTP-Referer'] = 'https://tribecode.org'; }
      const res = await http(baseUrl() + '/chat/completions', headers, body, signal);
      await eachLine(res.body, line => { const d = sseData(line); if (!d || d === '[DONE]') return; try { const j = JSON.parse(d); const t = j.choices && j.choices[0] && (j.choices[0].delta || j.choices[0].message || {}).content; if (t) onText(t); } catch {} });
    },
    async anthropic({ system, messages, maxTokens, temperature, signal }, onText) {
      const res = await http(baseUrl() + '/messages', { 'x-api-key': readKey(), 'anthropic-version': '2023-06-01' },
        { model: modelId(), max_tokens: maxTokens, temperature, stream: true, ...(system ? { system } : {}), messages }, signal);
      await eachLine(res.body, line => { const d = sseData(line); if (!d) return; try { const j = JSON.parse(d); if (j.type === 'content_block_delta' && j.delta && j.delta.text) onText(j.delta.text); if (j.type === 'error') throw new Error(scrub(j.error && j.error.message)); } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; } });
    },
    async gemini({ system, messages, maxTokens, temperature, signal }, onText) {
      const res = await http(`${baseUrl()}/models/${encodeURIComponent(modelId())}:streamGenerateContent?alt=sse`, { 'x-goog-api-key': readKey() }, {
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { maxOutputTokens: Math.max(maxTokens, 256), temperature, thinkingConfig: /flash/i.test(modelId()) ? { thinkingBudget: 0 } : undefined } }, signal);
      await eachLine(res.body, line => { const d = sseData(line); if (!d) return; try { const j = JSON.parse(d); for (const c of j.candidates || []) for (const p of (c.content && c.content.parts) || []) if (p.text && !p.thought) onText(p.text); } catch {} });
    },
    async ollama({ system, messages, maxTokens, temperature, signal, model }, onText) {
      let st = brain.ollamaStatus();
      if (!st.online || Date.now() - st.checked > 60_000) st = await brain.ollamaRefresh();
      if (!st.online) throw Object.assign(new Error(st.error || 'Ollama is off'), { status: 503 });
      const pick = model && brain.models().includes(model) ? model : st.model;
      const prompt = messages.map(m => (messages.length > 1 ? `${m.role === 'assistant' ? 'Assistant' : 'User'}: ` : '') + m.content).join('\n\n');
      const res = await fetch(String(brain.host).replace(/\/$/, '') + '/api/generate', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: pick, prompt, system, stream: true, think: false, options: { temperature, num_predict: maxTokens } }) });
      if (!res.ok || !res.body) throw Object.assign(new Error(`ollama ${res.status}`), { status: 503 });
      await eachLine(res.body, line => { try { const j = JSON.parse(line); if (j.response) onText(j.response); } catch {} });
    },
  };

  // The order to try, for this caller. Each entry: { id, via, cloud }.
  function chain(me) {
    const out = [], ost = brain.ollamaStatus();
    if (CLOUD.has(cfg.provider) && cloudReady() && !cloudBlock(me)) out.push({ id: P().kind, provider: cfg.provider, via: cloudLabel(), cloud: true });
    if (cfg.provider !== 'none') out.push({ id: 'ollama', provider: 'ollama', via: `${ost.model || 'Ollama'} on the host`, cloud: false, maybe: !ost.online });
    return out;
  }

  // Stream one answer. onText gets clean text chunks. Resolves { via, provider, text } or throws { status, basic }.
  async function stream({ system = '', prompt = '', messages, maxTokens = 300, temperature = 0.3, model = '', timeoutMs = 90_000, signal, me = caller(), onStart } = {}, onText = () => {}) {
    const msgs = messages && messages.length ? messages : [{ role: 'user', content: String(prompt) }];
    const steps = chain(me);
    let lastErr = null;
    for (const step of steps) {
      if (step.id === 'ollama' && step.maybe) { const st = await brain.ollamaRefresh().catch(() => ({ online: false })); if (!st.online) continue; step.via = `${st.model} on the host`; }
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      const stop = () => ctl.abort(); if (signal) { if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }
      let text = '', started = false;
      const f = thinkFilter(s => { if (!started && onStart) onStart(step); text += s; started = true; onText(s); });
      try {
        await ADAPTERS[step.id]({ system, messages: msgs, maxTokens, temperature, signal: ctl.signal, model }, s => f.feed(s));
        f.end(); clearTimeout(t);
        if (step.cloud) count(me);
        return { via: step.via, provider: step.provider, cloud: step.cloud, text: text.trim() };
      } catch (e) {
        clearTimeout(t); f.end();
        lastErr = e.name === 'AbortError' ? Object.assign(new Error(`${step.cloud ? P().label : 'Ollama'} took too long`), { status: 504 }) : e;
        log(`llm: ${step.provider} failed: ${scrub(lastErr.message)}`);
        if (started) return { via: step.via, provider: step.provider, cloud: step.cloud, text: text.trim(), partial: true };
        if (signal && signal.aborted) break;
      }
    }
    const block = CLOUD.has(cfg.provider) && cloudReady() ? cloudBlock(me) : '';
    if (block) throw Object.assign(new Error(block), { status: 403, basic: true });
    throw Object.assign(new Error(lastErr ? scrub(lastErr.message) : cfg.provider === 'none' ? 'The tribe\'s brain is off (basic mode)' : 'No model is available'), { status: 503, basic: true });
  }

  // brain.generate, routed: text or null (callers already treat null as "the brain is off").
  async function generate(prompt, { system, maxTokens = 300, model = '', timeoutMs = 60_000, temperature = 0.2 } = {}) {
    try { const r = await stream({ system, prompt, maxTokens, model, timeoutMs, temperature }); return r.text || null; } catch { return null; }
  }
  // brain.status, routed: online when anything can answer for the current caller.
  function status() {
    const ost = brain.ollamaStatus(), me = caller();
    if (cfg.provider === 'none') return { ...ost, online: false, model: '', error: 'the tribe\'s brain is off (basic mode)', provider: 'none' };
    if (CLOUD.has(cfg.provider) && cloudReady() && !cloudBlock(me)) return { online: true, model: cloudLabel(), via: cloudLabel(), cloud: true, provider: cfg.provider, checked: Date.now(), error: '' };
    return { ...ost, via: ost.model ? `${ost.model} on the host` : '', cloud: false, provider: 'ollama' };
  }
  brain.route({ generate, status });

  // ---------- public view (never the key) ----------
  function view(me) {
    const host = !!me && me.role === 'host', st = status(), ost = brain.ollamaStatus();
    const out = { provider: cfg.provider, label: P().label, model: modelId(), via: st.online ? st.via || st.model : '', online: !!st.online, cloud: CLOUD.has(cfg.provider),
      ready: CLOUD.has(cfg.provider) ? cloudReady() : cfg.provider === 'ollama' ? !!ost.online : false,
      friends: !!cfg.friends, cap: cfg.cap, ollama: { online: !!ost.online, model: ost.model || '' },
      you: { host, block: CLOUD.has(cfg.provider) && cloudReady() ? cloudBlock(me) : '', used: me ? used(me.id) : 0 } };
    if (host) Object.assign(out, { baseUrl: cfg.provider === 'custom' ? cfg.baseUrl : '', hasKey: !!readKey(),
      providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, model: p.model || '', key: !!p.key, keys: p.keys || '', cloud: CLOUD.has(id) })) });
    return out;
  }
  function configure(b) {
    if (b.provider !== undefined) { if (!PROVIDERS[b.provider]) throw Object.assign(new Error('unknown provider'), { status: 400 }); if (b.provider !== cfg.provider && b.model === undefined) cfg.model = ''; cfg.provider = b.provider; }
    if (b.model !== undefined) { const m = String(b.model || '').trim(); if (m && !/^[\w.:/@+-]{1,120}$/.test(m)) throw Object.assign(new Error('that model name does not look right'), { status: 400 }); cfg.model = m; }
    if (b.baseUrl !== undefined) {
      const u = String(b.baseUrl || '').trim().replace(/\/+$/, '');
      if (u && !/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(u)) throw Object.assign(new Error('the base URL should look like http://localhost:1234/v1'), { status: 400 });
      cfg.baseUrl = u;
    }
    if (b.key !== undefined) { const k = String(b.key || '').trim(); if (k && !/^[\x21-\x7e]{8,400}$/.test(k)) throw Object.assign(new Error('that key does not look right'), { status: 400 }); writeKey(k); }
    if (b.friends !== undefined) cfg.friends = !!b.friends;
    if (b.cap !== undefined) cfg.cap = Math.max(0, Math.min(10000, Math.round(Number(b.cap) || 0)));
    save();
  }

  // Flint's streamed answer (server/flint.js): plain text chunks as they come; X-Flint-Via names who answered. The
  // header goes out with the first chunk, so a cloud call that fails before writing anything can still fall back.
  async function streamTo(res, opts, { send }) {
    const me = opts.me;
    if (tooFast(me)) return send(res, 429, { error: 'Slow down a little: too many questions in a minute.' });
    const ctl = new AbortController(); res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    let head = false;
    const open = via => { if (head) return; head = true; res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Flint-Via': encodeURIComponent(via), 'Access-Control-Expose-Headers': 'X-Flint-Via', 'Access-Control-Allow-Origin': '*' }); };
    try {
      const r = await stream({ ...opts, signal: ctl.signal, onStart: step => open(step.via) }, s => res.write(s));
      open(r.via); res.end();
    } catch (e) {
      if (head) return res.end();
      return send(res, e.status || 503, { error: e.message, basic: !!e.basic });
    }
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m === 'GET' && !b) { await brain.ollamaRefresh().catch(() => {}); return send(res, 200, view(me)); }
    if (me.role !== 'host') return fail(res, 403, 'only the host can change the tribe\'s brain');
    if (m === 'PUT' && !b) { try { configure(await readBody(req)); } catch (e) { return fail(res, e.status || 400, e.message); } return send(res, 200, view(me)); }
    if (m === 'POST' && b === 'test') {
      try { const r = await stream({ prompt: 'Reply with the single word: ready', maxTokens: 20, timeoutMs: 30_000, me }); return send(res, 200, { ok: true, via: r.via, cloud: r.cloud, sample: r.text.slice(0, 80) }); }
      catch (e) { return send(res, 200, { ok: false, error: scrub(e.message) }); }
    }
    return fail(res, 404, 'no such brain route');
  }

  return { route, stream, streamTo, generate, status, view, chain, asCaller: (me, fn) => als.run(me || null, fn), caller, PROVIDERS, pretty };
};
module.exports.PROVIDERS = PROVIDERS;
module.exports.pretty = pretty;
