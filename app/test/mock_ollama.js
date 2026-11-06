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
      calls.push({ model, kind: prompt.includes('TL;DR') ? 'summary' : prompt.includes('standup') ? 'standup' : 'vision' });
      let response = 'ok';
      if (prompt.includes('TL;DR')) response = '<think>hmm</think>Co-op pixel game design.\nCampfires save the shared world.';
      else if (prompt.includes('standup')) response = '- Orion: set up the board and VISION.md\n- Maya: asked for controller support\nBlocked: nothing';
      else if (prompt.includes('fit the vision')) response = /battle|competitive|pvp/i.test(prompt.split('Proposal:')[1] || '') ? 'CONFLICTS\nThe vision says never competitive.' : 'FITS\nIt supports cozy co-op play.';
      return res.end(JSON.stringify({ model, response, done: true }));
    }
    if (req.url === '/calls') return res.end(JSON.stringify(calls));
    res.statusCode = 404; res.end('{}');
  });
}).listen(port, () => console.log('mock ollama on', port));
