// Where templates/ lives (v0.27). From a checkout it's <repo>/templates next to server/. In the desktop app the server
// is one bundled file beside the app, and templates/ ships as a Tauri resource next to ui/ (tauri.conf.json
// "resources"), so look beside the --ui folder too. TRIBE_TEMPLATES overrides. Returns the templates folder path.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
let found = null;
module.exports = function tpldir(...parts) {
  if (!found) {
    const argv = process.argv, i = argv.indexOf('--ui'), ui = (i > 0 && argv[i + 1]) || process.env.TRIBE_UI || '';
    const cands = [process.env.TRIBE_TEMPLATES, path.join(__dirname, '..', 'templates'), ui && path.join(path.resolve(ui), '..', 'templates'), path.join(path.dirname(process.execPath), 'templates'), path.join(path.dirname(process.execPath), 'resources', 'templates')].filter(Boolean);
    found = cands.find(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } }) || cands[1];
  }
  return path.join(found, ...parts);
};
module.exports.root = () => path.dirname(module.exports());   // the folder that holds templates/ (shelf, assets, market read <root>/templates/…)
