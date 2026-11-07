#!/usr/bin/env node
// TribeCode stdio <-> HTTP MCP bridge, for Claude Desktop and any MCP client that only speaks stdio.
// Zero dependencies. Reads JSON-RPC lines on stdin, POSTs each to the tribe's /mcp endpoint with the
// Bearer key, and writes the answers to stdout (notifications get no answer). It never prints the key.
//
//   TRIBE_TOKEN=<key> node scripts/mcp-stdio.js http://localhost:4747/mcp
//
// claude_desktop_config.json (the agents hub writes this for you, with absolute paths):
//   { "mcpServers": { "tribecode": { "command": "node", "args": ["/path/to/mcp-stdio.js", "http://localhost:4747/mcp"],
//                                    "env": { "TRIBE_TOKEN": "<key>" } } } }
'use strict';
require('../server/agentshub.js').runBridge();
