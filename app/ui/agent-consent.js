// The consent page for an AI app that signs in to this tribe (server/agentauth.js, GET /connect/authorize lands here
// with #rid=…): Claude on the web, ChatGPT, an editor or a CLI. The member signed in to this address approves
// "Let Cursor join as <name>'s Cursor"; the kind comes from the name the app registered under. When this browser
// isn't signed in here (the host uses the app on localhost, the app opened the public address), the page shows
// a short code to type in the app and waits. Nothing is approved without a person pressing a button.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const rid = new URLSearchParams(location.hash.replace(/^#/, '')).get('rid') || '';
  const text = (id, t) => { $(id).textContent = t; };
  const fail = t => { text('c-title', 'This sign-in can\'t continue'); text('c-lead', t); $('c-facts').hidden = true; $('c-signed').hidden = true; $('c-code').hidden = true; };
  const json = async (url, opts) => { const r = await fetch(url, opts); const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || 'That didn\'t work.'), { status: r.status }); return d; };
  // The member key this browser holds for this address (the app keeps it in its own storage), if any.
  function token() {
    try { const s = window.TribeStore && window.TribeStore.get().server; if (!s || !s.token) return ''; const u = String(s.url || '').replace(/\/+$/, ''); return !u || u === location.origin ? s.token : ''; } catch { return ''; }
  }
  const fact = (k, v) => { const li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('b'); a.textContent = k; b.textContent = v; li.append(a, b); return li; };
  let poll = 0;

  async function start() {
    if (!rid) return fail('Start again from the app you are connecting: add TribeCode there and press Connect.');
    let req; try { req = await json('/connect/request?rid=' + encodeURIComponent(rid)); } catch (e) { return fail(e.message); }
    if (req.done) return location.replace(req.redirect);
    let me = null; const t = token();
    if (t) { try { const d = await json('/api/me', { headers: { Authorization: 'Bearer ' + t } }); me = d.member || d.me || d; } catch {} }
    const who = req.kind && req.kind !== 'other' ? req.kindLabel : 'this agent';   // "Cursor", "ChatGPT"… from the name the app registered under
    if (req.kind && req.kind !== 'other' && $('c-pick')) text('c-pick', req.kindLabel);
    const facts = $('c-facts'); facts.hidden = false;
    facts.append(fact('App', req.client), fact('Returns to', req.host + (req.loopback ? ' (an app on this computer)' : '')), fact('Tribe', req.tribe));
    if (me && me.name && me.role !== 'agent') {
      const mine = `${String(me.name).slice(0, 22)}'s ${req.short || 'agent'}`.slice(0, 32);
      text('c-title', `Let ${who} join as ${mine}?`);
      $('c-lead').innerHTML = ''; $('c-lead').append('You are signed in as ', Object.assign(document.createElement('b'), { textContent: me.name }), '. Approve only if you just added TribeCode to this app yourself.');
      facts.append(fact('Joins as', mine));
      $('c-signed').hidden = false;
      const decide = async allow => {
        $('c-yes').disabled = $('c-no').disabled = true; text('c-err', '');
        try { const r = await json('/api/agent-auth', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ rid, allow }) }); text('c-title', allow ? 'Approved. Heading back…' : 'Not approved.'); location.replace(r.redirect); }
        catch (e) { text('c-err', e.message); $('c-yes').disabled = $('c-no').disabled = false; }
      };
      $('c-yes').onclick = () => decide(true); $('c-no').onclick = () => decide(false);
      return;
    }
    text('c-title', 'Approve this in TribeCode');
    text('c-lead', `${req.client} wants to join your tribe as your ${req.kind && req.kind !== 'other' ? req.short : 'AI agent'}.`);
    text('c-usercode', req.code.slice(0, 3) + ' ' + req.code.slice(3)); $('c-code').hidden = false;
    poll = setInterval(async () => {
      try { const r = await json('/connect/request?rid=' + encodeURIComponent(rid)); if (r.done) { clearInterval(poll); text('c-title', /[?&]error=/.test(r.redirect) ? 'Not approved. Heading back…' : 'Approved. Heading back…'); location.replace(r.redirect); } }
      catch (e) { if (e.status === 404) { clearInterval(poll); fail('This request ran out. Start again from the app you are connecting.'); } }
    }, 2000);
  }
  start();
})();
