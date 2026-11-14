// Solo mode: "Your agents" hub. One place for everything connected to this tribe: Claude Code sessions,
// Claude Desktop (through a tiny stdio bridge), any other MCP client (Codex, Gemini CLI, Cursor…), the
// local models on the host (Ollama) and the Secretary (server/secretary.js).
//
//   GET  /api/agents/hub          agents in this project (kind, live/idle, doing, lane, last gist), my keys,
//                                 local models, the Secretary's status, and how to connect
//   POST /api/agents              { kind?, label? } (server/index.js): without kind/label it keeps the old
//                                 single-agent behaviour; with them it makes one more named agent per kind.
//                                 Claude Desktop / MCP keys also get a ready claude_desktop_config.json.
//   DELETE /api/agents/mine?id=   revokes one key (index.js)
//   GET  /api/agents/bridge.js    the stdio bridge itself (no secrets in it), for machines without a checkout
//
// The stdio bridge (scripts/mcp-stdio.js runs runBridge below): Claude Desktop speaks MCP over stdio, the
// tribe speaks Streamable HTTP. The bridge reads JSON-RPC lines on stdin, POSTs them to <url>/mcp with the
// Bearer token from TRIBE_TOKEN, and writes the answers to stdout. It never prints the token.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// short: how the agent is named ("Maya's Codex"). TribeCode works with these tools; it isn't made by their vendors.
const KINDS = {
  'claude-code': { label: 'Claude Code', short: 'Claude', color: '#38C6B1' },
  codex: { label: 'Codex CLI', short: 'Codex', color: '#10A37F', tool: true },
  gemini: { label: 'Gemini CLI', short: 'Gemini', color: '#4C8DF6', tool: true },
  qwen: { label: 'Qwen Code', short: 'Qwen', color: '#7C5CFF', tool: true },
  cursor: { label: 'Cursor', short: 'Cursor', color: '#8A8F98', tool: true },
  'claude-desktop': { label: 'Claude Desktop', short: 'Claude Desktop', color: '#FFB86B' },
  mcp: { label: 'MCP agent', short: 'agent', color: '#E86A92' },
  // feat/mcp-directory: more clients for the TribeCode MCP page (app/ui/mcpdir.js). remote: the client runs in its
  // vendor's cloud, so it can only reach the tribe through the public https link (share.js).
  vscode: { label: 'VS Code', short: 'VS Code', color: '#3E8EDE', tool: true },
  windsurf: { label: 'Windsurf', short: 'Windsurf', color: '#2BB5A0', tool: true },
  zed: { label: 'Zed', short: 'Zed', color: '#8C9BFF', tool: true },
  cline: { label: 'Cline', short: 'Cline', color: '#C7CDD6', tool: true },
  goose: { label: 'Goose', short: 'Goose', color: '#E8C15A', tool: true },
  continue: { label: 'Continue', short: 'Continue', color: '#B58CFF', tool: true },
  'claude-ai': { label: 'Claude.ai', short: 'Claude.ai', color: '#D9825B', tool: true, remote: true },
  chatgpt: { label: 'ChatGPT', short: 'ChatGPT', color: '#5BBF8E', tool: true, remote: true },
};
const kindOf = m => (m && KINDS[m.kind] ? m.kind : 'claude-code');

// Invite your agent (server/inviteagent.js): the kinds a person can invite, one of each. short: how it is named
// ("Maya's Cursor"); "other" is "<Name>'s agent" and can be renamed.
const AGENT_KINDS = {
  claude: { label: 'Claude', short: 'Claude' }, cursor: { label: 'Cursor', short: 'Cursor' }, codex: { label: 'Codex', short: 'Codex' },
  chatgpt: { label: 'ChatGPT', short: 'ChatGPT' }, gemini: { label: 'Gemini', short: 'Gemini' }, vscode: { label: 'VS Code', short: 'VS Code' },
  windsurf: { label: 'Windsurf', short: 'Windsurf' }, cline: { label: 'Cline', short: 'Cline' }, zed: { label: 'Zed', short: 'Zed' },
  other: { label: 'Another agent', short: 'agent' },
};
// The invite sheet's picker, in order. id: what the sheet calls the choice; kind: whose agent it becomes; tool: its
// setup in setupFor below; behaves: 'own' (a session that is working reads its inbox between steps) or 'ask' (it looks
// at TribeCode when its person asks it to); signin: it signs in on a TribeCode page (server/agentauth.js), no key.
const PICKS = [
  { id: 'code', kind: 'claude', tool: 'claude-code', name: 'Claude Code', sub: 'In your terminal', behaves: 'own' },
  { id: 'desktop', kind: 'claude', tool: 'claude-desktop', name: 'Claude Desktop', sub: 'The desktop app', behaves: 'ask' },
  { id: 'web', kind: 'claude', tool: 'claude-ai', name: 'Claude on the web', sub: 'claude.ai', behaves: 'ask', signin: true },
  { id: 'cursor', kind: 'cursor', tool: 'cursor', name: 'Cursor', sub: 'The AI code editor', behaves: 'ask' },
  { id: 'codex', kind: 'codex', tool: 'codex', name: 'Codex CLI', sub: 'OpenAI\'s terminal agent', behaves: 'own' },
  { id: 'chatgpt', kind: 'chatgpt', tool: 'chatgpt', name: 'ChatGPT', sub: 'A custom MCP server, on the web', behaves: 'ask', signin: true },
  { id: 'gemini', kind: 'gemini', tool: 'gemini', name: 'Gemini CLI', sub: 'Google\'s terminal agent', behaves: 'own' },
  { id: 'vscode', kind: 'vscode', tool: 'vscode', name: 'VS Code', sub: 'Copilot in Agent mode', behaves: 'ask' },
  { id: 'windsurf', kind: 'windsurf', tool: 'windsurf', name: 'Windsurf', sub: 'Cascade', behaves: 'ask' },
  { id: 'cline', kind: 'cline', tool: 'cline', name: 'Cline', sub: 'The open-source coding agent', behaves: 'own' },
  { id: 'zed', kind: 'zed', tool: 'zed', name: 'Zed', sub: 'The Agent Panel', behaves: 'ask' },
  { id: 'other', kind: 'other', tool: 'mcp', name: 'Something else', sub: 'Any agent that speaks MCP', behaves: 'ask' },
];
const BEHAVES = { own: 'Answers @mentions on its own while a session is running.', ask: 'Checks TribeCode when you ask it.' };
// Which kind a connected tool counts as (a Connect-your-AI key, or the name an app registered under when it signed in).
const agentKindOf = tool => (PICKS.find(p => p.tool === tool) || { kind: 'other' }).kind;
function agentKindOfClient(name) {
  const n = String(name || '').toLowerCase();
  if (/claude|anthropic/.test(n)) return 'claude';
  if (/cursor/.test(n)) return 'cursor';
  if (/codex/.test(n)) return 'codex';
  if (/chatgpt|openai/.test(n)) return 'chatgpt';
  if (/gemini/.test(n)) return 'gemini';
  if (/visual studio code|vs ?code|copilot/.test(n)) return 'vscode';
  if (/windsurf|cascade|codeium|devin/.test(n)) return 'windsurf';
  if (/cline/.test(n)) return 'cline';
  if (/\bzed\b/.test(n)) return 'zed';
  return 'other';
}

