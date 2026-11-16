"""Motion Studio's MP4 path (app/ui/motionstudio.js) with a stand-in for Mediabunny, since the CDN can't be reached here.

  1. With a fake module that records what it is given, exportAs('mp4') returns an MP4: every frame reaches the
     encoder at its own time, and the file is the fake's buffer.
  2. With a loader that fails (no internet), the export still returns a file: a WebM, marked fallback 'helper', and the
     studio says why in plain words; the Export pane then says the helper didn't download.
  3. Before anything is tried, the Export pane says MP4 downloads a small helper the first time.
Usage: python app/test/e2e_motion_mp4.py
"""
import os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6540 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None

FAKE = r"""
window.__mb = { frames: [], started: 0, finalized: 0, audio: 0 };
window.__fakeMediabunny = {
  QUALITY_HIGH: 1,
  BufferTarget: class { constructor() { this.buffer = null; } },
  Mp4OutputFormat: class { constructor(o) { this.o = o; } },
  Output: class {
    constructor(o) { this.target = o.target; this.format = o.format; }
    addVideoTrack(src, o) { this.fps = o.frameRate; }
    addAudioTrack() { __mb.audio++; }
    async start() { __mb.started++; }
    async finalize() { __mb.finalized++; this.target.buffer = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]).buffer; }
  },
  CanvasSource: class { constructor(c, o) { this.c = c; this.o = o; } async add(t, d) { __mb.frames.push([t, d, this.c.width]); } },
  AudioBufferSource: class { constructor(o) { this.o = o; } async add() {} },
};
"""


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-mp4-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=open(os.path.join(tmp, "s.log"), "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.2)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 820})
            ctx.add_init_script("try{localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Mo',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}")
            pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1&freshopen=1")
            pg.wait_for_function("window.TribeMotionStudio && window.TribeMotionKit", timeout=20000)
            assert pg.evaluate("'VideoEncoder' in window"), "this Chrome has WebCodecs"
            pg.evaluate("TribeMotionStudio.open({ template: 'logo-reveal' })"); pg.wait_for_function("TribeMotionStudio.isOpen()", timeout=15000)

            # 3. before anything is tried: the Export pane says what MP4 needs
            assert pg.evaluate("TribeMotionStudio.mp4State()") == "untried"
            pg.click("#mos [data-mos-tab='export']")
            pg.wait_for_selector("#mos [data-exp='mp4']", timeout=5000)
            assert "helper the first time" in pg.inner_text("#mos [data-exp='mp4']"), pg.inner_text("#mos [data-exp='mp4']")

            # 1. a working (fake) Mediabunny: every frame reaches the encoder, the file comes back as MP4
            pg.evaluate(FAKE)
            pg.evaluate("TribeMotionStudio._setMp4Loader(async () => window.__fakeMediabunny)")
            r = pg.evaluate("TribeMotionStudio.exportAs('mp4', { seconds: 0.5, fps: 10, scale: 0.1 }).then(r => ({ ext: r.ext, type: r.blob.type, size: r.blob.size, fb: r.fallback || '' }))")
            mb = pg.evaluate("window.__mb")
            assert r["ext"] == "mp4" and r["type"] == "video/mp4" and r["size"] == 8 and not r["fb"], r
            assert len(mb["frames"]) == 5 and [round(f[0], 2) for f in mb["frames"]] == [0, 0.1, 0.2, 0.3, 0.4] and all(abs(f[1] - 0.1) < 1e-9 for f in mb["frames"]), mb["frames"]
            assert mb["started"] == 1 and mb["finalized"] == 1, mb
            assert pg.evaluate("TribeMotionStudio.mp4State()") == "ready"

            # 2. the helper can't download: a WebM comes back, marked, and the studio says why
            pg.evaluate("TribeMotionStudio._setMp4Loader(async () => { throw new TypeError('Failed to fetch dynamically imported module') })")
            r = pg.evaluate("TribeMotionStudio.exportAs('mp4', { seconds: 0.5, fps: 10, scale: 0.1 }).then(r => ({ ext: r.ext, size: r.blob.size, fb: r.fallback || '' }))")
            assert r["ext"] == "webm" and r["size"] > 0 and r["fb"] == "helper", r
            assert "didn’t download" in pg.inner_text("#mos-say"), pg.inner_text("#mos-say")
            assert pg.evaluate("TribeMotionStudio.mp4State()") == "failed"
            pg.wait_for_function("document.querySelector(\"#mos [data-exp='mp4']\") && document.querySelector(\"#mos [data-exp='mp4']\").dataset.mp4 === 'failed'", timeout=5000)
            assert "WebM works offline" in pg.inner_text("#mos [data-exp='mp4']")
            b.close()
        assert not errs, errs[:4]
        print("e2e_motion_mp4: OK (fake Mediabunny gets every frame and returns an MP4; a failed download falls back to WebM and says why; the Export pane tells the truth first)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
