// The TribeCode website on GitHub Pages as the friend entry point.
// Invite links look like https://tribecode.org/app/go.html#s=<host address>&c=<code> (a fork: https://<owner>.github.io/<repo>/app/go.html…): a stable,
// recognizable address that detects the device, explains what's happening, says clearly when the host's
// computer is offline, and then hands off to the host's own server (where the account, the Home Screen
// app and notifications live). Used only once the Pages site actually answers, so links never break.
//   --site <url> | TRIBE_SITE=<url>   (default: the GitHub Pages address of this repo's origin remote)
//   --site off                        (plain links to the host)
'use strict';
const https = require('node:https');
const { execFileSync } = require('node:child_process');

module.exports = function makeSite({ args = {}, root, log = () => {} }) {
  let site = null, checked = 0;
  const configured = String(args.site || process.env.TRIBE_SITE || '').trim();
  function guess() {
    if (configured === 'off') return null;
    if (configured) return configured.replace(/\/+$/, '');
    try {   // github.com/<owner>/<repo>(.git) -> https://<owner>.github.io/<repo>
      const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).trim();
      const m = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/);
      if (m) return `https://${m[1].toLowerCase()}.github.io/${m[2]}`;
    } catch {}
    return 'https://orionopenwow.github.io/TribeCode';
  }
  // TribeCode's own repo has its own domain (tribecode.org, the same Pages site); a fork uses its github.io address.
  const own = c => c && /^https:\/\/orionopenwow\.github\.io\/TribeCode$/i.test(c);
  const candidates = configured ? [guess()] : own(guess()) ? ['https://tribecode.org', guess()] : [guess()];
  const candidate = candidates[0];
  function check(base, path) {
    return new Promise(done => {
      const req = https.get(`${base}${path}`, { timeout: 8000, headers: { 'user-agent': 'TribeCode' } }, res => { res.resume(); done(res.statusCode === 200); });
      req.on('error', () => done(false)); req.on('timeout', () => { req.destroy(); done(false); });
    });
  }
  async function probe() {
    if (!candidate) return;
    checked = Date.now();
    for (const c of candidates) {
      // the app (and its go.html) lives at /app/ since v0.10.3; older deployments had it at the root
      if (await check(c, '/app/go.html') || await check(c, '/go.html')) { if (site !== c) log(`  Site:     ${c} (friend links go through it)`); site = c; return; }
    }
    site = null;
  }
  if (process.env.TRIBE_TEST_SITE) site = process.env.TRIBE_TEST_SITE;   // tests point at a local copy
  else if (candidate && !process.env.TRIBE_TEST) { probe(); setInterval(probe, 10 * 60_000).unref(); }
  // Only public https hosts go through the site: a Wi-Fi address gains nothing from the extra hop.
  const joinLink = (base, code) => (site && /^https:/.test(base) ? `${site}/app/go.html#s=${encodeURIComponent(base)}&c=${encodeURIComponent(code)}` : `${base}/join/${code}`);
  return { url: () => site, candidate, joinLink };
};
