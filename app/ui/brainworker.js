// fix/security-2: Flint's built-in model (WebLLM) runs here, in a dedicated module worker, not in the page.
// Why: WebLLM is third-party code from a CDN (jsDelivr). In the page it could read the sign-in key (localStorage) and act
// as you. A worker has no localStorage, no document and no cookies, and TribeCode signs in with a header the page adds,
// so code running here never sees the key. It talks to the page only through the small message protocol below.
// The code is also pinned: the exact npm file (@mlc-ai/web-llm 0.2.83, lib/index.js, which jsDelivr serves byte for byte
// from npm and which has no imports of its own) is fetched, its SHA-384 is checked against the hash below, and only then
// imported from a blob: URL. A changed file (CDN compromise, a re-published version) is refused and never runs.
// Model weights (and WebLLM's WebGPU kernels) download from Hugging Face / GitHub at run time into the browser's cache;
// they are data and compiled shaders for the GPU, not JavaScript that runs with your session.
//   page -> worker  { type: 'load', model }                 worker -> page  { type: 'progress', p, text } | { type: 'ready' }
//                   { type: 'chat', id, request }                           { type: 'delta', id, text } | { type: 'done', id }
//                                                                           { type: 'error', id?, error }
'use strict';
const WEBLLM = { url: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.83/lib/index.js', sri: 'sha384-+MWk+CK1PsQ+58aGFlATlUWo9juX5p1/B+hXj0BGgCNLadaKnCyfInlGSbINQCeO' };
const b64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
async function verifiedImport({ url, sri }) {
  const r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!r.ok) throw new Error(`Couldn't download the built-in model's code (HTTP ${r.status}). Check the internet connection.`);
  const buf = await r.arrayBuffer();
  const got = 'sha384-' + b64(await crypto.subtle.digest('SHA-384', buf));
  if (got !== sri) throw new Error('The built-in model\'s code from the CDN failed its integrity check, so it was not run.');
  const blob = URL.createObjectURL(new Blob([buf], { type: 'text/javascript' }));
  try { return await import(blob); } finally { URL.revokeObjectURL(blob); }
}
let engine = null, loading = null;
const post = m => self.postMessage(m);
self.onmessage = async e => {
  const m = e.data || {};
  if (m.type === 'load') {
    try {
      if (!engine) {
        loading = loading || (async () => {
          const mod = await verifiedImport(WEBLLM);
          engine = await mod.CreateMLCEngine(String(m.model || ''), { initProgressCallback: r => post({ type: 'progress', p: r.progress || 0, text: String(r.text || '') }) });
        })();
        await loading;
      }
      post({ type: 'ready' });
    } catch (err) { loading = null; post({ type: 'error', error: (err && err.message) || String(err) }); }
    return;
  }
  if (m.type === 'chat') {
    try {
      if (!engine) throw new Error('The built-in model is not loaded yet.');
      const chunks = await engine.chat.completions.create({ ...(m.request || {}), stream: true });
      for await (const c of chunks) { const t = (c.choices && c.choices[0] && c.choices[0].delta && c.choices[0].delta.content) || ''; if (t) post({ type: 'delta', id: m.id, text: t }); }
      post({ type: 'done', id: m.id });
    } catch (err) { post({ type: 'error', id: m.id, error: (err && err.message) || String(err) }); }
  }
};
