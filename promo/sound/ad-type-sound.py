#!/usr/bin/env python3
"""Original soundtrack for promo/ad-type.html (the 41-second type ad). Everything is synthesised here with numpy:
no samples, no outside music. 120 BPM, 48 kHz stereo. The hits line up with the page's timeline:

  0.35-1.75  five plucks as the intro words land
  2.0-2.75   a riser into the cut to Ember, an impact at 2.75
  3.0-38.0   a minimal beat: kick on every beat, clap on 2 and 4, soft hats, bass on Am-F-C-G, a quiet pad that ducks
             under the kick; a short chord stab on every word swap and every new exhibit (8, 13, 18, 23, 28, 33 s), a clap
             roll into each exhibit, a busier hat in the second half, and small blips on what happens inside each exhibit
  37.0-37.75 a second riser, then one big chord at 38.0 that rings out to the end (41.0)

Usage: python3 promo/sound/ad-type-sound.py out.wav    (then loudnorm with ffmpeg to about -16 LUFS)
"""
import sys
import wave
import numpy as np
from scipy.signal import lfilter

SR = 48000
D = 41.0
N = int(SR * D)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def t_(dur): return np.arange(int(SR * dur)) / SR

def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))

def env(n, a=0.005, d=0.2, s=0.0, r=0.0, hold=0.0):
    """attack, decay to sustain, hold, release (seconds) -> array of length n samples"""
    out = np.zeros(n); x = np.arange(n) / SR
    out = np.where(x < a, x / max(a, 1e-6), 0)
    dec = (x >= a) & (x < a + d)
    out = np.where(dec, 1 - (1 - s) * (x - a) / max(d, 1e-6), out)
    sus = (x >= a + d) & (x < a + d + hold)
    out = np.where(sus, s, out)
    rel = x >= a + d + hold
    out = np.where(rel, s * np.exp(-(x - a - d - hold) / max(r, 1e-6)) if r else 0, out)
    return out

def note(m): return 440.0 * 2 ** ((m - 69) / 12)

def lowpass(x, cutoff):
    # one-pole low-pass (scipy's lfilter); a swept cutoff is applied in 256-sample blocks with the filter state carried over
    if np.ndim(cutoff) == 0:
        a = np.exp(-2 * np.pi * float(cutoff) / SR)
        return lfilter([1 - a], [1, -a], x)
    c = np.asarray(cutoff, float); y = np.zeros_like(x); zi = np.zeros(1)
    for s in range(0, len(x), 256):
        a = np.exp(-2 * np.pi * c[min(s + 128, len(c) - 1)] / SR)
        y[s:s + 256], zi = lfilter([1 - a], [1, -a], x[s:s + 256], zi=zi * 1.0)
    return y

def saw(f, dur):
    tt = t_(dur); ph = (f * tt) % 1.0
    return 2 * ph - 1

def tri(f, dur):
    return 2 * np.abs(saw(f, dur)) - 1

# ---------- instruments ----------
def kick(gain=1.0):
    tt = t_(0.45)
    f = 45 + 110 * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-tt * 7.5)
    click = rng.standard_normal(len(tt)) * np.exp(-tt * 300) * 0.25
    return (body + click) * gain

def clap():
    tt = t_(0.3); n = rng.standard_normal(len(tt))
    e = np.zeros(len(tt))
    for off in (0, 0.011, 0.022):              # three quick hits, like hands
        e += np.where(tt >= off, np.exp(-(tt - off) * 60), 0)
    e += np.where(tt >= 0.03, np.exp(-(tt - 0.03) * 14) * 0.6, 0)
    bp = n - lowpass(n, 900); bp = lowpass(bp, 5200)
    return bp * e * 0.9

def hat(open_=False):
    tt = t_(0.18 if open_ else 0.06); n = rng.standard_normal(len(tt))
    hp = n - lowpass(n, 7000)
    return hp * np.exp(-tt * (18 if open_ else 70)) * 0.35

def snap():
    tt = t_(0.12); n = rng.standard_normal(len(tt))
    hp = n - lowpass(n, 2500)
    return lowpass(hp, 9000) * np.exp(-tt * 55) * 0.6

def pluck(m, dur=0.6):
    tt = t_(dur); f = note(m)
    x = 0.6 * tri(f, dur) + 0.4 * np.sin(2 * np.pi * 2 * f * tt) * 0.3
    x = lowpass(x, 1800 + 3000 * np.exp(-tt * 9))
    return x * np.exp(-tt * 5.5)

