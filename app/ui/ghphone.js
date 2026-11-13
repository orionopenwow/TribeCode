// GitHub from a phone, no server (feat/mobile-complete, docs/MOBILE-COMPLETE.md, docs/AUTH-PLAN.md).
// GitHub's REST API answers browsers directly (CORS) when a token is sent, so a phone-only tribe can bring a repo in,
// edit its files (Files › Code, phonelocal.js keeps them) and push a commit back with the Git Data API:
//   blobs (POST /git/blobs) -> tree on the old one (POST /git/trees) -> commit (POST /git/commits) -> move the branch
//   (PATCH /git/refs/heads/<branch>). Pull re-reads the tree and takes what changed there, keeping your unpushed edits.
// Sign-in: a fine-grained personal access token (Contents: read and write) kept only on this device, the same one
// setuplocal.js uses (localStorage 'tribecode.light.ghToken'). GitHub's OAuth device flow has no CORS, so "Sign in with
// GitHub" needs a host or a future TribeCode backend: that plugs in at authProvider (below) and nowhere else.
// Public: window.TribeGhPhone = { open(), getToken(), setToken(t), login(), authProvider, importRepo(repo, branch),
//   push(message), pull(), status(), disconnect() }
(function () {
  'use strict';
  const GH = 'https://api.github.com', TKEY = 'tribecode.light.ghToken', LKEY = 'tribecode.ghphone.login';
  const MAX_FILES = 300, MAX_BYTES = 1.5 * 1024 * 1024, MAX_FILE = 256 * 1024;
  const TEXT = /\.(html?|css|js|mjs|cjs|ts|tsx|jsx|json|md|txt|svg|xml|ya?ml|toml|py|rb|go|rs|java|kt|swift|c|h|cpp|cs|php|sh|lua|gd|glsl|csv|ini|cfg|gitignore|editorconfig|env\.example|vue|svelte|astro)$/i;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const PL = () => window.TribePhoneLocal;
  const OFF = () => window.TribeOffline;
  const rawFetch = (u, o) => (OFF() && OFF().realFetch ? OFF().realFetch(u, o) : fetch(u, o));

  // The one place real sign-in plugs in later (docs/AUTH-PLAN.md): a function that resolves to a token, e.g. from a
  // TribeCode accounts backend or the host's GitHub OAuth. Until then: the personal token on this device.
  const api = { authProvider: null };
  function getToken() { try { return localStorage.getItem(TKEY) || ''; } catch { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(TKEY, t) : localStorage.removeItem(TKEY); localStorage.removeItem(LKEY); } catch {} }
  const login = () => { try { return localStorage.getItem(LKEY) || ''; } catch { return ''; } };
  async function token() { if (typeof api.authProvider === 'function') { try { const t = await api.authProvider(); if (t) return t; } catch {} } return getToken(); }

  async function gh(path, opts = {}) {
    const t = opts.token || await token(); if (!t) throw Object.assign(new Error(T('Connect GitHub first.')), { status: 401 });
    const r = await rawFetch(GH + path, { method: opts.method || 'GET', headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const d = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.message || `GitHub said ${r.status}`), { status: r.status });
    return d;
  }
  const b64dec = s => { const bin = atob(String(s || '').replace(/\n/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };
  const store = () => { const c = PL() && PL().code(); if (!c) throw new Error(T('Start a project on this phone first.')); return c; };

  async function connect(t) {
    const me = await gh('/user', { token: t });
    setToken(t); try { localStorage.setItem(LKEY, me.login || ''); } catch {}
    return me.login;
  }
  async function readTree(repo, branch) {
    const ref = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const head = ref.object.sha, commit = await gh(`/repos/${repo}/git/commits/${head}`);
    const tree = await gh(`/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
    return { head, tree: (tree.tree || []).filter(x => x.type === 'blob') };
  }
  async function importRepo(repo, branch) {
    repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(T('Type it like owner/repo.'));
    const info = await gh(`/repos/${repo}`); branch = branch || info.default_branch || 'main';
    const { head, tree } = await readTree(repo, branch);
    const c = store(), files = {}; let bytes = 0, skipped = 0;
    for (const x of tree) {
      if (!TEXT.test(x.path) || (x.size || 0) > MAX_FILE) { skipped++; continue; }
      if (Object.keys(files).length >= MAX_FILES || bytes + (x.size || 0) > MAX_BYTES) { skipped++; continue; }
      const blob = await gh(`/repos/${repo}/git/blobs/${x.sha}`);
      files[x.path] = { text: blob.encoding === 'base64' ? b64dec(blob.content) : String(blob.content || ''), sha: x.sha, at: new Date().toISOString() };
      bytes += x.size || 0;
    }
    c.files = files; c.github = { repo, branch, head, at: new Date().toISOString(), skipped };
    c.log.unshift({ sha: head.slice(0, 7), author: 'GitHub', at: new Date().toISOString(), subject: `Brought in ${repo} (${branch})`, path: '' });
    PL().save(); fire();
    return { files: Object.keys(files).length, skipped, repo, branch };
  }
  async function push(message) {
    const c = store(), g = c.github; if (!g) throw new Error(T('Bring a repo in first, or link one.'));
    const changed = Object.entries(c.files).filter(([, f]) => f.dirty);
    if (!changed.length) return { pushed: 0, sha: g.head };
    const ref = await gh(`/repos/${g.repo}/git/ref/heads/${encodeURIComponent(g.branch)}`), remote = ref.object.sha;
    if (remote !== g.head) {   // someone pushed meanwhile: only go ahead if they didn't touch the same files
      const { tree } = await readTree(g.repo, g.branch), now = new Map(tree.map(x => [x.path, x.sha]));
      const clash = changed.filter(([p, f]) => f.sha && now.get(p) && now.get(p) !== f.sha).map(([p]) => p);
      if (clash.length) throw Object.assign(new Error(T('GitHub has newer changes to') + ' ' + clash.slice(0, 3).join(', ') + '. ' + T('Pull first, then push.')), { clash });
    }
    const base = await gh(`/repos/${g.repo}/git/commits/${remote}`);
    const items = [];
    for (const [path, f] of changed) { const b = await gh(`/repos/${g.repo}/git/blobs`, { method: 'POST', body: { content: f.text || '', encoding: 'utf-8' } }); items.push({ path, mode: '100644', type: 'blob', sha: b.sha }); f.sha = b.sha; }
    const tree = await gh(`/repos/${g.repo}/git/trees`, { method: 'POST', body: { base_tree: base.tree.sha, tree: items } });
    const commit = await gh(`/repos/${g.repo}/git/commits`, { method: 'POST', body: { message: String(message || `Edits from my phone (${changed.length} file${changed.length === 1 ? '' : 's'})`).slice(0, 200), tree: tree.sha, parents: [remote] } });
    await gh(`/repos/${g.repo}/git/refs/heads/${encodeURIComponent(g.branch)}`, { method: 'PATCH', body: { sha: commit.sha } });
    for (const [, f] of changed) delete f.dirty;
    g.head = commit.sha; g.at = new Date().toISOString();
    c.log.unshift({ sha: commit.sha.slice(0, 7), author: login() || 'you', at: g.at, subject: commit.message || 'Pushed', path: '' });
    PL().save(); fire();
    return { pushed: changed.length, sha: commit.sha };
  }
  async function pull() {
    const c = store(), g = c.github; if (!g) throw new Error(T('Bring a repo in first, or link one.'));
    const { head, tree } = await readTree(g.repo, g.branch);
    let took = 0, kept = 0;
    for (const x of tree) {
      const f = c.files[x.path];
      if (f && f.sha === x.sha) continue;
      if (f && f.dirty) { kept++; continue; }
      if (!TEXT.test(x.path) || (x.size || 0) > MAX_FILE) continue;
      const blob = await gh(`/repos/${g.repo}/git/blobs/${x.sha}`);
      c.files[x.path] = { text: blob.encoding === 'base64' ? b64dec(blob.content) : '', sha: x.sha, at: new Date().toISOString() }; took++;
    }
    g.head = head; g.at = new Date().toISOString(); PL().save(); fire();
    return { took, kept };
  }
  function status() {
    let c = null; try { c = PL() && PL().code(); } catch {}
    const g = c && c.github;
    return { signedIn: !!getToken(), login: login(), repo: g ? g.repo : null, branch: g ? g.branch : null, changed: c ? Object.values(c.files).filter(f => f.dirty).length : 0, files: c ? Object.keys(c.files).length : 0, at: g ? g.at : null };
  }
  function disconnect() { setToken(''); fire(); }
  const fire = () => { try { dispatchEvent(new CustomEvent('tribe-ghphone')); } catch {} };

  // ---------- the sheet ----------
  let el = null, scrim = null;
  function close() { if (el) el.remove(); if (scrim) scrim.remove(); el = scrim = null; }
  function shell(inner) {
    close();
    scrim = document.createElement('div'); scrim.className = 'nx-scrim'; scrim.onclick = close;
    el = document.createElement('div'); el.className = 'nx-sheet gp-sheet'; el.id = 'gp-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<header class="nx-h"><div><span class="eyebrow">${esc(T('GitHub on this phone'))}</span><h3>${esc(T(inner.title))}</h3></div><button type="button" class="nx-x" data-gp-x aria-label="${esc(T('Close'))}">×</button></header>${inner.body}<p class="gp-err" id="gp-err" hidden></p>`;
    document.body.append(scrim, el);
    el.querySelector('[data-gp-x]').onclick = close;
  }
  const err = m => { const e = el && el.querySelector('#gp-err'); if (e) { e.textContent = m || ''; e.hidden = !m; } };
  const busy = (b, on, label) => { if (!b) return; b.disabled = on; if (label) b.textContent = label; };
  function open() {
    const s = status();
    if (!s.signedIn) {
      shell({ title: 'Connect GitHub', body: `<ol class="nx-steps"><li>${esc(T('On github.com open Settings › Developer settings › Fine-grained tokens › Generate new token.'))} <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">${esc(T('Open it'))}</a></li>
        <li>${esc(T('Pick the repository, then under Repository permissions set Contents to Read and write.'))}</li><li>${esc(T('Generate the token, copy it and paste it here. It stays only on this phone.'))}</li></ol>
        <input class="input" id="gp-tok" type="password" placeholder="github_pat_…" autocomplete="off" spellcheck="false" aria-label="${esc(T('Your fine-grained token'))}">
        <div class="nx-f"><button type="button" class="btn primary" id="gp-go">${esc(T('Connect'))}</button></div>` });
      const go = el.querySelector('#gp-go');
      go.onclick = async () => {
        const v = el.querySelector('#gp-tok').value.trim(); err('');
        if (!/^(github_pat_|ghp_|gho_)\w{10,}$/.test(v)) return err(T('That doesn\'t look like a GitHub token. A fine-grained one starts with github_pat_.'));
        busy(go, true, T('Checking…'));
        try { const l = await connect(v); toast(T('Connected as') + ' ' + l); open(); }
        catch (e) { busy(go, false, T('Connect')); err(e.status === 401 ? T('GitHub didn\'t accept that token. Make a new one and paste it again.') : e.message); }
      };
      return;
    }
    if (!s.repo) {
      shell({ title: 'Bring a repo in', body: `<p class="nx-why">${esc(T('Signed in as'))} <b>${esc(s.login || 'GitHub')}</b>. ${esc(T('Its text files come onto this phone: edit them in Files › Code and push your changes back.'))}</p>
        <input class="input" id="gp-repo" placeholder="owner/repo" autocapitalize="off" spellcheck="false" aria-label="${esc(T('Repository'))}">
        <input class="input gp-gap" id="gp-branch" placeholder="${esc(T('Branch (blank = the default)'))}" autocapitalize="off" spellcheck="false" aria-label="${esc(T('Branch'))}">
        <div class="nx-f"><button type="button" class="btn" id="gp-out">${esc(T('Disconnect'))}</button><button type="button" class="btn primary" id="gp-imp">${esc(T('Bring it in'))}</button></div>` });
      el.querySelector('#gp-out').onclick = () => { disconnect(); close(); toast(T('GitHub disconnected on this phone')); };
      const b = el.querySelector('#gp-imp');
      b.onclick = async () => { err(''); busy(b, true, T('Bringing it in…')); try { const r = await importRepo(el.querySelector('#gp-repo').value, el.querySelector('#gp-branch').value.trim()); toast(`${r.files} ${T('files from')} ${r.repo}${r.skipped ? ` (${r.skipped} ${T('skipped: pictures or too big')})` : ''}`); open(); } catch (e) { busy(b, false, T('Bring it in')); err(e.message); } };
      return;
    }
    shell({ title: s.repo, body: `<div class="gp-stat"><span class="gp-dot${s.changed ? ' on' : ''}" aria-hidden="true"></span><span>${s.changed ? `${s.changed} ${T(s.changed === 1 ? 'change to push' : 'changes to push')}` : T('In sync with GitHub')} · ${esc(s.branch)} · ${s.files} ${T('files')}</span></div>
      <input class="input" id="gp-msg" placeholder="${esc(T('What changed? (the commit message)'))}" aria-label="${esc(T('Commit message'))}">
      <div class="nx-f"><button type="button" class="btn" id="gp-pull">${esc(T('Pull'))}</button><button type="button" class="btn" id="gp-files">${esc(T('Open the files'))}</button><button type="button" class="btn primary" id="gp-push"${s.changed ? '' : ' disabled'}>${esc(T('Push'))}</button></div>
      <p class="nx-small">${esc(T('Pushing makes one commit on'))} ${esc(s.branch)}. <a href="https://github.com/${esc(s.repo)}" target="_blank" rel="noopener">${esc(T('See it on GitHub'))}</a></p>` });
    el.querySelector('#gp-files').onclick = () => { close(); if (window.TribeShell) window.TribeShell.go('docs'); setTimeout(() => { const t = document.querySelector('[data-tab="code"], [data-dtab="code"]'); if (t) t.click(); }, 300); };
    const pb = el.querySelector('#gp-push'), lb = el.querySelector('#gp-pull');
    pb.onclick = async () => { err(''); busy(pb, true, T('Pushing…')); try { const r = await push(el.querySelector('#gp-msg').value.trim()); toast(`${T('Pushed')} ${r.pushed} ${T(r.pushed === 1 ? 'file' : 'files')} ${T('to GitHub')}`); open(); } catch (e) { busy(pb, false, T('Push')); err(e.message); } };
    lb.onclick = async () => { err(''); busy(lb, true, T('Pulling…')); try { const r = await pull(); toast(r.took ? `${T('Took')} ${r.took} ${T('changed files from GitHub')}${r.kept ? ` · ${r.kept} ${T('kept yours')}` : ''}` : T('Already up to date')); open(); } catch (e) { busy(lb, false, T('Pull')); err(e.message); } };
  }

  Object.assign(api, { open, close, getToken, setToken, login, importRepo, push, pull, status, disconnect, connect });
  window.TribeGhPhone = api;
})();
