"""A tiny local stand-in for the Openverse API (and Wikimedia Commons) so tests never touch the real network.
start(port) -> the server; its base URL goes in TRIBE_OPENVERSE_URL / TRIBE_WIKIMEDIA_URL, and "localhost:<port>" in
TRIBE_TEST_EMBED_ALLOW. Images are solid-color PNGs made here; sounds are short WAV tones."""
import io, json, math, struct, threading, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

IMAGES = [  # id, title, creator, license, version, color (rgb)
    ("img-violet-0001", "Violet dusk over the bay", "Ana Ruiz", "by", "4.0", (124, 58, 237)),
    ("img-ember-0002", "Campfire sparks", "Kofi Mensah", "by-sa", "4.0", (242, 107, 29)),
    ("img-teal-0003", "Teal lagoon", "Mia Chen", "cc0", "1.0", (56, 198, 177)),
]
SOUNDS = [("snd-coin-0001", "Coin pickup blip", "Leo Park", "cc0", "1.0", 880), ("snd-wind-0002", "Soft wind loop", "Sara Okafor", "by", "4.0", 220)]
hits = []


def png(rgb, w=96, h=64):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def wav(freq, secs=0.4, rate=8000):
    n = int(secs * rate); data = b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * freq * i / rate))) for i in range(n))
    return b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", len(data)) + data


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def out(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)): body = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query); base = f"http://localhost:{self.server.server_port}"; hits.append(self.path)
        def img(x):
            i, t, c, l, v, rgb = x
            return {"id": i, "title": t, "creator": c, "creator_url": f"https://example.org/{c.split()[0].lower()}", "license": l, "license_version": v, "license_url": f"https://creativecommons.org/licenses/{l}/{v}/",
                    "foreign_landing_url": f"https://example.org/photo/{i}", "attribution": f'"{t}" by {c} is licensed under CC {l.upper()} {v}.', "thumbnail": f"{base}/thumb/{i}.png", "url": f"{base}/thumb/{i}.png",
                    "source": "flickr", "provider": "flickr", "width": 96, "height": 64}
        def snd(x):
            i, t, c, l, v, f = x
            return {"id": i, "title": t, "creator": c, "creator_url": "", "license": l, "license_version": v, "license_url": f"https://creativecommons.org/licenses/{l}/{v}/",
                    "foreign_landing_url": f"https://example.org/sound/{i}", "attribution": f'"{t}" by {c} is licensed under CC {l.upper()} {v}.', "url": f"{base}/audio/{i}.wav", "thumbnail": None,
                    "duration": 400, "filetype": "wav", "source": "freesound", "provider": "freesound"}
        if u.path in ("/v1/images/", "/v1/images"):
            term = (q.get("q") or [""])[0].lower()
            res = [img(x) for x in IMAGES if not term or any(w in x[1].lower() for w in term.split())] or [img(x) for x in IMAGES]
            return self.out(200, {"result_count": len(res), "page_count": 1, "results": res})
        if u.path in ("/v1/audio/", "/v1/audio"):
            return self.out(200, {"result_count": len(SOUNDS), "page_count": 1, "results": [snd(x) for x in SOUNDS]})
        if u.path.startswith("/v1/images/"):
            i = u.path.split("/")[3]; x = next((x for x in IMAGES if x[0] == i), None)
            return self.out(200, img(x)) if x else self.out(404, {"detail": "not found"})
        if u.path.startswith("/thumb/"):
            i = u.path.split("/")[2].replace(".png", ""); x = next((x for x in IMAGES if x[0] == i), None)
            return self.out(200, png(x[5]), "image/png") if x else self.out(404, b"no", "text/plain")
        if u.path.startswith("/audio/"):
            i = u.path.split("/")[2].replace(".wav", ""); x = next((x for x in SOUNDS if x[0] == i), None)
            return self.out(200, wav(x[5]), "audio/wav") if x else self.out(404, b"no", "text/plain")
        if u.path == "/w/api.php":
            pages = {str(100 + k): {"pageid": 100 + k, "index": k, "title": f"File:{x[1]}.png", "imageinfo": [{"thumburl": f"{base}/thumb/{x[0]}.png", "url": f"{base}/thumb/{x[0]}.png", "descriptionurl": f"https://commons.example/{x[0]}", "width": 96, "height": 64,
                     "extmetadata": {"LicenseShortName": {"value": "CC BY-SA 4.0"}, "Artist": {"value": f"<a href='x'>{x[2]}</a>"}, "ObjectName": {"value": x[1]}, "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0"}}}]} for k, x in enumerate(IMAGES)}
            return self.out(200, {"query": {"pages": pages}})
        self.out(404, {"detail": "not found"})


def start(port):
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv
