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

// How to connect each tool: 2-3 steps and copy-ready blocks with the real URL and key. Formats checked against each
// tool's own docs on 2026-11-07 (docs/guide/03-connect-claude-code.md lists the links):
//   Codex CLI   ~/.codex/config.toml [mcp_servers.<name>] url + http_headers / bearer_token_env_var;
//               `codex mcp add <name> --url <url> --bearer-token-env-var <VAR>`
//   Gemini CLI  `gemini mcp add -s user -t http -H "Authorization: Bearer …" <name> <url>`; settings.json httpUrl + headers
//   Qwen Code   `qwen mcp add --scope user --transport http <name> <url> --header "…"`; settings.json httpUrl + headers
//   Cursor      .cursor/mcp.json (project) or ~/.cursor/mcp.json: mcpServers.<name>.url + headers
// feat/mcp-directory (checked 2026-11-07, links in docs/ANY-LLM.md):
//   VS Code     .vscode/mcp.json: servers.<name> { type: "http", url, headers }
//   Windsurf    ~/.codeium/windsurf/mcp_config.json: mcpServers.<name> { serverUrl, headers }
//   Zed         settings.json: context_servers.<name> { url, headers }
//   Cline       cline_mcp_settings.json: mcpServers.<name> { type: "streamableHttp", url, headers }
//   Goose       ~/.config/goose/config.yaml: extensions.<name> { type: streamable_http, uri, headers }
//   Continue    .continue/mcpServers/*.yaml: mcpServers[] { type: streamable-http, url, requestOptions.headers }
//   Claude.ai   Customize › Connectors › Add custom connector: URL, "No sign-in" (key in the URL: /mcp takes ?token=)
//   ChatGPT     Settings › Apps › Advanced settings › Developer mode › Create app: URL, "No Authentication"
const withToken = (url, key) => `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(key)}`;
function setupFor(kind, url, token, name = 'tribecode') {
  const key = token || '<key>', auth = `Bearer ${key}`;
  const json = o => JSON.stringify(o, null, 2);
  const httpJson = field => json({ mcpServers: { [name]: { [field]: url, headers: { Authorization: auth } } } });
  switch (kind) {
    case 'codex': return {
      steps: ['Open ~/.codex/config.toml (on Windows: %USERPROFILE%\\.codex\\config.toml). Create it if it is not there.', 'Paste this at the end and save.', 'Start codex: it joins the tribe. Type /mcp to check that tribecode is listed.'],
      blocks: [{ label: 'config.toml', lang: 'toml', text: `[mcp_servers.${name}]\nurl = "${url}"\nhttp_headers = { "Authorization" = "${auth}" }\n` },
        { label: 'Or keep the key in an environment variable', lang: 'sh', alt: true, text: `export TRIBECODE_KEY=${key}\ncodex mcp add ${name} --url ${url} --bearer-token-env-var TRIBECODE_KEY` }],
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
      blocks: [{ label: '.cursor/mcp.json', lang: 'json', text: httpJson('url') }],
      docs: 'https://cursor.com/docs/context/mcp' };
    case 'vscode': return {
      steps: ['In your project, create .vscode/mcp.json (or run "MCP: Add Server" from the Command Palette and pick HTTP).', 'Paste this and save. Already have servers there? Add the tribecode entry inside servers.', 'Open Copilot Chat in Agent mode: the tribecode tools are listed under the tools button.'],
      blocks: [{ label: '.vscode/mcp.json', lang: 'json', text: json({ servers: { [name]: { type: 'http', url, headers: { Authorization: auth } } } }) }],
      docs: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration' };
    case 'windsurf': return {
      steps: ['Open ~/.codeium/windsurf/mcp_config.json (Cascade › MCP servers › View raw config).', 'Paste this and save. Already have servers there? Add the tribecode entry inside mcpServers.', 'Refresh the MCP servers in Cascade: tribecode turns on.'],
      blocks: [{ label: 'mcp_config.json', lang: 'json', text: json({ mcpServers: { [name]: { serverUrl: url, headers: { Authorization: auth } } } }) }],
      docs: 'https://docs.windsurf.com/windsurf/cascade/mcp' };
    case 'zed': return {
      steps: ['In Zed, open your settings (zed: open settings).', 'Add this inside the top-level object and save.', 'Open the Agent Panel: tribecode shows a green dot in its settings.'],
      blocks: [{ label: 'settings.json', lang: 'json', text: json({ context_servers: { [name]: { url, headers: { Authorization: auth } } } }) }],
      docs: 'https://zed.dev/docs/ai/mcp' };
    case 'cline': return {
      steps: ['In Cline, open MCP Servers and choose Configure (it opens cline_mcp_settings.json).', 'Add the tribecode entry inside mcpServers and save. Keep "type": "streamableHttp".', 'Cline reloads the servers: tribecode turns green.'],
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
    // Chat apps that connect from their own cloud: they get the public https URL with the key in it (?token=), because
    // their "add a connector" forms take a URL and either OAuth (TribeCode doesn't do it) or no sign-in.
    case 'claude-ai': return {
      steps: ['On claude.ai, open Customize › Connectors and choose Add custom connector.', 'Name it TribeCode, paste this URL and choose No sign-in. Leave the OAuth fields empty.', 'In a chat, open + › Connectors and turn TribeCode on.'],
      blocks: [{ label: 'Connector URL (the key is inside it: keep it private)', lang: 'text', text: withToken(url, key) },
        { label: 'Your dialog has Request headers? Use the plain URL and this header', lang: 'text', alt: true, text: `${url}\nAuthorization: ${auth}` }],
      docs: 'https://claude.com/docs/connectors/custom' };
    case 'chatgpt': return {
      steps: ['In ChatGPT on the web, open Settings › Apps › Advanced settings and turn on Developer mode (Plus, Pro, Business, Enterprise or Edu).', 'Choose Create app: name it TribeCode, paste this URL and pick No Authentication.', 'In a chat, open + › Developer mode and select TribeCode.'],
      blocks: [{ label: 'Server URL (the key is inside it: keep it private)', lang: 'text', text: withToken(url, key) }],
      docs: 'https://developers.openai.com/api/docs/guides/developer-mode' };
    case 'mcp': return {
      steps: ['Add an MCP server named tribecode in your tool: Streamable HTTP, this URL, this header.', 'Field names differ between tools (Windsurf, VS Code Copilot, Goose, OpenCode…): check its MCP docs. Many accept the JSON below.', 'Restart the tool or reload its MCP servers: it joins the tribe.'],
      blocks: [{ label: 'URL', lang: 'text', text: url }, { label: 'Header', lang: 'text', text: `Authorization: ${auth}` },
        { label: 'Typical JSON', lang: 'json', alt: true, text: json({ mcpServers: { [name]: { type: 'http', url, headers: { Authorization: auth } } } }) }] };
    default: return {
      steps: ['Run this once in a terminal, on any computer.', 'Start claude: it joins the tribe, sees the board, docs and chat, and claims files before editing.'],
      blocks: [{ label: 'Terminal', lang: 'sh', text: `claude mcp add --transport http ${name} ${url} --header "Authorization: ${auth}"` }] };
  }
}

// ---------- the stdio <-> HTTP bridge (self-contained: it is also written out as its own file) ----------
function runBridge() {
  const url = String(process.argv[2] || process.env.TRIBE_MCP_URL || '').trim();
  const token = String(process.env.TRIBE_TOKEN || process.argv[3] || '').trim();
  const say = m => process.stderr.write(`[tribecode-bridge] ${token ? String(m).split(token).join('<token>') : m}\n`);
  if (!/^https?:\/\//.test(url)) { say('usage: node mcp-stdio.js <http(s)://host:port/mcp>   (token in TRIBE_TOKEN)'); process.exit(2); }
  let session = null, pending = 0, ended = false, buf = '';
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
    finally { pending--; if (ended && !pending) process.exit(0); }
  }
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) forward(l); } });
  process.stdin.on('end', () => { ended = true; if (buf.trim()) forward(buf.trim()); buf = ''; if (!pending) process.exit(0); });
}

