"""Every tribe is a full tribe (feat/real-tribe).
1. A computer where TribeCode runs (a page its own server serves): Create asks only for a name and an icon, the tribe
   is made on this computer without a "where" step, and the invite step works right away. The dashboard shows the
   Sharing and backup card ("…saved on this computer") with at most two buttons; no pill in the header; More options
   opens the folder / GitHub list.
2. A phone (the tribe starts in the browser): the same two steps, nothing fails. The card says only you can see it and
   it is saved on this phone, with the one button "Put this tribe online". A part that needs the tribe online (the
   invite sheet, an invite call) shows a short card with that one button, and the words "real tribe" appear nowhere.
3. A tribe kept in the browser on a computer: "Put this tribe online" moves it to this computer in one step and comes
   back to the view you were in (the Task Board), with its task still there.
Usage: python app/test/e2e_real_tribe.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SHOTS = Path(tempfile.mkdtemp(prefix="tribe-rt-shots-", dir="/tmp"))
SEED = "try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false}));localStorage.setItem('tribecode.personalize.done','1');localStorage.setItem('tribecode.flinttour.offered','1');}catch(e){}"

def start(port, tmp):
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", str(tmp / f"tribe{port}"), "--ollama", "http://localhost:9"], stdout=open(tmp / f"log{port}", "w"), stderr=subprocess.STDOUT, env=env)
    for _ in range(80):
        try: health(port); break
        except Exception: time.sleep(0.25)
    return srv

def health(port):
    with urllib.request.urlopen(f"http://localhost:{port}/api/health", timeout=10) as r: return json.loads(r.read())

def page(b, base, w, h, errors, phone=False):
    ctx = b.new_context(viewport={"width": w, "height": h}, **({"has_touch": True, "is_mobile": True, "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"} if phone else {}))
    ctx.add_init_script(SEED)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.goto(base + "/?freshopen=1&skipIntro=1#/hub")
    pg.wait_for_function("window.TribeNew && window.TribeShare && window.TribeApp && TribeApp.fresh && TribeApp.fresh()", timeout=20000)
    return ctx, pg

def no_real(pg, where):
    t = pg.evaluate("document.body.innerText").lower()
    assert "real tribe" not in t, f"'real tribe' shows {where}"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-rt-", dir="/tmp"))
    p1, p2, p3 = 5890 + OFF, 5891 + OFF, 5892 + OFF
    srvs = [start(p1, tmp), start(p2, tmp), start(p3, tmp)]
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------- 1. a computer where TribeCode runs: made here, silently ----------
            ctx, pg = page(b, f"http://localhost:{p1}", 1280, 820, errors)
            pg.evaluate("TribeNew.open()"); pg.wait_for_selector("#tn #tn-name", state="visible")
            assert pg.locator("#tn .tn-prog li").count() == 2, "two steps: name, then friends"
            assert pg.inner_text("#tn-create") == "Create" and pg.locator("#tn-options").count() == 1
            pg.click("#tn-create"); assert pg.is_visible("#tn-err") and pg.evaluate("TribeNew.state().step") == 1, "a name first, said calmly"
            pg.fill("#tn-name", "Lantern Crew"); pg.click("#tn-create")
            pg.wait_for_selector("#tn[data-step='3'] #tn-invite", timeout=20000)
            assert pg.locator("#tn [data-tn-where]").count() == 0, "no 'where' question on the way"
            assert health(p1)["members"] == 1, "this computer hosts it from the start"
            no_real(pg, "in the create flow")
            pg.screenshot(path=str(SHOTS / "rt-1-invite-step.png"))
            pg.click("#tn-invite")   # reloads into the tribe and opens the one invite sheet
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && !(window.TribeOffline && TribeOffline.active())", timeout=20000)
            pg.wait_for_selector("#tl-link", state="visible", timeout=20000)
            pg.wait_for_function("/\\/t\\//.test(document.querySelector('#tl-link').textContent)", timeout=10000)   # invites work right away
            pg.keyboard.press("Escape"); time.sleep(0.3)
            pg.evaluate("document.querySelectorAll('#invite-modal:not(.hidden) [data-close], .io-x').forEach(x => x.click())")
            pg.evaluate("TribeApp.show('home')")
            pg.wait_for_selector("#share-card[data-where='computer']", state="visible", timeout=15000)
            line = pg.inner_text("#sc-line"); assert "saved on this computer" in line and "Only you can see this" in line, line
            assert pg.inner_text("#sc-h") == "Sharing and backup"
            assert pg.locator("#share-card .sc-acts button").count() <= 2, "at most two buttons"
            assert pg.locator("#home-pill:visible, #host-pill:visible, #demo-pill:visible").count() == 0, "no pill in the header"
            pg.locator("#share-card").scroll_into_view_if_needed(); pg.mouse.move(5, 5); time.sleep(0.3)
            pg.screenshot(path=str(SHOTS / "rt-1-card-desktop.png"))
            pg.click("#sc-more"); pg.wait_for_selector("#home-pop #hp-github", state="visible")
            acts = pg.inner_text("#home-pop"); assert "sharing and backup" in acts.lower() and "Backup settings" in acts and "Who can reach this computer" in acts, acts
            pg.keyboard.press("Escape")
            pg.click("#sc-invite"); pg.wait_for_selector("#tl-link", state="visible", timeout=10000)
            no_real(pg, "in a tribe on this computer")
            ctx.close()

            # ---------- 2. a phone: it starts in the browser, and nothing fails ----------
            ctx, ph = page(b, f"http://localhost:{p2}", 390, 844, errors, phone=True)
            ph.evaluate("TribeNew.open()"); ph.wait_for_selector("#tn #tn-name", state="visible")
            ph.fill("#tn-name", "Pocket Crew"); ph.click("#tn-create")
            ph.wait_for_selector("#tn[data-step='3'] #tn-online", timeout=10000)
            assert health(p2)["members"] == 0, "a phone makes it in the browser"
            assert "saved in this browser" in ph.inner_text("#tn") and ph.locator("#tn-err:visible").count() == 0
            ph.click("#tn-done"); ph.wait_for_selector("#tn", state="detached")
            ph.wait_for_selector("#share-card[data-where='browser']", state="visible", timeout=15000)
            assert "Only you can see this, and it’s saved on this phone." == ph.inner_text("#sc-line").strip(), ph.inner_text("#sc-line")
            assert ph.inner_text("#sc-online") == "Put this tribe online" and ph.locator("#share-card .sc-acts button").count() == 2
            assert not ph.locator("#demo-pill").is_visible(), "no 'On this phone' pill"
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            ph.locator("#share-card").scroll_into_view_if_needed(); time.sleep(0.3)
            ph.screenshot(path=str(SHOTS / "rt-2-card-phone.png"))
            ph.click("#sc-more"); ph.wait_for_selector("#demo-pop", state="visible"); assert "Put this tribe online" in ph.inner_text("#demo-pop"); ph.keyboard.press("Escape")
            # the invite sheet: why, and the one button
            ph.evaluate("TribeApp.openInvite({ who: 'friend' })"); ph.wait_for_selector("#io-where", state="visible", timeout=8000)
            assert ph.inner_text("#io-where") == "Put this tribe online" and "once this tribe is online" in ph.evaluate("document.querySelector('#io-where').parentElement.innerText")
            ph.click("#io-where"); ph.wait_for_selector("#nx-sheet", state="visible", timeout=8000)   # a phone can't carry it: the short list
            ph.keyboard.press("Escape")
            # an invite call answers calmly and the card shows
            r = ph.evaluate("TribeClient.api('/invites', { method: 'POST', body: {} }).then(() => 'ok', e => e.message)")
            assert "isn’t online yet" in r, r
            ph.wait_for_selector("#od-needs [data-sc-online]", state="visible", timeout=5000)
            assert "This needs the tribe online" in ph.inner_text("#od-needs") and ph.locator("#od-needs button.btn").count() == 1, "why + one button"
            ph.screenshot(path=str(SHOTS / "rt-2-needs-phone.png"))
            no_real(ph, "on a phone")
            ctx.close()

            # ---------- 3. kept in the browser on a computer: one step puts it online, and you come back ----------
            ctx, pg = page(b, f"http://localhost:{p3}", 1280, 820, errors)
            pg.evaluate("TribeNew.open()"); pg.wait_for_selector("#tn #tn-name", state="visible")
            pg.fill("#tn-name", "Moon Garden"); pg.click("#tn-options"); pg.wait_for_selector("#tn[data-step='2']")
            assert pg.locator("#tn .tn-prog li").count() == 3
            pg.click("#tn [data-tn-where='device']"); pg.click("#tn-go"); pg.wait_for_selector("#tn[data-step='3'] #tn-done", timeout=10000)
            pg.click("#tn-done"); pg.wait_for_selector("#tn", state="detached")
            pg.wait_for_selector("#share-card[data-where='browser']", state="visible", timeout=15000)
            assert "saved in this browser" in pg.inner_text("#sc-line")
            pg.evaluate("TribeClient.api('/tasks', { method: 'POST', body: { title: 'Water the moon flowers' } })")
            pg.evaluate("TribeApp.show('tasks')"); pg.wait_for_function("document.body.dataset.view === 'tasks'")
            assert health(p3)["members"] == 0
            pg.evaluate("TribeShare.online('agents')")
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && !(window.TribeOffline && TribeOffline.active())", timeout=30000)
            assert health(p3)["members"] == 1, "it lives on this computer now"
            pg.wait_for_function("document.body.dataset.view === 'tasks'", timeout=15000)   # back where you were
            pg.wait_for_function("document.body.innerText.includes('Water the moon flowers')", timeout=15000)
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#share-card[data-where='computer']", state="visible", timeout=15000)
            no_real(pg, "after going online")
            ctx.close(); b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print(f"e2e_real_tribe: OK (made on this computer silently, card + More options, phone in the browser with Put this tribe online, one-step move and return)  shots: {SHOTS}")
    finally:
        for s in srvs: s.terminate()

if __name__ == "__main__":
    main()
