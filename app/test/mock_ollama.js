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
      if (prompt.includes('WEBSITE COPY')) {   // feat/customize: the site generator's "Write it for me" (one field has a hype word: it must be dropped)
        const cur = JSON.parse((prompt.split('Current copy (JSON):\n')[1] || '{}').split('\n')[0] || '{}');
        response = '<think>plan</think>' + JSON.stringify({ hero: { kicker: cur.hero && cur.hero.kicker, dek: 'Jump through three small levels with a friend on the couch!!' }, story: { title: 'Why we made it', body: 'A revolutionary platformer that will unleash your creativity.' },
          features: (cur.features || []).map((f, i) => ({ title: f.title, body: `Brain line ${i + 1}: simple and warm.` })), play: { body: 'Open it and play right away. 🎮🎮🎮' }, faq: cur.faq, footer: cur.footer });
      }
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
    // feat/customize: stand-ins for the GitHub API (repo html_url) and its social preview image (TRIBE_GH_API / TRIBE_OG_BASE)
    let gm;
    if ((gm = req.url.match(/^\/gh\/repos\/([\w.-]+)\/([\w.-]+)$/))) { calls.push({ kind: 'gh-api' }); return res.end(JSON.stringify({ html_url: `https://github.com/${gm[1]}/${gm[2]}` })); }
    if ((gm = req.url.match(/^\/og\/1\/([\w.-]+)\/([\w.-]+)$/))) {
      calls.push({ kind: 'og', repo: `${gm[1]}/${gm[2]}` });
      const zlib = require('node:zlib'), w = 40, h = 20, raw = Buffer.alloc((w * 3 + 1) * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([36, 41, 47], y * (w * 3 + 1) + 1 + x * 3);
      const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
      const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
      res.setHeader('Content-Type', 'image/png');
      return res.end(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
    }
    res.statusCode = 404; res.end('{}');
  });
}).listen(port, () => console.log('mock ollama on', port));
