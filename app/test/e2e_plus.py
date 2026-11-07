"""The composer + menu: proposals to the tribe go to the Board when approved; menu + proposal sheet on desktop and phone."""
import subprocess, tempfile, time, sys, json, urllib.request
from playwright.sync_api import sync_playwright
import os
PORT=4778+int(os.environ.get("TRIBE_PORT_OFFSET","0")); tmp=tempfile.mkdtemp(); B=f"http://localhost:{PORT}"
srv=subprocess.Popen(["node","/home/claude/tc/server/index.js","--port",str(PORT),"--dir",tmp,"--ollama","http://localhost:9"],stdout=subprocess.DEVNULL); time.sleep(1.5)
def api(path, method="GET", body=None, tok=None):
    h={"Content-Type":"application/json"}; 
    if tok: h["Authorization"]="Bearer "+tok
    r=urllib.request.Request(B+"/api"+path,method=method,data=json.dumps(body).encode() if body is not None else None,headers=h)
    with urllib.request.urlopen(r) as x: return json.loads(x.read() or b"{}")
host=api("/bootstrap","POST",{"name":"Orion"})["token"]
inv=api("/invites","POST",{"role":"builder","project":"tribe"},host)["invite"]["code"]
maya=api("/join","POST",{"code":inv,"name":"Maya"})["token"]
m=api("/chat/general/vote","POST",{"pitch":{"title":"Add a double jump","body":"Feels better.\n- [ ] Jump twice\n- [ ] Reset on landing"},"minutes":0},maya)["message"]
assert m["vote"]["pitch"]["title"]=="Add a double jump" and m["text"].startswith("Proposal:"), m
api(f"/chat/general/vote/{m['id']}","POST",{"option":"yes"},maya); api(f"/chat/general/vote/{m['id']}","POST",{"option":"yes"},host)
time.sleep(0.5)
props=api("/proposals",tok=host)["proposals"]; print("board:", [(p["title"], p["status"]) for p in props])
assert any(p["title"]=="Add a double jump" for p in props), "passed proposal should be on the Board"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-proxy-server"])
    for name,vp,mob in [("desk",{"width":1440,"height":900},False),("phone",{"width":390,"height":844},True)]:
        c=b.new_context(viewport=vp,device_scale_factor=2,is_mobile=mob,has_touch=mob); pg=c.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)))
        pg.add_init_script("localStorage.setItem('tribecode.settings.v1', JSON.stringify({name:'Orion', onboarded:true, server:{url:'%s', token:'%s'}}))" % (B, host))
        pg.goto(B+"/?skipIntro=1"); pg.wait_for_timeout(2500); pg.evaluate("TribeApp.show && TribeApp.show('chat')"); pg.wait_for_timeout(1500)
        sel = "#m2-plus" if mob else ".cx-plus"
        pg.click(sel); pg.wait_for_timeout(500); assert pg.locator(".pl-item[data-pl=propose]").count()==1 and pg.locator(".pl-item[data-pl=attach]").count()==1
        pg.click('[data-pl="propose"]'); pg.wait_for_timeout(400); pg.fill("#pl-title", "Level select screen"); pg.click("#pl-prop [type=submit]"); pg.wait_for_function("[...document.querySelectorAll('.vt-q')].some(e => e.textContent.includes('Level select screen'))", timeout=8000)
        assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        assert not errs, errs
srv.terminate()
print("Plus menu test passed")
