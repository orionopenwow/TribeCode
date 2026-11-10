p='app/ui/canvas/flintpane.js'; s=open(p).read()
s=s.replace("  const fullAsk = new Map();   // honest cards: the whole ask, for handing off\n","")
s=s.replace("item = await post({ role: 'flint', kind: r.kind, text: r.why || r.say || '', ref: text.slice(0, 20) }); item.ref = text; }","item = await post({ role: 'flint', kind: r.kind, text: r.why || r.say || '', ref: text }); }")
a="""      const it = items.find(x => x.role === 'flint' && (x.kind === 'tier' || x.kind === 'freeform') && b.dataset.text === x.ref);
      const idx = items.indexOf(it), ask = idx > 0 && items[idx - 1].role === 'me' ? items[idx - 1].text : b.dataset.text;
      const msg = await window.TribeCanvasFlint.sendToHelpers(ask);"""
assert a in s
s=s.replace(a,"      const msg = await window.TribeCanvasFlint.sendToHelpers(b.dataset.text);")
a="""    let top = Infinity, left = Infinity, right = -Infinity;
    for (const id of E.sel) { const el = E.elOf(id); if (!el) continue; const r = el.getBoundingClientRect(); top = Math.min(top, r.top); left = Math.min(left, r.left); right = Math.max(right, r.right); }"""
b="""    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    for (const id of E.sel) { const el = E.elOf(id); if (!el) continue; const r = el.getBoundingClientRect(); top = Math.min(top, r.top); left = Math.min(left, r.left); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom); }"""
assert a in s; s=s.replace(a,b)
a="""    let y = top - sr.top - h - 30; if (y < 8) y = Math.min(sr.height - h - 80, top - sr.top + 8 < 8 ? 8 : 8);"""
b="""    let y = top - sr.top - h - 30;   // above the selection (clear of its name label), else below it
    if (y < 8) y = Math.min(sr.height - h - 80, bottom - sr.top + 34);"""
assert a in s; s=s.replace(a,b)
open(p,'w').write(s)
p='server/canvaschat.js'; s=open(p).read()
s=s.replace("if (body.ref) item.ref = str(body.ref, 20);","if (body.ref) item.ref = str(body.ref, 600);")
open(p,'w').write(s)
p='app/ui/canvas/canvas.js'; s=open(p).read()
a="    if (window.TribeCanvasFlint) window.TribeCanvasFlint.mount(E);   // P1-F: Flint's prompt bar (app/ui/canvas/flint.js)\n"
assert a in s
s=s.replace(a,a+"    if (window.TribeCanvasFlintPane) window.TribeCanvasFlintPane.mount(E);   // Flint's Make-style pane, Simple / Advanced (app/ui/canvas/flintpane.js)\n")
open(p,'w').write(s)
p='app/ui/index.html'; s=open(p).read()
a='<script src="canvas/flint.js"></script>'
assert a in s
s=s.replace(a,a+'<script src="canvas/flintpane.js"></script>',1)
a='<link rel="stylesheet" href="canvas/flint.css">'
assert a in s
s=s.replace(a,a+'<link rel="stylesheet" href="canvas/flintpane.css">',1)
open(p,'w').write(s)
print('ok')
