// Flint edits the project website, locally (no AI needed), and the Saved shelf of website versions.
// The sentence -> operations rules are shared with the browser (app/ui/siteedit-core.js). Every change:
//   * pushes the state before it onto an undo stack (POST …/website/undo, or say "undo"),
//   * is kept as a version (auto, with what changed), and the preview live-reloads (the 'website' ws event).
// The Saved shelf: named snapshots (a note + a flat SVG thumbnail of the version) to compare and restore. They are
// listed in Files › Website under "Website versions" and kept in .tribe/website/<pid>.versions.json.
// With an AI on (server/llm.js: the host's Claude key or a local model), a sentence the rules don't know is turned into
// the same operations by the model, validated the same way ("basic features, supercharged by AI", DESIGN-SYSTEM §11).
//   POST /api/projects/:id/website/flint     { ask, pick?, ops?, logo? } -> { say, via, ops, need?, undo, website }
//   POST /api/projects/:id/website/undo
//   GET  /api/projects/:id/website/versions                -> { versions, undo }
//   POST /api/projects/:id/website/versions                { note } -> save the current draft to the shelf
//   POST /api/projects/:id/website/versions/:vid/restore
//   GET  /api/projects/:id/website/versions/:vid/compare   -> { changes: [..] } (that version vs. now)
//   DELETE /api/projects/:id/website/versions/:vid
'use strict';
const crypto = require('node:crypto');
const sitegen = require('./sitegen');
const core = require('../app/ui/siteedit-core.js');

const MAX_VERSIONS = 60, MAX_UNDO = 40;
const cut = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o == null ? null : o));
const err = (status, msg, extra) => Object.assign(new Error(msg), { status }, extra || {});
const NAMES = { faq: 'FAQ', hero: 'top', dek: 'tagline', cta: 'button', title: 'headline', kicker: 'small line', text: 'footer' };

