// MCP tools for the person view (server/people.js), kept out of mcp.js so branches merge cleanly.
// mcp.js hooks in with two lines:
//   TOOLS:        ...require('./mcp-people').tools({ text, err, S, str }),
//   tools/call:   require('./mcp-people').log(me, params.name, args);   (inside the project scope)
// server/index.js binds the people instance once it exists: require('./mcp-people').bind(people).
'use strict';
let people = null;

function bind(p) { people = p; }

function log(me, tool, args) {
  if (!people) return;
  try { people.logAgentCall(me, tool, args || {}); } catch (e) { console.error('people log: ' + e.message); }
}

function tools({ text, err, S, str }) {
  const off = () => err('The person view is not available on this server.');
  return {
    share_prompt: {
      description: 'Share a one-line summary of the prompt or request you are working on, so your teammates see it on your person card in TribeCode (not the full prompt; no secrets). Call it when you start something new.',
      inputSchema: S({ summary: str('One line: what you were asked to do, e.g. "Add a pause menu to the title screen"') }, ['summary']),
      run: ({ summary }, me) => {
        if (!people) return off();
        if (me.role !== 'agent') return err('Only agents share prompts.');
        try { people.sharePrompt(me, summary); return text('Shared. Teammates see it on your person card.'); } catch (e) { return err(e.message); }
      },
    },
    report_context: {
      description: 'Report how full your context window is and what you are focused on. Humans see a thin bar and your focus line on your person card. Call it now and then, for example between steps.',
      inputSchema: S({ used_pct: { type: 'number', description: 'Context window used, 0-100 (optional)' }, focus: str('What you are focused on right now, one line') }, ['focus']),
      run: (a, me) => {
        if (!people) return off();
        if (me.role !== 'agent') return err('Only agents report context.');
        const c = people.reportContext(me, a || {});
        return text(`Noted${c.pct !== null && c.pct !== undefined ? ` (${c.pct}% used)` : ''}: ${c.focus || 'no focus line'}.`);
      },
    },
  };
}

module.exports = { bind, log, tools };
