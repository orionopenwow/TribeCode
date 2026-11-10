// Design canvas scene graph (P1-A/B/D, docs/EDITOR-PARITY.md). The model behind app/ui/canvas/canvas.js: a flat map of
// nodes (see server/canvas.js for the shape), tree helpers, the CSS each node renders with, and export to HTML + CSS.
// One function, styleOf(), decides how a node looks: the editor renders layers as real DOM with exactly these styles,
// and toHTML() writes the same declarations into a stylesheet. Auto layout is display:flex, so what you design is what
// ships (P1-C uses toHTML to send a frame to the app).
//   window.TribeCanvasScene = { create(), styleOf, toHTML, CONTAINERS, DEFAULTS }
(function () {
  'use strict';
  const CONTAINERS = new Set(['frame', 'group', 'component']);
  const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
  const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' };
  const FONT = { 'Inter': "'Inter', system-ui, sans-serif", 'Inter Display': "'Inter Display', 'Inter', system-ui, sans-serif", 'JetBrains Mono': "'JetBrains Mono', ui-monospace, monospace", 'Georgia': 'Georgia, serif', 'system-ui': 'system-ui, sans-serif' };
  const DEFAULTS = {
    frame: { w: 100, h: 100, fill: '#FFFFFF', clip: true, name: 'Frame' },
    component: { w: 100, h: 100, fill: '#FFFFFF', clip: true, name: 'Component' },
    rect: { w: 100, h: 100, fill: '#D9D9D9', name: 'Rectangle' },
    ellipse: { w: 100, h: 100, fill: '#D9D9D9', name: 'Ellipse' },
    text: { w: 40, h: 21, name: 'Text', sz: { h: 'hug', v: 'hug' }, tx: { c: 'Text', f: 'Inter', s: 16, wt: 400, lh: 1.3, al: 'left', col: '#12151A' } },
    group: { name: 'Group' },
  };
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const rid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);

  function create() {
    const nodes = new Map();          // id -> node (tombstones kept with del, for versions)
    const S = {
      nodes,
      rid,
      get: id => { const n = nodes.get(id); return n && !n.del ? n : null; },
      live: () => [...nodes.values()].filter(n => !n.del),
      kids(id) { return S.live().filter(n => (n.p || '') === (id || '') && (id === '' || S.get(n.p))).sort((a, b) => (a.i || 0) - (b.i || 0)); },
      roots() { return S.live().filter(n => !n.p || !S.get(n.p)).sort((a, b) => (a.i || 0) - (b.i || 0)); },
      parentOf: n => (n && n.p ? S.get(n.p) : null),
      rootOf(n) { let r = n, k = 0; while (r && r.p && S.get(r.p) && k++ < 200) r = S.get(r.p); return r; },
      isAncestor(a, b) { let k = 0, x = S.get(b); while (x && x.p && k++ < 200) { if (x.p === a) return true; x = S.get(x.p); } return false; },
      descendants(id) { const out = []; const walk = p => S.kids(p).forEach(c => { out.push(c); walk(c.id); }); walk(id); return out; },
      inFlow(n) { const p = S.parentOf(n); return !!(p && p.lay && (p.t === 'frame' || p.t === 'component')); },
      nextI(p) { const k = S.kids(p || ''); return k.length ? (k[k.length - 1].i || 0) + 1 : 1; },
      components: () => S.live().filter(n => n.t === 'component').sort((a, b) => String(a.name).localeCompare(String(b.name))),
      instancesOf: cid => S.live().filter(n => n.t === 'instance' && n.comp === cid),
      // the node an instance shows for a source node: the source with the instance's overrides on top
      resolved(src, inst) {
        if (!inst || !inst.ov) return src;
        const o = inst.ov[src.id]; if (!o) return src;
        const r = clone(src);
        if (o.fill) r.fill = o.fill;
        if (o.hide != null) r.hide = o.hide;
        if (o.c != null && r.tx) r.tx.c = o.c;
        return r;
      },
      // instance root: the component's look with the instance's place, size and own overrides
      instanceLook(inst) {
        const comp = S.get(inst.comp); if (!comp) return null;
        const r = clone(comp);
        Object.assign(r, { id: inst.id, t: 'instance', p: inst.p, i: inst.i, x: inst.x, y: inst.y, w: inst.w, h: inst.h, rot: inst.rot, name: inst.name, hide: inst.hide, lock: inst.lock, comp: inst.comp, ov: inst.ov });
        if (inst.sz) r.sz = clone(inst.sz);
        const self = inst.ov && inst.ov.self;
        if (self && self.fill) r.fill = self.fill;
        return r;
      },
      reset() { nodes.clear(); },
    };
    return S;
  }

  // ---------- the CSS for one node ----------
  // n: the node (already resolved for instances), parent: its parent's look (or null for a top-level layer).
  function styleOf(n, parent) {
    const st = {};
    const flow = !!(parent && parent.lay);
    const sz = n.sz || { h: 'fixed', v: 'fixed' };
    const isText = n.t === 'text';
    const hugs = n.lay || isText;
    if (!flow) { st.position = 'absolute'; st.left = px(n.x); st.top = px(n.y); }
    else { st.position = 'relative'; st['flex-shrink'] = '0'; }
    // width
    if (sz.h === 'hug' && hugs) st.width = isText ? 'max-content' : 'fit-content';
    else if (sz.h === 'fill' && flow) { if (parent.lay.d === 'row') { st.flex = '1 1 0'; st['min-width'] = '0'; } else st['align-self'] = 'stretch'; }
    else st.width = px(n.w);
    // height
    if (sz.v === 'hug' && hugs) st.height = 'fit-content';
    else if (sz.v === 'fill' && flow) { if (parent.lay.d === 'col') { st.flex = '1 1 0'; st['min-height'] = '0'; } else st['align-self'] = 'stretch'; }
    else st.height = px(n.h);
    st['box-sizing'] = 'border-box';
    if (n.fill && !isText && n.t !== 'group') st.background = n.fill;
    if (n.stroke && n.sw) st.border = `${px(n.sw)} solid ${n.stroke}`;
    if (n.t === 'ellipse') st['border-radius'] = '50%';
    else if (n.r) st['border-radius'] = px(n.r);
    if (n.op != null && n.op !== 1) st.opacity = String(n.op);
    if (n.rot) st.transform = `rotate(${n.rot}deg)`;
    if (n.clip && (n.t === 'frame' || n.t === 'component' || n.t === 'instance')) st.overflow = 'hidden';
    if (n.lay) {
      const l = n.lay, p = l.p || [0, 0, 0, 0];
      st.display = 'flex';
      st['flex-direction'] = l.d === 'row' ? 'row' : 'column';
      if (l.g) st.gap = px(l.g);
      if (p.some(Boolean)) st.padding = p.map(px).join(' ');
      st['align-items'] = ALIGN[l.ai] || 'flex-start';
      st['justify-content'] = JUSTIFY[l.jc] || 'flex-start';
      if (l.wr) st['flex-wrap'] = 'wrap';
    }
    if (isText) {
      const t = n.tx || {};
      st.color = t.col || '#12151A';
      st['font-family'] = FONT[t.f] || FONT.Inter;
      st['font-size'] = px(t.s || 16);
      st['font-weight'] = String(t.wt || 400);
      st['line-height'] = String(t.lh || 1.3);
      st['text-align'] = t.al || 'left';
      st['white-space'] = sz.h === 'hug' ? 'pre' : 'pre-wrap';
      st['overflow-wrap'] = 'break-word';
    }
    if (n.hide) st.display = 'none';
    return st;
  }
  const px = v => `${Math.round((Number(v) || 0) * 100) / 100}px`;
  const cssText = st => Object.entries(st).map(([k, v]) => `${k}: ${v};`).join(' ');

  // ---------- export: a frame (or any container) as HTML + CSS ----------
  // Returns { html, css, name }. Class names come from layer names; text is escaped; auto layout is flex.
  function toHTML(S, id, opts = {}) {
    const top = S.get(id); if (!top) return null;
    const used = new Map(), rules = [];
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cls = name => {
      let b = String(name || 'layer').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layer';
      if (/^[0-9]/.test(b)) b = 'l-' + b;
      const n = used.get(b) || 0; used.set(b, n + 1);
      return n ? `${b}-${n + 1}` : b;
    };
    function emit(n, parentLook, depth, inst) {
      const look = n.t === 'instance' ? S.instanceLook(n) : (inst ? S.resolved(n, inst) : n);
      if (!look) return '';
      const st = styleOf(look, parentLook);
      if (depth === 0) { delete st.left; delete st.top; st.position = 'relative'; }
      const c = cls(look.name || look.t);
      rules.push(`.${c} { ${cssText(st)} }`);
      const pad = '  '.repeat(depth);
      if (look.t === 'text') {
        const tag = (look.tx && look.tx.s >= 28) ? 'h2' : 'p';
        return `${pad}<${tag} class="${c}">${esc(look.tx ? look.tx.c : '')}</${tag}>`;
      }
      const kids = n.t === 'instance' ? S.kids(n.comp) : S.kids(n.id);
      const nextInst = n.t === 'instance' ? n : inst;
      const inner = kids.map(k => emit(k, look, depth + 1, nextInst)).filter(Boolean).join('\n');
      const tag = depth === 0 ? 'section' : 'div';
      return inner ? `${pad}<${tag} class="${c}">\n${inner}\n${pad}</${tag}>` : `${pad}<${tag} class="${c}"></${tag}>`;
    }
    const html = emit(top, null, 0, null);
    // colors become CSS variables on .tc-design (polish: one place to retheme the exported design)
    const vars = new Map(); let nv = 0;
    
    const out = rules.map(r => r.replace(/([a-z-]+): ([^;]*?)(#[0-9A-Fa-f]{6})\b/g, (m, prop, pre, h) => {
      const key = h.toUpperCase();
      if (!vars.has(key)) vars.set(key, `--color-${++nv}`);
      return `${prop}: ${pre}var(${vars.get(key)})`;
    }));
    const root = vars.size && opts.vars !== false ? `.tc-design { ${[...vars].map(([h, v]) => `${v}: ${h};`).join(' ')} }\n` : '';
    const css = (opts.reset === false ? '' : '.tc-design * { margin: 0; }\n') + (opts.vars === false ? rules : (root + out.join('\n')).split('\n')).join('\n');
    return { name: top.name || 'Frame', html: `<div class="tc-design">\n${html}\n</div>`, css };
  }

  window.TribeCanvasScene = { create, styleOf, cssText, toHTML, CONTAINERS, DEFAULTS, FONT, clone, rid };
})();
