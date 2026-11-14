// Invite your agent: bring your own AI agent into the tribe as easily as inviting a friend. Any agent that speaks MCP:
// Claude (Code, Desktop, on the web), Cursor, Codex CLI, ChatGPT, Gemini CLI, VS Code with Copilot, Windsurf, Cline,
// Zed, or something else. It began as Invite your Claude; an invited Claude is simply the kind "claude".
//
// One of each kind per person. Each is a member with role 'agent', owner = you, invited: true, agentKind = its kind,
//   named "<you>'s Claude", "<you>'s Cursor", "<you>'s Codex"… ("<you>'s agent" for Something else; that one can be renamed).
//   Its key: a separate, revocable member key. Only its hash is stored (tokenHash); the key is shown once.
//   Its access: yours and never more. Every request it makes runs as itself, and perms.actingRole() derives its role from
//     yours on every call (capped at builder, so no admin or host actions), so if your role drops, its access drops too.
//     Its projects follow yours on every call. "Let it act as me for admin" (adminAsMe, default off) lifts the cap to
//     admin when you are an admin or the host; host-only rows stay host-only.
//   Narrowing: scopes (chat, docs, tasks, files, website, approvals). Tools and API paths outside them are refused.
//   Pause: every request with its key is refused at once (server/index.js stillValid). Remove: the key is wiped.
//   Rate-limited (TRIBE_CLAUDE_RATE calls a minute, default 120). It never mints keys, invites, hosts, or changes its
//     own permissions. It can't read anyone's DMs (server/dm.js: only its private line with you).
//   Alongside you: presence says where it is ("in Launch plan doc"), @mentions reach inbox_next, its messages are
//     labelled with its name and you can edit or delete them (server/chatx.js).
//   Every one of those rules is the same for every kind: nothing below looks at the kind to decide what is allowed.
//
//   One per kind: this is the only way a person's agent of a kind joins. A tool that person already connected through
//     Connect your AI (POST /api/agents) counts as theirs of that kind: GET lists it as "already connected", POST re-keys
//     it instead of minting a second member, and Pause / narrowing / Remove work on it too. Two of one kind (from before
//     there was one way) both keep working; `merge` (Claude) and `dupes` (any kind) say so.
//   Nothing is made when the sheet opens: GET carries a `preview` of every setup with the key masked, and POST (the
//     sheet's Copy or Download) makes the member. One that never connected is taken out again after 24 hours (sweep).
//   Apps that sign in (Claude on the web, ChatGPT, an editor with no key in its config) go through server/agentauth.js
//     (OAuth), so no key rides in a link; `connections` lists them.
//   Setup text for every tool comes from server/agentshub.js setupFor (the one source).
//   Migration: an invited member from before kinds existed has no agentKind and is a "claude" (written back at start).
//
// HTTP (people only, your own agents only). /api/invite-claude is the old name of the same route and keeps answering;
// without a kind it means your Claude, as it always did.
//   GET    /api/invite-agent           status: agents[], kinds[], picks[], preview { setups }, plus the Claude fields
//                                      (agent, online, joined, scopes, paused, adminAsMe, claudes[], merge)
//   POST   /api/invite-agent           { kind?, pick?, id?, scopes? } makes (or re-keys) it: { token, agent, setups }
//   PUT    /api/invite-agent           { id? | kind?, scopes?, paused?, adminAsMe?, name? (Something else only) }
//   DELETE /api/invite-agent[?id=|?kind=]   Remove: the key and every sign-in stop working at once
//   DELETE /api/invite-agent/connections/<id>   end one sign-in
'use strict';
const { AGENT_KINDS, PICKS, BEHAVES, agentKindOf } = require('./agentshub');

const SCOPES = ['chat', 'docs', 'tasks', 'files', 'website', 'approvals'];
const LABEL = { chat: 'Chat', docs: 'Docs and notes', tasks: 'Tasks', files: 'Files and code', website: 'Website', approvals: 'Ask for approvals' };

// Which scope a tool belongs to. 'general' tools (overview, projects, presence, Marketplace reads) are always on.
function scopeOfTool(name) {
  const n = String(name || '');
  if (n === 'tribe_api') return null;   // decided per path
  if (/approv|^propose$/.test(n)) return 'approvals';
  if (/chat|message|^reply|inbox|vote|^agents_|mention|react/.test(n)) return 'chat';
  if (/doc|note|sheet|deck|whiteboard|journal|secretary|scratch/.test(n)) return 'docs';
  if (/^code_|^checks_|file|claim|repo|commit|branch|merge|visual|asset|capture|canvas|context/.test(n)) return 'files';
  if (/site|preview|showcase|website|publish|design/.test(n)) return 'website';
  if (/task|lane|handoff|delegat|review|recommend|gig|work|bug|plan|calendar|ship|jam/.test(n)) return 'tasks';
  return 'general';
}
// Which scope an API path (under /api) belongs to.
function scopeOfPath(p) {
  const full = String(p || '').replace(/^\/?(api\/)?/, ''), a = full.split(/[/?]/)[0];
  if (/^projects\/[^/]+\/site/.test(full)) return 'website';
  if (/^(approvals|board)$/.test(a)) return 'approvals';
  if (/^(chat|dm|channels|votes|gists|pins|notify|mentions)$/.test(a)) return 'chat';
  if (/^(docs|docsx|live|notes|scratch|whiteboard|secretary|doc-templates)$/.test(a)) return 'docs';
  if (/^(tasks|bugs|calendar|coord|plan|talent|work|ship|jam|rituals)$/.test(a)) return 'tasks';
  if (/^(code|checks|files|repo|uploads|claims|visuals|assets|captures|canvas|drift|codefiles|export)$/.test(a)) return 'files';
  if (/^(site|sites|showcase|sitedesign|site-design|site-designer|site-templates|preview|publish|website|sitelib)$/.test(a)) return 'website';
  return 'general';
}
// Never for an invited agent, whatever its owner may do: keys, invites, hosting, accounts, its own permissions.
const NEVER = /^(invite-claude|invite-agent|claude-auth|agent-auth|agents$|agents\/mine|invites|tribe-link|share|devices|host|backup|account|accounts|oauth|session|cloud|bootstrap|join|claim$|reclaim|fresh|github|connections|openspace|brain|settings\/secrets)/;
// Admin-level areas: only with "act as me for admin" (and then perms.js still checks the owner's own role).
const ADMIN = /^(perms|modes|members\/[^/]+\/role|projects\/[^/]+\/(delete|settings)|widgets)/;
// Read-only tools that stay on when the owner can only watch (spectator).
const READ_TOOL = /^(list_|read_|check_|checks_status|search_|get_|tribe_overview|where_is|inbox_next|my_lane|agents_read|market_(list|search|read))/;

