// TribeMotion: one place for view changes. swap(fn) runs fn inside a View Transition (a short
// cross-fade defined in motion.css) when the browser supports it and the person hasn't asked for
// reduced motion; otherwise it just runs fn. fn always runs synchronously-or-soon and exactly once.
(function () {
  const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let busy = false;
  function enabled() {
    if (!document.startViewTransition || reduce.matches) return false;
    if (document.documentElement.dataset.motion === 'off') return false;
    // Automated browsers click faster than a cross-fade lasts; keep their DOM changes immediate.
    if (navigator.webdriver) return false;
    return !document.hidden;
  }
  function swap(fn) {
    if (!enabled() || busy) { fn(); return; }
    busy = true;
    let ran = false;
    const once = () => { if (!ran) { ran = true; fn(); } };
    try {
      const vt = document.startViewTransition(once);
      vt.finished.catch(() => {}).finally(() => { busy = false; });
      vt.updateCallbackDone.catch(once);
    } catch (e) { busy = false; once(); }
  }
  window.TribeMotion = { swap, enabled };
})();
