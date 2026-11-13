// The app and game starters' shared rules (feat/design-flow, docs/STARTERS.md), used by the Design flow in the browser
// (app/ui/designflow.js) and by Flint's free builds on the server (server/flintfree.js), so both change a starter the
// same way. No AI here: the words you used become knob values.
//   fromAsk(ask, params)        -> { values: { key: value }, said: ['faster', 'Run speed 15 → 20', …] }
//   apply(configJs, values, params) -> config.js text with those values (one "  key: value," line each, the rest kept)
//   read(configJs, params)      -> the current values
//   clean(values, params)       -> only known keys, numbers clamped, colors checked, text trimmed
//   inline(files, base)         -> one HTML file with its CSS, scripts and data files inlined (for a copy kept on this
//                                  device, played in a sandboxed iframe: no server needed)
//   COLORS                      the color words Flint knows
(function (root) {
  'use strict';
  const COLORS = { red: '#E5484D', crimson: '#DC143C', orange: '#F26B1D', ember: '#F26B1D', amber: '#F2B33D', yellow: '#FABD2F', gold: '#E9B949', lime: '#84CC16', green: '#3BD16F', mint: '#5FD3A5', teal: '#38C6B1', cyan: '#22D3EE', sky: '#4FB3F6', blue: '#3B82F6', navy: '#1E3A8A', indigo: '#6C7CFF', purple: '#8B5CF6', violet: '#8B5CF6', lilac: '#C4B5FD', pink: '#FF6F8E', rose: '#FF6F8E', magenta: '#D946EF', brown: '#B07A4F', white: '#F8FAFC', black: '#0B0D10', gray: '#94A3B8', grey: '#94A3B8' };
  const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i;
  const round = (v, step) => { const s = step || 1, d = (String(s).split('.')[1] || '').length; return +(Math.round(v / s) * s).toFixed(d); };
  function clean(values, params) {
    const out = {};
    for (const p of params || []) {
      if (!values || !(p.key in values)) continue;
      const v = values[p.key];
      if (p.type === 'number') { const n = Number(v); if (!Number.isFinite(n)) continue; out[p.key] = round(Math.max(p.min ?? -1e9, Math.min(p.max ?? 1e9, n)), p.step); }
      else if (p.type === 'color') { const c = String(v).trim(); const hex = HEX.test(c) ? c : COLORS[c.toLowerCase()]; if (hex) out[p.key] = hex.toUpperCase(); }
      else if (p.type === 'bool') out[p.key] = v === true || v === 'true' || v === 1;
      else out[p.key] = String(v).replace(/[\u0000-\u001f]/g, m => (m === '\n' ? '\n' : '')).slice(0, 400);
    }
    return out;
  }
  const lit = v => (typeof v === 'string' ? JSON.stringify(v) : String(v));
  function apply(text, values, params) {
    const v = clean(values, params);
    let t = String(text || '');
    for (const [k, val] of Object.entries(v)) {
      const re = new RegExp(`^(\\s*${k}:\\s*)(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|[^,\\n]*?)(\\s*,)`, 'm');
      if (re.test(t)) t = t.replace(re, (all, a, b) => a + lit(val) + b);
    }
    return t;
  }
  function read(text, params) {
    const out = {};
    for (const p of params || []) {
      const m = new RegExp(`^\\s*${p.key}:\\s*("(?:[^"\\\\]|\\\\.)*"|[^,\\n]*?)\\s*,`, 'm').exec(String(text || ''));
      if (!m) { out[p.key] = p.default; continue; }
      try { out[p.key] = JSON.parse(m[1]); } catch { out[p.key] = m[1]; }
    }
    return out;
  }
  // "a fast neon breakout called Brick Party in pink, floaty jumps" -> { speed: …, brick: '#FF6F8E', title: 'Brick Party' }
  function fromAsk(ask, params) {
    const a = ' ' + String(ask || '').toLowerCase().replace(/[^\p{L}\p{N}#\s'-]/gu, ' ').replace(/\s+/g, ' ') + ' ';
    const values = {}, said = [];
    for (const p of params || []) {
      if (p.type !== 'number' || !p.words) continue;
      const up = p.words.up && new RegExp(` (?:${p.words.up}) `).test(a), down = p.words.down && new RegExp(` (?:${p.words.down}) `).test(a);
      if (up === down) continue;
      const much = / (much|way|super|really|very) /.test(a) ? 1.7 : 1.35, base = Number(p.default);
      values[p.key] = up ? base * much : base / much;
      if (Number.isInteger(base) && Math.abs(values[p.key] - base) < 1) values[p.key] = base + (up ? 1 : -1);
      said.push(`${p.label} ${p.default} → ${clean({ [p.key]: values[p.key] }, [p])[p.key]}`);
    }
    const hex = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.exec(a), word = new RegExp(` (${Object.keys(COLORS).join('|')}) `).exec(a);
    const main = (params || []).find(p => p.type === 'color' && p.main);
    if (main && (hex || word)) { values[main.key] = hex ? hex[0] : COLORS[word[1]]; said.push(`${main.label} → ${hex ? hex[0] : word[1]}`); }
    if (/ (dark|night|darker) /.test(a)) { const bg = (params || []).find(p => p.key === 'bg'); if (bg) { values.bg = '#0B0D10'; said.push('a darker background'); } }
    const nm = /\b(?:called|named|titled)\s+["“']?([^,.!?"”']{2,40})/i.exec(String(ask || ''));
    const title = (params || []).find(p => p.type === 'text' && /^(title|channel)$/.test(p.key));
    if (nm && title) { const n = nm[1].replace(/\s+(with|in|and|that|where)\b.*$/i, '').trim(); values[title.key] = n.replace(/\b\p{L}/gu, c => c.toUpperCase()); said.push(`${title.label} → ${values[title.key]}`); }
    return { values: clean(values, params), said };
  }
  // one self-contained HTML file: <link href=x.css> and <script src=x.js> inlined, other text files given to the page as
  // window.STARTER_FILES (the platformer reads its level from there when there is no server)
  function inline(files, extraHead) {
    const esc = s => String(s).replace(/<\/(script|style)/gi, '<\\/$1');
    let html = String(files['index.html'] || '');
    html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (all, f) => (f in files ? `<style>/* ${f} */\n${esc(files[f])}</style>` : all));
    html = html.replace(/<script\s+src="([^"]+)"><\/script>/g, (all, f) => (f in files ? `<script>/* ${f} */\n${esc(files[f])}</script>` : all));
    const data = Object.keys(files).filter(f => /\.(json|txt|md)$/i.test(f) && !/^(STARTER\.json|README\.md)$/.test(f));
    const pre = (data.length ? `<script>window.STARTER_FILES = ${esc(JSON.stringify(Object.fromEntries(data.map(f => [f, files[f]]))))};</script>` : '') + (extraHead || '');
    return pre ? html.replace(/<head>/i, '<head>\n' + pre) : html;
  }
  const api = { fromAsk, apply, read, clean, inline, COLORS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TribeStarterKit = api;
})(typeof window !== 'undefined' ? window : null);