module.exports = function inviteAgent({ P, getMembers, saveMembers, pushPresence, perms, hash, id, slug, str, endpoints, agentsHub, publicBase = () => null,
  postChat, sendTo, agentSeen, idleMs, publicMember, docs, store, chans, nameOf, rate = Number(process.env.TRIBE_CLAUDE_RATE) || 120, now = () => Date.now(),
  auth = () => null, staleMs = 24 * 3600_000 }) {
  const member = mid => getMembers().find(m => m.id === mid) || null;
  // Which kind an agent is: an invited one says so (none recorded = a Claude from before kinds); a Connect-your-AI key goes by its tool.
  const kindOf = ag => (ag && ag.invited ? (AGENT_KINDS[ag.agentKind] ? ag.agentKind : 'claude') : agentKindOf((ag && ag.kind) || 'claude-code'));
  const ORDER = Object.keys(AGENT_KINDS);
  const kindFrom = v => { const k = String(v || ''); if (AGENT_KINDS[k]) return k; const p = PICKS.find(x => x.id === k || x.tool === k); return p ? p.kind : null; };
  const mineAll = me => getMembers().filter(x => x.role === 'agent' && x.owner === me.id && x.invited);
  const mine = (me, kind = 'claude') => mineAll(me).find(x => kindOf(x) === kind) || null;
  const signedIn = ag => { const a = auth(); return !!(a && a.active(ag.id)); };
  // In the tribe right now: it has a key, or a sign-in.
  const on = ag => !!ag && !ag.removed && (!!ag.tokenHash || signedIn(ag));
  // A tool the person connected with Connect your AI (POST /api/agents): it counts as their agent of that kind.
  const legacy = me => getMembers().filter(x => x.role === 'agent' && x.owner === me.id && !x.invited && x.tokenHash);
  const agentsOf = me => [...mineAll(me).filter(on), ...legacy(me)].map((x, i) => [x, i]).sort((p, q) => (ORDER.indexOf(kindOf(p[0])) - ORDER.indexOf(kindOf(q[0]))) || (p[1] - q[1])).map(p => p[0]);
  const claudesOf = me => agentsOf(me).filter(x => kindOf(x) === 'claude');
  const primary = (me, kind = 'claude') => agentsOf(me).find(x => kindOf(x) === kind) || null;
  const pick = (me, cid, kind) => (cid ? agentsOf(me).find(x => x.id === cid) || null : primary(me, kind || 'claude'));
  const nameFor = (owner, kind = 'claude') => `${String(owner.name || 'Your').slice(0, 22)}'s ${(AGENT_KINDS[kind] || AGENT_KINDS.claude).short}`.slice(0, 32);
  // Migration: invited members from before kinds existed are Claudes. Written once so the file says what the code assumes.
  try { let n = 0; for (const x of getMembers()) if (x.role === 'agent' && x.invited && !AGENT_KINDS[x.agentKind]) { x.agentKind = 'claude'; n++; } if (n) saveMembers(); } catch {}
  const scopesOf = ag => (Array.isArray(ag.scopes) ? ag.scopes.filter(s => SCOPES.includes(s)) : SCOPES.slice());
  const live = ag => { const s = agentSeen.get(ag.id); return !!s && now() - s.at < idleMs; };
  const err = (status, msg) => Object.assign(new Error(msg), { status });

  // ---------- the gate: every request an invited Claude makes ----------
  const hits = new Map();
  function limited(ag) {
    const t = now(), h = (hits.get(ag.id) || []).filter(x => t - x < 60_000); h.push(t); hits.set(ag.id, h);
    return h.length > rate;
  }
  setInterval(() => { const t = now(); for (const [k, h] of hits) if (!h.length || t - h[h.length - 1] > 60_000) hits.delete(k); }, 60_000).unref();
  // Its projects are its owner's, live.
  function sync(ag) {
    const o = member(ag.owner); if (!o) return null;
    if (Array.isArray(o.projects)) { if (!Array.isArray(ag.projects) || ag.projects.join() !== o.projects.join()) ag.projects = [...o.projects]; }
    else if (ag.projects) delete ag.projects;
    return o;
  }
  // Valid at all? (server/index.js stillValid: paused, removed or owner gone = the key doesn't work.)
  const usable = ag => !ag || (!ag.invited && !ag.paused) || (!ag.paused && !ag.removed && !!member(ag.owner));
  // A Connect-your-AI Claude its owner narrowed from the sheet: only the scopes apply (Pause is `usable`).
  const narrowed = ag => !!ag && !ag.invited && Array.isArray(ag.scopes);
  const ownerWatchOnly = ag => perms.actingRole(ag) === 'spectator';
  // An MCP tool call: null when allowed, else the reason.
  function gateTool(ag, name, args) {
    if (narrowed(ag)) { if (name === 'tribe_api') { const a = args || {}; return gatePath(ag, String(a.method || 'GET').toUpperCase(), String(a.path || ''), true); } const sc0 = scopeOfTool(name); return sc0 !== 'general' && !scopesOf(ag).includes(sc0) ? `Your owner turned off ${LABEL[sc0] || sc0} for you.` : null; }
    if (!ag || !ag.invited) return null;
    if (!usable(ag)) return 'Paused by your owner.';
    if (!sync(ag)) return 'Your owner left the tribe.';
    if (limited(ag)) return `Slow down: up to ${rate} actions a minute. Try again in a moment.`;
    if (name === 'tribe_api') { const a = args || {}; return gatePath(ag, String(a.method || 'GET').toUpperCase(), String(a.path || ''), true); }
    if (/^market_(use|add|install|remove)/.test(name)) return 'The Marketplace is read-only for an invited agent.';
    const sc = scopeOfTool(name);
    if (sc !== 'general' && !scopesOf(ag).includes(sc)) return `Your owner turned off ${LABEL[sc] || sc} for you.`;
    if (ownerWatchOnly(ag) && !READ_TOOL.test(name)) return 'Your owner can only watch right now, so you can only read.';
    return null;
  }
  // An API request (also what tribe_api calls): null when allowed, else the reason.
  function gatePath(ag, method, pth, counted) {
    if (narrowed(ag)) { const sc0 = scopeOfPath(String(pth || '')); return sc0 !== 'general' && !scopesOf(ag).includes(sc0) ? `Your owner turned off ${LABEL[sc0] || sc0} for you.` : null; }
    if (!ag || !ag.invited) return null;
    if (!usable(ag)) return 'Paused by your owner.';
    if (!sync(ag)) return 'Your owner left the tribe.';
    if (!counted && limited(ag)) return `Slow down: up to ${rate} actions a minute.`;
    const p = String(pth || '').replace(/^\/?(api\/)?/, '');
    if (NEVER.test(p)) return 'Not available to an invited agent.';
    if (/^market/.test(p) && method !== 'GET') return 'The Marketplace is read-only for an invited agent.';
    if (ADMIN.test(p) && method !== 'GET' && !ag.adminAsMe) return 'Admin actions need your owner to tick "Let it act as me for admin".';
    const sc = scopeOfPath(p);
    if (sc !== 'general' && !scopesOf(ag).includes(sc)) return `Your owner turned off ${LABEL[sc] || sc} for you.`;
    if (ownerWatchOnly(ag) && method !== 'GET') return 'Your owner can only watch right now, so you can only read.';
    return null;
  }
  // Tools it sees in tools/list (the rest are refused anyway).
  const listable = (ag, name) => !ag || (!ag.invited && !narrowed(ag)) || name === 'tribe_api' || scopeOfTool(name) === 'general' || scopesOf(ag).includes(scopeOfTool(name));

  // ---------- presence: "in Launch plan doc" ----------
  function whereFor(tool, args) {
    const a = args || {};
    try {
      if ((tool === 'read_doc' || tool === 'write_doc') && a.name) { const d = docs.find(a.name); return `in ${String((d && d.title) || a.name).slice(0, 40)} doc`; }
      if (/chat|reply|inbox|react/.test(tool)) return `in #${String(a.channel || 'general').replace(/^#/, '').slice(0, 24)}`;
      if (/task/.test(tool)) return 'on the task board';
      if (/^code_|file/.test(tool)) return a.path ? `in ${String(a.path).slice(0, 40)}` : 'in the code';
      if (/site|design|preview/.test(tool)) return 'in the website designer';
    } catch {}
    return null;
  }
  // First connect: say hello in chat, tell its owner.
  function seen(ag) {
    if (!ag || !ag.invited || ag.firstSeen) return;
    const o = member(ag.owner); if (!o) return;
    ag.firstSeen = new Date(now()).toISOString(); saveMembers();
    try { postChat('general', ag.id, `Hi everyone 👋 I'm ${ag.name}, invited by ${o.name}. I can help with chat, docs, tasks and code: @mention me.`); } catch (e) { console.error('invite-agent hello: ' + e.message); }
    const who = { id: ag.id, name: ag.name, kind: kindOf(ag) };
    try { sendTo(o.id, { type: 'agent-joined', agent: who }); if (who.kind === 'claude') sendTo(o.id, { type: 'claude-joined', agent: who }); } catch {}   // claude-joined: what an app loaded before kinds listens for
    pushPresence();
  }

  // ---------- inbox: @mentions and its owner's private line ----------
  const CURSOR = '.tribe/claude-inbox.json';
  // "@Maya's Cursor" from anyone; the bare word ("@cursor", "@claude", "@agent") only from its own person.
  const WORD = { claude: 'claude', cursor: 'cursor', codex: 'codex', chatgpt: 'chatgpt', gemini: 'gemini', vscode: '(?:vs ?code|copilot)', windsurf: 'windsurf', cline: 'cline', zed: 'zed', other: 'agent' };
  const rxEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function mentionRx(ag) {
    const o = member(ag.owner) || {}, w = WORD[kindOf(ag)] || 'agent';
    return new RegExp(`@(${rxEsc(ag.name)}|${rxEsc(o.name || '')}'?s\\s+${w}|${w})\\b`, 'i');
  }
  function inbox(ag, max = 10) {
    const pid = P.current() || P.defaultId();
    const curs = store.readJSON(CURSOR, {}), since = curs[ag.id] || ag.firstSeen || '';
    const rx = mentionRx(ag), owner = ag.owner, word = WORD[kindOf(ag)] || 'agent';
    const chs = [{ id: P.channelOf(pid), name: 'general' }];
    try { for (const c of chans.listFor(pid)) if (c.id && c.id !== 'general' && c.id !== P.channelOf(pid) && chans.canRead(ag, c.id)) chs.push({ id: c.id, name: c.name || c.id }); } catch {}
    const out = [];
    for (const c of chs) {
      for (const x of store.readJSONL(`chat/${c.id}.jsonl`, 300)) {
        if (x.deleted || x.by === ag.id || !x.text || !(x.at > since)) continue;
        // "@claude" (or "@cursor"…) alone means the person's own one: only its owner's messages count for it
        const named = rx.test(x.text), justClaude = new RegExp(`@${word}\\b`, 'i').test(x.text) && !new RegExp(`@${rxEsc(ag.name)}`, 'i').test(x.text) && !new RegExp(`'s\\s+${word}`, 'i').test(x.text);
        if (!named || (justClaude && x.by !== owner)) continue;
        out.push({ channel: c.name, id: x.id, at: x.at, from: nameOf(x.by), text: String(x.text).slice(0, 2000) });
      }
    }
    const dm = 'dm-' + [owner, ag.id].sort().join('-');
    for (const x of store.readJSONL(`chat/${dm}.jsonl`, 200)) if (!x.deleted && x.by === owner && x.text && x.at > since) out.push({ channel: 'private', id: x.id, at: x.at, from: nameOf(owner), text: String(x.text).slice(0, 2000) });
    out.sort((a, b) => (a.at < b.at ? -1 : 1));
    const take = out.slice(0, max);
    if (take.length) { curs[ag.id] = take[take.length - 1].at; store.writeJSON(CURSOR, curs); }
    return { messages: take, more: Math.max(0, out.length - take.length) };
  }

  // ---------- MCP tools it gets (everyone's agents get them; invited ones are gated above) ----------
  function mcpTools() {
    const text = t => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
    const fail = t => ({ content: [{ type: 'text', text: t }], isError: true });
    const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
    const s = d => ({ type: 'string', description: d });
    const api = async (ctx, method, p, body) => {
      const r = await fetch(`http://127.0.0.1:${ctx.port || process.env.TRIBE_PORT || 4747}/api/${p}`, { method, headers: { 'Content-Type': 'application/json', ...(ctx.auth ? { Authorization: ctx.auth } : {}), ...(ctx.project ? { 'X-Project': ctx.project } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status}: ${j.error || 'failed'}`); return j;
    };
    const chId = (ch) => (!ch || /^#?general$/i.test(ch) ? 'general' : (chans.resolve(P.current() || P.defaultId(), ch) || String(ch)));
    return {
      inbox_next: {
        description: 'Your inbox: new @mentions of you in the chat channels you can see, plus new private messages from the person who invited you. Oldest first; each call moves on. Answer with reply_chat (in the same channel) or reply. Call it between steps.',
        inputSchema: S({ max: { type: 'number', description: 'How many (default 10, max 30)' } }),
        run: (a, me) => { if (me.role !== 'agent') return fail('Only agents have an inbox.'); const r = inbox(me, Math.min(Number(a.max) || 10, 30)); return text(r.messages.length ? r : 'No new mentions.'); },
      },
      reply_chat: {
        description: 'Reply to one chat message (it shows as a reply with a quote). channel: as inbox_next gave it (default general).',
        inputSchema: S({ id: s('Message id'), text: s('Your reply'), channel: s('Channel name (default general)') }, ['id', 'text']),
        run: async (a, me, ctx = {}) => { const ch = chId(a.channel); const r = await api(ctx, 'POST', `chat/${encodeURIComponent(ch)}/send`, { text: a.text, replyTo: a.id }); return text(`Replied (${r.message ? r.message.id : 'sent'}).`); },
      },
      react_chat: {
        description: 'React to a chat message with one emoji (👍 ❤️ 😂 🎉 👀 ✅ …). Again to take it back.',
        inputSchema: S({ id: s('Message id'), emoji: s('One emoji'), channel: s('Channel name (default general)') }, ['id', 'emoji']),
        run: async (a, me, ctx = {}) => { await api(ctx, 'POST', `chat/${encodeURIComponent(chId(a.channel))}/react`, { id: a.id, emoji: a.emoji }); return text('Reacted.'); },
      },
      comment_task: {
        description: 'Add a comment to a task (shows on the task with your name).',
        inputSchema: S({ id: s('Task id'), text: s('Comment') }, ['id', 'text']),
        run: async (a, me, ctx = {}) => {
          const t = ((await api(ctx, 'GET', 'tasks')).tasks || []).find(x => x.id === a.id); if (!t) return fail(`No task with id ${a.id}`);
          const line = `**${me.name}** · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}: ${String(a.text || '').slice(0, 2000)}`;
          await api(ctx, 'PATCH', `tasks/${encodeURIComponent(a.id)}`, { body: `${t.body ? t.body + '\n\n' : ''}${line}` }); return text(`Commented on ${a.id}.`);
        },
      },
      where_is: {
        description: 'Where someone is in the app right now (a doc, a task, a channel, the website designer), or everyone you can see when no name is given.',
        inputSchema: S({ name: s('Person or agent name (optional)') }),
        run: async (a, me, ctx = {}) => {
          const r = await api(ctx, 'GET', 'members'); const list = (r.members || []).filter(m => !a.name || String(m.name).toLowerCase().includes(String(a.name).toLowerCase()));
          return text(list.slice(0, 40).map(m => `${m.name}${m.role === 'agent' ? ' (AI)' : ''}: ${m.online ? (m.where || 'online') : 'offline'}`).join('\n') || `No one called ${a.name}.`);
        },
      },
    };
  }

  // ---------- setup blocks ----------
  // One setup per choice in the picker, built from agentsHub.setupFor (the one source of setup text). `only`: just that
  // kind's choices (a POST: the key belongs to that one agent). names: kind -> what it joins as.
  function setup(req, token, names, only) {
    const ep = endpoints(req, token), pub = publicBase();
    const url = ep.url, webUrl = pub && /^https:/.test(pub) ? `${pub.replace(/\/+$/, '')}/mcp` : (ep.urls && ep.urls.anywhere && /^https:/.test(ep.urls.anywhere) ? ep.urls.anywhere : null);
    const cmd = u => agentsHub.setupFor('claude-code', u, token).blocks[0].text;
    const desk = agentsHub.desktopConfig(url, token);
    const stdio = `claude mcp add tribecode --env TRIBE_TOKEN=${token} -- ${desk.server.command} ${desk.server.args.map(x => /\s/.test(x) ? JSON.stringify(x) : x).join(' ')}`;
    const alt = Object.entries(ep.urls || {}).filter(([k, u]) => u && u !== url).map(([k, u]) => ({ where: k, command: cmd(u) }));
    const WHERE = { wifi: 'From another computer on this Wi-Fi', here: 'From this computer', anywhere: 'From anywhere' };
    const noPublic = what => ({ available: false, why: `${what} connects from its maker's cloud, so your tribe needs a public https address first. Turn on "Work with friends anywhere" (a free secure tunnel) and come back.` });
    const setups = {};
    for (const p of PICKS) {
      if (only && p.kind !== only) continue;
      const as = names[p.kind];
      let s;
      if (p.id === 'code') {
        s = { steps: ['Copy this command.', 'Paste it in your terminal and press Enter.', `Start claude (or type /mcp in one that's running). It joins as ${as}.`],
          blocks: [{ label: 'Terminal', text: cmd(url) }, ...alt.map(x => ({ label: WHERE[x.where] || 'From anywhere', text: x.command, alt: true })), { label: 'Or the local bridge (stdio)', text: stdio, alt: true }],
          docs: 'https://code.claude.com/docs/en/mcp', remove: 'claude mcp remove tribecode' };
      } else if (p.id === 'desktop') {
        const d = agentsHub.desktopSetup(url, token);
        s = { steps: ['Open Claude Desktop › Settings › Developer › Edit Config.', 'Paste this (or Download it and replace the file). Already have servers? Add the tribecode entry inside mcpServers.', 'Restart Claude Desktop: TribeCode shows up in its tools.'],
          blocks: d.blocks, docs: d.docs, note: `Mac: ${desk.files.mac} · Windows: ${desk.files.windows}` };
      } else if (p.signin) {
        s = webUrl ? agentsHub.setupFor(p.tool, webUrl, token, 'tribecode', { signin: true, as }) : { steps: [], blocks: [], ...noPublic(p.name) };
      } else if (p.id === 'other') {
        const m = agentsHub.setupFor('mcp', url, token);
        s = { ...m, blocks: [...m.blocks, { label: 'Or the local bridge, for a tool that only starts a program (stdio)', text: desk.json, alt: true, file: 'tribecode-mcp.json' }], bridge: true };
      } else s = agentsHub.setupFor(p.tool, url, token);
      const ids = new Set();
      const blocks = (s.blocks || []).map((b, i) => { let bid = i === 0 ? p.id : `${p.id}-${i}`; if (p.id === 'code') bid = i === 0 ? 'code' : b.label.startsWith('Or the local') ? 'stdio' : 'alt' + (i - 1); ids.add(bid); return { id: bid, label: b.label, text: b.text, ...(b.alt ? { alt: true } : {}), ...(b.file ? { file: b.file } : {}), ...(b.nokey || p.signin ? { nokey: true } : {}) }; });
      setups[p.id] = { pick: p.id, kind: p.kind, name: p.name, as, available: s.available !== false, ...(s.why ? { why: s.why } : {}), signin: !!p.signin, steps: s.steps || [], blocks, behaves: BEHAVES[p.behaves],
        ...(s.note ? { note: s.note } : {}), ...(s.docs ? { docs: s.docs } : {}), ...(s.bridge ? { bridge: true } : {}) };
    }
    // The Claude fields older callers read (the sheet before kinds, tests, scripts).
    const claude = !only || only === 'claude' ? {
      code: { command: cmd(url), alt, stdio, remove: 'claude mcp remove tribecode', steps: setups.code.steps },
      desktop: { json: desk.json, files: desk.files, steps: setups.desktop.steps, ...(webUrl ? { connector: webUrl } : {}) },
      web: webUrl ? { available: true, oauth: true, plain: webUrl, steps: setups.web.steps } : { available: false, why: setups.web.why },
    } : {};
    return { url, ...claude, setups };
  }
  const MASK = '••••••••';   // where the key will be, before Copy makes it
  function agentView(ag, me) {
    const inv = !!ag.invited, a = auth(), k = kindOf(ag);
    return { ...publicMember(ag), via: inv ? 'invite' : 'connect', kind: ag.kind || 'claude-code', agentKind: k, kindLabel: AGENT_KINDS[k].label, online: live(ag), joined: inv ? ag.firstSeen || null : ag.firstSeen || ag.joined || null,
      paused: !!ag.paused, scopes: scopesOf(ag), adminAsMe: !!(inv && ag.adminAsMe), key: !!ag.tokenHash, ownerName: me.name, connections: a ? a.connections(ag.id) : [], renameable: inv && k === 'other' };
  }
  const namesFor = me => Object.fromEntries(ORDER.map(k => { const ag = primary(me, k); return [k, ag ? ag.name : nameFor(me, k)]; }));
  function view(req, me) {
    const list = agentsOf(me), claudes = list.filter(x => kindOf(x) === 'claude'), ag = claudes[0] || null;
    const ownerRole = perms.roleIn(me, P.current()), names = namesFor(me);
    const count = {}; for (const x of list) count[kindOf(x)] = (count[kindOf(x)] || 0) + 1;
    return {
      agent: ag ? { ...publicMember(ag), invited: !!ag.invited, ownerName: me.name } : null, online: !!(ag && live(ag)), joined: ag ? (ag.invited ? ag.firstSeen || null : ag.firstSeen || ag.joined || null) : null,
      scopes: ag ? scopesOf(ag) : SCOPES.slice(), paused: !!(ag && ag.paused), adminAsMe: !!(ag && ag.invited && ag.adminAsMe),
      claudes: claudes.map(x => agentView(x, me)), merge: claudes.length > 1, name: names.claude,
      agents: list.map(x => agentView(x, me)), dupes: Object.keys(count).filter(k => count[k] > 1),
      kinds: ORDER.map(k => ({ id: k, label: AGENT_KINDS[k].label, short: AGENT_KINDS[k].short, name: names[k] })), picks: PICKS.map(p => ({ id: p.id, kind: p.kind, name: p.name, sub: p.sub, signin: !!p.signin })),
      preview: setup(req, MASK, names),
      all: SCOPES.map(k => ({ id: k, label: LABEL[k] })), canAdmin: ownerRole === 'host' || ownerRole === 'admin', public: !!publicBase() || !!endpoints(req, null).public, rate,
    };
  }
  // The person's one agent of a kind, made if there is none yet (no key: a sign-in is about to give it its access).
  // tool: which of the kind's tools it was set up for (Claude Code / Desktop / on the web), for the Agents Hub's label.
  function make(me, kind = 'claude', tool) {
    const K = AGENT_KINDS[kind] ? kind : 'claude', t = (PICKS.find(p => p.kind === K && (p.id === tool || p.tool === tool)) || PICKS.find(p => p.kind === K)).tool;
    let ag = mine(me, K);
    if (ag) Object.assign(ag, { name: ag.customName && K === 'other' ? ag.name : nameFor(me, K), agentKind: K, kind: tool ? t : ag.kind || t, paused: false, removed: false, project: P.current() || ag.project, keyedAt: new Date(now()).toISOString() });
    else {
      ag = { id: (K === 'other' ? 'agent' : K) + '-' + slug(me.name).slice(0, 10) + '-' + id(4), name: nameFor(me, K), color: '#38C6B1', role: 'agent', owner: me.id, invited: true, agentKind: K, kind: t, label: K === 'other' ? 'Invited agent' : `Invited ${AGENT_KINDS[K].label}`,
        joined: new Date(now()).toISOString(), keyedAt: new Date(now()).toISOString(), tokenHash: null, project: P.current(), adminAsMe: false };
      getMembers().push(ag);
    }
    return ag;
  }
  function ensure(me, kind = 'claude') {
    if (!me || me.role === 'agent' || me.role === 'spectator' || me.guest || me.guestUntil) return null;
    const K = AGENT_KINDS[kind] ? kind : 'other';
    let ag = primary(me, K);
    if (!ag) { ag = make(me, K); perms.audit(me, 'invite-agent', ag, { kind: K }); }
    sync(ag); saveMembers(); pushPresence();
    return ag;
  }
  // One that was made (Copy, or an approved sign-in) but never connected: gone after a day. Nothing it wrote can
  // exist, so the member is taken out entirely. Connect-your-AI keys have no "first seen", so they are left alone.
  function sweep() {
    const all = getMembers(), t = now(), a = auth(); let n = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      const x = all[i];
      if (x.role !== 'agent' || !x.invited || x.firstSeen) continue;
      const at = Date.parse(x.keyedAt || x.joined) || 0;
      if (t - at < staleMs) continue;
      all.splice(i, 1); agentSeen.delete(x.id); hits.delete(x.id); if (a) a.revokeAgent(x.id); n++;
    }
    if (n) { saveMembers(); pushPresence(); }
    return n;
  }
  const sweeper = setInterval(() => { try { sweep(); } catch (e) { console.error('invite-agent sweep: ' + e.message); } }, Math.min(staleMs, 3600_000)); if (sweeper.unref) sweeper.unref();
  setTimeout(() => { try { sweep(); } catch {} }, 5000).unref();

  // A name its person typed for "Something else": plain text, no look-alike of someone already here.
  function cleanName(v, ag) {
    const n = String(v || '').replace(/[\u0000-\u001f\u007f<>@]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
    if (n.length < 2) throw err(400, 'a name needs at least 2 characters');
    if (getMembers().some(x => x.id !== ag.id && !x.removed && String(x.name || '').toLowerCase() === n.toLowerCase())) throw err(409, 'someone here already has that name');
    return n;
  }

  async function route(req, res, { m, b, c, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role === 'agent') return fail(res, 403, 'people only');
    if (me.role === 'spectator' || me.guest || me.guestUntil) { if (m !== 'GET') return fail(res, 403, 'spectators and guests can\'t invite an AI'); }
    if (m === 'GET') return send(res, 200, view(req, me));
    const body = m === 'DELETE' ? {} : await readBody(req).catch(() => ({}));
    const pickScopes = v => (Array.isArray(v) ? [...new Set(v.filter(s => SCOPES.includes(s)))] : null);
    const wanted = str(body.id, 64) || (url && url.searchParams.get('id')) || '';
    const rawKind = str(body.kind, 24) || str(body.pick, 24) || (url && url.searchParams.get('kind')) || '';
    const kind = rawKind ? kindFrom(rawKind) : 'claude';
    if (!kind) return fail(res, 400, 'unknown kind of agent');
    if (m === 'DELETE' && b === 'connections') {
      const a = auth(); if (!a || !c || !a.revokeGrant(agentsOf(me).map(x => x.id), c)) return fail(res, 404, 'not one of your agents\' connections');
      pushPresence(); perms.audit(me, 'claude-oauth-revoke', primary(me));
      return send(res, 200, view(req, me));
    }
    if (b) return fail(res, 404, 'not found');
    if (m === 'POST') {
      const token = id(32);
      // One of each kind per person: the one they have gets the new key (also a Connect-your-AI one); only without one is a member made.
      let ag = pick(me, wanted, kind); if (wanted && !ag) return fail(res, 404, 'not one of your agents');
      const K = ag ? kindOf(ag) : kind;
      if (ag && !ag.invited) Object.assign(ag, { tokenHash: hash(token), project: P.current() || ag.project });
      else { ag = make(me, K, str(body.pick, 24) || (AGENT_KINDS[rawKind] ? '' : rawKind)); ag.tokenHash = hash(token); }
      const sc = pickScopes(body.scopes); if (sc) ag.scopes = sc;
      if (ag.invited) sync(ag); else if (Array.isArray(me.projects)) ag.projects = [...me.projects]; else delete ag.projects;
      saveMembers(); pushPresence();
      perms.audit(me, 'invite-agent', ag, { kind: K });
      const v = view(req, me);
      return send(res, 200, { ...v, token, kind: K, ...(K === 'claude' ? {} : { agent: { ...publicMember(ag), invited: !!ag.invited, ownerName: me.name } }), ...setup(req, token, namesFor(me), K) });
    }
    const ag = pick(me, wanted, kind); if (!ag) return fail(res, 404, kind === 'claude' ? 'you have not invited your Claude yet' : 'you have not invited that agent yet');
    if (m === 'PUT') {
      if (typeof body.name === 'string') {
        if (!ag.invited || kindOf(ag) !== 'other') return fail(res, 400, 'only "Something else" can be renamed');
        try { ag.name = cleanName(body.name, ag); ag.customName = true; } catch (e) { return fail(res, e.status || 400, e.message); }
      }
      const sc = pickScopes(body.scopes); if (sc) ag.scopes = sc;
      if (typeof body.paused === 'boolean') ag.paused = body.paused;
      if (typeof body.adminAsMe === 'boolean' && ag.invited) ag.adminAsMe = body.adminAsMe;
      if (ag.paused) agentSeen.delete(ag.id);
      saveMembers(); pushPresence(); perms.audit(me, 'claude-access', ag, { scopes: scopesOf(ag), paused: !!ag.paused, adminAsMe: !!ag.adminAsMe });
      return send(res, 200, view(req, me));
    }
    if (m === 'DELETE') {
      const a = auth(); if (a) a.revokeAgent(ag.id);
      ag.tokenHash = null; ag.paused = false; agentSeen.delete(ag.id);
      if (ag.invited) { ag.removed = true; delete ag.firstSeen; } else delete ag.scopes;
      saveMembers(); pushPresence(); perms.audit(me, 'claude-removed', ag);
      return send(res, 200, { ok: true, remove: agentsHub.removeFor ? agentsHub.removeFor(ag.kind) : 'claude mcp remove tribecode' });
    }
    return fail(res, 405, 'method not allowed');
  }

  return { route, gateTool, gatePath, listable, usable, ensure, sweep, view, claudesOf, agentsOf, kindOf, nameFor, whereFor, seen, inbox, mcpTools, SCOPES, scopeOfTool, scopeOfPath };
};
module.exports.SCOPES = SCOPES;
