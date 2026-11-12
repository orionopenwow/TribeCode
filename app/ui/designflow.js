// The Design flow (feat/design-flow): clicking Design (Home › Design, or Design in a project) opens a creation flow
// instead of an empty canvas list.
//   1. What are you making?  Website · App · Game · Screen / UI mockup · Slides · Poster / graphic · Whiteboard ·
//      Logo / brand kit, each a tile with a stroke icon and one line. "Continue" lists what you already made.
//   2. A template gallery for that kind: real preview thumbnails, a Blank option and an optional prompt ("Describe it —
//      optional"). Flint reads the prompt for free (names, colors, faster/slower: app/ui/starterkit.js) and, when an AI
//      is connected, asks it for the rest (aibasics.js ask 'design.tune').
//   3. The design opens in its real editor (the website designer, the canvas, slides, the whiteboard) or, for apps and
//      games, in a workspace with the running starter and its knobs, and a recommended process sits beside it as the
//      Plan card: steps that tick off, each with a one-click action into the real feature (canvas, inspiration board,
//      preview, chat) and "Add these steps as tasks". The plan is kept per design: in a project in
//      .tribe/design-plans/<key>.json (server/designplans.js), with no tribe on this device (localStorage).
// Where things are made: Home's Design keeps them on this device (localfiles.js), like the rest of Home's Design;
// a project's Design makes them in the project (the canvas, whiteboard and docs APIs; apps and games go into the
// project's code with POST /api/projects/:id/flint/build { starter }).
//   window.TribeDesignFlow = { mount(el, { scope }), open(opts), gallery(kind), create(kind, tpl, ask), plan(),
//     showPlan(key, pid), fromFlint(starterId, text), catalog(), dock() }
(function () {
  'use strict';
  const C = window.TribeClient;
  const D = () => window.TribeDesignData, K = () => window.TribeStarterKit, LF = () => window.TribeLocalFiles, App = () => window.TribeApp;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (App() && App().toast ? App().toast(m) : console.log(m));
  const connected = () => !!(C && C.connected && C.connected());
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'design';
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const swap = fn => (window.TribeMotion ? window.TribeMotion.swap(fn) : fn());

  // ---------- icons: 1.6px strokes. icons.js (feat/shell-polish) wins when it has the name; these are the fallback ----------
  const P = {
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    app: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
    gamepad: '<path d="M7 9h10a4 4 0 0 1 4 4v1.5a2.5 2.5 0 0 1-4.5 1.5L15 14H9l-1.5 2A2.5 2.5 0 0 1 3 14.5V13a4 4 0 0 1 4-4z"/><path d="M8 11.5v2M7 12.5h2M15.5 12h.01M17.5 13h.01"/>',
    screen: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M9 7h6M9 10.5h6M9 14h3"/>',
    slides: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8M7 8h6M7 11h9"/>',
    poster: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><circle cx="12" cy="9" r="2.5"/><path d="M8 15h8M9 18h6"/>',
    whiteboard: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21l2-4M16 21l-2-4M7 9l3 3 3-4 4 4"/>',
    brand: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 18l-6-6 6-6"/>', chev: '<path d="M9 18l6-6-6-6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', play: '<path d="M8 5v14l11-7z"/>', sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', canvas: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>', people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5 5"/>',
    tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
    blank: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M12 9v6M9 12h6"/>', flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
    platformer: '<path d="M3 20h7M14 15h7M7 12h5"/><rect x="5" y="7" width="3" height="4"/><circle cx="18" cy="11" r="1.5"/>', breakout: '<path d="M3 5h4M9 5h6M17 5h4M3 9h7M12 9h9M9 20h6"/><circle cx="12" cy="15" r="1.5"/>',
    puzzle: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><path d="M13 16.5h7"/>', snake: '<path d="M4 18h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h10"/><circle cx="19" cy="6" r="1"/>',
    runner: '<circle cx="13" cy="5" r="2"/><path d="M9 21l2-6 3 2v4M7 12l3-3 4 1 2 3h3M3 21h18"/>', topdown: '<circle cx="12" cy="12" r="3"/><path d="M12 9V4M15 12h5"/><circle cx="5" cy="18" r="1.5"/><circle cx="19" cy="19" r="1.5"/>',
    cards: '<rect x="3" y="6" width="11" height="15" rx="1.5"/><path d="M8 3h11.5A1.5 1.5 0 0 1 21 4.5V17"/>', todo: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
    notes: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/>', sketch: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>', kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
    dashboard: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>', form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>', calc: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    weather: '<path d="M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1.5A3.25 3.25 0 0 1 17 18z"/>',
  };
  function icon(name, size = 20) {
    const I = window.TribeIcons;
    if (I && typeof I.svg === 'function') { try { const s = I.svg(name, size); if (s) return s; } catch {} }
    return `<svg class="dfl-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.blank}</svg>`;
  }

  // ---------- the starters catalog (app/ui/starters/catalog.json) ----------
  let catP = null;
  const catalog = () => (catP = catP || fetch('starters/catalog.json').then(r => r.json()).then(j => j.items || []).catch(() => { catP = null; return []; }));
  const starter = async id => (await catalog()).find(s => s.id === id) || null;

  // ---------- scope: Home (this device) or a project ----------
  let host = null, scope = 'home', view = 'kinds', kindNow = '';
  const projectScope = () => scope === 'project' && connected() && !!(C.project && C.project());
  const pidNow = () => (projectScope() ? C.project() : '');

  // ---------- plans: in the project (server/designplans.js) or on this device ----------
  const LKEY = 'tribecode.designplans.v1', AKEY = 'tribecode.designflow.active';
  const localPlans = () => ls.get(LKEY, {});
  async function savePlan(p) {
    p.updated = new Date().toISOString();
    if (p.target.pid && connected()) { try { const r = await C.api(`/projects/${encodeURIComponent(p.target.pid)}/design-plans/${p.key}`, { method: 'PUT', body: { plan: p } }); return r.plan; } catch (e) { toast(e.message); } }
    const all = localPlans(); all[p.key] = p; ls.set(LKEY, all); return p;
  }
  async function getPlan(key, pid) {
    if (pid && connected()) { try { return (await C.api(`/projects/${encodeURIComponent(pid)}/design-plans/${key}`)).plan; } catch { return null; } }
    return localPlans()[key] || null;
  }
  async function listPlans() {
    if (projectScope()) { try { return (await C.api(`/projects/${encodeURIComponent(pidNow())}/design-plans`)).plans || []; } catch { return []; } }
    return Object.values(localPlans()).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  }
  async function tick(p, stepId, done) {
    const s = p.steps.find(x => x.id === stepId); if (!s) return p;
    s.done = done; s.at = done ? new Date().toISOString() : '';
    if (p.target.pid && connected()) { try { return (await C.api(`/projects/${encodeURIComponent(p.target.pid)}/design-plans/${p.key}`, { method: 'PATCH', body: { step: stepId, done } })).plan; } catch (e) { toast(e.message); } }
    return savePlan(p);
  }
  function newPlan(kind, title, template, prompt, target) {
    const steps = (D().PLANS[kind] || []).map(s => ({ ...s, act: s.act ? { ...s.act } : null, done: false }));
    return { key: `${kind}-${slug(title)}-${rid().slice(0, 6)}`, kind, title, template: template || '', prompt: prompt || '', target, steps, created: new Date().toISOString(), updated: '' };
  }
  let active = null;   // the plan on screen
  function setActive(p) { active = p; ls.set(AKEY, p ? { key: p.key, pid: p.target.pid || '' } : null); dock(); }

  // ---------- step 1: what are you making? ----------
  function mount(el, opts = {}) {
    host = el; scope = opts.scope || 'home';
    kinds();
  }
  function head(eyebrow, title, lead) { return `<header class="dfl-head"><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1>${lead ? `<p class="dfl-lead">${esc(lead)}</p>` : ''}</header>`; }
  function kinds() {
    if (!host) return; view = 'kinds'; kindNow = '';
    document.body.classList.remove('dfl-deep');
    host.innerHTML = `<section class="dfl" id="dfl" data-step="kinds">${head('Design', 'What are you making?', 'Pick one. Each comes with templates, an optional prompt for Flint and a plan to follow.')}
      <div class="dfl-kinds" role="list">${D().KINDS.map(k => `<button type="button" class="dfl-kind" role="listitem" data-kind="${k.id}"><span class="dfl-ki">${icon(k.icon, 22)}</span><span class="dfl-kt"><b>${esc(k.t)}</b><small>${esc(k.d)}</small></span></button>`).join('')}</div>
      ${scope === 'project' ? '<section class="dfl-cont" id="dfl-cont"><span class="eyebrow">Continue</span><h2>In this project</h2><div class="dfl-list" id="dfl-cont-list"><p class="faint">Loading…</p></div></section>' : '<div class="dfl-cont-plans" id="dfl-cont-plans"></div>'}</section>`;
    host.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => swap(() => gallery(b.dataset.kind)));
    continueList();
  }
  async function continueList() {
    const plans = await listPlans();
    const row = p => { const d = p.steps.filter(s => s.done).length, k = D().KINDS.find(x => x.id === p.kind) || {};
      return `<button type="button" class="dfl-row" data-plan="${esc(p.key)}" data-pid="${esc(p.target.pid || '')}"><span class="dfl-ki sm">${icon(k.icon, 18)}</span><span class="dfl-kt"><b>${esc(p.title)}</b><small>${esc(k.t || p.kind)} · plan ${d}/${p.steps.length}</small></span>${icon('chev', 16)}</button>`; };
    if (scope === 'project') {
      const box = host && host.querySelector('#dfl-cont-list'); if (!box) return;
      let files = []; try { files = (await C.api('/canvas')).files || []; } catch {}
      let boards = []; try { boards = (await C.api('/whiteboard')).boards || []; } catch {}
      const planned = new Set(plans.map(p => p.target.id));
      const extra = [...files.filter(f => !planned.has(f.id) && (f.count || f.id !== 'main')).map(f => ({ t: f.name, k: 'Design', ic: 'canvas', a: `data-cv="${esc(f.id)}"` })), ...boards.filter(b => !planned.has(b.id) && b.count).map(b => ({ t: b.name, k: 'Whiteboard', ic: 'whiteboard', a: `data-wb="${esc(b.id)}"` }))];
      box.innerHTML = plans.map(row).join('') + extra.map(x => `<button type="button" class="dfl-row" ${x.a}><span class="dfl-ki sm">${icon(x.ic, 18)}</span><span class="dfl-kt"><b>${esc(x.t)}</b><small>${x.k}</small></span>${icon('chev', 16)}</button>`).join('') || '<p class="faint dfl-none">Nothing yet. Pick a kind above to start.</p>';
      box.querySelectorAll('[data-cv]').forEach(b => b.onclick = () => openCanvas(b.dataset.cv));
      box.querySelectorAll('[data-wb]').forEach(b => b.onclick = () => window.TribeWhiteboard && window.TribeWhiteboard.open(b.dataset.wb));
    } else {
      const box = host && host.querySelector('#dfl-cont-plans'); if (!box) return;
      box.innerHTML = plans.length ? `<span class="eyebrow">Your plans</span><div class="dfl-list">${plans.slice(0, 6).map(row).join('')}</div>` : '';
    }
    (host || document).querySelectorAll('[data-plan]').forEach(b => b.onclick = () => resume(b.dataset.plan, b.dataset.pid));
  }

  // ---------- step 2: the gallery ----------
  async function templatesFor(kind) {
    const d = D(), th = id => `assets/designflow/${id}.webp`;
    if (kind === 'app' || kind === 'game') return (await catalog()).filter(s => s.kind === kind).map(s => ({ id: s.id, t: s.title, d: s.summary, img: `starters/thumbs/${s.id}.webp`, lic: `${s.license} · ${s.by}`, ic: s.icon }));
    if (kind === 'website') return d.SITES.map(s => ({ ...s, img: th('site-' + s.id) }));
    if (kind === 'screen') return d.SCREENS.map(s => ({ ...s, img: th('screen-' + s.id) }));
    if (kind === 'slides') return d.SLIDES.map(s => ({ ...s, img: th('slides-' + s.id) }));
    if (kind === 'poster') return d.POSTERS.map(s => ({ ...s, img: th('poster-' + s.id) }));
    if (kind === 'logo') return d.LOGOS.map(s => ({ ...s, img: th('logo-' + s.id) }));
    if (kind === 'whiteboard') return d.BOARDS.map(s => ({ ...s, img: th('board-' + s.id) }));
    return [];
  }
  const PLACEHOLDER = { website: 'A site for Sunrise Bakery, warm colors, with the menu', app: 'A kanban board for our band called Gig Board, in teal', game: 'A floaty endless runner called Fox Dash in pink', screen: 'For Ember Coffee, in teal', slides: 'Our game jam recap: Lantern Run', poster: 'Open mic night, Friday 8pm, in orange', whiteboard: 'What should our first level feel like?', logo: 'Lantern Studio, warm and friendly, in amber' };
  async function gallery(kind) {
    if (!host) return; view = 'gallery'; kindNow = kind;
    const k = D().KINDS.find(x => x.id === kind); if (!k) return kinds();
    document.body.classList.add('dfl-deep');
    host.innerHTML = `<section class="dfl dfl-gal" id="dfl" data-step="gallery" data-kind="${kind}"><button type="button" class="dfl-back" id="dfl-back">${icon('back', 16)}All kinds</button>
      ${head(k.t, 'Pick a starting point', kind === 'game' || kind === 'app' ? 'Open-source starters that run with no build step. Each keeps its authors\' license and credit.' : '')}
      <label class="dfl-prompt"><span class="dfl-pl">${icon('flame', 16)}Describe it <span class="faint">— optional</span></span><textarea id="dfl-ask" rows="2" maxlength="600" placeholder="${esc(PLACEHOLDER[kind] || '')}"></textarea><small class="faint" id="dfl-ai-note">Flint fills in the name, words and colors from this for free. With an AI connected, he goes further.</small></label>
      <div class="dfl-grid" id="dfl-grid"><p class="faint">Loading…</p></div></section>`;
    host.querySelector('#dfl-back').onclick = () => swap(kinds);
    const list = await templatesFor(kind), grid = host.querySelector('#dfl-grid'); if (!grid) return;
    grid.innerHTML = `<button type="button" class="dfl-tpl dfl-blank" data-tpl=""><span class="dfl-th">${icon('blank', 34)}</span><b>Blank</b><small>Start from nothing</small></button>` +
      list.map(t => `<button type="button" class="dfl-tpl" data-tpl="${esc(t.id)}"><span class="dfl-th"><img src="${esc(t.img)}" alt="" loading="lazy" width="320" height="200"></span><b>${esc(t.t)}</b><small>${esc(t.d)}</small>${t.lic ? `<span class="dfl-lic">${esc(t.lic)}</span>` : ''}</button>`).join('');
    grid.querySelectorAll('img').forEach(i => { i.onerror = () => { const tp = list.find(t => i.src.endsWith(t.img)); i.replaceWith(Object.assign(document.createElement('span'), { className: 'dfl-noimg', innerHTML: icon((tp && tp.ic) || k.icon, 30) })); }; });
    grid.querySelectorAll('[data-tpl]').forEach(b => b.onclick = async () => {
      grid.querySelectorAll('[data-tpl]').forEach(x => { x.disabled = true; }); b.classList.add('busy');
      try { await create(kind, b.dataset.tpl, (host.querySelector('#dfl-ask') || {}).value || ''); }
      catch (e) { toast(e.message || String(e)); grid.querySelectorAll('[data-tpl]').forEach(x => { x.disabled = false; }); b.classList.remove('busy'); }
    });
  }

  // ---------- step 3: make it ----------
  function nameFrom(ask, fallback) {
    const m = /\b(?:called|named|titled|for)\s+["“']?([^,.!?"”']{2,48})/i.exec(ask || '');
    let n = m ? m[1].replace(/\s+(with|that|which|in|using|where|and)\b.*$/i, '').trim() : '';
    if (!n && ask && ask.length <= 40 && !/\b(a|an|the|make|build|with)\b/i.test(ask)) n = ask.trim();
    return (n ? n.replace(/\b\p{L}/gu, c => c.toUpperCase()) : '') || fallback;
  }
  const accentFrom = ask => { const KC = K() ? K().COLORS : {}; const hex = /#[0-9a-f]{6}\b/i.exec(ask || ''); if (hex) return hex[0]; const w = new RegExp(`\\b(${Object.keys(KC).join('|')})\\b`, 'i').exec(ask || ''); return w ? KC[w[1].toLowerCase()] : '#F26B1D'; };
  async function create(kind, tplId, ask) {
    ask = String(ask || '').trim();
    if (kind === 'website') return makeWebsite(tplId, ask);
    if (kind === 'app' || kind === 'game') return makeCode(kind, tplId, ask);
    if (kind === 'slides') return makeSlides(tplId, ask);
    if (kind === 'whiteboard') return makeBoard(tplId, ask);
    return makeCanvas(kind, tplId, ask);
  }
  // Website: the website designer takes over (its own entry), with the template and the prompt
  async function makeWebsite(tplId, ask) {
    const SD = window.TribeSiteDesigner; if (!SD) throw new Error('The website designer did not load. Reload the app.');
    const t = D().SITES.find(s => s.id === tplId), title = nameFrom(ask, t ? t.t + ' site' : 'Website');
    const p = newPlan('website', title, tplId, ask, { type: 'site', pid: pidNow(), id: tplId });
    await savePlan(p); setActive(p);
    await SD.open({ ...(pidNow() ? { pid: pidNow() } : {}), ...(tplId ? { template: tplId } : {}) });
    if (ask) setTimeout(() => { try { SD.ask(ask); } catch {} }, 400);
    dock();
  }
  // Apps and games: a starter, its knobs set from the prompt (free) or by the AI (when one is connected)
  async function tune(s, ask) {
    const free = K().fromAsk(ask, s.params);
    let values = free.values, said = free.said.slice(), via = 'Basic · no AI';
    const AB = window.TribeAIBasics;
    if (ask && AB && AB.ask && s.params.length) {
      try {
        const r = await Promise.race([AB.ask('design.tune', { ask, starter: s.title, params: s.params.map(p => ({ key: p.key, label: p.label, type: p.type, min: p.min, max: p.max, default: p.default })) }, JSON.stringify(values)), new Promise(res => setTimeout(() => res(null), 12000))]);
        const j = r && r.text ? JSON.parse((/\{[\s\S]*\}/.exec(r.text) || ['{}'])[0]) : null;
        const ai = j ? K().clean(j, s.params) : {};
        if (Object.keys(ai).length) { values = { ...values, ...ai }; said = Object.entries(ai).map(([k, v]) => `${(s.params.find(p => p.key === k) || {}).label || k} → ${v}`); via = '✦ via ' + r.via; }
      } catch {}
    }
    return { values, said, via };
  }
  async function starterFiles(s) {
    const out = {};
    await Promise.all(s.files.map(async f => { const r = await fetch(`starters/${s.id}/${f}`); if (!r.ok) throw new Error(`Could not load ${s.id}/${f}`); out[f] = await r.text(); }));
    return out;
  }
  const BLANK = { game: '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>{{t}}</title>\n<style>html,body{margin:0;height:100%;background:#12151A;color:#E7E9EE;font:14px system-ui}canvas{display:block;margin:auto;max-width:100%;background:#1B2028}</style>\n</head>\n<body>\n<canvas id="game" width="640" height="400"></canvas>\n<script>\n// {{t}}: a blank game. A box you move with the arrow keys; build from here.\nvar cv = document.getElementById("game"), ctx = cv.getContext("2d"), keys = {}, p = { x: 300, y: 180 };\naddEventListener("keydown", function (e) { keys[e.key] = true; });\naddEventListener("keyup", function (e) { keys[e.key] = false; });\n(function loop() {\n  p.x += (keys.ArrowRight ? 4 : 0) - (keys.ArrowLeft ? 4 : 0); p.y += (keys.ArrowDown ? 4 : 0) - (keys.ArrowUp ? 4 : 0);\n  ctx.fillStyle = "#1B2028"; ctx.fillRect(0, 0, cv.width, cv.height);\n  ctx.fillStyle = "#F26B1D"; ctx.fillRect(p.x, p.y, 32, 32);\n  ctx.fillStyle = "#E7E9EE"; ctx.fillText("{{t}}: arrow keys to move", 12, 20);\n  requestAnimationFrame(loop);\n})();\n</script>\n</body>\n</html>\n',
    app: '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>{{t}}</title>\n<style>html,body{margin:0;background:#12151A;color:#E7E9EE;font:15px/1.5 system-ui}main{max-width:640px;margin:0 auto;padding:24px 16px}button{font:inherit;background:#F26B1D;color:#fff;border:0;border-radius:8px;padding:8px 14px}</style>\n</head>\n<body>\n<main>\n<h1>{{t}}</h1>\n<p>A blank app. Change anything.</p>\n<button id="b">Clicked 0 times</button>\n</main>\n<script>\nvar n = 0; document.getElementById("b").onclick = function () { this.textContent = "Clicked " + (++n) + " times"; };\n</script>\n</body>\n</html>\n' };
  async function makeCode(kind, id, ask) {
    const s = id ? await starter(id) : null;
    const t = s ? await tune(s, ask) : { values: {}, said: [], via: 'Basic · no AI' };
    const title = nameFrom(ask, (t.values.title && t.values.title !== (s && (s.params.find(p => p.key === 'title') || {}).default)) ? t.values.title : s ? s.title : kind === 'game' ? 'My game' : 'My app');
    if (s && s.params.some(p => p.key === 'title') && !t.values.title && title !== s.title) t.values.title = title;
    let target;
    if (projectScope()) {
      const pid = pidNow();
      if (!s) { target = { type: 'code', pid }; }
      else {
        const r = await C.api(`/projects/${encodeURIComponent(pid)}/flint/build`, { method: 'POST', body: { starter: s.id, ask, values: t.values, name: title } });
        target = { type: 'build', pid, id: s.id, dir: r.dir || '', href: r.href || '' };
      }
    } else {
      if (!LF()) throw new Error('Files on this device did not load. Reload the app.');
      let html;
      if (s) { const files = await starterFiles(s); if (files['config.js']) files['config.js'] = K().apply(files['config.js'], t.values, s.params); html = K().inline(files); }
      else html = BLANK[kind].replace(/\{\{t\}\}/g, title.replace(/[<>"&]/g, ''));
      const it = await LF().create('site', { title, body: html });
      target = { type: 'local-site', id: it.id, starter: s ? s.id : '' };
    }
    target.starter = s ? s.id : '';
    const p = newPlan(kind, title, s ? s.id : '', ask, target);
    if (t.said.length) p.note = `${t.via}: ${t.said.join(' · ')}`;
    await savePlan(p); setActive(p);
    workspace(p, { said: t.said, via: t.via });
    if (target.type === 'build' && window.TribePreview && window.TribePreview.show) setTimeout(() => window.TribePreview.show(target.href || ''), 300);
  }
  // Screens, posters and logos: a design file on the canvas
  const api = kind => (projectScope() ? (p, o) => C.api(p, o) : (p, o) => LF().backend(kind).api(p, o));
  function fill(v, vars) { return typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (a, k) => (k in vars ? vars[k] : a)) : v; }
  function nodesFrom(tpl, vars) {
    const frame = { id: 'f' + rid(), t: 'frame', p: '', i: Date.now() % 1e9, v: 1, x: 0, y: 0, w: tpl.w, h: tpl.h, fill: fill(tpl.fill, vars), clip: true, name: vars.title };
    const kids = tpl.nodes.map((n, i) => { const o = { ...n, id: n.id + rid(), p: frame.id, i: i + 1, v: 1 }; delete o.tx2;
      for (const k of ['fill', 'stroke']) if (o[k]) o[k] = fill(o[k], vars);
      if (o.tx) o.tx = { ...o.tx, c: fill(o.tx.c, vars), col: fill(o.tx.col, vars), sz: undefined }; if (o.t === 'text') o.sz = { h: 'fixed', v: 'hug' };
      return o; });
    return [frame, ...kids];
  }
  async function makeCanvas(kind, tplId, ask) {
    const d = D(), list = kind === 'screen' ? d.SCREENS : kind === 'poster' ? d.POSTERS : d.LOGOS, tpl = list.find(x => x.id === tplId) || null;
    const title = nameFrom(ask, tpl ? tpl.t : kind === 'logo' ? 'Logo' : kind === 'poster' ? 'Poster' : 'Screens');
    const A = api('design'), r = await A('/canvas', { method: 'POST', body: { name: title } }), fid = (r.file || {}).id;
    if (!fid) throw new Error('Could not make the design file.');
    if (tpl && tpl.nodes) {
      const sub = ask && nameFrom(ask, '') !== ask ? ask : (kind === 'logo' ? 'Brand kit · colors and type' : 'Add the details here');
      const vars = { title, sub: sub.slice(0, 120), accent: accentFrom(ask), initial: (title.trim()[0] || 'A').toUpperCase() };
      await A(`/canvas/${encodeURIComponent(fid)}/ops`, { method: 'POST', body: { ops: nodesFrom(tpl, vars) } });
    }
    const p = newPlan(kind, title, tplId, ask, { type: 'canvas', id: fid, pid: pidNow() });
    await savePlan(p); setActive(p);
    await openCanvas(fid);
    const flintAsk = kind === 'screen' ? (tpl ? `make ${tpl.ask}${ask ? ` for ${ask}` : ''}` : ask) : '';
    if (flintAsk) runOnCanvas(flintAsk);
  }
  async function openCanvas(fid) {
    if (projectScope() || (!LF() || !LF().get(fid))) { if (App() && App().show) App().show('canvas'); await new Promise(r => setTimeout(r, 120)); if (window.TribeCanvas) window.TribeCanvas.open(fid); }
    else LF().open(fid);
    dock();
  }
  function runOnCanvas(text) {   // after the canvas has loaded the file: Flint's free screen templates (or the AI) place the screen
    const t0 = Date.now();
    (function wait() {
      const CF = window.TribeCanvasFlint, st = window.TribeCanvas && window.TribeCanvas.state && window.TribeCanvas.state();
      if (CF && CF.run && st && st.open && (st.loaded !== false) && Date.now() - t0 > 500) { Promise.resolve(CF.run(text)).catch(() => {}); return; }
      if (Date.now() - t0 < 8000) setTimeout(wait, 200);
    })();
  }
  async function makeSlides(tplId, ask) {
    const tpl = D().SLIDES.find(x => x.id === tplId) || null;
    const title = nameFrom(ask, tpl ? tpl.t : 'Slides');
    const sub = ask && ask !== title ? ask : tpl ? tpl.d : 'A one-line subtitle';
    const body = tpl ? `<!-- theme: ${tpl.theme} -->\n\n` + tpl.body.replace(/\{\{title\}\}/g, title).replace(/\{\{sub\}\}/g, sub) : `<!-- theme: campfire -->\n\n# ${title}\n\n${sub}\n\n---\n\n## First point\n\n- \n`;
    let target;
    if (projectScope() && window.TribeDocs) {
      if (App() && App().show) App().show('docs');
      const d = (await C.api('/docs', { method: 'POST', body: { title, body, kind: 'deck' } })).doc;
      target = { type: 'doc', id: d.slug, pid: pidNow() };
    } else { const it = await LF().create('slides', { title, body }); target = { type: 'local', id: it.id }; }
    const p = newPlan('slides', title, tplId, ask, target);
    await savePlan(p); setActive(p);
    openTarget(p);
  }
  async function makeBoard(tplId, ask) {
    const tpl = D().BOARDS.find(x => x.id === tplId) || null;
    const title = nameFrom(ask, tpl ? tpl.t : 'Whiteboard'), q = ask || (tpl ? tpl.t : '');
    const A = api('whiteboard'), r = await A('/whiteboard', { method: 'POST', body: { name: title } }), bid = (r.board || {}).id;
    if (!bid) throw new Error('Could not make the whiteboard.');
    const els = tpl ? tpl.els : ask ? [{ id: 'q', t: 'text', x: 60, y: 40, w: 520, h: 40, text: '{{q}}', size: 30, color: '#F8FAFC' }] : [];
    if (els.length) await A(`/whiteboard/${encodeURIComponent(bid)}/ops`, { method: 'POST', body: { ops: els.map((e, i) => ({ ...e, id: e.id + rid(), v: 1, z: i + 1, color: e.color || '#12151A', ...(e.text != null ? { text: fill(e.text, { q }) } : {}) })) } });
    const p = newPlan('whiteboard', title, tplId, ask, { type: 'board', id: bid, pid: pidNow() });
    await savePlan(p); setActive(p);
    openTarget(p);
  }

  // ---------- opening a design (from a plan, Continue, or right after making it) ----------
  async function openTarget(p) {
    const t = p.target || {};
    if (t.pid && connected() && C.project && C.project() !== t.pid && C.switchProject) { try { await C.switchProject(t.pid); } catch {} }
    if (t.type === 'local-site' || t.type === 'build' || t.type === 'code') return showWorkspace(p);
    if (t.type === 'canvas') return openCanvas(t.id);
    if (t.type === 'board') { if (!t.pid && LF() && LF().get(t.id)) LF().open(t.id); else if (window.TribeWhiteboard) window.TribeWhiteboard.open(t.id); return dock(); }
    if (t.type === 'local') { if (LF()) LF().open(t.id); return dock(); }
    if (t.type === 'doc') { if (App() && App().show) App().show('docs'); setTimeout(() => window.TribeDocs && window.TribeDocs.open(t.id), 150); return dock(); }
    if (t.type === 'site') { const SD = window.TribeSiteDesigner; if (SD) await SD.open({ ...(t.pid ? { pid: t.pid } : {}) }); return dock(); }
  }
  async function resume(key, pid) {
    const p = await getPlan(key, pid); if (!p) return toast('That plan is gone.');
    setActive(p); openTarget(p);
  }

  // ---------- the workspace for apps and games: the running starter, its knobs, the plan ----------
  let wsSaid = null;
  function showWorkspace(p) { if (scope === 'project' && document.body.dataset.view !== 'designflow') open({ scope: 'project', quiet: true }); else if (scope === 'home' && !(host && host.isConnected)) { if (window.TribeHub) window.TribeHub.open('design'); } setTimeout(() => workspace(p), 60); }
  async function workspace(p, info) {
    if (!host || !host.isConnected) return showWorkspace(p);
    view = 'workspace'; kindNow = p.kind; if (info) wsSaid = info;
    document.body.classList.add('dfl-deep');
    const s = p.target.starter ? await starter(p.target.starter) : null, k = D().KINDS.find(x => x.id === p.kind) || {};
    const local = p.target.type === 'local-site', it = local && LF() ? LF().get(p.target.id) : null;
    host.innerHTML = `<section class="dfl dfl-ws" id="dfl" data-step="workspace"><button type="button" class="dfl-back" id="dfl-back">${icon('back', 16)}Design</button>
      <div class="dfl-ws-grid"><div class="dfl-ws-main">
        <header class="dfl-head"><span class="eyebrow">${esc(k.t || '')}${s ? ` · ${esc(s.title)}` : ''}</span><h1>${esc(p.title)}</h1>
          ${s ? `<p class="dfl-lead">${esc(s.controls || s.summary)}</p>` : ''}
          ${wsSaid && wsSaid.said && wsSaid.said.length ? `<p class="dfl-said">${icon('flame', 14)}<span><b>${esc(wsSaid.via)}</b> ${esc(wsSaid.said.join(' · '))}</span></p>` : ''}</header>
        <div class="dfl-play" id="dfl-play">${local ? (it ? '<iframe id="dfl-frame" title="Your ' + esc(k.t || 'app') + '" sandbox="allow-scripts allow-pointer-lock"></iframe>' : '<p class="faint">That file is gone from this device.</p>')
          : `<div class="dfl-pv"><span class="dfl-ki">${icon('play', 22)}</span><div><b>${p.target.type === 'code' ? 'A blank start in the project\'s code' : 'Running in the project\'s preview'}</b><small class="faint">${p.target.dir ? esc(p.target.dir) + '/' : 'the project\'s code'}${s ? ` · from ${esc(s.title)} (${esc(s.license)})` : ''}</small></div><button type="button" class="btn sm primary" id="dfl-pv-open">${icon('play', 14)}Open the preview</button></div>`}</div>
        <div class="dfl-acts">${local ? `<button type="button" class="btn sm" id="dfl-reload">${icon('play', 14)}Restart</button><button type="button" class="btn sm" id="dfl-code">${icon('code', 14)}Edit the code</button><button type="button" class="btn sm" id="dfl-dl">${icon('upload', 14)}Download</button>${LF() ? `<button type="button" class="btn sm" id="dfl-move">Move to a project…</button>` : ''}` : `<button type="button" class="btn sm" id="dfl-code">${icon('code', 14)}Open the code</button>`}</div>
        ${s && s.params.length ? `<section class="dfl-knobs" id="dfl-knobs"><span class="eyebrow">Knobs</span><h2>Tweak it</h2><div class="dfl-kgrid" id="dfl-kgrid"></div></section>` : ''}
        ${s ? `<p class="dfl-credit faint">${s.original ? 'An original TribeCode starter' : `Adapted from <a href="${esc(s.source)}" target="_blank" rel="noopener">${esc(s.source.replace(/^https:\/\/github.com\//, ''))}</a> by ${esc(s.by)}`} · ${esc(s.license)} · the LICENSE file travels with the code.</p>` : ''}
      </div><aside class="dfl-plan-host" id="dfl-plan-host"></aside></div></section>`;
    host.querySelector('#dfl-back').onclick = () => swap(kinds);
    planCard(host.querySelector('#dfl-plan-host'), p, { inline: true });
    if (local && it) paintFrame(it);
    const q = id => host.querySelector(id);
    if (q('#dfl-reload')) q('#dfl-reload').onclick = () => paintFrame(LF().get(p.target.id));
    if (q('#dfl-code')) q('#dfl-code').onclick = () => (local ? LF().open(p.target.id) : window.TribeShell && window.TribeShell.go('repo'));
    if (q('#dfl-dl')) q('#dfl-dl').onclick = () => LF().download(p.target.id);
    if (q('#dfl-move')) q('#dfl-move').onclick = e => LF().moveMenu(e.currentTarget, p.target.id);
    if (q('#dfl-pv-open')) q('#dfl-pv-open').onclick = () => window.TribePreview && (window.TribePreview.show ? window.TribePreview.show(p.target.href || '') : window.TribePreview.open());
    if (s && s.params.length) knobs(p, s);
    dock();
  }
  function paintFrame(it) { const f = host && host.querySelector('#dfl-frame'); if (f && it) f.srcdoc = it.body || ''; }
  // the config.js block inside a copy kept on this device
  const CFG_RX = /(<script>\/\* config\.js \*\/\n)([\s\S]*?)(<\/script>)/;
  async function knobs(p, s) {
    const box = host.querySelector('#dfl-kgrid'); if (!box) return;
    let cur = {};
    if (p.target.type === 'local-site') { const it = LF().get(p.target.id), m = it && CFG_RX.exec(it.body || ''); cur = K().read(m ? m[2] : '', s.params); }
    else { try { cur = (await C.api(`/projects/${encodeURIComponent(p.target.pid)}/flint/starter-config`, { method: 'POST', body: { starter: s.id, dir: p.target.dir } })).values || {}; } catch { s.params.forEach(x => { cur[x.key] = x.default; }); } }
    box.innerHTML = s.params.map(x => {
      const v = cur[x.key] ?? x.default, id = 'dfl-k-' + x.key;
      const ctl = x.type === 'number' ? `<input type="range" id="${id}" data-k="${x.key}" min="${x.min}" max="${x.max}" step="${x.step || 1}" value="${esc(v)}"><output for="${id}">${esc(v)}</output>`
        : x.type === 'color' ? `<input type="color" id="${id}" data-k="${x.key}" value="${esc(String(v).length === 4 ? '#' + String(v).slice(1).split('').map(c => c + c).join('') : v)}">`
        : x.type === 'bool' ? `<input type="checkbox" id="${id}" data-k="${x.key}" ${v ? 'checked' : ''}>`
        : `<input class="input" type="text" id="${id}" data-k="${x.key}" value="${esc(v)}" maxlength="200">`;
      return `<label class="dfl-knob dfl-k-${x.type}" for="${id}"><span>${esc(x.label)}</span>${ctl}</label>`;
    }).join('');
    let t = 0;
    box.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener(inp.type === 'text' ? 'change' : 'input', () => {
      if (inp.type === 'range') inp.nextElementSibling.textContent = inp.value;
      clearTimeout(t); t = setTimeout(() => setKnob(p, s, { [inp.dataset.k]: inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? Number(inp.value) : inp.value }), 260);
    }));
  }
  async function setKnob(p, s, values) {
    if (p.target.type === 'local-site') {
      const it = LF().get(p.target.id); if (!it) return;
      const body = String(it.body || '').replace(CFG_RX, (a, x, cfg, z) => x + K().apply(cfg, values, s.params) + z);
      await LF().save(it.id, { body }); paintFrame({ body });
    } else {
      try { await C.api(`/projects/${encodeURIComponent(p.target.pid)}/flint/starter-config`, { method: 'POST', body: { starter: s.id, dir: p.target.dir, values } }); } catch (e) { toast(e.message); }
    }
  }

  // ---------- the Plan card (inline in the workspace, or docked beside any editor) ----------
  function planCard(box, p, o = {}) {
    if (!box || !p) return;
    const done = p.steps.filter(s => s.done).length, k = D().KINDS.find(x => x.id === p.kind) || {};
    box.innerHTML = `<div class="dfl-plan${o.inline ? ' inline' : ''}" id="${o.inline ? 'dfl-plan' : 'dfl-dock-plan'}" data-plan="${esc(p.key)}">
      <div class="dfl-plan-h"><span class="dfl-ki sm">${icon(k.icon || 'tasks', 16)}</span><div><span class="eyebrow">Plan · ${esc(k.t || p.kind)}</span><b>${esc(p.title)}</b></div><span class="dfl-prog" aria-label="${done} of ${p.steps.length} done">${done}/${p.steps.length}</span>
        ${o.inline ? '' : `<button type="button" class="dfl-x" data-pl="min" aria-label="Fold the plan">${icon('back', 14)}</button><button type="button" class="dfl-x" data-pl="close" aria-label="Close the plan">${icon('x', 14)}</button>`}</div>
      <div class="dfl-bar" aria-hidden="true"><i style="width:${Math.round(done / Math.max(1, p.steps.length) * 100)}%"></i></div>
      <ol class="dfl-steps">${p.steps.map((s, i) => `<li class="${s.done ? 'done' : ''}" data-step="${esc(s.id)}"><label class="dfl-tick"><input type="checkbox" data-tick="${esc(s.id)}" ${s.done ? 'checked' : ''} aria-label="Done: ${esc(s.t)}"><span class="dfl-box">${icon('check', 12)}</span></label>
        <div class="dfl-st"><b><span class="dfl-n">${i + 1}</span>${esc(s.t)}</b><small>${esc(s.d)}</small>${s.act ? `<button type="button" class="dfl-go" data-act="${esc(s.id)}">${icon(ACT_ICON[s.act.k] || 'chev', 13)}${esc(s.act.label || 'Open')}</button>` : ''}</div></li>`).join('')}</ol>
      <div class="dfl-plan-f"><button type="button" class="btn sm" id="${o.inline ? 'dfl-addtasks' : 'dfl-dock-addtasks'}" data-addtasks>${icon('tasks', 14)}Add these steps as tasks</button></div></div>`;
    box.querySelectorAll('[data-tick]').forEach(c => c.onchange = async () => { const np = await tick(p, c.dataset.tick, c.checked); Object.assign(p, np || {}); active = p; planCard(box, p, o); });
    box.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(p, p.steps.find(s => s.id === b.dataset.act)));
    box.querySelector('[data-addtasks]').onclick = () => addTasks(p);
    box.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => { if (b.dataset.pl === 'close') { setActive(null); } else { const d = $('#dfl-dock'); if (d) d.classList.toggle('min'); } });
  }
  const ACT_ICON = { open: 'chev', play: 'play', tweak: 'sliders', inspo: 'image', canvas: 'canvas', whiteboard: 'whiteboard', flint: 'flame', tribe: 'people', tasks: 'tasks', publish: 'upload' };
  async function act(p, s) {
    if (!s || !s.act) return;
    const a = s.act, t = p.target || {};
    if (a.k === 'open') return openTarget(p);
    if (a.k === 'play') { if (t.type === 'build' && window.TribePreview && window.TribePreview.show) return window.TribePreview.show(t.href || ''); return openTarget(p); }
    if (a.k === 'tweak') { await openTarget(p); setTimeout(() => { const k = $('#dfl-knobs'); if (k) k.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, 200); return; }
    if (a.k === 'inspo') { if (window.TribeInspoBoard) return window.TribeInspoBoard.open({ q: a.q || p.title }); return toast('The inspiration board did not load.'); }
    if (a.k === 'canvas') { if (projectScope() || t.pid) { if (App()) App().show('canvas'); setTimeout(() => window.TribeCanvas && window.TribeCanvas.open(), 120); } else if (LF()) { const it = await LF().create('design', { title: `${p.title} screens` }); LF().open(it.id); } return dock(); }
    if (a.k === 'whiteboard') { if (projectScope() || t.pid) { if (window.TribeWhiteboard) window.TribeWhiteboard.open(); } else if (LF()) { const it = await LF().create('whiteboard', { title: `${p.title} flow` }); LF().open(it.id); } return dock(); }
    if (a.k === 'flint') { const F = window.TribeFlint; if (F && F.prefill) F.prefill(`${a.q}${p.title ? ` (${p.title})` : ''}`); else if (F && F.focus) F.focus(); return; }
    if (a.k === 'tribe') { if (connected() && window.TribeShell) return window.TribeShell.go('chat'); return toast('Share it with your tribe: start a project from Home (it begins on this device), then invite friends.'); }
    if (a.k === 'tasks') return addTasks(p);
    if (a.k === 'publish') {
      if (t.type === 'local-site' && LF()) { LF().download(t.id); return toast('Downloaded the HTML: it runs anywhere, or host it free on GitHub Pages.'); }
      if (t.type === 'build' || t.type === 'code') { if (window.TribePublish && window.TribePublish.open) return window.TribePublish.open(); if (window.TribeShell) return window.TribeShell.go('website'); }
      if (t.type === 'site') { await openTarget(p); return toast('Use Download HTML in the website designer, or publish it with the project.'); }
      return openTarget(p);
    }
  }
  async function addTasks(p) {
    const T = window.TribeTasks; if (!T || !T.create) return toast('Tasks did not load. Reload the app.');
    const left = p.steps.filter(s => !s.done), type = p.kind === 'game' || p.kind === 'app' ? 'build' : 'design';
    for (const s of left) { try { await T.create(`${p.title}: ${s.t}`, 'todo', { type }); } catch (e) { return toast(e.message); } }
    toast(`Added ${left.length} task${left.length === 1 ? '' : 's'} to the board.`);
    document.dispatchEvent(new CustomEvent('tribe-design-tasks', { detail: { key: p.key, n: left.length } }));
  }

  // ---------- the dock: the active plan beside whatever editor is open ----------
  function dock() {
    let d = $('#dfl-dock');
    const flowShown = !!(host && host.isConnected && view === 'workspace' && host.offsetParent !== null);
    if (!active || flowShown) { if (d) d.hidden = true; return; }
    if (!d) { d = document.createElement('aside'); d.id = 'dfl-dock'; d.className = 'dfl-dock'; d.setAttribute('aria-label', 'Plan'); document.body.appendChild(d); }
    d.hidden = false;
    planCard(d, active, {});
  }
  // the dock follows the view: hidden while the workspace shows the plan inline, back when you leave it
  new MutationObserver(() => dock()).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  addEventListener('hashchange', () => setTimeout(dock, 50));
  if (C && C.on) { try { C.on('design-plans', m => { if (active && m.key === active.key && m.project === active.target.pid) getPlan(active.key, active.target.pid).then(p => { if (p) { active = p; dock(); const ip = host && host.querySelector('#dfl-plan-host'); if (ip && ip.isConnected) planCard(ip, p, { inline: true }); } }); }); } catch {} }
  // a plan you had open comes back after a reload
  setTimeout(async () => { const a = ls.get(AKEY, null); if (a && a.key && !active) { const p = await getPlan(a.key, a.pid); if (p) { active = p; dock(); } } }, 1500);

  // ---------- the project's Design page ----------
  function section() {
    let sec = $('#view-designflow'); if (sec) return sec;
    const main = $('#main') || $('.main'); if (!main) return null;
    sec = document.createElement('section'); sec.id = 'view-designflow'; sec.className = 'hidden'; main.appendChild(sec);
    return sec;
  }
  function open(opts = {}) {
    if ((opts.scope || (connected() && C.project && C.project() ? 'project' : 'home')) === 'home') { if (window.TribeHub) window.TribeHub.open('design'); return; }
    const sec = section(); if (!sec) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = 'designflow';
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = 'Design';
    if (!opts.quiet || !host || !sec.contains(host)) { sec.innerHTML = '<div class="dfl-page" id="dfl-page"></div>'; mount(sec.querySelector('#dfl-page'), { scope: 'project' }); }
    if (opts.kind) gallery(opts.kind);
  }
  // Design in a project opens the flow (capture: before shell.js's own handler opens the canvas)
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-pnav="canvas"], [data-dest="canvas"]');
    if (!b || e.defaultPrevented || !(window.TribeDesignData)) return;
    if (!(connected() && C.project && C.project())) return;
    e.preventDefault(); e.stopImmediatePropagation();
    swap(() => open({ scope: 'project' }));
    document.querySelectorAll('.side [data-pnav], #tabbar [data-pnav]').forEach(x => { const on = x.dataset.pnav === 'canvas'; x.classList.toggle('on', on); if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  }, true);

  // ---------- Flint: "make a breakout game" (flintlocal.js) ----------
  async function fromFlint(starterId, text) {
    const s = await starter(starterId); if (!s) return null;
    scope = connected() && C.project && C.project() ? 'project' : 'home';
    if (scope === 'project') open({ scope: 'project' }); else if (window.TribeHub) window.TribeHub.open('design');
    await new Promise(r => setTimeout(r, 150));
    await makeCode(s.kind, s.id, text);
    return s;
  }

  window.TribeDesignFlow = { mount, open, gallery: k => gallery(k), kinds: () => kinds(), create, plan: () => active, showPlan: resume, fromFlint, catalog, dock, icon, addTasks: () => active && addTasks(active), view: () => view };
})();
