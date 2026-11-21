// Run your own server (p10, docs/ONLINE-MODES.md). Advanced, for people who want their tribe on a computer that stays on
// (a home PC, a Raspberry Pi, a small VPS), or friends connected straight to their computer over Tailscale.
//   1. Keep it running somewhere that stays on: the exact command (Docker, or Node + git), then paste its address and
//      setup code here. TribeCloudHome.connect() claims the empty server (POST /api/bootstrap), the same step as Free cloud.
//      A tribe that lives only on this device moves there (setuplocal importTo); a tribe that is already shared opens
//      the new one beside it (a backup from Settings brings files across).
//   2. Peer to peer over Tailscale: Tailscale links your devices directly and privately (WireGuard). Friends you add to
//      your Tailscale network open this computer's Tailscale address. Honest limits: the computer that runs the tribe
//      must be on, and the tribe's data lives on it. Every friend keeping a full copy and syncing directly is NOT built.
// Public: window.TribeOwnServer = { open(), commands(code) }
(function () {
  'use strict';
  const C = () => window.TribeClient, UI = () => window.TribeUI, CH = () => window.TribeCloudHome;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (s, v) => { let t = window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s; if (v) for (const k in v) t = t.split('{' + k + '}').join(v[k]); return t; };
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const REPO = 'https://github.com/orionopenwow/TribeCode.git';

  // The setup code people choose: long and random, so a stranger can't claim the empty server first.
  const makeCode = () => { const a = new Uint8Array(12); (crypto.getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; })); return Array.from(a, b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); };
  // Exactly what to run. TRIBE_CLOUD=1 turns on claiming with the setup code from another device (server/index.js).
  function commands(code) {
    return {
      docker: `git clone ${REPO} && cd TribeCode\ndocker build -t tribecode .\ndocker run -d --name tribecode --restart unless-stopped -p 4747:4747 -v tribecode-data:/data -e TRIBE_SETUP_CODE=${code} tribecode`,
      node: `git clone ${REPO} && cd TribeCode\nTRIBE_CLOUD=1 TRIBE_SETUP_CODE=${code} npm start`,
    };
  }

  let sh = null;
  function open() {
    if (!UI() || !UI().sheet) return;
    if (sh && sh.close) sh.close();
    const code = makeCode(), cmd = commands(code), D = window.TribeStatus && window.TribeStatus.now();
    const body = `<div class="os">
      ${D ? `<p class="os-now"><span class="ts-dot" data-tone="${esc(D.tone)}" aria-hidden="true"></span><span><b>${esc(T('Right now'))}:</b> ${esc(D.label)}</span></p>` : ''}
      <section class="os-sec" id="os-stay">
        <span class="eyebrow">${esc(T('Option 1'))}</span><h4>${esc(T('On a computer that stays on'))}</h4>
        <p class="os-lead">${esc(T('A home PC, a Raspberry Pi or a small server. Friends get in any time, even when your own computer is off.'))}</p>
        <div class="os-seg" role="tablist" aria-label="${esc(T('How to run it'))}">
          <button type="button" role="tab" class="on" aria-selected="true" data-os-kind="docker">Docker</button>
          <button type="button" role="tab" aria-selected="false" data-os-kind="node">Node and git</button>
        </div>
        <div class="os-cmd"><pre id="os-cmd-text">${esc(cmd.docker)}</pre><button type="button" class="btn" id="os-copy">${esc(T('Copy'))}</button></div>
        <p class="os-small" id="os-cmd-note">${esc(T('Needs Docker and git. It restarts by itself and keeps the tribe in a Docker volume.'))}</p>
        <p class="os-small">${esc(T('Your setup code is in the command. Keep it private: it is how you claim the new server.'))} <code id="os-code">${esc(code)}</code></p>
        <h5>${esc(T('Then connect to it'))}</h5>
        <label class="ph-lab" for="os-addr">${esc(T('Its address'))}</label>
        <input class="input" id="os-addr" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="http://192.168.1.20:4747 or https://tribe.example.com">
        <label class="ph-lab" for="os-setup">${esc(T('Setup code'))}</label>
        <input class="input" id="os-setup" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(code)}">
        <p class="os-err hidden" id="os-err" role="alert"></p>
        <div class="os-acts"><button type="button" class="btn primary" id="os-go">${esc(T('Connect'))}</button></div>
        <p class="os-small">${esc(T('For friends outside your home network, put it behind HTTPS (Caddy works) or use Tailscale below. Voice on phones needs HTTPS.'))}</p>
      </section>
      <section class="os-sec" id="os-p2p">
        <span class="eyebrow">${esc(T('Option 2 · Advanced'))}</span><h4>${esc(T('Peer to peer over Tailscale'))}</h4>
        <p class="os-lead">${esc(T('Tailscale links your devices directly and privately. Add friends to your Tailscale network and they open this computer’s Tailscale address. No cloud in between.'))}</p>
        <div class="os-ts" id="os-ts"><span class="faint">${esc(T('Looking for Tailscale…'))}</span></div>
        <ul class="os-limits">
          <li>${esc(T('The computer that runs the tribe has to be on.'))}</li>
          <li>${esc(T('The first time, a friend needs the address or an invite link.'))}</li>
          <li>${esc(T('Not built yet: every friend keeping a full copy that syncs directly. Today one computer runs the tribe and the others connect to it.'))}</li>
        </ul>
      </section>
    </div>`;
    sh = UI().sheet({ id: 'os-sheet', wide: true, eyebrow: 'Advanced', title: 'Run your own server', body });
    const root = document.getElementById('os-sheet'); if (!root) return;
    const q = s => root.querySelector(s);
    let kind = 'docker';
    root.querySelectorAll('[data-os-kind]').forEach(b => b.onclick = () => {
      kind = b.dataset.osKind;
      root.querySelectorAll('[data-os-kind]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
      q('#os-cmd-text').textContent = cmd[kind];
      q('#os-cmd-note').textContent = kind === 'docker' ? T('Needs Docker and git. It restarts by itself and keeps the tribe in a Docker volume.') : T('Needs Node 22 and git. The tribe lives in ~/TribeCode. Keep it running with your system’s service manager.');
    });
    q('#os-copy').onclick = async () => { try { await navigator.clipboard.writeText(cmd[kind]); toast(T('Copied')); } catch { toast(cmd[kind]); } };
    q('#os-go').onclick = () => go(root);
    tailscale(q('#os-ts'));
  }

  async function go(root) {
    const q = s => root.querySelector(s), err = q('#os-err'), btn = q('#os-go');
    const say = m => { err.textContent = m || ''; err.classList.toggle('hidden', !m); };
    say(''); btn.disabled = true; btn.textContent = T('Connecting…');
    try {
      if (!CH() || !CH().connect) throw new Error(T('This part did not load. Reload the app.'));
      const me = (window.TribeStore && window.TribeStore.get()) || {};
      const c = await CH().connect({ value: q('#os-addr').value, code: q('#os-setup').value, name: me.name, color: me.color });
      const O = window.TribeOffline, L = window.TribeLocalSetup;
      if (O && O.solo && O.solo() && L && L.host && L.host.importTo) {   // a tribe kept only on this device moves there
        await L.host.importTo(c.server, c.token, { hosting: false, place: T('on your own server'), step: t => { btn.textContent = t; } });
        return;
      }
      if (window.TribeStore) window.TribeStore.set({ server: { url: c.server, token: c.token }, hosting: false });
      toast(T('Connected. Opening your server’s tribe. Your other tribe stays where it is.'));
      setTimeout(() => location.reload(), 400);
    } catch (e) {
      say(e && e.message || String(e)); btn.disabled = false; btn.textContent = T('Connect');
      const f = q(e && e.field === 'code' ? '#os-setup' : '#os-addr'); if (f) f.focus();
    }
  }

  async function tailscale(box) {
    let h = null; try { h = await C().api('/health'); } catch {}
    const ts = ((h && h.lan) || []).find(x => x.kind === 'tailscale');
    if (ts) {
      box.innerHTML = `<div class="os-cmd"><code>${esc(ts.url)}</code><button type="button" class="btn" id="os-ts-copy">${esc(T('Copy'))}</button></div>
        <p class="os-small">${esc(T('This computer’s Tailscale address. Friends on your Tailscale network open it, or use an invite link made while it’s on.'))}</p>`;
      box.querySelector('#os-ts-copy').onclick = async () => { try { await navigator.clipboard.writeText(ts.url); toast(T('Copied')); } catch { toast(ts.url); } };
    } else {
      box.innerHTML = `<p class="os-small">${esc(T('Tailscale isn’t running on the computer that runs this tribe. Install it from tailscale.com, run tailscale up, then open this again.'))}</p>
        <div class="os-acts"><a class="btn" href="https://tailscale.com/download" target="_blank" rel="noopener">${esc(T('Get Tailscale'))}</a></div>`;
    }
  }

  window.TribeOwnServer = { open, commands };
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [{ kind: 'Action', label: 'Run your own server', keys: 'server host self hosted docker raspberry pi vps always on tailscale peer p2p', run: open }]);
})();