def stab(chord, dur=0.42):
    tt = t_(dur); x = np.zeros(len(tt))
    for m in chord:
        for det in (-0.08, 0.08):
            x += saw(note(m + det), dur)
    x /= len(chord) * 2
    x = lowpass(x, 600 + 4200 * np.exp(-tt * 14))
    return x * env(len(tt), a=0.004, d=0.32, s=0.0) * 1.1

def bass(m, dur):
    tt = t_(dur); f = note(m)
    x = 0.7 * np.sin(2 * np.pi * f * tt) + 0.3 * lowpass(saw(f, dur), 500)
    return x * env(len(tt), a=0.006, d=0.12, s=0.7, hold=max(0, dur - 0.2), r=0.05)

def pad(chord, dur):
    tt = t_(dur); x = np.zeros(len(tt))
    for m in chord:
        for det in (-0.12, 0.0, 0.12):
            x += tri(note(m + det), dur)
    x /= len(chord) * 3
    x = lowpass(x, 1400)
    a = min(0.4, dur / 3)
    e = np.minimum(1, tt / a) * np.minimum(1, (dur - tt) / a)
    return x * e

def riser(dur):
    tt = t_(dur); n = rng.standard_normal(len(tt))
    sweep = 300 + 7000 * (tt / dur) ** 2
    x = lowpass(n, sweep) * (tt / dur) ** 2
    f = 220 * 2 ** (2 * tt / dur)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (tt / dur) ** 3 * 0.25
    return x * 0.5 + tone

def impact():
    tt = t_(1.6)
    sub = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-tt * 10)) / SR) * np.exp(-tt * 3.2)
    n = rng.standard_normal(len(tt)); noise = lowpass(n, 6000) * np.exp(-tt * 4.5) * 0.35
    return sub + noise

def whoosh(dur=0.4):
    tt = t_(dur); n = rng.standard_normal(len(tt))
    x = lowpass(n, 400 + 3000 * np.sin(np.pi * tt / dur)) * np.sin(np.pi * tt / dur) ** 2
    return x * 0.35

def blip(m):
    tt = t_(0.14)
    return np.sin(2 * np.pi * note(m) * tt) * np.exp(-tt * 30) * 0.5

# ---------- arrangement (times match promo/ad-type.html) ----------
BEAT = 0.5
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]   # Am F C G (one per bar of 2 s)
ROOTS = [45, 41, 36, 43]
def chord_at(t): return CHORDS[int(max(0, t - 3.0) // 2) % 4]
def root_at(t): return ROOTS[int(max(0, t - 3.0) // 2) % 4]

# intro: plucks + snaps on the words
for i, (at, m) in enumerate(zip([.35, .7, 1.05, 1.4, 1.75], [69, 72, 76, 79, 81])):
    add(pluck(m), at, 0.42, pan=-0.3 + 0.15 * i)
    add(snap(), at, 0.35)
add(pad([57, 64, 69], 2.6), 0.2, 0.12)
add(riser(0.75), 2.0, 0.55)
add(impact(), 2.75, 0.9)
add(stab([57, 60, 64, 69]), 2.75, 0.55)
add(whoosh(0.45), 3.95, 0.8)          # the logo moves up

# the beat: 3.0 -> END, with a half-beat drop at 7.5 (the cut to the features) and a clap roll into every new exhibit
END = 38.0
FEATS = [8.0, 13.0, 18.0, 23.0, 28.0, 33.0]
def gap(x): return 7.5 <= x < 8.0
kick_times = [3.0 + i * BEAT for i in range(int((END - 3.0) / BEAT))]
kick_times = [x for x in kick_times if not gap(x)]
for x in kick_times: add(kick(), x, 0.95)
for i in range(int((END - 4.5) / BEAT)):
    x = 4.5 + i * BEAT
    if gap(x): continue
    if i % 2 == 1: add(clap(), x, 0.45, pan=0.05)
for f in FEATS[1:]:                              # 16th-note clap roll in the half beat before each exhibit
    for j in range(4): add(clap(), f - 0.5 + j * BEAT / 4, 0.12 + 0.07 * j, pan=-0.1)
for i in range(int((END - 4.5) / (BEAT / 2))):
    x = 4.5 + i * BEAT / 2
    if gap(x): continue
    late = x >= 23.0                              # the second half gets a busier hat
    add(hat(open_=(i % 4 == 2)), x, 0.26 if i % 2 else 0.16, pan=0.35)
    if late and i % 2: add(hat(), x + BEAT / 4, 0.1, pan=0.4)
# bass: 8ths on the root with an octave pop on the off-beat of beat 4
for i in range(int((END - 3.0) / (BEAT / 2))):
    x = 3.0 + i * BEAT / 2
    if gap(x): continue
    m = root_at(x) + (12 if i % 8 == 7 else 0)
    add(bass(m, BEAT / 2 * 0.9), x, 0.42)
# pad per bar
for b in range(int((END - 3.0) / 2) + 1):
    x = 3.0 + b * 2
    add(pad([c + 12 for c in CHORDS[b % 4]], min(2.0, END - x)), x, 0.09, pan=-0.2) if END - x > 0.3 else None

# stabs on every word swap and every new exhibit (and the Claude/Codex/Gemini swaps)
for x in [4.5, 5.25, 6.0, 6.75]:
    add(stab([c + 12 for c in chord_at(x)]), x, 0.5, pan=0.15)
for x in FEATS:
    add(stab([c + 12 for c in chord_at(x)] + [chord_at(x)[0] + 24]), x, 0.55)
    add(whoosh(0.3), x - 0.3, 0.5)
for x, m in [(16.5, 76), (17.1, 79)]:
    add(stab([c + 12 for c in chord_at(x)]), x, 0.4, pan=-0.15)
    add(blip(m + 12), x, 0.25)
# small UI blips on what happens inside each exhibit (messages land, tools run, cards drop, approve, the app opens)
BLIPS = [(8.3, 84), (9.1, 88), (10.1, 86), (10.55, 88), (11.0, 91), (11.6, 84), (12.2, 93),          # chat
         (13.5, 84), (15.3, 91), (15.9, 88),                                                            # connect your AI
         (18.8, 84), (18.95, 86), (19.1, 88), (19.25, 91), (19.7, 84), (20.8, 86), (21.7, 93), (22.1, 88),  # preview
         (23.6, 84), (24.5, 88), (25.8, 91), (26.2, 86), (26.6, 84),                                    # docs, board, whiteboard
         (28.3, 81), (28.7, 84), (29.1, 86), (29.5, 88), (30.0, 84), (30.4, 86), (30.9, 88), (31.95, 93), (32.4, 88),  # company
         (33.2, 84), (34.0, 91), (34.3, 84), (36.1, 93), (36.4, 88)]                                    # open source
for x, m in BLIPS: add(blip(m), x, 0.18, pan=0.25)
add(whoosh(0.8), 25.0, 0.45)                     # the task card is dragged to Done

# outro: riser, then one big chord that rings to the end
add(riser(0.75), END - 1.0, 0.5)
add(impact(), END, 0.6)
final = [45, 57, 60, 64, 67, 71]               # A minor 9: warm, settled
add(pad(final, 2.4), END, 0.32)
add(stab([60, 64, 67, 72]), END, 0.6)
add(pluck(81, 1.6), END + 0.25, 0.3)
add(blip(93), END + 1.6, 0.25)                   # the wordmark tucks back

# ---------- mix: kick ducks the pad and bass a little, simple stereo echo, soft clip, fades ----------
duck = np.ones(N)
for x in kick_times:
    i = int(x * SR); n = int(0.22 * SR)
    seg = 1 - 0.35 * np.exp(-np.arange(n) / SR * 14)
    duck[i:i + n] = np.minimum(duck[i:i + n], seg[: max(0, min(n, N - i))])
L *= duck; R *= duck
for ch, dly in ((L, 0.375), (R, 0.25)):         # dotted-8th / 8th echo, low and dark
    d = int(dly * SR); echo = np.zeros(N); echo[d:] = ch[:-d] * 0.18
    ch += lowpass(echo, 2500)
fade_in = np.minimum(1, np.arange(N) / (0.03 * SR))
fade_out = np.clip((D - np.arange(N) / SR) / 1.2, 0, 1)
L *= fade_in * fade_out; R *= fade_in * fade_out
peak = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / peak * 1.4) / np.tanh(1.4) * 0.89
R = np.tanh(R / peak * 1.4) / np.tanh(1.4) * 0.89

out = sys.argv[1] if len(sys.argv) > 1 else 'ad-type.wav'
pcm = (np.stack([L, R], axis=1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', out, f'{D}s', SR, 'Hz')
