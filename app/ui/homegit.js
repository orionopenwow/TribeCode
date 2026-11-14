// Connect GitHub, on Home › Code (feat/shell-polish). A clear panel above "Code you're in": why GitHub (repos, pushes,
// pull requests, agents), what TribeCode found right now (GET /api/github/detect, through setuplocal.js), and, until you're
// connected, the three ways in: Sign in with GitHub, a fine-grained token (exact permissions), or git + the GitHub CLI
// (`gh auth login`, per-OS commands). The guide itself is setuplocal.js's (TribeLocalSetup.github.guide), not a copy.
// "Check again" re-checks; so does coming back to the window. Connected: the account and the tribe's GitHub repos.
//   window.TribeHomeGit = { mount(el, { repos }) , refresh() }
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (n, s = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, s) : '');
  const G = () => window.TribeLocalSetup && window.TribeLocalSetup.github && window.TribeLocalSetup.github.guide;
  const WHY = [['git', 'Repos', 'Your code lives in a GitHub repo you own, not on one computer.'], ['upload', 'Pushes', 'Saved changes go up on their own, so friends always have the latest.'],
    ['merge', 'Pull requests', 'Bigger changes arrive as a PR to review before they merge.'], ['agent', 'Agents', 'Claude Code and your friends\' agents work from the same repo.']];
  const VIA = { oauth: 'TribeCode\'s GitHub sign-in', gh: 'the GitHub CLI on this computer', git: 'a saved git login on this computer', browser: 'a token in this browser' };
  let root = null, last = null, repos = null, busy = false;

  const who = d => { const sv = d.server || {}; return (sv.oauth && sv.oauth.login) || (sv.gh && sv.gh.signedIn && sv.gh.user) || ''; };
  function ghRepos() {
    return (repos || []).filter(r => r.repo && r.repo.remote && /^[\w.-]+\/[\w.-]+$/.test(String(r.repo.remote).replace(/^github\.com\//, '')))
      .map(r => ({ name: r.name, slug: String(r.repo.remote).replace(/^github\.com\//, '').replace(/\.git$/, '') }));
  }
  function head(d) {
    const on = !!(d && d.ready);
    const state = !d ? `<span class="hgh-st is-wait">${ico('refresh', 16)}Checking…</span>`
      : on ? `<span class="hgh-st is-on">${ico('check', 16)}Connected${who(d) ? ` as <b>@${esc(who(d))}</b>` : ''}</span>`
      : `<span class="hgh-st is-off">${ico('x', 16)}Not connected</span>`;
    return `<div class="sec-head hgh-head"><div><span class="eyebrow">GitHub</span><h2>${on ? 'GitHub is connected' : 'Connect GitHub'}</h2></div>${state}</div>`;
  }
  const why = () => `<ul class="hgh-why" aria-label="Why connect GitHub">${WHY.map(([i, t, d]) => `<li>${ico(i, 20)}<span><b>${esc(t)}</b><small>${esc(d)}</small></span></li>`).join('')}</ul>`;
  function connected(d) {
    const list = ghRepos(), login = who(d);
    return `<div class="hgh-acct">${ico('github', 20)}<span><b>${login ? '@' + esc(login) : 'Signed in'}</b><small>through ${esc(VIA[d.ready] || 'GitHub')}</small></span>
        ${login ? `<a class="btn sm" href="https://github.com/${esc(login)}" target="_blank" rel="noopener noreferrer">Open on GitHub ${ico('external', 16)}</a>` : ''}</div>
      <div class="hgh-repos" id="hgh-repos"><span class="eyebrow">Your tribe's GitHub repos</span>${list.length
        ? `<ul>${list.map(r => `<li><a href="https://github.com/${esc(r.slug)}" target="_blank" rel="noopener noreferrer">${ico('git', 16)}<span><b>${esc(r.slug)}</b><small>${esc(r.name)}</small></span>${ico('external', 16)}</a></li>`).join('')}</ul>`
        : '<p class="faint">None yet. A project gets its GitHub repo when you create its code repository (the project\'s Dashboard › Create the code repository).</p>'}</div>
      <div class="hgh-acts"><button type="button" class="btn sm" id="hgh-recheck">${ico('refresh', 16)}<span>Check again</span></button></div>`;
  }
  function draw() {
    if (!root || !root.isConnected) return;
    const d = last, g = G();
    if (!g) { root.innerHTML = `${head({ ready: null, server: null })}${why()}<p class="faint">Open Settings › GitHub to sign in.</p>`; return; }
    if (!d) { root.innerHTML = `${head(null)}${why()}`; return; }
    root.innerHTML = d.ready ? `${head(d)}${connected(d)}`
      : `${head(d)}${why()}<p class="hgh-lead">Three ways in. Pick one; each takes a minute.</p><div class="hgh-guide">${g.html(d)}</div>
        <p class="ph-err hidden" id="hgh-err" role="alert"></p>
        <div class="hgh-acts"><button type="button" class="btn primary" id="hgh-recheck">${ico('refresh', 16)}<span>Check again</span></button></div>`;
    const err = t => { const e = root.querySelector('#hgh-err'); if (e) { e.textContent = t; e.classList.toggle('hidden', !t); } };
    if (!d.ready) g.bind(root, err, q => check(q, err));
    const b = root.querySelector('#hgh-recheck'); if (b) b.onclick = () => check(false, err);
  }
  async function check(quiet, err) {
    const g = G(); if (!g || busy) return; busy = true;
    const b = root && root.querySelector('#hgh-recheck'); if (b && !quiet) { b.disabled = true; b.lastElementChild.textContent = 'Checking…'; }
    let d = null; try { d = await g.detect(true); } catch {}
    busy = false;
    const was = last && last.ready; last = d || { browser: false, server: null, ready: null };
    draw();
    if (!quiet && !last.ready && err) { const e = root && root.querySelector('#hgh-err'); if (e) { e.textContent = 'Still not connected. Finish one of the ways above, then Check again.'; e.classList.remove('hidden'); } }
    if (last.ready && !was && !quiet && window.TribeApp && window.TribeApp.toast) window.TribeApp.toast('GitHub is connected');
  }
  function mount(el, o = {}) {
    root = el; if (o.repos) repos = o.repos;
    root.classList.add('hgh'); root.setAttribute('aria-label', 'Connect GitHub');
    draw(); check(true);
  }
  function setRepos(list) { repos = list; if (last && last.ready) draw(); }
  addEventListener('focus', () => { if (root && root.isConnected && !(last && last.ready)) check(true); });
  addEventListener('tribe:github', () => { if (root && root.isConnected) check(true); });
  window.TribeHomeGit = { mount, setRepos, refresh: () => check(true) };
})();
