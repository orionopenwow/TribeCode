// Drift radar: compares every branch in the project repo with the main line, so the tribe can
// see who is behind, who is ahead, and which branches aren't tied to an approved task.
'use strict';
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function drift({ repo, getTasks, members }) {
  const git = args => new Promise((res, rej) => execFile('git', args, { cwd: repo, timeout: 20_000, maxBuffer: 4 << 20 }, (e, out, err) => (e ? rej(new Error((err || e.message).trim())) : res(out.trim()))));
  let lastFetch = 0;

  async function mainBranch() {
    for (const b of ['main', 'master', 'trunk']) { try { await git(['rev-parse', '--verify', '--quiet', b]); return b; } catch {} }
    return (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  }

  async function radar() {
    if (!repo || !fs.existsSync(path.join(repo, '.git'))) return { enabled: false, reason: 'Start the server with --repo <path to your project> to see the drift radar.' };
    if (Date.now() - lastFetch > 5 * 60_000) { lastFetch = Date.now(); git(['fetch', '--all', '--prune', '--quiet']).catch(() => {}); }
    const main = await mainBranch();
    const refs = (await git(['for-each-ref', '--format=%(refname:short)|%(authorname)|%(committerdate:iso8601)', 'refs/heads', 'refs/remotes'])).split('\n').filter(Boolean)
      .map(l => { const [ref, author, date] = l.split('|'); return { ref, author, date }; })
      .filter(r => !/\/HEAD$/.test(r.ref) && r.ref !== main && r.ref !== `origin/${main}`);
    const seen = new Set(); const tasks = getTasks();
    const rows = [];
    for (const r of refs) {
      const short = r.ref.replace(/^origin\//, ''); if (seen.has(short)) continue; seen.add(short);
      let behind = 0, ahead = 0, files = [];
      try { [behind, ahead] = (await git(['rev-list', '--left-right', '--count', `${main}...${r.ref}`])).split(/\s+/).map(Number); } catch {}
      try { files = (await git(['diff', '--name-only', `${main}...${r.ref}`])).split('\n').filter(Boolean); } catch {}
      const task = tasks.find(t => short.includes(t.id) || short.endsWith('/' + slugish(t.title)) || short === slugish(t.title));
      const member = members().find(m => m.name.toLowerCase() === String(r.author).toLowerCase() || short.toLowerCase().startsWith(m.name.toLowerCase() + '/'));
      const days = Math.floor((Date.now() - Date.parse(r.date)) / 86400_000);
      const level = behind > 20 || (!task && ahead > 0 && files.length > 10) ? 'drifting' : behind > 5 || !task ? 'watch' : 'ok';
      rows.push({ branch: short, author: r.author, member: member ? member.id : null, behind, ahead, files: files.length, sample: files.slice(0, 5), allFiles: files.slice(0, 500), lastCommit: r.date, days, task: task ? { id: task.id, title: task.title, status: task.status } : null, level });
    }
    const order = { drifting: 0, watch: 1, ok: 2 };
    rows.sort((a, b) => order[a.level] - order[b.level] || b.behind - a.behind);
    return { enabled: true, main, branches: rows, checked: new Date().toISOString() };
  }
  const slugish = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { radar };
};
