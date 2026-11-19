"""Shared checker for every place TribeCode rings, spotlights or points at something (pass 6, e2e_demo_rings.py).

A ring passes only when, ~0.6 s after it appears (the layout has settled):
  - its target exists, is connected, has a size, is not visibility:hidden or opacity 0
  - the target is on screen (some of it inside the viewport)
  - nothing covers the target: elementFromPoint at the centre of its visible part is the target or inside it
    (the ring's own tip is lifted out of the way while checking; the lesson card and everything else count)
  - the ring still sits on the target (it did not stay behind when the layout moved)
  - the ring paints on top: elementFromPoint on the ring's border, with pointer events on for that instant, is the ring
"""

# For .fls-ring (Show me in quick guides, lessons and Flint's lesson cards). ring._el is the target (flintlessons.js).
FLS = r"""() => {
  const d = el => !el ? 'nothing' : (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
  const ring = document.querySelector('.fls-ring'); if (!ring) return 'no ring';
  const el = ring._el; if (!el) return 'ring has no target';
  return window.__ringJudge(el, ring, 4, d);
}"""

JUDGE = r"""() => { window.__ringJudge = (el, ring, pad, d) => {
  if (!el.isConnected) return 'the target left the page';
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  if (r.width < 2 || r.height < 2) return 'the target has no size: ' + d(el);
  if (cs.visibility === 'hidden' || +cs.opacity === 0) return 'the target is invisible: ' + d(el);
  const L = Math.max(0, r.left), T = Math.max(0, r.top), R = Math.min(innerWidth, r.right), B = Math.min(innerHeight, r.bottom);
  if (R - L < 2 || B - T < 2) return 'the target is off screen: ' + d(el) + ' at ' + [r.left, r.top].map(Math.round).join(',');
  const tips = [...document.querySelectorAll('.fls-tip, .fg-bubble, .fg-sprite, .dt-cursor, .dt-say, .dt-cap')], keep = tips.map(t => t.style.visibility);
  tips.forEach(t => t.style.visibility = 'hidden');
  const pts = [[(L + R) / 2, (T + B) / 2], [L + Math.min(8, (R - L) / 3), (T + B) / 2], [R - Math.min(8, (R - L) / 3), (T + B) / 2]];
  let hit = null, ok = false;
  for (const [x, y] of pts) { hit = document.elementFromPoint(x, y); if (hit && (hit === el || el.contains(hit))) { ok = true; break; } }
  tips.forEach((t, i) => t.style.visibility = keep[i]);
  if (!ok) return 'the target ' + d(el) + ' is covered by ' + d(hit);
  if (ring) {
    const q = ring.getBoundingClientRect();
    const off = Math.max(Math.abs(q.left - Math.max(4, r.left - pad)), Math.abs(q.top - Math.max(4, r.top - pad)), Math.abs(q.width - (r.width + 2 * pad)), Math.abs(q.height - (r.height + 2 * pad)));
    if (off > 8) return 'the ring is ' + Math.round(off) + 'px away from ' + d(el);
    const pe = ring.style.pointerEvents; ring.style.pointerEvents = 'auto';
    const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, q.left + 1)), Math.min(innerHeight - 1, Math.max(0, q.top + q.height / 2)));
    ring.style.pointerEvents = pe;
    if (top !== ring && !ring.contains(top)) return 'the ring around ' + d(el) + ' is painted under ' + d(top);
    const b = getComputedStyle(ring); if (parseFloat(b.borderTopWidth) < 1 && b.boxShadow === 'none' && b.outlineStyle === 'none') return 'the ring has no visible edge';
  }
  return 'ok';
}; }
"""


def judge_fls(pg, settle=600):
    """Wait for a .fls-ring, let the layout settle, and judge it. Returns 'ok' or what is wrong."""
    try: pg.wait_for_selector(".fls-ring", timeout=7000, state="attached")
    except Exception: return "no ring"
    pg.wait_for_timeout(settle)
    pg.evaluate(JUDGE)
    return pg.evaluate(FLS)
