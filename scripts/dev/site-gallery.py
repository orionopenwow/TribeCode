#!/usr/bin/env python3
"""The website template gallery (feat/site-v2): app/ui/sitetpl/{catalog.json, <id>.json, thumbs/<id>.webp}.

  python3 scripts/dev/site-gallery.py [--src /path/to/clones] [--only id,id] [--no-thumbs]

1. The 16 TribeCode templates (templates/sites/<id>) become configs with sitecfg.fromTemplate, pictures inlined.
2. The open-source templates in scripts/dev/site-sources.json are read from local clones (--src, default
   /tmp/osrc/tpl: sb-<name> = StartBootstrap/startbootstrap-<name>, tt-<name> = tailwindtoolbox/<name>,
   zce/<name> or h5-<name> = HTML5 UP) and converted by app/ui/siteimport.js in Chrome. Their pictures become
   original flat art in the template's colors; lorem ipsum becomes plain placeholder lines; CC BY sources get
   cfg.credit (shown in every export's footer).
3. Thumbnails: each config rendered by sitecfg.render at 1280x960, saved as a 480x360 WebP.
The catalog is what the gallery shows offline (no server needed), and what GET /api/site-designer/templates serves.
"""
import json, os, re, sys, random, base64, io, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / 'app' / 'ui'
OUT = UI / 'sitetpl'
args = sys.argv[1:]
SRC = Path(args[args.index('--src') + 1]) if '--src' in args else Path('/tmp/osrc/tpl')
ONLY = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
THUMBS = '--no-thumbs' not in args
SOURCES = json.loads((ROOT / 'scripts' / 'dev' / 'site-sources.json').read_text())
NATIVE_CAT = {'linkbio': 'Link in bio', 'merch': 'Shop', 'portfolio': 'Portfolio', 'creator': 'Creator', 'band': 'Music', 'cafe': 'Food & drink', 'service': 'Business', 'wedding': 'Events',
              'podcast': 'Creator', 'blog': 'Blog', 'saas': 'Startup', 'gamepage': 'Games', 'resume': 'Personal', 'nonprofit': 'Nonprofit', 'photography': 'Portfolio', 'comingsoon': 'Coming soon'}
ORDER = ['Link in bio', 'Business', 'Startup', 'Portfolio', 'Personal', 'Blog', 'Shop', 'Food & drink', 'Music', 'Creator', 'Events', 'Nonprofit', 'Games', 'Coming soon']