// The one place setup text lives: 2-3 steps and copy-ready blocks with the real URL and key, for the invite sheet
// (server/inviteagent.js), Connect your AI and the TribeCode MCP page. A block may carry `file` (Download saves it
// under that name), `alt` (shown in a fold) and `nokey` (nothing secret in it: the tool signs in instead).
// Checked against each tool's own documentation on 2026-11-13 (links and what could not be confirmed: docs/ANY-LLM.md):
//   Claude Code     `claude mcp add --transport http <name> <url> --header "Authorization: Bearer …"`; stdio with --env … -- <command>
//   Claude Desktop  claude_desktop_config.json (Settings › Developer › Edit Config): mcpServers.<name> { command, args, env }; stdio only
//   Claude (web)    Customize › Connectors › + › Add custom connector: a URL; it signs in with OAuth (dynamic registration)
//   Cursor          .cursor/mcp.json or ~/.cursor/mcp.json: mcpServers.<name> { url, headers }; OAuth when there is no header
//   Codex CLI       ~/.codex/config.toml [mcp_servers.<name>] url + http_headers / bearer_token_env_var; `codex mcp login` for OAuth
//   ChatGPT         chatgpt.com/plugins › + › Add custom MCP server: a URL; OAuth (dynamic registration) or no authentication
//   Gemini CLI      `gemini mcp add -s user -t http -H "Authorization: Bearer …" <name> <url>`; settings.json httpUrl + headers
//   VS Code         .vscode/mcp.json: servers.<name> { type: "http", url, headers }; a root .mcp.json uses mcpServers
//   Windsurf        mcp_config.json (Cascade › Open MCP config file): mcpServers.<name> { serverUrl, headers }
//   Cline           cline_mcp_settings.json: mcpServers.<name> { type: "streamableHttp", url, headers }
//   Zed             settings.json: context_servers.<name> { url, headers }; OAuth when there is no header
// Checked on 2026-11-07 and not looked at again: Qwen Code, Goose, Continue.
const withToken = (url, key) => `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(key)}`;
function setupFor(kind, url, token, name = 'tribecode', opts = {}) {
  const key = token || '<key>', auth = `Bearer ${key}`;
  const json = o => JSON.stringify(o, null, 2);
  const httpJson = field => json({ mcpServers: { [name]: { [field]: url, headers: { Authorization: auth } } } });
  switch (kind) {
    case 'codex': return {
      steps: ['Open ~/.codex/config.toml (on Windows: %USERPROFILE%\\.codex\\config.toml). Create it if it is not there.', 'Paste this at the end and save.', 'Start codex: it joins the tribe. Type /mcp to check that tribecode is listed.'],
      blocks: [{ label: 'config.toml', lang: 'toml', text: `[mcp_servers.${name}]\nurl = "${url}"\nhttp_headers = { "Authorization" = "${auth}" }\n` },
        { label: 'Or keep the key in an environment variable', lang: 'sh', alt: true, text: `export TRIBECODE_KEY=${key}\ncodex mcp add ${name} --url ${url} --bearer-token-env-var TRIBECODE_KEY` },
        { label: 'Or sign in instead of pasting a key', lang: 'sh', alt: true, signin: true, nokey: true, text: `codex mcp add ${name} --url ${url}\ncodex mcp login ${name}` }],
      docs: 'https://developers.openai.com/codex/mcp' };
    case 'gemini': return {
      steps: ['Run this once in a terminal (it saves to ~/.gemini/settings.json).', 'Start gemini: it joins the tribe.', 'Type /mcp to check that tribecode is connected.'],
      blocks: [{ label: 'Terminal', lang: 'sh', text: `gemini mcp add -s user -t http -H "Authorization: ${auth}" ${name} ${url}` },
        { label: 'Or add it to ~/.gemini/settings.json', lang: 'json', alt: true, text: httpJson('httpUrl') }],
      docs: 'https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md' };
    case 'qwen': return {
      steps: ['Run this once in a terminal (it saves to ~/.qwen/settings.json).', 'Start qwen: it joins the tribe.', 'Type /mcp to check that tribecode is connected.'],
      blocks: [{ label: 'Terminal', lang: 'sh', text: `qwen mcp add --scope user --transport http ${name} ${url} --header "Authorization: ${auth}"` },
        { label: 'Or add it to ~/.qwen/settings.json', lang: 'json', alt: true, text: httpJson('httpUrl') }],
      docs: 'https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md' };
    case 'cursor': return {
      steps: ['In your project, create .cursor/mcp.json (or ~/.cursor/mcp.json for every project).', 'Paste this and save. Already have servers there? Add the tribecode entry inside mcpServers.', 'Open Cursor Settings › MCP: tribecode turns green, and the agent can use it.'],
      blocks: [{ label: '.cursor/mcp.json', lang: 'json', file: 'mcp.json', text: httpJson('url') },
        { label: 'Or sign in instead of pasting a key', lang: 'json', alt: true, signin: true, nokey: true, text: json({ mcpServers: { [name]: { url } } }) }],
      docs: 'https://cursor.com/docs/mcp' };
    case 'vscode': return {
      steps: ['In your project, create .vscode/mcp.json (or run "MCP: Add Server" from the Command Palette and pick HTTP).', 'Paste this and save. Already have servers there? Add the tribecode entry inside servers.', 'Open Copilot Chat in Agent mode: the tribecode tools are listed under the tools button.'],
      blocks: [{ label: '.vscode/mcp.json', lang: 'json', file: 'mcp.json', text: json({ servers: { [name]: { type: 'http', url, headers: { Authorization: auth } } } }) },
        { label: 'Or .mcp.json at the workspace root (newer Copilot sessions)', lang: 'json', alt: true, text: json({ mcpServers: { [name]: { type: 'http', url, headers: { Authorization: auth } } } }) }],
      docs: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration' };
    case 'windsurf': return {
      steps: ['In Cascade, open the MCP servers list and choose Open MCP config file (mcp_config.json).', 'Paste this and save. Already have servers there? Add the tribecode entry inside mcpServers.', 'Press the refresh button in the MCP servers list: tribecode turns on.'],
      blocks: [{ label: 'mcp_config.json', lang: 'json', file: 'mcp_config.json', text: json({ mcpServers: { [name]: { serverUrl: url, headers: { Authorization: auth } } } }) }],
      note: 'The file is ~/.config/devin/mcp_config.json (Windows: %AppData%\\devin\\mcp_config.json); older builds use ~/.codeium/windsurf/mcp_config.json.',
      docs: 'https://docs.devin.ai/windsurf/plugins/cascade/mcp' };
    case 'zed': return {
      steps: ['In Zed, open your settings file (zed: open settings file).', 'Add this inside the top-level object and save.', 'Open Settings › AI › MCP Servers: tribecode shows a green dot.'],
      blocks: [{ label: 'settings.json', lang: 'json', text: json({ context_servers: { [name]: { url, headers: { Authorization: auth } } } }) },
        { label: 'Or sign in instead of pasting a key', lang: 'json', alt: true, signin: true, nokey: true, text: json({ context_servers: { [name]: { url } } }) }],
      docs: 'https://zed.dev/docs/ai/mcp' };
    case 'cline': return {
      steps: ['In Cline, open MCP Servers › Configure and choose Configure MCP Servers (it opens cline_mcp_settings.json).', 'Add the tribecode entry inside mcpServers and save. Keep "type": "streamableHttp".', 'Cline reloads the servers: tribecode turns green.'],
      blocks: [{ label: 'cline_mcp_settings.json', lang: 'json', text: json({ mcpServers: { [name]: { type: 'streamableHttp', url, headers: { Authorization: auth }, disabled: false, autoApprove: [] } } }) }],
      docs: 'https://docs.cline.bot/mcp/configuring-mcp-servers' };
    case 'goose': return {
      steps: ['Open ~/.config/goose/config.yaml (on Windows: %APPDATA%\\Block\\goose\\config\\config.yaml).', 'Add this under extensions: (create that line if it is not there) and save.', 'Start a new goose session: it joins the tribe.'],
      blocks: [{ label: 'config.yaml', lang: 'yaml', text: `extensions:\n  ${name}:\n    name: ${name}\n    type: streamable_http\n    uri: ${url}\n    headers:\n      Authorization: ${auth}\n    enabled: true\n    timeout: 300\n` }],
      docs: 'https://block.github.io/goose/docs/getting-started/using-extensions' };
    case 'continue': return {
      steps: ['In your project, create .continue/mcpServers/tribecode.yaml.', 'Paste this and save.', 'Switch Continue to Agent mode: the tribecode tools are there.'],
      blocks: [{ label: '.continue/mcpServers/tribecode.yaml', lang: 'yaml', text: `name: TribeCode\nversion: 0.0.1\nschema: v1\nmcpServers:\n  - name: ${name}\n    type: streamable-http\n    url: ${url}\n    requestOptions:\n      headers:\n        Authorization: ${auth}\n` }],
      docs: 'https://docs.continue.dev/customize/deep-dives/mcp' };
    // Chat apps that connect from their own cloud. opts.signin (the invite sheet): the plain address, and the app signs
    // in on a TribeCode page, so no key is in it. Without it (a Connect-your-AI key): the key rides in the URL (?token=).
    case 'claude-ai': return opts.signin ? {
      steps: ['On claude.ai, open Customize › Connectors, press + and choose Add custom connector.', 'Name it TribeCode and paste this address. If it asks how to sign in, choose Register automatically.', `Press Connect. A TribeCode page opens: approve it there, and it joins${opts.as ? ' as ' + opts.as : ''}.`],
      blocks: [{ label: 'Connector address (no key in it)', lang: 'text', nokey: true, text: url }],
      docs: 'https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp' } : {
      steps: ['On claude.ai, open Customize › Connectors, press + and choose Add custom connector.', 'Name it TribeCode, paste this URL and choose No sign in.', 'In a chat, open + › Connectors and turn TribeCode on.'],
      blocks: [{ label: 'Connector URL (the key is inside it: keep it private)', lang: 'text', text: withToken(url, key) },
        { label: 'Your dialog has Request headers? Use the plain URL and this header', lang: 'text', alt: true, text: `${url}\nAuthorization: ${auth}` }],
      docs: 'https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp' };
    case 'chatgpt': return opts.signin ? {
      steps: ['In ChatGPT on the web, open chatgpt.com/plugins, press + and choose Add custom MCP server.', 'Name it TribeCode, paste this address as the Server URL and choose OAuth. Then Create as a plugin and install it.', `A TribeCode page opens: approve it there, and it joins${opts.as ? ' as ' + opts.as : ''}. In a chat, type @ and pick TribeCode.`],
      blocks: [{ label: 'Server URL (no key in it)', lang: 'text', nokey: true, text: url }],
      docs: 'https://developers.openai.com/api/docs/guides/developer-mode' } : {
      steps: ['In ChatGPT on the web, open chatgpt.com/plugins, press + and choose Add custom MCP server.', 'Name it TribeCode, paste this URL as the Server URL and pick No authentication. Then Create as a plugin and install it.', 'In a chat, type @ and pick TribeCode.'],
      blocks: [{ label: 'Server URL (the key is inside it: keep it private)', lang: 'text', text: withToken(url, key) }],
      docs: 'https://developers.openai.com/api/docs/guides/developer-mode' };
    case 'mcp': return {
      steps: ['Add an MCP server named tribecode in your tool: Streamable HTTP, this URL, this header.', 'Field names differ between tools (Goose, OpenCode, Continue…): check its MCP docs. Many accept the JSON below.', 'Restart the tool or reload its MCP servers: it joins the tribe.'],
      blocks: [{ label: 'URL', lang: 'text', nokey: true, text: url }, { label: 'Header', lang: 'text', text: `Authorization: ${auth}` },
        { label: 'Typical JSON', lang: 'json', alt: true, file: 'tribecode-mcp.json', text: json({ mcpServers: { [name]: { type: 'http', url, headers: { Authorization: auth } } } }) }] };
    default: return {
      steps: ['Run this once in a terminal, on any computer.', `Start claude (or type /mcp in one that's running): it joins the tribe${opts.as ? ' as ' + opts.as : ''}, sees the board, docs and chat, and claims files before editing.`],
      blocks: [{ label: 'Terminal', lang: 'sh', text: `claude mcp add --transport http ${name} ${url} --header "Authorization: ${auth}"` }],
      docs: 'https://code.claude.com/docs/en/mcp' };
  }
}

// ---------- the stdio <-> HTTP bridge (self-contained: it is also written out as its own file) ----------
function runBridge() {
  const url = String(process.argv[2] || process.env.TRIBE_MCP_URL || '').trim();
  const token = String(process.env.TRIBE_TOKEN || process.argv[3] || '').trim();
  const say = m => process.stderr.write(`[tribecode-bridge] ${token ? String(m).split(token).join('<token>') : m}\n`);
  if (!/^https?:\/\//.test(url)) { say('usage: node mcp-stdio.js <http(s)://host:port/mcp>   (token in TRIBE_TOKEN)'); process.exit(2); }
  let session = null, pending = 0, ended = false, buf = '';
  const quit = () => process.stdout.write('', () => process.exit(0));   // let a long answer (tools/list is > 64 KB) reach the pipe first
  const out = obj => process.stdout.write(JSON.stringify(obj) + '\n');
  const errorFor = (msg, code, message) => { const ids = (Array.isArray(msg) ? msg : [msg]).filter(x => x && x.id !== undefined && x.id !== null); ids.forEach(x => out({ jsonrpc: '2.0', id: x.id, error: { code, message } })); };
  async function forward(line) {
    let msg; try { msg = JSON.parse(line); } catch { return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    pending++;
    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
      if (token) headers.Authorization = 'Bearer ' + token;
      if (session) headers['Mcp-Session-Id'] = session;
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(msg) });
      const sid = res.headers.get('mcp-session-id'); if (sid) session = sid;
      if (res.status === 202 || res.status === 204) return;   // notifications: nothing to answer
      const text = await res.text();
      if (!res.ok) { say(`HTTP ${res.status}`); let detail = ''; try { detail = (JSON.parse(text).error || {}).message || ''; } catch {} return errorFor(msg, -32001, `TribeCode answered ${res.status}${detail ? ': ' + detail : ''}`); }
      if (/^\s*(event|data):/m.test(text) && !/^\s*[[{]/.test(text)) {   // an SSE answer: pass each data line on
        for (const l of text.split('\n')) if (l.startsWith('data:')) { const d = l.slice(5).trim(); if (d) process.stdout.write(d + '\n'); }
        return;
      }
      if (text.trim()) process.stdout.write(JSON.stringify(JSON.parse(text)) + '\n');
    } catch (e) { say(`request failed: ${e.message}`); errorFor(msg, -32002, 'Could not reach the TribeCode server'); }
    finally { pending--; if (ended && !pending) quit(); }
  }
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) forward(l); } });
  process.stdin.on('end', () => { ended = true; if (buf.trim()) forward(buf.trim()); buf = ''; if (!pending) quit(); });
}

