#!/usr/bin/env python3
"""Original soundtrack for promo/ad-launch.html ("Introducing TribeCode", 75 s). Everything is synthesized here with
numpy: no samples, no outside music. An unhurried, warm piece: soft pad chords, a plucked piano-like melody, gentle
percussion that enters when the tribe gathers (~21 s), tiny UI clicks on the cursor taps, soft chimes on the status
cards, and a resolve on the end card.

    python3 promo/sound/ad-launch-sound.py out.wav        # then: ffmpeg -i out.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 ...
"""
import sys, wave
import numpy as np

SR = 48000
DUR = 75.0
BPM = 84.0
BEAT = 60.0 / BPM
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def add(sig, t0, pan=0.0, gain=1.0):
    i = int(t0 * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan)); R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))
def env(n, a, d, s=0.0, r=0.0):
    a, r = int(a * SR), int(r * SR); out = np.ones(n)
    if a: out[:a] = np.linspace(0, 1, a)
    dec = np.exp(-np.arange(n - a) / (d * SR)) * (1 - s) + s
    out[a:] = dec
    if r: out[-r:] *= np.linspace(1, 0, r)
    return out
def lowpass(x, cut):
    a = np.exp(-2 * np.pi * cut / SR); y = np.empty_like(x); z = 0.0
    for i, v in enumerate(x): z = (1 - a) * v + a * z; y[i] = z
    return y

# --- harmony: F  Am  Bb  C  (I iii IV V), two beats... one chord per bar (4 beats) ---
BAR = 4 * BEAT
PROG = [[53, 57, 60, 65], [57, 60, 64, 69], [58, 62, 65, 70], [60, 64, 67, 72]]   # F, Am, Bb, C voicings
ROOT = [41, 45, 46, 48]
END_T = 71.4

def pad_chord(notes, t0, length):
    n = int(length * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for m in notes:
        f = mtof(m)
        for det in (-0.12, 0.12):
            ph = rng.random() * 6.28
            s += np.sin(2 * np.pi * f * (1 + det / 100) * t + ph) * 0.5 + 0.18 * np.sin(2 * np.pi * 2 * f * t + ph)
    s *= env(n, 1.2, 99, 1.0, 1.4) * 0.028
    add(s, t0, -0.25); add(s * 0.9, t0 + 0.012, 0.25)

def pluck(m, t0, gain=1.0, pan=0.0, dur=2.4):
    # Karplus-Strong, a soft piano-ish pluck
    f = mtof(m); n = int(dur * SR); p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p) * 0.5; buf = lowpass(np.concatenate([buf, buf]), 3000)[:p]
    out = np.empty(n); idx = 0
    for i in range(n):
        v = buf[idx]; nxt = buf[(idx + 1) % p]; buf[idx] = 0.4985 * (v + nxt); out[i] = v; idx = (idx + 1) % p
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2) * 0.35        # a sine body under it, warmer
    s = (out + body) * env(n, 0.004, 1.1, 0.0, 0.3)
    add(s, t0, pan, 0.16 * gain)

def bass(m, t0, length):
    n = int(length * SR); t = np.arange(n) / SR; f = mtof(m)
    s = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * env(n, 0.02, 0.9, 0.35, 0.3)
    add(s, t0, 0.0, 0.11)

def kick(t0, g=1.0):
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    add(np.sin(ph) * np.exp(-t * 9), t0, 0, 0.26 * g)
def shaker(t0, g=1.0):
    n = int(0.09 * SR); s = rng.uniform(-1, 1, n); s = s - lowpass(s, 5000)
    add(s * np.exp(-np.arange(n) / SR * 45), t0, 0.35, 0.05 * g)
def snap(t0, g=1.0):
    n = int(0.16 * SR); s = rng.uniform(-1, 1, n); s = lowpass(s, 3500) - lowpass(s, 900)
    add(s * np.exp(-np.arange(n) / SR * 30), t0, -0.2, 0.18 * g)
def click(t0):
    n = int(0.03 * SR); s = rng.uniform(-1, 1, n); s = s - lowpass(s, 2500)
    add(s * np.exp(-np.arange(n) / SR * 260), t0, 0.1, 0.22)
    n2 = int(0.05 * SR); t = np.arange(n2) / SR
    add(np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 120), t0, 0.1, 0.05)
def chime(t0, m=84):
    for j, mm in enumerate((m, m + 7, m + 12)):
        n = int(1.6 * SR); t = np.arange(n) / SR
        add(np.sin(2 * np.pi * mtof(mm) * t) * np.exp(-t * 3.2) * (1 - 0.25 * j), t0 + j * 0.07, 0.3 - 0.3 * j, 0.035)

# --- arrange ---
bars = int(END_T / BAR) + 1
MEL = [[72, None, 76, 77, None, 76, 72, None], [76, None, 72, 69, None, 72, None, None],
       [74, None, 77, 79, None, 77, 74, None], [76, None, 79, 81, None, 79, 76, None]]
for b in range(bars):
    t0 = b * BAR
    if t0 >= END_T: break
    c = b % 4
    length = min(BAR, END_T - t0) + 0.6
    pad_chord(PROG[c], t0, length)
    if t0 >= 3.0: bass(ROOT[c], t0, BAR * 0.95)
    if t0 >= 1.4:   # the melody enters once the prompt is being typed
        for s, m in enumerate(MEL[c]):
            if m is None: continue
            tt = t0 + s * BEAT / 2
            if tt < END_T - 0.2: pluck(m, tt, 1.0 if b > 2 else 0.7, pan=0.15 if s % 2 else -0.15)
    for beat in range(4):    # gentle percussion from ~21 s, fuller in the company section, out before the end card
        tt = t0 + beat * BEAT
        if 21.0 <= tt < END_T - 0.4:
            if beat in (0, 2): kick(tt, 0.85 if tt < 44 else 1.0)
            if beat in (1, 3) and tt >= 44: snap(tt, 0.8)
            for h in range(2): shaker(tt + h * BEAT / 2, 0.7 + 0.3 * (h == 0))

# end: resolve on F with a low root and a final pluck arpeggio
pad_chord([53, 57, 60, 65, 69], END_T, DUR - END_T)
bass(41, END_T, 3.6)
for j, m in enumerate((65, 69, 72, 77)): pluck(m, END_T + 0.25 + j * 0.22, 1.0, pan=-0.3 + 0.2 * j, dur=3.2)
kick(END_T, 0.8)

# UI sounds, in time with promo/ad-launch.html
for t in (1.1, 5.0, 27.5, 42.8): click(t)
for t in (6.0, 21.4, 44.4): chime(t)
chime(END_T + 0.1, 89)

# crackle of a small fire underneath the first status card (a nod to the tribe), very quiet
for i in range(140):
    t = 6.0 + rng.random() * 2.4
    n = int(0.006 * SR); add(rng.uniform(-1, 1, n) * np.exp(-np.arange(n) / SR * 900), t, rng.uniform(-.6, .6), 0.05)

# master: gentle fade in/out, soft clip
mix = np.stack([L, R], 1)
fi = int(0.6 * SR); mix[:fi] *= np.linspace(0, 1, fi)[:, None]
fo = int(2.4 * SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix /= max(1e-9, np.abs(mix).max()) / 0.89
out = sys.argv[1] if len(sys.argv) > 1 else 'ad-launch.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out, f'{DUR}s')
