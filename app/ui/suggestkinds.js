// The suggestion engine's built-in providers (docs/SUGGESTIONS.md), registered with window.TribeSuggest:
//   site    what the tribe said that would change the website (server/sitesuggest.js: chat, tasks, docs, decisions, comments)
//   talk    features people asked for in chat, docs and decisions that no task covers yet -> a task
//   files   new text files -> a doc; new audio -> the music in Motion Studio (when it is there)
//   photos  new pictures: their colours for the site, a wide one as the top picture, several as a gallery
//           (read on this device: a small canvas, never uploaded or sent anywhere)
//   edits   the same edit made four times -> do it to the rest ("make the other headings bigger too?")
//   brand   one colour or font changed in one place -> use it everywhere (the website and the brand kit)
// All rule-based: no AI. Each provider reads only what a member of the project may read.
(function () {
  'use strict';
  const T = () => window.TribeSuggest, C = window.TribeClient, CORE = () => window.TribeSuggestCore, S = () => window.TribeSiteCfg;
  if (!window.TribeSuggest) return;
  const pidOf = ctx => encodeURIComponent(ctx.projectId);
  const online = () => !!(C && C.connected && C.connected()) && !(window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo());
  const media = u => { const abs = u.startsWith('/') ? C.base() + u : u; return window.TribeMedia ? window.TribeMedia.url(abs) : abs; };
  const short = (s, n = 40) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const WHERE = { chat: 'in chat', task: 'in a task', doc: 'in a doc', update: 'in an update', decision: 'in a decision', proposal: 'in a proposal', comment: 'in a comment on the site' };
  async function site(ctx) { if (!online() || !ctx.projectId) return null; try { const r = await C.api(`/projects/${pidOf(ctx)}/site-config`); return r && r.config ? r : null; } catch { return null; } }
  async function uploads(ctx) { if (!online() || !ctx.projectId) return []; try { const r = await C.api(`/uploads?project=${pidOf(ctx)}`); return (r && r.project || []).filter(f => !f.project || f.project === ctx.projectId); } catch { return []; } }
  const firstOf = (cfg, types) => { for (const pg of cfg.pages || []) for (const b of pg.blocks || []) if (types.includes(b.type)) return { pg, b }; return null; };
  const has = (cfg, type) => !!firstOf(cfg, [type]);

  // ---------- site: the website designer's suggestions, outside the designer too ----------
  T().register({
    id: 'site', title: 'The website',
    async gather(ctx) { if (!online() || !ctx.projectId) return null; try { const r = await C.api(`/projects/${pidOf(ctx)}/site-suggestions`); return r && !r.none ? { list: r.suggestions || [] } : null; } catch { return null; } },
    async suggest(ctx, g) {
      return g.list.map(s => ({ id: s.id, kind: 'site-' + s.kind, title: s.title, before: s.before, after: s.after, score: s.source && s.source.decided ? 1.5 : 1.2, cap: 'site.edit',
        why: s.source ? `${s.source.who || 'Someone'} ${WHERE[s.source.kind] || ''}: “${short(s.source.text, 120)}”` : '',
        from: s.source ? [{ kind: s.source.kind, ref: s.source.id, who: s.source.who || '' }] : [],
        apply: async () => { const u = await T().siteApply({ ops: s.ops }); C.api(`/projects/${pidOf(ctx)}/site-suggestions/applied`, { method: 'POST', body: { id: s.id, title: s.title, before: s.before, after: s.after, target: s.target, source: s.source } }).catch(() => {}); if (window.TribeSiteSuggest && window.TribeSiteSuggest.reset) window.TribeSiteSuggest.reset(); return u; },
        dismiss: () => C.api(`/projects/${pidOf(ctx)}/site-suggestions/dismiss`, { method: 'POST', body: { id: s.id } }) }));
    },
  });

  // ---------- talk: asked for, not planned ----------
  T().register({
    id: 'talk', title: 'Chat, tasks and docs',
    async gather(ctx) { if (!online() || !ctx.projectId) return null; try { const r = await C.api(`/projects/${pidOf(ctx)}/suggest/signals`); return { sources: (r.sources || []).filter(s => s.kind !== 'task').map(s => ({ id: s.id, kind: s.kind, who: s.who, text: s.text })), tasks: (r.tasks || []).map(t => ({ title: t.title, desc: t.desc })) }; } catch { return null; } },
    async suggest(ctx, g) {
      return CORE().asks(g.sources, g.tasks).slice(0, 6).map(a => ({ id: 'ask-' + a.key, kind: 'ask', title: `Make a task: ${a.title}`, score: a.score,
        why: `${a.n === 1 ? 'Asked for once' : `Asked for ${a.n} times`}${a.people > 1 ? ` by ${a.people} people` : ''}, and no task covers it yet.`,
        from: a.from.map(f => ({ kind: f.kind, ref: f.ref, who: f.who })),
        apply: () => T().makeTask(a.title, a.from.map(f => `${f.who || 'Someone'}: “${f.text}”`).join('\n')) }));
    },
  });

  // ---------- files: a text file becomes a doc; a song goes under a motion graphic ----------
  T().register({
    id: 'files', title: 'New files',
    async gather(ctx) { const since = Date.now() - 21 * 864e5; return (await uploads(ctx)).filter(f => Date.parse(f.at) > since && /^(text|audio)$/.test(f.kind) && f.size < 300000).slice(0, 12).map(f => ({ id: f.id, name: f.name, kind: f.kind, by: f.byName || '', size: f.size })); },
    async suggest(ctx, files) {
      const out = [];
      for (const f of files) {
        if (f.kind === 'text' && /\.(md|txt)$/i.test(f.name)) out.push({ id: 'doc-' + f.id, kind: 'file-doc', title: `Turn “${short(f.name, 32)}” into a doc`, why: 'A doc everyone can read, edit and comment on, with the file’s words in it.', from: [{ kind: 'file', ref: f.id, who: f.by, label: short(f.name, 24) }],
          apply: async () => { const r = await fetch(media(`/api/uploads/${encodeURIComponent(f.id)}/raw`)); if (!r.ok) throw new Error('could not read the file'); const body = (await r.text()).slice(0, 380000); const d = await C.api('/docs', { method: 'POST', body: { title: f.name.replace(/\.(md|txt)$/i, ''), body } }); const slug = d && d.doc && d.doc.slug; return async () => { if (slug) await C.api('/docs/' + encodeURIComponent(slug), { method: 'DELETE' }); }; } });
        const M = window.TribeMotionStudio;
        if (f.kind === 'audio' && M && typeof M.useSong === 'function') out.push({ id: 'song-' + f.id, kind: 'file-song', title: `Use “${short(f.name, 32)}” as the music in Motion Studio`, why: 'Motion Studio finds its beat and puts every change on it.', from: [{ kind: 'file', ref: f.id, who: f.by, label: short(f.name, 24) }],
          apply: async () => { const u = await M.useSong({ uploadId: f.id, name: f.name, url: media(`/api/uploads/${encodeURIComponent(f.id)}/raw`) }); return typeof u === 'function' ? u : null; } });
      }
      return out;
    },
  });

  // ---------- photos: read on this device, at 64 pixels ----------
  const seen = new Map();   // upload id -> { w, h, colors }
  function look(f) {
    return new Promise(res => {
      const img = new Image(); img.decoding = 'async';
      img.onload = () => { try { const k = 64 / Math.max(img.naturalWidth, img.naturalHeight), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k)); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h); res({ w: img.naturalWidth, h: img.naturalHeight, colors: CORE().palette(g.getImageData(0, 0, w, h).data, w, h, 5) }); } catch { res(null); } };
      img.onerror = () => res(null);
      img.src = media(`/api/uploads/${encodeURIComponent(f.id)}/raw`);
    });
  }
  // a picture for the site, made on this device: at most 1600 pixels, JPEG
  function picture(f, max = 1600) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.82)); };
      img.onerror = () => rej(new Error('could not read the picture'));
      img.src = media(`/api/uploads/${encodeURIComponent(f.id)}/raw`);
    });
  }
  const alt = f => short(String(f.name || 'A picture').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '), 80);
  T().register({
    id: 'photos', title: 'New photos',
    async gather(ctx) {
      const since = Date.now() - 30 * 864e5;
      const pics = (await uploads(ctx)).filter(f => f.kind === 'image' && !/svg/.test(f.type || '') && Date.parse(f.at) > since).slice(0, 8);
      if (!pics.length) return null;
      for (const f of pics) { if (!seen.has(f.id)) { await T().idle(); seen.set(f.id, await look(f)); } }
      const r = await site(ctx);
      return { pics: pics.map(f => ({ id: f.id, name: f.name, by: f.byName || '', ...(seen.get(f.id) || {}) })).filter(p => p.w), site: r ? { rev: r.rev, accent: S().colors(S().normalize(r.config)).accent, heroImg: !!((firstOf(r.config, ['hero']) || { b: { props: {} } }).b.props.img), hero: !!firstOf(r.config, ['hero']), gallery: has(r.config, 'gallery') } : null };
    },
    async suggest(ctx, g) {
      const out = [], who = p => p.by ? `${p.by}’s photo` : 'a new photo';
      if (!g.site) return out;
      const p0 = g.pics[0], acc = p0 && CORE().accentOf(p0.colors);
      if (acc && !CORE().near(acc, g.site.accent)) out.push({ id: 'palette-' + p0.id + acc, kind: 'photo-palette', cap: 'site.edit', title: `Use the colours from ${who(p0)} on the website`, before: g.site.accent, after: acc, why: `The liveliest colour in “${short(p0.name, 30)}” becomes the website’s main colour (buttons and links).`, from: [{ kind: 'photo', ref: p0.id, who: p0.by, label: short(p0.name, 24) }],
        apply: () => T().siteApply({ ops: [{ op: 'accent', color: acc }] }) });
      const wide = g.pics.find(p => CORE().shape(p.w, p.h) === 'wide' && p.w >= 1000);
      if (wide && g.site.hero && !g.site.heroImg) out.push({ id: 'hero-' + wide.id, kind: 'photo-hero', cap: 'site.edit', title: `Use ${who(wide)} as the top picture`, why: `“${short(wide.name, 30)}” is wide (${wide.w}×${wide.h}), which suits the top of the page, and the top has no picture yet.`, from: [{ kind: 'photo', ref: wide.id, who: wide.by, label: short(wide.name, 24) }],
        apply: async () => { const src = await picture(wide); return T().siteApply({ fn: cfg => { const h = firstOf(cfg, ['hero']); return h ? S().setImage(cfg, h.pg.id, h.b.id, '', src, alt(wide)) : cfg; } }); } });
      if (g.pics.length >= 3 && !g.site.gallery) { const use = g.pics.slice(0, 6); out.push({ id: 'gallery-' + use.map(p => p.id).join('').slice(0, 40), kind: 'photo-gallery', cap: 'site.edit', title: `Add a gallery with the ${use.length} new photos`, why: 'Several pictures were added lately and the website has no gallery to show them.', from: use.slice(0, 3).map(p => ({ kind: 'photo', ref: p.id, who: p.by, label: short(p.name, 18) })),
        apply: async () => { const srcs = []; for (const p of use) srcs.push(await picture(p, 900)); return T().siteApply({ fn: cfg => { const c0 = S().normalize(cfg), pg = c0.pages[0]; const r = S().addBlock(c0, pg.id, 'gallery'); let c = r.cfg; c = S().setProp(c, pg.id, r.block.id, 'items', srcs.map((src, i) => ({ img: src, alt: alt(use[i]), caption: '' }))); return c; } }); } }); }
      return out;
    },
  });

  // ---------- edits: the same change four times ----------
  const WHAT = { heading: ['heading', 'headings'], text: ['paragraph', 'paragraphs'], button: ['button', 'buttons'], 'entry title': ['entry title', 'entry titles'] };
  const DID = p => p.prop === 'size' ? (p.dir > 0 ? 'bigger' : 'smaller') : p.prop === 'bold' ? (p.value ? 'bold' : 'not bold') : p.prop === 'align' ? `aligned ${p.value}` : p.prop === 'color' ? `in the ${p.value === 'accent' ? 'main colour' : p.value === 'muted' ? 'quiet colour' : 'ink colour'}` : p.prop === 'font' ? `in the ${p.value} font` : 'changed';
  T().register({
    id: 'edits', title: 'Your edits',
    async gather(ctx) {
      let log = []; try { log = (JSON.parse(localStorage.getItem(`tribecode.suggest.${ctx.projectId || 'local'}`) || '{}').edits || []); } catch {}
      const pats = CORE().editPatterns(log).filter(p => p.tool === 'site'); if (!pats.length) return null;
      const r = await site(ctx); if (!r) return null;
      return { pats: pats.map(p => ({ ...p, ops: CORE().siteTargets(r.config, p) })).filter(p => p.ops.length) };
    },
    async suggest(ctx, g) {
      return g.pats.slice(0, 3).map(p => { const w = WHAT[p.what] || [p.what, p.what + 's']; return { id: 'pat-' + CORE().hash(p.key + p.ops.length), kind: 'edit-' + p.prop, cap: 'site.edit',
        title: `You made ${p.n} ${w[1]} ${DID(p)}. Make the other ${p.ops.length === 1 ? w[0] : `${p.ops.length} ${w[1]}`} ${DID(p)} too?`,
        why: 'The same change, made by hand several times this week, done once for the rest.', from: [{ kind: 'edit', ref: p.key, who: 'your', label: `${p.n} ${w[1]}` }],
        apply: () => T().siteApply({ ops: p.ops }) }; });
    },
  });

  // ---------- brand: one colour or font, everywhere ----------
  T().register({
    id: 'brand', title: 'The brand',
    async gather(ctx) {
      const r = await site(ctx); if (!r) return null;
      let kit = null; try { kit = (await C.api(`/projects/${pidOf(ctx)}/brand`)).kit; } catch {}
      const c = S().normalize(r.config), siteNow = { accent: S().colors(c).accent, display: (c.theme.fonts || {}).display || '' };
      const kitNow = kit ? { accent: (kit.colors || {}).accent || '', display: (kit.fonts || {}).display || '' } : { accent: '', display: '' };
      const key = `tribecode.suggest.brand.${ctx.projectId}`; let last = null; try { last = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
      try { localStorage.setItem(key, JSON.stringify({ site: last && last.site && !sameish(last.site, siteNow) && sameish(last.kit, kitNow) ? last.site : siteNow, kit: kitNow, seen: { site: siteNow, kit: kitNow } })); } catch {}
      return { siteNow, kitNow, last: last && last.seen ? last.seen : null, cfg: c, kit };
    },
    async suggest(ctx, g) {
      const out = [], put = async kit => { await C.api(`/projects/${pidOf(ctx)}/brand`, { method: 'PUT', body: { kit } }); };
      if (!g.kitNow.accent) { out.push({ id: 'kit-from-site', kind: 'brand-save', title: 'Save the website’s colours and fonts as the brand kit', why: 'The brand kit is empty. The Design canvas, the app and new pages then start from the same colours and fonts.', from: [{ kind: 'site', ref: 'theme', who: '' }], apply: async () => { const before = g.kit; await put(S().kitFromSite(g.cfg)); return async () => put(before || {}); } }); return out; }
      const L = g.last;
      const siteMoved = L && L.site && !CORE().near(L.site.accent, g.siteNow.accent) && CORE().near(L.kit.accent, g.kitNow.accent);
      const kitMoved = L && L.kit && !CORE().near(L.kit.accent, g.kitNow.accent) && CORE().near(L.site.accent, g.siteNow.accent);
      if (!CORE().near(g.siteNow.accent, g.kitNow.accent)) {
        if (kitMoved || !siteMoved) out.push({ id: 'site-accent-' + g.kitNow.accent, kind: 'brand-to-site', cap: 'site.edit', title: 'Use the brand kit’s main colour on the website', before: g.siteNow.accent, after: g.kitNow.accent, why: 'The brand kit and the website disagree on the main colour.', from: [{ kind: 'brand', ref: 'kit', who: '' }], apply: () => T().siteApply({ ops: [{ op: 'accent', color: g.kitNow.accent }] }) });
        if (siteMoved) out.push({ id: 'kit-accent-' + g.siteNow.accent, kind: 'brand-to-kit', title: 'Use the website’s new main colour in the brand kit too', before: g.kitNow.accent, after: g.siteNow.accent, why: 'The website’s main colour changed; the brand kit still has the old one, so the Design canvas and new things would not match.', from: [{ kind: 'site', ref: 'theme', who: '' }], apply: async () => { const before = g.kit; await put({ ...g.kit, colors: { ...(g.kit.colors || {}), accent: g.siteNow.accent } }); return async () => put(before); } });
      }
      if (g.siteNow.display && g.kitNow.display && g.siteNow.display !== g.kitNow.display) out.push({ id: 'kit-font-' + g.siteNow.display, kind: 'brand-font', title: `Use ${g.siteNow.display} for headings in the brand kit too`, before: g.kitNow.display, after: g.siteNow.display, why: 'The website’s heading font and the brand kit’s are different.', from: [{ kind: 'site', ref: 'fonts', who: '' }], apply: async () => { const before = g.kit; await put({ ...g.kit, fonts: { ...(g.kit.fonts || {}), display: g.siteNow.display } }); return async () => put(before); } });
      return out;
    },
  });
  function sameish(a, b) { return !!a && !!b && CORE().near(a.accent, b.accent) && (a.display || '') === (b.display || ''); }
})();
