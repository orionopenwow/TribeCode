p='app/test/e2e_canvas_ai.py'; s=open(p).read()
a='''def ask(page, text):
    if page.is_hidden("#cv-flint"): page.click("#cv-flint-btn")
    page.fill("#cvf-in", text)
    page.press("#cvf-in", "Enter")
    page.wait_for_function("!document.querySelector('#cv-flint').classList.contains('is-busy') && !document.querySelector('#cvf-out .is-wait')", timeout=15000)
    page.wait_for_timeout(250)
    return page.inner_text("#cvf-out")'''
b='''def ask(page, text):
    # Flint lives in the pane beside the canvas now (app/ui/canvas/flintpane.js); in Advanced it's the Flint tab
    page.evaluate("TribeCanvasFlintPane.open()")
    page.wait_for_selector("#cv-fpane #fp-in", state="visible", timeout=5000)
    n = page.evaluate("document.querySelectorAll('#fp-log .fp-flint:not(.is-wait)').length")
    page.fill("#fp-in", text)
    page.press("#fp-in", "Enter")
    page.wait_for_function("n => !document.querySelector('#fp-log .is-wait') && document.querySelectorAll('#fp-log .fp-flint:not(.is-wait)').length > n", arg=n, timeout=15000)
    page.wait_for_timeout(250)
    return page.locator("#fp-log .fp-flint").last.inner_text()'''
assert a in s; s=s.replace(a,b)
a='''            o.wait_for_selector("#cvf-chips [data-cvf-chip='Dark mode version']", timeout=5000)
            o.click("#cvf-chips [data-cvf-chip='Dark mode version']")'''
b='''            o.wait_for_selector("#fp-chips [data-text='Dark mode version']", timeout=5000)
            o.click("#fp-chips [data-text='Dark mode version']")'''
assert a in s; s=s.replace(a,b)
a='''            assert "Bigger than my free tier" in out and o.is_visible("#cvf-out [data-cvf='hand']"), out
            out = ask(o, "a cat wearing a tiny hat")
            assert "freeform" in out.lower(), out
            o.click("#cvf-out [data-cvf='hand']")
            o.wait_for_function("/Sent to your AI helpers/.test(document.querySelector('#cvf-out').textContent)", timeout=8000)
            o.click("#cv-flint-btn"); assert o.is_hidden("#cv-flint"), "the button closes the bar"'''
b='''            assert "Bigger than my free tier" in out and o.locator("#fp-log .fp-flint").last.locator("[data-fp='hand']").is_visible(), out
            out = ask(o, "a cat wearing a tiny hat")
            assert "freeform" in out.lower(), out
            o.locator("#fp-log [data-fp='hand']").last.click()
            o.wait_for_function("/Sent to your AI helpers/.test(document.querySelector('#fp-log').textContent)", timeout=8000)
            o.click("#cv-flint-btn"); o.wait_for_timeout(200); assert o.is_hidden("#cv-fpane"), "the flame button closes Flint's pane"'''
assert a in s; s=s.replace(a,b)
a='''            ph.wait_for_selector("#cv-flint:not([hidden])", timeout=5000)
            bx = ph.eval_on_selector("#cv-flint", "e => e.getBoundingClientRect().toJSON()")'''
b='''            ph.wait_for_function("document.querySelector('#cv').classList.contains('sheet-flint')", timeout=5000)
            ph.wait_for_timeout(450)
            bx = ph.eval_on_selector("#cv-fpane", "e => e.getBoundingClientRect().toJSON()")'''
assert a in s; s=s.replace(a,b)
open(p,'w').write(s)
print('ok')