module.exports = function agentsHub({ P, store, brain, getMembers, presenceFor, agentSeen, idleMs, nameOf, people, coord, claims, endpoints, secretary }) {
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

  async function route(req, res, { m, a, b, me, send, fail }) {
    if (a !== 'agents') return null;
    if (b === 'bridge.js' && m === 'GET') {   // public on purpose: plain code, no secrets
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Disposition': 'attachment; filename="mcp-stdio.js"', 'Access-Control-Allow-Origin': '*' });
      return res.end(bridgeSource());
    }
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (b === 'hub' && m === 'GET') return send(res, 200, await hub(req, me));
    return null;
  }

  // Setup blocks for every place the tool can reach this tribe from (Anywhere / Same Wi-Fi / This computer).
  // feat/mcp-directory: remote chat apps (Claude.ai, ChatGPT) only get the public https link; Claude Desktop gets its
  // bridge config as steps + one copy block, so the one-tap sheet works for it too.
  const setups = (kind, ep, token) => Object.fromEntries(Object.entries(ep.urls || { here: ep.url })
    .filter(([w, u]) => u && (!(KINDS[kind] && KINDS[kind].remote) || (w === 'anywhere' && /^https:/.test(u))))
    .map(([w, u]) => [w, kind === 'claude-desktop' ? desktopSetup(u, token) : setupFor(kind, u, token)]));
  function desktopSetup(url, token) {
    const d = desktopConfig(url, token), os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
    return { steps: [`Open Claude Desktop's config file: ${d.files[os]} (Settings › Developer › Edit Config).`, 'Paste this and save. Already have servers there? Add the tribecode entry inside mcpServers.', 'Restart Claude Desktop: tribecode shows up in its tools. The bridge runs on this computer with Node.'],
      blocks: [{ label: 'claude_desktop_config.json', lang: 'json', text: d.json }] };
  }
  return { route, desktopConfig, kindOf, KINDS, bridgePath, bridgeSource, setups, setupFor };
};
module.exports.runBridge = runBridge;
module.exports.KINDS = KINDS;
module.exports.setupFor = setupFor;
// How to take the server out of each tool after its key is revoked.
module.exports.removeFor = kind => ({ 'claude-desktop': 'Remove "tribecode" from claude_desktop_config.json', codex: 'codex mcp remove tribecode', gemini: 'gemini mcp remove -s user tribecode',
  qwen: 'qwen mcp remove --scope user tribecode', cursor: 'Remove "tribecode" from .cursor/mcp.json',
  vscode: 'Remove "tribecode" from .vscode/mcp.json', windsurf: 'Remove "tribecode" from mcp_config.json', zed: 'Remove "tribecode" from context_servers in Zed settings',
  cline: 'Remove "tribecode" from cline_mcp_settings.json', goose: 'Remove the tribecode extension from goose config.yaml', continue: 'Delete .continue/mcpServers/tribecode.yaml',
  'claude-ai': 'Remove TribeCode in claude.ai › Customize › Connectors', chatgpt: 'Delete the TribeCode app in ChatGPT › Settings › Apps', mcp: 'Remove the tribecode server from your tool\'s MCP settings' }[kind] || 'claude mcp remove tribecode');
