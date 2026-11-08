// Connect your AI (feat/any-llm): the shared pieces for bringing any coding agent into the tribe. Used by the
// "Connect your AI" sheet (app.js connectClaude) and Agents Hub › Your agents (agentshub.js).
// Each tool gets its own key from POST /api/agents { kind } and comes back with `setup`: per place (anywhere / wifi /
// here) 2-3 steps and copy-ready blocks with the real URL and key (server/agentshub.js setupFor). TribeCode works with
// these tools; it isn't made by their vendors.
//   window.TribeConnectAI = { TOOLS, tool(kind), chipsHtml(sel), setupHtml(setup), wire(root, setup, toast), watch(agentId, el, alive) }
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // kind, name, one line
  const TOOLS = [
    ['claude-code', 'Claude Code', 'Anthropic\'s terminal agent'],
    ['codex', 'Codex CLI', 'OpenAI\'s terminal agent'],
    ['gemini', 'Gemini CLI', 'Google\'s terminal agent'],
    ['qwen', 'Qwen Code', 'Qwen\'s terminal agent'],
    ['cursor', 'Cursor', 'The AI code editor'],
    ['mcp', 'Any MCP client', 'Windsurf, VS Code Copilot, Goose, OpenCode…'],
  ];
  const tool = k => TOOLS.find(t => t[0] === k) || TOOLS[0];
  const chipsHtml = sel => `<div class="cai-chips" role="tablist" aria-label="Which AI">${TOOLS.map(([k, n]) => `<button type="button" role="tab" class="cai-chip${k === sel ? ' on' : ''}" aria-selected="${k === sel}" data-cai-tool="${k}">${esc(n)}</button>`).join('')}</div>`;

  function setupHtml(s) {
    if (!s) return '';
    const main = (s.blocks || []).filter(b => !b.alt), alt = (s.blocks || []).filter(b => b.alt);
    const block = (b, i) => `<div class="cai-block"><div class="cai-bl"><span class="eyebrow">${esc(b.label)}</span><button type="button" class="btn ${b.alt ? '' : 'primary'} cai-copy" data-cai-copy="${i}">Copy</button></div><pre class="cai-pre" data-cai-text="${i}">${esc(b.text)}</pre></div>`;
    const all = s.blocks || [];
    return `<ol class="cai-steps">${(s.steps || []).map(t => `<li>${esc(t)}</li>`).join('')}</ol>
      ${main.map(b => block(b, all.indexOf(b))).join('')}
      ${alt.map(b => `<details class="cai-alt"><summary>${esc(b.label)}</summary>${block(b, all.indexOf(b))}</details>`).join('')}
      ${s.docs ? `<p class="cai-docs faint">Exact fields can change between versions: <a href="${esc(s.docs)}" target="_blank" rel="noopener">see its MCP docs</a>.</p>` : ''}`;
  }
  function wire(root, s, toast) {
    root.querySelectorAll('[data-cai-copy]').forEach(b => b.onclick = async () => {
      const blk = (s.blocks || [])[Number(b.dataset.caiCopy)]; if (!blk) return;
      try { await navigator.clipboard.writeText(blk.text); toast && toast('Copied.'); } catch { toast && toast('Select the text and copy it.'); }
    });
  }
  // "Waiting for it to connect…" -> "Connected · Maya's Codex", live (polls /api/agents/mine; presence also nudges it).
  function watch(agentId, el, alive) {
    let t = null, stop = false;
    const tick = async () => {
      if (stop || !el.isConnected || (alive && !alive())) return clearInterval(t);
      try {
        const r = await C.api('/agents/mine'), a = (r.agents || []).find(x => x.id === agentId);
        el.innerHTML = a && a.online ? `<span class="cc-dot on"></span>Connected · ${esc(a.name)}` : `<span class="cc-dot"></span>Waiting for it to connect…`;
        el.classList.toggle('on', !!(a && a.online));
      } catch {}
    };
    tick(); t = setInterval(tick, 2500);
    const onP = () => tick(); if (C.on) C.on('presence', onP);
    return () => { stop = true; clearInterval(t); };
  }
  window.TribeConnectAI = { TOOLS, tool, chipsHtml, setupHtml, wire, watch };
})();
