p='app/ui/canvas/flintpane.js'; s=open(p).read()
a="""    let tab = tabs && tabs.querySelector('[data-rtab="flint"]');
    if (simple) {"""
b="""    let tab = tabs && tabs.querySelector('[data-rtab="flint"]');
    if (simple || isPhone()) {   // phones: Flint is always its own bottom sheet
      if (tab && isPhone()) { if (tab.classList.contains('on')) { const d = tabs.querySelector('[data-rtab="design"]'); if (d) d.click(); } tab.remove(); tab = null; }"""
assert a in s; s=s.replace(a,b)
a="""    setInterval(tick, 400);
    place();"""
b="""    setInterval(tick, 400);
    matchMedia('(max-width: 820px)').addEventListener('change', () => place());
    place();"""
assert a in s; s=s.replace(a,b)
a="""  function showTab(on) {
    const right = $('#cv-right'); if (!pane || mode() === 'simple') return;"""
b="""  function showTab(on) {
    const right = $('#cv-right'); if (!pane || mode() === 'simple' || isPhone()) return;"""
assert a in s; s=s.replace(a,b)
a="""    else { if (cv.classList.contains('no-right')) { const b = $('#cv-tog-right'); if (b) b.click(); } const t = cv.querySelector('.cv-rtabs [data-rtab="flint"]'); if (t && !t.classList.contains('on')) t.click(); }
    const i"""
b="""    else { if (cv.classList.contains('no-right')) { const b = $('#cv-tog-right'); if (b) b.click(); } const t = cv.querySelector('.cv-rtabs [data-rtab="flint"]'); if (t && !t.classList.contains('on')) t.click(); }
    paintLog();
    const i"""
assert a in s; s=s.replace(a,b)
open(p,'w').write(s)
p='app/ui/canvas/flintpane.css'; s=open(p).read()
s=s.replace("  .cv.mode-adv .cv-right .cv-fpane { position: static; transform: none; visibility: visible; height: auto; border-radius: 0; }\n","")
open(p,'w').write(s)
print('ok')
