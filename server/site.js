// The TribeCode website on GitHub Pages as the friend entry point.
// Invite links look like https://<owner>.github.io/TribeCode/go.html#s=<host address>&c=<code>: a stable,
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
  const candidate = guess();
  function probe() {
    if (!candidate) return;
    checked = Date.now();
    const req = https.get(`${candidate}/go.html`, { timeout: 8000, headers: { 'user-agent': 'TribeCode' } }, res => {
      res.resume();
      const ok = res.statusCode === 200;
      if (ok && !site) log(`  Site:     ${candidate} (friend links go through it)`);
      site = ok ? candidate : null;
    });
    req.on('error', () => { site = null; }); req.on('timeout', () => req.destroy());
  }
  if (process.env.TRIBE_TEST_SITE) site = process.env.TRIBE_TEST_SITE;   // tests point at a local copy
  else if (candidate && !process.env.TRIBE_TEST) { probe(); setInterval(probe, 10 * 60_000).unref(); }
  // Only public https hosts go through the site: a Wi-Fi address gains nothing from the extra hop.
  const joinLink = (base, code) => (site && /^https:/.test(base) ? `${site}/go.html#s=${encodeURIComponent(base)}&c=${encodeURIComponent(code)}` : `${base}/join/${code}`);
  return { url: () => site, candidate, joinLink };
};
