// Tiny stand-in for Ollama used by the tests: /api/tags and /api/generate with canned answers.
'use strict';
const http = require('node:http');
const port = Number(process.argv[2] || 11555);
const calls = [];
http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'llama3:8b' }, { name: 'qwen3:8b' }] }));
    if (req.url === '/api/generate') {
      const { prompt = '', model } = JSON.parse(body || '{}');
      calls.push({ model, kind: prompt.includes('Meeting transcript:') ? 'meeting' : prompt.includes('Clean up this note') ? 'refine' : prompt.includes('Suggest a first project') ? 'start' : prompt.includes('Question from') ? 'brain' : prompt.includes('TL;DR') ? 'summary' : prompt.includes('standup') ? 'standup' : 'vision' });
      let response = 'ok';
      const sys = JSON.parse(body || '{}').system || '';
      if (sys.includes('You are Flint')) response = '<think>hmm</think>Hi, Flint here. The room looks calm.';   // feat/flint
      if (response !== 'ok') {}
      else if (prompt.includes('Clean up this note')) response = 'Lantern flicker: randomize the glow a little every frame.';
      else if (prompt.includes('Suggest a first project')) response = 'Lantern Garden\n- Sketch the garden map\n- Make lanterns glow at night\n- Invite a friend to plant one';
      else if (prompt.includes('Question from')) response = 'Maya is building the campfire save point.';
      else if (prompt.includes('Meeting transcript:')) response = '<think>notes</think>## Summary\nThe crew planned the campfire save points and the fishing mini-game.\n\n## Decisions\n- Save points use campfires, not menus.\n\n## Action items\n- [ ] Maya: Build the campfire save point\n- [ ] Orion: Write the fishing mini-game spec\n- [ ] Unassigned: Pick a soundtrack';
      else if (prompt.includes('Bug report:')) response = 'high sync';
      else if (prompt.includes('TL;DR')) response = '<think>hmm</think>Co-op pixel game design.\nCampfires save the shared world.';
      else if (prompt.includes('standup')) response = '- Orion: set up the board and VISION.md\n- Maya: asked for controller support\nBlocked: nothing';
      else if (prompt.includes('fit the vision')) response = /battle|competitive|pvp/i.test(prompt.split('Proposal:')[1] || '') ? 'CONFLICTS\nThe vision says never competitive.' : 'FITS\nIt supports cozy co-op play.';
      return res.end(JSON.stringify({ model, response, done: true }));
    }
    if (req.url === '/calls') return res.end(JSON.stringify(calls));
    res.statusCode = 404; res.end('{}');
  });
}).listen(port, () => console.log('mock ollama on', port));
