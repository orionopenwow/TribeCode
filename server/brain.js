// Local brain: talks to Ollama on the host. Every feature degrades gracefully when it's off.
'use strict';

module.exports = function brain({ host = 'http://localhost:11434', model = '' } = {}) {
  let status = { online: false, model: '', checked: 0, error: '' };
  let installed = [];   // model names from the last /api/tags

  async function call(path, body, timeoutMs = 60_000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(host.replace(/\/$/, '') + path, { method: body ? 'POST' : 'GET', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) throw new Error(`ollama ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  async function refresh() {
    try {
      const { models = [] } = await call('/api/tags', null, 2500);
      const names = models.map(m => m.name); installed = names;
      const pick = model && names.includes(model) ? model : names.find(n => /qwen/i.test(n)) || names[0] || '';
      status = { online: !!pick, model: pick, checked: Date.now(), error: pick ? '' : 'no models installed (try: ollama pull qwen3)' };
    } catch (e) { installed = []; status = { online: false, model: '', checked: Date.now(), error: 'Ollama not reachable at ' + host }; }
    return status;
  }

  // `model` (optional): an installed model to use instead of the default (the Secretary's pick).
  async function generate(prompt, { system, maxTokens = 300, model: use = '', timeoutMs } = {}) {
    if (!status.online || Date.now() - status.checked > 60_000) await refresh();
    if (!status.online) return null;
    const pick = use && installed.includes(use) ? use : status.model;
    const r = await call('/api/generate', { model: pick, prompt, system, stream: false, think: false,
      options: { temperature: 0.2, num_predict: maxTokens } }, timeoutMs);
    return String(r.response || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n…' : s);

  // server/llm.js routes generate/status through the tribe's chosen provider (cloud key, Ollama, or off) with
  // `route({ generate, status })`; the helpers below and every module holding `brain` then use it. ollama* stay raw.
  let routed = null;
  const gen = (p, o) => (routed ? routed.generate(p, o) : generate(p, o));
  return {
    status: () => (routed ? routed.status() : status),
    refresh: async () => { await refresh(); return routed ? routed.status() : status; },
    models: () => installed.slice(),   // installed Ollama models (agents hub, the Secretary's model picker)
    host,
    generate: gen,
    ollamaGenerate: generate,
    ollamaStatus: () => status,
    ollamaRefresh: refresh,
    route(r) { routed = r; },
    async summarize(title, text) {
      if (!text || text.trim().length < 80) return null;
      return gen(`Document: "${title}"\n\n${clip(text, 12000)}\n\nWrite a TL;DR of this document in at most 3 short lines. Plain text, no preamble.`,
        { system: 'You summarize documents for a small team of friends building software together. Be concrete and brief.', maxTokens: 160 });
    },
    async standup({ chat, tasks, members }) {
      const people = members.map(m => m.name).join(', ');
      const log = chat.map(m => `${m.who}: ${m.text}`).join('\n');
      const board = tasks.map(t => `[${t.status}] ${t.title}${t.assignee ? ' (' + t.assignee + ')' : ''}`).join('\n');
      return gen(`Team: ${people}\n\nChat from the last 24 hours:\n${clip(log, 6000)}\n\nTask board:\n${clip(board, 3000)}\n\nWrite a short daily standup: one bullet per person (what they did / are doing), then one line "Blocked:" (or "Blocked: nothing").`,
        { system: 'You write friendly, factual standups. Only use facts from the input. Never invent work.', maxTokens: 350 });
    },
    // A chat message that reads like a decision -> a short vote draft { question, options } (chatx.js offers
    // it to the author as a "Turn this into a vote?" chip; never posted by itself). null when off or unsure.
    async voteDraft(text) {
      const out = await gen(`Chat message: ${clip(String(text || ''), 600)}\n\nTurn it into a team vote. Reply with exactly one line of JSON: {"question": "<short question ending with ?>", "options": []}. Leave options empty for a yes/no approval; list 2-4 short options only if the message names alternatives.`,
        { system: 'You turn chat messages into short, neutral team votes. JSON only.', maxTokens: 120 });
      if (!out) return null;
      try {
        const j = JSON.parse((out.match(/\{[\s\S]*\}/) || [''])[0]);
        const question = String(j.question || '').trim().slice(0, 200);
        const options = (Array.isArray(j.options) ? j.options : []).map(o => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 4);
        return question.endsWith('?') ? { question, options: options.length >= 2 ? options : [] } : null;
      } catch { return null; }
    },
    async visionCheck({ vision, title, body }) {
      if (!vision || !vision.trim()) return null;
      const out = await gen(`VISION.md:\n${clip(vision, 3000)}\n\nProposal: ${title}\n${clip(body || '', 4000)}\n\nDoes this proposal fit the vision? Answer on the first line with exactly FITS or CONFLICTS, then one short sentence explaining why.`,
        { system: 'You check whether proposals match a project vision. Be strict about explicit statements in the vision.', maxTokens: 80 });
      if (!out) return null;
      const first = out.split('\n')[0].toUpperCase();
      const fits = first.includes('FITS') && !first.includes('CONFLICT');
      const note = out.split('\n').slice(1).join(' ').trim() || out.replace(/^(FITS|CONFLICTS)\W*/i, '').trim();
      return { fits, note: note.slice(0, 240) };
    },
  };
};
