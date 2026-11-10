p='app/ui/canvas/flint.js'; s=open(p).read()
rep=[
("  let E = null, bar = null, busy = false, last = '';","  let E = null, bar = null, busy = false, last = '', hook = null;   // hook: the Flint pane (flintpane.js) takes over opening"),
("    btn.onclick = () => (bar.hidden ? open() : close());","    btn.onclick = () => (hook ? hook.toggle() : bar.hidden ? open() : close());"),
("      e.preventDefault(); e.stopImmediatePropagation(); open();","      e.preventDefault(); e.stopImmediatePropagation(); if (hook) hook.open(); else open();"),
]
for a,b in rep:
    assert a in s, a; s=s.replace(a,b)
old_start=s.index("  async function ask(text) {")
old_end=s.index("  async function honest(r) {")
new='''  // run one ask: plan on the server, land it as this person's change. Returns { r, pairs } (pairs = that undo step).
  async function run(text) {
    const r = await C.api('/canvasai/plan', { method: 'POST', body: { ask: text, file: E.file, sel: E.sel, boxes: Object.fromEntries(E.sel.map(id => [id, E.wbox(id)]).filter(x => x[1])) } });
    const before = E.step ? E.step() : null;
    if (r.kind === 'build' || r.kind === 'variants' || r.kind === 'theme') E.insert(r.create, r.focus);
    else if (r.kind === 'rename' || r.kind === 'tidy') E.apply(r.change);
    const after = E.step ? E.step() : null;
    return { r, pairs: after && after !== before ? after : null };
  }
  async function ask(text) {
    if (!E || busy) return;
    if (!E.canEdit) return say(T('View only: ask the host to make you a builder to design here.'));
    open(); busy = true; last = text;
    bar.classList.add('is-busy');
    const ff = FF(); if (ff) ff.work(document.getElementById('cv-stage'), T('Designing…'));
    out(`<p class="cvf-say is-wait"><img src="assets/flint.svg" alt="" width="11" height="14"> ${esc(T('On it…'))} <span class="cvf-ask">“${esc(text)}”</span></p>`);
    try {
      const { r } = await run(text);
      if (r.kind === 'tier' || r.kind === 'freeform') { if (ff) ff.home(); return honest(r); }
      say(r.say || T('Done.'));
      if (ff) {
        const target = r.focus && E.elOf(r.focus);
        if (target) setTimeout(() => ff.done(target, r.kind === 'build' ? T('Designed ✓') : T('Done ✓')), 120); else ff.home();
      }
    } catch (e) { if (ff) ff.home(); say(e.message || String(e)); }
    finally { busy = false; bar.classList.remove('is-busy'); }
  }
'''
s=s[:old_start]+new+s[old_end:]
a="""  async function handOff(btn) {
    btn.disabled = true;"""
b="""  async function handOff(btn) {
    btn.disabled = true;
    say(await sendToHelpers(last));
  }
  async function sendToHelpers(text) {"""
assert a in s; s=s.replace(a,b)
a2='On the design canvas (Design, file "${st.name || E.file}"): ${last}.'
assert a2 in s; s=s.replace(a2,'On the design canvas (Design, file "${st.name || E.file}"): ${text}.')
i=s.index("    say(online ? T('Sent to your AI helpers.")
s=s[:i]+"    return online"+s[i+len("    say(online"):]
j=s.index("connect one in Connect your AI and it picks this up.'));",i)
s=s[:j]+"connect one in Connect your AI and it picks this up.');"+s[j+len("connect one in Connect your AI and it picks this up.'));"):]
a="  window.TribeCanvasFlint = { mount, ask, open, close };"
assert a in s
s=s.replace(a,"  window.TribeCanvasFlint = { mount, ask, open, close, run, sendToHelpers, use: h => { hook = h; if (h && bar) close(); }, get busy() { return busy; } };")
s=s.replace("//   window.TribeCanvasFlint = { mount(E), ask(text), open(), close() }","//   window.TribeCanvasFlint = { mount(E), ask(text), open(), close(), run(text) -> { r, pairs }, sendToHelpers(text), use(hook) }\n// The Flint pane (flintpane.js) is the one place to talk to Flint on the canvas: it registers a hook with use(), and\n// the toolbar's flame button and Shift I open the pane instead of this bar.")
open(p,'w').write(s)
p='app/ui/canvas/canvas.js'; s=open(p).read()
a="    apply(nodes) {"
b="""    // Flint pane (flintpane.js): the last undo step, and undoing any one step later (Flint's "Undo" on an older message)
    step: () => (undo.length ? undo[undo.length - 1] : null),
    revert(pairs) {
      if (!canEdit || !Array.isArray(pairs) || !pairs.length) return;
      commitEdit(true);
      for (const p of pairs) {
        if (p.before) put(clone(p.before));
        else { const cur = S.get(p.id); if (!cur) continue; begin(); if (!tx.has(p.id)) tx.set(p.id, clone(cur)); const t = { id: p.id, del: true, v: (cur.v || 0) + 1 }; S.nodes.set(p.id, t); queue(t); }
      }
      sel = sel.filter(id => S.get(id)); inner = null; end(true); renderAll();
    },
    apply(nodes) {"""
assert s.count(a)==1; s=s.replace(a,b)
open(p,'w').write(s)
print('ok')
