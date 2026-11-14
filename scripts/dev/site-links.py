#!/usr/bin/env python3
"""Checks every link and button on the website (site/) the way Pages serves it: site/ at the root and app/ui at /app/.
Internal links must point at a file that exists, and #anchors at an id on that page. Download buttons must go to the
GitHub releases. External links are listed, not fetched (the sandbox can't reach most sites).
Usage: python3 scripts/dev/site-links.py   (exit 1 on a broken link)"""
import functools, http.server, os, sys, threading
from urllib.parse import urlparse, urljoin
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SITE, UI = os.path.join(ROOT, 'site'), os.path.join(ROOT, 'app', 'ui')
PORT = 5590 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PAGES = ['index.html', 'flint.html', 'docs.html', 'learn.html', 'mission.html', 'pricing.html', 'toolbox.html']

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def translate_path(self, path):
        p = urlparse(path).path
        if p.startswith('/app/'): return os.path.join(UI, p[5:]) if p != '/app/' else os.path.join(UI, 'index.html')
        return os.path.join(SITE, p.lstrip('/')) if p != '/' else os.path.join(SITE, 'index.html')

def local_file(path):
    if path.startswith('/app/') or path == '/app': rel = path[5:] or 'index.html'; base = UI
    else: rel = path.lstrip('/') or 'index.html'; base = SITE
    f = os.path.join(base, rel)
    if os.path.isdir(f): f = os.path.join(f, 'index.html')
    return f

def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    B = f'http://127.0.0.1:{PORT}'
    bad, ext, ids = [], set(), {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-proxy-server'])
        pg = b.new_page()
        for page in PAGES:
            pg.goto(f'{B}/{page}'); pg.wait_for_timeout(600)
            ids[page] = set(pg.evaluate("[...document.querySelectorAll('[id]')].map(e => e.id)"))
        for page in PAGES:
            pg.goto(f'{B}/{page}'); pg.wait_for_timeout(600)
            links = pg.evaluate("[...document.querySelectorAll('a[href]')].map(a => [a.getAttribute('href'), (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 40)])")
            for href, label in links:
                if href.startswith(('mailto:', 'tel:', 'javascript:')): continue
                u = urlparse(urljoin(f'{B}/{page}', href))
                if u.netloc and u.netloc != f'127.0.0.1:{PORT}':
                    ext.add(href)
                    if (label.lower() in ('download', 'download the desktop app', 'all downloads') or label.lower().startswith('download for')) and 'github.com/orionopenwow/TribeCode/releases' not in href: bad.append((page, href, label, 'download should go to the GitHub releases'))
                    continue
                f = local_file(u.path)
                if not os.path.exists(f): bad.append((page, href, label, 'no such file')); continue
                if u.fragment:
                    target = os.path.basename(f) if f.startswith(SITE) else None
                    if target in ids and u.fragment not in ids[target] and not u.fragment.startswith(('s=', 'c=')) and not (target == 'learn.html' and __import__('re').match(r'm\d+-\d+$', u.fragment)): bad.append((page, href, label, f'no #{u.fragment} on {target}'))
        b.close()
    srv.shutdown()
    print(f'{len(PAGES)} pages · {len(ext)} external links (not fetched)')
    for x in sorted(ext): print('   ', x)
    if bad:
        print(f'{len(bad)} broken:'); [print('  ', *x) for x in bad]; sys.exit(1)
    print('site-links: OK')

main()
