#!/usr/bin/env python3
"""Small JPEG copies of the website template thumbnails (templates/sites/<id>/thumb.png) for the offline demo's
template gallery (app/ui/demo/sites/) and the website's "Websites" tab (site/assets/sites/).
Run after scripts/dev/demo-data.js:  python3 scripts/dev/demo-thumbs.py"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LIB = os.path.join(ROOT, 'templates', 'sites')
OUTS = [os.path.join(ROOT, 'app', 'ui', 'demo', 'sites'), os.path.join(ROOT, 'site', 'assets', 'sites')]
for o in OUTS:
    os.makedirs(o, exist_ok=True)
n = 0
for tid in sorted(os.listdir(LIB)):
    src = os.path.join(LIB, tid, 'thumb.png')
    if tid.startswith(('_', '.')) or not os.path.isfile(src):
        continue
    im = Image.open(src).convert('RGB')
    im.thumbnail((640, 400), Image.LANCZOS)
    for o in OUTS:
        im.save(os.path.join(o, tid + '.jpg'), 'JPEG', quality=80, optimize=True, progressive=True)
    n += 1
print(f'{n} thumbnails -> app/ui/demo/sites/ and site/assets/sites/')
