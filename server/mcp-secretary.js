// MCP tools for the Secretary (server/secretary.js), kept out of mcp.js so branches merge cleanly.
// mcp.js hooks in with one line in TOOLS:   ...require('./mcp-secretary').tools({ text, err, S, str }),
// server/index.js binds the secretary once it exists: require('./mcp-secretary').bind(secretary).
// Every call already runs in the agent's project (mcp.js scope), so requests and notes stay in that project.
'use strict';
let sec = null;

function bind(s) { sec = s; }

function tools({ text, err, S, str }) {
  const off = () => err('The secretary is not available on this server.');
  const arr = d => ({ type: 'array', items: { type: 'string' }, description: d });
  return {
    secretary_inbox: {
      description: 'Research and distill requests the tribe\'s secretary needs an agent for (it cannot browse itself). Pick one you can answer, look it up, then file short findings with secretary_file. Check it when you have spare cycles.',
      inputSchema: S({}),
      run: () => {
        if (!sec) return off();
        const list = sec.mcp.inbox();
        return text(list.length ? { requests: list, next: 'Research one, then call secretary_file with its id, 2-6 short bullet findings and your sources.' } : 'No open research requests.');
      },
    },
    secretary_file: {
      description: 'File findings for a research request from secretary_inbox. Findings are short gist bullets (no code dumps); sources are links or file paths you used. They land in the secretary\'s journal and digest at once.',
      inputSchema: S({ request_id: str('Request id from secretary_inbox, e.g. rq-ab12cd'), findings: arr('2-6 short bullets, one finding each'), sources: arr('Links or paths you used (optional)') }, ['request_id', 'findings']),
      run: (a, me) => {
        if (!sec) return off();
        try { const r = sec.mcp.file(a, me); return text(`Filed ${r.id}: ${r.findings.length} finding${r.findings.length === 1 ? '' : 's'} are in today's secretary journal.`); } catch (e) { return err(e.message); }
      },
    },
    secretary_ask: {
      description: 'Ask what the team already knows (decisions, open questions, research, docs, tasks): the secretary answers from its journal, digest and the docs. Use it before re-asking humans.',
      inputSchema: S({ question: str('Your question in one line') }, ['question']),
      run: async ({ question }, me) => {
        if (!sec) return off();
        try { const r = await sec.mcp.ask(question, me); return text(`${r.answer}${r.sources.length ? `\n\nSources: ${r.sources.join(', ')}` : ''}`); } catch (e) { return err(e.message); }
      },
    },
  };
}

module.exports = { bind, tools };
