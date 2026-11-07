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

const KINDS = {
  'claude-code': { label: 'Claude Code', color: '#38C6B1' },
  'claude-desktop': { label: 'Claude Desktop', color: '#FFB86B' },
  mcp: { label: 'MCP agent', color: '#E86A92' },
};
const kindOf = m => (m && KINDS[m.kind] ? m.kind : 'claude-code');

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
    const st = await brain.refresh().catch(() => brain.status());
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

  return { route, desktopConfig, kindOf, KINDS, bridgePath, bridgeSource };
};
module.exports.runBridge = runBridge;
module.exports.KINDS = KINDS;
