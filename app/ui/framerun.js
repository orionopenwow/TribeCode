// Runs a page's inline scripts inside a sandboxed preview frame when the app runs under a CSP without 'unsafe-inline'
// (the desktop app: app/src-tauri/tauri.conf.json). An about:srcdoc frame inherits that CSP, so its inline <script>s are
// blocked. TribeFrameRun.wrap(html) (in the app) turns each inline script into an inert <script type="text/x-tribe-inline">
// and adds this file, by src from the app's origin, at the end of the page; here, inside the frame, each one is written
// back as a blob: script (script-src allows blob:), in order and before DOMContentLoaded. The CSP is never loosened.
(function () {
  var TYPE = 'text/x-tribe-inline';
  var me = document.currentScript;
  if (me && me.hasAttribute('data-tribe-run')) {
    [].forEach.call(document.querySelectorAll('script[type="' + TYPE + '"]'), function (s) {
      var u = URL.createObjectURL(new Blob([s.textContent], { type: 'text/javascript' }));
      document.write('<script src="' + u + '"><\/script>');
    });
    return;
  }
  // in the app: only needed where inline scripts are blocked (the desktop window, also during the demo inside it)
  var needed = function () { return !!(window.__TAURI_INTERNALS__ || window.__TAURI__); };
  function wrap(html) {
    html = String(html || '');
    if (!needed() || !/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) return html;
    var out = html.replace(/<script\b([^>]*)>/gi, function (all, attrs) {
      if (/\bsrc\s*=/i.test(attrs)) return all;
      var t = /\btype\s*=\s*("|')?([^"'\s>]*)\1/i.exec(attrs);
      if (t && t[2] && !/^(text\/javascript|application\/javascript|module)$/i.test(t[2])) return all;   // JSON, templates: not code
      return '<script type="' + TYPE + '"' + attrs.replace(/\btype\s*=\s*("|')?[^"'\s>]*\1/i, '') + '>';
    });
    var tag = '<script data-tribe-run src="' + new URL('framerun.js', document.baseURI).href.replace(/"/g, '%22') + '"><\/script>';
    return /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, tag + '</body>') : out + tag;
  }
  window.TribeFrameRun = { wrap: wrap, needed: needed };
})();
