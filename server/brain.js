// Local brain: talks to Ollama on the host. Every feature degrades gracefully when it's off.
'use strict';

module.exports = function brain({ host = 'http://localhost:11434', model = '' } = {}) {
  let status = { online: false, model: '', checked: 0, error: '' };

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
      const names = models.map(m => m.name);
      const pick = model && names.includes(model) ? model : names.find(n => /qwen/i.test(n)) || names[0] || '';
      status = { online: !!pick, model: pick, checked: Date.now(), error: pick ? '' : 'no models installed (try: ollama pull qwen3)' };
    } catch (e) { status = { online: false, model: '', checked: Date.now(), error: 'Ollama not reachable at ' + host }; }
    return status;
  }

  async function generate(prompt, { system, maxTokens = 300 } = {}) {
    if (!status.online || Date.now() - status.checked > 60_000) await refresh();
    if (!status.online) return null;
    const r = await call('/api/generate', { model: status.model, prompt, system, stream: false, think: false,
      options: { temperature: 0.2, num_predict: maxTokens } });
    return String(r.response || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n…' : s);

  return {
    status: () => status,
    refresh,
    generate,
    async summarize(title, text) {
      if (!text || text.trim().length < 80) return null;
      return generate(`Document: "${title}"\n\n${clip(text, 12000)}\n\nWrite a TL;DR of this document in at most 3 short lines. Plain text, no preamble.`,
        { system: 'You summarize documents for a small team of friends building software together. Be concrete and brief.', maxTokens: 160 });
    },
    async standup({ chat, tasks, members }) {
      const people = members.map(m => m.name).join(', ');
      const log = chat.map(m => `${m.who}: ${m.text}`).join('\n');
      const board = tasks.map(t => `[${t.status}] ${t.title}${t.assignee ? ' (' + t.assignee + ')' : ''}`).join('\n');
      return generate(`Team: ${people}\n\nChat from the last 24 hours:\n${clip(log, 6000)}\n\nTask board:\n${clip(board, 3000)}\n\nWrite a short daily standup: one bullet per person (what they did / are doing), then one line "Blocked:" (or "Blocked: nothing").`,
        { system: 'You write friendly, factual standups. Only use facts from the input. Never invent work.', maxTokens: 350 });
    },
    async visionCheck({ vision, title, body }) {
      if (!vision || !vision.trim()) return null;
      const out = await generate(`VISION.md:\n${clip(vision, 3000)}\n\nProposal: ${title}\n${clip(body || '', 4000)}\n\nDoes this proposal fit the vision? Answer on the first line with exactly FITS or CONFLICTS, then one short sentence explaining why.`,
        { system: 'You check whether proposals match a project vision. Be strict about explicit statements in the vision.', maxTokens: 80 });
      if (!out) return null;
      const first = out.split('\n')[0].toUpperCase();
      const fits = first.includes('FITS') && !first.includes('CONFLICT');
      const note = out.split('\n').slice(1).join(' ').trim() || out.replace(/^(FITS|CONFLICTS)\W*/i, '').trim();
      return { fits, note: note.slice(0, 240) };
    },
  };
};
