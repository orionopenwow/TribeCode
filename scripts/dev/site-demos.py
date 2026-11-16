"""Render the website's creator demos (site/assets/create/) from the real code, so the site shows exactly what the app makes.
  - Looping clips drawn by Motion Studio's engine (app/ui/motionkit.js + motionsocial.js), frame by frame, then encoded
    with ffmpeg to WebM (VP9) and MP4 (H.264) plus a WebP poster: the UI morph reel, a share clip of App Creator demo
    apps, and a few social posts.
  - The App Creator demo apps (docs/screenshots/app-creator-demo-*.png) as small WebP pictures for the browsable strip.
  - Launch kit before and after: a demo app screen, and the same screen as a store screenshot drawn by the Launch kit's
    own renderer (app/ui/launchkit-draw.js).
  - App screenshots (docs/screenshots: App Creator, Motion Studio, Launch kit, Suggestions, Share a clip) as WebP.
Usage: python3 scripts/dev/site-demos.py [--only reel,clip,social,apps,launch,shots]
Needs Playwright + Chrome and ffmpeg (both in the dev sandbox). Writes only site/assets/create/.
"""
import base64, functools, http.server, io, json, shutil, subprocess, sys, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'site' / 'assets' / 'create'
ONLY = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
want = lambda k: ONLY is None or k in ONLY
DEMOS = ['habits', 'recipes', 'social', 'meditation', 'gamemenu', 'trip', 'music']

PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:500;src:url(/app/ui/motionfonts/Inter-Medium.woff)}
@font-face{font-family:Inter;font-weight:600;src:url(/app/ui/motionfonts/Inter-SemiBold.woff)}
@font-face{font-family:Inter;font-weight:800;src:url(/app/ui/motionfonts/InterDisplay-ExtraBold.woff)}
body{margin:0;background:#111}</style>
<script src="/app/ui/motionkit.js"></script><script src="/app/ui/motionsocial.js"></script>
<script src="/app/ui/launchkit-core.js"></script><script src="/app/ui/launchkit-draw.js"></script></head><body></body></html>"""


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/__demo'):
            b = PAGE.encode(); self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()
    def guess_type(self, path):
        t = super().guess_type(path)
        return t + '; charset=utf-8' if t in ('application/javascript', 'text/javascript', 'text/html') else t


def ffmpeg(*a): subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *a], check=True)


def clip(pg, name, tpl, opts, w, fps=30, seconds=None, accent=None):
    """Draw every frame of a template with the engine, encode WebM + MP4 + a WebP poster."""
    frames = Path(tempfile.mkdtemp(prefix='demo-'))
    meta = pg.evaluate("""async ([tpl, opts, w, accent]) => { const K = TribeMotionKit; const d = K.make(tpl, Object.assign({}, opts, accent ? { accent } : {})); await K.load(d);
        window.__d = d; const h = Math.round(w * d.size.h / d.size.w / 2) * 2; const c = document.createElement('canvas'); c.width = w; c.height = h; window.__c = c;
        return { dur: K.duration(d), h, thumb: d.thumbAt >= 0 ? d.thumbAt * 60 / d.bpm : K.duration(d) * 0.4 }; }""", [tpl, opts, w, accent])
    dur = seconds or meta['dur']; n = round(dur * fps)
    for i in range(n):
        data = pg.evaluate("""([t, fps]) => { const d = window.__d, c = window.__c, g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.scale(c.width / d.size.w, c.height / d.size.h); TribeMotionKit.draw(g, d, t, { fps, blur: d.blur.n }); return c.toDataURL('image/jpeg', 0.92).split(',')[1]; }""", [i / fps, fps])
        (frames / f'{i:05d}.jpg').write_bytes(base64.b64decode(data))
    poster = pg.evaluate("""t => { const d = window.__d, c = window.__c, g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.scale(c.width / d.size.w, c.height / d.size.h); TribeMotionKit.draw(g, d, t, { blur: 0 }); return c.toDataURL('image/png').split(',')[1]; }""", meta['thumb'])
    (frames / 'poster.png').write_bytes(base64.b64decode(poster))
    src = ['-framerate', str(fps), '-i', str(frames / '%05d.jpg')]
    ffmpeg(*src, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', '-an', str(OUT / f'{name}.webm'))
    ffmpeg(*src, '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', str(OUT / f'{name}.mp4'))
    ffmpeg('-i', str(frames / 'poster.png'), '-c:v', 'libwebp', '-quality', '82', str(OUT / f'{name}.webp'))
    shutil.rmtree(frames)
    print(f'  {name}: {n} frames, {w}x{meta["h"]}, {(OUT / f"{name}.webm").stat().st_size // 1024} KB webm, {(OUT / f"{name}.mp4").stat().st_size // 1024} KB mp4')


def webp(src, dst, width, q=80):
    ffmpeg('-i', str(src), '-vf', f'scale={width}:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', str(q), str(dst))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{srv.server_address[1]}'
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-proxy-server'])
        pg = b.new_page(viewport={'width': 800, 'height': 800})
        pg.goto(base + '/__demo'); pg.evaluate("Promise.all(['500 20px Inter','600 20px Inter','800 20px Inter'].map(f => document.fonts.load(f)))")
        screens = [f'/docs/screenshots/app-creator-demo-{d}.png' for d in DEMOS]
        if want('reel'): clip(pg, 'reel', 'ui-reel', {}, 720)
        if want('clip'): clip(pg, 'share-app', 'share-app-916', {'screens': screens[:4], 'hook': 'Made this with friends'}, 540)
        if want('social'):
            clip(pg, 'social-poll', 'soc-poll-916', {}, 540)
            clip(pg, 'social-before-after', 'soc-before-after-916', {}, 540)
            clip(pg, 'social-launch', 'soc-launch-916', {}, 540)
            clip(pg, 'social-milestone', 'soc-milestone-night', {'aspect': '9:16'}, 540)
        if want('launch'):
            data = pg.evaluate("""async src => { const D = TribeLaunchDraw, im = await D.img(src), c = document.createElement('canvas');
                D.slide(c, 660, 1434, { style: 's01', caption: 'Build habits with friends', sub: 'Streaks you keep together', imgs: [im], brand: { colors: { accent: '#3BA776' } }, index: 0, count: 1, name: 'Habit Hero' });
                return c.toDataURL('image/png').split(',')[1]; }""", screens[0])
            tmp = Path(tempfile.mkdtemp()) / 'after.png'; tmp.write_bytes(base64.b64decode(data))
            webp(tmp, OUT / 'launch-after.webp', 440, 82)
            webp(ROOT / 'docs/screenshots/app-creator-demo-habits.png', OUT / 'launch-before.webp', 440, 82)
            print('  launch kit before and after')
        b.close()
    if want('apps'):
        for d in DEMOS: webp(ROOT / f'docs/screenshots/app-creator-demo-{d}.png', OUT / f'app-{d}.webp', 360, 80)
        print(f'  {len(DEMOS)} demo apps')
    if want('shots'):
        for src, dst, w in [('app-creator-editor', 'shot-app-creator', 1200), ('app-creator-gallery', 'shot-app-gallery', 1200), ('motion-studio-1440', 'shot-motion-studio', 1200),
                            ('launch-kit', 'shot-launch-kit', 1200), ('suggest-sheet', 'shot-suggestions', 1200), ('share-clip', 'shot-share-clip', 1200)]:
            f = ROOT / 'docs' / 'screenshots' / f'{src}.png'
            if f.exists(): webp(f, OUT / f'{dst}.webp', w, 78)
        print('  app screenshots')
    total = sum(f.stat().st_size for f in OUT.iterdir())
    print(f'site/assets/create: {len(list(OUT.iterdir()))} files, {total / 1048576:.2f} MB')


if __name__ == '__main__':
    main()
