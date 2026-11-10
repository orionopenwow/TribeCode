/* site.js: fills this page from its site data. It's part of a TribeCode website template.
 *
 * Where the content lives
 *   site.json holds everything you'd normally want to change: the name, words, links, colors, fonts, which
 *   sections show and in what order, and lists like products, menu items or tour dates. TribeCode's
 *   "Customize" form edits it for you. A copy of it is embedded in each page (<script id="site-data">) so the
 *   page works without a server, and the page's HTML is already filled in, so it also works with JavaScript off.
 *
 * How the page is marked up
 *   data-s="key"                  the element's text comes from site data (key can be dotted: "contact.email")
 *   data-s-attr="href:key;src:k2" attributes come from site data ("href:mailto:email" puts "mailto:" before it)
 *   <template data-s-for="list">  repeated items; {{field}} fills in, {{#list}}…{{/list}} repeats or shows when
 *   …items…<!--/s-for-->          set, {{^field}}…{{/field}} shows when empty. Items sit between the template and
 *                                 the <!--/s-for--> comment.
 *   <main data-s-sections>        its <section data-section="id"> children follow site data's "sections" order;
 *                                 a section with "on": false is hidden.
 *   <style id="s-theme">          CSS variables for the colors and fonts in site data's "theme".
 *
 * Editing by hand (Pro): change the HTML and CSS freely. If you'd rather not use site.json at all, delete the
 * <script src="site.js"> line and the page stays exactly as it is now.
 */
(function () {
  'use strict';
  var FONTS = {
    'Fraunces': "'Fraunces', Georgia, serif",
    'Instrument Serif': "'Instrument Serif', 'Iowan Old Style', Georgia, serif",
    'Bricolage Grotesque': "'Bricolage Grotesque', 'Arial Narrow', system-ui, sans-serif",
    'Space Grotesk': "'Space Grotesk', system-ui, sans-serif",
    'JetBrains Mono': "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
    'Silkscreen': "'Silkscreen', ui-monospace, monospace",
    'Inter': "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    'System sans': "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    'System serif': "Charter, 'Bitstream Charter', 'Iowan Old Style', Georgia, serif",
    'Humanist': "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif",
    'Geometric': "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif",
    'Condensed': "'Bahnschrift', 'DIN Alternate', 'Franklin Gothic Medium', 'Nimbus Sans Narrow', sans-serif-condensed, sans-serif",
    'Monospace': "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace"
  };
  function get(o, p) { if (p === '.') return o['.']; return String(p).split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function scope(d, x) { var o = {}; for (var k in d) o[k] = d[k]; if (x && typeof x === 'object') { for (var j in x) o[j] = x[j]; } else o['.'] = x; return o; }
  // a tiny Mustache: {{a.b}}, {{#list}}…{{/list}}, {{^empty}}…{{/empty}}
  function mus(t, d) {
    t = String(t).replace(/\{\{([#^])([\w.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, function (m, s, k, inner) {
      var v = get(d, k), empty = !v || (Array.isArray(v) && !v.length);
      if (s === '^') return empty ? mus(inner, d) : '';
      if (empty) return '';
      if (Array.isArray(v)) return v.map(function (x, i) { var sc = scope(d, x); sc['@n'] = i + 1; return mus(inner, sc); }).join('');
      return mus(inner, typeof v === 'object' ? scope(d, v) : d);
    });
    return t.replace(/\{\{([\w.@]+)\}\}/g, function (m, k) { var v = get(d, k); return esc(v == null ? '' : v); });
  }
  // "mailto:email" -> "mailto:" + data.email ; "key" -> data.key
  function attrVal(d, spec) { var j = spec.lastIndexOf(':'); if (j < 0) return get(d, spec); var v = get(d, spec.slice(j + 1)); return v == null || v === '' ? null : spec.slice(0, j + 1) + v; }
  function font(n) { return FONTS[n] || (n ? "'" + String(n).replace(/'/g, '') + "', system-ui, sans-serif" : ''); }
  function themeCss(th) {
    th = th || {}; var c = th.colors || {}, f = th.fonts || {}, out = [];
    for (var k in c) if (/^[\w-]+$/.test(k) && /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$/i.test(String(c[k]))) out.push('--' + k + ': ' + c[k]);
    if (f.display) out.push('--font-display: ' + font(f.display));
    if (f.body) out.push('--font-body: ' + font(f.body));
    return ':root { ' + out.join('; ') + (out.length ? ';' : '') + ' }';
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { mus: mus, themeCss: themeCss, get: get, esc: esc, attrVal: attrVal, FONTS: FONTS }; return; }

  // ---------- in the browser ----------
  function apply(data) {
    var th = document.getElementById('s-theme'); if (th) th.textContent = themeCss(data.theme);
    if (data.theme && data.theme.preset) document.documentElement.setAttribute('data-preset', data.theme.preset);
    [].forEach.call(document.querySelectorAll('[data-s]'), function (el) { var v = get(data, el.getAttribute('data-s')); if (v != null) el.textContent = v; });
    [].forEach.call(document.querySelectorAll('[data-s-attr]'), function (el) {
      el.getAttribute('data-s-attr').split(';').forEach(function (pair) {
        var i = pair.indexOf(':'); if (i < 1) return; var a = pair.slice(0, i).trim(), v = attrVal(data, pair.slice(i + 1).trim());
        if (v != null && !/^on/i.test(a) && !(/^(href|src|action)$/i.test(a) && /^\s*javascript:/i.test(v))) el.setAttribute(a, v);
      });
    });
    [].forEach.call(document.querySelectorAll('template[data-s-for]'), function (tp) {
      var k = tp.getAttribute('data-s-for'), n = tp.nextSibling;
      while (n && !(n.nodeType === 8 && n.nodeValue === '/s-for')) { var nx = n.nextSibling; n.parentNode.removeChild(n); n = nx; }
      var box = document.createElement('div'); box.innerHTML = mus('{{#' + k + '}}' + tp.innerHTML + '{{/' + k + '}}', data);
      while (box.firstChild) tp.parentNode.insertBefore(box.firstChild, n);
    });
    var main = document.querySelector('[data-s-sections]');
    if (main && Array.isArray(data.sections)) {
      data.sections.forEach(function (s) {
        var el = main.querySelector(':scope > [data-section="' + s.id + '"]'); if (!el) return;
        main.appendChild(el); el.hidden = s.on === false;
      });
    }
    if (data.name && document.title.indexOf(data.name) < 0 && document.body.hasAttribute('data-s-title')) document.title = data.name;
    document.dispatchEvent(new CustomEvent('site:data', { detail: data }));
  }
  var raw = document.getElementById('site-data'), data = null;
  try { data = JSON.parse(raw ? raw.textContent : 'null'); } catch (e) { data = null; }
  window.SiteData = { get: function () { return data; }, apply: function (d) { data = d; apply(d); }, mus: mus };
  // TribeCode's Customize form sends changes here so the preview updates as you type
  window.addEventListener('message', function (e) {
    var m = e.data; if (!m || m.tc !== 'site-data' || !m.data || typeof m.data !== 'object') return;
    data = m.data; apply(data);
  });
})();