module.exports = function siteflint({ P, base, showcase, nameOf = id => id, llm = null, log = () => {} }) {
  const file = pid => `.tribe/website/${pid}.versions.json`;
  const cache = new Map();
  const loadV = pid => { if (!cache.has(pid)) cache.set(pid, base.readJSON(file(pid), null) || { versions: [], undo: [] }); return cache.get(pid); };
  const saveV = (pid, v) => { v.versions = v.versions.slice(-MAX_VERSIONS); v.undo = v.undo.slice(-MAX_UNDO); cache.set(pid, v); base.writeJSON(file(pid), v); };
  const snap = st => clone({ gen: st.gen, brand: st.brand });
  const brainOn = () => { try { return !!(llm && llm.status && llm.status().online); } catch { return false; } };

  async function ensureDraft(pid, me) {
    const st = showcase.load(pid);
    if (!st.gen) await showcase.instant(pid, me, {});
    const s2 = showcase.load(pid); s2.gen.add = s2.gen.add || []; s2.gen.off = s2.gen.off || {}; s2.gen.edited = s2.gen.edited || {};
    return s2;
  }
  // the sections in the order the page shows them (same rules as sitegen.render)
  function orderOf(gen) {
    const T = sitegen.TYPES[gen.type] ? gen.type : null, L = sitegen.LAYOUTS[gen.layout] || sitegen.LAYOUTS.editorial;
    const baseOrder = T ? sitegen.TYPES[T].order : L.order;
    const o = (Array.isArray(gen.order) && gen.order.length ? gen.order : baseOrder).filter(k => sitegen.SECTIONS.includes(k)).slice();
    for (const k of baseOrder) if (!o.includes(k)) o.push(k);
    for (const k of gen.add || []) if (!o.includes(k)) o.push(k);
    return o;
  }
  // a field whose words are exactly these (the picked element), for "change it to …" and double-click edits
  function findText(copy, before) {
    const norm = x => String(x || '').replace(/\s+/g, ' ').trim(), want = norm(before); if (!want) return null;
    for (const [sec, v] of Object.entries(copy || {})) {
      if (!v || typeof v !== 'object') continue;
      for (const [f, x] of Object.entries(v)) if (typeof x === 'string' && norm(x) === want) return { sec, field: f };
      for (const [i, it] of (Array.isArray(v.items) ? v.items : []).entries()) for (const [f, x] of Object.entries(it || {})) if (typeof x === 'string' && norm(x) === want) return { sec, item: i, field: f };
    }
    return null;
  }
  const hex = c => (sitegen.okHex(c) ? c.toUpperCase() : null);

  // Apply one operation to the website state (mutates st). Returns a short line for the version list.
  function apply(pid, st, op, me, g) {
    const gen = st.gen, manager = showcase.canManage(pid, me);
    const brand = () => (st.brand = { ...(st.brand || {}) });
    const needBrand = what => { if (!manager) throw err(403, `only the host or the project lead changes the ${what}; ask them, or suggest it in chat`); };
    switch (op.op) {
      case 'copy': {
        const sec = String(op.section || ''), field = String(op.field || '');
        if (!sitegen.SECTIONS.includes(sec)) throw err(400, 'that is not a section of this site');
        const value = sitegen.clean(String(op.value || ''), 1600);
        if (!value) throw err(400, 'say the new words');
        if (sitegen.hasHype(op.value)) throw err(422, `“${op.value}” sounds like an ad. Say it plainly and I'll put it in.`);
        gen.copy[sec] = sitegen.editSection(gen.copy, sec, { [field]: value }); gen.edited[sec] = true;
        if (sitegen.EXTRA.includes(sec) && !gen.add.includes(sec)) gen.add.push(sec);
        return `${sec === 'hero' ? cap(NAMES[field] || field) : `${cap(NAMES[sec] || sec)} ${field === 'text' ? 'line' : field}`} → “${value.slice(0, 60)}”`;
      }
      case 'text': {
        const at = findText(gen.copy, op.before);
        if (!at) throw err(409, 'I couldn\'t find those words in the site\'s text. Click the words on the page, then say what they should say.');
        const after = sitegen.clean(String(op.after || ''), 1600); if (!after) throw err(400, 'say the new words');
        if (at.item !== undefined) { gen.copy[at.sec].items[at.item][at.field] = after; } else gen.copy[at.sec][at.field] = after;
        gen.edited[at.sec] = true;
        return `“${String(op.before).slice(0, 30)}” → “${after.slice(0, 40)}”`;
      }
      case 'primary': case 'accent': {
        needBrand('colors'); const c = hex(op.color); if (!c) throw err(400, 'colors look like #RRGGBB');
        brand()[op.op] = c; return `${op.op === 'accent' ? 'Accent' : 'Main color'} → ${op.name || c}`;
      }
      case 'font': { needBrand('fonts'); if (!sitegen.FONTS[op.font]) throw err(400, 'I don\'t know that font pair'); brand().font = op.font; return `Font → ${sitegen.FONTS[op.font].name}`; }
      case 'layout': { if (!sitegen.LAYOUTS[op.layout]) throw err(400, 'I don\'t know that layout'); gen.layout = op.layout; gen.order = null; return `Layout → ${sitegen.LAYOUTS[op.layout].name}`; }
      case 'theme': {
        const T = sitegen.THEMES[op.theme]; if (!T) throw err(400, `the looks are: ${sitegen.THEME_IDS.map(id => sitegen.THEMES[id].name).join(', ')}`);
        gen.layout = T.layout; gen.theme = op.theme; gen.order = null;
        if (manager) { const b = brand(); b.primary = T.primary; b.font = T.font; if (T.accent) b.accent = T.accent; else delete b.accent; }
        return `Look → ${T.name}`;
      }
      case 'logo': {
        needBrand('logo');
        if (op.clear) { delete brand().logo; return 'Logo removed'; }
        const l = showcase.cleanLogo(op.data); if (!l) throw err(400, 'pick a logo file');
        brand().logo = l; return 'Logo added';
      }
      case 'add': {
        const k = op.section; if (!sitegen.SECTIONS.includes(k) || k === 'hero') throw err(400, 'that is not a section I can add');
        delete gen.off[k];
        if (sitegen.EXTRA.includes(k)) {
          if (!gen.add.includes(k)) gen.add.push(k);
          const fresh = sitegen.draftCopy(g, 0, null, {});
          if (!gen.copy[k] || !(gen.copy[k].items || []).length) gen.copy[k] = fresh[k];
        } else {
          const avail = sitegen.available(g, { copy: gen.copy, info: gen.info || {}, add: gen.add });
          const T = sitegen.TYPES[gen.type] ? gen.type : null;
          if (T && !sitegen.TYPES[T].order.includes(k)) throw err(409, `a ${sitegen.TYPES[T].name} site has no ${k} section. Try another kind of site in Website › Guided.`);
          if (!avail[k]) throw err(409, ({ gallery: 'The gallery needs screenshots: save one from the preview (⋯ › Screenshot to Visuals).', play: 'The play section needs something to play: a page in the code or a link in Website.', devlog: 'The devlog fills from commits and gists; there are none yet.', roadmap: 'The roadmap fills from milestones; add one in Task Board › Milestones.', team: 'The team section fills from the people in the project.', visit: 'Add the opening hours or the address first (Website › Guided › Type).', event: 'Add the date or the place first (Website › Guided › Type).', contact: 'Add an email or a link first (Website › Guided › Type).' })[k] || `The ${k} section has nothing to show yet.`);
        }
        return `Added ${NAMES[k] || k}`;
      }
      case 'remove': {
        const k = op.section; if (!sitegen.SECTIONS.includes(k) || k === 'hero') throw err(400, 'that is not a section I can take out');
        const shown = orderOf(gen).includes(k) && !gen.off[k] && (!sitegen.EXTRA.includes(k) || gen.add.includes(k));
        if (!shown) throw err(409, `There is no ${NAMES[k] || k} section on the page right now.`);
        if (sitegen.EXTRA.includes(k)) gen.add = gen.add.filter(x => x !== k); else gen.off[k] = true;
        return `Removed ${NAMES[k] || k}`;
      }
      case 'move': {
        const k = op.section, o = orderOf(gen).filter(x => !['hero', 'footer'].includes(x)), i = o.indexOf(k);
        if (i < 0) throw err(409, `There is no ${k} section to move.`);
        o.splice(i, 1); const j = op.to === 'top' ? 0 : op.to === 'bottom' ? o.length : op.to === 'up' ? Math.max(0, i - 1) : Math.min(o.length, i + 1);
        o.splice(j, 0, k); gen.order = ['hero', ...o, 'footer'];
        return `Moved ${NAMES[k] || k} ${op.to}`;
      }
      default: throw err(400, 'I don\'t know that change');
    }
  }
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

  function record(pid, before, note, me, auto = true) {
    const v = loadV(pid);
    v.undo.push(before);
    v.versions.push({ id: 'v' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), at: new Date().toISOString(), by: me.id, note, auto, snap: snap(showcase.load(pid)) });
    saveV(pid, v);
  }
  function commit(pid, st, me) { st.gen.updated = new Date().toISOString(); st.gen.by = me.id; showcase.save(pid, st); showcase.push(pid); }

  // the model's turn: the same operations, as JSON, checked by apply()
  async function aiOps(ask, pick, st, me) {
    const sys = 'You turn a request about a small website into edit operations. Reply with ONLY JSON: {"ops":[...],"say":"one short plain sentence"}. ' +
      'Operations: {"op":"copy","section":S,"field":F,"value":"new words"} (hero fields: title, dek (tagline), kicker, cta; other sections: title, body; footer: text), ' +
      '{"op":"text","before":"exact current words","after":"new words"}, {"op":"primary"|"accent","color":"#RRGGBB"}, {"op":"add"|"remove","section":S}, ' +
      '{"op":"move","section":S,"to":"up"|"down"|"top"|"bottom"}, {"op":"theme","theme":T}, {"op":"layout","layout":L}, {"op":"font","font":F}. ' +
      `Sections: ${sitegen.SECTIONS.join(', ')}. Themes: ${sitegen.THEME_IDS.join(', ')}. Layouts: ${sitegen.LAYOUT_IDS.join(', ')}. Fonts: ${sitegen.FONT_IDS.join(', ')}. ` +
      'Plain, warm words. No hype, no made-up prices, reviews, numbers or people. At most 6 operations.';
    const prompt = `Request: ${ask}\n${pick && pick.text ? `They clicked: <${pick.tag || '?'}> "${String(pick.text).slice(0, 200)}"\n` : ''}Sections on the page: ${orderOf(st.gen).filter(k => !st.gen.off[k]).join(', ')}\nCurrent words (JSON): ${JSON.stringify(st.gen.copy).slice(0, 6000)}`;
    let r; try { r = await llm.stream({ system: sys, prompt, maxTokens: 700, temperature: 0.2, timeoutMs: 90_000, me }); } catch (e) { throw err(502, 'Flint\'s AI didn\'t answer: ' + (e.message || e)); }
    const raw = String((r && r.text) || ''), a = raw.indexOf('{'), z = raw.lastIndexOf('}');
    let j = null; try { j = JSON.parse(raw.slice(a, z + 1)); } catch {}
    if (!j || !Array.isArray(j.ops) || !j.ops.length) throw err(422, 'Flint couldn\'t work out a change for that. Try saying it another way.');
    return { ops: j.ops.slice(0, 6).filter(o => o && typeof o.op === 'string' && !['logo', 'undo', 'save'].includes(o.op)), say: String(j.say || 'Done.').slice(0, 200), via: (r && r.via) || 'AI' };
  }

  async function flint(pid, me, body) {
    if (!showcase.canDraft(me) || me.role === 'agent') throw err(403, 'only builders can edit the website');
    const ask = String(body.ask || '').trim().slice(0, 600), pick = body.pick && typeof body.pick === 'object' ? { tag: String(body.pick.tag || '').slice(0, 20), text: String(body.pick.text || '').slice(0, 600) } : null;
    let plan = Array.isArray(body.ops) && body.ops.length ? { ops: body.ops.slice(0, 6).filter(o => o && typeof o === 'object'), say: body.ops.length === 1 && body.ops[0] && body.ops[0].op === 'text' ? 'Changed the words.' : 'Done.', via: 'rules' } : null;
    if (!plan && ask) { const p = core.parse(ask, { pick }); if (p) plan = { ...p, via: 'rules' }; }
    // something picked and plain new words ("Fresh bread daily"): those are the new words
    if (!plan && ask && pick && pick.text && !/^(make|change|set|add|remove|delete|hide|move|swap|switch|use|turn|put|give|can|could|please|undo|show|try|let)\b/i.test(ask) && !/\?$/.test(ask)) plan = { ops: [{ op: 'text', before: pick.text, after: ask }], say: 'Changed the words.', via: 'rules' };
    if (plan && plan.ops.length === 1 && plan.ops[0].op === 'undo') return undo(pid, me);
    if (plan && plan.ops.length === 1 && plan.ops[0].op === 'save') { const v = saveNamed(pid, me, plan.ops[0].note); return { say: `Saved “${v.note}” to Saved designs.`, via: 'rules', ops: plan.ops, saved: v.id }; }
    if (plan && plan.ops.length === 1 && plan.ops[0].op === 'logo' && !plan.ops[0].clear && !body.logo) {
      if (!showcase.canManage(pid, me)) throw err(403, 'only the host or the project lead changes the logo; ask them, or suggest it in chat');
      return { need: 'logo', say: plan.say, via: 'rules', ops: plan.ops };
    }
    if (plan && body.logo) plan.ops = plan.ops.map(o => (o.op === 'logo' ? { ...o, data: body.logo } : o));
    let st = await ensureDraft(pid, me);
    if (!plan) {
      if (!ask) throw err(400, 'say what to change');
      if (!brainOn()) throw err(422, 'I can do that kind of change with an AI on. Without one, try: “make the headline say …”, “change the accent to teal”, “add a pricing section”, “swap to the Studio template”, “remove the FAQ”, or click something on the page and say “change it to …”.', { help: true });
      plan = await aiOps(ask, pick, st, me);
    }
    const before = snap(st), g = await showcase.gather(pid), notes = [];
    try { for (const op of plan.ops) notes.push(apply(pid, st, op, me, g)); }
    catch (e) { const cur = showcase.load(pid); cur.gen = before.gen; cur.brand = before.brand; showcase.save(pid, cur); throw e; }   // all or nothing
    commit(pid, st, me);
    record(pid, before, notes.join(' · '), me, true);
    log(`website flint (${plan.via}): ${notes.join(' · ')}`);
    return { say: plan.say, via: plan.via, ops: plan.ops.map(o => (o.op === 'logo' ? { op: 'logo' } : o)), changed: notes, undo: loadV(pid).undo.length };
  }
  function undo(pid, me) {
    if (!showcase.canDraft(me)) throw err(403, 'only builders can edit the website');
    const v = loadV(pid), prev = v.undo.pop(); if (!prev) throw err(409, 'Nothing to undo.');
    const st = showcase.load(pid); st.gen = prev.gen; st.brand = prev.brand; commit(pid, st, me);
    v.versions.push({ id: 'v' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), at: new Date().toISOString(), by: me.id, note: 'Undo', auto: true, snap: snap(st) });
    saveV(pid, v);
    return { say: 'Undid the last change.', via: 'rules', ops: [{ op: 'undo' }], undo: v.undo.length };
  }
  // feat/flint-site: versions also keep the website designer's config (server/sitedesign.js), so a version restores both
  let cfgHook = null; const useConfig = h => { cfgHook = h; };
  const cfgOf = pid => { try { return cfgHook ? cfgHook.load(pid) : null; } catch { return null; } };
  function saveNamed(pid, me, note) {
    const st = showcase.load(pid), cfg = cfgOf(pid); if (!st.gen && !cfg) throw err(409, 'make the website first: there is nothing to save yet');
    const v = loadV(pid), n = sitegen.clean(String(note || ''), 80) || `Version ${v.versions.filter(x => !x.auto).length + 1}`;
    const it = { id: 'v' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), at: new Date().toISOString(), by: me.id, note: n, auto: false, snap: snap(st), ...(cfg ? { cfg } : {}) };
    v.versions.push(it); saveV(pid, v); showcase.push(pid);
    return it;
  }
  function restore(pid, vid, me) {
    if (!showcase.canDraft(me)) throw err(403, 'only builders can edit the website');
    const v = loadV(pid), it = v.versions.find(x => x.id === vid); if (!it) throw err(404, 'that version is gone');
    if (it.cfg && cfgHook) { cfgHook.save(pid, clone(it.cfg)); if (!it.snap.gen) return { say: `Restored “${it.note}”.`, undo: loadV(pid).undo.length, cfg: it.cfg }; }
    const st = showcase.load(pid), before = snap(st);
    st.gen = clone(it.snap.gen); if (showcase.canManage(pid, me)) st.brand = clone(it.snap.brand);
    commit(pid, st, me);
    record(pid, before, `Restored “${it.note}”`, me, true);
    return { say: `Restored “${it.note}”. Say “undo” to go back.`, undo: loadV(pid).undo.length };
  }
  // what differs between a version and now, in words
  function compare(a, b) {
    const out = [], ga = (a && a.gen) || {}, gb = (b && b.gen) || {}, ba = (a && a.brand) || {}, bb = (b && b.brand) || {};
    if (ga.layout !== gb.layout) out.push(`Layout: ${(sitegen.LAYOUTS[ga.layout] || {}).name || '—'} → ${(sitegen.LAYOUTS[gb.layout] || {}).name || '—'}`);
    for (const k of ['primary', 'accent']) if ((ba[k] || '') !== (bb[k] || '')) out.push(`${k === 'primary' ? 'Main color' : 'Accent'}: ${ba[k] || 'default'} → ${bb[k] || 'default'}`);
    if ((ba.font || '') !== (bb.font || '')) out.push(`Font: ${(sitegen.FONTS[ba.font] || {}).name || 'default'} → ${(sitegen.FONTS[bb.font] || {}).name || 'default'}`);
    if (!!ba.logo !== !!bb.logo) out.push(bb.logo ? 'Logo added' : 'Logo removed');
    const on = gen => new Set(orderOf({ ...gen, add: gen.add || [] }).filter(k => !(gen.off || {})[k] && (!sitegen.EXTRA.includes(k) || (gen.add || []).includes(k))));
    const sa = on(ga), sb = on(gb);
    for (const k of sb) if (!sa.has(k)) out.push(`Section added: ${NAMES[k] || k}`);
    for (const k of sa) if (!sb.has(k)) out.push(`Section removed: ${NAMES[k] || k}`);
    for (const sec of sitegen.SECTIONS) {
      const x = (ga.copy || {})[sec] || {}, y = (gb.copy || {})[sec] || {};
      for (const f of ['title', 'dek', 'kicker', 'cta', 'body', 'text']) if (typeof y[f] === 'string' && (x[f] || '') !== y[f]) out.push(`${sec === 'hero' ? cap(NAMES[f] || f) : `${cap(NAMES[sec] || sec)} ${f}`}: “${String(x[f] || '').slice(0, 40)}” → “${y[f].slice(0, 40)}”`);
    }
    return out.slice(0, 30);
  }
  // A flat SVG thumbnail of a version: the page's paper, header, hero (headline + tagline + button), then a band per section.
  function thumb(pid, s) {
    const gen = (s && s.gen) || {}, b = (s && s.brand) || {}, L = sitegen.LAYOUTS[gen.layout] || sitegen.LAYOUTS.editorial;
    let pal; try { pal = sitegen.palette(L, { p: P.get(pid) || {}, sense: null }, b); } catch { pal = { paper: L.paper, surface: L.surface, ink: L.ink, muted: L.muted, rule: L.rule, primary: L.primary, btn: L.primary, onPrimary: '#FFFFFF', accent: L.muted }; }
    const c = gen.copy || {}, hero = c.hero || {}, secs = orderOf({ ...gen, add: gen.add || [] }).filter(k => !['hero', 'footer'].includes(k) && !(gen.off || {})[k] && (!sitegen.EXTRA.includes(k) || (gen.add || []).includes(k))).slice(0, 5);
    const cut = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
    const rows = secs.map((k, i) => { const y = 132 + i * 22; return `<rect x="16" y="${y}" width="208" height="16" fill="${pal.surface}" stroke="${pal.rule}"/><text x="22" y="${y + 11.5}" font-size="8" fill="${pal.muted}" font-family="sans-serif">${esc(cut(((c[k] || {}).title) || sitegen.SECTION_NAMES[k], 34))}</text>`; }).join('');
    const logo = b.logo ? `<rect x="16" y="9" width="12" height="12" fill="${pal.primary}"/>` : `<rect x="16" y="9" width="12" height="12" fill="${pal.primary}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240"><rect width="240" height="240" fill="${pal.paper}"/>
${logo}<text x="34" y="19" font-size="8" font-family="sans-serif" fill="${pal.ink}">${esc(cut(b.wordmark || (P.get(pid) || {}).name || '', 26))}</text><rect x="0" y="29" width="240" height="1" fill="${pal.rule}"/>
<text x="16" y="48" font-size="7" font-family="monospace" fill="${pal.accent}">${esc(cut(hero.kicker, 40).toUpperCase())}</text>
<text x="16" y="70" font-size="17" font-weight="700" font-family="${/serif/i.test((sitegen.FONTS[b.font] || {}).name || '') ? 'serif' : 'sans-serif'}" fill="${pal.ink}">${esc(cut(hero.title, 20))}</text>
<text x="16" y="88" font-size="8" font-family="sans-serif" fill="${pal.muted}">${esc(cut(hero.dek, 44))}</text>
<rect x="16" y="100" width="56" height="16" fill="${pal.btn}"/><text x="22" y="111" font-size="7.5" font-family="sans-serif" fill="${pal.onPrimary}">${esc(cut(hero.cta || 'Open', 12))}</text>
<rect x="168" y="40" width="56" height="76" fill="${pal.primary}"/>${rows}</svg>`;
  }
  const thumbUrl = (pid, s) => 'data:image/svg+xml;base64,' + Buffer.from(thumb(pid, s)).toString('base64');
  function cfgThumb(c) {   // a flat thumbnail of a designer version: its colors, name, first headline and a band per block
    const t = (c && c.theme) || {}, k = t.colors || {}, pg = ((c && c.pages) || [])[0] || { blocks: [] }, hero = (pg.blocks.find(b => b.type === 'hero' || b.type === 'links') || {}).props || {};
    const col = v => (/^#[0-9a-f]{3,8}$/i.test(v || '') ? v : '#888888'), dark = t.mode === 'dark' && t.base !== 'dark';
    const bg = dark ? '#16181B' : col(k.bg), ink = dark ? '#F1EEE8' : col(k.ink);
    const rows = pg.blocks.slice(1, 6).map((b, i) => `<rect x="16" y="${128 + i * 18}" width="208" height="12" fill="${i % 2 ? col(k.line) : col(k.card)}"/>`).join('');
    return 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="${bg}"/><text x="16" y="30" font-size="10" font-family="sans-serif" fill="${ink}">${esc(cut(c.name || '', 30))}</text><text x="16" y="70" font-size="16" font-family="serif" fill="${ink}">${esc(cut(hero.title || hero.name || '', 24))}</text><rect x="16" y="90" width="64" height="18" fill="${col(k.accent)}"/>${rows}</svg>`).toString('base64');
  }
  function list(pid) {
    const v = loadV(pid), st = showcase.load(pid);
    const out = v.versions.slice().reverse().map(x => ({ id: x.id, at: x.at, by: x.by, byName: nameOf(x.by), note: x.note, auto: !!x.auto, layout: (x.snap.gen || {}).layout, headline: (((x.snap.gen || {}).copy || {}).hero || {}).title || (x.cfg && ((((x.cfg.pages || [])[0] || {}).blocks || []).find(b => b.type === 'hero' || b.type === 'links') || { props: {} }).props.title) || '', designer: !!x.cfg, thumb: x.cfg && !x.snap.gen ? cfgThumb(x.cfg) : thumbUrl(pid, x.snap) }));
    return { versions: out, saved: out.filter(x => !x.auto), recent: out.filter(x => x.auto).slice(0, 12), undo: v.undo.length, current: st.gen ? { thumb: thumbUrl(pid, snap(st)), headline: ((st.gen.copy || {}).hero || {}).title || '' } : null };
  }

  async function route(req, res, { m, b, parts, me, readBody, send, fail }) {
    const sub = parts[3] || '', vid = parts[4], act = parts[5];
    if (!['flint', 'undo', 'versions'].includes(sub)) return null;
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const p = P.get(b); if (!p || !P.canSee(me, b)) return fail(res, 404, 'project not found');
    try {
      if (sub === 'flint' && m === 'POST') { const r = await flint(b, me, await readBody(req, 400 * 1024)); return send(res, 200, r); }
      if (sub === 'undo' && m === 'POST') return send(res, 200, undo(b, me));
      if (sub === 'versions' && !vid && m === 'GET') return send(res, 200, list(b));
      if (sub === 'versions' && !vid && m === 'POST') { if (!showcase.canDraft(me)) return fail(res, 403, 'spectators are read-only'); const it = saveNamed(b, me, (await readBody(req, 8 * 1024)).note); return send(res, 200, { saved: it.id, note: it.note, ...list(b) }); }
      if (sub === 'versions' && vid && act === 'restore' && m === 'POST') return send(res, 200, { ...restore(b, vid, me), ...list(b) });
      if (sub === 'versions' && vid && act === 'compare' && m === 'GET') { const it = loadV(b).versions.find(x => x.id === vid); if (!it) return fail(res, 404, 'that version is gone'); return send(res, 200, { changes: compare(it.snap, snap(showcase.load(b))), thumb: thumbUrl(b, it.snap), now: thumbUrl(b, snap(showcase.load(b))) }); }
      if (sub === 'versions' && vid && m === 'DELETE') { if (!showcase.canDraft(me)) return fail(res, 403, 'spectators are read-only'); const v = loadV(b); v.versions = v.versions.filter(x => x.id !== vid); saveV(b, v); showcase.push(b); return send(res, 200, list(b)); }
    } catch (e) { return send(res, e.status || 500, { error: e.message, help: !!e.help }); }
    return null;
  }
  return { route, flint, undo, list, compare, thumb, useConfig };
};