module.exports = function agentsHub({ P, store, pstore, brain, getMembers, presenceFor, agentSeen, idleMs, nameOf, people, coord, claims, endpoints, secretary, approvals, loadTasks, createTask, saveTask }) {
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const isAgent = m => !!m && m.role === 'agent';
  const pid = () => P.current() || P.defaultId();
  const repoScript = path.join(__dirname, '..', 'scripts', 'mcp-stdio.js');
  const bridgeSource = () => `#!/usr/bin/env node\n// TribeCode stdio <-> HTTP MCP bridge for Claude Desktop and other stdio MCP clients. Zero dependencies.\n//   node mcp-stdio.js <url>/mcp   with the key in the TRIBE_TOKEN environment variable\n'use strict';\n(${runBridge.toString()})();\n`;
  // Where the bridge lives on this machine: the checkout's scripts/ folder, or a copy in the tribe folder
  // (the packaged desktop app ships only the server).
  function bridgePath() {
    if (fs.existsSync(repoScript)) return repoScript;
    const f = store.p('.tribe', 'mcp-stdio.js');
    try { if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== bridgeSource()) fs.writeFileSync(f, bridgeSource()); } catch {}
    return f;
  }
  // `node` for the bridge: this process when it is plain Node, else whatever `node` is on PATH.
  function nodeCommand() {
    let sea = false; try { sea = !!require('node:sea').isSea(); } catch {}
    return sea || !/node(\.exe)?$/i.test(path.basename(process.execPath)) ? 'node' : process.execPath;
  }
  // The claude_desktop_config.json snippet (and the same thing for any stdio MCP client).
  function desktopConfig(url, token, name = 'tribecode') {
    const server = { command: nodeCommand(), args: [bridgePath(), url], env: { TRIBE_TOKEN: token || '<key>' } };
    return {
      json: JSON.stringify({ mcpServers: { [name]: server } }, null, 2),
      server,
      files: { windows: '%APPDATA%\\Claude\\claude_desktop_config.json', mac: '~/Library/Application Support/Claude/claude_desktop_config.json', linux: '~/.config/Claude/claude_desktop_config.json' },
      http: { url, header: `Authorization: Bearer ${token || '<key>'}` },   // clients that speak Streamable HTTP directly
      bridge: '/api/agents/bridge.js',
    };
  }

  // ---------- one card per agent ----------
  function lastGist(agentId) {
    let rows = []; try { rows = store.readJSONL(`.tribe/people/${pid()}.jsonl`, 400); } catch {}
    const r = rows.filter(x => x.by === agentId).pop();
    return r ? { text: r.text, at: r.at } : null;
  }
  function lane(agentId) {
    const out = [];
    try { for (const c of claims.list()) if (c.by === agentId && (!c.project || c.project === pid())) out.push(c.path); } catch {}
    try { const own = coord.ownership({ role: 'host' }); const row = own.owners.find(o => o.id === agentId); if (row) row.lanes.forEach(l => out.push(l.area)); } catch {}
    return [...new Set(out)].slice(0, 4);
  }
  function card(p, me) {
    const m = member(p.id) || p, k = kindOf(m), seen = agentSeen.get(p.id);
    const live = !!seen && Date.now() - seen.at < idleMs && !!m.tokenHash;
    const focus = people && people.contextOf ? people.contextOf(p.id) : null;
    return { id: p.id, name: m.name, kind: k, kindLabel: KINDS[k].label, color: KINDS[k].color, label: m.label || null, owner: m.owner || null, ownerName: m.owner ? nameOf(m.owner) : null,
      yours: m.owner === me.id, live, revoked: !m.tokenHash, doing: live ? (focus && focus.focus) || (seen.where || '') : (focus && focus.focus) || '', since: seen ? new Date(seen.at).toISOString() : null,
      lane: lane(p.id), last: lastGist(p.id) };
  }
  function agentsHere(me) {
    const visible = new Set(presenceFor(me).map(x => x.id));
    return getMembers().filter(m => isAgent(m) && m.tokenHash && visible.has(m.id) && P.canSee(member(m.owner) || m, pid())).map(m => card(m, me))
      .sort((a, b) => (b.yours - a.yours) || (b.live - a.live) || String(b.since || '').localeCompare(String(a.since || '')));
  }

  async function hub(req, me) {
    const st = await (brain.ollamaRefresh || brain.refresh)().catch(() => (brain.ollamaStatus || brain.status)());   // the local models list (the tribe's cloud brain is in Settings › Flint's brain)
    const host = me.role === 'host';
    return {
      you: { id: me.id, host },
      agents: agentsHere(me),
      models: { online: !!st.online, list: brain.models(), default: st.model || '', error: st.online ? '' : st.error, ...(host ? { at: brain.host } : {}) },
      secretary: secretary ? secretary.brief() : null,
      kinds: KINDS,
      connect: endpoints(req, null),
    };
  }

  // ---------- the Agent fleet (app/ui/fleet.js) ----------
  // One row per agent: kind, owner, status (working / idle / offline / paused, with last seen), task and branch, files
  // claimed and the last 3 things it did; plus the one next step that matters most. ?scope=all: your agents in every
  // project you can see (the global Agent fleet); otherwise every agent in this project.
  // Last seen survives a restart: agentSeen is in memory, so it is copied to .tribe/agents-seen.json now and then.
  const SEEN = '.tribe/agents-seen.json';
  let seenDb = {}; try { seenDb = store.readJSON(SEEN, {}) || {}; } catch {}
  function syncSeen() {
    let changed = false;
    for (const [mid, s] of agentSeen) { const at = new Date(s.at).toISOString(); if (seenDb[mid] !== at) { seenDb[mid] = at; changed = true; } }
    if (changed) try { store.writeJSON(SEEN, seenDb); } catch {}
  }
  setInterval(syncSeen, 20_000).unref();
  const ps = () => pstore || store;
  const ownerOk = (m, p) => P.canSee(member(m.owner) || m, p);
  const DONE = new Set(['done']);
  function recentFor(p) {   // what the agents did in project p: their MCP actions (people log) and their #agents posts
    const by = new Map(), add = (mid, text, at, kind) => { if (!mid || !text) return; if (!by.has(mid)) by.set(mid, []); by.get(mid).push({ text: String(text).slice(0, 200), at, kind }); };
    try { for (const r of ps().readJSONL(`.tribe/people/${p}.jsonl`, 600)) if (r.tool !== 'agents_post') add(r.by, r.text, r.at, r.kind || 'call'); } catch {}   // its posts come from #agents below
    try { for (const r of ps().readJSONL(`chat/agents-${p}.jsonl`, 200)) if (!r.human) add(r.by, r.text, r.at, 'post'); } catch {}
    for (const v of by.values()) v.sort((x, y) => String(y.at).localeCompare(String(x.at)));
    return mid => (by.get(mid) || []).slice(0, 3);
  }
  function rowsIn(p, me, pick) {   // inside project p
    return P.inProject(p, () => {
      const crow = new Map(); try { for (const r of coord.agents(me)) crow.set(r.id, r); } catch {}
      const recent = recentFor(p), proj = P.get(p) || {};
      return getMembers().filter(m => isAgent(m) && m.tokenHash && pick(m)).map(m => {
        const r = crow.get(m.id) || {}, s = agentSeen.get(m.id), k = kindOf(m);
        const online = !!s && Date.now() - s.at < idleMs;
        const lastSeen = s ? new Date(s.at).toISOString() : seenDb[m.id] || null;
        const paused = !!(r.control && r.control.action !== 'resume');
        const files = r.files || [];
        const status = paused ? 'paused' : online ? (r.task && r.task.status !== 'done') || files.length ? 'working' : 'idle' : 'offline';   // working: it has a task or claimed files
        return { id: m.id, name: m.name, kind: k, kindLabel: KINDS[k].label, label: m.label || null, owner: m.owner || null, ownerName: m.owner ? nameOf(m.owner) : '', yours: m.owner === me.id,
          status, online, lastSeen, everSeen: !!lastSeen, where: online ? s.where || '' : '', task: r.task || null, branch: r.task ? r.branch : null, files: files.slice(0, 12),
          control: r.control || null, tokens: r.tokens ?? null, budget: r.budget ?? null, recent: recent(m.id), project: p, projectName: proj.name || '', projectColor: proj.color || null };
      });
    });
  }
  const ORDER = { working: 0, idle: 1, paused: 2, offline: 3 };
  function nextSteps(list, me, pids) {
    const out = [], mine = list.filter(a => a.yours);
    for (const p of pids) P.inProject(p, () => {
      try {   // an agent waiting on you
        for (const ap of approvals.list()) {
          if (ap.status !== 'pending' || (ap.project && ap.project !== p)) continue;
          const by = member(ap.by); if (!isAgent(by) || !(ap.to.includes(me.id) || me.role === 'host')) continue;
          out.push({ kind: 'approval', rank: 0, title: `${by.name} is waiting for an approval`, sub: ap.title, approval: ap.id, agent: by.id, project: p });
        }
      } catch {}
      try {   // work the agents suggested that nobody took
        const open = loadTasks().filter(t => !t.assignee && !DONE.has(t.status) && t.status === 'backlog' && ['agent', 'delegation', 'suggest'].includes(t.source));
        if (open.length) out.push({ kind: 'tasks', rank: 2, title: `${open.length} suggested task${open.length === 1 ? '' : 's'} nobody took`, sub: open.slice(0, 2).map(t => t.title).join(' · '), tasks: open.slice(0, 5).map(t => ({ id: t.id, title: t.title })), project: p });
      } catch {}
    });
    for (const a of mine.filter(x => x.status === 'paused')) out.push({ kind: 'paused', rank: 1, title: `${a.name} is paused`, sub: 'Resume it when you want it to carry on.', agent: a.id, project: a.project });
    for (const a of list.filter(x => x.status === 'idle' && (x.yours || me.role === 'host'))) out.push({ kind: 'idle', rank: 3, title: `${a.name} is idle: give it a task`, sub: 'It is connected and waiting for work.', agent: a.id, project: a.project });
    const offline = mine.filter(x => x.status === 'offline' && x.everSeen);
    if (offline.length && !mine.some(x => x.online)) out.push({ kind: 'offline', rank: 4, title: `${offline[0].name} is offline`, sub: 'Start it again in its terminal or editor; it rejoins with the same key.', agent: offline[0].id, project: offline[0].project });
    const working = list.filter(x => x.status === 'working');
    if (working.length) out.push({ kind: 'working', rank: 5, title: `${working.length} agent${working.length === 1 ? ' is' : 's are'} working`, sub: working.slice(0, 2).map(x => `${x.name}: ${x.task ? x.task.title : x.files[0] || x.where || 'working'}`).join(' · '), project: working[0].project });
    return out.sort((x, y) => x.rank - y.rank);
  }
  function fleetData(req, me, all) {
    syncSeen();
    const vis = P.visibleTo(me).map(p => p.id), here = pid();
    let list = [];
    if (all) {
      const mine = getMembers().filter(m => isAgent(m) && m.tokenHash && m.owner === me.id);
      for (const m of mine) {
        const s = agentSeen.get(m.id), p = [s && s.project, m.project].find(x => x && vis.includes(x)) || vis[0] || here;
        list.push(...rowsIn(p, me, x => x.id === m.id));
      }
    } else list = rowsIn(here, me, m => ownerOk(m, here));
    list.sort((x, y) => (y.yours - x.yours) || (ORDER[x.status] - ORDER[y.status]) || x.name.localeCompare(y.name));
    const mine = list.filter(a => a.yours);
    return { scope: all ? 'all' : 'project', project: here, you: { id: me.id, host: me.role === 'host', canAct: me.role !== 'spectator' && me.role !== 'agent' },
      connected: mine.some(a => a.everSeen), agents: list, next: nextSteps(list, me, all ? vis : [here]),
      projects: P.visibleTo(me).map(p => ({ id: p.id, name: p.name, color: p.color || null })) };
  }
  function giveTask(me, agentId, x) {
    const ag = member(agentId); if (!isAgent(ag)) throw Object.assign(new Error('no such agent'), { status: 404 });
    if (me.role === 'spectator' || me.role === 'agent') throw Object.assign(new Error('only members give agents tasks'), { status: 403 });
    if (!ownerOk(ag, pid())) throw Object.assign(new Error('no such agent'), { status: 404 });   // review-2026-11-11: only agents of this project
    let t = x.task ? loadTasks().find(y => y.id === x.task) : null;
    if (x.task && !t) throw Object.assign(new Error('task not found'), { status: 404 });
    const title = String(x.title || '').trim().slice(0, 200);
    if (!t && !title) throw Object.assign(new Error('say what the task is'), { status: 400 });
    if (!t) t = createTask({ title, by: me.id, assignee: agentId, body: String(x.note || '').slice(0, 2000) });
    else { t.assignee = agentId; t.updated = new Date().toISOString(); saveTask(t); }
    coord.tell(agentId, 'task', `${me.name} gave you a task: "${t.title}" (task ${t.id}). Claim the files you need, work on branch task/${t.id}, and ask for a review when it is ready.`, me.id);
    return t;
  }

  async function route(req, res, { m, a, b, c, me, send, fail, readBody, url }) {
    if (a !== 'agents') return null;
    if (b === 'bridge.js' && m === 'GET') {   // public on purpose: plain code, no secrets
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Disposition': 'attachment; filename="mcp-stdio.js"', 'Access-Control-Allow-Origin': '*' });
      return res.end(bridgeSource());
    }
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (b === 'hub' && m === 'GET') return send(res, 200, await hub(req, me));
    if (b === 'fleet' && m === 'GET' && !c) return send(res, 200, fleetData(req, me, (url && url.searchParams.get('scope')) === 'all'));
    if (b === 'fleet' && c && m === 'POST') {
      const parts = (url ? url.pathname : '').split('/').filter(Boolean), what = parts[4];
      if (what === 'task') { try { const t = giveTask(me, c, await readBody(req).catch(() => ({}))); return send(res, 200, { task: { id: t.id, title: t.title, assignee: t.assignee } }); } catch (e) { return fail(res, e.status || 500, e.message); } }
    }
    return null;
  }

  // Setup blocks for every place the tool can reach this tribe from (Anywhere / Same Wi-Fi / This computer).
  // feat/mcp-directory: remote chat apps (Claude.ai, ChatGPT) only get the public https link; Claude Desktop gets its
  // bridge config as steps + one copy block, so the one-tap sheet works for it too.
  const setups = (kind, ep, token) => Object.fromEntries(Object.entries(ep.urls || { here: ep.url })
    .filter(([w, u]) => u && (!(KINDS[kind] && KINDS[kind].remote) || (w === 'anywhere' && /^https:/.test(u))))
    .map(([w, u]) => [w, kind === 'claude-desktop' ? desktopSetup(u, token) : keyOnly(setupFor(kind, u, token))]));
  // A Connect-your-AI key is the way in there: the "sign in instead" folds belong to the invite sheet (they make an invited agent).
  const keyOnly = s => ({ ...s, blocks: (s.blocks || []).filter(b => !b.signin) });
  function desktopSetup(url, token) {
    const d = desktopConfig(url, token), os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
    return { steps: [`Open Claude Desktop's config file: ${d.files[os]} (Settings › Developer › Edit Config).`, 'Paste this and save. Already have servers there? Add the tribecode entry inside mcpServers.', 'Restart Claude Desktop: tribecode shows up in its tools. The bridge runs on this computer with Node.'],
      blocks: [{ label: 'claude_desktop_config.json', lang: 'json', file: 'claude_desktop_config.json', text: d.json }], docs: 'https://modelcontextprotocol.io/docs/develop/connect-local-servers' };
  }
  return { route, desktopConfig, desktopSetup, removeFor: k => module.exports.removeFor(k), kindOf, KINDS, bridgePath, bridgeSource, setups, setupFor, fleet: fleetData };
};
module.exports.runBridge = runBridge;
module.exports.KINDS = KINDS;
module.exports.setupFor = setupFor;
Object.assign(module.exports, { AGENT_KINDS, PICKS, BEHAVES, agentKindOf, agentKindOfClient });
// How to take the server out of each tool after its key is revoked.
module.exports.removeFor = kind => ({ 'claude-desktop': 'Remove "tribecode" from claude_desktop_config.json', codex: 'codex mcp remove tribecode', gemini: 'gemini mcp remove -s user tribecode',
  qwen: 'qwen mcp remove --scope user tribecode', cursor: 'Remove "tribecode" from .cursor/mcp.json',
  vscode: 'Remove "tribecode" from .vscode/mcp.json', windsurf: 'Remove "tribecode" from mcp_config.json', zed: 'Remove "tribecode" from context_servers in Zed settings',
  cline: 'Remove "tribecode" from cline_mcp_settings.json', goose: 'Remove the tribecode extension from goose config.yaml', continue: 'Delete .continue/mcpServers/tribecode.yaml',
  'claude-ai': 'Remove TribeCode in claude.ai › Customize › Connectors', chatgpt: 'Remove the TribeCode plugin at chatgpt.com/plugins', mcp: 'Remove the tribecode server from your tool\'s MCP settings' }[kind] || 'claude mcp remove tribecode');
