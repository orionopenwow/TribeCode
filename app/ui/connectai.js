// Connect your AI (feat/any-llm): the shared pieces for bringing any coding agent into the tribe. Used by the
// "Connect your AI" sheet (app.js connectClaude) and Agents Hub › Your agents (agentshub.js).
// Each tool gets its own key from POST /api/agents { kind } and comes back with `setup`: per place (anywhere / wifi /
// here) 2-3 steps and copy-ready blocks with the real URL and key (server/agentshub.js setupFor). TribeCode works with
// these tools; it isn't made by their vendors.
//   window.TribeConnectAI = { TOOLS, MORE, ALL, directory(), tool(kind), chipsHtml(sel), setupHtml(setup), wire(root, setup, toast), watch(agentId, el, alive) }
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // The one list of tools (kind, name, one line, the directory's line, remote: it connects from its maker's cloud and
  // needs the public https link). The Connect your AI sheet, the Agents Hub and the TribeCode MCP page (mcpdir.js) all
  // read it. How each tool is set up is not here: that text comes from the server (server/agentshub.js setupFor), the
  // same source the invite sheet (inviteagent.js) uses.
  const TOOLS = [
    ['claude-code', 'Claude Code', 'Anthropic\'s terminal agent', 'Anthropic\'s terminal agent. One command.'],
    ['codex', 'Codex CLI', 'OpenAI\'s terminal agent', 'OpenAI\'s terminal agent. One block in config.toml.'],
    ['gemini', 'Gemini CLI', 'Google\'s terminal agent', 'Google\'s terminal agent. One command.'],
    ['qwen', 'Qwen Code', 'Qwen\'s terminal agent', 'Qwen\'s terminal agent. One command.'],
    ['cursor', 'Cursor', 'The AI code editor', 'The AI code editor. One .cursor/mcp.json file.'],
    ['mcp', 'Any MCP client', 'MCP is the plug AI tools use to talk to TribeCode: Windsurf, VS Code Copilot, Goose, OpenCode…', 'Anything else that speaks MCP: a URL and a key.'],
  ];
  // feat/mcp-directory: the rest of the clients on the TribeCode MCP page. Not chips: the sheet keeps six, plus the one
  // picked on the page, and a "See all" chip that opens the page.
  const MORE = [
    ['claude-desktop', 'Claude Desktop', 'Anthropic\'s desktop app, through a tiny bridge', 'The desktop app, through a tiny bridge on this computer.'],
    ['vscode', 'VS Code', 'GitHub Copilot in Agent mode', 'GitHub Copilot in Agent mode. One .vscode/mcp.json file.'],
    ['windsurf', 'Windsurf', 'The agentic editor', 'The agentic editor. One mcp_config.json entry.'],
    ['zed', 'Zed', 'The fast editor\'s Agent Panel', 'The Agent Panel in Zed. One settings entry.'],
    ['cline', 'Cline', 'The open-source coding agent', 'The open-source coding agent. One settings entry.'],
    ['goose', 'Goose', 'The open-source local agent', 'The open-source local agent. One config.yaml entry.'],
    ['continue', 'Continue', 'The open-source IDE assistant', 'The open-source IDE assistant. One YAML file.'],
    ['claude-ai', 'Claude.ai', 'Claude chat, as a custom connector', 'Claude chat on the web and phone, as a custom connector.', true],
    ['chatgpt', 'ChatGPT', 'ChatGPT chat, as a custom MCP server', 'ChatGPT chat on the web, as a custom MCP server.', true],
  ];
  // The order the TribeCode MCP page lists them in.
  const DIRECTORY = ['claude-code', 'claude-ai', 'chatgpt', 'codex', 'cursor', 'vscode', 'gemini', 'claude-desktop', 'windsurf', 'zed', 'cline', 'goose', 'continue', 'qwen', 'mcp'];
  const ALL = [...TOOLS, ...MORE];
  const tool = k => ALL.find(t => t[0] === k) || TOOLS[0];
  const chipsHtml = sel => {
    const extra = MORE.find(t => t[0] === sel);
    return `<div class="cai-chips" role="tablist" aria-label="Which AI">${[...TOOLS, ...(extra ? [extra] : [])].map(([k, n]) => `<button type="button" role="tab" class="cai-chip${k === sel ? ' on' : ''}" aria-selected="${k === sel}" data-cai-tool="${k}">${esc(n)}</button>`).join('')}${window.TribeMcpDir ? '<button type="button" class="cai-chip cai-all" data-mcpdir-open>See all</button>' : ''}</div>`;
  };

  function setupHtml(s) {
    if (!s) return '';
    const main = (s.blocks || []).filter(b => !b.alt), alt = (s.blocks || []).filter(b => b.alt);
    const block = (b, i) => `<div class="cai-block"><div class="cai-bl"><span class="eyebrow">${esc(b.label)}</span><button type="button" class="btn cai-copy" data-cai-copy="${i}">Copy</button></div><pre class="cai-pre" data-cai-text="${i}">${esc(b.text)}</pre></div>`;
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
  const directory = () => DIRECTORY.map(k => ALL.find(t => t[0] === k)).filter(Boolean).map(t => [t[0], t[1], t[3] || t[2], !!t[4]]);
  window.TribeConnectAI = { TOOLS, MORE, ALL, directory, tool, chipsHtml, setupHtml, wire, watch };
})();