def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def mix(a, b, t): x, y = hexrgb(a), hexrgb(b); return '#' + ''.join(f'{round(x[i] + (y[i] - x[i]) * t):02X}' for i in range(3))
def lum(h):
    c = [v / 255 for v in hexrgb(h)]; c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def art(seed, bg, accent, ink, w=1200, h=800):
    """Original flat composition in the template's colors (no third-party art)."""
    r = random.Random(seed); dark = lum(bg) < 0.2
    base = mix(bg, accent, 0.18); mid = mix(bg, accent, 0.45); far = mix(bg, ink, 0.12 if dark else 0.08)
    kind = seed % 4; b = f'<rect width="{w}" height="{h}" fill="{base}"/>'
    if kind == 0:   # hills under a sun
        b += f'<circle cx="{int(w * (0.25 + r.random() * 0.5))}" cy="{int(h * 0.38)}" r="{int(h * 0.12)}" fill="{accent}"/>'
        for i, col in enumerate([far, mid, mix(accent, ink, 0.3)]):
            y = h * (0.55 + i * 0.13); d = f'M0 {y:.0f}'
            for x in range(0, w + 1, w // 6): d += f' Q{x + w / 12:.0f} {y - h * (0.05 + r.random() * 0.1):.0f} {x + w / 6:.0f} {y + (r.random() - 0.5) * h * 0.06:.0f}'
            b += f'<path d="{d} V{h} H0Z" fill="{col}"/>'
    elif kind == 1:   # blocks, like a poster
        for i in range(5):
            x, y = r.randint(0, w - 300), r.randint(0, h - 260)
            b += f'<rect x="{x}" y="{y}" width="{r.randint(200, 460)}" height="{r.randint(160, 360)}" fill="{[mid, far, accent, mix(accent, ink, 0.25), mix(bg, accent, 0.3)][i]}"/>'
    elif kind == 2:   # circles
        for i in range(6):
            b += f'<circle cx="{r.randint(0, w)}" cy="{r.randint(0, h)}" r="{r.randint(80, 260)}" fill="{[mid, far, accent, mix(accent, ink, 0.25), mix(bg, accent, 0.3), base][i]}"/>'
    else:   # a desk scene: a window and a table
        b += f'<rect x="{w * .12:.0f}" y="{h * .12:.0f}" width="{w * .34:.0f}" height="{h * .46:.0f}" fill="{far}"/><rect x="{w * .12:.0f}" y="{h * .12:.0f}" width="{w * .34:.0f}" height="{h * .46:.0f}" fill="none" stroke="{mid}" stroke-width="10"/>'
        b += f'<rect x="0" y="{h * .7:.0f}" width="{w}" height="{h * .3:.0f}" fill="{mid}"/><rect x="{w * .58:.0f}" y="{h * .42:.0f}" width="{w * .2:.0f}" height="{h * .28:.0f}" fill="{accent}"/><circle cx="{w * .68:.0f}" cy="{h * .34:.0f}" r="{h * .07:.0f}" fill="{mix(accent, ink, .3)}"/>'
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{b}</svg>'
    return 'data:image/svg+xml;utf8,' + urllib.parse.quote(svg, safe=' =:/,.-')

LOREM = re.compile(r'lorem|ipsum|dolor sit|consectetur|adipiscing|sed do eiusmod|aliquam|nullam|vestibulum|phasellus|praesent|etiam|magna|tempus|feugiat|sagittis|mauris|curabitur', re.I)
def unlorem(o, kind=''):
    if isinstance(o, list): return [unlorem(x, kind) for x in o]
    if isinstance(o, dict):
        out = {}
        for k, v in o.items():
            if isinstance(v, str) and LOREM.search(v):
                v = {'title': 'A clear heading', 'name': 'A name', 'q': 'A question people ask?', 'a': 'A short, honest answer.', 'quote': 'A real quote from a real customer goes here.', 'caption': '', 'label': 'Learn more', 'eyebrow': ''}.get(k, 'Say what this is about in a sentence or two: who it is for and why it helps.')
            out[k] = unlorem(v, kind)
        return out
    return o
GENERIC_NAME = re.compile(r'start ?bootstrap|company name|your (website|company|name)|tailwind ?toolbox|html5 ?up|^untitled|^home$|landing', re.I)

def pictures(cfg, seed, k):
    n = [0]
    def pic():
        n[0] += 1; return art(seed * 31 + n[0], k['bg'], k['accent'], k['ink'])
    for pg in cfg['pages']:
        for b in pg['blocks']:
            P = b['props']; t = b['type']
            if t in ('hero', 'image') and 'img' in P and not P.get('img') and (t == 'image' or b['variant'] in ('split', 'center', 'cover')): P['img'] = pic()
            if t == 'links' and not P.get('img'): P['img'] = art(seed * 7, k['bg'], k['accent'], k['ink'], 400, 400)
            if t == 'gallery':
                for x in P.get('items', []): x['img'] = x.get('img') or pic()
            if t == 'team':
                for x in P.get('items', []): x['img'] = x.get('img') or art(seed * 13 + n[0], k['bg'], k['accent'], k['ink'], 300, 300); n[0] += 1
            if t == 'features' and b['variant'] == 'alternating':
                for x in P.get('items', []): x['img'] = x.get('img') or pic()

def main():
    OUT.mkdir(exist_ok=True); (OUT / 'thumbs').mkdir(exist_ok=True)
    cat = []
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path='/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None, args=['--no-proxy-server', '--allow-file-access-from-files'])
        page = br.new_page(viewport={'width': 1280, 'height': 960})
        page.goto('about:blank'); page.add_script_tag(path=str(UI / 'sitecfg.js'))
        # 1. ours
        for tid in json.loads(page.evaluate('JSON.stringify(TribeSiteCfg.TEMPLATES)')):
            if ONLY and tid not in ONLY: continue
            d = json.loads((ROOT / 'templates' / 'sites' / tid / 'site.json').read_text()); m = d.get('meta', {})
            imgs = {}
            for f in (ROOT / 'templates' / 'sites' / tid / 'img').glob('*'):
                if f.stat().st_size < 400 * 1024 and f.suffix in ('.svg', '.png', '.jpg', '.webp'):
                    mime = {'.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp'}[f.suffix]
                    imgs['img/' + f.name] = f'data:{mime};base64,' + base64.b64encode(f.read_bytes()).decode()
            cfg = page.evaluate('([id, d, imgs]) => TribeSiteCfg.fromTemplate(id, d, r => imgs[String(r || "").replace(/^\\.\\//, "")] || "")', [tid, d, imgs])
            (OUT / f'{tid}.json').write_text(json.dumps(cfg, separators=(',', ':')))
            cat.append({'id': tid, 'title': m.get('title', tid), 'summary': m.get('summary', ''), 'category': NATIVE_CAT.get(tid, 'Business'), 'tags': m.get('tags', []), 'source': 'TribeCode', 'license': 'MIT', 'order': m.get('order', 50)})
        # 2. imported
        for i, t in enumerate(SOURCES['templates']):
            if ONLY and t['id'] not in ONLY: continue
            repo = SOURCES['repos'][t['src']]
            cands = [SRC / f"{t['src']}-{t['name']}" / repo['file'], SRC / f"{t['src']}-{t['name'].lower()}" / repo['file'], SRC / 'zce' / t['name'] / repo['file']]
            f = next((c for c in cands if c.exists()), None)
            if not f: print('missing source', t['id']); continue
            pg = br.new_page(viewport={'width': 1280, 'height': 960}); pg.route('http*://**', lambda r: r.abort())
            pg.goto(f.as_uri(), wait_until='domcontentloaded')
            pg.add_script_tag(path=str(UI / 'sitecfg.js')); pg.add_script_tag(path=str(UI / 'siteimport.js'))
            r = pg.evaluate('(name) => TribeSiteImport.fromDocument(document, { styles: false, name })', t['title']); pg.close()
            cfg = unlorem(r['cfg'])
            if GENERIC_NAME.search(cfg.get('name', '')): cfg['name'] = t['title']
            for b in cfg['pages'][0]['blocks']:
                P = b['props']
                if b['type'] in ('hero', 'links') and GENERIC_NAME.search(P.get('title', '') or P.get('name', '') or ''): P['title' if b['type'] == 'hero' else 'name'] = cfg['name']
                if b['type'] == 'footer': P['text'] = re.sub(r'start ?bootstrap|tailwind ?toolbox|html5 ?up|your website', cfg['name'], P.get('text', ''), flags=re.I)
            if t.get('replace'): cfg['pages'][0]['blocks'] = json.loads(json.dumps(t['replace']))
            BRANDY = re.compile(r'bootstrap|template|theme|html5 ?up|tailwind|creative commons|@ajlkn|fully responsive|free to use|licensed|download', re.I)
            def debrand(o):
                if isinstance(o, list): return [debrand(x) for x in o]
                if isinstance(o, dict): return {k: ('' if k in ('eyebrow', 'caption') else 'A clear heading' if k in ('title', 'name') else 'Say what this is about in a sentence or two: who it is for and why it helps.') if isinstance(v, str) and k not in ('img', 'alt', 'to', 'kind') and BRANDY.search(v) else debrand(v) for k, v in o.items()}
                return o
            cfg['pages'][0]['blocks'] = debrand(cfg['pages'][0]['blocks'])
            for b in cfg['pages'][0]['blocks'][:1]:
                if b['type'] == 'hero': b['props']['title'], b['props']['text'] = t['hero']
                if b['type'] == 'links': b['props']['name'], b['props']['bio'] = t['hero']
                if b['type'] == 'newsletter': b['props']['title'], b['props']['text'] = t['hero']
            if t.get('extra'):
                bl0 = cfg['pages'][0]['blocks']; fi = next((i for i, b in enumerate(bl0) if b['type'] == 'footer'), len(bl0))
                bl0[fi:fi] = json.loads(json.dumps(t['extra']))
            PH = 'Say what this is about in a sentence or two: who it is for and why it helps.'
            bl, seen = [], set()
            for b in cfg['pages'][0]['blocks']:   # drop empty or repeated placeholder sections (style guides, demo leftovers)
                P = b['props']; key = (b['type'], P.get('title', ''), P.get('text', ''))
                if b['type'] in ('text', 'cta', 'image') and (key in seen or (P.get('text', '') in ('', PH) and P.get('title', '') in ('', 'About', 'A clear heading'))): continue
                if b['type'] == 'contact' and any(x['type'] == 'contact' for x in bl): continue
                if b['type'] == 'footer' and any(x['type'] == 'footer' for x in bl): continue
                seen.add(key); bl.append(b)
            foot = [b for b in bl if b['type'] == 'footer']; bl = [b for b in bl if b['type'] != 'footer'][:9] + foot[:1]
            cfg['pages'][0]['blocks'] = bl
            k = {'bg': t['bg'], 'ink': t['ink'], 'accent': t['accent']}; dark = lum(k['bg']) < 0.2
            cfg['theme'] = {'preset': 'night' if dark else 'minimal', 'mode': 'dark' if dark else 'light', 'radius': 6,
                            'colors': {'bg': k['bg'], 'ink': k['ink'], 'muted': mix(k['ink'], k['bg'], 0.32), 'card': mix(k['bg'], '#FFFFFF' if dark else '#000000', 0.05), 'line': mix(k['bg'], '#FFFFFF' if dark else '#000000', 0.14), 'accent': k['accent']},
                            'fonts': {'display': t.get('display', 'Inter'), 'body': 'Inter'}}
            cfg['template'] = t['id']
            src_url = repo['url'].format(name=t['name'])
            if repo.get('credit'): cfg['credit'] = {'text': f"{t['title']} by HTML5 UP", 'url': src_url, 'license': repo['license']}
            pictures(cfg, i + 3, k)
            cfg = page.evaluate('c => TribeSiteCfg.autoWire(TribeSiteCfg.normalize(c), null, { quiet: true }).cfg', cfg)
            (OUT / f"{t['id']}.json").write_text(json.dumps(cfg, separators=(',', ':')))
            cat.append({'id': t['id'], 'title': t['title'], 'summary': t['summary'], 'category': t['category'], 'tags': t['tags'], 'source': repo['author'], 'sourceUrl': src_url, 'license': repo['license'], 'credit': bool(repo.get('credit')), 'order': 100 + i})
            print(t['id'], ' · '.join(r['report'])[:220])
        # 3. thumbnails
        if THUMBS:
            fonts = (UI / 'assets' / 'site-fonts').as_uri() + '/'
            for c in cat:
                cfg = json.loads((OUT / f"{c['id']}.json").read_text())
                html = page.evaluate('([c, f]) => TribeSiteCfg.render(c, { fonts: f, mode: "pages" })', [cfg, fonts])
                tp = br.new_page(viewport={'width': 1280, 'height': 960}); tp.route('http*://**', lambda r: r.abort())
                tmp = OUT / '_thumb.html'; tmp.write_text(html); tp.goto(tmp.as_uri()); tp.wait_for_timeout(250)
                png = tp.screenshot(); tp.close()
                im = Image.open(io.BytesIO(png)).convert('RGB').resize((480, 360), Image.LANCZOS)
                im.save(OUT / 'thumbs' / f"{c['id']}.webp", 'WEBP', quality=72, method=6)
            try: (OUT / '_thumb.html').unlink()
            except Exception: pass
        br.close()
    old = {}
    try: old = {x['id']: x for x in json.loads((OUT / 'catalog.json').read_text())['templates']}
    except Exception: pass
    have = {c['id'] for c in cat}
    cat += [x for i, x in old.items() if i not in have and (OUT / f'{i}.json').exists()]
    for c in cat: c['thumb'] = f"sitetpl/thumbs/{c['id']}.webp"
    cat.sort(key=lambda c: (ORDER.index(c['category']) if c['category'] in ORDER else 99, c.get('order', 99)))
    cats = [x for x in ORDER if any(c['category'] == x for c in cat)]
    (OUT / 'catalog.json').write_text(json.dumps({'about': 'Website templates for the designer (scripts/dev/site-gallery.py). Sources and licenses: docs/SITE-TEMPLATES.md.', 'categories': cats, 'templates': cat}, indent=1))
    print(f'{len(cat)} templates in {len(cats)} categories')

main()
